// Toda la mecánica git del CLI. Reglas (ADR-0004):
// - un worktree nuevo desde origin/<rama> en cada operación: nunca se reutiliza un estado a medias;
// - CAS por ruta: si otra persona cambió la misma ruta, se aborta (no se resuelven conflictos);
// - rechazo por desfase → rebase de nuestro commit y reintento acotado; 401/403 → se para;
// - nunca --force, nunca reset sobre trabajo ajeno.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { CONTENT_DIR, CliError, EXIT, HOME, jitter, readUserConfig, sleep } from "./util.mjs";

export function git(args, { cwd = CONTENT_DIR, allowFail = false } = {}) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } });
  if (r.status !== 0 && !allowFail) {
    const out = `${r.stderr || ""}${r.stdout || ""}`.trim();
    throw new CliError(classify(out), `git ${args[0]} falló: ${out.split("\n").slice(-3).join(" ")}`, { git: out });
  }
  return { ok: r.status === 0, out: (r.stdout || "").trim(), err: (r.stderr || "").trim() };
}

function classify(out) {
  if (/(403|401|Authentication failed|Permission denied|could not read Username|access denied|not authorized)/i.test(out)) return EXIT.AUTH;
  return EXIT.GIT;
}

const isNonFastForward = (out) => /(non-fast-forward|fetch first|\[rejected\]|failed to push some refs|Updates were rejected)/i.test(out);

export async function remoteUrl() {
  const cfg = await readUserConfig();
  if (!cfg.remote) throw new CliError(EXIT.USAGE, "No hay remoto configurado. Ejecuta: archidocs init --remote <url-del-repo>");
  return cfg.remote;
}

// Clon local usado solo como fuente de worktrees; su propio árbol de trabajo no se toca.
export async function ensureCheckout() {
  const remote = await remoteUrl();
  await mkdir(HOME, { recursive: true });
  if (!existsSync(join(CONTENT_DIR, ".git"))) {
    git(["clone", "--quiet", remote, CONTENT_DIR], { cwd: HOME });
  } else {
    git(["remote", "set-url", "origin", remote]);
  }
  git(["worktree", "prune"]);
  git(["fetch", "--quiet", "--prune", "origin"]);
  return CONTENT_DIR;
}

// Sin dir: la versión publicada (origin), no el árbol del clon, que nunca se actualiza.
export async function instanceConfig(dir) {
  try {
    if (dir) return JSON.parse(await readFile(join(dir, "archidocs.config.json"), "utf8"));
    for (const ref of ["origin/HEAD", "origin/main"]) {
      const r = git(["show", `${ref}:archidocs.config.json`], { allowFail: true });
      if (r.ok) return JSON.parse(r.out);
    }
    throw new Error("sin archidocs.config.json en origin");
  } catch {
    return { branch: "main", sites: {}, allow_public: false };
  }
}

export async function withWorktree(fn) {
  await ensureCheckout();
  const cfg = await instanceConfig();
  const branch = cfg.branch || "main";
  const wt = await mkdtemp(join(HOME, "wt-"));
  git(["worktree", "add", "--quiet", "--detach", wt, `origin/${branch}`]);
  try {
    return await fn({ wt, branch, base: git(["rev-parse", "HEAD"], { cwd: wt }).out, cfg: await instanceConfig(wt) });
  } finally {
    git(["worktree", "remove", "--force", wt], { allowFail: true });
  }
}

export function lastCommitFor(ref, path, cwd = CONTENT_DIR) {
  return git(["log", "-1", "--format=%H", ref, "--", path], { cwd, allowFail: true }).out || null;
}

// Commit de las rutas indicadas y push con reintentos. watch: rutas cuyo cambio ajeno aborta (CAS).
export async function commitAndPush({ wt, branch, base, paths, watch, message }) {
  git(["add", "--all", "--", ...paths], { cwd: wt });
  if (git(["diff", "--cached", "--quiet"], { cwd: wt, allowFail: true }).ok) return { sha: base, changed: false, attempts: 0 };
  git(["commit", "--quiet", "-m", message], { cwd: wt });

  let attempts = 0;
  for (;;) {
    attempts++;
    const push = git(["push", "--porcelain", "origin", `HEAD:refs/heads/${branch}`], { cwd: wt, allowFail: true });
    if (push.ok) return { sha: git(["rev-parse", "HEAD"], { cwd: wt }).out, changed: true, attempts };

    const out = `${push.err}\n${push.out}`;
    if (classify(out) === EXIT.AUTH) {
      throw new CliError(EXIT.AUTH, "Sin permiso para publicar en el repo (credenciales caducadas, sin acceso o bloqueadas por política). Revisa tu login de git; no se reintenta.", { git: out });
    }
    if (!isNonFastForward(out) || attempts >= 4) {
      throw new CliError(EXIT.GIT, `No se pudo hacer push tras ${attempts} intento(s): ${out.split("\n").slice(-2).join(" ")}`, { git: out });
    }

    git(["fetch", "--quiet", "origin"], { cwd: wt });
    const theirs = git(["log", "--format=%h %an %s", `${base}..origin/${branch}`, "--", ...watch], { cwd: wt }).out;
    if (theirs) {
      throw new CliError(EXIT.CONFLICT, "Otra persona cambió esta misma ruta mientras publicabas. No se sobrescribe: descarga la versión actual (archidocs get) y vuelve a aplicar tus cambios.", { theirs: theirs.split("\n") });
    }
    const rebase = git(["rebase", "--quiet", `origin/${branch}`], { cwd: wt, allowFail: true });
    if (!rebase.ok) {
      git(["rebase", "--abort"], { cwd: wt, allowFail: true });
      throw new CliError(EXIT.CONFLICT, "El rebase sobre la versión remota tuvo conflictos; no se resuelven automáticamente.", { git: rebase.err });
    }
    base = git(["rev-parse", `origin/${branch}`], { cwd: wt }).out;
    await sleep(jitter(1000 * attempts));
  }
}

// ¿El commit `ours` ya está incluido en `deployed`?
export function isIncluded(ours, deployed) {
  if (!deployed || deployed === "unknown") return false;
  if (deployed === ours) return true;
  git(["fetch", "--quiet", "origin"], { allowFail: true });
  return git(["merge-base", "--is-ancestor", ours, deployed], { allowFail: true }).ok;
}

export async function repoVisibility(remote) {
  const m = remote.match(/github\.com[:/]([^/]+)\/(.+?)(\.git)?$/);
  if (!m) return "unknown";
  try {
    const res = await fetch(`https://api.github.com/repos/${m[1]}/${m[2]}`, { headers: { "User-Agent": "archidocs-cli" }, signal: AbortSignal.timeout(5000) });
    if (res.status === 404) return "private-or-missing";
    if (!res.ok) return "unknown";
    return (await res.json()).private ? "private" : "public";
  } catch {
    return "unknown";
  }
}

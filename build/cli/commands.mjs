// Comandos del CLI archidocs. Cada comando devuelve un objeto; main lo imprime como texto o JSON.
import { existsSync } from "node:fs";
import { copyFile, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { stringify as toYaml } from "yaml";
import { loadStandard, scanContent, splitFrontmatter } from "../lib/content.mjs";
import { fidelity, fillMeta, formatOf, readMeta, validateArtifact, writeHtmlMeta, writeMarkdown } from "./artifact.mjs";
import {
  commitAndPush, ensureCheckout, git, instanceConfig, isIncluded, lastCommitFor, remoteUrl, repoVisibility, withWorktree,
} from "./gitops.mjs";
import {
  CONFIG_FILE, CONTENT_DIR, CliError, EXIT, HOME, LOG_FILE, checkPath, gitUserName, logEvent, readUserConfig, sleep,
  slugFromTitle, today, writeUserConfig,
} from "./util.mjs";

const CODE_ROOT = new URL("../../", import.meta.url).pathname;

function siteUrls(cfg, path) {
  const out = {};
  for (const [name, base] of Object.entries(cfg.sites || {})) out[name] = `${base.replace(/\/+$/, "")}/${path ? `${path}/` : ""}`;
  return out;
}

// ---------- init / doctor ----------

export async function init(opts) {
  if (!opts.remote) throw new CliError(EXIT.USAGE, "Uso: archidocs init --remote <url-del-repo>");
  const cfg = { ...(await readUserConfig()), remote: opts.remote };
  await writeUserConfig(cfg);
  await ensureCheckout();
  return { message: `Configurado. Remoto: ${cfg.remote}\nConfig: ${CONFIG_FILE}\nClon de contenido: ${CONTENT_DIR}`, config: cfg };
}

export async function doctor() {
  const checks = [];
  const add = (name, ok, detail) => checks.push({ name, ok, detail });
  const major = Number(process.versions.node.split(".")[0]);
  add("Node ≥ 18", major >= 18, process.versions.node);
  const g = spawnSync("git", ["--version"], { encoding: "utf8" });
  add("git", g.status === 0, (g.stdout || "").trim());
  const ucfg = await readUserConfig();
  add("Configuración de usuario", !!ucfg.remote, ucfg.remote ? `${CONFIG_FILE} → ${ucfg.remote}` : `falta; ejecuta archidocs init --remote <url>`);
  const onPath = spawnSync("sh", ["-c", "command -v archidocs"], { encoding: "utf8" });
  add("archidocs en el PATH", onPath.status === 0, (onPath.stdout || "").trim() || "no; ejecuta install.sh");

  if (ucfg.remote) {
    const ls = spawnSync("git", ["ls-remote", "--heads", ucfg.remote], { encoding: "utf8", env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } });
    add("Acceso al remoto", ls.status === 0, ls.status === 0 ? "ok" : (ls.stderr || "").trim().split("\n").pop());
    if (ls.status === 0) {
      try {
        await ensureCheckout();
        add("Clon de contenido", true, CONTENT_DIR);
        const stray = (await readdir(HOME)).filter((n) => n.startsWith("wt-"));
        add("Worktrees huérfanos", stray.length === 0, stray.length ? `${stray.length} en ${HOME} (restos de una publicación interrumpida; se pueden borrar)` : "ninguno");
        const cfg = await instanceConfig();
        const head = git(["rev-parse", `origin/${cfg.branch || "main"}`]).out;
        for (const [name, base] of Object.entries(cfg.sites || {})) {
          try {
            const res = await fetch(`${base.replace(/\/+$/, "")}/build.json`, { signal: AbortSignal.timeout(8000) });
            const info = res.ok ? await res.json() : null;
            const ok = !!info && isIncluded(head, info.sha);
            add(`Sitio ${name}`, ok, info ? `build ${String(info.sha).slice(0, 7)} · main ${head.slice(0, 7)}${ok ? "" : " (desactualizado o en despliegue)"}` : `HTTP ${res.status}`);
          } catch (err) {
            add(`Sitio ${name}`, false, err.message);
          }
        }
      } catch (err) {
        add("Clon de contenido", false, err.message);
      }
    }
  }

  for (const dir of [join(homedir(), ".agents", "skills"), join(homedir(), ".claude", "skills")]) {
    const linked = ["archidocs-write", "archidocs-publish", "archidocs-manage"].filter((s) => existsSync(join(dir, s, "SKILL.md")));
    add(`Skills en ${dir.replace(homedir(), "~")}`, linked.length === 3, linked.length ? linked.join(", ") : "no instaladas");
  }
  return { checks, ok: checks.every((c) => c.ok) };
}

// ---------- estándar y plantillas (leídos de la versión publicada del repo) ----------

async function contentRoot() {
  await ensureCheckout();
  const cfg = await instanceConfig();
  return { cfg, ref: `origin/${cfg.branch || "main"}` };
}

function showFile(ref, path) {
  const r = git(["show", `${ref}:${path}`], { allowFail: true });
  if (!r.ok) throw new CliError(EXIT.USAGE, `No existe ${path} en ${ref}`);
  return r.out + "\n";
}

export async function standard() {
  const { ref } = await contentRoot();
  return { text: showFile(ref, "standard/STANDARD.md") };
}

export async function template(opts, [type]) {
  if (!type) throw new CliError(EXIT.USAGE, "Uso: archidocs template <tipo> [--format md|html]");
  const { ref } = await contentRoot();
  const format = opts.format || "md";
  return { text: showFile(ref, `standard/templates/${type}.${format}`) };
}

// ---------- módulos ----------

async function contentSnapshot(dir) {
  const standardDef = await loadStandard(dir);
  return { standardDef, content: await scanContent(dir, standardDef) };
}

function moduleTree(mod) {
  return {
    path: mod.path,
    title: mod.title,
    description: mod.meta.description || "",
    includes: [].concat(mod.meta.includes || []),
    excludes: [].concat(mod.meta.excludes || []),
    artifacts: mod.artifacts.map((a) => ({ path: a.path, type: a.meta.type, title: a.meta.title })),
    children: mod.children.map(moduleTree),
  };
}

export async function modules() {
  return withWorktree(async ({ wt }) => {
    const { content } = await contentSnapshot(wt);
    const tree = content.root.children.map(moduleTree);
    const lines = [];
    const walk = (nodes, depth) => {
      for (const n of nodes) {
        lines.push(`${"  ".repeat(depth)}${n.path}  —  ${n.title}${n.description ? `: ${n.description}` : ""} (${n.artifacts.length})`);
        walk(n.children, depth + 1);
      }
    };
    walk(tree, 0);
    return { modules: tree, text: lines.join("\n") || "(sin módulos)" };
  });
}

function readmeFor(meta, body) {
  const clean = Object.fromEntries(Object.entries(meta).filter(([, v]) => v !== undefined && !(Array.isArray(v) && !v.length)));
  return `---\n${toYaml(clean, { lineWidth: 0 }).trimEnd()}\n---\n${body ? `\n${body.trim()}\n` : ""}`;
}

export async function moduleCreate(opts, [rawPath]) {
  const path = checkPath(rawPath, "ruta del módulo");
  if (!opts.title || !opts.description) throw new CliError(EXIT.USAGE, "Uso: archidocs module create <ruta> --title <t> --description <d> [--include x]... [--exclude x]... [--owner o] [--body texto]");
  return withWorktree(async ({ wt, branch, base, cfg }) => {
    const dir = join(wt, "artifacts", path);
    if (existsSync(join(dir, "README.md"))) throw new CliError(EXIT.MODULE, `El módulo ${path} ya existe`);
    if (existsSync(join(dir, "index.md")) || existsSync(join(dir, "index.html"))) throw new CliError(EXIT.MODULE, `${path} es un artifact, no un módulo`);
    const parent = path.split("/").slice(0, -1).join("/");
    if (parent && !existsSync(join(wt, "artifacts", parent, "README.md"))) {
      throw new CliError(EXIT.MODULE, `El módulo padre ${parent} no existe; créalo primero`);
    }
    await mkdir(dir, { recursive: true });
    const meta = {
      title: opts.title,
      description: opts.description,
      includes: [].concat(opts.include || []),
      excludes: [].concat(opts.exclude || []),
      owners: [].concat(opts.owner || gitUserName() || []),
    };
    await writeFile(join(dir, "README.md"), readmeFor(meta, opts.body));
    const rel = `artifacts/${path}`;
    const res = await commitAndPush({ wt, branch, base, paths: [rel], watch: [rel], message: `module: crear ${path}\n\nArchidocs-Agent: ${opts.agent || "cli"}` });
    await logEvent({ op: "module-create", path, sha: res.sha, attempts: res.attempts });
    return { path, sha: res.sha, urls: siteUrls(cfg, path), message: `Módulo ${path} creado (${res.sha.slice(0, 7)})` };
  });
}

export async function moduleDescribe(opts, [rawPath]) {
  const path = checkPath(rawPath, "ruta del módulo");
  return withWorktree(async ({ wt, branch, base, cfg }) => {
    const file = join(wt, "artifacts", path, "README.md");
    if (!existsSync(file)) throw new CliError(EXIT.MODULE, `El módulo ${path} no existe`);
    const fm = splitFrontmatter(await readFile(file, "utf8"));
    const meta = { ...fm.data };
    if (opts.title) meta.title = opts.title;
    if (opts.description) meta.description = opts.description;
    if (opts.include) meta.includes = [].concat(opts.include);
    if (opts.exclude) meta.excludes = [].concat(opts.exclude);
    if (opts.owner) meta.owners = [].concat(opts.owner);
    await writeFile(file, readmeFor(meta, opts.body ?? fm.body));
    const rel = `artifacts/${path}/README.md`;
    const res = await commitAndPush({ wt, branch, base, paths: [rel], watch: [rel], message: `module: describir ${path}\n\nArchidocs-Agent: ${opts.agent || "cli"}` });
    return { path, sha: res.sha, changed: res.changed, urls: siteUrls(cfg, path), message: res.changed ? `Módulo ${path} actualizado` : "Sin cambios" };
  });
}

// ---------- validate / get ----------

export async function validate(opts, [file]) {
  if (!file) throw new CliError(EXIT.USAGE, "Uso: archidocs validate <archivo.md|html>");
  const format = formatOf(file);
  if (!format) throw new CliError(EXIT.USAGE, "Solo se publican archivos .md o .html");
  const { ref } = await contentRoot();
  const standardDef = JSON.parse(showFile(ref, "standard/standard.json"));
  const text = await readFile(resolve(file), "utf8");
  const { meta: raw, error } = readMeta(format, text);
  // Valida lo que se publicaría: autor, fechas y versión del estándar los completa el CLI.
  const meta = fillMeta(raw, { author: gitUserName(), today: today(), standardVersion: standardDef.version });
  const autofilled = ["author", "created", "updated"].filter((f) => !raw[f]);
  const res = validateArtifact(format, text, meta, standardDef);
  if (error) res.errors.unshift(error);
  if (autofilled.length) res.warnings.push(`se completarán al publicar: ${autofilled.join(", ")}`);
  return { file, format, meta, ...res, ok: res.errors.length === 0 };
}

export async function get(opts, [rawPath]) {
  const path = checkPath(rawPath, "ruta del artifact");
  const { cfg, ref } = await contentRoot();
  for (const format of ["md", "html"]) {
    const r = git(["show", `${ref}:artifacts/${path}/index.${format}`], { allowFail: true });
    if (!r.ok) continue;
    const out = resolve(opts.out || `${basename(path)}.${format}`);
    await writeFile(out, r.out + "\n");
    const ifMatch = lastCommitFor(ref, `artifacts/${path}`);
    const hasOriginal = git(["cat-file", "-e", `${ref}:artifacts/${path}/source.html`], { allowFail: true }).ok;
    if (hasOriginal) await writeFile(out.replace(/\.html?$/i, ".original.html"), git(["show", `${ref}:artifacts/${path}/source.html`]).out + "\n");
    return {
      path, format, file: out, if_match: ifMatch, original: hasOriginal ? out.replace(/\.html?$/i, ".original.html") : null, urls: siteUrls(cfg, path),
      message: `Descargado en ${out}\nPara publicar los cambios: archidocs publish ${out} --module ${path.split("/").slice(0, -1).join("/")} --slug ${basename(path)} --if-match ${ifMatch}`,
    };
  }
  throw new CliError(EXIT.USAGE, `No existe el artifact ${path}`);
}

// ---------- publish ----------

async function waitForDeploy(cfg, sha, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  const status = Object.fromEntries(Object.keys(cfg.sites || {}).map((k) => [k, "pending"]));
  while (Date.now() < deadline && Object.values(status).includes("pending")) {
    for (const [name, base] of Object.entries(cfg.sites || {})) {
      if (status[name] !== "pending") continue;
      try {
        const res = await fetch(`${base.replace(/\/+$/, "")}/build.json?t=${Date.now()}`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
        if (res.ok) {
          const info = await res.json();
          if (isIncluded(sha, info.sha)) {
            status[name] = "ok";
            const q = (info.quarantined || []).length;
            if (q) status[name] = `ok (${q} artifact(s) en cuarentena)`;
          }
        }
      } catch {
        /* reintenta en la siguiente vuelta */
      }
    }
    if (Object.values(status).includes("pending")) await sleep(10000);
  }
  for (const k of Object.keys(status)) if (status[k] === "pending") status[k] = "timeout";
  return status;
}

export async function publish(opts, [file]) {
  const started = Date.now();
  if (!file) throw new CliError(EXIT.USAGE, "Uso: archidocs publish <archivo> --module <ruta> [--slug s] [--original f] [--if-match sha] [--wait]");
  const format = formatOf(file);
  if (!format) throw new CliError(EXIT.USAGE, "Solo se publican archivos .md o .html");
  const modulePath = checkPath(opts.module, "módulo (--module)");
  const sourceText = await readFile(resolve(file), "utf8");
  const parsed = readMeta(format, sourceText);
  if (parsed.error) throw new CliError(EXIT.VALIDATION, parsed.error);
  const slug = checkPath(opts.slug || slugFromTitle(parsed.meta.title || basename(file).replace(/\.\w+$/, "")), "slug");
  if (slug.includes("/")) throw new CliError(EXIT.USAGE, "El slug no puede contener /");
  const path = `${modulePath}/${slug}`;

  const remote = await remoteUrl();
  const visibility = await repoVisibility(remote);

  const result = await withWorktree(async ({ wt, branch, base, cfg }) => {
    if (visibility === "public" && !cfg.allow_public) {
      throw new CliError(EXIT.PUBLIC, "El repo de destino es PÚBLICO y su configuración no lo permite (allow_public). No se publica.");
    }
    const modDir = join(wt, "artifacts", modulePath);
    if (!existsSync(join(modDir, "README.md"))) {
      throw new CliError(EXIT.MODULE, `El módulo ${modulePath} no existe o no tiene README.md. Créalo antes con: archidocs module create ${modulePath} --title ... --description ...`);
    }
    const dir = join(wt, "artifacts", path);
    if (existsSync(join(dir, "README.md"))) throw new CliError(EXIT.MODULE, `${path} es un módulo, no un artifact`);
    const existing = ["md", "html"].find((f) => existsSync(join(dir, `index.${f}`)));
    const rel = `artifacts/${path}`;

    if (existing && opts["if-match"]) {
      const last = lastCommitFor("HEAD", rel, wt);
      if (last && !last.startsWith(opts["if-match"])) {
        throw new CliError(EXIT.CONFLICT, `El artifact cambió desde la versión que editaste (${String(opts["if-match"]).slice(0, 7)} → ${last.slice(0, 7)}). Descarga la actual con archidocs get ${path} y vuelve a aplicar tus cambios.`);
      }
    }
    if (existing && !opts["if-match"] && !opts.overwrite) {
      throw new CliError(EXIT.CONFLICT, `Ya existe ${path}. Para actualizarlo usa archidocs get ${path} y publica con --if-match, o --overwrite si sabes que tu versión parte de la actual.`);
    }

    let created;
    if (existing) {
      const prev = readMeta(existing, await readFile(join(dir, `index.${existing}`), "utf8"));
      created = prev.meta.created;
    }
    const standardDef = await loadStandard(wt);
    const meta = fillMeta(parsed.meta, { author: gitUserName(), today: today(), created, standardVersion: standardDef.version });
    const out = format === "md" ? writeMarkdown(meta, parsed.body) : writeHtmlMeta(sourceText, meta);

    const check = validateArtifact(format, out, readMeta(format, out).meta, standardDef);
    if (check.errors.length) throw new CliError(EXIT.VALIDATION, `El artifact no cumple el estándar:\n  - ${check.errors.join("\n  - ")}`, { errors: check.errors, warnings: check.warnings });

    let fid = null;
    if (format === "html" && opts.original) {
      const original = await readFile(resolve(opts.original), "utf8");
      fid = fidelity(original, out);
      const threshold = Number(opts["min-fidelity"] || 0.98);
      if (fid.score < threshold && !opts["accept-fidelity"]) {
        throw new CliError(EXIT.FIDELITY, `La copia normalizada conserva solo el ${(fid.score * 100).toFixed(1)} % del texto visible del original (mínimo ${(threshold * 100).toFixed(0)} %). Faltan, por ejemplo: ${fid.missing.slice(0, 12).join(", ")}`, { fidelity: fid });
      }
    }

    await mkdir(dir, { recursive: true });
    for (const f of ["md", "html"]) if (f !== format) await rm(join(dir, `index.${f}`), { force: true });
    await writeFile(join(dir, `index.${format}`), out);
    if (format === "html" && opts.original) await copyFile(resolve(opts.original), join(dir, "source.html"));
    if (format === "md") await rm(join(dir, "source.html"), { force: true });

    const verb = existing ? "actualizar" : "publicar";
    const res = await commitAndPush({
      wt, branch, base, paths: [rel], watch: [rel],
      message: `${verb}: ${path} (${meta.type})\n\n${meta.title}\n\nArchidocs-Agent: ${opts.agent || "cli"}`,
    });
    return { path, format, created: !existing, changed: res.changed, sha: res.sha, attempts: res.attempts, warnings: check.warnings, fidelity: fid, cfg };
  });

  const { cfg, ...rest } = result;
  const urls = siteUrls(cfg, path);
  let deploy = null;
  if (opts.wait && result.changed) deploy = await waitForDeploy(cfg, result.sha, Number(opts.timeout || 720) * 1000);
  await logEvent({ op: "publish", path, sha: result.sha, changed: result.changed, attempts: result.attempts, agent: opts.agent || "cli", duration_ms: Date.now() - started, fidelity: result.fidelity?.score ?? null, deploy });

  const lines = [
    result.changed ? `${result.created ? "Publicado" : "Actualizado"}: ${path} (${result.sha.slice(0, 7)})` : `Sin cambios: ${path} ya estaba igual`,
    ...Object.entries(urls).map(([k, u]) => `  ${k}: ${u}${deploy ? `  [${deploy[k]}]` : ""}`),
    ...(result.warnings.length ? [`Avisos:`, ...result.warnings.map((w) => `  - ${w}`)] : []),
    ...(result.fidelity ? [`Fidelidad respecto al original: ${(result.fidelity.score * 100).toFixed(1)} %`] : []),
  ];
  const timedOut = deploy && Object.values(deploy).includes("timeout");
  return { ...rest, urls, deploy, message: lines.join("\n"), exitCode: timedOut ? EXIT.TIMEOUT : EXIT.OK };
}

export async function log(opts) {
  const text = existsSync(LOG_FILE) ? await readFile(LOG_FILE, "utf8") : "";
  const lines = text.trim().split("\n").filter(Boolean).slice(-(Number(opts.limit) || 20));
  return { entries: lines.map((l) => JSON.parse(l)), text: lines.join("\n") || "(vacío)" };
}

export const CODE_DIR = CODE_ROOT;

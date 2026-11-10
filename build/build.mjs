// Fase 0: build mínimo. Genera _site/ con un catálogo provisional y build.json.
// Las fases siguientes añaden render de Markdown, contenedor sandbox, índices por módulo y alias.
import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { execFileSync } from "node:child_process";

const args = process.argv.slice(2);
const out = args[args.indexOf("--out") + 1] || "_site";
const root = new URL("..", import.meta.url).pathname;
const artifactsDir = join(root, "artifacts");

function gitSha() {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "unknown";
  }
}

async function walk(dir) {
  const found = { modules: [], artifacts: [] };
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return found;
  }
  const names = new Set(entries.map((e) => e.name));
  const rel = relative(artifactsDir, dir);
  if (rel && (names.has("index.md") || names.has("index.html"))) {
    found.artifacts.push(rel);
    return found;
  }
  if (rel && names.has("README.md")) found.modules.push(rel);
  for (const e of entries) {
    if (!e.isDirectory() || e.name.startsWith(".") || e.name === "diagrams") continue;
    const sub = await walk(join(dir, e.name));
    found.modules.push(...sub.modules);
    found.artifacts.push(...sub.artifacts);
  }
  return found;
}

async function dirBytes(dir) {
  let total = 0;
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    total += e.isDirectory() ? await dirBytes(p) : (await stat(p)).size;
  }
  return total;
}

const escapeHtml = (s) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const sha = gitSha();
const { modules, artifacts } = await walk(artifactsDir);
const outDir = join(root, out);
await mkdir(outDir, { recursive: true });

const list = artifacts.length
  ? `<ul>${artifacts.map((a) => `<li><code>${escapeHtml(a)}</code></li>`).join("")}</ul>`
  : "<p>Todavía no hay artifacts publicados.</p>";

await writeFile(
  join(outDir, "index.html"),
  `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Archidocs</title>
<style>
  :root { color-scheme: light dark; --fg: #1f2328; --bg: #ffffff; --muted: #59636e; }
  @media (prefers-color-scheme: dark) { :root { --fg: #e6edf3; --bg: #0d1117; --muted: #9198a1; } }
  body { margin: 0; padding: 2rem 1rem; font: 16px/1.5 system-ui, sans-serif; color: var(--fg); background: var(--bg); }
  main { max-width: 48rem; margin: 0 auto; }
  footer { margin-top: 3rem; color: var(--muted); font-size: 0.85rem; }
</style>
</head>
<body>
<main>
  <h1>Archidocs</h1>
  ${list}
  <footer>build <code>${sha.slice(0, 7)}</code> · ${modules.length} módulos · ${artifacts.length} artifacts</footer>
</main>
</body>
</html>
`
);

await writeFile(
  join(outDir, "404.html"),
  `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>No encontrado · Archidocs</title></head><body><p>No existe. <a href="./">Volver al catálogo</a></p></body></html>\n`
);

const buildInfo = {
  sha,
  built_at: new Date().toISOString(),
  modules: modules.length,
  artifacts: artifacts.length,
  warnings: [],
  quarantined: [],
};
buildInfo.site_bytes = await dirBytes(outDir);
await writeFile(join(outDir, "build.json"), JSON.stringify(buildInfo, null, 2) + "\n");
console.log(`build ${sha.slice(0, 7)}: ${modules.length} módulos, ${artifacts.length} artifacts, ${buildInfo.site_bytes} bytes → ${out}/`);

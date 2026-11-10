// Build del sitio: artifacts/ → _site/ (un solo artefacto para GitHub Pages y Cloudflare).
// Nunca falla por contenido: un artifact que rompe va a cuarentena y el resto se publica.
import { copyFile, mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { execFileSync } from "node:child_process";
import { loadStandard, scanContent } from "./lib/content.mjs";
import { renderMarkdown } from "./lib/markdown.mjs";
import {
  catalogPage, htmlArtifactPage, markdownArtifactPage, modulePage, notFoundPage, quarantinePage, redirectPage,
} from "./lib/pages.mjs";

const args = process.argv.slice(2);
const out = args.includes("--out") ? args[args.indexOf("--out") + 1] : "_site";
const root = new URL("..", import.meta.url).pathname;
const outDir = join(root, out);

function git(...a) {
  try {
    return execFileSync("git", a, { cwd: root, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "";
  }
}

function repoUrl() {
  if (process.env.GITHUB_REPOSITORY) return `${process.env.GITHUB_SERVER_URL || "https://github.com"}/${process.env.GITHUB_REPOSITORY}`;
  const remote = git("remote", "get-url", "origin");
  const m = remote.match(/github\.com[:/](.+?)(\.git)?$/);
  return m ? `https://github.com/${m[1]}` : "";
}

async function write(rel, content) {
  const file = join(outDir, rel);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, content);
}

async function dirBytes(dir) {
  let total = 0;
  for (const ent of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    total += ent.isDirectory() ? await dirBytes(p) : (await stat(p)).size;
  }
  return total;
}

const pkgFile = (spec) => join(root, "node_modules", spec);

async function writeVendor() {
  await mkdir(join(outDir, "_archidocs", "v1"), { recursive: true });
  await mkdir(join(outDir, "_archidocs", "vendor"), { recursive: true });
  await copyFile(join(root, "standard", "ui", "v1", "ui.css"), join(outDir, "_archidocs", "v1", "ui.css"));
  await copyFile(join(root, "build", "site.css"), join(outDir, "_archidocs", "site.css"));
  await copyFile(pkgFile("mermaid/dist/mermaid.min.js"), join(outDir, "_archidocs", "vendor", "mermaid.min.js"));
  await copyFile(pkgFile("github-markdown-css/github-markdown.css"), join(outDir, "_archidocs", "vendor", "github-markdown.css"));

  const { readFile } = await import("node:fs/promises");
  const hlLight = await readFile(pkgFile("highlight.js/styles/github.css"), "utf8");
  const hlDark = await readFile(pkgFile("highlight.js/styles/github-dark.css"), "utf8");
  await write("_archidocs/vendor/highlight.css",
    `/* highlight.js github + github-dark */\n@media (prefers-color-scheme: light) {\n${hlLight}\n}\n@media (prefers-color-scheme: dark) {\n${hlDark}\n}\n.markdown-body pre code.hljs { padding: 0; background: transparent; }\n`);

  const alertsDir = dirname(pkgFile("markdown-it-github-alerts/styles/github-base.css"));
  const alerts = await Promise.all(
    ["github-colors-light.css", "github-colors-dark-media.css", "github-base.css"].map((f) => readFile(join(alertsDir, f), "utf8"))
  );
  await write("_archidocs/vendor/alerts.css", alerts.join("\n"));
}

const started = Date.now();
const standard = await loadStandard(root);
const content = await scanContent(root, standard);
const ctx = { standard, modules: content.modules, artifacts: content.artifacts, root: content.root, repoUrl: repoUrl() };
const sha = process.env.GITHUB_SHA || git("rev-parse", "HEAD") || "unknown";

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });
await writeVendor();

const warnings = [...content.warnings];
const quarantined = [];

for (const art of content.artifacts) {
  for (const w of art.warnings) warnings.push(`${art.path}: ${w}`);
  try {
    if (art.error) throw new Error(art.error);
    if (art.format === "md") {
      await write(`${art.path}/index.html`, markdownArtifactPage(ctx, art, renderMarkdown(art.body)));
      await copyFile(art.file, join(outDir, art.path, "source.md"));
    } else {
      await write(`${art.path}/index.html`, htmlArtifactPage(ctx, art));
    }
  } catch (err) {
    quarantined.push({ path: art.path, error: err.message });
    await write(`${art.path}/index.html`, quarantinePage(ctx, art, err.message));
  }
}

for (const mod of content.modules.values()) {
  if (!mod.path) continue;
  const readme = mod.body.trim() ? renderMarkdown(mod.body.replace(/^#\s+.*\n+/, "")).html : "";
  await write(`${mod.path}/index.html`, modulePage(ctx, mod, readme));
}
await write("index.html", catalogPage(ctx));
await write("404.html", notFoundPage());

// Alias: la ruta real siempre gana sobre un alias.
const taken = new Set([...content.artifacts.map((a) => a.path), ...[...content.modules.keys()]]);
for (const art of content.artifacts) {
  for (const alias of art.meta.aliases) {
    const a = String(alias).replace(/^\/+|\/+$/g, "");
    if (!a || taken.has(a)) {
      warnings.push(`${art.path}: alias "${alias}" choca con una ruta existente; se ignora`);
      continue;
    }
    taken.add(a);
    await write(`${a}/index.html`, redirectPage(a, art.path));
  }
}

const info = {
  sha,
  built_at: new Date().toISOString(),
  standard_version: standard.version,
  modules: content.modules.size - 1,
  artifacts: content.artifacts.length,
  warnings,
  quarantined,
  duration_ms: 0,
  site_bytes: 0,
};
info.duration_ms = Date.now() - started;
info.site_bytes = await dirBytes(outDir);
await write("build.json", JSON.stringify(info, null, 2) + "\n");

console.log(`build ${sha.slice(0, 7)}: ${info.modules} módulos, ${info.artifacts} artifacts, ${(info.site_bytes / 1e6).toFixed(2)} MB, ${info.duration_ms} ms`);
if (warnings.length) console.log(`avisos (${warnings.length}):\n  - ${warnings.join("\n  - ")}`);
if (quarantined.length) console.log(`cuarentena (${quarantined.length}):\n  - ${quarantined.map((q) => `${q.path}: ${q.error}`).join("\n  - ")}`);

// En la CI, los avisos van al resumen del job.
if (process.env.GITHUB_STEP_SUMMARY && (warnings.length || quarantined.length)) {
  const { appendFile } = await import("node:fs/promises");
  const lines = ["## Archidocs: avisos del build", "", ...warnings.map((w) => `- ${w}`), ...quarantined.map((q) => `- **cuarentena** ${q.path}: ${q.error}`), ""];
  await appendFile(process.env.GITHUB_STEP_SUMMARY, lines.join("\n"));
}

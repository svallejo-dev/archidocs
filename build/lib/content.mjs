// Lectura del contenido: módulos (carpetas con README.md) y artifacts (carpetas con index.md|index.html).
// Lo comparten el build y, más adelante, el CLI (validate, modules).
import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { parse as parseYaml } from "yaml";

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export async function loadStandard(root) {
  return JSON.parse(await readFile(join(root, "standard", "standard.json"), "utf8"));
}

export function splitFrontmatter(text) {
  const m = text.match(FRONTMATTER);
  if (!m) return { data: {}, body: text, error: null };
  try {
    const data = parseYaml(m[1]) ?? {};
    return { data: typeof data === "object" ? data : {}, body: text.slice(m[0].length), error: null };
  } catch (err) {
    return { data: {}, body: text.slice(m[0].length), error: `frontmatter YAML inválido: ${err.message}` };
  }
}

const decodeEntities = (s) =>
  s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

// <meta name="artifact:campo" content="valor"> en cualquier orden de atributos.
export function htmlMeta(html) {
  const head = (html.match(/<head[\s>][\s\S]*?<\/head>/i) || [html])[0];
  const data = {};
  for (const tag of head.match(/<meta\b[^>]*>/gi) || []) {
    const name = tag.match(/\bname\s*=\s*["']artifact:([\w-]+)["']/i);
    const content = tag.match(/\bcontent\s*=\s*"([^"]*)"|\bcontent\s*=\s*'([^']*)'/i);
    if (!name || !content) continue;
    const key = name[1];
    const value = decodeEntities(content[1] ?? content[2] ?? "");
    data[key] = key === "tags" || key === "aliases" || key === "generated_sections"
      ? value.split(",").map((v) => v.trim()).filter(Boolean)
      : value;
  }
  if (!data.title) {
    const t = head.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (t) data.title = decodeEntities(t[1].trim());
  }
  return data;
}

function firstHeading(md) {
  const m = md.match(/^#\s+(.+?)\s*#*\s*$/m);
  return m ? m[1].trim() : null;
}

const toDate = (v) => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
};

export function validateMeta(meta, standard) {
  const warnings = [];
  for (const field of standard.required) {
    if (meta[field] === undefined || meta[field] === null || meta[field] === "") warnings.push(`falta el metadato obligatorio "${field}"`);
  }
  if (meta.type && !standard.types[meta.type]) warnings.push(`tipo desconocido "${meta.type}"`);
  if (meta.status && !standard.statuses[meta.status]) warnings.push(`estado desconocido "${meta.status}"`);
  for (const f of ["created", "updated"]) if (meta[f] && !toDate(meta[f])) warnings.push(`fecha inválida en "${f}"`);
  return warnings;
}

const toPosix = (p) => p.split(sep).join("/");

export async function scanContent(root, standard) {
  const artifactsDir = join(root, "artifacts");
  const modules = new Map(); // path -> module
  const artifacts = [];
  const warnings = [];

  const rootModule = { path: "", title: "Archidocs", meta: {}, body: "", children: [], artifacts: [] };
  modules.set("", rootModule);

  async function walk(dir, parent) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    const names = new Set(entries.filter((e) => e.isFile()).map((e) => e.name));
    const path = toPosix(relative(artifactsDir, dir));

    if (path && (names.has("index.md") || names.has("index.html"))) {
      const format = names.has("index.md") ? "md" : "html";
      const file = join(dir, `index.${format}`);
      const raw = await readFile(file, "utf8");
      const art = { path, format, file, raw, parent: parent.path, error: null, warnings: [] };
      if (format === "md") {
        const fm = splitFrontmatter(raw);
        art.meta = fm.data;
        art.body = fm.body;
        if (fm.error) art.error = fm.error;
        if (!art.meta.title) art.meta.title = firstHeading(fm.body) || path.split("/").pop();
      } else {
        art.meta = htmlMeta(raw);
        art.body = raw;
        if (!art.meta.title) art.meta.title = path.split("/").pop();
      }
      art.meta.aliases = [].concat(art.meta.aliases || []);
      art.meta.tags = [].concat(art.meta.tags || []);
      art.updated = toDate(art.meta.updated) || toDate(art.meta.created);
      art.warnings = validateMeta(art.meta, standard);
      if (names.has("index.md") && names.has("index.html")) art.warnings.push("tiene index.md e index.html; se usa index.md");
      parent.artifacts.push(art);
      artifacts.push(art);
      return;
    }

    let mod = parent;
    if (path) {
      mod = { path, title: path.split("/").pop(), meta: {}, body: "", children: [], artifacts: [], hasReadme: names.has("README.md") };
      if (mod.hasReadme) {
        const fm = splitFrontmatter(await readFile(join(dir, "README.md"), "utf8"));
        mod.meta = fm.data;
        mod.body = fm.body;
        if (fm.data.title) mod.title = String(fm.data.title);
        if (fm.error) warnings.push(`${path}/README.md: ${fm.error}`);
      } else {
        warnings.push(`${path}: módulo sin README.md`);
      }
      modules.set(path, mod);
      parent.children.push(mod);
    }

    const dirs = entries.filter((e) => e.isDirectory() && !e.name.startsWith(".") && !e.name.startsWith("_") && e.name !== "diagrams");
    dirs.sort((a, b) => a.name.localeCompare(b.name));
    for (const e of dirs) await walk(join(dir, e.name), mod);
  }

  await walk(artifactsDir, rootModule);

  // Conteo recursivo de artifacts por módulo.
  const count = (m) => (m.total = m.artifacts.length + m.children.reduce((n, c) => n + count(c), 0));
  count(rootModule);
  for (const m of modules.values()) m.children.sort((a, b) => a.title.localeCompare(b.title, "es"));

  return { root: rootModule, modules, artifacts, warnings };
}

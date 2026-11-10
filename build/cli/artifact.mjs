// Normalización determinista de un artifact antes de publicarlo: metadatos, validación estricta y fidelidad.
import { stringify as toYaml } from "yaml";
import { htmlMeta, splitFrontmatter, validateMeta } from "../lib/content.mjs";
import { escapeHtml } from "../lib/markdown.mjs";

const ORDER = ["type", "title", "author", "created", "updated", "status", "standard_version", "tags", "aliases", "generated_sections"];
const LIST_FIELDS = new Set(["tags", "aliases", "generated_sections"]);

export const formatOf = (file) => (/\.md$/i.test(file) ? "md" : /\.html?$/i.test(file) ? "html" : null);

export function readMeta(format, text) {
  if (format === "md") {
    const fm = splitFrontmatter(text);
    return { meta: { ...fm.data }, body: fm.body, error: fm.error };
  }
  return { meta: htmlMeta(text), body: text, error: null };
}

const normDate = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v ? String(v) : v);

// Completa lo que es mecánico; lo que requiere juicio (type, title, status) lo aporta la skill.
export function fillMeta(meta, { author, today, created, standardVersion }) {
  const out = { ...meta };
  if (!out.author && author) out.author = author;
  out.created = normDate(created || out.created || today);
  out.updated = today;
  out.standard_version = standardVersion;
  for (const f of LIST_FIELDS) if (out[f] !== undefined && !Array.isArray(out[f])) out[f] = String(out[f]).split(",").map((s) => s.trim()).filter(Boolean);
  for (const f of LIST_FIELDS) if (Array.isArray(out[f]) && !out[f].length) delete out[f];
  return out;
}

function ordered(meta) {
  const o = {};
  for (const k of ORDER) if (meta[k] !== undefined) o[k] = meta[k];
  for (const k of Object.keys(meta)) if (!(k in o)) o[k] = meta[k];
  return o;
}

export function writeMarkdown(meta, body) {
  return `---\n${toYaml(ordered(meta), { lineWidth: 0 }).trimEnd()}\n---\n\n${body.replace(/^\s+/, "")}`;
}

export function writeHtmlMeta(html, meta) {
  let out = html;
  const tags = [];
  for (const [k, v] of Object.entries(ordered(meta))) {
    const value = Array.isArray(v) ? v.join(", ") : String(v);
    const tag = `<meta name="artifact:${k}" content="${escapeHtml(value)}">`;
    const re = new RegExp(`<meta\\b[^>]*\\bname\\s*=\\s*["']artifact:${k}["'][^>]*>`, "i");
    if (re.test(out)) out = out.replace(re, tag);
    else tags.push(tag);
  }
  if (tags.length) {
    if (/<\/head>/i.test(out)) out = out.replace(/<\/head>/i, `${tags.join("\n")}\n</head>`);
    else throw new Error("el HTML no tiene <head>; no se pueden escribir los metadatos");
  }
  if (meta.title && !/<title[\s>]/i.test(out)) out = out.replace(/<\/head>/i, `<title>${escapeHtml(meta.title)}</title>\n</head>`);
  return out;
}

const CDN_ALLOWED = /^(https:\/\/(cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|unpkg\.com)\/|\.{0,2}\/)/;
const MAX_BYTES = 5 * 1024 * 1024;

export function validateArtifact(format, text, meta, standard) {
  const errors = validateMeta(meta, standard);
  const warnings = [];
  if (Buffer.byteLength(text) > MAX_BYTES) errors.push(`pesa más de ${MAX_BYTES / 1024 / 1024} MB`);
  if (format === "html") {
    if (!/^\s*<!doctype html>/i.test(text)) warnings.push("falta <!doctype html>");
    if (!/<meta[^>]+name=["']viewport["']/i.test(text)) warnings.push('falta <meta name="viewport">');
    if (!/<head[\s>]/i.test(text)) errors.push("falta <head>");
    for (const m of text.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)) {
      if (!CDN_ALLOWED.test(m[1])) warnings.push(`script externo fuera de la lista permitida: ${m[1]}`);
    }
  }
  return { errors, warnings };
}

function visibleWords(html) {
  const text = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|template)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&[a-z]+;|&#\d+;/gi, " ");
  return (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) || []);
}

// Proporción de palabras visibles del original que siguen en la copia normalizada (multiconjunto).
export function fidelity(original, normalized) {
  const a = visibleWords(original);
  if (!a.length) return { score: 1, missing: [] };
  const pool = new Map();
  for (const w of visibleWords(normalized)) pool.set(w, (pool.get(w) || 0) + 1);
  let kept = 0;
  const missing = [];
  for (const w of a) {
    const n = pool.get(w) || 0;
    if (n > 0) { kept++; pool.set(w, n - 1); } else if (missing.length < 25) missing.push(w);
  }
  return { score: kept / a.length, missing };
}

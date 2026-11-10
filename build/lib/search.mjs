// Índice de búsqueda del catálogo (search.json): metadatos, encabezados y el texto visible de cada artifact.
// Lo consulta build/site.js en el navegador; no hay servidor de búsqueda.
import { moduleTrail, STATUS_TONE, TYPE_TONE, typeLabel } from "./pages.mjs";

// Texto por artifact: suficiente para encontrar y mostrar un fragmento sin inflar el índice.
// Con 1.000 artifacts son ~6 MB sin comprimir (~1,5 MB gzip); por encima, pasar a Pagefind.
const MAX_TEXT = 6000;

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function textFromHtml(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|template|svg|noscript|head)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<pre\b[^>]*class="mermaid"[^>]*>[\s\S]*?<\/pre>/gi, " ")
    .replace(/<a\b[^>]*class="[^"]*\banchor\b[^"]*"[^>]*>[\s\S]*?<\/a>/gi, "")
    .replace(/<p\b[^>]*class="markdown-alert-title"[^>]*>[\s\S]*?<\/p>/gi, " ")
    // Las etiquetas en línea no separan palabras; el resto sí.
    .replace(/<\/?(a|abbr|b|code|em|i|kbd|mark|s|small|strong|sub|sup|u)\b[^>]*>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, ent) => {
      if (ent[0] === "#") {
        const code = ent[1].toLowerCase() === "x" ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : " ";
      }
      return ENTITIES[ent.toLowerCase()] ?? " ";
    })
    .replace(/\s+/g, " ")
    .trim();
}

const headingsFromHtml = (html) =>
  [...html.matchAll(/<h[23]\b[^>]*>([\s\S]*?)<\/h[23]>/gi)].map((m) => textFromHtml(m[1])).filter(Boolean);

export function searchIndex(ctx) {
  const types = {};
  for (const t of Object.keys(ctx.standard.types)) types[t] = { label: typeLabel(ctx, t), color: TYPE_TONE[t] || "var(--ad-fg-muted)" };
  const statuses = {};
  for (const [s, label] of Object.entries(ctx.standard.statuses)) statuses[s] = { label, tone: STATUS_TONE[s] || "" };

  const docs = ctx.artifacts.map((art) => {
    let text = "";
    let headings = [];
    if (art.rendered) {
      text = textFromHtml(art.rendered.html);
      headings = art.rendered.toc.map((t) => t.title);
    } else if (art.format === "html" && !art.error) {
      const body = art.body.match(/<body\b[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? art.body;
      text = textFromHtml(body);
      headings = headingsFromHtml(body);
    }
    const title = String(art.meta.title || art.path);
    if (text.startsWith(title)) text = text.slice(title.length).trim();
    return {
      path: art.path,
      title,
      type: art.meta.type || "",
      status: art.meta.status || "",
      author: art.meta.author ? String(art.meta.author) : "",
      tags: art.meta.tags.map(String),
      module: art.parent,
      trail: moduleTrail(ctx, "", art.parent),
      updated: art.updated ? art.updated.toISOString().slice(0, 10) : "",
      format: art.format,
      headings: headings.slice(0, 40),
      text: text.slice(0, MAX_TEXT),
    };
  });
  return { json: JSON.stringify({ version: 1, types, statuses, docs }) };
}

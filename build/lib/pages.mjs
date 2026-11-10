// Plantillas de las páginas del sitio. Todas las URLs son relativas, así el mismo build sirve en
// GitHub Pages (/archidocs/) y en Cloudflare (/).
import { escapeHtml as e } from "./markdown.mjs";

const LOGO = `<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="2.5" width="18" height="19" rx="3" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M7.5 8h9M7.5 12h9M7.5 16h5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
const FAVICON = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20" rx="5" fill="#0969da"/><path d="M7 8.5h10M7 12h10M7 15.5h6" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>`)}`;

const STATUS_TONE = { draft: "", review: "attention", accepted: "success", superseded: "done", archived: "" };
const TYPE_TONE = {
  adr: "var(--ad-done)", rfc: "var(--ad-attention)", prd: "var(--ad-accent)", "design-doc": "var(--ad-success)",
  runbook: "var(--ad-danger)", report: "var(--ad-accent)", explainer: "var(--ad-attention)", note: "var(--ad-fg-muted)",
};

const dateFmt = new Intl.DateTimeFormat("es", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
export const fmtDate = (d) => (d ? dateFmt.format(d) : "");

export const rootPrefix = (path) => (path ? "../".repeat(path.split("/").length) : "./");

function head({ title, root, extraHead = "" }) {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${e(title)}</title>
<link rel="icon" href="${FAVICON}">
<link rel="stylesheet" href="${root}_archidocs/v1/ui.css">
<link rel="stylesheet" href="${root}_archidocs/site.css">
${extraHead}</head>`;
}

function crumbs(ctx, page, path, current) {
  const parts = path ? path.split("/") : [];
  const items = [];
  let acc = "";
  for (let i = 0; i < parts.length; i++) {
    acc = acc ? `${acc}/${parts[i]}` : parts[i];
    const mod = ctx.modules.get(acc);
    const label = mod ? mod.title : parts[i];
    const isLast = i === parts.length - 1 && !current;
    items.push(isLast ? `<span class="current">${e(label)}</span>` : `<a href="${rootPrefix(page)}${acc}/">${e(label)}</a>`);
  }
  if (current) items.push(`<span class="current">${e(current)}</span>`);
  return items.length ? `<span class="sep">/</span>${items.join('<span class="sep">/</span>')}` : "";
}

const BACK_ICON = `<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M7.78 12.53a.75.75 0 0 1-1.06 0L2.47 8.28a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 1.06L4.81 7h7.44a.75.75 0 0 1 0 1.5H4.81l2.97 2.97a.75.75 0 0 1 0 1.06Z"/></svg>`;

// Botón de atrás determinista: lleva al módulo padre (o al catálogo), no depende del historial del navegador.
function backLink(ctx, page, path, current) {
  if (!path && !current) return "";
  const root = rootPrefix(page);
  const target = current ? path : path.split("/").slice(0, -1).join("/");
  const label = target ? ctx.modules.get(target)?.title || target : "Catálogo";
  return `<a class="ad-back" href="${target ? `${root}${target}/` : root}" title="Volver a ${e(label)}" aria-label="Volver a ${e(label)}">${BACK_ICON}</a>`;
}

// Ruta de módulos entre dos niveles, para mostrar dónde vive un artifact en listas anidadas.
export function moduleTrail(ctx, from, to) {
  if (!to || to === from) return "";
  const parts = to.split("/");
  const start = from ? from.split("/").length : 0;
  const titles = [];
  for (let i = start; i < parts.length; i++) titles.push(ctx.modules.get(parts.slice(0, i + 1).join("/"))?.title || parts[i]);
  return titles.join(" › ");
}

// page: ruta de la página (para las URLs relativas); path: módulo al que pertenece; current: título del artifact.
function appbar(ctx, page, path, current, actions = "") {
  const root = rootPrefix(page);
  return `<header class="ad-appbar">
  ${backLink(ctx, page, path, current)}
  <a class="ad-brand" href="${root}">${LOGO}<span>Archidocs</span></a>
  <nav class="ad-crumbs" aria-label="Ruta">${crumbs(ctx, page, path, current)}</nav>
  <span class="ad-appbar__spacer"></span>
  ${actions ? `<div class="ad-appbar__actions">${actions}</div>` : ""}
</header>`;
}

export const typeLabel = (ctx, t) => ctx.standard.types[t] || t || "—";
const typeTag = (ctx, t) =>
  `<span class="ad-type" style="color:${TYPE_TONE[t] || "var(--ad-fg-muted)"}"><span class="ad-dot"></span> ${e(typeLabel(ctx, t))}</span>`;
const statusBadge = (ctx, s) =>
  s ? `<span class="ad-badge${STATUS_TONE[s] ? ` ad-badge--${STATUS_TONE[s]}` : ""}">${e(ctx.standard.statuses[s] || s)}</span>` : "";

function artifactRow(ctx, art, fromPath) {
  const href = `${rootPrefix(fromPath)}${art.path}/`;
  const sub = [art.meta.author, moduleTrail(ctx, fromPath, art.parent)].filter(Boolean).map(e).join(" · ");
  return `<div class="ad-row" data-type="${e(art.meta.type || "")}">
  ${typeTag(ctx, art.meta.type)}
  <div class="ad-row__main"><a class="ad-row__title" href="${href}">${e(art.meta.title)}</a>${sub ? `<span class="ad-row__sub">${sub}</span>` : ""}</div>
  <div class="ad-row__side">${statusBadge(ctx, art.meta.status)}<span>${fmtDate(art.updated)}</span></div>
</div>`;
}

function artifactList(ctx, list, fromPath, { filters = true } = {}) {
  if (!list.length) return `<div class="ad-list"><div class="ad-empty">Todavía no hay artifacts.</div></div>`;
  const types = [...new Set(list.map((a) => a.meta.type).filter(Boolean))];
  const chips = filters && types.length > 1
    ? `<div class="ad-list__head" role="toolbar" aria-label="Filtrar por tipo">
  <button class="ad-chip" type="button" aria-pressed="true" data-filter="">Todos <span class="ad-muted">${list.length}</span></button>
  ${types.map((t) => `<button class="ad-chip" type="button" aria-pressed="false" data-filter="${e(t)}">${e(typeLabel(ctx, t))}</button>`).join("\n  ")}
</div>`
    : "";
  return `<div class="ad-list" data-filterable>${chips}${list.map((a) => artifactRow(ctx, a, fromPath)).join("\n")}</div>`;
}

const FILTER_SCRIPT = `<script>
document.querySelectorAll("[data-filterable]").forEach((list) => {
  list.addEventListener("click", (ev) => {
    const chip = ev.target.closest(".ad-chip");
    if (!chip) return;
    const f = chip.dataset.filter;
    list.querySelectorAll(".ad-chip").forEach((c) => c.setAttribute("aria-pressed", String(c === chip)));
    list.querySelectorAll(".ad-row").forEach((r) => { r.hidden = !!f && r.dataset.type !== f; });
  });
});
</script>`;

function moduleCards(ctx, mods, fromPath) {
  if (!mods.length) return "";
  return `<div class="ad-modules">${mods
    .map((m) => `<a class="ad-module" href="${rootPrefix(fromPath)}${m.path}/">
  <span class="ad-module__title"><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M1.75 1A1.75 1.75 0 0 0 0 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0 0 16 13.25v-8.5A1.75 1.75 0 0 0 14.25 3H7.5a.25.25 0 0 1-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1H1.75Z"/></svg>${e(m.title)}</span>
  ${m.meta.description ? `<span class="ad-module__desc">${e(m.meta.description)}</span>` : ""}
  <span class="ad-module__count">${m.total} ${m.total === 1 ? "artifact" : "artifacts"}${m.children.length ? ` · ${m.children.length} ${m.children.length === 1 ? "submódulo" : "submódulos"}` : ""}</span>
</a>`)
    .join("\n")}</div>`;
}

export function catalogPage(ctx) {
  const recent = [...ctx.artifacts].sort((a, b) => (b.updated?.getTime() || 0) - (a.updated?.getTime() || 0));
  const root = ctx.root;
  return `${head({ title: "Archidocs", root: "./" })}
<body>
${appbar(ctx, "", "", "")}
<main class="ad-page">
  <div class="ad-pagehead">
    <h1>Archidocs</h1>
    <p>${ctx.artifacts.length} artifacts en ${ctx.modules.size - 1} módulos</p>
  </div>
  ${root.children.length ? `<section class="ad-section"><h2>Módulos</h2>${moduleCards(ctx, root.children, "")}</section>` : ""}
  ${root.artifacts.length ? `<section class="ad-section"><h2>Sin módulo</h2>${artifactList(ctx, root.artifacts, "", { filters: false })}</section>` : ""}
  <section class="ad-section"><h2>Actualizados recientemente</h2>${artifactList(ctx, recent.slice(0, 30), "")}</section>
</main>
${FILTER_SCRIPT}
</body>
</html>
`;
}

export function modulePage(ctx, mod, readmeHtml) {
  const all = [];
  const collect = (m) => { all.push(...m.artifacts); m.children.forEach(collect); };
  collect(mod);
  return `${head({ title: `${mod.title} · Archidocs`, root: rootPrefix(mod.path) })}
<body>
${appbar(ctx, mod.path, mod.path, "")}
<main class="ad-page">
  <div class="ad-pagehead">
    <h1>${e(mod.title)}</h1>
    ${mod.meta.description ? `<p>${e(mod.meta.description)}</p>` : ""}
  </div>
  ${readmeHtml ? `<div class="ad-docbox"><article class="markdown-body">${readmeHtml}</article></div>` : ""}
  ${mod.children.length ? `<section class="ad-section"><h2>Submódulos</h2>${moduleCards(ctx, mod.children, mod.path)}</section>` : ""}
  ${mod.artifacts.length || !all.length ? `<section class="ad-section"><h2>Artifacts</h2>${artifactList(ctx, mod.artifacts, mod.path)}</section>` : ""}
  ${all.length > mod.artifacts.length ? `<section class="ad-section"><h2>${mod.artifacts.length ? "En todo el módulo" : "Artifacts en los submódulos"}</h2>${artifactList(ctx, all.sort((a, b) => (b.updated?.getTime() || 0) - (a.updated?.getTime() || 0)), mod.path)}</section>` : ""}
</main>
${FILTER_SCRIPT}
</body>
</html>
`;
}

function docActions(ctx, art) {
  const source = art.format === "md" ? `<a class="ad-btn" href="source.md" download>Fuente .md</a>` : "";
  const history = ctx.repoUrl
    ? `<a class="ad-btn" href="${ctx.repoUrl}/commits/main/artifacts/${art.path}" target="_blank" rel="noopener">Historial</a>`
    : "";
  return source + history;
}

function docMeta(ctx, art) {
  const bits = [typeTag(ctx, art.meta.type), statusBadge(ctx, art.meta.status)];
  if (art.meta.author) bits.push(`<span>${e(art.meta.author)}</span>`);
  if (art.updated) bits.push(`<span>Actualizado el ${fmtDate(art.updated)}</span>`);
  if (art.meta.generated_sections?.length) bits.push(`<span class="ad-badge" title="Secciones completadas por IA: ${e([].concat(art.meta.generated_sections).join(", "))}">Incluye secciones generadas</span>`);
  return bits.filter(Boolean).join("");
}

export function markdownArtifactPage(ctx, art, rendered) {
  const root = rootPrefix(art.path);
  const title = art.meta.title;
  const toc = rendered.toc.length >= 3
    ? `<nav class="ad-toc" aria-label="En este documento"><h2>En este documento</h2><ul>${rendered.toc
        .map((t) => `<li class="l${t.level}"><a href="#${e(t.slug)}">${e(t.title)}</a></li>`)
        .join("")}</ul></nav>`
    : "";
  const body = rendered.hasH1 ? rendered.html : `<h1>${e(title)}</h1>\n${rendered.html}`;
  const mermaid = rendered.hasMermaid
    ? `<script src="${root}_archidocs/vendor/mermaid.min.js"></script>
<script>
  mermaid.initialize({ startOnLoad: true, securityLevel: "strict", theme: matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "neutral", fontFamily: getComputedStyle(document.body).fontFamily });
</script>`
    : "";
  return `${head({ title: `${title} · Archidocs`, root, extraHead: `<link rel="stylesheet" href="${root}_archidocs/vendor/github-markdown.css">\n<link rel="stylesheet" href="${root}_archidocs/vendor/highlight.css">\n<link rel="stylesheet" href="${root}_archidocs/vendor/alerts.css">\n` })}
<body>
${appbar(ctx, art.path, art.parent, title, docActions(ctx, art))}
<main class="ad-page${toc ? "" : " ad-page--narrow"}">
  <div class="ad-doclayout${toc ? " ad-doclayout--toc" : ""}">
    <div>
      <div class="ad-docmeta">${docMeta(ctx, art)}</div>
      <div class="ad-docbox"><article class="markdown-body">${body}</article></div>
    </div>
    ${toc}
  </div>
</main>
${mermaid}
</body>
</html>
`;
}

// Script que se inyecta en el HTML del autor (dentro del iframe sandbox):
// enlaces normales navegan la ventana principal y las anclas internas hacen scroll sin recargar.
const FRAME_SCRIPT = `<script data-archidocs>
document.addEventListener("click", function (ev) {
  var a = ev.target.closest && ev.target.closest("a[href]");
  if (!a) return;
  var href = a.getAttribute("href");
  if (href.charAt(0) === "#") {
    ev.preventDefault();
    var t = document.getElementById(decodeURIComponent(href.slice(1)));
    if (t) t.scrollIntoView({ behavior: "smooth" });
    return;
  }
  if (!a.target) a.target = "_top";
});
</script>`;

export function frameDocument(art, root) {
  const uiLink = `<link rel="stylesheet" href="${root}_archidocs/v1/ui.css" data-archidocs>`;
  let html = art.body;
  if (/<head[^>]*>/i.test(html)) html = html.replace(/<head[^>]*>/i, (m) => `${m}\n${uiLink}`);
  else html = `${uiLink}\n${html}`;
  if (/<\/body>/i.test(html)) html = html.replace(/<\/body>/i, `${FRAME_SCRIPT}\n</body>`);
  else html += `\n${FRAME_SCRIPT}`;
  return html;
}

export function htmlArtifactPage(ctx, art) {
  const root = rootPrefix(art.path);
  const title = art.meta.title;
  const srcdoc = frameDocument(art, root).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  return `${head({ title: `${title} · Archidocs`, root })}
<body class="ad-container">
${appbar(ctx, art.path, art.parent, title, `<span class="ad-container__meta"><span class="hide-sm">${docMeta(ctx, art)}</span></span>${docActions(ctx, art)}`)}
<iframe class="ad-frame" title="${e(title)}" sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation" referrerpolicy="no-referrer" srcdoc="${srcdoc}"></iframe>
</body>
</html>
`;
}

export function redirectPage(fromPath, toPath) {
  const target = `${rootPrefix(fromPath)}${toPath}/`;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="robots" content="noindex"><meta http-equiv="refresh" content="0; url=${e(target)}"><title>Movido · Archidocs</title></head><body><p>Este artifact se movió a <a href="${e(target)}">${e(toPath)}</a>.</p></body></html>\n`;
}

export function quarantinePage(ctx, art, message) {
  const root = rootPrefix(art.path);
  return `${head({ title: `Error · ${art.meta?.title || art.path} · Archidocs`, root })}
<body>
${appbar(ctx, art.path, art.parent, art.meta?.title || art.path, docActions(ctx, art))}
<main class="ad-page"><div class="ad-error ad-callout ad-callout--danger">
  <span class="ad-callout__title">Este artifact no se pudo publicar</span>
  <p>El build lo puso en cuarentena; el resto del sitio se publicó con normalidad.</p>
  <pre>${e(message)}</pre>
</div></main>
</body>
</html>
`;
}

export function notFoundPage() {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>No encontrado · Archidocs</title>
<style>body{font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;color:#59636e}@media(prefers-color-scheme:dark){body{background:#0d1117;color:#9198a1}}</style></head>
<body><p>Esta página no existe.</p></body></html>\n`;
}

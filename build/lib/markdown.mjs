// Render de Markdown con aspecto de GitHub: anclas en títulos, task lists, alertas, resaltado de código,
// Mermaid (renderizado en el navegador) y HTML embebido sanitizado.
import MarkdownIt from "markdown-it";
import anchor from "markdown-it-anchor";
import taskLists from "markdown-it-task-lists";
import githubAlerts from "markdown-it-github-alerts";
import hljs from "highlight.js";
import sanitizeHtml from "sanitize-html";

export const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// Slug al estilo GitHub, conservando letras con tilde.
export const slugify = (s) =>
  String(s).trim().toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, "").replace(/\s/g, "-");

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: false,
  highlight(code, lang) {
    if (lang && hljs.getLanguage(lang)) {
      const out = hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
      return `<pre><code class="hljs language-${escapeHtml(lang)}">${out}</code></pre>`;
    }
    return "";
  },
})
  .use(anchor, {
    slugify,
    level: [1, 2, 3, 4],
    permalink: anchor.permalink.linkInsideHeader({ symbol: "#", placement: "before", class: "anchor", ariaHidden: true }),
    callback(token, { slug, title }) {
      const level = Number(token.tag.slice(1));
      if (level === 2 || level === 3) md.__toc?.push({ level, slug, title });
    },
  })
  .use(taskLists, { enabled: false })
  .use(githubAlerts);

const defaultFence = md.renderer.rules.fence;
md.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  if (token.info.trim() === "mermaid") {
    env.hasMermaid = true;
    return `<pre class="mermaid">${escapeHtml(token.content)}</pre>\n`;
  }
  return defaultFence(tokens, idx, options, env, self);
};

const SANITIZE = {
  allowedTags: sanitizeHtml.defaults.allowedTags.concat([
    "img", "h1", "h2", "details", "summary", "input", "del", "ins", "sup", "sub", "kbd", "picture", "source", "svg", "path",
  ]),
  allowedAttributes: {
    "*": ["class", "id", "title", "align", "dir", "lang", "aria-hidden"],
    a: ["href", "name", "target", "rel"],
    img: ["src", "alt", "width", "height", "loading"],
    source: ["srcset", "media", "type"],
    input: ["type", "checked", "disabled"],
    td: ["colspan", "rowspan", "style"],
    th: ["colspan", "rowspan", "style"],
    ol: ["start", "type"],
    details: ["open"],
    svg: ["viewbox", "viewBox", "width", "height", "version", "fill"],
    path: ["d", "fill-rule"],
  },
  allowedStyles: { td: { "text-align": [/^(left|right|center)$/] }, th: { "text-align": [/^(left|right|center)$/] } },
  allowedSchemes: ["http", "https", "mailto"],
  allowProtocolRelative: false,
};

export function renderMarkdown(source) {
  const env = { hasMermaid: false };
  md.__toc = [];
  const html = sanitizeHtml(md.render(source, env), SANITIZE);
  const toc = md.__toc;
  md.__toc = null;
  return { html, toc, hasMermaid: env.hasMermaid, hasH1: /^\s*#\s+\S/m.test(source.replace(/```[\s\S]*?```/g, "")) };
}

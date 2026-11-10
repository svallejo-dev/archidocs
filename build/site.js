// Script común del sitio: atajos de teclado y búsqueda en el catálogo.
// La búsqueda corre en el navegador sobre search.json (generado en el build): sin servidor.
(function () {
  "use strict";

  // ---- Atajos: "/" o Ctrl/Cmd+K enfocan la búsqueda ------------------------------------------
  function searchInput() {
    return document.getElementById("ad-q") || document.querySelector(".ad-search input[name=q]");
  }
  document.addEventListener("keydown", function (ev) {
    var el = document.activeElement;
    var typing = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
    var isK = (ev.metaKey || ev.ctrlKey) && (ev.key === "k" || ev.key === "K");
    if ((ev.key === "/" && !typing) || isK) {
      var input = searchInput();
      if (!input) return;
      ev.preventDefault();
      input.focus();
      input.select();
    }
  });

  var q = document.getElementById("ad-q");
  if (!q) return; // solo el catálogo tiene el panel de búsqueda

  // ---- Normalización: minúsculas y sin tildes, conservando la posición de cada carácter -------
  function fold(s) {
    s = s || "";
    var out = "";
    for (var i = 0; i < s.length; i++) {
      var c = s[i].normalize("NFD")[0] || s[i];
      out += (c.toLowerCase()[0] || c);
    }
    return out;
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // Resalta los términos en el texto original (los rangos se calculan sobre la versión normalizada).
  function mark(text, terms) {
    var f = fold(text);
    var ranges = [];
    terms.forEach(function (t) {
      var i = f.indexOf(t);
      while (t && i !== -1) { ranges.push([i, i + t.length]); i = f.indexOf(t, i + t.length); }
    });
    if (!ranges.length) return esc(text);
    ranges.sort(function (a, b) { return a[0] - b[0]; });
    var merged = [ranges[0]];
    for (var r = 1; r < ranges.length; r++) {
      var last = merged[merged.length - 1];
      if (ranges[r][0] <= last[1]) last[1] = Math.max(last[1], ranges[r][1]);
      else merged.push(ranges[r]);
    }
    var out = "", pos = 0;
    merged.forEach(function (m) { out += esc(text.slice(pos, m[0])) + "<mark>" + esc(text.slice(m[0], m[1])) + "</mark>"; pos = m[1]; });
    return out + esc(text.slice(pos));
  }

  // Fragmento del contenido alrededor de la primera coincidencia.
  function snippet(doc, terms) {
    var best = -1;
    terms.forEach(function (t) { var i = doc._text.indexOf(t); if (i !== -1 && (best === -1 || i < best)) best = i; });
    if (best === -1) return "";
    var start = Math.max(0, best - 70), end = Math.min(doc.text.length, best + 150);
    while (start > 0 && start > best - 100 && !/\s/.test(doc.text[start - 1])) start--;
    while (end < doc.text.length && end < best + 180 && !/\s/.test(doc.text[end])) end++;
    return (start > 0 ? "… " : "") + mark(doc.text.slice(start, end).trim(), terms) + (end < doc.text.length ? " …" : "");
  }

  // ---- Puntuación: todos los términos deben aparecer en algún campo (AND) ---------------------
  var WEIGHTS = [["_title", 12], ["_tags", 6], ["_type", 5], ["_trail", 4], ["_heads", 3], ["_author", 3], ["_path", 2], ["_text", 1]];
  function hit(field, term) {
    var i = field.indexOf(term);
    if (i === -1) return 0;
    var wordStart = i === 0 || !/[a-z0-9]/.test(field[i - 1]);
    return wordStart ? 2 : 1;
  }
  function score(doc, terms) {
    var total = 0;
    for (var t = 0; t < terms.length; t++) {
      var s = 0;
      for (var w = 0; w < WEIGHTS.length; w++) s += hit(doc[WEIGHTS[w][0]], terms[t]) * WEIGHTS[w][1];
      if (!s) return 0;
      total += s;
    }
    if (terms.length && doc._title === terms.join(" ")) total += 50;
    return total;
  }

  // ---- Estado y elementos --------------------------------------------------------------------
  var $ = function (id) { return document.getElementById(id); };
  var fType = $("ad-f-type"), fStatus = $("ad-f-status"), fModule = $("ad-f-module"), fSort = $("ad-f-sort");
  var results = $("ad-results"), list = $("ad-results-list"), title = $("ad-results-title"), browse = $("ad-browse");
  var clear = $("ad-clear");
  var params = new URLSearchParams(location.search);
  q.value = params.get("q") || "";
  [[fType, "type"], [fStatus, "status"], [fModule, "module"], [fSort, "sort"]].forEach(function (p) {
    var v = params.get(p[1]);
    if (v && [].some.call(p[0].options, function (o) { return o.value === v; })) p[0].value = v;
  });

  var index = null;
  function load() {
    if (!index) {
      index = fetch("search.json", { cache: "no-cache" }).then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      }).then(function (data) {
        data.docs.forEach(function (d) {
          var type = data.types[d.type] || {};
          d._title = fold(d.title);
          d._tags = fold((d.tags || []).join(" "));
          d._type = fold(d.type + " " + (type.label || ""));
          d._trail = fold(d.trail);
          d._heads = fold((d.headings || []).join(" "));
          d._author = fold(d.author);
          d._path = fold(d.path.replace(/[\/-]/g, " "));
          d._text = fold(d.text);
          d._time = d.updated ? Date.parse(d.updated) : 0;
        });
        return data;
      });
    }
    return index;
  }

  var dateFmt = new Intl.DateTimeFormat("es", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

  function row(data, doc, terms) {
    var type = data.types[doc.type] || { label: doc.type || "—", color: "var(--ad-fg-muted)" };
    var status = data.statuses[doc.status];
    var sub = [doc.trail, doc.author].filter(Boolean).map(function (s) { return mark(s, terms); });
    if (doc.tags && doc.tags.length) sub.push(doc.tags.map(function (t) { return "#" + mark(t, terms); }).join(" "));
    // Fragmento del contenido solo si algún término no está ya en el título.
    var snip = terms.some(function (t) { return !hit(doc._title, t); }) ? snippet(doc, terms) : "";
    return '<div class="ad-row">' +
      '<span class="ad-type" style="color:' + esc(type.color) + '"><span class="ad-dot"></span> ' + esc(type.label) + "</span>" +
      '<div class="ad-row__main"><a class="ad-row__title" href="' + esc(doc.path) + '/">' + mark(doc.title, terms) + "</a>" +
      (sub.length ? '<span class="ad-row__sub">' + sub.join(" · ") + "</span>" : "") +
      (snip ? '<span class="ad-row__snippet">' + snip + "</span>" : "") + "</div>" +
      '<div class="ad-row__side">' +
      (status ? '<span class="ad-badge' + (status.tone ? " ad-badge--" + esc(status.tone) : "") + '">' + esc(status.label) + "</span>" : "") +
      "<span>" + (doc._time ? dateFmt.format(new Date(doc._time)) : "") + "</span></div></div>";
  }

  function state() {
    return { q: q.value.trim(), type: fType.value, status: fStatus.value, module: fModule.value, sort: fSort.value };
  }

  function syncUrl(s) {
    var p = new URLSearchParams();
    ["q", "type", "status", "module", "sort"].forEach(function (k) { if (s[k]) p.set(k, s[k]); });
    var qs = p.toString();
    history.replaceState(null, "", location.pathname + (qs ? "?" + qs : "") + location.hash);
  }

  var seq = 0;
  function run() {
    var s = state();
    syncUrl(s);
    var active = s.q || s.type || s.status || s.module;
    clear.hidden = !(active || s.sort);
    if (!active) { results.hidden = true; browse.hidden = false; return; }
    var mine = ++seq;
    load().then(function (data) {
      if (mine !== seq) return;
      var terms = fold(s.q).split(/\s+/).filter(Boolean);
      var found = [];
      data.docs.forEach(function (d) {
        if (s.type && d.type !== s.type) return;
        if (s.status && d.status !== s.status) return;
        if (s.module && d.module !== s.module && d.module.indexOf(s.module + "/") !== 0) return;
        var sc = terms.length ? score(d, terms) : 1;
        if (sc) found.push({ d: d, s: sc });
      });
      found.sort(function (a, b) {
        if (s.sort === "title") return a.d.title.localeCompare(b.d.title, "es");
        if (s.sort !== "recent" && b.s !== a.s) return b.s - a.s;
        return b.d._time - a.d._time;
      });
      title.textContent = found.length === 1 ? "1 resultado" : found.length + " resultados";
      list.innerHTML = found.length
        ? found.map(function (f) { return row(data, f.d, terms); }).join("")
        : '<div class="ad-empty">No hay documentos que coincidan' + (s.q ? " con «" + esc(s.q) + "»" : "") + ".</div>";
      results.hidden = false;
      browse.hidden = true;
    }).catch(function (err) {
      if (mine !== seq) return;
      title.textContent = "Búsqueda no disponible";
      list.innerHTML = '<div class="ad-empty">No se pudo cargar el índice (' + esc(err.message) + ").</div>";
      results.hidden = false;
    });
  }

  var timer;
  q.addEventListener("input", function () { clearTimeout(timer); timer = setTimeout(run, 60); });
  q.addEventListener("keydown", function (ev) {
    if (ev.key === "Escape" && q.value) { ev.preventDefault(); q.value = ""; run(); }
    if (ev.key === "Enter") { ev.preventDefault(); var first = list.querySelector("a.ad-row__title"); if (first && !results.hidden) location.href = first.href; }
  });
  [fType, fStatus, fModule, fSort].forEach(function (el) { el.addEventListener("change", run); });
  clear.addEventListener("click", function () {
    q.value = ""; fType.value = ""; fStatus.value = ""; fModule.value = ""; fSort.value = "";
    run(); q.focus();
  });
  q.addEventListener("focus", load, { once: true });

  run();
  if (location.hash === "#buscar") q.focus();
})();

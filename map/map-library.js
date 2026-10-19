/* SSDNS "My Maps" library (DMCC 0.2.67 / sheet 0.3.54).
   Visual map menu: thumbnail cards, search, folders (Built-in / My maps / World).
   Add map (image link or optional Storage upload), grid size with live preview and auto-fit,
   Save / Save as / autosave per map, one-click swap, duplicate, rename, delete (confirm),
   export / import a map pack as JSON. Works without Firebase Storage (links only). */
(function (root) {
  "use strict";
  var FOLDERS = [["all", "All"], ["builtin", "Built-in"], ["mine", "My maps"], ["world", "World"]];
  var PACK_FORMAT = "ssdns-map-pack";

  /* ---------- pure helpers (tested in tools/test-pr72.mjs) ---------- */
  function slug(s) { return String(s || "map").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32) || "map"; }
  function makeId(name, taken) {
    taken = taken || {};
    var base = "my_" + slug(name), id = base, n = 2;
    while (taken[id]) id = base + "-" + (n++);
    return id;
  }
  function clampInt(v, lo, hi, dflt) { v = Math.round(Number(v)); if (!isFinite(v)) v = dflt; return Math.max(lo, Math.min(hi, v)); }
  /* Auto-fit: from the image size and its pixels per square, how many squares? */
  function fit(w, h, ppsq) {
    var p = Number(ppsq) || 70;
    return { cols: clampInt(w / p, 1, 200, 30), rows: clampInt(h / p, 1, 200, 20) };
  }
  /* Or from a column count, what is the pixels per square (and rows to match)? */
  function fitCols(w, h, cols) {
    var c = clampInt(cols, 1, 200, 30), p = w / c;
    return { cols: c, rows: clampInt(h / p, 1, 200, 20), ppsq: Math.round(p * 100) / 100 };
  }
  function newEntry(opts, taken) {
    opts = opts || {};
    var cols = clampInt(opts.cols, 1, 200, 30), rows = clampInt(opts.rows, 1, 200, 20);
    var now = Date.now();
    return {
      id: opts.id || makeId(opts.name, taken),
      name: String(opts.name || "New map").slice(0, 80),
      src: String(opts.src || ""),
      thumb: String(opts.thumb || opts.src || ""),
      grid: { cols: cols, rows: rows, px: 70 },
      ppsq: Number(opts.ppsq) || 0,
      notes: String(opts.notes || ""),
      snapshot: opts.snapshot || null,
      createdAt: opts.createdAt || now,
      updatedAt: now
    };
  }
  function filter(list, folder, query) {
    var qy = String(query || "").trim().toLowerCase();
    return (list || []).filter(function (m) {
      if (!m) return false;
      if (folder && folder !== "all" && m.folder !== folder) return false;
      if (!qy) return true;
      return (String(m.name || "") + " " + String(m.group || "") + " " + String(m.notes || "")).toLowerCase().indexOf(qy) >= 0;
    });
  }
  function duplicate(entry, taken) {
    var copy = JSON.parse(JSON.stringify(entry || {}));
    delete copy.folder;
    var e = newEntry(Object.assign({}, copy, { id: "", name: (copy.name || "Map") + " (copy)" }), taken);
    e.snapshot = copy.snapshot || null;
    if (e.snapshot && Array.isArray(e.snapshot.tokens)) {
      e.snapshot.tokens = e.snapshot.tokens.map(function (t, i) { var n = Object.assign({}, t); n.id = String(t.id || "tok") + "_" + e.id.slice(-6) + i; n.sceneId = e.id; return n; });
    }
    return e;
  }
  /* Built-in or library map -> new My-maps entry carrying the current state. */
  function saveAs(scene, name, snapshot, assetUrl, taken) {
    var src = scene.src || (assetUrl ? assetUrl(scene.img) : scene.img) || "";
    var thumb = scene.thumb ? (assetUrl ? assetUrl(scene.thumb) : scene.thumb) : src;
    var e = newEntry({ name: name || scene.name, src: src, thumb: thumb, cols: scene.grid && scene.grid.cols, rows: scene.grid && scene.grid.rows, notes: scene.notes || "" }, taken);
    e.from = scene.id;
    if (snapshot) {
      e.snapshot = JSON.parse(JSON.stringify(snapshot));
      (e.snapshot.tokens || []).forEach(function (t, i) { t.id = String(t.id || "tok") + "_" + e.id.slice(-6) + i; t.sceneId = e.id; });
    }
    return e;
  }
  function exportPack(library, ids) {
    var maps = Object.keys(library || {}).filter(function (id) { return !ids || ids.indexOf(id) >= 0; }).map(function (id) {
      var e = JSON.parse(JSON.stringify(library[id])); delete e.folder; return e;
    }).filter(function (e) { return e && e.id; });
    return { format: PACK_FORMAT, version: 1, exportedAt: new Date().toISOString(), maps: maps };
  }
  /* Returns { entries, skipped, warn }. Ids that already exist get a fresh id. data:/blob: images are dropped (too big / local only). */
  function importPack(obj, existing) {
    if (typeof obj === "string") { try { obj = JSON.parse(obj); } catch (e) { return { entries: [], skipped: 0, warn: "That file isn't valid JSON." }; } }
    if (!obj || obj.format !== PACK_FORMAT || !Array.isArray(obj.maps)) return { entries: [], skipped: 0, warn: "That isn't an SSDNS map pack." };
    var taken = Object.assign({}, existing || {}), out = [], skipped = 0;
    obj.maps.forEach(function (m) {
      if (!m || !m.name || !m.src || /^(data:|blob:)/.test(String(m.src))) { skipped++; return; }
      if (!/^https?:\/\//.test(String(m.src)) && !/^(packs\/|\.\.\/|map\/)/.test(String(m.src))) { skipped++; return; }
      var e = newEntry(Object.assign({}, m, { id: taken[m.id] || !/^my_/.test(String(m.id || "")) ? "" : m.id }), taken);
      e.snapshot = m.snapshot || null;
      if (e.snapshot && Array.isArray(e.snapshot.tokens)) e.snapshot.tokens.forEach(function (t) { t.sceneId = e.id; });
      taken[e.id] = 1;
      out.push(e);
    });
    return { entries: out, skipped: skipped, warn: skipped ? skipped + " map(s) skipped (need an http(s) image link)." : "" };
  }

  /* ---------- UI ---------- */
  var ui = { dlg: null, api: null, folder: "all", query: "", adding: null };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function taken() { var t = {}; var lib = ui.api ? ui.api.library() : {}; Object.keys(lib).forEach(function (k) { t[k] = 1; }); return t; }
  function allCards() {
    var api = ui.api; if (!api) return [];
    return api.list().map(function (s) { return Object.assign({}, s); }).concat(api.world());
  }
  function thumbOf(m) {
    var api = ui.api;
    if (m.thumb) return /^(https?:|data:|blob:)/.test(m.thumb) ? m.thumb : api.asset(m.thumb);
    if (m.src) return m.src;
    return m.img ? api.asset(m.img) : "";
  }
  function card(m) {
    var cur = ui.api.current() === m.id;
    var g = m.grid ? m.grid.cols + "×" + m.grid.rows : (m.w ? "handout" : "");
    var acts = [];
    if (m.folder === "world") {
      acts.push('<button type="button" class="btn sm" data-ml-push="' + esc(m.id) + '">Push to table</button>');
      acts.push('<a class="btn sm" target="_blank" rel="noopener" href="' + esc(ui.api.asset(m.img)) + '">Open</a>');
    } else {
      acts.push('<button type="button" class="btn sm btn-primary" data-ml-open="' + esc(m.id) + '">' + (cur ? "Showing" : "Open") + "</button>");
      if (m.folder === "mine") {
        acts.push('<button type="button" class="btn sm" data-ml-save="' + esc(m.id) + '">Save</button>');
        acts.push('<button type="button" class="btn sm" data-ml-saveas="' + esc(m.id) + '">Save as</button>');
        acts.push('<button type="button" class="btn sm" data-ml-dup="' + esc(m.id) + '">Duplicate</button>');
        acts.push('<button type="button" class="btn sm" data-ml-rename="' + esc(m.id) + '">Rename</button>');
        acts.push('<button type="button" class="btn sm ml-danger" data-ml-del="' + esc(m.id) + '">Delete</button>');
      } else {
        acts.push('<button type="button" class="btn sm" data-ml-saveas="' + esc(m.id) + '">Save as…</button>');
      }
    }
    var saved = m.snapshot && m.snapshot.savedAt ? '<span class="ml-saved">saved ' + esc(new Date(m.snapshot.savedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })) + "</span>" : "";
    return '<div class="ml-card' + (cur ? " is-current" : "") + '" data-ml-card="' + esc(m.id) + '" role="listitem">' +
      '<button type="button" class="ml-thumb" data-ml-' + (m.folder === "world" ? "push" : "open") + '="' + esc(m.id) + '" aria-label="' + esc((m.folder === "world" ? "Push " : "Open ") + m.name) + '">' +
      (thumbOf(m) ? '<img alt="" loading="lazy" src="' + esc(thumbOf(m)) + '">' : '<span class="ml-noimg">No image</span>') + "</button>" +
      '<div class="ml-meta"><b class="ml-name">' + esc(m.name) + '</b><span class="ml-tag">' + esc(({ builtin: "Built-in", mine: "My map", world: "World" })[m.folder] || "") + (m.group ? " · " + esc(m.group) : "") + (g ? " · " + esc(g) : "") + "</span>" + saved + "</div>" +
      '<div class="ml-acts">' + acts.join("") + "</div></div>";
  }
  function render() {
    if (!ui.dlg || !ui.api) return;
    var list = filter(allCards(), ui.folder, ui.query);
    var tabs = FOLDERS.map(function (f) { return '<button type="button" class="ml-tab' + (ui.folder === f[0] ? " on" : "") + '" data-ml-folder="' + f[0] + '">' + f[1] + "</button>"; }).join("");
    var body = ui.dlg.querySelector(".ml-body");
    body.innerHTML =
      '<div class="ml-head"><h2>Maps</h2><input type="search" class="ml-search" placeholder="Search maps" aria-label="Search maps" value="' + esc(ui.query) + '">' +
      '<div class="ml-tabs" role="tablist">' + tabs + "</div>" +
      '<div class="ml-tools"><button type="button" class="btn sm btn-primary" data-ml-add>+ Add map</button><button type="button" class="btn sm" data-ml-export>Export pack</button><label class="btn sm ml-import">Import pack<input type="file" accept="application/json,.json" data-ml-import hidden></label><button type="button" class="btn sm" data-ml-close>Close</button></div></div>' +
      (ui.adding ? addFormHtml() : "") +
      '<div class="ml-grid" role="list">' + (list.map(card).join("") || '<p class="fine">No maps match.</p>') + "</div>" +
      '<p class="fine ml-foot">Built-in maps ship with the site. My maps save in this room (small JSON; images are links or optional Storage uploads) and autosave as you work. World maps push to players as handouts.</p>';
    var s = body.querySelector(".ml-search");
    if (s && ui.focusSearch) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); ui.focusSearch = false; }
    if (ui.adding) paintPreview();
  }
  function addFormHtml() {
    var a = ui.adding;
    var hint = root.SSDNSMedia && root.SSDNSMedia.storageHint ? root.SSDNSMedia.storageHint() : "Uploads are optional. Paste a link instead.";
    return '<div class="ml-add">' +
      '<div class="ml-add-fields">' +
      '<label>Name <input data-ml-f="name" value="' + esc(a.name) + '"></label>' +
      '<label>Image link <input data-ml-f="src" placeholder="https://…" value="' + esc(/^blob:/.test(a.src) ? "" : a.src) + '"></label>' +
      '<label class="ml-upload">or upload <input type="file" accept="image/*" data-ml-file></label>' +
      (hint ? '<p class="fine">' + esc(hint) + "</p>" : "") +
      '<div class="ml-gridrow"><label>Cols <input type="number" min="1" max="200" data-ml-f="cols" value="' + a.cols + '"></label>' +
      '<label>Rows <input type="number" min="1" max="200" data-ml-f="rows" value="' + a.rows + '"></label>' +
      '<label>px / square <input type="number" min="4" max="1000" step="0.5" data-ml-f="ppsq" value="' + a.ppsq + '"></label>' +
      '<button type="button" class="btn sm" data-ml-fit>Auto-fit</button></div>' +
      '<p class="fine" data-ml-imginfo>' + (a.w ? "Image " + a.w + "×" + a.h + " px" : "Paste a link to see a preview.") + "</p>" +
      '<p class="ml-warn" data-ml-warn>' + esc(a.warn || "") + "</p>" +
      '<div class="ml-add-acts"><button type="button" class="btn sm btn-primary" data-ml-create>Save map</button><button type="button" class="btn sm" data-ml-cancel>Cancel</button></div>' +
      "</div>" +
      '<canvas class="ml-preview" width="360" height="240" aria-label="Grid preview"></canvas></div>';
  }
  function paintPreview() {
    var cv = ui.dlg && ui.dlg.querySelector(".ml-preview"); if (!cv || !cv.getContext) return;
    var ctx = cv.getContext("2d"); if (!ctx) return;
    var a = ui.adding, W = cv.width, H = cv.height;
    ctx.fillStyle = "#2b231b"; ctx.fillRect(0, 0, W, H);
    var iw = a.w || a.cols * 70, ih = a.h || a.rows * 70;
    var k = Math.min(W / iw, H / ih), dw = iw * k, dh = ih * k, ox = (W - dw) / 2, oy = (H - dh) / 2;
    if (a.img && a.w) { try { ctx.drawImage(a.img, ox, oy, dw, dh); } catch (e) {} }
    var gw = a.w ? dw / (a.w / a.ppsq) : dw / a.cols;
    ctx.strokeStyle = "rgba(255,240,200,.55)"; ctx.lineWidth = 1;
    for (var c = 0; c <= a.cols; c++) { var x = ox + c * gw; if (x > ox + dw + 0.5) break; ctx.beginPath(); ctx.moveTo(x, oy); ctx.lineTo(x, oy + Math.min(dh, a.rows * gw)); ctx.stroke(); }
    for (var r = 0; r <= a.rows; r++) { var y = oy + r * gw; if (y > oy + dh + 0.5) break; ctx.beginPath(); ctx.moveTo(ox, y); ctx.lineTo(ox + Math.min(dw, a.cols * gw), y); ctx.stroke(); }
    ctx.strokeStyle = "#c9a227"; ctx.lineWidth = 2; ctx.strokeRect(ox, oy, Math.min(dw, a.cols * gw), Math.min(dh, a.rows * gw));
  }
  function loadPreview(src) {
    var a = ui.adding; if (!a) return;
    a.src = src; a.w = 0; a.h = 0; a.img = null;
    if (!src) { render(); return; }
    var im = new root.Image();
    im.onload = function () { if (ui.adding !== a) return; a.img = im; a.w = im.naturalWidth; a.h = im.naturalHeight; var f = fit(a.w, a.h, a.ppsq); a.cols = f.cols; a.rows = f.rows; a.warn = ""; render(); };
    im.onerror = function () { if (ui.adding !== a) return; a.warn = "That image didn't load. Check the link (it must be a direct image link)."; render(); };
    im.src = src;
  }
  function readField(name) { var f = ui.dlg.querySelector('[data-ml-f="' + name + '"]'); return f ? f.value : ""; }
  function syncForm() {
    var a = ui.adding; if (!a) return;
    a.name = readField("name") || a.name;
    var typed = String(readField("src") || "").trim();
    if (typed) a.src = typed;
    a.cols = clampInt(readField("cols"), 1, 200, a.cols);
    a.rows = clampInt(readField("rows"), 1, 200, a.rows);
    a.ppsq = Number(readField("ppsq")) || a.ppsq;
  }
  function uploadFile(file) {
    var a = ui.adding; if (!a || !file) return;
    var local = root.URL && root.URL.createObjectURL ? root.URL.createObjectURL(file) : "";
    loadPreview(local);
    var M = root.SSDNSMedia;
    if (!M || !M.upload) { a.warn = "Preview only: uploads need Firebase Storage. Paste a link to save this map."; render(); return; }
    a.warn = "Uploading…"; render();
    M.upload(file, "images", file.name || "map", null).then(function (res) { if (ui.adding !== a) return; a.src = res.url; a.warn = "Uploaded."; render(); },
      function (err) { if (ui.adding !== a) return; a.warn = (err && err.message ? err.message : "Upload failed.") + " The preview stays; paste a link to save."; render(); });
  }
  function onClick(e) {
    var api = ui.api, t = e.target.closest ? e.target.closest("button,[data-ml-folder]") : null;
    if (!t || !api) return;
    var lib = api.library(), id;
    if (t.hasAttribute("data-ml-close")) { close(); return; }
    if (t.hasAttribute("data-ml-folder")) { ui.folder = t.getAttribute("data-ml-folder"); render(); return; }
    if ((id = t.getAttribute("data-ml-open"))) { api.swap(id); api.toast("Map: " + ((allCards().filter(function (m) { return m.id === id; })[0] || {}).name || id)); render(); return; }
    if ((id = t.getAttribute("data-ml-push"))) { var w = api.world().filter(function (m) { return m.id === id; })[0]; if (w) Promise.resolve(api.pushHandout(w)).then(function (ok) { if (ok !== false) api.toast("Pushed " + w.name + " to the table"); }); return; }
    if ((id = t.getAttribute("data-ml-save"))) { var en = lib[id]; if (en) { en.snapshot = api.snapshot(id); en.updatedAt = Date.now(); api.save(en); api.toast("Saved " + en.name); render(); } return; }
    if ((id = t.getAttribute("data-ml-saveas"))) {
      var sc = allCards().filter(function (m) { return m.id === id; })[0]; if (!sc) return;
      var nm = root.prompt ? root.prompt("Save as (name):", sc.name + (sc.folder === "mine" ? " (copy)" : "")) : sc.name;
      if (!nm) return;
      var made = saveAs(sc, nm, api.snapshot(id), api.asset, taken());
      api.save(made); api.toast("Saved as " + made.name); ui.folder = "mine"; render(); return;
    }
    if ((id = t.getAttribute("data-ml-dup"))) { var d = duplicate(lib[id], taken()); api.save(d); api.toast("Duplicated"); render(); return; }
    if ((id = t.getAttribute("data-ml-rename"))) { var r = lib[id]; if (!r) return; var nn = root.prompt ? root.prompt("Rename map:", r.name) : null; if (!nn) return; r.name = String(nn).slice(0, 80); r.updatedAt = Date.now(); api.save(r); render(); return; }
    if ((id = t.getAttribute("data-ml-del"))) {
      var x = lib[id]; if (!x) return;
      if (root.confirm && !root.confirm('Delete "' + x.name + '"? Its saved tokens, walls and fog snapshot go too. This can\'t be undone.')) return;
      if (api.current() === id) api.swap(api.builtins()[0].id);
      api.remove(id); api.toast("Deleted " + x.name); render(); return;
    }
    if (t.hasAttribute("data-ml-add")) { ui.adding = { name: "New map", src: "", cols: 30, rows: 20, ppsq: 70, w: 0, h: 0, img: null, warn: "" }; render(); return; }
    if (t.hasAttribute("data-ml-cancel")) { ui.adding = null; render(); return; }
    if (t.hasAttribute("data-ml-fit")) { syncForm(); var a = ui.adding; if (a && a.w) { var f = fit(a.w, a.h, a.ppsq); a.cols = f.cols; a.rows = f.rows; } render(); return; }
    if (t.hasAttribute("data-ml-create")) {
      syncForm(); var ad = ui.adding;
      var link = root.SSDNSMedia && root.SSDNSMedia.normalizeLink ? root.SSDNSMedia.normalizeLink(ad.src) : { url: ad.src };
      if (!/^https?:\/\//.test(ad.src) || !link.url) { ad.warn = link.warn || "Paste a full https:// image link (or upload with Storage on)."; render(); return; }
      var ne = newEntry({ name: ad.name, src: link.url, cols: ad.cols, rows: ad.rows, ppsq: ad.ppsq }, taken());
      api.save(ne); ui.adding = null; ui.folder = "mine"; api.swap(ne.id); api.toast("Added " + ne.name); render(); return;
    }
    if (t.hasAttribute("data-ml-export")) {
      var pack = exportPack(lib);
      var blob = new root.Blob([JSON.stringify(pack, null, 1)], { type: "application/json" });
      var a2 = root.document.createElement("a"); a2.href = root.URL.createObjectURL(blob); a2.download = "ssdns-map-pack.json"; root.document.body.appendChild(a2); a2.click(); a2.remove();
      api.toast("Exported " + pack.maps.length + " map(s)"); return;
    }
  }
  function onInput(e) {
    var t = e.target;
    if (t.classList && t.classList.contains("ml-search")) { ui.query = t.value; ui.focusSearch = true; render(); return; }
    if (t.hasAttribute && t.hasAttribute("data-ml-f")) {
      var k = t.getAttribute("data-ml-f");
      if (k === "src") { if (e.type === "change") loadPreview(t.value.trim()); else ui.adding.src = t.value.trim(); return; }
      syncForm();
      if (k === "ppsq" && ui.adding.w) { var f = fit(ui.adding.w, ui.adding.h, ui.adding.ppsq); ui.adding.cols = f.cols; ui.adding.rows = f.rows; var c = ui.dlg.querySelector('[data-ml-f="cols"]'), r = ui.dlg.querySelector('[data-ml-f="rows"]'); if (c) c.value = f.cols; if (r) r.value = f.rows; }
      paintPreview();
    }
  }
  function onChange(e) {
    var t = e.target;
    if (t.hasAttribute("data-ml-file")) { uploadFile(t.files && t.files[0]); return; }
    if (t.hasAttribute("data-ml-import")) {
      var file = t.files && t.files[0]; if (!file) return;
      file.text().then(function (txt) {
        var res = importPack(txt, ui.api.library());
        res.entries.forEach(function (en) { ui.api.save(en); });
        ui.api.toast("Imported " + res.entries.length + " map(s)" + (res.warn ? ". " + res.warn : ""));
        ui.folder = "mine"; render();
      });
      return;
    }
    if (t.getAttribute && t.getAttribute("data-ml-f") === "src") onInput(e);
  }
  function open(api) {
    ui.api = api || ui.api;
    if (!ui.api || !root.document) return;
    if (!ui.dlg) {
      var d = root.document.createElement("dialog");
      d.className = "dlg ml-dialog";
      d.innerHTML = '<div class="ml-body"></div>';
      d.addEventListener("click", onClick);
      d.addEventListener("input", onInput);
      d.addEventListener("change", onChange);
      d.addEventListener("cancel", function () { ui.adding = null; });
      root.document.body.appendChild(d);
      ui.dlg = d;
    }
    render();
    if (!ui.dlg.open) { try { ui.dlg.showModal(); } catch (e) { ui.dlg.setAttribute("open", ""); } }
  }
  function close() { if (ui.dlg) { ui.adding = null; try { ui.dlg.close(); } catch (e) { ui.dlg.removeAttribute("open"); } } }
  function refresh() { if (ui.dlg && ui.dlg.open) render(); }

  root.SSDNSMapLibrary = { FOLDERS: FOLDERS, makeId: makeId, fit: fit, fitCols: fitCols, newEntry: newEntry, filter: filter, duplicate: duplicate, saveAs: saveAs, exportPack: exportPack, importPack: importPack, open: open, close: close, refresh: refresh, _ui: ui };
})(typeof window !== "undefined" ? window : globalThis);

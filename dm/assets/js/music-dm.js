/* DMCC Music tab (0.2.64): two layers, transport, fades, crossfade, seek, push to players, uploads. */
(function (root) {
  "use strict";
  var M = root.SSDNSMusic, Media = root.SSDNSMedia;
  if (!M || typeof document === "undefined") return;
  var MINE_KEY = "ssdns.dmcc.audio.v1";
  var starter = [], mine = [];
  try { mine = JSON.parse(localStorage.getItem(MINE_KEY) || "[]") || []; } catch (e) { mine = []; }
  function $(s, r) { return (r || document).querySelector(s); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function fmt(t) { t = Math.max(0, Math.floor(Number(t) || 0)); return Math.floor(t / 60) + ":" + String(t % 60).padStart(2, "0"); }
  function box(k) { return $('[data-mx-layer="' + k + '"]'); }
  function tracksFor(k) { return starter.concat(mine).filter(function (t) { return (t.layer || "music") === k; }); }
  function all() { return starter.concat(mine); }
  function picked(k) { var b = box(k), id = b && $("[data-mx-track]", b).value; return all().filter(function (t) { return t.id === id; })[0] || null; }
  function sec(k) { return Number($("[data-mx-sec]", box(k)).value) || 5; }
  function toTable() { var c = $("#musicTable"); return !!(c && c.checked); }
  function status(t) { var s = $("#musicStatus"); if (s) s.textContent = t || ""; }
  function push(payload) {
    if (!toTable() && payload.action !== "stop_all") return;
    var D = root.DMCC; if (!D || !D.pushCommand) return;
    try { var pr = D.pushCommand({ type: "music", to: "all", payload: payload, from: D.state && D.state.uid }); if (pr && pr.catch) pr.catch(function () {}); } catch (e) {}
  }
  function wire(t) { return t ? { file: t.file || "", url: t.url || "", title: t.title || "" } : {}; }
  function fill() {
    ["music", "ambient"].forEach(function (k) {
      var sel = $("[data-mx-track]", box(k)); if (!sel) return;
      var keep = sel.value, list = tracksFor(k);
      sel.innerHTML = list.map(function (t) { return '<option value="' + esc(t.id) + '">' + esc(t.title) + (t.linked ? " (link)" : t.url ? " (uploaded)" : "") + "</option>"; }).join("") || '<option value="">No ' + k + " tracks yet</option>";
      if (list.some(function (t) { return t.id === keep; })) sel.value = keep;
    });
    var ul = $("#mxMine");
    if (ul) ul.innerHTML = mine.map(function (t) { return '<li>' + esc(t.title) + ' · ' + esc(t.layer) + ' · ' + esc(t.linked ? "link" : (Media ? Media.fmtBytes(t.size) : "")) + ' <button type="button" class="btn xs" data-mx-del="' + esc(t.id) + '">' + (t.linked ? "Remove" : "Delete") + '</button></li>'; }).join("");
  }
  function step(k, dir) {
    var list = tracksFor(k), sel = $("[data-mx-track]", box(k)); if (!list.length) return null;
    var i = list.findIndex(function (t) { return t.id === sel.value; });
    i = (i + dir + list.length) % list.length; sel.value = list[i].id; return list[i];
  }
  function act(k, what) {
    var b = box(k), loop = $("[data-mx-loop]", b).checked, level = Number($("[data-mx-level]", b).value) / 100, t;
    switch (what) {
      case "prev": case "next":
        t = step(k, what === "next" ? 1 : -1); if (!t) return;
        if (M.snapshot()[k].track) { M.crossfade(k, t, 2, { loop: loop }); push(Object.assign({ action: "crossfade", layer: k, sec: 2, loop: loop }, wire(t))); }
        return;
      case "play":
        var snap = M.snapshot()[k];
        if (snap.paused && snap.track) { M.resume(k); push({ action: "resume", layer: k }); return; }
        t = picked(k); if (!t) { status("Pick a track first."); return; }
        M.setLevel(k, level);
        M.play(k, t, { loop: loop, onmissing: function () { setStatus(k, "No file at " + (t.url ? "Storage" : "assets/music/" + t.file) + " yet."); } });
        push(Object.assign({ action: "play", layer: k, loop: loop, level: level }, wire(t)));
        return;
      case "pause": M.pause(k); push({ action: "pause", layer: k }); return;
      case "stop": M.stop(k); push({ action: "stop", layer: k }); return;
      case "fade_out": M.fadeOut(k, sec(k)); push({ action: "fade_out", layer: k, sec: sec(k) }); return;
      case "fade_in": M.fadeIn(k, sec(k)); push({ action: "fade_in", layer: k, sec: sec(k) }); return;
      case "crossfade":
        t = picked(k); if (!t) return;
        M.crossfade(k, t, sec(k), { loop: loop }); push(Object.assign({ action: "crossfade", layer: k, sec: sec(k), loop: loop }, wire(t)));
        return;
    }
  }
  function setStatus(k, t) { var s = $("[data-mx-status]", box(k)); if (s) s.textContent = t; }
  var seeking = {};
  function paint(snap) {
    ["music", "ambient"].forEach(function (k) {
      var b = box(k); if (!b) return; var L = snap[k];
      var tm = $("[data-mx-time]", b); if (tm) tm.textContent = fmt(L.time) + " / " + fmt(L.duration);
      var sk = $("[data-mx-seek]", b); if (sk && !seeking[k]) sk.value = L.duration ? String(Math.round(L.time / L.duration * 1000)) : "0";
      setStatus(k, L.track ? (L.playing ? "Playing " : L.paused ? "Paused " : "Loading ") + (L.track.title || "") : "Stopped");
    });
  }
  M.onChange(paint);
  M.onBlocked(function () { status("This browser blocked autoplay. Press Play again."); });

  function showUid() {
    var el = $("#mxUid"), D = root.DMCC, u = D && D.state && !D.state.demo && D.state.uid;
    if (el) el.textContent = u || "open a live room";
    return u || "";
  }
  function meter() {
    showUid();
    if (!Media) return;
    var out = $("#mxMeter"), bar = $("#mxMeterBar");
    var hint = Media.storageHint && Media.storageHint();
    if (hint) { if (out) out.textContent = hint; return; }
    Media.usage().then(function (u) { if (out) out.textContent = "Storage used: " + u.label + "."; if (bar) bar.style.width = Math.min(100, u.pct).toFixed(1) + "%"; },
      function (err) { if (out) out.textContent = "Uploads are optional. " + err.message + " You can paste a link instead."; });
  }
  function doUpload() {
    var f = $("#mxFile").files[0], title = ($("#mxTitle").value || "").trim(), layer = $("#mxLayer").value, out = $("#mxMeter");
    var hint = Media.storageHint && Media.storageHint(); if (hint) { out.textContent = hint; return; }
    var bad = Media.checkAudio(f); if (bad) { out.textContent = bad; return; }
    if (!root.confirm("Upload " + f.name + " (" + Media.fmtBytes(f.size) + ") to your Firebase Storage? Players in your room can stream it. Only upload music you're allowed to share.")) return;
    out.textContent = "Uploading…";
    Media.upload(f, "audio", title || f.name, function (p) { out.textContent = "Uploading " + Math.round(p * 100) + "%"; }).then(function (r) {
      mine.push({ id: "up-" + Date.now().toString(36), title: title || f.name.replace(/\.[a-z0-9]+$/i, ""), url: r.url, path: r.path, size: r.size, layer: layer });
      localStorage.setItem(MINE_KEY, JSON.stringify(mine)); fill(); meter(); $("#mxFile").value = ""; $("#mxTitle").value = "";
    }, function (err) { out.textContent = err.message; });
  }

  function linkAction(add) {
    var msg = $("#mxLinkMsg"), raw = $("#mxLinkUrl").value, n = Media.normalizeLink(raw);
    if (!n.url) { msg.textContent = n.warn || "Paste a link first."; return; }
    msg.textContent = "Testing…" + (n.warn ? " " + n.warn : "");
    Media.testAudio(n.url).then(function (r) {
      if (!r.ok) { msg.textContent = "Not OK: " + r.error + (n.warn ? " " + n.warn : ""); return; }
      if (!add) { msg.textContent = "OK" + (r.duration ? " (" + fmt(r.duration) + ")" : "") + ". " + (n.warn || ""); return; }
      var title = ($("#mxLinkTitle").value || "").trim() || "Linked track";
      mine.push({ id: "ln-" + Date.now().toString(36), title: title, url: n.url, source: n.host, layer: $("#mxLinkLayer").value, size: 0, linked: true });
      localStorage.setItem(MINE_KEY, JSON.stringify(mine)); fill();
      $("#mxLinkUrl").value = ""; $("#mxLinkTitle").value = "";
      msg.textContent = "Added " + title + ". Pick it in the " + ($("#mxLinkLayer").value) + " list.";
    });
  }
  function init() {
    fetch("../assets/music/tracks.json").then(function (r) { return r.ok ? r.json() : { tracks: [] }; }).catch(function () { return { tracks: [] }; }).then(function (d) {
      starter = (d && d.tracks || []).filter(function (t) { return t && t.id && (t.file || t.url); }); fill();
    });
    document.addEventListener("click", function (e) {
      var t = e.target.closest && e.target.closest("[data-mx],[data-mx-del],#btnMusicStopAll,#btnMxUpload,#btnMxTest,#btnMxAddLink,#btnMxCopyUid");
      if (!t || !t.closest("#panel-music")) return;
      if (t.id === "btnMusicStopAll") { M.stopAll({ fade: 2 }); var D = root.DMCC; if (D && D.pushCommand) D.pushCommand({ type: "music", to: "all", payload: { action: "stop_all", sec: 2 }, from: D.state && D.state.uid }); return; }
      if (t.id === "btnMxUpload") { doUpload(); return; }
      if (t.id === "btnMxCopyUid") { var u = showUid(); if (u && navigator.clipboard) navigator.clipboard.writeText(u).catch(function () {}); return; }
      if (t.id === "btnMxTest" || t.id === "btnMxAddLink") { linkAction(t.id === "btnMxAddLink"); return; }
      if (t.hasAttribute("data-mx-del")) {
        var id = t.getAttribute("data-mx-del"), row = mine.filter(function (x) { return x.id === id; })[0]; if (!row || !root.confirm(row.linked ? "Remove " + row.title + " from the list?" : "Delete " + row.title + " from Storage?")) return;
        (row.linked || !row.path ? Promise.resolve() : Media.remove(row.path)).catch(function () {}).then(function () { mine = mine.filter(function (x) { return x.id !== id; }); localStorage.setItem(MINE_KEY, JSON.stringify(mine)); fill(); meter(); });
        return;
      }
      e.preventDefault(); e.stopImmediatePropagation();
      act(t.closest("[data-mx-layer]").getAttribute("data-mx-layer"), t.getAttribute("data-mx"));
    }, true);
    document.addEventListener("input", function (e) {
      var t = e.target, b = t.closest && t.closest("[data-mx-layer]"); if (!b) return;
      var k = b.getAttribute("data-mx-layer");
      if (t.hasAttribute("data-mx-level")) { M.setLevel(k, Number(t.value) / 100); }
      if (t.hasAttribute("data-mx-seek")) seeking[k] = true;
    });
    document.addEventListener("change", function (e) {
      var t = e.target, b = t.closest && t.closest("[data-mx-layer]"); if (!b) return;
      var k = b.getAttribute("data-mx-layer");
      if (t.hasAttribute("data-mx-level")) push({ action: "level", layer: k, level: Number(t.value) / 100 });
      if (t.hasAttribute("data-mx-loop")) { M.setLoop(k, t.checked); push({ action: "loop", layer: k, loop: t.checked }); }
      if (t.hasAttribute("data-mx-seek")) { seeking[k] = false; var d = M.snapshot()[k].duration; if (d) { var at = Number(t.value) / 1000 * d; M.seek(k, at); push({ action: "seek", layer: k, at: at }); } }
    });
    var up = $("#mxUpload"); if (up) up.addEventListener("toggle", function () { if (up.open) meter(); });
  }
  root.SSDNSMusicDM = { act: act, fill: fill, meter: meter, toggle: function () { var s = M.snapshot().music; if (s.playing) act("music", "stop"); else act("music", "play"); }, tracks: all };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})(typeof window !== "undefined" ? window : globalThis);

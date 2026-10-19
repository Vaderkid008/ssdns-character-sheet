/* DMCC Music tab (0.2.67): two layers, transport, fades, crossfade, seek, push to players, uploads. */
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
      /* 0.2.68: fades act directly. Fade out: down, then stop. Fade in: the selected track from
         silence, up to its level. Crossfade: current down while the selected one comes up. */
      case "fade_out":
        if (!M.snapshot()[k].track) { status("Nothing is playing on " + k + "."); return; }
        M.fadeOut(k, sec(k)); push({ action: "fade_out", layer: k, sec: sec(k) }); return;
      case "fade_in":
        t = picked(k); if (!t) { status("Pick a track first."); return; }
        M.setLevel(k, level);
        M.fadeIn(k, sec(k), t, { loop: loop, onmissing: function () { setStatus(k, "No file at " + (t.url ? "Storage" : "assets/music/" + t.file) + " yet."); } });
        push(Object.assign({ action: "fade_in", layer: k, sec: sec(k), loop: loop, level: level }, wire(t)));
        return;
      case "crossfade":
        t = picked(k); if (!t) { status("Pick a track first."); return; }
        M.setLevel(k, level);
        M.crossfade(k, t, sec(k), { loop: loop }); push(Object.assign({ action: "crossfade", layer: k, sec: sec(k), loop: loop, level: level }, wire(t)));
        return;
    }
  }
  /* ---- 0.2.68 Scenes: one tap sets Music + Ambient at set volumes. localStorage on this browser
     (like the DM's track list); nothing new in Firebase, so no rules change. ---- */
  var SCENE_KEY = "ssdns.dmcc.scenes.v1";
  var DEFAULT_SCENES = [
    { id: "sc-saloon", name: "Saloon", music: { track: "ssdns-theme", level: 0.7 }, ambient: { track: "amb-town-horses", level: 0.45 }, sec: 3 },
    { id: "sc-trail", name: "Quiet trail", music: { track: "", level: 0 }, ambient: { track: "amb-cold-mountain-wind", level: 0.6 }, sec: 5 },
    { id: "sc-cemetery", name: "Cemetery", music: { track: "", level: 0 }, ambient: { track: "amb-haunted-cemetery", level: 0.55 }, sec: 5 }
  ];
  var scenes;
  try { scenes = JSON.parse(localStorage.getItem(SCENE_KEY) || "null"); } catch (e) { scenes = null; }
  if (!Array.isArray(scenes)) scenes = DEFAULT_SCENES.map(function (s) { return JSON.parse(JSON.stringify(s)); });
  function saveScenes() { try { localStorage.setItem(SCENE_KEY, JSON.stringify(scenes)); } catch (e) {} }
  function trackById(id) { return all().filter(function (t) { return t.id === id; })[0] || null; }
  function setLayerUi(k, t, level) {
    var b = box(k); if (!b) return;
    if (t) { var sel = $("[data-mx-track]", b); if (sel) sel.value = t.id; }
    var lv = $("[data-mx-level]", b); if (lv) { lv.value = String(Math.round(level * 100)); try { lv.dispatchEvent(new Event("input", { bubbles: true })); } catch (e) {} }
  }
  /** Apply a scene: each layer crossfades (or fades in) to its track at its level; an empty layer fades out. */
  function applyScene(id) {
    var sc = scenes.filter(function (s) { return s.id === id; })[0]; if (!sc) return false;
    var s = Number(sc.sec) || 3;
    ["music", "ambient"].forEach(function (k) {
      var want = sc[k] || {}, t = want.track ? trackById(want.track) : null, level = want.level == null ? 0.8 : Number(want.level);
      var cur = M.snapshot()[k];
      if (!t) { if (cur.track) { M.fadeOut(k, s); push({ action: "fade_out", layer: k, sec: s }); } return; }
      var loop = k === "ambient" ? true : !!$("[data-mx-loop]", box(k)) && $("[data-mx-loop]", box(k)).checked;
      setLayerUi(k, t, level);
      M.setLevel(k, level);
      if (cur.track && cur.track.title === t.title && cur.playing) { push({ action: "level", layer: k, level: level }); return; }
      if (cur.track) { M.crossfade(k, t, s, { loop: loop }); push(Object.assign({ action: "crossfade", layer: k, sec: s, loop: loop, level: level }, wire(t))); }
      else { M.fadeIn(k, s, t, { loop: loop }); push(Object.assign({ action: "fade_in", layer: k, sec: s, loop: loop, level: level }, wire(t))); }
    });
    status("Scene: " + sc.name);
    return true;
  }
  function paintScenes() {
    var list = $("#mxSceneList");
    if (list) list.innerHTML = scenes.map(function (s) { return '<button type="button" class="btn sm mx-scene" data-mx-scene="' + esc(s.id) + '" title="Music: ' + esc((trackById(s.music && s.music.track) || {}).title || "none") + " · Ambient: " + esc((trackById(s.ambient && s.ambient.track) || {}).title || "none") + '">' + esc(s.name) + "</button>"; }).join("") || '<span class="lede">No scenes yet.</span>';
    var pick = $("#mxScenePick");
    if (pick) { var keep = pick.value; pick.innerHTML = '<option value="">New scene</option>' + scenes.map(function (s) { return '<option value="' + esc(s.id) + '">' + esc(s.name) + "</option>"; }).join(""); pick.value = scenes.some(function (s) { return s.id === keep; }) ? keep : ""; }
    ["Music", "Amb"].forEach(function (n) {
      var sel = $("#mxScene" + n); if (!sel) return; var keep = sel.value, k = n === "Music" ? "music" : "ambient";
      sel.innerHTML = '<option value="">None (fade out)</option>' + tracksFor(k).map(function (t) { return '<option value="' + esc(t.id) + '">' + esc(t.title) + "</option>"; }).join("");
      sel.value = keep;
    });
  }
  function loadSceneForm() {
    var id = $("#mxScenePick").value, sc = scenes.filter(function (s) { return s.id === id; })[0];
    $("#mxSceneName").value = sc ? sc.name : "";
    $("#mxSceneMusic").value = sc && sc.music ? sc.music.track || "" : "";
    $("#mxSceneAmb").value = sc && sc.ambient ? sc.ambient.track || "" : "";
    $("#mxSceneMusicLv").value = String(Math.round(((sc && sc.music && sc.music.level) != null ? sc.music.level : 0.8) * 100));
    $("#mxSceneAmbLv").value = String(Math.round(((sc && sc.ambient && sc.ambient.level) != null ? sc.ambient.level : 0.5) * 100));
    $("#mxSceneSec").value = String((sc && sc.sec) || 3);
    ["#mxSceneMusicLv", "#mxSceneAmbLv"].forEach(function (q) { try { $(q).dispatchEvent(new Event("input", { bubbles: true })); } catch (e) {} });
  }
  function saveSceneForm() {
    var name = ($("#mxSceneName").value || "").trim(), msg = $("#mxSceneMsg");
    if (!name) { msg.textContent = "Name the scene first."; return null; }
    var id = $("#mxScenePick").value, sc = scenes.filter(function (s) { return s.id === id; })[0];
    if (!sc) { sc = { id: "sc-" + Date.now().toString(36) }; scenes.push(sc); }
    sc.name = name;
    sc.music = { track: $("#mxSceneMusic").value, level: Number($("#mxSceneMusicLv").value) / 100 };
    sc.ambient = { track: $("#mxSceneAmb").value, level: Number($("#mxSceneAmbLv").value) / 100 };
    sc.sec = Number($("#mxSceneSec").value) || 3;
    saveScenes(); paintScenes(); $("#mxScenePick").value = sc.id;
    msg.textContent = "Saved " + name + ".";
    return sc;
  }
  function deleteScene() {
    var id = $("#mxScenePick").value, sc = scenes.filter(function (s) { return s.id === id; })[0], msg = $("#mxSceneMsg");
    if (!sc) { msg.textContent = "Pick a saved scene to delete."; return false; }
    if (root.confirm && !root.confirm("Delete the scene " + sc.name + "?")) return false;
    scenes = scenes.filter(function (s) { return s.id !== id; }); saveScenes(); paintScenes(); loadSceneForm();
    msg.textContent = "Deleted " + sc.name + ".";
    return true;
  }

  /* ---- 0.2.68 Stingers: one-shot SFX-pack cues over the music (never stop a layer). They go
     through the SFX engine, so every listener's SFX volume applies. Shared to players as "sfx". ---- */
  var STING_KEY = "ssdns.dmcc.stingers.v1";
  var DEFAULT_STINGERS = [{ event: "sting-tension", label: "Tension" }, { event: "sting-reveal", label: "Reveal" }, { event: "explode", label: "Dynamite" }];
  var stingers;
  try { stingers = JSON.parse(localStorage.getItem(STING_KEY) || "null"); } catch (e) { stingers = null; }
  if (!Array.isArray(stingers)) stingers = DEFAULT_STINGERS.slice();
  function shareable(ev) { var A = root.SSDNSAudio; return !A || !A.sharedCue || !!A.sharedCue(ev, "", ""); }
  function sting(ev) {
    if (!ev) return false;
    if (root.SSDNSAudio && root.SSDNSAudio.play) root.SSDNSAudio.play(ev);
    var D = root.DMCC;
    if (toTable() && D && D.pushCommand) { try { var pr = D.pushCommand({ type: "sfx", to: "all", payload: { event: ev, stinger: true }, from: D.state && D.state.uid }); if (pr && pr.catch) pr.catch(function () {}); } catch (e) {} }
    return true;
  }
  var SFX_EVENTS = ["sting-tension", "sting-reveal", "gatling-ellen-manor", "gatling", "fuse", "lightning-ultimate", "ice-storm", "magic-whoosh", "grapple-fire", "grapple-retract", "enemy-downed", "rifle", "misfire", "spear-throw", "bow-long", "attack", "jam", "spellshot", "pactshot", "spellcast", "explode", "slash", "thud", "twang", "whoosh", "revolver", "lever-fire", "plinker", "shotgun", "buffalo", "bow", "spear", "axe", "silenced", "lightning", "electric"];
  function paintStingers() {
    var list = $("#mxStingerList");
    if (list) list.innerHTML = stingers.map(function (s, i) { return '<span class="mx-sting"><button type="button" class="btn sm" data-mx-sting="' + esc(s.event) + '">' + esc(s.label || s.event) + '</button><button type="button" class="btn xs" data-mx-sting-del="' + i + '" title="Remove this stinger" aria-label="Remove ' + esc(s.label || s.event) + '">×</button></span>'; }).join("");
    var add = $("#mxStingerAdd");
    if (add && !add.options.length) add.innerHTML = SFX_EVENTS.filter(shareable).map(function (e) { return '<option value="' + esc(e) + '">' + esc(e) + "</option>"; }).join("");
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
      starter = (d && d.tracks || []).filter(function (t) { return t && t.id && (t.file || t.url); }); fill(); paintScenes();
    });
    paintScenes(); paintStingers();
    document.addEventListener("click", function (e) {
      var t = e.target.closest && e.target.closest("[data-mx-scene],[data-mx-sting],[data-mx-sting-del],#btnMxSceneSave,#btnMxSceneDel,#btnMxStingerAdd");
      if (!t || !t.closest("#panel-music")) return;
      if (t.hasAttribute("data-mx-scene")) applyScene(t.getAttribute("data-mx-scene"));
      else if (t.hasAttribute("data-mx-sting")) sting(t.getAttribute("data-mx-sting"));
      else if (t.hasAttribute("data-mx-sting-del")) { stingers.splice(Number(t.getAttribute("data-mx-sting-del")), 1); localStorage.setItem(STING_KEY, JSON.stringify(stingers)); paintStingers(); }
      else if (t.id === "btnMxSceneSave") saveSceneForm();
      else if (t.id === "btnMxSceneDel") deleteScene();
      else if (t.id === "btnMxStingerAdd") { var ev = $("#mxStingerAdd").value; if (!ev) return; stingers.push({ event: ev, label: ($("#mxStingerLabel").value || "").trim() || ev }); localStorage.setItem(STING_KEY, JSON.stringify(stingers)); $("#mxStingerLabel").value = ""; paintStingers(); }
    });
    var scPick = $("#mxScenePick"); if (scPick) scPick.addEventListener("change", loadSceneForm);
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
  root.SSDNSMusicDM = { act: act, fill: fill, meter: meter, applyScene: applyScene, scenes: function () { return scenes; }, saveSceneForm: saveSceneForm, deleteScene: deleteScene, sting: sting, stingers: function () { return stingers; }, toggle: function () { var s = M.snapshot().music; if (s.playing) act("music", "stop"); else act("music", "play"); }, tracks: all };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})(typeof window !== "undefined" ? window : globalThis);

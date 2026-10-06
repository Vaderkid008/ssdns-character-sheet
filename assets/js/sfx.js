/**
 * SSDNS sound framework. Config maps events and music tracks to files
 * under assets/sfx and assets/music. Missing files fail silently.
 */
(function (root) {
  "use strict";
  function audioKey() {
    var path = (root.location && root.location.pathname) || "";
    return /\/dm(\/|$)/.test(path) ? "ssdns.dm.audio" : "ssdns.sheet.audio";
  }
  var KEY = audioKey();
  var prefs = { muted: false, volume: 0.8 };
  try {
    var raw = root.localStorage.getItem(KEY);
    if (raw == null) {
      raw = root.localStorage.getItem("ssdns.audio");
      if (raw != null) root.localStorage.setItem(KEY, raw);
    }
    var saved = JSON.parse(raw || "null");
    if (saved) prefs = { muted: !!saved.muted, volume: typeof saved.volume === "number" ? saved.volume : 0.8 };
  } catch (e) {}

  var sfxMap = null;
  var musicEl = null;
  var pendingMusic = null;
  var liveSfx = [];

  function prefix() {
    var path = (root.location && root.location.pathname) || "";
    if (/\/dm(\/|$)/.test(path)) return "../";
    return "";
  }
  function fileUrl(folder, file) {
    return prefix() + "assets/" + folder + "/" + String(file || "").replace(/^\/+/, "");
  }
  function save() {
    try { root.localStorage.setItem(KEY, JSON.stringify(prefs)); } catch (e) {}
    syncControls();
  }
  function volume() {
    if (prefs.muted) return 0;
    var v = Number(prefs.volume);
    if (!isFinite(v)) v = 0.8;
    return Math.max(0, Math.min(1, v));
  }
  function syncControls() {
    var boxes = root.document ? root.document.querySelectorAll("[data-sfx-mute]") : [];
    var sliders = root.document ? root.document.querySelectorAll("[data-sfx-volume]") : [];
    Array.prototype.forEach.call(boxes, function (el) { el.checked = !prefs.muted; });
    Array.prototype.forEach.call(sliders, function (el) { el.value = String(Math.round(volume() * 100)); });
    if (musicEl) musicEl.volume = volume();
    applyLive();
  }
  function applyLive() {
    var v = volume();
    liveSfx = liveSfx.filter(function (audio) {
      if (!audio || audio.ended) return false;
      try { audio.volume = v; } catch (e) {}
      return true;
    });
  }

  function loadMap() {
    if (sfxMap) return Promise.resolve(sfxMap);
    return fetch(fileUrl("sfx", "sfx.json?v=0.3.3"))
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { sfxMap = (j && j.events) || {}; return sfxMap; })
      .catch(function () { sfxMap = {}; return sfxMap; });
  }

  function playUrl(url, loop) {
    var audio;
    try { audio = new Audio(url); } catch (e) { return null; }
    audio.loop = !!loop;
    audio.volume = volume();
    audio.addEventListener("error", function () { /* missing file: stay quiet */ });
    var started = audio.play();
    if (started && typeof started.catch === "function") started.catch(function () {});
    return audio;
  }

  var missingFiles = {};
  function startSfx(map, eventName) {
    var file = map && map[eventName];
    if (!file || missingFiles[file] || prefs.muted || volume() <= 0) return;
    var audio = playUrl(fileUrl("sfx", file), false);
    if (!audio) return;
    if (eventName === "jam") {
      try { audio.volume = Math.min(volume(), 0.45); } catch (e) {}
    }
    audio.addEventListener("error", function () { missingFiles[file] = 1; });
    liveSfx.push(audio);
    audio.addEventListener("ended", function () {
      var i = liveSfx.indexOf(audio);
      if (i >= 0) liveSfx.splice(i, 1);
    });
  }

  function forcedD20() {
    try {
      var q = new URLSearchParams(root.location.search).get("testroll");
      var n = parseInt(q, 10);
      if (n === 1 || n === 20) return n;
    } catch (e) {}
    return null;
  }
  function showTestBanner() {
    if (!root.document || !root.document.body || !forcedD20()) return;
    if (root.document.getElementById("testRollBanner")) return;
    var b = root.document.createElement("div");
    b.id = "testRollBanner";
    b.textContent = "TEST ROLLS · d20 = " + forcedD20();
    b.setAttribute("role", "status");
    b.style.cssText = "position:fixed;top:0;left:0;right:0;z-index:10000;background:#6b1d1d;color:#fff;text-align:center;font:700 12px/1.4 sans-serif;letter-spacing:.14em;padding:4px 8px;";
    root.document.body.appendChild(b);
  }
  function play(eventName) {
    try { root.dispatchEvent(new CustomEvent("ssdns-sfx", { detail: eventName })); } catch (e) {}
    if (prefs.muted || volume() <= 0) return;
    // Play in this turn when the map is already loaded so a button click is still a user gesture.
    if (sfxMap) { startSfx(sfxMap, eventName); return; }
    loadMap().then(function (map) { startSfx(map, eventName); });
  }

  function stopMusic() {
    pendingMusic = null;
    if (musicEl) {
      try { musicEl.pause(); } catch (e) {}
      musicEl = null;
    }
  }

  function playMusic(opts) {
    opts = opts || {};
    stopMusic();
    if (!opts.file || prefs.muted) {
      if (opts.file && prefs.muted && opts.onmissing) { /* muted is not missing */ }
      return;
    }
    var audio = null;
    try { audio = new Audio(fileUrl("music", opts.file)); } catch (e) { return; }
    musicEl = audio;
    audio.loop = !!opts.loop;
    audio.volume = typeof opts.volume === "number" ? opts.volume : volume();
    var missing = false;
    audio.addEventListener("error", function () {
      missing = true;
      if (opts.onmissing) opts.onmissing();
    });
    var started = audio.play();
    if (started && typeof started.then === "function") {
      started.then(function () { if (opts.onplay) opts.onplay(); }).catch(function (err) {
        if (missing) return;
        if (err && err.name === "NotAllowedError") {
          pendingMusic = audio;
          if (opts.onblocked) opts.onblocked();
        }
      });
    }
  }

  function resumeMusic() {
    if (!pendingMusic) return;
    var audio = pendingMusic;
    pendingMusic = null;
    musicEl = audio;
    var started = audio.play();
    if (started && typeof started.catch === "function") started.catch(function () {});
  }

  function bind() {
    if (!root.document) return;
    root.document.addEventListener("change", function (e) {
      var t = e.target;
      if (!t || !t.getAttribute) return;
      if (t.hasAttribute("data-sfx-mute")) {
        prefs.muted = !t.checked;
        save();
        if (prefs.muted) stopMusic();
      }
      if (t.hasAttribute("data-sfx-volume")) {
        prefs.volume = Math.max(0, Math.min(1, (parseInt(t.value, 10) || 0) / 100));
        save();
      }
    });
    syncControls();
    loadMap();
    showTestBanner();
  }

  var askBusy = false;
  var askQ = [];
  function askConfirm(message) {
    if (askQ._open === message && askQ._wait) return askQ._wait;
    for (var i = 0; i < askQ.length; i++) {
      if (askQ[i].message === message && askQ[i].promise) return askQ[i].promise;
    }
    var resolveJob;
    var pending = new Promise(function (resolve) { resolveJob = resolve; });
    askQ.push({ message: message, resolve: resolveJob, promise: pending });
    pumpAsk();
    return pending;
  }
  function pumpAsk() {
    if (askBusy || !askQ.length) return;
    var job = askQ.shift();
    askBusy = true;
    askQ._open = job.message;
    askQ._wait = openAsk(job.message).then(function (ok) {
      askBusy = false;
      askQ._open = "";
      askQ._wait = null;
      job.resolve(ok);
      pumpAsk();
      return ok;
    });
    return askQ._wait;
  }
  function openAsk(message) {
    return new Promise(function (resolve) {
      if (!root.document || !root.document.body) { resolve(false); return; }
      var dlg = root.document.createElement("dialog");
      dlg.className = "dlg ssdns-ask";
      dlg.innerHTML = "<form method='dialog'><p></p><div class='dlg-foot'><button class='btn' type='button' value='no'>No</button><button class='btn' type='submit' value='yes'>Yes</button></div></form>";
      dlg.querySelector("p").textContent = message || "";
      var settled = false;
      function finish(ok) {
        if (settled) return;
        settled = true;
        try { if (dlg.close) dlg.close(); } catch (e) {}
        if (dlg.parentNode) dlg.parentNode.removeChild(dlg);
        resolve(!!ok);
      }
      dlg.querySelector("[value=no]").addEventListener("click", function () { finish(false); });
      dlg.querySelector("form").addEventListener("submit", function (e) {
        e.preventDefault();
        finish(true);
      });
      dlg.addEventListener("cancel", function (e) { e.preventDefault(); finish(false); });
      root.document.body.appendChild(dlg);
      if (dlg.showModal) dlg.showModal();
      else dlg.setAttribute("open", "");
    });
  }
  root.SSDNSAsk = { confirm: askConfirm };
  root.SSDNSTestRoll = forcedD20;
  root.SSDNSAudio = {
    play: play,
    playMusic: playMusic,
    stopMusic: stopMusic,
    resumeMusic: resumeMusic,
    setMuted: function (on) { prefs.muted = !!on; save(); },
    setVolume: function (v) { prefs.volume = v; save(); },
    isMuted: function () { return !!prefs.muted; },
    volume: volume,
    fileUrl: fileUrl
  };

  loadMap();
  if (root.document && root.document.readyState === "loading") {
    root.document.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }
})(window);

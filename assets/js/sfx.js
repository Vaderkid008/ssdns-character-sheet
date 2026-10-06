/**
 * SSDNS sound framework. Config maps events and music tracks to files
 * under assets/sfx and assets/music. Missing files fail silently.
 */
(function (root) {
  "use strict";
  var KEY = "ssdns.audio";
  var prefs = { muted: false, volume: 0.8 };
  try {
    var saved = JSON.parse(root.localStorage.getItem(KEY) || "null");
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
    return fetch(fileUrl("sfx", "sfx.json?v=0.3.0"))
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

  function startSfx(map, eventName) {
    var file = map && map[eventName];
    if (!file || prefs.muted || volume() <= 0) return;
    var audio = playUrl(fileUrl("sfx", file), false);
    if (!audio) return;
    liveSfx.push(audio);
    audio.addEventListener("ended", function () {
      var i = liveSfx.indexOf(audio);
      if (i >= 0) liveSfx.splice(i, 1);
    });
  }

  function play(eventName) {
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
  }

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

  if (root.document && root.document.readyState === "loading") {
    root.document.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }
})(window);

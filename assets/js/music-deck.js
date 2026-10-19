/* SSDNS music deck (sheet 0.3.54 / DMCC 0.2.67). Two layers: music + ambient.
   Same engine on the DM page and the player sheet. The DM pushes "music" commands;
   players keep their own volume per layer and a mute (localStorage, never synced).
   Old payloads ({action:"play"|"stop", file, loop}) still work: they drive the music layer. */
(function (root) {
  "use strict";
  var KEY = "ssdns.music.v1";
  var LAYERS = ["music", "ambient"];
  var prefs = { music: 0.8, ambient: 0.6, muted: false };
  try { var saved = JSON.parse(root.localStorage.getItem(KEY) || "null"); if (saved) prefs = Object.assign(prefs, saved); } catch (e) {}
  var layers = {};
  var pending = [];
  var listeners = [];
  var blockedFn = null;
  LAYERS.forEach(function (k) { layers[k] = { el: null, track: null, level: 1, gain: 1, loop: k === "ambient", fade: null, paused: false }; });

  function clamp(v) { v = Number(v); return isFinite(v) ? Math.max(0, Math.min(1, v)) : 1; }
  function prefix() { var p = (root.location && root.location.pathname) || ""; return /\/dm(\/|$)/.test(p) ? "../" : ""; }
  function urlOf(t) {
    if (!t) return "";
    if (t.url && /^(https?:|blob:|data:)/.test(t.url)) return t.url;
    var f = String(t.file || t.url || "").replace(/^\/+/, "");
    if (!f) return "";
    if (/^assets\//.test(f)) return prefix() + f;
    return prefix() + "assets/music/" + f;
  }
  function layerOf(k) { return layers[k === "ambient" ? "ambient" : "music"]; }
  /* 0.3.54: perceptual volume. Sliders are linear 0..1; ears are logarithmic, so square it
     (50% ≈ -12 dB, 10% ≈ -40 dB). Linear felt dead across the top half. */
  function curve(x) { x = clamp(x); return x * x; }
  function effective(k) { var L = layerOf(k); return prefs.muted ? 0 : curve(clamp(L.level) * clamp(prefs[k])) * clamp(L.gain); }
  function applyVol(k) { var L = layerOf(k); if (L.el) try { L.el.volume = effective(k); } catch (e) {} }
  function emit() { var s = snapshot(); listeners.forEach(function (fn) { try { fn(s); } catch (e) {} }); }
  function savePrefs() { try { root.localStorage.setItem(KEY, JSON.stringify(prefs)); } catch (e) {} LAYERS.forEach(applyVol); emit(); }

  function clearFade(L) { if (L.fade) { clearInterval(L.fade); L.fade = null; } }
  function ramp(k, from, to, sec, done) {
    var L = layerOf(k); clearFade(L);
    var ms = Math.max(0, Number(sec) || 0) * 1000;
    L.gain = from; applyVol(k);
    if (!ms) { L.gain = to; applyVol(k); if (done) done(); return; }
    var t0 = Date.now();
    L.fade = setInterval(function () {
      var p = Math.min(1, (Date.now() - t0) / ms);
      L.gain = from + (to - from) * p; applyVol(k);
      if (p >= 1) { clearFade(L); if (done) done(); emit(); }
    }, 50);
  }
  function kill(L) {
    clearFade(L);
    if (L.el) { try { L.el.pause(); L.el.removeAttribute("src"); L.el.load && L.el.load(); } catch (e) {} }
    L.el = null; L.paused = false;
  }
  function start(k, el) {
    var p = null;
    try { p = el.play(); } catch (e) {}
    if (p && typeof p.then === "function") {
      p.then(emit).catch(function (err) {
        if (err && err.name === "NotAllowedError") { if (pending.indexOf(el) < 0) pending.push(el); if (blockedFn) blockedFn(k); emit(); }
      });
    }
  }
  function make(k, track, opts) {
    var src = urlOf(track);
    if (!src || typeof root.Audio !== "function") return null;
    var el = new root.Audio();
    el.preload = "auto";
    el.src = src;
    el.loop = opts.loop != null ? !!opts.loop : layerOf(k).loop;
    el.addEventListener("ended", function () { if (layerOf(k).el === el) { layerOf(k).track = null; emit(); } });
    el.addEventListener("error", function () { if (opts.onmissing) opts.onmissing(track); emit(); });
    el.addEventListener("timeupdate", function () { if (layerOf(k).el === el) emit(); });
    return el;
  }

  /* play(layer, track, {loop, fadeIn, at, level}) */
  function play(k, track, opts) {
    opts = opts || {};
    var L = layerOf(k);
    if (opts.level != null) L.level = clamp(opts.level);
    if (opts.loop != null) L.loop = !!opts.loop;
    kill(L);
    var el = make(k, track, opts);
    L.track = track || null;
    if (!el) { emit(); return false; }
    L.el = el;
    if (opts.at) try { el.currentTime = Number(opts.at) || 0; } catch (e) {}
    ramp(k, opts.fadeIn ? 0 : 1, 1, opts.fadeIn || 0);
    start(k, el);
    emit();
    return true;
  }
  function pause(k) { var L = layerOf(k); if (L.el) { try { L.el.pause(); } catch (e) {} L.paused = true; } emit(); }
  function resume(k) { var L = layerOf(k); if (L.el) { L.paused = false; start(k, L.el); } emit(); }
  function stop(k, opts) {
    opts = opts || {};
    var L = layerOf(k);
    if (opts.fade && L.el) { ramp(k, L.gain, 0, opts.fade, function () { kill(L); L.track = null; emit(); }); return; }
    kill(L); L.track = null; emit();
  }
  function stopAll(opts) { LAYERS.forEach(function (k) { stop(k, opts); }); }
  function fadeOut(k, sec) { stop(k, { fade: Number(sec) || 3 }); }
  function fadeIn(k, sec) { var L = layerOf(k); if (!L.el) return; if (L.paused) resume(k); ramp(k, 0, 1, Number(sec) || 3); }
  /* Crossfade the layer to another track over sec seconds. */
  function crossfade(k, track, sec, opts) {
    opts = opts || {};
    var L = layerOf(k), s = Number(sec) || 3;
    if (!L.el) return play(k, track, Object.assign({}, opts, { fadeIn: s }));
    var old = L.el, oldGain = L.gain, t0 = Date.now();
    var oldTimer = setInterval(function () {
      var p = Math.min(1, (Date.now() - t0) / (s * 1000));
      try { old.volume = Math.max(0, effective(k) / (clamp(L.gain) || 1) * oldGain * (1 - p)); } catch (e) {}
      if (p >= 1) { clearInterval(oldTimer); try { old.pause(); } catch (e) {} }
    }, 50);
    L.el = null; clearFade(L);
    var el = make(k, track, opts);
    L.track = track || null;
    if (!el) { emit(); return false; }
    L.el = el;
    ramp(k, 0, 1, s);
    start(k, el);
    emit();
    return true;
  }
  function seek(k, t) { var L = layerOf(k); if (L.el) try { L.el.currentTime = Math.max(0, Number(t) || 0); } catch (e) {} emit(); }
  function setLevel(k, v) { layerOf(k).level = clamp(v); applyVol(k); emit(); }
  function setLoop(k, on) { var L = layerOf(k); L.loop = !!on; if (L.el) L.el.loop = !!on; emit(); }

  /* Player-side prefs */
  function setPref(k, v) { if (LAYERS.indexOf(k) >= 0) prefs[k] = clamp(v); savePrefs(); }
  function setMuted(on) { prefs.muted = !!on; savePrefs(); }
  function getPrefs() { return Object.assign({}, prefs); }

  function resumeBlocked() {
    var list = pending.slice(); pending = [];
    list.forEach(function (el) { try { var p = el.play(); if (p && p.catch) p.catch(function () {}); } catch (e) {} });
    emit();
    return list.length;
  }
  function blocked() { return pending.length > 0; }

  function snapshot() {
    var out = { prefs: getPrefs(), blocked: blocked() };
    LAYERS.forEach(function (k) {
      var L = layers[k], el = L.el;
      out[k] = { track: L.track, playing: !!(el && !el.paused), paused: !!L.paused, loop: L.loop, level: L.level,
        time: el ? Number(el.currentTime) || 0 : 0, duration: el && isFinite(el.duration) ? el.duration : 0 };
    });
    return out;
  }

  /* Remote command from the DM. */
  function apply(payload, opts) {
    opts = opts || {};
    payload = payload || {};
    var k = payload.layer === "ambient" ? "ambient" : "music";
    var track = payload.file || payload.url ? { file: payload.file || "", url: payload.url || "", title: payload.title || "" } : null;
    switch (payload.action) {
      case "play": if (payload.level != null) setLevel(k, payload.level); return play(k, track, { loop: !!payload.loop, fadeIn: payload.fadeIn || 0, at: payload.at || 0, onmissing: opts.onmissing });
      case "crossfade": return crossfade(k, track, payload.sec, { loop: !!payload.loop, onmissing: opts.onmissing });
      case "pause": return pause(k);
      case "resume": return resume(k);
      case "fade_out": return fadeOut(k, payload.sec);
      case "fade_in": return fadeIn(k, payload.sec);
      case "seek": return seek(k, payload.at);
      case "level": return setLevel(k, payload.level);
      case "loop": return setLoop(k, payload.loop);
      case "stop_all": return stopAll({ fade: payload.sec || 0 });
      case "stop": default: return stop(k, { fade: payload.sec || 0 });
    }
  }

  function onChange(fn) { if (typeof fn === "function") listeners.push(fn); }
  function onBlocked(fn) { blockedFn = fn; }

  root.SSDNSMusic = {
    LAYERS: LAYERS, play: play, pause: pause, resume: resume, stop: stop, stopAll: stopAll, fadeOut: fadeOut, fadeIn: fadeIn,
    crossfade: crossfade, seek: seek, setLevel: setLevel, setLoop: setLoop, setPref: setPref, setMuted: setMuted, prefs: getPrefs,
    resumeBlocked: resumeBlocked, blocked: blocked, snapshot: snapshot, apply: apply, onChange: onChange, onBlocked: onBlocked, urlOf: urlOf, curve: curve, effective: effective
  };
})(typeof window !== "undefined" ? window : globalThis);

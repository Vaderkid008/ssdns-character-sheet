/* Gold Challenge sound pack (sheet 0.3.286).
   Jessey's exported v2 timings. Ordinary dice do not call this.
   A motion's roll cue starts with the animation. Its land cue fires when the
   die actually lands. ring=false fades the roll cue over 150ms at that moment.
   max 0 plays the whole clip. FAIL duration 0 inherits the motion length.
   Blank-spin rattle and suspense toggles were not in the export, so they stay off. */
(function (root) {
  "use strict";

  var PACK = {
    version: 2,
    motions: {
      roll: { roll: { pick: "custom", start: 0, max: 0, delay: 0 }, land: { pick: "liveCrit", start: 0, max: 12, delay: 0 }, ring: false, duration: 1100 },
      c1: { roll: { pick: "custom", start: 0, max: 0, delay: 0 }, land: { pick: "liveCrit", start: 0, max: 12, delay: 0 }, ring: false, duration: 900 },
      c2: { roll: { pick: "custom", start: 0, max: 0, delay: 0 }, land: { pick: "liveCrit", start: 0, max: 12, delay: 0 }, ring: false, duration: 850 },
      c3: { roll: { pick: "custom", start: 0, max: 0, delay: 0 }, land: { pick: "liveCrit", start: 0, max: 12, delay: 0 }, ring: false, duration: 1000 },
      fail: { roll: { pick: "custom", start: 0, max: 0, delay: 0 }, land: { pick: "liveFail", start: 0, max: 8, delay: 0 }, ring: false, duration: 0 }
    },
    simple: {
      rattle: { pick: "tick", start: 0, max: 0 },
      tension: { pick: "tension", start: 0, max: 0 },
      tick: { pick: "rattle", start: 0, max: 0 }
    }
  };
  /* Same land fractions the offline tool uses. C1 lands at the end of its roll-in. */
  var LAND_FRAC = { roll: 0.92, c1: 1, c2: 0.87, c3: 0.9 };
  var FILES = {
    fireball: "challenge-roll-fireball.mp3",
    fast: "challenge-roll-fast.mp3",
    liveCrit: "challenge-nat20-crit.wav",
    liveFail: "challenge-fail.wav",
    rattle: "roll-d20.mp3",
    tick: "ui-tick.mp3",
    tension: "sting-tension.mp3"
  };
  var CUSTOM = {
    "roll__roll": "fireball",
    "fail__roll": "fireball",
    "c1__roll": "fast",
    "c2__roll": "fast",
    "c3__roll": "fast"
  };
  var trace = [];
  var live = [];
  var caps = [];
  var fades = [];
  var rollAudio = null;

  function fileUrl(name) {
    var path = "";
    try { path = (root.location && root.location.pathname) || ""; } catch (e) {}
    var pre = path.indexOf("/dm/") >= 0 || path.indexOf("/tools/") >= 0 ? "../" : "";
    return pre + "assets/sfx/" + name;
  }
  function volume() {
    var A = root.SSDNSAudio;
    if (!A) return 0.8;
    try { if (typeof A.isMuted === "function" && A.isMuted()) return 0; } catch (e) {}
    try {
      var v = typeof A.volume === "function" ? Number(A.volume()) : 0.8;
      return isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.8;
    } catch (e2) { return 0.8; }
  }
  function note(row) {
    row.t = Date.now();
    trace.push(row);
  }
  function drop(a) {
    live = live.filter(function (x) { return x !== a; });
    if (rollAudio === a) rollAudio = null;
  }
  function clearTimers() {
    caps.forEach(function (id) { clearTimeout(id); });
    fades.forEach(function (id) { clearInterval(id); });
    caps = [];
    fades = [];
  }
  function urlFor(pick, slot, cueName) {
    if (!pick || pick === "none") return "";
    if (pick === "custom") {
      var id = CUSTOM[slot + "__" + cueName];
      return id && FILES[id] ? fileUrl(FILES[id]) : "";
    }
    if (FILES[pick]) return fileUrl(FILES[pick]);
    return "";
  }
  function arm(a, startSec, maxSec) {
    function apply() {
      try {
        if (startSec > 0) {
          var dur = isFinite(a.duration) ? a.duration : startSec;
          a.currentTime = Math.min(startSec, Math.max(0, dur - 0.05));
        }
      } catch (e) {}
      if (maxSec > 0) {
        caps.push(setTimeout(function () {
          try { a.pause(); } catch (e2) {}
          note({ kind: "cap", file: a._file || "", max: maxSec });
          drop(a);
        }, maxSec * 1000));
      }
    }
    if (a.readyState >= 1) apply();
    else a.addEventListener("loadedmetadata", apply, { once: true });
  }
  function playFile(url, startSec, maxSec) {
    var gain = volume();
    if (!url || gain <= 0 || typeof root.Audio !== "function") {
      note({ kind: "skip", file: url || "", start: startSec || 0, max: maxSec || 0 });
      return null;
    }
    var a = new root.Audio(url);
    a._file = url;
    a.volume = gain;
    live.push(a);
    a.addEventListener("ended", function () { drop(a); });
    arm(a, startSec || 0, maxSec || 0);
    note({ kind: "play", file: url, start: startSec || 0, max: maxSec || 0 });
    try {
      var p = a.play();
      if (p && typeof p.catch === "function") p.catch(function () {});
    } catch (e) {}
    return a;
  }
  function fadeOut(a, ms) {
    if (!a) return;
    var v0 = a.volume;
    var steps = Math.max(1, Math.round((ms || 150) / 25));
    var i = 0;
    note({ kind: "fade", file: a._file || "", ms: ms || 150 });
    var iv = setInterval(function () {
      i++;
      try { a.volume = Math.max(0, v0 * (1 - i / steps)); } catch (e) {}
      if (i >= steps) {
        clearInterval(iv);
        try { a.pause(); } catch (e2) {}
        drop(a);
      }
    }, 25);
    fades.push(iv);
  }
  function cueOf(slot, name) {
    var m = PACK.motions[slot];
    return (m && m[name]) || { pick: "none", start: 0, max: 0, delay: 0 };
  }
  function plan(motion, crit) {
    var visual = LAND_FRAC[motion] ? motion : "c1";
    var motionRow = PACK.motions[visual];
    var duration = motionRow && motionRow.duration > 0 ? motionRow.duration : 1100;
    var slot = crit ? visual : "fail";
    var cfg = PACK.motions[slot] || PACK.motions.fail;
    return {
      motion: visual,
      soundSlot: slot,
      duration: duration,
      landAt: Math.round(duration * LAND_FRAC[visual]),
      ring: !!cfg.ring,
      roll: cueOf(slot, "roll"),
      land: cueOf(slot, "land")
    };
  }
  function playCue(planRow, cueName) {
    var cue = planRow[cueName];
    if (!cue) return null;
    var delay = cueName === "roll" ? Math.max(0, +cue.delay || 0) : (+cue.delay || 0);
    function go() {
      var url = urlFor(cue.pick, planRow.soundSlot, cueName);
      var a = playFile(url, cue.start || 0, cue.max || 0);
      if (cueName === "roll") rollAudio = a;
    }
    if (cueName === "land" && delay > 0) caps.push(setTimeout(go, delay));
    else if (delay > 0) caps.push(setTimeout(go, delay));
    else go();
  }
  function begin(planRow) {
    stop();
    if (!planRow) return;
    note({ kind: "rollCue", slot: planRow.soundSlot, delay: planRow.roll && planRow.roll.delay || 0 });
    playCue(planRow, "roll");
  }
  function land(planRow) {
    if (!planRow) return;
    note({ kind: "landCue", slot: planRow.soundSlot, ring: !!planRow.ring, delay: planRow.land && planRow.land.delay || 0 });
    if (!planRow.ring) fadeOut(rollAudio, 150);
    playCue(planRow, "land");
  }
  function lockpick() {
    note({ kind: "lockpick" });
    return playFile(fileUrl("lockpick-attempt.mp3"), 0, 0);
  }
  function stop() {
    clearTimers();
    live.forEach(function (a) { try { a.pause(); } catch (e) {} });
    live = [];
    rollAudio = null;
    note({ kind: "stop" });
  }
  function mid() {
    var s = PACK.simple.tick;
    if (!s || s.pick === "none") return;
    note({ kind: "mid", pick: s.pick });
    playFile(urlFor(s.pick, "tick", "tick"), s.start || 0, s.max || 0);
  }

  root.SSDNSChallengeSfx = {
    pack: PACK,
    landFrac: LAND_FRAC,
    plan: plan,
    begin: begin,
    land: land,
    lockpick: lockpick,
    stop: stop,
    mid: mid,
    trace: function () { return trace.slice(); },
    resetTrace: function () { trace = []; }
  };
})(typeof window !== "undefined" ? window : globalThis);

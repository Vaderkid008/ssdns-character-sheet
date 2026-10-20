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
  var sfxPools = {};
  var weaponOverrides = {};
  var outcomeMap = { categories: {}, weapons: {} };
  var lastVariant = {};
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
    return fetch(fileUrl("sfx", "sfx.json?v=0.3.82"))
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        sfxMap = (j && j.events) || {};
        sfxPools = (j && j.pools) || {};
        weaponOverrides = (j && j.weapons) || {};
        outcomeMap = (j && j.outcomes) || { categories: {}, weapons: {} };
        if (!outcomeMap.categories) outcomeMap.categories = {};
        if (!outcomeMap.weapons) outcomeMap.weapons = {};
        try { preloadSfx(); } catch (e) {}
        return sfxMap;
      })
      .catch(function () { sfxMap = {}; sfxPools = {}; weaponOverrides = {}; outcomeMap = { categories: {}, weapons: {} }; return sfxMap; });
  }

  /* 0.3.58: warm every sfx file so a shot does not wait on fetch and decode. */
  var warm = {};
  function preloadSfx() {
    var files = {};
    Object.keys(sfxPools || {}).forEach(function (k) { (Array.isArray(sfxPools[k]) ? sfxPools[k] : []).forEach(function (f) { if (f) files[f] = 1; }); });
    Object.keys(sfxMap || {}).forEach(function (k) { [].concat(sfxMap[k] || []).forEach(function (f) { if (f) files[String(f)] = 1; }); });
    Object.keys(files).forEach(function (f) {
      var url = fileUrl("sfx", f);
      if (warm[url]) return;
      try {
        var el = new Audio();
        el.preload = "auto";
        el.addEventListener("error", function () { missingFiles[f] = 1; });
        el.src = url;
        if (el.load) el.load();
        warm[url] = el;
      } catch (e) {}
    });
  }
  function playUrl(url, loop) {
    var audio;
    try {
      var w = warm[url];
      audio = w && w.cloneNode ? w.cloneNode(true) : new Audio(url);
      if (!audio || typeof audio.play !== "function") audio = new Audio(url);
    } catch (e) { try { audio = new Audio(url); } catch (e2) { return null; } }
    audio.loop = !!loop;
    audio.volume = volume();
    audio.addEventListener("error", function () { /* missing file: stay quiet */ });
    var started = audio.play();
    if (started && typeof started.catch === "function") started.catch(function () {});
    return audio;
  }

  var missingFiles = {};
  var CUE_FALLBACK = {
    slash: "holster", thud: "holster", twang: "holster", whoosh: "holster", explode: "jam",
    revolver: "attack", "lever-fire": "attack", plinker: "attack", shotgun: "attack", buffalo: "attack", silenced: "attack",
    bow: "twang", spear: "twang", axe: "slash",
    lightning: "spellcast", electric: "spellcast", teleport: "spellcast", heal: "spellcast",
    "reload-lever": "reload", "reload-revolver": "reload", "empty-click": "misfire", jam: "misfire", cock: "holster",
    /* 0.3.56 approved set: a missing file falls back to its nearest neighbour */
    rifle: "attack", gatling: "attack", "gatling-ellen-manor": "gatling", "spear-throw": "spear", "bow-long": "bow",
    "sword-hit": "hit-melee", "crit-melee": "hit-melee", "miss-blunt": "miss-melee", "lightning-ultimate": "lightning",
    "ice-storm": "spellcast", "magic-whoosh": "spellcast", "end-turn": "holster", unjam: "cock", rechamber: "revolver-spin",
    "roll-d20": "roll", "roll-dice": "roll"
  };
  function hasPool(eventName) {
    return !!(sfxPools && Object.prototype.hasOwnProperty.call(sfxPools, eventName));
  }
  function eventFiles(map, eventName) {
    if (hasPool(eventName)) {
      var listed = sfxPools[eventName];
      if (!Array.isArray(listed)) return [];
      return listed.map(function (file) { return String(file || ""); }).filter(Boolean);
    }
    var file = map && map[eventName];
    if (Array.isArray(file)) return file.map(function (one) { return String(one || ""); }).filter(Boolean);
    if (file) return [String(file)];
    return null;
  }
  /** Pick a pool slot at random and skip the slot that just played. */
  function pickVariant(eventName, files, rnd) {
    var list = (files || []).filter(Boolean);
    if (!list.length) return "";
    var roll = typeof rnd === "function" ? Number(rnd()) : Math.random();
    if (!isFinite(roll)) roll = Math.random();
    if (list.length === 1) {
      lastVariant[eventName] = 0;
      return list[0];
    }
    var last = lastVariant[eventName];
    var choices = [];
    for (var i = 0; i < list.length; i++) if (i !== last) choices.push(i);
    if (!choices.length) choices = list.map(function (_, i) { return i; });
    var n = Math.floor(Math.abs(roll) * choices.length) % choices.length;
    var idx = choices[n];
    lastVariant[eventName] = idx;
    return list[idx];
  }
  /** Small pitch and volume swing so repeated placeholders do not sound identical. */
  function playbackJitter(rnd) {
    var roll = typeof rnd === "function" ? rnd : function () { return Math.random(); };
    var rate = 0.97 + (Number(roll()) || 0) * 0.06;
    var gain = 0.92 + (Number(roll()) || 0) * 0.16;
    return {
      playbackRate: Math.max(0.5, Math.min(2, rate)),
      gain: Math.max(0.5, Math.min(1.5, gain))
    };
  }
  function startSfx(map, eventName, depth) {
    var listed = eventFiles(map, eventName);
    if (listed && !listed.length) return null;
    var file = listed && listed.length ? pickVariant(eventName, listed) : "";
    if ((!file || missingFiles[file]) && CUE_FALLBACK[eventName] && !depth) {
      return startSfx(map, CUE_FALLBACK[eventName], 1);
    }
    if (!file || missingFiles[file] || prefs.muted || volume() <= 0) return null;
    var audio = playUrl(fileUrl("sfx", file), false);
    if (!audio) return null;
    var swing = playbackJitter();
    var base = eventName === "jam" ? Math.min(volume(), 0.45) : volume();
    try { audio.playbackRate = swing.playbackRate; } catch (e) {}
    try { audio.volume = Math.max(0, Math.min(1, base * swing.gain)); } catch (e2) {}
    audio.addEventListener("error", function () {
      missingFiles[file] = 1;
      try { audio.pause(); } catch (e2) {}
      if (!depth && CUE_FALLBACK[eventName]) startSfx(map, CUE_FALLBACK[eventName], 1);
    });
    liveSfx.push(audio);
    audio.addEventListener("ended", function () {
      var i = liveSfx.indexOf(audio);
      if (i >= 0) liveSfx.splice(i, 1);
    });
    return audio;
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
  // Cues a live table may share. Skill checks, initiative, chat, and reloads stay local.
  var SHARED_CUES = {
    attack: 1, jam: 1, spellshot: 1, pactshot: 1, spellcast: 1, explode: 1, slash: 1, thud: 1, twang: 1, whoosh: 1,
    revolver: 1, "lever-fire": 1, plinker: 1, shotgun: 1, buffalo: 1, bow: 1, spear: 1, axe: 1, silenced: 1,
    lightning: 1, electric: 1,
    /* 0.3.56 */
    misfire: 1, rifle: 1, gatling: 1, "gatling-ellen-manor": 1, "spear-throw": 1, "bow-long": 1, "lightning-ultimate": 1, "ice-storm": 1,
    "sting-tension": 1, "sting-reveal": 1, fuse: 1, "grapple-fire": 1, "grapple-retract": 1, "magic-whoosh": 1, "enemy-downed": 1
  };
  function sharedCue(eventName, fromUid, selfUid) {
    var name = String(eventName || "");
    if (!SHARED_CUES[name]) return "";
    if (fromUid && selfUid && String(fromUid) === String(selfUid)) return "";
    return name;
  }
  function classifyWeapon(info) {
    info = info || {};
    if (info.gun) return "gun";
    var group = String(info.group || "").toLowerCase();
    var dmg = String(info.dmgType || info.damageType || "").toLowerCase();
    var name = String(info.name || info.weapon || info.model || "").toLowerCase();
    var props = String(info.properties || "").toLowerCase();
    var kind = String(info.kind || "").toLowerCase();
    if (/pistol|rifle|carbine|shotgun|caster|bigbore/.test(group)) return "gun";
    if (/\b(gun|revolver|rifle|carbine|shotgun|pistol|derringer|pepperbox|musket|plinker)\b/.test(name)) return "gun";
    if (group === "bow" || /\bbow\b/.test(name)) return "bow";
    if (/\b(axe|hatchet|tomahawk)\b/.test(name)) return "axe";
    if (/\b(javelin|spear|pike)\b/.test(name)) return "spear";
    if (/\b(javelin|spear|dart)\b/.test(name) || kind === "thrown" || (/\bthrown\b/.test(props) && !/dagger|stiletto|knife|bowie/.test(name))) return "thrown";
    if (/slash/.test(dmg) || /sword|saber|sabre|scimitar|machete|knife|dagger|rapier|blade|stiletto|bowie/.test(name)) return "blade";
    if (/bludgeon/.test(dmg) || /unarmed|fist|kick|club|mace|hammer|staff|baton/.test(name)) return "bludgeon";
    return "other";
  }
  function weaponCue(info) {
    info = info || {};
    var explicit = info.sfx || "";
    if (explicit) return String(explicit);
    var id = info.id || info.weaponId || "";
    if (id && weaponOverrides[id]) return String(weaponOverrides[id]);
    var slug = String(info.weapon || info.model || "")
      .toLowerCase()
      .replace(/\([^)]*\)/g, " ")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    if (slug && weaponOverrides[slug]) return String(weaponOverrides[slug]);
    var kind = classifyWeapon(info);
    if (kind === "gun") return "attack";
    /* 0.3.56: axes and melee spears swing at the roll; their hit sound plays on the hit outcome. */
    if (kind === "axe") return "whoosh";
    if (kind === "spear") return /javelin|throw/.test(String(info.name || info.weapon || "").toLowerCase()) ? "spear-throw" : "whoosh";
    if (kind === "blade") return "slash";
    if (kind === "bludgeon") return "thud";
    if (kind === "bow" || kind === "thrown") return "twang";
    return "whoosh";
  }
  function reloadCue(info) {
    info = info || {};
    var action = String(info.action || "").toLowerCase();
    var group = String(info.group || "").toLowerCase();
    var name = String(info.name || info.model || "").toLowerCase();
    if (/lever/.test(action)) return "reload-lever";
    if (group === "pistol" || group === "caster" || /revolver|derringer|pepperbox|plinker|chaosmaker/.test(name)) return "reload-revolver";
    return "reload";
  }
  function spellCue(info) {
    info = info || {};
    var name = String(info.name || "").toLowerCase();
    var kind = String(info.kind || "").toLowerCase();
    if (kind === "heal" || /\b(heal|healing|cure)\b/.test(name)) return "heal";
    if (/shock|galvanic|electric/.test(name)) return "electric";
    if (/chain lightning|call lightning|lightning bolt|storm of vengeance/.test(name)) return "lightning-ultimate";
    if (/ice storm|sleet storm|cone of cold/.test(name)) return "ice-storm";
    if (/lightning|thunder/.test(name)) return "lightning";
    if (/teleport|misty step/.test(name)) return "teleport";
    if (info.calling === "pact-seeker") return "pactshot";
    if (info.attack || kind === "attack") return "spellshot";
    return "spellcast";
  }
  function outcomeCategory(info) {
    info = info || {};
    var kind = String(info.kind || "").toLowerCase();
    if (info.spell || kind === "spell") return "spell";
    if (info.gun || classifyWeapon(info) === "gun") return "gun";
    var props = String(info.properties || "").toLowerCase();
    var name = String(info.name || info.weapon || info.model || "").toLowerCase();
    var group = String(info.group || "").toLowerCase();
    if (group === "bow" || /\bbow\b|\barrow\b/.test(name) || kind === "thrown" || /\bthrown\b/.test(props) || /\b(javelin|dart)\b/.test(name)) return "arrow";
    return "melee";
  }
  function outcomeSlot(result) {
    var slot = String(result || "").toLowerCase();
    if (slot === "critical" || slot === "crit") return "crit";
    if (slot === "misfire" || slot === "miss") return "miss";
    if (slot === "hit") return "hit";
    return "";
  }
  /** Per-weapon override, then category default, then silent. */
  function outcomeCue(info, result) {
    info = info || {};
    var slot = outcomeSlot(result);
    if (!slot) return "";
    var tables = outcomeMap || { categories: {}, weapons: {} };
    var weapons = tables.weapons || {};
    var id = info.id || info.weaponId || "";
    var row = id && weapons[id];
    if (!row) {
      var slug = String(info.weapon || info.model || info.name || "")
        .toLowerCase()
        .replace(/\([^)]*\)/g, " ")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
      if (slug && weapons[slug]) row = weapons[slug];
    }
    if (row && row[slot]) return String(row[slot]);
    var cat = outcomeCategory(info);
    /* 0.3.56: a nat 1 on a non-gun roll plays the nat 1 sting (a gun's nat 1 is its misfire). */
    if (Number(info.nat) === 1 && slot === "miss" && cat !== "gun" && (tables.categories || {}).nat1 !== false && hasPool("nat1")) return "nat1";
    /* melee splits by weapon kind (blade, blunt, spear, axe) when the table has that row */
    if (cat === "melee") {
      var k = classifyWeapon(info), sub = k === "bludgeon" ? "blunt" : k;
      if ((tables.categories || {})[sub]) cat = sub;
    }
    var def = (tables.categories || {})[cat] || {};
    if (def[slot]) return String(def[slot]);
    return "";
  }
  function playOutcome(info, result) {
    var cue = outcomeCue(info, result);
    try { root.dispatchEvent(new CustomEvent("ssdns-sfx-outcome", { detail: { cue: cue, result: outcomeSlot(result), category: outcomeCategory(info) } })); } catch (e) {}
    if (!cue || prefs.muted || volume() <= 0) return cue;
    var slot = outcomeSlot(result);
    var hitCue = slot === "crit" && STING_CUES[cue] ? outcomeCue(info, "hit") : "";
    if (slot === "crit" && hitCue && hitCue !== cue) {
      /* crit = sting + the hit sound. Default: sting CRIT_LEAD_MS before the hit, both after the shot. */
      if (CRIT_BEFORE_SHOT) { nextFreeAt = Math.max(nextFreeAt, nowMs() + SFX_GAP_MS); startNow(cue); }
      else play(cue, { kind: "crit" });
      play(hitCue, { kind: "result" });
      return cue;
    }
    play(cue, { kind: "result" });
    return cue;
  }
  /* 0.3.58 play queue: results follow the shot the ear actually hears.
     Root cause fixed here (0.3.57 heard hits before the shot): the shot played through a fresh
     new Audio(url) per shot, so it waited on network fetch and decode, and its result was timed
     from when the shot was SCHEDULED, not when it started. A cached hit could beat a slow shot.
     The DMCC also queued enemy hits before the strike cue, and a DM-side verdict could arrive
     before the player's broadcast shot.
     Now:
     - Every sfx file is preloaded; a play clones the warm element.
     - Each shot / swing / roll / cast opens a "shot" record. Its real start comes from the
       'playing' event (less audio.currentTime). If it errors or does not start within
       SHOT_START_TIMEOUT_MS, the record is released anyway so the result still plays.
     - A result (hit, miss/ricochet, crit, nat 1, nat 20) plays RESULT_AFTER_SHOT_MS after that
       real start. A result with no shot yet waits up to RESULT_AFTER_SHOT_MS for one to arrive
       (broadcast order), then plays anyway.
     - A crit layers a sting CRIT_LEAD_MS before the hit sound. CRIT_BEFORE_SHOT = true plays the
       sting at once instead (the shot has already been fired by then; see README).
     - Enemy downed plays DOWNED_AFTER_RESULT_MS after the result's real start.
     - Misfire-type cues are immediate; other colliding cues are spaced SFX_GAP_MS apart.
     - No cue waits more than MAX_WAIT_MS from its request. */
  var SFX_GAP_MS = 250;
  var RESULT_AFTER_SHOT_MS = 750;
  var DOWNED_AFTER_RESULT_MS = 450;
  var CRIT_LEAD_MS = 150;
  var CRIT_BEFORE_SHOT = false;
  var JITTER_MS = 20;
  var MAX_WAIT_MS = 1800;
  var SHOT_START_TIMEOUT_MS = 1000;
  var ANCHOR_WINDOW_MS = 1800;
  var RESULT_DELAY_MS = RESULT_AFTER_SHOT_MS;
  var IMMEDIATE = { misfire: 1, jam: 1, "empty-click": 1 };
  var SHOT_CUES = { attack: 1, rifle: 1, revolver: 1, plinker: 1, "lever-fire": 1, shotgun: 1, buffalo: 1, silenced: 1, gatling: 1,
    "gatling-ellen-manor": 1, bow: 1, "bow-long": 1, "spear-throw": 1, slash: 1, thud: 1, twang: 1, whoosh: 1, spellshot: 1,
    pactshot: 1, lightning: 1, "lightning-ultimate": 1, electric: 1, "ice-storm": 1, spellcast: 1, "roll-d20": 1, roll: 1 };
  var RESULT_CUES = { "hit-gun": 1, ricochet: 1, "hit-melee": 1, "crit-melee": 1, "miss-melee": 1, "miss-blunt": 1, "sword-hit": 1,
    spear: 1, axe: 1, "hit-arrow": 1, "miss-arrow": 1, nat1: 1, nat20: 1 };
  var DOWNED_CUES = { "enemy-downed": 1 };
  var STING_CUES = { nat20: 1 };
  var nextFreeAt = 0;
  var pendingTimers = [];
  var lastShot = null, lastResult = null, orphanResults = [];
  var jitterRnd = function () { return Math.random(); };
  function nowMs() { return Date.now(); }
  function jitter() { return JITTER_MS ? Math.round((jitterRnd() * 2 - 1) * JITTER_MS) : 0; }
  function later(fn, ms) {
    if (typeof setTimeout !== "function") { fn(); return null; }
    var t = setTimeout(function () { var k = pendingTimers.indexOf(t); if (k >= 0) pendingTimers.splice(k, 1); fn(); }, Math.max(0, ms));
    pendingTimers.push(t);
    return t;
  }
  /* An anchor is a cue whose real start other cues wait on. */
  function makeAnchor(noTimeout) {
    var a = { at: nowMs(), startAt: null, waiters: [] };
    if (!noTimeout) a.timeout = later(function () { anchorStarted(a, null); }, SHOT_START_TIMEOUT_MS);
    return a;
  }
  function anchorStarted(a, startAt) {
    if (!a || a.startAt != null) return;
    a.startAt = startAt == null ? nowMs() : startAt;
    if (a.timeout) { try { clearTimeout(a.timeout); } catch (e) {} }
    var list = a.waiters; a.waiters = [];
    list.forEach(function (fn) { fn(a.startAt); });
  }
  function whenStarted(a, fn) { if (a.startAt != null) fn(a.startAt); else a.waiters.push(fn); }
  function recent(a) { return a && nowMs() - a.at < ANCHOR_WINDOW_MS; }
  function watchStart(audio, a) {
    if (!a) return;
    if (!audio) { anchorStarted(a, null); return; }
    var done = function () {
      var lag = 0;
      try { lag = (Number(audio.currentTime) || 0) * 1000 / (Number(audio.playbackRate) || 1); } catch (e) {}
      anchorStarted(a, nowMs() - lag);
    };
    try {
      audio.addEventListener("playing", done);
      audio.addEventListener("error", function () { anchorStarted(a, null); });
    } catch (e) { anchorStarted(a, null); }
  }
  /* Fire fn at absolute time `at`, but never later than `deadline`. */
  function fireAt(at, deadline, fn) {
    var t = Math.min(at, deadline) - nowMs();
    if (t <= 0) fn(); else later(fn, t);
  }
  function once(fn) { var ran = false; return function () { if (ran) return; ran = true; fn(); }; }
  function queueResult(eventName, offset) {
    var asked = nowMs(), deadline = asked + MAX_WAIT_MS;
    var anchor = makeAnchor(true); /* the result's own start, for a downed cue */
    lastResult = anchor;
    var go = once(function () { startNow(eventName, anchor); });
    later(go, MAX_WAIT_MS);
    var onShot = function (shot) { whenStarted(shot, function (s) { fireAt(s + offset + jitter(), deadline, go); }); };
    if (recent(lastShot)) { onShot(lastShot); return offset; }
    /* No shot yet: the strike may still be on its way (broadcast). Wait for one, then play anyway. */
    var orphan = { take: onShot, done: go };
    orphanResults.push(orphan);
    later(function () {
      var i = orphanResults.indexOf(orphan);
      if (i >= 0) { orphanResults.splice(i, 1); go(); }
    }, offset);
    return offset;
  }
  function queueDowned(eventName) {
    var asked = nowMs(), deadline = asked + MAX_WAIT_MS;
    var go = once(function () { startNow(eventName); });
    later(go, MAX_WAIT_MS);
    if (recent(lastResult)) {
      whenStarted(lastResult, function (r) { fireAt(r + DOWNED_AFTER_RESULT_MS + jitter(), deadline, go); });
      return DOWNED_AFTER_RESULT_MS;
    }
    return queueGap(eventName, 0, false, go);
  }
  function queueGap(eventName, delayMs, isShot, go) {
    var now = nowMs();
    var at = Math.max(now + (Number(delayMs) || 0), nextFreeAt);
    if (at - now > MAX_WAIT_MS) at = now + MAX_WAIT_MS;
    nextFreeAt = at + SFX_GAP_MS;
    var anchor = null;
    if (isShot) {
      anchor = makeAnchor();
      lastShot = anchor;
      var waiting = orphanResults; orphanResults = [];
      waiting.forEach(function (o) { o.take(anchor); });
    }
    var run = go || function () { startNow(eventName, anchor); };
    if (at - now <= 0) run(); else later(run, at - now);
    return at - now;
  }
  function schedule(eventName, delayMs, kindHint) {
    if (IMMEDIATE[eventName]) { nextFreeAt = Math.max(nextFreeAt, nowMs() + SFX_GAP_MS); startNow(eventName); return 0; }
    var kind = kindHint || (RESULT_CUES[eventName] ? "result" : DOWNED_CUES[eventName] ? "downed" : SHOT_CUES[eventName] ? "shot" : "other");
    if (kind === "result") return queueResult(eventName, RESULT_AFTER_SHOT_MS);
    if (kind === "crit") return queueResult(eventName, RESULT_AFTER_SHOT_MS - CRIT_LEAD_MS);
    if (kind === "downed") return queueDowned(eventName);
    return queueGap(eventName, delayMs, kind === "shot");
  }
  function startNow(eventName, anchor) {
    if (prefs.muted || volume() <= 0) { anchorStarted(anchor, null); return; }
    // Play in this turn when the map is already loaded so a button click is still a user gesture.
    if (sfxMap) { watchStart(startSfx(sfxMap, eventName), anchor); return; }
    loadMap().then(function (map) { watchStart(startSfx(map, eventName), anchor); });
  }
  function play(eventName, opts) {
    try { root.dispatchEvent(new CustomEvent("ssdns-sfx", { detail: eventName })); } catch (e) {}
    if (prefs.muted || volume() <= 0) return 0;
    return schedule(String(eventName || ""), opts && opts.delay, opts && opts.kind);
  }
  function resetQueue() {
    pendingTimers.forEach(function (t) { try { clearTimeout(t); } catch (e) {} });
    pendingTimers = []; nextFreeAt = 0; lastShot = null; lastResult = null; orphanResults = [];
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
      var sheet = root.document.getElementById("sheet");
      root.document.body.classList.add("ask-open");
      if (sheet) sheet.setAttribute("inert", "");
      function finish(ok) {
        if (settled) return;
        settled = true;
        root.document.body.classList.remove("ask-open");
        if (sheet) sheet.removeAttribute("inert");
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
  function planDirtyRolls(roll) {
    var n = roll ? roll() : (1 + Math.floor(Math.random() * 4));
    return [n];
  }
  function gunAt(index) {
    var app = root.SSDNSApp;
    var doc = app && app.doc && app.doc();
    var guns = doc && doc.character && doc.character.guns;
    return guns && guns[index];
  }
  function persistDoc() {
    var app = root.SSDNSApp;
    if (app && app.refreshGunFace) app.refreshGunFace();
    else if (app && app.applyPatch) app.applyPatch(function () {});
  }
  function broadcastD4(title, n, label) {
    var text = (title || "Dirty d4") + ": 1d4 = " + n + " — " + label;
    if (root.SSDNSDmJoin && root.SSDNSDmJoin.postFeed) {
      root.SSDNSDmJoin.postFeed({ kind: "d4", text: text, result: n, formula: "1d4", face: n });
    }
    if (root.SSDNSSheet && root.SSDNSSheet.addLog) root.SSDNSSheet.addLog({ kind: "roll", text: text, formula: "1d4", result: n, face: n });
  }
  function wielderName() {
    var app = root.SSDNSApp;
    var doc = app && app.doc && app.doc();
    var c = doc && doc.character;
    return (c && (c.name || c.player)) || "You";
  }
  function catalogGunName(g) {
    if (!g) return "Gun";
    var id = g.weapon || g.id || "";
    var lists = [].concat((root.SSDNS_RULES && root.SSDNS_RULES.firearms) || [], (root.SSDNS_RULES && root.SSDNS_RULES.casterGuns) || []);
    var w = lists.filter(function (x) { return x && (x.id === id || x.name === g.name); })[0];
    if (!w && root.SSDNSTestJammer && root.SSDNSTestJammer.lookup) w = root.SSDNSTestJammer.lookup(id || g.name);
    if (!w && root.SSDNSPeaceMaker && root.SSDNSPeaceMaker.lookup) w = root.SSDNSPeaceMaker.lookup(id || g.name);
    if (w && w.name) return w.name;
    if (g.name && g.name !== id) return g.name;
    return g.name || id || "Gun";
  }
  function explosionText(gunName, damage) {
    var who = wielderName();
    var gun = gunName || "Gun";
    if (root.SSDNSMisfire && root.SSDNSMisfire.explosionLine) return root.SSDNSMisfire.explosionLine(who, gun, damage);
    return who + " · " + gun + " · " + damage + " fire";
  }
  function broadcastFire(text, damage) {
    var shown = String(text || "");
    if (shown.indexOf("1d4") < 0 && /\d+\s+fire$/.test(shown)) {
      shown = shown.replace(/(\d+)\s+fire$/, "1d4 fire = $1");
    }
    if (root.SSDNSDmJoin && root.SSDNSDmJoin.postFeed) {
      root.SSDNSDmJoin.postFeed({ kind: "d4", text: shown, result: damage, formula: "1d4", face: damage });
    }
    if (root.SSDNSSheet && root.SSDNSSheet.addLog) root.SSDNSSheet.addLog({ kind: "roll", text: shown, formula: "1d4", result: damage, face: damage });
  }
  function rollFire() {
    if (root.SSDNSMisfire && root.SSDNSMisfire.fireRoll) return root.SSDNSMisfire.fireRoll();
    return 1 + Math.floor(Math.random() * 4);
  }
  function armDirty(index) {
    var g = gunAt(index);
    if (!g) return Promise.resolve(0);
    if (!g.pendingD4Rolls || !g.pendingD4Rolls.length) {
      g.pendingD4Rolls = planDirtyRolls();
      g.pendingD4Step = 0;
    }
    g.pendingD4 = true;
    persistDoc();
    var name = catalogGunName(g);
    return revealDie({ sides: 4, index: index, gun: name, title: "Dirty d4", rolls: g.pendingD4Rolls, step: g.pendingD4Step || 0 });
  }
  function optsName(g) {
    return (g && (g.name || g.weapon)) || "Gun";
  }
  function revealDie(opts) {
    opts = opts || {};
    var sides = opts.sides === 6 ? 6 : 4;
    return new Promise(function (resolve) {
      if (!root.document || !root.document.body) { resolve(1); return; }
      var dlg = root.document.createElement("dialog");
      dlg.className = "dlg d4-reveal";
      var title = opts.title || (sides === 6 ? "Roll the d6" : "Dirty d4");
      dlg.innerHTML = "<form method='dialog'><h2></h2><p class='d4-face' id='d4Face'>Click the die</p><p class='d4-fire' id='d4Fire' hidden></p><button type='button' class='btn btn-primary d4-die' id='d4Btn'>d" + sides + "</button></form>";
      dlg.querySelector("h2").textContent = title;
      var face = dlg.querySelector("#d4Face");
      var fireLine = dlg.querySelector("#d4Fire");
      var btn = dlg.querySelector("#d4Btn");
      if (root.SSDNSDice && root.SSDNSDice.paint) root.SSDNSDice.paint(btn, sides, null);
      var token = { live: true };
      revealDie._open = revealDie._open || [];
      revealDie._open.push(token);
      var sheet = root.document.getElementById("sheet");
      root.document.body.classList.add("ask-open");
      if (sheet) sheet.setAttribute("inert", "");
      var settled = false;
      var step = opts.step || 0;
      function words(n) {
        if (opts.faces && opts.faces[n]) return opts.faces[n];
        if (sides === 4 && root.SSDNSMisfire) {
          var gun = opts.index != null ? gunAt(opts.index) : null;
          var face = root.SSDNSMisfire.d4Result(n, root.SSDNSMisfire.isRugged(gun || {}));
          if (face.explode) return "EXPLODES";
          if (face.fouled) return "FOULED";
          if (face.lock) return "LOCK";
          if (face.wild || face.wildShot) return "WILD SHOT";
          if (face.jammed) return "JAMMED";
        }
        if (sides === 4) return { 1: "EXPLODES", 2: "FOULED", 3: "LOCK", 4: "WILD SHOT" }[n] || String(n);
        return String(n);
      }
      function savedRoll() {
        var g = opts.index != null ? gunAt(opts.index) : null;
        var list = (g && g.pendingD4Rolls) || opts.rolls || [];
        var at = g && g.pendingD4Step != null ? g.pendingD4Step : step;
        if (list[at] != null) return list[at];
        return 1 + Math.floor(Math.random() * sides);
      }
      function finish(n) {
        if (!token.live) {
          if (!settled) {
            settled = true;
            resolve(0);
          }
          return;
        }
        if (settled) return;
        settled = true;
        root.document.body.classList.remove("ask-open");
        if (sheet) sheet.removeAttribute("inert");
        try { if (dlg.close) dlg.close(); } catch (e) {}
        if (dlg.parentNode) dlg.parentNode.removeChild(dlg);
        if (sides === 4 && n === 1 && root.SSDNSAudio) root.SSDNSAudio.play("explode");
        if (opts.index != null && sides === 4) applyDirtyDie(n, opts);
        resolve(n);
      }
      btn.addEventListener("click", function () {
        var n = savedRoll();
        var label = words(n);
        var gunNow = opts.index != null ? gunAt(opts.index) : null;
        var rugged = root.SSDNSMisfire && root.SSDNSMisfire.isRugged && root.SSDNSMisfire.isRugged(gunNow || {});
        var result = sides === 4 && root.SSDNSMisfire && root.SSDNSMisfire.d4Result
          ? root.SSDNSMisfire.d4Result(n, rugged)
          : null;
        if (root.SSDNSAudio) root.SSDNSAudio.play("roll");
        face.textContent = n + " — " + label;
        if (root.SSDNSDice && root.SSDNSDice.paint) root.SSDNSDice.paint(btn, sides, n);
        else btn.textContent = String(n);
        if (root.SSDNSDice && root.SSDNSDice.show) root.SSDNSDice.show({ sides: sides, face: n, formula: "1d" + sides, total: n });
        broadcastD4(title, n, label);
        var hold = 900;
        if (result && result.explode) {
          var damage = rollFire();
          var gunName = opts.gun || catalogGunName(gunNow);
          var line = explosionText(gunName, damage);
          opts.fireDamage = damage;
          opts.fireLine = line;
          opts.fireTold = true;
          if (fireLine) {
            fireLine.hidden = false;
            fireLine.textContent = line;
          }
          if (root.SSDNSDice && root.SSDNSDice.paint) root.SSDNSDice.paint(btn, 4, damage);
          else btn.textContent = String(damage);
          if (root.SSDNSDice && root.SSDNSDice.show) root.SSDNSDice.show({ sides: 4, face: damage, formula: "1d4", total: damage });
          broadcastFire(line, damage);
          hold = 1600;
        }
        setTimeout(function () { finish(n); }, hold);
      });
      dlg.addEventListener("cancel", function (e) { e.preventDefault(); });
      root.document.body.appendChild(dlg);
      if (dlg.showModal) dlg.showModal();
      else dlg.setAttribute("open", "");
    });
  }
  function weaponProps(g) {
    var id = g && g.weapon;
    var lists = [].concat((root.SSDNS_RULES && root.SSDNS_RULES.firearms) || [], (root.SSDNS_RULES && root.SSDNS_RULES.casterGuns) || []);
    var w = lists.filter(function (x) { return x.id === id; })[0];
    if (!w && root.SSDNSTestJammer && root.SSDNSTestJammer.lookup) w = root.SSDNSTestJammer.lookup(id);
    return w && w.properties || "";
  }
  function applyDirtyDie(n, opts) {
    var app = root.SSDNSApp;
    var doc = app && app.doc && app.doc();
    var guns = doc && doc.character && doc.character.guns;
    var g = guns && guns[opts.index];
    if (!g) return;
    var applied = root.SSDNSMisfire && root.SSDNSMisfire.applyD4
      ? root.SSDNSMisfire.applyD4(g, n, { capacity: g.capacity || (g.chambers && g.chambers.length) || 0, chamber: opts.chamber })
      : null;
    var next = applied && applied.gun;
    var face = applied ? applied.face : (root.SSDNSMisfire ? root.SSDNSMisfire.d4Result(n, false) : null);
    g.pendingD4 = false;
    g.pendingD4Rolls = null;
    g.pendingD4Step = 0;
    if (next) {
      g.jammed = !!next.jammed;
      g.fouled = !!next.fouled;
      g.ruined = !!next.ruined;
      g.broken = !!next.broken;
      g.misStreak = Number(next.misStreak) || 0;
      g.lockedChambers = (next.lockedChambers || []).slice();
      g.exploded = !!next.exploded;
      if (next.lockIndex != null && Array.isArray(g.chambers)) {
        g.chambers[next.lockIndex] = "";
        g.loaded = g.chambers.filter(Boolean).length;
      }
    }
    if (face && face.explode) {
      var fire = opts.fireDamage != null && isFinite(Number(opts.fireDamage)) ? Number(opts.fireDamage) : rollFire();
      var boom = opts.fireLine || explosionText(opts.gun || catalogGunName(g), fire);
      g.exploded = true;
      if (!opts.fireTold) broadcastFire(boom, fire);
      if (root.SSDNSSheet && root.SSDNSSheet.applyDelta) root.SSDNSSheet.applyDelta(-fire, boom);
    }
    if (face && (face.wild || face.wildShot) && root.SSDNSOfferWildShot) root.SSDNSOfferWildShot(opts.index, { gunName: opts.gun });
    if (app && app.refreshGunFace) app.refreshGunFace();
    else if (app && app.applyPatch) app.applyPatch(function () {});
  }
  function cancelReveal() {
    (revealDie._open || []).forEach(function (token) { token.live = false; });
    revealDie._open = [];
    if (!root.document) return;
    var dlg = root.document.querySelector("dialog.d4-reveal");
    if (dlg && dlg.parentNode) dlg.parentNode.removeChild(dlg);
    if (root.document.body) root.document.body.classList.remove("ask-open");
    var sheet = root.document.getElementById("sheet");
    if (sheet) sheet.removeAttribute("inert");
  }
  root.SSDNSD4 = { reveal: revealDie, plan: planDirtyRolls, arm: armDirty, cancel: cancelReveal };
  root.SSDNSAsk = { confirm: askConfirm };
  root.SSDNSTestRoll = forcedD20;
  root.SSDNSAudio = {
    play: play,
    weaponCue: weaponCue,
    outcomeCue: outcomeCue,
    outcomeCategory: outcomeCategory,
    playOutcome: playOutcome,
    reloadCue: reloadCue,
    spellCue: spellCue,
    sharedCue: sharedCue,
    playMusic: playMusic,
    stopMusic: stopMusic,
    resumeMusic: resumeMusic,
    setMuted: function (on) { prefs.muted = !!on; save(); },
    setVolume: function (v) { prefs.volume = v; save(); },
    isMuted: function () { return !!prefs.muted; },
    volume: volume,
    fileUrl: fileUrl,
    poolFiles: function (name) { return eventFiles(sfxMap, name); },
    pickVariant: pickVariant,
    playbackJitter: playbackJitter,
    resetVariants: function () { lastVariant = {}; },
    resetQueue: resetQueue, SFX_GAP_MS: SFX_GAP_MS, RESULT_DELAY_MS: RESULT_DELAY_MS,
    TIMING: { gap: SFX_GAP_MS, resultAfterShot: RESULT_AFTER_SHOT_MS, downedAfterResult: DOWNED_AFTER_RESULT_MS, critLead: CRIT_LEAD_MS,
      critBeforeShot: CRIT_BEFORE_SHOT, jitter: JITTER_MS, maxWait: MAX_WAIT_MS, shotStartTimeout: SHOT_START_TIMEOUT_MS },
    setJitterSource: function (fn) { jitterRnd = typeof fn === "function" ? fn : function () { return Math.random(); }; }
  };

  loadMap();
  if (root.document && root.document.readyState === "loading") {
    root.document.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }
})(window);

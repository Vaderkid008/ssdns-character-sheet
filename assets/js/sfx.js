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
  var weaponOverrides = {};
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
    return fetch(fileUrl("sfx", "sfx.json?v=0.3.17"))
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        sfxMap = (j && j.events) || {};
        weaponOverrides = (j && j.weapons) || {};
        return sfxMap;
      })
      .catch(function () { sfxMap = {}; weaponOverrides = {}; return sfxMap; });
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
  var CUE_FALLBACK = { slash: "holster", thud: "holster", twang: "holster", whoosh: "holster", explode: "jam" };
  function startSfx(map, eventName, depth) {
    var file = map && map[eventName];
    if ((!file || missingFiles[file]) && CUE_FALLBACK[eventName] && !depth) {
      startSfx(map, CUE_FALLBACK[eventName], 1);
      return;
    }
    if (!file || missingFiles[file] || prefs.muted || volume() <= 0) return;
    var audio = playUrl(fileUrl("sfx", file), false);
    if (!audio) return;
    if (eventName === "jam") {
      try { audio.volume = Math.min(volume(), 0.45); } catch (e) {}
    }
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
  var SHARED_CUES = { attack: 1, jam: 1, spellshot: 1, pactshot: 1, spellcast: 1, explode: 1, slash: 1, thud: 1, twang: 1, whoosh: 1 };
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
    if (/\b(javelin|spear|dart)\b/.test(name) || kind === "thrown" || (/\bthrown\b/.test(props) && !/dagger|stiletto|knife|bowie/.test(name))) return "thrown";
    if (/slash/.test(dmg) || /sword|saber|sabre|scimitar|machete|axe|knife|dagger|rapier|blade|stiletto|bowie/.test(name)) return "blade";
    if (/bludgeon/.test(dmg) || /unarmed|fist|kick|club|mace|hammer|staff|baton/.test(name)) return "bludgeon";
    return "other";
  }
  function weaponCue(info) {
    info = info || {};
    var explicit = info.sfx || "";
    if (explicit) return String(explicit);
    var id = info.id || info.weaponId || "";
    if (id && weaponOverrides[id]) return String(weaponOverrides[id]);
    var kind = classifyWeapon(info);
    if (kind === "gun") return "attack";
    if (kind === "blade") return "slash";
    if (kind === "bludgeon") return "thud";
    if (kind === "bow" || kind === "thrown") return "twang";
    return "whoosh";
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
    var rolls = [];
    var guard = 0;
    var n = 4;
    while (n === 4 && guard < 12) {
      n = roll ? roll() : (1 + Math.floor(Math.random() * 4));
      rolls.push(n);
      guard++;
    }
    return rolls;
  }
  function gunAt(index) {
    var app = root.SSDNSApp;
    var doc = app && app.doc && app.doc();
    var guns = doc && doc.character && doc.character.guns;
    return guns && guns[index];
  }
  function persistDoc() {
    var app = root.SSDNSApp;
    if (app && app.applyPatch) app.applyPatch(function () {});
  }
  function broadcastD4(title, n, label) {
    var text = (title || "Dirty d4") + ": " + n + " — " + label;
    if (root.SSDNSDmJoin && root.SSDNSDmJoin.postFeed) {
      root.SSDNSDmJoin.postFeed({ kind: "d4", text: text, result: n, formula: "1d4" });
    }
    if (root.SSDNSSheet && root.SSDNSSheet.addLog) root.SSDNSSheet.addLog({ kind: "roll", text: text });
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
    var name = optsName(g);
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
      dlg.innerHTML = "<form method='dialog'><h2></h2><p class='d4-face' id='d4Face'>Click the die</p><button type='button' class='btn btn-primary d4-die' id='d4Btn'>d" + sides + "</button></form>";
      dlg.querySelector("h2").textContent = title;
      var face = dlg.querySelector("#d4Face");
      var btn = dlg.querySelector("#d4Btn");
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
          if (face.jammed) return "JAMMED";
          if (face.again) return "Roll again!";
        }
        if (sides === 4) return { 1: "EXPLODES", 2: "FOULED", 3: "JAMMED", 4: "Roll again!" }[n] || String(n);
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
        if (root.SSDNSAudio) root.SSDNSAudio.play(n === 1 && sides === 4 ? "roll" : "roll");
        face.textContent = n + " — " + label;
        btn.textContent = String(n);
        broadcastD4(title, n, label);
        if (sides === 4 && n === 4) {
          var g4 = opts.index != null ? gunAt(opts.index) : null;
          if (g4) {
            g4.pendingD4Step = (g4.pendingD4Step || 0) + 1;
            if (!g4.pendingD4Rolls || g4.pendingD4Rolls[g4.pendingD4Step] == null) {
              var next = planDirtyRolls();
              g4.pendingD4Rolls = (g4.pendingD4Rolls || []).concat(next);
            }
            persistDoc();
          } else step += 1;
          return;
        }
        setTimeout(function () { finish(n); }, 900);
      });
      dlg.addEventListener("cancel", function (e) { e.preventDefault(); });
      root.document.body.appendChild(dlg);
      if (dlg.showModal) dlg.showModal();
      else dlg.setAttribute("open", "");
    });
  }
  function weaponProps(g) {
    var lists = [].concat((root.SSDNS_RULES && root.SSDNS_RULES.firearms) || [], (root.SSDNS_RULES && root.SSDNS_RULES.casterGuns) || []);
    var w = lists.filter(function (x) { return x.id === (g && g.weapon); })[0];
    return w && w.properties || "";
  }
  function applyDirtyDie(n, opts) {
    var app = root.SSDNSApp;
    var doc = app && app.doc && app.doc();
    var guns = doc && doc.character && doc.character.guns;
    var g = guns && guns[opts.index];
    if (!g) return;
    g.pendingD4 = false;
    g.pendingD4Rolls = null;
    g.pendingD4Step = 0;
    g.misStreak = 0;
    var rugged = root.SSDNSMisfire
      ? root.SSDNSMisfire.isRugged({ weapon: g.weapon, properties: weaponProps(g), rugged: opts.rugged })
      : !!opts.rugged;
    var face = root.SSDNSMisfire ? root.SSDNSMisfire.d4Result(n, rugged) : null;
    if (face && face.explode) {
      g.ruined = true;
      g.broken = true;
      g.jammed = false;
      g.fouled = false;
      var fire = 1 + Math.floor(Math.random() * 4);
      if (root.SSDNSSheet && root.SSDNSSheet.applyDelta) root.SSDNSSheet.applyDelta(-fire, (opts.gun || "Gun") + " explodes: " + fire + " fire");
    } else if (face && face.fouled) {
      g.fouled = true;
      g.jammed = false;
    } else if (face && face.jammed) {
      g.jammed = true;
    } else if (n === 1) {
      g.ruined = true;
      g.broken = true;
      g.jammed = false;
    } else if (n === 2) {
      if (rugged) g.jammed = true;
      else g.fouled = true;
    } else if (n === 3) g.jammed = true;
    if (app && app.applyPatch) app.applyPatch(function () {});
  }
  root.SSDNSD4 = { reveal: revealDie, plan: planDirtyRolls, arm: armDirty };
  root.SSDNSAsk = { confirm: askConfirm };
  root.SSDNSTestRoll = forcedD20;
  root.SSDNSAudio = {
    play: play,
    weaponCue: weaponCue,
    sharedCue: sharedCue,
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

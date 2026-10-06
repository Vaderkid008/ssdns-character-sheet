/**
 * SSDNS player sheet · Join room (DMCC bridge)
 * When NOT joined: no network, identical to stock sheet.
 * When joined: publish snapshot, ledger on ES changes, listen for DM commands.
 *
 * Depends on: window.SSDNS_FIREBASE_CONFIG, window.SSDNSApp (after boot), window.SSDNSBridge
 * Loaded as classic script; Firebase modular SDK loaded dynamically only on Join.
 */
(function (root) {
  "use strict";
  var LS_KEY = "ssdns.sheet.dmJoin";
  var LS_OLD = "ssdns.v1.dmJoin";
  function sheetStore(name) { return "ssdns.sheet." + name; }
  function readStore(name) {
    var next = sheetStore(name);
    try {
      var cur = localStorage.getItem(next);
      if (cur != null) return cur;
      var old = localStorage.getItem("ssdns.v1." + name);
      if (old != null) localStorage.setItem(next, old);
      return old;
    } catch (e) { return null; }
  }
  function writeStore(name, value) {
    try { localStorage.setItem(sheetStore(name), value); } catch (e) {}
  }
  var BIG_JUMP = 500;
  var state = {
    joined: false,
    roomCode: null,
    uid: null,
    app: null,
    db: null,
    auth: null,
    unsubs: [],
    lastEs: null,
    lastCmdSeen: {},
    publishing: false,
    _chatSeen: {},
    _ledSeen: {},
    _feedSeen: {},
    connected: null,
    marker: 0,
    link: "",
    tabId: "tab_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    connId: "conn_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    readOnly: false,
    joinEpoch: 0,
    left: false,
    inviteCode: ""
  };

  function $(s, r) { return (r || document).querySelector(s); }
  function toast(msg, actLabel, actFn, ms, opts) {
    if (root.SSDNSToast) return root.SSDNSToast(msg, actLabel, actFn, ms, opts);
    var t = $("#toastText");
    var box = $("#toast");
    if (t && box) {
      t.textContent = msg;
      box.hidden = false;
      clearTimeout(toast._t);
      toast._t = setTimeout(function () { box.hidden = true; }, 3200);
    } else {
      console.info("[DM Join]", msg);
    }
  }

  function saveLocal() {
    try {
      var d = doc();
      var cid = (d && d.id) || "";
      if (!state.joined || !state.roomCode || state.left) {
        root.localStorage.setItem(LS_KEY, JSON.stringify({
          joined: false,
          left: true,
          by: "sheet",
          leftAt: Date.now(),
          characterId: cid
        }));
        root.localStorage.removeItem(LS_OLD);
        return;
      }
      var prev = null;
      try { prev = JSON.parse(root.localStorage.getItem(LS_KEY) || "null"); } catch (err) { prev = null; }
      var joinedAt = prev && prev.joined === true && prev.roomCode === state.roomCode && prev.characterId === cid && prev.joinedAt
        ? prev.joinedAt
        : Date.now();
      root.localStorage.setItem(LS_KEY, JSON.stringify({
        roomCode: state.roomCode,
        joined: true,
        uid: state.uid,
        by: "sheet",
        characterId: cid,
        joinedAt: joinedAt
      }));
      root.localStorage.removeItem(LS_OLD);
    } catch (e) {}
  }
  function loadLocal() {
    try {
      var raw = root.localStorage.getItem(LS_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (parsed && parsed.joined === false) return parsed;
      return parsed;
    } catch (e) { return null; }
  }

  function doc() {
    return root.SSDNSApp && root.SSDNSApp.doc ? root.SSDNSApp.doc() : null;
  }
  function compute() {
    return root.SSDNSApp && root.SSDNSApp.compute ? root.SSDNSApp.compute() : {};
  }

  function buildSnapshot() {
    var d = doc();
    if (!d) return null;
    var c = d.character || {};
    var v = compute();
    var Bridge = root.SSDNSBridge;
    var es = Bridge ? Bridge.cpValue(d.shards) : 0;
    var guns = (c.guns || []).map(function (g) {
      if (!g || !g.weapon) return null;
      var st = (v.guns || []).filter(function (x) { return x && x.w && x.w.id === g.weapon; })[0];
      var name = st && st.w ? st.w.name : g.weapon;
      var cond = g.jammed ? "jammed" : (g.cracked ? "cracked" : (g.fouled ? "fouled" : (g.dirty ? "dirty" : "ok")));
      var plain = 0, hex = 0;
      (g.chambers || []).forEach(function (stn) {
        var s = String(stn || "");
        if (!s) return;
        if (/^[1-9]$/.test(s) || s.indexOf("k:hex:") === 0) hex++;
        else plain++;
      });
      return {
        name: name,
        loaded: g.loaded,
        capacity: st ? st.capacity : (g.capacity || 0),
        atk: st && st.atk ? st.atk : "",
        damage: st && (st.dmg || st.damage) ? (st.dmg || st.damage) : "",
        plain: plain,
        hex: hex,
        caster: !!(st && st.w && st.w.hexShells),
        condition: cond,
        load: g.load,
        jammed: !!g.jammed,
        cracked: !!g.cracked,
        fouled: !!g.fouled,
        dirty: !!g.dirty,
        misfire: st && st.misfire ? st.misfire : "",
        rugged: !!(st && st.w && /rugged/i.test(st.w.properties || "")),
        note: st && st.note ? st.note : "",
        chambers: (g.chambers || []).slice()
      };
    }).filter(Boolean);

    var skills = {};
    Object.keys(c.skillProf || {}).forEach(function (k) {
      if (c.skillProf[k] && v.skills && v.skills[k] != null) skills[k] = v.skills[k];
    });
    var saves = {};
    Object.keys(c.saveProf || {}).forEach(function (a) {
      if (c.saveProf[a] && v.saves) saves[a] = v.saves[a];
    });
    var prepared = [];
    Object.keys(c.spells || {}).forEach(function (lvl) {
      (c.spells[lvl] || []).forEach(function (sp) {
        if (sp && sp.name && sp.prepared) prepared.push(sp.name);
      });
    });
    var slots = {};
    var spent = {};
    for (var lv = 1; lv <= 9; lv++) {
      var total = v.hex ? (v.hex[lv] || 0) : 0;
      if (c.overrides && c.overrides["hex." + lv] !== undefined && c.overrides["hex." + lv] !== "") total = parseInt(c.overrides["hex." + lv], 10) || 0;
      if (total) slots[lv] = total;
      var boxes = (c.hexLead && c.hexLead[lv]) || [];
      var used = 0;
      for (var bi = 0; bi < boxes.length && bi < total; bi++) if (boxes[bi]) used++;
      if (used) spent[lv] = used;
    }

    return {
      name: c.name || "(unnamed)",
      player: c.player || "",
      calling: c.calling || "",
      callingId: c.calling || "",
      level: c.level || 1,
      subclass: c.subclass || "",
      background: c.background || "",
      lineage: [c.lineage, c.sublineage].filter(Boolean).join(" · "),
      hpCurrent: c.hpCurrent,
      hpMax: c.hpMax,
      hpTemp: c.hpTemp || 0,
      ac: v.ac,
      initBonus: v.initiative,
      es: es,
      shards: Bridge ? Bridge.cleanShards(d.shards) : d.shards,
      abilities: c.abilities || {},
      mods: v.mods || {},
      skills: skills,
      saves: saves,
      equipment: c.equipment || "",
      features: c.features || "",
      personality: c.personality || "",
      guns: guns,
      conditions: c.tableConditions || "",
      activeConditions: c.activeConditions || [],
      deathSaves: c.deathSaves || { success: [false, false, false], fail: [false, false, false] },
      spellAtk: v.spellAtk || "",
      spellDC: v.spellDC || "",
      spellMod: v.spellMod,
      spells: {
        cantrips: (c.cantrips || []).filter(Boolean),
        prepared: prepared,
        slots: slots,
        spent: spent
      },
      updatedAt: new Date().toISOString()
    };
  }

  function clearUnsubs() {
    state.unsubs.forEach(function (fn) { try { fn(); } catch (e) {} });
    state.unsubs = [];
  }

  async function loadFirebase() {
    var cfg = root.SSDNS_FIREBASE_CONFIG;
    if (!cfg) throw new Error("Missing firebase-config.js");
    var appMod = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js");
    var authMod = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js");
    var dbMod = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js");
    var app;
    try { app = appMod.getApp("ssdns-player-join"); }
    catch (e) { app = appMod.initializeApp(cfg, "ssdns-player-join"); }
    var auth = authMod.getAuth(app);
    await authMod.signInAnonymously(auth);
    var user = await new Promise(function (resolve, reject) {
      var t = setTimeout(function () { reject(new Error("Auth timeout")); }, 10000);
      authMod.onAuthStateChanged(auth, function (u) {
        if (u) { clearTimeout(t); resolve(u); }
      }, reject);
    });
    state.app = app;
    state.auth = auth;
    state.db = dbMod.getDatabase(app);
    state.uid = user.uid;
    state._fb = { ref: dbMod.ref, set: dbMod.set, update: dbMod.update, push: dbMod.push, onValue: dbMod.onValue, off: dbMod.off, remove: dbMod.remove, runTransaction: dbMod.runTransaction, get: dbMod.get, onDisconnect: dbMod.onDisconnect };
    return state._fb;
  }

  function roomPath(rest) {
    return "rooms/" + state.roomCode + (rest ? "/" + rest : "");
  }

  function shrinkPortrait(src) {
    return new Promise(function (resolve) {
      if (!src || String(src).indexOf("data:") !== 0) { resolve(""); return; }
      if (src.length < 12000) { resolve(src); return; }
      var img = new Image();
      img.onload = function () {
        try {
          var canvas = document.createElement("canvas");
          canvas.width = 96; canvas.height = 96;
          var ctx = canvas.getContext("2d");
          var scale = Math.max(96 / img.width, 96 / img.height);
          var w = img.width * scale, h = img.height * scale;
          ctx.drawImage(img, (96 - w) / 2, (96 - h) / 2, w, h);
          var out = canvas.toDataURL("image/jpeg", 0.6);
          resolve(out.length > 40000 ? "" : out);
        } catch (e) { resolve(""); }
      };
      img.onerror = function () { resolve(""); };
      img.src = src;
    });
  }
  function stillHere(epoch) {
    return epoch === state.joinEpoch && state.joined && !state.left && !!state.roomCode;
  }
  async function publishSnapshot() {
    if (!state.joined || state.left || !state.db || state.publishing) return;
    var epoch = state.joinEpoch;
    var snap = buildSnapshot();
    if (!snap) return;
    state.publishing = true;
    try {
      var c = doc() && doc().character;
      snap.portrait = await shrinkPortrait(c && c.portrait);
      if (!stillHere(epoch)) return;
      var fb = state._fb;
      var playerRef = fb.ref(state.db, roomPath("players/" + state.uid));
      await fb.update(playerRef, {
        id: state.uid,
        uid: state.uid,
        snapshot: snap
      });
      if (!stillHere(epoch)) return;
      var connRef = fb.ref(state.db, roomPath("players/" + state.uid + "/presence/conns/" + state.connId));
      await fb.set(connRef, { online: true, lastSeen: new Date().toISOString() });
      if (!stillHere(epoch)) {
        try { await fb.remove(connRef); } catch (err) {}
        return;
      }
      state.lastEs = snap.es;
      if (!state.toldVisible) {
        state.toldVisible = true;
        toast("DM can see you");
      }
      try {
        fb.onDisconnect(connRef).remove();
      } catch (err) { console.warn("[DM Join] presence watch", err); }
    } catch (e) {
      console.warn("[DM Join] snapshot failed", e);
    } finally {
      state.publishing = false;
    }
  }

  async function postLedger(entry) {
    if (!state.joined || !state.db) return;
    try {
      var fb = state._fb;
      var id = "led_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      entry.id = id;
      entry.ts = entry.ts || new Date().toISOString();
      var c = doc() && doc().character;
      entry.who = entry.who || ((c && c.player) || "Player");
      entry.playerName = entry.playerName || ((c && c.player) || "");
      entry.characterName = entry.characterName || ((c && c.name) || "");
      entry.playerId = state.uid;
      await fb.set(fb.ref(state.db, roomPath("ledger/" + id)), entry);
    } catch (e) { console.warn("[DM Join] ledger", e); }
  }

  function queueKey() {
    return "outbox." + (state.roomCode || "none") + "." + (state.uid || "local");
  }
  function loadQueue() {
    try { return JSON.parse(readStore(queueKey()) || "[]") || []; } catch (e) { return []; }
  }
  function saveQueue(q) {
    writeStore(queueKey(), JSON.stringify((q || []).slice(-40)));
  }
  function enqueue(kind, payload) {
    if (kind === "roll" && (!state.joined || state.left)) return;
    var q = loadQueue();
    q.push({ kind: kind, payload: payload || {}, ts: Date.now(), joined: !!(state.joined && !state.left) });
    saveQueue(q);
  }
  function offlineNow() {
    return !state.joined || !state.db || state.connected === false;
  }
  async function flushQueue() {
    if (offlineNow() || state._flushing) return;
    var q = loadQueue().filter(function (item) {
      if (item && item.kind === "roll" && item.joined !== true) return false;
      return true;
    });
    if (!q.length) { saveQueue([]); return; }
    state._flushing = true;
    saveQueue([]);
    var failed = [];
    for (var i = 0; i < q.length; i++) {
      try {
        if (q[i].kind === "chat") await writeChat(q[i].payload);
        else if (q[i].kind === "roll") await writeRoll(q[i].payload);
      } catch (e) { failed.push(q[i]); }
    }
    if (failed.length) saveQueue(loadQueue().concat(failed));
    state._flushing = false;
    if (!failed.length && q.length) toast("Queued messages sent");
  }
  function rollText(entry) {
    var detail = String((entry && entry.detail) || "");
    if (entry && (entry.heal || /\bheals\b/i.test(detail))) return detail;
    if (/→\s*(HIT|MISS)/.test(detail)) return detail;
    return (entry.label || "Roll") + " " + (entry.formula || "") + " = " + (entry.result == null ? "" : entry.result) + (detail ? " (" + detail + ")" : "");
  }
  async function writeRoll(entry) {
    if (!state.joined || state.left || !state.db) return;
    var fb = state._fb;
    entry = entry || {};
    var id = entry.id || ("r_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6));
    entry.id = id;
    entry.ts = entry.ts || new Date().toISOString();
    entry.uid = state.uid;
    entry.playerId = state.uid;
    var c = doc() && doc().character;
    var charName = (c && c.name) || "";
    var playerName = (c && c.player) || "";
    entry.who = entry.who || (charName && playerName ? (charName + " (" + playerName + ")") : (charName || playerName || "Player"));
    entry.playerName = entry.playerName || playerName;
    entry.characterName = entry.characterName || charName;
    if (root.SSDNSTestRoll && root.SSDNSTestRoll()) {
      entry.test = true;
      if (String(entry.label || "").indexOf("TEST") < 0) entry.label = (entry.label || "Roll") + " · TEST";
      if (String(entry.detail || "").indexOf("TEST") < 0) entry.detail = (entry.detail ? entry.detail + " · " : "") + "TEST";
    }
    var target = $("#atkTarget");
    if (!entry.targetId && target && target.value) entry.targetId = target.value;
    await fb.set(fb.ref(state.db, roomPath("rolls/" + id)), entry);
    var quiet = !!(entry.private || entry.whisper);
    if (!quiet) {
      var feed = {
        id: id, ts: entry.ts, from: state.uid,
        fromName: entry.who, text: rollText(entry), kind: "roll", who: entry.who
      };
      try { await fb.set(fb.ref(state.db, roomPath("tableFeed/" + id)), feed); }
      catch (err) { console.warn("[DM Join] table feed", err); }
    }
    if (/initiative/i.test(String(entry.label || ""))) {
      try {
        await fb.set(fb.ref(state.db, roomPath("playerInit/" + state.uid)), {
          ts: entry.ts, init: Number(entry.result) || 0, name: entry.characterName || entry.who, from: state.uid
        });
      } catch (err) { console.warn("[DM Join] initiative", err); }
    }
  }
  function postRoll(entry) {
    if (!state.joined || state.left) return Promise.resolve({ ok: false, skipped: true });
    if (offlineNow()) {
      enqueue("roll", entry || {});
      return Promise.resolve({ ok: false, queued: true });
    }
    return writeRoll(entry).then(function () { return { ok: true }; }).catch(function (e) {
      console.warn("[DM Join] roll", e);
      enqueue("roll", entry || {});
      return { ok: false, queued: true };
    });
  }
  function postDamage(entry) {
    entry = entry || {};
    var target = entry.targetId || ($("#atkTarget") && $("#atkTarget").value);
    if (!target || offlineNow()) return Promise.resolve({ ok: false });
    var c = doc() && doc().character;
    var id = "req_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    var row = {
      ts: new Date().toISOString(),
      from: state.uid,
      targetId: target,
      amount: Number(entry.amount) || 0,
      label: entry.label || "",
      type: entry.type || "weapon",
      dice: entry.dice || "",
      weapon: entry.weapon || "",
      characterName: (c && c.name) || "",
      playerName: (c && c.player) || "",
      rollId: entry.rollId || "",
      targetName: entry.targetName || ""
    };
    return state._fb.set(state._fb.ref(state.db, roomPath("encounter/requests/" + id)), row).then(function () {
      return { ok: true };
    }).catch(function (e) {
      console.warn("[DM Join] damage", e);
      return { ok: false };
    });
  }

  function seenStorageKey() {
    return "dmJoin.seen." + state.roomCode + "." + state.uid;
  }
  function loadSeen() {
    state.lastCmdSeen = {};
    try {
      var raw = readStore(seenStorageKey());
      if (!raw) return false;
      state.lastCmdSeen = JSON.parse(raw) || {};
      return true;
    } catch (e) { return false; }
  }
  function saveSeen() {
    var keys = Object.keys(state.lastCmdSeen);
    if (keys.length > 500) keys.slice(0, keys.length - 300).forEach(function (k) { delete state.lastCmdSeen[k]; });
    writeStore(seenStorageKey(), JSON.stringify(state.lastCmdSeen));
  }
  function markerKey() {
    return "cmdMarker." + state.roomCode + "." + state.uid;
  }
  function loadMarker() {
    try {
      var raw = readStore(markerKey());
      if (raw == null || raw === "") return null;
      var n = Number(raw);
      return isFinite(n) ? n : null;
    } catch (e) { return null; }
  }
  function saveMarker(ts) {
    state.marker = ts;
    writeStore(markerKey(), String(ts));
  }
  function cmdTime(cmd) {
    var t = Date.parse(cmd && cmd.ts);
    return isFinite(t) ? t : 0;
  }
  function listenCommands() {
    var fb = state._fb;
    var stored = loadMarker();
    if (stored == null) saveMarker(Date.now());
    else state.marker = stored;
    loadSeen();
    state._hpNoted = state._hpNoted || {};
    function noteReplayHp(id, cmd) {
      if (!cmd || cmd.type !== "hp" || state._hpNoted[id]) return;
      var ts = cmdTime(cmd);
      if (!ts || (Date.now() - ts) > 3 * 60 * 1000) return;
      state._hpNoted[id] = 1;
      try { applyHpCommand(cmd.payload || {}, (cmd.payload && cmd.payload.grantId) || id, true); }
      catch (err) { console.warn("[DM Join] hp replay", err); }
    }
    function take(val) {
      Object.keys(val || {}).forEach(function (id) {
        var cmd = val[id];
        if (!cmd) return;
        if (cmd.to && cmd.to !== "all" && cmd.to !== state.uid) return;
        if (state.lastCmdSeen[id]) { noteReplayHp(id, cmd); return; }
        var ts = cmdTime(cmd);
        if (!ts || ts <= (state.marker || 0)) {
          state.lastCmdSeen[id] = 1;
          noteReplayHp(id, cmd);
          return;
        }
        state.lastCmdSeen[id] = 1;
        saveSeen();
        try { handleCommand(cmd); } catch (err) { console.warn("[DM Join] command", err); }
        if (cmd.type === "hp") state._hpNoted[id] = 1;
        if (ts > (state.marker || 0)) saveMarker(ts);
      });
      saveSeen();
    }
    function bind(path) {
      var r = fb.ref(state.db, roomPath(path));
      var unsub = fb.onValue(r, function (snap) {
        if (!state.joined) return;
        take(snap.val() || {});
      }, function () {});
      state.unsubs.push(typeof unsub === "function" ? unsub : function () { try { fb.off(r, "value", unsub); } catch (e) {} });
    }
    // commands is DM-only. Players already get the broadcast copy and their inbox copy.
    bind("broadcast");
    bind("inbox/" + state.uid);
    listenConditions();
  }
  function writeCondition(entry, removing) {
    if (!state.joined || !state.db || !state.uid || !state._fb) return Promise.resolve({ ok: false });
    var id = (entry && entry.id) || (root.SSDNSConditions && root.SSDNSConditions.idFor(state.uid, entry && entry.name));
    if (!id) return Promise.resolve({ ok: false });
    var ref = state._fb.ref(state.db, roomPath("conditions/" + id));
    if (removing) return state._fb.remove(ref).then(function () { return { ok: true }; }).catch(function () { return { ok: false }; });
    var row = {
      name: entry.name,
      level: entry.level || 0,
      rounds: entry.rounds == null ? null : entry.rounds,
      subjectId: state.uid,
      subjectKind: "player",
      by: state.uid,
      byName: (doc() && doc().character && doc().character.name) || "",
      updatedAt: new Date().toISOString(),
      active: true
    };
    return state._fb.set(ref, row).then(function () { return { ok: true }; }).catch(function () { return { ok: false }; });
  }
  function listenConditions() {
    if (!state._fb || !state.db || state._condListening) return;
    state._condListening = true;
    state._condSeen = {};
    var ref = state._fb.ref(state.db, roomPath("conditions"));
    var unsub = state._fb.onValue(ref, function (snap) {
      if (!state.joined) return;
      var val = snap.val() || {};
      var mine = [];
      var primed = !!state._condPrimed;
      Object.keys(val).forEach(function (id) {
        var row = val[id];
        if (!row || row.subjectId !== state.uid || row.subjectKind === "enemy") return;
        row.id = id;
        mine.push(row);
        var stamp = id + ":" + (row.updatedAt || "") + ":" + (row.level || 0) + ":" + (row.rounds == null ? "" : row.rounds);
        var seen = state._condSeen[id];
        var seenStamp = seen && seen.stamp;
        if (!seen) {
          state._condSeen[id] = { stamp: stamp, name: row.name, label: row.name, rounds: row.rounds };
          if (primed && row.by && row.by !== state.uid && root.SSDNSSheet) {
            var line = (row.byName || "DM") + " applied " + (root.SSDNSConditions ? root.SSDNSConditions.label(row) : row.name);
            root.SSDNSSheet.addLog({ id: "cond:" + stamp, kind: "alert", text: line });
            toast(line);
          }
          return;
        }
        if (seenStamp !== stamp) {
          state._condSeen[id] = { stamp: stamp, name: row.name, label: row.name, rounds: row.rounds };
          if (primed && row.by && row.by !== state.uid && root.SSDNSSheet) {
            var changed = (row.byName || "DM") + " updated " + (root.SSDNSConditions ? root.SSDNSConditions.label(row) : row.name);
            root.SSDNSSheet.addLog({ id: "cond:" + stamp, kind: "alert", text: changed });
            toast(changed);
          }
        }
      });
      Object.keys(state._condSeen).forEach(function (id) {
        if (val[id]) return;
        var gone = state._condSeen[id];
        delete state._condSeen[id];
        if (primed && gone && root.SSDNSSheet) {
          var ended = gone.rounds === 1;
          var bare = gone.name || String(gone.label || "condition").replace(/\s+\d+r$/, "");
          var note = ended ? ("Condition ended · " + bare) : ("DM removed " + bare);
          root.SSDNSSheet.addLog({ id: "cond-end:" + id + ":" + (gone.stamp || ""), kind: "alert", text: note });
          toast(note);
        }
      });
      if (root.SSDNSSheet && root.SSDNSSheet.setConditions) {
        root.SSDNSSheet.setConditions(mine.map(function (row) { return root.SSDNSConditions ? root.SSDNSConditions.label(row) : row.name; }), { entries: mine, quiet: true });
      }
      state._condPrimed = true;
    });
    state.unsubs.push(typeof unsub === "function" ? unsub : function () {});
  }

  function handleCommand(cmd) {
    var payload = cmd.payload || {};
    switch (cmd.type) {
      case "reward_es":
        applyEsReward(payload.delta || 0, payload.reason || "DM reward", payload.grantId || cmd.id);
        break;
      case "reward_item":
        if (!claimGrant("item:" + (payload.grantId || cmd.id || payload.text || ""))) break;
        appendEquipment(payload.text || "");
        toast("DM sent item: " + (payload.text || ""));
        if (root.SSDNSSheet) root.SSDNSSheet.addLog({ id: "item:" + (payload.grantId || cmd.id || ""), kind: "item", text: "Item: " + (payload.text || "") });
        break;
      case "reward_note":
        toast("DM note: " + (payload.text || ""));
        showPopup("DM note", payload.text || "");
        break;
      case "message":
        showPopup("Private message from DM", payload.text || "");
        if (root.SSDNSSheet) root.SSDNSSheet.addLog({ kind: "dm", text: "DM: " + (payload.text || "") });
        break;
      case "handout":
        showHandout(payload.name || "Handout", payload.url || "", payload.text || "");
        ackHandout(payload.id || cmd.id);
        toast("Handout: " + (payload.name || "Handout"), "Go", function () {
          showHandout(payload.name || "Handout", payload.url || "", payload.text || "", true);
        });
        break;
      case "kicked":
        droppedByDm(payload);
        break;
      case "save":
        askPlayerSave(payload);
        break;
      case "moved":
        followMove(payload.code || payload.room || "");
        break;
      case "your_turn":
        if (root.SSDNSPlaytest && root.SSDNSPlaytest.showYourTurn) root.SSDNSPlaytest.showYourTurn();
        ackTurn(cmd);
        break;
      case "roll":
        if (payload.id) state._feedSeen[payload.id] = 1;
        if (root.SSDNSSheet) root.SSDNSSheet.addLog({ id: "roll:" + (payload.id || cmd.id), kind: "roll", text: (payload.who || "DM") + ": " + (payload.text || ""), ts: cmd.ts });
        break;
      case "open_saloon":
        toast("DM opened the Saloon", "Go", function () {
          var btn = $("#btnSaloon");
          if (btn) btn.click();
        });
        break;
      case "open_store":
        if (root.SSDNSSheet && root.SSDNSSheet.setStock) root.SSDNSSheet.setStock(payload.stock);
        toast("DM opened the store", "Go", function () {
          var tab = $("#tab-store");
          if (tab) tab.click();
        });
        break;
      case "hp":
        applyHpCommand(payload, payload.grantId || cmd.id);
        break;
      case "set_conditions":
        if (root.SSDNSSheet && root.SSDNSSheet.setConditions) root.SSDNSSheet.setConditions(payload.list || [], payload);
        break;
      case "rest":
        if (root.SSDNSSheet) root.SSDNSSheet.applyRest(payload.kind || "short");
        break;
      case "gun_event":
        if (root.SSDNSSheet) root.SSDNSSheet.applyGunEvent(payload);
        break;
      case "hex_spend":
        if (root.SSDNSApp && root.SSDNSApp.spendHexSlot) {
          var calling = doc() && doc().character && doc().character.calling;
          var slotName = calling === "pact-seeker" ? "pact slot" : (calling === "hexslinger" ? "hex shell" : "spell slot");
          if (!root.SSDNSApp.spendHexSlot(payload.level)) toast("No level-" + (payload.level || "?") + " " + slotName + " left");
          else if (root.SSDNSSheet) root.SSDNSSheet.showNotice("Spent a level-" + payload.level + " " + slotName);
        }
        break;
      case "hex_fire":
        if (root.SSDNSApp && root.SSDNSApp.fireHexShell) {
          var fired = root.SSDNSApp.fireHexShell(payload.level);
          if (!fired.ok) toast(fired.reason || "No shell loaded");
          else if (root.SSDNSSheet) root.SSDNSSheet.showNotice("Fired a level-" + payload.level + " hex shell");
        }
        break;
      case "death_save":
        if (root.SSDNSSheet) root.SSDNSSheet.setDeath(payload.side, payload.index, payload.on);
        break;
      case "undo_item":
        if (root.SSDNSSheet) root.SSDNSSheet.undoItem(payload.text || "");
        break;
      case "music":
        applyMusic(payload);
        break;
      case "sfx":
        if (root.SSDNSAudio && payload.event) root.SSDNSAudio.play(payload.event);
        break;
      case "open_tab":
        toast("DM nudge: open " + (payload.tab || "a tab"), "Go", function () {
          if (!payload.tab) return;
          var tab = $("#" + payload.tab) || $('[aria-controls="' + payload.tab + '"]');
          if (tab) tab.click();
        });
        break;
      default:
        console.info("[DM Join] unknown command", cmd.type);
    }
  }

  function syncShardFields(shards) {
    ["white", "blue", "green", "yellow", "purple"].forEach(function (c) {
      var nodes = document.querySelectorAll('[data-f="shards.' + c + '"]');
      var n = (shards && shards[c]) || 0;
      for (var i = 0; i < nodes.length; i++) nodes[i].value = String(n);
      // Same path as typing the shard count: paints both piles, the ES total, and saves.
      if (nodes[0]) nodes[0].dispatchEvent(new Event("change", { bubbles: true }));
    });
  }
  function appliedKey() {
    var d = doc();
    var cid = (d && d.id) || "local";
    return "applied." + cid + "." + (state.roomCode || "none");
  }
  function loadApplied() {
    state.appliedRewards = {};
    try {
      var raw = JSON.parse(readStore(appliedKey()) || "{}");
      if (raw && typeof raw === "object") state.appliedRewards = raw;
    } catch (e) {}
  }
  function saveApplied() {
    var keys = Object.keys(state.appliedRewards || {});
    if (keys.length > 400) keys.slice(0, keys.length - 300).forEach(function (k) { delete state.appliedRewards[k]; });
    writeStore(appliedKey(), JSON.stringify(state.appliedRewards || {}));
  }
  function claimGrant(id) {
    if (!id) return true;
    if (!state.appliedRewards || !Object.keys(state.appliedRewards).length) loadApplied();
    state.appliedRewards = state.appliedRewards || {};
    if (state.appliedRewards[id]) return false;
    state.appliedRewards[id] = Date.now();
    saveApplied();
    return true;
  }
  function forgetGrant(id) {
    if (!id || !state.appliedRewards) return;
    delete state.appliedRewards[id];
    saveApplied();
  }
  function applyEsReward(delta, reason, id) {
    var Bridge = root.SSDNSBridge;
    var d = doc();
    if (!Bridge || !d || !delta) return;
    var grant = id ? ("es:" + id) : "";
    if (grant && !claimGrant(grant)) return;
    state.applyingReward = true;
    try {
      var old = Bridge.cpValue(d.shards);
      var w = Bridge.applyDelta(delta, "dm-reward");
      if (!w) {
        try {
          Bridge.writeWallet({
            characterId: d.id,
            characterName: (d.character && d.character.name) || "",
            shards: d.shards,
            updatedBy: "sheet"
          });
          w = Bridge.applyDelta(delta, "dm-reward");
        } catch (e) {}
      }
      if (!w) {
        if (grant) forgetGrant(grant);
        toast("Could not apply DM ES change");
        return;
      }
      d.shards = w.shards;
      syncShardFields(w.shards);
      var neu = Bridge.cpValue(d.shards);
      state.lastEs = neu;
      toast("DM " + (delta >= 0 ? "granted +" : "took ") + Math.abs(delta) + " ES");
      if (root.SSDNSAudio) root.SSDNSAudio.play("reward");
      if (root.SSDNSSheet) root.SSDNSSheet.addLog({ id: id ? "es:" + id : "", kind: "es", text: "DM " + (delta >= 0 ? "+" : "") + delta + " ES" });
      publishSnapshot();
    } finally {
      state.applyingReward = false;
    }
  }

  function appendEquipment(text) {
    var d = doc();
    if (!d || !d.character || !text) return;
    var line = "• " + text + " (from DM)";
    var cur = d.character.equipment || "";
    d.character.equipment = cur + (cur ? "\n" : "") + line;
    var ta = document.querySelector('[data-f="character.equipment"]');
    if (ta) {
      ta.value = d.character.equipment;
      ta.dispatchEvent(new Event("change", { bubbles: true }));
    }
    publishSnapshot();
  }

  var modalQ = [];
  var modalOpen = false;
  function enqueueModal(build) {
    modalQ.push(build);
    pumpModal();
  }
  function pumpModal() {
    if (modalOpen || !modalQ.length) return;
    if (document.querySelector("dialog[open]")) {
      setTimeout(pumpModal, 400);
      return;
    }
    modalOpen = true;
    var build = modalQ.shift();
    var dlg;
    try { dlg = build(); }
    catch (err) {
      modalOpen = false;
      console.warn("[DM Join] modal", err);
      return;
    }
    var done = function () {
      modalOpen = false;
      if (dlg && dlg.parentNode) dlg.parentNode.removeChild(dlg);
      pumpModal();
      flushHandouts();
    };
    dlg.addEventListener("close", done);
    dlg.addEventListener("cancel", function (e) { e.preventDefault(); if (dlg.close) dlg.close(); });
    document.body.appendChild(dlg);
    try {
      if (dlg.showModal) dlg.showModal(); else { dlg.setAttribute("open", ""); }
    } catch (err) {
      modalOpen = false;
      if (dlg.parentNode) dlg.parentNode.removeChild(dlg);
      modalQ.unshift(build);
      console.warn("[DM Join] modal", err);
    }
  }
  function showPopup(title, body) {
    enqueueModal(function () {
      var dlg = document.createElement("dialog");
      dlg.className = "dlg";
      dlg.innerHTML = "<form method='dialog'><h2></h2><p class='fine' style='white-space:pre-wrap'></p><div class='dlg-foot'><button class='btn' value='close'>OK</button></div></form>";
      dlg.querySelector("h2").textContent = title;
      dlg.querySelector("p").textContent = body;
      return dlg;
    });
  }

  var HANDOUT_Q = "ssdns.sheet.handoutQueue";
  function readHandoutQueue() {
    try { return JSON.parse(sessionStorage.getItem(HANDOUT_Q) || "[]") || []; } catch (e) { return []; }
  }
  function queueHandout(payload) {
    var q = readHandoutQueue();
    q.push(payload);
    try { sessionStorage.setItem(HANDOUT_Q, JSON.stringify(q.slice(-20))); } catch (e) {}
  }
  function flushHandouts() {
    if (!state.joined || state.left) return;
    if (document.querySelector("dialog[open]")) return;
    var q = readHandoutQueue();
    if (!q.length) return;
    try { sessionStorage.removeItem(HANDOUT_Q); } catch (e) {}
    q.forEach(function (h) { showHandout(h.name, h.url, h.text, true); });
  }
  function showHandout(name, url, text, skipLog) {
    url = url || "";
    text = text || "";
    var id = "handout:" + String(name || "Handout") + ":" + url;
    if (!skipLog && root.SSDNSSheet) root.SSDNSSheet.addLog({ id: id, kind: "handout", text: "Handout: " + (name || "Handout"), url: url, body: text, title: name || "Handout" });
    var dialogOpen = !!document.querySelector("dialog[open]");
    if (dialogOpen || (!skipLog && (!state.joined || state.left))) {
      queueHandout({ name: name || "Handout", url: url, text: text });
      return;
    }
    enqueueModal(function () {
      var dlg = document.createElement("dialog");
      dlg.className = "dlg";
      dlg.innerHTML = "<form method='dialog'><h2></h2><p class='fine' style='white-space:pre-wrap'></p><p class='handout-pic' style='text-align:center'></p><div class='dlg-foot'><a class='btn' target='_blank' rel='noopener' hidden>Open</a> <button class='btn' value='close'>Close</button></div></form>";
      dlg.querySelector("h2").textContent = name || "Handout";
      dlg.querySelector("p.fine").textContent = text || "";
      var pic = dlg.querySelector(".handout-pic");
      if (url && /\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(url) || (url && !text)) {
        var img = document.createElement("img");
        img.alt = name || "";
        img.referrerPolicy = "no-referrer";
        img.style.maxWidth = "100%";
        img.style.maxHeight = "60vh";
        img.addEventListener("error", function () {
          var note = document.createElement("span");
          note.className = "fine";
          note.textContent = "Image couldn't load — open link";
          if (img.parentNode) img.parentNode.replaceChild(note, img);
        });
        img.src = url;
        pic.appendChild(img);
      }
      var a = dlg.querySelector("a");
      if (url) { a.hidden = false; a.href = url; }
      return dlg;
    });
  }

  function ackTurn(cmd) {
    if (!state.joined || state.left || !state.db || !state.uid || !state._fb) return;
    var fb = state._fb;
    state._turnAck = { id: (cmd && cmd.id) || "", delivered: true, seen: false };
    fb.update(fb.ref(state.db, roomPath("players/" + state.uid)), {
      turnAck: { id: state._turnAck.id, delivered: true, seen: false, ts: new Date().toISOString() }
    }).then(function () {
      if (root.document && root.document.visibilityState === "visible") {
        setTimeout(upgradeTurnSeen, 700);
      }
    }).catch(function (err) { console.warn("[DM Join] turn ack", err); });
  }
  function upgradeTurnSeen() {
    if (!state._turnAck || state._turnAck.seen || !state.joined || !state.db || !state.uid) return;
    if (!root.document || root.document.visibilityState !== "visible") return;
    state._turnAck.seen = true;
    state._fb.update(state._fb.ref(state.db, roomPath("players/" + state.uid + "/turnAck")), {
      seen: true, delivered: true, ts: new Date().toISOString()
    }).catch(function () {});
  }
  function ackHandout(id) {
    if (!id || !state.joined || state.left || !state.db || !state.uid || !state._fb) return;
    var fb = state._fb;
    fb.update(fb.ref(state.db, roomPath("players/" + state.uid)), {
      handoutAck: { id: id, delivered: true, seen: false, ts: new Date().toISOString() }
    }).then(function () {
      if (!root.document || root.document.visibilityState !== "visible") return;
      setTimeout(function () {
        if (!state.joined || state.left) return;
        fb.update(fb.ref(state.db, roomPath("players/" + state.uid + "/handoutAck")), {
          id: id, seen: true, delivered: true, ts: new Date().toISOString()
        }).catch(function () {});
      }, 700);
    }).catch(function () {});
  }
  function removedModal(reason) {
    var dlg = document.createElement("dialog");
    dlg.className = "dlg";
    var form = document.createElement("form");
    form.method = "dialog";
    var title = document.createElement("h2");
    title.textContent = "You were removed from the table";
    var note = document.createElement("p");
    note.textContent = reason ? ("Reason: " + reason) : "Ask your DM if you should rejoin.";
    var foot = document.createElement("div");
    foot.className = "dlg-foot";
    var ok = document.createElement("button");
    ok.className = "btn btn-primary";
    ok.type = "submit";
    ok.textContent = "OK";
    foot.appendChild(ok);
    form.appendChild(title);
    form.appendChild(note);
    form.appendChild(foot);
    dlg.appendChild(form);
    document.body.appendChild(dlg);
    form.addEventListener("submit", function () {
      if (dlg.parentNode) dlg.parentNode.removeChild(dlg);
    });
    try { if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", ""); }
    catch (e) { dlg.setAttribute("open", ""); }
  }
  function droppedByDm(payload) {
    if (state._kicked) return;
    state._kicked = true;
    forgetInvite();
    var reason = payload && payload.reason ? String(payload.reason) : "";
    removedModal(reason);
    if (root.SSDNSSheet) root.SSDNSSheet.addLog({ kind: "alert", text: "You were removed from the table" });
    state.joinEpoch++;
    state.left = true;
    state.joined = false;
    state.roomCode = null;
    saveLocal();
    detachAll();
    setUiJoined(false);
    var status = $("#dmJoinStatus");
    if (status) status.textContent = "Not connected";
    var input = $("#dmJoinCode");
    if (input) input.value = "";
    if (root.SSDNSPlaytest && root.SSDNSPlaytest.showRoster) root.SSDNSPlaytest.showRoster([]);
    if (root.SSDNSPlaytest && root.SSDNSPlaytest.showTurn) root.SSDNSPlaytest.showTurn(null);
  }
  function abilityMod(ability) {
    var key = String(ability || "STR").toUpperCase();
    var v = compute() || {};
    if (v.mods && v.mods[key] != null && v.mods[key] !== "") return Number(v.mods[key]) || 0;
    var d = doc();
    var score = d && d.character && d.character.abilities && d.character.abilities[key];
    var n = Number(score);
    return isFinite(n) ? Math.floor((n - 10) / 2) : 0;
  }
  function askPlayerSave(payload) {
    payload = payload || {};
    if (!payload.id || state._saveSeen && state._saveSeen[payload.id]) return;
    state._saveSeen = state._saveSeen || {};
    state._saveSeen[payload.id] = 1;
    var ability = String(payload.ability || "STR").toUpperCase();
    var mod = abilityMod(ability);
    var dlg = document.createElement("dialog");
    dlg.className = "dlg";
    var form = document.createElement("form");
    form.method = "dialog";
    var title = document.createElement("h2");
    title.textContent = (payload.label || "Save") + " · " + ability + " DC " + (payload.dc == null ? "?" : payload.dc);
    var note = document.createElement("p");
    var sign = (mod >= 0 ? "+" : "") + mod;
    note.textContent = "Your " + ability + " modifier is " + sign + (payload.rider ? (". On a fail: " + payload.rider) : "") + (payload.damage ? (". Damage on a fail: " + payload.damage) : "");
    var foot = document.createElement("div");
    foot.className = "dlg-foot";
    var roll = document.createElement("button");
    roll.className = "btn btn-primary";
    roll.type = "submit";
    roll.textContent = "Roll " + ability + " save";
    foot.appendChild(roll);
    form.appendChild(title);
    form.appendChild(note);
    form.appendChild(foot);
    dlg.appendChild(form);
    document.body.appendChild(dlg);
    form.addEventListener("submit", function (ev) {
      if (ev.preventDefault) ev.preventDefault();
      var nat = 1 + Math.floor(Math.random() * 20);
      if (root.SSDNSTestRoll) {
        var forced = root.SSDNSTestRoll();
        if (forced) nat = forced;
      }
      var total = nat + mod;
      var dc = Number(payload.dc);
      var failed = isFinite(dc) ? total < dc : false;
      var line = ability + " save " + nat + sign + " = " + total + (isFinite(dc) ? " vs DC " + dc : "") + (failed ? " FAIL" : " OK") + (nat === 20 ? " · natural 20" : "");
      postRoll({
        id: "save_" + payload.id,
        saveRequestId: payload.id,
        label: (payload.label || "Save") + " · " + ability,
        formula: "1d20" + sign,
        result: total,
        nat: nat,
        mod: mod,
        save: true,
        detail: line,
        private: true
      });
      toast(line);
      if (root.SSDNSSheet) root.SSDNSSheet.addLog({ id: "save:" + payload.id, kind: "roll", text: line });
      if (dlg.close) dlg.close();
      if (dlg.parentNode) dlg.parentNode.removeChild(dlg);
    });
    try { if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", ""); }
    catch (e) { dlg.setAttribute("open", ""); }
  }
  function followMove(code) {
    code = String(code || "").trim().toUpperCase();
    if (!code || state._kicked || state._moving) return;
    if (state.joined && state.roomCode === code) return;
    var old = state.roomCode;
    var go = function () {
      if (state._kicked) return;
      state._moving = true;
      toast("Table moved to " + code);
      if (root.SSDNSSheet) root.SSDNSSheet.addLog({ kind: "alert", text: "Table moved to " + code });
      state.left = false;
      join(code).then(function () { state._moving = false; }, function () { state._moving = false; });
    };
    if (state._fb && state.db && state.uid && old) {
      state._fb.get(state._fb.ref(state.db, "rooms/" + old + "/kicked/" + state.uid)).then(function (snap) {
        if (snap.exists()) return;
        go();
      }).catch(go);
      return;
    }
    go();
  }
  function applyHpCommand(payload, id, replay) {
    payload = payload || {};
    var grant = id ? ("hp:" + (payload.grantId || id)) : "";
    if (payload.absolute != null && payload.absolute !== "") {
      var hp = Number(payload.absolute);
      if (!isFinite(hp) || !root.SSDNSSheet || !root.SSDNSSheet.setHp) return;
      if (grant && !claimGrant(grant)) {
        if (replay && root.SSDNSSheet.flashHp) root.SSDNSSheet.flashHp(payload.text || "DM set HP");
        return;
      }
      root.SSDNSSheet.setHp(hp, payload.temp, payload.maxHp);
      if (payload.text && root.SSDNSSheet.addLog) root.SSDNSSheet.addLog({ id: id ? "hp:" + id : "", kind: "hp", text: payload.text });
      return;
    }
    var delta = Number(payload.delta);
    if (!delta) delta = (payload.kind === "heal" ? 1 : -1) * (Number(payload.amount) || 0);
    if (!delta || !root.SSDNSSheet) return;
    var kind = payload.kind || (delta < 0 ? "damage" : "heal");
    var text = payload.text || ("DM " + kind + " " + Math.abs(delta) + (payload.formula ? " (" + payload.formula + ")" : ""));
      if (grant && !claimGrant(grant)) {
      if (replay && root.SSDNSSheet.flashHp) root.SSDNSSheet.flashHp(text);
      return;
    }
    root.SSDNSSheet.applyDelta(delta, text);
    root.SSDNSSheet.addLog({ id: id ? "hp:" + id : "", kind: "hp", text: text });
  }
  function applyMusic(payload) {
    if (!root.SSDNSAudio) return;
    if (!payload || payload.action === "stop") {
      root.SSDNSAudio.stopMusic();
      return;
    }
    root.SSDNSAudio.playMusic({
      file: payload.file,
      loop: !!payload.loop,
      onblocked: function () { if (root.SSDNSSheet) root.SSDNSSheet.showTapHear(); },
      onmissing: function () {}
    });
  }
  async function spendInspiration() {
    if (!state.joined || !state.db) { toast("Join a table to spend shared Inspiration."); return; }
    var c = doc() && doc().character;
    var playerName = (c && c.player) || "";
    var characterName = (c && c.name) || "";
    var who = [playerName, characterName].filter(Boolean).join(" · ") || "Player";
    var fb = state._fb;
    var id = "ins_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    try {
      var result = await fb.runTransaction(fb.ref(state.db, roomPath("table/inspiration")), function (cur) {
        var count = 0;
        if (cur && typeof cur === "object") count = Number(cur.count) || 0;
        else if (typeof cur === "number") count = cur;
        if (count < 1) return;
        var next = count - 1;
        return {
          count: next,
          last: {
            id: id,
            ts: new Date().toISOString(),
            delta: -1,
            by: state.uid,
            who: who,
            playerName: playerName,
            characterName: characterName,
            text: who + " spent 1 Inspiration (" + next + " left)"
          }
        };
      });
      if (!result || result.committed === false) { toast("No shared Inspiration left."); return; }
      var snap = result.snapshot && result.snapshot.val ? result.snapshot.val() : null;
      var text = (snap && snap.last && snap.last.text) || (who + " spent 1 Inspiration");
      postLedger({
        type: "inspiration",
        what: text,
        oldVal: null,
        newVal: snap && snap.count,
        flag: false,
        who: playerName || characterName || "Player",
        playerName: playerName,
        characterName: characterName
      });
    } catch (e) {
      console.warn("[DM Join] inspiration", e);
      toast("Couldn't spend Inspiration");
    }
  }
  function writeChat(entry) {
    var fb = state._fb;
    var id = (entry && entry.id) || ("chat_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6));
    var c = doc() && doc().character;
    var row = {
      id: id,
      ts: new Date().toISOString(),
      from: state.uid,
      fromName: (entry && entry.fromName) || (c && (c.player || c.name)) || "Player",
      text: (entry && entry.text) || ""
    };
    return fb.set(fb.ref(state.db, roomPath("chat/" + id)), row);
  }
  function postChat(entry) {
    if (offlineNow()) {
      enqueue("chat", entry || {});
      return Promise.resolve({ ok: false, queued: true });
    }
    return writeChat(entry).then(function () { return { ok: true }; }).catch(function (e) {
      console.warn("[DM Join] chat", e);
      enqueue("chat", entry || {});
      return { ok: false, queued: true };
    });
  }
  function listenRoomFeeds() {
    var fb = state._fb;
    var room = state.roomCode;
    function bind(path, handler) {
      var r = fb.ref(state.db, roomPath(path));
      var unsub = fb.onValue(r, function (snap) {
        if (!state.joined || state.roomCode !== room) return;
        handler(snap.val() || {});
      }, function () {});
      state.unsubs.push(typeof unsub === "function" ? unsub : function () { try { fb.off(r, "value", unsub); } catch (e) {} });
    }
    var inspPrimed = false;
    var inspSeen = "";
    bind("table", function (val) {
      var stock = val.store || [];
      var list = Array.isArray(stock) ? stock : Object.keys(stock).map(function (k) { return stock[k]; });
      if (root.SSDNSSheet) root.SSDNSSheet.setStock(list);
      if (val.storeOpen && root.SSDNSSheet && root.SSDNSSheet.openStore) {
        if (!state._storeOpened) {
          state._storeOpened = true;
          root.SSDNSSheet.openStore(list);
        }
      } else if (val.storeOpen === false) state._storeOpened = false;
      if (root.SSDNSPlaytest && root.SSDNSPlaytest.setDamageMode) root.SSDNSPlaytest.setDamageMode(val.damageMode || "auto");
      if (root.SSDNSPlaytest && root.SSDNSPlaytest.showTurn) root.SSDNSPlaytest.showTurn(val.initiative || null);
      var insp = val.inspiration;
      var count = 0, last = null;
      if (insp && typeof insp === "object") { count = Number(insp.count) || 0; last = insp.last || null; }
      else if (typeof insp === "number") count = insp;
      if (root.SSDNSSheet && root.SSDNSSheet.showInspiration) root.SSDNSSheet.showInspiration(count, true);
      if (last && last.id && last.id !== inspSeen) {
        inspSeen = last.id;
        var fresh = claimGrant("insp:" + last.id);
        if (inspPrimed && fresh) {
          var line = last.text || "Inspiration changed";
          toast(line);
          if (root.SSDNSSheet) root.SSDNSSheet.addLog({ id: "insp:" + last.id, kind: "alert", text: line, ts: last.ts });
        }
      }
      inspPrimed = true;
    });
    var moveSeen = "";
    bind("meta", function (val) {
      var dest = val && val.movedTo ? String(val.movedTo).trim().toUpperCase() : "";
      if (!dest || val.status !== "moved" || dest === moveSeen) return;
      moveSeen = dest;
      followMove(dest);
    });
    var chatPrimed = false;
    bind("chat", function (val) {
      Object.keys(val).forEach(function (id) {
        if (state._chatSeen[id]) return;
        state._chatSeen[id] = 1;
        var row = val[id];
        if (!row) return;
        if (row.to && row.to !== "all" && row.to !== state.uid) return;
        if (chatPrimed && row.from === state.uid) return;
        var who = row.fromName || "Table";
        if (row.to && row.to !== "all") who += " (to you)";
        var chatText = row.text || "";
        if (chatText.indexOf(who) !== 0) chatText = who + ": " + chatText;
        if (root.SSDNSSheet) root.SSDNSSheet.addLog({ id: "chat:" + id, kind: "chat", text: chatText, ts: row.ts });
      });
      chatPrimed = true;
    });
    bind("tableFeed", function (val) {
      Object.keys(val || {}).forEach(function (id) {
        if (state._feedSeen[id]) return;
        state._feedSeen[id] = 1;
        var row = val[id];
        if (!row) return;
        var own = row.from === state.uid;
        var ts = Date.parse(row.ts);
        if (!own && (!ts || ts <= (state.marker || 0))) return;
        var speaker = row.who || row.fromName || "Table";
        var text = row.text || "";
        if (!own && text.indexOf(speaker) !== 0) text = speaker + ": " + text;
        if (root.SSDNSSheet) root.SSDNSSheet.addLog({ id: (row.kind === "roll" ? "roll:" : "feed:") + id, kind: row.kind === "roll" ? "roll" : "chat", text: text, ts: row.ts });
      });
    });
    bind("players", function (val) {
      var rows = [];
      Object.keys(val || {}).forEach(function (id) {
        var p = val[id] || {};
        var s = p.snapshot || {};
        var pres = p.presence || {};
        var conns = pres.conns;
        var online = false;
        if (conns && typeof conns === "object") online = Object.keys(conns).some(function (cid) { return conns[cid] && conns[cid].online !== false; });
        else online = !!pres.online;
        rows.push({ name: s.name || "Someone", player: s.player || "", online: online });
      });
      if (root.SSDNSPlaytest && root.SSDNSPlaytest.showRoster) root.SSDNSPlaytest.showRoster(rows);
    });
    bind("encounter/public", function (val) {
      if (root.SSDNSPlaytest && root.SSDNSPlaytest.setTargets) root.SSDNSPlaytest.setTargets(val || {});
    });
    bind("meta", function (val) {
      if (!val || val.status !== "ended" || !state.joined) return;
      toast("The DM ended the session");
      leave();
    });
  }
  function pullRoomState() {
    var fb = state._fb;
    var code = state.roomCode;
    if (!fb || !state.db || !code) return;
    function apply(tries) {
      if (!state.joined || state.roomCode !== code) return;
      if (!root.SSDNSPlaytest || !root.SSDNSPlaytest.showTurn) {
        if (tries < 40) setTimeout(function () { apply(tries + 1); }, 50);
        return;
      }
      fb.get(fb.ref(state.db, roomPath("table"))).then(function (snap) {
        if (!state.joined || state.roomCode !== code) return;
        var val = (snap && snap.val && snap.val()) || {};
        root.SSDNSPlaytest.showTurn(val.initiative || null);
      }).catch(function () {});
      fb.get(fb.ref(state.db, roomPath("encounter/public"))).then(function (snap) {
        if (!state.joined || state.roomCode !== code) return;
        var val = (snap && snap.val && snap.val()) || {};
        if (root.SSDNSPlaytest.setTargets) root.SSDNSPlaytest.setTargets(val);
      }).catch(function () {});
    }
    apply(0);
  }
  function watchServerClock() {
    if (state._clock || !state._fb || !state.db) return;
    state._clock = true;
    var fb = state._fb;
    var r = fb.ref(state.db, ".info/serverTimeOffset");
    var unsub = fb.onValue(r, function (snap) {
      if (root.SSDNSClock) root.SSDNSClock.setOffset(snap.val() || 0);
    });
    state.unsubs.push(function () {
      state._clock = false;
      if (typeof unsub === "function") unsub();
    });
  }
  function watchConnection() {
    if (state._conn) return;
    state._conn = true;
    var fb = state._fb;
    var r = fb.ref(state.db, ".info/connected");
    var unsub = fb.onValue(r, function (snap) {
      var on = snap.val() === true;
      state.connected = on;
      if (!state.joined) return;
      setBadge(on ? "connected" : "reconnecting");
      if (on) flushQueue();
    });
    state.unsubs.push(function () {
      state._conn = false;
      if (typeof unsub === "function") unsub();
      else { try { fb.off(r, "value", unsub); } catch (e) {} }
    });
    watchServerClock();
  }
  function setBadge(mode) {
    state.link = mode || "";
    var badge = $("#dmJoinBadge");
    var label = mode === "connected" ? "Connected" : mode === "reconnecting" ? "Reconnecting" : mode === "offline" ? "Offline" : "";
    if (badge) {
      badge.hidden = !label;
      badge.textContent = label;
      badge.className = "dm-join-badge " + (mode || "");
    }
    var status = $("#dmJoinStatus");
    if (status && state.joined) {
      if (mode === "connected") status.textContent = "Joined " + (state.roomCode || "");
      else if (mode === "reconnecting") status.textContent = "Reconnecting " + (state.roomCode || "");
      else if (mode === "offline") status.textContent = "Offline · " + (state.roomCode || "");
    }
  }
  function watchEs() {
    if (state._esTimer) return;
    state._esTimer = setInterval(function () {
      if (!state.joined || state.applyingReward) return;
      var d = doc();
      var Bridge = root.SSDNSBridge;
      if (!d || !Bridge) return;
      var es = Bridge.cpValue(d.shards);
      if (state.lastEs == null) { state.lastEs = es; return; }
      if (es !== state.lastEs) {
        var delta = es - state.lastEs;
        var by = "manual";
        try {
          var w = Bridge.readWallet();
          if (w && w.updatedBy && w.updatedBy !== "sheet" && w.updatedBy !== "dm-reward") by = "saloon:" + w.updatedBy;
        } catch (e) {}
        if (root.SSDNSSheet) root.SSDNSSheet.addLog({
          kind: "es",
          text: (by.indexOf("saloon") === 0 ? "Saloon · " + by.slice(7) : "ES change") + " (" + (delta >= 0 ? "+" : "") + delta + ")"
        });
        postLedger({
          type: delta >= 0 ? "es_gain" : "es_spend",
          what: (by.indexOf("saloon") === 0 ? "Saloon · " + by.slice(7) : "ES change") + " (" + (delta >= 0 ? "+" : "") + delta + ")",
          oldVal: state.lastEs,
          newVal: es,
          flag: Math.abs(delta) >= BIG_JUMP,
          who: (d.character && d.character.player) || (d.character && d.character.name) || "Player"
        });
        state.lastEs = es;
        publishSnapshot();
      }
    }, 2000);
  }
  function detachAll() {
    clearUnsubs();
    if (state._heartbeat) { clearInterval(state._heartbeat); state._heartbeat = null; }
    if (state._esTimer) { clearInterval(state._esTimer); state._esTimer = null; }
    state._conn = false;
  }

  function forgetInvite() {
    state.inviteCode = "";
    try { root.sessionStorage.removeItem(INVITE_KEY); } catch (e) {}
  }
  function setUiJoined(on, code) {
    var status = $("#dmJoinStatus");
    var btnJoin = $("#btnDmJoin");
    var btnLeave = $("#btnDmLeave");
    var input = $("#dmJoinCode");
    if (status) {
      if (!on && state.inviteCode) status.textContent = "Join " + state.inviteCode;
      else if (!on) status.textContent = "Not in a room";
      else if (state.connected === false) status.textContent = "Reconnecting " + code;
      else status.textContent = "Joined " + code;
    }
    if (btnJoin) {
      btnJoin.hidden = !!on;
      btnJoin.textContent = (!on && state.inviteCode) ? ("Join " + state.inviteCode) : "Join";
    }
    if (btnLeave) btnLeave.hidden = !on;
    if (input) {
      input.disabled = !!on;
      if (on && code) input.value = code;
      else if (!on && state.inviteCode) input.value = state.inviteCode;
      else if (!on) input.value = "";
    }
    var bar = $("#dmJoinBar");
    if (bar) bar.classList.toggle("joined", !!on);
    if (!on && root.SSDNSSheet && root.SSDNSSheet.showInspiration) root.SSDNSSheet.showInspiration(0, false);
  }

  function dropPrejoinRolls() {
    try {
      ["ssdns.sheet.", "ssdns.v1."].forEach(function (pre) {
        localStorage.removeItem(pre + "outbox.none.local");
        localStorage.removeItem(pre + "outbox.none." + (state.uid || "local"));
      });
    } catch (e) {}
    var q = loadQueue().filter(function (item) { return !(item && item.kind === "roll" && item.joined !== true); });
    saveQueue(q);
  }
  async function join(code) {
    state._kicked = false;
    if (state.readOnly) { toast("This tab is read-only. The character is open in another tab."); return; }
    code = String(code || "").trim().toUpperCase();
    if (!code) { toast("Enter a room code"); return; }
    if (state._joining && state._joiningCode === code) return state._joining;
    state.left = false;
    var epoch = state.joinEpoch;
    if (!(state.joined && state.roomCode === code)) epoch = ++state.joinEpoch;
    state._joiningCode = code;
    var status = $("#dmJoinStatus");
    if (status) status.textContent = "Connecting…";
    var run = joinNow(code, epoch);
    state._joining = run;
    try { return await run; }
    finally { if (state._joining === run) state._joining = null; }
  }
  async function joinNow(code, epoch) {
    var input = $("#dmJoinCode");
    if (input) input.value = code;
    state.roomCode = code;
    state.joined = true;
    setUiJoined(true, code);
    if ($("#dmJoinStatus")) $("#dmJoinStatus").textContent = "Joining " + code;
    try {
      toast("Connecting…");
      await loadFirebase();
      if (epoch !== state.joinEpoch || state.left || !state.joined || ($("#dmJoinCode") && String($("#dmJoinCode").value || "").trim().toUpperCase() !== code)) {
        detachAll();
        state.joined = false;
        state.roomCode = null;
        saveLocal();
        setUiJoined(false);
        return;
      }
      var fb = state._fb;
      var metaSnap = await fb.get(fb.ref(state.db, "rooms/" + code + "/meta"));
      var meta = metaSnap.exists() ? (metaSnap.val() || {}) : null;
      if (!meta || meta.status === "ended" || meta.status === "moved") {
        var closedMoved = meta && meta.movedTo ? String(meta.movedTo).trim().toUpperCase() : "";
        var kickedEarly = false;
        if (state.uid) {
          var earlyKick = await fb.get(fb.ref(state.db, "rooms/" + code + "/kicked/" + state.uid));
          kickedEarly = earlyKick.exists();
        }
        detachAll();
        state.joined = false;
        state.roomCode = null;
        saveLocal();
        setUiJoined(false);
        if (kickedEarly) {
          droppedByDm({ reason: "" });
          return;
        }
        if ($("#dmJoinCode")) $("#dmJoinCode").value = code;
        if (closedMoved && closedMoved !== code) {
          toast("That table is closed; ask your DM for the new code.", "Join " + closedMoved, function () { join(closedMoved); });
        } else if (!meta) {
          toast("No room with code " + code + " (is the DM live? Demo rooms aren't on Firebase.)");
        } else {
          toast("That table is closed; ask your DM for the new code.");
        }
        return;
      }
      var moved = meta.movedTo ? String(meta.movedTo).trim().toUpperCase() : "";
      if (moved && moved !== code) {
        state._moveHops = (state._moveHops || 0) + 1;
        if (state._moveHops > 3) {
          toast("That table moved too many times");
          detachAll();
          state.joined = false;
          state.roomCode = null;
          saveLocal();
          setUiJoined(false);
          return;
        }
        toast("Table moved to " + moved);
        return joinNow(moved, epoch);
      }
      state._moveHops = 0;
      var kickSnap = await fb.get(fb.ref(state.db, "rooms/" + code + "/kicked/" + state.uid));
      if (kickSnap.exists()) {
        toast("The DM removed you from the table");
        forgetInvite();
        state._kicked = true;
        detachAll();
        state.joined = false;
        state.left = true;
        state.roomCode = null;
        saveLocal();
        setUiJoined(false);
        if ($("#dmJoinCode")) $("#dmJoinCode").value = "";
        return;
      }
      if (epoch !== state.joinEpoch || state.left || !state.joined) return;
      detachAll();
      state.roomCode = code;
      state.joined = true;
      saveLocal();
      setUiJoined(true, code);
      watchConnection();
      await publishSnapshot();
      if (epoch !== state.joinEpoch || state.left || !state.joined) return;
      loadApplied();
      listenCommands();
      listenRoomFeeds();
      pullRoomState();
      watchEs();
      dropPrejoinRolls();
      flushQueue();
      flushHandouts();
      setBadge(state.connected === false ? "reconnecting" : "connected");
      if (!state._sheetWatch) {
        state._sheetWatch = true;
        var pubTimer;
        document.addEventListener("change", function () {
          if (!state.joined) return;
          clearTimeout(pubTimer);
          pubTimer = setTimeout(publishSnapshot, 500);
        });
      }
      // heartbeat
      state._heartbeat = setInterval(function () {
        if (!state.joined) return;
        publishSnapshot();
      }, 15000);
      forgetInvite();
      toast("Joined " + code);
    } catch (e) {
      console.warn(e);
      toast("Join failed: " + (e.message || e) + " — sheet still works offline");
      detachAll();
      state.joined = false;
      state.roomCode = null;
      saveLocal();
      setUiJoined(false);
    }
  }

  function clearReplayMarkers() {
    var code = state.roomCode;
    var uid = state.uid;
    var d = doc();
    var cid = (d && d.id) || "";
    try {
      if (code && uid) {
        ["ssdns.v1.", "ssdns.sheet."].forEach(function (pre) {
          localStorage.removeItem(pre + "dmJoin.seen." + code + "." + uid);
          localStorage.removeItem(pre + "cmdMarker." + code + "." + uid);
          localStorage.removeItem(pre + "outbox." + code + "." + uid);
          localStorage.removeItem(pre + "outbox." + code + ".local");
        });
      }
      if (cid && code) {
        localStorage.removeItem("ssdns.v1.applied." + cid + "." + code);
        localStorage.removeItem("ssdns.sheet.applied." + cid + "." + code);
      }
      localStorage.removeItem(LS_KEY);
      localStorage.removeItem(LS_OLD);
    } catch (e) {}
    state.lastCmdSeen = {};
    state.marker = 0;
    state.appliedRewards = {};
    state._feedSeen = {};
    state._chatSeen = {};
  }
  function abandon() {
    leave();
    clearReplayMarkers();
    if (root.SSDNSSheet && root.SSDNSSheet.clearLog) root.SSDNSSheet.clearLog();
  }
  function roomConditionIds() {
    var ids = Object.keys(state._condSeen || {});
    var c = doc() && doc().character;
    (c && c.activeConditions || []).forEach(function (row) {
      var id = (row && row.id) || (root.SSDNSConditions && root.SSDNSConditions.idFor(state.uid, row && row.name));
      if (id && ids.indexOf(id) < 0) ids.push(id);
    });
    return ids;
  }
  async function leave() {
    forgetInvite();
    var code = state.roomCode;
    var uid = state.uid;
    var db = state.db;
    var fb = state._fb;
    var connId = state.connId;
    var condIds = roomConditionIds();
    state.joinEpoch++;
    state.left = true;
    state.joined = false;
    state.roomCode = null;
    saveLocal();
    if (fb && db && uid && code) {
      condIds.forEach(function (id) {
        fb.remove(fb.ref(db, "rooms/" + code + "/conditions/" + id)).catch(function () {});
      });
    }
    try {
      localStorage.removeItem(LS_OLD);
      localStorage.removeItem("ssdns.v1.dmJoin");
    } catch (e) {}
    setUiJoined(false);
    detachAll();
    if (root.SSDNSPlaytest && root.SSDNSPlaytest.showRoster) root.SSDNSPlaytest.showRoster([]);
    if (root.SSDNSPlaytest && root.SSDNSPlaytest.showTurn) root.SSDNSPlaytest.showTurn(null);
    if (fb && db && uid && code && connId) {
      try {
        var connRef = fb.ref(db, "rooms/" + code + "/players/" + uid + "/presence/conns/" + connId);
        try { await fb.onDisconnect(connRef).cancel(); } catch (err) {}
        await fb.remove(connRef);
      } catch (e) {}
    }
    toast("Left the room · sheet is fully offline again");
  }

  function hookRollHelper() {
    // Optional: expose for sheet to call when they add shared rolls later
    root.SSDNSDmJoin = {
      isJoined: function () { return !!state.joined; },
      roomCode: function () { return state.roomCode; },
      uid: function () { return state.uid; },
      publishSnapshot: publishSnapshot,
      postLedger: postLedger,
      postRoll: postRoll,
      postChat: postChat,
      postDamage: postDamage,
      showHandout: showHandout,
      spendInspiration: spendInspiration,
      join: join,
      leave: leave,
      abandon: abandon,
      claimGrant: claimGrant,
      isReadOnly: function () { return !!state.readOnly; },
      writeCondition: writeCondition,
      takeOverEditing: takeOverEditing,
      consumeInvite: consumeInvite
    };
  }
  function characterReady() {
    var d = doc();
    if (root.SSDNSCreator && root.SSDNSCreator.isExisting) return root.SSDNSCreator.isExisting(d);
    var c = d && d.character;
    return !!(c && (c.wizardDone || c.name || c.calling || c.lineage || c.background));
  }
  function joinFromBar() {
    var input = $("#dmJoinCode");
    var code = String((input && input.value) || state.inviteCode || "").trim().toUpperCase();
    if (!characterReady()) {
      if (code) state.inviteCode = code;
      if (input && state.inviteCode) input.value = state.inviteCode;
      toast(state.inviteCode ? ("Finish your character to join " + state.inviteCode) : "Finish your character first");
      if (root.SSDNSCreator && root.SSDNSCreator.open) root.SSDNSCreator.open(true);
      return;
    }
    join(code);
  }
  function consumeInvite() {
    if (!state.inviteCode || !characterReady()) return;
    join(state.inviteCode);
  }
  var INVITE_KEY = "ssdns.sheet.invite";
  function rememberInvite(code) {
    try { root.sessionStorage.setItem(INVITE_KEY, JSON.stringify({ code: code, at: Date.now() })); } catch (e) {}
  }
  function storedInvite() {
    try {
      var parsed = JSON.parse(root.sessionStorage.getItem(INVITE_KEY) || "null");
      if (!parsed || !parsed.code) return "";
      if (Date.now() - Number(parsed.at || 0) > 10 * 60 * 1000) return "";
      return String(parsed.code);
    } catch (e) { return ""; }
  }
  function readRoomParam() {
    var code = "";
    try {
      var loc = root.location;
      if (!loc) return storedInvite();
      var params = new URLSearchParams(loc.search || "");
      var raw = params.get("room");
      if (!raw && loc.hash) {
        var hash = String(loc.hash || "").replace(/^#/, "");
        var hp = new URLSearchParams(hash);
        raw = hp.get("room") || "";
      }
      if (!raw) return storedInvite();
      code = String(raw).trim().toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 12);
      if (!code) return storedInvite();
      rememberInvite(code);
      params.delete("room");
      var qs = params.toString();
      var next = loc.pathname + (qs ? "?" + qs : "");
      if (root.history && root.history.replaceState) root.history.replaceState(null, "", next);
    } catch (e) {}
    return code || storedInvite();
  }

  function wireUi() {
    var btnJoin = $("#btnDmJoin");
    var btnLeave = $("#btnDmLeave");
    if (btnJoin) {
      btnJoin.addEventListener("pointerdown", function () {
        var status = $("#dmJoinStatus");
        if (status && !state.joined && characterReady()) status.textContent = "Connecting…";
      });
      btnJoin.addEventListener("click", function () {
        joinFromBar();
      });
    }
    if (btnLeave) btnLeave.addEventListener("click", function () {
      var ask = root.SSDNSAsk && root.SSDNSAsk.confirm
        ? root.SSDNSAsk.confirm("Leave the table? Your sheet stays on this device.")
        : Promise.resolve(false);
      ask.then(function (ok) { if (ok) leave(); });
    });
    var input = $("#dmJoinCode");
    if (input) input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); joinFromBar(); }
    });
  }

  var LOCK_KEY = "ssdns.sheet.joinLock";
  function characterId() {
    var d = doc();
    return (d && d.id) || "";
  }
  function readLock() {
    try { return JSON.parse(localStorage.getItem(LOCK_KEY) || "null"); } catch (e) { return null; }
  }
  function lockHeldByOther() {
    var cur = readLock();
    if (!cur || !cur.tab || cur.tab === state.tabId) return false;
    if (Date.now() - (cur.ts || 0) > 6500) return false;
    var cid = characterId();
    if (cid && cur.characterId && cur.characterId !== cid) return false;
    return true;
  }
  function claimJoinLock() {
    if (lockHeldByOther()) return false;
    try {
      localStorage.setItem(LOCK_KEY, JSON.stringify({ tab: state.tabId, characterId: characterId(), ts: Date.now() }));
    } catch (e) {}
    return !lockHeldByOther();
  }
  function refreshJoinLock() {
    if (lockHeldByOther()) {
      showReadOnly();
      return;
    }
    if (state.readOnly) return;
    claimJoinLock();
  }
  function lockSheet(on) {
    var sheet = $("#sheet");
    if (sheet) {
      if (on) sheet.setAttribute("inert", "");
      else sheet.removeAttribute("inert");
    }
    var nodes = document.querySelectorAll("#sheet input, #sheet select, #sheet textarea, #sheet button, .appbar button, #dmJoinBar button, #dmJoinBar input");
    Array.prototype.forEach.call(nodes, function (node) {
      if (node.closest && node.closest(".tab-warn")) return;
      node.disabled = !!on;
    });
  }
  function showReadOnly() {
    state.readOnly = true;
    document.body.classList.add("sheet-readonly");
    lockSheet(true);
    var btn = $("#btnDmJoin");
    if (btn) btn.disabled = true;
    var b = $("#tabWarn");
    if (!b) {
      b = document.createElement("div");
      b.id = "tabWarn";
      b.className = "tab-warn";
      document.body.appendChild(b);
    }
    if (!$("#btnTakeOver")) {
      b.textContent = "";
      b.appendChild(document.createTextNode("Another tab has this character open. Only one tab joins the table. "));
      var take = document.createElement("button");
      take.type = "button";
      take.className = "btn sm";
      take.id = "btnTakeOver";
      take.textContent = "Take over editing";
      take.addEventListener("click", function (ev) {
        if (ev.stopPropagation) ev.stopPropagation();
        takeOverEditing();
      });
      b.appendChild(take);
    }
    b.hidden = false;
  }
  function clearReadOnly() {
    state.readOnly = false;
    document.body.classList.remove("sheet-readonly");
    lockSheet(false);
    var btn = $("#btnDmJoin");
    if (btn) btn.disabled = false;
    var b = $("#tabWarn");
    if (b) b.hidden = true;
  }
  function takeOverEditing() {
    try {
      localStorage.setItem(LOCK_KEY, JSON.stringify({ tab: state.tabId, characterId: characterId(), ts: Date.now() }));
    } catch (e) {}
    clearReadOnly();
    claimJoinLock();
  }
  function bootWhenReady() {
    state.inviteCode = readRoomParam();
    hookRollHelper();
    wireUi();
    setUiJoined(false);
    setInterval(refreshJoinLock, 2000);
    window.addEventListener("storage", function (e) {
      if (root.SSDNSCreator && root.SSDNSCreator.isOpen && root.SSDNSCreator.isOpen()) return;
      if (!e || e.key !== LOCK_KEY) return;
      if (lockHeldByOther()) showReadOnly();
      else if (state.readOnly) clearReadOnly();
    });
    document.addEventListener("visibilitychange", upgradeTurnSeen);
    var tries = 0;
    var t = setInterval(function () {
      tries++;
      if (root.SSDNSApp || tries > 50) {
        clearInterval(t);
        setTimeout(function () {
          if (!claimJoinLock()) {
            showReadOnly();
            setUiJoined(false);
            return;
          }
          setTimeout(function () {
            if (lockHeldByOther()) {
              showReadOnly();
              setUiJoined(false);
              return;
            }
            refreshJoinLock();
            if (!state.inviteCode) state.inviteCode = readRoomParam();
            if (state.inviteCode) {
              if (!state.joined) setUiJoined(false);
              return;
            }
            var saved = loadLocal();
            var input = $("#dmJoinCode");
            var shown = input ? String(input.value || "").trim().toUpperCase() : "";
            var cid = characterId();
            var maxJoinAge = 12 * 60 * 60 * 1000;
            var ageOk = saved && saved.joinedAt && (Date.now() - Number(saved.joinedAt)) < maxJoinAge;
            var sheetRoom = saved && saved.by === "sheet" && saved.joined === true && saved.left !== true && saved.roomCode && saved.characterId && cid && saved.characterId === cid && ageOk;
            if (sheetRoom) {
              var code = String(saved.roomCode).toUpperCase();
              if (!shown && input) { input.value = saved.roomCode; shown = code; }
              if (shown === code) {
                toast("Rejoining " + saved.roomCode);
                join(saved.roomCode);
              } else setUiJoined(false);
            } else {
              if (input) input.value = "";
              if (!saved || saved.by !== "sheet" || saved.joined === false) {
                try { localStorage.removeItem(LS_OLD); } catch (err) {}
              }
              setUiJoined(false);
            }
          }, 250);
        }, 400);
      }
    }, 100);
  }

  window.addEventListener("pagehide", function () {
    if (state.left) {
      state.joined = false;
      state.roomCode = null;
      saveLocal();
    } else if (state.joined) saveLocal();
    try {
      var cur = readLock();
      if (cur && cur.tab === state.tabId) localStorage.removeItem(LOCK_KEY);
    } catch (e) {}
  });

  window.addEventListener("unhandledrejection", function (e) {
    var reason = e && e.reason;
    var msg = String((reason && (reason.message || reason.code)) || reason || "");
    if (/CONNECTION_CLOSED|ERR_CONNECTION|unavailable|network-request-failed|Failed to fetch|client is offline/i.test(msg)) {
      if (e.preventDefault) e.preventDefault();
      if (state.joined) setBadge("reconnecting");
    }
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootWhenReady);
  } else {
    bootWhenReady();
  }
})(window);

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

  /* Non-blocking toast that fades on its own (no click to dismiss). */
  function fadeToast(msg, ms) {
    var d = root.document;
    if (!d || !d.body) return null;
    var box = d.getElementById("ssdnsFadeToasts");
    if (!box) {
      box = d.createElement("div");
      box.id = "ssdnsFadeToasts";
      box.className = "fade-toasts";
      box.setAttribute("aria-live", "polite");
      d.body.appendChild(box);
    }
    var t = d.createElement("div");
    t.className = "fade-toast";
    t.textContent = String(msg || "");
    box.appendChild(t);
    var life = ms || 4000;
    setTimeout(function () { t.classList.add("out"); }, Math.max(0, life - 700));
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, life);
    return t;
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
    var guns = (c.guns || []).map(function (g, i) {
      if (!g || !g.weapon) return null;
      var st = (v.guns || []).filter(function (x) { return x && x.w && x.w.id === g.weapon; })[0];
      var name = st && st.w ? st.w.name : g.weapon;
      var cond = (g.ruined || g.broken) ? "ruined" : (g.jammed ? "jammed" : (g.cracked ? "cracked" : (g.fouled ? "fouled" : (g.dirty ? "dirty" : "ok"))));
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
        ruined: !!(g.ruined || g.broken),
        exploded: !!g.exploded,
        wrecked: !!g.wrecked,
        misStreak: Number(g.misStreak) || 0,
        pendingD4: !!g.pendingD4,
        weapon: g.weapon || "",
        dmOnly: !!(g.dmOnly || (st && st.w && st.w.dmOnly) || (g.record && g.record.dmOnly)),
        range: st && st.range ? st.range : "",
        properties: st && st.w && st.w.properties ? st.w.properties : "",
        group: st && st.w && st.w.group ? st.w.group : "",
        action: st && st.w && st.w.action ? st.w.action : "",
        ammo: st && st.w && st.w.ammo ? st.w.ammo : "",
        mod: g.mod || "",
        tier: st && st.tier ? st.tier : "",
        unwieldy: !!(st && st.unwieldy),
        scatter: !!(st && st.w && st.w.scatter),
        /* SAMPLE trackers: firearms only, so the DMCC stops offering a misfire override on bows */
        misfire: st && st.misfire && !(root.SSDNSApp && root.SSDNSApp.isFirearm && st.w && !root.SSDNSApp.isFirearm(st.w)) ? st.misfire : "",
        rugged: !!(st && st.w && /rugged/i.test(st.w.properties || "")),
        note: st && st.note ? st.note : "",
        chambers: (g.chambers || []).slice(),
        lockedChambers: Array.isArray(g.lockedChambers) ? g.lockedChambers.slice() : [],
        caliber: (st && st.w && st.w.ammo) || g.caliber || "",
        index: i,
        equipped: g.equipped !== false,
        tr: !!(st && st.w && (root.SSDNSApp && root.SSDNSApp.canTacticalReload ? root.SSDNSApp.canTacticalReload(st.w, c) : st.w.tr)),
        slow: !!(st && st.w && st.w.slow),
        ammoPool: g.ammoPool == null ? "" : String(g.ammoPool),
        attackMode: g.attackMode === "adv" || g.attackMode === "dis" ? g.attackMode : "",
        pools: (root.SSDNSApp && root.SSDNSApp.ammoChoices) ? root.SSDNSApp.ammoChoices(i) : [],
        chamber: g.chamber || "",
        rechamber: (root.SSDNSApp && root.SSDNSApp.rechamberOptions) ? root.SSDNSApp.rechamberOptions(i).map(function (o) { return { value: o.value, label: o.label, cost: o.cost, allowed: o.allowed }; }) : []
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
      ironRevealed: !!c.ironRevealed, /* 0.3.96: Pact Seeker's Borrowed Iron shown to the player (DMCC Reveal button) */
      background: c.background || "",
      pistolero: Array.isArray(c.feats) && c.feats.indexOf("pistolero") >= 0, /* 0.3.73: DM drawer Fan toggle */
      lineage: [c.lineage, c.sublineage].filter(Boolean).join(" · "),
      hpCurrent: c.hpCurrent,
      /* L0188: exhaustion 4+ halves HP max; the DM sees the max that counts. hpMaxBase is the typed one. */
      hpMax: (root.SSDNSSheet && root.SSDNSSheet.effHpMax && c.hpMax !== "" && c.hpMax != null) ? root.SSDNSSheet.effHpMax(Number(c.hpMax)) : c.hpMax,
      hpMaxBase: c.hpMax,
      exhaustion: root.SSDNSSheet && root.SSDNSSheet.exhaustionLevel ? root.SSDNSSheet.exhaustionLevel() : 0,
      speed: root.SSDNSCondFx && root.SSDNSCondFx.speed ? root.SSDNSCondFx.speed(c) : (c.speed || ""),
      supplies: root.SSDNSSupplies ? root.SSDNSSupplies.view(c) : null,
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
      attuneCap: c.attuneCap || "",
      items: (c.items || []).map(function (item) {
        if (!item) return null;
        if (root.SSDNSItems && root.SSDNSItems.unlimitedFix) root.SSDNSItems.unlimitedFix(item);
        return {
          uid: item.uid || "",
          catalogId: item.catalogId || "",
          name: item.name || "",
          type: item.type || "",
          count: item.count == null ? 1 : item.count,
          weight: item.weight == null ? null : item.weight,
          effect: item.effect || { kind: "text" },
          art: item.art || "",
          playerAdded: !!item.playerAdded,
          approved: item.approved !== false,
          addressedTo: item.addressedTo || "",
          attune: !!item.attune,
          attuned: !!item.attuned,
          rarity: item.rarity || "",
          wear: item.wear || "",
          equipSlot: item.equipSlot || "",
          dmAllowDrop: !!item.dmAllowDrop,
          dmAllowRob: !!item.dmAllowRob,
          dmOnly: !!item.dmOnly,
          description: item.description || "",
          uses: item.uses || { max: null },
          chargesLeft: item.chargesLeft == null ? null : item.chargesLeft,
          attunePending: !!item.attunePending,
          dirty: !!item.dirty,
          stack: !!item.stack
        };
      }).filter(Boolean),
      inventoryLocked: !!c.inventoryLocked,
      /* 0.3.87: carried / max for the DMCC Give-tab inventory panel, and what is on offer to another player */
      carry: (function () {
        if (!root.SSDNSItems || !root.SSDNSItems.weightReport) return null;
        try { var wr = root.SSDNSItems.weightReport(c); return { carried: wr.carried, capacity: wr.capacity, over: !!wr.over, on: !!wr.on }; } catch (e) { return null; }
      })(),
      giving: root.SSDNSGive ? root.SSDNSGive.outgoing(c).map(function (r) { return { id: r.id, kind: r.kind, uid: r.uid || "", qty: r.qty, to: r.otherName || "", label: r.label || "", slotKind: r.slotKind || "", index: r.index == null ? null : r.index }; }) : [],
      features: c.features || "",
      personality: c.personality || "",
      guns: guns,
      melee: (c.melee || []).map(function (m, i) {
        if (!m || !m.weapon) return null;
        var lists = [].concat((root.SSDNS_RULES && root.SSDNS_RULES.melee) || [], (root.SSDNS_RULES && root.SSDNS_RULES.otherRanged) || []);
        var w = null;
        lists.forEach(function (row) { if (row && row.id === m.weapon) w = row; });
        return { index: i, weapon: m.weapon, name: (w && w.name) || m.weapon, equipped: m.equipped !== false, dmOnly: !!(m.dmOnly || (w && w.dmOnly) || (m.record && m.record.dmOnly)) };
      }).filter(Boolean),
      focus: c.instrument ? {
        id: c.instrument,
        equipped: c.focusEquipped !== false,
        carry: (root.SSDNSEquip && root.SSDNSEquip.focusCarry) ? root.SSDNSEquip.focusCarry(c).carry : ""
      } : null,
      longRangeHex: (c.feats || []).indexOf("long-range-hex") >= 0,
      sharpshooter: (c.feats || []).indexOf("sharpshooter") >= 0,
      conditions: c.tableConditions || "",
      takingCover: !!c.takingCover,
      surpriseDraw: !!c.surpriseDraw,
      holster: c.holster || "",
      holsterR: c.holsterR || "",
      belt: c.belt || "",
      /* N66: the checkbox feeds TR even when no belt row is picked. The DM map reads this. */
      gunBelt: !!c.gunBelt,
      cover: c.cover || "",
      coverLock: !!c.coverLock,
      badgeState: c.badgeState || "",
      /* M5: the DMCC's Starting kit line + Grant full kit button read these */
      kitMode: c.kitMode || "",
      kitFull: !!(c.kitGrants && c.kitGrants.full),
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
      ammo: (c.ammo || []).filter(Boolean).map(function (a) {
        return { type: a.type || "", caliber: a.caliber || "", count: Number(a.count) || 0 };
      }),
      castSpells: (c.calling === "hexslinger" && root.SSDNSApp && root.SSDNSApp.castList) ? root.SSDNSApp.castList() : [],
      /* SAMPLE trackers: class resources + non-gun weapon rows for the DMCC card and the DM map token badge */
      trackers: root.SSDNSTrackers && root.SSDNSTrackers.snapshot ? root.SSDNSTrackers.snapshot(c) : null,
      /* B2: lights/darkvision ride the snapshot so the DM map can write them onto the token
         even when this player's Map tab is closed. Snapshot validate only requires name + updatedAt. */
      lightProfile: (function () {
        try {
          return root.SSDNSLighting && root.SSDNSLighting.tokenProfile ? root.SSDNSLighting.tokenProfile(c) : null;
        } catch (e) { return null; }
      })(),
      updatedAt: new Date().toISOString()
    };
  }

  function clearUnsubs() {
    state.unsubs.forEach(function (fn) { try { fn(); } catch (e) {} });
    state.unsubs = [];
  }

  async function loadFirebase() {
    if (state.db && state.uid && state._fb) return state._fb;
    var cfg = root.SSDNS_FIREBASE_CONFIG;
    if (!cfg) throw new Error("Missing firebase-config.js");
    var appMod = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js");
    var authMod = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js");
    var dbMod = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js");
    var app;
    try { app = appMod.getApp("ssdns-player-join"); }
    catch (e) { app = appMod.initializeApp(cfg, "ssdns-player-join"); }
    var auth = authMod.getAuth(app);
    var emu = /(?:\?|&)emu=1(?:&|$)/.test(String((root.location && root.location.search) || ""));
    if (emu && authMod.connectAuthEmulator) {
      try { authMod.connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true }); }
      catch (e) {}
    }
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
    if (emu && dbMod.connectDatabaseEmulator) {
      try { dbMod.connectDatabaseEmulator(state.db, "127.0.0.1", 9000); }
      catch (e) {}
    }
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
  var portraitCache = { src: "", out: "" };
  function cachedPortrait(src) {
    src = src || "";
    if (src === portraitCache.src) return portraitCache.out;
    if (!src || String(src).indexOf("data:") !== 0 || src.length < 12000) {
      var plain = String(src).indexOf("data:") === 0 ? src : "";
      portraitCache = { src: src, out: plain };
      return plain;
    }
    var pending = src;
    shrinkPortrait(pending).then(function (out) {
      if (portraitCache.src === pending && portraitCache.out === out) return;
      portraitCache = { src: pending, out: out || "" };
      publishSnapshot();
    }).catch(function () {});
    return portraitCache.out || "";
  }
  var publishNow = (root.SSDNSGrab && root.SSDNSGrab.coalesce ? root.SSDNSGrab.coalesce : function (work) {
    var busy = false;
    var again = false;
    var run = function () {
      if (busy) { again = true; return Promise.resolve(false); }
      busy = true;
      var loop = function () {
        again = false;
        return Promise.resolve().then(work).then(function () { if (again) return loop(); });
      };
      return loop().then(function () { busy = false; if (again) return run(); return true; }, function (err) {
        busy = false;
        if (again) run();
        return Promise.reject(err);
      });
    };
    return run;
  })(function () {
    if (!state.joined || state.left || !state.db) return;
    var epoch = state.joinEpoch;
    var snap = buildSnapshot();
    if (!snap) return;
    var c = doc() && doc().character;
    snap.portrait = cachedPortrait(c && c.portrait);
    if (!stillHere(epoch)) return;
    var fb = state._fb;
    var playerRef = fb.ref(state.db, roomPath("players/" + state.uid));
    return fb.update(playerRef, {
      id: state.uid,
      uid: state.uid,
      snapshot: snap
    }).then(function () {
      if (!stillHere(epoch)) return;
      var connRef = fb.ref(state.db, roomPath("players/" + state.uid + "/presence/conns/" + state.connId));
      fb.set(connRef, { online: true, lastSeen: new Date().toISOString() }).catch(function () {});
      state.lastEs = snap.es;
      if (!state.toldVisible) {
        state.toldVisible = true;
        toast("DM can see you");
      }
      try { fb.onDisconnect(connRef).remove(); }
      catch (err) { console.warn("[DM Join] presence watch", err); }
    });
  });
  function publishSnapshot() {
    if (!state.joined || state.left || !state.db) return Promise.resolve(false);
    return publishNow().catch(function (e) {
      console.warn("[DM Join] snapshot failed", e);
      return false;
    });
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
        else if (q[i].kind === "attack") await writeAttack(q[i].payload);
      } catch (e) { failed.push(q[i]); }
    }
    if (failed.length) saveQueue(loadQueue().concat(failed));
    state._flushing = false;
    if (!failed.length && q.length) toast("Queued messages sent");
  }
  function rollText(entry) {
    var detail = String((entry && entry.detail) || "");
    if (entry && (entry.heal || /\bheals\b/i.test(detail))) return detail;
    if (entry && entry.freeShot && detail) return detail; /* 0.3.67: one line for a Free shot */
    if (/→\s*(HIT|MISS)/.test(detail)) return detail;
    if (/\bd20\b/.test(detail) && detail.indexOf("=") >= 0) return detail;
    /* 0.3.80: one plain die (dice bar, map dice lane) reads "1d4 = 4", not "d4 1d4 = 4 (4)" (Jessey's UI notes) */
    var one = String(entry.formula || "").trim().match(/^1?d(4|6|8|10|12|20|50|100)$/i);
    var res = entry.result == null ? "" : String(entry.result);
    if (one && !entry.attack && (!detail || detail === res)) {
      var lab = String(entry.label || "").trim();
      var echo = !lab || /^roll$/i.test(lab) || lab.toLowerCase() === "d" + one[1] || lab.toLowerCase() === "1d" + one[1];
      return (echo ? "" : lab + " ") + "1d" + one[1] + " = " + res;
    }
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
    var speaker = root.SSDNSApplied && root.SSDNSApplied.speakerName
      ? (root.SSDNSApplied.speakerName(charName, playerName) || "Player")
      : (charName || playerName || "Player");
    entry.characterName = entry.characterName || charName;
    entry.playerName = entry.playerName || playerName;
    if (!entry.who || entry.who === playerName || entry.who === "Player") entry.who = speaker;
    if (root.SSDNSTestRoll && root.SSDNSTestRoll()) {
      entry.test = true;
      if (String(entry.label || "").indexOf("TEST") < 0) entry.label = (entry.label || "Roll") + " · TEST";
      if (String(entry.detail || "").indexOf("TEST") < 0) entry.detail = (entry.detail ? entry.detail + " · " : "") + "TEST";
    }
    var target = $("#atkTarget");
    if (!entry.targetId && !entry.freeShot && target && target.value && target.value !== "__free") entry.targetId = target.value;
    oaTagOn(entry);
    /* attack-fx: the map request rides on the public feed row only (never on rolls/), and only for rolls the sheet resolved itself */
    var fxReq = entry.fxReq;
    delete entry.fxReq;
    await fb.set(fb.ref(state.db, roomPath("rolls/" + id)), entry);
    var quiet = !!(entry.private || entry.whisper);
    if (!quiet) {
      var feed = {
        id: id, ts: entry.ts, from: state.uid,
        fromName: entry.characterName || entry.who, characterName: entry.characterName || "", playerName: entry.playerName || "", weapon: entry.weapon || "", spellName: entry.spellName || "", text: rollText(entry), kind: "roll", who: entry.characterName || entry.who, formula: entry.formula || "", dice: Array.isArray(entry.dice) ? entry.dice : null
      };
      if (fxReq && !entry.awaitDm && root.SSDNSMapFx && root.SSDNSMapFx.request) {
        try { feed.fxReq = root.SSDNSMapFx.request(fxReq); } catch (e) {}
      }
      try { await fb.set(fb.ref(state.db, roomPath("tableFeed/" + id)), feed); }
      catch (err) { console.warn("[DM Join] table feed", err); }
    }
    if (/initiative/i.test(String(entry.label || ""))) {
      try {
        await fb.set(fb.ref(state.db, roomPath("playerInit/" + state.uid)), {
          ts: entry.ts, init: Number(entry.result) || 0, name: entry.characterName || entry.who, from: state.uid
        });
        fadeToast("Initiative: " + (Number(entry.result) || 0), 4500);
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
    if (target === "__free") target = "";
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
  function writeAttack(entry) {
    entry = entry || {};
    var target = entry.targetId || ($("#atkTarget") && $("#atkTarget").value);
    if (target === "__free") target = "";
    if (!target) return Promise.resolve({ ok: false });
    var c = doc() && doc().character;
    var id = "atk_" + (entry.rollId || (Date.now().toString(36) + Math.random().toString(36).slice(2, 6)));
    var row = {
      ts: entry.ts || new Date().toISOString(),
      from: state.uid,
      targetId: target,
      amount: Number(entry.amount) || 0,
      hitTotal: Number(entry.hitTotal),
      nat: entry.nat,
      crit: !!entry.crit,
      nat1: !!entry.nat1 || Number(entry.nat) === 1,
      label: entry.label || "",
      type: "attack",
      dice: entry.dice || "",
      formula: entry.formula || "",
      weapon: entry.weapon || "",
      spellName: entry.spellName || "",
      gun: !!entry.gun,
      spell: !!entry.spell,
      cover: entry.cover || "",
      coverSet: !!entry.coverSet,
      characterName: (c && c.name) || entry.characterName || "",
      playerName: (c && c.player) || "",
      rollId: entry.rollId || "",
      targetName: entry.targetName || "",
      sfx: entry.sfx || "attack",
      weaponId: entry.weaponId || "",
      arrow: String(entry.arrow || "").slice(0, 160)
    };
    if (Number(entry.critMin) >= 2 && Number(entry.critMin) < 20) row.critMin = Number(entry.critMin); /* Champion / Dead Eye crit range */
    if (entry.shots && typeof entry.shots === "object") row.shots = entry.shots;
    /* 0.3.60: carry the card breakdown so the DM's card shows the d20 and damage die faces */
    if (entry.n1 != null && isFinite(Number(entry.n1))) row.n1 = Number(entry.n1);
    if (entry.n2 != null && isFinite(Number(entry.n2))) row.n2 = Number(entry.n2);
    if (Array.isArray(entry.parts) && entry.parts.length) row.parts = entry.parts.map(function (p) { return { label: String((p && p.label) || ""), value: Number(p && p.value) || 0 }; });
    if (Array.isArray(entry.dmgFaces) && entry.dmgFaces.length) row.dmgFaces = entry.dmgFaces.map(function (n) { return Number(n) || 0; });
    if (Array.isArray(entry.dmgParts) && entry.dmgParts.length) row.dmgParts = entry.dmgParts.map(function (p) { return { label: String((p && p.label) || ""), value: Number(p && p.value) || 0 }; });
    if (entry.dmgFormula) row.dmgFormula = String(entry.dmgFormula);
    if (entry.dmgType) row.dmgType = String(entry.dmgType);
    oaTagOn(row, entry);
    return state._fb.set(state._fb.ref(state.db, roomPath("encounter/requests/" + id)), row);
  }
  /* turn order PR 2 (item 4): the rolls of an attack that used a DM-approved opportunity attack carry its id, so the
     DMCC never treats them as out of turn */
  function oaTagOn(row, src) {
    var tag = (src && src.oa) || (row && row.oa) || "";
    if (!tag && root.SSDNSActionPips && root.SSDNSActionPips.oaTag) tag = root.SSDNSActionPips.oaTag();
    if (tag && row) row.oa = String(tag);
    return row;
  }
  function postAttack(entry) {
    entry = entry || {};
    if (!entry.targetId || offlineNow()) {
      if (entry.targetId) enqueue("attack", entry);
      return Promise.resolve({ ok: false, queued: !!entry.targetId });
    }
    return writeAttack(entry).then(function () { return { ok: true }; }).catch(function (e) {
      var msg = String((e && (e.code || e.message)) || e || "");
      if (/PERMISSION_DENIED|permission_denied|permission/i.test(msg)) return { ok: true };
      console.warn("[DM Join] attack", e);
      enqueue("attack", entry);
      return { ok: false, queued: true };
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
  var MUSIC_LIVE_MS = 15000;
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
        /* 0.3.86 Player Give: an offer is state, not a one-shot. It is picked up whenever it is seen (also after a
           refresh or on another device); the ledger row it points at decides what happens, once. */
        if (cmd.type === "give_offer") {
          state.lastCmdSeen[id] = 1;
          if (root.SSDNSGiveSheet && cmd.payload && cmd.payload.xferId) root.SSDNSGiveSheet.onOffer(cmd.payload.xferId);
          return;
        }
        if (state.lastCmdSeen[id]) { noteReplayHp(id, cmd); return; }
        var ts = cmdTime(cmd);
        /* 0.3.55: no automatic playback. A music command is only heard live, as the DM pushes it;
           an old one replayed on load or join (or after a reconnect) is skipped, never started. */
        if ((cmd.type === "music" || cmd.type === "sfx") && (!ts || Date.now() - ts > MUSIC_LIVE_MS)) {
          state.lastCmdSeen[id] = 1;
          if (ts > (state.marker || 0)) saveMarker(ts);
          return;
        }
        if (!ts || ts <= (state.marker || 0)) {
          state.lastCmdSeen[id] = 1;
          noteReplayHp(id, cmd);
          return;
        }
        state.lastCmdSeen[id] = 1;
        saveSeen();
        try { handleCommandAcked(cmd); } catch (err) { console.warn("[DM Join] command", err); }
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
            /* L0188: the toast comes from SSDNSCondFx and says what the condition does */
            if (!root.SSDNSCondFx) toast(line);
          }
          return;
        }
        if (seenStamp !== stamp) {
          state._condSeen[id] = { stamp: stamp, name: row.name, label: row.name, rounds: row.rounds };
          if (primed && row.by && row.by !== state.uid && root.SSDNSSheet) {
            var changed = (row.byName || "DM") + " updated " + (root.SSDNSConditions ? root.SSDNSConditions.label(row) : row.name);
            root.SSDNSSheet.addLog({ id: "cond:" + stamp, kind: "alert", text: changed });
            if (!root.SSDNSCondFx) toast(changed);
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

  var saloonBus = null;
  try { saloonBus = new BroadcastChannel("ssdns-saloon"); } catch (e) {}
  function saloonReply(msg) {
    if (!msg) return;
    if (saloonBus) { try { saloonBus.postMessage(msg); } catch (e) {} }
  }
  function onSaloonMessage(ev) {
    var msg = ev && ev.data;
    if (!msg || !msg.id) return;
    state._saloonSeen = state._saloonSeen || {};
    if (state._saloonSeen[msg.id]) return;
    state._saloonSeen[msg.id] = 1;
    if (msg.type === "unlink") {
      saloonReply({ type: "unlinked", id: msg.id, ok: true });
      return;
    }
    if (msg.type === "tableLine") {
      var lineName = String(msg.name || "").slice(0, 48);
      var lineText = String(msg.text || "").slice(0, 240);
      if (msg.color && lineName) {
        root.SSDNSTokenColors = root.SSDNSTokenColors || {};
        root.SSDNSTokenColors[lineName.trim().toLowerCase()] = String(msg.color).slice(0, 32);
      }
      if (root.SSDNSSheet && root.SSDNSSheet.addLog) {
        root.SSDNSSheet.addLog({ id: "saloon:" + msg.id, kind: "note", text: lineText });
      }
      if (state.joined && !state.left) {
        postChat({ id: "saloon_" + String(msg.id).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40), fromName: lineName || undefined, text: lineText });
        if (msg.notice) postLedger({ type: "alert", what: String(msg.notice).slice(0, 240), flag: true, who: lineName || "Saloon", characterName: lineName || "" });
      }
      return;
    }
    if (msg.type !== "requestCredits") return;
    var amount = Math.floor(Number(msg.amount) || 0);
    if (amount < 1 || amount > 100000) {
      saloonReply({ type: "credits", id: msg.id, ok: false, reason: "bad amount" });
      return;
    }
    if (!state.joined || state.left || !state._fb || !state.db || !state.uid) {
      saloonReply({ type: "credits", id: msg.id, ok: false, reason: "no room" });
      return;
    }
    var c = doc() && doc().character;
    var safe = String(msg.id).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40);
    var reqId = "bank_" + (safe || Date.now().toString(36));
    var row = {
      ts: new Date().toISOString(),
      from: state.uid,
      targetId: state.uid,
      amount: amount,
      type: "bank",
      reason: String(msg.reason || "saloon").slice(0, 160),
      characterName: (c && c.name) || "",
      clientId: msg.id
    };
    state._fb.set(state._fb.ref(state.db, roomPath("encounter/requests/" + reqId)), row).catch(function () {
      saloonReply({ type: "credits", id: msg.id, ok: false, reason: "write failed" });
    });
  }
  if (saloonBus) saloonBus.addEventListener("message", onSaloonMessage);
  window.addEventListener("message", function (ev) {
    if (ev.origin && ev.origin !== window.location.origin) return;
    onSaloonMessage(ev);
  });

  /* 0.3.54 reward routing: instruments go to the focus slot, explosives and
     consumables become real items with a Use button. Anything else stays a line
     in Equipment, as before. Returns true when the reward was routed. */
  function routeReward(payload, cmd) {
    var Items = root.SSDNSItems;
    var text = String(payload.text || "");
    var qtyMatch = text.match(/^\s*(\d+)\s*x\s+/i);
    var qty = Math.max(1, Number(payload.qty) || (qtyMatch ? parseInt(qtyMatch[1], 10) : 1) || 1);
    var kind = payload.kind || "";
    var hit = Items && Items.classifyReward ? Items.classifyReward(text, payload.itemId || "") : { kind: "" };
    if (!kind) kind = hit.kind;
    /* L0188-L0190: a reward with food / water values becomes a real tagged item (catalog row or DM-made) */
    var sup = payload.supply && typeof payload.supply === "object" ? payload.supply : null;
    if (sup && Items && Items.add && root.SSDNSApp && root.SSDNSApp.applyPatch && kind !== "instrument") {
      var nameOnly = text.replace(/^\s*\d+\s*x\s+/i, "").trim() || "Supplies";
      var base0 = hit.row || (payload.itemId && Items.byId ? Items.byId(payload.itemId) : null);
      var made = Object.assign({}, base0 || {
        id: "custom-" + nameOnly.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        name: nameOnly,
        type: sup.meals || sup.water ? "consumable" : "gear",
        description: "From the DM.",
        effect: { kind: "text", text: nameOnly }
      });
      made.tags = (Items.tagsOf ? Items.tagsOf((base0 && base0.tags || []).concat(sup.tags || [])) : (sup.tags || []));
      if (sup.meals) made.meals = sup.meals;
      if (sup.water) made.water = sup.water;
      if (sup.capacity) { made.capacity = sup.capacity; made.fill = sup.fill != null ? sup.fill : 0; }
      if (sup.weight != null && isFinite(Number(sup.weight)) && Number(sup.weight) >= 0) made.weight = Number(sup.weight); /* #107: lb each */
      made.count = qty;
      var okSup = false;
      root.SSDNSApp.applyPatch(function (d) { var res = Items.add(d.character, made, { dm: true }); okSup = !!(res && res.ok); });
      if (okSup) {
        toast("DM sent " + (qty > 1 ? qty + "× " : "") + made.name);
        if (root.SSDNSSheet) root.SSDNSSheet.addLog({ id: "item:" + (payload.grantId || cmd.id || ""), kind: "item", text: "Item: " + (qty > 1 ? qty + "× " : "") + made.name + " (" + made.tags.join(", ") + ")" });
        if (Items.paintSheet) Items.paintSheet();
        return true;
      }
    }
    /* C1 (2026-10-20): Big Fifty rounds the DM gives go to the Big Fifty .50-90 pool (0.15 lb each), like store rounds */
    var Store = root.SSDNSStore;
    var plan50 = !kind && Store && Store.grantPlan ? Store.grantPlan({ id: payload.itemId || "", name: text.replace(/^\s*\d+\s*x\s+/i, "") }) : null;
    if (plan50 && plan50.type === "bigfifty" && root.SSDNSApp && root.SSDNSApp.applyPatch) {
      var rounds = Math.max(1, Number(plan50.qty) || 1) * qty;
      root.SSDNSApp.applyPatch(function (d) {
        var am = d.character.ammo = Array.isArray(d.character.ammo) ? d.character.ammo : [];
        var pool = am.filter(function (a) { return a && a.type === "bigfifty" && String(a.caliber || "") === ".50-90"; })[0];
        if (!pool) { pool = { type: "bigfifty", caliber: ".50-90", count: 0 }; am.push(pool); }
        pool.count = (parseInt(pool.count, 10) || 0) + rounds;
      });
      toast("DM sent " + rounds + " Big Fifty rounds (.50-90)");
      if (root.SSDNSSheet) root.SSDNSSheet.addLog({ id: "item:" + (payload.grantId || cmd.id || ""), kind: "item", text: "Ammo: " + rounds + " Big Fifty .50-90" });
      return true;
    }
    if (!kind || kind === "weapon") return false;
    var logId = "item:" + (payload.grantId || cmd.id || "");
    var app = root.SSDNSApp;
    if (!app || !app.applyPatch) return false;
    if (kind === "instrument") {
      var instId = payload.instrument || hit.id;
      if (!instId) return false;
      var placed = "";
      app.applyPatch(function (d) {
        var ch = d.character;
        if (!ch.instrument) {
          ch.instrument = instId;
          ch.instrumentQuality = payload.quality || hit.quality || "cheap";
          placed = "focus";
        } else if (Items && Items.add) {
          Items.add(ch, { id: "instrument-" + instId, name: hit.name || text, type: "gear", tags: ["instrument:" + instId], quality: payload.quality || hit.quality || "cheap", description: "Instrument (focus). Swap it into the focus slot on Gear.", effect: { kind: "text", text: "Spellcasting focus (Storyteller)." } }, { dm: true });
          placed = "item";
        }
      });
      if (!placed) return false;
      toast("DM sent " + (hit.name || text) + (placed === "focus" ? " (in your focus slot)" : " (in Items)"));
      if (root.SSDNSSheet) root.SSDNSSheet.addLog({ id: logId, kind: "item", text: "Instrument: " + (hit.name || text) + (placed === "focus" ? " → focus slot" : " → Items") });
      return true;
    }
    if ((kind === "explosive" || kind === "consumable" || kind === "item") && Items && Items.add) {
      var raw = hit.row || (payload.itemId && Items.byId ? Items.byId(payload.itemId) : null);
      if (!raw && hit.legacy) raw = { id: hit.legacy.id, name: hit.legacy.name, type: "explosive", description: hit.legacy.notes || "", effect: { kind: "text", text: hit.legacy.notes || hit.legacy.name } };
      if (!raw) return false;
      var ok = false;
      app.applyPatch(function (d) {
        var res = Items.add(d.character, Object.assign({}, raw, { count: qty }), { dm: true });
        ok = !!(res && res.ok);
      });
      if (!ok) return false;
      toast("DM sent " + (qty > 1 ? qty + "× " : "") + raw.name);
      if (root.SSDNSSheet) root.SSDNSSheet.addLog({ id: logId, kind: "item", text: "Item: " + (qty > 1 ? qty + "× " : "") + raw.name });
      if (Items.paintSheet) Items.paintSheet();
      return true;
    }
    return false;
  }

  /* 0.3.86: payload.item = a full item from the DM's typed builder (kind, weight, fields). */
  function rewardTyped(payload, cmd) {
    var Items = root.SSDNSItems, app = root.SSDNSApp;
    if (!payload.item || typeof payload.item !== "object" || !Items || !Items.add || !app || !app.applyPatch) return false;
    var qty = Math.max(1, Number(payload.qty) || 1);
    var gid = payload.grantId || cmd.id || "";
    var res = null;
    app.applyPatch(function (d) {
      res = Items.add(d.character, Object.assign({}, payload.item, { count: qty, grantId: gid }), { dm: true });
    });
    if (!res || !res.ok) return false;
    var name = (res.item && res.item.name) || payload.item.name || "item";
    var where = res.pool ? " (" + res.rounds + " in Ammo)" : "";
    toast("DM sent " + (qty > 1 ? qty + "× " : "") + name + where);
    if (root.SSDNSSheet) root.SSDNSSheet.addLog({ id: "item:" + gid, kind: "item", text: "Item: " + (qty > 1 ? qty + "× " : "") + name + where });
    if (Items.paintSheet) Items.paintSheet();
    return true;
  }
  /* C11 (Encounter Bot review): "Arrows (20)", "2x Cartridges, Light (20)" or payload.ammo {type, caliber, qty} → Ammo pool */
  function rewardAmmo(payload, cmd) {
    var app = root.SSDNSApp, St = root.SSDNSStore;
    var plan = payload.ammo && payload.ammo.type ? { kind: payload.ammo.type === "cartridge" ? "cartridge" : "ammo", type: payload.ammo.type, caliber: payload.ammo.caliber || "", qty: Number(payload.ammo.qty) || 1 } : null;
    var text = String(payload.text || "");
    var mult = 1;
    if (!plan && St && St.grantPlan && text) {
      var m = /^\s*(\d+)\s*x\s+/i.exec(text);
      if (m) mult = parseInt(m[1], 10) || 1;
      var p = St.grantPlan({ id: payload.itemId || "", name: text.replace(/^\s*\d+\s*x\s+/i, "") });
      if (p && (p.kind === "cartridge" || p.kind === "ammo")) plan = p;
    }
    if (!plan || !app || !app.applyPatch) return false;
    var type = plan.kind === "cartridge" ? "cartridge" : String(plan.type || "");
    var n = (Number(plan.qty) || 1) * mult;
    app.applyPatch(function (d) {
      var c = d.character;
      c.ammo = Array.isArray(c.ammo) ? c.ammo : [];
      var pool = c.ammo.filter(function (a) { return a && a.type === type && String(a.caliber || "").toLowerCase() === String(plan.caliber || "").toLowerCase(); })[0];
      if (!pool) { pool = { type: type, caliber: plan.caliber || "", count: 0 }; c.ammo.push(pool); }
      pool.count = (parseInt(pool.count, 10) || 0) + n;
    });
    var WORD = { bigfifty: "Big Fifty rounds", buck: "buckshot shells", slug: "slug shells", percussion: "powder, ball & cap shots", arrows: "arrows", bolts: "crossbow bolts", stones: "sling stones", needles: "blowpipe needles" };
    var cal = plan.caliber && !(type === "bigfifty") ? plan.caliber + " " : "";
    var label = n + " " + cal + (type === "cartridge" ? "cartridges" : (WORD[type] || type)) + (type === "bigfifty" ? " (.50-90)" : "");
    toast("DM sent " + label + " (Ammo)");
    if (root.SSDNSSheet) root.SSDNSSheet.addLog({ id: "item:" + (payload.grantId || cmd.id || ""), kind: "item", text: "Ammo: " + label + (payload.reason ? " (" + payload.reason + ")" : "") });
    return true;
  }
  function undoTyped(grantId) {
    var Items = root.SSDNSItems, app = root.SSDNSApp;
    if (!Items || !app || !app.applyPatch) return false;
    var hit = false;
    app.applyPatch(function (d) {
      var list = (d.character && d.character.items) || [];
      for (var i = list.length - 1; i >= 0; i--) {
        if (list[i] && list[i].grantId === grantId) {
          if (list[i].equipSlot && root.SSDNSDoll && root.SSDNSDoll.equip) root.SSDNSDoll.equip(d.character, list[i].equipSlot, "");
          list.splice(i, 1); hit = true; break;
        }
      }
    });
    if (hit && Items.paintSheet) Items.paintSheet();
    return hit;
  }

  /* ---- Give tab rework (sheet 0.3.108 / DMCC 0.2.121) ----
     Every DM give (reward_item / reward_es / kit_grant) is remembered as what it changed on this sheet (item counts,
     Ammo pools, weapon slots), so the DMCC's per-give Undo takes back exactly that, and the sheet writes a small
     ack at players/<uid>/grantAcks/<grant id> (the player's own node, like handoutAck) so the DMCC can show a check. */
  function grantStoreKey() { return "grants." + (((doc() || {}).id) || "local") + "." + (state.roomCode || "none"); }
  function loadGrants() { try { var g = JSON.parse(readStore(grantStoreKey()) || "{}"); return g && typeof g === "object" ? g : {}; } catch (e) { return {}; } }
  function saveGrants(g) {
    var keys = Object.keys(g);
    if (keys.length > 80) keys.sort(function (a, b) { return (g[a].ts || 0) - (g[b].ts || 0); }).slice(0, keys.length - 60).forEach(function (k) { delete g[k]; });
    writeStore(grantStoreKey(), JSON.stringify(g));
  }
  function ammoKeyOf(a) { return String(a.type || "") + "|" + String(a.caliber || "").trim().toLowerCase(); }
  function grantShape() {
    var d = doc(), c = d && d.character;
    if (!c) return null;
    var items = {};
    (c.items || []).forEach(function (it) { if (it && it.uid) items[it.uid] = it.count == null ? 1 : (Number(it.count) || 0); });
    var ammo = {};
    (c.ammo || []).forEach(function (a) { if (a && a.type) ammo[ammoKeyOf(a)] = (ammo[ammoKeyOf(a)] || 0) + (parseInt(a.count, 10) || 0); });
    return { items: items, ammo: ammo, guns: (c.guns || []).map(function (g) { return (g && g.weapon) || ""; }), melee: (c.melee || []).map(function (m) { return (m && m.weapon) || ""; }), equipment: String(c.equipment || "") };
  }
  function grantDiff(a, b) {
    if (!a || !b) return null;
    var out = { items: {}, ammo: {}, guns: [], melee: [], line: "" }, any = false;
    Object.keys(b.items).forEach(function (uid) { var n = b.items[uid] - (a.items[uid] || 0); if (n > 0) { out.items[uid] = n; any = true; } });
    Object.keys(b.ammo).forEach(function (k) { var n = b.ammo[k] - (a.ammo[k] || 0); if (n > 0) { out.ammo[k] = n; any = true; } });
    b.guns.forEach(function (w, i) { if (w && w !== a.guns[i]) { out.guns.push({ i: i, w: w }); any = true; } });
    b.melee.forEach(function (w, i) { if (w && w !== a.melee[i]) { out.melee.push({ i: i, w: w }); any = true; } });
    if (b.equipment.length > a.equipment.length && b.equipment.indexOf(a.equipment) === 0) { out.line = b.equipment.slice(a.equipment.length).replace(/^\n+/, ""); if (out.line) any = true; }
    return any ? out : null;
  }
  /** Take back exactly what one DM give added. true when this sheet had a record of it. */
  function undoGrant(grantId) {
    var g = loadGrants(), rec = g[grantId];
    var A = root.SSDNSApp;
    if (!rec || !rec.diff || !A || !A.applyPatch) return false;
    var diff = rec.diff, took = [];
    A.applyPatch(function (d) {
      var c = d.character;
      if (!c) return;
      var list = c.items || [];
      Object.keys(diff.items || {}).forEach(function (uid) {
        for (var i = list.length - 1; i >= 0; i--) {
          var it = list[i];
          if (!it || it.uid !== uid) continue;
          var left = (it.count == null ? 1 : Number(it.count) || 0) - diff.items[uid];
          if (left > 0) it.count = left;
          else {
            if (it.equipSlot && root.SSDNSDoll && root.SSDNSDoll.equip) root.SSDNSDoll.equip(c, it.equipSlot, "");
            list.splice(i, 1);
          }
          took.push(it.name || "item");
          break;
        }
      });
      Object.keys(diff.ammo || {}).forEach(function (k) {
        var need = diff.ammo[k];
        (c.ammo || []).forEach(function (a) {
          if (need <= 0 || !a || ammoKeyOf(a) !== k) return;
          var have = parseInt(a.count, 10) || 0, n = Math.min(have, need);
          a.count = have - n; need -= n;
        });
        took.push(diff.ammo[k] + " rounds");
      });
      (diff.guns || []).forEach(function (x) {
        var sl = (c.guns || [])[x.i];
        if (sl && sl.weapon === x.w) { c.guns[x.i] = { weapon: "", tier: "", chamber: "", mod: "", engraving: false, capacity: "", load: "buck", loaded: 0, chambers: [], proficient: false, jammed: false, cracked: false, fouled: false, dirty: false }; took.push(x.w); }
      });
      (diff.melee || []).forEach(function (x) {
        var sl = (c.melee || [])[x.i];
        if (sl && sl.weapon === x.w) { c.melee[x.i] = { weapon: "", proficient: false }; took.push(x.w); }
      });
      if (diff.line) {
        var eq = String(c.equipment || ""), at = eq.lastIndexOf(diff.line);
        if (at >= 0) { c.equipment = (eq.slice(0, at) + eq.slice(at + diff.line.length)).replace(/\n{2,}/g, "\n").replace(/^\n+|\n+$/g, ""); took.push("a gear line"); var ta = document.querySelector('[data-f="character.equipment"]'); if (ta) ta.value = c.equipment; }
      }
    });
    delete g[grantId];
    saveGrants(g);
    if (root.SSDNSItems && root.SSDNSItems.paintSheet) { try { root.SSDNSItems.paintSheet(); } catch (e) {} }
    if (root.SSDNSSheet) root.SSDNSSheet.addLog({ id: "undo:" + grantId, kind: "item", text: "The DM took back " + (rec.text || "a give") + "." });
    toast("The DM took back " + (rec.text || "a give"));
    publishSnapshot();
    return true;
  }
  function ackGrant(id, kind, ok) {
    if (!id || !state.joined || state.left || !state.db || !state.uid || !state._fb) return;
    var key = String(id).replace(/[.#$\[\]\/]/g, "_");
    var row = {}; row[key] = { ok: ok !== false, kind: kind || "", ts: new Date().toISOString() };
    var fb = state._fb;
    fb.update(fb.ref(state.db, roomPath("players/" + state.uid + "/grantAcks")), row).catch(function () {});
  }
  function handleCommandAcked(cmd) {
    cmd = cmd || {};
    var payload = cmd.payload || {};
    var gid = payload.grantId || cmd.id || "";
    var pre = cmd.type === "reward_item" ? grantShape() : null;
    var undone = false;
    if (cmd.type === "undo_item" && payload.grantId) {
      if (!claimGrant("undo:" + payload.grantId)) { ackGrant(payload.undoId || ("undo_" + payload.grantId), "undo", true); return; }
      undone = undoGrant(payload.grantId);
      if (undone) { ackGrant(payload.undoId || ("undo_" + payload.grantId), "undo", true); return; }
      /* a new-style undo (undoId) for a give this sheet never got: nothing to take back (no guessing at old lines) */
      if (payload.undoId && !(state.appliedRewards && state.appliedRewards["item:" + payload.grantId])) {
        if (root.SSDNSSheet) root.SSDNSSheet.addLog({ id: "undo:" + payload.grantId, kind: "alert", text: "The DM undid a give that never reached this sheet." });
        ackGrant(payload.undoId, "undo", true);
        return;
      }
    }
    handleCommand(cmd);
    if (cmd.type === "reward_item" && gid) {
      var diff = grantDiff(pre, grantShape());
      if (diff) {
        var g = loadGrants();
        g[gid] = { ts: Date.now(), diff: diff, text: String(payload.text || "").replace(/^\s*(\d+)\s*x\s+/i, "$1 ") };
        saveGrants(g);
      }
      ackGrant(gid, "item", !!(state.appliedRewards && state.appliedRewards["item:" + gid]));
    } else if (cmd.type === "reward_es" && gid) {
      ackGrant(gid, "es", !!(state.appliedRewards && state.appliedRewards["es:" + gid]));
    } else if (cmd.type === "kit_grant" && gid) {
      ackGrant(gid, "kit", !!(state.appliedRewards && state.appliedRewards["kit:" + gid]));
    } else if (cmd.type === "undo_item" && payload.grantId) {
      ackGrant(payload.undoId || ("undo_" + payload.grantId), "undo", true);
    }
  }
  function handleCommand(cmd) {
    var payload = cmd.payload || {};
    switch (cmd.type) {
      case "init_prompt":
        fadeToast("Roll initiative!", 5000);
        toast("Roll initiative!", "Roll", function () {
          if (root.SSDNSSheet && root.SSDNSSheet.rollInitiative) root.SSDNSSheet.rollInitiative();
        }, Math.max(3000, Number(payload.wait) || 8000));
        break;
      case "init_set":
        fadeToast("Initiative: " + (payload.init != null ? payload.init : "?") + (payload.auto ? " (auto-rolled)" : ""), 5000);
        if (root.SSDNSSheet) root.SSDNSSheet.addLog({ id: "init:" + (cmd.id || ""), kind: "alert", text: "Initiative: " + payload.init + (payload.auto ? " (auto-rolled by the DM)" : "") });
        break;
      case "reactPrompt":
        onReactPrompt(payload);
        break;
      case "reactAnswer":
        if (root.SSDNSReact && root.SSDNSReact.deliver) root.SSDNSReact.deliver(payload.promptId, payload.choice || "pass", payload);
        break;
      case "reward_es":
        var bankId = String(payload.grantId || "").indexOf("bank:") === 0 ? String(payload.grantId).slice(5) : "";
        var bankOk = applyEsReward(payload.delta || 0, payload.reason || "DM reward", payload.grantId || cmd.id);
        if (bankId) saloonReply({ type: "credits", id: bankId, ok: !!bankOk, amount: Number(payload.delta) || 0 });
        break;
      case "bank_reply":
        saloonReply({ type: "credits", id: payload.requestId, ok: false, amount: Number(payload.amount) || 0 });
        break;
      case "reward_item":
        if (!claimGrant("item:" + (payload.grantId || cmd.id || payload.text || ""))) break;
        if (root.SSDNSTestJammer && root.SSDNSTestJammer.matches && root.SSDNSTestJammer.matches(payload.text) && root.SSDNSApp && root.SSDNSApp.grantTestGun) {
          root.SSDNSApp.grantTestGun();
          toast("DM sent TEST Jammer");
          if (root.SSDNSSheet) root.SSDNSSheet.addLog({ id: "item:" + (payload.grantId || cmd.id || ""), kind: "item", text: "Weapon: TEST Jammer" });
          break;
        }
        /* 0.3.84 default UI by type: a typed item (Give tab / drawer builder) lands as that real item, and ammo
           (typed text or a picked pack) fills its Ammo pool, so nothing given is a 0-lb text line (C11) */
        if (rewardTyped(payload, cmd)) break;
        if (rewardAmmo(payload, cmd)) break;
        var listed = root.SSDNSApp && root.SSDNSApp.grantListedWeapon && root.SSDNSApp.grantListedWeapon(payload.id || payload.text, { dirty: !!payload.dirty });
        if (listed && listed.name) {
          toast("DM sent " + listed.name + (listed.dirty ? " (Dirty)" : ""));
          if (root.SSDNSSheet) root.SSDNSSheet.addLog({ id: "item:" + (payload.grantId || cmd.id || ""), kind: "item", text: "Weapon: " + listed.name });
          break;
        }
        if (routeReward(payload, cmd)) break;
        appendEquipment(payload.text || "");
        toast("DM sent item: " + (payload.text || ""));
        if (root.SSDNSSheet) root.SSDNSSheet.addLog({ id: "item:" + (payload.grantId || cmd.id || ""), kind: "item", text: "Item: " + (payload.text || "") });
        break;
      case "cover":
        if (root.SSDNSApp && root.SSDNSApp.applyPatch) {
          root.SSDNSApp.applyPatch(function (doc) {
            if (!doc.character) return;
            doc.character.cover = payload.cover || "";
            doc.character.coverLock = !!payload.lock;
          });
        }
        if (root.SSDNSPlaytest && root.SSDNSPlaytest.syncCover) root.SSDNSPlaytest.syncCover();
        if (root.SSDNSSheet) root.SSDNSSheet.addLog({ kind: "alert", text: payload.lock ? "DM locked your cover." : "DM set your cover." });
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
        if (root.SSDNSSheet) {
          var rollBody = payload.text || "";
          var rollSpeaker = payload.characterName || "";
          if (!rollSpeaker && payload.who && payload.who !== "DM") rollSpeaker = payload.who;
          if (/^DM:\s*/i.test(rollBody)) rollBody = rollBody.replace(/^DM:\s*/i, "");
          var rollShown = rollBody;
          if (rollSpeaker && rollShown.indexOf(rollSpeaker) !== 0 && rollShown.indexOf("→") < 0) rollShown = rollSpeaker + ": " + rollShown;
          else if (!rollSpeaker && payload.who && payload.who !== "DM" && rollShown.indexOf(payload.who) !== 0) rollShown = payload.who + ": " + rollShown;
          root.SSDNSSheet.addLog({
            id: "roll:" + (payload.id || cmd.id),
            kind: "roll",
            text: rollShown,
            ts: cmd.ts,
            replace: /→\s*(HIT|MISS|CRIT)/.test(rollShown)
          });
        }
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
      case "gun":
        applyGunCommand(payload, payload.grantId || cmd.id);
        break;
      case "inventory_lock":
        if (root.SSDNSItems && root.SSDNSApp && root.SSDNSApp.applyPatch) {
          root.SSDNSApp.applyPatch(function (doc) {
            if (doc.character) doc.character.inventoryLocked = !!payload.locked;
          });
        }
        if (root.SSDNSSheet) root.SSDNSSheet.addLog({ kind: "alert", text: payload.locked ? "DM locked your inventory." : "DM unlocked your inventory." });
        break;
      case "item_use":
        if (root.SSDNSItems && root.SSDNSItems.useOnSheet) root.SSDNSItems.useOnSheet(payload.uid || "", { aimed: true });
        break;
      case "item_mod":
        if (root.SSDNSItems && root.SSDNSApp && root.SSDNSApp.applyPatch) {
          var itemResult = { ok: false };
          root.SSDNSApp.applyPatch(function (doc) {
            if (doc.character) itemResult = root.SSDNSItems.applyCommand(doc.character, payload);
          });
          if (root.SSDNSSheet) root.SSDNSSheet.addLog({ kind: "item", text: itemResult.ok ? "DM updated an item." : (itemResult.reason || "DM item change failed.") });
        }
        break;
      case "take_gear":
        if (root.SSDNSApp && root.SSDNSApp.removeGearLine) {
          var took = root.SSDNSApp.removeGearLine(payload.text || "");
          var tookLine = took ? ("DM took " + (payload.text || "an item") + ".") : ("DM could not find " + (payload.text || "that item") + ".");
          if (root.SSDNSSheet) root.SSDNSSheet.addLog({ id: "gear:" + (cmd.id || ""), kind: "alert", text: tookLine });
        }
        break;
      case "kit_grant":
        /* M5 (Mech PR A): the DM grants the Full kit later (DMCC player card). Same unpack as the wizard's Full kit;
           nothing the sheet already has is given twice (kits.js grantFull). Runs once per grant id. */
        if (!claimGrant("kit:" + (payload.grantId || cmd.id || ""))) break;
        grantFullKit(payload);
        break;
      case "badge":
        /* 0.3.108 Badge Bound: the DM's Bright / Dull / Tarnished toggle. The sheet repaints live (doll Focus slot, chips,
           cast blocks, the spell list: Tarnished swaps to the Lawless list, Bright / Dull bring the Lawman list back). */
        var bState = { bright: 1, dull: 1, tarnished: 1 }[payload.state] ? payload.state : "bright";
        if (root.SSDNSApp && root.SSDNSApp.applyPatch) {
          root.SSDNSApp.applyPatch(function (doc) {
            if (!doc.character) return;
            doc.character.badgeState = bState;
            if (bState === "tarnished" && root.SSDNSApp.ensureLawlessBook) root.SSDNSApp.ensureLawlessBook(doc.character);
          });
        }
        if (root.SSDNSTableUx && root.SSDNSTableUx.paintCallingChips) root.SSDNSTableUx.paintCallingChips();
        if (root.SSDNSFocus && root.SSDNSFocus.paintCastBlock) { try { root.SSDNSFocus.paintCastBlock(); } catch (e) {} }
        if (root.SSDNSSheet) root.SSDNSSheet.addLog({ kind: "alert", text: "Badge set to " + ({ bright: "Bright", dull: "Dull", tarnished: "Tarnished (Lawless)" }[bState]) + "." });
        break;
      case "iron_reveal": /* 0.3.96 reveal toggle; 0.3.108: no effect on what the sheet shows */
        if (root.SSDNSApp && root.SSDNSApp.applyPatch) {
          root.SSDNSApp.applyPatch(function (doc) {
            if (doc.character) doc.character.ironRevealed = payload.on !== false;
          });
        }
        if (root.SSDNSPlaytest && root.SSDNSPlaytest.paintPact) root.SSDNSPlaytest.paintPact();
        if (root.SSDNSDoll && root.SSDNSDoll.paint) root.SSDNSDoll.paint();
        /* 0.3.101: the iron always shows from the Pact pick; an older DMCC may still send this. The field is saved
           (harmless, nothing reads it) and no log line is written. */
        break;
      case "set_conditions":
        if (root.SSDNSSheet && root.SSDNSSheet.setConditions) root.SSDNSSheet.setConditions(payload.list || [], payload);
        break;
      case "rest":
        if (root.SSDNSSheet) root.SSDNSSheet.applyRest(payload.kind || "short");
        break;
      case "supplies":
        /* L0188 food & water: the DM gives/takes rations and water, ends a day, sets the mode */
        if (root.SSDNSSuppliesSheet) root.SSDNSSuppliesSheet.command(payload);
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
      case "surprise_draw":
        if (root.SSDNSApp && root.SSDNSApp.applyPatch) {
          root.SSDNSApp.applyPatch(function (doc) {
            if (doc.character) doc.character.surpriseDraw = !!payload.on;
          });
        }
        if (root.SSDNSSheet) root.SSDNSSheet.addLog({ kind: "alert", text: payload.on ? "Surprise draw armed." : "Surprise draw cleared." });
        break;
      case "undo_item":
        if (payload.grantId && undoTyped(payload.grantId)) break;
        if (root.SSDNSSheet) root.SSDNSSheet.undoItem(payload.text || "");
        break;
      case "music":
        applyMusic(payload);
        break;
      case "sfx":
        // The sender already heard it. sharedCue drops the echo when from is this client.
        if (root.SSDNSAudio && root.SSDNSAudio.sharedCue) {
          var sfxName = root.SSDNSAudio.sharedCue(payload.event, cmd.from, state.uid);
          if (sfxName) root.SSDNSAudio.play(sfxName);
        }
        break;
      case "attack_result":
        if (!claimGrant("atk:" + (payload.grantId || payload.rollId || cmd.id))) break;
        if (root.SSDNSSheet && root.SSDNSSheet.addLog) {
          root.SSDNSSheet.addLog({
            id: "roll:" + (payload.rollId || cmd.id),
            kind: "roll",
            text: payload.text || "",
            attack: true,
            nat: payload.nat,
            crit: payload.verdict === "CRIT" || !!payload.crit,
            replace: true
          });
        }
        toast(payload.text || payload.verdict || "");
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
  function grantFullKit(payload) {
    var K = root.SSDNSKits, A = root.SSDNSApp;
    if (!K || !K.grantFull || !A || !A.applyPatch) return null;
    var res = null;
    A.applyPatch(function (d) {
      if (!d || !d.character) return;
      res = K.grantFull(d.character);
      if (res && res.ok && res.es && root.SSDNSBridge && root.SSDNSBridge.breakdown) {
        var add = root.SSDNSBridge.breakdown(res.es);
        d.shards = d.shards || {};
        Object.keys(add).forEach(function (k) { d.shards[k] = (parseInt(d.shards[k], 10) || 0) + add[k]; });
      }
    });
    if (!res) return null;
    var line = !res.ok ? ("The DM's Full kit didn't land: " + (res.reason || "no calling")) :
      (res.already ? "The DM granted your Full kit. You already had all of it, so nothing was added." :
        "The DM granted your Full kit: " + res.added.join(", ") + "." + (res.keptArmor ? " You kept the armor you wear (" + res.keptArmor + " not swapped in)." : ""));
    if (root.SSDNSItems && root.SSDNSItems.paintSheet) { try { root.SSDNSItems.paintSheet(); } catch (e) {} }
    if (root.SSDNSDoll && root.SSDNSDoll.paint) { try { root.SSDNSDoll.paint(); } catch (e) {} }
    if (root.SSDNSPlaytest && root.SSDNSPlaytest.syncSheet) { try { root.SSDNSPlaytest.syncSheet(); } catch (e) {} }
    if (root.SSDNSSheet && root.SSDNSSheet.addLog) root.SSDNSSheet.addLog({ kind: "alert", text: line });
    toast(res.ok ? "Full kit granted." : line);
    return res;
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
  function applyEsReward(delta, reason, id, label) {
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
        return false;
      }
      d.shards = w.shards;
      syncShardFields(w.shards);
      var neu = Bridge.cpValue(d.shards);
      state.lastEs = neu;
      toast(label ? label + ": " + (delta >= 0 ? "+" : "") + delta + " ES" : "DM " + (delta >= 0 ? "granted +" : "took ") + Math.abs(delta) + " ES" + (reason && reason !== "DM reward" ? " (" + reason + ")" : ""));
      if (root.SSDNSAudio) root.SSDNSAudio.play("reward");
      /* Give tab fix 10: the log keeps the DM's reason, "DM +25 ES (Bounty)" */
      var why = !label && reason && reason !== "DM reward" ? " (" + reason + ")" : "";
      if (root.SSDNSSheet) root.SSDNSSheet.addLog({ id: id ? "es:" + id : "", kind: "es", text: (label ? label + " " : "DM ") + (delta >= 0 ? "+" : "") + delta + " ES" + why });
      publishSnapshot();
      return true;
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
  /* Turn order PR 1 (T2): the sheet's Action / Bonus / Reaction markers live on the player's own room row
     (players/{uid}/turnMarkers, already writable by that player), so the DM sees them and a reload keeps them. */
  var markerTimer = null;
  var markerPending = null;
  function pushTurnMarkers(m) {
    if (!m || !state.joined || state.left || !state.db || !state.uid || !state._fb) return;
    markerPending = m;
    if (markerTimer) return;
    markerTimer = setTimeout(function () {
      markerTimer = null;
      var v = markerPending;
      markerPending = null;
      if (!v || !state.joined || state.left || !state.db) return;
      var Pnow = root.SSDNSActionPips;
      if (Pnow && Pnow.state) v = Pnow.state();
      var fb = state._fb;
      fb.update(fb.ref(state.db, roomPath("players/" + state.uid)), {
        turnMarkers: Object.assign({}, v, { updatedAt: new Date().toISOString() })
      }).catch(function (err) { console.warn("[DM Join] turn markers", err); });
    }, 250);
  }
  function pullTurnMarkers() {
    if (!state.joined || state.left || !state.db || !state.uid || !state._fb) return Promise.resolve(false);
    var fb = state._fb;
    var P = root.SSDNSActionPips;
    return fb.get(fb.ref(state.db, roomPath("players/" + state.uid + "/turnMarkers"))).then(function (snap) {
      var v = snap && snap.val ? snap.val() : null;
      if (v && P && P.adopt) { P.adopt(v); return true; }
      if (P && P.state) pushTurnMarkers(P.state());
      return false;
    }).catch(function () { return false; });
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
    var coverBonus = 0;
    var coverTitle = payload.coverTitle || "";
    if (ability === "DEX" && !/sacred flame/i.test(payload.label || "")) {
      if (payload.coverBonus != null && payload.coverBonus !== "") coverBonus = Number(payload.coverBonus) || 0;
      else if (root.SSDNSApplied && root.SSDNSApplied.coverSaveBonus) {
        var mine = doc() && doc().character;
        var adj = root.SSDNSApplied.coverSaveBonus(mine && mine.cover, "DEX", {});
        coverBonus = adj.bonus || 0;
        if (!coverTitle) coverTitle = adj.title || "";
      }
    }
    mod += coverBonus;
    var dlg = document.createElement("dialog");
    dlg.className = "dlg";
    var form = document.createElement("form");
    form.method = "dialog";
    var title = document.createElement("h2");
    title.textContent = (payload.label || "Save") + " · " + ability + " DC " + (payload.dc == null ? "?" : payload.dc);
    var note = document.createElement("p");
    var sign = (mod >= 0 ? "+" : "") + mod;
    note.textContent = "Your " + ability + " modifier is " + sign + (coverBonus ? (" (cover +" + coverBonus + ")") : "") + (payload.rider ? (". On a fail: " + payload.rider) : "") + (payload.damage ? (". Damage on a fail: " + payload.damage) : "");
    if (coverBonus && coverTitle) note.title = coverTitle;
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
      /* L0188: exhaustion 3+ gives disadvantage on saves */
      var exDis = root.SSDNSSheet && root.SSDNSSheet.condRollMode && root.SSDNSSheet.condRollMode("save") === "dis";
      var nat2 = null;
      if (exDis) { nat2 = 1 + Math.floor(Math.random() * 20); nat = Math.min(nat, nat2); }
      var total = nat + mod;
      var dc = Number(payload.dc);
      var failed = isFinite(dc) ? total < dc : false;
      var line = ability + " save " + nat + sign + " = " + total + (isFinite(dc) ? " vs DC " + dc : "") + (failed ? " FAIL" : " OK") + (nat === 20 ? " · natural 20" : "");
      if (exDis) line += " · disadvantage (Exhaustion " + root.SSDNSSheet.exhaustionLevel() + ")";
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
  /* Sheet cost for a DM gun command. Reload matches reloadCost (Quick Reload bonus, slow full turn). */
  function gunCommandPip(payload) {
    payload = payload || {};
    var app = root.SSDNSApp;
    var op = payload.op;
    if (op === "reload") {
      var max = Number(payload.max) || 0;
      var cost = max ? "bonus" : ((app && app.reloadCost && app.reloadCost(payload.index, max)) || "action");
      return { cost: cost, what: max ? "Tactical Reload" : "Reload" };
    }
    if (op === "tr") return { cost: "bonus", what: "Tactical Reload" };
    if (op === "unload") return { cost: "action", what: "Unload" };
    if (op === "reopen") return { cost: "action", what: "Reopen chamber" };
    return null;
  }
  function applyGunCommand(payload, id) {
    payload = payload || {};
    var grant = "gun:" + (payload.grantId || id || "");
    if (!grant || !claimGrant(grant)) return;
    var app = root.SSDNSApp;
    if (!app) return;
    var pip = gunCommandPip(payload);
    /* N60: a DM command still runs when the pip is spent. The DM toasts. This sheet does not hard-block or write a chat line. */
    if (root.SSDNSActionPips) root.SSDNSActionPips._dmAllow = true;
    if (app) app._dmCmd = true;
    try { applyGunCommandNow(payload, id, pip); }
    finally {
      if (root.SSDNSActionPips) root.SSDNSActionPips._dmAllow = false;
      if (app) app._dmCmd = false;
    }
  }
  function applyGunCommandNow(payload, id, pip) {
    var app = root.SSDNSApp;
    if (payload.op === "rechamber" && app.rechamberGun) {
      var rc = app.rechamberGun(payload.index, String(payload.chamber || ""), { free: true });
      if (rc && !rc.ok && root.SSDNSSheet && root.SSDNSSheet.addLog) root.SSDNSSheet.addLog({ kind: "alert", text: "DM rechamber failed: " + rc.reason });
      return;
    }
    if (payload.op === "unload" && app.unloadGunIndex) app.unloadGunIndex(payload.index);
    else if (payload.op === "reload" && app.reloadGun) {
      /* N51: an empty reload toasts on the sheet. No chat line and no table-log alert. */
      app.reloadGun(payload.index, payload.max);
    }
    else if (payload.op === "set" && app.applyPatch) {
      app.applyPatch(function (doc) {
        var g = doc.character && doc.character.guns && doc.character.guns[payload.index];
        var n = Number(payload.loaded);
        if (!g) return;
        if (isFinite(n)) g.loaded = Math.max(0, n);
        if (Array.isArray(payload.chambers)) g.chambers = payload.chambers.slice();
        if (payload.jammed != null) g.jammed = !!payload.jammed;
        if (payload.fouled != null) g.fouled = !!payload.fouled;
        if (payload.ruined != null) g.ruined = !!payload.ruined;
        if (payload.pendingD4 != null) g.pendingD4 = !!payload.pendingD4;
        if (payload.dirty != null) g.dirty = !!payload.dirty;
        if (payload.misStreak != null) g.misStreak = payload.misStreak;
      });
    }     else if (payload.op === "fire" && root.SSDNSGunRoll) {
      if (app.setAttackMode && (payload.mode === "adv" || payload.mode === "dis")) app.setAttackMode(payload.index, payload.mode);
      if (payload.targetId != null && payload.targetId !== "" && root.document) {
        var aim = root.document.querySelector("#atkTarget");
        if (aim) {
          var wantId = String(payload.targetId);
          var aimed = false;
          Array.prototype.forEach.call(aim.options || [], function (o) { if (o && o.value === wantId) aimed = true; });
          if (aimed) aim.value = wantId;
        }
      }
      if (payload.dm) root.SSDNSGunRoll._dm = { mode: payload.mode === "adv" || payload.mode === "dis" ? payload.mode : "" };
      if (payload.free) root.SSDNSGunRoll._free = true;
      /* DM-run opportunity attack: arm it here so this shot spends Reaction, not Action, even if the marker write has not landed yet. */
      if (payload.oa && !payload.offhand && !payload.fan && root.SSDNSActionPips && root.SSDNSActionPips.setOa) {
        var oaNow = root.SSDNSActionPips.state ? root.SSDNSActionPips.state() : {};
        if (!oaNow.oaArmed) root.SSDNSActionPips.setOa("oaArmed", String(payload.oa));
      }
      /* 0.3.72: DM-sent off-hand shot: Bonus pip, no positive ability mod to damage, chat tagged off-hand */
      if (payload.offhand) root.SSDNSGunRoll._offhand = true;
      else if (payload.fan) root.SSDNSGunRoll._fan = true;
      /* SAMPLE trackers: the DM armed Sneak Attack / Smite Lead for this one shot (DM override of turn / Dull checks) */
      var TRK = root.SSDNSTrackers;
      if (TRK && TRK.toggle && payload.dm) {
        if (payload.sneak) TRK.toggle("sneak", { on: true, dm: true });
        if (payload.smite) TRK.toggle("smite", { on: true, dm: true, level: Number(payload.smite) > 1 ? Number(payload.smite) : 0 });
      }
      try { root.SSDNSGunRoll(payload.index, payload.chamber); }
      finally { root.SSDNSGunRoll._dm = null; root.SSDNSGunRoll._free = null; root.SSDNSGunRoll._offhand = null; root.SSDNSGunRoll._fan = null; }
      return;
    } else if (payload.op === "dirty-d4") {
      if (root.SSDNSD4 && root.SSDNSD4.arm) root.SSDNSD4.arm(payload.index);
      return;
    } else if (payload.op === "clean" && app.applyCleanOption) {
      app.applyCleanOption(payload.index, payload.optionId);
      return;
    } else if (payload.op === "pool" && app.setAmmoPool) {
      app.setAmmoPool(payload.index, payload.pool);
      return;
    } else if (payload.op === "tr" && app.tacticalReload) {
      app.tacticalReload(payload.index);
      return;
    } else if (payload.op === "hex" && app.loadHexAt) {
      app.loadHexAt(payload.index, payload.level);
      return;
    } else if (payload.op === "cast") {
      if (app.prepareGunCast) app.prepareGunCast(payload.index, payload.spell, payload.slot);
      if (root.SSDNSGunCast) root.SSDNSGunCast(payload.index);
      return;
    } else if (payload.op === "reopen" && app.reopenChamber) {
      app.reopenChamber(payload.index);
      return;
    } else if (payload.op === "mode" && app.setAttackMode) {
      app.setAttackMode(payload.index, payload.mode);
      return;
    } else if (payload.op === "misfire" && app.applyPatch && root.SSDNSMisfire) {
      var notes = [];
      app.applyPatch(function (doc) {
        var g = doc.character && doc.character.guns && doc.character.guns[payload.index];
        if (!g) return;
        var applied = root.SSDNSMisfire.applyOverride(g, payload);
        var next = applied.gun;
        g.dirty = !!next.dirty;
        g.fouled = !!next.fouled;
        g.ruined = !!next.ruined;
        g.broken = !!next.broken;
        g.jammed = !!next.jammed;
        g.misStreak = next.misStreak || 0;
        g.pendingD4 = !!next.pendingD4;
        g.pendingD4Rolls = next.pendingD4Rolls;
        g.pendingD4Step = next.pendingD4Step || 0;
        notes = applied.notes || [];
      });
      if (payload.cancelD4 && root.document) {
        var dlg = root.document.querySelector("dialog.d4-reveal");
        if (dlg && dlg.parentNode) dlg.parentNode.removeChild(dlg);
        if (root.document.body) root.document.body.classList.remove("ask-open");
      }
      if (root.SSDNSSheet && !payload.quiet) root.SSDNSSheet.addLog({ id: "gun:" + (id || ""), kind: "alert", text: "DM override: " + (notes.join(", ") || "gun") + "." });
      return;
    } else if (payload.op === "clear-locks" && app.clearLockedChambers) {
      app.clearLockedChambers(payload.index, payload.mode, payload.chamber);
      return;
    } else if (payload.op === "repair" && app.repairGun) {
      app.repairGun(payload.index, payload);
      return;
    } else if (payload.op === "merchant" && root.SSDNSCasterRules) {
      /* L0200: traveling merchant repair (DM) clears Wrecked */
      root.SSDNSCasterRules.merchantRepairGun(payload.index, payload);
      return;
    } else if (payload.op === "take" && app.applyPatch) {
      var takenName = "";
      app.applyPatch(function (doc) {
        var list = payload.kind === "melee" ? (doc.character && doc.character.melee) : (doc.character && doc.character.guns);
        var row = list && list[payload.index];
        if (!row) return;
        takenName = row.name || row.weapon || "a weapon";
        row.equipped = false;
        row.weapon = "";
        row.name = "";
        row.loaded = 0;
        row.chambers = [];
        row.lockedChambers = [];
        row.tier = "";
        row.mod = "";
        row.jammed = false;
        row.fouled = false;
        row.dirty = false;
        row.ruined = false;
        row.broken = false;
        row.exploded = false;
        row.wrecked = false;
      });
      if (root.SSDNSSheet) root.SSDNSSheet.addLog({ id: "gun:" + (id || ""), kind: "alert", text: "DM took " + (takenName || "a weapon") + "." });
      return;
    } else if (payload.op === "receive" && app.receiveWeapon) {
      var received = app.receiveWeapon(payload);
      var recvName = (received && received.name) || payload.name || "a weapon";
      var recvText = received && received.ok
        ? ("Received " + recvName + (received.equipped ? " (equipped)." : " (stowed)."))
        : ("Received " + recvName + " into gear (no open weapon slot).");
      if (root.SSDNSSheet) root.SSDNSSheet.addLog({ id: "gun:" + (id || ""), kind: "alert", text: recvText });
      return;
    } else if (payload.op === "equip" && app.setEquipped) {
      var equipResult = app.setEquipped({
        kind: payload.kind || "gun",
        index: payload.index,
        equipped: payload.equipped !== false,
        dm: true
      });
      var equipWord = payload.equipped !== false ? "equipped" : "unequipped";
      var equipName = (equipResult && equipResult.name) || "a weapon";
      var equipText = equipResult && equipResult.ok
        ? ("DM " + equipWord + " " + equipName + ".")
        : ("DM could not " + equipWord + " " + equipName + (equipResult && equipResult.reason ? ": " + equipResult.reason : "") + ".");
      if (root.SSDNSSheet) root.SSDNSSheet.addLog({ id: "gun:" + (id || ""), kind: "alert", text: equipText });
      return;
    }
    if (payload.op === "test-gun" && app.grantTestGun) {
      app.grantTestGun(payload.index);
      return;
    }
    if (root.SSDNSSheet) root.SSDNSSheet.addLog({ id: "gun:" + (id || ""), kind: "alert", text: "DM " + (payload.op || "adjusted") + " a gun." });
  }
  function applyMusic(payload) {
    if (root.SSDNSMusic) {
      root.SSDNSMusic.onBlocked(function () { if (root.SSDNSSheet) root.SSDNSSheet.showTapHear(); });
      root.SSDNSMusic.apply(payload || {});
      return;
    }
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
      fromName: (entry && entry.fromName) || (c && (root.SSDNSApplied && root.SSDNSApplied.speakerName ? root.SSDNSApplied.speakerName(c.name, c.player) : (c.name || c.player))) || "Player",
      characterName: (c && c.name) || (entry && entry.characterName) || "",
      playerName: (c && c.player) || (entry && entry.playerName) || "",
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
  /* attack-fx: a visual-only request for the DM's map (dynamite arrows and other no-roll shots).
     Same tableFeed row shape the DM's map publishes (kind 'sfx', event 'fx'), so every feed reader skips it. */
  function postFx(req) {
    if (!state.joined || state.left || offlineNow() || !state.uid || !state._fb || !state.db) {
      return Promise.resolve({ ok: false, skipped: true });
    }
    var wh = $("#chkWhisper");
    if (wh && wh.checked) return Promise.resolve({ ok: false, skipped: true });
    var FX = root.SSDNSMapFx;
    if (!FX || !FX.request) return Promise.resolve({ ok: false, skipped: true });
    var fb = state._fb;
    var id = "fxr_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    var c = doc() && doc().character;
    var row = {
      id: id, ts: new Date().toISOString(), from: state.uid,
      fromName: (c && (c.name || c.player)) || "Player",
      text: "fx", kind: "sfx", event: "fx", fxReq: FX.request(req || {})
    };
    return fb.set(fb.ref(state.db, roomPath("tableFeed/" + id)), row).then(function () { return { ok: true }; })
      .catch(function (e) { console.warn("[DM Join] fx", e); return { ok: false }; });
  }
  function postFeed(entry) {
    entry = entry || {};
    if (!state.joined || state.left || offlineNow() || !state.uid || !state._fb || !state.db) {
      return Promise.resolve({ ok: false, skipped: true });
    }
    var id = "d4_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    var c = doc() && doc().character;
    var row = {
      id: id,
      ts: new Date().toISOString(),
      from: state.uid,
      fromName: (c && (c.name || c.player)) || "Player",
      text: entry.text || "",
      kind: entry.kind || "d4",
      result: entry.result,
      formula: entry.formula || "1d4"
    };
    return state._fb.set(state._fb.ref(state.db, roomPath("tableFeed/" + id)), row).then(function () {
      return { ok: true };
    }).catch(function (e) {
      console.warn("[DM Join] table feed", e);
      return { ok: false };
    });
  }
  function postSfx(eventName) {
    var name = root.SSDNSAudio && root.SSDNSAudio.sharedCue ? root.SSDNSAudio.sharedCue(eventName) : "";
    if (!name) return Promise.resolve({ ok: false });
    // commands/broadcast are DM-write. Players already may append tableFeed, so the cue rides there.
    if (!state.joined || state.left || offlineNow() || !state.uid || !state._fb || !state.db) {
      return Promise.resolve({ ok: false, skipped: true });
    }
    var id = "sfx_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    var c = doc() && doc().character;
    var row = {
      id: id,
      ts: new Date().toISOString(),
      from: state.uid,
      fromName: (c && (c.name || c.player)) || "Player",
      text: name,
      kind: "sfx",
      event: name
    };
    return state._fb.set(state._fb.ref(state.db, roomPath("tableFeed/" + id)), row).then(function () {
      return { ok: true };
    }).catch(function (e) {
      console.warn("[DM Join] sfx", e);
      return { ok: false };
    });
  }
  function listenRoomFeeds() {
    var fb = state._fb;
    var room = state.roomCode;
    state._sfxSince = Date.now();
    function bind(path, handler) {
      var r = fb.ref(state.db, roomPath(path));
      var unsub = fb.onValue(r, function (snap) {
        if (!state.joined || state.roomCode !== room) return;
        handler(snap.val() || {});
      }, function () {});
      state.unsubs.push(typeof unsub === "function" ? unsub : function () { try { fb.off(r, "value", unsub); } catch (e) {} });
    }
    /* turn order PR 2 (items 8, 9): the DM can edit or reset my Action / Bonus / R from the DMCC or the map; those
       writes carry by: "dm" + dmAt. My own pushes drop both, so only a fresh DM edit is taken. */
    var markPrimed = false;
    bind("players/" + state.uid + "/turnMarkers", function (val) {
      var P = root.SSDNSActionPips;
      var at = val && val.by === "dm" ? String(val.dmAt || "") : "";
      if (at && at !== state._dmMarkAt && P && P.adopt) {
        state._dmMarkAt = at;
        /* B4: apply only the fields the DM named, so a feet write cannot clear a spent Action. */
        P.adopt(val, { live: true });
        if (markPrimed) toast(val.dmNote || "The DM changed your action markers.");
      }
      markPrimed = true;
    });
    var inspPrimed = false;
    var inspSeen = "";
    bind("table", function (val) {
      var stock = val.store || [];
      var list = Array.isArray(stock) ? stock : Object.keys(stock).map(function (k) { return stock[k]; });
      if (root.SSDNSSheet) root.SSDNSSheet.setStock(list, !!val.storeOpen);
      if (val.storeOpen && root.SSDNSSheet && root.SSDNSSheet.openStore) {
        if (!state._storeOpened) {
          state._storeOpened = true;
          root.SSDNSSheet.openStore(list);
        }
      } else if (!val.storeOpen) state._storeOpened = false;
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
      if (root.SSDNSItems && root.SSDNSItems.setRoom) {
        root.SSDNSItems.setRoom({ weightOn: !!(val && val.weightOn), catalog: (val && val.itemCatalog) || {} });
      }
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
        if (root.SSDNSSheet) root.SSDNSSheet.addLog({ id: "chat:" + id, kind: "chat", text: chatText, ts: row.ts, characterName: row.characterName || "", playerName: row.playerName || "", who: row.fromName || "" });
      });
      chatPrimed = true;
    });
    bind("tableFeed", function (val) {
      Object.keys(val || {}).forEach(function (id) {
        if (state._feedSeen[id]) return;
        state._feedSeen[id] = 1;
        var row = val[id];
        if (!row) return;
        if (row.kind === "sfx") {
          var sfxTs = Date.parse(row.ts);
          var heard = root.SSDNSAudio && root.SSDNSAudio.sharedCue
            ? root.SSDNSAudio.sharedCue(row.event || row.text, row.from, state.uid)
            : "";
          if (heard && sfxTs && sfxTs + 4000 >= (state._sfxSince || 0)) root.SSDNSAudio.play(heard);
          return;
        }
        var own = row.from === state.uid;
        var ts = Date.parse(row.ts);
        if (!own && (!ts || ts <= (state.marker || 0))) return;
        var speaker = row.who || row.fromName || "Table";
        if (speaker === "DM" && row.kind === "roll") speaker = "";
        var text = row.text || "";
        if (row.kind === "roll" && root.SSDNSDice && root.SSDNSDice.tidySingle) text = root.SSDNSDice.tidySingle(text);
        if (speaker && !own && text.indexOf(speaker) !== 0 && text.indexOf("→") < 0) text = speaker + ": " + text;
        if (root.SSDNSSheet) root.SSDNSSheet.addLog({
          id: (row.kind === "roll" ? "roll:" : "feed:") + id,
          kind: row.kind === "roll" ? "roll" : "chat",
          text: text,
          ts: row.ts,
          characterName: row.characterName || "",
          playerName: row.playerName || "",
          who: row.who || row.fromName || "",
          weapon: row.weapon || "",
          replace: row.kind === "roll" && /→\s*(HIT|MISS|CRIT)/.test(text)
        });
      });
    });
    bind("players", function (val) {
      var rows = [];
      var roster = [];
      Object.keys(val || {}).forEach(function (id) {
        var p = val[id] || {};
        var s = p.snapshot || {};
        var pres = p.presence || {};
        var conns = pres.conns;
        var online = false;
        if (conns && typeof conns === "object") online = Object.keys(conns).some(function (cid) { return conns[cid] && conns[cid].online !== false; });
        else online = !!pres.online;
        rows.push({ name: s.name || "Someone", player: s.player || "", online: online });
        roster.push({ uid: id, name: s.name || s.player || "Someone", player: s.player || "", online: online });
      });
      state._roster = roster;
      if (root.SSDNSMapHost && root.SSDNSMapHost.setPlayers) {
        root.SSDNSMapHost.setPlayers(Object.keys(val || {}).map(function (id) {
          var p = val[id] || {};
          var s = p.snapshot || {};
          return { uid: id, id: id, name: s.name || s.player || id };
        }));
      }
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
  function postMercy(entry) {
    entry = entry || {};
    if (!state.joined || !state._fb || !state.db) return Promise.resolve({ ok: false });
    var id = "mercy_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    var c = doc() && doc().character;
    var row = {
      ts: new Date().toISOString(),
      from: state.uid,
      targetId: entry.targetId,
      amount: Number(entry.amount) || 0,
      type: "mercy",
      label: "Mercy Hands",
      characterName: (c && c.name) || ""
    };
    return state._fb.set(state._fb.ref(state.db, roomPath("encounter/requests/" + id)), row);
  }
  /**
   * 0.3.55 End turn. Players can't write table/initiative (DM-only in database.rules.json), so the
   * player posts a one-shot request to encounter/requests (players may create their own rows) and
   * the DMCC runs its own Next for it, only if that player's row is still the current turn.
   */
  function postEndTurn(at) {
    at = at || {};
    if (!state.joined || !state._fb || !state.db) return Promise.resolve({ ok: false });
    var id = "endturn_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    var c = doc() && doc().character;
    var row = {
      ts: new Date().toISOString(),
      from: state.uid,
      targetId: String(at.rowId || ""),
      amount: 0,
      type: "endTurn",
      round: Number(at.round) || 1,
      turn: Number(at.turn) || 0,
      characterName: (c && c.name) || ""
    };
    return state._fb.set(state._fb.ref(state.db, roomPath("encounter/requests/" + id)), row);
  }
  /**
   * B2: a player with no token on the sheet Map can't create map/public/tokens (DM-only write).
   * Same one-shot request row as End turn. encounter/requests validate requires ts, from, targetId,
   * and amount, and does not constrain type, so addToken needs no database rule change.
   * The DM map places the token (and a second press replaces instead of duplicating).
   */
  function postAddToken(info) {
    info = info || {};
    if (!state.joined || !state._fb || !state.db) return Promise.resolve({ ok: false });
    var id = "addtok_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    var c = doc() && doc().character;
    var row = {
      ts: new Date().toISOString(),
      from: state.uid,
      targetId: state.uid,
      amount: 0,
      type: "addToken",
      characterName: (c && c.name) || "",
      sceneId: info.sceneId ? String(info.sceneId) : ""
    };
    return state._fb.set(state._fb.ref(state.db, roomPath("encounter/requests/" + id)), row).then(function () {
      return { ok: true, id: id };
    }).catch(function (e) {
      console.warn("[DM Join] add token", e);
      return { ok: false };
    });
  }
  /**
   * Turn order PR 2 (item 4): ask the DM for an opportunity attack. Same one-shot request row as End turn
   * (encounter/requests, players create their own rows); the DM's Approve / Deny lands on table/initiative/oa.
   */
  function postOaRequest(info) {
    info = info || {};
    if (!state.joined || !state._fb || !state.db) return Promise.resolve({ ok: false });
    var id = "oa_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    var c = doc() && doc().character;
    var row = {
      ts: new Date().toISOString(),
      from: state.uid,
      targetId: String(info.targetId || ""),
      targetName: String(info.targetName || ""),
      amount: 0,
      type: "oa",
      weapon: String(info.weapon || ""),
      characterName: (c && c.name) || ""
    };
    return state._fb.set(state._fb.ref(state.db, roomPath("encounter/requests/" + id)), row).then(function () { return { ok: true, id: id }; });
  }
  /**
   * N67: one-shot reaction window. Same create-only request row as an opportunity attack.
   * phase "ask" is the prompt. phase "answer" is Attack, Cast, Pass, or go.
   */
  function reactRow(card, phase, choice, meta) {
    card = card || {};
    meta = meta || {};
    return {
      ts: new Date().toISOString(),
      from: state.uid,
      targetId: String(card.reactorId || card.reactorPlayerId || card.targetId || ""),
      amount: 0,
      type: "react",
      phase: phase || "ask",
      choice: choice || "",
      promptId: String(card.promptId || ""),
      kind: String(card.kind || ""),
      text: String(card.text || ""),
      moverName: String(card.moverName || ""),
      moverId: String(card.moverId || ""),
      moverPlayerId: String(card.moverPlayerId || state.uid || ""),
      reactorId: String(card.reactorId || ""),
      reactorName: String(card.reactorName || ""),
      reactorKind: String(card.reactorKind || ""),
      reactorPlayerId: String(card.reactorPlayerId || ""),
      spellName: String(card.spellName || meta.spellName || ""),
      spellLevel: parseInt(card.spellLevel, 10) || 0,
      damagerId: String(card.damagerId || ""),
      damagerName: String(card.damagerName || ""),
      casterId: String(card.casterId || ""),
      casterName: String(card.casterName || ""),
      oaId: String(meta.oaId || card.oaId || "")
    };
  }
  function postReact(card) {
    if (!state.joined || !state._fb || !state.db) return Promise.resolve({ ok: false });
    var id = "react_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    return state._fb.set(state._fb.ref(state.db, roomPath("encounter/requests/" + id)), reactRow(card, "ask", "", {})).then(function () {
      return { ok: true, id: id };
    }).catch(function () { return { ok: false }; });
  }
  function postReactAnswer(card, choice, meta) {
    if (!state.joined || !state._fb || !state.db) return Promise.resolve({ ok: false });
    var id = "reacta_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    return state._fb.set(state._fb.ref(state.db, roomPath("encounter/requests/" + id)), reactRow(card, "answer", choice || "pass", meta)).then(function () {
      return { ok: true, id: id };
    }).catch(function () { return { ok: false }; });
  }
  /** The mover's map calls this. A joined player posts the ask. This client shows the card only when it is the reactor. */
  function presentReact(view) {
    if (!state.joined || !state._fb || !state.db || !view) return false;
    if (root.SSDNSReact && root.SSDNSReact.downed && root.SSDNSReact.downed(view)) return false;
    postReact(view);
    return !(view.self || (view.reactorPlayerId && view.reactorPlayerId === state.uid));
  }
  function characterDown() {
    var R = root.SSDNSReact;
    var c = doc() && doc().character;
    if (!R || !c || typeof R.downed !== "function") return false;
    return !!R.downed({
      hp: c.hpCurrent,
      conditions: c.activeConditions,
      status: c.status,
      dead: c.dead,
      unconscious: c.unconscious,
      defeated: c.defeated
    });
  }
  function castPromptSpell(view) {
    var P = root.SSDNSActionPips;
    if (!P || !view || !view.spellName) return;
    var target = view.damagerId || view.casterId || "";
    if (target) {
      var sel = document.querySelector("#atkTarget");
      if (sel && sel.querySelector('option[value="' + String(target).replace(/"/g, "") + '"]')) {
        sel.value = String(target);
        try { sel.dispatchEvent(new Event("change", { bubbles: true })); } catch (e) {}
      }
    }
    root.SSDNSReact.castingReaction = true;
    try {
      if (P.spell) P.spell(view.spellName);
      if (P.openSpell) P.openSpell(view.spellName, view.spellLevel || 0);
    } finally {
      root.SSDNSReact.castingReaction = false;
    }
  }
  function onReactPrompt(view) {
    var R = root.SSDNSReact;
    if (!R || !view) return;
    if ((R.downed && R.downed(view)) || characterDown()) {
      postReactAnswer(view, "pass", { down: true });
      R.close();
      return;
    }
    R.openModal(view, function (choice, meta) {
      meta = meta || {};
      var down = !!(meta.down || (R.downed && R.downed(view)) || characterDown());
      if (down) {
        if (root.SSDNSActionPips && root.SSDNSActionPips.setOa) root.SSDNSActionPips.setOa("oaArmed", "");
        postReactAnswer(view, "pass", { down: true, oaId: meta.oaId || view.oaId || "" });
        R.close();
        return;
      }
      if (choice === "attack") {
        meta.oaId = "oa_" + Date.now().toString(36);
        if (root.SSDNSActionPips && root.SSDNSActionPips.setOa) root.SSDNSActionPips.setOa("oaArmed", meta.oaId);
        R.watchSpent(meta.oaId, function () {
          postReactAnswer(view, "attacked", { oaId: meta.oaId });
          R.close();
        });
        postReactAnswer(view, "attack", meta);
        var held = Object.assign({}, view, {
          hideAttack: true,
          oaId: meta.oaId,
          text: "Make the opportunity attack against " + (view.moverName || "them") + ". It spends your reaction, not your action."
        });
        R.openModal(held, function (c2, meta2) {
          meta2 = meta2 || {};
          if (c2 !== "pass" && !meta2.down && !(R.downed && R.downed(view)) && !characterDown()) return;
          if (root.SSDNSActionPips && root.SSDNSActionPips.setOa) root.SSDNSActionPips.setOa("oaArmed", "");
          postReactAnswer(view, "pass", { oaId: meta.oaId, down: !!(meta2.down || characterDown()) });
          R.close();
        });
        return;
      }
      try {
        if (choice === "cast") castPromptSpell(view);
        postReactAnswer(view, choice || "pass", meta);
      } finally {
        R.close();
      }
    });
  }
  var spellGates = {};
  root.SSDNSReactHost = root.SSDNSReactHost || {};
  root.SSDNSReactHost.askSpell = function (info, proceed) {
    if (!state.joined || !state._fb || !state.db) return false;
    var promptId = "spell_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    var R = root.SSDNSReact;
    if (R) R.bind(promptId, function (choice) {
      if (choice !== "go") return;
      if (R.closeWait) R.closeWait();
      if (proceed) proceed();
    });
    spellGates[promptId] = 1;
    postReact({
      promptId: promptId,
      kind: "spell",
      text: ((info && info.casterName) || "Someone") + " is casting " + ((info && info.spellName) || "a spell"),
      casterName: (info && info.casterName) || "",
      casterId: (info && info.casterId) || state.uid || "",
      spellName: (info && info.spellName) || "",
      moverPlayerId: state.uid,
      moverName: (info && info.casterName) || ""
    });
    if (R && R.openWait) R.openWait("Waiting on reactions…");
    return true;
  };
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
    if (root.SSDNSJoinCode && root.SSDNSJoinCode.sync) root.SSDNSJoinCode.sync();
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
  function normalizeRoomCode(raw) {
    var s = String(raw || "").trim();
    var fromUrl = s.match(/[?#&]room=([A-Za-z]+-\d+)/i);
    if (fromUrl) return fromUrl[1].toUpperCase();
    var bare = s.match(/([A-Za-z]+-\d+)/);
    if (bare && /https?:|room=/i.test(s)) return bare[1].toUpperCase();
    return s.toUpperCase();
  }
  async function join(code) {
    state._kicked = false;
    if (state.readOnly) { toast("This tab is read-only. The character is open in another tab."); return; }
    code = normalizeRoomCode(code);
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
      state.dmUid = meta.dmUid || "";
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
      pullTurnMarkers();
      loadApplied();
      listenCommands();
      listenRoomFeeds();
      if (root.SSDNSGiveSheet && root.SSDNSGiveSheet.resume) { try { root.SSDNSGiveSheet.resume(); } catch (e) { console.warn("[DM Join] give resume", e); } }
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
          pubTimer = setTimeout(publishSnapshot, 0);
        });
      }
      // heartbeat
      state._heartbeat = setInterval(function () {
        if (!state.joined) return;
        publishSnapshot();
      }, 15000);
      forgetInvite();
      toast("Joined " + code);
      if (root.SSDNSMapHost && root.SSDNSMapHost.syncRoom) root.SSDNSMapHost.syncRoom();
    } catch (e) {
      console.warn(e);
      toast("Join failed: " + (e.message || e) + " — sheet still works offline");
      detachAll();
      state.joined = false;
      state.roomCode = null;
      saveLocal();
      setUiJoined(false);
      if (root.SSDNSMapHost && root.SSDNSMapHost.syncRoom) root.SSDNSMapHost.syncRoom();
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
    if (root.SSDNSMapHost && root.SSDNSMapHost.syncRoom) root.SSDNSMapHost.syncRoom();
  }

  function hookRollHelper() {
    // Optional: expose for sheet to call when they add shared rolls later
    root.SSDNSDmJoin = {
      /* 0.3.86 Player Give transport (give-sheet.js): create-only request rows + one ledger row per transfer */
      give: {
        me: function () { return state.joined && !state.left ? (state.uid || "") : ""; },
        roster: function () { return (state._roster || []).slice(); },
        es: function () { var d = doc(); return root.SSDNSBridge && d ? root.SSDNSBridge.cpValue(d.shards) : 0; },
        publish: function () { publishSnapshot(); },
        applyEs: function (delta, label, grant) { return applyEsReward(delta, label, grant, label); },
        write: function (key, row) {
          if (!state.joined || state.left || !state._fb || !state.db) return Promise.resolve({ ok: false });
          var fb = state._fb;
          var ref = fb.ref(state.db, roomPath("encounter/requests/" + key));
          return fb.set(ref, row).then(function () { return { ok: true }; }, function () {
            /* create-only: the row is already there (a double tap or a resend after a refresh) */
            return fb.get(ref).then(function (snap) { return { ok: false, exists: !!(snap && snap.exists && snap.exists()) }; }, function () { return { ok: false, exists: true }; });
          });
        },
        watch: function (path, cb) {
          if (!state._fb || !state.db) return;
          var fb = state._fb;
          var r = fb.ref(state.db, roomPath(path));
          var room = state.roomCode;
          var unsub = fb.onValue(r, function (snap) {
            if (!state.joined || state.roomCode !== room) return;
            try { cb(snap.val()); } catch (e) { console.warn("[DM Join] give", e); }
          }, function () {});
          state.unsubs.push(typeof unsub === "function" ? unsub : function () { try { fb.off(r, "value", unsub); } catch (e) {} });
        }
      },
      /* 0.3.86: tests feed a DM command straight in (no room needed) */
      _handle: function (cmd) { handleCommandAcked(cmd || {}); },
      isJoined: function () { return !!state.joined; },
      roomCode: function () { return state.roomCode; },
      uid: function () { return state.uid; },
      publishSnapshot: publishSnapshot,
      buildSnapshot: buildSnapshot,
      _handle: handleCommandAcked, /* test hook: run one DM command as if it arrived */
      postEndTurn: postEndTurn,
      postAddToken: postAddToken,
      postOaRequest: postOaRequest,
      postReact: postReact,
      postReactAnswer: postReactAnswer,
      presentReact: presentReact,
      pushTurnMarkers: pushTurnMarkers,
      pullTurnMarkers: pullTurnMarkers,
      postLedger: postLedger,
      postRoll: postRoll,
      fadeToast: fadeToast,
      postSfx: postSfx,
      postFeed: postFeed,
      postFx: postFx,
      postChat: postChat,
      postDamage: postDamage,
      postMercy: postMercy,
      postAttack: postAttack,
      live: function () {
        return {
          db: state.db,
          fb: state._fb,
          uid: state.uid,
          roomCode: state.roomCode,
          joined: !!state.joined && !state.left,
          dmUid: state.dmUid || ""
        };
      },
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

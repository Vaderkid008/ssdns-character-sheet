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
  var LS_KEY = "ssdns.v1.dmJoin";
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
    publishing: false
  };

  function $(s, r) { return (r || document).querySelector(s); }
  function toast(msg) {
    if (root.SSDNSApp && root.SSDNSApp.state) { /* sheet toast if available via DOM */ }
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
      root.localStorage.setItem(LS_KEY, JSON.stringify({
        roomCode: state.roomCode, joined: state.joined, uid: state.uid
      }));
    } catch (e) {}
  }
  function loadLocal() {
    try {
      var raw = root.localStorage.getItem(LS_KEY);
      return raw ? JSON.parse(raw) : null;
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
      return {
        name: name,
        loaded: g.loaded,
        capacity: st ? st.capacity : (g.capacity || 0),
        condition: g.jammed ? "jammed" : "ok",
        load: g.load,
        jammed: !!g.jammed,
        note: st && st.note ? st.note : ""
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
      spells: {
        cantrips: (c.cantrips || []).filter(Boolean),
        prepared: prepared
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
    var app = appMod.initializeApp(cfg, "ssdns-player-join");
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
    state._fb = { ref: dbMod.ref, set: dbMod.set, update: dbMod.update, push: dbMod.push, onValue: dbMod.onValue, off: dbMod.off, remove: dbMod.remove };
    return state._fb;
  }

  function roomPath(rest) {
    return "rooms/" + state.roomCode + (rest ? "/" + rest : "");
  }

  async function publishSnapshot() {
    if (!state.joined || !state.db || state.publishing) return;
    var snap = buildSnapshot();
    if (!snap) return;
    state.publishing = true;
    try {
      var fb = state._fb;
      var playerRef = fb.ref(state.db, roomPath("players/" + state.uid));
      await fb.set(playerRef, {
        id: state.uid,
        uid: state.uid,
        presence: { online: true, lastSeen: new Date().toISOString() },
        snapshot: snap
      });
      state.lastEs = snap.es;
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
      entry.who = entry.who || ((doc() && doc().character && doc().character.player) || "Player");
      entry.playerId = state.uid;
      await fb.set(fb.ref(state.db, roomPath("ledger/" + id)), entry);
    } catch (e) { console.warn("[DM Join] ledger", e); }
  }

  async function postRoll(entry) {
    if (!state.joined || !state.db) return;
    try {
      var fb = state._fb;
      var id = "r_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      entry.id = id;
      entry.ts = entry.ts || new Date().toISOString();
      entry.uid = state.uid;
      entry.playerId = state.uid;
      entry.who = entry.who || ((doc() && doc().character && doc().character.name) || "Player");
      await fb.set(fb.ref(state.db, roomPath("rolls/" + id)), entry);
    } catch (e) { console.warn("[DM Join] roll", e); }
  }

  function listenCommands() {
    var fb = state._fb;
    var r = fb.ref(state.db, roomPath("commands"));
    var cb = fb.onValue(r, function (snap) {
      var val = snap.val() || {};
      Object.keys(val).forEach(function (id) {
        if (state.lastCmdSeen[id]) return;
        var cmd = val[id];
        if (!cmd) return;
        // addressed to me or all
        if (cmd.to && cmd.to !== "all" && cmd.to !== state.uid) return;
        state.lastCmdSeen[id] = true;
        handleCommand(cmd);
      });
    });
    state.unsubs.push(function () { fb.off(r, "value", cb); });
  }

  function handleCommand(cmd) {
    var payload = cmd.payload || {};
    switch (cmd.type) {
      case "reward_es":
        applyEsReward(payload.delta || 0, payload.reason || "DM reward");
        break;
      case "reward_item":
        appendEquipment(payload.text || "");
        toast("DM sent item: " + (payload.text || ""));
        break;
      case "reward_note":
        toast("DM note: " + (payload.text || ""));
        showPopup("DM note", payload.text || "");
        break;
      case "message":
        showPopup("Private message from DM", payload.text || "");
        break;
      case "handout":
        showHandout(payload.name || "Handout", payload.url || "");
        break;
      case "open_saloon":
        var btn = $("#btnSaloon");
        if (btn) btn.click();
        toast("DM opened the Saloon");
        break;
      case "open_store":
        toast("DM nudged: Open Store (no store UI yet — noted)");
        showPopup("DM nudge", "Open the Store when ready.");
        break;
      case "open_tab":
        toast("DM nudge: open tab " + (payload.tab || ""));
        if (payload.tab) {
          var tab = $("#" + payload.tab) || $('[aria-controls="' + payload.tab + '"]');
          if (tab) tab.click();
        }
        break;
      default:
        console.info("[DM Join] unknown command", cmd.type);
    }
  }

  function applyEsReward(delta, reason) {
    var Bridge = root.SSDNSBridge;
    var d = doc();
    if (!Bridge || !d) return;
    var old = Bridge.cpValue(d.shards);
    var w = Bridge.applyDelta(delta, "dm-reward");
    if (!w) {
      // applyDelta needs wallet; ensure wallet then retry
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
    if (w) {
      d.shards = w.shards;
      // trigger sheet save path if exposed
      try {
        if (root.SSDNSApp && root.SSDNSApp.state) {
          // force a field re-render by dispatching a fake event is hard; poke wallet listener
          Bridge.writeWallet({
            characterId: d.id,
            characterName: (d.character && d.character.name) || "",
            shards: d.shards,
            updatedBy: "dm-reward"
          });
        }
      } catch (e) {}
      var neu = Bridge.cpValue(d.shards);
      postLedger({
        type: "dm_push",
        what: reason + " (" + (delta >= 0 ? "+" : "") + delta + " ES)",
        oldVal: old,
        newVal: neu,
        flag: Math.abs(delta) >= BIG_JUMP,
        who: "DM"
      });
      toast("DM " + (delta >= 0 ? "granted +" : "took ") + Math.abs(delta) + " ES");
      publishSnapshot();
    } else {
      toast("Could not apply DM ES change");
    }
  }

  function appendEquipment(text) {
    var d = doc();
    if (!d || !d.character || !text) return;
    d.character.equipment = (d.character.equipment || "") + (d.character.equipment ? "\n" : "") + "• " + text + " (from DM)";
    var ta = document.querySelector('[data-f="character.equipment"]');
    if (ta) { ta.value = d.character.equipment; }
    publishSnapshot();
    postLedger({
      type: "dm_push", what: "Item: " + text, oldVal: null, newVal: text, flag: false, who: "DM"
    });
  }

  function showPopup(title, body) {
    var existing = $("#dmJoinPopup");
    if (existing) existing.remove();
    var dlg = document.createElement("dialog");
    dlg.id = "dmJoinPopup";
    dlg.className = "dlg";
    dlg.innerHTML = "<form method='dialog'><h2></h2><p class='fine' style='white-space:pre-wrap'></p><div class='dlg-foot'><button class='btn' value='close'>OK</button></div></form>";
    dlg.querySelector("h2").textContent = title;
    dlg.querySelector("p").textContent = body;
    document.body.appendChild(dlg);
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", "");
  }

  function showHandout(name, url) {
    var existing = $("#dmJoinHandout");
    if (existing) existing.remove();
    var dlg = document.createElement("dialog");
    dlg.id = "dmJoinHandout";
    dlg.className = "dlg";
    dlg.innerHTML = "<form method='dialog'><h2></h2><p class='fine'></p><p style='text-align:center'><img alt='' style='max-width:100%;max-height:60vh;border:1px solid #2b1d12'></p><div class='dlg-foot'><a class='btn' target='_blank' rel='noopener'>Open</a> <button class='btn' value='close'>Close</button></div></form>";
    dlg.querySelector("h2").textContent = name || "Handout";
    dlg.querySelector("p.fine").textContent = url;
    var img = dlg.querySelector("img");
    img.src = url;
    dlg.querySelector("a").href = url;
    document.body.appendChild(dlg);
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", "");
  }

  function watchEs() {
    // Poll ES while joined (catches Saloon wallet + manual shard edits)
    var last = state.lastEs;
    setInterval(function () {
      if (!state.joined) return;
      var d = doc();
      var Bridge = root.SSDNSBridge;
      if (!d || !Bridge) return;
      var es = Bridge.cpValue(d.shards);
      if (last == null) { last = es; state.lastEs = es; return; }
      if (es !== last) {
        var delta = es - last;
        var by = "manual";
        try {
          var w = Bridge.readWallet();
          if (w && w.updatedBy && w.updatedBy !== "sheet" && w.updatedBy !== "dm-reward") by = "saloon:" + w.updatedBy;
        } catch (e) {}
        postLedger({
          type: delta >= 0 ? "es_gain" : "es_spend",
          what: (by.indexOf("saloon") === 0 ? "Saloon · " + by.slice(7) : "ES change") + " (" + (delta >= 0 ? "+" : "") + delta + ")",
          oldVal: last,
          newVal: es,
          flag: Math.abs(delta) >= BIG_JUMP,
          who: (d.character && d.character.player) || (d.character && d.character.name) || "Player"
        });
        last = es;
        state.lastEs = es;
        publishSnapshot();
      }
    }, 2000);
  }

  function setUiJoined(on, code) {
    var status = $("#dmJoinStatus");
    var btnJoin = $("#btnDmJoin");
    var btnLeave = $("#btnDmLeave");
    var input = $("#dmJoinCode");
    if (status) status.textContent = on ? ("Joined " + code) : "Not in a room";
    if (btnJoin) btnJoin.hidden = !!on;
    if (btnLeave) btnLeave.hidden = !on;
    if (input) { input.disabled = !!on; if (code) input.value = code; }
    var bar = $("#dmJoinBar");
    if (bar) bar.classList.toggle("joined", !!on);
  }

  async function join(code) {
    code = String(code || "").trim().toUpperCase();
    if (!code) { toast("Enter a room code"); return; }
    try {
      toast("Connecting…");
      await loadFirebase();
      var fb = state._fb;
      var metaSnap = await new Promise(function (resolve, reject) {
        // dynamic import get
        import("https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js").then(function (dbMod) {
          dbMod.get(fb.ref(state.db, "rooms/" + code + "/meta")).then(resolve).catch(reject);
        }).catch(reject);
      });
      if (!metaSnap.exists()) {
        toast("No room with code " + code + " (is the DM live? Demo rooms aren't on Firebase.)");
        return;
      }
      var meta = metaSnap.val();
      if (meta.status === "ended") {
        toast("That session has ended");
        return;
      }
      state.roomCode = code;
      state.joined = true;
      saveLocal();
      setUiJoined(true, code);
      await publishSnapshot();
      listenCommands();
      watchEs();
      // heartbeat
      state._heartbeat = setInterval(function () {
        if (!state.joined) return;
        publishSnapshot();
      }, 15000);
      toast("Joined " + code);
    } catch (e) {
      console.warn(e);
      toast("Join failed: " + (e.message || e) + " — sheet still works offline");
      state.joined = false;
      setUiJoined(false);
    }
  }

  async function leave() {
    clearUnsubs();
    if (state._heartbeat) clearInterval(state._heartbeat);
    if (state.joined && state.db && state.uid) {
      try {
        var fb = state._fb;
        await fb.update(fb.ref(state.db, roomPath("players/" + state.uid + "/presence")), {
          online: false, lastSeen: new Date().toISOString()
        });
      } catch (e) {}
    }
    state.joined = false;
    state.roomCode = null;
    saveLocal();
    setUiJoined(false);
    toast("Left the room · sheet is fully offline again");
  }

  function hookRollHelper() {
    // Optional: expose for sheet to call when they add shared rolls later
    root.SSDNSDmJoin = {
      isJoined: function () { return !!state.joined; },
      roomCode: function () { return state.roomCode; },
      publishSnapshot: publishSnapshot,
      postLedger: postLedger,
      postRoll: postRoll,
      join: join,
      leave: leave
    };
  }

  function wireUi() {
    var btnJoin = $("#btnDmJoin");
    var btnLeave = $("#btnDmLeave");
    if (btnJoin) btnJoin.addEventListener("click", function () {
      join(($("#dmJoinCode") && $("#dmJoinCode").value) || "");
    });
    if (btnLeave) btnLeave.addEventListener("click", leave);
    var input = $("#dmJoinCode");
    if (input) input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); join(input.value); }
    });
  }

  function bootWhenReady() {
    hookRollHelper();
    wireUi();
    setUiJoined(false);
    // Wait for SSDNSApp
    var tries = 0;
    var t = setInterval(function () {
      tries++;
      if (root.SSDNSApp || tries > 50) {
        clearInterval(t);
        var saved = loadLocal();
        // Do NOT auto-rejoin if Firebase may be down — user taps Join again.
        if (saved && saved.roomCode && $("#dmJoinCode")) {
          $("#dmJoinCode").value = saved.roomCode;
          var status = $("#dmJoinStatus");
          if (status) status.textContent = "Last room " + saved.roomCode + " · tap Join to reconnect";
        }
      }
    }, 100);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootWhenReady);
  } else {
    bootWhenReady();
  }
})(window);

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
    publishing: false,
    _chatSeen: {},
    _ledSeen: {}
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
      deathSaves: c.deathSaves || { success: [false, false, false], fail: [false, false, false] },
      spellAtk: v.spellAtk || "",
      spellDC: v.spellDC || "",
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
    state._fb = { ref: dbMod.ref, set: dbMod.set, update: dbMod.update, push: dbMod.push, onValue: dbMod.onValue, off: dbMod.off, remove: dbMod.remove, runTransaction: dbMod.runTransaction };
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
  async function publishSnapshot() {
    if (!state.joined || !state.db || state.publishing) return;
    var snap = buildSnapshot();
    if (!snap) return;
    state.publishing = true;
    try {
      var c = doc() && doc().character;
      snap.portrait = await shrinkPortrait(c && c.portrait);
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
      var c = doc() && doc().character;
      entry.who = entry.who || ((c && c.player) || "Player");
      entry.playerName = entry.playerName || ((c && c.player) || "");
      entry.characterName = entry.characterName || ((c && c.name) || "");
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

  function seenStorageKey() {
    return "ssdns.v1.dmJoin.seen." + state.roomCode + "." + state.uid;
  }
  function loadSeen() {
    state.lastCmdSeen = {};
    try {
      var raw = localStorage.getItem(seenStorageKey());
      if (!raw) return false;
      state.lastCmdSeen = JSON.parse(raw) || {};
      return true;
    } catch (e) { return false; }
  }
  function saveSeen() {
    var keys = Object.keys(state.lastCmdSeen);
    if (keys.length > 500) keys.slice(0, keys.length - 300).forEach(function (k) { delete state.lastCmdSeen[k]; });
    try { localStorage.setItem(seenStorageKey(), JSON.stringify(state.lastCmdSeen)); } catch (e) {}
  }
  function listenCommands() {
    var fb = state._fb;
    var r = fb.ref(state.db, roomPath("commands"));
    var hadSeen = loadSeen();
    var first = true;
    var cb = fb.onValue(r, function (snap) {
      var val = snap.val() || {};
      // First Join after this fix: ES rewards already in the room were applied
      // to the wallet and adopted on refresh. Mark them seen so they don't add again.
      var skipExistingEs = first && !hadSeen;
      first = false;
      Object.keys(val).forEach(function (id) {
        if (state.lastCmdSeen[id]) return;
        var cmd = val[id];
        if (!cmd) return;
        if (cmd.to && cmd.to !== "all" && cmd.to !== state.uid) return;
        if (skipExistingEs && /^(reward_es|reward_item|hp|rest|set_conditions|gun_event|death_save|undo_item|hex_spend)$/.test(cmd.type || "")) {
          state.lastCmdSeen[id] = 1;
          return;
        }
        state.lastCmdSeen[id] = 1;
        saveSeen();
        try { handleCommand(cmd); } catch (err) { console.warn("[DM Join] command", err); }
      });
      if (skipExistingEs) saveSeen();
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
    if (root.SSDNSSheet) root.SSDNSSheet.addLog({ kind: "item", text: "Item: " + (payload.text || "") });
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
        showHandout(payload.name || "Handout", payload.url || "");
        break;
      case "open_saloon":
        var btn = $("#btnSaloon");
        if (btn) btn.click();
        toast("DM opened the Saloon");
        break;
      case "open_store":
        if (root.SSDNSSheet) root.SSDNSSheet.openStore(payload.stock);
        else toast("DM opened the store");
        break;
      case "hp":
        applyHpCommand(payload);
        break;
      case "set_conditions":
        if (root.SSDNSSheet) root.SSDNSSheet.setConditions(payload.list || []);
        break;
      case "rest":
        if (root.SSDNSSheet) root.SSDNSSheet.applyRest(payload.kind || "short");
        break;
      case "gun_event":
        if (root.SSDNSSheet) root.SSDNSSheet.applyGunEvent(payload);
        break;
      case "hex_spend":
        if (root.SSDNSApp && root.SSDNSApp.spendHexSlot) {
          if (!root.SSDNSApp.spendHexSlot(payload.level)) toast("No level-" + (payload.level || "?") + " shell left");
          else if (root.SSDNSSheet) root.SSDNSSheet.showNotice("Spent a level-" + payload.level + " shell");
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

  function syncShardFields(shards) {
    ["white", "blue", "green", "yellow", "purple"].forEach(function (c) {
      var nodes = document.querySelectorAll('[data-f="shards.' + c + '"]');
      var n = (shards && shards[c]) || 0;
      for (var i = 0; i < nodes.length; i++) nodes[i].value = String(n);
      // Same path as typing the shard count: paints both piles, the ES total, and saves.
      if (nodes[0]) nodes[0].dispatchEvent(new Event("change", { bubbles: true }));
    });
  }
  function applyEsReward(delta, reason) {
    var Bridge = root.SSDNSBridge;
    var d = doc();
    if (!Bridge || !d || !delta) return;
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
        toast("Could not apply DM ES change");
        return;
      }
      d.shards = w.shards;
      syncShardFields(w.shards);
      var neu = Bridge.cpValue(d.shards);
      state.lastEs = neu;
      postLedger({
        type: "dm_push",
        what: reason + " (" + (delta >= 0 ? "+" : "") + delta + " ES)",
        oldVal: old,
        newVal: neu,
        flag: Math.abs(delta) >= BIG_JUMP,
        who: "DM"
      });
      toast("DM " + (delta >= 0 ? "granted +" : "took ") + Math.abs(delta) + " ES");
      if (root.SSDNSAudio) root.SSDNSAudio.play("reward");
      if (root.SSDNSSheet) root.SSDNSSheet.addLog({ kind: "es", text: "DM " + (delta >= 0 ? "+" : "") + delta + " ES" });
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

  function applyHpCommand(payload) {
    var delta = Number(payload.delta);
    if (!delta) delta = (payload.kind === "heal" ? 1 : -1) * (Number(payload.amount) || 0);
    if (!delta || !root.SSDNSSheet) return;
    var kind = payload.kind || (delta < 0 ? "damage" : "heal");
    var text = "DM " + kind + " " + Math.abs(delta) + (payload.formula ? " (" + payload.formula + ")" : "");
    root.SSDNSSheet.applyDelta(delta, text);
    root.SSDNSSheet.addLog({ kind: "hp", text: text });
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
  function postChat(entry) {
    if (!state.joined || !state.db) return;
    var fb = state._fb;
    var id = "chat_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    var c = doc() && doc().character;
    var row = {
      id: id,
      ts: new Date().toISOString(),
      from: state.uid,
      fromName: (entry && entry.fromName) || (c && (c.player || c.name)) || "Player",
      text: (entry && entry.text) || ""
    };
    fb.set(fb.ref(state.db, roomPath("chat/" + id)), row).catch(function (e) { console.warn("[DM Join] chat", e); });
  }
  function listenRoomFeeds() {
    var fb = state._fb;
    function bind(path, handler) {
      var r = fb.ref(state.db, roomPath(path));
      var cb = fb.onValue(r, function (snap) { handler(snap.val() || {}); }, function () {});
      state.unsubs.push(function () { fb.off(r, "value", cb); });
    }
    var inspPrimed = false;
    var inspSeen = "";
    bind("table", function (val) {
      var stock = val.store || [];
      if (root.SSDNSSheet) root.SSDNSSheet.setStock(Array.isArray(stock) ? stock : Object.keys(stock).map(function (k) { return stock[k]; }));
      var insp = val.inspiration;
      var count = 0, last = null;
      if (insp && typeof insp === "object") { count = Number(insp.count) || 0; last = insp.last || null; }
      else if (typeof insp === "number") count = insp;
      if (root.SSDNSSheet && root.SSDNSSheet.showInspiration) root.SSDNSSheet.showInspiration(count, true);
      if (last && last.id && last.id !== inspSeen) {
        inspSeen = last.id;
        if (inspPrimed) {
          var line = last.text || "Inspiration changed";
          toast(line);
          if (root.SSDNSSheet) root.SSDNSSheet.addLog({ kind: "alert", text: line, ts: last.ts });
        }
      }
      inspPrimed = true;
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
        if (root.SSDNSSheet) root.SSDNSSheet.addLog({ kind: "chat", text: who + ": " + (row.text || ""), ts: row.ts });
      });
      chatPrimed = true;
    });
  }
  function watchEs() {
    // Poll ES while joined (catches Saloon wallet + manual shard edits)
    setInterval(function () {
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
    if (!on && root.SSDNSSheet && root.SSDNSSheet.showInspiration) root.SSDNSSheet.showInspiration(0, false);
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
      listenRoomFeeds();
      watchEs();
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
      postChat: postChat,
      spendInspiration: spendInspiration,
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

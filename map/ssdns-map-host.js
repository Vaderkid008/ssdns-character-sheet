/* Mounts SSDNSMap on the sheet and the DMCC. Rolls, chat, and Next turn
   stay in the existing sheet and DMCC code. The map is another view. */
(function (root) {
  "use strict";
  var map = null;
  var mountedKey = "";
  var players = [];
  var generation = 0;

  function $(id) { return document.getElementById(id); }
  function mountEl() { return $("mapMount"); }
  function idleEl() { return $("mapIdle"); }
  function isDmPage() {
    var el = mountEl();
    return !!(el && el.getAttribute("data-map-role") === "dm");
  }
  function setIdle(text) {
    var idle = idleEl();
    var el = mountEl();
    if (idle) {
      idle.hidden = !text;
      idle.textContent = text || "";
    }
    if (el && text) el.hidden = true;
  }
  function destroyMap() {
    generation += 1;
    mountedKey = "";
    if (map && map.destroy) {
      try { map.destroy(); } catch (e) {}
    }
    map = null;
    if (root.document && root.document.body) root.document.body.classList.remove("map-fullscreen");
    var btn = $("btnMapFull");
    if (btn) btn.textContent = "Full screen";
  }
  function currentPlayers() {
    if (isDmPage() && root.DMCC && root.DMCC.state && root.DMCC.state.players) {
      return Object.keys(root.DMCC.state.players).map(function (id) {
        var snap = (root.DMCC.state.players[id] && root.DMCC.state.players[id].snapshot) || {};
        return { uid: id, id: id, name: snap.name || snap.player || id };
      });
    }
    return players.slice();
  }
  function displayName(id) {
    var list = currentPlayers();
    var i;
    for (i = 0; i < list.length; i++) {
      if (list[i].uid === id || list[i].id === id) return list[i].name || id;
    }
    if (!isDmPage() && root.SSDNSDmJoin && root.SSDNSDmJoin.uid && id === root.SSDNSDmJoin.uid()) {
      var name = $("charName");
      if (name && name.value) return name.value;
    }
    if (id === "dm" || id === "demo_dm") return "DM";
    return id || "";
  }
  function cssEscape(v) {
    if (root.CSS && CSS.escape) return CSS.escape(v);
    return String(v).replace(/"/g, '\\"');
  }
  function gunName(i) {
    var sel = document.querySelector('[data-f="character.guns.' + i + '.weapon"]');
    var opt = sel && sel.selectedOptions && sel.selectedOptions[0];
    var text = opt && opt.value ? String(opt.textContent || "").trim() : "";
    return text || ("Gun " + (Number(i) + 1));
  }
  function meleeName(i) {
    var sel = document.querySelector('[data-melee="' + i + '"]');
    var opt = sel && sel.selectedOptions && sel.selectedOptions[0];
    var text = opt && opt.value ? String(opt.textContent || "").trim() : "";
    return text || ("Melee " + (Number(i) + 1));
  }
  function sheetActions() {
    if (isDmPage()) return [];
    var list = [];
    document.querySelectorAll("[data-gunroll]").forEach(function (btn) {
      if (btn.hasAttribute("data-k") || btn.hidden) return;
      var i = btn.getAttribute("data-gunroll");
      list.push({ id: "gunroll:" + i, label: gunName(i) + " · Attack", group: "attack", enabled: !btn.disabled, title: btn.title || "" });
    });
    document.querySelectorAll("[data-melee-roll]").forEach(function (btn) {
      if (btn.hidden) return;
      var i = btn.getAttribute("data-melee-roll");
      list.push({ id: "melee:" + i, label: meleeName(i) + " · Attack", group: "attack", enabled: !btn.disabled, title: btn.title || "" });
    });
    document.querySelectorAll("[data-cast]").forEach(function (btn) {
      if (btn.hidden) return;
      var i = btn.getAttribute("data-cast");
      list.push({ id: "cast:" + i, label: gunName(i) + " · Cast", group: "spell", enabled: !btn.disabled, title: btn.title || "" });
    });
    document.querySelectorAll("[data-spell-cast]").forEach(function (btn) {
      if (btn.hidden) return;
      var raw = btn.getAttribute("data-spell-cast") || "";
      var name = raw.slice(raw.indexOf(":") + 1) || "Spell";
      list.push({ id: "spell:" + raw, label: "Cast " + name, group: "spell", enabled: !btn.disabled, title: btn.title || "" });
    });
    var pact = $("btnPactShot");
    if (pact && !pact.hidden) list.push({ id: "pact", label: "Pact Shot", group: "spell", enabled: !pact.disabled, title: pact.title || "" });
    document.querySelectorAll("[data-reload]").forEach(function (btn) {
      if (btn.hidden) return;
      var i = btn.getAttribute("data-reload");
      list.push({ id: "reload:" + i, label: gunName(i) + " · Reload", group: "gear", enabled: !btn.disabled, title: btn.title || "" });
    });
    document.querySelectorAll("[data-tr]").forEach(function (btn) {
      if (btn.hidden) return;
      var i = btn.getAttribute("data-tr");
      list.push({ id: "tr:" + i, label: gunName(i) + " · TR +1", group: "gear", enabled: !btn.disabled, title: btn.title || "" });
    });
    return list;
  }
  function runAction(id) {
    var btn = null;
    if (id.indexOf("gunroll:") === 0) btn = document.querySelector('[data-gunroll="' + cssEscape(id.slice(8)) + '"]:not([data-k])');
    else if (id.indexOf("melee:") === 0) btn = document.querySelector('[data-melee-roll="' + cssEscape(id.slice(6)) + '"]');
    else if (id.indexOf("cast:") === 0) btn = document.querySelector('[data-cast="' + cssEscape(id.slice(5)) + '"]');
    else if (id.indexOf("spell:") === 0) btn = document.querySelector('[data-spell-cast="' + cssEscape(id.slice(6)) + '"]');
    else if (id === "pact") btn = $("btnPactShot");
    else if (id.indexOf("reload:") === 0) btn = document.querySelector('[data-reload="' + cssEscape(id.slice(7)) + '"]');
    else if (id.indexOf("tr:") === 0) btn = document.querySelector('[data-tr="' + cssEscape(id.slice(3)) + '"]');
    if (btn && !btn.hidden) btn.click();
  }
  function sendChat(text) {
    var input, form;
    if (isDmPage()) {
      input = $("dockText");
      form = $("dockChat");
      var to = $("dockTo");
      if (to) to.value = "all";
    } else {
      input = $("logChatText");
      form = $("logChat");
    }
    if (!input || !form) return;
    input.value = text;
    if (form.requestSubmit) form.requestSubmit();
    else form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  }
  function onHost(name, detail) {
    detail = detail || {};
    if (name === "chat:send") sendChat(detail.text || "");
    if (!isDmPage()) return;
    if (name === "initiative:next") {
      var next = $("btnNextTurn");
      if (next) next.click();
    }
    if (name === "initiative:prev") {
      var prev = $("btnPrevTurn");
      if (prev) prev.click();
    }
    if (name === "drawer:link") {
      var linker = root.SSDNSMapFight;
      if (!linker || typeof linker.link !== "function") return;
      var apply = function (patch) {
        if (patch && map && map.applyLink) map.applyLink(detail.tokenId, patch);
        if (map && map.refreshCard) map.refreshCard(detail.tokenId || "");
      };
      try {
        Promise.resolve(linker.link(detail)).then(apply, function () { apply(); });
      } catch (e) {
        apply();
      }
      return;
    }
    if (name === "combatant:remove") {
      var drop = root.SSDNSMapFight;
      if (drop && typeof drop.onTokenRemoved === "function") {
        try { Promise.resolve(drop.onTokenRemoved(detail)); } catch (e) {}
      }
      return;
    }
    var fightCall = {
      "drawer:target": "attack",
      "drawer:hp": "hp",
      "drawer:condition": "condition",
      "drawer:reload": "reload",
      "drawer:unload": "unload",
      "drawer:deathsave": "deathsave",
      "drawer:undo": "undo"
    }[name];
    if (!fightCall) return;
    var api = root.SSDNSMapFight;
    var fn = api && api[fightCall];
    if (typeof fn !== "function") return;
    var refresh = function () {
      if (map && map.refreshCard) map.refreshCard(detail.tokenId || "");
    };
    try {
      Promise.resolve(fn(detail)).then(refresh, refresh);
    } catch (e) {
      refresh();
    }
  }
  function roomContext() {
    if (isDmPage()) {
      var DM = root.DMCC;
      var st = DM && DM.state;
      if (!st || !st.roomCode || !document.body.classList.contains("in-room")) return null;
      var dmUid = st.meta && st.meta.dmUid;
      return {
        role: "dm",
        uid: st.uid || dmUid || "dm",
        roomCode: st.roomCode,
        demo: !!st.demo || !st.db || !st._fb,
        db: st.db,
        fb: st._fb,
        dmUid: dmUid || st.uid || ""
      };
    }
    var Join = root.SSDNSDmJoin;
    if (!Join || !Join.isJoined || !Join.isJoined() || !Join.live) return null;
    var live = Join.live();
    if (!live || !live.joined || !live.roomCode || !live.db || !live.fb || !live.uid) return null;
    return {
      role: "player",
      uid: live.uid,
      roomCode: live.roomCode,
      demo: false,
      db: live.db,
      fb: live.fb,
      dmUid: live.dmUid || ""
    };
  }
  function loadJson(url) {
    return fetch(url, { cache: "no-store" }).then(function (r) {
      if (!r.ok) throw new Error("Couldn't load " + url);
      return r.json();
    });
  }
  function mountNow(ctx) {
    var el = mountEl();
    if (!el || !root.SSDNSMap || !root.SSDNSMapFirebase) return Promise.resolve();
    var key = ctx.roomCode + ":" + ctx.role + ":" + ctx.uid + ":" + (ctx.demo ? "demo" : "live");
    if (map && mountedKey === key) {
      if (map.refreshPlayers) map.refreshPlayers();
      return Promise.resolve();
    }
    destroyMap();
    var gen = generation;
    var base = el.getAttribute("data-asset-base") || "map/";
    var sceneUrl = el.getAttribute("data-scene") || (base + "scene-dusty-spur.json");
    var tokensUrl = el.getAttribute("data-tokens") || "";
    setIdle("Opening the map…");
    var sceneP = loadJson(sceneUrl);
    var tokensP = ctx.role === "dm" && ctx.demo && tokensUrl ? loadJson(tokensUrl) : Promise.resolve(null);
    return Promise.all([sceneP, tokensP]).then(function (pair) {
      if (gen !== generation) return;
      var again = roomContext();
      if (!again || again.roomCode !== ctx.roomCode || again.uid !== ctx.uid) return;
      var adapter = ctx.demo
        ? root.SSDNSMapFirebase.memory({ role: ctx.role })
        : root.SSDNSMapFirebase.create({ db: ctx.db, fb: ctx.fb, roomCode: ctx.roomCode, uid: ctx.uid, role: ctx.role });
      var initiative = null;
      if (isDmPage() && root.DMCC && root.DMCC.state && root.DMCC.state.table) initiative = root.DMCC.state.table.initiative || null;
      el.hidden = false;
      setIdle("");
      map = root.SSDNSMap.create({
        el: el,
        role: ctx.role,
        uid: ctx.uid,
        adapter: adapter,
        host: {
          displayName: displayName,
          players: currentPlayers,
          actions: {
            get: function () { return sheetActions(); },
            run: function (id) { runAction(id); }
          },
          on: onHost,
          getCard: function (tokenId) {
            var api = root.SSDNSMapCards;
            if (!isDmPage() || !api || typeof api.get !== "function") return null;
            try { return api.get(tokenId) || null; } catch (e) { return null; }
          },
          linkChoices: function () {
            var api = root.SSDNSMapCards;
            if (!isDmPage() || !api || typeof api.choices !== "function") return null;
            try { return api.choices(); } catch (e) { return null; }
          }
        },
        options: {
          scene: pair[0],
          tokens: pair[1],
          assetBase: base,
          players: currentPlayers,
          ensureScene: !!ctx.demo,
          room: { table: { initiative: initiative || { order: [], turn: 0 } } },
          onReady: function () {
            syncInitiative();
            if (root.SSDNSMapFight && typeof root.SSDNSMapFight.syncMap === "function") root.SSDNSMapFight.syncMap();
          }
        }
      });
      mountedKey = key;
      if (map.refreshPlayers) map.refreshPlayers();
      syncInitiative();
      if (!ctx.demo && ctx.fb && ctx.fb.get && ctx.db) {
        var scenesRef = ctx.fb.ref(ctx.db, "rooms/" + ctx.roomCode + "/map/public/scenes");
        ctx.fb.get(scenesRef).then(function (snap) {
          var exists = snap && snap.exists ? snap.exists() : !!(snap && snap.val && snap.val());
          if (exists) return;
          if (map && map.ensureDefaultScene) map.ensureDefaultScene();
        }).catch(function () {});
      }
    }).catch(function (err) {
      if (gen !== generation) return;
      setIdle("The map didn't open. " + ((err && err.message) || err));
    });
  }
  function syncRoom() {
    var el = mountEl();
    if (!el) return;
    var ctx = roomContext();
    if (!ctx) {
      destroyMap();
      setIdle(isDmPage() ? "Open a room to use the map." : "Join a table to open the map.");
      return;
    }
    if (ctx.role === "dm" && ctx.dmUid && ctx.uid && ctx.dmUid !== ctx.uid && !ctx.demo) {
      destroyMap();
      setIdle("Only the DM who opened this room can run the map.");
      return;
    }
    mountNow(ctx);
  }
  function fightInitiative() {
    var api = root.SSDNSMapCards;
    if (api && typeof api.initiative === "function") {
      try { return api.initiative() || null; } catch (e) { return null; }
    }
    var table = root.DMCC && root.DMCC.state && root.DMCC.state.table;
    return (table && table.initiative) || null;
  }
  function syncInitiative() {
    if (!isDmPage() || !map || !map.syncCombatants) return;
    var init = fightInitiative();
    if (!init) return;
    map.syncCombatants(init);
  }
  function setPlayers(list) {
    players = (list || []).map(function (p) {
      return { uid: p.uid || p.id, id: p.id || p.uid, name: p.name || p.label || p.uid || p.id };
    }).filter(function (p) { return p.uid; });
    if (map && map.refreshPlayers) map.refreshPlayers();
  }
  function wire() {
    var full = $("btnMapFull");
    if (full && !full.dataset.mapWired) {
      full.dataset.mapWired = "1";
      full.addEventListener("click", function () {
        document.body.classList.toggle("map-fullscreen");
        var on = document.body.classList.contains("map-fullscreen");
        full.textContent = on ? "Exit full screen" : "Full screen";
        if (map && map.requestDraw) map.requestDraw();
      });
    }
    document.querySelectorAll(".tab").forEach(function (tab) {
      tab.addEventListener("click", function () {
        if (tab.id === "tab-map" && map && map.requestDraw) setTimeout(function () { map.requestDraw(); }, 30);
      });
    });
    syncRoom();
  }
  function placeToken(spec) {
    if (!isDmPage() || !map || typeof map.placeLinkedToken !== "function") return "";
    var token = map.placeLinkedToken(spec || {});
    return token && token.id ? token.id : "";
  }
  function removeToken(id) {
    if (!isDmPage() || !map || typeof map.removeToken !== "function") return;
    map.removeToken(id);
  }
  function tokenForPlayer(pid) {
    if (!isDmPage() || !map || typeof map.tokenForPlayer !== "function") return "";
    var token = map.tokenForPlayer(pid);
    return token && token.id ? token.id : "";
  }
  function hasToken(id) {
    return !!(isDmPage() && map && typeof map.hasToken === "function" && map.hasToken(id));
  }
  function releaseToken(id) {
    if (!isDmPage() || !map || typeof map.releaseToken !== "function") return;
    map.releaseToken(id);
  }
  root.SSDNSMapHost = {
    syncRoom: syncRoom,
    setPlayers: setPlayers,
    syncInitiative: syncInitiative,
    destroy: destroyMap,
    placeToken: placeToken,
    removeToken: removeToken,
    tokenForPlayer: tokenForPlayer,
    hasToken: hasToken,
    releaseToken: releaseToken
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire);
  else wire();
})(typeof window !== "undefined" ? window : globalThis);

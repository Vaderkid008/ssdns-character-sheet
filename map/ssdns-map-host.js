/* Mounts SSDNSMap on the sheet and the DMCC. Rolls, chat, and Next turn
   stay in the existing sheet and DMCC code. The map is another view. */
(function (root) {
  "use strict";
  var map = null;
  var mountedKey = "";
  var mountedUid = "";
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
        return { uid: id, id: id, name: snap.name || snap.player || id, portrait: snap.portrait || "" };
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
  function gunCylinder(i) {
    var app = root.SSDNSApp;
    var doc = app && app.doc && app.doc();
    var g = doc && doc.character && doc.character.guns && doc.character.guns[i];
    if (!g || !(g.weapon || g.name)) return null;
    var cap = Number(g.capacity) || (Array.isArray(g.chambers) ? g.chambers.length : 0);
    if (!cap) return null;
    var chambers = Array.isArray(g.chambers) && g.chambers.length
      ? (root.SSDNSApplied && root.SSDNSApplied.chamberTokens ? root.SSDNSApplied.chamberTokens(g.chambers) : g.chambers.slice())
      : null;
    var loaded = chambers ? chambers.filter(Boolean).length : (Number(g.loaded) || 0);
    return { index: Number(i), loaded: loaded, cap: cap, chambers: chambers, locked: Array.isArray(g.lockedChambers) ? g.lockedChambers.slice() : [] };
  }
  function gunRows(list) {
    var Equip = root.SSDNSEquip;
    var computed = null;
    try { computed = root.SSDNSApp && root.SSDNSApp.compute && root.SSDNSApp.compute(); } catch (e) { computed = null; }
    var rows = (list || []).map(function (g, i) {
      if (!g) return null;
      var cap = Number(g.cap != null ? g.cap : g.capacity) || (Array.isArray(g.chambers) ? g.chambers.length : 0);
      var loaded = Array.isArray(g.chambers) && g.chambers.length ? g.chambers.filter(Boolean).length : (Number(g.loaded) || 0);
      var group = g.group || "";
      if (!group && g.weapon && computed) {
        var st = (computed.guns || []).filter(function (x) { return x && x.w && x.w.id === g.weapon; })[0];
        group = st && st.w && st.w.group || "";
      }
      return {
        index: g.index != null ? g.index : i,
        name: g.name || "",
        group: group,
        loaded: loaded,
        cap: cap,
        equipped: g.equipped
      };
    }).filter(Boolean);
    if (Equip && Equip.badgeRowsForToken) return Equip.badgeRowsForToken(rows);
    return rows.filter(function (g) { return g.equipped !== false && g.cap; });
  }
  function ownRounds() {
    var app = root.SSDNSApp;
    var doc = app && app.doc && app.doc();
    var guns = doc && doc.character && doc.character.guns || [];
    return gunRows(guns);
  }
  function viewerUid() {
    if (mountedUid) return mountedUid;
    if (!isDmPage()) {
      var Join = root.SSDNSDmJoin;
      if (Join && typeof Join.uid === "function") return Join.uid() || "";
    }
    var st = root.DMCC && root.DMCC.state;
    return (st && st.uid) || "";
  }
  function roundsLabel(token) {
    if (!token) return [];
    if (!isDmPage()) {
      if (!token.ownerUid || token.ownerUid !== viewerUid()) return [];
      return ownRounds();
    }
    var api = root.SSDNSMapCards;
    if (!api || typeof api.get !== "function") return [];
    var card = null;
    try {
      card = api.get(token.id) || (token.combatantId && api.get(token.combatantId)) || (token.ownerUid && api.get(token.ownerUid)) || null;
    } catch (e) { card = null; }
    if (!card) return [];
    var guns = (card.attacks || []).filter(function (a) { return a && a.ammo && a.ammo.cap; }).map(function (a) {
      return {
        name: a.name || "",
        group: a.group || "",
        loaded: Number(a.ammo.loaded) || 0,
        cap: Number(a.ammo.cap) || 0,
        equipped: a.equipped,
        index: a.sheetIndex != null ? a.sheetIndex : a.gunIndex
      };
    });
    if (root.SSDNSEquip && root.SSDNSEquip.badgeRowsForToken) return root.SSDNSEquip.badgeRowsForToken(guns);
    return guns.filter(function (g) { return g.equipped !== false; });
  }
  function rangeWeapons() {
    if (isDmPage()) return [];
    var app = root.SSDNSApp;
    var doc = app && app.doc && app.doc();
    var computed = app && app.compute && app.compute();
    if (!doc || !doc.character) return [];
    var c = doc.character;
    var feats = c.feats || [];
    var longRangeHex = feats.indexOf("long-range-hex") >= 0;
    var sharpshooter = feats.indexOf("sharpshooter") >= 0;
    var list = [];
    (c.guns || []).forEach(function (g, i) {
      if (!g || !g.weapon || g.equipped === false) return;
      var st = ((computed && computed.guns) || []).filter(function (x) { return x && x.w && x.w.id === g.weapon; })[0];
      var w = st && st.w;
      list.push({
        id: "gun:" + i,
        name: (w && w.name) || gunName(i),
        weapon: g.weapon,
        range: (st && st.range) || "",
        properties: (w && w.properties) || "",
        group: (w && w.group) || "",
        kind: "weapon",
        mod: g.mod || "",
        tier: (st && st.tier) || "",
        unwieldy: !!(st && st.unwieldy),
        scatter: !!(w && w.scatter),
        load: g.load || "",
        scope: /scope/i.test(g.mod || ""),
        longRangeHex: longRangeHex,
        sharpshooter: sharpshooter
      });
    });
    (c.melee || []).forEach(function (m, i) {
      if (!m || !m.weapon || m.equipped === false) return;
      list.push({
        id: "melee:" + i,
        name: meleeName(i),
        weapon: m.weapon,
        kind: "melee",
        sharpshooter: sharpshooter
      });
    });
    function addSpell(name) {
      if (!name || !root.SSDNSSpellCast || typeof root.SSDNSSpellCast.lookup !== "function") return;
      var known = root.SSDNSSpellCast.lookup(name);
      if (!known || known.kind !== "attack") return;
      var id = "spell:" + name;
      if (list.some(function (row) { return row.id === id; })) return;
      var range = typeof root.SSDNSSpellCast.rangeOf === "function" ? root.SSDNSSpellCast.rangeOf(name) : "";
      if (!range) return;
      list.push({
        id: id,
        name: name,
        kind: "spell",
        spell: true,
        spellKind: "attack",
        range: range,
        longRangeHex: longRangeHex
      });
    }
    (c.cantrips || []).forEach(addSpell);
    Object.keys(c.spells || {}).forEach(function (lvl) {
      (c.spells[lvl] || []).forEach(function (sp) {
        if (sp && sp.prepared && sp.name) addSpell(sp.name);
      });
    });
    return list;
  }
  function sheetActions() {
    if (isDmPage()) return [];
    var list = [];
    document.querySelectorAll("[data-gunroll]").forEach(function (btn) {
      if (btn.hasAttribute("data-k") || btn.hidden) return;
      var i = btn.getAttribute("data-gunroll");
      list.push({ id: "gunroll:" + i, label: gunName(i) + " · Attack", group: "attack", enabled: !btn.disabled, title: btn.title || "", cylinder: gunCylinder(i) });
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
  function tidyName(text) {
    return String(text || "")
      .replace(/\s*-\s*Not sold\b/ig, "")
      .replace(/\s*-\s*[\d,]+\s*ES\b/ig, "")
      .replace(/\s+/g, " ")
      .trim();
  }
  function setSheetTarget(id) {
    var sel = $("atkTarget");
    if (!sel || id == null) return;
    sel.value = String(id);
    try { sel.dispatchEvent(new Event("change", { bubbles: true })); } catch (e) {}
  }
  function spareForGun(g, w) {
    var piles = [];
    try {
      var doc = root.SSDNSApp && root.SSDNSApp.doc && root.SSDNSApp.doc();
      piles = (doc && doc.character && doc.character.ammo) || [];
    } catch (e) { piles = []; }
    var gun = { name: (w && w.name) || (g && g.weapon) || "", caliber: (w && w.ammo) || (g && g.caliber) || "", ammo: (w && w.ammo) || "" };
    if (root.SSDNSApplied && root.SSDNSApplied.spareCount) return root.SSDNSApplied.spareCount(gun, piles);
    return 0;
  }
  function ownCard() {
    if (isDmPage()) return null;
    var app = root.SSDNSApp;
    if (!app || typeof app.doc !== "function" || typeof app.compute !== "function") return null;
    var doc = app.doc();
    var computed = app.compute();
    if (!doc || !doc.character || !computed) return null;
    var c = doc.character;
    var attacks = [];
    (c.guns || []).forEach(function (g, i) {
      if (!g || !g.weapon || g.equipped === false) return;
      var st = ((computed.guns) || []).filter(function (x) { return x && x.w && x.w.id === g.weapon; })[0];
      var w = st && st.w;
      var name = tidyName((w && w.name) || "");
      if (!name) return;
      var cyl = gunCylinder(i);
      attacks.push({
        id: "gunroll:" + i,
        name: name,
        toHit: st && st.atk,
        damage: (st && st.dmg) || "",
        weapon: g.weapon,
        action: (w && w.action) || "",
        group: (w && w.group) || "",
        tier: (st && st.tier) || "",
        ammoName: (w && w.ammo) || "",
        ammoDisplay: g.ammoDisplay || "",
        scatter: !!(w && w.scatter),
        ammo: cyl ? { loaded: cyl.loaded, cap: cyl.cap, chambers: cyl.chambers, spare: spareForGun(g, w), locked: cyl.locked } : null,
        spare: spareForGun(g, w),
        reloadId: cyl ? ("reload:" + i) : "",
        trId: w && w.tr ? ("tr:" + i) : "",
        tr: !!(w && w.tr),
        caster: !!(w && w.hexShells),
        calling: c.calling || "",
        ammoPool: g.ammoPool == null ? "" : String(g.ammoPool),
        attackMode: g.attackMode === "adv" || g.attackMode === "dis" ? g.attackMode : "",
        pools: (app.ammoChoices && w && w.capacity) ? app.ammoChoices(i) : [],
        castSpells: (c.calling === "hexslinger" && w && w.hexShells && app.castList) ? app.castList() : [],
        dirty: !!g.dirty,
        fouled: !!g.fouled,
        ruined: !!(g.ruined || g.broken),
        broken: !!g.broken,
        exploded: !!g.exploded,
        jammed: !!g.jammed,
        misStreak: Number(g.misStreak) || 0,
        pendingD4: !!g.pendingD4,
        lockedChambers: Array.isArray(g.lockedChambers) ? g.lockedChambers.slice() : [],
        mod: g.mod || "",
        muzzleloader: ((c.feats || []).indexOf("muzzleloader") >= 0),
        reopenUsed: !!c.muzzleReopenUsed,
        feats: (c.feats || []).slice(),
        rugged: !!(w && /rugged/i.test(w.properties || "")),
        properties: (w && w.properties) || "",
        gunIndex: i
      });
    });
    var meleeList = (root.SSDNSRules && root.SSDNSRules.melee) || [];
    (c.melee || []).forEach(function (m, i) {
      if (!m || !m.weapon || m.equipped === false) return;
      var w = meleeList.filter(function (x) { return x.id === m.weapon; })[0];
      var name = tidyName((w && w.name) || "");
      if (!name || /^Melee \d+$/i.test(name)) return;
      var atkEl = document.querySelector("[data-melee-atk='" + i + "']");
      var dmgEl = document.querySelector("[data-melee-dmg='" + i + "']");
      attacks.push({
        id: "melee:" + i,
        name: name,
        toHit: atkEl ? String(atkEl.textContent || "").trim() : "",
        damage: dmgEl ? String(dmgEl.textContent || "").trim() : ((w && w.damage) || "")
      });
    });
    var spells = [];
    function pushSpell(level, name) {
      if (!name) return;
      var known = root.SSDNSSpellCast && typeof root.SSDNSSpellCast.lookup === "function" ? root.SSDNSSpellCast.lookup(name) : null;
      spells.push({
        id: "spell:" + level + ":" + name,
        name: name,
        level: known && known.level != null ? known.level : level,
        kind: (known && known.kind) || "",
        damage: (known && (known.damage || known.dmg)) || ""
      });
    }
    (c.cantrips || []).forEach(function (name) { pushSpell(0, name); });
    Object.keys(c.spells || {}).forEach(function (lvl) {
      (c.spells[lvl] || []).forEach(function (sp) {
        if (sp && sp.prepared && sp.name) pushSpell(lvl, sp.name);
      });
    });
    var pact = $("btnPactShot");
    if (pact && !pact.hidden) spells.push({ id: "pact", name: "Pact Shot", kind: "attack" });
    var nameInput = $("charName");
    return {
      name: (nameInput && nameInput.value) || c.name || "",
      kind: "pc",
      ac: computed.ac,
      hp: { cur: c.hpCurrent, max: c.hpMax, temp: c.hpTemp || 0 },
      speed: c.speed || 30,
      attacks: attacks,
      spells: spells
    };
  }
  function runAction(id, ctx) {
    ctx = ctx || {};
    if (ctx.targetId) setSheetTarget(ctx.targetId);
    if (id.indexOf("gunroll:") === 0 && ctx.chamber != null && ctx.chamber !== "") {
      var gi = id.slice(8);
      var k = String(ctx.chamber);
      var chamber = document.querySelector('[data-fire="' + cssEscape(gi) + '"][data-k="' + cssEscape(k) + '"]')
        || document.querySelector('[data-gunroll="' + cssEscape(gi) + '"][data-k="' + cssEscape(k) + '"]');
      if (chamber && !chamber.hidden) { chamber.click(); return; }
    }
    var btn = null;
    if (id.indexOf("gunroll:") === 0) btn = document.querySelector('[data-gunroll="' + cssEscape(id.slice(8)) + '"]:not([data-k])');
    else if (id.indexOf("melee:") === 0) btn = document.querySelector('[data-melee-roll="' + cssEscape(id.slice(6)) + '"]');
    else if (id.indexOf("cast:") === 0) btn = document.querySelector('[data-cast="' + cssEscape(id.slice(5)) + '"]');
    else if (id.indexOf("spell:") === 0) btn = document.querySelector('[data-spell-cast="' + cssEscape(id.slice(6)) + '"]');
    else if (id === "pact") btn = $("btnPactShot");
    else if (id.indexOf("clean:") === 0) {
      var cleaner = root.SSDNSApp && root.SSDNSApp.cleanGun;
      if (typeof cleaner === "function") return cleaner(Number(id.slice(6)));
      btn = document.querySelector('[data-clean="' + cssEscape(id.slice(6)) + '"]');
    }
    else if (id.indexOf("unjam:") === 0) {
      var unjam = root.SSDNSApp && root.SSDNSApp.unjamGun;
      if (typeof unjam === "function") return unjam(Number(id.slice(6)));
      btn = document.querySelector('[data-unjam="' + cssEscape(id.slice(6)) + '"]');
    }
    else if (id.indexOf("reopen:") === 0) {
      var reopen = root.SSDNSApp && root.SSDNSApp.reopenChamber;
      if (typeof reopen === "function") return reopen(Number(id.slice(7)));
      btn = document.querySelector('[data-reopen="' + cssEscape(id.slice(7)) + '"]');
    }
    else if (id.indexOf("reload:") === 0) btn = document.querySelector('[data-reload="' + cssEscape(id.slice(7)) + '"]');
    else if (id.indexOf("unload:") === 0) {
      var unloader = root.SSDNSApp && root.SSDNSApp.unloadGunIndex;
      if (typeof unloader === "function") return unloader(Number(id.slice(7)));
      btn = document.querySelector('[data-unload="' + cssEscape(id.slice(7)) + '"]');
    }
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
    if (name === "party:sync") {
      var sync = root.SSDNSMapFight;
      if (sync && typeof sync.syncMap === "function") {
        try { sync.syncMap(); } catch (e) {}
      }
      return;
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
    if (name === "combatant:add") {
      if (!detail.duplicate) return;
      var dup = root.SSDNSMapFight;
      if (dup && typeof dup.duplicate === "function") {
        try { Promise.resolve(dup.duplicate(detail)); } catch (e2) {}
      }
      return;
    }
    if (name === "token:hidden") {
      var hideApi = root.SSDNSMapFight;
      if (hideApi && typeof hideApi.hidden === "function") {
        try { Promise.resolve(hideApi.hidden(detail)); } catch (e3) {}
      }
      return;
    }
    var fightCall = {
      "drawer:hp": "hp",
      "drawer:condition": "condition",
      "drawer:reload": "reload",
      "drawer:unload": "unload",
      "drawer:clean": "clean",
      "drawer:pool": "pool",
      "drawer:tr": "tr",
      "drawer:hex": "hex",
      "drawer:castgun": "castgun",
      "drawer:mode": "mode",
      "drawer:deathsave": "deathsave",
      "drawer:undo": "undo",
      "drawer:chamber": "chamber",
      "drawer:down": "down",
      "drawer:act": "act",
      "drawer:cover": "cover",
      "drawer:disarm": "disarm",
      "drawer:rob": "rob"
    }[name];
    if (name === "drawer:target") fightCall = detail.spellId ? "cast" : "attack";
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
    mountedUid = ctx.uid || "";
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
            run: function (id, ctx) { runAction(id, ctx); }
          },
          ownCard: ownCard,
          setSheetTarget: setSheetTarget,
          on: onHost,
          rounds: roundsLabel,
          getCard: function (tokenId) {
            var api = root.SSDNSMapCards;
            if (!isDmPage() || !api || typeof api.get !== "function") return null;
            try { return api.get(tokenId) || null; } catch (e) { return null; }
          },
          combatTargets: function (detail) {
            var api = root.SSDNSMapFight;
            if (!isDmPage() || !api || typeof api.targets !== "function") return null;
            try { return api.targets(detail || {}) || null; } catch (e) { return null; }
          },
          linkChoices: function () {
            var api = root.SSDNSMapCards;
            if (!isDmPage() || !api || typeof api.choices !== "function") return null;
            try { return api.choices(); } catch (e) { return null; }
          },
          rangeWeapons: rangeWeapons
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
    releaseToken: releaseToken,
    patchToken: function (id, fields) {
      if (!isDmPage() || !map || typeof map.patchToken !== "function") return null;
      return map.patchToken(id, fields || {});
    },
    refreshCard: function (tokenId) {
      if (map && map.refreshCard) map.refreshCard(tokenId || "");
    },
    feetBetween: function (idA, idB) {
      if (!map || typeof map.feetBetween !== "function") return null;
      try { return map.feetBetween(idA, idB); }
      catch (e) { return null; }
    },
    rounds: roundsLabel,
    sheetCylinder: gunCylinder,
    armAttack: function (attack, targetId, shooterId) {
      if (!map || typeof map.armAttack !== "function") return null;
      try { return map.armAttack(attack, targetId, shooterId); }
      catch (e) { return null; }
    }
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire);
  else wire();
})(typeof window !== "undefined" ? window : globalThis);

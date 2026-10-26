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
  /* ---- Turn UX on the map (Jessey 2026-10-22 2:28 PM): the sheet's turn strip on the map ----
     The sheet's #turnPanel (round, turn order, Action / Bonus / R, movement, Dash / Disengage / Dodge, End turn) is
     moved, as the same element, into a slot at the top of the map while the Map tab is open, and put back in its
     place under the table bar when another tab opens or the map closes. One element, so the two can't differ. */
  var turnHome = null;
  function turnPanelEl() { return $("turnPanel"); }
  /* While the strip is docked, a break before #turnSlot puts the turn order on its own row and the
     tracker (Action / Bonus / R, Move, Dash / Disengage / Dodge, End turn) on the next. Off the map the
     break is display:none, and undock removes it so the main-page strip stays one row. */
  function clearTurnBreak() {
    var panel = turnPanelEl();
    if (!panel) return;
    var br = panel.querySelector(":scope > .ssm-turn-break");
    if (br && br.parentNode) br.parentNode.removeChild(br);
  }
  function ensureTurnBreak() {
    var panel = turnPanelEl();
    if (!panel) return;
    var slot = panel.querySelector(":scope > #turnSlot");
    if (!slot) return;
    var br = panel.querySelector(":scope > .ssm-turn-break");
    if (!br) {
      br = document.createElement("span");
      br.className = "ssm-turn-break";
      br.setAttribute("aria-hidden", "true");
    }
    if (br.nextSibling !== slot) slot.parentNode.insertBefore(br, slot);
  }
  function mapTabOpen() {
    var pageEl = $("page-map");
    return !!(pageEl && !pageEl.hidden && !document.body.classList.contains("printing"));
  }
  function undockTurnPanel() {
    var panel = turnPanelEl();
    var el = mountEl();
    if (el) { el.classList.remove("has-sheet-turn"); el.style.removeProperty("--ssm-strip-h"); }
    if (document.body) document.body.classList.remove("map-turn-docked");
    clearTurnBreak();
    if (!panel || !turnHome || !turnHome.parentNode) return;
    if (panel.parentNode && panel.parentNode.classList && panel.parentNode.classList.contains("ssm-turnhost")) {
      turnHome.parentNode.insertBefore(panel, turnHome);
    }
  }
  function dockTurnPanel() {
    if (isDmPage()) return;
    var el = mountEl();
    var panel = turnPanelEl();
    if (!el || !panel) return;
    if (!map || el.hidden || !mapTabOpen()) { undockTurnPanel(); return; }
    var slot = el.querySelector(":scope > .ssm-turnhost");
    if (!slot) {
      slot = document.createElement("div");
      slot.className = "ssm-turnhost";
      slot.setAttribute("data-act", "turnHost");
      el.insertBefore(slot, el.firstChild);
    }
    if (panel.parentNode !== slot) {
      if (!turnHome) turnHome = document.createComment("turnPanel home");
      if (!turnHome.parentNode) panel.parentNode.insertBefore(turnHome, panel);
      slot.appendChild(panel);
    }
    el.classList.add("has-sheet-turn");
    document.body.classList.add("map-turn-docked");
    ensureTurnBreak();
    watchStripHeight(slot);
    setTimeout(stripHeight, 60); /* after a full-screen switch settles */
    if (map.requestDraw) map.requestDraw();
  }
  /* the player card floats over the board; it starts below the strip (CSS var --ssm-strip-h on the mount) */
  var stripRo = null, stripRoFor = null;
  function stripHeight() {
    var el = mountEl();
    var slot = el && el.querySelector(":scope > .ssm-turnhost");
    if (!el || !slot) return;
    var h = slot.offsetHeight || 0;
    el.style.setProperty("--ssm-strip-h", (h ? slot.offsetTop + h : 0) + "px"); /* bottom edge of the strip in the map */
  }
  function watchStripHeight(slot) {
    stripHeight();
    if (stripRoFor === slot || typeof ResizeObserver !== "function") return;
    if (stripRo) { try { stripRo.disconnect(); } catch (e) {} }
    stripRoFor = slot;
    try { stripRo = new ResizeObserver(function () { stripHeight(); }); stripRo.observe(slot); } catch (e) { stripRo = null; }
  }
  function destroyMap() {
    undockTurnPanel(); /* map.destroy() empties the mount; the strip goes home first */
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
        return {
          uid: id,
          id: id,
          name: snap.name || snap.player || id,
          portrait: snap.portrait || "",
          /* B2: the sheet snapshot, so the DM map can stamp lights while the player's Map tab is closed. */
          lightProfile: snap.lightProfile || null
        };
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
        equipped: g.equipped,
        look: roundLookFor(g, g.chambers, g.lockedChambers, loaded)
      };
    }).filter(Boolean);
    if (Equip && Equip.badgeRowsForToken) return Equip.badgeRowsForToken(rows);
    return rows.filter(function (g) { return g.equipped !== false && g.cap; });
  }
  /* 0.3.64: token ammo badge = the round that fires next in that gun (art colours from ammo-display) */
  function roundLookFor(g, chambers, locked, loaded) {
    var AD = root.SSDNSAmmoDisplay;
    if (!AD || !AD.roundLook || !g) return null;
    var list = Array.isArray(chambers) && chambers.length
      ? (root.SSDNSApplied && root.SSDNSApplied.chamberTokens ? root.SSDNSApplied.chamberTokens(chambers) : chambers.slice())
      : [];
    try {
      return AD.roundLook({
        weapon: g.weapon || g.weaponId || "", name: g.name || "", group: g.group || "", action: g.action || "",
        tier: g.tier || "", load: g.load || "", scatter: !!g.scatter, caliber: g.caliber || g.ammoName || "",
        chambers: list, locked: Array.isArray(locked) ? locked : [], loaded: loaded
      });
    } catch (e) { return null; }
  }
  function ownRounds() {
    var app = root.SSDNSApp;
    var doc = app && app.doc && app.doc();
    var guns = doc && doc.character && doc.character.guns || [];
    /* SAMPLE trackers: quiver / loaded marker / thrown count rows ride under the gun rows */
    var extra = root.SSDNSTrackers && root.SSDNSTrackers.tokenRows && doc && doc.character ? root.SSDNSTrackers.tokenRows(doc.character) : [];
    return gunRows(guns).concat(extra);
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
      card = api.get(token.id) || (token.combatantId && api.get(token.combatantId)) || (token.ownerUid && api.get(token.ownerUid)) ||
        /* 0.2.77: party tokens are "ply_<player id>"; the owner uid is not always the player id */
        (/^ply_/.test(String(token.id || "")) && api.get(String(token.id).slice(4))) || null;
    } catch (e) { card = null; }
    if (!card) return [];
    var guns = (card.attacks || []).filter(function (a) { return a && a.ammo && a.ammo.cap; }).map(function (a) {
      return {
        name: a.name || "",
        group: a.group || "",
        loaded: Number(a.ammo.loaded) || 0,
        cap: Number(a.ammo.cap) || 0,
        equipped: a.equipped,
        index: a.sheetIndex != null ? a.sheetIndex : a.gunIndex,
        look: roundLookFor(a, a.ammo.chambers, a.ammo.locked, Number(a.ammo.loaded) || 0)
      };
    });
    var extraRows = Array.isArray(card.trackRows) ? card.trackRows : []; /* SAMPLE trackers (from the player snapshot) */
    if (root.SSDNSEquip && root.SSDNSEquip.badgeRowsForToken) return root.SSDNSEquip.badgeRowsForToken(guns).concat(extraRows);
    return guns.filter(function (g) { return g.equipped !== false; }).concat(extraRows);
  }
  /* 0.3.69: Muzzleloader Powder Hands lets percussion revolvers / muzzleloaders Tactical Reload */
  function canTr(w) {
    var A = root.SSDNSApp;
    return A && A.canTacticalReload ? A.canTacticalReload(w) : !!(w && w.tr);
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
    if (root.SSDNSItems && root.SSDNSItems.rangeChoices) {
      root.SSDNSItems.rangeChoices(c).forEach(function (spec) { if (spec) list.push(spec); });
    }
    (c.cantrips || []).forEach(addSpell);
    Object.keys(c.spells || {}).forEach(function (lvl) {
      (c.spells[lvl] || []).forEach(function (sp) {
        if (sp && sp.prepared && sp.name) addSpell(sp.name);
      });
    });
    return list;
  }
  /* turn order PR 2 (item 1): a sheet button greyed out off-turn (turn-lock.js) is greyed out on the map card too */
  function usable(btn) { return !!btn && !btn.disabled && !(btn.classList && btn.classList.contains("turn-locked")); }
  /* B7: btn.hidden misses a hidden parent (#pactFocus, #pactIronSpells). Tab panels are
     <section class="page" hidden>. With the Map tab open, #page-main is hidden, so a page
     ancestor must not count or a real Pact Seeker loses Pact Shot and every other button. */
  function shown(b) {
    var h = b && b.closest && b.closest("[hidden]");
    return !!b && !b.hidden && (!h || !!(h.classList && h.classList.contains("page")));
  }
  function firstShown(sel) {
    var nodes = document.querySelectorAll(sel);
    var i;
    for (i = 0; i < nodes.length; i++) if (shown(nodes[i])) return nodes[i];
    return null;
  }
  function sheetCharacter() {
    try {
      var doc = root.SSDNSApp && root.SSDNSApp.doc && root.SSDNSApp.doc();
      return (doc && doc.character) || null;
    } catch (e) { return null; }
  }
  /* Pact Shot reaches the map only for a Pact Seeker whose Borrowed Iron card is open.
     #btnPactShot itself is never hidden; #pactFocus is. applies() still drops it if the
     calling changed and the card has not repainted yet. */
  function pactShotOnMap(c) {
    var PS = root.SSDNSPactShot;
    var box = $("pactFocus");
    if (!c) c = sheetCharacter();
    if (!PS || typeof PS.applies !== "function" || !PS.applies(c)) return false;
    if (!box || box.hidden) return false;
    return shown($("btnPactShot"));
  }
  /* L0224: the Gear signature card's feature buttons, and only while that Calling's card is open.
     Attack proxies stay on the real gun / melee buttons so the drawer does not list them twice. */
  function signatureActions() {
    var Sig = root.SSDNSSignature;
    var c = sheetCharacter();
    var box = $("callingSig");
    if (!Sig || typeof Sig.applies !== "function" || !Sig.applies(c)) return [];
    if (!box || box.hidden || !shown(box)) return [];
    var list = [];
    document.querySelectorAll("#callingSig [data-sig-map]").forEach(function (btn) {
      if (!shown(btn)) return;
      var key = btn.getAttribute("data-sig-map") || "";
      if (!key) return;
      list.push({
        id: "sig:" + key,
        label: btn.getAttribute("data-sig-label") || (btn.textContent || "").trim(),
        group: btn.getAttribute("data-sig-group") || "gear",
        enabled: usable(btn),
        title: btn.title || ""
      });
    });
    return list;
  }
  function sheetActions() {
    if (isDmPage()) return [];
    var list = [];
    document.querySelectorAll("[data-gunroll]").forEach(function (btn) {
      if (btn.hasAttribute("data-k") || !shown(btn)) return;
      var i = btn.getAttribute("data-gunroll");
      list.push({ id: "gunroll:" + i, label: gunName(i) + " · Attack", group: "attack", enabled: usable(btn), title: btn.title || "", cylinder: gunCylinder(i) });
    });
    document.querySelectorAll("[data-melee-roll]").forEach(function (btn) {
      if (!shown(btn)) return;
      var i = btn.getAttribute("data-melee-roll");
      list.push({ id: "melee:" + i, label: meleeName(i) + " · Attack", group: "attack", enabled: usable(btn), title: btn.title || "" });
    });
    document.querySelectorAll("[data-cast]").forEach(function (btn) {
      if (!shown(btn)) return;
      var i = btn.getAttribute("data-cast");
      list.push({ id: "cast:" + i, label: gunName(i) + " · Cast", group: "spell", enabled: usable(btn), title: btn.title || "" });
    });
    var seenSpell = {};
    document.querySelectorAll("[data-spell-cast]").forEach(function (btn) {
      if (!shown(btn)) return;
      var raw = btn.getAttribute("data-spell-cast") || "";
      if (!raw || seenSpell[raw]) return;
      seenSpell[raw] = 1;
      var name = raw.slice(raw.indexOf(":") + 1) || "Spell";
      var PS = root.SSDNSPactShot;
      if (PS && PS.isPactShot && PS.isPactShot(name) && !(PS.applies && PS.applies(sheetCharacter()))) return;
      list.push({ id: "spell:" + raw, label: "Cast " + name, group: "spell", enabled: usable(btn), title: btn.title || "" });
    });
    if (pactShotOnMap(sheetCharacter())) {
      var pact = $("btnPactShot");
      var pactLabel = "Pact Shot";
      try {
        var shot = root.SSDNSPactShot && root.SSDNSPactShot.variant && root.SSDNSPactShot.variant();
        if (shot && shot.name) pactLabel = shot.name + (shot.subtitle ? " · " + shot.subtitle : "");
      } catch (e) {}
      list.push({ id: "pact", label: pactLabel, group: "spell", enabled: usable(pact), title: pact.title || "" });
    }
    signatureActions().forEach(function (a) { list.push(a); });
    document.querySelectorAll("[data-reload]").forEach(function (btn) {
      if (!shown(btn)) return;
      var i = btn.getAttribute("data-reload");
      list.push({ id: "reload:" + i, label: gunName(i) + " · Reload", group: "gear", enabled: usable(btn), title: btn.title || "" });
    });
    document.querySelectorAll("[data-tr]").forEach(function (btn) {
      if (!shown(btn)) return;
      var i = btn.getAttribute("data-tr");
      list.push({ id: "tr:" + i, label: gunName(i) + " · TR +1", group: "gear", enabled: usable(btn), title: btn.title || "" });
    });
    if (root.SSDNSTrackers && root.SSDNSTrackers.mapActions) list = root.SSDNSTrackers.mapActions().concat(list);
    /* turn order PR 2: Dash / Disengage / Dodge and the opportunity-attack ask, from the sheet's turn strip */
    document.querySelectorAll("#turnSlot [data-tl-act], #turnSlot [data-tl-oa]").forEach(function (btn) {
      var k = btn.getAttribute("data-tl-act") || "oa";
      list.push({ id: "turn:" + k, label: btn.textContent.trim(), group: "gear", enabled: usable(btn), title: btn.title || "" });
    });
    var endBtn = $("btnEndTurn");
    if (shown(endBtn)) list.push({ id: "endturn", label: "End turn", group: "gear", enabled: !endBtn.disabled, title: endBtn.title || "" });
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
        trId: w && canTr(w) ? ("tr:" + i) : "",
        tr: !!(w && canTr(w)),
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
        wrecked: !!g.wrecked,
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
      if (!w && m.weapon === "unarmed" && root.SSDNSSignature && root.SSDNSSignature.fistsWeapon) w = root.SSDNSSignature.fistsWeapon(c);
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
    /* 0.3.72: off-hand attacks (bonus action). Same weapon, own button; no ammo row so cylinders stay single. */
    var OH = root.SSDNSOffhand;
    var oh = OH && OH.options ? OH.options(c) : null;
    if (oh && oh.ok) {
      oh.list.forEach(function (o) {
        var base = attacks.filter(function (a) { return a.id === o.id; })[0];
        if (!base) return;
        var copy = {};
        Object.keys(base).forEach(function (k) { copy[k] = base[k]; });
        delete copy.ammo; copy.reloadId = ""; copy.trId = ""; copy.pools = []; copy.castSpells = [];
        copy.id = "offhand:" + o.kind + ":" + o.index;
        copy.name = base.name + (o.side ? " (" + o.side + ")" : "") + " · off-hand";
        copy.damage = OH.stripMod(base.damage, OH.abilityMod(c, o.kind, o.index));
        copy.offhand = true;
        copy.kind = o.kind === "melee" ? "melee" : (copy.kind || "");
        attacks.push(copy);
      });
    }
    /* 0.3.73: Pistolero Fan the Hammer, one button per held pistol (bonus action; ability mod kept). */
    var FAN = root.SSDNSFan;
    if (FAN && FAN.status && FAN.hasPistolero(c)) {
      (c.guns || []).forEach(function (g, i) {
        var fs = FAN.status(i, c);
        if (!fs.show) return;
        var base = attacks.filter(function (a) { return a.id === "gunroll:" + i; })[0];
        if (!base) return;
        var copy = {};
        Object.keys(base).forEach(function (k) { copy[k] = base[k]; });
        delete copy.ammo; copy.reloadId = ""; copy.trId = ""; copy.pools = []; copy.castSpells = [];
        copy.id = "fan:gun:" + i;
        copy.name = base.name + " · Fan";
        copy.fan = true;
        copy.enabled = !!fs.ok;
        copy.title = fs.ok ? "Fan the Hammer (bonus action)" : fs.reason;
        attacks.push(copy);
      });
    }
    /* SAMPLE trackers (Jessey 2026-10-19): Sneak Attack / Smite arm-before-attack toggles at the top of Attacks */
    var TRK = root.SSDNSTrackers;
    if (TRK && TRK.mapActions) {
      TRK.mapActions().reverse().forEach(function (t) {
        attacks.unshift({ id: t.id, name: t.label, arm: true, armed: /ARMED/.test(t.label), enabled: t.enabled !== false, title: t.title || "", kind: "toggle" });
      });
    }
    var spells = [];
    function pushSpell(level, name) {
      if (!name) return;
      var PS = root.SSDNSPactShot;
      if (PS && PS.isPactShot && PS.isPactShot(name) && !(PS.applies && PS.applies(c))) return;
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
    if (pactShotOnMap(c)) {
      var pact = $("btnPactShot");
      var pactName = "Pact Shot";
      var pactKind = "attack";
      try {
        var pactShot = root.SSDNSPactShot && root.SSDNSPactShot.variant && root.SSDNSPactShot.variant(c);
        if (pactShot && pactShot.name) pactName = pactShot.name;
        if (pactShot && pactShot.cone) pactKind = "save";
      } catch (ePact) {}
      spells.push({ id: "pact", name: pactName, kind: pactKind, enabled: usable(pact) });
    }
    signatureActions().forEach(function (t) {
      if (t.group === "spell") spells.push({ id: t.id, name: t.label, enabled: t.enabled !== false, kind: "" });
      else attacks.push({ id: t.id, name: t.label, arm: true, enabled: t.enabled !== false, title: t.title || "" });
    });
    var nameInput = $("charName");
    return {
      name: (nameInput && nameInput.value) || c.name || "",
      kind: "pc",
      ac: computed.ac,
      /* L0188: exhaustion halves speed (2) / zeroes it (5) and halves HP max (4) */
      hp: { cur: c.hpCurrent, max: (root.SSDNSSheet && root.SSDNSSheet.effHpMax && c.hpMax !== "" && c.hpMax != null) ? root.SSDNSSheet.effHpMax(Number(c.hpMax)) : c.hpMax, temp: c.hpTemp || 0 },
      speed: root.SSDNSCondFx && root.SSDNSCondFx.speed && c.speed !== "" && c.speed != null ? root.SSDNSCondFx.speed(c) : (c.speed || 30),
      attacks: attacks,
      spells: spells,
      items: c.items || []
    };
  }
  function runAction(id, ctx) {
    ctx = ctx || {};
    /* turn order PR 2 (item 1): the same off-turn lock as the sheet, also for the actions that call the sheet directly */
    if (root.SSDNSTurnLock && root.SSDNSTurnLock.blockedAction && root.SSDNSTurnLock.blockedAction(id)) return;
    if (String(id).indexOf("turn:") === 0) {
      var tk = String(id).slice(5);
      var tb = tk === "oa" ? document.querySelector("#turnSlot [data-tl-oa]") : document.querySelector('#turnSlot [data-tl-act="' + cssEscape(tk) + '"]');
      if (tb && !tb.disabled) tb.click();
      return;
    }
    /* SAMPLE trackers: "trk:sneak" / "trk:smite" flip the arm on the sheet; no target, no roll */
    if (String(id).indexOf("trk:") === 0) {
      if (root.SSDNSTrackers && root.SSDNSTrackers.toggle) root.SSDNSTrackers.toggle(String(id).slice(4));
      return;
    }
    if (String(id).indexOf("sig:") === 0) {
      var sigBtn = firstShown('#callingSig [data-sig-map="' + cssEscape(String(id).slice(4)) + '"]');
      if (sigBtn && !sigBtn.disabled) sigBtn.click();
      return;
    }
    if (ctx.targetId) setSheetTarget(ctx.targetId);
    if (id.indexOf("gunroll:") === 0 && ctx.chamber != null && ctx.chamber !== "") {
      var gi = id.slice(8);
      var k = String(ctx.chamber);
      var chamber = firstShown('[data-fire="' + cssEscape(gi) + '"][data-k="' + cssEscape(k) + '"]')
        || firstShown('[data-gunroll="' + cssEscape(gi) + '"][data-k="' + cssEscape(k) + '"]');
      if (chamber) { chamber.click(); return; }
    }
    if (id.indexOf("fan:") === 0 && root.SSDNSFan) {
      var fanI = root.SSDNSFan.parseId(id);
      if (fanI != null) return root.SSDNSFan.fire(fanI, { chamber: ctx.chamber });
    }
    if (id.indexOf("offhand:") === 0 && root.SSDNSOffhand) {
      var ohId = root.SSDNSOffhand.parseId(id);
      if (ohId) return root.SSDNSOffhand.fire(ohId.kind, ohId.index, { chamber: ctx.chamber });
    }
    var btn = null;
    if (id.indexOf("gunroll:") === 0) btn = firstShown('[data-gunroll="' + cssEscape(id.slice(8)) + '"]:not([data-k])');
    else if (id.indexOf("melee:") === 0) btn = firstShown('[data-melee-roll="' + cssEscape(id.slice(6)) + '"]');
    else if (id.indexOf("cast:") === 0) btn = firstShown('[data-cast="' + cssEscape(id.slice(5)) + '"]');
    else if (id.indexOf("spell:") === 0) btn = firstShown('[data-spell-cast="' + cssEscape(id.slice(6)) + '"]');
    else if (id === "pact") btn = pactShotOnMap() ? $("btnPactShot") : null;
    else if (id === "endturn") btn = firstShown("#btnEndTurn");
    else if (id.indexOf("clean:") === 0) {
      var cleaner = root.SSDNSApp && root.SSDNSApp.cleanGun;
      if (typeof cleaner === "function") return cleaner(Number(id.slice(6)));
      btn = firstShown('[data-clean="' + cssEscape(id.slice(6)) + '"]');
    }
    else if (id.indexOf("unjam:") === 0) {
      var unjam = root.SSDNSApp && root.SSDNSApp.unjamGun;
      if (typeof unjam === "function") return unjam(Number(id.slice(6)));
      btn = firstShown('[data-unjam="' + cssEscape(id.slice(6)) + '"]');
    }
    else if (id.indexOf("reopen:") === 0) {
      var reopen = root.SSDNSApp && root.SSDNSApp.reopenChamber;
      if (typeof reopen === "function") return reopen(Number(id.slice(7)));
      btn = firstShown('[data-reopen="' + cssEscape(id.slice(7)) + '"]');
    }
    else if (id.indexOf("reload:") === 0) btn = firstShown('[data-reload="' + cssEscape(id.slice(7)) + '"]');
    else if (id.indexOf("unload:") === 0) {
      var unloader = root.SSDNSApp && root.SSDNSApp.unloadGunIndex;
      if (typeof unloader === "function") return unloader(Number(id.slice(7)));
      btn = firstShown('[data-unload="' + cssEscape(id.slice(7)) + '"]');
    }
    else if (id.indexOf("tr:") === 0) btn = firstShown('[data-tr="' + cssEscape(id.slice(3)) + '"]');
    if (shown(btn)) btn.click();
  }
  function sendChat(text) {
    var input, form;
    if (isDmPage()) {
      input = $("dockText");
      form = $("dockChat");
      var to = $("dockTo");
      if (to) to.value = "all";
    } else {
      /* N57: a send from the player map lands in the sheet Table log (same room log as Fight / Table). */
      input = $("sheetDockText") || $("logChatText");
      form = $("sheetDockChat") || $("logChat");
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
    /* 0.2.77: the strip's Roll Initiative / End combat press the Fight tab's own buttons (End combat asks first there) */
    if (name === "initiative:roll") {
      var rollAll = $("btnRollInitAll");
      if (rollAll) rollAll.click();
    }
    if (name === "initiative:end") {
      var endBtn = $("btnEndCombatHead") || $("btnEndCombat"); /* turn order PR 1: one End combat, in the Fight header */
      if (endBtn) endBtn.click();
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
    /* map bestiary: place a creature; the DMCC adds it to the fight and links the new token */
    if (name === "bestiary:place") {
      var placer = root.SSDNSMapFight;
      if (placer && typeof placer.placeBeast === "function") {
        try {
          Promise.resolve(placer.placeBeast(detail)).then(function (tokenId) {
            if (tokenId && map && typeof map.focusToken === "function") map.focusToken(tokenId);
            else if (tokenId && map && map.refreshCard) map.refreshCard(tokenId);
          }, function () {});
        } catch (e4) {}
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
      "drawer:revealHp": "revealHp",
      "drawer:condition": "condition",
      "drawer:reload": "reload",
      "drawer:unload": "unload",
      "drawer:clean": "clean",
      "drawer:unjam": "unjam",
      "drawer:reopen": "reopen",
      "drawer:jam": "jam",
      "drawer:lock": "lock",
      "drawer:addrounds": "addrounds",
      "drawer:pool": "pool",
      "drawer:tr": "tr",
      "drawer:hex": "hex",
      "drawer:castgun": "castgun",
      "drawer:mode": "mode",
      "drawer:weapon": "weapon",
      "drawer:deathsave": "deathsave",
      "drawer:undo": "undo",
      "drawer:chamber": "chamber",
      "drawer:down": "down",
      "drawer:act": "act",
      "drawer:cover": "cover",
      "drawer:speed": "speed",
      "drawer:disarm": "disarm",
      "drawer:rob": "rob",
      "drawer:useitem": "useitem",
      "drawer:gearAdd": "gearAdd",
      "drawer:gearRemove": "gearRemove",
      "drawer:dropLoot": "dropLoot"
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
          rangeWeapons: rangeWeapons,
          /* Turn UX on the map: the DM strip shows the current player's markers, the same HTML as the DM card */
          turnMarkers: function (cid) {
            var E = root.DMCCEnhance;
            if (!isDmPage() || !E || typeof E.mapMarkersHtml !== "function") return "";
            try { return E.mapMarkersHtml(cid) || ""; } catch (e) { return ""; }
          },
          /* Same path/reach module on the DM map: budget and spend for the combatant whose turn it is. */
          movementBudget: function (token) {
            var E = root.DMCCEnhance;
            if (!isDmPage() || !E || typeof E.movementBudget !== "function") return null;
            try { return E.movementBudget(token); } catch (e) { return null; }
          },
          spendMove: function (token, feet) {
            var E = root.DMCCEnhance;
            if (!isDmPage() || !E || typeof E.spendMove !== "function") return false;
            try { return E.spendMove(token, feet) === true; } catch (e) { return false; }
          },
          /* B3: the fight row's map token, when the map's initiative copy does not carry mapTokenId. */
          linkedTokenId: function (combatantId) {
            var E = root.DMCCEnhance;
            if (!isDmPage() || !E || typeof E.linkedTokenId !== "function") return "";
            try { return E.linkedTokenId(combatantId) || ""; } catch (e) { return ""; }
          },
          /* N67: the mover's map asks the host to show the reactor card and the DM mirror. */
          presentReact: function (view, handler) {
            if (isDmPage() && root.DMCCEnhance && typeof root.DMCCEnhance.presentReact === "function") {
              try { return root.DMCCEnhance.presentReact(view, handler) === true; } catch (e) { return false; }
            }
            if (root.SSDNSDmJoin && typeof root.SSDNSDmJoin.presentReact === "function") {
              try { return root.SSDNSDmJoin.presentReact(view, handler) === true; } catch (e2) { return false; }
            }
            return false;
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
      dockTurnPanel();
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
        setTimeout(stripHeight, 60); /* Turn UX on the map: the strip moves; the player card follows */
        if (!on) {
          var ab = document.getElementById("appbar");
          if (ab && ab.offsetHeight) document.documentElement.style.setProperty("--appbar-h", ab.offsetHeight + "px");
        }
      });
    }
    document.querySelectorAll(".tab").forEach(function (tab) {
      tab.addEventListener("click", function () {
        if (tab.id === "tab-map" && map) setTimeout(function () {
          if (map.refreshCard) map.refreshCard();
          else if (map.requestDraw) map.requestDraw();
        }, 30);
      });
    });
    /* Turn UX on the map: follow the Map tab (the sheet shows / hides #page-map) */
    var pageMap = $("page-map");
    if (pageMap && !isDmPage() && typeof MutationObserver === "function" && !pageMap.dataset.turnDock) {
      pageMap.dataset.turnDock = "1";
      try { new MutationObserver(function () { dockTurnPanel(); }).observe(pageMap, { attributes: true, attributeFilter: ["hidden"] }); } catch (e) {}
    }
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
  /* 0.3.59: linked-token hygiene */
  function tokensLoaded() {
    return !!(isDmPage() && map && (typeof map.tokensLoaded !== "function" || map.tokensLoaded()));
  }
  function tokenForCombatant(cid) {
    if (!isDmPage() || !map || typeof map.tokenForCombatant !== "function") return "";
    return map.tokenForCombatant(cid) || "";
  }
  function staleTokenIds(liveIds, keep) {
    if (!isDmPage() || !map || typeof map.staleTokenIds !== "function") return [];
    return map.staleTokenIds(liveIds, keep) || [];
  }
  function clearStaleTokens(liveIds, keep) {
    if (!isDmPage() || !map || typeof map.clearStaleTokens !== "function") return 0;
    return map.clearStaleTokens(liveIds, keep) || 0;
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
    pinLootChest: function (box, at) {
      if (!map || typeof map.pinLootChest !== "function") return null;
      try { return map.pinLootChest(box, at); }
      catch (e) { return null; }
    },
    tokenPos: function (id) {
      if (!map || typeof map.tokenPos !== "function") return null;
      try { return map.tokenPos(id); }
      catch (e) { return null; }
    },
    focusLootChest: function (boxId) {
      if (!map || typeof map.focusLootChest !== "function") return "";
      try { return map.focusLootChest(boxId); }
      catch (e) { return ""; }
    },
    removeToken: removeToken,
    tokenForPlayer: tokenForPlayer,
    hasToken: hasToken,
    releaseToken: releaseToken,
    tokensLoaded: tokensLoaded,
    tokenBoxes: function () { return map && typeof map.tokenBoxes === "function" ? map.tokenBoxes() : []; },
    drawerTokenId: function () { return map && typeof map.drawerTokenId === "function" ? map.drawerTokenId() : ""; },
    tokenForCombatant: tokenForCombatant,
    combatantForToken: function (id) {
      if (!map || typeof map.combatantForToken !== "function") return "";
      try { return map.combatantForToken(id) || ""; } catch (e) { return ""; }
    },
    releaseReactHold: function (choice) {
      if (!map || typeof map.releaseReactHold !== "function") return;
      try { map.releaseReactHold(choice); } catch (e) {}
    },
    staleTokenIds: staleTokenIds,
    clearStaleTokens: clearStaleTokens,
    patchToken: function (id, fields) {
      if (!isDmPage() || !map || typeof map.patchToken !== "function") return null;
      return map.patchToken(id, fields || {});
    },
    /* B2: a player's Add-my-token request. The DM client places it. replace drops the old one. */
    addPlayerToken: function (uid, opts) {
      if (!isDmPage() || !map || typeof map.addPlayerTokenFor !== "function") return null;
      try { return map.addPlayerTokenFor(uid, opts || {}); }
      catch (e) { return null; }
    },
    refreshCard: function (tokenId) {
      if (map && map.refreshCard) map.refreshCard(tokenId || "");
    },
    /* Turn UX on the map: the DM page repaints the strip's markers when a player's markers change */
    refreshMove: function () {
      if (map && typeof map.refreshMove === "function") map.refreshMove();
    },
    refreshStrip: function () {
      if (map && map.refreshStrip) map.refreshStrip();
    },
    dockTurnPanel: dockTurnPanel,
    feetBetween: function (idA, idB) {
      if (!map || typeof map.feetBetween !== "function") return null;
      try { return map.feetBetween(idA, idB); }
      catch (e) { return null; }
    },
    rounds: roundsLabel,
    sheetCylinder: gunCylinder,
    ownCard: ownCard,
    sheetActions: sheetActions,
    runAction: runAction,
    /* attack-fx: DMCC hands every resolved attack here; the DM's map draws it and publishes the cleaned row */
    fx: function (spec) {
      if (!map || typeof map.fx !== "function") return null;
      try { return map.fx(spec || {}); }
      catch (e) { return null; }
    },
    /* fog-aware targeting: DM map -> can this player see that target (null when the map can't tell);
       player sheet -> { visible, outOfRange, feet } for its own Target list */
    playerCanSee: function (viewerUid, targetId) {
      if (!isDmPage() || !map || typeof map.canPlayerSee !== "function") return null;
      try { return map.canPlayerSee(viewerUid, targetId); }
      catch (e) { return null; }
    },
    targetSight: function (targetId) {
      if (isDmPage() || !map || typeof map.targetSight !== "function") return null;
      try { return map.targetSight(targetId); }
      catch (e) { return null; }
    },
    lightsProfile: function () {
      var L = root.SSDNSLighting;
      var doc = null;
      try { doc = root.SSDNSApp && root.SSDNSApp.doc && root.SSDNSApp.doc(); } catch (e) { doc = null; }
      if (!L || !L.tokenProfile || !doc || !doc.character) return null;
      try { return L.tokenProfile(doc.character); } catch (e) { return null; }
    },
    armAttack: function (attack, targetId, shooterId) {
      if (!map || typeof map.armAttack !== "function") return null;
      try { return map.armAttack(attack, targetId, shooterId); }
      catch (e) { return null; }
    }
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire);
  else wire();
})(typeof window !== "undefined" ? window : globalThis);

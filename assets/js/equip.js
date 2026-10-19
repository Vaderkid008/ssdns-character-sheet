/* L0170 loadout. Slot caps, combat lock, migration, and token-badge rows.
   A missing equipped flag still means "equipped" for old snapshots.
   equipped === false is in the pack and cannot attack, reload, or badge. */
(function (root) {
  "use strict";

  var LIMITS = { pistol: 2, long: 1, melee: 1, focus: 1 };
  var LOCK_TIP = "Change loadout outside combat";
  var CHAT_KEYS = { dm: "ssdns.map.chatOpen.dm", player: "ssdns.map.chatOpen.player" };
  var OLD_CHAT_KEY = "ssdns.map.chatOpen";
  var combatOn = false;

  var ICONS = {
    pistol: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M1 4.5h8.5v2.2H5.2V13H3.2V6.7H1z"/></svg>',
    rifle: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M0 5h16v2H6.2v5.2H4.2V7H0z"/></svg>',
    shotgun: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M0 4.2h16v3.2H7.4v4.8H5.2V7.4H0z"/></svg>'
  };

  function rules() { return root.SSDNS_RULES || {}; }

  function lookupWeapon(id, lookup) {
    if (lookup) return lookup(id) || null;
    if (id == null || id === "") return null;
    var key = String(id);
    var lists = [].concat(rules().firearms || [], rules().casterGuns || [], rules().otherRanged || [], rules().melee || []);
    for (var i = 0; i < lists.length; i++) {
      var row = lists[i];
      if (row && (row.id === key || row.name === key)) return row;
    }
    if (root.SSDNSTestJammer && root.SSDNSTestJammer.lookup) {
      var jam = root.SSDNSTestJammer.lookup(key);
      if (jam) return jam;
    }
    if (root.SSDNSPeaceMaker && root.SSDNSPeaceMaker.lookup) {
      var peace = root.SSDNSPeaceMaker.lookup(key);
      if (peace) return peace;
    }
    if (root.SSDNSItems && root.SSDNSItems.weaponRecord) {
      var catalogWeapon = root.SSDNSItems.weaponRecord(key);
      if (catalogWeapon) return catalogWeapon;
    }
    if (key === "test-jammer" || key === "TEST Jammer") return { id: "test-jammer", name: "TEST Jammer", group: "pistol", capacity: 6 };
    return null;
  }

  function lookupHolster(id) {
    if (!id) return null;
    if (typeof id === "object") return id;
    var list = rules().holsters || [];
    for (var i = 0; i < list.length; i++) if (list[i] && list[i].id === id) return list[i];
    return null;
  }

  function slotOf(weapon) {
    if (!weapon) return "";
    var g = String(weapon.group || "");
    if (g === "pistol" || g === "caster") return "pistol";
    if (g === "rifle" || g === "carbine" || g === "shotgun" || g === "bigbore") return "long";
    if (g === "simple-melee" || g === "martial-melee") return "melee";
    if (g === "simple-ranged" || g === "martial-ranged") {
      if (/thrown/i.test(weapon.properties || "") || /thrown/i.test(weapon.range || "")) return "melee";
      return "long";
    }
    return "";
  }

  function iconFor(group) {
    var g = String(group || "");
    if (g === "shotgun") return "shotgun";
    if (g === "pistol" || g === "caster") return "pistol";
    return "rifle";
  }

  function slotLabel(slot) {
    if (slot === "pistol") return "Pistol";
    if (slot === "long") return "Long gun";
    if (slot === "melee") return "Melee";
    if (slot === "focus") return "Focus";
    return "Weapon";
  }

  function pistolCovers(holster) {
    var row = lookupHolster(holster);
    if (!row || row.isRig === false) return 0;
    if (row.id === "pommel-holsters-pair" || /2 pistols/i.test(row.holds || "")) return 2;
    if (row.id === "saddle-scabbard" || /carbine|rifle/i.test(row.holds || "")) return 0;
    if (row.id === "shoulder-rig" || /pistol|revolver|derringer/i.test(row.holds || "")) return 1;
    return 0;
  }

  function equippedPistols(character, lookup) {
    var list = [];
    (character && character.guns || []).forEach(function (g, i) {
      if (!g || g.equipped !== true || !g.weapon) return;
      if (slotOf(lookupWeapon(g.weapon, lookup)) === "pistol") list.push(i);
    });
    return list;
  }

  function countSlots(character, lookup) {
    var n = { pistol: 0, long: 0, melee: 0, focus: 0 };
    (character && character.guns || []).forEach(function (g) {
      if (!g || g.equipped !== true || !g.weapon) return;
      var slot = slotOf(lookupWeapon(g.weapon, lookup));
      if (n[slot] != null) n[slot]++;
    });
    (character && character.melee || []).forEach(function (m) {
      if (!m || m.equipped !== true || !m.weapon) return;
      n.melee++;
    });
    if (character && character.focusEquipped === true && character.instrument) n.focus++;
    return n;
  }

  function combatActive(init) {
    if (!init) return false;
    var order = init.order || [];
    if (!order.length) return false;
    if (init.started === false) return false;
    return true;
  }

  function locked(opts) {
    if (opts && opts.dm) return false;
    if (opts && Object.prototype.hasOwnProperty.call(opts, "combat")) return !!opts.combat;
    if (opts && opts.initiative) return combatActive(opts.initiative);
    return combatOn;
  }

  function focusCarry(character) {
    var id = character && character.instrument;
    if (!id) return { carry: "", text: "" };
    if (id === "voice" || id === "piano") return { carry: "free", text: "Voice and piano are not a held focus." };
    var gear = String((character && character.equipment) || "");
    var strapped = id === "guitar" || id === "banjo" || id === "accordion";
    if (id === "fiddle" && /violin strap/i.test(gear)) strapped = true;
    if ((id === "guitar" || id === "banjo") && /standard strap|cartridge strap/i.test(gear)) strapped = true;
    if (id === "harmonica" && /harmonica rack/i.test(gear)) strapped = true;
    if (character && character.instrumentStrap) strapped = true;
    if (strapped) return { carry: "free", text: "Strapped: hangs free, both hands open. Casting through it takes a hand." };
    return { carry: "held", text: "Unstrapped: this is the held focus." };
  }

  function drawCheck(character, gunIndex, lookup) {
    var covers = pistolCovers(character && character.holster);
    var freeDraws = Math.min(2, 1 + covers);
    var list = equippedPistols(character, lookup);
    var rank = list.indexOf(Number(gunIndex));
    if (rank < 0) return { needed: false };
    if (rank < freeDraws) return { needed: false, covered: covers > 0 && rank > 0 };
    return { needed: true, dc: 12, ability: "DEX", reason: "Second pistol, no holster: DC 12 Dex check to draw." };
  }

  function setEquipped(character, opts) {
    opts = opts || {};
    if (!character) return { ok: false, reason: "No character." };
    if (locked(opts)) return { ok: false, reason: LOCK_TIP };
    var kind = opts.kind || "gun";
    var lookup = opts.lookup;
    if (kind === "focus") {
      var fname = character.instrument || "focus";
      if (!character.instrument) return { ok: false, reason: "No instrument.", name: fname };
      if (!opts.equipped) {
        character.focusEquipped = false;
        return { ok: true, name: fname, equipped: false, slot: "focus" };
      }
      if (character.focusEquipped === true) return { ok: true, name: fname, equipped: true, slot: "focus", carry: focusCarry(character).carry };
      var usedFocus = countSlots(character, lookup);
      if (usedFocus.focus >= LIMITS.focus) return { ok: false, reason: "Focus slot is full.", name: fname, slot: "focus" };
      character.focusEquipped = true;
      return { ok: true, name: fname, equipped: true, slot: "focus", carry: focusCarry(character).carry };
    }
    var index = Number(opts.index);
    var list = kind === "melee" ? (character.melee || []) : (character.guns || []);
    var row = list[index];
    if (!row || !row.weapon) return { ok: false, reason: "Empty slot.", name: "" };
    var weapon = lookupWeapon(row.weapon, lookup);
    var slot = kind === "melee" ? "melee" : slotOf(weapon);
    var name = (weapon && weapon.name) || row.name || row.weapon;
    if (!opts.equipped) {
      row.equipped = false;
      row.drawn = false;
      return { ok: true, name: name, equipped: false, slot: slot };
    }
    if (!slot) return { ok: false, reason: "That item has no equip slot.", name: name };
    if (row.equipped === true) return { ok: true, name: name, equipped: true, slot: slot };
    var used = countSlots(character, lookup);
    if (used[slot] >= LIMITS[slot]) return { ok: false, reason: slotLabel(slot) + " slot is full.", name: name, slot: slot };
    row.equipped = true;
    var extra = { ok: true, name: name, equipped: true, slot: slot };
    if (slot === "pistol") extra.draw = drawCheck(character, index, lookup);
    return extra;
  }

  function tryAutoEquip(character, opts) {
    opts = opts || {};
    var kind = opts.kind || "gun";
    if (locked(opts)) {
      if (kind === "focus") character.focusEquipped = false;
      else {
        var blocked = (kind === "melee" ? character.melee : character.guns) || [];
        var brow = blocked[Number(opts.index)];
        if (brow) brow.equipped = false;
      }
      return { ok: false, equipped: false, reason: LOCK_TIP };
    }
    if (kind === "focus") {
      character.focusEquipped = false;
      if (!character.instrument) return { ok: true, equipped: false };
      return setEquipped(character, { kind: "focus", equipped: true, lookup: opts.lookup, combat: false });
    }
    var list = kind === "melee" ? (character.melee || []) : (character.guns || []);
    var row = list[Number(opts.index)];
    if (!row || !row.weapon) return { ok: false, equipped: false };
    row.equipped = false;
    var result = setEquipped(character, { kind: kind, index: opts.index, equipped: true, lookup: opts.lookup, combat: false });
    if (!result.ok) row.equipped = false;
    return result;
  }

  function migrate(character, lookup) {
    if (!character) return { ok: false };
    if (character.equipRule === "L0170") return { ok: true, skipped: true };
    (character.guns || []).forEach(function (g, i) {
      if (!g) return;
      g.equipped = false;
      if (g.weapon) tryAutoEquip(character, { kind: "gun", index: i, lookup: lookup, combat: false });
    });
    (character.melee || []).forEach(function (m, i) {
      if (!m) return;
      m.equipped = false;
      if (m.weapon) tryAutoEquip(character, { kind: "melee", index: i, lookup: lookup, combat: false });
    });
    character.focusEquipped = false;
    if (character.instrument) tryAutoEquip(character, { kind: "focus", lookup: lookup, combat: false });
    character.equipRule = "L0170";
    return { ok: true, counts: countSlots(character, lookup) };
  }

  function badgeRows(guns) {
    var rows = [];
    (guns || []).forEach(function (g, i) {
      if (!g || g.equipped !== true) return;
      var cap = Number(g.cap != null ? g.cap : g.capacity) || 0;
      if (!cap) return;
      var loaded = Number(g.loaded);
      if (!isFinite(loaded)) loaded = 0;
      var group = g.group || g.icon || "";
      rows.push({
        index: g.index != null ? g.index : i,
        name: g.name || "",
        group: group,
        icon: iconFor(group),
        loaded: loaded,
        cap: cap,
        svg: ICONS[iconFor(group)] || ICONS.pistol,
        /* 0.3.64: the round that fires next in this gun (SSDNSAmmoDisplay.roundLook), for the token badge */
        look: g.look || null
      });
    });
    return rows;
  }

  function badgeRowsForToken(guns) {
    return badgeRows((guns || []).map(function (g) {
      if (!g || g.equipped != null) return g;
      var copy = {};
      Object.keys(g).forEach(function (k) { copy[k] = g[k]; });
      copy.equipped = true;
      return copy;
    }));
  }

  function chatOpenKey(role) {
    return role === "dm" ? CHAT_KEYS.dm : CHAT_KEYS.player;
  }

  function readChatOpen(storage, role) {
    var key = chatOpenKey(role);
    try {
      var specific = storage.getItem(key);
      if (specific === "0" || specific === "1") return specific === "1";
      var old = storage.getItem(OLD_CHAT_KEY);
      if (old === "0" || old === "1") {
        storage.setItem(key, old);
        return old === "1";
      }
    } catch (e) {}
    return true;
  }

  function writeChatOpen(storage, role, open) {
    try { storage.setItem(chatOpenKey(role), open ? "1" : "0"); } catch (e) {}
  }

  root.SSDNSEquip = {
    LIMITS: LIMITS,
    LOCK_TIP: LOCK_TIP,
    CHAT_KEYS: CHAT_KEYS,
    OLD_CHAT_KEY: OLD_CHAT_KEY,
    ICONS: ICONS,
    slotOf: slotOf,
    iconFor: iconFor,
    pistolCovers: pistolCovers,
    countSlots: countSlots,
    combatActive: combatActive,
    combatLocked: function () { return combatOn; },
    setCombat: function (on) { combatOn = !!on; return combatOn; },
    focusCarry: focusCarry,
    drawCheck: drawCheck,
    setEquipped: setEquipped,
    tryAutoEquip: tryAutoEquip,
    migrate: migrate,
    badgeRows: badgeRows,
    badgeRowsForToken: badgeRowsForToken,
    chatOpenKey: chatOpenKey,
    readChatOpen: readChatOpen,
    writeChatOpen: writeChatOpen,
    lookupWeapon: lookupWeapon
  };
})(typeof window !== "undefined" ? window : globalThis);

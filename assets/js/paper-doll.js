/* SSDNS paper doll (sheet 0.3.54). Art Bot take B6: frame + silhouette + 25 slot boxes.
   Worn slots hold Items (item.equipSlot). Weapon slots mirror the Gear tab.
   Only slotted (and, if needed, attuned) items give bonuses. Holster rigs don't stack. Dex caps at 20. */
(function (root) {
  "use strict";
  var W = 1080, H = 1350;
  /* 2026-10-19 layout: every slot's label plate sits centered directly above its box, so each box keeps a
     clear band above it (>= 38 of 1350) that no other box or plate uses. Trinkets share one "Trinkets" plate per group. */
  var BOX = {
    hat: [485, 150, 110, 110], neck: [485, 300, 110, 110], coat: [405, 455, 110, 110], vest: [565, 455, 110, 110],
    gunbelt: [485, 605, 110, 110], holster_l: [330, 615, 110, 110], holster_r: [640, 615, 110, 110], gloves: [345, 770, 110, 110],
    chaps: [485, 790, 110, 110], boots: [485, 1060, 110, 110],
    accessory_1: [74, 110, 120, 120], accessory_2: [74, 240, 120, 120], accessory_3: [214, 110, 120, 120], accessory_4: [214, 240, 120, 120],
    accessory_5: [876, 110, 120, 120], accessory_6: [806, 240, 120, 120], accessory_7: [736, 110, 120, 120], accessory_8: [736, 410, 120, 120],
    ring_1: [74, 410, 120, 120], ring_2: [876, 410, 120, 120],
    revolver_1: [74, 680, 130, 130], revolver_2: [876, 680, 130, 130], long_gun: [74, 860, 130, 290], melee: [214, 860, 130, 290],
    focus_borrowed_iron: [736, 860, 270, 290]
  };
  /* One shared plate over each trinket group: [centerX, topOfGroup]. */
  var TRINKET_HEADS = [[204, 110], [866, 110]];
  var PLATE_BAND = 38;
  var COUNTER = [240, 1158, 235, 174];
  var SIL = [310, 118, 460, 1080];
  /* label, accepted item.wear values, kind */
  var SLOTS = {
    hat: ["Head", ["head", "hat", "helm"]], neck: ["Neck", ["neck", "amulet"]], coat: ["Cloak", ["cloak", "coat"]],
    vest: ["Armor", ["armor", "body", "vest"]], gunbelt: ["Belt", ["belt", "gunbelt", "bandolier"]],
    holster_l: ["Holster rig 1", ["holster", "rig"]], holster_r: ["Holster rig 2", ["holster", "rig"]],
    gloves: ["Gloves", ["gloves", "hands"]], chaps: ["Legs", ["legs", "chaps"]], boots: ["Boots", ["boots", "feet"]],
    ring_1: ["Ring", ["ring"]], ring_2: ["Ring", ["ring"]], accessory_8: ["Shield", ["shield"]]
  };
  for (var a = 1; a <= 7; a++) SLOTS["accessory_" + a] = ["Trinket", ["trinket", "accessory", ""]];
  var WEAPON_SLOTS = { revolver_1: "Pistol L", revolver_2: "Pistol R", long_gun: "Long gun", melee: "Melee", focus_borrowed_iron: "Focus" };
  /* pd-labels: the plate shown on each box (display only; SLOTS[k][0] stays for messages). */
  var LABELS = {
    hat: "Hat", neck: "Neck", coat: "Coat", vest: "Vest/Armor", gunbelt: "Belt", holster_l: "Holster L", holster_r: "Holster R",
    gloves: "Gloves", chaps: "Chaps", boots: "Boots", ring_1: "Ring 1", ring_2: "Ring 2", accessory_8: "Shield",
    revolver_1: "Pistol L", revolver_2: "Pistol R", long_gun: "Long gun", melee: "Melee", focus_borrowed_iron: "Focus"
  };
  for (var t = 1; t <= 7; t++) LABELS["accessory_" + t] = "";  /* covered by the shared Trinkets plate */
  function isTrinket(key) { return /^accessory_[1-7]$/.test(key); }
  /* Faint line glyphs for empty slots (and filled slots with no art yet). viewBox 0 0 48 48, stroke = currentColor. */
  var G = {
    hat: "M6 32c6 3 30 3 36 0M12 31c0-9 2-17 6-18 3-1 4 2 6 2s3-3 6-2c4 1 6 9 6 18",
    neck: "M10 12c4 10 24 10 28 0M14 18l10 18 10-18M20 26h8",
    coat: "M16 8l-8 6v26h10V20l6 8 6-8v20h10V14l-8-6-8 10z",
    vest: "M17 8l-5 6v24l12 4 12-4V14l-5-6-7 12z M24 20v20",
    gunbelt: "M6 20h36v8H6zM20 18h8v12h-8zM10 28v6M14 28v6M34 28v6M38 28v6",
    holster: "M18 8h12v8l-2 22-5 4-3-4-2-22zM16 16h16",
    gloves: "M14 40V22l-3-6 3-2 4 5V8h3v12V6h3v14V8h3v14l4-8 3 2-5 13v11z",
    chaps: "M14 8h20l2 32h-8l-4-22-4 22h-8z",
    boots: "M16 6h10v24l12 4v6H12l2-10zM12 40h26",
    ring: "M24 18a10 10 0 1 0 .1 0zM19 14l5-6 5 6",
    trinket: "M24 8a14 14 0 1 0 .1 0zM24 15a7 7 0 1 0 .1 0z",
    shield: "M24 6l14 5v12c0 9-6 15-14 19C16 38 10 32 10 23V11z",
    pistol: "M6 18h28l4-3h4v6l-6 2-4 9h-7l2-8H6z",
    long: "M24 4v40M21 8h6v6h-6zM20 30h8l-2 12h-4z",
    melee: "M24 4l3 6v22h-6V10zM16 32h16M22 32h4v10h-4z",
    focus: "M30 6l6 6-8 8M28 20a8 8 0 1 1-12 0 9 9 0 1 1 12 0zM20 26h.1"
  };
  function glyphKey(key) {
    if (/^accessory_[1-7]$/.test(key)) return "trinket";
    return { holster_l: "holster", holster_r: "holster", ring_1: "ring", ring_2: "ring", accessory_8: "shield", revolver_1: "pistol", revolver_2: "pistol", long_gun: "long", focus_borrowed_iron: "focus" }[key] || key;
  }
  function glyph(key) {
    var d = G[glyphKey(key)] || G.trinket;
    return '<svg class="doll-glyph" viewBox="0 0 48 48" aria-hidden="true"><path d="' + d + '"/></svg>';
  }
  /* Short display name: drop the PHB parenthetical, e.g. "Bowie (shortsword)" -> "Bowie". */
  function shortName(n) { return String(n || "").replace(/\s*\([^)]*\)\s*$/, "").replace(/^Navy \/ Army /, "") || String(n || ""); }
  function isDefaultArt(src) { return /items\/defaults\//.test(String(src || "")); }
  var AB = ["STR", "DEX", "CON", "INT", "WIS", "CHA"];

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (ch) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]; }); }
  function R() { return root.SSDNS_RULES || {}; }
  function byId(list, id) { return (list || []).filter(function (x) { return x && x.id === id; })[0] || null; }
  function items(c) { return (c && Array.isArray(c.items)) ? c.items : []; }
  /* A pair holster item (holsterPair: true, or slots: [holster_l, holster_r]) sits in holster_l and covers both sides. */
  function isPairItem(it) {
    if (!it) return false;
    if (it.holsterPair === true) return true;
    var s = it.slots;
    return Array.isArray(s) && s.indexOf("holster_l") >= 0 && s.indexOf("holster_r") >= 0;
  }
  function inSlot(c, key) {
    var list = items(c);
    var hit = list.filter(function (it) { return it && it.equipSlot === key; })[0] || null;
    if (!hit && key === "holster_r") hit = list.filter(function (it) { return it && it.equipSlot === "holster_l" && isPairItem(it); })[0] || null;
    return hit;
  }
  function base() {
    try { if ((root.location && root.location.pathname || "").indexOf("/dm/") >= 0) return "../"; } catch (e) {}
    return "";
  }
  function img(name) { return base() + "assets/images/doll/" + name; }
  function wearOf(it) { return String((it && it.wear) || "").toLowerCase(); }
  function fits(it, key) {
    var s = SLOTS[key]; if (!s || !it) return false;
    if (it.type === "consumable" || it.type === "scroll" || it.type === "explosive" || it.type === "weapon" && key !== "accessory_8") return false;
    return s[1].indexOf(wearOf(it)) >= 0;
  }
  function active(it) { return !!it && !!it.equipSlot && (!it.attune || !!it.attuned); }

  /* Put item uid into slot key (or clear with uid ""). One item per slot. */
  function equip(c, key, uid) {
    if (!SLOTS[key]) return { ok: false, reason: "Not a worn slot." };
    var cur = inSlot(c, key);
    if (!uid) { if (cur) { if (cur.cursed) return { ok: false, reason: "Cursed. It won't come off." }; cur.equipSlot = ""; } return { ok: true }; }
    var it = items(c).filter(function (x) { return x && x.uid === uid; })[0];
    if (!it) return { ok: false, reason: "No item." };
    if (!fits(it, key)) return { ok: false, reason: it.name + " doesn't go in the " + SLOTS[key][0] + " slot." };
    if (isPairItem(it) && (key === "holster_l" || key === "holster_r")) {
      /* Pair: clear both sides (items and PHB pickers), then sit in holster_l covering both. */
      var l = inSlot(c, "holster_l"), r = inSlot(c, "holster_r");
      if ((l && l !== it && l.cursed) || (r && r !== it && r.cursed)) return { ok: false, reason: "Cursed. It won't come off." };
      if (l && l !== it) l.equipSlot = "";
      if (r && r !== it) r.equipSlot = "";
      c.holster = ""; c.holsterR = "";
      it.equipSlot = "holster_l";
      return { ok: true, item: it, pair: true };
    }
    if (cur && cur !== it) { if (cur.cursed) return { ok: false, reason: "Cursed. It won't come off." }; cur.equipSlot = ""; }
    it.equipSlot = key;
    return { ok: true, item: it };
  }

  /* Gear "Wear" toggle (2026-10-19). Shown for items with a worn place (item.wear) or already in a slot. */
  function wearable(it) {
    if (!it) return false;
    if (it.equipSlot) return true;
    if (!wearOf(it)) return false;
    return Object.keys(SLOTS).some(function (k) { return fits(it, k); });
  }
  function slotName(key) {
    if (isTrinket(key)) return "Trinket";
    return LABELS[key] || (SLOTS[key] && SLOTS[key][0]) || key;
  }
  /* First empty slot the item fits (pairs prefer holster_l); if all are full, the first slot it fits. */
  function wearSlot(c, it) {
    var keys = Object.keys(SLOTS).filter(function (k) { return fits(it, k); });
    if (isPairItem(it)) keys = keys.filter(function (k) { return k === "holster_l"; });
    var free = keys.filter(function (k) {
      if (inSlot(c, k)) return false;
      if (k === "holster_l" && c && c.holster) return false;
      if (k === "holster_r" && c && c.holsterR) return false;
      if (k === "vest" && c && c.armor) return false;
      if (k === "accessory_8" && c && c.shield) return false;
      return true;
    });
    return free[0] || keys[0] || "";
  }
  function toggleWear(c, uid) {
    var it = items(c).filter(function (x) { return x && x.uid === uid; })[0];
    if (!it) return { ok: false, reason: "No item." };
    if (it.equipSlot) {
      if (it.cursed) return { ok: false, reason: "Cursed. It won't come off." };
      it.equipSlot = "";
      return { ok: true, worn: false };
    }
    var key = wearSlot(c, it);
    if (!key) return { ok: false, reason: it.name + " has no slot on the paper doll." };
    var r = equip(c, key, uid);
    if (r.ok) r.slot = key;
    return r;
  }
  function wornLabel(c, it) {
    if (!it || !it.equipSlot) return "";
    if (isPairItem(it) && it.equipSlot === "holster_l") return "Holster L + R";
    return slotName(it.equipSlot);
  }

  /* 0.3.54: weapon slots are pickers. c.dollWeapons maps slot -> gun/melee index. */
  function gunRows(c) {
    var rr = R();
    return ((c && c.guns) || []).map(function (g, i) {
      var w = g && g.weapon && (byId(rr.firearms, g.weapon) || byId(rr.casterGuns, g.weapon) || byId(rr.otherRanged, g.weapon));
      /* pd-labels: caster guns (Blacksnake, Hognose) ride in the pistol slots. */
      return w ? { kind: "gun", i: i, w: w, g: g, id: g.weapon, name: w.name, pistol: w.group === "pistol" || w.group === "caster", equipped: g.equipped !== false } : null;
    }).filter(Boolean);
  }
  function meleeRows(c) {
    var rr = R();
    return ((c && c.melee) || []).map(function (m, i) {
      if (!m || !m.weapon) return null;
      var w = byId(rr.melee, m.weapon);
      return { kind: "melee", i: i, w: w, g: m, id: m.weapon, name: w ? w.name : m.weapon, equipped: m.equipped !== false };
    }).filter(Boolean);
  }
  function weaponOptions(c, key) {
    if (key === "melee") return meleeRows(c);
    var guns = gunRows(c);
    if (key === "revolver_1" || key === "revolver_2") return guns.filter(function (x) { return x.pistol; });
    if (key === "long_gun") return guns.filter(function (x) { return !x.pistol && x.id !== "borrowed-iron"; });
    return [];
  }
  function weaponRow(c, key) {
    var map = (c && c.dollWeapons) || {};
    var opts = weaponOptions(c, key);
    /* Pistol L / R follow the same side map the draw check and first-shot bonus use. */
    var E = root.SSDNSEquip;
    if ((key === "revolver_1" || key === "revolver_2") && E && E.pistolSides) {
      var sides = E.pistolSides(c), want = key === "revolver_1" ? sides.L : sides.R;
      return want == null ? null : (opts.filter(function (x) { return x.i === want; })[0] || null);
    }
    if (map[key] != null && map[key] !== "") {
      var hit = opts.filter(function (x) { return String(x.i) === String(map[key]); })[0];
      if (hit) return hit.equipped ? hit : null;
    }
    var taken = {};
    Object.keys(map).forEach(function (k) { if (k !== key && k !== "melee" && map[k] != null && map[k] !== "") taken[String(map[k])] = 1; });
    if (key === "melee") return opts.filter(function (x) { return x.equipped && !taken[String(x.i)]; })[0] || null;
    var free = opts.filter(function (x) { return x.equipped && !taken[String(x.i)]; });
    if (key === "revolver_2") {
      var first = weaponRow(c, "revolver_1");
      free = free.filter(function (x) { return !first || x.i !== first.i; });
    }
    return free[0] || null;
  }
  /* Instruments you own: the focus one plus Items tagged instrument:<id>. */
  function instrumentId(it) {
    var tags = (it && Array.isArray(it.tags)) ? it.tags : [];
    for (var i = 0; i < tags.length; i++) { var m = /^instrument:(.+)$/.exec(String(tags[i])); if (m) return m[1]; }
    var cid = String((it && it.catalogId) || "");
    return /^instrument-/.test(cid) ? cid.slice(11) : "";
  }
  function instruments(c) {
    var rr = R(), list = (rr.storytellerGear && rr.storytellerGear.instruments) || [];
    var out = [];
    if (c && c.instrument) { var f = byId(list, c.instrument); out.push({ id: c.instrument, name: f ? f.name : c.instrument, quality: c.instrumentQuality || "cheap", focus: true, uid: "" }); }
    items(c).forEach(function (it) {
      var id = instrumentId(it); if (!id) return;
      var r = byId(list, id);
      out.push({ id: id, name: r ? r.name : it.name, quality: it.quality || "cheap", focus: false, uid: it.uid });
    });
    return out;
  }
  /* Swap an owned instrument item into the focus slot; the old focus becomes an item. */
  function makeFocus(c, uid) {
    if (!c) return { ok: false, reason: "No character." };
    var list = items(c), idx = -1;
    for (var i = 0; i < list.length; i++) if (list[i] && list[i].uid === uid) idx = i;
    if (idx < 0) return { ok: false, reason: "No instrument." };
    var it = list[idx], id = instrumentId(it);
    if (!id) return { ok: false, reason: it.name + " isn't an instrument." };
    var oldId = c.instrument, oldQ = c.instrumentQuality || "cheap";
    list.splice(idx, 1);
    if (oldId) {
      var rr = R(), r = byId(rr.storytellerGear && rr.storytellerGear.instruments, oldId);
      var row = { id: "instrument-" + oldId, name: r ? r.name : oldId, type: "gear", tags: ["instrument:" + oldId], quality: oldQ, description: "Instrument (focus). Swap it into the focus slot on Gear.", effect: { kind: "text", text: "Spellcasting focus (Storyteller)." } };
      if (root.SSDNSItems && root.SSDNSItems.add) root.SSDNSItems.add(c, row, { dm: true });
      else { row.uid = "i" + Date.now().toString(36); list.push(row); }
    }
    c.instrument = id; c.instrumentQuality = it.quality || "cheap";
    c.instrumentWear = "ok";
    return { ok: true, id: id };
  }
  /* Point a weapon slot at gun/melee index (or "" to clear). Sets Equipped to match. */
  function setWeapon(c, key, ref) {
    if (!WEAPON_SLOTS[key] || key === "focus_borrowed_iron") return { ok: false, reason: "Not a weapon slot." };
    c.dollWeapons = c.dollWeapons || {};
    var Equip = root.SSDNSEquip;
    if (ref === "" || ref == null) {
      var cur = weaponRow(c, key);
      c.dollWeapons[key] = "";
      if (cur) {
        var r0 = Equip && Equip.setEquipped ? Equip.setEquipped(c, { kind: cur.kind, index: cur.i, equipped: false }) : (cur.g.equipped = false, { ok: true });
        if (r0 && !r0.ok) return r0;
      }
      return { ok: true };
    }
    var pick = weaponOptions(c, key).filter(function (x) { return String(x.i) === String(ref); })[0];
    if (!pick) return { ok: false, reason: "That weapon doesn't go in the " + WEAPON_SLOTS[key] + " slot." };
    var prev = weaponRow(c, key);
    if (prev && prev.i !== pick.i && prev.kind === pick.kind && pick.g.equipped === false) {
      if (Equip && Equip.setEquipped) Equip.setEquipped(c, { kind: prev.kind, index: prev.i, equipped: false }); else prev.g.equipped = false;
    }
    if (Equip && Equip.setEquipped) { var r1 = Equip.setEquipped(c, { kind: pick.kind, index: pick.i, equipped: true }); if (r1 && !r1.ok) return r1; }
    else pick.g.equipped = true;
    Object.keys(c.dollWeapons).forEach(function (k) { if (k !== key && String(c.dollWeapons[k]) === String(pick.i) && (k === "melee") === (pick.kind === "melee")) c.dollWeapons[k] = ""; });
    c.dollWeapons[key] = pick.i;
    return { ok: true, row: pick };
  }
  function weaponName(c, key) {
    var guns = (c && c.guns) || [];
    if (key === "focus_borrowed_iron") {
      if (guns.some(function (g) { return g && g.weapon === "borrowed-iron"; })) return "Borrowed Iron";
      var ins = c && c.instrument && byId(R().storytellerGear && R().storytellerGear.instruments, c.instrument);
      return ins ? ins.name : "";
    }
    var row = weaponRow(c, key);
    return row ? row.name : "";
  }
  function weaponArt(c, key) {
    var A = root.SSDNSWeaponArt;
    if (key === "focus_borrowed_iron") {
      var guns = (c && c.guns) || [];
      if (guns.some(function (g) { return g && g.weapon === "borrowed-iron"; })) return A && A.srcFor ? (A.srcFor({ id: "borrowed-iron", name: "Borrowed Iron" }) || "") : "";
      var IA = root.SSDNSInstrumentArt;
      if (c && c.instrument && IA && IA.srcFor) { try { return IA.srcFor({ id: c.instrument, quality: c.instrumentQuality, name: weaponName(c, key) }) || ""; } catch (e) { return ""; } }
      return "";
    }
    var row = weaponRow(c, key);
    if (!row || !A || !A.srcFor) return "";
    try { return A.srcFor({ id: row.id, name: row.name }) || ""; } catch (e) { return ""; }
  }

  function num(x) { var n = Number(x); return isFinite(n) ? n : 0; }
  /* Bonus math from slotted gear. Returned to compute() in app.js. */
  function bonuses(c) {
    var out = { abilities: {}, ac: 0, init: 0, speed: 0, holsterDex: 0, holsterInit: 0, shieldOff: false, sources: [] };
    var twoHanded = false;
    items(c).forEach(function (it) {
      if (!active(it)) return;
      var b = it.bonuses || {};
      var rig = /^holster_/.test(it.equipSlot);
      if (rig) {
        out.holsterDex = Math.max(out.holsterDex, num(b.dex || b.DEX));
        out.holsterInit = Math.max(out.holsterInit, num(b.init || b.initiative));
      } else {
        AB.forEach(function (k) { var n = num(b[k] || b[k.toLowerCase()]); if (n) out.abilities[k] = (out.abilities[k] || 0) + n; });
        out.ac += num(b.ac || b.AC); out.init += num(b.init || b.initiative); out.speed += num(b.speed);
      }
      if (it.weapon && /two-handed/i.test(String(it.weapon.properties || ""))) twoHanded = true;
      out.sources.push(it.name);
    });
    ((c && c.melee) || []).forEach(function (m) {
      if (!m || !m.weapon || m.equipped === false) return;
      var w = byId(R().melee, m.weapon);
      if (w && /two-handed/i.test(String(w.properties || ""))) twoHanded = true;
    });
    out.twoHanded = twoHanded;
    out.shieldOff = twoHanded && (!!(c && c.shield) || !!inSlot(c, "accessory_8"));
    var sh = inSlot(c, "accessory_8");
    if (sh && active(sh) && twoHanded) out.ac -= num((sh.bonuses || {}).ac || (sh.bonuses || {}).AC);
    return out;
  }
  /* Raise a score by a bonus, capped at 20 (never lowers a score already above 20). */
  function capped(score, bonus) { if (!bonus) return score; var n = score + bonus; return bonus > 0 ? Math.max(score, Math.min(20, n)) : n; }

  function pct(b) { return "left:" + (b[0] / W * 100) + "%;top:" + (b[1] / H * 100) + "%;width:" + (b[2] / W * 100) + "%;height:" + (b[3] / H * 100) + "%"; }
  function artFor(it) {
    if (root.SSDNSItems && root.SSDNSItems.artSrc) { var s = root.SSDNSItems.artSrc(it); if (s) return s; }
    return "";
  }
  function html(c, opts) {
    opts = opts || {};
    var ro = !!opts.readOnly;
    var parts = ['<div class="doll' + (ro ? " doll-ro" : "") + '" style="background-image:url(' + img("frame-B6-clean-1080x1350.webp") + ')">',
      '<img class="doll-sil" alt="" src="' + img("silhouette-600x1100.webp") + '" style="' + pct(SIL) + '">'];
    var rr = R(), E = root.SSDNSEquip;
    var isBelt = function (h) { return !!h && (E && E.isBeltHolster ? E.isBeltHolster(h) : /belt|bandolier/i.test(h.id)); };
    var isPair = function (h) { return !!h && !!(E && E.isPairHolster && E.isPairHolster(h)); };
    var holL = c && c.holster ? byId(rr.holsters, c.holster) : null, holR = c && c.holsterR ? byId(rr.holsters, c.holsterR) : null;
    /* Old saves not yet migrated may still keep a belt in c.holster. */
    var beltRow = (c && c.belt ? byId(rr.holsters, c.belt) : null) || (isBelt(holL) ? holL : null);
    if (isBelt(holL)) holL = null;
    var pairWorn = inSlot(c, "holster_l");
    pairWorn = pairWorn && isPairItem(pairWorn);
    Object.keys(BOX).forEach(function (key) {
      var b = BOX[key], tall = b[3] > 200, label = isTrinket(key) ? "" : (LABELS[key] || (SLOTS[key] ? SLOTS[key][0] : WEAPON_SLOTS[key])), name = "", art = "", filled = false, cls = "", src = "";
      if (WEAPON_SLOTS[key]) {
        name = weaponName(c, key); filled = !!name; cls = " doll-weapon"; art = filled ? weaponArt(c, key) : "";
        src = key === "focus_borrowed_iron" ? "Gear: Focus" : "Gear: Weapons";
      } else {
        var it = inSlot(c, key);
        if (key === "vest" && !it && c && c.armor) { var ar = byId(rr.armor, c.armor); if (ar && ar.category !== "shield") { name = ar.name; src = "Gear: Armor"; } }
        if (key === "accessory_8" && !it && c && c.shield) { name = "Shield"; src = "Gear: Shield"; }
        /* Holster L / Holster R mirror the two Gear pickers; Belt mirrors the Belt picker (or the Gun belt box). */
        if (key === "holster_l" && !it && holL) { name = holL.name; src = "Gear: Holster L"; if (isPair(holL) && holR === holL) cls += " doll-pair doll-pair-l"; }
        if (key === "holster_r" && !it && holR) { name = holR.name; src = "Gear: Holster R"; if (isPair(holR) && holR === holL) cls += " doll-pair doll-pair-r"; }
        if ((key === "holster_l" || key === "holster_r") && it && pairWorn) cls += " doll-pair doll-pair-" + (key === "holster_l" ? "l" : "r");
        if (key === "gunbelt" && !it && (beltRow || (c && c.gunBelt))) { name = beltRow ? beltRow.name : "Gun belt"; src = beltRow ? "Gear: Belt" : "Gear: Gun belt box"; }
        if (it) { name = it.name; art = artFor(it); src = "Item"; if (it.attune && !it.attuned) cls += " doll-unattuned"; }
        if (isDefaultArt(art)) art = "";
        filled = !!name;
        if (key === "accessory_8" && filled && bonuses(c).shieldOff) cls += " doll-off";
      }
      /* 0.3.54: 9-slice the square tile so tall/wide slots keep true corners. */
      var tile = filled ? "slot-256-filled.webp" : "slot-256.webp";
      if (tall) cls += b[2] > 200 ? " doll-wide" : " doll-tall";
      if (filled && !art) cls += " doll-noart";
      var tip = (label || "Trinket") + (name ? ": " + name + (src ? " (" + src + ")" : "") : " (empty)");
      if (key === "revolver_1") tip += " · draws from Holster L";
      if (key === "revolver_2") tip += " · draws from Holster R";
      parts.push('<div class="doll-cell' + (isTrinket(key) ? " doll-trinket" : "") + '" style="' + pct(b) + '">' +
        '<' + (ro ? "div" : "button type=\"button\"") + ' class="doll-slot doll-9' + (filled ? " filled" : "") + cls + '" data-doll-slot="' + key + '" style="border-image-source:url(' + img(tile) + ')" title="' + esc(tip) + '" aria-label="' + esc(tip) + '">' +
        (art ? '<img class="doll-art" alt="" src="' + esc(art) + '">' : glyph(key)) +
        (filled ? '<span class="doll-name">' + esc(shortName(name)) + "</span>" : "") +
        "</" + (ro ? "div" : "button") + ">" +
        (label ? '<span class="doll-label" aria-hidden="true">' + esc(label) + "</span>" : "") + "</div>");
    });
    TRINKET_HEADS.forEach(function (h) {
      parts.push('<span class="doll-label doll-group-label" aria-hidden="true" style="left:' + (h[0] / W * 100) + "%;top:" + (h[1] / H * 100) + '%">Trinkets</span>');
    });
    var es = opts.es != null ? opts.es : "";
    parts.push('<div class="doll-counter" style="' + pct(COUNTER) + '"><span class="doll-es">' + esc(es) + '</span><span class="doll-es-unit">ES</span></div>');
    parts.push("</div>");
    return parts.join("");
  }

  function opt(v, label, cur) { return '<option value="' + esc(v) + '"' + (String(v) === String(cur || "") ? " selected" : "") + ">" + esc(label) + "</option>"; }
  function weaponPicker(c, key) {
    var label = WEAPON_SLOTS[key], btn = function (attr, text, on) { return '<button type="button" class="btn sm' + (on ? " btn-primary" : "") + '" ' + attr + ">" + esc(text) + "</button>"; };
    var rows = "", hint = "";
    if (key === "focus_borrowed_iron") {
      var ins = instruments(c);
      rows = ins.map(function (x) {
        return x.focus ? btn("data-doll-noop", x.name + " · focus", true) : btn('data-doll-focus="' + esc(x.uid) + '"', "Make focus: " + x.name + (x.quality === "quality" ? " (quality)" : ""), false);
      }).join(" ");
      if (((c && c.guns) || []).some(function (g) { return g && g.weapon === "borrowed-iron"; })) rows = btn("data-doll-noop", "Borrowed Iron", true) + " " + rows;
      hint = "Your focus is your Calling instrument (or Borrowed Iron). Extra instruments wait in Items.";
    } else {
      var cur = weaponRow(c, key);
      rows = weaponOptions(c, key).map(function (x) {
        return btn('data-doll-weapon="' + x.i + '"', x.name + (x.equipped ? "" : " · packed"), !!cur && cur.i === x.i);
      }).join(" ");
      if (cur) rows += " " + btn('data-doll-weapon=""', "Unequip", false);
      hint = "Picking a weapon here sets it Equipped on Gear.";
    }
    return '<div class="doll-pick" data-doll-pick="' + key + '"><b>' + esc(label) + "</b> " + (rows || '<span class="fine">Nothing you carry fits here.</span>') +
      ' <button type="button" class="btn sm" data-doll-close>Close</button><p class="fine">' + esc(hint) + "</p></div>";
  }
  function pickerHtml(c, key) {
    if (WEAPON_SLOTS[key]) return weaponPicker(c, key);
    var label = SLOTS[key][0];
    var cur = inSlot(c, key);
    var list = items(c).filter(function (it) { return fits(it, key) && (!it.equipSlot || it.equipSlot === key); });
    var att = root.SSDNSItems && root.SSDNSItems.attunedCount ? root.SSDNSItems.attunedCount(c) + " / " + root.SSDNSItems.attuneCap(c) : "";
    var rows = list.map(function (it) {
      return '<button type="button" class="btn sm' + (cur === it ? " btn-primary" : "") + '" data-doll-put="' + esc(it.uid) + '">' + esc(it.name) + (it.attune ? (it.attuned ? " · attuned" : " · needs attunement") : "") + "</button>";
    }).join(" ");
    var rr = R(), extra = "";
    if (key === "vest") {
      extra = '<label class="tiny">PHB armor <select data-doll-armor>' + opt("", "None", c.armor) + (rr.armor || []).filter(function (a) { return a && a.category !== "shield"; }).map(function (a) { return opt(a.id, a.name, c.armor); }).join("") + "</select></label>";
    } else if (key === "accessory_8") {
      extra = '<button type="button" class="btn sm' + (c.shield ? " btn-primary" : "") + '" data-doll-shield>' + (c.shield ? "PHB shield: on" : "PHB shield: off") + "</button>";
    } else if (key === "holster_l" || key === "holster_r") {
      var fld = key === "holster_r" ? "holsterR" : "holster", E0 = root.SSDNSEquip;
      extra = '<label class="tiny">' + (key === "holster_r" ? "Holster R" : "Holster L") + ' <select data-doll-holster="' + fld + '">' + opt("", "None", c[fld]) +
        (rr.holsters || []).filter(function (h) { return h.isRig !== false; }).map(function (h) { return opt(h.id, h.name + (E0 && E0.isPairHolster && E0.isPairHolster(h) ? " (fills L + R)" : ""), c[fld]); }).join("") + "</select></label>";
    } else if (key === "gunbelt") {
      extra = '<label class="tiny">Belt <select data-doll-belt>' + opt("", "None", c.belt) + (rr.holsters || []).filter(function (h) { return h.isRig === false; }).map(function (h) { return opt(h.id, h.name, c.belt); }).join("") + "</select></label>";
    }
    var hint = key === "vest" ? "Same as Armor on Gear; either one updates the other." : key === "accessory_8" ? "Same as the Shield box on Gear. A two-handed weapon turns a shield off." : key === "holster_l" ? "Same as Holster L on Gear. Pistol L draws from it and gets its first-shot bonus." : key === "holster_r" ? "Same as Holster R on Gear. Pistol R draws from it and gets its first-shot bonus." : key === "gunbelt" ? "Same as Belt on Gear. A gun belt or bandolier feeds Tactical Reload." : "";
    return '<div class="doll-pick" data-doll-pick="' + key + '"><b>' + esc(label) + "</b> " + (extra ? extra + " " : "") + (rows || (extra ? "" : '<span class="fine">Nothing you carry fits here.</span>')) +
      (cur ? ' <button type="button" class="btn sm" data-doll-put="">Take off</button>' : "") +
      ' <button type="button" class="btn sm" data-doll-close>Close</button>' +
      (hint ? '<p class="fine">' + esc(hint) + "</p>" : "") + (att ? '<p class="fine">Attuned ' + esc(att) + "</p>" : "") + "</div>";
  }

  var openKey = "";
  function character() { var d = root.SSDNSApp && root.SSDNSApp.doc && root.SSDNSApp.doc(); return d && d.character; }
  function esTotal() { try { var d = root.SSDNSApp.doc(); return root.SSDNSBridge && root.SSDNSBridge.cpValue ? root.SSDNSBridge.cpValue(d.shards) : ""; } catch (e) { return ""; } }
  function paint() {
    if (typeof document === "undefined") return;
    var c = character(); if (!c) return;
    var es = esTotal();
    var host = document.getElementById("dollHost");
    if (host) host.innerHTML = html(c, { es: es }) + (openKey && (SLOTS[openKey] || WEAPON_SLOTS[openKey]) ? pickerHtml(c, openKey) : "") + '<p class="fine doll-msg" id="dollMsg"></p>';
  }
  function msg(t) { var m = document.getElementById("dollMsg"); if (m) m.textContent = t || ""; }
  function commit(fn) {
    if (root.SSDNSApp && root.SSDNSApp.applyPatch) root.SSDNSApp.applyPatch(fn);
    else fn();
  }
  function wire() {
    if (typeof document === "undefined") return;
    document.addEventListener("click", function (e) {
      var mf = e.target.closest && e.target.closest("[data-make-focus]");
      if (mf) {
        var mu = mf.getAttribute("data-make-focus"), mr;
        commit(function () { mr = makeFocus(character(), mu); });
        if (mr && !mr.ok && root.SSDNSApp && root.SSDNSApp.toast) root.SSDNSApp.toast(mr.reason);
        return;
      }
      var host = document.getElementById("dollHost");
      if (!host || !host.contains(e.target)) return;
      var t = e.target.closest("[data-doll-slot],[data-doll-put],[data-doll-close],[data-doll-weapon],[data-doll-focus],[data-doll-shield]");
      if (!t) return;
      if (t.hasAttribute("data-doll-close")) { openKey = ""; paint(); return; }
      var res, key = openKey;
      if (t.hasAttribute("data-doll-put")) {
        var uid = t.getAttribute("data-doll-put");
        commit(function () { res = equip(character(), key, uid); });
      } else if (t.hasAttribute("data-doll-weapon")) {
        var ref = t.getAttribute("data-doll-weapon");
        commit(function () { res = setWeapon(character(), key, ref); });
      } else if (t.hasAttribute("data-doll-focus")) {
        var fu = t.getAttribute("data-doll-focus");
        commit(function () { res = makeFocus(character(), fu); });
      } else if (t.hasAttribute("data-doll-shield")) {
        commit(function () { var ch = character(); ch.shield = !ch.shield; res = { ok: true }; });
      }
      if (res) { if (res.ok) openKey = ""; paint(); if (!res.ok) msg(res.reason); return; }
      var k = t.getAttribute("data-doll-slot");
      if (!k) return;
      openKey = openKey === k ? "" : k; paint();
    });
  }
  function wireChange() {
    document.addEventListener("change", function (e) {
      var host = document.getElementById("dollHost");
      if (!host || !host.contains(e.target)) return;
      var t = e.target, f = t.hasAttribute("data-doll-armor") ? "armor" : t.hasAttribute("data-doll-holster") ? (t.getAttribute("data-doll-holster") || "holster") : t.hasAttribute("data-doll-belt") ? "belt" : "";
      if (!f) return;
      commit(function () {
        var ch = character(), E = root.SSDNSEquip;
        if ((f === "holster" || f === "holsterR") && E && E.setHolster) E.setHolster(ch, f === "holsterR" ? "R" : "L", t.value);
        else { ch[f] = t.value; if (f === "belt" && t.value) ch.gunBelt = true; }
      });
      openKey = ""; paint();
    });
  }
  if (typeof document !== "undefined") { if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wireChange); else wireChange(); }
  if (typeof document !== "undefined") { if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire); else wire(); }

  root.SSDNSDoll = { BOX: BOX, SLOTS: SLOTS, LABELS: LABELS, TRINKET_HEADS: TRINKET_HEADS, PLATE_BAND: PLATE_BAND, isPairItem: isPairItem, wearable: wearable, wearSlot: wearSlot, toggleWear: toggleWear, wornLabel: wornLabel, WEAPON_SLOTS: WEAPON_SLOTS, equip: equip, fits: fits, inSlot: inSlot, bonuses: bonuses, capped: capped, html: html, pickerHtml: pickerHtml, paint: paint, weaponName: weaponName, weaponArt: weaponArt, weaponOptions: weaponOptions, setWeapon: setWeapon, instruments: instruments, instrumentId: instrumentId, makeFocus: makeFocus };
})(typeof window !== "undefined" ? window : globalThis);

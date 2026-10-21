/* SSDNS paper doll (sheet 0.3.54; Duster Form frame 2026-10-19). Frame with the figure baked in + 25 slot boxes.
   Worn slots hold Items (item.equipSlot). Weapon slots mirror the Gear tab.
   Only slotted (and, if needed, attuned) items give bonuses. Holster rigs don't stack. Dex caps at 20. */
(function (root) {
  "use strict";
  var W = 1080, H = 1350;
  /* 2026-10-19 Duster Form layout (assets/images/doll/slot-map-duster-form.json): every slot's label plate sits centered directly above its box, so each box keeps a
     clear band above it (>= 38 of 1350) that no other box or plate uses. Trinkets share one "Trinkets" plate per group. */
  var BOX = {
    hat: [485, 161, 110, 110], neck: [485, 322, 110, 110], coat: [404, 485, 110, 110], vest: [567, 485, 110, 110],
    gloves: [235, 485, 110, 110], accessory_8: [735, 485, 110, 110], gunbelt: [485, 647, 110, 110], holster_l: [325, 647, 110, 110],
    holster_r: [645, 647, 110, 110], chaps: [485, 816, 110, 110], boots: [485, 1166, 110, 110], accessory_1: [80, 160, 120, 120],
    accessory_2: [222, 160, 120, 120], accessory_3: [80, 300, 120, 120], accessory_4: [222, 300, 120, 120], accessory_5: [738, 160, 120, 120],
    accessory_6: [880, 160, 120, 120], accessory_7: [880, 300, 120, 120], ring_1: [80, 492, 120, 120], ring_2: [880, 492, 120, 120],
    revolver_1: [75, 676, 130, 130], revolver_2: [875, 676, 130, 130], long_gun: [75, 882, 130, 290], melee: [230, 882, 130, 290],
    focus_borrowed_iron: [735, 882, 270, 290]
  };
  /* One shared plate over each trinket group: [centerX, topOfGroup]. */
  var TRINKET_HEADS = [[211, 160], [869, 160]];
  var PLATE_BAND = 38;
  var FRAME = "frame-duster-form-1080x1350.webp";
  var COUNTER = [80, 1196, 280, 92];
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
  /* Worn-gear art (Art Bot, Jessey-approved 2026-10-19): assets/img/items/gear/<file>.webp, 400x400 transparent.
     Specific art by PHB/catalog id first, then by name keywords, then the generic art for the slot. */
  var GEAR_ART_BY_ID = {
    /* PHB armor (rules.armor) */
    "thick-coat": "coat-duster", "leather-jacket": "armor-leather-vest", "studded-vest": "armor-studded-leather", "hide-wrap": "armor-leather-vest",
    "mail-undershirt": "armor-chain-shirt", "scale-coat": "armor-chain-shirt", "steel-vest": "armor-studded-leather", "heavy-leather-duster": "armor-heavy-leather-duster",
    "ring-coat": "armor-chain-shirt", "mail-duster": "armor-chain-shirt", "splint-harness": "armor-studded-leather", "iron-suit": "armor-chain-shirt",
    "shield-badge-board-cavalry-shield-rifle-plate": "shield",
    /* PHB holsters and belts (rules.holsters) */
    "slim-jim": "holster-hip", "mexican-loop": "holster-mexican-loop", "skeleton-rig": "holster-hip", "bridgeport-rig-swivel": "holster-hip",
    "concealed-vest-sleeve": "holster-shoulder-rig", "shoulder-rig": "holster-shoulder-rig", "cross-draw-holster": "holster-cross-draw",
    "pocket-holster": "holster-hip", "boot-holster": "holster-hip", "saddle-scabbard": "holster-pommel", "pommel-holsters-pair": "holster-pommel",
    "gun-belt-cartridge-loops": "belt-gun-belt", "bandolier": "belt-bandolier",
    /* Item catalog wearables */
    "ore-scholars-robe": "coat-cloak", "night-prospectors-cape": "coat-cloak", "ore-buyers-signet": "ring-eldorite", "prospectors-touch": "gloves-leather"
  };
  var GEAR_ART_WORDS = [
    [/locket/i, "trinket-eldorite-locket"], [/amulet|pendant|talisman|medallion/i, "neck-amulet"], [/bandana|kerchief|scarf|neckerchief/i, "neck-bandana"],
    [/duster/i, "coat-duster"], [/cloak|cape|robe|poncho|serape/i, "coat-cloak"], [/chain|mail/i, "armor-chain-shirt"], [/studded/i, "armor-studded-leather"],
    [/bandolier/i, "belt-bandolier"], [/gun ?belt|cartridge belt/i, "belt-gun-belt"], [/cross[- ]?draw/i, "holster-cross-draw"], [/shoulder/i, "holster-shoulder-rig"],
    [/mexican loop/i, "holster-mexican-loop"], [/pommel/i, "holster-pommel"], [/spur|boot/i, "boots-spurs"], [/chaps/i, "chaps-leather"], [/glove|gauntlet/i, "gloves-leather"],
    [/\bhats?\b|stetson|sombrero|derby|bowler|cattleman/i, "hat-cattleman"], [/eldorite/i, "ring-eldorite"]
  ];
  var GEAR_ART_SLOT = {
    hat: "hat-cattleman", neck: "neck-bandana", coat: "coat-duster", vest: "armor-leather-vest", gunbelt: "belt-gun-belt",
    holster_l: "holster-hip", holster_r: "holster-hip", gloves: "gloves-leather", chaps: "chaps-leather", boots: "boots-spurs",
    ring_1: "ring-plain", ring_2: "ring-plain", accessory_8: "shield"
  };
  var WIDE_GEAR_ART = { "belt-gun-belt": 1, "belt-bandolier": 1, "holster-pair-rig": 1 };
  function gearArtBase() {
    try { if ((root.location && root.location.pathname || "").indexOf("/dm/") >= 0) return "../"; } catch (e) {}
    return "";
  }
  /* File stem for a worn thing: an Item, a PHB armor/holster row, or an id string. slotKey picks the generic fallback. */
  function gearArtFile(thing, slotKey) {
    var id = typeof thing === "string" ? thing : String((thing && (thing.catalogId || thing.id)) || "");
    if (id && GEAR_ART_BY_ID[id]) return GEAR_ART_BY_ID[id];
    if (thing && typeof thing === "object" && slotKey && /^holster_/.test(slotKey) && isPairItem(thing)) return "holster-pair-rig";
    var name = typeof thing === "string" ? "" : String((thing && thing.name) || "");
    var wear = typeof thing === "string" ? "" : wearOf(thing);
    if (name) for (var i = 0; i < GEAR_ART_WORDS.length; i++) if (GEAR_ART_WORDS[i][0].test(name)) {
      var f = GEAR_ART_WORDS[i][1];
      /* keep a keyword hit inside the slot's family (e.g. "Eldorite locket" is a trinket, not a ring) */
      if (!slotKey || f.split("-")[0] === (GEAR_ART_SLOT[slotKey] || "trinket").split("-")[0] || /^accessory_[1-7]$/.test(slotKey) && /^trinket/.test(f)) return f;
    }
    if (slotKey === "coat" && wear === "cloak") return "coat-cloak";
    if (slotKey === "neck" && wear === "amulet") return "neck-amulet";
    if (slotKey === "gunbelt" && wear === "bandolier") return "belt-bandolier";
    if (slotKey && GEAR_ART_SLOT[slotKey]) return GEAR_ART_SLOT[slotKey];
    if (slotKey && /^accessory_[1-7]$/.test(slotKey)) return "trinket-generic";
    if (!slotKey && wear) { var k = Object.keys(SLOTS).filter(function (sk) { return fits(thing, sk); })[0]; if (k) return gearArtFile(thing, k); }
    return "";
  }
  function gearArtSrc(thing, slotKey) {
    var f = gearArtFile(thing, slotKey);
    return f ? gearArtBase() + "assets/img/items/gear/" + f + ".webp" : "";
  }
  /* Short display name: drop the PHB parenthetical, e.g. "Bowie (shortsword)" -> "Bowie". */
  function shortName(n) { return String(n || "").replace(/\s*\([^)]*\)\s*$/, "").replace(/^Navy \/ Army /, "") || String(n || ""); }
  function filledName(n) { return !!n; }
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
  /* 0.3.100 (L0201; Jessey 2026-10-21 12:11 PM): the Borrowed Iron rides in a weapon slot only, never a worn slot */
  function isIronItem(it) {
    var IA = root.SSDNSIronArt;
    return !!it && (IA && IA.isIronItem ? IA.isIronItem(it) : it.catalogId === "borrowed-iron");
  }
  function fits(it, key) {
    var s = SLOTS[key]; if (!s || !it) return false;
    if (isIronItem(it)) return false;
    if (it.type === "consumable" || it.type === "scroll" || it.type === "explosive" || it.type === "weapon" && key !== "accessory_8") return false;
    return s[1].indexOf(wearOf(it)) >= 0;
  }
  function active(it) { return !!it && !!it.equipSlot && (!it.attune || !!it.attuned); }

  /* 0.3.84 default UI by type: an armor item (armorId = a rules.js armor row) in the armor slot is the worn armor
     (character.armor, so AC uses its base + Dex cap); a shield item in the shield slot is character.shield (+2).
     Taking it off clears them again. Items without armorId / not a shield are untouched. */
  function isShieldItem(it) { return !!it && (wearOf(it) === "shield" || it.itemKind === "shield"); }
  function linkSlot(c, it, key, on) {
    if (!c || !it) return;
    if (key === "vest" && it.armorId) {
      if (on) c.armor = it.armorId;
      else if (c.armor === it.armorId) c.armor = "";
    }
    if (key === "accessory_8" && isShieldItem(it)) c.shield = !!on;
  }
  /* Put item uid into slot key (or clear with uid ""). One item per slot. */
  function equip(c, key, uid) {
    if (!SLOTS[key]) return { ok: false, reason: "Not a worn slot." };
    var cur = inSlot(c, key);
    if (!uid) { if (cur) { if (cur.cursed) return { ok: false, reason: "Cursed. It won't come off." }; cur.equipSlot = ""; linkSlot(c, cur, key, false); } return { ok: true }; }
    var it = items(c).filter(function (x) { return x && x.uid === uid; })[0];
    if (!it) return { ok: false, reason: "No item." };
    if (isIronItem(it)) return { ok: false, reason: ironOnlyMsg(c) };
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
    if (cur && cur !== it) { if (cur.cursed) return { ok: false, reason: "Cursed. It won't come off." }; cur.equipSlot = ""; linkSlot(c, cur, key, false); }
    it.equipSlot = key;
    linkSlot(c, it, key, true);
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
      if (k === "vest" && c && c.armor && !(it.armorId && c.armor === it.armorId)) return false;
      if (k === "accessory_8" && c && c.shield) return false;
      return true;
    });
    return free[0] || keys[0] || "";
  }
  /* 0.3.86: first free slot only ("" when every slot it fits is taken). New armor / shields / apparel use it to go
     straight onto the doll without bumping what is already worn. */
  function freeSlot(c, it) {
    var key = wearSlot(c, it);
    if (!key || inSlot(c, key)) return "";
    if ((key === "holster_l" && c && c.holster) || (key === "holster_r" && c && c.holsterR)) return "";
    if (key === "vest" && c && c.armor && !(it.armorId && c.armor === it.armorId)) return "";
    if (key === "accessory_8" && c && c.shield) return "";
    return key;
  }
  function toggleWear(c, uid) {
    var it = items(c).filter(function (x) { return x && x.uid === uid; })[0];
    if (!it) return { ok: false, reason: "No item." };
    if (it.equipSlot) {
      if (it.cursed) return { ok: false, reason: "Cursed. It won't come off." };
      var was = it.equipSlot;
      it.equipSlot = "";
      linkSlot(c, it, was, false);
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
  /* L0197 (Jessey 2026-10-20 7:10 PM) Focus slot by Calling. Read-only views, never a second copy, no weight:
       Pact Seeker  -> the Borrowed Iron, always (BOOK1 L2005 / L3770); "away" while lost or disarmed, back at the
                       start of the owner's next turn (character.borrowedIronAway, set by focus-slot.js).
       Hexslinger   -> mirrors the Caster Gun (Blacksnake / Hognose) equipped in Pistol L, else Pistol R
                       (BOOK1 L1884: "Your Caster Gun is your focus"); none -> "No Caster Gun equipped, can't cast."
       Other Callings keep their focus (instrument) as before (returns null here). */
  var NO_CASTER = "No Caster Gun equipped, can't cast.";
  function isCasterWeapon(w) { return !!w && (w.group === "caster" || !!w.hexShells) && w.id !== "borrowed-iron"; }
  /* 0.3.100 (Jessey 2026-10-20 9:53 PM): a weapon that is also a focus fills BOTH its weapon slot and the Focus slot.
     Flagged by the weapon row or its gun row / catalog item (weaponFocus or isFocus); Caster Guns always count. */
  var WEAPON_KEYS = ["revolver_1", "revolver_2", "long_gun", "melee"];
  function isFocusWeapon(w, g) {
    if (isCasterWeapon(w)) return true;
    if ((w && (w.weaponFocus || w.isFocus)) || (g && (g.weaponFocus || g.isFocus))) return true;
    var I = root.SSDNSItems, cat = I && I.byId && w && w.id ? I.byId(w.id) : null;
    return !!(cat && (cat.weaponFocus || cat.isFocus));
  }
  function focusWeaponInHand(c, test) {
    for (var k = 0; k < WEAPON_KEYS.length; k++) {
      var row = weaponRow(c, WEAPON_KEYS[k]);
      if (row && row.equipped && test(row)) return { key: WEAPON_KEYS[k], side: WEAPON_SLOTS[WEAPON_KEYS[k]], i: row.i, id: row.id, name: row.name, row: row };
    }
    return null;
  }
  /* L0200: a Wrecked Caster Gun can't be cast through. A working one in the other pistol slot wins; if only Wrecked
     ones are equipped, the first comes back with wrecked: true (the cast is blocked, the Focus slot says why). */
  function casterInHand(c) {
    var keys = ["revolver_1", "revolver_2"], broken = null;
    for (var k = 0; k < keys.length; k++) {
      var row = weaponRow(c, keys[k]);
      if (row && row.kind === "gun" && row.equipped && isCasterWeapon(row.w)) {
        var hit = { key: keys[k], side: WEAPON_SLOTS[keys[k]], i: row.i, id: row.id, name: row.name, row: row };
        var g = c && c.guns && c.guns[row.i];
        if (g && g.wrecked) { if (!broken) { hit.wrecked = true; broken = hit; } continue; }
        return hit;
      }
    }
    return broken;
  }
  function borrowedIronItem(c) {
    return items(c).filter(function (it) { return it && it.catalogId === "borrowed-iron" && Number(it.count == null ? 1 : it.count) > 0; })[0] || null;
  }
  function borrowedIronArt(c) {
    /* 0.3.96: the pact's own iron tile once the DM has revealed it (iron-art.js); else the generic art below */
    var IA = root.SSDNSIronArt, own = IA && IA.tileSrc ? IA.tileSrc(c) : "";
    if (own) return own;
    var it = borrowedIronItem(c);
    /* 0.3.100: never a fixed Hell Maker left on the item (that's the Crossroads Note's iron, and only once revealed) */
    var src = it ? artFor(it) : "";
    if (IA && IA.safeIronArt) src = IA.safeIronArt(src);
    if (src && !isDefaultArt(src)) return src;
    var base = gearArtBase();
    return base + "assets/img/items/borrowed-iron.webp";
  }
  /* 0.3.100 (Jessey 2026-10-20 9:53 PM): the Borrowed Iron moves out of the Focus slot into a weapon slot (all the L0197
     mechanics stay: soul-bound, away until the start of the owner's next turn, no Pact casting while away). It's display
     only: character.ironSlot is the slot it prefers; if a gun sits there now it takes the next free one. No free slot ->
     it is still in hand (nothing changes), the Focus slot picker says so. */
  var IRON_ORDER = ["revolver_2", "revolver_1", "long_gun", "melee"];
  var IRON_NO_SLOT = "No free weapon slot on the paper doll, so the Borrowed Iron isn't drawn there. It's still in your hand.";
  /* 0.3.100 (L0201): weapon slots only, by the iron's shape (iron-art.js allowedSlots): a long iron rides in Long gun,
     a one-handed iron in Pistol R / Pistol L. Before a Pact name: any gun slot. */
  function ironSlots(c) {
    var IA = root.SSDNSIronArt;
    return IA && IA.allowedSlots ? IA.allowedSlots(c) : IRON_ORDER;
  }
  function ironLabel(c) { var IA = root.SSDNSIronArt; return IA && IA.labelFor ? IA.labelFor(c) : "Borrowed Iron"; }
  function ironOnlyMsg(c) {
    return ironLabel(c) + " goes in a weapon slot only: " + ironSlots(c).map(function (k) { return WEAPON_SLOTS[k]; }).join(" or ") + ".";
  }
  function ironSlot(c) {
    if (!c || c.calling !== "pact-seeker" || !borrowedIronItem(c)) return "";
    var free = function (k) { return !weaponRow(c, k); };
    var order = ironSlots(c);
    var want = c.ironSlot;
    if (want && order.indexOf(want) >= 0 && free(want)) return want;
    for (var i = 0; i < order.length; i++) if (free(order[i])) return order[i];
    return "";
  }
  function ironState(c) {
    var key = ironSlot(c);
    if (!key && !(c && c.calling === "pact-seeker" && borrowedIronItem(c))) return null;
    var away = !!(c && c.borrowedIronAway);
    var IA = root.SSDNSIronArt, nm = IA && IA.nameFor ? IA.nameFor(c) : "", ty = IA && IA.typeFor ? IA.typeFor(c) : "";
    /* 0.3.100: the type shows from the Pact pick; the real name only once the DM reveals it */
    return { key: key, name: "Borrowed Iron", ironName: nm, ironType: ty, label: ironLabel(c), art: borrowedIronArt(c), away: away,
      note: away ? "Away: returns at the start of your next turn" : "In hand · " + (nm || ty || "soul-bound") };
  }
  function setIronSlot(c, key) {
    if (!c || c.calling !== "pact-seeker") return { ok: false, reason: "Only a Pact Seeker has a Borrowed Iron." };
    if (ironSlots(c).indexOf(key) < 0) return { ok: false, reason: ironOnlyMsg(c) };
    if (weaponRow(c, key)) return { ok: false, reason: "Unequip what's in " + WEAPON_SLOTS[key] + " first." };
    c.ironSlot = key;
    return { ok: true };
  }
  /* 0.3.100 (Jessey 2026-10-21 12:12 PM: "Needs to appear when they pick their patron"): a Pact Seeker always has
     exactly one Borrowed Iron item, never in a worn slot. pactChanged (the wizard pick or the sheet's Pact name picker)
     also moves it to the weapon slot its shape wants when that slot is free. Soul-bound rules, borrowedIronAway and the
     cast block are untouched. Returns true when something changed. */
  function ironNeedsFix(c) {
    if (!c || c.calling !== "pact-seeker") return false;
    var irons = items(c).filter(isIronItem);
    var IA = root.SSDNSIronArt;
    return irons.length !== 1 || irons.some(function (it) { return !!it.equipSlot; }) || !!(IA && IA.fixStaleIron && IA.fixStaleIron(c, { dry: true }));
  }
  function syncIron(c, opts) {
    if (!c || c.calling !== "pact-seeker") return false;
    var changedAny = false, IA = root.SSDNSIronArt;
    if (IA && IA.fixStaleIron && IA.fixStaleIron(c)) changedAny = true;
    var irons = items(c).filter(isIronItem);
    if (irons.length > 1) {
      var keep = irons[0];
      c.items = items(c).filter(function (it) { return !isIronItem(it) || it === keep; });
      irons = [keep];
      changedAny = true;
    }
    if (!irons.length) {
      var K = root.SSDNSKits;
      if (K && K.ensureBorrowedIron && K.ensureBorrowedIron(c)) changedAny = true;
      irons = items(c).filter(isIronItem);
    }
    irons.forEach(function (it) {
      if (it.equipSlot) { it.equipSlot = ""; changedAny = true; }
      if (Number(it.count == null ? 1 : it.count) !== 1) { it.count = 1; changedAny = true; }
    });
    if (opts && opts.pactChanged && irons.length) {
      var free = function (k) { return !weaponRow(c, k); };
      var want = ironSlots(c).filter(free)[0] || "";
      if (c.ironSlot !== want) { c.ironSlot = want; changedAny = true; }
      if (!want) c.ironSlotNote = IRON_NO_SLOT; else delete c.ironSlotNote;
    }
    return changedAny;
  }
  function focusState(c) {
    var calling = c && c.calling;
    if (calling === "pact-seeker") {
      /* the patron is the focus: always there, can't be unequipped (not gated by the DM's iron reveal) */
      var IA = root.SSDNSIronArt, pn = IA && IA.pactName ? IA.pactName(c) : "";
      var away = !!(c && c.borrowedIronAway);
      return { kind: "patron", name: pn || "Patron", pact: pn, art: IA && IA.patronTile ? IA.patronTile(c) : "",
        fallback: IA && IA.patronFallback ? IA.patronFallback() : "", readOnly: true, locked: true,
        note: pn ? "Your patron · your focus" : "Pick a Pact name", canCast: !away, ironAway: away };
    }
    if (calling === "hexslinger") {
      var cg = casterInHand(c);
      if (cg) {
        var A = root.SSDNSWeaponArt, art = "";
        /* 0.3.96: the square Caster Gun tile (the 3:1 engraving cropped to its middle in the square slot) */
        try { art = (root.SSDNSIronArt && root.SSDNSIronArt.weaponTile(cg.id)) || (A && A.srcFor ? (A.srcFor({ id: cg.id, name: cg.name }) || "") : ""); } catch (e) { art = ""; }
        if (cg.wrecked) return { kind: "caster", name: cg.name, art: art, side: cg.side, gunIndex: cg.i, readOnly: true, mirror: true, wrecked: true, note: "Wrecked · repair: traveling merchant only", canCast: false };
        return { kind: "caster", name: cg.name, art: art, side: cg.side, gunIndex: cg.i, readOnly: true, mirror: true, note: "Mirrors " + cg.side + " · read-only", canCast: true };
      }
      return { kind: "nocaster", name: "", art: "", readOnly: true, note: NO_CASTER, canCast: false };
    }
    /* any other weapon flagged as a focus (weaponFocus / isFocus) fills its weapon slot and the Focus slot,
       unless the Calling already has its own focus (a Storyteller's instrument) */
    if (!(c && c.instrument)) {
      var fw = focusWeaponInHand(c, function (row) { return isFocusWeapon(row.w, row.g); });
      if (fw) return { kind: "weapon", name: fw.name, art: weaponArt(c, fw.key), side: fw.side, gunIndex: fw.i, readOnly: true, mirror: true, note: "Mirrors " + fw.side + " · read-only", canCast: true };
    }
    return null;
  }
  function weaponName(c, key) {
    var guns = (c && c.guns) || [];
    if (key === "focus_borrowed_iron") {
      var fs = focusState(c);
      if (fs) return fs.name;
      if (guns.some(function (g) { return g && g.weapon === "borrowed-iron"; })) return "Borrowed Iron";
      var ins = c && c.instrument && byId(R().storytellerGear && R().storytellerGear.instruments, c.instrument);
      return ins ? ins.name : "";
    }
    if (ironSlot(c) === key) return "Borrowed Iron";
    var row = weaponRow(c, key);
    return row ? row.name : "";
  }
  function weaponArt(c, key) {
    var A = root.SSDNSWeaponArt;
    if (key === "focus_borrowed_iron") {
      var fs = focusState(c);
      if (fs) return fs.art || "";
      var guns = (c && c.guns) || [];
      if (guns.some(function (g) { return g && g.weapon === "borrowed-iron"; })) return A && A.srcFor ? (A.srcFor({ id: "borrowed-iron", name: "Borrowed Iron" }) || "") : "";
      var IA = root.SSDNSInstrumentArt;
      if (c && c.instrument && IA && IA.srcFor) { try { return IA.srcFor({ id: c.instrument, quality: c.instrumentQuality, name: weaponName(c, key) }) || ""; } catch (e) { return ""; } }
      return "";
    }
    if (ironSlot(c) === key) return borrowedIronArt(c);
    var row = weaponRow(c, key);
    if (!row || !A || !A.srcFor) return "";
    /* 0.3.96: paper-doll slots are item slots: a gun's colour 256 tile wins when it has one (Caster Guns) */
    var tile = root.SSDNSIronArt && root.SSDNSIronArt.weaponTile ? root.SSDNSIronArt.weaponTile(row.id) : "";
    if (tile) return tile;
    try { return A.srcFor({ id: row.id, name: row.name }) || ""; } catch (e) { return ""; }
  }

  function num(x) { var n = Number(x); return isFinite(n) ? n : 0; }
  /* Bonus math from slotted gear. Returned to compute() in app.js. */
  function bonuses(c) {
    var out = { abilities: {}, ac: 0, init: 0, speed: 0, rangedAtk: 0, holsterDex: 0, holsterInit: 0, shieldOff: false, sources: [] };
    var twoHanded = false;
    items(c).forEach(function (it) {
      if (!active(it)) return;
      var b = it.bonuses || {};
      /* 0.3.69: items saved before their catalog row grew a bonuses block (Hat of the Sharpshooter) read the catalog's */
      if (!it.bonuses && it.catalogId && root.SSDNSItems && root.SSDNSItems.catalogItem) {
        var cat = root.SSDNSItems.catalogItem(it.catalogId);
        if (cat && cat.bonuses) b = cat.bonuses;
      }
      var rig = /^holster_/.test(it.equipSlot);
      if (rig) {
        out.holsterDex = Math.max(out.holsterDex, num(b.dex || b.DEX));
        out.holsterInit = Math.max(out.holsterInit, num(b.init || b.initiative));
      } else {
        AB.forEach(function (k) { var n = num(b[k] || b[k.toLowerCase()]); if (n) out.abilities[k] = (out.abilities[k] || 0) + n; });
        out.ac += num(b.ac || b.AC); out.init += num(b.init || b.initiative); out.speed += num(b.speed);
        out.rangedAtk += num(b.rangedAtk);
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
    /* Duster Form frame (Art Bot, Jessey-approved 2026-10-19): the figure is baked into the frame, so there is no separate silhouette layer. */
    var parts = ['<div class="doll' + (ro ? " doll-ro" : "") + '" style="background-image:url(' + img(FRAME) + ')">'];
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
      var focusNote = "", fallback = "";
      var b = BOX[key], tall = b[3] > 200, label = isTrinket(key) ? "" : (LABELS[key] || (SLOTS[key] ? SLOTS[key][0] : WEAPON_SLOTS[key])), name = "", art = "", filled = false, cls = "", src = "";
      if (WEAPON_SLOTS[key]) {
        name = weaponName(c, key); filled = !!name; cls = " doll-weapon"; art = filled ? weaponArt(c, key) : "";
        src = key === "focus_borrowed_iron" ? "Gear: Focus" : "Gear: Weapons";
        if (key === "focus_borrowed_iron") {
          var fst = focusState(c);
          if (fst) {
            focusNote = fst.note || "";
            cls += " doll-focus-" + fst.kind + (fst.away ? " doll-away" : "");
            src = fst.kind === "caster" || fst.kind === "weapon" ? "mirrors " + fst.side + ", read-only" : (fst.kind === "patron" ? "your patron, always your focus" : "");
            if (fst.fallback) fallback = fst.fallback;
          }
        } else {
          var irs = ironSlot(c) === key ? ironState(c) : null;
          if (irs) {
            focusNote = irs.note;
            cls += " doll-iron" + (irs.away ? " doll-away" : "");
            src = "soul-bound Borrowed Iron";
          } else if (filled) {
            /* a weapon that is also the focus shows here and in the Focus slot */
            var fsw = focusState(c);
            if (fsw && fsw.mirror && fsw.side === WEAPON_SLOTS[key]) cls += " doll-focus-weapon-src";
          }
        }
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
        /* Worn-gear art: the item's own art wins; else the gear map (PHB row or item), else the slot's generic art. */
        if (filledName(name) && !art) {
          var row = it || (key === "vest" ? byId(rr.armor, c.armor) : key === "accessory_8" ? "shield-badge-board-cavalry-shield-rifle-plate" : key === "holster_l" ? holL : key === "holster_r" ? holR : key === "gunbelt" ? (beltRow || "gun-belt-cartridge-loops") : null);
          art = gearArtSrc(row || "", key);
          if (WIDE_GEAR_ART[gearArtFile(row || "", key)]) cls += " doll-wideart";
        }
        filled = !!name;
        if (key === "accessory_8" && filled && bonuses(c).shieldOff) cls += " doll-off";
      }
      /* 0.3.54: 9-slice the square tile so tall/wide slots keep true corners. */
      var tile = filled ? "slot-256-filled.webp" : "slot-256.webp";
      if (tall) cls += b[2] > 200 ? " doll-wide" : " doll-tall";
      if (filled && !art) cls += " doll-noart";
      var tip = (label || "Trinket") + (name ? ": " + name + (src ? " (" + src + ")" : "") : (focusNote ? ": " + focusNote : " (empty)"));
      if (name && focusNote) tip += " · " + focusNote;
      if (key === "revolver_1") tip += " · draws from Holster L";
      if (key === "revolver_2") tip += " · draws from Holster R";
      parts.push('<div class="doll-cell' + (isTrinket(key) ? " doll-trinket" : "") + '" style="' + pct(b) + '">' +
        '<' + (ro ? "div" : "button type=\"button\"") + ' class="doll-slot doll-9' + (filled ? " filled" : "") + cls + '" data-doll-slot="' + key + '" style="border-image-source:url(' + img(tile) + ')" title="' + esc(tip) + '" aria-label="' + esc(tip) + '">' +
        (art ? '<img class="doll-art" alt="" src="' + esc(art) + '"' + (fallback && fallback !== art ? ' data-fallback="' + esc(fallback) + '"' : "") + ">" : glyph(key)) +
        (filled ? '<span class="doll-name">' + esc(shortName(name)) + "</span>" : "") +
        (focusNote ? '<span class="doll-focus-note">' + esc(focusNote) + "</span>" : "") +
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
    var fpk = key === "focus_borrowed_iron" ? focusState(c) : null;
    /* owned instruments keep their "Make focus" buttons (unchanged mechanic), under the Calling focus */
    var insRows = fpk ? instruments(c).map(function (x) {
      return x.focus ? btn("data-doll-noop", x.name + " · instrument", false) : btn('data-doll-focus="' + esc(x.uid) + '"', "Make focus: " + x.name + (x.quality === "quality" ? " (quality)" : ""), false);
    }).join(" ") : "";
    var combat = !!(root.SSDNSEquip && root.SSDNSEquip.combatLocked && root.SSDNSEquip.combatLocked());
    var irs = !fpk ? (ironSlot(c) === key ? ironState(c) : null) : null;
    var ironHint = "Soul-bound: it can't be dropped, sold, traded, given or looted. No Borrowed Iron in hand, no Pact Seeker spells. " +
      "Lost or disarmed, it returns at the start of your next turn" + (combat ? "." : " (out of combat, a heartbeat later).");
    if (fpk && fpk.kind === "patron") {
      rows = btn("data-doll-noop", (fpk.pact || "No Pact name yet") + " · your patron", true);
      var where = ironSlot(c);
      hint = "Your patron is your focus. It always fills this slot and can't be unequipped. " +
        (where ? "Your Borrowed Iron rides in " + WEAPON_SLOTS[where] + "." : (borrowedIronItem(c) ? IRON_NO_SLOT : ""));
    } else if (irs) {
      rows = btn("data-doll-noop", "Borrowed Iron · " + (irs.away ? "away" : "in hand"), !irs.away) + " " +
        (irs.away ? btn('data-doll-iron="back"', "Back in hand", false) : btn('data-doll-iron="away"', "Lost / disarmed", false)) + " " +
        ironSlots(c).filter(function (k) { return k !== key && !weaponRow(c, k); }).map(function (k) { return btn('data-doll-ironslot="' + k + '"', "Move to " + WEAPON_SLOTS[k], false); }).join(" ");
      var others = weaponOptions(c, key).map(function (x) { return btn('data-doll-weapon="' + x.i + '"', x.name + (x.equipped ? "" : " · packed"), false); }).join(" ");
      if (others) rows += " " + others;
      hint = ironHint;
    } else if (fpk && (fpk.kind === "caster" || fpk.kind === "nocaster")) {
      rows = fpk.kind === "caster" ? btn("data-doll-noop", fpk.name + " · mirrors " + fpk.side, true) : '<span class="fine doll-nocaster-msg">' + esc(NO_CASTER) + "</span>";
      hint = "Your Caster Gun is your focus (read-only here, no extra weight). Equip a Blacksnake or Hognose in Pistol L or Pistol R. Hex casting and shells need it.";
      if (fpk.kind === "nocaster" && root.SSDNSFocus && root.SSDNSFocus.hexPlinkerSwap && root.SSDNSFocus.hexPlinkerSwap(c)) hint = root.SSDNSFocus.SWAP_NOTE + " " + hint;
    } else if (key === "focus_borrowed_iron") {
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
      if (!cur && c && c.calling === "pact-seeker" && borrowedIronItem(c) && ironSlots(c).indexOf(key) >= 0) rows += " " + btn('data-doll-ironslot="' + key + '"', "Borrowed Iron here", false);
      /* 0.3.100: say why the iron isn't offered here */
      else if (c && c.calling === "pact-seeker" && borrowedIronItem(c) && ironSlots(c).indexOf(key) < 0) hint += " " + ironOnlyMsg(c);
    }
    if (fpk && insRows) rows += " " + insRows;
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
    var ironNote = c && c.calling === "pact-seeker" && borrowedIronItem(c) ? ironOnlyMsg(c) : "";
    var hint = key === "vest" ? "Same as Armor on Gear; either one updates the other." : key === "accessory_8" ? "Same as the Shield box on Gear. A two-handed weapon turns a shield off." : key === "holster_l" ? "Same as Holster L on Gear. Pistol L draws from it and gets its first-shot bonus." : key === "holster_r" ? "Same as Holster R on Gear. Pistol R draws from it and gets its first-shot bonus." : key === "gunbelt" ? "Same as Belt on Gear. A gun belt or bandolier feeds Tactical Reload." : "";
    return '<div class="doll-pick" data-doll-pick="' + key + '"><b>' + esc(label) + "</b> " + (extra ? extra + " " : "") + (rows || (extra ? "" : '<span class="fine">Nothing you carry fits here.</span>')) +
      (cur ? ' <button type="button" class="btn sm" data-doll-put="">Take off</button>' : "") +
      ' <button type="button" class="btn sm" data-doll-close>Close</button>' +
      (hint ? '<p class="fine">' + esc(hint) + "</p>" : "") + (att ? '<p class="fine">Attuned ' + esc(att) + "</p>" : "") +
      (ironNote ? '<p class="fine doll-iron-only">' + esc(ironNote) + "</p>" : "") + "</div>";
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
      var t = e.target.closest("[data-doll-slot],[data-doll-put],[data-doll-close],[data-doll-weapon],[data-doll-focus],[data-doll-shield],[data-doll-iron],[data-doll-ironslot]");
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
      } else if (t.hasAttribute("data-doll-iron")) {
        var F = root.SSDNSFocus, how = t.getAttribute("data-doll-iron");
        res = F ? (how === "back" ? F.ironBack({ toast: true }) : F.ironAway({ toast: true })) : { ok: false, reason: "Focus tools aren't loaded." };
        if (res && res.ok) { paint(); return; }
      } else if (t.hasAttribute("data-doll-ironslot")) {
        var isk = t.getAttribute("data-doll-ironslot");
        commit(function () { res = setIronSlot(character(), isk); });
      } else if (t.hasAttribute("data-doll-shield")) {
        commit(function () { var ch = character(); ch.shield = !ch.shield; res = { ok: true }; });
      }
      if (res) { if (res.ok) openKey = ""; paint(); if (!res.ok) msg(res.reason); return; }
      var k = t.getAttribute("data-doll-slot");
      if (!k) return;
      openKey = openKey === k ? "" : k; paint();
    });
  }
  /* 0.3.96: a patron tile that isn't in the repo yet falls back to the generic focus tile, once per session */
  function wireArtFallback() {
    document.addEventListener("error", function (e) {
      var im = e.target;
      if (!im || im.tagName !== "IMG" || !im.getAttribute("data-fallback")) return;
      var fb = im.getAttribute("data-fallback");
      if (root.SSDNSIronArt && root.SSDNSIronArt.markMissing) root.SSDNSIronArt.markMissing(im.getAttribute("src"));
      im.removeAttribute("data-fallback");
      if (fb && im.getAttribute("src") !== fb) im.setAttribute("src", fb);
    }, true);
  }
  if (typeof document !== "undefined" && document.addEventListener) wireArtFallback();
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

  root.SSDNSDoll = { gearArtSrc: gearArtSrc, gearArtFile: gearArtFile, GEAR_ART_BY_ID: GEAR_ART_BY_ID, BOX: BOX, SLOTS: SLOTS, LABELS: LABELS, TRINKET_HEADS: TRINKET_HEADS, FRAME: FRAME, COUNTER: COUNTER, PLATE_BAND: PLATE_BAND, isPairItem: isPairItem, wearable: wearable, wearSlot: wearSlot, freeSlot: freeSlot, isShieldItem: isShieldItem, toggleWear: toggleWear, wornLabel: wornLabel, WEAPON_SLOTS: WEAPON_SLOTS, equip: equip, fits: fits, inSlot: inSlot, bonuses: bonuses, capped: capped, html: html, pickerHtml: pickerHtml, paint: paint, weaponName: weaponName, weaponArt: weaponArt, weaponOptions: weaponOptions, weaponRow: weaponRow, setWeapon: setWeapon, focusState: focusState, casterInHand: casterInHand, ironSlot: ironSlot, ironState: ironState, setIronSlot: setIronSlot, IRON_NO_SLOT: IRON_NO_SLOT, ironSlots: ironSlots, ironOnlyMsg: ironOnlyMsg, syncIron: syncIron, ironNeedsFix: ironNeedsFix, isIronItem: isIronItem, isFocusWeapon: isFocusWeapon, focusWeaponInHand: focusWeaponInHand, isCasterWeapon: isCasterWeapon, NO_CASTER: NO_CASTER, instruments: instruments, instrumentId: instrumentId, makeFocus: makeFocus };
})(typeof window !== "undefined" ? window : globalThis);

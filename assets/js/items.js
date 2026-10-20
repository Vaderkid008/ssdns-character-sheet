/* Shared item catalog, inventory, and the Add Item form.
   Effect kinds are heal, castSpell, attack, save+condition, buff, and text.
   A new item is data. A new effect kind is the only reason to change this file. */
(function (root) {
  "use strict";

  var TYPES = { consumable: 1, scroll: 1, explosive: 1, gear: 1, weapon: 1, quest: 1 };
  var KINDS = { heal: 1, castSpell: 1, attack: 1, "save+condition": 1, buff: 1, text: 1 };
  var room = { weightOn: false, catalog: {} };
  var storeById = {};

  function seeds() { return (root.SSDNS_ITEM_CATALOG || []).slice(); }

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj || null));
  }

  function num(v) {
    var n = Number(v);
    return isFinite(n) ? n : null;
  }

  function signed(n) {
    n = Number(n) || 0;
    return (n >= 0 ? "+" : "") + n;
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function normName(s) {
    return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  }

  /* 0.3.80 (Lock L0182): items whose summons are unlimited. Saved copies drop any stored uses / charges,
     so an old character never shows a counter for them or gets blocked. */
  var UNLIMITED_USES = { "saddle-of-the-phantom-steed": 1 };
  function unlimitedFix(item) {
    if (!item) return item;
    var id = item.catalogId || item.id || "";
    if (!UNLIMITED_USES[id]) return item;
    item.uses = { max: null, recharge: "" };
    item.chargesLeft = null;
    return item;
  }
  function usesOf(raw) {
    if (raw == null) return { max: null, recharge: "" };
    if (typeof raw === "number") return { max: raw, recharge: "" };
    return { max: raw.max == null || raw.max === "" ? null : Number(raw.max), recharge: raw.recharge || "" };
  }

  function effectOf(raw) {
    raw = raw || {};
    var kind = raw.kind === "save" ? "save+condition" : (raw.kind || "text");
    if (!KINDS[kind]) kind = "text";
    var out = { kind: kind };
    ["dice", "spell", "text", "save", "condition", "duration", "damage", "damageType", "range", "onSave", "temp", "extraDamage", "extraType", "dmgDice"].forEach(function (k) {
      if (raw[k] != null && raw[k] !== "") out[k] = raw[k];
    });
    if (raw.misfire != null && raw.misfire !== "") out.misfire = String(raw.misfire);
    ["level", "dc", "attack", "radius", "bonus", "spellMod", "hours"].forEach(function (k) {
      if (raw[k] != null && raw[k] !== "" && isFinite(Number(raw[k]))) out[k] = Number(raw[k]);
    });
    if (raw.placed) out.placed = true;
    return out;
  }

  /* "ac +1, init +1, dex +2" -> {ac:1, init:1, DEX:2} */
  function parseBonus(text) {
    var out = {}, any = false;
    String(text || "").split(/[,;]/).forEach(function (part) {
      var m = /^\s*([a-z]+)\s*([+-]?\s*\d+)\s*$/i.exec(part);
      if (!m) return;
      var k = m[1].toLowerCase(), n = Number(m[2].replace(/\s/g, ""));
      if (!isFinite(n)) return;
      if (/^(str|dex|con|int|wis|cha)$/.test(k)) k = k.toUpperCase();
      else if (k === "initiative") k = "init";
      else if (k !== "ac" && k !== "init" && k !== "speed") return;
      out[k] = n; any = true;
    });
    return any ? out : null;
  }

  function valid(item) {
    if (!item || typeof item !== "object") return false;
    if (!item.id || !item.name) return false;
    if (!TYPES[item.type]) return false;
    if (!item.effect || !KINDS[item.effect.kind]) return false;
    if (item.art != null && typeof item.art !== "string") return false;
    return true;
  }

  function storePriceOf(id) {
    var row = storeById[String(id || "")];
    if (!row || row.price_es == null || row.price_es === "") return null;
    var n = Number(row.price_es);
    return isFinite(n) ? n : null;
  }

  function setStore(list) {
    storeById = {};
    (Array.isArray(list) ? list : []).forEach(function (row) {
      if (row && row.id) storeById[row.id] = row;
    });
    paintSheet();
    paintDm();
  }

  function loadStore() {
    if (Object.keys(storeById).length || !root.XMLHttpRequest) return;
    var loc = "";
    try { loc = (root.location && root.location.pathname) || ""; } catch (e) {}
    var path = loc.indexOf("/dm/") >= 0 ? "assets/data/store-items.json" : "dm/assets/data/store-items.json";
    try {
      var xhr = new XMLHttpRequest();
      xhr.open("GET", path, false);
      xhr.send(null);
      if ((xhr.status >= 200 && xhr.status < 300) || xhr.status === 0) {
        var data = JSON.parse(xhr.responseText || "null");
        if (Array.isArray(data)) setStore(data);
      }
    } catch (err) {}
  }

  function normalize(raw) {
    raw = raw || {};
    var type = TYPES[raw.type] ? raw.type : "gear";
    var explicitStory = !!raw.story;
    var price = raw.price == null || raw.price === "" ? null : Number(raw.price);
    if (price != null && !isFinite(price)) price = null;
    var locked = storePriceOf(raw.id);
    if (locked != null && !explicitStory && type !== "quest") price = locked;
    var story = explicitStory || price == null && raw.forSale === false;
    var forSale = raw.forSale === false || price == null || story ? (raw.forSale === true && price != null && !story) : true;
    if (story || price == null) forSale = false;
    var weight = raw.weight == null || raw.weight === "" ? null : Number(raw.weight);
    if (weight != null && !isFinite(weight)) weight = null;
    return {
      id: String(raw.id || "").trim(),
      name: String(raw.name || "Item").trim(),
      type: type,
      description: String(raw.description || ""),
      effect: effectOf(raw.effect),
      uses: usesOf(raw.uses),
      weight: weight,
      price: forSale ? price : null,
      forSale: !!forSale,
      story: !!story || (!forSale && type !== "quest"),
      art: String(raw.art || ""),
      weaponId: raw.weaponId || "",
      slot: raw.slot || "",
      group: raw.group || "",
      properties: raw.properties || "",
      weapon: raw.weapon && typeof raw.weapon === "object" ? clone(raw.weapon) : null,
      attune: !!raw.attune,
      rarity: String(raw.rarity || ""),
      bonuses: raw.bonuses && typeof raw.bonuses === "object" ? clone(raw.bonuses) : null,
      wear: String(raw.wear || ""),
      dmPlace: !!raw.dmPlace,
      dmOnly: type === "quest" || !!raw.dmOnly,
      /* 0.3.80 inventory build: shelf (Add item sub-group), stack (same gear stacks), noCarry (rides on the mount) */
      shelf: String(raw.shelf || ""),
      stack: !!raw.stack,
      noCarry: !!raw.noCarry,
      provisional: String(raw.provisional || ""),
      /* L0188-L0190 supplies schema: tags (keep type too), meals for food, water (gal) for drink,
         capacity (gal) + defaultFill ("full" | "empty") for water containers */
      tags: tagsOf(raw.tags),
      meals: posNum(raw.meals != null ? raw.meals : (raw.food && typeof raw.food === "object" ? raw.food.meals : null)),
      water: posNum(nestedWater(raw) ? null : raw.water) || (nestedWater(raw) && !isContainerRaw(raw) ? posNum(raw.water.gallons) : null),
      capacity: posNum(raw.capacity) || (nestedWater(raw) && isContainerRaw(raw) ? posNum(raw.water.gallons) : null),
      feedDays: posNum(raw.feedDays),
      defaultFill: raw.defaultFill === "full" ? "full" : (raw.capacity || (nestedWater(raw) && isContainerRaw(raw)) ? "empty" : ""),
      fillIncluded: !!raw.fillIncluded, /* catalog weight already counts a full container (waterskin "5 lb full") */
      mealWeight: posNum(raw.mealWeight) /* lb per meal inside a multi-meal item (a pack's hardtack) */
    };
  }
  /* Encounter Bot's scrub doc writes food: { meals } and water: { gallons }. Mapped onto this schema:
     food.meals -> meals; water.gallons -> capacity for a container (its 5e full amount), or water for a drink. */
  function nestedWater(raw) { return !!(raw && raw.water && typeof raw.water === "object"); }
  function isContainerRaw(raw) { return tagsOf(raw.tags).indexOf("container") >= 0 || !!raw.water.container; }
  function tagsOf(list) {
    if (typeof list === "string") list = list.split(",");
    if (!Array.isArray(list)) return [];
    var out = [];
    list.forEach(function (t) {
      var x = String(t == null ? "" : t).trim();
      if (x && out.indexOf(x) < 0) out.push(x);
    });
    return out;
  }
  function posNum(v) {
    if (v == null || v === "") return null;
    var n = Number(v);
    return isFinite(n) && n > 0 ? n : null;
  }
  function hasTag(item, tag) {
    return !!(item && Array.isArray(item.tags) && item.tags.indexOf(tag) >= 0);
  }
  /* Old saves: rows made before the supplies schema get tags/meals/capacity from the catalog (or a
     name match for hand-typed rations / waterskins). A waterskin's weight becomes its empty weight
     and its water is counted as fill (8 lb a gallon), so carried weight stays the same. */
  var SUPPLY_NAMES = [
    { re: /\b(hardtack|jerky|rations?|pemmican|trail food)\b/i, tags: ["food"], meals: 1 },
    { re: /\b(waterskin|canteen)\b/i, tags: ["water", "container"], capacity: 0.5, defaultFill: "full", fillIncluded: true }
  ];
  function inferSupply(item) {
    if (!item || item._supplyChecked) return item;
    var base = item.catalogId ? byId(item.catalogId) : null;
    var src = null;
    if (base && (base.tags.length || base.meals || base.capacity || base.water)) src = base;
    else if ((!base || !base.tags.length) && !(Array.isArray(item.tags) && item.tags.length) && item.meals == null && item.water == null && item.capacity == null) {
      for (var i = 0; i < SUPPLY_NAMES.length; i++) {
        if (SUPPLY_NAMES[i].re.test(String(item.name || ""))) { src = SUPPLY_NAMES[i]; break; }
      }
    }
    if (src) {
      var tagsNow = tagsOf(item.tags);
      (src.tags || []).forEach(function (t) { if (tagsNow.indexOf(t) < 0) tagsNow.push(t); });
      item.tags = tagsNow;
      if (item.meals == null && src.meals) item.meals = src.meals;
      if (item.water == null && src.water) item.water = src.water;
      if (item.mealWeight == null && src.mealWeight) item.mealWeight = src.mealWeight;
      if (item.capacity == null && src.capacity) {
        item.capacity = src.capacity;
        if (src.fillIncluded) item.fillIncluded = true;
        /* before this schema a waterskin weighed "5 lb full": it starts full so carried weight doesn't move */
        if (item.fill == null) item.fill = src.defaultFill === "full" ? src.capacity * Math.max(1, Number(item.count) || 1) : 0;
      }
    }
    try { Object.defineProperty(item, "_supplyChecked", { value: true, enumerable: false, configurable: true }); } catch (e) {}
    return item;
  }

  function byId(id) {
    var key = String(id || "");
    var custom = room.catalog && room.catalog[key];
    if (custom) return normalize(custom);
    var list = seeds();
    for (var i = 0; i < list.length; i++) if (list[i] && list[i].id === key) return normalize(list[i]);
    return null;
  }

  function catalog(opts) {
    opts = opts || {};
    var map = {};
    seeds().forEach(function (row) {
      if (!valid(normalize(row))) return;
      map[row.id] = normalize(row);
    });
    var extra = room.catalog || {};
    Object.keys(extra).forEach(function (id) {
      var row = normalize(extra[id]);
      row.id = row.id || id;
      if (valid(row)) map[row.id] = row;
    });
    return Object.keys(map).map(function (id) { return map[id]; }).filter(function (row) {
      if (!opts.dm && row.type === "quest") return false;
      if (!opts.dm && row.dmPlace) return false;
      if (opts.forSale && !row.forSale) return false;
      return true;
    });
  }

  function uid() {
    return "it_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function instanceFrom(raw, opts) {
    opts = opts || {};
    var base = raw && raw.effect ? normalize(raw) : (byId(raw && (raw.catalogId || raw.id)) || normalize(raw));
    var uses = UNLIMITED_USES[base.id || (raw && raw.catalogId) || ""] ? usesOf(null) : usesOf(raw && raw.uses != null ? raw.uses : base.uses);
    var count = raw && raw.count != null ? Math.max(1, Number(raw.count) || 1) : 1;
    var charges = raw && raw.chargesLeft != null ? Number(raw.chargesLeft) : (uses.max == null ? null : uses.max);
    return {
      uid: (raw && raw.uid) || uid(),
      catalogId: base.id || (raw && raw.catalogId) || "",
      name: (raw && raw.name) || base.name,
      type: base.type,
      description: base.description,
      effect: base.effect,
      uses: uses,
      weight: base.weight,
      price: base.price,
      forSale: base.forSale,
      story: !!base.story,
      art: base.art,
      weaponId: base.weaponId,
      slot: base.slot,
      group: base.group,
      properties: base.properties,
      weapon: base.weapon || (raw && raw.weapon) || null,
      attune: !!(base.attune || (raw && raw.attune)),
      attuned: !!(raw && raw.attuned),
      rarity: base.rarity || "",
      bonuses: base.bonuses || null,
      wear: base.wear || "",
      dmOnly: !!base.dmOnly,
      count: count,
      chargesLeft: UNLIMITED_USES[base.id || (raw && raw.catalogId) || ""] ? null : charges,
      playerAdded: !!(raw && raw.playerAdded) || !!opts.player,
      approved: opts.player ? false : (raw && raw.approved != null ? !!raw.approved : true),
      addressedTo: (raw && raw.addressedTo) || opts.addressedTo || "",
      dmAllowDrop: !!(raw && raw.dmAllowDrop),
      dmAllowRob: !!(raw && raw.dmAllowRob),
      tags: tagsOf([].concat((raw && Array.isArray(raw.tags)) ? raw.tags : [], Array.isArray(base.tags) ? base.tags : [])),
      quality: (raw && raw.quality) || "",
      shelf: base.shelf || (raw && raw.shelf) || "",
      stack: !!(base.stack || (raw && raw.stack)),
      noCarry: !!(base.noCarry || (raw && raw.noCarry)),
      meals: posNum(raw && raw.meals != null ? raw.meals : base.meals),
      water: posNum(raw && raw.water != null && typeof raw.water !== "object" ? raw.water : base.water),
      capacity: posNum(raw && raw.capacity != null ? raw.capacity : base.capacity),
      fillIncluded: !!((raw && raw.fillIncluded) || base.fillIncluded),
      mealWeight: posNum(raw && raw.mealWeight != null ? raw.mealWeight : base.mealWeight),
      feedDays: posNum(raw && raw.feedDays != null ? raw.feedDays : base.feedDays),
      fill: (function () {
        var cap = posNum(raw && raw.capacity != null ? raw.capacity : base.capacity);
        if (!cap) return null;
        if (raw && raw.fill != null && isFinite(Number(raw.fill))) return Math.max(0, Math.min(cap * count, Number(raw.fill)));
        return ((raw && raw.defaultFill) || base.defaultFill) === "full" ? cap * count : 0;
      })()
    };
  }

  function listOf(character) {
    if (!character) return [];
    if (!Array.isArray(character.items)) character.items = [];
    character.items.forEach(unlimitedFix);
    character.items.forEach(inferSupply);
    return character.items;
  }

  function find(character, id) {
    var list = listOf(character);
    for (var i = 0; i < list.length; i++) {
      if (list[i] && (list[i].uid === id || list[i].catalogId === id)) return list[i];
    }
    return null;
  }

  function questItem(item) {
    return !!(item && (item.type === "quest" || item.dmOnly));
  }

  function canDrop(item, opts) {
    opts = opts || {};
    if (!item) return false;
    if (opts.inventoryLocked && !opts.dm) return false;
    if (!questItem(item)) return true;
    return !!(opts.dm && (opts.allow || opts.override || item.dmAllowDrop));
  }

  function canRob(item, opts) {
    opts = opts || {};
    if (!item) return true;
    if (opts.inventoryLocked && !opts.override) return false;
    if (!questItem(item)) return true;
    return !!(opts.override || opts.dmAllow || item.dmAllowRob);
  }

  function addressedBlank(item, viewer) {
    viewer = viewer || {};
    if (!item) return false;
    if (viewer.dm) return false;
    var to = String(item.addressedTo || "").trim();
    if (!to) return false;
    return normName(to) !== normName(viewer.name);
  }

  function present(item, viewer) {
    if (!addressedBlank(item, viewer)) return item;
    var copy = clone(item) || {};
    copy.name = "Blank paper";
    copy.description = "Blank paper. The seal doesn't answer to you.";
    copy.effect = { kind: "text", text: "Blank paper." };
    copy.blank = true;
    return copy;
  }

  function rollD20(rng) {
    var roll = rng || Math.random;
    var n = 1 + Math.floor(roll() * 20);
    if (n < 1) n = 1;
    if (n > 20) n = 20;
    return n;
  }

  function rollDice(expr, rng) {
    var roll = rng || Math.random;
    var s = String(expr || "").replace(/\s/g, "");
    if (!s) return { formula: "0", total: 0, detail: "0" };
    if (/^[+-]?\d+$/.test(s)) {
      var flatOnly = parseInt(s, 10);
      return { formula: String(flatOnly), total: flatOnly, detail: String(flatOnly) };
    }
    var re = /([+-]?)(\d*)d(\d+)|([+-]?\d+)/gi;
    var m;
    var total = 0;
    var bits = [];
    var formula = [];
    while ((m = re.exec(s))) {
      if (m[3]) {
        var count = parseInt(m[2] || "1", 10);
        var sides = parseInt(m[3], 10);
        var sign = m[1] === "-" ? -1 : 1;
        var faces = [];
        var sub = 0;
        for (var i = 0; i < count; i++) {
          var face = 1 + Math.floor(roll() * sides);
          faces.push(face);
          sub += face;
        }
        total += sign * sub;
        formula.push((sign < 0 ? "-" : (formula.length ? "+" : "")) + count + "d" + sides);
        bits.push((sign < 0 ? "-" : "") + faces.join("+"));
      } else if (m[4] != null && m[4] !== "") {
        var flat = parseInt(m[4], 10);
        total += flat;
        formula.push((flat >= 0 && formula.length ? "+" : "") + flat);
        bits.push((flat >= 0 ? "+" : "") + flat);
      }
    }
    return { formula: formula.join("") || s, total: total, detail: bits.join(" ") + " = " + total };
  }

  function scrollTable(level) {
    var lv = Number(level) || 0;
    if (lv <= 2) return { dc: 13, attack: 5 };
    if (lv <= 4) return { dc: 15, attack: 7 };
    if (lv <= 6) return { dc: 17, attack: 9 };
    if (lv <= 8) return { dc: 18, attack: 10 };
    return { dc: 19, attack: 11 };
  }

  function consumes(item) {
    if (!item || !item.uses) return false;
    return item.uses.max != null && isFinite(Number(item.uses.max));
  }

  /* 0.3.80 Powder Man Long Arm (DND Bot, PHB): explosive throws are 50/100 ft for that character (scatter past 50).
     Everyone else 30/60. Placed charges (the blasting keg) are never thrown. */
  function throwBands(powderMan) { return powderMan ? { normal: 50, max: 100 } : { normal: 30, max: 60 }; }
  function ringSpec(item, opts) {
    if (!item || !item.effect) return null;
    var effect = item.effect;
    var kind = effect.kind;
    if (kind !== "attack" && item.type !== "explosive" && item.type !== "weapon") return null;
    if (effect.placed || (!effect.range && effect.radius)) {
      var ft = Number(effect.radius) || 0;
      if (!ft) return null;
      return { id: "item:" + (item.uid || item.id), name: item.name, kind: "spell", spell: true, spellKind: "save", range: ft + " ft" };
    }
    if (!effect.range) return null;
    var range = String(effect.range);
    if (item.type === "explosive" && opts && opts.powderMan && /^30\s*\/\s*60$/.test(range)) range = "50/100";
    if (/^\d+$/.test(range)) range = range + "/" + range;
    return {
      id: "item:" + (item.uid || item.id),
      name: item.name,
      range: range,
      properties: item.properties || (item.type === "explosive" ? "thrown" : ""),
      group: item.group || (item.type === "explosive" ? "explosive" : ""),
      kind: /thrown/i.test(item.properties || "") || item.type === "explosive" ? "thrown" : (item.slot === "melee" ? "melee" : "weapon")
    };
  }


  /* Explosives per DND Bot 2026-10-18 (PHB p.63-64). Save only, never an attack roll.
     ctx: { distance (ft), powderMan, rng }. Hard-to-simulate parts go to chat as notes. */
  var DIRS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  function explosiveRules(effect, ctx) {
    var sweating = !!effect.misfire || !!effect.sweating;
    var pm = !!ctx.powderMan;
    return { sweating: sweating, misfireOn: sweating ? (pm ? 1 : 3) : (pm ? 0 : 1) };
  }
  function useExplosive(item, effect, ctx, who) {
    var rng = ctx.rng;
    var placed = !!effect.placed;
    var dist = ctx.distance != null && ctx.distance !== "" ? Number(ctx.distance) : null;
    var notes = [];
    var bands = throwBands(!!ctx.powderMan);
    var bandTxt = bands.normal + "/" + bands.max + " ft";
    if (!placed && dist != null && isFinite(dist) && dist > bands.max) {
      return { ok: false, kind: "attack", consume: false, reason: "Too far. Throw range is " + bandTxt + ".", chat: who + " can't throw " + item.name + " that far (" + bandTxt + ")." };
    }
    var rules = explosiveRules(effect, ctx);
    var fuse = rollD20(rng);
    var head = who + (placed ? " places and lights " : " lights and throws ") + item.name + (ctx.target && !placed ? " at " + ctx.target : "") + ". Fuse d20 " + fuse;
    var dmg = rollDice(effect.damage || "0", rng);
    var half = Math.floor(dmg.total / 2);
    var dc = effect.dc != null ? effect.dc : "?";
    function boomText(where) {
      return " " + dmg.detail + " " + (effect.damageType || "") + " = " + dmg.total + " in " + effect.radius + " ft" + (where ? " " + where : "") +
        ". DEX save DC " + dc + ": fail " + dmg.total + ", success " + half + ". Objects take double (" + (dmg.total * 2) + "); flammable things catch fire.";
    }
    var base = { ok: true, kind: "attack", rings: ringSpec(item, { powderMan: !!ctx.powderMan }), save: "DEX", dc: effect.dc, radius: effect.radius, range: effect.range || "", fuseFace: fuse,
      total: dmg.total, half: half, objects: dmg.total * 2, formula: dmg.formula, detail: dmg.detail, consume: true, noAttackRoll: true };
    // Sweating natural 1: goes off in hand, centered on the thrower.
    if (rules.sweating && fuse === 1) {
      return Object.assign(base, { misfire: true, inHand: true, selfDamage: dmg.total,
        chat: head + ": sweating stick goes off in hand, centered on " + who + "!" + boomText("around " + who) + " " + who + " saves too (half on success)." });
    }
    var where = "";
    if (!placed && dist != null && isFinite(dist) && dist > bands.normal) {
      var dir = 1 + Math.floor((rng || Math.random)() * 8); if (dir > 8) dir = 8;
      base.scatter = { feet: 10, d8: dir, dir: DIRS[dir - 1] };
      where = "(scattered 10 ft " + DIRS[dir - 1] + ", d8 " + dir + ")";
    }
    var timing = placed ? "Goes off when the fuse burns down (fuse cord burns 10 ft per round)." : (effect.fuse === "long" || /long/i.test(item.name) ? "Long fuse: goes off at the start of your next turn." : "Standard fuse: goes off at the end of your turn.");
    if (fuse <= rules.misfireOn) {
      var d6 = 1 + Math.floor((rng || Math.random)() * 6); if (d6 > 6) d6 = 6;
      base.misfire = true; base.misfireD6 = d6;
      if (d6 <= 3) {
        return Object.assign(base, { dud: true, consume: false, total: 0, half: 0, objects: 0,
          chat: head + " (misfires on " + (rules.misfireOn === 1 ? "1" : "1–" + rules.misfireOn) + "). Misfire d6 " + d6 + ": dud. It doesn't go off. Relighting is an action." });
      }
      if (d6 <= 5) {
        base.fast = true;
        return Object.assign(base, { chat: head + ". Misfire d6 " + d6 + ": fast fuse! It goes off halfway" + (placed ? " through the fuse" : " to the target") + "." + boomText("") });
      }
      base.slow = true;
      return Object.assign(base, { chat: head + ". Misfire d6 " + d6 + ": slow burn. It goes off on your next turn." + boomText(where) });
    }
    notes.push(timing);
    if (!placed) notes.push("Light + throw is 1 action; Extra Attack doesn't add throws.");
    if (!placed) notes.push("Optional reaction: anyone can shoot the stick (attack vs AC 15); on a hit it goes off halfway.");
    if (placed) notes.push("Not throwable. Placing is an action, then light it or run fuse cord. Also goes off if it takes fire damage or a gun crit.");
    return Object.assign(base, { chat: head + ", fuse holds." + boomText(where) + " " + notes.join(" ") });
  }

  function use(item, ctx) {
    ctx = ctx || {};
    if (!item) return { ok: false, reason: "No item." };
    var viewer = ctx.viewer || { name: ctx.name || "", dm: !!ctx.dm };
    if (addressedBlank(item, viewer)) {
      return { ok: false, blank: true, kind: "text", reason: "Blank paper.", chat: "Blank paper." };
    }
    var effect = item.effect || { kind: "text" };
    var who = ctx.name || "Someone";
    if (effect.kind === "heal") {
      var healed = rollDice(effect.dice || "0", ctx.rng);
      return {
        ok: true, kind: "heal", formula: healed.formula, total: healed.total, detail: healed.detail,
        consume: consumes(item), hp: healed.total,
        chat: who + " uses " + item.name + ": heals " + healed.total + " (" + healed.detail + ")."
      };
    }
    if (effect.kind === "castSpell") {
      var level = Number(effect.level) || 0;
      var table = scrollTable(level);
      var dc = effect.dc != null ? effect.dc : table.dc;
      var attack = effect.attack != null ? effect.attack : table.attack;
      if (!effect.spell) return { ok: false, kind: "castSpell", reason: "This letter has no spell yet." };
      var charLv = Number(ctx.level) || 1;
      if (level > 0 && level > charLv) {
        var mod = ctx.spellMod != null && ctx.spellMod !== "" ? Number(ctx.spellMod) : (Number(ctx.intMod) || 0);
        var checkDc = 10 + level;
        var face = rollD20(ctx.rng);
        var checkTotal = face + mod;
        if (checkTotal < checkDc) {
          return {
            ok: false, kind: "castSpell", check: true, consume: false, total: checkTotal, dc: checkDc,
            reason: "Spell check " + face + signed(mod) + " = " + checkTotal + " vs DC " + checkDc + ". The letter stays sealed.",
            chat: who + " fails to open " + item.name + " (DC " + checkDc + ")."
          };
        }
      }
      var cast = null;
      if (ctx.cast !== false && root.SSDNSSpellCast && root.SSDNSSpellCast.rollCast) {
        cast = root.SSDNSSpellCast.rollCast({
          spellName: effect.spell,
          slotLevel: level,
          attackBonus: attack,
          dc: dc,
          spellMod: effect.spellMod != null ? effect.spellMod : 0,
          characterLevel: charLv
        });
      }
      var chat = (cast && cast.text) || (who + " reads " + item.name + " and casts " + effect.spell + ".");
      var hp = 0;
      if (cast && /heal/i.test(String(cast.text || "")) && cast.result != null && isFinite(Number(cast.result))) hp = Number(cast.result);
      return {
        ok: true, kind: "castSpell", spell: effect.spell, level: level, dc: dc, attack: attack,
        cast: cast, consume: true, hp: hp, chat: who + " — " + chat, rings: ringSpec(item)
      };
    }
    if (item.type === "explosive" && effect.kind === "attack" && effect.save && effect.radius) return useExplosive(item, effect, ctx, who);
    if (effect.kind === "attack" && effect.misfire) {
      var mfMax = parseInt(String(effect.misfire).split(/[-–]/).pop(), 10) || 0;
      var mfFace = rollD20(ctx.rng);
      if (mfFace <= mfMax) {
        var inHand = mfFace === 1;
        var boom = inHand ? rollDice(effect.damage || "0", ctx.rng) : null;
        return {
          ok: true, kind: "attack", misfire: true, inHand: inHand, face: mfFace, consume: true,
          total: boom ? boom.total : 0, formula: boom ? boom.formula : "", detail: boom ? boom.detail : "",
          save: effect.save || "", dc: effect.dc, radius: effect.radius || 0, selfDamage: boom ? boom.total : 0,
          chat: inHand
            ? who + "'s " + item.name + " goes off in hand! (misfire d20 " + mfFace + ") " + boom.detail + (effect.damageType ? " " + effect.damageType : "") + " = " + boom.total + " to " + who + " and everyone within " + (effect.radius || 5) + " ft" + (effect.save ? " (" + effect.save + " save DC " + (effect.dc != null ? effect.dc : "?") + (effect.onSave === "half" ? " half" : "") + ")" : "") + "."
            : who + "'s " + item.name + " fizzles. Misfire (d20 " + mfFace + ", misfires on " + effect.misfire + "). The stick is lost."
        };
      }
    }
    if (effect.kind === "attack") {
      var dmg = rollDice(effect.damage || "0", ctx.rng);
      var extra = effect.extraDamage ? rollDice(effect.extraDamage, ctx.rng) : null;
      var total = dmg.total + (extra ? extra.total : 0);
      var bits = dmg.detail + (effect.damageType ? " " + effect.damageType : "");
      if (extra) bits += " + " + extra.detail + (effect.extraType ? " " + effect.extraType : "");
      var saveBit = effect.save ? (" " + effect.save + " save DC " + (effect.dc != null ? effect.dc : "?") + (effect.onSave === "half" ? " (half)" : "") + (effect.radius ? ", " + effect.radius + " ft" : "")) : "";
      return {
        ok: true, kind: "attack", total: total, formula: dmg.formula, detail: bits, save: effect.save || "",
        dc: effect.dc, radius: effect.radius || 0, range: effect.range || "", consume: consumes(item),
        rings: ringSpec(item),
        misfireRoll: effect.misfire ? "clean" : "",
        chat: who + " uses " + item.name + (ctx.target ? " on " + ctx.target : "") + ": " + bits + " = " + total + saveBit + "."
      };
    }
    if (effect.kind === "save+condition") {
      var temp = effect.temp ? rollDice(effect.temp, ctx.rng) : null;
      var poison = effect.damage ? rollDice(effect.damage, ctx.rng) : null;
      var line = (effect.save || "Save") + " DC " + (effect.dc != null ? effect.dc : "?");
      if (effect.condition) line += " or " + effect.condition;
      if (effect.duration) line += ", " + effect.duration;
      if (poison) line += ". " + poison.detail + (effect.damageType ? " " + effect.damageType : "");
      if (effect.text) line += ". " + effect.text;
      return {
        ok: true, kind: "save+condition", save: effect.save || "", dc: effect.dc, condition: effect.condition || "",
        duration: effect.duration || "", tempHp: temp ? temp.total : 0, total: poison ? poison.total : 0,
        consume: consumes(item),
        chat: who + " uses " + item.name + ": " + line + (temp ? ". Temp HP " + temp.total + " (" + temp.detail + ")" : "") + "."
      };
    }
    if (effect.kind === "buff") {
      return {
        ok: true, kind: "buff", text: effect.text || item.description || item.name,
        duration: effect.duration || "", consume: consumes(item),
        /* 0.3.69: a damage buff (Eldorite Dust +1d4 for 1 hour) lands on one weapon and reaches its damage roll */
        buff: effect.dmgDice ? { id: item.catalogId || item.id || "", name: item.name, dmgDice: String(effect.dmgDice), hours: Number(effect.hours) || 1 } : null,
        chat: who + " uses " + item.name + ": " + (effect.text || item.name) + (effect.duration ? " (" + effect.duration + ")" : "") + "."
      };
    }
    return {
      ok: true, kind: "text", text: effect.text || item.description || item.name, consume: consumes(item),
      chat: who + " uses " + item.name + ": " + (effect.text || item.description || item.name) + "."
    };
  }

  function spend(item) {
    if (!item) return false;
    if (item.count != null && Number(item.count) > 1 && item.uses && item.uses.max === 1) {
      item.count = Number(item.count) - 1;
      return true;
    }
    if (item.chargesLeft != null && isFinite(Number(item.chargesLeft))) {
      item.chargesLeft = Math.max(0, Number(item.chargesLeft) - 1);
      if (item.chargesLeft <= 0 && item.uses && item.uses.max != null && !item.uses.recharge) {
        item.count = Math.max(0, (Number(item.count) || 1) - 1);
        if (item.count > 0) item.chargesLeft = item.uses.max;
      }
      return true;
    }
    if (consumes(item)) {
      item.count = Math.max(0, (Number(item.count) || 1) - 1);
      return true;
    }
    return false;
  }

  function prune(character) {
    character.items = listOf(character).filter(function (item) {
      if (!item) return false;
      if (item.count != null && Number(item.count) <= 0) return false;
      return true;
    });
  }

  function carryCapacity(str) {
    var score = Number(str);
    if (!isFinite(score)) score = 10;
    return score * 15;
  }

  function totalWeight(items) {
    var sum = 0;
    (items || []).forEach(function (item) {
      if (item && item.noCarry) return; /* 0.3.80: mounts, vehicles and saddle gear ride on the mount */
      var w = num(item && item.weight);
      if (w == null) return;
      var n = Number(item.count);
      if (!isFinite(n) || n < 1) n = 1;
      sum += w * n;
      /* water in a container weighs 8 lb a gallon on top of the empty container
         (fillIncluded: the listed weight is the full container, so only the missing water comes off) */
      if (item.capacity) {
        var fillGal = Math.max(0, Number(item.fill) || 0);
        sum += (fillGal - (item.fillIncluded ? item.capacity * n : 0)) * 8;
      }
      /* meals already eaten out of a multi-meal item (a pack's hardtack) */
      if (item.mealWeight && Number(item.mealsUsed) > 0) sum -= Number(item.mealsUsed) * item.mealWeight;
    });
    return Math.round(sum * 100) / 100;
  }

  /* 0.3.80 inventory build: weight of what lives outside the item list (weapon slots, armor, shield,
     holster rigs / belt, ammo pools, the Calling instrument). rules.js weights are text ("2½ lb.");
     holster, instrument and per-round ammo weights come from SSDNS_CARRY_WEIGHTS (item-catalog-gear.js). */
  function lbOf(text) {
    if (text == null) return 0;
    if (typeof text === "number") return isFinite(text) ? text : 0;
    var t = String(text).replace(/½/g, ".5").replace(/¼/g, ".25").replace(/¾/g, ".75");
    var m = /(\d*\.?\d+)/.exec(t.replace(/(\d)\s+(\.\d)/, "$1$2"));
    return m ? Number(m[1]) : 0;
  }
  function slotWeights(character) {
    var R = root.SSDNS_RULES || {};
    var CW = root.SSDNS_CARRY_WEIGHTS || {};
    var out = { weapons: 0, armor: 0, rigs: 0, ammo: 0, instrument: 0, water: 0 };
    if (!character) return out;
    var lists = [].concat(R.firearms || [], R.casterGuns || [], R.otherRanged || [], R.melee || []);
    function rec(id) { for (var i = 0; i < lists.length; i++) if (lists[i] && lists[i].id === id) return lists[i]; return null; }
    ["guns", "melee"].forEach(function (k) {
      (Array.isArray(character[k]) ? character[k] : []).forEach(function (g) {
        if (!g || !g.weapon) return;
        var w = rec(g.weapon);
        if (!w || w.custom) return; /* created weapons weigh in as their item */
        out.weapons += lbOf(w.weight);
      });
    });
    if (character.armor) {
      var a = (R.armor || []).filter(function (x) { return x && x.id === character.armor; })[0];
      if (a) out.armor += lbOf(a.weight);
    }
    if (character.shield) out.armor += num(CW.shield) || 6;
    var hw = CW.holsters || {}, noCarry = CW.holstersNoCarry || [];
    [character.holster, character.holsterR, character.belt].forEach(function (id) {
      if (id && noCarry.indexOf(id) < 0) out.rigs += num(hw[id]) || 0;
    });
    var each = CW.ammoEach || {};
    (Array.isArray(character.ammo) ? character.ammo : []).forEach(function (pool) {
      if (!pool) return;
      var n = Number(pool.count);
      if (!isFinite(n) || n <= 0) return;
      out.ammo += n * (num(each[pool.type]) || 0);
    });
    if (character.instrument) out.instrument += num((CW.instruments || {})[character.instrument]) || 0;
    /* L0188 food & water: the DM's water count (gallons) weighs 8 lb a gallon. */
    var gal = character.supplies ? Number(character.supplies.water) : 0;
    if (isFinite(gal) && gal > 0) out.water += gal * 8;
    Object.keys(out).forEach(function (k) { out[k] = Math.round(out[k] * 100) / 100; });
    return out;
  }

  function weightReport(character) {
    var str = character && character.abilities ? character.abilities.STR : 10;
    var items = totalWeight(listOf(character));
    var slots = slotWeights(character);
    var carried = items;
    Object.keys(slots).forEach(function (k) { carried += slots[k]; });
    carried = Math.round(carried * 100) / 100;
    var cap = carryCapacity(str);
    return { on: !!room.weightOn, carried: carried, capacity: cap, over: carried > cap, items: items, slots: slots };
  }

  function recharge(character, kind) {
    listOf(character).forEach(function (item) {
      if (!item || !item.uses || item.uses.max == null) return;
      var when = item.uses.recharge || "";
      if (!when) return;
      if (kind === "long" || (kind !== "long" && when === "short") || (when === "dawn" && kind === "long")) {
        item.chargesLeft = item.uses.max;
      }
    });
  }

  function weaponRecord(id) {
    var row = byId(id);
    if (!row || row.type !== "weapon") return null;
    var eff = row.effect || {};
    /* 0.3.69: damage and the +N to hit travel with the record so a melee slot can paint and roll it */
    return { id: row.id, name: row.name, group: row.group || "simple-melee", properties: row.properties || "", range: eff.range || "",
      damage: eff.damage || "", damageType: eff.damageType || "", itemAtk: Number(eff.bonus) || 0 };
  }

  function landWeapon(character, item) {
    if (!character || !item || item.type !== "weapon") return null;
    if (item.weaponId && !item.weapon && root.SSDNSApp && root.SSDNSApp.grantListedWeapon) {
      var granted = root.SSDNSApp.grantListedWeapon(item.weaponId);
      if (granted) return granted;
    }
    var rec = item.weapon && root.SSDNSCustomWeapons ? root.SSDNSCustomWeapons.registerItem(item) : null;
    if (rec) item.weaponId = rec.id;
    var melee = rec ? rec.kind !== "firearm" : (item.slot !== "long" && item.slot !== "pistol");
    if (rec && rec.kind === "firearm" && root.SSDNSApp && root.SSDNSApp.grantListedWeapon) {
      var gunLanded = root.SSDNSApp.grantListedWeapon(rec.id);
      if (gunLanded) return gunLanded;
    }
    var list = melee ? (character.melee || (character.melee = [])) : (character.guns || (character.guns = []));
    var slot = null;
    var i;
    for (i = 0; i < list.length; i++) if (list[i] && !list[i].weapon) { slot = list[i]; break; }
    if (!slot) {
      slot = melee ? { weapon: "", proficient: true, equipped: false } : { weapon: "", proficient: true, equipped: false, loaded: 0, chambers: [] };
      list.push(slot);
    }
    slot.weapon = item.weaponId || item.catalogId || item.id;
    slot.proficient = true;
    slot.equipped = false;
    var index = list.indexOf(slot);
    if (root.SSDNSEquip && root.SSDNSEquip.tryAutoEquip) {
      root.SSDNSEquip.tryAutoEquip(character, { kind: melee ? "melee" : "gun", index: index, lookup: function (key) {
        return weaponRecord(key) || (root.SSDNSEquip.lookupWeapon ? root.SSDNSEquip.lookupWeapon(key) : null);
      } });
    }
    return { ok: true, melee: melee, index: index, equipped: slot.equipped === true, name: item.name };
  }

  function add(character, raw, opts) {
    opts = opts || {};
    if (!character) return { ok: false, reason: "No character." };
    if (character.inventoryLocked && !opts.dm) return { ok: false, reason: "Inventory is locked." };
    var item = instanceFrom(raw, opts);
    if (!item.name) return { ok: false, reason: "Name the item." };
    if (item.type === "quest" && !opts.dm) return { ok: false, reason: "Quest items are DM-only." };
    if (!KINDS[item.effect.kind]) item.effect = { kind: "text", text: item.description || item.name };
    if (item.type === "explosive" || item.type === "consumable" || (item.type === "gear" && item.stack)) {
      var same = listOf(character).filter(function (row) {
        return row && row.type === item.type && row.catalogId && row.catalogId === item.catalogId && !row.addressedTo && !item.addressedTo;
      })[0];
      if (same) {
        same.count = (Number(same.count) || 1) + (Number(item.count) || 1);
        if (same.capacity) same.fill = (Number(same.fill) || 0) + (Number(item.fill) || 0);
        return { ok: true, item: same, merged: true };
      }
    }
    listOf(character).push(item);
    var landed = null;
    if (item.type === "weapon") landed = landWeapon(character, item);
    return { ok: true, item: item, landed: landed };
  }

  /* 0.3.54: the old character.explosives[] rows move into items (one list). */
  function mergeExplosives(character) {
    if (!character || !Array.isArray(character.explosives) || !character.explosives.length) return 0;
    var moved = 0;
    var R = root.SSDNS_RULES || {};
    var old = (R.explosives && R.explosives.items) || [];
    character.items = listOf(character);
    character.explosives.forEach(function (row) {
      if (!row || !row.item) return;
      var n = Number(row.count);
      if (!isFinite(n) || n <= 0) return;
      var have = character.items.filter(function (it) { return it && it.catalogId === row.item; })[0];
      if (have) {
        have.count = Math.max(Number(have.count) || 1, n);
        moved++;
        return;
      }
      var base = byId(row.item);
      if (!base) {
        var o = old.filter(function (x) { return x && x.id === row.item; })[0];
        if (!o) return;
        base = normalize({ id: o.id, name: o.name, type: "gear", description: o.notes || "", effect: { kind: "text", text: o.notes || o.name } });
      }
      var inst = instanceFrom(Object.assign({}, base, { count: n }), {});
      character.items.push(inst);
      moved++;
    });
    character.explosives = [];
    return moved;
  }

  /* Attunement (DND Bot 2026-10-18): cap 3 per character; the DM can override the cap. */
  function attuneCap(character) {
    var n = Number(character && character.attuneCap);
    return isFinite(n) && n > 0 ? n : 3;
  }
  function attunedCount(character) {
    return listOf(character).filter(function (it) { return it && it.attuned; }).length;
  }
  function setAttuned(character, id, on, opts) {
    opts = opts || {};
    var item = find(character, id);
    if (!item) return { ok: false, reason: "No item." };
    if (!item.attune && !opts.dm) return { ok: false, reason: item.name + " doesn't need attunement." };
    if (on && !item.attuned && !opts.dm && attunedCount(character) >= attuneCap(character)) {
      return { ok: false, reason: "You can attune to " + attuneCap(character) + " items. End one first." };
    }
    if (item.cursed && !on && !opts.dm) return { ok: false, reason: "Cursed. It won't let go." };
    item.attuned = !!on;
    return { ok: true, item: item, count: attunedCount(character) };
  }

  /* DM reward text -> where it belongs. instrument | explosive | consumable | item | weapon | "" */
  function classifyReward(text, id) {
    var raw = String(id || text || "").replace(/^\s*\d+\s*x\s+/i, "").trim();
    var low = normName(raw);
    if (!low) return { kind: "" };
    var R = root.SSDNS_RULES || {};
    var inst = ((R.storytellerGear && R.storytellerGear.instruments) || []).filter(function (g) {
      if (!g || g.id === "voice") return false;
      var n = normName(g.name);
      return low === n || low === normName(g.id) || low.indexOf(n) >= 0;
    })[0];
    if (inst) return { kind: "instrument", id: inst.id, name: inst.name, quality: /quality|fine/i.test(raw) ? "quality" : "cheap" };
    var rows = catalog({ dm: true });
    var hit = rows.filter(function (r) { return normName(r.id) === low || normName(r.name) === low; })[0] ||
      rows.filter(function (r) { var n = normName(r.name); return n.length > 4 && low.indexOf(n) >= 0; })[0];
    if (hit) return { kind: hit.type === "explosive" ? "explosive" : (hit.type === "consumable" || hit.type === "scroll" ? "consumable" : "item"), id: hit.id, name: hit.name, row: hit };
    var oldExp = ((R.explosives && R.explosives.items) || []).filter(function (x) { return normName(x.name) === low || normName(x.id) === low || low.indexOf(normName(x.name)) >= 0; })[0];
    if (oldExp) return { kind: "explosive", id: oldExp.id, name: oldExp.name, legacy: oldExp };
    return { kind: "" };
  }

  function drop(character, id, opts) {
    opts = opts || {};
    var item = find(character, id);
    if (!item) return { ok: false, reason: "No item." };
    if (character.inventoryLocked && !opts.dm) return { ok: false, reason: "Inventory is locked." };
    if (!canDrop(item, opts)) return { ok: false, reason: "Quest items stay unless the DM allows it." };
    item.count = 0;
    prune(character);
    return { ok: true, item: item };
  }

  /* inv2 (0.3.85): Unpack a pack (Trail kit, Claim pack, ...) into its real catalog items. One pack is used up per
     unpack, so nothing is doubled; 5E parts with no catalog row land as one gear note line. */
  function packContents(item) {
    var map = root.SSDNS_PACK_CONTENTS || {};
    var id = item && item.catalogId;
    return id && Object.prototype.hasOwnProperty.call(map, id) ? map[id] : null;
  }
  function unpack(character, id, opts) {
    opts = opts || {};
    var item = find(character, id);
    if (!item) return { ok: false, reason: "No item." };
    var pack = packContents(item);
    if (!pack) return { ok: false, reason: "That isn't a pack." };
    if (character.inventoryLocked && !opts.dm) return { ok: false, reason: "Inventory is locked." };
    var n = Number(item.count == null ? 1 : item.count) || 0;
    if (n <= 0) return { ok: false, reason: "No item." };
    /* supplies (0.3.85): the unpacked pack takes the meals already eaten and the water already drunk with it,
       so Unpack hands out only the hardtack and water still in the pack */
    var mealsEach = Number(item.meals) || 0, used = Math.max(0, Number(item.mealsUsed) || 0);
    var thisUsed = mealsEach > 0 ? Math.min(used, mealsEach) : 0;
    if (mealsEach > 0) item.mealsUsed = used - thisUsed;
    var cap = Number(item.capacity) || 0, thisFill = null;
    if (cap > 0) {
      var total = Math.max(0, Number(item.fill == null ? cap * n : item.fill) || 0);
      thisFill = Math.max(0, Math.min(cap, total - (n - 1) * cap));
      item.fill = Math.round((total - thisFill) * 1000) / 1000;
    }
    item.count = n - 1;
    prune(character);
    var added = [];
    (pack.items || []).forEach(function (pair) {
      var want = pair[1] || 1;
      var row = byId(pair[0]);
      if (thisUsed > 0 && row && hasTag(row, "food")) { want -= thisUsed; if (want <= 0) return; }
      var res = add(character, { catalogId: pair[0], count: want }, { dm: true });
      if (res && res.ok) {
        added.push([pair[0], want]);
        var got = res.item || null;
        if (thisFill != null && row && row.capacity && got && got.capacity) {
          var miss = Math.max(0, row.capacity * want - thisFill);
          got.fill = Math.max(0, Math.round(((Number(got.fill) || 0) - miss) * 1000) / 1000);
          thisFill = Math.max(0, thisFill - row.capacity * want);
        }
      }
    });
    var notes = (pack.notes || []).slice();
    if (notes.length) {
      var line = "• From " + (item.name || "pack") + ": " + notes.join(", ");
      var cur = character.equipment || "";
      if (cur.indexOf(line) < 0) character.equipment = (cur ? cur.replace(/\s+$/, "") + "\n" : "") + line;
    }
    return { ok: true, item: item, added: added, notes: notes };
  }

  function setRoom(next) {
    next = next || {};
    room.weightOn = !!next.weightOn;
    if (next.catalog && typeof next.catalog === "object") room.catalog = next.catalog;
    paintSheet();
    paintWeight();
  }

  function showUse(item, viewer) {
    if (!item || addressedBlank(item, viewer)) return false;
    var kind = item.effect && item.effect.kind;
    if (item.type === "consumable" || item.type === "scroll" || item.type === "explosive") return true;
    if (item.type === "weapon" && kind === "attack" && !consumes(item)) return false;
    if (kind === "heal" || kind === "castSpell" || kind === "attack" || kind === "save+condition" || kind === "buff") return true;
    return consumes(item);
  }

  var DEFAULT_ART = { gear: "gear", consumable: "consumable", scroll: "scroll", explosive: "explosive", weapon: "weapon", wondrous: "quest", quest: "quest", story: "quest" };
  function artSrc(item) {
    var path = item && item.art ? String(item.art) : "";
    if (!path && root.SSDNSItemArt && root.SSDNSItemArt.srcFor) path = root.SSDNSItemArt.srcFor(item) || "";
    if (path && /^(https?:|data:|\.\.|blob:)/.test(path)) return path;
    if (path && root.SSDNSItemArt && root.SSDNSItemArt.srcFor && path === root.SSDNSItemArt.srcFor(item)) return path;
    /* Worn gear (hats, armor, holsters, rings...) uses the paper-doll gear art before the generic default. */
    if (!path && item && root.SSDNSDoll && root.SSDNSDoll.gearArtSrc && (item.wear || item.equipSlot || (root.SSDNSDoll.GEAR_ART_BY_ID || {})[item.catalogId || item.id])) {
      var g = root.SSDNSDoll.gearArtSrc(item, item.equipSlot || "");
      if (g) return g;
    }
    if (!path && item && item.type) path = "assets/images/items/defaults/" + (DEFAULT_ART[item.type] || "gear") + ".svg";
    if (!path) return "";
    var prefix = "";
    try {
      var loc = (root.location && root.location.pathname) || "";
      if (loc.indexOf("/dm/") >= 0) prefix = "../";
    } catch (e) {}
    if (/^(https?:|data:|\.\.)/.test(path)) return path;
    return prefix + path.replace(/^\//, "");
  }

  function thumb(item) {
    var src = artSrc(item);
    if (!src) return '<span class="art-ph" title="Art placeholder">Item</span>';
    return '<img class="art-thumb" alt="" src="' + esc(src) + '">';
  }

  function tags(item) {
    var extra = [];
    if (item && item.rarity) extra.push(item.rarity);
    if (item && item.attune) extra.push(item.attuned ? "attuned" : "requires attunement");
    if (item && item.type === "weapon" && item.weapon) extra.push("weapon · on Gear");
    return extra.concat(tagsBase(item));
  }
  function tagsBase(item) {
    var bits = [];
    if (item.playerAdded && !item.approved) bits.push("player-added");
    else if (item.playerAdded) bits.push("player-added · approved");
    if (questItem(item)) bits.push("quest");
    if (item.story || item.forSale === false) bits.push("not for sale");
    if (item.addressedTo) bits.push("addressed");
    return bits;
  }

  function character() {
    var doc = root.SSDNSApp && root.SSDNSApp.doc && root.SSDNSApp.doc();
    return doc && doc.character;
  }

  function viewerOf(c) {
    c = c || character() || {};
    return { name: c.name || "", dm: false };
  }

  function commit() {
    if (root.SSDNSApp && root.SSDNSApp.applyPatch) {
      root.SSDNSApp.applyPatch(function () {});
    }
  }

  function post(text) {
    if (!text) return;
    if (root.SSDNSSheet && root.SSDNSSheet.addLog) root.SSDNSSheet.addLog({ kind: "item", text: text });
    if (root.SSDNSDmJoin && root.SSDNSDmJoin.postChat) root.SSDNSDmJoin.postChat({ text: text });
  }

  /* 0.3.69: the buff goes on your first equipped gun (else your first equipped melee weapon) for its hours.
     The sheet adds the dice to that weapon's damage while it lasts. */
  function applyBuff(c, buff) {
    if (!c || !buff) return "";
    var key = "";
    var label = "";
    (c.guns || []).forEach(function (g, gi) { if (!key && g && g.weapon && g.equipped !== false) { key = "gun:" + gi; label = g.weapon; } });
    if (!key) (c.melee || []).forEach(function (m, mi) { if (!key && m && m.weapon && m.equipped !== false) { key = "melee:" + mi; label = m.weapon; } });
    if (!key) return " No weapon in hand to dust.";
    var until = Date.now() + buff.hours * 3600 * 1000;
    var now = Date.now();
    c.buffs = (Array.isArray(c.buffs) ? c.buffs : []).filter(function (b) { return b && (!b.until || Number(b.until) > now) && !(b.id === buff.id && b.weapon === key); });
    c.buffs.push({ id: buff.id, name: buff.name, dmgDice: buff.dmgDice, weapon: key, until: until });
    var R = root.SSDNS_RULES || {};
    var hit = [].concat(R.firearms || [], R.melee || [], R.otherRanged || []).filter(function (w) { return w && w.id === label; })[0] || byId(label);
    var rec = hit && hit.name ? hit.name : "";
    var at = new Date(until);
    var hh = at.getHours(), mm = at.getMinutes();
    return " +" + buff.dmgDice + " damage on " + (rec || label) + " until " + ((hh % 12) || 12) + ":" + (mm < 10 ? "0" : "") + mm + (hh < 12 ? " AM" : " PM") + ".";
  }
  function applyHp(plan) {
    if (!plan || !plan.hp) return;
    if (root.SSDNSSheet && root.SSDNSSheet.applyDelta) root.SSDNSSheet.applyDelta(plan.hp, plan.chat || "");
  }

  function applyTemp(plan) {
    if (!plan || !plan.tempHp) return;
    var c = character();
    if (!c) return;
    c.hpTemp = (Number(c.hpTemp) || 0) + plan.tempHp;
    var box = document.getElementById("inHPTemp");
    if (box) {
      box.value = String(c.hpTemp);
      try { box.dispatchEvent(new Event("input", { bubbles: true })); } catch (e) {}
    }
  }

  function showRings(spec) {
    if (!spec) return;
    var sel = document.querySelector('[data-act="rangeWeapon"]');
    var box = document.querySelector('[data-act="showRange"]');
    if (box && !box.checked) {
      box.checked = true;
      try { box.dispatchEvent(new Event("change", { bubbles: true })); } catch (e) {}
    }
    if (sel && spec.id) {
      if (sel.querySelector('option[value="' + spec.id.replace(/"/g, "") + '"]')) sel.value = spec.id;
      try { sel.dispatchEvent(new Event("change", { bubbles: true })); } catch (e2) {}
    }
  }

  function useOnSheet(id, opts) {
    opts = opts || {};
    var c = character();
    var item = find(c, id);
    if (!item) return { ok: false, reason: "No item." };
    var aim = root.SSDNSSheet && root.SSDNSSheet.ensureAttackTarget;
    if (item.type === "explosive" && item.effect && item.effect.kind === "attack" && !item.effect.placed && aim && !opts.aimed) {
      return Promise.resolve(aim()).then(function (ok) {
        if (!ok) return { ok: false, reason: "No target." };
        return useOnSheet(id, { aimed: true });
      });
    }
    var tgt = item.type === "explosive" && root.SSDNSPlaytest && root.SSDNSPlaytest.targetInfo ? root.SSDNSPlaytest.targetInfo() : null;
    var computed = root.SSDNSApp && root.SSDNSApp.compute ? root.SSDNSApp.compute() : {};
    var distSel = typeof document !== "undefined" ? document.getElementById("explosiveDist") : null;
    var plan = use(item, {
      distance: opts.distance != null ? opts.distance : (distSel && distSel.value ? Number(distSel.value) : null),
      powderMan: Array.isArray(c.feats) && c.feats.indexOf("powder-man") >= 0,
      name: c.name || "Someone",
      level: c.level || 1,
      spellMod: computed.spellMod,
      intMod: computed.mods && computed.mods.INT,
      viewer: viewerOf(c),
      target: tgt && tgt.name ? tgt.name : ""
    });
    if (!plan.ok) {
      if (plan.chat || plan.reason) post(plan.chat || plan.reason);
      return plan;
    }
    if (plan.consume) {
      spend(item);
      prune(c);
    }
    if (plan.selfDamage && root.SSDNSApp && root.SSDNSApp.applyPatch) {
      root.SSDNSApp.applyPatch(function (d) {
        var ch = d.character;
        var cur = Number(ch.hpCurrent);
        if (isFinite(cur)) ch.hpCurrent = Math.max(0, cur - plan.selfDamage);
      });
    }
    if (plan.hp) applyHp(plan);
    if (plan.tempHp) applyTemp(plan);
    if (plan.buff) plan.chat += applyBuff(c, plan.buff);
    if (plan.rings) showRings(plan.rings);
    post(plan.chat);
    commit();
    paintSheet();
    return plan;
  }

  function paintWeight() {
    var line = document.getElementById("weightLine");
    if (!line) return;
    var report = weightReport(character() || { abilities: { STR: 10 }, items: [] });
    if (!report.on) { line.hidden = true; line.textContent = ""; return; }
    line.hidden = false;
    line.textContent = "Carried " + report.carried + " / " + report.capacity + " lb" + (report.over ? " (over capacity)" : "");
    var sl = report.slots || {};
    var parts = [["items", report.items], ["weapons", sl.weapons], ["armor", sl.armor], ["rigs", sl.rigs], ["ammo", sl.ammo], ["instrument", sl.instrument], ["water", sl.water]]
      .filter(function (p) { return p[1]; }).map(function (p) { return p[0] + " " + p[1]; });
    line.title = parts.length ? "Carried: " + parts.join(" · ") + " lb. Mounts, saddles and saddlebags don't count." : "";
    if (parts.length) line.textContent += " · " + parts.join(" · ");
  }

  function rowHtml(item, c) {
    var view = present(item, viewerOf(c));
    var tag = tags(item).map(function (t) { return '<span class="item-tag">' + esc(t) + "</span>"; }).join(" ");
    var count = item.count && Number(item.count) > 1 ? " ×" + item.count : "";
    var charges = item.chargesLeft != null && item.uses && item.uses.max != null ? " (" + item.chargesLeft + "/" + item.uses.max + ")" : "";
    var useBtn = showUse(item, viewerOf(c)) && !view.blank
      ? '<button type="button" class="btn xs" data-item-use="' + esc(item.uid) + '">Use</button>'
      : "";
    var unpackBtn = packContents(item) && !(c && c.inventoryLocked) && !view.blank
      ? '<button type="button" class="btn xs" data-item-unpack="' + esc(item.uid) + '" title="Take everything out: the pack becomes its real items (with their weights).">Unpack</button> '
      : "";
    var dropBtn = canDrop(item, { dm: false, inventoryLocked: !!(c && c.inventoryLocked) })
      ? '<button type="button" class="btn xs ghost" data-item-drop="' + esc(item.uid) + '">Drop</button>'
      : "";
    var lock = c && c.inventoryLocked ? '<span class="item-tag">locked</span>' : "";
    var D = root.SSDNSDoll;
    if (D && D.wearable && D.wearable(item)) {
      var worn = D.wornLabel(c, item);
      lock += ' <button type="button" class="btn xs' + (worn ? " btn-primary" : "") + '" data-item-wear-toggle="' + esc(item.uid) + '" title="' + esc(worn ? "Worn on the paper doll (" + worn + "). Click to take it off." : "Put it on its paper doll slot.") + '">' + esc(worn ? "Worn: " + worn + " ✓" : "Wear") + "</button>";
    }
    if (item.attune) {
      lock += ' <button type="button" class="btn xs' + (item.attuned ? " btn-primary" : "") + '" data-item-attune="' + esc(item.uid) + '" title="Attunement: up to ' + attuneCap(c) + ' items">' + (item.attuned ? "Attuned ✓" : "Attune") + "</button>";
    }
    var pips = root.SSDNSTrackers && root.SSDNSTrackers.itemPips ? root.SSDNSTrackers.itemPips(item) : ""; /* SAMPLE trackers: count pips */
    var wt = item.weight != null && isFinite(Number(item.weight)) ? ' <span class="fine item-wt" title="' + (item.noCarry ? "Rides on your mount; not counted in what you carry" : "Weight each") + '">' + (item.noCarry && !Number(item.weight) ? "not carried" : esc(item.weight) + " lb" + (item.noCarry ? " · on mount" : "")) + "</span>" : "";
    return '<div class="item-row">' + thumb(view) + '<div><b>' + esc(view.name) + esc(count) + esc(charges) + "</b>" + wt + pips + " " + tag + " " + lock +
      '<div class="fine">' + esc(view.description || (view.effect && view.effect.text) || "") + "</div>" +
      useBtn + " " + unpackBtn + dropBtn + "</div></div>";
  }

  function formHtml(opts) {
    opts = opts || {};
    var dm = !!opts.dm;
    var rows = catalog({ dm: dm });
    /* 0.3.80: the catalog select is grouped (type, and shelf for gear) now that every PHB gear line is an item */
    var groupsOf = {}, groupOrder = [];
    rows.slice().sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); }).forEach(function (row) {
      var label = row.type === "gear" ? (row.shelf || "Gear") : (row.type.charAt(0).toUpperCase() + row.type.slice(1));
      if (!groupsOf[label]) { groupsOf[label] = []; groupOrder.push(label); }
      groupsOf[label].push(row);
    });
    var TYPE_FIRST = ["Weapon", "Explosive", "Consumable", "Scroll", "Gear"].concat(SHELF_ORDER).concat(["Quest"]);
    groupOrder.sort(function (a, b) {
      var ia = TYPE_FIRST.indexOf(a), ib = TYPE_FIRST.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
    });
    var options = '<option value="">Custom item…</option>' + groupOrder.map(function (label) {
      return '<optgroup label="' + esc(label) + '">' + groupsOf[label].map(function (row) {
        return '<option value="' + esc(row.id) + '">' + esc(row.name) + "</option>";
      }).join("") + "</optgroup>";
    }).join("");
    var types = ["consumable", "scroll", "explosive", "gear", "weapon"].concat(dm ? ["quest"] : []);
    return '<form class="item-form" data-item-form>' +
      '<label>Catalog <select data-item-catalog>' + options + "</select></label>" +
      '<label>Name <input data-item-name type="text" aria-label="Item name"></label>' +
      '<label>Type <select data-item-type>' + types.map(function (t) { return '<option value="' + t + '">' + t + "</option>"; }).join("") + "</select></label>" +
      '<label>Effect <select data-item-effect>' +
        '<option value="heal">heal</option><option value="castSpell">castSpell</option><option value="attack">attack</option>' +
        '<option value="save+condition">save+condition</option><option value="buff">buff</option><option value="text">text</option>' +
      "</select></label>" +
      '<label>Dice / damage <input data-item-dice type="text" placeholder="2d4+2"></label>' +
      '<label>Spell <input data-item-spell type="text" placeholder="Cure Wounds"></label>' +
      '<label>Spell level <input data-item-level type="number" min="0" max="9" value="1"></label>' +
      '<label>Save <input data-item-save type="text" placeholder="DEX"></label>' +
      '<label>DC <input data-item-dc type="number" min="0"></label>' +
      '<label>Condition <input data-item-condition type="text" placeholder="Poisoned"></label>' +
      '<label>Range <input data-item-range type="text" placeholder="30/60"></label>' +
      '<label>Radius (ft) <input data-item-radius type="number" min="0"></label>' +
      '<label>Text <input data-item-text type="text"></label>' +
      '<label>Uses (blank = unlimited) <input data-item-uses type="number" min="0"></label>' +
      '<label>Recharge <select data-item-recharge><option value="">Never (used up)</option><option value="short">Short rest</option><option value="long">Long rest</option><option value="dawn">Dawn</option></select></label>' +
      '<label>Worn on <select data-item-wear><option value="">— (trinket / not worn)</option><option value="head">Head</option><option value="neck">Neck</option><option value="cloak">Cloak</option><option value="armor">Armor</option><option value="belt">Belt</option><option value="holster">Holster rig</option><option value="gloves">Gloves</option><option value="legs">Legs</option><option value="boots">Boots</option><option value="ring">Ring</option><option value="shield">Shield</option></select></label>' +
      '<label>Worn bonus <input data-item-bonus type="text" placeholder="e.g. ac +1, init +1, dex +2"></label>' +
      '<label>Rarity <select data-item-rarity><option value="">—</option><option>Common</option><option>Uncommon</option><option>Rare</option><option>Very Rare</option></select></label>' +
      '<label class="chk"><input type="checkbox" data-item-attune> Requires attunement</label>' +
      '<fieldset class="item-weapon-fields" data-item-weapon-fields hidden><legend>Weapon</legend>' +
        '<label>Kind <select data-item-wkind><option value="melee">Melee</option><option value="firearm">Firearm</option><option value="thrown">Thrown</option><option value="bow">Bow</option></select></label>' +
        '<label>Ability <select data-item-wability><option value="STR">STR</option><option value="DEX">DEX</option><option value="finesse">Finesse (best of STR/DEX)</option></select></label>' +
        '<label>Proficiency <select data-item-wcat><option value="simple">Simple</option><option value="martial">Martial</option></select></label>' +
        '<label>Gun type <select data-item-wgroup><option value="pistol">Pistol</option><option value="rifle">Rifle</option><option value="carbine">Carbine</option><option value="shotgun">Shotgun</option></select></label>' +
        '<label>Damage <input data-item-wdmg type="text" placeholder="1d8"></label>' +
        '<label>Damage type <select data-item-wtype><option>bludgeoning</option><option>piercing</option><option>slashing</option><option>fire</option></select></label>' +
        '<label>Magic bonus <input data-item-wmagic type="number" min="0" max="3" value="0"></label>' +
        '<label>Range <input data-item-wrange type="text" placeholder="20/60 or —"></label>' +
        '<label>Properties <input data-item-wprops type="text" placeholder="light, two-handed, close quarters"></label>' +
        '<label>Caliber <input data-item-wcal type="text" placeholder=".44-40"></label>' +
        '<label>Capacity <input data-item-wcap type="number" min="1" max="20" value="6"></label>' +
        '<label>Misfire <input data-item-wmf type="text" placeholder="1 or 1–2" value="1"></label>' +
        '<label>Load <select data-item-wload><option value="cartridge">Cartridge</option><option value="percussion">Cap &amp; ball</option></select></label>' +
        '<label class="chk"><input type="checkbox" data-item-wslow> Slow reload</label>' +
      "</fieldset>" +
      '<label>Weight (lb) <input data-item-weight type="number" min="0" step="0.1"></label>' +
      '<fieldset class="item-supply-fields"><legend>Food &amp; water</legend>' +
        '<label>Tags <input data-item-tags type="text" placeholder="food, water, container"></label>' +
        '<label>Meals (days of food each) <input data-item-meals type="number" min="0" step="0.5"></label>' +
        '<label>Water (gal of drink each) <input data-item-water type="number" min="0" step="0.5"></label>' +
        '<label>Holds (gal, container) <input data-item-capacity type="number" min="0" step="0.125"></label>' +
        '<label class="chk"><input type="checkbox" data-item-fullfill> Starts full</label>' +
      "</fieldset>" +
      '<label>Price ES (blank = not for sale) <input data-item-price type="number" min="0"></label>' +
      '<label>Art: image link or path <input data-item-art type="text" placeholder="https://… (Dropbox/Drive/any host) or assets/img/items/….webp"></label>' +
      '<div class="art-upload"><label>Upload art <input type="file" accept="image/png,image/webp,image/jpeg" data-art-file data-art-target="[data-item-art]"></label>' +
      '<p class="fine" data-art-note>Paste an image link above, or upload. Best: 512×512 PNG or WEBP, under 1 MB. Uploads are cropped to a square and saved in the character file. No art? The item uses its type picture.</p></div>' +
      '<label>Addressed to <input data-item-address type="text" placeholder="Blank = anyone"></label>' +
      (dm ? '<label class="chk"><input type="checkbox" data-item-allow-drop> DM allows drop</label><label class="chk"><input type="checkbox" data-item-allow-rob> DM allows rob</label>' : "") +
      '<div class="item-form-actions"><button type="button" class="btn sm" data-item-add>' + (dm ? "Give item" : "Add item") + "</button>" +
      (dm ? '<button type="button" class="btn sm" data-item-catalog-save>Save to room catalog</button>' : "") +
      "</div></form>";
  }

  function readForm(form) {
    function val(name) {
      var el = form.querySelector("[data-item-" + name + "]");
      return el ? el.value : "";
    }
    function on(name) {
      var el = form.querySelector("[data-item-" + name + "]");
      return !!(el && el.checked);
    }
    var kind = val("effect") || "text";
    var usesRaw = val("uses");
    var priceRaw = val("price");
    var weightRaw = val("weight");
    var effect = { kind: kind };
    if (val("dice")) {
      if (kind === "heal") effect.dice = val("dice");
      else effect.damage = val("dice");
    }
    if (val("spell")) effect.spell = val("spell");
    if (val("level") !== "") effect.level = Number(val("level"));
    if (val("save")) effect.save = val("save");
    if (val("dc") !== "") effect.dc = Number(val("dc"));
    if (val("condition")) effect.condition = val("condition");
    if (val("range")) effect.range = val("range");
    if (val("radius") !== "") effect.radius = Number(val("radius"));
    if (val("text")) effect.text = val("text");
    var id = val("catalog") || ("custom-" + normName(val("name")).replace(/\s+/g, "-"));
    var type = val("type") || "gear";
    var weapon = null;
    if (type === "weapon" && !val("catalog")) {
      weapon = {
        kind: val("wkind") || "melee",
        ability: val("wability") || "STR",
        category: val("wcat") || "simple",
        group: val("wgroup") || "pistol",
        damage: val("wdmg") || val("dice") || "1d6",
        dmgType: val("wtype") || "bludgeoning",
        magic: Number(val("wmagic")) || 0,
        range: val("wrange") || (val("range") || ""),
        properties: val("wprops") || "",
        caliber: val("wcal") || "",
        capacity: Number(val("wcap")) || 6,
        misfire: val("wmf") || "1",
        load: val("wload") || "cartridge",
        slow: on("wslow")
      };
      effect = { kind: "attack", damage: weapon.damage, damageType: weapon.dmgType, range: weapon.range };
    }
    var recharge = val("recharge");
    return normalize({
      weapon: weapon,
      attune: on("attune"),
      rarity: val("rarity"),
      wear: val("wear") || "",
      bonuses: parseBonus(val("bonus")),
      id: id,
      name: val("name") || "Item",
      type: type,
      description: val("text") || "",
      effect: effect,
      uses: usesRaw === "" ? { max: null } : { max: Number(usesRaw), recharge: recharge },
      weight: weightRaw === "" ? null : Number(weightRaw),
      price: priceRaw === "" ? null : Number(priceRaw),
      forSale: priceRaw !== "",
      art: val("art") || "",
      dmAllowDrop: on("allow-drop"),
      dmAllowRob: on("allow-rob"),
      tags: tagsOf(val("tags")),
      meals: val("meals"),
      water: val("water"),
      capacity: val("capacity"),
      defaultFill: on("fullfill") ? "full" : ""
    });
  }

  function fillForm(form, id) {
    var row = byId(id);
    if (!row || !form) return;
    function set(name, value) {
      var el = form.querySelector("[data-item-" + name + "]");
      if (el) el.value = value == null ? "" : String(value);
    }
    set("name", row.name);
    set("type", row.type);
    set("effect", row.effect.kind);
    set("dice", row.effect.dice || row.effect.damage || "");
    set("spell", row.effect.spell || "");
    set("level", row.effect.level != null ? row.effect.level : "");
    set("save", row.effect.save || "");
    set("dc", row.effect.dc != null ? row.effect.dc : "");
    set("condition", row.effect.condition || "");
    set("range", row.effect.range || "");
    set("radius", row.effect.radius != null ? row.effect.radius : "");
    set("text", row.effect.text || row.description || "");
    set("uses", row.uses.max == null ? "" : row.uses.max);
    set("weight", row.weight == null ? "" : row.weight);
    set("price", row.price == null ? "" : row.price);
    set("art", row.art || "");
    set("recharge", (row.uses && row.uses.recharge) || "");
    set("rarity", row.rarity || "");
    set("tags", (row.tags || []).join(", "));
    set("meals", row.meals == null ? "" : row.meals);
    set("water", row.water == null ? "" : row.water);
    set("capacity", row.capacity == null ? "" : row.capacity);
    var ff = form.querySelector("[data-item-fullfill]");
    if (ff) ff.checked = row.defaultFill === "full";
    var att = form.querySelector("[data-item-attune]");
    if (att) att.checked = !!row.attune;
    toggleWeaponFields(form);
  }
  function toggleWeaponFields(form) {
    if (!form) return;
    var type = form.querySelector("[data-item-type]");
    var cat = form.querySelector("[data-item-catalog]");
    var box = form.querySelector("[data-item-weapon-fields]");
    if (box) box.hidden = !(type && type.value === "weapon" && !(cat && cat.value));
  }

  function paintSheet() {
    var list = document.getElementById("itemList");
    var slot = document.getElementById("itemFormSlot");
    if (!list) return;
    var c = character();
    var items = c ? listOf(c) : [];
    var attuneLine = c && items.some(function (it) { return it && it.attune; })
      ? '<p class="fine attune-line">Attuned ' + attunedCount(c) + " / " + attuneCap(c) + "</p>" : "";
    list.innerHTML = attuneLine + (items.length ? items.map(function (item) { return rowHtml(item, c); }).join("") : '<p class="fine">No catalog items yet.</p>');
    var freeAdd = playerFreeAdd();
    if (slot) {
      var menuEl = slot.querySelector("[data-add-item-menu]");
      if (!menuEl || menuEl.getAttribute("data-free-add") !== (freeAdd ? "1" : "0")) slot.innerHTML = addMenuHtml();
    }
    /* a locked inventory blocks the item-add parts only; the Equipment-notes entries stay usable */
    var locked = !!(c && c.inventoryLocked);
    if (slot) slot.querySelectorAll("[data-add-item-search], [data-add-item-pick], [data-add-item-custom], [data-add-item-formwrap] button, [data-add-item-formwrap] input, [data-add-item-formwrap] select").forEach(function (el) { el.disabled = locked; });
    if (locked && slot) setAddForm(slot, false);
    paintWeight();
  }

  /* 0.3.76: the player's free-add item area is one compact "Add item ▾" menu.
     Pick list grouped by type (with search when long); the custom-item form opens
     from the menu. Picking a catalog row runs the exact same add path the old
     always-open form used (catalog select + fillForm + readForm + add).
     FINAL STRETCH: players will only get items from the store or the DM, so the
     item-add parts (pick list, search, custom form) hide behind ONE flag:
     window.SSDNS_PLAYER_FREE_ADD = false. The "PHB gear (notes)" and "Starting kit…"
     entries stay either way: they only append text to the Equipment notes. */
  var ADD_GROUPS = [
    { type: "weapon", label: "Weapons" },
    { type: "explosive", label: "Explosives" },
    { type: "consumable", label: "Consumables" },
    { type: "scroll", label: "Scrolls" },
    { type: "gear", label: "Gear" }
  ];
  var ADD_SEARCH_MIN = 12;
  function playerFreeAdd() { return root.SSDNS_PLAYER_FREE_ADD !== false; }
  function addPickRows() {
    return catalog({ dm: false }).slice().sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
  }
  function addGroupsHtml(rows, query) {
    var q = normName(query || "");
    var known = {};
    ADD_GROUPS.forEach(function (g) { known[g.type] = 1; });
    var groups = ADD_GROUPS.concat([{ type: "", label: "Other" }]);
    var html = groups.map(function (g) {
      var list = rows.filter(function (row) {
        var inGroup = g.type ? row.type === g.type : !known[row.type];
        return inGroup && (!q || normName(row.name + " " + row.type + " " + (row.shelf || "")).indexOf(q) >= 0);
      });
      if (!list.length) return "";
      return '<div class="add-item-group" data-add-item-group="' + esc(g.type || "other") + '"><div class="add-item-group-head">' + esc(g.label) + ' <span class="fine">' + list.length + "</span></div>" +
        shelved(list, g.type).map(function (row) {
          if (row.shelfHead) return '<div class="add-item-shelf-head" data-add-item-shelf="' + esc(row.shelfHead) + '">' + esc(row.shelfHead) + "</div>";
          var bits = [];
          if (row.effect && (row.effect.dice || row.effect.damage)) bits.push(row.effect.dice || row.effect.damage);
          if (row.price != null && row.forSale) bits.push(row.price + " ES");
          if (row.weight != null) bits.push(row.weight + " lb");
          return '<button type="button" class="add-item-pick" data-add-item-pick="' + esc(row.id) + '" role="menuitem">' + esc(row.name) +
            (bits.length ? ' <span class="fine">' + esc(bits.join(" · ")) + "</span>" : "") + "</button>";
        }).join("") + "</div>";
    }).join("");
    return html || '<p class="fine add-item-empty">No items match.</p>';
  }
  /* 0.3.80 inventory build: Gear is one group, split by shelf (sub-heads only; picks stay in the gear group). */
  var SHELF_ORDER = ["Adventuring gear", "Frontier gear", "Packs", "Tools", "Clothes", "Foci", "Instruments", "Storyteller gear", "Blasting gear", "Mounts & tack", "Special finds"];
  function shelved(list, type) {
    if (type !== "gear" || !list.some(function (r) { return r.shelf; })) return list;
    var rank = function (r) { var i = SHELF_ORDER.indexOf(r.shelf || ""); return i < 0 ? (r.shelf ? SHELF_ORDER.length : SHELF_ORDER.length + 1) : i; };
    var sorted = list.slice().sort(function (a, b) { return rank(a) - rank(b) || String(a.shelf || "").localeCompare(String(b.shelf || "")) || String(a.name).localeCompare(String(b.name)); });
    var out = [], last = null;
    sorted.forEach(function (r) {
      var head = r.shelf || "Other gear";
      if (head !== last) { out.push({ shelfHead: head }); last = head; }
      out.push(r);
    });
    return out;
  }
  function addNotesHtml() {
    return '<div class="add-item-group add-item-group-notes" data-add-item-group="notes"><div class="add-item-group-head">Equipment notes</div>' +
      '<button type="button" class="add-item-pick" data-add-notes="phb" role="menuitem">PHB gear (notes)… <span class="fine">writes to Equipment</span></button>' +
      '<button type="button" class="add-item-pick" data-add-notes="kit" role="menuitem">Starting kit… <span class="fine">kit swap line</span></button></div>';
  }
  function addMenuHtml() {
    var freeAdd = playerFreeAdd();
    var rows = freeAdd ? addPickRows() : [];
    return '<div class="add-item-menu" data-add-item-menu data-free-add="' + (freeAdd ? "1" : "0") + '">' +
      '<div class="add-item-bar"><button type="button" class="btn sm add-item-toggle" data-add-item-toggle aria-haspopup="true" aria-expanded="false">' + (freeAdd ? "Add item ▾" : "Add to notes ▾") + "</button></div>" +
      '<div class="add-item-pop" data-add-item-pop role="menu" aria-label="Add an item" hidden>' +
        (freeAdd && rows.length >= ADD_SEARCH_MIN ? '<input type="search" class="add-item-search" data-add-item-search placeholder="Search items…" aria-label="Search items" autocomplete="off">' : "") +
        (freeAdd ? '<div class="add-item-groups" data-add-item-groups>' + addGroupsHtml(rows, "") + "</div>" +
          '<button type="button" class="btn sm add-item-custom" data-add-item-custom role="menuitem">Custom item…</button>' : "") +
        addNotesHtml() +
      "</div>" +
      (freeAdd ? '<div class="add-item-formwrap" data-add-item-formwrap hidden>' +
        '<div class="add-item-formhead"><b>Custom item</b> <button type="button" class="btn xs ghost" data-add-item-close>Close</button></div>' +
        formHtml({ dm: false }) +
      "</div>" : "") + "</div>";
  }
  function setNotesPanel(which) {
    ["phb", "kit"].forEach(function (k) {
      var p = document.querySelector('[data-add-notes-panel="' + k + '"]');
      if (p) p.hidden = k !== which;
    });
    var focus = which === "phb" ? document.getElementById("gearAdd") : which === "kit" ? document.getElementById("selKitCrosswalk") : null;
    if (focus) focus.focus();
  }
  function setAddMenu(slot, open) {
    var menu = slot && slot.querySelector ? slot.querySelector("[data-add-item-menu]") : null;
    if (!menu) return;
    var pop = menu.querySelector("[data-add-item-pop]");
    var btn = menu.querySelector("[data-add-item-toggle]");
    if (open) {
      var search = menu.querySelector("[data-add-item-search]");
      var groups = menu.querySelector("[data-add-item-groups]");
      if (groups) groups.innerHTML = addGroupsHtml(addPickRows(), search ? search.value : "");
      var lockedNow = !!(character() && character().inventoryLocked);
      if (groups) groups.querySelectorAll("button").forEach(function (el) { el.disabled = lockedNow; });
    }
    if (pop) pop.hidden = !open;
    if (btn) btn.setAttribute("aria-expanded", open ? "true" : "false");
    menu.classList.toggle("open", !!open);
  }
  function setAddForm(slot, open) {
    var wrap = slot && slot.querySelector ? slot.querySelector("[data-add-item-formwrap]") : null;
    if (wrap) wrap.hidden = !open;
  }
  function addFromForm(form) {
    var made = readForm(form);
    made.addressedTo = (form.querySelector("[data-item-address]") || {}).value || "";
    var added = add(character(), Object.assign(made, { addressedTo: made.addressedTo }), { player: true });
    if (!added.ok && root.SSDNSSheet && root.SSDNSSheet.showNotice) root.SSDNSSheet.showNotice(added.reason);
    else commit();
    return added;
  }
  function pickFromMenu(slot, id) {
    var form = slot && slot.querySelector("[data-item-form]");
    if (!form || !byId(id)) return null;
    var cat = form.querySelector("[data-item-catalog]");
    if (cat) cat.value = id;
    fillForm(form, id);
    var added = addFromForm(form);
    if (cat) { cat.value = ""; toggleWeaponFields(form); }
    if (added && added.ok) {
      setAddMenu(slot, false);
      if (root.SSDNSSheet && root.SSDNSSheet.showNotice) root.SSDNSSheet.showNotice("Added " + ((added.item && added.item.name) || "item") + ".");
    }
    paintSheet();
    return added;
  }

  function onSheetClick(e) {
    var t = e.target;
    if (!t || !t.getAttribute) return;
    var useId = t.getAttribute("data-item-use");
    if (useId) { useOnSheet(useId); return; }
    var wearId = t.getAttribute("data-item-wear-toggle");
    if (wearId && root.SSDNSDoll && root.SSDNSDoll.toggleWear) {
      var wr;
      if (root.SSDNSApp && root.SSDNSApp.applyPatch) root.SSDNSApp.applyPatch(function () { wr = root.SSDNSDoll.toggleWear(character(), wearId); });
      else wr = root.SSDNSDoll.toggleWear(character(), wearId);
      if (wr && !wr.ok && root.SSDNSSheet && root.SSDNSSheet.showNotice) root.SSDNSSheet.showNotice(wr.reason);
      paintSheet();
      if (root.SSDNSDoll.paint) root.SSDNSDoll.paint();
      return;
    }
    var attId = t.getAttribute("data-item-attune");
    if (attId) {
      var cur = find(character(), attId);
      var res = setAttuned(character(), attId, !(cur && cur.attuned), {});
      if (!res.ok && root.SSDNSSheet && root.SSDNSSheet.showNotice) root.SSDNSSheet.showNotice(res.reason);
      else commit();
      paintSheet();
      return;
    }
    var unpackId = t.getAttribute("data-item-unpack");
    if (unpackId) {
      var ur = unpack(character(), unpackId, { dm: false });
      if (ur && ur.ok) commit();
      if (ur && !ur.ok && root.SSDNSSheet && root.SSDNSSheet.showNotice) root.SSDNSSheet.showNotice(ur.reason);
      else if (ur && ur.ok) {
        if (root.SSDNSSheet && root.SSDNSSheet.addLog) root.SSDNSSheet.addLog({ kind: "item", text: "Unpacked " + (ur.item && ur.item.name || "pack") });
        var ta = document.querySelector('[data-f="character.equipment"]');
        if (ta && character()) ta.value = character().equipment || "";
      }
      paintSheet();
      paintWeight();
      return;
    }
    var dropId = t.getAttribute("data-item-drop");
    if (dropId) {
      var result = drop(character(), dropId, { dm: false, inventoryLocked: !!(character() && character().inventoryLocked) });
      if (!result.ok && root.SSDNSSheet && root.SSDNSSheet.showNotice) root.SSDNSSheet.showNotice(result.reason);
      else commit();
      paintSheet();
      return;
    }
    var slot = document.getElementById("itemFormSlot");
    var notesClose = t.closest ? t.closest("[data-add-notes-close]") : null;
    if (notesClose) { setNotesPanel(""); return; }
    var hit = t.closest ? t.closest("[data-add-notes], [data-add-item-toggle], [data-add-item-pick], [data-add-item-custom], [data-add-item-close]") : null;
    if (hit && slot && slot.contains(hit)) {
      if (hit.hasAttribute("data-add-notes")) {
        setAddMenu(slot, false);
        setAddForm(slot, false);
        setNotesPanel(hit.getAttribute("data-add-notes"));
        return;
      }
      if (hit.hasAttribute("data-add-item-toggle")) {
        var menu = slot.querySelector("[data-add-item-menu]");
        var opening = !(menu && menu.classList.contains("open"));
        setAddMenu(slot, opening);
        if (opening) { var sb = slot.querySelector("[data-add-item-search]"); if (sb) sb.focus(); }
      } else if (hit.hasAttribute("data-add-item-pick")) {
        pickFromMenu(slot, hit.getAttribute("data-add-item-pick"));
      } else if (hit.hasAttribute("data-add-item-custom")) {
        setAddMenu(slot, false);
        setNotesPanel("");
        setAddForm(slot, true);
        var nm = slot.querySelector("[data-item-name]"); if (nm) nm.focus();
      } else if (hit.hasAttribute("data-add-item-close")) {
        setAddForm(slot, false);
      }
      return;
    }
    if (t.hasAttribute("data-item-add")) {
      var form = t.closest("[data-item-form]");
      var added = addFromForm(form);
      if (added && added.ok && slot && slot.contains(form)) setAddForm(slot, false);
      paintSheet();
    }
  }
  function onSheetInput(e) {
    var t = e.target;
    if (!t || !t.hasAttribute || !t.hasAttribute("data-add-item-search")) return;
    var menu = t.closest("[data-add-item-menu]");
    var groups = menu && menu.querySelector("[data-add-item-groups]");
    if (groups) groups.innerHTML = addGroupsHtml(addPickRows(), t.value);
  }

  function onSheetChange(e) {
    var t = e.target;
    if (t && t.hasAttribute && t.hasAttribute("data-item-type")) { toggleWeaponFields(t.closest("[data-item-form]")); return; }
    if (!t || !t.hasAttribute || !t.hasAttribute("data-item-catalog")) return;
    fillForm(t.closest("[data-item-form]"), t.value);
  }

  function bindSheet() {
    var box = document.getElementById("itemGear");
    if (!box || box.getAttribute("data-bound")) return;
    box.setAttribute("data-bound", "1");
    box.addEventListener("click", onSheetClick);
    box.addEventListener("change", onSheetChange);
    box.addEventListener("input", onSheetInput);
    box.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      var slot = document.getElementById("itemFormSlot");
      var menu = slot && slot.querySelector("[data-add-item-menu].open");
      if (!menu) return;
      setAddMenu(slot, false);
      var tg = menu.querySelector("[data-add-item-toggle]"); if (tg) tg.focus();
    });
    document.addEventListener("click", function (e) {
      var slot = document.getElementById("itemFormSlot");
      var menu = slot && slot.querySelector("[data-add-item-menu].open");
      if (!menu || (e.target && menu.contains(e.target))) return;
      setAddMenu(slot, false);
    });
    var exp = document.getElementById("explosiveList");
    if (exp && !exp.getAttribute("data-bound")) {
      exp.setAttribute("data-bound", "1");
      exp.addEventListener("click", function (e) {
        var b = e.target && e.target.closest ? e.target.closest("[data-item-use]") : null;
        if (b) useOnSheet(b.getAttribute("data-item-use"));
      });
    }
    paintSheet();
  }

  function rangeChoices(character) {
    var pm = !!(character && Array.isArray(character.feats) && character.feats.indexOf("powder-man") >= 0);
    return listOf(character).map(function (it) { return ringSpec(it, { powderMan: pm }); }).filter(Boolean);
  }

  function drawerRows(items, viewer) {
    return (items || []).map(function (item) {
      var view = present(item, viewer || {});
      var btn = showUse(item, viewer) && !view.blank
        ? '<button type="button" data-act="useItem" data-uid="' + esc(item.uid) + '">Use</button>'
        : "";
      return '<div class="ssm-item">' + esc(view.name) + (item.count > 1 ? " ×" + item.count : "") + " " + btn + "</div>";
    }).join("");
  }

  function applyCommand(character, payload) {
    payload = payload || {};
    var op = payload.op || "";
    if (op === "lock") {
      character.inventoryLocked = !!payload.locked;
      return { ok: true };
    }
    if (op === "add") return add(character, payload.item || payload, { dm: true, addressedTo: (payload.item && payload.item.addressedTo) || payload.addressedTo || "" });
    if (op === "remove") return drop(character, payload.uid, { dm: true, allow: true, override: true });
    if (op === "attuneCap") {
      var capN = Number(payload.cap);
      character.attuneCap = isFinite(capN) && capN > 0 ? capN : "";
      return { ok: true };
    }
    if (op === "attune") return setAttuned(character, payload.uid, payload.on !== false, { dm: true });
    var item = find(character, payload.uid);
    if (!item) return { ok: false, reason: "No item." };
    if (op === "approve") { item.approved = true; return { ok: true, item: item }; }
    if (op === "edit") {
      var next = payload.item || {};
      ["name", "description", "addressedTo", "art"].forEach(function (k) { if (next[k] != null) item[k] = next[k]; });
      if (next.effect) item.effect = effectOf(next.effect);
      if (next.dmAllowDrop != null) item.dmAllowDrop = !!next.dmAllowDrop;
      if (next.dmAllowRob != null) item.dmAllowRob = !!next.dmAllowRob;
      if (next.count != null) item.count = Number(next.count) || 0;
      if (next.uses != null) item.uses = usesOf(next.uses);
      if (next.chargesLeft != null) item.chargesLeft = Number(next.chargesLeft) || 0;
      ["attune", "attuned", "cursed", "hidden"].forEach(function (k) { if (next[k] != null) item[k] = !!next[k]; });
      if (next.rarity != null) item.rarity = String(next.rarity);
      if (next.bonuses != null) item.bonuses = clone(next.bonuses);
      if (next.weapon != null) { item.weapon = clone(next.weapon); if (root.SSDNSCustomWeapons) root.SSDNSCustomWeapons.registerItem(item); }
      prune(character);
      return { ok: true, item: item };
    }
    return { ok: false, reason: "Unknown item change." };
  }

  function saveMeta(patch) {
    var DM = root.DMCC;
    if (!DM || !DM.state) return Promise.resolve(false);
    DM.state.meta = Object.assign({}, DM.state.meta || {}, patch);
    room.weightOn = !!DM.state.meta.weightOn;
    room.catalog = DM.state.meta.itemCatalog || room.catalog;
    if (DM.state.demo || !DM.state._fb || !DM.roomRef) return Promise.resolve(true);
    return DM.state._fb.update(DM.roomRef("meta"), patch).then(function () { return true; }).catch(function () { return false; });
  }

  function paintDm() {
    var box = document.getElementById("dmItemTools");
    if (!box) return;
    var DM = root.DMCC;
    var players = (DM && DM.state && DM.state.players) || {};
    var pending = [];
    Object.keys(players).forEach(function (pid) {
      var snap = players[pid] && players[pid].snapshot;
      var items = (snap && snap.items) || [];
      items.forEach(function (item) {
        if (item && item.playerAdded && !item.approved) pending.push({ pid: pid, name: (snap && snap.name) || pid, item: item });
      });
    });
    var list = document.getElementById("dmPendingItems");
    if (list) {
      list.innerHTML = pending.length ? pending.map(function (row) {
        return '<div class="item-row"><span>' + esc(row.name) + " · " + esc(row.item.name) + ' <span class="item-tag">player-added</span></span> ' +
          '<button type="button" class="btn xs" data-dm-item="approve" data-pid="' + esc(row.pid) + '" data-uid="' + esc(row.item.uid) + '">Approve</button> ' +
          '<button type="button" class="btn xs" data-dm-item="remove" data-pid="' + esc(row.pid) + '" data-uid="' + esc(row.item.uid) + '">Remove</button></div>';
      }).join("") : '<p class="fine">No player-added items waiting.</p>';
    }
    var att = document.getElementById("dmAttuneList");
    if (!att && list && list.parentNode) {
      att = document.createElement("div");
      att.id = "dmAttuneList";
      att.className = "dm-attune";
      list.parentNode.insertBefore(att, list.nextSibling);
    }
    if (att) {
      var rowsA = [];
      Object.keys(players).forEach(function (pid) {
        var snap = players[pid] && players[pid].snapshot;
        var its = ((snap && snap.items) || []).filter(function (it) { return it && it.attune; });
        if (!its.length) return;
        var cap = Number(snap.attuneCap) > 0 ? Number(snap.attuneCap) : 3;
        rowsA.push('<div class="item-row"><b>' + esc((snap && snap.name) || pid) + '</b> attuned ' + its.filter(function (it) { return it.attuned; }).length + " / " + cap +
          ' <label class="fine">Cap <input type="number" min="1" max="9" value="' + cap + '" data-dm-attune-cap="' + esc(pid) + '" style="width:48px"></label> ' +
          its.map(function (it) {
            return '<button type="button" class="btn xs' + (it.attuned ? " btn-primary" : "") + '" data-dm-item="attune" data-on="' + (it.attuned ? "0" : "1") + '" data-pid="' + esc(pid) + '" data-uid="' + esc(it.uid) + '" title="DM override: ignores the cap">' + esc(it.name) + (it.attuned ? " ✓" : "") + "</button>";
          }).join(" ") + "</div>");
      });
      att.innerHTML = rowsA.length ? '<p class="fine">Attunement (DM override, ignores the cap)</p>' + rowsA.join("") : "";
    }
    var weight = document.getElementById("chkWeight");
    if (weight && document.activeElement !== weight) weight.checked = !!(DM && DM.state && DM.state.meta && DM.state.meta.weightOn) || !!room.weightOn;
    var from = document.getElementById("rewTarget");
    var to = document.getElementById("itemGiveTarget");
    if (from && to) {
      var keep = to.value;
      to.innerHTML = from.innerHTML;
      if (keep) to.value = keep;
    }
  }

  function bindDm() {
    var box = document.getElementById("dmItemTools");
    if (!box || box.getAttribute("data-bound")) return;
    box.setAttribute("data-bound", "1");
    var slot = document.getElementById("dmItemForm");
    if (slot) slot.innerHTML = formHtml({ dm: true });
    box.addEventListener("change", function (e) {
      var t = e.target;
      if (t && t.hasAttribute && t.hasAttribute("data-dm-attune-cap") && root.DMCC && root.DMCC.pushCommand) {
        root.DMCC.pushCommand({ type: "item_mod", to: t.getAttribute("data-dm-attune-cap"), payload: { op: "attuneCap", cap: Number(t.value) || 3 } });
        return;
      }
      if (t && t.hasAttribute("data-item-type")) toggleWeaponFields(t.closest("[data-item-form]"));
      if (t && t.hasAttribute("data-item-catalog")) fillForm(t.closest("[data-item-form]"), t.value);
    });
    var weightBox = document.getElementById("chkWeight");
    if (weightBox && !weightBox.getAttribute("data-bound")) {
      weightBox.setAttribute("data-bound", "1");
      weightBox.addEventListener("change", function () { saveMeta({ weightOn: !!weightBox.checked }); });
    }
    box.addEventListener("click", function (e) {
      var t = e.target;
      if (!t || !t.getAttribute) return;
      if (t.hasAttribute("data-item-catalog-save")) {
        var form = t.closest("[data-item-form]");
        var made = readForm(form);
        var catalogNow = Object.assign({}, (root.DMCC && root.DMCC.state && root.DMCC.state.meta && root.DMCC.state.meta.itemCatalog) || {});
        catalogNow[made.id] = made;
        saveMeta({ itemCatalog: catalogNow });
        if (root.DMCC && root.DMCC.toast) root.DMCC.toast("Saved " + made.name + " to the room catalog");
        return;
      }
      if (t.hasAttribute("data-item-add")) {
        var giveForm = t.closest("[data-item-form]");
        var give = readForm(giveForm);
        give.addressedTo = (giveForm.querySelector("[data-item-address]") || {}).value || "";
        give.dmAllowDrop = !!(giveForm.querySelector("[data-item-allow-drop]") && giveForm.querySelector("[data-item-allow-drop]").checked);
        give.dmAllowRob = !!(giveForm.querySelector("[data-item-allow-rob]") && giveForm.querySelector("[data-item-allow-rob]").checked);
        var sel = document.getElementById("rewTarget") || document.getElementById("itemGiveTarget");
        var pid = sel ? sel.value : "";
        if (!pid || !root.DMCC || !root.DMCC.pushCommand) {
          if (root.DMCC && root.DMCC.toast) root.DMCC.toast("Pick a player");
          return;
        }
        root.DMCC.pushCommand({ type: "item_mod", to: pid, payload: { op: "add", item: give } });
        if (root.DMCC.toast) root.DMCC.toast("Sent " + give.name);
        return;
      }
      var op = t.getAttribute("data-dm-item");
      if (!op || !root.DMCC || !root.DMCC.pushCommand) return;
      var pl = { op: op, uid: t.getAttribute("data-uid") };
      if (op === "attune") pl.on = t.getAttribute("data-on") !== "0";
      root.DMCC.pushCommand({ type: "item_mod", to: t.getAttribute("data-pid"), payload: pl });
    });
    var lockBtn = document.getElementById("btnLockInventory");
    if (lockBtn) lockBtn.addEventListener("click", function () {
      var sel = document.getElementById("itemGiveTarget") || document.getElementById("rewTarget");
      var pid = sel ? sel.value : "";
      if (!pid || !root.DMCC) return;
      var snap = root.DMCC.state.players[pid] && root.DMCC.state.players[pid].snapshot;
      var locked = !(snap && snap.inventoryLocked);
      if (snap) snap.inventoryLocked = locked;
      root.DMCC.pushCommand({ type: "inventory_lock", to: pid, payload: { locked: locked } });
      lockBtn.textContent = locked ? "Unlock inventory" : "Lock inventory";
    });
    paintDm();
  }

  root.SSDNSItems = {
    SCHEMA: { types: Object.keys(TYPES), effects: Object.keys(KINDS) },
    seeds: seeds,
    valid: valid,
    normalize: normalize,
    byId: byId,
    catalog: catalog,
    instanceFrom: instanceFrom,
    present: present,
    addressedBlank: addressedBlank,
    canDrop: canDrop,
    canRob: canRob,
    use: use,
    spend: spend,
    add: add,
    drop: drop,
    unpack: unpack,
    packContents: packContents,
    carryCapacity: carryCapacity,
    totalWeight: totalWeight,
    weightReport: weightReport,
    slotWeights: slotWeights,
    lbOf: lbOf,
    hasTag: hasTag,
    tagsOf: tagsOf,
    inferSupply: inferSupply,
    recharge: recharge,
    scrollTable: scrollTable,
    ringSpec: ringSpec,
    rangeChoices: rangeChoices,
    weaponRecord: weaponRecord,
    throwBands: throwBands,
    catalogItem: function (id) { return byId(id); },
    landWeapon: landWeapon,
    mergeExplosives: mergeExplosives,
    useExplosive: useExplosive,
    explosiveRules: explosiveRules,
    parseBonus: parseBonus,
    artSrc: artSrc,
    attuneCap: attuneCap,
    attunedCount: attunedCount,
    setAttuned: setAttuned,
    classifyReward: classifyReward,
    setRoom: setRoom,
    setStore: setStore,
    room: function () { return { weightOn: !!room.weightOn, catalog: room.catalog }; },
    useOnSheet: useOnSheet,
    applyCommand: applyCommand,
    drawerRows: drawerRows,
    unlimitedFix: unlimitedFix,
    formHtml: formHtml,
    readForm: readForm,
    paintSheet: paintSheet,
    playerFreeAdd: playerFreeAdd,
    addMenuHtml: addMenuHtml,
    paintWeight: paintWeight,
    paintDm: paintDm,
    artSrc: artSrc,
    showUse: showUse
  };

  function boot() {
    bindSheet();
    bindDm();
  }
  loadStore();
  if (root.document) {
    if (root.document.readyState === "loading") root.document.addEventListener("DOMContentLoaded", boot);
    else boot();
  }
})(typeof window !== "undefined" ? window : globalThis);

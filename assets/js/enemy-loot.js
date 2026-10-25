/* B8: per-enemy gear on the fight row, and the haul a DM Drop loot builds.
   Inventory is instance data ({id, qty, name, dmOnly?}). It is not a bestiary field.
   Callers keep it on the fight row and in the DM-only encounter/dm secret.
   Do not copy it onto a public map token.
   Pocket cash uses the Act I saddlebag money line (2d6×5) from loot v1.4.
   That line is not a new denomination, and this file does not change box counts,
   the Outlaw Stash 70% lock, or the Friendlier letter mix. */
(function (root) {
  "use strict";

  /* act1-saddlebag.json cash.dice. The smallest v1.4 money line. */
  var SADDLE_CASH = { dice: "2d6x5" };
  var RELIC_FALLBACK = ["viper", "python", "boa", "cobra", "cotton-mouth", "fer-de-lance", "cascabel", "timber-rat", "massasauga", "twin-puff-adder-left", "twin-puff-adder-right"];
  var EMPTY_TABLE = {
    id: "enemy-drop",
    name: "Enemy loot",
    boxType: "enemy-drop",
    picks: "0",
    bands: {},
    rows: {},
    subTables: {},
    cash: null,
    actMin: null,
    draft: false,
    defaults: { lockDc: 0 }
  };

  function lootApi() { return root.SSDNSLoot || null; }
  function itemsApi() { return root.SSDNSItems || null; }
  function rules() { return root.SSDNS_RULES || {}; }

  function gunLists() {
    var R = rules();
    return [].concat(R.firearms || [], R.casterGuns || [], R.otherRanged || [], R.melee || []);
  }
  function firearmById(id) {
    var key = String(id || "");
    if (!key) return null;
    var lists = gunLists();
    var i;
    for (i = 0; i < lists.length; i++) if (lists[i] && lists[i].id === key) return lists[i];
    return null;
  }
  function firearmByName(name) {
    var key = String(name || "").trim().toLowerCase();
    if (!key) return null;
    var lists = gunLists();
    var i;
    for (i = 0; i < lists.length; i++) {
      var g = lists[i];
      if (!g) continue;
      if (String(g.name || "").trim().toLowerCase() === key) return g;
      if (String(g.id || "").trim().toLowerCase() === key) return g;
    }
    var Guns = lootApi() && lootApi().GUNS;
    if (Guns) {
      var ids = Object.keys(Guns);
      for (i = 0; i < ids.length; i++) {
        if (String(Guns[ids[i]] || "").trim().toLowerCase() === key) return firearmById(ids[i]) || { id: ids[i], name: Guns[ids[i]], group: "pistol", ammo: "cartridge", capacity: 6, tiers: { medium: { damage: "1d8", range: "20/60", misfire: "1–4" } } };
      }
    }
    return null;
  }
  function isFirearm(id) {
    return !!firearmById(id);
  }
  function catalogRow(id) {
    var Items = itemsApi();
    if (!Items || !Items.byId) return null;
    try { return Items.byId(id) || null; } catch (e) { return null; }
  }
  function tagsFor(id) {
    var Loot = lootApi();
    if (Loot && Loot.tagOf) {
      try { return Loot.tagOf(id) || {}; } catch (e) { return {}; }
    }
    return {};
  }
  function relicSlugs() {
    var Art = root.SSDNSItemArt;
    if (Art && typeof Art.relics === "function") {
      var rows = Art.relics() || [];
      var out = rows.map(function (r) { return r && (r.slug || r.id) || ""; }).filter(Boolean);
      if (out.length) return out;
    }
    return RELIC_FALLBACK.slice();
  }
  function relicName(slug) {
    return String(slug || "").replace(/-/g, " ").replace(/\b\w/g, function (c) { return c.toUpperCase(); }) + " (relic Caster Gun)";
  }
  function misfireTop(text) {
    var s = String(text || "");
    var m = s.match(/(\d+)\s*[\u2013-]\s*(\d+)/);
    if (m) return Number(m[2]);
    var n = parseInt(s, 10);
    return isFinite(n) ? n : null;
  }
  function tierOf(gun, prefer) {
    if (!gun || !gun.tiers) return "";
    if (prefer && gun.tiers[prefer]) return prefer;
    if (gun.tiers.medium) return "medium";
    if (gun.tiers.light) return "light";
    var keys = Object.keys(gun.tiers);
    return keys[0] || "";
  }
  function qtyOf(n) {
    var q = parseInt(n, 10);
    if (!isFinite(q) || q < 1) return 1;
    return Math.min(999, q);
  }
  function normalize(list) {
    if (!Array.isArray(list)) return [];
    return list.filter(function (row) { return row && row.id; }).map(function (row) {
      var tags = tagsFor(row.id);
      var cat = catalogRow(row.id);
      return {
        id: String(row.id),
        qty: qtyOf(row.qty),
        name: String(row.name || (cat && cat.name) || row.id),
        dmOnly: !!(row.dmOnly || (cat && (cat.dmOnly || cat.type === "quest"))),
        storyOnly: !!(row.storyOnly || tags.storyOnly),
        noTrade: !!(row.noTrade || tags.noTrade || tags.storyOnly),
        actMin: row.actMin != null ? row.actMin : (tags.actMin != null ? tags.actMin : null)
      };
    });
  }
  function known(id) {
    if (!id) return null;
    if (id === "es" || id === "cash") return { id: "es", name: "ES", kind: "cash" };
    var cat = catalogRow(id);
    if (cat) return { id: cat.id, name: cat.name || cat.id, kind: "item", catalog: cat };
    var gun = firearmById(id);
    if (gun) return { id: gun.id, name: gun.name || gun.id, kind: "gun", gun: gun };
    if (relicSlugs().indexOf(id) >= 0) return { id: id, name: relicName(id), kind: "relic", gun: firearmById("blacksnake") };
    var Loot = lootApi();
    if (Loot && Loot.nameOf) {
      var named = Loot.nameOf(id);
      if (named && named !== id) return { id: id, name: named, kind: "item" };
    }
    return null;
  }
  function weaponAttack(spec, row) {
    if (!spec) return null;
    var gun = spec.gun || null;
    var cat = spec.catalog || null;
    var effect = (cat && cat.effect) || {};
    if (cat && cat.weaponId && !gun) gun = firearmById(cat.weaponId);
    var melee = !gun && cat && (cat.type === "weapon" || (effect.kind === "attack" && effect.damage));
    if (!gun && !melee && spec.kind !== "relic") return null;
    if (spec.kind === "relic" && !gun) gun = firearmById("blacksnake");
    var bonus = effect.bonus != null && effect.bonus !== "" ? Number(effect.bonus) || 0 : 0;
    var base = row && row.atkBonus != null && row.atkBonus !== "" ? Number(row.atkBonus) || 0 : 0;
    var toHit = base + bonus;
    var tier = tierOf(gun, cat && cat.tier);
    var stats = gun && gun.tiers ? (gun.tiers[tier] || {}) : {};
    var cap = gun && gun.capacity != null && gun.capacity !== "" ? Number(gun.capacity) : null;
    var atk = {
      id: "gear:" + spec.id,
      name: spec.name,
      kind: melee && !gun ? "melee" : "ranged",
      toHit: toHit,
      damage: effect.damage || stats.damage || "",
      damageType: effect.damageType || (melee && !gun ? "slashing" : "piercing"),
      range: effect.range || stats.range || (melee && !gun ? "5" : ""),
      capacity: cap != null && isFinite(cap) ? cap : null,
      loaded: cap != null && isFinite(cap) ? cap : null,
      misfire: gun ? misfireTop(stats.misfire) : null,
      jammed: false,
      weapon: gun ? gun.id : (spec.id || ""),
      gear: true,
      fromItem: spec.id,
      notes: spec.kind === "relic" ? "Relic Caster Gun. DM-placed." : ""
    };
    return atk;
  }
  function syncAttacks(row) {
    if (!row || row.kind === "player") return row;
    if (!row.card || typeof row.card !== "object") row.card = { attacks: [] };
    if (!Array.isArray(row.card.attacks)) row.card.attacks = [];
    var want = {};
    normalize(row.inventory).forEach(function (item) {
      var spec = known(item.id);
      var atk = weaponAttack(spec, row);
      if (atk) want[item.id] = atk;
    });
    row.card.attacks = row.card.attacks.filter(function (a) {
      if (!a || !a.gear) return true;
      return !!want[a.fromItem];
    });
    Object.keys(want).forEach(function (id) {
      var have = row.card.attacks.some(function (a) { return a && a.gear && a.fromItem === id; });
      if (!have) row.card.attacks.push(want[id]);
    });
    return row;
  }
  function addGear(row, id, qty) {
    if (!row || row.kind === "player") return { ok: false, reason: "Gear is for an enemy or NPC." };
    var spec = known(id);
    if (!spec) return { ok: false, reason: "That item is not in the catalog or the gun list." };
    var tags = spec.kind === "cash" ? {} : tagsFor(spec.id);
    var cat = spec.catalog || null;
    row.inventory = normalize(row.inventory);
    var hit = null;
    var i;
    for (i = 0; i < row.inventory.length; i++) if (row.inventory[i].id === spec.id) hit = row.inventory[i];
    if (hit) hit.qty += qtyOf(qty);
    else row.inventory.push({
      id: spec.id,
      qty: qtyOf(qty),
      name: spec.name,
      dmOnly: !!(cat && (cat.dmOnly || cat.type === "quest")),
      storyOnly: !!tags.storyOnly,
      noTrade: !!(tags.noTrade || tags.storyOnly),
      actMin: tags.actMin != null ? tags.actMin : null
    });
    syncAttacks(row);
    return { ok: true, item: row.inventory.filter(function (r) { return r.id === spec.id; })[0] };
  }
  function removeGear(row, id) {
    if (!row || row.kind === "player") return { ok: false, reason: "Gear is for an enemy or NPC." };
    var key = String(id || "");
    row.inventory = normalize(row.inventory).filter(function (r) { return r.id !== key; });
    syncAttacks(row);
    return { ok: true };
  }
  function choices() {
    var groups = [];
    groups.push({ label: "Cash", options: [{ id: "es", name: "ES (saddlebag pocket, 2d6×5 if you leave this off)" }] });
    var guns = (rules().firearms || []).slice().sort(function (a, b) {
      var ap = a && a.group === "pistol" ? 0 : 1;
      var bp = b && b.group === "pistol" ? 0 : 1;
      if (ap !== bp) return ap - bp;
      return String(a && a.name || "").localeCompare(String(b && b.name || ""));
    });
    groups.push({ label: "Guns", options: guns.filter(Boolean).map(function (g) { return { id: g.id, name: g.name || g.id }; }) });
    var casters = (rules().casterGuns || []).slice();
    if (casters.length) groups.push({ label: "Caster guns", options: casters.map(function (g) { return { id: g.id, name: g.name || g.id }; }) });
    groups.push({ label: "Relic Caster Guns", options: relicSlugs().map(function (slug) { return { id: slug, name: relicName(slug) }; }) });
    var Items = itemsApi();
    var cat = Items && Items.catalog ? Items.catalog({ dm: true }) : (root.SSDNS_ITEM_CATALOG || []);
    var weapons = [];
    var rest = [];
    (cat || []).forEach(function (row) {
      if (!row || !row.id) return;
      var opt = { id: row.id, name: row.name || row.id };
      if (row.type === "weapon" || row.weaponId) weapons.push(opt);
      else rest.push(opt);
    });
    rest.sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
    if (weapons.length) groups.push({ label: "Catalog weapons", options: weapons });
    if (rest.length) groups.push({ label: "Items", options: rest });
    return groups.filter(function (g) { return g.options && g.options.length; });
  }
  function ammoIdFor(gun) {
    if (!gun) return "";
    var ammo = String(gun.ammo || "");
    var group = String(gun.group || "");
    var load = String(gun.load || "");
    if (ammo === "percussion" || /ball|cap|powder/i.test(load)) return "powder-ball-and-caps-20-shots";
    if (ammo === "shell" || ammo === "shotgun" || group === "shotgun") return "shells-12-ga-10";
    if (ammo === "arrow" || group === "bow") return "arrows-20";
    if (ammo === "bolt" || group === "crossbow") return "crossbow-bolts-20";
    if (ammo === "cartridge" || ammo === "" || group === "pistol" || group === "rifle" || group === "carbine" || group === "caster" || group === "bigbore") {
      var tier = tierOf(gun, "");
      if (tier === "heavy" || group === "bigbore") return "cartridges-heavy-20";
      if (tier === "medium") return "cartridges-medium-20";
      return "cartridges-light-20";
    }
    return "";
  }
  function roundsOn(atk) {
    var loaded = Number(atk && atk.loaded);
    var spare = Number(atk && atk.spare);
    var n = (isFinite(loaded) ? loaded : 0) + (isFinite(spare) ? spare : 0);
    if (!isFinite(loaded) && atk && atk.capacity != null) n = Number(atk.capacity) || 0;
    return n > 0 ? n : 0;
  }
  function pushPlace(list, seen, entry) {
    if (!entry || !entry.id) return;
    var key = entry.id + "|" + (entry.name || "");
    if (seen[key]) return;
    seen[key] = 1;
    list.push(entry);
  }
  function cashOnRow(row) {
    var es = 0;
    var have = false;
    normalize(row && row.inventory).forEach(function (item) {
      if (item.id === "es") { es += item.qty; have = true; }
    });
    if (row && row.pocketEs != null && row.pocketEs !== "" && isFinite(Number(row.pocketEs))) {
      es += Number(row.pocketEs);
      have = true;
    }
    return { es: es, have: have };
  }
  function pocketCash(row, rng) {
    var held = cashOnRow(row);
    if (held.have) {
      return { es: held.es, black: 0, blackId: "", branch: held.es ? "es" : "none", faces: [], pocket: "inventory", source: "row inventory" };
    }
    var Loot = lootApi();
    var table = { cash: SADDLE_CASH };
    var live = Loot && Loot.tableFor && Loot.tableFor("saddlebag");
    if (live && live.cash && live.cash.dice) table = { cash: live.cash };
    if (!Loot || !Loot.rollCash) return { es: 0, black: 0, blackId: "", branch: "none", faces: [], pocket: "none", source: "" };
    var rolled = Loot.rollCash(table, rng);
    rolled.pocket = "saddlebag";
    rolled.source = "saddlebag " + (table.cash && table.cash.dice ? table.cash.dice : "2d6x5");
    return rolled;
  }
  function planDrop(row, rng) {
    var places = [];
    var seen = {};
    var ammoSeen = {};
    normalize(row && row.inventory).forEach(function (item) {
      if (item.id === "es") return;
      var spec = known(item.id);
      var gun = spec && (spec.gun || (spec.catalog && spec.catalog.weaponId && firearmById(spec.catalog.weaponId)));
      if (spec && spec.kind === "relic") gun = firearmById("blacksnake") || gun;
      var dropId = item.id;
      var dirty = false;
      if (gun && gun.id) {
        dropId = gun.id;
        dirty = true;
      } else if (lootApi() && lootApi().isGun && lootApi().isGun(item.id)) dirty = true;
      pushPlace(places, seen, { id: dropId, qty: gun ? 1 : item.qty, name: item.name, dirty: dirty, from: item.id });
      var live = ((row && row.card && row.card.attacks) || []).filter(function (a) { return a && a.gear && a.fromItem === item.id; })[0];
      var rounds = live ? roundsOn(live) : (gun ? roundsOn(weaponAttack(spec, row)) : 0);
      if (gun && rounds > 0) {
        var ammo = ammoIdFor(gun);
        if (ammo && !ammoSeen[ammo]) { ammoSeen[ammo] = 1; pushPlace(places, seen, { id: ammo, qty: 1, name: "", dirty: false, from: "ammo" }); }
      }
    });
    var attacks = (row && row.card && row.card.attacks) || [];
    attacks.forEach(function (atk) {
      if (!atk || atk.gear) return;
      var gun = firearmById(atk.weapon) || firearmByName(atk.weapon) || firearmByName(atk.name) || firearmById(atk.id);
      if (!gun && lootApi() && lootApi().GUNS) {
        var ids = Object.keys(lootApi().GUNS);
        var i;
        for (i = 0; i < ids.length; i++) {
          if (lootApi().GUNS[ids[i]] === atk.weapon || lootApi().GUNS[ids[i]] === atk.name) {
            gun = firearmById(ids[i]) || { id: ids[i], name: lootApi().GUNS[ids[i]], ammo: "cartridge", capacity: atk.capacity, tiers: { medium: {} }, group: "pistol" };
            break;
          }
        }
      }
      if (!gun || !gun.id) return;
      if (atk.capacity == null && gun.capacity == null) return;
      pushPlace(places, seen, { id: gun.id, qty: 1, name: gun.name || atk.name || gun.id, dirty: true, from: "stat" });
      if (roundsOn(atk) > 0) {
        var pack = ammoIdFor(gun);
        if (pack && !ammoSeen[pack]) { ammoSeen[pack] = 1; pushPlace(places, seen, { id: pack, qty: 1, name: "", dirty: false, from: "ammo" }); }
      }
    });
    return {
      table: EMPTY_TABLE,
      places: places,
      cash: pocketCash(row, rng),
      name: ((row && row.name) || "Enemy") + " loot"
    };
  }
  function fillBox(box, plan) {
    var Loot = lootApi();
    if (!box || !Loot || !Loot.handPlace || !plan) return box;
    (plan.places || []).forEach(function (entry) {
      var res = Loot.handPlace(box, entry.id, entry.qty || 1);
      if (res && res.row) {
        if (entry.name) res.row.name = entry.name;
        if (entry.dirty) res.row.dirty = true;
      }
    });
    if (plan.cash) {
      box.cash = {
        es: Number(plan.cash.es) || 0,
        black: Number(plan.cash.black) || 0,
        blackId: plan.cash.blackId || "",
        branch: plan.cash.branch || ((Number(plan.cash.es) || 0) > 0 ? "es" : "none"),
        faces: plan.cash.faces || [],
        pocket: plan.cash.pocket || "",
        source: plan.cash.source || ""
      };
      box.log = box.log || [];
      if (box.cash.branch === "es") box.log.push("Pocket ES " + box.cash.es + (box.cash.source ? " (" + box.cash.source + ")" : ""));
      else if (box.cash.branch === "black") box.log.push("Pocket black " + box.cash.black);
    }
    if (plan.name) box.name = plan.name;
    box.boxType = "enemy-drop";
    box.shared = true;
    box.reveal = "everyone";
    box.rolled = true;
    return box;
  }
  function tagLine(item) {
    if (!item) return "";
    var bits = [];
    if (item.storyOnly) bits.push("story");
    if (item.noTrade) bits.push("no trade");
    if (item.actMin != null && item.actMin !== "") bits.push("act " + item.actMin);
    if (item.dmOnly) bits.push("DM");
    return bits.join(" · ");
  }

  root.SSDNSEnemyLoot = {
    SADDLE_CASH: SADDLE_CASH,
    EMPTY_TABLE: EMPTY_TABLE,
    normalize: normalize,
    known: known,
    isFirearm: isFirearm,
    firearmById: firearmById,
    addGear: addGear,
    removeGear: removeGear,
    syncAttacks: syncAttacks,
    choices: choices,
    planDrop: planDrop,
    fillBox: fillBox,
    ammoIdFor: ammoIdFor,
    tagLine: tagLine,
    weaponAttack: weaponAttack
  };
})(typeof window !== "undefined" ? window : globalThis);

/* Default UI by item type (Jessey 2026-10-20, sheet 0.3.84 / DMCC 0.2.97).
   Any item (catalog, store, DM Give tab, DM Add Item form, reward, player add) is shown with the existing UI for
   its type, and it feeds the sheet math, with no per-item code:
     firearm   → gun card (chambers, misfire, ammo pool, jam/fouled/dirty)
     bow       → bow card in a gun slot (quiver, arrow types, Recover)
     crossbow / blowpipe → loaded card in a gun slot (load + bolts / needles pool)
     sling     → sling card in a gun slot (stone pouch)
     thrown    → melee card with thrown pips (Recover all)
     melee     → melee card
     ammo      → its Ammo pool (no item row)
     armor / shield → AC (character.armor = a rules.js armor id; shield +2) + the paper-doll armor / shield slot
     apparel   → its paper-doll slot (worn bonuses)
     food / water → the Supplies row (#105 tags / meals / water)
     tool      → uses + recharge
     consumable / scroll / explosive → Use (roll) + uses
     pack      → Unpack
     mount     → rides on the mount (not carried)
     gear      → a generic item row with its weight (the fallback)
   Special UI hook (Jessey 9:01 AM): an item or weapon row may carry `ui: "<key>"`, or a renderer can be registered
   by item / weapon id. A special gun (later, e.g. the LeGloss Revolver) can add controls to the standard gun card
   (extend) or swap in its own card (replace) without forking the gun card:
     SSDNSItemUI.register("legloss-revolver", { extend: function (host, ctx) { ... }, replace: function (host, ctx) { ... } });
   Generic per-card hooks: SSDNSItemUI.on("quiver", function (host, ctx) { ... }) (e.g. #106 click-to-shoot). */
(function (root) {
  "use strict";

  var KINDS = {
    firearm: { label: "Firearm", group: "Weapons", type: "weapon", wkind: "firearm", home: "gun", homeText: "Gear: gun card (chambers, misfire, ammo, condition)" },
    bow: { label: "Bow", group: "Weapons", type: "weapon", wkind: "bow", home: "quiver", homeText: "Gear: bow card (quiver, arrow types)" },
    crossbow: { label: "Crossbow", group: "Weapons", type: "weapon", wkind: "crossbow", home: "loaded", homeText: "Gear: crossbow card (load, bolts)" },
    blowpipe: { label: "Blowpipe", group: "Weapons", type: "weapon", wkind: "blowpipe", home: "loaded", homeText: "Gear: blowpipe card (load, needles)" },
    sling: { label: "Sling", group: "Weapons", type: "weapon", wkind: "sling", home: "pouch", homeText: "Gear: sling card (stone pouch)" },
    thrown: { label: "Thrown weapon", group: "Weapons", type: "weapon", wkind: "thrown", home: "thrown", homeText: "Gear: melee card (thrown pips, Recover)" },
    melee: { label: "Melee weapon", group: "Weapons", type: "weapon", wkind: "melee", home: "melee", homeText: "Gear: melee card" },
    ammo: { label: "Ammo", group: "Weapons", type: "gear", home: "ammo", homeText: "Ammo pool" },
    armor: { label: "Armor", group: "Worn", type: "gear", wear: "armor", home: "ac", homeText: "AC: armor slot" },
    shield: { label: "Shield", group: "Worn", type: "gear", wear: "shield", home: "ac", homeText: "AC: shield (+2)" },
    apparel: { label: "Apparel / worn gear", group: "Worn", type: "gear", home: "doll", homeText: "Paper doll slot" },
    food: { label: "Food", group: "Supplies", type: "consumable", tags: ["food"], home: "supplies", homeText: "Supplies: food" },
    water: { label: "Water / container", group: "Supplies", type: "gear", tags: ["water", "container"], home: "supplies", homeText: "Supplies: water" },
    consumable: { label: "Consumable / healing", group: "Use", type: "consumable", home: "use", homeText: "Use (roll) + uses" },
    scroll: { label: "Scroll", group: "Use", type: "scroll", home: "use", homeText: "Use (cast)" },
    explosive: { label: "Explosive", group: "Use", type: "explosive", home: "use", homeText: "Use (throw, save)" },
    tool: { label: "Tool / kit", group: "Gear", type: "gear", shelf: "Tools", home: "uses", homeText: "Uses + recharge" },
    pack: { label: "Pack", group: "Gear", type: "gear", shelf: "Packs", home: "unpack", homeText: "Unpack into its items" },
    mount: { label: "Mount / tack", group: "Gear", type: "gear", shelf: "Mounts & tack", noCarry: true, home: "mount", homeText: "On the mount (not carried)" },
    gear: { label: "Gear (other)", group: "Gear", type: "gear", home: "item", homeText: "Items (weight)" },
    quest: { label: "Quest item (DM)", group: "Gear", type: "quest", home: "item", homeText: "Items (DM only)" }
  };
  var ORDER = ["firearm", "bow", "crossbow", "blowpipe", "sling", "thrown", "melee", "ammo", "armor", "shield", "apparel",
    "food", "water", "consumable", "scroll", "explosive", "tool", "pack", "mount", "gear", "quest"];
  /* Ammo pool keys (app.js AMMO_TYPES + trackers.js AMMO_EXTRA) and the per-kind weapon pools */
  var POOLS = [["cartridge", "Cartridges"], ["percussion", "Powder, ball & caps"], ["buck", "Shells, buckshot"], ["slug", "Shells, slugs"],
    ["bigfifty", "Big Fifty .50-90"], ["arrows", "Arrows"], ["bolts", "Crossbow bolts"], ["stones", "Sling stones"], ["needles", "Blowpipe needles"]];
  var WEAPON_AMMO = { bow: "arrows", crossbow: "bolts", sling: "sling stones", blowpipe: "needles" };

  function R() { return root.SSDNS_RULES || {}; }
  function T() { return root.SSDNSTrackers || null; }
  function lower(s) { return String(s || "").toLowerCase(); }
  function tagsOf(item) {
    var t = item && Array.isArray(item.tags) ? item.tags : [];
    return t.map(lower);
  }
  function armorRow(id) {
    if (!id) return null;
    return (R().armor || []).filter(function (a) { return a && a.id === id; })[0] || null;
  }
  function packOf(item) {
    if (!item) return null;
    if (Array.isArray(item.contents) && item.contents.length) return { items: item.contents, notes: [] };
    var map = root.SSDNS_PACK_CONTENTS || {};
    var id = item.catalogId || item.id;
    return id && Object.prototype.hasOwnProperty.call(map, id) ? map[id] : null;
  }

  /* The weapon record an item lands as (rules row, catalog weaponId, or a created weapon block). */
  function weaponOf(item) {
    if (!item) return null;
    if (item.weapon && root.SSDNSCustomWeapons && root.SSDNSCustomWeapons.toRecord) {
      var rec = root.SSDNSCustomWeapons.toRecord(Object.assign({}, item, { type: "weapon" }));
      if (rec) return rec;
    }
    var key = item.weaponId || item.catalogId || item.id;
    var t = T();
    var w = t && t.weapon ? t.weapon(key) : null;
    if (w) return w;
    var lists = [].concat(R().firearms || [], R().casterGuns || [], R().otherRanged || [], R().melee || []);
    for (var i = 0; i < lists.length; i++) if (lists[i] && lists[i].id === key) return lists[i];
    return null;
  }
  function weaponKind(w, item) {
    var t = T();
    if (w && t && t.kindOf) {
      var k = t.kindOf(w);
      var pool = lower(w.ammo || (String(w.properties || "").match(/ammunition \(([^)]+)\)/i) || [])[1]);
      if (k === "firearm") return "firearm";
      if (k === "loaded") return /needle/.test(pool) ? "blowpipe" : "crossbow";
      if (k === "quiver") return /stone|bullet/.test(pool) ? "sling" : (/bolt/.test(pool) ? "crossbow" : (/needle/.test(pool) ? "blowpipe" : "bow"));
      if (k === "thrown") return "thrown";
      return "melee";
    }
    if (item && (item.slot === "long" || item.slot === "pistol")) return "firearm";
    if (/\bthrown\b/i.test(String((item && item.properties) || ""))) return "thrown";
    return "melee";
  }

  /* Closest default UI kind for any item. Fallback: "gear" (a generic row with weight). */
  function classify(item) {
    if (!item) return "gear";
    var spec = specFor(item);
    if (spec && spec.kind && KINDS[spec.kind]) return spec.kind;
    if (item.itemKind && KINDS[item.itemKind]) return item.itemKind;
    if (item.type === "weapon") return weaponKind(weaponOf(item), item);
    if (item.ammo && item.ammo.type) return "ammo";
    if (item.armorId) { var ar = armorRow(item.armorId); return ar && ar.category === "shield" ? "shield" : "armor"; }
    var wear = lower(item.wear);
    if (wear === "armor" || wear === "body" || wear === "vest") return "armor";
    if (wear === "shield") return "shield";
    if (wear) return "apparel";
    var tags = tagsOf(item);
    if (tags.indexOf("pack") >= 0 || packOf(item)) return "pack";
    if (tags.indexOf("food") >= 0 || tags.indexOf("drink") >= 0 || Number(item.meals) > 0) return "food";
    if (tags.indexOf("water") >= 0 || tags.indexOf("container") >= 0 || Number(item.water) > 0 || Number(item.capacity) > 0) return "water";
    var shelf = String(item.shelf || "");
    if (item.noCarry || shelf === "Mounts & tack") return "mount";
    if (shelf === "Tools" || shelf === "Instruments" || shelf === "Foci") return "tool";
    if (item.type === "quest") return "quest";
    if (item.type === "scroll") return "scroll";
    if (item.type === "explosive") return "explosive";
    var name = lower(item.name);
    if (item.type === "consumable") {
      if (/\b(ration|rations|hardtack|jerky|pemmican|beans|biscuit|food)\b/.test(name)) return "food";
      if (/\b(canteen|waterskin|water)\b/.test(name)) return "water";
      return "consumable";
    }
    if (/\b(canteen|waterskin)\b/.test(name)) return "water";
    if (item.uses && item.uses.max != null && Number(item.uses.max) > 0) return "tool";
    return "gear";
  }

  /* Form presets for a kind: what type / shelf / wear / tags / weapon kind an item of that kind gets. */
  function defaults(kind) {
    var k = KINDS[kind] || KINDS.gear;
    return { type: k.type, shelf: k.shelf || "", wear: k.wear || "", tags: (k.tags || []).slice(), noCarry: !!k.noCarry, wkind: k.wkind || "" };
  }
  function homeText(item) {
    var k = KINDS[classify(item)] || KINDS.gear;
    return k.homeText;
  }

  /* ---------------------------------------------------------------- Special UI registry */
  var registry = {};
  var hooks = {};
  function register(key, spec) {
    if (!key || !spec || typeof spec !== "object") return false;
    registry[String(key)] = spec;
    return true;
  }
  function unregister(key) { delete registry[String(key)]; }
  function specFor(obj) {
    if (!obj) return null;
    var keys = [obj.ui, obj.weaponId, obj.catalogId, obj.id];
    for (var i = 0; i < keys.length; i++) if (keys[i] && registry[String(keys[i])]) return registry[String(keys[i])];
    return null;
  }
  function on(card, fn) {
    if (!card || typeof fn !== "function") return;
    (hooks[card] = hooks[card] || []).push(fn);
  }
  function child(card, cls) {
    var el = card.querySelector(":scope > ." + cls);
    if (!el) { el = card.ownerDocument.createElement("div"); el.className = cls; card.appendChild(el); }
    return el;
  }
  function drop(card, cls) { var el = card.querySelector(":scope > ." + cls); if (el) el.parentNode.removeChild(el); }
  /* Called by the gun and melee card painters (trackers.js paint) after the standard card is drawn.
     ctx = { card: "gun"|"melee", kind: firearm|quiver|loaded|thrown|melee, index, weapon, character } */
  function decorate(card, ctx) {
    if (!card || !ctx) return;
    var spec = specFor(ctx.weapon);
    var item = null;
    if (!spec && ctx.character && ctx.weapon) {
      item = (ctx.character.items || []).filter(function (it) { return it && (it.weaponId === ctx.weapon.id || it.catalogId === ctx.weapon.id); })[0] || null;
      spec = specFor(item);
    }
    ctx.item = item;
    card.classList.toggle("itemui-replaced", !!(spec && spec.replace));
    if (spec && typeof spec.replace === "function") { try { spec.replace(child(card, "itemui-replace"), ctx); } catch (e) {} }
    else drop(card, "itemui-replace");
    if (spec && typeof spec.extend === "function") { try { spec.extend(child(card, "itemui-extra"), ctx); } catch (e2) {} }
    else drop(card, "itemui-extra");
    [ctx.card, ctx.kind].forEach(function (k, i) {
      if (!k || (i === 1 && k === ctx.card)) return;
      (hooks[k] || []).forEach(function (fn) { try { fn(card, ctx); } catch (e3) {} });
    });
  }

  root.SSDNSItemUI = {
    KINDS: KINDS, ORDER: ORDER, POOLS: POOLS, WEAPON_AMMO: WEAPON_AMMO,
    classify: classify, defaults: defaults, homeText: homeText, weaponOf: weaponOf, armorRow: armorRow, packOf: packOf,
    register: register, unregister: unregister, specFor: specFor, on: on, decorate: decorate
  };
})(typeof window !== "undefined" ? window : globalThis);

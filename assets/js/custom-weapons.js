/* Created weapons become real Gear weapons (0.3.54).
   An item with type "weapon" and a `weapon` stats block becomes a weapon record
   in the same shape as rules.js rows, so Gear, the map and the roll code treat it
   like a built-in weapon. Records are added to the live rules lists only when a
   character owns one, so nothing leaks into the store, kits or the PHB. */
(function (root) {
  "use strict";

  var listeners = [];
  var known = {};

  function rules() { return root.SSDNS_RULES || {}; }
  function slug(s) {
    return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  }
  function num(v, d) { var n = Number(v); return isFinite(n) ? n : d; }

  var GROUP_BY_KIND = { melee: "simple-melee", thrown: "simple-melee", bow: "simple-ranged", firearm: "pistol" };

  /* item.weapon = { kind, ability, category, group, damage, dmgType, range, properties,
                     caliber, capacity, slow, misfire, load, magic } */
  function toRecord(item) {
    if (!item || item.type !== "weapon") return null;
    var s = item.weapon || {};
    var kind = s.kind || (s.caliber || s.capacity ? "firearm" : "melee");
    var id = String(item.weaponId || item.catalogId || item.id || ("custom-" + slug(item.name))).trim();
    if (!id) return null;
    var category = s.category === "martial" ? "martial" : "simple";
    var ability = s.ability || (kind === "bow" || kind === "firearm" ? "DEX" : "STR");
    var props = String(s.properties || "");
    if (ability === "finesse" && !/finesse/i.test(props)) props = (props ? props + ", " : "") + "finesse";
    if (kind === "thrown" && !/thrown/i.test(props)) props = (props ? props + ", " : "") + "thrown";
    var rec = {
      id: id,
      name: String(item.name || "Weapon"),
      model: String(item.name || "Weapon"),
      cost: "—",
      weight: item.weight != null ? item.weight + " lb." : "—",
      properties: props || "—",
      description: String(item.description || ""),
      category: category,
      ability: ability === "finesse" ? "STR" : ability,
      custom: true,
      magic: num(s.magic, 0) || 0,
      src: "Created item"
    };
    if (s.knockout) rec.knockout = String(s.knockout);
    if (item.dmOnly) rec.dmOnly = true;
    if (item.art) rec.art = item.art;
    if (kind === "firearm") {
      var group = /^(pistol|rifle|carbine|shotgun|bigbore)$/.test(s.group || "") ? s.group : "pistol";
      var caliber = String(s.caliber || "").trim();
      var load = /percussion|ball|cap/i.test(s.load || "") ? "percussion" : "cartridge";
      rec.group = group;
      rec.action = s.action || "Custom";
      rec.load = load === "percussion" ? "Cap & ball" : "Cartridge";
      rec.ammo = load;
      rec.capacity = Math.max(1, Math.min(20, num(s.capacity, 6)));
      rec.slow = !!s.slow;
      rec.tr = false;
      rec.ability = "DEX";
      rec.tiers = { medium: { damage: s.damage || "1d8", range: s.range || "20/60", misfire: String(s.misfire || "1") } };
      rec.rounds = { medium: caliber ? [caliber] : [] };
      rec.dmgType = s.dmgType || "Piercing";
    } else {
      rec.group = s.group || GROUP_BY_KIND[kind] || "simple-melee";
      if (category === "martial") rec.group = rec.group.replace(/^simple/, "martial");
      rec.damage = s.damage || "1d4";
      rec.dmgType = s.dmgType ? s.dmgType.charAt(0).toUpperCase() + s.dmgType.slice(1) : "Bludgeoning";
      rec.range = s.range || "—";
      rec.capacity = null;
      rec.misfire = "—";
      if (kind === "bow") rec.ammo = "arrows";
    }
    rec.kind = kind;
    return rec;
  }

  function listFor(rec) {
    var R = rules();
    if (rec.kind === "firearm") return R.firearms || (R.firearms = []);
    if (rec.kind === "bow") return R.otherRanged || (R.otherRanged = []);
    return R.melee || (R.melee = []);
  }

  function register(rec) {
    if (!rec || !rec.id) return null;
    var list = listFor(rec);
    var i;
    for (i = 0; i < list.length; i++) {
      if (list[i] && list[i].id === rec.id) {
        if (list[i].custom) { list[i] = rec; known[rec.id] = rec; listeners.forEach(function (fn) { try { fn(rec); } catch (e) {} }); }
        return list[i];
      }
    }
    list.push(rec);
    known[rec.id] = rec;
    listeners.forEach(function (fn) { try { fn(rec); } catch (e) {} });
    return rec;
  }

  function registerItem(item) { return register(toRecord(item)); }

  function syncCharacter(c) {
    if (!c) return [];
    var out = [];
    (c.items || []).forEach(function (item) {
      if (item && item.type === "weapon" && item.weapon) {
        var rec = registerItem(item);
        if (rec) out.push(rec);
      }
    });
    if (root.SSDNSPeaceMaker && root.SSDNSPeaceMaker.weapon) {
      var pm = root.SSDNSPeaceMaker.weapon();
      var owns = (c.melee || []).some(function (m) { return m && m.weapon === pm.id; }) ||
        (c.guns || []).some(function (g) { return g && g.weapon === pm.id; });
      if (owns) out.push(register(Object.assign({ kind: "melee" }, pm)));
    }
    return out;
  }

  function onRegister(fn) {
    if (typeof fn !== "function") return;
    listeners.push(fn);
    Object.keys(known).forEach(function (id) { try { fn(known[id]); } catch (e) {} });
  }

  root.SSDNSCustomWeapons = {
    toRecord: toRecord,
    register: register,
    registerItem: registerItem,
    syncCharacter: syncCharacter,
    onRegister: onRegister,
    get: function (id) { return known[id] || null; },
    all: function () { return Object.keys(known).map(function (k) { return known[k]; }); }
  };
})(typeof window !== "undefined" ? window : globalThis);

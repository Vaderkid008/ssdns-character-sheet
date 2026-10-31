/* N91 Chunks 7–9 catalog admit. Book-side spells that rules.js still stores as kind "none".
   This file merges the live cast rows. It does not edit rules.js.
   Sheet and DM Command Center both load it after rules.js and before spell-cast.js. */
(function (root) {
  "use strict";
  var ROWS = [
    { name: "Entangle", level: 1, kind: "save", save: "STR", castDamage: false, applyNow: false, onFail: "Restrained", conc: true, note: "20-foot square of difficult terrain" },
    { name: "Faerie Fire", level: 1, kind: "save", save: "DEX", castDamage: false, applyNow: false, onFail: "Outlined", conc: true, note: "outlined targets are attacked with advantage" },
    { name: "Sleep", level: 1, kind: "none", conc: false, note: "5d8 hit-point budget (+2d8 per slot above 1st); lowest current HP fall Unconscious first" },
    { name: "Bane", level: 1, kind: "none", conc: true, save: "CHA", onFail: "Baned", note: "−1d4 on attack rolls and saving throws" },
    { name: "Armor of Agathys", level: 1, kind: "none", conc: false, note: "5 temporary hit points per slot level; a melee hit takes that much cold while they last" },
    { name: "Color Spray", level: 1, kind: "none", conc: false, note: "6d10 hit-point budget in a 15-foot cone; Blinded, lowest HP first" },
    { name: "Darkness", level: 2, kind: "none", conc: true, note: "15-foot silhouette zone; real occlusion stays Lighting v2" },
    { name: "Hold Person", level: 2, kind: "save", save: "WIS", castDamage: false, applyNow: false, onFail: "Paralyzed", endSave: "WIS", conc: true, note: "one humanoid; repeats the save at the end of each of its turns" },
    { name: "Misty Step", level: 2, kind: "none", conc: false, note: "bonus action; teleport up to 30 feet to a space you can see" },
    { name: "Web", level: 2, kind: "save", save: "DEX", castDamage: false, applyNow: false, onFail: "Restrained", conc: true, note: "20-foot cube, difficult terrain, lightly obscured" },
    { name: "Spike Growth", level: 2, kind: "none", conc: true, note: "20-foot radius difficult terrain; 2d4 piercing for every 5 feet moved through it" },
    { name: "Mirror Image", level: 2, kind: "none", conc: false, note: "three duplicates orbit you; AC 10 + your Dexterity modifier; a hit may pop one" },
    { name: "Blur", level: 2, kind: "none", conc: true, note: "attackers that rely on sight have disadvantage" },
    { name: "Silence", level: 2, kind: "none", conc: true, note: "20-foot hush sphere; no sound inside, creatures there are deafened and immune to thunder" },
    { name: "Counterspell", level: 3, kind: "none", conc: false, note: "reaction; a spell of 3rd level or lower fails, a higher spell is a spellcasting ability check" },
    { name: "Fear", level: 3, kind: "save", save: "WIS", castDamage: false, applyNow: false, onFail: "Frightened", conc: true, note: "30-foot cone; a failed save drops held items and must flee" },
    { name: "Haste", level: 3, kind: "none", conc: true, note: "double speed, +2 AC, advantage on Dexterity saves, and one extra action" },
    { name: "Slow", level: 3, kind: "save", save: "WIS", castDamage: false, applyNow: false, onFail: "Slowed", endSave: "WIS", conc: true, note: "up to six creatures in a 40-foot cube; speed halved, −2 AC, no reactions" },
    { name: "Hypnotic Pattern", level: 3, kind: "save", save: "WIS", castDamage: false, applyNow: false, onFail: "Charmed + Incapacitated", conc: true, note: "30-foot weird pattern (v2 tile, no cube frame)" },
    { name: "Fly", level: 3, kind: "none", conc: true, note: "willing creature gains a flying speed of 60 feet" },
    { name: "Stinking Cloud", level: 3, kind: "save", save: "CON", castDamage: false, applyNow: false, onFail: "Retching", conc: true, note: "20-foot gut fog; a failed save at the start of a turn spends the action retching" },
    { name: "Wind Wall", level: 3, kind: "save", save: "STR", dice: "3d8", type: "bludgeoning", half: true, conc: true, note: "50-foot gale; ranged weapon attacks through it have disadvantage" },
    { name: "Banishment", level: 4, kind: "save", save: "CHA", castDamage: false, applyNow: false, onFail: "Banished", conc: true, note: "incapacitated elsewhere; it returns if you drop concentration early" },
    { name: "Black Tentacles", level: 4, kind: "save", save: "DEX", dice: "3d6", type: "bludgeoning", up: "1d6", castDamage: false, applyNow: false, onFail: "Restrained", conc: true, note: "20-foot square; 3d6 bludgeoning when a creature enters or starts its turn there" },
    { name: "Polymorph", level: 4, kind: "save", save: "WIS", castDamage: false, applyNow: false, onFail: "Polymorphed", conc: true, note: "beast whose challenge rating is at or under the target's; the map token is not swapped automatically" }
  ];
  var by = {};
  ROWS.forEach(function (row) { by[String(row.name || "").toLowerCase()] = row; });
  root.SSDNS_SPELL_ADMIT = { rows: ROWS, by: by, chunks: "7-9" };

  var rules = root.SSDNS_RULES;
  if (!rules) return;
  if (!Array.isArray(rules.spellCast)) rules.spellCast = [];
  var list = rules.spellCast;
  var index = {};
  list.forEach(function (row, i) {
    if (row && row.name) index[String(row.name).toLowerCase()] = i;
  });
  ROWS.forEach(function (row) {
    var key = row.name.toLowerCase();
    var at = index[key];
    if (at == null) {
      list.push(Object.assign({}, row));
      index[key] = list.length - 1;
      return;
    }
    var prev = list[at] || {};
    var next = Object.assign({}, prev);
    Object.keys(row).forEach(function (field) {
      if (field === "name") return;
      if (field === "kind" && prev.kind && prev.kind !== "none") return;
      if ((field === "dice" || field === "type" || field === "save" || field === "half" || field === "up") && prev[field] != null && prev[field] !== "") return;
      if (field === "level" && typeof prev.level === "number") return;
      next[field] = row[field];
    });
    list[at] = next;
  });
})(typeof window !== "undefined" ? window : globalThis);

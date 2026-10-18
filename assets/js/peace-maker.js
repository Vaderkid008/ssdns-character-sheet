/* The Peace Maker. DM-only special weapon (L0169 / L0171, DND Bot 2026-10-18).
   Not in the PHB, the store, or starting kits. DM-place only.
   Stats from book1-sources/act1-special-finds-tables.md (Placed Named Weapons):
   +1 baseball bat, simple melee, 1d6+1 bludgeoning, 2 lb, Uncommon, no attunement,
   no ammo or misfire, Str. Once per short rest after a hit: knockout (the target
   drops to 0 HP and is stable). The DM can override anything. */
(function (root) {
  "use strict";
  var KNOCKOUT = "Once per short rest, after a hit: knockout. The target drops to 0 HP and is stable.";
  var WEAPON = {
    id: "the-peace-maker",
    name: "The Peace Maker",
    model: "The Peace Maker",
    group: "simple-melee",
    cost: "—",
    damage: "1d6",
    dmgType: "Bludgeoning",
    range: "—",
    capacity: null,
    misfire: "—",
    magic: 1,
    weight: "2 lb.",
    rarity: "Uncommon",
    attunement: false,
    properties: "+1 magic bat, simple melee. " + KNOCKOUT,
    description: "DM-only. Not for sale. +1 baseball bat: +1 to hit, 1d6+1 bludgeoning. " + KNOCKOUT,
    knockout: KNOCKOUT,
    src: "act1-special-finds-tables.md (Placed Named Weapons), L0169/L0171",
    category: "simple",
    ability: "STR",
    dmOnly: true,
    notForSale: true
  };
  function weapon() { return WEAPON; }
  function lookup(id) {
    if (id == null || id === "") return null;
    var key = String(id).replace(/^\s*\d+\s*x\s+/i, "").trim().toLowerCase();
    if (key === WEAPON.id || key === "peace-maker" || key === "the peace maker" || key === "peace maker") return WEAPON;
    return null;
  }
  root.SSDNSPeaceMaker = {
    id: WEAPON.id,
    weapon: weapon,
    lookup: lookup,
    knockout: KNOCKOUT,
    usesKey: "The Peace Maker knockout",
    placeholder: false
  };
})(typeof window !== "undefined" ? window : globalThis);

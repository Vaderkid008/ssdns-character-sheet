/* The Peace Maker. DM-only special weapon.
   Not in the PHB, the store, or starting kits.
   act1-special-finds-tables.md is not in this repo, so the stats are a
   conservative revolver placeholder the DM can type over on the gun card. */
(function (root) {
  "use strict";
  var WEAPON = {
    id: "the-peace-maker",
    name: "The Peace Maker",
    model: "The Peace Maker",
    group: "pistol",
    cost: "—",
    action: "Revolver",
    tr: true,
    load: "Cartridge",
    capacity: 6,
    tiers: {
      medium: { damage: "1d8", range: "20/60", misfire: "1" }
    },
    weight: "3 lb.",
    properties: "Close quarters, martial, DM special. Placeholder revolver stats.",
    description: "DM-only. Not for sale. Placeholder: 1d8, 20/60, 6 rounds, misfire 1. Type over the attack or damage box to edit.",
    src: "DM placeholder — act1-special-finds-tables.md was not in the repo",
    slow: false,
    ability: "DEX",
    category: "martial",
    rounds: { medium: [".44-40"] },
    ammo: "cartridge",
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
    placeholder: true
  };
})(typeof window !== "undefined" ? window : globalThis);

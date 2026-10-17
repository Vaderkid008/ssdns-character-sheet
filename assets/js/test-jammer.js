/* Debug revolver for jam, streak, d4, and Clean checks.
   Not part of the PHB catalog. The DM grants it.
   Ceiling 20 puts every kept d20 in the misfire range.
   A spark is still not a misfire. Both dice still foul and reset the streak. */
(function (root) {
  "use strict";
  var WEAPON = {
    id: "test-jammer",
    name: "TEST Jammer",
    model: "TEST Jammer",
    group: "pistol",
    cost: "0",
    action: "Percussion revolver (slow)",
    tr: false,
    load: "Ball & Cap",
    capacity: 6,
    tiers: {
      medium: { damage: "1d8", range: "20/60", misfire: "1–20" }
    },
    weight: "3 lb.",
    properties: "TEST, close quarters, simple",
    slow: true,
    ability: "DEX",
    category: "simple",
    rounds: {},
    ammo: "percussion",
    debug: true,
    testOnly: true
  };
  function weapon() { return WEAPON; }
  function weapons() { return [WEAPON]; }
  function lookup(id) {
    if (id == null || id === "") return null;
    var key = String(id);
    if (key === WEAPON.id || key === WEAPON.name) return WEAPON;
    return null;
  }
  function matches(name) {
    var key = String(name || "").replace(/^\s*\d+\s*x\s+/i, "").trim().toLowerCase();
    return key === WEAPON.id || key === "test jammer" || key === "test jammer.";
  }
  root.SSDNSTestJammer = {
    id: WEAPON.id,
    weapon: weapon,
    weapons: weapons,
    lookup: lookup,
    matches: matches
  };
})(typeof window !== "undefined" ? window : globalThis);

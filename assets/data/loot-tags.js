/* Act I loot overlay (LOOT-BOX-AND-TRADE-SPEC shape, L0209 tables v1.1).
   Loaded after the catalogs. Does not edit a catalog row except by id lookup.
   Percentages outside the locked gun mix and the Outlaw Stash Black rate are DRAFT. */
(function (root) {
  "use strict";
  var story = [
    "eldorite-dust", "hat-of-the-sharpshooter", "harmonica-of-soothing-melodies", "saddle-of-the-phantom-steed",
    "lightning-tomahawk", "cutlass-of-the-suns-fury", "old-henrys-rifle", "lasso-of-binding",
    "ore-scholars-robe", "true-measure-ore-kit", "night-prospectors-cape", "ore-buyers-signet", "prospectors-touch",
    "chemical-field-ledger", "frontier-keepsake", "carved-walking-stick", "medicine-pouch", "home-spring-soil-pouch",
    "tin-star-badge", "borrowed-iron", "legloss-revolver"
  ];
  var quest = ["bounty-warrant", "claim-deed", "strongbox-key", "black-shard", "glowing-letter", "glowing-letter-cure-wounds", "glowing-letter-shield", "glowing-letter-fireball", "glowing-letter-revivify"];
  var tags = {
    "assay-tonic-trail-draught": { rarity: "common", lootable: true, stack: true },
    "greater-healing-libation": { rarity: "uncommon", lootable: true, stack: true },
    "snakebite-antivenin-antitoxin": { rarity: "uncommon", lootable: true, stack: true },
    "blessed-water-saint-s-wash": { rarity: "uncommon", lootable: true, stack: true },
    "trail-poison-illegal-in-most-towns": { rarity: "rare", magic: false, mundane: true, lootable: true, stack: true },
    "arrows-poison-3": { rarity: "rare", magic: false, mundane: true, lootable: true, tags: ["ammo"] },
    "pony-arms-chaosmaker-light": { rarity: "common", actMin: 2, lootable: false },
    "pony-arms-chaosmaker-medium": { actMin: 2, lootable: false },
    "pony-arms-chaosmaker-heavy": { actMin: 2, lootable: false },
    "lancaster-repeating-rifle": { actMin: 2, lootable: false },
    "lancaster-lever-shotgun": { actMin: 2, lootable: false },
    "lancaster-heavy-saddle-carbine": { actMin: 2, lootable: false },
    "bison-big-fifty-buffalo-rifle": { actMin: 2, lootable: false },
    "dynamite-stick-sweating-sold-cheap": { rarity: "common", lootable: true, tags: ["explosive"] },
    "dynamite-stick-standard-fuse": { rarity: "common", lootable: true, tags: ["explosive"] },
    "blasting-keg": { rarity: "uncommon", lootable: true, tags: ["explosive"] },
    "black-shard-junk": { rarity: "common", lootable: true, tags: ["junk"], stack: true },
    "hardtack-jerky-1-day": { rarity: "common", lootable: true, stack: true, tags: ["food"] },
    "whiskey-bottle": { rarity: "common", lootable: true, stack: true, tags: ["drink"] },
    "waterskin-canteen": { rarity: "common", lootable: true, tags: ["water"] },
    "lamp-oil": { rarity: "common", lootable: true, stack: true },
    "torch-pitch-stick": { rarity: "common", lootable: true, stack: true }
  };
  story.forEach(function (id) { tags[id] = Object.assign({ storyOnly: true, lootable: false }, tags[id] || {}); });
  quest.forEach(function (id) { tags[id] = Object.assign({ storyOnly: true, noTrade: true, lootable: false }, tags[id] || {}); });
  root.SSDNS_LOOT_TAGS = tags;
})(typeof window !== "undefined" ? window : globalThis);

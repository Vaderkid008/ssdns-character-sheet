/* Act I loot overlay (DRAFT v1.3). Loaded after the catalogs. Does not rewrite a catalog row.
   Locked: gun mix 20% each, Outlaw Stash Black 1-in-6. Other percentages are the balance floor (DRAFT).
   Glowing Letters are the only Story Finds the roller may select, and only via the scroll-chance layer.
   strongbox-key can be hand-placed and used as a lock key. It is not a band row.
   ChaosMaker weapons stay actMin 2. There is no ChaosMaker-ammo row. */
(function (root) {
  "use strict";
  var story = [
    "eldorite-dust", "hat-of-the-sharpshooter", "harmonica-of-soothing-melodies", "saddle-of-the-phantom-steed",
    "lightning-tomahawk", "cutlass-of-the-suns-fury", "old-henrys-rifle", "lasso-of-binding",
    "ore-scholars-robe", "true-measure-ore-kit", "night-prospectors-cape", "ore-buyers-signet", "prospectors-touch",
    "chemical-field-ledger", "frontier-keepsake", "carved-walking-stick", "medicine-pouch", "home-spring-soil-pouch",
    "tin-star-badge", "borrowed-iron", "legloss-revolver"
  ];
  var quest = ["bounty-warrant", "claim-deed", "strongbox-key", "black-shard"];
  var letters = ["glowing-letter", "glowing-letter-cure-wounds", "glowing-letter-shield", "glowing-letter-fireball", "glowing-letter-revivify"];
  var tags = {
    "assay-tonic-trail-draught": { rarity: "common", lootable: true, stack: true },
    "greater-healing-libation": { rarity: "uncommon", lootable: true, stack: true },
    "snakebite-antivenin-antitoxin": { rarity: "uncommon", lootable: true, stack: true },
    "blessed-water-saint-s-wash": { rarity: "uncommon", lootable: true, stack: true },
    "trail-poison-illegal-in-most-towns": { rarity: "rare", magic: false, mundane: true, lootable: true, stack: true },
    "arrows-poison-3": { rarity: "rare", magic: false, mundane: true, lootable: true, tags: ["ammo"] },
    "slugs-410-10": { rarity: "common", lootable: true, tags: ["ammo"], stack: true },
    "slugs-12-ga-10": { rarity: "common", lootable: true, tags: ["ammo"], stack: true },
    "slugs-10-ga-10": { rarity: "common", lootable: true, actMin: 2, tags: ["ammo"], stack: true },
    "arrows-dynamite-1": { rarity: "common", lootable: true, tags: ["explosive", "ammo"], stack: true },
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
  /* Jessey 10:22 PM CT: these five override storyOnly. They are Uncommon scrolls, not the Rare-magic limit. */
  letters.forEach(function (id) {
    tags[id] = { rarity: "uncommon", lootable: true, storyOnly: false, maxPerBox: 1, tags: ["scroll"] };
  });
  /* DM hand-place and keyItem. noBand keeps it off the roller even if a row is pasted in. */
  tags["strongbox-key"] = { lootable: true, storyOnly: false, noTrade: true, noBand: true, rarity: "quest" };
  root.SSDNS_LOOT_TAGS = tags;
})(typeof window !== "undefined" ? window : globalThis);

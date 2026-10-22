/* Gear item art. Filenames are store/rules ids.
   Unmapped items keep their text row. DM-only art is not in this list. */
(function (root) {
  "use strict";

  var ROWS = [
    ["assay-tonic-trail-draught", "Healing Libation"],
    ["snakebite-antivenin-antitoxin", "Snakebite antivenin (antitoxin)"],
    ["lamp-oil", "Lamp oil"],
    ["fuse-cord-50-ft", "Fuse cord (50 ft)"],
    ["lariat-50-ft", "Lariat (50 ft)"],
    ["field-medic-kit", "Field medic kit"],
    ["iron-cuffs", "Iron cuffs"],
    ["hardtack-jerky-1-day", "Hardtack / jerky (1 day)"],
    ["caltrops-jack-nails-bag-of-20", "Caltrops / jack-nails (bag of 20)"],
    ["field-glass-spyglass", "Field glass (spyglass)"],
    ["whiskey-bottle", "Whiskey (bottle)"],
    ["gun-cleaning-kit", "Gun cleaning kit"],
    ["trail-poison-illegal-in-most-towns", "Trail poison (illegal in most towns)"],
    ["blessed-water-saint-s-wash", "Blessed water / saint’s wash"]
  ];

  var byId = {};
  var byName = {};
  ROWS.forEach(function (row) {
    byId[row[0]] = row[1];
    byName[norm(row[1])] = row[0];
  });
  byName[norm("Snakebite antivenin")] = "snakebite-antivenin-antitoxin";
  byName[norm("Caltrops / jack-nails")] = "caltrops-jack-nails-bag-of-20";
  byName[norm("Field glass")] = "field-glass-spyglass";
  byName[norm("Whiskey")] = "whiskey-bottle";
  byName[norm("Trail poison")] = "trail-poison-illegal-in-most-towns";
  byName[norm("Blessed water / saint's wash")] = "blessed-water-saint-s-wash";
  byName[norm("Hardtack / jerky")] = "hardtack-jerky-1-day";
  byName[norm("Fuse cord")] = "fuse-cord-50-ft";
  byName[norm("Lariat")] = "lariat-50-ft";

  /* 0.3.105 (Jessey 2026-10-20 11:10 PM, Art Bot): relic Caster Gun art (L0199 / L0202). DM Guide only: there are no
     relic catalog items, store rows or Add item entries, and these slugs are kept out of list() / matchesIn(), so
     nothing player-facing offers them. The files live under assets/img/dm-only/. When a relic item or gun with one of
     these ids exists later (DM-placed), relicTile / relicEngraving (and so the doll, item rows, Weapons rows and gun
     cards) pick the art up by id. The Twin Puff Adders are two items, one per hand; the old combined
     "twin-puff-adders" slug is retired and maps to nothing. */
  var RELIC_CASTER = ["viper", "python", "boa", "cobra", "cotton-mouth", "fer-de-lance", "cascabel", "timber-rat",
    "massasauga", "twin-puff-adder-left", "twin-puff-adder-right"];
  var relicIds = {};
  RELIC_CASTER.forEach(function (slug) { relicIds[slug] = slug; });
  /* Spellings a future catalog id might use. */
  relicIds.cottonmouth = "cotton-mouth";
  relicIds["timber-rattler"] = "timber-rat";
  relicIds["puff-adder-left"] = "twin-puff-adder-left";
  relicIds["puff-adder-right"] = "twin-puff-adder-right";
  function relicSlug(x) {
    var id = typeof x === "string" ? x : String((x && (x.weaponId || x.catalogId || x.id || x.weapon)) || "");
    id = id.toLowerCase().replace(/^relic-/, "").replace(/-caster-gun$/, "");
    return relicIds[id] || "";
  }
  function relicTile(x) { var s = relicSlug(x); return s ? prefix() + "assets/img/dm-only/items/caster/" + s + ".webp" : ""; }
  function relicEngraving(x) { var s = relicSlug(x); return s ? prefix() + "assets/img/dm-only/weapons/caster/" + s + ".webp" : ""; }
  function relics() { return RELIC_CASTER.map(function (s) { return { slug: s, tile: relicTile(s), engraving: relicEngraving(s) }; }); }

  /* Paper Doll v2.1 item art (Art Bot, Jessey approved 2026-10-22 4:25 AM CT). Each item has a 256 colour tile at
     assets/img/items/<slug>.webp (inventory: Equipment rows, item rows) and a 400x400 b/w engraving at
     assets/img/items/gear/<slug>.webp (the paper doll; paper-doll.js swaps the tile for the engraving).
     None of these is a catalog item yet, so the slugs double as future ids, and custom items find their art by name.
     Rows: [slug, doll family (paper-doll.js slot check), name pattern or null]. The four plain store rows (Cattleman hat,
     Bandana, Work gloves, Leather chaps) match by id only: a plain "Leather chaps" keeps the generic chaps-leather art
     until Jessey picks which art those rows use. The Cottonwood Walking Stick is a weapon (weapon-art.js). */
  var GEAR_V21 = [
    ["cattleman-hat", "hat", null],
    ["bandana", "neck", null],
    ["pocket-watch", "trinket", /pocket[- ]?watch/i],
    ["signet-ring", "ring", /\bsignet ring\b/i],
    ["work-gloves", "gloves", null],
    ["leather-chaps", "chaps", null],
    ["rail-gang-rifle-plate", "shield", /rail[- ]?gang/i],
    ["tin-star-board", "shield", /tin[- ]?star board/i],
    ["lost-troop-cavalry-shield", "shield", /lost troop/i],
    ["hushwire-shoulder-rig", "holster", /hushwire/i],
    ["rattlers-skeleton-rig", "holster", /rattler[’']?s skeleton/i],
    ["last-word-cross-draw", "holster", /last word/i],
    ["dry-powder-bandolier", "belt", /dry[- ]?powder/i],
    ["rodeo-champions-buckle", "belt", /rodeo champion/i],
    ["gravediggers-gun-belt", "belt", /gravedigger/i],
    ["brush-buster-chaps", "chaps", /brush[- ]?buster/i],
    ["rattler-hide-chaps", "chaps", /rattler[- ]?hide/i],
    ["saddle-glue-woolies", "chaps", /saddle[- ]?glue|woolies/i],
    ["brass-bound-hymn-book", "focus", /brass[- ]?bound hymn/i],
    ["brass-magnifying-glass", "focus", /brass magnifying/i],
    ["tight-lip-ring", "ring", /tight[- ]?lip/i],
    ["reinforced-trail-leathers", "armor", /reinforced trail leathers/i]
  ];
  var v21Ids = {};
  GEAR_V21.forEach(function (row) { v21Ids[row[0]] = row; });
  /* {slug, family} for an item / id, or null. An item's own art is not checked here (srcFor does that first). */
  function gearV21(x) {
    if (!x) return null;
    var id = typeof x === "string" ? x : String(x.catalogId || x.id || "");
    var row = id && v21Ids[id];
    if (!row && typeof x === "object") {
      var name = String(x.name || "");
      if (name) row = GEAR_V21.filter(function (r) { return r[2] && r[2].test(name); })[0];
    }
    return row ? { slug: row[0], family: row[1] } : null;
  }
  function gearV21Tile(x) { var g = gearV21(x); return g ? prefix() + "assets/img/items/" + g.slug + ".webp" : ""; }

  function norm(s) {
    return String(s || "")
      .toLowerCase()
      .replace(/['’]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
  function prefix() {
    try {
      var path = (root.location && root.location.pathname) || "";
      if (path.indexOf("/dm/") >= 0) return "../";
    } catch (e) {}
    return "";
  }
  function slugFor(item) {
    if (!item) return "";
    if (typeof item === "string") {
      if (byId[item]) return item;
      return byName[norm(item)] || "";
    }
    var id = item.id || "";
    if (id && byId[id]) return id;
    return byName[norm(item.name || "")] || "";
  }
  function srcFor(item) {
    var given = item && typeof item === "object" && item.art ? String(item.art) : "";
    if (given) {
      if (/^(https?:|data:|\.\.)/.test(given)) return given;
      return prefix() + given.replace(/^\//, "");
    }
    var slug = slugFor(item);
    if (slug) return prefix() + "assets/img/items/" + slug + ".webp";
    var v21 = gearV21Tile(item);
    if (v21) return v21;
    var relic = relicTile(item);
    if (relic) return relic;
    if (root.SSDNSInstrumentArt && root.SSDNSInstrumentArt.srcFor) return root.SSDNSInstrumentArt.srcFor(item) || "";
    return "";
  }
  function list() {
    return ROWS.map(function (row) {
      return { id: row[0], name: row[1], src: prefix() + "assets/img/items/" + row[0] + ".webp" };
    });
  }
  function matchesIn(text) {
    var low = String(text || "").toLowerCase();
    if (!low) return [];
    var rows = list().slice();
    if (root.SSDNSInstrumentArt && root.SSDNSInstrumentArt.list) rows = rows.concat(root.SSDNSInstrumentArt.list());
    rows.sort(function (a, b) { return String(b.name || "").length - String(a.name || "").length; });
    var used = [];
    var out = [];
    rows.forEach(function (row) {
      var name = String(row.name || "");
      if (name.length < 4) return;
      var at = low.indexOf(name.toLowerCase());
      if (at < 0) return;
      for (var i = 0; i < used.length; i++) {
        if (at >= used[i][0] && at < used[i][1]) return;
      }
      used.push([at, at + name.length]);
      out.push(row);
    });
    return out;
  }
  /* 0.3.105 (art batch 1, Jessey approved 2026-10-21 6:40 PM CT, Art Bot): 256x256 square tiles for the catalog items whose
     only art was a 1200x400 banner. The ROWS items above keep their banner at assets/img/items/<slug>.webp because the
     Store tab rows, the DMCC gear table and the Equipment-notes art strip draw it in a 3:1 box; their square tile is
     added at assets/img/items/square/<slug>.webp for item slots (Equipment rows, paper doll, list squares). The other
     banner-only items had no wide use, so their file was replaced by the square in place. */
  var SQUARE_DIR = "assets/img/items/square/";
  var squareIds = {};
  ROWS.forEach(function (row) { squareIds[row[0]] = 1; });
  /* item-slot art for a path: a kept banner -> its square tile; an engraving (assets/img/weapons/<slug>) -> the weapon's
     square tile; anything else unchanged. */
  function squareSrc(src) {
    var str = String(src || "");
    if (!str) return "";
    var m = /^((?:\.\.\/)*)assets\/img\/items\/([a-z0-9-]+)\.webp((?:[?#].*)?)$/.exec(str);
    if (m && squareIds[m[2]]) return m[1] + SQUARE_DIR + m[2] + ".webp" + m[3];
    var W = root.SSDNSWeaponArt;
    if (W && W.tileForEngraving && /assets\/img\/weapons\//.test(str) && !/assets\/img\/weapons\/borrowed-iron\//.test(str)) {
      var t = W.tileForEngraving(str);
      if (t) return (/^\.\.\//.test(str) && !/^\.\.\//.test(t) ? "../" : "") + t;
    }
    return str;
  }
  function squareFor(item) { return squareSrc(srcFor(item)); }
  function squares() { return ROWS.map(function (row) { return { id: row[0], banner: "assets/img/items/" + row[0] + ".webp", square: SQUARE_DIR + row[0] + ".webp" }; }); }

  function thumbHtml(item) {
    var src = srcFor(item);
    if (!src) return "";
    var name = (item && item.name) || byId[slugFor(item)] || "";
    return '<img class="art-thumb" alt="' + String(name).replace(/"/g, "") + '" src="' + src + '">';
  }

  root.SSDNSItemArt = {
    slugFor: slugFor,
    srcFor: srcFor,
    list: list,
    matchesIn: matchesIn,
    thumbHtml: thumbHtml,
    squareSrc: squareSrc,
    squareFor: squareFor,
    squares: squares,
    relicSlug: relicSlug,
    relicTile: relicTile,
    relicEngraving: relicEngraving,
    relics: relics,
    gearV21: gearV21,
    gearV21Tile: gearV21Tile,
    gearV21Slugs: function () { return GEAR_V21.map(function (row) { return row[0]; }); }
  };
})(typeof window !== "undefined" ? window : globalThis);

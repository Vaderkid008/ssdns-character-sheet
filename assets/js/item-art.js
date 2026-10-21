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

  /* 0.3.100 (Jessey 2026-10-20 11:10 PM, Art Bot): relic Caster Gun art (L0199 / L0202). DM Guide only: there are no
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
    relicSlug: relicSlug,
    relicTile: relicTile,
    relicEngraving: relicEngraving,
    relics: relics
  };
})(typeof window !== "undefined" ? window : globalThis);

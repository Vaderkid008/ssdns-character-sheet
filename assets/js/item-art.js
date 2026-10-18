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
    thumbHtml: thumbHtml
  };
})(typeof window !== "undefined" ? window : globalThis);

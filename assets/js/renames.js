/* L0184 + L0185 label renames (PHB package #6: no more "Circuit"; cowhand's staff; Detect restless dead),
   plus L0165 (no "assay": the PHB says Ore glass / Ore scale / ore forgeries). Saved sheets keep their ids
   (pack ids "circuit"/"trunk", store ids "circuit-kit", "circuit-trunk", "circuit-robe-coat", melee id "trail-staff-drover-s-staff-quarterstaff",
   "fine-clothes-circuit-coat"); only the old display text is swapped on load and on DMCC display. */
(function (root) {
  "use strict";
  /* Longest first, so a longer label is swapped before a shorter one inside it. */
  var PAIRS = [
    ["The Whisper Network & The Circuit", "The Whisper Network"],
    ["The Circuit Rider's Code", "The Trail Preacher's Code"],
    ["The Circuit Rider\u2019s Code", "The Trail Preacher's Code"],
    ["Circuit robe / coat", "Long robe / coat"],
    ["Circuit Welcome", "Chapel Welcome"],
    ["Circuit Magic", "Preacher's Magic"],
    ["Circuit trunk", "Traveling trunk"],
    ["Circuit kit", "Preacher's kit"],
    ["circuit coat", "long coat"],
    /* L0185 */
    ["drover's staff", "cowhand's staff"],
    ["drover\u2019s staff", "cowhand's staff"],
    ["Detect unquiet dead", "Detect restless dead"],
    /* L0165: store items (ids assay-glass-magnifying-glass, assay-scale, forgery-kit-assay-forgeries stay) */
    ["Assay glass", "Ore glass"],
    ["assay glass", "ore glass"],
    ["Assay scale", "Ore scale"],
    ["assay scale", "ore scale"],
    ["Assay forgeries", "Ore forgeries"],
    ["assay forgeries", "ore forgeries"]
  ];
  function text(s) {
    if (typeof s !== "string" || !/circuit|drover|unquiet dead|assay/i.test(s)) return s;
    PAIRS.forEach(function (p) { if (s.indexOf(p[0]) >= 0) s = s.split(p[0]).join(p[1]); });
    return s;
  }
  var FIELDS = ["equipment", "features", "proficienciesLanguages", "notes", "treasure", "backstory"];
  /** Rename old labels in a saved character. Returns how many fields or items changed. */
  function character(c) {
    if (!c || typeof c !== "object") return 0;
    var n = 0;
    FIELDS.forEach(function (k) {
      if (typeof c[k] !== "string") return;
      var t = text(c[k]);
      if (t !== c[k]) { c[k] = t; n++; }
    });
    ["items", "melee", "guns"].forEach(function (list) { if (Array.isArray(c[list])) c[list].forEach(function (it) {
      if (!it || typeof it.name !== "string") return;
      var t = text(it.name);
      if (t !== it.name) { it.name = t; n++; }
    }); });
    if (c.featureUses && typeof c.featureUses === "object" && !Array.isArray(c.featureUses)) {
      Object.keys(c.featureUses).forEach(function (k) {
        var t = text(k);
        if (t === k) return;
        if (!(t in c.featureUses)) c.featureUses[t] = c.featureUses[k];
        delete c.featureUses[k];
        n++;
      });
    }
    return n;
  }
  /** Store stock / preview lines (DMCC drafts in localStorage, live stock in the table). Renames row.name in place. */
  function lines(list) {
    var n = 0;
    (Array.isArray(list) ? list : []).forEach(function (row) {
      if (!row || typeof row.name !== "string") return;
      var t = text(row.name);
      if (t !== row.name) { row.name = t; n++; }
    });
    return n;
  }
  root.SSDNSRenames = { pairs: PAIRS, text: text, character: character, lines: lines };
})(typeof window !== "undefined" ? window : globalThis);

/* Per-weapon art for the Borrowed Iron and the Caster Guns (Art Bot; Jessey approved 2026-10-20 9:17 PM CT).
 *  Item tile:   256x256 colour, parchment baked in. Equipment list rows, item rows, paper-doll Focus slot.
 *               assets/img/items/borrowed-iron/<slug>.webp, assets/img/items/caster/<id>.webp
 *  Engraving:   1200x400 transparent b/w, muzzle right (the gun-card art). Shown on the Gear tab Borrowed Iron card.
 *               assets/img/weapons/borrowed-iron/<slug>.webp (the Hell Maker reuses assets/img/dm-only/hell-maker.webp)
 *
 * Pact Seeker: the Pact name (character.subclass) picks the iron. BOOK1 L2060: "Your DM reveals who's on the other side
 * of it, and what your Borrowed Iron really is." So the player's sheet keeps the generic Borrowed Iron art until the DM
 * reveals it (character.ironRevealed, set from the DMCC player card). The DM page always sees the real iron.
 * No Pact name (or one not in the list) -> "" and callers keep the generic borrowed-iron.webp.
 */
(function (root) {
  "use strict";

  /* Pact name id (rules.js subclasses) -> iron slug. Patrons: spark-review/PACT-SEEKER-v3-PARTB-DM.md; names: CANON L0005-L0009. */
  var PACT_SLUG = {
    "the-crossroads-note": "hell-maker",         /* Madam Crowley */
    "the-sealed-orders": "lightslinger",         /* Gabriel */
    "lass-o-lakes": "butter-repeater",           /* the Buttah Fey */
    "the-last-round": "virgil",                  /* Virgil (the Hold Out), the living revolver */
    "the-sand-oath": "sirocco-long-rifle",       /* Saaladin the Djinn */
    "the-pine-box-contract": "pallbearer",       /* the Undertaker */
    "the-drowned-breath": "revenge-of-the-sea"   /* the Keel-Breaker */
  };
  var IRON_NAME = {
    "hell-maker": "Hell Maker", "lightslinger": "Lightslinger", "butter-repeater": "Butter Repeater", "virgil": "Virgil",
    "sirocco-long-rifle": "Sirocco Long-Rifle", "pallbearer": "Pallbearer", "revenge-of-the-sea": "Revenge of the Sea"
  };
  /* The engraving file when it isn't weapons/borrowed-iron/<slug>.webp (byte-identical art already live). */
  var ENGRAVING_FILE = { "hell-maker": "assets/img/dm-only/hell-maker.webp" };
  /* Square 256 tiles for guns whose only other art is the 3:1 engraving (a 32px square crops it). */
  var WEAPON_TILE = { blacksnake: "assets/img/items/caster/blacksnake.webp", hognose: "assets/img/items/caster/hognose.webp" };
  var GENERIC_TILE = "assets/img/items/borrowed-iron.webp";

  function prefix() {
    try { return ((root.location && root.location.pathname) || "").indexOf("/dm/") >= 0 ? "../" : ""; } catch (e) { return ""; }
  }
  function isDmPage() { return prefix() === "../"; }
  function pactSlug(c) {
    var id = String((c && (c.subclass || c.pact)) || "").toLowerCase().trim();
    if (PACT_SLUG[id]) return PACT_SLUG[id];
    /* a name instead of an id (older saves / DMCC snapshots): "The Crossroads Note" -> the-crossroads-note */
    var k = id.replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    return PACT_SLUG[k] || "";
  }
  function isPact(c) { return !!c && (c.calling === "pact-seeker" || c.callingId === "pact-seeker"); }
  function revealed(c, opts) { return !!((opts && opts.dm) || isDmPage() || (c && c.ironRevealed === true)); }
  /* The iron this character's sheet may show: slug or "" (no Pact name, or not revealed to this viewer yet). */
  function slugFor(c, opts) {
    if (!isPact(c)) return "";
    var s = pactSlug(c);
    return s && revealed(c, opts) ? s : "";
  }
  function nameFor(c, opts) { var s = slugFor(c, opts); return s ? IRON_NAME[s] : ""; }
  function tileSrc(c, opts) { var s = slugFor(c, opts); return s ? prefix() + "assets/img/items/borrowed-iron/" + s + ".webp" : ""; }
  function engravingSrc(c, opts) {
    var s = slugFor(c, opts);
    return s ? prefix() + (ENGRAVING_FILE[s] || "assets/img/weapons/borrowed-iron/" + s + ".webp") : "";
  }
  /* Square tile for a gun (id string or rules row), or "". */
  function weaponTile(w) {
    var id = typeof w === "string" ? w : String((w && w.id) || "");
    if (!WEAPON_TILE[id] && root.SSDNSWeaponArt && root.SSDNSWeaponArt.slugFor) {
      try { id = root.SSDNSWeaponArt.slugFor(w) || id; } catch (e) {}
    }
    if (WEAPON_TILE[id]) return prefix() + WEAPON_TILE[id];
    /* 0.3.99: relic Caster Guns (DM-placed only) get their square tile from the relic map in item-art.js */
    var R = root.SSDNSItemArt;
    return R && R.relicTile ? R.relicTile(typeof w === "string" ? w : (w && w.id) || id) || "" : "";
  }
  /* Item tile for an inventory item on character c: the Borrowed Iron gets its pact tile; "" = keep the item's own art. */
  function itemTile(item, c, opts) {
    if (!item) return "";
    if (item.catalogId === "borrowed-iron" || item.id === "borrowed-iron") return tileSrc(c, opts);
    return weaponTile(item.weaponId || item.catalogId || "");
  }

  /* 0.3.99 (Jessey 2026-10-20 9:53 PM): the patron is the Pact Seeker's focus. The Focus slot always shows the patron's
     256 tile (assets/img/items/patron/<pact slug>.webp, Art Bot) and the Pact name. Not gated by the iron reveal: the Pact
     name is the player's own pick. A tile that isn't there yet falls back to the generic focus tile (the slot's name
     plate still shows the Pact name), so dropping the files in later just works. */
  var PATRON_FALLBACK = "assets/img/items/default/focus.webp";
  var missing = {};
  function pactId(c) {
    var id = String((c && (c.subclass || c.pact)) || "").toLowerCase().trim();
    if (PACT_SLUG[id]) return id;
    var k = id.replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    return PACT_SLUG[k] ? k : "";
  }
  function patronSlug(c) { var id = isPact(c) ? pactId(c) : ""; return id ? id.replace(/^the-/, "") : ""; }
  function pactName(c) {
    var id = isPact(c) ? pactId(c) : "";
    if (!id) return "";
    var cal = ((root.SSDNS_RULES && root.SSDNS_RULES.callings) || []).filter(function (x) { return x && x.id === "pact-seeker"; })[0];
    var row = cal && (cal.subclasses || []).filter(function (x) { return x && x.id === id; })[0];
    return (row && row.name) || id.replace(/-/g, " ").replace(/\b\w/g, function (m) { return m.toUpperCase(); }).replace(/ O /, " O' ");
  }
  function patronFallback() { return prefix() + PATRON_FALLBACK; }
  function patronTile(c) {
    var s = patronSlug(c);
    if (!s) return patronFallback();
    var src = prefix() + "assets/img/items/patron/" + s + ".webp";
    return missing[src] ? patronFallback() : src;
  }
  function markMissing(src) { if (src) missing[String(src).replace(/[?#].*$/, "")] = 1; }
  /* The iron's shape, for the paper-doll weapon slot it prefers (only used once the iron is revealed). */
  var LONG_IRON = { "butter-repeater": 1, "sirocco-long-rifle": 1, "pallbearer": 1, "revenge-of-the-sea": 1 };
  function isLongIron(c, opts) { return !!LONG_IRON[slugFor(c, opts)]; }

  root.SSDNSIronArt = {
    patronSlug: patronSlug, pactName: pactName, patronTile: patronTile, patronFallback: patronFallback, markMissing: markMissing, isLongIron: isLongIron,
    PACT_SLUG: PACT_SLUG, IRON_NAME: IRON_NAME, GENERIC_TILE: GENERIC_TILE,
    pactSlug: pactSlug, revealed: revealed, slugFor: slugFor, nameFor: nameFor,
    tileSrc: tileSrc, engravingSrc: engravingSrc, weaponTile: weaponTile, itemTile: itemTile,
    slugs: function () { return Object.keys(IRON_NAME); }
  };
})(typeof window !== "undefined" ? window : globalThis);

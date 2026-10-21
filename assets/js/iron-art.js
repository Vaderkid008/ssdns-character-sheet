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
  /* 0.3.100 (Jessey 2026-10-21 4:35 PM): a hidden LONG iron shows a plain long-gun outline (1200x400 SVG, muzzle right,
     empty-slot glyph style) instead of the revolver tile. It only says "long gun", which the type label already shows. */
  var HIDDEN_LONG = "assets/img/items/borrowed-iron-long-outline.svg";

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
    if (isIronItem(item)) return tileSrc(c, opts) || hiddenArt(c, opts);
    return weaponTile(item.weaponId || item.catalogId || "");
  }

  /* 0.3.100 (Jessey 2026-10-20 9:53 PM): the patron is the Pact Seeker's focus. The Focus slot always shows the patron's
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
  /* 0.3.100 (Jessey 2026-10-21 12:11 / 12:12 PM CT): the iron's weapon type shows from the Pact pick, not gated by the
     DM reveal (its real name and its own art stay behind ironRevealed). Types: the locked base looks (Jessey lock
     2026-10-03) in spark-review/PACT-SEEKER-PATRON-BALANCE-v2.md, one-/two-handed as written there. */
  var IRON_TYPE = {
    "hell-maker": "Double-action revolver",      /* blued-steel double-action revolver (one-handed) */
    "lightslinger": "Single-action revolver",    /* nickel-plated single-action revolver (one-handed) */
    "butter-repeater": "Lever-action carbine",   /* lever-action carbine (two-handed) */
    "virgil": "Snub-nose belly gun",             /* battered snub-nose belly gun, a stubby top-break (one-handed) */
    "sirocco-long-rifle": "Long rifle",          /* long buffalo rifle, jezail (two-handed) */
    "pallbearer": "Sawed-off coach gun",         /* side-by-side sawed-off coach gun (two-handed) */
    "revenge-of-the-sea": "Harpoon gun"          /* whaling harpoon gun (two-handed) */
  };
  /* the pact's iron slug for shape/type only (never for its name or art) */
  function shapeSlug(c) { return isPact(c) ? pactSlug(c) : ""; }
  function isLongIron(c) { return !!LONG_IRON[shapeSlug(c)]; }
  /* The hidden-iron art for this viewer: the long-gun outline for a long iron not yet revealed, else "" (callers keep the
     generic tile; a revealed iron uses its own art). */
  function hiddenArt(c, opts) {
    if (!isPact(c) || slugFor(c, opts) || !isLongIron(c)) return "";
    return prefix() + HIDDEN_LONG;
  }
  function typeFor(c) { return IRON_TYPE[shapeSlug(c)] || ""; }
  /* "Borrowed Iron — Lever-action carbine" (just "Borrowed Iron" before a Pact name is picked) */
  function labelFor(c) { var t = typeFor(c); return t ? "Borrowed Iron — " + t : "Borrowed Iron"; }
  /* The paper-doll weapon slots this iron may ride in (L0201: weapon slots only). Long irons: Long gun.
     One-handed irons: Pistol R, then Pistol L. No Pact name yet: any gun slot. */
  function allowedSlots(c) {
    var s = shapeSlug(c);
    if (!s) return ["revolver_2", "revolver_1", "long_gun"];
    return LONG_IRON[s] ? ["long_gun"] : ["revolver_2", "revolver_1"];
  }

  /* 0.3.100 (Jessey 2026-10-21 12:06 PM: "Lass o lakes shows up with the hell maker pistol"): the Hell Maker is the
     Crossroads Note's iron only. Any Hell Maker art or name that ended up on a Borrowed Iron item (an older save, a
     hand-edited file, a DM-typed item) must never stand in for another pact's iron, and never leak the Crossroads reveal. */
  var STALE_IRON = /hell[\s_-]*maker|crossroads-note-hell/i;
  var IRON_IDS = { "borrowed-iron": 1, "borrowed-iron-crossroads-note-hell-maker": 1 };
  function isIronItem(it) { return !!it && !!(IRON_IDS[String(it.catalogId || "")] || IRON_IDS[String(it.id || "")]); }
  /* src unless it is fixed Hell Maker art ("" then; the caller falls back to the generic Borrowed Iron tile) */
  function safeIronArt(src) { return src && STALE_IRON.test(String(src)) ? "" : (src || ""); }
  /* On load: put a non-Crossroads Pact Seeker's Borrowed Iron item back to the plain item (its pact art comes from
     slugFor). Only Borrowed Iron items are touched; counts, attunement and everything else on the row stay. Idempotent.
     Returns how many fields changed. */
  function fixStaleIron(c, opts) {
    if (!isPact(c) || pactSlug(c) === "hell-maker" || !Array.isArray(c.items)) return 0;
    var n = 0;
    if (opts && opts.dry) {
      c.items.forEach(function (it) {
        if (!isIronItem(it)) return;
        if (it.catalogId !== "borrowed-iron") n++;
        ["id", "name", "art", "img", "weaponId"].forEach(function (k) { if (it[k] && STALE_IRON.test(String(it[k]))) n++; });
      });
      return n;
    }
    c.items.forEach(function (it) {
      if (!isIronItem(it)) return;
      if (it.catalogId !== "borrowed-iron") { it.catalogId = "borrowed-iron"; n++; }
      if (it.id && it.id !== "borrowed-iron" && STALE_IRON.test(String(it.id))) { it.id = "borrowed-iron"; n++; }
      if (it.name && STALE_IRON.test(String(it.name))) { it.name = "Borrowed Iron"; n++; }
      ["art", "img", "weaponId"].forEach(function (k) { if (it[k] && STALE_IRON.test(String(it[k]))) { delete it[k]; n++; } });
    });
    return n;
  }

  root.SSDNSIronArt = {
    patronSlug: patronSlug, pactName: pactName, patronTile: patronTile, patronFallback: patronFallback, markMissing: markMissing, isLongIron: isLongIron,
    PACT_SLUG: PACT_SLUG, IRON_NAME: IRON_NAME, GENERIC_TILE: GENERIC_TILE, HIDDEN_LONG: HIDDEN_LONG, hiddenArt: hiddenArt,
    pactSlug: pactSlug, revealed: revealed, slugFor: slugFor, nameFor: nameFor,
    tileSrc: tileSrc, engravingSrc: engravingSrc, weaponTile: weaponTile, itemTile: itemTile,
    IRON_TYPE: IRON_TYPE, typeFor: typeFor, labelFor: labelFor, allowedSlots: allowedSlots,
    isIronItem: isIronItem, safeIronArt: safeIronArt, fixStaleIron: fixStaleIron,
    slugs: function () { return Object.keys(IRON_NAME); }
  };
})(typeof window !== "undefined" ? window : globalThis);

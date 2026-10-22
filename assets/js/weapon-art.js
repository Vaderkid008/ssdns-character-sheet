/* Gear-tab weapon art. Filenames are the slugs in the weapon art list.
 * Transparent 3:1 side views. Unmapped and custom weapons keep the Photo placeholder.
 */
(function (root) {
  "use strict";

  var NAMES = [
    ["Herringer Light Pocket Pistol", "herringer-light-pocket-pistol"],
    ["Herringer Light Double Derringer", "herringer-light-double-derringer"],
    ["Herringer Light Pepperbox", "herringer-light-pepperbox"],
    ["Navy / Army Ball n Cap Revolver", "navy-army-ball-n-cap-revolver"],
    ["Dullards Plinker Revolver", "dullards-plinker-revolver"],
    ["Dullards Plinker Repeater", "dullards-plinker-repeater"],
    ["Pony Arms ChaosMaker (Light)", "pony-arms-chaosmaker-light"],
    ["Pony Arms ChaosMaker (Medium)", "pony-arms-chaosmaker-medium"],
    ["Pony Arms ChaosMaker (Heavy)", "pony-arms-chaosmaker-heavy"],
    ["Single-Barrel Farm Shotgun", "single-barrel-farm-shotgun"],
    ["Double-Barrel Coach Gun", "double-barrel-coach-gun"],
    ["Lancaster Lever Shotgun", "lancaster-lever-shotgun"],
    ["Lancaster Heavy Saddle Carbine", "lancaster-heavy-saddle-carbine"],
    ["Henrietta Saddle Carbine", "henrietta-saddle-carbine"],
    ["Dullards Light Carbine", "dullards-light-carbine"],
    ["Dulls Rolling-Block Rifle", "dulls-rolling-block-rifle"],
    ["Dullards Tube Rifle", "dullards-tube-rifle"],
    ["Henrietta Repeating Rifle", "henrietta-repeating-rifle"],
    ["Lancaster Repeating Rifle", "lancaster-repeating-rifle"],
    ["Dull Co. Rifle-Musket", "dull-co-rifle-musket"],
    ["Bison Big Fifty Buffalo Rifle", "bison-big-fifty-buffalo-rifle"],
    ["Blacksnake", "blacksnake"],
    ["Hognose", "hognose"],
    ["Baton / belaying pin (club)", "baton-belaying-pin-club"],
    ["Baseball bat", "baseball-bat"],
    ["Brush hook (sickle)", "brush-hook-sickle"],
    ["Claim hammer (light hammer)", "claim-hammer-light-hammer"],
    ["Fence post / mining timber (greatclub)", "fence-post-mining-timber-greatclub"],
    ["Hatchet (handaxe)", "hatchet-handaxe"],
    ["Stiletto (dagger)", "stiletto-dagger"],
    ["Throwing spear (javelin)", "throwing-spear-javelin"],
    ["Trail mace / chapel mace (mace)", "trail-mace-chapel-mace-mace"],
    ["Trail spear (spear)", "trail-spear-spear"],
    ["Trail staff / cowhand's staff (quarterstaff)", "trail-staff-drovers-staff-quarterstaff"],
    /* L0185: pre-rename name, so older custom rows still find the art. */
    ["Trail staff / drover's staff (quarterstaff)", "trail-staff-drovers-staff-quarterstaff"],
    ["Shortbow", "shortbow"],
    ["Sling", "sling"],
    ["Throwing knife (dart)", "throwing-knife-dart"],
    ["Boarding hook / poleaxe (halberd)", "boarding-hook-poleaxe-halberd"],
    ["Bowie (shortsword)", "bowie-shortsword"],
    ["Branding fork (trident) — rare", "branding-fork-trident-rare"],
    ["Buffalo axe (greataxe)", "buffalo-axe-greataxe"],
    ["Bullwhip (whip)", "bullwhip-whip"],
    ["Cavalry lance (lance)", "cavalry-lance-lance"],
    ["Cavalry Saber (longsword)", "cavalry-saber-longsword"],
    ["Chain flail / weighted rein (flail)", "chain-flail-weighted-rein-flail"],
    ["Cutlass", "cutlass"],
    ["Heavy sledge (maul)", "heavy-sledge-maul"],
    ["Machete (scimitar)", "machete-scimitar"],
    ["Miner's pick (war pick)", "miners-pick-war-pick"],
    ["Pike", "pike"],
    ["Pole iron (glaive)", "pole-iron-glaive"],
    ["Sledgehammer (warhammer)", "sledgehammer-warhammer"],
    ["Spiked maul (morningstar)", "spiked-maul-morningstar"],
    ["Sword Cane (rapier)", "sword-cane-rapier"],
    ["Tomahawk (battleaxe)", "tomahawk-battleaxe"],
    ["Blowpipe (blowgun)", "blowpipe-blowgun"],
    ["Catch net (net)", "catch-net-net"],
    ["Longbow", "longbow"],
    ["Dynamite stick (standard fuse)", "dynamite-stick-standard-fuse"],
    ["Dynamite stick, sweating", "dynamite-stick-sweating"],
    ["Blasting keg", "blasting-keg"],
    ["TEST Jammer", "test-jammer"]
  ];

  /* Catalog ids that don't equal the art filename. */
  var ID_ALIAS = {
    "trail-staff-drover-s-staff-quarterstaff": "trail-staff-drovers-staff-quarterstaff",
    "miner-s-pick-war-pick": "miners-pick-war-pick",
    "dynamite-stick-sweating-sold-cheap": "dynamite-stick-sweating"
  };

  var bySlug = {};
  var byName = {};
  NAMES.forEach(function (row) {
    bySlug[row[1]] = true;
    byName[normName(row[0])] = row[1];
  });
  byName[normName("Dynamite stick, sweating (sold cheap)")] = "dynamite-stick-sweating";

  /* DM-only art. Kept out of NAMES so slugs() stays the player weapon list. */
  var DM_ID = {
    "the-peace-maker": "the-peace-maker",
    "peace-maker": "the-peace-maker",
    "hell-maker": "hell-maker",
    "borrowed-iron-crossroads-note-hell-maker": "hell-maker"
  };
  var DM_NAME = {
    "the peace maker": "the-peace-maker",
    "peace maker": "the-peace-maker",
    "hell maker": "hell-maker"
  };

  function normName(s) {
    return String(s || "")
      .toLowerCase()
      .replace(/['’]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function slugFor(weapon) {
    if (!weapon) return "";
    var id = typeof weapon === "string" ? weapon : (weapon.id || "");
    var name = typeof weapon === "string" ? "" : (weapon.name || "");
    if (id && bySlug[id]) return id;
    if (id && ID_ALIAS[id]) return ID_ALIAS[id];
    if (id && DM_ID[id]) return DM_ID[id];
    var R = relicArt();
    if (id && R && R.relicSlug(id)) return R.relicSlug(id);
    var key = normName(name);
    if (key && DM_NAME[key]) return DM_NAME[key];
    return (key && byName[key]) || "";
  }

  /* 0.3.99: relic Caster Guns (DM Guide only) live in SSDNSItemArt's relic map; their engravings sit under
     assets/img/dm-only/weapons/caster/. Not in NAMES, so slugs() stays the player weapon list. */
  function relicArt() { return root.SSDNSItemArt && root.SSDNSItemArt.relicSlug ? root.SSDNSItemArt : null; }

  function isDmOnly(slug) {
    return slug === "the-peace-maker" || slug === "hell-maker";
  }

  function pagePrefix() {
    try {
      var path = (root.location && root.location.pathname) || "";
      if (path.indexOf("/dm/") >= 0) return "../";
    } catch (e) {}
    return "";
  }

  function srcFor(weapon, opts) {
    var slug = slugFor(weapon);
    if (!slug) return "";
    var R = relicArt();
    if (R && R.relicSlug(slug) === slug) return R.relicEngraving(slug);
    if (isDmOnly(slug)) {
      if (!opts || !opts.dm) return "";
      return pagePrefix() + "assets/img/dm-only/" + slug + ".webp";
    }
    return "assets/img/weapons/" + slug + ".webp";
  }

  function clearPhoto(box) {
    if (!box.classList.contains("has-art") && !box.querySelector("img") && box.textContent === "Photo") {
      box.removeAttribute("data-art");
      return;
    }
    var failed = box.getAttribute("data-art-failed");
    box.classList.remove("has-art");
    box.removeAttribute("data-art");
    box.title = "Weapon photo later";
    box.textContent = "Photo";
    if (failed) box.setAttribute("data-art-failed", failed);
  }

  function paint(box, weapon, opts) {
    if (!box) return "";
    var slug = slugFor(weapon);
    var src = srcFor(weapon, opts);
    if (!slug || !src) {
      box.removeAttribute("data-art-failed");
      clearPhoto(box);
      return "";
    }
    if (box.getAttribute("data-art-failed") === slug) {
      clearPhoto(box);
      box.setAttribute("data-art-failed", slug);
      return "";
    }
    if (box.getAttribute("data-art-failed") && box.getAttribute("data-art-failed") !== slug) {
      box.removeAttribute("data-art-failed");
    }
    if (box.getAttribute("data-art") === slug && box.classList.contains("has-art") && box.querySelector("img")) return slug;
    var alt = (weapon && weapon.name) || slug;
    box.classList.add("has-art");
    box.title = alt;
    box.setAttribute("data-art", slug);
    box.textContent = "";
    var img = document.createElement("img");
    img.alt = alt;
    img.setAttribute("loading", "lazy");
    img.setAttribute("decoding", "async");
    img.loading = "lazy";
    img.decoding = "async";
    img.setAttribute("data-slug", slug);
    img.addEventListener("error", function () {
      /* 0.3.54: one retry with a cache-buster before we give up for the session. */
      if (!img.getAttribute("data-retried")) {
        img.setAttribute("data-retried", "1");
        img.src = src + (src.indexOf("?") >= 0 ? "&" : "?") + "r=" + Date.now().toString(36);
        return;
      }
      box.setAttribute("data-art-failed", slug);
      clearPhoto(box);
      box.setAttribute("data-art-failed", slug);
    });
    box.appendChild(img);
    img.src = src;
    return slug;
  }

  /* 0.3.102 (art batch 1, Jessey approved 2026-10-21 6:40 PM CT, Art Bot): a 256x256 colour square tile for every player
     weapon, at assets/img/items/weapons/<slug>.webp. Item slots only: paper-doll weapon slots, item rows, list squares.
     The Weapons tab, gun cards and the Equipment list's Weapons rows keep the 1200x400 b/w engraving (srcFor).
     Blacksnake / Hognose keep their own tiles (items/caster/, iron-art.js WEAPON_TILE). The test gun has none.
     The Peace Maker's tile is DM-only (assets/img/dm-only/items/the-peace-maker.webp) and is never returned on a player
     page, the same as its engraving. */
  var NO_TILE = { "test-jammer": 1, blacksnake: 1, hognose: 1 };
  /* catalog ids that share another weapon's tile (the audit: bundles reuse the standard-fuse art) */
  var TILE_ALIAS = { "dynamite-bundle-2": "dynamite-stick-standard-fuse", "dynamite-bundle-3": "dynamite-stick-standard-fuse", "dynamite-bundle-4": "dynamite-stick-standard-fuse" };
  function tileSlug(weapon) {
    var id = typeof weapon === "string" ? weapon : String((weapon && (weapon.weaponId || weapon.catalogId || weapon.id)) || "");
    if (TILE_ALIAS[id]) return TILE_ALIAS[id];
    var slug = slugFor(typeof weapon === "string" ? weapon : { id: id, name: weapon && weapon.name });
    if (!slug && weapon && typeof weapon === "object" && weapon.id && weapon.id !== id) slug = slugFor(weapon);
    return slug && !NO_TILE[slug] && (bySlug[slug] || slug === "the-peace-maker") ? slug : "";
  }
  function onDmPage() { return pagePrefix() === "../"; }
  function tileFor(weapon, opts) {
    var slug = tileSlug(weapon);
    if (!slug) return "";
    if (slug === "the-peace-maker") return (opts && opts.dm) || onDmPage() ? pagePrefix() + "assets/img/dm-only/items/the-peace-maker.webp" : "";
    return pagePrefix() + "assets/img/items/weapons/" + slug + ".webp";
  }
  /* "assets/img/weapons/<slug>.webp" (an engraving path on an item row, e.g. an explosive's catalog art) -> its tile, or "" */
  function tileForEngraving(src) {
    var m = /(?:^|\/)assets\/img\/weapons\/([a-z0-9-]+)\.webp(?:[?#].*)?$/.exec(String(src || ""));
    return m && bySlug[m[1]] && !NO_TILE[m[1]] ? pagePrefix() + "assets/img/items/weapons/" + m[1] + ".webp" : "";
  }

  root.SSDNSWeaponArt = {
    slugFor: slugFor,
    srcFor: srcFor,
    tileFor: tileFor,
    tileSlug: tileSlug,
    tileForEngraving: tileForEngraving,
    tileSlugs: function () { return NAMES.map(function (row) { return row[1]; }).filter(function (s, i, a) { return !NO_TILE[s] && a.indexOf(s) === i; }); },
    paint: paint,
    slugs: function () { return NAMES.map(function (row) { return row[1]; }); }
  };
})(typeof window !== "undefined" ? window : globalThis);

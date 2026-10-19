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
    var key = normName(name);
    if (key && DM_NAME[key]) return DM_NAME[key];
    return (key && byName[key]) || "";
  }

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

  root.SSDNSWeaponArt = {
    slugFor: slugFor,
    srcFor: srcFor,
    paint: paint,
    slugs: function () { return NAMES.map(function (row) { return row[1]; }); }
  };
})(typeof window !== "undefined" ? window : globalThis);

/**
 * Starting kits. L0156 (2026-10-17): one weapon per kit, 20 rounds or 10 shells,
 * no fancy guns. A gun Calling may swap that weapon for one Plinker
 * (Revolver or Repeater). The Dullards Light Carbine stays Scout-only.
 * Or-lines are player choices. Loaded before sheet-playtest.js.
 */
(function (root) {
  "use strict";

  function ensureList(c, key, n) {
    c[key] = Array.isArray(c[key]) ? c[key] : [];
    while (c[key].length < n) c[key].push({ weapon: "", proficient: true });
    return c[key];
  }
  function hasWeapon(c, id) {
    return ensureList(c, "guns", 4).concat(ensureList(c, "melee", 4)).some(function (g) {
      return g && g.weapon === id;
    });
  }
  function emptyGun() {
    return { weapon: "", proficient: true, chambers: [], loaded: 0, chamberSet: false };
  }
  function putGun(c, id, allowDup) {
    if (!id) return null;
    if (!allowDup && hasWeapon(c, id)) {
      return (c.guns || []).filter(function (g) { return g && g.weapon === id; })[0] || null;
    }
    var guns = ensureList(c, "guns", 4);
    var slot = guns.filter(function (g) { return g && !g.weapon; })[0];
    if (!slot) {
      slot = emptyGun();
      guns.push(slot);
    }
    slot.weapon = id;
    slot.proficient = kitProficient(id);
    if (!slot.chambers) slot.chambers = [];
    slot.equipped = false;
    if (root.SSDNSEquip && root.SSDNSEquip.tryAutoEquip) root.SSDNSEquip.tryAutoEquip(c, { kind: "gun", index: guns.indexOf(slot) });
    else slot.equipped = true;
    return slot;
  }
  function putMelee(c, id, allowDup) {
    if (!id) return null;
    if (!allowDup && hasWeapon(c, id)) {
      return (c.melee || []).filter(function (g) { return g && g.weapon === id; })[0] || null;
    }
    var melee = ensureList(c, "melee", 4);
    var slot = melee.filter(function (g) { return g && !g.weapon; })[0];
    if (!slot) {
      slot = { weapon: "", proficient: true };
      melee.push(slot);
    }
    slot.weapon = id;
    slot.proficient = kitProficient(id);
    slot.equipped = false;
    if (root.SSDNSEquip && root.SSDNSEquip.tryAutoEquip) root.SSDNSEquip.tryAutoEquip(c, { kind: "melee", index: melee.indexOf(slot) });
    else slot.equipped = true;
    return slot;
  }
  function chamberGun(slot, chamber, extra) {
    if (!slot) return;
    if (chamber) {
      slot.chamber = chamber;
      slot.tier = String(chamber).split("|")[0];
      slot.chamberSet = true;
    }
    if (extra) Object.keys(extra).forEach(function (k) { slot[k] = extra[k]; });
  }
  /* Equipment build (0.3.94, Jessey 2026-10-20): re-applying a kit (the "Apply starting kit" button, or a second
     apply on a sheet whose kitStamp already matches) never adds countable things again: no ammo, no items, no
     note lines. Weapons were already guarded (putGun / putMelee skip a weapon that is there). */
  var quiet = false;
  var preview = false;
  /* What kits already gave this sheet (0.3.94): character.kitGrants.ammo {"type|caliber": n} and .items [catalog ids].
     A kit applied again never gives the same ammo / item twice, but a new pick (another gun) still gets its own. */
  function grants(c) {
    var g = c.kitGrants && typeof c.kitGrants === "object" ? c.kitGrants : (c.kitGrants = {});
    if (!g.ammo || typeof g.ammo !== "object") g.ammo = {};
    if (!Array.isArray(g.items)) g.items = [];
    return g;
  }
  function addAmmo(c, type, caliber, count) {
    if (quiet) return;
    var key = String(type || "") + "|" + String(caliber || "").toLowerCase();
    if (!preview) {
      var g = grants(c);
      if (g.ammo[key]) return;
      g.ammo[key] = count;
    }
    c.ammo = c.ammo || [];
    var pool = null;
    c.ammo.forEach(function (a) {
      if (!pool && a.type === type && String(a.caliber || "").toLowerCase() === String(caliber || "").toLowerCase()) pool = a;
    });
    if (!pool) {
      pool = { type: type, caliber: caliber || "", count: 0 };
      c.ammo.push(pool);
    }
    pool.count = (parseInt(pool.count, 10) || 0) + count;
  }
  /* Equipment build (0.3.94): what each kit gear line becomes.
       items:   real catalog items (Jessey 5:09 PM: Badge = Holy symbol, walking stick / pouches = Druidic focus,
                Prism = Arcane focus, Galvanic reagents = Hex pouch)
       rig:     a holster / belt slot (rules.js holsters; weighs in through the rig slot, shows as a Worn row)
       covered: already on the sheet as a pool / armor / shield / tracker, so the note line was a duplicate
       instrument: covered by the Calling instrument tracker when character.instrument is that instrument
     Lines not in this table (or with no catalog row loaded) stay Equipment note lines. */
  var HOLY = "badge-saint-medal-carved-eldorite-hymn-book-holy-symbol";
  var DRUID = "antler-eldorite-nodule-beast-charm-druidic-focus";
  var ARCANE = "eldorite-charm-bone-fetish-quill-case-lens-arcane-focus";
  var STRINGS = "plain-strings-set";
  var KIT_LINES = {
    "Holy symbol (focus)": { items: [HOLY] },
    "Badge (tin star, focus)": { items: [HOLY] },
    "Focus: Carved walking stick": { items: [DRUID] },
    "Focus: Medicine pouch": { items: [DRUID] },
    "Focus: Pouch of home-spring soil": { items: [DRUID] },
    "Prism (focus)": { items: [ARCANE] },
    "Galvanic reagents (component pouch)": { items: ["hex-pouch-dust-pouch"] },
    "Harmonica (kit instrument)": { items: ["harmonica-cheap"] },
    "Harmonica (rides in a pocket)": { items: ["harmonica-cheap"], instrument: "harmonica" },
    "Harmonica (cheap, pocket)": { items: ["harmonica-cheap"], instrument: "harmonica" },
    "Fiddle with a strap and one spare set of strings": { items: ["violin-strap", STRINGS] },
    "Banjo with a strap and one spare set of strings": { items: ["standard-strap-guitar-banjo", STRINGS] },
    "Guitar with a strap and one spare set of strings": { items: ["standard-strap-guitar-banjo", STRINGS] },
    "Accordion with a strap and one spare set of strings": { items: ["standard-strap-guitar-banjo"] },
    "Gun belt": { rig: "belt", id: "gun-belt-cartridge-loops" },
    "Mexican Loop holster": { rig: "holster", id: "mexican-loop" },
    "Mexican Loop holster (empty)": { rig: "holster", id: "mexican-loop" },
    "Shield": { covered: "shield" },
    "Wooden shield": { covered: "shield" },
    "Mail Duster (chain mail)": { covered: "armor", id: "mail-duster" },
    "Arrows ×20": { covered: "ammo" },
    "Powder, ball, and caps ×20": { covered: "ammo" },
    "Light cartridges ×20 (plain rounds, not in the cylinder)": { covered: "ammo" },
    /* L0197 (Jessey 2026-10-20 7:10 PM): the Pact Seeker's Borrowed Iron is a real, soul-bound catalog item */
    "Borrowed Iron (pact focus)": { items: ["borrowed-iron"] }
  };
  /* Lines added to KIT_LINES after a sheet already ran the 0.3.94 step (equipMigrated 1). Only these are converted
     the second time, so nothing else in the notes moves. */
  var MIGRATE_V2 = ["Borrowed Iron (pact focus)"];
  function lineSpec(text) {
    if (Object.prototype.hasOwnProperty.call(KIT_LINES, text)) return KIT_LINES[text];
    var map = root.SSDNS_KIT_LINE_ITEMS;
    if (map && Object.prototype.hasOwnProperty.call(map, text)) return { items: [map[text]] };
    return null;
  }
  function itemsApi() {
    var I = root.SSDNSItems;
    return I && I.add && I.byId ? I : null;
  }
  function hasItem(c, id) {
    return (Array.isArray(c.items) ? c.items : []).some(function (it) { return it && it.catalogId === id && Number(it.count == null ? 1 : it.count) > 0; });
  }
  /* true = the line is handled (landed as items / rig, or covered); false = keep it as a note line */
  function landLine(c, text, opts) {
    opts = opts || {};
    var spec = lineSpec(text);
    if (!spec) return false;
    if (spec.covered === "shield") return !!c.shield;
    if (spec.covered === "armor") return !!c.armor && (!spec.id || c.armor === spec.id);
    if (spec.covered === "ammo") return true;
    if (spec.rig) {
      if (spec.rig === "belt") {
        if (!c.belt) c.belt = spec.id;
        if (c.belt !== spec.id) return false;
        c.gunBelt = true;
        return true;
      }
      if (c.holster === spec.id || c.holsterR === spec.id) return true;
      if (!c.holster) { c.holster = spec.id; return true; }
      return false;
    }
    if (spec.instrument && c.instrument === spec.instrument) return true;
    var I = itemsApi();
    if (!I || !spec.items || !spec.items.every(function (id) { return !!I.byId(id); })) return false;
    /* never twice: an old saved line for the same gear stays the record (it is not turned into a second copy) */
    if (!opts.migrate && String(c.equipment || "").indexOf(text) >= 0) return true;
    var g = preview ? { items: [] } : grants(c);
    spec.items.forEach(function (id) {
      if (hasItem(c, id) || g.items.indexOf(id) >= 0) return;
      var res = I.add(c, { catalogId: id, count: 1 }, { dm: true });
      if (!res || !res.ok) return;
      g.items.push(id);
      /* a pack opens straight away: its real items become rows and the pack row goes (its leftovers go to Notes) */
      if (res.item && !preview && !opts.migrate && I.unpack && I.packContents && I.packContents(res.item)) I.unpack(c, res.item.uid, { dm: true });
    });
    return true;
  }
  function addLine(c, text) {
    if (!text || quiet) return;
    if (landLine(c, text)) return;
    var cur = c.equipment || "";
    if (cur.indexOf(text) >= 0) return;
    c.equipment = (cur ? cur.replace(/\s+$/, "") + "\n" : "") + "• " + text;
  }
  /* Saved characters (0.3.94): kit lines already sitting in the Equipment notes become the same items / rigs, and
     the duplicate ammo / armor / shield lines go. Packs are left alone (they keep their Unpack button). The old notes
     text is kept in character.equipmentBefore0392, so nothing is lost. Runs once (character.equipMigrated). */
  /* L0197 (0.3.94): equipMigrated 2. A sheet already at 1 converts only the MIGRATE_V2 lines (the exact
     "Borrowed Iron (pact focus)" line PR #113 left in Notes); every other note line stays as it is. Its notes before
     this step are kept in character.equipmentBefore0394. A Pact Seeker with no line still gets the soul-bound item. */
  function migrateEquipment(c) {
    if (!c || c.equipMigrated >= 2) return 0;
    if (!itemsApi()) return 0;
    var only = c.equipMigrated >= 1 ? MIGRATE_V2 : null;
    var text = String(c.equipment || "");
    var moved = 0;
    var keep = text.split("\n").filter(function (raw) {
      var line = raw.replace(/^\s*•\s*/, "").trim();
      if (!line || !Object.prototype.hasOwnProperty.call(KIT_LINES, line)) return true;
      if (only && only.indexOf(line) < 0) return true;
      if (landLine(c, line, { migrate: true })) { moved++; return false; }
      return true;
    });
    if (moved) {
      if (only) { if (c.equipmentBefore0394 == null) c.equipmentBefore0394 = text; }
      else if (c.equipmentBefore0392 == null) c.equipmentBefore0392 = text;
      c.equipment = keep.join("\n");
    }
    ensureBorrowedIron(c);
    c.equipMigrated = 2;
    return moved;
  }
  /* L0197: every Pact Seeker owns exactly one Borrowed Iron item (soul-bound, 0 lb). Adds it when missing; never removes. */
  function ensureBorrowedIron(c) {
    if (!c || c.calling !== "pact-seeker" || preview) return false;
    var I = itemsApi();
    if (!I || !I.byId("borrowed-iron") || hasItem(c, "borrowed-iron")) return false;
    var res = I.add(c, { catalogId: "borrowed-iron", count: 1 }, { dm: true });
    if (res && res.ok && !preview) { var g = grants(c); if (g.items.indexOf("borrowed-iron") < 0) g.items.push("borrowed-iron"); }
    return !!(res && res.ok);
  }
  function packLine(id) {
    return {
      trail: "Trail kit",
      claim: "Claim pack",
      circuit: "Preacher's kit",
      trunk: "Traveling trunk",
      saloon: "Saloon kit",
      book: "Book trunk",
      alley: "Alley kit"
    }[id] || "Trail kit";
  }
  function lightGun(c, id, chamber) {
    var slot = putGun(c, id);
    chamberGun(slot, chamber || "light|.44 rimfire");
    addAmmo(c, "cartridge", "Light", 20);
  }
  function ballCap(c) {
    var slot = putGun(c, "navy-army-ball-n-cap-revolver");
    chamberGun(slot, "medium|");
    addAmmo(c, "percussion", "", 20);
    addLine(c, "Powder, ball, and caps ×20");
  }
  function derringer(c) {
    var slot = putGun(c, "herringer-light-double-derringer");
    chamberGun(slot, "light|.32 Long");
    addAmmo(c, "cartridge", "Light", 20);
  }
  var kitCalling = "";
  function rulesWeapon(id) {
    var rules = root.SSDNS_RULES || {};
    var lists = [].concat(rules.melee || [], rules.firearms || [], rules.casterGuns || [], rules.otherRanged || []);
    return lists.filter(function (w) { return w && w.id === id; })[0] || null;
  }
  function fiveEName(w) {
    var name = String(w && w.name || "");
    var m = name.match(/\(([^)]+)\)/);
    return (m ? m[1] : name).toLowerCase();
  }
  function kitProficient(id) {
    var w = rulesWeapon(id);
    var rules = root.SSDNS_RULES;
    if (!w || !rules || !kitCalling) return true;
    if (root.SSDNSApp && root.SSDNSApp.callingProficient) return !!root.SSDNSApp.callingProficient(w);
    var cal = (rules.callings || []).filter(function (c) { return c.id === kitCalling; })[0];
    if (!cal || !cal.weaponProf) return false;
    var prof = String(cal.weaponProf).toLowerCase();
    var name = String(w.name || "").toLowerCase();
    if (w.hexShells || w.group === "caster") return /caster guns?/.test(prof);
    if (/plinker/.test(name) && /plinker/.test(prof)) return true;
    if (/herringer/.test(name) && /herringer/.test(prof)) return true;
    if (/ball/.test(name) && /cap/.test(name) && /ball n cap/.test(prof)) return true;
    if (/cavalry saber/.test(name) && /cavalry saber/.test(prof)) return true;
    if (/bowie/.test(name) && /bowie/.test(prof)) return true;
    if ((/fencing|sword cane/.test(name) || /\brapier\b/.test(fiveEName(w))) && /fencing/.test(prof)) return true;
    var meleeOnly = /\bmelee\b/.test(prof);
    var both = /simple\s*(and|&)\s*martial/.test(prof);
    var simple = both || /\bsimple weapons\b/.test(prof);
    var cat = String(w.category || "").toLowerCase();
    var melee = String(w.group || "").indexOf("melee") >= 0 || !w.tiers;
    if (!(meleeOnly && !melee)) {
      if (cat === "simple" && simple) return true;
      if (cat === "martial" && both) return true;
    }
    var named = { dagger: "daggers?", quarterstaff: "quarterstaffs?", dart: "darts?", sling: "slings?", longsword: "longswords?", rapier: "rapiers?", shortsword: "shortswords?", scimitar: "scimitars?" };
    var en = fiveEName(w);
    var key;
    for (key in named) {
      if (!Object.prototype.hasOwnProperty.call(named, key)) continue;
      if (new RegExp("\\b" + key + "s?\\b").test(en) && new RegExp("\\b" + named[key] + "\\b").test(prof)) return true;
    }
    return false;
  }
  function plinker(c) {
    var slot = putGun(c, "dullards-plinker-revolver");
    chamberGun(slot, "light|.22 LR", { dirty: true });
    addAmmo(c, "cartridge", "Light", 20);
  }
  function plinkerRepeater(c) {
    var slot = putGun(c, "dullards-plinker-repeater");
    chamberGun(slot, "light|.22 LR");
    addAmmo(c, "cartridge", "Light", 20);
  }
  function farm410(c) {
    var shot = putGun(c, "single-barrel-farm-shotgun");
    chamberGun(shot, "light|.410");
    addAmmo(c, "buck", ".410", 10);
  }
  function pocketPistol(c) {
    var pocket = putGun(c, "herringer-light-pocket-pistol");
    chamberGun(pocket, "light|.32 Long");
    addAmmo(c, "cartridge", "Light", 20);
  }
  function pepperbox(c) {
    var pep = putGun(c, "herringer-light-pepperbox");
    chamberGun(pep, "light|.32 Long");
    addAmmo(c, "cartridge", "Light", 20);
  }
  function longbow(c) {
    putGun(c, "longbow");
    addAmmo(c, "arrows", "", 20);
    addLine(c, "Arrows ×20");
  }
  function shortbow(c) {
    putGun(c, "shortbow");
    addAmmo(c, "arrows", "", 20);
    addLine(c, "Arrows ×20");
  }
  function oneJavelin(c) {
    putMelee(c, "throwing-spear-javelin");
  }
  function staff(c) {
    putMelee(c, "trail-staff-drover-s-staff-quarterstaff");
  }
  function baton(c) {
    putMelee(c, "baton-belaying-pin-club");
  }
  var PLINKER_SWAP = [
    { id: "plinker", label: "Dullards Plinker Revolver, .22 LR + 20 Light cartridges" },
    { id: "repeater", label: "Dullards Plinker Repeater, .22 LR + 20 Light cartridges" }
  ];
  function withPlinker(options) {
    return options.concat(PLINKER_SWAP);
  }
  function instrumentLine(voice) {
    var names = { fiddle: "Fiddle", banjo: "Banjo", guitar: "Guitar", accordion: "Accordion", harmonica: "Harmonica" };
    if (voice === "voice") return "Voice — focus";
    if (voice === "harmonica") return "Harmonica (rides in a pocket)";
    return (names[voice] || "Fiddle") + " with a strap and one spare set of strings";
  }

  var CHOICES = {
    "tribal-warrior": [
      { id: "weapon", prompt: "One melee weapon, or javelins?", options: [
        { id: "staff", label: "Trail staff" },
        { id: "javelin", label: "Javelin" }
      ]}
    ],
    storyteller: [
      { id: "voice", prompt: "Calling instrument (voice can be the focus; you still carry one)", options: [
        { id: "fiddle", label: "Fiddle" },
        { id: "banjo", label: "Banjo" },
        { id: "guitar", label: "Guitar" },
        { id: "accordion", label: "Accordion" },
        { id: "harmonica", label: "Harmonica" },
        { id: "voice", label: "Voice (still carry a harmonica)" }
      ]},
      { id: "weapon", prompt: "Pepperbox, or shortbow?", options: withPlinker([
        { id: "pepper", label: "Herringer Light Pepperbox + 20 Light cartridges" },
        { id: "bow", label: "Shortbow + 20 arrows" }
      ])},
      { id: "kit", prompt: "Traveling trunk, or saloon kit?", options: [
        { id: "trunk", label: "Traveling trunk" },
        { id: "saloon", label: "Saloon kit" }
      ]}
    ],
    "frontier-preacher": [
      { id: "armor", prompt: "Scale coat, leather jacket, or mail duster?", options: [
        { id: "scale", label: "Scale coat" },
        { id: "leather", label: "Leather jacket" },
        { id: "mail", label: "Mail duster" }
      ]},
      { id: "gun", prompt: "Farm shotgun, or pepperbox?", options: withPlinker([
        { id: "shotgun", label: "Single-Barrel Farm Shotgun, .410 + 10 shells" },
        { id: "pepper", label: "Herringer Light Pepperbox + 20 Light cartridges" }
      ])},
      { id: "pack", prompt: "Preacher's kit, or trail kit?", options: [
        { id: "circuit", label: "Preacher's kit" },
        { id: "trail", label: "Trail kit" }
      ]}
    ],
    "nature-guide": [
      { id: "weapon", prompt: "Javelins, or a shortbow?", options: [
        { id: "javelin", label: "Javelin" },
        { id: "bow", label: "Shortbow + 20 arrows" }
      ]},
      { id: "shield", prompt: "Wooden shield?", options: [
        { id: "yes", label: "Wooden shield" },
        { id: "no", label: "No shield" }
      ]},
      { id: "focus", prompt: "Focus taken from the land?", options: [
        { id: "stick", label: "Carved walking stick" },
        { id: "pouch", label: "Medicine pouch" },
        { id: "soil", label: "Pouch of home-spring soil" }
      ]}
    ],
    gunslinger: [
      { id: "weapon", prompt: "Tube rifle, or Ball n Cap?", options: withPlinker([
        { id: "tube", label: "Dullards Tube Rifle, Light + 20 Light cartridges" },
        { id: "revolver", label: "Navy / Army Ball n Cap + 20 loads" }
      ])},
      { id: "armor", prompt: "Mail duster, or leather jacket?", options: [
        { id: "mail", label: "Mail duster" },
        { id: "leather", label: "Leather jacket" }
      ]},
      { id: "pack", prompt: "Claim pack, or trail kit?", options: [
        { id: "claim", label: "Claim pack" },
        { id: "trail", label: "Trail kit" }
      ]}
    ],
    "martial-artist": [
      { id: "weapon", prompt: "Trail staff, or a hand weapon?", options: [
        { id: "staff", label: "Trail staff" },
        { id: "baton", label: "Baton (hand weapon)" }
      ]},
      { id: "pack", prompt: "Claim pack, or trail kit?", options: [
        { id: "claim", label: "Claim pack" },
        { id: "trail", label: "Trail kit" }
      ]}
    ],
    lawman: [
      { id: "weapon", prompt: "Ball n Cap, or a .410 farm shotgun?", options: withPlinker([
        { id: "revolver", label: "Navy / Army Ball n Cap + 20 loads" },
        { id: "shotgun", label: "Single-Barrel Farm Shotgun, .410 + 10 shells" }
      ])},
      { id: "pack", prompt: "Preacher's kit, or trail kit?", options: [
        { id: "circuit", label: "Preacher's kit" },
        { id: "trail", label: "Trail kit" }
      ]}
    ],
    "frontier-scout": [
      { id: "hunt", prompt: "Carbine, tube rifle, or longbow?", options: withPlinker([
        { id: "carbine", label: "Dullards Light Carbine + 20 Light cartridges" },
        { id: "rifle", label: "Dullards Tube Rifle, Light + 20 Light cartridges" },
        { id: "bow", label: "Longbow + 20 arrows" }
      ])},
      { id: "armor", prompt: "Scale coat, or leather jacket?", options: [
        { id: "scale", label: "Scale coat" },
        { id: "leather", label: "Leather jacket" }
      ]},
      { id: "pack", prompt: "Trail kit, or claim pack?", options: [
        { id: "trail", label: "Trail kit" },
        { id: "claim", label: "Claim pack" }
      ]}
    ],
    gambler: [
      { id: "ranged", prompt: "Pocket pistol, or pepperbox?", options: withPlinker([
        { id: "pistol", label: "Herringer Light Pocket Pistol + 20 Light cartridges" },
        { id: "pepper", label: "Herringer Light Pepperbox + 20 Light cartridges" }
      ])},
      { id: "pack", prompt: "Alley kit, claim pack, or trail kit?", options: [
        { id: "alley", label: "Alley kit" },
        { id: "claim", label: "Claim pack" },
        { id: "trail", label: "Trail kit" }
      ]}
    ],
    hexslinger: [
      { id: "gun", prompt: "Blacksnake, or Hognose?", options: withPlinker([
        { id: "blacksnake", label: "Blacksnake caster gun" },
        { id: "hognose", label: "Hognose caster gun" }
      ])},
      { id: "pack", prompt: "Trail kit, or claim pack?", options: [
        { id: "trail", label: "Trail kit" },
        { id: "claim", label: "Claim pack" }
      ]}
    ],
    "pact-seeker": [
      { id: "pack", prompt: "Book trunk, or claim pack?", options: [
        { id: "book", label: "Book trunk" },
        { id: "claim", label: "Claim pack" }
      ]}
    ],
    scholar: [
      { id: "weapon", prompt: "Plinker, or pocket pistol?", options: [
        { id: "plinker", label: "Dullards Plinker Revolver + 20 Light cartridges" },
        { id: "repeater", label: "Dullards Plinker Repeater + 20 Light cartridges" },
        { id: "pocket", label: "Herringer Light Pocket Pistol + 20 Light cartridges" }
      ]},
      { id: "pack", prompt: "Book trunk, or trail kit?", options: [
        { id: "book", label: "Book trunk" },
        { id: "trail", label: "Trail kit" }
      ]}
    ]
  };

  function blankCharacter() {
    return {
      guns: [0, 1, 2, 3].map(function () { return emptyGun(); }),
      melee: [0, 1, 2, 3].map(function () { return { weapon: "", proficient: false }; }),
      ammo: [],
      equipment: "",
      holster: "",
      holsterR: "",
      belt: "",
      gunBelt: false,
      shield: false,
      armor: "",
      casterGun: "",
      pactFocus: ""
    };
  }

  function oneWeapon(c, calling, p) {
    p = p || {};
    if (calling === "tribal-warrior") {
      if (p.weapon === "javelin") oneJavelin(c);
      else staff(c);
    } else if (calling === "storyteller") {
      if (p.weapon === "bow") shortbow(c);
      else if (p.weapon === "plinker") plinker(c);
      else if (p.weapon === "repeater") plinkerRepeater(c);
      else pepperbox(c);
    } else if (calling === "frontier-preacher") {
      if (p.gun === "pepper") pepperbox(c);
      else if (p.gun === "plinker") plinker(c);
      else if (p.gun === "repeater") plinkerRepeater(c);
      else farm410(c);
    } else if (calling === "nature-guide") {
      if (p.weapon === "bow") shortbow(c);
      else oneJavelin(c);
    } else if (calling === "gunslinger") {
      if (p.weapon === "revolver") ballCap(c);
      else if (p.weapon === "plinker") plinker(c);
      else if (p.weapon === "repeater") plinkerRepeater(c);
      else lightGun(c, "dullards-tube-rifle");
    } else if (calling === "martial-artist") {
      if (p.weapon === "baton") baton(c);
      else staff(c);
    } else if (calling === "lawman") {
      if (p.weapon === "shotgun") farm410(c);
      else if (p.weapon === "plinker") plinker(c);
      else if (p.weapon === "repeater") plinkerRepeater(c);
      else ballCap(c);
    } else if (calling === "frontier-scout") {
      if (p.hunt === "rifle") lightGun(c, "dullards-tube-rifle");
      else if (p.hunt === "bow") longbow(c);
      else if (p.hunt === "plinker") plinker(c);
      else if (p.hunt === "repeater") plinkerRepeater(c);
      else lightGun(c, "dullards-light-carbine");
    } else if (calling === "gambler") {
      if (p.ranged === "pepper") pepperbox(c);
      else if (p.ranged === "plinker") plinker(c);
      else if (p.ranged === "repeater") plinkerRepeater(c);
      else pocketPistol(c);
    } else if (calling === "hexslinger") {
      if (p.gun === "plinker") plinker(c);
      else if (p.gun === "repeater") plinkerRepeater(c);
      else {
        var hex = p.gun === "hognose" ? "hognose" : "blacksnake";
        putGun(c, hex);
        c.casterGun = hex;
      }
    } else if (calling === "pact-seeker") {
      c.casterGun = "borrowed-iron";
      c.pactFocus = "borrowed-iron";
      /* L0197: the Borrowed Iron is a real item too (the "Borrowed Iron (pact focus)" kit line lands it) */
    } else if (calling === "scholar") {
      if (p.weapon === "repeater") plinkerRepeater(c);
      else if (p.weapon === "pocket") pocketPistol(c);
      else plinker(c);
    }
  }

  /* The same kit again on a sheet from before 0.3.94 (no kitGrants record of what it got): weapons / armor fields only,
     nothing countable (no ammo, items or note lines), so nothing doubles. Newer sheets use the kitGrants record instead. */
  function legacyAgain(c, calling) {
    return !preview && !!calling && c.kitStamp === calling && !(c.kitGrants && c.kitGrants.v);
  }
  function moduleStart(c, calling, p) {
    p = p || {};
    kitCalling = calling || "";
    quiet = legacyAgain(c, calling);
    oneWeapon(c, calling, p);
    if (calling === "storyteller") {
      var voice = p.voice || "fiddle";
      c.instrument = voice === "voice" ? "voice" : (voice === "harmonica" ? "harmonica" : "voice");
      if (voice === "harmonica" || voice === "voice") {
        addLine(c, "Harmonica (cheap, pocket)");
        c.instrument = voice === "harmonica" ? "harmonica" : "voice";
        c.instrumentQuality = "cheap";
      } else {
        c.instrument = "voice";
        addLine(c, "Voice — focus");
      }
    } else if (calling === "frontier-preacher") {
      addLine(c, "Holy symbol (focus)");
    } else if (calling === "nature-guide") {
      var worn = { pouch: "Medicine pouch", soil: "Pouch of home-spring soil" };
      if (worn[p.focus]) addLine(c, "Focus: " + worn[p.focus]);
      else addLine(c, "Focus worn on a cord, if the DM agrees");
    } else if (calling === "gunslinger") {
      c.holster = "mexican-loop";
      c.gunBelt = true;
      addLine(c, "Gun belt");
      addLine(c, "Mexican Loop holster (empty)");
    } else if (calling === "martial-artist") {
      addLine(c, "Rough canvas shirt and heavy boots");
    } else if (calling === "lawman") {
      addLine(c, "Badge (tin star, focus)");
      c.badgeState = "dull";
    } else if (calling === "frontier-scout") {
      addLine(c, "Keepsake (focus)");
    } else if (calling === "gambler") {
      addLine(c, "Thieves' tools");
    } else if (calling === "pact-seeker") {
      addLine(c, "Borrowed Iron (pact focus)");
    } else if (calling === "scholar") {
      addLine(c, "Chemical Field Ledger (focus)");
    }
    if (p.bedtime) addLine(c, "Bedtime item: " + p.bedtime);
    if (CALLINGS.indexOf(calling) >= 0) c.kitStamp = calling;
    if (!preview) grants(c).v = 1;
    c.kitMode = "module";
    quiet = false;
    return c;
  }

  function apply(c, calling, p, opts) {
    p = p || {};
    opts = opts || {};
    kitCalling = calling || "";
    preview = !!opts.preview;
    if (opts.start === "module" || p._start === "module") { var mc = moduleStart(c, calling, p); preview = false; return mc; }
    quiet = legacyAgain(c, calling);
    oneWeapon(c, calling, p);
    if (calling === "tribal-warrior") {
      addLine(c, "Trail kit");
    } else if (calling === "storyteller") {
      var voice = p.voice || "fiddle";
      c.armor = "leather-jacket";
      c.instrument = voice; /* set first: a harmonica pick is the tracker instrument, not a second harmonica item */
      addLine(c, instrumentLine(voice));
      if (voice === "voice") addLine(c, "Harmonica (kit instrument)");
      addLine(c, p.kit === "saloon" ? "Saloon kit" : "Traveling trunk");
      if (voice !== "voice" && voice !== "harmonica") {
        if (!c.instrumentQuality) c.instrumentQuality = "cheap";
        if (!c.instrumentStrings) c.instrumentStrings = "plain";
      } else if (voice === "harmonica") {
        if (!c.instrumentQuality) c.instrumentQuality = "cheap";
      }
    } else if (calling === "frontier-preacher") {
      c.armor = p.armor === "leather" ? "leather-jacket" : (p.armor === "mail" ? "mail-duster" : "scale-coat");
      c.shield = true;
      addLine(c, "Shield");
      addLine(c, packLine(p.pack === "trail" ? "trail" : "circuit"));
      addLine(c, "Holy symbol (focus)");
    } else if (calling === "nature-guide") {
      if (p.shield !== "no") {
        c.shield = true;
        addLine(c, "Wooden shield");
      }
      c.armor = "leather-jacket";
      addLine(c, "Trail kit");
      addLine(c, "Herbalism kit");
      var focus = { stick: "Carved walking stick", pouch: "Medicine pouch", soil: "Pouch of home-spring soil" };
      addLine(c, "Focus: " + (focus[p.focus] || focus.stick));
    } else if (calling === "gunslinger") {
      c.holster = "mexican-loop";
      c.gunBelt = true;
      addLine(c, "Gun belt");
      addLine(c, "Mexican Loop holster");
      addLine(c, packLine(p.pack === "trail" ? "trail" : "claim"));
      c.armor = p.armor === "leather" ? "leather-jacket" : "mail-duster";
    } else if (calling === "martial-artist") {
      addLine(c, packLine(p.pack === "trail" ? "trail" : "claim"));
      addLine(c, "Rough canvas shirt and heavy boots");
    } else if (calling === "lawman") {
      c.shield = true;
      c.armor = "mail-duster";
      addLine(c, "Badge (tin star, focus)");
      addLine(c, "Mail Duster (chain mail)");
      addLine(c, packLine(p.pack === "trail" ? "trail" : "circuit"));
    } else if (calling === "frontier-scout") {
      c.armor = p.armor === "leather" ? "leather-jacket" : "scale-coat";
      c.gunBelt = true;
      addLine(c, "Gun belt");
      addLine(c, packLine(p.pack === "claim" ? "claim" : "trail"));
      addLine(c, "Keepsake (focus)");
    } else if (calling === "gambler") {
      c.armor = "leather-jacket";
      addLine(c, "Thieves' tools");
      addLine(c, packLine(p.pack === "claim" ? "claim" : (p.pack === "trail" ? "trail" : "alley")));
    } else if (calling === "hexslinger") {
      c.gunBelt = true;
      addLine(c, "Gun belt");
      if (p.gun !== "plinker" && p.gun !== "repeater") {
        addAmmo(c, "cartridge", "Light", 20);
        addLine(c, "Light cartridges ×20 (plain rounds, not in the cylinder)");
      }
      addLine(c, packLine(p.pack === "claim" ? "claim" : "trail"));
    } else if (calling === "pact-seeker") {
      addLine(c, "Borrowed Iron (pact focus)");
      c.armor = "leather-jacket";
      addLine(c, packLine(p.pack === "claim" ? "claim" : "book"));
    } else if (calling === "scholar") {
      addLine(c, "Chemical Field Ledger");
      addLine(c, "Prism (focus)");
      addLine(c, "Galvanic reagents (component pouch)");
      addLine(c, packLine(p.pack === "trail" ? "trail" : "book"));
      addLine(c, "Duster (traveler's clothes)");
    }
    if (CALLINGS.indexOf(calling) >= 0) c.kitStamp = calling;
    if (!preview) grants(c).v = 1;
    c.kitMode = "full";
    quiet = false;
    preview = false;
    return c;
  }

  var CALLINGS = [
    "tribal-warrior", "storyteller", "frontier-preacher", "nature-guide", "gunslinger",
    "martial-artist", "lawman", "frontier-scout", "gambler", "hexslinger", "pact-seeker", "scholar"
  ];

  function openChoices(calling, picked) {
    return (CHOICES[calling] || []).filter(function (ch) {
      if (picked && picked[ch.id] != null && picked[ch.id] !== "") return false;
      if (!ch.when) return !picked || !picked._locked;
      return ch.when(picked || {});
    });
  }
  function firstChoices(calling) {
    return (CHOICES[calling] || []).filter(function (ch) { return !ch.when; });
  }
  function branches(calling) {
    var choices = CHOICES[calling] || [];
    var out = [{}];
    choices.forEach(function (ch) {
      var next = [];
      out.forEach(function (p) {
        if (ch.when && !ch.when(p)) {
          next.push(p);
          return;
        }
        ch.options.forEach(function (op) {
          var copy = {};
          Object.keys(p).forEach(function (k) { copy[k] = p[k]; });
          copy[ch.id] = op.id;
          next.push(copy);
        });
      });
      out = next;
    });
    return out;
  }
  function weaponLabel(id) {
    var rules = root.SSDNS_RULES || {};
    var lists = [].concat(rules.melee || [], rules.firearms || [], rules.casterGuns || [], rules.otherRanged || []);
    var hit = lists.filter(function (w) { return w && w.id === id; })[0];
    return (hit && hit.name) || id;
  }
  function armorName(id) {
    var rules = root.SSDNS_RULES || {};
    var hit = (rules.armor || []).filter(function (a) { return a && a.id === id; })[0];
    if (hit && hit.name) return hit.name;
    return String(id || "").replace(/-/g, " ");
  }
  function describe(calling, picks, opts) {
    var c = apply(blankCharacter(), calling, picks || {}, Object.assign({}, opts || {}, { preview: true }));
    var lines = [];
    var worn = c.armor ? armorName(c.armor) : "";
    (c.melee || []).forEach(function (row) {
      if (row && row.weapon) lines.push(weaponLabel(row.weapon));
    });
    (c.guns || []).forEach(function (row) {
      if (row && row.weapon) lines.push(weaponLabel(row.weapon));
    });
    if (worn) lines.push("Armor: " + worn);
    if (c.shield) lines.push("Shield");
    (c.ammo || []).forEach(function (a) {
      if (!a || !a.count) return;
      lines.push(a.count + " " + a.type + (a.caliber ? " " + a.caliber : ""));
    });
    /* 0.3.92: rigs and kit items (packs are listed closed here; they open when the kit is applied) */
    var hol = (root.SSDNS_RULES && root.SSDNS_RULES.holsters) || [];
    [c.holster, c.holsterR, c.belt].forEach(function (id) {
      if (!id) return;
      var h = hol.filter(function (x) { return x && x.id === id; })[0];
      lines.push(h && h.name ? h.name : String(id).replace(/-/g, " "));
    });
    (c.items || []).forEach(function (it) {
      if (it && it.name) lines.push(it.name + (Number(it.count) > 1 ? " ×" + it.count : ""));
    });
    String(c.equipment || "").split("\n").forEach(function (line) {
      var text = line.replace(/^•\s*/, "").trim();
      if (!text) return;
      if (worn && text.toLowerCase().indexOf(worn.toLowerCase()) >= 0) return;
      lines.push(text);
    });
    return lines;
  }

  var api = {
    choices: CHOICES,
    callings: CALLINGS,
    blankCharacter: blankCharacter,
    apply: apply,
    firstChoices: firstChoices,
    openChoices: openChoices,
    branches: branches,
    describe: describe,
    kitLines: KIT_LINES,
    migrateEquipment: migrateEquipment,
    ensureBorrowedIron: ensureBorrowedIron
  };
  root.SSDNSKits = api;
  /* first boot: app.js migrated the saved sheet before this file loaded, so run the 0.3.94 kit-line step here */
  function bootMigrate() {
    var A = root.SSDNSApp;
    var d = A && A.doc ? A.doc() : null;
    var c = d && d.character;
    if (!c || c.equipMigrated >= 2 || !itemsApi()) return;
    var only = c.equipMigrated >= 1 ? MIGRATE_V2 : null;
    var due = String(c.equipment || "").split("\n").some(function (raw) {
      var line = raw.replace(/^\s*•\s*/, "").trim();
      return Object.prototype.hasOwnProperty.call(KIT_LINES, line) && (!only || only.indexOf(line) >= 0);
    }) || (c.calling === "pact-seeker" && !hasItem(c, "borrowed-iron"));
    if (!due) { c.equipMigrated = 2; return; }
    if (A.applyPatch) A.applyPatch(function (dd) { if (dd && dd.character) migrateEquipment(dd.character); });
    if (root.SSDNSItems && root.SSDNSItems.paintSheet) root.SSDNSItems.paintSheet();
  }
  if (typeof document !== "undefined" && document.addEventListener) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bootMigrate);
    else if (typeof setTimeout === "function") setTimeout(bootMigrate, 0);
  }
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);

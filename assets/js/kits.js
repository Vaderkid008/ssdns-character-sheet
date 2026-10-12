/**
 * Starting kits from the 2026-10-07 kit scrub, with Jessey's locks:
 * Lawman gets a Ball n Cap and no javelins; Gunslinger gets no matched pair.
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
  function addAmmo(c, type, caliber, count) {
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
  function addLine(c, text) {
    if (!text) return;
    var cur = c.equipment || "";
    if (cur.indexOf(text) >= 0) return;
    c.equipment = (cur ? cur.replace(/\s+$/, "") + "\n" : "") + "• " + text;
  }
  function packLine(id) {
    return {
      trail: "Trail kit",
      claim: "Claim pack",
      circuit: "Circuit kit",
      trunk: "Circuit trunk",
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
  function stilettos(c, n) {
    putMelee(c, "stiletto-dagger");
    var i;
    for (i = 1; i < n; i++) putMelee(c, "stiletto-dagger", true);
    if (n > 1) addLine(c, "Stilettos ×" + n);
  }
  function instrumentLine(voice) {
    var names = { fiddle: "Fiddle", banjo: "Banjo", guitar: "Guitar", accordion: "Accordion", harmonica: "Harmonica" };
    if (voice === "voice") return "Voice — focus";
    if (voice === "harmonica") return "Harmonica (rides in a pocket)";
    return (names[voice] || "Fiddle") + " with a strap and one spare set of strings";
  }

  var CHOICES = {
    storyteller: [
      { id: "voice", prompt: "Calling instrument (voice can be the focus; you still carry one)", options: [
        { id: "fiddle", label: "Fiddle" },
        { id: "banjo", label: "Banjo" },
        { id: "guitar", label: "Guitar" },
        { id: "accordion", label: "Accordion" },
        { id: "harmonica", label: "Harmonica" },
        { id: "voice", label: "Voice (still carry a harmonica)" }
      ]},
      { id: "weapon", prompt: "Sword cane, cavalry saber, derringer, or plinker?", options: [
        { id: "cane", label: "Sword cane" },
        { id: "saber", label: "Cavalry saber" },
        { id: "derringer", label: "Herringer Light Double Derringer + 20 Light cartridges" },
        { id: "plinker", label: "Dullards Plinker Revolver, .22 LR + 20 Light cartridges" }
      ]},
      { id: "kit", prompt: "Circuit trunk, or saloon kit?", options: [
        { id: "trunk", label: "Circuit trunk" },
        { id: "saloon", label: "Saloon kit" }
      ]}
    ],
    "frontier-preacher": [
      { id: "melee", prompt: "Trail mace, or sledgehammer?", options: [
        { id: "mace", label: "Trail mace" },
        { id: "hammer", label: "Sledgehammer (if proficient)" }
      ]},
      { id: "armor", prompt: "Scale coat, leather jacket, or mail duster?", options: [
        { id: "scale", label: "Scale coat" },
        { id: "leather", label: "Leather jacket" },
        { id: "mail", label: "Mail duster" }
      ]},
      { id: "gun", prompt: "Tube rifle, carbine, farm shotgun, or plinker?", options: [
        { id: "rifle", label: "Dullards Tube Rifle, Light + 20 Light cartridges" },
        { id: "carbine", label: "Dullards Light Carbine, Light + 20 Light cartridges" },
        { id: "shotgun", label: "Single-Barrel Farm Shotgun, .410 + 10 shells" },
        { id: "plinker", label: "Dullards Plinker Revolver, .22 LR + 20 Light cartridges" }
      ]},
      { id: "pack", prompt: "Circuit kit, or trail kit?", options: [
        { id: "circuit", label: "Circuit kit" },
        { id: "trail", label: "Trail kit" }
      ]}
    ],
    "nature-guide": [
      { id: "shieldOr", prompt: "Wooden shield, or a throwing spear?", options: [
        { id: "shield", label: "Wooden shield" },
        { id: "spear", label: "Throwing spear" }
      ]},
      { id: "focus", prompt: "Focus taken from the land?", options: [
        { id: "stick", label: "Carved walking stick" },
        { id: "pouch", label: "Medicine pouch" },
        { id: "soil", label: "Pouch of home-spring soil" }
      ]}
    ],
    gunslinger: [
      { id: "side", prompt: "Cavalry saber and shield, or one Ball n Cap?", options: [
        { id: "saber", label: "Cavalry saber and shield" },
        { id: "revolver", label: "Navy / Army Ball n Cap + 20 loads" }
      ]},
      { id: "armor", prompt: "Mail duster, or leather jacket and a carbine?", options: [
        { id: "mail", label: "Mail duster" },
        { id: "leather", label: "Leather jacket and Dullards Light Carbine + 20 Light cartridges" }
      ]},
      { id: "pack", prompt: "Claim pack, or trail kit?", options: [
        { id: "claim", label: "Claim pack" },
        { id: "trail", label: "Trail kit" }
      ]}
    ],
    "martial-artist": [
      { id: "pack", prompt: "Claim pack, or trail kit?", options: [
        { id: "claim", label: "Claim pack" },
        { id: "trail", label: "Trail kit" }
      ]}
    ],
    lawman: [
      { id: "pack", prompt: "Circuit kit, or trail kit?", options: [
        { id: "circuit", label: "Circuit kit" },
        { id: "trail", label: "Trail kit" }
      ]}
    ],
    "frontier-scout": [
      { id: "hunt", prompt: "Longbow, or a carbine?", options: [
        { id: "bow", label: "Longbow + 20 arrows" },
        { id: "carbine", label: "Dullards Light Carbine + 20 Light cartridges" }
      ]},
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
      { id: "blade", prompt: "Sword cane, or Bowie?", options: [
        { id: "iron", label: "Sword cane" },
        { id: "bowie", label: "Bowie" }
      ]},
      { id: "ranged", prompt: "Pocket pistol, pepperbox, or shortbow?", options: [
        { id: "pistol", label: "Herringer Light Pocket Pistol + 20 Light cartridges" },
        { id: "pepper", label: "Herringer Light Pepperbox + 20 Light cartridges" },
        { id: "bow", label: "Shortbow + 20 arrows" }
      ]},
      { id: "pack", prompt: "Alley kit, claim pack, or trail kit?", options: [
        { id: "alley", label: "Alley kit" },
        { id: "claim", label: "Claim pack" },
        { id: "trail", label: "Trail kit" }
      ]}
    ],
    hexslinger: [
      { id: "gun", prompt: "Blacksnake, or Hognose?", options: [
        { id: "blacksnake", label: "Blacksnake caster gun" },
        { id: "hognose", label: "Hognose caster gun" }
      ]},
      { id: "pack", prompt: "Trail kit, or claim pack?", options: [
        { id: "trail", label: "Trail kit" },
        { id: "claim", label: "Claim pack" }
      ]}
    ],
    "pact-seeker": [
      { id: "gun", prompt: "A simple sidearm, plinker, or a hatchet?", options: [
        { id: "pocket", label: "Herringer Light Pocket Pistol + 20 Light cartridges" },
        { id: "double", label: "Herringer Light Double Derringer + 20 Light cartridges" },
        { id: "pepper", label: "Herringer Light Pepperbox + 20 Light cartridges" },
        { id: "plinker", label: "Dullards Plinker Revolver + 20 Light cartridges" },
        { id: "simple", label: "Hatchet (simple weapon)" }
      ]},
      { id: "pack", prompt: "Book trunk, or claim pack?", options: [
        { id: "book", label: "Book trunk" },
        { id: "claim", label: "Claim pack" }
      ]}
    ],
    scholar: [
      { id: "weapon", prompt: "Trail staff, stiletto, or plinker?", options: [
        { id: "cane", label: "Weighted walking cane (trail staff)" },
        { id: "stiletto", label: "Stiletto" },
        { id: "plinker", label: "Dullards Plinker Revolver + 20 Light cartridges" }
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
      gunBelt: false,
      shield: false,
      armor: "",
      casterGun: "",
      pactFocus: ""
    };
  }

  function moduleStart(c, calling, p) {
    p = p || {};
    kitCalling = calling || "";
    if (calling === "tribal-warrior") {
      putMelee(c, "hatchet-handaxe");
    } else if (calling === "storyteller") {
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
      putMelee(c, "bowie-shortsword");
      addLine(c, "Keepsake (focus)");
    } else if (calling === "gambler") {
      putMelee(c, "stiletto-dagger");
      addLine(c, "Thieves' tools");
    } else if (calling === "hexslinger") {
      var gun = p.gun === "hognose" ? "hognose" : "blacksnake";
      putGun(c, gun);
      c.casterGun = gun;
    } else if (calling === "pact-seeker") {
      c.casterGun = "borrowed-iron";
      c.pactFocus = "borrowed-iron";
      addLine(c, "Borrowed Iron (pact focus)");
    } else if (calling === "scholar") {
      addLine(c, "Chemical Field Ledger (focus)");
    }
    if (p.bedtime) addLine(c, "Bedtime item: " + p.bedtime);
    if (CALLINGS.indexOf(calling) >= 0) c.kitStamp = calling;
    c.kitMode = "module";
    return c;
  }

  function apply(c, calling, p, opts) {
    p = p || {};
    opts = opts || {};
    kitCalling = calling || "";
    if (opts.start === "module" || p._start === "module") return moduleStart(c, calling, p);
    if (calling === "tribal-warrior") {
      putMelee(c, "buffalo-axe-greataxe");
      putMelee(c, "hatchet-handaxe");
      putMelee(c, "hatchet-handaxe", true);
      putMelee(c, "throwing-spear-javelin");
      putMelee(c, "throwing-spear-javelin", true);
      putMelee(c, "throwing-spear-javelin", true);
      putMelee(c, "throwing-spear-javelin", true);
      addLine(c, "Trail kit");
    } else if (calling === "storyteller") {
      var voice = p.voice || "fiddle";
      if (p.weapon === "saber") putMelee(c, "cavalry-saber-longsword");
      else if (p.weapon === "derringer") derringer(c);
      else if (p.weapon === "plinker") plinker(c);
      else putMelee(c, "sword-cane-rapier");
      putMelee(c, "stiletto-dagger");
      c.armor = "leather-jacket";
      addLine(c, instrumentLine(voice));
      if (voice === "voice") addLine(c, "Harmonica (kit instrument)");
      addLine(c, p.kit === "saloon" ? "Saloon kit" : "Circuit trunk");
      c.instrument = voice;
      if (voice !== "voice" && voice !== "harmonica") {
        if (!c.instrumentQuality) c.instrumentQuality = "cheap";
        if (!c.instrumentStrings) c.instrumentStrings = "plain";
      } else if (voice === "harmonica") {
        if (!c.instrumentQuality) c.instrumentQuality = "cheap";
      }
    } else if (calling === "frontier-preacher") {
      if (p.melee === "hammer") putMelee(c, "sledgehammer-warhammer");
      else putMelee(c, "trail-mace-chapel-mace-mace");
      if (p.gun === "shotgun") {
        var shot = putGun(c, "single-barrel-farm-shotgun");
        chamberGun(shot, "light|.410");
        addAmmo(c, "buck", ".410", 10);
      } else if (p.gun === "plinker") plinker(c);
      else if (p.gun === "carbine") lightGun(c, "dullards-light-carbine");
      else lightGun(c, "dullards-tube-rifle");
      c.armor = p.armor === "leather" ? "leather-jacket" : (p.armor === "mail" ? "mail-duster" : "scale-coat");
      c.shield = true;
      addLine(c, "Shield");
      addLine(c, packLine(p.pack === "trail" ? "trail" : "circuit"));
      addLine(c, "Holy symbol (focus)");
    } else if (calling === "nature-guide") {
      putMelee(c, "machete-scimitar");
      if (p.shieldOr === "spear") {
        putMelee(c, "throwing-spear-javelin");
        c.shield = false;
      } else {
        c.shield = true;
        addLine(c, "Wooden shield");
      }
      c.armor = "leather-jacket";
      addLine(c, "Trail kit");
      addLine(c, "Herbalism kit");
      var focus = { stick: "Carved walking stick", pouch: "Medicine pouch", soil: "Pouch of home-spring soil" };
      addLine(c, "Focus: " + (focus[p.focus] || focus.stick));
    } else if (calling === "gunslinger") {
      lightGun(c, "dullards-tube-rifle");
      c.holster = "mexican-loop";
      c.gunBelt = true;
      addLine(c, "Gun belt");
      addLine(c, "Mexican Loop holster");
      addLine(c, packLine(p.pack === "trail" ? "trail" : "claim"));
      if (p.armor === "leather") {
        c.armor = "leather-jacket";
        lightGun(c, "dullards-light-carbine");
      } else c.armor = "mail-duster";
      if (p.side === "revolver") ballCap(c);
      else {
        putMelee(c, "cavalry-saber-longsword");
        c.shield = true;
        addLine(c, "Shield");
      }
    } else if (calling === "martial-artist") {
      putMelee(c, "bowie-shortsword");
      putGun(c, "throwing-knife-dart");
      addLine(c, "Throwing knives ×10");
      addLine(c, packLine(p.pack === "trail" ? "trail" : "claim"));
      addLine(c, "Rough canvas shirt and heavy boots");
    } else if (calling === "lawman") {
      putMelee(c, "cavalry-saber-longsword");
      c.shield = true;
      c.armor = "mail-duster";
      addLine(c, "Badge (tin star, focus)");
      ballCap(c);
      addLine(c, "Mail Duster (chain mail)");
      addLine(c, packLine(p.pack === "trail" ? "trail" : "circuit"));
    } else if (calling === "frontier-scout") {
      putMelee(c, "bowie-shortsword");
      putMelee(c, "bowie-shortsword", true);
      addLine(c, "Bowies ×2");
      c.armor = p.armor === "leather" ? "leather-jacket" : "scale-coat";
      c.gunBelt = true;
      addLine(c, "Gun belt");
      addLine(c, packLine(p.pack === "claim" ? "claim" : "trail"));
      addLine(c, "Keepsake (focus)");
      if (p.hunt === "carbine") lightGun(c, "dullards-light-carbine");
      else {
        putGun(c, "longbow");
        addAmmo(c, "arrows", "", 20);
        addLine(c, "Arrows ×20");
      }
    } else if (calling === "gambler") {
      if (p.blade === "bowie") putMelee(c, "bowie-shortsword");
      else putMelee(c, "sword-cane-rapier");
      stilettos(c, 2);
      c.armor = "leather-jacket";
      addLine(c, "Thieves' tools");
      addLine(c, packLine(p.pack === "claim" ? "claim" : (p.pack === "trail" ? "trail" : "alley")));
      if (p.ranged === "bow") {
        putGun(c, "shortbow");
        addAmmo(c, "arrows", "", 20);
        addLine(c, "Arrows ×20");
      } else if (p.ranged === "pepper") {
        var pep = putGun(c, "herringer-light-pepperbox");
        chamberGun(pep, "light|.32 Long");
        addAmmo(c, "cartridge", "Light", 20);
      } else {
        var pocket = putGun(c, "herringer-light-pocket-pistol");
        chamberGun(pocket, "light|.32 Long");
        addAmmo(c, "cartridge", "Light", 20);
      }
    } else if (calling === "hexslinger") {
      var hex = p.gun === "hognose" ? "hognose" : "blacksnake";
      putGun(c, hex);
      c.casterGun = hex;
      c.gunBelt = true;
      addLine(c, "Gun belt");
      addAmmo(c, "cartridge", "Light", 20);
      addLine(c, "Light cartridges ×20 (plain rounds, not in the cylinder)");
      stilettos(c, 2);
      addLine(c, packLine(p.pack === "claim" ? "claim" : "trail"));
    } else if (calling === "pact-seeker") {
      c.casterGun = "borrowed-iron";
      c.pactFocus = "borrowed-iron";
      addLine(c, "Borrowed Iron (pact focus)");
      if (p.gun === "simple") putMelee(c, "hatchet-handaxe");
      else if (p.gun === "double") derringer(c);
      else if (p.gun === "pepper") {
        var pp = putGun(c, "herringer-light-pepperbox");
        chamberGun(pp, "light|.32 Long");
        addAmmo(c, "cartridge", "Light", 20);
      } else if (p.gun === "plinker") plinker(c);
      else {
        var pk = putGun(c, "herringer-light-pocket-pistol");
        chamberGun(pk, "light|.32 Long");
        addAmmo(c, "cartridge", "Light", 20);
      }
      stilettos(c, 2);
      c.armor = "leather-jacket";
      addLine(c, packLine(p.pack === "claim" ? "claim" : "book"));
    } else if (calling === "scholar") {
      if (p.weapon === "plinker") plinker(c);
      else if (p.weapon === "stiletto") putMelee(c, "stiletto-dagger");
      else putMelee(c, "trail-staff-drover-s-staff-quarterstaff");
      addLine(c, "Chemical Field Ledger");
      addLine(c, "Prism (focus)");
      addLine(c, "Galvanic reagents (component pouch)");
      addLine(c, packLine(p.pack === "trail" ? "trail" : "book"));
      addLine(c, "Duster (traveler's clothes)");
    }
    if (CALLINGS.indexOf(calling) >= 0) c.kitStamp = calling;
    c.kitMode = "full";
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
    var c = apply(blankCharacter(), calling, picks || {}, opts || {});
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
    describe: describe
  };
  root.SSDNSKits = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);

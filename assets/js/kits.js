/**
 * Starting kits from PHB-KITS-AND-FOCI and the BOOK1 kit crosswalk.
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
  function putGun(c, id, allowDup) {
    if (!id) return;
    if (!allowDup && hasWeapon(c, id)) return;
    var guns = ensureList(c, "guns", 4);
    var slot = guns.filter(function (g) { return g && !g.weapon; })[0];
    if (!slot) {
      slot = { weapon: "", proficient: true, chambers: [], loaded: 0 };
      guns.push(slot);
    }
    slot.weapon = id;
    slot.proficient = true;
    if (!slot.chambers) slot.chambers = [];
  }
  function putMelee(c, id) {
    if (!id || hasWeapon(c, id)) return;
    var melee = ensureList(c, "melee", 4);
    var slot = melee.filter(function (g) { return g && !g.weapon; })[0];
    if (!slot) {
      slot = { weapon: "", proficient: true };
      melee.push(slot);
    }
    slot.weapon = id;
    slot.proficient = true;
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
  function lightRifle(c, which) {
    if (which === "carbine") putGun(c, "dullards-light-carbine");
    else putGun(c, "dullards-tube-rifle");
    addAmmo(c, "cartridge", "Light", 20);
  }

  var CHOICES = {
    gunslinger: [
      { id: "side", prompt: "Cavalry saber, or twin revolvers?", options: [
        { id: "saber", label: "Cavalry saber" },
        { id: "twins", label: "Twin revolvers" }
      ]},
      { id: "irons", prompt: "Which twin revolvers?", when: function (p) { return p.side === "twins"; }, options: [
        { id: "pepper", label: "Two Herringer Light Pepperboxes + 20 Light cartridges" },
        { id: "navy", label: "One Navy/Army Ball n Cap + 20 loads (powder, ball, and caps)" }
      ]}
    ],
    "frontier-scout": [
      { id: "hunt", prompt: "Hunting rifle: longbow, or a carbine?", options: [
        { id: "bow", label: "Longbow + 20 arrows" },
        { id: "carbine", label: "Dullards Light Carbine + 20 Light cartridges" }
      ]}
    ],
    "frontier-preacher": [
      { id: "melee", prompt: "Mace, or chapel hammer?", options: [
        { id: "mace", label: "Trail mace" },
        { id: "hammer", label: "Chapel hammer (claim hammer)" }
      ]},
      { id: "armor", prompt: "Plated duster, or scale mail?", options: [
        { id: "duster", label: "Plated duster (heavy leather duster)" },
        { id: "scale", label: "Scale coat" }
      ]},
      { id: "gun", prompt: "Light rifle, or Farm Shotgun?", options: [
        { id: "rifle", label: "Light rifle — Dullards Tube Rifle + 20 Light cartridges" },
        { id: "carbine", label: "Light rifle — Dullards Light Carbine + 20 Light cartridges" },
        { id: "shotgun", label: "Single-Barrel Farm Shotgun, .410 + 10 shells" }
      ]}
    ],
    storyteller: [
      { id: "kit", prompt: "Diplomat's trunk, or saloon kit?", options: [
        { id: "trunk", label: "Diplomat's trunk" },
        { id: "saloon", label: "Saloon kit" }
      ]},
      { id: "voice", prompt: "Which instrument is the focus?", options: [
        { id: "fiddle", label: "Fiddle" },
        { id: "banjo", label: "Banjo" },
        { id: "guitar", label: "Guitar" },
        { id: "voice", label: "Voice" }
      ]}
    ],
    "nature-guide": [
      { id: "focus", prompt: "Focus taken from the land?", options: [
        { id: "stick", label: "Carved walking stick" },
        { id: "pouch", label: "Medicine pouch" },
        { id: "soil", label: "Pouch of home-spring soil" }
      ]}
    ],
    gambler: [
      { id: "blade", prompt: "Fencing iron, or Bowie knife?", options: [
        { id: "iron", label: "Fencing iron (sword cane)" },
        { id: "bowie", label: "Bowie knife" }
      ]},
      { id: "ranged", prompt: "Shortbow, or pocket pistol?", options: [
        { id: "bow", label: "Shortbow + 20 arrows" },
        { id: "pistol", label: "Herringer Light Pocket Pistol + 20 Light cartridges" }
      ]}
    ],
    hexslinger: [
      { id: "gun", prompt: "Blacksnake, or Hognose?", options: [
        { id: "blacksnake", label: "Blacksnake caster gun" },
        { id: "hognose", label: "Hognose caster gun" }
      ]}
    ]
  };

  function blankCharacter() {
    return {
      guns: [0, 1, 2, 3].map(function () { return { weapon: "", proficient: false, chambers: [], loaded: 0 }; }),
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

  function apply(c, calling, p) {
    p = p || {};
    if (calling === "tribal-warrior") {
      putMelee(c, "buffalo-axe-greataxe");
      putMelee(c, "hatchet-handaxe");
      putMelee(c, "throwing-spear-javelin");
      addLine(c, "Hatchet (second)");
      addLine(c, "Throwing spears ×4");
      addLine(c, "Explorer pack");
    } else if (calling === "storyteller") {
      var voice = p.voice || "fiddle";
      var voiceName = { fiddle: "Fiddle", banjo: "Banjo", guitar: "Guitar", voice: "Voice" };
      putMelee(c, "bowie-shortsword");
      putGun(c, "herringer-light-double-derringer");
      var derringer = (c.guns || []).filter(function (g) { return g && g.weapon === "herringer-light-double-derringer"; })[0];
      if (derringer) {
        derringer.tier = "light";
        derringer.chamber = "light|.32 Long";
        derringer.proficient = true;
      }
      addAmmo(c, "cartridge", "Light", 20);
      if (voice === "voice") addLine(c, "Voice — focus");
      else addLine(c, (voiceName[voice] || "Fiddle") + " with a strap and one spare set of strings");
      if (p.kit === "saloon") addLine(c, "Saloon kit");
      else addLine(c, "Diplomat trunk");
      addLine(c, "Duster");
      c.instrument = voice;
      if (voice !== "voice") {
        if (!c.instrumentQuality) c.instrumentQuality = "cheap";
        if (!c.instrumentStrings) c.instrumentStrings = "plain";
      }
    } else if (calling === "frontier-preacher") {
      if (p.melee === "hammer") putMelee(c, "claim-hammer-light-hammer");
      else putMelee(c, "trail-mace-chapel-mace-mace");
      if (p.gun === "shotgun") {
        putGun(c, "single-barrel-farm-shotgun");
        addAmmo(c, "buck", ".410", 10);
      } else lightRifle(c, p.gun === "carbine" ? "carbine" : "rifle");
      if (p.armor === "scale") c.armor = "scale-coat";
      else c.armor = "heavy-leather-duster";
      addLine(c, "Priest kit");
      addLine(c, "Carved holy symbol");
    } else if (calling === "nature-guide") {
      putMelee(c, "machete-scimitar");
      c.shield = true;
      addLine(c, "Wooden shield");
      addLine(c, "Explorer pack");
      addLine(c, "Herbalism kit");
      var focus = { stick: "Carved walking stick", pouch: "Medicine pouch", soil: "Pouch of home-spring soil" };
      addLine(c, "Focus: " + (focus[p.focus] || focus.stick));
    } else if (calling === "gunslinger") {
      putGun(c, "dullards-tube-rifle");
      addAmmo(c, "cartridge", "Light", 20);
      c.holster = "mexican-loop";
      c.gunBelt = true;
      addLine(c, "Duster");
      addLine(c, "Gun belt");
      addLine(c, "Mexican Loop holster");
      addLine(c, "Dungeoneer company kit");
      if (p.side === "twins") {
        if (p.irons === "navy") {
          putGun(c, "navy-army-ball-n-cap-revolver");
          addAmmo(c, "percussion", "", 20);
          addLine(c, "Powder, ball, and caps ×20");
        } else {
          putGun(c, "herringer-light-pepperbox");
          putGun(c, "herringer-light-pepperbox", true);
          addAmmo(c, "cartridge", "Light", 20);
        }
      } else putMelee(c, "cavalry-saber-longsword");
    } else if (calling === "martial-artist") {
      putMelee(c, "bowie-shortsword");
      addLine(c, "Throwing knives ×10");
      addLine(c, "Dungeoneer pack");
      addLine(c, "Rough canvas shirt and heavy boots");
    } else if (calling === "lawman") {
      putMelee(c, "cavalry-saber-longsword");
      putMelee(c, "throwing-spear-javelin");
      c.shield = true;
      c.armor = c.armor || "mail-duster";
      addLine(c, "Badge (tin star, focus)");
      addLine(c, "Javelins ×5");
      addLine(c, "Chain mail under heavy duster coat");
    } else if (calling === "frontier-scout") {
      putMelee(c, "bowie-shortsword");
      addLine(c, "Second Bowie knife");
      c.armor = c.armor || "scale-coat";
      c.gunBelt = true;
      addLine(c, "Gun belt");
      addLine(c, "Scale/leather coat");
      addLine(c, "Explorer trail pack");
      addLine(c, "Compass (focus)");
      if (p.hunt === "bow") {
        putGun(c, "longbow");
        addLine(c, "Arrows ×20");
      } else {
        putGun(c, "dullards-light-carbine");
        addAmmo(c, "cartridge", "Light", 20);
      }
    } else if (calling === "gambler") {
      if (p.blade === "bowie") putMelee(c, "bowie-shortsword");
      else putMelee(c, "sword-cane-rapier");
      if (p.ranged === "bow") {
        putGun(c, "shortbow");
        addLine(c, "Arrows ×20");
      } else {
        putGun(c, "herringer-light-pocket-pistol");
        addAmmo(c, "cartridge", "Light", 20);
      }
      addLine(c, "Stilettos ×2");
      addLine(c, "Thieves' tools");
      addLine(c, "Duster");
      addLine(c, "Satchel");
    } else if (calling === "hexslinger") {
      var gun = p.gun === "hognose" ? "hognose" : "blacksnake";
      putGun(c, gun);
      c.casterGun = gun;
      c.gunBelt = true;
      addLine(c, "Gun belt");
      putMelee(c, "bowie-shortsword");
      addLine(c, "Explorer pack");
      addLine(c, "Daggers ×2");
    } else if (calling === "pact-seeker") {
      c.casterGun = "borrowed-iron";
      c.pactFocus = "borrowed-iron";
      addLine(c, "Borrowed Iron (pact focus)");
      addLine(c, "Dungeoneer pack");
      addLine(c, "Duster");
    } else if (calling === "scholar") {
      addLine(c, "Chemical Field Ledger (focus)");
      addLine(c, "Prism");
      addLine(c, "Galvanic reagents");
      addLine(c, "Scholar pack");
      addLine(c, "Duster");
    }
    if (CALLINGS.indexOf(calling) >= 0) c.kitStamp = calling;
    return c;
  }

  var CALLINGS = [
    "tribal-warrior", "storyteller", "frontier-preacher", "nature-guide", "gunslinger",
    "martial-artist", "lawman", "frontier-scout", "gambler", "hexslinger", "pact-seeker", "scholar"
  ];

  function openChoices(calling, picked) {
    return (CHOICES[calling] || []).filter(function (ch) {
      if (picked && picked[ch.id] != null) return false;
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

  var api = {
    choices: CHOICES,
    callings: CALLINGS,
    blankCharacter: blankCharacter,
    apply: apply,
    firstChoices: firstChoices,
    openChoices: openChoices,
    branches: branches
  };
  root.SSDNSKits = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);

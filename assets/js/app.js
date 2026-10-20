/* SSDNS Character Sheet · v0.3.3 (round 7: kits, toasts, join, attack lines)
 * Static, no server. Rules data: window.SSDNS_RULES (assets/data/rules.js, generated from the PHB).
 * Saving: SSDNSStore (storage.js). Shards bridge for Saloon games: SSDNSBridge (ssdns-bridge.js).
 */
(function () {
  "use strict";
  var APP_VERSION = "0.3.74"; // sheet-playtest-v0374
  var FORMAT = "ssdns-character";
  var SCHEMA = 2;
  var R = window.SSDNS_RULES;
  var Store = window.SSDNSStore;
  var Bridge = window.SSDNSBridge;

  // ------------------------------------------------------------------ helpers
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === "class") e.className = v;
      else if (k === "text") e.textContent = v;
      else if (k === "html") e.innerHTML = v;
      else if (k.slice(0, 2) === "on") e.addEventListener(k.slice(2), v);
      else if (k === "value" && ("value" in e)) { e.value = v; e.setAttribute(k, v === true ? "" : v); }
      else e.setAttribute(k, v === true ? "" : v);
    });
    (kids || []).forEach(function (c) { if (c != null) e.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return e;
  }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function byId(arr) { var o = {}; (arr || []).forEach(function (x) { o[x.id] = x; }); return o; }
  function sign(n) { return n >= 0 ? "+" + n : String(n); }
  function num(v, d) { var n = parseInt(v, 10); return isFinite(n) ? n : (d === undefined ? 0 : d); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function uid() { return "c_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function timeStr(iso) {
    var d = new Date(iso);
    return d.toLocaleDateString([], { month: "short", day: "numeric" }) + ", " + d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  function getPath(o, path) { return path.split(".").reduce(function (a, k) { return a == null ? undefined : a[k]; }, o); }
  function setPath(o, path, v) {
    var ks = path.split("."), last = ks.pop();
    var t = ks.reduce(function (a, k) { if (a[k] == null || typeof a[k] !== "object") a[k] = {}; return a[k]; }, o);
    t[last] = v;
  }
  function debounce(fn, ms) { var t; return function () { clearTimeout(t); t = setTimeout(fn, ms); }; }
  function levelNum(s) { return parseInt(String(s), 10) || 0; }

  // ------------------------------------------------------------------ rules lookups
  var AB = R.abilities.map(function (a) { return a.id; });
  var LIN = byId(R.lineages), CAL = byId(R.callings), BG = byId(R.backgrounds), ARM = byId(R.armor), HOL = byId(R.holsters), FEAT = byId(R.feats);
  var CASTER_GUNS = byId(R.casterGuns);
  var WEAPON_LIST = [].concat(R.firearms, R.casterGuns, R.otherRanged, R.melee);
  var WPN = byId(WEAPON_LIST);
  (function installDebugGuns() {
    var jam = window.SSDNSTestJammer;
    if (!jam || !jam.weapons) return;
    jam.weapons().forEach(function (w) {
      if (w && w.debug && w.id && !WPN[w.id]) WPN[w.id] = w;
    });
  })();
  (function installDmOnlyGuns() {
    var pm = window.SSDNSPeaceMaker;
    if (!pm || !pm.weapon) return;
    var w = pm.weapon();
    if (w && w.dmOnly && w.id && !WPN[w.id]) WPN[w.id] = w;
  })();
  (function installCustomWeapons() {
    var cw = window.SSDNSCustomWeapons;
    if (!cw || !cw.onRegister) return;
    cw.onRegister(function (w) {
      if (!w || !w.id) return;
      WPN[w.id] = w;
      if (WEAPON_LIST.indexOf(w) < 0) WEAPON_LIST.push(w);
    });
  })();
  var SHARDS = R.currency; // [{id:"white", color:"White", equals:"1 ES", es:1}, ...] (PHB Currency — Eldorite)
  var SPELL_LINES = [8, 12, 13, 13, 13, 9, 9, 9, 7, 7]; // same number of lines as the 5e base sheet, page 3
  var MAX_BOXES = 9;

  // Ammo pools: type + caliber (the round a gun is chambered for). Labels follow the PHB Ammunition table.
  var AMMO_TYPES = [
    { id: "cartridge", label: "Cartridges" },
    { id: "percussion", label: "Powder, ball & caps" },
    { id: "buck", label: "Shells, buckshot" },
    { id: "slug", label: "Shells, slugs" },
    { id: "bigfifty", label: "Big Fifty .50-90" },
    { id: "arrows", label: "Arrows" }
  ];
  var AMMO_LABEL = {}; AMMO_TYPES.forEach(function (t) { AMMO_LABEL[t.id] = t.label; });
  var CALIBERS = [];
  function addCal(c) { if (c && CALIBERS.indexOf(c) < 0) CALIBERS.push(c); }
  [].concat(R.firearms, R.casterGuns).forEach(function (f) { Object.keys(f.rounds || {}).forEach(function (t) { (f.rounds[t] || []).forEach(addCal); }); });
  (R.ammo || []).forEach(function (a) { addCal(a.caliber); });
  var TIERS = ["light", "medium", "heavy"];
  var TIER_LABEL = { light: "Light", medium: "Medium", heavy: "Heavy" };
  var UNIT = (R.meta && R.meta.currencyUnit) || "ES";

  // v0.1 (Sept 29 book) ids -> current PHB ids. Old saves keep loading.
  var OLD_IDS = {
    calling: { "sheriff-infantry": "lawman", "sheriff": "lawman", "gambler-burglar": "gambler" },
    weapon: { "herringer-quad": ["herringer-light-pepperbox", "light"], "herringer-single": ["herringer-light-pocket-pistol", "light"], "herringer-double": ["herringer-light-double-derringer", "light"],
      "navy-army-ball-n-cap": ["navy-army-ball-n-cap-revolver", "medium"], "chaosmaker-revolver": ["pony-arms-chaosmaker-medium", "medium"],
      "single-barrel-shotgun-12-ga": ["single-barrel-farm-shotgun", "medium"], "double-barrel-shotgun-12-ga": ["double-barrel-coach-gun", "medium"], "lancaster-repeating-shotgun-16-ga": ["lancaster-lever-shotgun", "medium"],
      "dulls-rifle": ["dulls-rolling-block-rifle", "medium"], "dullards-rifle": ["dullards-tube-rifle", "medium"],
      "henrietta-repeating-rifle-44-rimfire": ["henrietta-repeating-rifle", "light"], "henrietta-repeating-rifle-357": ["henrietta-repeating-rifle", "medium"], "henrietta-repeating-rifle-45-long": ["henrietta-repeating-rifle", "heavy"],
      "lancaster-repeating-rifle-44-rimfire": ["lancaster-repeating-rifle", "light"], "lancaster-repeating-rifle-357": ["lancaster-repeating-rifle", "medium"], "lancaster-repeating-rifle-45-long": ["lancaster-repeating-rifle", "heavy"],
      "musket": ["dull-co-rifle-musket", "medium"], "bison-big-fifty-50-90": ["bison-big-fifty-buffalo-rifle", "heavy"],
      "standard-caster-gun": ["blacksnake", "medium"], "python": ["blacksnake", "medium"], "cobra": ["blacksnake", "medium"], "viper": ["blacksnake", "medium"], "boa": ["blacksnake", "medium"] },
    holster: { "concealed-shoulder-vest-sleeve": "concealed-vest-sleeve" }
  };

  // ------------------------------------------------------------------ document model
  function blankCharacter() {
    var abil = {}, saves = {};
    AB.forEach(function (a) { abil[a] = 10; saves[a] = false; });
    var spells = {};
    for (var l = 1; l <= 9; l++) {
      spells[l] = [];
      for (var i = 0; i < SPELL_LINES[l]; i++) spells[l].push({ name: "", prepared: false });
    }
    var hex = {};
    for (var h = 1; h <= 9; h++) hex[h] = new Array(MAX_BOXES).fill(false);
    return {
      name: "", player: "", lineage: "", sublineage: "", calling: "", level: 1, subclass: "", background: "", xp: "",
      abilities: abil, saveProf: saves, skillProf: {}, overrides: {},
      partyInspiration: new Array(10).fill(false),
      speed: "", armor: "", shield: false, hpAuto: true, hpMax: "", hpCurrent: "", hpTemp: "", hitDiceLeft: "",
      deathSaves: { success: [false, false, false], fail: [false, false, false] },
      guns: [0, 1, 2, 3].map(function () { return { weapon: "", tier: "", chamber: "", mod: "", engraving: false, capacity: "", load: "buck", loaded: 0, chambers: [], proficient: false, jammed: false, cracked: false, fouled: false, dirty: false }; }),
      melee: [0, 1, 2, 3].map(function () { return { weapon: "", proficient: false }; }),
      fightingStyle: "",
      featureUses: {},
      kitStamp: "",
      tableConditions: "",
      ammo: [], explosives: [], items: [], inventoryLocked: false, holster: "", holsterR: "", belt: "", holsterActive: false, seated: false, mounted: false, gunBelt: false, attackNotes: "",
      instrument: "", instrumentQuality: "cheap", instrumentStrings: "plain", instrumentCase: "none", instrumentWear: "ok",
      proficienciesLanguages: "", equipment: "", personality: "", ideals: "", bonds: "", flaws: "", feats: [], features: "",
      age: "", height: "", weight: "", eyes: "", skin: "", hair: "", portrait: "", appearance: "", gangName: "", gangSymbol: "",
      allies: "", backstory: "", additionalFeatures: "", treasure: "",
      casterGun: "", hexRest: "", cantrips: new Array(8).fill(""), spells: spells, hexLead: hex
    };
  }
  function blankDoc() {
    var now = new Date().toISOString();
    return { format: FORMAT, schemaVersion: SCHEMA, app: "SSDNS Character Sheet " + APP_VERSION, id: uid(), createdAt: now, updatedAt: now,
      shards: { white: 0, blue: 0, green: 0, yellow: 0, purple: 0 }, character: blankCharacter() };
  }
  /** Fill anything missing with defaults, never dropping unknown keys (forward compatible). */
  function fill(def, val) {
    if (Array.isArray(def)) {
      if (!Array.isArray(val)) return clone(def);
      if (def.length && typeof def[0] === "object") {
        var out = val.map(function (v, i) { return fill(def[i] || def[0], v); });
        for (var i = out.length; i < def.length; i++) out.push(clone(def[i]));
        return out;
      }
      var arr = val.slice();
      for (var j = arr.length; j < def.length; j++) arr.push(def[j]);
      return arr;
    }
    if (def && typeof def === "object") {
      var o = (val && typeof val === "object" && !Array.isArray(val)) ? val : {};
      Object.keys(def).forEach(function (k) { o[k] = fill(def[k], o[k]); });
      return o;
    }
    return val === undefined || val === null ? def : val;
  }
  function migrate(raw) {
    if (!raw || typeof raw !== "object") throw new Error("That file isn't a character (not JSON).");
    if (raw.format !== FORMAT && !raw.character) throw new Error("That file isn't an SSDNS character.");
    var v = num(raw.schemaVersion, 1);
    if (v > SCHEMA) console.warn("File is from a newer sheet (schema " + v + "); loading what we understand.");
    var notes = [];
    if (v < 2 && raw.character) upgradeV1(raw.character, notes);
    var d = blankDoc();
    var doc = {
      format: FORMAT, schemaVersion: Math.max(v, SCHEMA), app: raw.app || d.app,
      id: raw.id || d.id, createdAt: raw.createdAt || d.createdAt, updatedAt: raw.updatedAt || d.updatedAt,
      shards: Bridge.cleanShards(raw.shards), character: fill(d.character, raw.character)
    };
    var hadHp = raw.character && raw.character.hpMax !== "" && raw.character.hpMax != null;
    if (hadHp && raw.character.hpAuto !== true) doc.character.hpAuto = false;
    if (doc.character && doc.character.addiction) delete doc.character.addiction;
    Object.keys(raw).forEach(function (k) { if (!(k in doc)) doc[k] = raw[k]; });
    if (doc.character && doc.character.proficienciesLanguages) {
      doc.character.proficienciesLanguages = migrateSettlerLanguages(doc.character.proficienciesLanguages);
    }
    if (doc.character && window.SSDNSItems && window.SSDNSItems.mergeExplosives) {
      var merged = window.SSDNSItems.mergeExplosives(doc.character);
      if (merged) notes.push("Moved " + merged + " explosive line(s) into Items (Use button).");
    }
    if (doc.character && window.SSDNSCustomWeapons) window.SSDNSCustomWeapons.syncCharacter(doc.character);
    if (doc.character && window.SSDNSEquip && window.SSDNSEquip.migrateHolsters) {
      var hadBeltHolster = doc.character.holster && window.SSDNSEquip.isBeltHolster(doc.character.holster);
      window.SSDNSEquip.migrateHolsters(doc.character);
      if (hadBeltHolster) notes.push("Moved the gun belt / bandolier from Holster to Belt (Holster L and R are separate now).");
    }
    if (doc.character && window.SSDNSEquip && window.SSDNSEquip.migrate) {
      var loadout = window.SSDNSEquip.migrate(doc.character);
      if (loadout && loadout.ok && !loadout.skipped) notes.push("Equipped current weapons up to the L0170 slot limits.");
    }
    if (notes.length) { doc.migrationNotes = (raw.migrationNotes || []).concat(notes); S.migrated = notes; }
    return doc;
  }
  /** g.chamber = "tier|round" (PHB Chambering: pick the round when you buy the gun). Falls back to g.tier / first tier. */
  function chamberOf(g, w) {
    var parts = String(g.chamber || "").split("|"), tier = parts[0], round = parts[1] || "";
    if (!w || !w.tiers) return { tier: "", round: "" };
    if (!w.tiers[tier]) tier = w.tiers[g.tier] ? g.tier : firstTier(w);
    var list = (w.rounds && w.rounds[tier]) || [];
    if (list.indexOf(round) < 0) round = list[0] || "";
    return { tier: tier, round: round };
  }
  function chamberOptions(w) {
    var o = [];
    TIERS.forEach(function (t) {
      if (!w.tiers || !w.tiers[t]) return;
      var list = (w.rounds && w.rounds[t] && w.rounds[t].length) ? w.rounds[t] : [""];
      list.forEach(function (round) {
        var label = w.ammo === "cartridge"
          ? (round ? (round + " (" + TIER_LABEL[t] + ")") : ("Cartridges (" + TIER_LABEL[t] + ")"))
          : (TIER_LABEL[t] + (round ? " · " + round : ""));
        o.push([t + "|" + round, label]);
      });
    });
    if (w.tiers && w.tiers.light && !w.scatter && (w.group === "rifle" || w.group === "carbine" || w.group === "caster")) {
      var lights = (w.rounds && w.rounds.light) || [];
      var has22 = lights.some(function (r) { return /\.22\s*lr/i.test(String(r || "")); });
      if (!has22) o.push(["light|.22 LR", ".22 LR (Light, 1d4)"]);
    }
    return o;
  }
  /** Saved sheets: exact old lineage and Demon Blood sentences become settler-language lines. The generic Nomads "one extra language" sentence is left alone. */
  function migrateSettlerLanguages(langs) {
    var pairs = [
      ["You can speak, read, and write Common and Dwarvish (Under-Cant — clan tunnel speech).", "You can speak, read, and write Common and one settler language from your lineage's row on the Accents & Languages table (German or Welsh)."],
      ["You can speak, read, and write Common and Under Lingo (clan tunnel speech).", "You can speak, read, and write Common and one settler language from your lineage's row on the Accents & Languages table (German or Welsh)."],
      ["You can speak, read, and write Common and Elvish (Old Neverwinter court speech).", "You can speak, read, and write Common and one settler language from your lineage's row on the Accents & Languages table (French or Latin)."],
      ["You can speak, read, and write Common and Court Lingo (the old court speech of Neverwinter).", "You can speak, read, and write Common and one settler language from your lineage's row on the Accents & Languages table (French or Latin)."],
      ["You can speak, read, and write Common and Halfling (hearth-cant).", "You can speak, read, and write Common and one settler language from your lineage's row on the Accents & Languages table (Irish Gaelic or Spanish)."],
      ["You can speak, read, and write Common and Hearth Lingo.", "You can speak, read, and write Common and one settler language from your lineage's row on the Accents & Languages table (Irish Gaelic or Spanish)."],
      ["You can speak, read, and write Common and Draconic (watch-cipher / company battle-tongue).", "You can speak, read, and write Common and one settler language from your lineage's row on the Accents & Languages table (German or Russian)."],
      ["You can speak, read, and write Common and Watch Lingo (watch-cipher / company battle-tongue).", "You can speak, read, and write Common and one settler language from your lineage's row on the Accents & Languages table (German or Russian)."],
      ["You can speak, read, and write Common and Gnomish (guild-cant).", "You can speak, read, and write Common and one settler language from your lineage's row on the Accents & Languages table (Cantonese, German, or Italian)."],
      ["You can speak, read, and write Common and Guild Lingo.", "You can speak, read, and write Common and one settler language from your lineage's row on the Accents & Languages table (Cantonese, German, or Italian)."],
      ["You can speak, read, and write Common, Elvish, and one extra language of your choice.", "You can speak, read, and write Common, one settler language from your lineage's row on the Accents & Languages table (Spanish or French), and one extra language of your choice."],
      ["You can speak, read, and write Common, Court Lingo, and one extra language of your choice.", "You can speak, read, and write Common, one settler language from your lineage's row on the Accents & Languages table (Spanish or French), and one extra language of your choice."],
      ["You can speak, read, and write Common and Orc (dock-cant / blood-cant).", "You can speak, read, and write Common and one settler language from your lineage's row on the Accents & Languages table (Swedish, Norwegian, or Dutch)."],
      ["You can speak, read, and write Common and Dock Lingo / Blood Lingo.", "You can speak, read, and write Common and one settler language from your lineage's row on the Accents & Languages table (Swedish, Norwegian, or Dutch)."],
      ["You can speak, read, and write Common and Infernal (brand-cant).", "You can speak, read, and write Common and one settler language from your lineage's row on the Accents & Languages table (Italian or Polish)."],
      ["You can speak, read, and write Common and Brand Lingo.", "You can speak, read, and write Common and one settler language from your lineage's row on the Accents & Languages table (Italian or Polish)."],
      ["You can speak, read, and write Infernal (brand-cant).", "You can speak, read, and write one extra language of your choice."],
      ["You can speak, read, and write Brand Lingo.", "You can speak, read, and write one extra language of your choice."]
    ];
    pairs.forEach(function (pair) {
      if (langs.indexOf(pair[0]) >= 0) langs = langs.split(pair[0]).join(pair[1]);
    });
    return langs;
  }
  function longGun22(w, round) {
    if (!w || !/\.22\s*lr/i.test(round || "")) return false;
    var g = String(w.group || "");
    return g === "rifle" || g === "carbine" || g === "caster";
  }
  function d4Pending(g) {
    return !!(g && g.pendingD4);
  }
  /** Gunsmithing › Capacity Upgrades rows that fit this gun -> list of capacities [base, step1, ...]. */
  var SKIPW = /^(Light|Medium|Heavy|Repeating|Rifles?|Carbines?|Saddle|Shotgun|Lever)$/;
  function capSteps(w) {
    if (!w || !w.capacity || !R.gunsmithing) return [];
    var hit = (R.gunsmithing.capacity || []).filter(function (r) {
      if (!/\d/.test(r.steps || "")) return false;
      var up = (r.upgrade || "").toLowerCase();
      if (/caster/.test(up) !== (w.group === "caster")) return false;
      if (/rifle/.test(up) && w.group !== "rifle") return false;
      if (/carbine/.test(up) && w.group !== "carbine") return false;
      if (/shotgun/.test(up) && w.group !== "shotgun") return false;
      return String(r.guns || "").split(/;|,| and /).some(function (tok) {
        var words = tok.replace(/\(.*?\)/g, "").trim().split(/\s+/).filter(function (x) { return x.length > 2 && /^[A-Z]/.test(x) && !SKIPW.test(x); });
        return words.length && words.every(function (x) { return w.name.indexOf(x) >= 0; });
      });
    })[0];
    if (!hit) return [];
    var costs = String(hit.cost_per_step || "").split("/").map(function (x) { return x.trim(); });
    return [{ cap: w.capacity, label: "Cap " + w.capacity + " (as built)" }].concat(String(hit.steps).split(",").map(function (x, i) {
      return { cap: num(x), label: "Cap " + num(x) + " (" + hit.upgrade + (costs[i] ? ", +" + costs[i] + " " + UNIT : "") + ")" };
    }));
  }
  function modsFor(w) {
    if (!w || !w.tiers || !R.gunsmithing) return [];
    return (R.gunsmithing.mods || []).filter(function (m) {
      if (/engraving and grips/i.test(m.name || "")) return false;
      var f = String(m.fits || "").toLowerCase(), g = w.group;
      if (/except the big fifty/.test(f) && g === "bigbore") return false;
      if (/rugged/.test(f) && /rugged/i.test(w.properties)) return false;
      if (/^any gun/.test(f)) return true;
      return (g === "pistol" && /pistol|revolver/.test(f)) || (g === "rifle" && /rifle/.test(f)) || (g === "carbine" && /carbine/.test(f)) || (g === "shotgun" && /shotgun/.test(f)) || (g === "bigbore" && /big fifty/.test(f));
    });
  }
  function firstTier(w) { if (!w || !w.tiers) return ""; for (var i = 0; i < TIERS.length; i++) if (w.tiers[TIERS[i]]) return TIERS[i]; return ""; }
  /** Schema 1 (v0.1, Sept 29 book) -> schema 2: renamed Callings, guns, caster guns, holsters. Unknown ids are kept (shown as "not in the current PHB"). */
  function upgradeV1(c, notes) {
    if (OLD_IDS.calling[c.calling]) { notes.push("Calling " + c.calling + " -> " + OLD_IDS.calling[c.calling]); c.calling = OLD_IDS.calling[c.calling]; }
    if (c.calling && CAL[c.calling] && c.subclass && !CAL[c.calling].subclasses.some(function (s) { return s.id === c.subclass; })) {
      var stem = String(c.subclass).split("-").slice(0, 3).join("-");
      var hit = CAL[c.calling].subclasses.filter(function (s) { return s.id.indexOf(stem) === 0 || (s.phb5e && c.subclass.indexOf(s.phb5e.toLowerCase().replace(/[^a-z0-9]+/g, "-")) >= 0); })[0];
      if (hit) { notes.push("Subclass " + c.subclass + " -> " + hit.id); c.subclass = hit.id; }
    }
    if (OLD_IDS.holster[c.holster]) { notes.push("Holster " + c.holster + " -> " + OLD_IDS.holster[c.holster]); c.holster = OLD_IDS.holster[c.holster]; }
    if (c.casterGun && OLD_IDS.weapon[c.casterGun]) { notes.push("Caster gun " + c.casterGun + " -> " + OLD_IDS.weapon[c.casterGun][0]); c.casterGun = OLD_IDS.weapon[c.casterGun][0]; }
    (c.guns || []).forEach(function (g) {
      var m = OLD_IDS.weapon[g.weapon];
      if (m) { notes.push("Gun " + g.weapon + " -> " + m[0] + " (" + m[1] + ")"); g.weapon = m[0]; g.tier = m[1]; }
      var w = WPN[g.weapon];
      if (w && w.tiers && !w.tiers[g.tier]) g.tier = firstTier(w);
      if (w && w.tiers) { var cc = chamberOf(g, w); g.chamber = cc.tier + "|" + cc.round; }
      if (w && w.capacity) g.loaded = Math.min(num(g.loaded), w.capacity);
      if (w && w.hexShells) { g.chambers = []; for (var k = 0; k < w.capacity; k++) g.chambers.push(k < num(g.loaded) ? "c" : ""); }
    });
    (c.ammo || []).forEach(function (a) {
      if (a.caliber === "12 gauge") a.caliber = "12 ga";
      if (a.type === "cartridge" && window.SSDNSApplied && window.SSDNSApplied.cartridgeTier) {
        var tier = window.SSDNSApplied.cartridgeTier(a.caliber);
        if (tier) a.caliber = tier;
      }
    });
  }

  // ------------------------------------------------------------------ state
  var S = {
    doc: null, handle: null, fileName: "", fileDirty: false, hasFile: false,
    lastLocal: null, lastFile: null, lastSnap: 0, writing: false, again: false, permNeeded: false, error: ""
  };
  var C = function () { return S.doc.character; };

  // ------------------------------------------------------------------ calculations (standard 5e only)
  function mod(score) { return Math.floor((num(score, 10) - 10) / 2); }
  function profBonus(level) { return Math.ceil(Math.max(1, Math.min(20, num(level, 1))) / 4) + 1; }
  function currentCalling() { return CAL[C().calling] || null; }
  function currentSubclass() { var c = currentCalling(); return c ? c.subclasses.filter(function (s) { return s.id === C().subclass; })[0] || null : null; }
  function casterInfo() {
    var c = currentCalling(), sc = currentSubclass();
    var lv = Math.max(1, num(C().level, 1));
    if (c && c.caster) {
      if (c.caster === "half" && lv < 2) return null;
      return { type: c.caster, ability: c.spellAbility, rest: c.hexLeadRest, from: c.name };
    }
    if (sc && sc.caster) return { type: sc.caster, ability: sc.spellAbility, rest: "long", from: sc.name + " (" + c.name + ")" };
    return null;
  }
  /** Known-list Callings vs prepared-list Callings (PHB / 5e twins). */
  var PREPARED_CASTERS = { "frontier-preacher": 1, "nature-guide": 1, "lawman": 1, "scholar": 1 };
  var ALIAS_BY_PHB = null;
  function aliasIndex() {
    if (ALIAS_BY_PHB) return ALIAS_BY_PHB;
    ALIAS_BY_PHB = {};
    (R.spellAliases || []).forEach(function (a) {
      if (!a.phb) return;
      var k = a.phb.toLowerCase();
      ALIAS_BY_PHB[k] = a;
      // also strip trailing " Shell" for Hexslinger list matching
      ALIAS_BY_PHB[k.replace(/\s+shell$/, "")] = a;
    });
    return ALIAS_BY_PHB;
  }
  /** Parse a spell-list entry like "Blade Ward (Galvanized)" or "Acid Splash Shell". */
  function parseSpellEntry(raw, level) {
    var t = String(raw || "").replace(/\s+/g, " ").trim().replace(/\.+$/, "");
    if (!t) return null;
    var shell = /\s+Shell$/i.test(t);
    var base = t.replace(/\s+Shell$/i, "").trim();
    var m = base.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
    var phb = m ? m[1].trim() : base;
    var alias = m ? m[2].trim() : "";
    var ax = aliasIndex()[phb.toLowerCase()];
    // PHB / aliases table uses "— (prints as 5e name)" when there is no frontier rename
    function realAlias(a) {
      a = String(a || "").trim();
      if (!a || a === "—" || /^—/.test(a) || /^-+$/.test(a) || /prints as 5e name/i.test(a)) return "";
      return a;
    }
    if (shell) alias = "";
    else {
      alias = realAlias(alias);
      if (!alias && ax) alias = realAlias(ax.alias);
    }
    var label = shell ? (phb + " Shell") : (alias ? phb + " (" + alias + ")" : phb);
    return { phb: phb, alias: alias, label: label, shell: shell, level: level, raw: t, key: (level + ":" + phb + (shell ? ":shell" : "")).toLowerCase() };
  }
  function callingSpellList(id) {
    id = id || (C().calling || "");
    return (R.spellLists && R.spellLists[id]) || null;
  }
  var SPELL_LEVEL_OF = null;
  function spellLevelOf(phb) {
    if (!SPELL_LEVEL_OF) {
      SPELL_LEVEL_OF = {};
      Object.keys(R.spellLists || {}).forEach(function (id) {
        var levels = (R.spellLists[id] || {}).levels || {};
        Object.keys(levels).forEach(function (lk) {
          (levels[lk] || []).forEach(function (raw) {
            var sp = parseSpellEntry(raw, num(lk, 0));
            if (sp && SPELL_LEVEL_OF[sp.phb.toLowerCase()] == null) SPELL_LEVEL_OF[sp.phb.toLowerCase()] = num(lk, 0);
          });
        });
      });
    }
    var k = String(phb || "").toLowerCase().replace(/\s+shell$/, "");
    return Object.prototype.hasOwnProperty.call(SPELL_LEVEL_OF, k) ? SPELL_LEVEL_OF[k] : null;
  }
  function callingCatalog(id) {
    var sl = callingSpellList(id);
    if (!sl || !sl.levels) return [];
    var out = [];
    Object.keys(sl.levels).forEach(function (lk) {
      var level = num(lk, 0);
      (sl.levels[lk] || []).forEach(function (raw) {
        var sp = parseSpellEntry(raw, level);
        if (sp) out.push(sp);
      });
    });
    return out;
  }
  function bonusCatalog() {
    var sl = callingSpellList();
    if (!sl || !sl.bonusLists) return [];
    var sc = currentSubclass();
    var scName = sc ? String(sc.name || "").toLowerCase() : "";
    var out = [];
    sl.bonusLists.forEach(function (b) {
      var bname = String(b.name || "").toLowerCase();
      var dark = /dark preacher/.test(bname);
      var match = scName && (scName.indexOf(bname) >= 0 || bname.indexOf(scName) >= 0);
      if (!match && !dark) return;
      (b.entries || []).forEach(function (en) {
        (en.spells || []).forEach(function (raw) {
          var parsed = parseSpellEntry(raw, 0);
          if (!parsed) return;
          var lvl = spellLevelOf(parsed.phb);
          out.push({
            phb: parsed.phb, alias: parsed.alias, label: parsed.label, shell: parsed.shell,
            level: lvl == null ? null : lvl, gainAt: en.atLevel, source: b.name,
            dmOnly: !!b.dmOnly, note: b.note || "", key: ("bonus:" + bname + ":" + parsed.phb).toLowerCase()
          });
        });
      });
    });
    return out;
  }
  function prepareMode() {
    var c = currentCalling(), sc = currentSubclass();
    var id = c ? c.id : "";
    if (PREPARED_CASTERS[id]) return "prepared";
    if (sc && sc.caster) return "prepared"; // Magician etc.
    if (c && c.caster) return "known";
    return null;
  }
  function preparedCap() {
    if (prepareMode() !== "prepared") return null;
    var cal = currentCalling();
    if (!cal) return null;
    var ab = String(cal.spellAbility || "WIS").toUpperCase();
    var score = num(C().abilities && C().abilities[ab], 10);
    var bonus = mod(score);
    var lv = Math.max(1, num(C().level, 1));
    if (cal.id === "lawman" || cal.caster === "half") return Math.max(1, bonus + Math.floor(lv / 2));
    return Math.max(1, bonus + lv);
  }
  /** Progression soft limits: cantrips + spells known (when the book lists them). */
  function spellLimits() {
    var c = currentCalling(), lv = Math.max(1, Math.min(20, num(C().level, 1)));
    var out = { cantrips: null, known: null, mode: prepareMode(), row: null };
    if (!c || !c.progression || !c.progression.columns) return out;
    var cols = c.progression.columns.map(function (x) { return String(x).toLowerCase(); });
    var row = null;
    c.progression.rows.forEach(function (r) {
      var n = parseInt(String(r[0]), 10);
      if (n === lv) row = r;
    });
    if (!row) return out;
    out.row = row;
    cols.forEach(function (col, i) {
      var v = String(row[i] || "").trim();
      if (v === "—" || v === "-" || v === "") return;
      if (col.indexOf("cantrip") === 0) out.cantrips = num(v);
      if (col.indexOf("spells known") === 0 || col === "spells known") out.known = num(v);
    });
    return out;
  }
  function knownCantrips() {
    return (C().cantrips || []).map(function (n, i) { return n ? { i: i, name: n, level: 0 } : null; }).filter(Boolean);
  }
  function knownSpellsAt(level) {
    return ((C().spells && C().spells[level]) || []).map(function (s, i) {
      return s && s.name ? { i: i, name: s.name, prepared: !!s.prepared, level: level } : null;
    }).filter(Boolean);
  }
  function ordinal(n) {
    var v = num(n, 0);
    if (v === 1) return "1st";
    if (v === 2) return "2nd";
    if (v === 3) return "3rd";
    return v + "th";
  }
  /** Cantrips on the sheet, plus prepared leveled spells (known casters keep every known spell). */
  function castChoices() {
    var mode = prepareMode();
    var out = [];
    knownCantrips().forEach(function (k) {
      out.push({ level: 0, name: k.name, value: "0:" + k.name });
    });
    var lv;
    for (lv = 1; lv <= 9; lv++) {
      knownSpellsAt(lv).forEach(function (s) {
        if (mode === "prepared" && !s.prepared) return;
        out.push({ level: lv, name: s.name, value: lv + ":" + s.name });
      });
    }
    return out;
  }
  function countKnown(level) {
    return level === 0 ? knownCantrips().length : knownSpellsAt(level).length;
  }
  function totalKnownSpells() {
    var n = 0;
    for (var l = 1; l <= 9; l++) n += countKnown(l);
    return n;
  }
  function spellAlreadyHave(labelOrPhb) {
    var needle = String(labelOrPhb || "").toLowerCase().replace(/\s+shell$/, "");
    function match(name, level) {
      var p = parseSpellEntry(name, level);
      if (!p) return false;
      var phb = p.phb.toLowerCase().replace(/\s+shell$/, "");
      return phb === needle || name.toLowerCase() === needle;
    }
    if (knownCantrips().some(function (k) { return match(k.name, 0); })) return true;
    for (var l = 1; l <= 9; l++) {
      if (knownSpellsAt(l).some(function (k) { return match(k.name, l); })) return true;
    }
    return false;
  }
  function addKnownSpell(sp) {
    if (!sp) return;
    if (sp.level == null) {
      var line = "Always prepared: " + sp.label + " (" + (sp.source || "subclass") + ", character level " + sp.gainAt + ").";
      var box = C().additionalFeatures || "";
      if (box.indexOf(sp.label) < 0) C().additionalFeatures = (box.trim() ? box.replace(/\s+$/, "") + "\n" : "") + line;
      changed();
      toast(sp.label + " isn't on the main list, so it's written under Additional Features.");
      return;
    }
    var label = sp.label;
    if (sp.level === 0) {
      var arr = C().cantrips;
      var slot = arr.findIndex(function (x) { return !x; });
      if (slot < 0) { arr.push(label); slot = arr.length - 1; }
      else arr[slot] = label;
    } else {
      if (!C().spells[sp.level]) C().spells[sp.level] = [];
      var list = C().spells[sp.level];
      var slot2 = list.findIndex(function (x) { return !x || !x.name; });
      var mode = prepareMode();
      var row = { name: label, prepared: mode === "known" || sp.gainAt != null }; // known casters stay ready; domain and oath spells are always prepared
      if (slot2 < 0) list.push(row); else list[slot2] = row;
    }
    warnSpellLimits();
    changed();
  }
  function removeKnownSpell(level, index) {
    if (level === 0) C().cantrips[index] = "";
    else if (C().spells[level] && C().spells[level][index]) { C().spells[level][index].name = ""; C().spells[level][index].prepared = false; }
    changed();
  }
  function warnSpellLimits() {
    var lim = spellLimits(), msgs = [];
    if (lim.cantrips != null && countKnown(0) > lim.cantrips) msgs.push("Cantrips " + countKnown(0) + "/" + lim.cantrips + " (over the progression table)");
    if (lim.known != null && totalKnownSpells() > lim.known) msgs.push("Spells known " + totalKnownSpells() + "/" + lim.known + " (over the progression table)");
    if (msgs.length) toast(msgs.join(". ") + ". The sheet warns but does not block — check with your DM.", null, null, 7000);
  }

  function hexTotals() {
    var t = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], ci = casterInfo(), lv = Math.max(1, Math.min(20, num(C().level, 1)));
    if (!ci) return t;
    var row = R.slots5e[ci.type] && R.slots5e[ci.type][lv - 1];
    if (!row) return t;
    if (ci.type === "pact") { t[row[1]] = row[0]; }
    else row.forEach(function (n, i) { t[i + 1] = n; });
    return t;
  }
  function wantedLineageAsi(c) {
    var Applied = window.SSDNSApplied;
    if (!Applied || !Applied.parseAsi) return { fixed: {}, choices: [] };
    var lin = LIN[c.lineage];
    var sub = lin && (lin.sublineages || []).filter(function (x) { return x.id === c.sublineage; })[0];
    var skipLine = sub && sub.id === "variant-human";
    var parts = skipLine ? [Applied.parseAsi(sub && sub.asi)] : [Applied.parseAsi(lin && lin.asi), Applied.parseAsi(sub && sub.asi)];
    var merged = Applied.mergeAsi ? Applied.mergeAsi(parts) : parts[0];
    var fixed = {};
    AB.forEach(function (a) { fixed[a] = (merged.fixed && merged.fixed[a]) || 0; });
    var picks = Array.isArray(c.asiChoice) ? c.asiChoice : [];
    var cursor = 0;
    (merged.choices || []).forEach(function (choice) {
      var n = 0;
      while (n < choice.count && cursor < picks.length) {
        var key = String(picks[cursor] || "").toUpperCase();
        cursor++;
        if (AB.indexOf(key) < 0) continue;
        fixed[key] = (fixed[key] || 0) + (choice.by || 0);
        n++;
      }
    });
    return { fixed: fixed, choices: merged.choices || [] };
  }
  function syncLineageAsi(c) {
    if (!c) return false;
    var want = wantedLineageAsi(c);
    var Applied = window.SSDNSApplied;
    if (!Applied || !Applied.applyAsiScores) return false;
    var next = Applied.applyAsiScores(c.abilities || {}, c.lineageAsi || {}, want.fixed);
    if (next.changed) c.abilities = Object.assign({}, c.abilities || {}, next.abilities);
    c.lineageAsi = want.fixed;
    return next.changed;
  }
  function rigBonus(hol, c) {
    var out = { init: 0, first: 0 };
    if (!hol || !c.holsterActive || hol.isRig === false) return out;
    var belt = /^belt rig/i.test(hol.perk || "");
    var pommel = /†/.test(hol.initText || "") || /pommel/i.test(hol.name || "");
    var cross = hol.id === "cross-draw-holster";
    // character.seated is the existing "Seated or driving" toggle.
    var posture = !!c.seated || !!c.mounted;
    if (pommel) { if (c.mounted) out.init = num(hol.initBonus); }
    else out.init = num(hol.initBonus);
    if (cross) { if (posture) out.first = num(hol.firstShot); }
    else if (belt) { if (!c.seated && !c.mounted) out.first = num(hol.firstShot); }
    else out.first = num(hol.firstShot);
    return out;
  }
  /* 0.3.69: the rig a gun is drawn from. Today a character has ONE holster (character.holster), so every
     gun reads it. The paper-doll PR adds Holster L/R (character.holster = L, holsterR, belt): swap only
     this helper to pick the side the gun sits on (gunIndex) and the first-shot math follows. */
  function holsterFor(c, gunIndex) {
    if (window.SSDNSHolsterFor) { try { var id = window.SSDNSHolsterFor(c, gunIndex); if (id !== undefined) return HOL[id] || null; } catch (e) {} }
    // Paper doll v2 (L/R): the gun's side picks the rig; no side reads the left holster as before.
    var side = gunIndex != null && window.SSDNSEquip && window.SSDNSEquip.pistolSide ? window.SSDNSEquip.pistolSide(c, gunIndex) : "";
    return HOL[c && (side === "R" ? c.holsterR : c.holster)] || null;
  }
  /* 0.3.69: Dust Fury (Rage) damage: +2 at levels 1-8, +3 at 9-15, +4 at 16-20. Melee only (callers pass melee rows). */
  function rageDamageBonus(c) {
    c = c || C();
    if (!c || !c.raging || c.calling !== "tribal-warrior") return 0;
    var lv = num(c.level, 1);
    return lv >= 16 ? 4 : (lv >= 9 ? 3 : 2);
  }
  /* 0.3.69: Muzzleloader Powder Hands: Tactical Reload with percussion revolvers and muzzleloaders
     (Ball n Cap, Rifle-Musket), overriding their TR flag. Never the Big Fifty. */
  function canTacticalReload(w, c) {
    if (!w) return false;
    if (w.tr) return true;
    c = c || C();
    if (!c || (c.feats || []).indexOf("muzzleloader") < 0) return false;
    if (/big-fifty/.test(String(w.id || ""))) return false;
    return /percussion|muzzleloader/i.test(String(w.action || ""));
  }
  /* 0.3.69: item bonuses that reach the roll. Hat of the Sharpshooter (+1 ranged attack while worn) comes
     from the paper doll; Old Henry's Rifle (+1 attack) marks the first Henrietta slot unless a slot is tagged. */
  function itemAtkBonus(c, g, gunIndex) {
    var out = [];
    var items = (c && Array.isArray(c.items)) ? c.items : [];
    var henry = items.filter(function (it) { return it && it.catalogId === "old-henrys-rifle"; })[0];
    if (henry && g && g.weapon === "henrietta-repeating-rifle") {
      var tagged = (c.guns || []).some(function (x) { return x && x.itemId === "old-henrys-rifle"; });
      var first = (c.guns || []).map(function (x) { return x && x.weapon; }).indexOf("henrietta-repeating-rifle");
      if (tagged ? g.itemId === "old-henrys-rifle" : first === gunIndex) out.push({ label: "Old Henry's Rifle", value: 1 });
    }
    return out;
  }
  /* 0.3.69: timed buffs (Eldorite Dust: +1d4 damage on one weapon for 1 hour). */
  function activeBuffs(c, key) {
    var now = Date.now();
    return ((c && Array.isArray(c.buffs)) ? c.buffs : []).filter(function (b) {
      return b && (!b.until || Number(b.until) > now) && (!key || !b.weapon || b.weapon === key);
    });
  }
  // ---- PR "small math gaps": feats and callings that change numbers on the sheet.
  function hasFeat(c, id) { return ((c && c.feats) || []).indexOf(id) >= 0; }
  function levelOf(c) { return Math.max(1, Math.min(20, num(c && c.level, 1))); }
  /** Hexslinger Demon Blood: Demon Hide (AC 13 + Dex unarmored, +1 HP per Hexslinger level). */
  function demonHide(c) { return !!c && c.calling === "hexslinger" && c.subclass === "demon-blood-draconic"; }
  /** Martial Artist Dust Runner (2nd lvl): +10 ft, scaling to +30 ft at 18th (5e Unarmored Movement steps). */
  function dustRunnerBonus(lv) {
    if (lv < 2) return 0;
    if (lv >= 18) return 30;
    if (lv >= 14) return 25;
    if (lv >= 10) return 20;
    if (lv >= 6) return 15;
    return 10;
  }
  function baseSpeed(c) {
    var lin = LIN[c.lineage];
    var sub = lin && (lin.sublineages || []).filter(function (s) { return s.id === c.sublineage; })[0];
    var sp = (sub && sub.speed) || (lin && lin.speed) || ((c.lineage || c.calling) ? 30 : "");
    return sp === "" ? "" : num(sp, 30);
  }
  /** Walking speed: lineage + calling + Mobile + slotted paper-doll gear. */
  function autoSpeed(c, DB) {
    c = c || C();
    var base = baseSpeed(c), parts = [], off = [];
    if (base === "") return { base: "", parts: parts, off: off, total: "" };
    var lv = levelOf(c), arm = ARM[c.armor];
    if (c.calling === "tribal-warrior" && lv >= 5 && !(arm && arm.category === "heavy")) parts.push({ label: "Fast Movement", value: 10 });
    if (c.calling === "martial-artist" && dustRunnerBonus(lv)) {
      // Jessey 2026-10-19: Dust Runner only with no armor and no shield (5e Unarmored Movement).
      var armored = !!(arm && arm.category !== "shield");
      var shielded = !!c.shield || !!(arm && arm.category === "shield");
      if (armored || shielded) off.push({ label: "Dust Runner", value: dustRunnerBonus(lv), why: armored && shielded ? "armor and shield" : (armored ? "armor" : "shield") });
      else parts.push({ label: "Dust Runner", value: dustRunnerBonus(lv) });
    }
    if (hasFeat(c, "mobile")) parts.push({ label: "Mobile", value: 10 });
    if (DB === undefined) DB = window.SSDNSDoll && window.SSDNSDoll.bonuses ? window.SSDNSDoll.bonuses(c) : null;
    if (DB && num(DB.speed)) parts.push({ label: "gear", value: num(DB.speed) });
    var total = base + parts.reduce(function (a, p) { return a + p.value; }, 0);
    return { base: base, parts: parts, off: off, total: Math.max(0, total) };
  }
  /**
   * Lowest d20 face that crits. opts: { weapon, melee, band, rangeApply }.
   * Champion Improved Critical 19-20 (3rd), Superior Critical 18-20 (15th): every weapon attack.
   * Pistolero Dead Eye 19-20: pistols, inside normal range (same gate as Steady Grip).
   */
  function critMin(opts) {
    opts = opts || {};
    var c = opts.character || C(), min = 20, lv = levelOf(c), w = opts.weapon || null;
    if (c && c.calling === "gunslinger" && c.subclass === "deadeye-champion-champion") {
      if (lv >= 15) min = 18; else if (lv >= 3) min = 19;
    }
    if (!opts.melee && w && w.group === "pistol" && hasFeat(c, "pistolero") && opts.rangeApply && opts.band !== "long" && opts.band !== "blocked") min = Math.min(min, 19);
    return min;
  }
  /** Sharpshooter (guns, bows) / Great Weapon Master (heavy melee): -5 attack, +10 damage when the toggle is on. */
  function powerAttack(c, kind, w, proficient) {
    c = c || C();
    if (!c || !c.powerAttack || proficient === false) return null;
    if (kind === "ranged" && hasFeat(c, "sharpshooter")) return { label: "Sharpshooter", atk: -5, dmg: 10 };
    if (kind === "melee" && hasFeat(c, "great-weapon-master") && w && /\bheavy\b/i.test(w.properties || "")) return { label: "Great Weapon Master", atk: -5, dmg: 10 };
    return null;
  }
  function compute() {
    var c = C(), v = {};
    syncLineageAsi(c);
    v.scores = {}; v.mods = {};
    AB.forEach(function (a) { v.scores[a] = num(c.abilities[a], 10); });
    // PHB Holsters, L and R (2026-10-19): each side is its own rig. Cross-Draw's first shot only while seated, mounted, or driving.
    // Pommel initiative only while mounted. Belt rigs lose the first-shot bonus while seated or mounted.
    // Initiative uses the best side (rigs don't stack); each side's first-shot bonus goes only to the pistol drawn from it.
    v.holsterDex = 0;
    var rigL = rigBonus(HOL[c.holster], c), rigR = rigBonus(HOL[c.holsterR], c);
    v.holsterInit = Math.max(rigL.init, rigR.init);
    v.holsterFirstL = rigL.first;
    v.holsterFirstR = rigR.first;
    v.holsterFirst = Math.max(rigL.first, rigR.first);
    // Paper doll (0.3.54): only slotted gear counts. Rigs don't stack; scores cap at 20.
    var DB = window.SSDNSDoll && window.SSDNSDoll.bonuses ? window.SSDNSDoll.bonuses(c) : null;
    v.doll = DB;
    if (DB) {
      AB.forEach(function (a) { if (DB.abilities[a]) v.scores[a] = window.SSDNSDoll.capped(v.scores[a], DB.abilities[a]); });
      if (DB.holsterDex) { v.holsterDex = DB.holsterDex; v.scores.DEX = window.SSDNSDoll.capped(v.scores.DEX, DB.holsterDex); }
      if (DB.holsterInit > v.holsterInit) v.holsterInit = DB.holsterInit;
    }
    AB.forEach(function (a) { v.mods[a] = mod(v.scores[a]); });
    v.prof = profBonus(c.level);
    v.saves = {}; AB.forEach(function (a) { v.saves[a] = v.mods[a] + (c.saveProf[a] ? v.prof : 0); });
    v.skills = {};
    R.skills.forEach(function (s) { var p = num(c.skillProf[s.name], 0); v.skills[s.name] = v.mods[s.ability] + p * v.prof; });
    v.passive = 10 + v.skills.Perception;
    v.passiveInv = 10 + (v.skills.Investigation || 0);
    if (hasFeat(c, "observant")) { v.passive += 5; v.passiveInv += 5; }
    v.initiative = v.mods.DEX + v.holsterInit;
    if (hasFeat(c, "alert")) v.initiative += 5;
    var arm = ARM[c.armor];
    var wearing = arm && arm.category !== "shield";
    if (wearing) {
      var cap = arm.dexCap;
      if (arm.category === "medium" && cap != null && cap > 0 && hasFeat(c, "medium-armor-master")) cap = 3;
      var dexAdd = cap === 0 ? 0 : Math.min(v.mods.DEX, cap == null ? v.mods.DEX : cap);
      v.ac = arm.base + dexAdd;
    }
    else if (c.calling === "tribal-warrior") v.ac = 10 + v.mods.DEX + v.mods.CON;
    else if (c.calling === "martial-artist" && !wearing) v.ac = 10 + v.mods.DEX + v.mods.WIS;
    else if (demonHide(c)) v.ac = 13 + v.mods.DEX;
    else v.ac = 10 + v.mods.DEX;
    if (c.shield && !(c.calling === "martial-artist" && !wearing) && !(DB && DB.shieldOff)) v.ac += 2;
    if (DB) { v.ac += DB.ac; v.initiative += DB.init; }
    if (c.fightingStyle === "point-blank" || (stylesOf(c).indexOf("point-blank") >= 0)) v.ac += 1;
    if (c.fightingStyle === "defense" && wearing) v.ac += 1;
    /* 0.3.74 (Jessey): Dual Wielder +1 AC while holding a qualifying weapon in each hand */
    v.dualWielderAc = window.SSDNSOffhand && window.SSDNSOffhand.dualWielderAc ? window.SSDNSOffhand.dualWielderAc(c) : 0;
    v.ac += v.dualWielderAc;
    var cal = currentCalling();
    v.hitDiceTotal = cal ? num(c.level, 1) + cal.hitDie : "";
    var ci = casterInfo();
    v.caster = ci;
    v.spellMod = ci ? v.mods[ci.ability] : null;
    v.spellDC = ci ? 8 + v.prof + v.spellMod : "";
    v.spellAtk = ci ? sign(v.prof + v.spellMod) : "";
    v.hex = hexTotals();
    v.cp = Bridge.cpValue(S.doc.shards); // ES total (1 ES per white shard)
    v.speed = autoSpeed(c, DB);
    v.guns = c.guns.map(function (g, i) { return gunStats(g, v, i); });
    return v;
  }
  function gunStats(g, v, gunIndex) {
    var gi = gunIndex;
    if (g && g.weapon && !WPN[g.weapon] && window.SSDNSCustomWeapons) window.SSDNSCustomWeapons.syncCharacter(C());
    var w = WPN[g.weapon];
    if (!w) return g.weapon ? { w: { id: g.weapon, name: g.weapon + " (not in the current PHB)", ammo: "" }, damage: "", range: "", capacity: 0, misfire: "", note: "This gun isn't in the current PHB. Pick its new name from the list.", atk: "", dmg: "", tier: "", rounds: [] } : null;
    var steps = capSteps(w), capUp = steps.filter(function (x) { return x.cap === num(g.capacity); })[0];
    var s = { w: w, capacity: capUp ? capUp.cap : (w.capacity || 0), note: "", tier: "", rounds: [] };
    var mod = (R.gunsmithing && R.gunsmithing.mods || []).filter(function (m) { return m.name === g.mod; })[0];
    s.mod = mod || null;
    if (w.tiers) {
      var ch = chamberOf(g, w), tier = ch.tier, t = w.tiers[tier] || {};
      s.tier = tier; s.rounds = (w.rounds && w.rounds[tier]) || []; s.round = ch.round;
      if (w.scatter) {
        var ld = t[g.load === "slug" ? "slug" : "buck"] || t.buck || t.slug || {};
        s.damage = ld.damage || ""; s.range = ld.range || ""; s.misfire = (t.slug && t.slug.misfire) || "";
      } else { s.damage = t.damage || t.raw || ""; s.range = t.range || ""; s.misfire = t.misfire || ""; }
      if (w.rifleRounds && ch.round && w.rifleRounds[ch.round]) {
        var rr = w.rifleRounds[ch.round];
        if (rr.damage) s.damage = rr.damage;
        if (rr.range) s.range = rr.range;
        if (rr.misfire) s.misfire = rr.misfire;
        s.unwieldy = !!rr.unwieldy;
      }
      if (longGun22(w, ch.round)) {
        s.damage = "1d4";
        s.range = "10/30";
        s.misfire = "1–4";
      }
      if (g.dirty && w.dirtyMisfire) s.misfire = w.dirtyMisfire;
      s.dmgType = w.scatter && g.load !== "slug" ? "piercing (cone)" : "piercing";
    } else {
      s.damage = w.damage; s.range = w.range; s.misfire = w.misfire; s.dmgType = String(w.dmgType || "").toLowerCase();
    }
    var notes = [];
    if (w.category === "martial" || w.category === "simple" || w.category === "caster") notes.push(w.category);
    if (s.unwieldy) notes.push("unwieldy");
    if (g.engraving) notes.push("engraving and grips (not a mod slot)");
    if (w.action) notes.push(w.action + (w.load ? " · " + w.load : ""));
    if (w.slow) notes.push("slow load: reload takes a full turn");
    if (w.tr) notes.push("TR ✓");
    else if (canTacticalReload(w)) notes.push("TR ✓ (Powder Hands)");
    if (w.scatter && g.load !== "slug") notes.push("buckshot: 15-ft cone");
    var m;
    if (w.ability === "SPELL") {
      m = v.mods.CHA; // plain rounds: the Caster Gun uses your spellcasting ability (PHB: Caster Guns, Spellcasting (Cha))
      s.atk = sign(m + (g.proficient ? v.prof : 0));
      s.parts = [{ label: "CHA", value: m }];
      if (g.proficient) s.parts.push({ label: "proficiency", value: v.prof || 0 });
      /* 0.3.69: a gun's magic bonus counts in the shown number and the damage, not only the roll parts */
      var castMagic = (g.magic != null && isFinite(Number(g.magic)) && Number(g.magic)) ? Number(g.magic) : (Number(w.magic) || 0);
      if (castMagic) {
        s.parts.push({ label: "magic", value: castMagic });
        s.atk = sign(m + (g.proficient ? v.prof : 0) + castMagic);
      }
      s.dmgParts = m ? [{ label: "CHA", value: m }] : [];
      if (castMagic) s.dmgParts.push({ label: "magic", value: castMagic });
      var paC = powerAttack(C(), "ranged", w, !!g.proficient);
      if (paC) {
        s.atk = sign(m + (g.proficient ? v.prof : 0) + castMagic + paC.atk);
        s.parts.push({ label: paC.label, value: paC.atk });
        s.dmgParts.push({ label: paC.label, value: paC.dmg });
        s.power = paC;
        notes.push(paC.label + " −5/+10");
      }
      s.dmgType = s.dmgType || "piercing";
      var castDmg = m + castMagic + (paC ? paC.dmg : 0);
      s.dmg = s.damage + (castDmg ? " " + sign(castDmg) : "") + " piercing";
      notes.push("hex lead shells: spell attack " + (v.caster ? v.spellAtk : "—"));
      s.note = notes.join(" · ");
      return s;
    }
    var ability = w.ability || "DEX";
    if (w.heavyChambered && s.tier === "heavy") ability = w.heavyChambered;
    m = ability === "STR/DEX" ? Math.max(v.mods.STR, v.mods.DEX) : (ability === "STR" ? v.mods.STR : v.mods.DEX);
    var style = styleAttackBonus(w);
    var dmgStyle = styleDamageBonus(w);
    var side = gi != null && window.SSDNSEquip && window.SSDNSEquip.pistolSide ? window.SSDNSEquip.pistolSide(C(), gi) : "";
    var sideFirst = side === "L" ? num(v.holsterFirstL) : (side === "R" ? num(v.holsterFirstR) : num(v.holsterFirst));
    var first = (sideFirst && w.group === "pistol") ? sideFirst : 0;
    if (mod && /hair trigger/i.test(mod.name) && w.group === "pistol") first = Math.min(2, first + 1); // PHB: counts toward the rig's +2 first-shot cap
    if (mod) notes.push("mod: " + mod.name);
    /* 0.3.69: per-gun magic (g.magic) wins over the weapon's own; both now count in the shown number and damage */
    var magicAtk = (g.magic != null && isFinite(Number(g.magic)) && Number(g.magic)) ? Number(g.magic) : (Number(w.magic) || 0);
    var itemParts = itemAtkBonus(C(), g, gunIndex);
    var hat = (v.doll && v.doll.rangedAtk) || 0;
    if (hat) itemParts.push({ label: "Hat of the Sharpshooter", value: hat });
    var itemAtk = 0;
    itemParts.forEach(function (p) { itemAtk += p.value; });
    var pa = powerAttack(C(), "ranged", w, !!g.proficient);
    s.power = pa;
    s.atk = sign(m + (g.proficient ? v.prof : 0) + style + magicAtk + itemAtk + (pa ? pa.atk : 0));
    var abilityLabel = ability === "STR/DEX" ? (v.mods.STR >= v.mods.DEX ? "STR" : "DEX") : ability;
    var styleLabels = { "long-gun": "Long Gun", archery: "Archery", sidearm: "Sidearm", dueling: "Dueling" };
    var styleHit = stylesOf(C()).filter(function (one) { return styleAttackBonusFor(one, w) || styleDamageBonusFor(one, w); })[0] || (C() && C().fightingStyle);
    var styleLabel = styleLabels[styleHit] || "style";
    s.parts = [{ label: abilityLabel, value: m }];
    if (g.proficient) s.parts.push({ label: "proficiency", value: v.prof || 0 });
    if (style) s.parts.push({ label: styleLabel, value: style });
    if (magicAtk) s.parts.push({ label: "magic", value: magicAtk });
    itemParts.forEach(function (p) { s.parts.push(p); });
    if (pa) s.parts.push({ label: pa.label, value: pa.atk });
    /* 0.3.69: the rig / Hair trigger first-shot bonus is a real roll part until the first pistol shot of a combat */
    s.first = first;
    if (first && !C().firstShotSpent) s.parts.push({ label: "first shot", value: first });
    s.dmgParts = [];
    if (m) s.dmgParts.push({ label: abilityLabel, value: m });
    if (dmgStyle) s.dmgParts.push({ label: styleLabel, value: dmgStyle });
    if (style) notes.push((styleHit || "style") + " " + sign(style));
    if (dmgStyle) notes.push((styleHit || "style") + " damage " + sign(dmgStyle));
    s.firstShot = first; s.drawSide = side;
    if (first) notes.push(C().firstShotSpent ? "first shot of this combat used" : ("first shot from the rig " + sign(m + (g.proficient ? v.prof : 0) + style + magicAtk + itemAtk + (pa ? pa.atk : 0) + first)));
    var dmgMod = m + dmgStyle + magicAtk + (pa ? pa.dmg : 0);
    if (magicAtk) s.dmgParts.push({ label: "magic", value: magicAtk });
    if (pa) { s.dmgParts.push({ label: pa.label, value: pa.dmg }); notes.push(pa.label + " −5/+10"); }
    var buffDice = activeBuffs(C(), "gun:" + gunIndex).map(function (b) { return b.dmgDice; }).filter(Boolean);
    s.buffDice = buffDice;
    s.dmg = s.damage ? s.damage + (dmgMod ? " " + sign(dmgMod) : "") + buffDice.map(function (d) { return " +" + d; }).join("") + " " + (s.dmgType || "") : "";
    s.note = notes.join(" · ");
    return s;
  }

  // ------------------------------------------------------------------ static option lists
  function opt(v, t, extra) { return el("option", Object.assign({ value: v, text: t }, extra || {})); }
  function fillSelect(sel, items, blank) {
    sel.innerHTML = "";
    if (blank !== undefined) sel.appendChild(opt("", blank));
    items.forEach(function (it) {
      if (it.group) {
        var g = el("optgroup", { label: it.group });
        it.items.forEach(function (x) { g.appendChild(opt(x[0], x[1])); });
        sel.appendChild(g);
      } else sel.appendChild(opt(it[0], it[1]));
    });
  }
  function buildStaticLists() {
    fillSelect($("#selCalling"), R.callings.map(function (c) { return [c.id, c.name]; }), "Calling…");
    fillSelect($("#selLineage"), R.lineages.map(function (l) { return [l.id, l.name]; }), "Lineage…");
    fillSelect($("#selBackground"), R.backgrounds.map(function (b) { return [b.id, b.name]; }), "Background…");
    var armGroups = ["light", "medium", "heavy"].map(function (cat) {
      return { group: cat[0].toUpperCase() + cat.slice(1) + " armor", items: R.armor.filter(function (a) { return a.category === cat; }).map(function (a) {
        var label = a.name + " (" + a.ac + ")";
        if (a.phb5e && a.phb5e !== a.name) label += " · " + a.phb5e;
        return [a.id, label];
      }) };
    });
    fillSelect($("#selArmor"), armGroups, "None (10 + Dex)");
    // 2026-10-19: Holster L and Holster R pick rigs on their own; the belt / bandolier has its own picker.
    var rigRows = R.holsters.filter(function (h) { return h.isRig; }).map(function (h) { return [h.id, h.name + (h.initText && h.initText !== "—" ? " · Init " + h.initText : "") + (h.firstShotText && h.firstShotText !== "—" ? " · 1st shot " + h.firstShotText : "") + (window.SSDNSEquip && window.SSDNSEquip.isPairHolster && window.SSDNSEquip.isPairHolster(h) ? " · fills L + R" : "")]; });
    fillSelect($("#selHolster"), rigRows, "No holster");
    if ($("#selHolsterR")) fillSelect($("#selHolsterR"), rigRows, "No holster");
    if ($("#selBelt")) fillSelect($("#selBelt"), R.holsters.filter(function (h) { return !h.isRig; }).map(function (h) { return [h.id, h.name]; }), "No belt");
    fillCasterGunSelect();
    fillSelect($("#selFeatAdd"), R.feats.map(function (f) { return [f.id, f.name + (f.prereq ? " *" : "")]; }), "+ Add a feat…");
    var gl = $("#gearList");
    var gear = [];
    R.gear.forEach(function (g) { gear.push(g.name + " (" + g.phb5e + ")"); });
    R.packs.forEach(function (p) { gear.push(p.name + " (" + p.phb5e + ")"); });
    R.tools.forEach(function (t) { gear.push(t.phb5e + " (" + t.note + ")"); });
    R.ammo.forEach(function (a) { gear.push(a.name); });
    R.mounts.forEach(function (m) { gear.push(m.name + " (" + m.phb5e + ")"); });
    (R.frontierGear || []).forEach(function (g) { gear.push(g.name + (g.cost ? " · " + g.cost + " ES" : "") + " (frontier)"); });
    ((R.explosives && R.explosives.items) || []).forEach(function (g) { gear.push(g.name + (g.cost ? " · " + g.cost + " ES" : "") + " (explosive)"); });
    ((R.storytellerGear && R.storytellerGear.accessories) || []).forEach(function (g) { gear.push(g.name + " · " + g.cost + " ES (Storyteller)"); });
    ((R.storytellerGear && R.storytellerGear.instruments) || []).forEach(function (g) {
      if (g.id === "voice" || g.id === "piano") gear.push(g.name + " (Storyteller Calling instrument)");
      else gear.push(g.name + " · quality " + g.costQuality + " / cheap " + g.costCheap + " ES (Storyteller instrument)");
    });
    gear.forEach(function (g) { gl.appendChild(opt(g, "")); });
    fillSelect($("#selInstrument"), ((R.storytellerGear && R.storytellerGear.instruments) || []).map(function (g) { return [g.id, g.name]; }), "Instrument…");
    var kitSel = $("#selKitCrosswalk");
    if (kitSel) {
      kitSel.innerHTML = "";
      kitSel.appendChild(opt("", "Starting kit crosswalk…"));
      ((R.kitCrosswalk && R.kitCrosswalk.crosswalk) || []).forEach(function (k, i) {
        kitSel.appendChild(opt(String(i), k.old + " → " + k.frontier));
      });
    }
    var dl = el("datalist", { id: "spellAliases" });
    R.spellAliases.forEach(function (s) { if (!s.alias || s.alias === "—") return; dl.appendChild(el("option", { value: s.alias, label: s.phb + (s.level === 0 ? " · cantrip" : "") })); });
    document.body.appendChild(dl);
    var cl = el("datalist", { id: "caliberList" });
    CALIBERS.forEach(function (c) { cl.appendChild(opt(c, "")); });
    document.body.appendChild(cl);
    var wl = $("#wildList");
    R.wildSpark.forEach(function (w) { wl.appendChild(el("li", { text: w.text })); });
    $("#appVersion").textContent = "v" + APP_VERSION;
  }
  function isHexslinger() { return !!(S.doc && C().calling === "hexslinger"); }
  function slotWord() {
    var id = S.doc ? C().calling : "";
    if (id === "hexslinger") return "Hex Lead";
    if (id === "pact-seeker") return "Pact slots";
    return "Spell slots";
  }
  function isMeleeWeapon(w) { return /melee/.test(String(w && w.group || "")); }
  function styleReady() {
    var c = C();
    if (!c) return false;
    var lv = num(c.level, 1);
    if (c.calling === "gunslinger") return lv >= 1;
    if (c.calling === "lawman" || c.calling === "frontier-scout") return lv >= 2;
    return false;
  }
  /* 0.3.73: a character's fighting styles: the first, plus a Gunslinger's Additional Gun Style at 10th */
  function stylesOf(c) {
    if (!c) return [];
    var out = [];
    if (c.fightingStyle) out.push(c.fightingStyle);
    if (c.calling === "gunslinger" && num(c.level, 1) >= 10 && c.fightingStyle2 && c.fightingStyle2 !== c.fightingStyle) out.push(c.fightingStyle2);
    return out;
  }
  function hasStyle(c, id) {
    c = c || C();
    if (!c || !id) return false;
    var lv = num(c.level, 1);
    var ready = c.calling === "gunslinger" ? lv >= 1 : ((c.calling === "lawman" || c.calling === "frontier-scout") ? lv >= 2 : false);
    if (id === "two-gun" && c.calling !== "gunslinger" && c.calling !== "frontier-scout") return false; /* not Lawman (L0183) */
    return ready && stylesOf(c).indexOf(id) >= 0;
  }
  function styleAttackBonus(w, opts) {
    var sts = stylesOf(C());
    if (sts.length > 1) return sts.reduce(function (t, one) { return t + styleAttackBonusFor(one, w, opts); }, 0);
    return styleAttackBonusFor(sts[0] || "", w, opts);
  }
  function styleAttackBonusFor(st, w, opts) {
    if (!w || !st || !styleReady()) return 0;
    var g = String(w.group || "");
    var longGun = g === "rifle" || g === "carbine" || g === "bigbore";
    var bow = g === "bow" || /bow/.test(g);
    if (st === "long-gun" && longGun) return 2;
    /* 0.3.74 (DND Bot): Archery is +2 with ALL ranged weapons: pistols, shotguns, long guns, bows, thrown. */
    if (st === "archery" && (bow || longGun || !isMeleeWeapon(w) || (opts && opts.thrown))) return 2;
    return 0;
  }
  function styleDamageBonus(w) {
    var sts = stylesOf(C());
    if (sts.length > 1) return sts.reduce(function (t, one) { return t + styleDamageBonusFor(one, w); }, 0);
    return styleDamageBonusFor(sts[0] || "", w);
  }
  function styleDamageBonusFor(st, w) {
    if (!w || !st || !styleReady()) return 0;
    /* 0.3.74 (Jessey): Sidearm Duelling is "+2 damage single iron": off while holding two weapons */
    if (st === "sidearm" && w.group === "pistol") return (window.SSDNSOffhand && window.SSDNSOffhand.wieldingTwo && window.SSDNSOffhand.wieldingTwo(C())) ? 0 : 2;
    if (st === "dueling" && isMeleeWeapon(w) && !/two-handed/i.test(w.properties || "")) return 2;
    return 0;
  }
  function fiveEName(w) {
    var name = String(w && w.name || "");
    var m = name.match(/\(([^)]+)\)/);
    return (m ? m[1] : name).toLowerCase();
  }
  function callingProficient(w) {
    var cal = currentCalling();
    if (!w || !cal || !cal.weaponProf) return false;
    var prof = String(cal.weaponProf).toLowerCase();
    var name = String(w.name || "").toLowerCase();
    if (w.hexShells || w.group === "caster") return /caster guns?/.test(prof);
    if (/plinker/.test(name) && /plinker/.test(prof)) return true;
    if (/herringer/.test(name) && /herringer/.test(prof)) return true;
    if (/ball/.test(name) && /cap/.test(name) && /ball n cap/.test(prof)) return true;
    if (/cavalry saber/.test(name) && /cavalry saber/.test(prof)) return true;
    if ((/bowie/.test(name)) && /bowie/.test(prof)) return true;
    if ((/fencing|sword cane/.test(name) || /\brapier\b/.test(fiveEName(w))) && /fencing/.test(prof)) return true;
    var meleeOnly = /\bmelee\b/.test(prof);
    var both = /simple\s*(and|&)\s*martial/.test(prof);
    var simple = both || /\bsimple weapons\b/.test(prof);
    var cat = String(w.category || "").toLowerCase();
    var melee = isMeleeWeapon(w);
    if (!(meleeOnly && !melee)) {
      if (cat === "simple" && simple) return true;
      if (cat === "martial" && both && melee) return true;
      if (cat === "martial" && both && !meleeOnly) return true;
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
  function fillCasterGunSelect() {
    var sel = $("#selCasterGun");
    if (!sel || !S.doc) return;
    var id = C().calling;
    sel.hidden = id !== "hexslinger";
    var gunLab = document.querySelector("label[for='selCasterGun']");
    if (gunLab) gunLab.hidden = id !== "hexslinger";
    var cur = C().casterGun || sel.value || "";
    var items = [];
    if (id === "hexslinger") {
      R.casterGuns.forEach(function (g) { items.push([g.id, g.name]); });
      items.push(["ordinary-firearm", "Ordinary firearm (disadvantage)"]);
    }
    if (id === "pact-seeker") items.push(["borrowed-iron", "Borrowed Iron (Pact Seeker pact focus)"]);
    items.push(["other", "Other / none"]);
    fillSelect(sel, items, "Caster gun…");
    if (cur && !items.some(function (it) { return it[0] === cur; })) cur = "";
    if (!cur && id === "pact-seeker") cur = "borrowed-iron";
    sel.value = cur;
    if (id === "pact-seeker" && C().casterGun !== "borrowed-iron" && cur === "borrowed-iron") C().casterGun = "borrowed-iron";
  }
  function gunOptions(sel) {
    var groups = [
      ["Pistols", R.firearms.filter(function (f) { return f.group === "pistol"; })],
      ["Shotguns", R.firearms.filter(function (f) { return f.group === "shotgun"; })],
      ["Carbines", R.firearms.filter(function (f) { return f.group === "carbine"; })],
      ["Rifles", R.firearms.filter(function (f) { return f.group === "rifle"; })],
      ["Big bore", R.firearms.filter(function (f) { return f.group === "bigbore"; })],
      ["Bows & thrown", R.otherRanged]
    ];
    if (isHexslinger()) groups.splice(5, 0, ["Caster guns (Hexslinger only)", R.casterGuns]);
    groups = groups.map(function (g) { return { group: g[0], items: g[1].map(function (w) { return [w.id, w.name + (w.cost && w.tiers ? " · " + w.cost + (/\d/.test(w.cost) ? " " + UNIT : "") : "")]; }) }; });
    fillSelect(sel, groups, "Pick a gun…");
  }

  // ------------------------------------------------------------------ dynamic blocks (built once)
  function chk(path, label, cls) {
    var i = el("input", { type: "checkbox", "data-f": path, "aria-label": label, title: label });
    return el("label", { class: "cb " + (cls || "") }, [i, el("span", { class: "cb-box" })]);
  }
  function d20Btn(key, label) {
    return el("button", { type: "button", class: "d20", "data-d20": key, title: "Roll d20 " + label, "aria-label": "Roll " + label }, ["d20"]);
  }
  function buildAbilities() {
    var box = $("#abilities");
    R.abilities.forEach(function (a) {
      box.appendChild(el("div", { class: "abil", "data-ab": a.id }, [
        el("div", { class: "abil-name", text: a.name, title: a.frontier }),
        el("div", { class: "abil-mod", "data-out": "mod." + a.id, text: "+0" }),
        d20Btn("abil." + a.id, a.name),
        el("input", { type: "number", min: "1", max: "30", class: "abil-score", "data-f": "character.abilities." + a.id, "aria-label": a.name + " score", inputmode: "numeric" }),
        el("div", { class: "abil-note", "data-out": "abnote." + a.id })
      ]));
    });
  }
  function buildSavesSkills() {
    var sv = $("#saves");
    R.abilities.forEach(function (a) {
      sv.appendChild(el("div", { class: "row" }, [chk("character.saveProf." + a.id, a.name + " save proficiency"),
        d20Btn("save." + a.id, a.name + " save"),
        el("input", { class: "calc sm", "data-calc": "save." + a.id, "aria-label": a.name + " save" }), el("span", { class: "row-name", text: a.name })]));
    });
    var sk = $("#skills");
    R.skills.forEach(function (s) {
      sk.appendChild(el("div", { class: "row" }, [
        el("button", { type: "button", class: "prof3", "data-skill": s.name, title: "Tap: proficient → expertise → none", "aria-label": s.name + " proficiency" }),
        d20Btn("skill." + s.name, s.name),
        el("input", { class: "calc sm", "data-calc": "skill." + s.name, "aria-label": s.name }),
        el("span", { class: "row-name", html: esc(s.name) + " <small>(" + s.ability.slice(0, 1) + s.ability.slice(1).toLowerCase() + ")</small>" })]));
    });
  }
  function buildChecks() {
    var ig = $("#inspGrid");
    for (var i = 0; i < 10; i++) ig.appendChild(chk("character.partyInspiration." + i, "Party inspiration point " + (i + 1), "gem"));
    for (var j = 0; j < 3; j++) {
      $("#dsSuccess").appendChild(chk("character.deathSaves.success." + j, "Death save success " + (j + 1)));
      $("#dsFail").appendChild(chk("character.deathSaves.fail." + j, "Death save failure " + (j + 1), "bad"));
    }
  }
  function buildGuns() {
    var box = $("#guns");
    for (var i = 0; i < 4; i++) {
      var sel = el("select", { "data-f": "character.guns." + i + ".weapon", "data-gun": i, "aria-label": "Gun " + (i + 1) });
      gunOptions(sel);
      var chamber = el("select", { "data-f": "character.guns." + i + ".chamber", class: "chamber-sel", "aria-label": "Chambered round (tier)", title: "Chambered round: the tier and round this gun fires (PHB: Chambering)" });
      var load = el("select", { "data-f": "character.guns." + i + ".load", class: "load", "aria-label": "Shell load" }, [opt("buck", "Buckshot"), opt("slug", "Slug")]);
      var modSel = el("select", { "data-f": "character.guns." + i + ".mod", class: "mod-sel", "aria-label": "Gunsmith modification", title: "Gunsmithing: one modification slot" });
      var capSel = el("select", { "data-f": "character.guns." + i + ".capacity", class: "cap-sel", "aria-label": "Capacity upgrade", title: "Gunsmithing: capacity upgrades (one step at a time)" });
      var ammoSel = el("select", { class: "ammo-pool", "data-ammopool": i, "aria-label": "Ammo for this gun" });
      var hexSel = el("select", { class: "hex-lvl", "data-hexlvl": i, "aria-label": "Hex lead shell level" }, [1, 2, 3, 4, 5, 6, 7, 8, 9].map(function (l) { return opt(String(l), l + (l === 1 ? "st" : l === 2 ? "nd" : l === 3 ? "rd" : "th")); }));
      box.appendChild(el("div", { class: "gun", "data-row": i }, [
        el("div", { class: "g-card-top" }, [
          el("div", { class: "g-photo", title: "Firearm photo later" }, ["Photo"]),
          el("div", { class: "g-name" }, [
            /* 0.3.75 compact card: the gunsmith mod and capacity selects share the weapon-name row */
            el("div", { class: "g-namerow" }, [sel, modSel, capSel]),
            el("div", { class: "g-stats" }, [
              el("div", { class: "g-atk", "data-label": "Atk" }, [el("input", { class: "calc", "data-calc": "gunAtk." + i, "aria-label": "Attack bonus" })]),
              el("div", { class: "g-dmg", "data-label": "Damage" }, [el("input", { class: "calc", "data-calc": "gunDmg." + i, "aria-label": "Damage" })]),
              el("div", { class: "g-rng", "data-label": "Range", "data-out": "rng." + i }),
              el("div", { class: "g-cap", "data-label": "Cap.", "data-out": "cap." + i })
            ]),
            el("div", { class: "g-sub" }, [
              chamber, load,
              el("span", { class: "g-cal", "data-out": "cal." + i }),
              el("label", { class: "tiny equip-toggle", "data-equip-wrap": "gun:" + i, title: "Equipped weapons can attack, reload, and show on the map." }, [el("input", { type: "checkbox", "data-equip": "gun", "data-equip-i": String(i), "aria-label": "Gun " + (i + 1) + " equipped" }), " Equipped"]),
              el("label", { class: "tiny" }, [el("input", { type: "checkbox", "data-f": "character.guns." + i + ".proficient" }), " prof."]),
              el("label", { class: "tiny", title: "Engraving and grips. It does not use the modification slot." }, [el("input", { type: "checkbox", "data-f": "character.guns." + i + ".engraving" }), " engraving"]),
              /* 0.3.75: ADV / DIS ticks (mutually exclusive; neither = normal). They drive the hidden [data-adv] select, same state. */
              el("span", { class: "g-advdis", title: "Advantage or disadvantage. Both dice in the misfire range fouls the gun." }, [
                el("label", { class: "tiny adv-tick" }, [el("input", { type: "checkbox", "data-advtick": i, value: "adv", "aria-label": "Advantage" }), " Adv"]),
                el("label", { class: "tiny dis-tick" }, [el("input", { type: "checkbox", "data-advtick": i, value: "dis", "aria-label": "Disadvantage" }), " Dis"]),
                el("select", { class: "adv-sel", "data-adv": i, hidden: "hidden", "aria-hidden": "true", tabindex: "-1", "aria-label": "Advantage or disadvantage" }, [opt("", "—"), opt("adv", "Adv"), opt("dis", "Dis")])
              ])
            ])
          ])
        ]),
        el("div", { class: "g-chamber-row" }, [
          el("div", { class: "chambers", "data-chambers": i }),
          el("span", { class: "g-count", "data-out": "left." + i }),
          el("button", { type: "button", class: "btn sm reload", "data-reload": i, title: "Reload: an action, fills the gun (slow guns: a full turn). Uses the ammo selected on this card." }, ["Reload"]),
          el("button", { type: "button", class: "btn sm", "data-unload": i, title: "Unload: put the chambered rounds back in your ammo, by type" }, ["Unload"]),
          ammoSel,
          /* 0.3.75: Roll / Melee share the cylinder row (wraps on narrow cards) */
          el("span", { class: "g-rollbtns" }, [
            el("button", { type: "button", class: "btn sm", "data-gunroll": i, title: "Plain attack. Never spends a spell slot. A natural roll in the gun's misfire range jams it. Dirty misfires on at least 1–2." }, ["Roll"]),
            el("button", { type: "button", class: "btn sm", "data-gunmelee": i, title: "Melee with the gun. Always proficient. No ammo and no misfire." }, ["Melee"]),
            el("span", { class: "g-gunmelee fine", "data-out": "gmelee." + i })
          ])
        ]),
        el("div", { class: "g-smith" }, [el("button", { type: "button", class: "btn xs", "data-rechamber": i, hidden: "hidden", title: "Pay a gunsmith to change the chambered round: 500 ES per tier step" }, ["Rechamber (gunsmith)"])]),
        el("div", { class: "g-actions" }, [
          el("button", { type: "button", class: "btn sm tr", "data-tr": i, title: "Tactical Reload: bonus action, load one round from a gun belt or bandolier (TR ✓ guns only)" }, ["TR +1"]),
          el("span", { class: "hexload", "data-hexwrap": i }, [hexSel, el("button", { type: "button", class: "btn sm hexbtn", "data-hexload": i, title: "Load one hex shell of this level. Loading spends the slot. Fire it later as a spell attack." }, ["+ Hex shell"])]),
          el("span", { class: "cast-through", "data-castwrap": i }, [
            el("select", { class: "cast-spell", "data-castspell": i, "aria-label": "Spell to cast through this gun" }),
            el("select", { class: "cast-slot", "data-castslot": i, "aria-label": "Shell or slot level", hidden: true }),
            el("button", { type: "button", class: "btn sm castbtn", "data-cast": i, title: "Cast the spell you picked. A cantrip spends nothing. A Hexslinger shell was spent when you loaded it. A natural 1 on a shell is a wild spark, not a jam." }, ["Cast through gun"]),
            el("details", { class: "spell-more", "data-castabout": i }, [el("summary", { text: "About" }), el("p", { class: "spell-desc" })])
          ]),
          el("span", { class: "g-mis", "data-label": "Misfire" }, [
            el("span", { "data-out": "mis." + i }),
            el("span", { class: "gun-status", "data-out": "gst." + i }),
            el("label", { class: "tiny jam" }, [el("input", { type: "checkbox", "data-f": "character.guns." + i + ".jammed", disabled: "disabled" }), " jammed"]),
            el("label", { class: "tiny jam" }, [el("input", { type: "checkbox", "data-f": "character.guns." + i + ".fouled", disabled: "disabled" }), " fouled"]),
            el("label", { class: "tiny jam" }, [el("input", { type: "checkbox", "data-f": "character.guns." + i + ".dirty", disabled: "disabled" }), " dirty"]),
            el("label", { class: "tiny jam", "data-lockup": i }, [
              el("input", { type: "checkbox", "data-lockup-box": i, disabled: "disabled", "aria-label": "Locked up" }),
              " LOCKED UP ×",
              el("span", { "data-lockup-n": i, text: "0" })
            ]),
            el("button", { type: "button", class: "btn xs", "data-clean": i, title: "Pick a clean before anything changes. Dirty: 10 minutes with gunsmith's tools or a gun cleaning kit. That removes Dirty and resets the streak. Jammed: Unjam, no check. Fouled stays until a gunsmith: pay a gunsmith 500 ES and a day (gunsmith repair, 500 ES and a day). The sheet does not clear Fouled." }, ["Clean"]),
            el("button", { type: "button", class: "btn xs", "data-unjam": i, hidden: "hidden", title: "Clear a jam. Bonus action, or a free action with Rugged, Smoothed, or the Muzzleloader feat." }, ["Unjam"]),
            el("button", { type: "button", class: "btn xs", "data-reopen": i, hidden: "hidden", title: "Muzzleloader feat. An action. Clears one locked chamber. Once per short rest." }, ["Reopen chamber"])
          ])
        ]),
        el("div", { class: "load-picks", "data-loadpick": i }),
        el("div", { class: "g-note fine", "data-out": "note." + i })
      ]));
    }
  }
  function buildShards() {
    [$("#shards")].forEach(function (box) {
      SHARDS.forEach(function (s) {
        box.appendChild(el("div", { class: "shard shard-" + s.id }, [
          el("span", { class: "gem", "aria-hidden": "true" }),
          el("span", { class: "shard-name", text: s.color }),
          el("input", { type: "number", min: "0", "data-f": "shards." + s.id, "aria-label": s.color + " shards", inputmode: "numeric" }),
          el("span", { class: "shard-val", text: "= " + s.equals })
        ]));
      });
      box.appendChild(el("div", { class: "shard-total", "data-out": "cpTotal" }));
    });
    var head = el("div", { class: "shards-title", text: "Eldorite Shards" });
    var actions = el("div", { class: "shard-actions" }, [
      el("output", { class: "es-total", "data-out": "esTotal", text: "0 ES" }),
      el("select", { id: "consumeColor", "aria-label": "Shard to consume" }, SHARDS.map(function (s) {
        return el("option", { value: s.id, text: s.color + " (" + s.equals + ")" });
      })),
      el("button", { type: "button", class: "btn sm", id: "btnConsume" }, ["Consume"])
    ]);
    $("#shards").insertBefore(head, $("#shards").firstChild);
    $("#shards").appendChild(actions);
  }
  function buildSpellGrid() {
    var g = $("#spellGrid"); g.innerHTML = "";
    for (var l = 0; l <= 9; l++) {
      var blk = el("div", { class: "sp-level" + (l === 0 ? " cantrips" : ""), "data-level": l });
      var head = el("div", { class: "sp-head" }, [el("div", { class: "sp-num", text: String(l) })]);
      if (l === 0) head.appendChild(el("div", { class: "sp-title" }, [el("b", { text: "Cantrips" }), el("small", { text: "at-will · no shell, no chamber" })]));
      else head.appendChild(el("div", { class: "sp-slots" }, [
        el("div", { class: "sp-total" }, [el("span", { class: "slot-word", text: "Spell slots" }), el("input", { class: "calc sm", "data-calc": "hex." + l, "aria-label": "Level " + l + " slots" })]),
        el("div", { class: "checkgrid hexgrid", "data-hex": l })]));
      blk.appendChild(head);
      blk.appendChild(el("div", { class: "sp-lines", "data-spell-lines": l }));
      g.appendChild(blk);
    }
    for (var h = 1; h <= 9; h++) {
      var hg = $('[data-hex="' + h + '"]');
      for (var b = 0; b < MAX_BOXES; b++) hg.appendChild(chk("character.hexLead." + h + "." + b, "Level " + h + " slot/hex lead " + (b + 1) + " spent", "hexbox"));
    }
  }
  var pickerLevel = "all";
  function renderSpellbook() {
    var ci = casterInfo();
    var empty = $("#spellbookEmpty"), bar = $("#spellbookBar"), grid = $("#spellGrid"), picker = $("#spellPicker");
    if (!ci) {
      if (empty) {
        empty.hidden = false;
        var ep = empty.querySelector("p");
        var scn = currentSubclass();
        var breath = scn && /tong hatchet|kung fu/i.test(scn.name || "");
        var copy = window.SSDNSCreator && window.SSDNSCreator.spellPageCopy
          ? window.SSDNSCreator.spellPageCopy(C().calling, scn && scn.name)
          : null;
        if (ep) ep.innerHTML = breath
          ? "<b>Breath Coins.</b> " + esc(scn.name) + " casts with Breath Coins, not spell slots. Track those with your DM."
          : ("<b>No spell slots.</b> " + esc(String((copy && copy.empty) || "This Calling doesn't use a spellbook.").replace(/^No spell slots\.\s*/, "")));
      }
      if (bar) bar.hidden = true;
      if (picker) picker.hidden = true;
      if (grid) grid.hidden = true;
      return;
    }
    if (empty) empty.hidden = true;
    if (bar) bar.hidden = false;
    if (grid) grid.hidden = false;
    var lim = spellLimits(), mode = lim.mode;
    var limEl = $("#spellLimits");
    if (limEl) {
      var bits = [];
      bits.push(mode === "prepared" ? "Prepared caster (mark what you have ready today)" : "Spells known (from your Calling list)");
      var capN = preparedCap();
      if (capN) {
        var readyN = 0;
        for (var pr = 1; pr <= 9; pr++) readyN += knownSpellsAt(pr).filter(function (s) { return s.prepared; }).length;
        bits.push("Prepared " + readyN + "/" + capN);
      }
      if (lim.cantrips != null) bits.push("Cantrips " + countKnown(0) + "/" + lim.cantrips);
      if (lim.known != null) bits.push("Spells known " + totalKnownSpells() + "/" + lim.known);
      else if (mode === "prepared") bits.push("Prepared: tick what you readied after the last long rest");
      var over = (lim.cantrips != null && countKnown(0) > lim.cantrips) || (lim.known != null && totalKnownSpells() > lim.known);
      limEl.textContent = bits.join(" · ");
      limEl.classList.toggle("warn", !!over);
    }
    var q = (($("#spellSearch") && $("#spellSearch").value) || "").trim().toLowerCase();
    for (var l = 0; l <= 9; l++) {
      var box = $('[data-spell-lines="' + l + '"]');
      if (!box) continue;
      box.innerHTML = "";
      var rows = l === 0 ? knownCantrips() : knownSpellsAt(l);
      var shown = 0;
      rows.forEach(function (row) {
        var parsed = parseSpellEntry(row.name, l) || { phb: row.name, alias: "", label: row.name };
        var hay = (parsed.label + " " + parsed.phb + " " + parsed.alias).toLowerCase();
        if (q && hay.indexOf(q) < 0) return;
        shown++;
        var line = el("div", { class: "sp-line known" });
        if (l > 0 && mode === "prepared") {
          line.appendChild(chk("character.spells." + l + "." + row.i + ".prepared", "Prepared"));
        } else if (l > 0 && mode === "known") {
          line.appendChild(el("span", { class: "fine", text: "known" }));
        }
        var lab = el("div", { class: "sp-label" });
        if (parsed.alias) {
          lab.appendChild(el("div", { class: "sp-alias", text: parsed.alias }));
          lab.appendChild(el("div", { class: "sp-phb", text: parsed.phb + (parsed.shell && l > 0 ? " · Shell" : "") }));
        } else {
          lab.appendChild(el("div", { class: "sp-alias", text: parsed.phb }));
          if (parsed.shell && l > 0) lab.appendChild(el("div", { class: "sp-phb", text: "Shell" }));
        }
        var diceNote = spellDiceNote(parsed.phb || row.name);
        if (diceNote) lab.appendChild(el("div", { class: "sp-phb", text: diceNote }));
        var aboutKnown = spellDetails(parsed.phb || row.name);
        if (aboutKnown) lab.appendChild(aboutKnown);
        line.appendChild(lab);
        // keep a hidden data-f so save still has the name if edited elsewhere
        line.appendChild(el("input", { type: "hidden", "data-f": l === 0 ? ("character.cantrips." + row.i) : ("character.spells." + l + "." + row.i + ".name"), value: row.name }));
        line.appendChild(el("button", { type: "button", class: "btn xs", "data-spell-cast": l + ":" + row.name, "aria-label": "Cast " + parsed.label, title: "Cast " + parsed.label }, ["Cast"]));
        line.appendChild(el("button", { type: "button", class: "btn xs ghost", "data-spell-del": l + ":" + row.i, "aria-label": "Remove " + parsed.label, title: "Remove" }, ["×"]));
        box.appendChild(line);
        // sync checkbox prepared state
        if (l > 0 && mode === "prepared") {
          var cb = line.querySelector('input[type=checkbox]');
          if (cb) cb.checked = !!row.prepared;
        }
      });
      if (!shown) {
        box.appendChild(el("p", { class: "fine", text: q ? "No matches in your known list." : (l === 0 ? "No cantrips yet — tap + Add from list." : "No level-" + l + " spells yet.") }));
      }
    }
    if (picker && !picker.hidden) fillSpellPicker();
  }
  function spellDiceNote(name) {
    var Cast = window.SSDNSSpellCast;
    if (!Cast || !Cast.blurb) return "";
    return Cast.blurb(name) || "";
  }
  function spellReadout(name) {
    var Cast = window.SSDNSSpellCast;
    if (!Cast || !Cast.describe) return "";
    var v = compute();
    return Cast.describe(name, { spellDC: v.spellDC, spellAtk: v.spellAtk, level: (C() && C().level) || 1 });
  }
  function spellDetails(name) {
    var text = spellReadout(name);
    if (!text) return null;
    var d = el("details", { class: "spell-more" });
    var sum = el("summary", { text: "About" });
    var p = el("p", { class: "spell-desc", text: text });
    d.appendChild(sum);
    d.appendChild(p);
    d.addEventListener("click", function (ev) { ev.stopPropagation(); });
    return d;
  }
  function fillSpellPicker() {
    var list = $("#spellPickerList"), levels = $("#spellPickerLevels");
    if (!list || !levels) return;
    levels.innerHTML = ""; list.innerHTML = "";
    var cat = callingCatalog();
    var lim = spellLimits();
    var haveLevels = {};
    cat.forEach(function (sp) { haveLevels[sp.level] = true; });
    var mk = function (lab, val) {
      var b = el("button", { type: "button", class: "btn sm" + (String(pickerLevel) === String(val) ? " on" : ""), "data-pick-level": String(val) }, [lab]);
      levels.appendChild(b);
    };
    mk("All", "all");
    Object.keys(haveLevels).map(Number).sort(function (a, b) { return a - b; }).forEach(function (lv) {
      mk(lv === 0 ? "Cantrips" : ("L" + lv), lv);
    });
    var q = (($("#spellSearch") && $("#spellSearch").value) || "").trim().toLowerCase();
    var n = 0;
    cat.forEach(function (sp) {
      if (pickerLevel !== "all" && String(sp.level) !== String(pickerLevel)) return;
      var hay = (sp.label + " " + sp.phb + " " + sp.alias).toLowerCase();
      if (q && hay.indexOf(q) < 0) return;
      var have = spellAlreadyHave(sp.phb);
      var btn = el("button", { type: "button", class: "spell-pick" + (have ? " have" : ""), "data-add-spell": sp.key, role: "option" });
      btn._spell = sp;
      btn.appendChild(el("span", { class: "sp-name", text: sp.alias ? (sp.alias + " · " + sp.phb) : sp.phb }));
      var dice = spellDiceNote(sp.phb || sp.label);
      btn.appendChild(el("span", { class: "sp-meta", text: (sp.level === 0 ? "Cantrip" : ("Level " + sp.level)) + (sp.shell && sp.level > 0 ? " · Shell" : "") + (dice ? " · " + dice : "") + (have ? " · already known" : "") }));
      var pickRow = el("div", { class: "spell-pick-row" });
      pickRow.appendChild(btn);
      var aboutPick = spellDetails(sp.phb || sp.label);
      if (aboutPick) pickRow.appendChild(aboutPick);
      list.appendChild(pickRow);
      n++;
    });
    bonusCatalog().forEach(function (sp) {
      if (pickerLevel !== "all" && sp.level != null && String(sp.level) !== String(pickerLevel)) return;
      var hay = (sp.label + " " + sp.phb + " " + sp.source).toLowerCase();
      if (q && hay.indexOf(q) < 0) return;
      var have = spellAlreadyHave(sp.phb);
      var btn = el("button", { type: "button", class: "spell-pick" + (have ? " have" : ""), "data-add-spell": sp.key, role: "option" });
      btn._spell = sp;
      var when = "always prepared · character level " + sp.gainAt;
      if (sp.dmOnly) when = sp.source + " · DM says so · " + when;
      else when = sp.source + " · " + when;
      if (sp.level == null) when += " · not on the main list";
      btn.appendChild(el("span", { class: "sp-name", text: (sp.alias ? (sp.alias + " · " + sp.phb) : sp.phb) }));
      var bonusDice = spellDiceNote(sp.phb || sp.label);
      btn.appendChild(el("span", { class: "sp-meta", text: when + (bonusDice ? " · " + bonusDice : "") + (have ? " · already known" : "") }));
      var bonusRow = el("div", { class: "spell-pick-row" });
      bonusRow.appendChild(btn);
      var aboutBonus = spellDetails(sp.phb || sp.label);
      if (aboutBonus) bonusRow.appendChild(aboutBonus);
      list.appendChild(bonusRow);
      n++;
    });
    if (!n) list.appendChild(el("p", { class: "fine", text: "No spells match. Try another filter." }));
  }
  function openSpellPicker() {
    if (!casterInfo()) { toast("Pick a casting Calling first."); return; }
    if (!callingSpellList()) { toast("No spell list in the rules data for this Calling."); return; }
    pickerLevel = "all";
    $("#spellPicker").hidden = false;
    fillSpellPicker();
  }

  function buildGames() {

    var games = [
      { name: "Whiskey Bend Blackjack", path: "games/blackjack/index.html" },
      { name: "Dust Wheel (roulette, 0–12)", path: "games/roulette/index.html" },
      { name: "Oscar Slots", path: "games/slot-machine/index.html" }
    ];
    var box = $("#gameList");
    games.forEach(function (g) {
      box.appendChild(el("div", { class: "game" }, [
        el("b", { text: g.name }),
        el("span", { class: "fine", text: "Plays with this character's shards (1 chip = 1 ES)" }),
        el("a", { class: "btn sm", href: g.path, target: "_blank", rel: "opener", title: "Opens in a new tab; wins and losses update your shards here" }, ["Open"])
      ]));
    });
  }

  // ------------------------------------------------------------------ dependent dropdowns
  function refreshSubLists() {
    var c = C();
    var lin = LIN[c.lineage];
    var subs = lin && lin.sublineages ? lin.sublineages : [];
    var ss = $("#selSublineage");
    fillSelect(ss, subs.map(function (s) { return [s.id, s.name]; }), subs.length ? "Sublineage…" : "—");
    ss.disabled = !subs.length;
    ss.hidden = !subs.length;
    var linLab = document.querySelector("label[for='selLineage']");
    if (linLab) linLab.textContent = subs.length ? "Lineage · Sublineage" : "Lineage";
    var cal = CAL[c.calling];
    var sc = $("#selSubclass");
    fillSelect(sc, cal ? cal.subclasses.filter(function (s) { return !s.dmOnly || c.subclass === s.id; }).map(function (s) {
      var tag = "";
      if (!(s.features && s.features.length) && !s.dmOnly) tag = " (no PHB features yet)";
      return [s.id, s.name + (s.phb5e ? " (" + s.phb5e + ")" : "") + tag];
    }) : [], cal ? (cal.subclasses[0] && cal.subclasses[0].group ? cal.subclasses[0].group + "…" : "Subclass…") : "Pick a Calling first");
    if (cal) sc.querySelectorAll("option").forEach(function (o) {
      var sub = cal.subclasses.filter(function (s) { return s.id === o.value; })[0];
      if (sub && sub.dmOnly && c.subclass !== sub.id) o.disabled = true;
    });
    sc.disabled = !cal;
  }

  // ------------------------------------------------------------------ render
  var suppress = false;
  function setField(e, v) {
    if (e.type === "checkbox") e.checked = !!v;
    else if (e.tagName === "OUTPUT") e.textContent = v == null ? "" : v;
    else {
      if ((e.tagName === "INPUT" || e.tagName === "TEXTAREA" || e.tagName === "SELECT") && document.activeElement === e) return;
      var s = v == null ? "" : String(v); if (e.value !== s) e.value = s;
    }
  }
  function renderFields() {
    suppress = true;
    refreshSubLists();
    $$("[data-f]").forEach(function (e) { setField(e, getPath(S.doc, e.getAttribute("data-f"))); });
    $$("[data-mirror]").forEach(function (e) { e.textContent = getPath(S.doc, e.getAttribute("data-mirror")) || ""; });
    $$("[data-img]").forEach(function (box) {
      var src = getPath(S.doc, box.getAttribute("data-img")), img = $("img", box);
      if (src) { img.src = src; img.hidden = false; box.classList.add("has"); } else { img.removeAttribute("src"); img.hidden = true; box.classList.remove("has"); }
    });
    $$("[data-portrait-url]").forEach(function (inp) {
      if (document.activeElement === inp) return;
      var src = getPath(S.doc, inp.getAttribute("data-portrait-url")) || "";
      inp.value = /^data:/i.test(src) ? "" : src;
    });
    suppress = false;
    renderCalc();
    if (window.SSDNSItems && window.SSDNSItems.paintSheet) window.SSDNSItems.paintSheet();
    if (window.SSDNSDoll && window.SSDNSDoll.paint) window.SSDNSDoll.paint();
  }
  function out(key, text) { $$('[data-out="' + key + '"], [data-calc-out="' + key + '"]').forEach(function (e) { e.textContent = text; }); }
  function calcValue(key, v) {
    var p = key.split(".");
    switch (p[0]) {
      case "profBonus": return sign(v.prof);
      case "passive": return v.passive;
      case "passiveInv": return v.passiveInv;
      case "ac": return v.ac;
      case "initiative": return sign(v.initiative);
      case "hitDiceTotal": return v.hitDiceTotal;
      case "save": return sign(v.saves[p[1]]);
      case "skill": return sign(v.skills[p.slice(1).join(".")]);
      case "spellDC": return v.spellDC;
      case "spellAtk": return v.spellAtk;
      case "hex": return v.hex[num(p[1])] || "";
      case "gunAtk": return v.guns[num(p[1])] ? v.guns[num(p[1])].atk : "";
      case "gunDmg": return v.guns[num(p[1])] ? v.guns[num(p[1])].dmg : "";
    }
    return "";
  }
  function hasOv(c, k) { return Object.prototype.hasOwnProperty.call(c.overrides, k) && c.overrides[k] !== ""; }
  /**
   * Auto speed = lineage base + Fast Movement / Dust Runner / Mobile + gear.
   * A typed speed (speedAuto false) always wins. A legacy saved speed that matches
   * neither the base nor the last auto value is treated as hand-typed and kept.
   */
  function ensureSpeed() {
    var c = C();
    if (!c || c.speedAuto === false) return;
    var a = autoSpeed(c);
    if (a.total === "") return;
    var cur = String(c.speed == null ? "" : c.speed).trim();
    var auto = cur === "" || cur === String(a.base) || (c.speedAutoValue != null && cur === String(c.speedAutoValue));
    if (!auto) return;
    c.speedAutoValue = a.total;
    if (cur !== String(a.total)) c.speed = a.total;
    var speedEl = document.querySelector("[data-f='character.speed']");
    if (speedEl) {
      if (document.activeElement !== speedEl) speedEl.value = c.speed;
      var offTxt = (a.off || []).map(function (o) { return " " + o.label + " +" + o.value + " is off (" + o.why + " on)."; }).join("");
      speedEl.title = (a.parts.length || offTxt) ? "Speed " + a.base + " ft" + a.parts.map(function (p) { return " + " + p.value + " " + p.label; }).join("") + " = " + a.total + " ft." + offTxt + " Type a number to override." : "";
    }
  }
  function renderCalc() {
    ensureSpeed();
    // Melee Atk/Dmg, Two hands grip, and the Sharpshooter/GWM toggle follow feats, shield, and scores.
    if (window.SSDNSPlaytest && window.SSDNSPlaytest.paintMath) { try { window.SSDNSPlaytest.paintMath(); } catch (e) { console.warn("[SSDNS] paintMath", e); } }
    var wild = document.querySelector("details.box.wild");
    if (wild) wild.hidden = C().calling !== "hexslinger";
    var c = C();
    var asiBumped = syncLineageAsi(c);
    if (asiBumped) {
      AB.forEach(function (a) {
        var el = document.querySelector("[data-f='character.abilities." + a + "']");
        if (!el || document.activeElement === el) return;
        el.value = c.abilities[a] == null ? "" : String(c.abilities[a]);
      });
      if (c.hpAuto !== false) applyAutoHp();
      changed({ noRender: true, quiet: true });
    }
    var v = compute();
    $$("[data-calc]").forEach(function (e) {
      var k = e.getAttribute("data-calc"), auto = calcValue(k, v), has = hasOv(c, k);
      e.classList.toggle("overridden", has);
      e.title = has ? "Your value (auto: " + auto + "). Double-click to go back to auto." : "Calculated automatically. Type to override.";
      e.placeholder = String(auto);
      if (document.activeElement !== e) e.value = has ? c.overrides[k] : auto;
    });
    AB.forEach(function (a) {
      out("mod." + a, sign(v.mods[a]));
      var note = "";
      if (a === "DEX" && v.holsterDex) note = "holster → " + v.scores.DEX;
      out("abnote." + a, note);
    });
    $$("[data-skill]").forEach(function (b) {
      var p = num(c.skillProf[b.getAttribute("data-skill")], 0);
      b.className = "prof3 p" + p; b.setAttribute("aria-pressed", p ? "true" : "false");
    });
    var callKey = c.calling || "";
    $$("[data-gun]").forEach(function (sel) {
      var i = num(sel.getAttribute("data-gun"));
      var cur = (c.guns[i] || {}).weapon || "";
      if (sel.getAttribute("data-built-for") !== callKey) {
        gunOptions(sel);
        sel.setAttribute("data-built-for", callKey);
      }
      var testOpt = sel.querySelector("option[data-test-gun]");
      var testGun = cur && window.SSDNSTestJammer && window.SSDNSTestJammer.lookup ? window.SSDNSTestJammer.lookup(cur) : null;
      if (testGun) {
        if (!testOpt) sel.appendChild(el("option", { value: testGun.id, text: testGun.name + " · TEST", "data-test-gun": "1" }));
      } else if (testOpt) {
        testOpt.parentNode.removeChild(testOpt);
      }
      var cwOpt = sel.querySelector("option[data-custom-gun]");
      var cwGun = cur && WPN[cur] && WPN[cur].custom ? WPN[cur] : null;
      if (cwGun) {
        if (!cwOpt || cwOpt.value !== cwGun.id) {
          if (cwOpt) cwOpt.parentNode.removeChild(cwOpt);
          sel.appendChild(el("option", { value: cwGun.id, text: cwGun.name + " · created", "data-custom-gun": "1" }));
        }
      } else if (cwOpt) {
        cwOpt.parentNode.removeChild(cwOpt);
      }
      var dmOpt = sel.querySelector("option[data-dm-gun]");
      var dmGun = cur && window.SSDNSPeaceMaker && window.SSDNSPeaceMaker.lookup ? window.SSDNSPeaceMaker.lookup(cur) : null;
      if (dmGun) {
        if (!dmOpt) sel.appendChild(el("option", { value: dmGun.id, text: dmGun.name + " · DM", "data-dm-gun": "1" }));
      } else if (dmOpt) {
        dmOpt.parentNode.removeChild(dmOpt);
      }
      if (document.activeElement !== sel && sel.value !== cur) sel.value = cur;
    });
    fillCasterGunSelect();
    c.guns.forEach(function (g, i) {
      var s = v.guns[i], row = $('.gun[data-row="' + i + '"]'), w = s && s.w;
      if (!row) return;
      var photo = row && row.querySelector(".g-photo");
      if (row && window.SSDNSWeaponArt) window.SSDNSWeaponArt.paint(photo, w || null);
      var crossed = !!(g.ruined || g.broken || g.exploded);
      if (photo) photo.classList.toggle("gun-x", crossed);
      row.classList.toggle("empty", !s);
      row.classList.toggle("is-shotgun", !!(w && w.scatter));
      row.classList.toggle("is-caster", !!(w && w.hexShells));
      row.classList.toggle("jammed", !!g.jammed);
      ["jammed", "fouled", "dirty"].forEach(function (flag) {
        var box = row.querySelector('[data-f="character.guns.' + i + '.' + flag + '"]');
        if (box && document.activeElement !== box) box.checked = !!g[flag];
        if (box) box.disabled = true;
        /* 0.3.75: an active condition chip is highlighted (auto-set, so disabled, but never dimmed) */
        var chip = box && box.closest("label");
        if (chip) { chip.setAttribute("data-cond", flag); chip.classList.toggle("on", !!g[flag]); }
      });
      var lockN = window.SSDNSMisfire && window.SSDNSMisfire.lockupCount
        ? window.SSDNSMisfire.lockupCount(g)
        : (Array.isArray(g.lockedChambers) ? g.lockedChambers.length : 0);
      var lockBox = row.querySelector('[data-lockup-box="' + i + '"]');
      var lockNum = row.querySelector('[data-lockup-n="' + i + '"]');
      if (lockBox) {
        lockBox.checked = lockN > 0;
        lockBox.disabled = true;
      }
      if (lockNum) lockNum.textContent = String(lockN);
      var lockChip = row.querySelector('[data-lockup="' + i + '"]');
      if (lockChip) { lockChip.setAttribute("data-cond", "lockup"); lockChip.classList.toggle("on", lockN > 0); }
      /* 0.3.75: Dirty / Fouled / Jammed / locked show once, as their highlighted chips; the status text keeps the rest */
      var statusBits = [];
      if (g.ruined || g.broken) statusBits.push("Ruined");
      if (Number(g.misStreak)) statusBits.push("misfires " + g.misStreak);
      if (g.pendingD4) statusBits.push("d4 pending");
      out("gst." + i, statusBits.join(" · "));
      if (hasGunBelt() || !canTacticalReload(w)) row.classList.remove("tr-warn");
      var cs = row.querySelector(".chamber-sel");
      if (cs.getAttribute("data-for") !== (g.weapon || "")) {
        cs.setAttribute("data-for", g.weapon || "");
        fillSelect(cs, w && w.tiers ? chamberOptions(w) : []);
      }
      cs.hidden = !(w && w.tiers);
      var ms = row.querySelector(".mod-sel"), ps = row.querySelector(".cap-sel");
      if (ms.getAttribute("data-for") !== (g.weapon || "")) {
        ms.setAttribute("data-for", g.weapon || ""); ps.setAttribute("data-for", g.weapon || "");
        fillSelect(ms, modsFor(w).map(function (m) { return [m.name, m.name + " (" + m.cost + " " + UNIT + ")"]; }), "No mod");
        fillSelect(ps, capSteps(w).map(function (x, k) { return [k ? String(x.cap) : "", x.label]; }));
      }
      ms.hidden = !(w && modsFor(w).length); ps.hidden = !(w && capSteps(w).length);
      ms.value = g.mod || ""; ps.value = g.capacity ? String(g.capacity) : "";
      ms.title = s && s.mod ? s.mod.effect : "Gunsmithing: one modification slot";
      if (w && w.tiers) {
        var cc = chamberOf(g, w);
        var storedTier = String(g.chamber || "").split("|")[0];
        if (storedTier && !w.tiers[storedTier]) { g.chamber = cc.tier + "|" + cc.round; g.tier = cc.tier; }
        cs.value = cc.tier + "|" + cc.round;
      }
      out("rng." + i, s ? s.range : "");
      out("cap." + i, s && s.capacity ? s.capacity : (s ? "—" : ""));
      out("mis." + i, s ? misfireLabel(s.misfire, g.dirty) : "");
      out("cal." + i, s ? (w.hexShells ? "any cartridge + hex lead" : (w.ammo === "percussion" ? "powder & ball" : (w.tiers ? "" : (w.caliber || "")))) : "");
      out("note." + i, s ? s.note : "");
      var ch = $('[data-chambers="' + i + '"]');
      ch.innerHTML = "";
      var cap = s ? Math.min(s.capacity || 0, 15) : 0;
      var shells = cap && w ? normChambers(g, w) : null;
      var nextK = shells ? shells.findIndex(Boolean) : -1;
      if (cap && window.SSDNSAmmoDisplay && window.SSDNSAmmoDisplay.enabled()) {
        window.SSDNSAmmoDisplay.mount(ch, {
          name: w && w.name,
          action: w && w.action,
          weapon: g.weapon,
          ammoDisplay: g.ammoDisplay,
          tier: w && w.tiers ? chamberOf(g, w).tier : "",
          ammo: w && w.ammo,
          group: w && w.group,
          scatter: !!(w && w.scatter),
          load: g.load,
          cap: cap,
          chambers: shells || undefined,
          loaded: shells ? undefined : num(g.loaded),
          jammed: !!g.jammed,
          locked: g.lockedChambers || [],
          size: "gear",
          next: nextK,
          label: function (k) {
            var parsed = parseChamber(shells ? shells[k] : "");
            return parsed && parsed.kind === "hex" ? String(parsed.level) : "";
          },
          attrs: function (k) { return { "data-fire": String(i), "data-k": String(k) }; }
        });
      } else for (var k = 0; k < cap; k++) {
        var st = shells ? shells[k] : "";
        var parsed = parseChamber(st);
        var hex = parsed && parsed.kind === "hex";
        var lockedDot = chamberLocked(g, k);
        var color = chamberColor(st, g, w);
        var label = lockedDot ? "Locked" : chamberLabel(st, g, w);
        var btn = el("button", {
          type: "button",
          class: "chamber" + (lockedDot ? " locked" : (st ? " loaded" : "")) + (hex ? " hex" : "") + (k === nextK ? " next" : ""),
          "data-fire": i, "data-k": k, text: lockedDot ? "X" : (hex ? parsed.level : ""),
          "aria-label": (lockedDot ? "Locked" : (label || "Empty")) + " · chamber " + (k + 1) + (k === nextK ? " · next under the hammer" : ""),
          title: lockedDot ? "Locked chamber" : (label ? (label + (k === nextK ? " · next" : "") + (hex ? " · Cast through gun" : " · tap to fire")) : "Empty")
        });
        if (st && hex) {
          btn.classList.add("tinted");
          if (color) btn.style.setProperty("--case", color);
        } else if (st && isSpecialChamber(st)) {
          btn.classList.add("tinted");
          if (color) btn.style.setProperty("--case", color);
        } else if (st) btn.classList.add("brass");
        ch.appendChild(btn);
      }
      var left = shells ? shells.filter(Boolean).length : num(g.loaded);
      out("left." + i, cap ? left + "/" + cap : "");
      var packed = !!(g && g.weapon && g.equipped === false);
      var reloadBtn0 = $('[data-reload="' + i + '"]');
      if (reloadBtn0) {
        reloadBtn0.hidden = !cap || packed;
        reloadBtn0.disabled = !!g.pendingD4;
        var emptyNow = window.SSDNSApplied && window.SSDNSApplied.gunEmpty ? window.SSDNSApplied.gunEmpty(g) : !(num(g.loaded) > 0);
        var kitPool = w ? takePool(g, w, false).pool : null;
        reloadBtn0.textContent = (emptyNow && kitPool && num(kitPool.count) > 0) ? "Load from kit ammo" : "Reload";
      }
      paintAmmoPool(i, g, w, cap);
      var modeNow = g.attackMode === "adv" || g.attackMode === "dis" ? g.attackMode : "";
      paintAdvTicks(i, modeNow);
      var advSel0 = $('[data-adv="' + i + '"]');
      if (advSel0 && advSel0.value !== modeNow) advSel0.value = modeNow;
      var cleanBtn = $('[data-clean="' + i + '"]');
      if (cleanBtn) cleanBtn.disabled = !!g.pendingD4;
      var unjamBtn = $('[data-unjam="' + i + '"]');
      if (unjamBtn) {
        var freeUnjam = window.SSDNSMisfire && window.SSDNSMisfire.unjamIsFree && window.SSDNSMisfire.unjamIsFree({
          weapon: g.weapon, mod: g.mod, feats: C().feats || [], name: w && w.name, properties: w && w.properties, rugged: !!(w && /rugged/i.test(w.properties || ""))
        });
        unjamBtn.hidden = !g.jammed || !!(g.fouled || g.ruined || g.broken);
        unjamBtn.disabled = !!g.pendingD4;
        unjamBtn.textContent = freeUnjam ? "Unjam (free)" : "Unjam";
      }
      var reopenBtn = $('[data-reopen="' + i + '"]');
      if (reopenBtn) {
        var lockList = window.SSDNSMisfire && window.SSDNSMisfire.activeLocks
          ? window.SSDNSMisfire.activeLocks(g, cap)
          : (g.lockedChambers || []);
        var hasLoader = (C().feats || []).indexOf("muzzleloader") >= 0;
        reopenBtn.hidden = !(hasLoader && lockList.length);
        reopenBtn.disabled = !!C().muzzleReopenUsed || !!g.pendingD4;
        reopenBtn.title = C().muzzleReopenUsed ? "Used this rest" : "Action. Clears one locked chamber. Once per short rest.";
      }
      var gunSel = $('[data-gun="' + i + '"]');
      if (gunSel) gunSel.disabled = !!g.pendingD4;
      if (cs) cs.disabled = !!g.pendingD4;
      var unloadBtn = $('[data-unload="' + i + '"]');
      if (unloadBtn) { unloadBtn.hidden = !cap; unloadBtn.setAttribute("data-cost", "Action"); unloadBtn.title = "Unload (action): put the chambered rounds back in your ammo, by type"; }
      if (reloadBtn0 && w) {
        var rcost = reloadCost(g, w, 0);
        reloadBtn0.setAttribute("data-cost", rcost === "full" ? "Full turn" : (rcost === "bonus" ? "Bonus" : "Action"));
        reloadBtn0.title = "Reload (" + costWords(rcost) + (rcost === "bonus" ? ", Quick Reload" : "") + "): fills the gun. Uses the ammo selected on this card.";
      }
      var trBtn0 = $('[data-tr="' + i + '"]');
      if (trBtn0) trBtn0.setAttribute("data-cost", "Bonus");
      if (unjamBtn) unjamBtn.setAttribute("data-cost", unjamCost(i) === "free" ? "Free" : "Bonus");
      if (reopenBtn) reopenBtn.setAttribute("data-cost", "Action");
      var rcBtn = $('[data-rechamber="' + i + '"]');
      if (rcBtn) rcBtn.hidden = !(w && w.tiers && !w.hexShells && g.chamberSet && rechamberOptions(i).length) || !!g.pendingD4;
      var rollBtn = $('[data-gunroll="' + i + '"]');
      if (rollBtn) {
        rollBtn.hidden = !s || packed;
        rollBtn.textContent = "Roll";
      }
      var meleeLbl = gunMeleeLabel(w);
      out("gmelee." + i, meleeLbl);
      var meleeBtn = $('[data-gunmelee="' + i + '"]');
      if (meleeBtn) meleeBtn.hidden = !meleeLbl || packed;
      var equipBox = $('[data-equip="gun"][data-equip-i="' + i + '"]');
      if (equipBox) {
        var Equip = window.SSDNSEquip;
        var combatLock = !!(Equip && Equip.combatLocked && Equip.combatLocked());
        equipBox.checked = !!(g && g.weapon && g.equipped !== false);
        equipBox.disabled = !g.weapon || combatLock;
        var equipTitle = !g.weapon ? "Pick a weapon first."
          : (combatLock ? Equip.LOCK_TIP : "Equipped weapons can attack, reload, and show on the map.");
        if (Equip && g.weapon && g.equipped === true) {
          var draw = Equip.drawCheck(C(), i);
          if (draw && draw.needed) equipTitle = draw.reason;
        }
        equipBox.title = equipTitle;
        var equipWrap = $('[data-equip-wrap="gun:' + i + '"]');
        if (equipWrap) equipWrap.title = equipTitle;
      }
      $('[data-tr="' + i + '"]').hidden = !(cap && canTacticalReload(w)) || packed;
      $('[data-hexwrap="' + i + '"]').hidden = !(cap && w && w.hexShells) || packed;
      var castWrap = $('[data-castwrap="' + i + '"]');
      if (castWrap) castWrap.hidden = !(cap && w && w.hexShells) || packed;
      var castBtn = $('[data-cast="' + i + '"]');
      var spellSel = $('[data-castspell="' + i + '"]');
      var slotSel = $('[data-castslot="' + i + '"]');
      if (castBtn && spellSel && w && w.hexShells) {
        var choices = castChoices();
        var sig = choices.map(function (ch) { return ch.value; }).join("|");
        var keepSpell = spellSel.value;
        if (spellSel.getAttribute("data-sig") !== sig) {
          spellSel.setAttribute("data-sig", sig);
          spellSel.innerHTML = "";
          if (!choices.length) spellSel.appendChild(opt("", "No spells on this sheet"));
          choices.forEach(function (ch) {
            var note = spellDiceNote(ch.name);
            spellSel.appendChild(opt(ch.value, (ch.level ? ordinal(ch.level) + " · " : "") + ch.name + (note ? " · " + note : "")));
          });
          if (keepSpell && choices.some(function (ch) { return ch.value === keepSpell; })) spellSel.value = keepSpell;
        }
        var picked = choices.filter(function (ch) { return ch.value === spellSel.value; })[0] || choices[0];
        var castAbout = $('[data-castabout="' + i + '"]');
        if (castAbout) {
          var castText = picked ? spellReadout(picked.name) : "";
          castAbout.hidden = !castText;
          var castP = castAbout.querySelector("p");
          if (castP) castP.textContent = castText;
        }
        var spellLv = picked ? picked.level : 0;
        if (slotSel) {
          if (!spellLv) slotSel.hidden = true;
          else {
            slotSel.hidden = false;
            var keepSlot = slotSel.value;
            var slotSig = String(spellLv);
            for (var lv = spellLv; lv <= 9; lv++) if (lv === spellLv || hexBoxes(lv) > 0) slotSig += "," + lv;
            if (slotSel.getAttribute("data-sig") !== slotSig) {
              slotSel.setAttribute("data-sig", slotSig);
              slotSel.innerHTML = "";
              for (var sl = spellLv; sl <= 9; sl++) {
                if (sl !== spellLv && hexBoxes(sl) <= 0) continue;
                slotSel.appendChild(opt(String(sl), ordinal(sl) + " shell"));
              }
              if (keepSlot && num(keepSlot) >= spellLv && slotSel.querySelector('option[value="' + keepSlot + '"]')) slotSel.value = keepSlot;
              else slotSel.value = String(spellLv);
            }
          }
        }
        var clv = spellLv ? num(slotSel && slotSel.value, spellLv) : 0;
        var held = false;
        if (clv > 0) (g.chambers || []).forEach(function (st2) {
          var p2 = parseChamber(st2);
          if (p2 && p2.kind === "hex" && String(p2.level) === String(clv)) held = true;
        });
        castBtn.disabled = !picked || (clv > 0 && !held);
        castBtn.title = !picked ? "Add a cantrip or a prepared spell on the Spells page."
          : (clv === 0
            ? "Cantrip: no slot and no chamber. Rolls " + picked.name + "."
            : (held
              ? "Fire the loaded level-" + clv + " shell as " + picked.name + ". No misfire. A natural 1 is a wild spark."
              : "Load a level-" + clv + " shell first. Loading spends the slot."));
      }
    });
    renderAmmo();
    renderExplosives();
    renderStorytellerKit();
    renderGearArt();
    function holLine(side, h) {
      if (!h) return "Holster " + side + ": none.";
      var t = "Holster " + side + ": " + h.name + " (holds " + h.holds + "; Init. " + (h.initText || "—") + ", first shot " + (h.firstShotText || "—") + "). " + h.perk + " ";
      if (h.id === "cross-draw-holster") t += (c.holsterActive && (c.seated || c.mounted)) ? "That bonus is on. " : "That bonus is off. ";
      else if (h.conditional) t += "* ";
      return t;
    }
    var hL = HOL[c.holster], hR = HOL[c.holsterR], hB = HOL[c.belt];
    var holMsg = "";
    if (hL && hR && hL === hR && window.SSDNSEquip && window.SSDNSEquip.isPairHolster(hL)) holMsg = holLine("L + R (pair)", hL);
    else holMsg = holLine("L", hL) + " " + holLine("R", hR);
    holMsg += " Pistol L draws from Holster L and Pistol R from Holster R; each side's first-shot bonus goes to its own pistol. ";
    if (hL || hR) holMsg += c.holsterActive ? "(Applied: pistols in the rigs.) " : "(Tick when pistols ride in them to apply.) ";
    else holMsg += "No holster: no initiative or first-shot bonus; quick-draw needs a DC 12 Dex check. ";
    if (hB) holMsg += "Belt: " + hB.name + " (feeds Tactical Reload). ";
    if (c.seated) holMsg += "Seated or driving. ";
    if (c.mounted) holMsg += "Mounted. ";
    holMsg += R.rulesText.holster;
    holMsg += " Loadout: 2 pistols, 1 long gun, 1 melee, 1 focus. A pistol on a side with no holster draws free only if it's your one hand draw; otherwise DC 12 Dex.";
    $("#holsterInfo").textContent = holMsg;
    $$('[data-tr]').forEach(function (btn) {
      btn.title = hasGunBelt()
        ? "Tactical Reload: bonus action, load one round from a gun belt or bandolier"
        : "Tactical Reload needs a gun belt or bandolier (tick the box, or pick Gun Belt / Bandolier). Tap to see the warning.";
    });
    var cp = v.cp;
    out("cpTotal", "Worth " + cp.toLocaleString() + " " + UNIT);
    out("esTotal", cp.toLocaleString() + " " + UNIT);
    var fc = $("#featChips"); fc.innerHTML = "";
    c.feats.forEach(function (id, idx) {
      var f = FEAT[id];
      fc.appendChild(el("span", { class: "chip", title: f ? f.gist + (f.prereq ? " · Prerequisite: " + f.prereq : "") : id }, [f ? f.name : id,
        el("button", { type: "button", class: "chip-x", "data-unfeat": idx, "aria-label": "Remove " + (f ? f.name : id) }, ["×"])]));
    });
    if (!c.feats.length) fc.appendChild(el("span", { class: "fine", text: "No feats yet." }));
    var lin = LIN[c.lineage];
    var card = $("#lineageCard");
    if (card) {
      card.textContent = lin ? (lin.name + " · Age: " + (lin.age || "—") + " · Size: " + (lin.size || "—") + " · " + (lin.languages || "—")) : "";
    }
    // page 3
    var word = slotWord();
    $$(".slot-word").forEach(function (n) { n.textContent = word; });
    var tabHex = $("#tab-hex");
    if (tabHex) tabHex.textContent = "3 · Spells & " + word;
    var slotLab = $("#slotWord");
    if (slotLab) slotLab.textContent = word;
    var showCast = !!v.caster;
    var hexRoll = $(".hex-roll");
    if (hexRoll) hexRoll.hidden = !showCast;
    var hexHead = $(".hexhead");
    if (hexHead) hexHead.hidden = !showCast;
    var art = $(".hex-art");
    if (art) art.hidden = !showCast || c.calling === "pact-seeker";
    var hexBtn = $("#btnHexRoll");
    if (hexBtn) {
      if (c.calling === "hexslinger") {
        hexBtn.textContent = "Cast spell";
        hexBtn.title = "Opens the spell picker. A cantrip spends nothing. A leveled spell spends one hex lead slot.";
      } else if (c.calling === "pact-seeker") {
        hexBtn.textContent = "Pact spell";
        hexBtn.title = "Spends a Pact slot, then rolls the spell attack.";
      } else {
        hexBtn.textContent = "Spell";
        hexBtn.title = "Spends a spell slot, then rolls the spell attack.";
      }
    }
    var ci = v.caster;
    out("castingCalling", ci ? ci.from : (currentCalling() ? currentCalling().name + " (not a caster)" : "No Calling picked"));
    out("spellAbility", ci ? ci.ability + " " + sign(v.spellMod) : "—");
    var rest = c.hexRest || (ci ? ci.rest : "");
    $("#restAuto").textContent = rest ? rest + " rest" : "—";
    var cgun = CASTER_GUNS[c.casterGun];
    var pageCopy = window.SSDNSCreator && window.SSDNSCreator.spellPageCopy ? window.SSDNSCreator.spellPageCopy(c.calling, currentSubclass() && currentSubclass().name) : null;
    var gnote = "";
    if (showCast && c.calling === "hexslinger") {
      gnote = R.rulesText.casterGun.replace(/^[-\s]*Channel:\s*/, "");
      gnote = gnote.charAt(0).toUpperCase() + gnote.slice(1);
      if (cgun && cgun.notes && cgun.notes.length) gnote = cgun.name + ": " + cgun.notes.join(" ") + " " + gnote;
      if (c.casterGun === "ordinary-firearm") gnote = "Forcing hex lead through an ordinary firearm: spell attacks have disadvantage and targets have advantage on saves (PHB, Hexslinger).";
    } else if (c.calling === "pact-seeker") {
      gnote = R.rulesText.borrowedIron || "Borrowed Iron is a pact focus. It has no weapon stats. Pact Shot is the attack.";
    } else if (showCast && pageCopy && pageCopy.blurb) {
      gnote = pageCopy.blurb;
    }
    $("#gunNote").textContent = gnote;
    if (art) art.hidden = !(pageCopy && pageCopy.art);
    for (var l = 1; l <= 9; l++) {
      var key = "hex." + l, total = hasOv(c, key) ? num(c.overrides[key]) : v.hex[l];
      total = Math.max(0, Math.min(MAX_BOXES, total));
      $$('[data-hex="' + l + '"] .cb').forEach(function (cb, i) { cb.hidden = i >= total; });
      var lvl = $('.sp-level[data-level="' + l + '"]');
      if (lvl) lvl.classList.toggle("no-slots", false);
    }
    var c0 = $('.sp-level[data-level="0"]');
    if (c0) c0.classList.toggle("no-slots", false);
    renderSpellbook();
    renderConditionsTab();
    renderRef();
  }
  function ammoType(g, w) { return w.ammo === "shell" ? (g.load === "slug" ? "slug" : "buck") : w.ammo; }
  function caliberChoices(type) {
    var out = [];
    function add(name) { if (name && out.indexOf(name) < 0) out.push(name); }
    if (type === "cartridge" || !type) {
      ["Light", "Medium", "Heavy"].forEach(add);
    } else {
      CALIBERS.forEach(add);
    }
    (C().guns || []).forEach(function (g) {
      var w = WPN[g.weapon];
      if (!w) return;
      var round = gunRound(g, w);
      if (round) add(round);
      var tier = w.tiers ? chamberOf(g, w).tier : "";
      if (tier && TIER_LABEL[tier]) add(TIER_LABEL[tier]);
    });
    return out;
  }
  function renderAmmo() {
    var box = $("#ammoList"), c = C();
    var focus = document.activeElement && box.contains(document.activeElement) ? document.activeElement.getAttribute("data-f") : null;
    box.innerHTML = "";
    if (!c.ammo.length) box.appendChild(el("p", { class: "fine", text: "No ammo yet. Add a line per ammo type and caliber." }));
    c.ammo.forEach(function (a, i) {
      var sel = el("select", { "data-f": "character.ammo." + i + ".type", "aria-label": "Ammo type" }, AMMO_TYPES.map(function (t) { return opt(t.id, t.label); }));
      sel.value = a.type;
      var cal = el("select", { "data-f": "character.ammo." + i + ".caliber", "aria-label": "Caliber" });
      var cals = caliberChoices(a.type);
      cal.appendChild(opt("", "Any / tier"));
      cals.forEach(function (name) {
        var label = (a.type === "cartridge" && window.SSDNSApplied && window.SSDNSApplied.cartridgePoolLabel)
          ? (window.SSDNSApplied.cartridgePoolLabel(name) || name)
          : name;
        cal.appendChild(opt(name, label));
      });
      if (a.caliber && !cals.some(function (name) { return name === a.caliber; })) cal.appendChild(opt(a.caliber, a.caliber));
      cal.value = a.caliber || "";
      var cnt = el("input", { type: "number", min: "0", "data-f": "character.ammo." + i + ".count", "aria-label": "Rounds", inputmode: "numeric" });
      cnt.value = a.count;
      box.appendChild(el("div", { class: "ammo-row" }, [sel, cal,
        el("button", { type: "button", class: "btn xs", "data-ammo-step": i + ":-1", "aria-label": "One less" }, ["−"]), cnt,
        el("button", { type: "button", class: "btn xs", "data-ammo-step": i + ":1", "aria-label": "One more" }, ["+"]),
        el("button", { type: "button", class: "btn xs ghost", "data-ammo-del": i, "aria-label": "Remove line" }, ["×"])]));
    });
    if (focus) { var f = box.querySelector('[data-f="' + focus + '"]'); if (f) f.focus(); }
  }
  /* 0.3.54: explosives live in Items (one list). This box shows the explosive
     items with a count and the same Use button as the Items list. */
  function renderExplosives() {
    var box = $("#explosiveList"); if (!box) return;
    box.innerHTML = "";
    var c = C();
    var Items = window.SSDNSItems;
    if (Items && Items.mergeExplosives && Items.mergeExplosives(c)) changed({ noRender: true, quiet: true });
    var rows = (c.items || []).filter(function (it) { return it && it.type === "explosive"; });
    if (!rows.length) box.appendChild(el("p", { class: "fine", text: "No explosives yet." }));
    rows.forEach(function (it) {
      var label = el("span", { class: "exp-name", text: it.name + (it.effect && it.effect.damage ? " · " + it.effect.damage + (it.effect.radius ? ", " + it.effect.radius + " ft" : "") : "") });
      var cnt = el("span", { class: "exp-count", text: "×" + (it.count == null ? 1 : it.count) });
      var use = el("button", { type: "button", class: "btn sm", "data-item-use": it.uid, title: "Throw or set it. Rolls damage and the save, takes one from your count." }, ["Use"]);
      box.appendChild(el("div", { class: "ammo-row exp-row" }, [label, cnt, use]));
    });
    if (rows.length) {
      var keepDist = window.__ssdnsExpDist || "";
      var dist = el("select", { id: "explosiveDist", "aria-label": "Throw distance" });
      /* 0.3.69: Powder Man Long Arm throws 50/100 ft (scatters past 50) */
      var longArm = (C().feats || []).indexOf("powder-man") >= 0;
      var distOpts = longArm
        ? [["", "Throw distance…"], ["50", "Up to 50 ft"], ["100", "51–100 ft (scatters 10 ft)"]]
        : [["", "Throw distance…"], ["30", "Up to 30 ft"], ["60", "31–60 ft (scatters 10 ft)"]];
      distOpts.forEach(function (o) { dist.appendChild(opt(o[0], o[1])); });
      dist.value = distOpts.some(function (o) { return o[0] === keepDist; }) ? keepDist : "";
      dist.addEventListener("change", function () { window.__ssdnsExpDist = dist.value; });
      box.appendChild(el("div", { class: "ammo-row exp-dist" }, [dist, el("span", { class: "fine", text: "Save only (no attack roll). Throw " + (longArm ? "50/100 (Powder Man Long Arm)" : "30/60") + "." })]));
    }
    var pick = el("select", { id: "explosivePick", "aria-label": "Add an explosive" });
    pick.appendChild(opt("", "Add an explosive…"));
    ((Items && Items.catalog && Items.catalog({})) || []).filter(function (r) { return r.type === "explosive"; }).forEach(function (r) { pick.appendChild(opt(r.id, r.name)); });
    box.appendChild(el("div", { class: "ammo-row exp-add", hidden: "" }, [pick]));
    var info = $("#explosiveInfo");
    if (info) {
      var bits = [];
      if (R.explosives && R.explosives.note) bits.push(R.explosives.note);
      if (R.explosives && R.explosives.bundles && R.explosives.bundles.length) {
        bits.push("Bundles: " + R.explosives.bundles.map(function (b) { return b.charge + " " + b.damage + " / " + b.radius + " / " + b.save; }).join("; ") + ".");
      }
      info.textContent = bits.join(" ");
    }
  }
  function renderStorytellerKit() {
    var kit = $("#storytellerKit"); if (!kit) return;
    var c = C();
    var owned = window.SSDNSDoll && window.SSDNSDoll.instruments ? window.SSDNSDoll.instruments(c) : [];
    var show = c.calling === "storyteller" || !!c.instrument || owned.length > 0;
    kit.hidden = !show;
    if (!show) return;
    var listEl = $("#instrumentList");
    if (listEl) {
      listEl.innerHTML = owned.map(function (x) {
        return '<div class="instrument-row' + (x.focus ? " is-focus" : "") + '"><span class="instrument-name">' + esc(x.name) + (x.id === "voice" || x.id === "piano" ? "" : ' <span class="fine">(' + esc(x.quality === "quality" ? "quality" : "cheap") + ")</span>") + "</span>" +
          (x.focus ? '<span class="tag">Focus</span>' : '<button type="button" class="btn sm" data-make-focus="' + esc(x.uid) + '">Make focus</button>') + "</div>";
      }).join("");
      listEl.hidden = owned.length < 2 && !(owned.length === 1 && !owned[0].focus);
    }
    var inst = ((R.storytellerGear && R.storytellerGear.instruments) || []).find(function (x) { return x.id === c.instrument; });
    var info = $("#instrumentInfo");
    var parts = [];
    if (inst) {
      parts.push(inst.name + (c.instrument === "voice" || c.instrument === "piano" ? "." : (c.instrumentQuality === "quality" ? " (quality)." : " (cheap).")));
      if (inst.perk) parts.push("Perk: " + inst.perk);
      if (c.instrument === "voice") parts.push("Voice never rolls Wear.");
      else {
        var wearMod = (c.instrumentQuality === "cheap" ? -2 : 0) + ({ plain: 0, quality: 1, cheap: -1 }[c.instrumentStrings] || 0) + ({ none: 0, soft: 1, hard: 2 }[c.instrumentCase] || 0);
        parts.push("Wear roll: 1d8 " + (wearMod >= 0 ? "+" : "") + wearMod + " (natural 1 is at least Out of tune).");
      }
      if (c.instrumentWear === "out-of-tune") parts.push("Currently Out of tune: disadvantage on concentration.");
      if (c.instrumentWear === "broken") parts.push("Broken: you can't cast through it until repaired.");
      if (c.instrumentWear === "played-in") parts.push("Played in: +1 to spell attacks through it until the next Wear roll.");
    } else {
      parts.push("Pick your Calling instrument (or Voice). Starting-kit instruments are cheap unless your Background says otherwise. " + ((R.storytellerGear && R.storytellerGear.note) || ""));
    }
    if (window.SSDNSEquip && window.SSDNSEquip.focusCarry && c.instrument) {
      var carry = window.SSDNSEquip.focusCarry(c);
      if (carry && carry.text) parts.push(carry.text);
    }
    if (info) info.textContent = parts.join(" ");
    var focusPhoto = $("#focusPhoto");
    if (focusPhoto && window.SSDNSInstrumentArt) {
      window.SSDNSInstrumentArt.paint(focusPhoto, {
        id: c.instrument,
        quality: c.instrumentQuality,
        equipment: c.equipment,
        name: inst ? inst.name : (c.instrument || "")
      });
    }
    var focusBox = $("#focusEquipped");
    if (focusBox) {
      var focusLock = !!(window.SSDNSEquip && window.SSDNSEquip.combatLocked && window.SSDNSEquip.combatLocked());
      focusBox.checked = !!(c.instrument && c.focusEquipped !== false);
      focusBox.disabled = !c.instrument || focusLock;
      focusBox.title = focusLock ? window.SSDNSEquip.LOCK_TIP : "Focus slot. Only an equipped instrument is your focus.";
    }
    var q = $("#selInstrumentQuality");
    if (q) q.disabled = c.instrument === "voice" || c.instrument === "piano" || !c.instrument;
  }

  function renderGearArt() {
    var strip = $("#gearArtStrip");
    if (!strip || !window.SSDNSItemArt || !window.SSDNSItemArt.matchesIn) return;
    var rows = window.SSDNSItemArt.matchesIn(C().equipment || "");
    if (!rows.length) {
      strip.hidden = true;
      strip.innerHTML = "";
      return;
    }
    strip.hidden = false;
    strip.innerHTML = rows.map(function (row) {
      return '<figure class="gear-art"><img alt="' + esc(row.name) + '" src="' + row.src + '"><figcaption>' + esc(row.name) + "</figcaption></figure>";
    }).join("");
  }

  function renderRef() {
    var c = C(), parts = [];
    var lin = LIN[c.lineage], sub = lin && (lin.sublineages || []).filter(function (s) { return s.id === c.sublineage; })[0];
    function traits(list) { return (list || []).map(function (t) { return "<li><b>" + esc(t.name) + ".</b> " + esc(t.text) + "</li>"; }).join(""); }
    if (lin) parts.push("<h4>" + esc(lin.name) + " <small>(" + esc(lin.race5e || "") + ")</small></h4><p>" + esc(lin.asi || "") + " Speed " + esc(lin.speed) + " ft.</p><ul>" + traits(lin.traits) + "</ul>");
    if (sub) parts.push("<h4>" + esc(sub.name) + "</h4><p>" + esc(sub.asi || "") + "</p><ul>" + traits(sub.traits) + "</ul>");
    var cal = currentCalling(), lv = num(c.level, 1);
    if (cal) {
      parts.push("<h4>" + esc(cal.name) + " <small>(" + esc(cal.class5e) + ", hit die " + esc(cal.hitDie) + ")</small></h4><p class='fine'><b>Armor:</b> " + esc(cal.armorProf || "—") + " · <b>Weapons:</b> " + esc(cal.weaponProf || "—") + (cal.kit ? " · <b>Kit:</b> " + esc(cal.kit) : "") + "</p><ul>" + traits(cal.features) + "</ul>");
      if (cal.progression && cal.progression.rows) {
        var got = cal.progression.rows.filter(function (r) { return levelNum(r[0]) <= lv; }).map(function (r) { return "<li><b>" + esc(r[0]) + ":</b> " + esc(r[2]) + "</li>"; });
        parts.push("<p class='fine'><b>Progression to level " + lv + "</b></p><ul class='fine'>" + got.join("") + "</ul>");
      }
      var sc = currentSubclass();
      if (sc) parts.push("<h4>" + esc(sc.name) + "</h4>" + (sc.features.length ? "<ul>" + traits(sc.features) + "</ul>" : "<p class='fine'>The PHB lists this subclass by name only.</p>"));
    }
    var bg = BG[c.background];
    if (bg) parts.push("<h4>" + esc(bg.name) + " <small>(" + esc(bg.twin5e) + ")</small></h4><p><b>Skills:</b> " + esc(bg.skills) + (bg.tools ? " · <b>Tools:</b> " + esc(bg.tools) : "") + (bg.languages ? " · <b>Languages:</b> " + esc(bg.languages) : "") + "</p><p><b>Equipment:</b> " + esc(bg.equipment) + "</p><p><b>" + esc(bg.feature.name) + ".</b> " + esc(bg.feature.text) + "</p>");
    c.feats.forEach(function (id) { var f = FEAT[id]; if (f) parts.push("<h4>Feat: " + esc(f.name) + "</h4>" + (f.prereq ? "<p class='fine'>Prerequisite: " + esc(f.prereq) + "</p>" : "") + "<ul>" + f.bullets.map(function (b) { return "<li>" + esc(b) + "</li>"; }).join("") + "</ul>"); });
    if (c.calling === "storyteller" || c.instrument) {
      var inst = ((R.storytellerGear && R.storytellerGear.instruments) || []).find(function (x) { return x.id === c.instrument; });
      parts.push("<h4>Storyteller Gear</h4><p class='fine'>" + esc(inst ? (inst.name + ": " + inst.perk) : "Pick a Calling instrument.") + " " + esc((R.storytellerGear && R.storytellerGear.note) || "") + "</p>");
      if (R.storytellerGear && R.storytellerGear.wearTable && R.storytellerGear.wearTable.length) {
        parts.push("<p class='fine'><b>Wear &amp; Tear:</b> " + R.storytellerGear.wearTable.map(function (w) { return esc(w.roll) + " → " + esc(w.result); }).join(" · ") + "</p>");
      }
    }
    if (R.explosives && R.explosives.items && R.explosives.items.length) {
      parts.push("<h4>Explosives</h4><p class='fine'>" + esc(R.explosives.note || "") + " Items: " + esc(R.explosives.items.map(function (x) { return x.name; }).join("; ")) + ".</p>");
    }
    var sl = R.spellLists && (R.spellLists[c.calling] || R.spellLists[(currentCalling() && currentCalling().id) || ""]);
    if (!sl && currentCalling()) {
      var cid = currentCalling().id;
      sl = R.spellLists && R.spellLists[cid];
    }
    if (sl && sl.levels) {
      var can = (sl.levels["0"] || []).slice(0, 8).join("; ");
      parts.push("<h4>Spell list <small>(" + esc(sl.title || sl.name) + ")</small></h4><p class='fine'>" + esc(sl.blurb || "") + "</p><p class='fine'><b>Cantrips (sample):</b> " + esc(can) + ((sl.levels["0"] || []).length > 8 ? "…" : "") + "</p>");
    }
    parts.push("<p class='fine'>" + esc(R.rulesText.reloading) + " " + esc(R.rulesText.misfire) + "</p>");
    $("#refBody").innerHTML = parts.join("");
  }

  // ------------------------------------------------------------------ change handling
  function changed(opts) {
    if (window.SSDNSDmJoin && window.SSDNSDmJoin.isReadOnly && window.SSDNSDmJoin.isReadOnly()) return;
    S.doc.updatedAt = new Date().toISOString();
    if (!opts || !opts.quiet) S.fileDirty = true;
    S.hasContent = true;
    scheduleLocal();
    if (S.handle && (!opts || !opts.quiet)) scheduleFile();
    if (!opts || !opts.noRender) renderCalc();
    updateSaveBar();
  }
  function onFieldInput(e) {
    var t = e.target;
    if (window.SSDNSDmJoin && window.SSDNSDmJoin.isReadOnly && window.SSDNSDmJoin.isReadOnly()) return;
    if (suppress || !t.getAttribute) return;
    if (t.hasAttribute("data-castspell") || t.hasAttribute("data-castslot")) { renderCalc(); return; }
    if (t.hasAttribute("data-advtick")) {
      if (e.type !== "change") return;
      setGunAttackMode(num(t.getAttribute("data-advtick")), t.checked ? t.value : "");
      return;
    }
    if (t.hasAttribute("data-adv")) {
      if (e.type !== "change") return;
      setGunAttackMode(num(t.getAttribute("data-adv")), t.value);
      return;
    }
    if (t.hasAttribute("data-ammopool")) {
      if (e.type !== "change") return;
      setGunAmmoPool(num(t.getAttribute("data-ammopool")), t.value);
      return;
    }
    if (t.hasAttribute("data-calc")) {
      var k = t.getAttribute("data-calc");
      C().overrides[k] = t.value.trim();
      if (C().overrides[k] === "") delete C().overrides[k];
      changed({ noRender: e.type === "input" });
      return;
    }
    var urlPath = t.getAttribute("data-portrait-url");
    if (urlPath) {
      if (e.type !== "change") return;
      var url = String(t.value || "").trim();
      if (!url) return;
      var scheme = /^[a-z][a-z0-9+.-]*:/i.test(url);
      var ok = /^https?:\/\//i.test(url) || (!scheme && !/^\/\//.test(url) && !/[\s<>]/.test(url));
      if (!ok) { toast("Use an http(s) image address."); return; }
      setPath(S.doc, urlPath, url);
      renderFields();
      changed({ noRender: true });
      return;
    }
    if (t.getAttribute && t.getAttribute("data-equip")) {
      if (e.type !== "change") return;
      applyEquipToggle(t);
      return;
    }
    if (t.id === "focusEquipped") {
      if (e.type !== "change") return;
      applyEquipToggle(t);
      return;
    }
    var path = t.getAttribute("data-f");
    if (!path) return;
    var old = getPath(S.doc, path), v;
    if (path === "character.instrument" && window.SSDNSEquip && window.SSDNSEquip.combatLocked && window.SSDNSEquip.combatLocked()) {
      t.value = old == null ? "" : old;
      toast(window.SSDNSEquip.LOCK_TIP);
      return;
    }
    if (t.type === "checkbox") v = t.checked;
    else if (t.type === "number") v = t.value === "" ? "" : Number(t.value);
    else v = t.value;
    if (path.indexOf("shards.") === 0) v = Math.max(0, Math.floor(num(v, 0)));
    if (e.type === "input" && t.tagName === "SELECT") return; // handled on change
    setPath(S.doc, path, v);
    // v0.2.1: picking Gun Belt / Bandolier ticks the TR feed box (picking something else leaves it alone)
    if ((path === "character.holster" || path === "character.belt") && HOL[v] && HOL[v].feedsTR) C().gunBelt = true;
    // 2026-10-19: L/R holsters. A pair fills both sides; leaving a pair clears its other half.
    if ((path === "character.holster" || path === "character.holsterR") && window.SSDNSEquip && window.SSDNSEquip.setHolster) {
      var sideKey = path === "character.holsterR" ? "R" : "L";
      setPath(S.doc, path, old == null ? "" : old);
      window.SSDNSEquip.setHolster(C(), sideKey, v);
    }
    $$('[data-mirror="' + path + '"]').forEach(function (m) { m.textContent = v; });
    if (path === "character.hpMax" && e.isTrusted && String(t.value).trim() !== "" && String(v) !== String(old)) C().hpAuto = false;
    if (path === "character.hpCurrent" && window.SSDNSSheet && window.SSDNSSheet.syncDown) window.SSDNSSheet.syncDown(v);
    if (path === "character.speed" && e.isTrusted && String(t.value).trim() !== "" && String(v) !== String(old)) C().speedAuto = false;
    if (e.type === "change") {
      if (path === "character.calling") onCallingPicked();
      else if (path === "character.lineage") onLineagePicked();
      else if (path === "character.sublineage") onSublineagePicked();
      else if (path === "character.background") onBackgroundPicked();
      else if (/^character\.guns\.\d+\.(weapon|load|chamber|capacity)$/.test(path)) onGunChanged(num(path.split(".")[2]), path.split(".")[3], old);
      else if (path === "character.instrument" && window.SSDNSEquip && window.SSDNSEquip.tryAutoEquip) {
        C().focusEquipped = false;
        window.SSDNSEquip.tryAutoEquip(C(), { kind: "focus" });
      }
    }
    if (C().hpAuto !== false && (path === "character.calling" || path === "character.level" || path === "character.abilities.CON")) applyAutoHp();
    if (path.indexOf("shards.") === 0) {
      pushWallet();
      $$('[data-f="' + path + '"]').forEach(function (x) { if (x !== t) setField(x, v); });
    }
    var structural = e.type === "change" && (t.tagName === "SELECT" || t.type === "checkbox" || /ammo\.|explosives\.|instrument/.test(path));
    if (structural) { renderFields(); changed({ noRender: true }); }
    else changed();
  }
  function dieMax(hitDie) {
    var m = String(hitDie || "").match(/d(\d+)/i);
    return m ? parseInt(m[1], 10) : 0;
  }
  /** Level 1: max hit die + Con. Each later level: average (round up) + Con. */
  function suggestedHp(c) {
    var cal = CAL[c.calling];
    if (!cal) return null;
    var die = dieMax(cal.hitDie);
    if (!die) return null;
    var conEl = document.querySelector("[data-f='character.abilities.CON']");
    if (conEl && String(conEl.value).trim() !== "") {
      var typed = Number(conEl.value);
      if (isFinite(typed)) c.abilities.CON = typed;
    }
    syncLineageAsi(c);
    var con = mod(num(c.abilities.CON, 10));
    var lv = Math.max(1, Math.min(20, num(c.level, 1)));
    var hp = Math.max(1, die + con);
    var per = Math.max(1, Math.floor(die / 2) + 1 + con);
    for (var i = 1; i < lv; i++) hp += per;
    if (c.sublineage === "gold-miner") hp += lv;
    if (hasFeat(c, "tough")) hp += 2 * lv;
    if (demonHide(c)) hp += lv;
    return hp;
  }
  function applyAutoHp() {
    var c = C();
    if (c.hpAuto === false) return;
    var hp = suggestedHp(c);
    if (hp == null) return;
    var oldMax = c.hpMax === "" || c.hpMax == null ? null : num(c.hpMax, 0);
    var cur = c.hpCurrent === "" || c.hpCurrent == null ? null : c.hpCurrent;
    var Applied = window.SSDNSApplied;
    var nextCur = Applied && Applied.adjustCurrentHp ? Applied.adjustCurrentHp(cur, oldMax, hp) : hp;
    c.hpMax = hp;
    c.hpCurrent = nextCur;
    if (!String(c.hitDiceLeft || "").trim()) {
      var cal = currentCalling();
      if (cal) c.hitDiceLeft = num(c.level, 1) + cal.hitDie;
    }
    var maxEl = $("#inHPMax"), curEl = $("#inHPCur"), hd = document.querySelector('[data-f="character.hitDiceLeft"]');
    if (maxEl && document.activeElement !== maxEl) maxEl.value = c.hpMax;
    if (curEl && document.activeElement !== curEl) curEl.value = c.hpCurrent;
    if (hd && document.activeElement !== hd && !String(hd.value || "").trim()) hd.value = c.hitDiceLeft;
  }
  function onCallingPicked() {
    var c = C(), cal = CAL[c.calling];
    c.subclass = "";
    if (!cal) return;
    AB.forEach(function (a) { c.saveProf[a] = cal.saves.indexOf(a) >= 0; });
    var box = String(c.proficienciesLanguages || "").split("\n").filter(function (line) {
      return !/^Armor \([^)]+\):/.test(line) && !/^Weapons \([^)]+\):/.test(line);
    }).join("\n");
    var add = [];
    if (cal.armorProf) add.push("Armor (" + cal.name + "): " + cal.armorProf);
    if (cal.weaponProf) add.push("Weapons (" + cal.name + "): " + cal.weaponProf);
    c.proficienciesLanguages = (box.trim() ? box.replace(/\s+$/, "") + "\n" : "") + add.join("\n");
    (c.guns || []).forEach(function (g) {
      var w = WPN[g.weapon];
      if (w) g.proficient = callingProficient(w);
    });
    if (c.calling === "pact-seeker") c.casterGun = "borrowed-iron";
    else if (c.calling !== "hexslinger" && c.casterGun && R.casterGuns.some(function (g) { return g.id === c.casterGun; })) c.casterGun = "";
    toast("Saving throws set for " + cal.name + " (" + cal.saves.join(", ") + "). Hit die " + cal.hitDie + "." + (add.length ? " Armor and weapon proficiencies added." : ""));
  }
  function asiChoiceCount(spec) {
    var n = 0;
    (spec && spec.choices || []).forEach(function (choice) { n += choice.count || 0; });
    return n;
  }
  function askAsiChoice(count) {
    return new Promise(function (resolve) {
      if (!count) { resolve([]); return; }
      var dlg = document.createElement("dialog");
      dlg.className = "dlg";
      var form = document.createElement("form");
      form.method = "dialog";
      var h = document.createElement("h2");
      h.textContent = "Ability score increase";
      var note = document.createElement("p");
      note.className = "fine";
      note.textContent = "Choose " + count + " different " + (count === 1 ? "score" : "scores") + ".";
      form.appendChild(h);
      form.appendChild(note);
      var picks = [];
      var i;
      for (i = 0; i < count; i++) {
        var label = document.createElement("label");
        label.appendChild(document.createTextNode("Score " + (i + 1) + " "));
        var sel = document.createElement("select");
        var blank = document.createElement("option");
        blank.value = "";
        blank.textContent = "Choose";
        sel.appendChild(blank);
        AB.forEach(function (key) {
          var opt = document.createElement("option");
          opt.value = key;
          opt.textContent = key;
          sel.appendChild(opt);
        });
        label.appendChild(sel);
        form.appendChild(label);
        picks.push(sel);
      }
      var foot = document.createElement("div");
      foot.className = "dlg-foot";
      var cancel = document.createElement("button");
      cancel.type = "button";
      cancel.className = "btn";
      cancel.textContent = "Cancel";
      var go = document.createElement("button");
      go.type = "submit";
      go.className = "btn btn-primary";
      go.textContent = "Apply";
      foot.appendChild(cancel);
      foot.appendChild(go);
      form.appendChild(foot);
      dlg.appendChild(form);
      var done = false;
      function finish(value) {
        if (done) return;
        done = true;
        if (dlg.close) dlg.close();
        if (dlg.parentNode) dlg.parentNode.removeChild(dlg);
        resolve(value);
      }
      cancel.addEventListener("click", function () { finish(null); });
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var chosen = [];
        var k;
        for (k = 0; k < picks.length; k++) {
          var val = picks[k].value;
          if (!val || chosen.indexOf(val) >= 0) { toast("Choose " + count + " different scores."); return; }
          chosen.push(val);
        }
        finish(chosen);
      });
      dlg.addEventListener("cancel", function (e) { e.preventDefault(); finish(null); });
      document.body.appendChild(dlg);
      try { if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", ""); }
      catch (err) { dlg.setAttribute("open", ""); }
    });
  }
  function finishLineageAsi(c) {
    var spec = wantedLineageAsi(c);
    var need = asiChoiceCount(spec);
    var have = Array.isArray(c.asiChoice) ? c.asiChoice.length : 0;
    function applyNow() {
      var bumped = syncLineageAsi(c);
      if (bumped && c.hpAuto !== false) applyAutoHp();
      renderFields();
      changed();
      return bumped;
    }
    if (need && have < need) {
      askAsiChoice(need).then(function (chosen) {
        if (chosen && chosen.length) c.asiChoice = chosen;
        applyNow();
      });
      return;
    }
    applyNow();
  }
  function onLineagePicked() {
    var c = C(), l = LIN[c.lineage];
    c.sublineage = "";
    c.asiChoice = [];
    if (!l) return;
    if (l.speed) c.speed = l.speed;
    finishLineageAsi(c);
    toast(l.name + ": speed " + (l.speed || "—") + " ft. " + (l.asi || "") + " Age: " + (l.age || "—") + " Size: " + (l.size || "—") + " Languages: " + (l.languages || "—"));
  }
  function onSublineagePicked() {
    var c = C(), l = LIN[c.lineage], s = l && (l.sublineages || []).filter(function (x) { return x.id === c.sublineage; })[0];
    if (!s) return;
    c.speed = s.speed || l.speed || c.speed;
    c.asiChoice = [];
    finishLineageAsi(c);
    toast(s.name + ": " + (s.asi || "") + (s.speed ? " Speed " + s.speed + " ft." : ""));
  }
  function onBackgroundPicked() {
    var c = C(), b = BG[c.background];
    if (!b) return;
    var added = [];
    (b.skillList || []).forEach(function (sk) { if (!num(c.skillProf[sk], 0)) { c.skillProf[sk] = 1; added.push(sk); } });
    toast(b.name + ": " + (added.length ? "proficient in " + added.join(", ") + "." : "skills already marked.") + " Its gear is in the reference panel.");
  }
  function findPool(type, caliber, create) {
    var am = C().ammo, norm = function (s) { return String(s || "").trim().toLowerCase(); };
    var p = am.filter(function (a) { return a.type === type && norm(a.caliber) === norm(caliber); })[0];
    if (!p && caliber) p = am.filter(function (a) { return a.type === type && !norm(a.caliber); })[0];
    if (!p && create) { p = { type: type, caliber: caliber || "", count: 0 }; am.push(p); }
    return p || null;
  }
  function capOf(g, w) { var st = capSteps(w).filter(function (x) { return x.cap === num(g.capacity); })[0]; return st ? st.cap : (w.capacity || 0); }
  function chamberLocked(g, k) {
    var list = g && g.lockedChambers;
    if (!Array.isArray(list)) return false;
    return list.some(function (n) { return Number(n) === k; });
  }
  function openChamberCount(g, a) {
    var n = 0;
    for (var k = 0; k < a.length; k++) if (!a[k] && !chamberLocked(g, k)) n++;
    return n;
  }
  function firstOpenChamber(g, a) {
    for (var k = 0; k < a.length; k++) if (!a[k] && !chamberLocked(g, k)) return k;
    return -1;
  }
  function normChambers(g, w) {
    var cap = capOf(g, w), a = Array.isArray(g.chambers) ? g.chambers.slice(0, cap) : [];
    while (a.length < cap) a.push("");
    for (var i = 0; i < cap; i++) if (chamberLocked(g, i)) a[i] = "";
    if (!a.some(Boolean) && num(g.loaded) > 0) {
      var fill = Math.min(openChamberCount(g, a), num(g.loaded));
      for (var k = 0; k < cap && a.filter(Boolean).length < fill; k++) if (!chamberLocked(g, k)) a[k] = "c";
    }
    g.chambers = a; g.loaded = a.filter(Boolean).length;
    return a;
  }
  /** Chamber token: "" | "c" (legacy plain) | "1"–"9" (legacy hex, slot already marked) | "k:type:caliber:tier" | "k:hex:level:ready". */
  function parseChamber(st) {
    if (!st) return null;
    var s = String(st);
    if (s === "c") return { kind: "plain", caliber: "", tier: "", level: "", spent: false };
    if (/^[1-9]$/.test(s)) return { kind: "hex", caliber: "", tier: "", level: s, spent: true };
    var p = s.split(":");
    if (p[0] === "k" && p[1] === "hex") return { kind: "hex", level: p[2] || "", caliber: "", tier: "", spent: p[3] === "spent" };
    if (p[0] === "k") return { kind: p[1] || "plain", caliber: p[2] || "", tier: p[3] || "", level: "", spent: false };
    return { kind: "plain", caliber: "", tier: "", level: "", spent: false };
  }
  function isHexChamber(st) { var p = parseChamber(st); return !!(p && p.kind === "hex"); }
  function isPlainChamber(st) { return !!st && !isHexChamber(st); }
  function isSpecialChamber(st) {
    var p = parseChamber(st);
    if (!p || p.kind === "hex") return false;
    return p.kind === "buck" || p.kind === "slug" || p.kind === "percussion" || p.kind === "bigfifty" || p.kind === "arrows";
  }
  var ROUND_COLORS = {
    buck: "#c4a35a", slug: "#6b4f3a", percussion: "#7d8b99", bigfifty: "#4d6270", arrows: "#5e8a55",
    light: "#f3e7b3", medium: "#e0b84a", heavy: "#a86b32", plain: "#d7c07a",
    hex: ["#c4b5fd", "#a78bfa", "#8b5cf6", "#7c3aed", "#6d28d9", "#5b21b6", "#4c1d95", "#3b0764", "#2e1065"]
  };
  function chamberColor(st, g, w) {
    var p = parseChamber(st);
    if (!p) return "";
    if (p.kind === "hex") return ROUND_COLORS.hex[Math.max(0, num(p.level, 1) - 1)] || "#9b6fd6";
    if (ROUND_COLORS[p.kind]) return ROUND_COLORS[p.kind];
    var tier = p.tier;
    if (!tier && w && w.tiers) { try { tier = chamberOf(g, w).tier; } catch (e) { tier = ""; } }
    return ROUND_COLORS[tier] || ROUND_COLORS.plain;
  }
  function chamberLabel(st, g, w) {
    var p = parseChamber(st);
    if (!p) return "";
    if (p.kind === "hex") return "Hex shell " + p.level + (p.spent ? " (slot spent)" : " (slot not spent yet)");
    if (p.kind === "plain" || p.kind === "cartridge") {
      var tier = p.tier || (w && w.tiers ? chamberOf(g, w).tier : "");
      var cal = p.caliber || (w ? gunRound(g, w) : "");
      return (AMMO_LABEL.cartridge || "Cartridge") + (tier ? " · " + (TIER_LABEL[tier] || tier) : "") + (cal ? " " + cal : "");
    }
    return (AMMO_LABEL[p.kind] || p.kind) + (p.caliber ? " " + p.caliber : "");
  }
  function slotsLeft(level) {
    var n = hexBoxes(level), a = C().hexLead[level] || [], used = 0;
    for (var i = 0; i < n; i++) if (a[i]) used++;
    return Math.max(0, n - used);
  }
  function countHexChamber(g, level) {
    var n = 0;
    (g.chambers || []).forEach(function (st) {
      var p = parseChamber(st);
      if (p && p.kind === "hex" && String(p.level) === String(level)) n++;
    });
    return n;
  }
  /** Ammo pool for a gun: type + chambered round. Caster Guns take any cartridge (their chosen round first). */
  function gunPoolType(g, w) { return w.ammo === "shell" ? (g.load === "slug" ? "slug" : "buck") : w.ammo; }
  function gunRound(g, w) {
    if (!w.tiers) return w.caliber || "";
    var cc = chamberOf(g, w);
    if (w.ammo === "percussion") return "";
    if (w.ammo === "cartridge" && TIER_LABEL[cc.tier]) return TIER_LABEL[cc.tier];
    return cc.round;
  }
  function takePool(g, w, create) {
    var type = gunPoolType(g, w), round = gunRound(g, w), p = findPool(type, round, create);
    if ((!p || num(p.count) <= 0) && w.hexShells) p = C().ammo.filter(function (a) { return a.type === "cartridge" && num(a.count) > 0; })[0] || p;
    return { pool: p, type: type, round: round };
  }
  function hexBoxes(l) { var t = compute().hex[l] || 0, c = C(); if (hasOv(c, "hex." + l)) t = num(c.overrides["hex." + l]); return Math.max(0, Math.min(MAX_BOXES, t)); }
  function spendHex(l) { var a = C().hexLead[l], n = hexBoxes(l); for (var k = 0; k < n; k++) if (!a[k]) { a[k] = true; return true; } return false; }
  function refundHex(l) { var a = C().hexLead[l]; for (var k = a.length - 1; k >= 0; k--) if (a[k]) { a[k] = false; return true; } return false; }
  function returnChamber(st, g, w) {
    var p = parseChamber(st);
    if (!p) return "";
    if (p.kind === "hex") {
      if (p.spent) refundHex(num(p.level));
      return "hex " + p.level;
    }
    var type = p.kind === "plain" ? gunPoolType(g, w) : p.kind;
    var caliber = p.caliber || (p.kind === "plain" ? gunRound(g, w) : "");
    if (!type || type === "arrows") return type ? (AMMO_LABEL[type] || type) : "";
    var pool = findPool(type, caliber, true);
    if (pool) pool.count = num(pool.count) + 1;
    return (AMMO_LABEL[type] || type) + (pool && pool.caliber ? " " + pool.caliber : (caliber ? " " + caliber : ""));
  }
  function unloadGun(g, prevW, prevLoad, prevChamber) {
    if (!prevW || !prevW.capacity) return;
    var gg = { load: prevLoad, chamber: prevChamber, tier: g.tier, capacity: g.capacity };
    var a = normChambers(g, prevW);
    var bags = {};
    a.forEach(function (st) {
      if (!st) return;
      var key = returnChamber(st, gg, prevW);
      if (key) bags[key] = (bags[key] || 0) + 1;
    });
    var bits = Object.keys(bags).map(function (k) { return bags[k] + " " + k; });
    if (bits.length) toast("Unloaded " + bits.join(", ") + ".");
  }
  function unloadLoaded(i) {
    var g = C().guns[i], w = g && WPN[g.weapon];
    if (!w || !w.capacity) { toast("Pick a gun first."); return; }
    var a = normChambers(g, w);
    var bags = {};
    a.forEach(function (st, k) {
      if (!st) return;
      var key = returnChamber(st, g, w);
      if (key) bags[key] = (bags[key] || 0) + 1;
      a[k] = "";
    });
    g.loaded = 0;
    changed();
    publishGunCard();
    var bits = Object.keys(bags).map(function (k) { return bags[k] + " " + k; });
    if (bits.length && window.SSDNSAudio) window.SSDNSAudio.play("holster");
    toast(bits.length ? ("Unloaded " + bits.join(", ") + " back to your pile.") : "Already empty.");
  }
  function onGunChanged(i, what, old) {
    var g = C().guns[i];
    if (what === "weapon" && window.SSDNSEquip && window.SSDNSEquip.combatLocked && window.SSDNSEquip.combatLocked()) {
      g.weapon = old;
      toast(window.SSDNSEquip.LOCK_TIP);
      renderFields();
      return;
    }
    if (d4Pending(g) && (what === "weapon" || what === "chamber")) {
      if (what === "weapon") g.weapon = old;
      if (what === "chamber") g.chamber = old;
      toast("Roll the d4 first.");
      renderFields();
      return;
    }
    var prevW = WPN[what === "weapon" ? old : g.weapon];
    unloadGun(g, prevW, what === "load" ? old : g.load, what === "chamber" ? old : g.chamber);
    g.loaded = 0; g.chambers = []; g.jammed = false;
    var w = WPN[g.weapon];
    if (what === "weapon") { g.mod = ""; g.capacity = ""; g.misStreak = 0; g.lockedChambers = []; g.pendingD4 = false; g.pendingD4Rolls = null; g.pendingD4Step = 0; }
    if (what === "weapon" && w) {
      g.proficient = callingProficient(w);
      if (w.scatter) g.load = "buck";
      if (w.tiers) { g.chamber = ""; var cc = chamberOf(g, w); g.chamber = cc.tier + "|" + cc.round; g.tier = cc.tier; }
      var st = gunStats(g, compute(), i);
      if (w.capacity) toast(w.name + ": " + st.damage + ", range " + st.range + ", capacity " + w.capacity + ", misfire " + st.misfire + (st.round ? ", chambered " + st.round : "") + ". Starts empty: hit Reload.");
      var ammoType = w.ammo === "shell" || w.scatter ? "buck" : (w.ammo === "arrows" ? "arrows" : (w.ammo === "percussion" ? "percussion" : "cartridge"));
      var cal = ammoType === "percussion" ? "" : ((st && st.round) || (w.tiers ? "Light" : ""));
      g.equipped = false;
      if (window.SSDNSEquip && window.SSDNSEquip.tryAutoEquip) {
        var placed = window.SSDNSEquip.tryAutoEquip(C(), { kind: "gun", index: i });
        if (placed && !placed.equipped && placed.reason) toast(w.name + " stayed in your pack. " + placed.reason);
      }
    }
    if (what === "weapon" && !w) g.equipped = false;
    if (what === "chamber" && w && w.tiers) {
      if (g.chamberSet && old && String(old) !== String(g.chamber)) {
        g.chamber = old;
        if (w && w.id === "dullards-plinker-revolver") toast("A gunsmith rechambers a Plinker from .22 to .32 rimfire. Light only. Never Medium. Use Rechamber (gunsmith).");
        else toast("A gunsmith rechambers this: 500 ES per tier step. Light to Heavy is two steps. Use Rechamber (gunsmith).");
      } else {
        g.tier = chamberOf(g, w).tier;
        g.chamberSet = true;
      }
    }
  }
  function spendRound(i, k) {
    var g = C().guns[i], w = g && WPN[g.weapon];
    if (!g || !g.weapon) return { ok: false, reason: "Pick a gun first." };
    if (g.equipped === false) return { ok: false, reason: "Equip this weapon first." };
    if (g.ruined || g.broken) return { ok: false, reason: "Ruined. A gunsmith repairs it for 500 ES and a day. It comes back clean." };
    if (g.pendingD4) return { ok: false, reason: "Roll the d4 first." };
    if (g.jammed) return { ok: false, reason: "Jammed: clear it first" };
    if (g.fouled) return { ok: false, reason: "Fouled. It can't fire until it's cleaned." };
    if (w && w.capacity) {
      var a = normChambers(g, w);
      /* 0.3.72: null (no chamber picked; rollGun resets its chamber to null after each shot) is not a click.
         Before this, every Roll after the first one answered "Click." and didn't fire. */
      var clicked = k !== undefined && k !== null;
      var click = window.SSDNSApplied && window.SSDNSApplied.chamberClick
        ? window.SSDNSApplied.chamberClick(a[k], clicked)
        : { action: clicked && !a[k] ? "empty" : (clicked && isHexChamber(a[k]) ? "hex" : "fire") };
      if (click.action === "empty") return { ok: false, empty: true, reason: "Click." };
      if (click.action === "hex" || (clicked && isHexChamber(a[k]))) return { ok: false, reason: "That's a hex shell. Use Cast through gun — Roll never spends a slot." };
      if (clicked && chamberLocked(g, k)) return { ok: false, reason: "That chamber is locked." };
      if (!clicked) {
        k = -1;
        for (var n = 0; n < a.length; n++) {
          if (chamberLocked(g, n) || !a[n]) continue;
          k = n;
          break;
        }
        if (k >= 0 && isHexChamber(a[k])) return { ok: false, reason: "That's a hex shell. Use Cast through gun — Roll never spends a cartridge." };
        if (k < 0 || !isPlainChamber(a[k])) {
          k = -1;
          for (var p = 0; p < a.length; p++) if (!chamberLocked(g, p) && isPlainChamber(a[p])) { k = p; break; }
        }
      } else if (chamberLocked(g, k) || !isPlainChamber(a[k])) k = -1;
      if (k < 0) return { ok: false, reason: w.hexShells ? "No plain cartridge chambered. Cast through gun fires a hex shell." : "Out of rounds, Reload" };
      var was = a[k];
      a[k] = "";
      g.loaded = a.filter(Boolean).length;
      changed({ quiet: true });
      publishGunCard();
      return { ok: true, left: g.loaded, hex: "", chamber: k, was: was };
    }
    if (num(g.loaded) <= 0) return { ok: false, reason: "Out of rounds, Reload" };
    g.loaded = num(g.loaded) - 1;
    changed();
    publishGunCard();
    return { ok: true, left: g.loaded };
  }
  function spendHexChamber(i, level) {
    var g = C().guns[i], w = g && WPN[g.weapon];
    if (!w || !w.hexShells) return { ok: false, reason: "Not a Caster Gun." };
    var a = normChambers(g, w), k = -1, parsed = null;
    for (var n = 0; n < a.length; n++) {
      var p = parseChamber(a[n]);
      if (p && p.kind === "hex" && String(p.level) === String(level)) { k = n; parsed = p; break; }
    }
    if (k < 0) return { ok: false, reason: "Load a level-" + level + " hex shell first. Loading spends the slot. Then fire it from the chamber." };
    if (!(parsed && parsed.spent) && slotsLeft(level) <= 0) return { ok: false, reason: "No level-" + level + " slot left." };
    var was = a[k];
    a[k] = "";
    g.loaded = a.filter(Boolean).length;
    changed();
    return { ok: true, chamber: k, was: was, alreadySpent: !!(parsed && parsed.spent), left: g.loaded };
  }
  function fire(i, k) {
    var before = C().guns[i] && C().guns[i].chambers ? C().guns[i].chambers.slice() : null;
    var beforeN = C().guns[i] && C().guns[i].loaded;
    var spent = spendRound(i, k);
    if (spent && spent.empty) {
      if (window.SSDNSAudio) window.SSDNSAudio.play("empty-click");
      toast("Click.");
      return;
    }
    if (!spent.ok) { toast(spent.reason); return; }
    var g = C().guns[i], w = WPN[g.weapon];
    var cue = window.SSDNSAudio && window.SSDNSAudio.weaponCue
      ? window.SSDNSAudio.weaponCue(Object.assign({ gun: true }, w || {}, { id: g.weapon, sfx: (g && g.sfx) || (w && w.sfx) || "" }))
      : "attack";
    if (window.SSDNSAudio) window.SSDNSAudio.play(cue);
    var label = chamberLabel(spent.was, g, w) || "round";
    toast("Bang (" + label + "). " + g.loaded + " left in the " + (w ? w.name : "gun") + ".", "Undo", function () {
      if (before) g.chambers = before;
      g.loaded = num(beforeN);
      changed();
      publishGunCard();
    });
  }
  function spendHexSlot(level) {
    var l = num(level, 1);
    var a = C().hexLead[l];
    if (!a) return false;
    var n = hexBoxes(l), k = -1;
    for (var i = 0; i < n; i++) if (!a[i]) { k = i; break; }
    if (k < 0) return false;
    a[k] = true;
    suppress = true;
    $$('[data-f="character.hexLead.' + l + '.' + k + '"]').forEach(function (box) { box.checked = true; });
    suppress = false;
    changed();
    return true;
  }
  function consumeShard() {
    var color = ($("#consumeColor") && $("#consumeColor").value) || "white";
    var node = document.querySelector('#shards [data-f="shards.' + color + '"]');
    var n = num(node && node.value, 0);
    if (!node || n < 1) { toast("No " + color + " shards left."); return; }
    var label = color;
    SHARDS.forEach(function (s) { if (s.id === color) label = s.color; });
    node.value = String(n - 1);
    node.dispatchEvent(new Event("change", { bubbles: true }));
    toast("Consumed 1 " + label + " shard.");
    // The addiction chart stays with the DM. Joined rooms send a private consume note.
    // Offline, a same-browser DM Command Center can pick up the same note. The player log never hears it.
    var ping = {
      id: "con_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      ts: new Date().toISOString(),
      color: color,
      name: C().name || "",
      player: C().player || ""
    };
    var joined = window.SSDNSDmJoin && window.SSDNSDmJoin.isJoined && window.SSDNSDmJoin.isJoined() && window.SSDNSDmJoin.postRoll;
    if (joined) {
      window.SSDNSDmJoin.postRoll({
        private: true,
        label: "DM note",
        formula: "consume",
        result: 1,
        detail: color,
        consume: color
      });
    } else {
      try {
        var pingJson = JSON.stringify(ping);
        localStorage.setItem("ssdns.sheet.consumePing", pingJson);
        localStorage.setItem("ssdns.v1.consumePing", pingJson);
      } catch (e) {}
    }
  }
  function poolsForGun(g, w) {
    var want = gunPoolType(g, w);
    var round = gunRound(g, w);
    var norm = function (s) { return String(s || "").trim().toLowerCase(); };
    return (C().ammo || []).map(function (a, idx) { return { a: a, idx: idx }; }).filter(function (row) {
      var a = row.a;
      if (num(a.count) <= 0) return false;
      if (w.ammo === "shell" || w.scatter) {
        if (a.type !== "buck" && a.type !== "slug") return false;
        var gauge = round || (chamberOf(g, w).round || "");
        if (!gauge) return true;
        return norm(a.caliber) === norm(gauge) || !norm(a.caliber);
      }
      if (w.hexShells) return a.type === "cartridge";
      if (a.type !== want) return false;
      if (!round) return true;
      if (!norm(a.caliber)) return !g.chamberSet;
      if (norm(a.caliber) === norm(round)) return true;
      var tier = chamberOf(g, w).tier;
      if (tier && norm(a.caliber) === norm(TIER_LABEL[tier] || tier)) return true;
      return false;
    });
  }
  function tokenForPool(pool, g, w) {
    var tier = "";
    if (w.rounds && pool.caliber) TIERS.forEach(function (t) { if ((w.rounds[t] || []).indexOf(pool.caliber) >= 0) tier = t; });
    if (w.scatter && (pool.type === "buck" || pool.type === "slug")) g.load = pool.type === "slug" ? "slug" : "buck";
    if (w.hexShells) { /* caster guns are exempt from the chambering lock */ }
    else if (!g.chamberSet && tier && w.tiers) {
      var stamped = pool.caliber || (chamberOf(g, w).round || "");
      if (!String(pool.caliber || "").trim() && stamped) pool.caliber = stamped;
      g.chamber = tier + "|" + (stamped || "");
      g.tier = tier;
      g.chamberSet = true;
    }
    return "k:" + pool.type + ":" + (pool.caliber || "") + ":" + tier;
  }
  function ammoPoolLabel(a) {
    var name = AMMO_LABEL[a.type] || a.type || "Ammo";
    if (a.type === "cartridge" && a.caliber && window.SSDNSApplied && window.SSDNSApplied.cartridgePoolLabel) {
      name = window.SSDNSApplied.cartridgePoolLabel(a.caliber) || a.caliber;
    } else if (a.caliber) name += " " + a.caliber;
    return name + " (" + num(a.count) + ")";
  }
  function paintAmmoPool(i, g, w, cap) {
    var sel = $('[data-ammopool="' + i + '"]');
    if (!sel) return;
    if (!cap || !w) { sel.hidden = true; sel.innerHTML = ""; sel.removeAttribute("data-sig"); return; }
    sel.hidden = false;
    var rows = poolsForGun(g, w);
    var keep = (g && g.ammoPool !== "" && g.ammoPool != null) ? String(g.ammoPool) : sel.value;
    var sig = rows.map(function (row) { return row.idx + ":" + row.a.type + ":" + (row.a.caliber || "") + ":" + num(row.a.count); }).join("|");
    if (sel.getAttribute("data-sig") === sig) {
      if (keep && sel.querySelector('option[value="' + keep + '"]')) sel.value = keep;
      return;
    }
    sel.setAttribute("data-sig", sig);
    sel.innerHTML = "";
    if (!rows.length) sel.appendChild(opt("", "No matching ammo"));
    rows.forEach(function (row) { sel.appendChild(opt(String(row.idx), ammoPoolLabel(row.a))); });
    if (keep && sel.querySelector('option[value="' + keep + '"]')) sel.value = keep;
  }
  function chosenAmmoPool(i, g, w) {
    var idx = null;
    if (g && g.ammoPool !== "" && g.ammoPool != null && isFinite(Number(g.ammoPool))) idx = Number(g.ammoPool);
    else {
      var sel = $('[data-ammopool="' + i + '"]');
      if (sel && sel.value !== "") idx = Number(sel.value);
    }
    if (idx == null || !isFinite(idx)) return null;
    var pool = (C().ammo || [])[idx];
    if (!pool) return null;
    var rows = poolsForGun(g, w);
    var hit = rows.filter(function (row) { return row.idx === idx; })[0];
    return hit ? hit.a : null;
  }
  function showLoadPicks(i, rows, max) {
    var box = $('[data-loadpick="' + i + '"]');
    if (!box) return;
    box.innerHTML = "";
    box.hidden = false;
    rows.forEach(function (row) {
      var a = row.a;
      var token = "k:" + a.type + ":" + (a.caliber || "") + ":";
      var b = el("button", {
        type: "button", class: "btn sm load-pick", "data-takepool": i + ":" + row.idx + ":" + (max || 0),
        text: (AMMO_LABEL[a.type] || a.type) + (a.caliber ? " " + a.caliber : "") + " (" + a.count + ")"
      });
      b.style.borderColor = chamberColor(token, C().guns[i], WPN[C().guns[i].weapon]);
      box.appendChild(b);
    });
  }
  function reloadFromPool(i, pool, max) {
    var g = C().guns[i], w = WPN[g.weapon];
    if (d4Pending(g)) { toast("Roll the d4 first."); return; }
    if (!w || !w.capacity || !pool) return;
    var a = normChambers(g, w);
    var need = openChamberCount(g, a);
    if (max) need = Math.min(need, max);
    if (need <= 0) { toast(a.some(function (st, k) { return !st && chamberLocked(g, k); }) ? "Locked chambers stay closed." : "Already full."); return; }
    if (num(pool.count) <= 0) { toast("That pile is empty."); return; }
    var take = Math.min(need, num(pool.count));
    var token = tokenForPool(pool, g, w);
    pool.count = num(pool.count) - take;
    for (var k = 0, n = take; k < a.length && n > 0; k++) if (!a[k] && !chamberLocked(g, k)) { a[k] = token; n--; }
    g.loaded = a.filter(Boolean).length;
    var picks = $('[data-loadpick="' + i + '"]');
    if (picks) { picks.innerHTML = ""; picks.hidden = true; }
    changed();
    publishGunCard();
    if (window.SSDNSAudio) window.SSDNSAudio.play(window.SSDNSAudio.reloadCue ? window.SSDNSAudio.reloadCue(w) : "reload");
    var tierNote = pool.caliber && w.tiers ? " Chambered " + (TIER_LABEL[g.tier] || g.tier || "") + " " + pool.caliber + "." : "";
    var rc = reloadCost(g, w, max);
    var how = max ? "Tactical Reload +" + take + " (bonus action)" : "Reloaded " + take + (take < need ? " (all you had)" : "") + " (" + costWords(rc) + (rc === "bonus" ? ", Quick Reload" : "") + ")";
    toast(how + ". " + pool.count + " " + (AMMO_LABEL[pool.type] || pool.type) + (pool.caliber ? " " + pool.caliber : "") + " left." + tierNote);
  }
  /* 0.3.54: what a reload costs. Slow guns take a full turn. Gunslinger Quick Reload (3rd level)
     makes a reload a bonus action, except slow guns and a Rolling-Block chambered Heavy. */
  function quickReload(g, w) {
    var c = C();
    if (!w || w.slow || c.calling !== "gunslinger" || num(c.level, 1) < 3) return false;
    if (w.id === "dulls-rolling-block-rifle" && chamberOf(g, w).tier === "heavy") return false;
    return true;
  }
  function reloadCost(g, w, max) {
    if (max) return "bonus";
    if (!w) return "action";
    if (w.slow) return "full";
    return quickReload(g, w) ? "bonus" : "action";
  }
  function costWords(cost) { return cost === "full" ? "slow load: full turn" : (cost === "bonus" ? "bonus action" : (cost === "free" ? "free action" : "action")); }
  function gunKey(i) { var g = C().guns[i]; return g ? String(g.loaded) + ":" + (g.chambers || []).join("|") : ""; }
  /** Player button press: run the gun action, spend pips only if something changed. */
  function withCost(i, cost, what, fn) {
    var before = gunKey(i);
    var out = fn();
    var spend = function (ok) { if (ok && window.SSDNSActionPips && cost !== "free") window.SSDNSActionPips.spend(cost, what); };
    if (out && typeof out.then === "function") { out.then(function (v) { spend(!!v || gunKey(i) !== before); }); return out; }
    spend(out === true || gunKey(i) !== before);
    return out;
  }
  function reload(i, max) {
    var g = C().guns[i], w = WPN[g.weapon];
    if (g && g.equipped === false) { toast("Equip this weapon first."); return; }
    if (d4Pending(g)) { toast("Roll the d4 first."); return; }
    if (!w || !w.capacity) return;
    var a = normChambers(g, w);
    var need = openChamberCount(g, a);
    if (max) need = Math.min(need, max);
    if (need <= 0) { toast("Already full."); return; }
    var rows = poolsForGun(g, w);
    if (!rows.length) {
      var tp = takePool(g, w, false);
      var msg = "No ammo for this caliber";
      toast(msg);
      if (window.SSDNSSheet && window.SSDNSSheet.addLog) window.SSDNSSheet.addLog({ kind: "alert", text: (w.name || "Gun") + ": " + msg });
      return;
    }
    var picked = chosenAmmoPool(i, g, w);
    if (picked) { reloadFromPool(i, picked, max); return; }
    if (rows.length > 1 && !max) { showLoadPicks(i, rows, 0); toast("Pick which rounds to load."); return; }
    reloadFromPool(i, rows[0].a, max);
  }
  function hasGunBelt() {
    var c = C(), h = HOL[c.holster], b = HOL[c.belt];
    return !!c.gunBelt || !!(h && h.feedsTR) || !!(b && b.feedsTR);
  }
  function fanTrLocked() {
    /* 0.3.73: Pistolero Fan the Hammer uses the bonus action: no Tactical Reload for the rest of that turn */
    var F = window.SSDNSFan;
    if (!F || !F.trLocked || !F.trLocked()) return false;
    toast(F.TR_MSG);
    if (window.SSDNSSheet && window.SSDNSSheet.addLog) window.SSDNSSheet.addLog({ kind: "alert", text: F.TR_MSG });
    return true;
  }
  function tacticalReload(i) {
    if (fanTrLocked()) return;
    var g = C().guns[i], w = WPN[g.weapon];
    if (g && g.equipped === false) { toast("Equip this weapon first."); return; }
    if (d4Pending(g)) { toast("Roll the d4 first."); return; }
    if (!canTacticalReload(w)) { toast("This gun can't Tactical Reload (TR —)."); return; }
    if (!hasGunBelt()) {
      // v0.2.1: soft requirement (PHB Reloading: TR loads from a gun belt or bandolier). Warn; the player can override.
      $('.gun[data-row="' + i + '"]').classList.add("tr-warn");
      toast("No gun belt or bandolier (tick the box under Holster, or pick Gun Belt / Bandolier). The PHB says Tactical Reload loads from one; rounds in a box, pouch or saddlebag need a full reload.", "Load anyway", function () {
        $('.gun[data-row="' + i + '"]').classList.remove("tr-warn"); reload(i, 1);
      }, 10000);
      return;
    }
    reload(i, 1);
  }
  function finishHexLoad(i, g, w, lvl, a, k) {
    if (slotsLeft(lvl) <= 0) { toast("No level-" + lvl + " slot left."); return; }
    a[k] = "k:hex:" + lvl + ":spent";
    g.chambers = a;
    g.loaded = a.filter(Boolean).length;
    if (!spendHexSlot(lvl)) {
      a[k] = "";
      g.loaded = a.filter(Boolean).length;
      toast("No level-" + lvl + " slot left.");
      return;
    }
    changed();
    publishGunCard();
    if (window.SSDNSAudio) window.SSDNSAudio.play(window.SSDNSAudio.reloadCue ? window.SSDNSAudio.reloadCue(w) : "reload");
    toast("Loaded a level-" + lvl + " hex shell. The slot is spent. Cast through gun fires it as a spell attack.");
  }
  function loadHexShell(i) {
    var g = C().guns[i], w = WPN[g.weapon];
    if (g && g.equipped === false) { toast("Equip this weapon first."); return; }
    if (!w || !w.hexShells) return;
    var lvl = num($('[data-hexlvl="' + i + '"]').value, 1), a = normChambers(g, w), k = firstOpenChamber(g, a);
    if (k < 0) {
      var plain = -1;
      for (var p = 0; p < a.length; p++) if (isPlainChamber(a[p])) { plain = p; break; }
      if (plain < 0) { toast("Every chamber is a hex shell. Fire or unload one first."); return; }
      var ask = window.SSDNSAsk && window.SSDNSAsk.confirm
        ? window.SSDNSAsk.confirm("Swap one round for a hex shell?")
        : Promise.resolve(false);
      ask.then(function (ok) {
        if (!ok) {
          if (window.SSDNSSheet && window.SSDNSSheet.addLog) window.SSDNSSheet.addLog({ kind: "alert", text: "Declined swapping a round for a hex shell." });
          return;
        }
        returnChamber(a[plain], g, w);
        a[plain] = "";
        g.chambers = a;
        finishHexLoad(i, g, w, lvl, a, plain);
      });
      return;
    }
    finishHexLoad(i, g, w, lvl, a, k);
  }
  function publishGunCard() {
    if (window.SSDNSDmJoin && window.SSDNSDmJoin.publishSnapshot) {
      try { window.SSDNSDmJoin.publishSnapshot(); } catch (e) {}
    }
    if (window.SSDNSMapHost && window.SSDNSMapHost.refreshCard) {
      try { window.SSDNSMapHost.refreshCard(); } catch (e) {}
    }
  }
  function refreshGunFace() {
    if (window.SSDNSDmJoin && window.SSDNSDmJoin.isReadOnly && window.SSDNSDmJoin.isReadOnly()) return;
    try { renderCalc(); } catch (err) { console.warn("[sheet] gun face", err); }
    try { changed({ noRender: true }); } catch (err2) {}
    publishGunCard();
  }
  function ammoChoices(i) {
    var g = C().guns[i], w = g && WPN[g.weapon];
    if (!g || !w || !w.capacity) return [];
    return poolsForGun(g, w).map(function (row) {
      return { idx: row.idx, label: ammoPoolLabel(row.a), count: num(row.a.count), type: row.a.type || "", caliber: row.a.caliber || "" };
    });
  }
  function setGunAmmoPool(i, idx) {
    var g = C().guns[i], w = g && WPN[g.weapon];
    if (!g) return false;
    var next = idx == null ? "" : String(idx);
    if (next !== "") {
      var n = Number(next);
      var rows = w ? poolsForGun(g, w) : [];
      if (!rows.some(function (row) { return row.idx === n; })) return false;
      next = String(n);
    }
    g.ammoPool = next;
    var sel = $('[data-ammopool="' + i + '"]');
    if (sel && sel.value !== next) sel.value = next;
    changed();
    publishGunCard();
    return true;
  }
  function setGunAttackMode(i, mode) {
    var g = C().guns[i];
    if (!g) return false;
    var next = mode === "adv" || mode === "dis" ? mode : "";
    g.attackMode = next;
    var sel = $('[data-adv="' + i + '"]');
    if (sel && sel.value !== next) sel.value = next;
    paintAdvTicks(i, next);
    changed();
    publishGunCard();
    return true;
  }
  function paintAdvTicks(i, mode) {
    /* 0.3.75: the ADV / DIS ticks mirror the attack mode (one at most) */
    $$('[data-advtick="' + i + '"]').forEach(function (b) { b.checked = b.value === mode; });
  }
  function gunAttackMode(i) {
    var g = C().guns[i];
    if (g && (g.attackMode === "adv" || g.attackMode === "dis")) return g.attackMode;
    var sel = $('[data-adv="' + i + '"]');
    var globalAdv = $("#globalAdv");
    return (sel && sel.value) || (globalAdv && globalAdv.value) || "";
  }
  function loadHexAt(i, level) {
    var sel = $('[data-hexlvl="' + i + '"]');
    if (sel && level != null && level !== "") sel.value = String(level);
    return loadHexShell(i);
  }
  function castList() {
    return castChoices().map(function (ch) {
      var slots = [];
      if (ch.level) {
        for (var sl = ch.level; sl <= 9; sl++) {
          if (sl !== ch.level && hexBoxes(sl) <= 0) continue;
          slots.push({ value: String(sl), label: ordinal(sl) + " shell" });
        }
      }
      return {
        level: ch.level,
        name: ch.name,
        value: ch.value,
        label: (ch.level ? ordinal(ch.level) + " · " : "") + ch.name,
        slots: slots
      };
    });
  }
  function ensureSelectValue(sel, value) {
    if (!sel || value == null || value === "") return;
    var val = String(value);
    var found = false;
    Array.prototype.forEach.call(sel.options || [], function (op) { if (op.value === val) found = true; });
    if (!found) sel.appendChild(opt(val, val));
    sel.value = val;
  }
  function prepareGunCast(i, spell, slot) {
    ensureSelectValue($('[data-castspell="' + i + '"]'), spell);
    var slotSel = $('[data-castslot="' + i + '"]');
    if (slotSel && slot != null && slot !== "") {
      slotSel.hidden = false;
      ensureSelectValue(slotSel, slot);
    }
  }
  function toolProfBonus() {
    var v = compute();
    var blob = [C().proficienciesLanguages, C().equipment, C().features].join("\n").toLowerCase();
    if (/tinker/.test(blob) || /gunsmith/.test(blob)) return v.prof || 0;
    return 0;
  }
  function rollJamCheck() {
    var v = compute();
    var dex = (v.mods && v.mods.DEX) || 0;
    var prof = toolProfBonus();
    var n = 1 + Math.floor(Math.random() * 20);
    var detail = String(n) + (dex ? ((dex >= 0 ? "+" : "") + dex) : "") + (prof ? ("+" + prof + " tools") : "");
    return { nat: n, total: n + dex + prof, detail: detail };
  }
  function chargeEs(amount, reason) {
    var logged = reason + " (" + amount + " ES)";
    var c = C();
    if (c && typeof c.es === "number" && isFinite(c.es)) {
      if (c.es < amount) {
        if (window.SSDNSSheet) window.SSDNSSheet.addLog({ kind: "alert", text: logged + " — logged, not deducted (not enough ES)." });
        return { paid: false, logged: true };
      }
      c.es -= amount;
      return { paid: true, logged: false };
    }
    var Bridge = window.SSDNSBridge;
    if (Bridge && S.doc.shards && Bridge.cpValue(S.doc.shards) >= amount && Bridge.applyDelta) {
      var w = Bridge.applyDelta(-amount, "gunsmith");
      if (w && w.shards) {
        S.doc.shards = Bridge.cleanShards(w.shards);
        return { paid: true, logged: false };
      }
    }
    if (window.SSDNSSheet) window.SSDNSSheet.addLog({ kind: "alert", text: logged + " — logged, not deducted (no ES field with enough to pay)." });
    return { paid: false, logged: true };
  }
  function openCleanModal(gunName, options) {
    var M = window.SSDNSMisfire;
    if (M && M.pickClean) return M.pickClean(gunName, options);
    return Promise.resolve(null);
  }
  function applyCleanChoice(i, g, pick) {
    var M = window.SSDNSMisfire;
    if (!M || !pick) return;
    var name = WPN[g.weapon] ? WPN[g.weapon].name : "Gun";
    if (pick.cost) chargeEs(pick.cost, name + ": " + pick.label);
    var applied = M.commitClean ? M.commitClean(g, pick.id) : M.applyClean(g, pick.id);
    if (!applied.ok) { toast(applied.reason || "That clean isn't available."); return; }
    if (!M.commitClean) {
      var next = applied.gun;
      g.dirty = !!next.dirty;
      g.fouled = !!next.fouled;
      g.jammed = !!next.jammed;
      g.ruined = !!next.ruined;
      g.broken = !!next.broken;
      g.misStreak = next.misStreak || 0;
      if (pick.resetStreak || pick.comesClean) {
        g.pendingD4 = false;
        g.pendingD4Rolls = null;
        g.pendingD4Step = 0;
      }
    }
    changed();
    var line = name + ": " + pick.label + ".";
    toast(line);
    if (window.SSDNSSheet && window.SSDNSSheet.addLog) window.SSDNSSheet.addLog({ kind: "alert", text: line });
    if (window.SSDNSDmJoin && window.SSDNSDmJoin.publishSnapshot) {
      try { window.SSDNSDmJoin.publishSnapshot(); } catch (e) {}
    }
    if (window.SSDNSMapHost && window.SSDNSMapHost.refreshCard) {
      try { window.SSDNSMapHost.refreshCard(); } catch (e) {}
    }
  }
  function finishClean(i, g, pick) {
    if (!pick) return Promise.resolve(false);
    if (pick.check) {
      var rolled = rollJamCheck();
      var line = "Jam check " + rolled.detail + " = " + rolled.total + " vs DC " + pick.check.dc;
      if (rolled.total < pick.check.dc) {
        toast(line + ". The jam stays.");
        if (window.SSDNSSheet) window.SSDNSSheet.addLog({ kind: "roll", text: line + " — fail" });
        return Promise.resolve(false);
      }
      if (window.SSDNSSheet) window.SSDNSSheet.addLog({ kind: "roll", text: line + " — success" });
    }
    applyCleanChoice(i, g, pick);
    /* 0.3.56 SFX: unjam has its own sound; every other clean option plays the cleaning sound. */
    if (window.SSDNSAudio) window.SSDNSAudio.play(/unjam/i.test(String(pick.id || pick.key || pick.value || pick.label || "")) ? "unjam" : "clean");
    return Promise.resolve(true);
  }
  /* 0.3.54: Unload has no PHB cost; the sheet treats it like a reload: an action. */
  var UNLOAD_COST = "action";
  function unjamCost(i) {
    var g = C().guns[i], w = g && WPN[g.weapon];
    var free = window.SSDNSMisfire && window.SSDNSMisfire.unjamIsFree && window.SSDNSMisfire.unjamIsFree({
      weapon: g && g.weapon, mod: g && g.mod, feats: C().feats || [], name: w && w.name, properties: w && w.properties, rugged: !!(w && /rugged/i.test(w.properties || ""))
    });
    return free ? "free" : "bonus";
  }
  /* 0.3.54: gunsmith rechamber. 500 ES per tier step; a same-tier change (another round in the
     same tier) is one gunsmith job, 500 ES. The Plinker only goes .22 LR -> .32 rimfire. */
  var TIER_STEP = { light: 0, medium: 1, heavy: 2 };
  function rechamberOptions(i) {
    var g = C().guns[i], w = g && WPN[g.weapon];
    if (!g || !w || !w.tiers || w.hexShells) return [];
    var cur = chamberOf(g, w);
    var curKey = cur.tier + "|" + cur.round;
    return chamberOptions(w).filter(function (o) { return o[0] !== curKey; }).map(function (o) {
      var tier = o[0].split("|")[0], round = o[0].split("|")[1] || "";
      var steps = Math.abs((TIER_STEP[tier] || 0) - (TIER_STEP[cur.tier] || 0));
      var allowed = true, why = "";
      if (w.id === "dullards-plinker-revolver") {
        allowed = /\.22/.test(cur.round) && /\.32/.test(round);
        why = allowed ? "" : "A Plinker only goes from .22 LR to .32 rimfire. Light only, never Medium.";
      }
      return { value: o[0], label: o[1], tier: tier, round: round, steps: steps, cost: 500 * Math.max(1, steps), allowed: allowed, why: why };
    });
  }
  function rechamberGun(i, value, opts) {
    opts = opts || {};
    var g = C().guns[i], w = g && WPN[g.weapon];
    if (!g || !w) return { ok: false, reason: "Pick a gun first." };
    if (d4Pending(g)) return { ok: false, reason: "Roll the d4 first." };
    var opt = rechamberOptions(i).filter(function (o) { return o.value === value; })[0];
    if (!opt) return { ok: false, reason: "That chambering isn't offered for this gun." };
    if (!opt.allowed && !opts.free) return { ok: false, reason: opt.why };
    var paid = 0;
    if (!opts.free) {
      var bill = chargeEs(opt.cost, "Gunsmith rechamber " + w.name + " to " + opt.label);
      if (!bill.paid) return { ok: false, reason: "Not enough ES: the gunsmith wants " + opt.cost + " ES." };
      paid = opt.cost;
    }
    unloadGun(g, w, g.load, g.chamber);
    g.loaded = 0; g.chambers = [];
    g.chamber = opt.value; g.tier = opt.tier; g.chamberSet = true;
    renderFields(); changed(); publishGunCard();
    if (window.SSDNSAudio) window.SSDNSAudio.play("rechamber");
    var line = w.name + " rechambered to " + opt.label + (opts.free ? " (DM, free)." : " by a gunsmith for " + paid + " ES.") + " It's empty: hit Reload.";
    toast(line);
    if (window.SSDNSSheet && window.SSDNSSheet.addLog) window.SSDNSSheet.addLog({ kind: "alert", text: line });
    return { ok: true, paid: paid, chamber: opt.value };
  }
  function openRechamber(i) {
    var g = C().guns[i], w = g && WPN[g.weapon];
    var list = rechamberOptions(i);
    if (!list.length) { toast("This gun has no other chambering."); return; }
    var old = document.querySelector(".rc-modal"); if (old) old.remove();
    var cur = chamberOf(g, w);
    var wallet = (typeof C().es === "number" && isFinite(C().es)) ? C().es : compute().cp;
    var box = el("div", { class: "rc-modal", role: "dialog", "aria-modal": "true", "aria-label": "Rechamber (gunsmith)" });
    var rows = list.map(function (o, n) {
      var id = "rc-opt-" + n;
      return el("label", { class: "rc-row" + (o.allowed ? "" : " rc-off"), for: id }, [
        el("input", { type: "radio", name: "rc-pick", id: id, value: o.value, disabled: o.allowed ? null : "disabled" }),
        el("span", { class: "rc-name", text: o.label }),
        el("span", { class: "rc-cost", text: o.allowed ? (o.cost + " ES" + (o.steps > 1 ? " (" + o.steps + " tier steps)" : (o.steps === 1 ? " (1 tier step)" : " (same tier)"))) : o.why })
      ]);
    });
    var msg = el("p", { class: "rc-msg fine" });
    var ok = el("button", { type: "button", class: "btn", text: "Pay and rechamber", disabled: "disabled" });
    var cancel = el("button", { type: "button", class: "btn", text: "Cancel" });
    box.appendChild(el("div", { class: "rc-card" }, [
      el("h3", { text: "Rechamber (gunsmith)" }),
      el("p", { class: "fine", text: w.name + " is chambered " + (TIER_LABEL[cur.tier] || cur.tier) + (cur.round ? " " + cur.round : "") + ". A gunsmith charges 500 ES per tier step (Light to Heavy is two steps); another round in the same tier is one job, 500 ES. The gun comes back empty and your rounds go back to your ammo." }),
      el("div", { class: "rc-list" }, rows),
      el("p", { class: "fine rc-wallet", text: "You have " + num(wallet).toLocaleString() + " ES." }),
      msg,
      el("div", { class: "rc-btns" }, [cancel, ok])
    ]));
    document.body.appendChild(box);
    box.addEventListener("change", function () {
      var pick = box.querySelector("input[name=rc-pick]:checked");
      var o = pick && list.filter(function (x) { return x.value === pick.value; })[0];
      ok.disabled = !o;
      msg.textContent = o ? (num(wallet) >= o.cost ? "Pays " + o.cost + " ES." : "You need " + o.cost + " ES; you have " + num(wallet) + ".") : "";
    });
    cancel.addEventListener("click", function () { box.remove(); });
    ok.addEventListener("click", function () {
      var pick = box.querySelector("input[name=rc-pick]:checked");
      if (!pick) return;
      var r = rechamberGun(i, pick.value);
      if (!r.ok) { msg.textContent = r.reason; return; }
      box.remove();
    });
  }
  function unjamGun(i) {
    var g = C().guns[i];
    if (!g || !g.weapon) { toast("Pick a gun first."); return Promise.resolve(false); }
    if (!g.jammed) { toast("This gun isn't jammed."); return Promise.resolve(false); }
    return applyCleanOption(i, "unjam");
  }
  function reopenChamber(i) {
    var g = C().guns[i];
    if (!g || !g.weapon) { toast("Pick a gun first."); return false; }
    if ((C().feats || []).indexOf("muzzleloader") < 0) { toast("Reopen chamber needs the Muzzleloader feat."); return false; }
    if (C().muzzleReopenUsed) { toast("Reopen chamber is once per short rest."); return false; }
    var M = window.SSDNSMisfire;
    var idx = M && M.reopenIndex ? M.reopenIndex(g) : null;
    if (idx == null) { toast("No locked chamber."); return false; }
    g.lockedChambers = (g.lockedChambers || []).filter(function (n) { return Number(n) !== idx; });
    C().muzzleReopenUsed = true;
    changed();
    var name = WPN[g.weapon] ? WPN[g.weapon].name : "Gun";
    var line = name + ": reopened chamber " + (idx + 1) + " (action, once per short rest).";
    if (window.SSDNSAudio) window.SSDNSAudio.play("rechamber");
    toast(line);
    if (window.SSDNSSheet && window.SSDNSSheet.addLog) window.SSDNSSheet.addLog({ kind: "alert", text: line });
    publishGunCard();
    return true;
  }
  function clearLockedChambers(i, mode, chamber) {
    var g = C().guns[i];
    if (!g) return false;
    var M = window.SSDNSMisfire;
    if (!M || !M.clearLocks) return false;
    var before = M.lockupCount ? M.lockupCount(g) : ((g.lockedChambers || []).length);
    if (!before && !(g.lockedChambers && g.lockedChambers.length)) return false;
    var next = M.clearLocks(g, mode === "one" ? "one" : "all", chamber);
    if (!next.cleared || !next.cleared.length) return false;
    g.lockedChambers = (next.lockedChambers || []).slice();
    var name = WPN[g.weapon] ? WPN[g.weapon].name : "Gun";
    var line = mode === "one"
      ? "DM cleared one locked chamber on " + name + "."
      : "DM cleared all locked chambers on " + name + ".";
    if (window.SSDNSSheet && window.SSDNSSheet.addLog) window.SSDNSSheet.addLog({ kind: "alert", text: line });
    refreshGunFace();
    return true;
  }
  function repairGun(i, hint) {
    var guns = C().guns || [];
    var g = guns[i];
    hint = hint || {};
    if (!g || !g.weapon) {
      var want = hint.weapon || "";
      var wantName = hint.name || "";
      for (var n = 0; n < guns.length; n++) {
        var row = guns[n];
        if (!row || !row.weapon) continue;
        var rowName = WPN[row.weapon] ? WPN[row.weapon].name : "";
        if ((want && row.weapon === want) || (wantName && rowName === wantName)) {
          g = row;
          break;
        }
      }
    }
    if (!g) return false;
    var M = window.SSDNSMisfire;
    if (!M || !M.repair) return false;
    var next = M.repair(g);
    g.fouled = false;
    g.ruined = false;
    g.broken = false;
    g.jammed = false;
    g.dirty = false;
    g.cracked = false;
    g.misStreak = 0;
    g.lockedChambers = (next.lockedChambers || []).slice();
    g.pendingD4 = false;
    g.pendingD4Rolls = null;
    g.pendingD4Step = 0;
    g.exploded = false;
    if (window.SSDNSD4 && window.SSDNSD4.cancel) window.SSDNSD4.cancel();
    var name = WPN[g.weapon] ? WPN[g.weapon].name : (hint.name || "Gun");
    var line = "DM repaired " + name + ".";
    if (window.SSDNSAudio) window.SSDNSAudio.play("rechamber");

    if (window.SSDNSSheet && window.SSDNSSheet.addLog) window.SSDNSSheet.addLog({ kind: "alert", text: line });
    refreshGunFace();
    return true;
  }
  function promptShortRestTools() {
    var guns = (C().guns || []).filter(Boolean);
    guns.forEach(function (g) { g.misStreak = 0; });
    C().muzzleReopenUsed = false;
    var any = guns.some(function (g) { return g.lockedChambers && g.lockedChambers.length; });
    if (!any) {
      changed();
      return Promise.resolve(false);
    }
    var ask = window.SSDNSAsk && window.SSDNSAsk.confirm
      ? window.SSDNSAsk.confirm("Short rest with tools? Reopen all locked chambers + reset streak")
      : Promise.resolve(false);
    return ask.then(function (yes) {
      if (yes) guns.forEach(function (g) { g.lockedChambers = []; g.misStreak = 0; });
      changed();
      return !!yes;
    });
  }
  function cleanGun(i) {
    var g = C().guns[i];
    if (!g || !g.weapon) { toast("Pick a gun first."); return Promise.resolve(false); }
    if (d4Pending(g)) { toast("Roll the d4 first."); return Promise.resolve(false); }
    var M = window.SSDNSMisfire;
    var opts = M ? M.cleanOptions(g) : [];
    if (!opts.length) { toast("This gun isn't jammed, dirty, fouled, or ruined."); return Promise.resolve(false); }
    var name = WPN[g.weapon] ? WPN[g.weapon].name : "Gun";
    return openCleanModal(name, opts).then(function (pick) {
      if (!pick) return false;
      return finishClean(i, g, pick);
    });
  }
  function applyCleanOption(i, optionId) {
    var g = C().guns[i];
    if (!g || !g.weapon) { toast("Pick a gun first."); return Promise.resolve(false); }
    if (d4Pending(g)) { toast("Roll the d4 first."); return Promise.resolve(false); }
    var M = window.SSDNSMisfire;
    var opts = M ? M.cleanOptions(g) : [];
    var pick = null;
    for (var n = 0; n < opts.length; n++) if (opts[n].id === optionId) pick = opts[n];
    if (!pick) { toast("This gun isn't jammed, dirty, fouled, or ruined."); return Promise.resolve(false); }
    return finishClean(i, g, pick);
  }
  function applyEquipToggle(t) {
    var Equip = window.SSDNSEquip;
    if (!Equip) return;
    var kind = t.id === "focusEquipped" ? "focus" : (t.getAttribute("data-equip") || "gun");
    var index = t.getAttribute("data-equip-i");
    var want = !!t.checked;
    var result = Equip.setEquipped(C(), { kind: kind, index: index, equipped: want });
    if (!result || !result.ok) {
      t.checked = !want;
      toast((result && result.reason) || Equip.LOCK_TIP);
      renderFields();
      return;
    }
    changed();
  }
  function receiveWeapon(payload) {
    payload = payload || {};
    var kind = payload.kind === "melee" ? "melee" : "gun";
    var list = kind === "melee" ? (C().melee || (C().melee = [])) : (C().guns || []);
    var slot = -1;
    var i;
    for (i = 0; i < list.length; i++) {
      if (list[i] && !list[i].weapon) { slot = i; break; }
    }
    var label = payload.name || payload.weapon || "weapon";
    if (slot < 0 || !payload.weapon) {
      var note = "• " + label + " (taken)";
      var cur = C().equipment || "";
      if (cur.indexOf(note) < 0) C().equipment = (cur ? cur.replace(/\s+$/, "") + "\n" : "") + note;
      var ta = document.querySelector('[data-f="character.equipment"]');
      if (ta) ta.value = C().equipment;
      changed();
      publishGunCard();
      return { ok: false, parked: true, name: label, equipped: false };
    }
    list[slot].weapon = payload.weapon;
    list[slot].equipped = false;
    list[slot].loaded = 0;
    list[slot].chambers = [];
    if (payload.equipped && window.SSDNSEquip && window.SSDNSEquip.setEquipped) {
      window.SSDNSEquip.setEquipped(C(), { kind: kind, index: slot, equipped: true, dm: !!payload.dm, combat: false });
    }
    renderFields();
    changed();
    publishGunCard();
    return { ok: true, index: slot, name: label, equipped: list[slot].equipped === true };
  }
  function removeGearLine(text) {
    var needle = String(text || "").trim().replace(/^•\s*/, "");
    if (!needle) return false;
    var lines = String(C().equipment || "").split("\n");
    var idx = -1;
    var n;
    for (n = 0; n < lines.length; n++) {
      if (String(lines[n] || "").indexOf(needle) >= 0) { idx = n; break; }
    }
    if (idx < 0) return false;
    lines.splice(idx, 1);
    C().equipment = lines.join("\n").replace(/^\n+|\n+$/g, "");
    var box = document.querySelector('[data-f="character.equipment"]');
    if (box) box.value = C().equipment;
    changed();
    publishGunCard();
    return true;
  }
  function setEquipped(opts) {
    var Equip = window.SSDNSEquip;
    if (!Equip) return { ok: false, reason: "Equip rules aren't loaded." };
    opts = opts || {};
    var result = Equip.setEquipped(C(), opts);
    if (result && result.ok) { changed(); publishGunCard(); }
    else renderFields();
    return result;
  }
  function clearDrawn() {
    (C().guns || []).forEach(function (g) { if (g) g.drawn = false; });
  }
  function grantTestGun(index) {
    var jam = window.SSDNSTestJammer && window.SSDNSTestJammer.weapon && window.SSDNSTestJammer.weapon();
    if (!jam || !jam.debug) return false;
    var guns = C().guns || [];
    var requested = index != null && index !== "" && isFinite(Number(index)) ? Number(index) : -1;
    var i = -1;
    if (requested >= 0 && requested < guns.length) {
      var asked = guns[requested];
      if (!asked || !asked.weapon || asked.weapon === jam.id) i = requested;
    }
    if (i < 0) {
      for (var n = 0; n < guns.length; n++) {
        if (!guns[n] || !guns[n].weapon) { i = n; break; }
      }
    }
    if (i < 0) i = requested >= 0 && requested < guns.length ? requested : 0;
    var g = guns[i];
    if (!g) return false;
    var round = "k:percussion::medium";
    g.weapon = jam.id;
    g.tier = "medium";
    g.chamber = "medium|";
    g.chamberSet = true;
    g.capacity = jam.capacity || 6;
    g.loaded = g.capacity;
    g.chambers = [];
    for (var k = 0; k < g.capacity; k++) g.chambers.push(round);
    g.load = "percussion";
    g.mod = "";
    g.jammed = false;
    g.fouled = false;
    g.dirty = false;
    g.ruined = false;
    g.broken = false;
    g.cracked = false;
    g.misStreak = 0;
    g.lockedChambers = [];
    g.pendingD4 = false;
    g.pendingD4Rolls = null;
    g.pendingD4Step = 0;
    g.proficient = true;
    g.equipped = false;
    if (window.SSDNSEquip && window.SSDNSEquip.tryAutoEquip) window.SSDNSEquip.tryAutoEquip(C(), { kind: "gun", index: i });
    changed();
    return true;
  }
  function grantListedWeapon(idOrName) {
    var key = String(idOrName || "").trim();
    if (!key) return false;
    var w = WPN[key] || null;
    if (!w) {
      var low = key.toLowerCase();
      WEAPON_LIST.forEach(function (row) {
        if (w || !row) return;
        if (String(row.id || "").toLowerCase() === low || String(row.name || "").toLowerCase() === low) w = row;
      });
    }
    if (!w && window.SSDNSPeaceMaker && window.SSDNSPeaceMaker.lookup) w = window.SSDNSPeaceMaker.lookup(key);
    if (!w || !w.id) return false;
    if (w.custom || w.dmOnly && /melee/.test(String(w.group || ""))) {
      if (window.SSDNSCustomWeapons && window.SSDNSCustomWeapons.register) window.SSDNSCustomWeapons.register(Object.assign({ kind: /melee/.test(String(w.group || "")) ? "melee" : (w.tiers ? "firearm" : "melee") }, w));
    }
    if (w.knockout && window.SSDNSPeaceMaker && w.id === window.SSDNSPeaceMaker.id) {
      var fu = C().featureUses || (C().featureUses = {});
      var ukey = window.SSDNSPeaceMaker.usesKey;
      if (!fu[ukey]) fu[ukey] = { max: 1, used: 0, rest: "short" };
    }
    var melee = (R.melee || []).some(function (row) { return row && row.id === w.id; });
    if (melee) {
      var slots = C().melee || [];
      while (slots.length < 4) slots.push({ weapon: "", proficient: true });
      C().melee = slots;
      var slot = null;
      for (var n = 0; n < slots.length; n++) if (slots[n] && !slots[n].weapon) { slot = slots[n]; break; }
      if (!slot) {
        slot = { weapon: "", proficient: true };
        slots.push(slot);
      }
      slot.weapon = w.id;
      slot.proficient = true;
      slot.equipped = false;
      var meleeIndex = slots.indexOf(slot);
      if (window.SSDNSEquip && window.SSDNSEquip.tryAutoEquip) window.SSDNSEquip.tryAutoEquip(C(), { kind: "melee", index: meleeIndex });
      changed();
      return { id: w.id, name: w.name || w.id, melee: true, equipped: slot.equipped === true };
    }
    var guns = C().guns || [];
    var i = -1;
    for (var g = 0; g < guns.length; g++) if (!guns[g] || !guns[g].weapon) { i = g; break; }
    if (i < 0) i = 0;
    var gun = guns[i];
    if (!gun) return false;
    gun.weapon = w.id;
    gun.proficient = true;
    gun.loaded = 0;
    gun.chambers = [];
    gun.chamberSet = false;
    gun.jammed = false;
    gun.fouled = false;
    gun.dirty = false;
    gun.ruined = false;
    gun.broken = false;
    gun.pendingD4 = false;
    gun.equipped = false;
    if (window.SSDNSEquip && window.SSDNSEquip.tryAutoEquip) window.SSDNSEquip.tryAutoEquip(C(), { kind: "gun", index: i });
    if (w.tiers) {
      var tier = firstTier(w);
      var rounds = (w.rounds && w.rounds[tier]) || [];
      gun.tier = tier;
      gun.chamber = tier + "|" + (rounds[0] || "");
      gun.chamberSet = !!tier;
      gun.capacity = w.capacity || 0;
    }
    changed();
    return { id: w.id, name: w.name || w.id, melee: false, equipped: gun.equipped === true };
  }
  function gunMeleeLabel(w) {
    if (!w) return "";
    var g = String(w.group || "");
    if (g === "pistol" || g === "caster") return "Melee: Pistol Whip, 5 ft";
    if (g === "rifle" || g === "carbine" || g === "shotgun" || g === "bigbore") return "Melee: Rifle Butt, 5 ft";
    return "";
  }
  function misfireCeiling(text, dirty) {
    var s = String(text || "");
    var m = s.match(/(\d+)\s*[–-]\s*(\d+)/);
    var hi = m ? num(m[2], 1) : num((s.match(/(\d+)/) || [])[1], 1);
    if (!hi) hi = 1;
    if (dirty) hi = Math.max(hi, 2);
    return hi;
  }
  function misfireLabel(text, dirty) {
    var hi = misfireCeiling(text, dirty);
    return (hi > 1 ? "1–" + hi : "1") + (dirty && hi > misfireCeiling(text, false) ? " (dirty)" : (dirty ? " (dirty)" : ""));
  }
  function fireHexShell(level) {
    var guns = C().guns || [];
    for (var i = 0; i < guns.length; i++) {
      var w = WPN[guns[i].weapon];
      if (!w || !w.hexShells) continue;
      var held = spendHexChamber(i, level);
      if (held.ok) return held;
    }
    return { ok: false, reason: "No level-" + level + " shell is loaded." };
  }
  function rollTrait(kind) {
    var b = BG[C().background];
    if (!b || !b.traits || !b.traits[kind] || !b.traits[kind].length) { toast("Pick a Background first; its tables roll here."); return; }
    var list = b.traits[kind], n = Math.floor(Math.random() * list.length), pick = list[n];
    var cur = C()[kind] || "";
    C()[kind] = cur.trim() ? cur.replace(/\s+$/, "") + "\n" + pick : pick;
    renderFields(); changed();
    toast("Rolled " + (n + 1) + " on d" + list.length + ".");
  }
  function onClick(e) {
    var t = e.target.closest && e.target.closest("button, [data-img]");
    if (!t) return;
    var d = t.dataset;
    if (d.gunroll !== undefined) { if (window.SSDNSGunRoll) window.SSDNSGunRoll(num(d.gunroll), d.k !== undefined ? num(d.k) : undefined); return; }
    if (d.gunmelee !== undefined) { if (window.SSDNSGunMelee) window.SSDNSGunMelee(num(d.gunmelee)); return; }
    if (d.clean !== undefined) return cleanGun(num(d.clean));
    if (d.unjam !== undefined) { var ui = num(d.unjam); return withCost(ui, unjamCost(ui), "Unjam", function () { return unjamGun(ui); }); }
    if (d.reopen !== undefined) { var ri = num(d.reopen); return withCost(ri, "action", "Reopen chamber", function () { return reopenChamber(ri); }); }
    if (d.rechamber !== undefined) return openRechamber(num(d.rechamber));
    if (d.fire !== undefined) {
      var gi = num(d.fire), kk = d.k !== undefined ? num(d.k) : undefined;
      var gg = C().guns[gi];
      var stn = gg && gg.chambers && kk !== undefined ? gg.chambers[kk] : "";
      if (isHexChamber(stn)) {
        if (window.SSDNSGunCastHex) window.SSDNSGunCastHex(gi, kk);
        return;
      }
      if (window.SSDNSGunRoll) return window.SSDNSGunRoll(gi, kk);
      return fire(gi, kk);
    }
    if (d.unload !== undefined) { var li = num(d.unload); return withCost(li, UNLOAD_COST, "Unload", function () { return unloadLoaded(li); }); }
    if (d.takepool !== undefined) {
      var bits = String(d.takepool).split(":");
      var pool = C().ammo[num(bits[1])];
      var pi = num(bits[0]), pmax = num(bits[2]) || 0, pg = C().guns[pi];
      if (pmax && fanTrLocked()) return;
      return withCost(pi, reloadCost(pg, pg && WPN[pg.weapon], pmax), pmax ? "Tactical Reload" : "Reload", function () { return reloadFromPool(pi, pool, pmax); });
    }
    if (d.reload !== undefined) { var di = num(d.reload), dg = C().guns[di]; return withCost(di, reloadCost(dg, dg && WPN[dg.weapon], 0), "Reload", function () { return reload(di); }); }
    if (d.tr !== undefined && fanTrLocked()) return;
    if (d.tr !== undefined) { var ti = num(d.tr); return withCost(ti, "bonus", "Tactical Reload", function () { return tacticalReload(ti); }); }
    if (d.hexload !== undefined) return loadHexShell(num(d.hexload));
    if (d.skill) { C().skillProf[d.skill] = (num(C().skillProf[d.skill], 0) + 1) % 3; changed(); return; }
    if (d.ammoStep) { var q = d.ammoStep.split(":"), a = C().ammo[num(q[0])]; a.count = Math.max(0, num(a.count) + num(q[1])); changed(); return; }
    if (d.ammoDel !== undefined) { C().ammo.splice(num(d.ammoDel), 1); changed(); return; }
    if (d.expDel !== undefined) { (C().explosives || []).splice(num(d.expDel), 1); changed(); return; }
    if (d.spellDel !== undefined) {
      var parts = String(d.spellDel).split(":");
      removeKnownSpell(num(parts[0]), num(parts[1]));
      return;
    }
    if (d.pickLevel !== undefined) { pickerLevel = d.pickLevel; fillSpellPicker(); return; }
    if (d.addSpell !== undefined) {
      var btn = e.target.closest("[data-add-spell]");
      var spell = btn && btn._spell;
      if (!spell && btn) {
        var key = btn.getAttribute("data-add-spell");
        spell = callingCatalog().concat(bonusCatalog()).filter(function (sp) { return sp.key === key; })[0] || null;
      }
      if (spell) {
        if (spellAlreadyHave(spell.phb)) toast(spell.phb + " is already on your list.");
        else {
          addKnownSpell(spell);
          var cap = preparedCap();
          if (cap && spell.level > 0) {
            var ready = 0;
            for (var pl = 1; pl <= 9; pl++) ready += knownSpellsAt(pl).filter(function (s) { return s.prepared; }).length;
            if (ready > cap) toast("Prepared " + ready + "/" + cap + ". Unprepare one before the next day.");
          }
          fillSpellPicker();
          toast("Added " + spell.label + ".");
        }
      }
      return;
    }
    if (d.unfeat !== undefined) { C().feats.splice(num(d.unfeat), 1); changed(); return; }
    if (d.roll) return rollTrait(d.roll);
    if (d.imgpick) return pickImage(d.imgpick);
    if (d.imgclear) { setPath(S.doc, d.imgclear, ""); renderFields(); changed(); return; }
    if (d.img && t.tagName !== "BUTTON") return pickImage(d.img);
  }
  function onDblClick(e) {
    var t = e.target;
    if (t.hasAttribute && t.hasAttribute("data-calc")) {
      delete C().overrides[t.getAttribute("data-calc")];
      t.blur(); changed(); toast("Back to the automatic value.");
    }
  }

  // ------------------------------------------------------------------ images
  function pickImage(path) {
    var inp = el("input", { type: "file", accept: "image/*" });
    inp.addEventListener("change", function () { if (inp.files[0]) loadImage(inp.files[0], path); });
    inp.click();
  }
  function loadImage(file, path) {
    var r = new FileReader();
    r.onload = function () {
      var img = new Image();
      img.onload = function () {
        var max = 512, s = Math.min(1, max / Math.max(img.width, img.height));
        var cv = document.createElement("canvas"); cv.width = Math.round(img.width * s); cv.height = Math.round(img.height * s);
        cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
        setPath(S.doc, path, cv.toDataURL("image/jpeg", 0.82));
        renderFields(); changed();
      };
      img.src = r.result;
    };
    r.readAsDataURL(file);
  }

  // ------------------------------------------------------------------ saving
  var scheduleLocal = debounce(function () { saveLocal(); }, 350);
  var scheduleFile = debounce(function () { writeFile(false); }, 1500);
  function saveLocal() {
    try {
      Store.saveCurrent(S.doc);
      S.lastLocal = Date.now();
      if (Date.now() - S.lastSnap > 3 * 60 * 1000) snapshot("autosave");
      if (/^Browser backup/.test(S.error)) S.error = "";
    } catch (err) { S.error = "Browser backup failed (storage full?). Save to a file now."; console.warn(err); }
    updateSaveBar();
  }
  function snapshot(reason) {
    try { if (Store.pushHistory(S.doc, reason)) S.lastSnap = Date.now(); } catch (e) { console.warn("snapshot failed", e); }
  }
  function docText() { return JSON.stringify(S.doc, null, 2) + "\n"; }
  function fileNameFor() { return (C().name || "character").replace(/[\\/:*?"<>|]+/g, "").trim().replace(/\s+/g, " ") + ".ssdns"; }
  function writeFile(ask) {
    if (!S.handle) return Promise.resolve(false);
    if (S.writing) { S.again = true; return Promise.resolve(false); }
    S.writing = true; updateSaveBar();
    return Store.permission(S.handle, ask).then(function (p) {
      if (p !== "granted") { S.permNeeded = true; return false; }
      S.permNeeded = false;
      var text = docText(), stamp = S.doc.updatedAt;
      return Store.writeHandle(S.handle, text).then(function () {
        if (S.doc.updatedAt === stamp) S.fileDirty = false;
        S.lastFile = Date.now(); S.error = "";
        return true;
      });
    }).catch(function (err) {
      console.warn(err);
      S.error = "Couldn't write " + S.fileName + " (" + (err && err.name || "error") + "). Use Save As.";
      return false;
    }).then(function (ok) {
      S.writing = false; updateSaveBar();
      if (S.again) { S.again = false; scheduleFile(); }
      return ok;
    });
  }
  function doSave() {
    snapshot("saved");
    var name = fileNameFor();
    var text = docText();
    try {
      Store.download(name, text);
    } catch (err) {
      try {
        var blob = new Blob([text], { type: "application/json" });
        var a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = name;
        a.rel = "noopener";
        document.body.appendChild(a);
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2500);
      } catch (err2) {
        toast("Download failed. The character is still backed up in this browser.");
        S.error = "Save download failed.";
        updateSaveBar();
        return Promise.resolve(false);
      }
    }
    S.fileDirty = false; S.lastFile = Date.now(); S.fileName = name; S.hasFile = true; updateSaveBar();
    toast("Saved " + name);
    if (S.handle) writeFile(true);
    return Promise.resolve(true);
  }
  function doSaveAs() {
    if (!Store.fsSupported) return doSave();
    return Store.pickSave(fileNameFor()).then(function (h) {
      S.handle = h; S.fileName = h.name; S.permNeeded = false;
      Store.putHandle(S.doc.id, h);
      return writeFile(true).then(function (ok) { if (ok) toast("Saved to " + h.name + ". Changes now save to it automatically."); });
    }).catch(function (err) { if (err && err.name !== "AbortError") { S.error = "Save As failed: " + err.message; updateSaveBar(); } });
  }
  function replaceDoc(doc, info) {
    if (S.doc && S.hasContent) { snapshot("before " + (info.reason || "switching")); try { Store.saveCurrent(S.doc); } catch (e) {} }
    S.doc = doc; S.handle = info.handle || null; S.fileName = info.fileName || ""; S.fileDirty = !!info.dirty;
    S.hasContent = true; S.permNeeded = false; S.error = ""; S.lastFile = (info.handle || info.fileName) ? Date.now() : null; S.lastSnap = 0;
    if (S.handle) Store.putHandle(doc.id, S.handle); else if (!info.keepHandle) Store.delHandle(doc.id);
    try { Store.saveCurrent(doc); S.lastLocal = Date.now(); } catch (e) { S.error = "Browser backup failed: " + e.message; }
    snapshot(info.reason || "opened");
    renderFields(); adoptWallet(); pushWallet(); updateSaveBar();
    if (window.SSDNSPlaytest && window.SSDNSPlaytest.syncSheet) window.SSDNSPlaytest.syncSheet();
  }
  function loadText(text, info) {
    var doc;
    info = info || {};
    try { doc = migrate(JSON.parse(text)); }
    catch (err) { toast("Couldn't open " + (info.fileName || "that file") + ": " + (err instanceof SyntaxError ? "it isn't valid JSON." : err.message)); return false; }
    replaceDoc(doc, Object.assign({ reason: "opened " + (info.fileName || "file") }, info));
    toast("Opened " + (C().name || "character") + (info.fileName ? " from " + info.fileName : "") + ".");
    return true;
  }
  function doOpen() {
    confirmLeave().then(function (ok) {
      if (!ok) return;
    if (Store.fsSupported) {
      Store.pickOpen().then(function (h) {
        return h.getFile().then(function (f) { return f.text(); }).then(function (t) { loadText(t, { handle: h, fileName: h.name }); });
      }).catch(function (err) { if (err && err.name !== "AbortError") toast("Open failed: " + err.message); });
    } else $("#fileInput").click();
    });
  }
  function confirmLeave() {
    if (S.fileDirty && S.hasContent && !S.handle) {
      var msg = "This character has changes that aren't in a file yet (they are backed up in this browser). Continue?";
      var ask = window.SSDNSAsk && window.SSDNSAsk.confirm ? window.SSDNSAsk.confirm(msg) : Promise.resolve(false);
      return ask.then(function (ok) {
        if (!ok && window.SSDNSSheet && window.SSDNSSheet.addLog) window.SSDNSSheet.addLog({ kind: "alert", text: "Declined leaving an unsaved character." });
        return !!ok;
      });
    }
    return Promise.resolve(true);
  }
  function doNew() {
    var ask = window.SSDNSAsk && window.SSDNSAsk.confirm
      ? window.SSDNSAsk.confirm("Start a new character? This one stays in this browser's backups.")
      : Promise.resolve(false);
    ask.then(function (ok) {
      if (!ok) {
        if (window.SSDNSSheet && window.SSDNSSheet.addLog) window.SSDNSSheet.addLog({ kind: "alert", text: "Declined starting a new character." });
        return;
      }
    if (window.SSDNSDmJoin && window.SSDNSDmJoin.isJoined && window.SSDNSDmJoin.isJoined() && window.SSDNSDmJoin.leave) window.SSDNSDmJoin.leave();
    try { sessionStorage.removeItem("ssdns.wizard.skip"); } catch (e) {}
    replaceDoc(blankDoc(), { reason: "new character" });
    if (window.SSDNSSheet && window.SSDNSSheet.clearLog) window.SSDNSSheet.clearLog();
    S.hasContent = false; S.fileDirty = false; updateSaveBar();
    if (window.SSDNSCreator) window.SSDNSCreator.open(true);
    else toast("New character. It's backed up in this browser as you type; Save makes a .ssdns file.");
    });
  }
  function watchTabs() {
    var tabId = "tab_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    var channel = null;
    var peers = {};
    try { channel = new BroadcastChannel("ssdns-sheet"); } catch (err) {}
    function livePeers() {
      var now = Date.now();
      Object.keys(peers).forEach(function (id) { if (now - peers[id] > 5000) delete peers[id]; });
      return Object.keys(peers).length > 0;
    }
    function renderWarn() {
      var locked = window.SSDNSDmJoin && window.SSDNSDmJoin.isReadOnly && window.SSDNSDmJoin.isReadOnly();
      if (!locked) {
        var b0 = $("#tabWarn");
        if (b0 && !b0.querySelector("#btnTakeOver")) b0.hidden = true;
        return;
      }
    }
    function announce(bye) {
      if (!S.doc || !S.doc.id || !channel) return;
      try { channel.postMessage({ id: S.doc.id, tab: tabId, bye: !!bye, ts: Date.now() }); } catch (e) {}
    }
    if (channel) channel.onmessage = function (ev) {
      var data = ev && ev.data;
      if (!data || !S.doc || data.id !== S.doc.id || data.tab === tabId) return;
      if (data.bye) delete peers[data.tab];
      else peers[data.tab] = data.ts || Date.now();
      renderWarn();
    };
    window.addEventListener("storage", function (e) {
      if (window.SSDNSCreator && window.SSDNSCreator.isOpen && window.SSDNSCreator.isOpen()) return;
      if (!S.doc || !e || !e.key) return;
      if (e.key === "ssdns.sheet.char." + S.doc.id || e.key === "ssdns.v1.char." + S.doc.id) renderWarn();
    });
    window.addEventListener("pagehide", function () { announce(true); });
    setInterval(function () { announce(false); renderWarn(); }, 2000);
    announce(false);
    window.SSDNSTabLock = { others: livePeers };
  }
  function updateSaveBar() {
    var bar = $("#saveBar"), txt = $("#saveText"), act = $("#saveBarAction");
    var state = "ok", msg = "", action = null;
    var t = function (ms) { return ms ? new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : ""; };
    var backup = S.lastLocal ? "Backed up in this browser " + t(S.lastLocal) + "." : "";
    if (S.error) { state = "bad"; msg = S.error; action = [Store.fsSupported ? "Save As" : "Download .ssdns", Store.fsSupported ? doSaveAs : doSave]; }
    else if (S.permNeeded) { state = "warn"; msg = "Autosave to " + S.fileName + " is paused until you allow it. " + backup; action = ["Allow saving", function () { writeFile(true); }]; }
    else if (S.writing) { state = "busy"; msg = "Saving to " + S.fileName + "…"; }
    else if (S.handle && !S.fileDirty) { state = "ok"; msg = "Saved to " + S.fileName + " at " + t(S.lastFile) + ". Autosave is on."; }
    else if (S.handle) { state = "busy"; msg = "Saving to " + S.fileName + " in a moment…"; }
    else if (!S.hasContent) { state = "idle"; msg = "New character. Open a .ssdns file or start typing; it's backed up in this browser as you go."; }
    else if (S.fileDirty) { state = "warn"; msg = "Unsaved changes: not in a file yet. " + backup; action = [Store.fsSupported ? "Save to file" : "Download .ssdns", doSave]; }
    else { state = "ok"; msg = (S.fileName ? "Matches " + S.fileName + ". " : "") + backup; }
    bar.className = "savebar " + state;
    bar.setAttribute("data-state", state);
    txt.textContent = msg;
    if (action) { act.hidden = false; act.textContent = action[0]; act.onclick = action[1]; } else act.hidden = true;
  }

  // ------------------------------------------------------------------ restore dialog
  function openRestore() {
    var list = $("#restoreList"); list.innerHTML = "";
    var h = Store.history(S.doc.id).slice().reverse();
    if (!h.length) list.appendChild(el("p", { class: "fine", text: "No backups for this character yet." }));
    var liveName = (S.doc.character && S.doc.character.name) || "";
    if (liveName) list.appendChild(el("p", { class: "fine", text: "This character: " + liveName }));
    h.forEach(function (v, idx) {
      var ch = v.doc.character || {};
      var cal = CAL[ch.calling];
      var shown = ch.name || liveName || "(unnamed)";
      list.appendChild(el("div", { class: "ver" }, [
        el("div", {}, [el("b", { text: timeStr(v.at) }), " · " + v.reason,
          el("div", { class: "fine", text: shown + (cal ? " · " + cal.name + " " + ch.level : "") + " · " + Bridge.cpValue(v.doc.shards).toLocaleString() + " ES in shards" })]),
        el("button", { type: "button", class: "btn sm", "data-restore": idx, onclick: function () {
          var d = migrate(clone(v.doc)); d.updatedAt = new Date().toISOString();
          replaceDoc(d, { handle: S.handle, fileName: S.fileName, reason: "restore", dirty: true, keepHandle: true });
          if (S.handle) scheduleFile();
          $("#dlgRestore").close(); toast("Restored the " + timeStr(v.at) + " version. What you had is kept as a backup.");
        } }, ["Restore"])]));
    });
    var cl = $("#charList"); cl.innerHTML = "";
    Store.index().filter(function (c) { return c.id !== S.doc.id; }).forEach(function (c) {
      cl.appendChild(el("div", { class: "ver" }, [el("div", {}, [el("b", { text: c.name }), el("div", { class: "fine", text: (CAL[c.calling] ? CAL[c.calling].name + " " + c.level + " · " : "") + "last change " + timeStr(c.updatedAt) })]),
        el("button", { type: "button", class: "btn sm", onclick: function () {
          var d = Store.loadCurrent(c.id); if (!d) return;
          Store.getHandle(c.id).then(function (hd) {
            replaceDoc(migrate(d), { handle: hd || null, fileName: hd ? hd.name : "", reason: "switched character", keepHandle: true });
            if (hd) { S.permNeeded = true; updateSaveBar(); }
            $("#dlgRestore").close();
          });
        } }, ["Open"])]));
    });
    if (!cl.children.length) cl.appendChild(el("p", { class: "fine", text: "None." }));
    $("#dlgRestore").showModal();
  }

  // ------------------------------------------------------------------ wallet bridge
  // v0.2.1: adopt shard changes a Saloon game made while the sheet was closed (newer wallet, same character).
  function adoptWallet() {
    try {
      var w = Bridge.readWallet();
      if (!w || !S.doc || w.characterId !== S.doc.id || w.updatedBy === "sheet") return;
      if (S.doc.updatedAt && w.updatedAt && w.updatedAt < S.doc.updatedAt) return;
      if (JSON.stringify(Bridge.cleanShards(S.doc.shards)) === JSON.stringify(w.shards)) return;
      S.doc.shards = w.shards; renderFields(); changed();
      toast("Shards updated by " + w.updatedBy + " while the sheet was closed.");
    } catch (e) { console.warn(e); }
  }
  function beatAlive() {
    try {
      if (!S.doc || !S.doc.id) return;
      localStorage.setItem("ssdns.sheet.alive", JSON.stringify({ characterId: S.doc.id, at: Date.now() }));
    } catch (e) {}
  }
  function pushWallet() {
    try {
      var ch = C();
      var skills = (ch && ch.skills) || {};
      var soh = skills["Sleight of Hand"];
      var color = "";
      try {
        var bag = window.SSDNSTokenColors || {};
        color = bag[String((ch && ch.name) || "").trim().toLowerCase()] || "";
      } catch (e2) {}
      Bridge.writeWallet({
        characterId: S.doc.id,
        characterName: ch.name,
        shards: S.doc.shards,
        updatedBy: "sheet",
        sleight: soh == null || soh === "" ? 0 : soh,
        tokenColor: color
      });
    } catch (e) { console.warn(e); }
    beatAlive();
  }
  function onWallet(w) {
    if (window.SSDNSCreator && window.SSDNSCreator.isOpen && window.SSDNSCreator.isOpen()) return;
    if (!S.doc || w.characterId !== S.doc.id || w.updatedBy === "sheet") return;
    if (JSON.stringify(Bridge.cleanShards(S.doc.shards)) === JSON.stringify(w.shards)) return;
    S.doc.shards = w.shards;
    renderFields(); changed();
    toast("Shards updated by " + w.updatedBy + ".");
  }

  // ------------------------------------------------------------------ toast
  var toastTimer;
  var toastQueue = [];
  var toastShowing = null;
  function dismissToast() {
    var t = $("#toast");
    if (t) t.hidden = true;
    toastShowing = null;
    pumpToast();
  }
  function paintToast(item) {
    var t = $("#toast"), a = $("#toastAction");
    $("#toastText").textContent = item.msg;
    if (item.actLabel) {
      a.hidden = false;
      a.textContent = item.actLabel;
      a.onclick = function () { if (item.actFn) item.actFn(); dismissToast(); };
    } else a.hidden = true;
    t.hidden = false;
    clearTimeout(toastTimer);
    if (!item.sticky) toastTimer = setTimeout(dismissToast, item.ms || (item.actLabel ? 6000 : 4200));
  }
  function pumpToast() {
    if (toastShowing) return;
    var item = toastQueue.shift();
    if (!item) return;
    toastShowing = item;
    paintToast(item);
  }
  function toast(msg, actLabel, actFn, ms, opts) {
    opts = opts || {};
    var item = { msg: msg, actLabel: actLabel || "", actFn: actFn, ms: ms, id: opts.id || "", sticky: !!opts.sticky };
    if (item.id && ((toastShowing && toastShowing.id === item.id) || toastQueue.some(function (q) { return q.id === item.id; }))) return;
    if (item.msg && ((toastShowing && toastShowing.msg === item.msg) || toastQueue.some(function (q) { return q.msg === item.msg; }))) return;
    if (window.SSDNSApplied && window.SSDNSApplied.enqueueToast) toastQueue = window.SSDNSApplied.enqueueToast(toastQueue, item, 3);
    else {
      toastQueue.push(item);
      while (toastQueue.length > 3) toastQueue.shift();
    }
    pumpToast();
  }
  toast.dismissId = function (id) {
    toastQueue = toastQueue.filter(function (item) { return item.id !== id; });
    if (toastShowing && toastShowing.id === id) dismissToast();
  };
  toast.dismissSticky = function (msg) {
    toastQueue = toastQueue.filter(function (item) { return item.msg !== msg; });
    if (toastShowing && toastShowing.msg === msg) dismissToast();
  };

  // ------------------------------------------------------------------ tabs, print, drag & drop
  function showTab(id) {
    $$(".tab").forEach(function (t) {
      var on = t.id === id; t.setAttribute("aria-selected", on ? "true" : "false"); t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute("aria-controls")).hidden = !on;
    });
    try { sessionStorage.setItem("ssdns.tab", id); } catch (e) {}
    document.body.classList.toggle("store-tab-active", id === "tab-store");
  }
  function wireTabs() {
    var tabs = $$(".tab");
    tabs.forEach(function (t, i) {
      t.addEventListener("click", function () { showTab(t.id); });
      t.addEventListener("keydown", function (e) {
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
        var n = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length]; showTab(n.id); n.focus();
      });
    });
    try { sessionStorage.removeItem("ssdns.tab"); } catch (e) {}
    showTab("tab-main");
  }
  var COND_TEXT = {
    Blinded: "You can't see. Attacks against you have advantage; your attacks have disadvantage.",
    Charmed: "You can't harm the charmer. They have advantage on social checks against you.",
    Deafened: "You can't hear. You auto-fail checks that need hearing.",
    Frightened: "Disadvantage on ability checks and attacks while the source is in sight. You can't willingly move closer.",
    Grappled: "Speed is 0. It ends if the grappler can't hold you, or you're forced out of reach.",
    Incapacitated: "You can't take actions or reactions.",
    Invisible: "You're impossible to see without a special sense. Attacks against you have disadvantage; yours have advantage.",
    Paralyzed: "Incapacitated, can't move or speak, and auto-fail Strength and Dexterity saves. Attacks against you have advantage, and a hit from within 5 feet is a critical.",
    Petrified: "You're turned to a solid substance. Incapacitated, unaware, and resistant to all damage. Attacks against you have advantage.",
    Poisoned: "Disadvantage on attack rolls and ability checks.",
    Prone: "Your attacks have disadvantage. Melee attacks against you have advantage; ranged attacks have disadvantage. Crawl, or spend half your movement to stand.",
    Restrained: "Speed is 0. Attacks against you have advantage; your attacks and Dexterity saves have disadvantage.",
    Stunned: "Incapacitated, can't move, and auto-fail Strength and Dexterity saves. Attacks against you have advantage.",
    Unconscious: "Incapacitated, prone, and unaware. You drop what you're holding and auto-fail Strength and Dexterity saves. Attacks against you have advantage, and a hit from within 5 feet is a critical.",
    Exhaustion: "Stacked fatigue. The DM says which level is on you and what it takes away."
  };
  function activeCondList() {
    var c = C();
    var rows = (c && c.activeConditions) || [];
    if (rows.length) return rows;
    return String((c && c.tableConditions) || "").split(",").map(function (s) { return s.trim(); }).filter(Boolean).map(function (name) {
      var level = 0;
      var m = name.match(/exhaustion\s+(\d+)/i);
      if (m) level = parseInt(m[1], 10);
      return { name: m ? "Exhaustion" : name.replace(/\s+\d+r$/, ""), level: level };
    });
  }
  function toggleCondition(name, level, rounds, keep) {
    if (window.SSDNSDmJoin && window.SSDNSDmJoin.isReadOnly && window.SSDNSDmJoin.isReadOnly()) return;
    var c = C();
    var Cond = window.SSDNSConditions;
    if (!c || !Cond) return;
    var cur = (c.activeConditions || []).slice();
    var have = cur.filter(function (row) { return String(row.name || "").toLowerCase() === name.toLowerCase(); })[0];
    var removing = !keep && !!have && name !== "Exhaustion";
    if (!keep && name === "Exhaustion" && have && have.level === level) removing = true;
    if (removing) cur = Cond.removeName(cur, name);
    else cur = Cond.upsert(cur, { name: name, level: level || (name === "Exhaustion" ? 1 : 0), rounds: rounds, subjectId: "self" });
    c.activeConditions = cur;
    c.tableConditions = Cond.listText(cur);
    changed();
    renderConditionsTab();
    if (window.SSDNSSheet && window.SSDNSSheet.setConditions) window.SSDNSSheet.setConditions(Cond.listText(cur).split(", "), { entries: cur, quiet: true });
    if (window.SSDNSDmJoin && window.SSDNSDmJoin.writeCondition) {
      window.SSDNSDmJoin.writeCondition(removing ? { name: name, id: have && have.id } : cur.filter(function (row) { return row.name === name; })[0], removing);
    }
    if (window.SSDNSSheet && window.SSDNSSheet.addLog) {
      window.SSDNSSheet.addLog({ id: "cond-self:" + name + ":" + Date.now(), kind: "alert", text: (removing ? "Cleared " : "Gained ") + name });
    }
  }
  function renderConditionsTab() {
    var box = $("#condList");
    if (!box || !S.doc) return;
    var Cond = window.SSDNSConditions;
    var rows = activeCondList();
    box.innerHTML = "";
    var catalog = Cond ? Cond.catalog() : Object.keys(COND_TEXT).map(function (name) { return { name: name, text: COND_TEXT[name], exhaustion: name === "Exhaustion" }; });
    catalog.forEach(function (item) {
      var have = rows.filter(function (row) { return String(row.name || row).toLowerCase() === item.name.toLowerCase(); })[0];
      var card = el("article", { class: "cond-card" + (have ? " on" : "") });
      var head = el("div", { class: "cond-head" });
      var btn = el("button", { type: "button", class: "btn sm cond-toggle" + (have ? " on" : ""), text: have ? "On" : "Off" });
      btn.addEventListener("click", function () { toggleCondition(item.name, have && have.level); });
      head.appendChild(el("h3", { text: item.name }));
      head.appendChild(btn);
      card.appendChild(head);
      if (item.exhaustion) {
        var levels = el("div", { class: "cond-levels" });
        for (var n = 1; n <= 6; n++) {
          (function (lv) {
            var b = el("button", { type: "button", class: "btn sm" + (have && have.level === lv ? " on" : ""), text: String(lv) });
            b.addEventListener("click", function () { toggleCondition("Exhaustion", lv); });
            levels.appendChild(b);
          })(n);
        }
        card.appendChild(levels);
      }
      var rounds = el("input", { type: "number", min: "1", class: "cond-rounds", placeholder: "rounds", value: have && have.rounds ? String(have.rounds) : "" });
      rounds.addEventListener("change", function () {
        if (!have && !rounds.value) return;
        toggleCondition(item.name, (have && have.level) || (item.exhaustion ? 1 : 0), rounds.value === "" ? null : parseInt(rounds.value, 10), true);
      });
      card.appendChild(rounds);
      var more = el("p", { class: "fine", text: item.text || COND_TEXT[item.name] || "" });
      card.appendChild(more);
      box.appendChild(card);
    });
    var note = $("#condDmNote");
    var labels = rows.map(function (row) { return Cond ? Cond.label(row) : (row.name || row); }).filter(Boolean);
    if (note) note.textContent = labels.length ? ("On you: " + labels.join(", ")) : "Nothing on you right now. Toggle a condition, or wait for the DM.";
  }
  window.SSDNSConditionsUi = { paint: renderConditionsTab, toggle: toggleCondition };
  var ASI_LEVELS = { 4: 1, 8: 1, 12: 1, 16: 1, 19: 1 };
  var lvlDraft = null;
  function featureLevel(name) {
    var m = String(name || "").match(/(\d+)(?:st|nd|rd|th)\s*(?:lvl|level)/i);
    return m ? parseInt(m[1], 10) : null;
  }
  function featuresForLevel(lv) {
    var cal = currentCalling(), sc = currentSubclass(), list = [];
    function take(arr) {
      (arr || []).forEach(function (f) { if (f && featureLevel(f.name) === lv) list.push(f); });
    }
    if (cal) take(cal.features);
    if (sc) take(sc.features);
    if (cal && cal.progression && cal.progression.rows) {
      cal.progression.rows.forEach(function (r) {
        if (parseInt(String(r[0]), 10) !== lv) return;
        String(r[2] || "").split(",").forEach(function (bit) {
          var name = bit.trim();
          if (!name || name === "—" || name === "-") return;
          if (list.some(function (f) { return String(f.name || "").toLowerCase().indexOf(name.toLowerCase()) >= 0; })) return;
          list.push({ name: name + " (" + lv + (lv === 2 ? "nd" : lv === 3 ? "rd" : "th") + " lvl)", text: "From the " + cal.name + " table. Pick the option with your DM." });
        });
      });
    }
    return list;
  }
  function limitsAt(lv) {
    var prev = C().level;
    C().level = lv;
    var lim = spellLimits();
    var hex = hexTotals().slice();
    var prof = profBonus(lv);
    C().level = prev;
    return { lim: lim, hex: hex, prof: prof };
  }
  function openLevelUp() {
    var c = C(), cal = currentCalling();
    if (!cal) { toast("Pick a Calling first."); return; }
    var from = Math.max(1, Math.min(20, num(c.level, 1)));
    if (from >= 20) { toast("Already level 20."); return; }
    var to = from + 1;
    var die = dieMax(cal.hitDie);
    var con = mod(num(c.abilities.CON, 10));
    var avg = Math.max(1, Math.floor(die / 2) + 1 + con);
    var now = limitsAt(from), next = limitsAt(to);
    var feats = featuresForLevel(to);
    var spellNeed = 0, cantripNeed = 0;
    if (now.lim.known != null && next.lim.known != null) spellNeed = Math.max(0, next.lim.known - now.lim.known);
    if (now.lim.cantrips != null && next.lim.cantrips != null) cantripNeed = Math.max(0, next.lim.cantrips - now.lim.cantrips);
    var slotBits = [];
    for (var s = 1; s <= 9; s++) if ((next.hex[s] || 0) !== (now.hex[s] || 0)) slotBits.push("L" + s + " " + (now.hex[s] || 0) + "→" + (next.hex[s] || 0));
    lvlDraft = {
      from: from, to: to, die: die, con: con, avg: avg, hpMode: "avg", hpRoll: null,
      profWas: now.prof, prof: next.prof, feats: feats, spellNeed: spellNeed, cantripNeed: cantripNeed,
      asi: !!ASI_LEVELS[to], prepared: next.lim.mode === "prepared", slots: slotBits.join(", ")
    };
    paintLevelUp();
    var dlg = $("#dlgLevel");
    if (dlg && dlg.showModal) dlg.showModal();
  }
  function paintLevelUp() {
    var body = $("#lvlBody"), d = lvlDraft;
    if (!body || !d) return;
    body.innerHTML = "";
    body.appendChild(el("p", { text: "Level " + d.from + " → " + d.to + ". Nothing changes until you confirm." }));
    body.appendChild(el("p", { text: "Proficiency " + sign(d.profWas) + " → " + sign(d.prof) + "." }));
    var hp = el("fieldset", { class: "lvl-block" }, [el("legend", { text: "Hit points" })]);
    hp.appendChild(el("label", { class: "chk" }, [el("input", { type: "radio", name: "lvlHp", value: "avg", checked: d.hpMode !== "roll" ? "checked" : null }), " Average " + d.avg + " (hit die " + d.die + ", round up, + CON " + sign(d.con) + ", minimum 1)"]));
    var rollLine = el("label", { class: "chk" }, [el("input", { type: "radio", name: "lvlHp", value: "roll", checked: d.hpMode === "roll" ? "checked" : null }), " Roll 1d" + d.die + " + CON"]);
    hp.appendChild(rollLine);
    hp.appendChild(el("button", { type: "button", class: "btn sm", id: "btnLvlRoll" }, [d.hpRoll == null ? "Roll hit die" : ("Rolled " + d.hpRoll + " HP")]));
    body.appendChild(hp);
    if (d.feats.length) {
      var ff = el("div", { class: "lvl-block" }, [el("h3", { text: "New features" })]);
      d.feats.forEach(function (f) { ff.appendChild(el("p", {}, [el("b", { text: f.name + ". " }), f.text || ""])); });
      body.appendChild(ff);
    } else body.appendChild(el("p", { class: "fine", text: "No Calling feature is tagged for level " + d.to + "." }));
    if (d.slots) body.appendChild(el("p", { text: "Spell slots: " + d.slots + "." }));
    if (d.prepared) body.appendChild(el("p", { class: "fine", text: "Prepared caster: after this level, ready spells from your list on a long rest. No new spells to pick here." }));
    function spellPicks(need, levelFilter, title) {
      if (!need) return;
      var cat = callingCatalog().filter(function (sp) { return levelFilter(sp) && !spellAlreadyHave(sp.phb); });
      var block = el("fieldset", { class: "lvl-block" }, [el("legend", { text: title + " — pick " + need })]);
      if (!cat.length) { block.appendChild(el("p", { text: "No new spells left on this Calling's list." })); body.appendChild(block); return; }
      cat.forEach(function (sp) {
        var id = "lvlsp-" + sp.key.replace(/[^a-z0-9]+/gi, "-");
        var lvlLab = el("label", { class: "chk lvl-spell" }, [
          el("input", { type: "checkbox", "data-lvl-spell": sp.key, id: id }),
          (sp.level === 0 ? "Cantrip · " : ("L" + sp.level + " · ")) + sp.label
        ]);
        lvlLab._spell = sp;
        block.appendChild(lvlLab);
        var lvlAbout = spellDetails(sp.phb || sp.label);
        if (lvlAbout) block.appendChild(lvlAbout);
      });
      body.appendChild(block);
    }
    spellPicks(d.cantripNeed, function (sp) { return sp.level === 0; }, "New cantrips");
    spellPicks(d.spellNeed, function (sp) { return sp.level > 0 && sp.level <= d.to; }, "New spells");
    if (d.asi) {
      var asi = el("fieldset", { class: "lvl-block" }, [el("legend", { text: "Ability Score Improvement or a feat" })]);
      asi.appendChild(el("label", { class: "chk" }, [el("input", { type: "radio", name: "lvlAsi", value: "plus2", checked: "checked" }), " +2 to one score"]));
      asi.appendChild(el("select", { id: "lvlPlus2", "aria-label": "Score to raise by 2" }, AB.map(function (a) { return el("option", { value: a, text: a }); })));
      asi.appendChild(el("label", { class: "chk" }, [el("input", { type: "radio", name: "lvlAsi", value: "plus1" }), " +1 to two scores"]));
      var row = el("div", { class: "lvl-two" });
      row.appendChild(el("select", { id: "lvlPlusA", "aria-label": "First score +1" }, AB.map(function (a) { return el("option", { value: a, text: a }); })));
      row.appendChild(el("select", { id: "lvlPlusB", "aria-label": "Second score +1" }, AB.map(function (a) { return el("option", { value: a, text: a }); })));
      asi.appendChild(row);
      asi.appendChild(el("label", { class: "chk" }, [el("input", { type: "radio", name: "lvlAsi", value: "feat" }), " Take a feat"]));
      var featSel = el("select", { id: "lvlFeat", "aria-label": "Feat" });
      (R.feats || []).forEach(function (f) {
        if (C().feats.indexOf(f.id) >= 0) return;
        featSel.appendChild(el("option", { value: f.id, text: f.name }));
      });
      asi.appendChild(featSel);
      body.appendChild(asi);
    }
    var sum = el("div", { id: "lvlSummary", class: "lvl-summary" });
    body.appendChild(sum);
    refreshLevelSummary();
  }
  function checkedRadio(name) {
    var n = document.querySelector('input[name="' + name + '"]:checked');
    return n ? n.value : "";
  }
  function refreshLevelSummary() {
    var d = lvlDraft, box = $("#lvlSummary");
    if (!d || !box) return;
    d.hpMode = checkedRadio("lvlHp") || "avg";
    var hp = d.hpMode === "roll" ? d.hpRoll : d.avg;
    var lines = ["Level " + d.to + ".", "HP +" + (hp == null ? "(roll first)" : hp) + "."];
    if (d.prof !== d.profWas) lines.push("Proficiency " + sign(d.prof) + ".");
    d.feats.forEach(function (f) { lines.push(f.name + "."); });
    if (d.slots) lines.push("Slots: " + d.slots + ".");
    $$("[data-lvl-spell]:checked").forEach(function (boxEl) {
      var lab = boxEl.parentNode && boxEl.parentNode.textContent;
      if (lab) lines.push("Spell: " + lab.trim() + ".");
    });
    if (d.asi) {
      var mode = checkedRadio("lvlAsi") || "plus2";
      if (mode === "plus2") lines.push("+2 " + (($("#lvlPlus2") && $("#lvlPlus2").value) || ""));
      else if (mode === "plus1") lines.push("+1 " + ($("#lvlPlusA") && $("#lvlPlusA").value) + " and +1 " + ($("#lvlPlusB") && $("#lvlPlusB").value));
      else lines.push("Feat: " + (($("#lvlFeat") && $("#lvlFeat").selectedOptions && $("#lvlFeat").selectedOptions[0] && $("#lvlFeat").selectedOptions[0].text) || ""));
    }
    box.textContent = lines.join(" ");
  }
  function applyLevelUp() {
    var d = lvlDraft;
    if (!d) return;
    refreshLevelSummary();
    var hp = d.hpMode === "roll" ? d.hpRoll : d.avg;
    if (hp == null) { toast("Roll the hit die, or take the average."); return; }
    var picks = [];
    $$("[data-lvl-spell]:checked").forEach(function (box) {
      var holder = box.parentNode;
      if (holder && holder._spell) picks.push(holder._spell);
    });
    var cantrips = picks.filter(function (sp) { return sp.level === 0; });
    var spells = picks.filter(function (sp) { return sp.level > 0; });
    if (cantrips.length !== d.cantripNeed) { toast("Pick " + d.cantripNeed + " new cantrip" + (d.cantripNeed === 1 ? "" : "s") + "."); return; }
    if (spells.length !== d.spellNeed) { toast("Pick " + d.spellNeed + " new spell" + (d.spellNeed === 1 ? "" : "s") + "."); return; }
    var asiMode = d.asi ? (checkedRadio("lvlAsi") || "plus2") : "";
    var a = $("#lvlPlusA") && $("#lvlPlusA").value, b = $("#lvlPlusB") && $("#lvlPlusB").value;
    if (asiMode === "plus1" && a === b) { toast("Pick two different scores."); return; }
    var c = C();
    c.level = d.to;
    if (d.hpMode === "roll") {
      c.hpAuto = false;
      c.hpMax = num(c.hpMax, 0) + hp;
      c.hpCurrent = num(c.hpCurrent, 0) + hp;
    } else {
      c.hpAuto = true;
      applyAutoHp();
    }
    var cal = currentCalling();
    if (cal) c.hitDiceLeft = d.to + cal.hitDie;
    d.feats.forEach(function (f) {
      var line = "• " + f.name + (f.text ? ": " + f.text : "");
      if (String(c.features || "").indexOf(f.name) < 0) c.features = (String(c.features || "").replace(/\s+$/, "") + (c.features ? "\n" : "") + line);
    });
    picks.forEach(function (sp) { addKnownSpell(sp); });
    if (asiMode === "plus2") {
      var id = $("#lvlPlus2").value;
      c.abilities[id] = Math.min(30, num(c.abilities[id], 10) + 2);
    } else if (asiMode === "plus1") {
      c.abilities[a] = Math.min(30, num(c.abilities[a], 10) + 1);
      c.abilities[b] = Math.min(30, num(c.abilities[b], 10) + 1);
    } else if (asiMode === "feat") {
      var fid = $("#lvlFeat").value;
      if (fid && c.feats.indexOf(fid) < 0) c.feats.push(fid);
    }
    lvlDraft = null;
    var dlg = $("#dlgLevel");
    if (dlg && dlg.close) dlg.close();
    renderFields();
    changed();
    toast("Level " + c.level + ". " + ($("#lvlSummary") ? "" : "") + "Check HP, features, and spells.");
  }
  var printState = null;
  function beforePrint() {
    printState = $$(".page").map(function (p) { return p.hidden; });
    $$(".page").forEach(function (p) { p.hidden = false; });
    $$("textarea").forEach(function (t) { t.style.height = "auto"; t.style.height = Math.max(t.scrollHeight, t.offsetHeight) + "px"; });
    $("#refPanel").open = false;
  }
  function afterPrint() {
    if (printState) $$(".page").forEach(function (p, i) { p.hidden = printState[i]; });
    printState = null;
    $$("textarea").forEach(function (t) { t.style.height = ""; });
  }
  function wireDrop() {
    var ov = $("#dropOverlay"), depth = 0;
    function isFile(e) { return e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], "Files") >= 0; }
    window.addEventListener("dragenter", function (e) { if (!isFile(e)) return; depth++; ov.classList.add("on"); e.preventDefault(); });
    window.addEventListener("dragover", function (e) { if (isFile(e)) e.preventDefault(); });
    window.addEventListener("dragleave", function () { depth = Math.max(0, depth - 1); if (!depth) ov.classList.remove("on"); });
    window.addEventListener("drop", function (e) {
      if (!isFile(e)) return;
      e.preventDefault(); depth = 0; ov.classList.remove("on");
      var file = e.dataTransfer.files[0];
      if (!file) return;
      var target = e.target.closest && e.target.closest("[data-img]");
      if (/^image\//.test(file.type)) {
        if (target) loadImage(file, target.getAttribute("data-img"));
        else toast("Drop pictures onto the portrait or gang symbol box (page 2).");
        return;
      }
      confirmLeave().then(function (ok) {
        if (!ok) return;
        var item = e.dataTransfer.items && e.dataTransfer.items[0];
        var hp = null;
        try { hp = item && item.getAsFileSystemHandle && Store.fsSupported ? item.getAsFileSystemHandle() : null; } catch (err) { hp = null; }
        Promise.resolve(hp).catch(function () { return null; }).then(function (h) {
          return file.text().then(function (t) { loadText(t, { handle: h && h.kind === "file" ? h : null, fileName: file.name }); });
        });
      });
    });
  }

  // ------------------------------------------------------------------ boot
  function rest(kind) {
    var go = function () {
      if (window.SSDNSSheet && window.SSDNSSheet.applyRest) {
        window.SSDNSSheet.applyRest(kind, { prompted: true });
        renderFields();
        return;
      }
      finishRest(kind);
    };
    if (kind === "short") promptShortRestTools().then(go);
    else {
      C().muzzleReopenUsed = false;
      go();
    }
    return;
  }
  function finishRest(kind) {
    C().firstShotSpent = false; /* 0.3.69: a rest ends the combat; the rig's first shot is ready again */
    var ci = casterInfo(), r = C().hexRest || (ci ? ci.rest : "long");
    if (kind === "long" || r === "short") {
      for (var l = 1; l <= 9; l++) C().hexLead[l] = new Array(MAX_BOXES).fill(false);
      renderFields(); changed(); toast(slotWord() + " refreshed (" + kind + " rest).");
    } else toast("Your " + slotWord() + " comes back on a long rest.");
  }
  function wire() {
    document.addEventListener("input", onFieldInput);
    document.addEventListener("change", onFieldInput);
    document.addEventListener("focusout", function (e) {
      var t = e.target;
      if (!t || !t.getAttribute || t.getAttribute("data-f") !== "character.abilities.CON") return;
      if (C().hpAuto !== false) applyAutoHp();
    });
    document.addEventListener("click", onClick);
    document.addEventListener("dblclick", onDblClick);
    $("#btnNew").onclick = doNew;
    $("#btnOpen").onclick = doOpen;
    $("#btnSave").onclick = doSave;
    $("#btnSaveAs").onclick = doSaveAs;
    $("#btnSaveAs").hidden = !Store.fsSupported;
    $("#btnRestore").onclick = openRestore;
    $("#btnSaloon").onclick = function () { $("#dlgSaloon").showModal(); };
    $("#btnPrint").onclick = function () { window.print(); };
    $("#fileInput").addEventListener("change", function (e) {
      e.stopPropagation();
      var f = e.target.files[0]; if (!f) return;
      f.text().then(function (t) { loadText(t, { fileName: f.name }); e.target.value = ""; });
    });
    $("#btnAddAmmo").onclick = function () {
      C().ammo.push({ type: "cartridge", caliber: "", count: 0 }); changed();
      var rows = $$("#ammoList .ammo-row"); if (rows.length) $("select", rows[rows.length - 1]).focus();
    };
    $("#btnAddExplosive").onclick = function () {
      var wrap = $("#explosiveList .exp-add");
      if (wrap) { wrap.hidden = false; var p = $("#explosivePick"); if (p) p.focus(); }
    };
    document.addEventListener("change", function (e) {
      var t = e.target;
      if (!t || t.id !== "explosivePick" || !t.value) return;
      var Items = window.SSDNSItems;
      if (!Items || !Items.add) return;
      var have = (C().items || []).filter(function (it) { return it && it.type === "explosive" && (it.catalogId === t.value || it.id === t.value); })[0];
      if (have) have.count = (Number(have.count) || 1) + 1;
      else {
        var res = Items.add(C(), Items.byId ? Items.byId(t.value) : { id: t.value }, {});
        if (res && !res.ok && res.reason) toast(res.reason);
      }
      t.value = "";
      changed();
    });
    $("#btnGearAdd").onclick = function () {
      var v = $("#gearAdd").value.trim(); if (!v) return;
      var c = C(); c.equipment = (c.equipment ? c.equipment.replace(/\s+$/, "") + "\n" : "") + "• " + v;
      $("#gearAdd").value = ""; renderFields(); changed();
    };
    $("#gearAdd").addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); $("#btnGearAdd").click(); } });
    $("#selFeatAdd").addEventListener("change", function (e) {
      var id = e.target.value; e.target.value = "";
      if (!id || C().feats.indexOf(id) >= 0) return;
      C().feats.push(id); changed();
      var f = FEAT[id]; toast("Added " + f.name + (f.prereq ? " (prerequisite: " + f.prereq + ")" : "") + ": " + f.gist);
    });
    if ($("#btnConsume")) $("#btnConsume").onclick = consumeShard;
    if ($("#btnLevelUp")) $("#btnLevelUp").onclick = openLevelUp;
    var lvlBody = $("#lvlBody");
    if (lvlBody) lvlBody.addEventListener("change", refreshLevelSummary);
    if (lvlBody) lvlBody.addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest("#btnLvlRoll");
      if (!b || !lvlDraft) return;
      var nat = 1 + Math.floor(Math.random() * lvlDraft.die);
      lvlDraft.hpRoll = Math.max(1, nat + lvlDraft.con);
      lvlDraft.hpMode = "roll";
      paintLevelUp();
    });
    if ($("#btnLvlApply")) $("#btnLvlApply").onclick = applyLevelUp;
    if ($("#btnLvlCancel")) $("#btnLvlCancel").onclick = function () {
      lvlDraft = null;
      var dlg = $("#dlgLevel");
      if (dlg && dlg.close) dlg.close();
    };
    if ($("#btnHpAuto")) $("#btnHpAuto").onclick = function () {
      C().hpAuto = true;
      applyAutoHp();
      renderFields();
      changed();
      toast("Hit points set from the Calling hit die and Constitution.");
    };
    $("#btnShortRest").onclick = function () { rest("short"); };
    $("#btnLongRest").onclick = function () { rest("long"); };
    $("#btnAddSpell").onclick = openSpellPicker;
    $("#btnClosePicker").onclick = function () { $("#spellPicker").hidden = true; };
    $("#spellSearch").addEventListener("input", function () {
      renderSpellbook();
      if ($("#spellPicker") && !$("#spellPicker").hidden) fillSpellPicker();
    });
    $("#btnKitAdd").onclick = function () {
      var sel = $("#selKitCrosswalk");
      var i = sel && sel.value !== "" ? num(sel.value) : -1;
      var row = R.kitCrosswalk && R.kitCrosswalk.crosswalk && R.kitCrosswalk.crosswalk[i];
      if (!row) { toast("Pick a starting-kit row first."); return; }
      var line = "• Kit swap: " + row.old + " → " + row.frontier;
      var c = C();
      c.equipment = (c.equipment ? c.equipment.replace(/\s+$/, "") + "\n" : "") + line;
      renderFields(); changed();
      toast("Added kit crosswalk line to Equipment.");
    };
    window.addEventListener("beforeprint", beforePrint);
    window.addEventListener("afterprint", afterPrint);
    window.addEventListener("pagehide", function () {
      if (S.doc && S.hasContent) { try { Store.saveCurrent(S.doc); } catch (err) {} }
    });
    document.addEventListener("visibilitychange", function () {
      if (document.hidden && S.doc && S.hasContent) { saveLocal(); if (S.handle && S.fileDirty) writeFile(false); }
    });
    document.addEventListener("keydown", function (e) { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); doSave(); } });
    Bridge.onChange(onWallet);
    beatAlive();
    setInterval(beatAlive, 20000);
    wireDrop();
    wireTabs();
  }
  function boot() {
    buildStaticLists(); buildAbilities(); buildSavesSkills(); buildChecks(); buildGuns(); buildShards(); buildSpellGrid(); buildGames();
    wire();
    var saved = Store.loadCurrent(Store.lastId());
    if (saved) {
      try { S.doc = migrate(saved); } catch (e) { S.doc = blankDoc(); }
      S.hasContent = true; S.lastLocal = Date.now();
      snapshot("session start");
      if (C().hpAuto !== false && (C().hpMax === "" || C().hpMax == null)) applyAutoHp();
      renderFields(); adoptWallet(); pushWallet();
      Store.getHandle(S.doc.id).then(function (h) {
        if (!h) return;
        S.handle = h; S.fileName = h.name;
        return Store.permission(h, false).then(function (p) { S.permNeeded = p !== "granted"; });
      }).catch(function () {}).then(updateSaveBar);
      try {
        var welcomeKey = "ssdns.sheet.welcomed." + S.doc.id;
        if (!sessionStorage.getItem(welcomeKey)) {
          sessionStorage.setItem(welcomeKey, "1");
          toast("Welcome back. Picked up " + (C().name || "your character") + " from this browser's backup.");
        }
      } catch (e) {
        toast("Welcome back. Picked up " + (C().name || "your character") + " from this browser's backup.");
      }
    } else {
      S.doc = blankDoc(); S.hasContent = false;
      renderFields();
    }
    updateSaveBar();
    watchTabs();
    setTimeout(function () { if (window.SSDNSCreator) window.SSDNSCreator.maybeOpen(S.doc); }, 0);
    // dev/test hook: read-only helpers, no rules
    // v0.2.1: keep the sticky tabs just under the (possibly wrapped) app bar on phones
    function syncBarH() { var ab = $("#appbar"); if (ab) document.documentElement.style.setProperty("--appbar-h", ab.offsetHeight + "px"); }
    window.addEventListener("resize", syncBarH); syncBarH(); setTimeout(syncBarH, 300);
    if (window.matchMedia("(max-width: 414px)").matches) {
      $$("details.phone-fold").forEach(function (d) { d.open = false; });
    }
    window.SSDNSToast = toast;
    window.SSDNSApp = {
      version: APP_VERSION, state: S, loadText: loadText, migrate: migrate, compute: compute,
      critMin: critMin, powerAttack: powerAttack, autoSpeed: autoSpeed, hasFeat: hasFeat,
      doc: function () { return S.doc; },
      spendRound: spendRound,
      spendHexSlot: spendHexSlot,
      spendHexChamber: spendHexChamber,
      fireHexShell: fireHexShell,
      casterInfo: casterInfo,
      callingProficient: callingProficient,
      styleAttackBonus: styleAttackBonus,
      styleDamageBonus: styleDamageBonus,
      hasStyle: function (id, c) { return hasStyle(c, id); },
      stylesOf: function (c) { return stylesOf(c || C()); },
      rageDamageBonus: function (c) { return rageDamageBonus(c); },
      canTacticalReload: function (w, c) { return canTacticalReload(w, c); },
      holsterFor: function (c, i) { return holsterFor(c, i); },
      activeBuffs: function (c, key) { return activeBuffs(c, key); },
      applyPatch: function (fn) {
        if (window.SSDNSDmJoin && window.SSDNSDmJoin.isReadOnly && window.SSDNSDmJoin.isReadOnly()) return;
        if (fn) fn(S.doc); renderFields(); changed(); publishGunCard();
      },
      receiveWeapon: function (payload) { return receiveWeapon(payload); },
      removeGearLine: function (text) { return removeGearLine(text); },
      applyAutoHp: function () { applyAutoHp(); renderFields(); changed(); },
      slotsLeft: slotsLeft,
      misfireCeiling: misfireCeiling,
      migrateSettlerLanguages: migrateSettlerLanguages,
      longGun22: longGun22,
      armDirtyD4: function (i) {
        if (window.SSDNSD4 && window.SSDNSD4.arm) return window.SSDNSD4.arm(i);
      },
      reloadGun: function (i, max) { reload(i, max); },
      reloadCost: function (i) { var g = C().guns[i]; return reloadCost(g, g && WPN[g.weapon], 0); },
      rechamberOptions: function (i) { return rechamberOptions(i); },
      rechamberGun: function (i, value, opts) { return rechamberGun(i, value, opts); },
      openRechamber: function (i) { return openRechamber(i); },
      unloadGunIndex: function (i) { unloadLoaded(i); },
      tacticalReload: function (i) { tacticalReload(i); },
      loadHexShell: function (i) { loadHexShell(i); },
      loadHexAt: function (i, level) { return loadHexAt(i, level); },
      ammoChoices: function (i) { return ammoChoices(i); },
      setAmmoPool: function (i, idx) { return setGunAmmoPool(i, idx); },
      setAttackMode: function (i, mode) { return setGunAttackMode(i, mode); },
      gunAttackMode: function (i) { return gunAttackMode(i); },
      castList: function () { return castList(); },
      prepareGunCast: function (i, spell, slot) { prepareGunCast(i, spell, slot); },
      grantTestGun: function (i) { return grantTestGun(i); },
      grantListedWeapon: function (idOrName) { return grantListedWeapon(idOrName); },
      setEquipped: function (opts) { return setEquipped(opts); },
      clearDrawn: function () { return clearDrawn(); },
      gunMeleeLabel: gunMeleeLabel,
      cleanGun: function (i) { return cleanGun(i); },
      /* 0.3.75: the map card and the jam pop-up pay the same cost as the Gear button (bonus action, or free).
         A DM unjam (dm-join op "clean"/"unjam" -> applyCleanOption) stays free (Jessey, 2026-10-19). */
      unjamGun: function (i) { return withCost(i, unjamCost(i), "Unjam", function () { return unjamGun(i); }); },
      /* 0.3.69: Reopen chamber is an action (once per short rest) on every path, the DM-acting one included */
      reopenChamber: function (i) { return withCost(i, "action", "Reopen chamber", function () { return reopenChamber(i); }); },
      clearLockedChambers: function (i, mode, chamber) { return clearLockedChambers(i, mode, chamber); },
      repairGun: function (i, hint) { return repairGun(i, hint); },
      refreshGunFace: refreshGunFace,
      promptShortRestTools: function () { return promptShortRestTools(); },
      applyCleanOption: function (i, optionId) { return applyCleanOption(i, optionId); },
      suggestedHp: function () { return suggestedHp(C()); }
    };
  }
  boot();
})();

/* SSDNS Character Sheet · v0.3.2 (round 6: stop listening to DM-only commands)
 * Static, no server. Rules data: window.SSDNS_RULES (assets/data/rules.js, generated from the PHB).
 * Saving: SSDNSStore (storage.js). Shards bridge for Saloon games: SSDNSBridge (ssdns-bridge.js).
 */
(function () {
  "use strict";
  var APP_VERSION = "0.3.2"; // sheet-round6-v032
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
      "musket": ["dull-co-rifle-musket", "medium"], "bison-big-fifty-50-90": ["bison-big-fifty-buffalo-rifle", "medium"],
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
      ammo: [], explosives: [], holster: "", holsterActive: false, seated: false, mounted: false, gunBelt: false, attackNotes: "",
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
      list.forEach(function (r) { o.push([t + "|" + r, TIER_LABEL[t] + (r ? " · " + r : "")]); });
    });
    return o;
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
    (c.ammo || []).forEach(function (a) { if (a.caliber === "12 gauge") a.caliber = "12 ga"; });
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
      return phb === needle || name.toLowerCase().indexOf(needle) >= 0;
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
  function compute() {
    var c = C(), v = {};
    var hol = HOL[c.holster];
    v.scores = {}; v.mods = {};
    AB.forEach(function (a) { v.scores[a] = num(c.abilities[a], 10); });
    // PHB Holsters: one rig. Cross-Draw's first shot only while seated, mounted, or driving.
    // Pommel initiative only while mounted. Belt rigs lose the first-shot bonus while seated or mounted.
    v.holsterDex = 0;
    v.holsterInit = 0;
    v.holsterFirst = 0;
    if (hol && c.holsterActive) {
      var belt = /^belt rig/i.test(hol.perk || "");
      var pommel = /†/.test(hol.initText || "") || /pommel/i.test(hol.name || "");
      var cross = !!hol.conditional && /first-shot bonus only then/i.test(hol.perk || "");
      var posture = !!c.seated || !!c.mounted;
      if (pommel) { if (c.mounted) v.holsterInit = num(hol.initBonus); }
      else v.holsterInit = num(hol.initBonus);
      if (cross) { if (posture) v.holsterFirst = num(hol.firstShot); }
      else if (belt) { if (!c.seated && !c.mounted) v.holsterFirst = num(hol.firstShot); }
      else v.holsterFirst = num(hol.firstShot);
    }
    AB.forEach(function (a) { v.mods[a] = mod(v.scores[a]); });
    v.prof = profBonus(c.level);
    v.saves = {}; AB.forEach(function (a) { v.saves[a] = v.mods[a] + (c.saveProf[a] ? v.prof : 0); });
    v.skills = {};
    R.skills.forEach(function (s) { var p = num(c.skillProf[s.name], 0); v.skills[s.name] = v.mods[s.ability] + p * v.prof; });
    v.passive = 10 + v.skills.Perception;
    v.initiative = v.mods.DEX + v.holsterInit;
    var arm = ARM[c.armor];
    var wearing = arm && arm.category !== "shield";
    if (wearing) v.ac = arm.base + Math.min(v.mods.DEX, arm.dexCap);
    else if (c.calling === "tribal-warrior") v.ac = 10 + v.mods.DEX + v.mods.CON;
    else if (c.calling === "martial-artist" && !wearing) v.ac = 10 + v.mods.DEX + v.mods.WIS;
    else v.ac = 10 + v.mods.DEX;
    if (c.shield && !(c.calling === "martial-artist" && !wearing)) v.ac += 2;
    if (c.fightingStyle === "point-blank") v.ac += 1;
    if (c.fightingStyle === "defense" && wearing) v.ac += 1;
    var cal = currentCalling();
    v.hitDiceTotal = cal ? num(c.level, 1) + cal.hitDie : "";
    var ci = casterInfo();
    v.caster = ci;
    v.spellMod = ci ? v.mods[ci.ability] : null;
    v.spellDC = ci ? 8 + v.prof + v.spellMod : "";
    v.spellAtk = ci ? sign(v.prof + v.spellMod) : "";
    v.hex = hexTotals();
    v.cp = Bridge.cpValue(S.doc.shards); // ES total (1 ES per white shard)
    v.guns = c.guns.map(function (g) { return gunStats(g, v); });
    return v;
  }
  function gunStats(g, v) {
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
    if (w.scatter && g.load !== "slug") notes.push("buckshot: 15-ft cone");
    var m;
    if (w.ability === "SPELL") {
      m = v.mods.CHA; // plain rounds: the Caster Gun uses your spellcasting ability (PHB: Caster Guns, Spellcasting (Cha))
      s.atk = sign(m + (g.proficient ? v.prof : 0));
      s.dmg = s.damage + (m ? " " + sign(m) : "") + " piercing";
      notes.push("hex lead shells: spell attack " + (v.caster ? v.spellAtk : "—"));
      s.note = notes.join(" · ");
      return s;
    }
    m = w.ability === "STR/DEX" ? Math.max(v.mods.STR, v.mods.DEX) : (w.ability === "STR" ? v.mods.STR : v.mods.DEX);
    var style = styleAttackBonus(w);
    var dmgStyle = styleDamageBonus(w);
    var first = (v.holsterFirst && w.group === "pistol") ? v.holsterFirst : 0;
    if (mod && /hair trigger/i.test(mod.name) && w.group === "pistol") first = Math.min(2, first + 1); // PHB: counts toward the rig's +2 first-shot cap
    if (mod) notes.push("mod: " + mod.name);
    s.atk = sign(m + (g.proficient ? v.prof : 0) + style);
    if (style) notes.push((C().fightingStyle || "style") + " " + sign(style));
    if (dmgStyle) notes.push((C().fightingStyle || "style") + " damage " + sign(dmgStyle));
    if (first) notes.push("first shot from the rig " + sign(m + (g.proficient ? v.prof : 0) + style + first));
    var dmgMod = m + dmgStyle;
    s.dmg = s.damage ? s.damage + (dmgMod ? " " + sign(dmgMod) : "") + " " + (s.dmgType || "") : "";
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
      return { group: cat[0].toUpperCase() + cat.slice(1) + " armor", items: R.armor.filter(function (a) { return a.category === cat; }).map(function (a) { return [a.id, a.name + " (" + a.ac + ")"]; }) };
    });
    fillSelect($("#selArmor"), armGroups, "None (10 + Dex)");
    fillSelect($("#selHolster"), [
      { group: "Rigs", items: R.holsters.filter(function (h) { return h.isRig; }).map(function (h) { return [h.id, h.name + (h.initText && h.initText !== "—" ? " · Init " + h.initText : "") + (h.firstShotText && h.firstShotText !== "—" ? " · 1st shot " + h.firstShotText : "")]; }) },
      { group: "Not a rig", items: R.holsters.filter(function (h) { return !h.isRig; }).map(function (h) { return [h.id, h.name]; }) }], "No holster");
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
  function styleAttackBonus(w) {
    var st = (C() && C().fightingStyle) || "";
    if (!w || !st || !styleReady()) return 0;
    var g = String(w.group || "");
    var ranged = g === "rifle" || g === "carbine" || g === "bigbore" || g === "bow" || /bow/.test(g);
    if ((st === "long-gun" || st === "archery") && ranged) return 2;
    return 0;
  }
  function styleDamageBonus(w) {
    var st = (C() && C().fightingStyle) || "";
    if (!w || !st || !styleReady()) return 0;
    if (st === "sidearm" && w.group === "pistol") return 2;
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
    box.appendChild(el("div", { class: "gun-head" }, ["Gun (maker / model)", "Atk", "Damage", "Range", "Cap.", "Rounds in the gun", "Misfire"].map(function (h) { return el("span", { text: h }); })));
    for (var i = 0; i < 4; i++) {
      var sel = el("select", { "data-f": "character.guns." + i + ".weapon", "data-gun": i, "aria-label": "Gun " + (i + 1) });
      gunOptions(sel);
      var chamber = el("select", { "data-f": "character.guns." + i + ".chamber", class: "chamber-sel", "aria-label": "Chambered round (tier)", title: "Chambered round: the tier and round this gun fires (PHB: Chambering)" });
      var load = el("select", { "data-f": "character.guns." + i + ".load", class: "load", "aria-label": "Shell load" }, [opt("buck", "Buckshot"), opt("slug", "Slug")]);
      var modSel = el("select", { "data-f": "character.guns." + i + ".mod", class: "mod-sel", "aria-label": "Gunsmith modification", title: "Gunsmithing: one modification slot" });
      var capSel = el("select", { "data-f": "character.guns." + i + ".capacity", class: "cap-sel", "aria-label": "Capacity upgrade", title: "Gunsmithing: capacity upgrades (one step at a time)" });
      var hexSel = el("select", { class: "hex-lvl", "data-hexlvl": i, "aria-label": "Hex lead shell level" }, [1, 2, 3, 4, 5, 6, 7, 8, 9].map(function (l) { return opt(String(l), l + (l === 1 ? "st" : l === 2 ? "nd" : l === 3 ? "rd" : "th")); }));
      box.appendChild(el("div", { class: "gun", "data-row": i }, [
        el("div", { class: "g-name" }, [sel, el("div", { class: "g-sub" }, [chamber, load, modSel, capSel, el("span", { class: "g-cal", "data-out": "cal." + i }),
          el("label", { class: "tiny" }, [el("input", { type: "checkbox", "data-f": "character.guns." + i + ".proficient" }), " prof."]),
          el("label", { class: "tiny", title: "Engraving and grips. It does not use the modification slot." }, [el("input", { type: "checkbox", "data-f": "character.guns." + i + ".engraving" }), " engraving"])])]),
        el("div", { class: "g-atk", "data-label": "Atk" }, [el("input", { class: "calc", "data-calc": "gunAtk." + i, "aria-label": "Attack bonus" })]),
        el("div", { class: "g-dmg", "data-label": "Damage" }, [el("input", { class: "calc", "data-calc": "gunDmg." + i, "aria-label": "Damage" })]),
        el("div", { class: "g-rng", "data-label": "Range", "data-out": "rng." + i }),
        el("div", { class: "g-cap", "data-label": "Cap.", "data-out": "cap." + i }),
        el("div", { class: "g-load", "data-label": "Loaded" }, [el("div", { class: "chambers", "data-chambers": i }),
          el("div", { class: "g-btns" }, [
            el("span", { class: "g-count", "data-out": "left." + i }),
            el("button", { type: "button", class: "btn sm reload", "data-reload": i, title: "Reload: an action, fills the gun (slow guns: a full turn). Pick which ammo if you have more than one pile." }, ["Reload"]),
            el("button", { type: "button", class: "btn sm", "data-unload": i, title: "Unload: put the chambered rounds back in your ammo, by type" }, ["Unload"]),
            el("select", { class: "adv-sel", "data-adv": i, "aria-label": "Advantage or disadvantage", title: "Advantage or disadvantage. Both dice in the misfire range fouls the gun." }, [opt("", "—"), opt("adv", "Adv"), opt("dis", "Dis")]),
            el("button", { type: "button", class: "btn sm", "data-gunroll": i, title: "Plain attack. Never spends a spell slot. A natural roll in the gun's misfire range jams it. Dirty misfires on at least 1–2." }, ["Roll"]),
            el("button", { type: "button", class: "btn sm tr", "data-tr": i, title: "Tactical Reload: bonus action, load one round from a gun belt or bandolier (TR ✓ guns only)" }, ["TR +1"]),
            el("span", { class: "hexload", "data-hexwrap": i }, [hexSel, el("button", { type: "button", class: "btn sm hexbtn", "data-hexload": i, title: "Load one hex shell of this level. Loading spends the slot. Fire it later as a spell attack." }, ["+ Hex shell"])]),
            el("span", { class: "cast-through", "data-castwrap": i }, [
              el("select", { class: "cast-spell", "data-castspell": i, "aria-label": "Spell to cast through this gun" }),
              el("select", { class: "cast-slot", "data-castslot": i, "aria-label": "Shell or slot level", hidden: true }),
              el("button", { type: "button", class: "btn sm castbtn", "data-cast": i, title: "Cast the spell you picked. A cantrip spends nothing. A Hexslinger shell was spent when you loaded it. A natural 1 on a shell is a wild spark, not a jam." }, ["Cast through gun"])
            ])
          ]),
          el("div", { class: "load-picks", "data-loadpick": i })
        ]),
        el("div", { class: "g-mis", "data-label": "Misfire" }, [el("span", { "data-out": "mis." + i }),
          el("label", { class: "tiny jam" }, [el("input", { type: "checkbox", "data-f": "character.guns." + i + ".jammed" }), " jammed"]),
          el("label", { class: "tiny jam" }, [el("input", { type: "checkbox", "data-f": "character.guns." + i + ".fouled" }), " fouled"]),
          el("label", { class: "tiny jam" }, [el("input", { type: "checkbox", "data-f": "character.guns." + i + ".dirty" }), " dirty"]),
          el("button", { type: "button", class: "btn xs", "data-clean": i, title: "Dirty: 10 minutes with a gun cleaning kit or gunsmith's tools. Fouled: a short rest with tinker's or gunsmith's tools, or 500 ES." }, ["Clean"])]),
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
        if (ep) ep.innerHTML = breath
          ? "<b>Breath Coins.</b> " + esc(scn.name) + " casts with Breath Coins, not spell slots. Track those with your DM."
          : "<b>No spell slots.</b> This Calling doesn't use a spellbook. Tong Hatchet Man and Way of Kung Fu cast with Breath Coins, not these slots.";
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
      list.appendChild(btn);
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
      list.appendChild(btn);
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
    suppress = false;
    renderCalc();
  }
  function out(key, text) { $$('[data-out="' + key + '"], [data-calc-out="' + key + '"]').forEach(function (e) { e.textContent = text; }); }
  function calcValue(key, v) {
    var p = key.split(".");
    switch (p[0]) {
      case "profBonus": return sign(v.prof);
      case "passive": return v.passive;
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
  function renderCalc() {
    var c = C(), v = compute();
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
      if (sel.getAttribute("data-built-for") === callKey) return;
      var cur = sel.value || (c.guns[num(sel.getAttribute("data-gun"))] || {}).weapon || "";
      gunOptions(sel);
      sel.setAttribute("data-built-for", callKey);
      if (cur) sel.value = cur;
    });
    fillCasterGunSelect();
    c.guns.forEach(function (g, i) {
      var s = v.guns[i], row = $('.gun[data-row="' + i + '"]'), w = s && s.w;
      row.classList.toggle("empty", !s);
      row.classList.toggle("is-shotgun", !!(w && w.scatter));
      row.classList.toggle("is-caster", !!(w && w.hexShells));
      row.classList.toggle("jammed", !!g.jammed);
      ["jammed", "fouled", "dirty"].forEach(function (flag) {
        var box = row.querySelector('[data-f="character.guns.' + i + '.' + flag + '"]');
        if (box && document.activeElement !== box) box.checked = !!g[flag];
      });
      if (hasGunBelt() || !(w && w.tr)) row.classList.remove("tr-warn");
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
      if (w && w.tiers) { var cc = chamberOf(g, w); cs.value = cc.tier + "|" + cc.round; }
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
      for (var k = 0; k < cap; k++) {
        var st = shells ? shells[k] : "";
        var parsed = parseChamber(st);
        var hex = parsed && parsed.kind === "hex";
        var color = chamberColor(st, g, w);
        var label = chamberLabel(st, g, w);
        var btn = el("button", {
          type: "button",
          class: "chamber" + (st ? " loaded" : "") + (hex ? " hex" : "") + (k === nextK ? " next" : ""),
          "data-fire": i, "data-k": k, text: hex ? parsed.level : "",
          "aria-label": (label || "Empty") + " · chamber " + (k + 1) + (k === nextK ? " · next under the hammer" : ""),
          title: label ? (label + (k === nextK ? " · next" : "") + (hex ? " · Cast through gun" : " · tap to fire")) : "Empty"
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
      $('[data-reload="' + i + '"]').hidden = !cap;
      var unloadBtn = $('[data-unload="' + i + '"]');
      if (unloadBtn) unloadBtn.hidden = !cap;
      var rollBtn = $('[data-gunroll="' + i + '"]');
      if (rollBtn) {
        rollBtn.hidden = !s;
        var emptyGun = !!(s && !(num(g.loaded) > 0));
        rollBtn.textContent = emptyGun ? "Reload" : "Roll";
      }
      $('[data-tr="' + i + '"]').hidden = !(cap && w && w.tr);
      $('[data-hexwrap="' + i + '"]').hidden = !(cap && w && w.hexShells);
      var castWrap = $('[data-castwrap="' + i + '"]');
      if (castWrap) castWrap.hidden = !(cap && w && w.hexShells);
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
    var h = HOL[c.holster];
    var holMsg;
    if (h) {
      holMsg = h.name + ": holds " + h.holds + ". Init. " + (h.initText || "—") + ", first shot " + (h.firstShotText || "—") + ". " + h.perk + " ";
      if (h.conditional) holMsg += "* ";
      if (h.isRig) holMsg += c.holsterActive ? "(Applied: pistol in the rig.) " : "(Tick when a pistol rides in it to apply.) ";
      if (c.seated) holMsg += "Seated or driving. ";
      if (c.mounted) holMsg += "Mounted. ";
      else if (h.feedsTR) holMsg += "(Feeds Tactical Reload.) ";
      holMsg += R.rulesText.holster;
    } else {
      holMsg = "No holster: no initiative or first-shot bonus; quick-draw needs a DC 12 Dex check. " + R.rulesText.holster;
    }
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
    var gnote = "";
    if (showCast && c.calling !== "pact-seeker") {
      gnote = R.rulesText.casterGun.replace(/^[-\s]*Channel:\s*/, "");
      gnote = gnote.charAt(0).toUpperCase() + gnote.slice(1);
      if (cgun && cgun.notes && cgun.notes.length) gnote = cgun.name + ": " + cgun.notes.join(" ") + " " + gnote;
      if (c.casterGun === "ordinary-firearm") gnote = "Forcing hex lead through an ordinary firearm: spell attacks have disadvantage and targets have advantage on saves (PHB, Hexslinger).";
    } else if (c.calling === "pact-seeker") {
      gnote = R.rulesText.borrowedIron || "Borrowed Iron is a pact focus. It has no weapon stats. Pact Shot is the attack.";
    }
    $("#gunNote").textContent = gnote;
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
      cals.forEach(function (name) { cal.appendChild(opt(name, name)); });
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
  function renderExplosives() {
    var box = $("#explosiveList"); if (!box) return;
    box.innerHTML = "";
    var c = C();
    if (!c.explosives) c.explosives = [];
    if (!c.explosives.length) box.appendChild(el("p", { class: "fine", text: "No explosives yet." }));
    var items = (R.explosives && R.explosives.items) || [];
    c.explosives.forEach(function (row, i) {
      var sel = el("select", { "data-f": "character.explosives." + i + ".item", "aria-label": "Explosive" });
      sel.appendChild(opt("", "Explosive…"));
      items.forEach(function (it) { sel.appendChild(opt(it.id, it.name + (it.notes ? " — " + it.notes : ""))); });
      sel.value = row.item || "";
      var cnt = el("input", { type: "number", min: "0", "data-f": "character.explosives." + i + ".count", "aria-label": "Count", inputmode: "numeric" });
      cnt.value = row.count == null ? 0 : row.count;
      var rm = el("button", { type: "button", class: "btn sm", "data-exp-del": i, title: "Remove" }, ["×"]);
      box.appendChild(el("div", { class: "ammo-row" }, [sel, cnt, rm]));
    });
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
    var show = c.calling === "storyteller" || !!c.instrument;
    kit.hidden = !show;
    if (!show) return;
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
    if (info) info.textContent = parts.join(" ");
    var q = $("#selInstrumentQuality");
    if (q) q.disabled = c.instrument === "voice" || c.instrument === "piano" || !c.instrument;
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
    if (suppress || !t.getAttribute) return;
    if (t.hasAttribute("data-castspell") || t.hasAttribute("data-castslot")) { renderCalc(); return; }
    if (t.hasAttribute("data-calc")) {
      var k = t.getAttribute("data-calc");
      C().overrides[k] = t.value.trim();
      if (C().overrides[k] === "") delete C().overrides[k];
      changed({ noRender: e.type === "input" });
      return;
    }
    var path = t.getAttribute("data-f");
    if (!path) return;
    var old = getPath(S.doc, path), v;
    if (t.type === "checkbox") v = t.checked;
    else if (t.type === "number") v = t.value === "" ? "" : Number(t.value);
    else v = t.value;
    if (path.indexOf("shards.") === 0) v = Math.max(0, Math.floor(num(v, 0)));
    if (e.type === "input" && t.tagName === "SELECT") return; // handled on change
    setPath(S.doc, path, v);
    // v0.2.1: picking Gun Belt / Bandolier ticks the TR feed box (picking something else leaves it alone)
    if (path === "character.holster" && HOL[v] && HOL[v].feedsTR) C().gunBelt = true;
    $$('[data-mirror="' + path + '"]').forEach(function (m) { m.textContent = v; });
    if (path === "character.hpMax") C().hpAuto = false;
    if (e.type === "change") {
      if (path === "character.calling") onCallingPicked();
      else if (path === "character.lineage") onLineagePicked();
      else if (path === "character.sublineage") onSublineagePicked();
      else if (path === "character.background") onBackgroundPicked();
      else if (/^character\.guns\.\d+\.(weapon|load|chamber|capacity)$/.test(path)) onGunChanged(num(path.split(".")[2]), path.split(".")[3], old);
      if (C().hpAuto !== false && (path === "character.calling" || path === "character.level" || path === "character.abilities.CON")) applyAutoHp();
    }
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
    var con = mod(num(c.abilities.CON, 10));
    var lv = Math.max(1, Math.min(20, num(c.level, 1)));
    var hp = Math.max(1, die + con);
    var per = Math.max(1, Math.floor(die / 2) + 1 + con);
    for (var i = 1; i < lv; i++) hp += per;
    return hp;
  }
  function applyAutoHp() {
    var c = C();
    if (c.hpAuto === false) return;
    var hp = suggestedHp(c);
    if (hp == null) return;
    var oldMax = c.hpMax === "" || c.hpMax == null ? null : num(c.hpMax, 0);
    var cur = c.hpCurrent === "" || c.hpCurrent == null ? null : num(c.hpCurrent, 0);
    c.hpMax = hp;
    if (cur == null || (oldMax != null && cur === oldMax)) c.hpCurrent = hp;
    else if (oldMax != null) c.hpCurrent = Math.max(0, cur + (hp - oldMax));
    else c.hpCurrent = hp;
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
  function onLineagePicked() {
    var c = C(), l = LIN[c.lineage];
    c.sublineage = "";
    if (!l) return;
    if (l.speed) c.speed = l.speed;
    toast(l.name + ": speed " + (l.speed || "—") + " ft. " + (l.asi || "") + " Age: " + (l.age || "—") + " Size: " + (l.size || "—") + " Languages: " + (l.languages || "—"));
  }
  function onSublineagePicked() {
    var c = C(), l = LIN[c.lineage], s = l && (l.sublineages || []).filter(function (x) { return x.id === c.sublineage; })[0];
    if (!s) return;
    c.speed = s.speed || l.speed || c.speed;
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
  function normChambers(g, w) {
    var cap = capOf(g, w), a = Array.isArray(g.chambers) ? g.chambers.slice(0, cap) : [];
    while (a.length < cap) a.push("");
    if (!a.some(Boolean) && num(g.loaded) > 0) for (var k = 0; k < Math.min(cap, num(g.loaded)); k++) a[k] = "c";
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
  function gunRound(g, w) { if (!w.tiers) return w.caliber || ""; var cc = chamberOf(g, w); return w.ammo === "percussion" ? "" : cc.round; }
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
    var bits = Object.keys(bags).map(function (k) { return bags[k] + " " + k; });
    if (bits.length && window.SSDNSAudio) window.SSDNSAudio.play("holster");
    toast(bits.length ? ("Unloaded " + bits.join(", ") + " back to your pile.") : "Already empty.");
  }
  function onGunChanged(i, what, old) {
    var g = C().guns[i];
    var prevW = WPN[what === "weapon" ? old : g.weapon];
    unloadGun(g, prevW, what === "load" ? old : g.load, what === "chamber" ? old : g.chamber);
    g.loaded = 0; g.chambers = []; g.jammed = false;
    var w = WPN[g.weapon];
    if (what === "weapon") { g.mod = ""; g.capacity = ""; }
    if (what === "weapon" && w) {
      g.proficient = callingProficient(w);
      if (w.scatter) g.load = "buck";
      if (w.tiers) { g.chamber = ""; var cc = chamberOf(g, w); g.chamber = cc.tier + "|" + cc.round; g.tier = cc.tier; }
      var st = gunStats(g, compute());
      if (w.capacity) toast(w.name + ": " + st.damage + ", range " + st.range + ", capacity " + w.capacity + ", misfire " + st.misfire + (st.round ? ", chambered " + st.round : "") + ". Starts empty: hit Reload.");
      var ammoType = w.ammo === "shell" || w.scatter ? "buck" : (w.ammo === "arrows" ? "arrows" : "cartridge");
      var cal = (st && st.round) || (w.tiers ? "Light" : "");
      if (ammoType) {
        var pool = findPool(ammoType, cal, true);
        if (pool && !num(pool.count)) pool.count = w.ammo === "shell" || w.scatter ? 10 : 20;
      }
    }
    if (what === "chamber" && w && w.tiers) g.tier = chamberOf(g, w).tier;
  }
  function spendRound(i, k) {
    var g = C().guns[i], w = g && WPN[g.weapon];
    if (!g || !g.weapon) return { ok: false, reason: "Pick a gun first." };
    if (g.jammed) return { ok: false, reason: "Jammed: clear it first" };
    if (g.fouled) return { ok: false, reason: "Fouled. It can't fire until it's cleaned." };
    if (w && w.capacity) {
      var a = normChambers(g, w);
      if (k !== undefined && isHexChamber(a[k])) return { ok: false, reason: "That's a hex shell. Use Cast through gun — Roll never spends a slot." };
      if (k === undefined || !isPlainChamber(a[k])) k = a.findIndex(isPlainChamber);
      if (k < 0) return { ok: false, reason: w.hexShells ? "No plain cartridge chambered. Cast through gun fires a hex shell." : "Out of rounds, Reload" };
      var was = a[k];
      a[k] = "";
      g.loaded = a.filter(Boolean).length;
      changed({ quiet: true });
      return { ok: true, left: g.loaded, hex: "", chamber: k, was: was };
    }
    if (num(g.loaded) <= 0) return { ok: false, reason: "Out of rounds, Reload" };
    g.loaded = num(g.loaded) - 1;
    changed();
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
    if (!spent.ok) { toast(spent.reason); return; }
    if (window.SSDNSAudio) window.SSDNSAudio.play("attack");
    var g = C().guns[i], w = WPN[g.weapon];
    var label = chamberLabel(spent.was, g, w) || "round";
    toast("Bang (" + label + "). " + g.loaded + " left in the " + (w ? w.name : "gun") + ".", "Undo", function () {
      if (before) g.chambers = before;
      g.loaded = num(beforeN);
      changed();
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
    var box = document.querySelector('[data-f="character.hexLead.' + l + '.' + k + '"]');
    if (box) { box.checked = true; box.dispatchEvent(new Event("change", { bubbles: true })); }
    else changed();
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
      if (w.ammo === "shell") return a.type === "buck" || a.type === "slug";
      if (w.hexShells) return a.type === "cartridge";
      if (a.type !== want) return false;
      if (!round || !norm(a.caliber)) return true;
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
    if (tier && (w.hexShells || w.tiers)) { g.chamber = tier + "|" + (pool.caliber || ""); g.tier = tier; }
    return "k:" + pool.type + ":" + (pool.caliber || "") + ":" + tier;
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
    if (!w || !w.capacity || !pool) return;
    var a = normChambers(g, w);
    var need = capOf(g, w) - a.filter(Boolean).length;
    if (max) need = Math.min(need, max);
    if (need <= 0) { toast("Already full."); return; }
    if (num(pool.count) <= 0) { toast("That pile is empty."); return; }
    var take = Math.min(need, num(pool.count));
    var token = tokenForPool(pool, g, w);
    pool.count = num(pool.count) - take;
    for (var k = 0, n = take; k < a.length && n > 0; k++) if (!a[k]) { a[k] = token; n--; }
    g.loaded = a.filter(Boolean).length;
    var picks = $('[data-loadpick="' + i + '"]');
    if (picks) { picks.innerHTML = ""; picks.hidden = true; }
    changed();
    if (window.SSDNSAudio) window.SSDNSAudio.play("reload");
    var tierNote = pool.caliber && w.tiers ? " Chambered " + (TIER_LABEL[g.tier] || g.tier || "") + " " + pool.caliber + "." : "";
    var how = max ? "Tactical Reload +" + take : "Reloaded " + take + (take < need ? " (all you had)" : "") + (w.slow ? " (slow load: full turn)" : " (action)");
    toast(how + ". " + pool.count + " " + (AMMO_LABEL[pool.type] || pool.type) + (pool.caliber ? " " + pool.caliber : "") + " left." + tierNote);
  }
  function reload(i, max) {
    var g = C().guns[i], w = WPN[g.weapon];
    if (!w || !w.capacity) return;
    var a = normChambers(g, w);
    var need = capOf(g, w) - a.filter(Boolean).length;
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
    if (rows.length > 1 && !max) { showLoadPicks(i, rows, 0); toast("Pick which rounds to load."); return; }
    reloadFromPool(i, rows[0].a, max);
  }
  function hasGunBelt() {
    var c = C(), h = HOL[c.holster];
    return !!c.gunBelt || !!(h && h.feedsTR);
  }
  function tacticalReload(i) {
    var g = C().guns[i], w = WPN[g.weapon];
    if (!w || !w.tr) { toast("This gun can't Tactical Reload (TR —)."); return; }
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
    if (window.SSDNSAudio) window.SSDNSAudio.play("reload");
    toast("Loaded a level-" + lvl + " hex shell. The slot is spent. Cast through gun fires it as a spell attack.");
  }
  function loadHexShell(i) {
    var g = C().guns[i], w = WPN[g.weapon];
    if (!w || !w.hexShells) return;
    var lvl = num($('[data-hexlvl="' + i + '"]').value, 1), a = normChambers(g, w), k = a.indexOf("");
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
  function cleanGun(i) {
    var g = C().guns[i];
    if (!g || !g.weapon) { toast("Pick a gun first."); return; }
    if (g.jammed) {
      g.jammed = false;
      var jamBox = document.querySelector('[data-f="character.guns.' + i + '.jammed"]');
      if (jamBox) jamBox.checked = false;
      changed();
      toast("Jam cleared.");
      if (window.SSDNSSheet && window.SSDNSSheet.addLog) window.SSDNSSheet.addLog({ kind: "alert", text: (WPN[g.weapon] ? WPN[g.weapon].name : "Gun") + ": jam cleared." });
      return;
    }
    if (g.fouled) {
      g.fouled = false;
      changed();
      toast("Fouled cleared. That is a short rest with tinker's or gunsmith's tools, or 500 ES.");
      return;
    }
    if (g.dirty) {
      g.dirty = false;
      changed();
      toast("Dirty cleared. That is 10 minutes with a gun cleaning kit or gunsmith's tools.");
      return;
    }
    toast("This gun isn't jammed, dirty, or fouled.");
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
    if (d.gunroll !== undefined) { if (window.SSDNSGunRoll) window.SSDNSGunRoll(num(d.gunroll)); return; }
    if (d.clean !== undefined) return cleanGun(num(d.clean));
    if (d.fire !== undefined) {
      var gi = num(d.fire), kk = d.k !== undefined ? num(d.k) : undefined;
      var gg = C().guns[gi];
      var stn = gg && gg.chambers && kk !== undefined ? gg.chambers[kk] : "";
      if (isHexChamber(stn)) {
        if (window.SSDNSGunCastHex) window.SSDNSGunCastHex(gi, kk);
        return;
      }
      return fire(gi, kk);
    }
    if (d.unload !== undefined) return unloadLoaded(num(d.unload));
    if (d.takepool !== undefined) {
      var bits = String(d.takepool).split(":");
      var pool = C().ammo[num(bits[1])];
      return reloadFromPool(num(bits[0]), pool, num(bits[2]) || 0);
    }
    if (d.reload !== undefined) return reload(num(d.reload));
    if (d.tr !== undefined) return tacticalReload(num(d.tr));
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
      if (btn && btn._spell) {
        if (spellAlreadyHave(btn._spell.phb)) toast(btn._spell.phb + " is already on your list.");
        else { addKnownSpell(btn._spell); fillSpellPicker(); toast("Added " + btn._spell.label + "."); }
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
    if (window.SSDNSPlaytest && window.SSDNSPlaytest.dropLogStore) window.SSDNSPlaytest.dropLogStore(true);
    if (window.SSDNSDmJoin && window.SSDNSDmJoin.abandon) window.SSDNSDmJoin.abandon();
    else if (window.SSDNSSheet && window.SSDNSSheet.clearLog) window.SSDNSSheet.clearLog();
    replaceDoc(blankDoc(), { reason: "new character" });
    if (window.SSDNSPlaytest && window.SSDNSPlaytest.dropLogStore) window.SSDNSPlaytest.dropLogStore(true);
    if (window.SSDNSSheet && window.SSDNSSheet.clearLog) window.SSDNSSheet.clearLog();
    S.hasContent = false; S.fileDirty = false; updateSaveBar();
    toast("New character. It's backed up in this browser as you type; Save makes a .ssdns file.");
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
      var on = livePeers();
      var b = $("#tabWarn");
      if (!on) { if (b) b.hidden = true; return; }
      if (!b) {
        b = document.createElement("div");
        b.id = "tabWarn";
        b.className = "tab-warn";
        b.textContent = "Another tab is editing this character. A save there can overwrite this one.";
        document.body.appendChild(b);
      }
      b.hidden = false;
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
      if (!S.doc || !e || !e.key) return;
      if (e.key === "ssdns.sheet.char." + S.doc.id || e.key === "ssdns.v1.char." + S.doc.id) renderWarn();
    });
    window.addEventListener("pagehide", function () { announce(true); });
    window.addEventListener("beforeunload", function () { announce(true); });
    setInterval(function () { announce(false); renderWarn(); }, 2000);
    announce(false);
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
  function pushWallet() {
    try { Bridge.writeWallet({ characterId: S.doc.id, characterName: C().name, shards: S.doc.shards, updatedBy: "sheet" }); } catch (e) { console.warn(e); }
  }
  function onWallet(w) {
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
    var item = { msg: msg, actLabel: actLabel, actFn: actFn, ms: ms, sticky: !!opts.sticky, priority: opts.priority || 0 };
    if (item.sticky && toastShowing && toastShowing.sticky && toastShowing.msg === item.msg) return;
    if (item.priority && toastShowing && !toastShowing.sticky) {
      clearTimeout(toastTimer);
      toastQueue.unshift(toastShowing);
      toastShowing = null;
    }
    if (item.priority) toastQueue.unshift(item);
    else toastQueue.push(item);
    pumpToast();
  }
  toast.dismissSticky = function (msg) {
    toastQueue = toastQueue.filter(function (item) { return !(item.sticky && (!msg || item.msg === msg)); });
    if (toastShowing && toastShowing.sticky && (!msg || toastShowing.msg === msg)) dismissToast();
  };

  // ------------------------------------------------------------------ tabs, print, drag & drop
  function showTab(id) {
    $$(".tab").forEach(function (t) {
      var on = t.id === id; t.setAttribute("aria-selected", on ? "true" : "false"); t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute("aria-controls")).hidden = !on;
    });
    try { sessionStorage.setItem("ssdns.tab", id); } catch (e) {}
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
    Exhaustion: "Stacked fatigue. The DM says which level is on you and what it takes away.",
    Bleeding: "Losing blood. The DM says how it ticks and what stops it."
  };
  function renderConditionsTab() {
    var box = $("#condList");
    if (!box || !S.doc) return;
    var set = String(C().tableConditions || "").split(",").map(function (s) { return s.trim(); }).filter(Boolean);
    var known = {};
    box.innerHTML = "";
    Object.keys(COND_TEXT).forEach(function (name) {
      known[name.toLowerCase()] = true;
      var on = set.some(function (s) { return s.toLowerCase() === name.toLowerCase(); });
      box.appendChild(el("article", { class: "cond-card" + (on ? " on" : "") }, [
        el("h3", { text: name + (on ? " · on you" : "") }),
        el("p", { text: COND_TEXT[name] })
      ]));
    });
    set.forEach(function (name) {
      if (known[name.toLowerCase()]) return;
      box.appendChild(el("article", { class: "cond-card on" }, [
        el("h3", { text: name + " · on you" }),
        el("p", { text: "Set by the DM for this table." })
      ]));
    });
    var note = $("#condDmNote");
    if (note) note.textContent = set.length ? ("From the DM: " + set.join(", ")) : "Nothing from the DM right now. The banner on Main updates when they set one.";
  }
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
        block.appendChild(el("label", { class: "chk lvl-spell" }, [
          el("input", { type: "checkbox", "data-lvl-spell": sp.key, id: id }),
          (sp.level === 0 ? "Cantrip · " : ("L" + sp.level + " · ")) + sp.label
        ]));
        block.lastChild._spell = sp;
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
    if (window.SSDNSSheet && window.SSDNSSheet.applyRest) {
      window.SSDNSSheet.applyRest(kind);
      renderFields();
      return;
    }
    var ci = casterInfo(), r = C().hexRest || (ci ? ci.rest : "long");
    if (kind === "long" || r === "short") {
      for (var l = 1; l <= 9; l++) C().hexLead[l] = new Array(MAX_BOXES).fill(false);
      renderFields(); changed(); toast(slotWord() + " refreshed (" + kind + " rest).");
    } else toast("Your " + slotWord() + " comes back on a long rest.");
  }
  function wire() {
    document.addEventListener("input", onFieldInput);
    document.addEventListener("change", onFieldInput);
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
      if (!C().explosives) C().explosives = [];
      C().explosives.push({ item: "", count: 0 }); changed();
      var rows = $$("#explosiveList .ammo-row"); if (rows.length) $("select", rows[rows.length - 1]).focus();
    };
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
    window.addEventListener("beforeunload", function () {
      if (S.doc && S.hasContent) { try { Store.saveCurrent(S.doc); } catch (err) {} }
    });
    document.addEventListener("visibilitychange", function () {
      if (document.hidden && S.doc && S.hasContent) { saveLocal(); if (S.handle && S.fileDirty) writeFile(false); }
    });
    document.addEventListener("keydown", function (e) { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); doSave(); } });
    Bridge.onChange(onWallet);
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
      toast("Welcome back. Picked up " + (C().name || "your character") + " from this browser's backup.");
    } else {
      S.doc = blankDoc(); S.hasContent = false;
      renderFields();
    }
    updateSaveBar();
    watchTabs();
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
      doc: function () { return S.doc; },
      spendRound: spendRound,
      spendHexSlot: spendHexSlot,
      spendHexChamber: spendHexChamber,
      fireHexShell: fireHexShell,
      casterInfo: casterInfo,
      callingProficient: callingProficient,
      styleAttackBonus: styleAttackBonus,
      styleDamageBonus: styleDamageBonus,
      applyPatch: function (fn) { if (fn) fn(S.doc); renderFields(); changed(); },
      slotsLeft: slotsLeft,
      misfireCeiling: misfireCeiling,
      suggestedHp: function () { return suggestedHp(C()); }
    };
  }
  boot();
})();

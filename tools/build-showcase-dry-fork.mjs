/**
 * Build Dry Fork showcase pregens and the My Maps play seed.
 *   node tools/build-showcase-dry-fork.mjs
 * Uses live kits.js / creator.js. Does not edit rules.js.
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sb = {
  console,
  Math, Date, JSON, parseInt, isFinite, Number, String, Object, Array,
  localStorage: { getItem: () => null, setItem: () => {} },
  document: {
    readyState: "complete",
    addEventListener() {},
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: () => null,
    body: null
  },
  location: { pathname: "/", search: "" },
  CustomEvent: function CustomEvent(type, init) { this.type = type; this.detail = init && init.detail; }
};
sb.window = sb;
sb.globalThis = sb;
sb.addEventListener = () => {};
vm.createContext(sb);
function load(rel) { vm.runInContext(fs.readFileSync(path.join(root, rel), "utf8"), sb, { filename: rel }); }
load("assets/js/apply-guard.js");
load("assets/data/rules.js");
load("assets/js/kits.js");
load("assets/js/pact-shot.js");
load("assets/data/item-catalog.js");
load("assets/data/item-catalog-gear.js");
load("assets/js/items.js");
load("assets/js/creator.js");
load("map/asset-library.js");

const Rules = sb.SSDNS_RULES;
const Applied = sb.SSDNSApplied;
const Creator = sb.SSDNSCreator;
const Items = sb.SSDNSItems;
const Assets = sb.SSDNSAssetLibrary;
const AB = ["STR", "DEX", "CON", "INT", "WIS", "CHA"];

function lineageOf(id) { return (Rules.lineages || []).find((x) => x.id === id); }
function callingOf(id) { return (Rules.callings || []).find((x) => x.id === id); }
function finalScores(spec) {
  const lin = lineageOf(spec.lineage);
  const sub = lin && (lin.sublineages || []).find((s) => s.id === spec.sublineage);
  const parts = [Applied.parseAsi(lin && lin.asi), Applied.parseAsi(sub && sub.asi)];
  const merged = Applied.mergeAsi(parts);
  const fixed = {};
  AB.forEach((k) => { fixed[k] = (merged.fixed && merged.fixed[k]) || 0; });
  const picks = spec.asiChoice || [];
  let cursor = 0;
  (merged.choices || []).forEach((choice) => {
    let n = 0;
    while (n < choice.count && cursor < picks.length) {
      const key = String(picks[cursor++] || "").toUpperCase();
      if (AB.indexOf(key) < 0) continue;
      fixed[key] = (fixed[key] || 0) + (choice.by || 0);
      n++;
    }
  });
  const applied = Applied.applyAsiScores(spec.scores, {}, fixed);
  return { abilities: applied.abilities, lineageAsi: fixed };
}

function parseSpell(raw) {
  const t = String(raw || "").replace(/\s+/g, " ").trim();
  const shell = /\s+Shell$/i.test(t);
  const base = t.replace(/\s+Shell$/i, "").trim();
  const m = base.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  return { raw: t, phb: m ? m[1].trim() : base, alias: m ? m[2].trim() : "", shell };
}
function spellRows(calling) {
  const levels = ((Rules.spellLists || {})[calling] || {}).levels || {};
  const rows = [];
  Object.keys(levels).forEach((lk) => {
    (levels[lk] || []).forEach((raw) => rows.push(Object.assign({ level: Number(lk) }, parseSpell(raw))));
  });
  return rows;
}
function findSpell(rows, want, level) {
  const w = parseSpell(want);
  const eq = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
  function pick(pool) {
    let hit = pool.find((r) => eq(r.raw, w.raw));
    if (!hit) hit = pool.find((r) => eq(r.phb, w.phb) && r.shell === w.shell && (!w.alias || !r.alias || eq(r.alias, w.alias)));
    if (!hit && w.shell) hit = pool.find((r) => r.shell && eq(r.phb, w.phb));
    if (!hit) hit = pool.find((r) => eq(r.phb, w.phb) && !r.shell && !w.shell);
    return hit;
  }
  const pool = rows.filter((r) => level == null || r.level === level);
  let hit = pick(pool) || pick(rows);
  if (!hit) {
    const global = (Rules.spellCast || []).find((s) => s && eq(s.name, w.phb) && (level == null || s.level === level));
    if (global) hit = { raw: w.alias ? w.phb + " (" + w.alias + ")" : w.phb, phb: w.phb, alias: w.alias, shell: w.shell, level: global.level };
  }
  if (!hit) {
    const names = pool.slice(0, 8).map((r) => r.raw).join("; ");
    throw new Error("No live spell for " + want + " (level " + level + "). Nearby: " + names);
  }
  return hit;
}

const CAST = [
  {
    file: "wren-stonecrow.ssdns", id: "c_showcase_wren",
    name: "Wren Stonecrow", calling: "tribal-warrior", lineage: "pioneers", sublineage: "",
    background: "trail-born", subclass: "totem-warrior",
    scores: { STR: 15, DEX: 13, CON: 14, INT: 8, WIS: 12, CHA: 10 },
    final: { STR: 17, DEX: 13, CON: 15, INT: 8, WIS: 12, CHA: 10 }, hp: 32,
    skills: ["Athletics", "Survival", "Perception", "Intimidation"],
    kit: { weapon: "javelin" },
    hook: "Big, quiet, and fond of horses. She'll go through a wall before she goes around it."
  },
  {
    file: "dell-marchand.ssdns", id: "c_showcase_dell",
    name: 'Delphine "Dell" Marchand', calling: "storyteller", lineage: "diplomats", sublineage: "",
    background: "saloon-act", subclass: "college-of-campfire-lore-lore",
    scores: { STR: 8, DEX: 14, CON: 13, INT: 10, WIS: 12, CHA: 15 },
    asiChoice: ["DEX", "CON"],
    final: { STR: 8, DEX: 15, CON: 14, INT: 10, WIS: 12, CHA: 17 }, hp: 24,
    skills: ["Acrobatics", "Performance", "Persuasion", "Insight", "Deception"],
    kit: { voice: "harmonica", weapon: "pepper" },
    cantrips: ["Vicious Mockery (Tongue Lashing)", "Light"],
    spells: [
      ["Healing Word", 1], ["Dissonant Whispers (Bad Notes)", 1], ["Faerie Fire (Foxfire)", 1], ["Sleep (Chloroform)", 1],
      ["Hold Person (Lasso)", 2], ["Suggestion (Sweet Talk)", 2]
    ],
    hook: "Plays every saloon between here and the coast. Talks first, shoots second."
  },
  {
    file: "ruth-hollister.ssdns", id: "c_showcase_ruth",
    name: "Sister Ruth Hollister", calling: "frontier-preacher", lineage: "mountain-folk", sublineage: "gold-miner",
    background: "chapel-hand", subclass: "domain-of-the-faithful-sawbones-life",
    scores: { STR: 13, DEX: 10, CON: 14, INT: 8, WIS: 15, CHA: 12 },
    final: { STR: 13, DEX: 10, CON: 16, INT: 8, WIS: 16, CHA: 12 }, hp: 27,
    skills: ["Insight", "Religion", "Medicine", "Persuasion"],
    kit: { gun: "shotgun" },
    cantrips: ["Sacred Flame (Brimstone)", "Spare the Dying (Last Rites)", "Light"],
    spells: [
      ["Healing Word", 1], ["Guiding Bolt", 1], ["Shield of Faith (Badge of Office)", 1], ["Sanctuary", 1],
      ["Aid", 2], ["Prayer of Healing", 2],
      ["Bless", 1], ["Cure Wounds (Trail Medicine)", 1], ["Lesser Restoration", 2], ["Spiritual Weapon", 2]
    ],
    note: "HP is the showcase brief's 27. Tough as Ore would add 3 more if HP auto is turned on.",
    hook: "Former mine-camp nurse who found religion and kept the bone saw."
  },
  {
    file: "june-vale.ssdns", id: "c_showcase_june",
    name: 'Juniper "June" Vale', calling: "nature-guide", lineage: "aristocrats", sublineage: "greenwood-kin",
    background: "desert-hermit", subclass: "circle-of-the-open-range-land",
    scores: { STR: 8, DEX: 13, CON: 14, INT: 12, WIS: 15, CHA: 10 },
    final: { STR: 8, DEX: 15, CON: 14, INT: 12, WIS: 16, CHA: 10 }, hp: 24,
    skills: ["Medicine", "Religion", "Nature", "Animal Handling"],
    kit: { weapon: "bow", focus: "stick" },
    cantrips: ["Produce Flame (Campfire)", "Thorn Whip (Thorn Lash)"],
    spells: [
      ["Entangle (Brush Snare)", 1], ["Healing Word", 1], ["Faerie Fire (Foxfire)", 1], ["Thunderwave (Porch Boom)", 1],
      ["Spike Growth (Cholla Patch)", 2], ["Moonbeam (Hunter's Moon)", 2]
    ],
    note: "Circle of the Open Range has no coded bonus-spell list on this sheet. Spike Growth and Moonbeam are prepared.",
    hook: "Grew up past the last fence line. Thorn Lash can yank a rifleman off the water tower."
  },
  {
    file: "mercy-blackburn.ssdns", id: "c_showcase_mercy",
    name: "Mercy Blackburn", calling: "gunslinger", lineage: "farmers", sublineage: "maccoy",
    background: "gunslinger-drifter", subclass: "gun-whisperer-battle-master",
    scores: { STR: 13, DEX: 15, CON: 14, INT: 10, WIS: 12, CHA: 8 },
    final: { STR: 13, DEX: 17, CON: 15, INT: 10, WIS: 12, CHA: 8 }, hp: 28,
    skills: ["Intimidation", "Perception", "Athletics", "Survival"],
    kit: { weapon: "revolver" }, fightingStyle: "sidearm",
    note: "The brief suggested Archery. The live Gunslinger list has no Archery, so Sidearm Duelling is set (it applies to the Ball n Cap). No maneuver picker yet. Suggested: Trip Attack, Menacing Attack, Precision Attack.",
    hook: "Farm kid with a borrowed six-gun. She keeps her iron clean as a church plate."
  },
  {
    file: "toby-reyes.ssdns", id: "c_showcase_toby",
    name: 'Tobias "Toby" Reyes', calling: "martial-artist", lineage: "farmers", sublineage: "hetfield",
    background: "company-veteran", subclass: "rough-and-tumble-brawler-open-hand",
    scores: { STR: 12, DEX: 15, CON: 13, INT: 8, WIS: 14, CHA: 10 },
    final: { STR: 12, DEX: 17, CON: 13, INT: 8, WIS: 14, CHA: 11 }, hp: 21,
    skills: ["Athletics", "Intimidation", "Acrobatics", "Insight"],
    kit: { weapon: "baton" },
    hook: "Ex-railroad tough. He knows a water stop, and he'll notice the gang doesn't."
  },
  {
    file: "amos-kettle.ssdns", id: "c_showcase_amos",
    name: "Deputy Amos Kettle", calling: "lawman", lineage: "camp-kin", sublineage: "",
    background: "honorable-figure", subclass: "oath-of-the-badge-devotion",
    scores: { STR: 15, DEX: 10, CON: 13, INT: 8, WIS: 12, CHA: 14 },
    final: { STR: 17, DEX: 10, CON: 13, INT: 8, WIS: 12, CHA: 15 }, hp: 25,
    skills: ["Animal Handling", "Survival", "Insight", "Intimidation"],
    kit: { weapon: "carbine" },
    spells: [
      ["Bless", 1], ["Compelled Duel", 1], ["Shield of Faith (Badge of Office)", 1],
      ["Protection from Evil and Good", 1], ["Sanctuary", 1]
    ],
    hook: "Country deputy on his own time. Showing the tin star early makes the gang nervous."
  },
  {
    file: "nell-harrow.ssdns", id: "c_showcase_nell",
    name: "Nell Harrow", calling: "frontier-scout", lineage: "aristocrats", sublineage: "greenwood-kin",
    background: "tracker", subclass: "trophy-hunter-hunter",
    scores: { STR: 12, DEX: 15, CON: 13, INT: 10, WIS: 14, CHA: 8 },
    final: { STR: 12, DEX: 17, CON: 13, INT: 10, WIS: 15, CHA: 8 }, hp: 25,
    skills: ["Perception", "Survival", "Stealth", "Nature", "Animal Handling"],
    kit: { hunt: "carbine" }, fightingStyle: "archery", beltLantern: true,
    spells: [["Hunter's Mark (Marked Man)", 1], ["Ensnaring Strike (Bola Shot)", 1], ["Fog Cloud", 1]],
    hook: "Reads tracks like newsprint. She's the light-test character: belt lantern L0215."
  },
  {
    file: "ace-duchamp.ssdns", id: "c_showcase_ace",
    name: 'Vivian "Ace" Duchamp', calling: "gambler", lineage: "aristocrats", sublineage: "night-house",
    background: "snake-oil-cardsharp", subclass: "the-burglar-thief",
    scores: { STR: 8, DEX: 15, CON: 13, INT: 12, WIS: 10, CHA: 14 },
    final: { STR: 8, DEX: 17, CON: 13, INT: 12, WIS: 10, CHA: 15 }, hp: 21,
    skills: ["Deception", "Sleight of Hand", "Stealth", "Perception", "Investigation", "Acrobatics"],
    expertise: { "Sleight of Hand": 2 },
    kit: { ranged: "pistol" },
    note: "Lockpick-test character. Sleight of Hand is expertise. Thieves' tools come from the kit; the sheet has no separate tools-expertise field.",
    hook: "Riverboat cardsharp. Fast Hands puts her on the Stash lock while the bullets are still flying."
  },
  {
    file: "ezra-thorne.ssdns", id: "c_showcase_ezra",
    name: "Ezra Thorne", calling: "hexslinger", lineage: "street-folk", sublineage: "",
    background: "outlaw", subclass: "chaos-wild-magic",
    scores: { STR: 8, DEX: 13, CON: 14, INT: 10, WIS: 12, CHA: 15 },
    final: { STR: 8, DEX: 13, CON: 14, INT: 11, WIS: 12, CHA: 17 }, hp: 20,
    skills: ["Deception", "Stealth", "Intimidation", "Insight"],
    kit: { gun: "blacksnake" },
    cantrips: ["Fire Bolt Shell", "Light Shell", "Mage Hand Shell", "Shocking Grasp Shell"],
    spells: [
      ["Shield Shell", 1], ["Magic Missile Shell", 1], ["Thunderwave Shell", 1],
      ["Scorching Ray Shell", 2]
    ],
    note: "No metamagic picker yet. Suggested: Quickened, Twinned. Sorcery points follow the Hex Well tracker (3 at this level).",
    hook: "Rode with a bad crowd once. Wild Spark is the test."
  },
  {
    file: "cal-mercer.ssdns", id: "c_showcase_cal",
    name: 'Calvin "Cal" Mercer', calling: "pact-seeker", lineage: "diplomats", sublineage: "",
    background: "fallen-aristocrat", subclass: "the-last-round",
    scores: { STR: 8, DEX: 13, CON: 14, INT: 10, WIS: 12, CHA: 15 },
    asiChoice: ["DEX", "CON"],
    final: { STR: 8, DEX: 14, CON: 15, INT: 10, WIS: 12, CHA: 17 }, hp: 24,
    skills: ["History", "Persuasion", "Deception", "Intimidation"],
    kit: {},
    cantrips: ["Eldritch Blast (Pact Shot)", "Minor Illusion (Dust Mirage)"],
    spells: [
      ["Hex (Crossed Hex)", 1], ["Hellish Rebuke (Return Fire)", 1],
      ["Misty Step (Puff of Smoke)", 2], ["Hold Person (Lasso)", 2]
    ],
    invocations: ["Agonizing Blast", "Devil's Sight"],
    note: "Invocations set: Agonizing Blast and Devil's Sight (Dark test). Pact boon is still the live picker on the Borrowed Iron card.",
    hook: "Lost the family fortune at a card table, then won something stranger back."
  },
  {
    file: "gus-penhallow.ssdns", id: "c_showcase_gus",
    name: 'Dr. Augustina "Gus" Penhallow', calling: "scholar", lineage: "merchants", sublineage: "clockmaker",
    background: "tinker", subclass: "law-of-thermodynamic-transfer-evocation",
    scores: { STR: 8, DEX: 13, CON: 14, INT: 15, WIS: 12, CHA: 10 },
    final: { STR: 8, DEX: 13, CON: 15, INT: 17, WIS: 12, CHA: 10 }, hp: 20,
    skills: ["Insight", "Investigation", "Arcana", "Medicine"],
    kit: { weapon: "plinker" },
    cantrips: ["Fire Bolt (Powder Spark)", "Light (Lucifer Match)", "Mage Hand (Long Arm)"],
    spells: [
      ["Shield (Magnesium Flash)", 1, true], ["Magic Missile (Hex Needles)", 1, true],
      ["Sleep (Chloroform)", 1, true], ["Grease (Axle Grease)", 1, true],
      ["Burning Hands (Powder Fan)", 1, false], ["Detect Magic (Galvanometer)", 1, false],
      ["Identify (Field Test)", 1, false], ["Find Familiar (Dust Familiar)", 1, false],
      ["Scorching Ray (Burning Glass)", 2, true], ["Web (Flypaper)", 2, true]
    ],
    hook: "Traveling lecturer who swears it isn't magic. She'll study the telegraph first."
  }
];

function skillUnion(spec) {
  const bg = (Rules.backgrounds || []).find((b) => b.id === spec.background);
  const fromBg = (bg && bg.skillList) || [];
  const out = [];
  fromBg.concat(spec.skills || []).forEach((sk) => { if (sk && out.indexOf(sk) < 0) out.push(sk); });
  return out;
}

const outDir = path.join(root, "showcase", "pregens");
fs.mkdirSync(outDir, { recursive: true });
const manifest = [];

CAST.forEach((spec) => {
  const cal = callingOf(spec.calling);
  if (!cal) throw new Error("missing calling " + spec.calling);
  if (!(cal.subclasses || []).some((s) => s.id === spec.subclass)) throw new Error("missing subclass " + spec.subclass);
  const built = Creator.buildSheet({
    name: spec.name,
    player: "Showcase",
    calling: spec.calling,
    lineage: spec.lineage,
    sublineage: spec.sublineage || "",
    background: spec.background,
    scores: spec.scores,
    method: "standard",
    skills: skillUnion(spec),
    kit: spec.kit,
    kitMode: "module",
    level: 3,
    fightingStyle: spec.fightingStyle || "",
    cantrips: spec.cantrips || [],
    spells: (spec.spells || []).filter((row) => row[2] !== false).map((row) => row[0])
  });
  const bad = (built.errors || []).filter((err) => !/cantrip|spell/i.test(err));
  if (bad.length) throw new Error(spec.name + ": " + bad.join(" | "));
  const c = built.character;
  c.subclass = spec.subclass;
  c.level = 3;
  c.xp = 900;
  c.kitMode = "module";
  const asi = finalScores(spec);
  c.abilities = asi.abilities;
  c.lineageAsi = asi.lineageAsi;
  if (spec.asiChoice) c.asiChoice = spec.asiChoice.slice();
  AB.forEach((k) => {
    if (c.abilities[k] !== spec.final[k]) throw new Error(spec.name + " " + k + " " + c.abilities[k] + " != " + spec.final[k]);
  });
  c.hpAuto = false;
  c.hpMax = spec.hp;
  c.hpCurrent = spec.hp;
  if (spec.fightingStyle) c.fightingStyle = spec.fightingStyle;
  if (spec.expertise) Object.keys(spec.expertise).forEach((sk) => { c.skillProf[sk] = spec.expertise[sk]; });
  const rows = spellRows(spec.calling);
  if (spec.cantrips) c.cantrips = spec.cantrips.map((name) => findSpell(rows, name, 0).raw);
  else c.cantrips = [];
  const book = {};
  for (let lv = 1; lv <= 9; lv++) book[lv] = [];
  (spec.spells || []).forEach((row) => {
    const hit = findSpell(rows, row[0], row[1]);
    const prepared = row.length < 3 ? true : !!row[2];
    book[hit.level].push({ name: hit.raw, prepared: prepared });
  });
  c.spells = book;
  if (spec.calling === "pact-seeker") {
    c.pactShotFree = 1;
    delete c.pactShotSwap;
    if (sb.SSDNSPactShot) sb.SSDNSPactShot.ensure(c);
  }
  if (spec.invocations) c.invocations = spec.invocations.slice();
  c.backstory = spec.hook || "";
  if (spec.note) c.additionalFeatures = spec.note;
  c.showcase = "dry-fork";
  if (spec.beltLantern) {
    const inst = Items.instanceFrom({ catalogId: "belt-lantern", count: 1, uid: "it_nell_belt_lantern" });
    if (!inst || inst.catalogId !== "belt-lantern") throw new Error("belt lantern L0215 is not in the live catalog");
    inst.equipSlot = "accessory_1";
    inst.lightOut = false;
    c.items = Array.isArray(c.items) ? c.items : [];
    c.items.push(inst);
  }
  const doc = {
    format: "ssdns-character",
    schemaVersion: 2,
    app: "SSDNS Character Sheet 0.3.220",
    id: spec.id,
    createdAt: "2026-11-03T04:20:00.000Z",
    updatedAt: "2026-11-03T04:20:00.000Z",
    shards: { white: 0, blue: 0, green: 0, yellow: 0, purple: 0 },
    character: c
  };
  fs.writeFileSync(path.join(outDir, spec.file), JSON.stringify(doc, null, 2) + "\n");
  manifest.push({
    file: spec.file, name: spec.name, calling: spec.calling, subclass: spec.subclass, level: 3, xp: 900, hp: spec.hp
  });
  console.log("pregen", spec.file, c.calling, c.subclass, "hp", c.hpMax, "kit", c.kitMode);
});
fs.writeFileSync(path.join(outDir, "index.json"), JSON.stringify({
  showcase: "dry-fork",
  sheet: "0.3.220",
  note: "Open any file with the sheet Open button. Module start, level 3, 900 XP.",
  characters: manifest
}, null, 2) + "\n");

/* ---- map play seed (layout key squares; tank hotspots not shifted) ---- */
const packJson = JSON.parse(fs.readFileSync(path.join(root, "assets/packs/encounter-pack-v1.ssdns-asset-pack.json"), "utf8"));
const defs = {};
(packJson.assets || []).forEach((a) => { defs[a.id] = a; });
function colOf(letters) {
  let n = 0;
  letters.toUpperCase().split("").forEach((ch) => { n = n * 26 + (ch.charCodeAt(0) - 64); });
  return n - 1;
}
function cell(code) {
  const m = String(code).match(/^([A-Z]+)(\d+)$/i);
  if (!m) throw new Error("bad cell " + code);
  return { x: colOf(m[1]), y: Number(m[2]) - 1, sq: code.toUpperCase() };
}
function instOf(id) {
  const def = defs[id];
  if (!def) throw new Error("missing asset " + id);
  return Assets.instanceFromDef(def);
}
function assetToken(id, defId, code, opts) {
  opts = opts || {};
  const at = cell(code);
  const inst = instOf(defId);
  const lit = !!opts.lit;
  if (lit) {
    inst.props.light.on = true;
    inst.state.lit = true;
  }
  const image = (lit && inst.images && inst.images[1]) ? inst.images[1] : (inst.images && inst.images[0]) || inst.image;
  inst.image = image;
  const bright = Number(inst.props.light && inst.props.light.bright) || 0;
  const dim = Number(inst.props.light && inst.props.light.dim) || 0;
  return {
    id: id,
    kind: "asset",
    name: inst.name,
    label: String(opts.label || inst.name).slice(0, 16),
    size: inst.size || 1,
    color: "#c9a227",
    ownerCanMove: false,
    ownerUid: "",
    hidden: false,
    noInit: true,
    noHpPool: true,
    notTargetable: !inst.targetable,
    assetDefId: defId,
    asset: inst,
    image: image,
    lights: lit && (bright || dim) ? [{ id: "asset", name: inst.name, bright: bright, dim: dim, color: String(inst.props.light.color || "") }] : [],
    pos: { x: at.x, y: at.y },
    sceneId: "scn_dry_fork",
    sq: at.sq
  };
}
function lockOf(dc) {
  const n = Number(dc) || 0;
  return { dc: n, method: n ? ["tools", "force"] : [], keyItem: "", forceDc: n, jamOnFail: false, jammed: false, unlocked: !(n > 0) };
}
function chest(id, name, code, loot) {
  const at = cell(code);
  return {
    id: id,
    kind: "chest",
    name: name,
    label: name.slice(0, 16),
    size: 1,
    color: "#8a5a2b",
    ownerCanMove: false,
    ownerUid: "",
    hidden: false,
    noInit: true,
    noHpPool: true,
    notTargetable: true,
    lootBoxId: loot.id,
    loot: loot,
    pos: { x: at.x, y: at.y },
    sceneId: "scn_dry_fork",
    sq: at.sq
  };
}
const mapDraft = JSON.parse(fs.readFileSync(path.join(root, "map/packs/showcase-dry-fork/showcase-dry-fork.map.json"), "utf8"));
const play = {
  ambient: "dim",
  paint: "painted",
  paintNote: "Painted 2800×2100 map, no grid or letters. Jessey liked the paint. The tank sits about 2 squares north of layout O3–R6. Cover, zones, ladder S5, and spout Q7 stay on the layout key.",
  zones: mapDraft.zones || [],
  cover: mapDraft.objects || [],
  spawns: [
    { tag: "P1", name: "PC", sq: "B16", pos: cell("B16"), side: "party" },
    { tag: "P2", name: "PC", sq: "B17", pos: cell("B17"), side: "party" },
    { tag: "P3", name: "PC", sq: "C16", pos: cell("C16"), side: "party" },
    { tag: "P4", name: "PC", sq: "C17", pos: cell("C17"), side: "party" },
    { tag: "P5", name: "PC (if five)", sq: "B18", pos: cell("B18"), side: "party" },
    { tag: "E1", name: "Hired Rifle", foe: "rival-adventurer", sq: "Q13", pos: cell("Q13"), side: "enemy" },
    { tag: "E2", name: "Switch Boss", foe: "switch-boss", sq: "AA10", pos: cell("AA10"), side: "enemy" },
    { tag: "E3", name: "Outlaw", foe: "outlaw", sq: "P13", pos: cell("P13"), side: "enemy" },
    { tag: "E4", name: "Outlaw", foe: "outlaw", sq: "N17", pos: cell("N17"), side: "enemy" },
    { tag: "E5", name: "Outlaw", foe: "outlaw", sq: "AE19", pos: cell("AE19"), side: "enemy" },
    { tag: "E6", name: "Outlaw", foe: "outlaw", sq: "X17", pos: cell("X17"), side: "enemy" },
    { tag: "E7", name: "Outlaw", foe: "outlaw", sq: "AH2", pos: cell("AH2"), side: "enemy" },
    { tag: "B1", name: "Keeper", foe: "common-townsfolk", sq: "Z16", pos: cell("Z16"), side: "ally" },
    { tag: "R1", name: "Dust Devil", foe: "dust-devil", sq: "U29", pos: cell("U29"), side: "optional", optional: true },
    { tag: "R2", name: "Dust Devil", foe: "dust-devil", sq: "W29", pos: cell("W29"), side: "optional", optional: true }
  ],
  tokens: [
    assetToken("df_order_board", "ast_order-board", "AH6", { label: "Order board" }),
    assetToken("df_lantern_ah6", "ast_wall-lantern", "AH6", { label: "Signal lantern", lit: true }),
    assetToken("df_lantern_k12", "ast_wall-lantern", "K12", { label: "Lantern post", lit: true }),
    assetToken("df_lantern_ad12", "ast_wall-lantern", "AD12", { label: "Lantern post", lit: true }),
    assetToken("df_gate", "ast_fence-gate", "AF18", { label: "Corral gate" }),
    assetToken("df_telegraph", "ast_telegraph-lever", "N15", { label: "Telegraph" }),
    assetToken("df_campfire", "ast_campfire", "AD23", { label: "Campfire", lit: true }),
    assetToken("df_crate", "ast_cover-crate", "AA16", { label: "Cover crate" }),
    assetToken("df_powder", "ast_powder-barrel", "F11", { label: "Powder barrel" }),
    assetToken("df_plunger", "ast_plunger-box", "G11", { label: "Plunger" }),
    chest("df_saddlebag", "Saddlebag", "AE16", {
      id: "box_dryfork_saddlebag",
      tableId: "act1-saddlebag",
      name: "Saddlebag",
      boxType: "saddlebag",
      rollMode: "onOpen",
      rolled: false,
      contents: [],
      cash: { es: 0, black: 0, blackId: "", branch: "none" },
      log: ["Unlocked. Optional Give: belt lantern (L0215) into this bag for the light test."],
      taken: false,
      draft: false,
      lock: lockOf(0),
      barrier: null,
      hidden: false,
      hideDc: 0,
      found: true,
      trap: null
    }),
    chest("df_stash", "Outlaw Stash", "AB18", {
      id: "box_dryfork_stash",
      tableId: "act1-outlaw-stash",
      name: "Outlaw Stash",
      boxType: "outlaw-stash",
      rollMode: "onOpen",
      rolled: false,
      contents: [],
      cash: { es: 0, black: 0, blackId: "", branch: "none" },
      log: ["Hidden under the shed floor. Perception DC 13, then lock DC 13 (tools or force)."],
      taken: false,
      draft: false,
      lock: lockOf(13),
      barrier: null,
      hidden: true,
      hideDc: 13,
      found: false,
      trap: null
    })
  ]
};
const order = play.tokens.find((t) => t.id === "df_order_board");
if (order.asset.state.on || order.asset.props.toggle.on) throw new Error("order board must start RED / off");
const gate = play.tokens.find((t) => t.id === "df_gate");
if (gate.asset.props.gate.blocksMove !== true || gate.asset.props.gate.blocksSight !== false) throw new Error("gate soft changed");
["df_lantern_ah6", "df_lantern_k12", "df_lantern_ad12", "df_campfire"].forEach((id) => {
  const t = play.tokens.find((x) => x.id === id);
  if (!t.lights.length || t.lights[0].bright !== 20 || t.lights[0].dim !== 20) throw new Error(id + " light is not 20+20");
});
const powder = play.tokens.find((t) => t.id === "df_powder");
const plunger = play.tokens.find((t) => t.id === "df_plunger");
if ((powder.asset.images || []).length < 2 || powder.asset.props.timer.mode !== "fuse" || powder.asset.interact.actions.indexOf("toggle") < 0) {
  throw new Error("powder barrel lost a button");
}
if ((plunger.asset.images || []).length < 2 || plunger.asset.props.timer.mode !== "plunger" || plunger.asset.interact.actions.indexOf("toggle") < 0) {
  throw new Error("plunger box lost a button");
}
const playPath = path.join(root, "map/packs/showcase-dry-fork/showcase-dry-fork.play.json");
fs.writeFileSync(playPath, JSON.stringify(play, null, 2) + "\n");

const packsPath = path.join(root, "map/map-packs.js");
let src = fs.readFileSync(packsPath, "utf8");
const marker = '{"id":"scn_dry_fork"';
const start = src.indexOf(marker);
if (start < 0) throw new Error("scn_dry_fork missing from map-packs.js");
let depth = 0, end = start;
for (; end < src.length; end++) {
  const ch = src[end];
  if (ch === "{") depth++;
  else if (ch === "}") { depth--; if (depth === 0) { end++; break; } }
}
const scene = JSON.parse(src.slice(start, end));
scene.painted = true;
scene.notes = "Painted. Dusk starts Dim. Order board starts RED. Tank hotspots stay on the layout key.";
scene.play = play;
src = src.slice(0, start) + JSON.stringify(scene) + src.slice(end);
if (!src.startsWith("/* Built-in map packs")) throw new Error("map-packs header moved");
src = src.replace(
  "/* Built-in map packs (sheet 0.3.54; Dry Fork Water Stop added in N90).\n   Walls are in square-corner coords (x1,y1)-(x2,y2). Paths are relative to the map asset base.\n   Opening a built-in scene seeds its walls once. Import Walls prefills from this pack. */",
  "/* Built-in map packs (sheet 0.3.54; Dry Fork Water Stop added in N90, play seed 0.3.220).\n   Walls are in square-corner coords (x1,y1)-(x2,y2). Paths are relative to the map asset base.\n   Opening a built-in scene seeds its walls once, then Dry Fork's play tokens once. Import Walls prefills from this pack.\n   Dry Fork art is the painted 2800×2100 PNG. The schematic beside it is a guide only. */"
);
fs.writeFileSync(packsPath, src);
console.log("play tokens", play.tokens.length, "zones", play.zones.length, "spawns", play.spawns.length);
console.log("showcase dry fork build ok");

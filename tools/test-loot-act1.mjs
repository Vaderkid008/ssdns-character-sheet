/**
 * Act I Give-tab loot (DRAFT v1.3). Locked: gun mix 20% each, Outlaw Stash Black on d6 = 1 only.
 * Letters are a post-pick scroll-chance. Map chest select offers Lockpick / Force / Key.
 *   node tools/test-loot-act1.mjs
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
function check(id, cond, detail) {
  if (!cond) failures.push(id + (detail ? " — " + detail : ""));
  console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + detail : ""));
}
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function faceRng(pairs) {
  let i = 0;
  return function () {
    const pair = pairs[i++] || [1, 6];
    return (pair[0] - 0.5) / pair[1];
  };
}

const ctx = { console, Math, Date, JSON, parseInt, isFinite, Number, String, Object, Array, fetch: null };
ctx.globalThis = ctx;
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(read("assets/data/loot-tags.js"), ctx, { filename: "loot-tags.js" });
vm.runInContext(read("assets/js/loot.js"), ctx, { filename: "loot.js" });
const L = ctx.SSDNSLoot;
const tables = {};
["act1-saddlebag", "act1-supply-crate", "act1-outlaw-stash", "act1-strongbox"].forEach((id) => {
  tables[id] = JSON.parse(read("assets/data/loot/" + id + ".json"));
  L.register(tables[id]);
});
const GUNS = Object.keys(L.GUNS);
const STORY = ["hat-of-the-sharpshooter", "eldorite-dust", "legloss-revolver", "black-shard", "strongbox-key"];

function sumW(rows) { return (rows || []).reduce((s, r) => s + (Number(r.w) || 0), 0); }
Object.entries(tables).forEach(([id, t]) => {
  const bands = Object.values(t.bands).reduce((s, n) => s + n, 0);
  check("sum.bands." + id, bands === 100, String(bands));
  Object.keys(t.rows).forEach((b) => {
    if (!t.rows[b].length) return;
    check("sum." + id + "." + b, sumW(t.rows[b]) === 100, String(sumW(t.rows[b])));
  });
});
check("lock.guns20", tables["act1-saddlebag"].subTables["#gun-act1"].rows.every((r) => r.w === 20) && GUNS.length === 5);
check("lock.blackOn", JSON.stringify(tables["act1-outlaw-stash"].cash.blackOn) === "[1]" && tables["act1-outlaw-stash"].cash.blackId === "black-shard-junk" && tables["act1-outlaw-stash"].cash.dice === "1d6x50");
check("supply.noGun", !JSON.stringify(tables["act1-supply-crate"].rows).includes("#gun-act1"));
check("supply.silk", tables["act1-saddlebag"].rows.uncommon.find((r) => r.id === "good-silk-rope-50-ft").w === 20 && tables["act1-supply-crate"].rows.uncommon.find((r) => r.id === "good-silk-rope-50-ft").w === 20 && !tables["act1-saddlebag"].rows.uncommon.some((r) => r.id === "blasting-keg"));
check("stash.keg", tables["act1-outlaw-stash"].rows.uncommon.some((r) => r.id === "blasting-keg" && r.w === 5));
check("v13.bands", tables["act1-outlaw-stash"].bands.common === 75 && tables["act1-outlaw-stash"].bands.uncommon === 22 && tables["act1-outlaw-stash"].bands.rare === 3 && tables["act1-strongbox"].bands.common === 55 && tables["act1-strongbox"].bands.uncommon === 38 && tables["act1-strongbox"].bands.rare === 7);
check("v13.unc", [12, 26, 26, 16, 15, 5].join() === tables["act1-strongbox"].rows.uncommon.map((r) => r.w).join() && !tables["act1-strongbox"].rows.uncommon.some((r) => r.id === "#glowing-letter-act1"));
check("v13.letters", tables["act1-saddlebag"].letterChance.first === 70 && tables["act1-saddlebag"].letterChance.max === 1 && tables["act1-supply-crate"].letterChance.first === 65 && tables["act1-outlaw-stash"].letterChance.first === 85 && tables["act1-outlaw-stash"].letterChance.second === 35 && tables["act1-outlaw-stash"].letterChance.max === 2 && tables["act1-strongbox"].letterChance.first === 95 && tables["act1-strongbox"].letterChance.second === 50 && tables["act1-saddlebag"].subTables["#glowing-letter-act1"].rows.map((r) => r.w).join() === "40,28,27,4,1");
check("v13.chapter", L.CHAPTER[1] === 465 && L.CHAPTER[2] === 2490 && L.CHAPTER[3] === 2490 && L.CHAPTER[4] === 4140 && L.CHAPTER[5] === 0);
check("v13.noKeyRow", !JSON.stringify(tables).includes('"id": "strongbox-key"') && tables["act1-strongbox"].defaults.keyItem === "strongbox-key" && tables["act1-strongbox"].defaults.lockDc === 15);
check("v12.slugs", tables["act1-saddlebag"].rows.common.find((r) => r.id === "slugs-12-ga-10").w === 3 && tables["act1-saddlebag"].rows.common.find((r) => r.id === "slugs-410-10").w === 1);
check("v12.dynamiteArrow", tables["act1-saddlebag"].rows.common.find((r) => r.id === "arrows-dynamite-1").w === 2);
check("v12.buckOnly", tables["act1-saddlebag"].rows.common.some((r) => r.id === "shells-12-ga-10" && r.w === 5) && !JSON.stringify(tables).includes("slugs-10-ga-10") && !JSON.stringify(tables).includes("slug-shells"));
check("v12.supply", ["hardtack-jerky-1-day", "whiskey-bottle", "cartridges-medium-20", "assay-tonic-trail-draught"].map((id) => tables["act1-supply-crate"].rows.common.find((r) => r.id === id).w).join() === "9,7,8,3");
const gear = read("assets/data/item-catalog-gear.js");
check("catalog.slugs", /"id": "slugs-410-10"/.test(gear) && /"price": 50/.test(gear) && /"id": "slugs-12-ga-10"/.test(gear) && /"price": 100/.test(gear) && /"id": "slugs-10-ga-10"/.test(gear) && /"price": 200/.test(gear));
check("catalog.dynamiteArrow", /"id": "arrows-dynamite-1"/.test(gear) && /"weight": 1\.05/.test(gear) && /"forSale": false/.test(gear));
check("catalog.noChaosAmmo", !/chaosmaker-(ammo|cartridge|round)/i.test(gear) && !/chaosmaker-ammo/.test(read("dm/assets/data/store-items.json")));

check("catalog.junk", /"id": "black-shard-junk"/.test(gear) && /Worthless as money/.test(gear) && /"forSale": false/.test(gear) && /"weight": 0/.test(gear) && /"price": 0/.test(gear) && /\["junk"\]/.test(gear));
check("catalog.notQuest", !/"id": "black-shard-junk"[\s\S]{0,200}"type": "quest"/.test(gear));

/* 1. Saddlebag × 100 */
const saddles = [];
for (let i = 0; i < 100; i++) saddles.push(L.rollBox(tables["act1-saddlebag"], { act: 1, partyLevel: 1 }, mulberry32(1000 + i)));
const picks = saddles.flatMap((b) => b.picks);
const uncommon = picks.filter((p) => p.band === "uncommon").length / picks.length;
check("saddle.uncommon", uncommon > 0.02 && uncommon < 0.1, uncommon.toFixed(3) + " of " + picks.length);
check("saddle.noChaos", !picks.some((p) => /chaosmaker/i.test(p.id)));
check("saddle.noStory", !picks.some((p) => STORY.includes(p.id)));
check("saddle.oneGun", saddles.every((b) => b.picks.filter((p) => L.GUNS[p.id]).length <= 1));
check("saddle.oneExplosive", saddles.every((b) => b.picks.filter((p) => /dynamite|blasting-keg|arrows-dynamite/.test(p.id)).length <= 1));
check("saddle.oneLetter", saddles.every((b) => b.picks.filter((p) => /^glowing-letter/.test(p.id)).length <= 1));
check("saddle.letterBand", saddles.every((b) => b.picks.filter((p) => /^glowing-letter/.test(p.id)).every((p) => p.band === "letter")));
check("saddle.picks", saddles.every((b) => b.picks.filter((p) => p.band !== "letter").length === 2));
check("saddle.noOtherStory", !picks.some((p) => p.id === "hat-of-the-sharpshooter" || p.id === "legloss-revolver"));
check("saddle.dirty", picks.filter((p) => L.GUNS[p.id]).every((p) => p.dirty === true));
check("saddle.es", saddles.every((b) => b.cash.branch === "es" && b.cash.es > 0));

/* 8. Gun mix */
const counts = {};
GUNS.forEach((id) => { counts[id] = 0; });
const gunTable = {
  id: "gun-only", name: "Guns", boxType: "saddlebag", picks: "1", draft: true,
  bands: { common: 100 },
  rows: { common: [{ id: "#gun-act1", w: 100, qty: "1", dirty: true }] },
  subTables: tables["act1-saddlebag"].subTables,
  caps: { gun: 1, explosive: 1, noDupePermanent: true },
  cash: null
};
const N = 2000;
for (let i = 0; i < N; i++) {
  const b = L.rollBox(gunTable, { act: 1, partyLevel: 1 }, mulberry32(50 + i));
  if (b.picks[0]) counts[b.picks[0].id] = (counts[b.picks[0].id] || 0) + 1;
}
GUNS.forEach((id) => {
  const pct = (counts[id] || 0) / N;
  check("gun." + id, pct > 0.17 && pct < 0.23, (pct * 100).toFixed(1) + "%");
});

/* 2 and 9. Black branch */
for (let face = 1; face <= 6; face++) {
  const cash = L.rollCash(tables["act1-outlaw-stash"], faceRng([[face, 6], [2, 4]]));
  check("black.face" + face, face === 1 ? (cash.branch === "black" && cash.blackId === "black-shard-junk" && cash.black >= 1 && cash.black <= 4 && cash.es === 0) : (cash.branch === "es" && cash.black === 0 && cash.es === face * 50), JSON.stringify(cash));
}
let blacks = 0;
const B = 1200;
for (let i = 0; i < B; i++) {
  const cash = L.rollCash(tables["act1-outlaw-stash"], mulberry32(9000 + i));
  if (cash.branch === "black") {
    blacks++;
    if (cash.blackId !== "black-shard-junk") check("black.id", false, cash.blackId);
  }
}
const rate = blacks / B;
check("black.rate", rate > 0.12 && rate < 0.22, rate.toFixed(3));
check("black.notQuest", tables["act1-outlaw-stash"].cash.blackId !== "black-shard");

/* 3. Strongbox rare is mundane poison only */
const rareIds = new Set();
let magic = 0;
for (let i = 0; i < 200; i++) {
  const b = L.rollBox(tables["act1-strongbox"], { act: 1, partyLevel: 2 }, mulberry32(3000 + i));
  b.picks.forEach((p) => {
    if (p.band === "rare") rareIds.add(p.id);
    if (L.magicRare(p.id)) magic++;
  });
}
check("strong.rareIds", [...rareIds].every((id) => id === "arrows-poison-3" || id === "trail-poison-illegal-in-most-towns"), [...rareIds].join(","));
check("strong.noMagic", magic === 0, String(magic));

/* Never-roll filter, even if a row is present */
const poisoned = {
  id: "poisoned", name: "Poisoned", boxType: "saddlebag", picks: "1",
  bands: { common: 100 },
  rows: { common: [
    { id: "pony-arms-chaosmaker-light", w: 40, qty: "1" },
    { id: "hat-of-the-sharpshooter", w: 30, qty: "1" },
    { id: "lancaster-repeating-rifle", w: 20, qty: "1" },
    { id: "hardtack-jerky-1-day", w: 10, qty: "1d4" }
  ] },
  caps: { gun: 1, explosive: 1, noDupePermanent: true }, cash: { dice: "2d6x5" }
};
const bad = [];
for (let i = 0; i < 80; i++) bad.push(L.rollBox(poisoned, { act: 1, partyLevel: 1 }, mulberry32(4000 + i)).picks[0]);
check("filter.onlyHardtack", bad.every((p) => p && p.id === "hardtack-jerky-1-day"), bad.map((p) => p && p.id).slice(0, 8).join(","));

const magicTable = {
  id: "magic", name: "Magic", boxType: "strongbox", picks: "1",
  bands: { rare: 100 },
  rows: { rare: [
    { id: "pocket-watch-rare", w: 50, qty: "1" },
    { id: "arrows-poison-3", w: 50, qty: "1" }
  ] },
  caps: { gun: 1, explosive: 1, noDupePermanent: true }, cash: null
};
ctx.SSDNS_LOOT_TAGS["pocket-watch-rare"] = { rarity: "rare", magic: true, requiresAttunement: true, lootable: true };
const magicRolls = [];
for (let i = 0; i < 40; i++) magicRolls.push(L.rollBox(magicTable, { act: 1, partyLevel: 1 }, mulberry32(5000 + i)).picks[0]);
check("filter.noMagicRare", magicRolls.every((p) => p && p.id === "arrows-poison-3"));
const allowed = L.rollBox(magicTable, { act: 1, partyLevel: 1, overrideRare: true }, mulberry32(7));
check("filter.overrideLogged", allowed.log[0] === "DM Rare-limit override");

/* 4. Hand-place ChaosMaker */
const box = L.place(tables["act1-saddlebag"], { act: 1, partyLevel: 1, opener: "p_a", rollMode: "preroll" }, mulberry32(11));
const hand = L.handPlace(box, "pony-arms-chaosmaker-light", 1);
check("hand.chaos", hand.ok && hand.row.id === "pony-arms-chaosmaker-light" && box.log.some((line) => /DM placed/.test(line) && /ChaosMaker|chaosmaker|pony-arms-chaosmaker-light/.test(line)), box.log.join(" | "));

/* 5. Opener sees it; the other player does not until Share */
check("see.opener", L.visibleTo(box, "p_a", "player") === true);
check("see.other", L.visibleTo(box, "p_b", "player") === false);
check("see.dm", L.visibleTo(box, "p_b", "dm") === true);
box.shared = true;
check("see.shared", L.visibleTo(box, "p_b", "player") === true);

/* 6. Take all → ammo pool, ES wallet, xfer done */
const haul = {
  id: "box_test", name: "Saddlebag (Act I)", boxType: "saddlebag", opener: "p_a", reveal: "opener", shared: false, taken: false,
  contents: [{ id: "cartridges-light-20", qty: 1, name: "Light cartridges", taken: false }],
  cash: { es: 35, black: 0, branch: "es" }, log: []
};
const who = { es: 100, ammo: [], items: [], guns: [], abilities: { STR: 10 } };
const took = L.takeAll(haul, "p_a", who);
L.applyTake(who, took);
check("take.ammo", who.ammo.some((a) => a.type === "cartridge" && a.caliber === "Light" && a.count === 20), JSON.stringify(who.ammo));
check("take.es", who.es === 135, String(who.es));
check("take.xfer", took.ok && took.ledger.state === "done" && /^xfer_/.test(took.ledger.id) && took.request.kind === "loot_take" && took.xfer.state === "done");
check("take.hidden", !L.takeAll(haul, "p_b").ok);

const gunHaul = {
  id: "box_gun", name: "Saddlebag", opener: "p_a", reveal: "opener", taken: false,
  contents: [{ id: "navy-army-ball-n-cap-revolver", qty: 1, dirty: true, name: "Navy" }],
  cash: { es: 0, black: 0, branch: "none" }, log: []
};
const shooter = { es: 0, ammo: [], items: [], guns: [] };
const gtake = L.takeAll(gunHaul, "p_a", shooter);
L.applyTake(shooter, gtake);
check("take.dirtyGun", shooter.guns[0] && shooter.guns[0].weapon === "navy-army-ball-n-cap-revolver" && shooter.guns[0].dirty === true, JSON.stringify(shooter.guns));

const blackHaul = {
  id: "box_black", name: "Outlaw Stash", opener: "p_a", reveal: "opener", taken: false,
  contents: [], cash: { es: 0, black: 3, blackId: "black-shard-junk", branch: "black" }, log: []
};
const holder = { es: 0, ammo: [], items: [], guns: [] };
const btake = L.takeAll(blackHaul, "p_a", holder);
L.applyTake(holder, btake);
check("take.junk", holder.items[0] && holder.items[0].catalogId === "black-shard-junk" && holder.items[0].count === 3 && !holder.items.some((it) => it.catalogId === "black-shard"));

/* 7. Sealed crate */
const sealed = L.place(L.SEALED, { act: 1, opener: "p_a", rollMode: "onOpen" });
const shut = L.openBox(sealed, L.SEALED, { act: 1 });
check("sealed.shut", shut.ok === false && /Act 2/.test(shut.reason), shut.reason);
const open = L.openBox(sealed, L.SEALED, { act: 2 });
check("sealed.open", open.ok === true);

/* v1.2 Common rates and Glowing Letter mix */
const commonOnly = {
  id: "common-only", name: "Common", boxType: "saddlebag", picks: "1", draft: true,
  bands: { common: 100 }, rows: { common: tables["act1-saddlebag"].rows.common },
  subTables: tables["act1-saddlebag"].subTables,
  caps: tables["act1-saddlebag"].caps, cash: null
};
const commonN = 8000;
const commonCounts = {};
for (let i = 0; i < commonN; i++) {
  const p = L.rollBox(commonOnly, { act: 1, partyLevel: 1 }, mulberry32(12000 + i)).picks[0];
  if (p) commonCounts[p.id] = (commonCounts[p.id] || 0) + 1;
}
function near(id, pct, tol) {
  const got = (commonCounts[id] || 0) / commonN;
  check("common." + id, Math.abs(got - pct) <= tol, (got * 100).toFixed(2) + "%");
}
near("slugs-12-ga-10", 0.03, 0.015);
near("slugs-410-10", 0.01, 0.015);
near("arrows-dynamite-1", 0.02, 0.015);
check("common.no10ga", !commonCounts["slugs-10-ga-10"]);

const letterTable = {
  id: "letters", name: "Letters", boxType: "saddlebag", picks: "0",
  bands: {}, rows: {}, subTables: tables["act1-saddlebag"].subTables,
  letterChance: { first: 100, second: 0, max: 1 },
  caps: { gun: 1, explosive: 1, glowingLetter: 1, noDupePermanent: true }, cash: null
};
const letterN = 4000;
const letterCounts = {};
for (let i = 0; i < letterN; i++) {
  const p = L.rollBox(letterTable, { act: 1, partyLevel: 1 }, mulberry32(20000 + i)).picks.find((row) => row.band === "letter");
  if (p) letterCounts[p.id] = (letterCounts[p.id] || 0) + 1;
}
[["glowing-letter", 0.40], ["glowing-letter-cure-wounds", 0.28], ["glowing-letter-shield", 0.27], ["glowing-letter-fireball", 0.04], ["glowing-letter-revivify", 0.01]].forEach(([id, pct]) => {
  const got = (letterCounts[id] || 0) / letterN;
  check("letter." + id, Math.abs(got - pct) <= 0.03, (got * 100).toFixed(1) + "% vs " + (pct * 100));
});
const miss = L.rollBox(Object.assign({}, tables["act1-saddlebag"], { picks: "0", cash: null }), { act: 1 }, faceRng([[71, 100]]));
const hit = L.rollBox(Object.assign({}, tables["act1-saddlebag"], { picks: "0", cash: null }), { act: 1 }, faceRng([[70, 100], [10, 100]]));
check("letter.d100", miss.picks.length === 0 && hit.picks.length === 1 && hit.picks[0].band === "letter", JSON.stringify(hit.picks));
const two = L.rollBox(Object.assign({}, tables["act1-outlaw-stash"], { picks: "0", cash: null }), { act: 1 }, faceRng([[1, 100], [40, 100], [1, 100], [80, 100]]));
const oneOnly = L.rollBox(Object.assign({}, tables["act1-outlaw-stash"], { picks: "0", cash: null }), { act: 1 }, faceRng([[1, 100], [40, 100], [36, 100]]));
check("letter.second", two.picks.filter((p) => p.band === "letter").length === 2 && oneOnly.picks.filter((p) => p.band === "letter").length === 1, two.picks.map((p) => p.id).join(",") + " / " + oneOnly.picks.length);
function letterRate(table, n, seed) {
  let any = 0, pair = 0;
  for (let i = 0; i < n; i++) {
    const picks = L.rollBox(table, { act: 1, partyLevel: 1 }, mulberry32(seed + i)).picks.filter((p) => p.band === "letter");
    if (picks.length) any++;
    if (picks.length === 2) pair++;
  }
  return { any: any / n, pair: pair / n };
}
const lrN = 4000;
const bagLetters = letterRate(tables["act1-saddlebag"], lrN, 40000);
const crateLetters = letterRate(tables["act1-supply-crate"], lrN, 50000);
const stashLetters = letterRate(tables["act1-outlaw-stash"], lrN, 60000);
const boxLetters = letterRate(tables["act1-strongbox"], lrN, 70000);
check("letter.saddle70", Math.abs(bagLetters.any - 0.70) <= 0.04, bagLetters.any.toFixed(3));
check("letter.crate65", Math.abs(crateLetters.any - 0.65) <= 0.04, crateLetters.any.toFixed(3));
check("letter.stash85", Math.abs(stashLetters.any - 0.85) <= 0.04 && Math.abs(stashLetters.pair - 0.2975) <= 0.04, stashLetters.any.toFixed(3) + " pair " + stashLetters.pair.toFixed(3));
check("letter.strong95", Math.abs(boxLetters.any - 0.95) <= 0.04 && Math.abs(boxLetters.pair - 0.475) <= 0.04, boxLetters.any.toFixed(3) + " pair " + boxLetters.pair.toFixed(3));
check("overlay.letters", ["glowing-letter", "glowing-letter-cure-wounds", "glowing-letter-shield", "glowing-letter-fireball", "glowing-letter-revivify"].every((id) => {
  const t = L.tagOf(id);
  return t.lootable === true && t.storyOnly === false && t.rarity === "uncommon";
}));
check("overlay.storyStays", L.tagOf("hat-of-the-sharpshooter").storyOnly === true && L.tagOf("legloss-revolver").storyOnly === true && L.illegalReason("hat-of-the-sharpshooter", { guns: 0, explosives: 0, letters: 0, magicRare: 0, seen: {}, counts: {}, caps: {} }, { act: 1 }) === "storyOnly");
check("overlay.slug10", L.illegalReason("slugs-10-ga-10", { guns: 0, explosives: 0, letters: 0, magicRare: 0, seen: {}, counts: {}, caps: { gun: 1, explosive: 1, glowingLetter: 1 } }, { act: 1 }) === "actMin");
check("overlay.chaosWeapon", L.tagOf("pony-arms-chaosmaker-light").actMin === 2 && L.tagOf("pony-arms-chaosmaker-medium").lootable === false);
const emptyState = { guns: 0, explosives: 0, letters: 0, magicRare: 0, seen: {}, counts: {}, caps: { gun: 1, explosive: 1, glowingLetter: 1 } };
check("overlay.key", L.tagOf("strongbox-key").lootable === true && L.tagOf("strongbox-key").storyOnly === false && L.illegalReason("strongbox-key", emptyState, { act: 1 }) === "noBand");

const pools = { es: 0, ammo: [], items: [], guns: [] };
const mixed = {
  id: "box_mix", name: "Saddlebag", opener: "p_a", reveal: "opener", taken: false,
  contents: [
    { id: "shells-12-ga-10", qty: 1 },
    { id: "slugs-12-ga-10", qty: 1 },
    { id: "arrows-dynamite-1", qty: 1 }
  ],
  cash: { es: 10, black: 0, branch: "es" }, log: []
};
const mixTake = L.takeAll(mixed, "p_a", pools);
L.applyTake(pools, mixTake);
const poolOf = (type, cal) => pools.ammo.find((a) => a.type === type && a.caliber === cal);
check("take.buck", poolOf("buck", "12 ga") && poolOf("buck", "12 ga").count === 10, JSON.stringify(pools.ammo));
check("take.slug", poolOf("slug", "12 ga") && poolOf("slug", "12 ga").count === 10, JSON.stringify(pools.ammo));
check("take.dynamiteArrow", poolOf("arrows", "dynamite") && poolOf("arrows", "dynamite").count === 1, JSON.stringify(pools.ammo));
ctx.SSDNSItems = { weightReport: () => ({ carried: 149, capacity: 150 }), byId: () => null };
const dynWho = { es: 0, ammo: [], items: [], guns: [] };
const dynHaul = { id: "box_dyn", name: "Saddlebag", opener: "p_a", reveal: "opener", taken: false, contents: [{ id: "arrows-dynamite-1", qty: 1 }], cash: { es: 0, black: 0, branch: "none" }, log: [] };
const dynTake = L.takeAll(dynHaul, "p_a", dynWho);
check("take.dynamiteWeight", /150\.1 \/ 150/.test(dynTake.warning || ""), dynTake.warning);
const heavy = L.budget([{ boxType: "strongbox" }, { boxType: "strongbox" }], 1);
const still = L.place(tables["act1-saddlebag"], { act: 1, partyLevel: 1, opener: "p_a", rollMode: "preroll" }, mulberry32(3));
const placeSrc = read("dm/assets/js/loot-give.js").split("async function placeBox")[1].split("\n  function ")[0];
check("budget.warns", heavy.over === true && /does not block/.test(heavy.text) && still.rolled === true && !/block/.test(placeSrc));

/* v1.3 lock menu */
const hero = { mods: { DEX: 5, STR: 5, WIS: 3 }, prof: 2, thievesTools: true, items: [{ catalogId: "strongbox-key", count: 1 }] };
const bare = { mods: { DEX: 0, STR: 0, WIS: 0 }, prof: 0, items: [] };
let sxLocked = 0, bagOpen = 0, crateLock = 0, crateNail = 0, stashLock = 0, stashHide = 0;
const lockN = 2000;
for (let i = 0; i < lockN; i++) {
  const sx = L.place(tables["act1-strongbox"], { rollMode: "onOpen", opener: "p_a" }, mulberry32(80000 + i));
  if (sx.lock && sx.lock.dc === 15 && sx.lock.unlocked === false) sxLocked++;
  const bag = L.place(tables["act1-saddlebag"], { rollMode: "onOpen", opener: "p_a" }, mulberry32(90000 + i));
  if (bag.lock && bag.lock.dc === 0 && bag.lock.unlocked === true && !L.blocked(bag)) bagOpen++;
  const crate = L.place(tables["act1-supply-crate"], { rollMode: "onOpen", opener: "p_a" }, mulberry32(100000 + i));
  if (crate.barrier && crate.barrier.type === "nailed" && !crate.barrier.cleared) crateNail++;
  if (crate.lock && crate.lock.dc > 0 && !crate.lock.unlocked) crateLock++;
  const stash = L.place(tables["act1-outlaw-stash"], { rollMode: "onOpen", opener: "p_a" }, mulberry32(110000 + i));
  if (stash.hidden && !stash.found) stashHide++;
  if (stash.lock && stash.lock.dc >= 12 && stash.lock.dc <= 14 && !stash.lock.unlocked) stashLock++;
}
check("lock.strongAlways", sxLocked === lockN, String(sxLocked));
check("lock.saddleOpen", bagOpen === lockN, String(bagOpen));
check("lock.crateNail", crateNail === lockN, String(crateNail));
check("lock.crate20", Math.abs(crateLock / lockN - 0.20) <= 0.04, (crateLock / lockN).toFixed(3));
check("lock.stashHide", stashHide === lockN, String(stashHide));
check("lock.stash70", Math.abs(stashLock / lockN - 0.70) <= 0.04, (stashLock / lockN).toFixed(3));

const sx = L.place(tables["act1-strongbox"], { rollMode: "preroll", act: 1, partyLevel: 1, opener: "p_a" }, mulberry32(4));
check("lock.held", sx.rolled === false && L.openBox(sx, tables["act1-strongbox"], { act: 1, partyLevel: 1 }).ok === false);
const sxMenu = L.menu(sx, hero).map((o) => o.id);
check("menu.strong", sxMenu.indexOf("lockpick-yes") >= 0 && sxMenu.indexOf("lockpick-no") >= 0 && sxMenu.indexOf("force") >= 0 && sxMenu.indexOf("key") >= 0 && sxMenu.indexOf("open") < 0, sxMenu.join(","));
const picked = L.resolve(sx, "lockpick-yes", hero, faceRng([[15, 20]]));
check("menu.lockpick", picked.success === true && sx.lock.unlocked === true && /Dex \+ thieves' tools/.test(sx.log.join(" ")), sx.log.join(" | "));
check("menu.opened", L.openBox(sx, tables["act1-strongbox"], { act: 1, partyLevel: 1 }, mulberry32(5)).ok === true && sx.rolled === true);

const jammed = L.place(tables["act1-strongbox"], { rollMode: "onOpen", opener: "p_a" }, mulberry32(6));
jammed.lock.jamOnFail = true;
const jam = L.resolve(jammed, "lockpick-yes", bare, () => 0);
const retry = L.resolve(jammed, "lockpick-yes", hero, faceRng([[20, 20]]));
check("menu.jam", jam.success === false && jammed.lock.jammed === true && retry.ok === false && /jammed/.test(retry.reason) && !L.menu(jammed, hero).some((o) => o.id === "lockpick-yes"));

const noisy = L.place(tables["act1-strongbox"], { rollMode: "onOpen", opener: "p_a" }, mulberry32(7));
const forced = L.resolve(noisy, "force", { mods: { STR: 4 } }, faceRng([[18, 20]]));
check("menu.force", forced.success === true && forced.noisy === true && noisy.lock.unlocked === true && /Noisy/.test(noisy.log.join(" ")));
const trapped = L.place(tables["act1-strongbox"], { rollMode: "onOpen", opener: "p_a" }, mulberry32(8));
trapped.trap = { dc: 13, tripped: false, name: "Needle" };
const trip = L.resolve(trapped, "force", { mods: { STR: 0 } }, () => 0);
check("menu.trap", trip.success === false && trip.tripped === true && trapped.trap.tripped === true && trapped.lock.unlocked === false);

const keyed = L.place(tables["act1-strongbox"], { rollMode: "onOpen", opener: "p_a" }, mulberry32(9));
const keyItems = [{ catalogId: "strongbox-key", count: 1 }];
let rolledKey = false;
const keyedRes = L.resolve(keyed, "key", { items: keyItems }, () => { rolledKey = true; return 0; });
check("menu.key", keyedRes.success === true && keyedRes.keptKey === true && keyed.lock.unlocked === true && keyItems[0].count === 1 && rolledKey === false);

const bagMenu = L.menu(L.place(tables["act1-saddlebag"], { rollMode: "onOpen", opener: "p_a" }, mulberry32(10)), bare).map((o) => o.id);
check("menu.saddle", bagMenu.join(",") === "open,leave", bagMenu.join(","));
const crate = L.place(tables["act1-supply-crate"], { rollMode: "onOpen", opener: "p_a" }, () => 0.99);
check("menu.pry", crate.lock.unlocked === true && L.menu(crate, bare).some((o) => o.id === "pry"));
const pried = L.resolve(crate, "pry", { items: [{ catalogId: "claim-pry-bar", count: 1 }] }, () => 0);
check("menu.pryBar", pried.auto === true && pried.success === true && crate.barrier.cleared === true);
const stash = L.place(tables["act1-outlaw-stash"], { rollMode: "onOpen", opener: "p_a" }, () => 0);
check("menu.searchFirst", L.menu(stash, bare).map((o) => o.id).join(",") === "search,leave" && stash.lock.dc >= 12);
const found = L.resolve(stash, "search", { skills: { Perception: 5 } }, faceRng([[15, 20]]));
check("menu.search", found.success === true && stash.found === true && L.menu(stash, bare).some((o) => o.id === "lockpick-yes"));
L.preUnlock(jammed);
check("menu.preUnlock", L.blocked(jammed) === "" && /DM pre-unlocked/.test(jammed.log.join(" ")));
const dmBox = L.place(tables["act1-strongbox"], { rollMode: "onOpen", opener: "p_a", act: 1, partyLevel: 1 }, mulberry32(12));
const dmOpen = L.openBox(dmBox, tables["act1-strongbox"], { act: 1, partyLevel: 1, bypass: true }, mulberry32(13));
check("menu.dmOpen", dmOpen.ok === true && dmBox.rolled === true && L.blocked(dmBox) === "");
const give = read("dm/assets/js/loot-give.js");
check("ui.lockMenu", /Lockpick\? Yes/.test(give) && /Force it \(Strength\)/.test(read("assets/js/loot.js")) && /Use key \(Strongbox Key\)/.test(read("assets/js/loot.js")) && /rollAdv/.test(give) && /postCheck/.test(give) && !/Hold that click path/.test(give));
check("ui.mapPin", /function pinLootChest/.test(read("map/ssdns-map.js")) && /pinLootChest:/.test(read("map/ssdns-map-host.js")));
check("shells.buckPlan", /"shells-12-ga-10": \{ kind: "ammo", type: "buck"/.test(read("dm/assets/js/store-stock.js")) && /"slugs-12-ga-10": \{ kind: "ammo", type: "slug"/.test(read("dm/assets/js/store-stock.js")));

check("rules.untouched", !read("assets/data/rules.js").includes("black-shard-junk") && !read("assets/data/rules.js").includes("slugs-12-ga-10") && !read("database.rules.json").includes("loot_take"));
check("ui.insideGive", /id="giveLootWrap"/.test(read("dm/index.html")) && /data-give-mode="loot"/.test(read("dm/index.html")) && !/role="tab"[^>]*>Loot/.test(read("dm/index.html")));

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\nloot act1 ok");

/**
 * Act I Give-tab loot (DRAFT v1.2). Locked: gun mix 20% each, Outlaw Stash Black on d6 = 1 only.
 * v1.2: slug packs, dynamite arrow, Glowing Letters at 5% of Uncommon. Budget warns only.
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
check("supply.silk", tables["act1-saddlebag"].rows.uncommon.find((r) => r.id === "good-silk-rope-50-ft").w === 24 && !tables["act1-saddlebag"].rows.uncommon.some((r) => r.id === "blasting-keg"));
check("stash.keg", tables["act1-outlaw-stash"].rows.uncommon.some((r) => r.id === "blasting-keg" && r.w === 5));
check("v12.slugs", tables["act1-saddlebag"].rows.common.find((r) => r.id === "slugs-12-ga-10").w === 3 && tables["act1-saddlebag"].rows.common.find((r) => r.id === "slugs-410-10").w === 1);
check("v12.dynamiteArrow", tables["act1-saddlebag"].rows.common.find((r) => r.id === "arrows-dynamite-1").w === 2);
check("v12.buckOnly", tables["act1-saddlebag"].rows.common.some((r) => r.id === "shells-12-ga-10" && r.w === 5) && !JSON.stringify(tables).includes("slugs-10-ga-10") && !JSON.stringify(tables).includes("slug-shells"));
check("v12.letters", tables["act1-outlaw-stash"].rows.uncommon.find((r) => r.id === "#glowing-letter-act1").w === 5 && tables["act1-outlaw-stash"].subTables["#glowing-letter-act1"].rows.map((r) => r.w).join() === "40,25,25,7,3");
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
  id: "letters", name: "Letters", boxType: "outlaw-stash", picks: "1",
  bands: { uncommon: 100 },
  rows: { uncommon: [{ id: "#glowing-letter-act1", w: 100, qty: "1" }] },
  subTables: tables["act1-outlaw-stash"].subTables,
  caps: { gun: 1, explosive: 1, glowingLetter: 1, noDupePermanent: true }, cash: null
};
const letterN = 2000;
const letterCounts = {};
for (let i = 0; i < letterN; i++) {
  const p = L.rollBox(letterTable, { act: 1, partyLevel: 1 }, mulberry32(20000 + i)).picks[0];
  if (p) letterCounts[p.id] = (letterCounts[p.id] || 0) + 1;
}
[["glowing-letter", 0.40], ["glowing-letter-cure-wounds", 0.25], ["glowing-letter-shield", 0.25], ["glowing-letter-fireball", 0.07], ["glowing-letter-revivify", 0.03]].forEach(([id, pct]) => {
  const got = (letterCounts[id] || 0) / letterN;
  check("letter." + id, Math.abs(got - pct) < 0.04, (got * 100).toFixed(1) + "%");
});
const uncommonOnly = {
  id: "unc", name: "Uncommon", boxType: "outlaw-stash", picks: "1",
  bands: { uncommon: 100 }, rows: { uncommon: tables["act1-outlaw-stash"].rows.uncommon },
  subTables: tables["act1-outlaw-stash"].subTables, caps: tables["act1-outlaw-stash"].caps, cash: null
};
let letterPicks = 0;
const uncN = 4000;
for (let i = 0; i < uncN; i++) {
  const p = L.rollBox(uncommonOnly, { act: 1, partyLevel: 1 }, mulberry32(30000 + i)).picks[0];
  if (p && /^glowing-letter/.test(p.id)) letterPicks++;
}
check("letter.row5", Math.abs(letterPicks / uncN - 0.05) < 0.02, (letterPicks / uncN).toFixed(3));
check("overlay.letters", ["glowing-letter", "glowing-letter-cure-wounds", "glowing-letter-shield", "glowing-letter-fireball", "glowing-letter-revivify"].every((id) => {
  const t = L.tagOf(id);
  return t.lootable === true && t.storyOnly === false && t.rarity === "uncommon";
}));
check("overlay.storyStays", L.tagOf("hat-of-the-sharpshooter").storyOnly === true && L.tagOf("legloss-revolver").storyOnly === true && L.illegalReason("hat-of-the-sharpshooter", { guns: 0, explosives: 0, letters: 0, magicRare: 0, seen: {}, counts: {}, caps: {} }, { act: 1 }) === "storyOnly");
check("overlay.slug10", L.illegalReason("slugs-10-ga-10", { guns: 0, explosives: 0, letters: 0, magicRare: 0, seen: {}, counts: {}, caps: { gun: 1, explosive: 1, glowingLetter: 1 } }, { act: 1 }) === "actMin");
check("overlay.chaosWeapon", L.tagOf("pony-arms-chaosmaker-light").actMin === 2 && L.tagOf("pony-arms-chaosmaker-medium").lootable === false);

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
check("budget.warns", heavy.over === true && /does not block/.test(heavy.text) && still.rolled === true && !/block/.test(read("dm/assets/js/loot-give.js").split("function placeBox")[1].split("function openCurrent")[0]));
check("shells.buckPlan", /"shells-12-ga-10": \{ kind: "ammo", type: "buck"/.test(read("dm/assets/js/store-stock.js")) && /"slugs-12-ga-10": \{ kind: "ammo", type: "slug"/.test(read("dm/assets/js/store-stock.js")));

check("rules.untouched", !read("assets/data/rules.js").includes("black-shard-junk") && !read("assets/data/rules.js").includes("slugs-12-ga-10") && !read("database.rules.json").includes("loot_take"));
check("ui.insideGive", /id="giveLootWrap"/.test(read("dm/index.html")) && /data-give-mode="loot"/.test(read("dm/index.html")) && !/role="tab"[^>]*>Loot/.test(read("dm/index.html")));

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\nloot act1 ok");

/**
 * L0188 food & water run by the DM (5e PHB rules) + exhaustion feeding the sheet math.
 * Covers: day ticks, 3 + Con mod safe days, half rations, hot day, the DC 15 Con save popup,
 * +2 when already exhausted, each exhaustion level's math, condition toasts, Off / Loose / Strict,
 * carried weight (rations 2 lb items, water 8 lb a gallon), old saves loading.
 * Needs the static server on 127.0.0.1:8765 and Chrome (ssdns-test-all starts the server).
 *   node tools/test-supplies.mjs
 */
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ORIGIN = process.env.SSDNS_ORIGIN || "http://127.0.0.1:8765";
const failures = [];
const J = (x) => JSON.stringify(x);
function check(id, cond, detail) { if (!cond) failures.push(id); console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + detail : "")); }
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }

/* ---------------------------------------------------------------- node: pure rules */
const ctx = { console, setTimeout, clearTimeout };
ctx.window = ctx; ctx.globalThis = ctx;
ctx.document = { readyState: "complete", getElementById: () => null, addEventListener() {}, querySelector: () => null };
vm.createContext(ctx);
["assets/data/item-catalog.js", "assets/data/item-catalog-gear.js", "assets/js/items.js", "assets/js/conditions.js", "assets/js/supplies.js"].forEach((f) => vm.runInContext(read(f), ctx, { filename: f }));
const S = ctx.SSDNSSupplies, Cond = ctx.SSDNSConditions, Items = ctx.SSDNSItems;
const fresh = (r, w) => { const c = { items: [], abilities: { STR: 10 } }; S.ensure(c); if (r) S.giveRations(c, r); if (w) S.giveWater(c, w); return c; };

/* ticks */
let c = fresh(3, 3);
let t = S.tick(c, { conMod: 0 });
check("tick.full.uses1ration1gal", S.rations(c) === 2 && c.supplies.water === 2 && t.food === "full" && t.water === "ok" && t.gain === 0, J(t));
check("tick.rations.areRealItems", c.items.length === 1 && c.items[0].catalogId === "hardtack-jerky-1-day" && c.items[0].count === 2, J(c.items));
check("tick.dayCounter", c.supplies.day === 1 && c.supplies.last && c.supplies.last.day === 1);

/* Eat now prepays the day so the end-of-day tick does not spend it again. ASSUMED: 1 meal and up to 1 gal. */
c = fresh(2, 2);
c.supplies.mode = "strict";
let ateNow = S.eatNow(c);
check("eat.spendsNow", ateNow.ok === true && ateNow.ate === 1 && ateNow.drank === 1 && S.rations(c) === 1 && c.supplies.water === 1 && c.supplies.prepaid.food === 1 && c.supplies.daysHungry === 0, J(ateNow));
t = S.tick(c, { conMod: 0 });
check("eat.tickDoesNotDouble", t.food === "full" && t.ate === 1 && t.drank === 1 && S.rations(c) === 1 && c.supplies.water === 1 && c.supplies.prepaid.food === 0 && c.supplies.prepaid.water === 0, J([t.food, t.ate, t.drank, S.rations(c), c.supplies.water]));
c = fresh(0, 0);
c.supplies.mode = "loose";
check("eat.empty", S.eatNow(c).ok === false);
c = fresh(1, 1);
c.supplies.mode = "off";
check("eat.off", S.eatNow(c).ok === false && S.rations(c) === 1);
check("ui.eatButton", read("assets/js/supplies-sheet.js").includes('id="btnEat"') && read("assets/js/supplies-sheet.js").includes("sup-meters"));
check("ui.forage", read("dm/assets/js/supplies-dm.js").includes("btnSupForage") && read("dm/assets/js/supplies-dm.js").includes("ASSUMED: a success grants 1 ration"));

/* Con mod days */
check("limit.con0=3", S.foodLimit(0) === 3);
check("limit.con+2=5", S.foodLimit(2) === 5);
check("limit.con-1=2", S.foodLimit(-1) === 2);
check("limit.min1", S.foodLimit(-5) === 1);
c = fresh(0, 20);
const gains = [];
for (let d = 0; d < 5; d++) gains.push(S.tick(c, { conMod: 0 }).foodGain);
check("hunger.con0.safe3.thenEachDay", J(gains) === J([0, 0, 0, 1, 1]), J(gains));
c = fresh(0, 20);
const gainsHigh = [];
for (let d = 0; d < 4; d++) gainsHigh.push(S.tick(c, { conMod: 1 }).foodGain);
check("hunger.con+1.safe4", J(gainsHigh) === J([0, 0, 0, 0]), J(gainsHigh));
c = fresh(1, 20); c.supplies.daysHungry = 3;
t = S.tick(c, { conMod: 0 });
check("hunger.fullDayResets", t.daysHungry === 0 && t.foodGain === 0);

/* half rations */
c = fresh(1, 5);
t = S.tick(c, { half: true, conMod: 0 });
check("half.halfDayWithoutFood", t.food === "half" && t.daysHungry === 0.5 && S.rations(c) === 0.5, J([t.daysHungry, S.rations(c)]));
t = S.tick(c, { half: true, conMod: 0 });
check("half.twoHalfDays=1ration", S.rations(c) === 0 && c.items.length === 0 && t.daysHungry === 1, J([S.rations(c), c.items]));
c = fresh(0, 9); c.supplies.daysHungry = 3;
t = S.tick(c, { half: true, conMod: 0 });
check("half.noFood.countsFullDay", t.food === "none" && t.daysHungry === 4 && t.foodGain === 1);
c = fresh(0, 9); S.giveRations(c, 0.5); c.supplies.daysHungry = 2.5;
t = S.tick(c, { conMod: 0 });
check("half.onlyHalfLeft.eatsHalf", t.food === "half" && t.daysHungry === 3 && t.foodGain === 0, J(t));
t = S.tick(c, { conMod: 0 });
check("half.past3.gains", t.daysHungry === 4 && t.foodGain === 1);
c = fresh(2, 0); S.giveRations(c, -0.5);
check("give.takeHalf", S.rations(c) === 1.5 && c.supplies.halfOpen === true);
S.giveRations(c, 0.5);
check("give.halfPlusHalf=whole", S.rations(c) === 2 && c.supplies.halfOpen === false && c.items[0].count === 2, J(c.items));

/* hot day */
c = fresh(5, 2);
t = S.tick(c, { hot: true, conMod: 0 });
check("hot.need2", t.need === 2 && t.drank === 2 && t.water === "ok" && c.supplies.water === 0);
c = fresh(5, 1);
t = S.tick(c, { hot: true, conMod: 0 });
check("hot.half=save", t.water === "save" && t.save && t.save.dc === 15 && t.save.gain === 1 && t.waterGain === 0, J(t));

/* water: less than half, already exhausted +2 */
c = fresh(5, 0.5);
t = S.tick(c, { hot: true, conMod: 0, exhaustion: 0 });
check("water.lessThanHalf.auto+1", t.water === "short" && t.waterGain === 1 && t.gain === 1, J(t));
c = fresh(5, 0);
t = S.tick(c, { conMod: 0, exhaustion: 1 });
check("water.exhausted.auto+2", t.waterGain === 2, J(t));
c = fresh(5, 0.5);
t = S.tick(c, { conMod: 0, exhaustion: 2 });
check("water.exhausted.saveFail+2", t.save && t.save.gain === 2);
check("save.pass", S.resolveSave(13, 2, { dc: 15, gain: 2 }).pass === true && S.resolveSave(13, 2, { dc: 15, gain: 2 }).gain === 0);
check("save.fail.gain", S.resolveSave(12, 2, { dc: 15, gain: 2 }).gain === 2 && S.resolveSave(12, 2, { dc: 15, gain: 1 }).gain === 1);

/* long rest + clamps */
c = fresh(5, 5);
t = S.tick(c, { conMod: 0, exhaustion: 2, longRest: true });
check("longRest.ateDrank.-1", t.restDrop === 1 && S.nextLevel(2, t.gain, t.restDrop) === 1);
c = fresh(0, 0);
t = S.tick(c, { conMod: 0, exhaustion: 2, longRest: true });
check("longRest.noFoodWater.noDrop", t.restDrop === 0);
check("nextLevel.clamp", S.nextLevel(5, 3, 0) === 6 && S.nextLevel(0, 0, 1) === 0);

/* carried weight */
c = fresh(3, 2);
const rep = Items.weightReport(c);
check("weight.rations2lbEach", rep.items === 6, J(rep));
check("weight.water8lbPerGal", rep.slots.water === 16 && rep.carried === 22, J(rep));

/* old saves */
const old = { abilities: { STR: 10 }, items: [{ name: "Rope", weight: 10, count: 1 }] };
check("oldsave.weightUnchanged", Items.weightReport(old).carried === 10);
const v = S.view(old);
check("oldsave.defaults", v.mode === "off" && v.rations === 0 && v.water === 0 && v.daysHungry === 0, J(v));
const legacy = { items: [{ name: "Rations (1 day)", count: 2, weight: 2 }] };
check("oldsave.legacyRationsCount", S.rations(legacy) === 2);
check("oldsave.badModeFixed", S.ensure({ supplies: { mode: "weird", water: "x" } }).mode === "off");

/* item schema: tags + meals + water + containers (L0188-L0190) */
const ht = Items.byId("hardtack-jerky-1-day"), ws = Items.byId("waterskin-canteen"), wh = Items.byId("whiskey-bottle");
check("schema.hardtack.food1meal", ht.type === "consumable" && J(ht.tags) === J(["food"]) && ht.meals === 1, J([ht.tags, ht.meals]));
check("schema.waterskin.container", ht && ws.type === "gear" && ws.tags.includes("water") && ws.tags.includes("container") && ws.capacity === 0.5 && ws.defaultFill === "full", J(ws));
check("schema.whiskey.notWater", wh.tags.includes("drink") && !wh.tags.includes("water") && !wh.water);
check("schema.packs.noTagOfTheirOwn", ["trail-kit", "claim-pack", "alley-kit", "saloon-kit", "circuit-kit", "circuit-trunk", "book-trunk"].every((id) => Items.byId(id).tags.length === 0), J(["trail-kit", "alley-kit"].map((id) => Items.byId(id).tags)));
check("schema.packs.mealsFromContents", Items.byId("trail-kit").meals === 10 && Items.byId("claim-pack").meals === 10 && Items.byId("alley-kit").meals === 5 && Items.byId("saloon-kit").meals === 5 && Items.byId("circuit-kit").meals === 2 && Items.byId("trail-kit").capacity === 0.5 && Items.byId("book-trunk").meals === null);
/* L0191/L0192 item scrub */
const bread = Items.byId("bread-loaf"), cheese = Items.byId("cheese-hunk"), meat = Items.byId("meat-chunk");
check("scrub.newFoodRows", [[bread, 2], [cheese, 10], [meat, 30]].every(([r, p]) => r && r.meals === 0.5 && r.weight === 0 && r.price === p && r.forSale && r.tags.includes("food")), J([bread, cheese, meat].map((r) => r && [r.name, r.meals, r.weight, r.price])));
check("scrub.containers5e", [["waterskin-canteen", 0.5], ["jug", 1], ["barrel", 40], ["bottle-empty", 0.1875], ["flask-tin-cup", 0.125], ["bucket", 3], ["cook-pot", 1]].every(([id, g]) => Items.byId(id).capacity === g && Items.byId(id).tags.includes("water")));
check("scrub.whiskeyZero", !Items.byId("whiskey-bottle").meals && !Items.byId("whiskey-bottle").water && !S.isFood(Items.byId("whiskey-bottle")));
check("scrub.feedApart", Items.byId("feed-1-day").feedDays === 1 && Items.byId("feed-1-day").tags.includes("feed") && !S.isFood(Items.byId("feed-1-day")));
check("scrub.greaterLibation", (() => { const g = Items.byId("greater-healing-libation"); return g.price === 15000 && g.uses.max === 1 && g.weight === 0.5 && g.forSale; })());
const storeRows = JSON.parse(read("dm/assets/data/store-items.json")); const st = Object.fromEntries(storeRows.map((r) => [r.id, r]));
check("scrub.storeGreater", st["greater-healing-libation"] && st["greater-healing-libation"].price_es === 15000 && st["greater-healing-libation"].weight_lb === 0.5);
check("scrub.storeFood", st["bread-loaf"].price_es === 2 && st["cheese-hunk"].price_es === 10 && st["meat-chunk"].price_es === 30 && st["meat-chunk"].weight_lb === 0);
check("scrub.storeArrows", [["arrows-broadhead-5", 50, 0.25], ["arrows-blunt-5", 25, 0.25], ["arrows-fire-5", 100, 0.25], ["arrows-whistler-5", 50, 0.25], ["arrows-poison-3", 1500, 0.15]].every(([id, p, w]) => st[id] && st[id].price_es === p && st[id].weight_lb === w));
check("scrub.bookLinesPHB", st["trail-pack"].bookLine === 4554 && st["cartridges-light-20"].bookLine === 4201 && st["single-barrel-farm-shotgun"].bookLine === 3995);
check("review.C5C6.bookLines", st["hardtack-jerky-1-day"].bookLine === 4585 && st["assay-tonic-trail-draught"].bookLine === 4615 && st["pony-arms-chaosmaker-light"].bookLine === 3983 && !storeRows.some((r) => /L4526/.test(r.notes || "")));
check("scrub.provisionalCleared", ["gunsmith-s-tools", "eldorite-charm-bone-fetish-quill-case-lens-arcane-focus", "antler-eldorite-nodule-beast-charm-druidic-focus", "drum", "bugle", "tin-whistle"].every((id) => !Items.byId(id).provisional));
check("scrub.bridleNoCarry", Items.byId("bit-and-bridle").noCarry === true);
check("scrub.bundlesNotSold", ["dynamite-bundle-2", "dynamite-bundle-3", "dynamite-bundle-4"].every((id) => !Items.byId(id).forSale) && !st["dynamite-bundle-2"]);
check("scrub.docFieldsMap", (() => { const a = Items.normalize({ name: "Deer", tags: ["food"], food: { meals: 6 } }); const b = Items.normalize({ name: "Keg", tags: ["water", "container"], water: { gallons: 5 } }); const d = Items.normalize({ name: "Spring water", tags: ["water"], water: { gallons: 0.5 } }); return a.meals === 6 && b.capacity === 5 && b.water === null && d.water === 0.5 && d.capacity === null; })());
/* half meals: two breads make a day; bread + hardtack leaves half open; a DM-set deer feeds 6 days */
c = { abilities: { STR: 10 }, items: [] }; S.ensure(c);
Items.add(c, bread); Items.add(c, Items.byId("bread-loaf"));
check("half.twoBreadsOneDay", S.rations(c) === 1 && S.tick(c, { conMod: 0 }).food === "full" && S.rations(c) === 0 && c.items.length === 0, J(c.items));
c = { abilities: { STR: 10 }, items: [] }; S.ensure(c);
Items.add(c, bread); Items.add(c, ht);
t = S.tick(c, { conMod: 0 });
check("half.breadThenHardtack", t.food === "full" && c.supplies.halfOpen === true && S.rations(c) === 0.5 && !c.items.some((i) => i.catalogId === "bread-loaf"), J([t.food, c.supplies, c.items.map((i) => i.name)]));
c = { abilities: { STR: 10 }, items: [] }; S.ensure(c);
Items.add(c, Items.normalize({ id: "custom-deer", name: "Deer", type: "consumable", tags: ["food"], meals: 6, effect: { kind: "text", text: "Big game" } }), { dm: true });
Items.add(c, Items.byId("feed-1-day")); Items.add(c, Items.byId("whiskey-bottle"));
check("bigGame.dmSet", S.rations(c) === 6, String(S.rations(c)));
S.tick(c, { conMod: 0 });
check("bigGame.eatsOneMeal", S.rations(c) === 5 && c.items.some((i) => i.catalogId === "feed-1-day") && c.items.some((i) => i.catalogId === "whiskey-bottle"), String(S.rations(c)));
check("schema.containers", Items.byId("jug").capacity === 1 && Items.byId("barrel").capacity === 40 && Items.byId("flask-tin-cup").capacity === 0.125 && Items.byId("jug").defaultFill === "empty");
check("schema.normalize.keepsFields", (() => { const n = Items.normalize({ name: "Canteen of water", type: "consumable", tags: "water, drink", water: 0.5 }); return J(n.tags) === J(["water", "drink"]) && n.water === 0.5 && n.meals === null; })());
c = { abilities: { STR: 10 }, items: [] };
Items.add(c, ws); Items.add(c, Items.byId("trail-kit")); Items.add(c, ht);
check("pack.findsFoodAndWater", S.rations(c) === 11 && S.waterTotal(c) === 1, J([S.rations(c), S.waterTotal(c)]));
const w0 = Items.weightReport(c).carried;
check("pack.weightStartsAtCatalog", w0 === 5 + 59 + 2, String(w0));
S.ensure(c);
t = S.tick(c, { conMod: 0 });
check("pack.eatsLooseFoodFirst", !c.items.some((i) => i.catalogId === "hardtack-jerky-1-day") && S.rations(c) === 10, J(c.items.map((i) => [i.name, i.mealsUsed])));
check("pack.drinksFromContainers", S.waterTotal(c) === 0 && c.items.every((i) => !i.capacity || i.fill === 0), J(c.items.map((i) => i.fill)));
check("pack.weightDrops", Items.weightReport(c).carried === w0 - 2 - 8, String(Items.weightReport(c).carried));
S.tick(c, { conMod: 0 });
const kit = c.items.find((i) => i.catalogId === "trail-kit");
check("pack.mealsUsedCounts", kit.mealsUsed === 1 && S.rations(c) === 9 && Items.weightReport(c).carried === w0 - 2 - 8 - 2, J(kit));
S.giveWater(c, 3);
check("water.fillsContainersThenLoose", c.items.filter((i) => i.capacity).every((i) => i.fill === 0.5) && c.supplies.water === 2 && S.waterTotal(c) === 3, J([c.items.map((i) => i.fill), c.supplies.water]));
/* #103 Unpack: only the meals and water still in the pack come out */
kit.fill = 0.25;
const beforeUnpack = [S.rations(c), S.waterTotal(c)];
const ur = Items.unpack(c, kit.uid, { dm: true });
const htRow = c.items.find((i) => i.catalogId === "hardtack-jerky-1-day");
check("unpack.keepsMealsEaten", ur.ok && !c.items.some((i) => i.catalogId === "trail-kit") && htRow && htRow.count === 9 && S.rations(c) === beforeUnpack[0], J([beforeUnpack, S.rations(c), htRow && htRow.count]));
check("unpack.keepsWaterDrunk", S.waterTotal(c) === beforeUnpack[1], J([beforeUnpack[1], S.waterTotal(c), c.items.filter((i) => i.capacity).map((i) => [i.name, i.count, i.fill])]));
c = { abilities: { STR: 10 }, items: [] }; S.ensure(c);
Items.add(c, Items.byId("trail-kit"));
S.giveRations(c, -12);
check("pack.emptyStaysAndWeighsLess", c.items.length === 1 && S.rations(c) === 0 && c.items[0].mealsUsed === 10 && Items.weightReport(c).carried === 59 - 20, J([c.items.map((i) => [i.name, i.mealsUsed]), Items.weightReport(c).carried]));
c = { abilities: { STR: 10 }, items: [] }; S.ensure(c);
Items.add(c, Items.normalize({ id: "custom-canteen-water", name: "Canteen of water", type: "consumable", tags: ["water"], water: 0.5, effect: { kind: "text", text: "x" } }), { dm: true });
c.items[0].count = 3;
check("dmMade.drinkCounts", S.waterTotal(c) === 1.5);
S.tick(c, { conMod: 0 });
check("dmMade.drinkUsed", S.waterTotal(c) === 0.5 && c.items[0].count === 1, J(c.items));
Items.add(c, Items.normalize({ id: "custom-pemmican", name: "Pemmican brick", type: "consumable", tags: ["food"], meals: 3, effect: { kind: "text", text: "x" } }), { dm: true });
check("dmMade.foodMeals", S.rations(c) === 3);
/* old saves: tags inferred on load, weight unchanged */
const oldBag = { abilities: { STR: 10 }, items: [
  { name: "Waterskin / canteen", catalogId: "waterskin-canteen", weight: 5, count: 2 },
  { name: "Hardtack and Jerky", catalogId: "hardtack-jerky-1-day", weight: 2, count: 3 },
  { name: "Rations", weight: 2, count: 1 },
  { name: "Old canteen", weight: 5, count: 1 }
] };
const wOld = 10 + 6 + 2 + 5;
check("oldsave.inferredWeightSame", Items.weightReport(oldBag).carried === wOld, String(Items.weightReport(oldBag).carried));
check("oldsave.inferredTags", oldBag.items[0].tags.includes("container") && oldBag.items[0].fill === 1 && oldBag.items[1].tags.includes("food") && oldBag.items[2].tags.includes("food") && oldBag.items[3].capacity === 0.5, J(oldBag.items));
check("oldsave.inferredCounts", S.rations(oldBag) === 4 && S.waterTotal(oldBag) === 1.5, J([S.rations(oldBag), S.waterTotal(oldBag)]));
/* DM flows carry the fields */
const itemsSrc = read("assets/js/items.js"), joinSrc = read("assets/js/dm-join.js"), dmccSrc = read("dm/assets/js/dmcc.js");
check("dmForm.fields", ["data-item-tags", "data-item-meals", "data-item-water", "data-item-capacity"].every((k) => itemsSrc.includes(k)) && (/meals: val\("meals"\)/.test(itemsSrc) || /\["meals", "water", "capacity"\]\.forEach\(function \(k\) \{ if \(Number\(val\(k\)\) > 0\) extra\[k\]/.test(itemsSrc)) /* #107 form reads them in a loop */);
check("reward.form.fields", ["rewTags", "rewMeals", "rewWater", "rewCapacity"].every((k) => dmHtmlSrc().includes('id="' + k + '"')) && /payload\.supply = supply/.test(dmccSrc));
check("reward.route.supply", /payload\.supply && typeof payload\.supply === "object"/.test(joinSrc));
function dmHtmlSrc() { return read("dm/index.html"); }

/* party sharing (Jessey 2026-10-20) */
check("share.defaultOn", S.ensure({}).share === true && S.view({}).share === true);
check("share.oldSaveOn", S.ensure({ supplies: { water: 2 } }).share === true);
check("share.offKept", S.ensure({ supplies: { share: false } }).share === false);
let plan = S.planShare([
  { id: "a", name: "Ann", rations: 3, water: 3, share: true },
  { id: "b", name: "Bo", rations: 0, water: 0, share: false },
  { id: "c", name: "Cy", rations: 5, water: 0.5, share: false }
], {});
check("share.sharerCoversNonSharer", plan.adjust.b.rations === 1 && plan.adjust.b.water === 1, J(plan.adjust));
check("share.nonSharerNeverGives", plan.adjust.c.rations === 0 && !plan.moves.some((m) => m.from === "c" || m.from === "b"), J(plan.moves));
check("share.nonSharerCanBeCovered", plan.adjust.c.water === 0.5 && plan.adjust.a.water === -1.5 && plan.adjust.a.rations === -1, J(plan.adjust));
check("share.notSharingList", J(plan.notSharing) === J(["b", "c"]));
check("share.moveText", S.moveText(plan.moves[0]) === "Ann shared 1 ration with Bo", S.moveText(plan.moves[0]));
plan = S.planShare([{ id: "a", rations: 1, water: 1, share: true }, { id: "b", rations: 0, water: 0, share: true }], {});
check("share.keepsOwnDayFirst", plan.moves.length === 0 && plan.adjust.a.rations === 0, J(plan));
plan = S.planShare([{ id: "a", rations: 2, water: 4, share: true }, { id: "b", rations: 0, water: 0, share: true, half: true }], { hot: true });
check("share.halfRationsAndHotDay", plan.adjust.b.rations === 0.5 && plan.adjust.b.water === 2 && plan.adjust.a.water === -2, J(plan.adjust));
plan = S.planShare([{ id: "a", rations: 1.5, water: 1, share: true }, { id: "b", rations: 0, water: 0, share: true }, { id: "c", rations: 0, water: 0, share: false }], {});
check("share.limitedSurplus", plan.adjust.a.rations === -0.5 && plan.adjust.b.rations + plan.adjust.c.rations === 0.5, J(plan.adjust));

/* exhaustion math per level */
const E = (n) => Cond.exhaustionEffects(n);
check("exh.l1.checks", E(1).checkDis && !E(1).speedHalf && !E(1).saveDis);
check("exh.l2.speed", E(2).speedHalf && Cond.exhaustedSpeed(30, 2) === 15 && Cond.exhaustedSpeed(30, 1) === 30);
check("exh.l3.attacksSaves", E(3).attackDis && E(3).saveDis && !E(2).attackDis);
check("exh.l4.hpHalf", E(4).hpHalf && Cond.exhaustedHpMax(29, 4) === 14 && Cond.exhaustedHpMax(29, 3) === 29);
check("exh.l5.speed0", E(5).speedZero && Cond.exhaustedSpeed(30, 5) === 0 && Cond.exhaustedHpMax(30, 5) === 15);
check("exh.l6.death", E(6).dead && /die/.test(E(6).text));
const ex = (n) => [{ name: "Exhaustion", level: n }];
check("exh.rollMode.check", Cond.rollMode(ex(1), "check", "") === "dis" && Cond.rollMode(ex(1), "save", "") === "" && Cond.rollMode(ex(3), "save", "") === "dis");
check("exh.rollMode.advCancels", Cond.rollMode(ex(1), "check", "adv") === "");
check("exh.attackMode.l3", Cond.attackMode(ex(2), "", "") === "" && Cond.attackMode(ex(3), "", "") === "dis" && /Exhaustion 3/.test(Cond.disadvantageNote(ex(3))));
check("exh.level.fromText", Cond.exhaustionLevel(["Poisoned", "Exhaustion 4"]) === 4);
check("exh.effectText", /^Exhaustion 2: speed halved; disadvantage on ability checks\.$/.test(Cond.effectText({ name: "Exhaustion", level: 2 })), Cond.effectText({ name: "Exhaustion", level: 2 }));
check("cond.effectText.other", /Poisoned: Disadvantage on attack rolls and ability checks/.test(Cond.effectText({ name: "Poisoned" })));

/* wiring + guard rails */
const sheetHtml = read("index.html"), dmHtml = read("dm/index.html");
check("wire.sheet", sheetHtml.includes("assets/js/supplies.js") && sheetHtml.includes("assets/js/supplies-sheet.js"));
check("wire.dm", dmHtml.includes("../assets/js/supplies.js") && dmHtml.includes("assets/js/supplies-dm.js") && dmHtml.includes('id="suppliesPanel"'));
check("wire.dmjoin.command", /case "supplies":/.test(read("assets/js/dm-join.js")));
check("wire.dmSaveRequest.exhaustion", /condRollMode\("save"\) === "dis"/.test(read("assets/js/dm-join.js")));
check("wire.drawCheck.exhaustion", /condRollMode\("check"\) === "dis"\) nat = Math\.min/.test(read("assets/js/sheet-extras.js")));
check("wire.longRestHook", /SSDNSSuppliesDm\.onLongRest/.test(read("dm/assets/js/v2.js")));
check("rules.js untouched", !/daysHungry|SSDNSSupplies|exhaustionEffects/.test(read("assets/data/rules.js")));

/* ---------------------------------------------------------------- browser */
function portOpen(port) { return new Promise((r) => { const s = net.connect({ port, host: "127.0.0.1" }, () => { s.end(); r(true); }); s.on("error", () => r(false)); }); }
const port = Number(new URL(ORIGIN).port);
if (!(await portOpen(port))) { console.log("Static server is not listening on " + port + " (run via ssdns-test-all)"); process.exit(1); }
const puppeteer = (await import("/tmp/pup/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js")).default;
const browser = await puppeteer.launch({ executablePath: "/opt/google/chrome/chrome", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
try {
  const pg = await browser.newPage();
  await pg.setViewport({ width: 1300, height: 950 });
  const errs = [];
  pg.on("pageerror", (e) => errs.push(String(e)));
  await pg.goto(ORIGIN + "/index.html", { waitUntil: "domcontentloaded" });
  await pg.waitForFunction(() => window.SSDNSApp && window.SSDNSSuppliesSheet && window.SSDNSCondFx && window.SSDNSSheet && window.SSDNSConditionsUi, { timeout: 20000 });
  const r = await pg.evaluate(async () => {
    const wait = (ms) => new Promise((res) => setTimeout(res, ms));
    await wait(1200);
    document.querySelectorAll("dialog[open]").forEach((n) => { try { n.close(); } catch (e) {} });
    const A = window.SSDNSApp, SS = window.SSDNSSuppliesSheet, Sup = window.SSDNSSupplies, Sh = window.SSDNSSheet;
    const out = {};
    const c = () => A.doc().character;
    const lvl = () => window.SSDNSCondFx.level(c());
    const toasts = () => [...document.querySelectorAll("#condToast .cond-toast-card")].map((n) => n.textContent);
    const clearToasts = () => document.querySelectorAll("#condToast .cond-toast-card").forEach((n) => n.remove());
    const setExh = (n) => window.SSDNSSuppliesSheet.setExhaustion(n, "");
    A.applyPatch((d) => { const ch = d.character; ch.name = "Wade"; ch.calling = "gunslinger"; ch.level = 3; ch.abilities.CON = 14; ch.speed = 30; ch.speedAuto = false; ch.hpAuto = false; ch.hpMax = 28; ch.hpCurrent = 28; ch.activeConditions = []; ch.tableConditions = ""; ch.supplies = null; ch.items = (ch.items || []).filter((i) => !Sup.isRation(i)); });
    await wait(400);
    window.SSDNSCondFx.after(c());

    /* mode off: hidden */
    SS.command({ op: "give", mode: "off", rations: 3, water: 3 });
    out.offHidden = !document.querySelector("#suppliesBox") || document.querySelector("#suppliesBox").hidden;
    /* loose: counts + summary, no auto exhaustion, no popup */
    SS.command({ op: "mode", mode: "loose" });
    out.looseShown = !!document.querySelector("#suppliesBox:not([hidden])");
    out.readOnly = [...document.querySelectorAll("#suppliesBox button")].every((b) => b.id === "btnEat") && !!document.querySelector("#suppliesBox #btnEat") && [...document.querySelectorAll("#suppliesBox input")].every((i) => i.id === "supShare");
    const shareBox = document.querySelector("#supShare");
    out.shareDefault = !!shareBox && shareBox.checked && c().supplies.share === true;
    shareBox.checked = false; shareBox.dispatchEvent(new Event("change", { bubbles: true }));
    await wait(50);
    out.shareOff = { saved: c().supplies.share, snap: window.SSDNSDmJoin.buildSnapshot().supplies.share, box: document.querySelector("#supShare").checked };
    document.querySelector("#supShare").checked = true; document.querySelector("#supShare").dispatchEvent(new Event("change", { bubbles: true }));
    await wait(50);
    out.shareBackOn = c().supplies.share === true;
    /* DM reward with food values lands as a real tagged item; DM-made form item too */
    const rationsBefore = Sup.rations(c());
    out.rewardSupply = null;
    if (window.SSDNSDmJoin && window.SSDNSDmJoin._handle) {
      window.SSDNSDmJoin._handle({ id: "cmd_t1", type: "reward_item", payload: { text: "2x Pemmican brick", qty: 2, grantId: "g_sup_1", supply: { tags: ["food"], meals: 2 } } });
      out.rewardSupply = { rations: Sup.rations(c()) - rationsBefore, row: (c().items || []).filter((i) => /Pemmican/.test(i.name)).map((i) => [i.tags, i.meals, i.count])[0] };
    }
    /* sharing applied on the tick: what the DMCC planned arrives with the day */
    const r0 = Sup.rations(c());
    SS.command({ op: "tick", mode: "loose", adjust: { rations: 1, water: 1 }, shared: ["Ann shared 1 ration with Wade"] });
    out.adjusted = { rations: Sup.rations(c()), before: r0, ate: c().supplies.last.food, log: [...document.querySelectorAll(".log-item")].slice(0, 4).map((n) => n.textContent).join(" | ") };
    SS.command({ op: "give", mode: "loose", water: -3 });
    const lt = SS.command({ op: "tick", mode: "loose" });
    out.loose = { lvl: lvl(), gain: lt && lt.gain, popup: !!document.querySelector("dialog.supplies-save"), text: document.querySelector("#suppliesBox").textContent };
    /* strict: half water -> popup; fail -> +1 */
    SS.command({ op: "give", mode: "strict", water: 1 });
    clearToasts();
    SS.command({ op: "tick", mode: "strict", hot: false });
    out.noSaveWhenEnough = !document.querySelector("dialog.supplies-save");
    SS.command({ op: "give", mode: "strict", water: 0.5 });
    const st = SS.command({ op: "tick", mode: "strict" });
    await wait(150);
    const dlg = document.querySelector("dialog.supplies-save[open]");
    out.popup = { open: !!dlg, text: dlg && dlg.textContent, pending: !!c().supplies.pendingSave, save: st && st.save };
    c().supplies.pendingSave.rolls = [3, 3];
    document.querySelector("#supSaveBtn").click();
    await wait(1500);
    out.afterFail = { lvl: lvl(), pending: c().supplies.pendingSave, last: c().supplies.last, toasts: toasts(), dlgGone: !document.querySelector("dialog.supplies-save") };
    /* already exhausted: fail is +2 */
    clearToasts();
    SS.command({ op: "give", mode: "strict", water: 0.5 });
    SS.command({ op: "tick", mode: "strict" });
    await wait(150);
    out.gain2Text = (document.querySelector("dialog.supplies-save") || {}).textContent || "";
    c().supplies.pendingSave.rolls = [2, 2];
    document.querySelector("#supSaveBtn").click();
    await wait(1500);
    out.afterFail2 = lvl();
    /* pass: no change */
    SS.command({ op: "give", mode: "strict", water: 0.5 });
    SS.command({ op: "tick", mode: "strict" });
    await wait(150);
    c().supplies.pendingSave.rolls = [20, 20];
    document.querySelector("#supSaveBtn").click();
    await wait(1500);
    out.afterPass = { lvl: lvl(), save: c().supplies.last.save };
    /* reload safety: a pending save reopens */
    setExh(0); await wait(100);
    SS.command({ op: "give", mode: "strict", water: 0.5 });
    SS.command({ op: "tick", mode: "strict" });
    await wait(100);
    out.pendingKept = !!c().supplies.pendingSave && !!document.querySelector("dialog.supplies-save");
    c().supplies.pendingSave.rolls = [1, 1];
    SS.command({ op: "give", mode: "strict", water: 1 });
    SS.command({ op: "tick", mode: "strict" });
    await wait(100);
    out.oldSaveRolled = { lvl: lvl(), pending: c().supplies.pendingSave, dlg: !!document.querySelector("dialog.supplies-save") };
    setExh(0); await wait(100);

    /* toasts for any condition */
    clearToasts();
    window.SSDNSConditionsUi.toggle("Poisoned", 0);
    await wait(100);
    out.poisonToast = toasts().join(" | ");
    window.SSDNSConditionsUi.toggle("Poisoned", 0);
    clearToasts();
    const dmRow = window.SSDNSConditions.normalize({ name: "Exhaustion", level: 3, subjectId: "x", by: "dm-uid", byName: "DM" });
    Sh.setConditions(["Exhaustion 3"], { entries: [dmRow], quiet: true });
    await wait(100);
    out.dmToast = toasts().join(" | ");

    /* sheet math per level */
    const lastLog = () => { const n = document.querySelector(".log-item"); return n ? n.textContent : ""; };
    const g = document.querySelector("#globalAdv"); if (g) g.value = "";
    setExh(1); await wait(100);
    Sh.rollCheck("abil.STR"); await wait(50);
    out.l1check = lastLog();
    Sh.rollCheck("save.CON"); await wait(50);
    out.l1save = lastLog();
    setExh(2); await wait(150);
    out.l2 = { badge: (document.querySelector("#exhSpeed") || {}).textContent, speedStored: c().speed, eff: window.SSDNSCondFx.speed(c()) };
    setExh(3); await wait(100);
    Sh.rollCheck("save.DEX"); await wait(50);
    out.l3save = lastLog();
    out.l3attack = window.SSDNSConditions.attackMode(c().activeConditions, "", "");
    setExh(4); await wait(200);
    out.l4 = { hp: c().hpCurrent, max: c().hpMax, eff: Sh.effHpMax(28), badge: (document.querySelector("#exhHp") || {}).textContent };
    Sh.setHp(5); await wait(50);
    document.querySelector("#inHpAdjust").value = "50";
    document.querySelector("#btnHpHeal") && document.querySelector("#btnHpHeal").click();
    await wait(200);
    out.l4heal = c().hpCurrent;
    out.snap = window.SSDNSDmJoin && window.SSDNSDmJoin.buildSnapshot ? (() => { const s = window.SSDNSDmJoin.buildSnapshot(); return { hpMax: s.hpMax, hpMaxBase: s.hpMaxBase, exh: s.exhaustion, speed: s.speed, sup: !!s.supplies }; })() : null;
    setExh(5); await wait(150);
    out.l5 = { eff: window.SSDNSCondFx.speed(c()), badge: (document.querySelector("#exhSpeed") || {}).textContent };
    setExh(6); await wait(300);
    out.l6 = { hp: Number(c().hpCurrent), fails: (c().deathSaves.fail || []).filter(Boolean).length, note: (document.querySelector("#exhNote") || {}).textContent };
    setExh(0); await wait(150);
    out.cleared = { lvl: lvl(), badge: !!document.querySelector("#exhSpeed"), note: document.querySelector("#exhNote").hidden, speedStored: c().speed, maxStored: c().hpMax };
    return out;
  });
  check("mode.off.hidden", r.offHidden);
  check("mode.loose.shown+readOnly", r.looseShown && r.readOnly);
  check("reward.supply.realItem", r.rewardSupply && r.rewardSupply.rations === 4 && r.rewardSupply.row && r.rewardSupply.row[0].includes("food") && r.rewardSupply.row[1] === 2 && r.rewardSupply.row[2] === 2, J(r.rewardSupply));
  check("share.toggle.defaultOn", r.shareDefault);
  check("share.toggle.playerEditable", r.shareOff.saved === false && r.shareOff.snap === false && r.shareOff.box === false && r.shareBackOn, J(r.shareOff));
  check("share.tick.adjustApplied", r.adjusted.rations === r.adjusted.before && r.adjusted.ate === "full" && /Ann shared 1 ration with Wade/.test(r.adjusted.log), J(r.adjusted));
  check("mode.loose.noAutoExhaustion", r.loose.lvl === 0 && r.loose.gain >= 1 && !r.loose.popup && /DM decides/.test(r.loose.text), J(r.loose));
  check("save.noPopupWhenEnoughWater", r.noSaveWhenEnough);
  check("save.popup.opens", r.popup.open && r.popup.pending && /DC 15 Constitution save/.test(r.popup.text) && /Fail: \+1 exhaustion/.test(r.popup.text), J(r.popup));
  check("save.fail.+1", r.afterFail.lvl === 1 && r.afterFail.pending === null && r.afterFail.last.save === "failed" && r.afterFail.dlgGone, J(r.afterFail));
  check("save.fail.toast", r.afterFail.toasts.some((x) => /Thirst/.test(x) && /Exhaustion 1/.test(x) && /disadvantage on ability checks/.test(x)), J(r.afterFail.toasts));
  check("save.exhausted.+2.text", /\+2 exhaustion/.test(r.gain2Text), r.gain2Text);
  check("save.exhausted.fail.+2", r.afterFail2 === 3, J(r.afterFail2));
  check("save.pass.noChange", r.afterPass.lvl === 3 && r.afterPass.save === "passed", J(r.afterPass));
  check("save.pendingPersists", r.pendingKept);
  check("save.nextDayRollsOldSave", r.oldSaveRolled.lvl === 1 && r.oldSaveRolled.pending === null && !r.oldSaveRolled.dlg, J(r.oldSaveRolled));
  check("toast.anyCondition", /Poisoned/.test(r.poisonToast) && /Disadvantage on attack rolls and ability checks/.test(r.poisonToast), r.poisonToast);
  check("toast.dmExhaustion.saysWhat", /DM applied/.test(r.dmToast) && /Exhaustion 3/.test(r.dmToast) && /disadvantage on attacks and saves/.test(r.dmToast), r.dmToast);
  check("math.l1.checkDisadvantage", /2d20/.test(r.l1check) && /Exhaustion 1/.test(r.l1check), r.l1check);
  check("math.l1.saveNormal", /1d20/.test(r.l1save) && !/Exhaustion/.test(r.l1save), r.l1save);
  check("math.l2.speedHalved", r.l2.eff === 15 && Number(r.l2.speedStored) === 30 && /15 ft/.test(r.l2.badge || ""), J(r.l2));
  check("math.l3.saveDisadvantage", /2d20/.test(r.l3save) && /Exhaustion 3/.test(r.l3save), r.l3save);
  check("math.l3.attackDisadvantage", r.l3attack === "dis");
  check("math.l4.hpMaxHalved", r.l4.hp === 14 && Number(r.l4.max) === 28 && r.l4.eff === 14 && /14/.test(r.l4.badge || ""), J(r.l4));
  check("math.l4.healCapped", r.l4heal === 14, J(r.l4heal));
  check("math.l4.snapshot", r.snap && r.snap.hpMax === 14 && Number(r.snap.hpMaxBase) === 28 && r.snap.exh === 4 && r.snap.speed === 15 && r.snap.sup, J(r.snap));
  check("math.l5.speed0", r.l5.eff === 0 && /0 ft/.test(r.l5.badge || ""), J(r.l5));
  check("math.l6.death", r.l6.hp === 0 && r.l6.fails === 3 && /Dead/.test(r.l6.note), J(r.l6));
  check("math.cleared.baseUntouched", r.cleared.lvl === 0 && !r.cleared.badge && r.cleared.note && Number(r.cleared.speedStored) === 30 && Number(r.cleared.maxStored) === 28, J(r.cleared));
  check("no page errors (sheet)", !errs.length, errs.join(" | "));

  /* DMCC demo: panel, modes, end of day, give/take, skip, exhaustion through the condition path */
  const dm = await browser.newPage();
  await dm.setViewport({ width: 1300, height: 950 });
  const dmErrs = [];
  dm.on("pageerror", (e) => dmErrs.push(String(e)));
  await dm.goto(ORIGIN + "/dm/index.html?demo=1", { waitUntil: "domcontentloaded" });
  await dm.waitForFunction(() => window.DMCC && window.SSDNSSuppliesDm, { timeout: 20000 });
  await dm.evaluate(() => { localStorage.removeItem("ssdns.dm.supplies"); const b = [...document.querySelectorAll("button")].find((x) => /load demo table/i.test(x.textContent)); b && b.click(); });
  await dm.waitForFunction(() => Object.keys(window.DMCC.state.players || {}).length && window.DMCCEnhance && window.DMCCEnhance.writeSubjectConditions, { timeout: 20000 });
  const d = await dm.evaluate(async () => {
    const wait = (ms) => new Promise((res) => setTimeout(res, ms));
    await wait(800);
    const D = window.SSDNSSuppliesDm, P = window.DMCC.state.players;
    const ids = Object.keys(P);
    const out = {};
    document.querySelector("#suppliesFold").open = true;
    D.paint();
    out.hasControls = ["#btnSupEndDay", "#btnSupSkip", "#supHot", "#supDayEnd", "#btnSupGiveParty", "#btnSupTakeParty", "#btnSupClearExh"].every((s) => !!document.querySelector(s)) && document.querySelectorAll("input[name=supMode]").length === 3;
    out.offEndDisabled = document.querySelector("#btnSupEndDay").disabled;
    const cmds0 = window.DMCC.state.commands.length;
    await D.setMode("strict");
    await D.give(ids, 2, 2);
    out.sent = window.DMCC.state.commands.slice(0, ids.length * 2).every((c) => c.type === "supplies");
    out.afterGive = ids.map((id) => [P[id].snapshot.supplies.rations, P[id].snapshot.supplies.water]);
    await D.give([ids[0]], -1, 0);
    out.afterTake = P[ids[0]].snapshot.supplies.rations;
    await D.endDay({});
    out.afterDay = ids.map((id) => [P[id].snapshot.supplies.rations, P[id].snapshot.supplies.water, P[id].snapshot.supplies.day]);
    await D.skipDay();
    out.afterSkip = { day: D.config().day, rations: P[ids[1]].snapshot.supplies.rations };
    document.querySelector("#supHot").click();
    out.hot = D.config().hot;
    await D.setExhaustion({ id: ids[1], snap: P[ids[1]].snapshot }, 2);
    out.exhSet = P[ids[1]].snapshot.conditions;
    await D.setExhaustion({ id: ids[1], snap: P[ids[1]].snapshot }, 0);
    out.exhCleared = P[ids[1]].snapshot.conditions || "";
    const sel = document.querySelector("#supDayEnd"); sel.value = "rest"; sel.dispatchEvent(new Event("change", { bubbles: true }));
    out.restMode = { cfg: D.config().dayEnd, btnDisabled: document.querySelector("#btnSupEndDay").disabled };
    const before = D.config().day;
    document.querySelector("#btnLongRest").click();
    await wait(600);
    out.restTicked = D.config().day === before + 1;
    out.cmds = window.DMCC.state.commands.length - cmds0;
    /* sharing: ids[0] shares surplus, ids[1] keeps surplus (not sharing), ids[2] is short */
    sel.value = "button"; sel.dispatchEvent(new Event("change", { bubbles: true }));
    const demo = D._demo;
    const setTo = (id, r, w, share) => { const ch = demo[id]; const S2 = window.SSDNSSupplies; S2.giveRations(ch, r - S2.rations(ch)); S2.giveWater(ch, w - ch.supplies.water); ch.supplies.share = share; P[id].snapshot.supplies = S2.view(ch); };
    setTo(ids[0], 3, 3, true); setTo(ids[1], 5, 5, false); setTo(ids[2], 0, 0, true);
    if (D.config().hot) document.querySelector("#supHot").click();
    D.paint();
    out.sharesCol = [...document.querySelectorAll("#suppliesPanel td.sup-shares")].map((t) => t.textContent);
    await D.endDay({});
    const tickCmds = window.DMCC.state.commands.slice(0, ids.length).filter((c) => c.payload && c.payload.op === "tick");
    out.share = {
      after: ids.map((id) => [P[id].snapshot.supplies.rations, P[id].snapshot.supplies.water]),
      summary: (document.querySelector("#supSummary") || {}).textContent || "",
      cfg: D.config().summary,
      payloads: tickCmds.map((c) => ({ to: c.to, adjust: c.payload.adjust, shared: c.payload.shared }))
    };
    return out;
  });
  check("dm.panel.controls", d.hasControls && d.offEndDisabled, J(d));
  check("dm.give.party", d.sent && d.afterGive.every((x) => x[0] === 2 && x[1] === 2), J(d.afterGive));
  check("dm.take.player", d.afterTake === 1, J(d.afterTake));
  check("dm.endDay.ticks", d.afterDay[0][0] === 0 && d.afterDay[1][0] === 1 && d.afterDay[1][1] === 1 && d.afterDay[1][2] === 1, J(d.afterDay));
  check("dm.skipDay.noTick", d.afterSkip.day === 2 && d.afterSkip.rations === 1, J(d.afterSkip));
  check("dm.hotToggle", d.hot === true);
  check("dm.exhaustion.viaConditionPath", /Exhaustion 2/.test(d.exhSet) && !/Exhaustion/.test(d.exhCleared), J([d.exhSet, d.exhCleared]));
  check("dm.dayEnd.longRest", d.restMode.cfg === "rest" && d.restMode.btnDisabled && d.restTicked, J(d.restMode) + " " + d.restTicked);
  check("dm.shares.column", J(d.sharesCol) === J(["Yes", "No", "Yes"]), J(d.sharesCol));
  check("dm.share.coveredBySharerOnly", J(d.share.after) === J([[1, 1], [4, 4], [0, 0]]), J(d.share.after));
  check("dm.share.summaryNotSharing", /Not sharing: Caleb/.test(d.share.summary) && d.share.cfg.notSharing.length === 1 && /shared 1 ration with Mira/.test(d.share.summary), d.share.summary);
  check("dm.share.payloadAdjust", d.share.payloads.some((p) => p.adjust && p.adjust.rations === 1 && p.adjust.water === 1) && d.share.payloads.some((p) => p.adjust && p.adjust.rations === -1), J(d.share.payloads));
  check("no page errors (dmcc)", !dmErrs.length, dmErrs.join(" | "));
} finally {
  await browser.close();
}
if (failures.length) { console.log("FAILED: " + failures.join(", ")); process.exit(1); }
console.log("ALL OK");

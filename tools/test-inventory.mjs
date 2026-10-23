/**
 * Inventory build (2026-10-19): every PHB gear line is a real item with an ES price and a weight;
 * gear stacks; mounts and saddle gear don't count toward carried weight; weapon slots, armor,
 * rigs, ammo and the instrument now weigh in; store rows carry prices and weight_lb; plain words.
 *   node tools/test-inventory.mjs
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

const sandbox = { console };
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.document = { readyState: "complete", getElementById: () => null, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] };
vm.createContext(sandbox);
for (const f of ["assets/data/rules.js", "assets/data/item-catalog.js", "assets/data/item-catalog-gear.js", "assets/js/items.js"]) {
  vm.runInContext(read(f), sandbox, { filename: f });
}
const Items = sandbox.SSDNSItems;
const seeds = Items.seeds();
const ids = seeds.map((r) => r.id);
check("catalog.unique", new Set(ids).size === ids.length, ids.length + " rows");
check("catalog.grew", seeds.length >= 160, "got " + seeds.length);
check("catalog.valid", seeds.every((r) => Items.valid(Items.normalize(r))));
/* Belt lantern is a placeholder (PENDING Encounter Bot). It is not for sale and has no final price or weight. */
const pricedSeeds = seeds.filter((r) => !r.provisional);
const noWeight = pricedSeeds.filter((r) => r.weight == null || !isFinite(Number(r.weight)));
check("weights.everything", noWeight.length === 0, noWeight.map((r) => r.id).join(","));
const gear = seeds.filter((r) => r.shelf && !r.story && r.type !== "quest" && !r.provisional);
const unpriced = gear.filter((r) => !(Number(r.price) >= 0) || !r.forSale);
check("prices.gear", unpriced.length === 0, unpriced.map((r) => r.id).join(","));
const belt = seeds.find((r) => r.id === "belt-lantern");
check("belt.pending", !!belt && belt.provisional === true && belt.forSale === false && belt.price == null && belt.weight == null && belt.wear === "trinket");
const SHELVES = ["Adventuring gear", "Frontier gear", "Packs", "Tools", "Clothes", "Foci", "Instruments", "Storyteller gear", "Blasting gear", "Mounts & tack", "Special finds"];
check("shelves.known", gear.every((r) => SHELVES.includes(r.shelf)), [...new Set(gear.map((r) => r.shelf))].join("|"));
SHELVES.forEach((s) => check("shelves.has." + s, seeds.some((r) => r.shelf === s)));
/* 5E x100 spot checks */
const P = (id) => (seeds.find((r) => r.id === id) || {}).price;
const W = (id) => (seeds.find((r) => r.id === id) || {}).weight;
check("price.trail-pack", P("trail-pack") === 200 && W("trail-pack") === 5);
check("price.trail-kit", P("trail-kit") === 1000 && W("trail-kit") === 59);
check("price.riding-horse", P("riding-horse-cow-pony") === 7500);
check("price.thieves-tools", P("thieves-tools-lock-picks") === 2500 && W("thieves-tools-lock-picks") === 1);
check("price.gunsmith-tools.book", P("gunsmith-s-tools") === 2500);
check("price.ore-glass.book", P("assay-glass-magnifying-glass") === 1000);
check("price.blasting-powder.book", P("blasting-powder-1-lb") === 400 && W("blasting-powder-1-lb") === 1);
/* plain words (L0165 and #6): no assay / circuit / drover / LeMat in any item name */
const names = seeds.map((r) => r.name).join(" | ");
check("words.no-assay", !/assay/i.test(names));
check("words.no-circuit", !/circuit/i.test(names));
check("words.no-lemat", !/lemat/i.test(read("assets/data/item-catalog-gear.js")));
check("words.no-cant", !/\bcant\b/i.test(read("assets/data/item-catalog-gear.js")));

/* stacking + noCarry + slot weights */
const c = { abilities: { STR: 10 }, items: [], guns: [{ weapon: "navy-army-ball-n-cap-revolver" }], melee: [{ weapon: "bowie-shortsword" }],
  armor: "leather-jacket", shield: true, holster: "slim-jim", holsterR: "", belt: "gun-belt-cartridge-loops",
  ammo: [{ type: "cartridge", count: 20 }, { type: "buck", count: 10 }], instrument: "fiddle" };
Items.add(c, { catalogId: "torch-pitch-stick", count: 5 }, { dm: true });
Items.add(c, { catalogId: "torch-pitch-stick", count: 3 }, { dm: true });
check("stack.torches", c.items.length === 1 && c.items[0].count === 8, JSON.stringify(c.items.map((i) => i.count)));
Items.add(c, { catalogId: "trail-pack" }, { dm: true });
Items.add(c, { catalogId: "trail-pack" }, { dm: true });
check("stack.not-for-packs", c.items.filter((i) => i.catalogId === "trail-pack").length === 2);
Items.add(c, { catalogId: "riding-horse-cow-pony" }, { dm: true });
Items.add(c, { catalogId: "riding-saddle" }, { dm: true });
check("noCarry.flag", c.items.filter((i) => i.noCarry).length === 2);
check("weight.items", Items.totalWeight(c.items) === 18, String(Items.totalWeight(c.items)));
const rep = Items.weightReport(c);
check("weight.slots", rep.slots.weapons === 5 && rep.slots.armor === 16 && rep.slots.rigs === 3 && rep.slots.ammo === 2 && rep.slots.instrument === 1, JSON.stringify(rep.slots));
check("weight.total", rep.carried === 45 && rep.capacity === 150, JSON.stringify(rep));
check("weight.lbOf", Items.lbOf("2½ lb.") === 2.5 && Items.lbOf("¼ lb.") === 0.25 && Items.lbOf("—") === 0);
/* old saves: an old item row without the new fields still loads and weighs */
const old = { abilities: { STR: 10 }, items: [{ uid: "x", catalogId: "lariat-50-ft", name: "Lariat (50 ft)", type: "gear", weight: 10, count: 1, effect: { kind: "text" } }] };
check("oldsave.weight", Items.weightReport(old).carried === 10, JSON.stringify(Items.weightReport(old)));
check("oldsave.empty", Items.weightReport({ abilities: { STR: 10 } }).carried === 0);

/* store rows */
const store = JSON.parse(read("dm/assets/data/store-items.json"));
const sid = Object.fromEntries(store.map((s) => [s.id, s]));
const tbd = store.filter((s) => s.price_es == null);
check("store.no-tbd", tbd.length === 0, tbd.map((s) => s.id).join(","));
const nw = store.filter((s) => s.weight_lb == null && s.category !== "gunsmithing" && !/^svc-|repair/.test(s.id));
check("store.weights", nw.length === 0, nw.map((s) => s.id).join(","));
check("store.bolts", sid["crossbow-bolts-20"] && sid["crossbow-bolts-20"].price_es === 100 && sid["crossbow-bolts-20"].weight_lb === 1.5);
check("store.mounts", ["riding-horse-cow-pony", "mule", "riding-saddle", "saddlebags"].every((id) => sid[id] && sid[id].price_es > 0));
const gearIds = seeds.filter((r) => r.shelf && !r.story).map((r) => r.id);
const missingInStore = gearIds.filter((id) => !sid[id] && !["field-medic-kit", "hardtack-jerky-1-day", "whiskey-bottle", "fuse-cord-50-ft", "lariat-50-ft", "iron-cuffs", "caltrops-jack-nails-bag-of-20", "field-glass-spyglass", "gun-cleaning-kit", "belt-lantern"].includes(id));
check("store.covers-catalog", missingInStore.length === 0, missingInStore.join(","));
const priceClash = gearIds.filter((id) => sid[id] && Items.byId(id).price !== sid[id].price_es);
check("store.price-match", priceClash.length === 0, priceClash.join(","));

/* wiring */
const sheet = read("index.html"), dm = read("dm/index.html");
check("wire.sheet", sheet.indexOf("item-catalog.js") < sheet.indexOf("item-catalog-gear.js") && sheet.indexOf("item-catalog-gear.js") < sheet.indexOf("assets/js/items.js"));
check("wire.dm", dm.indexOf("item-catalog.js") < dm.indexOf("item-catalog-gear.js") && dm.indexOf("item-catalog-gear.js") < dm.indexOf("assets/js/items.js"));
check("wire.rules-untouched", !read("assets/data/rules.js").includes("SSDNS_CARRY_WEIGHTS"));
check("wire.store-buy", /boughtItem\(d\.character, item, plan\)/.test(read("assets/js/sheet-extras.js")));

if (failures.length) { console.error("\n" + failures.length + " failed"); process.exit(1); }
console.log("inventory ok");

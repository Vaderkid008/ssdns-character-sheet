/**
 * Paper doll v2 (2026-10-19): label plates above every slot with no overlaps, Wear toggle sync,
 * independent Holster L / R (mixed bonuses per pistol side, draw checks per side), pair-holster support, migration.
 *   node tools/test-paperdoll-v2.mjs
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { JSDOM } from "jsdom";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
function check(id, cond, detail) {
  if (!cond) failures.push(id + (detail ? " — " + detail : ""));
  console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + detail : ""));
}
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }

/* ---------- 1. Layout: each plate sits centered above its box and touches nothing else ---------- */
{
  const sb = { console }; sb.window = sb; sb.globalThis = sb;
  sb.document = { readyState: "complete", getElementById: () => null, addEventListener() {}, querySelector: () => null };
  vm.createContext(sb);
  vm.runInContext(read("assets/js/paper-doll.js"), sb);
  const D = sb.SSDNSDoll, BOX = D.BOX, BAND = D.PLATE_BAND;
  const map = JSON.parse(read("assets/images/doll/slot-map-duster-form.json"));
  check("layout.mapSynced", Object.keys(BOX).length === 25 && Object.keys(BOX).every((k) => JSON.stringify(map.slots[k]) === JSON.stringify(BOX[k])) && JSON.stringify(map.trinket_group_labels) === JSON.stringify(D.TRINKET_HEADS) && JSON.stringify(map.eldorite_counter) === JSON.stringify(D.COUNTER));
  /* Duster Form: figure baked into the frame, so there is exactly one figure (no separate silhouette layer). */
  const dh = D.html({ items: [] }, {});
  check("frame.dusterForm", D.FRAME === "frame-duster-form-1080x1350.webp" && dh.includes(D.FRAME) && fs.existsSync(path.join(root, "assets/images/doll", D.FRAME)));
  check("frame.noSilhouette", !/doll-sil|silhouette-600x1100/.test(dh) && !/frame-B6/.test(read("assets/js/paper-doll.js")));
  check("css.labelMinFont", /\.doll-cell > \.doll-label, \.doll > \.doll-group-label \{ font-size: max\(8px, 2\.1cqw\); \}/.test(read("assets/css/sheet.css")));
  /* Plate size in canvas units (1080 wide): font 2.1cqw = 22.7; Rye runs ~0.74em per glyph; padding 1em total + border. */
  const FONT = 22.7;
  const plateW = (t) => (t.length * 0.74 + 1.0) * FONT + 4;
  const plates = [];
  Object.keys(BOX).forEach((k) => {
    const t = D.LABELS[k]; if (!t) return;
    const b = BOX[k], w = plateW(t), cx = b[0] + b[2] / 2;
    plates.push({ k, t, r: [cx - w / 2, b[1] - BAND, w, BAND - 2] });
  });
  D.TRINKET_HEADS.forEach((h, i) => { const w = plateW("Trinkets"); plates.push({ k: "trinkets" + i, t: "Trinkets", r: [h[0] - w / 2, h[1] - BAND, w, BAND - 2] }); });
  const hit = (a, b) => a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];
  const bad = [];
  plates.forEach((p) => {
    Object.keys(BOX).forEach((k) => { if (k !== p.k && hit(p.r, BOX[k])) bad.push(p.t + " plate covers " + k); });
    plates.forEach((q) => { if (q !== p && q.k > p.k && hit(p.r, q.r)) bad.push(p.t + " plate touches " + q.t + " plate"); });
    if (p.r[1] < 60) bad.push(p.t + " plate runs into the frame top");
  });
  check("layout.platesClear", bad.length === 0, bad.join("; "));
  Object.keys(BOX).forEach((a) => Object.keys(BOX).forEach((b) => { if (a < b && hit(BOX[a], BOX[b])) bad.push(a + " overlaps " + b); }));
  check("layout.boxesClear", bad.length === 0, bad.join("; "));
  check("layout.trinketsShareOnePlate", Object.keys(BOX).filter((k) => /^accessory_[1-7]$/.test(k)).every((k) => !D.LABELS[k]) && D.TRINKET_HEADS.length === 2);
  const html = D.html({ items: [] }, {});
  check("layout.everyPlateAbove", (html.match(/class="doll-label"/g) || []).length === plates.length - 2 && (html.match(/doll-group-label/g) || []).length === 2);
  check("layout.noSidePlates", !/lab-(side|top|below)/.test(html) && !/lab-(side|top|below)/.test(read("assets/css/sheet.css")));
}

/* ---------- 2. Sheet in jsdom: migration, mixed L/R, pair holster, Wear toggle ---------- */
const html = read("index.html").replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
const dom = new JSDOM(html, { url: "http://127.0.0.1:18431/index.html", pretendToBeVisual: true, runScripts: "dangerously" });
const window = dom.window;
window.matchMedia = function () { return { matches: false, addEventListener() {}, removeEventListener() {} }; };
function run(rel) { vm.runInContext(read(rel), dom.getInternalVMContext(), { filename: rel }); }
run("assets/data/rules.js");
/* A fake pair holster row, present before the sheet builds its holster table. */
window.SSDNS_RULES.holsters.push({ id: "test-twin-rig", name: "Test Twin Rig", holds: "2 pistols", initBonus: 1, firstShot: 1, initText: "+1", firstShotText: "+1", perk: "Test pair.", isRig: true, holsterPair: true });
["assets/data/item-catalog.js", "assets/js/ssdns-bridge.js", "assets/js/storage.js", "assets/js/items.js", "assets/js/paper-doll.js", "assets/js/equip.js", "assets/js/app.js"].forEach(run);
await new Promise((r) => setTimeout(r, 50)); /* let DOMContentLoaded boot run (binds the Gear item list) */
const app = window.SSDNSApp, E = window.SSDNSEquip, D = window.SSDNSDoll, R = window.SSDNS_RULES;
const pistols = R.firearms.filter((g) => g.group === "pistol");

/* Migration: old single holster value. */
function load(char) {
  const doc = { format: "ssdns-character", schemaVersion: 2, id: "t" + Math.random(), character: char, shards: {} };
  app.loadText(JSON.stringify(doc), { fileName: "t.ssdns" });
  return app.state.doc.character;
}
let c = load({ name: "Old Rig", holster: "mexican-loop", guns: [{ weapon: pistols[0].id, equipped: true }] });
check("migrate.singleToL", c.holster === "mexican-loop" && c.holsterR === "" && c.belt === "");
c = load({ name: "Old Belt", holster: "gun-belt-cartridge-loops", gunBelt: false, guns: [] });
check("migrate.beltToBelt", c.holster === "" && c.holsterR === "" && c.belt === "gun-belt-cartridge-loops" && c.gunBelt === true);
c = load({ name: "Old Bandolier", holster: "bandolier", guns: [] });
check("migrate.bandolierToBelt", c.belt === "bandolier" && c.holster === "");
c = load({ name: "No Rig", guns: [] });
check("migrate.noneStaysEmpty", c.holster === "" && c.holsterR === "" && c.belt === "");
const again = JSON.parse(JSON.stringify(c)); E.migrateHolsters(again);
check("migrate.idempotent", JSON.stringify(again) === JSON.stringify(c));
check("dmJoin.sendsBothSides", /holsterR: c\.holsterR/.test(read("assets/js/dm-join.js")) && /holsterR: snap\.holsterR/.test(read("dm/assets/js/v2.js")));

/* Mixed L/R: Mexican Loop left (+1 first shot on foot), Cross-Draw right (first shot only seated/mounted). */
c = load({ name: "Mixed", abilities: { DEX: 14 }, holsterActive: true, holster: "mexican-loop", holsterR: "cross-draw-holster",
  guns: [{ weapon: pistols[0].id, equipped: true, proficient: true }, { weapon: pistols[1].id, equipped: true, proficient: true }] });
let v = app.compute();
check("mixed.sides", E.pistolSide(c, 0) === "L" && E.pistolSide(c, 1) === "R");
check("mixed.footFirstShot", v.guns[0].firstShot === 1 && v.guns[1].firstShot === 0, JSON.stringify([v.guns[0].firstShot, v.guns[1].firstShot]));
check("mixed.initBest", v.holsterInit === 1);
c.seated = true; v = app.compute();
check("mixed.seatedFirstShot", v.guns[0].firstShot === 0 && v.guns[1].firstShot === 1, JSON.stringify([v.guns[0].firstShot, v.guns[1].firstShot]));
c.seated = false;
/* Swap sides on the doll: pistol 1 into Pistol L moves the Mexican Loop bonus with it. */
c.dollWeapons = { revolver_1: 1 }; v = app.compute();
check("mixed.sideFollowsDoll", E.pistolSide(c, 1) === "L" && v.guns[1].firstShot === 1 && v.guns[0].firstShot === 0);
c.dollWeapons = {};
/* Skeleton left, Bridgeport right: each pistol gets its own side's first-shot bonus, init takes the best. */
c.holster = "skeleton-rig"; c.holsterR = "bridgeport-rig-swivel"; v = app.compute();
check("mixed.ownBonusEach", v.guns[0].firstShot === 1 && v.guns[1].firstShot === 2 && v.holsterInit === 2);
c.holsterActive = false; v = app.compute();
check("mixed.rigBoxOff", v.guns[0].firstShot === 0 && v.guns[1].firstShot === 0 && v.holsterInit === 0);
c.holsterActive = true;

/* Draw checks per side. */
c.holster = ""; c.holsterR = "";
check("draw.noHolsters", !E.drawCheck(c, 0).needed && E.drawCheck(c, 1).needed && E.drawCheck(c, 1).dc === 12 && E.drawCheck(c, 1).side === "R");
c.holster = "mexican-loop";
check("draw.leftOnly", !E.drawCheck(c, 0).needed && !E.drawCheck(c, 1).needed);
c.holster = ""; c.holsterR = "slim-jim";
check("draw.rightOnly", !E.drawCheck(c, 0).needed && !E.drawCheck(c, 1).needed);
c.holster = "saddle-scabbard"; c.holsterR = "";
check("draw.scabbardIsNoPistolHolster", !E.drawCheck(c, 0).needed && E.drawCheck(c, 1).needed);
c.holster = "mexican-loop"; c.holsterR = "cross-draw-holster";
check("draw.bothSides", !E.drawCheck(c, 0).needed && !E.drawCheck(c, 1).needed);

/* Gear pickers and doll stay in sync. */
app.applyPatch(function () {});
const selL = window.document.querySelector("#selHolster"), selR = window.document.querySelector("#selHolsterR"), selB = window.document.querySelector("#selBelt");
check("gear.twoPickers", !!selL && !!selR && !!selB && selL.value === "mexican-loop" && selR.value === "cross-draw-holster");
check("gear.beltNotInSidePickers", ![...selR.options].some((o) => o.value === "gun-belt-cartridge-loops") && [...selB.options].some((o) => o.value === "gun-belt-cartridge-loops"));
selR.value = "skeleton-rig"; selR.dispatchEvent(new window.Event("change", { bubbles: true }));
check("gear.pickerSetsR", c.holsterR === "skeleton-rig" && c.holster === "mexican-loop");
let dollHtml = D.html(c, {});
check("doll.showsBothSides", /data-doll-slot="holster_l"[^>]*title="Holster L: Mexican Loop/.test(dollHtml) && /data-doll-slot="holster_r"[^>]*title="Holster R: Skeleton Rig/.test(dollHtml));
check("doll.pickerR", /data-doll-holster="holsterR"/.test(D.pickerHtml(c, "holster_r")) && /data-doll-belt/.test(D.pickerHtml(c, "gunbelt")));

/* Pair holster (future item): fake rules row + fake item. */
E.setHolster(c, "R", "test-twin-rig");
check("pair.fillsBoth", c.holster === "test-twin-rig" && c.holsterR === "test-twin-rig");
v = app.compute();
check("pair.bonusBothPistols", v.guns[0].firstShot === 1 && v.guns[1].firstShot === 1);
dollHtml = D.html(c, {});
check("pair.dollMirrored", (dollHtml.match(/doll-pair-(l|r)/g) || []).length === 2);
E.setHolster(c, "L", "");
check("pair.unequipClearsBoth", c.holster === "" && c.holsterR === "");
E.setHolster(c, "L", "test-twin-rig"); E.setHolster(c, "R", "slim-jim");
check("pair.replaceOneSideClearsOther", c.holster === "" && c.holsterR === "slim-jim");
/* Pommel Holsters: the first real pair (flagged in equip.js, not rules.js). */
check("pommel.isPair", E.isPairHolster("pommel-holsters-pair") && !E.isPairHolster("mexican-loop") && !/holsterPair/.test(read("assets/data/rules.js")));
c.holster = "slim-jim"; c.holsterR = "skeleton-rig";
E.setHolster(c, "L", "pommel-holsters-pair");
check("pommel.fillsBoth", c.holster === "pommel-holsters-pair" && c.holsterR === "pommel-holsters-pair");
c.mounted = true; v = app.compute();
check("pommel.mountedInitBothDrawFree", v.holsterInit === 1 && !E.drawCheck(c, 0).needed && !E.drawCheck(c, 1).needed);
c.mounted = false;
check("pommel.dollMirrored", (D.html(c, {}).match(/doll-pair-(l|r)/g) || []).length === 2);
E.setHolster(c, "R", "");
check("pommel.unequipClearsBoth", c.holster === "" && c.holsterR === "");
let pm = load({ name: "Old Pommel", holster: "pommel-holsters-pair", guns: [] });
check("migrate.pommelFillsR", pm.holster === "pommel-holsters-pair" && pm.holsterR === "pommel-holsters-pair");
c = app.state.doc.character;
c = load({ name: "Mixed2", holsterActive: true, holster: "", holsterR: "", guns: [{ weapon: pistols[0].id, equipped: true }, { weapon: pistols[1].id, equipped: true }] });
/* Pair item (holsterPair on an Item, or slots: [holster_l, holster_r]). */
c.holster = "mexican-loop"; c.holsterR = "slim-jim";
c.items = [{ uid: "pp", name: "Twin Rig Item", wear: "holster", slots: ["holster_l", "holster_r"], bonuses: { init: 2 } }, { uid: "h1", name: "Plain Rig", wear: "holster" }];
let r = D.equip(c, "holster_r", "pp");
check("pairItem.fillsBoth", r.ok && D.inSlot(c, "holster_l") === c.items[0] && D.inSlot(c, "holster_r") === c.items[0] && c.holster === "" && c.holsterR === "");
check("pairItem.bonusOnce", D.bonuses(c).holsterInit === 2);
D.equip(c, "holster_r", "");
check("pairItem.unequipClearsBoth", !D.inSlot(c, "holster_l") && !D.inSlot(c, "holster_r"));

/* Wear toggle on Gear rows <-> doll. */
c.items = [
  { uid: "hat1", name: "Stetson", type: "gear", wear: "head" },
  { uid: "rg1", name: "Signet", type: "gear", wear: "ring" }, { uid: "rg2", name: "Band", type: "gear", wear: "ring" },
  { uid: "rope", name: "Rope", type: "gear", wear: "" }
];
app.applyPatch(function () {});
const rows = () => window.document.querySelector("#itemList");
check("wear.buttonsShown", rows() && rows().querySelectorAll("[data-item-wear-toggle]").length === 3, rows() ? rows().innerHTML.slice(0, 200) : "no list");
rows().querySelector('[data-item-wear-toggle="hat1"]').click();
check("wear.gearToDoll", c.items[0].equipSlot === "hat" && /title="Hat: Stetson/.test(D.html(c, {})));
check("wear.rowShowsWorn", /Worn: Hat/.test(rows().innerHTML));
rows().querySelector('[data-item-wear-toggle="rg1"]').click();
rows().querySelector('[data-item-wear-toggle="rg2"]').click();
check("wear.ringsFillBoth", c.items[1].equipSlot === "ring_1" && c.items[2].equipSlot === "ring_2");
app.applyPatch(function () { D.equip(c, "hat", ""); });
check("wear.dollToGear", !c.items[0].equipSlot && /data-item-wear-toggle="hat1"[^>]*>Wear</.test(rows().innerHTML));
rows().querySelector('[data-item-wear-toggle="rg1"]').click();
check("wear.takeOff", !c.items[1].equipSlot);

/* Worn-gear art (Art Bot set, assets/img/items/gear). */
{
  const files = new Set(fs.readdirSync(path.join(root, "assets/img/items/gear")).filter((f) => f.endsWith(".webp")).map((f) => f.replace(/\.webp$/, "")));
  check("art.47files", files.size === 47);  /* 25 + the 22 Paper Doll v2.1 engravings */
  const mapped = Object.values(D.GEAR_ART_BY_ID);
  check("art.mapFilesExist", mapped.every((f) => files.has(f)), mapped.filter((f) => !files.has(f)).join(","));
  const missing = [...R.armor.map((x) => x.id), ...R.holsters.filter((h) => h.id !== "test-twin-rig").map((h) => h.id)].filter((id) => !D.GEAR_ART_BY_ID[id]);
  check("art.everyPhbArmorHolsterMapped", missing.length === 0, missing.join(","));
  check("art.pommel", D.gearArtFile("pommel-holsters-pair", "holster_l") === "holster-pommel");
  check("art.pairItem", D.gearArtFile({ name: "Twin", wear: "holster", holsterPair: true }, "holster_r") === "holster-pair-rig");
  check("art.slotFallbacks", D.gearArtFile({ name: "Odd thing", wear: "" }, "accessory_3") === "trinket-generic" && D.gearArtFile({ name: "Band", wear: "ring" }, "ring_2") === "ring-plain" && D.gearArtFile({ name: "Topper", wear: "head" }, "hat") === "hat-cattleman");
  check("art.keywords", D.gearArtFile({ name: "Eldorite locket" }, "accessory_1") === "trinket-eldorite-locket" && D.gearArtFile({ name: "Wool cloak", wear: "cloak" }, "coat") === "coat-cloak" && D.gearArtFile({ name: "Batwing chaps", wear: "legs" }, "chaps") === "chaps-leather");  /* v2.1 r2: plain "Leather chaps" now has its own art (test-doll-v21) */
  c.armor = "heavy-leather-duster"; c.holster = "mexican-loop"; c.holsterR = "cross-draw-holster"; c.belt = "gun-belt-cartridge-loops"; c.items = [{ uid: "h", name: "Stetson", type: "gear", wear: "head", equipSlot: "hat" }];
  const h2 = D.html(c, {});
  check("art.dollUsesGearArt", /gear\/armor-heavy-leather-duster\.webp/.test(h2) && /gear\/holster-mexican-loop\.webp/.test(h2) && /gear\/holster-cross-draw\.webp/.test(h2) && /gear\/belt-gun-belt\.webp/.test(h2) && /gear\/hat-cattleman\.webp/.test(h2));
  check("art.wideBelt", /doll-wideart[^>]*data-doll-slot="gunbelt"/.test(h2));
  check("art.gearRowThumb", /gear\/hat-cattleman\.webp/.test(window.SSDNSItems.artSrc(c.items[0])));
  check("art.emptyKeepsOutline", /data-doll-slot="boots"[^>]*>[^<]*<svg class="doll-glyph"/.test(h2));
}

/* Caster guns ride in the pistol slots. */
c.guns = [{ weapon: "blacksnake", equipped: true }]; c.dollWeapons = {};
check("caster.pistolSlot", /title="Pistol L: Blacksnake/.test(D.html(c, {})));

dom.window.close();
if (failures.length) { console.error("\n" + failures.length + " failure(s)"); process.exit(1); }
console.log("paperdoll-v2 ok");

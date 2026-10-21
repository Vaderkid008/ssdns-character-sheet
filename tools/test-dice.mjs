/**
 * Sheet 0.3.54 dice art, DM-only Peace Maker, and item/instrument art.
 *   node tools/test-dice.mjs
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
function check(id, cond, detail) {
  if (!cond) failures.push(id + (detail ? " — " + detail : ""));
  console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + detail : ""));
}
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
function load(rel, name) {
  const ctx = { window: {}, globalThis: null };
  ctx.globalThis = ctx.window;
  vm.runInNewContext(read(rel), ctx, { filename: rel });
  return ctx.window[name];
}

const version = JSON.parse(read("version.json"));
check("ver.sheet", version.sheet === "0.3.97" && version.sheetBuild === "sheet-playtest-v0397");
check("ver.dmcc", version.dmcc === "0.2.110" && version.dmccBuild === "dmcc-playtest-v02110");

[4, 6, 8, 10, 12, 20, 50, 100].forEach((n) => {
  check("file.d" + n, fs.existsSync(path.join(root, "assets/img/dice", "d" + n + ".webp")));
});
check("file.bat", fs.existsSync(path.join(root, "assets/img/weapons/baseball-bat.webp")));
check("file.repeater", fs.existsSync(path.join(root, "assets/img/weapons/dullards-plinker-repeater.webp")));
check("file.peace", fs.existsSync(path.join(root, "assets/img/dm-only/the-peace-maker.webp")));
check("file.hell", fs.existsSync(path.join(root, "assets/img/dm-only/hell-maker.webp")));

const dice = load("assets/js/dice-art.js", "SSDNSDice");
const low = dice.roll(4, () => 0);
check("roll.low", low.face === 1 && low.formula === "1d4" && low.sides === 4);
const high = dice.roll(20, () => 0.99);
check("roll.high", high.face === 20 && high.formula === "1d20");
const d4line = dice.decorate("Repeater fires, 1d4+1 = 4");
check("chat.d4", d4line.includes("die-inline") && d4line.includes("d4.webp") && d4line.includes("1d4+1"));
const d20line = dice.decorate("1d20+5 = 17");
check("chat.d20", d20line.includes("d20.webp") && d20line.includes("1d20+5"));
check("chat.once", (dice.decorate(d4line).match(/die-inline/g) || []).length === 1);
const pair = dice.lead({ formula: "2d6+1", detail: "4+3+1", result: 8 }, "Repeater fires, 2d6+1 = 8");
check("chat.faces", pair.includes(">4<") && pair.includes(">3<") && pair.includes("2d6+1") && (pair.match(/die-face/g) || []).length === 2);
const face = dice.faceHtml(20, 17, 128);
check("face.num", face.includes("die-num") && face.includes(">17<") && face.includes("d20.webp") && face.includes("#4FDCCB") && face.includes("paint-order"));
const small = dice.faceHtml(100, 100, 28);
check("face.small", small.includes("die-sm") && small.includes(">100<") && small.includes("#FCFCFA"));
const barFace = dice.faceHtml(6, 6, 40);
check("face.bar", barFace.includes(">6<") && barFace.includes("#FCB92E"));
const bar = dice.barHtml();
[4, 6, 8, 10, 12, 20, 50, 100].forEach((n) => {
  check("bar." + n, bar.includes('data-die="' + n + '"'));
});
const attack = dice.lead({ attack: true, formula: "1d20+5" }, "Ada → Bandit: 12+5 = 17 → HIT");
check("attack.icon", attack.includes("die-inline") && attack.includes("d20.webp") && !attack.includes("1d20+5 ="));

const art = load("assets/js/weapon-art.js", "SSDNSWeaponArt");
check("peace.slug", art.slugFor({ id: "the-peace-maker", name: "The Peace Maker" }) === "the-peace-maker");
check("peace.hidden", art.srcFor({ id: "the-peace-maker" }) === "");
check("peace.dm", art.srcFor({ id: "the-peace-maker" }, { dm: true }).endsWith("assets/img/dm-only/the-peace-maker.webp"));
check("hell.hidden", art.srcFor({ id: "hell-maker", name: "Hell Maker" }) === "");
check("hell.dm", art.srcFor("hell-maker", { dm: true }).endsWith("assets/img/dm-only/hell-maker.webp"));
const slugs = art.slugs();
check("slugs.public", slugs.indexOf("the-peace-maker") < 0 && slugs.indexOf("hell-maker") < 0);
check("src.shortbow", art.srcFor({ id: "shortbow", name: "Shortbow" }) === "assets/img/weapons/shortbow.webp");

const items = load("assets/js/item-art.js", "SSDNSItemArt");
check("item.id", items.slugFor({ id: "assay-tonic-trail-draught", name: "Healing Libation" }) === "assay-tonic-trail-draught");
check("item.name", items.slugFor({ name: "Healing Libation" }) === "assay-tonic-trail-draught");
const inst = load("assets/js/instrument-art.js", "SSDNSInstrumentArt");
check("guitar.cheap", inst.srcFor({ id: "guitar", name: "Guitar", quality: "cheap" }).endsWith("parlor-guitar-cheap.webp"));
check("guitar.quality", inst.srcFor({ name: "Guitar", quality: "quality" }).endsWith("parlor-guitar-quality.webp"));

const peace = load("assets/js/peace-maker.js", "SSDNSPeaceMaker");
const gun = peace.weapon();
check("peace.flag", peace.placeholder === false && gun.dmOnly === true && gun.notForSale === true && gun.id === "the-peace-maker");
check("peace.note", String(gun.src).includes("act1-special-finds-tables.md"));
check("peace.lookup", peace.lookup("Peace Maker") && peace.lookup("peace-maker") && !peace.lookup("revolver"));

const store = read("dm/assets/data/store-items.json");
const rules = read("assets/data/rules.js");
const kits = read("assets/js/kits.js");
const sheet = read("index.html");
check("peace.store", !store.includes("the-peace-maker") && !store.includes("The Peace Maker"));
check("peace.rules", !rules.includes("the-peace-maker") && !rules.includes("The Peace Maker"));
check("peace.kits", !kits.includes("the-peace-maker") && !kits.includes("The Peace Maker"));
check("peace.sheet", !sheet.includes("assets/img/dm-only/"));
const v2 = read("dm/assets/js/v2.js");
const catalog = v2.slice(v2.indexOf("function catalog("), v2.indexOf("function fillCatalogCats"));
check("peace.catalog", !catalog.includes("Peace") && !catalog.includes("SSDNSPeaceMaker"));
check("peace.give", v2.includes("SSDNSPeaceMaker") && v2.includes("the-peace-maker.webp") && v2.includes("hell-maker.webp"));

["Ore Scholar's Robe", "True-Measure Ore Kit", "Night-Prospector's Cape", "Ore Buyer's Signet", "Prospector's Touch"].forEach((name) => {
  check("rename.absent." + name, !rules.includes(name) && !store.includes(name));
});

const dom = new JSDOM("<!doctype html><html><body><div id='diceBar' data-dice-bar></div><div id='diceStage' class='dice-stage' hidden></div></body></html>", { url: "http://127.0.0.1:8765/index.html", runScripts: "dangerously" });
dom.window.eval(read("assets/js/dice-art.js"));
const live = dom.window.SSDNSDice;
live.mount(dom.window.document.getElementById("diceBar"));
let posted = null;
live.onBarRoll = function (rolled) { posted = rolled; };
const btn = dom.window.document.querySelector('[data-die="4"]');
btn.click();
const stage = dom.window.document.getElementById("diceStage");
check("click.stage", stage.hidden === false && stage.querySelector(".die-num") && stage.textContent.includes("1d4 ="));
check("click.chat", posted && posted.formula === "1d4" && posted.face >= 1 && posted.face <= 4);

const html = sheet + read("dm/index.html") + read("map/chat-pop.html");
check("bar.sheet", sheet.includes('id="diceBar"') && sheet.includes("assets/js/dice-art.js"));
check("bar.dm", read("dm/index.html").includes('id="diceBar"') && read("dm/index.html").includes("assets/js/dice-art.js"));
check("bar.map", read("map/ssdns-map.js").includes("SSDNSDice.mount"));
check("focus.card", sheet.includes('id="focusPhoto"'));
check("no.png", !html.includes("art-push") && !fs.readdirSync(path.join(root, "assets/img/dice")).some((f) => f.endsWith(".png")));

if (failures.length) {
  console.error(failures.length + " failed");
  process.exit(1);
}
console.log("dice art ok");

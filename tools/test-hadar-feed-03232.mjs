/**
 * Hunger of Hadar feed dice (sheet 0.3.254 / DMCC 0.2.267).
 * The live cast posted "— = 0" plus the words "2d6", and the combat feed
 * painted an empty die for each unrolled formula. This drives the announce,
 * the public line builder, and the die painter the feed actually uses.
 *
 *   node tools/test-hadar-feed-03232.mjs
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

const version = JSON.parse(read("version.json"));
check("ver.sheet", version.sheet === "0.3.254" && version.sheetBuild === "sheet-playtest-v03254");
check("ver.dmcc", version.dmcc === "0.2.267" && version.dmccBuild === "dmcc-playtest-v02267");

const context = { console, Math, Date, JSON, parseInt, isFinite, Number, String, Object, Array, RegExp };
context.window = context;
context.globalThis = context;
vm.createContext(context);
["assets/data/rules.js", "assets/js/spell-fx.js", "assets/js/spell-area.js", "assets/js/spell-riders.js", "assets/js/spell-cast.js", "assets/js/spell-zones.js", "assets/js/dice-art.js"].forEach((rel) => {
  vm.runInContext(read(rel), context, { filename: rel });
});
const Cast = context.SSDNSSpellCast;
const Z = context.SSDNSSpellZones;
const R = context.SSDNSSpellRiders;
const Dice = context.SSDNSDice;

const cast = Cast.rollCast({ spellName: "Hunger of Hadar", slotLevel: 3, dc: 15 });
const announced = Cast.hadarAnnounce("TEST All-Spells (catalog 85)", ["Jasper \"Iron Fist\"", "Hargrove"]);
const feed = Cast.feedLine({
  label: cast.label,
  formula: "—",
  result: 0,
  plain: true,
  detail: announced
});
check("cast.plain", cast.plain === true && cast.formula === "" && cast.result == null && !/\d*d\d+/.test(cast.text), cast.text);
check("cast.feed", feed === announced && !/=\s*0/.test(feed) && !/—/.test(feed) && !/\d*d\d+/.test(feed), feed);
const castHtml = Dice.lead({ formula: "—", text: feed, detail: feed }, feed);
check("cast.noEmptyDie", castHtml.indexOf("die-face") < 0, castHtml.slice(0, 180));

const old = "Hunger of Hadar — = 0 (casts Hunger of Hadar · 2d6 cold at the start of each turn inside, Dexterity save or 2d6 acid at the end)";
const oldHtml = Dice.lead({ formula: "—", text: old }, old);
const oldFaces = (oldHtml.match(/<text[^>]*>(\d+)<\/text>/g) || []);
check("old.blank", oldHtml.indexOf("die-face") >= 0 && oldFaces.length === 0, oldHtml.replace(/<[^>]+>/g, " ").slice(0, 160));

const rolled = R.rollExpr("2d6", false);
const cold = Cast.hadarTickLine("Hargrove", rolled.formula, rolled.faces, rolled.total, "cold");
const coldHtml = Dice.lead({ formula: "2d6", rolls: rolled.faces, text: cold, detail: cold }, cold);
const coldNums = (coldHtml.match(/<text[^>]*>(\d+)<\/text>/g) || []).map((s) => Number(s.replace(/<[^>]+>/g, "")));
check("cold.numbers", rolled.faces.length === 2 && coldNums.length === 2 && coldNums[0] === rolled.faces[0] && coldNums[1] === rolled.faces[1] && cold.indexOf("«" + rolled.faces[0] + "»") >= 0, cold + " html " + coldNums.join(","));

const zone = Z.buildZone("Hunger of Hadar", { origin: { x: 10, y: 10 }, area: { shape: "sphere", radius: 20 } }, { slot: 3, casterId: "ada", dc: 15, id: "z1" });
const inside = { id: "mob", name: "Hargrove", x: 10, y: 10, size: 1, kind: "enemy" };
const start = Z.phaseDue({ zones: [zone] }, inside, "start")[0];
const end = Z.phaseDue({ zones: [zone] }, inside, "end")[0];
const startLine = Cast.hadarTickLine(inside.name, start.formula, start.faces, start.amount, "cold");
const startHtml = Dice.lead({ formula: start.formula, rolls: start.faces, text: startLine }, startLine);
const startNums = (startHtml.match(/<text[^>]*>(\d+)<\/text>/g) || []).map((s) => Number(s.replace(/<[^>]+>/g, "")));
check("start.hp", start.auto === true && start.amount >= 2 && start.amount <= 12 && startNums.join(",") === start.faces.join(","), startLine);
check("end.save", end.save === "DEX" && end.half === false && end.dice === "2d6" && !end.auto && end.dc === 15);

const acid = R.rollExpr("2d6", false);
const acidLine = Cast.hadarTickLine("Jasper", acid.formula, acid.faces, acid.total, "acid");
const acidHtml = Dice.lead({ formula: "2d6", rolls: acid.faces, text: acidLine }, acidLine);
const acidNums = (acidHtml.match(/<text[^>]*>(\d+)<\/text>/g) || []).map((s) => Number(s.replace(/<[^>]+>/g, "")));
check("acid.numbers", acidNums.join(",") === acid.faces.join(",") && acid.total >= 2 && acid.total <= 12, acidLine);

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\nhadar feed ok");

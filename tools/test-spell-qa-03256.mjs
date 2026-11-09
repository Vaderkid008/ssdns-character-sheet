/**
 * Spell QA: Flaming Sphere cast log and the blank-die class
 * (sheet 0.3.262 / DMCC 0.2.275).
 *   node tools/test-spell-qa-03256.mjs
 * rules.js is not regenerated.
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

const ver = JSON.parse(read("version.json"));
check("ver", ver.sheet === "0.3.262" && ver.dmcc === "0.2.275" && ver.sheetBuild === "sheet-playtest-v03262" && ver.dmccBuild === "dmcc-playtest-v02275");
check("rules.clean", !read("assets/data/rules.js").includes("0.3.262") && !read("database.rules.json").includes("0.3.262"));
check("bestiary.kept", read("dm/assets/js/v2.js").includes("bestiary.json?v=0.2.249-spell-tokens"));

const context = { console, Math, Date, JSON, parseInt, isFinite, Number, String, Object, Array, Promise, RegExp };
context.window = context;
context.globalThis = context;
vm.createContext(context);
["assets/data/rules.js", "assets/data/spell-cast-admit.js", "assets/js/spell-area.js", "assets/js/spell-zones.js", "assets/js/spell-riders.js", "assets/js/spell-cast.js", "assets/js/dice-art.js"].forEach((rel) => {
  vm.runInContext(read(rel), context, { filename: rel });
});
const Cast = context.SSDNSSpellCast;
const Z = context.SSDNSSpellZones;
const Dice = context.SSDNSDice;

const row = Cast.lookup("Flaming Sphere");
check("sphere.row", row.kind === "save" && row.save === "DEX" && row.dice === "2d6" && row.half === true && row.castDamage === false && !row.onFail && row.createToken === true);
const rolled = Cast.rollCast({ spellName: "Flaming Sphere", slotLevel: 2, dc: 20, characterLevel: 5 });
check("sphere.text", /5-foot-diameter sphere/.test(rolled.text) && /within 5 feet/.test(rolled.text) && /half on a success/.test(rolled.text) && /no damage on the cast/.test(rolled.text), rolled.text);
check("sphere.notTangled", !/no damage now/.test(rolled.text) && !/condition only/.test(rolled.text) && !/\d+d\d+/.test(rolled.text), rolled.text);
check("sphere.noBlankDie", rolled.zoneHold === true && rolled.plain === true && rolled.formula === "" && rolled.damageTotal === 0 && rolled.applyNow === false);
const castHtml = Dice.lead({ formula: rolled.formula, text: rolled.text, detail: rolled.text, plain: true }, rolled.text);
check("sphere.castFace", castHtml.indexOf("die-face") < 0, castHtml.slice(0, 180));

const zone = Z.buildZone("Flaming Sphere", { origin: { x: 4, y: 4 } }, { slot: 2, casterId: "ada", dc: 14, id: "sphere-1" });
check("sphere.place", zone && zone.label === "5-foot-diameter sphere" && zone.createToken === true && zone.radius === 5 && zone.ticks[0].dice === "2d6" && zone.ticks[0].save === "DEX" && zone.ticks[0].half === true && zone.ticks[0].near === 5 && !zone.ticks[0].onFail);
const endNear = Z.phaseDue({ zones: [zone] }, { id: "foe", x: 5, y: 4, size: 1, name: "Bandit" }, "end");
check("sphere.end", endNear.length === 1 && endNear[0].save === "DEX" && endNear[0].half === true && !endNear[0].onFail);
const ramLine = Cast.hadarTickLine("Bandit", "2d6", [4, 5], 9, "fire");
const ramHtml = Dice.lead({ formula: "2d6", text: ramLine, detail: ramLine, faces: [4, 5], rolls: [4, 5] }, ramLine);
check("sphere.ramFaces", ramHtml.indexOf(">4<") >= 0 && ramHtml.indexOf(">5<") >= 0, ramHtml.slice(0, 240));

const phant = Cast.rollCast({ spellName: "Phantasmal Killer", slotLevel: 4, dc: 15 });
check("phant.kept", phant && phant.applyNow === false && phant.condition === "Frightened" && /no damage now/.test(phant.text) && !/\d+d\d+/.test(phant.text), phant && phant.text);
check("looks.kept", read("map/ssdns-map-fx.js").includes('if (/flaming sphere/.test(spellName))') && read("map/ssdns-map.js").includes("A 0×0 read during fullscreen must not replace it."));

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\nspell qa ok");

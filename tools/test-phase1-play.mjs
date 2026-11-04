/**
 * Phase 1 play fixes (sheet 0.3.229 / DMCC 0.2.242).
 * Contagion commits Poisoned plus a DC'd end save, three failures keep the disease
 * (Blinding Sickness also applies Blinded), Disintegrate's remove goes through the
 * map host, adjacent Medium squares are 5 ft touch, and Hunger of Hadar does not
 * print an unrolled 2d6.
 *   node tools/test-phase1-play.mjs
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
check("ver.sheet", version.sheet === "0.3.229" && version.sheetBuild === "sheet-playtest-v03229");
check("ver.dmcc", version.dmcc === "0.2.242" && version.dmccBuild === "dmcc-playtest-v02242");

const context = { console, Math, Date, JSON, parseInt, isFinite, Number, String, Object, Array };
context.window = context;
context.globalThis = context;
vm.createContext(context);
["assets/data/rules.js", "assets/js/spell-fx.js", "assets/js/spell-area.js", "assets/js/spell-riders.js", "assets/js/spell-cast.js", "assets/js/spell-zones.js"].forEach((rel) => {
  vm.runInContext(read(rel), context, { filename: rel });
});
const R = context.SSDNSSpellRiders;
const Cast = context.SSDNSSpellCast;
const Area = context.SSDNSSpellArea;
const Z = context.SSDNSSpellZones;

const row = Cast.lookup("Contagion");
const landed = R.landResolved(null, {
  row: row, name: "Contagion", targetId: "mob", hit: true, disease: "Blinding Sickness", dc: 15
});
const tick = (landed.bag.ticks || []).filter((t) => t && t.contagion)[0];
check("contagion.dc", !!(tick && tick.dc === 15 && tick.save === "CON" && tick.when === "end"), JSON.stringify(tick));
check("contagion.poison", landed.chips.some((c) => c.name === "Poisoned"));
let sick = landed.bag;
let last = null;
for (let i = 0; i < 3; i++) {
  const live = (sick.ticks || []).filter((t) => t && t.contagion)[0];
  last = R.settleTick(sick, live, { failed: true });
  sick = last.bag;
}
check("contagion.disease", last.chips.some((c) => c.name === "Diseased: Blinding Sickness (7 days)"), (last.logs || []).join(" | "));
check("contagion.blind", last.chips.some((c) => c.name === "Blinded"));
check("contagion.tickdone", !sick.ticks.some((t) => t && t.contagion));
const kept = R.landResolved(landed.bag, { row: row, name: "Contagion", targetId: "mob", hit: true, disease: "Blinding Sickness" });
check("contagion.once", kept.changed === false);

check("touch.adj", Area.touchBlock(5, "touch") === "" && Area.rangeBlock(5, "touch") === "");
check("touch.far", Area.touchBlock(10, "touch") === "Out of reach.");
check("touch.center", Area.touchBlock(0, "touch") === "");

const hadar = Cast.rollCast({ spellName: "Hunger of Hadar", slotLevel: 3, dc: 15 });
check("hadar.text", hadar.applyNow === false && !/\d+d\d+/.test(hadar.text) && /cold on each creature/.test(hadar.text) && /none of the acid/.test(hadar.text), hadar.text);
const spec = Z.specOf("Hunger of Hadar");
check("hadar.ticks", !!(spec && spec.ticks.some((t) => t.when === "start" && t.dice === "2d6" && t.type === "cold" && !t.save) && spec.ticks.some((t) => t.when === "end" && t.save === "DEX" && t.half === false)));

const dm = read("dm/assets/js/v2.js");
const host = read("map/ssdns-map-host.js");
const map = read("map/ssdns-map.js");
const sheet = read("assets/js/sheet-extras.js");
const join = read("assets/js/dm-join.js");
check("dust.host", host.includes("dropTokenKeepRow: dropTokenKeepRow") && map.includes("dropTokenKeepRow: function"));
check("dust.call", dm.includes("host.dropTokenKeepRow(id)") && dm.includes("liveMapTokenId"));
check("reach.floor", map.includes("Math.floor(Number(a.pos.x)") && map.includes("t.id === id"));
check("reach.live", dm.includes("function rowTokenId") && dm.includes("rowTokenId(aRow)"));
check("hadar.open", dm.includes("function openHadarCold") && sheet.includes("function openHadarCold") && dm.includes("facedDice"));
check("hadar.faces", dm.includes("«") && sheet.includes("«"));
check("attack.dc", join.includes("row.dc = Number(entry.dc)"));
check("contagion.dm", dm.includes("pickedDisease") && dm.includes("cardDisease"));

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\nphase 1 play ok");

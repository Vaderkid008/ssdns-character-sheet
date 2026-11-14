/**
 * Rest clears concentration. DM zone size footprints (sheet 0.3.308 / DMCC 0.2.321).
 *   node tools/test-rest-zones-03291.mjs
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
check("ver", ver.sheet === "0.3.308" && ver.dmcc === "0.2.321");
check("rules.clean", !read("assets/data/rules.js").includes("sizeFootprint") && !read("database.rules.json").includes("end_conc"));

const sheet = read("assets/js/sheet-extras.js");
const restAt = sheet.indexOf("function applyRest");
const restBody = sheet.slice(restAt, sheet.indexOf("function endConcentration", restAt));
check("rest.clears", restBody.includes('endConcentration(kind === "long" ? "long rest" : "short rest")'));
check("end.fn", sheet.includes("function endConcentration") && sheet.includes("endConcentration: endConcentration"));
check("cmd", read("assets/js/dm-join.js").includes('case "end_conc"'));
const map = read("map/ssdns-map.js");
check("btn.player", map.includes('data-act="endConc"'));
check("btn.dm", map.includes('data-act="dmEndConc"'));
check("size.ui", map.includes('data-act="zoneSize"') && map.includes("1×1") && map.includes("Spell default"));
check("size.apply", map.includes("Z.sizeFootprint"));
check("art.grid", read("map/zone-art.js").includes("zone.gridBox"));

const sb = { console, Math, Date, JSON, Number, String, Object, Array, RegExp, parseInt, isFinite };
sb.window = sb; sb.globalThis = sb;
vm.createContext(sb);
vm.runInContext(read("assets/js/spell-riders.js"), sb);
vm.runInContext(read("assets/js/spell-zones.js"), sb);
const R = sb.SSDNSSpellRiders;
const Z = sb.SSDNSSpellZones;
const bag = {
  conc: "Sunbeam",
  marks: [],
  zones: [{ id: "z1", spell: "Sunbeam", key: "sunbeam", conc: true, casterId: "ada" }],
  ticks: [{ spell: "Sunbeam", conc: true }]
};
const ended = R.breakConc(bag, "Sunbeam");
check("break.conc", !ended.bag.conc && !(ended.bag.zones || []).some((z) => z && z.conc) && (ended.bag.ticks || []).every((t) => !t.conc), JSON.stringify(ended.bag));

const built = Z.buildZone("Grease", { origin: { x: 3, y: 4 }, facing: 0 }, { casterId: "ada", casterName: "Ada" });
check("size.default", Z.sizeFootprint(built, "spell") === built && !built.gridBox);
[1, 2, 4].forEach((n) => {
  const sized = Z.sizeFootprint(built, String(n));
  check("size." + n, sized.gridBox && sized.squares === n && sized.footprint === n && sized.shape === "square" && sized.side === n * 5, JSON.stringify(sized));
});

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\nrest zones ok");
process.exit(0);

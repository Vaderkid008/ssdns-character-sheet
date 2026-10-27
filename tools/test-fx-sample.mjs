/**
 * Map attack FX sample page (sheet 0.3.131 / DMCC 0.2.144).
 * A frozen review of the live painters: revolver, buckshot, hidden shooter, arrow, melee, and the Effects toggle.
 *   node tools/test-fx-sample.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
function check(id, cond, detail) {
  if (!cond) failures.push(id + (detail ? " — " + detail : ""));
  console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + detail : ""));
}
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }

const page = read("map/fx-sample.html");
const fx = read("map/ssdns-map-fx.js");
const rules = read("database.rules.json");
const rulesJs = read("assets/data/rules.js");

["gun", "buck", "hidden", "arrow", "blade"].forEach((id) => {
  check("page." + id, page.includes('data-fx="' + id + '"') || page.includes("id: \"" + id + "\""));
});
check("page.paint", page.includes("FX.paint(") && page.includes("srcHidden") && page.includes('data-act="fxBtn"'));
check("page.toggle", page.includes("FX.setEnabled(!FX.enabled())") && page.includes("FX.enabled()"));
check("page.hiddenNoMuzzle", page.includes("hidden: true") && fx.includes("if (g.srcHidden) edgeGlow"));
check("src.rulesUntouched", !rules.includes("fx-sample") && !rulesJs.includes("0.3.158") && !rules.includes('"fx"'));
check("src.muzzleHolds", /clamp\(lt \/ 200\)/.test(fx));

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("fx sample ok");

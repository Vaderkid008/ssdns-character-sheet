/* After a targeted attack, the picker stays on that creature. Free shot is
   still a choice, and a creature that has left the list falls back to it.
   node tools/test-keep-last-target-03241.mjs
*/
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
function check(id, cond, detail) {
  if (!cond) failures.push(id + (detail ? " — " + detail : ""));
  console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + detail : ""));
}
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }

const version = JSON.parse(read("version.json"));
check("ver.sheet", version.sheet === "0.3.307" && version.sheetBuild === "sheet-playtest-v03307");
check("ver.dmcc", version.dmcc === "0.2.320" && version.dmccBuild === "dmcc-playtest-v02320");
const rulesDiff = execSync("git diff --name-only -- assets/data/rules.js database.rules.json", { cwd: root }).toString().trim();
check("rules.untouched", rulesDiff === "", rulesDiff);

const host = { console, Math, Number, String, Object, Array };
host.window = host;
host.globalThis = host;
vm.createContext(host);
vm.runInContext(read("assets/js/turn-rules.js"), host, { filename: "turn-rules.js" });
const choose = host.SSDNSTurn.chooseTarget;
const ids = ["en1", "en2"];

check("stick.creature", choose("en1", "", ids).value === "en1");
check("stick.afterRedraw", choose("__free", "en1", ids).value === "en1" && choose("", "en1", ids).value === "en1");
check("stick.freeChosen", choose("__free", "", ids).value === "__free");
check("stick.blankChosen", choose("", "", ids).value === "");
check("stick.gone", choose("en9", "", ids).value === "__free" && choose("en9", "en9", ids).sticky === "");
check("stick.switch", choose("en2", "en1", ids).value === "en2");

const sheet = read("assets/js/sheet-playtest.js");
check("sheet.uses", sheet.includes("SSDNSTurn.chooseTarget") && sheet.includes("stickyAim"));
const map = read("map/ssdns-map.js");
check("map.uses", map.includes("function settleAim") && map.includes("state.lastAimId"));
const v2 = read("dm/assets/js/v2.js");
check("dm.dialog", v2.includes("if (targetSel && def) targetSel.value = def"));

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\nkeep last target ok");

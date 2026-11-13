/**
 * Map chrome tabs stay inside the parchment frame
 * (sheet 0.3.305 / DMCC 0.2.318).
 *   node tools/test-map-chrome-tabs-03254.mjs
 * rules.js is not regenerated.
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

const sheet = read("assets/css/sheet.css");
const dock = sheet.slice(sheet.indexOf("@media (min-width: 801px) {"));
const tabRule = dock.slice(dock.indexOf("body:not(.sheet-dock-collapsed) .tabs {"), dock.indexOf("body:not(.sheet-dock-collapsed) .tabs {") + 500);
check("sheet.tabs.shareFrame", tabRule.includes("min(1200px, calc(100% - 300px - 24px))") && tabRule.includes("margin-right: auto") && tabRule.includes("overflow-x: auto"));
check("sheet.tabs.kept", read("index.html").includes(">Main<") && read("index.html").includes(">Gear<") && read("index.html").includes(">Conditions<") && read("index.html").includes(">Map<") && read("index.html").includes(">Log<"));

const dm = read("dm/assets/css/dmcc.css");
const mapTab = dm.slice(dm.indexOf("body.in-room.map-tab-active .tabs {"), dm.indexOf("body.in-room.map-tab-active .tabs {") + 280);
check("dm.tabs.inFrame", mapTab.includes("max-width: 100%") && mapTab.includes("overflow-x: auto") && mapTab.includes("margin-left: 0"));
check("dm.tabs.kept", read("dm/index.html").includes(">Fight<") && read("dm/index.html").includes(">Map<") && read("dm/index.html").includes(">Ledger (economy)<"));

const map = read("map/ssdns-map.css");
check("map.contained", map.includes("min-width: 0") && map.includes("max-width: 100%"));
const strip = map.slice(map.indexOf("\n.ssm-turnstrip {"), map.indexOf("\n.ssm-turnstrip {") + 500);
check("strip.contained", strip.includes("min-width: 0") && strip.includes("overflow: hidden") && strip.includes("max-width: 100%"));
check("playerStrip.contained", map.includes(".ssdns-map > .ssm-turnhost { grid-area: strip; position: relative; z-index: 4; min-width: 0; max-width: 100%; overflow-x: auto; }"));
check("fullscreen.guard", read("map/ssdns-map.js").includes("A 0×0 read during fullscreen must not replace it."));

const ver = JSON.parse(read("version.json"));
check("ver", ver.sheet === "0.3.305" && ver.dmcc === "0.2.318" && ver.sheetBuild === "sheet-playtest-v03305" && ver.dmccBuild === "dmcc-playtest-v02318");
check("rules.clean", !read("assets/data/rules.js").includes("0.3.305") && !read("database.rules.json").includes("0.3.305"));
check("bestiary.kept", read("dm/assets/js/v2.js").includes("bestiary.json?v=0.2.249-spell-tokens"));

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\nmap chrome tabs ok");

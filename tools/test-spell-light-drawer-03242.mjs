/* Player drawer LIGHT toggles for spell glows. Off marks the light out.
   On restores it while the spell is still up. rules.js is not edited.
   node tools/test-spell-light-drawer-03242.mjs
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
check("ver.sheet", version.sheet === "0.3.296" && version.sheetBuild === "sheet-playtest-v03296");
check("ver.dmcc", version.dmcc === "0.2.309" && version.dmccBuild === "dmcc-playtest-v02309");
const rulesDiff = execSync("git diff --name-only -- assets/data/rules.js database.rules.json", { cwd: root }).toString().trim();
check("rules.untouched", rulesDiff === "", rulesDiff);

const map = read("map/ssdns-map.js");
check("drawer.slot", map.includes('data-act="playerSpellLights"') && map.includes('data-act="spellLight"'));
check("drawer.toggle", map.includes("function togglePlayerSpellLight") && map.includes("setSpellGlow") && map.includes("douseEmitterId") && map.includes("ssdns-light-dismiss") && map.includes("syncOwnerLights()"));
check("map.skipsOut", map.includes("t.lights.filter(l => l && !l.out)"));

const host = { console, Math, Number, String, Object, Array, Date };
host.window = host;
host.globalThis = host;
vm.createContext(host);
vm.runInContext(read("assets/js/lighting.js"), host, { filename: "lighting.js" });
const L = host.SSDNSLighting;
const names = ["Produce Flame", "Flame Blade", "Fire Shield", "Sunbeam"];
const keys = ["spell:produce-flame", "spell:flame-blade", "spell:fire-shield", "spell:sunbeam"];
const c = {
  cantrips: ["Produce Flame"],
  spells: {
    2: [{ name: "Flame Blade", prepared: true }],
    4: [{ name: "Fire Shield", prepared: true }],
    6: [{ name: "Sunbeam", prepared: true }]
  },
  items: [],
  lightOn: {}
};
keys.forEach(k => { c.lightOn[k] = true; });

const shown = L.drawerSpellRows(c).map(r => r.name);
names.forEach(n => check("list." + n, shown.indexOf(n) >= 0, shown.join(",")));
check("list.on", L.drawerSpellRows(c).every(r => r.off === false));

function light(name) {
  return (L.spellLights(c) || []).filter(l => l && l.name === name)[0];
}
names.forEach(n => check("shine." + n, light(n) && light(n).out === false));

keys.forEach(k => check("off." + k, L.setSpellGlow(c, k, true) === true));
check("profile.out", L.tokenProfile(c).lights.filter(l => names.indexOf(l.name) >= 0).every(l => l.out === true));
check("drawer.off", L.drawerSpellRows(c).every(r => r.off === true && names.indexOf(r.name) >= 0));
check("stillUp", keys.every(k => c.lightOn[k] === true));

keys.forEach(k => L.setSpellGlow(c, k, false));
check("profile.on", L.tokenProfile(c).lights.filter(l => names.indexOf(l.name) >= 0).every(l => l.out === false));
check("drawer.on", L.drawerSpellRows(c).every(r => r.off === false));
check("noInvent", L.setSpellGlow(c, "spell:not-a-spell", true) === false);

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\nspell light drawer ok");

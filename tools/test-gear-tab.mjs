/**
 * Sheet 0.3.30 Gear tab layout. DMCC 0.2.43.
 *   node tools/test-gear-tab.mjs
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

const html = read("index.html");
const equip = html.slice(html.indexOf('id="page-equip"'), html.indexOf('id="page-cond"'));
const main = html.slice(html.indexOf('id="page-main"'), html.indexOf('id="page-equip"'));
const app = read("assets/js/app.js");
const play = read("assets/js/sheet-playtest.js");
const css = read("assets/css/sheet.css");
const version = JSON.parse(read("version.json"));

check("ver.sheet", version.sheet === "0.3.30" && version.sheetBuild === "sheet-playtest-v0330");
check("ver.dmcc", version.dmcc === "0.2.43" && version.dmccBuild === "dmcc-playtest-v0243");
check("ver.app", app.includes('APP_VERSION = "0.3.30"'));
check("target.banner", equip.includes('id="gearTarget"') && equip.includes("gear-bullseye") && equip.includes('id="gearTargetSlot"'));
check("target.mount", play.includes('id=\'atkTarget\'') && play.includes('$("#gearTargetSlot")'));
check("columns", equip.includes("gear-weapons") && equip.includes("gear-kit") && css.includes(".gear-columns"));
check("armor.right", equip.indexOf('id="selArmor"') > equip.indexOf("gear-kit") && equip.indexOf("Shield") > equip.indexOf("gear-kit"));
check("armor.leftMain", !main.includes('id="selArmor"'));
check("order.kit", equip.indexOf(">Armor<") < equip.indexOf(">Ammo<") && equip.indexOf(">Ammo<") < equip.indexOf(">Holster<") && equip.indexOf(">Holster<") < equip.indexOf('id="taAttackNotes"'));
check("weapons.left", equip.indexOf('id="guns"') < equip.indexOf('id="explosiveList"') && equip.indexOf('id="explosiveList"') < equip.indexOf("gear-kit"));
check("card.ammo", app.includes('data-ammopool') && app.includes("function chosenAmmoPool") && app.includes("reloadFromPool(i, picked, max)"));
check("card.roll", app.includes('data-gunroll') && app.includes('data-tr') && app.includes('data-hexload') && app.includes('data-cast'));
check("card.photo", app.includes("g-photo") && css.includes(".g-photo"));
check("melee.card", play.includes("data-melee-roll") && play.includes("data-melee-rng") && play.includes("Melee, bow, or thrown"));
check("phone", css.includes("max-width: 760px") && css.includes(".gear-columns { grid-template-columns: 1fr; }"));
check("attack.shared", play.includes("rollMeleeNow") && app.includes("function reload("));

if (failures.length) {
  console.error(failures.length + " failed");
  process.exit(1);
}
console.log("gear tab ok");

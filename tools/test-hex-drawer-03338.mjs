/**
 * Hexslinger Caster Gun drawer uses the cleaned card (sheet 0.3.339 / DMCC 0.2.352).
 *   node tools/test-hex-drawer-03338.mjs
 * rules.js is not edited. Hex load, cast, dry fire, reload, and TR keep their actions.
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

const ver = JSON.parse(read("version.json"));
check("ver", ver.sheet === "0.3.339" && ver.dmcc === "0.2.352" && ver.sheetBuild === "sheet-playtest-v03339" && ver.dmccBuild === "dmcc-playtest-v02352");
check("rules.clean", !read("assets/data/rules.js").includes("0.3.339") && !read("database.rules.json").includes("0.3.339"));

const map = read("map/ssdns-map.js");
const css = read("map/ssdns-map.css");
const skins = read("assets/js/cast-skins.js");
const hex = map.slice(map.indexOf("function n62HexCard"), map.indexOf("function n62SwitchHtml"));
check("hex.card", hex.includes("n62-hexcard") && hex.includes("n62WartHtml") && hex.includes("n62-hexrow"));
check("hex.actions", hex.includes("playerGunButtons(gun, { skipHex: true })") && hex.includes("hexCastControl") && hex.includes("dry fire"));
check("hex.help", hex.includes("n62-help") && !hex.includes("Cylinder stays on the gun") && !hex.includes("n62-cylhost") && !hex.includes("The only gun"));
check("hex.notarget", !hex.includes("cylTarget") && !hex.includes("n62-aim"));
check("hex.paint", map.includes("n62PaintWarts(slot)") && map.includes("mode === 'gun'"));
check("phone.hex", css.includes(".chamber-dot.full.hex") && css.includes("#7fe0d2") && css.includes("max-width: 719px"));
check("dots.hex", map.includes("function chamberIsHex") && map.includes("typeof raw !== 'string'") && map.includes("' hex'"));
check("others.notarget", !skins.includes("cylTarget") && skins.includes("Hexslinger is not drawn here"));
check("dm.tight", map.includes("function n62TightGuns") && map.includes("n62TightGuns(card, 'dm', true)") && map.includes("n62TightGuns(card, dm ? 'dm' : 'player'"));

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\nall passed");

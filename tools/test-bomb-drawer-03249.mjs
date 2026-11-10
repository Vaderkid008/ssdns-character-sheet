/**
 * COA #13 — bomb / timer stays in DM tools, and the unlinked drawer
 * no longer parks it beside the link picker (sheet 0.3.280 / DMCC 0.2.293).
 *   node tools/test-bomb-drawer-03249.mjs
 * rules.js is not regenerated. Arm / Defuse / Trigger are not retimed.
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

const map = read("map/ssdns-map.js");
const timers = read("map/interact-timers.js");
const bareAt = map.indexOf("drawerHeadHtml('No fight card linked')");
const bareEnd = map.indexOf("bindLightHands(d, tokenId);", bareAt);
const bare = map.slice(bareAt, bareEnd);
const linkAt = bare.indexOf('data-act="linkPick"');
const lightAt = bare.indexOf("lightDrawerHtml(bare)");
const bombAt = bare.indexOf("bombToolsHtml(bare)");
check("bare.order", linkAt > 0 && lightAt > linkAt && bombAt > lightAt, [linkAt, lightAt, bombAt].join(","));
check("bare.wrapped", bare.includes("bombToolsHtml(bare)") && !bare.includes("bombPanelHtml"));

const enemyBomb = map.indexOf("bombToolsHtml(state.tokens.find");
const enemyImage = map.lastIndexOf('data-act="imageBtn"', enemyBomb);
check("enemy.afterImage", enemyImage > 0 && enemyBomb > enemyImage && enemyBomb - enemyImage < 400);

const n62At = map.indexOf("function n62DmHtml");
const n62 = map.slice(n62At, map.indexOf("function n62OnClick"));
const n62Bomb = n62.lastIndexOf("dmToolsHtml(bag.bomb)");
const n62Image = n62.indexOf('data-act="imageBtn"');
check("n62.bottom", n62Bomb > n62Image && n62Bomb > n62.indexOf("n62PeekHtml") && !n62.slice(0, n62.indexOf("n62-zlabel")).includes("bag.bomb"));

check("wrap.once", map.includes("function bombToolsHtml") && map.includes("return dmToolsHtml(I.bombPanelHtml(token))"));
check("panel.kept", timers.includes('data-act="bombArm"') && timers.includes('data-act="bombDefuse"') && timers.includes('data-act="bombNow"') && timers.includes("function bombPanelHtml"));
check("asset.untouched", map.includes('data-asset-act') && map.slice(map.indexOf("if (assetTok)"), map.indexOf("const card = lookupCard")).indexOf("bombToolsHtml") < 0);

const ver = JSON.parse(read("version.json"));
check("ver", ver.sheet === "0.3.280" && ver.dmcc === "0.2.293" && ver.sheetBuild === "sheet-playtest-v03280" && ver.dmccBuild === "dmcc-playtest-v02293");
const rules = read("assets/data/rules.js");
check("rules.clean", !rules.includes("0.3.280") && !rules.includes("0.2.293") && !read("database.rules.json").includes("0.3.280"));

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\nbomb drawer tuck ok");

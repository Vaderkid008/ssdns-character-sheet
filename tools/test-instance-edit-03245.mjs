/**
 * DM instance edit (sheet 0.3.288 / DMCC 0.2.301).
 * Max HP, AC, speed, and added gear stay on the placed token.
 * The library card and a second copy keep the catalog values.
 * The max HP field sits with the enemy-drawer HP bar. Players do not get it.
 *   node tools/test-instance-edit-03245.mjs
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
function check(id, cond, detail) {
  if (!cond) failures.push(id);
  console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + detail : ""));
}
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }

const version = JSON.parse(read("version.json"));
check("ver.sheet", version.sheet === "0.3.288" && version.sheetBuild === "sheet-playtest-v03288");
check("ver.dmcc", version.dmcc === "0.2.301" && version.dmccBuild === "dmcc-playtest-v02301");
check("rules.untouched", !read("assets/data/rules.js").includes("editInstance") && !read("database.rules.json").includes("enemyMaxHp"));

const ctx = { window: {}, console };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(read("assets/js/enemy-loot.js"), ctx);
const EL = ctx.SSDNSEnemyLoot;
const beast = { id: "bandit", name: "Bandit", ac: 12, hp: 11, speed: 30, attacks: "Scimitar" };
const placed = EL.catalogCopy(beast);
placed.id = "en1";
const other = EL.catalogCopy(beast);
other.id = "en2";
const edited = EL.editInstance(placed, beast, { ac: 18, maxHp: 40, speed: 25, itemId: "es", qty: 2 });
check("edit.ok", !!(edited && edited.ok));
check("instance.stats", placed.ac === 18 && placed.maxHp === 40 && placed.speed === 25 && placed.hp === 11);
check("instance.gear", Array.isArray(placed.inventory) && placed.inventory.some((item) => item.id === "es" && item.qty === 2));
check("catalog.untouched", beast.ac === 12 && beast.hp === 11 && beast.speed === 30 && beast.attacks === "Scimitar" && !beast.inventory);
check("second.catalog", other.ac === 12 && other.hp === 11 && other.maxHp === 11 && other.speed === 30 && other.inventory.length === 0);
const player = { id: "pc", kind: "player", ac: 14, hp: 9, maxHp: 9, speed: 30, inventory: [] };
check("player.refused", EL.editInstance(player, beast, { ac: 1, maxHp: 99, itemId: "es" }).ok === false && player.ac === 14 && player.inventory.length === 0);

const map = read("map/ssdns-map.js");
const vitals = map.slice(map.indexOf("function drawerVitalsHtml"), map.indexOf("function dmToolsHtml"));
const ret = vitals.slice(vitals.indexOf("return '"));
check("drawer.maxBesideBar", ret.includes('class="ssm-hpedit"') && ret.includes("+ bar + maxBit") && vitals.includes('data-act="enemyMaxHp"'));
check("drawer.ac", vitals.includes('data-act="enemyAc"'));
check("drawer.enemyOnly", map.includes("drawerVitalsHtml(card.ac, hp, speedBit, noHpPool, true)") && map.includes("if (!card || card.kind === 'pc') return '';"));
const host = read("map/ssdns-map-host.js");
check("host.wires", host.includes('"drawer:ac": "ac"') && host.includes('"drawer:maxHp": "maxHp"') && host.includes('"drawer:gearAdd": "gearAdd"'));
const v2 = read("dm/assets/js/v2.js");
check("v2.instance", v2.includes("function applyInstanceStat") && v2.includes("EL.editInstance") && v2.includes("ac(detail) { return setEnemyAc(detail); }") && v2.includes("maxHp(detail) { return setEnemyMaxHp(detail); }"));
check("v2.noCatalogWrite", !v2.slice(v2.indexOf("function applyInstanceStat"), v2.indexOf("function setEnemySpeed")).includes("beast.ac") && !v2.slice(v2.indexOf("function setEnemyMaxHp"), v2.indexOf("function spendMoveForToken")).includes("beast.hp"));

if (failures.length) {
  console.log("FAILED " + failures.length);
  process.exit(1);
}
console.log("passed");

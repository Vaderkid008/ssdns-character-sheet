/**
 * DM randomize-loot (sheet 0.3.263 / DMCC 0.2.276).
 * One press adds pocket loot and saddlebag ES on top of gear already there.
 * Players, allies, spell pieces, assets, dropped loot, and already-randomized
 * tokens are skipped. A second press does not stack. The library card is not
 * rewritten and no chest is placed. Stat-block guns stay out of Gear.
 *   node tools/test-randomize-loot-03246.mjs
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
check("ver.sheet", version.sheet === "0.3.263" && version.sheetBuild === "sheet-playtest-v03263");
check("ver.dmcc", version.dmcc === "0.2.276" && version.dmccBuild === "dmcc-playtest-v02276");
check("rules.untouched", !read("database.rules.json").includes("lootRandomized"));

const ctx = {
  console, Math, Date, JSON, parseInt, isFinite, Number, String, Object, Array,
  encodeURIComponent,
  document: { getElementById: function () { return null; }, addEventListener: function () {} }
};
ctx.globalThis = ctx;
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(read("assets/js/loot.js"), ctx, { filename: "loot.js" });
vm.runInContext(read("assets/js/enemy-loot.js"), ctx, { filename: "enemy-loot.js" });
ctx.SSDNSItems = {
  byId: function (id) { return { id: id, name: id, type: "consumable" }; },
  catalog: function () { return []; }
};
const EL = ctx.SSDNSEnemyLoot;
const zeros = function () { return 0; };
const beast = { id: "bandit", name: "Bandit", ac: 12, hp: 11, loot: "Pockets: flavor prose, not a table." };
const row = {
  id: "en1", kind: "enemy", beastId: "bandit", name: "Bandit", ac: 12, hp: 11, maxHp: 11,
  inventory: [{ id: "lamp-oil", qty: 1, name: "Lamp oil" }],
  card: { attacks: [{ id: "ball-n-cap-revolver", name: "Ball n Cap Revolver", weapon: "Navy", capacity: 6, loaded: 6 }] }
};
const first = EL.randomizeRow(row, beast, { rng: zeros });
check("fill.ok", first.ok === true && first.table === "enemy-pockets");
check("fill.kept", row.inventory.some((item) => item.id === "lamp-oil" && item.qty === 1));
check("fill.pocket", row.inventory.some((item) => item.id === "hardtack-jerky-1-day"));
check("fill.es", row.inventory.some((item) => item.id === "es" && item.qty === 10), JSON.stringify(row.inventory));
check("fill.noGun", !row.inventory.some((item) => item.id === "ball-n-cap-revolver" || item.id === "Navy"));
check("fill.marked", row.lootRandomized === true);
check("catalog.untouched", beast.ac === 12 && beast.hp === 11 && beast.loot.indexOf("flavor") >= 0 && !beast.inventory);
const snap = row.inventory.map((item) => item.id + ":" + item.qty).join("|");
const second = EL.randomizeRow(row, beast, { rng: zeros });
check("second.skip", second.ok === false && second.reason === "randomized");
check("second.same", row.inventory.map((item) => item.id + ":" + item.qty).join("|") === snap);
const forced = EL.randomizeRow(row, beast, { rng: zeros, force: true });
check("force.adds", forced.ok === true && row.inventory.some((item) => item.id === "hardtack-jerky-1-day" && item.qty === 2));
check("force.esStays", row.inventory.some((item) => item.id === "es" && item.qty === 10));

function skipped(extra) {
  const sample = Object.assign({ id: "x", kind: "enemy", inventory: [], card: { attacks: [] } }, extra);
  const res = EL.randomizeRow(sample, beast, { rng: zeros });
  return res.ok === false && res.reason && sample.lootRandomized !== true;
}
check("skip.player", skipped({ kind: "player" }));
check("skip.ally", skipped({ ally: true }));
check("skip.piece", skipped({ spellPiece: "flaming sphere" }));
check("skip.asset", skipped({ kind: "asset" }));
check("skip.dropped", skipped({ lootDropped: "box1" }));
check("skip.nopockets", skipped({ noHpPool: true }));
const outlaw = { id: "en2", kind: "enemy", beastId: "outlaw", inventory: [], card: { attacks: [] } };
const named = EL.randomizeRow(outlaw, { id: "outlaw", name: "Outlaw", ac: 12, hp: 11 }, { rng: zeros });
check("named.outlaw", named.ok === true && named.table === "outlaw" && outlaw.inventory.some((item) => item.id === "hardtack-jerky-1-day"));

const map = read("map/ssdns-map.js");
const gear = map.slice(map.indexOf("function gearDrawerHtml"), map.indexOf("function readPanelScroll"));
check("btn.dmTools", map.includes('data-act="randomizeLootBtn"') && map.includes("Randomize loot"));
check("btn.notInDrawer", !gear.includes("randomizeLootBtn"));
check("btn.dmOnly", map.indexOf("if (role === 'dm') {") < map.indexOf('data-act="randomizeLootBtn"'));
const host = read("map/ssdns-map-host.js");
check("host.wires", host.includes('name === "loot:randomize"') && host.includes("randomizeLoot"));
const v2 = read("dm/assets/js/v2.js");
const bulk = v2.slice(v2.indexOf("async function randomizeMapLoot"), v2.indexOf("window.SSDNSMapFight = {"));
check("v2.noChest", bulk.includes("EL.randomizeRow") && !bulk.includes("pinLootChest") && !bulk.includes("place("));
check("v2.mark", v2.includes("secret.lootRandomized"));

if (failures.length) {
  console.log("FAILED " + failures.length);
  process.exit(1);
}
console.log("passed");

/**
 * BG3 map movement: Chebyshev reach, ally pass-through, occupied ends, Dash budget, terrain hook.
 *   node tools/test-map-move.mjs
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
const sandbox = { console, Math, Number, isFinite, Map, Object, Array };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(root, "map/ssdns-map-move.js"), "utf8"), sandbox, { filename: "ssdns-map-move.js" });
const M = sandbox.SSDNSMapMove;
const grid = { cols: 20, rows: 20 };

function ctx(extra) {
  return Object.assign({ grid: grid, occupants: [], moverSize: 1, ignoreId: "me" }, extra || {});
}

const reach = M.computeReach({ x: 5, y: 5 }, 30, ctx());
check("diag.cost5", reach.get("8,7") && reach.get("8,7").costFt === 15, JSON.stringify(reach.get("8,7")));
check("diag.not510", reach.get("6,6") && reach.get("6,6").costFt === 5, JSON.stringify(reach.get("6,6")));
check("budget.30", !reach.has("5,12"), "7 steps is 35 ft");
const dashed = M.computeReach({ x: 5, y: 5 }, 60, ctx());
check("dash.expands", dashed.get("5,12") && dashed.get("5,12").costFt === 35, JSON.stringify(dashed.get("5,12")));

const ally = ctx({
  occupants: [{ id: "ally", x: 6, y: 5, size: 1, ally: true, name: "Caleb" }]
});
const through = M.computePath({ x: 5, y: 5 }, { x: 7, y: 5 }, 30, ally);
check("ally.through", !!(through && through.costFt === 10 && through.path.length === 3), JSON.stringify(through && { cost: through.costFt, path: through.path }));
check("ally.noEnd", M.computePath({ x: 5, y: 5 }, { x: 6, y: 5 }, 30, ally) == null);

const foe = ctx({
  occupants: [{ id: "foe", x: 6, y: 5, size: 1, ally: false, name: "Bandit" }]
});
check("enemy.noEnd", M.computePath({ x: 5, y: 5 }, { x: 6, y: 5 }, 30, foe) == null);
const around = M.computePath({ x: 5, y: 5 }, { x: 7, y: 5 }, 30, foe);
check("enemy.around", !!(around && around.costFt === 10), JSON.stringify(around && around.path));

const walled = ctx({
  /* crosses receives footprint centers. A wall on the grid line x = 6 blocks 5 -> 6. */
  crosses: (a, b) => (a.x < 6 && b.x > 6) || (a.x > 6 && b.x < 6)
});
check("wall.blocks", !M.computeReach({ x: 5, y: 5 }, 30, walled).has("6,5"));
check("wall.openElsewhere", M.computeReach({ x: 5, y: 5 }, 30, walled).has("5,6"));

const hard = ctx({ terrainCost: (sq) => (sq.x === 6 && sq.y === 5 ? 2 : 1) });
const hardReach = M.computeReach({ x: 5, y: 5 }, 30, hard);
check("terrain.hook", hardReach.get("6,5") && hardReach.get("6,5").costFt === 10, JSON.stringify(hardReach.get("6,5")));
check("terrain.default", M.terrainCost({ x: 1, y: 1 }, ctx()) === 1);

const cue = M.leaveReachCue(
  [{ x: 5, y: 5 }, { x: 6, y: 5 }, { x: 7, y: 5 }],
  { enemies: [{ id: "foe", x: 5, y: 6, size: 1, name: "Bandit", reachFt: 5 }] }
);
check("oa.cue", cue.left === true && cue.name === "Bandit", JSON.stringify(cue));
const stay = M.leaveReachCue(
  [{ x: 5, y: 5 }, { x: 6, y: 5 }],
  { enemies: [{ id: "foe", x: 5, y: 6, size: 1, name: "Bandit", reachFt: 5 }], disengage: true }
);
check("oa.disengage", stay.left === false);

const slot = { mode: "confirm", pending: null };
const built = { path: [{ x: 0, y: 0 }, { x: 1, y: 0 }], costFt: 5 };
const first = M.previewSlot(slot, { x: 1, y: 0 }, built);
check("mobile.preview", first.commit === false && first.pending && first.pending.x === 1);
slot.pending = first.pending;
const second = M.previewSlot(slot, { x: 1, y: 0 }, built);
check("mobile.confirm", second.commit === true);
check("desktop.click", M.previewSlot({ mode: "click", pending: null }, { x: 1, y: 0 }, built).commit === true);

const mapSrc = fs.readFileSync(path.join(root, "map/ssdns-map.js"), "utf8");
check("ghost.gone", mapSrc.indexOf('data-act="playerGhostBtn"') < 0 && mapSrc.indexOf('data-act="offlineBtn"') < 0);
check("both.wired", mapSrc.indexOf("host.movementBudget") >= 0 && mapSrc.indexOf("host.spendMove(token, n) === true") >= 0);
const hostSrc = fs.readFileSync(path.join(root, "map/ssdns-map-host.js"), "utf8");
check("sheet.spendFallsThrough", hostSrc.indexOf('return E.spendMove(token, feet) === true') >= 0 && hostSrc.indexOf("return false") >= 0);
const dmSrc = fs.readFileSync(path.join(root, "dm/assets/js/v2.js"), "utf8");
check("dm.enemyMapStrip", dmSrc.indexOf("Enemy turn on the DM map") >= 0 && dmSrc.indexOf("function spendMoveForToken") >= 0 && dmSrc.indexOf("return true;") >= 0);
check("rules.untouched", !fs.readFileSync(path.join(root, "database.rules.json"), "utf8").includes("ssdns-map-move"));

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("map move ok");

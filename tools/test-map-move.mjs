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

/* B1: a token whose centre sits on a wall can step off. A real wall still blocks. */
const diag = { x1: 5, y1: 5, x2: 6, y2: 6 };
check("unstick.onDiagonal", M.segmentBlocks(5.5, 5.5, 5.5, 4.5, diag) === false);
check("unstick.crossDiagonal", M.segmentBlocks(4.5, 5.5, 6.5, 5.5, diag) === true);
const vert = { x1: 6, y1: 0, x2: 6, y2: 20 };
check("corridor.blocks", M.segmentBlocks(5.5, 5.5, 6.5, 5.5, vert) === true);
check("corridor.otherSide", M.segmentBlocks(6.5, 5.5, 5.5, 5.5, vert) === true);
check("corridor.openDoor", M.segmentBlocks(5.5, 5.5, 6.5, 5.5, { x1: 6, y1: 0, x2: 6, y2: 20, open: true }) === false);
check("unstick.centreOnLine", M.segmentBlocks(6, 5.5, 7, 5.5, vert) === false);
check("unstick.arriveStillBlocks", M.segmentBlocks(7, 5.5, 6, 5.5, vert) === true);
check("unstick.thenBlocked", M.segmentBlocks(7, 5.5, 5, 5.5, vert) === true);
check("eps.nearMissStillBlocks", M.segmentBlocks(5.999, 5.5, 6.5, 5.5, vert) === true);
const onWall = ctx({ crosses: (a, b) => M.segmentBlocks(a.x, a.y, b.x, b.y, diag) });
check("unstick.reachStepsOff", M.computeReach({ x: 5, y: 5 }, 30, onWall).has("5,4"));
const aroundWall = ctx({ crosses: (a, b) => M.segmentBlocks(a.x, a.y, b.x, b.y, vert) });
check("corridor.reachBlocks", !M.computeReach({ x: 5, y: 5 }, 30, aroundWall).has("6,5"));
check("corridor.reachOpenSide", M.computeReach({ x: 5, y: 5 }, 30, aroundWall).has("4,5"));

/* N64: a Large 2×2 enters empty floor. A wall that only touches a corner does not block the diagonal step. */
const largeOpen = M.computeReach({ x: 10, y: 10 }, 30, ctx({ moverSize: 2 }));
check("large.emptyOrtho", largeOpen.has("11,10") && largeOpen.has("10,11"), "2×2 should step onto empty floor");
check("large.emptyDiag", largeOpen.has("11,11"));
const cornerWall = { x1: 12, y1: 10, x2: 12, y2: 11 };
const largeCorner = ctx({
  moverSize: 2,
  crosses: (a, b) => M.segmentBlocks(a.x, a.y, b.x, b.y, cornerWall)
});
check("large.cornerDoesNotBlock", M.computeReach({ x: 10, y: 10 }, 30, largeCorner).has("11,11"));
const faceWall = { x1: 12, y1: 11, x2: 12, y2: 12 };
const largeFace = ctx({
  moverSize: 2,
  crosses: (a, b) => M.segmentBlocks(a.x, a.y, b.x, b.y, faceWall)
});
check("large.faceStillBlocks", !M.computeReach({ x: 10, y: 10 }, 30, largeFace).has("11,11"));

const mapSrc = fs.readFileSync(path.join(root, "map/ssdns-map.js"), "utf8");
check("ghost.gone", mapSrc.indexOf('data-act="playerGhostBtn"') < 0 && mapSrc.indexOf('data-act="offlineBtn"') < 0);
check("both.wired", mapSrc.indexOf("host.movementBudget") >= 0 && mapSrc.indexOf("host.spendMove(token, n) === true") >= 0);
const hostSrc = fs.readFileSync(path.join(root, "map/ssdns-map-host.js"), "utf8");
check("sheet.spendFallsThrough", hostSrc.indexOf('return E.spendMove(token, feet) === true') >= 0 && hostSrc.indexOf("return false") >= 0);
const dmSrc = fs.readFileSync(path.join(root, "dm/assets/js/v2.js"), "utf8");
check("dm.enemyMapStrip", dmSrc.indexOf("Enemy turn on the DM map") >= 0 && dmSrc.indexOf("function spendMoveForToken") >= 0 && dmSrc.indexOf("return true;") >= 0);
const paintReach = mapSrc.slice(mapSrc.indexOf("function paintMoveReach"), mapSrc.indexOf("function paintMoveHover"));
const clickMove = mapSrc.slice(mapSrc.indexOf("function tryClickMove"), mapSrc.indexOf("function paintMoveReach"));
check("reach.retired", !mapSrc.includes("showMoveReach") && !mapSrc.includes("Show move reach") && !mapSrc.includes("drawerMoveReach"));
check("move.defaultOff", mapSrc.includes("moveMode: false"));
check("move.gateClick", /if \(dmEditing\(\)\) return false;\n  \/\* B13:[\s\S]{0,160}if \(fightOn\(\) && !state\.moveMode\) return false;/.test(clickMove));
check("move.greenOnly", paintReach.includes("if (!state.moveMode) return;"));
check("rules.untouched", !fs.readFileSync(path.join(root, "database.rules.json"), "utf8").includes("ssdns-map-move"));

const moveSrc = fs.readFileSync(path.join(root, "map/ssdns-map-move.js"), "utf8");
const dmToolbar = mapSrc.slice(mapSrc.indexOf("role === 'dm' ? `"), mapSrc.indexOf(": ``}"));
const playerCard = mapSrc.slice(mapSrc.indexOf("ssdns-playercard"), mapSrc.indexOf("attack effects"));
check("edit.button", dmToolbar.includes('data-act="dmEditBtn"') && dmToolbar.includes(">Edit tokens</button>"));
check("edit.playerClean", !playerCard.includes("dmEdit") && !playerCard.includes("Edit tokens"));
check("edit.defaultOff", mapSrc.includes("dmEdit: false") && mapSrc.includes("localStorage.getItem('ssdns.map.dmEdit') === '1'"));
check("edit.roleGuard", /function dmEditing\(\) \{\n  return role === 'dm' && !!state\.dmEdit;\n\}/.test(mapSrc));
check("edit.skipAim", mapSrc.includes("if (!dmEditing() && fightOn() && activeMover() && activeMover().id === hit.id && moveApi())"));
check("edit.noClickWalk", /function tryClickMove\(cell\) \{[\s\S]{0,280}if \(dmEditing\(\)\) return false;/.test(mapSrc));
check("edit.plainDrag", mapSrc.includes("const allowStack = dmEditing() || (role === 'dm' && e.shiftKey)") && mapSrc.includes("const centerBlocked = crossesWall(t.pos.x + half, t.pos.y + half, newX + half, newY + half)") && mapSrc.includes("largeSlideBlocked"));
check("edit.hint", mapSrc.includes("Swap to Edit map tokens to freely move") && /function toastDmEditHint\(\) \{\n  if \(!dmEditing\(\) && role === 'dm' && fightOn\(\)\) toast\(DM_EDIT_HINT\);/.test(mapSrc));
check("edit.playerFeetToast", mapSrc.includes("else toast('No movement left this turn'"));
check("edit.ctxCrosses", mapSrc.includes("crosses: (a, b) => crossesWall(a.x, a.y, b.x, b.y)"));
check("edit.eps", mapSrc.includes("return t >= 1e-6 && t <= 1 && u >= 0 && u <= 1;") && moveSrc.includes("return t >= 1e-6 && t <= 1 && u >= 0 && u <= 1;"));
check("edit.openSkipped", /function crossesWall\(x1, y1, x2, y2\) \{\n  const walls = sceneData\(\)\.walls;\n  if \(!walls\.length\) return false;\n  for \(const w of walls\) \{\n    if \(w\.open\) continue;/.test(mapSrc));
check("edit.streamStill", mapSrc.includes("function streamDrag()") && mapSrc.includes("STREAM_MS = 160"));
check("edit.undoStill", /state\.undoStack\.push\(\{ type: 'move', ids: ids\.slice\(\), from: \{ \.\.\.state\.drag\.starts \} \}\)/.test(mapSrc));

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("map move ok");

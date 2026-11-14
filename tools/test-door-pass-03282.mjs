/**
 * Closed doors block a step across and stay usable from the next square.
 * Open doors can be walked through. Sheet 0.3.309 / DMCC 0.2.322.
 *   node tools/test-door-pass-03282.mjs
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
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
const ver = JSON.parse(read("version.json"));
check("ver", ver.sheet === "0.3.309" && ver.dmcc === "0.2.322" && ver.sheetBuild === "sheet-playtest-v03309" && ver.dmccBuild === "dmcc-playtest-v02322");

const context = {
  console, Math, Date, JSON, parseInt, isFinite, Number, String, Object, Array
};
context.window = context;
context.globalThis = context;
vm.createContext(context);
vm.runInContext(read("assets/js/loot.js"), context);
vm.runInContext(read("map/ssdns-map-move.js"), context);
vm.runInContext(read("map/interact-timers.js"), context);
const I = context.SSDNSInteract;
const Move = context.SSDNSMapMove;
const door = { x1: 6, y1: 5, x2: 7, y2: 5, door: true, open: false, locked: true, lockDc: 15 };
const beside = { pos: { x: 6, y: 6 }, size: 1 };
function crosses(a, b) { return Move.segmentBlocks(a.x, a.y, b.x, b.y, door); }
const ctx = { moverSize: 1, occupants: [], crosses, grid: { cols: 20, rows: 20 } };
check("closed.blocks", Move.segmentBlocks(6.5, 5.5, 6.5, 4.5, door) === true);
check("closed.adjacent", I.feetToWall(beside, door) === 5 && I.doorMenu(door, { token: beside, dm: false, who: "ada", sheet: {} }).reach === true);
const bare = I.doorMenu(door, { token: beside, dm: false, who: "ada", sheet: {} });
check("closed.actions", bare.actions.map(a => a.id).join(",") === "open,lockpick,force,peek", bare.actions.map(a => a.id).join(","));
check("closed.noTools", bare.actions.find(a => a.id === "lockpick").disabled === true && bare.actions.find(a => a.id === "lockpick").note === "Needs thieves' tools");
door.open = true;
check("open.pass", Move.segmentBlocks(6.5, 5.5, 6.5, 4.5, door) === false);
door.open = false;
const sheet = { name: "Ada", abilities: { DEX: 16, STR: 16 }, prof: 3, thievesTools: true, items: [{ id: "thieves-tools", name: "Thieves' tools" }] };
const box = I.doorLockBox(door);
const pick = context.SSDNSLoot.pickLock(box, sheet, "ada", () => 0.99);
check("pick.opensLock", pick.success === true && pick.nat === 20);
door.locked = !box.lock.unlocked;
door.pickAttempts = box.lock.attempts;
const opened = I.applyDoor(door, "open", { dm: true });
check("then.walk", opened.ok === true && door.open === true && Move.segmentBlocks(6.5, 5.5, 6.5, 4.5, door) === false, JSON.stringify(opened));

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\ndoor pass ok");
process.exit(0);

/**
 * Slice 2: one loot claim wins, and a cancel beats a door action that already started.
 * Sheet 0.3.334 / DMCC 0.2.347.
 *   node tools/test-split-slice2-03334.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const failures = [];
function check(id, cond, detail) {
  if (!cond) failures.push(id + (detail ? " — " + detail : ""));
  console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + detail : ""));
}
const ver = JSON.parse(read("version.json"));
check("ver", ver.sheet === "0.3.334" && ver.dmcc === "0.2.347");
check("rules.clean", !read("assets/data/rules.js").includes("takeLoot") && !read("database.rules.json").includes("takeLoot"));
const mapSrc = read("map/ssdns-map.js");
const actionsSrc = read("assets/js/game-actions.js");
check("wire.loot", mapSrc.includes("GA.takeLoot") && actionsSrc.includes("takeLoot:"));
check("wire.cancel", mapSrc.includes("GA.cancelCommand") && mapSrc.includes("doorCancelled"));
check("wire.door", mapSrc.includes("GA.openDoor") && mapSrc.includes("GA.pickLock") && mapSrc.includes("GA.forceLock"));
const dcRow = read("map/ssdns-map.css");
check("dc.wraps", dcRow.includes("repeat(auto-fit, minmax(6.75rem, 1fr))") && !dcRow.includes("repeat(3, minmax(0, 1fr))"));
check("strongbox.default", mapSrc.includes('forceDc: kind === "strongbox" ? 25 : 15'));
check("adapter.clean", !actionsSrc.includes("gstatic.com") && !actionsSrc.includes("firebase"));

const ctx = { window: {}, console };
ctx.window = ctx;
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(read("assets/js/game-actions.js"), ctx);
const GA = ctx.SSDNSGameActions;
const first = GA.takeLoot({ boxId: "chest", rowId: "coin", name: "Coin" }, "p1");
const second = GA.takeLoot({ boxId: "chest", rowId: "coin", name: "Coin" }, "p2");
check("loot.one", first.ok === true && second.ok === false && second.reason === "Already taken.", JSON.stringify({ first: first.ok, second: second.reason }));
const other = GA.takeLoot({ boxId: "chest", rowId: "ring", name: "Ring" }, "p2");
check("loot.otherRow", other.ok === true);

const opened = GA.openDoor({ doorId: "1,2,2,2", action: "open" }, "p1");
check("door.opened", opened.ok === true);
GA.cancelCommand({ doorId: "1,2,2,2", tokenId: "ply_p1", why: "door-x" }, "p1");
check("door.cancelled", GA.blocked("openDoor", { doorId: "1,2,2,2" }) && GA.blocked("pickLock", { doorId: "1,2,2,2" }) && GA.blocked("forceLock", { doorId: "1,2,2,2" }));
GA.applyRemote("openDoor", { doorId: "1,2,2,2", action: "open" }, opened.action.seq, "p1");
check("door.lateIgnored", GA.blocked("openDoor", { doorId: "1,2,2,2" }));
const again = GA.openDoor({ doorId: "1,2,2,2", action: "open" }, "p1");
check("door.afterCancel", again.ok === true && GA.blocked("openDoor", { doorId: "1,2,2,2" }) === false);

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  failures.forEach((line) => console.error(" - " + line));
  process.exit(1);
}
console.log("split slice 2 0.3.334 ok");

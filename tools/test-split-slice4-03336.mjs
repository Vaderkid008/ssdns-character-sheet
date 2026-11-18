/**
 * Slice 4: the later disconnect choice wins, and a removed token stays gone.
 * Sheet 0.3.338 / DMCC 0.2.351.
 *   node tools/test-split-slice4-03336.mjs
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
check("ver", ver.sheet === "0.3.338" && ver.dmcc === "0.2.351");
check("rules.clean", !read("assets/data/rules.js").includes("removeToken") && !read("database.rules.json").includes("setPresence"));
const dmcc = read("dm/assets/js/dmcc.js");
const v2 = read("dm/assets/js/v2.js");
check("wire.menu", dmcc.includes("GA.skipTurn") && dmcc.includes("GA.takeControl") && dmcc.includes("GA.handControl") && dmcc.includes("GA.removeToken"));
check("wire.buttons", dmcc.includes('data-away="skip"') && dmcc.includes('data-away="dismiss"'));
check("wire.presence", v2.includes("GA.setPresence") && v2.includes("GA.holdTurn") && v2.includes("GA.removed"));
check("wire.noRespawn", read("map/ssdns-map.js").includes("dismissedMap()[who]") || read("map/ssdns-map.js").includes("dismissedMap()[who]"));
check("adapter.clean", !read("assets/js/game-actions.js").includes("firebase"));

const ctx = { window: {}, console };
ctx.window = ctx;
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(read("assets/js/game-actions.js"), ctx);
const GA = ctx.SSDNSGameActions;
GA.setPresence({ playerId: "p1", online: false }, "p1");
GA.holdTurn({ playerId: "p1" }, "dm");
check("default.hold", GA.choice("p1").name === "holdTurn");
GA.removeToken({ playerId: "p1" }, "dm");
check("remove.wins", GA.choice("p1").name === "removeToken" && GA.removed("p1") === true);
const back = GA.setPresence({ playerId: "p1", online: true }, "p1");
check("rejoin.staysRemoved", GA.removed("p1") === true && back.name === "setPresence");
const oldRemove = GA.applyRemote("removeToken", { playerId: "p2" }, 1, "dm");
GA.holdTurn({ playerId: "p2" }, "dm");
const late = GA.applyRemote("removeToken", { playerId: "p2" }, 1, "dm");
check("later.hold", oldRemove === true && late === false && GA.choice("p2").name === "holdTurn" && GA.removed("p2") === false, JSON.stringify({ oldRemove, late, choice: GA.choice("p2"), removed: GA.removed("p2") }));

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  failures.forEach((line) => console.error(" - " + line));
  process.exit(1);
}
console.log("split slice 4 0.3.338 ok");

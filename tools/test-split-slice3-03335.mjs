/**
 * Slice 3: one action paints the feed, the roll log, and the fight strip.
 * Sheet 0.3.339 / DMCC 0.2.352.
 *   node tools/test-split-slice3-03335.mjs
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
check("ver", ver.sheet === "0.3.339" && ver.dmcc === "0.2.352");
check("rules.clean", !read("assets/data/rules.js").includes("postRoll") && !read("database.rules.json").includes("postChat"));
const dmcc = read("dm/assets/js/dmcc.js");
const paint = dmcc.slice(dmcc.indexOf("function paintSharedAction"), dmcc.indexOf("async function pushRoll"));
check("wire.oneListener", paint.includes("renderRolls()") && paint.includes("renderLiveDock()") && paint.includes("renderFight"));
check("wire.roll", dmcc.includes("SSDNSGameActions.postRoll"));
check("wire.chat", dmcc.includes("SSDNSGameActions.postChat"));
check("wire.cond", read("dm/assets/js/v2.js").includes("SSDNSGameActions.setCondition"));
check("wire.request", read("assets/js/dm-join.js").includes("SSDNSGameActions.request"));
check("adapter.clean", !read("assets/js/game-actions.js").includes("firebase"));

const ctx = { window: {}, console };
ctx.window = ctx;
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(read("assets/js/game-actions.js"), ctx);
const GA = ctx.SSDNSGameActions;
const painted = { feed: 0, rolls: 0, fight: 0 };
GA.on((action) => {
  if (!action) return;
  if (action.name === "postRoll" || action.name === "postChat" || action.name === "setCondition" || action.name === "request") {
    painted.feed += 1;
    painted.rolls += 1;
    painted.fight += 1;
  }
});
GA.postRoll({ id: "r1", label: "Attack", formula: "1d20+5", result: 18, who: "Jolene" }, "p1");
GA.postChat({ id: "c1", text: "Hold the door", fromName: "DM" }, "dm");
GA.setCondition({ id: "p1", subjectId: "p1", name: "Prone", names: ["Prone"] }, "dm");
GA.request({ id: "q1", kind: "damage", text: "8 piercing", targetId: "en1" }, "p1");
check("paint.all", painted.feed === 4 && painted.rolls === 4 && painted.fight === 4, JSON.stringify(painted));
const late = GA.applyRemote("postRoll", { id: "r1", label: "Attack" }, GA.recent().filter(a => a.name === "postRoll")[0].seq, "p1");
check("roll.once", late === false);

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  failures.forEach((line) => console.error(" - " + line));
  process.exit(1);
}
console.log("split slice 3 0.3.339 ok");

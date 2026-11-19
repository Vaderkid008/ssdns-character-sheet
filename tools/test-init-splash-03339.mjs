/**
 * Roll initiative splash, then Round 1 only after the rolls are in.
 * Sheet 0.3.339 / DMCC 0.2.352. Combat stays off until that second splash.
 *   node tools/test-init-splash-03339.mjs
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
check("ver", ver.sheet === "0.3.339" && ver.dmcc === "0.2.352");
check("rules.clean", !read("assets/data/rules.js").includes("0.3.339") && !read("database.rules.json").includes("0.3.339"));

const v2 = read("dm/assets/js/v2.js");
check("calling.first", v2.indexOf("fight.calling = true") < v2.indexOf("Waiting for players to roll"));
check("started.later", v2.includes("fight.calling = false;\n      fight.started = true;"));
check("publish", v2.includes("calling: !!fight.calling"));
check("early", v2.includes("function maybeFinishInit") && v2.includes("rowsWaitingOnPlayers"));
check("default.off", /started:\s*false/.test(v2) && /calling:\s*false/.test(v2));

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\nall passed");

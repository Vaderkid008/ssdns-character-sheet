#!/usr/bin/env node
/* Referee rules, the off switch, and the version. No Firebase. */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { apply, LIMITS } from "../functions/referee.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let failed = 0;
function check(name, ok) {
  if (!ok) { failed += 1; console.error("FAIL", name); }
}

const ver = JSON.parse(fs.readFileSync(path.join(root, "version.json"), "utf8"));
check("ver", ver.sheet === "0.3.340" && ver.dmcc === "0.2.353" && ver.sheetBuild === "sheet-playtest-v03340" && ver.dmccBuild === "dmcc-playtest-v02353");

const rules = fs.readFileSync(path.join(root, "database.rules.json"), "utf8");
const gameRules = fs.readFileSync(path.join(root, "assets/data/rules.js"), "utf8");
check("rules clean", !rules.includes("0.3.340") && !gameRules.includes("0.3.340"));
check("limits", LIMITS.movePerTokenPerSec === 8 && LIMITS.otherPerPlayerPerMin === 30 && LIMITS.roomPerSec === 20);

const index = fs.readFileSync(path.join(root, "functions/index.js"), "utf8");
check("caps", index.includes('memory: "256MiB"') && index.includes("timeoutSeconds: 10") && index.includes("maxInstances: 10") && index.includes("concurrency: 5"));
check("app check off", index.includes('process.env.SSDNS_ENFORCE_APP_CHECK === "1"') && !fs.existsSync(path.join(root, "functions/.env")));
check("no firebase in referee", !fs.readFileSync(path.join(root, "functions/referee.js"), "utf8").includes("firebase"));
check("no firebase in actions", !fs.readFileSync(path.join(root, "assets/js/game-actions.js"), "utf8").includes("firebase"));

function page(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
["index.html", "dm/index.html", "map/demo.html"].forEach((rel) => {
  check("script " + rel, page(rel).includes("referee-client.js") && !page(rel).includes("SSDNS_REFEREE"));
});
check("flag unset", !/SSDNS_REFEREE\s*=/.test(["index.html", "dm/index.html", "map/demo.html", "assets/js/referee-client.js", "assets/js/dm-join.js", "dm/assets/js/dmcc.js"].map(page).join("\n")));

let state = null;
const ctx = (seq) => ({ uid: "player1", now: 1_700_000_000_000, clientSeq: seq });
let first = apply(state, { name: "moveToken", payload: { tokenId: "tok1", x: 3, y: 4 } }, ctx(1));
check("move", first.ok && first.seq === 1 && first.writes["map/public/tokens/tok1/pos"].x === 3);
state = first.state;
let second = apply(state, { name: "moveToken", payload: { tokenId: "tok1", x: 5, y: 6 } }, ctx(2));
check("seq", second.ok && second.seq === 2 && second.action.by === "player1");
state = second.state;
let again = apply(state, { name: "moveToken", payload: { tokenId: "tok1", x: 3, y: 4 } }, ctx(1));
check("duplicate", again.duplicate === true && again.seq === 1);
for (let i = 0; i < 6; i++) {
  const step = apply(state, { name: "moveToken", payload: { tokenId: "tok1", x: i, y: 0 } }, ctx(10 + i));
  check("burst " + i, step.ok);
  state = step.state;
}
const fast = apply(state, { name: "moveToken", payload: { tokenId: "tok1", x: 9, y: 9 } }, ctx(20));
check("token cap", !fast.ok && /too fast/i.test(fast.reason));

let room = null;
for (let i = 0; i < 20; i++) {
  const step = apply(room, { name: "setHp", payload: { id: "row" + i, hp: i, maxHp: 10 } }, { uid: "dmuser", now: 1_700_000_100_000, clientSeq: 100 + i });
  check("room " + i, step.ok && step.writes["encounter/hp/row" + i + "/hp"] === i);
  room = step.state;
}
const busy = apply(room, { name: "setHp", payload: { id: "overflow", hp: 1, maxHp: 2 } }, { uid: "dmuser", now: 1_700_000_100_000, clientSeq: 200 });
check("room cap", !busy.ok && /too busy/i.test(busy.reason));

let minute = null;
for (let i = 0; i < 30; i++) {
  const step = apply(minute, { name: "setHp", payload: { id: "hp" + i, hp: 1, maxHp: 2 } }, { uid: "slowpoke", now: 1_700_000_200_000 + i * 1000, clientSeq: 300 + i });
  check("minute " + i, step.ok);
  minute = step.state;
}
const over = apply(minute, { name: "setHp", payload: { id: "extra", hp: 1, maxHp: 2 } }, { uid: "slowpoke", now: 1_700_000_200_000 + 30 * 1000, clientSeq: 400 });
check("player cap", !over.ok && /this minute/i.test(over.reason));

let loot = apply(null, { name: "takeLoot", payload: { boxId: "chest", rowId: "gold" } }, { uid: "player1", now: 5, clientSeq: 1 });
let loot2 = apply(loot.state, { name: "takeLoot", payload: { boxId: "chest", rowId: "gold" } }, { uid: "player2", now: 6, clientSeq: 2 });
check("loot once", loot.ok && loot.writes["referee/loot/chest/gold"].seq === 1 && !loot2.ok);

const strip = apply(null, { name: "setInitiative", payload: { round: 1, turn: 0, started: true, order: null, turnSeq: 4 } }, { uid: "dmuser", now: 7, clientSeq: 1 });
check("initiative", strip.ok && strip.writes["table/initiative/actionSeq"] === 1 && strip.writes["table/initiative/started"] === true && strip.writes["table/initiative/order"] === null);

const stranger = apply(null, { name: "moveToken", payload: { tokenId: "tok1", x: 1, y: 1 } }, { uid: "", now: 8, clientSeq: 1 });
check("signed out", !stranger.ok);
const junk = apply(null, { name: "dropTable", payload: {} }, { uid: "player1", now: 9, clientSeq: 1 });
check("unknown", !junk.ok);

const window = {};
vm.createContext(window);
window.window = window;
window.globalThis = window;
vm.runInContext(fs.readFileSync(path.join(root, "assets/js/game-actions.js"), "utf8"), window);
vm.runInContext(fs.readFileSync(path.join(root, "assets/js/referee-client.js"), "utf8"), window);
check("default off", window.SSDNSRefereeClient.enabled() === false);
check("attach ignored", window.SSDNSRefereeClient.attach("COIL-4792").enabled === false && window.SSDNSGameActions.transport() === "local");
window.SSDNS_REFEREE = { enabled: true };
const seen = [];
window.SSDNSGameActions.on((action) => seen.push(action));
const armed = window.SSDNSRefereeClient.attach("COIL-4792", {
  call: async (room, action) => ({ name: action.name, seq: 7, by: "player1", payload: action.payload })
});
check("flag on", armed.enabled === true && window.SSDNSGameActions.transport() === "referee");
window.SSDNSGameActions.moveToken("tok1", { x: 1, y: 2 }, "player1");
await new Promise((r) => setTimeout(r, 30));
check("server seq", seen.length === 1 && seen[0].seq === 7);

if (failed) {
  console.error(failed + " failed");
  process.exit(1);
}
console.log("referee ok");

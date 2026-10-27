/**
 * N69 — an unconscious, dead, or defeated reactor never enqueues a leave-reach
 * or reaction prompt, and a stuck type:"react" row is cleared on DM load
 * before any card is painted. Attack on a living reactor arms the OA and
 * holds the pause until that attack is spent. Escape / Cancel dismiss the card without covering
 * lobby, Leave, or New code.
 *   node tools/test-n69-downed-react.mjs
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
function check(id, cond, detail) {
  if (!cond) failures.push(id + (detail ? " — " + String(detail).slice(0, 400) : ""));
  console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + String(detail).slice(0, 400) : ""));
}
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }

const moveSb = { console, Math, Number, isFinite, Map, Object, Array };
moveSb.globalThis = moveSb;
vm.createContext(moveSb);
vm.runInContext(read("map/ssdns-map-move.js"), moveSb, { filename: "ssdns-map-move.js" });
const M = moveSb.SSDNSMapMove;

const bandit = { id: "foe", x: 5, y: 6, size: 1, name: "Bandit", reachFt: 5, kind: "enemy", dmRuns: true };
const pathOut = [{ x: 5, y: 5 }, { x: 6, y: 5 }, { x: 7, y: 5 }];
const living = M.leaveReachPlan(pathOut, { enemies: [bandit], moverSize: 1 });
check("plan.living", living.pauses.length === 1 && living.pauses[0].reactors[0].name === "Bandit", JSON.stringify(living.pauses));

function noPause(label, foe) {
  const plan = M.leaveReachPlan(pathOut, { enemies: [foe], moverSize: 1 });
  check("plan." + label, plan.pauses.length === 0, JSON.stringify(plan.pauses));
}
noPause("unconscious", Object.assign({}, bandit, { status: "Unconscious" }));
noPause("down", Object.assign({}, bandit, { status: "Down", hp: 0 }));
noPause("dead", Object.assign({}, bandit, { status: "dead" }));
noPause("dying", Object.assign({}, bandit, { status: "dying" }));
noPause("defeated", Object.assign({}, bandit, { defeated: true, name: "Fallen" }));
noPause("hp0", Object.assign({}, bandit, { hp: 0 }));
noPause("condition", Object.assign({}, bandit, { conditions: [{ name: "Unconscious" }] }));
noPause("pcDown", Object.assign({}, bandit, { kind: "player", playerId: "pc1", status: "unconscious", name: "Ada" }));
noPause("pcHp", Object.assign({}, bandit, { kind: "player", playerId: "pc1", hpCurrent: 0, hp: 0, name: "Bo" }));
check("plan.noHpPool", M.leaveReachPlan(pathOut, { enemies: [Object.assign({}, bandit, { noHpPool: true, hp: 0, name: "Horse" })], moverSize: 1 }).pauses.length === 1);

const mixed = M.leaveReachPlan(pathOut, {
  enemies: [
    Object.assign({}, bandit, { id: "sleep", name: "Sleeper", status: "Down", hp: 0 }),
    Object.assign({}, bandit, { id: "wolf", name: "Wolf", x: 5, y: 6 })
  ],
  moverSize: 1
});
check("plan.mixed", mixed.pauses.length === 1 && mixed.pauses[0].reactors.length === 1 && mixed.pauses[0].reactors[0].name === "Wolf", JSON.stringify(mixed.pauses));

const dom = new JSDOM("<!doctype html><html><head><style id='css'></style></head><body></body></html>", { url: "http://localhost/", runScripts: "dangerously" });
const w = dom.window;
const css = read("dm/assets/css/dmcc.css");
w.document.getElementById("css").textContent = css;
w.document.body.innerHTML = '<header class="appbar" id="appbar"><button type="button" id="btnLeaveRoom">Leave room</button><button type="button" id="btnNewCode">New code</button></header><section class="lobby" id="lobby"><button type="button" id="btnCreateRoom">Create room</button><input id="inRoomName" value=""></section>';
w.eval(read("assets/js/react-prompt.js"));
const R = w.SSDNSReact;

check("elig.down", R.isIneligibleReactor({ status: "Down", hp: 0 }) && R.isIneligibleReactor({ status: "dead" }) && R.isIneligibleReactor({ defeated: true }));
check("elig.unconscious", R.isIneligibleReactor({ conditions: ["Unconscious"] }) && R.isIneligibleReactor({ activeConditions: [{ name: "Unconscious" }] }));
check("elig.pc", R.isIneligibleReactor({ kind: "player", hpCurrent: 0 }) && R.isIneligibleReactor({ kind: "player", status: "unconscious" }));
check("elig.living", !R.isIneligibleReactor({ name: "Bandit", hp: 12, status: "" }) && !R.isIneligibleReactor({ noHpPool: true, hp: 0, name: "Horse" }));

const filtered = R.withoutIneligible([{ index: 2, reactors: [
  { name: "Sleeper", status: "Down", hp: 0 },
  { name: "Wolf", hp: 11 }
] }]);
check("queue.dropDown", filtered.length === 1 && filtered[0].reactors.length === 1 && filtered[0].reactors[0].name === "Wolf");
check("queue.none", R.withoutIneligible([{ index: 2, reactors: [{ name: "Sleeper", status: "dead" }] }]).length === 0);

const stuckSession = R.freshLeave({ pauses: [{ index: 2, reactors: [Object.assign({}, bandit, { status: "Down", hp: 0 })] }] }, pathOut.length);
const freed = R.skipIneligible(stuckSession);
check("queue.skipFrees", freed.done === true && freed.commits.length === 1 && freed.commits[0].from === 1 && freed.commits[0].to === 2 && R.leaveView(stuckSession, "Caleb") == null, JSON.stringify(freed));

const mixedSession = R.freshLeave({ pauses: [{ index: 2, reactors: [
  Object.assign({}, bandit, { name: "Sleeper", status: "Unconscious" }),
  Object.assign({}, bandit, { id: "wolf", name: "Wolf" })
] }] }, pathOut.length);
const skipped = R.skipIneligible(mixedSession);
const next = R.leaveView(mixedSession, "Caleb");
check("queue.skipToLiving", skipped.done === false && next && next.reactorName === "Wolf", next && next.reactorName);
const passed = R.answerLeave(mixedSession, "pass");
check("queue.livingPass", passed.done === true && passed.commit && passed.commit.to === 2, JSON.stringify(passed.commit));

const offers = R.livingOffers([
  { kind: "damage", reactorName: "Sleeper", status: "Down", hp: 0, spellName: "Hellish Rebuke" },
  { kind: "damage", reactorName: "Ada", hp: 20, spellName: "Hellish Rebuke" },
  { kind: "spell", reactorName: "Bo", conditions: ["dead"], spellName: "Counterspell" }
]);
check("offers.livingOnly", offers.length === 1 && offers[0].reactorName === "Ada", offers.map((o) => o.reactorName).join(","));

const room = {
  react_stuck: {
    type: "react", phase: "ask", from: "p1", targetId: "foe", amount: 0,
    promptId: "react_1", moverPlayerId: "p1", reactorId: "foe", reactorName: "Bandit",
    reactorStatus: "Down", reactorHp: 0, reactorDown: true
  },
  react_done: { type: "react", phase: "ask", from: "p1", targetId: "x", amount: 0, resolved: true, promptId: "old" },
  end_1: { type: "endTurn", from: "p1", targetId: "row", amount: 0 }
};
const boot = R.bootReactRoom(room);
check("boot.noPaint", boot.paint === false && boot.closeUi === true);
check("boot.wipeStuck", boot.wipe.length === 1 && boot.wipe[0].id === "react_stuck" && boot.wipe[0].moverPlayerId === "p1" && boot.wipe[0].choice === "pass", JSON.stringify(boot.wipe));
room.react_stuck.resolved = true;
room.react_stuck.phase = "cleared";
const again = R.bootReactRoom(room);
check("boot.secondLoad", again.wipe.length === 0 && again.paint === false, JSON.stringify(again.wipe));
check("boot.ineligibleRow", R.isIneligibleReactor({ status: "Down", hp: 0, name: "Bandit" }));

let lobbyClicks = 0;
w.document.getElementById("btnNewCode").addEventListener("click", function () { lobbyClicks += 1; });
w.document.getElementById("btnLeaveRoom").addEventListener("click", function () { lobbyClicks += 1; });
w.document.getElementById("btnCreateRoom").addEventListener("click", function () { lobbyClicks += 1; });
let dismissed = "";
R.openModal({
  kind: "leave",
  kicker: "Opportunity attack",
  text: "Caleb is leaving your reach — Opportunity attack?",
  choice: "attack",
  attackLabel: "Attack",
  passLabel: "Pass"
}, function (choice) { dismissed = choice; });
const modal = w.document.querySelector("[data-react-modal]");
const card = w.document.querySelector(".react-modal-card");
const shellStyle = w.getComputedStyle(modal);
const barStyle = w.getComputedStyle(w.document.querySelector(".appbar"));
const lobbyStyle = w.getComputedStyle(w.document.querySelector(".lobby"));
check("ui.cancel", modal && modal.querySelector("[data-react-choice=cancel]") && modal.querySelector("[data-react-choice=attack]") && modal.querySelector("[data-react-choice=pass]"));
check("ui.noBlock", shellStyle.pointerEvents === "none" && w.getComputedStyle(card).pointerEvents === "auto" && shellStyle.backgroundColor === "rgba(0, 0, 0, 0)", shellStyle.pointerEvents + " " + shellStyle.backgroundColor);
check("ui.lobbyAbove", parseInt(barStyle.zIndex, 10) > parseInt(shellStyle.zIndex, 10) && parseInt(lobbyStyle.zIndex, 10) > parseInt(shellStyle.zIndex, 10), barStyle.zIndex + "/" + lobbyStyle.zIndex + "/" + shellStyle.zIndex);
w.document.getElementById("btnNewCode").click();
w.document.getElementById("btnLeaveRoom").click();
w.document.getElementById("btnCreateRoom").click();
check("ui.lobbyClicks", lobbyClicks === 3 && dismissed === "", String(lobbyClicks) + " " + dismissed);
modal.querySelector("[data-react-choice=cancel]").click();
check("ui.cancelClears", dismissed === "cancel" && !w.document.querySelector("[data-react-modal]"), dismissed);

dismissed = "";
R.openModal({ kind: "leave", kicker: "Opportunity attack", text: "Still here?", choice: "attack", attackLabel: "Attack", passLabel: "Pass" }, function (choice) { dismissed = choice; });
R.openWait("Waiting on opportunity attacks…");
w.document.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
check("ui.escape", dismissed === "cancel" && !w.document.querySelector("[data-react-modal]") && !w.document.querySelector("[data-react-wait]"), dismissed);

R.setSuppress(true);
R.openModal({ kind: "leave", text: "should not paint", choice: "attack", attackLabel: "Attack", passLabel: "Pass" }, function () { dismissed = "painted"; });
check("ui.suppress", !w.document.querySelector("[data-react-modal]") && dismissed !== "painted");
R.setSuppress(false);

const v2 = read("dm/assets/js/v2.js");
const watchAt = v2.indexOf("function watchRequests");
const watch = v2.slice(watchAt, v2.indexOf("function paintReveal", watchAt));
check("src.bootFirst", watch.indexOf("bootClearReacts") >= 0 && watch.indexOf("bootClearReacts") < watch.indexOf("noteReactRequest"), watch.slice(0, 500));
check("src.bootClears", v2.includes("function bootClearReacts") && v2.includes("bootReactRoom") && v2.includes("resolved: true") && v2.includes('phase: "cleared"'));
check("src.attackArms", v2.includes("armReactOa(view.reactorId, meta.oaId, view.reactorName)") && v2.includes("Opportunity attack ready") && v2.includes("meta.armed = true"));
check("src.dismiss", v2.includes("function dismissReactUi") && v2.includes('choice === "cancel"'));
check("src.fightGate", v2.includes("function fightUsable") && v2.includes("requestIneligible"));
check("src.offers", v2.includes("reactorRowIneligible(row)") && v2.includes("livingOffers"));
const mapSrc = read("map/ssdns-map.js");
check("src.mapSkip", mapSrc.includes("withoutIneligible") && mapSrc.includes("skipIneligible") && mapSrc.includes("function reactorFacts") && mapSrc.includes("if (!fightOn())"));
check("src.moveSkip", read("map/ssdns-map-move.js").includes("reactorIneligible"));
const dmcc = read("dm/assets/css/dmcc.css");
check("src.css", dmcc.includes("pointer-events: none") && dmcc.includes("z-index: 320") && dmcc.includes("z-index: 300") && read("assets/css/sheet.css").includes("z-index: 320"));
check("src.leaveCloses", read("dm/assets/js/dmcc.js").includes("SSDNSReact.close"));
check("src.sheet", read("assets/js/dm-join.js").includes("sheetIneligible") && read("assets/js/dm-join.js").includes("reactorDown") && read("assets/js/dm-join.js").includes("reactPromptSettled"));
check("src.rulesUntouched", !read("assets/data/rules.js").includes("react-prompt") && !read("assets/data/rules.js").includes("0.3.158") && !read("database.rules.json").includes("0.3.158") && !read("assets/data/rules.js").includes("isIneligibleReactor"));
const ver = JSON.parse(read("version.json"));
check("src.versions", ver.sheet === "0.3.158" && ver.dmcc === "0.2.171" && ver.sheetBuild === "sheet-playtest-v03158" && ver.dmccBuild === "dmcc-playtest-v02171", JSON.stringify(ver));

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\nn69 ok");

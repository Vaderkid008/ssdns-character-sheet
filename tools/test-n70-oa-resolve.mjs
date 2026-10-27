/**
 * N70 — leave-reach Attack must resolve the opportunity attack before the
 * leave step commits. Pass still dismisses and commits, with no freeze.
 *   node tools/test-n70-oa-resolve.mjs
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

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/", runScripts: "dangerously" });
const w = dom.window;
w.eval(read("assets/js/react-prompt.js"));
w.eval(read("assets/js/action-pips.js"));
const R = w.SSDNSReact;
const P = w.SSDNSActionPips;

const witch = { id: "witch", name: "Cactus Witch", kind: "enemy", dmRuns: true, reachFt: 5 };
const pathOut = [{ x: 5, y: 5 }, { x: 6, y: 5 }, { x: 7, y: 5 }];

function fresh() {
  const session = R.freshLeave({ pauses: [{ index: 2, reactors: [witch] }] }, pathOut.length);
  session.moverName = "Silas";
  return session;
}

/** Same release rule as the map: Attack holds and watches; Pass or attacked commits. */
function drive(session, choice, meta, commits) {
  meta = meta || {};
  if (choice === "attack" && meta.dmRuns) {
    const decided = R.attackDecision(meta.armedOk !== false);
    if (!decided.hold) choice = "pass";
    else choice = decided.choice;
  }
  const step = R.answerLeave(session, choice, meta);
  if (step.armed) {
    R.watchSpent(step.oaId, function () { drive(session, "attacked", { oaId: step.oaId }, commits); });
    return step;
  }
  if (step.commit) commits.push(step.commit);
  return step;
}

const heldSession = fresh();
const commits = [];
const held = drive(heldSession, "attack", { dmRuns: true, armedOk: true, oaId: "oa_witch" }, commits);
check("attack.decision", R.attackDecision(true).choice === "attack" && R.attackDecision(true).hold === true && R.attackDecision(true).armed === true);
check("attack.holds", held.armed === true && held.commit == null && commits.length === 0 && heldSession.phase === "attacking" && heldSession.waiting === R.WAIT, JSON.stringify(held));
const stillThere = R.leaveView(heldSession, "Silas");
check("attack.cardWaits", stillThere && stillThere.hideAttack === true && stillThere.oaId === "oa_witch" && /spends your reaction/.test(stillThere.text) && stillThere.waiting === "Waiting on opportunity attacks…");
check("attack.notYet", commits.length === 0 && heldSession.phase === "attacking");
const noted = R.noteSpent("oa_witch");
check("attack.thenCommit", noted === true && commits.length === 1 && commits[0].from === 1 && commits[0].to === 2 && heldSession.phase === "done" && heldSession.waiting === "", JSON.stringify(commits));

const passCommits = [];
const passed = drive(fresh(), "pass", {}, passCommits);
check("pass.commits", passed.armed !== true && passed.done === true && passCommits.length === 1 && passCommits[0].to === 2, JSON.stringify(passed));

const cancelCommits = [];
const cancelled = drive(fresh(), "cancel", {}, cancelCommits);
check("cancel.likePass", cancelled.done === true && cancelCommits.length === 1);

const failed = drive(fresh(), "attack", { dmRuns: true, armedOk: false, oaId: "oa_no" }, []);
check("attack.failedArmPasses", R.attackDecision(false).choice === "pass" && R.attackDecision(false).hold === false && failed.done === true && failed.commit && failed.commit.to === 2, JSON.stringify(failed));

const pc = { id: "ada", name: "Ada", kind: "player", playerId: "p1", dmRuns: true, dmActsAs: true };
const pcSession = R.freshLeave({ pauses: [{ index: 2, reactors: [pc] }] }, pathOut.length);
pcSession.moverName = "Silas";
const pcView = R.leaveView(pcSession, "Silas");
const pcCommits = [];
const pcHeld = drive(pcSession, "attack", { dmRuns: true, armedOk: true, oaId: "oa_ada" }, pcCommits);
check("pc.dmRuns", pcView && pcView.dmRuns === true && pcView.reactorKind === "player" && pcView.reactorName === "Ada");
check("pc.holds", pcHeld.armed === true && pcCommits.length === 0 && pcSession.phase === "attacking");
R.noteSpent("oa_ada");
check("pc.thenCommit", pcCommits.length === 1 && pcSession.phase === "done", JSON.stringify(pcCommits));

const late = fresh();
const lateCommits = [];
drive(late, "attack", { dmRuns: true, armedOk: true, oaId: "oa_late" }, lateCommits);
R.forgetSpent("oa_late");
check("forget.noRelease", R.noteSpent("oa_late") === false && lateCommits.length === 0 && late.phase === "attacking");
const latePass = R.answerLeave(late, "pass", {});
check("pass.afterArm", latePass.done === true && latePass.commit && latePass.commit.to === 2 && late.phase === "done");

P.reset(true);
P.setOa("oaArmed", "oa_r");
let spentId = "";
R.watchSpent("oa_r", function (id) { spentId = id; });
const oaRoll = P.attack("Claws");
const after = P.state();
check("pips.reactionNotAction", oaRoll.oa === "oa_r" && after.reaction === true && after.action === false && after.oaArmed === "" && spentId === "oa_r", JSON.stringify(after));

const v2 = read("dm/assets/js/v2.js");
const mapSrc = read("map/ssdns-map.js");
const armAt = v2.indexOf('if (choice === "attack" && view.dmRuns)');
const armEnd = v2.indexOf('if (choice === "pass" && view.hideAttack', armAt);
const armBody = v2.slice(armAt, armEnd);
const holdBody = armBody.split("} else {")[1] || "";
check("src.attackDecision", armBody.includes("attackDecision") && armBody.includes("armReactOa(view.reactorId, meta.oaId, view.reactorName)") && armBody.includes("meta.armed = true"));
check("src.holds", holdBody.includes('tell("attack"') && holdBody.includes("openArmedLeaveCard") && !/choice\s*=\s*"pass"/.test(holdBody), holdBody.slice(0, 300));
check("src.noEarlyRelease", !v2.includes("Arm, then release the mover") && v2.includes("hold the leave until this opportunity attack is spent"));
check("src.notifyAfterStrike", v2.includes("if (local || !remembered) return") && v2.includes('pushReactAnswer(remembered, "attacked"'));
check("src.dmRunPc", v2.includes("dmRunsToken(reactorRow)") && mapSrc.includes("function reactorDmRuns") && mapSrc.includes("card.dmActsAs"));
check("src.moverWaits", mapSrc.includes("makesStrike") && mapSrc.includes("Waiting on opportunity attacks") && mapSrc.includes("reactHold.remote") && mapSrc.includes("forgetSpent"));
check("src.passStill", v2.includes('choice === "pass"') && mapSrc.includes("function onLeaveChoice") && /if \(choice === "attack"/.test(read("assets/js/react-prompt.js")));
check("src.reactionSpend", /use === "attack" && \(oa \|\| armed\)\) use = "reaction"/.test(v2) && v2.includes("m.reaction = true") && v2.includes("payload.oa = m.oaArmed"));
check("src.rulesUntouched", !read("assets/data/rules.js").includes("attackDecision") && !read("assets/data/rules.js").includes("0.3.159") && !read("database.rules.json").includes("0.3.159") && !read("database.rules.json").includes("react-prompt"));
const ver = JSON.parse(read("version.json"));
check("src.versions", ver.sheet === "0.3.159" && ver.dmcc === "0.2.172" && ver.sheetBuild === "sheet-playtest-v03159" && ver.dmccBuild === "dmcc-playtest-v02172", JSON.stringify(ver));
check("src.banners", read("assets/js/app.js").includes('APP_VERSION = "0.3.159"') && read("dm/assets/js/dmcc.js").includes('VERSION = "0.2.172"'));

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\nn70 ok");

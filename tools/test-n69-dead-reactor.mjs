/**
 * N69 — a dead, unconscious, or defeated reactor does not freeze the N67 card.
 * Leave-reach and reaction offers skip them (auto-Pass, no card). A card that is
 * already up still answers Attack/Pass/Cast, then the pause, modal, and banner clear.
 *   node tools/test-n69-dead-reactor.mjs
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

const moveSb = { console, Math, Number, isFinite, Map, Object, Array, String };
moveSb.globalThis = moveSb;
vm.createContext(moveSb);
vm.runInContext(read("map/ssdns-map-move.js"), moveSb, { filename: "ssdns-map-move.js" });
const M = moveSb.SSDNSMapMove;

const pathOut = [{ x: 5, y: 5 }, { x: 6, y: 5 }, { x: 7, y: 5 }];
const living = { id: "wolf", x: 5, y: 6, size: 1, name: "Wolf", reachFt: 5, kind: "enemy", dmRuns: true };
function foe(extra) { return Object.assign({}, living, { id: extra.id || "foe", name: extra.name || "Bandit" }, extra); }

check("plan.living", M.leaveReachPlan(pathOut, { enemies: [living], moverSize: 1 }).pauses.length === 1);
check("plan.downFlag", M.leaveReachPlan(pathOut, { enemies: [foe({ down: true, name: "Corpse" })], moverSize: 1 }).pauses.length === 0);
check("plan.dead", M.leaveReachPlan(pathOut, { enemies: [foe({ status: "dead", name: "Dead" })], moverSize: 1 }).pauses.length === 0);
check("plan.unconscious", M.leaveReachPlan(pathOut, { enemies: [foe({ status: "Unconscious" })], moverSize: 1 }).pauses.length === 0);
check("plan.defeated", M.leaveReachPlan(pathOut, { enemies: [foe({ status: "Defeated" })], moverSize: 1 }).pauses.length === 0);
check("plan.dying", M.leaveReachPlan(pathOut, { enemies: [foe({ status: "dying" })], moverSize: 1 }).pauses.length === 0);
check("plan.zeroHp", M.leaveReachPlan(pathOut, { enemies: [foe({ hp: 0 })], moverSize: 1 }).pauses.length === 0);
check("plan.noHpPool", M.leaveReachPlan(pathOut, { enemies: [foe({ hp: 0, noHpPool: true, name: "Spectral Horse" })], moverSize: 1 }).pauses.length === 1);
check("plan.stunned", M.leaveReachPlan(pathOut, { enemies: [foe({ status: "Stunned", conditions: ["Stunned"] })], moverSize: 1 }).pauses.length === 1);
check("plan.bloodied", M.leaveReachPlan(pathOut, { enemies: [foe({ status: "Bloodied", hp: 4 })], moverSize: 1 }).pauses.length === 1);
check("plan.condition", M.leaveReachPlan(pathOut, { enemies: [foe({ conditions: [{ name: "Unconscious" }] })], moverSize: 1 }).pauses.length === 0);
const mixed = M.leaveReachPlan(pathOut, { enemies: [foe({ status: "dead", name: "Corpse", id: "dead" }), living], moverSize: 1 });
check("plan.mixed", mixed.pauses.length === 1 && mixed.pauses[0].reactors.length === 1 && mixed.pauses[0].reactors[0].name === "Wolf", JSON.stringify(mixed.pauses));

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/", runScripts: "dangerously" });
const w = dom.window;
w.eval(read("assets/js/react-prompt.js"));
const R = w.SSDNSReact;

check("down.null", R.downed(null) === false && R.downed({}) === false);
check("down.status", ["down", "dead", "unconscious", "dying", "defeated", "Down", "Dead"].every((status) => R.downed({ status })));
check("down.flags", R.downed({ dead: true }) && R.downed({ unconscious: true }) && R.downed({ defeated: true }) && R.downed({ fled: true }));
check("down.hp", R.downed({ hp: 0 }) && R.downed({ hpCurrent: "0" }) && R.downed({ hp: 3 }) === false);
check("down.pool", R.downed({ hp: 0, noHpPool: true }) === false && R.downed({ hp: 0, noHpPool: true, status: "dead" }) === true);
check("down.cond", R.downed({ conditions: ["Unconscious"] }) && R.downed({ activeConditions: [{ name: "Defeated" }] }) && R.downed({ conditions: ["Stunned"] }) === false && R.downed({ conditions: ["Prone"] }) === false);

const skipped = R.withoutSpent([{ index: 2, reactors: [
  { id: "dead", name: "Corpse", status: "dead" },
  { id: "wolf", name: "Wolf" },
  { id: "spent", name: "Spent", reaction: true }
] }]);
check("queue.skip", skipped.pauses.length === 1 && skipped.pauses[0].reactors.length === 1 && skipped.pauses[0].reactors[0].name === "Wolf");
check("queue.toast", /can't take a reaction/.test(skipped.toasts[0] || "") && /already used/.test(skipped.toasts[1] || ""), skipped.toasts.join(" | "));
check("queue.allDown", R.withoutSpent([{ index: 2, reactors: [{ name: "Corpse", hp: 0 }] }]).pauses.length === 0);

const queued = R.freshLeave({ pauses: [{ index: 2, reactors: [
  { id: "dead", name: "Corpse", status: "unconscious", dmRuns: true },
  { id: "wolf", name: "Wolf", dmRuns: true }
] }] }, pathOut.length);
const forced = R.answerLeave(queued, "attack");
check("answer.attackSkips", forced.armed !== true && forced.next === true && queued.phase === "ask" && /can't take a reaction/.test(forced.toast || ""), JSON.stringify(forced));
const next = R.leaveView(queued, "Caleb");
check("answer.nextLiving", next && next.reactorName === "Wolf" && next.down === false);
const passed = R.answerLeave(queued, "pass");
check("answer.thenCommit", passed.done === true && passed.commit && passed.commit.from === 1 && passed.commit.to === 2, JSON.stringify(passed.commit));

const already = R.freshLeave({ pauses: [{ index: 2, reactors: [{ id: "dead", name: "Corpse", hp: 0, dmRuns: true }] }] }, 3);
const passDown = R.answerLeave(already, "pass");
check("answer.passClears", passDown.done === true && passDown.commit && already.phase === "done" && already.waiting === "", JSON.stringify(passDown));

const offers = R.freshOffers([
  { kind: "damage", reactorId: "dead", reactorName: "Corpse", spellName: "Hellish Rebuke", status: "dead", text: "Cast?" },
  { kind: "spell", reactorId: "bo", reactorName: "Bo", spellName: "Counterspell", text: "Cast Counterspell?" }
]);
const castDown = R.answerOffer(offers, "cast");
check("offer.castBecomesPass", castDown.choice === "pass" && offers.spent === false && castDown.done === false && /can't take a reaction/.test(castDown.toast || ""), castDown.toast);
const castLive = R.answerOffer(offers, "cast");
check("offer.livingCast", castLive.choice === "cast" && castLive.done === true && offers.spent === true);

let choice = "";
let metaDown = false;
R.openModal({
  promptId: "p-down",
  reactorId: "dead",
  reactorName: "Corpse",
  status: "unconscious",
  kind: "leave",
  kicker: "Opportunity attack",
  text: "Leaving reach",
  choice: "attack",
  attackLabel: "Attack",
  passLabel: "Pass"
}, function (c, meta) { choice = c; metaDown = !!(meta && meta.down); });
check("open.noCard", !w.document.querySelector("[data-react-modal]") && choice === "pass" && metaDown === true);

choice = "";
R.openModal({
  promptId: "p-live",
  reactorId: "wolf",
  reactorName: "Wolf",
  kind: "leave",
  kicker: "Opportunity attack",
  text: "Caleb is leaving your reach — Opportunity attack?",
  choice: "attack",
  attackLabel: "Attack",
  passLabel: "Pass"
}, function (c) { choice = c; });
R.openMirror({
  promptId: "p-live",
  reactorId: "wolf",
  dmRuns: true,
  kicker: "Opportunity attack",
  mirrorText: "Wolf can take an opportunity attack.",
  choice: "attack",
  attackLabel: "Attack",
  passLabel: "Pass"
});
const modal = w.document.querySelector("[data-react-modal]");
const mirror = w.document.querySelector("[data-react-mirror]");
check("dom.shown", modal && mirror && modal.querySelector("[data-react-choice=attack]") && modal.querySelector("[data-react-choice=pass]") && mirror.querySelector("[data-react-choice=pass]"));
modal.querySelector("[data-react-choice=attack]").click();
check("dom.attack", choice === "attack" && w.document.querySelector("[data-react-modal]"));
check("dom.wrongId", R.releaseIfDown(["other"]) === false && !!w.document.querySelector("[data-react-modal]"));
const released = R.releaseIfDown(["wolf"]);
check("dom.release", released === true && choice === "pass" && !w.document.querySelector("[data-react-modal]") && !w.document.querySelector("[data-react-mirror]") && !w.document.querySelector("[data-react-wait]"));

R.openWait("Waiting on opportunity attacks…");
R.openModal({
  promptId: "p-pass",
  reactorId: "wolf",
  kind: "leave",
  text: "Leaving reach",
  choice: "attack",
  attackLabel: "Attack",
  passLabel: "Pass"
}, function (c) {
  choice = c;
  if (c === "pass" || c === "attack") R.close();
});
w.document.querySelector("[data-react-modal] [data-react-choice=pass]").click();
check("dom.passClears", choice === "pass" && !w.document.querySelector("[data-react-modal]") && !w.document.querySelector("[data-react-wait]"));

const mapSrc = read("map/ssdns-map.js");
const moveSrc = read("map/ssdns-map-move.js");
const v2 = read("dm/assets/js/v2.js");
const join = read("assets/js/dm-join.js");
check("src.plan", moveSrc.includes("function foeDown") && moveSrc.includes("foeDown(foe)"));
check("src.map", mapSrc.includes("function occupantReactState") && mapSrc.includes("function recheckReactHold") && mapSrc.includes("postReactAnswer"));
check("src.dm", v2.includes("function rowIsDown") && v2.includes("function settleReact") && v2.includes("closeReactPrompt"));
const counterAt = v2.indexOf("function counterspellOffers");
const damageAt = v2.indexOf("function damageReactOffers");
check("src.offers", counterAt > 0 && damageAt > 0 && v2.slice(counterAt, counterAt + 700).includes("rowIsDown(row)") && v2.slice(damageAt, damageAt + 400).includes("rowIsDown(row)"));
check("src.sheet", join.includes("function characterDown") && join.includes("postReactAnswer: postReactAnswer") && join.includes('postReactAnswer(view, "pass"'));
check("src.sync", read("assets/js/sheet-extras.js").includes("releaseIfDown"));
check("src.rulesUntouched", !read("assets/data/rules.js").includes("react-prompt") && !read("database.rules.json").includes("react-prompt") && !read("assets/data/rules.js").includes("0.3.145") && !read("database.rules.json").includes("0.3.145") && !read("database.rules.json").includes("0.2.158"));
const ver = JSON.parse(read("version.json"));
check("src.versions", ver.sheet === "0.3.145" && ver.dmcc === "0.2.158" && ver.sheetBuild === "sheet-playtest-v03145" && ver.dmccBuild === "dmcc-playtest-v02158", JSON.stringify(ver));
check("src.banners", read("assets/js/app.js").includes('APP_VERSION = "0.3.145"') && read("dm/assets/js/dmcc.js").includes('VERSION = "0.2.158"'));
check("src.cache", read("index.html").includes("react-prompt.js?v=0.3.145-n69") && read("dm/index.html").includes("react-prompt.js?v=0.2.158-n69"));

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\nn69 ok");

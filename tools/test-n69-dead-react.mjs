/**
 * N69 — a Pass from a dead or unconscious reactor must clear the pause.
 * Dead and unconscious creatures are not offered Attack or Cast.
 *   node tools/test-n69-dead-react.mjs
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
function check(id, cond, detail) {
  if (!cond) failures.push(id + (detail ? " — " + String(detail).slice(0, 500) : ""));
  console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + String(detail).slice(0, 500) : ""));
}
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
function sliceFn(src, startName, endName) {
  const start = src.indexOf("function " + startName);
  const end = src.indexOf("function " + endName);
  if (start < 0 || end < start) throw new Error("missing " + startName + " .. " + endName);
  return src.slice(start, end);
}

const moveSb = { console, Math, Number, isFinite, Map, Object, Array };
moveSb.globalThis = moveSb;
vm.createContext(moveSb);
vm.runInContext(read("map/ssdns-map-move.js"), moveSb, { filename: "ssdns-map-move.js" });
const M = moveSb.SSDNSMapMove;

const bandit = { id: "foe", x: 5, y: 6, size: 1, name: "Bandit", reachFt: 5, kind: "enemy", dmRuns: true };
const wolf = { id: "wolf", x: 5, y: 4, size: 1, name: "Wolf", reachFt: 5, kind: "enemy", dmRuns: true };
const pathOut = [{ x: 5, y: 5 }, { x: 6, y: 5 }, { x: 7, y: 5 }];

check("down.status", ["down", "Down", "dead", "unconscious", "dying"].every((status) => M.reactorDown({ status })));
check("down.hp", M.reactorDown({ hp: 0 }) && M.reactorDown({ hp: "0" }) && !M.reactorDown({ hp: 11 }));
check("down.condition", M.reactorDown({ conditions: ["Unconscious"] }) && M.reactorDown({ conditions: [{ name: "Dead" }] }) && M.reactorDown({ hp: 11, conditions: [{ name: "Dying" }] }));
check("down.pool", !M.reactorDown({ hp: 0, noHpPool: true }) && M.reactorDown({ hp: 0, noHpPool: true, status: "Down" }));
check("down.living", !M.reactorDown({ hp: 11, status: "" }) && !M.reactorDown(null));

const corpse = Object.assign({}, bandit, { status: "down" });
check("plan.skipDown", M.leaveReachPlan(pathOut, { enemies: [corpse], moverSize: 1 }).pauses.length === 0);
check("plan.livingStill", M.leaveReachPlan(pathOut, { enemies: [bandit], moverSize: 1 }).pauses.length === 1);
const mixed = M.leaveReachPlan(pathOut, { enemies: [corpse, wolf], moverSize: 1 });
check("plan.onlyWolf", mixed.pauses.length === 1 && mixed.pauses[0].reactors.length === 1 && mixed.pauses[0].reactors[0].name === "Wolf", JSON.stringify(mixed.pauses));
check("plan.hp0", M.leaveReachPlan(pathOut, { enemies: [Object.assign({}, bandit, { hp: 0 })], moverSize: 1 }).pauses.length === 0);
check("plan.unconscious", M.leaveReachPlan(pathOut, { enemies: [Object.assign({}, bandit, { conditions: [{ name: "Unconscious" }] })], moverSize: 1 }).pauses.length === 0);
check("plan.noHpPool", M.leaveReachPlan(pathOut, { enemies: [Object.assign({}, bandit, { hp: 0, noHpPool: true })], moverSize: 1 }).pauses.length === 1);
check("plan.disengage", M.leaveReachPlan(pathOut, { enemies: [bandit], disengage: true }).pauses.length === 0);

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/", runScripts: "dangerously" });
const w = dom.window;
w.eval(read("assets/js/react-prompt.js"));
const R = w.SSDNSReact;

check("cannot.same", R.cannotReact({ status: "Down" }) && R.cannotReact({ hp: 0 }) && !R.cannotReact({ hp: 0, noHpPool: true }) && R.cannotReact({ conditions: ["unconscious"] }));

const skipped = R.withoutSpent([{ index: 2, reactors: [
  { id: "foe", name: "Bandit", status: "down" },
  { id: "wolf", name: "Wolf", reaction: true },
  { id: "scout", name: "Scout", hp: 8 }
] }]);
check("spent.silentDown", skipped.pauses.length === 1 && skipped.pauses[0].reactors.length === 1 && skipped.pauses[0].reactors[0].name === "Scout" && skipped.toasts.length === 1 && /Wolf/.test(skipped.toasts[0]), JSON.stringify(skipped));

const deadSession = R.freshLeave({ pauses: [{ index: 2, reactors: [Object.assign({}, bandit, { hp: 0 }), wolf] }] }, pathOut.length);
const attacked = R.answerLeave(deadSession, "attack", { oaId: "oa_dead" });
check("attack.corpsePasses", attacked.armed !== true && attacked.next === true && deadSession.phase !== "attacking", JSON.stringify(attacked));
const cancelWolf = R.answerLeave(deadSession, "cancel");
check("cancel.commits", cancelWolf.done === true && cancelWolf.commit && cancelWolf.commit.to === 2, JSON.stringify(cancelWolf));

const livingAttack = R.freshLeave({ pauses: [{ index: 2, reactors: [bandit] }] }, pathOut.length);
const armed = R.answerLeave(livingAttack, "attack", { oaId: "oa_live" });
check("attack.livingHolds", armed.armed === true && livingAttack.phase === "attacking");

const offerSession = R.freshOffers([
  { kind: "damage", reactorName: "Ada", reactorId: "ada", spellName: "Hellish Rebuke", status: "unconscious", text: "Cast?" },
  { kind: "damage", reactorName: "Bo", reactorId: "bo", spellName: "Hellish Rebuke", text: "Cast?" }
]);
const downOffer = R.offerView(offerSession);
check("offer.downHidesCast", downOffer && downOffer.down === true);
R.openModal(downOffer, function () {});
check("offer.noCastButton", !w.document.querySelector("[data-react-choice=cast]") && !!w.document.querySelector("[data-react-choice=pass]"));
R.close();
const passedOffer = R.answerOffer(offerSession, "cast");
check("offer.castBecomesPass", passedOffer.choice === "pass" && offerSession.spent !== true && passedOffer.done === false, JSON.stringify(passedOffer));
const livingCast = R.answerOffer(offerSession, "cast");
check("offer.livingCast", livingCast.choice === "cast" && offerSession.spent === true);

const card = R.leaveView(R.freshLeave({ pauses: [{ index: 2, reactors: [Object.assign({}, bandit, { status: "dead" })] }] }, 3), "Caleb");
R.openModal(card, function () {});
R.openMirror(card, function () {});
check("card.passOnly", !w.document.querySelector("[data-react-choice=attack]") && w.document.querySelectorAll("[data-react-choice=pass]").length === 2);
R.close();

let thrownClosed = false;
R.openWait("Waiting on opportunity attacks…");
R.openModal({
  kind: "leave", kicker: "Opportunity attack", text: "Caleb is leaving your reach — Opportunity attack?",
  choice: "attack", attackLabel: "Attack", passLabel: "Pass"
}, function () { throw new Error("slide failed"); });
w.document.querySelector("[data-react-choice=pass]").click();
thrownClosed = !w.document.querySelector("[data-react-modal]") && !w.document.querySelector("[data-react-wait]");
check("dom.passThrowClears", thrownClosed);

const commands = [];
const prompts = [];
const fightRows = [];
const ctx = {
  console,
  window: w,
  DM: {
    state: { uid: "dm" },
    pushCommand(cmd) { commands.push(JSON.parse(JSON.stringify(cmd))); }
  },
  fightRowById(id) {
    const want = String(id || "");
    return fightRows.find((row) => row && (row.id === want || row.playerId === want)) || null;
  },
  noHpPoolRow(row) { return !!(row && row.noHpPool); },
  armReactOa() { return ctx._arm !== false; },
  clearReactOa() {},
  rememberReactArm() {},
  armedReactByOa: {},
  castReactOffer() {},
  reactChoiceLocal(view) { return !!(view && (view.dmRuns || view.self || view.reactorKind !== "player")); },
  pushReactPrompt(view) { prompts.push(view); }
};
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(sliceFn(read("dm/assets/js/v2.js"), "pushReactAnswer", "castReactOffer"), ctx, { filename: "presentReact.js" });

function leaveCard(over) {
  return Object.assign({
    promptId: "p1",
    kind: "leave",
    kicker: "Opportunity attack",
    text: "Caleb is leaving your reach — Opportunity attack?",
    mirrorText: "Bandit can take an opportunity attack as Caleb leaves reach.",
    choice: "attack",
    attackLabel: "Attack",
    passLabel: "Pass",
    dmRuns: true,
    reactorId: "foe",
    reactorName: "Bandit",
    reactorKind: "enemy",
    reactorPlayerId: "pc-bandit",
    moverPlayerId: "player1",
    moverName: "Caleb"
  }, over || {});
}
function kinds() { return commands.map((c) => c.type + ":" + (c.payload && c.payload.choice || "")); }

fightRows.push({ id: "foe", name: "Bandit", status: "Down", hp: 0, conditions: [] });
let auto = null;
const autoRet = ctx.presentReact(leaveCard(), function (choice, meta) { auto = { choice, meta }; });
check("dm.autoPass", autoRet === true && auto && auto.choice === "pass" && auto.meta && auto.meta.down === true && !w.document.querySelector("[data-react-modal]"), JSON.stringify(auto));

commands.length = 0;
fightRows[0] = { id: "foe", name: "Bandit", status: "", hp: 11, conditions: [{ name: "Unconscious" }] };
ctx.presentReact(leaveCard({ hp: "", status: "" }), null);
check("dm.rowUnconscious", !w.document.querySelector("[data-react-modal]") && kinds().indexOf("reactAnswer:pass") >= 0 && commands.some((c) => c.type === "reactClose" && c.to === "pc-bandit"), kinds().join(","));

commands.length = 0;
let nextText = "";
fightRows[0] = { id: "foe", status: "dead", hp: 0 };
ctx.presentReact(leaveCard(), function () {
  R.openModal({
    kind: "leave", kicker: "Opportunity attack", text: "Wolf is next",
    choice: "attack", attackLabel: "Attack", passLabel: "Pass", dmRuns: true
  }, function () {});
});
nextText = (w.document.querySelector("[data-react-modal]") || {}).textContent || "";
check("dm.keepsNext", /Wolf is next/.test(nextText) && !!w.document.querySelector("[data-react-choice=attack]"), nextText);
R.close();

commands.length = 0;
prompts.length = 0;
fightRows[0] = { id: "foe", status: "", hp: 11, conditions: [] };
ctx._arm = true;
ctx.presentReact(leaveCard(), null);
check("dm.cardShown", !!w.document.querySelector("[data-react-modal]") && !!w.document.querySelector("[data-react-mirror]") && prompts.length === 0);
w.document.querySelector("[data-react-modal] [data-react-choice=pass]").click();
check("dm.passClears", !w.document.querySelector("[data-react-modal]") && !w.document.querySelector("[data-react-mirror]") && !w.document.querySelector("[data-react-wait]"));
check("dm.passAnswers", commands.some((c) => c.type === "reactAnswer" && c.to === "player1" && c.payload.choice === "pass") && commands.some((c) => c.type === "reactClose" && c.to === "pc-bandit"), kinds().join(","));

commands.length = 0;
ctx.presentReact(leaveCard(), null);
w.document.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
check("dm.escapeClears", !w.document.querySelector("[data-react-modal]") && commands.some((c) => c.type === "reactAnswer" && c.payload.choice === "pass"), kinds().join(","));

commands.length = 0;
ctx.presentReact(leaveCard(), function () { throw new Error("slide failed"); });
w.document.querySelector("[data-react-choice=pass]").click();
check("dm.throwClears", !w.document.querySelector("[data-react-modal]") && !w.document.querySelector("[data-react-mirror]"));

commands.length = 0;
ctx.presentReact(leaveCard(), null);
w.document.querySelector("[data-react-choice=attack]").click();
check("dm.attackStays", !!w.document.querySelector("[data-react-modal]") && commands.some((c) => c.type === "reactAnswer" && c.payload.choice === "attack") && !commands.some((c) => c.type === "reactClose"), kinds().join(","));
R.close();

commands.length = 0;
ctx._arm = false;
ctx.presentReact(leaveCard(), null);
w.document.querySelector("[data-react-choice=attack]").click();
check("dm.spentArmPasses", !w.document.querySelector("[data-react-modal]") && commands.some((c) => c.type === "reactAnswer" && c.payload.choice === "pass"), kinds().join(","));

fightRows[0] = { id: "foe", hp: 0, noHpPool: true, status: "" };
ctx._arm = true;
ctx.presentReact(leaveCard(), null);
check("dm.noHpPoolOffers", !!w.document.querySelector("[data-react-choice=attack]"));
R.close();

const v2 = read("dm/assets/js/v2.js");
const offers = sliceFn(v2, "counterspellOffers", "runReactOffers");
check("src.offersSkip", offers.indexOf("viewCannotReact") < offers.indexOf("tokenReactionSpells") && offers.split("viewCannotReact").length >= 3);
const mapSrc = read("map/ssdns-map.js");
check("src.map", mapSrc.includes("view.down && !view.hideAttack") && mapSrc.includes("conditions: tokenConditions(t)") && mapSrc.includes("catch (e) {\n    clearReactHold();"));
check("src.move", read("map/ssdns-map-move.js").includes("if (!foe || foe.ally || reactorDown(foe)) continue;"));
const join = read("assets/js/dm-join.js");
check("src.join", join.includes('case "reactClose"') && join.includes("R.cannotReact(view)") && join.includes('postReactAnswer(view, "pass", { down: true })'));
check("src.rulesUntouched", !read("assets/data/rules.js").includes("reactClose") && !read("database.rules.json").includes("reactClose") && !read("assets/data/rules.js").includes("0.3.145") && !read("database.rules.json").includes("0.3.145"));
const ver = JSON.parse(read("version.json"));
check("src.versions", ver.sheet === "0.3.145" && ver.dmcc === "0.2.158" && ver.sheetBuild === "sheet-playtest-v03145" && ver.dmccBuild === "dmcc-playtest-v02158", JSON.stringify(ver));

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\nn69 ok");

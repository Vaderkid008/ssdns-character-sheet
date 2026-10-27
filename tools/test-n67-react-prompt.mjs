/**
 * N67 — leave-reach opportunity attacks pause the step, and reaction spells
 * open on their trigger (damage, spell cast). Pass continues the move.
 * Attack spends Reaction, not Action.
 *   node tools/test-n67-react-prompt.mjs
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
const plan = M.leaveReachPlan(pathOut, { enemies: [bandit], moverSize: 1 });
check("plan.pauseIndex", plan.pauses.length === 1 && plan.pauses[0].index === 2 && plan.pauses[0].reactors[0].name === "Bandit", JSON.stringify(plan.pauses));
check("plan.stillInReach", M.leaveReachPlan([{ x: 5, y: 5 }, { x: 6, y: 5 }], { enemies: [bandit], moverSize: 1 }).pauses.length === 0);
check("plan.disengage", M.leaveReachPlan(pathOut, { enemies: [bandit], disengage: true }).pauses.length === 0);
check("plan.teleport", M.leaveReachPlan(pathOut, { enemies: [bandit], teleport: true }).pauses.length === 0);
check("plan.forced", M.leaveReachPlan(pathOut, { enemies: [bandit], forced: true }).pauses.length === 0);
check("plan.ally", M.leaveReachPlan(pathOut, { enemies: [Object.assign({}, bandit, { ally: true })], moverSize: 1 }).pauses.length === 0);

const large = { id: "ogre", x: 10, y: 10, size: 2, name: "Ogre", reachFt: 5, kind: "enemy" };
check("plan.largeFeet", M.feetBetweenBoxes({ x: 9, y: 10, size: 1 }, large) === 5);
const largeLeave = M.leaveReachPlan([{ x: 9, y: 10 }, { x: 8, y: 10 }], { enemies: [large], moverSize: 1 });
check("plan.largeLeave", largeLeave.pauses.length === 1 && largeLeave.pauses[0].index === 1, JSON.stringify(largeLeave.pauses));
check("plan.largeStay", M.leaveReachPlan([{ x: 9, y: 10 }, { x: 9, y: 11 }], { enemies: [large], moverSize: 1 }).pauses.length === 0);

const wolf = { id: "wolf", x: 5, y: 4, size: 1, name: "Wolf", reachFt: 5, kind: "enemy", dmRuns: true };
const both = M.leaveReachPlan(pathOut, { enemies: [bandit, wolf], moverSize: 1 });
check("plan.twoReactors", both.pauses.length === 1 && both.pauses[0].reactors.length === 2, JSON.stringify(both.pauses.map((p) => p.reactors.map((r) => r.name))));

const laterPath = [
  { x: 5, y: 5 }, { x: 6, y: 5 }, { x: 7, y: 5 }, { x: 8, y: 5 }, { x: 9, y: 5 }, { x: 10, y: 5 }, { x: 11, y: 5 }
];
const far = { id: "scout", x: 9, y: 6, size: 1, name: "Scout", reachFt: 5, kind: "enemy" };
const staged = M.leaveReachPlan(laterPath, { enemies: [bandit, far], moverSize: 1 });
check("plan.twoSteps", staged.pauses.length === 2 && staged.pauses[0].index === 2 && staged.pauses[1].index === 6, JSON.stringify(staged.pauses.map((p) => p.index + ":" + p.reactors[0].name)));

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/", runScripts: "dangerously" });
const w = dom.window;
w.eval(read("assets/js/react-prompt.js"));
w.eval(read("assets/js/action-pips.js"));
const R = w.SSDNSReact;
const P = w.SSDNSActionPips;

const skipped = R.withoutSpent([{ index: 2, reactors: [
  { id: "foe", name: "Bandit", reaction: true },
  { id: "wolf", name: "Wolf", reaction: false }
] }]);
check("spent.toast", skipped.pauses.length === 1 && skipped.pauses[0].reactors.length === 1 && skipped.pauses[0].reactors[0].name === "Wolf" && /already used/.test(skipped.toasts[0] || ""));
check("spent.all", R.withoutSpent([{ index: 2, reactors: [{ name: "Bandit", reaction: true }] }]).pauses.length === 0);

const session = R.freshLeave(both, pathOut.length);
session.moverName = "Caleb";
const first = R.leaveView(session, "Caleb");
check("card.copy", first && first.text === "Caleb is leaving your reach — Opportunity attack?" && first.attackLabel === "Attack" && first.passLabel === "Pass" && first.kind === "leave");
const passOne = R.answerLeave(session, "pass");
check("pass.queues", passOne.commit == null && passOne.next === true && passOne.done === false, JSON.stringify(passOne));
const second = R.leaveView(session, "Caleb");
check("pass.secondName", second && second.reactorName === "Wolf", second && second.reactorName);
const passTwo = R.answerLeave(session, "pass");
check("pass.commits", passTwo.done === true && passTwo.commit && passTwo.commit.from === 1 && passTwo.commit.to === 2, JSON.stringify(passTwo.commit));

const stagedSession = R.freshLeave(staged, laterPath.length);
const firstLeg = R.answerLeave(stagedSession, "pass");
check("pass.firstLeg", firstLeg.commit && firstLeg.commit.from === 1 && firstLeg.commit.to === 5 && firstLeg.done === false, JSON.stringify(firstLeg.commit));
const secondLeg = R.answerLeave(stagedSession, "pass");
check("pass.secondLeg", secondLeg.done === true && secondLeg.commit && secondLeg.commit.from === 5 && secondLeg.commit.to === 6, JSON.stringify(secondLeg.commit));

const attackSession = R.freshLeave({ pauses: [{ index: 2, reactors: [bandit] }] }, pathOut.length);
const armed = R.answerLeave(attackSession, "attack", { oaId: "oa_n67" });
check("attack.holds", armed.armed === true && armed.commit == null && armed.oaId === "oa_n67" && attackSession.phase === "attacking");
const held = R.leaveView(attackSession, "Caleb");
check("attack.prompt", held && held.hideAttack === true && /spends your reaction/.test(held.text) && held.oaId === "oa_n67");
const resolved = R.answerLeave(attackSession, "attacked", { oaId: "oa_n67" });
check("attack.thenCommit", resolved.done === true && resolved.commit && resolved.commit.from === 1 && resolved.commit.to === 2, JSON.stringify(resolved.commit));

const spentAttack = R.freshLeave({ pauses: [{ index: 2, reactors: [Object.assign({}, bandit, { reaction: true })] }] }, 3);
const refused = R.answerLeave(spentAttack, "attack");
check("attack.alreadySpent", refused.commit && /already used/.test(refused.toast || ""), refused.toast);

check("trigger.rebuke", R.triggerOf("Hellish Rebuke") === "damage" && R.rangeFt("Hellish Rebuke") === 60);
check("trigger.absorb", R.triggerOf("Absorb Elements") === "damage" && R.rangeFt("Absorb Elements") === 0 && R.inRange(1000, "Absorb Elements") === true);
check("trigger.counter", R.triggerOf("Counterspell") === "spell" && R.rangeFt("Counterspell") === 60);
check("trigger.shield", R.triggerOf("Shield") === "" && R.triggerOf("Feather Fall") === "");
const spells = [
  { name: "Shield", level: 1 },
  { name: "Hellish Rebuke", level: 1 },
  { name: "Absorb Elements", level: 1 },
  { name: "Counterspell", level: 3 }
];
check("filter.damage", R.eligible(spells, "damage", 30).map((s) => s.name).join(",") === "Hellish Rebuke,Absorb Elements");
check("filter.counterNear", R.eligible(spells, "spell", 30).map((s) => s.name).join(",") === "Counterspell");
check("filter.counterFar", R.eligible(spells, "spell", 65).length === 0);
check("filter.counterUnknown", R.eligible(spells, "spell", null).length === 1);

const offers = R.freshOffers([
  { kind: "damage", reactorName: "Ada", spellName: "Hellish Rebuke", text: "Bandit damaged you — Cast Hellish Rebuke?", reactorKind: "player" },
  { kind: "damage", reactorName: "Bo", spellName: "Hellish Rebuke", text: "Bandit damaged you — Cast Hellish Rebuke?", reaction: true }
]);
const offer = R.offerView(offers);
check("offer.copy", offer && offer.attackLabel === "Cast" && offer.passLabel === "Pass" && /Hellish Rebuke/.test(offer.text));
const cast = R.answerOffer(offers, "cast");
check("offer.castSpends", cast.choice === "cast" && offers.spent === true && cast.done === false);
const blocked = R.answerOffer(offers, "cast");
check("offer.oneReaction", blocked.choice === "pass" && /already used/.test(blocked.toast) && blocked.done === true, blocked.toast);

let asked = false;
check("gate.noHost", R.gateSpell({ spellName: "Fireball" }, function () {}) === false);
R.castingReaction = true;
w.SSDNSReactHost = { askSpell: function () { asked = true; return true; } };
check("gate.reactionCast", R.gateSpell({ spellName: "Counterspell" }, function () {}) === false && asked === false);
R.castingReaction = false;
check("gate.waits", R.gateSpell({ spellName: "Fireball" }, function () {}) === true && asked === true);

P.reset(true);
P.setOa("oaArmed", "oa_sheet");
let noted = "";
R.watchSpent("oa_sheet", function (id) { noted = id; });
const oaRoll = P.attack("Scimitar");
const afterOa = P.state();
check("pips.reactionNotAction", afterOa.reaction === true && afterOa.action === false && afterOa.oaArmed === "" && afterOa.oaUsed === "oa_sheet" && oaRoll.oa === "oa_sheet" && noted === "oa_sheet", JSON.stringify(afterOa));
P.reset(true);
P.attack("Scimitar");
const afterAction = P.state();
check("pips.normalAttack", afterAction.action === true && afterAction.reaction === false && !afterAction.oaUsed);

let clicked = "";
R.openModal({
  kind: "leave",
  kicker: "Opportunity attack",
  text: "Caleb is leaving your reach — Opportunity attack?",
  choice: "attack",
  attackLabel: "Attack",
  passLabel: "Pass",
  mirrorText: "Bandit can take an opportunity attack as Caleb leaves reach."
}, function (choice) { clicked = choice; });
R.openMirror({
  kind: "leave",
  kicker: "Opportunity attack",
  dmRuns: true,
  text: "Caleb is leaving your reach — Opportunity attack?",
  mirrorText: "Bandit can take an opportunity attack as Caleb leaves reach.",
  choice: "attack",
  attackLabel: "Attack"
});
const modal = w.document.querySelector("[data-react-modal]");
const mirror = w.document.querySelector("[data-react-mirror]");
check("dom.modal", modal && /Opportunity attack/.test(modal.textContent) && modal.querySelector("[data-react-choice=attack]") && modal.querySelector("[data-react-choice=pass]"));
check("dom.mirror", mirror && /DM ·/.test(mirror.textContent) && mirror.querySelector("[data-react-choice=pass]"));
modal.querySelector("[data-react-choice=pass]").click();
check("dom.pass", clicked === "pass");
R.close();

R.openModal({
  kind: "damage",
  kicker: "Reaction",
  text: "Bandit damaged you — Cast Hellish Rebuke?",
  choice: "cast",
  attackLabel: "Cast",
  passLabel: "Pass",
  disabled: true
}, function () { clicked = "cast"; });
const disabled = w.document.querySelector("[data-react-modal] [data-react-choice=cast]");
check("dom.disabled", disabled && disabled.disabled);
disabled.click();
check("dom.disabledIgnored", clicked === "pass");
R.close();

const mapSrc = read("map/ssdns-map.js");
check("src.pause", mapSrc.includes("leaveReachPlan") && mapSrc.includes("Waiting on opportunity attacks") && !mapSrc.includes("still wait on the DM"));
check("src.noRepost", mapSrc.includes("refreshArmedCard") && mapSrc.includes("reactHold.remote"));
const menuAt = read("assets/js/action-pips.js").indexOf("function openReactionMenu");
check("src.manualMenu", menuAt > 0 && !/leaveReach|onHit/.test(read("assets/js/action-pips.js").slice(menuAt)));
const v2 = read("dm/assets/js/v2.js");
check("src.dmTriggers", v2.includes("function damageReactOffers") && v2.includes("function counterspellOffers") && v2.includes("function notifyReactSpent") && v2.includes("_reactGo") && v2.includes("reactGo"));
check("src.join", read("assets/js/dm-join.js").includes('type: "react"') && read("assets/js/dm-join.js").includes("reactPrompt") && read("assets/js/dm-join.js").includes("askSpell"));
check("src.castGate", read("assets/js/sheet-extras.js").includes("gateSpell"));
check("src.scripts", read("index.html").includes("assets/js/react-prompt.js") && read("dm/index.html").includes("../assets/js/react-prompt.js"));
check("src.rulesUntouched", !read("assets/data/rules.js").includes("react-prompt") && !read("database.rules.json").includes("react-prompt") && !read("assets/data/rules.js").includes("0.3.159") && !read("database.rules.json").includes("0.3.159"));
const ver = JSON.parse(read("version.json"));
check("src.versions", ver.sheet === "0.3.159" && ver.dmcc === "0.2.172" && ver.sheetBuild === "sheet-playtest-v03159" && ver.dmccBuild === "dmcc-playtest-v02172", JSON.stringify(ver));

const art = "/opt/cursor/artifacts";
fs.mkdirSync(art, { recursive: true });
const css = read("assets/css/sheet.css");
const promptJs = read("assets/js/react-prompt.js");
function shotHtml(kind) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${css} body{margin:0;background:#1a1612;min-height:100vh}</style></head><body>
<script>${promptJs}<\/script>
<script>
  var R = window.SSDNSReact;
  var kind = ${JSON.stringify(kind)};
  if (kind === "leave") {
    R.openWait("Waiting on opportunity attacks…");
    R.openModal({ kind: "leave", kicker: "Opportunity attack", text: "Caleb is leaving your reach — Opportunity attack?", choice: "attack", attackLabel: "Attack", passLabel: "Pass" });
    R.openMirror({ kind: "leave", kicker: "Opportunity attack", dmRuns: true, mirrorText: "Bandit can take an opportunity attack as Caleb leaves reach.", choice: "attack", attackLabel: "Attack", passLabel: "Pass" });
  } else if (kind === "rebuke") {
    R.openModal({ kind: "damage", kicker: "Reaction", text: "Bandit damaged you — Cast Hellish Rebuke?", choice: "cast", attackLabel: "Cast", passLabel: "Pass" });
    R.openMirror({ kind: "damage", kicker: "Reaction", dmRuns: true, mirrorText: "Ada — Bandit damaged you — Cast Hellish Rebuke?", choice: "cast", attackLabel: "Cast" });
  } else {
    R.openModal({ kind: "spell", kicker: "Counterspell", text: "Mara is casting Fireball — Cast Counterspell?", choice: "cast", attackLabel: "Cast", passLabel: "Pass" });
    R.openMirror({ kind: "spell", kicker: "Counterspell", dmRuns: false, mirrorText: "Bo — Mara is casting Fireball — Cast Counterspell?" });
  }
<\/script></body></html>`;
}
const puppeteer = (await import("/tmp/pup/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js")).default;
const browser = await puppeteer.launch({ executablePath: "/opt/google/chrome/chrome", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 980, height: 640, deviceScaleFactor: 1 });
  const shots = [
    ["leave", "n67-leave-reach.png"],
    ["rebuke", "n67-hellish-rebuke.png"],
    ["counter", "n67-counterspell.png"]
  ];
  for (const pair of shots) {
    await page.setContent(shotHtml(pair[0]), { waitUntil: "domcontentloaded" });
    await page.waitForSelector("[data-react-modal]");
    const file = path.join(art, pair[1]);
    await page.screenshot({ path: file });
    check("shot." + pair[0], fs.existsSync(file) && fs.statSync(file).size > 1000, file);
  }
} finally {
  await browser.close();
}

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\nn67 ok");

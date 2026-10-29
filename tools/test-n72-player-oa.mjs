/**
 * N72 — a player reactor owns the leave-reach card. The DM waits, then
 * Allow / Deny. Gunsmoke Caster may Cast a 1-action single-target spell.
 *   node tools/test-n72-player-oa.mjs
 */
import fs from "node:fs";
import path from "node:path";
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
w.eval(read("assets/js/spell-fx.js"));
w.eval(read("assets/js/react-prompt.js"));
w.eval(read("assets/js/action-pips.js"));
const R = w.SSDNSReact;
const P = w.SSDNSActionPips;

const pathOut = [{ x: 5, y: 5 }, { x: 6, y: 5 }, { x: 7, y: 5 }];
const ada = { id: "ada", name: "Ada", kind: "player", playerId: "p1", dmRuns: false };
const witch = { id: "witch", name: "Cactus Witch", kind: "enemy", dmRuns: true };
const dmPc = { id: "bo", name: "Bo", kind: "player", playerId: "p2", dmRuns: true, dmActsAs: true };

function session(reactor) {
  const s = R.freshLeave({ pauses: [{ index: 2, reactors: [reactor] }] }, pathOut.length);
  s.moverName = "Silas";
  return s;
}

check("gunsmoke.id", R.hasGunsmoke(["gunsmoke-caster"]) && R.hasGunsmoke("Gunsmoke Caster") && R.hasGunsmoke("war caster") && !R.hasGunsmoke(["pistolero"]));

const book = [
  { name: "Fire Bolt", level: 0 },
  { name: "Sacred Flame", level: 0 },
  { name: "Shield", level: 1 },
  { name: "Hellish Rebuke", level: 1 },
  { name: "Burning Hands", level: 1 },
  { name: "Magic Missile", level: 1 },
  { name: "Eldritch Blast", level: 0 },
  { name: "Cure Wounds", level: 1 },
  { name: "Guiding Bolt", level: 1 }
];
check("cast.fireBolt", R.oaCastEligible("Fire Bolt") === true);
check("cast.sacred", R.oaCastEligible("Sacred Flame") === true);
check("cast.cure", R.oaCastEligible("Cure Wounds") === true);
check("cast.guiding", R.oaCastEligible("Guiding Bolt") === true);
check("cast.shield", R.oaCastEligible("Shield") === false);
check("cast.rebuke", R.oaCastEligible("Hellish Rebuke") === false);
check("cast.burning", R.oaCastEligible("Burning Hands") === false);
check("cast.missile", R.oaCastEligible("Magic Missile") === false);
check("cast.blast", R.oaCastEligible("Eldritch Blast") === false);
check("cast.acid", R.oaCastEligible("Acid Splash") === false);
const offered = R.oaCastChoices(book).map((s) => s.name);
check("cast.list", offered.join(",") === "Fire Bolt,Sacred Flame,Cure Wounds,Guiding Bolt", offered.join(","));

const plain = session(ada);
const plainView = R.leaveView(plain, "Silas");
check("player.owns", plainView && plainView.playerOwns === true && plainView.dmRuns === false && plainView.gunsmoke === false && plainView.reactorPlayerId === "p1");
check("player.copy", plainView.text === "Silas is leaving your reach — Opportunity attack?" && /deciding on an opportunity attack/.test(plainView.mirrorText));
R.openModal(plainView);
R.openMirror(plainView);
const modal = w.document.querySelector("[data-react-modal]");
const mirror = w.document.querySelector("[data-react-mirror]");
check("player.modal", modal && modal.querySelector("[data-react-choice=attack]") && modal.querySelector("[data-react-choice=pass]") && !modal.querySelector("[data-react-choice=cast]"));
check("player.mirrorWaits", mirror && !mirror.querySelector("[data-react-choice=attack]") && !mirror.querySelector("[data-react-choice=pass]") && mirror.querySelector("[data-react-choice=cancel]") && /deciding on an opportunity attack/.test(mirror.textContent));
R.close();

const gun = Object.assign({}, ada, { gunsmoke: true, feats: ["gunsmoke-caster"] });
const gunView = R.leaveView(session(gun), "Silas");
gunView.spells = R.oaCastChoices(book);
check("gun.flag", gunView.gunsmoke === true && gunView.playerOwns === true);
R.openModal(gunView);
const castBtn = w.document.querySelector('[data-react-choice=cast][data-spell="Fire Bolt"]');
const burningBtn = w.document.querySelector('[data-react-choice=cast][data-spell="Burning Hands"]');
const shieldBtn = w.document.querySelector('[data-react-choice=cast][data-spell="Shield"]');
check("gun.castButton", !!castBtn && !burningBtn && !shieldBtn);
R.close();

const asked = session(ada);
const pending = R.answerLeave(asked, "attack", {});
check("player.pending", pending.pending === true && pending.armed !== true && pending.hold === true && asked.phase === "approving" && !asked.oaId, JSON.stringify(pending));
const waiting = R.leaveView(asked, "Silas");
R.openMirror(waiting);
const approve = w.document.querySelector("[data-react-mirror]");
check("player.allowDeny", waiting.approving === true && approve && approve.querySelector("[data-react-choice=allow]") && approve.querySelector("[data-react-choice=deny]") && !approve.querySelector("[data-react-choice=attack]"));
R.close();
const allowed = R.answerLeave(asked, "allow", { oaId: "oa_ada" });
check("player.allowArms", allowed.armed === true && allowed.cast !== true && allowed.oaId === "oa_ada" && asked.phase === "attacking" && allowed.commit == null);
const struck = R.answerLeave(asked, "attacked", { oaId: "oa_ada" });
check("player.thenCommit", struck.done === true && struck.commit && struck.commit.to === 2 && asked.phase === "done");

const deniedSession = session(ada);
R.answerLeave(deniedSession, "attack", {});
const denied = R.answerLeave(deniedSession, "deny", {});
check("player.denyReleases", denied.armed !== true && denied.done === true && denied.commit && denied.commit.to === 2 && /denied/.test(denied.toast || "") && deniedSession.phase === "done", denied.toast);

const passed = R.answerLeave(session(ada), "pass", {});
check("player.passReleases", passed.armed !== true && passed.done === true && passed.commit && passed.commit.to === 2);

const remote = session(ada);
const remoteAllow = R.answerLeave(remote, "allow", { oaId: "oa_remote" });
check("player.allowFromAsk", remoteAllow.armed === true && remote.phase === "attacking" && remoteAllow.oaId === "oa_remote");

const castAsk = session(gun);
const castPending = R.answerLeave(castAsk, "cast", { spellName: "Fire Bolt", spellLevel: 0, gunsmoke: true });
check("cast.pending", castPending.pending === true && castPending.armed !== true && castAsk.phase === "approving" && castPending.spellName === "Fire Bolt");
const castAllowed = R.answerLeave(castAsk, "allow", { oaId: "oa_cast", spellName: "Fire Bolt", spellLevel: 0, gunsmoke: true });
check("cast.allow", castAllowed.armed === true && castAllowed.cast === true && castAllowed.spellName === "Fire Bolt" && castAsk.phase === "casting");
const casting = R.leaveView(castAsk, "Silas");
check("cast.card", casting && casting.hideAttack === true && /Cast Fire Bolt at Silas/.test(casting.text) && /reaction, not your action/.test(casting.text));

const badCast = R.answerLeave(session(gun), "cast", { spellName: "Hellish Rebuke", gunsmoke: true });
check("cast.rebukePasses", badCast.armed !== true && badCast.pending !== true && badCast.done === true && badCast.commit);
const noFeat = R.answerLeave(session(ada), "cast", { spellName: "Fire Bolt", spellLevel: 0 });
check("cast.noFeatPasses", noFeat.done === true && noFeat.armed !== true && noFeat.commit);

const enemySession = session(witch);
const enemy = R.answerLeave(enemySession, "attack", { oaId: "oa_witch" });
check("enemy.armsNow", enemy.armed === true && enemy.pending !== true && enemySession.phase === "attacking" && enemy.oaId === "oa_witch");
const enemyView = R.leaveView(session(witch), "Silas");
check("enemy.dmOwns", enemyView.dmRuns === true && enemyView.playerOwns === false && !/deciding on an opportunity attack/.test(enemyView.mirrorText));
R.openMirror(enemyView);
const dmMirror = w.document.querySelector("[data-react-mirror]");
check("enemy.mirrorAttack", dmMirror && dmMirror.querySelector("[data-react-choice=attack]") && dmMirror.querySelector("[data-react-choice=pass]"));
R.close();

const dmRun = R.answerLeave(session(dmPc), "attack", { oaId: "oa_bo" });
const dmView = R.leaveView(session(dmPc), "Silas");
check("dmRun.armsNow", dmView.dmRuns === true && dmView.playerOwns === false && dmRun.armed === true && dmRun.pending !== true);

let a = 0;
let b = 0;
R.watchSpent("oa_both", function () { a += 1; });
R.watchSpent("oa_both", function () { b += 1; });
check("spent.both", R.noteSpent("oa_both") === true && a === 1 && b === 1 && R.noteSpent("oa_both") === false);

P.reset(true);
P.setOa("oaArmed", "oa_cast");
R.oaCast = { id: "oa_cast", name: "Fire Bolt", level: 0 };
let spentId = "";
R.watchSpent("oa_cast", function (id) { spentId = id; });
const oaSpell = P.spell("Fire Bolt");
const afterCast = P.state();
check("pips.castReaction", oaSpell.cost === "reaction" && oaSpell.oa === "oa_cast" && afterCast.reaction === true && afterCast.action === false && afterCast.oaArmed === "" && spentId === "oa_cast" && R.oaCast == null, JSON.stringify(afterCast));

P.reset(true);
R.oaCast = null;
const normal = P.spell("Fire Bolt");
const afterNormal = P.state();
check("pips.castAction", normal.cost === "action" && !normal.oa && afterNormal.action === true && afterNormal.reaction === false, JSON.stringify(afterNormal));

P.reset(true);
P.setOa("oaArmed", "oa_other");
R.oaCast = { id: "oa_other", name: "Fire Bolt", level: 0 };
const mismatched = P.spell("Cure Wounds");
const afterMismatch = P.state();
check("pips.otherSpellStaysAction", mismatched.cost === "action" && afterMismatch.action === true && afterMismatch.reaction === false && afterMismatch.oaArmed === "oa_other");
R.oaCast = null;

const prompt = read("assets/js/react-prompt.js");
const v2 = read("dm/assets/js/v2.js");
const join = read("assets/js/dm-join.js");
const map = read("map/ssdns-map.js");
const lock = read("assets/js/turn-lock.js");
const pips = read("assets/js/action-pips.js");
check("src.playerPrompt", v2.includes("is deciding on an opportunity attack") && v2.includes("function queuePlayerOaApproval") && v2.includes('type: "reactArm"') && v2.includes("pushReactPrompt"));
check("src.allowPath", v2.includes("function resolvePlayerOa") && v2.includes("answerOa(id, true)") && prompt.includes('data-react-choice="allow"') && prompt.includes('data-react-choice="deny"'));
check("src.join", join.includes("function onLeavePrompt") && join.includes('case "reactArm"') && join.includes("gunsmokeCaster") && join.includes('indexOf("gunsmoke-caster")') && join.includes("function enrichLeave"));
check("src.map", map.includes("function reactorDmRuns") && map.includes("SSDNSLeaveHold") && map.includes("enrichLeave") && map.includes("playerOwns"));
check("src.castSpend", pips.includes('cost: "reaction"') && pips.includes("oaCast") && lock.includes("oaCast") && prompt.includes("function oaCastEligible"));
check("src.rulesUntouched", !read("assets/data/rules.js").includes("oaCastEligible") && !read("assets/data/rules.js").includes("0.3.168") && !read("database.rules.json").includes("0.3.168") && read("assets/data/rules.js").includes('"id": "gunsmoke-caster"'));
const ver = JSON.parse(read("version.json"));
check("src.versions", ver.sheet === "0.3.168" && ver.dmcc === "0.2.181" && ver.sheetBuild === "sheet-playtest-v03168" && ver.dmccBuild === "dmcc-playtest-v02181", JSON.stringify(ver));
check("src.banners", read("assets/js/app.js").includes('APP_VERSION = "0.3.168"') && read("dm/assets/js/dmcc.js").includes('VERSION = "0.2.181"'));

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\nn72 ok");

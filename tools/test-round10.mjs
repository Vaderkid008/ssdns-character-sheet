/**
 * Round 10: self-heal text, condition merge, attack dice, damage mode,
 * undo once per roll, initiative ties, and kit weapons.
 */
import fs from "fs";
import path from "path";
import vm from "vm";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
function check(cond, msg) {
  if (!cond) failures.push(msg);
}
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
function load(names) {
  const sandbox = { window: {}, console, Math, Date, JSON, parseInt, isFinite, Number, String, Object, Array };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  names.forEach((rel) => vm.runInNewContext(read(rel), sandbox, { filename: rel }));
  return sandbox;
}

const box = load([
  "assets/js/apply-guard.js",
  "assets/js/conditions.js",
  "assets/js/kits.js",
  "assets/data/rules.js",
  "assets/js/creator.js"
]);
const Applied = box.SSDNSApplied;
const Cond = box.SSDNSConditions;
const Clock = box.SSDNSClock;
const Kits = box.SSDNSKits;
const Creator = box.SSDNSCreator;

const line = Applied.healLine("Willow Greyhawk", "No target", 4, "1d4 (1) +2 = 4", 3, 7);
check(line === "Willow Greyhawk heals Willow Greyhawk 4 (1d4: 1, +2) · HP 3→7", "self heal line " + line);
check(!/\btarget\b/i.test(line), "heal line does not say target");
check(Applied.hitLine("Gunman", "Willow Greyhawk", "Gunman", 5) === "Gunman hits Willow Greyhawk for 5", "drop weapon that repeats the attacker");
check(Applied.hitLine("Gunman", "Willow Greyhawk", "Revolver", 5).indexOf("with Revolver") >= 0, "keep a real attack name");

const mem = { bag: {} };
const storage = {
  getItem(k) { return Object.prototype.hasOwnProperty.call(mem.bag, k) ? mem.bag[k] : null; },
  setItem(k, v) { mem.bag[k] = String(v); }
};
check(Applied.claim("OXEN", "roll-a", storage), "apply claims the roll");
check(Applied.takeUndo("OXEN", "roll-a", storage), "undo once");
check(!Applied.takeUndo("OXEN", "roll-a", storage), "second undo is a no-op");
check(Applied.claim("OXEN", "roll-a", storage), "a new apply after undo can be claimed");
check(Applied.takeUndo("OXEN", "roll-a", storage), "that new apply undoes once");
check(!Applied.takeUndo("OXEN", "roll-a", storage), "the new apply does not undo twice");
check(!Applied.has("OXEN", "roll-a", storage), "undo releases the apply");
check(Applied.claim("OXEN", "roll-a", storage), "the roll can be applied again");

let list = Cond.upsert([], { name: "Prone", subjectId: "willow", rounds: null });
list = Cond.mergeById(list, [{ name: "Poisoned", subjectId: "willow", rounds: 2 }], []);
check(list.some((row) => row.name === "Prone") && list.some((row) => row.name === "Poisoned"), "player condition A stays when the DM adds B");
const proneId = Cond.idFor("willow", "Prone");
list = Cond.mergeById(list, [], [proneId]);
check(!list.some((row) => row.name === "Prone") && list.some((row) => row.name === "Poisoned"), "only an explicit uncheck removes a condition");

check(Cond.attackMode([{ name: "Poisoned" }], "") === "dis", "poisoned forces disadvantage");
check(Cond.attackMode([{ name: "Invisible" }], "") === "adv", "invisible grants advantage");
check(Cond.attackMode([{ name: "Poisoned" }, { name: "Invisible" }], "") === "", "advantage and disadvantage cancel");
check(Cond.attackMode([{ name: "Poisoned" }], "adv") === "", "a chosen advantage cancels the condition");
check(Cond.disadvantageNote([{ name: "Poisoned" }]) === "disadvantage: Poisoned", "reminder text");

const tied = Applied.sortInitiative([
  { id: "a", name: "Willow", init: 12, dex: 10 },
  { id: "b", name: "Abigail", init: 12, dex: 14 },
  { id: "c", name: "Gunman", init: 18, dex: 8 }
], (row) => Number(row.dex));
check(tied.map((row) => row.id).join(",") === "c,b,a", "ties break by DEX, got " + tied.map((r) => r.id).join(","));
check(tied[0].tie === false && tied[1].tie === true && tied[2].tie === true, "only the tied rows are marked");

Clock.setOffset(-20000);
const age = Clock.stampAge(new Date(Date.now() - 20000).toISOString());
check(age < 5000 && age > -5000, "server offset corrects a fast local clock, age " + age);
Clock.setOffset(0);

Kits.callings.forEach((id) => {
  const built = Creator.buildSheet({ calling: id, name: id });
  const weapons = (built.character.melee || []).concat(built.character.guns || []).filter((row) => row && row.weapon);
  if (id === "pact-seeker") {
    check(built.ok && built.character.casterGun === "borrowed-iron" && weapons.length === 0, "pact focus is borrowed iron, not a weapon row");
    return;
  }
  if (id === "scholar") {
    check(built.ok && weapons.length === 0, "scholar kit lists no weapon");
    return;
  }
  check(built.ok && weapons.length > 0, id + " kit puts a weapon on an attack row");
});
const preacher = Creator.buildSheet({ calling: "frontier-preacher", kit: { melee: "mace" } });
check((preacher.character.melee || []).some((row) => row && row.weapon === "trail-mace-chapel-mace-mace"), "preacher trail mace is in melee");
const guide = Creator.buildSheet({ calling: "nature-guide" });
check((guide.character.melee || []).some((row) => row && row.weapon === "machete-scimitar"), "nature guide machete is in melee");

const v2 = read("dm/assets/js/v2.js");
const dmcc = read("dm/assets/js/dmcc.js");
const join = read("assets/js/dm-join.js");
const extras = read("assets/js/sheet-extras.js");
const play = read("assets/js/sheet-playtest.js");
const app = read("assets/js/app.js");
check(v2.indexOf("damageMode: fight.damageMode === \"approve\" ? \"approve\" : \"auto\"") >= 0, "damage mode is saved as approve or auto");
check(v2.indexOf("syncDamageMode") >= 0 && v2.indexOf("function nextTurn") >= 0, "turn changes keep the damage mode");
check(v2.indexOf("data-undo-hit") >= 0 && dmcc.indexOf("data-undo-hit") >= 0, "undo sits on feed and ledger rows");
check(v2.indexOf("askApplyTarget") >= 0 && v2.indexOf("Pick a target") >= 0, "untargeted apply asks who");
check(!/meta\.targetName \|\| meta\.targetId \|\| "target"/.test(v2), "apply no longer falls back to the word target");
check(v2.indexOf("attacks ") >= 0 && v2.indexOf("Clear combat conditions") >= 0, "enemy attacks name the target and combat can clear conditions");
check(v2.indexOf("data-atk-val") >= 0 && v2.indexOf("data-dmg-val") >= 0, "enemy rows edit attack bonus and damage");
check(v2.indexOf("is Unconscious") >= 0, "zero HP logs Unconscious");
check(dmcc.indexOf(".info/serverTimeOffset") >= 0 && join.indexOf(".info/serverTimeOffset") >= 0, "display stamps use the server offset");
check(dmcc.indexOf("Handout sent to ") >= 0 && dmcc.indexOf("snapshot.name") >= 0, "handout toast uses a name");
check(join.indexOf("joinedAt") >= 0 && join.indexOf("12 * 60 * 60 * 1000") >= 0, "auto-rejoin expires");
check(join.indexOf('b.innerHTML = ""') < 0, "take over button is not rebuilt");
check(join.indexOf("seen: false") >= 0, "turn ack records delivered before seen");
check(extras.indexOf("selfApplied") >= 0 && extras.indexOf("releaseHealTarget") >= 0, "self heals apply locally");
check(play.indexOf("attackRoll") >= 0, "melee uses the shared attack dice");
check(app.indexOf("details.box.wild") >= 0, "wild spark box can be hidden");
check(read("version.json").indexOf('"sheet": "0.3.6"') >= 0 && read("version.json").indexOf('"dmcc": "0.2.13"') >= 0, "round 10 versions");

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("ok " + 20);

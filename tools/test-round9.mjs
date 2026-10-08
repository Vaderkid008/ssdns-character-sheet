/**
 * Round 9: heals, idempotent apply, enemy attack text, tabs, wizard, conditions.
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

const rulesBox = load(["assets/data/rules.js", "assets/js/spell-cast.js"]);
const heal = rulesBox.SSDNSSpellCast.rollCast({
  spellName: "Cure Wounds",
  slotLevel: 1,
  characterLevel: 1,
  spellMod: 2,
  gunName: ""
});
check(heal.formula === "1d8+2", "heal formula is 1d8+2, got " + heal.formula);
check(!/vs AC/.test(heal.text), "heal roll has no vs AC");
check(!/Shotgun|Carbine|Rifle/.test(heal.text), "heal roll has no weapon");
const shot = rulesBox.SSDNSSpellCast.rollCast({
  spellName: "Fire Bolt",
  slotLevel: 0,
  characterLevel: 1,
  attackBonus: 5,
  gunName: ""
});
check(shot.attack === true, "attack spells still roll an attack");

const box = load([
  "assets/data/rules.js",
  "assets/js/kits.js",
  "assets/js/creator.js",
  "assets/js/conditions.js",
  "assets/js/apply-guard.js",
  "dm/assets/js/ui-tab.js"
]);
const Creator = box.SSDNSCreator;
const Cond = box.SSDNSConditions;
const Applied = box.SSDNSApplied;
(box.SSDNSKits.callings || []).forEach((id) => {
  const built = Creator.buildSheet({ calling: id });
  check(built.ok, id + " wizard: " + built.errors.join("; "));
  const c = built.character;
  check(c.calling === id && c.name && c.level === 1, id + " sheet identity");
  check(c.hpMax === c.hpCurrent && Number(c.hpMax) >= 1, id + " HP auto");
  check(Number(c.speed) > 0, id + " speed");
  const page = Creator.spellPageCopy(id, id === "martial-artist" ? "Tong Hatchet Man" : "");
  if (id === "hexslinger") check(page.art && page.focus === "caster-gun", "hexslinger caster gun page");
  else check(!page.art, id + " spell page has no caster-gun art");
  if (id === "pact-seeker") check(page.focus === "borrowed-iron" && c.casterGun === "borrowed-iron", "pact borrowed iron");
  if (id !== "hexslinger" && id !== "pact-seeker" && page.focus === "focus") check(/Focus:/i.test(page.blurb), id + " focus blurb");
  if (id === "martial-artist") check(/Breath Coins/.test(page.empty) && !/Tong Hatchet Man and Way of Kung Fu/.test(page.empty), "breath coins only for that subclass");
});
check(Creator.isExisting({ character: { name: "Wade" } }), "wizard stays off a loaded character");
check(!Creator.isExisting({ character: { name: "", calling: "", lineage: "", background: "" } }), "blank sheet can open the wizard");

const mem = { bag: {} };
const storage = {
  getItem(k) { return Object.prototype.hasOwnProperty.call(mem.bag, k) ? mem.bag[k] : null; },
  setItem(k, v) { mem.bag[k] = String(v); }
};
check(Applied.claim("IRON", "roll-1", storage), "first apply claims the id");
check(!Applied.claim("IRON", "roll-1", storage), "second apply is idempotent");
Applied.release("IRON", "roll-1", storage);
check(Applied.claim("IRON", "roll-1", storage), "undo releases the id");
const line = Applied.healLine("Abigail", "Hank Ridley", 7, "1d8 (5) +2 = 7", 6, 11);
check(line === "Abigail heals Hank Ridley 7 (1d8: 5, +2) · HP 6→11", "heal line " + line);
check(Applied.weaponName("Hank Ridley → Outlaw 1") === "", "arrow labels are not weapon names");
check(Applied.hitLine("Hank Ridley", "Outlaw 1", "Dullards Light Carbine", 4).indexOf("→") < 0, "hit line names the weapon");

let list = Cond.upsert([], { name: "Poisoned", subjectId: "p1", rounds: 2 });
check(Cond.disadvantageNote(list) === "disadvantage: Poisoned", "poisoned reminder");
let ticked = Cond.tick(list, "p1");
check(ticked.list[0].rounds === 1 && ticked.ended.length === 0, "round timer ticks");
ticked = Cond.tick(ticked.list, "p1");
check(ticked.ended.length === 1 && ticked.list.length === 0, "timer end");
list = Cond.ensureUnconscious([], 0, "p1");
check(list.some((row) => row.name === "Unconscious"), "zero HP adds unconscious");
list = Cond.ensureUnconscious(list, 4, "p1");
check(!list.some((row) => row.name === "Unconscious"), "healing clears unconscious");
check(Cond.idFor("p1", "Poisoned") === Cond.idFor("p1", "Poisoned"), "condition ids are stable");

check(box.SSDNSUiTab.nextTab("tab-fight", { remote: true, type: "join" }) === "tab-fight", "remote join keeps the tab");
check(box.SSDNSUiTab.nextTab("tab-rewards", { remote: true }) === "tab-rewards", "remote push keeps rewards");
check(box.SSDNSUiTab.nextTab("tab-table", { type: "click", tab: "tab-fight" }) === "tab-fight", "a click still changes tabs");
check(box.SSDNSUiTab.nextTab("tab-table", { type: "hotkey", tab: "tab-rewards" }) === "tab-rewards", "rewards hotkey still changes tabs");

const dm = read("dm/assets/js/dmcc.js") + read("dm/assets/js/v2.js");
const sheet = read("assets/js/app.js") + read("assets/js/sheet-extras.js") + read("assets/js/dm-join.js") + read("assets/js/sheet-playtest.js");
check(!/maybePrompt\(/.test(read("assets/js/sheet-playtest.js").split("function maybePrompt")[0]), "calling change does not auto-prompt the kit");
check(sheet.includes("data-add-spell") && sheet.includes("callingCatalog().concat(bonusCatalog())"), "spell add looks up the catalog key");
check(sheet.includes("Take over editing") && sheet.includes("sheet-readonly"), "second tab can be taken over");
check(dm.includes("DM roll vs this AC") && dm.includes("Attack a target"), "enemy attack buttons are labeled");
check(dm.includes("SSDNSApplied.claim") && dm.includes("conditions/"), "apply ids and condition paths are wired");
check(dm.includes("applyActiveTab") && !dm.includes("location.hash"), "tabs are restored from the stored tab");
check(sheet.includes("visibilityState") && dm.includes("· delivered") && dm.includes("· seen"), "delivered and seen are distinct");
check(read("database.rules.json").includes('"conditions"'), "rules include conditions");

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("ok round 9");

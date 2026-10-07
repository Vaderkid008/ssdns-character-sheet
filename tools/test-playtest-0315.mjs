/**
 * Sheet 0.3.15 / DMCC 0.2.28 playtest helpers.
 * Target eligibility, strip status, empty chambers, ASI, attack bonus, ghosts.
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
const sandbox = { window: {}, console, Math, Date, JSON, parseInt, isFinite, Number, String, Object, Array };
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
vm.runInNewContext(read("assets/js/apply-guard.js"), sandbox, { filename: "apply-guard.js" });
const A = sandbox.SSDNSApplied;

const down = { id: "r1", kind: "enemy", name: "Rustler 1", status: "Down", hp: 0 };
const live = { id: "r2", kind: "enemy", name: "Rustler 2", status: "Hurt", hp: 6, maxHp: 11 };
const fled = { id: "dolan", kind: "player", name: "Dolan", status: "Fled", fled: true, hp: 9 };
check(A.isUnusableTarget(down) && !A.isLivingHostile(down), "a Down enemy is not a living hostile");
check(!A.isUnusableTarget(live) && A.isLivingHostile(live), "a hurt enemy can be targeted");
check(A.isUnusableTarget(fled) && !A.isLivingHostile(fled), "a fled combatant is not a default target");
check(!A.isUnusableTarget({ kind: "enemy", status: "Down", hp: 4, maxHp: 11 }), "positive HP overrides a stale Down flag");

const healed = { kind: "enemy", status: "Down", hp: 8, maxHp: 11 };
check(A.refreshCombatantStatus(healed) === "Hurt" && healed.status === "Hurt", "a heal clears Down on the strip");
const shot = { kind: "enemy", status: "Down", hp: 3, maxHp: 11 };
check(A.refreshCombatantStatus(shot) !== "Down", "an enemy who can still shoot is not shown Down");
const corpse = { kind: "enemy", status: "Hurt", hp: 0, maxHp: 11 };
check(A.refreshCombatantStatus(corpse) === "Down", "0 HP is Down");
const gone = { kind: "enemy", status: "Hurt", fled: true, hp: 4 };
check(A.refreshCombatantStatus(gone) === "Fled", "flee stays Fled");

check(A.chamberClick("", true).action === "empty", "a clicked empty chamber is a click");
check(A.chamberClick("k:cartridge:Light:light", true).action === "fire", "a clicked cartridge fires");
check(A.chamberClick("k:hex:1:spent", true).action === "hex", "a clicked hex shell is not a cartridge");
check(A.chamberClick("", false).action === "advance", "the Roll button may advance to the next chamber");
check(A.shotConsumesCartridge("hex") === false && A.shotConsumesCartridge("cantrip") === false, "hex and cantrip shots do not spend cartridges");
check(A.shotConsumesCartridge("cartridge") === true, "a mundane cartridge shot spends a cartridge");

const pioneer = A.parseAsi("Your Strength score increases by 2, and your Constitution score increases by 1.");
check(pioneer.fixed.STR === 2 && pioneer.fixed.CON === 1 && pioneer.choices.length === 0, "Pioneer is +2 Strength and +1 Constitution");
const applied = A.applyAsiScores({ STR: 15, DEX: 14, CON: 13, INT: 12, WIS: 10, CHA: 8 }, {}, pioneer.fixed);
check(applied.changed && applied.abilities.STR === 17 && applied.abilities.CON === 14, "Pioneer bonuses land on the scores");
const again = A.applyAsiScores(applied.abilities, pioneer.fixed, pioneer.fixed);
check(!again.changed && again.abilities.STR === 17, "the same lineage increase does not stack");
check(A.adjustCurrentHp(6, 11, 12) === 7, "a mid-fight HP recalc shifts current by the max delta");
check(A.adjustCurrentHp(11, 11, 12) === 12, "HP that was at the old maximum follows the new maximum");
check(A.adjustCurrentHp(null, null, 12) === 12, "starting HP fills from the new maximum");

check(A.attackRollCore({ nat: 14, total: 18 }) === "14+4 = 18", "an attack line shows the bonus");
check(A.attackRollCore({ nat: 10, atk: 0, total: 10 }) === "10+0 = 10", "a +0 bonus is still shown");
const line = A.attackPublicLine({ who: "Wren", target: "Rustler 2", nat: 14, total: 18, ac: 13 }, A.attackVerdict({ nat: 14, total: 18, ac: 13 }));
check(line.indexOf("14+4 = 18") >= 0 && line.indexOf("AC") < 0 && line.indexOf("13") < 0, "the public line shows the mod and hides AC");
check(A.speakerName("Dust", "Browser") === "Dust", "chat uses the character name");
check(A.speakerName("", "Browser") === "Browser", "a blank character falls back to the player");

const ghosts = A.stripGhostCombatants([
  { id: "p1", kind: "player", name: "Dust" },
  { id: "p2", kind: "player", name: "Dolan", left: true },
  { id: "e1", kind: "enemy", name: "Rustler 2" }
], { p1: 1 });
check(ghosts.length === 2 && ghosts[0].name === "Dust" && ghosts[1].name === "Rustler 2", "a left player drops off the fight strip");
check(A.presenceShownOnline(false, "online") === true, "a connection blip stays present during the leave wait");
check(A.presenceShownOnline(false, "offline") === false, "a finished leave shows offline");

const version = JSON.parse(read("version.json"));
check(version.sheet === "0.3.15" && version.sheetBuild === "sheet-playtest-v0315", "sheet 0.3.15");
check(version.dmcc === "0.2.28" && version.dmccBuild === "dmcc-playtest-v0228", "dmcc 0.2.28");
check(read("assets/js/app.js").indexOf('APP_VERSION = "0.3.15"') >= 0, "sheet banner");
check(read("dm/assets/js/dmcc.js").indexOf('VERSION = "0.2.28"') >= 0, "dmcc banner");
check(read("assets/js/sheet-extras.js").indexOf("ensureAttackTarget") >= 0, "attacks can ask for a target");
check(read("assets/js/app.js").indexOf("empty: true") >= 0, "an empty chamber returns a click");
check(read("dm/assets/js/v2.js").indexOf("clearFight") >= 0, "end session can clear the fight strip");

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("playtest 0.3.15 / 0.2.28 ok");

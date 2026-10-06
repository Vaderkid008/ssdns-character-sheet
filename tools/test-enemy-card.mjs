/**
 * Enemy card: scores, misfire, public lines, and the DM roller wiring.
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
const sandbox = { window: {}, console, Math, Date, JSON, parseInt, isFinite, Number, String, Object, Array, URL, encodeURIComponent };
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
vm.runInNewContext(read("assets/js/apply-guard.js"), sandbox, { filename: "apply-guard.js" });
const Applied = sandbox.SSDNSApplied;
const beasts = JSON.parse(read("dm/assets/data/bestiary.json"));
const boss = beasts.filter((b) => b.id === "switch-boss")[0];
const devil = beasts.filter((b) => b.id === "dust-devil")[0];
const witch = beasts.filter((b) => b.id === "cactus-witch")[0];
const card = Applied.enemyCardModel(boss);
check(card.scores.DEX === 12 && Applied.abilityMod(card.scores.DEX) === 1, "switch boss dex mod");
check(card.attacks[0].name === "Dirty Rifle" && card.attacks[0].toHit === 3 && card.attacks[0].capacity === 6 && card.attacks[0].loaded === 6 && card.attacks[0].misfire === 2, "rifle keeps capacity and misfire");
check(Applied.isMisfire(1, 2) && Applied.isMisfire(2, 2) && !Applied.isMisfire(3, 2), "misfire 1-2 spends the bad rolls only");
check(!Applied.isMisfire(1, null), "a weapon with no misfire rating is not jammed on a 1");
const devilCard = Applied.enemyCardModel(devil);
check(devilCard.attacks[0].rider && devilCard.attacks[0].rider.condition === "Prone" && devilCard.skills.Perception === 3, "dust devil rider and skill");
const witchCard = Applied.enemyCardModel(witch);
check(witchCard.spellcasting && witchCard.spellcasting.dc === 12 && witchCard.spellcasting.spells.length === 3, "cactus witch spellcasting");
const secret = "Boss attacks Moss with Dirty Rifle: 18+3 = 21 vs AC 14 → HIT";
check(Applied.publicDetail(secret).indexOf("AC") < 0 && Applied.publicDetail(secret).indexOf("Boss attacks Moss") === 0, "public lines drop AC, got " + Applied.publicDetail(secret));
check(Applied.publicDetail("save vs DC 12 FAIL").indexOf("DC") < 0, "public lines drop DC");
const v2 = read("dm/assets/js/v2.js");
const dmcc = read("dm/assets/js/dmcc.js");
const html = read("dm/index.html");
check(v2.indexOf("function enemyCardHtml") >= 0 && v2.indexOf("data-card-atk") >= 0 && v2.indexOf("data-apply-rider") >= 0, "the fight row renders the card");
check(v2.indexOf("misfire") >= 0 && v2.indexOf("The round is spent") >= 0, "a misfire spends the round");
check(dmcc.indexOf("function rollChecked") >= 0 && html.indexOf('id="rollPublic"') >= 0 && html.indexOf('id="rollMode"') >= 0, "header roller has advantage and a public toggle");
check(v2.indexOf("data-card-public") >= 0 && v2.indexOf("data-card-dice") >= 0, "each card has a dice box");
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("ok enemy card");

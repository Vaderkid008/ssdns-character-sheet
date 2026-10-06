/**
 * Enemy AC, HP, saves, attacks, traits, and tactics stay off the player-readable node.
 * The DM compares the posted total and applies damage once.
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

const sandbox = { console, Math, Date, JSON, parseInt, isFinite, Number, String, Object, Array };
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
vm.runInNewContext(read("assets/js/apply-guard.js"), sandbox, { filename: "apply-guard.js" });
const Applied = sandbox.SSDNSApplied;

const outlaw = {
  kind: "enemy",
  name: "Outlaw",
  ac: 13,
  hp: 11,
  maxHp: 16,
  tactics: "flees at half HP",
  conditions: ["Prone"],
  card: {
    saves: { DEX: 3 },
    attacks: [{ name: "Revolver" }],
    traits: [{ name: "Pack Tactics", text: "advantage" }],
    tactics: "flees at half HP"
  }
};

const hidden = Applied.publicEnemy(outlaw, 2, outlaw.conditions);
check(hidden.name === "Outlaw", "name stays visible by default");
check(hidden.status === "Hurt", "above half HP is Hurt");
check(hidden.conditions.join(",") === "Prone", "conditions stay public");
check(Applied.publicEnemy(Object.assign({}, outlaw, { hp: 8 }), 0, []).status === "Bloodied", "half HP is Bloodied");
check(hidden.ac == null && hidden.hp == null && hidden.maxHp == null, "public node has no top-level AC or HP");
check(!hidden.revealed, "nothing is revealed until the DM says so");
check(hidden.saves == null && hidden.attacks == null && hidden.traits == null && hidden.tactics == null, "saves, attacks, traits, and tactics stay off the public node");

const revealed = Applied.publicEnemy(Object.assign({}, outlaw, { reveal: { name: true, ac: true, hp: true, block: true } }), 0, ["Prone"]);
check(revealed.revealed && revealed.revealed.ac === 13, "revealed AC sits under revealed");
check(revealed.revealed.hp === 11 && revealed.revealed.maxHp === 16, "revealed HP numbers sit under revealed");
check(revealed.ac == null && revealed.hp == null, "revealed numbers are not copied to the top level");
check(revealed.revealed.block && revealed.revealed.block.saves.DEX === 3, "a revealed block carries saves");
check(revealed.revealed.block.attacks[0].name === "Revolver", "a revealed block carries attacks");
check(revealed.revealed.block.tactics === "flees at half HP", "a revealed block carries tactics");

const unnamed = Applied.publicEnemy(Object.assign({}, outlaw, { reveal: { name: false, ac: false, hp: false, block: false } }), 1, []);
check(unnamed.name === Applied.HIDDEN_ENEMY_NAME, "Hide all shows Unknown gunman");
check(!unnamed.revealed, "Hide all clears the revealed block");

const secret = Applied.secretEnemy(outlaw);
check(secret.ac === 13 && secret.hp === 11 && secret.attacks[0].name === "Revolver", "the DM copy keeps AC, HP, and attacks");
check(secret.tactics === "flees at half HP", "the DM copy keeps tactics");

const miss = Applied.attackVerdict({ nat: 8, total: 12, ac: 13, sfx: "attack" });
check(miss.verdict === "MISS" && miss.sfx === "", "a total under AC is a miss");
const hit = Applied.attackVerdict({ nat: 14, total: 18, ac: 13, sfx: "attack" });
check(hit.verdict === "HIT" && hit.sfx === "attack", "a total meeting AC is a hit");
const crit = Applied.attackVerdict({ nat: 20, total: 24, ac: 13, sfx: "spellshot" });
check(crit.verdict === "CRIT" && crit.sfx === "spellshot", "a natural 20 is a crit");
const nat1 = Applied.attackVerdict({ nat: 1, total: 30, ac: 13, sfx: "attack" });
check(nat1.verdict === "MISS", "a natural 1 misses without the AC");

const line = Applied.attackPublicLine({ who: "Wade", target: "Outlaw", nat: 14, total: 18, dice: "1d8 (5)", amount: 7, ac: 13 }, hit);
check(line.indexOf("HIT") >= 0 && line.indexOf("AC") < 0 && line.indexOf("13") < 0, "the table line names the hit and leaves the AC off");

const rays = Applied.attackShots({
  who: "June",
  target: "Outlaw",
  ac: 13,
  sfx: "spellshot",
  shots: [
    { nat: 18, total: 22, amount: 9, dice: "2d6 = 9", label: "ray 1" },
    { nat: 4, total: 8, amount: 11, dice: "2d6 = 11", label: "ray 2" }
  ]
});
check(rays.verdict === "HIT" && rays.amount === 9, "only the rays that beat AC add damage");
check(rays.line.indexOf("MISS") >= 0 && rays.line.indexOf("13") < 0, "a missed ray is named and the AC stays off the line");

const rules = read("database.rules.json");
check(rules.indexOf('"dm"') >= 0 && rules.indexOf("!newData.hasChild('ac')") >= 0, "rules hide the DM node and reject public AC");
const v2 = read("dm/assets/js/v2.js");
const sheet = read("assets/js/sheet-extras.js");
const join = read("assets/js/dm-join.js");
const cast = read("assets/js/spell-cast.js");
check(v2.indexOf('roomRef("encounter/dm")') >= 0, "DM writes encounter/dm");
check(sheet.indexOf("Waiting on DM…") >= 0 && sheet.indexOf("awaitDm: true") >= 0, "a hidden attack waits on the DM");
check(v2.indexOf("Reveal AC") >= 0 && v2.indexOf("Hide all") >= 0 && v2.indexOf("Players see") >= 0, "each enemy has reveal toggles");
check(join.indexOf('type: "attack"') >= 0 && join.indexOf("attack_result") >= 0, "the attack request and the verdict command are wired");
check(cast.indexOf("dc: opts.dc") >= 0 || cast.indexOf("opts.dc") >= 0, "save text uses the caster DC passed in");
check(sheet.indexOf("dc: v.spellDC") >= 0, "the sheet passes the caster's own spell DC");
check(sheet.indexOf("SSDNSTestRoll") >= 0, "testroll still feeds the d20");
check(v2.indexOf("buildPublish()") >= 0 && v2.indexOf("if (DM.state.demo || !DM.state.db) return;") >= 0, "demo still builds the public view before it returns");

const version = JSON.parse(read("version.json"));
check(version.sheet === "0.3.13" && version.sheetBuild === "sheet-suggestion-v0313", "sheet 0.3.13");
check(version.dmcc === "0.2.24" && version.dmccBuild === "dmcc-bestiary-v0224", "dmcc 0.2.24");

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("ok hidden enemy");

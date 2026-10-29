/**
 * N79 Phase 1c C — Mage Armor, Shield, Bless/Bane, concentration.
 *   node tools/test-n79-buffs.mjs
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
function check(id, cond, detail) {
  if (!cond) failures.push(id + (detail ? " — " + detail : ""));
  console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + detail : ""));
}
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }

const context = { console, Math, Date };
context.window = context;
context.globalThis = context;
vm.createContext(context);
vm.runInContext(read("assets/js/spell-fx.js"), context);
vm.runInContext(read("assets/js/spell-buffs.js"), context);
vm.runInContext(read("assets/js/spell-riders.js"), context);
vm.runInContext(read("assets/js/spell-area.js"), context);
const book = JSON.parse(read("tools/spell_cast.json"));
context.SSDNS_RULES = { spellCast: book };
vm.runInContext(read("assets/js/spell-cast.js"), context);
const B = context.SSDNSSpellBuffs;
const R = context.SSDNSSpellRiders;
const Cast = context.SSDNSSpellCast;
const Area = context.SSDNSSpellArea;

const armor = [{ id: "leather-jacket", category: "light" }, { id: "badge-board", category: "shield" }];
check("mage.block", B.mageArmorBlock({ armor: "leather-jacket" }, armor) === "Mage Armor needs a creature that isn't wearing armor.");
check("mage.shieldok", B.mageArmorBlock({ armor: "badge-board" }, armor) === "");
check("mage.bare", B.mageArmorBlock({ armor: "" }, armor) === "");
check("mage.ac", B.mageArmorAc(2) === 15 && B.mageArmorAc(-1) === 12);

const suited = { armor: "leather-jacket", buffs: [{ id: "spell:mage armor", mageArmor: true, name: "Mage Armor" }], activeConditions: [{ name: "Mage Armor" }], spellMarks: { marks: [{ kind: "mageArmor" }, { kind: "hex" }] } };
const stripped = B.stripMageArmor(suited);
check("mage.strip", stripped.ended && !suited.buffs.some((b) => b.mageArmor) && suited.spellMarks.marks.some((m) => m.kind === "hex") && !suited.spellMarks.marks.some((m) => m.kind === "mageArmor"));
check("mage.quiet", B.stripMageArmor(suited).ended === false);

const shield = Area.buffOf("Shield");
const shell = Area.buffOf("Shield Shell");
check("shield.buff", shield && shield.untilTurn === true && shield.ac === 5 && !shield.ms, JSON.stringify(shield));
check("shield.shell", shell && shell.untilTurn === true && !shell.ms);
check("shield.alias", Area.buffOf("Magnesium Flash") && Area.buffOf("Shield (Magnesium Flash)").ac === 5);
const expired = B.expireTurnBuffs([{ id: "spell:shield", untilTurn: true, ac: 5 }, { id: "spell:mage armor", mageArmor: true }]);
check("shield.expire", expired.removed.length === 1 && expired.buffs.length === 1 && expired.buffs[0].mageArmor);

check("shield.recheck", B.recheckHit({ nat: 16, total: 16, ac: 13, shield: 5 }).miss === true && B.recheckHit({ nat: 16, total: 16, ac: 13, shield: 5 }).ac === 18);
check("shield.crit", B.recheckHit({ nat: 20, total: 12, ac: 13, shield: 5 }).hit === true);
check("shield.nat1", B.recheckHit({ nat: 1, total: 30, ac: 13, shield: 5 }).miss === true);
check("mm.zero", B.magicMissileAmount(9, true) === 0 && B.magicMissileAmount(9, false) === 9);
check("shell.loaded", B.loadedShell([{ chambers: ["k:hex:1:spent"] }], 1) === true && B.loadedShell([{ chambers: ["c"] }], 1) === false);
check("shield.gate", B.shieldGate({ calling: "hexslinger", guns: [{ chambers: [""] }] }) === "Shield needs a loaded hex shell.");
check("shield.gateok", B.shieldGate({ calling: "scholar", guns: [] }) === "" && B.shieldGate({ calling: "hexslinger", guns: [{ chambers: ["1"] }] }) === "");

check("cap.1", B.targetCap(1) === 3);
check("cap.2", B.targetCap(2) === 4);
const bless = [{ name: "Blessed" }];
const baned = [{ name: "Baned" }];
const up = B.rollMods(bless, function () { return 3; });
check("bless.die", up.delta === 3 && up.text === "+1d4 [3] (Bless)", up.text);
const down = B.rollMods(baned, function () { return 3; });
check("bane.die", down.delta === -3 && down.text === "−1d4 [3] (Bane)", down.text);
const bothDice = B.rollMods([{ name: "Blessed" }, { name: "Baned" }], function () { return 2; });
check("both.die", bothDice.delta === 0 && /\+1d4 \[2\] \(Bless\)/.test(bothDice.text) && /−1d4 \[2\] \(Bane\)/.test(bothDice.text), bothDice.text);

const fail = B.saveCheck({ nat: 8, mod: 2, dc: 14, ability: "CHA", spell: "Bane", who: "Ada" });
const save = B.saveCheck({ nat: 15, mod: 2, dc: 14, ability: "CHA", spell: "Bane", who: "Ada" });
check("bane.fail", fail.failed && /FAIL/.test(fail.line) && /CHA/.test(fail.line));
check("bane.save", !save.failed && /SAVE/.test(save.line));

const blessRow = Cast.lookup("Bless");
const baneRow = Cast.lookup("Bane");
check("patch.bless", blessRow && blessRow.conc === true && blessRow.bless === true && blessRow.chip === "Blessed");
check("patch.bane", baneRow && baneRow.save === "CHA" && baneRow.bane === true);
check("patch.mage", Cast.lookup("Mage Armor").conc === false && Cast.lookup("Mage Armor").mageArmor === true);
check("patch.shield", Cast.lookup("Shield").untilTurn === true && Cast.lookup("Shield").conc === false && Cast.lookup("Shield").ac === 5);

const armed = R.arm(R.emptyBag(null), { name: "Bless", row: blessRow, slot: 2, targets: [{ id: "a", name: "Ada" }, { id: "b", name: "Bo" }] });
check("bless.arm", armed.chips.length === 2 && armed.chips.every((c) => c.name === "Blessed") && armed.bag.conc === "Bless" && /up to 4/.test(armed.logs.join(" ")));
const held = R.arm(R.emptyBag(null), { name: "Bane", row: baneRow, slot: 1, holdChips: true, targets: [{ id: "a", name: "Ada" }] });
check("bane.hold", held.chips.length === 0 && held.bag.marks.some((m) => m.chip === "Baned"));
const broke = R.breakConc(armed.bag, "Bless");
check("bless.break", broke.bag.conc === "" && !broke.bag.marks.some((m) => m.kind === "bless") && broke.removed.some((c) => c.name === "Blessed"));
const mageArm = R.arm(broke.bag, { name: "Mage Armor", row: Cast.lookup("Mage Armor"), casterId: "a" });
const brokeMage = R.breakConc(mageArm.bag);
check("mage.survives", brokeMage.bag.marks.some((m) => m.kind === "mageArmor"));
const ward = R.arm(R.emptyBag(null), { name: "Shield", row: Cast.lookup("Shield"), casterId: "a" });
check("ward.kind", ward.bag.marks[0].kind === "ward" && ward.chips[0].name === "Shield +5" && ward.conc === false);
context.Math.random = function () { return 0; };
const bolt = Cast.rollCast({ spellName: "Fire Bolt", slotLevel: 0, attackBonus: 5, conditions: [{ name: "Blessed" }] });
check("bless.roll", bolt && bolt.attack && /1d4 \[1\] \(Bless\)/.test(bolt.text) && bolt.result === 7, bolt && bolt.text);

check("dc.low", B.concDc(0) === 10 && B.concDc(15) === 10);
check("dc.22", B.concDc(22) === 11);
check("dc.25", B.concDc(25) === 12);
const adv = B.concMods({ gunsmoke: true });
const cancel = B.concMods({ gunsmoke: true, hexBreaker: true });
const dis = B.concMods({ hexBreaker: true, outOfTune: true, fingerpicks: true });
check("conc.adv", adv.mode === "adv" && adv.bonus === 0);
check("conc.cancel", cancel.mode === "" && cancel.bonus === 0);
check("conc.dis", dis.mode === "dis" && dis.bonus === 2);
let n = 0;
const faces = [4, 18];
const heldConc = B.resolveConc({ damage: 22, mod: 3, gunsmoke: true, who: "Ada", spell: "Bless" }, function () { return faces[n++]; });
check("conc.hold", heldConc.hold && heldConc.dc === 11 && heldConc.nat === 18 && /HOLD/.test(heldConc.line) && /Gunsmoke Caster/.test(heldConc.line), heldConc.line);
n = 0;
const broken = B.resolveConc({ damage: 25, mod: 0, nat: 2, who: "Ada", spell: "Bless", hexBreaker: true, outOfTune: true, fingerpicks: true });
check("conc.breakline", broken.broken && broken.dc === 12 && broken.bonus === 2 && /BROKEN/.test(broken.line) && /Hex Breaker, Out of tune/.test(broken.line) && /Fingerpicks \+2/.test(broken.line), broken.line);
check("conc.death", B.concEndReason({ hp: 0 }) === "death");
check("conc.incap", B.concEndReason({ hp: 8, conditions: [{ name: "Paralyzed" }] }) === "incapacitated");
check("picks.play", B.notePlayed({ items: [{ catalogId: "fingerpicks" }], instrument: "guitar" }, "t1") === true);
const played = { items: [{ catalogId: "fingerpicks" }], instrument: "guitar", fingerpicksOn: true, fingerpicksFrom: "t1" };
check("picks.same", B.expireFingerpicks(played, "t1") === false && played.fingerpicksOn === true);
check("picks.next", B.expireFingerpicks(played, "t2") === true && played.fingerpicksOn === false);

const area = read("assets/js/spell-area.js");
check("src.notimer", /"shield": \{ ac: 5, untilTurn: true/.test(area) && !/"shield": \{[^}]*ms:\s*60000/.test(area));
const sheet = read("assets/js/sheet-extras.js");
const v2 = read("dm/assets/js/v2.js");
const guard = read("assets/js/apply-guard.js");
check("src.hooks", sheet.includes("settleConcSave") && sheet.includes("untilTurn") && sheet.includes("applyRemoteBuff") && v2.includes("offerShieldDialog") && v2.includes("_forcedAc") && guard.includes("dieMods"));
const react = read("assets/js/react-prompt.js");
check("src.shieldmenu", /var DAMAGE = \{ "hellish rebuke": 60, "absorb elements": 0 \}/.test(react) && /Shield and the rest stay on the R menu/.test(react));
const rulesDiff = execSync("git diff --name-only -- assets/data/rules.js database.rules.json", { cwd: root }).toString().trim();
check("rules.untouched", rulesDiff === "", rulesDiff);
const rules = read("assets/data/rules.js");
check("rules.nover", !rules.includes("0.3.168") && !rules.includes("spell-buffs"));
const version = JSON.parse(read("version.json"));
check("ver.sheet", version.sheet === "0.3.168" && version.sheetBuild === "sheet-playtest-v03168");
check("ver.dmcc", version.dmcc === "0.2.181" && version.dmccBuild === "dmcc-playtest-v02181");

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\nall buff checks passed");

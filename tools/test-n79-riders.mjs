/**
 * N79 Phase 1c A — conditions, riders, and the HP catalog fixes.
 *   node tools/test-n79-riders.mjs
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
vm.runInContext(read("assets/js/spell-riders.js"), context);
vm.runInContext(read("assets/js/spell-area.js"), context);
const book = JSON.parse(read("tools/spell_cast.json"));
context.SSDNS_RULES = { spellCast: book };
vm.runInContext(read("assets/js/spell-cast.js"), context);
const R = context.SSDNSSpellRiders;
const Cast = context.SSDNSSpellCast;
const Area = context.SSDNSSpellArea;

function face(n) {
  context.SSDNSTestRoll = () => n;
  context.Math.random = () => 0;
}
function row(name) { return Cast.lookup(name); }

const halfNames = ["Arms of Hadar", "Dissonant Whispers", "Hail of Thorns", "Flaming Sphere", "Moonbeam", "Call Lightning", "Conjure Barrage", "Blight", "Conjure Volley", "Destructive Wave", "Prismatic Spray"];
halfNames.forEach((name) => check("half." + name, row(name) && row(name).half === true));

const thorn = row("Hail of Thorns");
check("hail.splash", thorn && thorn.splash && thorn.splash.radius === 5 && thorn.splash.half === true && thorn.splash.includeTarget === true);

const thunder = row("Thunderous Smite");
check("thunder.up", thunder && thunder.up == null && thunder.save === "STR" && thunder.onFail === "Prone" && thunder.push === 10);
face(12);
const thunderRoll = Cast.rollCast({ spellName: "Thunderous Smite", slotLevel: 3, weaponAtk: 5 });
check("thunder.nodiceup", thunderRoll.damageTotal === 2, String(thunderRoll.damageTotal));

check("wrath.save", row("Wrathful Smite").save === "WIS" && row("Wrathful Smite").onFail === "Frightened");
check("blind.save", row("Blinding Smite").save === "CON" && row("Blinding Smite").onFail === "Blinded" && row("Blinding Smite").endSave === "CON");
check("stagger.save", row("Staggering Smite").save === "WIS" && row("Staggering Smite").onFail === "Staggered");
check("sear.burn", row("Searing Smite").burn && row("Searing Smite").burn.dice === "1d6" && row("Searing Smite").burn.save === "CON");
const ens = row("Ensnaring Strike");
check("ensnare.data", ens.save === "STR" && ens.onFail === "Restrained" && ens.diceOn === "start" && ens.escape === "action STR" && ens.startType === "piercing");
face(14);
const ensRoll = Cast.rollCast({ spellName: "Ensnaring Strike", slotLevel: 1, weaponAtk: 5 });
check("ensnare.later", ensRoll.applyNow === false && ensRoll.startOnTurn === true && ensRoll.damageTotal === 1 && /not on the hit/.test(ensRoll.text), ensRoll.text);
check("sick.data", row("Ray of Sickness").hitSave === "CON" && row("Ray of Sickness").onFail === "Poisoned");
const ban = row("Banishing Smite");
check("banish.nosave", ban && ban.save == null && ban.banishAt === 50);

const chain = row("Chain Lightning");
check("chain.data", chain && chain.up == null && chain.targets === 4 && chain.targetUp === 1 && R.chainTargets(6) === 4 && R.chainTargets(8) === 6);
const chainRoll = Cast.rollCast({ spellName: "Chain Lightning", slotLevel: 8, dc: 16 });
check("chain.dice", chainRoll.damageTotal === 10 && chainRoll.targets === 6, JSON.stringify({ total: chainRoll.damageTotal, targets: chainRoll.targets }));

const heat = Cast.rollCast({ spellName: "Heat Metal", slotLevel: 2, dc: 14 });
check("heat.auto", heat.autoDamage === true && heat.half === false && heat.damageTotal === 2 && /automatic/.test(heat.text), heat.text);

const phant = Cast.rollCast({ spellName: "Phantasmal Killer", slotLevel: 4, dc: 15 });
check("phant.later", phant.applyNow === false && phant.damageTotal === 4 && phant.condition === "Frightened" && /no damage now/.test(phant.text), phant.text);
check("phant.dealt", R.dealt(row("Phantasmal Killer"), phant.damageTotal, { failed: true }) === 0);

const guard = Cast.rollCast({ spellName: "Guardian of Faith", slotLevel: 4 });
check("guard.budget", guard.applyNow === false && guard.damageTotal === 20 && guard.budget === 60 && guard.save === "DEX" && guard.half === true && /budget 60/.test(guard.text) && /not dealt on cast/.test(guard.text), guard.text);

face(1);
const acidMiss = Cast.rollCast({ spellName: "Acid Arrow", slotLevel: 2, attackBonus: 5 });
check("acid.miss", acidMiss.damageTotal === 2 && acidMiss.alreadyHalf === true && acidMiss.delayed == null, acidMiss.text);
face(11);
const acidHit = Cast.rollCast({ spellName: "Acid Arrow", slotLevel: 4, attackBonus: 5 });
check("acid.hit", acidHit.damageTotal === 6 && acidHit.delayed && acidHit.delayed.total === 4, JSON.stringify({ dmg: acidHit.damageTotal, delayed: acidHit.delayed }));
check("acid.missfn", R.missDamage(row("Acid Arrow"), 11, true) === 5 && R.missDamage(row("Acid Arrow"), 11, false) === 11);

face(1);
const lightMiss = Cast.rollCast({ spellName: "Lightning Arrow", slotLevel: 3, weaponAtk: 6, weaponDamage: "1d8+3" });
check("light.miss", lightMiss.damageTotal === 2 && lightMiss.alreadyHalf === true, lightMiss.text);
face(11);
const lightHit = Cast.rollCast({ spellName: "Lightning Arrow", slotLevel: 3, weaponAtk: 6, weaponDamage: "1d8+3" });
check("light.replace", lightHit.damageTotal === 4 && !/\+ weapon/.test(lightHit.text), lightHit.text);
check("light.splash", row("Lightning Arrow").splash && row("Lightning Arrow").splash.radius === 10 && row("Lightning Arrow").splash.half === true && row("Lightning Arrow").replacesWeapon === true);

const hunger = Cast.rollCast({ spellName: "Hunger of Hadar", slotLevel: 3 });
check("hunger.tick", hunger.kind === "auto" && hunger.tickEnd && hunger.tickEnd.save === "DEX" && hunger.tickEnd.dice === "2d6" && hunger.tickEnd.type === "acid" && hunger.damageTotal === 2, hunger.text);

const wall = row("Wall of Thorns");
check("thorns.type", wall.type === "piercing" && wall.through === "slashing" && wall.half === true);
check("spirit.speed", row("Spirit Guardians").speed === "half" && row("Spirit Guardians").half === true);

const hexRow = row("Hex");
check("hex.row", hexRow.trigger === "attackHit" && hexRow.conc === true && hexRow.chip === "Hexed" && R.durHours(1) === 1 && R.durHours(3) === 8 && R.durHours(5) === 24);
const markRow = row("Hunter's Mark");
check("mark.row", markRow.trigger === "weaponHit" && markRow.type === "weapon" && markRow.chip === "Marked" && markRow.conc === true);
const shieldRow = row("Fire Shield");
check("shield.row", shieldRow.conc === false && shieldRow.dur === "10 min" && shieldRow.trigger === "meleeHitOnCaster" && R.concentrates("Fire Shield", shieldRow) === false);
check("shield.cast", R.concentrates("Hex", hexRow) === true && R.concentrates("Contagion", row("Contagion")) === false);

let bag = R.emptyBag(null);
let armed = R.arm(bag, { row: hexRow, name: "Hex", slot: 3, targetId: "t1", targetName: "Bandit", ability: "WIS", casterId: "pc" });
check("hex.chip", armed.chips.some((c) => c.name === "Hexed (WIS)") && armed.bag.conc === "Hex" && /8 h/.test(armed.logs.join(" ")), armed.logs.join(" | "));
bag = armed.bag;
const hexHit = R.attackRiders(bag, { hit: true, weaponAttack: true, melee: true, targetId: "t1", crit: false }, () => 4);
check("hex.weapon", hexHit.total === 4 && hexHit.riders[0].type === "necrotic" && /Crossed Hex/.test(hexHit.logs.join(" ")), JSON.stringify(hexHit.riders));
const hexCrit = R.attackRiders(bag, { hit: true, weaponAttack: true, targetId: "t1", crit: true }, () => 4);
check("hex.crit", hexCrit.total === 8, String(hexCrit.total));
const hexSpell = R.attackRiders(bag, { hit: true, spellAttack: true, attack: true, targetId: "t1" }, () => 3);
check("hex.spell", hexSpell.total === 3);
const hexMm = R.attackRiders(bag, { hit: true, spellAttack: true, magicMissile: true, targetId: "t1" }, () => 6);
check("hex.mm", hexMm.total === 0);
const hexSave = R.attackRiders(bag, { hit: true, saveSpell: true, targetId: "t1" }, () => 6);
check("hex.save", hexSave.total === 0);
const hexOther = R.attackRiders(bag, { hit: true, weaponAttack: true, targetId: "t2" }, () => 6);
check("hex.other", hexOther.total === 0);

const marked = R.arm(bag, { row: markRow, name: "Hunter's Mark", slot: 1, targetId: "t1", targetName: "Bandit" });
check("mark.replaces", marked.removed.some((c) => /Hexed/.test(c.name)) && marked.bag.conc === "Hunter's Mark" && !marked.bag.marks.some((m) => m.kind === "hex"), marked.removed.map((c) => c.name).join(","));
const markHit = R.attackRiders(marked.bag, { hit: true, weaponAttack: true, melee: true, targetId: "t1", weaponType: "slashing" }, () => 2);
check("mark.weapon", markHit.total === 2 && markHit.riders[0].type === "slashing" && /Marked Man/.test(markHit.logs.join(" ")));
const markSpell = R.attackRiders(marked.bag, { hit: true, spellAttack: true, attack: true, targetId: "t1", weaponType: "slashing" }, () => 6);
check("mark.notspell", markSpell.total === 0);

const both = R.arm(R.emptyBag(null), { row: shieldRow, name: "Fire Shield", mode: "warm", casterId: "pc" });
const bothHex = R.arm(both.bag, { row: hexRow, name: "Hex", slot: 1, targetId: "t1", ability: "CHA" });
check("shield.stays", bothHex.bag.marks.some((m) => m.kind === "shield") && bothHex.bag.conc === "Hex" && !bothHex.removed.some((c) => /Fire Shield/.test(c.name)));
const broke = R.breakConc(bothHex.bag, "Hex");
check("conc.break", broke.bag.conc === "" && !broke.bag.marks.some((m) => m.kind === "hex") && broke.bag.marks.some((m) => m.kind === "shield") && broke.removed.some((c) => /Hexed/.test(c.name)));

const chill = R.arm(R.emptyBag(null), { row: shieldRow, name: "Fire Shield", mode: "chill", casterId: "pc" });
check("shield.chill", chill.chips[0].name === "Fire Shield (Chill: resist fire)" && chill.conc === false && /not concentration/.test(chill.logs.join(" ")));
const parsed = R.shieldBagFromChips([{ name: chill.chips[0].name }]);
const retal = R.fireShieldHit(parsed, { melee: true, attackerName: "Outlaw" }, () => 5);
check("shield.retaliate", retal && retal.amount === 10 && retal.type === "cold" && /Thermal Jacket/.test(retal.log), retal && retal.log);
check("shield.notmelee", R.fireShieldHit(parsed, { melee: false }, () => 5) == null);
check("shield.resist", R.resistAmount(9, "fire", "fire").amount === 4 && R.resistAmount(9, "cold", "fire").amount === 9);

face(15);
const contagion = Cast.rollCast({ spellName: "Contagion", slotLevel: 5, attackBonus: 6 });
check("contagion.log", contagion.damageTotal === 0 && /no damage — Poisoned/.test(contagion.text) && !/0 dmg/.test(contagion.text) && !/\b0\b/.test(contagion.text.replace(/DC \d+/, "")), contagion.text);
let sick = R.onHitSpell(R.emptyBag(null), { row: row("Contagion"), name: "Contagion", targetId: "t1", disease: "Flesh Rot" });
check("contagion.chip", sick.noDamage === true && sick.chips.some((c) => c.name === "Poisoned") && sick.chips.some((c) => c.name === "Contagion S○○○ F○○○"));
let stepped = sick.bag;
const steps = [];
for (let i = 0; i < 3; i++) {
  const step = R.contagionSave(stepped, "t1", true);
  steps.push(step);
  stepped = step.bag;
}
check("contagion.fail3", steps[2].chips.some((c) => c.name === "Diseased: Flesh Rot (7 days)") && steps[2].logs.some((l) => /Diseased: Flesh Rot/.test(l)), steps[2].logs.join(" | "));
stepped = sick.bag;
for (let i = 0; i < 3; i++) stepped = R.contagionSave(stepped, "t1", false).bag;
check("contagion.save3", !stepped.marks.some((m) => m.kind === "contagion"));

const enf = R.onHitSpell(R.emptyBag(null), { row: row("Ray of Enfeeblement"), name: "Ray of Enfeeblement", targetId: "t1" });
check("enfeeble.chip", enf.chips[0].name === "Enfeebled (½ STR weapon dmg)" && enf.bag.conc === "Ray of Enfeeblement" && /no damage — Enfeebled/.test(enf.logs.join(" ")));
const conds = [{ name: "Enfeebled (½ STR weapon dmg)" }];
check("enfeeble.str", R.enfeebleAmount(conds, 11, { str: true }).amount === 5 && R.enfeebleAmount(conds, 11, { str: true }).halved === true);
check("enfeeble.dex", R.enfeebleAmount(conds, 11, { melee: true, dex: true }).halved === false && R.enfeebleAmount(conds, 11, { melee: true, finesse: true }).halved === false);
check("enfeeble.off", R.enfeebleAmount([], 11, { str: true }).halved === false);

check("sleep.pool", Area.onFail("Sleep") === "" && Area.onFail("Color Spray") === "" && R.poolSpell("Sleep") === "Unconscious" && R.poolSpell("Color Spray") === "Blinded");
check("pattern.fail", Area.onFail("Hypnotic Pattern") === "Charmed + Incapacitated");
check("laugh.fail", Area.onFail("Hideous Laughter") === "Prone + Incapacitated" && R.immune("Hideous Laughter", { int: 4 }) === true && R.immune("Hideous Laughter", { int: 5 }) === false);

const aga = Area.buffOf("Armor of Agathys", 3);
check("agathys", aga && aga.temp === "15" && aga.retaliate === 15 && aga.retaliateType === "cold", JSON.stringify(aga));
check("agathys.fn", R.agathys(1).temp === 5 && R.agathys(1).cold === 5 && R.agathys(4).temp === 20);

const down = R.noteDown(armed.bag, "t1");
const moved = R.transfer(down, "hex", "t9", "Next");
check("hex.move", moved.moved === true && moved.bag.marks[0].targetId === "t9" && moved.bag.marks[0].movable === false);

const pending = R.arm(R.emptyBag(null), { row: row("Searing Smite"), name: "Searing Smite", armPending: true, slot: 1 });
const burned = R.attackRiders(pending.bag, { hit: true, weaponAttack: true, melee: true, targetId: "t1" }, () => 3);
check("sear.tick", burned.bag.ticks.some((t) => t.when === "start" && t.save === "CON" && t.dice === "1d6") && burned.chips.some((c) => c.name === "Burning"));
const ensArm = R.arm(R.emptyBag(null), { row: ens, name: "Ensnaring Strike", armPending: true, slot: 1 });
const ensHit = R.attackRiders(ensArm.bag, { hit: true, weaponAttack: true, melee: true, targetId: "t1" }, () => 1);
const ticks = R.phaseTicks(ensHit.bag, "t1", "start", () => 6);
check("ensnare.tick", ticks.due.length === 1 && ticks.due[0].amount === 6 && ticks.due[0].type === "piercing");

const sheet = read("assets/js/sheet-playtest.js");
const join = read("assets/js/dm-join.js");
const v2 = read("dm/assets/js/v2.js");
check("src.melee", sheet.includes("melee: !(tk && tk.thrown)") && join.includes("if (entry.melee) row.melee = true") && v2.includes("melee: !!req.melee"));
const rulesDiff = execSync("git diff --name-only -- assets/data/rules.js database.rules.json", { cwd: root }).toString().trim();
check("rules.untouched", rulesDiff === "", rulesDiff);
const rules = read("assets/data/rules.js");
check("rules.nover", !rules.includes("0.3.168") && !rules.includes("spell-riders"));
const version = JSON.parse(read("version.json"));
check("ver.sheet", version.sheet === "0.3.168" && version.sheetBuild === "sheet-playtest-v03168");
check("ver.dmcc", version.dmcc === "0.2.181" && version.dmccBuild === "dmcc-playtest-v02181");

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\nall checks passed");

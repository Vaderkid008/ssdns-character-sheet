/**
 * Full enemy sheet: named attacks, saves, DCs, spells, and the existing apply path.
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

const sandbox = {
  console, Math, Date, JSON, parseInt, isFinite, Number, String, Object, Array,
  URL, encodeURIComponent, Promise, setTimeout, clearTimeout
};
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
sandbox.localStorage = { getItem() { return null; }, setItem() {} };
sandbox.document = {
  getElementById() { return null; },
  addEventListener() {},
  querySelector() { return null; },
  querySelectorAll() { return []; },
  createElement() {
    return { className: "", innerHTML: "", dataset: {}, addEventListener() {}, querySelector() { return { addEventListener() {} }; }, setAttribute() {} };
  },
  body: { appendChild() {} }
};
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
sandbox.DMCC = {
  $: () => null,
  $$: () => [],
  esc,
  state: { players: {}, ledger: [], demo: true, roomCode: "", uid: "dm" },
  toast() {},
  uid(p) { return (p || "id") + "1"; },
  guardFocus(fn) { if (fn) fn(); }
};
vm.createContext(sandbox);
vm.runInContext(read("assets/js/apply-guard.js"), sandbox, { filename: "apply-guard.js" });
vm.runInContext(read("assets/data/rules.js"), sandbox, { filename: "rules.js" });
vm.runInContext(read("assets/js/spell-cast.js"), sandbox, { filename: "spell-cast.js" });
const v2 = read("dm/assets/js/v2.js").replace(/\nwireLookupNow\(\);\s*\nbootV2\(\);\s*$/, "\nglobalThis.__enemy = { enemyCardHtml, compactAttackButtons, turnRowHtml, enemyPickerList, enemySelectHtml, claimEnemyAdd, finishEnemyAdd };\n");
vm.runInContext(v2, sandbox, { filename: "v2.js" });

const Applied = sandbox.SSDNSApplied;
const htmlOf = sandbox.__enemy.enemyCardHtml;
const compact = sandbox.__enemy.compactAttackButtons;
const beasts = JSON.parse(read("dm/assets/data/bestiary.json"));
function beast(id) { return beasts.filter((b) => b.id === id)[0]; }
function rowFor(id) {
  const b = beast(id);
  const card = Applied.enemyCardModel(b);
  return {
    id: "en-" + id,
    name: b.name,
    kind: "enemy",
    ac: b.ac,
    hp: b.hp,
    maxHp: b.hp,
    atkBonus: b.atkBonus,
    damage: b.damage || "",
    attacks: b.attacks || "",
    beastId: b.id,
    card
  };
}

const outlaw = rowFor("outlaw");
const outlawHtml = htmlOf(outlaw, 0);
check(outlaw.card.attacks.length === 2, "outlaw has two attacks");
check(Applied.attackButtonLabel(outlaw.card.attacks[0]) === "Revolver +3", "revolver label");
check(Applied.attackButtonLabel(outlaw.card.attacks[1]) === "Bowie +3", "bowie label");
check(outlawHtml.indexOf("Revolver") >= 0 && outlawHtml.indexOf("ranged") >= 0 && outlawHtml.indexOf("1d8+1 piercing") >= 0 && outlawHtml.indexOf("20/60") >= 0 && outlawHtml.indexOf("6/6") >= 0 && outlawHtml.indexOf("MF 1") >= 0, "outlaw revolver row " + outlawHtml.slice(0, 400));
check(outlawHtml.indexOf("Bowie") >= 0 && outlawHtml.indexOf("melee") >= 0 && outlawHtml.indexOf("1d6+1") >= 0, "outlaw bowie row");
check(outlawHtml.indexOf(">Attack<") < 0 && outlawHtml.indexOf("Attack player") < 0, "no generic Attack button on the outlaw sheet");
check((outlawHtml.match(/data-sheet-roll="1"/g) || []).length === 2, "one Roll per outlaw attack");
check((outlawHtml.match(/data-sheet-apply="1"/g) || []).length === 2, "one Apply per outlaw attack");
check(outlawHtml.indexOf("Prompt player save") < 0, "outlaw has no rider save");
check((outlawHtml.match(/data-check-label="(STR|DEX|CON|INT|WIS|CHA)"/g) || []).length === 6, "six ability checks");
check(outlawHtml.indexOf(">Perception") < 0 && outlawHtml.indexOf(">Arcana") < 0, "outlaw lists no skills");
check((outlawHtml.match(/data-check-label="[A-Z]{3} save"/g) || []).length === 6, "all six saves");
["STR", "DEX", "CON", "INT", "WIS", "CHA"].forEach((key) => {
  check(outlaw.card.scores[key] != null, "outlaw score " + key);
  check(Applied.saveMod(outlaw.card, key) === Applied.abilityMod(outlaw.card.scores[key]), "outlaw " + key + " save uses the ability mod");
});
check(outlawHtml.indexOf("passive Perception 10") >= 0, "outlaw senses");
check(outlawHtml.indexOf("six-gun") >= 0, "outlaw description");
check(outlawHtml.indexOf("data-hp-val=\"0\"") >= 0 && outlawHtml.indexOf("data-max-val=\"0\"") >= 0, "editable HP");
check(outlawHtml.indexOf('class="hp-bar"') >= 0, "hp bar");
check(outlawHtml.indexOf("data-card-public=\"0\">") >= 0, "dice box is private by default");
check(outlawHtml.indexOf("data-reveal=\"name\" data-reveal-i=\"0\" checked") >= 0 && outlawHtml.indexOf("data-reveal=\"ac\" data-reveal-i=\"0\">") >= 0, "name is revealed and AC stays hidden");
check(outlawHtml.indexOf("data-sheet-dice=\"1\"") >= 0 && outlawHtml.indexOf("sheet-dice") >= 0, "dice box roll");
check(outlawHtml.indexOf('value="adv"') >= 0 && outlawHtml.indexOf('value="dis"') >= 0, "adv/dis toggle");
const outlawCompact = compact(outlaw, 0);
check(outlawCompact.indexOf("Revolver +3") >= 0 && outlawCompact.indexOf("Bowie +3") >= 0 && outlawCompact.indexOf("Open sheet") >= 0 && outlawCompact.indexOf("Attack player") < 0, "fight row names the attacks " + outlawCompact);

const boss = rowFor("switch-boss");
const bossHtml = htmlOf(boss, 1);
const rifle = boss.card.attacks[0];
check(rifle.name === "Dirty Rifle" && rifle.capacity === 6 && rifle.loaded === 6 && rifle.misfire === 2, "switch boss rifle");
check(bossHtml.indexOf("6/6") >= 0 && bossHtml.indexOf("MF 2") >= 0 && bossHtml.indexOf("Henrietta") >= 0, "rifle capacity, misfire, notes");
check(bossHtml.indexOf("Dirty Rifle") >= 0 && bossHtml.indexOf("Handcar Nest") >= 0 && bossHtml.indexOf("Morale") >= 0, "switch boss traits");
check(bossHtml.indexOf("Clear Jam") >= 0 && bossHtml.indexOf("Flee on the Handcar") >= 0, "switch boss actions");
check(boss.card.esDrop === 250 && bossHtml.indexOf("Drops 250 ES") >= 0 && bossHtml.indexOf("Boss poke") >= 0, "loot and es drop");
check(Applied.tacticsNote(beast("switch-boss")) === "Flees on the handcar when he is the last of the crew standing.", "switch boss tactics field");
check(bossHtml.indexOf("Tactics. Flees on the handcar") >= 0, "sheet shows the tactics line");
const moraleOnly = { traits: [{ name: "Morale (tactic)", text: "Runs when alone." }, { name: "Pack Tactics", text: "Advantage with an ally." }] };
check(Applied.tacticsNote(moraleOnly) === "Runs when alone.", "morale trait is the fallback");
check(Applied.tacticsNote({ tactics: "focuses the caster", traits: moraleOnly.traits }) === "focuses the caster", "tactics field wins");
check(Applied.tacticsNote({ traits: [{ name: "Pack Tactics", text: "Advantage with an ally." }] }) === "", "pack tactics is not a morale note");
check(Applied.tacticsNote(beast("outlaw")) === "Surrenders when wounded or outnumbered; lookouts ride off to warn the gang." && outlawHtml.indexOf("Tactics. Surrenders when wounded") >= 0, "outlaw tactics line");
rifle.jammed = true;
const jammed = htmlOf(boss, 1);
check(jammed.indexOf("Jammed") >= 0 && jammed.indexOf("data-clear-jam") >= 0, "jam state on the row");

const devil = rowFor("dust-devil");
const devilHtml = htmlOf(devil, 2);
check(Applied.riderText(devil.card.attacks[0].rider) === "DC 11 STR or Prone", "rider text");
check(Applied.dcLines(devil.card).indexOf("Bite: DC 11 STR or Prone") >= 0, "prominent bite DC");
check(devilHtml.indexOf("Bite: DC 11 STR or Prone") >= 0 && devilHtml.indexOf("DC 11 STR or Prone") >= 0, "devil sheet shows the DC");
check(devilHtml.indexOf("Prompt player save") >= 0 && devilHtml.indexOf("Auto-roll") >= 0, "rider offers prompt and auto-roll");
check(Applied.saveMod(devil.card, "DEX") === 2, "dust devil DEX save is +2 from 15");
check(Applied.saveMod(devil.card, "STR") === 1 && Applied.saveMod(devil.card, "INT") === -4, "other devil saves use the score");
check(devil.card.skills.Perception === 3 && devil.card.skills.Stealth === 4, "devil skills");
check(devilHtml.indexOf("Perception +3") >= 0 && devilHtml.indexOf("Stealth +4") >= 0, "skill buttons");
const overridden = Applied.enemyCardModel(beast("dust-devil"));
overridden.saves = { STR: 5, DEX: { bonus: 4 } };
check(Applied.saveMod(overridden, "STR") === 5 && Applied.saveMod(overridden, "DEX") === 4 && Applied.saveMod(overridden, "WIS") === 1, "listed saves override the ability mod");
devil.card.traits.push({ name: "Howl", text: "Once.", uses: 1, recharge: "short rest" });
const used = htmlOf(devil, 2);
check(used.indexOf("Use Howl (1)") >= 0 && used.indexOf("Recharge short rest") >= 0, "uses and recharge buttons");

const witch = rowFor("cactus-witch");
const witchHtml = htmlOf(witch, 3);
check(Applied.dcLines(witch.card).indexOf("Spell save DC 12 (CHA)") >= 0, "witch spell DC line");
check(witchHtml.indexOf("Spell save DC 12 (CHA)") >= 0 && witchHtml.indexOf("At will") >= 0, "witch spell header");
check(witch.card.spellcasting.spells.length === 3, "three witch spells");
["dancing lights", "minor illusion", "vicious mockery"].forEach((name) => {
  check(witchHtml.toLowerCase().indexOf(name) >= 0, "spell " + name);
});
check(witchHtml.indexOf("Cast (save)") >= 0, "save spell opens as Cast (save)");
check(witchHtml.indexOf("Vicious Mockery") >= 0 && witchHtml.indexOf("DC 12") >= 0 && witchHtml.indexOf("1d4") >= 0, "mockery meta");
check(witch.card.skills.Arcana === 3 && witch.card.skills.Deception === 4, "witch skills");
check(Applied.attackButtonLabel(witch.card.attacks[0]) === "Claws +6", "claws label");
check(Applied.saveMod(witch.card, "CHA") === 2, "witch CHA save from the score");

const src = read("dm/assets/js/v2.js");
const html = read("dm/index.html");
const css = read("dm/assets/css/dmcc.css");
const version = JSON.parse(read("version.json"));
const turnStart = src.indexOf("function turnRowHtml");
const turnEnd = src.indexOf("function fightRowFromField");
const turnBody = src.slice(turnStart, turnEnd);
check(turnBody.indexOf("enemyCardHtml") < 0, "the fight row no longer inlines the whole card");
check(turnBody.indexOf("data-open-enemy") >= 0 && turnBody.indexOf("compactAttackButtons") >= 0, "the row name opens the sheet");
check(src.indexOf('data-open-enemy="${esc(row.id || "")}"') >= 0, "turn order chip opens the sheet");
check(src.indexOf("data-open-beast") >= 0 && src.indexOf("data-beast-card") >= 0, "bestiary name and row open the sheet");
check(src.indexOf("function openEnemyById") >= 0 && src.indexOf("function openEnemyBeast") >= 0 && src.indexOf("function renderEnemySheet") >= 0, "sheet openers");
check(src.indexOf("skipRider: true") >= 0 && src.indexOf("opts && opts.skipRider") >= 0, "sheet Roll does not also fire the rider");
check(src.indexOf("function applyLastStrike") >= 0 && src.indexOf("Already applied") >= 0 && src.indexOf("settled(room, last.id)") >= 0, "Apply uses the settled roll");
check(src.indexOf("function claimApply") >= 0 && src.indexOf("if (rollId && !claimApply(rollId)) return;") >= 0, "apply still claims the roll id");
check(src.indexOf("livingPlayer") >= 0 && src.indexOf("row.lastAttackerId") >= 0, "target picker prefers a living last attacker");
check(html.indexOf('id="enemySheet"') >= 0 && html.indexOf('id="btnCloseEnemy"') >= 0, "sheet overlay");
check(css.indexOf(".enemy-sheet.drawer") >= 0 && css.indexOf(".sheet-dice") >= 0 && css.indexOf("position: sticky") >= 0, "sheet layout and sticky dice");
check(src.indexOf("tactics-note") >= 0 && src.indexOf("On deck:") >= 0 && src.indexOf("Bloodied") >= 0, "fight row tactics, on deck, bloodied");
check(read("docs/DM-PRINCIPLES.md").indexOf("eyes stay on the table") >= 0, "principles doc");
check(read("docs/DM-PRINCIPLES.md").indexOf("Take Cover only") < 0 && read("docs/DM-PRINCIPLES.md").indexOf("three-quarters cover is +5") >= 0, "half and three-quarters cover stay in the checklist");
check(read("index.html").indexOf("Kneeling or prone alone is not cover") >= 0 && read("assets/data/rules.js").indexOf("Half cover is +2 and three-quarters cover is +5") >= 0, "sheet and rules state the cover lock");
check((read("assets/data/rules.js").match(/stacks on half \/ three-quarters cover/g) || []).length === 2, "Lead and Levers and Gunslinger note that Take Cover stacks");
check(read("docs/SCHEMA.md").indexOf("`tactics`") >= 0, "schema documents tactics");
const liveBeasts = beasts.filter((b) => b && !b.template);
check(liveBeasts.length === 48, "48 enemies");
check(liveBeasts.filter((b) => b.group === "creature").length === 24 && liveBeasts.filter((b) => b.group === "generic-folk").length === 10 && liveBeasts.filter((b) => b.group === "named").length === 14, "creatures, folk, named");
check(liveBeasts.filter((b) => b.parked).map((b) => b.id).join(",") === "captain-rhee-calder", "only Calder is parked");
const wakan = beasts.filter((b) => b.id === "wakan-takan")[0];
check(wakan && wakan.spellcasting.dc === 13 && wakan.spellcasting.attack === 5 && wakan.saves.INT === 5 && wakan.saves.WIS === 3 && wakan.attackList[0].toHit === 4 && wakan.proficiencyNote == null, "Wakan Takan uses proficiency +2");
const wakanSpells = ["Chill Touch", "Spare the Dying", "Mage Hand", "Prestidigitation", "False Life", "Mage Armor", "Ray of Sickness", "Shield", "Blindness/Deafness", "Misty Step", "Ray of Enfeeblement", "Vampiric Touch"];
check(wakan && wakan.spellcasting.spells.map((s) => s.name).join("|") === wakanSpells.join("|"), "Wakan Takan necromancer list");
check(wakanSpells.every((name) => sandbox.SSDNSSpellCast.lookup(name)), "every Wakan Takan spell resolves");
check(liveBeasts.every((b) => !("pendingJessey" in b)), "pendingJessey is gone");
const buffalo = beasts.filter((b) => b.id === "buffalo-spirit")[0];
check(buffalo && buffalo.type === "beast (spirit)" && /Spirits fade/.test(buffalo.loot || "") && (buffalo.traits || []).some((t) => t.name === "Spirit Strikes"), "Buffalo Spirit is a spirit with no loot");
const buffaloCard = Applied.enemyCardModel(buffalo);
check(Applied.sheetHeader({ size: buffaloCard.size, type: buffaloCard.type, cr: buffaloCard.cr, side: "Enemy", speed: buffaloCard.speed }) === "Huge beast (spirit) · CR 2 · Enemy · Speed 60 ft.", "buffalo sheet header");
check(Applied.sheetHeader({ size: "undefined", type: null, cr: "1/8", side: "Enemy", speed: "30 ft." }) === "CR 1/8 · Enemy · Speed 30 ft.", "a custom combatant omits a missing size and type");
check(src.indexOf("sheetHeader") >= 0, "the sheet subtitle uses the header");
const ray = sandbox.SSDNSSpellCast.lookup("Ray of Enfeeblement");
check(ray && ray.kind === "attack" && ray.level === 2, "Ray of Enfeeblement is an attack");
const rayRoll = sandbox.SSDNSSpellCast.rollCast({ spellName: "Ray of Enfeeblement", slotLevel: 2, attackBonus: 5 });
check(rayRoll.attack === true && /spell attack/.test(rayRoll.text) && !/on hit 0/.test(rayRoll.text), "enfeeblement rolls an attack and no fake damage");
check(sandbox.SSDNSSpellCast.lookup("Contagion").kind === "attack", "Contagion is a spell attack");
["Chill Touch", "Ray of Frost", "Shocking Grasp", "Ray of Sickness", "Scorching Ray", "Vampiric Touch"].forEach((name) => {
  check(sandbox.SSDNSSpellCast.lookup(name).kind === "attack", name + " stays an attack");
});
const scorp = Applied.enemyCardModel(beasts.filter((b) => b.id === "giant-scorpion")[0]);
const claw = scorp.attacks.filter((a) => a.name === "Claw")[0];
const sting = scorp.attacks.filter((a) => a.name === "Sting")[0];
check(Applied.grappleText(claw.grapple) === "Grappled (escape DC 12)", "claw grapple text");
check(Applied.saveDamageText(sting.saveDamage).indexOf("DC 12 CON") >= 0 && Applied.saveDamageText(sting.saveDamage).indexOf("half on a success") >= 0, "sting save for half");
check(Applied.namedCondition({ save: "CON", dc: 12 }) === "" && Applied.namedCondition({ condition: "Prone" }) === "Prone" && Applied.namedCondition({ condition: "condition" }) === "", "a save with no condition applies none");
check(Applied.halved(7) === 3 && Applied.halved(4) === 2, "half damage rounds down");
check(src.indexOf('|| "condition"') < 0, "a missing rider condition is not named condition");
check(html.indexOf("Show parked") >= 0 && html.indexOf('id="beastQ"') >= 0 && src.indexOf("Creatures") >= 0, "grouped picker and search");
const suggestion = sandbox.SSDNSSpellCast.lookup("Suggestion");
check(suggestion && suggestion.kind === "save" && suggestion.save === "WIS", "Suggestion is a Wisdom save");
const hiddenScorp = Applied.publicEnemy({ kind: "enemy", name: "Giant Scorpion", ac: 15, hp: 52, maxHp: 52, card: scorp }, 0, []);
check(hiddenScorp.ac == null && hiddenScorp.hp == null && JSON.stringify(hiddenScorp).indexOf("saveDamage") < 0, "a hidden scorpion keeps poison and AC off the public node");
check(Applied.combatantSide({}) === "enemy" && Applied.combatantSide({ side: "friendly" }) === "friendly" && Applied.combatantSide({ ally: true }) === "friendly", "missing side stays an enemy");
const allyPub = Applied.publicEnemy({ kind: "enemy", name: "Abigail Ellen", side: "friendly", ac: 15, hp: 9 }, 0, []);
check(allyPub.side === "friendly" && allyPub.ac == null && allyPub.hp == null, "friendly side is public and AC stays hidden");
check(hiddenScorp.side === "enemy", "a new enemy publishes side enemy");
const allyRow = Object.assign({}, outlaw, { side: "friendly" });
const allyCard = htmlOf(allyRow, 0);
const allyFight = sandbox.__enemy.turnRowHtml(allyRow, 0);
const enemyFight = sandbox.__enemy.turnRowHtml(outlaw, 0);
check(allyFight.indexOf("friendly") >= 0 && allyFight.indexOf("Friendly") >= 0 && allyFight.indexOf("Mark enemy") >= 0, "friendly card is marked");
check(allyFight.indexOf("data-row-atk") < 0 && allyFight.indexOf("Attack player") < 0 && allyFight.indexOf("Attack this player") < 0, "friendly card does not target a player");
check(allyFight.indexOf("Attack this creature") >= 0 && allyFight.indexOf("Attack this enemy") < 0 && allyFight.indexOf('class="who-name"') >= 0 && allyFight.indexOf('class="badge eld"') >= 0, "friendly card says Attack this creature and keeps the badge on the name");
check(enemyFight.indexOf("Attack this enemy") >= 0 && enemyFight.indexOf("Attack this creature") < 0, "an enemy card still says Attack this enemy");
check(sandbox.__enemy.claimEnemyAdd("abigail-ellen") === true, "the first add is accepted");
check(sandbox.__enemy.claimEnemyAdd("abigail-ellen") === false, "the same click does not add a second copy");
sandbox.__enemy.finishEnemyAdd();
check(sandbox.__enemy.claimEnemyAdd("abigail-ellen") === true, "a later click can add another copy");
sandbox.__enemy.finishEnemyAdd();
check(enemyFight.indexOf("data-row-atk") >= 0 && enemyFight.indexOf("Mark friendly") >= 0 && enemyFight.indexOf("init-row friendly") < 0, "enemy card still attacks and offers the toggle");
check(allyCard.indexOf("data-sheet-roll") < 0 && allyCard.indexOf("does not target the party") >= 0 && outlawHtml.indexOf("data-sheet-roll") >= 0, "friendly sheet keeps the attack text without the roll");
const picker = [
  { id: "wolf", name: "Wolf", group: "creature" },
  { id: "abigail-ellen", name: "Abigail Ellen", group: "named" },
  { id: "outlaw", name: "Outlaw", group: "generic-folk" },
  { id: "captain-rhee-calder", name: "Calder", group: "named", parked: true }
];
const picked = sandbox.__enemy.enemyPickerList(picker, "abig", false);
check(picked.length === 1 && picked[0].id === "abigail-ellen", "fight search finds Abigail");
check(sandbox.__enemy.enemyPickerList(picker, "", false).some((b) => b.parked) === false, "parked stays out of the fight menu");
const menu = sandbox.__enemy.enemySelectHtml(sandbox.__enemy.enemyPickerList(picker, "", false));
check(menu.indexOf('label="Creatures"') >= 0 && menu.indexOf('label="Folk"') >= 0 && menu.indexOf('label="Named"') >= 0 && menu.indexOf("Abigail Ellen") >= 0, "fight menu uses group headers");
check(html.indexOf('id="enemyQ"') >= 0, "fight search box is in the page");
check(version.dmcc === "0.2.29" && version.dmccBuild === "dmcc-playtest-v0229", "dmcc version");
check(version.sheet === "0.3.16" && version.sheetBuild === "sheet-playtest-v0316", "sheet version");
check(read("dm/assets/js/dmcc.js").indexOf('VERSION = "0.2.29"') >= 0, "dmcc.js version");
check(!fs.existsSync(path.join(root, "database.rules.json")) || read("database.rules.json").indexOf("enemySheet") < 0, "no rules change for the sheet");

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("ok enemy sheet");

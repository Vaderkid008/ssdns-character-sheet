/**
 * Round 11: weapon names, bestiary combat fill, traits, undo once,
 * kick and room-move wiring, and the condition list.
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
  const sandbox = { window: {}, console, Math, Date, JSON, parseInt, isFinite, Number, String, Object, Array, URL, encodeURIComponent };
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
  "assets/js/spell-cast.js",
  "assets/js/creator.js"
]);
const Applied = box.SSDNSApplied;
const Cast = box.SSDNSSpellCast;
const Creator = box.SSDNSCreator;
const Cond = box.SSDNSConditions;

check(Applied.weaponName("Revolver +4, 1d8+2") === "Revolver", "weapon name drops the bonus and dice");
check(Applied.hitLine("Moss", "Outlaw", "Revolver +4, 1d8+2", 6) === "Moss hits Outlaw with Revolver for 6", "hit line uses the weapon name");

const beasts = JSON.parse(read("dm/assets/data/bestiary.json"));
const ids = beasts.map((b) => b.id);
check(ids.indexOf("_template") >= 0 && ids.indexOf("outlaw") >= 0 && ids.indexOf("cactus-witch") >= 0 && ids.indexOf("dust-devil") >= 0, "bestiary has the night-at-the-switch entries");
check(ids.indexOf("switch-boss") === ids.indexOf("outlaw") + 1, "switch boss sits after outlaw");
const dust = beasts.filter((b) => b.id === "dust-devil")[0];
const outlaw = beasts.filter((b) => b.id === "outlaw")[0];
const witch = beasts.filter((b) => b.id === "cactus-witch")[0];
const template = beasts.filter((b) => b.id === "_template")[0];
check(template && template.template === true, "template is hidden from pickers");
check(dust && Number(dust.hp) === 11 && Number(dust.ac) === 13, "dust devil replaces the HP 22 placeholder");
check(Array.isArray(dust.attackList) && dust.attackList[0].name === "Bite", "dust devil attackList is structured");
check(dust.attackList[0].rider && dust.attackList[0].rider.condition === "Prone", "bite rider is Prone");
const filled = Applied.beastCombatant(outlaw);
check(Number(filled.ac) === 12 && Number(filled.hp) === 11 && Number(filled.maxHp) === 11, "outlaw fills AC and HP");
check(Number(filled.dex) === 12 && Number(filled.atkBonus) === 3 && filled.damage === "1d8+1", "first attack fills the Attack player fields, got " + JSON.stringify(filled));
check(Applied.traitText(witch.traits).indexOf("Amphibious") === 0 && Applied.traitText(witch.traits).indexOf("[object Object]") < 0, "trait cards print the name and text");
check(Applied.traitText({ name: "Nope" }) === "", "a bare trait object does not print");
const boss = beasts.filter((b) => b.id === "switch-boss")[0];
const bossFill = Applied.beastCombatant(boss);
check(boss && boss.hp === 11 && boss.attackList[0].toHit === 3 && boss.attackList[0].misfire === 2, "switch boss keeps the canon rifle");
check(Number(bossFill.atkBonus) === 3 && bossFill.damage === "1d8+1", "switch boss attackList fills Attack player, got " + JSON.stringify(bossFill));
check(Applied.traitText(boss.actions).indexOf("Clear Jam") >= 0 && Applied.traitText(boss.actions).indexOf("Flee on the Handcar") >= 0 && Applied.traitText(boss.actions).indexOf("[object Object]") < 0, "actions print like traits");
check(Applied.sheetInviteUrl("https://vaderkid008.github.io/ssdns-character-sheet/dm/", "dust-4821") === "https://vaderkid008.github.io/ssdns-character-sheet/?room=DUST-4821#room=DUST-4821", "pages invite drops /dm/");
check(Applied.sheetInviteUrl("https://vaderkid008.github.io/ssdns-character-sheet/dm/index.html?x=1", "AB-12") === "https://vaderkid008.github.io/ssdns-character-sheet/?room=AB-12#room=AB-12", "index.html invite drops the query");
check(Applied.sheetInviteUrl("http://127.0.0.1:8765/dm/?demo=1", "VELD-9") === "http://127.0.0.1:8765/?room=VELD-9#room=VELD-9", "local invite uses this origin");
check(Applied.sheetInviteUrl("https://example.github.io/fork-name/dm/", "SWITCH-1") === "https://example.github.io/fork-name/?room=SWITCH-1#room=SWITCH-1", "a fork keeps its own path");

const mem = { bag: {} };
const storage = {
  getItem(k) { return Object.prototype.hasOwnProperty.call(mem.bag, k) ? mem.bag[k] : null; },
  setItem(k, v) { mem.bag[k] = String(v); }
};
check(Applied.claim("RUST", "hit-1", storage), "apply claims");
check(Applied.takeUndo("RUST", "hit-1", storage), "undo restores once");
check(!Applied.takeUndo("RUST", "hit-1", storage), "a second undo is refused");

const word = Cast.blurb("Healing Word");
check(word === "60 ft · 1d4 + mod", "Healing Word card says range and 1d4 + mod, got " + word);
check(!Cond.catalog().some((row) => row.name === "Bleeding"), "Bleeding is not a sheet condition");

const raised = Creator.buildSheet({ calling: "gunslinger", name: "Wade", level: 3 });
check(raised.ok && raised.character.level === 3 && Number(raised.character.hpMax) > Number(Creator.buildSheet({ calling: "gunslinger", name: "Wade", level: 1 }).character.hpMax), "level 3 adds average hit dice");

const v2 = read("dm/assets/js/v2.js");
const dmcc = read("dm/assets/js/dmcc.js");
const join = read("assets/js/dm-join.js");
const extras = read("assets/js/sheet-extras.js");
const play = read("assets/js/sheet-playtest.js");
const css = read("assets/css/sheet.css");
const app = read("assets/js/app.js");
check(v2.indexOf("ssdns.dm.bestiary.v2") >= 0 && v2.indexOf("example") >= 0, "saved bestiary cannot override canon numbers");
check(v2.indexOf("function enterRoom") >= 0 && v2.indexOf("fight.removed") >= 0, "a new room keeps its own turn order");
check(v2.indexOf("Round \" + fight.round") >= 0, "next turn writes a round line");
check(dmcc.indexOf("function kickPlayer") >= 0 && dmcc.indexOf("function newRoomCode") >= 0, "kick and new code are wired");
check(dmcc.indexOf('bind("kicked"') >= 0 && join.indexOf('case "kicked"') >= 0, "a kick reaches the sheet");
check(join.indexOf("The DM removed you from the table") >= 0 && join.indexOf("Table moved to ") >= 0, "kick and move toasts");
check(join.indexOf("/kicked/") >= 0, "join refuses a kicked uid");
check(extras.indexOf("You're at 0 HP") >= 0 && extras.indexOf("You can't attack yourself") >= 0, "self and downed attacks are blocked");
check(extras.indexOf(" disadvantage") >= 0 && play.indexOf("advPin") >= 0, "disadvantage is labeled and one-shot unless pinned");
check(css.indexOf("body.sheet-readonly .tab-warn button { pointer-events: auto; }") >= 0, "take over receives a real click");
check(app.indexOf("Bleeding:") < 0 && read("dm/assets/js/demo-data.js").indexOf("Bleeding") < 0, "Bleeding is removed");
check(read("version.json").indexOf('"sheet": "0.3.17"') >= 0 && read("version.json").indexOf('"dmcc": "0.2.30"') >= 0, "round 13 versions");
const suggestion = Cast.lookup("Suggestion");
check(suggestion && suggestion.kind === "save" && suggestion.save === "WIS", "Suggestion is a Wisdom save");
const html = read("dm/index.html");
const creator = read("assets/js/creator.js");
check(html.indexOf('id="btnCopyLink"') >= 0 && html.indexOf('id="roomCodeDisplay"') >= 0 && html.indexOf("<button") >= 0, "copy invite and the header code are buttons");
check(dmcc.indexOf("Invite link copied") >= 0 && dmcc.indexOf("sheetInviteUrl") >= 0 && dmcc.indexOf("copyInvite") >= 0, "new code still copies the current invite");
check(v2.indexOf("traitText(b.actions)") >= 0, "bestiary cards print actions");
check(join.indexOf("readRoomParam") >= 0 && join.indexOf("replaceState") >= 0 && join.indexOf("consumeInvite") >= 0 && join.indexOf("joinFromBar") >= 0, "the sheet waits for one Join click");
check(creator.indexOf("consumeInvite") >= 0, "wizard finish joins the invite");

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("ok 42");

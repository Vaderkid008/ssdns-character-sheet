/**
 * Phone layout, initiative strip, chat names, and SFX variant pools.
 * Sheet 0.3.54 / DMCC 0.2.67.
 */
import fs from "fs";
import path from "path";
import vm from "vm";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
function check(cond, msg) { if (!cond) failures.push(msg); }
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }

const version = JSON.parse(read("version.json"));
check(version.sheet === "0.3.136" && version.sheetBuild === "sheet-playtest-v03136", "sheet 0.3.55");
check(version.dmcc === "0.2.149" && version.dmccBuild === "dmcc-playtest-v02149", "dmcc 0.2.68");
check(read("assets/js/app.js").includes('APP_VERSION = "0.3.136"'), "sheet banner");
check(read("dm/assets/js/dmcc.js").includes('VERSION = "0.2.149"'), "dmcc banner");
check(!read("assets/data/rules.js").includes("0.3.136"), "rules.js was not regenerated for this bump");

const sheetCss = read("assets/css/sheet.css");
const dmCss = read("dm/assets/css/dmcc.css");
const mapCss = read("map/ssdns-map.css");
const diceCss = read("assets/css/dice.css");
[sheetCss, dmCss, mapCss, diceCss].forEach((css, i) => {
  const name = ["sheet", "dmcc", "map", "dice"][i];
  check(css.includes("@media (max-width: 700px)") && css.includes("@media (max-width: 520px)"), name + " has 700 and 520 phone queries");
});
check(sheetCss.includes("overflow-x: hidden") && dmCss.includes("overflow-x: hidden") && mapCss.includes("overflow-x: hidden"), "phone pages hide horizontal overflow");
check(sheetCss.includes("min-height: 40px") && dmCss.includes("min-height: 40px") && mapCss.includes("min-height: 40px") && diceCss.includes("min-height: 40px"), "phone tap targets are at least 40px");
check(sheetCss.includes(".your-turn-box") && sheetCss.includes("#b42318"), "your turn is a red box");
check(sheetCss.includes(".turn-order-strip") && sheetCss.includes("overflow-x: auto"), "sheet strip scrolls instead of widening the page");
check(diceCss.includes(".dice-bar") && diceCss.includes("flex-wrap: wrap"), "dice bar wraps on a phone");

const play = read("assets/js/sheet-playtest.js");
check(play.includes("your-turn-box") && play.includes('textContent = "Your turn"'), "player sheet shows Your turn");
check(play.includes("side-pc") && play.includes("side-enemy") && play.includes("ondeck") && play.includes("chip-face"), "sheet strip uses portrait chips and on-deck grey");
check(play.includes("chip faction") && play.includes("status-chips"), "sheet strip can show faction and status chips");
check(!/showTurn[\s\S]{0,2500}Next</.test(play), "the player strip does not grow a Next button");

const v2 = read("dm/assets/js/v2.js");
const dmHtml = read("dm/index.html");
check(!v2.includes('data-strip-next="1">Next</button>') && v2.includes('id="dmTurnNames"') && !/>Next<\/button>/.test(v2.slice(v2.indexOf("function renderFight"), v2.indexOf("function rewriteAnnounce"))), "DMCC Table strip shows the order only; the Fight tab's Next is the one Next (turn order PR 1)");
check(v2.includes("rollAllBtn.hidden = !!fight.started"), "Roll Init hides once combat starts");
check(dmHtml.includes('id="combatantMenu"') && dmHtml.includes('id="btnRollInitAll"') && !dmHtml.includes('id="btnRollAll"') && dmHtml.includes('id="btnNextTurn"'), "Fight keeps one Roll Initiative, one Next, and one combatant menu");
check(v2.includes("side-pc") && v2.includes("ondeck") && v2.includes("chip-face") && v2.includes("statusChipsHtml"), "table strip matches the fight portraits");
check(v2.includes("function factionOf") && v2.includes('class="chip faction"'), "faction chips render only from faction data");

const mapJs = read("map/ssdns-map.js");
check(mapJs.includes("ssm-turnstrip") && mapJs.includes("chip-name") && mapJs.includes("textContent = 'Next'") && mapJs.includes("textContent = 'Undo last Next'"), "map strip stays left to right with Next and Undo last Next");
check(mapJs.includes("data-name-mode=\"character\"") && mapJs.includes("data-name-mode=\"player\""), "map chat has the name toggle");

const guardBox = {
  console, Math, Date, JSON, parseInt, isFinite, Number, String, Object, Array, RegExp,
  localStorage: { bag: {}, getItem(k) { return this.bag[k] == null ? null : this.bag[k]; }, setItem(k, v) { this.bag[k] = String(v); } }
};
guardBox.globalThis = guardBox;
guardBox.window = guardBox;
vm.runInNewContext(read("assets/js/apply-guard.js"), guardBox, { filename: "apply-guard.js" });
const Applied = guardBox.SSDNSApplied;
check(Applied.nameMode() === "character", "name toggle defaults to Character");
const swapped = Applied.rewriteSpeaker("Wade · Peacemaker → Outlaw: 14+4 = 18 → HIT", { characterName: "Wade", playerName: "Jessey" });
check(swapped.startsWith("Wade · Peacemaker"), "character mode keeps the character on a weapon line: " + swapped);
Applied.setNameMode("player");
const asPlayer = Applied.rewriteSpeaker("Wade · Peacemaker → Outlaw: 14+4 = 18 → HIT", { characterName: "Wade", playerName: "Jessey" });
check(asPlayer.startsWith("Jessey · Peacemaker"), "player mode swaps the leading name on a weapon line: " + asPlayer);
const dmLine = Applied.rewriteSpeaker("DM: Hold", { who: "DM", characterName: "DM", playerName: "Host" });
check(dmLine === "DM: Hold", "DM lines stay neutral");
const systemLine = Applied.rewriteSpeaker("System: combat ended", { characterName: "System", playerName: "Host" });
check(systemLine === "System: combat ended", "system lines stay neutral");
Applied.setNameMode("character");
check(Applied.nameMode() === "character", "character mode can be restored");

const plain = Applied.attackPublicLine({ who: "Wade", target: "Outlaw", nat: 14, total: 18, ac: 13 });
check(plain.indexOf("Peacemaker") < 0 && plain.startsWith("Wade → Outlaw"), "attack lines without a weapon stay unchanged: " + plain);
const armed = Applied.attackPublicLine({ who: "Wade", target: "Outlaw", nat: 14, total: 18, ac: 13, weapon: "Peacemaker +5" });
check(armed.includes("Wade · Peacemaker → Outlaw"), "a named weapon is on the attack line: " + armed);
const spelled = Applied.attackBreakdown({ who: "Bandit", target: "Wade", nat: 8, total: 11, ac: 14, spell: "Fire Bolt", miss: true });
check(spelled.publicText.startsWith("Bandit · Fire Bolt → Wade"), "an enemy spell names the spell: " + spelled.publicText.split("\n")[0]);
const both = Applied.attackTool({ weapon: "Navy revolver", spell: "Hex" });
check(both === "Navy revolver · Hex", "gun and spell both stay on the line: " + both);

guardBox.SSDNSTokenColors = { wade: "#1a4d8c", jolene: "#c45b4a" };
const chip = Applied.whoHtml("Wade");
check(chip.includes('class="token-chip"') && chip.includes('class="ssm-who"') && chip.includes("#1a4d8c"), "PC names get a token-color chip: " + chip);
check(!Applied.whoHtml("DM").includes("token-chip") && !Applied.whoHtml("System").includes("token-chip"), "DM and system names stay uncolored");
const hiddenFaction = Applied.publicEnemy({ kind: "enemy", name: "Outlaw", faction: "Law", reveal: { name: false } }, 0, []);
check(!hiddenFaction.faction, "a hidden enemy does not publish a faction");
const shownFaction = Applied.publicEnemy({ kind: "enemy", name: "Outlaw", faction: "Law", reveal: { name: true } }, 0, ["Prone"]);
check(shownFaction.faction === "Law" && shownFaction.conditions.indexOf("Prone") >= 0, "a revealed enemy keeps faction and conditions");
const noFaction = Applied.publicEnemy({ kind: "player", name: "Wade" }, 0, []);
check(!noFaction.faction, "missing faction data adds no chip");

const map = JSON.parse(read("assets/sfx/sfx.json"));
const pools = map.pools || {};
check(Array.isArray(pools.ricochet) && pools.ricochet.length === 5, "ricochet pool has the primary + 4 alts (0.3.56)");
check(map.outcomes.categories.gun.miss === "ricochet", "a gun miss cues ricochet");
check(map.outcomes.categories.arrow.miss === "miss-arrow" && map.outcomes.categories.melee.miss === "miss-melee", "arrow and melee misses have sounds (0.3.56)");
Object.keys(map.events).forEach((cue) => {
  const pool = pools[cue];
  check(Array.isArray(pool) && pool.length >= 1 && pool.length <= 5, cue + " pool is 1 to 5 files");
  check(pool && pool[0] === map.events[cue] && pool.every((file) => fs.existsSync(path.join(root, "assets/sfx", file))), cue + " pool starts with the primary and every file exists");
});

const made = [];
const sfxBox = {
  window: {}, console, Math, Date, JSON, parseInt, isFinite, Number, String, Object, Array,
  URL, URLSearchParams, Promise, setTimeout,
  localStorage: { getItem: () => null, setItem: () => {} },
  document: { readyState: "complete", addEventListener() {}, querySelectorAll: () => [], getElementById: () => null, body: null },
  location: { pathname: "/", search: "" },
  fetch: (url) => Promise.resolve({ ok: true, json: () => Promise.resolve(JSON.parse(read("assets/sfx/sfx.json"))) }),
  Audio: function Audio(url) {
    this.url = url;
    this.playbackRate = 1;
    this.volume = 1;
    this.play = () => Promise.resolve();
    this.addEventListener = () => {};
    made.push(this);
  },
  CustomEvent: function CustomEvent(type, init) { this.type = type; this.detail = init && init.detail; }
};
sfxBox.globalThis = sfxBox;
sfxBox.window = sfxBox;
sfxBox.window.dispatchEvent = () => {};
vm.runInNewContext(read("assets/js/sfx.js"), sfxBox, { filename: "assets/js/sfx.js" });
await new Promise((resolve) => setTimeout(resolve, 40));
const audio = sfxBox.SSDNSAudio;
check(audio.outcomeCue({ gun: true, name: "Navy revolver" }, "miss") === "ricochet", "gun miss resolves to ricochet");
check(audio.outcomeCue({ id: "shortbow", name: "Shortbow", group: "bow" }, "miss") === "miss-arrow", "shortbow miss plays the arrow miss");
check(audio.poolFiles("ricochet").length === 5, "loaded ricochet pool has 5 files");
const before = made.length;
audio.play("ricochet");
await new Promise((resolve) => setTimeout(resolve, 950)); /* results wait ~750 ms (0.3.80) */
check(made.length === before + 1, "a ricochet plays one file");

audio.resetVariants();
const files = ["a.mp3", "b.mp3", "c.mp3", "d.mp3"];
let last = "";
let repeats = 0;
for (let i = 0; i < 20; i++) {
  const pick = audio.pickVariant("gunshot", files, () => (i % 7) / 7);
  if (pick === last) repeats += 1;
  last = pick;
}
check(repeats === 0, "variant picks do not repeat the last slot");

sfxBox.Math.random = () => 0.5;
const swing = audio.playbackJitter();
check(Math.abs(swing.playbackRate - 1) < 0.001 && Math.abs(swing.gain - 1) < 0.001, "a mid roll lands inside the pitch and volume window");
if (audio.resetQueue) audio.resetQueue();
const n0 = made.length;
audio.play("attack");
const heard = made[made.length - 1];
check(made.length === n0 + 1 && heard && heard.url.endsWith("rifle.mp3"), "attack plays the approved rifle shot");
check(heard && heard.playbackRate >= 0.97 && heard.playbackRate <= 1.03, "pitch jitter stays small: " + (heard && heard.playbackRate));
check(heard && heard.volume >= 0.8 * 0.92 - 0.001 && heard.volume <= 0.8 * 1.08 + 0.001, "volume jitter stays small: " + (heard && heard.volume));
const jamBefore = made.length;
audio.play("jam");
const jam = made[made.length - 1];
check(made.length === jamBefore + 1 && jam && jam.volume <= 0.45 * 1.08 + 0.001, "jam stays capped under the jitter");

if (failures.length) {
  console.error(failures.join("\n"));
  console.error(failures.length + " failed");
  process.exit(1);
}
console.log("phone init chat sfx ok");

/**
 * Spell log dice show the faces that were rolled (sheet 0.3.313 / DMCC 0.2.326).
 *   node tools/test-spell-faces-03268.mjs
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
function check(id, cond, detail) {
  if (!cond) failures.push(id + (detail ? " — " + detail : ""));
  console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + detail : ""));
}
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }

const ver = JSON.parse(read("version.json"));
check("ver", ver.sheet === "0.3.313" && ver.dmcc === "0.2.326" && ver.sheetBuild === "sheet-playtest-v03313" && ver.dmccBuild === "dmcc-playtest-v02326");
check("rules.clean", !read("assets/data/rules.js").includes("0.3.313") && !read("database.rules.json").includes("0.3.313"));

let seed = 11;
function rng() {
  seed = (seed * 16807) % 2147483647;
  return (seed % 997) / 997;
}
const context = { console, Date, JSON, parseInt, isFinite, Number, String, Object, Array, Promise, RegExp };
context.Math = Object.assign(Object.create(Math), { random: rng });
context.window = context;
context.globalThis = context;
vm.createContext(context);
["assets/data/rules.js", "assets/data/spell-cast-admit.js", "assets/js/spell-area.js", "assets/js/spell-zones.js", "assets/js/spell-riders.js", "assets/js/spell-cast.js", "assets/js/dice-art.js"].forEach((rel) => {
  vm.runInContext(read(rel), context, { filename: rel });
});
const Cast = context.SSDNSSpellCast;
const Dice = context.SSDNSDice;

function facesIn(html) {
  return (String(html).match(/<text[^>]*>([^<]*)<\/text>/g) || []).map((s) => Number(s.replace(/<[^>]+>/g, "")));
}
function blanks(html) {
  const icons = (String(html).match(/class="die-face/g) || []).length;
  const nums = (String(html).match(/<text[^>]*>([^<]+)<\/text>/g) || []).length;
  return icons - nums;
}
function paint(entry, text) {
  return Dice.lead(entry, text || entry.text || "");
}

function roll(name, slot) {
  return Cast.rollCast({ spellName: name, slotLevel: slot, characterLevel: 5, attackBonus: 5, spellMod: 3, dc: 13 });
}

const hands = roll("Burning Hands", 3);
const handFaces = (hands.dice || []).map((d) => d.face);
const handHtml = paint({ formula: hands.formula, text: hands.text, detail: hands.detail, dice: hands.dice, rolls: hands.rolls, faces: hands.faces, label: hands.label, result: hands.result }, hands.text);
check("hands.rolled", handFaces.length === 5 && handFaces.every((n) => n >= 1 && n <= 6), handFaces.join(","));
check("hands.sum", handFaces.reduce((a, b) => a + b, 0) === Number(String(hands.text).match(/= (-?\d+)/)[1]), hands.text);
check("hands.visible", blanks(handHtml) === 0 && facesIn(handHtml).join(",") === handFaces.join(","), facesIn(handHtml).join(",") + " vs " + handFaces.join(","));

const ball = roll("Fireball", 3);
const ballFaces = (ball.dice || []).map((d) => d.face);
const ballHtml = paint({ formula: ball.formula, detail: ball.text, dice: ball.dice, rolls: ball.rolls }, ball.text);
check("fireball.faces", ballFaces.length === 8 && blanks(ballHtml) === 0 && facesIn(ballHtml).join(",") === ballFaces.join(","), ball.text);

const cure = roll("Cure Wounds", 3);
const cureFaces = (cure.dice || []).map((d) => d.face);
const cureHtml = paint({ formula: cure.formula, detail: cure.text, dice: cure.dice, heal: true }, cure.text);
check("heal.faces", cureFaces.length >= 1 && blanks(cureHtml) === 0 && facesIn(cureHtml).join(",") === cureFaces.join(","), cure.text);

const missile = roll("Magic Missile", 3);
const missileFaces = (missile.dice || []).map((d) => d.face);
const missileHtml = paint({ formula: missile.formula, detail: missile.text, dice: missile.dice }, missile.text);
check("missile.faces", missileFaces.length === 5 && missileFaces.every((n) => n >= 1 && n <= 4) && blanks(missileHtml) === 0 && facesIn(missileHtml).join(",") === missileFaces.join(","), missile.text);

const bolt = roll("Guiding Bolt", 1);
const boltFaces = (bolt.dice || []).map((d) => d.face);
const boltHtml = paint({ formula: bolt.formula, detail: bolt.text, dice: bolt.dice, attack: true, nat: bolt.nat }, bolt.text);
check("attack.damageFaces", boltFaces.length >= 4 && blanks(boltHtml) === 0 && boltFaces.every((n) => facesIn(boltHtml).indexOf(n) >= 0), bolt.text);

const sphere = roll("Flaming Sphere", 2);
const sphereHtml = paint({ formula: sphere.formula, text: sphere.text, detail: sphere.text, plain: true }, sphere.text);
check("sphere.noDie", sphere.zoneHold === true && sphere.formula === "" && !(sphere.dice || []).length && sphereHtml.indexOf("die-face") < 0, sphere.text);

const phant = roll("Phantasmal Killer", 4);
const phantHtml = paint({ formula: phant.formula, text: phant.text, detail: phant.text }, phant.text);
check("phant.noBlank", /no damage now/.test(phant.text) && phantHtml.indexOf("die-face") < 0 && !/\d+d\d+/.test(phant.text), phant.formula + " " + phant.text);

const hex = roll("Hex", 1);
const hexHtml = paint({ formula: hex.formula, text: hex.text, detail: hex.text }, hex.text);
check("hex.later", hexHtml.indexOf("die-face") < 0, hex.text);

const shared = paint({ text: hands.text }, hands.text);
check("shared.textOnly", blanks(shared) === 0 && facesIn(shared).join(",") === handFaces.join(","), shared.slice(0, 120));

/* Bounded stand-ins for the two clients. Both call the same log painter the
   sheet and DMCC use. This is not a live Firebase room. */
function feedOf(rolled) {
  return {
    id: "sim",
    kind: "roll",
    text: rolled.text,
    formula: rolled.plain || rolled.zoneHold ? "" : (rolled.formula || ""),
    detail: rolled.detail || rolled.text || "",
    dice: Array.isArray(rolled.dice) ? rolled.dice : null,
    rolls: Array.isArray(rolled.rolls) ? rolled.rolls : null,
    faces: Array.isArray(rolled.faces) ? rolled.faces : null,
    plain: !!rolled.plain
  };
}
function bothPaint(rolled) {
  const row = feedOf(rolled);
  return {
    player: Dice.lead(row, row.text),
    dm: Dice.lead(row, row.detail || row.text)
  };
}
const bothHands = bothPaint(hands);
check("both.hands", blanks(bothHands.player) === 0 && blanks(bothHands.dm) === 0 && facesIn(bothHands.player).join(",") === handFaces.join(",") && facesIn(bothHands.dm).join(",") === handFaces.join(","));
const bothHeld = bothPaint(sphere);
check("both.noInvent", bothHeld.player.indexOf("die-face") < 0 && bothHeld.dm.indexOf("die-face") < 0 && !(sphere.dice || []).length);
const bothLater = bothPaint(phant);
check("both.later", bothLater.player.indexOf("die-face") < 0 && bothLater.dm.indexOf("die-face") < 0);

let catalog = 0;
let catalogBad = 0;
(context.SSDNS_RULES.spellCast || []).forEach((row) => {
  if (!row || !row.name) return;
  catalog++;
  const rolled = roll(row.name, Math.max(row.level || 0, 1));
  if (!rolled) return;
  const html = paint({ formula: rolled.formula, text: rolled.text, detail: rolled.detail || rolled.text, dice: rolled.dice, rolls: rolled.rolls, faces: rolled.faces, plain: rolled.plain }, rolled.text);
  if (blanks(html) > 0) catalogBad++;
  if (rolled.dice && rolled.dice.length && /«/.test(rolled.text || "") && facesIn(html).length < rolled.dice.length) catalogBad++;
});
check("catalog.clean", catalog > 80 && catalogBad === 0, catalog + " spells, " + catalogBad + " bad");

const css = read("assets/css/dice.css");
check("css.numeral", /\.die-face \.die-num \{[^}]*position:\s*absolute/.test(css) && !/\.die-num[^}]*font-size:\s*0/.test(css) && !/\.die-inline[^}]*display:\s*none/.test(css));

const dom = new JSDOM("<!doctype html><html><head><style>" + css + "</style></head><body><div id='log'></div></body></html>", { pretendToBeVisual: true });
const log = dom.window.document.getElementById("log");
log.innerHTML = handHtml;
const texts = Array.from(log.querySelectorAll("svg text")).map((n) => n.textContent);
check("dom.numbers", texts.join(",") === handFaces.join(",") && texts.every((t) => t !== ""), texts.join(","));
const face = log.querySelector(".die-face");
const num = log.querySelector(".die-num");
check("dom.overlay", !!face && !!num && num.parentElement === face);

if (failures.length) {
  console.log(failures.length + " failed");
  process.exit(1);
}
console.log("spell faces ok");

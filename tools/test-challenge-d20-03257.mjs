/**
 * Challenge waits on Art's blank d20. Clicking that die rolls.
 * Fancy blank→number and crit/FAIL stay on that gold path only.
 * A sheet d20 still uses the normal spin. No new sound.
 * Sheet 0.3.309 / DMCC 0.2.322.
 *   node tools/test-challenge-d20-03257.mjs
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
check("ver", ver.sheet === "0.3.309" && ver.dmcc === "0.2.322" && ver.sheetBuild === "sheet-playtest-v03309" && ver.dmccBuild === "dmcc-playtest-v02322");
check("rules.clean", !read("assets/data/rules.js").includes("0.3.309") && !read("database.rules.json").includes("0.3.309"));
check("bestiary.kept", read("dm/assets/js/v2.js").includes("bestiary.json?v=0.2.249-spell-tokens"));

const join = read("assets/js/dm-join.js");
check("src.die", join.includes("data-challenge-die") && join.includes('Dice.faceHtml(20, "", 168)') && !join.includes("ROLL 1d20"));
check("src.fancy", join.includes("fancy: true, challenge: true"));
check("src.nosfx", !/d20-roll-fire|d20-slam|new Audio/.test(join.slice(join.indexOf("function openChallenge"), join.indexOf("function handleCommand"))));
check("zoom.untouched-pool", read("assets/js/d20-zoom.js").includes('["roll", "c1", "c2", "c3"]') && read("assets/js/d20-plain.js").includes("normalFrame"));

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/index.html", pretendToBeVisual: true, runScripts: "dangerously" });
const w = dom.window;
w.localStorage.setItem("ssdns.map.fx", "0");
w.SSDNSApp = {
  compute: function () { return { skills: { Perception: 5 }, mods: { WIS: 2 } }; },
  doc: function () { return { character: { name: "Buddy Ki" } }; }
};
w.SSDNSSheet = { addLog: function () {} };
w.SSDNSTestRoll = function () { return 14; };
const ctx = dom.getInternalVMContext();
vm.runInContext(read("assets/js/dice-art.js"), ctx);
vm.runInContext(read("assets/js/challenge-sfx.js"), ctx);
vm.runInContext(read("assets/js/d20-plain.js"), ctx);
vm.runInContext(read("assets/js/d20-zoom.js"), ctx);
vm.runInContext(read("assets/js/dm-join.js"), ctx);
if (w.document.readyState === "loading") w.document.dispatchEvent(new w.Event("DOMContentLoaded"));

const Join = w.SSDNSDmJoin;
const Z = w.SSDNSD20Zoom;
const P = w.SSDNSPlainRoll;

function ask(nat, id) {
  w.SSDNSTestRoll = function () { return nat; };
  Join._handle({
    type: "challenge",
    payload: { id: id, label: "Perception", skill: "Perception", ability: "WIS", abilityName: "Wisdom", dc: 15 }
  });
  return w.document.getElementById("ssdns-challenge");
}

const card = ask(14, "c14");
check("card.waits", !!card);
check("card.noRollButton", !card.querySelector("button.roll") && !/ROLL 1d20/.test(card.textContent));
const die = card.querySelector("[data-challenge-die]");
const face = die && die.querySelector(".die-face");
check("card.blankDie", !!die && die.tagName === "BUTTON" && !!face && /d20\.webp/.test(face.innerHTML) && !face.querySelector("text") && !face.querySelector(".die-num"));
check("card.checks", card.querySelectorAll("button.opt").length === 3 && /Perception/.test(card.textContent) && /Straight d20/.test(card.textContent));

const shown = [];
const realPresent = Z.present.bind(Z);
Z.present = function (ev) { shown.push(ev); return Promise.resolve(); };
die.click();
check("click.closes", !w.document.getElementById("ssdns-challenge"));
const mid = shown[0];
check("click.fancy", shown.length === 1 && mid && mid.fancy === true && mid.kind === "plain" && mid.nat === 14 && mid.motion === "fast" && mid.D === 1.05);
const spinning = P.fastFrame(0.4, { value: mid.value, D: mid.D, dir: 1 });
const landed = P.fastFrame(1.5, { value: mid.value, D: mid.D, dir: 1 });
check("click.blankThenNumber", spinning.text === "" && spinning.showNum === false && landed.showNum && landed.text === "14");

ask(20, "c20");
w.document.querySelector("[data-challenge-die]").click();
const crit = shown[1];
check("click.crit", crit && crit.fancy === true && crit.kind === "crit" && crit.nat === 20 && crit.D >= 2.1 && crit.D <= 3.15);
const held = P.fastFrame(crit.D + 0.2, { value: 20, D: crit.D, dir: 1, suspense: true });
check("click.critStaysBlank", held.text === "" && held.showNum === false && held.suspense === true);

ask(1, "c1");
w.document.querySelector("[data-challenge-die]").click();
const fail = shown[2];
check("click.fail", fail && fail.fancy === true && fail.kind === "fumble" && fail.nat === 1 && fail.D >= 2.1 && fail.D <= 3.15);

Z.present = realPresent;
const spins = [];
const realPlain = P.play.bind(P);
P.play = function (spec) { spins.push(spec); return Promise.resolve(); };
await Z.play({ nat: 12, id: "sheet-d20" });
P.play = realPlain;
const spin = spins[0] || {};
check("sheet.normal", spins.length === 1 && spin.motion === "spin" && spin.fancy === false && spin.challenge === false && spin.suspense === false && spin.kind === "plain" && spin.nat === 12, JSON.stringify(spin));
check("sheet.noPack", Z.pack({ nat: 20, id: "sheet-crit" }) == null && Z.pack({ nat: 20, id: crit.id }) && Z.pack({ nat: 20, id: crit.id }).fancy === true);

const ordinary = P.normalFrame(0.3, { value: 12, D: 0.9, dir: 1 });
check("sheet.numberWhileSpinning", ordinary.showNum && ordinary.text !== "" && ordinary.normal === true);

const sfxMap = JSON.parse(read("assets/sfx/sfx.json"));
check("sfx.files", fs.existsSync(path.join(root, "assets/sfx/challenge-nat20-crit.wav")) && fs.existsSync(path.join(root, "assets/sfx/challenge-fail.wav")));
check("sfx.map", sfxMap.events["challenge-nat20-crit"] === "challenge-nat20-crit.wav" && sfxMap.events["challenge-fail"] === "challenge-fail.wav");
check("sfx.cache", read("assets/js/sfx.js").includes("sfx.json?v=0.3.309"));
check("sfx.plainQuiet", !read("assets/js/d20-plain.js").includes("challenge-nat20-crit") && !read("assets/js/d20-plain.js").includes("challenge-fail"));
check("sfx.keys", Z.challengeSting(true) === "challenge-nat20-crit" && Z.challengeSting(false) === "challenge-fail");

const heard = [];
w.SSDNSAudio = {
  hasFile: function (name) { return name === "challenge-nat20-crit" || name === "challenge-fail"; },
  play: function (name) { heard.push(name); },
  playNow: function (name) { heard.push(name); }
};
async function dismissHeld(ev) {
  const p = Z.play(ev);
  await new Promise((r) => setTimeout(r, 40));
  const layer = w.document.querySelector(".d20-zoom, .d20-plain");
  if (layer) layer.click();
  await p;
}
function packPlayed(file) {
  return w.SSDNSChallengeSfx.trace().some((row) => row.kind === "play" && String(row.file).indexOf(file) >= 0);
}
await dismissHeld({ nat: 20, fancy: true, challenge: true, id: "sfx20" });
check("sfx.crit", heard.length === 0 && packPlayed("challenge-nat20-crit.wav"), heard.join(","));
heard.length = 0;
w.SSDNSChallengeSfx.resetTrace();
await dismissHeld({ nat: 1, fancy: true, challenge: true, id: "sfx1" });
check("sfx.fail", heard.length === 0 && packPlayed("challenge-fail.wav"), heard.join(","));
heard.length = 0;
w.SSDNSChallengeSfx.resetTrace();
await dismissHeld({ nat: 14, fancy: true, challenge: true, id: "sfx14" });
check("sfx.mid", heard.length === 0 && packPlayed("roll-d20.mp3") && !packPlayed("challenge-nat20-crit.wav"), JSON.stringify(w.SSDNSChallengeSfx.trace().map((r) => r.kind + " " + (r.file || ""))));
heard.length = 0;
await Z.play({ nat: 8, id: "sfx-plain" });
check("sfx.other", heard.length === 0, heard.join(","));

if (failures.length) {
  console.log(failures.length + " failed");
  process.exit(1);
}
console.log("challenge d20 ok");
process.exit(0);

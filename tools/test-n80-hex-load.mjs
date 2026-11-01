/**
 * N80 — a Hexslinger chamber stores the spell that was picked.
 * Cantrips refuse + Hex shell and do not write a nameless k:hex token.
 * Sheet 0.3.191 / DMCC 0.2.204. rules.js stays untouched.
 *   node tools/test-n80-hex-load.mjs
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

const version = JSON.parse(read("version.json"));
check("ver.sheet", version.sheet === "0.3.191" && version.sheetBuild === "sheet-playtest-v03191");
check("ver.dmcc", version.dmcc === "0.2.204" && version.dmccBuild === "dmcc-playtest-v02204");
check("ver.rules", !read("assets/data/rules.js").includes("0.3.191") && !read("assets/data/rules.js").includes("0.2.204") && !read("database.rules.json").includes("0.3.191"));

const html = read("index.html").replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
const dom = new JSDOM(html, { url: "http://127.0.0.1:8765/index.html", pretendToBeVisual: true, runScripts: "dangerously" });
const window = dom.window;
window.matchMedia = function () { return { matches: false, addEventListener() {}, removeEventListener() {} }; };
const realSetTimeout = window.setTimeout.bind(window);
const realClearTimeout = window.clearTimeout.bind(window);
const clock = [];
window.setTimeout = function (fn, ms, ...args) {
  const rec = { fn: fn, ms: Number(ms) || 0, args: args, done: false, id: 0 };
  rec.id = realSetTimeout(function () {
    if (rec.done) return;
    rec.done = true;
    fn.apply(window, args);
  }, rec.ms);
  clock.push(rec);
  return rec.id;
};
window.clearTimeout = function (id) {
  clock.forEach(function (rec) { if (rec.id === id) rec.done = true; });
  return realClearTimeout(id);
};
function flushLongTimers() {
  clock.slice().forEach(function (rec) {
    if (rec.done || rec.ms < 1000) return;
    rec.done = true;
    realClearTimeout(rec.id);
    rec.fn.apply(window, rec.args);
  });
}
function drainToasts() {
  for (let n = 0; n < 8; n++) {
    const t = window.document.querySelector("#toast");
    if (!t || t.hidden) return;
    flushLongTimers();
  }
}
function run(rel) {
  vm.runInContext(read(rel), dom.getInternalVMContext(), { filename: rel });
}
run("assets/data/rules.js");
run("assets/js/spell-cast.js");
run("assets/js/ssdns-bridge.js");
run("assets/js/storage.js");
run("assets/js/misfire.js");
run("assets/js/ammo-display.js");
run("assets/js/app.js");
run("assets/js/sheet-extras.js");
if (window.document.readyState === "loading") {
  window.document.dispatchEvent(new window.Event("DOMContentLoaded", { bubbles: true }));
}

const app = window.SSDNSApp;
const c = app.doc().character;
const g = c.guns[0];
c.calling = "hexslinger";
c.level = 9;
c.overrides["hex.1"] = 4;
c.overrides["hex.2"] = 2;
c.overrides["hex.4"] = 2;
c.cantrips = ["Fire Bolt"];
c.spells[1] = [{ name: "Magic Missile", prepared: true }, { name: "Burning Hands", prepared: true }];
c.spells[2] = [{ name: "Scorching Ray", prepared: true }, { name: "Shatter", prepared: true }];
c.spells[4] = [{ name: "Wall of Fire", prepared: true }];
g.weapon = "blacksnake";
g.equipped = true;
g.tier = "medium";
g.chamber = "medium|.357";

function resetGun() {
  g.loaded = 0;
  g.chambers = ["", "", "", "", "", ""];
  g.castSpell = "";
  g.castSlot = "";
  for (let lv = 1; lv <= 9; lv++) {
    if (Array.isArray(c.hexLead[lv])) c.hexLead[lv] = c.hexLead[lv].map(() => false);
  }
  app.refreshGunFace();
}
function spellOf(token) {
  const p = app.parseChamber(token);
  return p && p.kind === "hex" ? p : null;
}
function loadedSpell() {
  const hit = (g.chambers || []).map(spellOf).find((p) => p && p.spell);
  return hit || null;
}
function choose(value, hexLevel) {
  const sel = window.document.querySelector('[data-castspell="0"]');
  const hex = window.document.querySelector('[data-hexlvl="0"]');
  check("choose." + value, !!(sel && [...sel.options].some((op) => op.value === value)), sel && [...sel.options].map((op) => op.value).join("|"));
  if (sel) sel.value = value;
  if (hex && hexLevel) hex.value = String(hexLevel);
  sel.dispatchEvent(new window.Event("change", { bubbles: true }));
}
function clickLoad() {
  window.document.querySelector('[data-hexload="0"]').click();
}

resetGun();
choose("4:Wall of Fire", 1);
clickLoad();
let wall = loadedSpell();
check("load.wall", !!(wall && wall.spell === "Wall of Fire" && String(wall.level) === "4" && String(wall.spellLevel) === "4"), JSON.stringify(g.chambers));
check("load.wallNotMissile", !(g.chambers || []).some((st) => /Magic Missile/i.test(String(st || ""))));
const nameLine = window.document.querySelector('[data-hexnames="0"]');
check("load.wallShown", !!(nameLine && /Wall of Fire/.test(nameLine.textContent) && !nameLine.hidden), nameLine && nameLine.textContent);

resetGun();
choose("1:Burning Hands", 1);
clickLoad();
let burn = loadedSpell();
check("load.burning", !!(burn && burn.spell === "Burning Hands" && String(burn.level) === "1"), JSON.stringify(g.chambers));
check("load.burningNotMissile", burn && burn.spell !== "Magic Missile");

resetGun();
choose("2:Shatter", 2);
clickLoad();
let shatter = loadedSpell();
check("load.shatter", !!(shatter && shatter.spell === "Shatter" && String(shatter.level) === "2"), JSON.stringify(g.chambers));
check("load.shatterNotRay", shatter && shatter.spell !== "Scorching Ray");

resetGun();
choose("1:Magic Missile", 1);
clickLoad();
check("load.missileOnPurpose", loadedSpell() && loadedSpell().spell === "Magic Missile");

resetGun();
app.loadHexAt(0, 1, "4:Wall of Fire");
wall = loadedSpell();
check("load.atWall", !!(wall && wall.spell === "Wall of Fire" && String(wall.level) === "4"), JSON.stringify(g.chambers));
app.loadHexAt(0, 1, "1:Burning Hands");
const both = (g.chambers || []).map(spellOf).filter((p) => p && p.spell).map((p) => p.spell);
check("load.both", both.indexOf("Wall of Fire") >= 0 && both.indexOf("Burning Hands") >= 0 && both.filter((n) => n === "Magic Missile").length === 0, both.join(", "));

resetGun();
g.chambers = [
  "k:hex:1:spent:1:" + encodeURIComponent("Burning Hands"),
  "k:hex:1:spent:1:" + encodeURIComponent("Magic Missile"),
  "", "", "", ""
];
g.loaded = 2;
const miss = app.spendHexChamber(0, 1, "Magic Missile");
check("spend.notFirst", miss && miss.ok === false && /Burning Hands|hammer|cylinder/i.test(miss.reason || ""), JSON.stringify(miss));
check("spend.untouched", String(g.chambers[0]).includes("Burning%20Hands") && String(g.chambers[1]).includes("Magic%20Missile"), JSON.stringify(g.chambers));
g.chambers = [
  "k:hex:1:spent:1:" + encodeURIComponent("Burning Hands"),
  "k:hex:1:spent:1:" + encodeURIComponent("Magic Missile"),
  "", "", "", ""
];
const hit = app.spendHexChamber(0, 1, "Burning Hands");
const leftNames = (g.chambers || []).map(spellOf).filter((p) => p && p.spell).map((p) => p.spell);
check("spend.exact", !!(hit && hit.ok) && leftNames.indexOf("Burning Hands") < 0 && leftNames.indexOf("Magic Missile") >= 0, JSON.stringify({ hit, leftNames, chambers: g.chambers }));

resetGun();
g.chambers = ["k:hex:1:spent", "", "", "", "", ""];
g.loaded = 1;
const bareNamed = app.spendHexChamber(0, 1, "Magic Missile");
check("spend.legacyNotMissile", bareNamed && bareNamed.ok === false && g.chambers[0] === "k:hex:1:spent", JSON.stringify(bareNamed));
const bareShield = app.spendHexChamber(0, 1, "");
check("spend.shieldLegacy", !!(bareShield && bareShield.ok) && !g.chambers[0], JSON.stringify(bareShield));

resetGun();
check("list.blocked", app.hexListBlock(0, { name: "Wall of Fire", level: 4, slot: 4 }) === "Load Wall of Fire into the cylinder first.");
check("list.cantrip", app.hexListBlock(0, { name: "Fire Bolt", level: 0, slot: 0 }) === "");
check("list.shield", app.hexListBlock(0, { name: "Shield", level: 1, slot: 1 }) === "");
choose("4:Wall of Fire", 4);
clickLoad();
check("list.open", app.hexListBlock(0, { name: "Wall of Fire", level: 4, slot: 4 }) === "");
check("list.other", /cylinder/i.test(app.hexListBlock(0, { name: "Burning Hands", level: 1, slot: 1 }) || ""));

resetGun();
const btn = window.document.createElement("button");
btn.type = "button";
btn.setAttribute("data-spell-cast", "4:Wall of Fire");
window.document.body.appendChild(btn);
btn.click();
const logged = window.SSDNSSheet && window.SSDNSSheet.logRows ? window.SSDNSSheet.logRows() : [];
check("click.refused", logged.some((row) => /Load Wall of Fire into the cylinder first/.test(row.text || "")) && !(g.chambers || []).some(Boolean), JSON.stringify(logged.slice(-3)));
check("click.slotKept", !(c.hexLead[4] || []).some(Boolean));

const sheet = read("assets/js/sheet-extras.js");
check("src.noFirstOption", !sheet.includes('num(String(op.value).split(":")[0], -1) === level'));
check("src.shieldGate", sheet.includes("shieldGate") && read("assets/js/spell-buffs.js").includes("Shield needs a loaded hex shell."));

const CANTRIP_TOAST = "Cantrips don't use hex shells — cast from the spell list or Cast through gun.";
const BARE_TOAST = "That shell has no spell on it. Pick the spell, then load it into the chamber.";
function toastText() {
  const el = window.document.querySelector("#toastText");
  return (el && el.textContent) || "";
}
function hexTokens() {
  return (g.chambers || []).filter((st) => /^k:hex:/.test(String(st || "")));
}
function slotsMarked() {
  return [1, 2, 3, 4].some((lv) => (c.hexLead[lv] || []).some(Boolean));
}
c.cantrips = ["Light", "True Strike", "Fire Bolt"];
app.refreshGunFace();

resetGun();
drainToasts();
choose("0:Light", 1);
clickLoad();
check("cantrip.lightToast", toastText() === CANTRIP_TOAST, toastText());
check("cantrip.lightEmpty", !(g.chambers || []).some(Boolean) && hexTokens().length === 0, JSON.stringify(g.chambers));
check("cantrip.lightSlot", !slotsMarked(), JSON.stringify(c.hexLead && c.hexLead[1]));

resetGun();
drainToasts();
choose("0:True Strike", 1);
app.loadHexAt(0, 1, "0:True Strike");
check("cantrip.strikeToast", toastText() === CANTRIP_TOAST, toastText());
check("cantrip.strikeEmpty", !(g.chambers || []).some(Boolean) && hexTokens().length === 0, JSON.stringify(g.chambers));
check("cantrip.strikeSlot", !slotsMarked());

resetGun();
drainToasts();
app.loadHexShell(0, "0:Light", 1);
check("cantrip.shellApi", toastText() === CANTRIP_TOAST && hexTokens().length === 0, JSON.stringify(g.chambers) + " · " + toastText());
drainToasts();
app.loadHexAt(0, 4, "0:Light");
check("cantrip.atApi", toastText() === CANTRIP_TOAST && hexTokens().length === 0 && !slotsMarked(), JSON.stringify(g.chambers) + " · " + toastText());

resetGun();
choose("4:Wall of Fire", 4);
clickLoad();
wall = loadedSpell();
check("cantrip.thenWall", !!(wall && wall.spell === "Wall of Fire" && String(wall.level) === "4"), JSON.stringify(g.chambers));

resetGun();
drainToasts();
g.chambers = ["k:hex:1:spent", "", "", "", "", ""];
g.loaded = 1;
app.refreshGunFace();
const bareDot = window.document.querySelector('[data-fire="0"][data-k="0"]');
check("legacy.dot", !!bareDot);
if (bareDot) bareDot.click();
check("legacy.toast", toastText() === BARE_TOAST, toastText());
check("legacy.kept", g.chambers[0] === "k:hex:1:spent", JSON.stringify(g.chambers));
drainToasts();
g.chambers = ["1", "", "", "", "", ""];
g.loaded = 1;
app.refreshGunFace();
const digitDot = window.document.querySelector('[data-fire="0"][data-k="0"]');
if (digitDot) digitDot.click();
check("legacy.digitKept", g.chambers[0] === "1" && toastText() === BARE_TOAST, JSON.stringify(g.chambers) + " · " + toastText());

resetGun();
drainToasts();
choose("0:Light", 1);
const castBtn = window.document.querySelector('[data-cast="0"]');
check("cast.cantripOn", !!(castBtn && !castBtn.disabled && /no slot and no chamber/i.test(castBtn.title || "")), castBtn && castBtn.title);
castBtn.click();
await new Promise((resolve) => setTimeout(resolve, 40));
drainToasts();
choose("0:True Strike", 1);
window.document.querySelector('[data-cast="0"]').click();
await new Promise((resolve) => setTimeout(resolve, 40));
/* True Strike asks who is Guided. Narrative still casts, and it still spends no chamber. */
window.document.querySelectorAll("#spellNarrative").forEach((btn) => btn.click());
await new Promise((resolve) => setTimeout(resolve, 40));
const listBtn = window.document.createElement("button");
listBtn.type = "button";
listBtn.setAttribute("data-spell-cast", "0:Light");
window.document.body.appendChild(listBtn);
listBtn.click();
await new Promise((resolve) => setTimeout(resolve, 40));
const castLog = window.SSDNSSheet && window.SSDNSSheet.logRows ? window.SSDNSSheet.logRows() : [];
check("cast.light", castLog.some((row) => /Light/.test(row.text || "") && /no attack roll/i.test(row.text || "")) && hexTokens().length === 0, JSON.stringify(castLog.slice(-4)));
check("cast.strike", castLog.some((row) => /True Strike/.test(row.text || "") && /no attack roll/i.test(row.text || "")) && !(g.chambers || []).some(Boolean), JSON.stringify(castLog.slice(-4)));
check("cast.notHexToast", toastText() !== CANTRIP_TOAST, toastText());

const appSrc = read("assets/js/app.js");
check("src.cantripMsg", appSrc.includes(CANTRIP_TOAST));
check("src.cantripFlag", appSrc.includes("cantrip: true") && appSrc.includes("if (pick.cantrip)"));

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\nall checks passed");
process.exit(0);

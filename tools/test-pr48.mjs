/**
 * Sheet 0.3.28 / DMCC 0.2.41: attack card, outcome sounds, HP sync, ammo alerts, range.
 *   node tools/test-pr48.mjs
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
function check(id, cond, detail) {
  if (!cond) failures.push(id + (detail ? " — " + detail : ""));
  console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + detail : ""));
}
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }

const context = { console, Date, Math, Number, String, Object, Array, isFinite, JSON };
context.window = context;
context.globalThis = context;
vm.createContext(context);
vm.runInContext(read("assets/js/conditions.js"), context);
vm.runInContext(read("assets/js/apply-guard.js"), context);
vm.runInContext(read("assets/data/rules.js"), context);
vm.runInContext(read("assets/js/spell-cast.js"), context);
vm.runInContext(read("assets/js/range-rings.js"), context);
const A = context.SSDNSApplied;
const C = context.SSDNSConditions;
const R = context.SSDNSRangeRings;

const adv = A.attackBreakdown({
  who: "Steve", target: "Bandit", n1: 8, n2: 17, nat: 17,
  parts: [
    { label: "DEX", value: 3 },
    { label: "proficiency", value: 2 },
    { label: "Pistolero", value: 1 }
  ],
  ac: 15,
  revealAc: true,
  damage: { faces: [6, 4], parts: [{ label: "mod", value: 3 }], total: 13, type: "piercing" }
});
check("card.dice", adv.dmText.includes("8") && adv.dmText.includes("«17»"), adv.dmText);
check("card.parts", adv.dmText.includes("DEX +3") && adv.dmText.includes("proficiency +2") && adv.dmText.includes("Pistolero +1"), adv.dmText);
check("card.ac", adv.dmText.includes("vs AC 15") && adv.dmText.includes("→ HIT"), adv.dmText);
check("card.dmg", adv.dmText.includes("6+4") && adv.dmText.includes("+ 3 (mod)") && adv.dmText.includes("= 13 piercing"), adv.dmText);
const hidden = A.attackBreakdown({
  who: "Steve", target: "Bandit", nat: 14, n1: 14, parts: [{ label: "DEX", value: 3 }], ac: 18, revealAc: false
});
check("card.secret", !hidden.publicText.includes("vs AC") && hidden.publicText.includes("→ MISS") && hidden.dmText.includes("vs AC 18"), hidden.publicText);
const crit = A.attackBreakdown({ who: "Boss", target: "Steve", nat: 20, n1: 20, parts: [{ label: "bonus", value: 5 }], ac: 14, revealAc: true, damage: { faces: [8, 8], parts: [{ label: "mod", value: 4 }], total: 20, type: "piercing" } });
check("card.crit", crit.verdict === "CRIT" && crit.dmText.includes("→ CRIT"), crit.dmText);
const misfire = A.attackBreakdown({ who: "Steve", target: "Bandit", nat: 1, n1: 1, parts: [{ label: "DEX", value: 4 }], ac: 10, misfire: true, revealAc: true });
check("card.misfire", misfire.verdict === "misfire" && misfire.miss, misfire.dmText);

check("mode.cancel", C.attackMode([], "adv", "DIS: long range (45 ft)") === "", C.attackMode([], "adv", "DIS: long range (45 ft)"));
check("mode.range", C.attackMode([], "", "DIS: long range (45 ft)") === "dis");
check("mode.both", C.attackMode([{ name: "Poisoned" }, { name: "Invisible" }], "", "range") === "");

const row = { hp: 12, status: "" };
A.markHpExpect(row, 8, 1000, 30000);
check("hp.stale", A.acceptPlayerHp(row, 12, 2000) === false && row.hp === 8, JSON.stringify(row));
let flipped = false;
for (let t = 0; t < 30; t++) {
  A.acceptPlayerHp(row, t % 2 ? 12 : 8, 2000 + t * 800);
  if (row.hp !== 8 || row.status === "Down") flipped = true;
}
check("hp.stable30", !flipped && row.hp === 8 && row.hpExpect, JSON.stringify(row));
check("hp.confirm", A.acceptPlayerHp(row, 8, 2500) === false && row.hp === 8);
A.markHpExpect(row, 0, 40000, 8000);
check("hp.down", A.syncDownStatus(row) === "Down" && row.status === "Down");
check("hp.downAgain", A.syncDownStatus(row) === "");
A.markHpExpect(row, 6, 50000, 8000);
check("hp.heal", A.syncDownStatus(row) === "" && row.status === "");
const gunsA = [{ weapon: "navy", loaded: 1, chambers: ["round", ""] }];
const gunsB = [{ weapon: "navy", loaded: 2, chambers: ["round", "round"] }];
check("guns.sig", A.gunsSignature(gunsA) !== A.gunsSignature(gunsB));
check("spare.navy", A.spareCount({ name: "Navy/Army Ball n Cap Revolver", caliber: "Navy" }, [{ caliber: "Navy", count: 0 }]) === 0);
check("spare.some", A.spareCount({ name: "Dullards Tube Rifle", caliber: ".44" }, [{ caliber: ".44", count: 6 }]) === 6);
check("ammo.fail", A.ammoFailText("Steve", { name: "Navy/Army Ball n Cap Revolver" }) === "Steve: no Navy rounds left to reload");
check("ammo.fail.plain", A.ammoFailText("Ada", { name: "Repeater", caliber: "" }) === "Ada: no rounds left to reload");
check("ammo.fail.word", A.ammoFailText("Ada", { caliber: "rounds" }) === "Ada: no rounds left to reload");
check("ammo.empty", A.emptyShotText("Steve", { name: "Navy revolver" }).includes("empty, reload first"));

const long = R.resolve({ weapon: "dulls-rolling-block-rifle", tier: "medium" }, 100, { hasTarget: true, hostileFeet: 40 });
check("range.long", long.disadvantage && long.button === "DIS · long range" && !long.blocked);
const mapSrc = read("map/ssdns-map.js");
check("row.reload", mapSrc.includes('data-act="rowReload"') && mapSrc.includes("data-wid"));
check("spare.label", mapSrc.includes("Reload"));
check("range.override", mapSrc.includes("Ignore range") && mapSrc.includes("Force DIS") && mapSrc.includes('aria-label="Range: Auto"'));
check("art.aspect", read("assets/css/ammo-display.css").includes("aspect-ratio: 1 / 1"));
check("rules.clean", !read("assets/js/range-rings.js").includes("database.rules") && !read("assets/js/apply-guard.js").includes("database.rules"));

const played = [];
const sandbox = {
  window: {}, console, Math, Date, JSON, parseInt, isFinite, Number, String, Object, Array,
  URL, URLSearchParams, Promise, setTimeout,
  localStorage: { getItem: () => null, setItem: () => {} },
  document: { readyState: "complete", addEventListener() {}, querySelectorAll: () => [], getElementById: () => null, body: null },
  location: { pathname: "/", search: "" },
  fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve(JSON.parse(read("assets/sfx/sfx.json"))) }),
  Audio: function () { played.push("audio"); this.play = () => Promise.resolve(); this.addEventListener = () => {}; },
  CustomEvent: function CustomEvent(type, init) { this.type = type; this.detail = init && init.detail; }
};
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
sandbox.window.dispatchEvent = () => {};
vm.runInNewContext(read("assets/js/sfx.js"), sandbox, { filename: "assets/js/sfx.js" });
await new Promise((resolve) => setTimeout(resolve, 40));
const audio = sandbox.SSDNSAudio;
check("sfx.gun", audio.outcomeCategory({ gun: true, name: "Navy revolver" }) === "gun");
check("sfx.arrow", audio.outcomeCategory({ name: "Throwing spear", properties: "thrown" }) === "arrow");
check("sfx.melee", audio.outcomeCategory({ name: "Bowie knife", dmgType: "Slashing" }) === "melee");
check("sfx.spell", audio.outcomeCategory({ spell: true, name: "Fire Bolt" }) === "spell");
check("sfx.silent", audio.outcomeCue({ name: "Machete" }, "hit") === "sword-hit");
check("sfx.override", audio.outcomeCue({ id: "shortbow", name: "Shortbow", group: "bow" }, "hit") === "hit-arrow");
check("sfx.missFall", audio.outcomeCue({ id: "shortbow", name: "Shortbow", group: "bow" }, "miss") === "miss-arrow");
const before = played.length;
audio.setMuted(true);
audio.playOutcome({ id: "shortbow", name: "Shortbow", group: "bow" }, "hit");
check("sfx.mute", played.length === before);
check("sfx.javelin", audio.outcomeCategory({ name: "Javelin" }) === "arrow");
check("band.hostileRing", /hostileFeet:\s*nearestHostileFeet\(token\)/.test(mapSrc));
check("band.highlight", /function highlightBand\(/.test(mapSrc) && /hot \? 4/.test(mapSrc));

if (failures.length) {
  console.error(failures.length + " failed");
  process.exit(1);
}
console.log("pr48 ok");

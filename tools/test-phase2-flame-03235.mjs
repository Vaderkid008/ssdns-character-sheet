/**
 * Phase 2 tip (sheet 0.3.292 / DMCC 0.2.305).
 * Shocking Grasp touch is 5 ft, including a diagonal neighbour, and does not
 * take ranged-spell disadvantage for being next to the target. 10 ft stays blocked.
 * Sacred Flame paints a column and a failed DEX save reduces token HP.
 *
 *   node tools/test-phase2-flame-03235.mjs
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

const version = JSON.parse(read("version.json"));
check("ver.sheet", version.sheet === "0.3.292" && version.sheetBuild === "sheet-playtest-v03292");
check("ver.dmcc", version.dmcc === "0.2.305" && version.dmccBuild === "dmcc-playtest-v02305");

function extractFunction(src, name) {
  const re = new RegExp("(?:async\\s+)?function\\s+" + name + "\\s*\\(");
  const m = re.exec(src);
  if (!m) throw new Error("missing " + name);
  let i = m.index;
  let depth = 0;
  let started = false;
  let quote = "";
  let escape = false;
  let lineComment = false;
  let blockComment = false;
  for (; i < src.length; i++) {
    const c = src[i];
    const n = src[i + 1];
    if (lineComment) {
      if (c === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (c === "*" && n === "/") { blockComment = false; i++; }
      continue;
    }
    if (quote) {
      if (escape) { escape = false; continue; }
      if (c === "\\") { escape = true; continue; }
      if (c === quote) quote = "";
      continue;
    }
    if (c === "/" && n === "/") { lineComment = true; i++; continue; }
    if (c === "/" && n === "*") { blockComment = true; i++; continue; }
    if (c === "'" || c === '"' || c === "`") { quote = c; continue; }
    if (c === "{") { depth++; started = true; }
    else if (c === "}") {
      depth--;
      if (started && depth === 0) return src.slice(m.index, i + 1);
    }
  }
  throw new Error("unclosed " + name);
}

const context = {
  console, Math, Date, JSON, parseInt, isFinite, Number, String, Object, Array, RegExp, Promise
};
context.window = context;
context.globalThis = context;
vm.createContext(context);
["assets/data/rules.js", "assets/js/spell-fx.js", "assets/js/spell-area.js", "assets/js/spell-riders.js", "assets/js/spell-cast.js", "assets/js/range-rings.js", "assets/js/apply-guard.js", "map/ssdns-map-fx.js"].forEach((rel) => {
  vm.runInContext(read(rel), context, { filename: rel });
});
const mapSrc = read("map/ssdns-map.js");
vm.runInContext(extractFunction(mapSrc, "tokSquares") + "\n" + extractFunction(mapSrc, "axisGap") + "\n" + extractFunction(mapSrc, "feetBetween"), context, { filename: "feet.js" });

const Rings = context.SSDNSRangeRings;
const Cast = context.SSDNSSpellCast;
const FX = context.SSDNSMapFx;
const Area = context.SSDNSSpellArea;

function feet(ax, ay, asz, bx, by, bsz) {
  return context.feetBetween({ pos: { x: ax, y: ay }, size: asz || 1 }, { pos: { x: bx, y: by }, size: bsz || 1 });
}
check("feet.edge", feet(5, 5, 1, 6, 5, 1) === 5);
check("feet.diag", feet(5, 5, 1, 6, 6, 1) === 5, String(feet(5, 5, 1, 6, 6, 1)));
check("feet.gap", feet(5, 5, 1, 7, 5, 1) === 10);
check("feet.large", feet(5, 5, 1, 6, 5, 2) === 5, String(feet(5, 5, 1, 6, 5, 2)));

function spellSpec(name) {
  return { name: name, kind: "spell", spell: true, spellKind: "attack", range: Cast.rangeOf(name) };
}
function verdict(name, dist) {
  return Rings.resolve(spellSpec(name), dist, { hasTarget: true, hostileFeet: dist, override: "auto" });
}
["Shocking Grasp", "Contagion"].forEach((name) => {
  const key = name.toLowerCase().replace(/\s+/g, "");
  const near = verdict(name, 5);
  const diag = verdict(name, feet(5, 5, 1, 6, 6, 1));
  const far = verdict(name, 10);
  check(key + ".range", Cast.rangeOf(name) === "touch" && Rings.bands(spellSpec(name)).touch === true);
  check(key + ".adj", near.apply && !near.blocked && !near.disadvantage && near.button === "", JSON.stringify(near));
  check(key + ".diag", diag.apply && !diag.blocked && !diag.disadvantage, JSON.stringify(diag));
  check(key + ".ten", far.blocked && far.button === "out of range" && far.feet === 10, JSON.stringify(far));
});
const bolt = Rings.resolve({ name: "Fire Bolt", kind: "spell", spell: true, spellKind: "attack", range: "120 ft" }, 40, { hasTarget: true, hostileFeet: 5, override: "auto" });
check("bolt.face", bolt.apply && !bolt.blocked && bolt.disadvantage && /hostile within 5/.test(bolt.note), JSON.stringify(bolt));

check("flame.look", FX.lookOf({ type: "spell", spell: "Sacred Flame", dmg: "radiant" }) === "sacred-flame");
check("flame.req", FX.request({ type: "spell", spell: "Sacred Flame", dmg: "radiant", result: "hit", target: "bull", at: { x: 10.5, y: 8.5 } }).at.x === 10.5);

function trace(spec, lt, g) {
  const ops = [];
  let fillStyle = "";
  const ctx = new Proxy({}, {
    get(_t, p) {
      if (typeof p !== "string") return undefined;
      return function () {
        if (p === "arc" || p === "fill" || p === "stroke") ops.push({ op: p, fillStyle: fillStyle });
        if (p === "createRadialGradient" || p === "createLinearGradient") return { addColorStop() {} };
        return ctx;
      };
    },
    set(_t, p, v) {
      if (p === "fillStyle") fillStyle = String(v);
      return true;
    }
  });
  FX.paint(ctx, spec, lt, g);
  return ops;
}
const cell = 70;
const g = {
  A: { x: 80, y: 200 }, S: { x: 80, y: 200 }, T: { x: 320, y: 200 }, B: { x: 320, y: 200 },
  rT: 18, rS: 18, cell: cell
};
const flame = trace({ type: "spell", spell: "Sacred Flame", dmg: "radiant", result: "hit" }, 700, g);
check("flame.image", flame.some((op) => op.op === "arc" || op.op === "stroke" || op.op === "fill"), "ops " + flame.length);

const v2 = read("dm/assets/js/v2.js");
const live = ["knownNumber", "noHpPoolRow", "mirrorTokenHp", "applyEnemyHp", "findCombatant", "claimApply", "playerSnapshot", "blankLabel", "slideMove", "applyPlayerHit", "applyRequest"]
  .map((name) => extractFunction(v2, name)).join("\n");
let saveFailed = true;
const tokens = { "tok-bull": { id: "tok-bull", hp: 42, maxHp: 42 } };
const bull = { id: "bull", name: "Buffalo Bull", kind: "enemy", hp: 42, maxHp: 42, mapTokenId: "tok-bull" };
context.fight = { damageMode: "auto", appliedHits: {}, order: [bull], started: true, round: 1, turn: 0 };
context.DM = {
  toast() {},
  uid(p) { return p + "-1"; },
  pushCommand() {},
  pushLedger() { return Promise.resolve(); },
  markRollApplied() {},
  renderPlayers() {},
  state: { uid: "dm", roomCode: "DUST", rolls: [], players: {} }
};
context.window.SSDNSMapHost = {
  patchToken(id, patch) { tokens[id] = Object.assign(tokens[id] || { id: id }, patch); },
  tokenLink() { return { tokenId: "tok-bull", combatantId: "bull" }; }
};
context.window.SSDNSApplied = context.SSDNSApplied;
context.window.SSDNSSpellArea = Area;
context.window.SSDNSSpellCast = Cast;
const preamble = `
"use strict";
function targetDusted() { return false; }
function rowDusted() { return false; }
function damageReactOffers() { return []; }
function runReactOffers() {}
function applyForcedSlide() { return null; }
function conditionsForRow() { return []; }
function noteDust() {}
function noteUnconscious() {}
function clearDown() {}
function breakEnemyConc() {}
function hitHealsCaster() { return false; }
function spellMapFx() {}
function saveRemoteTable() {}
function renderFight() {}
function rememberUndo() {}
function combatantKey(row) { return (row && (row.id || "")) || ""; }
function chargeZone() {}
function absorbRider() {}
function rememberCondition() { return Promise.resolve(); }
function markRequestResolved() {}
function heldOutOfTurn() { return false; }
function holdHit() { return false; }
function requestPlayerSave() {
  return Promise.resolve({ failed: saveFailed, blocked: false, line: saveFailed ? "DEX save FAIL" : "DEX save OK" });
}
var saveFailed = true;
function setSaveFailed(v) { saveFailed = v; }
`;
vm.runInContext(preamble + "\n" + live, context, { filename: "v2-flame.js" });

const req = {
  from: "p1", targetId: "bull", targetName: "Buffalo Bull", amount: 8,
  label: "Sacred Flame", type: "spell", save: "DEX", dc: 15, half: false,
  dice: "1d8 = 8 radiant", spell: "Sacred Flame", characterName: "TEST",
  rollId: "sf-fail", hit: true
};
check("flame.notAttack", Cast.countsAsAttack(req) === false);
context.setSaveFailed(true);
context.applyRequest(Object.assign({}, req), "req1");
await new Promise((r) => setTimeout(r, 0));
check("flame.failHp", bull.hp === 34 && tokens["tok-bull"].hp === 34, "row " + bull.hp + " token " + tokens["tok-bull"].hp);

context.setSaveFailed(false);
context.applyRequest(Object.assign({}, req, { rollId: "sf-ok" }), "req2");
await new Promise((r) => setTimeout(r, 0));
check("flame.okHp", bull.hp === 34 && tokens["tok-bull"].hp === 34, "row " + bull.hp);

check("sheet.stamp", read("assets/js/sheet-extras.js").includes("function targetSquare"));
check("map.ownCast", mapSrc.includes("ownCast && type === 'spell'"));

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\nphase2 flame ok");
process.exit(0);

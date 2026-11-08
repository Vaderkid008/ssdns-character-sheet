/**
 * Hunger of Hadar HP apply (sheet 0.3.243 / DMCC 0.2.256).
 * The live table painted numbered cold and acid faces, then left HP alone.
 * zoneApplyAmount posted the roll and then read an undefined `shown`, so
 * applyPlayerHit never ran. This executes that function from v2.js: a start
 * tick and a failed end tick must drop an enemy token and a player sheet by
 * the rolled totals. The feed painter still has to show those faces.
 *
 *   node tools/test-hadar-hp-03233.mjs
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
check("ver.sheet", version.sheet === "0.3.243" && version.sheetBuild === "sheet-playtest-v03243");
check("ver.dmcc", version.dmcc === "0.2.256" && version.dmccBuild === "dmcc-playtest-v02256");

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

const v2 = read("dm/assets/js/v2.js");
const liveFns = [
  "knownNumber", "noHpPoolRow", "mirrorTokenHp", "applyEnemyHp",
  "findCombatant", "claimApply", "playerSnapshot", "blankLabel",
  "zoneRoll", "zoneApplyAmount", "casterForZone", "zoneTokenOf",
  "zoneListNow", "rebaseFollow", "deliverZoneTick", "zonePhase", "applyPlayerHit"
].map((name) => extractFunction(v2, name)).join("\n\n");
check("src.noShown", !/dice:\s*shown\b/.test(extractFunction(v2, "zoneApplyAmount")));

const context = {
  console, Math, Date, JSON, parseInt, isFinite, Number, String, Object, Array, RegExp,
  setTimeout, clearTimeout
};
context.window = context;
context.globalThis = context;
vm.createContext(context);
["assets/js/apply-guard.js", "assets/js/spell-fx.js", "assets/js/spell-area.js", "assets/js/spell-riders.js", "assets/js/spell-cast.js", "assets/js/spell-zones.js", "assets/js/dice-art.js"].forEach((rel) => {
  vm.runInContext(read(rel), context, { filename: rel });
});

const sheet = { hpCurrent: 122, hpMax: 122, logs: [] };
const tokens = {
  "tok-bull": { id: "tok-bull", hp: 42, maxHp: 42, x: 10, y: 10, size: 1 },
  "tok-pc": { id: "tok-pc", hp: 122, maxHp: 122, x: 10, y: 10, size: 1 }
};
const bull = { id: "bull", name: "Buffalo Bull", kind: "enemy", hp: 42, maxHp: 42, mapTokenId: "tok-bull", card: { tactics: "" } };
const pc = {
  id: "pcrow", playerId: "uid-caster", name: "TEST All-Spells (catalog 85)", kind: "player",
  hp: 122, maxHp: 122, mapTokenId: "tok-pc"
};
const commands = [];
const posted = [];
let saveFailed = true;
let uidN = 0;

context.fight = {
  damageMode: "auto",
  appliedHits: {},
  order: [pc, bull],
  round: 1,
  turn: 0,
  started: true
};
context.DM = {
  toast() {},
  uid(prefix) { uidN += 1; return (prefix || "id") + "-" + uidN; },
  pushRoll(entry) { posted.push(entry); return Promise.resolve(); },
  pushCommand(cmd) {
    commands.push(cmd);
    if (!cmd || cmd.type !== "hp" || cmd.to !== "uid-caster") return;
    const payload = cmd.payload || {};
    let delta = Number(payload.delta);
    if (!delta) delta = (payload.kind === "heal" ? 1 : -1) * (Number(payload.amount) || 0);
    if (!delta) return;
    if (delta < 0) sheet.hpCurrent = Math.max(0, sheet.hpCurrent + delta);
    else sheet.hpCurrent = sheet.hpMax ? Math.min(sheet.hpMax, sheet.hpCurrent + delta) : sheet.hpCurrent + delta;
    const snap = context.DM.state.players["uid-caster"].snapshot;
    snap.hpCurrent = sheet.hpCurrent;
    sheet.logs.push(payload.text || "");
  },
  pushLedger() { return Promise.resolve(); },
  markRollApplied() {},
  renderPlayers() {},
  state: {
    uid: "dm",
    roomCode: "COIL-7817",
    rolls: [],
    players: {
      "uid-caster": { snapshot: { name: pc.name, hpCurrent: 122, hpMax: 122, ac: 13 } }
    }
  }
};
context.window.SSDNSMapHost = {
  patchToken(id, patch) {
    if (!tokens[id]) tokens[id] = { id: id };
    Object.assign(tokens[id], patch);
  },
  tokenSnapshot(id) { return tokens[id] || null; },
  tokenLink(id) {
    if (id === "bull" || id === "tok-bull") return { tokenId: "tok-bull", combatantId: "bull" };
    if (id === "uid-caster" || id === "pcrow" || id === "tok-pc") return { tokenId: "tok-pc", combatantId: "uid-caster" };
    return null;
  },
  hasToken(id) { return !!tokens[id]; },
  spellZones() { return (pc.spellMarks && pc.spellMarks.zones) || []; },
  setSpellZones(list) { pc.spellMarks = Object.assign({}, pc.spellMarks, { zones: list || [] }); }
};
context.window.SSDNSApplied = context.SSDNSApplied;
context.saveOutcome = () => saveFailed;

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
function saveRemoteTable() { saveRemoteTable.n = (saveRemoteTable.n || 0) + 1; }
function renderFight() {}
function rememberUndo() {}
function saveUndos() {}
function $() { return null; }
function combatantKey(row) { return (row && (row.playerId || row.id)) || ""; }
function isFriendly() { return false; }
function liveMapTokenId(row) { return (row && row.mapTokenId) || ""; }
function tokenHpOf() { return null; }
function downedHidden() { return false; }
function riderDc(caster) {
  const card = caster && caster.card;
  const n = card && card.spellcasting ? Number(card.spellcasting.dc) : NaN;
  return isFinite(n) ? n : null;
}
function chargeZone() {}
function growBeads() {}
function rememberCondition() { return Promise.resolve(); }
function requestPlayerSave(opts) {
  opts = opts || {};
  const target = findCombatant({ targetId: opts.targetId, targetName: opts.targetName }) || { id: opts.targetId, name: opts.targetName, kind: "enemy" };
  const npc = target.kind !== "player";
  const failed = saveOutcome();
  const line = (target.name || "Target") + " " + (opts.ability || "DEX") + " save = " + (failed ? "1 vs DC " + opts.dc + " FAIL" : "20 vs DC " + opts.dc + " OK");
  if (npc) {
    DM.pushRoll({ private: true, who: target.name, label: (opts.label || "Save") + " · " + opts.ability, formula: "1d20+0", result: failed ? 1 : 20, detail: line, save: true });
  } else {
    DM.pushCommand({ type: "save", to: target.playerId || target.id, payload: { ability: opts.ability, dc: opts.dc, label: opts.label } });
  }
  return Promise.resolve({ failed: failed, blocked: false, line: line, total: failed ? 1 : 20, nat: failed ? 1 : 20, mod: 0, target: target });
}
`;

vm.runInContext(preamble + "\n" + liveFns, context, { filename: "v2-hadar-hp.js" });

const Z = context.SSDNSSpellZones;
const Dice = context.SSDNSDice;
const zone = Z.buildZone("Hunger of Hadar", { origin: { x: 10, y: 10 }, area: { shape: "sphere", radius: 20 } }, {
  slot: 3, casterId: "uid-caster", dc: 20, id: "hadar1", casterName: pc.name
});
pc.spellMarks = { zones: [zone], conc: "Hunger of Hadar" };
pc.concentration = "Hunger of Hadar";

const enter = Z.phaseDue({ zones: [zone] }, { id: "bull", name: bull.name, x: 10, y: 10, size: 1 }, "enter");
const opened = Z.moveDue([zone], { x: 6, y: 10 }, { x: 10, y: 10 }, { id: "bull", name: bull.name, size: 1 });
check("timing.noEnter", enter.length === 0 && opened.length === 0, "enter " + enter.length + " move " + opened.length);

function damageRolls() {
  return posted.filter((row) => row && row.formula === "2d6" && Array.isArray(row.rolls) && row.rolls.length === 2);
}
function paint(row) {
  const html = Dice.lead({ formula: row.formula, rolls: row.rolls, text: row.detail, detail: row.detail }, row.detail || "");
  return (html.match(/<text[^>]*>(\d+)<\/text>/g) || []).map((s) => Number(s.replace(/<[^>]+>/g, "")));
}
function assertDrop(id, beforeHp, afterHp, roll) {
  const faces = paint(roll);
  const dropped = beforeHp - afterHp;
  check(id + ".amount", dropped === roll.result && dropped === (Number(roll.rolls[0]) + Number(roll.rolls[1])), dropped + " vs " + roll.result + " " + (roll.detail || ""));
  check(id + ".faces", faces.length === 2 && faces[0] === roll.rolls[0] && faces[1] === roll.rolls[1] && /«\d+»/.test(roll.detail || ""), (roll.detail || "") + " painted " + faces.join(","));
}

let threw = "";
try { context.zonePhase(bull, "start"); }
catch (e) { threw = e && e.message ? e.message : String(e); }
check("enemy.start.ran", !threw, threw);
const cold = damageRolls().slice(-1)[0];
check("enemy.start.posted", !!cold);
if (cold) assertDrop("enemy.cold", 42, bull.hp, cold);
check("enemy.row", bull.hp === 42 - (cold ? cold.result : 0), String(bull.hp));
check("enemy.token", tokens["tok-bull"].hp === bull.hp, String(tokens["tok-bull"].hp));

const afterCold = bull.hp;
saveFailed = true;
try { context.zonePhase(bull, "end"); }
catch (e) { threw = e && e.message ? e.message : String(e); }
await new Promise((resolve) => setTimeout(resolve, 0));
const acid = damageRolls().slice(-1)[0];
check("enemy.end.ran", !threw && acid && acid !== cold, threw || "");
if (acid && acid !== cold) assertDrop("enemy.acid", afterCold, bull.hp, acid);
check("enemy.both", bull.hp === 42 - (cold ? cold.result : 0) - (acid && acid !== cold ? acid.result : 0), String(bull.hp));
check("enemy.token.after", tokens["tok-bull"].hp === bull.hp && tokens["tok-bull"].maxHp === 42, JSON.stringify(tokens["tok-bull"]));

const sheetBefore = sheet.hpCurrent;
const pcBefore = pc.hp;
const rollsBeforePc = damageRolls().length;
try { context.zonePhase(pc, "start"); }
catch (e) { threw = e && e.message ? e.message : String(e); }
const pcCold = damageRolls().slice(-1)[0];
check("player.start.ran", !threw && damageRolls().length === rollsBeforePc + 1, threw || "");
if (pcCold) assertDrop("player.cold", pcBefore, pc.hp, pcCold);
check("player.row", pc.hp === pcBefore - (pcCold ? pcCold.result : 0), String(pc.hp));
check("player.sheet", sheet.hpCurrent === sheetBefore - (pcCold ? pcCold.result : 0), String(sheet.hpCurrent));
check("player.token", tokens["tok-pc"].hp === pc.hp, String(tokens["tok-pc"].hp));
const hpCmd = commands.filter((cmd) => cmd && cmd.type === "hp" && cmd.to === "uid-caster").slice(-1)[0];
check("player.command", !!hpCmd && Number(hpCmd.payload.delta) === -(pcCold ? pcCold.result : 0), hpCmd && JSON.stringify(hpCmd.payload));

const stale = context.SSDNSApplied.acceptPlayerHp(pc, 122, Date.now());
check("player.staleSnap", stale === false && pc.hp === sheet.hpCurrent, "accept " + stale + " row " + pc.hp);

const pcMid = pc.hp;
const sheetMid = sheet.hpCurrent;
saveFailed = true;
try { context.zonePhase(pc, "end"); }
catch (e) { threw = e && e.message ? e.message : String(e); }
await new Promise((resolve) => setTimeout(resolve, 0));
const pcAcid = damageRolls().slice(-1)[0];
check("player.end.ran", !threw && pcAcid && pcAcid !== pcCold, threw || "");
if (pcAcid && pcAcid !== pcCold) assertDrop("player.acid", pcMid, pc.hp, pcAcid);
check("player.sheet.acid", sheet.hpCurrent === sheetMid - (pcAcid && pcAcid !== pcCold ? pcAcid.result : 0), String(sheet.hpCurrent));
check("player.token.acid", tokens["tok-pc"].hp === pc.hp, String(tokens["tok-pc"].hp));
check("player.mapCard", pc.hp === sheet.hpCurrent && pc.hp < 122, String(pc.hp));
check("saved", (context.saveRemoteTable.n || 0) >= 4, String(context.saveRemoteTable.n || 0));

const held = bull.hp;
const heldToken = tokens["tok-bull"].hp;
const heldRolls = damageRolls().length;
context.fight.damageMode = "approve";
try { context.zonePhase(bull, "start"); }
catch (e) { threw = e && e.message ? e.message : String(e); }
check("approve.holds", !threw && bull.hp === held && tokens["tok-bull"].hp === heldToken && damageRolls().length === heldRolls + 1, "hp " + bull.hp + " rolls " + damageRolls().length);
context.fight.damageMode = "auto";

const quiet = bull.hp;
const quietRolls = posted.length;
saveFailed = false;
try { context.zonePhase(bull, "end"); }
catch (e) { threw = e && e.message ? e.message : String(e); }
await new Promise((resolve) => setTimeout(resolve, 0));
const acidAfterOk = damageRolls().length;
check("success.noAcid", !threw && bull.hp === quiet && tokens["tok-bull"].hp === quiet && acidAfterOk === heldRolls + 1 && posted.length > quietRolls, "hp " + bull.hp + " acidRolls " + acidAfterOk);

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\nhadar hp apply ok");

/**
 * Cylinder, tube, and attack-button shots share the map range check.
 * A disadvantaged shot stays silent until Continue. Cancel plays nothing.
 *   node tools/test-range-fire.mjs
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
function flush(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
const CONFIRM = "This attack is with Disadvantage.  Continue?";

const appSrc = read("assets/js/app.js");
const extras = read("assets/js/sheet-extras.js");
const play = read("assets/js/sheet-playtest.js");
const v2src = read("dm/assets/js/v2.js");
const fireBranch = appSrc.slice(appSrc.indexOf("if (d.fire !== undefined)"), appSrc.indexOf("if (d.unload"));
const rollGunBody = extras.slice(extras.indexOf("function rollGun"), extras.indexOf("function postGunLedger"));
const meleeStart = play.indexOf("function rollMelee(i)");
const strikeBody = v2src.slice(v2src.indexOf("async function cardStrike"), v2src.indexOf("async function cardCheck"));
const detailBody = v2src.slice(v2src.indexOf("async function rollGunAttack"), v2src.indexOf("async function rollSpell"));
check("route.chamber", fireBranch.includes("SSDNSGunRoll") && !fireBranch.includes(".play("));
check("route.rollGun", rollGunBody.indexOf("prepareGun") >= 0 && rollGunBody.indexOf("prepareGun") < rollGunBody.indexOf("attackCue"));
check("route.melee", meleeStart < play.indexOf("prepareMelee") && play.indexOf("function prepareMelee") < play.indexOf("function rollMeleeNow") && play.indexOf("function rollMeleeNow") < play.indexOf("attackCue(cueNow)"));
check("route.card", strikeBody.indexOf("confirmDisadvantage") < strikeBody.indexOf("playTableSfx"));
check("route.detail", detailBody.indexOf("confirmDisadvantage") >= 0 && detailBody.indexOf("confirmDisadvantage") < detailBody.indexOf('op: "fire"') && detailBody.indexOf("g.loaded = loaded - 1") < 0 && detailBody.indexOf("playTableSfx") < 0 && detailBody.indexOf("gun_event") < 0 && detailBody.indexOf("g.misStreak") < 0);
check("copy.confirm", read("assets/js/range-rings.js").includes(CONFIRM));

function makeWindow() {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/", pretendToBeVisual: true, runScripts: "dangerously" });
  const w = dom.window;
  const proto = w.HTMLElement.prototype;
  try {
    Object.defineProperty(proto, "clientWidth", { configurable: true, get() { return 800; } });
    Object.defineProperty(proto, "clientHeight", { configurable: true, get() { return 600; } });
  } catch (e) {}
  proto.getBoundingClientRect = function () {
    return { x: 0, y: 0, left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, toJSON() { return {}; } };
  };
  w.HTMLCanvasElement.prototype.getContext = function () {
    const bag = {};
    return new Proxy(bag, {
      get(t, p) {
        if (p in t) return t[p];
        if (typeof p !== "string") return undefined;
        return function () { return bag; };
      },
      set(t, p, v) { t[p] = v; return true; }
    });
  };
  w.HTMLImageElement.prototype.decode = function () { return Promise.resolve(); };
  w.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
  w.fetch = async function () { return { ok: false, status: 404, json: async () => ({}) }; };
  return w;
}
function addScript(w, rel) {
  const s = w.document.createElement("script");
  s.textContent = read(rel);
  w.document.body.appendChild(s);
}
function act(el, name) { return el.querySelector('[data-act="' + name + '"]'); }

const scene = JSON.parse(read("map/scene-dusty-spur.json"));
const NAVY = {
  id: "gunroll:0",
  label: "Navy / Army Ball n Cap Revolver",
  name: "Navy / Army Ball n Cap Revolver",
  weapon: "navy-army-ball-n-cap-revolver",
  action: "Percussion revolver (slow)",
  group: "pistol",
  tier: "medium",
  toHit: 5,
  damage: "1d8",
  cylinder: { index: 0, loaded: 6, cap: 6, chambers: [1, 1, 1, 1, 1, 1] }
};
const TUBE = {
  id: "gunroll:1",
  label: "Henrietta Repeating Rifle",
  name: "Henrietta Repeating Rifle",
  weapon: "henrietta-repeating-rifle",
  action: "Lever (tube)",
  group: "rifle",
  tier: "medium",
  toHit: 5,
  damage: "1d8",
  cylinder: { index: 1, loaded: 6, cap: 6, chambers: [1, 1, 1, 1, 1, 1] }
};

function bootMap(w) {
  addScript(w, "assets/data/rules.js");
  addScript(w, "assets/js/range-rings.js");
  addScript(w, "assets/js/ammo-display.js");
  addScript(w, "map/ssdns-map-firebase.js");
  addScript(w, "map/ssdns-map.js");
}

const pw = makeWindow();
bootMap(pw);
const playerRuns = [];
const playerEl = pw.document.createElement("div");
pw.document.body.appendChild(playerEl);
const playerAdapter = pw.SSDNSMapFirebase.memory({ role: "player" });
const playerApi = pw.SSDNSMap.create({
  el: playerEl, role: "player", uid: "p1", adapter: playerAdapter,
  host: {
    sheetTargets() {
      return [
        { id: "tok_long", label: "Long" },
        { id: "tok_navy_past", label: "Navy past" },
        { id: "tok_far", label: "Far" }
      ];
    },
    actions: {
      get() { return [NAVY, TUBE]; },
      run(id, ctx) { playerRuns.push({ id: id, chamber: ctx && ctx.chamber, targetId: ctx && ctx.targetId }); }
    }
  },
  options: { scene, assetBase: "", room: { table: { initiative: { order: [], turn: 0 } } } }
});
await flush(60);
let seq = 10;
async function putToken(id, x, extra) {
  seq += 1;
  await playerAdapter.write("map/public/tokens/" + id, Object.assign({
    id: id, pos: { x: x, y: 0 }, name: id, size: 1
  }, extra || {}), { seq: seq, by: "dm" });
}
/* fog off for these range checks (0.3.104 fog-aware targeting only lists what the player can see) */
await playerAdapter.write("map/public/scenes/scn_dustyspur01", { walls: [], fogRects: [], fogRevealed: true }, { seq: 2, by: "dm" });
await putToken("tok_me", 0, { ownerUid: "p1", name: "Jolene" });
await putToken("tok_long", 8, { name: "Long" });
await putToken("tok_navy_past", 16, { name: "Past" });
await putToken("tok_far", 30, { name: "Far" });
await flush(20);
playerApi.refreshCard();

function aimPlayer(id) {
  const sel = playerEl.querySelector('[data-act="cylTarget"]');
  sel.value = id;
  sel.dispatchEvent(new pw.Event("change", { bubbles: true }));
}
function attackBtn(id) { return playerEl.querySelector('[data-act="playerAttack"][data-id="' + id + '"]'); }
function mark(btn) { return btn && btn.querySelector(".ssm-dis"); }

aimPlayer("tok_long");
const navyLong = attackBtn("gunroll:0");
const tubeLong = attackBtn("gunroll:1");
check("player.label.navy", !!(mark(navyLong) && mark(navyLong).textContent === "Disadvantage" && !navyLong.disabled), navyLong && navyLong.textContent);
check("player.label.tube", !!(mark(tubeLong) && mark(tubeLong).textContent === "Disadvantage"), tubeLong && tubeLong.textContent);
check("player.art", !!playerEl.querySelector('[data-ammo-kind="cylinder"]') && !!playerEl.querySelector('[data-ammo-kind="tube"]'));

function clickChamber(kind) {
  const row = playerEl.querySelector('[data-ammo-kind="' + kind + '"]');
  const btn = row && (row.querySelector(".ammo-tube-fire") || row.querySelector("button"));
  if (btn) btn.click();
  return btn;
}
pw.SSDNSRangeRings.clear();
const before = playerRuns.length;
clickChamber("cylinder");
const cyl = playerRuns[playerRuns.length - 1];
const cylPeek = pw.SSDNSRangeRings.peek();
check("player.cylinder.dis", before + 1 === playerRuns.length && cyl && cyl.id === "gunroll:0" && cyl.targetId === "tok_long" && cylPeek && cylPeek.disadvantage && !cylPeek.blocked, JSON.stringify({ cyl, peek: cylPeek && cylPeek.button }));
pw.SSDNSRangeRings.clear();
clickChamber("tube");
const tube = playerRuns[playerRuns.length - 1];
const tubePeek = pw.SSDNSRangeRings.peek();
check("player.tube.dis", tube && tube.id === "gunroll:1" && tube.targetId === "tok_long" && tubePeek && tubePeek.disadvantage && !tubePeek.blocked, JSON.stringify({ tube, peek: tubePeek && tubePeek.button }));
pw.SSDNSRangeRings.clear();
const runsBeforeAtk = playerRuns.length;
attackBtn("gunroll:0").click();
const atk = playerRuns[playerRuns.length - 1];
const atkPeek = pw.SSDNSRangeRings.peek();
check("player.attack.dis", playerRuns.length === runsBeforeAtk + 1 && atk && atk.id === "gunroll:0" && atk.targetId === "tok_long" && atkPeek && atkPeek.disadvantage, JSON.stringify(atk));

aimPlayer("tok_navy_past");
const navyBlocked = attackBtn("gunroll:0");
const tubeStill = attackBtn("gunroll:1");
check("player.block.navy", !!(navyBlocked && navyBlocked.disabled && navyBlocked.textContent.indexOf("Out of range") >= 0 && !mark(navyBlocked)), navyBlocked && navyBlocked.textContent);
check("player.tube.stillDis", !!(mark(tubeStill) && !tubeStill.disabled), tubeStill && tubeStill.textContent);
pw.SSDNSRangeRings.clear();
const blockedRuns = playerRuns.length;
clickChamber("cylinder");
check("player.cylinder.block", playerRuns.length === blockedRuns && !pw.SSDNSRangeRings.peek());
navyBlocked.click();
check("player.attack.block", playerRuns.length === blockedRuns);

aimPlayer("tok_far");
const farNavy = attackBtn("gunroll:0");
const farTube = attackBtn("gunroll:1");
check("player.block.both", !!(farNavy && farNavy.disabled && farTube && farTube.disabled && farTube.textContent.indexOf("Out of range") >= 0), (farNavy && farNavy.textContent) + " | " + (farTube && farTube.textContent));
pw.SSDNSRangeRings.clear();
const farRuns = playerRuns.length;
clickChamber("tube");
check("player.tube.block", playerRuns.length === farRuns && !pw.SSDNSRangeRings.peek());
playerApi.destroy();

const dw = makeWindow();
bootMap(dw);
const dmEvents = [];
const dmEl = dw.document.createElement("div");
dw.document.body.appendChild(dmEl);
let dmAim = "en_long";
const dm = dw.SSDNSMap.create({
  el: dmEl, role: "dm", uid: "dm", adapter: dw.SSDNSMapFirebase.memory({ role: "dm" }),
  host: {
    on(name, detail) { dmEvents.push({ name: name, detail: detail || {} }); },
    getCard(id) {
      if (id !== "tok_shooter" && id !== "en_shooter") return null;
      return {
        name: "Bandit", kind: "enemy", ac: 12, hp: { cur: 10, max: 10 },
        attacks: [
          { id: "navy", name: "Navy / Army Ball n Cap Revolver", weapon: "navy-army-ball-n-cap-revolver", action: "Percussion revolver (slow)", group: "pistol", tier: "medium", toHit: 4, damage: "1d8", ammo: { loaded: 6, cap: 6 } },
          { id: "henrietta", name: "Henrietta Repeating Rifle", weapon: "henrietta-repeating-rifle", action: "Lever (tube)", group: "rifle", tier: "medium", toHit: 5, damage: "1d8", ammo: { loaded: 6, cap: 6 } }
        ]
      };
    },
    combatTargets() {
      return {
        selected: dmAim,
        options: [
          { id: "en_long", label: "Long" },
          { id: "en_navy_past", label: "Navy past" },
          { id: "en_far", label: "Far" }
        ]
      };
    }
  },
  options: {
    scene, assetBase: "",
    tokens: { tokens: {
      tok_shooter: { id: "tok_shooter", pos: { x: 0, y: 0 }, name: "Bandit", combatantId: "en_shooter" },
      tok_long: { id: "tok_long", pos: { x: 8, y: 0 }, name: "Long", combatantId: "en_long" },
      tok_navy_past: { id: "tok_navy_past", pos: { x: 16, y: 0 }, name: "Past", combatantId: "en_navy_past" },
      tok_far: { id: "tok_far", pos: { x: 30, y: 0 }, name: "Far", combatantId: "en_far" }
    } },
    room: { table: { initiative: { order: [
      { id: "en_shooter", name: "Bandit", kind: "enemy" },
      { id: "en_long", name: "Long", kind: "enemy" },
      { id: "en_navy_past", name: "Past", kind: "enemy" },
      { id: "en_far", name: "Far", kind: "enemy" }
    ], turn: 0 } } }
  }
});
await flush(60);
function chip(label) {
  const strip = act(dmEl, "turnStrip");
  return strip && [...strip.querySelectorAll("span")].find((s) => s.textContent === label);
}
chip("Bandit").click();
await flush(20);
function aimDm(id) {
  dmAim = id;
  const sel = dmEl.querySelector('[data-act="cylTarget"]');
  sel.value = id;
  sel.dispatchEvent(new dw.Event("change", { bubbles: true }));
}
function dmAttack(id) { return dmEl.querySelector('.ssm-atk[data-wid="' + id + '"]'); }
function dmClick(kind, wid) {
  const row = [...dmEl.querySelectorAll(".cylinder-row")].find((r) => r.querySelector('[data-wid="' + wid + '"]'));
  const btn = row && (row.querySelector(".ammo-tube-fire") || row.querySelector('[data-act="chamber"]'));
  if (btn) btn.click();
  return btn;
}
aimDm("en_long");
const dmNavy = dmAttack("navy");
const dmTube = dmAttack("henrietta");
check("dm.label.navy", !!(mark(dmNavy) && mark(dmNavy).textContent === "Disadvantage" && !dmNavy.disabled), dmNavy && dmNavy.textContent);
check("dm.label.tube", !!(mark(dmTube) && mark(dmTube).textContent === "Disadvantage"), dmTube && dmTube.textContent);
check("dm.art", !!dmEl.querySelector('[data-ammo-kind="cylinder"]') && !!dmEl.querySelector('[data-ammo-kind="tube"]'));
dw.SSDNSRangeRings.clear();
const ev0 = dmEvents.length;
dmClick("cylinder", "navy");
const navyEv = dmEvents.filter((e) => e.name === "drawer:target" && e.detail.weaponId === "navy").pop();
const dmCyl = dw.SSDNSRangeRings.peek();
check("dm.cylinder.dis", dmEvents.length > ev0 && navyEv && navyEv.detail.targetCombatantId === "en_long" && dmCyl && dmCyl.disadvantage && !dmCyl.blocked, JSON.stringify(navyEv && navyEv.detail));
dw.SSDNSRangeRings.clear();
dmClick("tube", "henrietta");
const tubeEv = dmEvents.filter((e) => e.name === "drawer:target" && e.detail.weaponId === "henrietta").pop();
const dmTubePeek = dw.SSDNSRangeRings.peek();
check("dm.tube.dis", tubeEv && tubeEv.detail.targetCombatantId === "en_long" && dmTubePeek && dmTubePeek.disadvantage, JSON.stringify(tubeEv && tubeEv.detail));
dw.SSDNSRangeRings.clear();
const atkEvents = dmEvents.filter((e) => e.name === "drawer:attack").length;
const navyTargetsBefore = dmEvents.filter((e) => e.name === "drawer:target" && e.detail.weaponId === "navy").length;
dmAttack("navy").click();
/* 0.3.67: Attacks uses the target already chosen in the cylinder menu and fires straight away. */
check("dm.attack.pending", dmEvents.filter((e) => e.name === "drawer:attack").length === atkEvents + 1);
check("dm.attack.direct", dmEvents.filter((e) => e.name === "drawer:target" && e.detail.weaponId === "navy").length === navyTargetsBefore + 1 && !dmEl.querySelector(".ssm-pending"));
const aimed = dmEvents.filter((e) => e.name === "drawer:target" && e.detail.weaponId === "navy").pop();
const aimedPeek = dw.SSDNSRangeRings.peek();
check("dm.attack.dis", aimed && aimed.detail.targetTokenId === "tok_long" && aimedPeek && aimedPeek.disadvantage, JSON.stringify(aimed && aimed.detail));

aimDm("en_navy_past");
const dmNavyBlock = dmAttack("navy");
const dmTubeOk = dmAttack("henrietta");
check("dm.block.navy", !!(dmNavyBlock && dmNavyBlock.disabled && dmNavyBlock.textContent.indexOf("Out of range") >= 0 && !mark(dmNavyBlock)), dmNavyBlock && dmNavyBlock.textContent);
check("dm.tube.stillDis", !!(mark(dmTubeOk) && !dmTubeOk.disabled), dmTubeOk && dmTubeOk.textContent);
dw.SSDNSRangeRings.clear();
const evBlock = dmEvents.filter((e) => e.name === "drawer:target").length;
dmClick("cylinder", "navy");
check("dm.cylinder.block", dmEvents.filter((e) => e.name === "drawer:target").length === evBlock && !dw.SSDNSRangeRings.peek());

aimDm("en_far");
const dmFarNavy = dmAttack("navy");
const dmFarTube = dmAttack("henrietta");
check("dm.block.both", !!(dmFarNavy && dmFarNavy.disabled && dmFarTube && dmFarTube.disabled), (dmFarNavy && dmFarNavy.textContent) + " | " + (dmFarTube && dmFarTube.textContent));
dw.SSDNSRangeRings.clear();
const evFar = dmEvents.filter((e) => e.name === "drawer:target").length;
dmClick("tube", "henrietta");
check("dm.tube.block", dmEvents.filter((e) => e.name === "drawer:target").length === evFar && !dw.SSDNSRangeRings.peek());
dm.destroy();

function audioStub(w) {
  const plays = [];
  let during = 0;
  w.SSDNSAudio = {
    play(name) {
      plays.push(String(name));
      if (w.document.querySelector("[data-dis-confirm]")) during += 1;
    },
    weaponCue(info) { return (info && info.sfx) || "attack"; },
    sharedCue(name) { return name; }
  };
  w.SSDNSTestRoll = () => 15;
  return { plays, during: () => during };
}
function armDis(w) {
  w.SSDNSRangeRings.arm(w.SSDNSRangeRings.resolve({
    weapon: "navy-army-ball-n-cap-revolver",
    group: "pistol",
    range: "20/60",
    properties: "Close quarters, slow load, simple",
    tier: "medium"
  }, 40, { hasTarget: true, hostileFeet: 80 }));
}
async function openDialog(w) {
  await flush(30);
  return w.document.querySelector("[data-dis-confirm]");
}

const sw = makeWindow();
addScript(sw, "assets/js/conditions.js");
addScript(sw, "assets/js/range-rings.js");
addScript(sw, "assets/data/rules.js");
addScript(sw, "assets/js/sheet-extras.js");
const guns = [
  { weapon: "navy-army-ball-n-cap-revolver", loaded: 6, chambers: ["ball", "ball", "ball", "ball", "ball", "ball"], tier: "medium", sfx: "revolver", name: "Navy" },
  { weapon: "henrietta-repeating-rifle", loaded: 6, chambers: ["cart", "cart", "cart", "cart", "cart", "cart"], tier: "medium", sfx: "lever-fire", name: "Henrietta" }
];
const character = { name: "Jolene", hpCurrent: 20, activeConditions: [], guns: guns };
sw.SSDNSApp = {
  doc() { return { character: character }; },
  compute() {
    return { guns: guns.map((g) => ({ w: { id: g.weapon, name: g.name, group: "pistol" }, atk: 5, parts: [{ label: "bonus", value: 5 }], dmg: "1d8" })) };
  },
  spendRound(i, k) {
    const g = guns[i];
    if (k != null && g.chambers && !g.chambers[k]) return { ok: false, reason: "empty" };
    if (k != null) g.chambers[k] = "";
    g.loaded -= 1;
    return { ok: true, left: g.loaded, was: "round" };
  },
  misfireCeiling() { return 1; }
};
const heard = audioStub(sw);
const adv = sw.document.createElement("select");
adv.id = "globalAdv";
sw.document.body.appendChild(adv);
[0, 1].forEach((i) => {
  const atk = sw.document.createElement("input");
  atk.setAttribute("data-calc", "gunAtk." + i);
  atk.value = "+5";
  const mis = sw.document.createElement("span");
  mis.setAttribute("data-out", "mis." + i);
  mis.textContent = "1";
  const dmg = sw.document.createElement("input");
  dmg.setAttribute("data-calc", "gunDmg." + i);
  dmg.value = "1d8";
  sw.document.body.appendChild(atk);
  sw.document.body.appendChild(mis);
  sw.document.body.appendChild(dmg);
  const btn = sw.document.createElement("button");
  btn.setAttribute("data-fire", String(i));
  btn.setAttribute("data-k", "0");
  sw.document.body.appendChild(btn);
});
sw.document.addEventListener("click", (e) => {
  const t = e.target.closest && e.target.closest("button");
  if (!t || t.dataset.fire === undefined || !sw.SSDNSGunRoll) return;
  const k = t.dataset.k !== undefined ? Number(t.dataset.k) : undefined;
  sw.SSDNSGunRoll(Number(t.dataset.fire), k);
});
function fireBtn(i) { return sw.document.querySelector('[data-fire="' + i + '"]'); }

armDis(sw);
const tubeLoaded = guns[1].loaded;
fireBtn(1).click();
let dlg = await openDialog(sw);
check("sound.tube.open", !!(dlg && dlg.querySelector(".dis-confirm-text") && dlg.querySelector(".dis-confirm-text").textContent === CONFIRM && heard.plays.length === 0 && heard.during() === 0), dlg && dlg.textContent);
dlg.querySelector("[data-dis-cancel]").click();
await flush(30);
check("sound.tube.cancel", !sw.document.querySelector("[data-dis-confirm]") && heard.plays.length === 0 && guns[1].loaded === tubeLoaded && sw.SSDNSSheet.logRows().filter((r) => r.kind === "roll").length === 0, "plays " + heard.plays.join(",") + " loaded " + guns[1].loaded);

armDis(sw);
const cylLoaded = guns[0].loaded;
fireBtn(0).click();
check("sound.cylinder.immediate", heard.plays.length === 0);
dlg = await openDialog(sw);
check("sound.cylinder.open", !!(dlg && heard.plays.length === 0 && heard.during() === 0 && guns[0].loaded === cylLoaded), "plays " + heard.plays.length + " loaded " + guns[0].loaded);
dlg.querySelector("form").dispatchEvent(new sw.Event("submit", { bubbles: true, cancelable: true }));
await flush(40);
check("sound.cylinder.continue", heard.plays.length === 1 && heard.plays[0] === "revolver" && heard.during() === 0 && guns[0].loaded === cylLoaded - 1, JSON.stringify({ plays: heard.plays, loaded: guns[0].loaded, during: heard.during() }));

const fightWin = makeWindow();
addScript(fightWin, "assets/js/range-rings.js");
const fightHeard = audioStub(fightWin);
const commands = [];
const rolls = [];
const ledger = [];
fightWin.DMCC = {
  $: (sel) => fightWin.document.querySelector(sel),
  $$: (sel) => Array.from(fightWin.document.querySelectorAll(sel)),
  esc: (s) => String(s == null ? "" : s),
  state: { players: {}, ledger: [], rolls: [], chat: [], demo: true, roomCode: "DUST", uid: "dm", db: null },
  toast() {},
  uid(p) { return (p || "id") + rolls.length; },
  guardFocus(fn) { if (fn) fn(); },
  parseDice() { return { total: 4, detail: "4", rolls: [4] }; },
  pushCommand(cmd) { commands.push(cmd); return Promise.resolve(); },
  pushRoll(row) { rolls.push(row); return Promise.resolve(); },
  pushLedger(row) { ledger.push(row); return Promise.resolve(); },
  renderPlayers() {},
  renderLiveDock() {}
};
const fightSrc = v2src.replace(/\nwireLookupNow\(\);\s*\nbootV2\(\);\s*$/, "\nglobalThis.__fight = { setOrder: function (rows) { fight.order = rows || []; } };\n");
const fightScript = fightWin.document.createElement("script");
fightScript.textContent = fightSrc;
fightWin.document.body.appendChild(fightScript);
const navyAtk = {
  id: "navy", name: "Navy / Army Ball n Cap Revolver", weapon: "navy-army-ball-n-cap-revolver",
  group: "pistol", action: "Percussion revolver (slow)", tier: "medium", range: "20/60",
  properties: "Close quarters, slow load, simple", toHit: 4, damage: "1d8",
  capacity: 6, loaded: 6, sfx: "revolver"
};
const bandit = { id: "en_bandit", name: "Bandit", kind: "enemy", ac: 12, hp: 11, maxHp: 11, mapTokenId: "tok_bandit", card: { attacks: [navyAtk] } };
const jolene = { id: "p_jolene", playerId: "p_jolene", kind: "player", name: "Jolene", ac: 30, hp: 20, maxHp: 20 };
fightWin.__fight.setOrder([bandit, jolene]);
fightWin.SSDNSMapHost = { armAttack() { return fightWin.SSDNSRangeRings.peek(); } };
armDis(fightWin);
const loadedBefore = navyAtk.loaded;
const pendingCancel = fightWin.SSDNSMapFight.attack({ combatantId: "en_bandit", weaponId: "navy", targetCombatantId: "p_jolene" });
dlg = await openDialog(fightWin);
check("sound.dm.open", !!(dlg && dlg.querySelector(".dis-confirm-text").textContent === CONFIRM && fightHeard.plays.length === 0 && fightHeard.during() === 0 && navyAtk.loaded === loadedBefore), dlg && dlg.textContent);
dlg.querySelector("[data-dis-cancel]").click();
await pendingCancel;
await flush(20);
check("sound.dm.cancel", fightHeard.plays.length === 0 && navyAtk.loaded === loadedBefore && rolls.length === 0 && (fightWin.DMCC.state.chat || []).length === 0, "plays " + fightHeard.plays.length + " loaded " + navyAtk.loaded + " rolls " + rolls.length);
armDis(fightWin);
const pendingGo = fightWin.SSDNSMapFight.attack({ combatantId: "en_bandit", weaponId: "navy", targetCombatantId: "p_jolene" });
dlg = await openDialog(fightWin);
check("sound.dm.stillQuiet", !!(dlg && fightHeard.plays.length === 0));
dlg.querySelector("form").dispatchEvent(new fightWin.Event("submit", { bubbles: true, cancelable: true }));
await pendingGo;
await flush(30);
check("sound.dm.continue", fightHeard.plays.length === 1 && fightHeard.plays[0] === "revolver" && fightHeard.during() === 0 && navyAtk.loaded === loadedBefore - 1 && rolls.length === 1, JSON.stringify({ plays: fightHeard.plays, loaded: navyAtk.loaded, rolls: rolls.length, during: fightHeard.during() }));

if (failures.length) {
  console.error(failures.length + " failed");
  process.exit(1);
}
console.log("range fire ok");

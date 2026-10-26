/**
 * N65 — last attack target comes back on your turn (sheet 0.3.154 / DMCC 0.2.167).
 *   node tools/test-n65-last-target.mjs
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
function check(id, cond, detail) {
  if (!cond) failures.push(id + (detail ? " — " + String(detail).slice(0, 500) : ""));
  console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + String(detail).slice(0, 500) : ""));
}
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
const v2 = read("dm/assets/js/v2.js");
const sheet = read("assets/js/sheet-playtest.js");
check("src.remember", /function rememberLastTarget\(/.test(v2) && /lastTargetId: row\.lastTargetId/.test(v2) && /noteAttackRolls\(rolls\)/.test(v2));
check("src.clear", /delete row\.lastTargetId/.test(v2) && /forgetAimsAt\(/.test(v2));
check("src.sheet", /pendingAim/.test(sheet) && /cur\.lastTargetId/.test(sheet) && !/unusableRow\(row\)/.test(sheet.slice(sheet.indexOf("var kept = keep"), sheet.indexOf("var last = sel.getAttribute"))));
check("src.noForce", !/pendingAim[\s\S]{0,200}click\(/.test(sheet));

function makeFight(opts) {
  opts = opts || {};
  const toasts = [];
  const ledger = [];
  const commands = [];
  const chat = [];
  const sb = { console, setTimeout, clearTimeout, Date, JSON, parseInt, isFinite, Number, String, Object, Array, Math, Promise };
  sb.window = sb; sb.globalThis = sb;
  sb.document = {
    readyState: "complete",
    getElementById() { return null; },
    addEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    createElement() {
      return { innerHTML: "", className: "", dataset: {}, style: {}, addEventListener() {}, appendChild() {}, setAttribute() {}, querySelector() { return null; }, querySelectorAll() { return []; } };
    },
    body: { appendChild() {}, classList: { contains() { return false; } } },
    activeElement: null
  };
  const esc = (s) => String(s == null ? "" : s);
  let seq = 0;
  sb.DMCC = {
    $: () => null, $$: () => [], esc,
    state: { players: {}, ledger: [], rolls: [], chat, demo: true, roomCode: "DUST", uid: "dm", db: null, unsubs: [] },
    toast(msg) { toasts.push(String(msg || "")); },
    uid(p) { seq += 1; return (p || "id") + seq; },
    guardFocus(fn) { if (fn) fn(); },
    parseDice() { return { total: 4, detail: "4" }; },
    pushCommand(cmd) { commands.push(cmd); return Promise.resolve(); },
    pushRoll() { return Promise.resolve(); },
    pushLedger(row) { ledger.push(row); return Promise.resolve(); },
    renderPlayers() {},
    roomRef(p) { return { path: p }; }
  };
  vm.createContext(sb);
  vm.runInContext(read("assets/js/turn-rules.js"), sb, { filename: "turn-rules.js" });
  vm.runInContext(read("assets/js/apply-guard.js"), sb, { filename: "apply-guard.js" });
  vm.runInContext(read("assets/js/misfire.js"), sb, { filename: "misfire.js" });
  vm.runInContext(read("assets/js/conditions.js"), sb, { filename: "conditions.js" });
  const src = v2.replace(
    /\nwireLookupNow\(\);\s*\nbootV2\(\);\s*$/,
    "\nglobalThis.__fight = { fight: fight, endCombat: endCombat };\n"
  );
  vm.runInContext(src, sb, { filename: "v2.js" });
  return { sb, toasts, ledger, commands };
}

{
  const { sb, commands } = makeFight();
  const fight = sb.__fight.fight;
  const snapGun = { id: "navy", index: 0, name: "Navy", capacity: 6, loaded: 6, spare: 6, tr: true, weapon: "navy" };
  const pc = { id: "pc1", name: "Ada", kind: "player", playerId: "pc1", dmActsAs: true, mapTokenId: "tok_pc", card: { attacks: [] } };
  const foe = { id: "en1", name: "Bandit", kind: "enemy", ac: 12, hp: 11, maxHp: 11, mapTokenId: "tok_en", status: "" };
  const other = { id: "en2", name: "Outlaw", kind: "enemy", ac: 13, hp: 9, maxHp: 9, mapTokenId: "tok_en2", status: "" };
  fight.order = [pc, foe, other];
  fight.started = true;
  fight.turn = 0;
  fight.round = 1;
  fight.seq = 2;
  fight.turnStarts = { pc1: 2 };
  sb.DMCC.state.players.pc1 = { snapshot: { name: "Ada", guns: [snapGun], ammo: [] }, turnMarkers: { turnKey: "s2" } };
  const before = commands.length;
  const fired = await sb.SSDNSMapFight.attack({ combatantId: "pc1", weaponId: "navy", targetCombatantId: "en1" });
  const aimed = sb.SSDNSMapFight.targets({ combatantId: "pc1" });
  check("n65.attackRemembers", fired === true && pc.lastTargetId === "en1" && aimed.selected === "en1" && aimed.options.some((o) => o.id === "en1"), JSON.stringify({ fired, last: pc.lastTargetId, aimed }));
  check("n65.noExtraShot", commands.length === before + 1, String(commands.length));
  fight.turn = 1;
  const away = sb.SSDNSMapFight.targets({ combatantId: "en1" });
  fight.turn = 0;
  const back = sb.SSDNSMapFight.targets({ combatantId: "pc1" });
  const afterCommands = commands.length;
  check("n65.turnReturns", back.selected === "en1" && commands.length === afterCommands && away.selected !== "en1", JSON.stringify({ back: back.selected, away: away.selected }));
  foe.hp = 0;
  foe.status = "Down";
  const down = sb.SSDNSMapFight.targets({ combatantId: "pc1" });
  check("n65.downedStays", pc.lastTargetId === "en1" && down.selected === "en1" && down.options.some((o) => o.id === "en1"), JSON.stringify(down));
  sb.SSDNSMapFight.noteAttackRolls([]);
  sb.SSDNSMapFight.noteAttackRolls([{ id: "r1", attack: true, playerId: "pc1", targetId: "en2" }]);
  check("n65.sheetRoll", pc.lastTargetId === "en2" && sb.SSDNSMapFight.targets({ combatantId: "pc1" }).selected === "en2");
  foe.hp = 11;
  foe.status = "";
  sb.SSDNSMapFight.onTokenRemoved({ tokenId: "tok_en2", combatantId: "en2" });
  check("n65.unlinkClears", pc.lastTargetId !== "en2" && !fight.order.some((r) => r && r.id === "en2"), JSON.stringify({ last: pc.lastTargetId, ids: fight.order.map((r) => r.id) }));
  pc.lastTargetId = "en1";
  sb.document.createElement = function () {
    return {
      className: "",
      innerHTML: "",
      parentNode: null,
      close() {},
      setAttribute() {},
      showModal() {},
      addEventListener() {},
      querySelector(sel) {
        if (sel === "#clearCombatConds") return { checked: false };
        if (sel === "[value=no]") return { addEventListener() {} };
        if (sel === "form") return { addEventListener(ev, fn) { if (ev === "submit") setTimeout(() => fn({ preventDefault() {} }), 0); } };
        return null;
      }
    };
  };
  sb.document.body.appendChild = function () {};
  await sb.__fight.endCombat();
  check("n65.endClears", fight.started === false && !pc.lastTargetId && !foe.lastTargetId, JSON.stringify({ started: fight.started, pc: pc.lastTargetId, links: pc.mapTokenId + "," + foe.mapTokenId }));
  check("n65.linksStay", pc.mapTokenId === "tok_pc" && foe.mapTokenId === "tok_en");
}

{
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/", pretendToBeVisual: true, runScripts: "dangerously" });
  const w = dom.window;
  w.HTMLImageElement.prototype.decode = function () { return Promise.resolve(); };
  w.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
  w.requestAnimationFrame = (fn) => setTimeout(fn, 0);
  w.HTMLCanvasElement.prototype.getContext = function () {
    const bag = {};
    return new Proxy(bag, { get(t, p) { if (p in t) return t[p]; if (typeof p !== "string") return undefined; return function () { return bag; }; }, set(t, p, v) { t[p] = v; return true; } });
  };
  const shots = [];
  function addScript(code) {
    const s = w.document.createElement("script");
    s.textContent = code;
    w.document.body.appendChild(s);
  }
  addScript(read("map/token-size.js"));
  addScript(read("map/ssdns-map-move.js"));
  addScript(read("map/ssdns-map-firebase.js"));
  addScript(read("map/ssdns-map.js"));
  const el = w.document.createElement("div");
  el.id = "map";
  w.document.body.appendChild(el);
  const scene = JSON.parse(read("map/scene-dusty-spur.json"));
  const sheetTarget = { value: "" };
  const map = w.SSDNSMap.create({
    el, role: "dm", uid: "dm",
    adapter: w.SSDNSMapFirebase.memory({ role: "dm" }),
    host: {
      on(name) { if (name === "drawer:target") shots.push(name); },
      players() { return []; },
      setSheetTarget(id) { sheetTarget.value = id; },
      combatTargets() {
        return { selected: "", options: [{ id: "en1", name: "Bandit", label: "Bandit · AC 12" }, { id: "pc1", name: "Ada", label: "Ada" }] };
      },
      getCard(id) {
        if (id === "tok_pc" || id === "pc1") return { id: "pc1", name: "Ada", kind: "pc", dmActsAs: true, attacks: [{ id: "tusk", name: "Tusk", kind: "melee", range: "5 ft", toHit: 5, damage: "2d6+3" }] };
        if (id === "tok_en" || id === "en1") return { id: "en1", name: "Bandit", kind: "enemy", attacks: [] };
        return null;
      }
    },
    options: { scene, assetBase: "", players: () => [], room: { table: { initiative: { order: [], turn: 0 } } } }
  });
  await new Promise((resolve) => setTimeout(resolve, 40));
  map.placeLinkedToken({ id: "tok_pc", combatantId: "pc1", name: "Ada", size: 1, kind: "player", at: { x: 4, y: 4 } });
  map.placeLinkedToken({ id: "tok_en", combatantId: "en1", name: "Bandit", size: 1, kind: "npc", at: { x: 6, y: 4 } });
  map.focusToken("tok_pc");
  const order = [
    { id: "pc1", name: "Ada", kind: "player", playerId: "pc1", lastTargetId: "en1" },
    { id: "en1", name: "Bandit", kind: "enemy" }
  ];
  map.syncCombatants({ started: true, turn: 1, round: 1, order });
  map.syncCombatants({ started: true, turn: 0, round: 2, order });
  await new Promise((resolve) => setTimeout(resolve, 20));
  const sel = el.querySelector('[data-act="cylTarget"]');
  check("n65.mapAims", !!(sel && sel.value === "en1") && shots.length === 0, (sel && sel.value) + " shots=" + shots.length);
  map.syncCombatants({ started: false, turn: 0, round: 1, order: order.map((row) => Object.assign({}, row, { lastTargetId: "" })) });
  map.syncCombatants({ started: true, turn: 0, round: 1, order: order.map((row) => Object.assign({}, row, { lastTargetId: "" })) });
  const cleared = el.querySelector('[data-act="cylTarget"]');
  check("n65.mapCleared", !cleared || cleared.value !== "en1", cleared && cleared.value);
}

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\nN65 ok");

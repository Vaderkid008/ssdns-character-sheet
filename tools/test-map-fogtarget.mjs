/**
 * Fog-aware player targeting (Jessey 2026-10-20 9:52 PM): with fog on, a player's Target list only holds tokens that
 * player can see (party sight by default: every party bubble plus lights; scene.visionMode "own" keeps
 * the viewer's token only; DM reveal/hide shapes; hidden / veiled out), using
 * the same test the token draw loop uses. Past the picked weapon's long range: listed, disabled, "out of range, N ft",
 * token greyed. The DM's map refuses a shot at a token the shooter can't see.
 *   node tools/test-map-fogtarget.mjs
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
function makeWindow() {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost/",
    pretendToBeVisual: true,
    runScripts: "dangerously"
  });
  const w = dom.window;
  const proto = w.HTMLElement.prototype;
  try {
    Object.defineProperty(proto, "clientWidth", { configurable: true, get() { return 800; } });
    Object.defineProperty(proto, "clientHeight", { configurable: true, get() { return 600; } });
  } catch (e) {}
  proto.getBoundingClientRect = function () {
    return { x: 0, y: 0, left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, toJSON() { return {}; } };
  };
  w.__calls = [];
  w.HTMLCanvasElement.prototype.getContext = function () {
    const bag = {};
    return new Proxy(bag, {
      get(t, p) {
        if (p in t) return t[p];
        if (typeof p !== "string") return undefined;
        return function (...args) {
          w.__calls.push([p, args]);
          return bag;
        };
      },
      set(t, p, v) {
        t[p] = v;
        if (p === "strokeStyle" || p === "fillStyle") w.__calls.push([p, [v]]);
        return true;
      }
    });
  };
  w.HTMLImageElement.prototype.decode = function () { return Promise.resolve(); };
  w.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
  return w;
}

function addScript(w, rel) {
  const s = w.document.createElement("script");
  s.textContent = read(rel);
  w.document.body.appendChild(s);
}


const src = read("map/ssdns-map.js");
check("src.oneTest", /function tokenSeenBy\(/.test(src) && src.indexOf("if (!tokenSeenBy(t, sight)) continue;") >= 0 && src.indexOf("const seen = targetSight(id);") >= 0,
  "draw loop and Target list share tokenSeenBy");
check("src.rulesUntouched", read("database.rules.json").indexOf("sight") < 0);

const w = makeWindow();
addScript(w, "assets/js/range-rings.js");
addScript(w, "map/ssdns-map-firebase.js");
addScript(w, "map/ssdns-map.js");
const scene = JSON.parse(read("map/scene-dusty-spur.json"));
delete scene.fogRects; delete scene.fogPolys; delete scene.fogShapes; delete scene.walls;
const store = { pub: {}, dm: {} };
const bus = [];
const SC = "scn_dustyspur01";
function put(t) { store.pub["map/public/tokens/" + t.id] = { value: Object.assign({ size: 1, sceneId: SC }, t), seq: 1 }; }
store.pub["map/public/scenes/" + SC] = { value: { walls: [], fogRects: [], fogRevealed: false, fogShapes: [{ kind: "box", op: "reveal", x: 14, y: 14, w: 3, h: 3 }] }, seq: 1 };
put({ id: "tok_me", name: "Me", label: "Me", kind: "player", ownerUid: "u_me", pos: { x: 5, y: 5 } });
put({ id: "tok_pal", name: "Pal", label: "Pal", kind: "player", ownerUid: "u_pal", pos: { x: 5, y: 12 } });
put({ id: "tok_near", name: "Near", label: "Near", kind: "enemy", combatantId: "en_near", pos: { x: 6, y: 5 } });
put({ id: "tok_dark", name: "Dark", label: "Dark", kind: "enemy", combatantId: "en_dark", pos: { x: 5, y: 13 } });   /* next to Pal only */
put({ id: "tok_lit", name: "Lit", label: "Lit", kind: "enemy", combatantId: "en_lit", torch: true, pos: { x: 25, y: 5 } }); /* own torch, 100 ft */
put({ id: "tok_rev", name: "Rev", label: "Rev", kind: "enemy", combatantId: "en_rev", pos: { x: 9, y: 5 } });   /* 20 ft, fog hides */
put({ id: "tok_box", name: "Boxed", label: "Boxed", kind: "enemy", combatantId: "en_box", pos: { x: 15, y: 15 } }); /* inside a DM reveal box */
put({ id: "tok_hid", name: "Hid", label: "Hid", kind: "enemy", combatantId: "en_hid", hidden: true, pos: { x: 5, y: 6 } });

let weapon = { id: "gun:0", name: "Rifle", weapon: "rifle", range: "30/90", kind: "weapon" };
const targets = ["en_near", "en_dark", "en_lit", "en_rev", "en_box", "en_hid", "u_pal"].map((id) => ({ id: id, label: id }));
const host = {
  on() {},
  rangeWeapons() { return [weapon]; },
  sheetTargets() { return targets; },
  ownCard() { return { name: "Me", attacks: [{ id: "gunroll:0", name: "Rifle", ammo: { cap: 6, loaded: 6 } }], spells: [] }; }
};
const el = w.document.createElement("div");
w.document.body.appendChild(el);
w.__calls = [];
let sightEvents = 0;
w.addEventListener("ssdns-map-sight", () => { sightEvents += 1; });
const pad = w.SSDNSMapFirebase.memory({ role: "player", store, bus });
const player = w.SSDNSMap.create({ el, role: "player", uid: "u_me", adapter: pad, host, options: { scene, assetBase: "", room: { table: { initiative: { order: [], turn: 0 } } } } });
await flush(120);
player.requestDraw && player.requestDraw();
await flush(60);

const drawn = new Set(w.__calls.filter((c) => c[0] === "fillText").map((c) => String(c[1][0])));
const seen = (id) => player.targetSight(id);
check("sight.near", seen("en_near") && seen("en_near").visible === true);
check("sight.dark", seen("en_dark") && seen("en_dark").visible === true, "party sight includes the token beside Pal");
check("sight.lit", seen("en_lit") && seen("en_lit").visible === true, "a torch lights its own 8 squares");
check("sight.fog", seen("en_rev") && seen("en_rev").visible === false);
check("sight.revealBox", seen("en_box") && seen("en_box").visible === true);
check("sight.hidden", !seen("en_hid") || seen("en_hid").visible === false, "players never get a hidden token");
check("draw.sameTest", drawn.has("Near") && drawn.has("Lit") && drawn.has("Boxed") && drawn.has("Dark") && drawn.has("Pal") && !drawn.has("Rev") && !drawn.has("Hid"), [...drawn].join(","));
check("range.lit", seen("en_lit").outOfRange === true && seen("en_lit").feet === 100, JSON.stringify(seen("en_lit")));
check("range.near", seen("en_near").outOfRange === false);
check("range.long", seen("en_box").outOfRange === false && seen("en_box").band === "long", JSON.stringify(seen("en_box")));

const sel = el.querySelector('[data-act="actionSlot"] select');
const opts = sel ? [...sel.options].map((o) => ({ v: o.value, t: o.textContent, off: o.disabled })) : [];
const ids = opts.map((o) => o.v);
check("list.onlySeen", sel && ids.includes("en_near") && ids.includes("en_box") && ids.includes("en_lit") && ids.includes("en_dark") && !ids.includes("en_rev"), JSON.stringify(ids));
check("list.freeShot", ids[0] === "__free");
const lit = opts.find((o) => o.v === "en_lit");
check("list.outOfRange", lit && lit.off === true && /out of range, 100 ft/.test(lit.t), JSON.stringify(lit));
check("list.pal", ids.includes("u_pal"), "Pal is inside the shared party sight");
check("draw.greyWash", w.__calls.some((c) => c[0] === "fillStyle" && c[1][0] === "rgba(110,110,110,0.45)"));

/* weapon switch: a longer gun brings Lit into reach and the list follows */
weapon = { id: "gun:0", name: "Big Rifle", weapon: "bigrifle", range: "80/240", kind: "weapon" };
const before = sightEvents;
player.requestDraw();
await flush(60);
check("switch.inReach", seen("en_lit").outOfRange === false);
const opts2 = [...el.querySelector('[data-act="actionSlot"] select').options];
const lit2 = opts2.find((o) => o.value === "en_lit");
check("switch.listUpdates", lit2 && !lit2.disabled && !/out of range/.test(lit2.textContent) && sightEvents > before);

/* movement: step next to Dark and it shows up */
const mover = w.SSDNSMapFirebase.memory({ role: "dm", store, bus });
await mover.write("map/public/tokens/tok_me", Object.assign({}, store.pub["map/public/tokens/tok_me"].value, { pos: { x: 5, y: 11, by: "dm", seq: Date.now() } }), { seq: Date.now(), by: "dm" });
await flush(120);
const movedSeen = seen("en_dark");
if (movedSeen && movedSeen.visible) {
  check("move.seesDark", true);
  const ids3 = [...el.querySelector('[data-act="actionSlot"] select').options].map((o) => o.value);
  check("move.listUpdates", ids3.includes("en_dark") && !ids3.includes("en_near"), JSON.stringify(ids3));
} else check("move.seesDark", false, JSON.stringify(movedSeen));
player.destroy && player.destroy();

/* DM map: the same test from the shooter's side */
const dmEl = w.document.createElement("div");
w.document.body.appendChild(dmEl);
store.pub["map/public/tokens/tok_me"].value.pos = { x: 5, y: 5 };
const dad = w.SSDNSMapFirebase.memory({ role: "dm", store, bus });
const dm = w.SSDNSMap.create({ el: dmEl, role: "dm", uid: "dm", adapter: dad, host: { on() {}, players() { return []; } },
  options: { scene, tokens: { tokens: {} }, assetBase: "", players: () => [], room: { table: { initiative: { order: [], turn: 0 } } } } });
await flush(120);
check("dm.sees", dm.canPlayerSee("u_me", "en_near") === true && dm.canPlayerSee("u_me", "en_box") === true);
check("dm.partySeesDark", dm.canPlayerSee("u_me", "en_dark") === true, "Me sees Dark through Pal");
check("dm.refuses", dm.canPlayerSee("u_me", "en_hid") === false);
check("dm.palSees", dm.canPlayerSee("u_pal", "en_dark") === true, "Pal stands next to Dark");
check("dm.unknown", dm.canPlayerSee("u_me", "en_nowhere") === null && dm.canPlayerSee("u_me", "__free") === null);
check("dm.viewUnchanged", typeof dm.targetSight === "function" && dm.targetSight("en_dark") === null);
dm.destroy && dm.destroy();

/* Option B: scene.visionMode "own" drops Pal's bubble, so Me no longer sees Dark */
store.pub["map/public/scenes/" + SC].value.visionMode = "own";
const ownEl = w.document.createElement("div");
w.document.body.appendChild(ownEl);
const ownPad = w.SSDNSMapFirebase.memory({ role: "player", store, bus });
const own = w.SSDNSMap.create({ el: ownEl, role: "player", uid: "u_me", adapter: ownPad, host, options: { scene, assetBase: "", room: { table: { initiative: { order: [], turn: 0 } } } } });
await flush(120);
own.requestDraw && own.requestDraw();
await flush(60);
const ownDark = own.targetSight("en_dark");
const ownNear = own.targetSight("en_near");
check("own.darkHidden", ownDark && ownDark.visible === false, JSON.stringify(ownDark));
check("own.nearStill", ownNear && ownNear.visible === true, JSON.stringify(ownNear));
own.destroy && own.destroy();
delete store.pub["map/public/scenes/" + SC].value.visionMode;

/* DMCC: a player attack request at a token the shooter can't see is refused before any damage */
{
  const ledger = [];
  const sandbox = { console, Math, Date, JSON, parseInt, isFinite, Number, String, Object, Array, URL, encodeURIComponent, Promise, setTimeout, clearTimeout };
  sandbox.globalThis = sandbox; sandbox.window = sandbox;
  sandbox.localStorage = { getItem() { return null; }, setItem() {} };
  sandbox.document = { getElementById() { return null; }, addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; },
    createElement() { return { className: "", innerHTML: "", dataset: {}, addEventListener() {}, querySelector() { return { addEventListener() {} }; }, querySelectorAll() { return []; }, setAttribute() {} }; },
    body: { appendChild() {}, classList: { contains() { return false; } } }, activeElement: null };
  const esc = (s) => String(s == null ? "" : s);
  sandbox.DMCC = { $: () => null, $$: () => [], esc, state: { players: {}, ledger: [], rolls: [], demo: true, roomCode: "DUST", uid: "dm", db: null, unsubs: [] },
    toast() {}, uid(p) { return (p || "id") + Math.random(); }, guardFocus(fn) { if (fn) fn(); }, parseDice() { return { total: 4, detail: "4" }; },
    pushCommand() { return Promise.resolve(); }, pushRoll() { return Promise.resolve(); }, pushLedger(row) { ledger.push(row); return Promise.resolve(); }, renderPlayers() {} };
  vm.createContext(sandbox);
  vm.runInContext(read("assets/js/apply-guard.js"), sandbox);
  vm.runInContext(read("assets/js/conditions.js"), sandbox);
  vm.runInContext(read("dm/assets/js/v2.js").replace(/\nwireLookupNow\(\);\s*\nbootV2\(\);\s*$/, "\nglobalThis.__fight = { setOrder: function (r) { fight.order = r; }, applyRequest: applyRequest };\n"), sandbox);
  const enemy = { id: "en_dark", name: "Dark", kind: "enemy", ac: 10, hp: 20, maxHp: 20 };
  sandbox.__fight.setOrder([enemy]);
  let asked = null;
  sandbox.SSDNSMapHost = { playerCanSee(uidIn, tid) { asked = [uidIn, tid]; return tid === "en_dark" ? false : null; } };
  sandbox.__fight.applyRequest({ type: "attack", from: "u_me", characterName: "Me", targetId: "en_dark", hitTotal: 25, nat: 15, amount: 6, rollId: "r1", ts: new Date().toISOString(), weapon: "Rifle", gun: true }, "q1");
  await flush(20);
  check("dmcc.refused", enemy.hp === 20 && ledger.some((r) => /can't see that target \(fog\)/.test(r.what)), JSON.stringify(ledger.map((r) => r.what)));
  check("dmcc.askedMap", asked && asked[0] === "u_me" && asked[1] === "en_dark");
  sandbox.SSDNSMapHost = { playerCanSee() { return true; } };
  sandbox.__fight.applyRequest({ type: "attack", from: "u_me", characterName: "Me", targetId: "en_dark", hitTotal: 25, nat: 15, amount: 6, rollId: "r2", ts: new Date().toISOString(), weapon: "Rifle", gun: true }, "q2");
  await flush(20);
  check("dmcc.seenHits", enemy.hp < 20, String(enemy.hp));
}

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\nfog targeting ok");

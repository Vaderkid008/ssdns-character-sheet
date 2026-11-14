/**
 * Interact collects into the sheet, drops back onto the map, and lockpicks a DM DC.
 * Sheet 0.3.307 / DMCC 0.2.320.
 *   node tools/test-interact-items-03279.mjs
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
function flush(ms) { return new Promise((r) => setTimeout(r, ms)); }

const ver = JSON.parse(read("version.json"));
check("ver", ver.sheet === "0.3.307" && ver.dmcc === "0.2.320" && ver.sheetBuild === "sheet-playtest-v03307" && ver.dmccBuild === "dmcc-playtest-v02320");
check("rules.clean", !read("assets/data/rules.js").includes("0.3.307") && !read("database.rules.json").includes("0.3.307"));
check("rules.toolsUse", /thieves' tools to disarm a trap or open a lock/.test(read("assets/data/rules.js")));
check("heat.line", read("assets/js/spell-riders.js").includes("leaves inventory") && !read("assets/js/spell-riders.js").includes("Nothing leaves inventory"));
check("heat.command", read("dm/assets/js/v2.js").includes('type: "take_gear"') && read("dm/assets/js/v2.js").includes("function dropHeldWeapon"));
check("race.taken", read("dm/assets/js/loot-give.js").includes('if (box.taken) { toast("Already taken."); return; }'));
check("map.collect", read("map/ssdns-map.js").includes("function collectMapLoot") && read("map/ssdns-map.js").includes("Already taken.") && read("map/ssdns-map.js").includes("function placeLockedChest") && read("map/ssdns-map.js").includes("function dropCarriedItem"));

const sb = { console }; sb.window = sb; vm.createContext(sb);
vm.runInContext(read("assets/js/loot.js"), sb);
const L = sb.SSDNSLoot;
const sheet = { abilities: { DEX: 14 }, prof: 2, thievesTools: true, items: [] };
const locked = { id: "box1", name: "Chest", contents: [{ id: "trail-rations", name: "Trail rations", qty: 1 }], cash: { es: 0, black: 0 }, lock: { dc: 15, unlocked: false, jammed: false, jamOnFail: false }, log: [] };
const fail = L.resolve(locked, "lockpick-yes", sheet, () => 1, { nat: 10 });
check("lock.fail", fail.success === false && locked.lock.unlocked === false && fail.total === 14 && /Still locked/.test((locked.log || []).join(" ")), JSON.stringify(fail));
const okPick = L.resolve(locked, "lockpick-yes", sheet, () => 1, { nat: 12 });
check("lock.ok", okPick.success === true && locked.lock.unlocked === true && okPick.total === 16);
const bare = { abilities: { DEX: 14 }, prof: 2, items: [] };
const gate = { lock: { dc: 15, unlocked: false, attempts: {} }, log: [] };
const noTools = L.pickLock(gate, bare, "ada", () => 0.5);
check("pick.needsTools", noTools.noTools === true && gate.lock.unlocked === false && !gate.lock.attempts.ada);
const once = { lock: { dc: 15, unlocked: false, attempts: {}, allowRetries: false }, log: [] };
const first = L.pickLock(once, sheet, "ada", () => 0, { nat: 10 });
const second = L.pickLock(once, sheet, "ada", () => 0, { nat: 20 });
check("pick.once", first.success === false && first.total === 14 && second.already === true && once.lock.unlocked === false);
once.lock.allowRetries = true;
const third = L.pickLock(once, sheet, "ada", () => 0, { nat: 20 });
check("pick.retry", third.success === true && once.lock.unlocked === true && third.total === 24);
const untrained = { abilities: { DEX: 16 }, prof: 3, thievesTools: false, items: [{ catalogId: "thieves-tools-lock-picks", name: "Thieves' tools", count: 1 }] };
const held = { lock: { dc: 10, unlocked: false, attempts: {} }, log: [] };
const heldRoll = L.pickLock(held, untrained, "bev", () => 0, { nat: 8 });
check("pick.toolsNoProf", heldRoll.success === true && heldRoll.total === 11 && !/tools/.test(heldRoll.line));
L.resetLockAttempts(once);
check("pick.reset", once.lock.attempts && !once.lock.attempts.ada);

const box = { id: "box2", name: "Saddlebag", taken: false, opener: "", contents: [{ id: "trail-rations", name: "Trail rations", qty: 1, taken: false }], cash: { es: 0, black: 0 }, lock: { dc: 0, unlocked: true }, log: [], reveal: "everyone", shared: true };
const who = { items: [], ammo: [], guns: [], es: 0 };
const took = L.takeAll(box, "ada", who);
L.applyTake(who, took);
check("take.lands", took.ok === true && box.taken === true && who.items.some((it) => it.name === "Trail rations"));
const again = L.takeAll(box, "ada", who);
check("take.once", again.ok === false && again.reason === "Already taken." && who.items.length === 1);

const store = { pub: {}, dm: {} };
const bus = [];
const fbSrc = read("map/ssdns-map-firebase.js");
const mem = { console }; mem.window = mem; vm.createContext(mem);
vm.runInContext(fbSrc, mem);
const ada = mem.SSDNSMapFirebase.memory({ role: "player", store, bus, uid: "ada" });
const bev = mem.SSDNSMapFirebase.memory({ role: "player", store, bus, uid: "bev" });
function freshBox() {
  return {
    id: "chest-race",
    name: "Chest",
    taken: false,
    contents: [
      { id: "trail-rations", name: "Trail rations", qty: 1 },
      { id: "waterskin", name: "Waterskin", qty: 1 }
    ],
    cash: { es: 0, black: 0 },
    lock: { dc: 0, unlocked: true },
    reveal: "everyone",
    shared: true
  };
}
const boxA = freshBox();
const boxB = freshBox();
const sheetA = { items: [], ammo: [], guns: [], es: 0 };
const sheetB = { items: [], ammo: [], guns: [], es: 0 };
const [one, two] = await Promise.all([
  L.claimTake(boxA, "ada", null, (path, value) => ada.claim(path, value)),
  L.claimTake(boxB, "bev", null, (path, value) => bev.claim(path, value))
]);
const winner = one.ok ? one : two;
const loser = one.ok ? two : one;
if (winner.ok) L.applyTake(one.ok ? sheetA : sheetB, winner);
check("race.oneWins", one.ok !== two.ok && loser.reason === "Gone." && (one.ok ? sheetA : sheetB).items.length === 2 && (one.ok ? sheetB : sheetA).items.length === 0, JSON.stringify({ one: one.ok, two: two.ok, reason: loser.reason }));
const winnerBox = one.ok ? boxA : boxB;
const winnerWho = one.ok ? "ada" : "bev";
const repeat = await L.claimTake(winnerBox, winnerWho, null, (path, value) => (one.ok ? ada : bev).claim(path, value));
check("race.idempotent", repeat.ok === false && repeat.reason === "Already taken." && sheetA.items.length + sheetB.items.length === 2, repeat.reason);

const rowBoxA = freshBox();
const rowBoxB = freshBox();
rowBoxA.id = "chest-row";
rowBoxB.id = "chest-row";
const rowSheetA = { items: [], ammo: [], guns: [], es: 0 };
const rowSheetB = { items: [], ammo: [], guns: [], es: 0 };
const [rowOne, rowTwo] = await Promise.all([
  L.claimTake(rowBoxA, "ada", [rowBoxA.contents[0]], (path, value) => ada.claim(path, value)),
  L.claimTake(rowBoxB, "bev", [rowBoxB.contents[0]], (path, value) => bev.claim(path, value))
]);
const rowWinner = rowOne.ok ? rowOne : rowTwo;
if (rowWinner.ok) L.applyTake(rowOne.ok ? rowSheetA : rowSheetB, rowWinner);
const rowLoser = rowOne.ok ? rowTwo : rowOne;
const rowLoserBox = rowOne.ok ? rowBoxB : rowBoxA;
check("race.row", rowOne.ok !== rowTwo.ok && rowLoser.reason === "Gone." && (rowOne.ok ? rowSheetA : rowSheetB).items.length === 1 && (rowOne.ok ? rowSheetB : rowSheetA).items.length === 0 && rowLoserBox.contents[0].taken === true);

function fakeFirebase() {
  const tree = {};
  function clone(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }
  function get(p) {
    return String(p).split("/").filter(Boolean).reduce((cur, part) => (cur && typeof cur === "object" ? cur[part] : null), tree) || null;
  }
  function setPath(p, value) {
    const parts = String(p).split("/").filter(Boolean);
    let cur = tree;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!cur[parts[i]] || typeof cur[parts[i]] !== "object") cur[parts[i]] = {};
      cur = cur[parts[i]];
    }
    cur[parts[parts.length - 1]] = clone(value);
  }
  const queued = [];
  let flushing = false;
  const fb = {
    ref(_db, p) { return { path: p }; },
    runTransaction(r, fn) {
      return new Promise((resolve) => {
        queued.push({ r, fn, resolve });
        if (flushing) return;
        flushing = true;
        Promise.resolve().then(() => {
          const batch = queued.splice(0);
          flushing = false;
          const snap = clone(get(batch[0].r.path));
          let committed = false;
          batch.forEach((job) => {
            let next = job.fn(committed ? clone(get(job.r.path)) : snap);
            if (committed && next !== undefined) next = job.fn(clone(get(job.r.path)));
            if (next === undefined) job.resolve({ committed: false });
            else {
              setPath(job.r.path, next);
              committed = true;
              job.resolve({ committed: true });
            }
          });
        });
      });
    }
  };
  return { fb, get };
}
const live = fakeFirebase();
const adaLive = mem.SSDNSMapFirebase.create({ db: {}, fb: live.fb, roomCode: "ROOM", uid: "ada", role: "player" });
const bevLive = mem.SSDNSMapFirebase.create({ db: {}, fb: live.fb, roomCode: "ROOM", uid: "bev", role: "player" });
const liveA = freshBox();
const liveB = freshBox();
liveA.id = "chest-live";
liveB.id = "chest-live";
const [liveOne, liveTwo] = await Promise.all([
  L.claimTake(liveA, "ada", [liveA.contents[0]], (path, value) => adaLive.claim(path, value)),
  L.claimTake(liveB, "bev", [liveB.contents[0]], (path, value) => bevLive.claim(path, value))
]);
check("race.transaction", liveOne.ok !== liveTwo.ok && (liveOne.ok ? liveTwo : liveOne).reason === "Gone.", JSON.stringify({ one: liveOne.ok, two: liveTwo.ok, a: liveOne.reason, b: liveTwo.reason }));

function makeWindow() {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/dm/", pretendToBeVisual: true, runScripts: "dangerously" });
  const w = dom.window;
  const proto = w.HTMLElement.prototype;
  Object.defineProperty(proto, "clientWidth", { configurable: true, get() { return 800; } });
  Object.defineProperty(proto, "clientHeight", { configurable: true, get() { return 600; } });
  Object.defineProperty(w.HTMLCanvasElement.prototype, "clientWidth", { configurable: true, get() { return 800; } });
  Object.defineProperty(w.HTMLCanvasElement.prototype, "clientHeight", { configurable: true, get() { return 600; } });
  proto.getBoundingClientRect = function () { return { x: 0, y: 0, left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, toJSON() { return {}; } }; };
  w.HTMLCanvasElement.prototype.getContext = function () {
    const bag = {};
    return new Proxy(bag, { get(t, p) { if (p in t) return t[p]; if (typeof p !== "string") return undefined; return function () { return bag; }; }, set(t, p, v) { t[p] = v; return true; } });
  };
  w.HTMLImageElement.prototype.decode = function () { return Promise.resolve(); };
  w.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
  w.SSDNSApp = { doc() { return { character: { items: [{ catalogId: "trail-rations", name: "Trail rations", count: 1 }], ammo: [], guns: [], es: 0 } }; } };
  return w;
}
const w = makeWindow();
["assets/js/loot.js", "assets/js/items.js", "map/token-crop.js", "map/ssdns-map-firebase.js", "map/map-packs.js", "map/ssdns-map.js"].forEach((rel) => {
  const s = w.document.createElement("script");
  s.textContent = read(rel);
  w.document.body.appendChild(s);
});
const scene = JSON.parse(read("map/scene-dusty-spur.json"));
const mapStore = { pub: {}, dm: {} }, mapBus = [];
const ad = w.SSDNSMapFirebase.memory({ role: "dm", store: mapStore, bus: mapBus });
const el = w.document.createElement("div");
w.document.body.appendChild(el);
w.SSDNSMap.create({
  el, role: "dm", uid: "dm", adapter: ad, host: { players() { return []; } },
  options: { scene, tokens: { tokens: {} }, assetBase: "../map/", players: () => [], room: { table: { initiative: { order: [], turn: 0 } } } }
});
await flush(60);
el.querySelector('[data-act="doorLockDc"]').value = "15";
el.querySelector('[data-act="placeChestBtn"]').click();
await flush(20);
const chests = Object.keys(mapStore.pub).filter((k) => k.indexOf("map/public/tokens/") === 0).map((k) => mapStore.pub[k].value).filter((t) => t && t.kind === "chest");
const lock = chests[0] && chests[0].lootLock && chests[0].lootLock.lock;
check("chest.placed", chests.length === 1 && lock && lock.dc === 15 && lock.difficulty === "medium" && lock.unlocked === false, JSON.stringify(chests[0] && chests[0].lootLock));
const presets = ["easy", "medium", "hard"].map((id) => el.querySelector('[data-lock-preset="' + id + '"]'));
check("dc.presets", presets.every(Boolean) && el.querySelector('[data-lock-preset="medium"]').classList.contains("is-on"));
presets[2].click();
await flush(20);
const hard = Object.keys(mapStore.pub).filter((k) => k.indexOf("map/public/tokens/") === 0).map((k) => mapStore.pub[k].value).find((t) => t && t.kind === "chest");
check("dc.hard", hard && hard.lootLock && hard.lootLock.lock && hard.lootLock.lock.dc === 20 && hard.lootLock.lock.difficulty === "hard" && el.querySelector('[data-act="chestLockDc"]').value === "20");
const field = el.querySelector('[data-act="chestLockDc"]');
field.value = "18";
field.dispatchEvent(new w.Event("change", { bubbles: true }));
await flush(20);
const custom = Object.keys(mapStore.pub).filter((k) => k.indexOf("map/public/tokens/") === 0).map((k) => mapStore.pub[k].value).find((t) => t && t.kind === "chest");
check("dc.custom", custom && custom.lootLock.lock.dc === 18 && custom.lootLock.lock.difficulty === "custom" && !el.querySelector('[data-lock-preset="hard"]').classList.contains("is-on"));
const playerBox = { id: custom.loot.id || custom.lootBoxId, lock: { dc: custom.loot.lock.dc, unlocked: false, attempts: {} }, log: [] };
const rolled = L.pickLock(playerBox, { abilities: { DEX: 16 }, prof: 3, thievesTools: true }, "ada", () => 0, { nat: 10 });
check("dc.liveRoll", rolled.dc === 18 && rolled.total === 16 && rolled.success === false && /vs DC 18/.test(rolled.line), rolled.line);

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\nall passed");
process.exit(0);

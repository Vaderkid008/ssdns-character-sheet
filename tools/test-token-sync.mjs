/**
 * Two clients share one fake RTDB (deliverTree, not the memory adapter).
 * DM move reaches the player, a player move reaches the DM, join, reload,
 * An explicit link keeps the new token's square on ply_<id>.
 * A legacy duplicate is still removed in favour of the old canonical id.
 *
 *   node tools/test-token-sync.mjs
 */
import fs from "node:fs";
import path from "node:path";
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

function fakeFirebase() {
  const tree = {};
  const listeners = [];
  function clone(v) {
    if (v == null || typeof v !== "object") return v;
    return JSON.parse(JSON.stringify(v));
  }
  function get(p) {
    const parts = String(p).split("/").filter(Boolean);
    let cur = tree;
    for (const part of parts) {
      if (!cur || typeof cur !== "object" || !(part in cur)) return null;
      cur = cur[part];
    }
    return cur;
  }
  function setPath(p, value) {
    const parts = String(p).split("/").filter(Boolean);
    let cur = tree;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!cur[parts[i]] || typeof cur[parts[i]] !== "object") cur[parts[i]] = {};
      cur = cur[parts[i]];
    }
    const leaf = parts[parts.length - 1];
    if (value == null) delete cur[leaf];
    else cur[leaf] = clone(value);
  }
  function notify(p) {
    listeners.forEach((l) => {
      if (p === l.path || p.startsWith(l.path + "/") || l.path.startsWith(p + "/")) {
        l.cb({ val: () => clone(get(l.path)) });
      }
    });
  }
  const fb = {
    ref(_db, p) { return { path: p }; },
    onValue(r, cb) {
      const entry = { path: r.path, cb };
      listeners.push(entry);
      cb({ val: () => clone(get(r.path)) });
      return () => {
        const i = listeners.indexOf(entry);
        if (i >= 0) listeners.splice(i, 1);
      };
    },
    runTransaction(r, fn) {
      const next = fn(clone(get(r.path)));
      if (next === undefined) return Promise.resolve({ committed: false });
      setPath(r.path, next);
      notify(r.path);
      return Promise.resolve({ committed: true });
    },
    set(r, value) {
      setPath(r.path, value);
      notify(r.path);
      return Promise.resolve();
    },
    remove(r) {
      setPath(r.path, null);
      notify(r.path);
      return Promise.resolve();
    },
    get(r) {
      const val = clone(get(r.path));
      return Promise.resolve({ exists: () => val != null, val: () => val });
    }
  };
  return { fb, get };
}

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
  w.HTMLCanvasElement.prototype.getContext = function () {
    const texts = [];
    this.__texts = texts;
    const bag = {};
    return new Proxy(bag, {
      get(t, p) {
        if (p === "fillText") return (text, x, y) => { texts.push({ text: String(text), x: x, y: y }); };
        if (p === "clearRect") return () => { texts.push({ frame: true }); };
        if (p in t) return t[p];
        if (typeof p !== "string") return undefined;
        return function () { return bag; };
      },
      set(t, p, v) { t[p] = v; return true; }
    });
  };
  w.HTMLImageElement.prototype.decode = function () { return Promise.resolve(); };
  w.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
  let rafN = 0;
  w.requestAnimationFrame = (fn) => {
    rafN += 1;
    const id = rafN;
    queueMicrotask(() => fn(id));
    return id;
  };
  w.cancelAnimationFrame = () => {};
  w.confirm = () => true;
  return w;
}

function addScript(w, rel) {
  const s = w.document.createElement("script");
  s.textContent = read(rel);
  w.document.body.appendChild(s);
}

function pointer(w, el, type, x, y) {
  const Ev = w.PointerEvent || w.MouseEvent;
  const ev = new Ev(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    screenX: x,
    screenY: y,
    pointerId: 1,
    button: 0,
    buttons: type === "pointerup" ? 0 : 1
  });
  if (ev.pointerId == null) {
    try { Object.defineProperty(ev, "pointerId", { value: 1 }); } catch (e) {}
  }
  el.dispatchEvent(ev);
}

function drag(w, canvas, x1, y1, x2, y2) {
  pointer(w, canvas, "pointerdown", x1, y1);
  pointer(w, canvas, "pointermove", x2, y2);
  pointer(w, canvas, "pointerup", x2, y2);
}

function lastFrame(canvas) {
  const texts = canvas && canvas.__texts || [];
  let start = 0;
  texts.forEach((row, i) => { if (row.frame) start = i + 1; });
  return texts.slice(start).filter((row) => !row.frame);
}

function labelAt(canvas, name) {
  const hits = lastFrame(canvas).filter((row) => row.text === name);
  return hits.length ? hits[hits.length - 1] : null;
}

function publicBag(fake, room) {
  return fake.get("rooms/" + room + "/map/public/tokens") || {};
}

async function bootMap(w, opts) {
  const el = w.document.createElement("div");
  el.id = opts.id;
  w.document.body.appendChild(el);
  const api = w.SSDNSMap.create({
    el,
    role: opts.role,
    uid: opts.uid,
    adapter: w.SSDNSMapFirebase.create({
      db: {},
      fb: opts.fb,
      roomCode: opts.room,
      role: opts.role
    }),
    host: opts.host || {},
    options: opts.options
  });
  await flush(40);
  return { el, api };
}

const scene = JSON.parse(read("map/scene-dusty-spur.json"));
const w = makeWindow();
addScript(w, "map/ssdns-map-firebase.js");
addScript(w, "map/ssdns-map.js");

const live = fakeFirebase();
const players = [];
const roomOpts = {
  scene,
  tokens: { tokens: {} },
  assetBase: "",
  players: () => players,
  room: { table: { initiative: { order: [], turn: 0 } } }
};

const dm = await bootMap(w, {
  id: "dmMap",
  role: "dm",
  uid: "dm",
  fb: live.fb,
  room: "DUST",
  host: { players: () => players },
  options: roomOpts
});
const player = await bootMap(w, {
  id: "plMap",
  role: "player",
  uid: "wade",
  fb: live.fb,
  room: "DUST",
  options: { scene, assetBase: "", room: roomOpts.room }
});

check("join.before", Object.keys(publicBag(live, "DUST")).length === 0, Object.keys(publicBag(live, "DUST")).join(","));
players.push({ uid: "wade", name: "Wade" });
dm.api.refreshPlayers();
await flush(20);

const joined = publicBag(live, "DUST");
const joinedIds = Object.keys(joined);
const ply = joined.ply_wade;
check("join.one", joinedIds.length === 1 && joinedIds[0] === "ply_wade" && ply && ply.ownerUid === "wade", joinedIds.join(","));
const plCanvas = player.el.querySelector("canvas");
const dmCanvas = dm.el.querySelector("canvas");
const joinedLabel = labelAt(plCanvas, "Wade");
check("join.playerSees", !!(joinedLabel && ply && ply.pos && ply.pos.x === 13 && ply.pos.y === 10), JSON.stringify({ label: joinedLabel, pos: ply && ply.pos }));

const beforeDm = labelAt(plCanvas, "Wade");
drag(w, dmCanvas, 295, 335, 365, 335);
await flush(20);
const afterDm = publicBag(live, "DUST").ply_wade;
const afterDmLabel = labelAt(plCanvas, "Wade");
check("move.dmToPlayer", !!(afterDm && afterDm.pos && afterDm.pos.x === 14 && afterDm.pos.y === 10 && afterDmLabel && beforeDm && afterDmLabel.x > beforeDm.x + 40), JSON.stringify({ pos: afterDm && afterDm.pos, from: beforeDm, to: afterDmLabel }));

const beforePl = labelAt(dmCanvas, "Wade");
drag(w, plCanvas, 365, 335, 365, 405);
await flush(20);
const afterPl = publicBag(live, "DUST").ply_wade;
const afterPlLabel = labelAt(dmCanvas, "Wade");
check("move.playerToDm", !!(afterPl && afterPl.pos && afterPl.pos.x === 14 && afterPl.pos.y === 11 && afterPlLabel && beforePl && afterPlLabel.y > beforePl.y + 40), JSON.stringify({ pos: afterPl && afterPl.pos, from: beforePl, to: afterPlLabel }));
check("move.stillOne", Object.keys(publicBag(live, "DUST")).length === 1, Object.keys(publicBag(live, "DUST")).join(","));

dm.api.destroy();
const dm2 = await bootMap(w, {
  id: "dmReload",
  role: "dm",
  uid: "dm",
  fb: live.fb,
  room: "DUST",
  host: { players: () => players },
  options: roomOpts
});
await flush(20);
const reloaded = publicBag(live, "DUST");
const reloadedIds = Object.keys(reloaded);
check("reload.one", reloadedIds.length === 1 && reloadedIds[0] === "ply_wade" && reloaded.ply_wade.pos.x === 14 && reloaded.ply_wade.pos.y === 11, JSON.stringify({ ids: reloadedIds, pos: reloaded.ply_wade && reloaded.ply_wade.pos }));
player.api.destroy();
const player2 = await bootMap(w, {
  id: "plReload",
  role: "player",
  uid: "wade",
  fb: live.fb,
  room: "DUST",
  options: { scene, assetBase: "", room: roomOpts.room }
});
await flush(20);
check("reload.playerStillOne", Object.keys(publicBag(live, "DUST")).length === 1 && !!labelAt(player2.el.querySelector("canvas"), "Wade"), Object.keys(publicBag(live, "DUST")).join(","));

const addBtn = dm2.el.querySelector('[data-act="addTokenBtn"]');
addBtn.click();
await flush(20);
const withEnemy = publicBag(live, "DUST");
const enemyId = Object.keys(withEnemy).find((id) => id !== "ply_wade");
const enemyPos = enemyId && withEnemy[enemyId] && withEnemy[enemyId].pos;
check("link.extra", !!enemyId && enemyId.indexOf("tok_") === 0 && !!(enemyPos && (enemyPos.x !== 14 || enemyPos.y !== 11)), Object.keys(withEnemy).join(","));
dm2.api.applyLink(enemyId, {
  ownerUid: "wade",
  kind: "player",
  name: "Wade",
  label: "Wade",
  combatantId: "wade",
  sheetId: "wade"
});
await flush(20);
const linked = publicBag(live, "DUST");
const linkedIds = Object.keys(linked);
const linkFrame = lastFrame(player2.el.querySelector("canvas")).filter((row) => row.text === "Wade");
/* B2: an explicit link keeps the new token's square. dedupe.one below still keeps the old id. */
check("link.reuses", linkedIds.length === 1 && linkedIds[0] === "ply_wade" && enemyPos && linked.ply_wade.pos.x === enemyPos.x && linked.ply_wade.pos.y === enemyPos.y && linkFrame.length === 1, JSON.stringify({ ids: linkedIds, pos: linked.ply_wade && linked.ply_wade.pos, enemyPos, labels: linkFrame.length }));

const dupe = fakeFirebase();
const ada = "ada.b";
const adaId = "ply_ada_b";
function seed(id, pos) {
  const row = {
    id: id,
    pos: pos,
    ownerUid: ada,
    name: "Ada",
    label: "Ada",
    ownerCanMove: true,
    size: 1,
    kind: "player",
    combatantId: ada,
    sheetId: ada,
    sceneId: "scn_dustyspur01"
  };
  dupe.fb.set(dupe.fb.ref(null, "rooms/DUPE/map/public/tokens/" + id), row);
  dupe.fb.set(dupe.fb.ref(null, "rooms/DUPE/map/dm/tokens/" + id), row);
}
seed("tok_legacy", { x: 2, y: 2 });
seed(adaId, { x: 8, y: 9 });
const adaPlayers = [{ uid: ada, name: "Ada" }];
const dupeDm = await bootMap(w, {
  id: "dupeDm",
  role: "dm",
  uid: "dm",
  fb: dupe.fb,
  room: "DUPE",
  host: { players: () => adaPlayers },
  options: {
    scene,
    tokens: { tokens: {} },
    assetBase: "",
    players: () => adaPlayers,
    room: roomOpts.room
  }
});
await flush(30);
const cleaned = publicBag(dupe, "DUPE");
const cleanedIds = Object.keys(cleaned);
check("dedupe.one", cleanedIds.length === 1 && cleanedIds[0] === adaId && cleaned[adaId].pos.x === 8 && cleaned[adaId].pos.y === 9 && cleaned[adaId].ownerUid === ada, JSON.stringify({ ids: cleanedIds, pos: cleaned[adaId] && cleaned[adaId].pos }));
dupeDm.api.destroy();
dm2.api.destroy();
player2.api.destroy();

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("token-sync ok");

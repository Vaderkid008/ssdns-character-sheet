/**
 * Map tab regression for m2-v3.1.
 * Adapter seq/stale and child paths, DM and player map mechanics,
 * leak check, and drag write counts.
 *
 *   node tools/test-map-m2.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const results = { adapter: {}, map: { dm: {}, player: {} }, leak: {}, writes: {}, host: {}, consoleErrors: [] };

function check(id, cond, detail) {
  results[id] = cond ? "pass" : "fail";
  if (!cond) failures.push(id + (detail ? " — " + detail : ""));
}

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function walkKeys(value, found, depth) {
  if (!value || typeof value !== "object" || depth > 8) return;
  Object.keys(value).forEach((k) => {
    found.add(k);
    walkKeys(value[k], found, depth + 1);
  });
}

function secretKeys(value) {
  const found = new Set();
  walkKeys(value, found, 0);
  return ["hp", "maxHp", "ac", "notes", "hidden"].filter((k) => found.has(k));
}

function flush(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  w.ResizeObserver = class {
    constructor(cb) { this.cb = cb; }
    observe() { try { this.cb(); } catch (e) {} }
    disconnect() {}
    unobserve() {}
  };
  w.fetch = async function (url) {
    const name = String(url).split("/").pop();
    const file = name.endsWith(".json") ? path.join(root, "map", name) : "";
    if (!file || !fs.existsSync(file)) {
      return { ok: false, status: 404, json: async () => { throw new Error("missing " + url); } };
    }
    return { ok: true, status: 200, json: async () => JSON.parse(fs.readFileSync(file, "utf8")) };
  };
  const errors = [];
  const orig = w.console.error.bind(w.console);
  w.console.error = (...args) => {
    errors.push(args.map((a) => (a && a.stack) || String(a)).join(" "));
  };
  w.__errors = errors;
  w.__origError = orig;
  return w;
}

function addScript(w, rel) {
  const s = w.document.createElement("script");
  s.textContent = read(rel);
  w.document.body.appendChild(s);
}

function pointer(w, el, type, x, y, extra) {
  const init = Object.assign({
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    screenX: x,
    screenY: y,
    pointerId: 1,
    button: 0,
    buttons: 1,
    altKey: false,
    ctrlKey: false,
    shiftKey: false,
    deltaY: 0
  }, extra || {});
  const Ev = type === "wheel" ? w.WheelEvent : (w.PointerEvent || w.MouseEvent);
  const ev = new Ev(type, init);
  if (ev.pointerId == null) {
    try { Object.defineProperty(ev, "pointerId", { value: init.pointerId }); } catch (e) {}
  }
  el.dispatchEvent(ev);
  return ev;
}

function act(el, name) {
  return el.querySelector('[data-act="' + name + '"]');
}

function spy(inner) {
  const log = [];
  return {
    log,
    subscribe(path, cb) {
      log.push({ op: "subscribe", path });
      return inner.subscribe(path, (value, meta) => {
        let snap = value;
        try { snap = JSON.parse(JSON.stringify(value)); } catch (e) {}
        log.push({ op: "event", path: (meta && meta.path) || path, value: snap });
        cb(value, meta);
      });
    },
    write(path, value, meta) {
      log.push({ op: "write", path, value, meta });
      return inner.write(path, value, meta);
    },
    remove(path) {
      log.push({ op: "remove", path });
      return inner.remove(path);
    }
  };
}

function writesSince(log, mark) {
  return log.slice(mark).filter((e) => e.op === "write" || e.op === "remove");
}

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
    }
  };
  return { fb, get };
}

async function testAdapter(w) {
  const F = w.SSDNSMapFirebase;
  const store = { pub: {}, dm: {} };
  const bus = [];
  const dropped = [];
  const mem = F.memory({
    role: "dm",
    store,
    bus,
    onWrite(path, value) { dropped.push({ path, value }); }
  });
  const stale1 = await mem.write("map/public/tokens/a", { id: "a", seq: 10 }, { seq: 10, by: "dm" });
  const stale2 = await mem.write("map/public/tokens/a", { id: "a", seq: 3, hp: 1 }, { seq: 3, by: "dm" });
  check("adapter.staleSeq", stale1.ok === true && stale2.dropped === true && store.pub["map/public/tokens/a"].value.seq === 10 && !store.pub["map/public/tokens/a"].value.hp, JSON.stringify(stale2));

  const events = [];
  mem.subscribe("map/public/tokens", (value, meta) => events.push({ path: meta.path, value }));
  await mem.write("map/public/tokens/tok/pos", { x: 2, y: 3, by: "p1", seq: 20 }, { seq: 20, by: "p1" });
  const posEv = events.filter((e) => e.path === "map/public/tokens/tok/pos");
  check("adapter.childPath", posEv.length === 1 && posEv[0].value.x === 2 && posEv[0].value.by === "p1", JSON.stringify(posEv));

  const player = F.memory({ role: "player", store, bus });
  let dmHits = 0;
  player.subscribe("map/dm/tokens", () => { dmHits += 1; });
  await player.write("map/dm/tokens/secret", { hp: 9, notes: "nope" }, { seq: 1, by: "p1" });
  check("adapter.playerDmBlocked", dmHits === 0 && !store.dm["map/dm/tokens/secret"], "hits " + dmHits);

  const fake = fakeFirebase();
  fake.fb.set(fake.fb.ref(null, "rooms/DUST/chat"), {
    b: { id: "b", ts: "2026-10-12T00:00:02.000Z", from: "p", text: "second" },
    a: { id: "a", ts: "2026-10-12T00:00:01.000Z", from: "dm", text: "first" }
  });
  fake.fb.set(fake.fb.ref(null, "rooms/DUST/tableFeed"), {
    f1: { id: "f1", ts: "2026-10-12T00:00:01.000Z", from: "p", text: "hit" }
  });
  const live = F.create({ db: {}, fb: fake.fb, roomCode: "DUST", uid: "dm-uid", role: "dm" });
  const chat = [];
  const feed = [];
  const toks = [];
  live.subscribe("chat", (rows) => chat.push(rows.map((r) => r.id)));
  live.subscribe("tableFeed", (row) => feed.push(row.id));
  live.subscribe("map/public/tokens", (value, meta) => toks.push(meta.path));
  check("adapter.chatOrder", chat.length === 1 && chat[0][0] === "a" && chat[0][1] === "b", JSON.stringify(chat));
  const again = await live.write("map/public/tokens/tok", { id: "tok", name: "J", pos: { x: 1, y: 1 }, seq: 5 }, { seq: 5, by: "dm" });
  const older = await live.write("map/public/tokens/tok", { id: "tok", seq: 2, hp: 4 }, { seq: 2, by: "dm" });
  const pos = await live.write("map/public/tokens/tok/pos", { x: 4, y: 5, by: "p_jolene", seq: 8 }, { seq: 8, by: "p_jolene" });
  check("adapter.firebaseStale", again.ok === true && older.dropped === true && pos.ok === true, JSON.stringify({ again, older, pos }));
  check("adapter.firebasePosPath", toks.indexOf("map/public/tokens/tok/pos") >= 0, toks.join(","));
  const stored = fake.get("rooms/DUST/map/public/tokens/tok");
  check("adapter.firebaseKeepsNewer", stored && stored.seq === 5 && stored.hp == null, JSON.stringify(stored));
  const playerLive = F.create({ db: {}, fb: fake.fb, roomCode: "DUST", uid: "p", role: "player" });
  let playerDm = 0;
  playerLive.subscribe("map/dm/tokens", () => { playerDm += 1; });
  await playerLive.write("map/dm/tokens/x", { hp: 1 }, { seq: 1, by: "p" });
  check("adapter.firebasePlayerDm", playerDm === 0 && fake.get("rooms/DUST/map/dm/tokens/x") == null, "subs " + playerDm);
  results.adapter = {
    staleSeq: results["adapter.staleSeq"],
    childPath: results["adapter.childPath"],
    playerDmBlocked: results["adapter.playerDmBlocked"],
    chatOrder: results["adapter.chatOrder"],
    firebaseStale: results["adapter.firebaseStale"],
    firebasePosPath: results["adapter.firebasePosPath"]
  };
}

async function bootMap(w, opts) {
  const el = w.document.createElement("div");
  el.id = opts.id || "map";
  w.document.body.appendChild(el);
  const api = w.SSDNSMap.create({
    el,
    role: opts.role,
    uid: opts.uid,
    adapter: opts.adapter,
    host: opts.host || {},
    options: opts.options
  });
  await flush(80);
  return { el, api };
}

async function testMaps(w) {
  addScript(w, "map/ssdns-map-firebase.js");
  addScript(w, "map/ssdns-map.js");
  const scene = JSON.parse(read("map/scene-dusty-spur.json"));
  const tokens = JSON.parse(read("map/tokens.json"));
  const store = { pub: {}, dm: {} };
  const bus = [];
  const players = [
    { uid: "p_jolene", name: "Jolene" },
    { uid: "p_mira", name: "Mira" }
  ];
  const dmInner = w.SSDNSMapFirebase.memory({ role: "dm", store, bus });
  const plInner = w.SSDNSMapFirebase.memory({ role: "player", store, bus });
  const dmAd = spy(dmInner);
  const plAd = spy(plInner);
  const hostEvents = [];
  const dm = await bootMap(w, {
    id: "dmMap",
    role: "dm",
    uid: "dm",
    adapter: dmAd,
    host: { on: (name) => hostEvents.push(name), players: () => players },
    options: { scene, tokens, assetBase: "", players: () => players, room: { table: { initiative: { order: [], turn: 0 } } } }
  });
  const badge = act(dm.el, "roleBadge");
  check("map.dm.boot", badge && badge.textContent === "DM" && act(dm.el, "zoomLabel").textContent === "1.00×", badge && badge.textContent);
  const sceneNames = [...act(dm.el, "sceneSelect").options].map((o) => o.textContent);
  check("map.scenesKept", sceneNames.indexOf("Main Street") >= 0 && sceneNames.indexOf("Upstairs") >= 0 && sceneNames.indexOf("Dusty Spur") >= 0, sceneNames.join(", "));
  const grantNames = [...act(dm.el, "grantUid").options].map((o) => o.textContent);
  check("map.grantPlayers", grantNames.join(",") === "Jolene,Mira" && grantNames.indexOf("Caleb") < 0, grantNames.join(","));

  const canvas = dm.el.querySelector("canvas");
  const zoomBefore = writesSince(dmAd.log, 0).length;
  pointer(w, canvas, "wheel", 400, 300, { deltaY: -120 });
  check("map.dm.R1zoom", act(dm.el, "zoomLabel").textContent === "1.10×", act(dm.el, "zoomLabel").textContent);
  act(dm.el, "reset").click();
  check("map.dm.R1reset", act(dm.el, "zoomLabel").textContent === "1.00×", act(dm.el, "zoomLabel").textContent);
  const panMark = dmAd.log.length;
  pointer(w, canvas, "pointerdown", 100, 100, { altKey: true, button: 0 });
  pointer(w, canvas, "pointermove", 180, 160, { altKey: true });
  pointer(w, canvas, "pointerup", 180, 160, { altKey: true });
  check("map.dm.R1pan", writesSince(dmAd.log, panMark).length === 0, "pan writes " + writesSince(dmAd.log, panMark).length);
  act(dm.el, "reset").click();
  results.writes.zoomExtra = writesSince(dmAd.log, 0).length - zoomBefore;

  const dragMark = dmAd.log.length;
  pointer(w, canvas, "pointerdown", 85, 265);
  pointer(w, canvas, "pointermove", 120, 265);
  pointer(w, canvas, "pointermove", 155, 265);
  pointer(w, canvas, "pointermove", 155, 265);
  const during = writesSince(dmAd.log, dragMark);
  pointer(w, canvas, "pointerup", 155, 265);
  const dragWrites = writesSince(dmAd.log, dragMark);
  check("map.dm.R2stream", during.length === 2 && during.every((e) => e.op === "write") && during[0].path === "map/public/tokens/tok_bystander1" && during[1].path === "map/dm/tokens/tok_bystander1", "writes during move " + during.map((e) => e.path).join(" | "));
  check("map.dm.R2oneDrag", dragWrites.length === 4 && dragWrites.every((e) => e.op === "write") && dragWrites[2].path === "map/public/tokens/tok_bystander1" && dragWrites[3].path === "map/dm/tokens/tok_bystander1", dragWrites.map((e) => e.path).join(" | "));
  check("map.dm.R2snap", dragWrites[0] && dragWrites[0].value.pos.x === 11 && dragWrites[0].value.pos.y === 9, JSON.stringify(dragWrites[0] && dragWrites[0].value.pos));
  results.writes.dmDrag = dragWrites.length;
  results.writes.dmDragDuringMove = during.length;

  const wallMark = dmAd.log.length;
  act(dm.el, "wallBtn").click();
  pointer(w, canvas, "pointerdown", 330, 300);
  pointer(w, canvas, "pointerup", 610, 300);
  const wallWrites = writesSince(dmAd.log, wallMark);
  const pubScene = wallWrites.find((e) => e.path === "map/public/scenes/scn_dustyspur01");
  const wallCount = pubScene && pubScene.value.walls ? pubScene.value.walls.length : 0;
  check("map.dm.R3wall", wallCount >= 1 && wallWrites.some((e) => e.path === "map/dm/scenes/scn_dustyspur01"), "walls " + wallCount);

  const doorMark = dmAd.log.length;
  act(dm.el, "doorBtn").click();
  pointer(w, canvas, "pointerdown", 470, 300);
  pointer(w, canvas, "pointerup", 470, 300);
  const doorWrite = writesSince(dmAd.log, doorMark).find((e) => e.path === "map/public/scenes/scn_dustyspur01");
  const door = doorWrite && (doorWrite.value.walls || []).some((wall) => wall.door);
  check("map.dm.R4door", !!door, "door flag missing");

  const winMark = dmAd.log.length;
  act(dm.el, "windowBtn").click();
  pointer(w, canvas, "pointerdown", 500, 300);
  pointer(w, canvas, "pointerup", 500, 300);
  const winWrite = writesSince(dmAd.log, winMark).find((e) => e.path === "map/public/scenes/scn_dustyspur01");
  const windowed = winWrite && (winWrite.value.walls || []).some((wall) => wall.window);
  check("map.dm.R4window", !!windowed, "window flag missing");

  act(dm.el, "revealFogBtn").click();
  const fogMark = dmAd.log.length;
  pointer(w, canvas, "pointerdown", 200, 200);
  pointer(w, canvas, "pointermove", 280, 280);
  pointer(w, canvas, "pointerup", 280, 280);
  const fogWrite = writesSince(dmAd.log, fogMark).find((e) => e.path === "map/public/scenes/scn_dustyspur01");
  check("map.dm.R5fog", !!(fogWrite && fogWrite.value.fogRects && fogWrite.value.fogRects.length && fogWrite.value.fogShapes && fogWrite.value.fogShapes.some((s) => s.op === "reveal" && s.kind === "box")), JSON.stringify(fogWrite && fogWrite.value.fogShapes));

  act(dm.el, "revealFogBtn").click();
  pointer(w, canvas, "pointerdown", 200, 30, { altKey: true });
  pointer(w, canvas, "pointermove", 200, 625, { altKey: true });
  pointer(w, canvas, "pointerup", 200, 625, { altKey: true });
  pointer(w, canvas, "pointerdown", 155, 300);
  pointer(w, canvas, "pointerup", 155, 300);
  act(dm.el, "sceneSelect").value = "scn_upstairs";
  const floorMark = dmAd.log.length;
  act(dm.el, "setFloorBtn").click();
  const floorWrites = writesSince(dmAd.log, floorMark);
  const floorTok = floorWrites.find((e) => e.path === "map/public/tokens/ply_p_jolene");
  const floorScenes = floorWrites.find((e) => e.path === "map/public/playerScenes");
  check("map.dm.R6floor", !!(floorTok && floorTok.value.sceneId === "scn_upstairs" && floorScenes && floorScenes.value.p_jolene === "scn_upstairs" && floorWrites.some((e) => e.path === "map/dm/tokens/ply_p_jolene")), floorWrites.map((e) => e.path).join(", "));

  act(dm.el, "grantUid").value = "p_mira";
  const grantMark = dmAd.log.length;
  act(dm.el, "grantBtn").click();
  const grantWrite = writesSince(dmAd.log, grantMark).find((e) => e.path === "map/public/tokens/ply_p_jolene");
  check("map.dm.R7grant", !!(grantWrite && grantWrite.value.controlledBy && grantWrite.value.controlledBy.indexOf("p_mira") >= 0), JSON.stringify(grantWrite && grantWrite.value.controlledBy));

  act(dm.el, "condSelect").value = "prone";
  const condMark = dmAd.log.length;
  act(dm.el, "condToggleBtn").click();
  act(dm.el, "downBtn").click();
  const condWrite = writesSince(dmAd.log, condMark).filter((e) => e.path === "map/public/tokens/ply_p_jolene").pop();
  const condDm = writesSince(dmAd.log, condMark).filter((e) => e.path === "map/dm/tokens/ply_p_jolene").pop();
  check("map.dm.R8status", !!(condWrite && condWrite.value.conditions.indexOf("prone") >= 0 && condWrite.value.status === "down" && secretKeys(condWrite.value).length === 0), JSON.stringify(condWrite && condWrite.value));
  check("map.dm.R8dmKeepsSheet", condDm && condDm.value.status === "down", "dm status");

  act(dm.el, "reset").click();
  pointer(w, canvas, "pointerdown", 155, 265);
  pointer(w, canvas, "pointerup", 155, 265);
  const hideMark = dmAd.log.length;
  act(dm.el, "hideBtn").click();
  const hideOps = writesSince(dmAd.log, hideMark);
  check("map.dm.hideRemovesPublic", hideOps.some((e) => e.op === "remove" && e.path === "map/public/tokens/tok_bystander1") && hideOps.some((e) => e.op === "write" && e.path === "map/dm/tokens/tok_bystander1" && e.value.hidden === true), hideOps.map((e) => e.op + " " + e.path).join(", "));

  const leftTools = ["pingBtn", "rulerBtn", "wallBtn", "doorBtn", "windowBtn", "roomBtn", "revealFogBtn", "hideFogBtn", "eraseFogBtn"].every((id) => act(dm.el, id));
  check("map.dm.R11tools", leftTools, "missing left tool");

  const pl = await bootMap(w, {
    id: "playerMap",
    role: "player",
    uid: "p_jolene",
    adapter: plAd,
    host: {
      on: (name, detail) => hostEvents.push(name + ":" + (detail && detail.text || "")),
      displayName: (id) => (id === "p_jolene" ? "Jolene" : id),
      actions: {
        get: () => [{ id: "gunroll:0", label: "Peacemaker · Attack", group: "attack" }],
        run: (id) => hostEvents.push("run:" + id)
      }
    },
    options: { scene, assetBase: "", players, room: { table: { initiative: { order: [{ id: "p_jolene", name: "Jolene" }], turn: 0 } } } }
  });
  check("map.player.boot", act(pl.el, "roleBadge").textContent === "Jolene" && act(pl.el, "roleBadge").textContent.indexOf("p_jolene") < 0, act(pl.el, "roleBadge").textContent);
  const plCanvas = pl.el.querySelector("canvas");
  const ownMark = plAd.log.length;
  pointer(w, plCanvas, "pointerdown", 400, 300);
  pointer(w, plCanvas, "pointermove", 400, 340);
  pointer(w, plCanvas, "pointermove", 400, 370);
  const ownDuring = writesSince(plAd.log, ownMark);
  pointer(w, plCanvas, "pointerup", 400, 370);
  const ownWrites = writesSince(plAd.log, ownMark);
  check("map.player.R2stream", ownDuring.length === 1 && ownDuring[0].path === "map/public/tokens/ply_p_jolene/pos", "during " + ownDuring.length);
  check("map.player.R2onePos", ownWrites.length === 2 && ownWrites.every((e) => e.path === "map/public/tokens/ply_p_jolene/pos") && ownWrites[1].value.y === 2 && ownWrites[1].value.by === "p_jolene", JSON.stringify(ownWrites));
  check("map.player.R9center", ownWrites.length === 2 && ownWrites[1].path.indexOf("ply_p_jolene") >= 0, ownWrites.map((e) => e.path).join(","));
  results.writes.playerDrag = ownWrites.length;
  results.writes.playerDragDuringMove = ownDuring.length;

  const otherMark = plAd.log.length;
  pointer(w, plCanvas, "pointerdown", 750, 1000);
  pointer(w, plCanvas, "pointermove", 820, 1000);
  pointer(w, plCanvas, "pointerup", 820, 1000);
  check("map.player.R7cannotMoveOther", writesSince(plAd.log, otherMark).length === 0, writesSince(plAd.log, otherMark).map((e) => e.path).join(","));

  check("map.player.R10ghostRetired", !act(pl.el, "playerGhostBtn") && !act(pl.el, "playerCancelBtn") && pl.el.textContent.indexOf("Ghost Plan") < 0, pl.el.textContent.slice(0, 180));

  const colorMark = plAd.log.length;
  const colorSel = act(pl.el, "playerColorBtn");
  colorSel.value = "#4a90d9";
  colorSel.dispatchEvent(new w.Event("change", { bubbles: true }));
  const patch = writesSince(plAd.log, colorMark).find((e) => e.path.indexOf("/patch") >= 0);
  check("map.player.patchCosmetic", !!(patch && patch.value.color && patch.value.by === "p_jolene" && patch.value.hp == null), JSON.stringify(patch && patch.value));
  const jolenePub = store.pub["map/public/tokens/ply_p_jolene"];
  check("map.player.patchApplied", !!(jolenePub && jolenePub.value.color === "#4a90d9" && jolenePub.value.hp == null), JSON.stringify(jolenePub && jolenePub.value && { color: jolenePub.value.color, hp: jolenePub.value.hp }));

  const pubTokens = {};
  Object.keys(store.pub).forEach((k) => {
    if (/^map\/public\/tokens\/[^/]+$/.test(k)) pubTokens[k] = store.pub[k].value;
  });
  const pubSecrets = secretKeys(pubTokens);
  const hiddenLeft = ["tok_bandit1", "tok_bandit3", "tok_bystander1"].filter((id) => pubTokens["map/public/tokens/" + id]);
  const playerDmEvents = plAd.log.filter((e) => String(e.path || "").indexOf("map/dm") === 0 || (e.op === "subscribe" && String(e.path).indexOf("map/dm") === 0));
  const playerPayloadSecrets = plAd.log.filter((e) => e.op === "event" && secretKeys(e.value).length);
  check("leak.public", pubSecrets.length === 0, pubSecrets.join(","));
  check("leak.hiddenAbsent", hiddenLeft.length === 0, hiddenLeft.join(","));
  check("leak.playerNoDm", playerDmEvents.length === 0, "dm events " + playerDmEvents.length);
  check("leak.playerPayloads", playerPayloadSecrets.length === 0, playerPayloadSecrets.map((e) => e.path + ":" + secretKeys(e.value).join("/")).join(", "));
  const dmHidden = store.dm["map/dm/tokens/tok_bandit1"];
  check("leak.dmKeepsSecrets", !!(dmHidden && dmHidden.value.hp === 11 && dmHidden.value.notes), JSON.stringify(dmHidden && dmHidden.value && { hp: dmHidden.value.hp, notes: dmHidden.value.notes }));
  results.leak = {
    publicSecrets: pubSecrets,
    hiddenLeft,
    playerDmEvents: playerDmEvents.length,
    playerPayloadSecrets: playerPayloadSecrets.length,
    dmHiddenHp: dmHidden && dmHidden.value.hp
  };

  const malMark = dmAd.log.length;
  await plInner.write("map/public/tokens/tok_bystander1/patch", { seq: Date.now() + 50, by: "p_jolene", color: "#ffffff", hp: 1, notes: "stolen" }, { seq: Date.now() + 50, by: "p_jolene" });
  await flush(20);
  const malWrites = writesSince(dmAd.log, malMark).filter((e) => e.op === "write");
  const byPub = store.pub["map/public/tokens/tok_bystander1"];
  check("map.player.patchWhitelist", malWrites.length === 0 && !(byPub && (byPub.value.hp != null || byPub.value.notes || byPub.value.color === "#ffffff")), JSON.stringify({ writes: malWrites.map((e) => e.path), color: byPub && byPub.value.color, hp: byPub && byPub.value.hp }));

  pl.api.syncCombatants({ order: [{ id: "p_jolene", name: "Jolene" }, { id: "en_bandit2", name: "Bandit 2" }], turn: 1 });
  const strip = act(pl.el, "turnStrip").textContent;
  check("map.player.initiative", strip.indexOf("Jolene") >= 0 && strip.indexOf("Bandit 2") >= 0, strip);
  /* 0.2.77: with no fight the DM strip shows "No fight running" + Roll Initiative, so Next appears once there is an order */
  const idleStrip = act(dm.el, "turnStrip");
  check("map.dm.idleStrip", idleStrip && !idleStrip.hidden && /No fight running/.test(idleStrip.textContent) && [...idleStrip.querySelectorAll("button")].some((b) => b.textContent === "Roll Initiative"), idleStrip && idleStrip.textContent);
  dm.api.syncCombatants({ order: [{ id: "a", name: "A" }], turn: 0 });
  const next = [...act(dm.el, "turnStrip").querySelectorAll("button")].find((b) => b.textContent === "Next");
  if (next) next.click();
  check("map.dm.initiativeNext", hostEvents.indexOf("initiative:next") >= 0, hostEvents.join(","));

  act(pl.el, "chatInput").value = "On me";
  act(pl.el, "chatSend").click();
  check("map.player.chatSend", hostEvents.some((e) => e.indexOf("chat:send:On me") === 0), hostEvents.join(","));
  pl.api.setChat([{ id: "c1", from: "p_mira", fromName: "Mira", text: "Ready", ts: "2026-10-12T00:00:00.000Z" }]);
  check("map.player.chatLog", act(pl.el, "chatlog").textContent.indexOf("Mira: Ready") >= 0, act(pl.el, "chatlog").textContent);
  pl.api.pushFeed({ id: "f1", from: "dm", text: "Initiative = 14", ts: "2026-10-12T00:00:01.000Z" });
  check("map.player.tableFeed", act(pl.el, "chatlog").textContent.indexOf("Initiative = 14") >= 0, act(pl.el, "chatlog").textContent);

  const slot = act(pl.el, "actionSlot");
  const actionBtn = slot && slot.querySelector("button");
  if (actionBtn) actionBtn.click();
  check("map.player.actions", hostEvents.indexOf("run:gunroll:0") >= 0, hostEvents.join(","));

  pointer(w, plCanvas, "wheel", 400, 300, { deltaY: -100 });
  check("map.player.R1zoom", act(pl.el, "zoomLabel").textContent === "1.10×", act(pl.el, "zoomLabel").textContent);

  results.writes.dmDragPaths = dragWrites.map((e) => e.path);
  results.writes.playerDragPath = ownWrites.map((e) => e.path);

  const noise = /not implemented|cors|failed to load resource|network/i;
  const realErrors = w.__errors.filter((line) => !noise.test(line));
  results.consoleErrors = realErrors;
  check("map.R12console", realErrors.length === 0, realErrors.slice(0, 4).join(" || "));

  dm.api.destroy();
  pl.api.destroy();
  check("map.destroy", dm.el.innerHTML === "" && pl.el.innerHTML === "", "html left");

  const css = read("map/ssdns-map.css");
  const dmCss = read("dm/assets/css/dmcc.css");
  const dmHtml = read("dm/index.html");
  check("map.layoutGrid", css.indexOf("grid-template-areas") >= 0 && css.indexOf('"dice dice dice"') >= 0 && css.indexOf('"strip strip strip"') >= 0 && /body\.map-fullscreen #mapMount \{[\s\S]*?display:\s*grid/.test(css) && !/top:\s*56px/.test(css) && !/top:\s*116px/.test(css), "dice lane, chat, and the turn strip keep their own rows");
  const dmcc = read("dm/assets/js/dmcc.js");
  check("map.roomCodeCopiesCode",
    dmcc.indexOf("function roomCodeString()") >= 0 &&
    dmcc.indexOf("roomCodeClickTarget") >= 0 &&
    dmcc.indexOf('copyLink.addEventListener("click", () => copyInvite())') >= 0 &&
    dmcc.indexOf("codeDisplay.addEventListener") < 0 &&
    dmcc.indexOf('e.clipboardData.setData("text/plain", code)') >= 0 &&
    dmcc.indexOf("text/html") < 0,
    "every code click writes the plain code; invite link stays the URL");
  check("map.roomCodeNotSelectable", /user-select:\s*none/.test(dmCss) && dmCss.indexOf("user-select: all") < 0, "code cannot be selected as HTML");
  check("map.demoBoxUnchecked", /<input type="checkbox" id="chkDemo">/.test(dmHtml) && !/id="chkDemo"[^>]*\bchecked\b/.test(dmHtml), "demo checkbox has no checked attribute");
  check("map.refreshIgnoresDemoFlag",
    dmcc.indexOf("wasOpen.demo") < 0 &&
    !/if \(!saved \|\| saved\.demo/.test(dmcc) &&
    /A saved demo flag never opens demo/.test(dmcc),
    "refresh of a saved demo flag still tries the live room");
  check("map.createRoomStaysLive", /function wantDemo\(\) \{[\s\S]*?return q\.get\("demo"\) === "1";/.test(dmcc) && dmcc.indexOf("loadDemo(true)") < 0, "Create room no longer falls into demo");
  check("map.sceneWallsArray", /if \(!Array\.isArray\(scene\.walls\)\) scene\.walls = \[\]/.test(read("map/ssdns-map.js")), "a firebase scene with no walls array can still take a wall");

  const freshStore = { pub: {}, dm: {} };
  const freshBus = [];
  const freshPlayers = [
    { uid: "player-uid", name: "Wade" },
    { uid: "player-two", name: "Nia" }
  ];
  const freshDm = spy(w.SSDNSMapFirebase.memory({ role: "dm", store: freshStore, bus: freshBus }));
  const freshPl = spy(w.SSDNSMapFirebase.memory({ role: "player", store: freshStore, bus: freshBus }));
  const fresh = await bootMap(w, {
    id: "freshDm",
    role: "dm",
    uid: "dm-uid",
    adapter: freshDm,
    host: { players: () => freshPlayers },
    options: { scene, tokens: { tokens: {} }, assetBase: "", players: () => freshPlayers, ensureScene: true }
  });
  const pcPubs = freshDm.log.filter((e) => e.op === "write" && /^map\/public\/tokens\/ply_/.test(e.path) && e.value && e.value.ownerUid);
  const owners = pcPubs.map((e) => e.value.ownerUid).sort();
  check("map.fresh.pcTokens", owners.join(",") === "player-two,player-uid", owners.join(","));
  check("map.fresh.pcNoSecrets", pcPubs.every((e) => e.value.hp == null && e.value.notes == null && e.value.ownerCanMove !== false), JSON.stringify(pcPubs.map((e) => e.value)));
  const sceneWrite = [...freshDm.log].reverse().find((e) => e.op === "write" && e.path === "map/public/scenes/scn_dustyspur01");
  check("map.fresh.defaultScene", !!(sceneWrite && sceneWrite.value && sceneWrite.value.id === "scn_dustyspur01" && /Dusty Spur/.test(sceneWrite.value.name || "")), JSON.stringify(sceneWrite && sceneWrite.value));
  const addMark = freshDm.log.length;
  act(fresh.el, "addTokenBtn").click();
  const enemy = writesSince(freshDm.log, addMark).find((e) => e.op === "write" && /^map\/public\/tokens\//.test(e.path));
  check("map.fresh.addEnemy", !!(enemy && !enemy.value.ownerUid && enemy.value.name === "Enemy" && enemy.value.hp == null), JSON.stringify(enemy && enemy.value));
  const playerFresh = await bootMap(w, {
    id: "freshPl",
    role: "player",
    uid: "player-uid",
    adapter: freshPl,
    options: { scene, assetBase: "" }
  });
  const moveMark = freshPl.log.length;
  const freshCanvas = playerFresh.el.querySelector("canvas");
  pointer(w, freshCanvas, "pointerdown", 400, 300);
  pointer(w, freshCanvas, "pointermove", 470, 300);
  pointer(w, freshCanvas, "pointerup", 470, 300);
  const posWrites = writesSince(freshPl.log, moveMark).filter((e) => /\/pos$/.test(e.path));
  check("map.fresh.playerMoves", posWrites.length === 1 && posWrites[0].value && typeof posWrites[0].value.x === "number", posWrites.map((e) => e.path + ":" + (e.value && e.value.x)).join(","));
  const dmCanvas = fresh.el.querySelector("canvas");
  pointer(w, dmCanvas, "pointerdown", 295, 335);
  pointer(w, dmCanvas, "pointerup", 295, 335);
  const delMark = freshDm.log.length;
  act(fresh.el, "delTokenBtn").click();
  fresh.api.refreshPlayers();
  const revived = writesSince(freshDm.log, delMark).filter((e) => e.op === "write" && e.value && e.value.ownerUid === "player-uid");
  check("map.fresh.noRespawn", revived.length === 0, revived.map((e) => e.path).join(","));
  fresh.api.destroy();
  playerFresh.api.destroy();
}

async function testHost(w) {
  addScript(w, "map/ssdns-map-firebase.js");
  addScript(w, "map/ssdns-map.js");
  const doc = w.document;
  doc.body.innerHTML = `
    <button type="button" class="tab" id="tab-map">Map</button>
    <button type="button" id="btnMapFull">Full screen</button>
    <p id="mapIdle"></p>
    <div id="mapMount" data-map-role="player" data-asset-base="" data-scene="scene-dusty-spur.json"></div>
    <button type="button" data-gunroll="0">Roll</button>
    <button type="button" data-gunroll="0" data-k="1">Chamber</button>
    <button type="button" data-melee-roll="0">Melee</button>
    <button type="button" data-cast="0">Cast</button>
    <button type="button" data-reload="0">Reload</button>
    <button type="button" data-tr="0">TR</button>
    <button type="button" id="btnPactShot">Pact</button>
    <form id="logChat"><input id="logChatText"></form>
    <input id="charName" value="Jolene Pike">
  `;
  const clicks = [];
  doc.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
    if (b.hasAttribute("data-k")) clicks.push("chamber");
    else if (b.hasAttribute("data-gunroll")) clicks.push("gun");
    else if (b.hasAttribute("data-melee-roll")) clicks.push("melee");
    else if (b.hasAttribute("data-cast")) clicks.push("cast");
    else if (b.hasAttribute("data-reload")) clicks.push("reload");
    else if (b.hasAttribute("data-tr")) clicks.push("tr");
    else clicks.push(b.id || b.textContent);
  }));
  let submitted = "";
  doc.getElementById("logChat").addEventListener("submit", (e) => {
    e.preventDefault();
    submitted = doc.getElementById("logChatText").value;
  });
  const fetched = [];
  const origFetch = w.fetch;
  w.fetch = async (url) => {
    fetched.push(String(url));
    return origFetch(url);
  };
  w.SSDNSDmJoin = {
    isJoined: () => true,
    uid: () => "p_jolene",
    live: () => ({ db: {}, fb: {}, uid: "p_jolene", roomCode: "DUST", joined: true, dmUid: "dm" })
  };
  addScript(w, "map/ssdns-map-host.js");
  w.SSDNSMapHost.setPlayers([{ uid: "p_jolene", name: "Jolene" }, { uid: "p_mira", name: "Mira" }]);
  w.SSDNSMapHost.syncRoom();
  await flush(100);
  check("host.playerNoTokensFetch", fetched.every((u) => u.indexOf("tokens.json") < 0) && fetched.some((u) => u.indexOf("scene-dusty-spur.json") >= 0), fetched.join(","));
  check("host.playerMounted", doc.getElementById("mapMount").querySelector("canvas") != null, doc.getElementById("mapIdle").textContent);
  const labels = [...doc.querySelectorAll("#mapMount [data-act=actionSlot] button")].map((b) => b.textContent);
  check("host.actionsFromSheet", labels.some((t) => t.indexOf("Gun 1") >= 0) && labels.some((t) => t.indexOf("Reload") >= 0) && labels.some((t) => t.indexOf("Pact") >= 0) && !labels.some((t) => /Cast|Melee 1|Not sold/.test(t)), labels.join(" | "));
  const attack = [...doc.querySelectorAll("#mapMount [data-act=actionSlot] button")].find((b) => b.getAttribute("data-id") === "gunroll:0");
  clicks.length = 0;
  if (attack) attack.click();
  check("host.attackClicksSheet", clicks.indexOf("gun") >= 0 && clicks.indexOf("Chamber") < 0, clicks.join(","));
  const input = doc.querySelector("#mapMount [data-act=chatInput]");
  const send = doc.querySelector("#mapMount [data-act=chatSend]");
  input.value = "Holding the door";
  send.click();
  check("host.chatSubmitsForm", submitted === "Holding the door", submitted);
  doc.getElementById("btnMapFull").click();
  check("host.fullscreen", doc.body.classList.contains("map-fullscreen") && doc.getElementById("btnMapFull").textContent === "Exit full screen", doc.getElementById("btnMapFull").textContent);
  doc.getElementById("btnMapFull").click();
  check("host.fullscreenOff", !doc.body.classList.contains("map-fullscreen"), doc.getElementById("btnMapFull").textContent);
  w.SSDNSDmJoin = { isJoined: () => false, live: () => ({ joined: false }) };
  w.SSDNSMapHost.syncRoom();
  check("host.leaveClears", doc.getElementById("mapMount").innerHTML === "" && doc.getElementById("mapIdle").textContent.indexOf("Join a table") >= 0, doc.getElementById("mapIdle").textContent);

  doc.body.innerHTML = `
    <button type="button" class="tab" id="tab-map">Map</button>
    <button type="button" id="btnMapFull">Full screen</button>
    <p id="mapIdle"></p>
    <div id="mapMount" data-map-role="dm" data-asset-base="" data-scene="scene-dusty-spur.json" data-tokens="tokens.json"></div>
    <button type="button" id="btnNextTurn">Next</button>
    <button type="button" id="btnPrevTurn">Prev</button>
    <form id="dockChat"><input id="dockText"><select id="dockTo"><option value="dm">DM</option><option value="all">All</option></select></form>
  `;
  let turns = 0;
  let dock = "";
  doc.body.classList.add("in-room");
  w.DMCC = {
    state: {
      roomCode: "DUST",
      demo: true,
      uid: "dm",
      meta: { dmUid: "dm" },
      players: { p_wes: { snapshot: { name: "Wes" } } },
      table: { initiative: { order: [{ id: "p_wes", name: "Wes" }], turn: 0, round: 1 } }
    }
  };
  const dmFetched = [];
  w.fetch = async (url) => {
    dmFetched.push(String(url));
    return origFetch(url);
  };
  doc.getElementById("btnNextTurn").addEventListener("click", () => { turns += 1; });
  doc.getElementById("dockChat").addEventListener("submit", (e) => {
    e.preventDefault();
    dock = doc.getElementById("dockText").value + "|" + doc.getElementById("dockTo").value;
  });
  w.SSDNSMapHost.syncRoom();
  await flush(120);
  check("host.dmFetchesTokens", dmFetched.some((u) => u.indexOf("tokens.json") >= 0), dmFetched.join(","));
  const grant = [...doc.querySelectorAll("#mapMount [data-act=grantUid] option")].map((o) => o.textContent);
  check("host.dmGrantFromRoom", grant.join(",") === "Wes", grant.join(","));
  const next = [...doc.querySelectorAll("#mapMount [data-act=turnStrip] button")].find((b) => b.textContent === "Next");
  if (next) next.click();
  check("host.dmNextClicksExisting", turns === 1, "turns " + turns);
  const din = doc.querySelector("#mapMount [data-act=chatInput]");
  const dsend = doc.querySelector("#mapMount [data-act=chatSend]");
  din.value = "Roll initiative";
  dsend.click();
  check("host.dmChat", dock === "Roll initiative|all", dock);
  const liveFetched = [];
  w.fetch = async (url) => {
    liveFetched.push(String(url));
    return origFetch(url);
  };
  w.DMCC.state.demo = false;
  w.DMCC.state.db = {};
  w.DMCC.state.uid = "dm-live";
  w.DMCC.state.roomCode = "LIVE-1001";
  w.DMCC.state.meta = { dmUid: "dm-live" };
  w.DMCC.state.players = { "player-uid": { snapshot: { name: "Wade" } } };
  w.DMCC.state._fb = {
    ref() { return { path: "rooms/LIVE-1001/map/public/scenes" }; },
    onValue() { return function () {}; },
    get() { return Promise.resolve({ exists: () => false, val: () => null }); },
    set() { return Promise.resolve(); },
    remove() { return Promise.resolve(); },
    runTransaction(r, fn) { fn(null); return Promise.resolve({ committed: true }); }
  };
  doc.body.classList.add("in-room");
  w.SSDNSMapHost.syncRoom();
  await flush(180);
  check("host.liveSkipsSampleTokens", liveFetched.every((u) => u.indexOf("tokens.json") < 0), liveFetched.join(","));
  const liveGrant = [...doc.querySelectorAll("#mapMount [data-act=grantUid] option")].map((o) => o.textContent);
  check("host.liveGrant", liveGrant.join(",") === "Wade", liveGrant.join(","));
  const add = doc.querySelector("#mapMount [data-act=addTokenBtn]");
  if (add) add.click();
  const selected = doc.querySelector("#mapMount [data-act=targetList]");
  check("host.liveAddToken", !!(selected && selected.textContent.indexOf("Enemy") >= 0), selected && selected.textContent);
  w.DMCC.state.roomCode = null;
  doc.body.classList.remove("in-room");
  w.SSDNSMapHost.syncRoom();
  check("host.dmCloseClears", doc.getElementById("mapMount").innerHTML === "", doc.getElementById("mapIdle").textContent);
}

async function main() {
  const adapterWindow = makeWindow();
  addScript(adapterWindow, "map/ssdns-map-firebase.js");
  await testAdapter(adapterWindow);

  const mapWindow = makeWindow();
  await testMaps(mapWindow);

  const hostWindow = makeWindow();
  await testHost(hostWindow);

  const out = {
    failures,
    writes: results.writes,
    leak: results.leak,
    consoleErrors: results.consoleErrors,
    checks: Object.keys(results).filter((k) => typeof results[k] === "string").reduce((acc, k) => {
      acc[k] = results[k];
      return acc;
    }, {})
  };
  fs.writeFileSync("/tmp/map-m2-results.json", JSON.stringify(out, null, 2));
  if (failures.length) {
    console.error(failures.join("\n"));
    console.error(failures.length + " failed");
    process.exit(1);
  }
  console.log("ok map m2 checks " + Object.keys(out.checks).length);
  console.log(JSON.stringify({ writes: results.writes, leak: results.leak }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

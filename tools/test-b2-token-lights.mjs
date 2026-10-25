/**
 * B2: snapshot lights while the player Map is closed, explicit link replaces,
 * owner-can't-move still syncs, Add my token is a request, drawer status + hand lights.
 *
 *   node tools/test-b2-token-lights.mjs
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

const TORCH = { id: "torch", name: "Torch", bright: 20, dim: 20, cone: false, out: false };
function profile(dv, lights) {
  return { lights: lights || [Object.assign({}, TORCH)], darkvision: dv, skulker: false };
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
    set(r, value) { setPath(r.path, value); notify(r.path); return Promise.resolve(); },
    update(r, value) {
      const cur = get(r.path);
      const next = Object.assign({}, cur && typeof cur === "object" ? cur : {}, value);
      setPath(r.path, next);
      notify(r.path);
      return Promise.resolve();
    },
    remove(r) { setPath(r.path, null); notify(r.path); return Promise.resolve(); },
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
        if (p === "fillText") return (text) => { texts.push(String(text)); };
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
    bubbles: true, cancelable: true, clientX: x, clientY: y, screenX: x, screenY: y,
    pointerId: 1, button: 0, buttons: type === "pointerup" ? 0 : 1
  });
  el.dispatchEvent(ev);
}

function publicBag(fake, room) {
  return fake.get("rooms/" + room + "/map/public/tokens") || {};
}
function dmBag(fake, room) {
  return fake.get("rooms/" + room + "/map/dm/tokens") || {};
}
function act(el, name) { return el.querySelector('[data-act="' + name + '"]'); }
function toastText(el) {
  const t = act(el, "toast");
  return t && t.style.display !== "none" ? t.textContent : "";
}
function lightNamed(token, name) {
  return (token && token.lights || []).find((l) => l && String(l.name).toLowerCase() === name);
}

const mapSrc = read("map/ssdns-map.js");
const joinSrc = read("assets/js/dm-join.js");
const v2Src = read("dm/assets/js/v2.js");
const hostSrc = read("map/ssdns-map-host.js");
const rules = read("database.rules.json");
const rulesJs = read("assets/data/rules.js");
const version = JSON.parse(read("version.json"));

check("src.versions", version.sheet === "0.3.127" && version.dmcc === "0.2.140" && version.sheetBuild === "sheet-playtest-v03127" && version.dmccBuild === "dmcc-playtest-v02140");
check("src.rulesUntouched", !rulesJs.includes("0.3.127") && !rulesJs.includes("lightProfile") && !rules.includes("addToken") && !rules.includes("dmDarkvision"));
check("src.requestsOpen", rules.includes("hasChildren(['ts', 'from', 'targetId', 'amount'])") && !/requests[\s\S]{0,500}child\('type'\)/.test(rules));
check("src.snapshot", joinSrc.includes("lightProfile:") && joinSrc.includes("SSDNSLighting.tokenProfile") && joinSrc.includes('type: "addToken"') && joinSrc.includes("postAddToken: postAddToken"));
check("src.host", hostSrc.includes("lightProfile: snap.lightProfile") && hostSrc.includes("addPlayerTokenFor"));
check("src.dmWatch", v2Src.includes('req.type === "addToken"') && v2Src.includes("replace: true") && v2Src.includes("delete fight.seenReq[id]"));
check("src.dedupeOldWins", /function dedupePlayerTokens\(\) \{[\s\S]{0,500}canonicalPlayerToken\(uid\)/.test(mapSrc));
check("src.linkNewWins", /Explicit DM link only[\s\S]{0,700}Replaced /.test(mapSrc) && mapSrc.includes('toast("Replaced " + linkName + "\'s old token.")'));
check("src.snapDraw", mapSrc.includes("if (role === 'dm') syncSnapshotLights();"));
check("src.badgeDmOnly", /if \(role === 'dm'\) \{[\s\S]{0,240}const mark = linkedSheet \? '⛓' : '⚠'/.test(mapSrc));
check("src.noRuleRegen", !mapSrc.includes("database.rules") && joinSrc.includes("needs no database rule change"));

const scene = JSON.parse(read("map/scene-dusty-spur.json"));
const w = makeWindow();
addScript(w, "map/ssdns-map-firebase.js");
addScript(w, "map/ssdns-map.js");

const players = [{ uid: "wade", name: "Wade", lightProfile: profile(120) }];
const live = fakeFirebase();
const roomOpts = {
  scene,
  tokens: { tokens: {} },
  assetBase: "",
  players: () => players,
  room: { table: { initiative: { order: [], turn: 0 } } }
};

const dmEl = w.document.createElement("div");
dmEl.id = "dmMap";
w.document.body.appendChild(dmEl);
const dm = w.SSDNSMap.create({
  el: dmEl,
  role: "dm",
  uid: "dm",
  adapter: w.SSDNSMapFirebase.create({ db: {}, fb: live.fb, roomCode: "DUST", role: "dm" }),
  host: { players: () => players },
  options: roomOpts
});
await flush(40);

const closed = publicBag(live, "DUST").ply_wade;
const torch = lightNamed(closed, "torch");
check("closed.lights", !!(closed && closed.darkvision === 120 && torch && torch.bright === 20 && torch.dim === 20 && torch.out === false && closed.ownerCanMove !== false), JSON.stringify(closed && { dv: closed.darkvision, lights: closed.lights, move: closed.ownerCanMove }));
const dmMarks = (dmEl.querySelector("canvas").__texts || []).join(" ");
check("closed.badge", dmMarks.includes("⛓") && dmMarks.includes("Wade"), dmMarks.slice(-80));

const box = dm.tokenBoxes().find((b) => b.id === "ply_wade");
const canvas = dmEl.querySelector("canvas");
if (box) {
  const cx = (box.screen.x1 + box.screen.x2) / 2;
  const cy = (box.screen.y1 + box.screen.y2) / 2;
  pointer(w, canvas, "pointerdown", cx, cy);
  pointer(w, canvas, "pointerup", cx, cy);
}
await flush(20);
const status = act(dmEl, "linkStatus");
check("drawer.linked", !!(status && status.textContent.includes("Linked: Wade") && status.textContent.includes("lights synced ✓") && status.textContent.includes("torch 20/20") && status.textContent.includes("darkvision 120")), status && status.textContent);

const dvInput = act(dmEl, "dmDarkvision");
dvInput.value = "30";
dvInput.dispatchEvent(new w.Event("change", { bubbles: true }));
await flush(20);
const handed = publicBag(live, "DUST").ply_wade;
check("hand.darkvision", handed && handed.darkvision === 30 && dmBag(live, "DUST").ply_wade.dmDarkvision === 30, JSON.stringify({ dv: handed && handed.darkvision, hand: dmBag(live, "DUST").ply_wade && dmBag(live, "DUST").ply_wade.dmDarkvision }));
players[0].lightProfile = profile(90);
dm.refreshPlayers();
await flush(20);
const handHolds = publicBag(live, "DUST").ply_wade;
check("hand.survivesSnap", handHolds && handHolds.darkvision === 30, String(handHolds && handHolds.darkvision));
const dvBack = act(dmEl, "dmDarkvision");
dvBack.value = "";
dvBack.dispatchEvent(new w.Event("change", { bubbles: true }));
await flush(20);
check("hand.cleared", publicBag(live, "DUST").ply_wade.darkvision === 90, String(publicBag(live, "DUST").ply_wade.darkvision));

const torchBox = act(dmEl, "dmTorch");
torchBox.checked = true;
torchBox.dispatchEvent(new w.Event("change", { bubbles: true }));
await flush(20);
const withDmTorch = publicBag(live, "DUST").ply_wade;
const dmTorch = (withDmTorch.lights || []).find((l) => l && l.id === "dm-torch");
const sheetTorch = (withDmTorch.lights || []).find((l) => l && l.id === "torch");
check("hand.torchAdds", !!(dmTorch && dmTorch.bright === 20 && sheetTorch), JSON.stringify(withDmTorch.lights));
torchBox.checked = false;
const torchOff = act(dmEl, "dmTorch");
torchOff.checked = false;
torchOff.dispatchEvent(new w.Event("change", { bubbles: true }));
await flush(20);
const torchBack = publicBag(live, "DUST").ply_wade;
check("hand.torchOff", !!(lightNamed(torchBack, "torch") && !(torchBack.lights || []).some((l) => l && l.id === "dm-torch")), JSON.stringify(torchBack.lights));

if (box) {
  pointer(w, canvas, "pointerdown", (box.screen.x1 + box.screen.x2) / 2, (box.screen.y1 + box.screen.y2) / 2);
}
act(dmEl, "dmDouseBtn").click();
await flush(20);
const doused = publicBag(live, "DUST").ply_wade;
check("douse.out", !!(doused && doused.dmDoused && (doused.lights || []).length && (doused.lights || []).every((l) => l.out)), JSON.stringify(doused && { d: doused.dmDoused, lights: doused.lights }));
players[0].lightProfile = profile(120, [{ id: "lantern", name: "Lantern", bright: 30, dim: 30, cone: false, out: false }]);
dm.refreshPlayers();
await flush(20);
const dousedStill = publicBag(live, "DUST").ply_wade;
check("douse.wins", !!(dousedStill && dousedStill.dmDoused && (dousedStill.lights || []).every((l) => l.out) && (dousedStill.lights || []).some((l) => l.name === "Lantern")), JSON.stringify(dousedStill && dousedStill.lights));
const dousedStatus = act(dmEl, "linkStatus");
check("douse.status", !!(dousedStatus && dousedStatus.textContent.includes("doused") && dousedStatus.textContent.includes("darkvision")), dousedStatus && dousedStatus.textContent);
act(dmEl, "dmRelightBtn").click();
await flush(20);
const relit = publicBag(live, "DUST").ply_wade;
check("relight.snap", !!(relit && !relit.dmDoused && lightNamed(relit, "lantern") && lightNamed(relit, "lantern").out === false && relit.darkvision === 120), JSON.stringify(relit && { d: relit.dmDoused, dv: relit.darkvision, lights: relit.lights }));

players[0].lightProfile = profile(120);
const grant = act(dmEl, "grantUid");
if (grant) grant.value = "wade";
act(dmEl, "revokeBtn").click();
await flush(10);
players[0].lightProfile = profile(60, [{ id: "candle", name: "Candle", bright: 5, dim: 5, cone: false, out: false }]);
dm.refreshPlayers();
await flush(20);
const locked = publicBag(live, "DUST").ply_wade;
check("locked.snap", !!(locked && locked.ownerCanMove === false && locked.darkvision === 60 && lightNamed(locked, "candle")), JSON.stringify(locked && { move: locked.ownerCanMove, dv: locked.darkvision, lights: locked.lights }));

const playerEl = w.document.createElement("div");
playerEl.id = "plMap";
w.document.body.appendChild(playerEl);
const player = w.SSDNSMap.create({
  el: playerEl,
  role: "player",
  uid: "wade",
  adapter: w.SSDNSMapFirebase.create({ db: {}, fb: live.fb, roomCode: "DUST", role: "player" }),
  host: { lightsProfile: () => profile(5, [{ id: "glare", name: "Glare", bright: 5, dim: 5, cone: false, out: false }]) },
  options: { scene, assetBase: "", room: roomOpts.room }
});
await flush(40);
const afterPatch = publicBag(live, "DUST").ply_wade;
check("locked.ignoresPatch", !!(afterPatch && afterPatch.darkvision === 60 && !lightNamed(afterPatch, "glare") && lightNamed(afterPatch, "candle")), JSON.stringify(afterPatch && { dv: afterPatch.darkvision, lights: afterPatch.lights }));
const plTexts = (playerEl.querySelector("canvas").__texts || []).join(" ");
check("leak.noBadge", !plTexts.includes("⛓") && !plTexts.includes("⚠"), plTexts.slice(-60));
const addBtn = act(playerEl, "addMineBtn");
check("add.hiddenWhenToken", !!(addBtn && addBtn.hidden), String(addBtn && addBtn.hidden));

const before = publicBag(live, "DUST").ply_wade.pos;
act(dmEl, "addTokenBtn").click();
await flush(20);
const withEnemy = publicBag(live, "DUST");
const enemyId = Object.keys(withEnemy).find((id) => id !== "ply_wade");
const enemyPos = enemyId && withEnemy[enemyId].pos;
const bare = act(dmEl, "drawer");
check("drawer.unlinked", !!(bare && bare.textContent.includes("No card linked") && bare.textContent.includes("⚠ Not linked to a sheet") && act(dmEl, "dmTorch") && act(dmEl, "dmDarkvision")), bare && bare.textContent.slice(0, 180));
const enemyTorch = act(dmEl, "dmTorch");
enemyTorch.checked = true;
enemyTorch.dispatchEvent(new w.Event("change", { bubbles: true }));
await flush(10);
check("unlinked.torch", !!(publicBag(live, "DUST")[enemyId] && lightNamed(publicBag(live, "DUST")[enemyId], "torch")), JSON.stringify(publicBag(live, "DUST")[enemyId] && publicBag(live, "DUST")[enemyId].lights));
dm.applyLink(enemyId, { ownerUid: "wade", kind: "player", name: "Wade", label: "Wade", combatantId: "wade", sheetId: "wade" });
await flush(30);
const linked = publicBag(live, "DUST");
const linkedIds = Object.keys(linked);
check("link.replace", linkedIds.length === 1 && linkedIds[0] === "ply_wade" && enemyPos && linked.ply_wade.pos.x === enemyPos.x && linked.ply_wade.pos.y === enemyPos.y && (before.x !== enemyPos.x || before.y !== enemyPos.y), JSON.stringify({ ids: linkedIds, pos: linked.ply_wade && linked.ply_wade.pos, enemyPos, before }));
check("link.toast", toastText(dmEl) === "Replaced Wade's old token.", toastText(dmEl));
check("link.lights", !!(linked.ply_wade && linked.ply_wade.darkvision === 60 && lightNamed(linked.ply_wade, "candle")), JSON.stringify(linked.ply_wade && { dv: linked.ply_wade.darkvision, lights: linked.ply_wade.lights }));
const again = dm.addPlayerTokenFor("wade", { replace: true, name: "Wade" });
await flush(20);
const replaced = publicBag(live, "DUST");
check("readd.one", !!again && Object.keys(replaced).length === 1 && Object.keys(replaced)[0] === "ply_wade" && toastText(dmEl) === "Replaced Wade's old token.", JSON.stringify({ ids: Object.keys(replaced), toast: toastText(dmEl) }));

player.destroy();
dm.destroy();

const lone = fakeFirebase();
const loneEl = w.document.createElement("div");
loneEl.id = "lone";
w.document.body.appendChild(loneEl);
const loneMap = w.SSDNSMap.create({
  el: loneEl,
  role: "player",
  uid: "ada",
  adapter: w.SSDNSMapFirebase.create({ db: {}, fb: lone.fb, roomCode: "LONE", role: "player" }),
  host: {},
  options: { scene, assetBase: "", room: roomOpts.room }
});
await flush(30);
const mine = act(loneEl, "addMineBtn");
check("add.shown", !!(mine && !mine.hidden), String(mine && mine.hidden));
mine.click();
await flush(10);
check("add.needJoin", toastText(loneEl) === "Join the table first", toastText(loneEl));
const posted = [];
w.SSDNSDmJoin = {
  postAddToken(info) {
    posted.push(info);
    return Promise.resolve({ ok: true, id: "addtok_test" });
  }
};
mine.click();
await flush(20);
check("add.request", posted.length === 1 && typeof posted[0].sceneId === "string" && toastText(loneEl) === "Asked the DM to add your token", JSON.stringify({ posted, toast: toastText(loneEl) }));
loneMap.destroy();

const dupe = fakeFirebase();
function seed(id, pos) {
  const row = {
    id, pos, ownerUid: "ada", name: "Ada", label: "Ada", ownerCanMove: true, size: 1,
    kind: "player", combatantId: "ada", sheetId: "ada", sceneId: "scn_dustyspur01"
  };
  dupe.fb.set(dupe.fb.ref(null, "rooms/DUPE/map/public/tokens/" + id), row);
  dupe.fb.set(dupe.fb.ref(null, "rooms/DUPE/map/dm/tokens/" + id), row);
}
seed("tok_legacy", { x: 2, y: 2 });
seed("ply_ada", { x: 8, y: 9 });
const dupeEl = w.document.createElement("div");
dupeEl.id = "dupe";
w.document.body.appendChild(dupeEl);
const ada = [{ uid: "ada", name: "Ada", lightProfile: profile(120) }];
const dupeMap = w.SSDNSMap.create({
  el: dupeEl,
  role: "dm",
  uid: "dm",
  adapter: w.SSDNSMapFirebase.create({ db: {}, fb: dupe.fb, roomCode: "DUPE", role: "dm" }),
  host: {},
  options: { scene, tokens: { tokens: {} }, assetBase: "", players: () => ada, room: roomOpts.room }
});
await flush(40);
const cleaned = publicBag(dupe, "DUPE");
check("dedupe.oldWins", Object.keys(cleaned).length === 1 && cleaned.ply_ada && cleaned.ply_ada.pos.x === 8 && cleaned.ply_ada.pos.y === 9 && cleaned.ply_ada.darkvision === 120, JSON.stringify({ ids: Object.keys(cleaned), pos: cleaned.ply_ada && cleaned.ply_ada.pos, dv: cleaned.ply_ada && cleaned.ply_ada.darkvision }));
dupeMap.destroy();

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("b2 token lights ok");

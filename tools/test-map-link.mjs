/**
 * Map tokens link to fight rows, and the Fight tab links back.
 *   node tools/test-map-link.mjs
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

const hostSrc = read("map/ssdns-map-host.js");
const mapSrc = read("map/ssdns-map.js");
const v2src = read("dm/assets/js/v2.js");
check("src.picker", mapSrc.includes('aria-label="Link to…"') && mapSrc.includes("Current players") && mapSrc.includes("New custom enemy (Bandit)"));
check("src.hostLink", hostSrc.includes('name === "drawer:link"') && hostSrc.includes("linkChoices") && hostSrc.includes("placeToken"));
check("src.publicOmitsLink", !/function publicToken[\s\S]{0,700}combatantId/.test(mapSrc) && !/function publicToken[\s\S]{0,700}mapTokenId/.test(mapSrc));
check("src.publishOmitsLink", /function buildPublish\(\)[\s\S]{0,900}return \{/.test(v2src) && !/id: row\.id[\s\S]{0,400}mapTokenId/.test(v2src.slice(v2src.indexOf("function buildPublish"))));

function makeWindow() {
  const dom = new JSDOM(`<!doctype html><html><body>
    <div id="initList"></div>
    <div id="bestiaryList"></div>
    <button type="button" id="btnAddCustom">Add custom enemy</button>
  </body></html>`, { url: "http://localhost/", pretendToBeVisual: true, runScripts: "dangerously" });
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
  w.confirm = () => true;
  w.prompt = () => "";
  return w;
}

const beasts = [{
  id: "outlaw",
  name: "Outlaw",
  group: "generic-folk",
  ac: 13,
  hp: 11,
  dex: 12,
  attacks: "Revolver +4, 1d8 piercing"
}];
const remote = [];
const w = makeWindow();
w.fetch = async (url) => {
  const u = String(url);
  if (u.includes("bestiary")) return { ok: true, json: async () => beasts };
  return { ok: false, json: async () => ({}) };
};
w.DMCC = {
  $: (sel) => w.document.querySelector(sel),
  $$: (sel) => Array.from(w.document.querySelectorAll(sel)),
  esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); },
  state: {
    players: {},
    ledger: [],
    rolls: [],
    demo: false,
    roomCode: "DUST",
    uid: "dm",
    db: {},
    unsubs: [],
    meta: { dmUid: "dm" }
  },
  toast() {},
  uid(p) { w.__seq = (w.__seq || 0) + 1; return (p || "id") + w.__seq; },
  guardFocus(fn) { if (fn) fn(); },
  parseDice() { return { total: 4, detail: "4" }; },
  pushCommand() { return Promise.resolve(); },
  pushRoll() { return Promise.resolve(); },
  pushLedger() { return Promise.resolve(); },
  renderPlayers() {},
  roomRef(p) { return { path: "rooms/DUST/" + p }; },
  _fb: null
};
w.DMCC.state._fb = {
  ref(db, p) { return { path: p }; },
  update(ref, val) {
    remote.push({ op: "update", path: ref && ref.path, val: JSON.parse(JSON.stringify(val)) });
    return Promise.resolve();
  },
  set(ref, val) {
    remote.push({ op: "set", path: ref && ref.path, val: JSON.parse(JSON.stringify(val)) });
    return Promise.resolve();
  },
  onValue() { return function () {}; },
  get() { return Promise.resolve({ exists() { return false; }, val() { return null; } }); },
  remove() { return Promise.resolve(); }
};

function addScript(code) {
  const s = w.document.createElement("script");
  s.textContent = code;
  w.document.body.appendChild(s);
}
addScript(read("assets/js/apply-guard.js"));
addScript(read("assets/js/conditions.js"));
addScript(read("dm/assets/js/v2.js") + "\nwindow.__fightTest = { order: function () { return fight.order; }, secrets: function () { return fight.secrets; }, publicView: function () { return fight.publicView; }, undo: function () { return fight.undo; } };\n");

for (let n = 0; n < 30 && !(w.__fightTest && w.__fightTest.bestiary); n++) {
  if (w.__fightTest) break;
  await flush(20);
}
await flush(40);
check("boot.bestiary", !!(w.SSDNSMapCards && w.SSDNSMapCards.choices && w.SSDNSMapCards.choices().bestiary.some((g) => (g.options || []).some((b) => b.id === "outlaw"))));

addScript(read("map/ssdns-map-firebase.js"));
addScript(read("map/ssdns-map.js"));
const scene = JSON.parse(read("map/scene-dusty-spur.json"));
const mapWrites = [];
const adapter = w.SSDNSMapFirebase.memory({ role: "dm" });
const origWrite = adapter.write.bind(adapter);
adapter.write = (p, value, meta) => {
  mapWrites.push({ path: p, value: JSON.parse(JSON.stringify(value)) });
  return origWrite(p, value, meta);
};
const el = w.document.createElement("div");
el.id = "map";
w.document.body.appendChild(el);
const map = w.SSDNSMap.create({
  el,
  role: "dm",
  uid: "dm",
  adapter,
  host: {
    on(name, detail) {
      detail = detail || {};
      if (name === "drawer:link" && w.SSDNSMapFight && w.SSDNSMapFight.link) {
        Promise.resolve(w.SSDNSMapFight.link(detail)).then((patch) => {
          if (patch && map.applyLink) map.applyLink(detail.tokenId, patch);
          if (map.refreshCard) map.refreshCard(detail.tokenId || "");
        });
      }
      if (name === "combatant:remove" && w.SSDNSMapFight && w.SSDNSMapFight.onTokenRemoved) {
        w.SSDNSMapFight.onTokenRemoved(detail);
      }
    },
    getCard(id) { return w.SSDNSMapCards.get(id); },
    linkChoices() { return w.SSDNSMapCards.choices(); },
    players() { return []; }
  },
  options: { scene, assetBase: "", players: () => [], room: { table: { initiative: { order: [], turn: 0 } } } }
});
await flush(40);
w.SSDNSMapHost = {
  placeToken(spec) {
    const token = map.placeLinkedToken(spec || {});
    return token && token.id ? token.id : "";
  },
  removeToken(id) { map.removeToken(id); },
  tokenForPlayer(pid) {
    const token = map.tokenForPlayer(pid);
    return token && token.id ? token.id : "";
  },
  hasToken(id) { return map.hasToken(id); },
  releaseToken(id) { map.releaseToken(id); },
  syncInitiative() {}
};

function act(name) { return el.querySelector('[data-act="' + name + '"]'); }
function click(node) { node.dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true })); }
function screenOf(token) {
  const grid = scene.grid;
  const viewX = (grid.cols * grid.px) / 2;
  const viewY = (grid.rows * grid.px) / 2;
  const wx = (token.pos.x + 0.5) * grid.px;
  const wy = (token.pos.y + 0.5) * grid.px;
  return { x: (wx - viewX) + 400, y: (wy - viewY) + 300 };
}
function pointer(type, x, y) {
  const canvas = el.querySelector("canvas");
  const Ev = w.PointerEvent || w.MouseEvent;
  const ev = new Ev(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, button: 0, buttons: type === "pointerup" ? 0 : 1 });
  canvas.dispatchEvent(ev);
}
function pick(value) {
  const sel = act("linkPick");
  sel.value = value;
  sel.dispatchEvent(new w.Event("change", { bubbles: true }));
}
function enemyNamed(name) {
  return (w.__fightTest.order() || []).filter((row) => row && row.kind !== "player" && row.name && row.name.indexOf(name) === 0);
}

click(act("addTokenBtn"));
await flush(20);
const drawer = act("drawer");
const picker = act("linkPick");
check("empty.drawer", !!(drawer && drawer.textContent.includes("No card linked") && picker), drawer && drawer.textContent.slice(0, 160));
check("empty.groups", picker && picker.textContent.includes("Link to…") && picker.textContent.includes("New custom enemy (Bandit)") && picker.textContent.includes("Outlaw") && !picker.textContent.includes("Jolene"));
check("empty.order", w.__fightTest.order().length === 0);

pick("custom");
await flush(30);
const bandit = enemyNamed("Bandit")[0];
check("custom.row", !!(bandit && bandit.mapTokenId && bandit.attackList && bandit.attackList[0] && bandit.attackList[0].name === "Ball n Cap Revolver"), bandit && JSON.stringify({ name: bandit.name, map: bandit.mapTokenId, atk: bandit.attackList && bandit.attackList[0] && bandit.attackList[0].name }));
check("custom.card", act("drawer") && act("drawer").textContent.includes("Bandit") && act("drawer").textContent.includes("Ball n Cap"));
check("custom.token", map.hasToken(bandit.mapTokenId));
const pubTok = mapWrites.filter((row) => row.path === "map/public/tokens/" + bandit.mapTokenId).pop();
const dmTok = mapWrites.filter((row) => row.path === "map/dm/tokens/" + bandit.mapTokenId).pop();
check("custom.publicClean", !!(pubTok && pubTok.value && pubTok.value.combatantId == null && pubTok.value.mapTokenId == null && pubTok.value.label), JSON.stringify(pubTok && pubTok.value));
check("custom.dmLink", !!(dmTok && dmTok.value && dmTok.value.combatantId === bandit.id));
const secret = w.__fightTest.secrets()[bandit.id];
const shown = w.__fightTest.publicView()[bandit.id];
check("custom.secret", !!(secret && secret.mapTokenId === bandit.mapTokenId && secret.name && secret.name.indexOf("Bandit") === 0));
check("custom.publicView", !!(shown && shown.mapTokenId == null && shown.ac == null && shown.hp == null));
const tableWrite = remote.filter((row) => row.op === "update" && row.val && row.val.initiative).pop();
const dmWrite = remote.filter((row) => row.op === "set" && String(row.path).endsWith("encounter/dm")).pop();
const pubWrite = remote.filter((row) => row.op === "set" && String(row.path).endsWith("encounter/public")).pop();
check("custom.tableOrder", !!(tableWrite && tableWrite.val.initiative.order.every((row) => row && row.mapTokenId == null && row.ac == null && row.hp == null)));
check("custom.remoteSecret", !!(dmWrite && dmWrite.val[bandit.id] && dmWrite.val[bandit.id].mapTokenId === bandit.mapTokenId));
check("custom.remotePublic", !!(pubWrite && pubWrite.val[bandit.id] && pubWrite.val[bandit.id].mapTokenId == null && pubWrite.val[bandit.id].ac == null));

const beforeUndo = bandit.mapTokenId;
await w.SSDNSMapFight.hp({ tokenId: bandit.mapTokenId, combatantId: bandit.id, set: 4 });
check("undo.ready", w.__fightTest.undo() && w.__fightTest.undo().restoreHp);
await w.SSDNSMapFight.undo();
check("undo.hp", bandit.hp === 0, "hp " + bandit.hp);
check("undo.link", bandit.mapTokenId === beforeUndo && map.hasToken(beforeUndo));

w.DMCC.state.players.p_jolene = { snapshot: { name: "Jolene", player: "June", ac: 14, hpCurrent: 20, hpMax: 22, guns: [] } };
click(act("addTokenBtn"));
await flush(20);
check("player.listed", act("linkPick") && act("linkPick").textContent.includes("Jolene"));
pick("player:p_jolene");
await flush(20);
const playerRow = (w.__fightTest.order() || []).find((row) => row && (row.id === "p_jolene" || row.playerId === "p_jolene"));
check("player.notInFight", !playerRow);
check("player.card", act("drawer") && act("drawer").textContent.includes("Jolene") && act("drawer").textContent.includes("14"));
const pcToken = map.tokenForPlayer("p_jolene");
check("player.token", !!(pcToken && pcToken.ownerUid === "p_jolene" && pcToken.combatantId === "p_jolene" && pcToken.kind === "player"));

const holdPlace = w.SSDNSMapHost.placeToken;
w.SSDNSMapHost.placeToken = function () { return ""; };
const addOutlaw = w.document.querySelector('[data-add-beast="outlaw"]');
check("fight.button", !!addOutlaw);
click(addOutlaw);
await flush(20);
const loose = enemyNamed("Outlaw").filter((row) => !row.mapTokenId)[0];
check("fight.unlinked", !!(loose && loose.ac === 13 && loose.hp === 11), loose && JSON.stringify({ name: loose.name, ac: loose.ac, hp: loose.hp, map: loose.mapTokenId }));
loose.reveal = { name: false, ac: false, hp: false, block: false };
click(act("addTokenBtn"));
await flush(10);
check("fight.picker", act("linkPick") && act("linkPick").textContent.includes(loose.name));
pick("enemy:" + loose.id);
await flush(20);
check("fight.linked", loose.mapTokenId && map.hasToken(loose.mapTokenId) && act("drawer") && act("drawer").textContent.includes("Outlaw"));
const hiddenTok = mapWrites.filter((row) => row.path === "map/public/tokens/" + loose.mapTokenId).pop();
check("fight.hiddenLabel", hiddenTok && hiddenTok.value && hiddenTok.value.name === "Unknown gunman" && hiddenTok.value.mapTokenId == null && hiddenTok.value.combatantId == null, JSON.stringify(hiddenTok && hiddenTok.value));
check("fight.hiddenSecret", w.__fightTest.secrets()[loose.id] && w.__fightTest.secrets()[loose.id].name === "Outlaw" && w.__fightTest.secrets()[loose.id].mapTokenId === loose.mapTokenId);
check("fight.hiddenPublic", w.__fightTest.publicView()[loose.id] && w.__fightTest.publicView()[loose.id].name === "Unknown gunman" && w.__fightTest.publicView()[loose.id].mapTokenId == null);

w.SSDNSMapHost.placeToken = holdPlace;
const addAgain = () => w.document.querySelector('[data-add-beast="outlaw"]');
click(addAgain());
await flush(40);
click(addAgain());
await flush(40);
const placed = enemyNamed("Outlaw").filter((row) => row !== loose && row.mapTokenId);
check("place.count", placed.length >= 2, "placed " + placed.length + " order " + enemyNamed("Outlaw").map((row) => row.name + ":" + (row.mapTokenId || "")).join(" | "));
const positions = [];
placed.forEach((row) => {
  const live = mapWrites.filter((entry) => entry.path === "map/dm/tokens/" + row.mapTokenId).pop();
  if (live && live.value && live.value.pos) positions.push(live.value.pos.x + "," + live.value.pos.y);
});
check("place.unique", new Set(positions).size === positions.length && positions.length >= 2, positions.join(" "));
check("place.linked", placed.every((row) => map.hasToken(row.mapTokenId) && row.mapTokenId));

const doomed = placed[0];
const doomedId = doomed.mapTokenId;
const del = w.document.querySelector('[data-init-del="' + w.__fightTest.order().indexOf(doomed) + '"]');
check("remove.button", !!del);
click(del);
await flush(20);
check("remove.row", !w.__fightTest.order().includes(doomed));
check("remove.token", !map.hasToken(doomedId));

const other = placed[1];
if (!other) {
  check("remove.tokenClearsRow", false, "no second token");
  check("remove.tokenGone", false, "no second token");
} else {
const otherId = other.mapTokenId;
const otherPos = mapWrites.filter((entry) => entry.path === "map/dm/tokens/" + otherId).pop();
const pos = otherPos && otherPos.value && otherPos.value.pos;
const at = pos && screenOf({ pos: pos });
if (at) {
  pointer("pointerdown", at.x, at.y);
  pointer("pointerup", at.x, at.y);
}
await flush(10);
click(act("delTokenBtn"));
await flush(20);
check("remove.tokenClearsRow", !w.__fightTest.order().some((row) => row && row.id === other.id), (w.__fightTest.order() || []).map((row) => row && row.name).join(","));
check("remove.tokenGone", !map.hasToken(otherId));
}

const rules = read("database.rules.json");
check("rules.untouched", rules.includes('"encounter"') && !rules.includes("mapTokenId"));

if (failures.length) {
  console.error(failures.length + " failed");
  process.exit(1);
}
console.log("map link ok");

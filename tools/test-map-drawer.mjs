/**
 * M2 v4 DM drawer and walls on/off.
 *   node tools/test-map-drawer.mjs
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

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
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
    observe() {}
    disconnect() {}
    unobserve() {}
  };
  w.prompt = () => "Prone";
  return w;
}

function addScript(w, rel) {
  const s = w.document.createElement("script");
  s.textContent = read(rel);
  w.document.body.appendChild(s);
}

function pointer(w, el, type, x, y, extra) {
  const init = Object.assign({
    bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, button: 0, buttons: 1
  }, extra || {});
  const Ev = w.PointerEvent || w.MouseEvent;
  const ev = new Ev(type, init);
  el.dispatchEvent(ev);
}

function act(el, name) {
  return el.querySelector('[data-act="' + name + '"]');
}

async function boot(w, opts) {
  const el = w.document.createElement("div");
  el.id = opts.id;
  w.document.body.appendChild(el);
  const api = w.SSDNSMap.create({
    el, role: opts.role, uid: opts.uid, adapter: opts.adapter, host: opts.host, options: opts.options
  });
  await flush(60);
  return { el, api };
}

const src = read("map/ssdns-map.js");
check("src.wallsDraw", src.includes("sceneData().walls.length && role === 'dm' && state.showWalls"), "draw still ignores showWalls");
check("src.help", src.includes("Walls: OFF hides the lines so you can see the raw map. Walls still block."));
check("src.crossesIgnoresToggle", !/function crossesWall[\s\S]{0,500}showWalls/.test(src) && !/function raycastVisible[\s\S]{0,700}showWalls/.test(src));
check("src.events", ["drawer:attack", "drawer:target", "drawer:hp", "drawer:condition", "drawer:reload", "drawer:unload", "drawer:deathsave", "drawer:undo", "drawer:open", "drawer:close", "action:run", "initiative:next", "chat:send", "combatant:add"].every((name) => src.includes("'" + name + "'") || src.includes('"' + name + '"')));
check("src.noDice", !/function renderDrawer[\s\S]{0,3500}Math\.(random|floor)/.test(src));
check("css.drawer", read("map/ssdns-map.css").includes(".ssm-drawer") && read("map/ssdns-map.css").includes("max-height: 60%"));
check("cards.sample", JSON.parse(read("map/cards.json"))["enemy-bandit-1"].attacks[0].id === "ballncap");

const w = makeWindow();
addScript(w, "map/ssdns-map-firebase.js");
addScript(w, "map/ssdns-map.js");
const scene = JSON.parse(read("map/scene-dusty-spur.json"));
const tokens = JSON.parse(read("map/tokens.json"));
const cards = JSON.parse(read("map/cards.json"));
const events = [];
let playerCardCalls = 0;
const dmHost = {
  on(name, detail) { events.push({ name, detail }); },
  getCard(id) { return cards[id] || null; },
  actions: {
    get() { return [{ id: "sheet", label: "Sheet", enabled: true }]; },
    run() { return Promise.resolve(); }
  },
  players() { return []; }
};
const playerHost = {
  on(name, detail) { events.push({ name, detail }); },
  getCard(id) { playerCardCalls += 1; return cards[id] || null; }
};

const dmAd = w.SSDNSMapFirebase.memory({ role: "dm" });
const plAd = w.SSDNSMapFirebase.memory({ role: "player" });
const dm = await boot(w, {
  id: "dm", role: "dm", uid: "dm", adapter: dmAd, host: dmHost,
  options: { scene, tokens, assetBase: "", players: () => [], room: { table: { initiative: { order: [], turn: 0 } } } }
});
const player = await boot(w, {
  id: "player", role: "player", uid: "p_jolene", adapter: plAd, host: playerHost,
  options: { scene, assetBase: "", room: { table: { initiative: { order: [], turn: 0 } } } }
});

check("empty.tools", !!(act(dm.el, "pingBtn") && act(dm.el, "rulerBtn") && act(dm.el, "wallBtn") && act(dm.el, "addTokenBtn")));
act(dm.el, "pingBtn").click();
act(dm.el, "addTokenBtn").click();
await flush(20);
check("empty.drawer", !!act(dm.el, "drawer") && act(dm.el, "drawer").textContent.includes("No card linked"), act(dm.el, "drawer") && act(dm.el, "drawer").textContent);
check("empty.openEvent", events.some((e) => e.name === "drawer:open"));
act(dm.el, "drawerClose").click();
check("empty.close", !act(dm.el, "drawer") && events.some((e) => e.name === "drawer:close"));
dm.api.destroy();

const table = await boot(w, {
  id: "table", role: "dm", uid: "dm", adapter: w.SSDNSMapFirebase.memory({ role: "dm" }), host: dmHost,
  options: { scene, tokens, assetBase: "", players: () => [{ uid: "p_jolene", name: "Jolene" }], room: { table: { initiative: { order: [], turn: 0 } } } }
});
table.api.syncCombatants({
  round: 1, turn: 0, started: true,
  order: [{ id: "p_jolene", name: "Jolene", kind: "player" }, { id: "en_bandit1", name: "Bandit", kind: "enemy" }]
});
await flush(20);
const openChip = (label) => {
  const stripNow = act(table.el, "turnStrip");
  const chip = stripNow && [...stripNow.querySelectorAll("span")].find((s) => s.textContent.includes(label));
  if (chip) chip.click();
};
openChip("Jolene");
await flush(20);
const drawer = act(table.el, "drawer");
check("pc.drawer", !!(drawer && drawer.textContent.includes("Jolene") && drawer.textContent.includes("AC")), drawer && drawer.textContent.slice(0, 180));
const pcAtk = drawer && drawer.querySelector(".ssm-atk");
check("pc.attacksDisabled", !!(pcAtk && pcAtk.disabled));
const beforeAtk = events.filter((e) => e.name === "drawer:attack").length;
if (pcAtk) pcAtk.click();
check("pc.attackBlocked", events.filter((e) => e.name === "drawer:attack").length === beforeAtk);

act(table.el, "hpMinus").click();
act(table.el, "condBtn").click();
act(table.el, "reloadBtn").click();
act(table.el, "unloadBtn").click();
act(table.el, "deathBtn").click();
act(table.el, "undoBtnD").click();
check("pc.emits", ["drawer:hp", "drawer:condition", "drawer:reload", "drawer:unload", "drawer:deathsave", "drawer:undo"].every((name) => events.some((e) => e.name === name && e.detail.tokenId)));
const hp = events.filter((e) => e.name === "drawer:hp").pop();
const cond = events.filter((e) => e.name === "drawer:condition").pop();
check("pc.hpDelta", hp && hp.detail.delta === -1 && hp.detail.set == null);
check("pc.condOn", cond && cond.detail.condition === "Prone" && cond.detail.on === true);

table.api.syncCombatants({
  round: 1, turn: 1, started: true,
  order: [{ id: "p_jolene", name: "Jolene", kind: "player" }, { id: "en_bandit1", name: "Bandit", kind: "enemy" }]
});
await flush(20);
check("follow.bandit", act(table.el, "drawer") && act(table.el, "drawer").textContent.includes("Bandit") && act(table.el, "drawer").textContent.includes("Ball n Cap"));
const enemyAtk = act(table.el, "drawer").querySelector(".ssm-atk");
check("enemy.attackEnabled", !!(enemyAtk && !enemyAtk.disabled));
enemyAtk.click();
await flush(10);
check("enemy.attackEvent", events.some((e) => e.name === "drawer:attack" && e.detail.weaponId === "ballncap" && e.detail.tokenId === "tok_bandit1"));
check("enemy.pending", act(table.el, "drawer").textContent.includes("Click a token to target"));
w.document.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
await flush(10);
check("enemy.esc", act(table.el, "drawer") && !act(table.el, "drawer").textContent.includes("Click a token to target"));
enemyAtk.click();
await flush(10);
openChip("Jolene");
await flush(10);
check("enemy.target", events.some((e) => e.name === "drawer:target" && e.detail.weaponId === "ballncap" && e.detail.targetTokenId === "tok_jolene"));

openChip("Jolene");
await flush(10);
check("strip.click", act(table.el, "drawer") && act(table.el, "drawer").textContent.includes("Jolene"));
const strip = act(table.el, "turnStrip");
const next = [...(strip ? strip.querySelectorAll("button") : [])].find((b) => b.textContent === "Next");
if (next) next.click();
check("init.next", events.some((e) => e.name === "initiative:next"));

const wallsBtn = act(table.el, "wallsVisBtn");
wallsBtn.click();
check("walls.off", wallsBtn.textContent === "Walls: OFF" && !wallsBtn.classList.contains("active"));
act(table.el, "wallBtn").click();
check("walls.autoOn", act(table.el, "wallsVisBtn").textContent === "Walls: ON");
act(table.el, "wallsVisBtn").click();
check("walls.offAgain", act(table.el, "wallsVisBtn").textContent === "Walls: OFF");

const actionBtn = act(table.el, "actionSlot") && act(table.el, "actionSlot").querySelector("button");
if (actionBtn) actionBtn.click();
check("action.run", events.some((e) => e.name === "action:run"));

check("leak.noDrawer", !player.el.querySelector(".ssm-drawer") && playerCardCalls === 0, "calls " + playerCardCalls);
check("leak.noCardText", !player.el.innerHTML.includes("Ball n Cap") && !player.el.innerHTML.includes("No card linked"));
check("leak.noHiddenName", !player.el.textContent.includes("Bandit 1"));

table.api.refreshCard("tok_jolene");
table.api.destroy();
await flush(10);
check("destroy.clears", table.el.innerHTML === "" && !table.el.querySelector(".ssm-drawer"));
player.api.destroy();
check("destroy.player", player.el.innerHTML === "");

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\nmap drawer ok");

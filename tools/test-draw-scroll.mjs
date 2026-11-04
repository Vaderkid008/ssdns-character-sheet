/**
 * Token drawer and player card keep their scroll after a pick.
 *   node tools/test-draw-scroll.mjs
 *
 * Rebuilding the list used to remount the scroller (and Chrome drops scroll
 * when the focused row is removed). A pick, including a second pick before
 * the next frame, must leave the scroll where it was.
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

function makeWindow() {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost/",
    pretendToBeVisual: true,
    runScripts: "dangerously"
  });
  const w = dom.window;
  w.requestAnimationFrame = (cb) => w.setTimeout(() => cb(Date.now()), 16);
  w.cancelAnimationFrame = (id) => w.clearTimeout(id);
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
  /* Same jump Chrome makes when a focused row inside the scroller is removed. */
  const proto = w.Element.prototype;
  const desc = Object.getOwnPropertyDescriptor(proto, "innerHTML");
  Object.defineProperty(proto, "innerHTML", {
    configurable: true,
    enumerable: desc.enumerable,
    get() { return desc.get.call(this); },
    set(value) {
      let node = this;
      while (node) {
        if (node.classList && (
          node.classList.contains("ssm-drawer") ||
          node.classList.contains("ssm-drawer-body") ||
          node.classList.contains("ssdns-playercard") ||
          node.classList.contains("ssm-card-body")
        )) {
          node.scrollTop = 0;
          node.scrollLeft = 0;
        }
        node = node.parentElement;
      }
      desc.set.call(this, value);
    }
  });
  return w;
}
function addScript(w, rel) {
  const s = w.document.createElement("script");
  s.textContent = read(rel);
  w.document.body.appendChild(s);
}
function act(el, name) { return el.querySelector('[data-act="' + name + '"]'); }
function change(w, sel, value) {
  sel.focus();
  sel.value = value;
  sel.dispatchEvent(new w.Event("change", { bubbles: true }));
}

const mapSrc = read("map/ssdns-map.js");
check("src.keep", mapSrc.includes("function readPanelScroll") && mapSrc.includes("function writePanelScroll") && mapSrc.includes("_panelScrollKeep"));
check("src.player", /function paintPlayerFight\(\) \{[\s\S]{0,600}readPanelScroll\(panel\)/.test(mapSrc) && /writePanelScroll\(panel, keep\)/.test(mapSrc));
check("src.drawer", /function renderDrawer\(\) \{[\s\S]{0,900}readPanelScroll\(panel\)/.test(mapSrc) && mapSrc.includes("schedulePanelScroll(next, keep)"));

const scene = JSON.parse(read("map/scene-dusty-spur.json"));
const tokens = JSON.parse(read("map/tokens.json"));
const cards = JSON.parse(read("map/cards.json"));

const w = makeWindow();
addScript(w, "map/ssdns-map-firebase.js");
addScript(w, "map/ssdns-map.js");
const el = w.document.createElement("div");
el.id = "dm";
w.document.body.appendChild(el);
const api = w.SSDNSMap.create({
  el, role: "dm", uid: "dm",
  adapter: w.SSDNSMapFirebase.memory({ role: "dm" }),
  host: { on() {}, getCard(id) { return cards[id] || null; }, players() { return []; } },
  options: { scene, tokens, assetBase: "", players: () => [], room: { table: { initiative: { order: [], turn: 0 } } } }
});
await flush(40);
api.syncCombatants({
  round: 1, turn: 1, started: true,
  order: [{ id: "p_jolene", name: "Jolene", kind: "player" }, { id: "en_bandit1", name: "Bandit", kind: "enemy" }]
});
await flush(20);
const strip = act(el, "turnStrip");
const banditChip = strip && [...strip.querySelectorAll("span")].find((s) => s.textContent.includes("Bandit"));
if (banditChip) banditChip.click();
await flush(20);
const drawer = act(el, "drawer");
const target = drawer && (drawer.querySelector('[data-act="cylTarget"][data-main="1"]') || drawer.querySelector('[data-act="cylTarget"]'));
check("dm.open", !!(drawer && target && target.options.length > 1), drawer && drawer.textContent.slice(0, 120));
if (drawer && target) {
  const body = drawer.querySelector(".ssm-drawer-body");
  drawer.scrollTop = 140;
  drawer.scrollLeft = 12;
  body.scrollTop = 220;
  body.scrollLeft = 8;
  const bodyNode = body;
  const nextVal = [...target.options].map((o) => o.value).find((v) => v !== target.value);
  change(w, target, nextVal);
  const bodyNow = drawer.querySelector(".ssm-drawer-body");
  const picked = drawer.querySelector('[data-act="cylTarget"][data-main="1"]') || drawer.querySelector('[data-act="cylTarget"]');
  check("dm.remount", bodyNow && bodyNow !== bodyNode);
  check("dm.scroll", drawer.scrollTop === 140 && bodyNow.scrollTop === 220, "root " + drawer.scrollTop + " body " + (bodyNow && bodyNow.scrollTop));
  check("dm.scrollLeft", drawer.scrollLeft === 12 && bodyNow.scrollLeft === 8, "root " + drawer.scrollLeft + " body " + (bodyNow && bodyNow.scrollLeft));
  check("dm.picked", picked && picked.value === nextVal, picked && picked.value);
  drawer.scrollTop = 0;
  bodyNow.scrollTop = 0;
  const target2 = drawer.querySelector('[data-act="cylTarget"][data-main="1"]') || drawer.querySelector('[data-act="cylTarget"]');
  const back = [...target2.options].map((o) => o.value).find((v) => v !== target2.value);
  change(w, target2, back);
  const bodyRapid = drawer.querySelector(".ssm-drawer-body");
  check("dm.rapid", drawer.scrollTop === 140 && bodyRapid.scrollTop === 220, "root " + drawer.scrollTop + " body " + bodyRapid.scrollTop);
  await flush(40);
  const bodyFrame = drawer.querySelector(".ssm-drawer-body");
  check("dm.frame", drawer.scrollTop === 140 && bodyFrame.scrollTop === 220 && !drawer._panelScrollKeep, "root " + drawer.scrollTop + " body " + bodyFrame.scrollTop);
}
api.destroy();

const pw = makeWindow();
addScript(pw, "map/ssdns-map-firebase.js");
addScript(pw, "map/ssdns-map.js");
const pel = pw.document.createElement("div");
pw.document.body.appendChild(pel);
const attacks = [];
for (let i = 0; i < 12; i++) attacks.push({ id: "gun" + i, name: "Gun " + i, toHit: 4, damage: "1d8" });
pw.SSDNSMap.create({
  el: pel, role: "player", uid: "ada",
  adapter: pw.SSDNSMapFirebase.memory({ role: "player" }),
  host: {
    on() {},
    ownCard() {
      return { name: "Ada", calling: "gunslinger", ac: 14, hp: { cur: 18, max: 22 }, speed: 30, attacks: attacks, spells: [], conditions: [] };
    },
    sheetTargets() { return [{ id: "rustle", label: "Rustle" }, { id: "bandit", label: "Bandit" }, { id: "marshal", label: "Marshal" }]; }
  },
  options: { scene, assetBase: "", room: { table: { initiative: { order: [], turn: 0 } } } }
});
await flush(40);
const card = act(pel, "playerCard");
const playerTarget = card && act(card, "n62Target");
check("player.open", !!(card && playerTarget && playerTarget.options.length > 2), card && card.textContent.slice(0, 80));
if (card && playerTarget) {
  const body = card.querySelector(".ssm-card-body");
  card.scrollTop = 90;
  body.scrollTop = 260;
  const bodyNode = body;
  change(pw, playerTarget, "rustle");
  const bodyNow = card.querySelector(".ssm-card-body");
  check("player.sameBody", bodyNow === bodyNode);
  check("player.scroll", card.scrollTop === 90 && bodyNow.scrollTop === 260, "card " + card.scrollTop + " body " + bodyNow.scrollTop);
  check("player.picked", act(card, "n62Target").value === "rustle");
  card.scrollTop = 0;
  bodyNow.scrollTop = 0;
  change(pw, act(card, "n62Target"), "bandit");
  check("player.rapid", card.scrollTop === 90 && bodyNow.scrollTop === 260, "card " + card.scrollTop + " body " + bodyNow.scrollTop);
  card.scrollTop = 0;
  bodyNow.scrollTop = 0;
  change(pw, act(card, "n62Target"), "marshal");
  check("player.third", card.scrollTop === 90 && bodyNow.scrollTop === 260 && act(card, "n62Target").value === "marshal", "card " + card.scrollTop + " body " + bodyNow.scrollTop + " val " + (act(card, "n62Target") && act(card, "n62Target").value));
  await flush(40);
  check("player.frame", card.scrollTop === 90 && bodyNow.scrollTop === 260 && !card._panelScrollKeep, "card " + card.scrollTop + " body " + bodyNow.scrollTop);
}

if (failures.length) {
  console.error(failures.length + " failed");
  process.exit(1);
}
console.log("\ndraw scroll checks passed");

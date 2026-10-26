/**
 * Map card: DM HP bars, player card, Hide/Reveal, color menu, image patch.
 * An enemy bar reaches players only through reveal.hp (N68). A raw hp field on the public token does not.
 *   node tools/test-map-card.mjs
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
        if (p === "fillStyle" || p === "strokeStyle") w.__calls.push([p, [v]]);
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
function act(el, name) { return el.querySelector('[data-act="' + name + '"]'); }
function pointer(w, el, type, x, y) {
  const ev = new w.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons: type === "pointerup" ? 0 : 1 });
  el.dispatchEvent(ev);
}

const src = read("map/ssdns-map.js");
check("src.noPlayerBar", !src.includes("ssdns-rightbar") || src.indexOf("role === 'dm'") < src.indexOf("ssdns-rightbar"));
check("src.playerCard", src.includes("playerCard") && src.includes("ssdns.playerCard"));
check("src.hideReveal", src.includes("Hide/Reveal"));
check("src.noFogList", !src.includes('data-act="fogHistory"'));
check("src.colors", src.includes("Dust Blue") && src.includes("Custom"));
check("src.dmHp", src.includes("an enemy or NPC only when that combatant's reveal.hp is public"));
check("rules.untouched", !read("database.rules.json").includes("tokenImages"));

const w = makeWindow();
addScript(w, "map/token-crop.js");
addScript(w, "map/ssdns-map-firebase.js");
addScript(w, "map/ssdns-map.js");
const scene = JSON.parse(read("map/scene-dusty-spur.json"));
const store = { pub: {}, dm: {} };
const bus = [];
const events = [];
const dmAd = w.SSDNSMapFirebase.memory({ role: "dm", store, bus });
const dmEl = w.document.createElement("div");
w.document.body.appendChild(dmEl);
const dm = w.SSDNSMap.create({
  el: dmEl, role: "dm", uid: "dm", adapter: dmAd,
  host: {
    on(name, detail) { events.push(name + ":" + JSON.stringify(detail || {})); },
    players() { return [{ uid: "ada", name: "Ada Lovelace", portrait: "tokenImages/jolene.webp" }]; },
    getCard(id) {
      if (id === "ply_ada" || id === "ada") return { name: "Ada", kind: "pc", ac: 14, hp: { cur: 3, max: 12 }, speed: 30, conditions: ["Prone"], attacks: [], spells: [], dmActsAs: false, deathSaves: null };
      return null;
    }
  },
  options: { scene, tokens: { tokens: {} }, assetBase: "map/", players: () => [{ uid: "ada", name: "Ada Lovelace", portrait: "tokenImages/jolene.webp" }], room: { table: { initiative: { order: [], turn: 0 } } } }
});
await flush(80);
check("dm.noPlayerCard", !act(dmEl, "playerCard"));
check("dm.rightbar", !!dmEl.querySelector(".ssdns-rightbar"));
check("dm.color", act(dmEl, "colorBtn") && act(dmEl, "colorBtn").tagName === "SELECT" && act(dmEl, "colorBtn").textContent.indexOf("Dust Blue") >= 0 && act(dmEl, "colorBtn").textContent.indexOf("Custom") >= 0);
w.__calls = [];
dm.requestDraw();
await flush(40);
const fills = w.__calls.filter((c) => c[0] === "fillStyle").map((c) => c[1][0]);
check("dm.hpBar", fills.indexOf("#4caf50") >= 0 || fills.indexOf("#f44336") >= 0, fills.join(","));

const plAd = w.SSDNSMapFirebase.memory({ role: "player", store, bus });
const plEl = w.document.createElement("div");
w.document.body.appendChild(plEl);
w.__calls = [];
w.SSDNSMap.create({
  el: plEl, role: "player", uid: "ada", adapter: plAd, host: { on() {} },
  options: { scene, assetBase: "map/", room: { table: { initiative: { order: [], turn: 0 } } } }
});
await flush(80);
check("player.card", !!act(plEl, "playerCard") && !plEl.querySelector(".ssdns-rightbar"));
check("player.tools", !!act(plEl, "playerPingBtn") && !!act(plEl, "playerHiddenBtn") && !!act(plEl, "actionSlot"));
check("player.noToolbarDup", plEl.querySelectorAll("[data-act='playerPingBtn']").length === 1);
const playerFills = w.__calls.filter((c) => c[0] === "fillStyle").map((c) => String(c[1][0]));
check("player.noHpBar", playerFills.indexOf("#4caf50") < 0 && playerFills.indexOf("#f44336") < 0 && playerFills.indexOf("#ff9800") < 0, playerFills.join(","));

const card = act(plEl, "playerCard");
const head = act(plEl, "playerCardHead");
pointer(w, head, "pointerdown", 40, 40);
pointer(w, head, "pointermove", 120, 90);
pointer(w, head, "pointerup", 120, 90);
check("player.dragged", card.style.left !== "" && card.style.top !== "");
act(plEl, "playerCardMin").click();
check("player.min", card.classList.contains("min"));
const saved = JSON.parse(w.localStorage.getItem("ssdns.playerCard") || "{}");
check("player.remembered", saved.min === true && isFinite(saved.x), JSON.stringify(saved));

act(plEl, "playerHiddenBtn").click();
await flush(20);
const veil = store.pub["map/public/tokens/ply_ada/patch"];
check("player.veil", !!(veil && veil.value && veil.value.veil === true && veil.value.image == null), JSON.stringify(veil && veil.value));

store.pub["map/public/tokens/tok_foe"] = {
  value: { id: "tok_foe", name: "Foe", label: "Foe", kind: "enemy", pos: { x: 4, y: 4 }, size: 1, color: "#888", hp: 4, maxHp: 10, sceneId: "scn_dustyspur01" },
  seq: Date.now()
};
await flush(40);
w.__calls = [];
await flush(30);
const leaked = w.__calls.filter((c) => c[0] === "fillStyle").map((c) => String(c[1][0]));
check("player.leakedHpHidden", leaked.indexOf("#4caf50") < 0 && leaked.indexOf("#f44336") < 0, leaked.join(","));

await plAd.write("map/public/tokens/ply_ada/patch", { seq: Date.now(), by: "ada", color: "#ffffff", image: "data:image/webp;base64,QQ" }, { seq: Date.now(), by: "ada" });
await flush(30);
const ada = store.pub["map/public/tokens/ply_ada"];
check("player.imageIgnored", !(ada && ada.value && String(ada.value.image || "").indexOf("base64") >= 0), JSON.stringify(ada && ada.value && { image: ada.value.image, color: ada.value.color }));

dm.destroy();
if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\nmap card checks passed");

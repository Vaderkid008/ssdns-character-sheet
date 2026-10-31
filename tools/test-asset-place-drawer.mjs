/**
 * Asset Place must not block the character drawer.
 *   node tools/test-asset-place-drawer.mjs
 * The library is a non-modal panel on the map. Place is one shot (Esc / right-click
 * cancel it). A player or creature click opens the fight drawer again afterwards.
 * An asset token still opens the asset drawer.
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

const libSrc = read("map/asset-library.js");
const mapSrc = read("map/ssdns-map.js");
check("src.noModal", !libSrc.includes("showModal") && libSrc.includes("ui.dlg.show()"));
check("src.mount", mapSrc.includes("mount: () => el"));
const placeCall = mapSrc.indexOf("assetClick(e)");
const downCall = mapSrc.indexOf("onPointerDown(e)");
check("src.placeBeforeTools", placeCall > 0 && downCall > placeCall);
check("src.placeClears", /function assetClick[\s\S]{0,700}state\.placeAsset = null/.test(mapSrc));

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
  w.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
  return w;
}
function addScript(w, rel) {
  const s = w.document.createElement("script");
  s.textContent = read(rel);
  w.document.body.appendChild(s);
}
function pointer(w, el, type, x, y, extra) {
  const init = Object.assign({
    bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1,
    button: 0, buttons: 1, pointerType: "mouse"
  }, extra || {});
  const Ev = w.PointerEvent || w.MouseEvent;
  const ev = new Ev(type, init);
  if (ev.button !== init.button) {
    try { Object.defineProperty(ev, "button", { value: init.button }); } catch (e) {}
  }
  el.dispatchEvent(ev);
}
function clickAt(w, canvas, x, y, extra) {
  pointer(w, canvas, "pointerdown", x, y, extra);
  pointer(w, canvas, "pointerup", x, y, extra);
}
function clickBox(w, canvas, box, extra) {
  clickAt(w, canvas, (box.screen.x1 + box.screen.x2) / 2, (box.screen.y1 + box.screen.y2) / 2, extra);
}
function drawerText(el) {
  const d = el.querySelector('[data-act="drawer"]');
  return d ? d.textContent.replace(/\s+/g, " ").trim() : "";
}
function assetsOf(api) {
  return api.tokenBoxes().filter((b) => b.kind === "asset");
}

const w = makeWindow();
addScript(w, "map/ssdns-map-firebase.js");
addScript(w, "map/token-size.js");
addScript(w, "map/asset-library.js");
addScript(w, "map/ssdns-map.js");

const scene = JSON.parse(read("map/scene-dusty-spur.json"));
const tokens = JSON.parse(read("map/tokens.json"));
const banditCard = {
  kind: "enemy", name: "Bandit 2", ac: 12, hp: { cur: 5, max: 11 }, speed: 30,
  attacks: [{ id: "ballncap", name: "Ball n Cap", toHit: 3, damage: "1d8 piercing" }],
  spells: [], conditions: []
};
const def = w.SSDNSAssetLibrary.newDef({ name: "Porch lantern", size: 1, image: "https://cdn.test/lantern.webp" }, {});
w.localStorage.setItem("ssdns.assets.v1", JSON.stringify({ [def.id]: def }));

const el = w.document.createElement("div");
el.className = "ssdns-map";
w.document.body.appendChild(el);
const api = w.SSDNSMap.create({
  el, role: "dm", uid: "dm",
  adapter: w.SSDNSMapFirebase.memory({ role: "dm" }),
  host: {
    on() {},
    getCard(id) { return (id === "tok_bandit2" || id === "en_bandit2") ? banditCard : null; },
    players() { return []; }
  },
  options: { scene, tokens, assetBase: "", room: { table: { initiative: { order: [], turn: 0 } } } }
});
await flush(80);
let boxes = api.tokenBoxes();
for (let i = 0; boxes.length < 3 && i < 20; i++) { await flush(50); boxes = api.tokenBoxes(); }
const bandit = () => api.tokenBoxes().find((b) => b.id === "tok_bandit2");
const canvas = el.querySelector("canvas:not(.ssm-fx)");
check("boot.bandit", !!bandit() && !!canvas, JSON.stringify(bandit() && bandit().screen));

el.querySelector('[data-act="assetsBtn"]').click();
const dlg = () => el.querySelector("dialog.al-dialog");
check("panel.open", !!(dlg() && dlg().open));
check("panel.notModal", !!(dlg() && !dlg().matches(":modal")));
check("panel.onMap", !!(dlg() && dlg().parentNode === el));
clickBox(w, canvas, bandit());
check("panel.tokenOpens", api.drawerTokenId() === "tok_bandit2" && /Ball n Cap/.test(drawerText(el)) && !/This copy on the map/.test(drawerText(el)), drawerText(el).slice(0, 140));
check("panel.staysOpen", !!(dlg() && dlg().open));

dlg().querySelector("[data-al-place]").click();
check("place.closed", !!(dlg() && !dlg().open));
const before = assetsOf(api).length;
clickAt(w, canvas, 40, 40);
const placed = assetsOf(api);
check("place.one", placed.length === before + 1 && /This copy on the map/.test(drawerText(el)) && /Porch lantern/.test(drawerText(el)), drawerText(el).slice(0, 120) + " n=" + placed.length);
clickBox(w, canvas, bandit());
check("place.thenCreature", api.drawerTokenId() === "tok_bandit2" && /Ball n Cap/.test(drawerText(el)) && !/This copy on the map/.test(drawerText(el)), api.drawerTokenId() + " " + drawerText(el).slice(0, 120));
const assetBox = assetsOf(api)[0];
clickBox(w, canvas, assetBox);
check("place.assetPath", api.drawerTokenId() === assetBox.id && /This copy on the map/.test(drawerText(el)), api.drawerTokenId());

el.querySelector('[data-act="assetsBtn"]').click();
dlg().querySelector("[data-al-place]").click();
canvas.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
const afterEsc = assetsOf(api).length;
clickBox(w, canvas, bandit());
check("esc.cancels", assetsOf(api).length === afterEsc && api.drawerTokenId() === "tok_bandit2", "assets " + assetsOf(api).length + " drawer " + api.drawerTokenId());

el.querySelector('[data-act="assetsBtn"]').click();
dlg().querySelector("[data-al-place]").click();
clickAt(w, canvas, 80, 40, { button: 2, buttons: 2 });
const afterRight = assetsOf(api).length;
clickBox(w, canvas, bandit());
check("right.cancels", assetsOf(api).length === afterRight && api.drawerTokenId() === "tok_bandit2");

el.querySelector('[data-act="assetsBtn"]').click();
dlg().querySelector("[data-al-place]").click();
api.setTool("ping");
const beforeTool = assetsOf(api).length;
clickAt(w, canvas, 700, 500);
check("tool.placeWins", assetsOf(api).length === beforeTool + 1, "n=" + assetsOf(api).length);
api.setTool("ping");
clickBox(w, canvas, bandit());
check("tool.thenCreature", api.drawerTokenId() === "tok_bandit2" && /Attacks/.test(drawerText(el)), drawerText(el).slice(0, 80));

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("asset place drawer ok");

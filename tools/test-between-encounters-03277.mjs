/**
 * World maps open as a real scene, and an empty room starts on the title cover.
 * Sheet 0.3.284 / DMCC 0.2.297.
 *   node tools/test-between-encounters-03277.mjs
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
check("ver", ver.sheet === "0.3.284" && ver.dmcc === "0.2.297" && ver.sheetBuild === "sheet-playtest-v03284" && ver.dmccBuild === "dmcc-playtest-v02297");
check("rules.clean", !read("assets/data/rules.js").includes("0.3.284") && !read("database.rules.json").includes("0.3.284"));
check("fallback.dusty", read("map/ssdns-map.js").includes("return my?.sceneId || shared.playerScenes?.[uid] || 'scn_dustyspur01'") && read("map/ssdns-map.js").includes("const DEFAULT_SCENE_ID = 'scn_between'"));

const sb = {}; sb.window = sb; vm.createContext(sb);
vm.runInContext(read("map/map-packs.js"), sb);
const cover = sb.SSDNS_MAP_PACKS.scenes.find((s) => s.id === "scn_between");
const dusty = sb.SSDNS_MAP_PACKS.scenes.find((s) => s.id === "scn_dustyspur01");
check("pack.cover", !!cover && cover.name === "Six-Shooters & Sorcery — Between Encounters" && cover.grid.show === false && cover.grid.labels === false && cover.grid.px === 70 && cover.play.ambient === "bright" && cover.play.fogOff === true && cover.backdrop === true);
check("pack.dustyStays", sb.SSDNS_MAP_PACKS.scenes[0].id === "scn_dustyspur01" && dusty && dusty.img === "dusty-spur-saloon_30x20_70px.webp");
check("pack.files", fs.existsSync(path.join(root, "map", cover.img)) && fs.existsSync(path.join(root, "map", cover.thumb)));

function makeWindow() {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/dm/", pretendToBeVisual: true, runScripts: "dangerously" });
  const w = dom.window;
  const proto = w.HTMLElement.prototype;
  Object.defineProperty(proto, "clientWidth", { configurable: true, get() { return 800; } });
  Object.defineProperty(proto, "clientHeight", { configurable: true, get() { return 600; } });
  Object.defineProperty(w.HTMLCanvasElement.prototype, "clientWidth", { configurable: true, get() { return 800; } });
  Object.defineProperty(w.HTMLCanvasElement.prototype, "clientHeight", { configurable: true, get() { return 600; } });
  proto.getBoundingClientRect = function () { return { x: 0, y: 0, left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, toJSON() { return {}; } }; };
  w.__fills = [];
  w.__strokes = [];
  w.__images = [];
  w.HTMLCanvasElement.prototype.getContext = function () {
    const bag = {};
    return new Proxy(bag, {
      get(t, p) {
        if (p in t) return t[p];
        if (p === "drawImage") return function () { w.__images.push(arguments[0] && arguments[0].src); };
        if (p === "stroke") return function () { w.__strokes.push(String(t.strokeStyle || "")); return bag; };
        if (typeof p !== "string") return undefined;
        return function () { return bag; };
      },
      set(t, p, v) {
        if (p === "fillStyle") w.__fills.push(String(v));
        t[p] = v;
        return true;
      }
    });
  };
  w.HTMLImageElement.prototype.decode = function () { return Promise.resolve(); };
  const srcDesc = Object.getOwnPropertyDescriptor(w.HTMLImageElement.prototype, "src");
  w.__srcs = [];
  Object.defineProperty(w.HTMLImageElement.prototype, "src", {
    configurable: true,
    set(v) { w.__srcs.push(String(v)); return srcDesc.set.call(this, v); },
    get() { return srcDesc.get.call(this); }
  });
  w.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
  return w;
}
function addScript(w, rel) { const s = w.document.createElement("script"); s.textContent = read(rel); w.document.body.appendChild(s); }
function bootMap(w, opts) {
  ["map/token-crop.js", "map/ssdns-map-firebase.js", "map/map-packs.js", "map/map-library.js", "map/ssdns-map.js"].forEach((f) => addScript(w, f));
  const scene = JSON.parse(read("map/scene-dusty-spur.json"));
  const el = w.document.createElement("div");
  w.document.body.appendChild(el);
  const map = w.SSDNSMap.create(Object.assign({
    el, uid: opts.uid || "dm", adapter: opts.adapter, host: { players: () => opts.players || [] },
    options: {
      scene, tokens: { tokens: opts.tokens || {} }, assetBase: "../map/",
      players: () => opts.players || [],
      ensureScene: !!opts.ensureScene,
      room: { table: { initiative: { order: [], turn: 0 } } }
    }
  }, { role: opts.role || "dm" }));
  return { el, map };
}

const players = [{ uid: "hero", id: "hero", name: "Ada" }];
const tokens = {
  tok_hero: { id: "tok_hero", kind: "player", name: "Ada", ownerUid: "hero", sceneId: "scn_dustyspur01", pos: { x: 4, y: 4 }, color: "#c9a227" },
  tok_bandit: { id: "tok_bandit", kind: "enemy", name: "Bandit", sceneId: "scn_dustyspur01", pos: { x: 8, y: 4 }, color: "#8a3a2a" },
  pty_scn_dustyspur01: { id: "pty_scn_dustyspur01", kind: "party", storyMarker: "party", name: "Party", sceneId: "scn_dustyspur01", pos: { x: 2, y: 2 }, color: "#c9a227" }
};

const wExist = makeWindow();
const storeExist = { pub: {}, dm: {} }, busExist = [];
const dmExistAd = wExist.SSDNSMapFirebase ? null : null;
addScript(wExist, "map/ssdns-map-firebase.js");
const existAd = wExist.SSDNSMapFirebase.memory({ role: "dm", store: storeExist, bus: busExist });
const exist = bootMap(wExist, { adapter: existAd, tokens, players });
await flush(80);
exist.map.maps().sceneState("scn_dustyspur01").walls.push({ x1: 1, y1: 1, x2: 4, y2: 1 });
exist.map.ensureDefaultScene();
await flush(40);
check("existing.staysDusty", exist.map.maps().current() === "scn_dustyspur01" && exist.map.maps().sceneState("scn_dustyspur01").walls.length === 1);
check("existing.tokens", tokens.tok_hero.sceneId === "scn_dustyspur01" && exist.map.maps().sceneState);

const w = makeWindow();
addScript(w, "map/ssdns-map-firebase.js");
const store = { pub: {}, dm: {} }, bus = [];
const dmAd = w.SSDNSMapFirebase.memory({ role: "dm", store, bus });
const dm = bootMap(w, { adapter: dmAd, tokens, players, ensureScene: true });
await flush(80);
const api = dm.map.maps();
check("empty.cover", api.current() === "scn_between");
const hero = store.pub["map/public/tokens/ply_hero"] || store.pub["map/public/tokens/tok_hero"];
check("empty.keepsDustyTokens", hero && hero.value.sceneId === "scn_dustyspur01" && store.pub["map/public/tokens/tok_bandit"].value.sceneId === "scn_dustyspur01" && store.pub["map/public/tokens/pty_scn_dustyspur01"].value.sceneId === "scn_dustyspur01");
const seated = store.pub["map/public/playerScenes"] && store.pub["map/public/playerScenes"].value;
check("empty.seatsNewPlayer", seated && seated.hero === "scn_between");
const coverScene = store.pub["map/public/scenes/scn_between"].value;
check("empty.coverBright", coverScene.fogRevealed === true && coverScene.ambient === "bright" && !(coverScene.fogShapes || []).length);
check("empty.gridOff", api.gridOf(api.list().find((s) => s.id === "scn_between")).show === false);

w.SSDNSMapLibrary.open(api);
const dlg = w.document.querySelector(".ml-dialog");
dlg.querySelector('[data-ml-folder="world"]').click();
const card = dlg.querySelector('[data-ml-card="world_deadwood"]');
check("world.buttons", !!card && !!card.querySelector('[data-ml-asmap="world_deadwood"]') && card.querySelector('[data-ml-asmap="world_deadwood"]').textContent === "Open as map" && !!card.querySelector('[data-ml-push="world_deadwood"]') && card.querySelector('a[target="_blank"]') && /Open/.test(card.querySelector("a").textContent));
card.querySelector('[data-ml-asmap="world_deadwood"]').click();
await flush(40);
check("world.opened", api.current() === "scn_world_deadwood" && /world_deadwood\.webp$/.test(api.library()["scn_world_deadwood"].src));
const wg = api.gridOf(api.list().find((s) => s.id === "scn_world_deadwood"));
check("world.gridOff", wg.show === false && wg.labels === false && wg.cols === 34 && wg.rows === 15);
check("world.bright", api.sceneState("scn_world_deadwood").fogRevealed === true && api.sceneState("scn_world_deadwood").ambient === "bright" && api.sceneState("scn_world_deadwood").seededWorld === true);
api.sceneState("scn_world_deadwood").walls.push({ x1: 2, y1: 2, x2: 6, y2: 2 });
store.pub["map/public/tokens/tok_bandit"].value.sceneId = "scn_world_deadwood";
card.querySelector('[data-ml-asmap="world_deadwood"]').click();
await flush(40);
check("world.reuse", api.current() === "scn_world_deadwood" && api.sceneState("scn_world_deadwood").walls.length === 1 && store.pub["map/public/tokens/tok_bandit"].value.sceneId === "scn_world_deadwood" && Object.keys(api.library()).filter((id) => id === "scn_world_deadwood").length === 1);
dlg.querySelector("[data-ml-close]").click();

api.swap("scn_dustyspur01");
await flush(20);
store.pub["map/public/tokens/tok_bandit"].value.sceneId = "scn_dustyspur01";
w.__strokes.length = 0;
w.__fills.length = 0;
w.__images.length = 0;
dm.el.querySelector('[data-act="betweenBtn"]').click();
await flush(40);
check("between.dm", api.current() === "scn_between" && dm.el.querySelector('[data-act="fogBtn"]').textContent === "Fog: OFF");
const heroNow = store.pub["map/public/tokens/ply_hero"] || store.pub["map/public/tokens/tok_hero"];
check("between.players", heroNow && heroNow.value.sceneId === "scn_between" && store.pub["map/public/playerScenes"].value.hero === "scn_between");
check("between.leavesOthers", store.pub["map/public/tokens/tok_bandit"].value.sceneId === "scn_dustyspur01" && store.pub["map/public/tokens/pty_scn_dustyspur01"].value.sceneId === "scn_dustyspur01");
check("between.gridHidden", !w.__strokes.some((s) => s.indexOf("232,220,200") >= 0));
const zoomDm = parseFloat((dm.el.querySelector('[data-act="zoomLabel"]') || {}).textContent);
const worldW = 37 * 70, worldH = 21 * 70;
const expectZoom = Math.min((800 - 16) / worldW, (600 - 16) / worldH);
check("between.contain", Math.abs(zoomDm - expectZoom) < 0.02, zoomDm + " vs " + expectZoom);
check("between.drewCover", w.__images.some((src) => /between-encounters\.webp/.test(String(src))) || w.__srcs.some((src) => /between-encounters\.webp/.test(src)));

const wP = makeWindow();
addScript(wP, "map/ssdns-map-firebase.js");
const playerAd = wP.SSDNSMapFirebase.memory({ role: "player", store, bus });
const player = bootMap(wP, { role: "player", uid: "hero", adapter: playerAd, tokens: {}, players });
await flush(80);
check("player.image", wP.__srcs.some((src) => /between-encounters\.webp/.test(src)));
check("player.noFogFill", !wP.__fills.some((f) => f === "#0a0806" || f === "rgba(16, 16, 20, 0.72)"));
check("player.drewImage", wP.__images.some((src) => /between-encounters\.webp/.test(String(src))));
check("player.noButton", !player.el.querySelector('[data-act="betweenBtn"]'));
const zoomPl = parseFloat((player.el.querySelector('[data-act="zoomLabel"]') || {}).textContent);
check("player.contain", Math.abs(zoomPl - expectZoom) < 0.02, zoomPl + " vs " + expectZoom);

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\nall passed");

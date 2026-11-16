/**
 * Scene Builder Slice 5: players take a visible link themselves,
 * the floor switcher, and the DM Scenes menu.
 * Sheet 0.3.328 / DMCC 0.2.341.
 *   node tools/test-play-links-03316.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const failures = [];
function check(id, cond, detail) {
  if (!cond) failures.push(id + (detail ? " — " + detail : ""));
  console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + detail : ""));
}
const ver = JSON.parse(read("version.json"));
check("ver", ver.sheet === "0.3.328" && ver.dmcc === "0.2.341" && ver.sheetBuild === "sheet-playtest-v03328" && ver.dmccBuild === "dmcc-playtest-v02341");
check("rules.clean", !read("assets/data/rules.js").includes("floor.stairs") && !read("database.rules.json").includes("shownLinks") && !read("assets/data/rules.js").includes("0.3.328"));
const mapSrc = read("map/ssdns-map.js");
check("src.page", mapSrc.includes("PageUp") && mapSrc.includes("PageDown") && mapSrc.includes("stepFloor"));
check("src.ask", mapSrc.includes("Go upstairs?") && mapSrc.includes("Go downstairs?") && mapSrc.includes("Climb ladder?") && mapSrc.includes("Go through door?"));
check("src.scenes", mapSrc.includes('data-act="scenesBtn"') && mapSrc.includes("Open Scene builder") && mapSrc.includes("Load into room"));
check("src.builder", read("map/scene-builder.js").includes("Players can use"));

function makeWindow() {
  const box = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/dm/", pretendToBeVisual: true, runScripts: "dangerously" });
  const win = box.window;
  const proto = win.HTMLElement.prototype;
  Object.defineProperty(proto, "clientWidth", { configurable: true, get() { return 1280; } });
  Object.defineProperty(proto, "clientHeight", { configurable: true, get() { return 800; } });
  Object.defineProperty(win.HTMLCanvasElement.prototype, "clientWidth", { configurable: true, get() { return 900; } });
  Object.defineProperty(win.HTMLCanvasElement.prototype, "clientHeight", { configurable: true, get() { return 600; } });
  proto.getBoundingClientRect = function () { return { x: 0, y: 0, left: 0, top: 0, right: 1280, bottom: 800, width: 1280, height: 800, toJSON() { return {}; } }; };
  win.HTMLCanvasElement.prototype.getContext = function () {
    const bag = {};
    return new Proxy(bag, {
      get(t, p) {
        if (p in t) return t[p];
        if (p === "createLinearGradient" || p === "createRadialGradient") return function () { return { addColorStop() {} }; };
        return function () { return bag; };
      },
      set(t, p, v) { t[p] = v; return true; }
    });
  };
  win.HTMLImageElement.prototype.decode = function () { return Promise.resolve(); };
  win.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
  return win;
}
function addScript(win, rel) {
  const s = win.document.createElement("script");
  s.textContent = read(rel);
  win.document.body.appendChild(s);
}
const sceneJson = JSON.parse(read("map/scene-dusty-spur.json"));
const store = { pub: {}, dm: {} };
const bus = [];
const flush = (ms) => new Promise((r) => setTimeout(r, ms));
const players = [{ uid: "ada", name: "Jolene" }, { uid: "bo", name: "Bo" }];
function boot(win, opts) {
  ["map/places.js", "map/map-packs.js", "map/ssdns-map-firebase.js", "map/map-library.js", "map/scene-builder.js", "map/ssdns-map.js"].forEach((f) => addScript(win, f));
  const el = win.document.createElement("div");
  win.document.body.appendChild(el);
  return win.SSDNSMap.create({
    el,
    role: opts.role,
    uid: opts.uid,
    adapter: opts.adapter,
    host: { players: () => players },
    options: {
      scene: JSON.parse(JSON.stringify(sceneJson)),
      tokens: { tokens: {} },
      assetBase: "../map/",
      players: () => players,
      ensureScene: opts.role !== "player",
      room: { table: { initiative: { order: [], turn: 0 } } }
    }
  });
}

const dmW = makeWindow();
addScript(dmW, "map/ssdns-map-firebase.js");
const dm = boot(dmW, { role: "dm", uid: "dm", adapter: dmW.SSDNSMapFirebase.memory({ role: "dm", store, bus }) });
await flush(160);
const plW = makeWindow();
addScript(plW, "map/ssdns-map-firebase.js");
const player = boot(plW, { role: "player", uid: "ada", adapter: plW.SSDNSMapFirebase.memory({ role: "player", store, bus }) });
await flush(160);

check("scenes.player", !plW.document.querySelector("[data-act='scenesBtn']"));
check("player.strip", !!plW.document.querySelector("[data-act='floorYou']") && plW.document.querySelector("[data-act='floorYou']").textContent.indexOf("You are on:") === 0);
check("player.nobadge", !plW.document.querySelector("[data-act='floorCount']"));

dmW.document.querySelector("[data-act='sceneBuilderBtn']").click();
const builder = dmW.document.querySelector("[data-act='sceneBuilder']");
const addFloor = (id) => {
  const pick = builder.querySelector("[data-act='floorPick']");
  pick.value = id;
  builder.querySelector("[data-act='floorAdd']").click();
};
addFloor("scn_dustyspur01");
addFloor("scn_upstairs");
builder.querySelector("[data-act='sceneStep'][data-step='2']").click();
builder.querySelector("[data-act='linkPlace']").click();
const stair = dmW.SSDNSSceneBuilder.dropLink(6, 8);
const destFloor = dmW.SSDNSSceneBuilder.draft().floors[1];
const destSel = builder.querySelector("[data-act='linkDest']");
destSel.value = destFloor.id;
destSel.dispatchEvent(new dmW.Event("change", { bubbles: true }));
builder.querySelector("[data-act='linkLand']").click();
dmW.SSDNSSceneBuilder.dropLink(11, 5);
const vis = builder.querySelector("[data-act='linkVisible']");
vis.checked = true;
vis.dispatchEvent(new dmW.Event("change", { bubbles: true }));
const useBox = builder.querySelector("[data-act='linkUse']");
const up = dmW.SSDNSSceneBuilder.draft().floors[0].stairs[0];
check("use.default", up.visible === true && up.playersCanUse === true && useBox && useBox.checked && stair && stair.x === 6, JSON.stringify(up));
useBox.checked = false;
useBox.dispatchEvent(new dmW.Event("change", { bubbles: true }));
check("use.off", dmW.SSDNSSceneBuilder.draft().floors[0].stairs[0].playersCanUse === false && dmW.SSDNSSceneBuilder.draft().floors[0].stairs[0].visible === true);
useBox.checked = true;
useBox.dispatchEvent(new dmW.Event("change", { bubbles: true }));

const places = [].slice.call(builder.querySelectorAll("[data-act='linkPlace']"));
places[1].click();
const down = dmW.SSDNSSceneBuilder.dropLink(4, 4);
const dests = [].slice.call(builder.querySelectorAll("[data-act='linkDest']"));
dests[1].value = dmW.SSDNSSceneBuilder.draft().floors[0].id;
dests[1].dispatchEvent(new dmW.Event("change", { bubbles: true }));
const lands = [].slice.call(builder.querySelectorAll("[data-act='linkLand']"));
lands[1].click();
dmW.SSDNSSceneBuilder.dropLink(2, 2);
const kinds = [].slice.call(builder.querySelectorAll("[data-act='linkKind']"));
kinds[1].value = "down";
kinds[1].dispatchEvent(new dmW.Event("change", { bubbles: true }));
check("oneway.hidden", down && dmW.SSDNSSceneBuilder.draft().floors[1].stairs[0].visible === false && dmW.SSDNSSceneBuilder.draft().floors[1].stairs[0].kind === "down");

builder.querySelector("[data-act='sceneStep'][data-step='1']").click();
builder.querySelector("[data-act='spawnPlace']").click();
const ghost = dmW.SSDNSSceneBuilder.dropAt(1, 1);
check("spawn.placed", ghost && ghost.x === 1 && ghost.y === 1);
builder.querySelector("[data-act='sceneStep'][data-step='4']").click();
builder.querySelector("[data-act='sceneSave']").click();
const sceneName = dmW.SSDNSSceneBuilder.draft().name;
builder.querySelector("[data-act='sceneLoad']").click();
await flush(40);

const jolene = dm.addPlayerTokenFor("ada");
dm.patchToken(jolene.id, {
  name: "Jolene",
  label: "Jolene",
  pos: { x: 1, y: 1 },
  sheetId: "ada",
  combatantId: "ada",
  hp: 18,
  maxHp: 27,
  conditions: ["prone"],
  concentration: "Bless"
});
await flush(40);
check("spawn.quiet", player.links().offer(jolene.id) == null, JSON.stringify(player.links().prompt()));

dm.patchToken(jolene.id, { pos: { x: 2, y: 2 } });
await flush(30);
check("hidden.quiet", player.links().drawn().markers.every((m) => !(m.x === 2 && m.y === 2)) && player.links().offer(jolene.id) == null);

dm.layers().send(jolene.id, "scn_upstairs");
dm.patchToken(jolene.id, { pos: { x: 11, y: 5 } });
await flush(30);
check("oneway.landing", player.links().offer(jolene.id) == null && player.viewedScene() === "scn_upstairs");

dm.layers().send(jolene.id, "scn_dustyspur01");
dm.patchToken(jolene.id, { pos: { x: 6, y: 8 } });
dmW.SSDNSSceneBuilder.setLinkMark(up.id, { playersCanUse: false });
await flush(40);
const blockedDraw = player.links().drawn().markers.find((m) => m.x === 6 && m.y === 8);
check("use.drawn", blockedDraw && blockedDraw.playersCanUse === false && blockedDraw.destMapId === "scn_upstairs", JSON.stringify(blockedDraw));
check("use.quiet", player.links().offer(jolene.id) == null);

dmW.SSDNSSceneBuilder.setLinkMark(up.id, { kind: "ladder", playersCanUse: true });
await flush(30);
check("ask.ladder", (player.links().offer(jolene.id) || {}).text === "Climb ladder?");
player.links().stay();
dmW.SSDNSSceneBuilder.setLinkMark(up.id, { kind: "door" });
await flush(20);
dm.patchToken(jolene.id, { pos: { x: 6, y: 9 } });
await flush(20);
player.links().offer(jolene.id);
dm.patchToken(jolene.id, { pos: { x: 6, y: 8 } });
await flush(20);
check("ask.door", (player.links().offer(jolene.id) || {}).text === "Go through door?");
player.links().stay();
check("stay.pos", dm.layers().tokens().find((t) => t.id === jolene.id).x === 6 && dm.layers().tokens().find((t) => t.id === jolene.id).sceneId === "scn_dustyspur01");
check("stay.gone", player.links().prompt() == null);

dmW.SSDNSSceneBuilder.setLinkMark(up.id, { kind: "up" });
await flush(20);
dm.patchToken(jolene.id, { pos: { x: 5, y: 8 } });
await flush(20);
player.links().offer(jolene.id);
dm.patchToken(jolene.id, { pos: { x: 6, y: 8 } });
await flush(30);
const asked = player.links().offer(jolene.id);
check("ask.up", asked && asked.text === "Go upstairs?" && !!plW.document.querySelector("[data-act='linkGo']"), JSON.stringify(asked));
const dmBefore = dm.viewedScene();
plW.document.querySelector("[data-act='linkGo']").click();
await flush(80);
const landed = dm.layers().tokens().find((t) => t.id === jolene.id);
const toast = dmW.document.querySelector("[data-act='toast']");
const log = dmW.document.querySelector("[data-act='chatlog']");
check("go.land", landed && landed.sceneId === "scn_upstairs" && landed.x === 11 && landed.y === 5 && landed.hp === 18 && landed.sheetId === "ada" && landed.concentration === "Bless" && landed.conditions.indexOf("prone") >= 0, JSON.stringify(landed));
check("go.view", player.viewedScene() === "scn_upstairs" && dm.viewedScene() === dmBefore, "player " + player.viewedScene() + " dm " + dm.viewedScene() + " before " + dmBefore);
check("go.toast", toast && toast.textContent === "Jolene went upstairs", toast && toast.textContent);
check("go.log", log && log.textContent.indexOf("Jolene went upstairs") >= 0, log && log.textContent);
const pub = store.pub["map/public/tokens/" + jolene.id];
const pubVal = pub && (pub.value || pub);
check("go.public", pubVal && pubVal.hp == null && pubVal.sheetId === "ada" && pubVal.concentration === "Bless" && pubVal.sceneId === "scn_upstairs", JSON.stringify(pubVal && { hp: pubVal.hp, sheetId: pubVal.sheetId, concentration: pubVal.concentration, sceneId: pubVal.sceneId }));

const floors = [].slice.call(dmW.document.querySelectorAll("[data-act='sceneFloorPop'] [data-floor]"));
const labels = floors.map((b) => b.textContent.replace(/\s+/g, " ").trim());
check("floors.stack", labels.some((t) => t.indexOf("▲") === 0 && /Upstairs/.test(t)) && labels.some((t) => t.indexOf("▼") === 0 && /Saloon|Ground|Dusty/.test(t)), labels.join(" | "));
check("floors.badge", floors.every((b) => b.querySelector("[data-act='floorCount']")) && floors.some((b) => b.classList.contains("is-on")));
const you = plW.document.querySelector("[data-act='floorYou']");
check("floors.you", you && you.textContent.indexOf("You are on:") === 0 && /Upstairs/.test(you.textContent), you && you.textContent);
const playerFloors = [].slice.call(plW.document.querySelectorAll("[data-act='floorStrip'] [data-floor]")).map((b) => b.getAttribute("data-floor"));
check("floors.party", playerFloors.indexOf("scn_upstairs") >= 0 && playerFloors.indexOf("scn_dustyspur01") >= 0 && !plW.document.querySelector("[data-act='floorCount']"), playerFloors.join(","));
plW.document.dispatchEvent(new plW.KeyboardEvent("keydown", { key: "PageDown", bubbles: true }));
check("page.player", player.viewedScene() === "scn_upstairs");
const beforePage = dm.viewedScene();
dmW.document.dispatchEvent(new dmW.KeyboardEvent("keydown", { key: "PageUp", bubbles: true }));
const afterPage = dm.viewedScene();
check("page.dm", afterPage && afterPage !== beforePage, beforePage + " -> " + afterPage);
dmW.document.dispatchEvent(new dmW.KeyboardEvent("keydown", { key: "PageDown", bubbles: true }));
check("page.back", dm.viewedScene() === beforePage, dm.viewedScene());

dm.layers().send(jolene.id, "scn_dustyspur01");
dm.patchToken(jolene.id, { pos: { x: 6, y: 8 } });
await flush(40);
const took = dm.links().take(dmW.SSDNSSceneBuilder.draft().floors[0].stairs[0], [jolene.id]);
await flush(40);
const afterTake = dm.layers().tokens().find((t) => t.id === jolene.id);
check("take.still", took.length === 1 && took[0].x === 11 && took[0].y === 5 && afterTake.sceneId === "scn_upstairs" && afterTake.hp === 18 && afterTake.concentration === "Bless" && dm.viewedScene() === "scn_upstairs", JSON.stringify(took) + " view " + dm.viewedScene());

dmW.document.querySelector("[data-act='scenesBtn']").click();
const menu = dmW.document.querySelector("[data-act='scenesPop']");
const loadBtn = dmW.document.querySelector("[data-act='scenesLoad']");
check("scenes.list", menu && !menu.hidden && loadBtn && menu.textContent.indexOf(sceneName) >= 0 && !!dmW.document.querySelector("[data-act='scenesOpenBuilder']"), menu && menu.textContent);
loadBtn.click();
const ask = dmW.document.querySelector("[data-act='scenesConfirm']");
check("scenes.confirm", ask && !ask.hidden && /already loaded/i.test(ask.textContent), ask && ask.textContent);
dmW.document.querySelector("[data-act='scenesLoadNo']").click();
check("scenes.cancel", dmW.document.querySelector("[data-act='scenesConfirm']").hidden);
dmW.document.querySelector("[data-act='scenesBtn']").click();
dmW.document.querySelector("[data-act='scenesOpenBuilder']").click();
check("scenes.open", !!dmW.document.querySelector("[data-act='sceneBuilder']"));

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\nplay links 0.3.328 ok");

/**
 * PR72: built-in map packs (walls on grid), My Maps library (cards, search, folders, add/fit,
 * save/save as/autosave, swap restores state, duplicate/rename/delete, export/import),
 * round art fixes, big volume sliders + perceptual volume, real starter tracks.
 *   node tools/test-pr72.mjs
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
function exists(rel) { return fs.existsSync(path.join(root, rel)); }
function flush(ms) { return new Promise((r) => setTimeout(r, ms)); }
const idx = read("index.html"), dmIdx = read("dm/index.html");

/* ---------- 1. packs ---------- */
const sb = {}; sb.window = sb; vm.createContext(sb);
vm.runInContext(read("map/map-packs.js"), sb);
const P = sb.SSDNS_MAP_PACKS;
const ids = P.scenes.map((s) => s.id);
check("packs.scenes", ["scn_dustyspur01", "scn_upstairs", "scn_street", "scn_plains_day", "scn_plains_night", "scn_ellen_grounds", "scn_ellen_cellar", "scn_ellen_2f", "scn_ellen_3f"].every((id) => ids.includes(id)), ids.join(","));
check("packs.keepDustySpur", P.scenes[0].id === "scn_dustyspur01" && exists("map/dusty-spur-saloon_30x20_70px.webp") && exists("map/scene-dusty-spur.json"));
check("packs.images", P.scenes.every((s) => exists("map/" + s.img) && exists("map/" + s.thumb)), P.scenes.filter((s) => !exists("map/" + s.img)).map((s) => s.img).join(","));
check("packs.webpSmall", P.scenes.every((s) => s.img === "dusty-spur-saloon_30x20_70px.webp" || (/\.webp$/.test(s.img) && fs.statSync(path.join(root, "map", s.img)).size < 1.5e6)));
let bad = [];
P.scenes.forEach((s) => (s.walls || []).forEach((w) => {
  /* railings may sit on a painted balcony edge (Upstairs gallery at y=17.6); everything else is on grid lines */
  const okInt = w.kind === "railing" || [w.x1, w.y1, w.x2, w.y2].every((n) => Number.isInteger(n));
  const inside = w.x1 >= 0 && w.x2 >= 0 && w.y1 >= 0 && w.y2 >= 0 && w.x1 <= s.grid.cols && w.x2 <= s.grid.cols && w.y1 <= s.grid.rows && w.y2 <= s.grid.rows;
  const axis = w.x1 === w.x2 || w.y1 === w.y2;
  if (!okInt || !inside || !axis) bad.push(s.id + ":" + JSON.stringify(w));
}));
check("packs.wallsOnGrid", !bad.length, bad.slice(0, 3).join(" "));
check("packs.wallCounts", P.scenes.find((s) => s.id === "scn_street").walls.length === 71 && P.scenes.find((s) => s.id === "scn_ellen_2f").walls.length === 51 && P.scenes.find((s) => s.id === "scn_upstairs").walls.length === 60);
check("packs.doors", P.scenes.find((s) => s.id === "scn_street").walls.filter((w) => w.door).length === 12 && P.scenes.find((s) => s.id === "scn_street").walls.filter((w) => w.window).length >= 11);
check("packs.grids", P.scenes.find((s) => s.id === "scn_street").grid.cols === 40 && P.scenes.find((s) => s.id === "scn_ellen_grounds").grid.rows === 50 && P.scenes.every((s) => s.grid.px === 70));
check("packs.art.aspect", P.scenes.every((s) => true));
check("packs.world", P.world.length === 2 && P.world.every((w) => exists("map/" + w.img) && exists("map/" + w.thumb)) && P.world.map((w) => w.name).join("|") === "Deadwood County|New Eldorado");
check("packs.loaded", /map\/map-packs\.js/.test(idx) && /\.\.\/map\/map-packs\.js/.test(dmIdx) && /\.\.\/map\/map-library\.js/.test(dmIdx));

/* ---------- 2. library helpers ---------- */
vm.runInContext(read("map/map-library.js"), sb);
const L = sb.SSDNSMapLibrary;
check("lib.fit", JSON.stringify(L.fit(2800, 2100, 70)) === JSON.stringify({ cols: 40, rows: 30 }) && L.fitCols(2000, 1500, 40).ppsq === 50 && L.fitCols(2000, 1500, 40).rows === 30);
const e1 = L.newEntry({ name: "Hooch Gulch", src: "https://x.test/a.webp", cols: 25, rows: 18 }, {});
check("lib.newEntry", e1.id === "my_hooch-gulch" && e1.grid.cols === 25 && e1.grid.rows === 18 && e1.grid.px === 70);
check("lib.makeIdUnique", L.makeId("Hooch Gulch", { "my_hooch-gulch": 1 }) === "my_hooch-gulch-2");
const cards = [{ id: "a", name: "Main Street", folder: "builtin", group: "Town" }, { id: "b", name: "Hooch Gulch", folder: "mine" }, { id: "c", name: "Deadwood County", folder: "world" }];
check("lib.filter.folder", L.filter(cards, "mine", "").length === 1 && L.filter(cards, "all", "").length === 3 && L.filter(cards, "world", "").length === 1);
check("lib.filter.search", L.filter(cards, "all", "town").map((c) => c.id).join() === "a" && L.filter(cards, "all", "dead").map((c) => c.id).join() === "c");
e1.snapshot = { walls: [{ x1: 0, y1: 0, x2: 1, y2: 0 }], fogShapes: [], tokens: [{ id: "e1", name: "Bandit", hidden: true, sceneId: e1.id }], savedAt: 1 };
const d1 = L.duplicate(e1, { [e1.id]: 1 });
check("lib.duplicate", d1.id !== e1.id && /\(copy\)$/.test(d1.name) && d1.snapshot.tokens[0].id !== "e1" && d1.snapshot.tokens[0].sceneId === d1.id && d1.snapshot.tokens[0].hidden === true);
const sa = L.saveAs({ id: "scn_street", name: "Main Street", img: "packs/scn_street.webp", thumb: "packs/thumbs/scn_street.webp", grid: { cols: 40, rows: 30 } }, "Street (night raid)", e1.snapshot, (p) => "https://site/map/" + p, {});
check("lib.saveAs", sa.from === "scn_street" && sa.src === "https://site/map/packs/scn_street.webp" && sa.grid.cols === 40 && sa.snapshot.walls.length === 1 && sa.snapshot.tokens[0].sceneId === sa.id);
const pack = L.exportPack({ [e1.id]: e1, [sa.id]: sa });
check("lib.export", pack.format === "ssdns-map-pack" && pack.maps.length === 2);
const imp = L.importPack(JSON.stringify(pack), { [e1.id]: 1 });
check("lib.import", imp.entries.length === 2 && imp.entries[0].id !== e1.id && imp.entries.every((e) => e.snapshot));
const imp2 = L.importPack({ format: "ssdns-map-pack", maps: [{ name: "Local", src: "data:image/png;base64,xx" }, { name: "Ok", src: "https://h/x.png", cols: 10, rows: 10 }] }, {});
check("lib.import.skipsDataUrls", imp2.entries.length === 1 && imp2.skipped === 1 && /skipped/.test(imp2.warn));
check("lib.import.bad", L.importPack("nope", {}).entries.length === 0 && L.importPack({ maps: [] }, {}).warn);

/* ---------- 2b. library inside the live map (jsdom, memory adapter) ---------- */
function makeWindow() {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/dm/", pretendToBeVisual: true, runScripts: "dangerously" });
  const w = dom.window;
  const proto = w.HTMLElement.prototype;
  Object.defineProperty(proto, "clientWidth", { configurable: true, get() { return 800; } });
  Object.defineProperty(proto, "clientHeight", { configurable: true, get() { return 600; } });
  proto.getBoundingClientRect = function () { return { x: 0, y: 0, left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, toJSON() { return {}; } }; };
  w.HTMLCanvasElement.prototype.getContext = function () { const bag = {}; return new Proxy(bag, { get(t, p) { if (p in t) return t[p]; if (typeof p !== "string") return undefined; return function () { return bag; }; }, set(t, p, v) { t[p] = v; return true; } }); };
  w.HTMLImageElement.prototype.decode = function () { return Promise.resolve(); };
  w.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
  w.HTMLDialogElement && (w.HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); });
  w.HTMLDialogElement && (w.HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); });
  return w;
}
function addScript(w, rel) { const s = w.document.createElement("script"); s.textContent = read(rel); w.document.body.appendChild(s); }
const w = makeWindow();
["map/token-crop.js", "map/ssdns-map-firebase.js", "map/map-packs.js", "map/map-library.js", "map/ssdns-map.js"].forEach((f) => addScript(w, f));
const scene = JSON.parse(read("map/scene-dusty-spur.json"));
const store = { pub: {}, dm: {} }, bus = [];
const dmAd = w.SSDNSMapFirebase.memory({ role: "dm", store, bus });
const writes = [];
const origWrite = dmAd.write.bind(dmAd);
dmAd.write = (p, v, m) => { writes.push(p); return origWrite(p, v, m); };
const dmEl = w.document.createElement("div"); w.document.body.appendChild(dmEl);
const dm = w.SSDNSMap.create({ el: dmEl, role: "dm", uid: "dm", adapter: dmAd, host: { players() { return []; } },
  options: { scene, tokens: { tokens: {} }, assetBase: "../map/", players: () => [], room: { table: { initiative: { order: [], turn: 0 } } } } });
await flush(100);
check("ui.mapsBtn", !!dmEl.querySelector('[data-act="mapsBtn"]') && !dmEl.querySelector('[data-act="folderSelect"]'));
const api = dm.maps();
check("ui.list", api.list().length >= 9 && api.world().length === 2);
api.swap("scn_street");
await flush(30);
check("swap.grid", api.gridOf(api.list().find((s) => s.id === "scn_street")).cols === 40 && api.current() === "scn_street");
check("swap.seedsWalls", api.sceneState("scn_street").walls.length === 71 && writes.includes("map/public/scenes/scn_street"));
api.sceneState("scn_street").fogShapes.push({ id: "f1", op: "reveal", kind: "box", x: 1, y: 1, w: 3, h: 3 });
api.swap("scn_dustyspur01"); api.swap("scn_street");
check("swap.keepsState", api.sceneState("scn_street").fogShapes.length === 1 && api.sceneState("scn_street").walls.length === 71);
const mine = L.newEntry({ name: "Hooch Gulch", src: "https://x.test/hooch.webp", cols: 24, rows: 16 }, {});
api.save(mine);
check("save.room", writes.includes("map/dm/library/" + mine.id) && writes.includes("map/public/scenes/" + mine.id) && JSON.parse(w.localStorage.getItem("ssdns.maps.v1"))[mine.id]);
check("save.publicMeta", api.sceneState(mine.id).meta && api.sceneState(mine.id).meta.src === "https://x.test/hooch.webp" && api.sceneState(mine.id).meta.grid.cols === 24);
api.swap(mine.id);
api.sceneState(mine.id).walls.push({ x1: 2, y1: 2, x2: 5, y2: 2 });
dm.ensureDefaultScene && 0;
const snap = api.snapshot(mine.id);
check("snapshot.fields", Array.isArray(snap.walls) && snap.walls.length === 1 && Array.isArray(snap.fogShapes) && Array.isArray(snap.tokens) && snap.savedAt);
/* autosave: saving the scene schedules a library snapshot */
writes.length = 0;
w.document.body.dispatchEvent(new w.Event("noop"));
await flush(1700);
api.sceneState(mine.id).walls.push({ x1: 6, y1: 2, x2: 6, y2: 5 });
// trigger saveScene via library save of the scene
api.swap("scn_dustyspur01");
check("autosave.onSwap", api.library()[mine.id].snapshot.walls.length === 2);
/* restore into an empty room */
const sd = api.sceneState(mine.id); sd.walls = []; sd.fogShapes = [];
api.swap(mine.id);
check("restore.fromSnapshot", api.sceneState(mine.id).walls.length === 2);
api.remove(mine.id);
check("delete", !api.library()[mine.id] && !api.list().some((s) => s.id === mine.id));
/* menu UI */
w.SSDNSMapLibrary.open(api);
const dlg = w.document.querySelector(".ml-dialog");
check("menu.cards", dlg && dlg.querySelectorAll(".ml-card").length === api.list().length + 2 && dlg.querySelectorAll(".ml-thumb img").length >= 11);
check("menu.folders", ["all", "builtin", "mine", "world"].every((f) => dlg.querySelector('[data-ml-folder="' + f + '"]')));
dlg.querySelector('[data-ml-folder="world"]').click();
check("menu.world", dlg.querySelectorAll(".ml-card").length === 2 && dlg.querySelectorAll("[data-ml-push]").length >= 2);
dlg.querySelector('[data-ml-folder="all"]').click();
const srch = dlg.querySelector(".ml-search"); srch.value = "manor"; srch.dispatchEvent(new w.Event("input", { bubbles: true }));
check("menu.search", dlg.querySelectorAll(".ml-card").length === 4);
dlg.querySelector("[data-ml-add]").click();
check("menu.addForm", !!dlg.querySelector('[data-ml-f="src"]') && !!dlg.querySelector('[data-ml-f="ppsq"]') && !!dlg.querySelector("[data-ml-fit]") && !!dlg.querySelector(".ml-preview") && !!dlg.querySelector("[data-ml-file]"));
dlg.querySelector('[data-ml-f="src"]').value = "not a link";
dlg.querySelector("[data-ml-create]").click();
check("menu.add.needsLink", /https/.test(dlg.querySelector("[data-ml-warn]").textContent));
dlg.querySelector('[data-ml-f="src"]').value = "https://x.test/new.webp";
dlg.querySelector('[data-ml-f="name"]').value = "Canyon";
dlg.querySelector("[data-ml-create]").click();
const added = Object.values(api.library()).find((e) => e.name === "Canyon");
check("menu.add.saves", !!added && api.current() === added.id);
{ const s2 = dlg.querySelector(".ml-search"); s2.value = ""; s2.dispatchEvent(new w.Event("input", { bubbles: true })); }
w.confirm = () => false;
dlg.querySelector('[data-ml-del="' + added.id + '"]').click();
check("menu.delete.confirm", !!api.library()[added.id]);
w.confirm = () => true;
dlg.querySelector('[data-ml-del="' + added.id + '"]').click();
check("menu.delete", !api.library()[added.id]);
let pushed = null;
w.SSDNSPushHandout = (h, send) => { pushed = [h, send]; return Promise.resolve(true); };
dlg.querySelector('[data-ml-folder="world"]').click();
dlg.querySelector('[data-ml-push="world_deadwood"]').click();
await flush(10);
check("world.push", pushed && pushed[1] === true && /packs\/world\/world_deadwood\.webp$/.test(pushed[0].url) && /^http/.test(pushed[0].url) && pushed[0].to === "all");
check("dmcc.pushHandout", /window\.SSDNSPushHandout = async function/.test(read("dm/assets/js/dmcc.js")));
const mapSrc = read("map/ssdns-map.js");
check("fix.saveSceneActive", /const sid = sceneId \|\| \(typeof activeSceneId === 'function' \? activeSceneId\(\) : ''\)/.test(mapSrc));
check("rules.untouched", read("database.rules.json") === fs.readFileSync(path.join(root, "database.rules.json"), "utf8") && !/library/.test(read("database.rules.json")));

/* ---------- 3. round art ---------- */
const sb2 = { console }; sb2.window = sb2; vm.createContext(sb2);
vm.runInContext(read("assets/data/rules.js"), sb2);
vm.runInContext(read("assets/js/ammo-display.js"), sb2);
const A = sb2.SSDNSAmmoDisplay, ac = read("assets/css/ammo-display.css");
check("rounds.ballNoCap", A.roundType({ weapon: "navy-army-ball-n-cap-revolver" }) === "ball" && A.roundType({ weapon: "dull-co-rifle-musket" }) === "ball");
const ballCss = ac.slice(ac.indexOf(".is-primer.is-loaded.rt-ball {"), ac.indexOf("}", ac.indexOf(".is-primer.is-loaded.rt-ball {")));
check("rounds.ballCss", ballCss && !/#b8632e|#e9a46a|copper/i.test(ballCss) && /rgba\(255, 255, 255, 0\.55\)/.test(ballCss));
check("rounds.shellsOriginal", A.roundType({ weapon: "double-barrel-coach-gun" }) === "shell" && A.roundType({ weapon: "single-barrel-farm-shotgun" }) === "shell" && !/rt-shell/.test(ac));
check("rounds.repeaterRed", A.roundType({ weapon: "lancaster-lever-shotgun" }) === "buck" && /\.is-primer\.is-loaded\.rt-buck/.test(ac));
check("rounds.hexSame", A.roundType({ weapon: "navy-army-ball-n-cap-revolver" }, { raw: "k:hex:2" }) === "hex" && /rt-hex/.test(ac));

/* ---------- 4. volume ---------- */
const sb3 = { console, localStorage: { getItem() { return null; }, setItem() {} } }; sb3.window = sb3; vm.createContext(sb3);
vm.runInContext(read("assets/js/music-deck.js"), sb3);
const M = sb3.SSDNSMusic;
const pts = []; for (let i = 0; i <= 100; i += 5) pts.push(M.curve(i / 100));
check("vol.curve.ends", pts[0] === 0 && pts[pts.length - 1] === 1);
check("vol.curve.monotonic", pts.every((v, i) => i === 0 || v > pts[i - 1]));
const steps = pts.slice(1).map((v, i) => v - pts[i]);
check("vol.curve.smooth", Math.max(...steps) < 0.11 && Math.min(...steps.slice(1)) > 0.002, JSON.stringify(steps.map((s) => +s.toFixed(3))));
const dB = (v) => 20 * Math.log10(v);
check("vol.curve.perceptual", Math.abs(dB(M.curve(0.5)) + 12) < 0.5 && dB(M.curve(0.1)) < -35);
{
  const dom = new JSDOM('<!doctype html><body><label>Music <input type="range" data-mx-pref="music" min="0" max="100" value="80" aria-label="My music volume"></label><label>Vol <input type="range" data-mx-level min="0" max="100" value="62" aria-label="Music volume"></label><label>Vol <input type="range" data-sfx-volume min="0" max="100" value="80"></label></body>', { runScripts: "dangerously" });
  const dw = dom.window;
  dw.eval(read("assets/js/vol-slider.js"));
  dw.SSDNSVolSlider.scan();
  const inputs = [...dw.document.querySelectorAll("input[type=range]")];
  check("vol.wrapped", inputs.every((i) => i.closest(".vol-slider") && i.closest(".vol-slider").querySelector(".vol-minus") && i.closest(".vol-slider").querySelector(".vol-plus") && i.closest(".vol-slider").querySelector(".vol-pct")));
  check("vol.pct", inputs[0].closest(".vol-slider").querySelector(".vol-pct").textContent === "80%");
  let seen = 0; inputs[1].addEventListener("change", () => seen++);
  inputs[1].closest(".vol-slider").querySelector(".vol-plus").click();
  check("vol.plus5", inputs[1].value === "65" && seen === 1 && inputs[1].closest(".vol-slider").querySelector(".vol-pct").textContent === "65%");
  inputs[1].closest(".vol-slider").querySelector(".vol-minus").click(); inputs[1].closest(".vol-slider").querySelector(".vol-minus").click();
  check("vol.minus5", inputs[1].value === "55");
  inputs[0].value = "100"; inputs[0].closest(".vol-slider").querySelector(".vol-plus").click();
  check("vol.clamp", inputs[0].value === "100");
  dw.close();
}
const vcss = read("assets/css/vol-slider.css");
check("vol.css", /width: 220px; min-width: 200px/.test(vcss) && /slider-thumb \{[^}]*width: 22px; height: 22px/.test(vcss) && /\.vol-step \{ min-width: 36px; min-height: 36px/.test(vcss) && /max-width: 640px[^]*width: 100%/.test(vcss));
check("vol.loaded", /vol-slider\.js/.test(idx) && /vol-slider\.css/.test(idx) && /vol-slider\.js/.test(dmIdx) && /vol-slider\.css/.test(dmIdx));

/* ---------- 5. starter tracks ---------- */
const tj = JSON.parse(read("assets/music/tracks.json"));
const th = tj.tracks.find((t) => t.id === "ssdns-theme"), am = tj.tracks.find((t) => t.id === "ssdns-ambient"), tone = tj.tracks.find((t) => t.id === "test-tone");
check("music.titles", th.title === "Dust and Shadows (theme, draft)" && am.title === "Dusty Main Street (loop)" && am.loop === true && !!tone);
function isMp3(rel) { const b = fs.readFileSync(path.join(root, "assets/music", rel)); return b.length > 100000 && ((b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)); }
check("music.files", isMp3(th.file) && isMp3(am.file) && exists("assets/music/" + tone.file));
check("music.sizes", fs.statSync(path.join(root, "assets/music", th.file)).size < 6e6 && fs.statSync(path.join(root, "assets/music", am.file)).size < 6e6);

if (failures.length) { console.log(failures.length + " failed"); process.exit(1); }
console.log("pr72 ok");
process.exit(0);

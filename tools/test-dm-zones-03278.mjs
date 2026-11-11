/**
 * DM places catalog zones by hand. Players get the same zone feed as a cast.
 * Sheet 0.3.294 / DMCC 0.2.307.
 *   node tools/test-dm-zones-03278.mjs
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
function flush(ms) { return new Promise((r) => setTimeout(r, ms)); }

const ver = JSON.parse(read("version.json"));
check("ver", ver.sheet === "0.3.294" && ver.dmcc === "0.2.307" && ver.sheetBuild === "sheet-playtest-v03294" && ver.dmccBuild === "dmcc-playtest-v02307");
check("rules.clean", !read("assets/data/rules.js").includes("0.3.294") && !read("database.rules.json").includes("0.3.294"));
const v2 = read("dm/assets/js/v2.js");
check("ticks.existing", v2.includes("function zonePhase") && v2.includes("Z.phaseDue") && v2.includes("ssdns-zone-link"));
check("feed.existing", read("map/ssdns-map.js").includes("function publishZoneFeed") && read("map/ssdns-map.js").includes("function placeManualZone"));

function makeWindow() {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/dm/", pretendToBeVisual: true, runScripts: "dangerously" });
  const w = dom.window;
  if (!w.PointerEvent) {
    w.PointerEvent = class extends w.MouseEvent {
      constructor(type, init) { super(type, init || {}); this.pointerId = (init && init.pointerId) || 1; }
    };
  }
  const proto = w.HTMLElement.prototype;
  Object.defineProperty(proto, "clientWidth", { configurable: true, get() { return 900; } });
  Object.defineProperty(proto, "clientHeight", { configurable: true, get() { return 700; } });
  Object.defineProperty(w.HTMLCanvasElement.prototype, "clientWidth", { configurable: true, get() { return 900; } });
  Object.defineProperty(w.HTMLCanvasElement.prototype, "clientHeight", { configurable: true, get() { return 700; } });
  proto.getBoundingClientRect = function () { return { x: 0, y: 0, left: 0, top: 0, right: 900, bottom: 700, width: 900, height: 700, toJSON() { return {}; } }; };
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
  return w;
}
function addScript(w, rel) {
  const s = w.document.createElement("script");
  s.textContent = read(rel);
  w.document.body.appendChild(s);
}
const w = makeWindow();
["assets/js/spell-area.js", "assets/js/spell-zones.js", "map/token-crop.js", "map/ssdns-map-firebase.js", "map/map-packs.js", "map/ssdns-map.js"].forEach((f) => addScript(w, f));
const scene = JSON.parse(read("map/scene-dusty-spur.json"));
const store = { pub: {}, dm: {} }, bus = [];
const dmAd = w.SSDNSMapFirebase.memory({ role: "dm", store, bus });
const el = w.document.createElement("div");
w.document.body.appendChild(el);
const tokens = {
  tok_ada: { id: "tok_ada", kind: "player", name: "Ada", ownerUid: "ada", combatantId: "ada", sceneId: "scn_dustyspur01", pos: { x: 4, y: 4 }, color: "#c9a227" }
};
w.SSDNSMap.create({
  el, role: "dm", uid: "dm", adapter: dmAd, host: { players() { return [{ uid: "ada", name: "Ada" }]; } },
  options: { scene, tokens: { tokens }, assetBase: "../map/", players: () => [{ uid: "ada", name: "Ada" }], room: { table: { initiative: { order: [], turn: 0 } } } }
});
await flush(80);
const spell = el.querySelector('[data-act="zoneSpell"]');
const names = Array.from(spell.options).map((o) => o.textContent);
check("catalog.core", ["Fireball", "Insect Plague", "Cloud of Daggers", "Wall of Thorns", "Fog Cloud"].every((n) => names.includes(n)), names.slice(0, 8).join(","));
check("facing.hidden", el.querySelector('[data-act="zoneFacing"]').hidden === true);
spell.value = "wall of thorns";
spell.dispatchEvent(new w.Event("change", { bubbles: true }));
check("facing.wall", el.querySelector('[data-act="zoneFacing"]').hidden === false);
el.querySelector('[data-act="zoneTurn"][data-dir="1"]').click();
check("facing.turn", el.querySelector('[data-act="zoneFaceLabel"]').textContent === "Southeast");
el.querySelector('[data-act="zoneDur"]').value = "10";
el.querySelector('[data-act="zoneArmBtn"]').click();
const canvas = el.querySelector("canvas");
canvas.dispatchEvent(new w.PointerEvent("pointerdown", { bubbles: true, button: 0, clientX: 400, clientY: 300, pointerId: 1 }));
await flush(30);
const sid = "scn_dustyspur01";
const sceneRow = store.pub["map/public/scenes/" + sid];
const zones = sceneRow && sceneRow.value && sceneRow.value.spellZones;
const wall = (zones || []).find((z) => z && z.key === "wall of thorns");
check("place.wall", !!wall && wall.shape === "wall" && wall.length === 60 && Math.abs((wall.facing || 0) - Math.PI / 4) < 0.01 && wall.rounds === 10 && wall.roundsLeft === 10 && wall.conc === false && !wall.casterId, wall && JSON.stringify({ shape: wall.shape, len: wall.length, face: wall.facing, rounds: wall.rounds, conc: wall.conc }));
const feeds = Object.keys(store.pub).filter((k) => k.indexOf("tableFeed/") === 0).map((k) => store.pub[k].value).filter((row) => row && row.event === "zone");
check("feed.pushed", feeds.some((row) => row.full === true && (row.zones || []).some((z) => z && z.key === "wall of thorns")));

spell.value = "fog cloud";
spell.dispatchEvent(new w.Event("change", { bubbles: true }));
el.querySelector('[data-act="zoneDur"]').value = "0";
el.querySelector('[data-act="zoneArmBtn"]').click();
canvas.dispatchEvent(new w.PointerEvent("pointerdown", { bubbles: true, button: 0, clientX: 200, clientY: 200, pointerId: 2 }));
await flush(20);
const fog = (store.pub["map/public/scenes/" + sid].value.spellZones || []).find((z) => z && z.key === "fog cloud");
check("place.untimed", !!fog && fog.rounds === 0 && fog.roundsLeft === 0 && fog.radius === 20 && fog.conc === false);

el.querySelector('[data-act="zoneCaster"]').dispatchEvent(new w.PointerEvent("pointerdown", { bubbles: true }));
el.querySelector('[data-act="zoneCaster"]').value = "ada";
el.querySelector('[data-act="zoneConc"]').checked = true;
spell.value = "insect plague";
el.querySelector('[data-act="zoneDur"]').value = "spell";
el.querySelector('[data-act="zoneArmBtn"]').click();
canvas.dispatchEvent(new w.PointerEvent("pointerdown", { bubbles: true, button: 0, clientX: 500, clientY: 240, pointerId: 3 }));
await flush(20);
const bugs = (store.pub["map/public/scenes/" + sid].value.spellZones || []).find((z) => z && z.key === "insect plague");
check("place.linked", !!bugs && bugs.casterId === "ada" && bugs.conc === true && bugs.rounds === 100 && bugs.shape === "sphere");

const moveBtn = Array.from(el.querySelectorAll(".ssm-zone-move")).find((b) => b.nextElementSibling && /Wall of Thorns/.test(b.nextElementSibling.textContent));
check("list.move", !!moveBtn);
moveBtn.click();
canvas.dispatchEvent(new w.PointerEvent("pointerdown", { bubbles: true, button: 0, clientX: 120, clientY: 120, pointerId: 4 }));
await flush(20);
const moved = (store.pub["map/public/scenes/" + sid].value.spellZones || []).find((z) => z && z.id === wall.id);
check("move.origin", !!moved && moved.origin.x !== wall.origin.x && moved.key === "wall of thorns");

const clearBtn = el.querySelector('.ssm-zone-clear[data-zone-id="' + fog.id + '"]') || Array.from(el.querySelectorAll(".ssm-zone-clear")).find((b) => /Fog Cloud/.test(b.textContent));
clearBtn.click();
await flush(20);
check("delete.one", !(store.pub["map/public/scenes/" + sid].value.spellZones || []).some((z) => z && z.id === fog.id));
el.querySelector('[data-act="clearAllZonesBtn"]').click();
await flush(20);
check("clear.all", (store.pub["map/public/scenes/" + sid].value.spellZones || []).length === 0);

const playerEl = w.document.createElement("div");
w.document.body.appendChild(playerEl);
const playerAd = w.SSDNSMapFirebase.memory({ role: "player", store, bus });
w.SSDNSMap.create({
  el: playerEl, role: "player", uid: "ada", adapter: playerAd, host: { players() { return []; } },
  options: { scene, tokens: { tokens: {} }, assetBase: "../map/", players: () => [], room: { table: { initiative: { order: [], turn: 0 } } } }
});
spell.value = "cloud of daggers";
el.querySelector('[data-act="zoneDur"]').value = "1";
el.querySelector('[data-act="zoneConc"]').checked = false;
el.querySelector('[data-act="zoneCaster"]').value = "";
el.querySelector('[data-act="zoneArmBtn"]').click();
canvas.dispatchEvent(new w.PointerEvent("pointerdown", { bubbles: true, button: 0, clientX: 300, clientY: 300, pointerId: 5 }));
await flush(40);
const daggers = (store.pub["map/public/scenes/" + sid].value.spellZones || []).find((z) => z && z.key === "cloud of daggers");
check("place.daggers", !!daggers && daggers.shape === "cube" && daggers.side === 5 && daggers.rounds === 1);
const latest = Object.keys(store.pub).filter((k) => k.indexOf("tableFeed/") === 0).map((k) => store.pub[k].value).filter((row) => row && row.event === "zone").pop();
check("player.feed", !!latest && latest.full === true && (latest.zones || []).some((z) => z && z.key === "cloud of daggers") && playerEl.querySelector('[data-act="zoneArmBtn"]') == null);

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\nall passed");
process.exit(0);

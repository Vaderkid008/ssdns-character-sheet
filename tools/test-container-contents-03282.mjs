/**
 * DM container popup edits contents and publishes them on the loot object.
 * Sheet 0.3.307 / DMCC 0.2.320.
 *   node tools/test-container-contents-03282.mjs
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

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/dm/", pretendToBeVisual: true, runScripts: "dangerously" });
const w = dom.window;
Object.defineProperty(w.HTMLElement.prototype, "clientWidth", { configurable: true, get() { return 800; } });
Object.defineProperty(w.HTMLElement.prototype, "clientHeight", { configurable: true, get() { return 600; } });
w.HTMLCanvasElement.prototype.getContext = function () {
  const bag = { addColorStop() {} };
  return new Proxy(bag, { get(t, p) { if (p in t) return t[p]; if (typeof p !== "string") return undefined; return function () { return bag; }; }, set(t, p, v) { t[p] = v; return true; } });
};
w.HTMLImageElement.prototype.decode = function () { return Promise.resolve(); };
w.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
["assets/data/item-catalog-gear.js", "assets/data/item-catalog.js", "assets/js/items.js", "assets/js/loot.js", "map/token-crop.js", "map/ssdns-map-firebase.js", "map/map-packs.js", "map/ssdns-map.js"].forEach((rel) => {
  const s = w.document.createElement("script");
  s.textContent = read(rel);
  w.document.body.appendChild(s);
});
const scene = JSON.parse(read("map/scene-dusty-spur.json"));
const store = { pub: {}, dm: {} };
const ad = w.SSDNSMapFirebase.memory({ role: "dm", store, bus: [] });
const el = w.document.createElement("div");
w.document.body.appendChild(el);
w.SSDNSMap.create({
  el, role: "dm", uid: "dm", adapter: ad, host: { players() { return []; } },
  options: { scene, tokens: { tokens: {} }, assetBase: "../map/", players: () => [], room: { table: { initiative: { order: [], turn: 0 } } } }
});
await flush(80);
el.querySelector('[data-act="placeChestBtn"]').click();
await flush(40);
const menu = w.document.querySelector('[data-act="dmChest"]');
check("editor", !!(menu && menu.querySelector('[data-dm="search"]') && menu.querySelector('[data-dm="add-custom"]') && menu.querySelector('[data-dm="coin"]') && menu.querySelector('[data-act="catalogHits"]')));
const before = (menu.textContent || "").replace(/\s+/g, " ");
check("before.list", /ContentsEmpty/.test(before) && !/Trail rations/.test(before) && !/Waterskin/.test(before), before.slice(0, 220));

const search = menu.querySelector('[data-dm="search"]');
search.value = "healing";
search.dispatchEvent(new w.Event("input", { bubbles: true }));
const hit = menu.querySelector('[data-dm="add-cat"]');
check("search.hit", !!(hit && /healing/i.test(hit.textContent || "")));
if (hit) hit.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
await flush(20);

const again = w.document.querySelector('[data-act="dmChest"]');
again.querySelector('[data-dm="custom-name"]').value = "Wanted poster";
again.querySelector('[data-dm="custom-qty"]').value = "2";
again.querySelector('[data-dm="custom-weight"]').value = "0.5";
again.querySelector('[data-dm="custom-notes"]').value = "Nailed to the lid";
again.querySelector('[data-dm="add-custom"]').dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
await flush(20);

const after = w.document.querySelector('[data-act="dmChest"]');
const qty = after.querySelector('[data-dm="qty"][data-index="0"]');
qty.value = "4";
qty.dispatchEvent(new w.Event("change", { bubbles: true }));
await flush(20);
const coin = w.document.querySelector('[data-act="dmChest"] [data-dm="coin"]');
coin.value = "12";
coin.dispatchEvent(new w.Event("change", { bubbles: true }));
await flush(20);

function published() {
  return Object.keys(store.pub).filter((k) => k.indexOf("map/public/tokens/") === 0).map((k) => store.pub[k].value).find((t) => t && t.kind === "chest");
}
const pub = published();
const rows = pub && pub.loot && pub.loot.contents || [];
check("qty.synced", rows[0] && /healing/i.test(rows[0].name || "") && rows[0].qty === 4, JSON.stringify(rows[0]));
check("catalog.added", rows.some((r) => /healing/i.test(r.name || "")), rows.map((r) => r.name).join(", "));
const poster = rows.find((r) => r.name === "Wanted poster");
check("custom.added", poster && poster.qty === 2 && poster.weight === 0.5 && poster.notes === "Nailed to the lid", JSON.stringify(poster));
check("coin.synced", pub && pub.loot.cash && pub.loot.cash.es === 12, JSON.stringify(pub && pub.loot && pub.loot.cash));

const remove = w.document.querySelector('[data-act="dmChest"] [data-dm="remove"]');
if (remove) remove.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
await flush(20);
const left = published().loot.contents;
check("removed", left.length === rows.length - 1 && left[0].name === "Wanted poster", left.map((r) => r.name).join(", "));

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\ncontainer contents ok");
process.exit(0);

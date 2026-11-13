/**
 * Pointer tests for map menus (sheet 0.3.304 / DMCC 0.2.317).
 * Close X, Escape, and a title-bar drag on the token menu, container card,
 * loot window, DM pop-up, and the which-one chooser. Also the lock, improvise,
 * unlock, and dropped-item paths.
 *   node tools/test-map-menus-03282.mjs
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
check("ver", ver.sheet === "0.3.304" && ver.dmcc === "0.2.317");

const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", { url: "http://localhost/dm/", pretendToBeVisual: true, runScripts: "dangerously" });
const w = dom.window;
const style = w.document.createElement("style");
style.textContent = read("map/ssdns-map.css");
w.document.head.appendChild(style);
Object.defineProperty(w.HTMLElement.prototype, "clientWidth", { configurable: true, get() { return 800; } });
Object.defineProperty(w.HTMLElement.prototype, "clientHeight", { configurable: true, get() { return 600; } });
w.HTMLElement.prototype.getBoundingClientRect = function () {
  return { x: 0, y: 0, left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, toJSON() { return {}; } };
};
w.__gold = 0;
w.HTMLCanvasElement.prototype.getContext = function () {
  const bag = { addColorStop() {} };
  return new Proxy(bag, {
    get(t, p) { if (p in t) return t[p]; if (typeof p !== "string") return undefined; return function () { return bag; }; },
    set(t, p, v) {
      t[p] = v;
      if (p === "fillStyle" && String(v).toLowerCase() === "#e2c56a") w.__gold += 1;
      return true;
    }
  });
};
w.HTMLImageElement.prototype.decode = function () { return Promise.resolve(); };
w.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
function addScript(rel) {
  const s = w.document.createElement("script");
  s.textContent = read(rel);
  w.document.body.appendChild(s);
}
addScript("assets/js/loot.js");
addScript("map/interact-timers.js");
addScript("map/ssdns-map-move.js");
addScript("map/ssdns-map-firebase.js");
addScript("map/ssdns-map.js");

function pointer(node, type, x, y) {
  const Ev = w.PointerEvent || w.MouseEvent;
  const ev = new Ev(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, button: 0, buttons: type === "pointerup" ? 0 : 1 });
  if (ev.pointerId == null) { try { Object.defineProperty(ev, "pointerId", { value: 1 }); } catch (e) {} }
  node.dispatchEvent(ev);
}
function clickAt(canvas, x, y) {
  pointer(canvas, "pointerdown", x, y);
  pointer(canvas, "pointerup", x, y);
}
function tap(node) {
  pointer(node, "pointerdown", 6, 6);
  pointer(node, "pointerup", 6, 6);
  node.dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true, clientX: 6, clientY: 6 }));
}
function dragTitle(menu, dx, dy) {
  const title = menu.querySelector(".ssm-card-bar b");
  const left0 = parseFloat(menu.style.left) || 0;
  const top0 = parseFloat(menu.style.top) || 0;
  pointer(title, "pointerdown", 30, 20);
  pointer(w.document, "pointermove", 30 + dx, 20 + dy);
  pointer(w.document, "pointerup", 30 + dx, 20 + dy);
  return { left0, top0, left: parseFloat(menu.style.left) || 0, top: parseFloat(menu.style.top) || 0 };
}
function esc(rootEl) {
  const target = (rootEl && rootEl.querySelector("canvas")) || w.document.body;
  target.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
}
function openMenu(rootEl, act) {
  const menu = rootEl.querySelector('[data-act="' + act + '"]');
  return menu && !menu.hidden ? menu : null;
}
function dmAt(gx, gy) { return { x: (gx + 0.5) * 70 - 650, y: (gy + 0.5) * 70 - 400 }; }
function plAt(origin, gx, gy) { return { x: (gx - origin.x) * 70 + 400, y: (gy - origin.y) * 70 + 300 }; }

function lock15() {
  return { dc: 15, difficulty: "medium", unlocked: false, attempts: {}, forceAttempts: {}, forceDc: 15, allowRetries: false, method: ["tools"], jammed: false };
}
function chestTok(id, x, y, opened, lock) {
  return {
    id, kind: "chest", name: "Chest", size: 1, pos: { x, y }, lootBoxId: id,
    loot: {
      id, name: "Chest", boxType: "chest", container: "chest",
      opened: !!opened, taken: false,
      contents: [{ id: "trail-rations", name: "Trail rations", qty: 1 }, { id: "waterskin", name: "Waterskin", qty: 1 }],
      cash: { es: 0, black: 0, blackId: "", branch: "none" },
      lock: lock || { dc: 0, unlocked: true, attempts: {}, forceAttempts: {}, forceDc: 15 }
    }
  };
}
const scene = JSON.parse(read("map/scene-dusty-spur.json"));
const tokens = { tokens: {
  tok_ada: { id: "tok_ada", kind: "player", name: "Ada", ownerUid: "p_a", size: 1, pos: { x: 15, y: 10 } },
  tok_bea: { id: "tok_bea", kind: "player", name: "Bea", ownerUid: "p_b", size: 1, pos: { x: 12, y: 10 } },
  tok_lock: chestTok("tok_lock", 17, 10, false, lock15()),
  tok_hold: chestTok("tok_hold", 18, 10, false, lock15()),
  tok_expert: chestTok("tok_expert", 19, 10, false, lock15()),
  tok_un: chestTok("tok_un", 13, 10, false, lock15()),
  tok_loot: chestTok("tok_loot", 15, 12, true, { dc: 0, unlocked: true, attempts: {}, forceAttempts: {}, forceDc: 15 }),
  tok_off: chestTok("tok_off", 16, 12, false, lock15()),
  tok_pile_pc: { id: "tok_pile_pc", kind: "player", name: "Ned", ownerUid: "p_ned", size: 1, pos: { x: 15, y: 8 } },
  tok_pile_box: chestTok("tok_pile_box", 15, 8, false, lock15())
}};
const sheets = {
  bare: { name: "Ada", abilities: { DEX: 16 }, mods: { DEX: 3 }, prof: 2, items: [{ catalogId: "lantern", name: "Lantern", count: 1 }, { catalogId: "rope", name: "Rope", count: 1 }] },
  holder: { name: "Ada", abilities: { DEX: 16 }, mods: { DEX: 3 }, prof: 2, items: [{ catalogId: "thieves-tools", name: "Thieves' tools", count: 1 }] },
  expert: { name: "Ada", abilities: { DEX: 16 }, mods: { DEX: 3 }, prof: 2, toolProficiencies: ["Thieves' tools"], items: [{ catalogId: "thieves-tools", name: "Thieves' tools", count: 1 }] }
};
let sheetName = "bare";
w.SSDNSApp = { doc() { return { character: sheets[sheetName] }; } };
const store = { pub: {}, dm: {} };
const bus = [];
const host = { on() {}, players() { return []; }, getCard() { return null; }, actions: { get() { return []; }, run() { return Promise.resolve(); } } };
function boot(el, role, uid) {
  w.SSDNSMap.create({
    el, role, uid,
    adapter: w.SSDNSMapFirebase.memory({ role, uid, store, bus }),
    host,
    options: { scene, tokens: role === "dm" ? tokens : { tokens: {} }, assetBase: "", players: () => [], room: { table: { initiative: { order: [], turn: 0 } } } }
  });
}
const dm = w.document.createElement("div");
w.document.body.appendChild(dm);
boot(dm, "dm", "dm");
await flush(100);
const dmCanvas = dm.querySelector("canvas");

const adaDm = dmAt(15, 10);
clickAt(dmCanvas, adaDm.x, adaDm.y);
await flush(30);
let tokenMenu = openMenu(dm, "tokenCmd");
check("dm.token.menu", !!(tokenMenu && tokenMenu.querySelector('[data-act="tokenCmdMove"]') && tokenMenu.querySelector("[data-menu-close]")));
const dragged = tokenMenu && dragTitle(tokenMenu, 36, 18);
check("dm.token.drag", !!(dragged && dragged.left !== dragged.left0), JSON.stringify(dragged));
tap(tokenMenu.querySelector("[data-menu-close]"));
await flush(20);
check("dm.token.close", !openMenu(dm, "tokenCmd"));
clickAt(dmCanvas, adaDm.x, adaDm.y);
await flush(20);
esc(dm);
await flush(20);
check("dm.token.esc", !openMenu(dm, "tokenCmd"));

clickAt(dmCanvas, adaDm.x, adaDm.y);
await flush(10);
clickAt(dmCanvas, dmAt(17, 10).x, dmAt(17, 10).y);
await flush(20);
const dmPop = openMenu(dm, "dmChest");
check("one.menu.dm", !!(dmPop && !openMenu(dm, "tokenCmd")));
const titleBar = dmPop && dmPop.querySelector(".ssm-card-bar");
const closeBtn = titleBar && titleBar.querySelector("[data-menu-close]");
const closeWidth = closeBtn ? w.getComputedStyle(closeBtn).width : "";
check("dm.title", !!(titleBar && titleBar.querySelector("b") && titleBar.querySelector("b").textContent === "Chest" && closeBtn && !titleBar.querySelector("input") && closeWidth !== "100%"), "width=" + closeWidth);
const frameH = dm.clientHeight || 600;
check("dm.clamped", !!(dmPop && parseFloat(dmPop.style.maxHeight) > 0 && parseFloat(dmPop.style.maxHeight) <= frameH && parseFloat(dmPop.style.left) >= 4 && parseFloat(dmPop.style.top) >= 4), dmPop && dmPop.style.cssText);
check("dm.bodyScroll", !!(dmPop && dmPop.querySelector(".ssm-card-body") && w.getComputedStyle(dmPop.querySelector(".ssm-card-body")).overflow === "auto" && w.getComputedStyle(dmPop).overflow === "hidden"));
const dmDrag = dragTitle(dmPop, -24, 16);
check("dm.popup.drag", !!(dmDrag && (dmDrag.left !== dmDrag.left0 || dmDrag.top !== dmDrag.top0)), JSON.stringify(dmDrag));
tap(closeBtn);
await flush(10);
check("dm.popup.close", !openMenu(dm, "dmChest"));
clickAt(dmCanvas, dmAt(17, 10).x, dmAt(17, 10).y);
await flush(10);
esc(dm);
check("dm.popup.esc", !openMenu(dm, "dmChest"));

clickAt(dmCanvas, dmAt(15, 8).x, dmAt(15, 8).y);
await flush(20);
const chooser = openMenu(dm, "chooseMenu");
check("dm.chooser", !!(chooser && /Ned/.test(chooser.textContent) && /Chest/.test(chooser.textContent) && chooser.querySelector("[data-menu-close]") && !openMenu(dm, "dmChest") && !openMenu(dm, "tokenCmd")));
const chDrag = chooser && dragTitle(chooser, 20, 12);
check("dm.chooser.drag", !!(chDrag && chDrag.left !== chDrag.left0), JSON.stringify(chDrag));
tap(chooser.querySelector("[data-menu-close]"));
check("dm.chooser.close", !openMenu(dm, "chooseMenu"));
clickAt(dmCanvas, dmAt(15, 8).x, dmAt(15, 8).y);
await flush(10);
esc(dm);
check("dm.chooser.esc", !openMenu(dm, "chooseMenu"));

const pl = w.document.createElement("div");
w.document.body.appendChild(pl);
boot(pl, "player", "p_a");
await flush(150);
const plCanvas = pl.querySelector("canvas");
const origin = { x: 15, y: 10 };
function pat(gx, gy) { return plAt(origin, gx, gy); }

clickAt(plCanvas, pat(15, 10).x, pat(15, 10).y);
await flush(30);
let pToken = openMenu(pl, "tokenCmd");
check("pl.token.menu", !!(pToken && pToken.querySelector('[data-act="tokenCmdMove"]') && pToken.querySelector("[data-menu-close]")));
const pDrag = pToken && dragTitle(pToken, 28, 14);
check("pl.token.drag", !!(pDrag && pDrag.left !== pDrag.left0), JSON.stringify(pDrag));
tap(pToken.querySelector("[data-menu-close]"));
check("pl.token.close", !openMenu(pl, "tokenCmd"));
clickAt(plCanvas, pat(15, 10).x, pat(15, 10).y);
await flush(10);
esc(pl);
check("pl.token.esc", !openMenu(pl, "tokenCmd"));

clickAt(plCanvas, pat(15, 10).x, pat(15, 10).y);
await flush(10);
clickAt(plCanvas, pat(17, 10).x, pat(17, 10).y);
await flush(20);
let card = openMenu(pl, "chestMenu");
check("one.menu.player", !!(card && !openMenu(pl, "tokenCmd")));
check("notools.grey", !!(card && card.querySelector('[data-chest="pick"][disabled]') && /Needs thieves' tools/.test(card.textContent) && !/Improvise/.test(card.textContent)));
tap(card.querySelector('[data-chest="open"]'));
await flush(10);
card = openMenu(pl, "chestMenu");
check("notools.locked", !!(card && /It's locked/.test(card.textContent) && card.querySelector("[data-menu-close]")));
const cardDrag = dragTitle(card, -40, 12);
check("pl.card.drag", !!(cardDrag && cardDrag.left !== cardDrag.left0), JSON.stringify(cardDrag));
tap(card.querySelector("[data-menu-close]"));
check("pl.card.close", !openMenu(pl, "chestMenu"));
clickAt(plCanvas, pat(17, 10).x, pat(17, 10).y);
await flush(10);
esc(pl);
check("pl.card.esc", !openMenu(pl, "chestMenu"));

clickAt(plCanvas, pat(15, 12).x, pat(15, 12).y);
await flush(20);
let loot = openMenu(pl, "chestMenu");
check("pl.loot.window", !!(loot && /Take Trail rations/.test(loot.textContent) && /Take all/.test(loot.textContent)));
const lootDrag = loot && dragTitle(loot, 18, -12);
check("pl.loot.drag", !!(lootDrag && (lootDrag.left !== lootDrag.left0 || lootDrag.top !== lootDrag.top0)), JSON.stringify(lootDrag));
tap(loot.querySelector("[data-menu-close]"));
check("pl.loot.close", !openMenu(pl, "chestMenu"));
clickAt(plCanvas, pat(15, 12).x, pat(15, 12).y);
await flush(10);
esc(pl);
check("pl.loot.esc", !openMenu(pl, "chestMenu"));

clickAt(plCanvas, pat(15, 8).x, pat(15, 8).y);
await flush(20);
const pChoose = openMenu(pl, "chooseMenu");
check("pl.chooser", !!(pChoose && /Ned/.test(pChoose.textContent) && /Chest/.test(pChoose.textContent) && !openMenu(pl, "chestMenu") && !openMenu(pl, "tokenCmd")));
const pCh = pChoose && dragTitle(pChoose, 16, 8);
check("pl.chooser.drag", !!(pCh && pCh.left !== pCh.left0), JSON.stringify(pCh));
tap(pChoose.querySelector("[data-menu-close]"));
check("pl.chooser.close", !openMenu(pl, "chooseMenu"));
clickAt(plCanvas, pat(15, 8).x, pat(15, 8).y);
await flush(10);
esc(pl);
check("pl.chooser.esc", !openMenu(pl, "chooseMenu"));

const improvBox = dm.querySelector('[data-act="improviseLocks"]');
if (improvBox) { improvBox.checked = true; improvBox.dispatchEvent(new w.Event("change", { bubbles: true })); }
await flush(30);
clickAt(plCanvas, pat(17, 10).x, pat(17, 10).y);
await flush(20);
card = openMenu(pl, "chestMenu");
check("improv.on", !!(card && card.querySelector('[data-chest="improv"]') && !card.querySelector('[data-chest="pick"]')));
const rolls = [0.99, 0];
let ri = 0;
const origRandom = w.Math.random;
w.Math.random = () => rolls[Math.min(ri++, rolls.length - 1)];
tap(card.querySelector('[data-chest="improv"]'));
w.Math.random = origRandom;
await flush(40);
card = openMenu(pl, "chestMenu");
check("improv.disadv", !!(card && /disadv/.test(card.textContent) && /d20 1\/20/.test(card.textContent)), (card && card.textContent || "").replace(/\s+/g, " ").slice(0, 180));
if (improvBox) { improvBox.checked = false; improvBox.dispatchEvent(new w.Event("change", { bubbles: true })); }
await flush(20);
clickAt(plCanvas, pat(16, 12).x, pat(16, 12).y);
await flush(20);
card = openMenu(pl, "chestMenu");
check("improv.off", !!(card && !/Improvise/.test(card.textContent) && card.querySelector('[data-chest="pick"][disabled]')), (card && card.textContent || "").replace(/\s+/g, " ").slice(0, 160));

sheetName = "holder";
if (improvBox) { improvBox.checked = true; improvBox.dispatchEvent(new w.Event("change", { bubbles: true })); }
await flush(20);
clickAt(plCanvas, pat(18, 10).x, pat(18, 10).y);
await flush(20);
card = openMenu(pl, "chestMenu");
check("improv.hiddenForTools", !!(card && card.querySelector('[data-chest="pick"]:not([disabled])') && !/Improvise/.test(card.textContent)));
w.Math.random = () => 0.99;
tap(card.querySelector('[data-chest="pick"]'));
w.Math.random = origRandom;
await flush(40);
card = openMenu(pl, "chestMenu");
const holdLine = (card && card.textContent || "").replace(/\s+/g, " ");
check("prof.absent", /d20 20 \+3 Dex = 23/.test(holdLine) && !/tools/.test(holdLine), holdLine.slice(0, 180));

sheetName = "expert";
clickAt(plCanvas, pat(19, 10).x, pat(19, 10).y);
await flush(20);
card = openMenu(pl, "chestMenu");
check("expert.noImprov", !!(card && !/Improvise/.test(card.textContent)));
w.Math.random = () => 0.99;
tap(card.querySelector('[data-chest="pick"]'));
w.Math.random = origRandom;
await flush(40);
card = openMenu(pl, "chestMenu");
const expertLine = (card && card.textContent || "").replace(/\s+/g, " ");
check("prof.added", /d20 20 \+3 Dex \+2 tools = 25/.test(expertLine), expertLine.slice(0, 180));

clickAt(dmCanvas, dmAt(13, 10).x, dmAt(13, 10).y);
await flush(20);
const unlock = openMenu(dm, "dmChest");
tap(unlock.querySelector('[data-dm="unlock"]'));
await flush(30);
const published = store.pub["map/public/tokens/tok_un"] && store.pub["map/public/tokens/tok_un"].value;
check("dm.unlock", !!(published && published.loot && published.loot.lock && published.loot.lock.unlocked && published.loot.opened === false), JSON.stringify(published && published.loot && { opened: published.loot.opened, unlocked: published.loot.lock && published.loot.lock.unlocked }));
clickAt(plCanvas, pat(13, 10).x, pat(13, 10).y);
await flush(20);
card = openMenu(pl, "chestMenu");
check("player.afterUnlock", !!(card && !/It's locked/.test(card.textContent) && card.querySelector('[data-chest="open"]')));
tap(card.querySelector('[data-chest="open"]'));
await flush(20);
card = openMenu(pl, "chestMenu");
check("player.lootAfterOpen", !!(card && /Take Trail rations/.test(card.textContent)));
if (card && card.querySelector('[data-chest="loot"]')) tap(card.querySelector('[data-chest="loot"]'));
await flush(10);
card = openMenu(pl, "chestMenu");
check("player.lootButton", !!(card && /Take all/.test(card.textContent)));

const amb = dm.querySelector('[data-act="ambientSel"]');
if (amb) { amb.value = "bright"; amb.dispatchEvent(new w.Event("change", { bubbles: true })); }
await flush(30);
sheetName = "bare";
clickAt(plCanvas, pat(15, 10).x, pat(15, 10).y);
await flush(20);
pToken = openMenu(pl, "tokenCmd");
tap(pToken.querySelector('[data-act="tokenCmdDrop"]'));
await flush(10);
pToken = openMenu(pl, "tokenCmd");
tap(pToken.querySelector('[data-act="tokenCmdDropItem"]'));
await flush(40);
function countDrops() {
  const pub = Object.keys(store.pub).filter(k => k.indexOf("map/public/tokens/") === 0).map(k => store.pub[k].value).filter(t => t && (t.kind === "drop" || t.weaponDrop));
  return pub;
}
let drops = countDrops();
check("drop.published", drops.length === 1 && /Lantern/.test(drops[0].name || ""), drops.map(t => t.name).join(","));
check("drop.glyph", w.__gold > 0, "gold=" + w.__gold);
clickAt(plCanvas, pat(16, 10).x, pat(16, 10).y);
await flush(20);
let dropCard = openMenu(pl, "chestMenu");
check("drop.pickupOnly", !!(dropCard && dropCard.querySelector('[data-chest="pickup"]') && !dropCard.querySelector('[data-chest="open"]') && !dropCard.querySelector('[data-chest="loot"]') && !/Take all/.test(dropCard.textContent)));

clickAt(plCanvas, pat(15, 10).x, pat(15, 10).y);
await flush(10);
pToken = openMenu(pl, "tokenCmd");
tap(pToken.querySelector('[data-act="tokenCmdDrop"]'));
pToken = openMenu(pl, "tokenCmd");
const ropeBtn = Array.from(pToken.querySelectorAll('[data-act="tokenCmdDropItem"]')).find(b => /Rope/.test(b.textContent));
tap(ropeBtn || pToken.querySelector('[data-act="tokenCmdDropItem"]'));
await flush(40);
clickAt(plCanvas, pat(16, 10).x, pat(16, 10).y);
await flush(20);
dropCard = openMenu(pl, "chestMenu");
const picks = dropCard ? dropCard.querySelectorAll('[data-chest="pickup"]') : [];
check("drop.list", !!(dropCard && picks.length >= 2 && dropCard.querySelector('[data-chest="pickup-all"]')), (dropCard && dropCard.textContent || "").replace(/\s+/g, " ").slice(0, 160));

const bea = w.document.createElement("div");
w.document.body.appendChild(bea);
boot(bea, "player", "p_b");
await flush(150);
const beaCanvas = bea.querySelector("canvas");
const beaAt = plAt({ x: 12, y: 10 }, 16, 10);
clickAt(beaCanvas, beaAt.x, beaAt.y);
await flush(20);
const beaCard = openMenu(bea, "chestMenu");
check("drop.beaSees", !!beaCard);
const beforeItems = sheets.bare.items.map(it => it.name);
const adaBtn = dropCard && dropCard.querySelector('[data-chest="pickup"]');
if (adaBtn) tap(adaBtn);
if (beaCard) {
  const beaPick = beaCard.querySelector('[data-chest="pickup"]');
  if (beaPick) tap(beaPick);
}
await flush(50);
const adaToast = (pl.querySelector('[data-act="toast"]') || {}).textContent || "";
const beaToast = (bea.querySelector('[data-act="toast"]') || {}).textContent || "";
const added = sheets.bare.items.filter(it => beforeItems.indexOf(it.name) < 0 || it.catalogId === "lantern");
check("drop.onSheet", sheets.bare.items.some(it => /Lantern/.test(it.name || "") && (it.catalogId || "").indexOf("drop") < 0) || /Lantern/.test(adaToast), adaToast + " :: " + sheets.bare.items.map(it => it.name + ":" + it.catalogId).join(","));
drops = countDrops();
check("drop.gone", drops.length === 1 && /Rope/.test(drops[0].name || ""), drops.map(t => t && t.name).join(","));
check("drop.secondRefused", /Gone|Already taken/.test(beaToast), beaToast);

clickAt(plCanvas, pat(15, 10).x, pat(15, 10).y);
await flush(10);
pToken = openMenu(pl, "tokenCmd");
tap(pToken.querySelector('[data-act="tokenCmdDrop"]'));
pToken = openMenu(pl, "tokenCmd");
const again = Array.from(pToken.querySelectorAll('[data-act="tokenCmdDropItem"]')).find(b => /Lantern/.test(b.textContent));
tap(again || pToken.querySelector('[data-act="tokenCmdDropItem"]'));
await flush(40);
clickAt(plCanvas, pat(16, 10).x, pat(16, 10).y);
await flush(20);
dropCard = openMenu(pl, "chestMenu");
const takeAll = dropCard && dropCard.querySelector('[data-chest="pickup-all"]');
check("drop.takeAll.button", !!(takeAll && dropCard.querySelectorAll('[data-chest="pickup"]').length >= 2));
if (takeAll) tap(takeAll);
await flush(40);
drops = countDrops();
const ropes = sheets.bare.items.filter(it => /rope/i.test(it.name || it.catalogId || ""));
check("drop.takeAll", drops.length === 0 && ropes.length >= 2, drops.map(t => t.name).join(",") + " :: " + sheets.bare.items.map(it => it.catalogId || it.name).join(","));

function dmLine(gx, gy) { return { x: gx * 70 - 650, y: gy * 70 - 400 }; }
dm.querySelector('[data-act="wallBtn"]').click();
const wallA = dmLine(14, 11);
const wallB = dmLine(18, 11);
pointer(dmCanvas, "pointerdown", wallA.x, wallA.y);
pointer(dmCanvas, "pointerup", wallB.x, wallB.y);
await flush(20);
dm.querySelector('[data-act="wallBtn"]').click();
dm.querySelector('[data-act="doorBtn"]').click();
const cut = dmLine(15.2, 11);
pointer(dmCanvas, "pointerdown", cut.x, cut.y);
pointer(dmCanvas, "pointerup", cut.x, cut.y);
await flush(20);
dm.querySelector('[data-act="doorBtn"]').click();
clickAt(plCanvas, pat(15, 10).x, pat(15, 10).y);
await flush(20);
pToken = openMenu(pl, "tokenCmd");
const interact = pToken && pToken.querySelector('[data-act="tokenCmdInteract"]');
if (interact && !interact.disabled) tap(interact);
await flush(20);
const door = openMenu(pl, "doorMenu");
check("door.adjacent", !!(door && /Open/.test(door.textContent) && /Peek/.test(door.textContent) && door.querySelector("[data-menu-close]")), (door && door.textContent || "").replace(/\s+/g, " ").slice(0, 140));
if (door) {
  const dDrag = dragTitle(door, 12, 8);
  check("door.drag", dDrag.left !== dDrag.left0);
  tap(door.querySelector("[data-menu-close]"));
  check("door.close", !openMenu(pl, "doorMenu"));
}

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\nmap menus ok");
process.exit(0);

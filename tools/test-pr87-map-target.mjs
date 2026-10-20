/**
 * PR87 (0.3.81): the DM token card's Attacks button.
 *  - uses the target already chosen in the cylinder menu and fires straight away;
 *  - with no target, shows a clear "Click a target" banner (top of the card and over the map) with Cancel; Esc cancels;
 *  - valid targets are ringed while picking; a click on a target works even with a map tool (ruler) active;
 *  - the picked target shows in the cylinder Target select (both ways in sync);
 *  - 'Free shot' is the first entry of the cylinder Target select and fires with no target;
 *  - an armed range verdict only counts for the target it was measured against.
 *   node tools/test-pr87-map-target.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
function check(id, cond, detail) {
  if (!cond) failures.push(id);
  console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + detail : ""));
}
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
function flush(ms) { return new Promise((r) => setTimeout(r, ms)); }

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/", pretendToBeVisual: true, runScripts: "dangerously" });
const w = dom.window;
const proto = w.HTMLElement.prototype;
Object.defineProperty(proto, "clientWidth", { configurable: true, get() { return 800; } });
Object.defineProperty(proto, "clientHeight", { configurable: true, get() { return 600; } });
proto.getBoundingClientRect = function () { return { x: 0, y: 0, left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, toJSON() { return {}; } }; };
w.__gold = 0;
w.HTMLCanvasElement.prototype.getContext = function () {
  const bag = {};
  return new Proxy(bag, {
    get(t, p) { if (p in t) return t[p]; if (typeof p !== "string") return undefined; return function () { return bag; }; },
    set(t, p, v) { t[p] = v; if (p === "strokeStyle" && v === "#ffd34d") w.__gold += 1; return true; }
  });
};
w.HTMLImageElement.prototype.decode = function () { return Promise.resolve(); };
w.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
function addScript(rel) { const s = w.document.createElement("script"); s.textContent = read(rel); w.document.body.appendChild(s); }
function pointer(el, type, x, y) {
  const Ev = w.PointerEvent || w.MouseEvent;
  const ev = new Ev(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, button: 0, buttons: 1 });
  if (ev.pointerId == null) { try { Object.defineProperty(ev, "pointerId", { value: 1 }); } catch (e) {} }
  el.dispatchEvent(ev);
}
addScript("assets/js/range-rings.js");
addScript("map/ssdns-map-firebase.js");
addScript("map/ssdns-map.js");

const scene = JSON.parse(read("map/scene-dusty-spur.json"));
/* view is centred on the scene at zoom 1: screen = world - (1050 - 400, 700 - 300) */
const tokens = { tokens: {
  tok_sh: { id: "tok_sh", kind: "enemy", name: "Bandit", combatantId: "en_sh", size: 1, pos: { x: 12, y: 8 } },
  tok_t: { id: "tok_t", kind: "player", name: "Dust", combatantId: "p_t", ownerUid: "p_t", size: 1, pos: { x: 15, y: 8 } }
} };
const screenOf = (gx, gy) => ({ x: (gx + 0.5) * 70 - 650, y: (gy + 0.5) * 70 - 400 });
const card = {
  kind: "enemy", name: "Bandit", ac: 12, hp: { cur: 10, max: 10 },
  attacks: [
    { id: "navy", name: "Navy", toHit: 4, damage: "1d8", range: "50/150", group: "pistol", ammo: { cap: 6, loaded: 6 } },
    { id: "knife", name: "Knife", toHit: 3, damage: "1d4" }
  ],
  spells: [{ id: "hexbolt", name: "Hex Bolt", kind: "attack", toHit: 5, range: "60 ft", level: 1 }]
};
let selected = "";
const events = [];
const host = {
  on(name, detail) { events.push({ name, detail }); },
  getCard(id) { return id === "tok_sh" ? card : { kind: "pc", name: "Dust", ac: 13, hp: { cur: 9, max: 9 }, attacks: [] }; },
  combatTargets() { return { selected: selected, options: [{ id: "p_t", name: "Dust", label: "Dust · AC 13" }] }; },
  actions: { get() { return []; }, run() { return Promise.resolve(); } },
  players() { return []; }
};
const el = w.document.createElement("div");
w.document.body.appendChild(el);
w.SSDNSMap.create({ el, role: "dm", uid: "dm", adapter: w.SSDNSMapFirebase.memory({ role: "dm" }), host, options: { scene, tokens, assetBase: "", players: () => [], room: { table: { initiative: { order: [], turn: 0 } } } } });
await flush(80);
const canvas = el.querySelector("canvas");
const act = (name) => el.querySelector('[data-act="' + name + '"]');
const drawer = () => act("drawer");
const targets = () => events.filter((e) => e.name === "drawer:target");
const atkBtn = (wid) => drawer().querySelector('.ssm-atk[data-wid="' + wid + '"]');
const sh = screenOf(12, 8), tg = screenOf(15, 8);

/* open the shooter's card */
pointer(canvas, "pointerdown", sh.x, sh.y); pointer(canvas, "pointerup", sh.x, sh.y);
await flush(20);
check("open.drawer", !!drawer() && drawer().textContent.includes("Bandit"), drawer() && drawer().textContent.slice(0, 80));
const cyl0 = act("cylTarget");
check("free.firstOption", !!cyl0 && cyl0.options[0].value === "__free" && cyl0.options[0].textContent === "Free shot", cyl0 && cyl0.outerHTML);
check("free.notDefault", !!cyl0 && cyl0.value === "", cyl0 && cyl0.value);

/* no target chosen: Attacks asks, with a visible banner at the top and a Cancel */
atkBtn("knife").click();
await flush(20);
const body = drawer().querySelector(".ssm-drawer-body");
const banner = body && body.querySelector(".ssm-pending");
check("pending.bannerTop", !!banner && body.firstElementChild === banner && /Click a target/.test(banner.textContent) && /Knife/.test(banner.textContent), body && body.firstElementChild && body.firstElementChild.outerHTML);
check("pending.cancelBtn", !!(banner && banner.querySelector('[data-act="pendingCancel"]')));
const overlay = el.querySelector(".ssm-pending-map");
check("pending.mapOverlay", !!overlay && !overlay.hidden && /Click a target/.test(overlay.textContent) && !!overlay.querySelector("button"), overlay && overlay.outerHTML);
check("pending.noFire", targets().length === 0);
w.__gold = 0;
await flush(300);
check("pending.highlight", w.__gold > 0, "gold rings " + w.__gold);
banner.querySelector('[data-act="pendingCancel"]').click();
await flush(20);
check("cancel.cleared", !drawer().querySelector(".ssm-pending") && el.querySelector(".ssm-pending-map").hidden);
w.__gold = 0; await flush(300);
check("cancel.noHighlight", w.__gold === 0, "gold rings " + w.__gold);

atkBtn("knife").click();
await flush(10);
w.document.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
await flush(10);
check("esc.cleared", !drawer().querySelector(".ssm-pending") && el.querySelector(".ssm-pending-map").hidden);

/* empty-space click keeps the prompt */
atkBtn("knife").click();
await flush(10);
pointer(canvas, "pointerdown", 700, 560); pointer(canvas, "pointerup", 700, 560);
await flush(10);
check("empty.keeps", !!drawer().querySelector(".ssm-pending") && targets().length === 0);
check("empty.toast", /highlighted token/.test((act("toast") || {}).textContent || ""), (act("toast") || {}).textContent);

/* Knife reaches 5 ft; the target is 15 ft away: the pick shows the out-of-range toast and fires nothing */
pointer(canvas, "pointerdown", tg.x, tg.y); pointer(canvas, "pointerup", tg.x, tg.y);
await flush(30);
check("range.blockedToast", targets().length === 0 && !drawer().querySelector(".ssm-pending") && /range|reach|ft/i.test((act("toast") || {}).textContent || ""), (act("toast") || {}).textContent);
const cylR = act("cylTarget");
cylR.value = ""; cylR.dispatchEvent(new w.Event("change", { bubbles: true }));
await flush(10);
/* a map tool (Ruler) is active: the click on the target still picks it */
atkBtn("navy").click();
await flush(10);
act("rulerBtn").click();
await flush(10);
pointer(canvas, "pointerdown", tg.x, tg.y); pointer(canvas, "pointerup", tg.x, tg.y);
await flush(30);
const t1 = targets().pop();
check("tool.pickWorks", !!t1 && t1.detail.weaponId === "navy" && !!t1.detail.targetTokenId && t1.detail.targetCombatantId === "p_t" && t1.detail.tokenId === "tok_sh", JSON.stringify(t1 && t1.detail));
check("tool.promptGone", !drawer().querySelector(".ssm-pending") && el.querySelector(".ssm-pending-map").hidden);
check("sync.clickToSelect", act("cylTarget") && act("cylTarget").value === "p_t", act("cylTarget") && act("cylTarget").value);
act("rulerBtn").click();

/* target already chosen: Attacks fires straight away, weapons and spells */
const n0 = targets().length;
atkBtn("navy").click();
await flush(20);
const t2 = targets().pop();
check("preset.weaponDirect", targets().length === n0 + 1 && t2.detail.weaponId === "navy" && t2.detail.targetCombatantId === "p_t" && !drawer().querySelector(".ssm-pending"), JSON.stringify(t2 && t2.detail));
drawer().querySelector('.ssm-atk[data-sid="hexbolt"]').click();
await flush(20);
const t3 = targets().pop();
check("preset.spellDirect", targets().length === n0 + 2 && t3.detail.spellId === "hexbolt" && t3.detail.targetCombatantId === "p_t" && !drawer().querySelector(".ssm-pending"), JSON.stringify(t3 && t3.detail));

/* the cylinder select drives it: pick Free shot */
const cyl = act("cylTarget");
cyl.value = "__free";
cyl.dispatchEvent(new w.Event("change", { bubbles: true }));
await flush(20);
check("sync.selectKept", act("cylTarget").value === "__free");
atkBtn("navy").click();
await flush(20);
const t4 = targets().pop();
check("free.attacks", !!t4 && t4.detail.free === true && t4.detail.weaponId === "navy" && !t4.detail.targetTokenId && !drawer().querySelector(".ssm-pending"), JSON.stringify(t4 && t4.detail));
drawer().querySelector('[data-act="chamber"]').click();
await flush(20);
const t5 = targets().pop();
check("free.chamber", !!t5 && t5.detail.free === true && t5.detail.chamber != null && t5.detail.weaponId === "navy", JSON.stringify(t5 && t5.detail));
const n1 = targets().length;
drawer().querySelector('.ssm-atk[data-sid="hexbolt"]').click();
await flush(20);
check("free.spellAsks", targets().length === n1 && !!drawer().querySelector(".ssm-pending"));
w.document.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
await flush(10);

/* the default target from the fight (no click yet) also counts as chosen */
const cyl2 = act("cylTarget");
cyl2.value = "";
cyl2.dispatchEvent(new w.Event("change", { bubbles: true }));
await flush(10);
selected = "p_t";
pointer(canvas, "pointerdown", sh.x, sh.y); pointer(canvas, "pointerup", sh.x, sh.y);
await flush(20);
/* 'No target' picked in the cylinder menu sticks (it doesn't snap back to the fight's default) */
check("noTarget.sticks", act("cylTarget").value === "", act("cylTarget").value);
atkBtn("navy").click();
await flush(10);
check("noTarget.asks", !!drawer().querySelector(".ssm-pending"));
w.document.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
await flush(10);
/* another token's card, then back: the fight's default target is chosen again */
pointer(canvas, "pointerdown", tg.x, tg.y); pointer(canvas, "pointerup", tg.x, tg.y);
await flush(20);
pointer(canvas, "pointerdown", sh.x, sh.y); pointer(canvas, "pointerup", sh.x, sh.y);
await flush(20);
check("default.shown", act("cylTarget").value === "p_t", act("cylTarget").value);
const n2 = targets().length;
atkBtn("navy").click();
await flush(20);
check("default.direct", targets().length === n2 + 1 && targets().pop().detail.targetCombatantId === "p_t");

/* range verdicts belong to their target */
const R = w.SSDNSRangeRings;
R.arm({ apply: true, disadvantage: false, targetRefs: ["near"] });
check("verdict.sameTarget", !!R.peekFor("near"));
check("verdict.otherTargetDropped", R.peekFor("far") === null && R.peek() === null);
R.arm({ apply: true, disadvantage: true });
check("verdict.unboundKept", !!R.peekFor("any"));
R.clear();

const src = read("map/ssdns-map.js");
const pd = src.slice(src.indexOf("function onPointerDown(e)"), src.indexOf("function onPointerDown(e)") + 900);
check("src.pickBeforeTools", pd.indexOf("state.pendingTarget") >= 0 && pd.indexOf("state.pendingTarget") < pd.indexOf("state.tool === 'room'"));
check("src.playerFree", /options = \[\{ id: FREE_SHOT, label: 'Free shot' \}, \{ id: '', label: 'No target' \}\]/.test(src));
const css = read("map/ssdns-map.css");
check("css.banner", css.includes(".ssm-pending-map") && /\.ssm-pending \{[^}]*position: sticky/.test(css));

console.log(failures.length ? "\n" + failures.length + " FAILED: " + failures.join(", ") : "\nAll PR87 map target checks passed.");
process.exit(failures.length ? 1 : 0);

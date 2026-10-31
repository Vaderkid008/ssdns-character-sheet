/**
 * Attack effects on the map (firing lines), Jessey 2026-10-20.
 *  - the effect type picked per attack (gun, buckshot, arrow, bolt, thrown, spell, dynamite, free shot, blade, blunt)
 *  - sound timing hooks (result at impact, Whistler trail, dynamite boom on landing; nothing replays for `heard`)
 *  - hidden shooters never reach players (no id, no position; fog-edge start or no row at all)
 *  - the "Effects" toggle (default on, saved per user on this device, stops the animation)
 *  - beforeEffect(roll) hook (default resolves at once; raw d20 + crit flag on the event)
 *   node tools/test-attack-fx.mjs
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
  proto.getBoundingClientRect = function () { return { x: 0, y: 0, left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, toJSON() { return {}; } }; };
  w.__calls = [];
  w.HTMLCanvasElement.prototype.getContext = function () {
    const bag = {};
    const canvas = this;
    return new Proxy(bag, {
      get(t, p) {
        if (p in t) return t[p];
        if (typeof p !== "string") return undefined;
        return function (...args) { w.__calls.push([p, args, canvas]); return bag; };
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

/* ---------- static wiring ---------- */
const mapSrc = read("map/ssdns-map.js");
const v2 = read("dm/assets/js/v2.js");
check("src.overlay", mapSrc.includes("fxCanvas.className = 'ssm-fx'") || mapSrc.includes('fxCanvas.className = "ssm-fx"'));
check("src.toggleButton", mapSrc.includes('data-act="fxBtn"'));
check("src.scripts", read("index.html").includes("map/ssdns-map-fx.js") && read("dm/index.html").includes("../map/ssdns-map-fx.js")
  && read("index.html").indexOf("map/ssdns-map-fx.js") < read("index.html").indexOf("map/ssdns-map.js?"));
check("src.dmHooks", (v2.match(/mapFx\(\{/g) || []).length >= 5, String((v2.match(/mapFx\(\{/g) || []).length));
check("src.hostFx", read("map/ssdns-map-host.js").includes("fx: function (spec)"));
check("src.rulesUntouched", !read("database.rules.json").includes("fxReq") && !read("database.rules.json").includes('"fx"'));
check("src.feedOnly", read("assets/js/dm-join.js").includes("delete entry.fxReq"), "fxReq must never be written to rolls/");
check("src.sheetFx", read("assets/js/sheet-extras.js").includes("function sheetMapFx") && read("assets/js/sheet-extras.js").includes("host.fx"));
check("src.ownReq", read("map/ssdns-map.js").includes("fxSpecFromReq"));
check("src.sfxJson", (() => { try { const j = JSON.parse(read("assets/sfx/sfx.json")); return j.fx && j.fx.boomFlight > 0; } catch (e) { return false; } })());

/* ---------- module: classify / plan / sanitize ---------- */
const w = makeWindow();
const plays = [];
w.SSDNSAudio = {
  outcomeCue(info, r) { return (info.spell ? "spell-" : info.gun ? "gun-" : "x-") + r; },
  arrowKey(a) { return a ? "arrow-" + a : ""; },
  arrowCue(a, fb) { return a === "dynamite" ? "arrow-dynamite" : fb; },
  hasFile(k) { return k === "arrow-whistler" ? !!w.__whistleFile : true; },
  playNow(n) { plays.push({ n, t: Date.now() }); },
  play(n) { plays.push({ n, t: Date.now(), queued: true }); }
};
addScript(w, "map/ssdns-map-fx.js");
addScript(w, "map/ssdns-map-firebase.js");
addScript(w, "map/ssdns-map.js");
const FX = w.SSDNSMapFx;
check("mod.loaded", !!FX && w.SSDNSMapFX === FX && typeof FX.beforeEffect === "function");
const cls = (o) => FX.classify(o);
check("type.revolver", cls({ weapon: "LeGloss Revolver", gun: true }) === "gun");
check("type.rifle", cls({ weapon: "Winchester Rifle", sfx: "rifle" }) === "gun");
check("type.buckshot", cls({ weapon: "Coach Gun", scatter: true }) === "buck" && cls({ sfx: "shotgun" }) === "buck");
check("type.arrow", cls({ weapon: "Shortbow", gun: true }) === "arrow" && cls({ weapon: "Longbow", arrow: "whistler" }) === "arrow");
check("type.bolt", cls({ weapon: "Light Crossbow", gun: true }) === "bolt");
check("type.thrown", cls({ weapon: "Javelin" }) === "thrown");
check("type.spell", cls({ weapon: "Hex Bolt", spell: true }) === "spell" && cls({ type: "spell" }) === "spell");
check("type.dynamite", cls({ weapon: "Dynamite" }) === "boom" && cls({ arrow: "dynamite", weapon: "Shortbow" }) === "boom");
check("type.free", cls({ type: "free", weapon: "LeGloss Revolver" }) === "free" && cls({ free: true }) === "free");
check("type.blade", cls({ weapon: "Saber" }) === "blade" && cls({ weapon: "Bowie Knife" }) === "blade");
check("type.blunt", cls({ weapon: "Club" }) === "blunt" && cls({ weapon: "Unarmed strike" }) === "blunt" && cls({ weapon: "Pistol whip", dmgType: "bludgeoning" }) === "blunt");

const T = FX.TIMING;
const pGun = FX.plan("gun", "hit", {});
check("plan.gunImpact", pGun.impactAt === T.tracerGrow && pGun.cues.some((c) => c.layer === "result" && c.at === pGun.impactAt), JSON.stringify(pGun));
check("plan.noShotLayer", ["gun", "buck", "arrow", "spell", "blade", "blunt", "boom"].every((t) => !FX.plan(t, "hit", {}).cues.some((c) => c.layer === "shot")));
const pArrow = FX.plan("arrow", "hit", { arrow: "whistler" });
check("plan.arrowFlight", pArrow.impactAt === T.arrowFlight && pArrow.cues.some((c) => c.layer === "trail" && c.at === T.whistleAfter), JSON.stringify(pArrow.cues));
const pBoom = FX.plan("boom", "hit", { arrow: "dynamite" });
check("plan.boomOnLanding", pBoom.cues.some((c) => c.layer === "boom" && c.at === T.boomFlight), JSON.stringify(pBoom.cues));
check("plan.dudQuiet", !FX.plan("boom", "dud", {}).cues.some((c) => c.layer === "boom"));
const pMelee = FX.plan("blade", "miss", {});
check("plan.meleeStrike", pMelee.impactAt === T.meleeStrike);

const dirty = FX.sanitize({ type: "gun", result: "hit", shooter: "tok_a", target: "tok_b", hp: 3, maxHp: 9, ac: 15, dmText: "x", nat: 20, crit: true, heard: ["a", "b", "c", "d", "e"] });
check("sanitize.whitelist", dirty && dirty.hp == null && dirty.maxHp == null && dirty.ac == null && dirty.dmText == null && dirty.nat === 20 && dirty.crit === true && dirty.heard.length <= 4, JSON.stringify(dirty));
check("sanitize.badNat", FX.sanitize({ type: "gun", nat: 44 }).nat == null);
const req = FX.request({ target: "enemy1", result: "miss", sfx: "revolver", weapon: "LeGloss Revolver", gun: true, nat: 4, ac: 12, hp: 4 });
check("request.clean", req.type === "gun" && req.result === "miss" && req.nat === 4 && req.ac == null && req.hp == null, JSON.stringify(req));

/* Catalog chunk looks win over the purple ribbon. Ribbon stays the fallback for a spell that is not in the catalog. */
check("look.holdLabel", FX.lookOf({ type: "spell", spell: "Hold Person (Lasso)" }) === "lasso");
check("look.holdInside", FX.lookOf({ type: "spell", spell: "Lasso (Hold Person)" }) === "lasso");
check("look.holdWeapon", FX.lookOf({ type: "spell", weapon: "Hold Person (Lasso)" }) === "lasso" && FX.namedLook("Hold Person (Lasso)") === "lasso");
check("look.tile", FX.tileOf("Hold Person (Lasso)") === "map/spell-fx/tiles/08-hold-person.jpg");
check("look.fireBolt", FX.lookOf({ type: "spell", spell: "Fire Bolt", dmg: "fire" }) === "fire");
check("look.wish", FX.lookOf({ type: "spell", spell: "Wish" }) === "ribbon");
check("look.blank", FX.lookOf({ type: "spell" }) === "ribbon");
check("look.boolNotName", FX.lookOf({ type: "spell", spell: true, weapon: "Faerie Fire (Foxfire)" }) === "foxfire");
const kept = FX.sanitize({ type: "spell", spell: true, weapon: "Hold Person (Lasso)", dmgType: "necrotic" });
check("sanitize.spellName", kept && kept.spell === "Hold Person (Lasso)" && kept.dmg === "necrotic" && kept.spell !== "true", JSON.stringify(kept));
const reqSpellName = FX.request({ type: "spell", spell: true, weapon: "Faerie Fire (Foxfire)", dmg: "Fire" });
check("request.spellName", reqSpellName.spell === "Faerie Fire (Foxfire)" && reqSpellName.dmg === "fire" && reqSpellName.type === "spell", JSON.stringify(reqSpellName));
w.SSDNS_RULES = { spellAliases: [{ phb: "Faerie Fire", alias: "Foxfire" }, { phb: "Hold Person", alias: "Lasso" }, { phb: "Fire Bolt", alias: "Powder Spark" }] };
check("look.alias", FX.lookOf({ type: "spell", spell: "Foxfire" }) === "foxfire" && FX.namedLook("Lasso") === "lasso" && FX.lookOf({ type: "spell", spell: "Powder Spark", dmg: "fire" }) === "fire");

/* ---------- live maps: DM publishes, player draws ---------- */
const scene = JSON.parse(read("map/scene-dusty-spur.json"));
delete scene.fogRects; delete scene.fogPolys; delete scene.fogShapes; delete scene.walls;
scene.fogRevealed = true;
const store = { pub: {}, dm: {} };
const bus = [];
const dmAd = w.SSDNSMapFirebase.memory({ role: "dm", store, bus });
const SC = "scn_dustyspur01";
const toks = {
  ply_p1: { id: "ply_p1", name: "Cole", label: "Cole", kind: "player", ownerUid: "p1", pos: { x: 10, y: 8 }, size: 1, sceneId: SC },
  tok_out: { id: "tok_out", name: "Outlaw", label: "Outlaw", kind: "enemy", combatantId: "c_out", pos: { x: 16, y: 8 }, size: 1, sceneId: SC },
  tok_big: { id: "tok_big", name: "Ox", label: "Ox", kind: "enemy", combatantId: "c_big", pos: { x: 12, y: 12 }, size: 2, sceneId: SC },
  tok_hid: { id: "tok_hid", name: "Sniper", label: "Sniper", kind: "enemy", combatantId: "c_hid", hidden: true, pos: { x: 22, y: 8 }, size: 1, sceneId: SC },
  tok_hid2: { id: "tok_hid2", name: "Lurker", label: "Lurker", kind: "enemy", combatantId: "c_hid2", hidden: true, pos: { x: 13, y: 9 }, size: 1, sceneId: SC },
  tok_hidT: { id: "tok_hidT", name: "Ghost", label: "Ghost", kind: "enemy", combatantId: "c_ghost", hidden: true, pos: { x: 8, y: 4 }, size: 1, sceneId: SC }
};
Object.keys(toks).forEach((id) => { store.dm["map/dm/tokens/" + id] = { value: JSON.parse(JSON.stringify(toks[id])), seq: 1 }; });
const dmEl = w.document.createElement("div"); w.document.body.appendChild(dmEl);
const dm = w.SSDNSMap.create({
  el: dmEl, role: "dm", uid: "dm", adapter: dmAd, host: { on() {}, players() { return []; } },
  options: { scene, tokens: { tokens: JSON.parse(JSON.stringify(toks)) }, assetBase: "", players: () => [], room: { table: { initiative: { order: [], turn: 0 } } } }
});
await flush(80);
Object.keys(toks).forEach((id) => {
  const t = toks[id];
  if (t.hidden) return;
  const pub = Object.assign({}, t); delete pub.combatantId;
  store.pub["map/public/tokens/" + id] = { value: pub, seq: 1 };
});
/* Fog off for the open-ground checks (the map boots with fog on); the fog cases below put it back on purpose */
dmEl.querySelector('[data-act="fogBtn"]').click();
await flush(20);
check("setup.fogOff", /OFF/.test(dmEl.querySelector('[data-act="fogBtn"]').textContent));
const plAd = w.SSDNSMapFirebase.memory({ role: "player", store, bus });
const plEl = w.document.createElement("div"); w.document.body.appendChild(plEl);
const pl = w.SSDNSMap.create({ el: plEl, role: "player", uid: "p1", adapter: plAd, host: { on() {} }, options: { scene, assetBase: "", room: { table: { initiative: { order: [], turn: 0 } } } } });
await flush(80);
/* the memory adapter delivers the stored scene synchronously, before the player map's boot resets fog; re-send it */
function resendScene(mut) {
  const row = store.pub["map/public/scenes/" + SC];
  const val = JSON.parse(JSON.stringify(row.value));
  if (mut) mut(val);
  return dmAd.write("map/public/scenes/" + SC, val, { seq: (row.seq || 1) + 1 });
}
await resendScene();
await flush(40);

check("overlay.exists", dmEl.querySelectorAll("canvas.ssm-fx").length === 1 && dmEl.querySelector("canvas") !== dmEl.querySelector("canvas.ssm-fx"));
check("overlay.passive", (dmEl.querySelector("canvas.ssm-fx").getAttribute("aria-hidden") === "true"));
check("toggle.defaultOn", FX.enabled() === true && /ON/.test(dmEl.querySelector('[data-act="fxBtn"]').textContent), dmEl.querySelector('[data-act="fxBtn"]') && dmEl.querySelector('[data-act="fxBtn"]').textContent);
check("toggle.player", !!plEl.querySelector('[data-act="fxBtn"]'));

function feedRows() { return Object.keys(store.pub).filter((k) => k.indexOf("tableFeed/") === 0).map((k) => store.pub[k].value); }
function lastLog(m) { const l = m.fxLog(); return l[l.length - 1]; }

/* DM hit on a visible target by a visible shooter */
let events = [];
plEl.addEventListener("ssdns-map-fx", (e) => events.push(e.detail));
plays.length = 0;
let pub = dm.fx({ id: "r1", shooter: "c_out", target: "p1", result: "hit", weapon: "LeGloss Revolver", gun: true, nat: 20, crit: true, heard: ["dm"] });
await flush(20);
let rows = feedRows();
check("dm.publishes", rows.length === 1 && rows[0].kind === "sfx" && rows[0].event === "fx" && rows[0].id === "fx_r1" && rows[0].fx.shooter === "tok_out" && rows[0].fx.target === "ply_p1", JSON.stringify(rows));
check("dm.noCombatantIds", !JSON.stringify(rows).includes("c_out"), "public row must use token ids");
check("dm.localLog", lastLog(dm) && lastLog(dm).type === "gun" && lastLog(dm).result === "hit" && lastLog(dm).local === true);
check("player.draws", lastLog(pl) && lastLog(pl).type === "gun" && lastLog(pl).srcHidden === false, JSON.stringify(pl.fxLog()));
check("event.d20", events.length === 1 && events[0].nat === 20 && events[0].crit === true && events[0].natural20 === true, JSON.stringify(events));
check("anim.running", pl.fxAnimating() === true || pl.fxActive() > 0);
const fxCanvasPl = plEl.querySelector("canvas.ssm-fx");
await flush(60);
check("anim.paintsOverlay", w.__calls.some((c) => c[2] === fxCanvasPl && (c[0] === "stroke" || c[0] === "fill" || c[0] === "lineTo")));
/* sound: DM heard the hit already (resolver); the player hears it at impact; no shot cue from the map */
await flush(250);
check("sound.playerAtImpact", plays.some((p) => p.n === "gun-hit"), JSON.stringify(plays));
check("sound.dmNoReplay", plays.filter((p) => p.n === "gun-hit").length === 1, JSON.stringify(plays));
check("sound.noShotFromMap", !plays.some((p) => /revolver|attack|shot/.test(p.n)));
await flush(900);
check("anim.stops", pl.fxAnimating() === false && pl.fxActive() === 0 && dm.fxAnimating() === false);

/* types per attack on the live map */
const typeCases = [
  [{ id: "t_buck", shooter: "c_out", target: "p1", result: "hit", weapon: "Coach Gun", scatter: true }, "buck"],
  [{ id: "t_arrow", shooter: "c_out", target: "p1", result: "miss", weapon: "Shortbow", arrow: "whistler" }, "arrow"],
  [{ id: "t_spell", shooter: "c_out", target: "p1", result: "hit", weapon: "Hex Bolt", spell: true }, "spell"],
  [{ id: "t_blade", shooter: "c_out", target: "p1", result: "hit", weapon: "Saber" }, "blade"],
  [{ id: "t_blunt", shooter: "c_out", target: "p1", result: "miss", weapon: "Club" }, "blunt"],
  [{ id: "t_free", type: "free", shooter: "c_out", weapon: "LeGloss Revolver" }, "free"],
  [{ id: "t_boom", shooter: "c_out", target: "p1", result: "hit", weapon: "Dynamite" }, "boom"]
];
for (const [spec, want] of typeCases) {
  dm.fx(spec);
  await flush(10);
  const got = lastLog(pl);
  check("live.type." + want, got && got.type === want, JSON.stringify(got));
}
const freeRow = feedRows().find((r) => r.id === "fx_t_free");
check("free.dir", freeRow && freeRow.fx.dir && freeRow.fx.dir.x < 0 && !freeRow.fx.target, JSON.stringify(freeRow));
await flush(1300);

/* big token: centre and radius follow size */
dm.fx({ id: "big1", shooter: "c_big", target: "p1", result: "hit", weapon: "Rifle", gun: true });
check("size.rowUsesToken", feedRows().some((r) => r.id === "fx_big1" && r.fx.shooter === "tok_big"));

/* ---------- leaks: hidden shooter ---------- */
/* hidden shooter standing in the open (no hide fog): players get no row at all */
let before = feedRows().length;
pub = dm.fx({ id: "h1", shooter: "c_hid2", target: "p1", result: "hit", weapon: "Rifle", gun: true });
await flush(10);
check("leak.hiddenOpen.noRow", pub == null && feedRows().length === before && dm.fxLog().length > 0);
/* hidden target: no row */
pub = dm.fx({ id: "h2", shooter: "c_out", target: "c_ghost", result: "hit", weapon: "Rifle", gun: true });
check("leak.hiddenTarget.noRow", pub == null && !feedRows().some((r) => r.id === "fx_h2"));
/* hidden shooter inside a DM hide-fog patch: players get a start point at the fog edge, no id */
/* the DM draws a Hide box over the sniper's corner (DM map reads fog from its own scene data) */
await resendScene((v) => { v.fogRevealed = true; v.fogShapes = [{ id: "f1", kind: "box", op: "hide", x: 19, y: 5, w: 6, h: 7 }]; });
await flush(40);
pub = dm.fx({ id: "h3", shooter: "c_hid", target: "p1", result: "miss", weapon: "Rifle", gun: true, nat: 3 });
await flush(20);
const h3 = feedRows().find((r) => r.id === "fx_h3");
check("leak.fogShooter.row", !!h3 && !h3.fx.shooter && h3.fx.src && h3.fx.src.x <= 19.05 && h3.fx.src.x >= 18.9, JSON.stringify(h3));
check("leak.fogShooter.noIds", h3 && !JSON.stringify(h3).includes("tok_hid") && !JSON.stringify(h3).includes("c_hid") && !JSON.stringify(h3).includes("Sniper"));
check("leak.fogShooter.notAtToken", h3 && Math.hypot(h3.fx.src.x - 22.5, h3.fx.src.y - 8.5) >= 1);
const plH3 = pl.fxLog().find((l) => l.srcHidden);
check("leak.player.noMuzzle", !!plH3 && plH3.type === "gun", JSON.stringify(pl.fxLog().slice(-2)));
/* a visible enemy standing inside hide fog is treated the same */
const toks2 = dmAd; /* no-op: keeps the memory bus alive */
/* free shot from a hidden shooter: nothing for players */
pub = dm.fx({ id: "h4", type: "free", shooter: "c_hid", weapon: "Rifle" });
check("leak.hiddenFree.noRow", pub == null && !feedRows().some((r) => r.id === "fx_h4"));
/* player map never draws at an id it doesn't have */
const nBefore = pl.fxLog().length;
pl.fx({ id: "p_bad", shooter: "tok_hid", target: "p1", result: "hit", gun: true });
check("leak.player.unknownShooter", pl.fxLog().length === nBefore);
check("leak.player.tokensClean", !Object.keys(store.pub).some((k) => /tok_hid/.test(k)));
await flush(1200);

/* ---------- player request (known-AC roll) → DM publishes for everyone ---------- */
const reqRow = { id: "r_req1", ts: new Date().toISOString(), from: "p1", fromName: "Cole", text: "roll", kind: "roll",
  fxReq: FX.request({ target: "c_out", result: "hit", sfx: "revolver", weapon: "LeGloss Revolver", gun: true, nat: 15 }) };
store.pub["tableFeed/r_req1"] = { value: reqRow };
bus.forEach((fn) => fn("tableFeed/r_req1", reqRow, {}));
await flush(30);
const pubReq = feedRows().find((r) => r.id === "fx_r_req1");
check("req.dmPublishes", !!pubReq && pubReq.fx.shooter === "ply_p1" && pubReq.fx.target === "tok_out" && (pubReq.fx.heard || []).indexOf("p1") >= 0, JSON.stringify(pubReq));
const reqAgain = feedRows().filter((r) => r.id === "fx_r_req1").length;
check("req.once", reqAgain === 1);
await flush(1000);

/* ---------- beforeEffect hook ---------- */
let seen = null;
FX.setBeforeEffect((ev) => { seen = ev; return new Promise((r) => setTimeout(r, 120)); });
dm.fx({ id: "hook1", shooter: "c_out", target: "p1", result: "crit", weapon: "LeGloss Revolver", gun: true, nat: 20, crit: true });
await flush(30);
check("hook.called", seen && seen.nat === 20 && seen.crit === true && seen.type === "gun", JSON.stringify(seen));
check("hook.waits", dm.fxActive() === 0);
await flush(150);
check("hook.thenDraws", dm.fxActive() > 0);
FX.setBeforeEffect(null);
const t0 = Date.now();
let resolvedAt = 0;
await FX.beforeEffect({ nat: 5 }).then(() => { resolvedAt = Date.now(); });
check("hook.defaultImmediate", resolvedAt - t0 < 20);
FX.setBeforeEffect(() => new Promise(() => {}), { timeoutMs: 50 });
let timedOut = false;
await Promise.race([FX.beforeEffect({}).then(() => { timedOut = true; }), flush(1000)]);
check("hook.timeoutNeverBlocks", timedOut);
FX.setBeforeEffect(null);
await flush(900);

/* ---------- fog on: a visible enemy out in the dark fires at the player ---------- */
await resendScene((v) => { v.fogRevealed = false; v.fogShapes = []; });
await flush(40);
dm.fx({ id: "dark1", shooter: "c_out", target: "p1", result: "miss", weapon: "Rifle", gun: true });
await flush(20);
const dark = lastLog(pl);
check("dark.fromVisionEdge", dark && dark.type === "gun" && dark.srcHidden === true, JSON.stringify(dark));
await flush(900);
/* fog on, a hidden sniper far off in the dark: the row starts where the line enters what players can see */
pub = dm.fx({ id: "dark2", shooter: "c_hid", target: "p1", result: "hit", weapon: "Rifle", gun: true });
await flush(20);
const d2 = feedRows().find((r) => r.id === "fx_dark2");
check("dark.hiddenShooter.edgeRow", !!d2 && !d2.fx.shooter && d2.fx.src && Math.hypot(d2.fx.src.x - 10.5, d2.fx.src.y - 8.5) <= 2.05
  && Math.hypot(d2.fx.src.x - 22.5, d2.fx.src.y - 8.5) >= 1 && !JSON.stringify(d2).includes("hid"), JSON.stringify(d2));
check("dark.hiddenShooter.playerNoMuzzle", lastLog(pl) && lastLog(pl).srcHidden === true);
await flush(900);
await resendScene((v) => { v.fogRevealed = true; v.fogShapes = []; });
await flush(40);

/* ---------- spell looks: caster paints locally, catalog look survives the public row, no initiative ---------- */
const spellBefore = pl.fxLog().length;
const spellRows = feedRows().length;
const spellPlays = plays.length;
pl.fx({ id: "sh_local", type: "spell", shooter: "p1", spell: "Shield", weapon: "Shield", self: true, result: "hit", heard: ["p1"] });
await flush(30);
check("spell.localShield", pl.fxLog().length === spellBefore + 1 && lastLog(pl).type === "spell" && lastLog(pl).local === true, JSON.stringify(pl.fxLog().slice(-1)));
check("spell.playerNoPublish", feedRows().length === spellRows);
await flush(400);
check("spell.noExtraCue", plays.length === spellPlays, JSON.stringify(plays.slice(spellPlays)));
const holdReq = {
  id: "r_hold", ts: new Date().toISOString(), from: "p1", fromName: "Cole", text: "roll", kind: "roll",
  fxReq: FX.request({ type: "spell", target: "tok_out", result: "hit", spell: true, weapon: "Hold Person (Lasso)", nat: 14 })
};
const holdLog = pl.fxLog().length;
store.pub["tableFeed/r_hold"] = { value: holdReq };
bus.forEach((fn) => fn("tableFeed/r_hold", holdReq, {}));
await flush(40);
const holdPub = feedRows().find((r) => r.id === "fx_r_hold");
check("spell.reqPublishes", !!holdPub && holdPub.fx.spell === "Hold Person (Lasso)" && FX.lookOf(holdPub.fx) === "lasso", JSON.stringify(holdPub && holdPub.fx));
check("spell.casterOnce", pl.fxLog().length === holdLog + 1 && lastLog(pl).type === "spell", JSON.stringify(pl.fxLog().slice(holdLog)));
FX.setEnabled(false);
const spellOffLog = pl.fxLog().length;
pl.fx({ id: "sh_off", type: "spell", shooter: "p1", target: "tok_out", spell: "Hold Person (Lasso)", result: "hit", heard: ["p1"] });
await flush(20);
check("spell.offNoDraw", pl.fxLog().length === spellOffLog);
FX.setEnabled(true);
await flush(200);

/* ---------- toggle ---------- */
dm.fx({ id: "tg1", shooter: "c_out", target: "p1", result: "hit", weapon: "LeGloss Revolver", gun: true });
await flush(10);
check("toggle.running", dm.fxActive() > 0);
dmEl.querySelector('[data-act="fxBtn"]').click();
await flush(30);
check("toggle.off", FX.enabled() === false && w.localStorage.getItem(FX.PREF_KEY) === "0" && /OFF/.test(dmEl.querySelector('[data-act="fxBtn"]').textContent));
check("toggle.stopsAnimation", dm.fxActive() === 0 && dm.fxAnimating() === false && pl.fxActive() === 0);
check("toggle.otherMapFollows", /OFF/.test(plEl.querySelector('[data-act="fxBtn"]').textContent));
const offLog = pl.fxLog().length;
before = feedRows().length;
dm.fx({ id: "tg2", shooter: "c_out", target: "p1", result: "hit", weapon: "LeGloss Revolver", gun: true });
await flush(20);
check("toggle.offNoDraw", pl.fxLog().length === offLog);
check("toggle.dmStillPublishes", feedRows().length === before + 1, "the DM's own toggle must not hide effects from players");
dmEl.querySelector('[data-act="fxBtn"]').click();
check("toggle.backOn", FX.enabled() === true && w.localStorage.getItem(FX.PREF_KEY) !== "0");

dm.destroy(); pl.destroy();
console.log(failures.length ? "\n" + failures.length + " FAILED" : "\nall attack-fx checks passed");
process.exit(failures.length ? 1 : 0);

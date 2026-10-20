/**
 * 0.3.89 / DMCC 0.2.102: Pistolero Fan the Hammer (Jessey's design pick, 2026-10-19).
 * Pistols only; lit after the Attack action AND a pistol attack this turn; bonus action through the normal gun path
 * with the ability modifier; same pistol (if it has a round) or a second held pistol; locks Tactical Reload for the turn;
 * shares the bonus action with the off-hand attack; chat "X fans the hammer"; sound = "fan-the-hammer" event if mapped,
 * else the gun's shot as a quick double-tap. Sheet, map Fight card, DM map drawer toggle, DMCC detail checkbox.
 * Needs the static server on 127.0.0.1:8765 and Chrome (ssdns-test-all starts the server).
 *   node tools/test-fan.mjs
 */
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ORIGIN = process.env.SSDNS_ORIGIN || "http://127.0.0.1:8765";
const failures = [];
const J = (x) => JSON.stringify(x);
function check(id, cond, detail) { if (!cond) failures.push(id); console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + detail : "")); }
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

/* static wiring */
{
  const html = read("index.html"), join = read("assets/js/dm-join.js"), v2 = read("dm/assets/js/v2.js"), host = read("map/ssdns-map-host.js"), map = read("map/ssdns-map.js"), app = read("assets/js/app.js");
  check("wire.script", /assets\/js\/fan\.js\?v=/.test(html) && html.indexOf("fan.js") > html.indexOf("offhand.js"));
  check("wire.dmJoin", /else if \(payload\.fan\) root\.SSDNSGunRoll\._fan = true/.test(join) && /SSDNSGunRoll\._fan = null/.test(join) && /pistolero: Array\.isArray\(c\.feats\)/.test(join));
  check("wire.dmccMap", (v2.match(/else if \(detail\.fan\) payload\.fan = true/g) || []).length === 2 && /row\.card\.pistolero = /.test(v2));
  check("wire.dmccDetail", /id="detailFan"/.test(v2) && /payload\.fan = true; fanBox\.checked = false|payload\.fan = true; \} fanBox\.checked = false|if \(!payload\.offhand\) payload\.fan = true; fanBox\.checked = false/.test(v2));
  check("wire.hostRun", /id\.indexOf\("fan:"\) === 0/.test(host) && /"fan:gun:" \+ i/.test(host));
  check("wire.drawerToggle", /data-act="fanToggle"/.test(map) && /state\.drawerFan \? \{ fan: true \}/.test(map));
  check("wire.trLock", /function fanTrLocked\(\)/.test(app) && /if \(fanTrLocked\(\)\) return;/.test(app) && /d\.tr !== undefined && fanTrLocked\(\)/.test(app));
  check("wire.noSfxFileAdded", !/fan-the-hammer/.test(read("assets/sfx/sfx.json")));
}

/* DM map drawer: the Fan toggle shows for a Pistolero PC the DM acts for, rides on one shot, and is exclusive with Off-hand */
{
  const { JSDOM } = await import("jsdom");
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/", pretendToBeVisual: true, runScripts: "dangerously" });
  const w = dom.window;
  const proto = w.HTMLElement.prototype;
  Object.defineProperty(proto, "clientWidth", { configurable: true, get() { return 800; } });
  Object.defineProperty(proto, "clientHeight", { configurable: true, get() { return 600; } });
  proto.getBoundingClientRect = function () { return { x: 0, y: 0, left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, toJSON() { return {}; } }; };
  w.HTMLCanvasElement.prototype.getContext = function () { const bag = {}; return new Proxy(bag, { get(t, p) { if (p in t) return t[p]; if (typeof p !== "string") return undefined; return function () { return bag; }; }, set(t, p, v) { t[p] = v; return true; } }); };
  w.HTMLImageElement.prototype.decode = function () { return Promise.resolve(); };
  w.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
  const add = (rel) => { const sc = w.document.createElement("script"); sc.textContent = read(rel); w.document.body.appendChild(sc); };
  add("assets/js/range-rings.js"); add("map/ssdns-map-firebase.js"); add("map/ssdns-map.js");
  const scene = JSON.parse(read("map/scene-dusty-spur.json"));
  const tokens = { tokens: {
    ply_p_d: { id: "ply_p_d", kind: "player", name: "Dust", combatantId: "p_d", ownerUid: "p_d", size: 1, pos: { x: 12, y: 8 } },
    tok_en: { id: "tok_en", kind: "enemy", name: "Bandit", combatantId: "en_b", size: 1, pos: { x: 16, y: 8 } }
  } };
  const pcCard = { kind: "pc", name: "Dust", dmActsAs: true, pistolero: true, ac: 14, hp: { cur: 20, max: 20 },
    attacks: [{ id: "gun-0", name: "ChaosMaker", toHit: 6, damage: "1d8+3", range: "20/60", group: "pistol", ammo: { cap: 6, loaded: 6 } }] };
  const events = [];
  const host = {
    on(name, detail) { events.push({ name, detail }); },
    getCard(id) { return (id === "ply_p_d" || id === "p_d") ? pcCard : { kind: "enemy", name: "Bandit", ac: 12, hp: { cur: 10, max: 10 }, attacks: [] }; },
    combatTargets() { return { selected: "en_b", options: [{ id: "en_b", name: "Bandit", label: "Bandit · AC 12" }] }; },
    actions: { get() { return []; }, run() { return Promise.resolve(); } },
    players() { return []; }
  };
  const el = w.document.createElement("div"); w.document.body.appendChild(el);
  w.SSDNSMap.create({ el, role: "dm", uid: "dm", adapter: w.SSDNSMapFirebase.memory({ role: "dm" }), host, options: { scene, tokens, assetBase: "", players: () => [], room: { table: { initiative: { order: [], turn: 0 } } } } });
  await new Promise((r) => setTimeout(r, 80));
  const canvas = el.querySelector("canvas");
  const at = { x: (12 + 0.5) * 70 - 650, y: (8 + 0.5) * 70 - 400 };
  const Ev = w.PointerEvent || w.MouseEvent;
  for (const type of ["pointerdown", "pointerup"]) { const ev = new Ev(type, { bubbles: true, cancelable: true, clientX: at.x, clientY: at.y, button: 0, buttons: 1 }); try { Object.defineProperty(ev, "pointerId", { value: 1 }); } catch (e) {} canvas.dispatchEvent(ev); }
  await new Promise((r) => setTimeout(r, 30));
  const drawer = () => el.querySelector('[data-act="drawer"]');
  const fanBox = () => drawer() && drawer().querySelector('[data-act="fanToggle"]');
  const ohBox = () => drawer() && drawer().querySelector('[data-act="offhandToggle"]');
  check("drawer.fanShown", !!fanBox(), drawer() && drawer().textContent.slice(0, 120));
  if (fanBox()) {
    ohBox().checked = true; ohBox().dispatchEvent(new w.Event("change", { bubbles: true })); await new Promise((r) => setTimeout(r, 20));
    fanBox().checked = true; fanBox().dispatchEvent(new w.Event("change", { bubbles: true })); await new Promise((r) => setTimeout(r, 20));
    check("drawer.exclusive", fanBox().checked && !ohBox().checked);
    drawer().querySelector('.ssm-atk[data-wid="gun-0"]').click(); await new Promise((r) => setTimeout(r, 30));
    const shots = events.filter((e) => e.name === "drawer:target");
    check("drawer.fanSent", shots.length === 1 && shots[0].detail.fan === true && !shots[0].detail.offhand && shots[0].detail.targetCombatantId === "en_b", J(shots.map((e) => e.detail)));
    check("drawer.fanClears", !!fanBox() && !fanBox().checked);
    drawer().querySelector('.ssm-atk[data-wid="gun-0"]').click(); await new Promise((r) => setTimeout(r, 30));
    const shots2 = events.filter((e) => e.name === "drawer:target");
    check("drawer.nextShotPlain", shots2.length === 2 && !shots2[1].detail.fan, J(shots2.map((e) => e.detail)));
    pcCard.pistolero = false;
  }
}

function portOpen(port, host) { return new Promise((r) => { const s = net.connect({ port, host }, () => { s.end(); r(true); }); s.on("error", () => r(false)); }); }
const u = new URL(ORIGIN);
if (!(await portOpen(Number(u.port), u.hostname))) { console.log("Static server is not listening on " + ORIGIN + " (run via ssdns-test-all)"); process.exit(1); }
const puppeteer = (await import("/tmp/pup/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js")).default;
const browser = await puppeteer.launch({ executablePath: "/opt/google/chrome/chrome", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
try {
  const pg = await browser.newPage();
  const errs = [];
  pg.on("pageerror", (e) => errs.push(String(e)));
  await pg.goto(ORIGIN + "/index.html", { waitUntil: "domcontentloaded" });
  await pg.waitForFunction(() => window.SSDNSApp && window.SSDNSGunRoll && window.SSDNSFan && window.SSDNSOffhand && document.querySelector("#atkTarget"), { timeout: 20000 });
  const res = await pg.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const A = window.SSDNSApp, F = window.SSDNSFan, O = window.SSDNSOffhand, P = window.SSDNSActionPips;
    const gunRow = (id, n) => ({ weapon: id, equipped: true, proficient: true, loaded: n, chambers: Array(n).fill("c"), misStreak: 0, jammed: false, dirty: false, fouled: false, ruined: false, broken: false, attackMode: "" });
    const CM = "pony-arms-chaosmaker-medium";
    const load = (fn) => A.applyPatch((d) => {
      const c = d.character;
      c.name = "Dust"; c.calling = "gunslinger"; c.level = 5; c.feats = ["pistolero"];
      c.abilities = Object.assign(c.abilities || {}, { STR: 10, DEX: 16 });
      c.ammo = [{ type: "cartridge", caliber: "", count: 50 }];
      c.guns = [gunRow(CM, 6), gunRow(CM, 6), gunRow("henrietta-saddle-carbine", 6), gunRow("hognose", 2)];
      c.melee = [{ weapon: "" }, { weapon: "" }, { weapon: "" }, { weapon: "" }];
      c.holster = "skeleton-rig"; c.holsterR = "bridgeport-rig-swivel"; c.holsterActive = true; c.gunBelt = true;
      c.activeConditions = []; c.fightingStyle = ""; c.offhandStowed = false; c.shield = false;
      if (fn) fn(c);
    });
    const logs = () => [...document.querySelectorAll(".log-item")].map((n) => n.textContent);
    const lastRoll = () => logs().find((t) => /→|shoots freely/.test(t)) || "";
    const toasts = []; const realToast = window.SSDNSToast; window.SSDNSToast = function (m) { toasts.push(String(m)); return realToast && realToast.apply(this, arguments); };
    const tt = document.querySelector("#toastText");
    if (tt) new MutationObserver(() => toasts.push(tt.textContent)).observe(tt, { childList: true, characterData: true, subtree: true });
    const sounds = [];
    if (window.SSDNSAudio) window.SSDNSAudio.play = (n) => { sounds.push(n); return 0; };
    const btn = (i) => document.querySelector('[data-fan="' + i + '"]');
    const state = (i) => { const b = btn(i); return b ? { shown: !b.hidden, lit: !b.disabled && b.classList.contains("lit"), title: b.title } : null; };
    const loaded = (i) => Number(A.doc().character.guns[i].loaded);
    const out = {};
    await wait(1000);
    const sel = document.querySelector("#atkTarget");
    sel.value = ""; sel.dispatchEvent(new Event("change", { bubbles: true }));
    const realRandom = Math.random; Math.random = () => 0.6; /* d20 13, mid dice: no misfire */
    /* no Pistolero: no Fan button */
    load((c) => { c.feats = []; }); await wait(300); F.paint();
    out.noFeat = [0, 1, 2, 3].map(state);
    /* Pistolero: pistols only (not the carbine, not the Hognose Caster Gun) */
    load(); await wait(300); P.reset(true); F.paint();
    out.feat = [0, 1, 2, 3].map(state);
    /* compact gun card (0.3.80): Fan sits right after TR in the card's action row, visible and inside the card */
    const onTab = document.querySelector('.tab[aria-selected="true"]');
    document.querySelector("#tab-equip").click(); await wait(200); F.paint();
    out.place = [0, 1].map((i) => { const b = btn(i), tr = document.querySelector('[data-tr="' + i + '"]'); const card = b && b.closest(".gun"); const r = b && b.getBoundingClientRect(), cr = card && card.getBoundingClientRect();
      return { afterTr: !!b && b.previousElementSibling === tr, row: !!(b && b.closest(".g-actions")), inCard: !!(r && cr && r.width > 0 && r.left >= cr.left - 1 && r.right <= cr.right + 1) }; });
    if (onTab) { onTab.click(); await wait(200); }
    /* before any attack: dim, and a direct fire is blocked */
    const l0 = loaded(0);
    F.fire(0); await wait(500);
    out.early = { loaded: loaded(0), before: l0, toast: toasts.slice(-1)[0] || "", bonus: P.state().bonus };
    /* attack with a pistol (Action), then Fan lights on both pistols */
    window.SSDNSGunRoll(0); await wait(700);
    F.paint();
    out.main = { log: lastRoll(), lit: [state(0), state(1)], pips: P.state() };
    sounds.length = 0;
    const l1 = loaded(0);
    btn(0).click(); await wait(800);
    out.fan = { log: lastRoll(), pips: P.state(), loaded: loaded(0), before: l1, sounds: sounds.slice() };
    await wait(200); F.paint();
    out.after = { s0: state(0), s1: state(1) };
    /* Tactical Reload is locked for the rest of the turn */
    const trBtn = document.querySelector('[data-tr="0"]');
    const lt = loaded(0);
    if (trBtn) trBtn.click();
    await wait(400);
    out.tr = { exists: !!trBtn, loaded: loaded(0), before: lt, toast: toasts.filter((t) => /no Tactical Reload this turn/.test(t)).join(" | "), cls: !!trBtn && trBtn.classList.contains("tr-locked"), log: logs().some((t) => /no Tactical Reload this turn/.test(t)) };
    if (A.tacticalReload) { A.tacticalReload(0); await wait(200); }
    out.tr.api = loaded(0) === lt;
    /* off-hand is blocked after Fan (shared bonus action) */
    load((c) => { c.feats = ["pistolero", "dual-wielder"]; }); await wait(300);
    const lo = loaded(1);
    O.fire("gun", 1); await wait(500);
    out.ohAfterFan = { loaded: loaded(1), before: lo, toast: toasts.slice(-1)[0] || "" };
    /* new turn: off-hand first, then Fan is blocked */
    P.reset(true); await wait(50);
    window.SSDNSGunRoll(0); await wait(600);
    O.fire("gun", 1); await wait(600);
    F.paint();
    out.fanAfterOh = { s0: state(0), status: F.status(0) };
    /* new turn: the first pistol is empty after the attack, the second held pistol can fan */
    load((c) => { c.guns[0] = gunRow(CM, 1); }); await wait(300); P.reset(true);
    window.SSDNSGunRoll(0); await wait(600); F.paint();
    out.second = { s0: state(0), s1: state(1) };
    const l2 = loaded(1);
    btn(1).click(); await wait(700);
    out.second.loaded = loaded(1); out.second.before = l2; out.second.log = lastRoll();
    /* Free shot: Fan after a free pistol shot on the Attack action */
    load(); await wait(300); P.reset(true);
    sel.value = "__free"; sel.dispatchEvent(new Event("change", { bubbles: true }));
    window.SSDNSGunRoll(0); await wait(500); F.paint();
    F.fire(1); await wait(600);
    out.free = { log: lastRoll(), pips: P.state() };
    sel.value = ""; sel.dispatchEvent(new Event("change", { bubbles: true }));
    /* DM acting for the player overrides the turn checks (logged) */
    P.reset(true);
    window.SSDNSGunRoll._dm = { mode: "" }; window.SSDNSGunRoll._fan = true;
    window.SSDNSGunRoll(0); window.SSDNSGunRoll._dm = null; window.SSDNSGunRoll._fan = null;
    await wait(700);
    out.dm = { log: lastRoll(), override: logs().some((t) => /DM override: .*fan the hammer/i.test(t)), pips: P.state(), leak: window.SSDNSGunRoll._fan };
    /* map Fight card: a Fan entry per pistol, dim before the attack, lit after, and it runs */
    P.reset(true); await wait(50);
    const cardBefore = window.SSDNSMapHost.ownCard();
    out.mapBefore = cardBefore.attacks.filter((a) => /^fan:/.test(a.id)).map((a) => a.id + "|" + a.enabled + "|" + a.name);
    window.SSDNSGunRoll(0); await wait(600);
    const cardAfter = window.SSDNSMapHost.ownCard();
    out.mapAfter = cardAfter.attacks.filter((a) => /^fan:/.test(a.id)).map((a) => a.id + "|" + a.enabled);
    const lm = loaded(0);
    window.SSDNSMapHost.runAction("fan:gun:0", {}); await wait(700);
    out.mapRun = { log: lastRoll(), loaded: loaded(0), before: lm, pips: P.state() };
    /* sound override hook: a mapped "fan-the-hammer" file plays once instead of the double-tap */
    const realPool = window.SSDNSAudio.poolFiles;
    window.SSDNSAudio.poolFiles = (n) => (n === "fan-the-hammer" ? ["fan.mp3"] : realPool(n));
    P.reset(true); window.SSDNSGunRoll(0); await wait(600);
    sounds.length = 0;
    F.fire(0); await wait(600);
    out.override = sounds.slice();
    window.SSDNSAudio.poolFiles = realPool;
    const wt = Date.now(); while (!(toasts.some((t) => /no Tactical Reload this turn/.test(t)) && toasts.some((t) => /Fan the Hammer already used your bonus action/.test(t))) && Date.now() - wt < 20000) await wait(250);
    out.allToasts = toasts.slice();
    Math.random = realRandom;
    window.SSDNSToast = realToast;
    return out;
  });
  check("button.needsPistolero", res.noFeat.every((s) => !s || !s.shown), J(res.noFeat));
  check("button.pistolsOnly", res.feat[0].shown && res.feat[1].shown && (!res.feat[2] || !res.feat[2].shown) && (!res.feat[3] || !res.feat[3].shown), J(res.feat));
  check("button.afterTrInCompactCard", res.place.every((p) => p.afterTr && p.row && p.inCard), J(res.place));
  check("button.dimBeforeAttack", !res.feat[0].lit && /Attack action/.test(res.feat[0].title), J(res.feat[0]));
  check("fire.blockedBeforeAttack", res.early.loaded === res.early.before && /Attack action/.test(res.early.toast) && !res.early.bonus, J(res.early));
  check("button.litAfterPistolAttack", res.main.lit[0].lit && res.main.lit[1].lit && res.main.pips.action && !res.main.pips.bonus, J(res.main));
  check("fan.chatLine", /Dust fans the hammer · Pony Arms ChaosMaker/.test(res.fan.log), res.fan.log);
  check("fan.addsMod", /\+ 3 \(DEX\)/.test(res.fan.log), res.fan.log);
  check("fan.bonusPip", res.fan.pips.bonus === true, J(res.fan.pips));
  check("fan.samePistolAmmo", res.fan.loaded === res.fan.before - 1, J(res.fan));
  check("fan.doubleTap", res.fan.sounds.filter((n) => n === res.fan.sounds[0]).length >= 2 && !res.fan.sounds.includes("fan-the-hammer"), J(res.fan.sounds));
  check("fan.oncePerTurn", !res.after.s0.lit && !res.after.s1.lit, J(res.after));
  check("tr.lockedAfterFan", res.tr.exists && res.tr.loaded === res.tr.before && res.allToasts.some((t) => /no Tactical Reload this turn/.test(t)) && res.tr.cls && res.tr.log && res.tr.api, J(res.tr));
  check("share.offhandBlockedAfterFan", res.ohAfterFan.loaded === res.ohAfterFan.before && res.allToasts.some((t) => /Fan the Hammer already used your bonus action/.test(t)), J(res.ohAfterFan));
  check("share.fanBlockedAfterOffhand", !res.fanAfterOh.s0.lit && /off-hand/.test(res.fanAfterOh.status.reason), J(res.fanAfterOh));
  check("choice.secondPistol", !res.second.s0.lit && /No round left/.test(res.second.s0.title) && res.second.s1.lit && res.second.loaded === res.second.before - 1 && /fans the hammer/.test(res.second.log), J(res.second));
  check("free.fan", /fans the hammer and shoots freely/.test(res.free.log) && res.free.pips.bonus && res.free.pips.action, J(res.free));
  check("dm.override", /fans the hammer/.test(res.dm.log) && res.dm.override && res.dm.pips.bonus && !res.dm.leak, J(res.dm));
  check("map.cardEntries", res.mapBefore.length === 2 && res.mapBefore.every((x) => /\|false\|.* · Fan$/.test(x)), J(res.mapBefore));
  check("map.litAfterAttack", res.mapAfter.length === 2 && res.mapAfter.every((x) => /\|true$/.test(x)), J(res.mapAfter));
  check("map.run", /fans the hammer/.test(res.mapRun.log) && res.mapRun.loaded === res.mapRun.before - 1 && res.mapRun.pips.bonus, J(res.mapRun));
  check("sound.overrideHook", res.override.filter((n) => n === "fan-the-hammer").length === 1, J(res.override));
  check("sheet.noPageErrors", errs.length === 0, errs.join(" | "));

  /* DMCC demo loads clean with the Fan detail checkbox */
  const dm = await browser.newPage();
  const dmErrs = [];
  dm.on("pageerror", (e) => dmErrs.push(String(e)));
  await dm.goto(ORIGIN + "/dm/index.html?demo=1", { waitUntil: "domcontentloaded" });
  await dm.waitForFunction(() => window.DMCC && document.querySelector("#btnLoadDemo"), { timeout: 20000 });
  await dm.evaluate(() => document.querySelector("#btnLoadDemo").click());
  await dm.waitForFunction(() => window.DMCC.state.demo && window.SSDNSMapFight, { timeout: 20000 });
  await new Promise((r) => setTimeout(r, 800));
  check("dmcc.noPageErrors", dmErrs.length === 0, dmErrs.join(" | "));
} finally {
  await browser.close();
}
if (failures.length) { console.log("\n" + failures.length + " failed: " + failures.join(", ")); process.exit(1); }
console.log("\nall Fan the Hammer checks passed");

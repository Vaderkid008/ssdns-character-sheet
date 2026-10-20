/**
 * 0.3.82 / DMCC 0.2.95: Off-hand attack (two-weapon fighting).
 * Rules: PHB two-weapon fighting (two LIGHT one-handed melee weapons); Dual Wielder (campaign house rule) lets
 * any pistol, one-handed Caster Gun or one-handed blade pair work; pistols are one-handed but not light.
 * Bonus action after the Attack action, normal attack path, no positive ability mod to damage, chat tagged off-hand.
 * Needs the static server on 127.0.0.1:8765 and Chrome (ssdns-test-all starts the server).
 *   node tools/test-offhand.mjs
 */
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ORIGIN = process.env.SSDNS_ORIGIN || "http://127.0.0.1:8765";
const failures = [];
const J = (x) => JSON.stringify(x);
function check(id, cond, detail) { if (!cond) failures.push(id); console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + detail : "")); }
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

/* ---- part 0: pure helpers ---- */
{
  const ctx = { window: {} }; ctx.window.window = ctx.window; vm.createContext(ctx);
  vm.runInContext(read("assets/js/offhand.js"), ctx);
  const O = ctx.window.SSDNSOffhand;
  check("strip.gun", O.stripMod("1d8 +3 piercing", 3) === "1d8 piercing", O.stripMod("1d8 +3 piercing", 3));
  check("strip.keepsStyle", O.stripMod("1d8 +5 piercing", 3) === "1d8 +2 piercing", O.stripMod("1d8 +5 piercing", 3));
  check("strip.melee", O.stripMod("1d6 +3", 3) === "1d6", O.stripMod("1d6 +3", 3));
  check("strip.negativeStays", O.stripMod("1d4 -1", -1) === "1d4 -1", O.stripMod("1d4 -1", -1));
  check("strip.negativeGunStays", O.stripMod("1d8 -1 piercing", -1) === "1d8 -1 piercing", O.stripMod("1d8 -1 piercing", -1));
  check("strip.partsNegativeStays", J(O.stripParts([{ label: "DEX", value: -1 }])) === J([{ label: "DEX", value: -1 }]));
  check("light.pistols", J(O.LIGHT_PISTOLS) === J(["herringer-light-pocket-pistol", "herringer-light-double-derringer", "herringer-light-pepperbox"]) &&
    O.lightPistol({ id: "herringer-light-pepperbox" }) && !O.lightPistol({ id: "pony-arms-chaosmaker-medium" }));
  check("strip.parts", J(O.stripParts([{ label: "DEX", value: 3 }, { label: "Sidearm", value: 2 }])) === J([{ label: "Sidearm", value: 2 }]));
  check("light.parse", O.lightMelee({ properties: "Finesse, light" }) && !O.lightMelee({ properties: "Versatile (1d10)" }) && !O.lightMelee({ properties: "Light, two-handed" }));
}
/* static wiring: map host, DM drawer, DMCC detail, dm-join */
{
  const host = read("map/ssdns-map-host.js"), map = read("map/ssdns-map.js"), v2 = read("dm/assets/js/v2.js"), join = read("assets/js/dm-join.js"), html = read("index.html");
  check("twoGun.creator", /\["two-gun", "Two-Gun/.test(read("assets/js/creator.js")));
  check("wire.script", /assets\/js\/offhand\.js\?v=/.test(html) && html.indexOf("offhand.js") < html.indexOf("sheet-playtest.js"));
  check("wire.hostRun", /id\.indexOf\("offhand:"\) === 0/.test(host) && /"offhand:" \+ o\.kind/.test(host));
  check("wire.drawerToggle", /data-act="offhandToggle"/.test(map) && /shotDetail\(/.test(map) && /shot\.offhand/.test(map));
  check("wire.dmccMap", (v2.match(/if \(detail\.offhand\) payload\.offhand = true/g) || []).length === 2);
  check("wire.dmccDetail", /id="detailOffhand"/.test(v2) && /payload\.offhand = true; ohBox\.checked = false/.test(v2));
  check("wire.dmJoin", /if \(payload\.offhand\) root\.SSDNSGunRoll\._offhand = true/.test(join) && /SSDNSGunRoll\._offhand = null/.test(join));
}

/* DM map drawer (acting for a PC): the Off-hand toggle rides on the next weapon shot, then clears */
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
  const pcCard = { kind: "pc", name: "Dust", dmActsAs: true, ac: 14, hp: { cur: 20, max: 20 },
    attacks: [{ id: "gun-0", name: "ChaosMaker", toHit: 6, damage: "1d8+3", range: "20/60", group: "pistol", ammo: { cap: 6, loaded: 6 } },
      { id: "gun-1", name: "ChaosMaker", toHit: 6, damage: "1d8+3", range: "20/60", group: "pistol", ammo: { cap: 6, loaded: 6 } }] };
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
  const box = () => drawer() && drawer().querySelector('[data-act="offhandToggle"]');
  check("drawer.toggleShown", !!box(), (drawer() && drawer().textContent.slice(0, 60)));
  if (box()) {
    box().checked = true; box().dispatchEvent(new w.Event("change", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 20));
    check("drawer.toggleKept", !!box() && box().checked);
    drawer().querySelector('.ssm-atk[data-wid="gun-1"]').click();
    await new Promise((r) => setTimeout(r, 30));
    const shots = events.filter((e) => e.name === "drawer:target");
    check("drawer.offhandSent", shots.length === 1 && shots[0].detail.offhand === true && shots[0].detail.weaponId === "gun-1" && shots[0].detail.targetCombatantId === "en_b", J(shots.map((e) => e.detail)));
    check("drawer.clearsAfter", !!box() && !box().checked);
    drawer().querySelector('.ssm-atk[data-wid="gun-0"]').click();
    await new Promise((r) => setTimeout(r, 30));
    const shots2 = events.filter((e) => e.name === "drawer:target");
    check("drawer.nextShotPlain", shots2.length === 2 && !shots2[1].detail.offhand, J(shots2.map((e) => e.detail)));
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
  await pg.waitForFunction(() => window.SSDNSApp && window.SSDNSGunRoll && window.SSDNSOffhand && window.SSDNSApp.applyPatch && document.querySelector("#atkTarget"), { timeout: 20000 });
  const res = await pg.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const A = window.SSDNSApp, O = window.SSDNSOffhand, P = window.SSDNSActionPips;
    const gunRow = (id, n) => ({ weapon: id, equipped: true, proficient: true, loaded: n, chambers: Array(n).fill("c"), misStreak: 0, jammed: false, dirty: false, fouled: false, ruined: false, broken: false, attackMode: "" });
    const load = (fn) => A.applyPatch((d) => {
      const c = d.character;
      c.name = "Dust"; c.calling = "gunslinger"; c.level = 5; c.feats = [];
      c.abilities = Object.assign(c.abilities || {}, { STR: 10, DEX: 16 });
      c.ammo = [{ type: "cartridge", caliber: "", count: 50 }];
      c.guns = [gunRow("pony-arms-chaosmaker-medium", 6), gunRow("pony-arms-chaosmaker-medium", 6), { weapon: "" }, { weapon: "" }];
      c.melee = [{ weapon: "" }, { weapon: "" }, { weapon: "" }, { weapon: "" }];
      c.holster = "skeleton-rig"; c.holsterR = "bridgeport-rig-swivel"; c.holsterActive = true;
      c.activeConditions = []; c.fightingStyle = "";
      if (fn) fn(c);
    });
    const logs = () => [...document.querySelectorAll(".log-item")].map((n) => n.textContent);
    const lastRoll = () => logs().find((t) => /→|shoots freely|Dust:/.test(t)) || "";
    const sounds = [];
    if (window.SSDNSAudio) window.SSDNSAudio.play = (n) => { sounds.push(n); };
    const out = {};
    await wait(1000);
    const sel = document.querySelector("#atkTarget");
    sel.value = ""; sel.dispatchEvent(new Event("change", { bubbles: true }));
    /* no Dual Wielder: twin pistols don't qualify */
    load(); await wait(400); O.paint();
    const o0 = O.options();
    out.noDW = { ok: o0.ok, reason: o0.reason, card: !!document.querySelector("#offhandCard") };
    /* Dual Wielder: the card shows, R pistol is the default pick, each side keeps its own first-shot bonus */
    load((c) => { c.feats = ["dual-wielder"]; }); await wait(400); O.paint();
    const o1 = O.options();
    const v = A.compute();
    out.dw = { ok: o1.ok, n: o1.list.length, sides: o1.list.map((x) => x.side), card: !!document.querySelector("#offhandCard"), pick: (document.querySelector("#offhandPick") || {}).value,
      firstL: v.guns[0].firstShot, firstR: v.guns[1].firstShot, sideL: v.guns[0].drawSide, sideR: v.guns[1].drawSide, dmg0: v.guns[0].dmg };
    /* main attack (Action), then the off-hand (Bonus) from the card */
    P.reset(true);
    const realRandom = Math.random; Math.random = () => 0.6; /* d20 = 13, dice mid */
    window.SSDNSGunRoll(0); await wait(700);
    out.main = { log: lastRoll(), pips: P.state() };
    sounds.length = 0;
    const loadedR = Number(A.doc().character.guns[1].loaded);
    document.querySelector("#btnOffhand").click(); await wait(700);
    out.off = { log: lastRoll(), pips: P.state(), loaded: Number(A.doc().character.guns[1].loaded), loadedR, sounds: sounds.slice(), alerts: logs().filter((t) => /Attack action first/.test(t)).length };
    /* 0.3.80 (Jessey): off-hand before the Attack action is BLOCKED with a message */
    P.reset(true);
    const toasts = []; const realToast = window.SSDNSToast; window.SSDNSToast = function (m) { toasts.push(String(m)); return realToast && realToast.apply(this, arguments); };
    const earlyBefore = { loaded: Number(A.doc().character.guns[1].loaded), rolls: logs().filter((t) => /→/.test(t)).length };
    O.fire("gun", 1); await wait(700);
    out.early = { alerts: logs().filter((t) => /Attack action first/.test(t)).length, pips: P.state(), loaded: Number(A.doc().character.guns[1].loaded), rolls: logs().filter((t) => /→/.test(t)).length, before: earlyBefore, toast: toasts.slice(-1)[0] || "" };
    /* the card button is blocked the same way */
    document.querySelector("#btnOffhand") && document.querySelector("#btnOffhand").click(); await wait(500);
    out.early.cardBlocked = !P.state().bonus && Number(A.doc().character.guns[1].loaded) === earlyBefore.loaded;
    /* off-hand Free shot (after a Free shot on the Attack action) */
    P.reset(true);
    sel.value = "__free"; sel.dispatchEvent(new Event("change", { bubbles: true }));
    window.SSDNSGunRoll(0); await wait(600);
    O.fire("gun", 1); await wait(700);
    out.free = { log: lastRoll(), pips: P.state() };
    sel.value = ""; sel.dispatchEvent(new Event("change", { bubbles: true }));
    /* DM acting for the player: dm-join sets _dm + _offhand */
    P.reset(true);
    window.SSDNSGunRoll._dm = { mode: "" }; window.SSDNSGunRoll._offhand = true;
    window.SSDNSGunRoll(1); window.SSDNSGunRoll._dm = null; window.SSDNSGunRoll._offhand = null;
    await wait(700);
    out.dm = { log: lastRoll(), pips: P.state(), dialogs: document.querySelectorAll("dialog[open]").length, leak: window.SSDNSGunRoll._offhand, override: logs().some((t) => /DM override: .*off-hand attack before the Attack action/.test(t)) };
    /* map Fight card: off-hand buttons ride on the player's own card and run through the same path */
    const card = window.SSDNSMapHost && window.SSDNSMapHost.ownCard ? window.SSDNSMapHost.ownCard() : null;
    out.cardIds = card ? card.attacks.map((a) => a.id + "|" + a.name + "|" + a.damage + "|" + (a.ammo ? "ammo" : "")) : [];
    P.reset(true);
    window.SSDNSGunRoll(0); await wait(500);
    window.SSDNSMapHost.runAction("offhand:gun:1", {}); await wait(700);
    out.mapRun = { log: lastRoll(), pips: P.state() };
    /* melee: two light blades without Dual Wielder qualify; a non-light one doesn't */
    load((c) => { c.guns = [{ weapon: "" }, { weapon: "" }, { weapon: "" }, { weapon: "" }]; c.abilities.STR = 16; c.abilities.DEX = 10;
      c.melee = [{ weapon: "hatchet-handaxe", equipped: true, proficient: true }, { weapon: "claim-hammer-light-hammer", equipped: true, proficient: true }, { weapon: "" }, { weapon: "" }]; });
    await wait(500); O.paint();
    out.melee = { ok: O.options().ok, card: !!document.querySelector("#offhandCard") };
    P.reset(true);
    window.SSDNSPlaytest.rollMelee(0); await wait(700);
    const mainMelee = lastRoll();
    O.fire("melee", 1); await wait(900);
    out.meleeOff = { main: mainMelee, log: lastRoll(), pips: P.state() };
    load((c) => { c.guns = [{ weapon: "" }, { weapon: "" }, { weapon: "" }, { weapon: "" }];
      c.melee = [{ weapon: "cavalry-saber-longsword", equipped: true, proficient: true }, { weapon: "bowie-shortsword", equipped: true, proficient: true }, { weapon: "" }, { weapon: "" }]; });
    await wait(400);
    out.saber = { ok: O.options().ok, reason: O.options().reason };
    load((c) => { c.feats = ["dual-wielder"]; c.guns = [gunRow("pony-arms-chaosmaker-medium", 6), { weapon: "" }, { weapon: "" }, { weapon: "" }];
      c.melee = [{ weapon: "cavalry-saber-longsword", equipped: true, proficient: true }, { weapon: "" }, { weapon: "" }, { weapon: "" }]; });
    await wait(400);
    out.mix = { ok: O.options().ok, kinds: O.options().list.map((x) => x.kind) };
    /* a shield fills the other hand; a Versatile blade gripped two-handed isn't a one-hand weapon */
    load((c) => { c.feats = ["dual-wielder"]; c.shield = true; }); await wait(300);
    out.shield = { ok: O.options().ok, reason: O.options().reason };
    load((c) => { c.feats = ["dual-wielder"]; c.shield = false; c.guns = [gunRow("pony-arms-chaosmaker-medium", 6), { weapon: "" }, { weapon: "" }, { weapon: "" }];
      c.melee = [{ weapon: "cavalry-saber-longsword", equipped: true, proficient: true, twoHand: true }, { weapon: "" }, { weapon: "" }, { weapon: "" }]; });
    await wait(300);
    out.grip = { ok: O.options().ok };
    /* 0.3.80 (Jessey #1): the three Herringer Light pistols are light: they pair without Dual Wielder */
    const H = (id) => gunRow(id, 2);
    load((c) => { c.guns = [H("herringer-light-pocket-pistol"), H("herringer-light-double-derringer"), { weapon: "" }, { weapon: "" }]; }); await wait(300);
    out.lightPair = { ok: O.options().ok, n: O.options().list.length };
    load((c) => { c.guns = [H("herringer-light-pepperbox"), { weapon: "" }, { weapon: "" }, { weapon: "" }];
      c.melee = [{ weapon: "hatchet-handaxe", equipped: true, proficient: true }, { weapon: "" }, { weapon: "" }, { weapon: "" }]; }); await wait(300);
    out.lightMix = { ok: O.options().ok, kinds: O.options().list.map((x) => x.kind) };
    load((c) => { c.guns = [H("herringer-light-pocket-pistol"), gunRow("pony-arms-chaosmaker-medium", 6), { weapon: "" }, { weapon: "" }]; }); await wait(300);
    out.lightHeavy = { ok: O.options().ok, reason: O.options().reason };
    load((c) => { c.feats = ["dual-wielder"]; c.guns = [H("herringer-light-pocket-pistol"), gunRow("pony-arms-chaosmaker-medium", 6), { weapon: "" }, { weapon: "" }]; }); await wait(300);
    out.lightHeavyDW = { ok: O.options().ok };
    /* 0.3.80 (Jessey #5): Sidearm Duelling +2 is off while holding two weapons */
    const dmgFlat = (t) => { const m = String(t || "").match(/[+-]\s*(\d+)/); return m ? Number(m[0].replace(/\s/g, "")) : 0; };
    load((c) => { c.fightingStyle = "sidearm"; c.guns = [gunRow("pony-arms-chaosmaker-medium", 6), { weapon: "" }, { weapon: "" }, { weapon: "" }]; c.feats = ["dual-wielder"]; }); await wait(300);
    out.sidearm = { single: dmgFlat(A.compute().guns[0].dmg) };
    load((c) => { c.fightingStyle = "sidearm"; c.feats = ["dual-wielder"]; }); await wait(300);
    out.sidearm.two = dmgFlat(A.compute().guns[0].dmg); out.sidearm.twoWield = O.wieldingTwo();
    load((c) => { c.fightingStyle = "sidearm"; c.feats = []; }); await wait(300); /* twin irons without DW: not an off-hand pair */
    out.sidearm.noDW = dmgFlat(A.compute().guns[0].dmg);
    /* 0.3.80 (Jessey #6): Dual Wielder +1 AC while holding two, Draw both / Stow both */
    load((c) => { c.feats = []; c.guns = [gunRow("pony-arms-chaosmaker-medium", 6), { weapon: "" }, { weapon: "" }, { weapon: "" }]; }); await wait(300);
    const acBase = A.compute().ac;
    load((c) => { c.feats = ["dual-wielder"]; c.guns = [gunRow("pony-arms-chaosmaker-medium", 6), { weapon: "" }, { weapon: "" }, { weapon: "" }]; }); await wait(300);
    const acDwOne = A.compute().ac;
    load((c) => { c.feats = ["dual-wielder"]; c.offhandStowed = false; }); await wait(300); O.paint(true);
    out.ac = { base: acBase, dwOne: acDwOne, dwTwo: A.compute().ac, flag: A.compute().dualWielderAc, stowBtn: !!document.querySelector("#btnStowBoth") };
    document.querySelector("#btnStowBoth").click(); await wait(400);
    out.ac.stowed = A.compute().ac; out.ac.stowedFlag = A.doc().character.offhandStowed === true;
    out.ac.stowLog = logs().some((t) => /stows .* at once \(Dual Wielder\)/.test(t));
    out.ac.offDisabled = !!(document.querySelector("#btnOffhand") || {}).disabled; out.ac.drawBtn = !!document.querySelector("#btnDrawBoth");
    P.reset(true); window.SSDNSGunRoll(0); await wait(500);
    const stowLoaded = Number(A.doc().character.guns[1].loaded);
    O.fire("gun", 1); await wait(500);
    out.ac.stowedBlocks = Number(A.doc().character.guns[1].loaded) === stowLoaded && /stowed/.test(toasts.slice(-1)[0] || "");
    document.querySelector("#btnDrawBoth").click(); await wait(400);
    out.ac.drawn = A.compute().ac; out.ac.drawLog = logs().some((t) => /draws .* at once \(Dual Wielder\)/.test(t));
    load((c) => { c.feats = []; c.offhandStowed = false; c.guns = [H("herringer-light-pocket-pistol"), H("herringer-light-double-derringer"), { weapon: "" }, { weapon: "" }]; }); await wait(300);
    out.ac.lightNoDW = A.compute().ac; out.ac.lightNoDWBase = acBase;
    /* negative ability mod stays on off-hand damage */
    load((c) => { c.feats = ["dual-wielder"]; c.abilities.DEX = 8; c.abilities.STR = 8; }); await wait(300);
    P.reset(true); window.SSDNSGunRoll(0); await wait(600);
    O.fire("gun", 1); await wait(700);
    out.neg = { log: lastRoll() };
    /* 0.3.80 (Jessey L0183): Two-Gun fighting style */
    const PT2 = window.SSDNSPlaytest;
    const ids = (c) => PT2.styleOptions(c).map((o) => o[0]);
    out.tg = {
      gs: ids({ calling: "gunslinger", level: 1 }), scout: ids({ calling: "frontier-scout", level: 2 }), law: ids({ calling: "lawman", level: 2 })
    };
    load((c) => { c.feats = ["dual-wielder"]; c.fightingStyle = "two-gun"; c.abilities.DEX = 16; }); await wait(300);
    P.reset(true); window.SSDNSGunRoll(0); await wait(600);
    O.fire("gun", 1); await wait(700);
    out.tg.log = lastRoll();
    const tgCard = window.SSDNSMapHost.ownCard();
    out.tg.card = (tgCard.attacks.filter((a) => a.id === "offhand:gun:1")[0] || {}).damage;
    out.tg.note = ((document.querySelector("#offhandCard") || {}).textContent || "");
    load((c) => { c.feats = ["dual-wielder"]; c.fightingStyle = "two-gun"; c.abilities.DEX = 8; }); await wait(300);
    P.reset(true); window.SSDNSGunRoll(0); await wait(600);
    O.fire("gun", 1); await wait(700);
    out.tg.negLog = lastRoll();
    /* Additional Gun Style at 10th: second pick */
    load((c) => { c.level = 10; c.fightingStyle = "sidearm"; c.fightingStyle2 = "two-gun"; }); await wait(300);
    PT2.renderStyle(); await wait(100);
    const s2 = document.querySelector("#selFightingStyle2");
    out.tg.l10 = { has: O.hasTwoGun(), sel2: !!s2 && !s2.closest("[hidden]"), opts2: s2 ? [...s2.options].map((o) => o.value) : [], val: s2 && s2.value };
    load((c) => { c.level = 9; c.fightingStyle = "sidearm"; c.fightingStyle2 = "two-gun"; }); await wait(300);
    out.tg.l9 = O.hasTwoGun();
    load((c) => { c.calling = "lawman"; c.level = 5; c.fightingStyle = "two-gun"; }); await wait(300);
    out.tg.lawman = O.hasTwoGun();
    window.SSDNSToast = realToast;
    /* 0.3.80 (Jessey): Great Weapon Fighting rerolls also apply to a Versatile weapon held with "Two hands" */
    const PT = window.SSDNSPlaytest, CH = () => A.doc().character;
    const gwfLoad = (fn) => load((c) => { c.calling = "lawman"; c.level = 2; c.fightingStyle = "great-weapon"; c.shield = false;
      c.guns = [{ weapon: "" }, { weapon: "" }, { weapon: "" }, { weapon: "" }];
      c.melee = [{ weapon: "cavalry-saber-longsword", equipped: true, proficient: true, twoHand: true }, { weapon: "buffalo-axe-greataxe", equipped: true, proficient: true }, { weapon: "" }, { weapon: "" }];
      if (fn) fn(c); });
    gwfLoad(); await wait(300);
    out.gwf = { versTwo: PT.meleeGwf(CH(), 0), heavy: PT.meleeGwf(CH(), 1) };
    /* d20 17 hits, the first damage die shows 1; GWF rerolls it into a 10 (without GWF it stays 1) */
    const seq = () => { const q = [0.8, 0.01, 0.95]; return () => (q.length ? q.shift() : 0.01); };
    Math.random = seq();
    PT.rollMelee(0); await wait(500);
    Math.random = realRandom;
    out.gwf.log = (document.querySelector(".log-item") || {}).textContent || "";
    gwfLoad((c) => { c.melee[0].twoHand = false; }); await wait(200);
    out.gwf.versOne = PT.meleeGwf(CH(), 0);
    Math.random = seq();
    PT.rollMelee(0); await wait(500);
    Math.random = realRandom;
    out.gwf.logOne = (document.querySelector(".log-item") || {}).textContent || "";
    gwfLoad((c) => { c.shield = true; }); await wait(200);
    out.gwf.versShield = PT.meleeGwf(CH(), 0);
    gwfLoad((c) => { c.fightingStyle = "dueling"; }); await wait(200);
    out.gwf.notStyle = PT.meleeGwf(CH(), 0);
    Math.random = realRandom;
    return out;
  });
  check("rules.noDualWielder", !res.noDW.ok && /Dual Wielder/.test(res.noDW.reason) && !res.noDW.card, J(res.noDW));
  check("rules.dualWielderPistols", res.dw.ok && res.dw.n === 2 && res.dw.card && res.dw.pick === "gun:1", J(res.dw));
  check("holster.sides", J(res.dw.sides) === J(["L", "R"]) && res.dw.sideL === "L" && res.dw.sideR === "R", J(res.dw));
  check("holster.ownBonus", res.dw.firstL === 1 && res.dw.firstR === 2, J(res.dw));
  check("main.action", res.main.pips.action && !res.main.pips.bonus && !/off-hand/.test(res.main.log) && /\+ 3 \(DEX\)/.test(res.main.log), J(res.main));
  check("off.bonusPip", res.off.pips.bonus === true, J(res.off.pips));
  check("off.chatTag", /Dust · Pony Arms ChaosMaker \(off-hand\)/.test(res.off.log), res.off.log);
  check("off.noMod", /Damage: d8 \d+ = \d+ piercing/.test(res.off.log) && !/\(DEX\) =/.test(res.off.log), res.off.log);
  check("off.ammo", res.off.loaded === res.off.loadedR - 1, J(res.off));
  check("off.sound", res.off.sounds.length > 0, J(res.off.sounds));
  check("off.noEarlyBlock", res.off.alerts === 0, J(res.off));
  check("early.blocks", res.early.alerts >= 1 && !res.early.pips.bonus && res.early.loaded === res.early.before.loaded && res.early.rolls === res.early.before.rolls && /Attack action first/.test(res.early.toast), J(res.early));
  check("early.cardBlocks", res.early.cardBlocked, J(res.early));
  check("dm.override", res.dm.override, J(res.dm));
  check("free.offhand", /shoots freely \(off-hand\)/.test(res.free.log) && res.free.pips.bonus && res.free.pips.action, J(res.free));
  check("dm.offhand", /off-hand/.test(res.dm.log) && res.dm.pips.bonus && res.dm.dialogs === 0 && !res.dm.leak, J(res.dm));
  check("map.cardButtons", res.cardIds.some((x) => /^offhand:gun:1\|.*\(R\) · off-hand\|[^|]*\|$/.test(x)) && res.cardIds.some((x) => /^offhand:gun:0\|/.test(x)), J(res.cardIds));
  check("map.cardNoMod", res.cardIds.some((x) => /^offhand:gun:1\|[^|]*\|1d8 piercing\|$/.test(x)), J(res.cardIds));
  check("map.run", /off-hand/.test(res.mapRun.log) && res.mapRun.pips.bonus && res.mapRun.pips.action, J(res.mapRun));
  check("melee.lightPair", res.melee.ok && res.melee.card, J(res.melee));
  check("melee.offhand", /\(off-hand\)/.test(res.meleeOff.log) && res.meleeOff.pips.bonus && res.meleeOff.pips.action && !/off-hand/.test(res.meleeOff.main), J(res.meleeOff));
  check("melee.noMod", /Damage: d4 \d+ = \d+/.test(res.meleeOff.log) && !/\(mod\)/.test(res.meleeOff.log) && /\+ 3 \(mod\)/.test(res.meleeOff.main), J(res.meleeOff));
  check("melee.nonLightNeedsDW", !res.saber.ok, J(res.saber));
  check("mix.pistolBlade", res.mix.ok && J(res.mix.kinds) === J(["gun", "melee"]), J(res.mix));
  check("rules.shieldBlocks", !res.shield.ok && /shield/.test(res.shield.reason), J(res.shield));
  check("rules.twoHandGripBlocks", !res.grip.ok, J(res.grip));
  check("light.pistolPair", res.lightPair.ok && res.lightPair.n === 2, J(res.lightPair));
  check("light.pistolBlade", res.lightMix.ok && J(res.lightMix.kinds) === J(["gun", "melee"]), J(res.lightMix));
  check("light.otherPistolNeedsDW", !res.lightHeavy.ok && /Dual Wielder/.test(res.lightHeavy.reason) && res.lightHeavyDW.ok, J([res.lightHeavy, res.lightHeavyDW]));
  check("sidearm.offWhenTwo", res.sidearm.single === res.sidearm.two + 2 && res.sidearm.twoWield === true && res.sidearm.noDW === res.sidearm.single, J(res.sidearm));
  check("dw.acPlusOne", res.ac.dwOne === res.ac.base && res.ac.dwTwo === res.ac.base + 1 && res.ac.flag === 1, J(res.ac));
  check("dw.stowBoth", res.ac.stowBtn && res.ac.stowedFlag && res.ac.stowed === res.ac.base && res.ac.stowLog && res.ac.offDisabled && res.ac.drawBtn && res.ac.stowedBlocks, J(res.ac));
  check("dw.drawBoth", res.ac.drawn === res.ac.base + 1 && res.ac.drawLog, J(res.ac));
  check("dw.acNeedsFeat", res.ac.lightNoDW === res.ac.lightNoDWBase, J(res.ac));
  check("off.negativeModStays", /\(off-hand\)/.test(res.neg.log) && /-\s*1 \(DEX\)/.test(res.neg.log), res.neg.log);
  check("twoGun.pickers", res.tg.gs.includes("two-gun") && J(res.tg.scout) === J(["archery", "two-gun"]) && !res.tg.law.includes("two-gun"), J(res.tg));
  check("twoGun.addsMod", /\(off-hand\)/.test(res.tg.log) && /\+ 3 \(DEX\)/.test(res.tg.log), res.tg.log);
  check("twoGun.mapCard", /^1d8 \+3 piercing$/.test(res.tg.card || ""), res.tg.card);
  check("twoGun.cardNote", /Two-Gun: ability mod added/.test(res.tg.note), res.tg.note);
  check("twoGun.negativeStays", /-\s*1 \(DEX\)/.test(res.tg.negLog), res.tg.negLog);
  check("twoGun.additionalStyle10", res.tg.l10.has && res.tg.l10.sel2 && res.tg.l10.val === "two-gun" && !res.tg.l10.opts2.includes("sidearm") && res.tg.l9 === false, J([res.tg.l10, res.tg.l9]));
  check("twoGun.notLawman", res.tg.lawman === false, J(res.tg));
  check("gwf.versatileTwoHands", res.gwf.versTwo === true && res.gwf.heavy === true, J(res.gwf));
  check("gwf.versatileRerolls", /Damage: d10 10 = 10/.test(res.gwf.log), res.gwf.log);
  check("gwf.oneHandNoReroll", /Damage: d8 1 = 1/.test(res.gwf.logOne), res.gwf.logOne);
  check("gwf.oneHandNo", res.gwf.versOne === false && res.gwf.versShield === false && res.gwf.notStyle === false, J(res.gwf));
  check("sheet.noPageErrors", errs.length === 0, errs.join(" | "));

  /* DMCC demo loads clean with the new drawer toggle and detail checkbox */
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
console.log("\nall off-hand checks passed");

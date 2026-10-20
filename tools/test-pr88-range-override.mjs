/**
 * PR88 (0.3.77): DM range override parity.
 *  - resolve() override "adv": still blocks past max range, clears range DIS, sets advantage,
 *    log "DM override: advantage forced", button "ADV · forced".
 *  - One per-session DM override (SSDNSRangeRings.get/setOverride) shared by the map drawer's
 *    Range select and the DMCC Fight tab "Range:" picker. Players stay on Auto.
 *  - Advantage reaches the sheet (guns, spells, melee), DMCC cardStrike and the DM-acting-for-player path.
 * Needs the static server on 127.0.0.1:8765 and Chrome for parts 3-4 (ssdns-test-all starts the server).
 *   node tools/test-pr88-range-override.mjs
 */
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ORIGIN = "http://127.0.0.1:8765";
const failures = [];
const J = (x) => JSON.stringify(x);
function check(id, cond, detail) { if (!cond) failures.push(id); console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + detail : "")); }
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
function flush(ms) { return new Promise((r) => setTimeout(r, ms)); }

/* ---- part 1: resolve() + the shared store, in a bare VM ---- */
function ringsCtx(stored) {
  const bag = Object.assign({}, stored || {});
  const ctx = { console, sessionStorage: { getItem: (k) => (k in bag ? bag[k] : null), setItem: (k, v) => { bag[k] = String(v); } } };
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(read("assets/data/rules.js"), ctx);
  vm.runInContext(read("assets/js/spell-cast.js"), ctx);
  vm.runInContext(read("assets/js/range-rings.js"), ctx);
  return { R: ctx.SSDNSRangeRings, bag };
}
const { R, bag } = ringsCtx();
const NAVY = { weapon: "navy-army-ball-n-cap-revolver", tier: "medium" };
const b = R.bands(NAVY);
const at = (feet, override) => R.resolve(NAVY, feet, { hasTarget: true, override });
const inNormal = at(Math.max(10, b.normal - 5), "adv");
check("adv.normal", inNormal.apply && inNormal.advantage === true && !inNormal.disadvantage && !inNormal.blocked, J(inNormal));
check("adv.button", inNormal.button === "ADV · forced", inNormal.button);
check("adv.log", inNormal.log === "DM override: advantage forced", inNormal.log);
check("adv.note", /ADV: DM forced advantage/.test(inNormal.note || ""), inNormal.note);
const longAuto = at(b.normal + 5, "auto");
const longAdv = at(b.normal + 5, "adv");
check("adv.longAutoIsDis", longAuto.disadvantage && !longAuto.advantage, J(longAuto));
check("adv.clearsRangeDis", longAdv.advantage && !longAdv.disadvantage && !longAdv.blocked, J(longAdv));
const pastAdv = at(b.long + 10, "adv");
const pastIgnore = at(b.long + 10, "ignore");
check("adv.stillBlocks", pastAdv.blocked && !pastAdv.advantage, J(pastAdv));
check("ignore.unblocks", !pastIgnore.blocked && !pastIgnore.advantage, J(pastIgnore));
check("force.unchanged", at(b.normal - 5, "force").disadvantage && at(b.normal - 5, "force").button === "DIS · forced" && !at(b.normal - 5, "force").advantage);
check("auto.noAdv", at(b.normal - 5, "auto").advantage === false && at(b.normal - 5).advantage === false);
check("noTarget.noAdv", R.resolve(NAVY, 10, { hasTarget: false, override: "adv" }).advantage === false);
check("modeWith", R.modeWith("", inNormal) === "adv" && R.modeWith("adv", inNormal) === "adv" && R.modeWith("dis", inNormal) === "" &&
  R.modeWith("dis", longAuto) === "dis" && R.modeWith("", null) === "" && R.modeWith("", pastAdv) === "", "modeWith cases");
check("store.default", R.getOverride() === "auto");
const heard = [];
R.onOverride((v) => heard.push(v));
R.setOverride("adv");
R.setOverride("bogus");
check("store.set", heard.join(",") === "adv,auto" && R.getOverride() === "auto" && bag["ssdns.dm.rangeOverride"] === "auto", J({ heard, bag }));
R.setOverride("adv");
check("store.session", ringsCtx({ "ssdns.dm.rangeOverride": "adv" }).R.getOverride() === "adv" && ringsCtx({ "ssdns.dm.rangeOverride": "nope" }).R.getOverride() === "auto");

/* ---- part 2: source wiring ---- */
const mapSrc = read("map/ssdns-map.js");
const v2 = read("dm/assets/js/v2.js");
const extras = read("assets/js/sheet-extras.js");
const play = read("assets/js/sheet-playtest.js");
const html = read("dm/index.html");
check("src.playersAuto", mapSrc.includes("override: role === 'dm' ? rangeOverrideNow() : 'auto'"));
check("src.mapOption", mapSrc.includes("'>Force ADV</option>'"));
check("src.fightPicker", /Range: <select id="fightRangeOverride"[^>]*>(<option[^>]*>[^<]*<\/option>){4}<\/select>/.test(html) &&
  ["auto\">Auto", "ignore\">Ignore range", "force\">Force DIS", "adv\">Force ADV"].every((o) => html.includes('<option value="' + o + "</option>")));
check("src.pickerNextToDamage", html.indexOf('id="fightRangeOverride"') > html.indexOf('id="damageMode"') && html.indexOf('id="fightRangeOverride"') - html.indexOf('id="damageMode"') < 600);
const strike = v2.slice(v2.indexOf("async function cardStrike"), v2.indexOf("async function cardCheck"));
check("src.cardStrikeMax", /rangeAdv && !coverDis\)[\s\S]{0,80}Math\.max\(n1, n2\)/.test(strike));
const fire = v2.slice(v2.indexOf("async function dmFireMode"), v2.indexOf("async function dmFireMode") + 1600);
check("src.dmActingAdv", fire.includes("modeWith(chosen, peeked)") && fire.includes("chosenNow, rangeNote"));
check("src.sheetGun", /rollGun\._dmShot \? gunChosen\(i\) : rangeMode\(gunChosen\(i\), rangeShot\)/.test(extras) && extras.includes("rangeMode(gunChosen(i), peeked)"));
check("src.sheetSpell", extras.includes("chosenMode = rangeMode(chosenMode, rangeShot);") && extras.includes("rangeMode(chosenMode, peekedSpell)"));
check("src.sheetMelee", play.includes("chosen = rangeMode(chosen, rangeShot);") && extras.includes("var chosen = rangeMode(gunChosen(i), rangeShot);"));

/* ---- part 2b: the map drawer select follows the shared store (jsdom) ---- */
{
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/", pretendToBeVisual: true, runScripts: "dangerously" });
  const w = dom.window;
  const proto = w.HTMLElement.prototype;
  Object.defineProperty(proto, "clientWidth", { configurable: true, get() { return 800; } });
  Object.defineProperty(proto, "clientHeight", { configurable: true, get() { return 600; } });
  proto.getBoundingClientRect = function () { return { x: 0, y: 0, left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, toJSON() { return {}; } }; };
  w.HTMLCanvasElement.prototype.getContext = function () { const bag2 = {}; return new Proxy(bag2, { get(t, p) { if (p in t) return t[p]; if (typeof p !== "string") return undefined; return function () { return bag2; }; }, set(t, p, v) { t[p] = v; return true; } }); };
  w.HTMLImageElement.prototype.decode = function () { return Promise.resolve(); };
  w.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
  w.prompt = () => "";
  for (const rel of ["assets/data/rules.js", "assets/js/range-rings.js", "map/ssdns-map-firebase.js", "map/ssdns-map.js"]) {
    const s = w.document.createElement("script"); s.textContent = read(rel); w.document.body.appendChild(s);
  }
  const el = w.document.createElement("div"); w.document.body.appendChild(el);
  const scene = JSON.parse(read("map/scene-dusty-spur.json"));
  const tokens = JSON.parse(read("map/tokens.json"));
  const cards = JSON.parse(read("map/cards.json"));
  const api = w.SSDNSMap.create({
    el, role: "dm", uid: "dm", adapter: w.SSDNSMapFirebase.memory({ role: "dm" }),
    host: { on() {}, getCard(id) { return cards[id] || null; }, actions: { get() { return []; }, run() { return Promise.resolve(); } }, players() { return []; } },
    options: { scene, tokens, assetBase: "", players: () => [{ uid: "p_jolene", name: "Jolene" }], room: { table: { initiative: { order: [], turn: 0 } } } }
  });
  await flush(60);
  api.syncCombatants({ round: 1, turn: 0, started: true, order: [{ id: "p_jolene", name: "Jolene", kind: "player" }, { id: "en_bandit1", name: "Bandit", kind: "enemy" }] });
  await flush(20);
  const strip = el.querySelector('[data-act="turnStrip"]');
  const chip = strip && [...strip.querySelectorAll("span")].find((s) => s.textContent.includes("Bandit"));
  if (chip) chip.click();
  await flush(20);
  const sel = () => el.querySelector('[data-act="rangeOverride"]');
  const opts = sel() ? [...sel().options].map((o) => o.value + ":" + o.textContent) : [];
  check("drawer.options", J(opts) === J(["auto:Auto", "ignore:Ignore range", "force:Force DIS", "adv:Force ADV"]), J(opts));
  w.SSDNSRangeRings.setOverride("adv");
  await flush(10);
  check("drawer.followsPicker", sel() && sel().value === "adv", sel() && sel().value);
  sel().value = "ignore";
  sel().dispatchEvent(new w.Event("change", { bubbles: true }));
  check("drawer.setsShared", w.SSDNSRangeRings.getOverride() === "ignore", w.SSDNSRangeRings.getOverride());
  w.SSDNSRangeRings.setOverride("auto");
  api.destroy();
}

/* ---- parts 3-4 need the browser ---- */
function portOpen(port) { return new Promise((r) => { const s = net.connect({ port, host: "127.0.0.1" }, () => { s.end(); r(true); }); s.on("error", () => r(false)); }); }
if (!(await portOpen(8765))) { console.log("Static server is not listening on 8765 (run via ssdns-test-all)"); process.exit(1); }
const puppeteer = (await import("/tmp/pup/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js")).default;
const browser = await puppeteer.launch({ executablePath: "/opt/google/chrome/chrome", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
try {
  /* ---- part 3: the sheet rolls 2d20 keep-high on a DM 'Force ADV' verdict ---- */
  const pg = await browser.newPage();
  const errs = [];
  pg.on("pageerror", (e) => errs.push(String(e)));
  await pg.goto(ORIGIN + "/index.html", { waitUntil: "domcontentloaded" });
  await pg.waitForFunction(() => window.SSDNSApp && window.SSDNSGunRoll && window.SSDNSApp.applyPatch && window.SSDNSRangeRings && document.querySelector("#atkTarget"), { timeout: 20000 });
  const s = await pg.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const A = window.SSDNSApp;
    const Rg = window.SSDNSRangeRings;
    await wait(1200);
    A.applyPatch((d) => { const c = d.character; c.name = "Dust"; c.ammo = [{ type: "cartridge", caliber: "", count: 50 }];
      c.guns[0] = Object.assign(c.guns[0] || {}, { weapon: "navy-army-ball-n-cap-revolver", equipped: true, loaded: 6, chambers: ["c", "c", "c", "c", "c", "c"], misStreak: 0, jammed: false, dirty: false, fouled: false, ruined: false, broken: false, attackMode: "" });
      c.activeConditions = []; });
    await wait(300);
    const dialogs = () => document.querySelectorAll("dialog[open]").length;
    const lastLog = () => { const it = document.querySelector(".log-item"); return it ? it.textContent : ""; };
    const sel = document.querySelector("#atkTarget");
    sel.value = ""; sel.dispatchEvent(new Event("change", { bubbles: true }));
    document.querySelector("#globalAdv").value = "";
    const realRandom = Math.random;
    const seq = (arr) => { let i = 0; Math.random = () => arr[Math.min(i++, arr.length - 1)]; };
    const out = {};
    const NAVY = { weapon: "navy-army-ball-n-cap-revolver", tier: "medium" };
    const bands = Rg.bands(NAVY);
    /* long range + Force ADV: no DIS ask, two dice, keeps the high one */
    Rg.arm(Rg.resolve(NAVY, bands.normal + 5, { hasTarget: true, override: "adv" }));
    let k = 0; Math.random = () => ((k++ % 2) ? 0.9 : 0.1); /* d20s alternate 3 / 19 */
    window.SSDNSGunRoll(0, 0);
    await wait(250);
    out.gunAdv = { dialogs: dialogs() };
    await wait(600);
    out.gunAdv.log = lastLog();
    /* DIS chosen + Force ADV: straight roll */
    document.querySelector("#globalAdv").value = "dis";
    const g = A.doc().character.guns[0];
    Rg.arm(Rg.resolve(NAVY, 10, { hasTarget: true, override: "adv" }));
    seq([0.1, 0.9, 0.5, 0.5, 0.5, 0.5]);
    window.SSDNSGunRoll(0, 1);
    await wait(250);
    out.gunCancel = { dialogs: dialogs() };
    await wait(600);
    out.gunCancel.log = lastLog();
    document.querySelector("#globalAdv").value = "";
    /* same long shot on Auto keeps DIS (and asks) */
    Rg.arm(Rg.resolve(NAVY, bands.normal + 5, { hasTarget: true, override: "auto" }));
    seq([0.1, 0.9, 0.5, 0.5, 0.5, 0.5]);
    window.SSDNSGunRoll(0, 2);
    await wait(400);
    out.gunAuto = { dialogs: dialogs() };
    const dlg = document.querySelector("dialog[open]");
    if (dlg) { const no = [...dlg.querySelectorAll("button")].find((x) => /cancel|no/i.test(x.textContent)); if (no) no.click(); else dlg.close(); }
    await wait(300);
    Rg.clear();
    Math.random = realRandom;
    return out;
  });
  check("sheet.gunAdv.noAsk", s.gunAdv.dialogs === 0, J(s.gunAdv));
  check("sheet.gunAdv.keepsHigh", /= 19 → HIT/.test(s.gunAdv.log) && /advantage/i.test(s.gunAdv.log) && !/disadvantage/i.test(s.gunAdv.log), s.gunAdv.log);
  check("sheet.gunAdvCancelsDis", !/\b3\b.*\b19\b|\b19\b.*\b3\b/.test(s.gunCancel.log) && s.gunCancel.dialogs === 0, J(s.gunCancel));
  check("sheet.autoStillDis", s.gunAuto.dialogs === 1, J(s.gunAuto));
  check("sheet.noPageErrors", errs.length === 0, errs.join(" | "));

  /* ---- part 4: DMCC Fight tab picker <-> shared store, and an enemy strike with Force ADV ---- */
  const dm = await browser.newPage();
  await dm.setViewport({ width: 1400, height: 1000 });
  const dmErrs = [];
  dm.on("pageerror", (e) => dmErrs.push(String(e)));
  await dm.goto(ORIGIN + "/dm/index.html?demo=1", { waitUntil: "domcontentloaded" });
  await dm.waitForFunction(() => window.DMCC && document.querySelector("#btnLoadDemo"), { timeout: 20000 });
  await dm.evaluate(() => document.querySelector("#btnLoadDemo").click());
  await dm.waitForFunction(() => window.DMCC.state.demo && window.SSDNSMapHost && window.SSDNSMapFight, { timeout: 20000 });
  const d = await dm.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const until = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn()) return true; await wait(100); } return false; };
    const Rg = window.SSDNSRangeRings;
    const out = {};
    document.querySelector("#tab-fight").click();
    await wait(300);
    const pick = document.querySelector("#fightRangeOverride");
    out.options = pick ? [...pick.options].map((o) => o.value + ":" + o.textContent) : [];
    pick.value = "adv"; pick.dispatchEvent(new Event("change", { bubbles: true }));
    out.afterPick = Rg.getOverride();
    out.session = sessionStorage.getItem("ssdns.dm.rangeOverride");
    Rg.setOverride("force");
    out.followsStore = pick.value;
    Rg.setOverride("adv");
    out.flag = pick.classList.contains("is-override");
    /* the enemy strike: an armed Force ADV verdict rolls two d20 and keeps the higher */
    const add = document.querySelector('[data-add-beast="outlaw"]');
    if (add) add.click();
    await wait(800);
    const rolls = [];
    const realPush = window.DMCC.pushRoll;
    window.DMCC.pushRoll = function (entry) { rolls.push(entry); return realPush.apply(this, arguments); };
    const realRandom = Math.random;
    let i = 0;
    const btns = [...document.querySelectorAll("[data-row-atk]")];
    for (const b of btns) {
      b.click();
      await until(() => document.querySelector("#enemyTarget"), 1500);
      const tsel = document.querySelector("#enemyTarget");
      if (!tsel) continue;
      const real = [...tsel.options].find((o) => o.value && o.value !== "__free" && o.value !== "__none");
      if (!real) { const no = tsel.closest("form").querySelector("[value=no]"); if (no) no.click(); await wait(200); continue; }
      tsel.value = real.value;
      const origArm = Rg.arm;
      /* the demo map may not measure this pair; arm the DM-override verdict the map would arm */
      Rg.arm = function (v) { return origArm.call(Rg, v || Rg.resolve({ weapon: "navy-army-ball-n-cap-revolver" }, 20, { hasTarget: true, override: Rg.getOverride() })); };
      if (!Rg.peek()) origArm.call(Rg, Rg.resolve({ weapon: "navy-army-ball-n-cap-revolver" }, 20, { hasTarget: true, override: Rg.getOverride() }));
      Math.random = () => ((i++ % 2) ? 0.9 : 0.1); /* d20s alternate 3 / 19 */
      tsel.closest("form").querySelector("button[type=submit]").click();
      await wait(900);
      Rg.arm = origArm;
      Math.random = realRandom;
      out.fired = true;
      break;
    }
    out.rolls = rolls.map((r) => ({ detail: r.detail || "", text: r.text || "" }));
    await wait(500);
    /* the table feed: the override alert once; the range note and "Applied …" on separate lines */
    const items = [...document.querySelectorAll(".dock-item")];
    out.alertCount = items.filter((n) => /DM override: advantage forced/.test(n.textContent)).length;
    const strikeItem = items.filter((n) => /ADV: DM forced advantage/.test(n.textContent)).pop();
    out.applyBlock = strikeItem ? !!strikeItem.querySelector(".dock-apply") : null;
    out.strikeText = strikeItem ? strikeItem.innerText : "";
    out.ledgerKept = (window.DMCC.state.ledger || []).filter((e) => e.type === "alert" && /advantage forced/.test(e.what || "") && e.chatId).length;
    out.peekAfter = Rg.peek();
    window.DMCC.pushRoll = realPush;
    Rg.setOverride("auto");
    return out;
  });
  check("dmcc.pickerOptions", J(d.options) === J(["auto:Auto", "ignore:Ignore range", "force:Force DIS", "adv:Force ADV"]), J(d.options));
  check("dmcc.pickerSetsShared", d.afterPick === "adv" && d.session === "adv", J(d));
  check("dmcc.pickerFollowsMap", d.followsStore === "force" && d.flag === true, J(d));
  const hit = (d.rolls || []).find((r) => /d20/.test(r.detail) || /attacks/.test(r.detail));
  check("dmcc.strikeFired", !!d.fired && !!hit, J(d.rolls));
  check("dmcc.strikeKeepsHigh", !!hit && /«19»/.test(hit.detail) && /\b3\b/.test(hit.detail) && /ADV: DM forced advantage/.test(hit.detail), hit && hit.detail);
  check("feed.alertOnce", d.alertCount === 1, J({ alertCount: d.alertCount }));
  check("feed.ledgerKeepsRecord", d.ledgerKept >= 1, J({ ledgerKept: d.ledgerKept }));
  check("feed.applySeparated", !/advantageApplied/.test(d.strikeText) && (d.applyBlock === true || !/Applied/.test(d.strikeText)), J({ applyBlock: d.applyBlock, text: d.strikeText }));
  check("dmcc.noPageErrors", dmErrs.length === 0, dmErrs.join(" | "));
} finally { await browser.close(); }
console.log(failures.length ? "\n" + failures.length + " FAILED: " + failures.join(", ") : "\nAll PR88 range override checks passed.");
if (failures.length) process.exitCode = 1;

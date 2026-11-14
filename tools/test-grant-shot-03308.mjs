/**
 * A granted Bite is swung by the Dust Devil, not by the player's own token.
 * The effect origin, the log name, and the damage target all use the grant.
 * Melee stays a blade strike, not a ranged shot.
 * Sheet 0.3.311 / DMCC 0.2.324.
 *   node tools/test-grant-shot-03308.mjs
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
check("ver", ver.sheet === "0.3.311" && ver.dmcc === "0.2.324" && ver.sheetBuild === "sheet-playtest-v03311" && ver.dmccBuild === "dmcc-playtest-v02324");
check("rules.clean", !read("assets/data/rules.js").includes("0.3.311") && !read("database.rules.json").includes("0.3.311"));

function makeWindow() {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/dm/", pretendToBeVisual: true, runScripts: "dangerously" });
  const w = dom.window;
  const proto = w.HTMLElement.prototype;
  Object.defineProperty(proto, "clientWidth", { configurable: true, get() { return 1280; } });
  Object.defineProperty(proto, "clientHeight", { configurable: true, get() { return 800; } });
  Object.defineProperty(w.HTMLCanvasElement.prototype, "clientWidth", { configurable: true, get() { return 900; } });
  Object.defineProperty(w.HTMLCanvasElement.prototype, "clientHeight", { configurable: true, get() { return 600; } });
  proto.getBoundingClientRect = function () { return { x: 0, y: 0, left: 0, top: 0, right: 1280, bottom: 800, width: 1280, height: 800, toJSON() { return {}; } }; };
  w.HTMLCanvasElement.prototype.getContext = function () {
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
  w.HTMLImageElement.prototype.decode = function () { return Promise.resolve(); };
  w.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
  w.requestAnimationFrame = function () { return 0; };
  w.cancelAnimationFrame = function () {};
  return w;
}
function addScript(w, rel) {
  const s = w.document.createElement("script");
  s.textContent = read(rel);
  w.document.body.appendChild(s);
}
const scene = JSON.parse(read("map/scene-dusty-spur.json"));
const own = { name: "Ada", ac: 14, hp: { cur: 18, max: 27, temp: 0 }, speed: 30, attacks: [{ id: "gunroll:0", name: "Revolver", toHit: "+5", damage: "1d8+3", range: "40/120" }], spells: [] };
const bite = { id: "bite", name: "Bite", kind: "melee", toHit: "+4", damage: "2d4+2 piercing", range: "5 ft" };
const acOf = {};
const scripts = ["assets/js/range-rings.js", "assets/js/turn-rules.js", "map/token-crop.js", "map/ssdns-map-firebase.js", "map/map-packs.js", "map/map-library.js", "map/ssdns-map-fx.js", "map/ssdns-map.js"];
function boot(w, opts) {
  scripts.forEach((f) => addScript(w, f));
  const el = w.document.createElement("div");
  w.document.body.appendChild(el);
  return w.SSDNSMap.create({
    el, role: opts.role, uid: opts.uid,
    adapter: opts.adapter,
    host: {
      players: () => [{ uid: "ada", name: "Ada" }],
      ownCard: opts.role === "player" ? () => own : null,
      targetAc: (id) => (acOf[id] != null ? acOf[id] : null)
    },
    options: {
      scene: JSON.parse(JSON.stringify(scene)),
      tokens: { tokens: {} },
      assetBase: "../map/",
      players: () => [{ uid: "ada", name: "Ada" }],
      ensureScene: opts.role !== "player",
      room: { table: { initiative: { order: [], turn: 0 } } }
    }
  });
}
const flush = (ms) => new Promise((r) => setTimeout(r, ms));
const store = { pub: {}, dm: {} };
const bus = [];
const dmW = makeWindow();
addScript(dmW, "map/ssdns-map-firebase.js");
const dm = boot(dmW, { role: "dm", uid: "dm", adapter: dmW.SSDNSMapFirebase.memory({ role: "dm", store, bus }) });
await flush(80);
const plW = makeWindow();
addScript(plW, "map/ssdns-map-firebase.js");
const player = boot(plW, { role: "player", uid: "ada", adapter: plW.SSDNSMapFirebase.memory({ role: "player", store, bus }) });
await flush(80);

function addNpc() {
  const before = new Set(dm.tokenBoxes().map((t) => t.id));
  dmW.document.querySelector("[data-act='addTokenBtn']").click();
  return dm.tokenBoxes().find((t) => !before.has(t.id) && (t.kind === "npc" || t.kind === "enemy"));
}
const adaId = dm.layers().activeId("ada");
const devil = addNpc();
const scor = addNpc();
dm.patchToken(adaId, { name: "Ada", pos: { x: 8, y: 7 }, size: 1, hp: 18, maxHp: 27 });
dm.patchToken(devil.id, {
  name: "Dust Devil", size: 1, pos: { x: 8, y: 8 }, ac: 13, hp: 11, maxHp: 11, speed: 40,
  attacks: [bite]
});
dm.patchToken(scor.id, { name: "Giant Scorpion", size: 1, pos: { x: 9, y: 8 }, ac: 15, hp: 52, maxHp: 52 });
acOf[scor.id] = 15;
dm.focusToken(devil.id);
dmW.document.querySelector("[data-act='grantUid']").value = "ada";
dmW.document.querySelector("[data-act='grantBtn']").click();
await flush(40);
const adaBefore = dm.tokenSnapshot(adaId);

const posted = [];
plW.SSDNSDmJoin = {
  isJoined() { return true; },
  postAttack(entry) {
    posted.push(JSON.parse(JSON.stringify(entry)));
    return Promise.resolve(dm.applyStyledHit(entry));
  },
  postRoll(entry) { posted.push({ roll: true, who: entry.who, characterName: entry.characterName, fx: entry.fxReq }); return Promise.resolve({ ok: true }); },
  postDamage() { return Promise.resolve({ ok: true }); }
};
player.useGrant(devil.id);
player.aim(scor.id);
player.queueRolls([18, 2, 2]);
plW.document.querySelector("[data-act='playerAttack']").click();
await flush(30);

const hit = player.grantLog().slice(-1)[0];
const pfx = player.fxLog();
const dfx = dm.fxLog();
const ranged = ["gun", "arrow", "bolt", "buck", "thrown", "boom"];
function near(log, id, x, y) {
  return log && log.shooter === id && log.origin && Math.hypot(log.origin.x - x, log.origin.y - y) < 0.6;
}
check("log.devil", hit && hit.line.indexOf("Dust Devil → Giant Scorpion") === 0 && hit.line.indexOf("Ada") < 0, hit && hit.line);
check("payload.shooter", posted[0] && posted[0].shooterId === devil.id && posted[0].shooterId !== adaId && posted[0].targetId === scor.id && posted[0].characterName === "Dust Devil" && posted[0].grantToken === true && posted[0].melee === true && posted[0].fxType === "blade", JSON.stringify(posted[0] && { shooterId: posted[0].shooterId, targetId: posted[0].targetId, fxType: posted[0].fxType, name: posted[0].characterName }));
check("player.fx", pfx.some((row) => near(row, devil.id, 8.5, 8.5) && row.type === "blade" && row.target === scor.id) && !pfx.some((row) => row.shooter === adaId || ranged.indexOf(row.type) >= 0), JSON.stringify(pfx));
check("dm.fx", dfx.some((row) => near(row, devil.id, 8.5, 8.5) && row.type === "blade" && row.target === scor.id) && !dfx.some((row) => row.shooter === adaId || ranged.indexOf(row.type) >= 0), JSON.stringify(dfx));
check("ada.idle", adaBefore && dm.tokenSnapshot(adaId).x === adaBefore.x && dm.tokenSnapshot(adaId).y === adaBefore.y && dm.tokenSnapshot(adaId).hp === adaBefore.hp, JSON.stringify(dm.tokenSnapshot(adaId)));
check("scorp.hp", dm.tokenSnapshot(scor.id).hp === 46, String(dm.tokenSnapshot(scor.id).hp));
check("roll.who", posted.some((row) => row.roll && row.who === "Dust Devil" && row.fx && row.fx.shooter === devil.id && row.fx.type === "blade"), JSON.stringify(posted.filter((row) => row.roll)));

const OUT = "/opt/cursor/artifacts/grant-shot";
fs.mkdirSync(OUT, { recursive: true });
if (!failures.length) {
  const { chromium } = await import("/tmp/pw/node_modules/playwright-core/index.mjs");
  const CHROME = "/usr/local/bin/google-chrome";
  const BASE = "http://127.0.0.1:8765";
  const sheet = { tokenId: "devil", name: "Dust Devil", ac: 13, hp: 11, maxHp: 11, speed: 40, attacks: [bite], spells: [] };
  const seed = {
    "map/public/tokens/ply_ada": { value: { id: "ply_ada", kind: "player", name: "Ada", ownerUid: "ada", ownerCanMove: true, playerActive: true, sceneId: "scn_dustyspur01", size: 1, pos: { x: 8, y: 7 }, color: "#c9a227" }, seq: 1, by: "test" },
    "map/public/tokens/devil": { value: { id: "devil", kind: "npc", name: "Dust Devil", controlledBy: ["ada"], sceneId: "scn_dustyspur01", size: 1, pos: { x: 8, y: 8 }, color: "#8a5a2b" }, seq: 1, by: "test" },
    "map/public/tokens/scorp": { value: { id: "scorp", kind: "enemy", name: "Giant Scorpion", sceneId: "scn_dustyspur01", size: 1, pos: { x: 9, y: 8 }, color: "#6a3a2a" }, seq: 1, by: "test" },
    "inbox/ada/grant_devil": { value: { id: "grant_devil", ts: 1, type: "grant_sheet", to: "ada", tokenId: "devil", sheet }, seq: 1, by: "test" }
  };
  async function openMap(page) {
    await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
    await page.evaluate(() => document.querySelectorAll("dialog[open]").forEach((n) => n.close()));
    await page.evaluate(() => {
      const input = document.querySelector("#charName");
      if (!input) return;
      input.value = "Ada";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await page.evaluate((bag) => {
      window.SSDNSDmJoin = {
        isJoined() { return true; },
        live() { return { joined: true, roomCode: "LOCAL", uid: "ada", local: true, seed: bag }; },
        postAttack(entry) { window.__grantAttack = entry; return Promise.resolve({ ok: true }); },
        postRoll(entry) { window.__grantRoll = entry; return Promise.resolve({ ok: true }); },
        postDamage() { window.__grantDamage = true; return Promise.resolve({ ok: true }); }
      };
      window.SSDNSMapHost.targetAc = function (id) { return id === "scorp" ? 15 : null; };
      window.SSDNSMapHost.syncRoom();
    }, seed);
    await page.waitForFunction(() => {
      const boxes = window.SSDNSMapHost && window.SSDNSMapHost.tokenBoxes && window.SSDNSMapHost.tokenBoxes();
      return boxes && boxes.some((t) => t.id === "devil") && boxes.some((t) => t.id === "ply_ada");
    }, null, { timeout: 8000 });
    const tab = page.locator("#tab-map");
    if (await page.evaluate(() => matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0)) await tab.tap();
    else await tab.click();
    await page.waitForTimeout(250);
  }
  async function biteFromDevil(page) {
    await page.evaluate(() => {
      const sheetTarget = document.querySelector("#atkTarget");
      if (sheetTarget && ![...sheetTarget.options].some((o) => o.value === "scorp")) {
        const opt = document.createElement("option");
        opt.value = "scorp";
        opt.textContent = "Giant Scorpion";
        opt.setAttribute("data-ac", "15");
        sheetTarget.appendChild(opt);
      }
      const sel = document.querySelector("[data-act='grantSwitch']");
      if (sel) { sel.value = "devil"; sel.dispatchEvent(new Event("change", { bubbles: true })); }
      window.SSDNSMapHost.aim("scorp");
      window.SSDNSMapHost.queueRolls([18, 2, 2]);
    });
    await page.evaluate(() => {
      const btn = document.querySelector("[data-act='playerAttack']");
      if (btn) btn.click();
    });
    await page.waitForTimeout(140);
    return page.evaluate(() => {
      const fx = window.SSDNSMapHost.fxLog ? window.SSDNSMapHost.fxLog() : [];
      const attack = window.__grantAttack || {};
      const line = (window.SSDNSMapHost.grantLog().slice(-1)[0] || {}).line || "";
      return { fx, shooterId: attack.shooterId || "", fxType: attack.fxType || "", line };
    });
  }
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
  const desk = await browser.newContext({ viewport: { width: 1280, height: 800 }, hasTouch: false });
  const page = await desk.newPage();
  page.on("pageerror", (err) => console.log("pageerror desk", err.message));
  await openMap(page);
  const deskBite = await biteFromDevil(page);
  check("view.desk", deskBite.shooterId === "devil" && deskBite.fxType === "blade" && deskBite.line.indexOf("Dust Devil → Giant Scorpion") === 0 && deskBite.fx.some((row) => row.shooter === "devil" && row.type === "blade") && !deskBite.fx.some((row) => row.shooter === "ply_ada"), JSON.stringify({ shooterId: deskBite.shooterId, fxType: deskBite.fxType, line: deskBite.line, fx: deskBite.fx }));
  await page.screenshot({ path: path.join(OUT, "desktop-bite.png"), timeout: 20000 });
  await desk.close();
  const phoneCtx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
  });
  const phone = await phoneCtx.newPage();
  phone.on("pageerror", (err) => console.log("pageerror phone", err.message));
  await openMap(phone);
  await phone.waitForFunction(() => document.body.classList.contains("map-phone"), null, { timeout: 4000 });
  const phoneBite = await biteFromDevil(phone);
  check("view.phone", phoneBite.shooterId === "devil" && phoneBite.fxType === "blade" && phoneBite.line.indexOf("Dust Devil") === 0 && phoneBite.fx.some((row) => row.shooter === "devil" && row.type === "blade") && !phoneBite.fx.some((row) => row.shooter === "ply_ada"), JSON.stringify({ shooterId: phoneBite.shooterId, line: phoneBite.line, fx: phoneBite.fx }));
  await phone.screenshot({ path: path.join(OUT, "phone-bite.png"), timeout: 20000 });
  await phoneCtx.close();
  await browser.close();
}

if (failures.length) {
  console.log("FAILED " + failures.length);
  failures.forEach((line) => console.log(" - " + line));
  process.exit(1);
}
console.log("grant shot 0.3.311 ok");
process.exit(0);

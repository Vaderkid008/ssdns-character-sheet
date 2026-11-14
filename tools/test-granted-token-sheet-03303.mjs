/**
 * A granted token brings its stat block to the player card.
 * The character sheet stays the character sheet. Revoke takes the extra away.
 * Sheet 0.3.311 / DMCC 0.2.324.
 *   node tools/test-granted-token-sheet-03303.mjs
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
check("rules.clean", !read("assets/data/rules.js").includes("grant_sheet") && !read("database.rules.json").includes("grant_sheet"));

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
  return w;
}
function addScript(w, rel) {
  const s = w.document.createElement("script");
  s.textContent = read(rel);
  w.document.body.appendChild(s);
}
const scene = JSON.parse(read("map/scene-dusty-spur.json"));
const own = {
  name: "Ada",
  ac: 14,
  hp: { cur: 18, max: 27, temp: 0 },
  speed: 30,
  attacks: [{ id: "gunroll:0", name: "Revolver", toHit: "+5", damage: "1d8+3" }],
  spells: []
};
const ownBefore = JSON.stringify(own);
function boot(w, opts) {
  ["map/token-crop.js", "map/ssdns-map-firebase.js", "map/map-packs.js", "map/map-library.js", "map/ssdns-map.js"].forEach((f) => addScript(w, f));
  const el = w.document.createElement("div");
  w.document.body.appendChild(el);
  return w.SSDNSMap.create({
    el,
    role: opts.role,
    uid: opts.uid,
    adapter: opts.adapter,
    host: {
      players: () => [{ uid: "ada", name: "Ada" }],
      ownCard: opts.role === "player" ? () => own : null
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
await flush(120);
const plW = makeWindow();
addScript(plW, "map/ssdns-map-firebase.js");
const player = boot(plW, { role: "player", uid: "ada", adapter: plW.SSDNSMapFirebase.memory({ role: "player", store, bus }) });
await flush(120);

const adaId = dm.layers().activeId("ada");
dm.patchToken(adaId, { sheetId: "ada", combatantId: "ada", hp: 18, maxHp: 27 });
dmW.document.querySelector("[data-act='addTokenBtn']").click();
const horse = dm.tokenBoxes().find((t) => t.kind === "npc" || t.kind === "enemy");
dm.patchToken(horse.id, {
  name: "Horse",
  ac: 11,
  hp: 19,
  maxHp: 19,
  speed: 60,
  attacks: "Hooves +6 (2d4+4 bludgeoning)",
  spells: [{ name: "Phantom Neigh", kind: "save", dc: "13", damage: "" }]
});
dm.focusToken(horse.id);
dmW.document.querySelector("[data-act='grantUid']").value = "ada";
dmW.document.querySelector("[data-act='grantBtn']").click();
await flush(40);

const pub = store.pub["map/public/tokens/" + horse.id];
const inbox = store.pub["inbox/ada/grant_" + horse.id];
check("grant.control", (horse && dm.tokenBoxes().find((t) => t.id === horse.id).controlledBy || []).indexOf("ada") >= 0);
check("grant.notOwner", dm.tokenBoxes().find((t) => t.id === horse.id).ownerUid !== "ada");
check("grant.publicClean", pub && pub.value && pub.value.hp == null && pub.value.maxHp == null && pub.value.ac == null, JSON.stringify(pub && pub.value && { hp: pub.value.hp, ac: pub.value.ac }));
check("grant.inbox", inbox && inbox.value && inbox.value.type === "grant_sheet" && inbox.value.to === "ada" && inbox.value.sheet.hp === 19 && inbox.value.sheet.ac === 11, JSON.stringify(inbox && inbox.value && inbox.value.sheet));
check("grant.seen", player.grants().some((g) => g.tokenId === horse.id && g.name === "Horse" && g.attacks.some((a) => a.name === "Hooves")));
check("grant.switcher", !!plW.document.querySelector("[data-act='grantSwitch']") && plW.document.querySelector("[data-act='grantSwitch']").options.length === 2);

player.useGrant(horse.id);
const horseCard = player.grantCard();
check("act.card", horseCard && horseCard.name === "Horse" && horseCard.ac === 11 && horseCard.hp && horseCard.hp.cur === 19 && horseCard.hp.max === 19, JSON.stringify(horseCard && { name: horseCard.name, ac: horseCard.ac, hp: horseCard.hp }));
const atk = plW.document.querySelector("[data-act='playerAttack'][data-id^='grantatk:']");
const spell = plW.document.querySelector("[data-act='playerSpell'][data-id^='grantspell:']");
check("act.buttons", !!atk && !!spell && atk.textContent.indexOf("Hooves") >= 0, (atk && atk.textContent) + " | " + (spell && spell.textContent));
if (atk) atk.click();
await flush(20);
check("act.rolled", player.grantLog().some((row) => row.name === "Hooves" && row.total >= 1));
check("own.untouched", JSON.stringify(own) === ownBefore && player.layers().activeId("ada") === adaId);
const mine = player.layers().tokens().find((t) => t.id === adaId);
check("own.link", mine && mine.sheetId === "ada" && mine.ownerUid === "ada" && mine.hp == null, JSON.stringify(mine));

player.useGrant("");
check("own.card", player.grantCard() && player.grantCard().name === "Ada" && player.grantCard().attacks[0].id === "gunroll:0");

dmW.document.querySelector("[data-act='revokeBtn']").click();
await flush(40);
check("revoke.gone", player.grants().length === 0 && !plW.document.querySelector("[data-act='grantSwitch']"));
check("revoke.inbox", !store.pub["inbox/ada/grant_" + horse.id]);
check("revoke.own", JSON.stringify(own) === ownBefore && player.grantCard().name === "Ada" && player.layers().tokens().find((t) => t.id === adaId).sheetId === "ada");

const OUT = "/opt/cursor/artifacts/grant-sheet";
fs.mkdirSync(OUT, { recursive: true });
try {
  const { chromium } = await import("/tmp/pw/node_modules/playwright-core/index.mjs");
  const browser = await chromium.launch({ executablePath: "/usr/local/bin/google-chrome", headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 420, height: 780 } });
  await page.goto("http://127.0.0.1:8765/map/demo.html?role=dm&room=grantsheet", { waitUntil: "domcontentloaded" });
  await page.addScriptTag({ url: "http://127.0.0.1:8765/map/ssdns-map-firebase.js" });
  await page.waitForFunction(() => window.SSDNSMap && window.SSDNSMapFirebase);
  await page.evaluate(async () => {
    const scene = await fetch("scene-dusty-spur.json").then((r) => r.json());
    const store = { pub: {}, dm: {} };
    const bus = [];
    const host = document.createElement("div");
    host.id = "shotHost";
    host.style.cssText = "width:400px;height:720px;position:relative";
    document.body.innerHTML = "";
    document.body.appendChild(host);
    const dmEl = document.createElement("div");
    dmEl.style.display = "none";
    document.body.appendChild(dmEl);
    const ownCard = { name: "Ada", ac: 14, hp: { cur: 18, max: 27, temp: 0 }, speed: 30, attacks: [{ id: "gunroll:0", name: "Revolver", toHit: "+5", damage: "1d8+3" }], spells: [] };
    const opts = (role) => ({
      scene: JSON.parse(JSON.stringify(scene)),
      tokens: { tokens: {} },
      assetBase: "",
      players: () => [{ uid: "ada", name: "Ada" }],
      ensureScene: role !== "player",
      room: { table: { initiative: { order: [], turn: 0 } } }
    });
    window.dmMap = window.SSDNSMap.create({
      el: dmEl, role: "dm", uid: "dm",
      adapter: window.SSDNSMapFirebase.memory({ role: "dm", store, bus }),
      host: { players: () => [{ uid: "ada", name: "Ada" }] },
      options: opts("dm")
    });
    window.plMap = window.SSDNSMap.create({
      el: host, role: "player", uid: "ada",
      adapter: window.SSDNSMapFirebase.memory({ role: "player", store, bus }),
      host: { players: () => [{ uid: "ada", name: "Ada" }], ownCard: () => ownCard },
      options: opts("player")
    });
  });
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const ada = window.dmMap.layers().activeId("ada");
    window.dmMap.patchToken(ada, { sheetId: "ada", combatantId: "ada" });
    document.querySelector("[data-act='addTokenBtn']").click();
    const horse = window.dmMap.tokenBoxes().find((t) => t.kind === "npc" || t.kind === "enemy");
    window.dmMap.patchToken(horse.id, {
      name: "Horse", ac: 11, hp: 19, maxHp: 19, speed: 60,
      attacks: "Hooves +6 (2d4+4 bludgeoning)",
      spells: [{ name: "Phantom Neigh", kind: "save", dc: "13" }]
    });
    window.dmMap.focusToken(horse.id);
    document.querySelector("[data-act='grantUid']").value = "ada";
    document.querySelector("[data-act='grantBtn']").click();
    window.plMap.useGrant(horse.id);
  });
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(OUT, "player-horse.png"), timeout: 20000 });
  await page.evaluate(() => window.plMap.useGrant(""));
  await page.waitForTimeout(100);
  await page.screenshot({ path: path.join(OUT, "player-own.png"), timeout: 20000 });
  await page.evaluate(() => document.querySelector("[data-act='revokeBtn']").click());
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(OUT, "player-revoked.png"), timeout: 20000 });
  const shot = await page.evaluate(() => ({
    horse: window.plMap.grants().length,
    switcher: !!document.querySelector("#shotHost [data-act='grantSwitch']"),
    name: (document.querySelector("#shotHost [data-act='playerName']") || {}).textContent || ""
  }));
  check("shot.revoked", shot.horse === 0 && !shot.switcher && shot.name === "Ada", JSON.stringify(shot));
  await browser.close();
} catch (err) {
  check("shot.run", false, err && err.message);
}

if (failures.length) {
  console.log("FAILED " + failures.length);
  failures.forEach((f) => console.log(" - " + f));
  process.exit(1);
}
console.log("granted token sheet 0.3.311 ok");

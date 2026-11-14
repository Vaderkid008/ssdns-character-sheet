/**
 * Tapping a token the player controls switches the player card.
 * Own token, a duplicate, and a granted token. An uncontrolled token does not.
 * A pan does not switch. A press-and-hold does not switch until the finger is up.
 * Sheet 0.3.309 / DMCC 0.2.322.
 *   node tools/test-card-follow-03306.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "/tmp/pw/node_modules/playwright-core/index.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHROME = "/usr/local/bin/google-chrome";
const OUT = "/opt/cursor/artifacts/card-follow";
const BASE = "http://127.0.0.1:8765";
fs.mkdirSync(OUT, { recursive: true });

const failures = [];
function check(id, cond, detail) {
  if (!cond) failures.push(id + (detail ? " — " + detail : ""));
  console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + detail : ""));
}

const version = JSON.parse(fs.readFileSync(path.join(root, "version.json"), "utf8"));
check("ver.sheet", version.sheet === "0.3.309" && version.sheetBuild === "sheet-playtest-v03309");
check("ver.dmcc", version.dmcc === "0.2.322" && version.dmccBuild === "dmcc-playtest-v02322");
check("rules.clean", !fs.readFileSync(path.join(root, "assets/data/rules.js"), "utf8").includes("0.3.309") && !fs.readFileSync(path.join(root, "database.rules.json"), "utf8").includes("0.3.309"));

const sheet = {
  tokenId: "horse",
  name: "Horse",
  ac: 11,
  hp: 19,
  maxHp: 19,
  speed: 60,
  attacks: [{ id: "hooves", name: "Hooves", toHit: "+6", damage: "2d4+4" }],
  spells: []
};
const seed = {
  "map/public/tokens/ply_ada": {
    value: { id: "ply_ada", kind: "player", name: "Ada", ownerUid: "ada", ownerCanMove: true, playerActive: true, sceneId: "scn_dustyspur01", size: 1, pos: { x: 6, y: 8 }, color: "#c9a227" },
    seq: 1, by: "test"
  },
  "map/public/tokens/ply_ada2": {
    value: { id: "ply_ada2", kind: "player", name: "Ada", ownerUid: "ada", ownerCanMove: true, playerActive: false, copyOf: "ply_ada", sceneId: "scn_dustyspur01", size: 1, pos: { x: 8, y: 8 }, color: "#c9a227" },
    seq: 1, by: "test"
  },
  "map/public/tokens/horse": {
    value: { id: "horse", kind: "npc", name: "Horse", controlledBy: ["ada"], sceneId: "scn_dustyspur01", size: 1, pos: { x: 4, y: 8 }, color: "#8a5a2b" },
    seq: 1, by: "test"
  },
  "map/public/tokens/bandit": {
    value: { id: "bandit", kind: "enemy", name: "Bandit", sceneId: "scn_dustyspur01", size: 1, pos: { x: 6, y: 6 }, color: "#8b3a3a" },
    seq: 1, by: "test"
  },
  "inbox/ada/grant_horse": {
    value: { id: "grant_horse", ts: 1, type: "grant_sheet", to: "ada", tokenId: "horse", sheet: sheet },
    seq: 1, by: "test"
  }
};

async function shot(page, name) {
  await page.screenshot({ path: path.join(OUT, name + ".png"), timeout: 20000 });
}
async function at(page, id) {
  return page.evaluate((tokenId) => window.SSDNSMapHost.tokenScreen(tokenId), id);
}
async function card(page) {
  return page.evaluate(() => {
    const sel = document.querySelector("[data-act='grantSwitch']");
    const name = document.querySelector("[data-act='playerName']");
    const dock = document.querySelector("[data-act='playerDockLabel']");
    const attacks = [...document.querySelectorAll("[data-act='playerAttack']")].map((b) => b.textContent.replace(/\s+/g, " ").trim());
    const menu = document.querySelector("[data-act='tokenCmd']");
    return {
      grant: sel ? sel.value : null,
      options: sel ? [...sel.options].map((o) => o.textContent.trim()) : [],
      name: name ? name.textContent.trim() : "",
      dock: dock ? dock.textContent.trim() : "",
      attacks,
      menu: menu ? menu.textContent.replace(/\s+/g, " ").trim() : ""
    };
  });
}
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
      isJoined: function () { return true; },
      live: function () { return { joined: true, roomCode: "LOCAL", uid: "ada", local: true, seed: bag }; }
    };
    window.SSDNSMapHost.syncRoom();
  }, seed);
  await page.waitForFunction(() => {
    const boxes = window.SSDNSMapHost && window.SSDNSMapHost.tokenBoxes && window.SSDNSMapHost.tokenBoxes();
    return boxes && boxes.some((t) => t.id === "horse") && boxes.some((t) => t.id === "ply_ada");
  }, null, { timeout: 8000 });
  const tab = page.locator("#tab-map");
  if (await page.evaluate(() => matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0)) await tab.tap();
  else await tab.click();
  await page.waitForFunction(() => {
    const sel = document.querySelector("[data-act='grantSwitch']");
    const name = document.querySelector("[data-act='playerName']");
    return sel && [...sel.options].some((o) => o.value === "horse") && name && name.textContent.trim() === "Ada";
  }, null, { timeout: 8000 });
  await page.waitForTimeout(200);
}
async function tapToken(page, id, touch) {
  const p = await at(page, id);
  const hit = await page.evaluate((pt) => {
    const n = document.elementFromPoint(pt.x, pt.y);
    return n ? (n.id || n.getAttribute("data-act") || n.tagName) : "none";
  }, p);
  if (touch) {
    const c = await page.context().newCDPSession(page);
    await c.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: Math.round(p.x), y: Math.round(p.y), id: 1 }] });
    await page.waitForTimeout(30);
    await c.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await c.detach();
  } else {
    await page.mouse.click(p.x, p.y);
  }
  await page.waitForTimeout(120);
  return p;
}

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
const desk = await browser.newContext({ viewport: { width: 1280, height: 800 }, hasTouch: false });
const page = await desk.newPage();
page.on("pageerror", (err) => console.log("pageerror desk", err.message));
await openMap(page);
const own = await card(page);
check("desk.ownName", own.grant === "" && own.name && own.name !== "Horse", JSON.stringify(own));
check("desk.switchListed", own.options.indexOf("My character") >= 0 && own.options.indexOf("Horse") >= 0, own.options.join(","));

await tapToken(page, "horse", false);
const horse = await card(page);
check("desk.horse", horse.grant === "horse" && horse.name === "Horse" && horse.attacks.some((a) => a.indexOf("Hooves") >= 0), JSON.stringify(horse));
check("desk.horseMenu", horse.menu.indexOf("Move") >= 0 && horse.menu.indexOf("Interact") >= 0, horse.menu);
await shot(page, "desktop-horse");

await tapToken(page, "bandit", false);
const still = await card(page);
check("desk.banditStays", still.grant === "horse" && still.name === "Horse", JSON.stringify(still));

await tapToken(page, "ply_ada2", false);
const copy = await card(page);
check("desk.copy", copy.grant === "" && copy.name === own.name && !copy.attacks.some((a) => a.indexOf("Hooves") >= 0), JSON.stringify(copy));
check("desk.copyMenu", copy.menu.indexOf("Move") >= 0, copy.menu);

await tapToken(page, "ply_ada", false);
const back = await card(page);
check("desk.ownAgain", back.grant === "" && back.name === own.name, JSON.stringify(back));
await shot(page, "desktop-own");

await page.evaluate(() => {
  const sel = document.querySelector("[data-act='grantSwitch']");
  sel.value = "horse";
  sel.dispatchEvent(new Event("change", { bubbles: true }));
});
const manual = await card(page);
check("desk.manual", manual.grant === "horse" && manual.name === "Horse", JSON.stringify(manual));
await desk.close();

const phoneCtx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
});
const phone = await phoneCtx.newPage();
phone.on("pageerror", (err) => console.log("pageerror phone", err.message));
await openMap(phone);
await phone.waitForFunction(() => document.body.classList.contains("map-phone"), null, { timeout: 4000 });
const phoneOwn = await card(phone);
check("phone.own", phoneOwn.grant === "" && phoneOwn.dock === phoneOwn.name && phoneOwn.name !== "Horse", JSON.stringify(phoneOwn));

await tapToken(phone, "horse", true);
const phoneHorse = await card(phone);
check("phone.horse", phoneHorse.grant === "horse" && phoneHorse.name === "Horse" && phoneHorse.dock === "Horse", JSON.stringify(phoneHorse));
check("phone.menu", phoneHorse.menu.indexOf("Move") >= 0 && phoneHorse.menu.indexOf("Interact") >= 0, phoneHorse.menu);
await phone.evaluate(() => {
  const card = document.querySelector("[data-act='playerCard']");
  if (card) card.classList.remove("min");
});
await shot(phone, "phone-horse");
await phone.evaluate(() => {
  const card = document.querySelector("[data-act='playerCard']");
  if (card) card.classList.add("min");
  const m = document.querySelector("[data-act='tokenCmd']");
  if (m) m.remove();
});
await tapToken(phone, "bandit", true);
const phoneBandit = await card(phone);
check("phone.banditStays", phoneBandit.grant === "horse" && phoneBandit.name === "Horse", JSON.stringify(phoneBandit));

await phone.evaluate(() => { const m = document.querySelector("[data-act='tokenCmd']"); if (m) m.remove(); });
const adaAt = await at(phone, "ply_ada");
const hold = await phone.context().newCDPSession(phone);
await hold.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: Math.round(adaAt.x), y: Math.round(adaAt.y), id: 1 }] });
const start = Date.now();
let mid = null;
while (Date.now() - start < 420) {
  await hold.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: Math.round(adaAt.x), y: Math.round(adaAt.y), id: 1 }] });
  await phone.waitForTimeout(40);
}
mid = await card(phone);
await hold.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: Math.round(adaAt.x + 80), y: Math.round(adaAt.y), id: 1 }] });
await phone.waitForTimeout(40);
await hold.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
await hold.detach();
await phone.waitForTimeout(120);
const afterHold = await card(phone);
check("phone.holdWaits", mid.grant === "horse" && mid.name === "Horse", JSON.stringify(mid));
check("phone.holdDrops", afterHold.grant === "" && afterHold.name === phoneOwn.name, JSON.stringify(afterHold));

const beforePan = await card(phone);
const banditAt = await at(phone, "bandit");
const c = await phone.context().newCDPSession(phone);
await c.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: Math.round(banditAt.x), y: Math.round(banditAt.y), id: 1 }] });
for (let i = 1; i <= 6; i++) {
  await c.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: Math.round(banditAt.x + 50 * i / 6), y: Math.round(banditAt.y), id: 1 }] });
  await phone.waitForTimeout(16);
}
await c.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
await c.detach();
await phone.waitForTimeout(80);
const afterPan = await card(phone);
check("phone.panStays", afterPan.grant === beforePan.grant && afterPan.name === beforePan.name, JSON.stringify(afterPan));

const fit = await phone.evaluate(() => {
  const reset = document.querySelector("[data-act='reset']");
  const menu = document.querySelector("[data-act='tokenCmd']");
  const rr = reset ? reset.getBoundingClientRect() : null;
  const mr = menu ? menu.getBoundingClientRect() : null;
  const w = window.innerWidth;
  return {
    reset: rr && { right: Math.round(rr.right), left: Math.round(rr.left), w },
    menu: mr && { right: Math.round(mr.right), left: Math.round(mr.left), w }
  };
});
check("phone.resetFits", fit.reset && fit.reset.left >= -1 && fit.reset.right <= fit.reset.w + 1, JSON.stringify(fit.reset));
check("phone.menuFits", !fit.menu || (fit.menu.left >= -1 && fit.menu.right <= fit.menu.w + 1), JSON.stringify(fit.menu));
await shot(phone, "phone-own");
await phoneCtx.close();
await browser.close();

if (failures.length) {
  console.log("FAILED " + failures.length);
  failures.forEach((line) => console.log(" - " + line));
  process.exit(1);
}
console.log("card follow 0.3.309 ok");

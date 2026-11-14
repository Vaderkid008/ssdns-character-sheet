/**
 * The token Move / Interact / Drop menu docks and remembers that choice.
 * Phone menus stay on screen and above the player drawer.
 * Sheet 0.3.309 / DMCC 0.2.322.
 *   node tools/test-token-menu-dock-03307.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "/tmp/pw/node_modules/playwright-core/index.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHROME = "/usr/local/bin/google-chrome";
const OUT = "/opt/cursor/artifacts/token-menu-dock";
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
  tokenId: "devil",
  name: "Dust Devil",
  ac: 13,
  hp: 11,
  maxHp: 11,
  speed: 40,
  attacks: [{ id: "bite", name: "Bite", kind: "melee", toHit: "+4", damage: "2d4+2 piercing", range: "5 ft" }],
  spells: []
};
const seed = {
  "map/public/tokens/ply_ada": {
    value: { id: "ply_ada", kind: "player", name: "Ada", ownerUid: "ada", ownerCanMove: true, playerActive: true, sceneId: "scn_dustyspur01", size: 1, pos: { x: 9, y: 8 }, color: "#c9a227" },
    seq: 1, by: "test"
  },
  "map/public/tokens/devil": {
    value: { id: "devil", kind: "npc", name: "Dust Devil", controlledBy: ["ada"], sceneId: "scn_dustyspur01", size: 1, pos: { x: 8, y: 8 }, color: "#8a5a2b" },
    seq: 1, by: "test"
  },
  "map/public/tokens/scorp": {
    value: { id: "scorp", kind: "enemy", name: "Giant Scorpion", sceneId: "scn_dustyspur01", size: 1, pos: { x: 8, y: 7 }, color: "#6a3a2a" },
    seq: 1, by: "test"
  },
  "inbox/ada/grant_devil": {
    value: { id: "grant_devil", ts: 1, type: "grant_sheet", to: "ada", tokenId: "devil", sheet: sheet },
    seq: 1, by: "test"
  }
};

async function shot(page, name) {
  await page.screenshot({ path: path.join(OUT, name + ".png"), timeout: 20000 });
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
      live: function () { return { joined: true, roomCode: "LOCAL", uid: "ada", local: true, seed: bag }; },
      postAttack: function (entry) { window.__grantAttack = entry; return Promise.resolve({ ok: true }); },
      postRoll: function () { return Promise.resolve({ ok: true }); },
      postDamage: function () { window.__grantDamage = true; return Promise.resolve({ ok: true }); }
    };
    window.SSDNSMapHost.targetAc = function (id) { return id === "scorp" ? 15 : null; };
    window.SSDNSMapHost.syncRoom();
  }, seed);
  await page.waitForFunction(() => {
    const boxes = window.SSDNSMapHost && window.SSDNSMapHost.tokenBoxes && window.SSDNSMapHost.tokenBoxes();
    return boxes && boxes.some((t) => t.id === "ply_ada") && boxes.some((t) => t.id === "devil");
  }, null, { timeout: 8000 });
  const tab = page.locator("#tab-map");
  if (await page.evaluate(() => matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0)) await tab.tap();
  else await tab.click();
  await page.waitForTimeout(250);
}
async function tapToken(page, id, touch) {
  const p = await page.evaluate((tokenId) => window.SSDNSMapHost.tokenScreen(tokenId), id);
  if (touch) {
    const c = await page.context().newCDPSession(page);
    await c.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: Math.round(p.x), y: Math.round(p.y), id: 1 }] });
    await page.waitForTimeout(30);
    await c.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await c.detach();
  } else {
    await page.mouse.click(p.x, p.y);
  }
  await page.waitForTimeout(150);
  return p;
}
async function layout(page) {
  return page.evaluate(() => {
    const menu = document.querySelector("[data-act='tokenCmd']");
    const card = document.querySelector("[data-act='playerCard']");
    const pressed = menu && menu.querySelector("[data-act='tokenCmdDock'][aria-pressed='true']");
    if (!menu || !card) return null;
    const m = menu.getBoundingClientRect();
    const c = card.getBoundingClientRect();
    const title = menu.querySelector(".ssm-card-bar b");
    const tr = title ? title.getBoundingClientRect() : null;
    const close = menu.querySelector("[data-menu-close]");
    const xr = close ? close.getBoundingClientRect() : null;
    const gridEl = document.querySelector(".ssdns-map > canvas");
    const g = gridEl ? gridEl.getBoundingClientRect() : null;
    const overlap = !(m.right <= c.left + 2 || m.left >= c.right - 2 || m.bottom <= c.top + 2 || m.top >= c.bottom - 2);
    const key = document.body.classList.contains("map-phone") ? "ssdns.tokenCmd.phone" : "ssdns.tokenCmd.desktop";
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(key) || "null"); } catch (e) { saved = null; }
    return {
      menu: {
        left: Math.round(m.left), top: Math.round(m.top), right: Math.round(m.right), bottom: Math.round(m.bottom),
        dock: menu.dataset.menuDock || "",
        mode: pressed ? pressed.getAttribute("data-mode") : "",
        title: title ? title.textContent : "",
        titleFull: !!(title && tr && title.textContent === "Token" && title.scrollWidth <= title.clientWidth + 1 && tr.width >= 36 && tr.left >= m.left - 1 && tr.right <= m.right + 1 && xr && xr.left >= tr.right - 1 && xr.right <= m.right + 1 && xr.width >= 16)
      },
      cardTop: Math.round(c.top),
      grid: g ? { left: Math.round(g.left), top: Math.round(g.top), right: Math.round(g.right), bottom: Math.round(g.bottom) } : null,
      overlap,
      vw: window.innerWidth,
      vh: window.innerHeight,
      onScreen: m.left >= -1 && m.top >= -1 && m.right <= window.innerWidth + 1 && m.bottom <= window.innerHeight + 1,
      saved
    };
  });
}
async function choose(page, mode) {
  const sel = page.locator("[data-act='tokenCmdDock'][data-mode='" + mode + "']");
  if (await sel.count() === 0) {
    check("dock.missing", false, mode);
    return;
  }
  const touch = await page.evaluate(() => matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0);
  if (touch) await sel.tap();
  else await sel.click();
  await page.waitForTimeout(80);
}

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
const desk = await browser.newContext({ viewport: { width: 1280, height: 800 }, hasTouch: false });
const page = await desk.newPage();
page.on("pageerror", (err) => console.log("pageerror desk", err.message));
await page.addInitScript(() => {
  if (sessionStorage.getItem("ssdnsDockBoot")) return;
  sessionStorage.setItem("ssdnsDockBoot", "1");
  localStorage.removeItem("ssdns.tokenCmd.desktop");
});
await openMap(page);
await tapToken(page, "ply_ada", false);
let box = await layout(page);
check("desk.default", box && box.menu.mode === "" && box.menu.titleFull && box.onScreen && !box.overlap && box.menu.dock === "", JSON.stringify(box && box.menu));
await shot(page, "desktop-float");
await choose(page, "bl");
box = await layout(page);
check("desk.bl", box && box.menu.mode === "bl" && box.menu.dock === "bl" && box.grid && box.menu.left <= box.grid.left + 16 && box.menu.bottom <= Math.min(box.vh, box.grid.bottom) + 2 && box.menu.bottom >= Math.min(box.vh, box.grid.bottom) - 48 && box.onScreen && !box.overlap, JSON.stringify(box));
await shot(page, "desktop-bl");
await choose(page, "br");
box = await layout(page);
check("desk.br", box && box.menu.mode === "br" && box.grid && box.menu.right >= Math.min(box.vw, box.grid.right) - 16 && box.menu.left > (box.grid.left + box.grid.right) / 2 && box.onScreen && !box.overlap, JSON.stringify(box));
await shot(page, "desktop-br");

await openMap(page);
await tapToken(page, "ply_ada", false);
box = await layout(page);
check("desk.remember", box && box.menu.mode === "br" && box.saved && box.saved.mode === "br" && box.onScreen, JSON.stringify(box));

await choose(page, "float");
const bar = page.locator("[data-act='tokenCmd'] [data-float-drag] b");
const from = await bar.boundingBox();
await page.mouse.move(from.x + 8, from.y + 8);
await page.mouse.down();
await page.mouse.move(from.x + 8 + 140, from.y + 8 + 40, { steps: 6 });
await page.mouse.up();
await page.waitForTimeout(80);
const dragged = await layout(page);
check("desk.drag", dragged && dragged.menu.mode === "float" && dragged.saved && dragged.saved.mode === "float" && dragged.saved.pos && dragged.onScreen, JSON.stringify(dragged && dragged.saved));
await openMap(page);
await tapToken(page, "ply_ada", false);
const restored = await layout(page);
check("desk.floatBack", restored && restored.menu.mode === "float" && Math.abs(restored.menu.left - dragged.menu.left) <= 24 && Math.abs(restored.menu.top - dragged.menu.top) <= 24, JSON.stringify({ now: restored && restored.menu, was: dragged && dragged.menu }));

await page.evaluate(() => {
  window.SSDNSMapHost.targetAc = function (id) { return id === "scorp" ? 15 : null; };
  const open = document.querySelector("[data-act='tokenCmd']");
  if (open) open.remove();
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
  window.__aim = window.SSDNSMapHost.aim("scorp");
  window.SSDNSMapHost.queueRolls([18, 2, 2]);
});
await page.waitForTimeout(100);
const bite = page.locator("[data-act='playerAttack']").first();
await bite.click();
await page.waitForTimeout(80);
const biteView = await page.evaluate(() => {
  const log = document.querySelector("[data-act='chatlog']");
  const toast = document.querySelector("[data-act='toast']") || document.querySelector(".ssm-toast");
  const attack = window.__grantAttack || null;
  return {
    chat: log ? log.textContent.replace(/\s+/g, " ").trim() : "",
    toast: toast ? toast.textContent.replace(/\s+/g, " ").trim() : "",
    amount: attack && attack.amount,
    faces: attack && attack.dmgFaces,
    damagePosted: !!window.__grantDamage,
    line: (window.SSDNSMapHost.grantLog().slice(-1)[0] || {}).line || "",
    aim: window.__aim || null,
    picked: (document.querySelector("[data-act='n62Target']") || {}).value || "",
    choices: [...document.querySelectorAll("#atkTarget option, [data-act='n62Target'] option")].map((o) => o.value).slice(0, 12)
  };
});
check("bite.chat", biteView.line.indexOf("HIT") >= 0 && biteView.line.indexOf("= 6") >= 0 && biteView.amount === 6 && biteView.faces && biteView.faces.join(",") === "2,2" && biteView.damagePosted === false, JSON.stringify(biteView));
check("bite.visible", (biteView.chat + " " + biteView.toast).indexOf("6") >= 0, JSON.stringify(biteView));
await shot(page, "desktop-bite");
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
await phone.addInitScript(() => {
  if (sessionStorage.getItem("ssdnsDockBoot")) return;
  sessionStorage.setItem("ssdnsDockBoot", "1");
  localStorage.setItem("ssdns.tokenCmd.desktop", JSON.stringify({ mode: "bl", pos: null }));
  localStorage.removeItem("ssdns.tokenCmd.phone");
});
await openMap(phone);
await phone.waitForFunction(() => document.body.classList.contains("map-phone"), null, { timeout: 4000 });
const phoneTap = await tapToken(phone, "devil", true);
box = await layout(phone);
if (!box) {
  const why = await phone.evaluate((pt) => {
    const n = document.elementFromPoint(pt.x, pt.y);
    return { pt, hit: n ? (n.id || n.getAttribute("data-act") || n.tagName) : "none", boxes: window.SSDNSMapHost.tokenBoxes().map((t) => ({ id: t.id, x: t.x, y: t.y })) };
  }, phoneTap);
  console.log("phone tap miss", JSON.stringify(why));
}
check("phone.default", box && box.menu.mode === "" && box.menu.titleFull && box.onScreen && !box.overlap && box.menu.bottom <= box.cardTop + 2, JSON.stringify(box && box.menu));
await shot(phone, "phone-float");
await choose(phone, "bl");
box = await layout(phone);
check("phone.bl", box && box.menu.mode === "bl" && box.menu.titleFull && box.menu.left <= 10 && box.cardTop - box.menu.bottom <= 8 && box.cardTop - box.menu.bottom >= -1 && box.onScreen && !box.overlap, JSON.stringify(box));
await shot(phone, "phone-bl");
await phone.evaluate(() => {
  const card = document.querySelector("[data-act='playerCard']");
  if (card) card.classList.remove("min");
});
await choose(phone, "br");
box = await layout(phone);
check("phone.br", box && box.menu.mode === "br" && box.menu.titleFull && box.menu.right >= box.vw - 10 && box.menu.left > box.vw * 0.35 && box.cardTop - box.menu.bottom <= 8 && box.cardTop - box.menu.bottom >= -1 && box.onScreen && !box.overlap, JSON.stringify(box));
check("phone.key", box && box.saved && box.saved.mode === "br", JSON.stringify(box && box.saved));
await shot(phone, "phone-br");
await openMap(phone);
await phone.waitForFunction(() => document.body.classList.contains("map-phone"), null, { timeout: 4000 });
await tapToken(phone, "devil", true);
box = await layout(phone);
check("phone.remember", box && box.menu.mode === "br" && box.onScreen && !box.overlap, JSON.stringify(box));
await phoneCtx.close();
await browser.close();

if (failures.length) {
  console.log("FAILED " + failures.length);
  failures.forEach((line) => console.log(" - " + line));
  process.exit(1);
}
console.log("token menu dock 0.3.309 ok");

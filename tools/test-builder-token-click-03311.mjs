/**
 * Opening the Scene Builder must not swallow token clicks.
 * Sheet 0.3.312 / DMCC 0.2.325.
 *   node tools/test-builder-token-click-03311.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const failures = [];
function check(id, cond, detail) {
  if (!cond) failures.push(id + (detail ? " — " + detail : ""));
  console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + detail : ""));
}
const ver = JSON.parse(read("version.json"));
check("ver", ver.sheet === "0.3.312" && ver.dmcc === "0.2.325" && ver.sheetBuild === "sheet-playtest-v03312" && ver.dmccBuild === "dmcc-playtest-v02325");
check("rules.clean", !read("assets/data/rules.js").includes("placeBanner") && !read("database.rules.json").includes("ssm-scene-open"));

const OUT = "/opt/cursor/artifacts/builder-clicks";
fs.mkdirSync(OUT, { recursive: true });

const { chromium } = await import("/tmp/pw/node_modules/playwright-core/index.mjs");
const browser = await chromium.launch({ executablePath: "/usr/local/bin/google-chrome", headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on("pageerror", (err) => check("page.err", false, err.message));
await page.goto("http://127.0.0.1:8765/dm/index.html?demo=1", { waitUntil: "domcontentloaded" });
await page.locator("#btnLoadDemo").click({ force: true });
await page.waitForTimeout(700);
await page.evaluate(() => document.querySelector("#tab-map").click());
await page.waitForFunction(() => window.SSDNSMapHost && window.SSDNSMapHost.tokensLoaded && window.SSDNSMapHost.tokensLoaded(), { timeout: 15000 });
await page.evaluate(() => document.querySelector("#mapMount").scrollIntoView({ block: "center" }));
await page.evaluate(() => {
  const chip = [].find.call(document.querySelectorAll("[data-floor]"), (b) => b.getAttribute("data-floor") === "scn_dustyspur01");
  if (chip) chip.click();
});
await page.waitForTimeout(400);
await page.evaluate(() => window.SSDNSMapHost.lookAt(11, 2, 1.3));
await page.waitForTimeout(150);

async function tokenPoint(prefer) {
  return page.evaluate((label) => {
    const boxes = window.SSDNSMapHost.tokenBoxes();
    const canvas = document.querySelector("#mapMount > canvas").getBoundingClientRect();
    const pick = boxes.find((b) => b.label === label) || boxes.find((b) => b.kind === "player") || boxes[0];
    if (!pick) return null;
    const s = window.SSDNSMapHost.tokenScreen(pick.id);
    return { id: pick.id, label: pick.label, x: s.x, y: s.y, sceneId: pick.sceneId, onCanvas: s.x >= canvas.left && s.x <= canvas.right && s.y >= canvas.top && s.y <= canvas.bottom };
  }, prefer || "JP");
}
function topAt(x, y) {
  return page.evaluate(({ x, y }) => {
    const list = document.elementsFromPoint(x, y);
    for (let i = 0; i < list.length; i++) {
      const n = list[i];
      if (getComputedStyle(n).pointerEvents === "none") continue;
      return n.getAttribute("data-act") || n.tagName;
    }
    return "";
  }, { x, y });
}
async function openBuilder() {
  await page.evaluate(() => {
    const menu = document.querySelector("[data-act='mapsBtn']");
    if (menu) menu.click();
  });
  await page.waitForTimeout(80);
  await page.evaluate(() => document.querySelector("[data-act='sceneBuilderBtn']").click());
  await page.waitForSelector("[data-act='sceneBuilder']");
}
async function closeBuilder() {
  const btn = await page.$("[data-act='sceneClose']");
  if (btn) await btn.click();
  await page.waitForTimeout(150);
}

const spot = await tokenPoint("JP");
check("token.ready", !!(spot && spot.onCanvas), JSON.stringify(spot));
await openBuilder();
await page.evaluate(() => window.SSDNSMapHost.lookAt(11, 2, 1.3));
await page.waitForTimeout(150);
const moved = await tokenPoint("JP");
const top = await topAt(moved.x, moved.y);
check("open.notCovered", moved.onCanvas && top === "CANVAS", top + " @" + JSON.stringify(moved));
await page.mouse.click(moved.x, moved.y);
await page.waitForTimeout(200);
check("open.menu", !!(await page.$("[data-act='tokenCmd']")) && !!(await page.$("[data-act='sceneBuilder']")));
await closeBuilder();
check("closed.gone", !(await page.$("[data-act='sceneBuilder']")) && !(await page.$("[data-act='placeBanner']:not([hidden])")));
await page.keyboard.press("Escape");
await page.waitForTimeout(100);
const again = await tokenPoint("JP");
await page.mouse.click(again.x, again.y);
await page.waitForTimeout(200);
check("closed.menu", !!(await page.$("[data-act='tokenCmd']")), await topAt(again.x, again.y));
await page.screenshot({ path: path.join(OUT, "menu-after-close.png"), timeout: 20000 });

await openBuilder();
await page.evaluate(() => {
  const panel = () => document.querySelector("[data-act='sceneBuilder']");
  const add = (id) => {
    const pick = panel().querySelector("[data-act='floorPick']");
    pick.value = id;
    panel().querySelector("[data-act='floorAdd']").click();
  };
  add("scn_dustyspur01");
  add("scn_upstairs");
  panel().querySelector("[data-act='linkPlace']").click();
});
await page.waitForTimeout(100);
check("armed.banner", await page.evaluate(() => {
  const b = document.querySelector("[data-act='placeBanner']");
  return !!(b && !b.hidden && /link/i.test(b.textContent));
}));
await closeBuilder();
check("disarmed", await page.evaluate(() => {
  const b = document.querySelector("[data-act='placeBanner']");
  return !document.querySelector("[data-act='sceneBuilder']") && (!b || b.hidden);
}));
const afterArm = await tokenPoint("JP");
await page.mouse.click(afterArm.x, afterArm.y);
await page.waitForTimeout(200);
check("afterArm.menu", !!(await page.$("[data-act='tokenCmd']")));

await openBuilder();
await page.evaluate(() => {
  const panel = () => document.querySelector("[data-act='sceneBuilder']");
  const add = (id) => {
    const pick = panel().querySelector("[data-act='floorPick']");
    pick.value = id;
    panel().querySelector("[data-act='floorAdd']").click();
  };
  add("scn_dustyspur01");
  add("scn_upstairs");
  panel().querySelector("[data-act='linkPlace']").click();
  window.SSDNSSceneBuilder.dropLink(8, 8);
  const dest = window.SSDNSSceneBuilder.draft().floors[1];
  const sel = panel().querySelector("[data-act='linkDest']");
  sel.value = dest.id;
  sel.dispatchEvent(new Event("change", { bubbles: true }));
  panel().querySelector("[data-act='linkLand']").click();
  window.SSDNSSceneBuilder.dropLink(12, 8);
});
await page.evaluate(() => {
  const chip = [].find.call(document.querySelectorAll("[data-floor]"), (b) => b.getAttribute("data-floor") === "scn_dustyspur01");
  if (chip) chip.click();
  window.SSDNSMapHost.lookAt(12, 2, 1);
});
await page.waitForTimeout(200);
const picks = await page.evaluate(() => {
  const canvas = document.querySelector("#mapMount > canvas").getBoundingClientRect();
  return window.SSDNSMapHost.tokenBoxes().filter((b) => b.kind === "player").map((b) => {
    const s = window.SSDNSMapHost.tokenScreen(b.id);
    return { id: b.id, label: b.label, x: s.x, y: s.y, onCanvas: s.x >= canvas.left + 8 && s.x <= canvas.right - 8 && s.y >= canvas.top + 8 && s.y <= canvas.bottom - 8 };
  }).filter((b) => b.onCanvas).slice(0, 2);
});
check("pick.onmap", picks.length === 2, JSON.stringify(picks));
if (picks.length === 2) {
  await page.mouse.click(picks[0].x, picks[0].y);
  await page.waitForTimeout(200);
  await page.evaluate((id) => {
    const menu = document.querySelector("[data-act='tokenCmd']");
    if (menu) menu.remove();
    const box = window.SSDNSMapHost.tokenBoxes().find((b) => b.id === id);
    if (box) window.SSDNSMapHost.lookAt(box.x, box.y, 1);
  }, picks[1].id);
  await page.waitForTimeout(150);
  const second = await page.evaluate((id) => window.SSDNSMapHost.tokenScreen(id), picks[1].id);
  await page.evaluate(({ x, y }) => {
    const canvas = document.querySelector("#mapMount > canvas");
    const common = { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, pointerId: 1, pointerType: "mouse", ctrlKey: true };
    canvas.dispatchEvent(new PointerEvent("pointerdown", common));
    canvas.dispatchEvent(new PointerEvent("pointerup", common));
  }, second);
}
await page.waitForTimeout(120);
await page.evaluate(() => document.querySelector("[data-act='linkTake']").click());
await page.waitForTimeout(300);
const arrived = await page.evaluate(() => window.SSDNSMapHost.tokenBoxes().filter((b) => b.kind === "player").map((b) => b.label + "@" + b.sceneId + ":" + b.x + "," + b.y));
check("take.arrived", arrived.some((row) => row.indexOf("scn_upstairs:12,8") >= 0) && arrived.length >= 2, arrived.join(" | "));
await page.evaluate(() => {
  const menu = document.querySelector("[data-act='tokenCmd']");
  if (menu) menu.remove();
  document.querySelectorAll(".ssdns-leftbar, .ssdns-rightbar, [data-act='sceneBuilder'], .ssm-drawer").forEach((n) => { n.style.display = "none"; });
  const mount = document.querySelector("#mapMount");
  mount.style.gridTemplateColumns = "1fr";
  mount.style.gridTemplateAreas = '"strip" "bar" "dice" "stage" "dock"';
  window.SSDNSMapHost.lookAt(12, 8, 1.2);
});
await page.waitForTimeout(300);
await page.locator("#mapMount").screenshot({ path: path.join(OUT, "take-link.png"), timeout: 20000 });
await browser.close();

if (failures.length) {
  console.log("FAILED " + failures.length);
  failures.forEach((line) => console.log(" - " + line));
  process.exit(1);
}
console.log("builder token click 0.3.312 ok");

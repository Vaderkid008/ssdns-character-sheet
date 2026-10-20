/**
 * 0.3.89: the paper doll shows on a fresh page load at phone width (Jessey 2026-10-20 3:44 PM CT: "paper doll is not showing up on mobile").
 * Cause: boot's first renderFields ran before window.SSDNSApp existed, so SSDNSDoll.paint() found no character and left #dollHost
 * empty until some later edit repainted. This test never edits the sheet on the measured page, so it catches that again.
 *  - blank sheet and a saved character, at 390x844 and 360x800 (touch, mobile): Gear tab shows the doll frame with all 25 slots
 *  - the doll fits the phone width and has real height; desktop 1400 still shows it
 * Needs the static server on 127.0.0.1:8765 and Chrome (ssdns-test-all starts the server).
 *   node tools/test-doll-mobile.mjs
 */
import net from "node:net";
const ORIGIN = process.env.SSDNS_ORIGIN || "http://127.0.0.1:8765";
const failures = [];
const J = (x) => JSON.stringify(x);
function check(id, cond, detail) { if (!cond) failures.push(id); console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + detail : "")); }
function portOpen(port, host) { return new Promise((r) => { const s = net.connect({ port, host }, () => { s.end(); r(true); }); s.on("error", () => r(false)); }); }
const u = new URL(ORIGIN);
if (!(await portOpen(Number(u.port), u.hostname))) { console.log("Static server is not listening on " + ORIGIN + " (run via ssdns-test-all)"); process.exit(1); }
const puppeteer = (await import("/tmp/pup/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js")).default;
const browser = await puppeteer.launch({ executablePath: "/opt/google/chrome/chrome", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const ready = (pg) => pg.waitForFunction(() => window.SSDNSApp && window.SSDNSDoll && document.querySelector("#dollHost") && document.querySelector("#tab-equip"), { timeout: 20000 });
/* open the sheet at a viewport, touch nothing but the Gear tab, and measure the doll */
async function look(w, h, mobile, act) {
  const pg = await browser.newPage();
  const errs = [];
  pg.on("pageerror", (e) => errs.push(String(e)));
  await pg.setViewport({ width: w, height: h, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1 });
  await pg.goto(ORIGIN + "/index.html", { waitUntil: "domcontentloaded" });
  await ready(pg); await wait(1200);
  await pg.evaluate(() => { document.querySelector("#tab-equip").click(); });
  await wait(400);
  const before = await pg.evaluate(() => document.querySelectorAll("#dollHost .doll-slot").length);
  if (act) { await pg.evaluate(act); await wait(800); }
  const m = await pg.evaluate(() => {
    const host = document.getElementById("dollHost"), doll = host.querySelector(".doll");
    const b = (doll || host).getBoundingClientRect();
    const c = window.SSDNSApp.doc().character;
    return { inv: (c.inventory || []).length, guns: (c.guns || []).filter((g) => g && g.weapon).length, filled: host.querySelectorAll(".doll-slot.filled").length, slots: host.querySelectorAll(".doll-slot").length, w: Math.round(b.width), h: Math.round(b.height), l: Math.round(b.left), r: Math.round(b.right),
      frame: doll ? getComputedStyle(doll).backgroundImage : "", shown: !!doll && doll.offsetParent !== null && getComputedStyle(doll).visibility !== "hidden",
      vw: window.innerWidth, overflow: document.documentElement.scrollWidth > window.innerWidth + 1 };
  });
  await pg.close(); /* one tab at a time: the sheet syncs across tabs */
  m.before = before;
  return { m, errs };
}
function judge(tag, { m, errs }) {
  check(tag + ".paintedOnLoad", m.before === 25, J(m));
  check(tag + ".dollPainted", m.slots === 25 && /url\(/.test(m.frame), J(m));
  check(tag + ".dollVisible", m.shown && m.h > 200 && m.w > 200, J(m));
  check(tag + ".fitsWidth", m.l >= 0 && m.r <= m.vw + 1 && !m.overflow, J(m));
  check(tag + ".noPageErrors", errs.length === 0, errs.join(" | "));
}
try {
  /* fresh sheet, empty inventory, no kit: the empty doll still shows all its slots */
  const blank = await look(390, 844, true);
  check("blank.emptyInventory", blank.m.inv === 0 && blank.m.guns === 0 && blank.m.filled === 0, J(blank.m));
  judge("blank.phone390", blank);
  judge("blank.desktop", await look(1400, 1000, false));
  /* apply a starting kit on the phone: still 25 slots, gear lands in them */
  const kit = await look(390, 844, true, () => window.SSDNSApp.applyPatch((d) => { const c = d.character; c.calling = "gunslinger"; c.level = 1; window.SSDNSKits.apply(c, "gunslinger", {}); c.kitStamp = "gunslinger"; }));
  check("kit.gearArrived", kit.m.guns > 0 || kit.m.inv > 0, J(kit.m));
  judge("kit.phone390", kit);
  /* save a character on one page, close it, then load fresh (the saved-sheet boot path) */
  const seed = await browser.newPage();
  await seed.goto(ORIGIN + "/index.html", { waitUntil: "domcontentloaded" });
  await ready(seed); await wait(800);
  await seed.evaluate(() => window.SSDNSApp.applyPatch((d) => { const c = d.character; c.name = "Dust"; c.calling = "gunslinger"; c.level = 3; c.lineage = "farmers"; }));
  await wait(1200);
  await seed.close();
  judge("saved.phone390", await look(390, 844, true));
  judge("saved.phone360", await look(360, 800, true));
  judge("saved.desktop", await look(1400, 1000, false));
} finally {
  await browser.close();
}
if (failures.length) { console.log("\n" + failures.length + " failed: " + failures.join(", ")); process.exit(1); }
console.log("\nall paper doll mobile checks passed");

/**
 * 0.3.108 / 0.2.121: Jessey's UI notes (2026-10-19 9:36 PM CT, steering 9:38 PM CT).
 *  1. DMCC dice tray: the rolled die art and "1d4 = 4" sit inline to the right of the dice buttons; a roll never
 *     changes the dice bar / tray height (no new row below the bar).
 *  2. DMCC tabs: Ledger (economy) is the last tab, after Map.
 *  3. Sheet tabs: Main, Backstory, Gear, Spells, Conditions, Map, Store, Log (paper-page numbers dropped);
 *     switching, the saved tab, arrow keys and the remote "Go to store" click still work.
 *  4. Table feed / player chat: one plain die reads [one numbered die] "1d4 = 4" (no "d4 ·", no blank die, no "(4)");
 *     pools and modified rolls keep their breakdown. Checked for d4, d6, d8, d10, d12, d20 and d100.
 * Needs the static server on 127.0.0.1:8765 and Chrome (ssdns-test-all starts the server).
 *   node tools/test-ui-notes.mjs
 */
import net from "node:net";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ORIGIN = process.env.SSDNS_ORIGIN || "http://127.0.0.1:8765";
const failures = [];
const J = (x) => JSON.stringify(x);
function check(id, cond, detail) { if (!cond) failures.push(id); console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + detail : "")); }

/* ---- pure: tidySingle (player chat path for rows written by an older DMCC) */
const Dice = require("../assets/js/dice-art.js") || globalThis.SSDNSDice;
const T = (Dice && Dice.tidySingle) || (globalThis.SSDNSDice && globalThis.SSDNSDice.tidySingle);
check("tidy.exists", typeof T === "function");
if (T) {
  check("tidy.oldDm", T("d4 1d4 = 4 (4)") === "1d4 = 4", T("d4 1d4 = 4 (4)"));
  check("tidy.dot", T("d20 · 1d20 = 17 (17)") === "1d20 = 17");
  check("tidy.plain", T("1d6 = 3") === "1d6 = 3");
  check("tidy.d100", T("d100 1d100 = 73 (73)") === "1d100 = 73");
  check("tidy.keepsPool", T("Roll 2d6+1 = 9 (3 + 5 + 1)") === "Roll 2d6+1 = 9 (3 + 5 + 1)");
  check("tidy.keepsMismatch", T("d4 1d4 = 4 (3)") === "d4 1d4 = 4 (3)");
  check("tidy.keepsLabel", T("Perception 1d20 = 14 (14)") === "Perception 1d20 = 14 (14)");
  check("tidy.keepsAttack", T("Ada attacks Bo: d20 «14» + 3 = 17 vs AC 15 → HIT") === "Ada attacks Bo: d20 «14» + 3 = 17 vs AC 15 → HIT");
}

function portOpen(port, host) { return new Promise((r) => { const s = net.connect({ port, host }, () => { s.end(); r(true); }); s.on("error", () => r(false)); }); }
const u = new URL(ORIGIN);
if (!(await portOpen(Number(u.port), u.hostname))) { console.log("Static server is not listening on " + ORIGIN + " (run via ssdns-test-all)"); process.exit(1); }
const puppeteer = (await import("/tmp/pup/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js")).default;
const browser = await puppeteer.launch({ executablePath: "/opt/google/chrome/chrome", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const errs = [];

/* ---- DMCC */
const dm = await browser.newPage(); await dm.setViewport({ width: 1400, height: 900 });
dm.on("pageerror", (e) => errs.push("dm " + String(e)));
await dm.goto(ORIGIN + "/dm/index.html?demo=1", { waitUntil: "domcontentloaded" });
await dm.waitForFunction(() => window.DMCC && document.querySelector("#btnLoadDemo") && document.querySelector('#diceBar [data-die="4"]'), { timeout: 20000 });
await dm.evaluate(() => document.querySelector("#btnLoadDemo").click());
await dm.waitForFunction(() => window.DMCC.state.demo, { timeout: 20000 });
await wait(1000);

const dmTabs = await dm.evaluate(() => [...document.querySelectorAll("nav.tabs .tab")].map((t) => t.id));
check("dmcc.tabs.order", J(dmTabs) === J(["tab-table", "tab-rewards", "tab-rolls", "tab-fight", "tab-store", "tab-lookup", "tab-music", "tab-notes", "tab-map", "tab-ledger"]), J(dmTabs));
check("dmcc.tabs.ledgerLast", await dm.evaluate(() => { const t = [...document.querySelectorAll("nav.tabs .tab")]; return t[t.length - 1].textContent.trim() === "Ledger (economy)" && t[t.length - 2].id === "tab-map"; }));
const ledgerOpen = await dm.evaluate(async () => {
  document.querySelector("#tab-ledger").click(); await new Promise((r) => setTimeout(r, 150));
  const a = document.querySelector("#tab-ledger").getAttribute("aria-selected") === "true" && !document.querySelector("#panel-ledger").hidden;
  document.querySelector("#tab-map").click(); await new Promise((r) => setTimeout(r, 150));
  const b = document.querySelector("#tab-map").getAttribute("aria-selected") === "true" && !document.querySelector("#panel-map").hidden && document.querySelector("#panel-ledger").hidden;
  document.querySelector("#tab-table").click(); await new Promise((r) => setTimeout(r, 150));
  return a && b && !document.querySelector("#panel-table").hidden;
});
check("dmcc.tabs.switch", ledgerOpen);

const box = (sel) => dm.evaluate((s) => { const n = document.querySelector(s); if (!n) return null; const b = n.getBoundingClientRect(); return { t: Math.round(b.top), b: Math.round(b.bottom), l: Math.round(b.left), r: Math.round(b.right), h: Math.round(b.height) }; }, sel);
const tray0 = (await box("#diceTray")) || (await box("#diceBar")), bar0 = await box("#diceBar"), main0 = await box("nav.tabs");
check("dice.tray", !!tray0 && !!bar0 && tray0.h > 0, J({ tray0, bar0 }));
for (const n of [4, 6, 8, 10, 12, 20, 100]) {
  await dm.click('#diceBar [data-die="' + n + '"]');
  await wait(350);
  const tray = (await box("#diceTray")) || (await box("#diceBar")), bar = await box("#diceBar"), stage = await box("#diceStage"), tabs = await box("nav.tabs");
  const btns = await dm.evaluate(() => { const b = [...document.querySelectorAll("#diceBar .dice-bar-btn")].map((x) => x.getBoundingClientRect()); return { r: Math.round(Math.max(...b.map((x) => x.right))), t: Math.round(Math.min(...b.map((x) => x.top))), b: Math.round(Math.max(...b.map((x) => x.bottom))) }; });
  check("dice.d" + n + ".noShift", tray.h === tray0.h && bar.h === bar0.h && tabs.t === main0.t, J({ tray0, tray, bar0, bar, main0: main0.t, tabs: tabs.t }));
  check("dice.d" + n + ".inline", stage.h > 0 && stage.l >= btns.r - 1 && stage.t >= tray.t - 1 && stage.b <= tray.b + 1, J({ stage, btns, tray }));
  const st = await dm.evaluate(() => { const s = document.querySelector("#diceStage"); const f = [...s.querySelectorAll(".die-face")]; const line = s.querySelector(".dice-stage-line");
    const lr = line && line.getBoundingClientRect(), fr = f[0] && f[0].getBoundingClientRect();
    return { faces: f.length, sides: f[0] && f[0].getAttribute("data-sides"), num: f[0] && f[0].querySelector(".die-num text") && f[0].querySelector(".die-num text").textContent, line: line && line.textContent, lineRightOfDie: !!(lr && fr && lr.left >= fr.right - 1 && Math.abs((lr.top + lr.bottom) / 2 - (fr.top + fr.bottom) / 2) < 14), img: !!(f[0] && f[0].querySelector("img") && f[0].querySelector("img").complete && f[0].querySelector("img").naturalWidth > 0) }; });
  const m = String(st.line || "").match(new RegExp("^1d" + n + " = (\\d+)$"));
  check("dice.d" + n + ".stage", st.faces === 1 && st.sides === String(n) && !!m && Number(m[1]) >= 1 && Number(m[1]) <= n && st.num === m[1] && st.lineRightOfDie, J(st));
  check("dice.d" + n + ".art", st.img, J(st));
  /* Table feed + rolls dock: one numbered die, "1dN = x" only */
  const feed = await dm.evaluate((want) => { const one = (sel) => { const all = [...document.querySelectorAll(sel)].filter((x) => x.textContent.indexOf(want) >= 0); const n = all[all.length - 1]; if (!n) return null; const f = [...n.querySelectorAll(".die-face")];
      return { text: ((c) => { c.querySelectorAll(".die-num").forEach((x) => x.remove()); return c.textContent; })(n.cloneNode(true)).replace(/\s+/g, " ").trim(), faces: f.length, numbered: f.filter((x) => x.querySelector(".die-num")).length, sides: f.map((x) => x.getAttribute("data-sides")), num: f[0] && f[0].querySelector(".die-num text") ? f[0].querySelector(".die-num text").textContent : null }; };
    return { feed: one(".feed-item .feed-what"), dock: one(".dock-item.dock-rolls > div:last-child") }; }, "1d" + n + " = " + (m && m[1]));
  for (const k of ["feed", "dock"]) {
    const f = feed[k];
    const ok = f && f.faces === 1 && f.numbered === 1 && f.sides[0] === String(n) && f.text === "1d" + n + " = " + (m && m[1]) && f.num === (m && m[1]);
    check("feed.d" + n + "." + k + ".single", ok, J(f));
    check("feed.d" + n + "." + k + ".noEcho", f && !/\(\d+\)/.test(f.text) && !/d\d+ ·/.test(f.text), J(f));
  }
}
/* pools and modified rolls keep the breakdown */
const multi = await dm.evaluate(async () => {
  const seq = [0.34, 0.7]; let i = 0;
  const rolled = window.SSDNSDice.rollPool([{ sides: 6, count: 2 }], 1, () => seq[i++ % seq.length]);
  window.SSDNSDice.onBarRoll(rolled);
  await new Promise((r) => setTimeout(r, 300));
  const n = [...document.querySelectorAll(".feed-item .feed-what")].filter((x) => x.textContent.indexOf("2d6+1 = ") >= 0).pop();
  return { text: ((c) => { c.querySelectorAll(".die-num").forEach((x) => x.remove()); return c.textContent; })(n.cloneNode(true)).replace(/\s+/g, " ").trim(), faces: n.querySelectorAll(".die-face").length, rolled: { formula: rolled.formula, total: rolled.total, faces: rolled.faces } };
});
check("feed.multi.breakdown", multi.rolled.formula === "2d6+1" && multi.text.indexOf("2d6+1 = " + multi.rolled.total + " (" + multi.rolled.faces.join(" + ") + " + 1)") >= 0 && multi.faces === 2, J(multi));
const modOne = await dm.evaluate(async () => {
  const rolled = window.SSDNSDice.rollPool([{ sides: 20, count: 1 }], 2, () => 0.5);
  window.SSDNSDice.onBarRoll(rolled);
  await new Promise((r) => setTimeout(r, 300));
  const n = [...document.querySelectorAll(".feed-item .feed-what")].filter((x) => x.textContent.indexOf("d20+2 = ") >= 0).pop();
  return { text: ((c) => { c.querySelectorAll(".die-num").forEach((x) => x.remove()); return c.textContent; })(n.cloneNode(true)).replace(/\s+/g, " ").trim(), faces: n.querySelectorAll(".die-face").length };
});
check("feed.modified.breakdown", /1?d20\+2 = 13 \(11 \+ 2\)/.test(modOne.text) && modOne.faces === 1, J(modOne));
/* a labelled single die keeps its label, drops only the repeated face */
const labelled = await dm.evaluate(async () => {
  window.DMCC.pushRoll && await window.DMCC.pushRoll({ who: "DM", label: "Perception", formula: "1d20", result: 14, face: 14, rolls: [14], detail: "14", uid: "demo_dm" });
  await new Promise((r) => setTimeout(r, 300));
  const n = [...document.querySelectorAll(".feed-item .feed-what")].filter((x) => x.textContent.indexOf("Perception") >= 0 && x.textContent.indexOf("1d20 = 14") >= 0).pop();
  if (!n) return { has: !!window.DMCC.pushRoll, text: null };
  return { has: !!window.DMCC.pushRoll, text: ((c) => { c.querySelectorAll(".die-num").forEach((x) => x.remove()); return c.textContent; })(n.cloneNode(true)).replace(/\s+/g, " ").trim(), faces: n.querySelectorAll(".die-face").length };
});
if (labelled.has) check("feed.labelled", labelled.text === "Perception · 1d20 = 14" && labelled.faces === 1, J(labelled));
/* the tray stays one row at 1400 px after a 12-die pool too */
await dm.evaluate(() => { const r = window.SSDNSDice.rollPool([{ sides: 6, count: 12 }], 0, Math.random); window.SSDNSDice.show(r); });
await wait(200);
check("dice.pool12.noShift", (await box("#diceTray")).h === tray0.h, J(await box("#diceTray")));
await dm.close();

/* ---- Sheet */
const sh = await browser.newPage(); await sh.setViewport({ width: 1400, height: 900 });
sh.on("pageerror", (e) => errs.push("sheet " + String(e)));
await sh.goto(ORIGIN + "/index.html", { waitUntil: "domcontentloaded" });
await sh.waitForFunction(() => window.SSDNSApp && document.querySelector("#tab-main") && window.SSDNSSheet, { timeout: 20000 });
await wait(800);
const sheetTabs = await sh.evaluate(() => [...document.querySelectorAll("nav.tabs .tab")].map((t) => ({ id: t.id, text: t.textContent.trim() })));
check("sheet.tabs.order", J(sheetTabs.map((t) => t.id)) === J(["tab-main", "tab-story", "tab-equip", "tab-hex", "tab-cond", "tab-map", "tab-store", "tab-log"]), J(sheetTabs));
const words = sheetTabs.map((t) => t.text);
check("sheet.tabs.labels", words[0] === "Main" && words[1] === "Backstory" && words[2] === "Gear" && /^Spells( & .+)?$/.test(words[3]) && words[4] === "Conditions" && words[5] === "Map" && words[6] === "Store" && words[7] === "Log", J(words));
check("sheet.tabs.noNumbers", words.every((w) => !/^\d\s*·/.test(w)), J(words));
const sw = await sh.evaluate(async () => {
  const out = {};
  for (const t of [...document.querySelectorAll("nav.tabs .tab")]) {
    t.click(); await new Promise((r) => setTimeout(r, 60));
    const others = [...document.querySelectorAll("nav.tabs .tab")].filter((x) => x !== t);
    out[t.id] = t.getAttribute("aria-selected") === "true" && !document.getElementById(t.getAttribute("aria-controls")).hidden &&
      others.every((x) => x.getAttribute("aria-selected") === "false" && document.getElementById(x.getAttribute("aria-controls")).hidden) &&
      sessionStorage.getItem("ssdns.tab") === t.id;
  }
  return out;
});
check("sheet.tabs.switch+saved", Object.values(sw).length === 8 && Object.values(sw).every(Boolean), J(sw));
const keys = await sh.evaluate(async () => {
  const seen = [];
  document.querySelector("#tab-main").click(); document.querySelector("#tab-main").focus();
  for (let i = 0; i < 8; i++) {
    document.activeElement.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    await new Promise((r) => setTimeout(r, 30));
    seen.push(document.activeElement.id);
  }
  document.activeElement.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
  seen.push(document.activeElement.id);
  return seen;
});
check("sheet.tabs.arrows", J(keys) === J(["tab-story", "tab-equip", "tab-hex", "tab-cond", "tab-map", "tab-store", "tab-log", "tab-main", "tab-log"]), J(keys));
const store = await sh.evaluate(async () => {
  document.querySelector("#tab-main").click();
  document.querySelector("#tab-store").click(); /* the DM "open_store" / "Go" toast path clicks #tab-store */
  await new Promise((r) => setTimeout(r, 60));
  return document.body.classList.contains("store-tab-active") && !document.querySelector("#page-store").hidden && document.querySelector("#page-main").hidden;
});
check("sheet.tabs.remoteStore", store);
/* player chat: an older DMCC row "d4 1d4 = 4 (4)" is tidied before it is logged, and renders one numbered die */
const chat = await sh.evaluate(async () => {
  const text = window.SSDNSDice.tidySingle("d4 1d4 = 4 (4)");
  window.SSDNSSheet.addLog({ id: "roll:uinotes", kind: "roll", text: text, ts: new Date().toISOString(), who: "DM" });
  document.querySelector("#tab-log").click();
  await new Promise((r) => setTimeout(r, 300));
  const rows = [...document.querySelectorAll("#page-log *")].filter((n) => n.children.length < 8 && /1d4 = 4/.test(n.textContent) && n.querySelector(".die-face"));
  const n = rows[rows.length - 1];
  if (!n) return null;
  return { text: ((c) => { c.querySelectorAll(".die-num").forEach((x) => x.remove()); return c.textContent; })(n.cloneNode(true)).replace(/\s+/g, " ").trim(), faces: n.querySelectorAll(".die-face").length, numbered: n.querySelectorAll(".die-face .die-num").length };
});
check("chat.single", !!chat && chat.faces === 1 && chat.numbered === 1 && /1d4 = 4$/.test(chat.text) && !/\(4\)|d4 ·/.test(chat.text), J(chat));
check("no.pageerrors", errs.length === 0, errs.join(" | "));
await browser.close();
console.log(failures.length ? "\n" + failures.length + " FAILED: " + failures.join(", ") : "\nall ui-notes checks passed");
process.exit(failures.length ? 1 : 0);

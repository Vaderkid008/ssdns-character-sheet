/**
 * No-HP-pool creatures on the map (Jessey 2026-10-20 11:00 AM CT, PR #108): the Spectral Horse (bestiary hp 0 by
 * design, "Spectral Mount") carries the DMCC's existing noHpPool marker. It gets no red down X, no 0/0 HP bar, no
 * Down badge on the Fight tab or the initiative strip, and no death-save line. A real enemy at 0 HP still shows all of it.
 *   node tools/test-no-hp-pool-map.mjs   (browser part: ssdns-test-all's :8765)
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import net from "node:net";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
function check(id, cond, detail) {
  if (!cond) failures.push(id + (detail ? " — " + detail : ""));
  console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + detail : ""));
}
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }

/* ---- rules (apply-guard): status + target use for no-HP-pool vs a real 0 HP enemy */
const sb = { console }; sb.window = sb; sb.globalThis = sb; vm.createContext(sb);
vm.runInContext(read("assets/js/apply-guard.js"), sb, { filename: "apply-guard.js" });
const G = sb.SSDNSApplied;
const horse = { kind: "enemy", beastId: "spectral-horse", noHpPool: true, hp: 0, maxHp: 0 };
const legacy = { kind: "enemy", beastId: "spectral-horse", hp: 0, maxHp: 0 };
const outlaw = { kind: "enemy", beastId: "outlaw", noHpPool: false, hp: 0, maxHp: 11 };
check("rules.horse.notDown", G.noHpPool(horse) && G.coarseStatus(horse) === "" && !G.isUnusableTarget(horse));
check("rules.legacyRow", G.noHpPool(legacy) && G.coarseStatus(legacy) === "");
check("rules.horse.condStillCounts", G.isUnusableTarget(Object.assign({}, horse, { status: "Fled" })) && G.isUnusableTarget(Object.assign({}, horse, { conditions: ["unconscious"] })));
check("rules.outlaw.down", !G.noHpPool(outlaw) && G.coarseStatus(outlaw) === "Down" && G.isUnusableTarget(outlaw));
check("rules.custom.noHpSet", !G.noHpPool({ kind: "enemy", hp: "", maxHp: "" }));
/* ---- code: one marker everywhere */
const v2 = read("dm/assets/js/v2.js"), map = read("map/ssdns-map.js");
check("code.card", /noHpPool: noHpPoolRow\(row\),/.test(v2));
check("code.fightRow", /const downed = !fled && !noHpPoolRow\(row\) && knownNumber\(row\.hp\) === 0;/.test(v2));
check("code.mapX", /if \(card && card\.noHpPool === true\) \{/.test(map));
check("code.drawer", /const noHpPool = card\.noHpPool === true;/.test(map) && /noHpPool \? ' · No HP pool'/.test(map));
check("code.playerX.statusOnly", /const downMark = String\(t\.status \|\| ''\)\.toLowerCase\(\) === 'down' \|\| \(role === 'dm' && hpCur != null && hpCur <= 0\);/.test(map));

/* ---- browser: DMCC offline demo */
const ORIGIN = process.env.SSDNS_ORIGIN || "http://127.0.0.1:8765";
const up = await new Promise((res) => { const u = new URL(ORIGIN); const s = net.connect(Number(u.port || 80), u.hostname, () => { s.end(); res(true); }); s.on("error", () => res(false)); });
if (!up) console.log("skip  browser part: no static server at " + ORIGIN + " (run via ssdns-test-all)");
else {
  const puppeteer = (await import("/tmp/pup/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js")).default;
  const browser = await puppeteer.launch({ executablePath: "/opt/google/chrome/chrome", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    const pg = await browser.newPage(); const errs = [];
    pg.on("pageerror", (e) => errs.push(String(e)));
    await pg.setViewport({ width: 1400, height: 1000 });
    /* spy: which token labels get the red X (#e74c3c, width 3) and an HP bar (width 5 fillRect under the name) */
    await pg.evaluateOnNewDocument(() => {
      const P = CanvasRenderingContext2D.prototype, mt = P.moveTo, ft = P.fillText;
      window.__xed = new Set(); window.__labels = new Set();
      P.moveTo = function (x, y) { if (String(this.strokeStyle).toLowerCase() === "#e74c3c" && this.lineWidth === 3) this.__x = true; return mt.call(this, x, y); };
      P.fillText = function (t) { if (this.__x) { window.__xed.add(String(t)); this.__x = false; } window.__labels.add(String(t)); return ft.apply(this, arguments); };
    });
    await pg.goto(ORIGIN + "/dm/index.html", { waitUntil: "domcontentloaded" });
    await pg.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => /load demo table/i.test(b.textContent)), { timeout: 25000 });
    await sleep(1500);
    await pg.evaluate(() => [...document.querySelectorAll("button")].find((b) => /load demo table/i.test(b.textContent)).click());
    await sleep(2000);
    const tab = (n) => pg.evaluate((n) => [...document.querySelectorAll("[role=tab],.tab,[data-tab]")].find((t) => t.textContent.trim() === n).click(), n);
    await tab("Map");
    await pg.waitForFunction(() => window.SSDNSMapHost && window.SSDNSMapHost.tokensLoaded && window.SSDNSMapHost.tokensLoaded(), { timeout: 20000 });
    await tab("Fight"); await sleep(400);
    for (const id of ["spectral-horse", "outlaw"]) { await pg.evaluate((id) => document.querySelector('[data-add-beast="' + id + '"]').click(), id); await sleep(400); }
    /* drop the Outlaw to 0 HP on the Fight tab (a real, trusted edit) */
    const hpBox = await pg.$('[data-hp-val][aria-label="HP for Outlaw"]');
    await hpBox.evaluate((el) => el.scrollIntoView({ block: "center" }));
    await hpBox.click({ clickCount: 3 }); await pg.keyboard.press("Backspace"); await pg.keyboard.type("0"); await pg.keyboard.press("Tab");
    await sleep(600);
    const fight = await pg.evaluate(() => {
      const rowOf = (name) => [...document.querySelectorAll("[data-hp-val]")].find((el) => (el.getAttribute("aria-label") || "") === "HP for " + name);
      const rowText = (name) => { const el = rowOf(name); const host = el && (el.closest(".init-row, .turn-row, li, .fight-row") || el.parentElement.parentElement); return host ? host.textContent : ""; };
      const chip = (name) => { const c = [...document.querySelectorAll("#turnStrip .turn-chip, .turn-strip .turn-chip, .turn-chip")].find((n) => (n.querySelector(".chip-name") || {}).textContent === name); return c ? c.textContent : ""; };
      const cards = window.SSDNSMapCards || {};
      return { horseRow: rowText("Spectral Horse"), outlawRow: rowText("Outlaw"), horseChip: chip("Spectral Horse"), outlawChip: chip("Outlaw") };
    });
    check("b.fight.horseNotDown", fight.horseRow && !/Unconscious · Down|Bloodied/.test(fight.horseRow), fight.horseRow.slice(0, 200));
    check("b.fight.outlawDown", /Unconscious · Down/.test(fight.outlawRow), fight.outlawRow.slice(0, 200));
    check("b.strip", fight.horseChip && !/Down/.test(fight.horseChip) && /Down/.test(fight.outlawChip), JSON.stringify([fight.horseChip, fight.outlawChip]));
    /* the enemy sheet */
    const sheet = await pg.evaluate(async () => {
      const open = (name) => { const b = [...document.querySelectorAll("[data-open-enemy]")].find((n) => (n.querySelector(".chip-name") || {}).textContent === name); if (b) b.click(); };
      open("Spectral Horse"); await new Promise((r) => setTimeout(r, 400));
      const s = document.querySelector("#enemySheet .enemy-card") || document.querySelector(".enemy-card");
      const out = { horse: s ? s.textContent.replace(/\s+/g, " ").slice(0, 300) : "", horseBar: s ? !!s.querySelector(".hp-bar") : null };
      open("Outlaw"); await new Promise((r) => setTimeout(r, 400));
      const o = document.querySelector("#enemySheet .enemy-card") || document.querySelector(".enemy-card");
      out.outlawBar = o ? !!o.querySelector(".hp-bar") : null; out.outlaw = o ? o.textContent.replace(/\s+/g, " ").slice(0, 120) : "";
      const close = document.querySelector("#enemySheet [data-close], #enemySheet .close, #enemySheetClose"); if (close) close.click();
      return out;
    });
    check("b.sheet.horse", /No HP pool/.test(sheet.horse) && !/0\/0/.test(sheet.horse) && sheet.horseBar === false, JSON.stringify(sheet));
    check("b.sheet.outlaw", /0\/11/.test(sheet.outlaw) && sheet.outlawBar === true, JSON.stringify(sheet));
    /* the DM map: X on the Outlaw only */
    await pg.evaluate(() => { window.__xed.clear(); window.__labels.clear(); });
    await tab("Map"); await sleep(1500);
    await pg.mouse.move(700, 600); await sleep(300); await pg.mouse.move(720, 620); await sleep(900); /* any redraw */
    const drawn = await pg.evaluate(() => ({ xed: [...window.__xed], labels: [...window.__labels].filter((t) => /Spectral|Outlaw/.test(t)) }));
    check("b.map.drawn", drawn.labels.some((t) => /Spectral/.test(t)) && drawn.labels.some((t) => /Outlaw/.test(t)), JSON.stringify(drawn));
    check("b.map.horseNoX", !drawn.xed.some((t) => /Spectral/.test(t)), JSON.stringify(drawn));
    check("b.map.outlawX", drawn.xed.some((t) => /Outlaw/.test(t)), JSON.stringify(drawn));
    check("b.noErrors", !errs.length, errs.join(" | "));
  } finally { await browser.close(); }
}
if (failures.length) { console.log("\n" + failures.length + " FAILED"); process.exit(1); }
console.log("no-hp-pool-map ok");

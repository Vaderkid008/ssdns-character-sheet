/**
 * B3: enemy click-walk uses real speed, the DM can edit it, and the map drawer shows Action / Bonus / R + Move.
 *   An unlinked non-player token the map is moving falls back to the current enemy (and can be linked).
 *   A player token is never relinked. Speed 0, spent, and unlinked each get their own toast.
 *   node tools/test-b3-enemy-speed.mjs   (browser part needs a static server on 127.0.0.1:8765)
 * DMCC pages open through tools/dmcc-offline.mjs so they never hit the live database.
 */
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import { fileURLToPath } from "node:url";
import { dmccUrl, dmccOffline } from "./dmcc-offline.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const J = (x) => JSON.stringify(x);
function check(id, cond, detail) {
  if (!cond) failures.push(id + (detail ? " — " + String(detail).slice(0, 500) : ""));
  console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + String(detail).slice(0, 500) : ""));
}
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

{
  const v2 = read("dm/assets/js/v2.js");
  const map = read("map/ssdns-map.js");
  const host = read("map/ssdns-map-host.js");
  const ver = JSON.parse(read("version.json"));
  const mover = v2.slice(v2.indexOf("function moverRowForToken"), v2.indexOf("function movementBudgetForToken"));
  const budget = v2.slice(v2.indexOf("function movementBudgetForToken"), v2.indexOf("function setEnemySpeed"));
  const speedFn = v2.slice(v2.indexOf("function setEnemySpeed"), v2.indexOf("function spendMoveForToken"));
  const click = map.slice(map.indexOf("function tryClickMove"), map.indexOf("function paintMoveReach()"));
  check("src.fallback", /cur\.kind === "player" \|\| token\.kind === "player" \|\| token\.ownerUid/.test(mover) && /token\.combatantId = cur\.id/.test(mover));
  check("src.noPlayerRelink", mover.indexOf('token.kind === "player"') < mover.indexOf("token.combatantId = cur.id"));
  check("src.budgetUsesMover", /const cur = moverRowForToken\(token\)/.test(budget) && /unlinked: true/.test(budget));
  const fightApi = v2.slice(v2.indexOf("window.SSDNSMapFight"));
  check("src.speedWritesRow", /row\.kind === "player"/.test(speedFn) && /row\.speed = n/.test(speedFn) && /speed\(detail\) \{\s*return setEnemySpeed\(detail\)/.test(fightApi));
  check("src.secretKeepsSpeed", /secret\.speed = row\.speed/.test(v2) && /row\.speed = secret\.speed/.test(v2));
  check("src.toasts", map.includes("This token isn't linked to ") && map.includes("Speed 0 ft. Set a speed on the token.") && map.includes("No movement left (") && map.includes("used). Dash, or the DM can give feet back."));
  check("src.playerToastStays", map.includes("else toast('No movement left this turn'"));
  check("src.drawerPips", /drawerIsCurrentEnemy\(tokenId\)/.test(map) && /mapMarkersHtml\(tokenCombatant\(/.test(map) && map.includes('data-act="enemySpeed"'));
  check("src.drawerRepaint", /data-dm-move/.test(map.slice(map.indexOf("data-dm-pip], [data-pip-reset]"))));
  check("src.hostSpeed", host.includes('"drawer:speed": "speed"') && host.includes("linkedTokenId:"));
  check("src.reuseMarkers", /function toggleEnemyMarker/.test(v2) && /function adjustEnemyMove/.test(v2) && /function spendEnemyPip/.test(v2));
  check("src.noFoodOnEnemy", !/enemySpeed[\s\S]{0,200}Food/.test(map) && !/function setEnemySpeed[\s\S]{0,500}dirty/i.test(v2));
  check("src.rulesUntouched", !read("assets/data/rules.js").includes(ver.sheet) && !read("database.rules.json").includes("enemySpeed"));
  check("src.versions", ver.sheet === "0.3.166" && ver.dmcc === "0.2.179" && ver.sheetBuild === "sheet-playtest-v03166" && ver.dmccBuild === "dmcc-playtest-v02179");
  check("src.editStill", click.includes("if (dmEditing()) return false;") && map.includes("Swap to Edit map tokens to freely move"));
}

const ORIGIN = process.env.SSDNS_ORIGIN || "http://127.0.0.1:8765";
function portOpen(port, hostName) {
  return new Promise((res) => {
    const s = net.connect({ port, host: hostName || "127.0.0.1" }, () => { s.end(); res(true); });
    s.on("error", () => res(false));
  });
}
const u = new URL(ORIGIN);
if (!(await portOpen(Number(u.port), u.hostname))) {
  console.log("Static server is not listening on " + ORIGIN + " (run via ssdns-test-all)");
  process.exit(failures.length ? 1 : 1);
}

const puppeteer = (await import("/tmp/pup/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js")).default;
const browser = await puppeteer.launch({ executablePath: "/opt/google/chrome/chrome", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const ctx = await browser.createBrowserContext();
const pg = await ctx.newPage();
const errs = [];
pg.on("pageerror", (e) => errs.push(String(e)));
pg.on("dialog", (d) => d.accept());
await pg.setViewport({ width: 1440, height: 900 });
await pg.goto(ORIGIN + dmccUrl("/dm/index.html?fresh=" + Date.now()), { waitUntil: "domcontentloaded" });
await dmccOffline(pg);
await pg.waitForFunction(() => window.DMCCEnhance && document.querySelector("#btnLoadDemo"), { timeout: 25000 });
await pg.evaluate(() => document.querySelector("#btnLoadDemo").click());
await pg.waitForFunction(() => window.DMCC.state.demo && Object.keys(window.DMCC.state.players || {}).length >= 1, { timeout: 25000 });
await dmccOffline(pg);

await pg.evaluate(() => document.querySelector("#tab-map").click());
await pg.waitForFunction(() => document.querySelector("#mapMount canvas") && window.SSDNSMapHost && window.SSDNSMapHost.tokensLoaded && window.SSDNSMapHost.tokensLoaded(), { timeout: 20000 });
await sleep(400);

await pg.evaluate(() => document.querySelector("#tab-fight").click());
await sleep(200);
await pg.evaluate(() => { const m = document.querySelector("#combatantMenu"); if (m) m.open = true; });
const pid = await pg.evaluate(() => [...document.querySelectorAll("#initPlayer option")].map((o) => o.value).filter(Boolean)[0]);
await pg.select("#initPlayer", pid);
await pg.click("#btnAddPlayer");
await sleep(200);
await pg.evaluate(() => document.querySelector('[data-add-beast="outlaw"]').click());
await sleep(500);
await pg.evaluate(() => { const m = document.querySelector("#combatantMenu"); if (m) m.open = false; });

async function advance() {
  await pg.evaluate(() => document.querySelector("#btnNextTurn").click());
  await sleep(700);
}
await advance();
for (let i = 0; i < 8 && (await pg.evaluate(() => { const c = window.DMCCEnhance.currentTurn(); return c && c.kind; })) !== "enemy"; i++) await advance();

const prep = await pg.evaluate(() => {
  const E = window.DMCCEnhance;
  const cur = E.currentTurn();
  const code = (window.DMCC.state && window.DMCC.state.roomCode) || "demo";
  const saved = JSON.parse(localStorage.getItem("ssdns.dm.table." + code) || "{}");
  const row = (saved.order || []).find((r) => r && r.id === cur.id) || cur;
  const linked = { id: row.mapTokenId || "missing", kind: "npc", combatantId: cur.id };
  const budget = E.movementBudget(linked);
  const loose = { id: "tok_loose_b3", kind: "npc" };
  const beforeMap = row.mapTokenId || "";
  const looseBudget = E.movementBudget(loose);
  const after = JSON.parse(localStorage.getItem("ssdns.dm.table." + code) || "{}");
  const afterRow = (after.order || []).find((r) => r && r.id === cur.id) || {};
  const playerTok = { id: "ply_b3", kind: "player", ownerUid: "someone" };
  const playerBudget = E.movementBudget(playerTok);
  return {
    name: cur.name, id: cur.id, kind: cur.kind,
    speed: budget && budget.speed, left: budget && budget.left, max: budget && budget.max, unlinked: budget && budget.unlinked,
    looseLeft: looseBudget && looseBudget.left, looseUnlinked: looseBudget && looseBudget.unlinked,
    mapStayed: afterRow.mapTokenId === beforeMap || !beforeMap,
    looseNotStolen: loose.combatantId !== cur.id || !beforeMap,
    playerUnlinked: playerBudget && playerBudget.unlinked === true && playerBudget.left === 0,
    playerUntouched: playerTok.combatantId == null,
    html: E.mapMarkersHtml(cur.id) || ""
  };
});
check("dm.outlawSpeed", prep.kind === "enemy" && prep.speed === 30 && prep.left === 30 && prep.max === 30 && prep.unlinked === false, J(prep));
check("dm.looseFallsBack", prep.looseLeft === 30 && prep.looseUnlinked === false && prep.mapStayed && prep.looseNotStolen, J(prep));
check("dm.playerNotRelinked", prep.playerUnlinked && prep.playerUntouched, J(prep));
check("dm.stripHtml", /Action/.test(prep.html) && /Bonus/.test(prep.html) && />R</.test(prep.html) && /Move 30\/30 ft/.test(prep.html) && /data-dm-pip="action"/.test(prep.html) && /data-dm-move=/.test(prep.html), prep.html.slice(0, 400));

const zero = await pg.evaluate(() => {
  const cur = window.DMCCEnhance.currentTurn();
  window.SSDNSMapFight.speed({ combatantId: cur.id, speed: 0 });
  const b = window.DMCCEnhance.movementBudget({ id: cur.mapTokenId || cur.id, kind: "npc", combatantId: cur.id });
  return { speed: b.speed, left: b.left, max: b.max };
});
check("dm.speedZero", zero.speed === 0 && zero.left === 0 && zero.max === 0, J(zero));

const forty = await pg.evaluate(() => {
  const cur = window.DMCCEnhance.currentTurn();
  const ok = window.SSDNSMapFight.speed({ combatantId: cur.id, speed: 40 });
  const b = window.DMCCEnhance.movementBudget({ id: "tok_any", kind: "npc", combatantId: cur.id });
  const code = (window.DMCC.state && window.DMCC.state.roomCode) || "demo";
  const saved = JSON.parse(localStorage.getItem("ssdns.dm.table." + code) || "{}");
  const row = (saved.order || []).find((r) => r && r.id === cur.id) || {};
  return { ok, speed: b.speed, left: b.left, max: b.max, stored: row.speed };
});
check("dm.speed40", forty.ok === true && forty.speed === 40 && forty.left === 40 && forty.max === 40 && Number(forty.stored) === 40, J(forty));

const spent = await pg.evaluate(() => {
  const E = window.DMCCEnhance;
  const cur = E.currentTurn();
  const tok = { id: cur.id, kind: "npc", combatantId: cur.id };
  const walked = E.spendMove(tok, 30);
  const b = E.movementBudget(tok);
  const again = E.spendMove(tok, 10);
  const done = E.movementBudget(tok);
  return { walked, left: b.left, used: b.used, again, doneLeft: done.left, doneUsed: done.used, html: E.mapMarkersHtml(cur.id) || "" };
});
check("dm.walkSpends", spent.walked === true && spent.left === 10 && spent.used === 30 && spent.again === true && spent.doneLeft === 0 && spent.doneUsed === 40, J(spent));
check("dm.moveHtmlSpent", /Move 0\/40 ft/.test(spent.html), spent.html.slice(0, 300));

await pg.evaluate(() => document.querySelector("#tab-map").click());
await sleep(500);
const editOn = await pg.evaluate(() => {
  const b = document.querySelector('[data-act="dmEditBtn"]');
  if (b && b.getAttribute("aria-pressed") !== "true") b.click();
  return !!(document.querySelector('[data-act="dmEditBtn"]') && document.querySelector('[data-act="dmEditBtn"]').getAttribute("aria-pressed") === "true");
});
check("dm.editOnForSearch", editOn === true);

const canvas = await pg.$("#mapMount canvas:not(.ssm-fx)");
const box = await canvas.boundingBox();
const cx = box.width / 2;
const cy = box.height / 2;
const pts = [{ x: cx, y: cy }];
for (let r = 36; r <= 220; r += 36) {
  for (let a = 0; a < 8; a++) {
    const t = (a / 8) * Math.PI * 2;
    pts.push({ x: cx + Math.cos(t) * r, y: cy + Math.sin(t) * r });
  }
}
let hit = null;
for (const p of pts) {
  if (p.x < 8 || p.y < 8 || p.x > box.width - 8 || p.y > box.height - 8) continue;
  await pg.mouse.click(box.x + p.x, box.y + p.y);
  await sleep(80);
  const found = await pg.evaluate(() => {
    const d = document.querySelector('[data-act="drawer"]');
    if (!d) return false;
    const text = d.textContent || "";
    return text.includes("Speed") && !!d.querySelector('[data-act="enemySpeed"]') && /Outlaw/.test(text);
  });
  if (found) { hit = p; break; }
}
check("dm.drawerOpened", !!hit, hit ? J(hit) : "no outlaw token under the search clicks");

if (hit) {
  const drawer = await pg.evaluate(() => {
    const d = document.querySelector('[data-act="drawer"]');
    const input = d && d.querySelector('[data-act="enemySpeed"]');
    const html = d ? d.innerHTML : "";
    const strip = (document.querySelector('[data-act="stripMarkers"]') || {}).innerHTML || "";
    return {
      value: input ? input.value : "",
      action: /data-dm-pip="action"/.test(html),
      bonus: /data-dm-pip="bonus"/.test(html),
      reaction: /data-dm-pip="reaction"/.test(html),
      move: /Move 0\/40 ft/.test(html),
      stripMove: /Move 0\/40 ft/.test(strip),
      stripAction: /data-dm-pip="action"/.test(strip)
    };
  });
  check("dm.drawerSpeed", drawer.value === "40", J(drawer));
  check("dm.drawerPips", drawer.action && drawer.bonus && drawer.reaction && drawer.move, J(drawer));
  check("dm.stripMatches", drawer.stripMove && drawer.stripAction, J(drawer));

  const shotDir = "/opt/cursor/artifacts/b3";
  fs.mkdirSync(shotDir, { recursive: true });
  const drawerEl = await pg.$('[data-act="drawer"]');
  if (drawerEl) await drawerEl.screenshot({ path: path.join(shotDir, "drawer-speed-and-pips.png") });
  const stripEl = await pg.$('[data-act="turnStrip"]');
  if (stripEl) await stripEl.screenshot({ path: path.join(shotDir, "map-strip-pips.png") });

  await pg.evaluate(() => {
    const close = document.querySelector('[data-act="drawerClose"]');
    if (close) close.click();
    const b = document.querySelector('[data-act="dmEditBtn"]');
    if (b && b.getAttribute("aria-pressed") === "true") b.click();
  });
  await pg.evaluate(() => window.DMCCEnhance.resetEnemyMarkers());
  await sleep(300);
  const beforeWalk = await pg.evaluate(() => {
    const b = window.DMCCEnhance.movementBudget(window.DMCCEnhance.currentTurn());
    return { used: b.used, left: b.left, max: b.max };
  });
  const spots = await pg.evaluate(() => {
    const E = window.DMCCEnhance;
    const cur = E.currentTurn();
    const boxes = window.SSDNSMapHost && window.SSDNSMapHost.tokenBoxes ? window.SSDNSMapHost.tokenBoxes() : [];
    const id = cur.mapTokenId || cur.id;
    const tok = boxes.find((t) => t && (t.id === id || t.id === cur.id || /outlaw/i.test(t.label || ""))) || null;
    if (!tok) return [];
    const w = Math.max(24, tok.screen.x2 - tok.screen.x1);
    const h = Math.max(24, tok.screen.y2 - tok.screen.y1);
    const cx = (tok.screen.x1 + tok.screen.x2) / 2;
    const cy = (tok.screen.y1 + tok.screen.y2) / 2;
    const steps = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [2, 0], [-2, 0], [0, 2], [0, -2]];
    return steps.map(([mx, my]) => ({ x: cx + mx * w, y: cy + my * h, label: tok.label || "", id: tok.id }));
  });
  let walkedPx = null;
  for (const s of spots) {
    if (s.x < 8 || s.y < 8 || s.x > box.width - 8 || s.y > box.height - 8) continue;
    await pg.mouse.click(box.x + s.x, box.y + s.y);
    await sleep(450);
    const used = await pg.evaluate(() => window.DMCCEnhance.movementBudget(window.DMCCEnhance.currentTurn()).used);
    if (used > beforeWalk.used) { walkedPx = { x: s.x, y: s.y, used, before: beforeWalk.used, id: s.id }; break; }
  }
  check("dm.clickWalk", !!walkedPx && beforeWalk.left === 40, J({ beforeWalk, walkedPx, spots: spots.length }));
  if (walkedPx) {
    const strip2 = await pg.$('[data-act="turnStrip"]');
    if (strip2) await strip2.screenshot({ path: path.join(shotDir, "map-strip-after-walk.png") });
    await pg.screenshot({ path: path.join(shotDir, "map-click-walk.png") });
    const again = await pg.evaluate(() => {
      const cur = window.DMCCEnhance.currentTurn();
      const boxes = window.SSDNSMapHost.tokenBoxes();
      const id = cur.mapTokenId || cur.id;
      const tok = boxes.find((t) => t && (t.id === id || /outlaw/i.test(t.label || "")));
      if (!tok) return null;
      return { x: (tok.screen.x1 + tok.screen.x2) / 2, y: (tok.screen.y1 + tok.screen.y2) / 2 };
    });
    if (again) {
      await pg.mouse.click(box.x + again.x, box.y + again.y);
      await sleep(300);
      const after = await pg.$('[data-act="drawer"]');
      if (after) await after.screenshot({ path: path.join(shotDir, "drawer-after-click-walk.png") });
    }
    const toast = await pg.evaluate(() => {
      const close = document.querySelector('[data-act="drawerClose"]');
      if (close) close.click();
      const E = window.DMCCEnhance;
      const cur = E.currentTurn();
      const b = E.movementBudget(cur);
      if (b.left > 0) E.spendMove({ id: cur.id, kind: "npc", combatantId: cur.id }, b.left);
      const canvas = document.querySelector("#mapMount canvas:not(.ssm-fx)");
      const rect = canvas.getBoundingClientRect();
      const boxes = window.SSDNSMapHost.tokenBoxes();
      const tok = boxes.find((t) => t && (t.id === (cur.mapTokenId || cur.id) || /outlaw/i.test(t.label || "")));
      const x = tok ? (tok.screen.x1 + tok.screen.x2) / 2 : rect.width / 2;
      const y = tok ? (tok.screen.y1 + tok.screen.y2) / 2 : rect.height / 2;
      const opts = { bubbles: true, cancelable: true, clientX: rect.left + x, clientY: rect.top + y, button: 0, buttons: 1, pointerId: 1, pointerType: "mouse" };
      canvas.dispatchEvent(new PointerEvent("pointerdown", opts));
      canvas.dispatchEvent(new PointerEvent("pointerup", Object.assign({}, opts, { buttons: 0 })));
      const t = document.querySelector("#mapMount [data-act='toast']");
      return { text: t ? (t.textContent || "") : "", shown: !!(t && t.style.display !== "none"), left: E.movementBudget(cur).left };
    });
    check("dm.spentToast", /No movement left \(40\/40 used\)/.test(toast.text), J(toast));
    const toastEl = await pg.$("#mapMount [data-act='toast']");
    if (toastEl) await toastEl.screenshot({ path: path.join(shotDir, "no-movement-toast.png") });
  }
}

await pg.evaluate(() => window.DMCCEnhance.resetEnemyMarkers());
await sleep(200);
const reset = await pg.evaluate(() => {
  const cur = window.DMCCEnhance.currentTurn();
  const b = window.DMCCEnhance.movementBudget({ id: cur.id, kind: "npc", combatantId: cur.id });
  return { left: b.left, used: b.used, max: b.max, action: !(window.DMCCEnhance.mapMarkersHtml(cur.id) || "").includes("pip-action used") };
});
check("dm.resetRefills", reset.left === 40 && reset.used === 0 && reset.max === 40, J(reset));

const back = await pg.evaluate(() => {
  const E = window.DMCCEnhance;
  const cur = E.currentTurn();
  const id = cur.id;
  const steps = (E.currentTurn() && window.DMCC && window.DMCC.state) ? 0 : 0;
  return { id, steps };
});
for (let i = 0; i < 8; i++) {
  await advance();
  const same = await pg.evaluate((id) => {
    const c = window.DMCCEnhance.currentTurn();
    return !!(c && c.id === id);
  }, back.id);
  if (same) break;
}
const refilled = await pg.evaluate((id) => {
  const c = window.DMCCEnhance.currentTurn();
  if (!c || c.id !== id) return { back: false, id: c && c.id };
  const b = window.DMCCEnhance.movementBudget({ id: c.id, kind: "npc", combatantId: c.id });
  return { back: true, left: b.left, used: b.used, max: b.max, round: (JSON.parse(localStorage.getItem("ssdns.dm.table." + ((window.DMCC.state && window.DMCC.state.roomCode) || "demo")) || "{}").round) };
}, back.id);
check("dm.nextRoundRefills", refilled.back === true && refilled.left === 40 && refilled.used === 0, J(refilled));
check("dm.noPageErrors", errs.length === 0, errs.join(" | "));

await browser.close();
if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("b3 enemy speed ok");

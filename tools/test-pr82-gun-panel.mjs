/**
 * PR82 (DMCC 0.2.112): the player-detail gun panel shows one status line and only the fixes that apply,
 * Repair (clear everything) always with a confirm, "Reopen all locked chambers" instead of "Clear all",
 * and the Set/Clear test toggles folded into "DM overrides". Every button targets the real sheet slot.
 * Needs the static server on 127.0.0.1:8765 and Chrome (ssdns-test-all starts the server).
 *   node tools/test-pr82-gun-panel.mjs
 */
import net from "node:net";
const ORIGIN = "http://127.0.0.1:8765";
const failures = [];
function check(id, cond, detail) { if (!cond) failures.push(id); console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + detail : "")); }
function portOpen(port) { return new Promise((r) => { const s = net.connect({ port, host: "127.0.0.1" }, () => { s.end(); r(true); }); s.on("error", () => r(false)); }); }
if (!(await portOpen(8765))) { console.log("Static server is not listening on 8765 (run via ssdns-test-all)"); process.exit(1); }
const puppeteer = (await import("/tmp/pup/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js")).default;
const browser = await puppeteer.launch({ executablePath: "/opt/google/chrome/chrome", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
try {
  const pg = await browser.newPage();
  const errs = [];
  /* the demo map's token-portrait drawImage error predates this PR (demo tokens carry a cloned _img); ignore only that one */
  pg.on("pageerror", (e) => { if (!/drawImage/.test(String(e))) errs.push(String(e)); });
  await pg.goto(ORIGIN + "/dm/index.html?demo=1", { waitUntil: "domcontentloaded" });
  await pg.waitForFunction(() => window.DMCC && window.DMCC.state && document.querySelector("#btnLoadDemo"), { timeout: 20000 });
  await pg.evaluate(() => { if (!Object.keys(window.DMCC.state.players || {}).length) document.querySelector("#btnLoadDemo").click(); });
  await pg.waitForFunction(() => window.DMCC.state.demo && Object.keys(window.DMCC.state.players || {}).length, { timeout: 20000 });
  const res = await pg.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const D = window.DMCC;
    const pid = Object.keys(D.state.players).find((k) => D.state.players[k].snapshot);
    const snap = D.state.players[pid].snapshot;
    const base = { name: "Navy", weapon: "navy-army-ball-n-cap-revolver", capacity: 6, loaded: 4, chambers: ["c", "c", "c", "c", "", ""], equipped: true };
    /* the gun sits in sheet slot 2; slots 0-1 are empty and dropped from the snapshot list */
    const put = (extra) => { snap.guns = [Object.assign({ index: 2 }, base, { misStreak: 0, jammed: false, dirty: false, fouled: false, ruined: false, broken: false, pendingD4: false, lockedChambers: [], exploded: false }, extra)]; D.openDetail(pid); };
    const chip = () => document.querySelector("#detailBody .gun-chip");
    const vis = () => [...chip().querySelectorAll(".gun-fix-row button")].map((b) => b.textContent.trim());
    const status = () => chip().querySelector("[data-gun-status]").textContent.trim();
    const out = {};
    put({}); out.ok = { status: status(), fix: vis(), fold: !!chip().querySelector("details.gun-overrides:not([open]) [data-mf='dirty']"), slots: [...chip().querySelectorAll("[data-gun-i]")].map((b) => b.getAttribute("data-gun-i")) };
    put({ jammed: true, misStreak: 2 }); out.jam = { status: status(), fix: vis() };
    put({ dirty: true, misStreak: 1 }); out.dirty = { status: status(), fix: vis() };
    put({ lockedChambers: [1], misStreak: 3 }); out.lock1 = { status: status(), fix: vis() };
    put({ lockedChambers: [1, 3], misStreak: 3 }); out.lock2 = { status: status(), fix: vis() };
    put({ pendingD4: true, misStreak: 4, jammed: true }); out.d4 = { status: status(), fix: vis() };
    put({ fouled: true, ruined: true, broken: true }); out.foul = { status: status(), fix: vis() };
    out.noClearAll = !/>Clear all</.test(document.querySelector("#detailBody").innerHTML);
    /* clicks: commands go to sheet slot 2 and the demo copy updates */
    const click = async (label) => { const b = [...chip().querySelectorAll("button")].find((x) => x.textContent.trim() === label); if (!b) return null; D.state.commands.length = 0; b.click(); await wait(250); return D.state.commands[0] || null; };
    put({ jammed: true, misStreak: 2 }); let c = await click("Unjam"); out.unjamCmd = c && c.payload; out.unjamAfter = { jammed: snap.guns[0].jammed, streak: snap.guns[0].misStreak };
    put({ dirty: true, misStreak: 2 }); c = await click("Clean dirt"); out.dirtCmd = c && c.payload; out.dirtAfter = { dirty: snap.guns[0].dirty, streak: snap.guns[0].misStreak };
    put({ lockedChambers: [1, 3], misStreak: 3 }); c = await click("Reopen all locked chambers"); out.reopenAllCmd = c && c.payload; out.reopenAllAfter = snap.guns[0].lockedChambers.length;
    put({ fouled: true, ruined: true, broken: true }); c = await click("Clear Fouled"); out.foulCmd = c && c.payload; out.foulAfter = { fouled: snap.guns[0].fouled, ruined: snap.guns[0].ruined };
    /* Repair asks first: cancel sends nothing, OK clears everything */
    const realAsk = window.SSDNSAsk; let asked = "";
    window.SSDNSAsk = { confirm: async (m) => { asked = m; return false; } };
    put({ jammed: true, dirty: true, lockedChambers: [0], misStreak: 3 }); c = await click("Repair gun (clear everything)"); out.repairCancel = { cmd: c, asked };
    window.SSDNSAsk = { confirm: async () => true };
    put({ jammed: true, dirty: true, lockedChambers: [0], misStreak: 3 }); c = await click("Repair gun (clear everything)"); out.repairCmd = c && c.payload;
    const g = snap.guns[0]; out.repairAfter = { jammed: g.jammed, dirty: g.dirty, locks: (g.lockedChambers || []).length, streak: g.misStreak };
    window.SSDNSAsk = realAsk;
    return out;
  });
  const has = (arr, x) => Array.isArray(arr) && arr.includes(x);
  const J = (o) => JSON.stringify(o);
  check("status.ok", /^OK/.test(res.ok.status) && res.ok.fix.length === 1 && res.ok.fix[0] === "Repair gun (clear everything)", J(res.ok));
  check("overrides.folded", res.ok.fold, J(res.ok));
  check("slots.sheetIndex", res.ok.slots.length > 0 && res.ok.slots.every((s) => s === "2"), J(res.ok.slots));
  check("jam", res.jam.status === "Streak 2 · Jammed" && has(res.jam.fix, "Unjam") && !has(res.jam.fix, "Clean dirt") && !has(res.jam.fix, "Reopen 1 locked chamber"), J(res.jam));
  check("dirty", /Dirty/.test(res.dirty.status) && has(res.dirty.fix, "Clean dirt") && !has(res.dirty.fix, "Unjam"), J(res.dirty));
  check("lock1", /LOCKED UP ×1/.test(res.lock1.status) && has(res.lock1.fix, "Reopen 1 locked chamber") && !has(res.lock1.fix, "Reopen all locked chambers"), J(res.lock1));
  check("lock2", /LOCKED UP ×2/.test(res.lock2.status) && has(res.lock2.fix, "Reopen all locked chambers"), J(res.lock2));
  check("d4", /d4 pending/.test(res.d4.status) && has(res.d4.fix, "Cancel d4") && !has(res.d4.fix, "Unjam"), J(res.d4));
  check("foul", /Ruined/.test(res.foul.status) && has(res.foul.fix, "Clear Fouled") && !has(res.foul.fix, "Unjam") && !has(res.foul.fix, "Clean dirt"), J(res.foul));
  check("label.noClearAll", res.noClearAll);
  check("click.unjam", res.unjamCmd && res.unjamCmd.op === "clean" && res.unjamCmd.optionId === "unjam" && res.unjamCmd.index === 2 && res.unjamAfter.jammed === false && res.unjamAfter.streak === 2, J([res.unjamCmd, res.unjamAfter]));
  check("click.cleanDirt", res.dirtCmd && res.dirtCmd.op === "misfire" && res.dirtCmd.dirty === false && res.dirtCmd.resetStreak && res.dirtCmd.index === 2 && !res.dirtAfter.dirty && res.dirtAfter.streak === 0, J([res.dirtCmd, res.dirtAfter]));
  check("click.reopenAll", res.reopenAllCmd && res.reopenAllCmd.op === "clear-locks" && res.reopenAllCmd.mode === "all" && res.reopenAllCmd.index === 2 && res.reopenAllAfter === 0, J([res.reopenAllCmd, res.reopenAllAfter]));
  check("click.clearFoul", res.foulCmd && res.foulCmd.fouled === false && res.foulCmd.ruined === false && !res.foulAfter.fouled && !res.foulAfter.ruined, J([res.foulCmd, res.foulAfter]));
  check("repair.confirmLists", !res.repairCancel.cmd && /the jam/.test(res.repairCancel.asked) && /Dirty/.test(res.repairCancel.asked) && /1 locked chamber/.test(res.repairCancel.asked) && /streak/.test(res.repairCancel.asked), J(res.repairCancel));
  check("repair.clears", res.repairCmd && res.repairCmd.op === "repair" && res.repairCmd.index === 2 && !res.repairAfter.jammed && !res.repairAfter.dirty && res.repairAfter.locks === 0 && res.repairAfter.streak === 0, J([res.repairCmd, res.repairAfter]));
  check("noPageErrors", errs.length === 0, errs.join(" | "));
} finally { await browser.close(); }
console.log(failures.length ? "\n" + failures.length + " FAILED: " + failures.join(", ") : "\nAll PR82 gun panel checks passed.");
if (failures.length) process.exitCode = 1;

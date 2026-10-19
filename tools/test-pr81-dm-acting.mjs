/**
 * PR81 (0.3.67): a shot the DM sends while acting for a player never prompts on the player's sheet,
 * and uses the DM's Adv/Dis pick. A shot the player takes still asks as before.
 * Needs the static server on 127.0.0.1:8765 and Chrome (ssdns-test-all starts the server).
 *   node tools/test-pr81-dm-acting.mjs
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
  pg.on("pageerror", (e) => errs.push(String(e)));
  await pg.goto(ORIGIN + "/index.html", { waitUntil: "domcontentloaded" });
  await pg.waitForFunction(() => window.SSDNSApp && window.SSDNSGunRoll && window.SSDNSApp.applyPatch, { timeout: 20000 });
  const res = await pg.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const A = window.SSDNSApp;
    const load = () => A.applyPatch((d) => { const c = d.character; c.name = "Ruby"; c.ammo = [{ type: "cartridge", caliber: "", count: 50 }];
      c.guns[0] = Object.assign(c.guns[0] || {}, { weapon: "navy-army-ball-n-cap-revolver", equipped: true, loaded: 6, chambers: ["c", "c", "c", "c", "c", "c"], misStreak: 0, jammed: false, dirty: false, attackMode: "" });
      c.activeConditions = [{ id: "poisoned", name: "Poisoned" }]; });
    load(); await wait(300);
    const out = {};
    const dialogs = () => document.querySelectorAll("dialog[open], dialog.ssm-dis-confirm, dialog[data-dis-confirm]").length;
    const lastRoll = () => { const it = [...document.querySelectorAll(".log-item")].find((n) => /ATTACK/.test(n.textContent)); return it ? it.innerHTML : ""; };
    /* pin the dice (every d20 = 13) so a natural-1 misfire never changes the chat line under test */
    const realRandom = Math.random; Math.random = () => 0.6;
    /* DM-sent shot, DM picked advantage: no prompt even though the player is Poisoned */
    window.SSDNSGunRoll._dm = { mode: "adv" };
    window.SSDNSGunRoll(0, 0); window.SSDNSGunRoll._dm = null;
    await wait(600);
    out.dmAdvDialogs = dialogs();
    out.dmAdvFaces = (lastRoll().match(/data-sides="20"/g) || []).length;
    out.dmAdvMode = /advantage/.test(lastRoll()) && !/disadvantage/.test(lastRoll());
    /* DM-sent straight shot: one d20, no prompt */
    load(); await wait(200);
    const before = document.querySelectorAll(".log-item").length;
    window.SSDNSGunRoll._dm = { mode: "" };
    window.SSDNSGunRoll(0, 1); window.SSDNSGunRoll._dm = null;
    await wait(600);
    out.dmPlainDialogs = dialogs();
    out.dmPlainLogged = document.querySelectorAll(".log-item").length > before;
    /* the flag never leaks into the player's own next shot: Poisoned still asks */
    load(); await wait(200);
    window.SSDNSGunRoll(0, 2);
    await wait(600);
    out.playerDialogs = dialogs();
    Math.random = realRandom;
    return out;
  });
  check("dm.advNoPrompt", res.dmAdvDialogs === 0, JSON.stringify(res));
  check("dm.advTwoD20", res.dmAdvFaces === 2, JSON.stringify(res));
  check("dm.advMode", res.dmAdvMode, JSON.stringify(res));
  check("dm.plainNoPrompt", res.dmPlainDialogs === 0 && res.dmPlainLogged, JSON.stringify(res));
  check("player.stillAsks", res.playerDialogs >= 1, JSON.stringify(res));
  check("noPageErrors", errs.length === 0, errs.join(" | "));
} finally { await browser.close(); }
console.log(failures.length ? "\n" + failures.length + " FAILED: " + failures.join(", ") : "\nAll PR81 DM-acting checks passed.");
process.exit(failures.length ? 1 : 0);

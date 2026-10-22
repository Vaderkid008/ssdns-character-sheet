/**
 * Give tab rework, live (sheet 0.3.108 / DMCC 0.2.121): a real room on the emulators, the DM and one player.
 *   node tools/test-give-tab-live.mjs   (needs emulators :9000/:9099 and a static server :8765, like test-give-live)
 * Proves the recent-gives check mark is the sheet's own word: the sheet writes players/<uid>/grantAcks/<grantId>
 * (its own node, no rules change) after a give lands, and again after an Undo comes off. Ammo lands in the pool,
 * ES carries the reason into the sheet's log, and each Undo takes back just that give.
 */
import net from "node:net";
const ORIGIN = process.env.SSDNS_ORIGIN || "http://127.0.0.1:8765";
const fails = [];
function check(id, ok, detail) { console.log((ok ? "PASS " : "FAIL ") + id + (detail && !ok ? " — " + String(detail).slice(0, 400) : "")); if (!ok) fails.push(id); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function portOpen(port) { return new Promise((res) => { const s = net.connect({ port, host: "127.0.0.1" }, () => { s.end(); res(true); }); s.on("error", () => res(false)); }); }
async function waitFor(fn, ms, label) {
  const t0 = Date.now(); let last = "";
  while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; last = JSON.stringify(v); } catch (e) { last = e.message; } await sleep(250); }
  throw new Error("timeout: " + label + " (" + last + ")");
}
const C = (page, fn, ...a) => page.evaluate(fn, ...a);

async function main() {
  if (!(await portOpen(9000)) || !(await portOpen(9099)) || !(await portOpen(Number(new URL(ORIGIN).port || 80)))) throw new Error("needs emulators on 9000/9099 and a static server at " + ORIGIN);
  const puppeteer = (await import("/tmp/pup/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js")).default;
  const browser = await puppeteer.launch({ executablePath: "/opt/google/chrome/chrome", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  try {
    const dmCtx = await browser.createBrowserContext();
    const dm = await dmCtx.newPage();
    await dm.setViewport({ width: 1400, height: 1000 });
    const dmErrs = [];
    dm.on("pageerror", (e) => dmErrs.push(String(e)));
    await dm.goto(ORIGIN + "/dm/?emu=1", { waitUntil: "domcontentloaded" });
    await waitFor(async () => /Firebase connected/i.test(await dm.$eval("#statusText", (el) => el.textContent || "")), 25000, "dm firebase");
    await dm.$eval("#btnCreateRoom", (el) => el.click());
    const code = await waitFor(() => C(dm, () => { const st = window.DMCC.state; return document.body.classList.contains("in-room") && st.roomCode && !st.demo ? st.roomCode : ""; }), 20000, "room");
    check("room", !!code, code);

    const ctx = await browser.createBrowserContext();
    const pl = await ctx.newPage();
    await pl.setViewport({ width: 1280, height: 900 });
    const plErrs = [];
    pl.on("pageerror", (e) => plErrs.push(String(e)));
    await pl.goto(ORIGIN + "/", { waitUntil: "domcontentloaded" });
    await pl.evaluate(() => {
      const id = "char-jolene";
      const doc = { id, version: 1, createdAt: "2026-10-22T00:00:00.000Z", updatedAt: "2026-10-22T00:00:00.000Z",
        shards: { white: 0, blue: 10, green: 0, yellow: 0, purple: 0 },
        character: { name: "Jolene", player: "Jo", wizardDone: true, calling: "gunslinger", level: 1, abilities: { STR: 10, DEX: 12, CON: 10, INT: 10, WIS: 10, CHA: 10 },
          ammo: [{ type: "cartridge", caliber: "Light", count: 20 }] } };
      localStorage.setItem("ssdns.sheet.char." + id, JSON.stringify(doc));
      localStorage.setItem("ssdns.sheet.last", JSON.stringify(id));
      localStorage.setItem("ssdns.sheet.index", JSON.stringify([{ id, name: "Jolene", calling: "gunslinger", level: 1, updatedAt: doc.updatedAt }]));
    });
    await pl.goto(ORIGIN + "/?emu=1&room=" + encodeURIComponent(code), { waitUntil: "domcontentloaded" });
    await waitFor(() => C(pl, () => !!(window.SSDNSApp && window.SSDNSDmJoin)), 20000, "sheet boot");
    await waitFor(async () => ((await pl.$eval("#btnDmJoin", (el) => el.textContent || "")).indexOf(code) >= 0), 20000, "join button");
    await pl.$eval("#btnDmJoin", (el) => el.click());
    await waitFor(async () => /Joined /i.test(await pl.$eval("#dmJoinStatus", (el) => el.textContent || "")), 25000, "joined");
    await C(pl, () => window.SSDNSApp.applyPatch((d) => { d.character.ammo = [{ type: "cartridge", caliber: "Light", count: 20 }]; }));
    const pid = await waitFor(() => C(dm, () => { const p = window.DMCC.state.players || {}; return Object.keys(p).find((k) => p[k].snapshot && p[k].snapshot.name === "Jolene" && (p[k].snapshot.ammo || []).length) || ""; }), 20000, "dm sees Jolene");

    /* ammo: Who card → Ammo → 20 Light → Give; the row turns to ✓ when the sheet acks */
    await C(dm, () => document.querySelector("#tab-rewards").click()); await sleep(300);
    await C(dm, (pid) => document.querySelector('[data-give-who="' + pid + '"]').click(), pid); await sleep(200);
    await C(dm, () => document.querySelector('[data-give-mode="ammo"]').click()); await sleep(200);
    await C(dm, () => { const s = document.querySelector("#giveAmmoAll"); s.checked = true; s.dispatchEvent(new Event("change", { bubbles: true })); const a = document.querySelector("#giveAmmo"); a.value = "cartridge|Light"; a.dispatchEvent(new Event("change", { bubbles: true })); const q = document.querySelector("#giveAmmoQty"); q.value = "20"; q.dispatchEvent(new Event("input", { bubbles: true })); }); await sleep(200);
    const prev = await C(dm, () => document.querySelector("#givePreview").textContent);
    check("ammo.preview", /Jolene gets 20 Light cartridges, Light cartridges pool 20 to 40/.test(prev), prev);
    await C(dm, () => document.querySelector("#btnPushReward").click());
    await waitFor(() => C(pl, () => { const a = (window.SSDNSApp.doc().character.ammo || []).find((x) => x.type === "cartridge" && x.caliber === "Light"); return a && a.count === 40; }), 15000, "sheet pool 40");
    check("ammo.landed", true);
    const row1 = await waitFor(() => C(dm, () => { const r = document.querySelector("#giveRecent .give-row"); return r && /✓/.test(r.textContent) ? r.textContent.replace(/\s+/g, " ") : ""; }), 15000, "ammo ✓").catch((e) => "");
    check("ammo.checkMark", /Jolene got 20 Light cartridges/.test(row1) && /✓/.test(row1) && !/waiting/.test(row1), row1);

    /* ES with a reason: the sheet's log keeps it; ✓ */
    await C(dm, () => document.querySelector('[data-give-mode="es"]').click()); await sleep(200);
    await C(dm, () => { const e = document.querySelector("#rewEs"); e.value = "25"; e.dispatchEvent(new Event("input", { bubbles: true })); const r = document.querySelector("#rewReason"); r.value = "Bounty"; r.dispatchEvent(new Event("input", { bubbles: true })); }); await sleep(200);
    await C(dm, () => document.querySelector("#btnPushReward").click());
    const log = await waitFor(() => C(pl, () => [...document.querySelectorAll(".log-item")].map((x) => x.textContent).find((t) => /DM \+25 ES \(Bounty\)/.test(t)) || ""), 15000, "es log").catch(() => "");
    check("es.reasonInLog", !!log, log);
    const row2 = await waitFor(() => C(dm, () => { const r = document.querySelector("#giveRecent .give-row"); return r && /✓/.test(r.textContent) ? r.textContent.replace(/\s+/g, " ") : ""; }), 15000, "es ✓").catch(() => "");
    check("es.checkMark", /\+25 ES “Bounty”/.test(row2), row2);

    /* the ack lives on the player's own node */
    const acks = await C(dm, (pid) => (window.DMCC.state.players[pid] || {}).grantAcks || {}, pid);
    check("ack.onPlayerNode", Object.keys(acks).length >= 2 && Object.values(acks).every((a) => a && a.ok === true), JSON.stringify(acks));

    /* Undo the ammo only: 40 → 20, ES untouched, row says it came off their sheet */
    const es0 = await C(pl, () => window.SSDNSBridge.cpValue(window.SSDNSApp.doc().shards));
    await C(dm, () => { const b = [...document.querySelectorAll("#giveRecent [data-give-undo]")].pop(); b.click(); });
    await waitFor(() => C(pl, () => { const a = (window.SSDNSApp.doc().character.ammo || []).find((x) => x.type === "cartridge" && x.caliber === "Light"); return a && a.count === 20; }), 15000, "undo ammo");
    check("undo.ammoOnly", (await C(pl, () => window.SSDNSBridge.cpValue(window.SSDNSApp.doc().shards))) === es0);
    const row3 = await waitFor(() => C(dm, () => { const r = [...document.querySelectorAll("#giveRecent .give-row")].pop(); return r && /off their sheet/.test(r.textContent) ? r.textContent.replace(/\s+/g, " ") : ""; }), 15000, "undo ✓").catch(() => "");
    check("undo.checkMark", /undone · ✓ off their sheet/.test(row3), row3);

    check("noPageErrors", !plErrs.length && !dmErrs.length, [].concat(plErrs, dmErrs).slice(0, 3).join(" | "));
  } finally {
    await browser.close();
  }
}
main().then(() => {
  console.log(fails.length ? "\nFAILED: " + fails.join(", ") : "\ngive tab live checks passed");
  process.exit(fails.length ? 1 : 0);
}, (e) => { console.error("FAIL give.tab.live — " + (e && e.stack || e)); process.exit(1); });

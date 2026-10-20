/**
 * Player Give, live (sheet 0.3.86 / DMCC 0.2.99): a real room on the emulators, a DM and two players.
 *   node tools/test-give-live.mjs        (needs emulators :9000/:9099 and a static server :8765, like test-live-room)
 *   SSDNS_SHOTS=/dir node tools/test-give-live.mjs   also saves give-*.png screenshots
 * Proves: row Give → picker → one request row even on a double tap; Accept prompt; the item moves with its
 * fields, ammo lands in its pool, ES moves, carried weight changes on both sheets; one chat line; a refresh or a
 * second apply changes nothing; decline / giver cancel / DM cancel keep it with the giver; an offline receiver's
 * offer waits and lands on return; DM-only has no Give; a locked inventory blocks Give; the DMCC Give tab shows
 * the Target's inventory live; the saddle needs attunement after it changes hands (short rest), then summons.
 * Slot gives: a gun with no inventory row moves from its card with rounds / Dirty / jam / custom fields; a full
 * receiver parks it in inventory (To a slot restores it); the melee card gives too; a pending misfire d4 blocks.
 */
import net from "node:net";
const ORIGIN = "http://127.0.0.1:8765";
const SHOTS = process.env.SSDNS_SHOTS || "";
const fails = [];
function check(id, ok, detail) { console.log((ok ? "PASS " : "FAIL ") + id + (detail ? " — " + String(detail).slice(0, 300) : "")); if (!ok) fails.push(id); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function portOpen(port) { return new Promise((res) => { const s = net.connect({ port, host: "127.0.0.1" }, () => { s.end(); res(true); }); s.on("error", () => res(false)); }); }
async function waitFor(fn, ms, label) {
  const t0 = Date.now(); let last = "";
  while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; last = JSON.stringify(v); } catch (e) { last = e.message; } await sleep(250); }
  throw new Error("timeout: " + label + " (" + last + ")");
}
async function shot(page, sel, name) {
  if (!SHOTS) return;
  const el = await page.$(sel);
  if (!el) { console.log("no element for shot", sel); return; }
  await el.evaluate((n) => n.scrollIntoView({ block: "center" }));
  await sleep(250);
  await el.screenshot({ path: SHOTS + "/" + name });
}

function seed(name, player, id) {
  return { id, name, player };
}
async function player(browser, who, code) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  page._errs = [];
  page.on("pageerror", (e) => page._errs.push(String(e)));
  await page.goto(ORIGIN + "/", { waitUntil: "domcontentloaded" });
  await page.evaluate((w) => {
    const doc = { id: w.id, version: 1, createdAt: "2026-10-20T00:00:00.000Z", updatedAt: "2026-10-20T00:00:00.000Z",
      shards: { white: 0, blue: w.blue || 0, green: 0, yellow: 0, purple: 0 },
      character: { name: w.name, player: w.player, wizardDone: true, calling: "gunslinger", level: 1, abilities: { STR: 10, DEX: 12, CON: 10, INT: 10, WIS: 10, CHA: 10 } } };
    localStorage.setItem("ssdns.sheet.char." + w.id, JSON.stringify(doc));
    localStorage.setItem("ssdns.sheet.last", JSON.stringify(w.id));
    localStorage.setItem("ssdns.sheet.index", JSON.stringify([{ id: w.id, name: w.name, calling: "gunslinger", level: 1, updatedAt: doc.updatedAt }]));
  }, who);
  await page.goto(ORIGIN + "/?emu=1&room=" + encodeURIComponent(code), { waitUntil: "domcontentloaded" });
  await waitFor(() => page.evaluate(() => !!(window.SSDNSItems && window.SSDNSApp && window.SSDNSGiveSheet && window.SSDNSDmJoin)), 20000, "sheet boot " + who.name);
  return { ctx, page };
}
async function joinRoom(page, code) {
  await waitFor(async () => ((await page.$eval("#btnDmJoin", (el) => el.textContent || "")).indexOf(code) >= 0), 20000, "join button");
  await page.$eval("#btnDmJoin", (el) => el.click());
  await waitFor(async () => /Joined /i.test(await page.$eval("#dmJoinStatus", (el) => el.textContent || "")), 25000, "joined");
}
const C = (page, fn, ...a) => page.evaluate(fn, ...a);
const charOf = (page) => C(page, () => JSON.parse(JSON.stringify(window.SSDNSApp.doc().character)));
async function openEquip(page) { await C(page, () => { const t = document.querySelector("#tab-equip") || document.querySelector('[aria-controls="panel-equip"]'); if (t) t.click(); }); await sleep(200); }

async function main() {
  if (!(await portOpen(9000)) || !(await portOpen(9099)) || !(await portOpen(8765))) throw new Error("needs emulators on 9000/9099 and a server on 8765");
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

    const A = await player(browser, { id: "char-dust", name: "Dust", player: "Ana", blue: 10 }, code);
    const B = await player(browser, { id: "char-dolan", name: "Dolan", player: "Ben" }, code);
    /* Dust's kit: hardtack ×5, a Dirty DM-made pistol with uses, a DM-only map, a worn duster, the saddle (attuned), arrows */
    await C(A.page, () => {
      const I = window.SSDNSItems;
      window.SSDNSApp.applyPatch((d) => {
        const c = d.character;
        c.items = [];
        I.add(c, { id: "hardtack-jerky-1-day", count: 5 }, { dm: true });
        I.add(c, { id: "custom-old-canteen", name: "Old Canteen", type: "gear", itemKind: "water", tags: ["water", "container"], capacity: 0.5, weight: 5, uses: { max: 3 }, chargesLeft: 2, effect: { kind: "text", text: "Dented." } }, { dm: true });
        I.add(c, { id: "custom-sealed-map", name: "Sealed Map", type: "gear", weight: 0, dmOnly: true, effect: { kind: "text", text: "For the DM." } }, { dm: true });
        I.add(c, { id: "saddle-of-the-phantom-steed" }, { dm: true });
        c.ammo = [{ type: "arrows", caliber: "", count: 30 }];
      });
      const c = window.SSDNSApp.doc().character;
      const sad = c.items.find((x) => x.catalogId === "saddle-of-the-phantom-steed");
      window.SSDNSItems.setAttuned(c, sad.uid, true, { dm: true });
      window.SSDNSApp.applyPatch(() => {});
    });
    await joinRoom(A.page, code);
    await joinRoom(B.page, code);
    await waitFor(() => C(dm, () => Object.keys(window.DMCC.state.players || {}).length >= 2), 20000, "dm sees 2");
    const uids = await C(dm, () => { const p = window.DMCC.state.players; const out = {}; Object.keys(p).forEach((k) => { out[(p[k].snapshot || {}).name] = k; }); return out; });
    await waitFor(() => C(A.page, () => window.SSDNSGiveSheet.roster().length === 1), 15000, "roster");
    await openEquip(A.page); await openEquip(B.page);
    await C(A.page, () => window.SSDNSItems.paintSheet());

    const rowSel = (name) => C(A.page, (n) => { const r = [...document.querySelectorAll("#itemList .item-row")].find((x) => x.textContent.indexOf(n) >= 0); if (!r) return null; r.id = r.id || ("row-" + n.replace(/\W+/g, "")); return { id: r.id, give: !!r.querySelector("[data-give-item]"), drop: !!r.querySelector("[data-item-drop]") }; }, name);
    const hard = await rowSel("Hardtack");
    const mapRow = await rowSel("Sealed Map");
    check("row.giveButton", hard && hard.give, JSON.stringify(hard));
    check("row.dmOnlyNoGive", mapRow && !mapRow.give, JSON.stringify(mapRow));
    await shot(A.page, "#" + hard.id, "give-row-button.png");

    /* ---- give 2 hardtack; double tap the Give button ---- */
    await C(A.page, (id) => document.querySelector("#" + id + " [data-give-item]").click(), hard.id);
    await waitFor(() => C(A.page, () => !!document.querySelector("dialog.give-picker")), 5000, "picker");
    await C(A.page, () => { const d = document.querySelector("dialog.give-picker"); d.querySelector("[data-give-qty]").value = "2"; });
    await shot(A.page, "dialog.give-picker", "give-picker.png");
    /* a double tap, and a third tap even with the button forced back on: the picker's one transfer ID makes it one offer */
    await C(A.page, () => { const b = document.querySelector("dialog.give-picker [data-give-send]"); b.click(); b.click(); b.disabled = false; b.click(); });
    await sleep(1200);
    const reqs = await C(dm, async () => { const st = window.DMCC.state; const s = await st._fb.get(window.DMCC.roomRef("encounter/requests")); const v = s.val() || {}; return Object.keys(v).filter((k) => v[k].kind === "give"); });
    check("give.oneRequestOnDoubleTap", reqs.length === 1, JSON.stringify(reqs));
    const xid = reqs[0];
    const heldRow = await C(A.page, () => { const r = [...document.querySelectorAll("#itemList .item-row")].find((x) => /Hardtack/.test(x.textContent)); return { held: !!r.querySelector(".give-held"), text: r.querySelector(".give-held") ? r.querySelector(".give-held").textContent : "", count: window.SSDNSApp.doc().character.items.find((x) => x.catalogId === "hardtack-jerky-1-day").count }; });
    check("give.heldNotRemoved", heldRow.held && /Offered to Dolan/.test(heldRow.text) && heldRow.count === 5, JSON.stringify(heldRow));
    const ledger1 = await waitFor(() => C(dm, async (id) => { const s = await window.DMCC.state._fb.get(window.DMCC.roomRef("ledger/" + id)); const v = s.val(); return v && v.state === "offered" ? v : null; }, xid), 10000, "ledger offered");
    check("ledger.writtenFirst", ledger1.type === "transfer" && ledger1.legs && ledger1.what === "Dust gives Dolan 2 Hardtack and Jerky", ledger1.what);
    await waitFor(() => C(B.page, () => !!document.querySelector("dialog.give-prompt[open]")), 15000, "prompt");
    await shot(B.page, "dialog.give-prompt", "give-accept-prompt.png");
    const wBefore = await C(B.page, () => window.SSDNSItems.weightReport(window.SSDNSApp.doc().character).carried);
    const wBeforeA = await C(A.page, () => window.SSDNSItems.weightReport(window.SSDNSApp.doc().character).carried);
    await C(B.page, () => { const b = document.querySelector("dialog.give-prompt [data-give-accept]"); b.click(); b.disabled = false; b.click(); });
    await waitFor(() => C(dm, async (id) => { const s = await window.DMCC.state._fb.get(window.DMCC.roomRef("ledger/" + id)); return (s.val() || {}).state === "done"; }, xid), 20000, "done");
    await sleep(800);
    const aC = await charOf(A.page), bC = await charOf(B.page);
    const aH = (aC.items.find((x) => x.catalogId === "hardtack-jerky-1-day") || {}).count;
    const bH = bC.items.filter((x) => x.catalogId === "hardtack-jerky-1-day");
    check("move.item", aH === 3 && bH.length === 1 && bH[0].count === 2, aH + " / " + JSON.stringify(bH.map((x) => x.count)));
    const wAfter = await C(B.page, () => window.SSDNSItems.weightReport(window.SSDNSApp.doc().character).carried);
    const wAfterA = await C(A.page, () => window.SSDNSItems.weightReport(window.SSDNSApp.doc().character).carried);
    check("move.weightBothSheets", wAfter > wBefore && wAfterA < wBeforeA, [wBeforeA, wAfterA, wBefore, wAfter].join(" "));
    const chat = await C(dm, async (id) => { const s = await window.DMCC.state._fb.get(window.DMCC.roomRef("chat")); const v = s.val() || {}; return Object.keys(v).map((k) => v[k].text).filter((t) => /gives Dolan 2 Hardtack and Jerky/.test(t)); }, xid);
    check("log.chatOnce", chat.length === 1 && chat[0] === "Dust gives Dolan 2 Hardtack and Jerky", JSON.stringify(chat));
    const logsA = await waitFor(() => C(A.page, () => /Dust gives Dolan 2 Hardtack and Jerky/.test(document.body.innerText)), 8000, "giver log").catch(() => false);
    const logsB = await waitFor(() => C(B.page, () => /Dust gives Dolan 2 Hardtack and Jerky/.test(document.body.innerText)), 8000, "receiver log").catch(() => false);
    check("log.bothSheets", !!logsA && !!logsB);
    const dmLog = await C(dm, () => /Dust gives Dolan 2 Hardtack and Jerky/.test((document.querySelector("#ledgerFeed") || {}).textContent || "") || (window.DMCC.state.ledger || []).some((e) => e.what === "Dust gives Dolan 2 Hardtack and Jerky"));
    check("log.dmcc", dmLog);

    /* ---- idempotency: re-run the ledger row on both sheets, then refresh the receiver ---- */
    const L = await C(dm, async (id) => (await window.DMCC.state._fb.get(window.DMCC.roomRef("ledger/" + id))).val(), xid);
    await C(B.page, (args) => { window.SSDNSGiveSheet.onLedger(args.id, Object.assign({}, args.L, { state: "accepted" })); window.SSDNSGiveSheet.onLedger(args.id, args.L); }, { id: xid, L });
    await C(A.page, (args) => { window.SSDNSGiveSheet.onLedger(args.id, Object.assign({}, args.L, { state: "added" })); window.SSDNSGiveSheet.onLedger(args.id, args.L); }, { id: xid, L });
    const a2 = await charOf(A.page), b2 = await charOf(B.page);
    check("idem.doubleApply", a2.items.find((x) => x.catalogId === "hardtack-jerky-1-day").count === 3 && b2.items.find((x) => x.catalogId === "hardtack-jerky-1-day").count === 2);
    await B.page.reload({ waitUntil: "domcontentloaded" });
    await waitFor(() => C(B.page, () => !!(window.SSDNSApp && window.SSDNSApp.doc && window.SSDNSApp.doc())), 15000, "reload");
    await sleep(1500);
    const st = await C(B.page, () => (window.SSDNSDmJoin.isJoined && window.SSDNSDmJoin.isJoined()));
    if (!st) await joinRoom(B.page, code).catch(() => {});
    await sleep(2500);
    const b3 = await charOf(B.page);
    check("idem.refresh", b3.items.filter((x) => x.catalogId === "hardtack-jerky-1-day").reduce((s, x) => s + x.count, 0) === 2, JSON.stringify(b3.items.map((x) => x.name + x.count)));
    await openEquip(B.page);

    /* ---- ammo: 20 arrows from the bar ---- */
    async function giveFromBar(page, what, qty, toName) {
      await C(page, () => { window.SSDNSItems.paintSheet(); document.querySelector("[data-give-pool]").click(); });
      await waitFor(() => C(page, () => !!document.querySelector("dialog.give-picker")), 5000, "bar picker");
      return C(page, (a) => {
        const d = document.querySelector("dialog.give-picker");
        const w = d.querySelector("[data-give-what]");
        const opt = [...w.options].find((o) => o.value.indexOf(a.what) === 0);
        if (!opt) return "no option " + a.what + " in " + [...w.options].map((o) => o.value).join(",");
        w.value = opt.value; w.dispatchEvent(new Event("change"));
        d.querySelector("[data-give-qty]").value = String(a.qty);
        d.querySelector("[data-give-send]").click();
        return "ok";
      }, { what, qty });
    }
    async function lastXfer(page) { return C(page, () => { const x = window.SSDNSApp.doc().character.xfers || {}; return Object.keys(x).sort((p, q) => String(x[q].ts).localeCompare(String(x[p].ts)))[0]; }); }
    async function ledgerState(id) { return C(dm, async (i) => ((await window.DMCC.state._fb.get(window.DMCC.roomRef("ledger/" + i))).val() || {}).state || "", id); }
    async function accept(page, id) {
      const sel = 'dialog.give-prompt[data-give-prompt="' + id + '"] [data-give-accept]';
      await waitFor(() => C(page, (q) => !!document.querySelector(q), sel), 15000, "prompt " + id);
      await C(page, (q) => document.querySelector(q).click(), sel);
    }
    check("ammo.offer", (await giveFromBar(A.page, "ammo:arrows", 20)) === "ok");
    await sleep(500);
    const ax = await lastXfer(A.page);
    await accept(B.page, ax);
    await waitFor(async () => (await ledgerState(ax)) === "done", 20000, "ammo done");
    await sleep(600);
    const aAm = (await charOf(A.page)).ammo.find((x) => x.type === "arrows").count;
    const bAm = ((await charOf(B.page)).ammo || []).find((x) => x.type === "arrows");
    check("ammo.pool", aAm === 10 && bAm && bAm.count === 20, aAm + " / " + JSON.stringify(bAm));

    /* ---- ES ---- */
    const esA0 = await C(A.page, () => window.SSDNSDmJoin.give.es());
    const esB0 = await C(B.page, () => window.SSDNSDmJoin.give.es());
    check("es.offer", (await giveFromBar(A.page, "es", 30)) === "ok");
    await sleep(500);
    const ex = await lastXfer(A.page);
    await accept(B.page, ex);
    await waitFor(async () => (await ledgerState(ex)) === "done", 20000, "es done");
    await sleep(800);
    const esA1 = await C(A.page, () => window.SSDNSDmJoin.give.es());
    const esB1 = await C(B.page, () => window.SSDNSDmJoin.give.es());
    check("es.moved", esA1 === esA0 - 30 && esB1 === esB0 + 30, [esA0, esA1, esB0, esB1].join(" "));

    /* ---- decline: it stays with the giver ---- */
    async function giveItem(page, name, qty) {
      await C(page, () => window.SSDNSItems.paintSheet());
      const ok = await C(page, (n) => { const r = [...document.querySelectorAll("#itemList .item-row")].find((x) => x.textContent.indexOf(n) >= 0); const b = r && r.querySelector("[data-give-item]"); if (!b) return false; b.click(); return true; }, name);
      if (!ok) return "no Give on " + name;
      await waitFor(() => C(page, () => !!document.querySelector("dialog.give-picker")), 5000, "picker");
      await C(page, (q) => { const d = document.querySelector("dialog.give-picker"); d.querySelector("[data-give-qty]").value = String(q); d.querySelector("[data-give-send]").click(); }, qty || 1);
      await sleep(600);
      return "ok";
    }
    check("decline.offer", (await giveItem(A.page, "Old Canteen")) === "ok");
    const dx = await lastXfer(A.page);
    await waitFor(() => C(B.page, () => !!document.querySelector("dialog.give-prompt [data-give-decline]")), 15000, "prompt");
    await C(B.page, () => document.querySelector("dialog.give-prompt [data-give-decline]").click());
    await waitFor(async () => (await ledgerState(dx)) === "declined", 15000, "declined");
    await sleep(600);
    const aCan = (await charOf(A.page)).items.find((x) => x.name === "Old Canteen");
    check("decline.kept", !!aCan && !(await charOf(B.page)).items.some((x) => x.name === "Old Canteen"));
    const freed = await C(A.page, () => { window.SSDNSItems.paintSheet(); const r = [...document.querySelectorAll("#itemList .item-row")].find((x) => /Old Canteen/.test(x.textContent)); return !!r.querySelector("[data-give-item]") && !r.querySelector(".give-held"); });
    check("decline.holdReleased", freed);

    /* ---- giver cancel ---- */
    await giveItem(A.page, "Old Canteen");
    const cx = await lastXfer(A.page);
    await waitFor(async () => (await ledgerState(cx)) === "offered", 15000, "offered");
    await waitFor(() => C(B.page, () => !!document.querySelector("dialog.give-prompt")), 15000, "prompt c");
    await C(A.page, () => { window.SSDNSItems.paintSheet(); document.querySelector("#itemList [data-give-cancel]").click(); });
    await waitFor(async () => (await ledgerState(cx)) === "cancelled", 15000, "giver cancelled");
    await sleep(800);
    check("cancel.giver", !(await C(B.page, () => !!document.querySelector("dialog.give-prompt"))) && (await charOf(A.page)).items.some((x) => x.name === "Old Canteen"));

    /* ---- DM sees and cancels ---- */
    await giveItem(A.page, "Old Canteen");
    const mx = await lastXfer(A.page);
    await waitFor(async () => (await ledgerState(mx)) === "offered", 15000, "offered m");
    await C(dm, () => { const t = document.querySelector("#tab-rewards"); if (t) t.click(); });
    await waitFor(() => C(dm, (id) => !!document.querySelector('#xferPending [data-xfer-cancel="' + id + '"]'), mx), 10000, "dm pending row");
    await shot(dm, "#xferPending", "give-dm-pending.png");
    await C(dm, (id) => document.querySelector('#xferPending [data-xfer-cancel="' + id + '"]').click(), mx);
    await waitFor(async () => (await ledgerState(mx)) === "cancelled", 15000, "dm cancelled");
    await sleep(800);
    check("cancel.dm", (await charOf(A.page)).items.some((x) => x.name === "Old Canteen") && !(await C(B.page, () => !!document.querySelector("dialog.give-prompt"))));

    /* ---- offline receiver: the offer waits, then lands ---- */
    await B.page.close();
    await sleep(1500);
    await giveItem(A.page, "Old Canteen");
    const ox = await lastXfer(A.page);
    await waitFor(async () => (await ledgerState(ox)) === "offered", 15000, "offline offered");
    await sleep(1500);
    check("offline.waits", (await ledgerState(ox)) === "offered" && (await charOf(A.page)).items.some((x) => x.name === "Old Canteen"));
    const B2 = await B.ctx.newPage();
    await B2.setViewport({ width: 1280, height: 900 });
    await B2.goto(ORIGIN + "/?emu=1&room=" + encodeURIComponent(code), { waitUntil: "domcontentloaded" });
    await waitFor(() => C(B2, () => !!(window.SSDNSGiveSheet && window.SSDNSDmJoin)), 15000, "B2 boot");
    await sleep(1500);
    if (!(await C(B2, () => window.SSDNSDmJoin.isJoined()))) await joinRoom(B2, code);
    await accept(B2, ox);
    await waitFor(async () => (await ledgerState(ox)) === "done", 20000, "offline done");
    await sleep(800);
    const bCan = (await charOf(B2)).items.find((x) => x.name === "Old Canteen");
    check("offline.landed", !!bCan && bCan.chargesLeft === 2 && bCan.weight === 5 && bCan.capacity === 0.5 && !(await charOf(A.page)).items.some((x) => x.name === "Old Canteen"), JSON.stringify(bCan));
    await openEquip(B2);

    /* ---- the saddle: attunement clears, Attune takes a short rest, then it summons ---- */
    check("saddle.offer", (await giveItem(A.page, "Saddle of the Phantom Steed")) === "ok");
    const sx = await lastXfer(A.page);
    await accept(B2, sx);
    await waitFor(async () => (await ledgerState(sx)) === "done", 20000, "saddle done");
    await sleep(800);
    const sad = () => C(B2, () => { const c = window.SSDNSApp.doc().character; const s = c.items.find((x) => x.catalogId === "saddle-of-the-phantom-steed"); return s ? { uid: s.uid, attune: s.attune, attuned: s.attuned, pending: !!s.attunePending } : null; });
    let s1 = await sad();
    check("saddle.attuneCleared", s1 && s1.attune && !s1.attuned, JSON.stringify(s1));
    const blocked = await C(B2, (u) => { const r = window.SSDNSItems.useOnSheet(u); return r && r.needsAttune ? r.reason : JSON.stringify(r); }, s1.uid);
    check("saddle.summonNeedsAttune", /needs attunement/.test(blocked), blocked);
    await C(B2, (u) => { window.SSDNSItems.paintSheet(); document.querySelector('[data-item-attune="' + u + '"]').click(); }, s1.uid);
    s1 = await sad();
    check("saddle.attunePending", s1.pending && !s1.attuned, JSON.stringify(s1));
    await C(B2, () => window.SSDNSSheet.applyRest("short", { prompted: true }));
    await sleep(300);
    s1 = await sad();
    check("saddle.attunedAfterShortRest", s1.attuned && !s1.pending, JSON.stringify(s1));
    const used = await C(B2, (u) => { const r = window.SSDNSItems.useOnSheet(u); return r && !r.needsAttune && r.kind === "castSpell" ? "ok" : JSON.stringify(r); }, s1.uid);
    /* attuned: the summon runs (castSpell's own spell check may still pass or fail; that's the item's normal roll) */
    check("saddle.summons", used === "ok", used);
    check("saddle.giverLostIt", !(await charOf(A.page)).items.some((x) => x.catalogId === "saddle-of-the-phantom-steed"));

    /* ---- a gun in a slot with NO inventory row: Give from the gun card; the whole gun moves ---- */
    const PEP = "herringer-light-pepperbox";
    const R32 = "k:cartridge:.32 Long:light";
    const seedGun = (page) => C(page, (a) => {
      window.SSDNSApp.grantListedWeapon(a.id);
      window.SSDNSApp.applyPatch((d) => {
        const g = d.character.guns.find((x) => x && x.weapon === a.id && !x.notch);
        Object.assign(g, { loaded: 3, chambers: [a.r, a.r, a.r, ""], dirty: true, jammed: true, misStreak: 1, engraving: true, notch: "three notches", ui: "special-pepper" });
      });
      window.SSDNSTrackers.paint();
      return d0();
      function d0() { const c = window.SSDNSApp.doc().character; return { i: c.guns.findIndex((x) => x && x.weapon === a.id), rows: (c.items || []).filter((x) => x.weaponId === a.id || x.catalogId === a.id).length }; }
    }, { id: PEP, r: R32 });
    const g0 = await seedGun(A.page);
    check("slot.seededNoRow", g0.i >= 0 && g0.rows === 0, JSON.stringify(g0));
    const cardSel = '.gun[data-row="' + g0.i + '"]';
    const cardBtn = await waitFor(() => C(A.page, (q) => { window.SSDNSTrackers.paint(); const b = document.querySelector(q + " [data-give-slot]"); return b ? b.getAttribute("data-give-slot") : ""; }, cardSel), 8000, "card Give").catch(() => "");
    check("slot.cardGiveButton", cardBtn === "gun:" + g0.i, cardBtn);
    await shot(A.page, cardSel, "give-gun-slot.png");
    /* a pending misfire d4 is the one mid-action jam state: it blocks; a plain jam doesn't */
    const d4 = await C(A.page, (i) => { const c = JSON.parse(JSON.stringify(window.SSDNSApp.doc().character)); c.guns[i].pendingD4 = true; return window.SSDNSGive.canOffer(c, { kind: "slot", slotKind: "gun", index: i, qty: 1 }).reason || ""; }, g0.i);
    check("slot.d4Blocks", /d4/.test(d4), d4);
    const reqsBefore = await C(dm, async () => { const v = (await window.DMCC.state._fb.get(window.DMCC.roomRef("encounter/requests"))).val() || {}; return Object.keys(v).filter((k) => v[k].kind === "give").length; });
    await C(A.page, (q) => document.querySelector(q + " [data-give-slot]").click(), cardSel);
    await waitFor(() => C(A.page, () => !!document.querySelector("dialog.give-picker")), 5000, "slot picker");
    const pickTxt = await C(A.page, () => document.querySelector("dialog.give-picker").textContent);
    check("slot.pickerNotes", /Herringer Light Pepperbox/.test(pickTxt) && /3 loaded rounds go with it/.test(pickTxt) && /Dirty, jammed/.test(pickTxt), pickTxt);
    await shot(A.page, "dialog.give-picker", "give-gun-slot-picker.png");
    await C(A.page, () => { const b = document.querySelector("dialog.give-picker [data-give-send]"); b.click(); b.click(); b.disabled = false; b.click(); });
    await sleep(1200);
    const reqsAfter = await C(dm, async () => { const v = (await window.DMCC.state._fb.get(window.DMCC.roomRef("encounter/requests"))).val() || {}; return Object.keys(v).filter((k) => v[k].kind === "give").length; });
    check("slot.oneRequestOnDoubleTap", reqsAfter === reqsBefore + 1, reqsBefore + " → " + reqsAfter);
    const gx = await lastXfer(A.page);
    const heldCard = await C(A.page, (a) => { window.SSDNSTrackers.paint(); const card = document.querySelector(a.q); const c = window.SSDNSApp.doc().character; return { tag: (card.querySelector(".give-held") || {}).textContent || "", sel: card.querySelector("select[data-gun]").disabled, still: c.guns[a.i].weapon, loaded: c.guns[a.i].loaded }; }, { q: cardSel, i: g0.i });
    check("slot.heldNotRemoved", /Offered to Dolan/.test(heldCard.tag) && heldCard.sel && heldCard.still === PEP && heldCard.loaded === 3, JSON.stringify(heldCard));
    const gl = await waitFor(() => C(dm, async (id) => { const v = (await window.DMCC.state._fb.get(window.DMCC.roomRef("ledger/" + id))).val(); return v && v.state === "offered" ? v : null; }, gx), 10000, "slot ledger");
    check("slot.ledgerFirst", gl.give === "slot" && gl.slot && gl.slot.state.loaded === 3 && gl.what === "Dust gives Dolan Herringer Light Pepperbox", gl.what);
    const bFree = await C(B2, () => window.SSDNSApp.doc().character.guns.findIndex((x) => !x || !x.weapon));
    await accept(B2, gx);
    await waitFor(async () => (await ledgerState(gx)) === "done", 20000, "slot done");
    await sleep(800);
    const bg = await C(B2, (id) => { const c = window.SSDNSApp.doc().character; const i = c.guns.findIndex((x) => x && x.weapon === id); return i < 0 ? null : Object.assign({ i }, JSON.parse(JSON.stringify(c.guns[i]))); }, PEP);
    check("slot.landedWithState", bg && bg.i === bFree && bg.loaded === 3 && bg.chambers.filter(Boolean).length === 3 && bg.chambers[0] === R32 && bg.dirty && bg.jammed && bg.misStreak === 1 && bg.engraving && bg.notch === "three notches" && bg.ui === "special-pepper", JSON.stringify(bg));
    const ag = await C(A.page, (i) => JSON.parse(JSON.stringify(window.SSDNSApp.doc().character.guns[i])), g0.i);
    check("slot.giverSlotCleared", ag && !ag.weapon && !ag.loaded, JSON.stringify(ag));
    const gChat = await C(dm, async () => { const v = (await window.DMCC.state._fb.get(window.DMCC.roomRef("chat"))).val() || {}; return Object.keys(v).map((k) => v[k].text).filter((t) => t === "Dust gives Dolan Herringer Light Pepperbox").length; });
    check("slot.chatOnce", gChat === 1, gChat);
    const GL = await C(dm, async (id) => (await window.DMCC.state._fb.get(window.DMCC.roomRef("ledger/" + id))).val(), gx);
    await C(B2, (a) => { window.SSDNSGiveSheet.onLedger(a.id, Object.assign({}, a.L, { state: "accepted" })); window.SSDNSGiveSheet.onLedger(a.id, a.L); }, { id: gx, L: GL });
    await C(A.page, (a) => { window.SSDNSGiveSheet.onLedger(a.id, Object.assign({}, a.L, { state: "added" })); window.SSDNSGiveSheet.onLedger(a.id, a.L); }, { id: gx, L: GL });
    const nB = await C(B2, (id) => window.SSDNSApp.doc().character.guns.filter((x) => x && x.weapon === id).length + (window.SSDNSApp.doc().character.items || []).filter((x) => x.weaponId === id).length, PEP);
    check("slot.doubleApply", nB === 1, nB);
    await C(B2, () => { window.SSDNSTrackers.paint(); });
    await shot(B2, '.gun[data-row="' + bFree + '"]', "give-gun-slot-received.png");

    /* ---- every gun slot full on the receiver: it parks in inventory with its state, "To a slot" puts it back ---- */
    await C(B2, () => { ["herringer-light-pocket-pistol", "herringer-light-double-derringer", "herringer-light-pocket-pistol"].forEach((id) => window.SSDNSApp.grantListedWeapon(id)); window.SSDNSApp.applyPatch(() => {}); });
    const fullB = await C(B2, () => window.SSDNSApp.doc().character.guns.every((x) => x && x.weapon));
    const g1 = await seedGun(A.page);
    await C(A.page, (q) => { window.SSDNSTrackers.paint(); document.querySelector(q + " [data-give-slot]").click(); }, '.gun[data-row="' + g1.i + '"]');
    await waitFor(() => C(A.page, () => !!document.querySelector("dialog.give-picker")), 5000, "slot picker 2");
    await C(A.page, () => document.querySelector("dialog.give-picker [data-give-send]").click());
    await sleep(800);
    const fx = await lastXfer(A.page);
    await accept(B2, fx);
    await waitFor(async () => (await ledgerState(fx)) === "done", 20000, "park done");
    await sleep(800);
    const pk = await C(B2, (id) => { const c = window.SSDNSApp.doc().character; const r = (c.items || []).find((x) => x.weaponId === id && x.slotState); return { row: r ? { uid: r.uid, loaded: r.slotState.state.loaded, jammed: r.slotState.state.jammed } : null, slots: c.guns.filter((x) => x && x.weapon === id).length }; }, PEP);
    check("slot.fullParksInInventory", fullB && pk.row && pk.row.loaded === 3 && pk.row.jammed && pk.slots === 1, JSON.stringify(pk));
    await C(B2, () => { window.SSDNSApp.applyPatch((d) => { d.character.guns[3] = { weapon: "", loaded: 0, chambers: [] }; }); window.SSDNSItems.paintSheet(); });
    const unp = await C(B2, (u) => { const b = document.querySelector('[data-give-unpark="' + u + '"]'); if (!b) return "no To a slot"; b.click(); const c = window.SSDNSApp.doc().character; return JSON.stringify({ g: c.guns[3].weapon, loaded: c.guns[3].loaded, row: (c.items || []).some((x) => x.uid === u) }); }, pk.row && pk.row.uid);
    check("slot.toASlot", unp === JSON.stringify({ g: PEP, loaded: 3, row: false }), unp);

    /* ---- the melee / bow card has Give too ---- */
    await C(A.page, () => { window.SSDNSApp.grantListedWeapon("baseball-bat"); window.SSDNSApp.applyPatch((d) => { const m = d.character.melee.find((x) => x && x.weapon === "baseball-bat"); m.notch = "signed"; }); if (window.SSDNSPlaytest && window.SSDNSPlaytest.renderMelee) window.SSDNSPlaytest.renderMelee(); window.SSDNSTrackers.paint(); });
    const mBtn = await waitFor(() => C(A.page, () => { window.SSDNSTrackers.paint(); const b = document.querySelector('#meleeBox [data-give-slot^="melee:"]'); return b ? b.getAttribute("data-give-slot") : ""; }), 8000, "melee Give").catch(() => "");
    check("slot.meleeCardGive", /^melee:\d$/.test(mBtn), mBtn);
    await C(A.page, (q) => document.querySelector('#meleeBox [data-give-slot="' + q + '"]').click(), mBtn);
    await waitFor(() => C(A.page, () => !!document.querySelector("dialog.give-picker")), 5000, "melee picker");
    await C(A.page, () => document.querySelector("dialog.give-picker [data-give-send]").click());
    await sleep(800);
    const mx2 = await lastXfer(A.page);
    await accept(B2, mx2);
    await waitFor(async () => (await ledgerState(mx2)) === "done", 20000, "melee done");
    await sleep(800);
    const bm = await C(B2, () => (window.SSDNSApp.doc().character.melee || []).find((x) => x && x.weapon === "baseball-bat") || null);
    const am = await C(A.page, () => (window.SSDNSApp.doc().character.melee || []).some((x) => x && x.weapon === "baseball-bat"));
    check("slot.meleeMoved", bm && bm.notch === "signed" && !am, JSON.stringify(bm));

    /* ---- screenshots of both sheets after the moves ---- */
    await C(A.page, () => window.SSDNSItems.paintSheet());
    await C(B2, () => window.SSDNSItems.paintSheet());
    await shot(A.page, "#itemGear", "give-after-giver.png");
    await shot(B2, "#itemGear", "give-after-receiver.png");

    /* ---- locked inventory blocks Give ---- */
    await C(dm, (uid) => window.DMCC.pushCommand({ type: "inventory_lock", to: uid, payload: { locked: true } }), uids.Dust);
    await waitFor(() => C(A.page, () => !!window.SSDNSApp.doc().character.inventoryLocked), 10000, "locked");
    const lockedUi = await C(A.page, () => { window.SSDNSItems.paintSheet(); return { give: document.querySelectorAll("#itemList [data-give-item]").length, pool: !!document.querySelector("[data-give-pool]") }; });
    const lockedTry = await C(A.page, () => { const c = window.SSDNSApp.doc().character; return window.SSDNSGive.canOffer(c, { kind: "item", uid: c.items[0].uid, qty: 1 }).reason; });
    check("lock.blocksGive", lockedUi.give === 0 && !lockedUi.pool && /locked/.test(lockedTry), JSON.stringify(lockedUi));

    /* ---- DMCC Give tab: Dolan's inventory, read-only and live ---- */
    await C(dm, (uid) => { document.querySelector("#tab-rewards").click(); const s = document.querySelector("#rewTarget"); s.value = uid; s.dispatchEvent(new Event("change", { bubbles: true })); }, uids.Dolan);
    const inv = await waitFor(() => C(dm, () => { const p = document.querySelector("#rewInvPanel"); return p && !p.hidden && /Hardtack/.test(p.textContent) ? p.textContent : ""; }), 10000, "inv panel");
    check("dmInv.panel", /Hardtack and Jerky ×2/.test(inv) && /arrows 20/.test(inv) && /ES/.test(inv) && /\d+ lb \/ \d+ lb/.test(inv) && /Saddle/.test(inv), inv);
    check("dmInv.collapsible", await C(dm, () => document.querySelector("#rewInvPanel").tagName === "DETAILS"));
    await C(B2, () => window.SSDNSApp.applyPatch((d) => { window.SSDNSItems.add(d.character, { id: "hardtack-jerky-1-day", count: 1 }, { dm: true }); }));
    const live = await waitFor(() => C(dm, () => /Hardtack and Jerky ×3/.test(document.querySelector("#rewInvPanel").textContent)), 10000, "inv live").catch(() => false);
    check("dmInv.live", !!live);
    await shot(dm, "#panel-rewards .rew-split", "give-dm-inventory.png");

    check("noPageErrors", !A.page._errs.length && !dmErrs.length, [].concat(A.page._errs, dmErrs).slice(0, 3).join(" | "));
  } finally {
    await browser.close();
  }
}
main().then(() => {
  console.log(fails.length ? "\nFAILED: " + fails.join(", ") : "\ngive live checks passed");
  process.exit(fails.length ? 1 : 0);
}, (e) => { console.error("FAIL give.live — " + (e && e.stack || e)); process.exit(1); });

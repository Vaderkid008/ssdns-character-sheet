/**
 * 0.3.89: Main tab top block (Jessey 2026-10-19 9:00 PM CT, approved 9:10 PM): portrait | identity fields stacked tight | Eldorite.
 *  - desktop: three columns, Eldorite on the right, no dead gaps in the middle column
 *  - 390 px: the columns stack (portrait, fields, Eldorite), nothing overflows
 *  - the dropdowns still work: Lineage fills Sublineage and the blurb; fields save and load
 * Needs the static server on 127.0.0.1:8765 and Chrome (ssdns-test-all starts the server).
 *   node tools/test-main-layout.mjs
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
const ready = (pg) => pg.waitForFunction(() => window.SSDNSApp && document.querySelector("#selCalling option[value=storyteller]") && document.querySelector('#shards [data-f="shards.white"]') && document.querySelector("#btnApplyKit"), { timeout: 20000 });
const fill = (pg) => pg.evaluate(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  await wait(800);
  window.SSDNSApp.applyPatch((d) => { const c = d.character; c.name = "Singer"; c.calling = "storyteller"; c.level = 1; c.background = "last-ship-hand"; c.player = "Jess";
    c.lineage = "farmers"; c.sublineage = "maccoy"; c.subclass = ""; c.xp = 0; d.shards = Object.assign(d.shards || {}, { white: 12, blue: 3 }); });
  await wait(600);
  const t = document.querySelector("#tab-main"); if (t) t.click();
  await wait(200);
});
const measure = (pg) => pg.evaluate(() => {
  const r = (n) => { const b = n.getBoundingClientRect(); return { l: Math.round(b.left), r: Math.round(b.right), t: Math.round(b.top), b: Math.round(b.bottom), w: Math.round(b.width) }; };
  const top = document.querySelector("#page-main .topblock");
  const id = top.querySelector(".identity"), grid = top.querySelector(".topgrid"), eld = top.querySelector(".eldorite-col") || document.querySelector("#page-main .eldorite-bar");
  /* rows of the middle column: group children by top, then measure the gaps between rows */
  const kids = [...grid.children].filter((n) => n.offsetParent !== null && n.getClientRects().length).map(r).sort((a, b) => a.t - b.t);
  const rows = [];
  kids.forEach((k) => { const row = rows.find((x) => Math.abs(x.t - k.t) < 6); if (row) { row.b = Math.max(row.b, k.b); } else rows.push({ t: k.t, b: k.b }); });
  const gaps = rows.slice(1).map((x, i) => x.t - rows[i].b);
  const gs = getComputedStyle(grid);
  const inner = r(grid);
  return { id: r(id), grid: inner, eld: r(eld), shardsInEld: !!eld.querySelector("#shards .shard"), gaps, tail: inner.b - parseFloat(gs.paddingBottom) - parseFloat(gs.borderBottomWidth) - Math.max(...rows.map((x) => x.b)),
    lead: rows.length ? rows[0].t - inner.t - parseFloat(gs.paddingTop) - parseFloat(gs.borderTopWidth) : 99,
    pageOverflow: document.documentElement.scrollWidth > window.innerWidth + 1, eldBelowGridOld: !document.querySelector("#page-main > .eldorite-bar") };
});
try {
  const pg = await browser.newPage();
  const errs = [];
  pg.on("pageerror", (e) => errs.push(String(e)));
  await pg.setViewport({ width: 1400, height: 1000 });
  await pg.goto(ORIGIN + "/index.html", { waitUntil: "domcontentloaded" });
  await ready(pg); await fill(pg);
  const d = await measure(pg);
  check("desktop.threeColumns", d.id.r <= d.grid.l && d.grid.r <= d.eld.l && Math.abs(d.id.t - d.grid.t) < 4 && Math.abs(d.grid.t - d.eld.t) < 4, J(d));
  check("desktop.eldoriteRight", d.shardsInEld && d.eld.l > d.grid.r && d.eldBelowGridOld, J(d));
  check("desktop.noDeadGaps", d.gaps.length >= 4 && d.gaps.every((g) => g <= 14) && d.lead <= 6 && d.tail <= 16, J({ gaps: d.gaps, lead: d.lead, tail: d.tail }));
  check("desktop.noOverflow", !d.pageOverflow);
  /* dropdowns: Lineage fills Sublineage and the blurb */
  const dd = await pg.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const set = (sel, v) => { const n = document.querySelector(sel); n.value = v; n.dispatchEvent(new Event("input", { bubbles: true })); n.dispatchEvent(new Event("change", { bubbles: true })); };
    const subs = () => [...document.querySelectorAll("#selSublineage option")].map((o) => o.value).filter(Boolean);
    const blurb = () => document.querySelector("#lineageCard").textContent;
    set("#selLineage", "farmers"); await wait(300);
    const a = { subs: subs(), blurb: blurb() };
    set("#selSublineage", "maccoy"); await wait(200);
    set("#selLineage", "mountain-folk"); await wait(300);
    const b = { subs: subs(), blurb: blurb() };
    set("#selLineage", "farmers"); await wait(300); set("#selSublineage", "maccoy");
    set("#selCalling", "storyteller"); set("#inLevel", "3"); set("#selBackground", "last-ship-hand"); set("#inPlayer", "Jess"); set("#inXP", "900"); set("#charName", "Singer");
    set('#shards [data-f="shards.white"]', "12"); set('#shards [data-f="shards.blue"]', "3");
    await wait(1500);
    return { a, b };
  });
  check("lineage.fillsSublineage", dd.a.subs.includes("maccoy") && dd.b.subs.length > 0 && J(dd.a.subs) !== J(dd.b.subs), J(dd));
  check("lineage.fillsBlurb", /Farmers/.test(dd.a.blurb) && /Mountain Folk/.test(dd.b.blurb), J([dd.a.blurb.slice(0, 40), dd.b.blurb.slice(0, 40)]));
  await pg.reload({ waitUntil: "domcontentloaded" }); await ready(pg);
  await new Promise((r) => setTimeout(r, 1200));
  const got = await pg.evaluate(() => { const v = (s) => document.querySelector(s).value;
    return { name: v("#charName"), calling: v("#selCalling"), level: v("#inLevel"), bg: v("#selBackground"), player: v("#inPlayer"), lineage: v("#selLineage"), sub: v("#selSublineage"), xp: v("#inXP"),
      white: v('#shards [data-f="shards.white"]'), blue: v('#shards [data-f="shards.blue"]'), es: document.querySelector('[data-out="esTotal"]').textContent }; });
  check("fields.saveLoad", got.name === "Singer" && got.calling === "storyteller" && got.level === "3" && got.bg === "last-ship-hand" && got.player === "Jess" && got.lineage === "farmers" && got.sub === "maccoy" && got.xp === "900" && got.white === "12" && got.blue === "3" && /42 ES/.test(got.es), J(got));
  check("sheet.noPageErrors", errs.length === 0, errs.join(" | "));
  await pg.close(); /* one tab at a time: the sheet syncs across tabs */

  const ph = await browser.newPage();
  const phErrs = [];
  ph.on("pageerror", (e) => phErrs.push(String(e)));
  await ph.setViewport({ width: 390, height: 900 });
  await ph.goto(ORIGIN + "/index.html", { waitUntil: "domcontentloaded" });
  await ready(ph); await fill(ph);
  const m = await measure(ph);
  check("narrow.stacks", m.id.b <= m.grid.t && m.grid.b <= m.eld.t && Math.abs(m.id.l - m.grid.l) < 4 && Math.abs(m.grid.l - m.eld.l) < 4, J(m));
  check("narrow.noOverflow", !m.pageOverflow, J(m));
  check("narrow.noDeadGaps", m.gaps.every((g) => g <= 14) && m.tail <= 16, J({ gaps: m.gaps, tail: m.tail }));
  check("narrow.noPageErrors", phErrs.length === 0, phErrs.join(" | "));
} finally {
  await browser.close();
}
if (failures.length) { console.log("\n" + failures.length + " failed: " + failures.join(", ")); process.exit(1); }
console.log("\nall Main tab layout checks passed");

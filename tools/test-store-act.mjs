/**
 * L0193 (Jessey 2026-10-20, 10:23 AM): Act I stores sell only the Light ChaosMaker, at 4,000 ES (store markup;
 * the PHB list price stays 2,000). Medium / Heavy stay out of Act I stores. Later acts are unchanged.
 * Gated by optional store-row fields (minAct / acts / actPrices). The act is the room setting meta.act (DMCC Stores tab "Campaign act"; missing = Act I).
 * Needs the static server (ssdns-test-all starts it) and Chrome.   node tools/test-store-act.mjs
 */
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ORIGIN = process.env.SSDNS_ORIGIN || "http://127.0.0.1:8765";
const failures = [];
const J = (x) => JSON.stringify(x);
function check(id, cond, detail) { if (!cond) failures.push(id); console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + detail : "")); }
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
const L = "pony-arms-chaosmaker-light", M = "pony-arms-chaosmaker-medium", H = "pony-arms-chaosmaker-heavy";

/* node: data + gate logic */
const ctx = { console }; ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(read("dm/assets/js/store-stock.js"), ctx);
const S = ctx.SSDNSStore;
const items = JSON.parse(read("dm/assets/data/store-items.json"));
const row = (list, id) => list.find((r) => r && r.id === id);
check("data.phbPricesUnchanged", row(items, L).price_es === 2000 && row(items, M).price_es === 2500 && row(items, H).price_es === 3000);
check("rules.phbPriceUnchanged", /"id": "pony-arms-chaosmaker-light"[\s\S]{0,400}?"cost": "2,000"/.test(read("assets/data/rules.js")));
check("act.default1", S.normAct(undefined) === 1 && S.normAct(null) === 1 && S.normAct("") === 1 && S.normAct(2) === 2 && S.normAct("3") === 3);
const a1 = S.forAct(items, 1);
check("data.rowFields", row(items, M).minAct === 2 && row(items, H).minAct === 2 && row(items, L).actPrices && row(items, L).actPrices["1"] === 4000 && row(items, L).minAct == null);
check("data.onlyChaosMakersGated", items.filter((r) => r.minAct != null || r.acts != null || r.actPrices != null).map((r) => r.id).sort().join() === [H, L, M].join());
check("act1.light4000", row(a1, L) && row(a1, L).price_es === 4000 && row(a1, L).list_price_es === 2000 && row(a1, L).actPriced === true, J(row(a1, L)));
check("acts.field", S.inAct({ acts: [2, 3] }, 1) === false && S.inAct({ acts: [2, 3] }, 2) === true && S.inAct({}, 1) === true && S.inAct({ minAct: 3 }, 2) === false);
check("act1.mediumHeavyHidden", !row(a1, M) && !row(a1, H));
check("act1.othersSame", a1.length === items.length - 2 && row(a1, "shells-12-ga-10") === row(items, "shells-12-ga-10"));
check("act1.sourceUntouched", row(items, L).price_es === 2000 && !row(items, L).actPrice);
[2, 3].forEach((n) => {
  const an = S.forAct(items, n);
  check("act" + n + ".normalRows", an.length === items.length && row(an, L).price_es === 2000 && row(an, M).price_es === 2500 && row(an, H).price_es === 3000);
});
const all = () => 0; /* rng 0: every eligible row */
const rand1 = S.randomStock(a1, "gun", "city", all).map((it) => S.lineFromItem(it, "gun", false));
check("act1.randomGun", row(rand1, L) && row(rand1, L).price === 4000 && !row(rand1, M) && !row(rand1, H), J(rand1.filter((r) => /chaos/i.test(r.id))));
const rand2 = S.randomStock(S.forAct(items, 2), "gun", "city", all).map((it) => S.lineFromItem(it, "gun", false));
check("act2.randomGun", row(rand2, L).price === 2000 && row(rand2, M).price === 2500 && row(rand2, H).price === 3000);
const merch1 = S.merchantStock(a1, all, { min: 400, max: 400, maxRare: 99 });
check("act1.merchantNoExtraMarkup", row(merch1, L) && row(merch1, L).price === 4000 && !row(merch1, M) && !row(merch1, H), J(row(merch1, L)));
check("act1.merchantLineNoMarkup", S.lineFromItem(row(a1, L), "traveling", true).price === 4000);
const old = [{ id: L, name: "Pony Arms ChaosMaker, Light", price: 2000, checked: true }, { id: M, price: 2500, checked: true }, { id: H, price: 3000, checked: true }, { id: "x", price: 5, checked: true }];
const g1 = S.gateLines(old, 1, items);
check("act1.gateOldLines", g1.length === 2 && g1[0].price === 4000 && g1[1].id === "x" && old[0].price === 2000, J(g1));
check("act2.gateKeeps", S.gateLines(old, 2, items).length === 4 && S.gateLines(old, 2, items)[0].price === 2000);

function portOpen(port) { return new Promise((r) => { const s = net.connect({ port, host: "127.0.0.1" }, () => { s.end(); r(true); }); s.on("error", () => r(false)); }); }
const port = Number(new URL(ORIGIN).port || 80);
if (!(await portOpen(port))) { console.log("FAIL  server not running on " + ORIGIN); process.exit(1); }
const puppeteer = (await import("/tmp/pup/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js")).default;
const browser = await puppeteer.launch({ executablePath: "/opt/google/chrome/chrome", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
try {
  const pg = await browser.newPage();
  await pg.setViewport({ width: 1400, height: 1000 });
  const errs = [];
  pg.on("pageerror", (e) => errs.push(String(e)));
  await pg.goto(ORIGIN + "/dm/index.html?demo=1", { waitUntil: "domcontentloaded" });
  await pg.waitForFunction(() => window.DMCC && window.SSDNSStore && window.SSDNSStore.forAct, { timeout: 20000 });
  await new Promise((r) => setTimeout(r, 1200));
  await pg.evaluate(() => { localStorage.removeItem("ssdns.dm.storePreview"); const b = [...document.querySelectorAll("button")].find((x) => /load demo table/i.test(x.textContent)); b && b.click(); });
  await new Promise((r) => setTimeout(r, 1500));
  const r = await pg.evaluate(async () => {
    const wait = (ms) => new Promise((res) => setTimeout(res, ms));
    const out = {};
    document.getElementById("tab-store").click(); await wait(300);
    const town = document.querySelector('input[name="townSize"][value="city"]'); town.checked = true; town.dispatchEvent(new Event("change", { bubbles: true }));
    await wait(200);
    const pick = document.querySelector('[data-store-pick="gun"]'); if (!pick.checked) pick.click();
    await wait(200);
    const sel = document.getElementById("storeAct");
    out.actDefault = sel && sel.value;
    out.metaAct = DMCC.state.meta ? DMCC.state.meta.act : "nometa";
    const lines = () => [...document.querySelectorAll(".store-card")].filter((c) => /Gun Store/.test(c.querySelector("h3").textContent))
      .flatMap((c) => [...c.querySelectorAll(".store-line")]).map((l) => ({ name: l.querySelector("b").textContent, price: (l.querySelector("[data-preview-price]") || {}).value || (l.querySelector(".store-line-meta .fine") || {}).textContent }));
    const rnd = Math.random; Math.random = () => 0;
    document.querySelector('[data-store-random="gun"]').click(); await wait(300);
    Math.random = rnd;
    out.act1 = lines().filter((l) => /ChaosMaker/.test(l.name));
    document.querySelector('[data-store-open="gun"]').click(); await wait(500);
    out.act1Live = lines().filter((l) => /ChaosMaker/.test(l.name));
    document.querySelector('[data-store-edit="gun"]').click(); await wait(300);
    sel.value = "2"; sel.dispatchEvent(new Event("change", { bubbles: true })); await wait(400);
    out.metaAct2 = DMCC.state.meta ? DMCC.state.meta.act : "nometa";
    Math.random = () => 0;
    document.querySelector('[data-store-random="gun"]').click(); await wait(300);
    Math.random = rnd;
    out.act2 = lines().filter((l) => /ChaosMaker/.test(l.name));
    /* back to Act I: an Act II draft is gated in place */
    sel.value = "1"; sel.dispatchEvent(new Event("change", { bubbles: true })); await wait(400);
    out.back1 = lines().filter((l) => /ChaosMaker/.test(l.name));
    return out;
  });
  const light = (list) => list.find((l) => /Light/.test(l.name));
  check("dm.actDefaultAct1", r.actDefault === "1", J(r.actDefault));
  check("dm.act1.preview", r.act1.length === 1 && light(r.act1) && String(light(r.act1).price).replace(/\D/g, "") === "4000", J(r.act1));
  check("dm.act1.live", r.act1Live.length === 1 && /4000/.test(String(light(r.act1Live).price)), J(r.act1Live));
  check("dm.act2.saved", r.metaAct2 === 2, J(r.metaAct2));
  check("dm.act2.normalRows", r.act2.length === 3 && String(light(r.act2).price) === "2000" && r.act2.some((l) => /Medium/.test(l.name) && l.price === "2500") && r.act2.some((l) => /Heavy/.test(l.name) && l.price === "3000"), J(r.act2));
  check("dm.backToAct1Gates", r.back1.length === 1 && String(light(r.back1).price) === "4000", J(r.back1));
  check("noPageErrors", !errs.length, J(errs));
} finally {
  await browser.close();
}
if (failures.length) { console.log("FAILED: " + failures.join(", ")); process.exit(1); }
console.log("ALL OK");

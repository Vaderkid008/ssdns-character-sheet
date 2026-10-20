/**
 * Jessey's 9:17 AM answers (2026-10-20), relayed by Encounter Bot on the item template review:
 *  (a) slugs sell as their own rows at the buckshot price (BOOK1 L4212) and fill the slug pool; the shotgun card offers it.
 *  (b) C10: a dynamite arrow keeps its stick's weight (1.05 lb), so making one does not drop carried weight.
 *  (c) the Saddle of the Phantom Steed is carried (25 lb) until the Spectral Horse is summoned; then it rides on the horse.
 * Needs the static server (ssdns-test-all starts it) and Chrome.   node tools/test-slug-arrow-saddle.mjs
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

/* node: store rows, plans, weights */
const BOOK1 = process.env.SSDNS_BOOK1 || "/workspace/1_SSDNS_PHB/BOOK1.md";
const book = fs.existsSync(BOOK1) ? fs.readFileSync(BOOK1, "utf8").split("\n") : null;
const ctx = { console }; ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
["dm/assets/js/store-stock.js", "assets/data/item-catalog.js", "assets/data/item-catalog-gear.js"].forEach((f) => vm.runInContext(read(f), ctx, { filename: f }));
const Store = ctx.SSDNSStore;
const store = JSON.parse(read("dm/assets/data/store-items.json"));
const byIdRow = (id) => store.find((r) => r.id === id);
[["410", ".410"], ["12-ga", "12 ga"], ["10-ga", "10 ga"]].forEach(([k, cal]) => {
  const buck = byIdRow("shells-" + k + "-10"), slug = byIdRow("slug-shells-" + k + "-10");
  check("slug.row." + k, slug && buck && slug.price_es === buck.price_es && slug.weight_lb === buck.weight_lb && J(slug.stores) === J(buck.stores) &&
    slug.minTown === buck.minTown && slug.rarity === buck.rarity && slug.bookLine === 4212 && /^Slug shells/.test(slug.name) && /^Buckshot shells/.test(buck.name), J([buck, slug]));
  const p = Store.grantPlan({ id: "slug-shells-" + k + "-10", name: slug && slug.name });
  check("slug.planById." + k, p.kind === "ammo" && p.type === "slug" && p.caliber === cal && p.qty === 10, J(p));
  const pb = Store.grantPlan({ id: "shells-" + k + "-10", name: buck && buck.name });
  check("buck.planById." + k, pb.kind === "ammo" && pb.type === "buck" && pb.caliber === cal, J(pb));
});
const pn = Store.grantPlan({ name: "Slug shells, 12 ga (10)" });
check("slug.planByName", pn.kind === "ammo" && pn.type === "slug" && pn.caliber === "12 ga" && pn.qty === 10, J(pn));
const pbn = Store.grantPlan({ name: "Buckshot shells, .410 (10)" });
check("buck.planByName", pbn.type === "buck" && pbn.caliber === ".410", J(pbn));
if (book) check("book.L4212", /buckshot or slugs at the same price/i.test(book[4211] || ""), book[4211]);
else console.log("skip  book.L4212 (no BOOK1.md on this machine)");
const CW = ctx.SSDNS_CARRY_WEIGHTS.ammoEach;
check("weights.dynamiteArrow", CW["arrows:dynamite"] === 1.05 && CW.arrows === 0.05 && CW.slug === 0.1, J(CW));

function portOpen(port) { return new Promise((r) => { const s = net.connect({ port, host: "127.0.0.1" }, () => { s.end(); r(true); }); s.on("error", () => r(false)); }); }
const port = Number(new URL(ORIGIN).port || 80);
if (!(await portOpen(port))) { console.log("FAIL  server not running on " + ORIGIN); process.exit(1); }
const puppeteer = (await import("/tmp/pup/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js")).default;
const browser = await puppeteer.launch({ executablePath: "/opt/google/chrome/chrome", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
try {
  const pg = await browser.newPage();
  const errs = [];
  pg.on("pageerror", (e) => errs.push(String(e)));
  await pg.goto(ORIGIN + "/index.html", { waitUntil: "domcontentloaded" });
  await pg.waitForFunction(() => window.SSDNSApp && window.SSDNSSheet && window.SSDNSSheet.grantBought && window.SSDNSItems && window.SSDNSTrackers, { timeout: 20000 });
  const r = await pg.evaluate(async () => {
    const wait = (ms) => new Promise((res) => setTimeout(res, ms));
    await wait(800);
    const A = window.SSDNSApp, I = window.SSDNSItems, T = window.SSDNSTrackers;
    const c = () => A.doc().character;
    const wt = () => I.weightReport(c()).carried;
    const out = {};
    /* (a) slugs: buy, pool, shotgun picker */
    A.applyPatch((d) => {
      d.character.ammo = []; d.character.items = []; d.character.feats = []; d.character.level = 5;
      d.character.guns[0].weapon = "single-barrel-farm-shotgun"; d.character.guns[0].ammoPool = "";
      d.character.guns[0].chamber = "medium|12 ga"; d.character.guns[0].tier = "medium"; d.character.guns[0].chamberSet = true;
    });
    await wait(200);
    const w0 = wt();
    window.SSDNSSheet.grantBought({ id: "shells-12-ga-10", name: "Buckshot shells, 12 ga (10)", price: 100, store: "gun" });
    window.SSDNSSheet.grantBought({ id: "slug-shells-12-ga-10", name: "Slug shells, 12 ga (10)", price: 100, store: "gun" });
    await wait(200);
    out.ammo = JSON.parse(JSON.stringify(c().ammo));
    out.wBuy = Math.round((wt() - w0) * 100) / 100;
    out.choices = A.ammoChoices(0);
    A.applyPatch(() => {}); await wait(200);
    const sel = document.querySelector('[data-ammopool="0"]');
    out.opts = sel ? [...sel.options].map((o) => ({ v: o.value, t: o.textContent })) : null;
    const slugIdx = c().ammo.findIndex((a) => a.type === "slug");
    if (sel) { sel.value = String(slugIdx); sel.dispatchEvent(new Event("change", { bubbles: true })); }
    await wait(200);
    out.pickedPool = c().guns[0].ammoPool;
    out.slugIdx = slugIdx;
    /* (b) dynamite arrow keeps the stick's weight */
    A.applyPatch((d) => {
      const ch = d.character;
      ch.feats = ["powder-man"]; ch.items = []; ch.ammo = [{ type: "arrows", caliber: "", count: 5 }];
      ch.guns[0].weapon = "longbow"; ch.guns[0].ammoPool = "";
      I.add(ch, I.byId("dynamite-stick-standard-fuse"), { dm: true });
      I.add(ch, I.byId("dynamite-stick-standard-fuse"), { dm: true });
    });
    await wait(200);
    const b0 = wt();
    let made;
    A.applyPatch((d) => { made = T.makeDynamite(d.character); });
    await wait(200);
    out.made = made;
    out.bDelta = Math.round((wt() - b0) * 100) / 100;
    out.bAmmo = JSON.parse(JSON.stringify(c().ammo));
    out.bSlots = I.weightReport(c()).slots.ammo;
    /* (c) saddle */
    A.applyPatch((d) => { const ch = d.character; ch.feats = []; ch.items = []; ch.ammo = []; ch.guns[0].weapon = ""; I.add(ch, I.byId("saddle-of-the-phantom-steed"), { dm: true }); });
    await wait(200);
    const saddle = () => c().items.find((x) => x.catalogId === "saddle-of-the-phantom-steed");
    out.s0 = wt();
    out.s0row = (document.querySelector("[data-item-summon]") || {}).textContent || null;
    I.setSummoned(saddle().uid, true); await wait(200);
    out.s1 = wt();
    out.s1row = (document.querySelector("[data-item-summon]") || {}).textContent || null;
    out.s1wt = [...document.querySelectorAll(".item-wt")].map((n) => n.textContent).join("|");
    document.querySelector("[data-item-summon]").click(); await wait(200);
    out.s2 = wt(); out.s2flag = !!saddle().summoned;
    /* Use the saddle (casts Phantom Steed) marks the horse summoned; a long rest clears it */
    const useBtn = document.querySelector('[data-item-use="' + saddle().uid + '"]');
    out.hasUse = !!useBtn;
    if (useBtn) useBtn.click();
    await wait(300);
    out.s3flag = !!(saddle() && saddle().summoned); out.s3 = wt(); out.s3count = saddle() ? saddle().count : null;
    A.applyPatch((d) => { I.recharge(d.character, "long"); });
    await wait(200);
    out.s4flag = !!saddle().summoned; out.s4 = wt();
    /* the flag survives a save round trip */
    I.setSummoned(saddle().uid, true);
    const m = A.migrate(JSON.parse(JSON.stringify(A.doc())));
    out.migFlag = !!(m.character.items.find((x) => x.catalogId === "saddle-of-the-phantom-steed") || {}).summoned;
    I.setSummoned(saddle().uid, false);
    return out;
  });
  const buck = r.ammo.filter((a) => a.type === "buck"), slug = r.ammo.filter((a) => a.type === "slug");
  check("a.buy.pools", buck.length === 1 && buck[0].caliber === "12 ga" && buck[0].count === 10 && slug.length === 1 && slug[0].caliber === "12 ga" && slug[0].count === 10, J(r.ammo));
  check("a.buy.weight", r.wBuy === 2, String(r.wBuy));
  check("a.shotgun.choices", r.choices.some((x) => x.type === "slug" && x.count === 10) && r.choices.some((x) => x.type === "buck"), J(r.choices));
  check("a.shotgun.select", Array.isArray(r.opts) && r.opts.some((o) => /slug/i.test(o.t)), J(r.opts));
  check("a.shotgun.pickSlug", String(r.pickedPool) === String(r.slugIdx), J([r.pickedPool, r.slugIdx]));
  check("b.made", r.made && r.made.ok && r.made.count === 1, J(r.made));
  check("b.weightSame", r.bDelta === 0, J({ delta: r.bDelta, ammo: r.bAmmo }));
  check("b.ammoSlot", Math.abs(r.bSlots - (4 * 0.05 + 1.05)) < 1e-9, String(r.bSlots));
  check("c.unsummoned25", r.s1 === r.s0 - 25, J([r.s0, r.s1]));
  check("c.rowToggle", /not summoned/i.test(r.s0row || "") && /summoned ✓/.test(r.s1row || "") && /Spectral Horse/.test(r.s1wt), J([r.s0row, r.s1row, r.s1wt]));
  check("c.dismissCarries", r.s2 === r.s0 && r.s2flag === false, J([r.s2, r.s2flag]));
  check("c.useSummons", r.hasUse && r.s3flag === true && r.s3 === r.s0 - 25 && r.s3count === 1, J([r.hasUse, r.s3flag, r.s3, r.s3count]));
  check("c.longRestClears", r.s4flag === false && r.s4 === r.s0, J([r.s4flag, r.s4]));
  check("c.flagSaved", r.migFlag === true);
  check("noPageErrors", !errs.length, J(errs));
} finally {
  await browser.close();
}
if (failures.length) { console.log("FAILED: " + failures.join(", ")); process.exit(1); }
console.log("ALL OK");

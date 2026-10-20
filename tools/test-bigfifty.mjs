/**
 * C1 (Encounter Bot item template review, 2026-10-20): Big Fifty .50-90 rounds bought or given land in the
 * Big Fifty pool (type "bigfifty", 0.15 lb a round), the Big Fifty's pool picker offers that pool, and old saves
 * with a ".50-90" cartridge pool are moved over. Needs the static server (ssdns-test-all starts it) and Chrome.
 *   node tools/test-bigfifty.mjs
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

/* node: store plan + weights */
const ctx = { console }; ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
["dm/assets/js/store-stock.js", "assets/data/item-catalog.js", "assets/data/item-catalog-gear.js"].forEach((f) => vm.runInContext(read(f), ctx, { filename: f }));
const Store = ctx.SSDNSStore;
const byId = Store.grantPlan({ id: "big-fifty-cartridges-50-90-10", name: "Big Fifty cartridges, .50-90 (10)" });
check("plan.byId", byId.kind === "ammo" && byId.type === "bigfifty" && byId.caliber === ".50-90" && byId.qty === 10, J(byId));
const byName = Store.grantPlan({ name: "Big Fifty cartridges, .50-90 (10)" });
check("plan.byName", byName.kind === "ammo" && byName.type === "bigfifty" && byName.qty === 10, J(byName));
const light = Store.grantPlan({ id: "cartridges-light-20", name: "Cartridges, Light (20)" });
check("plan.lightStillCartridge", light.kind === "cartridge" && light.caliber === "Light" && light.qty === 20, J(light));
check("weights.bigfifty", ctx.SSDNS_CARRY_WEIGHTS.ammoEach.bigfifty === 0.15 && ctx.SSDNS_CARRY_WEIGHTS.ammoEach.cartridge === 0.05);
const store = JSON.parse(read("dm/assets/data/store-items.json"));
const row = store.find((r) => r.id === "big-fifty-cartridges-50-90-10");
check("store.row", row && row.price_es === 200 && row.weight_lb === 1.5 && row.bookLine === 4207, J(row));

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
  await pg.waitForFunction(() => window.SSDNSApp && window.SSDNSSheet && window.SSDNSSheet.grantBought && window.SSDNSDmJoin && window.SSDNSDmJoin._handle && window.SSDNSItems, { timeout: 20000 });
  const r = await pg.evaluate(async () => {
    const wait = (ms) => new Promise((res) => setTimeout(res, ms));
    await wait(800);
    const A = window.SSDNSApp, I = window.SSDNSItems;
    const c = () => A.doc().character;
    const out = {};
    A.applyPatch((d) => {
      d.character.ammo = [{ type: "cartridge", caliber: "Light", count: 20 }];
      d.character.items = [];
      d.character.guns[0].weapon = "bison-big-fifty-buffalo-rifle";
      d.character.guns[0].chamber = "heavy|.50-90"; d.character.guns[0].tier = "heavy"; d.character.guns[0].chamberSet = true;
    });
    await wait(200);
    const w0 = I.weightReport(c()).carried;
    window.SSDNSSheet.grantBought({ id: "big-fifty-cartridges-50-90-10", name: "Big Fifty cartridges, .50-90 (10)", price: 200, store: "gun" });
    await wait(200);
    out.afterBuy = JSON.parse(JSON.stringify(c().ammo));
    out.weightBuy = Math.round((I.weightReport(c()).carried - w0) * 100) / 100;
    out.choices = A.ammoChoices(0);
    A.applyPatch(() => {}); await wait(200);
    const sel = document.querySelector('[data-ammopool="0"]');
    out.selectOpts = sel ? [...sel.options].map((o) => o.textContent) : null;
    window.SSDNSDmJoin._handle({ id: "cmd_b50", type: "reward_item", payload: { text: "Big Fifty cartridges, .50-90 (10)", qty: 1, grantId: "g_b50_" + Date.now() } });
    await wait(300);
    out.afterGive = JSON.parse(JSON.stringify(c().ammo));
    /* old save: a .50-90 cartridge pool from before 0.3.88 */
    const old = JSON.parse(JSON.stringify(A.doc()));
    old.character.ammo = [{ type: "cartridge", caliber: "Light", count: 5 }, { type: "cartridge", caliber: ".50-90", count: 7 }];
    const mig = A.migrate(old);
    out.migrated = mig.character.ammo;
    out.migNotes = mig.migrationNotes || [];
    return out;
  });
  const fifty = r.afterBuy.filter((a) => a.type === "bigfifty");
  check("buy.bigFiftyPool", fifty.length === 1 && fifty[0].caliber === ".50-90" && fifty[0].count === 10 && !r.afterBuy.some((a) => a.type === "cartridge" && /50-90/.test(a.caliber)), J(r.afterBuy));
  check("buy.weight15", r.weightBuy === 1.5, String(r.weightBuy));
  check("gunCard.poolPicker", r.choices.length === 1 && r.choices[0].type === "bigfifty" && r.choices[0].count === 10, J(r.choices));
  check("gunCard.selectShowsPool", Array.isArray(r.selectOpts) && r.selectOpts.some((t) => /Big Fifty/.test(t)), J(r.selectOpts));
  const fifty2 = r.afterGive.filter((a) => a.type === "bigfifty");
  check("give.bigFiftyPool", fifty2.length === 1 && fifty2[0].count === 20, J(r.afterGive));
  check("oldSave.moved", r.migrated[1].type === "bigfifty" && r.migrated[1].caliber === ".50-90" && r.migrated[1].count === 7 && r.migrated[0].type === "cartridge" && r.migrated.length === 2, J(r.migrated));
  check("oldSave.note", r.migNotes.some((n) => /Big Fifty/.test(n)), J(r.migNotes));
  check("noPageErrors", !errs.length, J(errs));
} finally {
  await browser.close();
}
if (failures.length) { console.log("FAILED: " + failures.join(", ")); process.exit(1); }
console.log("ALL OK");

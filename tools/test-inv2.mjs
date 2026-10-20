/**
 * inv2 (2026-10-20, Jessey): store-bought arrows / bolts / sling stones / needles / powder & caps / shells fill
 * their Ammo pool (the #100 quiver / bolt / pouch pools) instead of a gear note line; packs Unpack into real
 * catalog items; the starting kit lands its pack / tools / clothes as real items; no doubles; old saves load.
 *   node tools/test-inv2.mjs          (browser part needs ssdns-test-all's static server on 127.0.0.1:8765)
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

/* ---- store plans */
const sb = { console }; sb.window = sb; sb.globalThis = sb; vm.createContext(sb);
vm.runInContext(read("dm/assets/js/store-stock.js"), sb, { filename: "store-stock.js" });
const Store = sb.SSDNSStore;
const want = {
  "arrows-20": ["arrows", "", 20], "crossbow-bolts-20": ["bolts", "", 20], "sling-stones-20": ["stones", "", 20],
  "blowpipe-needles-50": ["needles", "", 50], "powder-ball-and-caps-20-shots": ["percussion", "", 20],
  "shells-410-10": ["buck", ".410", 10], "shells-12-ga-10": ["buck", "12 ga", 10], "shells-10-ga-10": ["buck", "10 ga", 10]
};
const storeRows = JSON.parse(read("dm/assets/data/store-items.json"));
for (const [id, [type, cal, qty]] of Object.entries(want)) {
  const row = storeRows.find((r) => r.id === id);
  const p = Store.grantPlan(row || { id });
  check("plan." + id, row && p.kind === "ammo" && p.type === type && p.caliber === cal && p.qty === qty, JSON.stringify(p));
}
const byName = Store.grantPlan({ name: "Crossbow bolts (20)" });
check("plan.byName.bolts", byName.kind === "ammo" && byName.type === "bolts" && byName.qty === 20, JSON.stringify(byName));
check("plan.cartridge.unchanged", Store.grantPlan({ id: "cartridges-light-20" }).kind === "cartridge");
check("plan.gear.unchanged", Store.grantPlan({ id: "hemp-rope-50-ft", name: "Hemp rope (50 ft)" }).kind === "gear");
const ammoRows = storeRows.filter((r) => r.category === "ammo");
const notPooled = ammoRows.filter((r) => { const k = Store.grantPlan(r).kind; return k !== "ammo" && k !== "cartridge"; });
check("plan.everyAmmoRowPools", notPooled.length === 0, notPooled.map((r) => r.id).join(","));
const trk = read("assets/js/trackers.js");
for (const t of ["bolts", "stones", "needles"]) check("pool.type." + t, new RegExp('id: "' + t + '"').test(trk));

/* ---- items: unpack */
const s2 = { console }; s2.window = s2; s2.globalThis = s2;
s2.document = { readyState: "complete", getElementById: () => null, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] };
vm.createContext(s2);
for (const f of ["assets/data/rules.js", "assets/data/item-catalog.js", "assets/data/item-catalog-gear.js", "assets/js/items.js", "assets/js/kits.js"]) vm.runInContext(read(f), s2, { filename: f });
const I = s2.SSDNSItems;
const PC = s2.SSDNS_PACK_CONTENTS;
const packIds = ["trail-kit", "claim-pack", "alley-kit", "circuit-trunk", "saloon-kit", "circuit-kit", "book-trunk"];
check("packs.all", packIds.every((id) => PC[id]), Object.keys(PC).join(","));
const missing = [];
for (const id of packIds) for (const [cid] of PC[id].items) if (!I.byId(cid)) missing.push(id + ">" + cid);
check("packs.contentsInCatalog", missing.length === 0, missing.join(","));
const c = { items: [], equipment: "" };
I.add(c, { catalogId: "trail-kit", count: 2 }, { dm: true });
const before = I.totalWeight ? I.totalWeight(c.items) : null;
const pack = c.items.find((x) => x.catalogId === "trail-kit");
const r1 = I.unpack(c, pack.uid);
check("unpack.ok", r1.ok, r1.reason);
check("unpack.onePackUsed", (c.items.find((x) => x.catalogId === "trail-kit") || {}).count === 1);
const torches = c.items.filter((x) => x.catalogId === "torch-pitch-stick").reduce((n, x) => n + (Number(x.count) || 1), 0);
check("unpack.torches10", torches === 10, String(torches));
check("unpack.hardtack10", c.items.filter((x) => x.catalogId === "hardtack-jerky-1-day").reduce((n, x) => n + (Number(x.count) || 1), 0) === 10);
check("unpack.rope", c.items.some((x) => x.catalogId === "hemp-rope-50-ft"));
if (before != null) check("unpack.weightSame", Math.abs(I.totalWeight(c.items) - before) < 0.001, before + " -> " + I.totalWeight(c.items));
const p2 = c.items.find((x) => x.catalogId === "trail-kit");
I.unpack(c, p2.uid);
check("unpack.lastPackGone", !c.items.some((x) => x.catalogId === "trail-kit" && Number(x.count) > 0));
check("unpack.stacked", c.items.filter((x) => x.catalogId === "torch-pitch-stick").length <= 2);
const c2 = { items: [], equipment: "" };
I.add(c2, { catalogId: "book-trunk", count: 1 }, { dm: true });
I.unpack(c2, c2.items[0].uid);
check("unpack.notesLine", /From Book trunk: book of lore, little bag of sand, small knife/.test(c2.equipment), c2.equipment);
const c3 = { items: [], equipment: "", inventoryLocked: true };
I.add(c3, { catalogId: "claim-pack", count: 1 }, { dm: true });
check("unpack.locked", !I.unpack(c3, c3.items[0].uid).ok && c3.items[0].count === 1);
const c4 = { items: [], equipment: "" };
I.add(c4, { catalogId: "hemp-rope-50-ft", count: 1 }, { dm: true });
check("unpack.notAPack", !I.unpack(c4, c4.items[0].uid).ok);

/* ---- starting kit lands real items, no doubles, old lines stay lines */
const K = s2.SSDNSKits;
const g = K.apply({ items: [], equipment: "" }, "gambler", {});
check("kit.thievesToolsItem", g.items.some((x) => x.catalogId === "thieves-tools-lock-picks"), JSON.stringify(g.items.map((x) => x.catalogId)));
check("kit.packItem", g.items.some((x) => /^(alley-kit|claim-pack|trail-kit)$/.test(x.catalogId)));
check("kit.noLineForItems", !/Thieves' tools/.test(g.equipment || "") && !/Alley kit/.test(g.equipment || ""), g.equipment);
K.apply(g, "gambler", {});
check("kit.noDoubles", g.items.filter((x) => x.catalogId === "thieves-tools-lock-picks").length === 1);
const old = { items: [], equipment: "• Trail kit\n• Herbalism kit" };
K.apply(old, "nature-guide", {});
check("kit.oldLinesNotDoubled", !old.items.some((x) => x.catalogId === "trail-kit" || x.catalogId === "herbalism-kit-herb-doctoring"), JSON.stringify(old.items.map((x) => x.catalogId)));
check("kit.slotLinesStay", /Wooden shield/.test(old.equipment));

/* ---- wiring + rules untouched */
check("wire.unpackBtn", /data-item-unpack/.test(read("assets/js/items.js")));
check("wire.grantAmmo", /plan\.kind === "ammo"/.test(read("assets/js/sheet-extras.js")));
check("rules.untouched", !/SSDNS_PACK_CONTENTS|inv2/.test(read("assets/data/rules.js")));

/* ---- browser: a real store grant fills the bolts pool and the quiver shows; Unpack button works */
const ORIGIN = process.env.SSDNS_ORIGIN || "http://127.0.0.1:8765";
const up = await new Promise((res) => { const u = new URL(ORIGIN); const s = net.connect(Number(u.port || 80), u.hostname, () => { s.end(); res(true); }); s.on("error", () => res(false)); });
if (!up) console.log("skip  browser part: no static server at " + ORIGIN + " (run via ssdns-test-all)");
else {
  const puppeteer = (await import("/tmp/pup/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js")).default;
  const browser = await puppeteer.launch({ executablePath: "/opt/google/chrome/chrome", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  try {
    const pg = await browser.newPage(); const errs = [];
    pg.on("pageerror", (e) => errs.push(String(e)));
    await pg.goto(ORIGIN + "/index.html", { waitUntil: "domcontentloaded" });
    await pg.waitForFunction(() => window.SSDNSApp && window.SSDNSApp.applyPatch && window.SSDNSSheet && window.SSDNSSheet.grantBought && window.SSDNSItems, { timeout: 20000 });
    const out = await pg.evaluate(() => {
      window.SSDNSApp.applyPatch((d) => { d.character.guns = d.character.guns || [{}]; d.character.guns[0].weapon = "light-crossbow"; d.character.ammo = []; d.character.equipment = ""; d.character.items = []; });
      window.SSDNSSheet.grantBought({ id: "crossbow-bolts-20", name: "Crossbow bolts (20)" });
      window.SSDNSSheet.grantBought({ id: "arrows-20", name: "Arrows (20)" });
      window.SSDNSSheet.grantBought({ id: "arrows-20", name: "Arrows (20)" });
      const c = window.SSDNSApp.doc().character;
      return { ammo: JSON.parse(JSON.stringify(c.ammo)), eq: c.equipment || "" };
    });
    const bolts = out.ammo.find((a) => a.type === "bolts"), arrows = out.ammo.find((a) => a.type === "arrows");
    check("browser.boltsPool", bolts && bolts.count === 20, JSON.stringify(out.ammo));
    check("browser.arrowsPool40", arrows && arrows.count === 40 && out.ammo.filter((a) => a.type === "arrows").length === 1);
    check("browser.noNoteLine", !/Crossbow bolts|Arrows/.test(out.eq), out.eq);
    const un = await pg.evaluate(async () => {
      window.SSDNSApp.applyPatch((d) => { window.SSDNSItems.add(d.character, { catalogId: "claim-pack", count: 1 }, { dm: true }); });
      document.querySelector("#tab-equip").click();
      window.SSDNSItems.paintSheet();
      await new Promise((r) => setTimeout(r, 300));
      const b = document.querySelector("[data-item-unpack]");
      if (!b) return { btn: false };
      b.click();
      await new Promise((r) => setTimeout(r, 300));
      const c = window.SSDNSApp.doc().character;
      return { btn: true, ids: c.items.map((x) => x.catalogId), spikes: (c.items.find((x) => x.catalogId === "spike") || {}).count };
    });
    check("browser.unpackBtn", un.btn);
    check("browser.unpacked", un.btn && !un.ids.includes("claim-pack") && un.ids.includes("claim-pry-bar") && un.spikes === 10, JSON.stringify(un));
    check("browser.noErrors", errs.length === 0, errs.slice(0, 2).join(" | "));
  } finally { await browser.close(); }
}

if (failures.length) { console.log("\n" + failures.length + " FAILED"); process.exit(1); }
console.log("inv2 ok");

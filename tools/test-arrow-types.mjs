/**
 * L0186 special arrows (Jessey + DND Bot 2026-10-20): BOOK1 "Special arrows" table as built. Separate Ammo pools per
 * type (blank caliber = Standard, so every older save is unchanged), Nocked picker, drawn arrows per type, store rows,
 * Recover by type, Powder Man dynamite arrows.  node tools/test-arrow-types.mjs  (browser part: ssdns-test-all's :8765)
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

/* ---- the BOOK1 table, exactly */
const sb = { console }; sb.window = sb; sb.globalThis = sb; vm.createContext(sb);
vm.runInContext(read("assets/data/rules.js"), sb, { filename: "rules.js" });
vm.runInContext(read("assets/js/trackers.js"), sb, { filename: "trackers.js" });
const T = sb.SSDNSTrackers;
const want = { broadhead: [5, "50"], blunt: [5, "25"], fire: [5, "100"], whistler: [5, "50"], poison: [3, "1,500"] };
check("types.exact", T.ARROW_TYPES.map((t) => t.id).join() === "standard,broadhead,blunt,fire,whistler,poison,dynamite", T.ARROW_TYPES.map((t) => t.id).join());
for (const [id, [pack, cost]] of Object.entries(want)) {
  const t = T.arrowType(id);
  check("type." + id, t.id === id && t.pack === pack && t.cost === cost, JSON.stringify([t.pack, t.cost]));
}
check("fx.words", /\+1 damage against beasts\. Breaks on a hit\./.test(T.arrowType("broadhead").fx) && /Heard about a mile off/.test(T.arrowType("whistler").fx) &&
  /DC 10 Con save or 1d4 poison/.test(T.arrowType("poison").fx) && /Powder Man only/.test(T.arrowType("dynamite").fx));
check("legacy.blank.standard", T.arrowId("") === "standard" && T.arrowId(undefined) === "standard" && T.arrowId(".44-40") === "standard");
const R = sb.SSDNS_RULES;
const rows = R.ammo.filter((a) => a && a.type === "arrows").map((a) => a.id);
check("rules.ammo.rows", rows.join() === "arrows-20,arrows-broadhead-5,arrows-blunt-5,arrows-fire-5,arrows-whistler-5,arrows-poison-3", rows.join());
check("rules.ammo.noDynamite", !R.ammo.some((a) => /dynamite/.test(a.id || "")));
check("rules.js untouched", !/broadhead/i.test(read("assets/data/rules.js")));
/* recover rules */
const rr = T.arrowRecover({ spentAmmo: 4 + 4 + 2 + 2 + 2 + 2 + 1, spentBy: { broadhead: 4, fire: 2, blunt: 2, whistler: 2, poison: 2, dynamite: 1 }, hitBy: { broadhead: 2 } });
check("recover.legacyStandard", rr.by.standard === 4, JSON.stringify(rr.by));
check("recover.rules", rr.back.standard === 2 + 1 && rr.back.broadhead === 1 && !rr.back.fire && rr.back.blunt === 1 && rr.back.whistler === 1 && !rr.back.dynamite && !rr.back.poison, JSON.stringify(rr.back));
/* store */
const sb2 = { console }; sb2.window = sb2; sb2.globalThis = sb2; vm.createContext(sb2);
vm.runInContext(read("dm/assets/js/store-stock.js"), sb2, { filename: "store-stock.js" });
const store = JSON.parse(read("dm/assets/data/store-items.json"));
for (const [id, [pack, cost]] of Object.entries(want)) {
  const row = store.find((r) => r.id === "arrows-" + id + "-" + pack);
  const p = row && sb2.SSDNSStore.grantPlan(row);
  check("store." + id, row && row.price_es === Number(cost.replace(",", "")) && p.kind === "ammo" && p.type === "arrows" && p.caliber === id && p.qty === pack, JSON.stringify(p));
}
check("store.noDynamite", !store.some((r) => /dynamite-arrow|arrows-dynamite/.test(r.id)));
check("store.poison.traveling", store.find((r) => r.id === "arrows-poison-3").stores.join() === "traveling");
check("store.standard.same", sb2.SSDNSStore.grantPlan(store.find((r) => r.id === "arrows-20")).caliber === "");

/* ---- browser */
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
    await pg.waitForFunction(() => window.SSDNSApp && window.SSDNSGunRoll && window.SSDNSTrackers && window.SSDNSPlaytest && window.SSDNSSheet && window.SSDNSSheet.grantBought && window.SSDNSItems, { timeout: 25000 });
    const r = await pg.evaluate(async () => {
      const wait = (ms) => new Promise((res) => setTimeout(res, ms));
      await wait(1000);
      document.querySelectorAll("dialog[open]").forEach((n) => { try { n.close(); } catch (e) {} });
      const A = window.SSDNSApp, T = window.SSDNSTrackers, P = window.SSDNSPlaytest, C = () => A.doc().character, out = {};
      const logs = () => [...document.querySelectorAll(".log-item")].map((n) => n.textContent);
      const roll = async (fn, rnd) => { const rr = Math.random; Math.random = () => rnd; try { fn(); await wait(450); } finally { Math.random = rr; } };
      const pool = (cal) => C().ammo.filter((a) => a.type === "arrows" && String(a.caliber || "") === cal).reduce((n, a) => n + Number(a.count), 0);
      const noTarget = () => { const s = document.querySelector("#atkTarget"); if (s) { s.value = ""; s.dispatchEvent(new Event("change", { bubbles: true })); } };
      A.applyPatch((d) => { const c = d.character; c.name = "Ash"; c.level = 5; c.calling = "frontier-scout"; c.feats = []; c.items = []; c.res = {}; c.abilities.DEX = 16; c.activeConditions = [];
        c.ammo = [{ type: "arrows", caliber: "", count: 20 }]; c.guns = [{ weapon: "longbow", equipped: true, proficient: true }, { weapon: "" }, { weapon: "" }, { weapon: "" }]; });
      P.syncSheet(); await wait(400); noTarget(); T.paint();
      out.oldSave = { arrows: document.querySelectorAll('.gun[data-row="0"] .trk-arrow:not(.spent)').length, svg: !!document.querySelector('.gun[data-row="0"] .trk-arrow svg'), tags: document.querySelectorAll(".trk-atag").length, picker: !!document.querySelector("[data-trk-nock]") };
      await roll(() => window.SSDNSGunRoll(0), 0.5);
      out.oldShot = { std: pool(""), spent: C().guns[0].spentAmmo };
      ["arrows-fire-5", "arrows-broadhead-5", "arrows-whistler-5", "arrows-poison-3", "arrows-blunt-5"].forEach((id) => window.SSDNSSheet.grantBought({ id, name: id }));
      await wait(300); T.paint();
      out.pools = { fire: pool("fire"), broadhead: pool("broadhead"), whistler: pool("whistler"), poison: pool("poison"), blunt: pool("blunt"), std: pool("") };
      out.groups = [...document.querySelectorAll('.gun[data-row="0"] .trk-agrp')].map((g) => g.getAttribute("data-arrow-grp")).join();
      out.options = [...document.querySelectorAll('[data-trk-nock="0"] option')].map((o) => o.value).join();
      const sel = document.querySelector('[data-trk-nock="0"]'); sel.value = "fire"; sel.dispatchEvent(new Event("change", { bubbles: true })); await wait(200);
      out.nocked = C().guns[0].arrowType;
      out.nockedGrp = (document.querySelector(".trk-agrp.nocked") || {}).getAttribute && document.querySelector(".trk-agrp.nocked").getAttribute("data-arrow-grp");
      await roll(() => window.SSDNSGunRoll(0), 0.6);
      out.fire = { left: pool("fire"), log: logs()[0] };
      const s2 = document.querySelector('[data-trk-nock="0"]'); s2.value = "whistler"; s2.dispatchEvent(new Event("change", { bubbles: true })); await wait(150);
      await roll(() => window.SSDNSGunRoll(0), 0.6);
      out.whistler = { left: pool("whistler"), log: logs()[0] };
      const s3 = document.querySelector('[data-trk-nock="0"]'); s3.value = "broadhead"; s3.dispatchEvent(new Event("change", { bubbles: true })); await wait(150);
      out.beastBox = !!document.querySelector("[data-trk-beast]");
      await roll(() => window.SSDNSGunRoll(0), 0.6);
      out.broad = { left: pool("broadhead"), hits: (C().guns[0].hitBy || {}).broadhead, log: logs()[0] };
      out.spentBy = JSON.stringify(C().guns[0].spentBy);
      out.ghosts = document.querySelectorAll('.gun[data-row="0"] .trk-arrow.spent').length;
      const stdBefore = pool("");
      document.querySelector('[data-trk-recover="0"]').click(); await wait(200);
      out.recover = { std: pool("") - stdBefore, fire: pool("fire"), spent: C().guns[0].spentAmmo, log: logs()[0] };
      /* Powder Man dynamite arrow */
      out.noPM = !document.querySelector("[data-trk-dyn-make]");
      A.applyPatch((d) => { d.character.feats = ["powder-man"]; window.SSDNSItems.add(d.character, { catalogId: "dynamite-stick-standard-fuse", count: 2 }, { dm: true }); });
      await wait(200); T.paint();
      const mk = document.querySelector('[data-trk-dyn-make="0"]'); out.makeEnabled = mk && !mk.disabled;
      const stdB = pool(""); mk.click(); await wait(250);
      out.made = { dyn: pool("dynamite"), std: stdB - pool(""), sticks: (C().items.find((x) => x.catalogId === "dynamite-stick-standard-fuse") || {}).count };
      const s4 = document.querySelector('[data-trk-nock="0"]'); s4.value = "dynamite"; s4.dispatchEvent(new Event("change", { bubbles: true })); await wait(150);
      await roll(() => window.SSDNSGunRoll(0), 0.5);
      out.dyn = { left: pool("dynamite"), log: logs()[0] };
      out.errs = [];
      return out;
    });
    check("b.oldSave.art", r.oldSave.arrows === 20 && r.oldSave.svg && r.oldSave.tags === 0 && r.oldSave.picker, JSON.stringify(r.oldSave));
    check("b.oldSave.shoots", r.oldShot.std === 19 && r.oldShot.spent === 1, JSON.stringify(r.oldShot));
    check("b.store.pools", JSON.stringify(r.pools) === JSON.stringify({ fire: 5, broadhead: 5, whistler: 5, poison: 3, blunt: 5, std: 19 }), JSON.stringify(r.pools));
    check("b.quiver.groups", r.groups === "standard,broadhead,blunt,fire,whistler,poison", r.groups);
    check("b.picker", r.options === "standard,broadhead,blunt,fire,whistler,poison" && r.nocked === "fire" && r.nockedGrp === "fire", JSON.stringify(r));
    check("b.fire", r.fire.left === 4 && /fire arrow/i.test(r.fire.log) && /1d4/.test(r.fire.log) && /4 fire arrows/.test(r.fire.log), r.fire.log);
    check("b.whistler", r.whistler.left === 4 && /no damage/i.test(r.whistler.log), r.whistler.log);
    check("b.broadhead", r.beastBox && r.broad.left === 4 && r.broad.hits === 1 && /beast/i.test(r.broad.log), JSON.stringify(r.broad));
    check("b.ghosts", r.ghosts >= 4, String(r.ghosts));
    check("b.recover", r.recover.spent === 0 && r.recover.std === 0 && /fire arrows/.test(r.recover.log) && /don't come back/.test(r.recover.log), JSON.stringify(r.recover));
    check("b.dyn.make", r.noPM && r.makeEnabled && r.made.dyn === 1 && r.made.std === 1 && r.made.sticks === 1, JSON.stringify(r.made));
    check("b.dyn.shoot", r.dyn.left === 0 && /dynamite arrow/i.test(r.dyn.log) && /no attack roll/i.test(r.dyn.log) && /Fuse/.test(r.dyn.log) && /shoots a dynamite arrow/.test(r.dyn.log), r.dyn.log);
    check("b.noErrors", !errs.length, errs.join(" | "));
  } finally { await browser.close(); }
}
if (failures.length) { console.log("\n" + failures.length + " FAILED"); process.exit(1); }
console.log("arrow-types ok");

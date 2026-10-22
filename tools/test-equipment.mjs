/**
 * Equipment list (0.3.102, Jessey 2026-10-20 5:09 PM): starting kits unpack into real Equipment rows (the pack row
 * goes, its leftovers go to Notes), the approved guessed matches (Badge = Holy symbol, walking stick / pouches =
 * Druidic focus, Prism = Arcane focus, Galvanic reagents = Hex pouch), instruments / gun belt / holster become real
 * things, no duplicate ammo lines, a kit applied again never doubles anything, saved sheets migrate once with the
 * old notes kept, and the grouped / filterable list (chips, Weapons, dropdowns, Give, Notes at the end).
 *   node tools/test-equipment.mjs          (browser part needs ssdns-test-all's static server on 127.0.0.1:8765)
 *   SSDNS_SHOTS=/workspace/specs/equipment-pr node tools/test-equipment.mjs   also saves screenshots
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- node: kits + items without a page ---------- */
const sb = { console }; sb.window = sb; sb.globalThis = sb;
sb.document = { readyState: "complete", getElementById: () => null, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] };
vm.createContext(sb);
for (const f of ["assets/data/rules.js", "assets/data/item-catalog.js", "assets/data/item-catalog-gear.js", "assets/js/item-ui.js", "assets/js/items.js", "assets/js/kits.js"]) vm.runInContext(read(f), sb, { filename: f });
const I = sb.SSDNSItems, K = sb.SSDNSKits, PC = sb.SSDNS_PACK_CONTENTS;
const HOLY = "badge-saint-medal-carved-eldorite-hymn-book-holy-symbol";
const DRUID = "antler-eldorite-nodule-beast-charm-druidic-focus";
const ARCANE = "eldorite-charm-bone-fetish-quill-case-lens-arcane-focus";
const HEX = "hex-pouch-dust-pouch";
const ids = (c) => (c.items || []).map((x) => x.catalogId);
const fresh = (cal, picks) => K.apply(K.blankCharacter(), cal, picks || {});
const snap = (c) => JSON.stringify({ items: (c.items || []).map((x) => [x.catalogId, x.name, x.count]), ammo: c.ammo, eq: c.equipment, guns: (c.guns || []).map((g) => g.weapon), melee: (c.melee || []).map((m) => m.weapon), armor: c.armor, shield: c.shield, belt: c.belt, holster: c.holster, instrument: c.instrument });
const all = [];
K.callings.forEach((cal) => K.branches(cal).forEach((p) => all.push([cal, p])));
check("branches.count", all.length >= 150, String(all.length));

/* 1. packs unpack on apply: no pack row anywhere, the contents are rows, leftovers go to Notes */
const packIds = Object.keys(PC);
const withPack = all.map(([cal, p]) => [cal, p, fresh(cal, p)]).filter(([, , c]) => /From [^:]+:/.test(c.equipment || "") || (c.kitGrants.items || []).some((id) => packIds.includes(id)));
check("unpack.someKitsHavePacks", withPack.length > 50, String(withPack.length));
const stillPacked = all.filter(([cal, p]) => ids(fresh(cal, p)).some((id) => packIds.includes(id)));
check("unpack.noPackRowsLeft", stillPacked.length === 0, stillPacked.slice(0, 3).map(([cal, p]) => cal + JSON.stringify(p)).join(" | "));
const tw = fresh("tribal-warrior");
const trailWant = PC["trail-kit"].items.map(([id]) => id).filter((id) => I.byId(id));
check("unpack.trailKitContents", trailWant.every((id) => ids(tw).includes(id)), JSON.stringify(ids(tw)));
const twWeight = I.totalWeight(tw.items);
const ref = { items: [], equipment: "" }; I.add(ref, { catalogId: "trail-kit", count: 1 }, { dm: true });
check("unpack.weightKept", Math.abs(twWeight - I.totalWeight(ref.items)) < 0.01, twWeight + " vs " + I.totalWeight(ref.items));
const pre = fresh("frontier-preacher");
check("unpack.leftoversToNotes", /• From [^:]+: .*blanket/.test(pre.equipment), pre.equipment);

/* 2. the approved guessed matches + instruments + rig */
check("match.preacherHolySymbol", ids(pre).includes(HOLY) && !/Holy symbol/.test(pre.equipment));
const lawBranch = all.find(([cal]) => cal === "lawman");
const law = fresh("lawman", lawBranch[1]);
check("match.badgeIsHolySymbol", ids(law).includes(HOLY) && !/Badge/.test(law.equipment || ""), JSON.stringify(ids(law)) + " " + law.equipment);
const druidLines = ["Focus: Carved walking stick", "Focus: Medicine pouch", "Focus: Pouch of home-spring soil"];
check("match.druidTable", druidLines.every((l) => K.kitLines[l] && K.kitLines[l].items[0] === DRUID));
const ngAll = all.filter(([cal]) => cal === "nature-guide").map(([cal, p]) => fresh(cal, p));
check("match.natureGuideDruidic", ngAll.every((c) => ids(c).includes(DRUID) && !/Focus: (Carved|Medicine|Pouch of home)/.test(c.equipment || "")), ngAll.map((c) => c.equipment).join(" | "));
const schAll = all.filter(([cal]) => cal === "scholar").map(([cal, p]) => fresh(cal, p));
const prism = schAll.filter((c) => ids(c).includes(ARCANE)), galv = schAll.filter((c) => ids(c).includes(HEX));
check("match.prismArcane", K.kitLines["Prism (focus)"].items[0] === ARCANE && schAll.every((c) => !/Prism/.test(c.equipment || "")));
check("match.galvanicHexPouch", K.kitLines["Galvanic reagents (component pouch)"].items[0] === HEX && all.every(([cal, p]) => !/Galvanic reagents/.test(fresh(cal, p).equipment || "")));
check("match.scholarFocusLands", prism.length + galv.length > 0, schAll.length + " branches");
const st = fresh("storyteller", { voice: "fiddle" });
check("instrument.fiddleStrapStrings", st.instrument === "fiddle" && ids(st).includes("violin-strap") && ids(st).includes("plain-strings-set") && !/Fiddle with/.test(st.equipment || ""), JSON.stringify(ids(st)));
const stH = fresh("storyteller", { voice: "harmonica" });
check("instrument.harmonicaIsTheTracker", stH.instrument === "harmonica" && !ids(stH).includes("harmonica-cheap") && !/Harmonica/.test(stH.equipment || ""), JSON.stringify(ids(stH)) + " " + stH.equipment);
const stV = fresh("storyteller", { voice: "voice" });
check("instrument.voiceGetsHarmonicaItem", stV.instrument === "voice" && ids(stV).includes("harmonica-cheap"), JSON.stringify(ids(stV)));
const gs = all.filter(([cal]) => cal === "gunslinger").map(([cal, p]) => fresh(cal, p));
check("rig.gunBeltAndHolster", gs.every((c) => c.belt === "gun-belt-cartridge-loops" && c.gunBelt === true && c.holster === "mexican-loop" && !/Gun belt|Mexican Loop/.test(c.equipment || "")), gs.map((c) => [c.belt, c.holster, c.equipment]).join(" | "));
check("rig.notItemsToo", gs.every((c) => !ids(c).includes("gun-belt-cartridge-loops")));

/* 3. no duplicate ammo / slot lines in Notes */
const dupAmmo = all.filter(([cal, p]) => /×20|Arrows|Powder, ball|Light cartridges|Mail Duster|^• (Wooden )?[Ss]hield$/m.test(fresh(cal, p).equipment || ""));
check("notes.noDuplicateAmmoLines", dupAmmo.length === 0, dupAmmo.slice(0, 3).map(([cal, p]) => cal + JSON.stringify(p) + ": " + fresh(cal, p).equipment).join(" | "));
const arrowKit = all.map(([cal, p]) => fresh(cal, p)).find((c) => (c.ammo || []).some((a) => a.type === "arrows"));
check("notes.ammoStillInPool", !!arrowKit && arrowKit.ammo.find((a) => a.type === "arrows").count === 20);

/* 4. unmatched lines stay in Notes */
const keep = { "pact-seeker": /Borrowed Iron|Keepsake/, scholar: /Chemical Field Ledger|Keepsake|Focus worn on a cord/ };
const kept = all.filter(([cal]) => keep[cal]).map(([cal, p]) => [cal, fresh(cal, p)]);
check("notes.unmatchedKept", kept.some(([cal, c]) => keep[cal].test(c.equipment || "")), kept.map(([cal, c]) => cal + ":" + c.equipment).slice(0, 4).join(" | "));
const bed = K.apply(K.blankCharacter(), "lawman", { _start: "module", bedtime: "Teddy bear" });
check("notes.bedtimeKept", /Bedtime item: Teddy bear/.test(bed.equipment || ""), bed.equipment);

/* 5. a kit applied again never doubles anything (every branch, full and module starts) */
const doubled = [];
for (const [cal, p] of all) {
  const c = fresh(cal, p); c.kitStamp = cal;
  const a = snap(c);
  K.apply(c, cal, p); K.apply(c, cal, p);
  if (snap(c) !== a) doubled.push(cal + JSON.stringify(p));
}
check("again.noDoublingAnyBranch", doubled.length === 0, doubled.slice(0, 3).join(" | "));
const mod = []; for (const cal of K.callings) { const c = K.apply(K.blankCharacter(), cal, { _start: "module" }); const a = snap(c); K.apply(c, cal, { _start: "module" }); if (snap(c) !== a) mod.push(cal); }
check("again.noDoublingModule", mod.length === 0, mod.join(","));
const spent = fresh("tribal-warrior"); spent.kitStamp = "tribal-warrior";
const bed0 = spent.items.find((x) => x.catalogId === "bedroll-trail-blankets"); if (bed0) bed0.count = 0;
spent.ammo.forEach((a) => { a.count = 1; });
K.apply(spent, "tribal-warrior", {});
check("again.usedUpNotRefilled", spent.ammo.every((a) => a.count === 1) && (!bed0 || spent.items.filter((x) => x.catalogId === "bedroll-trail-blankets").reduce((n, x) => n + x.count, 0) === 0));
/* a different gun pick on the same calling still gets its own ammo, but not the first gun's again */
const gsb = all.filter(([cal]) => cal === "gunslinger").map(([, p]) => p);
const twoGuns = gsb.find((p) => JSON.stringify(p) !== JSON.stringify(gsb[0]) && JSON.stringify(fresh("gunslinger", p).ammo) !== JSON.stringify(fresh("gunslinger", gsb[0]).ammo));
if (twoGuns) {
  const c = fresh("gunslinger", gsb[0]); c.kitStamp = "gunslinger";
  const before = JSON.parse(JSON.stringify(c.ammo));
  K.apply(c, "gunslinger", twoGuns);
  const same = before.every((b) => c.ammo.find((a) => a.type === b.type && a.caliber === b.caliber).count === b.count);
  check("again.newPickGetsOwnAmmoOnly", same && c.ammo.length >= before.length, JSON.stringify(before) + " -> " + JSON.stringify(c.ammo));
}
/* a sheet from before 0.3.102 (kit stamped, no kitGrants record): the same kit again adds nothing countable */
const legacy = { ...K.blankCharacter(), kitStamp: "frontier-preacher", ammo: [{ type: "buck", caliber: ".410", count: 10 }], equipment: "• Holy symbol (focus)" };
K.apply(legacy, "frontier-preacher", {});
check("again.legacyQuiet", legacy.ammo[0].count === 10 && (legacy.items || []).length === 0 && legacy.equipment === "• Holy symbol (focus)", JSON.stringify(legacy.ammo) + " " + JSON.stringify(ids(legacy)));
/* the creator preview lists the pack (not its insides) and the rig, and touches nothing */
const lines = K.describe("gunslinger", {}).join("\n");
check("describe.ok", /Mexican Loop/i.test(lines) && /belt/i.test(lines), lines);

/* 6. saved characters migrate once, nothing lost */
const oldNotes = "• Holy symbol (focus)\n• Gun belt\n• Mexican Loop holster\n• Arrows ×20\n• Keepsake (focus)\n• Fiddle with a strap and one spare set of strings\nMy lucky coin\n• Prism (focus)";
const old = { items: [{ uid: "p1", catalogId: "trail-kit", name: "Trail kit", count: 1 }, { uid: "h1", catalogId: HOLY, name: "Holy symbol", count: 1 }], equipment: oldNotes, ammo: [{ type: "arrows", caliber: "", count: 20 }], instrument: "fiddle", belt: "", holster: "" };
const moved = K.migrateEquipment(old);
check("migrate.moved", moved === 6, String(moved));
check("migrate.backup", old.equipmentBefore0392 === oldNotes);
check("migrate.keepsUnmatched", /Keepsake \(focus\)/.test(old.equipment) && /My lucky coin/.test(old.equipment), old.equipment);
check("migrate.removedKitLines", !/Holy symbol|Gun belt|Mexican Loop|Arrows|Fiddle|Prism/.test(old.equipment), old.equipment);
check("migrate.items", ids(old).filter((x) => x === HOLY).length === 1 && ids(old).includes(ARCANE) && ids(old).includes("violin-strap") && ids(old).includes("plain-strings-set"), JSON.stringify(ids(old)));
check("migrate.packLeftAlone", ids(old).includes("trail-kit"));
check("migrate.rig", old.belt === "gun-belt-cartridge-loops" && old.gunBelt === true && old.holster === "mexican-loop");
check("migrate.ammoUntouched", old.ammo[0].count === 20);
const once = JSON.stringify(old);
check("migrate.once", K.migrateEquipment(old) === 0 && JSON.stringify(old) === once);
const otherBelt = { items: [], equipment: "• Gun belt\n• Badge (tin star, focus)", belt: "bandolier" };
K.migrateEquipment(otherBelt);
check("migrate.conflictStaysNote", otherBelt.belt === "bandolier" && /Gun belt/.test(otherBelt.equipment) && ids(otherBelt).includes(HOLY), otherBelt.equipment);
const nothing = { items: [], equipment: "Just my notes" };
check("migrate.noKitLinesNoChange", K.migrateEquipment(nothing) === 0 && nothing.equipment === "Just my notes" && nothing.equipmentBefore0392 == null);
check("migrate.appHook", /SSDNSKits\.migrateEquipment\(doc\.character\)/.test(read("assets/js/app.js")));

/* 7. categories + art */
const cat = (id) => I.eqCat(I.instanceFrom ? I.instanceFrom(I.byId(id)) : I.byId(id));
const want = { [HOLY]: "focus", [DRUID]: "focus", "harmonica-cheap": "instruments", "violin-strap": "instruments", "trail-kit": "packs", "hemp-rope-50-ft": "gear" };
const badCat = Object.entries(want).filter(([id, c]) => I.byId(id) && cat(id) !== c).map(([id]) => id + "=" + cat(id));
check("cats.basic", badCat.length === 0, badCat.join(","));
check("art.placeholderConst", typeof I.ITEM_PLACEHOLDER === "string" && fs.existsSync(path.join(root, I.ITEM_PLACEHOLDER)), I.ITEM_PLACEHOLDER);
check("art.defaultWebp", I.ITEM_PLACEHOLDER === "assets/img/items/default/default.webp");
const tiles = { weapons: "weapon", ammo: "ammo", worn: "clothing-armor", focus: "focus", instruments: "instrument", tools: "tools-kit", supplies: "consumable-food", use: "consumable-food", packs: "misc", gear: "misc" };
const badTile = Object.entries(tiles).filter(([k, f]) => I.ITEM_CAT_ART[k] !== "assets/img/items/default/" + f + ".webp" || !fs.existsSync(path.join(root, I.ITEM_CAT_ART[k])));
check("art.categoryTiles", badTile.length === 0 && !I.ITEM_CAT_ART.mounts, badTile.map(([k]) => k).join(","));
check("art.imgField", I.realArt({ name: "X", img: "assets/x.webp" }) === "assets/x.webp");

/* ---------- browser: the list on a real sheet ---------- */
const ORIGIN = process.env.SSDNS_ORIGIN || "http://127.0.0.1:8765";
const SHOTS = process.env.SSDNS_SHOTS || "";
const up = await new Promise((res) => { const u = new URL(ORIGIN); const s = net.connect(Number(u.port || 80), u.hostname, () => { s.end(); res(true); }); s.on("error", () => res(false)); });
if (!up) console.log("skip  browser part: no static server at " + ORIGIN + " (run via ssdns-test-all)");
else {
  const puppeteer = (await import("/tmp/pup/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js")).default;
  const browser = await puppeteer.launch({ executablePath: "/opt/google/chrome/chrome", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  try {
    const pg = await browser.newPage();
    const errs = [];
    pg.on("pageerror", (e) => errs.push(String(e)));
    await pg.setViewport({ width: 1280, height: 900 });
    await pg.goto(ORIGIN + "/index.html", { waitUntil: "domcontentloaded" });
    await pg.waitForFunction(() => window.SSDNSApp && window.SSDNSApp.applyPatch && window.SSDNSItems && window.SSDNSKits && document.querySelector("#tab-equip"), { timeout: 20000 });
    await pg.evaluate(() => {
      localStorage.clear();
      window.SSDNSDmJoin = Object.assign(window.SSDNSDmJoin || {}, { give: Object.assign({}, (window.SSDNSDmJoin || {}).give || {}, { me: () => "u-me", roster: () => [{ uid: "u-me", name: "Me", online: true }, { uid: "u-dolan", name: "Dolan", online: true }] }) });
      window.SSDNSApp.applyPatch((d) => { d.character.name = "Equip Test"; d.character.calling = "frontier-preacher"; window.SSDNSKits.apply(d.character, "frontier-preacher", {}); d.character.kitStamp = "frontier-preacher"; });
      document.querySelector("#tab-equip").click();
      window.SSDNSItems.paintSheet();
    });
    await sleep(500);
    const v = await pg.evaluate(() => {
      const list = document.querySelector("#itemList");
      const chips = [...list.querySelectorAll(".eq-chip")].map((b) => [b.getAttribute("data-eq-filter"), (b.querySelector(".n") || {}).textContent || ""]);
      const heads = [...list.querySelectorAll("[data-eq-cat-head]")].map((h) => h.getAttribute("data-eq-cat-head"));
      const rows = [...list.querySelectorAll(".eq-row")];
      const c = window.SSDNSApp.doc().character;
      const sumWt = rows.reduce((n, r) => { const m = /([\d.]+)\s*lb/.exec((r.querySelector(".eq-wt") || {}).textContent || ""); return n + (m && !r.querySelector(".eq-wt").classList.contains("worn-free") ? 0 : 0) + 0; }, 0);
      return {
        title: (document.querySelector("#eqHead h2") || {}).textContent, chips, heads, n: rows.length,
        itemRows: list.querySelectorAll(".item-row").length, items: c.items.filter((x) => Number(x.count == null ? 1 : x.count) > 0).length,
        lazy: rows.every((r) => { const im = r.querySelector(".eq-thumb img"); return !im || im.getAttribute("loading") === "lazy"; }),
        ph: rows.some((r) => { const im = r.querySelector(".eq-thumb img"); return im && /default\//.test(im.getAttribute("src") || ""); }),
        focusTile: (() => { const r = list.querySelector('li[data-eq-cat="focus"] .eq-thumb img'); return r ? r.getAttribute("src") : ""; })(),
        realKept: (() => { const r = list.querySelector('li[data-eq-cat="weapons"] .eq-thumb img'); return r ? r.getAttribute("src") : ""; })(),
        tilesLoaded: [...list.querySelectorAll(".eq-thumb img")].filter((im) => im.complete && im.naturalWidth === 0).length,
        weaponRow: !!list.querySelector('[data-eq-cat="weapons"] [data-give-slot]'), poolGive: !!list.querySelector('[data-eq-cat="ammo"] [data-give-pool]'),
        itemGive: list.querySelectorAll('[data-eq-cat] .eq-give [data-give-item]').length,
        worn: [...list.querySelectorAll('li[data-eq-cat="worn"]:not(.item-row)')].map((r) => [(r.querySelector(".eq-give") || {}).textContent || "", !!r.querySelector("[data-give-item],[data-give-slot]")]),
        notesLast: (() => { const g = document.querySelector("#itemGear"); const ta = document.querySelector("#taEquip"); return !!ta && g.contains(ta) && !!(list.compareDocumentPosition(ta) & Node.DOCUMENT_POSITION_FOLLOWING); })(),
        notesText: (document.querySelector("#taEquip") || {}).value || "", sumWt
      };
    });
    check("ui.title", v.title === "Equipment", v.title);
    check("ui.chips", v.chips[0][0] === "all" && Number(v.chips[0][1]) === v.n && v.chips.some((c) => c[0] === "weapons") && v.chips.some((c) => c[0] === "focus") && v.chips.some((c) => c[0] === "instruments") && v.chips[v.chips.length - 1][0] === "notes", JSON.stringify(v.chips));
    check("ui.chipCountsMatch", v.chips.filter((c) => c[0] !== "all" && c[0] !== "notes").every(([k, n]) => Number(n) === (v.heads.includes(k) ? Number(n) : 0)), JSON.stringify(v.chips));
    check("ui.groupedHeadsInOrder", v.heads[0] === "weapons" && v.heads.includes("focus") && v.heads.includes("worn"), JSON.stringify(v.heads));
    check("ui.itemRowsAreItems", v.itemRows === v.items, v.itemRows + " vs " + v.items);
    check("ui.lazyThumbs", v.lazy && v.ph);
    check("ui.categoryTile", /default\/focus\.webp$/.test(v.focusTile), v.focusTile);
    check("ui.realArtKept", !!v.realKept && !/items\/default\//.test(v.realKept), v.realKept);
    check("ui.giveWeaponSlot", v.weaponRow);
    check("ui.giveAmmoPool", v.poolGive);
    check("ui.giveItems", v.itemGive >= 3, String(v.itemGive));
    check("ui.wornNoGive", v.worn.length >= 2 && v.worn.every(([t, g]) => /worn/i.test(t) && !g), JSON.stringify(v.worn));
    check("ui.notesAtEnd", v.notesLast && /From Preacher/i.test(v.notesText), v.notesText);
    /* Weapons filter */
    const w = await pg.evaluate(() => {
      document.querySelector('.eq-chip[data-eq-filter="weapons"]').click();
      const list = document.querySelector("#itemList");
      return { cats: [...new Set([...list.querySelectorAll(".eq-row")].map((r) => r.getAttribute("data-eq-cat")))], pressed: document.querySelector('.eq-chip[data-eq-filter="weapons"]').getAttribute("aria-pressed"), notesHidden: document.querySelector("#eqNotes").hidden };
    });
    check("filter.weaponsOnly", JSON.stringify(w.cats) === '["weapons"]' && w.pressed === "true" && w.notesHidden, JSON.stringify(w));
    if (SHOTS) {
      await pg.evaluate(() => document.querySelector("#eqHead").scrollIntoView());
      await sleep(300); await pg.screenshot({ path: SHOTS + "-weapons-desktop.png" });
    }
    /* expand a row: the description dropdown with the item card + its buttons; Give opens the #109 picker */
    const x = await pg.evaluate(() => {
      document.querySelector('.eq-chip[data-eq-filter="all"]').click();
      const row = [...document.querySelectorAll("#itemList li.eq-row.item-row")].find((r) => /Holy symbol/i.test(r.textContent));
      row.querySelector(".eq-main .eq-name").click();
      const r2 = document.querySelector('#itemList li[data-eq-key="' + row.getAttribute("data-eq-key") + '"]');
      const more = r2.querySelector(".eq-more");
      const open = more && !more.hidden && getComputedStyle(more).display !== "none";
      const txt = more ? more.textContent : "";
      r2.querySelector(".eq-give [data-give-item]").click();
      const dlg = document.querySelector("dialog.give-picker");
      const ok = !!dlg && /Dolan/.test(dlg.textContent);
      if (dlg) { dlg.close(); dlg.remove(); }
      return { open, txt: txt.slice(0, 200), stillOpen: !!document.querySelector('#itemList li[data-eq-key="' + row.getAttribute("data-eq-key") + '"] .eq-more:not([hidden])'), give: ok };
    });
    check("row.expands", x.open && x.txt.length > 20, JSON.stringify(x));
    check("row.giveOpensPicker", x.give);
    /* the Notes chip */
    const nn = await pg.evaluate(() => { document.querySelector('.eq-chip[data-eq-filter="notes"]').click(); const r = { rows: document.querySelectorAll("#itemList .eq-row").length, shown: !document.querySelector("#eqNotes").hidden }; document.querySelector('.eq-chip[data-eq-filter="all"]').click(); return r; });
    check("filter.notes", nn.rows === 0 && nn.shown, JSON.stringify(nn));
    /* carried weight: unchanged by the new list (same weightReport as the items) */
    /* carried weight: the rows add up to the same carried total as before (weightReport; water isn't a row) */
    const wt = await pg.evaluate(() => {
      const c = window.SSDNSApp.doc().character; const r = window.SSDNSItems.weightReport(c);
      const rows = [...document.querySelectorAll("#itemList .eq-row")].map((li) => { const m = /([\d.]+)\s*lb/.exec((li.querySelector(".eq-wt") || {}).textContent || ""); return m ? Number(m[1]) : 0; });
      return { carried: r.carried - ((r.slots || {}).water || 0), rows: Math.round(rows.reduce((a, b) => a + b, 0) * 100) / 100 };
    });
    check("weight.rowsAddUp", Math.abs(wt.carried - wt.rows) < 0.05, JSON.stringify(wt));
    /* migration of a saved sheet in the page */
    const m = await pg.evaluate(() => {
      const A = window.SSDNSApp;
      const doc = { format: "ssdns-character", schemaVersion: 2, id: "eq-old", character: { name: "Old Preacher", calling: "frontier-preacher", kitStamp: "frontier-preacher", equipment: "• Holy symbol (focus)\n• Gun belt\nMy lucky coin", items: [], ammo: [] }, shards: {} };
      A.loadText(JSON.stringify(doc), { fileName: "old.ssdns" });
      const c = A.doc().character;
      return { eq: c.equipment, back: c.equipmentBefore0392, items: c.items.map((x) => x.catalogId), belt: c.belt, rows: document.querySelectorAll("#itemList .eq-row").length };
    });
    check("page.migrate", m.eq === "My lucky coin" && /Holy symbol/.test(m.back || "") && m.items.length === 1 && m.belt === "gun-belt-cartridge-loops", JSON.stringify(m));
    check("page.noErrors", errs.length === 0, errs.join(" | "));
    if (SHOTS) {
      await pg.evaluate(() => localStorage.clear());
      await pg.goto(ORIGIN + "/index.html?shots=1", { waitUntil: "domcontentloaded" });
      await pg.waitForFunction(() => window.SSDNSApp && window.SSDNSApp.applyPatch && window.SSDNSItems && window.SSDNSKits && document.querySelector("#tab-equip"), { timeout: 20000 });
      await pg.evaluate(() => {
        window.SSDNSDmJoin = Object.assign(window.SSDNSDmJoin || {}, { give: Object.assign({}, (window.SSDNSDmJoin || {}).give || {}, { me: () => "u-me", roster: () => [{ uid: "u-me", name: "Me", online: true }, { uid: "u-dolan", name: "Dolan", online: true }] }) });
        const A = window.SSDNSApp;
        A.state.doc = A.migrate({ character: { name: "Equip Test", calling: "frontier-preacher" } });
        A.applyPatch((d) => { window.SSDNSKits.apply(d.character, "frontier-preacher", {}); d.character.kitStamp = "frontier-preacher"; });
        if (A.renderFields) A.renderFields();
        document.querySelector("#tab-equip").click();
        window.SSDNSItems.setEqFilter("all");
      });
      await sleep(3500);
      for (const [vw, vh, tag] of [[1280, 900, "desktop"], [390, 844, "phone"]]) {
        await pg.setViewport({ width: vw, height: vh, deviceScaleFactor: tag === "phone" ? 2 : 1 });
        await pg.evaluate(() => { window.SSDNSItems.setEqFilter("all"); document.querySelector("#eqHead").scrollIntoView(); });
        await sleep(400); await pg.screenshot({ path: SHOTS + "-all-" + tag + ".png" });
        await pg.evaluate(() => { window.SSDNSItems.setEqFilter("weapons"); document.querySelector("#eqHead").scrollIntoView(); });
        await sleep(400); await pg.screenshot({ path: SHOTS + "-weapons-" + tag + ".png" });
        await pg.evaluate(() => {
          window.SSDNSItems.setEqFilter("all");
          const row = [...document.querySelectorAll("#itemList li.eq-row")].find((r) => /Holy symbol/i.test(r.textContent));
          row.querySelector(".eq-main .eq-name").click();
          const r2 = document.querySelector('#itemList li[data-eq-key="' + row.getAttribute("data-eq-key") + '"]');
          r2.scrollIntoView({ block: "center" });
        });
        await sleep(400); await pg.screenshot({ path: SHOTS + "-expanded-" + tag + ".png" });
        await pg.evaluate(() => { const r = document.querySelector("#itemList li.eq-row .eq-more:not([hidden])"); if (r) r.closest("li").querySelector(".eq-main .eq-name").click(); document.querySelector("#taEquip").scrollIntoView({ block: "center" }); });
        await sleep(400); await pg.screenshot({ path: SHOTS + "-notes-" + tag + ".png" });
      }
    }
  } finally { await browser.close(); }
}

console.log(failures.length ? "\n" + failures.length + " FAILED" : "\nequipment ok");
process.exit(failures.length ? 1 : 0);

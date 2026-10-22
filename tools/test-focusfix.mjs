/**
 * Focus fix (sheet 0.3.108 / DMCC 0.2.121; Jessey 2026-10-22 2:41 PM + 2:48 PM CT; DND Bot rules check, L0214 Lawless list).
 *  Every casting Calling's focus is a real item that the paper-doll Focus slot shows (Scholar Ledger, Frontier Scout keepsake,
 *  Nature Guide land focus, Lawman Tin star badge, Preacher holy symbol); Storyteller / Hexslinger / Pact Seeker unchanged.
 *  Both kits, saved-sheet migration (no doubles), the Scout's lost / remake flow, the Hexslinger Focus chip, and Badge Bound:
 *  Bright / Dull / Tarnished (Dull blocks spells, Smite Lead, Mercy Hands, Channel Creed; Tarnished swaps the spell list to
 *  the Lawless list and restores it on Bright / Dull), set live from the DMCC toggle.
 *   node tools/test-focusfix.mjs   (browser part needs ssdns-test-all's static server on 127.0.0.1:8765, or SSDNS_ORIGIN)
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import net from "node:net";
import { fileURLToPath } from "node:url";
import { dmccUrl, dmccOffline } from "./dmcc-offline.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const J = (x) => JSON.stringify(x);
function check(id, cond, detail) {
  if (!cond) failures.push(id + (detail ? " — " + detail : ""));
  console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + String(detail).slice(0, 600) : ""));
}
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clone = (x) => JSON.parse(JSON.stringify(x));

/* ---------- node part ---------- */
const sb = { console }; sb.window = sb; sb.globalThis = sb;
sb.document = { readyState: "complete", getElementById: () => null, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] };
vm.createContext(sb);
for (const f of ["assets/data/rules.js", "assets/data/item-catalog.js", "assets/data/item-catalog-gear.js", "assets/data/lawless-spells.js", "assets/js/item-ui.js",
  "assets/js/items.js", "assets/js/kits.js", "assets/js/equip.js", "assets/js/weapon-art.js", "assets/js/iron-art.js", "assets/js/paper-doll.js", "assets/js/focus-slot.js", "assets/js/spell-fx.js"]) {
  vm.runInContext(read(f), sb, { filename: f });
}
const I = sb.SSDNSItems, K = sb.SSDNSKits, D = sb.SSDNSDoll, F = sb.SSDNSFocus;
const HOLY = "badge-saint-medal-carved-eldorite-hymn-book-holy-symbol", DRUID = "antler-eldorite-nodule-beast-charm-druidic-focus", ARCANE = "eldorite-charm-bone-fetish-quill-case-lens-arcane-focus";
const focusCell = (html) => { const m = /<div class="doll-cell"[^>]*>(?:(?!<div class="doll-cell").)*data-doll-slot="focus_borrowed_iron"(?:(?!<div class="doll-cell").)*/s.exec(html); return m ? m[0] : ""; };
const ids = (c) => (c.items || []).map((x) => x.catalogId);
const count = (c, id) => ids(c).filter((x) => x === id).length;
const kit = (cal, mode, picks) => { const c = K.apply(K.blankCharacter(), cal, Object.assign({}, picks || {}, mode === "module" ? { _start: "module" } : {})); c.calling = cal; c.level = 3; return c; };

/* 1. catalog rows */
const NEW = ["chemical-field-ledger", "frontier-keepsake", "carved-walking-stick", "medicine-pouch", "home-spring-soil-pouch", "tin-star-badge"];
NEW.forEach((id) => {
  const raw = (sb.SSDNS_ITEM_CATALOG || []).find((r) => r.id === id), row = I.byId(id);
  check("catalog." + id, !!raw && raw.shelf === "Foci" && raw.category === "focus" && raw.forSale === false && raw.price == null && !!row && row.forSale === false, J(raw));
  check("catalog.noStoreRow." + id, !JSON.parse(read("dm/assets/data/store-items.json")).some((r) => r.id === id));
  check("catalog.equipmentFocus." + id, I.eqCat(I.instanceFrom(row)) === "focus", I.eqCat(I.instanceFrom(row)));
  if (raw && raw.art) check("catalog.artFile." + id, fs.existsSync(path.join(root, raw.art)), raw.art);
  check("doll.artFile." + id, fs.existsSync(path.join(root, D.FOCUS_DOLL_ART[id])), D.FOCUS_DOLL_ART[id]);
});
check("catalog.ledgerSpellbook", (sb.SSDNS_ITEM_CATALOG.find((r) => r.id === "chemical-field-ledger") || {}).spellbook === true);
check("catalog.stickShillelagh", (sb.SSDNS_ITEM_CATALOG.find((r) => r.id === "carved-walking-stick") || {}).shillelagh === true && /Shillelagh/.test(I.byId("carved-walking-stick").description));

/* 2. each Calling's focus, both kits: one real item, shown in the Focus slot, no note line left */
const WANT = { scholar: "chemical-field-ledger", "frontier-scout": "frontier-keepsake", "nature-guide": "carved-walking-stick", lawman: "tin-star-badge", "frontier-preacher": HOLY };
const NOTE = /Ledger|Keepsake|Badge \(tin star|Focus worn on a cord|Focus: |Holy symbol \(focus\)/;
for (const [cal, id] of Object.entries(WANT)) for (const mode of ["full", "module"]) {
  const c = kit(cal, mode);
  const st = D.focusState(c);
  check("kit." + cal + "." + mode + ".item", count(c, id) === 1, J(ids(c)));
  check("kit." + cal + "." + mode + ".slot", !!st && st.kind === "item" && st.itemId === id && st.name === I.byId(id).name && st.canCast === true, J(st));
  check("kit." + cal + "." + mode + ".noNote", !NOTE.test(c.equipment || ""), c.equipment);
  const cell = focusCell(D.html(c, {}));
  check("kit." + cal + "." + mode + ".html", /filled/.test(cell) && /doll-focus-item/.test(cell) && cell.indexOf(I.byId(id).name.replace(/\s*\(.*$/, "")) >= 0 && /class="doll-art"/.test(cell), cell.slice(0, 500));
  check("kit." + cal + "." + mode + ".chip", I.eqRows(c).filter((r) => r.cat === "focus" || (r.also || []).includes("focus")).some((r) => r.name === I.byId(id).name));
  K.apply(c, cal, mode === "module" ? { _start: "module" } : {});
  check("kit." + cal + "." + mode + ".againNoDouble", count(c, id) === 1, J(ids(c)));
}
check("kit.lawman.noHolySymbol", ["full", "module"].every((m) => count(kit("lawman", m), HOLY) === 0));
check("kit.scholar.fullArcaneExtra", count(kit("scholar", "full"), ARCANE) === 1 && D.focusState(kit("scholar", "full")).itemId === "chemical-field-ledger");
check("kit.scholar.ledgerNote", /spellbook/.test(D.focusState(kit("scholar", "module")).note));
for (const [pick, id] of [["stick", "carved-walking-stick"], ["pouch", "medicine-pouch"], ["soil", "home-spring-soil-pouch"], [undefined, "carved-walking-stick"]]) for (const mode of ["full", "module"]) {
  const c = kit("nature-guide", mode, pick ? { focus: pick } : {});
  check("kit.natureGuide." + (pick || "default") + "." + mode, count(c, id) === 1 && D.focusState(c).itemId === id && count(c, DRUID) === 0 && !/cord/.test(c.equipment || ""), J(ids(c)) + " " + c.equipment);
}
/* M5 Grant full kit on a Module start: no second focus */
for (const cal of Object.keys(WANT)) {
  const c = kit(cal, "module", cal === "nature-guide" ? { focus: "soil" } : {});
  K.grantFull(c);
  check("grantFull." + cal + ".oneFocus", NEW.concat([HOLY]).every((id) => count(c, id) <= 1) && !!D.focusState(c) && D.focusState(c).kind === "item", J(ids(c)));
}
/* unchanged Callings */
check("same.storyteller", D.focusState(kit("storyteller", "full")) === null);
check("same.pactSeeker", D.focusState(kit("pact-seeker", "full")).kind === "patron");
check("same.hexslinger", D.focusState(kit("hexslinger", "full")).kind === "caster");
check("same.gunslinger", D.focusState(kit("gunslinger", "full")) === null && D.focusState(kit("tribal-warrior", "full")) === null);
check("same.bareCharacter", D.focusState({ calling: "scholar", items: [] }) === null);

/* 3. Hexslinger: the Focus chip counts the Caster Gun the Focus slot mirrors (one row, still under Weapons) */
{
  const c = kit("hexslinger", "full"); c.guns[0].equipped = true;
  const rows = I.eqRows(c);
  const fr = rows.filter((r) => r.cat === "focus" || (r.also || []).includes("focus"));
  check("hex.chipCountsCaster", fr.length === 1 && fr[0].cat === "weapons" && /Blacksnake/.test(fr[0].name), J(fr.map((r) => r.name)));
  const noCaster = clone(c); noCaster.guns[0].equipped = false;
  check("hex.noCasterNoChip", D.focusState(noCaster).kind === "nocaster" && !I.eqRows(noCaster).some((r) => (r.also || []).includes("focus")));
}

/* 4. migration of saved sheets (equipMigrated 2, before this PR): never doubles, keeps the old notes */
{
  const sch = { calling: "scholar", equipMigrated: 2, ironSlotMigrated: 1, equipment: "• Chemical Field Ledger (focus)\n• Lucky coin", items: [], kitGrants: { v: 1, items: [], ammo: {} } };
  K.migrateEquipment(sch);
  check("migrate.scholar", count(sch, "chemical-field-ledger") === 1 && sch.equipment === "• Lucky coin" && /Ledger/.test(sch.equipmentBefore0408) && sch.focusMigrated === 1, J(sch));
  K.migrateEquipment(sch); K.migrateFocus(sch);
  check("migrate.scholar.again", count(sch, "chemical-field-ledger") === 1);
  const sco = { calling: "frontier-scout", equipMigrated: 2, equipment: "• Gun belt\n• Keepsake (focus)", items: [], kitGrants: { v: 1, items: [], ammo: {} } };
  K.migrateEquipment(sco);
  check("migrate.scout", count(sco, "frontier-keepsake") === 1 && !/Keepsake/.test(sco.equipment) && /Gun belt/.test(sco.equipment), J(sco));
  const ng = { calling: "nature-guide", equipMigrated: 2, equipment: "• Focus worn on a cord, if the DM agrees", items: [], kitGrants: { v: 1, items: [], ammo: {} } };
  K.migrateEquipment(ng);
  check("migrate.natureGuide.cord", count(ng, "carved-walking-stick") === 1 && !ng.equipment, J(ng));
  const holyRow = I.instanceFrom(I.byId(HOLY));
  const law = { calling: "lawman", equipMigrated: 2, equipment: "", items: [holyRow], kitGrants: { v: 1, items: [HOLY], ammo: {} } };
  K.migrateEquipment(law);
  check("migrate.lawman.badge", count(law, "tin-star-badge") === 1 && count(law, HOLY) === 0 && law.items[0].uid === holyRow.uid && law.kitGrants.items.includes("tin-star-badge") && D.focusState(law).badge === "bright", J(law.items));
  const lawOld = { calling: "lawman", equipMigrated: 2, equipment: "", items: [I.instanceFrom(I.byId(HOLY))] };
  K.migrateEquipment(lawOld);
  check("migrate.lawman.noRecord", count(lawOld, "tin-star-badge") === 1 && count(lawOld, HOLY) === 0, J(ids(lawOld)));
  const lawBought = { calling: "lawman", equipMigrated: 2, equipment: "", items: [I.instanceFrom(I.byId("tin-star-badge")), I.instanceFrom(I.byId(HOLY))], kitGrants: { v: 1, items: ["tin-star-badge"], ammo: {} } };
  K.migrateEquipment(lawBought);
  check("migrate.lawman.boughtHolyKept", count(lawBought, HOLY) === 1 && count(lawBought, "tin-star-badge") === 1);
  const ngPick = { calling: "nature-guide", equipMigrated: 2, equipment: "", kitPicks: { focus: "pouch" }, items: [I.instanceFrom(I.byId(DRUID))], kitGrants: { v: 1, items: [DRUID], ammo: {} } };
  K.migrateEquipment(ngPick);
  check("migrate.natureGuide.pick", count(ngPick, "medicine-pouch") === 1 && count(ngPick, DRUID) === 0, J(ids(ngPick)));
  const ngUnknown = { calling: "nature-guide", equipMigrated: 2, equipment: "", items: [I.instanceFrom(I.byId(DRUID))], kitGrants: { v: 1, items: [DRUID], ammo: {} } };
  K.migrateEquipment(ngUnknown);
  check("migrate.natureGuide.unknownKeepsDruidic", count(ngUnknown, DRUID) === 1 && D.focusState(ngUnknown).itemId === DRUID, J(ids(ngUnknown)));
  const pre = { calling: "frontier-preacher", equipMigrated: 2, equipment: "• Lucky coin", items: [I.instanceFrom(I.byId(HOLY))] };
  const preBefore = J(pre); K.migrateEquipment(pre);
  check("migrate.preacherUntouched", J(Object.assign({}, pre)) === preBefore && D.focusState(pre).itemId === HOLY, J(pre));
  const old = { calling: "lawman", equipMigrated: 1, equipment: "• Badge (tin star, focus)", items: [] };
  K.migrateEquipment(old);
  check("migrate.v1sheet.badgeLine", count(old, "tin-star-badge") === 1 || /Badge/.test(old.equipment), J(old));
}

/* 5. Frontier Scout: lost keepsake (BOOK1 L1697) -> no casting until a new one is made at a long rest */
{
  const c = kit("frontier-scout", "full");
  const uid = c.items.find((x) => x.catalogId === "frontier-keepsake").uid;
  check("scout.castOpen", F.castBlock(c) === "");
  const r = F.markFocusLost(c, { at: "t" });
  const st = D.focusState(c);
  check("scout.lost", r.ok && count(c, "frontier-keepsake") === 0 && !!c.focusLost && st.lost === true && st.canCast === false && /long rest/.test(st.note), J(st));
  check("scout.lostBlocksCast", F.castBlock(c) === F.LOST_WHY && /can't cast/.test(F.LOST_WHY));
  const cell = focusCell(D.html(c, {}));
  check("scout.lostHtml", /doll-focus-lost/.test(cell) && /make a new one at a long rest/.test(cell) && !/ filled/.test(cell.split("data-doll-slot")[0].slice(-200)), cell.slice(0, 400));
  const pk = D.pickerHtml(c, "focus_borrowed_iron");
  check("scout.remakeButton", /data-doll-focusremake/.test(pk) && /Make a new one \(long rest\)/.test(pk), pk);
  check("scout.lostTwice", F.markFocusLost(c).ok === false);
  const r2 = F.remakeFocus(c);
  check("scout.remade", r2.ok && count(c, "frontier-keepsake") === 1 && c.items.find((x) => x.catalogId === "frontier-keepsake").uid === uid && !c.focusLost && D.focusState(c).canCast && F.castBlock(c) === "", J(c.items.map((x) => x.catalogId)));
  check("scout.remakeTwice", F.remakeFocus(c).ok === false);
  check("scout.lostButtonInPicker", /data-doll-focuslost/.test(D.pickerHtml(c, "focus_borrowed_iron")));
  check("scout.othersNoLost", F.markFocusLost(kit("scholar", "full")).ok === false && !/data-doll-focuslost/.test(D.pickerHtml(kit("scholar", "full"), "focus_borrowed_iron")));
  const bare = kit("frontier-scout", "module"); bare.focusLost = { catalogId: "frontier-keepsake" }; bare.items = [];
  check("scout.remakeFresh", F.remakeFocus(bare).ok && count(bare, "frontier-keepsake") === 1);
}

/* 6. Badge Bound: Bright / Dull / Tarnished */
{
  const c = kit("lawman", "full"); c.level = 5;
  check("badge.defaultBright", F.badge(c) === "bright" && F.badge({}) === "bright" && F.badge({ badgeState: "weird" }) === "bright");
  check("badge.moduleStartDull", F.badge(kit("lawman", "module")) === "dull");
  const per = {};
  for (const st of ["bright", "dull", "tarnished"]) {
    c.badgeState = st;
    per[st] = { spells: F.badgeBlock(c, "spells"), smite: F.badgeBlock(c, "smite"), mercy: F.badgeBlock(c, "mercy"), creed: F.badgeBlock(c, "creed"), cast: F.castBlock(c), fs: D.focusState(c), cell: focusCell(D.html(c, {})) };
  }
  check("badge.bright.allOpen", !per.bright.spells && !per.bright.smite && !per.bright.mercy && !per.bright.creed && !per.bright.cast, J(per.bright));
  check("badge.dull.allBlocked", /Dull/.test(per.dull.spells) && /Smite Lead/.test(per.dull.smite) && /Mercy Hands/.test(per.dull.mercy) && /Channel Creed/.test(per.dull.creed) && per.dull.cast === per.dull.spells, J(per.dull));
  check("badge.tarnished.spellsOpen", per.tarnished.spells === "" && per.tarnished.cast === "" && /Tarnished/.test(per.tarnished.smite) && /Tarnished/.test(per.tarnished.mercy) && /Tarnished/.test(per.tarnished.creed), J(per.tarnished));
  for (const st of ["bright", "dull", "tarnished"]) {
    const fs_ = per[st].fs;
    check("badge." + st + ".slot", fs_.badge === st && fs_.itemId === "tin-star-badge" && new RegExp("lawman-badge-" + st + "\\.webp$").test(fs_.art) && /tin-star-board\.webp$/.test(fs_.fallback) && (st === "tarnished") === !!fs_.lawless, J(fs_));
    check("badge." + st + ".html", new RegExp('data-badge-state="' + st + '"').test(per[st].cell) && /data-fallback="[^"]*tin-star-board\.webp"/.test(per[st].cell) && (st === "tarnished") === /Lawless/.test(per[st].cell) && new RegExp("doll-badge-" + st).test(per[st].cell), per[st].cell.slice(0, 600));
  }
  check("badge.otherCallingsNeverBlocked", ["dull", "tarnished"].every((st) => !F.badgeBlock({ calling: "frontier-preacher", badgeState: st }, "spells") && !F.castBlock({ calling: "frontier-preacher", badgeState: st })));
  check("badge.lawlessFlag", F.lawless({ calling: "lawman", badgeState: "tarnished" }) && !F.lawless({ calling: "lawman", badgeState: "dull" }) && !F.lawless({ calling: "scholar", badgeState: "tarnished" }));
  check("badge.oathHookNull", F.lawlessOathHook({ calling: "lawman", badgeState: "tarnished" }) === null && typeof sb.SSDNS_LAWLESS.oathFeatures === "function");
  check("badge.noResourceMechanic", !/authority|shine/i.test(read("assets/js/focus-slot.js")));
}

/* 7. the Lawless list (L0214) */
{
  const L = sb.SSDNS_LAWLESS, lv = L.levels;
  const want = { 1: ["Hellish Rebuke", "Inflict Wounds", "Command", "Wrathful Smite", "Searing Smite"], 2: ["Crown of Madness", "Darkness", "Branding Smite", "Magic Weapon"],
    3: ["Animate Dead", "Bestow Curse", "Blinding Smite", "Dispel Magic"], 4: ["Blight", "Confusion", "Staggering Smite"], 5: ["Contagion", "Dominate Person", "Destructive Wave"] };
  const western = { "Hellish Rebuke": "Hell's Answer", "Inflict Wounds": "Gut Shot", "Crown of Madness": "Fever", Darkness: "Lights Out", "Animate Dead": "Boot Hill", "Bestow Curse": "Hex Mark",
    Blight: "Dry Rot", Confusion: "Snake Oil Haze", Contagion: "Plague Wagon", "Dominate Person": "Bought Man", "Destructive Wave": "Judgment Day" };
  for (const [l, names] of Object.entries(want)) {
    const got = lv[l].map((x) => x.replace(/\s*\(.*\)$/, ""));
    check("lawless.level" + l, J(got) === J(names), J(lv[l]));
    lv[l].forEach((raw) => {
      const phb = raw.replace(/\s*\(.*\)$/, ""), alias = (/\(([^)]+)\)$/.exec(raw) || [])[1] || "";
      if (western[phb]) check("lawless.western." + phb, alias === western[phb], raw);
      check("lawless.blurb." + phb, !!sb.SSDNSSpellFx || /./.test(read("assets/js/spell-fx.js").match(new RegExp('"' + phb.toLowerCase() + '"')) || ""), phb);
      check("lawless.rulesSpell." + phb, (sb.SSDNS_RULES.spells || []).some((s) => s && String(s.name).toLowerCase() === phb.toLowerCase()) || new RegExp('"name": "' + phb + '"').test(read("assets/data/rules.js")), phb);
    });
  }
  check("lawless.rulesUntouched", !/Lawless list \(L0214\)/.test(read("assets/data/rules.js")));
  check("lawless.loadedSheetAndDmcc", /lawless-spells\.js/.test(read("index.html")) && /lawless-spells\.js/.test(read("dm/index.html")));
}

/* ---------- browser part ---------- */
const ORIGIN = process.env.SSDNS_ORIGIN || "http://127.0.0.1:8765";
function portOpen(port, host) { return new Promise((r) => { const s = net.connect({ port, host }, () => { s.end(); r(true); }); s.on("error", () => r(false)); }); }
const u = new URL(ORIGIN);
if (!(await portOpen(Number(u.port), u.hostname))) { console.log("Static server is not listening on " + ORIGIN + " (run via ssdns-test-all)"); process.exit(1); }
const puppeteer = (await import("/tmp/pup/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js")).default;
const browser = await puppeteer.launch({ executablePath: "/opt/google/chrome/chrome", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
async function open(setup, arg) {
  const ctx = await browser.createBrowserContext();
  const pg = await ctx.newPage();
  const errs = [];
  pg.on("pageerror", (e) => errs.push(String(e)));
  await pg.setViewport({ width: 1300, height: 1000 });
  await pg.goto(ORIGIN + "/index.html?fresh=" + Date.now(), { waitUntil: "domcontentloaded" });
  await pg.waitForFunction(() => window.SSDNSApp && window.SSDNSDoll && window.SSDNSFocus && window.SSDNSKits && window.SSDNSDmJoin && document.querySelector("#dollHost"), { timeout: 20000 });
  await sleep(900);
  await pg.evaluate(setup, arg);
  await sleep(500);
  await pg.evaluate(() => document.querySelector("#tab-equip").click());
  await sleep(400);
  return { pg, ctx, errs };
}
const slotInfo = () => {
  const s = document.querySelector('#dollHost [data-doll-slot="focus_borrowed_iron"]');
  const pill = s && s.querySelector(".doll-badge-state");
  const cast = [...document.querySelectorAll("[data-spell-cast]")].map((b) => ({ name: b.getAttribute("data-spell-cast"), disabled: b.disabled, title: b.title || "" }));
  const mercy = document.getElementById("btnMercy");
  const arm = document.querySelector('[data-trk-arm="smite"]');
  const creed = [...document.querySelectorAll(".trk-res")].find((r) => /Channel Creed/.test(r.textContent));
  const chip = document.getElementById("badgeChip") || document.querySelector(".chip.badge");
  return { cls: s ? s.className : "", name: s && s.querySelector(".doll-name") ? s.querySelector(".doll-name").textContent : "", pill: pill ? pill.textContent : "",
    art: s && s.querySelector(".doll-art") ? s.querySelector(".doll-art").getAttribute("src") : "", artOk: !!(s && s.querySelector(".doll-art") && s.querySelector(".doll-art").naturalWidth > 0),
    cast, mercy: mercy ? { hidden: mercy.hidden, disabled: mercy.disabled } : null, arm: arm ? { disabled: arm.disabled, title: arm.title } : null,
    creed: creed ? { off: creed.classList.contains("trk-badge-off"), text: creed.textContent } : null, chip: chip ? chip.textContent : "",
    lawlessNote: (document.getElementById("lawlessSpellNote") || {}).textContent || "", spellNote: (document.getElementById("focusSpellNote") || {}).textContent || "",
    book: window.SSDNSApp.doc().character.lawlessSpells || null, choices: window.SSDNSApp.castChoices().map((x) => x.name), catalog: window.SSDNSApp.callingCatalog().map((x) => x.phb) };
};
try {
  /* Lawman: the DM's badge command, live, through all three states and back */
  {
    const { pg, ctx, errs } = await open(() => window.SSDNSApp.applyPatch((d) => {
      const c = d.character; c.name = "Cole"; c.calling = "lawman"; c.level = 5; c.subclass = "oath-of-the-badge-devotion"; c.abilities = Object.assign(c.abilities || {}, { CHA: 16 });
      window.SSDNSKits.apply(c, "lawman", {}); c.kitStamp = "lawman"; c.badgeState = "bright";
      c.spells = c.spells || {}; c.spells[1] = [{ name: "Bless", prepared: true }, { name: "Cure Wounds (Trail Medicine)", prepared: true }];
    }));
    const send = (st) => pg.evaluate((s) => window.SSDNSDmJoin._handle({ type: "badge", payload: { state: s } }), st);
    await pg.evaluate(() => { if (window.SSDNSTableUx) window.SSDNSTableUx.paintCallingChips(); document.querySelector("#tab-hex").click(); }); await sleep(300);
    let b = await pg.evaluate(slotInfo);
    check("ui.bright.slot", /doll-badge-bright/.test(b.cls) && b.name === "Tin star badge" && /^Bright/.test(b.pill) && b.artOk, J(b));
    check("ui.bright.spellsOpen", b.cast.some((x) => /Bless/.test(x.name) && !x.disabled) && b.choices.includes("Bless") && b.catalog.includes("Bless"), J(b.cast));
    check("ui.bright.mercyOpen", b.mercy && !b.mercy.hidden && !b.mercy.disabled, J(b.mercy));
    await send("dull"); await sleep(500);
    b = await pg.evaluate(slotInfo);
    check("ui.dull.slot", /doll-badge-dull/.test(b.cls) && /^Dull/.test(b.pill) && !/Lawless/.test(b.pill), J(b));
    check("ui.dull.spellsGreyed", b.cast.length > 0 && b.cast.every((x) => x.disabled && /Dull/.test(x.title)) && /Dull/.test(b.spellNote), J(b.cast) + b.spellNote);
    check("ui.dull.mercySmiteCreed", b.mercy.disabled && b.arm && b.arm.disabled && /Dull/.test(b.arm.title) && b.creed && b.creed.off, J([b.mercy, b.arm, b.creed]));
    check("ui.dull.sameList", b.choices.includes("Bless") && !b.book, J(b.choices));
    await send("tarnished"); await sleep(500);
    b = await pg.evaluate(slotInfo);
    check("ui.tarnished.slot", /doll-badge-tarnished/.test(b.cls) && /Tarnished/.test(b.pill) && /Lawless/.test(b.pill), J(b));
    check("ui.tarnished.chipLawless", /Lawless/.test(b.chip), b.chip);
    check("ui.tarnished.listSwapped", !b.choices.includes("Bless") && b.choices.includes("Hellish Rebuke (Hell's Answer)") && b.choices.includes("Darkness (Lights Out)") && !b.choices.some((n) => /Animate Dead/.test(n)) &&
      b.catalog.includes("Animate Dead") && !b.catalog.includes("Bless"), J([b.choices, b.catalog]));
    check("ui.tarnished.spellsCastable", b.cast.length === 9 && b.cast.every((x) => !x.disabled) && /Lawless/.test(b.lawlessNote) && !b.spellNote, J(b.cast) + b.lawlessNote);
    check("ui.tarnished.mercySmiteCreedOff", b.mercy.disabled && b.arm.disabled && /Tarnished/.test(b.arm.title) && b.creed && b.creed.off, J([b.mercy, b.arm, b.creed]));
    const names = await pg.evaluate(() => [...document.querySelectorAll('[data-spell-lines="1"] .sp-alias')].map((e) => e.textContent));
    check("ui.tarnished.westernNames", names.includes("Hell's Answer") && names.includes("Gut Shot") && !names.includes("Trail Medicine"), J(names));
    await send("bright"); await sleep(500);
    b = await pg.evaluate(slotInfo);
    check("ui.restore.bright", /^Bright/.test(b.pill) && b.choices.includes("Bless") && b.choices.includes("Cure Wounds (Trail Medicine)") && !b.choices.some((n) => /Hellish/.test(n)) && b.catalog.includes("Bless") && !b.lawlessNote, J(b.choices));
    check("ui.restore.lawlessBookKept", !!b.book && b.book.seeded === true, J(b.book));
    await send("tarnished"); await sleep(300); await send("dull"); await sleep(400);
    b = await pg.evaluate(slotInfo);
    check("ui.restore.dull", b.choices.includes("Bless") && !b.choices.some((n) => /Hellish/.test(n)) && b.cast.every((x) => x.disabled), J(b.choices));
    const lawman = await pg.evaluate(() => window.SSDNSApp.doc().character.spells[1].map((x) => x.name));
    check("ui.restore.lawmanSpellsUntouched", J(lawman.filter(Boolean)) === J(["Bless", "Cure Wounds (Trail Medicine)"]), J(lawman));
    check("ui.lawman.noPageErrors", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  /* Frontier Scout: lost keepsake and remake, from the Focus slot picker */
  {
    const { pg, ctx, errs } = await open(() => window.SSDNSApp.applyPatch((d) => {
      const c = d.character; c.name = "Wren"; c.calling = "frontier-scout"; c.level = 3; c.abilities = Object.assign(c.abilities || {}, { WIS: 16 });
      window.SSDNSKits.apply(c, "frontier-scout", {}); c.kitStamp = "frontier-scout";
    }));
    let s = await pg.evaluate(slotInfo);
    check("ui.scout.slot", /doll-focus-item/.test(s.cls) && s.name === "Keepsake of home" && s.artOk, J(s));
    await pg.evaluate(() => document.querySelector('#dollHost [data-doll-slot="focus_borrowed_iron"]').click()); await sleep(300);
    await pg.evaluate(() => document.querySelector("#dollHost [data-doll-focuslost]").click()); await sleep(500);
    s = await pg.evaluate(slotInfo);
    const lost = await pg.evaluate(() => ({ flag: !!window.SSDNSApp.doc().character.focusLost, block: window.SSDNSFocus.castBlock(window.SSDNSApp.doc().character),
      has: window.SSDNSApp.doc().character.items.some((x) => x.catalogId === "frontier-keepsake"), note: (document.querySelector('#dollHost [data-doll-slot="focus_borrowed_iron"] .doll-focus-note') || {}).textContent || "" }));
    check("ui.scout.lost", /doll-focus-lost/.test(s.cls) && lost.flag && !lost.has && /can't cast/.test(lost.block) && /long rest/.test(lost.note), J([s.cls, lost]));
    await pg.evaluate(() => document.querySelector('#dollHost [data-doll-slot="focus_borrowed_iron"]').click()); await sleep(300);
    await pg.evaluate(() => document.querySelector("#dollHost [data-doll-focusremake]").click()); await sleep(500);
    s = await pg.evaluate(slotInfo);
    const back = await pg.evaluate(() => ({ flag: !!window.SSDNSApp.doc().character.focusLost, n: window.SSDNSApp.doc().character.items.filter((x) => x.catalogId === "frontier-keepsake").length, block: window.SSDNSFocus.castBlock(window.SSDNSApp.doc().character) }));
    check("ui.scout.remade", !/doll-focus-lost/.test(s.cls) && s.name === "Keepsake of home" && !back.flag && back.n === 1 && back.block === "", J([s.cls, back]));
    check("ui.scout.noPageErrors", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  /* Hexslinger: the Focus chip agrees with the Focus slot */
  {
    const { pg, ctx, errs } = await open(() => window.SSDNSApp.applyPatch((d) => {
      const c = d.character; c.name = "Hex"; c.calling = "hexslinger"; c.level = 3; window.SSDNSKits.apply(c, "hexslinger", {}); c.kitStamp = "hexslinger"; c.guns[0].equipped = true; c.dollWeapons = { revolver_1: 0 };
    }));
    const h = await pg.evaluate(() => ({ slot: (document.querySelector('#dollHost [data-doll-slot="focus_borrowed_iron"] .doll-name') || {}).textContent || "",
      chip: (document.querySelector('.eq-chip[data-eq-filter="focus"] .n') || {}).textContent || "" }));
    check("ui.hex.chipMatchesSlot", /Blacksnake/.test(h.slot) && h.chip === "1", J(h));
    check("ui.hex.noPageErrors", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  /* DMCC (offline demo): the Badge toggle on a Lawman's card queues the badge command; other Callings have no toggle */
  {
    const ctx = await browser.createBrowserContext();
    const pg = await ctx.newPage();
    const errs = []; pg.on("pageerror", (e) => errs.push(String(e)));
    await pg.setViewport({ width: 1300, height: 1100 });
    await pg.goto(ORIGIN + dmccUrl("/dm/index.html"), { waitUntil: "domcontentloaded" });
    await dmccOffline(pg);
    await pg.waitForFunction(() => window.DMCC && document.querySelector("#btnLoadDemo"), { timeout: 20000 });
    await pg.evaluate(() => document.querySelector("#btnLoadDemo").click());
    await pg.waitForFunction(() => window.DMCC.state.demo && Object.keys(window.DMCC.state.players || {}).length > 1, { timeout: 20000 });
    const ids2 = await pg.evaluate(() => { const ids = Object.keys(window.DMCC.state.players);
      Object.assign(window.DMCC.state.players[ids[1]].snapshot, { calling: "Lawman", callingId: "lawman", badgeState: "dull" }); return ids; });
    await pg.evaluate((id) => document.querySelector('.pcard[data-pid="' + id + '"]').click(), ids2[1]); await sleep(700);
    let t = await pg.evaluate(() => ({ btns: [...document.querySelectorAll("#dmBadge [data-dm-badge]")].map((b) => b.getAttribute("data-dm-badge") + (b.classList.contains("on") ? "*" : "")), now: (document.getElementById("dmBadgeNow") || {}).textContent || "" }));
    check("dm.toggleShown", J(t.btns) === J(["bright", "dull*", "tarnished"]) && /Dull/.test(t.now), J(t));
    await pg.evaluate(() => document.querySelector('#dmBadge [data-dm-badge="tarnished"]').click()); await sleep(400);
    const cmd = await pg.evaluate(() => window.DMCC.state.commands[0]);
    t = await pg.evaluate(() => ({ on: [...document.querySelectorAll("#dmBadge [data-dm-badge].on")].map((b) => b.getAttribute("data-dm-badge")), now: (document.getElementById("dmBadgeNow") || {}).textContent || "" }));
    check("dm.toggleCommand", cmd && cmd.type === "badge" && cmd.payload && cmd.payload.state === "tarnished" && cmd.to === ids2[1], J(cmd));
    check("dm.toggleState", J(t.on) === J(["tarnished"]) && /Lawless/.test(t.now), J(t));
    await pg.evaluate(() => { const x = document.querySelector("#detailOverlay .close, #btnCloseDetail, [data-close-detail]"); if (x) x.click(); else document.getElementById("detailOverlay").hidden = true; }); await sleep(300);
    await pg.evaluate((id) => { window.DMCC.state.players[id].snapshot.callingId = "gunslinger"; document.querySelector('.pcard[data-pid="' + id + '"]').click(); }, ids2[0]); await sleep(600);
    check("dm.noToggleForOthers", await pg.evaluate(() => !document.querySelector("#dmBadge")));
    check("dm.noPageErrors", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
} finally {
  await browser.close();
}
console.log(failures.length ? "\n" + failures.length + " FAILED" : "\nall focus-fix checks passed");
process.exit(failures.length ? 1 : 0);

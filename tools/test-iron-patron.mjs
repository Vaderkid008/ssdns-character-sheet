/**
 * 0.3.106 (Jessey 2026-10-21 12:06 / 12:11 / 12:12 PM CT): the Borrowed Iron belongs to its patron.
 *  - Bug: "Lass o lakes shows up with the hell maker pistol". Root cause: the DMCC player card's Give equipment section
 *    drew a fixed Hell Maker figure (the Crossroads Note's iron) on every player's card. Removed. Every view of the iron
 *    (item tile, Weapons card, Equipment row, paper-doll slot, DMCC) comes from the character's own Pact (iron-art.js).
 *  - Old saves: Hell Maker art / name left on another pact's iron item is put back on load (fixStaleIron).
 *  - The iron shows under Weapons as its real iron from the Pact pick ("Butter Repeater — Pact rifle", 0.3.106:
 *    no DM reveal any more, Jessey 2026-10-21 5:47 PM CT).
 *  - L0201: weapon slots only (long irons: Long gun; one-handed: Pistol R / Pistol L). Worn slots refuse it.
 *  - Picking the Pact (wizard or sheet) makes exactly one iron and seats it; changing the Pact swaps it (no duplicates).
 *   node tools/test-iron-patron.mjs     (browser part needs ssdns-test-all's static server on 127.0.0.1:8765)
 *   SSDNS_SHOTS=/workspace/specs node tools/test-iron-patron.mjs   also saves iron-patron-*.png screenshots
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import net from "node:net";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const J = (x) => JSON.stringify(x);
function check(id, cond, detail) {
  if (!cond) failures.push(id + (detail ? " — " + detail : ""));
  console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + detail : ""));
}
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PACTS = [
  ["the-crossroads-note", "hell-maker", "Hell Maker", "Double-action revolver", "revolver_2", "pact-revolver", "Pact revolver"],
  ["the-sealed-orders", "lightslinger", "Lightslinger", "Single-action revolver", "revolver_2", "pact-revolver", "Pact revolver"],
  ["lass-o-lakes", "butter-repeater", "Butter Repeater", "Lever-action carbine", "long_gun", "pact-rifle", "Pact rifle"],
  ["the-last-round", "virgil", "Virgil", "Snub-nose belly gun", "revolver_2", "pact-revolver", "Pact revolver"],
  ["the-sand-oath", "sirocco-long-rifle", "Sirocco Long-Rifle", "Long rifle", "long_gun", "pact-rifle", "Pact rifle"],
  ["the-pine-box-contract", "pallbearer", "Pallbearer", "Sawed-off coach gun", "long_gun", "pact-shotgun", "Pact shotgun"],
  ["the-drowned-breath", "revenge-of-the-sea", "Revenge of the Sea", "Harpoon gun", "long_gun", "pact-rifle", "Pact rifle"] /* U6 (Jessey 7:34 PM): was pact-harpoon-gun / Pact harpoon gun */
];
const HELL = /hell-maker|Hell Maker/;
/* 0.3.106 (Jessey 4:51 / 5:13 PM): every iron has a weapon class; the label reads "Borrowed Iron — Pact rifle" (no look name in brackets) */
const PBY = Object.fromEntries(PACTS.map((p) => [p[1], p]));
/* 0.3.106 (Jessey 5:47 PM): the real iron shows from the Pact pick, no DM reveal: "Butter Repeater — Pact rifle" */
const L = (slug) => PBY[slug][2] + " — " + PBY[slug][6];
/* 0.3.106 (Jessey 4:35 PM): hidden art = plain long-gun outline for a long iron, generic revolver tile for a pistol iron */
const OUTLINE = /items\/borrowed-iron-long-outline\.svg$/, GENERIC = /items\/borrowed-iron\.webp$/;
const hiddenRe = (slot) => (slot === "long_gun" ? OUTLINE : GENERIC);

/* ---------- node part ---------- */
const sb = { console }; sb.window = sb; sb.globalThis = sb;
sb.document = { readyState: "complete", getElementById: () => null, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] };
vm.createContext(sb);
for (const f of ["assets/data/rules.js", "assets/data/item-catalog.js", "assets/data/item-catalog-gear.js", "assets/js/item-ui.js", "assets/js/items.js",
  "assets/js/kits.js", "assets/js/equip.js", "assets/js/weapon-art.js", "assets/js/iron-art.js", "assets/js/paper-doll.js", "assets/js/focus-slot.js",
  "assets/js/spell-fx.js", "assets/js/spell-cast.js", "assets/js/pact-shot.js", "assets/js/creator.js"]) {
  vm.runInContext(read(f), sb, { filename: f });
}
const IA = sb.SSDNSIronArt, D = sb.SSDNSDoll, K = sb.SSDNSKits;
const pact = (sub, rev) => { const c = K.apply(K.blankCharacter(), "pact-seeker", {}); c.calling = "pact-seeker"; c.subclass = sub; if (rev) c.ironRevealed = true; return c; };
const irons = (c) => (c.items || []).filter((it) => it && it.catalogId === "borrowed-iron");

for (const [sub, slug, nm, type, slot, cls, clsName] of PACTS) {
  const hid = pact(sub), rev = pact(sub, true);
  check("pact." + slug + ".map", IA.pactSlug(hid) === slug && IA.slugFor(hid, { dm: true }) === slug);
  check("pact." + slug + ".label", IA.labelFor(hid) === L(slug) && IA.typeFor(hid) === type, IA.labelFor(hid));
  check("pact." + slug + ".shownWithoutReveal", !hid.ironRevealed && IA.nameFor(hid) === nm && IA.tileSrc(hid) === IA.tileSrc(rev) && IA.engravingSrc(hid) === IA.engravingSrc(rev) && IA.labelFor(hid) === IA.labelFor(rev));
  check("pact." + slug + ".revealedArt", IA.nameFor(rev) === nm && IA.tileSrc(rev) === "assets/img/items/borrowed-iron/" + slug + ".webp" &&
    IA.engravingSrc(rev) === (slug === "hell-maker" ? "assets/img/dm-only/hell-maker.webp" : "assets/img/weapons/borrowed-iron/" + slug + ".webp"));
  check("pact." + slug + ".filesExist", fs.existsSync(path.join(root, IA.tileSrc(rev))) && fs.existsSync(path.join(root, IA.engravingSrc(rev))));
  check("pact." + slug + ".noHellUnlessCrossroads", slug === "hell-maker" || (!HELL.test(IA.tileSrc(rev) + IA.engravingSrc(rev) + IA.nameFor(rev) + IA.labelFor(rev))));
  check("pact." + slug + ".noOutlineOncePicked", IA.hiddenArt(hid) === "" && IA.hiddenArt(rev) === "" &&
    fs.existsSync(path.join(root, IA.HIDDEN_LONG)), J([IA.hiddenArt(hid), IA.hiddenArt(rev)]));
  const st = D.ironState(rev);
  check("pact." + slug + ".dollSlot", st && st.key === slot && st.art === IA.tileSrc(rev) && st.ironType === type, J(st));
  check("pact." + slug + ".hiddenDoll", D.ironState(hid).key === slot && D.ironState(hid).art === IA.tileSrc(rev) && D.ironState(hid).note === "In hand · " + nm && !/[()]/.test(IA.labelFor(hid)) && IA.labelFor(hid).indexOf(type) < 0, J(D.ironState(hid)));
  const allowed = IA.allowedSlots(hid);
  check("pact." + slug + ".slotsAllowed", slot === "long_gun" ? J(allowed) === J(["long_gun"]) : J(allowed) === J(["revolver_2", "revolver_1"]), J(allowed));
  const wrong = slot === "long_gun" ? "revolver_2" : "long_gun";
  const r1 = D.setIronSlot(pact(sub), wrong), r2 = D.setIronSlot(pact(sub), "melee");
  check("pact." + slug + ".wrongSlotRefused", !r1.ok && /weapon slot only/.test(r1.reason) && r1.reason.indexOf(clsName) >= 0 && !/\(/.test(r1.reason) && !r2.ok, J([r1, r2]));
  const it = irons(hid)[0];
  const r3 = D.equip(hid, "accessory_1", it.uid), r4 = D.equip(hid, "hat", it.uid);
  check("pact." + slug + ".wornSlotRefused", !r3.ok && !r4.ok && /weapon slot only/.test(r3.reason) && !it.equipSlot && !D.fits(it, "accessory_1"), J([r3, r4]));
  check("pact." + slug + ".noWearToggle", !D.wearable(it));
  /* 0.3.106 (Jessey 4:51 PM): one weapon class field on the item drives slots, label, row and outline */
  const st2 = pact(sub); D.syncIron(st2, { pactChanged: true });
  const it2 = irons(st2)[0];
  const wantSlots = cls === "pact-revolver" ? ["revolver_2", "revolver_1"] : ["long_gun"];
  check("class." + slug + ".itemField", !!it2 && it2.ironClass === cls && IA.classFor(st2) === cls && IA.classNameFor(st2) === clsName && IA.IRON_CLASS[cls].name === clsName, J(it2));
  check("class." + slug + ".slots", J(IA.allowedSlots(st2)) === J(wantSlots) && wantSlots.indexOf(D.ironSlot(st2)) >= 0 && D.ironSlot(st2) === slot &&
    IA.isLongIron(st2) === (cls !== "pact-revolver"), J([IA.allowedSlots(st2), D.ironSlot(st2)]));
  check("class." + slug + ".refusesOtherKind", ["revolver_1", "revolver_2", "long_gun", "melee"].filter((k) => wantSlots.indexOf(k) < 0).every((k) => !D.setIronSlot(pact(sub), k).ok) &&
    wantSlots.every((k) => D.setIronSlot(pact(sub), k).ok), cls);
  check("class." + slug + ".labelNoReveal", IA.labelFor(st2) === L(slug) && IA.nameFor(st2) === nm, IA.labelFor(st2));
  check("class." + slug + ".noOutline", IA.hiddenArt(st2) === "", IA.hiddenArt(st2));
  /* a stale class on the item never outranks the Pact, and syncIron rewrites it */
  const st3 = pact(sub); D.syncIron(st3); irons(st3)[0].ironClass = cls === "pact-revolver" ? "pact-rifle" : "pact-revolver";
  check("class." + slug + ".staleField", IA.classFor(st3) === cls && D.ironNeedsFix(st3) && D.syncIron(st3) && irons(st3)[0].ironClass === cls && !D.ironNeedsFix(st3), J(irons(st3)[0]));
}
/* a Pact change swaps the class with the iron (revolver -> shotgun) */
{
  const sw = pact("the-sealed-orders"); D.syncIron(sw, { pactChanged: true });
  const a = [irons(sw)[0].ironClass, D.ironSlot(sw)];
  sw.subclass = "the-pine-box-contract"; D.syncIron(sw, { pactChanged: true });
  check("class.pactChangeSwaps", J(a) === J(["pact-revolver", "revolver_2"]) && irons(sw).length === 1 && irons(sw)[0].ironClass === "pact-shotgun" && D.ironSlot(sw) === "long_gun", J([a, irons(sw)[0].ironClass, D.ironSlot(sw)]));
}
check("class.noPact", IA.classFor(pact("")) === "" && IA.classNameFor(pact("")) === "");
/* no Pact name yet: plain Borrowed Iron, any gun slot, never melee or a worn slot */
const none = pact("");
check("nopact.label", IA.labelFor(none) === "Borrowed Iron" && J(IA.allowedSlots(none)) === J(["revolver_2", "revolver_1", "long_gun"]));

/* old saves: Hell Maker left on a non-Crossroads iron */
const stale = pact("lass-o-lakes", true);
Object.assign(irons(stale)[0], { name: "Hell Maker", art: "assets/img/dm-only/hell-maker.webp", img: "assets/img/items/borrowed-iron/hell-maker.webp" });
stale.items.push({ uid: "x1", name: "Hell Maker", type: "gear", count: 1 }); /* a DM-typed item that is NOT the iron: left alone */
check("stale.dryCounts", IA.fixStaleIron(stale, { dry: true }) === 3 && irons(stale)[0].name === "Hell Maker");
check("stale.fixed", IA.fixStaleIron(stale) === 3 && irons(stale)[0].name === "Borrowed Iron" && !irons(stale)[0].art && !irons(stale)[0].img, J(irons(stale)[0]));
check("stale.otherItemKept", stale.items.some((x) => x.uid === "x1" && x.name === "Hell Maker"));
check("stale.idempotent", IA.fixStaleIron(stale) === 0);
check("stale.displayAfter", D.ironState(stale).art === "assets/img/items/borrowed-iron/butter-repeater.webp");
const crossOld = pact("the-crossroads-note"); Object.assign(irons(crossOld)[0], { art: "assets/img/dm-only/hell-maker.webp" });
check("stale.crossroadsKept", IA.fixStaleIron(crossOld) === 0 && irons(crossOld)[0].art);
check("stale.crossroadsShowsHellMaker", /items\/borrowed-iron\/hell-maker\.webp$/.test(D.ironState(crossOld).art), D.ironState(crossOld).art);
const crossId = pact("lass-o-lakes"); crossId.items = crossId.items.filter((x) => x.catalogId !== "borrowed-iron");
crossId.items.push({ uid: "y1", id: "borrowed-iron-crossroads-note-hell-maker", catalogId: "borrowed-iron-crossroads-note-hell-maker", name: "Borrowed Iron (Crossroads Note) Hell Maker", count: 1 });
IA.fixStaleIron(crossId);
check("stale.crossroadsIdRow", irons(crossId).length === 1 && irons(crossId)[0].id === "borrowed-iron" && irons(crossId)[0].name === "Borrowed Iron", J(crossId.items.find((x) => x.uid === "y1")));

/* syncIron: one iron, never worn, pact change re-seats it */
const dup = pact("the-sealed-orders"); dup.items.push(Object.assign({}, irons(dup)[0], { uid: "dup1" })); irons(dup)[0].equipSlot = "accessory_3";
check("sync.needsFix", D.ironNeedsFix(dup));
D.syncIron(dup);
check("sync.oneIronNotWorn", irons(dup).length === 1 && !irons(dup)[0].equipSlot && !D.ironNeedsFix(dup), J(irons(dup)));
const swap = pact("the-sealed-orders"); D.syncIron(swap, { pactChanged: true });
check("sync.shortSeat", swap.ironSlot === "revolver_2" && D.ironSlot(swap) === "revolver_2");
swap.subclass = "lass-o-lakes"; D.syncIron(swap, { pactChanged: true });
check("sync.swapToLong", swap.ironSlot === "long_gun" && D.ironSlot(swap) === "long_gun" && irons(swap).length === 1);
swap.subclass = "the-last-round"; D.syncIron(swap, { pactChanged: true });
check("sync.swapBackShort", swap.ironSlot === "revolver_2" && irons(swap).length === 1);
const gone = pact("the-sand-oath"); gone.items = gone.items.filter((x) => x.catalogId !== "borrowed-iron");
D.syncIron(gone, { pactChanged: true });
check("sync.createsMissing", irons(gone).length === 1 && gone.ironSlot === "long_gun", J(gone.items.map((x) => x.catalogId)));
const steady = pact("the-pine-box-contract"); D.syncIron(steady, { pactChanged: true }); const snap = J(steady);
check("sync.idempotent", D.syncIron(steady) === false && J(steady) === snap);

/* ---------- Pact Shot is free for every Pact Seeker (Jessey 2026-10-21 12:22 PM) ---------- */
const PS = sb.SSDNSPactShot, Cr = sb.SSDNSCreator;
const EB = "Eldritch Blast (Pact Shot)", CT = "Chill Touch (Cold Hand)";
check("ps.countable", J(PS.countable({ calling: "pact-seeker" }, [EB, CT])) === J([CT]) && J(PS.countable({ calling: "hexslinger" }, [EB, CT])) === J([EB, CT]));
const bs = Cr.buildSheet({ calling: "pact-seeker" });
const lim = 2; /* Pact Seeker 1st level: Cantrips 2 (rules.js progression) */
check("ps.wizardDefaultPicks", bs.ok && bs.draft.cantrips.length === lim && !bs.draft.cantrips.some(PS.isPactShot), J({ errs: bs.errors, c: bs.draft.cantrips }));
check("ps.wizardSheetHasFree", bs.character.cantrips.filter(Boolean).length === lim + 1 && PS.isPactShot(bs.character.cantrips[0]) && bs.character.pactShotFree === 1 && !bs.character.pactShotSwap, J(bs.character.cantrips));
check("ps.countUnchanged", PS.countable(bs.character, bs.character.cantrips).length === lim);
const bsPick = Cr.buildSheet({ calling: "pact-seeker", cantrips: [EB, CT] });
check("ps.wizardPickNotAllowed", !bsPick.ok && J(bsPick.draft.cantrips) === J([CT]) && bsPick.errors.some((e) => /Pick 2 cantrips/.test(e)), J({ e: bsPick.errors, c: bsPick.draft.cantrips }));
check("ps.otherCallingsUntouched", (() => { const h = Cr.buildSheet({ calling: "hexslinger" }); return h.ok && !h.character.cantrips.some(PS.isPactShot) && !h.character.pactShotFree; })());
const oldPS = { calling: "pact-seeker", wizardDone: true, cantrips: [EB, CT, "", ""], spells: { 1: [{ name: "Hex (Crossed Hex)" }] } };
check("ps.migrateSwap", PS.migrate(oldPS) === "swap" && oldPS.pactShotSwap === 1 && oldPS.pactShotFree === 1 && J(oldPS.cantrips.filter(Boolean)) === J([EB, CT]) && oldPS.spells[1][0].name === "Hex (Crossed Hex)", J(oldPS));
check("ps.swapPending", PS.swapPending(oldPS, 2) && !PS.swapPending(Object.assign({}, oldPS, { cantrips: [EB, CT, "Mage Hand"] }), 2));
check("ps.migrateOnce", PS.migrate(oldPS) === "" && oldPS.cantrips.filter(PS.isPactShot).length === 1);
const noPS = { calling: "pact-seeker", wizardDone: true, cantrips: [CT, "Mage Hand"] };
check("ps.migrateAdds", PS.migrate(noPS) === "added" && PS.isPactShot(noPS.cantrips[0]) && !noPS.pactShotSwap && PS.countable(noPS, noPS.cantrips).length === 2, J(noPS));
check("ps.notOtherCallings", PS.migrate({ calling: "hexslinger", cantrips: [EB] }) === "");
const qc = { calling: "pact-seeker", level: 3, cantrips: [EB, CT, "Mage Hand", "Poison Spray (Viper Puff)"], spells: { 1: [{ name: "Witch Bolt (Wire Lash)" }, { name: "Charm Person (Kindred Spirit)" }] } };
const qs = PS.quickSpells(qc);
check("card.quickSpells", qs[0].pact && qs[0].name === "Pact Shot" && qs.map((q) => q.value).join("|") === "0:" + EB + "|0:" + CT + "|0:Poison Spray (Viper Puff)|1:Witch Bolt (Wire Lash)", J(qs));
check("card.noBayonetByDefault", !PS.bayonet(qc) && PS.bayonetIndex(qc) === -1 && !PS.setBayonetForm(qc, "stiletto-dagger").ok);
check("card.boonOnlyAt3", !PS.boonOpen({ calling: "pact-seeker", level: 2 }) && PS.boonOpen(qc));
qc.pactBoon = "blade"; qc.melee = [];
const bf = PS.setBayonetForm(qc, "stiletto-dagger");
check("card.bayonetForm", bf.ok && qc.melee.length === 1 && qc.melee[0].pactBlade && qc.melee[0].proficient && qc.melee[0].weapon === "stiletto-dagger" && PS.bayonetIndex(qc) === 0, J(qc.melee));
check("card.bayonetOne", PS.setBayonetForm(qc, "baton-belaying-pin-club").ok && qc.melee.length === 1 && qc.melee[0].weapon === "baton-belaying-pin-club" && !PS.setBayonetForm(qc, "henrietta-repeating-rifle").ok);
check("card.noRulesEdit", !/pactShotFree|pactBoon|pactBlade/.test(read("assets/data/rules.js")));

/* source wiring */
const v2 = read("dm/assets/js/v2.js"), dmcc = read("dm/assets/js/dmcc.js");
check("dm.noFixedHellMaker", !/dm-only\/hell-maker\.webp/.test(v2) && !/hell-maker\.webp/.test(dmcc));
check("dm.ironFromPact", /IA\.nameFor\(c, \{ dm: true \}\)/.test(dmcc) && /IA\.classNameFor/.test(dmcc));
check("wire.sheetPactChange", /path === "character\.subclass"[\s\S]{0,200}syncIron\(C\(\), \{ pactChanged: true \}\)/.test(read("assets/js/app.js")));
check("wire.wizardPact", /id: "wizPact"/.test(read("assets/js/creator.js")) && /syncIron\(c, \{ pactChanged: true \}\)/.test(read("assets/js/creator.js")));
check("rules.untouched", !/ironType|syncIron/.test(read("database.rules.json")));

/* ---------- browser part ---------- */
const ORIGIN = process.env.SSDNS_ORIGIN || "http://127.0.0.1:8765";
const SHOTS = process.env.SSDNS_SHOTS || "";
function portOpen(port, host) { return new Promise((r) => { const s = net.connect({ port, host }, () => { s.end(); r(true); }); s.on("error", () => r(false)); }); }
const u = new URL(ORIGIN);
if (!(await portOpen(Number(u.port), u.hostname))) {
  console.log("Static server is not listening on " + ORIGIN + " (run via ssdns-test-all)");
  process.exit(1);
}
const puppeteer = (await import("/tmp/pup/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js")).default;
const browser = await puppeteer.launch({ executablePath: "/opt/google/chrome/chrome", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
async function shot(pg, sel, file) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await pg.addStyleTag({ content: ".toast{display:none!important}" });
  await sleep(250);
  const el = await pg.$(sel);
  if (el) await el.screenshot({ path: path.join(SHOTS, file) });
}
async function waitImgs(pg) { await pg.evaluate(() => Promise.all([...document.images].filter((i) => !i.complete).map((i) => new Promise((r) => { i.onload = i.onerror = r; setTimeout(r, 3000); })))); }
async function page(url) {
  const ctx = await browser.createBrowserContext();
  const pg = await ctx.newPage();
  const errs = [];
  pg.on("pageerror", (e) => errs.push(String(e)));
  await pg.setViewport({ width: 1300, height: 1000, deviceScaleFactor: 2 });
  await pg.goto(ORIGIN + url, { waitUntil: "domcontentloaded" });
  return { pg, errs, ctx };
}
async function sheet(o) {
  const P = await page("/index.html?nowizard=1&fresh=" + Date.now());
  await P.pg.waitForFunction(() => window.SSDNSApp && window.SSDNSDoll && window.SSDNSIronArt && window.SSDNSKits && document.querySelector("#dollHost"), { timeout: 20000 });
  await sleep(900);
  if (o) await P.pg.evaluate((o) => window.SSDNSApp.applyPatch((d) => {
    const c = d.character; c.name = o.name; c.calling = "pact-seeker"; c.level = 3; c.abilities = Object.assign(c.abilities || {}, { CHA: 16 });
    window.SSDNSKits.apply(c, "pact-seeker", {}); c.kitStamp = "pact-seeker"; c.cantrips = ["Eldritch Blast"]; c.subclass = o.sub; c.ironRevealed = !!o.rev;
    window.SSDNSDoll.syncIron(c, { pactChanged: true });
  }), o);
  await sleep(500);
  await P.pg.evaluate(() => { if (window.SSDNSPlaytest && window.SSDNSPlaytest.syncSheet) window.SSDNSPlaytest.syncSheet(); document.querySelector("#tab-equip").click(); window.SSDNSItems.paintSheet(); });
  await sleep(700); await waitImgs(P.pg);
  return P;
}
const view = (slot) => {
  const s = document.querySelector('#dollHost [data-doll-slot="' + slot + '"]');
  const im = s && s.querySelector(".doll-art");
  const row = [...document.querySelectorAll('#itemList li[data-eq-cat="weapons"]')].find((li) => /Borrowed Iron/.test(li.textContent));
  const ri = row && row.querySelector(".eq-thumb img");
  const card = document.querySelector("#pactFocus");
  const ci = card && card.querySelector("#pactIronArt:not([hidden]) img");
  return {
    slotCls: s ? s.className : "", slotName: s && s.querySelector(".doll-name") ? s.querySelector(".doll-name").textContent : "", slotArt: im ? im.getAttribute("src") : "", slotOk: !!(im && im.naturalWidth > 0), slotNote: s && s.querySelector(".doll-focus-note") ? s.querySelector(".doll-focus-note").textContent : "",
    rowName: row ? row.querySelector(".eq-name b").textContent : "", rowSub: row ? row.querySelector(".eq-sub").textContent : "", rowArt: ri ? ri.getAttribute("src") : "", rowOk: !!(ri && ri.naturalWidth > 0),
    rows: document.querySelectorAll('#itemList li[data-eq-cat="weapons"]').length,
    focusCls: (document.querySelector('#dollHost [data-doll-slot="focus_borrowed_iron"]') || {}).className || "",
    focusName: ((document.querySelector('#dollHost [data-doll-slot="focus_borrowed_iron"] .doll-name') || {}).textContent) || "",
    rowClass: row ? row.getAttribute("data-iron-class") || "" : "", cardClass: card ? card.getAttribute("data-iron-class") || "" : "",
    /* 0.3.101: the row is named after the real iron; count it by its soul-bound "Borrowed Iron" subtitle */
    ironRows: [...document.querySelectorAll("#itemList li")].filter((li) => /^Borrowed Iron · soul-bound|Borrowed Iron/.test((li.querySelector(".eq-sub") || {}).textContent || "") || /Borrowed Iron/.test((li.querySelector(".eq-name b") || {}).textContent || "")).length,
    cardShown: !!card && !card.hidden, cardHead: card ? (card.querySelector("b") || {}).textContent : "", cardArt: ci ? ci.getAttribute("src") : "", cardOk: !!(ci && ci.naturalWidth > 0),
    cardName: (document.querySelector("#pactIronName:not([hidden])") || {}).textContent || "",
    hellAnywhere: [...document.querySelectorAll("img")].some((i) => /hell-maker/.test(i.getAttribute("src") || "")) || /Hell Maker/.test(document.body.innerText)
  };
};
try {
  /* every pact, hidden then revealed, on the player sheet */
  for (const [sub, slug, nm, type, slot] of PACTS) {
    for (const rev of [false, true]) {
      const { pg, errs, ctx } = await sheet({ name: "Pact " + nm, sub, rev });
      const v = await pg.evaluate(view, slot);
      const tag = "ui." + slug + (rev ? ".revealed" : ".hidden");
      check(tag + ".slot", /doll-iron/.test(v.slotCls) && v.slotOk && v.slotArt === (slug === "hell-maker" ? "assets/img/dm-only/hell-maker.webp" : "assets/img/weapons/borrowed-iron/" + slug + ".webp") && v.slotNote.indexOf(nm) >= 0 && v.slotName === nm, J(v));
      check(tag + ".row", v.rowName === L(slug) && v.rowSub.indexOf("Borrowed Iron · soul-bound") === 0 && !/Tool/.test(v.rowSub) && v.rowOk && v.ironRows === 1 &&
        /* 0.3.106 (Jessey 7:47 PM): the Equipment row shows the iron's colour tile */
        new RegExp("items/borrowed-iron/" + slug + "\\.webp").test(v.rowArt), J(v));
      check(tag + ".card", v.cardShown && v.cardHead === L(slug) && v.cardOk &&
        new RegExp(slug === "hell-maker" ? "dm-only/hell-maker\\.webp" : "weapons/borrowed-iron/" + slug + "\\.webp").test(v.cardArt) && v.cardName === "· Borrowed Iron", J(v));
      check(tag + ".focusPatron", /doll-focus-patron/.test(v.focusCls) && v.focusName === IA.pactName({ calling: "pact-seeker", subclass: sub }), J({ c: v.focusCls, n: v.focusName }));
      check(tag + ".noBrackets", !/[()]/.test(v.rowName + v.cardHead) && v.rowName.indexOf(type) < 0 && v.cardHead.indexOf(type) < 0, J({ r: v.rowName, c: v.cardHead }));
      if (slug === "butter-repeater" || slug === "lightslinger") {
        await shot(pg, ".gear-col.gear-weapons", "iron-patron-final-weapons-" + slug + (rev ? "-revealed" : "-hidden") + ".png");
        await shot(pg, "#dollHost .doll", "iron-patron-final-doll-" + slug + (rev ? "-revealed" : "-hidden") + ".png");
      }
      check(tag + ".classShown", v.rowClass === PBY[slug][5] && v.cardClass === PBY[slug][5], J({ row: v.rowClass, card: v.cardClass }));
      check(tag + ".noHellMaker", slug === "hell-maker" ? true : !v.hellAnywhere, J(v));
      if (SHOTS && (slug === "butter-repeater" || slug === "lightslinger")) {
        await pg.evaluate(() => document.querySelector("#pactFocus").scrollIntoView());
        await shot(pg, ".gear-col.gear-weapons", "iron-patron-after-weapons-" + slug + (rev ? "-revealed" : "-hidden") + ".png");
        await shot(pg, "#itemList", "iron-patron-after-equip-rows-" + slug + (rev ? "-revealed" : "-hidden") + ".png");
        await shot(pg, "#dollHost .doll", "iron-patron-after-doll-" + slug + (rev ? "-revealed" : "-hidden") + ".png");
      }
      check(tag + ".noPageErrors", errs.length === 0, errs.join(" | "));
      await ctx.close();
    }
  }
  /* L0201 in the UI: a worn slot (Trinket) and the wrong weapon slot say why, and never offer the iron */
  {
    const { pg, errs, ctx } = await sheet({ name: "Lass", sub: "lass-o-lakes", rev: true });
    await pg.evaluate(() => document.querySelector('#dollHost [data-doll-slot="accessory_1"]').click());
    await sleep(400);
    let m = await pg.evaluate(() => { const p = document.querySelector('.doll-pick[data-doll-pick="accessory_1"]'); return p ? { txt: p.textContent, iron: [...p.querySelectorAll("[data-doll-put]")].some((b) => /Borrowed Iron/.test(b.textContent)) } : null; });
    check("ui.slots.trinketRefuses", !!m && !m.iron && /Butter Repeater — Pact rifle goes in a weapon slot only: Long gun\./.test(m.txt), J(m));
    await shot(pg, "#dollHost", "iron-patron-slot-restriction-trinket.png");
    await pg.evaluate(() => { document.querySelector("[data-doll-close]").click(); });
    await sleep(200);
    await pg.evaluate(() => document.querySelector('#dollHost [data-doll-slot="revolver_2"]').click());
    await sleep(400);
    m = await pg.evaluate(() => { const p = document.querySelector('.doll-pick[data-doll-pick="revolver_2"]'); return p ? { txt: p.textContent, here: !!p.querySelector('[data-doll-ironslot="revolver_2"]') } : null; });
    check("ui.slots.pistolRefusesLongIron", !!m && !m.here && /goes in a weapon slot only: Long gun/.test(m.txt), J(m));
    await shot(pg, "#dollHost", "iron-patron-slot-restriction-pistol.png");
    const r = await pg.evaluate(() => { let res; window.SSDNSApp.applyPatch((d) => { const it = d.character.items.find((x) => x.catalogId === "borrowed-iron"); res = window.SSDNSDoll.equip(d.character, "boots", it.uid); }); return res; });
    check("ui.slots.equipApiRefuses", !r.ok && /weapon slot only/.test(r.reason), J(r));
    check("ui.slots.noPageErrors", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  /* an old save with the Hell Maker on a Lass O' Lakes iron (worn in a trinket slot, doubled) is put right on load */
  {
    const { pg, errs, ctx } = await sheet(null);
    const out = await pg.evaluate(() => {
      const d = JSON.parse(JSON.stringify(window.SSDNSApp.doc()));
      const c = d.character; c.name = "Old Lass"; c.calling = "pact-seeker"; c.level = 3;
      window.SSDNSKits.apply(c, "pact-seeker", {}); c.kitStamp = "pact-seeker"; c.subclass = "lass-o-lakes"; c.ironRevealed = true; c.equipMigrated = 2;
      const it = c.items.find((x) => x.catalogId === "borrowed-iron");
      Object.assign(it, { name: "Hell Maker", art: "assets/img/dm-only/hell-maker.webp", equipSlot: "accessory_2" });
      c.items.push(Object.assign({}, it, { uid: "dupe-iron" }));
      window.SSDNSApp.loadText(JSON.stringify(d), { name: "old-lass.json" });
      const n = window.SSDNSApp.doc().character;
      return n.items.filter((x) => x.catalogId === "borrowed-iron").map((x) => ({ name: x.name, art: x.art || "", slot: x.equipSlot || "" }));
    });
    check("ui.oldSave.fixed", out.length === 1 && out[0].name === "Borrowed Iron" && !out[0].art && !out[0].slot, J(out));
    await sleep(900);
    await pg.evaluate(() => { if (window.SSDNSPlaytest && window.SSDNSPlaytest.syncSheet) window.SSDNSPlaytest.syncSheet(); document.querySelector("#tab-equip").click(); window.SSDNSItems.paintSheet(); });
    await sleep(600); await waitImgs(pg);
    const v = await pg.evaluate(view, "long_gun");
    check("ui.oldSave.butterRepeater", /butter-repeater/.test(v.slotArt) && /butter-repeater/.test(v.cardArt) && !v.hellAnywhere && v.ironRows === 1, J(v));
    check("ui.oldSave.noPageErrors", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  /* the wizard: pick each pact, finish, exactly one iron with the type label in the right slot; then change the Pact on the sheet */
  for (const [sub, slug, nm, type, slot] of PACTS) {
    const { pg, errs, ctx } = await page("/index.html?nowizard=1&fresh=" + Date.now());
    await pg.waitForFunction(() => window.SSDNSApp && window.SSDNSCreator && window.SSDNSDoll && window.SSDNSKits, { timeout: 20000 });
    await sleep(800);
    const w = await pg.evaluate(async (sub) => {
      const W = window.SSDNSCreator; W.open(true);
      const dr = W.draft();
      dr.name = "Wiz";
      const lins = (window.SSDNS_RULES.lineages || []);
      for (const l of lins) { dr.lineage = l.id; dr.sublineage = ((l.sublineages || [])[0] || {}).id || ""; if (!W.errorsFor(dr, "lineage").length) break; }
      dr.settlerLanguage = dr.settlerLanguage || "English"; dr.extraLanguage = dr.extraLanguage || "German";
      const steps = W.stepsFor(dr);
      for (let i = 0; i < 6 && !document.querySelector("#wizCalling"); i++) { document.querySelector("#wizNext").click(); await new Promise((r) => setTimeout(r, 60)); }
      const cs = document.querySelector("#wizCalling");
      if (!cs) return { err: "no calling step", steps };
      cs.value = "pact-seeker"; cs.dispatchEvent(new Event("change", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 80));
      const ps = document.querySelector("#wizPact");
      if (!ps) return { err: "no pact select" };
      const opts = [...ps.options].map((o) => o.value).filter(Boolean);
      ps.value = sub; ps.dispatchEvent(new Event("change", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 80));
      const note = (document.querySelector("#wizPactIron") || {}).textContent || "";
      const d = W.draft();
      let res;
      window.SSDNSApp.applyPatch((doc) => { W.applyDraft(doc.character, d); });
      W.close(false);
      const c = window.SSDNSApp.doc().character;
      const ir = c.items.filter((x) => x && x.catalogId === "borrowed-iron");
      return { opts, note, draftSub: d.subclass, sub: c.subclass, irons: ir.length, slot: window.SSDNSDoll.ironSlot(c), wantSlot: c.ironSlot, label: window.SSDNSIronArt.labelFor(c), name: window.SSDNSIronArt.nameFor(c) };
    }, sub);
    check("wiz." + slug + ".pick", !w.err && w.opts.length === 7 && w.draftSub === sub && w.sub === sub && w.note.indexOf(L(slug)) >= 0 && !/reveal/i.test(w.note), J(w));
    check("wiz." + slug + ".oneIron", w.irons === 1 && w.slot === slot && w.wantSlot === slot && w.label === L(slug) && w.name === nm, J(w));
    if (slug === "butter-repeater" && SHOTS) {
      await pg.evaluate(() => { window.SSDNSCreator.open(true); });
      await sleep(200);
      await pg.evaluate(async () => { const W = window.SSDNSCreator, dr = W.draft(); dr.name = "Lass";
        for (const l of window.SSDNS_RULES.lineages || []) { dr.lineage = l.id; dr.sublineage = ((l.sublineages || [])[0] || {}).id || ""; if (!W.errorsFor(dr, "lineage").length) break; }
      dr.settlerLanguage = dr.settlerLanguage || "English"; dr.extraLanguage = dr.extraLanguage || "German";
        for (let i = 0; i < 6 && !document.querySelector("#wizCalling"); i++) { document.querySelector("#wizNext").click(); await new Promise((r) => setTimeout(r, 60)); }
        const cs = document.querySelector("#wizCalling"); cs.value = "pact-seeker"; cs.dispatchEvent(new Event("change", { bubbles: true })); await new Promise((r) => setTimeout(r, 80));
        const ps = document.querySelector("#wizPact"); ps.value = "lass-o-lakes"; ps.dispatchEvent(new Event("change", { bubbles: true })); });
      await sleep(300);
      await shot(pg, "#wizDialog", "iron-patron-wizard-pact-lass-o-lakes.png");
      await pg.evaluate(() => window.SSDNSCreator.close(true));
    }
    /* change the Pact later on the sheet (the Pact name picker): the iron swaps, still one */
    const other = PACTS[(PACTS.findIndex((p) => p[0] === sub) + 2) % PACTS.length];
    const s2 = await pg.evaluate((to) => {
      const sel = document.querySelector("#selSubclass");
      if (!sel) return { err: "no subclass picker" };
      if (window.SSDNSApp.renderFields) window.SSDNSApp.renderFields();
      sel.value = to; sel.dispatchEvent(new Event("change", { bubbles: true }));
      const c = window.SSDNSApp.doc().character;
      return { sub: c.subclass, irons: c.items.filter((x) => x && x.catalogId === "borrowed-iron").length, slot: window.SSDNSDoll.ironSlot(c), label: window.SSDNSIronArt.labelFor(c) };
    }, other[0]);
    check("wiz." + slug + ".changePact", !s2.err && s2.sub === other[0] && s2.irons === 1 && s2.slot === other[4] && s2.label === L(other[1]), J(s2));
    check("wiz." + slug + ".noPageErrors", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  /* Pact Shot in the wizard's spell step: already known, locked, not a pick */
  {
    const { pg, errs, ctx } = await page("/index.html?nowizard=1&fresh=" + Date.now());
    await pg.waitForFunction(() => window.SSDNSApp && window.SSDNSCreator && window.SSDNSPactShot, { timeout: 20000 });
    await sleep(800);
    const v = await pg.evaluate(async () => {
      const W = window.SSDNSCreator; W.open(true);
      const dr = W.draft(); dr.name = "Lass";
      for (const l of window.SSDNS_RULES.lineages || []) { dr.lineage = l.id; dr.sublineage = ((l.sublineages || [])[0] || {}).id || ""; if (!W.errorsFor(dr, "lineage").length) break; }
      dr.settlerLanguage = dr.settlerLanguage || "English"; dr.extraLanguage = dr.extraLanguage || "German";
      for (let i = 0; i < 6 && !document.querySelector("#wizCalling"); i++) { document.querySelector("#wizNext").click(); await new Promise((r) => setTimeout(r, 60)); }
      const cs = document.querySelector("#wizCalling"); if (!cs) return { err: "no calling" };
      cs.value = "pact-seeker"; cs.dispatchEvent(new Event("change", { bubbles: true })); await new Promise((r) => setTimeout(r, 60));
      const ps = document.querySelector("#wizPact"); ps.value = "lass-o-lakes"; ps.dispatchEvent(new Event("change", { bubbles: true })); await new Promise((r) => setTimeout(r, 60));
      for (const bg of window.SSDNS_RULES.backgrounds || []) { dr.background = bg.id; if (!W.errorsFor(dr, "background").length) break; }
      for (let i = 0; i < 8 && !document.querySelector("#wizPactShot"); i++) {
        const before = (document.querySelector("#wizDialog .wiz-body h2") || {}).textContent;
        document.querySelector("#wizNext").click(); await new Promise((r) => setTimeout(r, 80));
        if ((document.querySelector("#wizDialog .wiz-body h2") || {}).textContent === before && !document.querySelector("#wizPactShot")) {
          return { stuck: before, err: (document.querySelector("#wizError") || {}).textContent, st: W.stepsFor(dr) };
        }
      }
      const lock = document.querySelector("#wizPactShot");
      const pickNames = [...document.querySelectorAll("#wizDialog .spell-card-pick[data-spell]")].map((b) => b.getAttribute("data-spell"));
      const counter = (document.querySelector("#wizDialog .spell-counter") || {}).textContent || "";
      return { lock: !!lock, lockDisabled: !!(lock && lock.querySelector("button").disabled), lockText: lock ? lock.textContent : "", ebPickable: pickNames.some((n) => /eldritch blast|pact shot/i.test(n)), counter, picks: pickNames.length };
    });
    check("wiz.pactShotLocked", v.lock && v.lockDisabled && /Eldritch Blast \(Pact Shot\)/.test(v.lockText) && /Free · always known/.test(v.lockText), J(v));
    check("wiz.pactShotNotAPick", !v.ebPickable && v.picks > 5 && /Cantrips 0\/2/.test(v.counter), J(v));
    for (const rx of ["Chill Touch", "Poison Spray"]) {
      await pg.evaluate((rx) => { const b = [...document.querySelectorAll("#wizDialog .spell-card-pick[data-spell]")].find((x) => new RegExp(rx).test(x.getAttribute("data-spell"))); if (b) b.click(); }, rx);
      await sleep(150);
    }
    const v2 = await pg.evaluate(() => ({ counter: (document.querySelector("#wizDialog .spell-counter") || {}).textContent || "", draft: window.SSDNSCreator.draft().cantrips.slice() }));
    check("wiz.twoPicksPlusFree", /Cantrips 2\/2/.test(v2.counter) && v2.draft.length === 2 && !v2.draft.some((n) => /Pact Shot/.test(n)), J(v2));
    await shot(pg, "#wizDialog", "iron-patron-wizard-cantrips-pact-shot.png");
    check("wiz.spells.noPageErrors", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  /* an existing Pact Seeker who had spent a pick on Pact Shot: the pick is freed and the sheet asks for a replacement */
  {
    const { pg, errs, ctx } = await sheet(null);
    const out = await pg.evaluate(() => {
      const d = JSON.parse(JSON.stringify(window.SSDNSApp.doc()));
      const c = d.character; c.name = "Old Pact"; c.calling = "pact-seeker"; c.level = 1; c.wizardDone = true;
      window.SSDNSKits.apply(c, "pact-seeker", {}); c.kitStamp = "pact-seeker"; c.subclass = "the-sealed-orders";
      c.cantrips = ["Eldritch Blast (Pact Shot)", "Chill Touch (Cold Hand)", "", "", "", "", "", ""];
      c.spells = c.spells || {}; c.spells[1] = [{ name: "Hex (Crossed Hex)", prepared: true }, { name: "Witch Bolt (Wire Lash)", prepared: true }];
      delete c.pactShotFree; delete c.pactShotSwap;
      window.SSDNSApp.loadText(JSON.stringify(d), { name: "old-pact.json" });
      const n = window.SSDNSApp.doc().character;
      return { cantrips: n.cantrips.filter(Boolean), spells: n.spells[1].map((x) => x.name), swap: n.pactShotSwap, free: n.pactShotFree };
    });
    check("swap.flagged", out.swap === 1 && out.free === 1 && J(out.cantrips) === J(["Eldritch Blast (Pact Shot)", "Chill Touch (Cold Hand)"]) && out.spells.filter(Boolean).length === 2, J(out));
    await pg.evaluate(() => { const t = document.querySelector("#tab-hex"); if (t) t.click(); });
    await sleep(600);
    let v = await pg.evaluate(() => ({ limits: (document.querySelector("#spellLimits") || {}).textContent || "", prompt: (document.querySelector("#pactShotSwap:not([hidden])") || {}).textContent || "",
      freeTag: [...document.querySelectorAll(".sp-free-tag")].map((x) => x.textContent), delOnPS: [...document.querySelectorAll('[data-spell-lines="0"] .sp-line')].filter((l) => /Pact Shot/.test(l.textContent) && l.querySelector("[data-spell-del]")).length }));
    check("swap.prompt", /Cantrips 1\/2/.test(v.limits) && /pick you spent on it is open again/.test(v.prompt) && v.freeTag.length === 1 && v.delOnPS === 0, J(v));
    if (SHOTS) {
      await pg.evaluate(() => { const el = document.querySelector("#spellLimits"); if (el) el.scrollIntoView({ block: "start" }); window.scrollBy(0, -40); });
      await sleep(200);
      fs.mkdirSync(SHOTS, { recursive: true });
      await pg.screenshot({ path: path.join(SHOTS, "iron-patron-pact-shot-swap-prompt.png") });
    }
    await pg.evaluate(() => { window.SSDNSApp.applyPatch((d) => { d.character.cantrips[2] = "Mage Hand"; }); if (window.SSDNSApp.renderFields) window.SSDNSApp.renderFields(); });
    await sleep(400);
    v = await pg.evaluate(() => ({ limits: (document.querySelector("#spellLimits") || {}).textContent || "", prompt: !!document.querySelector("#pactShotSwap:not([hidden])"), swap: window.SSDNSApp.doc().character.pactShotSwap }));
    check("swap.cleared", /Cantrips 2\/2/.test(v.limits) && !v.prompt && !v.swap, J(v));
    check("swap.noPageErrors", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  /* Borrowed Iron card: spell buttons (Pact Shot first), no weapon attack; blocked when not in hand; Fixed Bayonet melee */
  {
    const { pg, errs, ctx } = await sheet({ name: "Lass", sub: "lass-o-lakes", rev: true });
    await pg.evaluate(() => window.SSDNSApp.applyPatch((d) => { const c = d.character; c.cantrips = ["Eldritch Blast (Pact Shot)", "Chill Touch (Cold Hand)", "Mage Hand", "", "", "", "", ""]; c.spells[1] = [{ name: "Witch Bolt (Wire Lash)", prepared: true }, { name: "Charm Person (Kindred Spirit)", prepared: true }]; }));
    await pg.evaluate(() => { window.SSDNSPlaytest.syncSheet(); });
    await sleep(500);
    const card = () => { const b = document.querySelector("#pactFocus"); return { btns: [...b.querySelectorAll("button")].map((x) => ({ t: x.textContent.trim(), cast: x.getAttribute("data-spell-cast") || (x.id === "btnPactShot" ? "pact" : ""), melee: x.getAttribute("data-melee-roll"), dis: x.disabled })) }; };
    let v = await pg.evaluate(card);
    const casts = v.btns.filter((b) => b.cast);
    check("card.spellsPactFirst", casts.length === 3 && casts[0].t === "Pact Shot" && /Cold Hand/.test(casts[1].t) && /Wire Lash · L1/.test(casts[2].t), J(v.btns));
    check("card.noWeaponAttack", !v.btns.some((b) => b.melee != null || /^(Roll|Attack|Fire)$/i.test(b.t)), J(v.btns));
    await pg.evaluate(() => document.querySelector("#pactFocus").scrollIntoView());
    await shot(pg, "#pactFocus", "iron-patron-iron-card-spell-buttons.png");
    const logN = () => pg.evaluate(() => [...document.querySelectorAll("#log .log-item, .log-item")].map((x) => x.textContent).filter((t) => /Cold Hand|Chill Touch/.test(t)).length);
    const n0 = await logN();
    await pg.evaluate(() => { const sel = document.querySelector("#pactFocus select.cast-target"); if (sel) { sel.value = "narrative"; sel.dispatchEvent(new Event("change", { bubbles: true })); } document.querySelector('#pactFocus [data-spell-cast^="0:Chill"]').click(); });
    await sleep(900);
    await pg.evaluate(() => { const d = document.querySelector("dialog[open]"); if (d) { const b = [...d.querySelectorAll("button")].find((x) => /narrative|no target|skip|cast/i.test(x.textContent)); if (b) b.click(); } });
    await sleep(700);
    const n1 = await logN();
    check("card.castUsesSheetPath", n1 > n0, n0 + " -> " + n1);
    await pg.evaluate(() => { window.SSDNSApp.applyPatch((d) => { d.character.borrowedIronAway = true; }); window.SSDNSFocus.paintCastBlock(); });
    await sleep(300);
    v = await pg.evaluate(card);
    check("card.blockedNotInHand", v.btns.filter((b) => b.cast).length === 3 && v.btns.filter((b) => b.cast).every((b) => b.dis), J(v.btns));
    await pg.evaluate(() => { window.SSDNSApp.applyPatch((d) => { d.character.borrowedIronAway = false; }); window.SSDNSFocus.paintCastBlock(); });
    await pg.evaluate(() => { const s = document.querySelector("#pactFocus [data-pact-boon]"); s.value = "blade"; s.dispatchEvent(new Event("change", { bubbles: true })); });
    await sleep(300);
    await pg.evaluate(() => { const s = document.querySelector("#pactFocus [data-pact-bayonet]"); s.value = "stiletto-dagger"; s.dispatchEvent(new Event("change", { bubbles: true })); });
    await sleep(400);
    v = await pg.evaluate(card);
    const bay = v.btns.find((b) => b.melee != null);
    check("card.bayonetMelee", !!bay && /Bayonet attack/.test(bay.t) && v.btns.filter((b) => b.cast).length === 3, J(v.btns));
    const mrow = await pg.evaluate(() => { const c = window.SSDNSApp.doc().character; return c.melee.filter((m) => m && m.pactBlade).map((m) => ({ w: m.weapon, p: m.proficient })); });
    check("card.bayonetRow", mrow.length === 1 && mrow[0].w === "stiletto-dagger" && mrow[0].p, J(mrow));
    await shot(pg, "#pactFocus", "iron-patron-iron-card-fixed-bayonet.png");
    const mlog = () => pg.evaluate(() => [...document.querySelectorAll("#log .log-item, .log-item")].map((x) => x.textContent).filter((t) => /Stiletto/.test(t)).length);
    const m0 = await mlog();
    await pg.evaluate(() => document.querySelector("#pactFocus [data-melee-roll]").click());
    await sleep(900);
    await pg.evaluate(() => { const d = document.querySelector("dialog[open]"); if (d) { const b = [...d.querySelectorAll("button")].find((x) => /narrative|no target|skip|roll|attack/i.test(x.textContent)); if (b) b.click(); } });
    await sleep(800);
    check("card.bayonetRolls", (await mlog()) > m0);
    check("card.noPageErrors", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  /* DMCC player card: Lass O' Lakes shows the Butter Repeater and no Hell Maker anywhere on the card */
  for (const [sub, slug, nm, type] of PACTS) {
    const { pg, errs, ctx } = await page("/dm/index.html");
    await pg.setViewport({ width: 1300, height: 1100, deviceScaleFactor: 2 });
    await pg.waitForFunction(() => window.DMCC && window.SSDNSIronArt && document.querySelector("#btnLoadDemo"), { timeout: 20000 });
    await pg.evaluate(() => document.querySelector("#btnLoadDemo").click());
    await pg.waitForFunction(() => window.DMCC.state.demo && Object.keys(window.DMCC.state.players || {}).length, { timeout: 20000 });
    const pid = await pg.evaluate((sub) => { const id = Object.keys(window.DMCC.state.players)[1];
      Object.assign(window.DMCC.state.players[id].snapshot, { name: "Lass", calling: "pact-seeker", callingId: "pact-seeker", subclass: sub, ironRevealed: false }); return id; }, sub);
    await pg.evaluate((id) => document.querySelector('.pcard[data-pid="' + id + '"]').click(), pid);
    await sleep(1000); await waitImgs(pg);
    const v = await pg.evaluate(() => {
      const body = document.querySelector("#detailOverlay");
      const s = document.querySelector(".dm-iron"); const im = s ? [...s.querySelectorAll("img")] : [];
      return { name: s ? s.querySelector("b").textContent : "", type: s && s.querySelector(".dm-iron-type") ? s.querySelector(".dm-iron-type").textContent : "",
        tile: im[0] ? im[0].getAttribute("src") : "", tileOk: !!(im[0] && im[0].naturalWidth), eng: im[1] ? im[1].getAttribute("src") : "", engOk: !!(im[1] && im[1].naturalWidth),
        sub: (document.querySelector("#detailSub") || {}).textContent || "",
        hell: [...body.querySelectorAll("img")].filter((i) => /hell-maker/.test(i.getAttribute("src") || "")).length + (/Hell Maker/.test(body.innerText) ? 1 : 0) };
    });
    const tag = "dm." + slug;
    check(tag + ".section", v.name === nm && v.type === "· " + PBY[slug][6] && v.tile.endsWith("assets/img/items/borrowed-iron/" + slug + ".webp") && v.tileOk && v.engOk, J(v));
    check(tag + ".pactInSubtitle", v.sub.indexOf(IA.pactName({ calling: "pact-seeker", subclass: sub })) >= 0, J(v));
    check(tag + ".hellMakerOnlyForCrossroads", slug === "hell-maker" ? v.hell >= 1 : v.hell === 0, J(v));
    if (SHOTS && slug !== "hell-maker") {
      await shot(pg, ".dm-iron", "iron-patron-after-dmcc-" + slug + ".png");
      if (slug === "butter-repeater" || slug === "lightslinger") await shot(pg, ".dm-iron", "iron-patron-final-dmcc-" + slug + ".png");
      await pg.evaluate(() => { const d = document.querySelector(".dm-only-art"); if (d) d.scrollIntoView(); });
      await shot(pg, ".detail-tools .detail-section", "iron-patron-after-dmcc-give-" + slug + ".png");
    }
    check(tag + ".noPageErrors", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  /* ---------- 0.3.106: tall weapon slots (Jessey 4:07 PM: the long gun "doesn't fit in the paper doll correctly") ---------- */
  const geo = (key) => {
    const s = document.querySelector('#dollHost [data-doll-slot="' + key + '"]');
    const im = s && s.querySelector(".doll-art"), nm = s && s.querySelector(".doll-name");
    if (!s || !im) return { key, cls: s ? s.className : "", none: true };
    const r = s.getBoundingClientRect(), a = im.getBoundingClientRect(), n = nm ? nm.getBoundingClientRect() : null;
    /* the drawn picture inside an object-fit: contain box (pre-rotation), then turned when rotated */
    const bw = im.offsetWidth, bh = im.offsetHeight, ir = im.naturalWidth / im.naturalHeight, br = bw / bh;
    const cw = ir > br ? bw : bh * ir, ch = ir > br ? bw / ir : bh;
    const rot = getComputedStyle(im).transform !== "none";
    const vw = rot ? ch : cw, vh = rot ? cw : ch, cx = a.left + a.width / 2, cy = a.top + a.height / 2;
    const pic = { l: cx - vw / 2, r: cx + vw / 2, t: cy - vh / 2, b: cy + vh / 2 };
    return { key, cls: s.className, src: im.getAttribute("src"), ok: im.naturalWidth > 0, nw: im.naturalWidth, nh: im.naturalHeight, rot,
      slot: { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height },
      inside: pic.l >= r.left - 1 && pic.r <= r.right + 1 && pic.t >= r.top - 1 && pic.b <= r.bottom + 1,
      hFrac: vh / r.height, wFrac: vw / r.width, aboveName: !n || pic.b <= n.top + 2, nameShown: !!nm && nm.offsetHeight > 0 };
  };
  const tallOk = (tag, g, wantLong) => {
    check(tag + ".art", !g.none && g.ok, J(g));
    check(tag + ".inside", !!g.inside, J(g));
    check(tag + ".nameBelow", g.aboveName && g.nameShown, J(g));
    if (wantLong) check(tag + ".longFill", /doll-longart/.test(g.cls) && g.rot && g.nw === 1200 && g.nh === 400 && g.hFrac >= 0.68, J(g));
    else check(tag + ".squareContained", /doll-squareart/.test(g.cls) && !g.rot && g.wFrac <= 0.85, J(g));
  };
  for (const [sub, slug, nm, label] of [["lass-o-lakes", "butter-repeater", "Butter Repeater", "butter-repeater"], ["the-sand-oath", "sirocco-long-rifle", "Sirocco Long-Rifle", "sirocco"]]) {
    for (const rev of [true, false]) {
      const { pg, errs, ctx } = await sheet({ name: "Pact " + nm, sub, rev });
      const g = await pg.evaluate(geo, "long_gun");
      const tag = "tall." + label + (rev ? ".revealed" : ".hidden");
      check(tag + ".src", g.src === "assets/img/weapons/borrowed-iron/" + slug + ".webp", J(g));
      tallOk(tag, g, true);
      await shot(pg, "#dollHost .doll", "iron-patron-v2-doll-" + label + "-" + (rev ? "revealed" : "hidden") + ".png");
      await shot(pg, "#dollHost .doll", "iron-patron-v3-doll-" + label + "-" + (rev ? "revealed" : "hidden") + ".png");
      if (!rev) {
        const w = await pg.evaluate(() => {
          const ci = document.querySelector("#pactIronArt:not([hidden]) img"), box = document.querySelector("#pactIronArt");
          const row = [...document.querySelectorAll('#itemList li[data-eq-cat="weapons"]')].find((li) => /Borrowed Iron/.test(li.textContent));
          const ri = row && row.querySelector(".eq-thumb img");
          return { card: ci ? ci.getAttribute("src") : "", cardOk: !!(ci && ci.naturalWidth === 1200 && ci.naturalHeight === 400), cardCls: box ? box.className : "",
            row: ri ? ri.getAttribute("src") : "", rowOk: !!(ri && ri.naturalWidth > 0), rowWide: !!(ri && ri.closest(".eq-thumb").classList.contains("eq-wide")),
            text: document.body.innerText };
        });
        check(tag + ".cardEngraving", w.card === "assets/img/weapons/borrowed-iron/" + slug + ".webp" && w.cardOk && !/pact-iron-outline|pact-iron-generic/.test(w.cardCls), J({ card: w.card, cls: w.cardCls }));
        check(tag + ".rowTile", w.row === "assets/img/items/borrowed-iron/" + slug + ".webp" && w.rowOk && !w.rowWide, J({ row: w.row }));
        check(tag + ".nameShown", w.text.indexOf(nm) >= 0, nm);
        await shot(pg, ".gear-col.gear-weapons", "iron-patron-v3-weapons-" + label + "-hidden.png");
      }
      check(tag + ".noPageErrors", errs.length === 0, errs.join(" | "));
      await ctx.close();
    }
  }
  /* Lightslinger (a one-handed iron) stays in Pistol R, square tile, unchanged; a catalog rifle + melee weapon share the tall treatment */
  for (const rev of [true, false]) {
    const { pg, errs, ctx } = await sheet({ name: "Pact Lightslinger", sub: "the-sealed-orders", rev });
    const p = await pg.evaluate(() => {
      const s = document.querySelector('#dollHost [data-doll-slot="revolver_2"]'), im = s && s.querySelector(".doll-art");
      return { cls: s ? s.className : "", src: im ? im.getAttribute("src") : "", ok: !!(im && im.naturalWidth > 0), tf: im ? getComputedStyle(im).transform : "" };
    });
    const tag = "tall.lightslinger" + (rev ? ".revealed" : ".hidden");
    check(tag + ".pistolEngraving", /doll-iron/.test(p.cls) && !/doll-longart|doll-squareart/.test(p.cls) && p.ok && p.tf === "none" &&
      /weapons\/borrowed-iron\/lightslinger\.webp$/.test(p.src), J(p));
    await shot(pg, "#dollHost .doll", "iron-patron-v2-doll-lightslinger-" + (rev ? "revealed" : "hidden") + ".png");
    if (!rev) {
      await shot(pg, "#dollHost .doll", "iron-patron-v3-doll-lightslinger-hidden.png");
      const w = await pg.evaluate(() => {
        const ci = document.querySelector("#pactIronArt:not([hidden]) img"), box = document.querySelector("#pactIronArt");
        const row = [...document.querySelectorAll('#itemList li[data-eq-cat="weapons"]')].find((li) => /Borrowed Iron/.test(li.textContent));
        const ri = row && row.querySelector(".eq-thumb img");
        return { card: ci ? ci.getAttribute("src") : "", cardCls: box ? box.className : "", row: ri ? ri.getAttribute("src") : "" };
      });
      check("tall.lightslinger.noReveal.realIron", w.card === "assets/img/weapons/borrowed-iron/lightslinger.webp" && !/pact-iron-generic|pact-iron-outline/.test(w.cardCls) && w.row === "assets/img/items/borrowed-iron/lightslinger.webp" && !OUTLINE.test(p.src), J(w));
    }
    if (rev) {
      const added = await pg.evaluate(() => {
        const A = window.SSDNSWeaponArt, RR = window.SSDNS_RULES || {};
        const find = (list, file) => (list || []).find((w) => /weapons\//.test(A.srcFor(w) || "") && (A.srcFor(w) || "").endsWith(file));
        const rifle = find(RR.firearms, "henrietta-repeating-rifle.webp") || (RR.firearms || []).find((w) => w.group !== "pistol" && /weapons\//.test(A.srcFor(w) || ""));
        const mel = (RR.melee || []).find((w) => /weapons\/[a-z]/.test(A.srcFor(w) || "") && !/dm-only/.test(A.srcFor(w) || ""));
        window.SSDNSApp.applyPatch((d) => { const c = d.character; c.guns = (c.guns || []).filter((g) => g && g.weapon);
          c.guns.push({ weapon: rifle.id, proficient: true, chambers: [], equipped: true });
          c.melee = [{ weapon: mel.id, proficient: true, equipped: true }]; });
        return { rifle: rifle.id, rifleSrc: A.srcFor(rifle), mel: mel.id };
      });
      await sleep(400);
      await pg.evaluate(() => { if (window.SSDNSPlaytest && window.SSDNSPlaytest.syncSheet) window.SSDNSPlaytest.syncSheet(); window.SSDNSItems.paintSheet(); });
      await sleep(600); await waitImgs(pg);
      const g = await pg.evaluate(geo, "long_gun"), m = await pg.evaluate(geo, "melee");
      check("tall.catalogRifle.src", g.src === added.rifleSrc && /weapons\//.test(g.src), J({ g, added }));
      tallOk("tall.catalogRifle", g, true);
      tallOk("tall.melee", m, true);
      const p2 = await pg.evaluate(() => { const im = document.querySelector('#dollHost [data-doll-slot="revolver_2"] .doll-art'); return im ? getComputedStyle(im).transform : "x"; });
      check("tall.pistolStillUpright", p2 === "none", p2);
      /* clicking the (rotated) art still opens the slot picker */
      await pg.evaluate(() => document.querySelector('#dollHost [data-doll-slot="long_gun"] .doll-art').click());
      await sleep(300);
      const pick = await pg.evaluate(() => { const p = document.querySelector("#dollHost .doll-pick"); return p ? p.textContent.slice(0, 200) : ""; });
      check("tall.clickOpensPicker", /Long gun/i.test(pick), pick);
      await shot(pg, "#dollHost .doll", "iron-patron-v2-doll-a-catalog-rifle-" + added.rifle + ".png");
    }
    check(tag + ".noPageErrors", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  /* mobile (390 px phone) */
  {
    const P = await page("/index.html?nowizard=1&fresh=" + Date.now());
    await P.pg.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    await P.pg.waitForFunction(() => window.SSDNSApp && window.SSDNSDoll && window.SSDNSKits && document.querySelector("#dollHost"), { timeout: 20000 });
    await sleep(900);
    await P.pg.evaluate(() => window.SSDNSApp.applyPatch((d) => { const c = d.character; c.name = "Pact Lass"; c.calling = "pact-seeker"; c.level = 3; c.abilities = Object.assign(c.abilities || {}, { CHA: 16 });
      window.SSDNSKits.apply(c, "pact-seeker", {}); c.kitStamp = "pact-seeker"; c.cantrips = ["Eldritch Blast"]; c.subclass = "lass-o-lakes"; c.ironRevealed = true; window.SSDNSDoll.syncIron(c, { pactChanged: true }); }));
    await sleep(500);
    await P.pg.evaluate(() => { if (window.SSDNSPlaytest && window.SSDNSPlaytest.syncSheet) window.SSDNSPlaytest.syncSheet(); document.querySelector("#tab-equip").click(); window.SSDNSItems.paintSheet(); });
    await sleep(700); await waitImgs(P.pg);
    const g = await P.pg.evaluate(geo, "long_gun");
    tallOk("tall.mobile.butterRepeater", g, true);
    await P.pg.evaluate(() => document.querySelector("#dollHost .doll").scrollIntoView());
    await shot(P.pg, "#dollHost .doll", "iron-patron-v2-doll-butter-repeater-revealed-mobile.png");
    check("tall.mobile.noPageErrors", P.errs.length === 0, P.errs.join(" | "));
    await P.ctx.close();
  }

} finally {
  await browser.close();
}
console.log(failures.length ? "\n" + failures.length + " FAILED" : "\nall iron-patron checks passed");
process.exit(failures.length ? 1 : 0);

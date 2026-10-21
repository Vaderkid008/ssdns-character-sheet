/**
 * L0197 (Jessey 2026-10-20 7:10 PM CT, sheet 0.3.100): the Focus slot by Calling.
 *  Pact Seeker: the Borrowed Iron is a real soul-bound catalog item (borrowed-iron, gear, shelf Foci, 0 lb, never sold) that kits
 *    add, always shown in the paper-doll Focus slot (not only when it's in c.guns). No drop / sell / trade / Give / loot.
 *    Lost or disarmed -> the slot shows it returning at the start of the owner's next turn, and Pact casting is blocked until then.
 *  Hexslinger: no separate focus item; the Focus slot mirrors the Caster Gun equipped in Pistol L or R (name + art, read-only,
 *    no extra weight). None equipped -> "No Caster Gun equipped, can't cast." and the cast buttons are blocked (data kept).
 *  Migration: the exact "Borrowed Iron (pact focus)" line PR #113 left in Notes becomes the item; other notes stay.
 *   node tools/test-focus-slot.mjs           (browser part needs ssdns-test-all's static server on 127.0.0.1:8765)
 *   SSDNS_SHOTS=/workspace/specs node tools/test-focus-slot.mjs   also saves focus-*.png screenshots
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

/* ---------- node part ---------- */
const sb = { console }; sb.window = sb; sb.globalThis = sb;
sb.document = { readyState: "complete", getElementById: () => null, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] };
vm.createContext(sb);
for (const f of ["assets/data/rules.js", "assets/data/item-catalog.js", "assets/data/item-catalog-gear.js", "assets/js/item-ui.js", "assets/js/items.js",
  "assets/js/kits.js", "assets/js/equip.js", "assets/js/weapon-art.js", "assets/js/iron-art.js", "assets/js/paper-doll.js", "assets/js/focus-slot.js", "assets/js/give.js", "assets/js/grab.js"]) {
  vm.runInContext(read(f), sb, { filename: f });
}
const I = sb.SSDNSItems, K = sb.SSDNSKits, D = sb.SSDNSDoll, F = sb.SSDNSFocus, G = sb.SSDNSGive, GR = sb.SSDNSGrab;
const NO_CASTER = "No Caster Gun equipped, can't cast.";
const clone = (x) => JSON.parse(JSON.stringify(x));
const focusCell = (html) => { const m = /<div class="doll-cell"[^>]*>(?:(?!<div class="doll-cell").)*data-doll-slot="focus_borrowed_iron"(?:(?!<div class="doll-cell").)*/s.exec(html); return m ? m[0] : ""; };

/* 1. the catalog row (item-template.md fields) */
const raw = (sb.SSDNS_ITEM_CATALOG || []).find((r) => r.id === "borrowed-iron");
check("catalog.row", !!raw && raw.type === "gear" && raw.shelf === "Foci" && raw.category === "focus" && raw.forSale === false && raw.price == null && raw.weight === 0 && raw.soulBound === true, J(raw));
check("catalog.noWeaponStats", !!raw && !raw.weapon && !raw.weaponId && !raw.slot && !raw.damage);
check("catalog.art", !!raw && fs.existsSync(path.join(root, raw.art)), raw && raw.art);
const row = I.byId("borrowed-iron");
check("catalog.normalized", !!row && row.forSale === false && row.price == null && row.soulBound === true && row.weight === 0, J(row));
check("catalog.notForSaleNoStoreRow", !JSON.parse(read("dm/assets/data/store-items.json")).some((r) => r.id === "borrowed-iron"));
check("catalog.hiddenFromPlayerAdd", !I.catalog({}).some((r) => r.id === "borrowed-iron") && I.catalog({ dm: true }).some((r) => r.id === "borrowed-iron"));
/* 0.3.96: catalog row keeps shelf Foci; the Equipment list files it under Weapons (the patron is the focus now) */
check("catalog.equipmentWeapons", I.eqCat ? I.eqCat(I.instanceFrom(row)) === "weapons" : true, I.eqCat && I.eqCat(I.instanceFrom(row)));

/* 2. kits add the item (full and module starts), once */
const pact = () => { const c = K.apply(K.blankCharacter(), "pact-seeker", {}); c.calling = "pact-seeker"; return c; };
const ps = pact();
const bi = (c) => (c.items || []).filter((x) => x.catalogId === "borrowed-iron");
check("kit.addsItem", bi(ps).length === 1 && bi(ps)[0].count === 1 && bi(ps)[0].soulBound === true, J(ps.items));
check("kit.noNoteLine", !/Borrowed Iron/.test(ps.equipment || ""), ps.equipment);
check("kit.pactFocusKept", ps.pactFocus === "borrowed-iron" && ps.casterGun === "borrowed-iron");
check("kit.notInGuns", !(ps.guns || []).some((g) => g && g.weapon === "borrowed-iron"));
K.apply(ps, "pact-seeker", {});
check("kit.againNoDouble", bi(ps).length === 1 && bi(ps)[0].count === 1);
const mod = K.apply(K.blankCharacter(), "pact-seeker", { _start: "module" });
check("kit.moduleAddsItem", bi(mod).length === 1, J(mod.items));
K.callings.filter((x) => x !== "pact-seeker").forEach((cal) => check("kit.othersNoIron." + cal, bi(K.apply(K.blankCharacter(), cal, {})).length === 0));

/* 3. 0.3.100 (Jessey 2026-10-20 9:53 PM): the Focus slot always shows the patron; the Borrowed Iron rides in a weapon slot */
const ironCell = (html, key) => { const m = new RegExp('<div class="doll-cell"[^>]*>(?:(?!<div class="doll-cell").)*data-doll-slot="' + key + '"(?:(?!<div class="doll-cell").)*', "s").exec(html); return m ? m[0] : ""; };
const fsP = D.focusState(ps);
check("pact.slotState", fsP && fsP.kind === "patron" && fsP.locked === true && fsP.name === "Patron" && /items\/default\/focus\.webp$/.test(fsP.art), J(fsP));
const psNamed = clone(ps); psNamed.subclass = "the-crossroads-note";
const fsPN = D.focusState(psNamed);
check("pact.patronNamed", fsPN.name === "The Crossroads Note" && /items\/patron\/crossroads-note\.webp$/.test(fsPN.art) && /items\/default\/focus\.webp$/.test(fsPN.fallback), J(fsPN));
check("pact.weaponName", D.weaponName(psNamed, "focus_borrowed_iron") === "The Crossroads Note" && D.ironSlot(ps) === "revolver_2" && D.weaponName(ps, "revolver_2") === "Borrowed Iron");
const cellP = ironCell(D.html(ps, {}), "revolver_2");
check("pact.slotHtml", /filled/.test(cellP) && /doll-iron/.test(cellP) && /doll-name">Borrowed Iron</.test(cellP) && /borrowed-iron\.webp/.test(cellP) && /In hand/.test(cellP), cellP.slice(0, 400));
check("pact.focusHtmlPatron", /doll-focus-patron/.test(focusCell(D.html(psNamed, {}))) && /data-fallback="[^"]*focus\.webp"/.test(focusCell(D.html(psNamed, {}))));
const noItem = clone(ps); noItem.items = noItem.items.filter((x) => x.catalogId !== "borrowed-iron");
check("pact.slotWithoutItemOrGuns", D.ironSlot(noItem) === "" && D.weaponName(noItem, "revolver_2") === "" && D.focusState(noItem).kind === "patron");
check("pact.pickerReadOnly", /your patron/.test(D.pickerHtml(ps, "focus_borrowed_iron")) && /can(&#39;|')t be unequipped/.test(D.pickerHtml(ps, "focus_borrowed_iron")) && !/data-doll-iron=/.test(D.pickerHtml(ps, "focus_borrowed_iron")));
check("pact.ironPicker", /Borrowed Iron · in hand/.test(D.pickerHtml(ps, "revolver_2")) && /data-doll-iron="away"/.test(D.pickerHtml(ps, "revolver_2")) && /data-doll-ironslot="long_gun"/.test(D.pickerHtml(ps, "revolver_2")));
const moved = clone(ps); check("pact.moveIron", D.setIronSlot(moved, "long_gun").ok && D.ironSlot(moved) === "long_gun" && D.weaponName(moved, "revolver_2") === "");
/* a gun taking the iron's slot pushes the iron to the next free slot (display only) */
const gunIn = clone(ps); gunIn.ironSlot = "revolver_2"; gunIn.guns = [{ weapon: "dullards-plinker-revolver", proficient: true, chambers: [], equipped: true }, { weapon: "navy-army-ball-n-cap-revolver", proficient: true, chambers: [], equipped: true }];
check("pact.ironYieldsToGuns", D.weaponName(gunIn, "revolver_1") !== "Borrowed Iron" && D.weaponName(gunIn, "revolver_2") !== "Borrowed Iron" && D.ironSlot(gunIn) === "long_gun", D.ironSlot(gunIn));
const full = clone(gunIn); full.guns.push({ weapon: "dullards-tube-rifle", proficient: true, chambers: [], equipped: true }); full.melee = [{ weapon: "bowie-shortsword", equipped: true }];
check("pact.noFreeSlot", D.ironSlot(full) === "" && D.pickerHtml(full, "focus_borrowed_iron").indexOf("No free weapon slot") >= 0 && F.castBlock(full) === "", D.ironSlot(full));
check("pact.revealedLongIron", D.ironSlot(Object.assign(clone(ps), { subclass: "lass-o-lakes", ironRevealed: true })) === "long_gun");
check("pact.setWeaponRefused", D.setWeapon(ps, "focus_borrowed_iron", 0).ok === false);
check("pact.castOk", F.castBlock(ps) === "");

/* 4. soul-bound: no drop, sell, trade, Give or loot */
const it = bi(ps)[0];
check("soul.helper", I.soulBound(it) === true && I.soulBound({ catalogId: "badge-saint-medal-carved-eldorite-hymn-book-holy-symbol" }) === false);
check("soul.noDropPlayer", I.canDrop(it, { dm: false }) === false);
check("soul.noDropDm", I.canDrop(it, { dm: true, allow: true }) === false);
const dropRes = I.drop(ps, it.uid, {});
check("soul.dropRefused", dropRes.ok === false && /soul-bound/.test(dropRes.reason) && bi(ps).length === 1 && bi(ps)[0].count === 1, J(dropRes));
check("soul.noRob", I.canRob(it, {}) === false && I.canRob(it, { override: true, dmAllow: true }) === false);
check("soul.notForSale", it.forSale === false && it.price == null);
const offer = G.canOffer(ps, { kind: "item", uid: it.uid, qty: 1 });
check("soul.noGiveOffer", offer.ok === false && /soul-bound/.test(offer.reason), J(offer));
const players = { a: { snapshot: { name: "Pact", items: [clone(it)] } }, b: { snapshot: { name: "Pal", items: [] } } };
check("soul.noTradeBroker", /soul-bound/.test(G.validate({ from: "a", targetId: "b", give: "item", uid: it.uid, qty: 1 }, players) || ""));
const grab = GR.plan({ mode: "rob", take: "item", actor: { name: "Outlaw" }, target: { name: "Pact" }, item: it, success: true, override: true });
check("soul.noLoot", grab.blocked === true && (grab.commands || []).length === 0 && /soul-bound/.test(grab.chat), J(grab));
check("soul.tag", (I.tags ? I.tags(it) : []).indexOf("soul-bound") >= 0 || /soul-bound/.test(read("assets/js/items.js")));
check("soul.giveSheetNoButton", /item\.soulBound \|\| item\.catalogId === "borrowed-iron"\) return ""/.test(read("assets/js/give-sheet.js")));
check("soul.dmccRobToast", /Items\.soulBound && Items\.soulBound\(picked\.item\)/.test(read("dm/assets/js/v2.js")));
check("noStats.pactShotNoteKept", /Borrowed Iron has no weapon stats\. Use Pact Shot\./.test(read("assets/js/sheet-extras.js")));

/* 5. lost / disarmed: the slot shows it returning; casting blocked; back at the start of the next turn */
const away = F.markAway(ps, { combat: true, turn: "turn:2:pc1" });
const irA = D.ironState(ps);
check("return.away", away.ok && away.away && !!ps.borrowedIronAway && irA.away === true && D.focusState(ps).ironAway === true, J(away));
check("return.note", /returns at the start of your next turn/i.test(irA.note), irA.note);
const cellA = ironCell(D.html(ps, {}), "revolver_2");
check("return.slotHtml", /doll-away/.test(cellA) && /returns at the start of your next turn/i.test(cellA) && /Borrowed Iron/.test(cellA), cellA.slice(0, 400));
check("return.pickerBack", /data-doll-iron="back"/.test(D.pickerHtml(ps, "revolver_2")));
check("cast.pactBlocked", F.castBlock(ps) === F.NO_IRON && /Borrowed Iron isn't in your hand/.test(F.NO_IRON));
check("return.sameTurnStays", F.turnStart(ps, "turn:2:pc1") === false && !!ps.borrowedIronAway);
check("return.nextTurnBack", F.turnStart(ps, "turn:3:pc1") === true && !ps.borrowedIronAway && F.castBlock(ps) === "");
const ooc = F.markAway(ps, { combat: false });
check("return.outOfCombatHeartbeat", ooc.ok && ooc.away === false && !ps.borrowedIronAway && /heartbeat/.test(ooc.text));
check("return.itemNeverLost", bi(ps).length === 1);

/* 6. Hexslinger: the Focus slot mirrors the Caster Gun in Pistol L or R, read-only, no extra weight */
const hex = () => { const c = K.apply(K.blankCharacter(), "hexslinger", {}); c.calling = "hexslinger"; return c; };
const hx = hex();
check("hex.noFocusItem", !(hx.items || []).some((x) => x.shelf === "Foci" || x.catalogId === "borrowed-iron"), J((hx.items || []).map((x) => x.catalogId)));
const fsL = D.focusState(hx);
check("hex.mirrorL", fsL && fsL.kind === "caster" && fsL.name === "Blacksnake" && fsL.side === "Pistol L" && /blacksnake\.webp$/.test(fsL.art), J(fsL));
const cellL = focusCell(D.html(hx, {}));
check("hex.slotHtmlL", /doll-focus-caster/.test(cellL) && /Blacksnake/.test(cellL) && /blacksnake\.webp/.test(cellL) && /Mirrors Pistol L/.test(cellL), cellL.slice(0, 400));
check("hex.pickerReadOnly", /mirrors Pistol L/.test(D.pickerHtml(hx, "focus_borrowed_iron")) && !/data-doll-weapon=/.test(D.pickerHtml(hx, "focus_borrowed_iron")));
check("hex.castOk", F.castBlock(hx) === "" && F.castGunIndex(hx) === 0);
/* Hognose in Pistol R, a plain pistol in Pistol L */
const hr = hex();
hr.guns[0].weapon = "hognose"; hr.guns[0].equipped = true;
hr.guns[1] = { weapon: "dullards-plinker-revolver", proficient: true, chambers: [], equipped: true };
hr.dollWeapons = { revolver_1: 1, revolver_2: 0 };
const fsR = D.focusState(hr);
check("hex.mirrorR", fsR && fsR.kind === "caster" && fsR.name === "Hognose" && fsR.side === "Pistol R" && fsR.gunIndex === 0 && /hognose\.webp$/.test(fsR.art), J(fsR));
check("hex.castGunR", F.castGunIndex(hr) === 0 && F.castBlock(hr) === "");
/* weight: the mirror adds nothing (same carried weight as the same sheet with the mirror off), and the doll changes no data */
const before = J(hx);
D.html(hx, {}); D.pickerHtml(hx, "focus_borrowed_iron"); F.castBlock(hx);
check("hex.mirrorNoMutation", J(hx) === before);
const w1 = I.weightReport(hx).carried;
const off = clone(hx); off.calling = "gunslinger";
const w2 = I.weightReport(off).carried;
check("hex.noExtraWeight", w1 === w2 && w1 > 0, w1 + " vs " + w2);
const packed = clone(hx); packed.guns[0].equipped = false;
check("hex.weightSameUnequipped", I.weightReport(packed).carried === w1);
/* no Caster Gun equipped -> the message, the cast block, and nothing wiped */
const ng = clone(hx); ng.guns[0].equipped = false;
const ngBefore = J(ng);
const fsN = D.focusState(ng);
check("hex.noGunState", fsN && fsN.kind === "nocaster" && fsN.note === NO_CASTER && D.weaponName(ng, "focus_borrowed_iron") === "", J(fsN));
const cellN = focusCell(D.html(ng, {}));
check("hex.noGunHtml", /doll-focus-nocaster/.test(cellN) && cellN.indexOf("No Caster Gun equipped, can&#39;t cast.") >= 0, cellN.slice(0, 400));
check("cast.hexBlocked", F.castBlock(ng) === NO_CASTER && F.castGunIndex(ng) === -1);
check("hex.noGunKeepsData", J(ng) === ngBefore && ng.guns[0].weapon === "blacksnake");
const plink = hex(); plink.guns[0].weapon = "dullards-plinker-revolver"; plink.casterGun = "ordinary-firearm";
check("cast.hexOrdinaryGunBlocked", F.castBlock(plink).indexOf(NO_CASTER) === 0);

/* 6b. L0198 (Jessey 2026-10-20 7:48 PM, amends L0156; BOOK1 L4504): no Plinker kit swap for the Hexslinger */
const hexOpts = (K.openChoices("hexslinger", {}) || []).flatMap((ch) => ch.options.map((o) => o.id));
check("swap.hexHidden", hexOpts.indexOf("plinker") < 0 && hexOpts.indexOf("repeater") < 0 && hexOpts.indexOf("blacksnake") >= 0, J(hexOpts));
check("swap.hexNoBranch", K.branches("hexslinger").every((p) => p.gun !== "plinker" && p.gun !== "repeater"), J(K.branches("hexslinger")));
["plinker", "repeater"].forEach((g) => {
  const c = K.apply(K.blankCharacter(), "hexslinger", { gun: g });
  const gl = (c.guns || []).map((x) => x.weapon).filter(Boolean);
  check("swap.hexBlocked." + g, J(gl) === J(["blacksnake"]) && c.casterGun === "blacksnake", J(gl));
});
["gunslinger", "lawman", "frontier-scout", "gambler", "storyteller", "frontier-preacher", "scholar"].forEach((cal) => {
  const opts = (K.openChoices(cal, {}) || []).flatMap((ch) => ch.options.map((o) => o.id));
  check("swap.othersKeep." + cal, opts.indexOf("plinker") >= 0 && opts.indexOf("repeater") >= 0, J(opts));
});
const oldSwap = { calling: "hexslinger", kitStamp: "hexslinger", casterGun: "", equipMigrated: 1, equipment: "• Gun belt notes",
  guns: [{ weapon: "dullards-plinker-revolver", proficient: true, chambers: ["", ""], equipped: true, dirty: true, chamber: "light|.22 LR" }, { weapon: "" }],
  ammo: [{ type: "cartridge", caliber: "Light", count: 20 }], items: [] };
const oldBefore = J(oldSwap);
check("swap.saveDetected", F.hexPlinkerSwap(oldSwap) === true && F.hexPlinkerSwap(hx) === false && F.hexPlinkerSwap(ps) === false);
check("swap.saveCastNote", F.castBlock(oldSwap) === NO_CASTER + " " + F.SWAP_NOTE && /isn't allowed for the Hexslinger/.test(F.SWAP_NOTE) && /can't cast/.test(F.SWAP_NOTE), F.castBlock(oldSwap));
D.html(oldSwap, {});
check("swap.savePickerNote", D.pickerHtml(oldSwap, "focus_borrowed_iron").indexOf("isn&#39;t allowed for the Hexslinger") >= 0);
K.migrateEquipment(oldSwap);
check("swap.saveDataUntouched", J(Object.assign({}, oldSwap, { equipMigrated: 1 })) === oldBefore, J(oldSwap));
const swapPlusCaster = clone(oldSwap); swapPlusCaster.guns[1] = { weapon: "hognose", equipped: false };
check("swap.ownsCasterNoSwapNote", F.hexPlinkerSwap(swapPlusCaster) === false && F.castBlock(swapPlusCaster) === NO_CASTER);
/* other Callings keep their focus */
const st = K.apply(K.blankCharacter(), "storyteller", {}); st.calling = "storyteller";
check("others.storytellerInstrument", D.focusState(st) === null && D.weaponName(st, "focus_borrowed_iron") !== "" && F.castBlock(st) === "");
const pr = K.apply(K.blankCharacter(), "frontier-preacher", {}); pr.calling = "frontier-preacher";
check("others.preacherNoBlock", D.focusState(pr) === null && F.castBlock(pr) === "");

/* 7. cast paths gated in sheet-extras (picker, through-gun, named / Pact Shot, prompt) */
const sx = read("assets/js/sheet-extras.js");
["function castSpellAttack(i, spellName, slot, fromChamber) {\n    if (focusBlocked()) return;", "function castThroughGun(i) {\n    if (focusBlocked()) return;", "function openCastPrompt(level, onPick) {\n    if (focusBlocked()) return;"].forEach((s, n) => check("cast.gate." + n, sx.indexOf(s) >= 0));
check("cast.gate.picked", /function castPicked\(i, sp\) \{[\s\S]{0,80}if \(focusBlocked\(\)\) return;/.test(sx));
check("cast.hexThroughCasterGun", /castGunIndex\(c\)/.test(sx));
check("turn.hook", /SSDNSFocus\.onTurn\(sig, !!mine, true\)/.test(read("assets/js/sheet-playtest.js")));

/* 8. migration */
const v1Notes = "• Borrowed Iron (pact focus)\nMy lucky coin\n• Keepsake (focus)\n• Holy symbol (focus)\n• From Book trunk: book of lore";
const v1 = { calling: "pact-seeker", items: [], equipment: v1Notes, equipMigrated: 1, equipmentBefore0392: "older" };
const movedV1 = K.migrateEquipment(v1);
check("migrate.v1.converted", movedV1 === 1 && bi(v1).length === 1, movedV1 + " " + J(v1.items));
check("migrate.v1.lineGone", !/Borrowed Iron/.test(v1.equipment), v1.equipment);
check("migrate.v1.otherNotesKept", v1.equipment === "My lucky coin\n• Keepsake (focus)\n• Holy symbol (focus)\n• From Book trunk: book of lore", v1.equipment);
check("migrate.v1.backup", v1.equipmentBefore0394 === v1Notes && v1.equipmentBefore0392 === "older");
check("migrate.v1.stamp", v1.equipMigrated === 2);
const once = J(v1);
check("migrate.once", K.migrateEquipment(v1) === 0 && J(v1) === once);
const exact = { calling: "pact-seeker", items: [], equipment: "• Borrowed Iron (pact focus), my patron's gift\nBorrowed Iron notes: shaped like a shotgun", equipMigrated: 1 };
K.migrateEquipment(exact);
check("migrate.exactLineOnly", exact.equipment === "• Borrowed Iron (pact focus), my patron's gift\nBorrowed Iron notes: shaped like a shotgun" && bi(exact).length === 1, exact.equipment);
const v0 = { calling: "pact-seeker", items: [], equipment: "• Borrowed Iron (pact focus)\n• Prism (focus)\nNotes" };
check("migrate.v0.all", K.migrateEquipment(v0) === 2 && bi(v0).length === 1 && v0.equipment === "Notes" && v0.equipmentBefore0392 === "• Borrowed Iron (pact focus)\n• Prism (focus)\nNotes", v0.equipment);
const hadItem = { calling: "pact-seeker", items: [I.instanceFrom(I.byId("borrowed-iron"))], equipment: "• Borrowed Iron (pact focus)", equipMigrated: 1 };
K.migrateEquipment(hadItem);
check("migrate.noDoubleItem", bi(hadItem).length === 1 && hadItem.equipment === "", J(hadItem.equipment));
const bare = { calling: "pact-seeker", items: [], equipment: "Just notes", equipMigrated: 1 };
check("migrate.pactWithoutLineGetsItem", K.migrateEquipment(bare) === 0 && bi(bare).length === 1 && bare.equipment === "Just notes" && bare.equipmentBefore0394 == null);
const other = { calling: "gunslinger", items: [], equipment: "• Borrowed Iron (pact focus)\nx", equipMigrated: 1 };
K.migrateEquipment(other);
check("migrate.hexNoChangeExceptLine", (other.items || []).length === 1 && other.equipment === "x", J(other));
const hexSave = { calling: "hexslinger", items: [], guns: [{ weapon: "blacksnake", equipped: false, chambers: ["k:hex:1:", ""] }], equipment: "Gun notes", equipMigrated: 1, hexLead: { 1: 2 } };
const hexBefore = J(hexSave);
K.migrateEquipment(hexSave);
check("migrate.hexSaveUntouched", J(Object.assign({}, hexSave, { equipMigrated: 1 })) === hexBefore, J(hexSave));

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
  await sleep(150);
  const el = await pg.$(sel);
  if (el) await el.screenshot({ path: path.join(SHOTS, file) });
}
async function open(setup) {
  const ctx = await browser.createBrowserContext(); /* own storage: no sheet carried over from the other page */
  const pg = await ctx.newPage();
  const errs = [];
  pg.on("pageerror", (e) => errs.push(String(e)));
  await pg.setViewport({ width: 1300, height: 1000, deviceScaleFactor: 2 });
  await pg.goto(ORIGIN + "/index.html?fresh=" + Date.now(), { waitUntil: "domcontentloaded" });
  await pg.waitForFunction(() => window.SSDNSApp && window.SSDNSDoll && window.SSDNSFocus && window.SSDNSKits && document.querySelector("#dollHost"), { timeout: 20000 });
  await sleep(900);
  await pg.evaluate(setup);
  await sleep(500);
  await pg.evaluate(() => { if (window.SSDNSPlaytest && window.SSDNSPlaytest.syncSheet) window.SSDNSPlaytest.syncSheet(); document.querySelector("#tab-equip").click(); });
  await sleep(500);
  return { pg, errs };
}
const focusInfo = (key) => {
  const s = document.querySelector('#dollHost [data-doll-slot="' + (key || "focus_borrowed_iron") + '"]');
  const btn = (sel) => { const b = document.querySelector(sel); return b ? { disabled: !!b.disabled, title: b.title || "" } : null; };
  return {
    cls: s ? s.className : "", name: s && s.querySelector(".doll-name") ? s.querySelector(".doll-name").textContent : "",
    note: s && s.querySelector(".doll-focus-note") ? s.querySelector(".doll-focus-note").textContent : "",
    art: s && s.querySelector(".doll-art") ? s.querySelector(".doll-art").getAttribute("src") : "",
    artOk: !!(s && s.querySelector(".doll-art") && s.querySelector(".doll-art").naturalWidth > 0),
    hexBtn: btn("#btnHexRoll"), pact: btn("#btnPactShot"), cast0: btn('[data-cast="0"]'),
    castNote: document.getElementById("focusCastNote") ? document.getElementById("focusCastNote").textContent : "",
    pactNote: document.getElementById("pactFocusNote") ? document.getElementById("pactFocusNote").textContent : ""
  };
};
try {
  /* Pact Seeker */
  {
    const { pg, errs } = await open(() => window.SSDNSApp.applyPatch((d) => {
      const c = d.character; c.name = "Ash"; c.calling = "pact-seeker"; c.level = 3; c.abilities = Object.assign(c.abilities || {}, { CHA: 16 });
      window.SSDNSKits.apply(c, "pact-seeker", {}); c.kitStamp = "pact-seeker"; c.cantrips = ["Eldritch Blast"];
    }));
    let f = await pg.evaluate(focusInfo);
    const fp = f; f = await pg.evaluate(focusInfo, "revolver_2");
    check("ui.pact.focusPatron", /doll-focus-patron/.test(fp.cls) && /focus\.webp/.test(fp.art) && fp.artOk, J(fp));
    check("ui.pact.slot", /filled/.test(f.cls) && /doll-iron/.test(f.cls) && f.name === "Borrowed Iron" && /borrowed-iron\.webp/.test(f.art) && f.artOk && /In hand/.test(f.note), J(f));
    check("ui.pact.castOpen", f.pact && !f.pact.disabled && f.hexBtn && !f.hexBtn.disabled, J(f));
    const row = await pg.evaluate(() => {
      const c = window.SSDNSApp.doc().character, it = c.items.find((x) => x.catalogId === "borrowed-iron");
      const el = it && document.querySelector('[data-item-uid="' + it.uid + '"], [data-uid="' + it.uid + '"]');
      const html = document.body.innerHTML;
      return { has: !!it, weight: it && it.weight, drop: html.indexOf('data-item-drop="' + (it && it.uid) + '"') >= 0, give: html.indexOf('data-give-item="' + (it && it.uid) + '"') >= 0, row: !!el };
    });
    check("ui.pact.itemRowNoDropNoGive", row.has && row.weight === 0 && !row.drop && !row.give, J(row));
    await shot(pg, "#dollHost .doll", "focus-pact-seeker-doll.png");
    /* in combat: Lost / disarmed from the Borrowed Iron's weapon-slot picker */
    await pg.evaluate(() => { window.SSDNSEquip.setCombat(true); document.querySelector('#dollHost [data-doll-slot="revolver_2"]').click(); });
    await sleep(300);
    await pg.evaluate(() => { const b = document.querySelector('#dollHost [data-doll-iron="away"]'); if (b) b.click(); });
    await sleep(600);
    f = await pg.evaluate(focusInfo, "revolver_2");
    const awayState = await pg.evaluate(() => !!window.SSDNSApp.doc().character.borrowedIronAway);
    check("ui.pact.awayMarked", awayState && /doll-away/.test(f.cls) && /returns at the start of your next turn/i.test(f.note), J(f));
    check("ui.pact.castBlocked", f.pact && f.pact.disabled && /Borrowed Iron isn't in your hand/.test(f.pact.title) && f.hexBtn.disabled && /isn't in your hand/.test(f.pactNote), J(f));
    const logBefore = await pg.evaluate(() => document.querySelectorAll("#log .log-item, .log-item").length);
    await pg.evaluate(() => { window.SSDNSSheet.castNamed("Pact Shot"); });
    await sleep(400);
    const logAfter = await pg.evaluate(() => Array.from(document.querySelectorAll("#log .log-item, .log-item")).map((x) => x.textContent).filter((t) => /Pact Shot/.test(t) && /d20|hit|miss|=/.test(t)).length);
    check("ui.pact.castNamedRefused", logAfter === 0, logBefore + " / " + logAfter);
    await shot(pg, "#dollHost .doll", "focus-pact-seeker-away.png");
    /* the owner's next turn starts: it's back */
    await pg.evaluate(() => window.SSDNSFocus.onTurn("turn:9:next", true, true));
    await sleep(500);
    f = await pg.evaluate(focusInfo, "revolver_2");
    check("ui.pact.backNextTurn", !/doll-away/.test(f.cls) && /In hand/.test(f.note) && f.pact && !f.pact.disabled && !f.hexBtn.disabled, J(f));
    check("ui.pact.noPageErrors", errs.length === 0, errs.join(" | "));
    await pg.browserContext().close();
  }
  /* Hexslinger */
  {
    const { pg, errs } = await open(() => window.SSDNSApp.applyPatch((d) => {
      const c = d.character; c.name = "Dust"; c.calling = "hexslinger"; c.level = 3; c.abilities = Object.assign(c.abilities || {}, { CHA: 16 });
      window.SSDNSKits.apply(c, "hexslinger", {}); c.kitStamp = "hexslinger"; c.cantrips = ["Fire Bolt"];
    }));
    let f = await pg.evaluate(focusInfo);
    const hexItems = await pg.evaluate(() => (window.SSDNSApp.doc().character.items || []).map((x) => x.catalogId));
    check("ui.hex.noFocusItem", hexItems.indexOf("borrowed-iron") < 0, J(hexItems));
    check("ui.hex.mirrorL", /doll-focus-caster/.test(f.cls) && f.name === "Blacksnake" && /blacksnake\.webp/.test(f.art) && f.artOk && /Mirrors Pistol L/.test(f.note), J(f));
    check("ui.hex.castOpen", f.hexBtn && !f.hexBtn.disabled, J(f));
    const wA = await pg.evaluate(() => window.SSDNSItems.weightReport(window.SSDNSApp.doc().character).carried);
    await shot(pg, "#dollHost .doll", "focus-hexslinger-mirror.png");
    /* move the Blacksnake to Pistol R (a plinker takes Pistol L) */
    await pg.evaluate(() => window.SSDNSApp.applyPatch((d) => {
      const c = d.character; c.guns[1] = { weapon: "dullards-plinker-revolver", proficient: true, chambers: [], equipped: true }; c.dollWeapons = { revolver_1: 1, revolver_2: 0 };
    }));
    await sleep(500);
    f = await pg.evaluate(focusInfo);
    check("ui.hex.mirrorR", f.name === "Blacksnake" && /Mirrors Pistol R/.test(f.note), J(f));
    /* unequip it: the message, cast blocked, data kept */
    await pg.evaluate(() => window.SSDNSApp.applyPatch((d) => { const c = d.character; c.guns[0].equipped = false; c.guns[1].weapon = ""; c.guns[1].equipped = false; c.dollWeapons = {}; }));
    await sleep(600);
    f = await pg.evaluate(focusInfo);
    const keep = await pg.evaluate(() => { const c = window.SSDNSApp.doc().character; return { w: c.guns[0].weapon, casterGun: c.casterGun, carried: window.SSDNSItems.weightReport(c).carried }; });
    check("ui.hex.noGunMsg", /doll-focus-nocaster/.test(f.cls) && f.note === NO_CASTER && !f.name, J(f));
    check("ui.hex.castBlocked", f.hexBtn && f.hexBtn.disabled && f.hexBtn.title === NO_CASTER && f.castNote === NO_CASTER && (!f.cast0 || f.cast0.disabled), J(f));
    check("ui.hex.dataKept", keep.w === "blacksnake" && keep.casterGun === "blacksnake", J(keep));
    check("ui.hex.noExtraWeight", keep.carried === wA, keep.carried + " vs " + wA);
    await shot(pg, "#dollHost .doll", "focus-hexslinger-nogun.png");
    /* re-equip: casting opens again (blocked buttons get their own state back) */
    await pg.evaluate(() => window.SSDNSApp.applyPatch((d) => { d.character.guns[0].equipped = true; }));
    await sleep(500);
    f = await pg.evaluate(focusInfo);
    check("ui.hex.reopen", f.hexBtn && !f.hexBtn.disabled && f.hexBtn.title !== NO_CASTER && /doll-focus-caster/.test(f.cls), J(f));
    check("ui.hex.noPageErrors", errs.length === 0, errs.join(" | "));
    await pg.browserContext().close();
  }
  /* L0198: an old Hexslinger save that took the Plinker swap: the note shows, nothing on the sheet changes */
  {
    const { pg, errs } = await open(() => window.SSDNSApp.applyPatch((d) => {
      const c = d.character; c.name = "Swap"; c.calling = "hexslinger"; c.level = 2; c.kitStamp = "hexslinger"; c.casterGun = "";
      c.guns = [{ weapon: "dullards-plinker-revolver", proficient: true, chambers: [], equipped: true, chamber: "light|.22 LR" }, { weapon: "" }, { weapon: "" }, { weapon: "" }];
      c.ammo = [{ type: "cartridge", caliber: "Light", count: 20 }];
    }));
    await sleep(400);
    const s = await pg.evaluate(() => {
      const n = document.getElementById("hexSwapNote"), b = document.getElementById("btnHexRoll"), c = window.SSDNSApp.doc().character;
      return { note: n && !n.hidden ? n.textContent : "", shown: !!(n && n.offsetParent), title: b ? b.title : "", disabled: b ? b.disabled : null, gun: c.guns[0].weapon, ammo: c.ammo[0].count };
    });
    check("ui.swap.gearNote", /Plinker kit swap isn't allowed for the Hexslinger/.test(s.note) && /can't cast/.test(s.note) && s.shown, J(s));
    check("ui.swap.castBlocked", s.disabled === true && s.title.indexOf(NO_CASTER) === 0 && /isn't allowed/.test(s.title), J(s));
    check("ui.swap.dataKept", s.gun === "dullards-plinker-revolver" && s.ammo === 20, J(s));
    await shot(pg, "#hexSwapNote", "focus-hexslinger-swap-note.png");
    check("ui.swap.noPageErrors", errs.length === 0, errs.join(" | "));
    await pg.browserContext().close();
  }
} finally {
  await browser.close();
}
if (failures.length) { console.log("\n" + failures.length + " failed:\n" + failures.join("\n")); process.exit(1); }
console.log("\nall focus slot checks passed");

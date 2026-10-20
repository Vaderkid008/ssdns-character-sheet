/**
 * Player Give (sheet 0.3.86 / DMCC 0.2.99): the pure parts of the transfer (give.js), no browser.
 *   node tools/test-give.mjs
 * Proves: offer checks (lock, DM-only, worn, cursed, held, quantity), the broker's state machine (ledger first,
 * reject / decline / cancel), idempotency (a double tap, a re-run broker, a double apply on either sheet, a
 * refresh) and the rollback when a cancel races an apply. Plus the saddle's attunement flag, and slot gives
 * (guns / melee / bows with no inventory row): full state, d4 block, fired-after-offer reject, full receiver parks.
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fails = [];
function check(id, ok, detail) { console.log((ok ? "ok    " : "FAIL  ") + id + (ok || !detail ? "" : " — " + detail)); if (!ok) fails.push(id); }

const ctx = { console };
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, "assets/js/give.js"), "utf8"), ctx);
const G = ctx.SSDNSGive;
const clone = (o) => JSON.parse(JSON.stringify(o));
/* a stand-in for SSDNSItems.add: keeps every field, merges stacks by catalogId */
const Items = { add(c, raw) { c.items = c.items || []; const same = raw.stack && c.items.find((x) => x.catalogId && x.catalogId === raw.catalogId); if (same) { same.count += raw.count; return { ok: true, item: same, merged: true }; } const it = clone(raw); c.items.push(it); return { ok: true, item: it }; } };

const dust = () => ({ name: "Dust", items: [
  { uid: "u1", catalogId: "hardtack", name: "Hardtack", count: 5, weight: 0.5, stack: true },
  { uid: "u2", name: "Trail Iron", type: "weapon", weaponId: "custom-trail-iron", weight: 2.5, dirty: true, chargesLeft: 2, uses: { max: 3 } },
  { uid: "u3", name: "Lucky Letter", type: "quest", weight: 0 },
  { uid: "u4", name: "Sealed Map", dmOnly: true },
  { uid: "u5", name: "Duster", equipSlot: "body", weight: 4 },
  { uid: "u6", name: "Saddle of the Phantom Steed", catalogId: "saddle-of-the-phantom-steed", attune: true, attuned: true, summoned: true, weight: 25 }
], ammo: [{ type: "arrows", caliber: "", count: 30 }], guns: [{ weapon: "custom-trail-iron", chambers: ["c"] }], melee: [] });

/* ---- offer checks ---- */
let c = dust();
check("offer.ok", G.canOffer(c, { kind: "item", uid: "u1", qty: 2 }).ok);
check("offer.tooMany", !G.canOffer(c, { kind: "item", uid: "u1", qty: 6 }).ok);
check("offer.quest", G.canOffer(c, { kind: "item", uid: "u3", qty: 1 }).ok);
check("offer.dmOnly", /DM-only/.test(G.canOffer(c, { kind: "item", uid: "u4", qty: 1 }).reason || ""));
check("offer.worn", G.canOffer(c, { kind: "item", uid: "u5", qty: 1 }).worn === true);
c.inventoryLocked = true;
check("offer.locked", /locked/.test(G.canOffer(c, { kind: "item", uid: "u1", qty: 1 }).reason || ""));
c.inventoryLocked = false;
check("offer.ammo", G.canOffer(c, { kind: "ammo", ammo: { type: "arrows", caliber: "" }, qty: 20 }).ok && !G.canOffer(c, { kind: "ammo", ammo: { type: "arrows" }, qty: 31 }).ok);
check("offer.es", G.canOffer(c, { kind: "es", qty: 50 }, { es: 120 }).ok && !G.canOffer(c, { kind: "es", qty: 500 }, { es: 120 }).ok);
/* held: an open offer reserves its count, so a double tap can't offer the same thing twice */
G.xfers(c).xfer_a = { id: "xfer_a", role: "from", state: "offered", kind: "item", uid: "u1", qty: 4 };
check("offer.heldReserves", G.available(c, { kind: "item", uid: "u1" }) === 1 && !G.canOffer(c, { kind: "item", uid: "u1", qty: 2 }).ok);
G.xfers(c).xfer_a.state = "declined";
check("offer.releasedOnDecline", G.available(c, { kind: "item", uid: "u1" }) === 5);

/* ---- snapshot keeps the fields, drops the giver's attunement / slot ---- */
const snap = G.snapshotItem(c.items[5], 1);
check("snapshot.attuneCleared", snap.attune === true && !("attuned" in snap) && !("equipSlot" in snap));
check("snapshot.summonedCleared", !("summoned" in snap)); /* #105 + #109: the horse doesn't come with the saddle */
const gsnap = G.snapshotItem(c.items[1], 1);
check("snapshot.keepsFields", gsnap.dirty === true && gsnap.chargesLeft === 2 && gsnap.weight === 2.5 && gsnap.weaponId === "custom-trail-iron");

/* ---- broker ---- */
const players = { A: { snapshot: { name: "Dust", items: clone(dust().items), ammo: [{ type: "arrows", caliber: "", count: 30 }], es: 100 } }, B: { snapshot: { name: "Dolan", items: [], ammo: [] } } };
c = dust();
const spec = { id: "xfer_t1", kind: "ammo", ammo: { type: "arrows", caliber: "" }, qty: 20, to: "B", toName: "Dolan" };
const req = { xfer_t1: G.requestRow(c, spec, { uid: "A" }) };
check("request.fields", ["ts", "from", "targetId", "amount"].every((k) => req.xfer_t1[k] !== undefined) && req.xfer_t1.kind === "give");
let L = null;
const apply = (acts) => acts.forEach((a) => { if (a.op === "create") L = clone(a.row); if (a.op === "state") { Object.keys(a.patch).forEach((k) => { if (k.indexOf("/") < 0) L[k] = a.patch[k]; }); } if (a.op === "announce") L.announced = true; });
let acts = G.step(req.xfer_t1, L, req, players);
check("broker.ledgerFirst", acts[0].op === "create" && acts[0].row.state === "offered" && acts[1].op === "announce");
check("broker.line", acts[0].row.what === "Dust gives Dolan 20 arrows", acts[0].row.what);
apply(acts);
check("broker.rerunIdle", G.step(req.xfer_t1, L, req, players).length === 0);
req["xfer_t1_reply_B"] = { ts: "t", from: "B", targetId: "A", amount: 0, kind: "give_reply", answer: "accept", xferId: "xfer_t1" };
req["xfer_t1_reply_X"] = { ts: "t", from: "X", answer: "decline", xferId: "xfer_t1" };
acts = G.step(req.xfer_t1, L, req, players);
check("broker.accept", acts.length === 1 && acts[0].state === "accepted");
apply(acts);
check("broker.acceptOnce", G.step(req.xfer_t1, L, req, players).length === 0);

/* ---- receiver applies once (double apply / refresh) ---- */
const dolan = { name: "Dolan", items: [], ammo: [] };
check("sheet.receiverPlan", G.sheetPlan(dolan, L, "B").join(",") === "closePrompt,applyIn,ackIn");
G.applyIn(dolan, L, Items);
const again = G.applyIn(dolan, L, Items);
const reload = JSON.parse(JSON.stringify(dolan)); /* a refresh: the save comes back from storage */
G.applyIn(reload, L, Items);
check("sheet.applyInOnce", dolan.ammo[0].count === 20 && again.already && reload.ammo[0].count === 20, JSON.stringify(dolan.ammo));
check("sheet.giverNotYet", G.sheetPlan(c, L, "A").length === 0 && c.ammo[0].count === 30);
req["xfer_t1_badd_B"] = { ts: "t", from: "B", kind: "give_ack", leg: "badd", xferId: "xfer_t1" };
acts = G.step(req.xfer_t1, L, req, players);
check("broker.added", acts[0].state === "added");
apply(acts);
check("sheet.giverPlan", G.sheetPlan(c, L, "A").join(",") === "applyOut,ackOut");
G.applyOut(c, L); G.applyOut(c, L);
check("sheet.applyOutOnce", c.ammo[0].count === 10, String(c.ammo[0].count));
req["xfer_t1_arem_A"] = { ts: "t", from: "A", kind: "give_ack", leg: "arem", xferId: "xfer_t1" };
acts = G.step(req.xfer_t1, L, req, players);
check("broker.doneAndChat", acts[0].state === "done" && acts[1].op === "chat" && acts[1].text === "Dust gives Dolan 20 arrows");
apply(acts);
check("broker.doneIdle", G.step(req.xfer_t1, L, req, players).length === 0 && G.sheetPlan(c, L, "A").length === 0 && G.sheetPlan(dolan, L, "B").filter((x) => x !== "closePrompt").length === 0);
check("sheet.weightMoved", c.ammo[0].count + dolan.ammo[0].count === 30);

/* ---- an item with all its fields; giver's slot clears ---- */
c = dust();
const req2 = { xfer_t2: G.requestRow(c, { id: "xfer_t2", kind: "item", uid: "u2", qty: 1, to: "B", toName: "Dolan" }, { uid: "A" }) };
L = null; apply(G.step(req2.xfer_t2, L, req2, players));
req2.xfer_t2_reply_B = { from: "B", answer: "accept" }; apply(G.step(req2.xfer_t2, L, req2, players));
const d2 = { name: "Dolan", items: [], ammo: [] };
G.applyIn(d2, L, Items);
req2.xfer_t2_badd_B = { from: "B" }; apply(G.step(req2.xfer_t2, L, req2, players));
G.applyOut(c, L);
check("item.fieldsMoved", d2.items[0].dirty === true && d2.items[0].chargesLeft === 2 && d2.items[0].weight === 2.5 && d2.items[0].uid === "xxfer_t2");
check("item.leftGiver", !c.items.some((x) => x.uid === "u2") && c.guns[0].weapon === "", JSON.stringify(c.guns[0]));

/* ---- attuned item: attunement clears on the receiver ---- */
c = dust();
const req3 = { xfer_t3: G.requestRow(c, { id: "xfer_t3", kind: "item", uid: "u6", qty: 1, to: "B", toName: "Dolan" }, { uid: "A" }) };
L = null; apply(G.step(req3.xfer_t3, L, req3, players)); req3.xfer_t3_reply_B = { from: "B", answer: "accept" }; apply(G.step(req3.xfer_t3, L, req3, players));
const d3 = { name: "Dolan", items: [], ammo: [] };
G.applyIn(d3, L, Items);
check("attune.clearedOnGive", d3.items[0].attune === true && d3.items[0].attuned === false);
check("saddle.summonedClearedOnGive", !d3.items[0].summoned);

/* ---- reject / decline / cancel ---- */
const lockedPlayers = clone(players); lockedPlayers.B.snapshot.inventoryLocked = true;
const r4 = { xfer_t4: G.requestRow(dust(), { id: "xfer_t4", kind: "item", uid: "u1", qty: 1, to: "B", toName: "Dolan" }, { uid: "A" }) };
acts = G.step(r4.xfer_t4, null, r4, lockedPlayers);
check("broker.rejectLockedReceiver", acts.length === 1 && acts[0].row.state === "rejected" && /locked/.test(acts[0].row.reason));
const r5 = { xfer_t5: G.requestRow(dust(), { id: "xfer_t5", kind: "item", uid: "u4", qty: 1, to: "B" }, { uid: "A" }) };
check("broker.rejectDmOnly", G.step(r5.xfer_t5, null, r5, players)[0].row.state === "rejected");
const r6 = { xfer_t6: G.requestRow(dust(), { id: "xfer_t6", kind: "item", uid: "u1", qty: 1, to: "B" }, { uid: "A" }) };
L = null; apply(G.step(r6.xfer_t6, L, r6, players));
r6.xfer_t6_reply_B = { from: "B", answer: "decline" };
acts = G.step(r6.xfer_t6, L, r6, players);
check("broker.decline", acts[0].state === "declined");
const r7 = { xfer_t7: G.requestRow(dust(), { id: "xfer_t7", kind: "item", uid: "u1", qty: 1, to: "B" }, { uid: "A" }) };
L = null; apply(G.step(r7.xfer_t7, L, r7, players));
r7.xfer_t7_cancel_A = { from: "A" };
r7.xfer_t7_cancel_B = { from: "B" };
acts = G.step(r7.xfer_t7, L, r7, players);
check("broker.giverCancel", acts[0].state === "cancelled");
const r8 = { xfer_t8: G.requestRow(dust(), { id: "xfer_t8", kind: "item", uid: "u1", qty: 1, to: "B" }, { uid: "A" }), xfer_t8_cancel_B: { from: "B" } };
L = null; apply(G.step(r8.xfer_t8, L, r8, players));
check("broker.onlyGiverCancels", L.state === "offered");
/* cancel before the DM ever saw it (DMCC was closed): ledger goes straight to cancelled */
const r9 = { xfer_t9: G.requestRow(dust(), { id: "xfer_t9", kind: "item", uid: "u1", qty: 1, to: "B" }, { uid: "A" }), xfer_t9_cancel_A: { from: "A" } };
check("broker.cancelOffline", G.step(r9.xfer_t9, null, r9, players)[0].row.state === "cancelled");
/* a DM cancel that races the receiver's apply rolls the add back, once */
L.state = "accepted";
const d8 = { name: "Dolan", items: [{ uid: "h1", catalogId: "hardtack", name: "Hardtack", count: 2, stack: true }], ammo: [] };
G.applyIn(d8, L, Items);
check("race.mergedStack", d8.items[0].count === 3);
L.state = "cancelled";
check("race.rollbackPlan", G.sheetPlan(d8, L, "B").indexOf("rollbackIn") >= 0);
G.rollbackIn(d8, L); G.rollbackIn(d8, L);
check("race.rollbackOnce", d8.items[0].count === 2 && G.sheetPlan(d8, L, "B").indexOf("rollbackIn") < 0);
/* the giver's sheet never removes on a cancelled / declined transfer */
const g8 = dust();
check("race.giverKeeps", G.sheetPlan(g8, L, "A").length === 0);

/* ---- weapon slots with no inventory row (give: "slot") ---- */
ctx.SSDNS_RULES = { firearms: [{ id: "colt-navy", name: "Colt Navy", weight: "3 lb." }], melee: [{ id: "bowie", name: "Bowie Knife" }], otherRanged: [{ id: "longbow", name: "Longbow" }] };
const blankGun = () => ({ weapon: "", loaded: 0, chambers: [] });
const gunner = () => ({ name: "Dust", items: [], ammo: [], guns: [
  { weapon: "colt-navy", loaded: 5, chambers: ["k:percussion::medium", "k:percussion::medium", "k:percussion::medium", "k:percussion::medium", "k:hex:2", ""], dirty: true, jammed: true, misStreak: 2,
    mod: "hair-trigger", capacity: "6", chamber: "medium|", tier: "medium", load: "percussion", lockedChambers: [5], conditions: ["rusty"], ui: "special-colt", engraving: true, custom1: "notch ×3",
    equipped: true, drawn: true, ammoPool: "1", attackMode: "adv", proficient: true },
  { weapon: "colt-navy", dmOnly: true },
  { weapon: "custom-zapper", record: { id: "custom-zapper", name: "Zapper", custom: true, kind: "firearm" }, loaded: 1, chambers: ["z"] },
  { weapon: "colt-navy", pendingD4: true, loaded: 2, chambers: ["a", "b"] }],
  melee: [{ weapon: "longbow", proficient: true, arrowType: "fire", equipped: true }, { weapon: "" }] });
/* the DMCC sees the slots through the player snapshot (dm-join buildSnapshot) */
const snapOf = (c) => ({ name: c.name, items: c.items, ammo: c.ammo, inventoryLocked: !!c.inventoryLocked,
  guns: c.guns.map((g, i) => g && g.weapon ? { index: i, weapon: g.weapon, loaded: g.loaded, chambers: (g.chambers || []).slice(), jammed: !!g.jammed, dirty: !!g.dirty, fouled: !!g.fouled, ruined: !!(g.ruined || g.broken), cracked: !!g.cracked, pendingD4: !!g.pendingD4, dmOnly: !!g.dmOnly } : null).filter(Boolean),
  melee: c.melee.map((m, i) => m && m.weapon ? { index: i, weapon: m.weapon, dmOnly: !!m.dmOnly } : null).filter(Boolean) });
let gc = gunner();
const sspec = (i, kind) => ({ kind: "slot", slotKind: kind || "gun", index: i, weapon: (kind === "melee" ? gc.melee : gc.guns)[i].weapon, qty: 1 });
check("slot.offerOk", G.canOffer(gc, sspec(0)).ok);
check("slot.jammedAllowed", gc.guns[0].jammed && G.canOffer(gc, sspec(0)).ok);
check("slot.dmOnly", /DM-only/.test(G.canOffer(gc, sspec(1)).reason || ""));
check("slot.midMisfire", /d4/.test(G.canOffer(gc, sspec(3)).reason || ""));
check("slot.combatLock", !G.canOffer(gc, sspec(0), { combatLocked: true, lockTip: "Locked in combat." }).ok && G.canOffer(gc, sspec(2), { combatLocked: true }).ok === false);
gc.inventoryLocked = true;
check("slot.locked", /locked/.test(G.canOffer(gc, sspec(0)).reason || ""));
gc.inventoryLocked = false;
check("slot.wrongWeapon", !G.canOffer(gc, Object.assign(sspec(0), { weapon: "bowie" })).ok);
const backed = { name: "Dust", items: [{ uid: "w1", name: "Trail Iron", type: "weapon", weaponId: "colt-navy", count: 1 }], guns: [{ weapon: "colt-navy", loaded: 3, chambers: ["a", "b", "c"], dirty: true }], melee: [] };
check("slot.backedUsesRow", G.canOffer(backed, { kind: "slot", slotKind: "gun", index: 0, weapon: "colt-navy" }).row === true);
const srow = G.requestRow(gc, Object.assign(sspec(0), { id: "xfer_s1", to: "B", toName: "Dolan" }), { uid: "A" });
const st0 = srow.slot.state;
check("slot.snapshotState", srow.qty === 1 && srow.slot.name === "Colt Navy" && st0.loaded === 5 && st0.chambers.length === 6 && st0.chambers[4] === "k:hex:2" && st0.dirty && st0.jammed && st0.misStreak === 2
  && st0.mod === "hair-trigger" && st0.lockedChambers[0] === 5 && st0.conditions[0] === "rusty" && st0.ui === "special-colt" && st0.custom1 === "notch ×3" && st0.engraving === true, JSON.stringify(st0));
check("slot.snapshotDropsHands", !("equipped" in st0) && !("drawn" in st0) && !("ammoPool" in st0) && !("attackMode" in st0) && !("pendingD4" in st0));
/* hold: a second offer of the same slot finds nothing left */
G.xfers(gc).xfer_s1 = { id: "xfer_s1", role: "from", state: "sending", kind: "slot", slotKind: "gun", index: 0, weapon: "colt-navy", qty: 1 };
check("slot.heldReserves", !G.canOffer(gc, sspec(0)).ok && !!G.heldSlot(gc, "gun", 0));
const dolan2 = () => ({ name: "Dolan", items: [], ammo: [], guns: [{ weapon: "longgun-x" }, blankGun(), blankGun(), blankGun()], melee: [{ weapon: "" }] });
let sp = { A: { snapshot: snapOf(gc) }, B: { snapshot: snapOf(dolan2()) } };
let sreq = { xfer_s1: srow };
L = null;
acts = G.step(srow, L, sreq, sp);
check("slot.ledgerFirst", acts[0].op === "create" && acts[0].row.state === "offered" && acts[0].row.slot.weapon === "colt-navy" && acts[1].op === "announce");
check("slot.line", acts[0].row.what === "Dust gives Dolan Colt Navy", acts[0].row.what);
apply(acts);
sreq.xfer_s1_reply_B = { from: "B", answer: "accept" };
apply(G.step(srow, L, sreq, sp));
check("slot.accepted", L.state === "accepted");
const rcv = dolan2();
check("slot.giverWaits", G.sheetPlan(gc, L, "A").length === 0);
const in1 = G.applyIn(rcv, L, Items);
const in2 = G.applyIn(rcv, L, Items);
const lg = rcv.guns[1];
check("slot.landsInFreeSlot", in1.ok && in1.slot && in1.slot.index === 1 && lg.weapon === "colt-navy" && lg.loaded === 5 && lg.chambers[4] === "k:hex:2" && lg.dirty && lg.jammed && lg.mod === "hair-trigger" && lg.ui === "special-colt" && lg.custom1 === "notch ×3" && lg.equipped === false, JSON.stringify(lg));
check("slot.doubleApplyIn", in2.already === true && rcv.guns.filter((g) => g.weapon === "colt-navy").length === 1 && rcv.items.length === 0);
sreq.xfer_s1_badd_B = { from: "B" };
apply(G.step(srow, L, sreq, sp));
check("slot.added", L.state === "added" && G.sheetPlan(gc, L, "A").join(",") === "applyOut,ackOut");
const out1 = G.applyOut(gc, L), out2 = G.applyOut(gc, L);
check("slot.applyOutOnce", out1.took === 1 && out2.already === true && gc.guns[0].weapon === "" && gc.guns[0].loaded === 0 && gc.guns[2].weapon === "custom-zapper" && gc.guns[3].weapon === "colt-navy");
sreq.xfer_s1_arem_A = { from: "A" };
acts = G.step(srow, L, sreq, sp);
check("slot.done", acts[0].state === "done" && acts[1].op === "chat" && acts[1].text === "Dust gives Dolan Colt Navy");
/* the gun was fired after the offer: the DMCC rejects the accept, nothing moves */
gc = gunner();
const srow2 = G.requestRow(gc, Object.assign(sspec(0), { id: "xfer_s2", to: "B" }), { uid: "A" });
const sreq2 = { xfer_s2: srow2 };
L = null; apply(G.step(srow2, L, sreq2, { A: { snapshot: snapOf(gc) }, B: { snapshot: snapOf(dolan2()) } }));
gc.guns[0].loaded = 4; gc.guns[0].chambers[0] = "";
sreq2.xfer_s2_reply_B = { from: "B", answer: "accept" };
apply(G.step(srow2, L, sreq2, { A: { snapshot: snapOf(gc) }, B: { snapshot: snapOf(dolan2()) } }));
check("slot.firedAfterOffer", L.state === "rejected" && /changed after the offer/.test(L.reason || ""), L.reason);
/* a DM-only or locked receiver is rejected by the DMCC too */
const lockedB = Object.assign(snapOf(dolan2()), { inventoryLocked: true });
check("slot.receiverLocked", G.step(G.requestRow(gunner(), Object.assign(sspec(0), { id: "xfer_s3", to: "B" }), { uid: "A" }), null, {}, { A: { snapshot: snapOf(gunner()) }, B: { snapshot: lockedB } })[0].row.state === "rejected");
const dmRow = G.requestRow(gunner(), { kind: "slot", slotKind: "gun", index: 1, weapon: "colt-navy", id: "xfer_s4", to: "B" }, { uid: "A" });
check("slot.dmOnlyRejected", G.step(dmRow, null, {}, { A: { snapshot: snapOf(gunner()) }, B: { snapshot: snapOf(dolan2()) } })[0].row.state === "rejected");
/* every gun slot full: it lands as an inventory row that keeps the slot, and goes back with "To a slot" */
const full = { name: "Dolan", items: [], ammo: [], guns: [{ weapon: "a" }, { weapon: "b" }, { weapon: "c" }, { weapon: "d" }], melee: [] };
const Lf = Object.assign(clone(L), { id: "xfer_s5", state: "accepted", give: "slot", slot: srow.slot });
const pin = G.applyIn(full, Lf, Items);
const parked = full.items[0];
check("slot.fullParks", pin.ok && pin.parked && full.guns.every((g) => g.weapon !== "colt-navy") && parked && parked.type === "weapon" && parked.weaponId === "colt-navy" && parked.slotState.state.loaded === 5 && parked.parkedSlot === true, JSON.stringify(parked));
check("slot.unparkWhileFull", !G.unparkSlot(full, parked.uid).ok);
full.guns[2] = blankGun();
const up = G.unparkSlot(full, parked.uid);
check("slot.unpark", up.ok && up.index === 2 && full.guns[2].weapon === "colt-navy" && full.guns[2].loaded === 5 && full.guns[2].jammed === true && full.items.length === 0);
/* a cancel that races the apply clears the landed slot, once */
const race = dolan2();
const Lr = Object.assign(clone(Lf), { id: "xfer_s6", state: "accepted" });
G.applyIn(race, Lr, Items);
Lr.state = "cancelled";
check("slot.rollbackPlan", G.sheetPlan(race, Lr, "B").indexOf("rollbackIn") >= 0);
G.rollbackIn(race, Lr); G.rollbackIn(race, Lr);
check("slot.rollbackOnce", race.guns[1].weapon === "" && race.guns[0].weapon === "longgun-x" && G.sheetPlan(race, Lr, "B").indexOf("rollbackIn") < 0);
/* melee / bow card: arrow type goes with it; a created weapon's record rides on the slot */
gc = gunner();
const mrow = G.requestRow(gc, Object.assign(sspec(0, "melee"), { id: "xfer_s7", to: "B" }), { uid: "A" });
const mrcv = dolan2();
const mi = G.applyIn(mrcv, { id: "xfer_s7", state: "accepted", give: "slot", qty: 1, slot: mrow.slot }, Items);
check("slot.melee", mi.ok && mrcv.melee[0].weapon === "longbow" && mrcv.melee[0].arrowType === "fire" && mrcv.melee[0].equipped === false);
const zrow = G.requestRow(gc, Object.assign(sspec(2), { id: "xfer_s8", to: "B" }), { uid: "A" });
const zr = dolan2();
G.applyIn(zr, { id: "xfer_s8", state: "accepted", give: "slot", qty: 1, slot: zrow.slot }, Items);
check("slot.createdRecord", zrow.slot.name === "Zapper" && zr.guns[1].weapon === "custom-zapper" && zr.guns[1].record && zr.guns[1].record.custom === true);
/* a weapon WITH an inventory row: its Give (row or card) carries the slot state with the last one */
const irow = G.requestRow(backed, { kind: "item", uid: "w1", qty: 1, id: "xfer_s9", to: "B" }, { uid: "A" });
check("itemWeapon.carriesSlot", irow.item.slotState && irow.item.slotState.state.loaded === 3 && irow.item.slotState.state.dirty === true);
const LandItems = { add(c, raw, o) { const it = clone(raw); c.items.push(it); let landed = null; if (!o.noLand) { const i = c.guns.findIndex((g) => !g.weapon); c.guns[i] = { weapon: raw.weaponId, loaded: 0, chambers: [], equipped: false }; landed = { index: i }; } return { ok: true, item: it, landed }; } };
const ir = dolan2();
G.applyIn(ir, { id: "xfer_s9", state: "accepted", give: "item", qty: 1, item: irow.item, uid: "w1" }, LandItems);
check("itemWeapon.slotRestored", ir.guns[1].weapon === "colt-navy" && ir.guns[1].loaded === 3 && ir.guns[1].dirty === true && ir.items.length === 1 && !ir.items[0].slotState);
const irFull = { name: "Dolan", items: [], guns: [{ weapon: "a" }, { weapon: "b" }, { weapon: "c" }, { weapon: "d" }], melee: [] };
const pf = G.applyIn(irFull, { id: "xfer_s10", state: "accepted", give: "item", qty: 1, item: irow.item, uid: "w1" }, LandItems);
check("itemWeapon.fullStaysRow", pf.parked && irFull.guns[0].weapon === "a" && irFull.items[0].slotState.state.loaded === 3);
check("itemWeapon.backedCardSig", (() => { const sp2 = { A: { snapshot: snapOf(backed) }, B: { snapshot: snapOf(dolan2()) } }; const rq = { xfer_s9: irow }; let LL = null; G.step(irow, null, rq, sp2).forEach((a) => { if (a.op === "create") LL = clone(a.row); }); backed.guns[0].loaded = 2; rq.xfer_s9_reply_B = { from: "B", answer: "accept" }; const a2 = G.step(irow, LL, rq, { A: { snapshot: snapOf(backed) }, B: { snapshot: snapOf(dolan2()) } }); return a2[0] && a2[0].state === "rejected"; })());

/* ---- the saddle row needs attunement (special-items.md, LOCKED 2026-10-17) ---- */
const cat = fs.readFileSync(path.join(root, "assets/data/item-catalog.js"), "utf8");
const at = cat.indexOf('id: "saddle-of-the-phantom-steed"');
const row = cat.slice(at, cat.indexOf("art(", at));
check("saddle.attune", /attune: true/.test(row) && /rarity: "Rare"/.test(row));

console.log(fails.length ? "\nFAILED: " + fails.join(", ") : "\nALL PASS");
process.exit(fails.length ? 1 : 0);

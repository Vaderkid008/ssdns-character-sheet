/* Player Give (sheet 0.3.86 / DMCC 0.2.99). Loot spec v1.1 §5.1 + §5.4 (K1, K3).
 *
 * One transfer ID (xfer_…) for every step. Players can only CREATE encounter/requests rows (the DM reads them)
 * and READ the ledger, so:
 *   1. The giver's sheet holds the item (nothing leaves yet) and writes encounter/requests/<xferId> {kind:"give"}.
 *   2. The DMCC (the post office) checks it and writes ledger/<xferId> FIRST (state offered | rejected), then
 *      tells the receiver with an inbox command (give_offer).
 *   3. The receiver's sheet shows Accept / Decline and answers with a new row <xferId>_reply_<uid>.
 *   4. accepted → the receiver applies the add ONCE (marked in the character itself, in the same save), then acks
 *      (<xferId>_badd_<uid>) → added → only now does the giver's sheet remove it ONCE and ack (<xferId>_arem_<uid>)
 *      → done, and the DMCC posts the table chat line ("Dust gives Dolan 20 arrows").
 * Every row key is fixed by the ID, so a double click or a refresh rewrites nothing (create-only) and every apply
 * is guarded twice (character.xfers[id].applied + the sheet's claimGrant store). Cancel / decline / reject release
 * the hold; a cancel that races an apply rolls the add back. No database.rules.json change.
 * Pure parts (canOffer, broker, applyIn/applyOut/rollbackIn) run in node for tools/test-give.mjs.
 *
 * Slot gives (give: "slot", 0.3.86 follow-up): a gun or melee/bow card whose weapon has NO inventory row moves as
 * the whole slot. Rule for loaded rounds: everything in the gun goes with it (chambers, loaded count, hex shells,
 * locked chambers), plus Dirty / jammed / fouled / cracked / ruined, the misfire streak, mods, capacity, chamber
 * tier, load, conditions, arrow type, the special-UI key and a created weapon's record. Only the giver's own
 * hand state stays behind (equipped, drawn, two-hand grip, which of the giver's ammo pools it draws from). The
 * gun can't be given while a misfire d4 is pending (the only "mid-action" jam state), and the DMCC rejects the
 * accept if the gun was fired / reloaded / cleaned after the offer (offer it again). It lands in the receiver's
 * first free slot of the same kind, or as an inventory row that keeps the slot state if every slot is full. */
(function (root) {
  "use strict";

  var TERMINAL = { done: 1, declined: 1, cancelled: 1, rejected: 1 };
  var RANK = { sending: 0, offered: 1, accepted: 2, added: 3, done: 9, declined: 9, cancelled: 9, rejected: 9 };
  var KEEP = 40;
  var SLOT_STRIP = ["equipped", "drawn", "pendingD4", "pendingD4Rolls", "pendingD4Step", "ammoPool", "twoHand", "held", "attackMode"];
  var SLOT_MAX = 4;

  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function num(v, d) { var n = Number(v); return isFinite(n) ? n : (d == null ? 0 : d); }
  function newId() { return "xfer_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function rowKey(id, step, uid) { return step ? id + "_" + step + "_" + uid : id; }
  function terminal(st) { return !!TERMINAL[st]; }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (ch) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]; });
  }

  /* what moves with the item: everything except where it sat on the giver (doll slot) and the giver's attunement */
  var STRIP = ["equipSlot", "attuned", "attunePending", "grantId", "held", "summoned"];
  function snapshotItem(item, qty) {
    var s = clone(item) || {};
    STRIP.forEach(function (k) { delete s[k]; });
    s.count = qty;
    return s;
  }
  function ammoLabel(a) {
    a = a || {};
    var t = String(a.type || "rounds");
    return a.caliber ? a.caliber + " " + t : t;
  }
  function describe(o) {
    o = o || {};
    var n = num(o.qty, 1);
    if (o.kind === "es") return n + " ES";
    if (o.kind === "slot") return (o.slot && o.slot.name) || "a weapon";
    if (o.kind === "ammo") return n + " " + ammoLabel(o.ammo);
    var name = (o.item && o.item.name) || "an item";
    return n > 1 ? n + " " + name : name;
  }
  function line(fromName, toName, o) { return (fromName || "Someone") + " gives " + (toName || "someone") + " " + describe(o); }
  function weightOf(o) {
    if (!o || o.kind !== "item" || !o.item) return null;
    var w = Number(o.item.weight);
    return isFinite(w) ? Math.round(w * num(o.qty, 1) * 100) / 100 : null;
  }

  /* ---- the giver's holds ---- */
  function xfers(c) {
    if (!c) return {};
    if (!c.xfers || typeof c.xfers !== "object" || Array.isArray(c.xfers)) c.xfers = {};
    return c.xfers;
  }
  function outgoing(c) {
    var x = xfers(c);
    return Object.keys(x).map(function (k) { return x[k]; }).filter(function (r) { return r && r.role === "from" && !terminal(r.state); });
  }
  function sameAmmo(a, b) {
    return !!a && !!b && String(a.type || "") === String(b.type || "") && String(a.caliber || "").toLowerCase() === String(b.caliber || "").toLowerCase();
  }
  function held(c, spec) {
    return outgoing(c).filter(function (r) {
      if (spec.kind === "item") return r.kind === "item" && r.uid === spec.uid;
      if (spec.kind === "ammo") return r.kind === "ammo" && sameAmmo(r.ammo, spec.ammo);
      if (spec.kind === "slot") return r.kind === "slot" && r.slotKind === spec.slotKind && num(r.index, -1) === num(spec.index, -2);
      return r.kind === spec.kind;
    }).reduce(function (s, r) { return s + num(r.qty, 0); }, 0);
  }
  function heldItem(c, uid) {
    return outgoing(c).filter(function (r) { return r.kind === "item" && r.uid === uid; })[0] || null;
  }
  function heldSlot(c, slotKind, index) {
    return outgoing(c).filter(function (r) { return r.kind === "slot" && r.slotKind === slotKind && num(r.index, -1) === num(index, -2); })[0] || null;
  }
  /* ---- weapon slots (guns[] / melee[]) ---- */
  function slotList(c, kind) { return kind === "melee" ? ((c && c.melee) || []) : ((c && c.guns) || []); }
  function slotAt(c, kind, i) { var s = slotList(c, kind)[num(i, -1)]; return s && s.weapon ? s : null; }
  function weaponRec(id) {
    if (!id) return null;
    var R = root.SSDNS_RULES || {}, hit = null;
    [R.firearms, R.melee, R.otherRanged].forEach(function (list) { (list || []).forEach(function (w) { if (!hit && w && w.id === id) hit = w; }); });
    if (!hit && root.SSDNSCustomWeapons && root.SSDNSCustomWeapons.get) hit = root.SSDNSCustomWeapons.get(id);
    return hit;
  }
  /* a slot that some inventory row backs moves with that row (the row's Give), not as a bare slot */
  function backingItem(c, wid) {
    return ((c && c.items) || []).filter(function (it) { return it && num(it.count == null ? 1 : it.count, 1) > 0 && (it.weaponId || it.catalogId) === wid; })[0] || null;
  }
  function slotDmOnly(slot, rec) { return !!((slot && slot.dmOnly) || (rec && rec.dmOnly) || (slot && slot.record && slot.record.dmOnly)); }
  /* what the receiver gets: the whole slot minus the giver's hand state, plus the created weapon's record */
  function snapshotSlot(c, kind, i) {
    var slot = slotAt(c, kind, i);
    if (!slot) return null;
    var rec = weaponRec(slot.weapon) || slot.record || null;
    var st = clone(slot);
    SLOT_STRIP.forEach(function (k) { delete st[k]; });
    var out = { slotKind: kind === "melee" ? "melee" : "gun", index: num(i), weapon: slot.weapon, name: (rec && rec.name) || slot.name || slot.weapon, state: st };
    if (rec && rec.custom) out.record = clone(rec);
    else if (slot.record) out.record = clone(slot.record);
    if (slotDmOnly(slot, rec)) out.dmOnly = true;
    return out;
  }
  /* the part of a gun that firing / reloading / cleaning changes: the DMCC checks it again on accept */
  function gunSig(g) {
    if (!g) return "";
    return [num(g.loaded, 0), (g.chambers || []).map(String).join(","), !!g.jammed, !!g.dirty, !!g.fouled, !!(g.ruined || g.broken), !!g.cracked].join("|");
  }
  function slotOfItem(c, item) {
    var wid = item && (item.weaponId || item.catalogId);
    if (!wid) return null;
    var kinds = ["gun", "melee"];
    for (var k = 0; k < kinds.length; k++) {
      var list = slotList(c, kinds[k]);
      for (var i = 0; i < list.length; i++) if (list[i] && list[i].weapon === wid) {
        var st = clone(list[i]);
        SLOT_STRIP.forEach(function (f) { delete st[f]; });
        return { kind: kinds[k], index: i, state: st };
      }
    }
    return null;
  }
  /* which slot list a weapon lands in (items.js landWeapon / grantListedWeapon): rules melee → melee, else gun */
  function landKind(wid) {
    var R = root.SSDNS_RULES || {};
    if ((R.melee || []).some(function (w) { return w && w.id === wid; })) return "melee";
    var cw = root.SSDNSCustomWeapons && root.SSDNSCustomWeapons.get ? root.SSDNSCustomWeapons.get(wid) : null;
    if (cw && cw.kind && cw.kind !== "firearm" && !/^(bow|crossbow|blowpipe|sling)$/.test(cw.kind)) return "melee";
    return "gun";
  }
  function freeSlot(c, kind) {
    var list = slotList(c, kind);
    for (var i = 0; i < SLOT_MAX; i++) if (!list[i] || !list[i].weapon) return i;
    return -1;
  }
  function blankSlot(kind) {
    return kind === "melee" ? { weapon: "", proficient: false }
      : { weapon: "", tier: "", chamber: "", mod: "", engraving: false, capacity: "", load: "buck", loaded: 0, chambers: [], proficient: false, jammed: false, cracked: false, fouled: false, dirty: false };
  }
  function findItem(c, uid) {
    return ((c && c.items) || []).filter(function (it) { return it && it.uid === uid; })[0] || null;
  }
  function pool(c, a) {
    return ((c && c.ammo) || []).filter(function (p) { return sameAmmo(p, a); })[0] || null;
  }
  function available(c, spec, ctx) {
    ctx = ctx || {};
    if (spec.kind === "item") { var it = findItem(c, spec.uid); return it ? num(it.count == null ? 1 : it.count, 1) - held(c, spec) : 0; }
    if (spec.kind === "ammo") { var p = pool(c, spec.ammo); return p ? num(p.count, 0) - held(c, spec) : 0; }
    if (spec.kind === "es") return Math.floor(num(ctx.es, 0)) - held(c, spec);
    if (spec.kind === "slot") return slotAt(c, spec.slotKind, spec.index) ? 1 - held(c, spec) : 0;
    return 0;
  }
  /* can this sheet offer it? {ok, reason, max} */
  function canOffer(c, spec, ctx) {
    spec = spec || {};
    ctx = ctx || {};
    if (!c) return { ok: false, reason: "No character." };
    if (c.inventoryLocked) return { ok: false, reason: "Your inventory is locked by the DM." };
    var qty = Math.floor(num(spec.qty, 1));
    if (spec.kind === "item") {
      var it = findItem(c, spec.uid);
      if (!it) return { ok: false, reason: "That item is gone." };
      if (it.dmOnly) return { ok: false, reason: it.name + " is DM-only. Only the DM can move it." };
      if (it.cursed) return { ok: false, reason: it.name + " is cursed. It won't let go." };
      if (it.equipSlot) return { ok: false, worn: true, reason: "Take " + it.name + " off first (it's worn on your paper doll)." };
    } else if (spec.kind === "slot") {
      var sl = slotAt(c, spec.slotKind, spec.index);
      if (!sl || (spec.weapon && sl.weapon !== spec.weapon)) return { ok: false, reason: "That weapon isn't in that slot any more." };
      var srec = weaponRec(sl.weapon);
      var sname = (srec && srec.name) || sl.weapon;
      if (slotDmOnly(sl, srec)) return { ok: false, reason: sname + " is DM-only. Only the DM can move it." };
      if (backingItem(c, sl.weapon)) return { ok: false, row: true, reason: "Give " + sname + " from its inventory row." };
      if (sl.pendingD4) return { ok: false, reason: "Roll the misfire d4 first. " + sname + " is mid-misfire." };
      if (ctx.combatLocked && sl.equipped !== false) return { ok: false, reason: ctx.lockTip || "Weapons can't change hands while combat has equipment locked." };
      if (num(spec.qty, 1) !== 1) spec.qty = 1;
    } else if (spec.kind !== "ammo" && spec.kind !== "es") return { ok: false, reason: "Pick what to give." };
    var max = available(c, spec, ctx);
    if (max <= 0) return { ok: false, max: 0, reason: spec.kind === "es" ? "No ES to give." : (heldCount(c, spec) ? "Already offered." : "None left to give.") };
    if (!(qty >= 1)) return { ok: false, max: max, reason: "Pick how many." };
    if (qty > max) return { ok: false, max: max, reason: "You only have " + max + " to give." };
    return { ok: true, max: max };
  }
  function heldCount(c, spec) { return held(c, spec); }

  /* the request row (encounter/requests/<xferId>); the 4 fields the rule validates are ts, from, targetId, amount */
  function requestRow(c, spec, ctx) {
    ctx = ctx || {};
    var row = {
      ts: new Date().toISOString(), from: ctx.uid, targetId: spec.to, amount: spec.kind === "es" ? Math.floor(num(spec.qty)) : 0,
      kind: "give", xferId: spec.id, give: spec.kind, qty: Math.floor(num(spec.qty, 1)),
      fromName: (c && c.name) || ctx.fromName || "", toName: spec.toName || "", characterName: (c && c.name) || "", playerName: (c && c.player) || ""
    };
    if (spec.kind === "item") {
      var src = findItem(c, spec.uid);
      row.uid = spec.uid; row.item = snapshotItem(src, row.qty);
      /* the last one of a weapon that sits in a slot: its slot state (loaded rounds, Dirty, jams, mods) goes too */
      var ss = src && src.type === "weapon" && num(src.count == null ? 1 : src.count, 1) <= row.qty ? slotOfItem(c, src) : null;
      if (ss) { row.item.slotState = { slotKind: ss.kind, state: ss.state }; if (ss.kind === "gun") row.item.slotState.sig = gunSig(slotAt(c, "gun", ss.index)); }
    }
    if (spec.kind === "ammo") row.ammo = { type: spec.ammo.type, caliber: spec.ammo.caliber || "" };
    if (spec.kind === "slot") { row.qty = 1; row.slot = snapshotSlot(c, spec.slotKind, spec.index); if (row.slot && row.slot.slotKind === "gun") row.slot.sig = gunSig(slotAt(c, "gun", spec.index)); }
    return row;
  }

  /* ---- DMCC broker (pure): requests + one transfer's fresh ledger row + players → what to do ---- */
  function validate(r, players) {
    var g = players && players[r.from] && players[r.from].snapshot;
    var b = players && players[r.targetId] && players[r.targetId].snapshot;
    if (!r.targetId || !b) return "That player isn't in the room.";
    if (r.from === r.targetId) return "You can't give to yourself.";
    if (!g) return "The giver isn't in the room.";
    if (g.inventoryLocked) return (g.name || "The giver") + "'s inventory is locked.";
    if (b.inventoryLocked) return (b.name || "The receiver") + "'s inventory is locked.";
    var qty = num(r.qty, 1);
    if (r.give === "item") {
      var it = (g.items || []).filter(function (x) { return x && x.uid === r.uid; })[0];
      if (!it) return "The item is gone from " + (g.name || "the giver") + "'s sheet.";
      if (it.dmOnly) return it.name + " is DM-only.";
      if (it.equipSlot) return it.name + " is still worn.";
      if (num(it.count == null ? 1 : it.count, 1) < qty) return "Not enough " + it.name + " left.";
      var iss = r.item && r.item.slotState;
      if (iss && iss.slotKind === "gun" && iss.sig != null) {
        var gcur = (g.guns || []).filter(function (x) { return x && x.weapon === (it.weaponId || it.catalogId); })[0];
        if (gcur && gunSig(gcur) !== iss.sig) return it.name + " changed after the offer (fired, reloaded or cleaned). Offer it again.";
      }
    } else if (r.give === "ammo") {
      var p = (g.ammo || []).filter(function (x) { return sameAmmo(x, r.ammo); })[0];
      if (!p || num(p.count) < qty) return "Not enough " + ammoLabel(r.ammo) + " left.";
    } else if (r.give === "es") {
      if (num(g.es) < qty) return "Not enough ES.";
    } else if (r.give === "slot") {
      var S = r.slot || {};
      var list = S.slotKind === "melee" ? (g.melee || []) : (g.guns || []);
      var cur = list.filter(function (x) { return x && num(x.index, -1) === num(S.index, -2) && x.weapon === S.weapon; })[0];
      if (!cur) return (S.name || "That weapon") + " isn't in " + (g.name || "the giver") + "'s slot any more.";
      if (cur.dmOnly || S.dmOnly) return (S.name || "That weapon") + " is DM-only.";
      if (cur.pendingD4) return (S.name || "The gun") + " is mid-misfire (d4 pending).";
      if (S.slotKind !== "melee" && S.sig != null && gunSig(cur) !== S.sig) return (S.name || "The gun") + " changed after the offer (fired, reloaded or cleaned). Offer it again.";
    } else return "Unknown give.";
    return "";
  }
  function nameOf(players, uid, fallback) {
    var s = players && players[uid] && players[uid].snapshot;
    return (s && (s.name || s.player)) || fallback || "Someone";
  }
  function ledgerRow(r, players, st, reason) {
    var fromName = nameOf(players, r.from, r.fromName);
    var toName = nameOf(players, r.targetId, r.toName);
    var o = { kind: r.give, qty: r.qty, item: r.item, ammo: r.ammo, slot: r.slot };
    var now = new Date().toISOString();
    var row = {
      id: r.xferId, xferId: r.xferId, ts: r.ts || now, type: "transfer", via: "give", state: st,
      who: fromName, playerId: r.from, characterName: fromName, fromPlayer: r.from, toPlayer: r.targetId, fromName: fromName, toName: toName,
      give: r.give, qty: num(r.qty, 1), what: line(fromName, toName, o), oldVal: null, newVal: st, flag: false,
      legs: { badd: { to: r.targetId, grantId: "xfer:" + r.xferId + ":badd", acked: false }, arem: { to: r.from, grantId: "xfer:" + r.xferId + ":arem", acked: false } },
      createdAt: now, updatedAt: now, undoOf: null
    };
    if (r.item) { row.item = r.item; row.uid = r.uid || ""; }
    if (r.ammo) row.ammo = r.ammo;
    if (r.slot) row.slot = r.slot;
    if (reason) row.reason = reason;
    return row;
  }
  /* one transfer: r = its request row, L = its ledger row read fresh (or null), req = all request rows */
  function step(r, L, req, players) {
    var id = r.xferId, acts = [];
    var got = function (s, uid) { var row = req[rowKey(id, s, uid)]; return row && row.from === uid ? row : null; };
    var cancelled = got("cancel", r.from);
    var set = function (st, extra) { acts.push({ op: "state", id: id, state: st, patch: Object.assign({ state: st, newVal: st, updatedAt: new Date().toISOString() }, extra || {}) }); };
    if (!L) {
      if (cancelled) { acts.push({ op: "create", id: id, row: ledgerRow(r, players, "cancelled", "Cancelled before the DM saw it.") }); return acts; }
      var why = validate(r, players);
      acts.push({ op: "create", id: id, row: ledgerRow(r, players, why ? "rejected" : "offered", why) });
      if (!why) acts.push({ op: "announce", id: id, to: r.targetId });
      return acts;
    }
    var st = L.state;
    if (terminal(st)) return acts;
    if (st === "offered") {
      if (cancelled) { set("cancelled", { reason: "Cancelled by " + (L.fromName || "the giver") + "." }); return acts; }
      var reply = got("reply", r.targetId);
      if (reply && reply.answer === "accept") {
        var why2 = validate(r, players);
        if (why2) set("rejected", { reason: why2 });
        else set("accepted", { acceptedAt: new Date().toISOString() });
      } else if (reply && reply.answer === "decline") set("declined", { reason: (L.toName || "They") + " declined." });
      else if (!L.announced) acts.push({ op: "announce", id: id, to: r.targetId });
    } else if (st === "accepted") {
      if (got("badd", r.targetId)) set("added", { "legs/badd/acked": true });
    } else if (st === "added") {
      if (got("arem", r.from)) { set("done", { "legs/arem/acked": true, doneAt: new Date().toISOString() }); acts.push({ op: "chat", id: id, text: L.what, fromName: L.fromName }); }
    }
    return acts;
  }
  function giveRequests(req) {
    return Object.keys(req || {}).filter(function (k) { var r = req[k]; return r && r.kind === "give" && r.xferId === k; }).map(function (k) { return req[k]; });
  }

  /* ---- sheet-side applies (pure on the character; the ES legs go through the wallet bridge outside) ---- */
  function clearWeaponSlot(c, item) {
    if (!item || item.type !== "weapon") return;
    var wid = item.weaponId || item.catalogId;
    if (!wid) return;
    var still = (c.items || []).some(function (it) { return it && it !== item && num(it.count == null ? 1 : it.count, 1) > 0 && (it.weaponId || it.catalogId) === wid; });
    if (still) return;
    (c.guns || []).forEach(function (g, i) { if (g && g.weapon === wid) c.guns[i] = { weapon: "", proficient: true, equipped: false, loaded: 0, chambers: [] }; });
    (c.melee || []).forEach(function (m, i) { if (m && m.weapon === wid) c.melee[i] = { weapon: "", proficient: true, equipped: false }; });
  }
  function takeFrom(c, uid, n) {
    var it = findItem(c, uid);
    if (!it) return 0;
    var have = num(it.count == null ? 1 : it.count, 1);
    var took = Math.min(have, n);
    if (have - took <= 0) {
      if (it.equipSlot && root.SSDNSDoll && root.SSDNSDoll.equip) { try { root.SSDNSDoll.equip(c, it.equipSlot, ""); } catch (e) {} }
      it.count = 0;
      clearWeaponSlot(c, it);
      c.items = (c.items || []).filter(function (x) { return x && x !== it; });
    } else it.count = have - took;
    return took;
  }
  /* the giver's slot empties (the index it was offered from; if the player moved it, the first slot holding it) */
  function clearSlotOut(c, S) {
    var kind = S.slotKind === "melee" ? "melee" : "gun";
    var list = kind === "melee" ? (c.melee || []) : (c.guns || []);
    var i = num(S.index, -1);
    if (!(list[i] && list[i].weapon === S.weapon)) {
      i = -1;
      for (var k = 0; k < list.length; k++) if (list[k] && list[k].weapon === S.weapon) { i = k; break; }
    }
    if (i < 0) return 0;
    list[i] = blankSlot(kind);
    return 1;
  }
  /* an inventory row parked because every slot was full: back into a free slot with its state */
  function unparkSlot(c, uid) {
    var it = findItem(c, uid);
    if (!it || !it.slotState) return { ok: false, reason: "Nothing to put in a slot." };
    var kind = it.slotState.slotKind === "melee" ? "melee" : "gun";
    var list = kind === "melee" ? (c.melee || (c.melee = [])) : (c.guns || (c.guns = []));
    var idx = -1;
    for (var i = 0; i < SLOT_MAX; i++) if (!list[i] || !list[i].weapon) { idx = i; break; }
    if (idx < 0) return { ok: false, reason: "Every " + (kind === "melee" ? "melee" : "gun") + " slot is full. Free one first." };
    while (list.length <= idx) list.push(blankSlot(kind));
    var st = clone(it.slotState.state) || {};
    st.equipped = false;
    st.weapon = st.weapon || it.weaponId || it.catalogId;
    list[idx] = Object.assign(blankSlot(kind), st);
    /* a bare-slot weapon parked by Give goes back to being slot-only; a real item row stays as the slot's row */
    if (it.parkedSlot) c.items = (c.items || []).filter(function (x) { return x && x !== it; });
    else delete it.slotState;
    return { ok: true, kind: kind, index: idx, name: it.name };
  }
  function record(c, id) { return xfers(c)[id] || null; }
  function prune(c) {
    var x = xfers(c);
    var ids = Object.keys(x);
    if (ids.length <= KEEP) return;
    ids.filter(function (k) { return terminal(x[k] && x[k].state); })
      .sort(function (a, b) { return String(x[a].ts || "").localeCompare(String(x[b].ts || "")); })
      .slice(0, ids.length - KEEP).forEach(function (k) { delete x[k]; });
  }
  /* receiver: add once. Items keep every field (weight, Dirty, uses left, arrow type, tags…) and get a uid tied to
     the transfer (x<id>) so a rollback finds them; ammo lands in its pool; ES is returned for the wallet. */
  function applyIn(c, L, Items) {
    var rec = record(c, L.id) || (xfers(c)[L.id] = { id: L.id, role: "to", ts: L.ts, kind: L.give, qty: L.qty, other: L.fromPlayer, otherName: L.fromName, what: L.what, applied: {} });
    rec.applied = rec.applied || {};
    if (rec.applied.badd) return { ok: true, already: true, rec: rec };
    var n = num(L.qty, 1), res = { ok: true, rec: rec };
    if (L.give === "item") {
      var snap = clone(L.item) || {};
      STRIP.forEach(function (k) { delete snap[k]; });
      snap.uid = "x" + L.id;
      snap.count = n;
      var carry = snap.slotState || null;
      delete snap.slotState;
      if (carry) delete carry.sig;
      /* a weapon with every matching slot full stays an inventory row (keeping its slot state), instead of
         landing on top of slot 1 */
      var park = snap.type === "weapon" && freeSlot(c, landKind(snap.weaponId || snap.catalogId)) < 0;
      if (!park) delete snap.parkedSlot;
      var added = Items && Items.add ? Items.add(c, snap, { dm: true, noLand: park }) : null;
      if (!added || !added.ok) return { ok: false, reason: (added && added.reason) || "Couldn't add it." };
      var it = added.item || {};
      /* custom fields items.js doesn't know about ride along too (never over what add() set) */
      if (!added.merged && added.item) Object.keys(snap).forEach(function (k) { if (it[k] === undefined && k !== "slotState") it[k] = clone(snap[k]); });
      if (park && carry && added.item) it.slotState = carry;
      if (park) res.parked = true;
      var ld = added.landed;
      if (!park && carry && ld && ld.index != null) {
        var lk = ld.melee ? "melee" : "gun";
        var lst = slotList(c, lk)[ld.index];
        if (lst && lst.weapon) {
          var keep = { weapon: lst.weapon, equipped: lst.equipped };
          Object.keys(carry.state || {}).forEach(function (k) { lst[k] = clone(carry.state[k]); });
          lst.weapon = keep.weapon; lst.equipped = keep.equipped;
        }
      }
      if (it.attune) it.attuned = false;
      if (it.summoned) it.summoned = false; /* #105 + #109: a given Saddle of the Phantom Steed arrives with no horse out */
      rec.applied.badd = { ts: Date.now(), uid: it.uid || "", merged: !!added.merged, pool: added.pool ? { type: added.pool.type, caliber: added.pool.caliber || "" } : null, rounds: added.rounds || 0 };
    } else if (L.give === "ammo") {
      c.ammo = Array.isArray(c.ammo) ? c.ammo : [];
      var p = pool(c, L.ammo);
      if (!p) { p = { type: L.ammo.type, caliber: L.ammo.caliber || "", count: 0 }; c.ammo.push(p); }
      p.count = num(p.count) + n;
      rec.applied.badd = { ts: Date.now() };
    } else if (L.give === "es") {
      rec.applied.badd = { ts: Date.now() };
      res.es = n;
    } else if (L.give === "slot") {
      var S = L.slot || {};
      var kind = S.slotKind === "melee" ? "melee" : "gun";
      if (S.record && root.SSDNSCustomWeapons && root.SSDNSCustomWeapons.register) { try { root.SSDNSCustomWeapons.register(clone(S.record)); } catch (e) {} }
      var st = clone(S.state) || {};
      SLOT_STRIP.forEach(function (k) { delete st[k]; });
      st.weapon = S.weapon;
      st.equipped = false;
      st.gotBy = L.id;
      if (S.record) st.record = clone(S.record);
      var list = kind === "melee" ? (c.melee || (c.melee = [])) : (c.guns || (c.guns = []));
      var idx = -1;
      for (var i = 0; i < Math.max(list.length, SLOT_MAX) && i < SLOT_MAX; i++) if (!list[i] || !list[i].weapon) { idx = i; break; }
      if (idx >= 0) {
        while (list.length <= idx) list.push(blankSlot(kind));
        list[idx] = Object.assign(blankSlot(kind), st);
        if (root.SSDNSEquip && root.SSDNSEquip.tryAutoEquip) { try { root.SSDNSEquip.tryAutoEquip(c, { kind: kind, index: idx }); } catch (e) {} }
        rec.applied.badd = { ts: Date.now(), slotKind: kind, index: idx };
        res.slot = { kind: kind, index: idx };
      } else {
        /* every slot is full: an inventory row that keeps the whole slot ("To a slot" puts it back later) */
        var row = { uid: "x" + L.id, name: S.name || S.weapon, type: "weapon", weaponId: S.weapon, count: 1, dirty: !!st.dirty, parkedSlot: true, slotState: { slotKind: kind, state: st } };
        var w = weaponRec(S.weapon) || S.record;
        var lb = w && parseFloat(String(w.weight || ""));
        if (isFinite(lb) && lb > 0) row.weight = lb;
        var addedRow = Items && Items.add ? Items.add(c, row, { dm: true, noLand: true }) : null;
        if (!addedRow || !addedRow.ok) return { ok: false, reason: (addedRow && addedRow.reason) || "Couldn't add it." };
        if (addedRow.item) { addedRow.item.parkedSlot = true; addedRow.item.slotState = row.slotState; if (!addedRow.item.weaponId) addedRow.item.weaponId = S.weapon; }
        rec.applied.badd = { ts: Date.now(), uid: (addedRow.item && addedRow.item.uid) || row.uid };
        res.parked = true;
      }
    }
    rec.state = L.state;
    prune(c);
    return res;
  }
  function rollbackIn(c, L) {
    var rec = record(c, L.id);
    if (!rec || !rec.applied || !rec.applied.badd || rec.applied.bundo) return { ok: false };
    var n = num(L.qty, 1), b = rec.applied.badd, res = { ok: true };
    if (L.give === "item") {
      if (b.pool) { var bp = pool(c, b.pool); if (bp) bp.count = Math.max(0, num(bp.count) - num(b.rounds, n)); }
      else takeFrom(c, b.uid, n);
    } else if (L.give === "ammo") { var p = pool(c, L.ammo); if (p) p.count = Math.max(0, num(p.count) - n); }
    else if (L.give === "es") res.es = -n;
    else if (L.give === "slot") {
      if (b.slotKind) {
        var list = b.slotKind === "melee" ? (c.melee || []) : (c.guns || []);
        if (list[b.index] && list[b.index].gotBy === L.id) list[b.index] = blankSlot(b.slotKind);
      } else if (b.uid) takeFrom(c, b.uid, 1);
    }
    rec.applied.bundo = { ts: Date.now() };
    return res;
  }
  /* giver: remove once, only after the receiver applied (state added). */
  function applyOut(c, L) {
    var rec = record(c, L.id);
    if (!rec) rec = xfers(c)[L.id] = { id: L.id, role: "from", ts: L.ts, kind: L.give, qty: L.qty, uid: L.uid, ammo: L.ammo, other: L.toPlayer, otherName: L.toName, what: L.what, applied: {} };
    rec.applied = rec.applied || {};
    if (rec.applied.arem) return { ok: true, already: true, rec: rec };
    var n = num(L.qty, 1), res = { ok: true, rec: rec };
    if (L.give === "item") res.took = takeFrom(c, rec.uid || L.uid, n);
    else if (L.give === "ammo") { var p = pool(c, L.ammo); var t = p ? Math.min(num(p.count), n) : 0; if (p) p.count = num(p.count) - t; res.took = t; }
    else if (L.give === "es") res.es = -n;
    else if (L.give === "slot") res.took = clearSlotOut(c, L.slot || {});
    if (res.took != null && res.took < n) res.short = n - res.took;
    rec.applied.arem = { ts: Date.now(), took: res.took };
    rec.state = L.state;
    return res;
  }
  /* what a sheet should do when it sees ledger row L for one of its transfers */
  function sheetPlan(c, L, me) {
    var plan = [];
    if (!L || !L.id) return plan;
    var rec = record(c, L.id);
    if (L.toPlayer === me) {
      var a = rec && rec.applied || {};
      if (L.state === "offered" && !(rec && rec.answered)) plan.push("prompt");
      if (L.state !== "offered") plan.push("closePrompt");
      if (L.state === "accepted" || L.state === "added" || L.state === "done") {
        if (!a.badd) plan.push("applyIn");
        if (L.state === "accepted") plan.push("ackIn");
      }
      if ((L.state === "cancelled" || L.state === "rejected") && a.badd && !a.bundo) plan.push("rollbackIn");
    }
    if (L.fromPlayer === me) {
      var b = rec && rec.applied || {};
      if ((L.state === "added" || L.state === "done") && !b.arem) plan.push("applyOut");
      if (L.state === "added") plan.push("ackOut");
    }
    return plan;
  }

  var api = {
    VERSION: "0.3.86",
    TERMINAL: TERMINAL, RANK: RANK,
    newId: newId, rowKey: rowKey, terminal: terminal,
    snapshotItem: snapshotItem, snapshotSlot: snapshotSlot, slotAt: slotAt, heldSlot: heldSlot, backingItem: backingItem, gunSig: gunSig,
    weaponRec: weaponRec, landKind: landKind, freeSlot: freeSlot, unparkSlot: unparkSlot, clearSlotOut: clearSlotOut, SLOT_STRIP: SLOT_STRIP,
    describe: describe, line: line, weightOf: weightOf, ammoLabel: ammoLabel,
    xfers: xfers, outgoing: outgoing, held: held, heldItem: heldItem, available: available, canOffer: canOffer, requestRow: requestRow,
    validate: validate, ledgerRow: ledgerRow, step: step, giveRequests: giveRequests,
    applyIn: applyIn, applyOut: applyOut, rollbackIn: rollbackIn, sheetPlan: sheetPlan, takeFrom: takeFrom
  };
  root.SSDNSGive = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);

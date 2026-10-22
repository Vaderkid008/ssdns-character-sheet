/**
 * Turn order PR 1 (T2 + T6, Jessey's rulings 2026-10-21 9:07 PM CT). One set of turn rules shared by the sheet,
 * the DMCC and the map, so every surface answers "whose turn is it" and "is this out of turn" the same way.
 *
 * Shared turn state lives on the room's table/initiative (DM-written, as before), with three new fields:
 *   seq         a counter the DM's Next bumps by one each turn (Undo puts the old value back)
 *   turnStarts  { combatantId: seq } the seq at which each combatant's latest own turn began
 *   undo        a short newest-first list of earlier { round, turn, started, seq, turnStarts } for "Undo last Next"
 * A player's Action / Bonus / Reaction markers live on rooms/{code}/players/{uid}/turnMarkers (the player's own row,
 * already writable by that player) and carry the key of the turn they belong to. Markers come back only when that
 * combatant's OWN turn starts (reaction too, ruling 5). Undo restores the earlier seq / turnStarts, so the same
 * combatant's key repeats after Undo + Next and nobody gets a second fresh set (ruling 3).
 * Old rooms with no seq / turnStarts fall back to "round:turn" of the combatant's own current turn.
 */
(function (root) {
  "use strict";
  var UNDO_MAX = 5;
  function num(v, d) { var n = parseInt(v, 10); return isFinite(n) ? n : d; }
  function order(init) { return (init && Array.isArray(init.order)) ? init.order : []; }
  /** The combatant whose turn it is, or null before the fight starts / with no order. */
  function current(init) {
    var list = order(init);
    if (!init || !init.started || !list.length) return null;
    var t = num(init.turn, 0);
    if (t < 0 || t >= list.length) t = 0;
    return list[t] || null;
  }
  function rowKey(row) { return String((row && (row.id || row.playerId)) || ""); }
  /** The row for a player uid (or, offline, a player row by name). */
  function rowFor(init, uid, name) {
    var list = order(init);
    var i;
    if (uid) for (i = 0; i < list.length; i++) if (list[i] && list[i].kind === "player" && list[i].playerId === uid) return list[i];
    if (name) for (i = 0; i < list.length; i++) if (list[i] && list[i].kind === "player" && !list[i].playerId && list[i].name === name) return list[i];
    return null;
  }
  function isTurnOf(init, row) {
    var cur = current(init);
    if (!cur || !row) return false;
    if (cur === row) return true;
    if (cur.id && row.id) return cur.id === row.id;
    return !!(cur.playerId && cur.playerId === row.playerId);
  }
  /** Key of the combatant's latest own-turn start; "" when it has had no turn yet. */
  function keyFor(init, row) {
    if (!init || !row) return "";
    var id = rowKey(row);
    var starts = init.turnStarts;
    if (starts && typeof starts === "object" && id && starts[id] != null && starts[id] !== "") return "s" + starts[id];
    if (isTurnOf(init, row) && !(starts && typeof starts === "object" && init.seq != null)) return "r" + num(init.round, 1) + ":" + num(init.turn, 0);
    return "";
  }
  /* turn order PR 2: movement used this turn (feet), Dash / Disengage / Dodge, the opportunity-attack window and
     the turn a death save was rolled ride on the same markers, so they also come back only on your own turn */
  function fresh(key) {
    return { action: false, bonus: false, reaction: false, attacks: 0, actionBy: "", turnKey: key || "",
      moveUsed: 0, dash: false, disengage: false, dodge: false, oaReq: "", oaArmed: "", oaUsed: "", deathKey: "" };
  }
  /**
   * Markers for a combatant right now. A stored set is kept unless the combatant has started a newer own turn.
   * Returns { markers, reset } where reset says a new own turn began since the stored set.
   */
  function markersFor(stored, init, row) {
    var key = keyFor(init, row);
    var have = stored && typeof stored === "object" ? stored : null;
    if (!key) return { markers: have ? Object.assign(fresh(""), have) : fresh(""), reset: false };
    if (have && String(have.turnKey || "") === key) return { markers: Object.assign(fresh(key), have), reset: false };
    /* a new own turn only when it is that combatant's turn now: an older stored key off-turn (e.g. after an Undo
       that rolled turnStarts back) keeps the stored set rather than handing out fresh markers */
    if (!isTurnOf(init, row)) return { markers: have ? Object.assign(fresh(""), have) : fresh(key), reset: false };
    return { markers: fresh(key), reset: true };
  }
  /** Turn-state part of an initiative object, for Undo. */
  function snapshot(st) {
    return {
      round: num(st && st.round, 1), turn: num(st && st.turn, 0), started: !!(st && st.started),
      seq: num(st && st.seq, 0), turnStarts: Object.assign({}, (st && st.turnStarts) || {})
    };
  }
  /** Call after the DM's Next has moved st.turn: stamps the new current combatant's turn start. */
  function beginTurn(st, before) {
    if (!st) return st;
    st.undo = [snapshot(before || {})].concat(Array.isArray(st.undo) ? st.undo : []).slice(0, UNDO_MAX);
    st.seq = num(before && before.seq, num(st.seq, 0)) + 1;
    st.turnStarts = Object.assign({}, (before && before.turnStarts) || st.turnStarts || {});
    var cur = current(st);
    if (cur && rowKey(cur)) st.turnStarts[rowKey(cur)] = st.seq;
    return st;
  }
  /** Undo the last Next: puts round / turn / started / seq / turnStarts back. Returns the restored snapshot or null. */
  function undoNext(st) {
    if (!st || !Array.isArray(st.undo) || !st.undo.length) return null;
    var snap = st.undo[0];
    st.undo = st.undo.slice(1);
    st.round = num(snap.round, 1);
    st.turn = num(snap.turn, 0);
    st.started = !!snap.started;
    st.seq = num(snap.seq, 0);
    st.turnStarts = Object.assign({}, snap.turnStarts || {});
    return snap;
  }
  function canUndo(st) { return !!(st && Array.isArray(st.undo) && st.undo.length); }
  function clearTurnState(st) { if (st) { st.seq = 0; st.turnStarts = {}; st.undo = []; st.markers = {}; st.unlock = {}; st.oa = {}; } return st; }
  /** Ruling 2: the DM's Next works any time; a player's End Turn only on their own turn. */
  function canEndTurn(init, uid) {
    var cur = current(init);
    return !!(uid && cur && cur.kind === "player" && cur.playerId === uid);
  }
  /**
   * T6: one out-of-turn rule for the DMCC badge and its Apply check (ruling 10: enemy turns don't warn the DM).
   * roll: { playerId, uid, outOfTurn }. ctx: { init | started + current, dmUid }.
   * Out of turn = the fight has started, the roll came from a player (not the DM), and the current combatant is not
   * that player's row; this includes enemy and NPC turns. DM rolls (enemies, Act for player) are never out of turn.
   */
  function outOfTurn(roll, ctx) {
    ctx = ctx || {};
    if (!roll) return false;
    var started = ctx.init ? !!ctx.init.started : !!ctx.started;
    if (!started) return false;
    /* PR 2 (item 4): an opportunity attack the DM approved is never out of turn */
    if (roll.oa && oaApproved(ctx.init || { oa: ctx.oa }, roll.oa)) return false;
    if (roll.outOfTurn) return true;
    if (!roll.playerId) return false;
    if (ctx.dmUid && roll.uid && roll.uid === ctx.dmUid) return false;
    var cur = ctx.init ? current(ctx.init) : (ctx.current || null);
    if (!cur) return false;
    if (cur.kind === "player" && (cur.playerId || cur.id) === roll.playerId) return false;
    return true;
  }
  /* ---- Turn order PR 2 (Jessey's rulings 2026-10-21 / 2026-10-22 4:32 AM CT) ----
   * init.unlock { uid: seq }  the DM's override: that player's buttons are open for the turn that has this seq
   *                           (the DM's next Next closes it again). Old rooms with no seq: true = open.
   * init.oa { reqId: { from, name, target, status: "ask" | "approved" | "denied", seq, ts } }  opportunity attacks
   *                           the DM approves or denies (item 4). Other reactions need no approval.
   * Both are new fields on table/initiative (DM-written, readable by everyone in the room), no rules change. */
  function unlocked(init, uid) {
    if (!init || !uid || !init.unlock || typeof init.unlock !== "object") return false;
    var v = init.unlock[uid];
    if (v == null || v === false || v === "") return false;
    if (v === true) return init.seq == null;
    return num(v, -1) === num(init.seq, 0);
  }
  function inFight(init) { return !!(init && init.started && order(init).length); }
  /**
   * Item 1: is this player locked out of turn right now? True only during initiative, when the player has a row in
   * the order, it isn't that row's turn, and the DM hasn't unlocked them. A player with no row is never locked.
   */
  function lockedFor(init, uid, name) {
    if (!inFight(init)) return false;
    var row = rowFor(init, uid, name);
    if (!row) return false;
    if (isTurnOf(init, row)) return false;
    return !unlocked(init, uid);
  }
  /** Item 5: a player may drag their token outside combat, on their own turn, or while the DM has unlocked them. */
  function canMoveToken(init, uid, name) { return !lockedFor(init, uid, name); }
  function oaEntry(init, id) { return (init && init.oa && typeof init.oa === "object" && id && init.oa[id]) || null; }
  function oaApproved(init, id) { var e = oaEntry(init, id); return !!(e && e.status === "approved"); }
  /** Movement left this turn: speed (feet), doubled by Dash, minus what was used. */
  function moveLeft(markers, speed) {
    var sp = Math.max(0, num(speed, 30));
    var m = markers || {};
    var max = m.dash ? sp * 2 : sp;
    return { max: max, used: Math.max(0, num(m.moveUsed, 0)), left: Math.max(0, max - Math.max(0, num(m.moveUsed, 0))) };
  }
  /** Prune OA entries older than a few turns so table/initiative stays small. */
  function pruneOa(st, keep) {
    if (!st || !st.oa || typeof st.oa !== "object") return st;
    var now = num(st.seq, 0), k = keep == null ? 6 : keep;
    Object.keys(st.oa).forEach(function (id) { var e = st.oa[id]; if (!e || now - num(e.seq, now) > k) delete st.oa[id]; });
    return st;
  }
  root.SSDNSTurn = {
    unlocked: unlocked, inFight: inFight, lockedFor: lockedFor, canMoveToken: canMoveToken, oaEntry: oaEntry, oaApproved: oaApproved,
    moveLeft: moveLeft, pruneOa: pruneOa,
    UNDO_MAX: UNDO_MAX, current: current, rowFor: rowFor, isTurnOf: isTurnOf, keyFor: keyFor, fresh: fresh, markersFor: markersFor,
    snapshot: snapshot, beginTurn: beginTurn, undoNext: undoNext, canUndo: canUndo, clearTurnState: clearTurnState,
    canEndTurn: canEndTurn, outOfTurn: outOfTurn
  };
})(typeof window !== "undefined" ? window : this);

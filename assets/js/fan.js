/**
 * Pistolero: Fan the Hammer, sheet 0.3.73 (Jessey 2026-10-19, design pick 7:41 PM CT).
 * PHB (BOOK1.md, Feats › Pistolero, Crossbow Expert house rule; pistols only: Herringers, the Ball n Cap, the ChaosMaker):
 *   "Fan the Hammer. When you take the Attack action and attack with a pistol, you can use a bonus action to make one
 *    more attack, either with that pistol (if it has a round left) or with a second pistol you're holding."
 *   "Fan the Hammer uses your bonus action, so you can't use Tactical Reload on a turn you fan the hammer."
 *  - A 'Fan' button on each pistol card (sheet, map Fight card, DM map drawer toggle, DMCC detail checkbox).
 *  - Lit only after the Attack action AND a pistol attack this turn. Spends the Bonus pip and rolls through the normal
 *    gun path (target picker incl. Free shot, range, adv/dis, misfire, ammo, Steady Grip, Dead Eye). The ability
 *    modifier IS added (Crossbow Expert-style bonus attack, not two-weapon fighting).
 *  - Locks Tactical Reload for the rest of the turn. Fan and the off-hand attack share the one bonus action.
 *  - Sound: the "fan-the-hammer" event in assets/sfx/sfx.json is the override hook. With no file mapped there,
 *    the gun's own shot plays as a quick double-tap.
 */
(function (root) {
  "use strict";
  var TAG = "fan the hammer";
  var CUE = "fan-the-hammer";
  var DOUBLE_TAP_MS = 110;
  var TR_MSG = "Fan the Hammer used your bonus action: no Tactical Reload this turn.";
  var turn = { pistol: false, fan: false, offhand: false };
  function C() { try { var d = root.SSDNSApp && root.SSDNSApp.doc && root.SSDNSApp.doc(); return d && d.character; } catch (e) { return null; } }
  function pips() { var P = root.SSDNSActionPips; return P && P.state ? P.state() : null; }
  /* a fresh turn (or a pip reset) clears the turn record */
  function sync() {
    var s = pips();
    if (s && !s.action && !s.bonus) { turn.pistol = false; turn.fan = false; turn.offhand = false; }
  }
  try { if (root.addEventListener) root.addEventListener("ssdns:pips-reset", function () { turn.pistol = false; turn.fan = false; turn.offhand = false; }); } catch (e) {}
  function hasPistolero(c) { return !!(c && Array.isArray(c.feats) && c.feats.indexOf("pistolero") >= 0); }
  function weaponOf(c, i) {
    var g = c && c.guns && c.guns[i];
    if (!g || !g.weapon) return null;
    var v = null;
    try { v = root.SSDNSApp && root.SSDNSApp.compute ? root.SSDNSApp.compute() : null; } catch (e) { v = null; }
    var st = v && v.guns && v.guns[i];
    if (st && st.w && st.w.id === g.weapon) return st.w;
    var R = root.SSDNS_RULES || {};
    var list = [].concat(R.firearms || []);
    for (var k = 0; k < list.length; k++) if (list[k] && list[k].id === g.weapon) return list[k];
    return null;
  }
  /* pistols only: no shotguns, carbines, rifles, bows or Caster Guns */
  function isPistol(w) { return !!w && w.group === "pistol" && !w.hexShells && w.id !== "borrowed-iron"; }
  function loaded(g) {
    var A = root.SSDNSApplied;
    if (A && A.gunEmpty) return !A.gunEmpty(g);
    return Number(g && g.loaded) > 0;
  }
  /** Fan state for pistol slot i: show (Pistolero + held pistol), ok (lit), reason (why not). */
  function status(i, c) {
    sync();
    c = c || C();
    var g = c && c.guns && c.guns[i];
    var w = weaponOf(c, i);
    var show = hasPistolero(c) && !!g && g.equipped !== false && isPistol(w);
    if (!show) return { show: false, ok: false, reason: hasPistolero(c) ? "Fan the Hammer works with pistols only." : "Fan the Hammer needs the Pistolero feat." };
    var s = pips();
    var reason = "";
    if (s && s.actionBy !== "attack") reason = "Fan the Hammer: take the Attack action and attack with a pistol first.";
    else if (!turn.pistol) reason = "Fan the Hammer: attack with a pistol first this turn.";
    else if (turn.offhand) reason = "Your bonus action went to the off-hand attack this turn.";
    else if (turn.fan) reason = "You already fanned the hammer this turn.";
    else if (s && s.bonus) reason = "Your bonus action is already used this turn.";
    else if (!loaded(g)) reason = "No round left in this pistol.";
    return { show: true, ok: !reason, reason: reason };
  }
  function log(text) { if (root.SSDNSSheet && root.SSDNSSheet.addLog) root.SSDNSSheet.addLog({ kind: "alert", text: text }); }
  /** opts.dm: the DM is acting for the player, so the turn checks are overridden (and logged). */
  function gate(i, name, opts) {
    opts = opts || {};
    var st = status(i);
    if (st.ok) return { ok: true };
    if (opts.dm && st.show !== false) { log("DM override: " + (name || "Pistol") + " fan the hammer (" + st.reason.replace(/^Fan the Hammer: /, "") + ")"); return { ok: true, override: true }; }
    if (opts.dm) { log("DM override: " + st.reason); return { ok: true, override: true }; }
    if (root.SSDNSToast) root.SSDNSToast(st.reason);
    log(st.reason);
    return { ok: false, reason: st.reason };
  }
  function spend(name) {
    sync();
    turn.fan = true;
    var P = root.SSDNSActionPips;
    var out = P && P.spend ? P.spend("bonus", (name || "Pistol") + " fan the hammer") : null;
    paint();
    return out;
  }
  function notePistolAttack() { turn.pistol = true; setTimeout(paint, 0); }
  function noteOffhand() { sync(); turn.offhand = true; setTimeout(paint, 0); }
  function usedThisTurn() { sync(); return turn.fan; }
  function trLocked() { sync(); return turn.fan; }
  /** Sound: the "fan-the-hammer" event if Jessey mapped a file, else the gun's shot as a quick double-tap. */
  function hasFanFile() {
    var A = root.SSDNSAudio;
    var files = A && A.poolFiles ? A.poolFiles(CUE) : null;
    return !!(files && files.length);
  }
  function cue(base, playFn) {
    playFn = playFn || function (n) { if (root.SSDNSAudio) root.SSDNSAudio.play(n); };
    if (hasFanFile()) { playFn(CUE); return CUE; }
    playFn(base);
    setTimeout(function () { playFn(base); }, DOUBLE_TAP_MS);
    return base + "×2";
  }
  function fire(i, opts) {
    opts = opts || {};
    if (!root.SSDNSGunRoll) return false;
    root.SSDNSGunRoll._fan = true;
    try { root.SSDNSGunRoll(Number(i), opts.chamber); }
    finally { root.SSDNSGunRoll._fan = null; }
    return true;
  }
  function parseId(id) {
    var m = String(id || "").match(/^fan:gun:(\d+)$/);
    return m ? Number(m[1]) : null;
  }
  /* ---- sheet: a Fan button on each pistol card, and the Tactical Reload lock ---- */
  function paint() {
    if (typeof document === "undefined") return;
    var c = C();
    if (!c) return;
    (c.guns || []).forEach(function (g, i) {
      var tr = document.querySelector('[data-tr="' + i + '"]');
      var btn = document.querySelector('[data-fan="' + i + '"]');
      if (!btn && tr && tr.parentNode) {
        btn = document.createElement("button");
        btn.type = "button";
        btn.className = "btn sm fan";
        btn.setAttribute("data-fan", String(i));
        btn.setAttribute("data-cost", "Bonus");
        btn.textContent = "Fan";
        tr.parentNode.insertBefore(btn, tr.nextSibling);
      }
      if (btn) {
        var st = status(i, c);
        btn.hidden = !st.show;
        btn.disabled = !st.ok;
        btn.classList.toggle("lit", !!st.ok);
        btn.title = st.ok ? "Fan the Hammer (bonus action): one more attack with this pistol. Adds your ability modifier. No Tactical Reload this turn." : st.reason;
      }
      if (tr) {
        var locked = trLocked();
        tr.classList.toggle("tr-locked", locked);
        if (locked) tr.title = TR_MSG;
      }
    });
  }
  if (typeof document !== "undefined") {
    document.addEventListener("click", function (e) {
      var b = e.target && e.target.closest && e.target.closest("[data-fan]");
      if (!b) return;
      e.preventDefault();
      fire(Number(b.getAttribute("data-fan")));
    });
    var tick = function () { try { paint(); } catch (e) {} };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", tick); else tick();
    document.addEventListener("click", function () { setTimeout(tick, 50); }, true);
    document.addEventListener("change", function () { setTimeout(tick, 0); }, true);
    setInterval(tick, 1500);
  }
  root.SSDNSFan = {
    TAG: TAG, CUE: CUE, TR_MSG: TR_MSG, DOUBLE_TAP_MS: DOUBLE_TAP_MS,
    status: status, gate: gate, spend: spend, fire: fire, parseId: parseId, paint: paint,
    notePistolAttack: notePistolAttack, noteOffhand: noteOffhand, usedThisTurn: usedThisTurn, trLocked: trLocked,
    hasPistolero: hasPistolero, isPistol: isPistol, cue: cue, hasFanFile: hasFanFile,
    _turn: function () { sync(); return { pistol: turn.pistol, fan: turn.fan, offhand: turn.offhand }; }
  };
})(typeof window !== "undefined" ? window : this);

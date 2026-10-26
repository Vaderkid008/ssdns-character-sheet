/**
 * Turn order PR 2 (Jessey's rulings 2026-10-21 and 2026-10-22 4:32 AM CT), the sheet side. Builds on PR 1's shared
 * turn state (turn-rules.js) and the markers in action-pips.js.
 *   1 Off-turn lock: during initiative, a player's attack, spell and action buttons are greyed out off their turn.
 *     The DM's "Unlock this turn" (DMCC) opens them until the DM's next Next. Off-turn still allowed: a reaction
 *     spell while the Reaction is unused, an approved opportunity attack, chat, notes, checks, saves, HP, viewing.
 *   2 Movement tracker: feet left this turn with − / +, refilled from Speed at the start of your own turn.
 *   3 Dash / Disengage / Dodge: each uses the Action; Dash doubles this turn's movement.
 *   4 Opportunity attack: off your turn, ask the DM; once approved, one attack uses your Reaction instead of the Action.
 *   6 Mercy Hands and death saves follow the turn rules; a death save rolls by itself at the start of your own turn.
 * Nothing here writes anything new to Firebase: the markers ride on players/{uid}/turnMarkers (PR 1) and the OA ask
 * is an encounter/requests row (like End turn).
 */
(function (root) {
  "use strict";
  var ATTACK = "button[data-fire], button[data-gunroll], button[data-gunmelee], button[data-melee-roll], button[data-trk-throw], button[data-trk-shoot]";
  var EXTRA_ATTACK = "button[data-fan], #btnOffhand";
  var SPELL = "button[data-cast], button[data-spell-cast], #btnHexRoll, #btnPactShot";
  var GEAR = "button[data-reload], button[data-unload], button[data-tr], button[data-clean], button[data-unjam], button[data-reopen], button[data-item-use]";
  var OTHER = "#btnTakeCover, #btnMercy, #btnDeathSave, #btnRage, button[data-tl-move], button[data-tl-movemode], button[data-tl-act]";
  var ALL = [ATTACK, EXTRA_ATTACK, SPELL, GEAR, OTHER].join(", ");
  var NOT_TURN = "It isn't your turn. This unlocks on your turn (or when the DM unlocks it).";

  function P() { return root.SSDNSActionPips; }
  function T() { return root.SSDNSTurn; }
  function init() { var p = P(); return p && p.lastInit ? p.lastInit() : null; }
  function uid() { return (root.SSDNSDmJoin && root.SSDNSDmJoin.uid && root.SSDNSDmJoin.uid()) || ""; }
  function ch() { try { var d = root.SSDNSApp && root.SSDNSApp.doc && root.SSDNSApp.doc(); return d && d.character; } catch (e) { return null; } }
  function myName() { var c = ch(); return (c && c.name) || ""; }
  function toast(m) { if (root.SSDNSToast) root.SSDNSToast(m); }
  function log(m, kind) { if (root.SSDNSSheet && root.SSDNSSheet.addLog) root.SSDNSSheet.addLog({ kind: kind || "note", text: m }); }
  function marks() { var p = P(); return p && p.state ? p.state() : {}; }
  function num(v, d) { var n = parseInt(v, 10); return isFinite(n) ? n : d; }

  /** In this fight with a row of my own? */
  function inFight() { var t = T(), i = init(); return !!(t && i && t.inFight(i) && t.rowFor(i, uid(), myName())); }
  function myTurn() { var t = T(), i = init(); if (!inFight()) return false; return t.isTurnOf(i, t.rowFor(i, uid(), myName())); }
  function locked() { var t = T(), i = init(); return !!(t && i && t.lockedFor(i, uid(), myName())); }
  function unlockedByDm() { var t = T(), i = init(); return !!(t && i && inFight() && !myTurn() && t.unlocked(i, uid())); }
  /* Speed as the DM sees it (conditions such as Grappled count, same as the room snapshot) */
  function speed() {
    var c = ch();
    var raw = c && root.SSDNSCondFx && root.SSDNSCondFx.speed ? root.SSDNSCondFx.speed(c) : (c && c.speed);
    var s = num(raw, NaN);
    return isFinite(s) && s >= 0 ? s : 30;
  }

  function spellNameOf(btn) {
    if (btn.hasAttribute("data-spell-cast")) { var raw = btn.getAttribute("data-spell-cast") || ""; return raw.slice(raw.indexOf(":") + 1); }
    if (btn.hasAttribute("data-cast")) {
      var sel = document.querySelector('[data-castspell="' + btn.getAttribute("data-cast") + '"]');
      var opt = sel && sel.selectedOptions && sel.selectedOptions[0];
      return (opt && (opt.value || opt.textContent)) || "";
    }
    return "";
  }
  function deathRolledNow() {
    var m = marks();
    return !!(m.deathKey && m.turnKey && m.deathKey === m.turnKey);
  }
  /** Why this button is greyed out right now ("" = it works). */
  function reason(btn) {
    if (!btn || !btn.matches) return "";
    if (btn.matches("#btnDeathSave") && myTurn() && deathRolledNow() && !unlockedByDm()) return "You rolled your death save at the start of this turn. The DM can unlock another.";
    if (!locked()) return "";
    var m = marks();
    if (btn.matches(SPELL) && !btn.matches("#btnHexRoll, #btnPactShot")) {
      var p = P();
      var cost = p && p.spellCost ? p.spellCost(spellNameOf(btn)) : "action";
      if (cost === "reaction") return m.reaction ? "Your reaction is used. It comes back at the start of your own turn." : "";
    }
    if (btn.matches(ATTACK) && m.oaArmed) return m.reaction ? "Reaction already used." : "";
    if (btn.matches(ATTACK) && !btn.matches("#btnPactShot")) return NOT_TURN + (m.reaction ? "" : " For an opportunity attack, ask the DM with the Opportunity attack button.");
    return NOT_TURN;
  }
  /** For the map player card (ssdns-map-host.js runAction), by action id. */
  function blockedAction(id) {
    id = String(id || "");
    if (id === "turn:oa") return ""; /* asking for an opportunity attack is the off-turn action */
    var sel = null;
    var pick = function (s) { return document.querySelector(s); };
    if (/^(gunroll|melee):/.test(id)) sel = pick(ATTACK);
    else if (/^(fan|offhand):/.test(id)) sel = pick(EXTRA_ATTACK) || pick(ATTACK);
    else if (/^spell:/.test(id)) sel = pick('[data-spell-cast="' + id.slice(6).replace(/"/g, '\\"') + '"]') || pick(SPELL);
    else if (/^cast:/.test(id)) sel = pick('[data-cast="' + id.slice(5).replace(/"/g, '\\"') + '"]') || pick(SPELL);
    else if (id === "pact") sel = pick("#btnPactShot");
    else if (/^(reload|unload|tr|clean|unjam|reopen):/.test(id)) sel = pick(GEAR) || pick(OTHER);
    else if (/^turn:/.test(id)) sel = pick('[data-tl-act="' + id.slice(5) + '"]');
    if (!sel) { if (!locked()) return ""; if (/^(gunroll|melee|fan|offhand|spell|cast|pact|reload|unload|tr|clean|unjam|reopen|turn):/.test(id + ":")) return NOT_TURN; return ""; }
    var why = reason(sel);
    if (why) toast(why);
    return why;
  }
  /** N52: Gear and other sheet calls that never hit a locked button.
      "" means the action may go ahead. Players only — a DM command sets SSDNSApp._dmCmd
      (or SSDNSGunRoll._dm). Outside initiative, on your turn, and while the DM has unlocked
      this turn, this stays "". An approved opportunity attack and a reaction stay open. */
  function offTurnBlock(kind) {
    if (root.SSDNSApp && root.SSDNSApp._dmCmd) return "";
    if (root.SSDNSGunRoll && root.SSDNSGunRoll._dm) return "";
    if (!inFight() || myTurn() || !locked()) return "";
    var m = marks();
    if ((kind === "attack" || kind === "action") && m.oaArmed && !m.reaction) return "";
    if (kind === "reaction") return "";
    var msg = "It isn't your turn";
    toast(msg);
    return msg;
  }

  /* ---- grey out, and stop the click even if a repaint lost the class ---- */
  var painting = false;
  function apply() {
    if (typeof document === "undefined" || painting) return;
    painting = true;
    try {
      document.body && document.body.classList.toggle("turn-locked-sheet", locked());
      document.querySelectorAll(ALL).forEach(function (b) {
        var why = reason(b);
        var on = !!why;
        if (on) {
          if (!b.classList.contains("turn-locked")) {
            b.setAttribute("data-tl-title", b.getAttribute("title") || "");
            b.classList.add("turn-locked");
            b.setAttribute("aria-disabled", "true");
          }
          if (b.getAttribute("title") !== why) b.setAttribute("title", why);
        } else if (b.classList.contains("turn-locked")) {
          b.classList.remove("turn-locked");
          b.removeAttribute("aria-disabled");
          var t0 = b.getAttribute("data-tl-title");
          if (t0) b.setAttribute("title", t0); else b.removeAttribute("title");
          b.removeAttribute("data-tl-title");
        }
      });
      paintTracker();
    } finally { painting = false; }
  }
  var queued = false;
  function soon() { if (queued) return; queued = true; (root.requestAnimationFrame || setTimeout)(function () { queued = false; apply(); }); }

  /* ---- tracker in the turn strip (#turnSlot) ---- */
  var ACT_LABEL = { dash: "Dash", disengage: "Disengage", dodge: "Dodge" };
  /* Turn UX on the map: one strip for the sheet and the map. The sheet's #turnPanel (round, turn order, this slot,
     End turn) is the only copy; ssdns-map-host.js moves that same element to the top of the map while the Map tab is
     open. The slot now also carries the Action / Bonus / R markers (the same buttons as the Weapons box). */
  function trackerHtml() {
    var m = marks();
    var mv = T().moveLeft(m, speed());
    var mine = myTurn();
    var p = P();
    var open = !locked();
    var pips = p && p.html ? p.html().replace('<span class="pip-label">This turn</span>', "") : "";
    var moveOn = !!(root.SSDNSMoveMode && root.SSDNSMoveMode.isOn && root.SSDNSMoveMode.isOn());
    var h = '<span class="tl-box" data-turn-tracker>' + pips.replace('class="act-pips"', 'class="act-pips tl-pips"') +
      '<button type="button" class="tl-move' + (moveOn ? " is-on" : "") + '" data-tl-movemode data-tl-left="' + mv.left + '" aria-pressed="' + (moveOn ? "true" : "false") + '" title="Move mode. Click to show your reach and walk. Click again, Esc, or right-click to leave. Feet left this turn (Speed ' + speed() + ' ft' + (m.dash ? ", doubled by Dash" : "") + '). It refills at the start of your own turn.">Move <b>' + mv.left + '</b>/' + mv.max + ' ft</button>' +
      '<button type="button" class="btn xs tl-step" data-tl-move="5" title="I moved 5 ft">−</button>' +
      '<button type="button" class="btn xs tl-step" data-tl-move="-5" title="Give back 5 ft">+</button>' +
      '<span class="tl-acts">' + ['dash', 'disengage', 'dodge'].map(function (k) {
        var label = ACT_LABEL[k];
        var tip = k === "dash" ? "Uses your Action: doubles your movement this turn." : (k === "disengage" ? "Uses your Action: your movement doesn't provoke opportunity attacks this turn." : "Uses your Action: attacks against you have disadvantage and you have advantage on Dex saves until your next turn.");
        /* a Dash / Disengage / Dodge taken this turn turns into its own Cancel button until the Action goes elsewhere */
        var undo = !!m[k] && open && p && p.canCancelAct && p.canCancelAct(k);
        if (undo) {
          var back = m.actionBy === k ? "your Action comes back" : "it's turned off (your Action was already used)";
          tip = "Tap to cancel " + label + ": " + back + (k === "dash" ? " and your movement goes back to " + speed() + " ft" : "") + ".";
          return '<button type="button" class="btn xs tl-act on tl-undo" data-tl-act="' + k + '" data-tl-undo="1" aria-pressed="true" title="' + tip + '"><span class="tl-x" aria-hidden="true">✕</span> Cancel ' + label + "</button>";
        }
        if (m[k]) tip = label + " is on this turn. It can't be cancelled now (your Action went to something else); the DM can change your markers.";
        return '<button type="button" class="btn xs tl-act' + (m[k] ? " on" : "") + '" data-tl-act="' + k + '" aria-pressed="' + !!m[k] + '" title="' + tip + '">' + label + "</button>";
      }).join("") + "</span>";
    if (!mine) {
      var t = T(), i = init();
      var ask = m.oaReq ? t.oaEntry(i, m.oaReq) : null;
      if (m.oaArmed) h += '<span class="tl-oa ok" data-tl-oa-state="armed">Opportunity attack approved: make one attack</span>';
      else if (m.oaReq) h += '<span class="tl-oa wait" data-tl-oa-state="' + (ask ? ask.status : "sent") + '">Opportunity attack: waiting for the DM</span>';
      else h += '<button type="button" class="btn xs tl-oa-btn" data-tl-oa title="' + (m.reaction ? "Reaction already used." : "Ask the DM for an opportunity attack on your target. If approved, one attack uses your reaction.") + '">Opportunity attack</button>';
      h += unlockedByDm() ? '<span class="tl-lock open">DM unlocked this turn</span>' : '<span class="tl-lock">Not your turn</span>';
    }
    return h + "</span>";
  }
  var lastHtml = "";
  function paintTracker() {
    var slot = document.getElementById("turnSlot");
    if (!slot) return;
    if (!inFight() || !T()) { if (lastHtml) { slot.innerHTML = ""; lastHtml = ""; } return; }
    var html = trackerHtml();
    if (html === lastHtml && slot.querySelector("[data-turn-tracker]")) return;
    lastHtml = html;
    slot.innerHTML = html;
    /* the buttons in the slot follow the same lock */
    slot.querySelectorAll(ALL).forEach(function (b) {
      var why = reason(b);
      if (why) { b.classList.add("turn-locked"); b.setAttribute("aria-disabled", "true"); b.setAttribute("title", why); }
    });
  }

  /* ---- actions ---- */
  function doMove(delta) {
    var p = P(); if (!p || !p.move) return;
    var m = marks(); var mv = T().moveLeft(m, speed());
    var d = num(delta, 0);
    if (d > 0 && mv.left <= 0) { toast("No movement left this turn" + (m.dash ? "." : ". Dash uses your Action to double it.")); return; }
    if (d > 0) d = Math.min(d, mv.left);
    if (d < 0) d = -Math.min(-d, mv.used);
    if (!d) return;
    p.move(d);
    if (root.SSDNSAudio) root.SSDNSAudio.play("ui-tick");
  }
  function doAct(k) {
    var p = P(); if (!p) return;
    var m = marks();
    var label = ACT_LABEL[k] || k;
    if (m[k]) {
      /* Turn UX on the map: tapping it again cancels it while the Action hasn't gone to anything else */
      if (p.canCancelAct && p.canCancelAct(k)) { cancelAct(k); return; }
      toast("You already took " + label + " this turn. It can't be cancelled now because your Action went to something else; the DM can change your markers.");
      return;
    }
    if (p.takeAct) p.takeAct(k, label); else { p.spend("action", label); p.setFlag(k, true); }
    var line = k === "dash" ? "Dash: movement doubled this turn (" + T().moveLeft(marks(), speed()).max + " ft)." : (k === "disengage" ? "Disengage: my movement doesn't provoke opportunity attacks this turn." : "Dodge: attacks against me have disadvantage until my next turn (if I can see the attacker), and I have advantage on Dex saves.");
    log(line, "alert");
    toast(line + " Tap Cancel " + label + " to take it back."); /* the DM sees Dash / Disengage / Dodge on the player's marker row (DMCC Fight tab and map card) */
  }
  /** Cancel a Dash / Disengage / Dodge taken this turn: the Action comes back (if it paid for it) and Dash's extra
      feet go away. Feet already walked stay walked, so a Dash whose extra feet were used can't be cancelled. */
  function cancelAct(k) {
    var p = P(); if (!p || !p.cancelAct) return false;
    var m = marks();
    var label = ACT_LABEL[k] || k;
    if (k === "dash") {
      var sp = speed(), used = Math.max(0, num(m.moveUsed, 0));
      if (used > sp) {
        toast("You've moved " + used + " ft, past your " + sp + " ft speed, so Dash can't be cancelled. Give back the extra feet with + first, or ask the DM.");
        return false;
      }
    }
    var r = p.cancelAct(k);
    if (!r) return false;
    var line = "Cancelled " + label + (r.refunded ? ": my Action is back" : "") + (k === "dash" ? (r.refunded ? " and" : ":") + " movement is back to " + speed() + " ft (" + T().moveLeft(marks(), speed()).left + " ft left)" : "") + ".";
    log(line, "note");
    toast(line);
    if (root.SSDNSAudio) root.SSDNSAudio.play("ui-tick");
    return true;
  }
  function askOa() {
    var J = root.SSDNSDmJoin, p = P();
    var m = marks();
    if (m.reaction) {
      if (p && p.blockMap) p.blockMap("reaction", "Opportunity attack");
      else toast("Reaction already used.");
      return;
    }
    if (!J || !J.postOaRequest || !(J.isJoined && J.isJoined())) { toast("Join the DM's table to ask for an opportunity attack."); return; }
    var sel = document.getElementById("atkTarget");
    var tid = sel && sel.value && sel.value !== "__free" ? sel.value : "";
    var tname = tid && sel.selectedOptions && sel.selectedOptions[0] ? (sel.selectedOptions[0].getAttribute("data-name") || sel.selectedOptions[0].textContent || "") : "";
    J.postOaRequest({ targetId: tid, targetName: tname }).then(function (res) {
      if (!res || !res.ok) { toast("Couldn't reach the DM. Try again."); return; }
      p.setOa("oaReq", res.id);
      toast("Asked the DM for an opportunity attack" + (tname ? " on " + tname : "") + ".");
      log("Asked the DM for an opportunity attack" + (tname ? " on " + tname : "") + ".");
      soon();
    }).catch(function () { toast("Couldn't reach the DM. Try again."); });
  }
  /** The DM's answer arrives on table/initiative/oa (watched through showTurn). */
  function checkOa() {
    var p = P(), t = T(), i = init();
    if (!p || !t || !i) return;
    var m = marks();
    if (!m.oaReq) return;
    var e = t.oaEntry(i, m.oaReq);
    if (!e) return;
    if (e.status === "approved") {
      var id = m.oaReq;
      p.setOa("oaReq", "");
      p.setOa("oaArmed", id);
      toast("The DM approved your opportunity attack. Make one attack now; it uses your reaction.");
      log("The DM approved my opportunity attack.", "alert");
    } else if (e.status === "denied") {
      p.setOa("oaReq", "");
      toast("The DM said no to the opportunity attack. Your reaction is still ready.");
      log("The DM said no to my opportunity attack.", "alert");
    }
  }
  /* item 6: a death save rolls by itself at the start of my own turn while I'm at 0 HP (not stable, not dead) */
  function deathSaveAtTurnStart(key) {
    var c = ch();
    if (!c || !inFight()) return;
    var hpEl = document.getElementById("inHPCur");
    var hp = num(hpEl && hpEl.value !== "" ? hpEl.value : c.hpCurrent, NaN);
    if (!isFinite(hp) || hp > 0) return;
    var ds = c.deathSaves || {};
    var s = (ds.success || []).filter(Boolean).length, f = (ds.fail || []).filter(Boolean).length;
    if (s >= 3 || f >= 3) return;
    var m = marks();
    if (m.deathKey && m.deathKey === key) return;
    P().markDeath(key);
    setTimeout(function () {
      if (root.SSDNSSheet && root.SSDNSSheet.rollDeathSave) root.SSDNSSheet.rollDeathSave();
      soon();
    }, 300);
  }

  if (typeof document !== "undefined") {
    /* capture on window: runs before every other click handler */
    root.addEventListener("click", function (e) {
      var t = e.target && e.target.closest && e.target.closest(ALL + ", [data-tl-oa]");
      if (!t) return;
      if (t.hasAttribute("data-tl-oa")) { e.preventDefault(); e.stopImmediatePropagation(); askOa(); return; }
      var why = reason(t);
      if (why) {
        e.preventDefault(); e.stopImmediatePropagation();
        var pips = P();
        var mNow = marks();
        var spellReaction = t.matches && t.matches(SPELL) && pips && pips.spellCost && pips.spellCost(spellNameOf(t)) === "reaction" && mNow.reaction;
        var oaRoll = t.matches && t.matches(ATTACK) && mNow.oaArmed && mNow.reaction;
        if ((spellReaction || oaRoll) && pips && pips.blockMap) pips.blockMap("reaction", oaRoll ? "Opportunity attack" : ("Casting " + (spellNameOf(t) || "a spell")));
        else toast(why);
        return;
      }
      if (t.hasAttribute("data-tl-move")) { e.preventDefault(); e.stopImmediatePropagation(); doMove(t.getAttribute("data-tl-move")); return; }
      if (t.hasAttribute("data-tl-act")) { e.preventDefault(); e.stopImmediatePropagation(); doAct(t.getAttribute("data-tl-act")); return; }
    }, true);
    root.addEventListener("ssdns:pips-change", soon);
    root.addEventListener("ssdns:pips-reset", soon);
    root.addEventListener("ssdns:own-turn", function (e) { deathSaveAtTurnStart(e && e.detail && e.detail.turnKey); });
    var boot = function () {
      apply();
      try {
        var obs = new MutationObserver(function () { if (!painting) soon(); });
        obs.observe(document.body, { childList: true, subtree: true });
      } catch (e) {}
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
  }
  root.SSDNSTurnLock = {
    apply: apply, locked: locked, myTurn: myTurn, inFight: inFight, reason: reason, blockedAction: blockedAction, offTurnBlock: offTurnBlock,
    checkOa: checkOa, askOa: askOa, move: doMove, act: doAct, cancelAct: cancelAct, speed: speed,
    onTurn: function () { checkOa(); apply(); }
  };
})(typeof window !== "undefined" ? window : this);

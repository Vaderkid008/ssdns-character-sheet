/* SSDNS focus rules (L0197, Jessey 2026-10-20 7:10 PM; sheet 0.3.102).
   Pact Seeker: no Borrowed Iron in hand, no Pact Seeker spells (cantrips and Pact Shot included; BOOK1 L2005 / L3770).
     Lost or disarmed -> character.borrowedIronAway; it returns at the start of the owner's next turn (out of combat,
     a heartbeat later, so it never stays away outside a fight).
   Hexslinger: hex casting and shells only work with a Caster Gun (Blacksnake / Hognose) equipped in Pistol L or R
     (BOOK1 L1884). None -> "No Caster Gun equipped, can't cast."
   Only the cast buttons are blocked (with the reason); nothing on the sheet is changed or wiped. Other Callings: no change.
   The Focus slot view itself lives in paper-doll.js (focusState). */
(function (root) {
  "use strict";
  var NO_IRON = "Borrowed Iron isn't in your hand, so you can't cast. It returns at the start of your next turn.";

  function Doll() { return root.SSDNSDoll || null; }
  function doc() { return root.SSDNSApp && root.SSDNSApp.doc ? root.SSDNSApp.doc() : null; }
  function ch() { var d = doc(); return d && d.character; }
  function inCombat() { return !!(root.SSDNSEquip && root.SSDNSEquip.combatLocked && root.SSDNSEquip.combatLocked()); }
  function toast(t) { if (t && typeof root.SSDNSToast === "function") root.SSDNSToast(t); }
  function log(t) { if (t && root.SSDNSSheet && root.SSDNSSheet.addLog) { try { root.SSDNSSheet.addLog({ kind: "alert", text: t }); } catch (e) {} } }
  function commit(fn) { if (root.SSDNSApp && root.SSDNSApp.applyPatch) root.SSDNSApp.applyPatch(fn); else fn(); }

  /* The equipped Caster Gun a Hexslinger casts through: {key, side, i, id, name} or null. */
  function casterGun(c) {
    var D = Doll();
    return D && D.casterInHand ? D.casterInHand(c) : null;
  }
  /* L0198 (Jessey 2026-10-20 7:48 PM; BOOK1 L4504): the Plinker kit swap isn't allowed for the Hexslinger. A save that
     already took it (a Plinker gun, no Caster Gun owned) keeps every bit of its data; it only gets this note. */
  var SWAP_NOTE = "The Plinker kit swap isn't allowed for the Hexslinger. Without a Caster Gun you can't cast. Your Plinker stays on the sheet.";
  var PLINKERS = { "dullards-plinker-revolver": 1, "dullards-plinker-repeater": 1 };
  function hexPlinkerSwap(c) {
    if (!c || c.calling !== "hexslinger") return false;
    var guns = (Array.isArray(c.guns) ? c.guns : []).filter(function (g) { return g && g.weapon; });
    var D = Doll(), R = root.SSDNS_RULES || {};
    var casterIds = {};
    (R.casterGuns || []).forEach(function (w) { if (w && w.id && (!D || !D.isCasterWeapon || D.isCasterWeapon(w))) casterIds[w.id] = 1; });
    if (!Object.keys(casterIds).length) casterIds = { blacksnake: 1, hognose: 1 };
    var ownsCaster = guns.some(function (g) { return casterIds[g.weapon]; });
    return !ownsCaster && guns.some(function (g) { return PLINKERS[g.weapon]; });
  }
  /* "" = can cast; else the reason the cast buttons are blocked. */
  function castBlock(c) {
    if (!c) return "";
    if (c.calling === "pact-seeker") return c.borrowedIronAway ? NO_IRON : "";
    if (c.calling === "hexslinger") {
      var cgW = casterGun(c);
      /* L0200: the equipped Caster Gun is Wrecked (no working one in the other pistol slot) */
      if (cgW && cgW.wrecked) return (root.SSDNSCasterRules && root.SSDNSCasterRules.CANT_CAST) || "Your Caster Gun is Wrecked, so you can't cast through it.";
      if (cgW) return "";
      var msg = (Doll() && Doll().NO_CASTER) || "No Caster Gun equipped, can't cast.";
      return hexPlinkerSwap(c) ? msg + " " + SWAP_NOTE : msg;
    }
    return "";
  }
  /* Hexslinger: the gun index a cast goes through (the equipped Caster Gun), or -1. */
  function castGunIndex(c) {
    var cg = c && c.calling === "hexslinger" ? casterGun(c) : null;
    return cg && !cg.wrecked ? cg.i : -1;
  }

  /* Lost / disarmed. opts.combat overrides the live combat check (tests); opts.turn = the current turn key. */
  function markAway(c, opts) {
    opts = opts || {};
    if (!c || c.calling !== "pact-seeker") return { ok: false, reason: "Only a Pact Seeker has a Borrowed Iron." };
    var combat = opts.combat != null ? !!opts.combat : inCombat();
    if (!combat) { delete c.borrowedIronAway; return { ok: true, away: false, text: "The Borrowed Iron dissolves to ash and is back in your hand a heartbeat later." }; }
    c.borrowedIronAway = { at: opts.at || new Date().toISOString(), turn: opts.turn != null ? String(opts.turn) : currentTurn() };
    return { ok: true, away: true, text: "The Borrowed Iron dissolves to ash. It returns at the start of your next turn. Until then, no Pact Seeker spells." };
  }
  function markBack(c) {
    if (!c || !c.borrowedIronAway) return { ok: false, reason: "The Borrowed Iron is already in your hand." };
    delete c.borrowedIronAway;
    return { ok: true, text: "The Borrowed Iron is back in your hand." };
  }
  /* Start of a turn that belongs to this sheet: the iron comes back unless it left during this very turn. */
  function turnStart(c, turnKey) {
    if (!c || !c.borrowedIronAway) return false;
    if (turnKey != null && String(c.borrowedIronAway.turn || "") === String(turnKey)) return false;
    delete c.borrowedIronAway;
    return true;
  }
  function currentTurn() {
    var P = root.SSDNSPlaytest;
    return P && P.turnKey ? String(P.turnKey() || "") : "";
  }

  /* Sheet actions (commit + paint) */
  function ironAway(opts) {
    var res;
    commit(function () { res = markAway(ch(), {}); });
    if (res && res.ok && opts && opts.toast) { toast(res.text); log(res.text); }
    repaint();
    return res || { ok: false, reason: "No sheet." };
  }
  function ironBack(opts) {
    var res;
    commit(function () { res = markBack(ch()); });
    if (res && res.ok && opts && opts.toast) toast(res.text);
    repaint();
    return res || { ok: false, reason: "No sheet." };
  }
  /* sheet-playtest.js calls this when the turn order moves (mine = it's this sheet's turn now). */
  function onTurn(turnKey, mine, active) {
    var c = ch();
    if (!c || !c.borrowedIronAway) return;
    if (active === false || mine) {
      var back = false;
      commit(function () { back = active === false ? !!markBack(ch()).ok : turnStart(ch(), turnKey); });
      if (back) { var t = "The Borrowed Iron rematerializes in your hand."; toast(t); log(t); repaint(); }
    }
  }
  function repaint() {
    try { if (root.SSDNSDoll && root.SSDNSDoll.paint) root.SSDNSDoll.paint(); } catch (e) {}
    paintCastBlock();
  }

  /* Block only the cast buttons, with the reason. Buttons this file disabled get their own state back after. */
  var CAST_SEL = "#btnHexRoll, #btnPactShot, [data-cast], [data-spell-cast]";
  function paintCastBlock() {
    if (typeof document === "undefined" || !document.querySelectorAll) return;
    var why = castBlock(ch());
    Array.prototype.forEach.call(document.querySelectorAll(CAST_SEL), function (b) {
      if (why) {
        if (!b.hasAttribute("data-focus-block")) {
          b.setAttribute("data-focus-block", "1");
          b.setAttribute("data-focus-prev", JSON.stringify({ d: !!b.disabled, t: b.getAttribute("title") }));
        }
        b.disabled = true;
        b.title = why;
        b.classList.add("focus-blocked");
      } else if (b.hasAttribute("data-focus-block")) {
        var prev = {};
        try { prev = JSON.parse(b.getAttribute("data-focus-prev") || "{}"); } catch (e) {}
        b.disabled = !!prev.d;
        if (prev.t == null) b.removeAttribute("title"); else b.title = prev.t;
        b.removeAttribute("data-focus-block"); b.removeAttribute("data-focus-prev");
        b.classList.remove("focus-blocked");
      }
    });
    note(document.querySelector(".hex-roll"), "focusCastNote", why);
    note(document.getElementById("pactFocus"), "pactFocusNote", why);
    swapNote(hexPlinkerSwap(ch()) ? SWAP_NOTE : "");
  }
  /* L0198: Gear-tab note above the weapon cards for a Hexslinger save that took the Plinker swap */
  function swapNote(text) {
    var guns = document.getElementById("guns");
    var el = document.getElementById("hexSwapNote");
    if (!el && text && guns && guns.parentNode) {
      el = document.createElement("p");
      el.id = "hexSwapNote";
      el.className = "fine focus-cast-note";
      el.setAttribute("role", "status");
      guns.parentNode.insertBefore(el, guns);
    }
    if (!el) return;
    el.textContent = text || "";
    el.hidden = !text;
  }
  function note(host, id, text) {
    if (!host) return;
    var el = document.getElementById(id);
    if (!el && text) {
      el = document.createElement("p");
      el.id = id;
      el.className = "fine focus-cast-note";
      el.setAttribute("role", "status");
      host.appendChild(el);
    }
    if (!el) return;
    el.textContent = text || "";
    el.hidden = !text;
  }
  /* Sheet gate for every cast path (sheet-extras.js). true = blocked (toast already shown). */
  function gate() {
    var why = castBlock(ch());
    if (why) { toast(why); return true; }
    return false;
  }

  root.SSDNSFocus = {
    NO_IRON: NO_IRON, SWAP_NOTE: SWAP_NOTE, hexPlinkerSwap: hexPlinkerSwap,
    castBlock: castBlock, casterGun: casterGun, castGunIndex: castGunIndex,
    markAway: markAway, markBack: markBack, turnStart: turnStart,
    ironAway: ironAway, ironBack: ironBack, onTurn: onTurn,
    paintCastBlock: paintCastBlock, gate: gate
  };
})(typeof window !== "undefined" ? window : globalThis);

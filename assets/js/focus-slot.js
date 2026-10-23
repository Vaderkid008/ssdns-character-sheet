/* SSDNS focus rules (L0197, Jessey 2026-10-20 7:10 PM; sheet 0.3.108).
   Pact Seeker: no Borrowed Iron in hand, no Pact Seeker spells (cantrips and Pact Shot included; BOOK1 L2005 / L3770).
     Lost or disarmed -> character.borrowedIronAway; it returns at the start of the owner's next turn (out of combat,
     a heartbeat later, so it never stays away outside a fight).
   Hexslinger: hex casting and shells only work with a Caster Gun (Blacksnake / Hognose) equipped in Pistol L or R
     (BOOK1 L1884). None -> "No Caster Gun equipped, can't cast."
   Only the cast buttons are blocked (with the reason); nothing on the sheet is changed or wiped. Other Callings: no change.
   0.3.108: Lawman badge (Badge Bound) and the Frontier Scout's lost keepsake block casting too (see below).
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
  /* 0.3.108 Badge Bound (BOOK1 L1561-1567; Jessey 2026-10-22 2:48 PM CT). character.badgeState is the one field (set by the
     DM's DMCC Badge toggle, the "badge" inbox command in dm-join.js). Missing = Bright (as the Gear chip always read it).
       Bright    -> full power.
       Dull      -> no spells, Smite Lead, Mercy Hands or Channel Creed (PHB L1577).
       Tarnished -> Smite Lead, Mercy Hands and Channel Creed blocked as Dull, but the spell list swaps to the Lawless list
                    (assets/data/lawless-spells.js, L0214; app.js callingCatalog) and the sheet shows "Lawless".
                    HOOK (Oath of the Lawless feature swap, not specified yet): lawlessOathHook() below is where the oath's
                    features will be swapped in. Today it changes nothing, so the oath features stay as they are. */
  var BADGE_STATES = { bright: 1, dull: 1, tarnished: 1 };
  function badge(c) {
    var st = String((c && c.badgeState) || "bright").toLowerCase();
    return BADGE_STATES[st] ? st : "bright";
  }
  var BADGE_WHY = {
    dull: { spells: "Your badge is Dull: no spells until you're sworn in again.", smite: "Your badge is Dull: no Smite Lead.", mercy: "Your badge is Dull: no Mercy Hands.", creed: "Your badge is Dull: no Channel Creed." },
    tarnished: { spells: "", smite: "Your badge is Tarnished: no Smite Lead.", mercy: "Your badge is Tarnished: no Mercy Hands.", creed: "Your badge is Tarnished: no Channel Creed." }
  };
  /* "" = allowed; else why. what: spells | smite | mercy | creed. Only a Lawman's badge blocks anything. */
  function badgeBlock(c, what) {
    if (!c || c.calling !== "lawman") return "";
    var b = badge(c);
    return (BADGE_WHY[b] && BADGE_WHY[b][what]) || "";
  }
  function lawless(c) { return !!c && c.calling === "lawman" && badge(c) === "tarnished"; }
  /* HOOK: Oath of the Lawless features (DND Bot sends the spec later). Return the oath features to use while Tarnished,
     or null to keep the character's own oath features (today: always null). */
  function lawlessOathHook(c) { return lawless(c) && root.SSDNS_LAWLESS && root.SSDNS_LAWLESS.oathFeatures ? root.SSDNS_LAWLESS.oathFeatures(c) : null; }

  /* 0.3.108 Frontier Scout keepsake (BOOK1 L1697): lost -> no casting until a new one is made at a long rest. The item
     row leaves Equipment (it's gone); character.focusLost keeps a copy, so "Make a new one" puts the same keepsake back. */
  var KEEPSAKE = "frontier-keepsake";
  var LOST_WHY = "Your keepsake is lost, so you can't cast. Make a new one at a long rest.";
  function markFocusLost(c, opts) {
    opts = opts || {};
    if (!c || c.calling !== "frontier-scout") return { ok: false, reason: "Only a Frontier Scout's keepsake works this way." };
    if (c.focusLost) return { ok: false, reason: "Your keepsake is already lost." };
    var list = Array.isArray(c.items) ? c.items : [];
    var idx = -1;
    for (var i = 0; i < list.length; i++) if (list[i] && list[i].catalogId === KEEPSAKE) { idx = i; break; }
    if (idx < 0) return { ok: false, reason: "You don't carry a keepsake." };
    var it = list.splice(idx, 1)[0];
    if (c.focusItemUid === it.uid) delete c.focusItemUid;
    c.focusLost = { at: opts.at || new Date().toISOString(), catalogId: KEEPSAKE, item: JSON.parse(JSON.stringify(it)) };
    return { ok: true, text: "Your keepsake is lost. No casting until you make a new one at a long rest." };
  }
  function remakeFocus(c) {
    if (!c || !c.focusLost) return { ok: false, reason: "Your keepsake isn't lost." };
    var saved = c.focusLost.item, I = root.SSDNSItems;
    c.items = Array.isArray(c.items) ? c.items : [];
    if (saved && saved.uid) c.items.push(saved);
    else if (I && I.add) { var r = I.add(c, { catalogId: KEEPSAKE, count: 1 }, { dm: true }); if (!r || !r.ok) return { ok: false, reason: (r && r.reason) || "Couldn't make the keepsake." }; }
    else return { ok: false, reason: "Item tools aren't loaded." };
    delete c.focusLost;
    return { ok: true, text: "You made a new keepsake. You can cast again." };
  }
  function focusLostAct(opts) {
    var res;
    commit(function () { res = markFocusLost(ch(), {}); });
    if (res && res.ok && opts && opts.toast) { toast(res.text); log(res.text); }
    repaint();
    return res || { ok: false, reason: "No sheet." };
  }
  function focusRemakeAct(opts) {
    var res;
    commit(function () { res = remakeFocus(ch()); });
    if (res && res.ok && opts && opts.toast) { toast(res.text); log(res.text); }
    repaint();
    return res || { ok: false, reason: "No sheet." };
  }

  /* "" = can cast; else the reason the cast buttons are blocked. */
  function castBlock(c) {
    if (!c) return "";
    if (c.calling === "frontier-scout" && c.focusLost) return LOST_WHY;
    if (c.calling === "lawman") return badgeBlock(c, "spells");
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
    /* 0.3.108: the Spells tab says why too (Dull badge, lost keepsake), and a Tarnished Lawman sees "Lawless" there */
    var c0 = ch(), lim = document.getElementById("spellLimits");
    var spellWhy = c0 && (c0.calling === "lawman" || c0.calling === "frontier-scout") ? why : "";
    note(lim && lim.parentNode, "focusSpellNote", spellWhy);
    note(lim && lim.parentNode, "lawlessSpellNote", lawless(c0) ? "Lawless: your badge is Tarnished, so your spells come from the Lawless list (your Lawman list returns when the badge is Bright or Dull again)." : "");
    var ln = document.getElementById("lawlessSpellNote");
    if (ln) ln.className = "fine focus-cast-note lawless-note";
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
    paintCastBlock: paintCastBlock, gate: gate,
    badge: badge, badgeBlock: badgeBlock, lawless: lawless, lawlessOathHook: lawlessOathHook, BADGE_WHY: BADGE_WHY,
    markFocusLost: markFocusLost, remakeFocus: remakeFocus, focusLostAct: focusLostAct, focusRemakeAct: focusRemakeAct, LOST_WHY: LOST_WHY
  };
})(typeof window !== "undefined" ? window : globalThis);

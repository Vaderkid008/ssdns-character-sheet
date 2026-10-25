/* SSDNS focus rules (L0197, Jessey 2026-10-20 7:10 PM; sheet 0.3.108).
   Pact Seeker: no Borrowed Iron in hand, no Pact Seeker spells (cantrips and Pact Shot included; BOOK1 L2005 / L3770).
     Lost or disarmed -> character.borrowedIronAway; it returns at the start of the owner's next turn (out of combat,
     a heartbeat later, so it never stays away outside a fight).
   Hexslinger: hex casting and shells only work with a Caster Gun (Blacksnake / Hognose) equipped in Pistol L or R
     (BOOK1 L1884). None -> "No Caster Gun equipped, can't cast."
   Only the cast buttons are blocked (with the reason); nothing on the sheet is changed or wiped. Other Callings: no change.
   0.3.108: Lawman badge (Badge Bound) and the Frontier Scout's lost keepsake block casting too (see below).
   L0223 / B11 (Scholar only): a missing Chemical Field Ledger does NOT block the cast button. Prepared spells
   still cast. Spell attacks roll at disadvantage and creatures have advantage on saves against those spells.
   Cantrips and spells with no attack and no save stay normal. Prepare and copy stay gated until the Ledger is back.
   The Focus slot view itself lives in paper-doll.js (focusState). */
(function (root) {
  "use strict";
  var NO_IRON = "Borrowed Iron isn't in your hand, so you can't cast. It returns at the start of your next turn.";
  /* L0223. The Ledger is the Scholar's spellbook and focus. Missing it never disables Cast. */
  var LEDGER_ID = "chemical-field-ledger";
  var PREP_WHY = "Lost Ledger. Recover your focus before you prepare or copy spells.";
  var ATTACK_NOTE = "Lost Ledger: disadvantage";
  var SAVE_NOTE = "Lost Ledger: advantage on the save";

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

  /* L0223: the Ledger fills the Focus slot when the Scholar still carries it (paper-doll focusState).
     A Prism or other focus left in the slot is not the Ledger. */
  function ledgerItem(c) {
    var list = (c && c.items) || [];
    for (var i = 0; i < list.length; i++) {
      var it = list[i];
      if (it && it.catalogId === LEDGER_ID && Number(it.count == null ? 1 : it.count) > 0) return it;
    }
    return null;
  }
  function ledgerEquipped(c) {
    if (!c || c.calling !== "scholar") return false;
    var D = Doll();
    if (D && D.focusState) {
      var fs = D.focusState(c);
      return !!(fs && fs.itemId === LEDGER_ID);
    }
    var led = ledgerItem(c);
    if (!led) return false;
    if (c.focusItemUid && c.focusItemUid !== led.uid) {
      var picked = (c.items || []).filter(function (it) { return it && it.uid === c.focusItemUid && Number(it.count == null ? 1 : it.count) > 0; })[0];
      if (picked && picked.catalogId && picked.catalogId !== LEDGER_ID) return false;
    }
    return true;
  }
  function ledgerMissing(c) {
    return !!(c && c.calling === "scholar" && !ledgerEquipped(c));
  }
  function normSpell(name) {
    return String(name || "").toLowerCase().replace(/\s*\([^)]*\)\s*/g, " ").replace(/\./g, "").replace(/\s+/g, " ").trim();
  }
  function spellKeys(name) {
    var raw = String(name || ""), keys = [];
    function add(k) { k = normSpell(k); if (k && keys.indexOf(k) < 0) keys.push(k); }
    add(raw);
    var found = raw.match(/\(([^)]+)\)/g);
    if (found) found.forEach(function (p) { add(String(p).replace(/[()]/g, "")); });
    return keys;
  }
  function sameSpell(a, b) {
    var A = spellKeys(a), B = spellKeys(b), i;
    for (i = 0; i < A.length; i++) if (B.indexOf(A[i]) >= 0) return true;
    return false;
  }
  /* Leveled spells the Scholar has marked prepared. Cantrips live on character.cantrips and are not this list. */
  function isPreparedSpell(c, name) {
    var book = (c && c.spells) || {};
    var lv, i;
    for (lv = 1; lv <= 9; lv++) {
      var rows = book[lv] || book[String(lv)] || [];
      for (i = 0; i < rows.length; i++) {
        var s = rows[i];
        if (s && s.name && s.prepared && sameSpell(s.name, name)) return true;
      }
    }
    return false;
  }
  /* Flags for one cast. slotLevel 0 is a cantrip (no flag). Unknown / utility kinds get neither flag. */
  function ledgerCast(c, spellName, row, slotLevel) {
    var empty = { attackDis: false, saveAdv: false, attackNote: "", saveNote: "" };
    if (!ledgerMissing(c)) return empty;
    if (parseInt(slotLevel, 10) === 0) return empty;
    if (!isPreparedSpell(c, spellName)) return empty;
    var kind = row && row.kind ? row.kind : "none";
    var attack = kind === "attack" || kind === "weapon";
    var save = kind === "save" || (!!(row && row.save) && attack);
    return {
      attackDis: attack,
      saveAdv: save,
      attackNote: attack ? ATTACK_NOTE : "",
      saveNote: save ? SAVE_NOTE : ""
    };
  }
  function prepBlock(c) { return ledgerMissing(c) ? PREP_WHY : ""; }
  function stickLedgerBit(text, bit, onD20) {
    text = String(text || "");
    if (!bit || text.indexOf(bit) >= 0) return text;
    if (onD20) {
      var lines = text.split("\n");
      var i;
      for (i = 0; i < lines.length; i++) {
        if (/\bd20\b/.test(lines[i])) {
          lines[i] = lines[i] + " · " + bit;
          return lines.join("\n");
        }
      }
    }
    return text + ((/\n/.test(text) ? "\n" : " · ") + bit);
  }
  function appendLedgerBit(rolled, bit, onD20) {
    if (!bit) return;
    rolled.text = stickLedgerBit(rolled.text, bit, onD20);
    rolled.detail = stickLedgerBit(rolled.detail == null ? rolled.text : rolled.detail, bit, onD20);
  }
  /* Same adv/disadv words the chat already draws. Attack note sits on the d20 line so a tie ring stays red. */
  function applyLedgerNotes(rolled, flags, mode) {
    rolled = rolled || {};
    flags = flags || {};
    if (flags.attackDis && mode === "dis") appendLedgerBit(rolled, flags.attackNote || ATTACK_NOTE, true);
    if (flags.saveAdv) appendLedgerBit(rolled, flags.saveNote || SAVE_NOTE, false);
    rolled.ledgerAttack = !!(flags.attackDis && mode === "dis");
    rolled.ledgerSave = !!flags.saveAdv;
    return rolled;
  }
  function paintLedgerNote() {
    if (typeof document === "undefined" || !document.getElementById) return;
    var why = prepBlock(ch());
    var lim = document.getElementById("spellLimits");
    note(lim && lim.parentNode, "ledgerPrepNote", why);
    var addBtn = document.getElementById("btnAddSpell");
    if (!addBtn) return;
    if (why) {
      addBtn.disabled = true;
      addBtn.title = why;
      addBtn.setAttribute("data-ledger-lock", "1");
    } else if (addBtn.getAttribute("data-ledger-lock")) {
      addBtn.disabled = false;
      addBtn.title = "Add a spell from your Calling list";
      addBtn.removeAttribute("data-ledger-lock");
    }
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
    note(document.getElementById("callingSig"), "callingSigNoteBlock", why);
    /* 0.3.108: the Spells tab says why too (Dull badge, lost keepsake), and a Tarnished Lawman sees "Lawless" there */
    var c0 = ch(), lim = document.getElementById("spellLimits");
    var spellWhy = c0 && (c0.calling === "lawman" || c0.calling === "frontier-scout") ? why : "";
    note(lim && lim.parentNode, "focusSpellNote", spellWhy);
    note(lim && lim.parentNode, "lawlessSpellNote", lawless(c0) ? "Lawless: your badge is Tarnished, so your spells come from the Lawless list (your Lawman list returns when the badge is Bright or Dull again)." : "");
    var ln = document.getElementById("lawlessSpellNote");
    if (ln) ln.className = "fine focus-cast-note lawless-note";
    swapNote(hexPlinkerSwap(ch()) ? SWAP_NOTE : "");
    paintLedgerNote();
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
    markFocusLost: markFocusLost, remakeFocus: remakeFocus, focusLostAct: focusLostAct, focusRemakeAct: focusRemakeAct, LOST_WHY: LOST_WHY,
    LEDGER_ID: LEDGER_ID, PREP_WHY: PREP_WHY, ATTACK_NOTE: ATTACK_NOTE, SAVE_NOTE: SAVE_NOTE,
    ledgerEquipped: ledgerEquipped, ledgerMissing: ledgerMissing, ledgerCast: ledgerCast, prepBlock: prepBlock,
    isPreparedSpell: isPreparedSpell, applyLedgerNotes: applyLedgerNotes
  };
})(typeof window !== "undefined" ? window : globalThis);

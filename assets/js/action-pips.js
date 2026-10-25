/**
 * Per-turn action economy (0.3.54 guns, 0.3.55 attacks, spells, features).
 * Pips: Action, Bonus, Reaction. Sheet buttons still warn and roll when a pip is already spent (the DM can allow it).
 * The player's map attack, spell, or item, and a reaction that is already spent (opportunity-attack ask or a reaction
 * roll), hard-block instead: blockMap toasts the player and tells the DM. Enemies stay warn-and-allow in the DMCC.
 * Pips reset when your own turn starts in the DM's turn order (turn order PR 1). Turn order PR 2: the
 * player's Reset is gone (the DM resets from the DMCC and the map), and in a fight only the DM marks a used pip ready.
 * Costs: "action", "bonus", "reaction", "full" (slow load = action + bonus), "free" (no pip).
 * Attacks: the first attack spends the Action; Extra Attack (from the Calling's feature text in
 * rules.js) makes the next attacks in that Attack action free, up to the limit.
 */
(function (root) {
  "use strict";
  var KEY = "ssdns.actionPips.v1";
  var ACTS = ["dash", "disengage", "dodge"];
  var st = load();
  /* turn order PR 2: moveUsed (feet), dash / disengage / dodge, the opportunity-attack window (oaReq asked, oaArmed
     approved and not used yet, oaUsed spent) and deathKey (the turn a death save was rolled) */
  function blank() { return { action: false, bonus: false, reaction: false, attacks: 0, actionBy: "", turnKey: "", moveUsed: 0, dash: false, disengage: false, dodge: false, oaReq: "", oaArmed: "", oaUsed: "", oaUsedAt: 0, deathKey: "", actUndo: "" }; }
  function extras(src, out) {
    src = src || {};
    out.moveUsed = Math.max(0, parseInt(src.moveUsed, 10) || 0);
    out.dash = !!src.dash; out.disengage = !!src.disengage; out.dodge = !!src.dodge;
    out.oaReq = String(src.oaReq || ""); out.oaArmed = String(src.oaArmed || ""); out.oaUsed = String(src.oaUsed || "");
    out.oaUsedAt = Number(src.oaUsedAt) || 0; out.deathKey = String(src.deathKey || "");
    /* Turn UX on the map: the Dash / Disengage / Dodge that can still be cancelled this turn ("" = none) */
    out.actUndo = ACTS.indexOf(String(src.actUndo || "")) >= 0 ? String(src.actUndo) : "";
    return out;
  }
  function load() {
    try { var v = JSON.parse(root.localStorage.getItem(KEY) || "null"); if (v && typeof v === "object") return Object.assign(blank(), v); } catch (e) {}
    return blank();
  }
  function save() {
    try { root.localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {}
    /* T2: the markers also go to the room so the DM sees them and a reload keeps them */
    try { if (root.SSDNSDmJoin && root.SSDNSDmJoin.pushTurnMarkers) root.SSDNSDmJoin.pushTurnMarkers(stateCopy()); } catch (e) {}
    changed();
  }
  /* turn order PR 2: the off-turn lock and the movement tracker repaint when the markers change */
  function changed() {
    try { if (root.dispatchEvent && typeof root.CustomEvent === "function") root.dispatchEvent(new root.CustomEvent("ssdns:pips-change")); } catch (e) {}
  }
  function stateCopy() { return extras(st, { action: !!st.action, bonus: !!st.bonus, reaction: !!st.reaction, attacks: st.attacks || 0, actionBy: st.actionBy || "", turnKey: st.turnKey || "" }); }
  var LABEL = { action: "an action", bonus: "a bonus action", reaction: "a reaction", full: "a full turn (action + bonus)", free: "a free action" };
  var WORD = { action: "your action", bonus: "your bonus action", reaction: "your reaction" };
  function needs(cost) {
    if (cost === "full") return ["action", "bonus"];
    if (cost === "action" || cost === "bonus" || cost === "reaction") return [cost];
    return [];
  }
  function toast(msg) { if (root.SSDNSToast) root.SSDNSToast(msg); }
  function warn(what, cost, used) {
    var msg = (what || "That") + " costs " + (LABEL[cost] || cost) + ", and you already used " +
      used.map(function (k) { return WORD[k]; }).join(" and ") + " this turn. Done anyway; the DM can allow it.";
    toast(msg);
    if (root.SSDNSSheet && root.SSDNSSheet.addLog) root.SSDNSSheet.addLog({ kind: "alert", text: msg });
    return msg;
  }
  /** Spend for an action. Returns {over, cost}. Never blocks. */
  function spend(cost, what) {
    var list = needs(cost);
    var used = list.filter(function (k) { return st[k]; });
    list.forEach(function (k) { st[k] = true; });
    if (list.indexOf("action") >= 0 && !used.length) st.actionBy = "other";
    if (list.indexOf("action") >= 0) st.actUndo = ""; /* Turn UX on the map: the Action went to something else, so no cancel */
    save(); paint();
    if (used.length) warn(what, cost, used);
    return { over: used.length > 0, cost: cost };
  }

  /* ---- Extra Attack from rules.js feature text ("Attack twice per Attack action (3 times at 11th, 4 times at 20th)") ---- */
  function character() {
    try { var d = root.SSDNSApp && root.SSDNSApp.doc && root.SSDNSApp.doc(); return d && d.character; } catch (e) { return null; }
  }
  var WORDS = { twice: 2, two: 2, three: 3, four: 4 };
  function attacksPerAction(c) {
    c = c || character();
    var R = root.SSDNS_RULES;
    if (!c || !R || !R.callings) return 1;
    var cal = R.callings.filter(function (x) { return x.id === c.calling; })[0];
    var lv = Math.max(1, parseInt(c.level, 10) || 1);
    var best = 1;
    ((cal && cal.features) || []).forEach(function (f) {
      var text = String(f.text || "");
      var m = text.match(/attack (twice|two times|three times|four times) per attack action/i);
      if (!m || !/extra attack/i.test(String(f.name || ""))) return;
      var startM = String(f.name).match(/(\d+)(?:st|nd|rd|th)/);
      var start = startM ? parseInt(startM[1], 10) : 5;
      if (lv < start) return;
      var n = WORDS[m[1].split(" ")[0].toLowerCase()] || 2;
      var re = /(\d) times at (\d+)(?:st|nd|rd|th)/gi, k;
      while ((k = re.exec(text))) if (lv >= parseInt(k[2], 10)) n = Math.max(n, parseInt(k[1], 10));
      best = Math.max(best, n);
    });
    return best;
  }
  /** An attack roll. First one spends the Action; Extra Attack makes the rest free up to the limit. */
  function attack(what) {
    var limit = attacksPerAction();
    var label = what || "Attack";
    var over = false;
    /* turn order PR 2 (item 4): an opportunity attack the DM approved spends the Reaction, not the Action, once */
    if (st.oaArmed) {
      st.reaction = true; st.oaUsed = st.oaArmed; st.oaUsedAt = Date.now(); st.oaArmed = "";
      save(); paint();
      if (root.SSDNSSheet && root.SSDNSSheet.addLog) root.SSDNSSheet.addLog({ kind: "note", text: label + " · opportunity attack (reaction)." });
      return { over: false, attacks: st.attacks, limit: limit, oa: st.oaUsed };
    }
    st.actUndo = ""; /* Turn UX on the map: an attack after Dash / Disengage / Dodge ends its cancel */
    if (!st.action) { st.action = true; st.actionBy = "attack"; st.attacks = 1; }
    else if (st.actionBy === "attack" && st.attacks < limit) { st.attacks += 1; }
    else {
      over = true;
      if (st.actionBy === "attack") st.attacks += 1;
      var msg = st.actionBy === "attack"
        ? label + ": that's attack " + st.attacks + ", and your Attack action allows " + limit + ". Done anyway; the DM can allow it."
        : label + " costs your action, and you already used your action this turn. Done anyway; the DM can allow it.";
      toast(msg);
      if (root.SSDNSSheet && root.SSDNSSheet.addLog) root.SSDNSSheet.addLog({ kind: "alert", text: msg });
    }
    save(); paint();
    return { over: over, attacks: st.attacks, limit: limit };
  }

  /* ---- Spell casting time. No casting-time field exists in rules.js; read spell-fx text, then 5e defaults. ---- */
  var BONUS_SPELLS = ["healing word", "mass healing word", "misty step", "shield of faith", "hex", "hunter's mark", "spiritual weapon", "sanctuary", "expeditious retreat", "divine favor", "magic weapon", "compelled duel", "searing smite", "thunderous smite", "wrathful smite", "branding smite", "blinding smite", "staggering smite", "ensnaring strike", "hail of thorns", "shillelagh", "flame blade", "swift quiver", "spirit shroud"];
  var REACTION_SPELLS = ["shield", "absorb elements", "feather fall", "hellish rebuke", "counterspell"];
  function baseName(name) {
    var n = String(name || "").toLowerCase().replace(/\s*\(.*?\)\s*/g, " ").replace(/\s+shell$/, "").trim();
    var A = root.SSDNS_RULES && root.SSDNS_RULES.spellAliases;
    if (A && typeof A === "object" && !Array.isArray(A)) {
      Object.keys(A).forEach(function (k) { if (k.toLowerCase() === n && typeof A[k] === "string") n = A[k].toLowerCase(); });
    }
    return n.replace(/\s+/g, " ");
  }
  function spellCost(name) {
    var n = baseName(name);
    var fx = root.SSDNS_SPELL_FX && root.SSDNS_SPELL_FX[n];
    var does = String((fx && fx.does) || "");
    if (/cast (?:this|it) as a reaction|as a reaction when/i.test(does)) return "reaction";
    if (/cast (?:this|it) as a bonus action/i.test(does)) return "bonus";
    if (REACTION_SPELLS.indexOf(n) >= 0) return "reaction";
    if (BONUS_SPELLS.indexOf(n) >= 0) return "bonus";
    return "action";
  }
  function spell(name) {
    var cost = spellCost(name);
    return spend(cost, "Casting " + (name || "a spell"));
  }

  /* Player map hard-block, and a spent Reaction (opportunity-attack ask / reaction roll).
     Returns "" when the roll may go ahead. A reason string means do not roll.
     Extra Attack stays free up to the limit. An approved opportunity attack spends Reaction, not Action,
     and is allowed while Reaction is still ready. Sheet attack() / spend() stay warn-and-roll. */
  var BLOCK_WORD = { action: "Action already used.", bonus: "Bonus action already used.", reaction: "Reaction already used." };
  function blockReason(cost) {
    if (!cost || cost === "free") return "";
    if (cost === "attack") {
      if (st.oaArmed) return st.reaction ? "Reaction already used." : "";
      var limit = attacksPerAction();
      if (!st.action) return "";
      if (st.actionBy === "attack" && (parseInt(st.attacks, 10) || 0) < limit) return "";
      return "Action already used.";
    }
    if (cost === "full") return (st.action || st.bonus) ? "Action already used." : "";
    if (cost === "action" || cost === "bonus" || cost === "reaction") return st[cost] ? BLOCK_WORD[cost] : "";
    return "";
  }
  function tellDmBlocked(reason, what) {
    var c = character();
    var name = (c && c.name) || "";
    var line = (name ? name + ": " : "") + reason + (what ? " " + what + " was not rolled." : "");
    var Join = root.SSDNSDmJoin;
    if (Join && Join.postLedger) {
      try { Join.postLedger({ type: "alert", what: line, flag: true, pipBlock: true }); } catch (e) {}
    }
    if (Join && Join.postChat) {
      try { Join.postChat({ text: line }); } catch (e2) {}
    }
    return line;
  }
  function blockMap(cost, what) {
    var reason = blockReason(cost);
    if (!reason) return "";
    toast(reason);
    if (root.SSDNSSheet && root.SSDNSSheet.addLog) root.SSDNSSheet.addLog({ kind: "alert", text: reason });
    tellDmBlocked(reason, what);
    return reason;
  }

  /* ---- Feature costs from rules.js feature text ---- */
  function featureCost(name) {
    var R = root.SSDNS_RULES, c = character();
    if (!R || !R.callings) return "";
    var want = String(name || "").toLowerCase().trim();
    var hit = "";
    R.callings.forEach(function (cal) {
      if (c && c.calling && cal.id !== c.calling) return;
      (cal.features || []).forEach(function (f) {
        if (String(f.name || "").toLowerCase().trim() !== want) return;
        var t = String(f.text || "");
        if (/^\s*bonus action\b|\bas a bonus action\b|\buse a bonus action\b/i.test(t)) hit = "bonus";
        else if (/^\s*reaction\b|\bas a reaction\b|\buse your reaction\b/i.test(t)) hit = "reaction";
        else if (/^\s*(?:an )?action\b|\bas an action\b|\buse an action\b/i.test(t)) hit = "action";
      });
    });
    return hit;
  }
  /** Cost named in a rules.js rulesText entry, e.g. rulesText.takeCover "as a bonus action". */
  function rulesCost(key) {
    var t = String((root.SSDNS_RULES && root.SSDNS_RULES.rulesText && root.SSDNS_RULES.rulesText[key]) || "");
    if (/as a bonus action/i.test(t)) return "bonus";
    if (/as a reaction/i.test(t)) return "reaction";
    if (/as an action/i.test(t)) return "action";
    return "";
  }
  function feature(name) {
    var cost = featureCost(name);
    if (!cost) return null;
    return spend(cost, name);
  }

  /** Manual toggle (the DM ruled something costs, or doesn't cost, an action). Logged quietly: no toast. */
  var NAME = { action: "Action", bonus: "Bonus action", reaction: "Reaction" };
  function toggle(kind) {
    if (!NAME[kind]) return null;
    /* turn order PR 2 (item 9): in a fight only the DM gives a used pip back (DMCC or map); marking one used is fine */
    if (st[kind] && inFight()) {
      toast("Only the DM can give back your " + NAME[kind].toLowerCase() + " during a fight.");
      return st[kind];
    }
    st[kind] = !st[kind];
    if (kind === "action") { st.actionBy = st.action ? "manual" : ""; st.attacks = 0; st.actUndo = ""; }
    save(); paint();
    if (root.SSDNSAudio) root.SSDNSAudio.play("ui-tick");
    if (root.SSDNSSheet && root.SSDNSSheet.addLog) root.SSDNSSheet.addLog({ kind: "note", quiet: true, text: NAME[kind] + (st[kind] ? " marked used" : " marked ready") + " (manual)." });
    return st[kind];
  }
  function reset(quiet) { st.action = false; st.bonus = false; st.reaction = false; st.attacks = 0; st.actionBy = ""; extras({}, st); save(); paint(); if (!quiet) toast("Action, bonus action, and reaction are back."); /* 0.3.73: tell per-turn trackers (Fan the Hammer) */
    try { if (root.dispatchEvent && typeof root.CustomEvent === "function") root.dispatchEvent(new root.CustomEvent("ssdns:pips-reset")); } catch (e) {}
  }
  /* Turn order PR 1 (T2, Jessey's rulings 2026-10-21 9:07 PM CT): markers come back only when MY own turn starts
     (reaction too), never on someone else's turn, and the DM's Undo never hands out a second set. The rule lives in
     SSDNSTurn (turn-rules.js), shared with the DMCC. If my row can't be found in the order (e.g. a name mismatch
     offline), the markers come back once per round instead of on every turn. */
  var lastInit = null;
  function myRow(init) {
    var T = root.SSDNSTurn;
    if (!T || !init) return null;
    var uid = root.SSDNSDmJoin && root.SSDNSDmJoin.uid && root.SSDNSDmJoin.uid();
    var c = character();
    return T.rowFor(init, uid || "", (c && c.name) || "");
  }
  function onTurn(init) {
    if (!init || !Array.isArray(init.order) || !init.order.length) return;
    lastInit = init;
    var T = root.SSDNSTurn;
    var row = myRow(init);
    if (T && row) {
      var got = T.markersFor(st, init, row);
      if (!got.reset) { changed(); return; }
      st.turnKey = got.markers.turnKey;
      reset(true);
      /* turn order PR 2: tell the turn rules (death save at the start of my own turn) */
      try { if (root.dispatchEvent && typeof root.CustomEvent === "function") root.dispatchEvent(new root.CustomEvent("ssdns:own-turn", { detail: { turnKey: st.turnKey } })); } catch (e) {}
      return;
    }
    var k = "round:" + String(init.round || 1);
    if (k === st.turnKey) return;
    st.turnKey = k;
    reset(true);
  }
  function applyMarkerField(k, v) {
    if (k === "action" || k === "bonus" || k === "reaction" || k === "dash" || k === "disengage" || k === "dodge") st[k] = !!v[k];
    else if (k === "attacks" || k === "moveUsed") st[k] = Math.max(0, parseInt(v[k], 10) || 0);
    else if (k === "oaUsedAt") st.oaUsedAt = Number(v[k]) || 0;
    else if (k === "actionBy" || k === "turnKey" || k === "oaReq" || k === "oaArmed" || k === "oaUsed" || k === "deathKey") st[k] = String(v[k] || "");
    else if (k === "actUndo") st.actUndo = ACTS.indexOf(String(v[k] || "")) >= 0 ? String(v[k]) : "";
  }
  function dmFieldNames(v) {
    var raw = v && v.dmFields;
    if (!raw || typeof raw !== "object") return null;
    return Object.keys(raw).filter(function (k) { return !!raw[k]; });
  }
  /** Room copy (rooms/{code}/players/{uid}/turnMarkers) wins when it belongs to a newer or the same turn.
   *  A live DM edit (opts.live) applies only dmFields, so a move-feet write cannot clear Action/Bonus/Reaction. */
  function adopt(v, opts) {
    if (!v || typeof v !== "object") return false;
    opts = opts || {};
    var live = opts.live && v.by === "dm" ? dmFieldNames(v) : null;
    if (live && live.length) {
      live.forEach(function (k) { applyMarkerField(k, v); });
      try { root.localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {}
      paint();
      changed();
      return true;
    }
    var keep = blank();
    ["action", "bonus", "reaction"].forEach(function (k) { keep[k] = !!v[k]; });
    keep.attacks = Math.max(0, parseInt(v.attacks, 10) || 0);
    keep.actionBy = String(v.actionBy || "");
    keep.turnKey = String(v.turnKey || "");
    extras(v, keep);
    st = keep;
    try { root.localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {}
    if (lastInit) onTurn(lastInit);
    paint();
    changed();
    return true;
  }
  /* ---- turn order PR 2 helpers (the rules live in turn-rules.js / turn-lock.js) ---- */
  function inFight() { var T = root.SSDNSTurn; return !!(T && lastInit && T.inFight(lastInit) && myRow(lastInit)); }
  /** Movement: spend (delta > 0) or give back (delta < 0) feet this turn. */
  function move(delta) {
    var d = parseInt(delta, 10) || 0;
    st.moveUsed = Math.max(0, (parseInt(st.moveUsed, 10) || 0) + d);
    save();
    return st.moveUsed;
  }
  /* Turn UX on the map (Jessey 2026-10-22 2:28 PM): Dash / Disengage / Dodge can be cancelled during the turn.
     takeAct spends the Action (warning if it was used, as before) and remembers which act paid for it; cancelAct
     gives that Action back and turns the act off. Anything that spends the Action afterwards (an attack, a spell,
     a reload, a manual or DM toggle) closes the cancel. Movement rules live in turn-lock.js. */
  function takeAct(k, label) {
    if (ACTS.indexOf(k) < 0) return null;
    var fresh = !st.action;
    var r = spend("action", label);
    if (fresh) { st.actionBy = k; st.attacks = 0; }
    st[k] = true;
    st.actUndo = k;
    save(); paint();
    return r;
  }
  function canCancelAct(k) { return ACTS.indexOf(k) >= 0 && !!st[k] && st.actUndo === k; }
  function cancelAct(k) {
    if (!canCancelAct(k)) return null;
    var refund = !!st.action && st.actionBy === k;
    st[k] = false;
    st.actUndo = "";
    if (refund) { st.action = false; st.actionBy = ""; st.attacks = 0; }
    save(); paint();
    return { refunded: refund };
  }
  function setFlag(k, on) { if (["dash", "disengage", "dodge"].indexOf(k) < 0) return; st[k] = on !== false; save(); }
  function setOa(field, id) { if (["oaReq", "oaArmed", "oaUsed"].indexOf(field) < 0) return; st[field] = String(id || ""); save(); paint(); }
  /** The approved opportunity attack's id, for the rolls of the attack that just used it (a short window). */
  function oaTag() { return st.oaUsed && st.oaUsedAt && Date.now() - st.oaUsedAt < 20000 ? st.oaUsed : ""; }
  function markDeath(key) { st.deathKey = String(key || ""); save(); }
  function costTag(cost) { return cost === "full" ? "Full turn" : (cost === "bonus" ? "Bonus" : (cost === "free" ? "Free" : (cost === "reaction" ? "Reaction" : "Action"))); }
  function actionText() {
    var limit = attacksPerAction();
    if (st.actionBy === "attack" && limit > 1) return "Action " + Math.min(st.attacks, 99) + "/" + limit;
    return "Action";
  }
  function html() {
    var limit = attacksPerAction();
    var aTip = st.action
      ? (st.actionBy === "attack" ? "Action used on the Attack action: " + st.attacks + " of " + limit + " attack" + (limit > 1 ? "s" : "") + "." + (st.attacks < limit ? " More attacks are free this turn." : "") : "Action used this turn.")
      : "Action ready. Attacks, spells, Reload, Unload, and Reopen spend it." + (limit > 1 ? " Extra Attack: " + limit + " attacks per Attack action." : "");
    aTip += " Click to mark it " + (st.action ? "ready" : "used") + ".";
    var bTip = st.bonus ? "Bonus action used this turn." : "Bonus action ready. Tactical Reload, Quick Reload, Unjam, Take Cover, bonus-action spells and features spend it.";
    var rTip = st.reaction ? "Reaction used. It comes back at the start of your own turn." : "Reaction ready. Reaction spells and an approved opportunity attack spend it.";
    bTip += " Click to mark it " + (st.bonus ? "ready" : "used") + ".";
    rTip += " Click to mark it " + (st.reaction ? "ready" : "used") + ".";
    if (inFight()) { aTip += " In a fight only the DM marks it ready."; bTip += " In a fight only the DM marks it ready."; rTip += " In a fight only the DM marks it ready."; }
    var partial = st.actionBy === "attack" && st.attacks < limit ? " partial" : "";
    return '<span class="act-pips" data-act-pips>' +
      '<span class="pip-label">This turn</span>' +
      '<button type="button" data-pip="action" aria-pressed="' + st.action + '" class="pip pip-action' + (st.action ? " used" : "") + partial + '" title="' + aTip + '">' + actionText() + '</button>' +
      '<button type="button" data-pip="bonus" aria-pressed="' + st.bonus + '" class="pip pip-bonus' + (st.bonus ? " used" : "") + '" title="' + bTip + '">Bonus</button>' +
      '<button type="button" data-pip="reaction" aria-pressed="' + st.reaction + '" class="pip pip-reaction' + (st.reaction ? " used" : "") + '" title="' + rTip + '">R</button>' +
      '</span>'; /* turn order PR 2 (item 9): no player Reset; the DM resets from the DMCC and the map */
  }
  function paint() {
    if (typeof document === "undefined") return;
    var host = document.querySelector(".firearms .box-head");
    if (!host) return;
    var el = host.querySelector("[data-act-pips]");
    var tmp = document.createElement("span");
    tmp.innerHTML = html();
    if (el) el.replaceWith(tmp.firstChild); else host.insertBefore(tmp.firstChild, host.querySelector(".hex-roll"));
  }
  if (typeof document !== "undefined") {
    document.addEventListener("click", function (e) {
      var pip = e.target && e.target.closest && e.target.closest("[data-pip]");
      if (pip) toggle(pip.getAttribute("data-pip"));
    });
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", paint); else paint();
  }
  root.SSDNSActionPips = {
    spend: spend, toggle: toggle, attack: attack, spell: spell, feature: feature, reset: reset, onTurn: onTurn, paint: paint,
    blockMap: blockMap, blockReason: blockReason, tellDmBlocked: tellDmBlocked,
    attacksPerAction: attacksPerAction, spellCost: spellCost, featureCost: featureCost, rulesCost: rulesCost,
    state: function () { return extras(st, { action: st.action, bonus: st.bonus, reaction: st.reaction, attacks: st.attacks, actionBy: st.actionBy, turnKey: st.turnKey }); },
    adopt: adopt,
    move: move, setFlag: setFlag, takeAct: takeAct, cancelAct: cancelAct, canCancelAct: canCancelAct, html: html, setOa: setOa, oaTag: oaTag, markDeath: markDeath, inFight: inFight, lastInit: function () { return lastInit; },
    costTag: costTag, needs: needs
  };
})(typeof window !== "undefined" ? window : this);

/**
 * Per-turn action economy (0.3.54 guns, 0.3.55 attacks, spells, features).
 * Pips: Action, Bonus, Reaction. Sheet buttons still warn and roll when a pip is already spent (the DM can allow it).
 * The player's map attack, spell, item, or gun action (Reload, Tactical Reload, Unload, Reopen), and a spent
 * Action, Bonus, or Reaction, hard-block instead: blockMap shows a fading player toast and does not post a
 * table-log row, a chat line, or a DM ledger note. Enemies stay warn-and-allow in the DMCC.
 * A ready R opens the reaction menu: opportunity attack (the existing DM ask), reaction spells this character
 * can cast, and Mark used (the same confirm as Action / Bonus). Auto-prompts on a hit or leaving reach are not here.
 * A player click that marks Action or Bonus used asks first. Clearing a pip, and the DM's own pip buttons, do not.
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
    if (used.length && !(root.SSDNSActionPips && root.SSDNSActionPips._dmAllow)) warn(what, cost, used);
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
      if (root.SSDNSReact && root.SSDNSReact.noteSpent) root.SSDNSReact.noteSpent(st.oaUsed);
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
      if (!(root.SSDNSActionPips && root.SSDNSActionPips._dmAllow)) {
        toast(msg);
        if (root.SSDNSSheet && root.SSDNSSheet.addLog) root.SSDNSSheet.addLog({ kind: "alert", text: msg });
      }
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
  /** True when spell text says the spell itself is cast as a reaction (not "can't take reactions"). */
  function reactionCastingText(text) {
    var t = String(text || "");
    if (/casting time\s*:\s*(?:1\s+)?reaction\b/i.test(t)) return true;
    if (/\bas a reaction\b/i.test(t)) return true;
    return false;
  }
  function spellCost(name) {
    var n = baseName(name);
    var fx = root.SSDNS_SPELL_FX && root.SSDNS_SPELL_FX[n];
    var does = String((fx && (fx.does || fx.text)) || "");
    if (reactionCastingText(does)) return "reaction";
    if (/cast (?:this|it) as a bonus action/i.test(does)) return "bonus";
    if (REACTION_SPELLS.indexOf(n) >= 0) return "reaction";
    if (BONUS_SPELLS.indexOf(n) >= 0) return "bonus";
    return "action";
  }
  function spell(name) {
    /* N72: an allowed Gunsmoke Caster cast uses the armed opportunity attack. Reaction, not Action. */
    var oa = root.SSDNSReact && root.SSDNSReact.oaCast;
    if (oa && st.oaArmed && !st.reaction && (!oa.id || oa.id === st.oaArmed) && (!oa.name || baseName(oa.name) === baseName(name))) {
      var id = st.oaArmed;
      st.reaction = true;
      st.oaUsed = id;
      st.oaUsedAt = Date.now();
      st.oaArmed = "";
      save();
      paint();
      root.SSDNSReact.oaCast = null;
      if (root.SSDNSSheet && root.SSDNSSheet.addLog) root.SSDNSSheet.addLog({ kind: "note", text: "Casting " + (name || "a spell") + " · opportunity attack (reaction)." });
      if (root.SSDNSReact.noteSpent) root.SSDNSReact.noteSpent(id);
      return { over: false, cost: "reaction", oa: id };
    }
    var cost = spellCost(name);
    return spend(cost, "Casting " + (name || "a spell"));
  }

  /* Player map hard-block, and a spent Reaction (opportunity-attack ask / reaction roll).
     Returns "" when the roll may go ahead. A reason string means do not roll.
     Extra Attack stays free up to the limit. An approved opportunity attack spends Reaction, not Action,
     and is allowed while Reaction is still ready. Sheet attack() / spend() stay warn-and-roll.
     The fading toast is the only notice. Nothing is written to the table log, chat, or the DM ledger. */
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
  function blockMap(cost, what) {
    var reason = blockReason(cost);
    if (!reason) return "";
    toast(reason);
    return reason;
  }
  /* Prepared / known spells this character can cast as a reaction. castChoices() is the sheet's own list
     (prepared casters omit unprepared spells). Without it, read the character the same way. */
  var PREPARED_CASTERS = { "frontier-preacher": 1, "nature-guide": 1, "lawman": 1, "scholar": 1 };
  function spellsOnSheet() {
    var App = root.SSDNSApp;
    if (App && typeof App.castChoices === "function") return App.castChoices() || [];
    var c = character();
    if (!c) return [];
    var out = [];
    (c.cantrips || []).forEach(function (n) { if (n) out.push({ level: 0, name: n }); });
    var book = c.spells;
    if (c.calling === "lawman" && c.lawlessSpells && c.lawlessSpells.seeded) book = c.lawlessSpells;
    var prepared = !!PREPARED_CASTERS[c.calling];
    var lv;
    for (lv = 1; lv <= 9; lv++) {
      ((book && book[lv]) || []).forEach(function (s) {
        if (!s || !s.name) return;
        if (prepared && !s.prepared) return;
        out.push({ level: lv, name: s.name });
      });
    }
    return out;
  }
  function reactionChoices() {
    var seen = {};
    var out = [];
    spellsOnSheet().forEach(function (row) {
      if (!row || !row.name || spellCost(row.name) !== "reaction") return;
      var key = baseName(row.name);
      if (seen[key]) return;
      seen[key] = 1;
      var level = parseInt(row.level, 10) || 0;
      out.push({ level: level, name: String(row.name), value: row.value || (level + ":" + row.name) });
    });
    out.sort(function (a, b) { return a.level - b.level || a.name.localeCompare(b.name); });
    return out;
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
    /* N75: an empty order is End combat (free-action). Record it. Leaving the previous
       in-fight snapshot here kept Attack / Reload / Unjam greyed after the strip cleared. */
    if (!init || !Array.isArray(init.order) || !init.order.length) {
      lastInit = init || null;
      changed();
      return;
    }
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
    var rTip = st.reaction ? "Reaction used. It comes back at the start of your own turn." : "Reaction ready. Click for an opportunity attack, a reaction spell, or to mark it used.";
    bTip += " Click to mark it " + (st.bonus ? "ready" : "used") + ".";
    if (inFight()) { aTip += " In a fight only the DM marks it ready."; bTip += " In a fight only the DM marks it ready."; if (st.reaction) rTip += " In a fight only the DM marks it ready."; }
    var partial = st.actionBy === "attack" && st.attacks < limit ? " partial" : "";
    return '<span class="act-pips" data-act-pips>' +
      '<span class="pip-label">This turn</span>' +
      '<button type="button" data-pip="action" aria-pressed="' + st.action + '" class="pip pip-action' + (st.action ? " used" : "") + partial + '" title="' + aTip + '">' + actionText() + '</button>' +
      '<button type="button" data-pip="bonus" aria-pressed="' + st.bonus + '" class="pip pip-bonus' + (st.bonus ? " used" : "") + '" title="' + bTip + '">Bonus</button>' +
      '<button type="button" data-pip="reaction" aria-haspopup="menu" aria-pressed="' + st.reaction + '" class="pip pip-reaction' + (st.reaction ? " used" : "") + '" title="' + rTip + '">R</button>' +
      '</span>'; /* turn order PR 2 (item 9): no player Reset; the DM resets from the DMCC and the map */
  }
  function escAttr(s) {
    return String(s || "").replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  var menuEl = null;
  var menuAnchor = null;
  function closeReactionMenu() {
    if (menuEl && menuEl.parentNode) menuEl.parentNode.removeChild(menuEl);
    menuEl = null;
    menuAnchor = null;
  }
  function placeReactionMenu(anchor) {
    if (!menuEl || !anchor || !anchor.getBoundingClientRect) return;
    var r = anchor.getBoundingClientRect();
    var left = r.left;
    var top = r.bottom + 4;
    menuEl.style.top = top + "px";
    menuEl.style.left = left + "px";
    var w = menuEl.offsetWidth || 240;
    var h = menuEl.offsetHeight || 40;
    var vw = (root.innerWidth || 800);
    var vh = (root.innerHeight || 600);
    if (left + w > vw - 8) left = Math.max(8, vw - w - 8);
    if (top + h > vh - 8) top = Math.max(8, r.top - h - 4);
    menuEl.style.top = top + "px";
    menuEl.style.left = left + "px";
  }
  function openReactionMenu(anchor) {
    if (menuEl && menuAnchor === anchor) { closeReactionMenu(); return; }
    closeReactionMenu();
    if (typeof document === "undefined" || !document.body) return;
    var spells = reactionChoices();
    var oaSub = "Ask the DM. If approved, one attack spends your reaction, not your action.";
    if (st.oaArmed) oaSub = "Approved. Make one attack. It spends your reaction, not your action.";
    else if (st.oaReq) oaSub = "Waiting for the DM to approve or deny.";
    var html = '<div class="pip-react-menu" data-pip-react-menu role="menu" aria-label="Reaction">' +
      '<button type="button" class="pip-react-item" role="menuitem" data-pip-react="oa"><b>Opportunity attack</b><span>' + escAttr(oaSub) + "</span></button>";
    if (!spells.length) html += '<p class="pip-react-empty">No reaction spells prepared.</p>';
    spells.forEach(function (sp) {
      var tag = sp.level ? ("Level " + sp.level) : "Cantrip";
      html += '<button type="button" class="pip-react-item" role="menuitem" data-pip-react="spell" data-pip-spell="' + escAttr(sp.name) + '" data-pip-level="' + sp.level + '"><b>' + escAttr(sp.name) + "</b><span>" + tag + " · reaction</span></button>";
    });
    html += '<button type="button" class="pip-react-item pip-react-mark" role="menuitem" data-pip-react="mark"><b>Mark used</b><span>For when the DM calls it, with no roll.</span></button></div>';
    var wrap = document.createElement("div");
    wrap.innerHTML = html;
    menuEl = wrap.firstChild;
    menuAnchor = anchor || null;
    document.body.appendChild(menuEl);
    placeReactionMenu(anchor);
  }
  function askOpportunity() {
    if (st.reaction) { toast("Reaction already used."); return; }
    if (st.oaArmed) { toast("Opportunity attack approved. Make one attack; it uses your reaction."); return; }
    if (st.oaReq) { toast("Opportunity attack: waiting for the DM."); return; }
    var Lock = root.SSDNSTurnLock;
    if (Lock && typeof Lock.askOa === "function") { Lock.askOa(); return; }
    toast("Join the DM's table to ask for an opportunity attack.");
  }
  function markReactionUsed() {
    if (st.reaction) { toast("Reaction already used."); return; }
    var Ask = root.SSDNSAsk;
    var go = function () { toggle("reaction"); };
    if (Ask && typeof Ask.confirm === "function") {
      Ask.confirm("Are you sure you want to use your Reaction?").then(function (ok) { if (ok) go(); });
      return;
    }
    go();
  }
  /** The sheet's Cast button (data-spell-cast). That path spends the reaction when the spell resolves. */
  function openReactionSpell(name, level) {
    if (st.reaction) { toast("Reaction already used."); return; }
    if (typeof document === "undefined" || !document.body) return;
    var key = String(parseInt(level, 10) || 0) + ":" + name;
    var live = document.querySelectorAll ? document.querySelectorAll("[data-spell-cast]") : [];
    var i;
    for (i = 0; i < live.length; i++) {
      if ((live[i].getAttribute("data-spell-cast") || "") === key) { live[i].click(); return; }
    }
    var btn = document.createElement("button");
    btn.type = "button";
    btn.hidden = true;
    btn.setAttribute("data-spell-cast", key);
    btn.setAttribute("aria-hidden", "true");
    document.body.appendChild(btn);
    btn.click();
    if (btn.parentNode) btn.parentNode.removeChild(btn);
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
      var item = e.target && e.target.closest && e.target.closest("[data-pip-react]");
      if (item) {
        if (e.preventDefault) e.preventDefault();
        var act = item.getAttribute("data-pip-react");
        var spellName = item.getAttribute("data-pip-spell");
        var spellLevel = item.getAttribute("data-pip-level");
        closeReactionMenu();
        if (act === "oa") askOpportunity();
        else if (act === "mark") markReactionUsed();
        else if (act === "spell") openReactionSpell(spellName, spellLevel);
        return;
      }
      var pip = e.target && e.target.closest && e.target.closest("[data-pip]");
      if (pip) {
        var kind = pip.getAttribute("data-pip");
        /* Ready R opens the picker on the sheet strip, the map strip, and the Weapons box (same button).
           Spent R is a fading toast only. DM pip buttons are data-dm-pip and do not reach this listener. */
        if (kind === "reaction") {
          if (e.preventDefault) e.preventDefault();
          if (st.reaction) { closeReactionMenu(); toast("Reaction already used."); return; }
          openReactionMenu(pip);
          return;
        }
        closeReactionMenu();
        /* A player marking Action or Bonus used (the DM called for it, no roll) confirms first.
           Clearing is unchanged: in a fight only the DM gives it back, and outside a fight it just flips ready. */
        if ((kind === "action" || kind === "bonus") && !st[kind]) {
          var Ask = root.SSDNSAsk;
          if (Ask && typeof Ask.confirm === "function") {
            var msg = kind === "bonus"
              ? "Are you sure you want to use your Bonus action?"
              : "Are you sure you want to use your Action?";
            Ask.confirm(msg).then(function (ok) { if (ok) toggle(kind); });
            return;
          }
        }
        toggle(kind);
        return;
      }
      if (menuEl && !(e.target && e.target.closest && e.target.closest("[data-pip-react-menu]"))) closeReactionMenu();
    });
    document.addEventListener("keydown", function (e) { if (e && e.key === "Escape") closeReactionMenu(); });
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", paint); else paint();
  }
  root.SSDNSActionPips = {
    spend: spend, toggle: toggle, attack: attack, spell: spell, feature: feature, reset: reset, onTurn: onTurn, paint: paint,
    blockMap: blockMap, blockReason: blockReason,
    reactionChoices: reactionChoices, closeReactionMenu: closeReactionMenu, openSpell: openReactionSpell,
    attacksPerAction: attacksPerAction, spellCost: spellCost, featureCost: featureCost, rulesCost: rulesCost,
    spellsOnSheet: spellsOnSheet,
    state: function () { return extras(st, { action: st.action, bonus: st.bonus, reaction: st.reaction, attacks: st.attacks, actionBy: st.actionBy, turnKey: st.turnKey }); },
    adopt: adopt,
    move: move, setFlag: setFlag, takeAct: takeAct, cancelAct: cancelAct, canCancelAct: canCancelAct, html: html, setOa: setOa, oaTag: oaTag, markDeath: markDeath, inFight: inFight, lastInit: function () { return lastInit; },
    costTag: costTag, needs: needs
  };
})(typeof window !== "undefined" ? window : this);

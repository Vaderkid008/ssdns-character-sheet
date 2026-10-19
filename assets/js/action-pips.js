/**
 * Per-turn action economy (0.3.54 guns, 0.3.55 attacks, spells, features).
 * Pips: Action, Bonus, Reaction. Spending a used pip only warns (the DM can allow it); nothing is
 * ever blocked. Pips reset when the DM's turn order moves to a new turn, or with Reset.
 * Costs: "action", "bonus", "reaction", "full" (slow load = action + bonus), "free" (no pip).
 * Attacks: the first attack spends the Action; Extra Attack (from the Calling's feature text in
 * rules.js) makes the next attacks in that Attack action free, up to the limit.
 */
(function (root) {
  "use strict";
  var KEY = "ssdns.actionPips.v1";
  var st = load();
  function blank() { return { action: false, bonus: false, reaction: false, attacks: 0, actionBy: "", turnKey: "" }; }
  function load() {
    try { var v = JSON.parse(root.localStorage.getItem(KEY) || "null"); if (v && typeof v === "object") return Object.assign(blank(), v); } catch (e) {}
    return blank();
  }
  function save() { try { root.localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} }
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
    st[kind] = !st[kind];
    if (kind === "action") { st.actionBy = st.action ? "manual" : ""; st.attacks = 0; }
    save(); paint();
    if (root.SSDNSSheet && root.SSDNSSheet.addLog) root.SSDNSSheet.addLog({ kind: "note", quiet: true, text: NAME[kind] + (st[kind] ? " marked used" : " marked ready") + " (manual)." });
    return st[kind];
  }
  function reset(quiet) { st.action = false; st.bonus = false; st.reaction = false; st.attacks = 0; st.actionBy = ""; save(); paint(); if (!quiet) toast("Action, bonus action, and reaction are back."); }
  function onTurn(init) {
    if (!init || !Array.isArray(init.order) || !init.order.length) return;
    var k = String(init.round || 1) + ":" + String(Number(init.turn) || 0);
    if (k === st.turnKey) return;
    st.turnKey = k;
    reset(true);
  }
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
    var rTip = st.reaction ? "Reaction used this round." : "Reaction ready. Reaction spells spend it.";
    bTip += " Click to mark it " + (st.bonus ? "ready" : "used") + ".";
    rTip += " Click to mark it " + (st.reaction ? "ready" : "used") + ".";
    var partial = st.actionBy === "attack" && st.attacks < limit ? " partial" : "";
    return '<span class="act-pips" data-act-pips>' +
      '<span class="pip-label">This turn</span>' +
      '<button type="button" data-pip="action" aria-pressed="' + st.action + '" class="pip pip-action' + (st.action ? " used" : "") + partial + '" title="' + aTip + '">' + actionText() + '</button>' +
      '<button type="button" data-pip="bonus" aria-pressed="' + st.bonus + '" class="pip pip-bonus' + (st.bonus ? " used" : "") + '" title="' + bTip + '">Bonus</button>' +
      '<button type="button" data-pip="reaction" aria-pressed="' + st.reaction + '" class="pip pip-reaction' + (st.reaction ? " used" : "") + '" title="' + rTip + '">R</button>' +
      '<button type="button" class="btn xs pip-reset" data-pips-reset title="New turn: give back the action, bonus action, and reaction">Reset</button></span>';
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
      if (e.target && e.target.closest && e.target.closest("[data-pips-reset]")) reset(false);
      var pip = e.target && e.target.closest && e.target.closest("[data-pip]");
      if (pip) toggle(pip.getAttribute("data-pip"));
    });
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", paint); else paint();
  }
  root.SSDNSActionPips = {
    spend: spend, toggle: toggle, attack: attack, spell: spell, feature: feature, reset: reset, onTurn: onTurn, paint: paint,
    attacksPerAction: attacksPerAction, spellCost: spellCost, featureCost: featureCost, rulesCost: rulesCost,
    state: function () { return { action: st.action, bonus: st.bonus, reaction: st.reaction, attacks: st.attacks, actionBy: st.actionBy, turnKey: st.turnKey }; },
    costTag: costTag, needs: needs
  };
})(typeof window !== "undefined" ? window : this);

/**
 * 0.3.54: light per-turn action economy for gun actions.
 * Two pips: Action and Bonus. Gun actions spend them. Spending a used pip only warns (the DM can
 * override at the table); nothing is ever blocked. Pips reset when the turn changes (round/turn in
 * the DM's initiative) and by the Reset button.
 * Costs: "action", "bonus", "full" (slow load = action + bonus), "free" (no pip).
 */
(function (root) {
  "use strict";
  var KEY = "ssdns.actionPips.v1";
  var st = load();
  function load() {
    try { var v = JSON.parse(root.localStorage.getItem(KEY) || "null"); if (v && typeof v === "object") return v; } catch (e) {}
    return { action: false, bonus: false, turnKey: "" };
  }
  function save() { try { root.localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} }
  var LABEL = { action: "an action", bonus: "a bonus action", full: "a full turn (action + bonus)", free: "a free action" };
  function needs(cost) {
    if (cost === "full") return ["action", "bonus"];
    if (cost === "action" || cost === "bonus") return [cost];
    return [];
  }
  function toast(msg) { if (root.SSDNSToast) root.SSDNSToast(msg); }
  /** Spend for a gun action. Returns {over:boolean, cost}. Never blocks. */
  function spend(cost, what) {
    var list = needs(cost);
    var used = list.filter(function (k) { return st[k]; });
    var over = used.length > 0;
    list.forEach(function (k) { st[k] = true; });
    save(); paint();
    if (over) {
      var msg = (what || "That") + " costs " + (LABEL[cost] || cost) + ", and you already used " +
        (used.map(function (k) { return k === "bonus" ? "your bonus action" : "your action"; }).join(" and ")) +
        " this turn. Done anyway; the DM can allow it.";
      toast(msg);
      if (root.SSDNSSheet && root.SSDNSSheet.addLog) root.SSDNSSheet.addLog({ kind: "alert", text: msg });
    }
    return { over: over, cost: cost };
  }
  function reset(quiet) { st.action = false; st.bonus = false; save(); paint(); if (!quiet) toast("Action and bonus action are back."); }
  /** Called with the DM's initiative block; resets once per new turn. */
  function onTurn(init) {
    if (!init || !Array.isArray(init.order) || !init.order.length) return;
    var k = String(init.round || 1) + ":" + String(Number(init.turn) || 0);
    if (k === st.turnKey) return;
    st.turnKey = k;
    reset(true);
  }
  function costTag(cost) { return cost === "full" ? "Full turn" : (cost === "bonus" ? "Bonus" : (cost === "free" ? "Free" : "Action")); }
  function html() {
    return '<span class="act-pips" data-act-pips>' +
      '<span class="pip-label">This turn</span>' +
      '<span class="pip pip-action' + (st.action ? " used" : "") + '" title="Action' + (st.action ? " (used)" : " (ready)") + '">A</span>' +
      '<span class="pip pip-bonus' + (st.bonus ? " used" : "") + '" title="Bonus action' + (st.bonus ? " (used)" : " (ready)") + '">B</span>' +
      '<button type="button" class="btn xs pip-reset" data-pips-reset title="New turn: give back the action and bonus action">Reset</button></span>';
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
    });
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", paint); else paint();
  }
  root.SSDNSActionPips = { spend: spend, reset: reset, onTurn: onTurn, paint: paint, state: function () { return { action: st.action, bonus: st.bonus, turnKey: st.turnKey }; }, costTag: costTag, needs: needs };
})(typeof window !== "undefined" ? window : this);

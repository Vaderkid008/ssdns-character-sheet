/*
 * SSDNS Saloon wallet adapter (v0.2.1). Loaded after ssdns-bridge.js and the game's game.js.
 * Contract: the game exposes window.SSDNSGame = { id, get(), set(n), busy() } and calls
 * window.SSDNSWallet.seen(balance) whenever its chip balance changes. 1 chip = 1 ES.
 * Linked (a character is open in the sheet, same browser and folder): chips = the character's shards,
 * every change is written back via SSDNSBridge.applyDelta, and Set/Add chips are disabled.
 * Not linked: the game works exactly as before (pretend chips).
 */
(function () {
  "use strict";
  var B = window.SSDNSBridge, G = window.SSDNSGame;
  if (!B || !G) return;
  var linked = false, last = null, name = "";
  var bar = document.createElement("div");
  bar.className = "ssdns-link";
  bar.setAttribute("role", "status");
  bar.style.cssText = "font:600 13px/1.4 system-ui,sans-serif;padding:8px 12px;margin:0 0 8px;border-radius:6px;text-align:center;";
  document.body.insertBefore(bar, document.body.firstChild);
  function paint() {
    if (linked) {
      bar.style.background = "#2d4a2b"; bar.style.color = "#f3ead7";
      bar.textContent = "Linked to " + name + "'s shards: " + last + " ES. Breaking a bill for a bet costs 10%. Wins pay in full.";
    } else {
      bar.style.background = "#4a3b22"; bar.style.color = "#f3ead7";
      bar.textContent = "Not linked: open a character in the SSDNS Character Sheet (same browser) to play with real shards. These chips are pretend.";
    }
  }
  function lockChips(on) {
    ["setChipsBtn", "addChipsBtn", "chipInput"].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.disabled = on;
      el.title = on ? "Chips come from your character's shards while linked." : "";
    });
  }
  function link(w) {
    if (!w || !w.characterId) { linked = false; lockChips(false); paint(); return; }
    linked = true; name = w.characterName || "your character"; last = B.cpValue(w.shards);
    G.set(last); lockChips(true); paint();
  }
  window.SSDNSWallet = {
    seen: function (bal) {
      if (!linked || last === null || bal === last) return;
      var r = B.applyDelta(bal - last, "saloon:" + G.id);
      if (r) { last = bal; paint(); }
      else { var v = B.readWallet(); link(v); }   // wallet couldn't cover it: resync to the real shards
    },
    isLinked: function () { return linked; }
  };
  B.onChange(function (w) {
    if (!w || w.updatedBy === "saloon:" + G.id) return;
    if (G.busy && G.busy()) return;   // never yank chips mid-hand; next seen() resyncs the delta anyway
    link(w);
  });
  link(B.readWallet());
})();

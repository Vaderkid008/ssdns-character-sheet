/*
 * SSDNS wallet bridge (v1.1: adds applyDelta + breakdown; storage format unchanged, still v: 1).
 * A tiny shared contract so a Saloon game on the SAME ORIGIN as the character sheet
 * (same folder opened from disk in the same browser, or the same website) can read and
 * write the active character's Eldorite shards.
 *
 *   localStorage["ssdns.v1.wallet"] = JSON {
 *     v: 1,
 *     characterId: "c_…",          // which character these shards belong to
 *     characterName: "Jolene Pike",
 *     shards: { white, blue, green, yellow, purple },   // whole numbers, never negative
 *     updatedAt: "2026-09-29T23:40:00.000Z",
 *     updatedBy: "sheet" | "<game id>"   // e.g. "whiskey-bend-blackjack"
 *   }
 *
 * The sheet writes this key whenever the character loads or its shards change, and listens
 * for writes from other tabs. When a game writes new shards for the same characterId, the
 * sheet copies them into the character (doc.shards) and saves the .ssdns file as usual.
 *
 * Game usage (drop this file next to the game and include it):
 *   var w = SSDNSBridge.readWallet();          // null if no sheet has run here yet
 *   SSDNSBridge.writeShards({ yellow: w.shards.yellow - 5 }, "whiskey-bend-blackjack");
 *   SSDNSBridge.onChange(function (wallet) { ... });
 */
(function (root) {
  "use strict";
  var KEY = "ssdns.v1.wallet";
  var COLORS = ["white", "blue", "green", "yellow", "purple"];
  var CP = { white: 1, blue: 10, green: 50, yellow: 100, purple: 500 }; // ES per shard, PHB Equipment > Currency — Eldorite (10-05 book: Purple = 500 ES)
  try { (root.SSDNS_RULES && root.SSDNS_RULES.currency || []).forEach(function (c) { var v = c.es != null ? c.es : c.cp; if (c.id in CP && v) CP[c.id] = v; }); } catch (e) {}

  function cleanShards(s) {
    var out = {};
    COLORS.forEach(function (c) {
      var n = Math.floor(Number(s && s[c]));
      out[c] = isFinite(n) && n > 0 ? n : 0;
    });
    return out;
  }
  function readWallet() {
    try {
      var raw = root.localStorage.getItem(KEY);
      if (!raw) return null;
      var w = JSON.parse(raw);
      if (!w || typeof w !== "object") return null;
      w.shards = cleanShards(w.shards);
      return w;
    } catch (e) { return null; }
  }
  function writeWallet(w) {
    var out = {
      v: 1,
      characterId: w.characterId || "",
      characterName: w.characterName || "",
      shards: cleanShards(w.shards),
      updatedAt: new Date().toISOString(),
      updatedBy: w.updatedBy || "unknown"
    };
    root.localStorage.setItem(KEY, JSON.stringify(out));
    return out;
  }
  /** Merge a partial {color: count} into the current wallet and save it. */
  function writeShards(partial, by) {
    var w = readWallet();
    if (!w) throw new Error("No SSDNS character has been opened in this browser yet.");
    var s = w.shards;
    Object.keys(partial || {}).forEach(function (c) { if (COLORS.indexOf(c) >= 0) s[c] = partial[c]; });
    w.shards = s; w.updatedBy = by || "game";
    return writeWallet(w);
  }
  function onChange(cb) {
    root.addEventListener("storage", function (e) {
      if (e.key !== KEY) return;
      var w = readWallet();
      if (w) cb(w);
    });
  }
  function cpValue(s) {
    s = cleanShards(s);
    return COLORS.reduce(function (t, c) { return t + s[c] * CP[c]; }, 0);
  }
  /** Greedy shard breakdown of an ES amount (largest shard first). */
  function breakdown(es) {
    var out = cleanShards({}), left = Math.max(0, Math.floor(es));
    COLORS.slice().reverse().forEach(function (c) { out[c] = Math.floor(left / CP[c]); left -= out[c] * CP[c]; });
    return out;
  }
  /**
   * v1.1: apply a win (+) or loss (-) in ES to the wallet, like a saloon cashier (banks make change, PHB).
   * Wins are paid largest shard first. Losses are paid with the smallest shards first; any overpay comes back
   * as change, largest shard first. Returns the new wallet, or null if no character is linked or it can't cover it.
   */
  function applyDelta(deltaES, by) {
    var w = readWallet();
    if (!w) return null;
    var s = w.shards, d = Math.floor(Number(deltaES) || 0);
    if (d > 0) { var add = breakdown(d); COLORS.forEach(function (c) { s[c] += add[c]; }); }
    else if (d < 0) {
      var owe = -d;
      if (cpValue(s) < owe) return null;
      var paid = 0;
      COLORS.forEach(function (c) { while (paid < owe && s[c] > 0) { s[c] -= 1; paid += CP[c]; } });
      var ch = breakdown(paid - owe); COLORS.forEach(function (c) { s[c] += ch[c]; });
    }
    w.shards = s; w.updatedBy = by || "game";
    return writeWallet(w);
  }
  root.SSDNSBridge = { KEY: KEY, breakdown: breakdown, applyDelta: applyDelta, COLORS: COLORS, CP: CP, readWallet: readWallet, writeWallet: writeWallet, writeShards: writeShards, onChange: onChange, cpValue: cpValue, cleanShards: cleanShards };
})(window);

/**
 * Idempotent DM apply ids and heal/attack line text.
 * Applied ids live in localStorage because the DM is the only writer.
 */
(function (root) {
  "use strict";

  function key(room) {
    return "ssdns.dm.applied." + (room || "demo");
  }
  function storeOf(storage) {
    return storage || root.localStorage;
  }
  function load(room, storage) {
    try {
      var raw = storeOf(storage).getItem(key(room));
      var parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (e) { return {}; }
  }
  function save(room, set, storage) {
    try { storeOf(storage).setItem(key(room), JSON.stringify(set || {})); } catch (e) {}
  }
  /** Returns true the first time id is claimed. A second claim is a no-op. */
  function claim(room, id, storage) {
    if (!id) return false;
    var set = load(room, storage);
    if (set[id]) return false;
    set[id] = 1;
    save(room, set, storage);
    return true;
  }
  function release(room, id, storage) {
    if (!id) return;
    var set = load(room, storage);
    delete set[id];
    save(room, set, storage);
  }
  function has(room, id, storage) {
    if (!id) return false;
    return !!load(room, storage)[id];
  }
  function weaponName(label) {
    var s = String(label || "").trim();
    if (!s || s.indexOf("→") >= 0 || /\bheals\b/i.test(s)) return "";
    return s;
  }
  function healDice(detail) {
    return String(detail || "").replace(/[()]/g, "").replace(/\s+/g, " ").replace(/\s*=\s*\d+\s*$/, "").trim();
  }
  function healLine(who, target, amount, dice, before, after) {
    var diceTxt = healDice(dice);
    var line = (who || "Someone") + " heals " + (target || "someone") + " " + amount;
    if (diceTxt) line += " (" + diceTxt + ")";
    if (before != null && after != null && before !== "" && after !== "") line += " · HP " + before + "→" + after;
    return line;
  }
  function hitLine(who, target, weapon, amount) {
    var w = weaponName(weapon);
    return (who || "Someone") + " hits " + (target || "someone") + (w ? " with " + w : "") + " for " + amount;
  }

  root.SSDNSApplied = {
    key: key,
    load: load,
    claim: claim,
    release: release,
    has: has,
    weaponName: weaponName,
    healDice: healDice,
    healLine: healLine,
    hitLine: hitLine
  };
})(typeof window !== "undefined" ? window : globalThis);

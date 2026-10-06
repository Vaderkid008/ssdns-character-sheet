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
    delete set["undo:" + id];
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
    s = s.split(",")[0];
    s = s.replace(/\s*[+-]\s*\d+\b.*$/, "");
    s = s.replace(/\s+\d*d\d+.*$/i, "");
    s = s.replace(/\s*\(.*$/, "");
    return s.trim();
  }
  function beastCombatant(beast) {
    var b = beast || {};
    var list = Array.isArray(b.attackList) ? b.attackList : [];
    var first = list[0] || {};
    var dex = b.dex;
    if ((dex == null || dex === "") && b.abilities) dex = b.abilities.DEX;
    var initBonus = b.initBonus;
    if (initBonus == null || initBonus === "") {
      var n = Number(dex);
      initBonus = isFinite(n) ? Math.floor((n - 10) / 2) : 0;
    }
    var atk = first.bonus != null ? first.bonus : (first.atk != null ? first.atk : b.atkBonus);
    var damage = first.damage || first.dice || b.damage || "";
    return {
      ac: b.ac,
      hp: b.hp,
      maxHp: b.maxHp != null && b.maxHp !== "" ? b.maxHp : b.hp,
      dex: dex == null ? "" : dex,
      initBonus: initBonus,
      atkBonus: atk == null ? "" : atk,
      damage: damage,
      attacks: b.attacks || (first.name || "")
    };
  }
  function traitText(traits) {
    if (Array.isArray(traits)) {
      return traits.map(function (t) {
        if (!t) return "";
        if (typeof t === "string") return t;
        var name = t.name || "";
        var text = t.text || "";
        return name ? (name + (text ? ". " + text : "")) : String(text || "");
      }).filter(Boolean).join(" ");
    }
    if (traits && typeof traits === "object") return "";
    return String(traits || "");
  }
  function cleanName(name, fallback) {
    var s = String(name || "").trim();
    if (!s || /^target$/i.test(s) || /^no target$/i.test(s)) return fallback || "someone";
    return s;
  }
  function healDice(detail) {
    var s = String(detail || "");
    var m = s.match(/(\d*d\d+)\s*\(([^)]+)\)(?:\s*([+-]\s*\d+))?/i);
    if (m) {
      var flat = m[3] ? String(m[3]).replace(/\s/g, "") : "";
      return m[1] + ": " + String(m[2]).replace(/\s/g, "") + (flat ? ", " + flat : "");
    }
    return s.replace(/[()]/g, "").replace(/\s+/g, " ").replace(/\s*=\s*\d+\s*$/, "").trim();
  }
  function healLine(who, target, amount, dice, before, after) {
    var diceTxt = healDice(dice);
    var healer = cleanName(who, "Someone");
    var line = healer + " heals " + cleanName(target, healer) + " " + amount;
    if (diceTxt) line += " (" + diceTxt + ")";
    if (before != null && after != null && before !== "" && after !== "") line += " · HP " + before + "→" + after;
    return line;
  }
  function hitLine(who, target, weapon, amount) {
    var w = weaponName(weapon);
    var attacker = cleanName(who, "Someone");
    if (w && w.toLowerCase() === attacker.toLowerCase()) w = "";
    return attacker + " hits " + cleanName(target, "someone") + (w ? " with " + w : "") + " for " + amount;
  }
  /** True the first time an applied id is undone. A second undo is a no-op. */
  function takeUndo(room, id, storage) {
    if (!id) return false;
    var set = load(room, storage);
    var mark = "undo:" + id;
    if (set[mark] || !set[id]) return false;
    set[mark] = 1;
    delete set[id];
    save(room, set, storage);
    return true;
  }
  function sortInitiative(order, dexOf) {
    var dex = dexOf || function (row) {
      if (!row || row.dex == null || row.dex === "") return 10;
      var n = Number(row.dex);
      return isFinite(n) ? n : 10;
    };
    var indexed = (order || []).map(function (row, i) { return { row: Object.assign({}, row), i: i }; });
    indexed.sort(function (a, b) {
      var aOk = a.row.init !== "" && a.row.init != null && isFinite(Number(a.row.init));
      var bOk = b.row.init !== "" && b.row.init != null && isFinite(Number(b.row.init));
      var av = aOk ? Number(a.row.init) : -Infinity;
      var bv = bOk ? Number(b.row.init) : -Infinity;
      if (bv !== av) return bv - av;
      var dd = dex(b.row) - dex(a.row);
      if (dd) return dd;
      return a.i - b.i;
    });
    var out = indexed.map(function (x) { return x.row; });
    out.forEach(function (row, i, arr) {
      var same = function (other) {
        return other && row.init !== "" && row.init != null && Number(other.init) === Number(row.init);
      };
      row.tie = !!(same(arr[i - 1]) || same(arr[i + 1]));
    });
    return out;
  }
  var offsetMs = 0;
  function setOffset(n) {
    var v = Number(n);
    offsetMs = isFinite(v) ? v : 0;
  }
  function offset() { return offsetMs; }
  /** Age of a stamp against estimated server time. */
  function stampAge(iso) {
    var t = Date.parse(iso);
    if (!isFinite(t)) return Infinity;
    return (Date.now() + offsetMs) - t;
  }
  function formatTime(iso, withSeconds) {
    var t = Date.parse(iso);
    if (!isFinite(t)) return "—";
    var d = new Date(t - offsetMs);
    var opts = { hour: "numeric", minute: "2-digit" };
    if (withSeconds !== false) opts.second = "2-digit";
    try { return d.toLocaleTimeString([], opts); } catch (e) { return "—"; }
  }

  root.SSDNSApplied = {
    key: key,
    load: load,
    claim: claim,
    release: release,
    has: has,
    weaponName: weaponName,
    beastCombatant: beastCombatant,
    traitText: traitText,
    healDice: healDice,
    healLine: healLine,
    hitLine: hitLine,
    cleanName: cleanName,
    takeUndo: takeUndo,
    sortInitiative: sortInitiative
  };
  root.SSDNSClock = {
    setOffset: setOffset,
    offset: offset,
    stampAge: stampAge,
    format: formatTime
  };
})(typeof window !== "undefined" ? window : globalThis);

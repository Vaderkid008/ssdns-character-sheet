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
  function undoneKey(id) { return "undo:" + id; }
  function undone(room, id, storage) {
    if (!id) return false;
    return !!load(room, storage)[undoneKey(id)];
  }
  /** An id that was applied or undone must not be applied again after a reload. */
  function settled(room, id, storage) {
    return has(room, id, storage) || undone(room, id, storage);
  }
  function claim(room, id, storage) {
    if (!id) return false;
    var set = load(room, storage);
    if (set[id] || set[undoneKey(id)]) return false;
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
    var atk = first.bonus != null ? first.bonus : (first.toHit != null ? first.toHit : (first.atk != null ? first.atk : b.atkBonus));
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
  /** Player invite for a DM page. Forks keep their own origin and path. */
  function sheetInviteUrl(href, code) {
    var room = String(code || "").trim().toUpperCase();
    if (!room) return "";
    var url;
    try { url = new URL(String(href || ""), "http://localhost/"); }
    catch (e) { return ""; }
    var path = String(url.pathname || "/");
    path = path.replace(/\/dm\/index\.html$/i, "/").replace(/\/dm\/?$/i, "/");
    if (!path) path = "/";
    if (path.charAt(path.length - 1) !== "/") path += "/";
    url.pathname = path;
    url.search = "?room=" + encodeURIComponent(room);
    url.hash = "room=" + encodeURIComponent(room);
    return url.toString();
  }
  /** Stay on the table unless the DM explicitly left, ended, or started new. */
  function staysInRoom(sessionOpen, reason) {
    if (!sessionOpen) return false;
    return reason !== "leave" && reason !== "end" && reason !== "new";
  }
  function resumeInsteadOfLobby(openFlag) {
    return !!(openFlag && openFlag.code);
  }
  function attackButtonLabel(atk) {
    atk = atk || {};
    var name = String(atk.name || "Attack").trim() || "Attack";
    var bonus = atk.toHit != null && atk.toHit !== "" ? atk.toHit : (atk.bonus != null ? atk.bonus : "");
    var n = Number(bonus);
    if (bonus === "" || !isFinite(n)) return name;
    return name + " " + (n >= 0 ? "+" : "") + n;
  }
  function gunEmpty(gun) {
    var g = gun || {};
    if (Array.isArray(g.chambers) && g.chambers.length) return !g.chambers.some(Boolean);
    return !(Number(g.loaded) > 0);
  }
  function showHitApply(roll) {
    if (!roll || !roll.id) return false;
    var amt = Number(roll.damage);
    if (!isFinite(amt) || amt <= 0) return false;
    var heal = !!(roll.heal || /\bheals\b/i.test(String(roll.detail || "")));
    if (!heal && (Number(roll.nat) === 1 || /→\s*MISS/.test(String(roll.detail || "")))) return false;
    var name = String(roll.targetName || "").trim();
    var unnamed = !name || /^target$/i.test(name) || /^no target$/i.test(name);
    if (!heal && !roll.targetId && unnamed) return false;
    if (roll.outOfTurn) return false;
    return true;
  }
  function dedupeById(list) {
    var seen = {};
    var out = [];
    (list || []).forEach(function (row) {
      if (!row) return;
      if (row.id) {
        if (seen[row.id]) return;
        seen[row.id] = 1;
      }
      out.push(row);
    });
    return out;
  }
  function cartridgeTier(caliber) {
    var s = String(caliber || "").trim().toLowerCase();
    if (!s) return "";
    if (s === "light" || s === ".22 lr" || s === ".32 long" || s === ".44 rimfire") return "Light";
    if (s === "medium" || s === ".357" || s === ".44-40" || s === ".45 long" || s === ".45 colt") return "Medium";
    if (s === "heavy") return "Heavy";
    return "";
  }
  function cartridgePoolLabel(caliber) {
    var tier = cartridgeTier(caliber);
    return tier ? ("Cartridges (" + tier + ")") : "";
  }
  /** Max rises when current HP is set above it. A lower current leaves max alone. */
  function followMaxHp(current, max) {
    var c = Number(current);
    var m = Number(max);
    var cOk = current !== "" && current != null && isFinite(c);
    var mOk = max !== "" && max != null && isFinite(m);
    if (!cOk) return mOk ? m : null;
    if (!mOk) return c;
    return Math.max(m, c);
  }
  function hpEditLine(name, before, after) {
    return (name || "Enemy") + " HP " + (before == null || before === "" ? "—" : before) + " → " + after + " (DM edit)";
  }
  var PRESENCE_LEAVE_MS = 30000;
  /**
   * A connection blip stays "online" until the leave wait expires.
   * state: { phase: "new"|"online"|"offline", pending: bool }
   */
  function presenceStep(state, online) {
    var phase = (state && state.phase) || "new";
    var pending = !!(state && state.pending);
    if (online) {
      if (pending || phase === "online") {
        return { phase: "online", pending: false, log: "", arm: false, cancel: pending };
      }
      if (phase === "offline") return { phase: "online", pending: false, log: "rejoin", arm: false, cancel: true };
      return { phase: "online", pending: false, log: "join", arm: false, cancel: false };
    }
    if (phase === "online" && !pending) {
      return { phase: "online", pending: true, log: "", arm: true, cancel: false };
    }
    return { phase: phase, pending: pending, log: "", arm: false, cancel: false };
  }
  function presenceLeave() {
    return { phase: "offline", pending: false, log: "leave", arm: false, cancel: false };
  }
  function enqueueToast(queue, item, cap) {
    var list = Array.isArray(queue) ? queue.slice() : [];
    var msg = item && item.msg;
    if (msg && list.some(function (row) { return row && row.msg === msg; })) return list;
    list.push(item);
    var limit = cap || 3;
    while (list.length > limit) list.shift();
    return list;
  }
  function abilityScores(beast) {
    var b = beast || {};
    var src = b.abilities || {};
    function pick(key) {
      if (src[key] != null && src[key] !== "") return Number(src[key]);
      var flat = b[key.toLowerCase()];
      return flat == null || flat === "" ? null : Number(flat);
    }
    return { STR: pick("STR"), DEX: pick("DEX"), CON: pick("CON"), INT: pick("INT"), WIS: pick("WIS"), CHA: pick("CHA") };
  }
  function abilityMod(score) {
    var n = Number(score);
    if (!isFinite(n)) return 0;
    return Math.floor((n - 10) / 2);
  }
  function isMisfire(nat, ceiling) {
    var n = Number(nat);
    var c = Number(ceiling);
    if (!isFinite(n)) return false;
    if (isFinite(c) && c >= 1) return n <= c;
    return false;
  }
  function publicDetail(text) {
    return String(text || "")
      .replace(/\s*vs AC \d+/gi, "")
      .replace(/\bDC \d+\b/gi, "")
      .replace(/\s{2,}/g, " ")
      .replace(/\s+([.,])/g, "$1")
      .trim();
  }
  function enemyCardModel(beast) {
    var b = beast || {};
    var attacks = (Array.isArray(b.attackList) ? b.attackList : []).map(function (a, n) {
      a = a || {};
      var toHit = a.bonus != null ? a.bonus : (a.toHit != null ? a.toHit : (a.atk != null ? a.atk : b.atkBonus));
      var cap = a.capacity == null || a.capacity === "" ? null : Number(a.capacity);
      return {
        id: a.id || ("atk-" + n),
        name: a.name || "Attack",
        kind: a.kind || "",
        toHit: toHit == null ? "" : toHit,
        damage: a.damage || a.dice || b.damage || "",
        damageType: a.damageType || "",
        range: a.range || "",
        capacity: cap,
        loaded: cap,
        misfire: a.misfire == null || a.misfire === "" ? null : Number(a.misfire),
        jammed: false,
        notes: a.notes || "",
        rider: a.rider || null
      };
    });
    var casting = b.spellcasting || null;
    var slots = {};
    if (casting && casting.slots && typeof casting.slots === "object") {
      Object.keys(casting.slots).forEach(function (lv) {
        var n = Number(casting.slots[lv]);
        if (isFinite(n) && n > 0) slots[lv] = { max: n, left: n };
      });
    }
    return {
      scores: abilityScores(b),
      saves: b.saves || {},
      skills: b.skills || {},
      senses: b.senses || "",
      description: b.description || "",
      cr: b.cr || "",
      speed: b.speed == null ? "" : b.speed,
      traits: Array.isArray(b.traits) ? b.traits : [],
      actions: Array.isArray(b.actions) ? b.actions : [],
      reactions: Array.isArray(b.reactions) ? b.reactions : [],
      legendary: Array.isArray(b.legendary) ? b.legendary : [],
      spellcasting: casting,
      slots: slots,
      attacks: attacks,
      loot: b.loot || "",
      esDrop: b.esDrop == null || b.esDrop === "" ? null : b.esDrop,
      tactics: tacticsNote(b)
    };
  }
  function tacticsNote(source) {
    source = source || {};
    var card = source.card && typeof source.card === "object" ? source.card : null;
    var direct = source.tactics != null && String(source.tactics).trim() !== ""
      ? source.tactics
      : (card && card.tactics);
    if (direct != null && String(direct).trim() !== "") return String(direct).trim();
    var traits = Array.isArray(source.traits) ? source.traits : (card && Array.isArray(card.traits) ? card.traits : []);
    for (var i = 0; i < traits.length; i++) {
      var t = traits[i];
      if (!t) continue;
      var name = typeof t === "string" ? t : String(t.name || "");
      if (!/^(tactics|morale)\b/i.test(name.trim())) continue;
      var text = typeof t === "string" ? "" : String(t.text || "").trim();
      return text || name.trim();
    }
    return "";
  }
  function saveMod(card, ability) {
    card = card || {};
    var key = String(ability || "").toUpperCase();
    var listed = card.saves && card.saves[key];
    if (listed && typeof listed === "object") listed = listed.bonus != null ? listed.bonus : listed.mod;
    if (listed != null && listed !== "" && isFinite(Number(listed))) return Number(listed);
    return abilityMod(card.scores && card.scores[key]);
  }
  function riderText(rider) {
    if (!rider) return "";
    var dc = rider.dc == null || rider.dc === "" ? "" : ("DC " + rider.dc);
    var save = rider.save ? String(rider.save).toUpperCase() : "";
    var cond = rider.condition || "";
    var head = [dc, save].filter(Boolean).join(" ");
    if (head && cond) return head + " or " + cond;
    return head || cond;
  }
  function dcLines(card) {
    var lines = [];
    ((card && card.attacks) || []).forEach(function (atk) {
      var text = riderText(atk && atk.rider);
      if (text) lines.push((atk.name || "Attack") + ": " + text);
    });
    var cast = card && card.spellcasting;
    if (cast && cast.dc != null && cast.dc !== "") {
      lines.push("Spell save DC " + cast.dc + (cast.ability ? " (" + cast.ability + ")" : ""));
    }
    return lines;
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
    sheetInviteUrl: sheetInviteUrl,
    abilityScores: abilityScores,
    abilityMod: abilityMod,
    isMisfire: isMisfire,
    publicDetail: publicDetail,
    enemyCardModel: enemyCardModel,
    saveMod: saveMod,
    riderText: riderText,
    dcLines: dcLines,
    tacticsNote: tacticsNote,
    healDice: healDice,
    healLine: healLine,
    hitLine: hitLine,
    cleanName: cleanName,
    takeUndo: takeUndo,
    undone: undone,
    settled: settled,
    sortInitiative: sortInitiative,
    staysInRoom: staysInRoom,
    resumeInsteadOfLobby: resumeInsteadOfLobby,
    attackButtonLabel: attackButtonLabel,
    gunEmpty: gunEmpty,
    showHitApply: showHitApply,
    dedupeById: dedupeById,
    cartridgeTier: cartridgeTier,
    cartridgePoolLabel: cartridgePoolLabel,
    followMaxHp: followMaxHp,
    hpEditLine: hpEditLine,
    PRESENCE_LEAVE_MS: PRESENCE_LEAVE_MS,
    presenceStep: presenceStep,
    presenceLeave: presenceLeave,
    enqueueToast: enqueueToast
  };
  root.SSDNSClock = {
    setOffset: setOffset,
    offset: offset,
    stampAge: stampAge,
    format: formatTime
  };
})(typeof window !== "undefined" ? window : globalThis);

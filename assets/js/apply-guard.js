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
  /**
   * Lobby / room status strip after the DM ends, leaves, or moves the table.
   * An ended room is never "live".
   */
  function sessionStrip(event, info) {
    info = info || {};
    var code = String(info.code || "").trim();
    var roomStatus = String(info.roomStatus || "");
    var demo = !!info.demo;
    var ended = event === "end" || roomStatus === "ended";
    if (ended) {
      if (demo) return { mode: "demo", text: "Demo mode · offline · no Firebase loaded" };
      return { mode: "offline", text: "Session ended" };
    }
    if (event === "leave") {
      if (demo) {
        return {
          mode: "demo",
          text: code ? ("Demo mode · offline · resume " + code + " or start a new session") : "Demo mode · offline"
        };
      }
      if (code) return { mode: "live", text: "Live · resume " + code + " or start a new session" };
      return { mode: "offline", text: "Left the room" };
    }
    if (event === "move") {
      if (demo) return { mode: "demo", text: code ? ("Demo mode · offline · code " + code) : "Demo mode · offline" };
      if (code) return { mode: "live", text: "Live · " + code + " · players stay connected" };
      return { mode: "offline", text: "Session ended" };
    }
    return { mode: "offline", text: "Session ended" };
  }
  var HIDDEN_ENEMY_NAME = "Unknown gunman";
  function revealFlags(row) {
    var src = (row && row.reveal) || {};
    return {
      name: src.name !== false,
      ac: !!src.ac,
      hp: !!src.hp,
      block: !!src.block
    };
  }
  function coarseStatus(row) {
    if (!row || row.kind === "player") return (row && row.status) || "";
    var status = String(row.status || "");
    if (row.fled || status === "Fled") return "Fled";
    var hp = Number(row.hp);
    var max = Number(row.maxHp);
    if (row.hp == null || row.hp === "" || !isFinite(hp)) {
      if (/^(Unhurt|Hurt|Bloodied|Down|Fled)$/.test(status)) return status;
      return "";
    }
    if (hp <= 0) return "Down";
    if (!isFinite(max) || max <= 0) return "Hurt";
    if (hp >= max) return "Unhurt";
    if (hp * 2 <= max) return "Bloodied";
    return "Hurt";
  }
  function conditionNames(list) {
    var out = [];
    (list || []).forEach(function (raw) {
      var name = typeof raw === "string" ? raw : (raw && (raw.name || raw.label)) || "";
      name = String(name || "").trim();
      if (name && out.indexOf(name) < 0) out.push(name);
    });
    return out;
  }
  function combatantSide(row) {
    if (!row || row.kind === "player") return "enemy";
    if (row.ally === true || row.friendly === true) return "friendly";
    var side = String(row.side || "").toLowerCase();
    if (side === "friendly" || side === "ally") return "friendly";
    return "enemy";
  }
  function publicEnemy(row, slot, conditions) {
    row = row || {};
    var flags = revealFlags(row);
    var enemy = row.kind !== "player";
    var name = !enemy || flags.name ? (String(row.name || "").trim() || (enemy ? "Enemy" : "Player")) : HIDDEN_ENEMY_NAME;
    var out = {
      name: name,
      slot: slot == null ? "" : slot,
      status: enemy ? coarseStatus(row) : (row.status || ""),
      kind: row.kind || "",
      playerId: row.playerId || "",
      conditions: enemy ? conditionNames(conditions || row.conditions) : []
    };
    if (enemy) out.side = combatantSide(row);
    if (!enemy) return out;
    var revealed = {};
    if (flags.ac && row.ac != null && row.ac !== "" && isFinite(Number(row.ac))) revealed.ac = Number(row.ac);
    if (flags.hp) {
      if (row.hp != null && row.hp !== "") revealed.hp = row.hp;
      if (row.maxHp != null && row.maxHp !== "") revealed.maxHp = row.maxHp;
    }
    if (flags.block) {
      var card = row.card || {};
      revealed.block = {
        saves: card.saves || row.saves || null,
        attacks: card.attacks || row.attackList || null,
        traits: card.traits || row.traits || null,
        tactics: row.tactics || card.tactics || "",
        dcs: row.dcs || null
      };
    }
    if (Object.keys(revealed).length) out.revealed = revealed;
    return out;
  }
  function secretEnemy(row) {
    row = row || {};
    var card = row.card || {};
    var secret = {
      name: row.name || "",
      ac: row.ac == null ? "" : row.ac,
      hp: row.hp == null ? "" : row.hp,
      maxHp: row.maxHp == null ? "" : row.maxHp,
      dex: row.dex == null ? "" : row.dex,
      atkBonus: row.atkBonus == null ? "" : row.atkBonus,
      damage: row.damage || "",
      tactics: row.tactics || card.tactics || "",
      saves: card.saves || null,
      attacks: card.attacks || row.attackList || null,
      traits: card.traits || null,
      dcs: row.dcs || null,
      scores: card.scores || null,
      skills: card.skills || null,
      spellcasting: card.spellcasting || null,
      reveal: revealFlags(row),
      side: combatantSide(row)
    };
    try { secret.card = JSON.parse(JSON.stringify(card)); } catch (e) { secret.card = null; }
    return secret;
  }
  /** HIT, MISS, or CRIT from the player's d20 total. AC stays on the DM side. */
  function attackVerdict(info) {
    info = info || {};
    var nat = Number(info.nat);
    var total = Number(info.total);
    var ac = info.ac;
    var have = ac != null && ac !== "" && isFinite(Number(ac));
    var miss = nat === 1 || !!info.misfire;
    if (!miss && have && isFinite(total) && total < Number(ac)) miss = true;
    var crit = !miss && nat === 20;
    return {
      miss: miss,
      crit: crit,
      verdict: miss ? "MISS" : (crit ? "CRIT" : "HIT"),
      sfx: miss ? "" : (info.sfx || "attack")
    };
  }
  function attackShots(info) {
    info = info || {};
    var raw = info.shots;
    var shots = Array.isArray(raw) ? raw : [];
    if (!Array.isArray(raw) && raw && typeof raw === "object") {
      shots = Object.keys(raw).sort(function (a, b) { return Number(a) - Number(b); }).map(function (k) { return raw[k]; });
    }
    var parts = [];
    var amount = 0;
    var anyHit = false;
    var anyCrit = false;
    shots.forEach(function (shot, i) {
      shot = shot || {};
      var v = attackVerdict({ nat: shot.nat, total: shot.total, ac: info.ac, misfire: shot.misfire, sfx: info.sfx });
      var bit = (shot.label || ("ray " + (i + 1))) + " " + attackRollCore({ nat: shot.nat, total: shot.total, atk: shot.atk }) + " → " + v.verdict;
      if (!v.miss) {
        anyHit = true;
        if (v.crit) anyCrit = true;
        var n = Number(shot.amount) || 0;
        amount += n;
        if (shot.dice) bit += " · " + shot.dice;
        else if (n) bit += " = " + n;
      }
      parts.push(bit);
    });
    var who = info.who || "Someone";
    var target = info.target || "enemy";
    return {
      miss: !anyHit,
      crit: anyHit && anyCrit,
      verdict: anyHit ? (anyCrit ? "CRIT" : "HIT") : "MISS",
      sfx: anyHit ? (info.sfx || "attack") : "",
      amount: amount,
      line: who + " → " + target + ": " + parts.join("; ")
    };
  }
  function attackPublicLine(info, verdict) {
    info = info || {};
    verdict = verdict || attackVerdict(info);
    var who = info.who || "Someone";
    var target = info.target || "enemy";
    var dice = !verdict.miss && info.dice ? (" · " + info.dice) : "";
    var amount = !verdict.miss && info.amount != null && info.amount !== "" ? (" = " + info.amount) : "";
    return who + " → " + target + ": " + attackRollCore(info) + " → " + verdict.verdict + dice + amount;
  }
  /** Refuse an in-room LIVE line once the DM has left the table or the room has ended. */
  function liveStripAllowed(mode, text, info) {
    if (mode !== "live") return true;
    info = info || {};
    var line = String(text || "");
    var roomStatus = String(info.roomStatus || "");
    var inRoom = !!info.inRoom;
    var closed = roomStatus === "ended" || roomStatus === "moved";
    if (/players stay connected/i.test(line) && (!inRoom || closed)) return false;
    if (closed && /players stay connected|resume /i.test(line)) return false;
    return true;
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
  function labelText(v) {
    if (v == null) return "";
    var s = String(v).trim();
    if (!s || /^undefined$/i.test(s) || /^null$/i.test(s)) return "";
    return s;
  }
  function sheetHeader(parts) {
    parts = parts || {};
    var size = labelText(parts.size);
    var type = labelText(parts.type);
    var who = [size, type].filter(Boolean).join(" ");
    var bits = [];
    if (who) bits.push(who);
    var cr = labelText(parts.cr);
    if (cr) bits.push("CR " + cr);
    var side = labelText(parts.side);
    if (side) bits.push(side);
    var speed = labelText(parts.speed);
    if (speed) bits.push("Speed " + speed);
    return bits.join(" · ");
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
        rider: a.rider || null,
        saveDamage: a.saveDamage || null,
        grapple: a.grapple || null,
        saveEffect: a.saveEffect || null,
        extraDamage: a.extraDamage || null,
        versatile: a.versatile || ""
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
      size: labelText(b.size),
      type: labelText(b.type),
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
  function namedCondition(rider) {
    if (!rider) return "";
    var name = String(rider.condition || "").trim();
    if (!name || /^condition$/i.test(name)) return "";
    return name;
  }
  function riderText(rider) {
    if (!rider) return "";
    var dc = rider.dc == null || rider.dc === "" ? "" : ("DC " + rider.dc);
    var save = rider.save ? String(rider.save).toUpperCase() : "";
    var cond = namedCondition(rider);
    var head = [dc, save].filter(Boolean).join(" ");
    if (head && cond) return head + " or " + cond;
    return head || cond;
  }
  function grappleText(grapple) {
    if (!grapple || grapple.escapeDc == null || grapple.escapeDc === "") return "";
    return "Grappled (escape DC " + grapple.escapeDc + ")";
  }
  function saveDamageText(spec) {
    if (!spec) return "";
    var dc = spec.dc == null || spec.dc === "" ? "" : ("DC " + spec.dc);
    var save = spec.save ? String(spec.save).toUpperCase() : "";
    var dmg = [spec.damage, spec.damageType].filter(Boolean).join(" ");
    var half = spec.onSave === "half" ? "half on a success" : "";
    return [dc, save, dmg, half].filter(Boolean).join(" ");
  }
  function saveEffectText(spec) {
    if (!spec) return "";
    var dc = spec.dc == null || spec.dc === "" ? "" : ("DC " + spec.dc);
    var save = spec.save ? String(spec.save).toUpperCase() : "";
    return [dc, save].filter(Boolean).join(" ");
  }
  function halved(n) {
    var v = Number(n);
    if (!isFinite(v)) return 0;
    return Math.floor(v / 2);
  }
  function dcLines(card) {
    var lines = [];
    ((card && card.attacks) || []).forEach(function (atk) {
      if (!atk) return;
      var text = riderText(atk.rider);
      if (text) lines.push((atk.name || "Attack") + ": " + text);
      var poison = saveDamageText(atk.saveDamage);
      if (poison) lines.push((atk.name || "Attack") + ": " + poison);
      var grip = grappleText(atk.grapple);
      if (grip) lines.push((atk.name || "Attack") + ": " + grip);
      var effect = saveEffectText(atk.saveEffect);
      if (effect) lines.push((atk.name || "Attack") + ": " + effect);
    });
    var cast = card && card.spellcasting;
    if (cast && cast.dc != null && cast.dc !== "") {
      lines.push("Spell save DC " + cast.dc + (cast.ability ? " (" + cast.ability + ")" : ""));
    }
    return lines;
  }
  var ABILITY_KEYS = ["STR", "DEX", "CON", "INT", "WIS", "CHA"];
  function isUnusableTarget(row) {
    if (!row) return true;
    if (row.fled || row.left || row.departed) return true;
    var status = String(row.status || "");
    if (/^(fled|left|gone)$/i.test(status)) return true;
    var hp = row.hp;
    if ((hp == null || hp === "") && row.revealed && row.revealed.hp != null && row.revealed.hp !== "") hp = row.revealed.hp;
    var known = hp != null && hp !== "" && isFinite(Number(hp));
    if (known && Number(hp) > 0) return false;
    if (known && Number(hp) <= 0) return true;
    if (/^(down|dead|unconscious|dying)$/i.test(status)) return true;
    if (conditionNames(row.conditions).some(function (name) { return /unconscious|dead|dying/i.test(name); })) return true;
    return false;
  }
  function isLivingHostile(row) {
    if (!row || isUnusableTarget(row)) return false;
    if (row.kind === "player") return false;
    var side = String(row.side || combatantSide(row) || "").toLowerCase();
    if (side === "friendly" || side === "ally") return false;
    return true;
  }
  /** HP wins over a sticky Down. Fled stays fled. A living creature is not Down. */
  function refreshCombatantStatus(row) {
    if (!row) return "";
    if (row.fled || String(row.status || "") === "Fled") {
      row.status = "Fled";
      return "Fled";
    }
    var hp = row.hp;
    if ((hp == null || hp === "") && row.revealed && row.revealed.hp != null && row.revealed.hp !== "") hp = row.revealed.hp;
    var known = hp != null && hp !== "" && isFinite(Number(hp));
    var n = known ? Number(hp) : null;
    if (known && n <= 0) {
      row.status = "Down";
      return "Down";
    }
    if (known && n > 0 && /^(down|dead|unconscious|dying)$/i.test(String(row.status || ""))) row.status = "";
    if (row.kind === "player") return row.status || "";
    if (known) row.status = coarseStatus(row);
    return row.status || "";
  }
  function chamberClick(token, indexed) {
    if (!indexed) return { action: "advance" };
    if (token == null || token === "") return { action: "empty" };
    var s = String(token);
    if (/^[1-9]$/.test(s) || s.indexOf("k:hex:") === 0) return { action: "hex" };
    return { action: "fire" };
  }
  /** Hex and cantrip shots spend a spell, not a cartridge pile. */
  function shotConsumesCartridge(kind) {
    var k = String(kind || "");
    if (!k || k === "hex" || k === "cantrip" || k === "spell") return false;
    return k === "plain" || k === "cartridge" || k === "buck" || k === "slug" || k === "percussion" || k === "bigfifty" || k === "arrows";
  }
  function parseAsi(text) {
    var fixed = { STR: 0, DEX: 0, CON: 0, INT: 0, WIS: 0, CHA: 0 };
    var s = String(text || "");
    var names = { strength: "STR", dexterity: "DEX", constitution: "CON", intelligence: "INT", wisdom: "WIS", charisma: "CHA" };
    var re = /(strength|dexterity|constitution|intelligence|wisdom|charisma)\s+score\s+increases\s+by\s+(\d+)/gi;
    var m;
    while ((m = re.exec(s))) fixed[names[m[1].toLowerCase()]] += Number(m[2]) || 0;
    var each = s.match(/ability scores each increase by\s+(\d+)/i);
    if (each) {
      var bump = Number(each[1]) || 0;
      ABILITY_KEYS.forEach(function (key) { fixed[key] += bump; });
    }
    var choices = [];
    var cre = /(one|two|three|\d+)\s+(?:different|other)\s+ability scores of your choice increase by\s+(\d+)/gi;
    var words = { one: 1, two: 2, three: 3 };
    while ((m = cre.exec(s))) {
      var count = words[String(m[1] || "").toLowerCase()] || Number(m[1]) || 0;
      var by = Number(m[2]) || 0;
      if (count > 0 && by > 0) choices.push({ count: count, by: by });
    }
    return { fixed: fixed, choices: choices };
  }
  function mergeAsi(parts) {
    var fixed = { STR: 0, DEX: 0, CON: 0, INT: 0, WIS: 0, CHA: 0 };
    var choices = [];
    (parts || []).forEach(function (part) {
      if (!part) return;
      ABILITY_KEYS.forEach(function (key) { fixed[key] += Number(part.fixed && part.fixed[key]) || 0; });
      (part.choices || []).forEach(function (choice) { choices.push(choice); });
    });
    return { fixed: fixed, choices: choices };
  }
  function applyAsiScores(abilities, previous, next) {
    var out = {};
    var changed = false;
    ABILITY_KEYS.forEach(function (key) {
      var raw = abilities && abilities[key];
      var base = raw == null || raw === "" || !isFinite(Number(raw)) ? 10 : Number(raw);
      var delta = (Number(next && next[key]) || 0) - (Number(previous && previous[key]) || 0);
      out[key] = base + delta;
      if (delta) changed = true;
    });
    return { abilities: out, changed: changed };
  }
  /** Same contract as the sheet HP recalc: match a full pool, otherwise shift current by the max delta. */
  function adjustCurrentHp(current, oldMax, nextMax) {
    var next = Number(nextMax);
    if (!isFinite(next)) return current;
    var curKnown = current != null && current !== "" && isFinite(Number(current));
    var oldKnown = oldMax != null && oldMax !== "" && isFinite(Number(oldMax));
    if (!curKnown) return next;
    var cur = Number(current);
    if (oldKnown && cur === Number(oldMax)) return next;
    if (oldKnown) return Math.max(0, cur + (next - Number(oldMax)));
    return next;
  }
  function attackMod(info) {
    info = info || {};
    var bonus = info.atk != null && info.atk !== "" ? Number(info.atk) : (info.bonus != null && info.bonus !== "" ? Number(info.bonus) : NaN);
    if (!isFinite(bonus) && info.nat != null && info.nat !== "" && info.total != null && info.total !== "") {
      var nat = Number(info.nat);
      var total = Number(info.total);
      if (isFinite(nat) && isFinite(total)) bonus = total - nat;
    }
    if (!isFinite(bonus)) return "";
    return (bonus >= 0 ? "+" : "") + bonus;
  }
  function attackRollCore(info) {
    info = info || {};
    var nat = info.nat == null || info.nat === "" ? "" : String(info.nat);
    var total = info.total == null || info.total === "" ? "" : String(info.total);
    var modTxt = attackMod(info);
    if (nat === "") return total;
    if (!modTxt) modTxt = "+0";
    return nat + modTxt + (total !== "" ? " = " + total : "");
  }
  function speakerName(character, player) {
    var who = String(character || "").trim();
    if (who) return who;
    return String(player || "").trim();
  }
  function stripGhostCombatants(order, playerIds) {
    var ids = playerIds || null;
    return (order || []).filter(function (row) {
      if (!row) return false;
      if (row.kind !== "player") return true;
      var id = row.playerId || row.id;
      if (!id) return false;
      if (row.departed || row.left) return false;
      if (ids && !ids[id]) return false;
      return true;
    });
  }
  function presenceShownOnline(rawOnline, phase) {
    if (phase === "online") return true;
    if (phase === "offline") return false;
    return !!rawOnline;
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
    sheetHeader: sheetHeader,
    saveMod: saveMod,
    namedCondition: namedCondition,
    riderText: riderText,
    grappleText: grappleText,
    saveDamageText: saveDamageText,
    saveEffectText: saveEffectText,
    halved: halved,
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
    sessionStrip: sessionStrip,
    liveStripAllowed: liveStripAllowed,
    revealFlags: revealFlags,
    coarseStatus: coarseStatus,
    combatantSide: combatantSide,
    publicEnemy: publicEnemy,
    secretEnemy: secretEnemy,
    attackVerdict: attackVerdict,
    attackShots: attackShots,
    attackPublicLine: attackPublicLine,
    HIDDEN_ENEMY_NAME: HIDDEN_ENEMY_NAME,
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
    enqueueToast: enqueueToast,
    isUnusableTarget: isUnusableTarget,
    isLivingHostile: isLivingHostile,
    refreshCombatantStatus: refreshCombatantStatus,
    chamberClick: chamberClick,
    shotConsumesCartridge: shotConsumesCartridge,
    parseAsi: parseAsi,
    mergeAsi: mergeAsi,
    applyAsiScores: applyAsiScores,
    adjustCurrentHp: adjustCurrentHp,
    attackMod: attackMod,
    attackRollCore: attackRollCore,
    speakerName: speakerName,
    stripGhostCombatants: stripGhostCombatants,
    presenceShownOnline: presenceShownOnline
  };
  root.SSDNSClock = {
    setOffset: setOffset,
    offset: offset,
    stampAge: stampAge,
    format: formatTime
  };
})(typeof window !== "undefined" ? window : globalThis);

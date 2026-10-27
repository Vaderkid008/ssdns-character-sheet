/**
 * N79 Phase 1c C — Mage Armor, Shield, Bless/Bane, concentration.
 * Pure rules for the sheet and the DM Command Center. rules.js is not edited.
 * 5e 2014 PHB.
 */
(function (root) {
  "use strict";

  var INCAP = /incapacitated|paralyzed|stunned|unconscious|petrified/i;

  function norm(s) {
    return String(s || "").toLowerCase().replace(/\./g, "").replace(/\s+shell$/i, "").replace(/\s+/g, " ").trim();
  }
  function die(sides, rng) {
    var n = Math.max(1, Number(sides) || 4);
    if (rng) return rng(n);
    return 1 + Math.floor(Math.random() * n);
  }
  function sign(n) {
    n = Number(n) || 0;
    return (n >= 0 ? "+" : "") + n;
  }

  function wearingArmor(armorId, armorRows) {
    if (!armorId) return false;
    var id = String(armorId);
    var row = null;
    (armorRows || []).forEach(function (a) { if (a && a.id === id) row = a; });
    if (row) return row.category !== "shield";
    return true;
  }
  function mageArmorBlock(character, armorRows) {
    if (!character) return "";
    if (!wearingArmor(character.armor, armorRows)) return "";
    return "Mage Armor needs a creature that isn't wearing armor.";
  }
  function mageArmorAc(dexMod) {
    return 13 + (Number(dexMod) || 0);
  }
  function isMageBuff(b) {
    if (!b) return false;
    return !!(b.mageArmor || norm(b.name) === "mage armor" || norm(b.id) === "spell:mage armor");
  }
  function stripMageArmor(character) {
    var c = character || {};
    var buffs = Array.isArray(c.buffs) ? c.buffs : [];
    var kept = [];
    var removed = [];
    buffs.forEach(function (b) {
      if (isMageBuff(b)) removed.push(b);
      else kept.push(b);
    });
    var chips = [];
    var conds = Array.isArray(c.activeConditions) ? c.activeConditions : [];
    var nextConds = conds.filter(function (row) {
      var name = typeof row === "string" ? row : (row && row.name);
      if (/^mage armor\b/i.test(String(name || ""))) { chips.push(name); return false; }
      return true;
    });
    var ended = removed.length > 0 || chips.length > 0;
    if (ended) {
      c.buffs = kept;
      c.activeConditions = nextConds;
      if (c.spellMarks && Array.isArray(c.spellMarks.marks)) {
        c.spellMarks.marks = c.spellMarks.marks.filter(function (m) { return !(m && m.kind === "mageArmor"); });
      }
    }
    return { ended: ended, buffs: kept, chips: chips };
  }

  function isShieldBuff(b) {
    if (!b || b.mageArmor) return false;
    if (b.untilTurn && (b.ac || norm(b.name) === "shield" || norm(b.id) === "spell:shield")) return true;
    return norm(b.name) === "shield" || norm(b.id) === "spell:shield";
  }
  function shieldBonus(buffs) {
    var n = 0;
    (buffs || []).forEach(function (b) {
      if (!isShieldBuff(b)) return;
      n += Number(b.ac) || 5;
    });
    return n;
  }
  function expireTurnBuffs(buffs) {
    var kept = [];
    var removed = [];
    (buffs || []).forEach(function (b) {
      if (b && b.untilTurn) removed.push(b);
      else kept.push(b);
    });
    return { buffs: kept, removed: removed };
  }
  function recheckHit(opts) {
    opts = opts || {};
    var nat = Number(opts.nat);
    var total = Number(opts.total);
    var ac = Number(opts.ac);
    var bonus = opts.shield == null ? 5 : Number(opts.shield);
    if (!isFinite(bonus)) bonus = 5;
    var next = (isFinite(ac) ? ac : 0) + bonus;
    var crit = nat === 20;
    var miss = nat === 1 || (!crit && isFinite(total) && total < next);
    return { ac: next, bonus: bonus, miss: miss, hit: !miss };
  }
  function magicMissileAmount(amount, shielded) {
    if (shielded) return 0;
    return Number(amount) || 0;
  }
  function chamberIsShell(token, minLevel) {
    var s = String(token || "");
    var lv = 0;
    if (/^[1-9]$/.test(s)) lv = Number(s);
    else if (s.indexOf("k:hex:") === 0) lv = parseInt(s.split(":")[2], 10) || 0;
    return lv >= (minLevel || 1);
  }
  function loadedShell(guns, minLevel) {
    var need = minLevel || 1;
    var ok = false;
    (guns || []).forEach(function (g) {
      if (!g) return;
      (g.chambers || []).forEach(function (ch) { if (chamberIsShell(ch, need)) ok = true; });
    });
    return ok;
  }
  function shieldGate(character) {
    if (!character || character.calling !== "hexslinger") return "";
    if (loadedShell(character.guns, 1)) return "";
    return "Shield needs a loaded hex shell.";
  }

  function targetCap(slot) {
    var lv = Math.max(1, Number(slot) || 1);
    return 3 + Math.max(0, lv - 1);
  }
  function needsTargets(row) {
    if (!row) return false;
    var key = norm(row.name);
    return key === "bless" || key === "bane" || !!(row.bless || row.bane);
  }
  function chipName(kind) {
    return kind === "bane" ? "Baned" : "Blessed";
  }
  function hasChip(list, kind) {
    var want = kind === "bane" ? /^baned\b/i : /^blessed\b/i;
    var hit = false;
    (list || []).forEach(function (row) {
      var name = typeof row === "string" ? row : (row && (row.name || row.chip || ""));
      if (want.test(String(name || ""))) hit = true;
    });
    return hit;
  }
  function oneDie(signN, rng) {
    var face = die(4, rng);
    var neg = signN < 0;
    var delta = neg ? -face : face;
    var text = (neg ? "−" : "+") + "1d4 [" + face + "] (" + (neg ? "Bane" : "Bless") + ")";
    return { face: face, delta: delta, text: text, label: neg ? "Bane" : "Bless" };
  }
  function rollMods(list, rng) {
    var parts = [];
    var delta = 0;
    if (hasChip(list, "bless")) {
      var up = oneDie(1, rng);
      parts.push(up);
      delta += up.delta;
    }
    if (hasChip(list, "bane")) {
      var down = oneDie(-1, rng);
      parts.push(down);
      delta += down.delta;
    }
    return { delta: delta, parts: parts, text: parts.map(function (p) { return p.text; }).join(" ") };
  }
  function saveCheck(opts) {
    opts = opts || {};
    var nat = Number(opts.nat);
    var mod = Number(opts.mod) || 0;
    var dc = Number(opts.dc);
    var total = nat + mod;
    var failed = isFinite(dc) ? total < dc : false;
    var ability = String(opts.ability || "CHA").toUpperCase();
    var spell = opts.spell || "Bane";
    var who = opts.who || "Target";
    var line = "SAVE " + spell + " DC " + (isFinite(dc) ? dc : "?") + " " + ability + " — " + who + ": d20 [" + nat + "]" + sign(mod) + " = " + total + " — " + (failed ? "FAIL" : "SAVE");
    return { nat: nat, mod: mod, total: total, dc: dc, failed: failed, line: line };
  }

  function concDc(damage) {
    var n = Math.floor(Math.max(0, Number(damage) || 0));
    return Math.max(10, Math.floor(n / 2));
  }
  function concMods(opts) {
    opts = opts || {};
    var adv = !!opts.gunsmoke;
    var dis = !!opts.hexBreaker || !!opts.outOfTune;
    var mode = "";
    if (adv && !dis) mode = "adv";
    else if (dis && !adv) mode = "dis";
    return {
      mode: mode,
      bonus: opts.fingerpicks ? 2 : 0,
      gunsmoke: adv,
      hexBreaker: !!opts.hexBreaker,
      outOfTune: !!opts.outOfTune,
      fingerpicks: !!opts.fingerpicks
    };
  }
  function resolveConc(opts, rng) {
    opts = opts || {};
    var mods = concMods(opts);
    var mode = opts.mode != null ? opts.mode : mods.mode;
    var bonus = (Number(opts.mod) || 0) + (opts.bonus != null ? Number(opts.bonus) : mods.bonus);
    var dc = opts.dc != null ? Number(opts.dc) : concDc(opts.damage);
    var n1 = opts.nat != null ? Number(opts.nat) : die(20, rng);
    var n2 = null;
    var nat = n1;
    if (mode === "adv" || mode === "dis") {
      n2 = opts.nat2 != null ? Number(opts.nat2) : die(20, rng);
      nat = mode === "adv" ? Math.max(n1, n2) : Math.min(n1, n2);
    }
    var total = nat + bonus;
    var hold = total >= dc;
    var who = opts.who || "Caster";
    var spell = opts.spell || "the spell";
    var line = "CONC " + who + " conc save DC " + dc + " CON: d20 [" + nat + "]" + sign(bonus) + " = " + total + " — " + (hold ? "HOLD" : "BROKEN");
    if (!hold) line += " → " + spell + " ends";
    if (mode === "adv") line += " · advantage (Gunsmoke Caster)";
    if (mode === "dis") line += " · disadvantage" + (opts.hexBreaker && opts.outOfTune ? " (Hex Breaker, Out of tune)" : (opts.hexBreaker ? " (Hex Breaker)" : (opts.outOfTune ? " (Out of tune)" : "")));
    if ((opts.bonus != null ? Number(opts.bonus) : mods.bonus) === 2 && (opts.fingerpicks || mods.fingerpicks)) line += " · Fingerpicks +2";
    return { dc: dc, nat: nat, n1: n1, n2: n2, mode: mode, bonus: bonus, total: total, hold: hold, broken: !hold, line: line, spell: spell };
  }
  function incapName(name) {
    return INCAP.test(String(name || ""));
  }
  function concEndReason(opts) {
    opts = opts || {};
    if (opts.dead) return "death";
    if (opts.hp != null && opts.hp !== "" && isFinite(Number(opts.hp)) && Number(opts.hp) <= 0) return "death";
    var reason = "";
    (opts.conditions || []).forEach(function (row) {
      var name = typeof row === "string" ? row : (row && row.name);
      if (!reason && incapName(name)) reason = "incapacitated";
    });
    return reason;
  }
  function hasFingerpicks(character) {
    var items = (character && character.items) || [];
    var hit = false;
    items.forEach(function (it) {
      if (!it) return;
      if (it.catalogId === "fingerpicks" || /fingerpicks/i.test(String(it.name || ""))) hit = true;
    });
    return hit;
  }
  function notePlayed(character, turnKey) {
    if (!character || !hasFingerpicks(character) || !character.instrument) return false;
    character.fingerpicksOn = true;
    character.fingerpicksFrom = turnKey || "played";
    return true;
  }
  function fingerpicksActive(character) {
    return !!(character && character.fingerpicksOn && hasFingerpicks(character));
  }
  function expireFingerpicks(character, turnKey) {
    if (!character || !character.fingerpicksOn) return false;
    if (!turnKey || character.fingerpicksFrom === turnKey) return false;
    character.fingerpicksOn = false;
    character.fingerpicksFrom = "";
    return true;
  }

  root.SSDNSSpellBuffs = {
    norm: norm,
    wearingArmor: wearingArmor,
    mageArmorBlock: mageArmorBlock,
    mageArmorAc: mageArmorAc,
    stripMageArmor: stripMageArmor,
    isShieldBuff: isShieldBuff,
    shieldBonus: shieldBonus,
    expireTurnBuffs: expireTurnBuffs,
    recheckHit: recheckHit,
    magicMissileAmount: magicMissileAmount,
    loadedShell: loadedShell,
    chamberIsShell: chamberIsShell,
    shieldGate: shieldGate,
    targetCap: targetCap,
    needsTargets: needsTargets,
    chipName: chipName,
    hasChip: hasChip,
    rollMods: rollMods,
    saveCheck: saveCheck,
    concDc: concDc,
    concMods: concMods,
    resolveConc: resolveConc,
    incapName: incapName,
    concEndReason: concEndReason,
    hasFingerpicks: hasFingerpicks,
    notePlayed: notePlayed,
    fingerpicksActive: fingerpicksActive,
    expireFingerpicks: expireFingerpicks
  };
})(typeof window !== "undefined" ? window : globalThis);

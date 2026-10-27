/**
 * N79 Phase 1c A — PHB 2014 conditions and riders.
 * Overlay on tools/spell_cast.json / rules.js rows (rules.js is not edited).
 * Sheet and DM Command Center share this bag: chips, riders, zones.
 */
(function (root) {
  "use strict";

  var HALF = {
    "arms of hadar": 1, "dissonant whispers": 1, "hail of thorns": 1, "flaming sphere": 1,
    "moonbeam": 1, "call lightning": 1, "conjure barrage": 1, "blight": 1,
    "conjure volley": 1, "destructive wave": 1, "prismatic spray": 1
  };
  var DISEASES = ["Blinding Sickness", "Filth Fever", "Flesh Rot", "Mindfire", "Seizure", "Slimy Doom"];

  function norm(s) {
    return String(s || "").toLowerCase().replace(/\./g, "").replace(/\s+/g, " ").trim();
  }
  function die(sides, rng) {
    var n = Math.max(1, Number(sides) || 6);
    if (rng) return rng(n);
    return 1 + Math.floor(Math.random() * n);
  }
  function rollExpr(expr, crit, rng) {
    var s = String(expr || "").replace(/\s/g, "");
    var faces = [];
    var total = 0;
    var formula = [];
    if (!s) return { formula: "0", faces: faces, total: 0 };
    var re = /([+-]?)(\d*)d(\d+)|([+-]?\d+)/gi;
    var m;
    while ((m = re.exec(s))) {
      if (m[3]) {
        var count = parseInt(m[2] || "1", 10);
        if (m[1] === "-") count = -count;
        var sides = parseInt(m[3], 10);
        var n = Math.abs(count) * (crit ? 2 : 1);
        var sign = count < 0 ? -1 : 1;
        var i;
        formula.push((formula.length ? (sign < 0 ? "-" : "+") : (sign < 0 ? "-" : "")) + n + "d" + sides);
        for (i = 0; i < n; i++) {
          var face = die(sides, rng);
          faces.push(face);
          total += sign * face;
        }
      } else if (m[4] != null && m[4] !== "") {
        var flat = parseInt(m[4], 10);
        total += flat;
        formula.push((flat >= 0 && formula.length ? "+" : "") + flat);
      }
    }
    return { formula: formula.join("") || s, faces: faces, total: total };
  }
  function emptyBag(bag) {
    bag = bag || {};
    if (!Array.isArray(bag.marks)) bag.marks = [];
    if (bag.conc == null) bag.conc = "";
    if (!Array.isArray(bag.zones)) bag.zones = [];
    if (!Array.isArray(bag.ticks)) bag.ticks = [];
    return bag;
  }
  function copyBag(bag) {
    var src = emptyBag(bag);
    return {
      conc: src.conc || "",
      marks: src.marks.map(function (m) { return Object.assign({}, m); }),
      zones: src.zones.map(function (z) { return Object.assign({}, z); }),
      ticks: src.ticks.map(function (t) { return Object.assign({}, t); })
    };
  }
  function tickSound() {
    try {
      if (root.SSDNSAudio && root.SSDNSAudio.play) root.SSDNSAudio.play("ui-tick");
    } catch (e) {}
  }
  function chip(name, targetId, spell, conc, casterId) {
    return {
      name: name,
      targetId: targetId || "",
      spell: spell || "",
      conc: !!conc,
      casterId: casterId || ""
    };
  }
  function durHours(slot) {
    var lv = Number(slot) || 1;
    if (lv >= 5) return 24;
    if (lv >= 3) return 8;
    return 1;
  }
  function chainTargets(slot) {
    var lv = Number(slot) || 6;
    return 4 + Math.max(0, lv - 6);
  }
  function agathys(slot) {
    var lv = Math.max(1, Number(slot) || 1);
    return { temp: 5 * lv, cold: 5 * lv };
  }

  function patchRow(row) {
    if (!row || !row.name) return row;
    var key = norm(row.name);
    var out = Object.assign({}, row);
    if (HALF[key]) out.half = true;
    if (key === "hail of thorns") {
      out.area = "5ft radius around target";
      out.splash = { radius: 5, save: "DEX", dice: out.dice || "1d10", type: "piercing", half: true, up: out.up || "1d10", includeTarget: true };
    }
    if (key === "thunderous smite") {
      out.up = null;
      out.save = "STR";
      out.onFail = "Prone";
      out.push = 10;
      out.meleeOnly = true;
    }
    if (key === "wrathful smite") { out.save = "WIS"; out.onFail = "Frightened"; out.meleeOnly = true; }
    if (key === "blinding smite") { out.save = "CON"; out.onFail = "Blinded"; out.endSave = "CON"; out.meleeOnly = true; }
    if (key === "staggering smite") { out.save = "WIS"; out.onFail = "Staggered"; out.meleeOnly = true; }
    if (key === "searing smite") { out.burn = { dice: "1d6", save: "CON", when: "start" }; out.meleeOnly = true; }
    if (key === "ensnaring strike") {
      out.save = "STR";
      out.onFail = "Restrained";
      out.diceOn = "start";
      out.startDice = out.dice || "1d6";
      out.startType = "piercing";
      out.escape = "action STR";
    }
    if (key === "ray of sickness") { out.hitSave = "CON"; out.onFail = "Poisoned"; }
    if (key === "banishing smite") { out.save = null; out.banishAt = 50; }
    if (key === "hex") {
      out.trigger = "attackHit";
      out.abilityPick = true;
      out.transfer = "bonus";
      out.chip = "Hexed";
      out.conc = true;
      out.notOn = ["magic missile", "save"];
    }
    if (key === "hunter's mark") {
      out.trigger = "weaponHit";
      out.transfer = "bonus";
      out.chip = "Marked";
      out.conc = true;
      out.type = "weapon";
    }
    if (key === "fire shield") {
      out.conc = false;
      out.dur = "10 min";
      out.modes = ["warm", "chill"];
      out.trigger = "meleeHitOnCaster";
      out.light = { bright: 10, dim: 10 };
    }
    if (key === "contagion") {
      out.onHit = "Poisoned";
      out.noDamage = true;
      out.endSave = "CON";
      out.tracker = 3;
      out.diseases = DISEASES.slice();
    }
    if (key === "ray of enfeeblement") {
      out.onHit = "Enfeebled";
      out.noDamage = true;
      out.endSave = "CON";
      out.conc = true;
      out.halfStr = true;
    }
    if (key === "chain lightning") { out.up = null; out.targets = 4; out.targetUp = 1; }
    if (key === "heat metal") { out.damageAuto = true; out.saveFor = "drop"; out.half = false; out.onFail = "drops the object"; }
    if (key === "phantasmal killer") {
      out.castDamage = false;
      out.applyNow = false;
      out.onFail = "Frightened";
      out.later = { when: "end", save: "WIS", dice: out.dice || "4d10", type: "psychic", up: out.up || "1d10", endOnSuccess: true };
    }
    if (key === "guardian of faith") {
      out.save = "DEX";
      out.half = true;
      out.dice = "20";
      out.type = "radiant";
      out.budget = 60;
      out.applyNow = false;
      out.defer = true;
      out.note = "DEX save, 20 radiant (half on save), ends after 60 damage";
    }
    if (key === "acid arrow") { out.missHalf = true; out.delayed = "2d4"; out.delayedUp = true; }
    if (key === "lightning arrow") {
      out.missHalf = true;
      out.replacesWeapon = true;
      out.splash = { radius: 10, save: "DEX", dice: "2d8", type: "lightning", half: true, up: out.up || "1d8" };
    }
    if (key === "hunger of hadar") {
      out.tickEnd = { save: "DEX", dice: "2d6", type: "acid", half: false };
    }
    if (key === "wall of thorns") { out.type = "piercing"; out.through = "slashing"; out.half = true; }
    if (key === "spirit guardians") { out.speed = "half"; out.half = true; }
    if (key === "armor of agathys") { out.tempPer = 5; out.retaliate = 5; out.retaliateType = "cold"; }
    if (key === "destructive wave") { out.onFail = "Prone"; }
    if (key === "dissonant whispers") { out.onFail = "uses reaction: moves away"; }
    if (key === "arms of hadar") { out.onFail = "No reactions"; }
    if (key === "disintegrate") {
      out.onSave = "none";
      out.zeroHp = "disintegrated";
      out.half = false;
      out.note = "";
    }
    return out;
  }

  function concentrates(name, row) {
    var key = norm(name);
    if (row && row.conc === true) return true;
    if (row && row.conc === false) return false;
    if (key === "fire shield" || key === "contagion" || key === "armor of agathys") return false;
    var fx = root.SSDNS_SPELL_FX || {};
    var meta = fx[key] || null;
    if (meta && meta.conc) return true;
    if (meta && /concentration/i.test(meta.dur || "")) return true;
    return false;
  }

  function needsOptions(row) {
    if (!row) return null;
    var key = norm(row.name);
    if (key === "hex" || row.abilityPick) return { kind: "ability", options: ["STR", "DEX", "CON", "INT", "WIS", "CHA"] };
    if (key === "fire shield") return { kind: "mode", options: ["warm", "chill"] };
    if (key === "contagion") return { kind: "disease", options: DISEASES.slice() };
    if (key === "destructive wave") return { kind: "mode", options: ["radiant", "necrotic"] };
    return null;
  }

  function shieldChip(mode) {
    var warm = norm(mode) !== "chill";
    return warm ? "Fire Shield (Warm: resist cold)" : "Fire Shield (Chill: resist fire)";
  }
  function hexChip(ability) {
    return "Hexed (" + String(ability || "WIS").toUpperCase() + ")";
  }
  function contagionChip(s, f) {
    function dots(n, on) {
      var i, out = "";
      for (i = 0; i < 3; i++) out += i < n ? on : "○";
      return out;
    }
    return "Contagion S" + dots(s, "●") + " F" + dots(f, "●");
  }

  function dropSpell(bag, spellName) {
    var next = copyBag(bag);
    var key = norm(spellName);
    var removed = [];
    if (!key) return { bag: next, removed: removed };
    next.marks = next.marks.filter(function (m) {
      if (norm(m.spell) !== key) return true;
      removed.push(chip(m.chip, m.targetId, m.spell, m.conc, m.casterId));
      return false;
    });
    next.zones = next.zones.filter(function (z) {
      if (norm(z.spell) !== key) return true;
      removed.push(chip(z.chip || z.spell, z.targetId || "", z.spell, true, z.casterId));
      return false;
    });
    next.ticks = next.ticks.filter(function (t) { return norm(t.spell) !== key; });
    if (norm(next.conc) === key) next.conc = "";
    if (removed.length) tickSound();
    return { bag: next, removed: removed };
  }

  function breakConc(bag, spellName) {
    var next = copyBag(bag);
    var removed = [];
    if (spellName) return dropSpell(next, spellName);
    var name = next.conc;
    if (!name) {
      next.marks.forEach(function (m) { if (m.conc) removed.push(chip(m.chip, m.targetId, m.spell, true, m.casterId)); });
      next.zones.forEach(function (z) { removed.push(chip(z.chip || z.spell, "", z.spell, true, z.casterId)); });
      next.marks = next.marks.filter(function (m) { return !m.conc; });
      next.zones = [];
      next.ticks = next.ticks.filter(function (t) { return !t.conc; });
      if (removed.length) tickSound();
      return { bag: next, removed: removed };
    }
    return dropSpell(next, name);
  }

  function arm(bag, opts) {
    opts = opts || {};
    var row = opts.row ? patchRow(opts.row) : null;
    var name = (row && row.name) || opts.name || "Spell";
    var key = norm(name);
    var next = copyBag(bag);
    var logs = [];
    var chips = [];
    var removed = [];
    var slot = Number(opts.slot);
    if (!isFinite(slot)) slot = (row && row.level) || 1;
    var conc = concentrates(name, row);
    if (conc) {
      var prevName = next.conc;
      if (prevName && norm(prevName) !== key) {
        var ended = dropSpell(next, prevName);
        next = ended.bag;
        removed = removed.concat(ended.removed);
        logs.push("Concentration ends " + prevName + ".");
      }
      next.conc = name;
    }
    if (key === "hex" || key === "hunter's mark" || key === "fire shield") {
      var recast = dropSpell(next, name);
      next = recast.bag;
      removed = removed.concat(recast.removed);
      if (conc) next.conc = name;
    }
    var targetId = opts.targetId || "";
    var targetName = opts.targetName || "the target";
    function addMark(mark) {
      next.marks.push(mark);
      if (mark.chip) {
        chips.push(chip(mark.chip, mark.targetId, name, !!mark.conc, opts.casterId || ""));
        tickSound();
      }
    }
    if (key === "hex") {
      var ability = String(opts.ability || "WIS").toUpperCase();
      addMark({
        spell: name, conc: true, kind: "hex", targetId: targetId, targetName: targetName,
        ability: ability, chip: hexChip(ability), dice: "1d6", type: "necrotic", slot: slot, movable: false
      });
      logs.push("(C) · disadv on " + ability + " checks · " + durHours(slot) + " h");
    } else if (key === "hunter's mark") {
      addMark({
        spell: name, conc: true, kind: "mark", targetId: targetId, targetName: targetName,
        chip: "Marked", dice: "1d6", type: "weapon", slot: slot, movable: false
      });
      logs.push("(C) · Marked · " + durHours(slot) + " h");
    } else if (key === "fire shield") {
      var mode = norm(opts.mode) === "chill" ? "chill" : "warm";
      addMark({
        spell: name, conc: false, kind: "shield", targetId: opts.casterId || "self", chip: shieldChip(mode),
        mode: mode, resist: mode === "warm" ? "cold" : "fire", dice: "2d8",
        type: mode === "warm" ? "fire" : "cold", light: { bright: 10, dim: 10 }
      });
      logs.push(shieldChip(mode) + " · 10 min · bright 10, dim 10 · not concentration");
    } else if (opts.armPending && row && (row.meleeOnly || key.indexOf("smite") >= 0 || key === "ensnaring strike" || key === "hail of thorns" || key === "lightning arrow")) {
      addMark({
        spell: name, conc: conc, kind: "smite", pending: true, chip: "",
        save: row.save || "", onFail: row.onFail || "",
        push: row.push || 0, meleeOnly: !!row.meleeOnly,
        rangedOnly: key === "hail of thorns" || key === "lightning arrow",
        dice: row.diceOn === "start" ? "" : (row.dice || ""),
        type: row.type || "",
        burn: row.burn || null,
        startDice: row.diceOn === "start" ? (row.startDice || row.dice) : "",
        startType: row.startType || "",
        escape: row.escape || "",
        endSave: row.endSave || "",
        banishAt: row.banishAt || 0,
        missHalf: !!row.missHalf,
        splash: row.splash || null,
        up: row.up || null,
        slot: slot
      });
      logs.push("armed on the next " + (row.meleeOnly ? "melee " : "") + "weapon hit");
    }
    return { bag: next, logs: logs.filter(Boolean), chips: chips, removed: removed, conc: conc };
  }

  function sameTarget(mark, targetId) {
    if (!mark || !mark.targetId || !targetId) return !targetId;
    return String(mark.targetId) === String(targetId);
  }
  function weaponOk(mark, ctx) {
    if (mark.meleeOnly && !ctx.melee) return false;
    if (mark.rangedOnly && ctx.melee) return false;
    return true;
  }

  function attackRiders(bag, ctx, rng) {
    ctx = ctx || {};
    var next = copyBag(bag);
    var riders = [];
    var logs = [];
    var chips = [];
    var removed = [];
    var hit = !!ctx.hit && !ctx.miss;
    if (!hit) return { bag: next, riders: riders, logs: logs, chips: chips, removed: removed, total: 0 };
    var spellAttack = !!ctx.spellAttack;
    var weaponAttack = ctx.weaponAttack !== false && !spellAttack;
    var saveSpell = !!ctx.saveSpell;
    var magicMissile = !!ctx.magicMissile;
    next.marks.forEach(function (mark) {
      if (mark.kind === "hex") {
        if (saveSpell || magicMissile || !sameTarget(mark, ctx.targetId)) return;
        if (!spellAttack && !weaponAttack && !ctx.attack) return;
        var hx = rollExpr(mark.dice || "1d6", !!ctx.crit, rng);
        riders.push({ label: "Crossed Hex", spell: mark.spell, formula: hx.formula, faces: hx.faces, total: hx.total, type: "necrotic" });
        logs.push("RIDER Crossed Hex on " + (mark.targetName || "target") + ": +" + hx.formula + " [" + hx.faces.join(",") + "] = " + hx.total + " necrotic");
      }
      if (mark.kind === "mark") {
        if (!weaponAttack || spellAttack || saveSpell || magicMissile || !sameTarget(mark, ctx.targetId)) return;
        var type = ctx.weaponType || "piercing";
        var mk = rollExpr(mark.dice || "1d6", !!ctx.crit, rng);
        riders.push({ label: "Marked Man", spell: mark.spell, formula: mk.formula, faces: mk.faces, total: mk.total, type: type });
        logs.push("RIDER Marked Man on " + (mark.targetName || "target") + ": +" + mk.formula + " [" + mk.faces.join(",") + "] = " + mk.total + " " + type);
      }
    });
    var kept = [];
    next.marks.forEach(function (mark) {
      if (mark.kind !== "smite" || !mark.pending) { kept.push(mark); return; }
      if (!weaponAttack || !weaponOk(mark, ctx)) { kept.push(mark); return; }
      if (mark.dice) {
        var sm = rollExpr(mark.dice, !!ctx.crit, rng);
        var steps = mark.up ? Math.max(0, (Number(mark.slot) || 0) - 1) : 0;
        if (mark.up && steps > 0 && norm(mark.spell) !== "thunderous smite") {
          var extra = rollExpr(mark.up, !!ctx.crit, rng);
          var t;
          for (t = 1; t < steps; t++) {
            var more = rollExpr(mark.up, !!ctx.crit, rng);
            extra.total += more.total;
            extra.faces = extra.faces.concat(more.faces);
          }
          sm.total += extra.total;
          sm.faces = sm.faces.concat(extra.faces);
          sm.formula += "+" + extra.formula;
        }
        riders.push({ label: mark.spell, spell: mark.spell, formula: sm.formula, faces: sm.faces, total: sm.total, type: mark.type || "" });
        logs.push("RIDER " + mark.spell + ": +" + sm.formula + " [" + sm.faces.join(",") + "] = " + sm.total + (mark.type ? " " + mark.type : ""));
      }
      mark.pending = false;
      mark.targetId = ctx.targetId || "";
      if (mark.onFail) {
        mark.chip = mark.onFail;
        chips.push(chip(mark.onFail, ctx.targetId, mark.spell, !!mark.conc, ctx.casterId || ""));
      }
      if (mark.push) logs.push("pushed " + mark.push + " ft");
      if (mark.banishAt) logs.push("banished if this hit leaves the target at " + mark.banishAt + " HP or fewer (no save)");
      if (mark.burn) {
        next.ticks.push({ spell: mark.spell, targetId: ctx.targetId, when: "start", save: "CON", dice: mark.burn.dice, type: "fire", conc: true, endOnSuccess: true });
        chips.push(chip("Burning", ctx.targetId, mark.spell, true, ctx.casterId || ""));
      }
      if (mark.startDice) {
        next.ticks.push({ spell: mark.spell, targetId: ctx.targetId, when: "start", dice: mark.startDice, type: mark.startType || "piercing", conc: !!mark.conc, auto: true });
      }
      if (mark.endSave) {
        next.ticks.push({ spell: mark.spell, targetId: ctx.targetId, when: "end", save: mark.endSave, endOnSuccess: true, conc: !!mark.conc });
      }
      kept.push(mark);
    });
    next.marks = kept;
    var total = 0;
    riders.forEach(function (r) { total += r.total; });
    return { bag: next, riders: riders, logs: logs, chips: chips, removed: removed, total: total };
  }

  function onHitSpell(bag, opts) {
    opts = opts || {};
    var row = opts.row ? patchRow(opts.row) : null;
    var name = (row && row.name) || opts.name || "";
    var key = norm(name);
    var next = copyBag(bag);
    var logs = [];
    var chips = [];
    if (opts.miss) return { bag: next, logs: ["MISS"], chips: chips, noDamage: !!(row && row.noDamage) };
    if (key === "contagion") {
      var disease = opts.disease || DISEASES[2];
      next.marks.push({
        spell: name, conc: false, kind: "contagion", targetId: opts.targetId || "", targetName: opts.targetName || "",
        chip: "Poisoned", disease: disease, success: 0, fail: 0
      });
      next.ticks.push({ spell: name, targetId: opts.targetId || "", when: "end", save: "CON", contagion: true, disease: disease });
      chips.push(chip("Poisoned", opts.targetId, name, false, opts.casterId || ""));
      chips.push(chip(contagionChip(0, 0), opts.targetId, name, false, opts.casterId || ""));
      tickSound();
      logs.push("no damage — Poisoned");
      logs.push("COND +Poisoned (Contagion; CON save end of each turn, 3F = " + disease + ")");
      return { bag: next, logs: logs, chips: chips, noDamage: true };
    }
    if (key === "ray of enfeeblement") {
      next.marks.push({
        spell: name, conc: true, kind: "enfeeble", targetId: opts.targetId || "", chip: "Enfeebled (½ STR weapon dmg)"
      });
      next.ticks.push({ spell: name, targetId: opts.targetId || "", when: "end", save: "CON", endOnSuccess: true, conc: true });
      if (!next.conc) next.conc = name;
      chips.push(chip("Enfeebled (½ STR weapon dmg)", opts.targetId, name, true, opts.casterId || ""));
      tickSound();
      logs.push("no damage — Enfeebled (½ STR weapon dmg)");
      return { bag: next, logs: logs, chips: chips, noDamage: true };
    }
    if (row && row.hitSave && row.onFail) logs.push(row.hitSave + " save or " + row.onFail);
    return { bag: next, logs: logs, chips: chips, noDamage: !!(row && row.noDamage) };
  }

  function contagionSave(bag, targetId, failed) {
    var next = copyBag(bag);
    var logs = [];
    var chips = [];
    var removed = [];
    next.marks.forEach(function (mark) {
      if (mark.kind !== "contagion") return;
      if (targetId && mark.targetId && String(mark.targetId) !== String(targetId)) return;
      if (failed) mark.fail = (mark.fail || 0) + 1;
      else mark.success = (mark.success || 0) + 1;
      logs.push((failed ? "FAIL" : "SAVE") + " (S " + mark.success + "/3 F " + mark.fail + "/3)");
      removed.push(chip(contagionChip(Math.max(0, mark.success - (failed ? 0 : 1)), Math.max(0, mark.fail - (failed ? 1 : 0))), mark.targetId, mark.spell, false, ""));
      if (mark.fail >= 3) {
        mark.chip = "Diseased: " + (mark.disease || "Flesh Rot") + " (7 days)";
        mark.done = true;
        removed.push(chip("Poisoned", mark.targetId, mark.spell, false, ""));
        chips.push(chip(mark.chip, mark.targetId, mark.spell, false, ""));
        logs.push(mark.chip);
      } else if (mark.success >= 3) {
        mark.done = true;
        mark.chip = "";
        removed.push(chip("Poisoned", mark.targetId, mark.spell, false, ""));
        logs.push("recovers");
      } else chips.push(chip(contagionChip(mark.success, mark.fail), mark.targetId, mark.spell, false, ""));
    });
    next.marks = next.marks.filter(function (m) { return !(m.kind === "contagion" && m.done && m.success >= 3); });
    if (chips.length || removed.length) tickSound();
    return { bag: next, logs: logs, chips: chips, removed: removed };
  }

  function enfeebleAmount(conditions, total, ctx) {
    ctx = ctx || {};
    var list = conditions || [];
    var on = list.some(function (row) {
      var name = typeof row === "string" ? row : (row && row.name);
      return /enfeebled/i.test(String(name || ""));
    });
    if (!on) return { amount: Number(total) || 0, halved: false };
    var usesStr = !!ctx.str || (!!ctx.melee && !ctx.finesse && !ctx.dex);
    if (!usesStr) return { amount: Number(total) || 0, halved: false };
    return { amount: Math.floor((Number(total) || 0) / 2), halved: true };
  }

  function shieldBagFromChips(list) {
    var bag = emptyBag(null);
    (list || []).forEach(function (raw) {
      var name = typeof raw === "string" ? raw : (raw && (raw.name || raw.label)) || "";
      if (/fire shield \(chill/i.test(name)) bag.marks.push({ kind: "shield", mode: "chill", dice: "2d8", type: "cold", resist: "fire", chip: name });
      else if (/fire shield \(warm/i.test(name)) bag.marks.push({ kind: "shield", mode: "warm", dice: "2d8", type: "fire", resist: "cold", chip: name });
    });
    return bag.marks.length ? bag : null;
  }
  function fireShieldHit(bag, ctx, rng) {
    ctx = ctx || {};
    if (!ctx.melee) return null;
    var mark = null;
    emptyBag(bag).marks.forEach(function (m) { if (m.kind === "shield") mark = m; });
    if (!mark) return null;
    var rolled = rollExpr(mark.dice || "2d8", false, rng);
    return {
      amount: rolled.total,
      type: mark.type,
      formula: rolled.formula,
      faces: rolled.faces,
      resist: mark.resist,
      log: "RIDER Thermal Jacket (" + (mark.mode === "chill" ? "Chill" : "Warm") + ") → " + (ctx.attackerName || "attacker") + ": " + rolled.formula + " [" + rolled.faces.join(",") + "] = " + rolled.total + " " + mark.type
    };
  }

  function resistAmount(amount, type, resist) {
    var n = Number(amount) || 0;
    if (!resist || !type || norm(type) !== norm(resist)) return { amount: n, resisted: false };
    return { amount: Math.floor(n / 2), resisted: true };
  }

  function noteDown(bag, targetId) {
    var next = copyBag(bag);
    next.marks.forEach(function (m) {
      if ((m.kind === "hex" || m.kind === "mark") && sameTarget(m, targetId)) m.movable = true;
    });
    return next;
  }
  function transfer(bag, kind, targetId, targetName) {
    var next = copyBag(bag);
    var moved = false;
    next.marks.forEach(function (m) {
      if (moved) return;
      if (m.kind !== kind || !m.movable) return;
      m.targetId = targetId || "";
      m.targetName = targetName || "";
      m.movable = false;
      moved = true;
    });
    return { bag: next, moved: moved };
  }

  function phaseTicks(bag, targetId, when, rng) {
    var next = copyBag(bag);
    var due = [];
    next.ticks.forEach(function (t) {
      if (t.when !== when) return;
      if (targetId && t.targetId && String(t.targetId) !== String(targetId)) return;
      var row = Object.assign({}, t);
      if (t.dice && t.auto) {
        var rolled = rollExpr(t.dice, false, rng);
        row.amount = rolled.total;
        row.formula = rolled.formula;
        row.faces = rolled.faces;
      }
      due.push(row);
    });
    return { bag: next, due: due };
  }

  function zeroState(row) {
    if (!row) return null;
    var spec = patchRow(row);
    if (spec.zeroHp !== "disintegrated" && row.zeroHp !== "disintegrated") return null;
    return {
      status: "Disintegrated",
      chip: "Disintegrated",
      deathSaves: false,
      log: "disintegrated (dust)"
    };
  }

  function dealt(row, full, save) {
    var n = Number(full) || 0;
    var spec = row ? patchRow(row) : {};
    if (spec.applyNow === false || spec.defer || spec.castDamage === false) return 0;
    if (save && save.blocked) return 0;
    if (spec.damageAuto || spec.kind === "auto") return n;
    if (!save) return n;
    if (save.failed) return n;
    if (spec.onSave === "none") return 0;
    if (spec.half) return Math.floor(n / 2);
    return 0;
  }

  function missDamage(row, full, missed) {
    var spec = row ? patchRow(row) : {};
    var n = Number(full) || 0;
    if (!missed) return n;
    if (spec.missHalf) return Math.floor(n / 2);
    return 0;
  }

  function delayedRoll(row, slot, crit, rng) {
    var spec = row ? patchRow(row) : {};
    if (!spec.delayed) return null;
    var expr = spec.delayed;
    var steps = Math.max(0, (Number(slot) || spec.level || 2) - (spec.level || 2));
    var rolled = rollExpr(expr, !!crit, rng);
    if (spec.delayedUp && spec.up && steps > 0) {
      var i;
      for (i = 0; i < steps; i++) {
        var extra = rollExpr(spec.up, !!crit, rng);
        rolled.total += extra.total;
        rolled.faces = rolled.faces.concat(extra.faces);
        rolled.formula += "+" + extra.formula;
      }
    }
    return rolled;
  }

  var FAIL = {
    "entangle": ["Restrained"],
    "web": ["Restrained"],
    "black tentacles": ["Restrained"],
    "hold person": ["Paralyzed"],
    "hold monster": ["Paralyzed"],
    "grease": ["Prone"],
    "blindness/deafness": ["Blinded"],
    "fear": ["Frightened"],
    "cause fear": ["Frightened"],
    "charm person": ["Charmed"],
    "hypnotic pattern": ["Charmed", "Incapacitated"],
    "hideous laughter": ["Prone", "Incapacitated"],
    "dissonant whispers": ["uses reaction: moves away"],
    "arms of hadar": ["No reactions"],
    "destructive wave": ["Prone"]
  };
  var POOLS = {
    "sleep": "Unconscious",
    "color spray": "Blinded"
  };
  function failList(name) {
    var key = norm(name);
    if (POOLS[key]) return [];
    if (FAIL[key]) return FAIL[key].slice();
    var hit = [];
    Object.keys(FAIL).forEach(function (k) {
      if (!hit.length && key.indexOf(k) >= 0 && !POOLS[key]) hit = FAIL[k].slice();
    });
    return hit;
  }
  function poolSpell(name) {
    var key = norm(name);
    return POOLS[key] || "";
  }
  function immune(name, creature) {
    if (norm(name) !== "hideous laughter" || !creature) return false;
    var score = creature.int != null ? creature.int : creature.INT;
    if (score == null && creature.abilities) score = creature.abilities.INT || creature.abilities.int;
    if (score == null) return false;
    return Number(score) <= 4;
  }

  root.SSDNSSpellRiders = {
    patchRow: patchRow,
    emptyBag: emptyBag,
    durHours: durHours,
    chainTargets: chainTargets,
    agathys: agathys,
    concentrates: concentrates,
    needsOptions: needsOptions,
    arm: arm,
    attackRiders: attackRiders,
    onHitSpell: onHitSpell,
    contagionSave: contagionSave,
    contagionChip: contagionChip,
    enfeebleAmount: enfeebleAmount,
    fireShieldHit: fireShieldHit,
    shieldBagFromChips: shieldBagFromChips,
    resistAmount: resistAmount,
    breakConc: breakConc,
    dropSpell: dropSpell,
    noteDown: noteDown,
    transfer: transfer,
    phaseTicks: phaseTicks,
    dealt: dealt,
    zeroState: zeroState,
    missDamage: missDamage,
    delayedRoll: delayedRoll,
    failList: failList,
    poolSpell: poolSpell,
    immune: immune,
    shieldChip: shieldChip,
    hexChip: hexChip,
    rollExpr: rollExpr,
    diseases: DISEASES.slice()
  };
})(typeof window !== "undefined" ? window : globalThis);

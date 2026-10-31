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
  /* Instant riders (No healing, Blinded until your next turn) are not concentration marks. */
  function effectChip(name, opts, row) {
    opts = opts || {};
    var c = chip(name, opts.targetId, (row && row.name) || "", false, opts.casterId || "");
    if (row && row.rounds) c.rounds = row.rounds;
    if (row && row.until === "target") c.rounds = 1;
    if (row && row.consume) c.consume = row.consume;
    if (row && row.until) c.until = row.until;
    return c;
  }
  function armUntil(next, row, opts, names) {
    if (!row || !opts || !names || !names.length) return;
    var when = "";
    var owner = "";
    var hold = 0;
    if (row.until === "caster") { when = "start"; owner = opts.casterId || ""; }
    else if (row.until === "casterEnd") { when = "end"; owner = opts.casterId || ""; hold = 1; }
    else if (row.until === "targetEnd") { when = "end"; owner = opts.targetId || ""; hold = 1; }
    if (!when || !owner) return;
    var victim = opts.targetId || "";
    var exists = next.ticks.some(function (t) {
      return t && t.drop && t.when === when && norm(t.spell) === norm(row.name) && String(t.victimId || "") === String(victim);
    });
    if (exists) return;
    addTick(next, {
      spell: row.name,
      targetId: owner,
      victimId: victim,
      when: when,
      auto: true,
      once: true,
      hold: hold,
      drop: names.slice()
    });
  }
  var tickSerial = 0;
  function addTick(next, tick) {
    if (!tick.id) {
      tickSerial += 1;
      tick.id = "tk" + tickSerial;
    }
    next.ticks.push(tick);
    return tick;
  }
  function tickMatches(t, spec) {
    if (!t || !spec) return false;
    if (spec.spell && norm(t.spell) !== norm(spec.spell)) return false;
    if (spec.when && t.when !== spec.when) return false;
    if (spec.targetId && t.targetId && String(t.targetId) !== String(spec.targetId)) return false;
    if (!!spec.contagion !== !!t.contagion) return false;
    if (spec.once != null && !!spec.once !== !!t.once) return false;
    if (spec.auto != null && !!spec.auto !== !!t.auto) return false;
    if (spec.save && String(t.save || "") !== String(spec.save)) return false;
    return true;
  }
  function hasTick(bag, spec) {
    return emptyBag(bag).ticks.some(function (t) { return tickMatches(t, spec); });
  }
  function upDice(base, up, slot, level) {
    var expr = String(base || "");
    var steps = Math.max(0, (Number(slot) || Number(level) || 0) - (Number(level) || 0));
    var i;
    if (!up || steps <= 0) return expr;
    for (i = 0; i < steps; i++) expr += (expr ? "+" : "") + up;
    return expr;
  }
  function sameTick(a, b) {
    if (!a || !b) return false;
    if (a.id && b.id) return a.id === b.id;
    return tickMatches(a, b);
  }
  function endSpellInBag(next, spell, removed) {
    var key = norm(spell);
    if (!key) return;
    next.marks = next.marks.filter(function (m) {
      if (norm(m.spell) !== key) return true;
      if (m.chip) removed.push(chip(m.chip, m.targetId, m.spell, !!m.conc, m.casterId));
      return false;
    });
    next.ticks = next.ticks.filter(function (t) { return norm(t.spell) !== key; });
    if (norm(next.conc) === key) next.conc = "";
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
    if (key === "banishing smite" || key === "lead smite") { out.save = null; out.banishAt = key === "banishing smite" ? 50 : out.banishAt; out.meleeOnly = false; out.gunOk = true; }
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
      out.createToken = true;
      out.moveFeet = 0;
      out.noHp = true;
      out.notTargetable = true;
      out.noInit = true;
      out.squares = 2;
    }
    if (key === "spiritual weapon") {
      out.createToken = true;
      out.moveFeet = 20;
      out.noHp = true;
      out.notTargetable = true;
      out.noInit = true;
      out.squares = 1;
    }
    if (key === "flaming sphere") {
      out.createToken = true;
      out.moveFeet = 30;
      out.noHp = true;
      out.notTargetable = true;
      out.noInit = true;
      out.squares = 1;
    }
    if (key === "flame blade") {
      out.createToken = false;
      out.heldFx = true;
    }
    if (key === "acid arrow") { out.missHalf = true; out.delayed = "2d4"; out.delayedUp = true; }
    if (key === "lightning arrow") {
      out.missHalf = true;
      out.replacesWeapon = true;
      out.splash = { radius: 10, save: "DEX", dice: "2d8", type: "lightning", half: true, up: out.up || "1d8" };
    }
    if (key === "hunger of hadar") {
      out.tickEnd = { save: "DEX", dice: "2d6", type: "acid", half: false };
      out.applyNow = false;
      out.conc = true;
    }
    if (key === "wall of thorns") { out.type = "piercing"; out.through = "slashing"; out.half = true; }
    if (key === "wind wall") {
      out.kind = "save";
      out.save = "STR";
      out.dice = "3d8";
      out.type = "bludgeoning";
      out.half = true;
      out.conc = true;
    }
    if (key === "darkness") { out.level = out.level || 2; out.conc = true; }
    if (key === "fog cloud" || key === "wall of fire" || key === "wall of ice" || key === "blade barrier") out.conc = true;
    if (key === "spirit guardians") { out.speed = "half"; out.half = true; }
    if (key === "armor of agathys") { out.tempPer = 5; out.retaliate = 5; out.retaliateType = "cold"; }
    if (key === "destructive wave") { out.onFail = "Prone"; out.choose = true; }
    if (key === "acid splash") out.pick = { count: 2, optional: true, within: 5 };
    if (key === "mass healing word") out.pick = { count: 6, optional: true, heal: true };
    if (key === "mass cure wounds") out.pick = { count: 6, optional: true, heal: true, inArea: true };
    if (key === "harm") { out.floorHp = 1; out.maxDrop = "fail"; }
    if (key === "prismatic spray") out.prismatic = true;
    if (key === "vampiric touch") out.healHalf = true;
    if (key === "thorn whip") out.pull = 10;
    if (key === "scorching ray") out.cancelOnSpark = true;
    if (key === "conjure barrage" || key === "conjure volley") out.ammoType = true;
    if (key === "witch bolt" || key === "vampiric touch" || key === "heat metal" || key === "flame blade" || key === "call lightning" || key === "sunbeam" || key === "moonbeam" || key === "spiritual weapon" || key === "flaming sphere") {
      out.sustain = sustainSpec(key);
    }
    if (key === "dissonant whispers") { out.onFail = "uses reaction: moves away"; }
    if (key === "arms of hadar") { out.onFail = "No reactions"; }
    /* N81 P0-6: missing FAIL / on-hit chips. Lighting stays Phase 4. */
    if (key === "sunbeam") { out.onFail = "Blinded"; out.until = "caster"; }
    if (key === "sunburst") { out.onFail = "Blinded"; out.endSave = "CON"; out.rounds = 10; }
    if (key === "thunderwave") { out.onFail = "Pushed 10 ft"; out.push = 10; }
    if (key === "chill touch") { out.onHit = "No healing"; out.until = "caster"; }
    if (key === "ray of frost") { out.onHit = "Speed −10"; out.speed = -10; out.until = "caster"; }
    if (key === "shocking grasp") { out.onHit = "No reactions"; out.until = "target"; }
    if (key === "vicious mockery") { out.onFail = "Disadv next attack"; out.consume = "attacker"; out.until = "targetEnd"; }
    if (key === "guiding bolt") { out.onHit = "Guided"; out.consume = "target"; out.until = "casterEnd"; }
    if (key === "branding smite") { out.clears = ["Invisible"]; out.light = { dim: 5 }; out.conc = true; out.meleeOnly = false; out.gunOk = true; }
    if (key === "heal") { out.clears = ["Blinded", "Deafened"]; }
    if (key === "disintegrate") {
      out.onSave = "none";
      out.zeroHp = "disintegrated";
      out.half = false;
      out.note = "";
    }
    if (key === "bless") {
      out.conc = true;
      out.bless = true;
      out.targets = 3;
      out.targetUp = 1;
      out.die = "1d4";
      out.sign = 1;
      out.chip = "Blessed";
    }
    if (key === "bane") {
      out.conc = true;
      out.bane = true;
      out.save = "CHA";
      out.targets = 3;
      out.targetUp = 1;
      out.die = "1d4";
      out.sign = -1;
      out.chip = "Baned";
      out.onFail = "Baned";
    }
    if (key === "mage armor") {
      out.conc = false;
      out.mageArmor = true;
      out.dur = "8 h";
      out.chip = "Mage Armor";
    }
    if (key === "shield") {
      out.conc = false;
      out.ac = 5;
      out.untilTurn = true;
      out.chip = "Shield +5";
    }
    /* N91: book-side Chunks 7–9. A kind "none" row in rules.js becomes the admitted cast row. */
    var admit = root.SSDNS_SPELL_ADMIT && root.SSDNS_SPELL_ADMIT.by;
    var extra = admit && admit[key];
    if (extra) {
      Object.keys(extra).forEach(function (field) {
        if (field === "name") return;
        if (field === "kind") {
          if (!out.kind || out.kind === "none") out.kind = extra.kind;
          return;
        }
        if (field === "level" && out.level) return;
        if (out[field] == null || out[field] === "") out[field] = extra[field];
      });
    }
    var Zones = root.SSDNSSpellZones;
    if (Zones && Zones.defersCast && Zones.defersCast(key)) {
      out.applyNow = false;
      out.castDamage = false;
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
    if (key === "spirit guardians") return { kind: "mode", options: ["radiant", "necrotic"] };
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
    var zones = [];
    if (!key) return { bag: next, removed: removed, zones: zones };
    next.marks = next.marks.filter(function (m) {
      if (norm(m.spell) !== key) return true;
      removed.push(chip(m.chip, m.targetId, m.spell, m.conc, m.casterId));
      return false;
    });
    next.zones = next.zones.filter(function (z) {
      if (norm(z.spell) !== key) return true;
      zones.push(z);
      removed.push(chip(z.chip || z.spell, z.targetId || "", z.spell, !!(z && z.conc), z.casterId));
      return false;
    });
    next.ticks = next.ticks.filter(function (t) { return norm(t.spell) !== key; });
    if (norm(next.conc) === key) next.conc = "";
    if (removed.length) tickSound();
    return { bag: next, removed: removed, zones: zones };
  }

  function breakConc(bag, spellName) {
    var next = copyBag(bag);
    var removed = [];
    if (spellName) return dropSpell(next, spellName);
    var name = next.conc;
    if (!name) {
      var dropped = [];
      next.marks.forEach(function (m) { if (m.conc) removed.push(chip(m.chip, m.targetId, m.spell, true, m.casterId)); });
      next.zones.forEach(function (z) {
        if (z && z.conc) {
          dropped.push(z);
          removed.push(chip(z.chip || z.spell, "", z.spell, true, z.casterId));
        }
      });
      next.marks = next.marks.filter(function (m) { return !m.conc; });
      next.zones = next.zones.filter(function (z) { return !(z && z.conc); });
      next.ticks = next.ticks.filter(function (t) { return !t.conc; });
      if (removed.length) tickSound();
      return { bag: next, removed: removed, zones: dropped };
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
    } else if (key === "heat metal") {
      addMark({
        spell: name, conc: true, kind: "heat", targetId: targetId, chip: "Heated metal",
        dice: "2d8", type: "fire", dropSave: "CON"
      });
      logs.push("(C) · Heated metal · auto fire · CON save to drop");
    } else if (key === "flame blade") {
      addMark({
        spell: name, conc: true, kind: "held", targetId: opts.casterId || "self",
        chip: "Flame blade", heldFx: true, createToken: false
      });
      logs.push("(C) · held flame blade on the caster · not a token");
    } else if (key === "bless" || key === "bane") {
      var Buffs = root.SSDNSSpellBuffs;
      var cap = Buffs && Buffs.targetCap ? Buffs.targetCap(slot) : (3 + Math.max(0, slot - 1));
      var list = (opts.targets && opts.targets.length) ? opts.targets.slice(0, cap) : [{ id: targetId, name: targetName }];
      var signN = key === "bane" ? -1 : 1;
      var chipLabel = key === "bane" ? "Baned" : "Blessed";
      list.forEach(function (t) {
        if (!t || t.narrative) return;
        if (key === "bane" && opts.pendingSave) return;
        if (key === "bane" && opts.failedIds && opts.failedIds.indexOf(String(t.id || "")) < 0) return;
        var mark = {
          spell: name, conc: true, kind: key, targetId: t.id || "", targetName: t.name || "",
          chip: chipLabel, sign: signN, die: "1d4"
        };
        next.marks.push(mark);
        if (mark.chip && !(key === "bane" && opts.holdChips)) {
          chips.push(chip(mark.chip, mark.targetId, name, true, opts.casterId || ""));
          tickSound();
        }
      });
      logs.push((key === "bane" ? "Bane" : "Bless") + " · up to " + cap + " · (C) · " + (signN < 0 ? "−1d4" : "+1d4") + (key === "bane" ? " · CHA save" : "") + (list.length ? " · " + list.map(function (t) { return (t && t.name) || "creature"; }).join(", ") : ""));
    } else if (key === "mage armor") {
      addMark({
        spell: name, conc: false, kind: "mageArmor", targetId: targetId || opts.casterId || "self",
        chip: "Mage Armor"
      });
      logs.push("Mage Armor · AC 13 + DEX · 8 h · not concentration");
    } else if (key === "shield") {
      addMark({
        spell: name, conc: false, kind: "ward", targetId: opts.casterId || targetId || "self",
        chip: "Shield +5", untilTurn: true
      });
      logs.push("Shield · +5 AC until the start of your next turn · not concentration");
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
        clears: row.clears || null,
        light: row.light || null,
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
    ctx = ctx || {};
    /* Lead, Branding, and Banishing ride a gun. Classic smites stay melee-only. */
    if (mark.gunOk && ctx.gun) return true;
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
    if (!hit) return missRiders(next, ctx, rng);
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
    var splashHit = null;
    var banishHit = 0;
    next.marks.forEach(function (mark) {
      if (mark.kind !== "smite" || !mark.pending) { kept.push(mark); return; }
      if (!weaponAttack || !weaponOk(mark, ctx)) { kept.push(mark); return; }
      var splashOut = null;
      if (mark.dice && !(mark.splash && mark.splash.includeTarget)) {
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
        addTick(next, { spell: mark.spell, targetId: ctx.targetId, when: "start", save: "CON", dice: mark.burn.dice, type: "fire", conc: true, endOnSuccess: true });
        chips.push(chip("Burning", ctx.targetId, mark.spell, true, ctx.casterId || ""));
      }
      if (mark.startDice) {
        addTick(next, { spell: mark.spell, targetId: ctx.targetId, when: "start", dice: upDice(mark.startDice, mark.up, mark.slot, 1), type: mark.startType || "piercing", conc: !!mark.conc, auto: true });
      }
      if (mark.endSave) {
        addTick(next, { spell: mark.spell, targetId: ctx.targetId, when: "end", save: mark.endSave, endOnSuccess: true, conc: !!mark.conc });
      }
      if (mark.clears && mark.clears.length) {
        mark.clears.forEach(function (n) { removed.push(chip(n, ctx.targetId, mark.spell, false, ctx.casterId || "")); });
        logs.push("clears " + mark.clears.join(", "));
        if (mark.light && mark.light.dim) logs.push("dim " + mark.light.dim + " ft (lighting waits)");
      }
      if (mark.splash) splashOut = scaleSplash(mark);
      if (splashOut) {
        logs.push("splash " + splashOut.radius + " ft " + (splashOut.save || "DEX") + " " + splashOut.dice);
        if (!splashHit) splashHit = splashOut;
      }
      if (mark.banishAt) banishHit = mark.banishAt;
      kept.push(mark);
    });
    next.marks = kept;
    var total = 0;
    riders.forEach(function (r) { total += r.total; });
    return { bag: next, riders: riders, logs: logs, chips: chips, removed: removed, total: total, splash: splashHit, banishAt: banishHit };
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
      if (hasTick(next, { spell: name, targetId: opts.targetId || "", when: "end", contagion: true })) {
        return { bag: next, logs: [], chips: [], removed: [], noDamage: true, changed: false };
      }
      var disease = opts.disease || DISEASES[2];
      next.marks.push({
        spell: name, conc: false, kind: "contagion", targetId: opts.targetId || "", targetName: opts.targetName || "",
        chip: "Poisoned", disease: disease, success: 0, fail: 0
      });
      addTick(next, { spell: name, targetId: opts.targetId || "", when: "end", save: "CON", contagion: true, disease: disease });
      chips.push(chip("Poisoned", opts.targetId, name, false, opts.casterId || ""));
      chips.push(chip(contagionChip(0, 0), opts.targetId, name, false, opts.casterId || ""));
      tickSound();
      logs.push("no damage — Poisoned");
      logs.push("COND +Poisoned (Contagion; CON save end of each turn, 3F = " + disease + ")");
      return { bag: next, logs: logs, chips: chips, removed: [], noDamage: true, changed: true };
    }
    if (key === "ray of enfeeblement") {
      if (hasTick(next, { spell: name, targetId: opts.targetId || "", when: "end", save: "CON" })) {
        return { bag: next, logs: [], chips: [], removed: [], noDamage: true, changed: false };
      }
      next.marks.push({
        spell: name, conc: true, kind: "enfeeble", targetId: opts.targetId || "", chip: "Enfeebled (½ STR weapon dmg)"
      });
      addTick(next, { spell: name, targetId: opts.targetId || "", when: "end", save: "CON", endOnSuccess: true, conc: true });
      if (!next.conc) next.conc = name;
      chips.push(chip("Enfeebled (½ STR weapon dmg)", opts.targetId, name, true, opts.casterId || ""));
      tickSound();
      logs.push("no damage — Enfeebled (½ STR weapon dmg)");
      return { bag: next, logs: logs, chips: chips, removed: [], noDamage: true, changed: true };
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

  function plain(result) {
    result.removed = result.removed || [];
    if (result.changed == null) result.changed = !!((result.logs && result.logs.length) || (result.chips && result.chips.length));
    return result;
  }

  /* A cast that resolves on this action (the spell's own attack or save), not a pending arm-for-later mark. */
  function landResolved(bag, opts) {
    opts = opts || {};
    var row = opts.row ? patchRow(opts.row) : (opts.name ? patchRow({ name: opts.name }) : null);
    var name = (row && row.name) || opts.name || "";
    var key = norm(name);
    var next = copyBag(bag);
    var logs = [];
    var chips = [];
    var removed = [];
    var hit = opts.hit !== false && !opts.miss;
    var failed = !!opts.failed;
    var slot = opts.slot;
    var unchanged = { bag: next, logs: logs, chips: chips, removed: [], changed: false };
    if (!name) return unchanged;

    if (hit && (key === "contagion" || key === "ray of enfeeblement")) {
      return plain(onHitSpell(next, {
        row: row, name: name, miss: false, targetId: opts.targetId || "", targetName: opts.targetName || "",
        disease: opts.disease || "", casterId: opts.casterId || ""
      }));
    }

    if (key === "phantasmal killer") {
      if (!failed) return unchanged;
      var later = (row && row.later) || {};
      var saveAb = later.save || "WIS";
      if (hasTick(next, { spell: name, targetId: opts.targetId || "", when: "end", save: saveAb })) return unchanged;
      var dice = upDice(later.dice || (row && row.dice) || "4d10", later.up || (row && row.up) || "1d10", slot, (row && row.level) || 4);
      addTick(next, {
        spell: name, targetId: opts.targetId || "", when: "end", save: saveAb, dice: dice,
        type: later.type || (row && row.type) || "psychic", endOnSuccess: true, conc: true
      });
      if (!next.conc) next.conc = name;
      chips.push(chip("Frightened", opts.targetId, name, true, opts.casterId || ""));
      logs.push("end of each turn: " + saveAb + " save or " + dice + " psychic; a success ends it");
      return { bag: next, logs: logs, chips: chips, removed: [], changed: true };
    }

    /* 2014 PHB: a miss is half the initial acid only. No damage at the end of the next turn. */
    if (key === "acid arrow") {
      if (!hit) return unchanged;
      var rolled = opts.rolledDelayed && (opts.rolledDelayed.formula || opts.rolledDelayed.total)
        ? opts.rolledDelayed
        : delayedRoll(row || { name: name }, slot, !!opts.crit, opts.rng);
      if (!rolled) return unchanged;
      var formula = rolled.formula || (row && row.delayed) || "2d4";
      addTick(next, {
        spell: name, targetId: opts.targetId || "", when: "end", auto: true, once: true,
        dice: formula, amount: Number(rolled.total) || 0, formula: formula, faces: rolled.faces || [],
        type: (row && row.type) || "acid"
      });
      logs.push("end of its next turn: " + formula + " = " + (Number(rolled.total) || 0) + " acid");
      return { bag: next, logs: logs, chips: chips, removed: [], changed: true };
    }

    if (!hit || !row) return unchanged;
    var needsFail = key === "ensnaring strike" || key === "blinding smite" || key === "wrathful smite" || key === "thunderous smite" || key === "staggering smite";
    if (!needsFail && row.save && row.onFail && !row.burn) needsFail = true;
    if (needsFail && !failed) return unchanged;

    var before = next.ticks.length;
    if (row.burn && !hasTick(next, { spell: name, targetId: opts.targetId || "", when: "start", save: row.burn.save || "CON" })) {
      addTick(next, {
        spell: name, targetId: opts.targetId || "", when: "start", save: row.burn.save || "CON",
        dice: row.burn.dice || "1d6", type: "fire", conc: true, endOnSuccess: true
      });
      chips.push(chip("Burning", opts.targetId, name, true, opts.casterId || ""));
      logs.push("start of each turn: " + (row.burn.save || "CON") + " save or " + (row.burn.dice || "1d6") + " fire; a success ends it");
    }
    if ((row.diceOn === "start" || row.startDice) && !hasTick(next, { spell: name, targetId: opts.targetId || "", when: "start", auto: true })) {
      var startExpr = upDice(row.startDice || row.dice || "1d6", row.up, slot, row.level || 1);
      addTick(next, {
        spell: name, targetId: opts.targetId || "", when: "start", dice: startExpr,
        type: row.startType || "piercing", conc: concentrates(name, row), auto: true
      });
      logs.push("start of each turn: " + startExpr + " " + (row.startType || "piercing"));
    }
    if (row.endSave && !hasTick(next, { spell: name, targetId: opts.targetId || "", when: "end", save: row.endSave })) {
      addTick(next, {
        spell: name, targetId: opts.targetId || "", when: "end", save: row.endSave,
        endOnSuccess: true, conc: concentrates(name, row)
      });
      logs.push("end of each turn: " + row.endSave + " save or the spell continues");
    }
    if (next.ticks.length > before && concentrates(name, row) && !next.conc) next.conc = name;
    if (row.onFail && failed) {
      var failChip = (row.until || row.consume)
        ? effectChip(row.onFail, opts, row)
        : chip(row.onFail, opts.targetId, name, concentrates(name, row), opts.casterId || "");
      if (row.rounds && failChip.rounds == null) failChip.rounds = row.rounds;
      chips.push(failChip);
      if (row.until) armUntil(next, row, opts, [row.onFail]);
    }
    if (hit && row.onHit && !row.hitSave) {
      chips.push(effectChip(row.onHit, opts, row));
      armUntil(next, row, opts, [row.onHit]);
      logs.push(row.onHit + (row.until === "caster" ? " until your next turn" : (row.until === "target" ? " until its next turn" : "")));
    }
    if (failed && row.push) logs.push("pushed " + row.push + " ft");
    if (hit && row.clears && row.clears.length) {
      row.clears.forEach(function (n) { removed.push(chip(n, opts.targetId, name, false, opts.casterId || "")); });
      logs.push("clears " + row.clears.join(", "));
      if (row.light && row.light.dim) logs.push("dim " + row.light.dim + " ft (lighting waits)");
    }
    var changed = next.ticks.length > before || chips.length > 0 || removed.length > 0;
    return { bag: next, logs: logs, chips: chips, removed: removed, changed: changed };
  }

  var END_CHIPS = {
    "searing smite": ["Burning"],
    "ray of enfeeblement": ["Enfeebled (½ STR weapon dmg)"],
    "blinding smite": ["Blinded"],
    "phantasmal killer": ["Frightened"],
    "ensnaring strike": ["Restrained"],
    "sunburst": ["Blinded"]
  };

  /* Apply one due rider tick. A successful end save drops the chip and the tick. Contagion advances S/F. */
  function settleTick(bag, tick, save) {
    var next = copyBag(bag);
    var logs = [];
    var chips = [];
    var removed = [];
    var amount = 0;
    var formula = "";
    var type = (tick && tick.type) || "";
    save = save || {};
    var failed = !!save.failed;
    var empty = { bag: next, logs: logs, chips: chips, removed: removed, amount: 0, formula: "", type: type, ended: false };
    if (!tick) return empty;

    if (tick.prismatic) {
      var pMark = null;
      next.marks.forEach(function (m) {
        if (m.kind === "prism" && (!tick.targetId || !m.targetId || String(m.targetId) === String(tick.targetId))) pMark = m;
      });
      if (!pMark) {
        next.ticks = next.ticks.filter(function (t) { return !sameTick(t, tick); });
        return { bag: next, logs: logs, chips: chips, removed: removed, amount: 0, formula: "", type: "", ended: true };
      }
      if (failed) pMark.fail = (pMark.fail || 0) + 1;
      else pMark.success = (pMark.success || 0) + 1;
      logs.push((failed ? "FAIL" : "SAVE") + " (S " + pMark.success + "/3 F " + pMark.fail + "/3)");
      if (pMark.fail >= 3) {
        removed.push(chip("Restrained", pMark.targetId, "Prismatic Spray", false, ""));
        chips.push(chip("Petrified", pMark.targetId, "Prismatic Spray", false, ""));
        pMark.done = true;
        logs.push("Petrified");
      } else if (pMark.success >= 3) {
        removed.push(chip("Restrained", pMark.targetId, "Prismatic Spray", false, ""));
        pMark.done = true;
        logs.push("the indigo ray ends");
      }
      if (pMark.done) {
        next.marks = next.marks.filter(function (m) { return m !== pMark; });
        next.ticks = next.ticks.filter(function (t) { return !sameTick(t, tick); });
      }
      return { bag: next, logs: logs, chips: chips, removed: removed, amount: 0, formula: "", type: "", ended: !!pMark.done };
    }

    if (tick.contagion) {
      var stepped = contagionSave(next, tick.targetId, failed);
      next = stepped.bag;
      logs = logs.concat(stepped.logs || []);
      chips = chips.concat(stepped.chips || []);
      removed = removed.concat(stepped.removed || []);
      var still = next.marks.some(function (m) {
        return m.kind === "contagion" && !m.done && (!tick.targetId || !m.targetId || String(m.targetId) === String(tick.targetId));
      });
      var finished = next.marks.some(function (m) {
        return m.kind === "contagion" && m.done && (!tick.targetId || !m.targetId || String(m.targetId) === String(tick.targetId));
      });
      if (!still || finished) next.ticks = next.ticks.filter(function (t) { return !sameTick(t, tick); });
      return { bag: next, logs: logs, chips: chips, removed: removed, amount: 0, formula: "", type: "", ended: !still || finished };
    }

    if (tick.hold > 0) {
      next.ticks.forEach(function (t) {
        if (sameTick(t, tick)) t.hold = Math.max(0, (Number(t.hold) || 0) - 1);
      });
      logs.push((tick.spell || "Spell") + " still up");
      return { bag: next, logs: logs, chips: chips, removed: removed, amount: 0, formula: "", type: type, ended: false };
    }

    if (tick.drop && tick.drop.length) {
      var dropId = tick.victimId || tick.targetId;
      tick.drop.forEach(function (n) { removed.push(chip(n, dropId, tick.spell, !!tick.conc, "")); });
      if (tick.once) next.ticks = next.ticks.filter(function (t) { return !sameTick(t, tick); });
      logs.push((tick.spell || "Spell") + " ends");
      return { bag: next, logs: logs, chips: chips, removed: removed, amount: 0, formula: "", type: type, ended: true };
    }

    if (tick.auto || !tick.save) {
      formula = tick.formula || (typeof tick.dice === "string" ? tick.dice : "");
      if (isFinite(Number(tick.amount)) && Number(tick.amount) > 0) amount = Number(tick.amount);
      else if (tick.dice) {
        var expr = typeof tick.dice === "string" ? tick.dice : (tick.dice.formula || "");
        var rolled = rollExpr(expr, false, save.rng);
        amount = rolled.total;
        formula = rolled.formula;
      }
      var endedAuto = false;
      if (tick.once) {
        next.ticks = next.ticks.filter(function (t) { return !sameTick(t, tick); });
        endedAuto = true;
      }
      if (amount > 0) logs.push((tick.spell || "Spell") + " " + (tick.when || "") + " " + formula + " = " + amount + (type ? " " + type : ""));
      return { bag: next, logs: logs, chips: chips, removed: removed, amount: amount, formula: formula, type: type, ended: endedAuto };
    }

    if (!failed && tick.endOnSuccess) {
      var spellKey = norm(tick.spell);
      (END_CHIPS[spellKey] || []).forEach(function (name) {
        removed.push(chip(name, tick.targetId, tick.spell, !!tick.conc, ""));
      });
      endSpellInBag(next, tick.spell, removed);
      logs.push("SAVE — " + (tick.spell || "Spell") + " ends");
      return { bag: next, logs: logs, chips: chips, removed: removed, amount: 0, formula: "", type: type, ended: true };
    }

    if (failed && tick.dice) {
      var exprFail = typeof tick.dice === "string" ? tick.dice : (tick.dice.formula || "");
      var rolledFail = rollExpr(exprFail, false, save.rng);
      amount = rolledFail.total;
      formula = rolledFail.formula;
      if (amount > 0) logs.push("FAIL — " + (tick.spell || "Spell") + " " + formula + " = " + amount + (type ? " " + type : ""));
    } else if (failed) logs.push("FAIL — " + (tick.spell || "Spell") + " continues");
    return { bag: next, logs: logs, chips: chips, removed: removed, amount: amount, formula: formula, type: type, ended: false };
  }

  function phaseTicks(bag, targetId, when, rng) {
    var next = copyBag(bag);
    var due = [];
    var ids = Array.isArray(targetId) ? targetId.filter(Boolean).map(function (id) { return String(id); }) : (targetId ? [String(targetId)] : []);
    next.ticks.forEach(function (t) {
      if (t.when !== when) return;
      if (ids.length && t.targetId && ids.indexOf(String(t.targetId)) < 0) return;
      var row = Object.assign({}, t);
      var dice = typeof t.dice === "string" ? t.dice : ((t.dice && t.dice.formula) || "");
      if (t.auto && dice && !(Number(t.amount) > 0 && t.formula)) {
        var rolled = rollExpr(dice, false, rng);
        row.amount = rolled.total;
        row.formula = rolled.formula;
        row.faces = rolled.faces;
        row.dice = dice;
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
    "destructive wave": ["Prone"],
    "sunbeam": ["Blinded"],
    "sunburst": ["Blinded"],
    "thunderwave": ["Pushed 10 ft"],
    "vicious mockery": ["Disadv next attack"]
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
  function clearsOf(name) {
    var spec = patchRow({ name: name || "" });
    return spec && spec.clears ? spec.clears.slice() : [];
  }
  function immune(name, creature) {
    if (norm(name) !== "hideous laughter" || !creature) return false;
    var score = creature.int != null ? creature.int : creature.INT;
    if (score == null && creature.abilities) score = creature.abilities.INT || creature.abilities.int;
    if (score == null) return false;
    return Number(score) <= 4;
  }

  function sustainSpec(name) {
    var key = norm(name);
    var table = {
      "witch bolt": { action: "action", auto: true, type: "lightning" },
      "vampiric touch": { action: "action", attack: true, healHalf: true },
      "heat metal": { action: "bonus", auto: true, type: "fire", dropSave: "CON" },
      "flame blade": { action: "action", attack: true },
      "call lightning": { action: "action", bolt: true },
      "sunbeam": { action: "action", line: true },
      "moonbeam": { action: "action", move: true },
      "spiritual weapon": { action: "bonus", attack: true, conc: false, move: 20 },
      "flaming sphere": { action: "bonus", move: 30, ram: true }
    };
    return table[key] ? Object.assign({ name: key }, table[key]) : null;
  }
  function scaleSplash(mark) {
    if (!mark || !mark.splash) return null;
    var sp = Object.assign({}, mark.splash);
    var level = 1;
    if (norm(mark.spell) === "lightning arrow") level = 3;
    sp.dice = upDice(sp.dice, sp.up, mark.slot, level);
    sp.originId = mark.targetId || "";
    return sp;
  }
  function missRiders(next, ctx, rng) {
    var riders = [];
    var logs = [];
    var kept = [];
    var splashHit = null;
    var total = 0;
    next.marks.forEach(function (mark) {
      if (mark.kind !== "smite" || !mark.pending) { kept.push(mark); return; }
      if (!weaponOk(mark, ctx)) { kept.push(mark); return; }
      if (!mark.missHalf && !mark.splash) { kept.push(mark); return; }
      mark.pending = false;
      mark.targetId = ctx.targetId || "";
      if (mark.missHalf && mark.dice && !(mark.splash && mark.splash.includeTarget)) {
        var sm = rollExpr(mark.dice, false, rng);
        var baseLv = norm(mark.spell) === "lightning arrow" ? 3 : 1;
        var steps = mark.up ? Math.max(0, (Number(mark.slot) || baseLv) - baseLv) : 0;
        if (mark.up && steps > 0) {
          var i;
          for (i = 0; i < steps; i++) {
            var extra = rollExpr(mark.up, false, rng);
            sm.total += extra.total;
            sm.faces = sm.faces.concat(extra.faces);
            sm.formula += "+" + extra.formula;
          }
        }
        var half = Math.floor(sm.total / 2);
        riders.push({ label: mark.spell, spell: mark.spell, formula: sm.formula, faces: sm.faces, total: half, type: mark.type || "", half: true });
        logs.push("MISS half " + mark.spell + ": " + half + (mark.type ? " " + mark.type : ""));
        total += half;
      }
      if (mark.splash) {
        splashHit = scaleSplash(mark);
        if (splashHit) logs.push("splash " + splashHit.radius + " ft " + (splashHit.save || "DEX") + " " + splashHit.dice);
      }
      kept.push(mark);
    });
    next.marks = kept;
    return { bag: next, riders: riders, logs: logs, chips: [], removed: [], total: total, splash: splashHit, banishAt: 0 };
  }
  function pickPlan(name, slot) {
    var key = norm(name);
    var sl = Number(slot);
    if (!isFinite(sl)) sl = 0;
    if (key === "chain lightning") return { mode: "targets", count: chainTargets(sl || 6), noun: "Target", min: 1, optional: true, each: "save" };
    if (key === "acid splash") return { mode: "targets", count: 2, noun: "Target", min: 1, optional: true, within: 5, each: "save" };
    if (key === "mass healing word") return { mode: "targets", count: 6, noun: "Creature", min: 1, optional: true, each: "heal" };
    if (key === "mass cure wounds") return { mode: "targets", count: 6, noun: "Creature", min: 1, optional: true, each: "heal", inArea: true };
    if (key === "destructive wave") return { mode: "choose", each: "save" };
    return null;
  }
  function keepChosen(tokens, picks) {
    if (!picks) return tokens || [];
    var ids = {};
    var any = false;
    (picks || []).forEach(function (p) {
      if (!p || p.narrative || !p.id) return;
      ids[String(p.id)] = 1;
      any = true;
    });
    if (!any) return [];
    return (tokens || []).filter(function (t) {
      if (!t) return false;
      var keys = [t.id, t.combatantId, t.ownerUid, t.targetId].filter(Boolean).map(String);
      var i;
      for (i = 0; i < keys.length; i++) if (ids[keys[i]]) return true;
      return false;
    });
  }
  function harmAdjust(before, maxHp, amount, failed) {
    var dealt = Math.max(0, Number(amount) || 0);
    var hp = Number(before);
    if (!isFinite(hp)) hp = 0;
    var max = Number(maxHp);
    if (!isFinite(max)) max = hp;
    var next = Math.max(1, hp - dealt);
    var died = false;
    if (failed) {
      max = Math.max(0, max - dealt);
      if (max <= 0) { died = true; next = 0; max = 0; }
      else if (next > max) next = max;
    }
    return { hp: next, max: max, died: died, taken: dealt, floored: next === 1 && hp - dealt < 1 && !died };
  }
  var PRISMATIC = [
    { n: 1, type: "fire", dice: "10d6", half: true },
    { n: 2, type: "acid", dice: "10d6", half: true },
    { n: 3, type: "lightning", dice: "10d6", half: true },
    { n: 4, type: "poison", dice: "10d6", half: true },
    { n: 5, type: "cold", dice: "10d6", half: true },
    { n: 6, condition: "Restrained", tracker: "petrified", save: "CON" },
    { n: 7, condition: "Blinded" }
  ];
  function prismaticRay(rng, depth) {
    var n = die(8, rng);
    if (n === 8) {
      if ((depth || 0) >= 6) return Object.assign({ n: 1 }, PRISMATIC[0]);
      return { n: 8, rays: [prismaticRay(rng, (depth || 0) + 1), prismaticRay(rng, (depth || 0) + 1)] };
    }
    return Object.assign({ n: n }, PRISMATIC[n - 1]);
  }
  function prismaticLeaves(node, out) {
    out = out || [];
    if (!node) return out;
    if (node.rays && node.rays.length) {
      node.rays.forEach(function (r) { prismaticLeaves(r, out); });
      return out;
    }
    out.push(node);
    return out;
  }
  function prismaticHit(ray, save, rng) {
    var leaves = prismaticLeaves(ray, []);
    var parts = [];
    leaves.forEach(function (leaf) {
      if (leaf.dice) {
        var rolled = rollExpr(leaf.dice, false, rng);
        var amount = rolled.total;
        if (save && save.blocked) amount = 0;
        else if (save && !save.failed) amount = leaf.half ? Math.floor(amount / 2) : 0;
        parts.push({ n: leaf.n, amount: amount, type: leaf.type || "", formula: rolled.formula, condition: "", half: !!leaf.half });
      } else if (leaf.condition && save && save.failed && !save.blocked) {
        parts.push({ n: leaf.n, amount: 0, type: "", formula: "", condition: leaf.condition, tracker: leaf.tracker || "" });
      } else {
        parts.push({ n: leaf.n, amount: 0, type: leaf.type || "", formula: "", condition: "" });
      }
    });
    return { parts: parts, ray: ray };
  }
  function armPrismatic(bag, opts) {
    opts = opts || {};
    var next = copyBag(bag);
    var chips = [];
    var logs = [];
    var part = opts.part || {};
    if (!opts.failed || !part.condition) return { bag: next, chips: chips, logs: logs, changed: false };
    if (part.tracker === "petrified") {
      next.marks.push({
        spell: "Prismatic Spray", kind: "prism", targetId: opts.targetId || "", chip: "Restrained",
        success: 0, fail: 0
      });
      addTick(next, { spell: "Prismatic Spray", targetId: opts.targetId || "", when: "end", save: "CON", prismatic: true });
      chips.push(chip("Restrained", opts.targetId, "Prismatic Spray", false, opts.casterId || ""));
      logs.push("Restrained — CON save at end of each turn, 3 fails petrifies");
    } else {
      chips.push(chip(part.condition, opts.targetId, "Prismatic Spray", false, opts.casterId || ""));
      logs.push(part.condition);
    }
    return { bag: next, chips: chips, logs: logs, changed: true };
  }
  function noteSustain(bag, opts) {
    opts = opts || {};
    var spec = sustainSpec(opts.name);
    var next = copyBag(bag);
    if (!spec) return next;
    var key = norm(opts.name);
    next.marks = next.marks.filter(function (m) { return !(m.kind === "sustain" && norm(m.spell) === key); });
    next.marks.push({
      kind: "sustain", spell: opts.name || spec.name, slot: Number(opts.slot) || 0,
      targetId: opts.targetId || "", action: spec.action, conc: spec.conc !== false
    });
    if (spec.conc !== false) next.conc = opts.name || next.conc;
    return next;
  }
  function sustainReady(bag) {
    var next = emptyBag(bag);
    var out = [];
    var seen = {};
    function add(name, slot) {
      var spec = sustainSpec(name);
      if (!spec) return;
      var key = norm(spec.name || name);
      if (seen[key]) return;
      seen[key] = 1;
      out.push({ name: name, slot: slot || 0, spec: spec });
    }
    (next.marks || []).forEach(function (m) {
      if (m && m.kind === "sustain") add(m.spell, m.slot);
    });
    if (next.conc) add(next.conc, 0);
    (next.zones || []).forEach(function (z) {
      if (z && (norm(z.spell) === "spiritual weapon" || norm(z.spell) === "flaming sphere")) add(z.spell, z.slot);
    });
    return out;
  }
  function healBlocked(row) {
    if (!row) return false;
    if (row.disintegrated) return true;
    var list = row.conditions || row.activeConditions || [];
    return (list || []).some(function (c) {
      var name = typeof c === "string" ? c : (c && c.name);
      return /disintegrat/i.test(String(name || ""));
    });
  }
  function ammoType(gun) {
    if (!gun) return "";
    var t = String(gun.dmgType || gun.damageType || "").replace(/\(cone\)/ig, "").trim();
    if (/ammunition/i.test(t)) t = "";
    if (t) return t.split(/[,/]/)[0].trim();
    var load = String(gun.load || "").toLowerCase();
    if (load === "slug" || load === "buck" || load === "shell" || load === "ball" || load === "cart") return "piercing";
    if (Number(gun.loaded) > 0) return "piercing";
    if (Array.isArray(gun.chambers) && gun.chambers.some(Boolean)) return "piercing";
    return "";
  }
  function slideOf(name) {
    var key = norm(name);
    var row = patchRow({ name: name || "" });
    if (key === "thorn whip" || row.pull) return { feet: row.pull || 10, dir: "pull" };
    if (row.push) return { feet: row.push, dir: "push", on: "fail" };
    return null;
  }
  function vampiricHalf(amount) {
    return Math.floor((Number(amount) || 0) / 2);
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
    landResolved: landResolved,
    settleTick: settleTick,
    dealt: dealt,
    zeroState: zeroState,
    missDamage: missDamage,
    delayedRoll: delayedRoll,
    failList: failList,
    clearsOf: clearsOf,
    poolSpell: poolSpell,
    immune: immune,
    shieldChip: shieldChip,
    hexChip: hexChip,
    rollExpr: rollExpr,
    diseases: DISEASES.slice(),
    sustainSpec: sustainSpec,
    noteSustain: noteSustain,
    sustainReady: sustainReady,
    pickPlan: pickPlan,
    keepChosen: keepChosen,
    harmAdjust: harmAdjust,
    prismaticRay: prismaticRay,
    prismaticLeaves: prismaticLeaves,
    prismaticHit: prismaticHit,
    armPrismatic: armPrismatic,
    healBlocked: healBlocked,
    ammoType: ammoType,
    slideOf: slideOf,
    vampiricHalf: vampiricHalf,
    scaleSplash: scaleSplash
  };
})(typeof window !== "undefined" ? window : globalThis);

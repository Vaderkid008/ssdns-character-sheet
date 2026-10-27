/**
 * Look up a spell in SSDNS_RULES.spellCast and roll it.
 * Sheet and DM Command Center both use this. Dice come from the rules build, not from guesswork.
 */
(function (root) {
  "use strict";
  var index = null;

  function rules() { return root.SSDNS_RULES || {}; }
  function norm(s) {
    return String(s || "").toLowerCase().replace(/\./g, "").replace(/\s+/g, " ").trim();
  }
  function stripAlias(s) {
    return String(s || "").replace(/\s*\([^)]*\)\s*/g, " ").replace(/\.+$/, "").replace(/\s+/g, " ").trim();
  }
  function build() {
    if (index) return index;
    index = {};
    (rules().spellCast || []).forEach(function (row) {
      if (!row || !row.name) return;
      var k = norm(row.name);
      var prev = index[k];
      if (!prev || (prev.kind === "none" && row.kind && row.kind !== "none")) index[k] = row;
    });
    return index;
  }
  function finish(row) {
    if (!row) return null;
    var R = root.SSDNSSpellRiders;
    return R && R.patchRow ? R.patchRow(row) : row;
  }
  function lookup(name) {
    var map = build();
    var raw = stripAlias(name);
    if (norm(raw) === "pact shot" || /pact shot/i.test(String(name || ""))) {
      var pact = map["eldritch blast"];
      if (pact) {
        var shot = root.SSDNSPactShot && root.SSDNSPactShot.variant ? root.SSDNSPactShot.variant() : null;
        if (shot && shot.cone) {
          return finish(Object.assign({}, pact, { name: shot.name, kind: "save", scale: "", dice: shot.dice || "1d6", type: shot.damage, note: shot.rider, range: shot.range }));
        }
        if (shot) return finish(Object.assign({}, pact, { name: shot.name, dice: shot.dice || pact.dice, type: shot.damage || pact.type, note: shot.rider || "", range: shot.range }));
        return finish(Object.assign({}, pact, { name: "Pact Shot" }));
      }
    }
    var exact = map[norm(raw)] || null;
    var bareKey = norm(raw.replace(/\s+shell$/i, ""));
    var bare = bareKey && bareKey !== norm(raw) ? (map[bareKey] || null) : null;
    if (bare && (!exact || exact.kind === "none" || /\s+shell$/i.test(exact.name || ""))) {
      if (!exact || exact.kind === "none" || (bare.kind && bare.kind !== "none") || !/\s+shell$/i.test(bare.name || "")) return finish(bare);
    }
    return finish(exact || bare);
  }
  function die(sides) {
    if (sides === 20 && root.SSDNSTestRoll) {
      var forced = root.SSDNSTestRoll();
      if (forced) return forced;
    }
    return 1 + Math.floor(Math.random() * sides);
  }
  function d20roll(mode) {
    var n1 = die(20);
    var n2 = null;
    if (mode === "adv" || mode === "dis") n2 = die(20);
    var nat = n1;
    if (n2 != null) nat = mode === "adv" ? Math.max(n1, n2) : Math.min(n1, n2);
    /* 0.3.63: "d20 5 / «14»" (kept face in « ») so chat draws both dice with the kept one ringed */
    var shown = String(n1);
    if (n2 != null) shown = root.SSDNSDice && root.SSDNSDice.advRun ? root.SSDNSDice.advRun([n1, n2], nat) : "d20 " + (n1 === nat ? "«" + n1 + "» / " + n2 : n1 + " / «" + n2 + "»");
    return { nat: nat, shown: shown, n1: n1, n2: n2, mode: mode || "" };
  }
  function sign(n) {
    n = Number(n) || 0;
    return (n >= 0 ? "+" : "") + n;
  }
  function cantripTier(level) {
    var lv = parseInt(level, 10) || 1;
    if (lv >= 17) return 4;
    if (lv >= 11) return 3;
    if (lv >= 5) return 2;
    return 1;
  }
  function parseDice(expr) {
    var s = String(expr || "").replace(/\s/g, "");
    var parts = [];
    var flat = 0;
    if (!s) return { parts: parts, flat: 0 };
    var re = /([+-]?)(\d*)d(\d+)|([+-]?\d+)/gi;
    var m;
    while ((m = re.exec(s))) {
      if (m[3]) {
        var n = parseInt(m[2] || "1", 10);
        if (m[1] === "-") n = -n;
        parts.push({ n: n, sides: parseInt(m[3], 10) });
      } else if (m[4] != null && m[4] !== "") {
        flat += parseInt(m[4], 10);
      }
    }
    return { parts: parts, flat: flat };
  }
  function cloneDice(p) {
    return { parts: (p.parts || []).map(function (x) { return { n: x.n, sides: x.sides }; }), flat: p.flat || 0 };
  }
  function addDice(base, extra, times) {
    var out = cloneDice(base);
    var add = parseDice(extra);
    var t;
    for (t = 0; t < times; t++) {
      add.parts.forEach(function (p) { out.parts.push({ n: p.n, sides: p.sides }); });
      out.flat += add.flat || 0;
    }
    return out;
  }
  function scaleDice(base, mult) {
    return {
      parts: (base.parts || []).map(function (p) { return { n: p.n * mult, sides: p.sides }; }),
      flat: base.flat || 0
    };
  }
  function formulaOf(parsed, crit) {
    var bits = [];
    (parsed.parts || []).forEach(function (p) {
      var n = Math.abs(p.n) * (crit ? 2 : 1);
      var sign = p.n < 0 ? "-" : (bits.length ? "+" : "");
      bits.push(sign + n + "d" + p.sides);
    });
    if (parsed.flat) bits.push((parsed.flat > 0 ? "+" : "") + parsed.flat);
    return bits.join("") || "0";
  }
  function rollParts(parsed, crit) {
    var bits = [];
    var total = parsed.flat || 0;
    (parsed.parts || []).forEach(function (p) {
      var count = Math.abs(p.n) * (crit ? 2 : 1);
      var rolls = [];
      var i;
      for (i = 0; i < count; i++) rolls.push(die(p.sides));
      var sum = rolls.reduce(function (a, b) { return a + b; }, 0);
      if (p.n < 0) { total -= sum; bits.push("-" + count + "d" + p.sides + " (" + rolls.join("+") + ")"); }
      else { total += sum; bits.push(count + "d" + p.sides + " (" + rolls.join("+") + ")"); }
    });
    if (parsed.flat) bits.push((parsed.flat > 0 ? "+" : "") + parsed.flat);
    return { total: total, detail: bits.join(" ") || "0", formula: formulaOf(parsed, crit) };
  }
  function weaponParts(text) {
    var m = String(text || "").match(/(\d+\s*d\s*\d+(?:\s*[+-]\s*\d+\s*d\s*\d+)*(?:\s*[+-]\s*\d+)?)/i);
    if (!m) return null;
    return parseDice(m[1]);
  }
  function wildSparkLine() {
    var table = rules().wildSpark || [];
    var spark = die(6);
    var row = table[spark - 1];
    return "Wild spark " + spark + (row && row.text ? ": " + row.text : ".");
  }
  function rollCast(opts) {
    opts = opts || {};
    function typeBit(row) {
      var t = row && row.type ? String(row.type) : "";
      if (/you chose|you choose/i.test(t)) t = opts.damageType || "";
      return t ? " " + t : "";
    }
    var found = lookup(opts.spellName);
    var row = found || { name: opts.spellName || "Spell", level: 0, kind: "none" };
    var name = (opts.spellName && String(opts.spellName).replace(/\.+$/, "").trim()) || row.name || "Spell";
    if (found && found.name) name = found.name;
    var slot = parseInt(opts.slotLevel, 10);
    if (!isFinite(slot)) slot = row.level || 0;
    var baseLevel = (found && typeof found.level === "number") ? found.level : slot;
    var charLv = parseInt(opts.characterLevel, 10) || 1;
    var atkBonus = parseInt(opts.attackBonus, 10);
    if (!isFinite(atkBonus)) atkBonus = 0;
    var weaponAtk = parseInt(opts.weaponAtk, 10);
    if (!isFinite(weaponAtk)) weaponAtk = atkBonus;
    var spellMod = parseInt(opts.spellMod, 10);
    if (!isFinite(spellMod)) spellMod = 0;
    var kind = row.kind || "none";
    var upSteps = Math.max(0, slot - (baseLevel || 0));
    if (row.upEvery) upSteps = Math.floor(upSteps / row.upEvery);
    var gun = opts.gunName ? " · " + opts.gunName : "";

    function bundle(parsed, crit) {
      var rolled = rollParts(parsed, crit);
      return { rolled: rolled, text: rolled.detail + typeBit(row) + " = " + rolled.total };
    }
    function shaped() {
      var parsed = parseDice(row.dice || "");
      if (row.scale === "cantrip" && slot === 0) parsed = scaleDice(parsed, cantripTier(charLv));
      if (row.up && upSteps > 0 && row.scale !== "beam" && !row.rays && row.diceOn !== "start") parsed = addDice(parsed, row.up, upSteps);
      if (row.healMod && spellMod) parsed.flat = (parsed.flat || 0) + spellMod;
      return parsed;
    }
    function sparkFor(nat1) {
      if (opts.wildSpark && slot > 0 && nat1) return wildSparkLine();
      return "";
    }
    /* Bless / Bane: one d4 on every attack roll. The caller passes active conditions. */
    function takeAttackDie() {
      var B = root.SSDNSSpellBuffs;
      if (!B || !B.rollMods) return { delta: 0, text: "", parts: [] };
      var pack = B.rollMods(opts.conditions || []);
      return { delta: pack.delta || 0, text: pack.text || "", parts: pack.parts || [] };
    }
    function dieBit(die) { return die && die.text ? (" " + die.text) : ""; }
    function pack(text, attack, nat, crit, formula, result, detail, spark) {
      if (spark) text += " " + spark;
      if (row.note) text += " " + row.note;
      return {
        text: text,
        attack: !!attack,
        nat: nat == null ? null : nat,
        crit: !!crit,
        label: name,
        formula: formula || "—",
        result: result,
        detail: detail || text,
        spark: spark || ""
      };
    }

    if (kind === "attack" && row.scale === "beam") {
      var beams = cantripTier(charLv);
      var bits = [];
      var anyCrit = false;
      var anyMiss = false;
      var shown = null;
      var b;
      var beamShown = [];
      var beamShots = [];
      var beamHit = 0;
      var ago = 0;
      if (opts.agonizing) {
        ago = Number(opts.chaMod);
        if (!isFinite(ago)) ago = 0;
      }
      for (b = 0; b < beams; b++) {
        var beamPair = d20roll(opts.mode);
        var natb = beamPair.nat;
        var dieb = takeAttackDie();
        var tot = natb + atkBonus + dieb.delta;
        var critb = natb === 20;
        var missb = natb === 1;
        if (critb) anyCrit = true;
        if (missb) anyMiss = true;
        if (shown == null || critb) shown = natb;
        beamShown.push(beamPair.shown);
        var beamDice = parseDice(row.dice || "1d10");
        if (!missb && ago) beamDice.flat = (beamDice.flat || 0) + ago;
        var one = bundle(beamDice, critb && !missb);
        if (!missb && ago) one.text = one.text.replace(/ = (-?\d+)$/, " (Agonizing) = $1");
        var push = (!missb && opts.repelling) ? 10 : 0;
        var face = missb ? " MISS" : ((critb ? " CRIT · on hit " : " on hit ") + one.text + (push ? " · push " + push + " ft" : ""));
        bits.push("beam " + (b + 1) + " " + beamPair.shown + sign(atkBonus) + dieBit(dieb) + " = " + tot + face);
        var beamAmt = missb ? 0 : Math.max(0, one.rolled.total);
        if (!missb) beamHit += beamAmt;
        beamShots.push({ nat: natb, total: tot, amount: beamAmt, dice: missb ? "" : one.text, label: "beam " + (b + 1) + "/" + beams, push: push, dieText: dieb.text, dieDelta: dieb.delta });
      }
      var spark = sparkFor(anyMiss);
      var text = name + gun + " · spell attack " + sign(atkBonus) + " · " + bits.join("; ");
      if (row.note) text += " " + row.note;
      var beamDie = (opts.mode === "adv" || opts.mode === "dis") ? "2d20" : "1d20";
      var packedBeams = pack(text, true, anyCrit ? 20 : shown, anyCrit, beams + "x " + beamDie + sign(atkBonus), (shown || 0) + atkBonus, text, spark);
      packedBeams.multi = beams > 1;
      packedBeams.diceShown = beamShown.join("; ");
      packedBeams.shots = beamShots;
      packedBeams.damageTotal = beamHit;
      packedBeams.damageDetail = beamShots.map(function (shot) { return shot.amount ? shot.dice : ""; }).filter(Boolean).join("; ");
      packedBeams.kind = "attack";
      packedBeams.assign = "beam";
      packedBeams.beamCount = beams;
      return packedBeams;
    }

    if (row.rays && (kind === "attack" || kind === "auto")) {
      var rays = (row.rays || 1) + (row.rayUp ? upSteps * row.rayUp : 0);
      var rayDice = parseDice(row.dice || "");
      if (row.flat) rayDice.flat = (rayDice.flat || 0) + row.flat;
      var rbits = [];
      var rCrit = false;
      var rMiss = false;
      var rNat = null;
      var rSum = 0;
      var dartRows = [];
      var rayShots = [];
      var rayHit = 0;
      var r;
      for (r = 0; r < rays; r++) {
        if (kind === "auto") {
          var auto = bundle(rayDice, false);
          rSum += auto.rolled.total;
          rbits.push("dart " + (r + 1) + " " + auto.text);
          dartRows.push({ n: r + 1, total: auto.rolled.total, text: auto.text });
        } else {
          var rayPair = d20roll(opts.mode);
          var rn = rayPair.nat;
          var dier = takeAttackDie();
          var rtot = rn + atkBonus + dier.delta;
          var rc = rn === 20;
          var rm = rn === 1;
          if (rc) rCrit = true;
          if (rm) rMiss = true;
          if (rNat == null || rc) rNat = rn;
          var rd = bundle(rayDice, rc && !rm);
          var rface = rm ? " MISS" : ((rc ? " CRIT · on hit " : " on hit ") + rd.text);
          rbits.push("ray " + (r + 1) + " " + rayPair.shown + sign(atkBonus) + dieBit(dier) + " = " + rtot + rface);
          var rayAmt = rm ? 0 : rd.rolled.total;
          if (!rm) rayHit += rayAmt;
          rayShots.push({ nat: rn, total: rtot, amount: rayAmt, dice: rm ? "" : rd.text, label: "ray " + (r + 1) + "/" + rays, dieText: dier.text, dieDelta: dier.delta });
        }
      }
      var rspark = sparkFor(rMiss);
      var rtext = name + gun + " · " + (kind === "auto" ? rays + " darts" : "spell attack " + sign(atkBonus)) + " · " + rbits.join("; ");
      var rayDie = (opts.mode === "adv" || opts.mode === "dis") ? "2d20" : "1d20";
      var packedRays = pack(rtext, kind === "attack", kind === "attack" ? (rCrit ? 20 : rNat) : null, rCrit, (kind === "attack" ? rays + "x " + rayDie + sign(atkBonus) : rays + "x " + formulaOf(rayDice, false)), kind === "attack" ? ((rNat || 0) + atkBonus) : rSum, rtext, rspark);
      packedRays.multi = rays > 1 && kind === "attack";
      if (kind === "auto") {
        packedRays.darts = dartRows;
        packedRays.damageTotal = rSum;
        packedRays.damageDetail = dartRows.map(function (d) { return d.text || String(d.total); }).join("; ");
        packedRays.kind = "auto";
      }
      if (kind === "attack") {
        packedRays.shots = rayShots;
        packedRays.damageTotal = rayHit;
        packedRays.damageDetail = rayShots.map(function (shot) { return shot.amount ? shot.dice : ""; }).filter(Boolean).join("; ");
        packedRays.kind = "attack";
        packedRays.assign = "ray";
        packedRays.rayCount = rays;
      }
      return packedRays;
    }

    if (kind === "attack" || kind === "weapon") {
      var bonus = kind === "weapon" ? weaponAtk : atkBonus;
      var pair = d20roll(opts.mode);
      var nat = pair.nat;
      var crit = nat === 20;
      var miss = nat === 1;
      var dieA = takeAttackDie();
      var total = nat + bonus + dieA.delta;
      var face = pair.n2 != null ? pair.shown : String(nat);
      var head = name + gun + " · " + (kind === "weapon" ? "weapon attack " : "spell attack ") + sign(bonus) + ": " + face + sign(bonus) + dieBit(dieA) + " = " + total;
      if (kind === "weapon" && row.save) head += " · " + row.save + " save";
      var shapedDice = row.diceOn === "start" ? { parts: [], flat: 0 } : shaped();
      var hasDamage = (shapedDice.parts && shapedDice.parts.length) || shapedDice.flat || (row.weapon && opts.weaponDamage);
      if (!hasDamage) {
        var plain = miss ? "MISS" : (crit ? "CRIT" : "HIT");
        var effect = "";
        if (!miss && row.noDamage && row.onHit) effect = " · no damage — " + row.onHit;
        else if (!miss && row.diceOn === "start") effect = " · " + (row.startDice || row.dice) + " " + (row.startType || "") + " at the start of each of its turns, not on the hit";
        var bare = head + " · " + plain + effect;
        var barePack = pack(bare, true, nat, crit, (pair.shown.indexOf("/") >= 0 ? "2d20" : "1d20") + sign(bonus), total, pair.shown + sign(bonus) + " = " + total + " · " + plain + effect, sparkFor(miss));
        barePack.diceShown = pair.shown;
        barePack.n1 = pair.n1;
        barePack.n2 = pair.n2;
        barePack.mode = opts.mode || "";
        barePack.damageTotal = 0;
        barePack.damageDetail = "";
        if (!miss && row.diceOn === "start" && row.dice) {
          var startRoll = rollParts(parseDice(row.startDice || row.dice), false);
          barePack.damageTotal = startRoll.total;
          barePack.damageDetail = startRoll.detail + " " + (row.startType || "");
          barePack.startOnTurn = true;
          barePack.applyNow = false;
        }
        barePack.noDamage = !!row.noDamage;
        barePack.condition = miss ? "" : (row.onHit || row.onFail || "");
        barePack.kind = kind;
        barePack.dieMods = dieA.parts;
        if (row.hitSave) barePack.hitSave = row.hitSave;
        if (row.save && !miss) barePack.save = row.save;
        if (row.endSave) barePack.endSave = row.endSave;
        return barePack;
      }
      var spellRoll = rollParts(shapedDice, crit && !miss);
      var gross = spellRoll.total;
      var dmgTotal = miss && row.missHalf ? Math.floor(gross / 2) : (miss ? 0 : gross);
      var dmgBits = spellRoll.detail + typeBit(row);
      if (miss && row.missHalf) dmgBits += " (half on miss)";
      if (!miss && row.weapon && opts.weaponDamage && !row.replacesWeapon) {
        var wp = weaponParts(opts.weaponDamage);
        if (wp) {
          var wr = rollParts(wp, crit && !miss);
          dmgBits += " + weapon " + wr.detail;
          dmgTotal += wr.total;
        }
      }
      var dmgText = (miss && row.missHalf) ? ("MISS · half " + dmgBits + " = " + dmgTotal) : (miss ? "MISS" : ((crit ? "CRIT · on hit " : "on hit ") + dmgBits + " = " + dmgTotal));
      var text = head + " · " + dmgText;
      var spark = sparkFor(miss);
      var packed = pack(text, true, nat, crit, (pair.shown.indexOf("/") >= 0 ? "2d20" : "1d20") + sign(bonus), total, pair.shown + sign(bonus) + " = " + total + " · " + dmgText, spark);
      packed.diceShown = pair.shown;
      packed.n1 = pair.n1;
      packed.n2 = pair.n2;
      packed.mode = opts.mode || "";
      packed.damageTotal = dmgTotal;
      packed.gross = gross;
      packed.missHalf = !!row.missHalf;
      packed.alreadyHalf = !!(miss && row.missHalf);
      packed.damageDetail = dmgTotal ? (dmgBits + " = " + dmgTotal) : "";
      packed.kind = kind;
      packed.dieMods = dieA.parts;
      if (row.save) packed.save = row.save;
      if (row.onFail) packed.condition = miss ? "" : row.onFail;
      if (row.hitSave) packed.hitSave = row.hitSave;
      if (row.half) packed.half = true;
      if (row.push) packed.push = row.push;
      if (row.banishAt) packed.banishAt = row.banishAt;
      if (row.endSave) packed.endSave = row.endSave;
      if (row.splash) packed.splash = row.splash;
      if (row.delayed) {
        var Rdelay = root.SSDNSSpellRiders;
        packed.delayed = Rdelay && Rdelay.delayedRoll ? Rdelay.delayedRoll(row, slot, crit && !miss) : { formula: row.delayed, total: 0 };
        if (miss) packed.delayed = null;
      }
      if (row.diceOn === "start") {
        packed.startDice = row.startDice || row.dice;
        packed.text += " · " + packed.startDice + " " + (row.startType || "") + " at the start of each of its turns";
        packed.detail = packed.text;
      }
      return packed;
    }

    if (kind === "save") {
      var saveRoll = bundle(shaped(), false);
      var half = row.half ? " (half on a successful save)" : "";
      if (row.onSave === "none") half = " (none on a successful save)";
      if (row.damageAuto) half = " (automatic; " + (row.save || "CON") + " save only to drop)";
      var laterNote = "";
      if (row.castDamage === false) laterNote = " · failed save: " + (row.onFail || "a condition") + " only; " + ((row.later && row.later.dice) || row.dice || "") + " on a failed end-of-turn save";
      var dcText = "DC " + (opts.dc != null && opts.dc !== "" ? opts.dc : "?") + " " + (row.save || "save") + " save";
      var stext = name + gun + " · " + dcText + " · " + (row.castDamage === false ? "no damage now" : saveRoll.text) + half + laterNote;
      var savePack = pack(stext, false, null, false, saveRoll.rolled.formula, row.castDamage === false ? 0 : saveRoll.rolled.total, dcText + " · " + saveRoll.text + half + laterNote, "");
      savePack.damageTotal = row.castDamage === false ? saveRoll.rolled.total : saveRoll.rolled.total;
      savePack.damageDetail = saveRoll.text;
      savePack.kind = "save";
      savePack.half = !!row.half && !row.damageAuto && row.onSave !== "none";
      savePack.save = row.save || "";
      if (row.onSave) savePack.onSave = row.onSave;
      if (row.zeroHp) savePack.zeroHp = row.zeroHp;
      savePack.autoDamage = !!row.damageAuto;
      savePack.applyNow = row.applyNow !== false && row.castDamage !== false;
      savePack.condition = row.onFail || "";
      if (row.targetUp) {
        var Rt = root.SSDNSSpellRiders;
        savePack.targets = Rt && Rt.chainTargets ? Rt.chainTargets(slot) : (4 + Math.max(0, slot - (row.level || 6)));
        savePack.text += " · " + savePack.targets + " targets";
        savePack.detail = savePack.text;
      }
      if (row.later) savePack.later = row.later;
      if (row.tickEnd) savePack.tickEnd = row.tickEnd;
      return savePack;
    }

    if (kind === "heal") {
      var heal = bundle(shaped(), false);
      var htext = name + gun + " · heals " + heal.text;
      var healPack = pack(htext, false, null, false, heal.rolled.formula, heal.rolled.total, htext, "");
      healPack.damageTotal = heal.rolled.total;
      healPack.damageDetail = heal.text;
      healPack.kind = "heal";
      healPack.heal = true;
      return healPack;
    }

    if (kind === "auto") {
      var autoRoll = bundle(shaped(), false);
      var atext = name + gun + " · " + autoRoll.text;
      if (row.tickEnd) atext += " · end of turn " + (row.tickEnd.save || "DEX") + " or " + row.tickEnd.dice + " " + (row.tickEnd.type || "");
      if (row.budget) atext += " · budget " + row.budget;
      if (row.applyNow === false) atext += " · not dealt on cast";
      var autoPack = pack(atext, false, null, false, autoRoll.rolled.formula, autoRoll.rolled.total, atext, "");
      autoPack.damageTotal = autoRoll.rolled.total;
      autoPack.damageDetail = autoRoll.text;
      autoPack.kind = "auto";
      autoPack.applyNow = row.applyNow !== false;
      autoPack.budget = row.budget || 0;
      if (row.half) autoPack.half = true;
      if (row.save) autoPack.save = row.save;
      if (row.tickEnd) autoPack.tickEnd = row.tickEnd;
      return autoPack;
    }

    if (kind === "rider") {
      var rider = name + gun + " · " + (row.dice || "extra dice") + typeBit(row) + " on a later hit";
      if (row.chip) rider += " · chip " + row.chip;
      if (row.dur) rider += " · " + row.dur;
      if (row.conc === false) rider += " · not concentration";
      var riderPack = pack(rider, false, null, false, row.dice || "—", 0, rider, "");
      riderPack.kind = "rider";
      riderPack.damageTotal = 0;
      riderPack.trigger = row.trigger || "";
      riderPack.chip = row.chip || "";
      return riderPack;
    }

    var none = name + gun + " · no attack roll and no damage dice";
    var nonePack = pack(none, false, null, false, "—", 0, none, "");
    nonePack.kind = kind || "none";
    nonePack.damageTotal = 0;
    return nonePack;
  }

  function needsType(name) {
    var row = lookup(name);
    return !!(row && /you chose|you choose/i.test(row.type || ""));
  }
  function pickType(name) {
    return new Promise(function (resolve) {
      var types = ["acid", "cold", "fire", "lightning", "poison", "thunder"];
      var dlg = document.createElement("dialog");
      dlg.className = "dlg";
      dlg.innerHTML = "<form method='dialog'><h2></h2><p class='fine'>Choose a damage type.</p><div class='type-picks'></div><div class='dlg-foot'><button class='btn' value=''>Cancel</button></div></form>";
      dlg.querySelector("h2").textContent = name || "Spell";
      var box = dlg.querySelector(".type-picks");
      types.forEach(function (t) {
        var b = document.createElement("button");
        b.type = "submit";
        b.className = "btn sm";
        b.value = t;
        b.textContent = t;
        b.style.margin = "0 6px 6px 0";
        box.appendChild(b);
      });
      var done = false;
      dlg.addEventListener("close", function () {
        if (done) return;
        done = true;
        var value = dlg.returnValue || "";
        if (dlg.parentNode) dlg.parentNode.removeChild(dlg);
        resolve(value);
      });
      document.body.appendChild(dlg);
      if (dlg.showModal) dlg.showModal();
      else dlg.setAttribute("open", "");
    });
  }
  var SPELL_META = {
    "acid splash": { range: "60 ft" },
    "chill touch": { range: "120 ft" },
    "eldritch blast": { range: "120 ft" },
    "fire bolt": { range: "120 ft" },
    "poison spray": { range: "10 ft" },
    "produce flame": { range: "30 ft" },
    "ray of frost": { range: "60 ft" },
    "sacred flame": { range: "60 ft" },
    "shocking grasp": { range: "touch" },
    "thorn whip": { range: "30 ft" },
    "vicious mockery": { range: "60 ft" },
    "arms of hadar": { range: "self 10 ft" },
    "burning hands": { range: "self 15 ft" },
    "chromatic orb": { range: "90 ft" },
    "cure wounds": { range: "touch" },
    "dissonant whispers": { range: "60 ft" },
    "ensnaring strike": { range: "self", conc: true },
    "guiding bolt": { range: "120 ft" },
    "hail of thorns": { range: "self", conc: true },
    "healing word": { range: "60 ft" },
    "hellish rebuke": { range: "60 ft" },
    "hex": { range: "90 ft", conc: true },
    "hunter's mark": { range: "90 ft", conc: true },
    "inflict wounds": { range: "touch" },
    "magic missile": { range: "120 ft" },
    "ray of sickness": { range: "60 ft" },
    "searing smite": { range: "self", conc: true },
    "thunderous smite": { range: "self", conc: true },
    "thunderwave": { range: "self 15 ft" },
    "witch bolt": { range: "30 ft", conc: true },
    "wrathful smite": { range: "self", conc: true },
    "acid arrow": { range: "90 ft" },
    "branding smite": { range: "self", conc: true },
    "cloud of daggers": { range: "60 ft", conc: true },
    "flame blade": { range: "self", conc: true },
    "flaming sphere": { range: "60 ft", conc: true },
    "heat metal": { range: "60 ft", conc: true },
    "moonbeam": { range: "120 ft", conc: true },
    "ray of enfeeblement": { range: "60 ft", conc: true },
    "scorching ray": { range: "120 ft" },
    "shatter": { range: "60 ft" },
    "spiritual weapon": { range: "60 ft" },
    "blinding smite": { range: "self", conc: true },
    "call lightning": { range: "120 ft", conc: true },
    "conjure barrage": { range: "self 60 ft" },
    "fireball": { range: "150 ft" },
    "hunger of hadar": { range: "150 ft", conc: true },
    "lightning arrow": { range: "self", conc: true },
    "lightning bolt": { range: "self 100 ft" },
    "mass healing word": { range: "60 ft" },
    "spirit guardians": { range: "self 15 ft", conc: true },
    "vampiric touch": { range: "self", conc: true },
    "blight": { range: "30 ft" },
    "fire shield": { range: "self" },
    "guardian of faith": { range: "30 ft" },
    "ice storm": { range: "300 ft" },
    "phantasmal killer": { range: "120 ft", conc: true },
    "staggering smite": { range: "self", conc: true },
    "wall of fire": { range: "120 ft", conc: true },
    "banishing smite": { range: "self" },
    "cloudkill": { range: "120 ft", conc: true },
    "cone of cold": { range: "self 60 ft" },
    "contagion": { range: "touch" },
    "conjure volley": { range: "150 ft" },
    "destructive wave": { range: "self 30 ft" },
    "flame strike": { range: "60 ft" },
    "insect plague": { range: "300 ft", conc: true },
    "mass cure wounds": { range: "60 ft" },
    "blade barrier": { range: "90 ft", conc: true },
    "chain lightning": { range: "150 ft" },
    "circle of death": { range: "150 ft" },
    "disintegrate": { range: "60 ft" },
    "freezing sphere": { range: "300 ft" },
    "harm": { range: "60 ft" },
    "heal": { range: "60 ft" },
    "sunbeam": { range: "self 60 ft", conc: true },
    "wall of ice": { range: "120 ft", conc: true },
    "wall of thorns": { range: "120 ft", conc: true },
    "delayed blast fireball": { range: "150 ft", conc: true },
    "finger of death": { range: "60 ft" },
    "fire storm": { range: "150 ft" },
    "prismatic spray": { range: "self 60 ft" },
    "incendiary cloud": { range: "150 ft", conc: true },
    "sunburst": { range: "150 ft" },
    "meteor swarm": { range: "1 mile" }
  };
  function blurb(name) {
    var row = lookup(name);
    if (!row || !row.kind || row.kind === "none") return "";
    var type = row.type || "";
    if (/you chose|you choose/i.test(type)) type = "(type you choose)";
    var dice = row.dice || "";
    var bits = [];
    var meta = SPELL_META[norm(row.name)] || SPELL_META[norm(name)] || {};
    if (meta.range) bits.push(meta.range);
    if (row.kind === "save") {
      if (dice || type) bits.push((dice + " " + type).trim());
      if (row.save) bits.push(row.save + " save");
    } else if (row.kind === "heal") {
      if (row.healMod && dice) bits.push(dice + " + mod");
      else if (dice) bits.push("heals " + dice);
      else bits.push("heal");
    } else if (dice) bits.push((dice + " " + type).trim());
    else if (row.save) bits.push(row.save + " save");
    if (meta.conc) bits.push("concentration");
    return bits.filter(Boolean).join(" · ");
  }
  var SAVE_NAME = { STR: "Strength", DEX: "Dexterity", CON: "Constitution", INT: "Intelligence", WIS: "Wisdom", CHA: "Charisma" };
  function fxFor(name) {
    var map = root.SSDNS_SPELL_FX || {};
    var key = norm(name);
    return map[key] || map[key.replace(/\s+shell$/, "")] || null;
  }
  function frontierFace(row) {
    var aliases = rules().spellAliases || [];
    var key = norm(row && row.name);
    if (key === "pact shot") key = "eldritch blast";
    var hit = null;
    aliases.forEach(function (a) { if (!hit && a && norm(a.phb) === key) hit = a; });
    var alias = hit && hit.alias && hit.alias !== "—" && !/prints as 5e/i.test(hit.alias) ? hit.alias : "";
    var title = row.name || "Spell";
    if (norm(title) === "pact shot") title = "Pact Shot";
    else if (alias) title = alias + " (" + (row.name || "") + ")";
    return { title: title, sketch: (hit && hit.sketch) || "" };
  }
  function typeWord(row) {
    var t = row && row.type ? String(row.type) : "";
    if (/you chose|you choose/i.test(t)) return "the type you choose";
    return t;
  }
  function damageSentence(row) {
    if (!row) return "";
    var dice = row.dice ? String(row.dice) : "";
    var type = typeWord(row);
    if (row.kind === "heal") {
      if (!dice) return "Effect: it restores hit points.";
      var heal = /^\d+$/.test(dice) ? ("It restores " + dice + " hit points.") : ("It restores " + dice + (row.healMod ? " plus your spellcasting ability modifier" : "") + " hit points.");
      if (row.up) heal += " A slot above " + (row.level || 1) + "th level adds " + row.up + ".";
      return heal;
    }
    if (!dice) return "";
    var line;
    if (row.scale === "beam") line = "Each beam deals " + dice + (type ? " " + type : "") + ". You create one beam, then two at 5th level, three at 11th, and four at 17th.";
    else if (row.scale === "cantrip") line = "Damage is " + dice + (type ? " " + type : "") + ". Cantrip scaling raises that to two dice at 5th level, three at 11th, and four at 17th.";
    else line = "Damage is " + dice + (type ? " " + type : "") + ".";
    if (row.up && row.scale !== "beam") line += " A slot above " + (row.level || 1) + "th level adds " + row.up + (row.upEvery ? " for every " + row.upEvery + " levels above that" : "") + ".";
    if (row.note) line += " " + String(row.note).replace(/\.$/, "") + ".";
    return line;
  }
  function rollSentence(row, ctx) {
    ctx = ctx || {};
    var dcBit = ctx.spellDC != null && ctx.spellDC !== "" ? (" Your spell save DC is " + ctx.spellDC + ".") : " It uses your spell save DC.";
    var atkBit = ctx.spellAtk != null && ctx.spellAtk !== "" ? (" Your spell attack bonus is " + sign(ctx.spellAtk) + ".") : " It uses your spell attack bonus.";
    if (row.kind === "save") return "The target makes a " + (SAVE_NAME[row.save] || row.save || "saving") + " saving throw." + dcBit;
    if (row.kind === "attack") return "You make a spell attack." + atkBit;
    if (row.kind === "weapon") return "This extra damage rides on a weapon hit. It does not make its own attack roll.";
    if (row.kind === "auto") return "No attack roll is required.";
    if (row.kind === "rider") return "There is no attack roll. The extra damage applies when you hit.";
    if (row.kind === "heal") return "There is no attack roll and no saving throw to resist the healing.";
    return "";
  }
  function fieldSentence(row, fx) {
    var meta = SPELL_META[norm(row.name)] || {};
    var range = (fx && fx.range) || meta.range || "";
    var area = (fx && fx.area) || "";
    var dur = (fx && fx.dur) || "";
    var conc = (fx && fx.conc) || meta.conc;
    var bits = [];
    if (range) bits.push("Range " + range);
    if (area) bits.push(area);
    if (dur) bits.push("duration " + dur);
    else if (row.dice) bits.push("duration instantaneous");
    if (conc) bits.push("concentration");
    if (!bits.length) return "";
    return bits.join(", ") + ".";
  }
  function describe(name, ctx) {
    ctx = ctx || {};
    var row = lookup(name) || { name: stripAlias(name) || "Spell", level: 0, kind: "none" };
    var fx = fxFor(row.name) || fxFor(name) || {};
    if (norm(row.name) === "pact shot") fx = fxFor("eldritch blast") || fx;
    var face = frontierFace(row);
    var sentences = [];
    var open = face.title + ".";
    if (face.sketch) open += " " + String(face.sketch).replace(/\.$/, "") + ".";
    var does = fx.does || "";
    if (!does) {
      does = row.dice
        ? "You cast it at a target in range."
        : "Effect: you cast " + (row.name || name) + " using its ordinary rules.";
    }
    if (!/[.!?]$/.test(does)) does += ".";
    sentences.push(open + " " + does);
    var dmg = damageSentence(row);
    if (dmg) sentences.push(dmg);
    else if (!fx.does) sentences.push("Effect: it changes the scene as that spell always has, with no damage dice on the sheet.");
    var roll = rollSentence(row, ctx);
    if (roll) sentences.push(roll);
    var field = fieldSentence(row, fx);
    if (field) sentences.push(field);
    return sentences.join(" ");
  }
  function rangeOf(name) {
    if (root.SSDNSPactShot && root.SSDNSPactShot.isPactShot && root.SSDNSPactShot.isPactShot(name) && root.SSDNSPactShot.variant) {
      var shotRange = root.SSDNSPactShot.variant();
      if (shotRange && shotRange.range) return shotRange.range;
    }
    var row = lookup(name);
    var key = norm((row && row.name) || name);
    if (key === "pact shot" || (root.SSDNSPactShot && root.SSDNSPactShot.isPactShot && root.SSDNSPactShot.isPactShot(key))) key = "eldritch blast";
    var meta = SPELL_META[key] || SPELL_META[norm(name)] || {};
    return meta.range || "";
  }
  root.SSDNSSpellCast = { lookup: lookup, rollCast: rollCast, cantripTier: cantripTier, needsType: needsType, pickType: pickType, blurb: blurb, describe: describe, rangeOf: rangeOf };
})(typeof window !== "undefined" ? window : globalThis);

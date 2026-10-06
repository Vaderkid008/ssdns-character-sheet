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
  function lookup(name) {
    var map = build();
    var raw = stripAlias(name);
    if (norm(raw) === "pact shot") {
      var pact = map["eldritch blast"];
      if (pact) return Object.assign({}, pact, { name: "Pact Shot" });
    }
    var exact = map[norm(raw)] || null;
    var bareKey = norm(raw.replace(/\s+shell$/i, ""));
    var bare = bareKey && bareKey !== norm(raw) ? (map[bareKey] || null) : null;
    if (bare && (!exact || exact.kind === "none" || /\s+shell$/i.test(exact.name || ""))) {
      if (!exact || exact.kind === "none" || (bare.kind && bare.kind !== "none") || !/\s+shell$/i.test(bare.name || "")) return bare;
    }
    return exact || bare;
  }
  function die(sides) { return 1 + Math.floor(Math.random() * sides); }
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
    var bits = (parsed.parts || []).map(function (p) {
      var n = Math.abs(p.n) * (crit ? 2 : 1);
      return n + "d" + p.sides;
    });
    if (parsed.flat) bits.push((parsed.flat > 0 ? "+" : "") + parsed.flat);
    return bits.join("+") || "0";
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
  function typeBit(row) { return row && row.type ? " " + row.type : ""; }

  function rollCast(opts) {
    opts = opts || {};
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
      if (row.up && upSteps > 0 && row.scale !== "beam" && !row.rays) parsed = addDice(parsed, row.up, upSteps);
      if (row.healMod && spellMod) parsed.flat = (parsed.flat || 0) + spellMod;
      return parsed;
    }
    function sparkFor(nat1) {
      if (opts.wildSpark && slot > 0 && nat1) return wildSparkLine();
      return "";
    }
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
      for (b = 0; b < beams; b++) {
        var natb = die(20);
        var tot = natb + atkBonus;
        var critb = natb === 20;
        var missb = natb === 1;
        if (critb) anyCrit = true;
        if (missb) anyMiss = true;
        if (shown == null || critb) shown = natb;
        var one = bundle(parseDice(row.dice || "1d10"), critb && !missb);
        bits.push("beam " + (b + 1) + " " + natb + sign(atkBonus) + " = " + tot + (missb ? " miss" : (critb ? " critical" : "")) + ", " + one.text + (missb ? " (not dealt)" : ""));
      }
      var spark = sparkFor(anyMiss);
      var text = name + gun + " · spell attack " + sign(atkBonus) + " · " + bits.join("; ");
      return pack(text, true, anyCrit ? 20 : shown, anyCrit, beams + "x 1d20" + sign(atkBonus), (shown || 0) + atkBonus, text, spark);
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
      var r;
      for (r = 0; r < rays; r++) {
        if (kind === "auto") {
          var auto = bundle(rayDice, false);
          rSum += auto.rolled.total;
          rbits.push("dart " + (r + 1) + " " + auto.text);
        } else {
          var rn = die(20);
          var rtot = rn + atkBonus;
          var rc = rn === 20;
          var rm = rn === 1;
          if (rc) rCrit = true;
          if (rm) rMiss = true;
          if (rNat == null || rc) rNat = rn;
          var rd = bundle(rayDice, rc && !rm);
          rbits.push("ray " + (r + 1) + " " + rn + sign(atkBonus) + " = " + rtot + (rm ? " miss" : (rc ? " critical" : "")) + ", " + rd.text + (rm ? " (not dealt)" : ""));
        }
      }
      var rspark = sparkFor(rMiss);
      var rtext = name + gun + " · " + (kind === "auto" ? rays + " darts" : "spell attack " + sign(atkBonus)) + " · " + rbits.join("; ");
      return pack(rtext, kind === "attack", kind === "attack" ? (rCrit ? 20 : rNat) : null, rCrit, (kind === "attack" ? rays + "x 1d20" + sign(atkBonus) : rays + "x " + formulaOf(rayDice, false)), kind === "attack" ? ((rNat || 0) + atkBonus) : rSum, rtext, rspark);
    }

    if (kind === "attack" || kind === "weapon") {
      var bonus = kind === "weapon" ? weaponAtk : atkBonus;
      var nat = die(20);
      var crit = nat === 20;
      var miss = nat === 1;
      var total = nat + bonus;
      var spellRoll = rollParts(shaped(), crit && !miss);
      var dmgTotal = spellRoll.total;
      var dmgBits = spellRoll.detail + typeBit(row);
      if (row.weapon && opts.weaponDamage) {
        var wp = weaponParts(opts.weaponDamage);
        if (wp) {
          var wr = rollParts(wp, crit && !miss);
          dmgBits += " + weapon " + wr.detail;
          dmgTotal += wr.total;
        }
      }
      var dealt = miss ? " (not dealt)" : (crit ? " critical" : "");
      var head = name + gun + " · " + (kind === "weapon" ? "weapon attack " : "spell attack ") + sign(bonus) + ": " + nat + sign(bonus) + " = " + total;
      if (kind === "weapon" && row.save) head += " · " + row.save + " save";
      var dmgText = dmgBits + " = " + dmgTotal + dealt;
      var text = head + " · " + dmgText + (miss ? ". Miss." : "");
      var spark = sparkFor(miss);
      return pack(text, true, nat, crit, "1d20" + sign(bonus), total, nat + sign(bonus) + " = " + total + " · " + dmgText, spark);
    }

    if (kind === "save") {
      var saveRoll = bundle(shaped(), false);
      var half = row.half ? " (half on a successful save)" : "";
      var dcText = "DC " + (opts.dc != null && opts.dc !== "" ? opts.dc : "?") + " " + (row.save || "save") + " save";
      var stext = name + gun + " · " + dcText + " · " + saveRoll.text + half;
      return pack(stext, false, null, false, saveRoll.rolled.formula, saveRoll.rolled.total, dcText + " · " + saveRoll.text + half, "");
    }

    if (kind === "heal") {
      var heal = bundle(shaped(), false);
      var htext = name + gun + " · heals " + heal.text;
      return pack(htext, false, null, false, heal.rolled.formula, heal.rolled.total, htext, "");
    }

    if (kind === "auto") {
      var autoRoll = bundle(shaped(), false);
      var atext = name + gun + " · " + autoRoll.text;
      return pack(atext, false, null, false, autoRoll.rolled.formula, autoRoll.rolled.total, atext, "");
    }

    if (kind === "rider") {
      var rider = name + gun + " · " + (row.dice || "extra dice") + typeBit(row) + " on a later hit";
      return pack(rider, false, null, false, row.dice || "—", 0, rider, "");
    }

    var none = name + gun + " · no attack roll and no damage dice";
    return pack(none, false, null, false, "—", 0, none, "");
  }

  root.SSDNSSpellCast = { lookup: lookup, rollCast: rollCast, cantripTier: cantripTier };
})(typeof window !== "undefined" ? window : globalThis);

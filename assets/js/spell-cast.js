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
    return { nat: nat, shown: n2 == null ? String(n1) : (n1 + "/" + n2 + " → " + nat) };
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
      var beamShown = [];
      var beamShots = [];
      var beamHit = 0;
      for (b = 0; b < beams; b++) {
        var beamPair = d20roll(opts.mode);
        var natb = beamPair.nat;
        var tot = natb + atkBonus;
        var critb = natb === 20;
        var missb = natb === 1;
        if (critb) anyCrit = true;
        if (missb) anyMiss = true;
        if (shown == null || critb) shown = natb;
        beamShown.push(beamPair.shown);
        var one = bundle(parseDice(row.dice || "1d10"), critb && !missb);
        var face = missb ? " MISS" : ((critb ? " CRIT · on hit " : " on hit ") + one.text);
        bits.push("beam " + (b + 1) + " " + beamPair.shown + sign(atkBonus) + " = " + tot + face);
        var beamAmt = missb ? 0 : one.rolled.total;
        if (!missb) beamHit += beamAmt;
        beamShots.push({ nat: natb, total: tot, amount: beamAmt, dice: missb ? "" : one.text, label: "beam " + (b + 1) });
      }
      var spark = sparkFor(anyMiss);
      var text = name + gun + " · spell attack " + sign(atkBonus) + " · " + bits.join("; ");
      var beamDie = (opts.mode === "adv" || opts.mode === "dis") ? "2d20" : "1d20";
      var packedBeams = pack(text, true, anyCrit ? 20 : shown, anyCrit, beams + "x " + beamDie + sign(atkBonus), (shown || 0) + atkBonus, text, spark);
      packedBeams.multi = beams > 1;
      packedBeams.diceShown = beamShown.join("; ");
      packedBeams.shots = beamShots;
      packedBeams.damageTotal = beamHit;
      packedBeams.damageDetail = beamShots.map(function (shot) { return shot.amount ? shot.dice : ""; }).filter(Boolean).join("; ");
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
          var rtot = rn + atkBonus;
          var rc = rn === 20;
          var rm = rn === 1;
          if (rc) rCrit = true;
          if (rm) rMiss = true;
          if (rNat == null || rc) rNat = rn;
          var rd = bundle(rayDice, rc && !rm);
          var rface = rm ? " MISS" : ((rc ? " CRIT · on hit " : " on hit ") + rd.text);
          rbits.push("ray " + (r + 1) + " " + rayPair.shown + sign(atkBonus) + " = " + rtot + rface);
          var rayAmt = rm ? 0 : rd.rolled.total;
          if (!rm) rayHit += rayAmt;
          rayShots.push({ nat: rn, total: rtot, amount: rayAmt, dice: rm ? "" : rd.text, label: "ray " + (r + 1) });
        }
      }
      var rspark = sparkFor(rMiss);
      var rtext = name + gun + " · " + (kind === "auto" ? rays + " darts" : "spell attack " + sign(atkBonus)) + " · " + rbits.join("; ");
      var rayDie = (opts.mode === "adv" || opts.mode === "dis") ? "2d20" : "1d20";
      var packedRays = pack(rtext, kind === "attack", kind === "attack" ? (rCrit ? 20 : rNat) : null, rCrit, (kind === "attack" ? rays + "x " + rayDie + sign(atkBonus) : rays + "x " + formulaOf(rayDice, false)), kind === "attack" ? ((rNat || 0) + atkBonus) : rSum, rtext, rspark);
      packedRays.multi = rays > 1 && kind === "attack";
      if (kind === "auto") packedRays.darts = dartRows;
      if (kind === "attack") {
        packedRays.shots = rayShots;
        packedRays.damageTotal = rayHit;
        packedRays.damageDetail = rayShots.map(function (shot) { return shot.amount ? shot.dice : ""; }).filter(Boolean).join("; ");
      }
      return packedRays;
    }

    if (kind === "attack" || kind === "weapon") {
      var bonus = kind === "weapon" ? weaponAtk : atkBonus;
      var pair = d20roll(opts.mode);
      var nat = pair.nat;
      var crit = nat === 20;
      var miss = nat === 1;
      var total = nat + bonus;
      var head = name + gun + " · " + (kind === "weapon" ? "weapon attack " : "spell attack ") + sign(bonus) + ": " + nat + sign(bonus) + " = " + total;
      if (kind === "weapon" && row.save) head += " · " + row.save + " save";
      var shapedDice = shaped();
      var hasDamage = (shapedDice.parts && shapedDice.parts.length) || shapedDice.flat;
      if (!hasDamage) {
        var plain = miss ? "MISS" : (crit ? "CRIT" : "HIT");
        var bare = head + " · " + plain;
        var barePack = pack(bare, true, nat, crit, (pair.shown.indexOf("/") >= 0 ? "2d20" : "1d20") + sign(bonus), total, pair.shown + sign(bonus) + " = " + total + " · " + plain, sparkFor(miss));
        barePack.diceShown = pair.shown;
        barePack.damageTotal = 0;
        barePack.damageDetail = "";
        return barePack;
      }
      var spellRoll = rollParts(shapedDice, crit && !miss);
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
      var dmgText = miss ? "MISS" : ((crit ? "CRIT · on hit " : "on hit ") + dmgBits + " = " + dmgTotal);
      var text = head + " · " + dmgText;
      var spark = sparkFor(miss);
      var packed = pack(text, true, nat, crit, (pair.shown.indexOf("/") >= 0 ? "2d20" : "1d20") + sign(bonus), total, pair.shown + sign(bonus) + " = " + total + " · " + dmgText, spark);
      packed.diceShown = pair.shown;
      packed.damageTotal = miss ? 0 : dmgTotal;
      packed.damageDetail = miss ? "" : (dmgBits + " = " + dmgTotal);
      return packed;
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
  root.SSDNSSpellCast = { lookup: lookup, rollCast: rollCast, cantripTier: cantripTier, needsType: needsType, pickType: pickType, blurb: blurb };
})(typeof window !== "undefined" ? window : globalThis);

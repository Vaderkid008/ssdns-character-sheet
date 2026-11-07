/* Creature Shove. Replaces one attack of the Attack action, the way a held
   Rob/Disarm does. Contested Strength (Athletics) against the target's
   choice of Athletics or Acrobatics. A win slides the target 5 feet.
   No book text lives here. rules.js is not edited. */
(function (root) {
  "use strict";

  var ORDER = ["tiny", "small", "medium", "large", "huge", "gargantuan"];
  var SLIDE = 5;

  function word(label) {
    return String(label || "").trim().toLowerCase().split(/[\s.,(/]/)[0];
  }
  function sizeRank(label) {
    var i = ORDER.indexOf(word(label));
    return i < 0 ? 2 : i;
  }
  function sizeName(label) {
    var i = sizeRank(label);
    var name = ORDER[i] || "medium";
    return name.charAt(0).toUpperCase() + name.slice(1);
  }
  /* Target may be at most one size larger than the shover. */
  function sizeOk(actorSize, targetSize) {
    return sizeRank(targetSize) <= sizeRank(actorSize) + 1;
  }
  function lineageSize(character) {
    character = character || {};
    if (character.size) return sizeName(character.size);
    var R = root.SSDNS_RULES;
    var id = character.lineage || character.race || "";
    var list = (R && R.lineages) || [];
    var i;
    for (i = 0; i < list.length; i++) {
      if (list[i] && list[i].id === id && list[i].size) return sizeName(list[i].size);
    }
    return "Medium";
  }
  function weaponProps(weapon, book) {
    weapon = weapon || {};
    var props = Array.isArray(weapon.properties) ? weapon.properties.join(" ") : String(weapon.properties || "");
    if (props) return props;
    var id = weapon.weapon || weapon.weaponId || weapon.id || "";
    var list = book || ((root.SSDNS_RULES && root.SSDNS_RULES.melee) || []);
    var i;
    for (i = 0; i < list.length; i++) {
      if (list[i] && (list[i].id === id || list[i].name === weapon.name)) return String(list[i].properties || "");
    }
    return "";
  }
  /* 10 feet with a reach weapon in hand. Otherwise 5. */
  function reachFeet(creature) {
    creature = creature || {};
    if (Number(creature.reachFeet) >= 10) return 10;
    var lists = [creature.weapons, creature.melee, creature.attacks];
    var a, i, w;
    for (a = 0; a < lists.length; a++) {
      var list = lists[a] || [];
      for (i = 0; i < list.length; i++) {
        w = list[i] || {};
        if (w.equipped === false) continue;
        if (/\breach\b/i.test(weaponProps(w))) return 10;
      }
    }
    return 5;
  }
  function inReach(feet, reach) {
    var limit = Number(reach);
    if (!isFinite(limit) || limit <= 0) limit = 5;
    if (feet == null || feet === "" || !isFinite(Number(feet))) return { ok: true, unknown: true, reach: limit };
    var n = Number(feet);
    return { ok: n <= limit, unknown: false, feet: n, reach: limit };
  }
  function skillBonus(creature, name) {
    var Grab = root.SSDNSGrab;
    if (Grab && Grab.skillBonus) return Grab.skillBonus(creature, name);
    return 0;
  }
  function rollD20(rng) {
    var roll = rng || Math.random;
    var n = 1 + Math.floor(roll() * 20);
    if (n < 1) n = 1;
    if (n > 20) n = 20;
    return n;
  }
  function signed(n) {
    var v = Number(n) || 0;
    return (v >= 0 ? "+" : "") + v;
  }
  function gate(opts) {
    opts = opts || {};
    var actorSize = sizeName(opts.actorSize);
    var targetSize = sizeName(opts.targetSize);
    var reach = opts.reach != null ? Number(opts.reach) : reachFeet(opts.actor);
    var dist = inReach(opts.feet, reach);
    if (!sizeOk(actorSize, targetSize)) {
      return { ok: false, tooBig: true, reason: targetSize + " is too big to shove (" + actorSize + " can shove up to one size larger)." };
    }
    if (!dist.ok) {
      return { ok: false, outOfRange: true, feet: dist.feet, reach: dist.reach, reason: "Out of reach (" + dist.feet + " ft). Shove needs " + dist.reach + " ft." };
    }
    return { ok: true, reach: dist.reach, unknown: !!dist.unknown, reason: "Replaces one attack. Strength (Athletics) vs Athletics or Acrobatics. A win pushes them 5 feet." };
  }
  function contest(opts) {
    opts = opts || {};
    var actor = opts.actor || {};
    var target = opts.target || {};
    var actorSize = opts.actorSize || actor.size || "Medium";
    var targetSize = opts.targetSize || target.size || "Medium";
    var reach = opts.reach != null ? opts.reach : reachFeet(actor);
    var check = gate({ actorSize: actorSize, targetSize: targetSize, feet: opts.feet, reach: reach });
    if (opts.override) {
      return { ok: true, override: true, slide: SLIDE, line: "DM override · push 5 ft", cost: "replaces one attack" };
    }
    if (!check.ok) return { ok: false, tooBig: !!check.tooBig, outOfRange: !!check.outOfRange, feet: check.feet, line: check.reason, slide: 0 };
    var skill = opts.defenseSkill === "Acrobatics" ? "Acrobatics" : (opts.defenseSkill === "Athletics" ? "Athletics" : "");
    if (!skill) return { ok: false, needChoice: true, line: "The target chooses Athletics or Acrobatics", slide: 0 };
    var ath = skillBonus(actor, "Athletics");
    var athMod = ath == null ? 0 : ath;
    var defRaw = skillBonus(target, skill);
    var defMod = defRaw == null ? 0 : defRaw;
    var atk = rollD20(opts.rng);
    var def = rollD20(opts.rng);
    var atkTotal = atk + athMod;
    var defTotal = def + defMod;
    var success = atkTotal > defTotal;
    var line = "Athletics " + atk + signed(athMod) + " = " + atkTotal + " vs " + skill + " " + def + signed(defMod) + " = " + defTotal + (success ? " — shove" : " — fail");
    return {
      ok: success,
      tie: atkTotal === defTotal,
      slide: success ? SLIDE : 0,
      cost: "replaces one attack",
      attack: { nat: atk, mod: athMod, total: atkTotal, skill: "Athletics" },
      defense: { nat: def, mod: defMod, total: defTotal, skill: skill },
      line: line
    };
  }

  root.SSDNSShove = {
    SLIDE: SLIDE,
    sizeRank: sizeRank,
    sizeName: sizeName,
    sizeOk: sizeOk,
    lineageSize: lineageSize,
    reachFeet: reachFeet,
    inReach: inReach,
    gate: gate,
    contest: contest
  };
})(typeof window !== "undefined" ? window : globalThis);

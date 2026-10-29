/**
 * Live conditions shared by the sheet and the DM Command Center.
 * Descriptions stay available; toggles, exhaustion levels, and round timers
 * are the live state. Eldorite addiction is a DM chart, not a condition.
 */
(function (root) {
  "use strict";

  var STANDARD = [
    ["Blinded", "You can't see. Attacks against you have advantage; your attacks have disadvantage."],
    ["Charmed", "You can't harm the charmer. They have advantage on social checks against you."],
    ["Deafened", "You can't hear. You auto-fail checks that need hearing."],
    ["Frightened", "Disadvantage on ability checks and attacks while the source is in sight. You can't willingly move closer."],
    ["Grappled", "Speed is 0. It ends if the grappler can't hold you, or you're forced out of reach."],
    ["Incapacitated", "You can't take actions or reactions."],
    ["Invisible", "You're impossible to see without a special sense. Attacks against you have disadvantage; yours have advantage."],
    ["Paralyzed", "Incapacitated, can't move or speak, and auto-fail Strength and Dexterity saves. Attacks against you have advantage, and a hit from within 5 feet is a critical."],
    ["Petrified", "You're turned to a solid substance. Incapacitated, unaware, and resistant to all damage. Attacks against you have advantage."],
    ["Poisoned", "Disadvantage on attack rolls and ability checks."],
    ["Prone", "Your attacks have disadvantage. Melee attacks against you have advantage; ranged attacks have disadvantage. Crawl, or spend half your movement to stand."],
    ["Restrained", "Speed is 0. Attacks against you have advantage; your attacks and Dexterity saves have disadvantage."],
    ["Stunned", "Incapacitated, can't move, and auto-fail Strength and Dexterity saves. Attacks against you have advantage."],
    ["Unconscious", "Incapacitated, prone, and unaware. You drop what you're holding and auto-fail Strength and Dexterity saves. Attacks against you have advantage, and a hit from within 5 feet is a critical."]
  ];
  var ATTACK_DISADV = { Blinded: 1, Frightened: 1, Poisoned: 1, Prone: 1, Restrained: 1 };
  var ATTACK_ADV = { Invisible: 1 };

  function slug(name) {
    return String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "condition";
  }
  function idFor(subjectId, name) {
    return "cond_" + slug(subjectId) + "_" + slug(name);
  }
  function catalog() {
    return STANDARD.map(function (row) {
      return { name: row[0], text: row[1], exhaustion: false };
    }).concat([{
      name: "Exhaustion",
      text: "Stacked fatigue, levels 1 through 6. Each level adds to the ones below: 1 disadvantage on ability checks; 2 speed halved; 3 disadvantage on attacks and saves; 4 HP max halved; 5 speed 0; 6 death.",
      exhaustion: true
    }]);
  }
  function textFor(name) {
    var want = String(name || "").replace(/\s+\d+$/, "").toLowerCase();
    var hit = catalog().filter(function (row) { return row.name.toLowerCase() === want; })[0];
    return hit ? hit.text : "Set at the table.";
  }
  function normalize(entry) {
    if (!entry) return null;
    var name = String(entry.name || "").trim();
    if (!name) return null;
    var level = parseInt(entry.level, 10);
    if (/^exhaustion/i.test(name)) {
      name = "Exhaustion";
      if (!isFinite(level) || level < 1) level = 1;
      if (level > 6) level = 6;
    } else level = 0;
    var rounds = entry.rounds;
    if (rounds === "" || rounds == null) rounds = null;
    else {
      rounds = parseInt(rounds, 10);
      if (!isFinite(rounds) || rounds < 0) rounds = null;
    }
    return {
      id: entry.id || idFor(entry.subjectId || "local", name),
      name: name,
      level: level,
      rounds: rounds,
      subjectId: entry.subjectId || "",
      subjectKind: entry.subjectKind === "enemy" ? "enemy" : "player",
      by: entry.by || "",
      byName: entry.byName || "",
      updatedAt: entry.updatedAt || "",
      active: entry.active !== false,
      spell: entry.spell || "",
      caster: entry.caster || "",
      conc: entry.conc === true
    };
  }
  function label(entry) {
    var row = normalize(entry);
    if (!row) return "";
    if (row.name === "Exhaustion") return "Exhaustion " + row.level;
    if (row.rounds != null) return row.name + " " + row.rounds + "r";
    return row.name;
  }
  function listText(list) {
    return (list || []).map(label).filter(Boolean).join(", ");
  }
  function upsert(list, entry) {
    var row = normalize(entry);
    var out = (list || []).map(normalize).filter(Boolean);
    if (!row) return out;
    var idx = out.findIndex(function (x) { return x.id === row.id || x.name.toLowerCase() === row.name.toLowerCase(); });
    if (idx >= 0) out[idx] = row;
    else out.push(row);
    return out;
  }
  function removeName(list, name) {
    var want = String(name || "").toLowerCase();
    return (list || []).map(normalize).filter(function (row) {
      return row && row.name.toLowerCase() !== want;
    });
  }
  /** Drop every chip a concentration spell owns. Match the spell tag, then the chip name. */
  function removeBySpell(list, spellName) {
    var want = String(spellName || "").toLowerCase();
    if (!want) return (list || []).map(normalize).filter(Boolean);
    return (list || []).map(normalize).filter(function (row) {
      if (!row) return false;
      if (row.spell && String(row.spell).toLowerCase() === want) return false;
      return true;
    });
  }
  /** Decrement round timers for one combatant. Returns { list, ended }. */
  function tick(list, subjectId) {
    var ended = [];
    var next = [];
    (list || []).forEach(function (raw) {
      var row = normalize(raw);
      if (!row) return;
      if (subjectId && row.subjectId && row.subjectId !== subjectId) {
        next.push(row);
        return;
      }
      if (row.rounds == null) {
        next.push(row);
        return;
      }
      row.rounds = row.rounds - 1;
      if (row.rounds <= 0) ended.push(row);
      else next.push(row);
    });
    return { list: next, ended: ended };
  }
  function namesFrom(list, table) {
    var names = [];
    (list || []).forEach(function (raw) {
      var row = normalize(raw);
      if (!row) return;
      if (table[row.name] && names.indexOf(row.name) < 0) names.push(row.name);
    });
    return names;
  }
  /* L0188 food & water: 5e exhaustion levels feed the sheet math. Each level keeps the ones below. */
  var EXH_STEPS = [
    "",
    "disadvantage on ability checks",
    "speed halved",
    "disadvantage on attacks and saves",
    "HP max halved",
    "speed 0",
    "death"
  ];
  function exhaustionLevel(list) {
    var lv = 0;
    (list || []).forEach(function (raw) {
      if (!raw) return;
      if (typeof raw === "string") {
        var m = /^exhaustion\s*(\d+)?/i.exec(raw.trim());
        if (m) lv = Math.max(lv, Math.min(6, parseInt(m[1] || "1", 10) || 1));
        return;
      }
      var row = normalize(raw);
      if (row && row.name === "Exhaustion") lv = Math.max(lv, row.level);
    });
    return lv;
  }
  /** What exhaustion at this level does, in plain words. */
  function exhaustionEffects(level) {
    var lv = Math.max(0, Math.min(6, parseInt(level, 10) || 0));
    var out = {
      level: lv,
      checkDis: lv >= 1,
      speedHalf: lv >= 2 && lv < 5,
      attackDis: lv >= 3,
      saveDis: lv >= 3,
      hpHalf: lv >= 4,
      speedZero: lv >= 5,
      dead: lv >= 6,
      steps: EXH_STEPS.slice(1, lv + 1)
    };
    out.text = lv >= 6 ? "You die of exhaustion." : out.steps.slice().reverse().join("; ");
    return out;
  }
  /** Effective speed with exhaustion (2 halves it, 5 makes it 0). Base value is never changed. */
  function speedDelta(list) {
    var n = 0;
    (list || []).forEach(function (raw) {
      if (/^speed\s*[−-]\s*10$/i.test(chipLabel(raw))) n -= 10;
    });
    return n;
  }
  function withSpeedChips(speed, list) {
    var n = Number(speed);
    if (speed === "" || speed == null || !isFinite(n)) return speed;
    var d = speedDelta(list);
    if (!d) return n;
    return Math.max(0, n + d);
  }
  /* The next attack spends these chips. Disadv is the attacker's. Guided is the target's. */
  function strikeSpend(attackerList, targetList) {
    return {
      attacker: hasName(attackerList, "Disadv next attack") ? ["Disadv next attack"] : [],
      target: hasName(targetList, "Guided") ? ["Guided"] : []
    };
  }
  function riderMode(attackerList, targetList) {
    return attackMode(
      hasName(attackerList, "Disadv next attack") ? [{ name: "Disadv next attack" }] : [],
      "",
      "",
      hasName(targetList, "Guided") ? [{ name: "Guided" }] : []
    );
  }
  function exhaustedSpeed(speed, level) {
    var n = Number(speed);
    if (speed === "" || speed == null || !isFinite(n)) return speed;
    var lv = parseInt(level, 10) || 0;
    if (lv >= 5) return 0;
    if (lv >= 2) return Math.floor(n / 2);
    return n;
  }
  /** Effective HP max with exhaustion (4+ halves it, rounded down, min 1). */
  function exhaustedHpMax(max, level) {
    var n = Number(max);
    if (max === "" || max == null || !isFinite(n)) return max;
    if ((parseInt(level, 10) || 0) >= 4) return Math.max(1, Math.floor(n / 2));
    return n;
  }
  /** One plain sentence for a condition toast: "Exhaustion 2: speed halved; disadvantage on ability checks." */
  function effectText(entry) {
    var row = normalize(entry);
    if (!row) return "";
    if (row.name === "Exhaustion") return label(row) + ": " + exhaustionEffects(row.level).text + ".";
    return label(row) + ": " + textFor(row.name);
  }
  /** Ability check / save roll mode from conditions. kind is "check" or "save". */
  function rollMode(list, kind, chosen) {
    var fx = exhaustionEffects(exhaustionLevel(list));
    var dis = kind === "save" ? fx.saveDis : fx.checkDis;
    var pick = chosen === "adv" || chosen === "dis" ? chosen : "";
    if (!dis) return pick;
    if (pick === "adv") return "";
    return "dis";
  }
  function chipLabel(raw) {
    if (!raw) return "";
    return String(typeof raw === "string" ? raw : (raw.name || raw.label || "")).trim();
  }
  function hasName(list, name) {
    var want = String(name || "").toLowerCase();
    if (!want) return false;
    return (list || []).some(function (raw) { return chipLabel(raw).toLowerCase() === want; });
  }
  function disadvantageNote(list) {
    var names = namesFrom(list, ATTACK_DISADV);
    if (hasName(list, "Disadv next attack") && names.indexOf("Disadv next attack") < 0) names.push("Disadv next attack");
    var lv = exhaustionLevel(list);
    if (lv >= 3) names.push("Exhaustion " + lv);
    return names.length ? ("disadvantage: " + names.join(", ")) : "";
  }
  function advantageNote(list) {
    var names = namesFrom(list, ATTACK_ADV);
    return names.length ? ("advantage: " + names.join(", ")) : "";
  }
  /** Blank chosen mode plus conditions. Advantage and disadvantage cancel.
   * extraDis is a range (or other) disadvantage source. It cancels with any advantage. */
  function attackMode(list, chosen, extraDis, targetList) {
    var dis = !!disadvantageNote(list) || !!extraDis;
    var adv = !!advantageNote(list);
    if (hasName(targetList, "Guided")) adv = true;
    var pick = chosen === "adv" || chosen === "dis" ? chosen : "";
    if (pick === "adv" && dis) return "";
    if (pick === "dis" && adv && !dis) return "";
    if (pick) return pick;
    if (dis && adv) return "";
    if (dis) return "dis";
    if (adv) return "adv";
    return "";
  }
  /** Upsert incoming ids. Remove only ids the caller explicitly dropped. */
  function mergeById(existing, incoming, removeIds) {
    var drop = {};
    (removeIds || []).forEach(function (id) { if (id) drop[id] = 1; });
    var out = (existing || []).map(normalize).filter(function (row) { return row && !drop[row.id]; });
    (incoming || []).forEach(function (raw) {
      var row = normalize(raw);
      if (!row || drop[row.id]) return;
      var idx = out.findIndex(function (x) { return x.id === row.id || x.name.toLowerCase() === row.name.toLowerCase(); });
      if (idx >= 0) out[idx] = row;
      else out.push(row);
    });
    return out;
  }
  function ensureUnconscious(list, hp, subjectId) {
    var cur = (list || []).slice();
    if (hp == null || (typeof hp === "string" && String(hp).trim() === "")) return cur.map(normalize).filter(Boolean);
    var n = Number(hp);
    if (!isFinite(n)) return cur.map(normalize).filter(Boolean);
    if (n > 0) return removeName(cur, "Unconscious");
    if (cur.some(function (row) { return row && /^unconscious$/i.test(row.name); })) return cur.map(normalize).filter(Boolean);
    return upsert(cur, { name: "Unconscious", subjectId: subjectId || "", by: "hp" });
  }

  /* Condition symbols (Jessey 2026-10-20 9:22 PM): one small icon per condition, shared by map tokens,
     the sheet portrait, the paper doll and the condition chips. Unknown names get a dot. */
  var ICONS = {
    blinded: "\u{1F648}", charmed: "\u{1F498}", deafened: "\u{1F507}", frightened: "\u{1F631}", grappled: "\u270A",
    incapacitated: "\u{1F6AB}", invisible: "\u{1F47B}", paralyzed: "\u26A1", petrified: "\u{1F5FF}", poisoned: "\u2620\uFE0F",
    prone: "\u2B07\uFE0F", restrained: "\u26D3\uFE0F", stunned: "\u{1F4AB}", unconscious: "\u{1F4A4}", exhaustion: "\u{1F629}",
    bloodied: "\u{1FA78}", concentrating: "\u{1F9E0}"
  };
  function icon(raw) {
    var name = String((raw && typeof raw === "object" ? (raw.name || raw.label) : raw) || "").trim().toLowerCase().replace(/\s+\d+r?$/, "");
    if (/^exhaust/.test(name)) name = "exhaustion";
    return ICONS[name] || "\u25CF";
  }
  function iconName(raw) {
    var name = String((raw && typeof raw === "object" ? (raw.name || raw.label) : raw) || "").trim();
    var lv = raw && typeof raw === "object" && /^exhaust/i.test(name) && raw.level ? " " + raw.level : "";
    return name.replace(/\s+\d+r$/, "") + lv;
  }

  root.SSDNSConditions = {
    icon: icon,
    iconName: iconName,
    ICONS: ICONS,
    catalog: catalog,
    textFor: textFor,
    idFor: idFor,
    normalize: normalize,
    label: label,
    listText: listText,
    upsert: upsert,
    removeName: removeName,
    removeBySpell: removeBySpell,
    tick: tick,
    disadvantageNote: disadvantageNote,
    advantageNote: advantageNote,
    attackMode: attackMode,
    hasName: hasName,
    withSpeedChips: withSpeedChips,
    strikeSpend: strikeSpend,
    riderMode: riderMode,
    mergeById: mergeById,
    ensureUnconscious: ensureUnconscious,
    exhaustionLevel: exhaustionLevel,
    exhaustionEffects: exhaustionEffects,
    exhaustedSpeed: exhaustedSpeed,
    exhaustedHpMax: exhaustedHpMax,
    effectText: effectText,
    rollMode: rollMode
  };
})(typeof window !== "undefined" ? window : globalThis);

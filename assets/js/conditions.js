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
      text: "Stacked fatigue, levels 1 through 6. The level is part of the condition.",
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
      active: entry.active !== false
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
  function disadvantageNote(list) {
    var names = namesFrom(list, ATTACK_DISADV);
    return names.length ? ("disadvantage: " + names.join(", ")) : "";
  }
  function advantageNote(list) {
    var names = namesFrom(list, ATTACK_ADV);
    return names.length ? ("advantage: " + names.join(", ")) : "";
  }
  /** Blank chosen mode plus conditions. Advantage and disadvantage cancel. */
  function attackMode(list, chosen) {
    var dis = !!disadvantageNote(list);
    var adv = !!advantageNote(list);
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
    if (Number(hp) > 0) return removeName(cur, "Unconscious");
    if (Number(hp) !== 0) return cur.map(normalize).filter(Boolean);
    if (cur.some(function (row) { return row && /^unconscious$/i.test(row.name); })) return cur.map(normalize).filter(Boolean);
    return upsert(cur, { name: "Unconscious", subjectId: subjectId || "", by: "hp" });
  }

  root.SSDNSConditions = {
    catalog: catalog,
    textFor: textFor,
    idFor: idFor,
    normalize: normalize,
    label: label,
    listText: listText,
    upsert: upsert,
    removeName: removeName,
    tick: tick,
    disadvantageNote: disadvantageNote,
    advantageNote: advantageNote,
    attackMode: attackMode,
    mergeById: mergeById,
    ensureUnconscious: ensureUnconscious
  };
})(typeof window !== "undefined" ? window : globalThis);

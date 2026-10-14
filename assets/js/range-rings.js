/* Range rings for the map. Visual only: this file does not roll attacks.
   Green is normal range. Orange is a disadvantage band. Red is the line
   you cannot shoot past. Rings stay off until a player or the DM turns them on. */
(function (root) {
  "use strict";

  function rules() { return root.SSDNS_RULES || {}; }

  function numPair(range) {
    var m = String(range || "").match(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
    if (!m) return null;
    return { normal: Number(m[1]), long: Number(m[2]) };
  }

  function feetOf(range) {
    var m = String(range || "").match(/(\d+(?:\.\d+)?)\s*ft/i);
    return m ? Number(m[1]) : 0;
  }

  function catalog(spec) {
    spec = spec || {};
    var lists = [].concat(rules().firearms || [], rules().casterGuns || [], rules().melee || [], rules().otherRanged || []);
    var id = spec.weapon || spec.weaponId || "";
    var name = String(spec.name || "").toLowerCase();
    var i, row;
    for (i = 0; i < lists.length; i++) {
      row = lists[i];
      if (!row) continue;
      if (id && row.id === id) return row;
      if (name && String(row.name || "").toLowerCase() === name) return row;
    }
    return null;
  }

  function propsOf(spec, cat) {
    var p = spec.properties;
    if (Array.isArray(p)) p = p.join(", ");
    return String(p || (cat && cat.properties) || "");
  }

  function tierRow(cat, spec) {
    var tiers = cat && cat.tiers || {};
    if (spec.tier && tiers[spec.tier]) return tiers[spec.tier];
    var keys = Object.keys(tiers);
    return keys.length ? tiers[keys[0]] : null;
  }

  function rangeString(spec, cat) {
    if (spec.range) return String(spec.range);
    if (!cat) return "";
    if (cat.range && cat.range !== "—" && cat.range !== "-") return String(cat.range);
    var tier = tierRow(cat, spec);
    if (!tier) return "";
    if (cat.scatter || spec.scatter) {
      var load = spec.load === "slug" ? "slug" : "buck";
      var row = tier[load] || tier.buck || tier.slug || tier;
      return row.range || "";
    }
    return tier.range || "";
  }

  function spellRange(spec) {
    if (spec.range) return String(spec.range);
    var cast = root.SSDNSSpellCast;
    if (cast && typeof cast.rangeOf === "function") return cast.rangeOf(spec.name || "") || "";
    return "";
  }

  function empty(label) {
    return {
      close: 0, normal: 0, long: 0, melee: 0, meleeRed: 0,
      clearLong: false, cone: false, spell: false, thrown: false, label: label || ""
    };
  }

  function bands(spec) {
    spec = spec || {};
    var cat = catalog(spec);
    var group = String(spec.group || (cat && cat.group) || "").toLowerCase();
    var name = String(spec.name || (cat && cat.name) || "Range");
    var properties = propsOf(spec, cat);
    var kind = String(spec.kind || "");
    var spell = kind === "spell" || spec.spell === true;
    if (spell) {
      if (spec.spellKind && spec.spellKind !== "attack") return empty(name);
      var raw = spellRange(spec);
      var ft = feetOf(raw);
      if (!ft) return empty(name);
      if (spec.longRangeHex) ft *= 2;
      return {
        close: 0, normal: ft, long: ft, melee: 0, meleeRed: 0,
        clearLong: false, cone: false, spell: true, thrown: false,
        label: name + " · " + ft + " ft"
      };
    }
    var range = rangeString(spec, cat);
    var pair = numPair(range);
    var coneFt = /cone/i.test(range) ? feetOf(range) : 0;
    var thrown = /thrown/i.test(properties) || /thrown/i.test(range);
    var rangedGroup = /pistol|rifle|carbine|shotgun|bigbore|ranged|caster/.test(group);
    var meleeGroup = /melee/.test(group);
    var melee = meleeGroup || kind === "melee" || thrown || (!pair && !coneFt && !rangedGroup && (!range || range === "—" || range === "-"));
    var reach = /reach/i.test(properties) ? 10 : 5;
    var scope = !!(spec.scope || /scope/i.test(String(spec.mod || "")));
    var carbine = group === "carbine" || /carbine/i.test(name);
    var closeQuarters = /close quarters/i.test(properties);
    if (scope && carbine) closeQuarters = false;
    var unwieldy = !!(spec.unwieldy || /unwieldy/i.test(properties) || /big fifty/i.test(name));
    var rifle = group === "rifle" || group === "carbine" || group === "bigbore" || /\brifle\b|\bcarbine\b/i.test(name);
    var close = 0;
    if (unwieldy) close = 30;
    else if (rifle && !closeQuarters) close = 5;
    var normal = pair ? pair.normal : (coneFt || 0);
    var long = pair ? pair.long : (coneFt || 0);
    var sharp = !!spec.sharpshooter;
    var clearLong = long > normal && ((scope && !spec.moved) || sharp);
    var bits = [];
    if (melee) bits.push("reach " + reach + " ft");
    if (coneFt && !pair) bits.push(coneFt + " ft cone");
    else if (pair) bits.push(pair.normal + "/" + pair.long);
    if (close) bits.push("close " + close);
    if (clearLong) bits.push(sharp && !(scope && !spec.moved) ? "sharpshooter" : "scope");
    return {
      close: close,
      normal: normal,
      long: long,
      melee: melee ? reach : 0,
      meleeRed: melee ? reach + 2.5 : 0,
      clearLong: clearLong,
      cone: !!(coneFt && !pair),
      spell: false,
      thrown: !!thrown,
      label: name + (bits.length ? " · " + bits.join(" · ") : "")
    };
  }

  function rings(spec) {
    var b = bands(spec);
    var greenF = "rgba(46,168,74,0.18)";
    var orangeF = "rgba(224,122,32,0.24)";
    var greenS = "#2ea84a";
    var orangeS = "#e07a20";
    var redS = "#e23b32";
    var out = [];
    if (b.long) {
      var same = b.normal === b.long;
      out.push({
        feet: b.long,
        role: "limit",
        fill: (b.clearLong || same) ? greenF : orangeF,
        stroke: redS,
        width: 3
      });
    }
    if (b.normal && b.long && b.normal < b.long && !b.clearLong) {
      out.push({ feet: b.normal, role: "normal", fill: greenF, stroke: greenS, width: 2 });
    }
    if (b.close) out.push({ feet: b.close, role: "close", fill: orangeF, stroke: orangeS, width: 2 });
    if (b.melee) {
      out.push({ feet: b.melee, role: "reach", fill: greenF, stroke: greenS, width: 2 });
      out.push({ feet: b.meleeRed, role: "past", fill: "", stroke: redS, width: 2 });
    }
    return { rings: out, label: b.label, bands: b };
  }

  root.SSDNSRangeRings = { bands: bands, rings: rings };
})(typeof window !== "undefined" ? window : globalThis);

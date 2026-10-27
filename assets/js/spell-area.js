/**
 * N77: one area reader for every spell. Spell text lives in SSDNS_SPELL_FX
 * (sphere, cube, cone, line, cylinder, square, wall). rules.js is not touched.
 * Geometry is in feet. A token is { x, y, size } in map squares (5 ft each).
 */
(function (root) {
  "use strict";

  var HALF_CONE = Math.atan(0.5);

  function norm(s) {
    return String(s || "").toLowerCase().replace(/\./g, "").replace(/\s+/g, " ").trim();
  }

  function countWord(word) {
    var words = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
    if (words[word]) return words[word];
    var n = parseInt(word, 10);
    return isFinite(n) && n > 0 ? n : 1;
  }

  function rangeFeetOf(range) {
    var s = String(range || "").trim();
    if (!s) return null;
    if (/^self\b/i.test(s)) return 0;
    if (/touch/i.test(s)) return 5;
    if (/sight/i.test(s) && !/\d/.test(s)) return null;
    var mile = s.match(/(\d+(?:\.\d+)?)\s*miles?/i);
    if (mile && !/foot|feet/i.test(s)) return Math.round(parseFloat(mile[1]) * 5280);
    var ft = s.match(/(\d+)\s*(?:feet|ft)\b/i);
    if (ft) return parseInt(ft[1], 10);
    return null;
  }

  function widthFrom(text, fallback) {
    var s = String(text || "");
    var m = s.match(/(\d+)\s*-?\s*feet?\s+wide/i) || s.match(/(\d+)\s*-foot-wide/i) || s.match(/(\d+)\s*-?\s*feet?\s+thick/i) || s.match(/(\d+)\s+foot\s+thick/i);
    if (!m) return fallback;
    var n = parseInt(m[1], 10);
    return isFinite(n) && n > 0 ? n : fallback;
  }

  function parseArea(text, does) {
    var raw = String(text || "").trim();
    var s = raw.toLowerCase();
    if (!s) return null;
    if (/creature/.test(s) && !/foot|feet|mile/.test(s)) return null;
    var foot = s.match(/(\d+)\s*-?\s*foot/);
    var mile = s.match(/(\d+(?:\.\d+)?)\s*miles?/);
    var n = foot ? parseInt(foot[1], 10) : (mile ? Math.round(parseFloat(mile[1]) * 5280) : 0);
    if (!n) return null;
    var shape = "";
    if (/cone/.test(s)) shape = "cone";
    else if (/cube/.test(s)) shape = "cube";
    else if (/square/.test(s)) shape = "square";
    else if (/wall/.test(s)) shape = "wall";
    else if (/line/.test(s)) shape = "line";
    else if (/cylinder/.test(s)) shape = "cylinder";
    else if (/sphere|radius|radii/.test(s)) shape = "sphere";
    else if (mile) shape = "sphere";
    else return null;
    var spec = { shape: shape, feet: n, label: raw, count: 1 };
    if (shape === "sphere" || shape === "cylinder") spec.radius = n;
    if (shape === "cone") spec.length = n;
    if (shape === "cube" || shape === "square") spec.side = n;
    if (shape === "line" || shape === "wall") {
      spec.length = n;
      var wide = widthFrom(raw, 0) || widthFrom(does, 0);
      if (shape === "wall") {
        spec.thickness = wide || 1;
        spec.width = Math.max(5, spec.thickness);
      } else {
        spec.width = wide || 5;
      }
    }
    var lead = s.match(/^(one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+\d+/);
    if (lead) spec.count = countWord(lead[1]);
    return spec;
  }

  /* Sheet lists say "Fireball Shell" or "Fireball (alias)". The fx book is the PHB name. */
  function bareKey(name) {
    return norm(String(name || "").replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+shell$/i, ""));
  }
  function fxOf(name) {
    var book = root.SSDNS_SPELL_FX || {};
    var key = norm(name);
    var bare = bareKey(name);
    if (book[key]) return book[key];
    if (bare && book[bare]) return book[bare];
    var found = null;
    Object.keys(book).forEach(function (k) {
      if (!found && (norm(k) === key || norm(k) === bare)) found = book[k];
    });
    return found;
  }

  function areaOf(name) {
    var fx = fxOf(name);
    if (!fx || !fx.area) return null;
    var spec = parseArea(fx.area, fx.does);
    if (!spec) return null;
    spec.self = /^self\b/i.test(String(fx.range || "").trim());
    spec.rangeFeet = rangeFeetOf(fx.range);
    spec.range = fx.range || "";
    spec.does = fx.does || "";
    if ((spec.shape === "line" || spec.shape === "wall") && fx.does) {
      var wide = widthFrom(fx.does, 0);
      if (wide && spec.shape === "line") spec.width = wide;
      if (wide && spec.shape === "wall") {
        spec.thickness = wide;
        spec.width = Math.max(5, wide);
      }
    }
    return spec;
  }

  function isSelfOrigin(area) {
    return !!(area && area.self && (area.shape === "cone" || area.shape === "line" || area.shape === "cube" || area.shape === "square"));
  }

  function footprint(token) {
    var size = Math.max(1, Number(token && token.size) || 1);
    var x = Number(token && token.x);
    var y = Number(token && token.y);
    if (!isFinite(x) || !isFinite(y)) return null;
    return { x0: x * 5, y0: y * 5, x1: (x + size) * 5, y1: (y + size) * 5, cx: (x + size / 2) * 5, cy: (y + size / 2) * 5 };
  }

  function distToRect(px, py, r) {
    var cx = Math.max(r.x0, Math.min(px, r.x1));
    var cy = Math.max(r.y0, Math.min(py, r.y1));
    var dx = px - cx;
    var dy = py - cy;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function rectsOverlap(a, b) {
    return a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
  }

  function samples(r) {
    var mx = (r.x0 + r.x1) / 2;
    var my = (r.y0 + r.y1) / 2;
    return [
      { x: r.cx, y: r.cy },
      { x: r.x0, y: r.y0 }, { x: r.x1, y: r.y0 }, { x: r.x0, y: r.y1 }, { x: r.x1, y: r.y1 },
      { x: mx, y: r.y0 }, { x: mx, y: r.y1 }, { x: r.x0, y: my }, { x: r.x1, y: my }
    ];
  }

  function inCone(ox, oy, facing, length, px, py) {
    var dx = px - ox;
    var dy = py - oy;
    var dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 0.5 || dist > length + 0.05) return false;
    var ang = Math.atan2(dy, dx);
    var delta = ang - facing;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    return Math.abs(delta) <= HALF_CONE + 0.001;
  }

  /* Sample the wedge, not only the token's corners, so a square the cone clips still takes the damage. */
  function coneHits(ox, oy, facing, length, rect) {
    var ok = false;
    samples(rect).forEach(function (p) {
      if (!ok && inCone(ox, oy, facing, length, p.x, p.y)) ok = true;
    });
    if (ok) return true;
    var fx = Math.cos(facing);
    var fy = Math.sin(facing);
    var lx = -fy;
    var ly = fx;
    var steps = Math.max(1, Math.ceil((Number(length) || 0) / 5));
    var i, j;
    for (i = 1; i <= steps; i++) {
      var dist = (Number(length) || 0) * (i / steps);
      var half = dist * 0.5;
      var latSteps = Math.max(1, Math.ceil(Math.max(1, half * 2) / 5));
      for (j = 0; j <= latSteps; j++) {
        var lat = -half + (half * 2) * (j / latSteps);
        var px = ox + fx * dist + lx * lat;
        var py = oy + fy * dist + ly * lat;
        if (px >= rect.x0 - 0.05 && px <= rect.x1 + 0.05 && py >= rect.y0 - 0.05 && py <= rect.y1 + 0.05) return true;
      }
    }
    return false;
  }

  function bandHits(ox, oy, facing, f0, f1, halfW, rect) {
    var fx = Math.cos(facing);
    var fy = Math.sin(facing);
    var lx = -fy;
    var ly = fx;
    var hit = false;
    samples(rect).forEach(function (p) {
      if (hit) return;
      var dx = p.x - ox;
      var dy = p.y - oy;
      var forward = dx * fx + dy * fy;
      var lateral = dx * lx + dy * ly;
      if (forward >= f0 - 0.05 && forward <= f1 + 0.05 && Math.abs(lateral) <= halfW + 0.05) hit = true;
    });
    if (hit) return true;
    var stepsF = Math.max(1, Math.ceil(Math.max(1, f1 - f0) / 5));
    var stepsL = Math.max(1, Math.ceil(Math.max(1, halfW * 2) / 5));
    var i, j;
    for (i = 0; i <= stepsF; i++) {
      for (j = 0; j <= stepsL; j++) {
        var f = f0 + (f1 - f0) * (i / stepsF);
        var l = -halfW + (halfW * 2) * (j / stepsL);
        var px = ox + fx * f + lx * l;
        var py = oy + fy * f + ly * l;
        if (px >= rect.x0 - 0.05 && px <= rect.x1 + 0.05 && py >= rect.y0 - 0.05 && py <= rect.y1 + 0.05) return true;
      }
    }
    return false;
  }

  function hits(area, originFeet, facing, token) {
    if (!area || !originFeet) return false;
    var rect = footprint(token);
    if (!rect) return false;
    var ox = Number(originFeet.x);
    var oy = Number(originFeet.y);
    if (!isFinite(ox) || !isFinite(oy)) return false;
    var face = Number(facing) || 0;
    if (area.shape === "sphere" || area.shape === "cylinder") {
      return distToRect(ox, oy, rect) <= (Number(area.radius) || 0) + 0.05;
    }
    if (area.shape === "cube" || area.shape === "square") {
      var side = Number(area.side) || 0;
      if (area.self) {
        var sizeFt = Math.max(5, (Number(originFeet.casterSize) || 1) * 5);
        return bandHits(ox, oy, face, sizeFt / 2, sizeFt / 2 + side, side / 2, rect);
      }
      var half = side / 2;
      return rectsOverlap({ x0: ox - half, y0: oy - half, x1: ox + half, y1: oy + half }, rect);
    }
    if (area.shape === "cone") return coneHits(ox, oy, face, Number(area.length) || 0, rect);
    if (area.shape === "line") {
      return bandHits(ox, oy, face, 0, Number(area.length) || 0, (Number(area.width) || 5) / 2, rect);
    }
    if (area.shape === "wall") {
      var wallLen = Number(area.length) || 0;
      return bandHits(ox, oy, face, -wallLen / 2, wallLen / 2, (Number(area.width) || 5) / 2, rect);
    }
    return false;
  }

  function tokensIn(tokens, area, origins, facing, excludeId) {
    var list = [];
    var spots = origins && origins.length ? origins : [];
    (tokens || []).forEach(function (t) {
      if (!t) return;
      if (excludeId && area && area.self && (t.id === excludeId || t.ownerUid === excludeId || t.combatantId === excludeId)) return;
      var tok = { x: t.x, y: t.y, size: t.size || 1, id: t.id };
      var hit = spots.some(function (o) {
        return hits(area, o, facing, tok);
      });
      if (hit) list.push(t);
    });
    return list;
  }

  function savedAmount(full, half, save) {
    var n = Number(full) || 0;
    if (save && save.auto) return save.blocked ? 0 : n;
    if (!save) return n;
    if (save.blocked) return 0;
    if (save.failed) return n;
    if (half) return Math.floor(n / 2);
    return 0;
  }

  var FAIL = {
    "entangle": "Restrained",
    "web": "Restrained",
    "black tentacles": "Restrained",
    "hold person": "Paralyzed",
    "hold monster": "Paralyzed",
    "grease": "Prone",
    "blindness/deafness": "Blinded",
    "fear": "Frightened",
    "cause fear": "Frightened",
    "charm person": "Charmed",
    "hypnotic pattern": "Charmed + Incapacitated",
    "hideous laughter": "Prone + Incapacitated"
  };

  function onFail(name) {
    var riders = root.SSDNSSpellRiders;
    if (riders && riders.poolSpell && riders.poolSpell(name)) return "";
    if (riders && riders.failList) {
      var list = riders.failList(name);
      if (list.length) return list.join(" + ");
    }
    var key = norm(name);
    if (key === "sleep" || key === "color spray") return "";
    if (FAIL[key]) return FAIL[key];
    var hit = "";
    Object.keys(FAIL).forEach(function (k) {
      if (!hit && key.indexOf(k) >= 0) hit = FAIL[k];
    });
    return hit;
  }

  /* Numeric effects the sheet can apply. Everything else still logs its text and does not post 0 damage. */
  var BUFFS = {
    "shield": { ac: 5, ms: 60000, label: "Shield: +5 AC for this round" },
    "shield of faith": { ac: 2, ms: 10 * 60000, label: "Shield of Faith: +2 AC" },
    "mage armor": { mageArmor: true, ms: 8 * 3600000, label: "Mage Armor: AC 13 + Dex while you wear no armor" },
    "barkskin": { acFloor: 16, ms: 60 * 60000, label: "Barkskin: AC can't be below 16" },
    "haste": { ac: 2, ms: 60000, label: "Haste: +2 AC" },
    "false life": { temp: "1d4+4", label: "False Life: temporary hit points" },
    "armor of agathys": { tempPerSlot: 5, retaliatePerSlot: 5, retaliateType: "cold", label: "Armor of Agathys: temporary hit points; cold damage to a melee attacker" },
    "aid": { heal: 5, maxHp: 5, label: "Aid: +5 current and maximum hit points" },
    "heroism": { tempFromMod: true, ms: 60000, label: "Heroism: temporary hit points equal to your spellcasting modifier" },
    "goodberry": { heal: 1, label: "Goodberry: 1 hit point" },
    "healing word": { heal: 0 },
    "blade ward": { label: "Blade Ward: resistance to bludgeoning, piercing, and slashing from weapons until your next turn" },
    "bless": { label: "Bless: +1d4 on attack rolls and saving throws" },
    "bane": { label: "Bane: −1d4 on attack rolls and saving throws" },
    "guidance": { label: "Guidance: +1d4 on one ability check" },
    "resistance": { label: "Resistance: +1d4 on one saving throw" }
  };

  function buffOf(name, slot) {
    var key = norm(name);
    if (!BUFFS[key]) return null;
    var buff = Object.assign({ name: key }, BUFFS[key]);
    if (buff.tempPerSlot) {
      var lv = Math.max(1, Number(slot) || 1);
      var n = buff.tempPerSlot * lv;
      buff.temp = String(n);
      buff.retaliate = (buff.retaliatePerSlot || 5) * lv;
      buff.retaliateType = buff.retaliateType || "cold";
      buff.label = "Armor of Agathys: " + n + " temporary hit points; " + buff.retaliate + " cold back to a melee attacker";
    }
    return buff;
  }

  /* Fight-row id the damage request should name. A public map token has no combatantId, only its map id. */
  function strikeTargetId(token, rows) {
    if (!token) return "";
    var ids = [token.combatantId, token.ownerUid, token.id, token.strikeId].filter(Boolean).map(String);
    var row = null;
    (rows || []).forEach(function (r) {
      if (row || !r) return;
      var keys = [r.id, r.playerId, r.mapTokenId].filter(Boolean).map(String);
      if (ids.some(function (id) { return keys.indexOf(id) >= 0; })) row = r;
    });
    if (row) {
      if (row.kind === "player") return String(row.playerId || row.id || "");
      return String(row.id || "");
    }
    return String(token.combatantId || token.ownerUid || token.id || "");
  }

  /* One HP line per creature. origins are in feet, the same frame hits() uses. */
  function applyArea(spec) {
    spec = spec || {};
    var crowd = tokensIn(spec.tokens, spec.area, spec.origins, spec.facing || 0, spec.excludeId);
    var full = Number(spec.full) || 0;
    return crowd.map(function (t) {
      var id = strikeTargetId(t, spec.rows);
      var save = spec.saves ? (spec.saves[id] || spec.saves[t.id] || null) : null;
      var amount = spec.kind === "heal" ? full : savedAmount(full, !!spec.half, save);
      return { targetId: id, name: t.name || "", amount: amount, tokenId: t.id || "" };
    });
  }

  function dartCount(row, slot) {
    if (!row || !row.rays) return 0;
    var base = Number(row.level) || 0;
    var sl = slot == null || slot === "" ? base : Number(slot);
    if (!isFinite(sl)) sl = base;
    var up = Math.max(0, sl - base);
    if (row.upEvery) up = Math.floor(up / row.upEvery);
    return Math.max(1, (Number(row.rays) || 1) + (row.rayUp ? up * Number(row.rayUp) : 0));
  }

  /* Eldritch Blast / Pact Shot: beams by character level, not slot level. */
  function beamCount(level) {
    var lv = parseInt(level, 10) || 1;
    if (lv >= 17) return 4;
    if (lv >= 11) return 3;
    if (lv >= 5) return 2;
    return 1;
  }

  /* Pair each attack ray or beam with a pick. AC known: nat 1 misses, nat 20 hits, else total vs AC.
     AC unknown: leave the rolled amount for the DM (pending). Narrative picks deal nothing. */
  function assignBeams(shots, picks) {
    var beams = [];
    var groups = [];
    var byId = {};
    (shots || []).forEach(function (shot, i) {
      shot = shot || {};
      var pick = (picks || [])[i] || {};
      var narrative = !pick || !pick.id || pick.narrative;
      var ac = pick.ac;
      var haveAc = !narrative && ac != null && ac !== "" && isFinite(Number(ac));
      var nat = Number(shot.nat);
      var total = Number(shot.total);
      var miss = narrative || nat === 1;
      if (!miss && haveAc && nat !== 20 && total < Number(ac)) miss = true;
      var pending = !narrative && !miss && !haveAc;
      var amount = miss ? 0 : (Number(shot.amount) || 0);
      var row = {
        index: i,
        label: shot.label || ("beam " + (i + 1)),
        targetId: narrative ? "" : String(pick.id),
        targetName: narrative ? "narrative" : (pick.name || ""),
        nat: nat,
        total: total,
        ac: haveAc ? Number(ac) : null,
        hit: !miss && !pending,
        pending: pending,
        crit: nat === 20 && !miss,
        amount: amount,
        dice: miss ? "" : (shot.dice || ""),
        push: (!miss && shot.push) ? Number(shot.push) || 0 : 0
      };
      beams.push(row);
      if (narrative || !row.targetId) return;
      var id = row.targetId;
      if (!byId[id]) {
        byId[id] = { id: id, name: row.targetName, total: 0, bits: [], pushes: 0, shots: [], pending: false, cover: pick.cover || "" };
        groups.push(byId[id]);
      }
      var g = byId[id];
      g.shots.push({
        nat: shot.nat,
        total: shot.total,
        amount: Number(shot.amount) || 0,
        dice: shot.dice || "",
        label: shot.label || row.label,
        push: shot.push || 0
      });
      if (pending) g.pending = true;
      if (!miss && !pending) {
        g.total += amount;
        if (row.dice) g.bits.push(row.dice);
        if (row.push) g.pushes += row.push;
      }
    });
    var totalLine = groups.map(function (g) { return (g.name || g.id) + " " + g.total; }).join(", ");
    return { beams: beams, groups: groups, totalLine: totalLine };
  }

  /* picks line up with darts. Narrative picks deal nothing. Same target sums. */
  function assignDarts(darts, picks) {
    var groups = [];
    var byId = {};
    (darts || []).forEach(function (d, i) {
      var pick = (picks || [])[i] || {};
      if (!pick || !pick.id || pick.narrative) return;
      var id = String(pick.id);
      if (!byId[id]) {
        byId[id] = { id: id, name: pick.name || "", total: 0, bits: [] };
        groups.push(byId[id]);
      }
      var n = Number(d && (d.total != null ? d.total : d.amount)) || 0;
      byId[id].total += n;
      if (d && d.text) byId[id].bits.push(d.text);
    });
    return groups;
  }

  function touchBlock(feet, rangeText, opts) {
    opts = opts || {};
    if (opts.area) return "";
    if (!/touch/i.test(String(rangeText || ""))) return "";
    var known = feet != null && feet !== "" && isFinite(Number(feet));
    if (!known) {
      if (opts.allowUnmeasured) return "";
      return "Out of reach. Put a token next to you on the map.";
    }
    if (Number(feet) > 5) return "Out of reach.";
    return "";
  }

  function rangeBlock(feet, rangeText, opts) {
    opts = opts || {};
    if (opts.area) return "";
    var text = String(rangeText || "");
    if (/touch/i.test(text)) return touchBlock(feet, text, opts);
    if (/^\s*self\b/i.test(text)) return "";
    var limit = rangeFeetOf(text);
    if (!limit) return "";
    var known = feet != null && feet !== "" && isFinite(Number(feet));
    if (!known) return "";
    if (Number(feet) > limit) return "Out of range.";
    return "";
  }

  function rollFormula(expr) {
    var m = String(expr || "").match(/(\d*)d(\d+)([+-]\d+)?/i);
    if (!m) return 0;
    var n = Math.max(1, parseInt(m[1] || "1", 10));
    var sides = parseInt(m[2], 10);
    var mod = m[3] ? parseInt(m[3], 10) : 0;
    var total = mod;
    for (var i = 0; i < n; i++) total += 1 + Math.floor(Math.random() * sides);
    return total;
  }

  root.SSDNSSpellArea = {
    parseArea: parseArea,
    areaOf: areaOf,
    rangeFeetOf: rangeFeetOf,
    hits: hits,
    tokensIn: tokensIn,
    savedAmount: savedAmount,
    onFail: onFail,
    buffOf: buffOf,
    rollFormula: rollFormula,
    isSelfOrigin: isSelfOrigin,
    strikeTargetId: strikeTargetId,
    applyArea: applyArea,
    dartCount: dartCount,
    beamCount: beamCount,
    assignDarts: assignDarts,
    assignBeams: assignBeams,
    touchBlock: touchBlock,
    rangeBlock: rangeBlock,
    shapes: ["sphere", "cylinder", "cone", "cube", "square", "line", "wall"]
  };
})(typeof window !== "undefined" ? window : globalThis);

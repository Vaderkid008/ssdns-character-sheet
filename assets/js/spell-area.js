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

  function fxOf(name) {
    var book = root.SSDNS_SPELL_FX || {};
    var key = norm(name);
    if (book[key]) return book[key];
    var found = null;
    Object.keys(book).forEach(function (k) {
      if (!found && norm(k) === key) found = book[k];
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
    if (area.shape === "cone") {
      var len = Number(area.length) || 0;
      var ok = false;
      samples(rect).forEach(function (p) {
        if (!ok && inCone(ox, oy, face, len, p.x, p.y)) ok = true;
      });
      return ok;
    }
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
    "color spray": "Blinded",
    "fear": "Frightened",
    "cause fear": "Frightened",
    "charm person": "Charmed",
    "hypnotic pattern": "Incapacitated",
    "sleep": "Unconscious",
    "hideous laughter": "Prone"
  };

  function onFail(name) {
    var key = norm(name);
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
    "armor of agathys": { temp: "5", label: "Armor of Agathys: 5 temporary hit points" },
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

  function buffOf(name) {
    var key = norm(name);
    if (BUFFS[key]) return Object.assign({ name: key }, BUFFS[key]);
    return null;
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
    shapes: ["sphere", "cylinder", "cone", "cube", "square", "line", "wall"]
  };
})(typeof window !== "undefined" ? window : globalThis);

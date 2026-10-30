/* Art dice for the sheet, the DM Command Center, and the map.
   Blank faces live in assets/img/dice. The rolled number is drawn in
   code, in the die's color, with a #1A1A1A outline. */
(function (root) {
  "use strict";

  var SIDES = [4, 6, 8, 10, 12, 20, 50, 100];
  var COLOR = {
    4: "#E8463F",
    6: "#FCB92E",
    8: "#F3D37C",
    10: "#B4F06E",
    12: "#37C0FA",
    20: "#4FDCCB",
    50: "#B47CFF",
    100: "#FCFCFA"
  };
  var LOCKED_PX = 96;
  /* Face centers and font sizes in a 512px viewBox. */
  var CENTER_Y = { 4: 320, 8: 180 };
  /* Small icons: the number is bigger than the face, so sit it nearer the middle. */
  var CENTER_Y_SMALL = { 4: 330, 8: 236 };
  var FONT_AT_512 = { 4: 150, 6: 220, 8: 130, 10: 150, 12: 140, 20: 100, 50: 130, 100: 120 };

  function prefix() {
    try {
      var path = (root.location && root.location.pathname) || "";
      if (root.SSDNS_DICE_BASE != null) return String(root.SSDNS_DICE_BASE);
      if (path.indexOf("/dm/") >= 0 || path.indexOf("/tools/") >= 0) return "../";
    } catch (e) {}
    return "";
  }
  function src(sides) {
    return prefix() + "assets/img/dice/d" + sides + ".webp";
  }
  function known(sides) {
    return SIDES.indexOf(Number(sides)) >= 0;
  }
  function sidesOf(text) {
    var m = String(text || "").match(/(?:^|[^a-z0-9])(\d*)d(4|6|8|10|12|20|50|100)(?![0-9])/i);
    return m ? Number(m[2]) : 0;
  }
  function specOf(formula) {
    var m = String(formula || "").match(/(\d*)d(4|6|8|10|12|20|50|100)(?![0-9])([+-]\d+)?/i);
    if (!m) return null;
    return {
      count: Math.max(1, parseInt(m[1] || "1", 10) || 1),
      sides: Number(m[2]),
      mod: m[3] || ""
    };
  }
  function numText(number) {
    if (number == null || number === "" || !isFinite(Number(number))) return "";
    return String(Math.round(Number(number)));
  }
  function metrics(sides, text, px) {
    var n = Number(sides);
    var size = Number(px);
    if (!isFinite(size) || size <= 0) size = 84;
    var small = size <= 64;
    var font;
    var stroke;
    if (small) {
      var screen = size * 0.6;
      var digits = String(text || "").length;
      if (digits >= 2) {
        var avail = size * 0.72;
        var est = screen * 0.62 * digits;
        if (est > avail) screen = avail / (0.62 * digits);
      }
      font = screen * (512 / size);
      stroke = Math.max(2, size * 0.08) * (512 / size);
    } else {
      font = FONT_AT_512[n] || 120;
      stroke = Math.max(6, font * 0.045);
    }
    return {
      px: size,
      small: small,
      x: 256,
      y: (small ? CENTER_Y_SMALL[n] : CENTER_Y[n]) || 256,
      font: font,
      stroke: stroke,
      fill: COLOR[n] || "#FCFCFA"
    };
  }
  function faceHtml(sides, number, px) {
    var n = Number(sides);
    if (!known(n)) return "";
    var text = numText(number);
    var m = metrics(n, text, px);
    var svg = "";
    if (text) {
      svg = '<svg class="die-num" viewBox="0 0 512 512" aria-hidden="true">' +
        '<text x="' + m.x + '" y="' + m.y + '" text-anchor="middle" dominant-baseline="central" ' +
        'fill="' + m.fill + '" stroke="#1A1A1A" stroke-width="' + m.stroke.toFixed(2) + '" ' +
        'paint-order="stroke" stroke-linejoin="round" font-weight="800" ' +
        'font-family="Arial Black, Arial, Helvetica, sans-serif" font-size="' + m.font.toFixed(2) + '">' +
        text + "</text></svg>";
    }
    var cls = "die-face" + (m.small ? " die-sm" : "");
    return '<span class="' + cls + '" data-sides="' + n + '" style="width:' + m.px + "px;height:" + m.px + 'px">' +
      '<img src="' + src(n) + '" alt="d' + n + '">' + svg + "</span>";
  }
  function iconHtml(sides, number) {
    var html = faceHtml(sides, number, 36);
    if (!html) return "";
    return html.replace('class="die-face', 'class="die-face die-inline');
  }
  function paint(el, sides, number) {
    if (!el) return "";
    el.innerHTML = faceHtml(sides, number, 168);
    return el.innerHTML;
  }
  function parseFaces(blob, spec) {
    var text = String(blob || "");
    var paren = text.match(/\(([^)]+)\)/);
    var body = paren ? paren[1] : text;
    var parts = body.split("+").map(function (s) {
      return String(s).replace(/<[^>]+>/g, "").trim();
    }).filter(function (s) { return /^\d+$/.test(s); });
    if (!parts.length || !spec) return parts.map(Number);
    var count = spec.count || 1;
    var mod = spec.mod ? Math.abs(parseInt(spec.mod, 10)) : 0;
    if (mod && parts.length > count && Number(parts[parts.length - 1]) === mod) parts.pop();
    if (parts.length > count) parts = parts.slice(0, count);
    return parts.map(Number);
  }
  function facesOf(entry, spec, html) {
    var faces = [];
    if (entry && Array.isArray(entry.rolls) && entry.rolls.length) faces = entry.rolls.map(Number);
    else if (entry && Array.isArray(entry.faces) && entry.faces.length) faces = entry.faces.map(Number);
    faces = faces.filter(function (n) { return isFinite(n); });
    if (!faces.length && entry && entry.detail) faces = parseFaces(entry.detail, spec);
    if (!faces.length && html && spec) faces = parseFaces(html, spec);
    if (!faces.length && spec && spec.count === 1) {
      var one = faceFrom(entry, spec);
      if (one != null) faces = [one];
    }
    return faces.filter(function (n) { return isFinite(n); });
  }
  var SHOW_MAX = 4;
  /* Up to 4 dice inline. More than that: the first 3, then a "+N" chip that expands on tap. */
  function groupHtml(dice) {
    if (!dice || !dice.length) return "";
    if (dice.length <= SHOW_MAX) return dice.map(function (d) { return iconHtml(d.sides, d.face); }).join("");
    var keep = SHOW_MAX - 1;
    return '<span class="die-group">' + dice.map(function (d, i) {
      var html = iconHtml(d.sides, d.face);
      return i < keep ? html : html.replace('class="die-face', 'class="die-face die-extra');
    }).join("") + '<button type="button" class="die-more" data-die-more title="Show all dice">+' + (dice.length - keep) + "</button></span>";
  }
  function iconsFor(sides, faces) {
    if (!faces || !faces.length) return iconHtml(sides);
    return groupHtml(faces.map(function (n) { return { sides: sides, face: n }; }));
  }
  /* "2d6+1d4+1" -> terms [{count:2,sides:6},{count:1,sides:4}], mod 1 */
  function poolOf(formula) {
    var text = String(formula || "");
    var terms = [];
    var re = /(\d*)d(4|6|8|10|12|20|50|100)(?![0-9])/gi;
    var m;
    while ((m = re.exec(text))) terms.push({ count: Math.max(1, parseInt(m[1] || "1", 10) || 1), sides: Number(m[2]) });
    var rest = text.replace(re, "");
    var mod = 0;
    (rest.match(/[+-]\s*\d+/g) || []).forEach(function (t) { mod += parseInt(t.replace(/\s+/g, ""), 10) || 0; });
    return { terms: terms, mod: mod };
  }
  function formulaOf(terms, mod) {
    var out = (terms || []).filter(function (t) { return t && t.count > 0 && known(t.sides); })
      .map(function (t) { return t.count + "d" + t.sides; }).join("+");
    if (!out) out = "1d20";
    mod = Number(mod) || 0;
    if (mod > 0) out += "+" + mod;
    if (mod < 0) out += String(mod);
    return out;
  }
  function rollPool(terms, mod, rng) {
    var dice = [];
    (terms || []).forEach(function (t) {
      var count = Math.max(0, Math.min(100, Number(t.count) || 0));
      for (var i = 0; i < count; i++) dice.push({ sides: Number(t.sides), face: roll(t.sides, rng).face });
    });
    if (!dice.length) dice.push({ sides: 20, face: roll(20, rng).face });
    mod = Number(mod) || 0;
    var sum = dice.reduce(function (a, d) { return a + d.face; }, 0) + mod;
    var faces = dice.map(function (d) { return d.face; });
    var detail = faces.join(" + ") + (mod > 0 ? " + " + mod : mod < 0 ? " - " + Math.abs(mod) : "");
    return {
      sides: dice[0].sides,
      face: dice[0].face,
      faces: faces,
      dice: dice,
      mod: mod,
      total: sum,
      result: sum,
      detail: detail,
      formula: formulaOf(terms, mod),
      pool: true
    };
  }
  function diceFromEntry(entry, html) {
    if (entry && Array.isArray(entry.dice) && entry.dice.length && entry.dice[0] && entry.dice[0].sides) {
      return entry.dice.map(function (d) { return { sides: Number(d.sides), face: d.face == null ? null : Number(d.face) }; });
    }
    var pool = poolOf(entry && entry.formula);
    if (pool.terms.length < 2) return null;
    var total = pool.terms.reduce(function (a, t) { return a + t.count; }, 0);
    var faces = [];
    if (entry && Array.isArray(entry.rolls) && entry.rolls.length === total) faces = entry.rolls.map(Number);
    else if (entry && entry.detail) faces = parseFaces(entry.detail, { count: total, mod: pool.mod ? String(pool.mod) : "" });
    if (faces.length !== total) faces = [];
    var out = [];
    var k = 0;
    pool.terms.forEach(function (t) {
      for (var i = 0; i < t.count; i++) out.push({ sides: t.sides, face: faces.length ? faces[k++] : null });
    });
    return out;
  }
  /* 0.3.59 chat totals: attack and damage cards show every die face as a die icon and
     the FINAL numbers as gold-ringed badges.
       "d20 «14» · DEX +3 = 19 vs AC 15 → HIT"  -> [d20 14] · DEX +3 = (19) vs AC 15 → HIT
       "Damage: d8 «1» +2 (DEX) = 3 piercing"   -> Damage: d8 [d8 1] +2 (DEX) = (3) piercing
     A run of faces after "NdS" ("2d6 «4» «5»", or "d20 8 / «17»" for advantage) becomes icons;
     the used advantage face keeps a ring. */
  var CARD_LINE = /→\s*(HIT|MISS|CRIT|misfire)\b/i;
  var ADV_RUN = /\bd20\s+(?:«\d+»|\d+)\s*\/\s*(?:«\d+»|\d+)/;
  /* "d20 5 / «14»": both faces, the kept one in « ». One face stays a plain number. */
  function advRun(faces, kept) {
    faces = (faces || []).map(Number);
    if (faces.length < 2) return String(kept != null ? kept : faces[0]);
    var marked = false;
    return "d20 " + faces.map(function (n) { if (!marked && n === Number(kept)) { marked = true; return "«" + n + "»"; } return String(n); }).join(" / ");
  }
  function totalBadge(n, cls) { return '<span class="roll-total' + (cls ? " " + cls : "") + '">' + n + "</span>"; }
  function faceRun(html) {
    return html.replace(/(^|[\s>(:·])(\d*)d(4|6|8|10|12|20|50|100)\s+((?:«\d+»|\d+)(?:\s*(?:\/|\s)\s*(?:«\d+»|\d+))*)(?=$|[\s<·)+=-])/g,
      function (all, lead0, count, sides, run) {
        if (run.indexOf("«") < 0) return all;
        var bits = run.split(/\s*\/\s*|\s+/).filter(Boolean);
        /* 0.3.63: advantage / disadvantage. Both d20s show; the kept one gets a green (adv) or red (dis) ring,
           the dropped one a thin faint red X that leaves its number readable. The mode is read from the faces
           (kept = highest -> adv, lowest -> dis); a tie falls back to the line's own wording. */
        var pair = bits.length > 1 && Number(sides) === 20;
        var nums = bits.map(function (b) { return Number(b.replace(/[«»]/g, "")); });
        var keptAt = -1;
        bits.forEach(function (b, k) { if (keptAt < 0 && b.indexOf("«") >= 0) keptAt = k; });
        var mode = "adv";
        if (pair && keptAt >= 0) {
          var hi = Math.max.apply(null, nums), lo = Math.min.apply(null, nums), kv = nums[keptAt];
          if (hi === lo) mode = /disadvantage/i.test(String(html)) ? "dis" : "adv";
          else mode = kv === lo ? "dis" : "adv";
        }
        var icons = bits.map(function (b, k) {
          var icon = iconHtml(Number(sides), nums[k]);
          if (!pair || keptAt < 0) return icon;
          if (k === keptAt) return '<span class="die-used die-kept ' + mode + '" title="kept (' + (mode === "dis" ? "disadvantage" : "advantage") + ')">' + icon + "</span>";
          return '<span class="die-dropped" title="dropped">' + icon + "</span>";
        }).join("");
        return lead0 + (count || "") + "d" + sides + " " + icons;
      });
  }
  function cardBadges(html) {
    html = String(html || "");
    if (html.indexOf("roll-total") >= 0) return html; /* also covers roll-total-atk */
    var parts = html.split(/(\n|<br\s*\/?>)/);
    var whole = parts.join("");
    var isCard = CARD_LINE.test(whole) || /^\s*Damage(?: \(crit\))?:/m.test(whole) || /(^|\n|<br\s*\/?>)\s*Damage(?: \(crit\))?:/.test(whole);
    /* 0.3.63: checks, saves, initiative, contests and spell beams/rays write advantage as "d20 5 / «14»" too */
    if (!isCard) return ADV_RUN.test(whole) ? faceRun(html) : html;
    var verdict = (whole.match(CARD_LINE) || [])[1] || "";
    var v = verdict.toUpperCase();
    var tone = v === "CRIT" ? "crit" : (v === "MISS" || v === "MISFIRE" ? "miss" : "");
    return parts.map(function (line) {
      if (/^(\n|<br)/.test(line)) return line;
      if (CARD_LINE.test(line) || /\bd20\b/.test(line)) {
        line = faceRun(line);
        /* 0.3.60: the attack total is plain text in the d20 face colour (no ring); only damage gets the badge */
        return line.replace(/=\s*(-?\d+)(?=\s*(?:vs\b|→|\(|$|<))/, function (m, n) { return '= <span class="roll-total-atk' + (tone ? " " + tone : "") + '">' + n + "</span>"; });
      }
      if (/^\s*Damage/.test(line.replace(/<[^>]+>/g, ""))) {
        line = faceRun(line);
        return line.replace(/=\s*(-?\d+)(?![\d])/, function (m, n) { return "= " + totalBadge(n, "dmg" + (tone === "crit" ? " crit" : "")); });
      }
      return line;
    }).join("");
  }
  function decorate(html) {
    html = cardBadges(String(html || ""));
    if (!html || html.indexOf("die-face") >= 0 || html.indexOf("die-inline") >= 0) return html;
    return html.replace(/(\d*)d(4|6|8|10|12|20|50|100)(?![0-9])([+-]\d+)?/i, function (formula, count, sides, mod) {
      var spec = { count: Math.max(1, parseInt(count || "1", 10) || 1), sides: Number(sides), mod: mod || "" };
      var faces = parseFaces(html, spec);
      if (faces.length !== spec.count) faces = [];
      return iconsFor(spec.sides, faces) + formula;
    });
  }
  /* 0.3.78: an older DMCC wrote one plain die as "d4 1d4 = 4 (4)" (label echo + repeated face).
     Tidy it to "1d4 = 4". Anything with a modifier, several dice, or a real label is left alone. */
  function tidyCore(s) {
    var m = s.match(/^\s*(?:(?:Roll|1?d(\d+))(?:\s*·)?\s+)?1?d(4|6|8|10|12|20|50|100) = (-?\d+)(?: \((-?\d+)\))?\s*$/i);
    if (!m) return null;
    if (m[1] && m[1] !== m[2]) return null;
    if (m[4] != null && m[4] !== m[3]) return null;
    return "1d" + m[2] + " = " + m[3];
  }
  /* 0.3.80: also after a speaker ("Ada: d4 1d4 = 3 (3)" -> "Ada: 1d4 = 3"), as the map chat shows player rolls */
  function tidySingle(text) {
    var s = String(text == null ? "" : text);
    var whole = tidyCore(s);
    if (whole != null) return whole;
    var m = s.match(/^([\s\S]*?(?::|·)\s+)([^:·]*(?:·\s+)?[^:·]*)$/);
    if (!m) return s;
    var core = tidyCore(m[2]);
    return core == null ? s : m[1] + core;
  }
  function lead(entry, html) {
    html = cardBadges(String(html || ""));
    if (html.indexOf("die-face") >= 0 || html.indexOf("die-inline") >= 0) return html;
    var mixed = diceFromEntry(entry, html);
    if (mixed && mixed.length) {
      var icons0 = groupHtml(mixed);
      var f0 = String((entry && entry.formula) || "");
      if (f0 && html.indexOf(f0) >= 0) return html.replace(f0, icons0 + f0);
      return icons0 + " " + html;
    }
    var attack = entry && (entry.attack || /attack/i.test(String(entry.label || "")));
    var terms = poolOf(html).terms;
    if (terms.length > 1 && !(entry && entry.formula && poolOf(entry.formula).terms.length > 1)) {
      /* e.g. "1d20+1 · 1d4+1": one icon per term so every die shows. */
      var first = specOf((entry && entry.formula) || "");
      var used = false;
      return html.replace(/(\d*)d(4|6|8|10|12|20|50|100)(?![0-9])([+-]\d+)?/gi, function (formula, count, sides) {
        var sp = { count: Math.max(1, parseInt(count || "1", 10) || 1), sides: Number(sides) };
        var faces = [];
        if (!used && first && first.sides === sp.sides && first.count === sp.count) { faces = facesOf(entry, first, ""); used = true; }
        return iconsFor(sp.sides, faces.length === sp.count ? faces : []) + formula;
      });
    }
    var spec = specOf((entry && entry.formula) || html);
    if (attack && spec && spec.sides === 20 && !sidesOf(html)) return iconsFor(20, facesOf(entry, spec, html)) + html;
    if (spec && (sidesOf(html) || (entry && entry.formula))) {
      var faces = facesOf(entry, spec, html);
      var icons = iconsFor(spec.sides, faces);
      var re = new RegExp("(\\d*)d" + spec.sides + "(?![0-9])", "i");
      if (re.test(html)) return html.replace(re, icons + "$&");
      return icons + " " + html;
    }
    if (sidesOf(html)) return decorate(html);
    var fromFormula = sidesOf(entry && entry.formula);
    if (fromFormula) return iconHtml(fromFormula) + " " + html;
    return html;
  }
  function roll(sides, rng) {
    var n = Number(sides);
    if (!known(n)) n = 20;
    var unit = typeof rng === "function" ? Number(rng()) : Math.random();
    if (!isFinite(unit)) unit = Math.random();
    var face = 1 + Math.floor(unit * n);
    if (n === 20 && typeof rng !== "function" && root.SSDNSTestRoll) {
      var forced = Number(root.SSDNSTestRoll());
      if (forced >= 1 && forced <= 20) face = forced;
    }
    if (face < 1) face = 1;
    if (face > n) face = n;
    return { sides: n, face: face, total: face, result: face, formula: "1d" + n };
  }
  function faceFrom(entry, spec) {
    if (!entry || !spec) return null;
    if (entry.face != null && isFinite(Number(entry.face))) return Number(entry.face);
    if (spec.count === 1 && entry.nat != null && spec.sides === 20 && entry.nat >= 1 && entry.nat <= 20) return Number(entry.nat);
    if (Array.isArray(entry.rolls) && entry.rolls.length === 1 && spec.count === 1) return Number(entry.rolls[0]);
    var blob = String(entry.detail || entry.text || "");
    var paren = blob.match(/\((\d+)/);
    if (spec.count === 1 && paren) {
      var shown = Number(paren[1]);
      if (shown >= 1 && shown <= spec.sides) return shown;
    }
    if (spec.count === 1 && !spec.mod && entry.result != null && entry.result >= 1 && entry.result <= spec.sides) return Number(entry.result);
    /* 0.3.78: a plain "1d4 = 4" line (no modifier) has its face as the total */
    if (spec.count === 1 && !spec.mod) {
      var plain = blob.match(new RegExp("(?:^|[\\s>:·])1?d" + spec.sides + " = (\\d+)\\s*$"));
      if (plain && Number(plain[1]) >= 1 && Number(plain[1]) <= spec.sides) return Number(plain[1]);
    }
    return null;
  }
  /* 0.3.80: where a roll shows. A bar with its own inline stage (the map's dice lane) shows its rolls there.
     In map full screen the page tray is covered, so every roll (bar, sheet buttons, chat) goes to the map lane. */
  function visibleInline(doc) {
    var list = doc.querySelectorAll(".dice-stage-inline");
    for (var i = 0; i < list.length; i++) {
      var bar = list[i].parentElement;
      if (bar && bar.getClientRects && bar.getClientRects().length) return list[i];
    }
    return null;
  }
  function stageNode(src) {
    var doc = root.document;
    if (!doc) return null;
    var own = src && src.querySelector ? src.querySelector(".dice-stage-inline") : null;
    if (own) return own;
    if (doc.body && doc.body.classList && doc.body.classList.contains("map-fullscreen")) {
      var lane = visibleInline(doc);
      if (lane) return lane;
    }
    return doc.getElementById("diceStage");
  }
  function show(info, src) {
    info = info || {};
    var doc = root.document;
    var stage = stageNode(src);
    if (!doc || !stage) return info;
    var sides = Number(info.sides) || sidesOf(info.formula) || 20;
    stage.hidden = false;
    var list = Array.isArray(info.dice) && info.dice.length ? info.dice : null;
    var faces = Array.isArray(info.faces) && info.faces.length ? info.faces : [info.face];
    // 0.3.54: one locked die size (the 7-dice size). More dice wrap; nothing shrinks.
    var px = LOCKED_PX;
    var parts = list ? list.map(function (d) { return faceHtml(d.sides, d.face, px); })
      : faces.map(function (n) { return faceHtml(sides, n, px); });
    stage.innerHTML = parts.join("") +
      '<p class="dice-stage-line"></p>';
    var line = stage.querySelector(".dice-stage-line");
    if (line) {
      var formula = info.formula || ("1d" + sides);
      var total = info.total != null ? info.total : info.result;
      line.textContent = formula + (total == null || total === "" ? "" : " = " + total);
    }
    return info;
  }
  function showRoll(entry) {
    if (!entry) return null;
    var spec = specOf(entry.formula || entry.text || "");
    if (!spec) return null;
    var faces = facesOf(entry, spec, entry.text || "");
    var mixed = diceFromEntry(entry, entry.text || "");
    return show({
      dice: mixed && mixed.length ? mixed : null,
      sides: spec.sides,
      face: faces.length === 1 ? faces[0] : faceFrom(entry, spec),
      faces: faces.length > 1 ? faces : null,
      formula: entry.formula || ((spec.count || 1) + "d" + spec.sides),
      total: entry.result,
      label: entry.label
    });
  }
  function barHtml() {
    return '<div class="dice-bar-row" role="group" aria-label="Dice">' + SIDES.map(function (n) {
      return '<button type="button" class="dice-bar-btn" data-die="' + n + '" aria-label="Roll d' + n + '" title="Click: roll. Shift-click or long-press: add to pool">' +
        faceHtml(n, n, 40) + "</button>";
    }).join("") + "</div>" + builderHtml();
  }
  function builderHtml() {
    return '<div class="dice-builder" role="group" aria-label="Roll builder">' +
      '<span class="dice-step" title="How many dice">×<button type="button" data-dice-step="count" data-delta="-1" aria-label="Fewer dice">▼</button>' +
      '<output data-dice-count>1</output><button type="button" data-dice-step="count" data-delta="1" aria-label="More dice">▲</button></span>' +
      '<span class="dice-step" title="Modifier">+<button type="button" data-dice-step="mod" data-delta="-1" aria-label="Lower modifier">▼</button>' +
      '<output data-dice-mod>0</output><button type="button" data-dice-step="mod" data-delta="1" aria-label="Raise modifier">▲</button></span>' +
      '<span class="dice-pool" data-dice-pool hidden><span data-dice-pool-text></span>' +
      '<button type="button" class="dice-pool-roll" data-dice-pool-roll>Roll</button>' +
      '<button type="button" class="dice-pool-clear" data-dice-pool-clear aria-label="Clear pool">✕</button></span>' +
      "</div>";
  }
  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
  function builderOf(el) {
    if (!el._ssdnsBuilder) el._ssdnsBuilder = { count: 1, mod: 0, pool: [] };
    return el._ssdnsBuilder;
  }
  function paintBuilder(el) {
    var b = builderOf(el);
    var c = el.querySelector("[data-dice-count]");
    var m = el.querySelector("[data-dice-mod]");
    if (c) c.textContent = String(b.count);
    if (m) m.textContent = b.mod >= 0 ? String(b.mod) : "−" + Math.abs(b.mod);
    var pool = el.querySelector("[data-dice-pool]");
    var text = el.querySelector("[data-dice-pool-text]");
    if (pool) pool.hidden = !b.pool.length;
    if (text) text.textContent = b.pool.length ? formulaOf(b.pool, b.mod) : "";
  }
  function addToPool(el, sides) {
    var b = builderOf(el);
    var hit = null;
    b.pool.forEach(function (t) { if (t.sides === sides) hit = t; });
    if (hit) hit.count = clamp(hit.count + b.count, 1, 100);
    else b.pool.push({ sides: sides, count: b.count });
    paintBuilder(el);
  }
  function singleD20(rolled) {
    if (!rolled || Number(rolled.sides) !== 20) return false;
    if (rolled.pool && rolled.pool.length) return false;
    if (rolled.dice && rolled.dice.length > 1) return false;
    if (rolled.faces && rolled.faces.length > 1) return false;
    var face = Number(rolled.face);
    return face >= 1 && face <= 20;
  }
  function fire(rolled, el) {
    var Zoom = root.SSDNSD20Zoom;
    if (singleD20(rolled) && Zoom && typeof Zoom.present === "function" && typeof Zoom.pose === "function") {
      var id = rolled.id || ("d20_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6));
      rolled.id = id;
      var pose = Zoom.pose({ nat: rolled.face, id: id, critMin: 20 });
      rolled.die = pose && pose.kind === "plain" ? pose : null;
      rolled.nat = rolled.face;
      rolled.crit = !!(pose && pose.kind === "crit");
      rolled.dieHold = true;
      show({ sides: 20, face: "", formula: "1d20", total: "" }, el);
      if (typeof api.onBarRoll === "function") api.onBarRoll(rolled);
      var done = Zoom.present(pose);
      var paint = function () { show(rolled, el); };
      if (done && typeof done.then === "function") done.then(paint, paint);
      else paint();
      return rolled;
    }
    show(rolled, el);
    if (typeof api.onBarRoll === "function") api.onBarRoll(rolled);
    return rolled;
  }
  function rollFromBar(el, sides) {
    var b = builderOf(el);
    if (b.count === 1 && b.mod === 0) return fire(roll(sides), el);
    return fire(rollPool([{ sides: sides, count: b.count }], b.mod), el);
  }
  function rollPoolFromBar(el) {
    var b = builderOf(el);
    if (!b.pool.length) return null;
    var out = fire(rollPool(b.pool, b.mod), el);
    b.pool = [];
    paintBuilder(el);
    return out;
  }
  function mount(el) {
    if (!el) return;
    el.classList.add("dice-bar");
    el.innerHTML = barHtml() + (el.classList.contains("dice-bar-map") || el.hasAttribute("data-dice-inline")
      ? '<div class="dice-stage dice-stage-inline" data-dice-inline-stage aria-live="polite" hidden></div>' : "");
    paintBuilder(el);
    if (el.getAttribute("data-dice-wired") === "1") return;
    el.setAttribute("data-dice-wired", "1");
    var press = null;
    el.addEventListener("pointerdown", function (e) {
      var btn = e.target && e.target.closest ? e.target.closest("[data-die]") : null;
      if (!btn || e.pointerType === "mouse") return;
      var sides = Number(btn.getAttribute("data-die"));
      press = { btn: btn, fired: false, t: setTimeout(function () {
        if (!press) return;
        press.fired = true;
        addToPool(el, sides);
      }, 450) };
    });
    function endPress() { if (press && !press.fired) { clearTimeout(press.t); press = null; } }
    el.addEventListener("pointerup", endPress);
    el.addEventListener("pointercancel", function () { if (press) clearTimeout(press.t); press = null; });
    el.addEventListener("contextmenu", function (e) {
      if (e.target && e.target.closest && e.target.closest("[data-die]")) e.preventDefault();
    });
    el.addEventListener("click", function (e) {
      var t = e.target && e.target.closest ? e.target : null;
      if (!t) return;
      var step = t.closest("[data-dice-step]");
      if (step && el.contains(step)) {
        var b = builderOf(el);
        var d = Number(step.getAttribute("data-delta")) || 0;
        if (step.getAttribute("data-dice-step") === "count") b.count = clamp(b.count + d, 1, 20);
        else b.mod = clamp(b.mod + d, -20, 20);
        paintBuilder(el);
        return;
      }
      if (t.closest("[data-dice-pool-roll]")) { rollPoolFromBar(el); return; }
      if (t.closest("[data-dice-pool-clear]")) { builderOf(el).pool = []; paintBuilder(el); return; }
      var btn = t.closest("[data-die]");
      if (!btn || !el.contains(btn)) return;
      var sides = Number(btn.getAttribute("data-die"));
      if (!known(sides)) return;
      if (press && press.fired && press.btn === btn) { press = null; return; }
      press = null;
      if (e.shiftKey) { addToPool(el, sides); return; }
      rollFromBar(el, sides);
    });
  }
  /* Tap "+N" in any chat or log line to show every die. */
  if (root.document && root.document.addEventListener) {
    root.document.addEventListener("click", function (e) {
      var more = e.target && e.target.closest ? e.target.closest("[data-die-more]") : null;
      if (!more) return;
      var group = more.closest(".die-group");
      if (group) group.classList.toggle("die-open");
    });
  }
  function bootBars() {
    var doc = root.document;
    if (!doc) return;
    var bars = doc.querySelectorAll("[data-dice-bar]");
    for (var i = 0; i < bars.length; i++) mount(bars[i]);
  }

  var api = {
    sides: function () { return SIDES.slice(); },
    src: src,
    iconHtml: iconHtml,
    faceHtml: faceHtml,
    paint: paint,
    decorate: decorate,
    lead: lead,
    tidySingle: tidySingle,
    cardBadges: cardBadges,
    advRun: advRun,
    roll: roll,
    rollPool: rollPool,
    poolOf: poolOf,
    formulaOf: formulaOf,
    groupHtml: groupHtml,
    addToPool: addToPool,
    rollPoolFromBar: rollPoolFromBar,
    show: show,
    showRoll: showRoll,
    barHtml: barHtml,
    mount: mount,
    onBarRoll: null
  };
  root.SSDNSDice = api;
  if (root.document) {
    if (root.document.readyState === "loading") root.document.addEventListener("DOMContentLoaded", bootBars);
    else bootBars();
  }
})(typeof window !== "undefined" ? window : globalThis);

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
  /* Face centers and font sizes in a 512px viewBox. */
  var CENTER_Y = { 4: 320, 8: 180 };
  var FONT_AT_512 = { 4: 150, 6: 220, 8: 110, 10: 150, 12: 140, 20: 100, 50: 130, 100: 120 };

  function prefix() {
    try {
      var path = (root.location && root.location.pathname) || "";
      if (path.indexOf("/dm/") >= 0) return "../";
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
      y: CENTER_Y[n] || 256,
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
  function iconsFor(sides, faces) {
    if (!faces || !faces.length) return iconHtml(sides);
    return faces.map(function (n) { return iconHtml(sides, n); }).join("");
  }
  function decorate(html) {
    html = String(html || "");
    if (!html || html.indexOf("die-face") >= 0 || html.indexOf("die-inline") >= 0) return html;
    return html.replace(/(\d*)d(4|6|8|10|12|20|50|100)(?![0-9])([+-]\d+)?/i, function (formula, count, sides, mod) {
      var spec = { count: Math.max(1, parseInt(count || "1", 10) || 1), sides: Number(sides), mod: mod || "" };
      var faces = parseFaces(html, spec);
      if (faces.length !== spec.count) faces = [];
      return iconsFor(spec.sides, faces) + formula;
    });
  }
  function lead(entry, html) {
    html = String(html || "");
    if (html.indexOf("die-face") >= 0 || html.indexOf("die-inline") >= 0) return html;
    var attack = entry && (entry.attack || /attack/i.test(String(entry.label || "")));
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
    return null;
  }
  function stageNode() {
    var doc = root.document;
    if (!doc) return null;
    return doc.getElementById("diceStage");
  }
  function show(info) {
    info = info || {};
    var doc = root.document;
    var stage = stageNode();
    if (!doc || !stage) return info;
    var sides = Number(info.sides) || sidesOf(info.formula) || 20;
    stage.hidden = false;
    var faces = Array.isArray(info.faces) && info.faces.length ? info.faces : [info.face];
    stage.innerHTML = faces.map(function (n) { return faceHtml(sides, n, 168); }).join("") +
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
    return show({
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
      return '<button type="button" class="dice-bar-btn" data-die="' + n + '" aria-label="Roll d' + n + '">' +
        faceHtml(n, n, 40) + "</button>";
    }).join("") + "</div>";
  }
  function mount(el) {
    if (!el) return;
    el.classList.add("dice-bar");
    el.innerHTML = barHtml();
    if (el.getAttribute("data-dice-wired") === "1") return;
    el.setAttribute("data-dice-wired", "1");
    el.addEventListener("click", function (e) {
      var btn = e.target && e.target.closest ? e.target.closest("[data-die]") : null;
      if (!btn || !el.contains(btn)) return;
      var sides = Number(btn.getAttribute("data-die"));
      if (!known(sides)) return;
      var rolled = roll(sides);
      show(rolled);
      if (typeof api.onBarRoll === "function") api.onBarRoll(rolled);
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
    roll: roll,
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

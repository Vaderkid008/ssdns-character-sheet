/* Art dice for the sheet, the DM Command Center, and the map.
   The rolled number is drawn over the face. Chat keeps a small icon. */
(function (root) {
  "use strict";

  var SIDES = [4, 6, 8, 10, 12, 20, 50, 100];

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
  function iconHtml(sides) {
    var n = Number(sides);
    if (!known(n)) return "";
    return '<img class="die-inline" src="' + src(n) + '" alt="" width="18" height="18">';
  }
  function faceHtml(sides, number) {
    var n = Number(sides);
    if (!known(n)) return "";
    var num = number == null || number === "" || !isFinite(Number(number))
      ? ""
      : '<span class="die-num">' + String(Number(number)) + "</span>";
    return '<span class="die-face" data-sides="' + n + '"><img src="' + src(n) + '" alt="d' + n + '">' + num + "</span>";
  }
  function paint(el, sides, number) {
    if (!el) return "";
    el.innerHTML = faceHtml(sides, number);
    return el.innerHTML;
  }
  function decorate(html) {
    html = String(html || "");
    if (!html || html.indexOf("die-inline") >= 0) return html;
    return html.replace(/(^|[^a-z0-9>])(\d*)d(4|6|8|10|12|20|50|100)(?![0-9])/i, function (_m, pre, count, sides) {
      return pre + iconHtml(Number(sides)) + (count || "") + "d" + sides;
    });
  }
  function lead(entry, html) {
    html = String(html || "");
    if (html.indexOf("die-inline") >= 0) return html;
    var attack = entry && (entry.attack || /attack/i.test(String(entry.label || "")));
    var spec = specOf(entry && entry.formula);
    if (attack && spec && spec.sides === 20 && !sidesOf(html)) return iconHtml(20) + html;
    if (sidesOf(html)) return decorate(html);
    if (spec) return iconHtml(spec.sides) + " " + html;
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
    stage.innerHTML = faceHtml(sides, info.face) +
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
    return show({
      sides: spec.sides,
      face: faceFrom(entry, spec),
      formula: entry.formula || ((spec.count || 1) + "d" + spec.sides),
      total: entry.result,
      label: entry.label
    });
  }
  function barHtml() {
    return '<div class="dice-bar-row" role="group" aria-label="Dice">' + SIDES.map(function (n) {
      return '<button type="button" class="dice-bar-btn" data-die="' + n + '" aria-label="Roll d' + n + '">' +
        '<img src="' + src(n) + '" alt="">' +
        "<span>d" + n + "</span></button>";
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

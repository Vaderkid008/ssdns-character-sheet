/* 0.3.52: big volume sliders. Wraps every music/ambient/sfx volume range with
   -/+ buttons (5% steps) and a live % readout. Works on the sheet and in DMCC. */
(function (root) {
  "use strict";
  var SEL = "input[type=range][data-mx-level], input[type=range][data-mx-pref], input[type=range][data-sfx-volume]";
  var STEP = 5;
  function pct(input) { return Math.round(Number(input.value) || 0) + "%"; }
  function fire(input) {
    ["input", "change"].forEach(function (t) {
      var e; try { e = new root.Event(t, { bubbles: true }); } catch (x) { e = root.document.createEvent("Event"); e.initEvent(t, true, true); }
      input.dispatchEvent(e);
    });
  }
  function nudge(input, dir) {
    var min = Number(input.min || 0), max = Number(input.max || 100);
    var v = Math.max(min, Math.min(max, Math.round((Number(input.value) || 0) / STEP) * STEP + dir * STEP));
    input.value = String(v);
    fire(input);
    paint(input);
    return v;
  }
  function paint(input) {
    var w = input.closest && input.closest(".vol-slider");
    var out = w && w.querySelector(".vol-pct");
    if (out && out.textContent !== pct(input)) out.textContent = pct(input);
    var min = Number(input.min || 0), max = Number(input.max || 100);
    input.style.setProperty("--vol-fill", ((Number(input.value) - min) / ((max - min) || 1) * 100) + "%");
  }
  function wrap(input) {
    if (!input || input.getAttribute("data-vol-wrapped")) return;
    input.setAttribute("data-vol-wrapped", "1");
    if (!input.step || input.step === "any") input.step = "1";
    var doc = root.document;
    var box = doc.createElement("span");
    box.className = "vol-slider";
    var label = input.getAttribute("aria-label") || "volume";
    var minus = doc.createElement("button"); minus.type = "button"; minus.className = "vol-step vol-minus"; minus.textContent = "−"; minus.setAttribute("aria-label", "Lower " + label + " 5%");
    var plus = doc.createElement("button"); plus.type = "button"; plus.className = "vol-step vol-plus"; plus.textContent = "+"; plus.setAttribute("aria-label", "Raise " + label + " 5%");
    var out = doc.createElement("output"); out.className = "vol-pct"; out.setAttribute("aria-live", "off");
    input.parentNode.insertBefore(box, input);
    box.appendChild(minus); box.appendChild(input); box.appendChild(plus); box.appendChild(out);
    minus.addEventListener("click", function () { nudge(input, -1); });
    plus.addEventListener("click", function () { nudge(input, 1); });
    input.addEventListener("input", function () { paint(input); });
    paint(input);
  }
  function scan() {
    if (!root.document) return;
    Array.prototype.forEach.call(root.document.querySelectorAll(SEL), function (el) { wrap(el); paint(el); });
  }
  if (root.document) {
    if (root.document.readyState === "loading") root.document.addEventListener("DOMContentLoaded", scan); else scan();
    /* Other code sets .value directly (saved prefs, DM pushes), so keep the readout honest. */
    if (root.setInterval) root.setInterval(scan, 700);
  }
  root.SSDNSVolSlider = { wrap: wrap, nudge: nudge, scan: scan, STEP: STEP };
})(typeof window !== "undefined" ? window : globalThis);

/* d20 spin (sheet 0.3.172).
   Ordinary rolls (sheet d20, DM tray, attacks, skills): a normal spin. The face
   number is on the die while it tumbles (~0.9s) and locks at the end. No blank
   hold, no long suspense, no gold Love-it ring, no CRITICAL / FAIL.
   The reserved show is only for a gold Challenge roll (fancy / suspense):
   blank until the number stamps (~1.05s), and nat 20 / nat 1 stay blank 2–3×
   longer before d20-zoom.js plays forge / FAIL. This file does not draw
   CRITICAL, FAIL, forge, or crack. Map Effects off and reduced motion skip to
   the landed number. Tap, Esc, Space, or Enter mid-spin does the same. */
(function (root) {
  "use strict";

  var FAST = 1.05;
  var NORMAL = 0.9;
  var D_DEFAULT = 4;
  var LAND_AT = 2.85;
  var HOLD_AFTER = 0.7;
  var seen = {};
  var openSkip = null;

  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function lerp(a, b, k) { return a + (b - a) * k; }
  function effectsOn() {
    var Z = root.SSDNSD20Zoom;
    if (Z && typeof Z.effectsOn === "function") return !!Z.effectsOn();
    var FX = root.SSDNSMapFx;
    if (FX && typeof FX.enabled === "function") return !!FX.enabled();
    try { return root.localStorage.getItem("ssdns.map.fx") !== "0"; } catch (e) { return true; }
  }
  function reducedMotion() {
    var Z = root.SSDNSD20Zoom;
    if (Z && typeof Z.reducedMotion === "function") return !!Z.reducedMotion();
    try {
      return !!(root.matchMedia && root.matchMedia("(prefers-reduced-motion: reduce)").matches);
    } catch (e) { return false; }
  }

  function seg(t, a, b) { return clamp((t - a) / (b - a), 0, 1); }
  function eio(k) { return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; }
  function eoc(k) { return 1 - Math.pow(1 - k, 3); }
  function eiq(k) { return k * k; }
  function mix(a, b, k) {
    k = clamp(k, 0, 1);
    return [0, 1, 2].map(function (i) { return Math.round(lerp(a[i], b[i], k)); });
  }
  /* Die curves from the 4s C2 ref (same beat for plain, crit C2, and FAIL C2).
     Plain keeps the number off until land. FAIL C2's extra look is c2FailLook. */
  function c2Motion(t, k, dir) {
    var os = 2.1 * k;
    var peak = 2.62 * k;
    var land = LAND_AT * k;
    var u = clamp((land > 0 ? t / land : 1), 0, 1);
    var rot = dir * 1800 * (1 - Math.pow(1 - u, 2.5));
    var scale = 0.3;
    var y = 0;
    if (t < os) scale = lerp(0.3, 0.86, eio(seg(t, 0, os)) * 0.85 + seg(t, 0, os) * 0.15);
    else if (t < peak) scale = lerp(0.86, 1.34, eoc(seg(t, os, peak)));
    else if (t < land) scale = lerp(1.34, 0.88, eiq(seg(t, peak, land)));
    else {
      var d = (t - land) / k;
      scale = 1 - 0.12 * Math.exp(-7 * d) * Math.cos(17 * d);
    }
    if (t < os) y = 0;
    else if (t < peak) y = -16 * eoc(seg(t, os, peak));
    else if (t < land) y = lerp(-16, 6, eiq(seg(t, peak, land)));
    else {
      var d2 = (t - land) / k;
      y = 6 * Math.exp(-8 * d2) * Math.cos(15 * d2);
    }
    var tb = t / k;
    var blur = tb < 1.5 ? lerp(9, 4, seg(tb, 0, 1.5)) : lerp(4, 0, eoc(seg(tb, 1.5, 2.45)));
    return { rot: rot, scale: scale, y: y, blur: Math.max(0, blur), land: land };
  }
  function c2Frame(t, spec) {
    spec = spec || {};
    var D = Number(spec.D);
    if (!isFinite(D) || D <= 0) D = D_DEFAULT;
    var k = D / D_DEFAULT;
    var dir = spec.dir === -1 ? -1 : 1;
    var value = spec.value != null ? spec.value : spec.nat;
    var motion = c2Motion(t, k, dir);
    var land = motion.land;
    var show = t >= land;
    var stampU = show ? clamp((t - land) / (0.34 * k), 0, 1) : 0;
    var stamp = 1 - Math.pow(1 - stampU, 3);
    var text = "";
    if (show && value != null && value !== "") text = String(value);
    return {
      t: t,
      D: D_DEFAULT * k,
      land: land,
      end: D_DEFAULT * k,
      rot: motion.rot,
      scale: motion.scale,
      y: motion.y,
      blur: motion.blur,
      showNum: show,
      text: text,
      numOpacity: show ? stamp : 0,
      numScale: show ? lerp(1.45, 1, stamp) : 1.45,
      spinning: t < land
    };
  }
  /* FAIL C2 twin. Same die curves. Land is B1 crack + B3 plum smoke, not forge.
     The 1 reads faint rose in the overshoot, then fades rose → bone-grey.
     Crack starts 0.04s after impact, five branches, 45ms apart, 0.26s each. */
  function ringAt(t, start, dur, s0, s1, op) {
    var rk = seg(t, start, start + dur);
    if (t < start || rk >= 1) return { opacity: 0, scale: s0 };
    var e = 1 - Math.pow(1 - rk, 2.6);
    return { opacity: op * (1 - rk), scale: lerp(s0, s1, e) };
  }
  function c2FailLook(t, spec) {
    spec = spec || {};
    var D = Number(spec.D);
    if (!isFinite(D) || D <= 0) D = D_DEFAULT;
    var k = D / D_DEFAULT;
    var dir = spec.dir === -1 ? -1 : 1;
    var motion = c2Motion(t, k, dir);
    var land = motion.land;
    var fade = 3.75 * k;
    var total = D_DEFAULT * k;
    var npre = seg(t, 2.25 * k, 2.7 * k) * 0.5;
    var numOpacity = npre;
    var numColor = "#b88a8e";
    var numScale = 1;
    if (t >= land) {
      var ne = eoc(seg(t, land, land + 0.3 * k));
      var fadeK = seg(t, land + 0.45 * k, fade);
      numOpacity = lerp(0.55, 1, ne);
      numColor = "rgb(" + mix([231, 160, 160], [196, 184, 170], fadeK * 0.8).join(",") + ")";
      numScale = lerp(1.1, 1, ne);
    }
    var cracks = [];
    for (var i = 0; i < 5; i++) {
      var st = land + (0.04 + i * 0.045) * k;
      var ck = eoc(seg(t, st, st + 0.26 * k));
      cracks.push(t < st ? 1 : 1 - ck);
    }
    var sagE = 1 - Math.pow(1 - seg(t, land + 0.12 * k, land + 0.82 * k), 2.2);
    var dull = eoc(seg(t, land, land + 0.5 * k));
    var shake = [0, 0];
    var sd = (t - land) / k;
    if (sd >= 0 && sd <= 0.3) {
      var mag = 9 * Math.pow(1 - sd / 0.3, 2);
      shake = [mag * Math.sin(sd * 71 + 1.3) * Math.cos(sd * 33), mag * Math.cos(sd * 61 + 0.4) * Math.sin(sd * 47 + 2)];
    }
    var wk = seg(t, land + 0.16 * k, land + 0.72 * k);
    var wordOpacity = 0;
    var wordY = -18;
    var tracking = 0.55;
    if (wk > 0) {
      var w1 = wk < 0.7 ? eoc(wk / 0.7) : 1;
      var w2 = wk < 0.7 ? 0 : eoc((wk - 0.7) / 0.3);
      wordOpacity = w1;
      wordY = wk < 0.7 ? lerp(-18, 4, w1) : lerp(4, 0, w2);
      tracking = wk < 0.7 ? lerp(0.55, 0.3, w1) : 0.3;
    }
    return {
      rot: motion.rot,
      scale: motion.scale,
      y: motion.y,
      blur: motion.blur,
      land: land,
      numOpacity: numOpacity,
      numColor: numColor,
      numScale: numScale,
      showNum: numOpacity > 0.001,
      text: numOpacity > 0.001 ? "1" : "",
      cracks: cracks,
      sagR: -4 * sagE,
      sagY: 8 * sagE,
      shake: shake,
      wordOpacity: wordOpacity,
      wordY: wordY,
      tracking: tracking,
      bright: t < land ? 1 : lerp(1, 0.78, dull),
      sat: t < land ? 1 : lerp(1, 0.7, dull),
      vig: t < land ? 0.12 * seg(t, 2.1 * k, land) : lerp(0.12, 0.85, eoc(seg(t, land, land + 0.7 * k))),
      content: 1 - eio(seg(t, fade, total)),
      rings: [
        ringAt(t, land, 0.6 * k, 0.35, 2.3, 0.8),
        ringAt(t, land + 0.08 * k, 0.65 * k, 0.3, 1.8, 0.7),
        ringAt(t, land, 0.5 * k, 0.5, 1.7, 0.9)
      ],
      forge: false
    };
  }

  /* Ordinary tumble. The number stays on the die (it cycles, then locks).
     Not the reserved blank→number Love-it show. */
  function normalFrame(t, spec) {
    spec = spec || {};
    var D = Number(spec.D);
    if (!isFinite(D) || D <= 0) D = NORMAL;
    var dir = spec.dir === -1 ? -1 : 1;
    var value = Math.round(Number(spec.value != null ? spec.value : spec.nat));
    if (!(value >= 1 && value <= 20)) value = 1;
    var u = clamp(D > 0 ? t / D : 1, 0, 1);
    var rot = dir * 720 * (1 - Math.pow(1 - u, 2.2));
    var s = Number(spec.size) > 0 ? Number(spec.size) : 280;
    var y = 0;
    if (t < D) {
      var uu = t / D;
      y = -s * 0.1 * Math.abs(Math.sin(Math.PI * 2 * Math.pow(uu, 0.85))) * Math.pow(1 - uu, 1.2);
    }
    var scale = t < D ? lerp(0.94, 1, u) : 1;
    var blur = (t > 0 && t < D) ? 1.1 * Math.sin(Math.PI * Math.min(u, 1)) : 0;
    var locked = t >= D;
    var face = locked ? value : (1 + Math.floor((t * 17) % 20));
    return {
      t: t,
      D: D,
      land: D,
      end: D + 0.2,
      rot: rot,
      scale: scale,
      y: y,
      blur: blur,
      showNum: true,
      text: String(face),
      numOpacity: locked ? 1 : 0.92,
      numScale: 1,
      spinning: t < D,
      suspense: false,
      normal: true
    };
  }
  /* Fast blank spin from the Love-it click roll. Suspense (nat 1 / 20) stays blank.
     Challenge only — ordinary rolls use normalFrame. */
  function fastFrame(t, spec) {
    spec = spec || {};
    var D = Number(spec.D);
    if (!isFinite(D) || D <= 0) D = FAST;
    var dir = spec.dir === -1 ? -1 : 1;
    var suspense = !!spec.suspense;
    var turns = Math.max(2, Math.round(2 * (D / FAST)));
    var u = clamp(D > 0 ? t / D : 1, 0, 1);
    var rot = dir * 360 * turns * (1 - Math.pow(1 - u, 2.2));
    var s = Number(spec.size) > 0 ? Number(spec.size) : 280;
    var bounces = suspense ? 3 : 2;
    var y = 0;
    if (t < D) {
      var uu = t / D;
      y = -s * 0.14 * Math.abs(Math.sin(Math.PI * bounces * Math.pow(uu, 0.85))) * Math.pow(1 - uu, 1.4);
    }
    var scale = 1;
    if (t < 0.05) scale = lerp(1, 0.96, t / 0.05);
    else if (t < D) scale = lerp(0.96, 1, (t - 0.05) / Math.max(0.01, D - 0.05));
    else {
      var d = t - D;
      scale = 1 - 0.05 * Math.exp(-10 * d) * Math.cos(22 * d);
    }
    var blur = (t > 0 && t < D) ? 1.6 * Math.sin(Math.PI * (t / D)) : 0;
    var show = !suspense && t >= D;
    var stamp = show ? (1 - Math.pow(1 - clamp((t - D) / 0.2, 0, 1), 3)) : 0;
    var value = spec.value != null ? spec.value : spec.nat;
    return {
      t: t,
      D: D,
      land: D,
      end: D + (suspense ? 0 : 0.45),
      rot: rot,
      scale: scale,
      y: y,
      blur: blur,
      showNum: show,
      text: show && value != null && value !== "" ? String(value) : "",
      numOpacity: show ? stamp : 0,
      numScale: show ? lerp(1.25, 1, stamp) : 1.25,
      spinning: t < D,
      suspense: suspense
    };
  }
  function make(spec) {
    spec = spec || {};
    var value = Math.round(Number(spec.value != null ? spec.value : spec.nat));
    if (!(value >= 1 && value <= 20)) value = 1 + Math.floor(Math.random() * 20);
    var D = Number(spec.D);
    if (!isFinite(D) || D <= 0) D = D_DEFAULT;
    var dir = spec.dir === -1 || spec.dir === 1 ? spec.dir : (Math.random() < 0.5 ? -1 : 1);
    return {
      id: String(spec.id || ""),
      value: value,
      nat: value,
      D: D,
      land: Math.round(LAND_AT * (D / D_DEFAULT) * 1000) / 1000,
      dir: dir,
      kind: "plain",
      motion: "c2",
      who: spec.who || "",
      label: spec.label || ""
    };
  }

  function dieSrc() {
    if (root.SSDNSDice && typeof root.SSDNSDice.src === "function") return root.SSDNSDice.src(20);
    var path = "";
    try { path = (root.location && root.location.pathname) || ""; } catch (e) {}
    var pre = path.indexOf("/dm/") >= 0 || path.indexOf("/tools/") >= 0 ? "../" : "";
    return pre + "assets/img/dice/d20.webp";
  }

  function ensureCss() {
    if (!root.document || root.document.getElementById("d20-plain-css")) return;
    var style = root.document.createElement("style");
    style.id = "d20-plain-css";
    style.textContent = [
      ".d20-plain{position:fixed;inset:0;z-index:100000;cursor:pointer;overflow:hidden;",
      "background:radial-gradient(ellipse at 50% 46%,rgba(44,28,13,.55),rgba(8,5,3,.94));}",
      ".d20-plain-stage{position:absolute;inset:0;pointer-events:none;}",
      ".d20-plain-shadow{position:absolute;left:50%;top:calc(44% + min(40vw,280px)*.46);width:calc(min(40vw,280px)*.72);height:calc(min(40vw,280px)*.12);",
      "transform:translate(-50%,-50%);border-radius:50%;background:radial-gradient(ellipse,rgba(0,0,0,.5),transparent 70%);}",
      ".d20-plain-ring{position:absolute;left:50%;top:44%;width:calc(min(40vw,280px));aspect-ratio:1;border-radius:50%;",
      "transform:translate(-50%,-50%) scale(.7);opacity:0;border:2px solid rgba(226,197,106,.75);pointer-events:none;}",
      ".d20-plain.is-land .d20-plain-ring{animation:d20-plain-ring .55s ease-out both;}",
      "@keyframes d20-plain-ring{0%{opacity:.7;transform:translate(-50%,-50%) scale(.75)}100%{opacity:0;transform:translate(-50%,-50%) scale(1.6)}}",
      ".d20-plain-mover{--s:min(40vw,280px);position:absolute;width:var(--s);height:var(--s);left:calc(50% - var(--s)/2);top:calc(44% - var(--s)/2);}",
      ".d20-plain-spin{position:absolute;inset:0;display:grid;place-items:center;transform-origin:50% 50%;}",
      ".d20-plain-spin img{width:100%;height:100%;object-fit:contain;filter:drop-shadow(0 14px 20px rgba(0,0,0,.55));}",
      ".d20-plain-num{position:absolute;left:0;right:0;top:48%;text-align:center;opacity:0;pointer-events:none;",
      "font:700 calc(var(--s)*.22)/1 Georgia,'Times New Roman',serif;letter-spacing:-.02em;color:#4fdccb;",
      "-webkit-text-stroke:1px #1a1a1a;text-shadow:0 2px 0 #10211f;}",
      ".d20-plain-label{position:absolute;left:16px;right:16px;top:max(16px,calc(44% - var(--s)/2 - 36px));margin:0;text-align:center;",
      "font:700 18px/1.2 Georgia,'Times New Roman',serif;color:#f4e6c4;text-shadow:0 2px 8px #000;pointer-events:none;}",
      ".d20-plain-label:empty{display:none;}",
      ".d20-plain-skip{position:absolute;bottom:26px;left:50%;transform:translateX(-50%);z-index:2;",
      "background:rgba(28,20,12,.9);color:#f4e6c4;border:1px solid #c4a574;border-radius:999px;",
      "padding:8px 16px;font:600 14px/1 system-ui,sans-serif;cursor:pointer;}",
      "@media (prefers-reduced-motion:reduce){.d20-plain-ring{animation:none!important}}"
    ].join("");
    root.document.head.appendChild(style);
  }

  function paintStage(value) {
    if (!root.SSDNSDice || typeof root.SSDNSDice.show !== "function") return;
    if (!(value >= 1 && value <= 20)) return;
    try { root.SSDNSDice.show({ sides: 20, face: value, formula: "1d20", total: value }); } catch (e) {}
  }

  function asPlay(spec) {
    spec = spec || {};
    var value = Math.round(Number(spec.value != null ? spec.value : spec.nat));
    if (!(value >= 1 && value <= 20)) value = 1 + Math.floor(Math.random() * 20);
    var normal = spec.motion === "spin" && !spec.suspense && !spec.fancy && !spec.challenge && spec.kind !== "crit" && spec.kind !== "fumble";
    var suspense = !normal && (!!spec.suspense || spec.kind === "crit" || spec.kind === "fumble");
    if (spec.kind === "plain") suspense = false;
    var dir = spec.dir === -1 || spec.dir === 1 ? spec.dir : (Math.random() < 0.5 ? -1 : 1);
    var mult = Number(spec.mult);
    var D = Number(spec.D);
    if (normal) D = NORMAL;
    else if (!(D > 0)) {
      if (suspense) {
        if (!(mult >= 2 && mult <= 3)) mult = 2 + Math.random();
        D = Math.round(FAST * mult * 1000) / 1000;
      } else D = FAST;
    }
    return {
      id: String(spec.id || ""),
      value: value,
      nat: value,
      D: D,
      dir: dir,
      mult: suspense ? (mult >= 2 ? mult : D / FAST) : 1,
      suspense: suspense,
      normal: normal,
      kind: normal ? "spin" : (suspense ? (spec.kind === "fumble" || value === 1 ? "fumble" : "crit") : "plain"),
      motion: normal ? "spin" : (spec.motion || (suspense ? "" : "fast")),
      who: spec.who || "",
      label: spec.label || ""
    };
  }
  function play(spec) {
    spec = asPlay(spec);
    var id = spec.suspense ? "" : (spec.id || "");
    if (id && seen[id]) return seen[id];
    var job = run(spec);
    if (id) {
      seen[id] = job;
      var wipe = setTimeout(function () { if (seen[id] === job) delete seen[id]; }, 20000);
      if (wipe && typeof wipe.unref === "function") wipe.unref();
    }
    return job;
  }

  function run(spec) {
    return new Promise(function (resolve) {
      var done = false;
      var raf = 0;
      var timer = 0;
      var layer = null;
      var spin = null;
      var num = null;
      var reduced = reducedMotion() || !effectsOn();
      var start = 0;
      var landed = false;

      function finish() {
        if (done) return;
        done = true;
        openSkip = null;
        if (raf && root.cancelAnimationFrame) root.cancelAnimationFrame(raf);
        clearTimeout(raf);
        clearTimeout(timer);
        if (layer && layer.parentNode) layer.parentNode.removeChild(layer);
        if (root.document && root.document.body) root.document.body.classList.remove("d20-plain-open");
        if (root.document) root.document.removeEventListener("keydown", onKey, true);
        resolve();
      }
      var suspense = !!spec.suspense;
      var normal = !!spec.normal;
      function draw(t) {
        var wide = spin && spin.offsetWidth ? spin.offsetWidth : 280;
        var fr = normal
          ? normalFrame(t, { value: spec.value, D: spec.D, dir: spec.dir, size: wide })
          : fastFrame(t, { value: spec.value, D: spec.D, dir: spec.dir, suspense: suspense, size: wide });
        if (spin) {
          spin.style.transform = "translateY(" + fr.y.toFixed(2) + "px) rotate(" + fr.rot.toFixed(2) + "deg) scale(" + fr.scale.toFixed(4) + ")";
          spin.style.filter = "blur(" + Math.max(0, fr.blur).toFixed(2) + "px)";
        }
        if (num) {
          if (!fr.showNum) {
            num.textContent = "";
            num.style.opacity = "0";
          } else {
            num.textContent = fr.text;
            num.style.opacity = String(fr.numOpacity);
            num.style.transform = "translateY(-50%) scale(" + fr.numScale.toFixed(3) + ")";
          }
        }
        if (normal && !fr.spinning && layer && !layer.classList.contains("is-normal")) {
          layer.classList.add("is-normal");
          landed = true;
          paintStage(spec.value);
        } else if (!normal && !suspense && fr.showNum && layer && !layer.classList.contains("is-land")) {
          layer.classList.add("is-land");
          landed = true;
          paintStage(spec.value);
        }
        return fr;
      }
      function holdThenClose() {
        clearTimeout(timer);
        timer = setTimeout(finish, (normal ? 0.35 : HOLD_AFTER) * 1000);
      }
      function skip() {
        if (done) return;
        if (raf && root.cancelAnimationFrame) root.cancelAnimationFrame(raf);
        clearTimeout(raf);
        if (suspense) { finish(); return; }
        draw(normal ? spec.D + 0.2 : spec.D + 0.45);
        if (layer) layer.classList.add(normal ? "is-normal" : "is-land");
        landed = true;
        paintStage(spec.value);
        holdThenClose();
      }
      function onKey(e) {
        if (!e) return;
        if (e.key === "Escape" || e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          if (landed) finish();
          else skip();
        }
      }
      function endAt() { return suspense ? spec.D : (normal ? spec.D + 0.2 : spec.D + 0.45); }
      function tick(now) {
        if (done) return;
        var t = (now - start) / 1000;
        var limit = endAt();
        draw(Math.min(t, limit));
        if (t < limit) {
          if (root.requestAnimationFrame) raf = root.requestAnimationFrame(tick);
          else raf = setTimeout(function () { tick(Date.now()); }, 32);
          return;
        }
        if (suspense) { finish(); return; }
        holdThenClose();
      }
      if (!root.document || !root.document.body) { resolve(); return; }
      ensureCss();
      layer = root.document.createElement("div");
      layer.className = "d20-plain" + (reduced ? " is-reduced is-land" : "");
      layer.setAttribute("data-kind", normal ? "spin" : (suspense ? "suspense" : "plain"));
      layer.setAttribute("data-motion", normal ? "spin" : "fast");
      layer.setAttribute("role", "dialog");
      layer.setAttribute("aria-label", "d20 roll");
      var label = String(spec.label || "");
      layer.innerHTML =
        '<div class="d20-plain-stage"><div class="d20-plain-shadow"></div><div class="d20-plain-ring"></div>' +
        '<div class="d20-plain-mover"><div class="d20-plain-spin" data-plain-die><img src="' + dieSrc() + '" alt="">' +
        '<div class="d20-plain-num" data-plain-num></div></div></div></div>' +
        '<p class="d20-plain-label"></p>' +
        '<button type="button" class="d20-plain-skip">Tap to skip</button>';
      var lab = layer.querySelector(".d20-plain-label");
      if (lab) lab.textContent = label;
      root.document.body.classList.add("d20-plain-open");
      root.document.body.appendChild(layer);
      spin = layer.querySelector("[data-plain-die]");
      num = layer.querySelector("[data-plain-num]");
      if (num) { num.textContent = ""; num.style.opacity = "0"; }
      openSkip = function () { if (landed) finish(); else skip(); };
      layer.addEventListener("click", function () { if (landed) finish(); else skip(); });
      root.document.addEventListener("keydown", onKey, true);
      if (reduced) {
        if (suspense) { finish(); return; }
        draw(normal ? spec.D + 0.2 : spec.D + 0.45);
        layer.classList.add(normal ? "is-normal" : "is-land");
        landed = true;
        paintStage(spec.value);
        holdThenClose();
        return;
      }
      start = (root.performance && root.performance.now) ? root.performance.now() : Date.now();
      draw(0);
      if (root.requestAnimationFrame) raf = root.requestAnimationFrame(tick);
      else tick(start);
    });
  }

  function skip() {
    if (openSkip) openSkip();
  }

  if (root.addEventListener) {
    root.addEventListener("ssdns-map-fx-pref", function (e) {
      if (e && e.detail && e.detail.on === false && openSkip) openSkip();
    });
  }

  root.SSDNSPlainRoll = {
    D: FAST,
    FAST: FAST,
    NORMAL: NORMAL,
    LAND: LAND_AT,
    c2Frame: c2Frame,
    c2FailLook: c2FailLook,
    fastFrame: fastFrame,
    normalFrame: normalFrame,
    frame: fastFrame,
    make: make,
    play: play,
    roll: function (n) { return play({ value: n, kind: "plain", motion: "spin" }); },
    skip: skip,
    effectsOn: effectsOn,
    reducedMotion: reducedMotion
  };
})(typeof window !== "undefined" ? window : globalThis);

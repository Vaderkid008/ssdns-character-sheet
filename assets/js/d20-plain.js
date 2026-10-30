/* Plain click-to-roll d20 (sheet 0.3.170).
   The player click uses the C2 slam as its motion: spin-blur, overshoot, slam, settle.
   The 4s natural curve is the timing (land at 2.85s, hold through 4.0s). The face stays
   blank for the whole spin. The rolled number is drawn only at land.
   No CRITICAL, FAIL, forge, crack, or smoke on this path. Crit and FAIL stay on the
   random pool in d20-zoom.js. The short hop lengths (Snappy 1.0 / Normal 1.3) are not
   this click. Room sync is {value, D, dir, kind}. Map Effects off and reduced motion
   skip to the landed number. Tap, Esc, Space, or Enter mid-spin does the same. */
(function (root) {
  "use strict";

  var D_DEFAULT = 4;
  var LAND_AT = 2.85;
  var SPIN_END = 2.1;
  var OVER = 2.62;
  var SETTLE = 3.2;
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

  /* Pose is a pure function of t. Times scale with D (4s is the natural C2 ref).
     Number text and opacity stay empty until land. */
  function c2Frame(t, spec) {
    spec = spec || {};
    var D = Number(spec.D);
    if (!isFinite(D) || D <= 0) D = D_DEFAULT;
    var k = D / D_DEFAULT;
    var spinEnd = SPIN_END * k;
    var over = OVER * k;
    var land = LAND_AT * k;
    var settle = SETTLE * k;
    var end = D_DEFAULT * k;
    var dir = spec.dir === -1 ? -1 : 1;
    var value = spec.value != null ? spec.value : spec.nat;
    var rot = 0;
    var scale = 0.3;
    var y = 0;
    var blur = 9;
    if (t > 0 && t < spinEnd) {
      var u = t / spinEnd;
      var e = 1 - Math.pow(1 - u, 2.6);
      rot = dir * 1800 * e;
      scale = lerp(0.3, 0.86, e);
      blur = lerp(9, 0, e);
    } else if (t >= spinEnd && t < over) {
      var u2 = (t - spinEnd) / (over - spinEnd);
      var e2 = u2 * u2;
      rot = dir * 1800;
      scale = lerp(0.86, 1.34, e2);
      y = lerp(0, -16, e2);
      blur = 0;
    } else if (t >= over && t < land) {
      var u3 = (t - over) / (land - over);
      var e3 = u3 * u3;
      rot = dir * 1800;
      scale = lerp(1.34, 0.88, e3);
      y = lerp(-16, 0, e3);
      blur = 0;
    } else if (t >= land && t < settle) {
      var u4 = (t - land) / (settle - land);
      rot = dir * 1800;
      scale = lerp(0.88, 1, 1 - Math.pow(1 - u4, 2)) + 0.03 * Math.exp(-5 * u4) * Math.sin(u4 * 12);
      y = 0;
      blur = 0;
    } else if (t >= settle) {
      rot = dir * 1800;
      scale = 1;
      y = 0;
      blur = 0;
    }
    var show = t >= land;
    var stampU = show ? clamp((t - land) / (0.34 * k), 0, 1) : 0;
    var stamp = 1 - Math.pow(1 - stampU, 3);
    var text = "";
    if (show && value != null && value !== "") text = String(value);
    return {
      t: t,
      D: end,
      land: land,
      end: end,
      rot: rot,
      scale: scale,
      y: y,
      blur: blur,
      showNum: show,
      text: text,
      numOpacity: show ? stamp : 0,
      numScale: show ? lerp(1.45, 1, stamp) : 1.45,
      spinning: t < land
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

  function play(spec) {
    spec = spec && spec.kind === "plain" ? spec : make(spec);
    var id = spec.id || "";
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
      function draw(t) {
        var fr = c2Frame(t, spec);
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
        if (fr.showNum && layer && !layer.classList.contains("is-land")) {
          layer.classList.add("is-land");
          landed = true;
          paintStage(spec.value);
        }
        return fr;
      }
      function holdThenClose() {
        clearTimeout(timer);
        timer = setTimeout(finish, HOLD_AFTER * 1000);
      }
      function skip() {
        if (done) return;
        if (raf && root.cancelAnimationFrame) root.cancelAnimationFrame(raf);
        clearTimeout(raf);
        draw(spec.D);
        if (layer) layer.classList.add("is-land");
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
      function tick(now) {
        if (done) return;
        var t = (now - start) / 1000;
        var fr = draw(Math.min(t, spec.D));
        if (t < spec.D && !fr.showNum) {
          if (root.requestAnimationFrame) raf = root.requestAnimationFrame(tick);
          else raf = setTimeout(function () { tick(Date.now()); }, 32);
          return;
        }
        if (t < spec.D) {
          if (root.requestAnimationFrame) raf = root.requestAnimationFrame(tick);
          else raf = setTimeout(function () { tick(Date.now()); }, 32);
          return;
        }
        holdThenClose();
      }
      if (!root.document || !root.document.body) { resolve(); return; }
      ensureCss();
      layer = root.document.createElement("div");
      layer.className = "d20-plain" + (reduced ? " is-reduced is-land" : "");
      layer.setAttribute("data-kind", "plain");
      layer.setAttribute("data-motion", "c2");
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
        draw(spec.D);
        layer.classList.add("is-land");
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
    D: D_DEFAULT,
    LAND: LAND_AT,
    c2Frame: c2Frame,
    frame: c2Frame,
    make: make,
    play: play,
    roll: function (n) { return play({ value: n }); },
    skip: skip,
    effectsOn: effectsOn,
    reducedMotion: reducedMotion
  };
})(typeof window !== "undefined" ? window : globalThis);

/* Crit / fumble d20 zoom (sheet 0.3.169).
   On an attack nat 20, nat 1, or a crit the resolver already flagged (expanded range
   from the character's features, carried as crit / critMin), a big d20 tumbles to
   center screen and lands on the rolled face. Then damage and the map tracer resume.
   The map's beforeEffect hook is the pause before the tracer. Resolvers that roll
   damage themselves await beforeDamage first, using the same roll id so the room
   does not play the zoom twice.
   Sync: the roll's tableFeed row carries zoom, and the map attack FX event does too.
   Tap or Escape skips. Map Effects off (ssdns.map.fx = "0") skips the zoom and the wait.
   Sounds: tumble uses roll-d20. Crit sting prefers d20-crit, else nat20. Fumble sting
   prefers d20-fumble, else nat1. Those fallbacks are already in sfx.json
   (roll-d20.mp3, nat20.mp3, nat1.mp3). Dedicated zoom files are not in the pack:
   add assets/sfx/d20-crit.mp3 and assets/sfx/d20-fumble.mp3 and list them in sfx.json
   under events/pools as d20-crit and d20-fumble. This file does not invent audio. */
(function (root) {
  "use strict";

  var TUMBLE_MS = 900;
  var HOLD_MS = 700;
  var seen = {};
  var tail = Promise.resolve();
  var hooked = false;
  var openSkip = null;

  function effectsOn() {
    var FX = root.SSDNSMapFx;
    if (FX && typeof FX.enabled === "function") return !!FX.enabled();
    try { return root.localStorage.getItem("ssdns.map.fx") !== "0"; } catch (e) { return true; }
  }

  function kindOf(ev) {
    ev = ev || {};
    var nat = Number(ev.nat);
    if (!(nat >= 1 && nat <= 20)) return "";
    if (nat === 1) return "fumble";
    if (nat === 20) return "crit";
    var result = String(ev.result || "").toLowerCase();
    if (ev.crit === true || result === "crit" || result === "critical") return "crit";
    if (ev.crit == null) {
      var min = Number(ev.critMin);
      if (isFinite(min) && min >= 2 && min < 20 && nat >= min) return "crit";
    }
    return "";
  }

  function pack(ev) {
    var kind = kindOf(ev);
    if (!kind) return null;
    ev = ev || {};
    var min = Number(ev.critMin);
    var out = {
      id: String(ev.id || ev.rollId || ""),
      nat: Math.round(Number(ev.nat)),
      crit: kind === "crit",
      result: kind === "crit" ? "crit" : "miss"
    };
    if (isFinite(min) && min >= 2 && min <= 20) out.critMin = Math.round(min);
    return out;
  }

  function cue(name, fallback) {
    var A = root.SSDNSAudio;
    if (!A || typeof A.play !== "function") return;
    var key = name;
    if (typeof A.hasFile === "function" && !A.hasFile(key) && fallback) key = fallback;
    if (typeof A.hasFile === "function" && !A.hasFile(key)) return;
    try {
      if (typeof A.playNow === "function") A.playNow(key);
      else A.play(key);
    } catch (e) {}
  }

  function faceHtml(nat, px) {
    var Dice = root.SSDNSDice;
    if (Dice && typeof Dice.faceHtml === "function") return Dice.faceHtml(20, nat, px);
    var n = nat == null || nat === "" ? "" : String(nat);
    return '<span class="d20-zoom-fallback" aria-hidden="true">' + n + "</span>";
  }

  function ensureCss() {
    if (!root.document || root.document.getElementById("d20-zoom-css")) return;
    var style = root.document.createElement("style");
    style.id = "d20-zoom-css";
    style.textContent = [
      ".d20-zoom{position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;",
      "background:rgba(12,8,4,.55);cursor:pointer;}",
      ".d20-zoom-stage{display:flex;flex-direction:column;align-items:center;gap:14px;pointer-events:none;}",
      ".d20-zoom-die{width:min(46vw,280px);height:min(46vw,280px);display:grid;place-items:center;",
      "filter:drop-shadow(0 18px 28px rgba(0,0,0,.55));}",
      ".d20-zoom-die .die-face,.d20-zoom-die img{width:100%!important;height:100%!important;max-width:none;}",
      ".d20-zoom-die.is-tumble{animation:d20-zoom-tumble .9s cubic-bezier(.2,.7,.2,1) both;}",
      ".d20-zoom-die.is-land{animation:d20-zoom-land .28s ease-out both;}",
      ".d20-zoom-word{margin:0;font:700 28px/1 Georgia,'Times New Roman',serif;letter-spacing:.14em;",
      "text-transform:uppercase;color:#f4e6c4;text-shadow:0 2px 8px rgba(0,0,0,.65);}",
      ".d20-zoom-word.is-crit{color:#e2c56a;}",
      ".d20-zoom-word.is-fumble{color:#e7a0a0;}",
      ".d20-zoom-skip{position:absolute;bottom:28px;left:50%;transform:translateX(-50%);",
      "background:rgba(28,20,12,.9);color:#f4e6c4;border:1px solid #c4a574;border-radius:999px;",
      "padding:8px 16px;font:600 14px/1 system-ui,sans-serif;cursor:pointer;}",
      ".d20-zoom-fallback{width:min(46vw,280px);height:min(46vw,280px);border-radius:18px;",
      "display:grid;place-items:center;background:#1a3a36;color:#4fdccb;border:6px solid #e8dcc8;",
      "font:800 96px/1 Georgia,serif;}",
      "@keyframes d20-zoom-tumble{0%{transform:scale(.35) rotate(-40deg);opacity:.2}",
      "40%{opacity:1}100%{transform:scale(1) rotate(720deg);opacity:1}}",
      "@keyframes d20-zoom-land{0%{transform:scale(1.12)}100%{transform:scale(1)}}"
    ].join("");
    root.document.head.appendChild(style);
  }

  function run(ev, kind) {
    return new Promise(function (resolve) {
      var done = false;
      var timers = [];
      function finish() {
        if (done) return;
        done = true;
        openSkip = null;
        timers.forEach(function (t) { clearTimeout(t); });
        if (layer && layer.parentNode) layer.parentNode.removeChild(layer);
        if (root.document && root.document.body) root.document.body.classList.remove("d20-zoom-open");
        if (root.document) root.document.removeEventListener("keydown", onKey, true);
        resolve();
      }
      if (!root.document || !root.document.body || !effectsOn()) { resolve(); return; }
      ensureCss();
      var nat = Math.round(Number(ev.nat));
      var layer = root.document.createElement("div");
      layer.className = "d20-zoom";
      layer.setAttribute("role", "dialog");
      layer.setAttribute("aria-label", kind === "crit" ? "Critical hit" : "Fumble");
      var word = kind === "crit" ? "Critical" : "Fumble";
      layer.innerHTML = '<div class="d20-zoom-stage"><div class="d20-zoom-die is-tumble" data-zoom-die>' +
        faceHtml("", 260) + '</div><p class="d20-zoom-word is-' + kind + '">' + word + "</p></div>" +
        '<button type="button" class="d20-zoom-skip">Tap to skip</button>';
      root.document.body.classList.add("d20-zoom-open");
      root.document.body.appendChild(layer);
      cue("roll-d20", "roll");
      function onKey(e) {
        if (!e) return;
        if (e.key === "Escape" || e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          finish();
        }
      }
      openSkip = finish;
      layer.addEventListener("click", finish);
      root.document.addEventListener("keydown", onKey, true);
      timers.push(setTimeout(function () {
        if (done || !effectsOn()) { finish(); return; }
        var die = layer.querySelector("[data-zoom-die]");
        if (die) {
          die.classList.remove("is-tumble");
          die.classList.add("is-land");
          die.innerHTML = faceHtml(nat, 260);
        }
        cue(kind === "crit" ? "d20-crit" : "d20-fumble", kind === "crit" ? "nat20" : "nat1");
        timers.push(setTimeout(finish, HOLD_MS));
      }, TUMBLE_MS));
    });
  }

  function play(ev) {
    var kind = kindOf(ev);
    if (!kind || !effectsOn()) return Promise.resolve();
    var id = String((ev && (ev.id || ev.rollId)) || "");
    if (id && seen[id]) return seen[id];
    var p = tail.then(function () {
      if (!effectsOn()) return;
      return run(ev, kind);
    });
    var safe = p.then(function () {}, function () {});
    tail = safe;
    if (id) {
      seen[id] = safe;
      var wipe = setTimeout(function () { if (seen[id] === safe) delete seen[id]; }, 20000);
      if (wipe && typeof wipe.unref === "function") wipe.unref();
    }
    return safe;
  }

  function install() {
    var FX = root.SSDNSMapFx;
    if (!FX || typeof FX.setBeforeEffect !== "function" || hooked) return;
    hooked = true;
    FX.setBeforeEffect(function (ev) { return play(ev); }, { timeoutMs: 8000 });
  }

  if (root.addEventListener) {
    root.addEventListener("ssdns-map-fx-pref", function (e) {
      if (e && e.detail && e.detail.on === false && openSkip) openSkip();
    });
  }

  root.SSDNSD20Zoom = {
    play: play,
    beforeDamage: play,
    kindOf: kindOf,
    pack: pack,
    effectsOn: effectsOn,
    install: install
  };
  install();
})(typeof window !== "undefined" ? window : globalThis);

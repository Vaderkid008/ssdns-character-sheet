/* Crit / FAIL d20 zoom (sheet 0.3.171).
   The forge / FAIL show and the blank Love-it suspense play only for a gold
   Challenge roll (fancy or challenge on the event). Sheet d20 clicks, the DM
   tray, attacks, and skills take the normal spin in d20-plain.js instead.
   A Challenge nat 20, nat 1, or expanded crit stays blank, then a big d20
   plays one motion from a random pool and lands.
   Crit lands as A3 forge slam (white-hot face cools to gold, ember ring, gunsmoke),
   word CRITICAL. Fail lands as B1 crack + B3 plum-rose smoke, word FAIL.
   The pool stays fiery roll, C1, C2, C3-approx. Only the C2 draw uses the 4s
   natural curve (impact at 2.85s, settle through 4.0s). Fail C2 uses that same
   beat: rose shock rings, crack from 2.89s, plum-rose smoke, FAIL in #e7a0a0,
   the 1 fades rose to bone-grey and sits above the crack. No forge on a fail.
   A Challenge 2–19 is the fast blank spin in d20-plain.js (~1.05s), not this
   pool. A Challenge nat 20 / nat 1 spins blank 2–3× longer, then one motion
   from this pool. Any other d20 is the normal spin (number visible, no forge).
   The die is assets/img/dice/d20.webp through SSDNSDice.faceHtml. The number is
   drawn in code. A flat teal square shows only if that art fails to load.
   Each zoom picks roll, c1, c2, or c3 with equal chance. prefers-reduced-motion
   skips the tumble and the shake and shows the landed look.
   Then damage and the map tracer resume. beforeEffect and beforeDamage share the
   roll id so the room does not play it twice.
   The overlay names the roller from characterName, then who, then fromName.
   A short shooter id is used only when none of those is set. The same zoom
   pack goes out on the roll feed, so the whole room sees that name.
   Tap, Escape, Enter, or Space mid-spin skips to the landed crit or FAIL card.
   Map Effects off and reduced motion skip the tumble and show that landed card.
   Tumble cue by motion: fiery roll prefers d20-roll-fire else roll-d20; C1 is
   roll-d20; slam prefers d20-slam else d20-whoosh else roll-d20; C3 prefers
   d20-whoosh else roll-d20. Land sting is d20-crit/nat20 or d20-fumble/nat1,
   except slam prefers d20-impact first. Not in the pack yet (hooks only):
   d20-roll-fire, d20-slam, d20-whoosh, d20-impact, d20-crit, d20-fumble.
   This file does not invent audio.
   Embers, gunsmoke, the crack, and the plum haze are CSS and canvas. Transparent
   sprites can replace them later; nothing here waits on Art Bot. */
(function (root) {
  "use strict";

  var HOLD_MS = 700;
  var C2_LAND_MS = 2850;
  var C2_TOTAL_MS = 4000;
  var MOTIONS = ["roll", "c1", "c2", "c3"];
  var MOTION_MS = { roll: 1100, c1: 900, c2: C2_LAND_MS, c3: 1000 };
  var posed = {};
  var CRACK = [
    "M50 44 L46.5 38 L48 33 L44 27.5 L45 23",
    "M50 44 L54.5 47 L57 52.5 L62 55 L65 61",
    "M50 44 L47.5 50 L49 55.5 L45.5 61 L46.5 68 L43 76",
    "M47.5 50 L41.5 52.5 L36.5 51",
    "M54.5 47 L58.5 41.5 L63 40.5"
  ];
  var seen = {};
  var openLayer = {};
  var tail = Promise.resolve();
  var hooked = false;
  var openSkip = null;

  function effectsOn() {
    var FX = root.SSDNSMapFx;
    if (FX && typeof FX.enabled === "function") return !!FX.enabled();
    try { return root.localStorage.getItem("ssdns.map.fx") !== "0"; } catch (e) { return true; }
  }

  function reducedMotion() {
    try {
      return !!(root.matchMedia && root.matchMedia("(prefers-reduced-motion: reduce)").matches);
    } catch (e) { return false; }
  }

  function pickMotion() {
    return MOTIONS[Math.floor(Math.random() * MOTIONS.length)];
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

  /* First key that sfx.json actually has. Missing dedicated files fall through.
     Not in the pack yet: d20-roll-fire, d20-slam, d20-whoosh, d20-impact, d20-crit, d20-fumble. */
  function cueFirst(keys) {
    var A = root.SSDNSAudio;
    if (!A || typeof A.play !== "function" || !keys || !keys.length) return;
    var key = keys[0];
    if (typeof A.hasFile === "function") {
      key = "";
      for (var i = 0; i < keys.length; i++) {
        if (A.hasFile(keys[i])) { key = keys[i]; break; }
      }
      if (!key) return;
    }
    try {
      if (typeof A.playNow === "function") A.playNow(key);
      else A.play(key);
    } catch (e) {}
  }
  function tumbleCues(motion) {
    if (motion === "roll") return ["d20-roll-fire", "roll-d20", "roll"];
    if (motion === "c2") return ["d20-slam", "d20-whoosh", "roll-d20", "roll"];
    if (motion === "c3") return ["d20-whoosh", "roll-d20", "roll"];
    return ["roll-d20", "roll"];
  }
  function landCues(motion, crit) {
    var sting = crit ? ["d20-crit", "nat20"] : ["d20-fumble", "nat1"];
    if (motion === "c2") return ["d20-impact"].concat(sting);
    return sting;
  }
  function cleanName(v) {
    return String(v == null ? "" : v).replace(/\s+/g, " ").trim();
  }
  /* Character display name already on the roll. A short id only when nothing else is there. */
  function rollerName(ev) {
    ev = ev || {};
    var name = cleanName(ev.characterName) || cleanName(ev.name) || cleanName(ev.who) || cleanName(ev.fromName);
    if (!name) {
      var id = cleanName(ev.shooter || ev.playerId || ev.from || "");
      if (id.indexOf("fx_") === 0) id = id.slice(3);
      if (id.length > 16) id = id.slice(0, 12);
      name = id;
    }
    return name.slice(0, 48);
  }
  function paintWho(layer, ev) {
    if (!layer) return;
    var el = layer.querySelector("[data-zoom-who]");
    if (!el) return;
    var name = rollerName(ev);
    if (!name) { el.hidden = true; el.textContent = ""; return; }
    el.hidden = false;
    el.textContent = name;
  }

  function dieSrc() {
    if (root.SSDNSDice && typeof root.SSDNSDice.src === "function") return root.SSDNSDice.src(20);
    var path = "";
    try { path = (root.location && root.location.pathname) || ""; } catch (e) {}
    var pre = path.indexOf("/dm/") >= 0 || path.indexOf("/tools/") >= 0 ? "../" : "";
    return pre + "assets/img/dice/d20.webp";
  }

  function faceHtml(nat, px) {
    var Dice = root.SSDNSDice;
    if (Dice && typeof Dice.faceHtml === "function") {
      var html = Dice.faceHtml(20, nat, px);
      if (html) return html;
    }
    var n = nat == null || nat === "" ? "" : String(nat);
    return '<span class="die-face d20-zoom-raw" style="width:' + px + "px;height:" + px + 'px">' +
      '<img src="' + dieSrc() + '" alt="d20">' +
      (n ? '<span class="d20-zoom-rawnum">' + n + "</span>" : "") + "</span>";
  }

  function watchArt(host) {
    if (!host) return;
    var img = host.querySelector("img");
    if (!img) { host.classList.add("is-fallback"); return; }
    function miss() { host.classList.add("is-fallback"); }
    img.addEventListener("error", miss);
    if (img.complete && img.naturalWidth === 0) miss();
  }

  function tintNumber(host, crit) {
    if (!host) return;
    var text = host.querySelector(".die-num text");
    if (!text) return;
    text.removeAttribute("fill");
    text.setAttribute("class", crit ? "is-crit-num" : "is-fail-num");
  }

  function crackSvg() {
    var dark = CRACK.map(function (d) { return '<path class="dark" d="' + d + '"/>'; }).join("");
    var glow = CRACK.map(function (d) { return '<path class="glow" d="' + d + '"/>'; }).join("");
    return '<svg class="d20-zoom-crack" viewBox="0 0 100 100" aria-hidden="true">' + dark + glow + "</svg>";
  }

  function ensureCss() {
    if (!root.document || root.document.getElementById("d20-zoom-css")) return;
    var style = root.document.createElement("style");
    style.id = "d20-zoom-css";
    style.textContent = [
      ".d20-zoom{position:fixed;inset:0;z-index:100000;cursor:pointer;overflow:hidden;",
      "background:radial-gradient(ellipse at 50% 46%,rgba(44,28,13,.72),rgba(8,5,3,.94));}",
      ".d20-zoom canvas{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;}",
      ".d20-zoom-back{z-index:1;}.d20-zoom-front{z-index:4;}",
      ".d20-zoom-stage{position:absolute;inset:0;pointer-events:none;z-index:2;}",
      ".d20-zoom-mover{--s:min(46vw,280px);position:absolute;width:var(--s);height:var(--s);",
      "left:calc(50% - var(--s)/2);top:calc(44% - var(--s)/2);}",
      ".d20-zoom-spin,.d20-zoom-ghost{position:absolute;inset:0;display:grid;place-items:center;}",
      ".d20-zoom-spin .die-face,.d20-zoom-ghost .die-face{width:100%!important;height:100%!important;}",
      ".d20-zoom-spin img,.d20-zoom-ghost img{width:100%!important;height:100%!important;max-width:none;",
      "filter:drop-shadow(0 18px 26px rgba(0,0,0,.6));}",
      ".d20-zoom-ghost{opacity:0;pointer-events:none;}",
      ".d20-zoom-face{position:absolute;inset:0;opacity:0;pointer-events:none;z-index:4;}",
      ".d20-zoom-spin{z-index:3;}",
      ".d20-zoom-read{position:absolute;inset:0;z-index:6;pointer-events:none;display:grid;place-items:center;}",
      ".d20-zoom-read .die-num,.d20-zoom-read .d20-zoom-rawnum{width:100%;height:100%;}",
      ".d20-zoom.is-land .d20-zoom-face{opacity:1;}",
      ".d20-zoom-heat{position:absolute;inset:0;opacity:0;mix-blend-mode:screen;",
      "clip-path:polygon(50% 18.6%,25.2% 62.8%,74.8% 62.8%);",
      "background:radial-gradient(circle at 50% 48%,#fffbe8 0%,#ffd27a 28%,#ff8a2a 62%,rgba(184,64,12,0) 100%);}",
      ".d20-zoom.is-land.is-crit .d20-zoom-heat{animation:d20-heat .5s ease-out both;}",
      "@keyframes d20-heat{0%{opacity:1;filter:brightness(1.6)}50%{opacity:.72;filter:brightness(1.1)}100%{opacity:.38;filter:brightness(.9)}}",
      ".d20-zoom.is-land.is-crit .die-num text,.d20-zoom.is-land.is-crit .d20-zoom-rawnum{fill:#e2c56a;color:#e2c56a;",
      "animation:d20-num-cool .5s ease-out both;}",
      "@keyframes d20-num-cool{0%{fill:#fffbe8;color:#fffbe8}100%{fill:#e2c56a;color:#e2c56a}}",
      ".d20-zoom.is-land.is-fail .d20-zoom-spin{filter:brightness(.78) saturate(.7);}",
      ".d20-zoom.is-land.is-fail .d20-zoom-mover{animation:d20-sag .7s cubic-bezier(.3,0,.4,1) .12s both;}",
      "@keyframes d20-sag{0%{transform:none}60%{transform:translateY(10px) rotate(-5deg)}100%{transform:translateY(8px) rotate(-4deg)}}",
      ".d20-zoom-crack{position:absolute;inset:0;width:100%;height:100%;overflow:visible;}",
      ".d20-zoom-crack path{fill:none;stroke-linecap:round;stroke-dasharray:80;stroke-dashoffset:80;}",
      ".d20-zoom-crack .dark{stroke:#120608;stroke-width:1.6;}",
      ".d20-zoom-crack .glow{stroke:#c45a6e;stroke-width:.7;}",
      ".d20-zoom.is-land.is-fail .d20-zoom-crack path{animation:d20-crack .26s ease-out forwards;}",
      ".d20-zoom.is-land.is-fail .d20-zoom-crack path:nth-child(2){animation-delay:.05s}",
      ".d20-zoom.is-land.is-fail .d20-zoom-crack path:nth-child(3){animation-delay:.09s}",
      ".d20-zoom.is-land.is-fail .d20-zoom-crack path:nth-child(6),.d20-zoom.is-land.is-fail .d20-zoom-crack path:nth-child(7){animation-delay:.14s}",
      "@keyframes d20-crack{to{stroke-dashoffset:0}}",
      ".d20-zoom-ring{position:absolute;left:50%;top:44%;width:calc(min(46vw,280px)*1.05);aspect-ratio:1;border-radius:50%;",
      "transform:translate(-50%,-50%) scale(.2);opacity:0;border:4px solid #e2c56a;",
      "box-shadow:0 0 24px 4px rgba(226,197,106,.55);pointer-events:none;}",
      ".d20-zoom.is-fail .d20-zoom-ring{border-color:#e7a0a0;box-shadow:0 0 22px 4px rgba(231,160,160,.45);}",
      ".d20-zoom.is-ring .d20-zoom-ring{animation:d20-ring .56s cubic-bezier(.1,.6,.3,1) both;}",
      "@keyframes d20-ring{0%{transform:translate(-50%,-50%) scale(.35);opacity:1}100%{transform:translate(-50%,-50%) scale(2.8);opacity:0}}",
      ".d20-zoom-who{position:absolute;left:16px;right:16px;top:max(18px,calc(44% - min(46vw,280px)/2 - 52px));",
      "margin:0;text-align:center;z-index:5;pointer-events:none;",
      "font:700 clamp(18px,3.2vw,28px)/1.2 Georgia,'Times New Roman',serif;letter-spacing:.03em;color:#f4e6c4;",
      "text-shadow:0 2px 10px rgba(0,0,0,.85);}",
      ".d20-zoom-who[hidden]{display:none;}",
      ".d20-zoom-word{position:absolute;left:0;right:0;top:calc(44% + min(46vw,280px)*.58);margin:0;text-align:center;z-index:5;",
      "font:700 clamp(30px,6.4vw,58px)/1 Georgia,'Times New Roman',serif;letter-spacing:.16em;text-transform:uppercase;opacity:0;}",
      ".d20-zoom.is-crit .d20-zoom-word{color:#e2c56a;text-shadow:0 0 14px rgba(255,140,40,.55),0 3px 2px rgba(0,0,0,.8);}",
      ".d20-zoom.is-fail .d20-zoom-word{color:#e7a0a0;letter-spacing:.3em;text-shadow:0 3px 3px rgba(0,0,0,.85),0 0 18px rgba(150,60,90,.45);}",
      ".d20-zoom.is-land .d20-zoom-word{animation:d20-word .52s ease-out .06s both;}",
      "@keyframes d20-word{0%{opacity:0;transform:scale(1.35)}100%{opacity:1;transform:scale(1)}}",
      ".d20-zoom-skip{position:absolute;bottom:26px;left:50%;transform:translateX(-50%);z-index:6;",
      "background:rgba(28,20,12,.9);color:#f4e6c4;border:1px solid #c4a574;border-radius:999px;",
      "padding:8px 16px;font:600 14px/1 system-ui,sans-serif;cursor:pointer;}",
      ".d20-zoom-spin.is-fallback .die-face{background:#1a3a36;border-radius:18px;border:6px solid #e8dcc8;}",
      ".d20-zoom-spin.is-fallback img{opacity:0;}",
      ".d20-zoom-rawnum{position:absolute;inset:0;display:grid;place-items:center;font:800 72px/1 Georgia,serif;color:#4fdccb;}",
      ".d20-zoom.is-motion-roll .d20-zoom-mover{animation:d20-roll-path 1.1s cubic-bezier(.3,.55,.45,1) both;}",
      ".d20-zoom.is-motion-roll .d20-zoom-spin{animation:d20-roll-spin 1.1s cubic-bezier(.3,.55,.45,1) both;}",
      ".d20-zoom.is-motion-roll.is-crit .d20-zoom-spin{filter:brightness(1.4) sepia(.45) drop-shadow(0 0 22px #ff7a1a);}",
      ".d20-zoom.is-motion-roll.is-fail .d20-zoom-spin{filter:brightness(1.05) sepia(.25);}",
      "@keyframes d20-roll-path{0%{transform:translate(-78vw,8vh) scale(.5)}20%{transform:translate(-52vw,-8vh) scale(.58)}",
      "40%{transform:translate(-33vw,6vh) scale(.66)}58%{transform:translate(-18vw,-5vh) scale(.76)}",
      "74%{transform:translate(-7vw,3vh) scale(.86)}87%{transform:translate(0,-3vh) scale(1.2)}",
      "94%{transform:translate(0,0) scale(.92)}100%{transform:none}}",
      "@keyframes d20-roll-spin{0%{transform:rotate(-1260deg)}74%{transform:rotate(-90deg)}87%,100%{transform:rotate(0deg)}}",
      ".d20-zoom.is-motion-c1 .d20-zoom-spin{animation:d20-c1 .9s cubic-bezier(.2,.7,.2,1) both,d20-c1-glow .9s ease-out both;}",
      ".d20-zoom.is-fail.is-motion-c1 .d20-zoom-spin{animation:d20-c1 .9s cubic-bezier(.2,.7,.2,1) both,d20-c1-glow-rose .9s ease-out both;}",
      "@keyframes d20-c1{0%{transform:scale(.35) rotate(-40deg);opacity:.2}40%{opacity:1}100%{transform:scale(1) rotate(720deg);opacity:1}}",
      "@keyframes d20-c1-glow{0%{filter:drop-shadow(0 0 0 transparent)}85%{filter:drop-shadow(0 0 26px rgba(226,197,106,.9))}100%{filter:drop-shadow(0 0 8px rgba(226,197,106,.45))}}",
      "@keyframes d20-c1-glow-rose{0%{filter:drop-shadow(0 0 0 transparent)}85%{filter:drop-shadow(0 0 26px rgba(231,160,160,.85))}100%{filter:drop-shadow(0 0 8px rgba(231,160,160,.4))}}",
      ".d20-zoom.is-bump.is-land .d20-zoom-spin{animation:d20-bump .28s ease-out both;}",
      "@keyframes d20-bump{0%{transform:scale(1.12)}100%{transform:scale(1)}}",
      ".d20-zoom.is-motion-c2 .d20-zoom-spin{animation:d20-c2 4s linear both;}",
      "@keyframes d20-c2{0%{transform:scale(.30) rotate(0deg);filter:blur(9px);opacity:.4}",
      "20%{transform:scale(.48) rotate(900deg);filter:blur(6px);opacity:1}",
      "40%{transform:scale(.70) rotate(1440deg);filter:blur(2px)}",
      "52.5%{transform:scale(.86) rotate(1800deg);filter:blur(0)}",
      "65.5%{transform:translateY(-16px) scale(1.34) rotate(1800deg);filter:blur(0)}",
      "71.25%{transform:translateY(0) scale(.88) rotate(1800deg);filter:blur(0)}",
      "80%{transform:scale(1.03) rotate(1800deg);filter:blur(0)}",
      "100%{transform:scale(1) rotate(1800deg);filter:none;opacity:1}}",
      ".d20-zoom.is-c2.is-shake .d20-zoom-stage{animation:d20-shake-c2 .48s linear both;}",
      "@keyframes d20-shake-c2{0%{transform:translate(16px,-6px)}18%{transform:translate(-14px,8px)}36%{transform:translate(10px,-7px)}54%{transform:translate(-6px,4px)}72%{transform:translate(3px,-2px)}100%{transform:none}}",
      ".d20-zoom.is-c2.is-ring .d20-zoom-ring.r2{animation-delay:.08s;border-color:#ffb25a;}",
      ".d20-zoom.is-c2.is-ring .d20-zoom-ring.r3{animation-delay:.16s;border-color:rgba(255,220,160,.75);}",
      ".d20-zoom.is-fail.is-c2.is-ring .d20-zoom-ring{border-color:#e7a0a0;box-shadow:0 0 22px 4px rgba(180,70,100,.45);}",
      ".d20-zoom.is-fail.is-c2.is-ring .d20-zoom-ring.r2{border-color:#c45a6e;}",
      ".d20-zoom.is-fail.is-c2.is-ring .d20-zoom-ring.r3{border-color:rgba(90,40,60,.55);}",
      ".d20-zoom.is-c2.is-land.is-fail .d20-zoom-mover{animation:none!important;}",
      ".d20-zoom.is-land.is-fail .die-num text,.d20-zoom.is-land.is-fail .d20-zoom-rawnum{fill:#e7a0a0;color:#e7a0a0;animation:d20-fail-num .7s ease-out both;}",
      ".d20-zoom.is-c2.is-land.is-fail .die-num text,.d20-zoom.is-c2.is-land.is-fail .d20-zoom-rawnum{animation-duration:.9s;}",
      "@keyframes d20-fail-num{0%{fill:#e7a0a0;color:#e7a0a0}100%{fill:#d2cbc0;color:#d2cbc0}}",
      ".d20-zoom.is-fail-c2 .d20-zoom-word,.d20-zoom.is-fail-c2 .d20-zoom-crack path,",
      ".d20-zoom.is-fail-c2.is-shake .d20-zoom-stage,.d20-zoom.is-fail-c2.is-ring .d20-zoom-ring,",
      ".d20-zoom.is-fail-c2.is-land.is-fail .d20-zoom-mover{animation:none!important;}",
      ".d20-zoom-vig{position:absolute;inset:0;pointer-events:none;background:rgba(28,8,14,.82);opacity:0;z-index:3;}",
      ".d20-zoom-failnum{position:absolute;left:0;right:0;top:46%;text-align:center;z-index:2;",
      "font:700 22%/1 Georgia,'Times New Roman',serif;color:#e7a0a0;opacity:0;pointer-events:none;",
      "text-shadow:0 2px 0 #3a1a1e;}",
      ".d20-zoom.is-shake .d20-zoom-stage{animation:d20-shake .28s linear both;}",
      "@keyframes d20-shake{0%,100%{transform:none}20%{transform:translate(-10px,6px)}40%{transform:translate(8px,-7px)}60%{transform:translate(-5px,4px)}80%{transform:translate(3px,-2px)}}",
      ".d20-zoom.is-motion-c3 .d20-zoom-spin{animation:d20-c3 1s cubic-bezier(.25,.6,.25,1) both;transform-style:preserve-3d;}",
      ".d20-zoom.is-motion-c3 .d20-zoom-ghost{animation:d20-c3 1s cubic-bezier(.25,.6,.25,1) both;opacity:.28;}",
      ".d20-zoom.is-motion-c3 .g1{animation-delay:.045s;opacity:.34}.d20-zoom.is-motion-c3 .g2{animation-delay:.09s;opacity:.18}",
      "@keyframes d20-c3{0%{transform:perspective(700px) translateZ(-650px) rotateX(-80deg) rotateY(150deg) rotateZ(-100deg);filter:blur(9px) brightness(.6);opacity:0}",
      "35%{transform:perspective(700px) translateZ(-260px) rotateX(190deg) rotateY(290deg) rotateZ(110deg);filter:blur(7px) brightness(1.3);opacity:1}",
      "68%{transform:perspective(700px) translateZ(80px) rotateX(320deg) rotateY(395deg) rotateZ(250deg);filter:blur(3px) brightness(.8)}",
      "88%{transform:perspective(700px) translateZ(30px) rotateX(364deg) rotateY(363deg) rotateZ(356deg);filter:blur(0) brightness(1.15)}",
      "100%{transform:perspective(700px) translateZ(0) rotateX(360deg) rotateY(360deg) rotateZ(360deg);filter:none;opacity:1}}",
      "@media (prefers-reduced-motion:reduce){",
      ".d20-zoom.is-motion-roll .d20-zoom-mover,.d20-zoom.is-motion-roll .d20-zoom-spin,",
      ".d20-zoom.is-motion-c1 .d20-zoom-spin,.d20-zoom.is-motion-c2 .d20-zoom-spin,",
      ".d20-zoom.is-motion-c3 .d20-zoom-spin,.d20-zoom.is-motion-c3 .d20-zoom-ghost,",
      ".d20-zoom.is-shake .d20-zoom-stage,.d20-zoom.is-land.is-fail .d20-zoom-mover{animation:none!important}}"
    ].join("");
    root.document.head.appendChild(style);
  }

  function rnd(a, b) { return a + Math.random() * (b - a); }

  function makeFx(back, front) {
    var parts = [];
    var alive = true;
    var noCanvas = false;
    function ctxOf(c) {
      if (noCanvas || !c || typeof c.getContext !== "function") return null;
      try {
        var g = c.getContext("2d");
        if (!g) noCanvas = true;
        return g || null;
      } catch (e) {
        noCanvas = true;
        return null;
      }
    }
    function resize() {
      var d = (root.devicePixelRatio || 1);
      var w = root.innerWidth || 800;
      var h = root.innerHeight || 600;
      [back, front].forEach(function (c) {
        if (!c) return;
        c.width = Math.max(1, Math.round(w * d));
        c.height = Math.max(1, Math.round(h * d));
        var g = ctxOf(c);
        if (g && g.setTransform) g.setTransform(d, 0, 0, d, 0, 0);
      });
    }
    function add(o) { parts.push(o); }
    function step(dt) {
      var bc = ctxOf(back);
      var fc = ctxOf(front);
      if (!bc || !fc) { parts = []; return; }
      var w = root.innerWidth || 800;
      var h = root.innerHeight || 600;
      bc.clearRect(0, 0, w, h);
      fc.clearRect(0, 0, w, h);
      var keep = [];
      for (var i = 0; i < parts.length; i++) {
        var q = parts[i];
        q.t += dt;
        if (q.t >= q.life) continue;
        keep.push(q);
        var k = q.t / q.life;
        q.vx *= Math.pow(q.drag || 0.98, dt * 60);
        q.vy *= Math.pow(q.drag || 0.98, dt * 60);
        q.vy += (q.g || 0) * dt;
        q.x += q.vx * dt;
        q.y += q.vy * dt;
        var ctx = q.layer === "front" ? fc : bc;
        if (q.type === "smoke") {
          var r = q.r0 + (q.r1 - q.r0) * k;
          var a = q.a * Math.sin(Math.PI * Math.min(1, k * 1.15));
          var g = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, r);
          g.addColorStop(0, "rgba(" + q.c + "," + a + ")");
          g.addColorStop(1, "rgba(" + q.c + ",0)");
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(q.x, q.y, r, 0, 6.283);
          ctx.fill();
        } else if (q.type === "flame") {
          var rr = q.r0 * (1 - k * 0.75);
          var hot = 1 - k;
          var g2 = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, Math.max(1, rr));
          g2.addColorStop(0, "rgba(255," + ((200 + 55 * hot) | 0) + "," + ((120 * hot) | 0) + "," + (0.85 * hot) + ")");
          g2.addColorStop(0.45, "rgba(255," + ((110 + 80 * hot) | 0) + ",20," + (0.55 * hot) + ")");
          g2.addColorStop(1, "rgba(160,30,0,0)");
          ctx.fillStyle = g2;
          ctx.beginPath();
          ctx.arc(q.x, q.y, Math.max(1, rr), 0, 6.283);
          ctx.fill();
        } else if (q.type === "ember" || q.type === "spark") {
          if (q.c) ctx.fillStyle = "rgba(" + q.c + "," + (1 - k) + ")";
          else ctx.fillStyle = "rgba(255," + ((220 - 140 * k) | 0) + "," + ((120 - 100 * k) | 0) + "," + (1 - k) + ")";
          ctx.beginPath();
          ctx.arc(q.x, q.y, Math.max(0.6, q.r0 * (1 - k * 0.5)), 0, 6.283);
          ctx.fill();
        } else if (q.type === "ash") {
          ctx.save();
          ctx.translate(q.x, q.y);
          ctx.rotate(q.t * (q.spin || 1));
          ctx.fillStyle = "rgba(" + q.c + "," + (q.a * (1 - k)) + ")";
          ctx.fillRect(-q.r0, -q.r0 * 0.45, q.r0 * 2, q.r0 * 0.9);
          ctx.restore();
        }
      }
      parts = keep;
    }
    resize();
    return {
      add: add,
      step: step,
      resize: resize,
      stop: function () { alive = false; parts = []; }
    };
    void alive;
  }

  function centerOf(el) {
    if (!el || !el.getBoundingClientRect) return { x: 400, y: 300, s: 200 };
    var r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, s: r.width || 200 };
  }

  function run(ev, kind) {
    return new Promise(function (resolve) {
      var done = false;
      var timers = [];
      var raf = 0;
      var layer = null;
      var fx = null;
      var crit = kind === "crit";
      var reduced = reducedMotion() || !effectsOn();
      var motion = reduced ? "still" : ((ev && MOTIONS.indexOf(ev.motion) >= 0) ? ev.motion : pickMotion());
      var motionMs = reduced ? 0 : (MOTION_MS[motion] || 900);
      var spinDir = ev && ev.dir === -1 ? -1 : 1;
      var useC2 = motion === "c2" && !reduced && root.SSDNSPlainRoll && typeof root.SSDNSPlainRoll.c2Frame === "function";
      var started = Date.now();
      var zoomId = String((ev && (ev.id || ev.rollId)) || "");
      var snapped = false;

      function later(fn, ms) {
        var t = setTimeout(function () { if (!done) fn(); }, ms);
        timers.push(t);
        return t;
      }
      function finish() {
        if (done) return;
        done = true;
        openSkip = null;
        timers.forEach(function (t) { clearTimeout(t); });
        if (raf && root.cancelAnimationFrame) root.cancelAnimationFrame(raf);
        clearTimeout(raf);
        if (fx) fx.stop();
        if (zoomId && openLayer[zoomId] === layer) delete openLayer[zoomId];
        if (layer && layer.parentNode) layer.parentNode.removeChild(layer);
        if (root.document && root.document.body) root.document.body.classList.remove("d20-zoom-open");
        if (root.document) root.document.removeEventListener("keydown", onKey, true);
        resolve();
      }
      function onKey(e) {
        if (!e) return;
        if (e.key === "Escape" || e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          if (landed) finish();
          else land(true);
        }
      }
      if (!root.document || !root.document.body) { resolve(); return; }
      ensureCss();
      var nat = Math.round(Number(ev.nat));
      if (!(nat >= 1 && nat <= 20)) nat = crit ? 20 : 1;
      layer = root.document.createElement("div");
      var failC2 = useC2 && !crit;
      var motionCls = reduced ? " is-reduced" : (useC2 ? " is-c2" : (" is-motion-" + motion + (motion === "c2" ? " is-c2" : "")));
      layer.className = "d20-zoom " + (crit ? "is-crit" : "is-fail") + motionCls + (failC2 ? " is-fail-c2" : "");
      layer.setAttribute("data-motion", motion);
      layer.setAttribute("role", "dialog");
      layer.setAttribute("aria-label", crit ? "Critical hit" : "Fail");
      var blank = faceHtml("", 260);
      var ghosts = motion === "c3"
        ? '<div class="d20-zoom-ghost g1">' + blank + '</div><div class="d20-zoom-ghost g2">' + blank + "</div>"
        : "";
      var rings = motion === "c2"
        ? '<div class="d20-zoom-ring r1"></div><div class="d20-zoom-ring r2"></div><div class="d20-zoom-ring r3"></div>'
        : '<div class="d20-zoom-ring"></div>';
      var failNum = failC2 ? '<div class="d20-zoom-failnum" data-zoom-failnum></div>' : "";
      layer.innerHTML =
        '<canvas class="d20-zoom-back"></canvas>' +
        (failC2 ? '<div class="d20-zoom-vig" data-zoom-vig></div>' : "") +
        '<div class="d20-zoom-stage">' + rings + '<div class="d20-zoom-mover">' +
        ghosts +
        '<div class="d20-zoom-spin" data-zoom-die>' + blank + "</div>" +
        '<div class="d20-zoom-face"><div class="d20-zoom-heat"></div>' + (crit ? "" : crackSvg()) + "</div>" +
        '<div class="d20-zoom-read" data-zoom-read>' + failNum + "</div>" +
        "</div></div>" +
        '<canvas class="d20-zoom-front"></canvas>' +
        '<p class="d20-zoom-who" data-zoom-who hidden></p>' +
        '<p class="d20-zoom-word">' + (crit ? "Critical" : "Fail") + "</p>" +
        '<button type="button" class="d20-zoom-skip">Tap to skip</button>';
      root.document.body.classList.add("d20-zoom-open");
      root.document.body.appendChild(layer);
      if (zoomId) openLayer[zoomId] = layer;
      var spin = layer.querySelector("[data-zoom-die]");
      watchArt(spin);
      fx = makeFx(layer.querySelector(".d20-zoom-back"), layer.querySelector(".d20-zoom-front"));
      paintWho(layer, ev);
      if (!reduced) cueFirst(tumbleCues(motion));
      function skipTo() { if (landed) finish(); else land(true); }
      openSkip = skipTo;
      layer.addEventListener("click", skipTo);
      root.document.addEventListener("keydown", onKey, true);

      var emit = null;
      var landed = false;
      function burst(c, n) {
        for (var i = 0; i < n; i++) {
          var a = rnd(0, 6.283);
          var sp = rnd(160, 520);
          fx.add({
            type: "ember", x: c.x + Math.cos(a) * c.s * 0.3, y: c.y + Math.sin(a) * c.s * 0.3,
            vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.75 - 40, g: 280, drag: 0.96,
            r0: rnd(1.4, 3), t: 0, life: rnd(0.4, 0.9)
          });
        }
      }
      function fireTrail(c) {
        fx.add({
          type: "flame", x: c.x + rnd(-c.s * 0.2, c.s * 0.15), y: c.y + rnd(-c.s * 0.1, c.s * 0.2),
          vx: rnd(-40, 20), vy: rnd(-80, -20), r0: c.s * rnd(0.08, 0.18), t: 0, life: rnd(0.25, 0.5)
        });
        if (Math.random() < 0.7) {
          fx.add({
            type: "ember", x: c.x + rnd(-c.s * 0.3, c.s * 0.2), y: c.y,
            vx: rnd(-60, 40), vy: rnd(-140, -30), g: 80, drag: 0.97, r0: rnd(1.2, 2.4), t: 0, life: rnd(0.4, 0.9)
          });
        }
      }
      function gunsmoke(c) {
        for (var i = 0; i < 10; i++) {
          var dir = Math.random() < 0.5 ? -1 : 1;
          fx.add({
            type: "smoke", c: "128,118,104", a: 0.22,
            x: c.x + dir * c.s * rnd(0.1, 0.35), y: c.y + c.s * rnd(0.15, 0.4),
            vx: dir * rnd(40, 140), vy: -rnd(8, 40), drag: 0.96,
            r0: c.s * 0.08, r1: c.s * rnd(0.28, 0.5), t: 0, life: rnd(0.9, 1.6)
          });
        }
      }
      function failHaze(c) {
        if (Math.random() < 0.65) {
          fx.add({
            type: "smoke", c: Math.random() < 0.55 ? "120,66,96" : "160,96,112", a: 0.34,
            x: c.x + rnd(-c.s * 0.35, c.s * 0.35), y: c.y + c.s * rnd(0.28, 0.48),
            vx: rnd(-22, 22), vy: -rnd(18, 60), drag: 0.99,
            r0: c.s * 0.1, r1: c.s * rnd(0.4, 0.7), t: 0, life: rnd(1.2, 2.1)
          });
        }
        if (Math.random() < 0.35) {
          fx.add({
            type: "ash", c: Math.random() < 0.5 ? "170,160,150" : "120,96,104", a: 0.8,
            x: c.x + rnd(-c.s * 0.6, c.s * 0.6), y: c.y - c.s * rnd(0.2, 0.7),
            vx: rnd(-16, 16), vy: rnd(16, 48), g: 12, r0: rnd(1.4, 3.2), spin: rnd(-4, 4), t: 0, life: rnd(1.1, 2)
          });
        }
      }
      function spark(c) {
        fx.add({
          type: "spark", x: c.x + rnd(-c.s * 0.4, c.s * 0.4), y: c.y + rnd(-c.s * 0.4, c.s * 0.4),
          vx: rnd(-180, 180), vy: rnd(-180, 80), g: 200, r0: rnd(1.1, 2.2), t: 0, life: rnd(0.2, 0.45)
        });
      }
      function roseSpark(c) {
        fx.add({
          type: "spark", c: Math.random() < 0.6 ? "200,120,130" : "150,130,124",
          x: c.x + rnd(-c.s * 0.35, c.s * 0.35), y: c.y + rnd(-c.s * 0.35, c.s * 0.35),
          vx: rnd(-160, 160), vy: rnd(-160, 40), g: 260, drag: 0.94, r0: rnd(1, 2.2), t: 0, life: rnd(0.25, 0.5)
        });
      }

      if (!reduced && motion === "roll") {
        emit = function (c) {
          var k = (Date.now() - started) / motionMs;
          if (crit) fireTrail(c);
          else if (k < 0.55) fireTrail(c);
          else failHaze(c);
        };
      } else if (!reduced && (motion === "c1" || motion === "c3")) {
        emit = function (c) { spark(c); };
      } else if (!reduced && motion === "c2") {
        emit = function (c) {
          if (crit) { if (Math.random() < 0.6) spark(c); return; }
          roseSpark(c);
        };
      }

      var last = Date.now();
      function loop() {
        if (done) return;
        var now = Date.now();
        var dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        if (useC2 && !snapped && spin) {
          var elapsed = (Date.now() - started) / 1000;
          if (failC2) applyFail(elapsed);
          else {
            var fr = root.SSDNSPlainRoll.c2Frame(elapsed, { D: C2_TOTAL_MS / 1000, dir: spinDir, value: nat });
            spin.style.transform = "translateY(" + fr.y.toFixed(2) + "px) rotate(" + fr.rot.toFixed(2) + "deg) scale(" + fr.scale.toFixed(4) + ")";
            spin.style.filter = "blur(" + Math.max(0, fr.blur).toFixed(2) + "px) drop-shadow(0 0 12px rgba(226,197,106,.35))";
          }
        }
        if (emit && !landed) emit(centerOf(layer.querySelector(".d20-zoom-mover")));
        if (landed && !crit) failHaze(centerOf(layer.querySelector(".d20-zoom-mover")));
        if (landed && crit && Math.random() < 0.45) {
          var cc = centerOf(layer.querySelector(".d20-zoom-mover"));
          fx.add({
            type: "ember", x: cc.x + rnd(-cc.s * 0.35, cc.s * 0.35), y: cc.y + cc.s * rnd(0, 0.35),
            vx: rnd(-18, 18), vy: -rnd(30, 90), drag: 0.99, r0: rnd(1, 2), t: 0, life: rnd(0.6, 1.2)
          });
        }
        if (fx) fx.step(dt);
        if (root.requestAnimationFrame) raf = root.requestAnimationFrame(loop);
        else raf = setTimeout(function () { loop(); }, 32);
      }
      loop();

      function applyFail(t) {
        var Look = root.SSDNSPlainRoll && root.SSDNSPlainRoll.c2FailLook;
        if (!Look) return;
        var look = Look(t, { D: C2_TOTAL_MS / 1000, dir: spinDir });
        var mover = layer.querySelector(".d20-zoom-mover");
        var face = layer.querySelector(".d20-zoom-face");
        var read = layer.querySelector("[data-zoom-read]");
        var stage = layer.querySelector(".d20-zoom-stage");
        var numEl = layer.querySelector("[data-zoom-failnum]");
        var word = layer.querySelector(".d20-zoom-word");
        var vig = layer.querySelector("[data-zoom-vig]");
        var spinTf = "rotate(" + look.rot.toFixed(2) + "deg)";
        if (mover) mover.style.transform = "translateY(" + (look.y + look.sagY).toFixed(2) + "px) scale(" + look.scale.toFixed(4) + ") rotate(" + look.sagR.toFixed(2) + "deg)";
        if (spin) {
          spin.style.transform = spinTf;
          spin.style.filter = "blur(" + look.blur.toFixed(2) + "px) brightness(" + look.bright.toFixed(3) + ") saturate(" + look.sat.toFixed(3) + ")";
        }
        if (face) face.style.transform = spinTf;
        if (read) read.style.transform = spinTf;
        if (stage) stage.style.transform = "translate(" + look.shake[0].toFixed(2) + "px," + look.shake[1].toFixed(2) + "px)";
        if (numEl) {
          if (look.numOpacity <= 0.001) { numEl.textContent = ""; numEl.style.opacity = "0"; }
          else {
            numEl.textContent = String(nat);
            numEl.style.opacity = String(look.numOpacity);
            numEl.style.color = look.numColor;
            numEl.style.transform = "translateY(-50%) scale(" + look.numScale.toFixed(3) + ")";
          }
        }
        var paths = layer.querySelectorAll(".d20-zoom-crack path");
        for (var ci = 0; ci < paths.length; ci++) {
          paths[ci].setAttribute("pathLength", "1");
          paths[ci].style.strokeDasharray = "1";
          paths[ci].style.strokeDashoffset = String(look.cracks[ci % 5]);
        }
        if (word) {
          word.style.opacity = String(look.wordOpacity);
          word.style.transform = "translateY(" + look.wordY.toFixed(2) + "px)";
          word.style.letterSpacing = look.tracking.toFixed(3) + "em";
        }
        if (vig) vig.style.opacity = String(look.vig);
        var ringNodes = layer.querySelectorAll(".d20-zoom-ring");
        for (var ri = 0; ri < ringNodes.length && ri < look.rings.length; ri++) {
          ringNodes[ri].style.opacity = String(look.rings[ri].opacity);
          ringNodes[ri].style.transform = "translate(-50%,-50%) scale(" + look.rings[ri].scale.toFixed(3) + ")";
        }
        if (layer) layer.style.opacity = String(look.content);
      }
      function land(skip) {
        if (done || landed) return;
        landed = true;
        emit = null;
        if (skip || motion !== "c2") layer.classList.remove("is-motion-roll", "is-motion-c1", "is-motion-c2", "is-motion-c3");
        if (skip && useC2 && spin && root.SSDNSPlainRoll) {
          snapped = true;
          if (failC2) applyFail(C2_TOTAL_MS / 1000);
          else {
            var endFr = root.SSDNSPlainRoll.c2Frame(C2_TOTAL_MS / 1000, { D: C2_TOTAL_MS / 1000, dir: spinDir, value: nat });
            spin.style.transform = "translateY(0px) rotate(" + endFr.rot.toFixed(2) + "deg) scale(1)";
            spin.style.filter = "none";
          }
        }
        layer.classList.add("is-land");
        if (!reduced && !skip && motion === "c1") layer.classList.add("is-bump");
        if (!reduced && !skip && motion === "c2") {
          layer.classList.add("is-ring");
          layer.classList.add("is-shake");
        }
        if (spin) {
          spin.innerHTML = faceHtml(failC2 ? "" : nat, 260);
          watchArt(spin);
          if (!failC2) {
            tintNumber(spin, crit);
            var slot = layer.querySelector("[data-zoom-read]");
            var glyph = spin.querySelector(".die-num, .d20-zoom-rawnum");
            if (slot && glyph) slot.appendChild(glyph);
          }
        }
        var c = centerOf(layer.querySelector(".d20-zoom-mover"));
        if (crit) {
          burst(c, 28);
          gunsmoke(c);
        } else {
          for (var i = 0; i < 8; i++) {
            fx.add({
              type: "ash", c: "150,130,130", a: 0.9, x: c.x, y: c.y,
              vx: rnd(-140, 140), vy: rnd(-160, -20), g: 360, r0: rnd(1.4, 3), spin: rnd(-6, 6), t: 0, life: rnd(0.5, 1)
            });
          }
        }
        if (!reduced && !skip) cueFirst(landCues(motion, crit));
        var hold = (!skip && motion === "c2" && !reduced) ? Math.max(HOLD_MS, C2_TOTAL_MS - motionMs) : HOLD_MS;
        later(finish, hold);
      }

      if (reduced || motionMs <= 0) land(true);
      else later(function () { land(false); }, motionMs);
    });
  }

  function ensurePose(ev) {
    ev = ev || {};
    var id = String(ev.id || ev.rollId || "");
    if (id && posed[id]) return posed[id];
    var nat = Math.round(Number(ev.nat != null ? ev.nat : ev.value));
    var synced = ev.kind === "plain" || ev.kind === "crit" || ev.kind === "fumble";
    var kind = synced ? ev.kind : kindOf(Object.assign({}, ev, { nat: nat }));
    if (!kind) {
      if (!(nat >= 1 && nat <= 20)) return null;
      kind = "plain";
    }
    if (!(nat >= 1 && nat <= 20)) nat = kind === "fumble" ? 1 : 20;
    var dir = ev.dir === -1 || ev.dir === 1 ? ev.dir : (Math.random() < 0.5 ? -1 : 1);
    var motion = "c2";
    var D = 4;
    var land = 2.85;
    var mult = Number(ev.mult);
    if (kind === "plain") {
      motion = "fast";
      var given = Number(ev.D);
      D = isFinite(given) && given > 0 ? given : 1.05;
      land = D;
    } else {
      motion = (ev.motion && MOTIONS.indexOf(ev.motion) >= 0) ? ev.motion : pickMotion();
      if (!(mult >= 2 && mult <= 3)) mult = Math.round((2 + Math.random()) * 100) / 100;
      var givenSpin = Number(ev.D);
      D = isFinite(givenSpin) && givenSpin > 0 ? givenSpin : Math.round(1.05 * mult * 1000) / 1000;
      land = D;
    }
    var out = {
      id: id,
      value: nat,
      nat: nat,
      D: D,
      land: land,
      dir: dir,
      kind: kind,
      motion: motion
    };
    if (kind !== "plain") out.mult = mult;
    if (kind === "crit") { out.crit = true; out.result = "crit"; }
    else if (kind === "fumble") { out.crit = false; out.result = "miss"; }
    if (ev.fancy || ev.challenge) out.fancy = true;
    if (ev.label) out.label = String(ev.label).slice(0, 60);
    var min = Number(ev.critMin);
    if (isFinite(min) && min >= 2 && min <= 20) out.critMin = Math.round(min);
    var who = rollerName(ev);
    if (who) out.who = who;
    if (id) posed[id] = out;
    return out;
  }
  function startPose(p) {
    if (!p) return Promise.resolve();
    var id = p.id || "";
    if (id && seen[id]) {
      if (openLayer[id]) paintWho(openLayer[id], p);
      return seen[id];
    }
    var job = tail.then(function () {
      var Plain = root.SSDNSPlainRoll;
      if (!p.fancy) {
        if (!Plain || typeof Plain.play !== "function") return;
        return Plain.play(Object.assign({}, p, {
          suspense: false, fancy: false, challenge: false, kind: "plain", motion: "spin"
        }));
      }
      if (p.kind === "plain") {
        if (!Plain || typeof Plain.play !== "function") return;
        return Plain.play(p);
      }
      var prelude = Promise.resolve();
      if (Plain && typeof Plain.play === "function") {
        prelude = Plain.play(Object.assign({}, p, { suspense: true, fancy: true }));
      }
      return prelude.then(function () {
        return run(p, p.kind === "fumble" ? "fumble" : "crit");
      });
    });
    var safe = job.then(function () {}, function () {});
    tail = safe;
    if (id) {
      seen[id] = safe;
      var wipe = setTimeout(function () { if (seen[id] === safe) delete seen[id]; }, 20000);
      if (wipe && typeof wipe.unref === "function") wipe.unref();
    }
    return safe;
  }
  function present(ev) {
    return startPose(ensurePose(ev));
  }
  function play(ev) {
    ev = ev || {};
    if (!(ev.fancy || ev.challenge)) {
      var nat = Math.round(Number(ev.nat != null ? ev.nat : ev.value));
      if (!(nat >= 1 && nat <= 20)) return Promise.resolve();
      return present(Object.assign({}, ev, { nat: nat, fancy: false, challenge: false, kind: "plain" }));
    }
    var kind = (ev.kind === "crit" || ev.kind === "fumble") ? ev.kind : kindOf(ev);
    if (kind !== "crit" && kind !== "fumble") {
      return present(Object.assign({}, ev, { kind: "plain", fancy: true }));
    }
    return present(Object.assign({}, ev, { kind: kind, fancy: true }));
  }

  function install() {
    var FX = root.SSDNSMapFx;
    if (!FX || typeof FX.setBeforeEffect !== "function" || hooked) return;
    hooked = true;
    /* Attack tracers do not wait on the reserved show. Only a Challenge zoom does. */
    FX.setBeforeEffect(function (ev) {
      if (ev && (ev.fancy || ev.challenge)) return play(ev);
      return Promise.resolve();
    }, { timeoutMs: 15000 });
  }

  if (root.addEventListener) {
    root.addEventListener("ssdns-map-fx-pref", function (e) {
      if (e && e.detail && e.detail.on === false && openSkip) openSkip();
    });
  }

  function pack(ev) {
    ev = ev || {};
    var id = String(ev.id || ev.rollId || "");
    if (id && posed[id]) {
      if (!posed[id].fancy || posed[id].kind === "plain") return null;
      return posed[id];
    }
    if (!(ev.fancy || ev.challenge)) return null;
    var kind = kindOf(ev);
    if (!kind) return null;
    var p = ensurePose(Object.assign({}, ev, { fancy: true }));
    if (!p || !p.fancy || p.kind === "plain") return null;
    return p;
  }

  root.SSDNSD20Zoom = {
    play: play,
    present: present,
    pose: ensurePose,
    beforeDamage: play,
    kindOf: kindOf,
    pack: pack,
    effectsOn: effectsOn,
    reducedMotion: reducedMotion,
    motions: MOTIONS.slice(),
    motionMs: { roll: MOTION_MS.roll, c1: MOTION_MS.c1, c2: MOTION_MS.c2, c3: MOTION_MS.c3, c2Total: C2_TOTAL_MS },
    pickMotion: pickMotion,
    rollerName: rollerName,
    cues: { tumble: tumbleCues, land: landCues },
    install: install
  };
  install();
})(typeof window !== "undefined" ? window : globalThis);

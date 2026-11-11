/* Compact Challenge d20 card. Reusable for a later "who is rolling" view on
   player sheets. This draft only shows cards when the audience is the DM.
   The host ignores clicks, so a map under the empty corner still receives them.
   Each card is clickable and dismisses itself. */
(function (root) {
  "use strict";

  var audience = "off";
  var portraitLookup = null;
  var holdMs = 5000;
  var spinMs = 900;
  var host = null;
  var cards = {};

  function setAudience(who) {
    audience = who === "dm" ? "dm" : "off";
  }
  function enabled() { return audience === "dm"; }
  function setPortraitLookup(fn) { portraitLookup = typeof fn === "function" ? fn : null; }
  function setTiming(opts) {
    opts = opts || {};
    if (opts.holdMs != null) holdMs = Math.max(0, Number(opts.holdMs) || 0);
    if (opts.spinMs != null) spinMs = Math.max(0, Number(opts.spinMs) || 0);
  }

  function wants(ev, row) {
    ev = ev || {};
    row = row || {};
    if (ev.challenge || ev.lockpick || row.challenge || row.lockpick) return true;
    if (row.event === "prop-shove" && (row.die || row.zoom || row.nat != null)) return true;
    var label = String(ev.label || ev.check || row.check || row.label || "").toLowerCase();
    return /pick lock|force|improvise|shove/.test(label);
  }

  function numIn(text, re) {
    var m = re.exec(String(text || ""));
    return m ? Number(m[1]) : null;
  }
  function fromFeed(row) {
    row = row || {};
    var die = row.zoom || row.die || {};
    var blob = row.text || row.detail || "";
    var nat = Number(die.nat != null ? die.nat : (die.value != null ? die.value : row.nat));
    var total = row.total != null ? Number(row.total) : (row.result != null && row.formula ? Number(row.result) : null);
    if (!isFinite(total)) total = numIn(blob, /=\s*(-?\d+)/);
    var dc = row.dc != null && row.dc !== "" ? Number(row.dc) : numIn(blob, /vs DC\s+(\d+)/i);
    var success = row.success;
    if (success == null && isFinite(dc) && isFinite(total) && isFinite(nat)) success = nat !== 1 && total >= dc;
    var name = row.characterName || row.fromName || die.who || row.who || "";
    return {
      id: String(row.id || die.id || ""),
      name: String(name || ""),
      portrait: row.portrait || "",
      label: row.check || die.label || row.label || "Challenge",
      nat: isFinite(nat) ? nat : null,
      total: isFinite(total) ? total : null,
      dc: isFinite(dc) ? dc : null,
      success: success == null ? null : !!success,
      lockpick: !!(die.lockpick || row.lockpick)
    };
  }

  function initials(name) {
    var n = String(name || "").replace(/["“”].*$/, "").trim();
    var parts = n.split(/\s+/).filter(Boolean);
    if (!parts.length) return "?";
    return ((parts[0].charAt(0) || "") + (parts.length > 1 ? parts[1].charAt(0) : "")).toUpperCase();
  }
  function portraitSrc(src) {
    src = String(src || "");
    if (/^(data:image\/|https?:\/\/|blob:)/.test(src)) return src;
    return "";
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function ensureCss() {
    if (!root.document || root.document.getElementById("ssdns-roll-card-css")) return;
    var style = root.document.createElement("style");
    style.id = "ssdns-roll-card-css";
    style.textContent = [
      "#ssdns-roll-cards{position:fixed;right:16px;bottom:16px;z-index:80;display:flex;flex-direction:column-reverse;align-items:flex-end;gap:8px;width:min(300px,calc(100% - 32px));pointer-events:none;}",
      ".ssdns-roll-card{pointer-events:auto;display:grid;grid-template-columns:36px 1fr 54px;gap:8px;align-items:center;width:100%;box-sizing:border-box;padding:8px 10px;background:#1a140c;color:#f4e6c4;border:1px solid #e2c56a;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.45);font:13px/1.3 system-ui,sans-serif;cursor:pointer;}",
      ".ssdns-roll-card .face{width:36px;height:36px;border-radius:50%;object-fit:cover;background:#14201c;border:1px solid #8a7048;display:inline-flex;align-items:center;justify-content:center;font:700 12px/1 Georgia,serif;color:#e2c56a;}",
      ".ssdns-roll-card .copy{display:flex;flex-direction:column;min-width:0;}",
      ".ssdns-roll-card .who{font:700 14px/1.2 Georgia,serif;color:#f4e6c4;}",
      ".ssdns-roll-card .check{color:#e2c56a;font-size:12px;}",
      ".ssdns-roll-card .result{color:#cbb892;font-size:12px;}",
      ".ssdns-roll-card .result.ok{color:#7dcea0;}",
      ".ssdns-roll-card .result.bad{color:#e07060;}",
      ".ssdns-roll-card .die{width:54px;height:54px;display:grid;place-items:center;position:relative;}",
      ".ssdns-roll-card .die img{width:54px;height:54px;object-fit:contain;}",
      ".ssdns-roll-card .die.spin img{animation:ssdns-roll-spin .9s linear;}",
      ".ssdns-roll-card .die b{position:absolute;inset:0;display:grid;place-items:center;font:700 16px/1 Georgia,serif;color:#4fdccb;-webkit-text-stroke:1px #10211f;opacity:0;}",
      ".ssdns-roll-card.is-land .die b{opacity:1;}",
      "@keyframes ssdns-roll-spin{from{transform:rotate(0)}to{transform:rotate(720deg)}}"
    ].join("");
    root.document.head.appendChild(style);
  }
  function ensureHost() {
    if (!root.document || !root.document.body) return null;
    ensureCss();
    if (host && host.isConnected) return host;
    host = root.document.getElementById("ssdns-roll-cards");
    if (!host) {
      host = root.document.createElement("div");
      host.id = "ssdns-roll-cards";
      host.setAttribute("aria-live", "polite");
      root.document.body.appendChild(host);
    }
    return host;
  }
  function dieSrc() {
    if (root.SSDNSDice && typeof root.SSDNSDice.src === "function") {
      try { return root.SSDNSDice.src(20); } catch (e) {}
    }
    var path = "";
    try { path = (root.location && root.location.pathname) || ""; } catch (e2) {}
    var pre = path.indexOf("/dm/") >= 0 || path.indexOf("/tools/") >= 0 ? "../" : "";
    return pre + "assets/img/dice/d20.webp";
  }
  function cues(spec) {
    var S = root.SSDNSChallengeSfx;
    if (S && spec.lockpick && typeof S.lockpick === "function") {
      try { S.lockpick(); } catch (e) {}
    }
    if (S && typeof S.mid === "function") {
      try { S.mid(); } catch (e2) {}
    }
    return function land() {
      var A = root.SSDNSAudio;
      if (!A || typeof A.play !== "function") return;
      if (spec.nat === 20) { try { A.play("challenge-nat20-crit"); } catch (e3) {} }
      else if (spec.nat === 1) { try { A.play("challenge-fail"); } catch (e4) {} }
    };
  }
  function resultText(spec) {
    if (spec.total == null || !isFinite(Number(spec.total))) return "";
    var line = String(spec.total);
    if (spec.dc != null && isFinite(Number(spec.dc))) {
      var ok = spec.success != null ? !!spec.success : (spec.nat !== 1 && Number(spec.total) >= Number(spec.dc));
      line += " vs DC " + spec.dc + " · " + (ok ? "success" : "fail");
    }
    return line;
  }
  function dismiss(id) {
    var rec = cards[id];
    if (!rec) return;
    clearTimeout(rec.timer);
    clearTimeout(rec.landTimer);
    if (rec.el && rec.el.parentNode) rec.el.parentNode.removeChild(rec.el);
    delete cards[id];
  }
  function show(spec) {
    if (!enabled() || !root.document || !root.document.body) return null;
    spec = spec || {};
    var id = String(spec.id || ("rollcard_" + Date.now().toString(36)));
    if (cards[id]) return cards[id].el;
    var box = ensureHost();
    if (!box) return null;
    var name = spec.name || "Someone";
    var src = portraitSrc(spec.portrait || (portraitLookup ? portraitLookup(name) : ""));
    var face = src
      ? '<img class="face" alt="" src="' + esc(src) + '">'
      : '<span class="face">' + esc(initials(name)) + "</span>";
    var el = root.document.createElement("button");
    el.type = "button";
    el.className = "ssdns-roll-card";
    el.setAttribute("data-roll-card", id);
    el.innerHTML = face +
      '<span class="copy"><span class="who"></span><span class="check"></span><span class="result"></span></span>' +
      '<span class="die spin"><img alt="" src="' + esc(dieSrc()) + '"><b></b></span>';
    el.querySelector(".who").textContent = name;
    el.querySelector(".check").textContent = spec.label || "Challenge";
    var onLand = cues(spec);
    var rec = { el: el, timer: 0, landTimer: 0 };
    cards[id] = rec;
    function land() {
      if (!cards[id]) return;
      el.classList.add("is-land");
      el.querySelector(".die").classList.remove("spin");
      if (spec.nat != null) el.querySelector(".die b").textContent = String(spec.nat);
      var result = el.querySelector(".result");
      var text = resultText(spec);
      result.textContent = text;
      var ok = spec.success;
      if (ok == null && spec.dc != null && spec.total != null && spec.nat != null) ok = spec.nat !== 1 && Number(spec.total) >= Number(spec.dc);
      if (ok === true) result.classList.add("ok");
      else if (ok === false) result.classList.add("bad");
      onLand();
    }
    el.addEventListener("click", function () { dismiss(id); });
    var broken = el.querySelector("img.face");
    if (broken) broken.addEventListener("error", function () {
      var span = root.document.createElement("span");
      span.className = "face";
      span.textContent = initials(name);
      broken.replaceWith(span);
    });
    box.appendChild(el);
    rec.landTimer = setTimeout(land, spinMs);
    rec.timer = setTimeout(function () { dismiss(id); }, holdMs);
    return el;
  }
  function offer(spec) {
    if (!enabled()) return null;
    return show(spec);
  }

  root.SSDNSRollCard = {
    setAudience: setAudience,
    enabled: enabled,
    setPortraitLookup: setPortraitLookup,
    setTiming: setTiming,
    wants: wants,
    fromFeed: fromFeed,
    show: show,
    offer: offer,
    dismiss: dismiss,
    initials: initials,
    count: function () { return Object.keys(cards).length; }
  };
})(typeof window !== "undefined" ? window : globalThis);

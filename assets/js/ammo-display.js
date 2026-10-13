/* Shared ammo picture for the Gear tab, the Fight strip, and the map drawer.
   Off unless SSDNS_AMMO_DISPLAY is true, localStorage ssdns.ammoDisplay is "on",
   or the page URL has ammoDisplay=1. Calling html() or mount() always draws;
   the three hosts check enabled() first and keep today's markup when it is off.
   Clicks stay on the buttons the hosts already listen for. This file does not
   spend rounds or change a roll. */
(function (root) {
  "use strict";

  function enabled() {
    if (root.SSDNS_AMMO_DISPLAY === true) return true;
    try {
      if (root.localStorage && root.localStorage.getItem("ssdns.ammoDisplay") === "on") return true;
    } catch (e) {}
    try {
      var q = root.location && root.location.search || "";
      if (/[?&]ammoDisplay=1(?:&|$)/.test(q)) return true;
    } catch (e2) {}
    return false;
  }

  function catalogAction(weapon) {
    var id = weapon.weapon || weapon.weaponId || "";
    var name = weapon.name || "";
    var list = (root.SSDNS_RULES && root.SSDNS_RULES.firearms) || [];
    for (var i = 0; i < list.length; i++) {
      var row = list[i];
      if (!row) continue;
      if (id && row.id === id) return row.action || "";
      if (name && row.name === name) return row.action || "";
    }
    return "";
  }

  function kind(weapon) {
    weapon = weapon || {};
    var override = String(weapon.ammoDisplay || "").toLowerCase();
    if (override === "cylinder" || override === "tube" || override === "dots") return override;
    var action = String(weapon.action || catalogAction(weapon) || "").toLowerCase();
    var name = String(weapon.name || "").toLowerCase();
    var src = action || name;
    if (/pepperbox/.test(src)) return "dots";
    if (/revolver/.test(src) || /caster cylinder/.test(src) || /\bcylinder\b/.test(src)) return "cylinder";
    if (/lever/.test(src) || /\btube\b/.test(src)) return "tube";
    return "dots";
  }

  function chamberState(raw) {
    if (raw && typeof raw === "object") {
      var named = String(raw.state || raw.ammo || "");
      if (named === "jam" || named === "misfire" || raw.jam) return "jam";
      if (named === "spent" || named === "empty") return "spent";
      if (raw.loaded || named === "loaded") return "loaded";
      return "spent";
    }
    if (raw === 0 || raw === false || raw == null) return "spent";
    var s = String(raw);
    if (!s || s === "0" || s === "false") return "spent";
    if (/^(jam|misfire)$/i.test(s)) return "jam";
    return "loaded";
  }

  function modelOf(spec) {
    spec = spec || {};
    var flags = Array.isArray(spec.chambers) ? spec.chambers : null;
    var cap = Number(spec.cap != null ? spec.cap : spec.capacity);
    if (!isFinite(cap) || cap < 0) cap = flags ? flags.length : 0;
    cap = Math.min(15, Math.floor(cap));
    var loadedN = Number(spec.loaded);
    if (!isFinite(loadedN)) loadedN = 0;
    var chambers = [];
    for (var k = 0; k < cap; k++) {
      var raw = flags ? flags[k] : (k < loadedN ? 1 : "");
      chambers.push({ index: k, state: chamberState(raw), raw: raw });
    }
    var filled = chambers.filter(function (c) { return c.state !== "spent"; }).length;
    return { cap: cap, filled: filled, chambers: chambers, jammed: !!spec.jammed };
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function attrString(spec, k) {
    var parts = [];
    if (spec.attr) parts.push(String(spec.attr));
    var extra = {};
    if (typeof spec.attrs === "function") extra = spec.attrs(k) || {};
    else if (spec.attrs && typeof spec.attrs === "object") {
      Object.keys(spec.attrs).forEach(function (key) {
        var v = spec.attrs[key];
        extra[key] = typeof v === "function" ? v(k) : v;
      });
    }
    if (extra["data-k"] == null) extra["data-k"] = String(k);
    Object.keys(extra).forEach(function (key) {
      if (extra[key] == null || extra[key] === false) return;
      parts.push(esc(key) + '="' + esc(extra[key]) + '"');
    });
    return parts.join(" ");
  }

  function roundText(spec, chamber) {
    if (typeof spec.label !== "function") return "";
    return spec.label(chamber.index, chamber) || "";
  }

  function roundButton(spec, chamber, style) {
    var word = chamber.state === "loaded" ? "Loaded" : (chamber.state === "jam" ? "Misfire" : "Spent");
    var next = spec.next === chamber.index ? " is-next" : "";
    var text = roundText(spec, chamber);
    return '<button type="button" class="ammo-round is-' + chamber.state + next + '"' +
      (style ? ' style="' + style + '"' : "") +
      " " + attrString(spec, chamber.index) +
      ' aria-label="' + esc(word + " chamber " + (chamber.index + 1)) + '">' + esc(text) + "</button>";
  }

  function rimPath(n) {
    var count = Math.max(n, 1);
    var steps = count * 16;
    var d = [];
    for (var i = 0; i <= steps; i++) {
      var a = -Math.PI / 2 + (i / steps) * Math.PI * 2;
      var spoke = ((a + Math.PI / 2) / (Math.PI * 2)) * count;
      var frac = spoke - Math.floor(spoke);
      var dist = Math.min(frac, 1 - frac);
      var notch = dist < 0.16 ? (0.16 - dist) / 0.16 : 0;
      var r = 46 - notch * 5.5;
      var x = 50 + Math.cos(a) * r;
      var y = 50 + Math.sin(a) * r;
      d.push((i ? "L" : "M") + x.toFixed(2) + "," + y.toFixed(2));
    }
    return d.join(" ") + "Z";
  }

  function sizeClass(spec) {
    var size = String(spec.size || "");
    if (size === "drawer" || size === "strip" || size === "gear" || size === "demo") return " is-" + size;
    return "";
  }

  function cylinderHtml(spec, model) {
    var n = Math.max(model.cap, 1);
    var diameter = n >= 8 ? 15 : (n === 7 ? 16 : (n <= 5 ? 20 : 18));
    var buttons = model.chambers.map(function (chamber) {
      var ang = -Math.PI / 2 + (chamber.index * 2 * Math.PI / n);
      var cx = 50 + Math.cos(ang) * 29;
      var cy = 50 + Math.sin(ang) * 29;
      var style = "left:" + cx.toFixed(2) + "%;top:" + cy.toFixed(2) + "%;width:" + diameter + "%;height:" + diameter + "%";
      return roundButton(spec, chamber, style);
    }).join("");
    var jammed = model.jammed ? " is-jammed" : "";
    return '<span class="ssdns-ammo ssdns-ammo-cylinder' + sizeClass(spec) + jammed + '" data-ammo-kind="cylinder" data-ammo-cap="' + model.cap + '">' +
      '<svg class="ammo-cylinder-svg" viewBox="0 0 100 100" aria-hidden="true">' +
      '<path class="ammo-rim" d="' + rimPath(n) + '"/>' +
      '<circle class="ammo-pin" cx="50" cy="50" r="7"/>' +
      '<circle class="ammo-pin-core" cx="50" cy="50" r="2.4"/>' +
      "</svg>" + buttons + "</span>";
  }

  function springPath() {
    var d = "M0,10";
    for (var i = 0; i < 10; i++) {
      d += " L" + ((i + 0.5) * 10) + "," + (i % 2 ? 2 : 18);
      d += " L" + ((i + 1) * 10) + ",10";
    }
    return d;
  }

  function tubeHtml(spec, model) {
    var cap = Math.max(model.cap, 1);
    var follower = (model.filled / cap) * 84;
    var buttons = model.chambers.map(function (chamber) {
      var left = ((chamber.index + 0.5) / cap) * 84;
      return roundButton(spec, chamber, "left:" + left.toFixed(2) + "%");
    }).join("");
    var jammed = model.jammed ? " is-jammed" : "";
    return '<span class="ssdns-ammo ssdns-ammo-tube' + sizeClass(spec) + jammed + '" data-ammo-kind="tube" data-ammo-cap="' + model.cap + '" data-ammo-filled="' + model.filled + '">' +
      '<span class="ammo-tube">' + buttons +
      '<span class="ammo-follower" style="left:' + follower.toFixed(2) + '%"></span>' +
      '<svg class="ammo-spring" style="left:calc(' + follower.toFixed(2) + '% + 12px);width:calc(100% - ' + follower.toFixed(2) + '% - 18px)" viewBox="0 0 100 20" preserveAspectRatio="none" aria-hidden="true">' +
      '<path d="' + springPath() + '"/>' +
      "</svg></span></span>";
  }

  function dotsHtml(spec, model) {
    var jammed = model.jammed ? " is-jammed" : "";
    var buttons = model.chambers.map(function (chamber) { return roundButton(spec, chamber, ""); }).join("");
    return '<span class="ssdns-ammo ssdns-ammo-dots' + sizeClass(spec) + jammed + '" data-ammo-kind="dots" data-ammo-cap="' + model.cap + '">' + buttons + "</span>";
  }

  function html(spec) {
    spec = spec || {};
    var type = kind(spec);
    var model = modelOf(spec);
    if (!model.cap) return "";
    if (type === "cylinder") return cylinderHtml(spec, model);
    if (type === "tube") return tubeHtml(spec, model);
    return dotsHtml(spec, model);
  }

  function mount(el, spec) {
    if (!el) return null;
    el.innerHTML = html(spec);
    return el.querySelector(".ssdns-ammo");
  }

  root.SSDNSAmmoDisplay = {
    enabled: enabled,
    kind: kind,
    html: html,
    mount: mount
  };
})(typeof window !== "undefined" ? window : this);

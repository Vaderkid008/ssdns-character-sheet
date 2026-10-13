/* Shared ammo picture for the Gear tab, the Fight strip, and the map drawer.
   Off unless SSDNS_AMMO_DISPLAY is true, localStorage ssdns.ammoDisplay is "on",
   or the page URL has ammoDisplay=1. Calling html() or mount() always draws;
   the three hosts check enabled() first and keep today's markup when it is off.
   Clicks stay on the buttons the hosts already listen for. This file does not
   spend rounds or change a roll. A tube click reports the leftmost loaded
   chamber so the existing fire path spends that round. */
(function (root) {
  "use strict";

  var TONE = {
    light: "#f3e7b3",
    medium: "#e0b84a",
    heavy: "#a86b32",
    bigfifty: "#4d6270",
    buck: "#c4a35a",
    slug: "#6b4f3a",
    percussion: "#7d8b99",
    arrows: "#5e8a55",
    plain: "#d7c07a"
  };
  var HEX = ["#c4b5fd", "#a78bfa", "#8b5cf6", "#7c3aed", "#6d28d9", "#5b21b6", "#4c1d95", "#3b0764", "#2e1065"];

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

  function catalogRow(weapon) {
    weapon = weapon || {};
    var id = weapon.weapon || weapon.weaponId || "";
    var name = weapon.name || "";
    var lists = [(root.SSDNS_RULES && root.SSDNS_RULES.firearms) || [], (root.SSDNS_RULES && root.SSDNS_RULES.casterGuns) || []];
    for (var n = 0; n < lists.length; n++) {
      var list = lists[n];
      for (var i = 0; i < list.length; i++) {
        var row = list[i];
        if (!row) continue;
        if (id && row.id === id) return row;
        if (name && row.name === name) return row;
      }
    }
    return null;
  }

  function catalogAction(weapon) {
    var row = catalogRow(weapon);
    return row && row.action || "";
  }

  function isShotgun(spec) {
    spec = spec || {};
    var row = catalogRow(spec);
    var group = String(spec.group || (row && row.group) || "").toLowerCase();
    var ammo = String(spec.ammo || (row && row.ammo) || "").toLowerCase();
    var name = String(spec.name || (row && row.name) || "").toLowerCase();
    var action = String(spec.action || (row && row.action) || "").toLowerCase();
    if (spec.scatter || (row && row.scatter)) return true;
    if (group === "shotgun" || ammo === "shell") return true;
    return /shotgun/.test(name) || /shotgun/.test(action);
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

  function spendIndex(model) {
    for (var i = 0; i < model.chambers.length; i++) {
      if (model.chambers[i].state !== "spent") return i;
    }
    return -1;
  }

  function toneOf(spec, chamber) {
    var raw = chamber ? chamber.raw : "";
    if (typeof raw === "string") {
      if (/^[1-9]$/.test(raw)) return HEX[Number(raw) - 1] || "#9b6fd6";
      if (raw.indexOf("k:hex:") === 0) {
        var lv = Number(raw.split(":")[2] || 1);
        return HEX[Math.max(0, lv - 1)] || "#9b6fd6";
      }
      if (raw.indexOf("k:") === 0) {
        var kindName = raw.split(":")[1] || "";
        if (TONE[kindName]) return TONE[kindName];
      }
    }
    var tier = String(spec.tier || "").toLowerCase();
    if (TONE[tier]) return TONE[tier];
    var row = catalogRow(spec);
    var ammo = String(spec.ammo || (row && row.ammo) || "").toLowerCase();
    if (TONE[ammo]) return TONE[ammo];
    if (row && row.tiers) {
      var keys = Object.keys(row.tiers);
      if (keys.length === 1 && TONE[keys[0]]) return TONE[keys[0]];
    }
    if (isShotgun(spec)) return TONE[spec.load === "slug" ? "slug" : "buck"];
    return TONE.plain;
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

  function roundButton(spec, chamber, style, indexOverride, extraClass, inner) {
    var k = indexOverride == null ? chamber.index : indexOverride;
    var word = chamber.state === "loaded" ? "Loaded" : (chamber.state === "jam" ? "Misfire" : "Spent");
    var next = spec.next === chamber.index ? " is-next" : "";
    var text = inner != null ? inner : esc(roundText(spec, chamber));
    var cls = extraClass ? " " + extraClass : "";
    return '<button type="button" class="ammo-round is-' + chamber.state + next + cls + '"' +
      (style ? ' style="' + style + '"' : "") +
      " " + attrString(spec, k) +
      ' aria-label="' + esc(word + " chamber " + (chamber.index + 1)) + '">' + text + "</button>";
  }

  function toneStyle(spec, chamber) {
    return "--case:" + toneOf(spec, chamber) + ";";
  }

  function cartSvg() {
    return '<svg class="ammo-cart" viewBox="0 0 48 16" aria-hidden="true">' +
      '<rect x="1" y="3" width="27" height="10" rx="1.4" fill="var(--case,#e0b44a)" stroke="#5c4316" stroke-width="0.6"/>' +
      '<circle cx="6.2" cy="8" r="2.2" fill="#f4f0e8"/>' +
      '<circle cx="6.2" cy="8" r="1.05" fill="#a86b3c"/>' +
      '<path d="M27.5 4.1 H39.5 L46 8 L39.5 11.9 H27.5 Z" fill="#1c1612"/>' +
      "</svg>";
  }

  function shellSvg() {
    return '<svg class="ammo-shell" viewBox="0 0 48 16" aria-hidden="true">' +
      '<rect x="1" y="3" width="13" height="10" rx="1" fill="#d7b15e" stroke="#5c4316" stroke-width="0.5"/>' +
      '<circle cx="5.2" cy="8" r="1.7" fill="#6b3a22"/>' +
      '<rect x="13" y="3.3" width="24" height="9.4" fill="var(--case,#c4a35a)" stroke="#3a2a14" stroke-width="0.4"/>' +
      '<path d="M37 3.6 L46 8 L37 12.4 Z" fill="#efe8da" stroke="#6a6258" stroke-width="0.45"/>' +
      '<path d="M39.2 6.4 L43.2 8 L39.2 9.6" fill="none" stroke="#6a6258" stroke-width="0.45"/>' +
      "</svg>";
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
      var style = "left:" + cx.toFixed(2) + "%;top:" + cy.toFixed(2) + "%;width:" + diameter + "%;height:" + diameter + "%;" + toneStyle(spec, chamber);
      return roundButton(spec, chamber, style, null, "is-primer");
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
    var spend = spendIndex(model);
    var shown = model.chambers.filter(function (c) { return c.state !== "spent"; });
    var wrap = cap >= 10;
    var per = wrap ? Math.ceil(cap / 2) : cap;
    var shell = isShotgun(spec);
    var art = shell ? "is-shell is-cart" : "is-cart";
    var buttons = shown.map(function (chamber, visual) {
      var col = wrap ? (visual % per) : visual;
      var row = wrap ? Math.floor(visual / per) : 0;
      var left = ((col + 0.5) / per) * 84;
      var top = wrap ? (row ? 72 : 28) : 50;
      var style = "left:" + left.toFixed(2) + "%;top:" + top + "%;" + toneStyle(spec, chamber);
      return roundButton(spec, chamber, style, spend, art, shell ? shellSvg() : cartSvg());
    }).join("");
    var fire = spend < 0 ? "" : '<button type="button" class="ammo-tube-fire" ' + attrString(spec, spend) + ' aria-label="Fire the leftmost round"></button>';
    var follower = (model.filled / cap) * 84;
    var jammed = model.jammed ? " is-jammed" : "";
    var compact = wrap ? " is-compact" : "";
    var gun = shell ? " is-shotgun" : "";
    return '<span class="ssdns-ammo ssdns-ammo-tube' + sizeClass(spec) + jammed + compact + gun + '" data-ammo-kind="tube" data-ammo-cap="' + model.cap + '" data-ammo-filled="' + model.filled + '" data-ammo-spend="' + spend + '">' +
      '<span class="ammo-tube">' + fire + buttons +
      '<span class="ammo-follower" style="left:' + follower.toFixed(2) + '%"></span>' +
      '<svg class="ammo-spring" style="left:calc(' + follower.toFixed(2) + '% + 12px);width:calc(100% - ' + follower.toFixed(2) + '% - 18px)" viewBox="0 0 100 20" preserveAspectRatio="none" aria-hidden="true">' +
      '<path d="' + springPath() + '"/>' +
      "</svg></span></span>";
  }

  function dotsHtml(spec, model) {
    var jammed = model.jammed ? " is-jammed" : "";
    var shell = isShotgun(spec);
    var buttons = model.chambers.map(function (chamber) {
      var style = toneStyle(spec, chamber);
      if (shell) return roundButton(spec, chamber, style, null, "is-shell is-cart", shellSvg());
      return roundButton(spec, chamber, style, null, "is-primer");
    }).join("");
    var gun = shell ? " is-shotgun" : "";
    return '<span class="ssdns-ammo ssdns-ammo-dots' + sizeClass(spec) + jammed + gun + '" data-ammo-kind="dots" data-ammo-cap="' + model.cap + '">' + buttons + "</span>";
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

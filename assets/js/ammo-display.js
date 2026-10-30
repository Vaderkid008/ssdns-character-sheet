/* Shared ammo picture for the Gear tab, the Fight strip, and the map drawer.
   On unless localStorage ssdns.ammoDisplay is "off", the page URL has
   ammoDisplay=0, or SSDNS_AMMO_DISPLAY is false. ammoDisplay=1 and
   ssdns.ammoDisplay "on" force it on. Calling html() or mount() always draws;
   the three hosts check enabled() first and keep the old dots when it is off.
   Clicks stay on the buttons the hosts already listen for. This file does not
   spend rounds or change a roll. A tube click reports the leftmost loaded
   chamber so the existing fire path spends that round.
   L0217: a revolver or Caster cylinder keeps position 1 (index 0) under the hammer.
   Chambers 2–N are a free Spin that brings that hole to position 1. Tubes never
   get that ring. L0220: cycleEject drops the chambered tube round out of the gun. */
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
    try {
      var q = root.location && root.location.search || "";
      if (/[?&]ammoDisplay=0(?:&|$)/.test(q)) return false;
      if (/[?&]ammoDisplay=1(?:&|$)/.test(q)) return true;
    } catch (e) {}
    try {
      var stored = root.localStorage && root.localStorage.getItem("ssdns.ammoDisplay");
      if (stored === "off") return false;
      if (stored === "on") return true;
    } catch (e2) {}
    if (root.SSDNS_AMMO_DISPLAY === false) return false;
    return true;
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
    var loose = looseRow(lists, id, name);
    if (loose) return loose;
    var jam = root.SSDNSTestJammer && root.SSDNSTestJammer.lookup && root.SSDNSTestJammer.lookup(id || name);
    if (jam) return jam;
    var peace = root.SSDNSPeaceMaker && root.SSDNSPeaceMaker.lookup && root.SSDNSPeaceMaker.lookup(id || name);
    if (peace) return peace;
    return null;
  }

  /* map token guns (2026-10-20): NPC statblocks name their gun in prose ("Henrietta Repeating Rifle, Medium (.44-40)",
     "Pony Arms ChaosMaker, Heavy (.45 Long)"), so the exact id/name lookup missed and a lever rifle drew as dots.
     Match the catalog row whose every name word is in that text (longest wins), the same gun the player card draws. */
  function words(text) {
    return String(text || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);
  }
  function looseRow(lists, id, name) {
    var have = {};
    words(id + " " + name).forEach(function (w) { have[w] = 1; });
    if (!Object.keys(have).length) return null;
    var best = null, bestN = 0;
    for (var n = 0; n < lists.length; n++) {
      var list = lists[n];
      for (var i = 0; i < list.length; i++) {
        var row = list[i];
        if (!row || !row.name) continue;
        var need = words(row.name);
        if (need.length < 2) continue;
        var ok = need.every(function (w) { return have[w]; });
        if (ok && need.length > bestN) { best = row; bestN = need.length; }
      }
    }
    return best;
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
    var locks = Array.isArray(spec.locked) ? spec.locked.map(function (n) { return Number(n); }) : [];
    var chambers = [];
    for (var k = 0; k < cap; k++) {
      var raw = flags ? flags[k] : (k < loadedN ? 1 : "");
      var state = locks.indexOf(k) >= 0 ? "locked" : chamberState(raw);
      chambers.push({ index: k, state: state, raw: raw });
    }
    var filled = chambers.filter(function (c) { return c.state !== "spent"; }).length;
    return { cap: cap, filled: filled, chambers: chambers, jammed: !!spec.jammed };
  }

  function spendIndex(model) {
    for (var i = 0; i < model.chambers.length; i++) {
      if (model.chambers[i].state !== "spent" && model.chambers[i].state !== "locked") return i;
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

  /* 0.3.54: what the round looks like, keyed off the ammo type (never the gun name).
     ball = powder, ball & caps; cart = brass rim + primer; buck = red hull, brass base;
     rf22 = small brass (.22 / light); hex = dark lead with a green glow. */
  function roundType(spec, chamber) {
    var raw = chamber ? chamber.raw : "";
    if (typeof raw === "string" && (/^[1-9]$/.test(raw) || raw.indexOf("k:hex:") === 0)) return "hex";
    var row = catalogRow(spec);
    var ammo = String(spec.ammo || (row && row.ammo) || "").toLowerCase();
    if (typeof raw === "string" && raw.indexOf("k:") === 0) {
      var kn = raw.split(":")[1] || "";
      if (kn === "percussion") ammo = "percussion";
      else if (kn === "buck" || kn === "slug") ammo = "shell";
    }
    if (ammo === "percussion" || ammo === "ball" || ammo === "powder") return "ball";
    /* 0.3.54: shells keep the original look; only the shotgun repeater gets the red hull. */
    if (ammo === "shell" || ammo === "buck" || ammo === "slug" || isShotgun(spec)) {
      var sid = String((row && row.id) || spec.weapon || spec.weaponId || "");
      var sact = String((row && row.action) || spec.action || "").toLowerCase();
      /* 0.3.54 sample: hull colour comes from the gauge. The repeater's red hull only survives
         for a gauge with no colour of its own, and .410 / 12 / 10 all have one, so it is unused. */
      void sid; void sact;
      return "shell";
    }
    var tier = String(spec.tier || "").toLowerCase();
    if (!tier && row && row.tiers) { var keys = Object.keys(row.tiers); if (keys.length === 1) tier = keys[0]; }
    if (tier === "light" || /\.22\b/.test(String(spec.caliber || ""))) return "rf22";
    return "cart";
  }

  /* Chambers 2–N spin. They must not keep a fire attribute, or a click shoots that hole. */
  function spinAttrRewrite(raw) {
    var s = " " + String(raw || "").trim();
    var gun = "";
    s = s.replace(/\sdata-fire="([^"]*)"/, function (_all, v) { gun = v; return ""; });
    s = s.replace(/\sdata-cyl-fire="([^"]*)"/g, function (_all, v) { return ' data-cyl-spin="' + v + '"'; });
    s = s.replace(/\sdata-strip-fire="([^"]*)"/g, function (_all, v) { return ' data-strip-spin="' + v + '"'; });
    s = s.replace(/\sdata-gunroll="[^"]*"/g, "");
    s = s.replace(/data-act="chamber"/g, 'data-act="spin"');
    s = s.replace(/data-act="playerChamber"/g, 'data-act="playerSpin"');
    if (gun !== "" && s.indexOf("data-gun=") < 0) s += ' data-gun="' + gun + '"';
    if (s.indexOf("data-spin=") < 0) s += ' data-spin="1"';
    return s.trim();
  }

  function roundButton(spec, chamber, style, indexOverride, extraClass, inner) {
    var k = indexOverride == null ? chamber.index : indexOverride;
    var rt = roundType(spec, chamber);
    extraClass = (extraClass ? extraClass + " " : "") + "rt-" + rt + (rt === "shell" && !/is-gauge-/.test(extraClass || "") ? " is-gauge-" + shellGauge(spec) + (isSlug(spec) ? " is-slug" : "") : "");
    var locked = chamber.state === "locked";
    var spin = extraClass.indexOf("is-spin") >= 0;
    var hammer = extraClass.indexOf("is-hammer") >= 0;
    var word = locked ? "Locked" : (chamber.state === "loaded" ? "Loaded" : (chamber.state === "jam" ? "Misfire" : "Spent"));
    var next = !spin && !hammer && spec.next === chamber.index ? " is-next" : "";
    if (locked) {
      extraClass = (extraClass ? extraClass + " " : "") + "is-locked";
      inner = "X";
    }
    if (hammer) word += ", position 1 under the hammer";
    if (spin) word = "Spin chamber " + (chamber.index + 1) + " under the hammer, free";
    var text = inner != null ? inner : esc(roundText(spec, chamber));
    var cls = extraClass ? " " + extraClass : "";
    var attrs = attrString(spec, k);
    if (spin) attrs = spinAttrRewrite(attrs);
    var tip = typeof spec.tip === "function" ? (spec.tip(k, chamber) || "") : "";
    var aria = tip || (word + (spin ? "" : " chamber " + (chamber.index + 1)));
    return '<button type="button" class="ammo-round is-' + chamber.state + next + cls + '"' +
      (style ? ' style="' + style + '"' : "") +
      " " + attrs +
      (tip ? ' title="' + esc(tip) + '"' : "") +
      ' aria-label="' + esc(aria) + '">' + text + "</button>";
  }

  function toneStyle(spec, chamber) {
    return "--case:" + toneOf(spec, chamber) + ";";
  }

  function cartSvg() {
    return '<svg class="ammo-cart" viewBox="0 0 48 16" aria-hidden="true">' +
      '<defs><linearGradient id="ammoTipCu" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f08a5e"/><stop offset=".45" stop-color="#c2421f"/><stop offset="1" stop-color="#6e1d0e"/></linearGradient></defs>' +
      '<rect x="1" y="3" width="27" height="10" rx="1.4" fill="var(--case,#e0b44a)" stroke="#5c4316" stroke-width="0.6"/>' +
      '<circle cx="6.2" cy="8" r="2.2" fill="#f4f0e8"/>' +
      '<circle cx="6.2" cy="8" r="1.05" fill="#a86b3c"/>' +
      '<path class="ammo-tip" d="M27.5 4.1 H38.5 Q46 5.2 46.6 8 Q46 10.8 38.5 11.9 H27.5 Z" fill="url(#ammoTipCu)" stroke="#5a1c10" stroke-width="0.5"/>' +
      '<path d="M29 5.2 H38 Q43 6 44 7.2" fill="none" stroke="rgba(255,214,190,.65)" stroke-width="0.9" stroke-linecap="round"/>' +
      "</svg>";
  }

  function isSlug(spec) {
    var load = String((spec && spec.load) || "").toLowerCase();
    return load === "slug" || /\bslug\b/.test(load);
  }

  function shellGauge(spec) {
    spec = spec || {};
    var bits = [spec.gauge, spec.round, spec.caliber, spec.tier, spec.name].join(" ").toLowerCase();
    if (/10\s*-?\s*ga\b|10\s*gauge/.test(bits)) return "10";
    if (/\.410|\b410\b/.test(bits)) return "410";
    if (/12\s*-?\s*ga\b|12\s*gauge/.test(bits)) return "12";
    var tier = String(spec.tier || "").toLowerCase();
    if (tier === "heavy") return "10";
    if (tier === "light") return "410";
    return "12";
  }

  function shellSvg(spec) {
    var gauge = shellGauge(spec);
    var slug = isSlug(spec);
    /* 0.3.54 sample: hull by gauge. 12 ga = the exact pre-#71 red shell; 10 ga green; .410 blue.
       Slugs (Jessey, option B): gauge hull colour with a black band and a white S. */
    var HULL = { "410": ["#3f8fe0", "#1f5a9c"], "12": ["#c4322e", "#8e241f"], "10": ["#2f7a3a", "#1a4a22"] };
    var band = slug;
    var hull = HULL[gauge][0];
    var hullDark = HULL[gauge][1];
    var brass = "#d7b15e";
    var brassEdge = "#8a6a32";
    var box = gauge === "410" ? { w: 64, h: 11 } : (gauge === "10" ? { w: 72, h: 26 } : { w: 56, h: 20 });
    var w = box.w;
    var h = box.h;
    var bodyH = h - 4.4;
    var rimH = h - 1.4;
    var yBody = (h - bodyH) / 2;
    var yRim = (h - rimH) / 2;
    var rimW = Math.max(2.4, h * 0.16);
    var headW = Math.max(4.2, h * 0.38);
    var crimp = Math.max(2.2, h * 0.16);
    var hullX = rimW + headW - 0.3;
    var hullW = Math.max(6, w - hullX - crimp - 1.2);
    var mark = band
      ? '<rect x="' + (hullX + hullW * 0.22).toFixed(1) + '" y="' + yBody.toFixed(2) + '" width="' + (hullW * 0.48).toFixed(1) + '" height="' + bodyH.toFixed(2) + '" fill="#111111"/>' +
        '<text x="' + (hullX + hullW * 0.46).toFixed(1) + '" y="' + (h * 0.68).toFixed(1) + '" text-anchor="middle" font-family="system-ui,sans-serif" font-weight="700" font-size="' + (bodyH * 0.7).toFixed(1) + '" fill="#f4f7fb">S</text>'
      : slug
      ? '<text x="' + (hullX + hullW * 0.46).toFixed(1) + '" y="' + (h * 0.68).toFixed(1) + '" text-anchor="middle" font-family="system-ui,sans-serif" font-weight="700" font-size="' + (bodyH * 0.7).toFixed(1) + '" fill="#f4f7fb">S</text>'
      : "";
    return '<svg class="ammo-shell" viewBox="0 0 ' + w + " " + h + '" aria-hidden="true">' +
      '<rect x="0.6" y="' + yRim.toFixed(2) + '" width="' + rimW.toFixed(2) + '" height="' + rimH.toFixed(2) + '" rx="0.5" fill="' + brass + '" stroke="' + brassEdge + '" stroke-width="0.45"/>' +
      '<rect x="' + rimW.toFixed(2) + '" y="' + yBody.toFixed(2) + '" width="' + headW.toFixed(2) + '" height="' + bodyH.toFixed(2) + '" fill="' + brass + '" stroke="' + brassEdge + '" stroke-width="0.35"/>' +
      '<circle cx="' + (rimW + headW * 0.42).toFixed(2) + '" cy="' + (h / 2).toFixed(2) + '" r="' + Math.max(0.7, bodyH * 0.16).toFixed(2) + '" fill="#6b3a22"/>' +
      '<rect x="' + hullX.toFixed(2) + '" y="' + yBody.toFixed(2) + '" width="' + hullW.toFixed(2) + '" height="' + bodyH.toFixed(2) + '" rx="' + (bodyH * 0.2).toFixed(2) + '" fill="' + hull + '" stroke="' + hullDark + '" stroke-width="0.4"/>' +
      '<rect x="' + (hullX + hullW - 0.4).toFixed(2) + '" y="' + (yBody + bodyH * 0.08).toFixed(2) + '" width="' + (crimp + 0.6).toFixed(2) + '" height="' + (bodyH * 0.84).toFixed(2) + '" rx="' + (bodyH * 0.2).toFixed(2) + '" fill="' + hull + '" stroke="' + hullDark + '" stroke-width="0.35"/>' +
      mark +
      "</svg>";
  }

  function shellClass(spec) {
    return "is-shell is-cart is-gauge-" + shellGauge(spec) + (isSlug(spec) ? " is-slug" : " is-buck");
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

  function chamberLayout(n) {
    var rim = 40.8;
    var pin = 8.4;
    var gap = 0.9;
    n = Math.max(n, 1);
    if (n === 1) return { R: 0, d: 58 };
    var sin = Math.sin(Math.PI / n);
    var r = (rim * sin - gap) / (1 + sin);
    var R = rim - r;
    if (R - r < pin) {
      r = (rim - pin) / 2;
      R = (rim + pin) / 2;
      var along = R * sin - gap;
      if (along < r) r = along;
    }
    return { R: R, d: r * 2 };
  }

  function rotateLeft(list, steps) {
    var a = (list || []).slice();
    var n = a.length;
    if (!n) return a;
    steps = ((Number(steps) % n) + n) % n;
    if (!steps) return a;
    return a.slice(steps).concat(a.slice(0, steps));
  }

  function rotateIndexes(indexes, steps, cap) {
    cap = Number(cap) || 0;
    var list = (indexes || []).slice();
    if (!cap) return list;
    steps = ((Number(steps) % cap) + cap) % cap;
    return list.map(function (k) {
      var n = Number(k);
      if (!isFinite(n)) return k;
      return (n - steps + cap) % cap;
    });
  }

  /* Bring chamber `index` to position 1 (index 0, under the hammer). */
  function spinTo(list, index) {
    return rotateLeft(list, index);
  }

  /* After a shot from position 1: the next chamber rotates under the hammer. */
  function advance(list) {
    return rotateLeft(list, 1);
  }

  /* Lever/tube: the chambered round is the first loaded hole. Eject it. Do not put it back. */
  function cycleEject(list) {
    var a = (list || []).slice();
    var i;
    for (i = 0; i < a.length; i++) if (a[i]) break;
    if (i >= a.length || !a[i]) return { ok: false, reason: "Nothing chambered.", chambers: a, index: -1, ejected: "" };
    var ejected = a[i];
    a[i] = "";
    return { ok: true, ejected: ejected, index: i, chambers: a };
  }

  function spins(spec) { return kind(spec) === "cylinder"; }

  function cylinderHtml(spec, model) {
    var n = Math.max(model.cap, 1);
    var lay = chamberLayout(n);
    var diameter = lay.d;
    var view = {};
    Object.keys(spec || {}).forEach(function (key) { view[key] = spec[key]; });
    view.next = null;
    var buttons = model.chambers.map(function (chamber) {
      var ang = -Math.PI / 2 + (chamber.index * 2 * Math.PI / n);
      var cx = 50 + Math.cos(ang) * lay.R;
      var cy = 50 + Math.sin(ang) * lay.R;
      var style = "left:" + cx.toFixed(2) + "%;top:" + cy.toFixed(2) + "%;width:" + diameter + "%;height:" + diameter + "%;" + toneStyle(view, chamber);
      var role = chamber.index === 0 ? "is-primer is-hammer" : "is-primer is-spin";
      return roundButton(view, chamber, style, null, role);
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
      return roundButton(spec, chamber, style, spend, shell ? shellClass(spec) : art, shell ? shellSvg(spec) : cartSvg());
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
      if (shell) return roundButton(spec, chamber, style, null, shellClass(spec), shellSvg(spec));
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

  /* 0.3.64: the round a token's ammo badge shows. It is the next round to fire in THAT gun (the first
     loaded chamber that isn't locked), so mixed loads show what fires next. The chamber token
     ("k:type:caliber:tier", hex "1".."9" / "k:hex:N") wins over the gun's own fields. An empty gun
     falls back to its caliber/default round and reports empty so the count can go muted red.
     Colours are the #73 round art: TONE / HEX case colours and the gauge hull colours. */
  var HULL = { "410": ["#3f8fe0", "#1f5a9c"], "12": ["#c4322e", "#8e241f"], "10": ["#2f7a3a", "#1a4a22"] };
  function roundLook(spec) {
    spec = spec || {};
    var flags = Array.isArray(spec.chambers) ? spec.chambers : [];
    var locks = (Array.isArray(spec.locked) ? spec.locked : (Array.isArray(spec.lockedChambers) ? spec.lockedChambers : [])).map(Number);
    var at = -1;
    for (var i = 0; i < flags.length; i++) {
      if (locks.indexOf(i) >= 0) continue;
      if (chamberState(flags[i]) === "loaded") { at = i; break; }
    }
    if (at < 0 && !flags.length && Number(spec.loaded) > 0) at = 0;
    var raw = at >= 0 && flags.length ? flags[at] : "";
    var chamber = at >= 0 && typeof raw === "string" ? { index: at, raw: raw } : null;
    var view = {};
    Object.keys(spec).forEach(function (k) { view[k] = spec[k]; });
    var kindName = "";
    if (typeof raw === "string" && raw.indexOf("k:") === 0 && raw.indexOf("k:hex:") !== 0) {
      var bits = raw.split(":");
      kindName = bits[1] || "";
      if (bits[2]) view.caliber = bits[2];
      if (bits[3]) view.tier = bits[3];
      if (kindName === "slug") view.load = "slug";
      else if (kindName === "buck") view.load = "buck";
      /* the loaded round, not the gun's default: a cartridge in a converted ball n cap draws as a cartridge */
      else if (kindName === "cartridge" || kindName === "plain" || kindName === "bigfifty") view.ammo = "cartridge";
    }
    var type = roundType(view, chamber);
    var look = { type: type, tone: toneOf(view, chamber), next: at, empty: at < 0 };
    if (type === "hex") {
      var lv = /^[1-9]$/.test(raw) ? Number(raw) : Number(String(raw).split(":")[2] || 1);
      look.hexLevel = lv || 1;
    }
    if (type === "shell") {
      look.gauge = shellGauge(view);
      look.slug = isSlug(view);
      look.hull = HULL[look.gauge][0];
      look.hullDark = HULL[look.gauge][1];
    }
    return look;
  }

  root.SSDNSAmmoDisplay = {
    enabled: enabled,
    kind: kind,
    spins: spins,
    rotateLeft: rotateLeft,
    rotateIndexes: rotateIndexes,
    spinTo: spinTo,
    advance: advance,
    cycleEject: cycleEject,
    roundType: roundType,
    roundLook: roundLook,
    html: html,
    mount: mount
  };
})(typeof window !== "undefined" ? window : this);

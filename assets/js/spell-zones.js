/**
 * N79 Phase 1c D — PHB 2014 zones on the N78 aim-then-cast placer.
 * Lighting, darkness, fog, Hunger of Hadar, and walls. rules.js is not edited.
 * Placement stays the existing blast: click a point (or aim a wall), then confirm.
 */
(function (root) {
  "use strict";

  var BOOK = {
    "light": {
      name: "Light", level: 0, conc: false, dur: "1 hour", range: 5, shape: "sphere", radius: 20,
      light: { bright: 20, dim: 20, spellLevel: 0, magical: true }, onePerCaster: true
    },
    "darkness": {
      name: "Darkness", level: 2, conc: true, dur: "10 min", range: 60, shape: "sphere", radius: 15,
      magicalDark: true, heavilyObscured: true, blocksDarkvision: true, blocksNonmagical: true,
      dispelsLightAtOrBelow: 2, dispelledByLightAtOrAbove: 3, devilsSightSees: true
    },
    "fog cloud": {
      name: "Fog Cloud", level: 1, conc: true, dur: "1 hour", range: 120, shape: "sphere", radius: 20, radiusUp: 20,
      heavilyObscured: true
    },
    "daylight": {
      name: "Daylight", level: 3, conc: false, dur: "1 hour", range: 60, shape: "sphere", radius: 60,
      light: { bright: 60, dim: 60, spellLevel: 3, magical: true }
    },
    "hunger of hadar": {
      name: "Hunger of Hadar", level: 3, conc: true, dur: "1 min", range: 150, shape: "sphere", radius: 20,
      magicalDark: true, heavilyObscured: true, noLight: true, blindedInside: true, difficult: true,
      blocksDarkvision: true, devilsSightSees: true, dispelledByLightAtOrAbove: 3, deferCast: true,
      ticks: [
        { when: "start", dice: "2d6", type: "cold" },
        { when: "end", dice: "2d6", type: "acid", save: "DEX", half: false }
      ]
    },
    "wall of fire": {
      name: "Wall of Fire", level: 4, conc: true, dur: "1 min", range: 120, shape: "wall", length: 60, thickness: 1, hotSide: 10,
      opaque: true,
      appear: { dice: "5d8", type: "fire", save: "DEX", half: true, up: "1d8" },
      ticks: [
        { when: "enter", dice: "5d8", type: "fire", up: "1d8" },
        { when: "end", dice: "5d8", type: "fire", up: "1d8", hot: true }
      ]
    },
    "wall of ice": {
      name: "Wall of Ice", level: 6, conc: true, dur: "10 min", range: 120, shape: "wall", length: 100, thickness: 1,
      appear: { dice: "10d6", type: "cold", save: "DEX", half: true, up: "2d6" },
      ticks: [
        { when: "through", dice: "5d6", type: "cold", save: "CON", half: true, up: "1d6" }
      ]
    },
    "wall of thorns": {
      name: "Wall of Thorns", level: 6, conc: true, dur: "10 min", range: 120, shape: "wall", length: 60, thickness: 5,
      difficult: true,
      appear: { dice: "7d8", type: "piercing", save: "DEX", half: true, up: "1d8" },
      ticks: [
        { when: "through", dice: "7d8", type: "slashing", save: "DEX", half: true, up: "1d8" }
      ]
    },
    "blade barrier": {
      name: "Blade Barrier", level: 6, conc: true, dur: "10 min", range: 90, shape: "wall", length: 100, thickness: 5,
      appear: { dice: "6d10", type: "slashing", save: "DEX", half: true },
      ticks: [
        { when: "enter", dice: "6d10", type: "slashing", save: "DEX", half: true },
        { when: "start", dice: "6d10", type: "slashing", save: "DEX", half: true }
      ]
    },
    "wind wall": {
      name: "Wind Wall", level: 3, conc: true, dur: "1 min", range: 120, shape: "wall", length: 50, thickness: 1,
      rangedDisadvantage: true,
      appear: { dice: "3d8", type: "bludgeoning", save: "STR", half: true }
    }
  };

  var seq = 1;

  function norm(s) {
    return String(s || "").toLowerCase().replace(/\./g, "").replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+shell$/i, "").replace(/\s+/g, " ").trim();
  }
  function specOf(name) {
    var key = norm(name);
    return BOOK[key] ? Object.assign({ key: key }, BOOK[key]) : null;
  }
  function isZone(name) { return !!specOf(name); }
  function defersCast(name) {
    var spec = specOf(name);
    return !!(spec && spec.deferCast);
  }
  function stepsOf(spec, slot) {
    var sl = Number(slot);
    if (!isFinite(sl) || sl < spec.level) sl = spec.level;
    return { slot: sl, steps: Math.max(0, sl - spec.level) };
  }
  function scaledDice(dice, up, steps) {
    if (!up || !(steps > 0)) return dice || "";
    var m = String(dice || "").match(/^(\d+)d(\d+)$/);
    var u = String(up).match(/^(\d+)d(\d+)$/);
    if (m && u && m[2] === u[2]) return (parseInt(m[1], 10) + parseInt(u[1], 10) * steps) + "d" + m[2];
    var out = String(dice || "");
    var i;
    for (i = 0; i < steps; i++) out += (out ? "+" : "") + up;
    return out;
  }
  function hypot(ax, ay, bx, by) {
    var dx = ax - bx;
    var dy = ay - by;
    return Math.sqrt(dx * dx + dy * dy);
  }
  function blankArea(spec, slot) {
    var grown = stepsOf(spec, slot);
    var area = { shape: spec.shape, self: false, rangeFeet: spec.range, range: (spec.range || 0) + " feet" };
    if (spec.shape === "wall") {
      area.length = spec.length;
      area.feet = spec.length;
      area.thickness = spec.thickness || 1;
      area.width = Math.max(5, spec.thickness || 1);
      area.label = spec.length + "-foot wall";
    } else {
      var radius = spec.radius + (spec.radiusUp || 0) * grown.steps;
      area.radius = radius;
      area.feet = radius;
      area.label = radius + "-foot radius";
    }
    return area;
  }
  function dressArea(name, area, slot) {
    var spec = specOf(name);
    if (!spec) return area || null;
    var grown = stepsOf(spec, slot);
    var next = area ? Object.assign({}, area) : blankArea(spec, grown.slot);
    if (!next) return null;
    if (spec.shape === "wall") {
      next.shape = "wall";
      next.length = spec.length;
      next.feet = spec.length;
      next.thickness = spec.thickness || next.thickness || 1;
      next.width = Math.max(5, spec.thickness || next.width || 5);
      next.label = spec.length + "-foot wall";
      next.self = false;
    } else if (spec.radius != null) {
      var radius = spec.radius + (spec.radiusUp || 0) * grown.steps;
      next.shape = next.shape || "sphere";
      next.radius = radius;
      next.feet = radius;
      next.label = radius + "-foot radius";
    }
    if (next.rangeFeet == null && spec.range != null) next.rangeFeet = spec.range;
    return next;
  }
  function rollExpr(expr, rng) {
    var R = root.SSDNSSpellRiders;
    if (R && R.rollExpr) return R.rollExpr(expr, false, rng);
    var m = String(expr || "").match(/(\d*)d(\d+)/i);
    if (!m) return { formula: "0", faces: [], total: 0 };
    var n = Math.max(1, parseInt(m[1] || "1", 10));
    var sides = parseInt(m[2], 10);
    var faces = [];
    var total = 0;
    var i;
    var die = rng || function (s) { return 1 + Math.floor(Math.random() * s); };
    for (i = 0; i < n; i++) {
      var face = die(sides);
      faces.push(face);
      total += face;
    }
    return { formula: n + "d" + sides, faces: faces, total: total };
  }
  function tickSound() {
    try {
      if (root.SSDNSAudio && root.SSDNSAudio.play) root.SSDNSAudio.play("ui-tick");
    } catch (e) {}
  }
  function cloneBag(bag) {
    var src = bag || {};
    return {
      conc: src.conc || "",
      marks: (src.marks || []).map(function (m) { return Object.assign({}, m); }),
      zones: (src.zones || []).map(function (z) { return Object.assign({}, z); }),
      ticks: (src.ticks || []).map(function (t) { return Object.assign({}, t); })
    };
  }
  function buildZone(name, placed, opts) {
    var spec = specOf(name);
    if (!spec || !placed) return null;
    opts = opts || {};
    var grown = stepsOf(spec, opts.slot);
    var origin = placed.origin || (placed.origins && placed.origins[0]) || null;
    if (!origin || origin.x == null || origin.y == null) return null;
    var area = dressArea(name, placed.area, grown.slot);
    var zone = {
      id: opts.id || ("zone" + (seq++)),
      spell: spec.name,
      key: spec.key,
      level: spec.level,
      slot: grown.slot,
      conc: !!spec.conc,
      casterId: opts.casterId || "",
      shape: area.shape,
      radius: area.radius || 0,
      length: area.length || 0,
      width: area.width || 5,
      thickness: area.thickness || spec.thickness || 1,
      origin: { x: Number(origin.x), y: Number(origin.y) },
      facing: Number(placed.facing) || 0,
      dur: spec.dur || "",
      light: spec.light ? Object.assign({}, spec.light) : null,
      magicalDark: !!spec.magicalDark,
      heavilyObscured: !!spec.heavilyObscured,
      blocksDarkvision: !!spec.blocksDarkvision,
      blocksNonmagical: !!spec.blocksNonmagical,
      noLight: !!spec.noLight,
      blindedInside: !!spec.blindedInside,
      devilsSightSees: !!spec.devilsSightSees,
      dispelsLightAtOrBelow: spec.dispelsLightAtOrBelow != null ? spec.dispelsLightAtOrBelow : null,
      dispelledByLightAtOrAbove: spec.dispelledByLightAtOrAbove != null ? spec.dispelledByLightAtOrAbove : null,
      difficult: !!spec.difficult,
      opaque: !!spec.opaque,
      rangedDisadvantage: !!spec.rangedDisadvantage,
      hotSide: spec.hotSide || 0,
      deferCast: !!spec.deferCast,
      label: area.label || "",
      dc: opts.dc != null && opts.dc !== "" ? Number(opts.dc) : null
    };
    if (spec.appear) zone.appear = Object.assign({}, spec.appear, { dice: scaledDice(spec.appear.dice, spec.appear.up, grown.steps) });
    zone.ticks = (spec.ticks || []).map(function (t) {
      return Object.assign({}, t, { dice: scaledDice(t.dice, t.up, grown.steps) });
    });
    return zone;
  }
  function reachSq(zone) {
    if (!zone) return 0;
    if (zone.shape === "wall") return Math.max((zone.length || 0) / 2, zone.width || 0) / 5;
    return (Number(zone.radius) || 0) / 5;
  }
  function overlaps(a, b) {
    if (!a || !b || !a.origin || !b.origin) return false;
    return hypot(a.origin.x, a.origin.y, b.origin.x, b.origin.y) <= reachSq(a) + reachSq(b) + 0.05;
  }
  function lightLevel(z) {
    if (!z || !z.light) return null;
    return z.light.spellLevel != null ? z.light.spellLevel : z.level;
  }
  function settle(zones) {
    var list = (zones || []).slice();
    var dispelled = [];
    var logs = [];
    var bright = list.filter(function (z) { return lightLevel(z) != null && lightLevel(z) >= 3; });
    bright.forEach(function (light) {
      list = list.filter(function (z) {
        if (!z || z.id === light.id) return true;
        if (!z.magicalDark && !z.noLight) return true;
        var cap = z.dispelledByLightAtOrAbove != null ? z.dispelledByLightAtOrAbove : 3;
        if (lightLevel(light) < cap) return true;
        if (z.level > cap) return true;
        if (!overlaps(light, z)) return true;
        dispelled.push(z);
        logs.push(light.spell + " dispels " + z.spell + ".");
        return false;
      });
    });
    var darks = list.filter(function (z) { return z.magicalDark && z.dispelsLightAtOrBelow != null; });
    darks.forEach(function (dark) {
      list = list.filter(function (z) {
        if (!z || z.id === dark.id) return true;
        var lv = lightLevel(z);
        if (lv == null || lv > dark.dispelsLightAtOrBelow) return true;
        if (!overlaps(dark, z)) return true;
        dispelled.push(z);
        logs.push(dark.spell + " dispels " + z.spell + ".");
        return false;
      });
    });
    return { zones: list, dispelled: dispelled, logs: logs };
  }
  function place(bag, zone) {
    var next = cloneBag(bag);
    if (!zone) return { bag: next, zone: null, dispelled: [], log: "" };
    next.zones = next.zones.filter(function (z) {
      if (norm(z.spell) !== norm(zone.spell)) return true;
      if (zone.casterId && z.casterId && z.casterId !== zone.casterId) return true;
      return false;
    });
    if (zone.light && zone.level <= 2) {
      /* A second Light from the same caster replaces the first. One per caster. */
      next.zones = next.zones.filter(function (z) {
        return !(z.light && z.key === "light" && z.casterId === zone.casterId);
      });
    }
    next.zones.push(zone);
    if (zone.conc) next.conc = zone.spell;
    var settled = settle(next.zones);
    next.zones = settled.zones;
    var kept = next.zones.some(function (z) { return z.id === zone.id; });
    var logs = ["ZONE " + zone.spell + " placed: " + (zone.label || zone.shape) + " at " + zone.origin.x + "," + zone.origin.y + (zone.dur ? "; lasts " + zone.dur : "")];
    if (zone.light) logs[0] += "; bright " + zone.light.bright + " + dim " + zone.light.dim;
    if (zone.magicalDark) logs[0] += "; magical darkness";
    if (zone.heavilyObscured && !zone.magicalDark) logs[0] += "; heavily obscured";
    if (zone.blindedInside) logs[0] += "; blinded inside";
    if (zone.appear) logs.push("appear " + zone.appear.dice + " " + zone.appear.type + (zone.appear.save ? " " + zone.appear.save + (zone.appear.half ? " half" : "") : ""));
    settled.logs.forEach(function (line) { logs.push(line); });
    if (!kept) logs.push(zone.spell + " does not stay.");
    tickSound();
    return { bag: next, zone: kept ? zone : null, dispelled: settled.dispelled, log: logs.join(" · ") };
  }
  function areaSpec(zone, extraFeet) {
    var extra = Number(extraFeet) || 0;
    var width = (Number(zone.width) || 5) + extra;
    var spec = {
      shape: zone.shape,
      radius: zone.radius,
      length: zone.length,
      width: width,
      side: zone.radius
    };
    var origin = { x: zone.origin.x * 5, y: zone.origin.y * 5, casterSize: 1 };
    if (extra && zone.shape === "wall") {
      var face = Number(zone.facing) || 0;
      var lx = -Math.sin(face);
      var ly = Math.cos(face);
      var shift = extra / 2;
      origin.x += lx * shift;
      origin.y += ly * shift;
    }
    return { area: spec, origin: origin, facing: Number(zone.facing) || 0 };
  }
  function tokenIn(zone, token, extraFeet) {
    if (!zone || !token) return false;
    var Area = root.SSDNSSpellArea;
    if (Area && Area.hits) {
      var pack = areaSpec(zone, extraFeet);
      return !!Area.hits(pack.area, pack.origin, pack.facing, { x: token.x, y: token.y, size: token.size || 1 });
    }
    if (zone.shape === "wall") return false;
    var s = token.size || 1;
    var cx = token.x + s / 2;
    var cy = token.y + s / 2;
    return hypot(cx, cy, zone.origin.x, zone.origin.y) * 5 <= (Number(zone.radius) || 0) + 0.05;
  }
  function pointIn(zone, gx, gy) {
    if (!zone || !zone.origin) return false;
    if (zone.shape === "wall") return tokenIn(zone, { x: gx - 0.05, y: gy - 0.05, size: 0.1 }, 0);
    return hypot(gx, gy, zone.origin.x, zone.origin.y) * 5 <= (Number(zone.radius) || 0) + 0.05;
  }
  function viewerInside(zone, viewer) {
    if (!viewer) return false;
    return pointIn(zone, viewer.x, viewer.y);
  }
  function feetApart(ax, ay, bx, by) {
    return hypot(ax, ay, bx, by) * 5;
  }
  function hides(gx, gy, zones, viewer) {
    var blocked = false;
    (zones || []).forEach(function (z) {
      if (blocked || !pointIn(z, gx, gy)) return;
      if (viewer && z.blindedInside && viewerInside(z, viewer)) { blocked = true; return; }
      if (z.heavilyObscured && !z.magicalDark && !z.noLight) { blocked = true; return; }
      if (z.magicalDark || z.noLight || z.heavilyObscured) {
        if (z.devilsSightSees && viewer && viewer.devilsSight && feetApart(viewer.x, viewer.y, gx, gy) <= 120) {
          if (!(z.blindedInside && viewerInside(z, viewer))) return;
        }
        blocked = true;
      }
    });
    return blocked;
  }
  function viewerBlinded(viewer, zones) {
    if (!viewer) return false;
    return (zones || []).some(function (z) { return z.blindedInside && viewerInside(z, viewer); });
  }
  function centerOf(token) {
    var s = (token && token.size) || 1;
    return {
      x: Number(token.x) + s / 2,
      y: Number(token.y) + s / 2,
      devilsSight: !!(token && token.devilsSight),
      darkvision: Number(token && token.darkvision) || 0
    };
  }
  function attackSight(attacker, target, zones) {
    if (!attacker || !target) return "";
    var a = centerOf(attacker);
    var b = centerOf(target);
    var aSees = !hides(b.x, b.y, zones, a) && !viewerBlinded(a, zones);
    var bSees = !hides(a.x, a.y, zones, b) && !viewerBlinded(b, zones);
    if (!aSees && bSees) return "dis";
    if (aSees && !bSees) return "adv";
    return "";
  }
  function lightBlocked(light, gx, gy, zones) {
    var blocked = false;
    (zones || []).forEach(function (z) {
      if (blocked || !pointIn(z, gx, gy)) return;
      if (z.noLight) { blocked = true; return; }
      if (!z.magicalDark) return;
      var magical = !!(light && (light.magical || light.spell));
      var lv = light && light.spellLevel != null ? Number(light.spellLevel) : null;
      if (!magical) { blocked = true; return; }
      if (lv != null && z.dispelsLightAtOrBelow != null && lv <= z.dispelsLightAtOrBelow) blocked = true;
    });
    return blocked;
  }
  function lightOverlaps(zone, light) {
    if (!zone || !light || !zone.magicalDark) return false;
    var reach = ((Number(light.bright) || 0) + (Number(light.dim) || 0)) / 5;
    var d = hypot(light.x, light.y, zone.origin.x, zone.origin.y);
    return d <= reachSq(zone) + reach + 0.05;
  }
  function spellLightLevel(light) {
    if (!light) return null;
    if (light.spellLevel != null) return Number(light.spellLevel);
    var id = String(light.id || light.catalogId || "");
    if (/daylight/i.test(id)) return 3;
    if (/continual/i.test(id)) return 2;
    if (/^spell:light|^spell:dancing|light$/i.test(id) || /dancing/i.test(id)) return 0;
    if (light.spell && !light.feature) return 0;
    return null;
  }
  function dispelledCarried(zones, lights) {
    var out = [];
    (lights || []).forEach(function (light) {
      var lv = spellLightLevel(light);
      if (lv == null) return;
      var hit = (zones || []).some(function (z) {
        return z.magicalDark && z.dispelsLightAtOrBelow != null && lv <= z.dispelsLightAtOrBelow && lightOverlaps(z, light);
      });
      if (hit) out.push(light);
    });
    return out;
  }
  function fillTick(tick, zone, token, rng) {
    var row = Object.assign({}, tick, {
      spell: zone.spell,
      zoneId: zone.id,
      dc: zone.dc,
      targetId: (token && (token.id || token.targetId)) || "",
      targetName: (token && token.name) || ""
    });
    if (!tick.save) {
      var rolled = rollExpr(tick.dice, rng);
      row.amount = rolled.total;
      row.formula = rolled.formula;
      row.faces = rolled.faces;
      row.auto = true;
    }
    return row;
  }
  function phaseDue(bag, token, when, rng) {
    var due = [];
    ((bag && bag.zones) || []).forEach(function (zone) {
      (zone.ticks || []).forEach(function (tick) {
        if (tick.when !== when) return;
        var extra = tick.hot ? (zone.hotSide || 0) : 0;
        if (!tokenIn(zone, token, extra)) return;
        due.push(fillTick(tick, zone, token, rng));
      });
    });
    return due;
  }
  function entered(zone, from, to, size) {
    if (!zone || !from || !to) return false;
    function at(x, y) { return tokenIn(zone, { x: x, y: y, size: size || 1 }, 0); }
    var was = at(from.x, from.y);
    var steps = 8;
    var i;
    for (i = 1; i <= steps; i++) {
      var x = from.x + (to.x - from.x) * (i / steps);
      var y = from.y + (to.y - from.y) * (i / steps);
      var hit = at(x, y);
      if (hit && !was) return true;
      was = hit;
    }
    return false;
  }
  function moveDue(zones, from, to, token, rng) {
    var due = [];
    var size = (token && token.size) || 1;
    (zones || []).forEach(function (zone) {
      if (!entered(zone, from, to, size)) return;
      (zone.ticks || []).forEach(function (tick) {
        if (tick.when !== "through" && tick.when !== "enter") return;
        due.push(fillTick(tick, zone, token, rng));
      });
    });
    return due;
  }
  function crossesWall(zones, from, to) {
    var names = [];
    (zones || []).forEach(function (zone) {
      if (!zone.rangedDisadvantage || zone.shape !== "wall") return;
      if (entered(zone, from, to, 0.2) || segmentHitsWall(zone, from, to)) names.push(zone.spell);
    });
    return names;
  }
  function segmentHitsWall(zone, from, to) {
    var steps = 12;
    var i;
    for (i = 0; i <= steps; i++) {
      var x = from.x + (to.x - from.x) * (i / steps);
      var y = from.y + (to.y - from.y) * (i / steps);
      if (pointIn(zone, x, y)) return true;
    }
    return false;
  }
  function appearOf(name, slot) {
    var spec = specOf(name);
    if (!spec || !spec.appear) return null;
    var grown = stepsOf(spec, slot);
    return Object.assign({}, spec.appear, { dice: scaledDice(spec.appear.dice, spec.appear.up, grown.steps) });
  }

  root.SSDNSSpellZones = {
    book: BOOK,
    norm: norm,
    specOf: specOf,
    isZone: isZone,
    defersCast: defersCast,
    dressArea: dressArea,
    buildZone: buildZone,
    place: place,
    settle: settle,
    overlaps: overlaps,
    pointIn: pointIn,
    tokenIn: tokenIn,
    hides: hides,
    viewerBlinded: viewerBlinded,
    attackSight: attackSight,
    lightBlocked: lightBlocked,
    lightOverlaps: lightOverlaps,
    spellLightLevel: spellLightLevel,
    dispelledCarried: dispelledCarried,
    phaseDue: phaseDue,
    entered: entered,
    moveDue: moveDue,
    crossesWall: crossesWall,
    appearOf: appearOf,
    scaledDice: scaledDice
  };
})(typeof window !== "undefined" ? window : globalThis);

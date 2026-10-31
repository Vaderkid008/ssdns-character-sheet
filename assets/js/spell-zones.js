/**
 * N79 Phase 1c D — PHB 2014 zones on the N78 aim-then-cast placer.
 * N81 P0-4 adds the lasting PHB areas (clouds, beams, guardians, beads).
 * N81 P0-5: a round counter from `dur` expires a zone, and one DM Clear
 * removes a single instance or every grid in the scene.
 * rules.js is not edited. Placement stays aim-then-cast.
 * Repeat bolts, rams, and bonus-action swings stay on the sustain slice.
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
    },
    /* N81 P0-4 — placed once, then the enter/start/end engine keeps them. */
    "cloud of daggers": {
      name: "Cloud of Daggers", level: 2, conc: true, dur: "1 min", range: 60, shape: "cube", side: 5,
      deferCast: true,
      ticks: [
        { when: "enter", dice: "4d4", type: "slashing", up: "2d4" },
        { when: "start", dice: "4d4", type: "slashing", up: "2d4" }
      ]
    },
    "flaming sphere": {
      name: "Flaming Sphere", level: 2, conc: true, dur: "1 min", range: 60, shape: "sphere", radius: 5,
      deferCast: true, createToken: true, footprint: 1,
      ticks: [
        { when: "end", dice: "2d6", type: "fire", save: "DEX", half: true, up: "1d6", near: 5 }
      ]
    },
    "moonbeam": {
      name: "Moonbeam", level: 2, conc: true, dur: "1 min", range: 120, shape: "cylinder", radius: 5,
      deferCast: true,
      ticks: [
        { when: "enter", dice: "2d10", type: "radiant", save: "CON", half: true, up: "1d10", shapechanger: true },
        { when: "start", dice: "2d10", type: "radiant", save: "CON", half: true, up: "1d10", shapechanger: true }
      ]
    },
    "call lightning": {
      name: "Call Lightning", level: 3, conc: true, dur: "10 min", range: 120, shape: "cylinder", radius: 5
      /* The first bolt still resolves on cast. Later bolts are the sustain slice. */
    },
    "spiritual weapon": {
      name: "Spiritual Weapon", level: 2, conc: false, dur: "1 min", range: 60, shape: "sphere", radius: 5,
      createToken: true, footprint: 1
      /* The cast still makes the melee spell attack. Later swings are the sustain slice. */
    },
    "spirit guardians": {
      name: "Spirit Guardians", level: 3, conc: true, dur: "10 min", range: 15, shape: "sphere", radius: 15,
      anchor: true, follow: true, halfSpeed: true, exemptCaster: true, chooseAllies: true, chooseType: ["radiant", "necrotic"],
      deferCast: true,
      ticks: [
        { when: "enter", dice: "3d8", type: "radiant", save: "WIS", half: true, up: "1d8" },
        { when: "start", dice: "3d8", type: "radiant", save: "WIS", half: true, up: "1d8" }
      ]
    },
    "cloudkill": {
      name: "Cloudkill", level: 5, conc: true, dur: "10 min", range: 120, shape: "sphere", radius: 20,
      heavilyObscured: true, deferCast: true,
      ticks: [
        { when: "enter", dice: "5d8", type: "poison", save: "CON", half: true, up: "1d8" },
        { when: "start", dice: "5d8", type: "poison", save: "CON", half: true, up: "1d8" }
      ]
    },
    "insect plague": {
      name: "Insect Plague", level: 5, conc: true, dur: "10 min", range: 300, shape: "sphere", radius: 20,
      difficult: true, lightlyObscured: true, deferCast: true,
      ticks: [
        { when: "enter", dice: "4d10", type: "piercing", save: "CON", half: true, up: "1d10" },
        { when: "start", dice: "4d10", type: "piercing", save: "CON", half: true, up: "1d10" }
      ]
    },
    "incendiary cloud": {
      name: "Incendiary Cloud", level: 8, conc: true, dur: "1 min", range: 150, shape: "sphere", radius: 20,
      heavilyObscured: true, deferCast: true,
      ticks: [
        { when: "enter", dice: "10d8", type: "fire", save: "DEX", half: true, up: "1d8" },
        { when: "start", dice: "10d8", type: "fire", save: "DEX", half: true, up: "1d8" }
      ]
    },
    "guardian of faith": {
      name: "Guardian of Faith", level: 4, conc: false, dur: "8 hours", range: 30, shape: "sphere", radius: 5,
      budget: 60, deferCast: true, createToken: true, footprint: 2,
      ticks: [
        { when: "approach", dice: "20", type: "radiant", save: "DEX", half: true, reach: 10, hostile: true }
      ]
    },
    "delayed blast fireball": {
      name: "Delayed Blast Fireball", level: 7, conc: true, dur: "1 min", range: 150, shape: "sphere", radius: 5,
      deferCast: true,
      blast: { radius: 20, dice: "12d6", type: "fire", save: "DEX", half: true, up: "1d6" },
      grow: { dice: "1d6" }
    },
    /* SSDNS extension: burning tiles after the blast. The 8d6 still resolves on cast.
       The round clock expires a zone on the wrap, so 2 rounds covers the following starts. */
    "fireball": {
      name: "Fireball", level: 3, conc: false, dur: "2 rounds", range: 150, shape: "sphere", radius: 20,
      tag: "burn-scar",
      ticks: [
        { when: "start", dice: "1d6", type: "fire" }
      ]
    },
    /* PHB Grease is in the cast list (kind none). Prone on appear, enter, and end of turn. */
    "grease": {
      name: "Grease", level: 1, conc: false, dur: "1 minute", range: 60, shape: "square", side: 10,
      difficult: true, tag: "grease",
      appear: { save: "DEX", onFail: "Prone" },
      ticks: [
        { when: "enter", save: "DEX", onFail: "Prone" },
        { when: "end", save: "DEX", onFail: "Prone" }
      ]
    },
    /* SSDNS extension stand-in: Ice Storm is in the 85; Grease is castable but not in that damage list. */
    "ice storm": {
      name: "Ice Storm", level: 4, conc: false, dur: "2 rounds", range: 300, shape: "cylinder", radius: 20,
      difficult: true, tag: "slick-ice"
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
  /* 1 round is 6 seconds: 1 minute = 10 rounds, 1 hour = 600, 1 day = 14400. */
  function roundsFromDur(dur) {
    var s = String(dur || "").toLowerCase();
    var m = s.match(/(\d+)\s*(rounds?|minutes?|mins?|hours?|hrs?|days?)/);
    if (!m) return 0;
    var n = parseInt(m[1], 10);
    if (!isFinite(n) || n <= 0) return 0;
    var unit = m[2].charAt(0);
    if (unit === "r") return n;
    if (unit === "d") return n * 14400;
    if (unit === "h") return n * 600;
    return n * 10;
  }
  function hypot(ax, ay, bx, by) {
    var dx = ax - bx;
    var dy = ay - by;
    return Math.sqrt(dx * dx + dy * dy);
  }
  function blankArea(spec, slot) {
    var grown = stepsOf(spec, slot);
    var area = { shape: spec.shape, self: !!spec.anchor, rangeFeet: spec.range, range: (spec.range || 0) + " feet" };
    if (spec.shape === "wall") {
      area.length = spec.length;
      area.feet = spec.length;
      area.thickness = spec.thickness || 1;
      area.width = Math.max(5, spec.thickness || 1);
      area.label = spec.length + "-foot wall";
    } else if (spec.shape === "cube" || spec.shape === "square") {
      area.side = spec.side || 5;
      area.feet = area.side;
      area.label = area.side + "-foot " + spec.shape;
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
    if (spec.anchor) next.self = true;
    if (spec.shape === "wall") {
      next.shape = "wall";
      next.length = spec.length;
      next.feet = spec.length;
      next.thickness = spec.thickness || next.thickness || 1;
      next.width = Math.max(5, spec.thickness || next.width || 5);
      next.label = spec.length + "-foot wall";
      next.self = false;
    } else if (spec.shape === "cube" || spec.shape === "square") {
      next.shape = spec.shape;
      next.side = spec.side || next.side || 5;
      next.feet = next.side;
      next.label = next.side + "-foot " + spec.shape;
    } else if (spec.radius != null) {
      var radius = spec.radius + (spec.radiusUp || 0) * grown.steps;
      next.shape = spec.shape || next.shape || "sphere";
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
    if (/^[+-]?\d+$/.test(String(expr || "").trim())) {
      var flat = parseInt(expr, 10) || 0;
      return { formula: String(flat), faces: [], total: flat };
    }
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
      follow: !!spec.follow,
      halfSpeed: !!spec.halfSpeed,
      exemptCaster: !!spec.exemptCaster,
      chooseAllies: !!spec.chooseAllies,
      lightlyObscured: !!spec.lightlyObscured,
      side: area.side || spec.side || 0,
      budget: spec.budget || 0,
      spent: 0,
      label: area.label || "",
      dc: opts.dc != null && opts.dc !== "" ? Number(opts.dc) : null,
      exemptIds: (opts.exemptIds || []).filter(Boolean).slice()
    };
    zone.rounds = roundsFromDur(zone.dur);
    zone.roundsLeft = zone.rounds;
    if (spec.appear) zone.appear = Object.assign({}, spec.appear, { dice: scaledDice(spec.appear.dice, spec.appear.up, grown.steps) });
    if (spec.tag) zone.tag = spec.tag;
    if (spec.createToken) zone.createToken = true;
    if (spec.footprint) zone.footprint = spec.footprint;
    if (spec.blast) zone.blast = Object.assign({}, spec.blast, { dice: scaledDice(spec.blast.dice, spec.blast.up, grown.steps) });
    if (spec.grow) zone.grow = Object.assign({}, spec.grow);
    var typePick = String(opts.damageType || "").toLowerCase();
    zone.ticks = (spec.ticks || []).map(function (t) {
      var tick = Object.assign({}, t, { dice: scaledDice(t.dice, t.up, grown.steps) });
      if (typePick === "radiant" || typePick === "necrotic") tick.type = typePick;
      return tick;
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
    var replaced = [];
    if (!zone) return { bag: next, zone: null, dispelled: [], replaced: replaced, log: "" };
    next.zones = next.zones.filter(function (z) {
      if (norm(z.spell) !== norm(zone.spell)) return true;
      if (zone.casterId && z.casterId && z.casterId !== zone.casterId) return true;
      replaced.push(z);
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
    var logs = ["ZONE " + zone.spell + " placed: " + (zone.label || zone.shape) + " at " + zone.origin.x + "," + zone.origin.y + (zone.dur ? "; lasts " + zone.dur : "") + (zone.rounds > 0 ? " (" + zone.rounds + " rounds)" : "")];
    if (zone.light) logs[0] += "; bright " + zone.light.bright + " + dim " + zone.light.dim;
    if (zone.magicalDark) logs[0] += "; magical darkness";
    if (zone.heavilyObscured && !zone.magicalDark) logs[0] += "; heavily obscured";
    if (zone.blindedInside) logs[0] += "; blinded inside";
    if (zone.halfSpeed) logs[0] += "; speed halved inside";
    if (zone.budget) logs[0] += "; budget " + zone.budget;
    if (zone.blast) logs[0] += "; bead " + zone.blast.dice + " " + (zone.blast.type || "");
    if (zone.appear) logs.push("appear " + zone.appear.dice + " " + zone.appear.type + (zone.appear.save ? " " + zone.appear.save + (zone.appear.half ? " half" : "") : ""));
    settled.logs.forEach(function (line) { logs.push(line); });
    if (!kept) logs.push(zone.spell + " does not stay.");
    tickSound();
    return { bag: next, zone: kept ? zone : null, dispelled: settled.dispelled, replaced: replaced, log: logs.join(" · ") };
  }
  function areaSpec(zone, extraFeet) {
    var extra = Number(extraFeet) || 0;
    var wall = zone.shape === "wall";
    var round = zone.shape === "sphere" || zone.shape === "cylinder";
    var box = zone.shape === "cube" || zone.shape === "square";
    var width = (Number(zone.width) || 5) + (wall ? extra : 0);
    var radius = (Number(zone.radius) || 0) + (round ? extra : 0);
    var side = (Number(zone.side) || 0) + (box ? extra : 0);
    if (!side && !box) side = zone.radius;
    var spec = {
      shape: zone.shape,
      radius: radius,
      length: zone.length,
      width: width,
      side: side
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
  function sameId(a, b) {
    if (!a || !b) return false;
    return String(a) === String(b);
  }
  function isExempt(zone, token) {
    if (!zone || !token) return false;
    var id = token.id || token.targetId || "";
    var owner = token.ownerUid || "";
    if (zone.exemptCaster && zone.casterId && (sameId(zone.casterId, id) || sameId(zone.casterId, owner))) return true;
    var list = zone.exemptIds || [];
    var i;
    for (i = 0; i < list.length; i++) {
      if (sameId(list[i], id) || sameId(list[i], owner)) return true;
    }
    return false;
  }
  function tickExtra(zone, tick) {
    if (!tick) return 0;
    if (tick.reach) return Math.max(0, Number(tick.reach) - (Number(zone.radius) || 0));
    if (tick.near) return Number(tick.near) || 0;
    if (tick.hot) return zone.hotSide || 0;
    return 0;
  }
  function fillTick(tick, zone, token, rng) {
    var row = Object.assign({}, tick, {
      spell: zone.spell,
      zoneId: zone.id,
      casterId: zone.casterId || "",
      dc: zone.dc,
      budget: zone.budget || 0,
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
      if (isExempt(zone, token)) return;
      (zone.ticks || []).forEach(function (tick) {
        if (tick.when !== when) return;
        if (tick.hostile && token && token.hostile === false) return;
        if (!tokenIn(zone, token, tickExtra(zone, tick))) return;
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
    var moved = !!(from && to && (from.x !== to.x || from.y !== to.y));
    (zones || []).forEach(function (zone) {
      if (isExempt(zone, token)) return;
      var crossed = entered(zone, from, to, size);
      (zone.ticks || []).forEach(function (tick) {
        if (tick.when === "approach") {
          if (!moved) return;
          var now = tokenIn(zone, { x: to.x, y: to.y, size: size, id: token && token.id }, tickExtra(zone, tick));
          if (!now) return;
          due.push(fillTick(tick, zone, token, rng));
          return;
        }
        if (!crossed) return;
        if (tick.when !== "through" && tick.when !== "enter") return;
        due.push(fillTick(tick, zone, token, rng));
      });
    });
    return due;
  }
  function once(seen, tick, tokenId, turnKey) {
    if (!tick || (tick.when !== "enter" && tick.when !== "approach")) return true;
    var book = seen || {};
    var key = (tick.zoneId || "") + ":" + (tokenId || "") + ":" + tick.when + ":" + (turnKey || "");
    if (book[key]) return false;
    book[key] = 1;
    return true;
  }
  function terrainMult(zones, token) {
    var mult = 1;
    (zones || []).forEach(function (z) {
      if (!z || !tokenIn(z, token, 0)) return;
      if (z.difficult) mult = Math.max(mult, 2);
      if (z.halfSpeed && !isExempt(z, token)) mult = Math.max(mult, 2);
    });
    return mult;
  }
  function tickRounds(zones, steps) {
    var n = steps == null ? 1 : Number(steps);
    if (!isFinite(n)) n = 0;
    var kept = [];
    var removed = [];
    var logs = [];
    (zones || []).forEach(function (z) {
      if (!z) return;
      var copy = Object.assign({}, z);
      var total = copy.rounds != null && isFinite(Number(copy.rounds)) ? Number(copy.rounds) : roundsFromDur(copy.dur);
      var left = copy.roundsLeft != null && isFinite(Number(copy.roundsLeft)) ? Number(copy.roundsLeft) : total;
      if (!(total > 0)) {
        kept.push(copy);
        return;
      }
      copy.rounds = total;
      copy.roundsLeft = left;
      if (!(n > 0)) {
        kept.push(copy);
        return;
      }
      copy.roundsLeft = left - n;
      if (copy.roundsLeft <= 0) {
        copy.roundsLeft = 0;
        removed.push(copy);
        logs.push((copy.spell || "Zone") + " expires (" + (copy.dur || (total + " rounds")) + ").");
      } else kept.push(copy);
    });
    return { zones: kept, removed: removed, logs: logs };
  }
  function clearZones(zones, opts) {
    opts = opts || {};
    var all = !!opts.all;
    var id = opts.id != null && opts.id !== "" ? String(opts.id) : "";
    var kept = [];
    var removed = [];
    var logs = [];
    (zones || []).forEach(function (z) {
      if (!z) return;
      if (all || (id && String(z.id) === id)) {
        removed.push(z);
        logs.push("DM cleared " + (z.spell || "spell") + " grid");
      } else kept.push(z);
    });
    return { zones: kept, removed: removed, logs: logs };
  }
  function charge(zones, zoneId, amount) {
    var ended = null;
    var spent = 0;
    var next = (zones || []).map(function (z) {
      if (!z || z.id !== zoneId || !(z.budget > 0)) return z;
      spent = (Number(z.spent) || 0) + (Number(amount) || 0);
      var copy = Object.assign({}, z, { spent: spent });
      if (spent >= z.budget) ended = copy;
      return copy;
    }).filter(function (z) { return !(ended && z && z.id === ended.id); });
    return { zones: next, ended: ended, spent: ended ? ended.spent : spent };
  }
  function growList(zones, casterId, turnKey) {
    var changed = false;
    var logs = [];
    var next = (zones || []).map(function (z) {
      if (!z || !z.grow || !z.blast) return z;
      if (casterId && z.casterId && z.casterId !== casterId) return z;
      if (turnKey && z.grownTurn === turnKey) return z;
      var dice = scaledDice(z.blast.dice, z.grow.dice || "1d6", 1);
      changed = true;
      logs.push(z.spell + " grows to " + dice + ".");
      return Object.assign({}, z, {
        grownTurn: turnKey || "",
        grown: (Number(z.grown) || 0) + 1,
        blast: Object.assign({}, z.blast, { dice: dice })
      });
    });
    return { zones: next, changed: changed, logs: logs };
  }
  function needsAllies(name) {
    var spec = specOf(name);
    return !!(spec && spec.chooseAllies);
  }
  function typeOptions(name) {
    var spec = specOf(name);
    return spec && spec.chooseType ? spec.chooseType.slice() : null;
  }
  function chooseOne(title, options) {
    options = options || [];
    if (typeof document === "undefined" || !document.body || !options.length) {
      return Promise.resolve(options[0] || "");
    }
    return new Promise(function (resolve) {
      var dlg = document.createElement("dialog");
      dlg.className = "dlg";
      var form = document.createElement("form");
      form.method = "dialog";
      var h = document.createElement("h2");
      h.textContent = title || "Choose";
      var note = document.createElement("p");
      note.className = "fine";
      note.textContent = "Pick one. Cancel keeps the first.";
      form.appendChild(h);
      form.appendChild(note);
      options.forEach(function (opt) {
        var b = document.createElement("button");
        b.type = "submit";
        b.className = "btn";
        b.value = opt;
        b.textContent = opt;
        b.style.margin = "0 6px 6px 0";
        form.appendChild(b);
      });
      dlg.appendChild(form);
      var done = false;
      dlg.addEventListener("close", function () {
        if (done) return;
        done = true;
        var value = dlg.returnValue || options[0] || "";
        if (dlg.parentNode) dlg.parentNode.removeChild(dlg);
        resolve(value);
      });
      document.body.appendChild(dlg);
      try { if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", ""); }
      catch (e) { dlg.setAttribute("open", ""); }
    });
  }
  function chooseExempt(title, creatures) {
    creatures = (creatures || []).filter(function (c) { return c && c.id; });
    var preset = creatures.filter(function (c) { return c.defaultOn; }).map(function (c) { return c.id; });
    if (typeof document === "undefined" || !document.body || !creatures.length) return Promise.resolve(preset);
    return new Promise(function (resolve) {
      var dlg = document.createElement("dialog");
      dlg.className = "dlg";
      var form = document.createElement("form");
      form.method = "dialog";
      var h = document.createElement("h2");
      h.textContent = (title || "Spell") + " — unaffected";
      var note = document.createElement("p");
      note.className = "fine";
      note.textContent = "Checked creatures are untouched by the aura, including the speed cut. You are always untouched.";
      form.appendChild(h);
      form.appendChild(note);
      creatures.forEach(function (c) {
        var label = document.createElement("label");
        label.className = "fine";
        label.style.display = "block";
        var box = document.createElement("input");
        box.type = "checkbox";
        box.value = c.id;
        box.checked = !!c.defaultOn;
        label.appendChild(box);
        label.appendChild(document.createTextNode(" " + (c.name || c.id)));
        form.appendChild(label);
      });
      var foot = document.createElement("div");
      foot.className = "dlg-foot";
      var only = document.createElement("button");
      only.type = "submit";
      only.className = "btn";
      only.value = "only";
      only.textContent = "Only me";
      var ok = document.createElement("button");
      ok.type = "submit";
      ok.className = "btn btn-primary";
      ok.value = "yes";
      ok.textContent = "Those creatures";
      foot.appendChild(only);
      foot.appendChild(ok);
      form.appendChild(foot);
      dlg.appendChild(form);
      var done = false;
      form.addEventListener("submit", function (ev) {
        if (ev.preventDefault) ev.preventDefault();
        if (done) return;
        done = true;
        var picked = [];
        if ((ev.submitter && ev.submitter.value) !== "only") {
          var boxes = form.querySelectorAll("input[type=checkbox]");
          Array.prototype.forEach.call(boxes, function (box) { if (box.checked) picked.push(box.value); });
        }
        if (dlg.close) dlg.close();
        if (dlg.parentNode) dlg.parentNode.removeChild(dlg);
        resolve(picked);
      });
      document.body.appendChild(dlg);
      try { if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", ""); }
      catch (e) { dlg.setAttribute("open", ""); }
    });
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

  function chooseAffected(title, creatures) {
    creatures = (creatures || []).filter(function (c) { return c && c.id; });
    if (typeof document === "undefined" || !document.body) return Promise.resolve(creatures.map(function (c) { return c.id; }));
    if (!creatures.length) return Promise.resolve([]);
    return new Promise(function (resolve) {
      var dlg = document.createElement("dialog");
      dlg.className = "dlg";
      var form = document.createElement("form");
      form.method = "dialog";
      var h = document.createElement("h2");
      h.textContent = (title || "Spell") + " — creatures you choose";
      var note = document.createElement("p");
      note.className = "fine";
      note.textContent = "Checked creatures are affected. Leave a friend unchecked.";
      form.appendChild(h);
      form.appendChild(note);
      creatures.forEach(function (c) {
        var label = document.createElement("label");
        label.className = "fine";
        label.style.display = "block";
        var box = document.createElement("input");
        box.type = "checkbox";
        box.value = c.id;
        box.checked = false;
        label.appendChild(box);
        label.appendChild(document.createTextNode(" " + (c.name || c.id)));
        form.appendChild(label);
      });
      var foot = document.createElement("div");
      foot.className = "dlg-foot";
      var cancel = document.createElement("button");
      cancel.type = "button";
      cancel.className = "btn";
      cancel.textContent = "Cancel";
      var ok = document.createElement("button");
      ok.type = "submit";
      ok.className = "btn btn-primary";
      ok.textContent = "Those creatures";
      foot.appendChild(cancel);
      foot.appendChild(ok);
      form.appendChild(foot);
      dlg.appendChild(form);
      var done = false;
      function finish(ids) {
        if (done) return;
        done = true;
        if (dlg.close) dlg.close();
        if (dlg.parentNode) dlg.parentNode.removeChild(dlg);
        resolve(ids);
      }
      cancel.addEventListener("click", function () { finish(null); });
      form.addEventListener("submit", function (ev) {
        if (ev.preventDefault) ev.preventDefault();
        var picked = [];
        Array.prototype.forEach.call(form.querySelectorAll("input[type=checkbox]"), function (box) {
          if (box.checked) picked.push(box.value);
        });
        finish(picked);
      });
      dlg.addEventListener("cancel", function (ev) { if (ev.preventDefault) ev.preventDefault(); finish(null); });
      document.body.appendChild(dlg);
      try { if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", ""); }
      catch (e) { dlg.setAttribute("open", ""); }
    });
  }
  function appearPosts(zone, tokens) {
    if (!zone || !zone.appear || !zone.appear.onFail) return [];
    return (tokens || []).map(function (t) {
      return {
        amount: zone.appear.dice ? null : 0,
        save: zone.appear.save || "DEX",
        condition: zone.appear.onFail || "",
        label: zone.spell,
        spell: zone.spell,
        dice: zone.appear.dice || "",
        half: !!zone.appear.half,
        targetId: (t && (t.combatantId || t.ownerUid || t.id)) || "",
        targetName: (t && t.name) || ""
      };
    }).filter(function (row) { return row.targetId; });
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
    scaledDice: scaledDice,
    roundsFromDur: roundsFromDur,
    tickRounds: tickRounds,
    clearZones: clearZones,
    isExempt: isExempt,
    once: once,
    terrainMult: terrainMult,
    charge: charge,
    growList: growList,
    needsAllies: needsAllies,
    typeOptions: typeOptions,
    chooseOne: chooseOne,
    chooseExempt: chooseExempt,
    chooseAffected: chooseAffected,
    appearPosts: appearPosts
  };
})(typeof window !== "undefined" ? window : globalThis);

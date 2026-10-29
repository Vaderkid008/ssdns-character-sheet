/* SSDNS map attack effects ("firing lines"). One global: SSDNSMapFx.
   Pure helpers (classify, plan, sanitize, prefs) plus the overlay painters the map calls each frame.
   Jessey 2026-10-20 7:26 PM CT: approved from the mockup (specs/attack-fx-demo). Visual only: rolls,
   damage and the existing sound queue are untouched. The map draws on its own overlay canvas and only
   animates while an effect is alive. */
(function (root) {
  "use strict";

  /* ---------- per-user toggle (localStorage, default ON) ---------- */
  var PREF_KEY = "ssdns.map.fx";
  function enabled() {
    try { return root.localStorage.getItem(PREF_KEY) !== "0"; } catch (e) { return true; }
  }
  function setEnabled(on) {
    try { root.localStorage.setItem(PREF_KEY, on ? "1" : "0"); } catch (e) {}
    try { root.dispatchEvent(new CustomEvent("ssdns-map-fx-pref", { detail: { on: !!on } })); } catch (e2) {}
    return !!on;
  }

  /* ---------- timing (ms). sfx.json "fx" may override any of these (keep sfx.json the one place). ---------- */
  var TIMING = {
    tracerGrow: 120, tracerFade: 400,   /* revolver / rifle hit */
    missGrow: 160, missFade: 420,       /* veers wide, dust puff */
    coneFlash: 330, pelletGrow: 90,     /* buckshot */
    arrowFlight: 300, boltFlight: 220, thrownFlight: 380,
    whistleAfter: 120,                  /* Whistler: the whistle trails the release */
    spellGrow: 180, spellHold: 120, spellFade: 450,
    boomFlight: 560, boomFade: 700,     /* thrown dynamite / dynamite arrow: arc, then the boom on landing */
    meleeStrike: 90, meleeFade: 420,
    freeGrow: 110, freeFade: 380, freeSquares: 3,
    stale: 4000                         /* feed rows older than this when the map opened never replay */
  };
  function configure(obj) {
    if (!obj || typeof obj !== "object") return TIMING;
    Object.keys(TIMING).forEach(function (k) {
      var v = Number(obj[k]);
      if (obj[k] != null && isFinite(v) && v >= 0 && v <= 5000) TIMING[k] = v;
    });
    return TIMING;
  }

  /* ---------- classification ---------- */
  var SPELL_CUES = { spellshot: 1, pactshot: 1, spellcast: 1, lightning: 1, "lightning-ultimate": 1, electric: 1, "ice-storm": 1, "magic-whoosh": 1 };
  var BOW_CUES = { bow: 1, "bow-long": 1, twang: 1 };
  var TYPES = ["gun", "buck", "arrow", "bolt", "thrown", "spell", "boom", "free", "blade", "blunt"];
  function low(v) { return String(v == null ? "" : v).toLowerCase(); }
  /** info: { type?, sfx, gun, spell, kind, weapon, name, weaponId, group, scatter, arrow, free, dmgType, properties, explosive } */
  function classify(info) {
    info = info || {};
    if (info.type && TYPES.indexOf(info.type) >= 0) return info.type;
    var cue = low(info.sfx), name = low(info.weapon || info.name || info.model), id = low(info.weaponId || info.id);
    var group = low(info.group), dmg = low(info.dmgType || info.damageType), props = low(info.properties), arrow = low(info.arrow);
    var both = name + " " + id;
    if (info.free) return "free";
    if (/pistol.?whip|gun.?butt|butt.?stroke|rifle.?butt/.test(both)) return "blunt"; /* a gun used as a club */
    if (info.explosive || /dynamite|grenade|bomb\b|molotov|powder keg|explosive/.test(both) || arrow === "dynamite") return "boom";
    if (info.spell || low(info.kind) === "spell" || SPELL_CUES[cue] || /^spell:/.test(id)) return "spell";
    if (info.scatter || cue === "shotgun" || group === "shotgun" || /shotgun|coach gun|scattergun|blunderbuss|buckshot/.test(both)) return "buck";
    if (/crossbow|\bbolt\b/.test(both) || group === "crossbow") return "bolt";
    if (group === "bow" || BOW_CUES[cue] || /^arrow-/.test(cue) || /\bbow\b|longbow|shortbow|\barrow/.test(both) || arrow) return "arrow";
    if (cue === "spear-throw" || /javelin|\bdart\b|throwing|tomahawk throw/.test(both) || (/thrown/.test(props) && low(info.kind) === "thrown")) return "thrown";
    if (info.gun || /pistol|rifle|carbine|caster|bigbore|revolver/.test(group) ||
        /\b(gun|revolver|rifle|carbine|pistol|derringer|pepperbox|musket|plinker|repeater|gatling)\b/.test(both) ||
        { attack: 1, rifle: 1, revolver: 1, plinker: 1, "lever-fire": 1, buffalo: 1, silenced: 1, gatling: 1, "gatling-ellen-manor": 1 }[cue]) return "gun";
    if (/bludgeon/.test(dmg) || cue === "thud" || /unarmed|\bfist|punch|kick|club|mace|hammer|staff|baton|cudgel|pistol.?whip|butt\b|knuckle/.test(both)) return "blunt";
    return "blade";
  }
  function resultOf(v) {
    var s = low(v);
    if (s === "crit" || s === "critical") return "crit";
    if (s === "hit") return "hit";
    if (s === "miss" || s === "misfire") return "miss";
    if (s === "dud") return "dud";
    return "";
  }

  /* ---------- plan: duration, impact time and the sound layers ---------- */
  /* Sound layers the map may play when it draws:
     - "shot": never played here. The existing queue already plays and shares every strike/shot cue.
     - "result": the hit/miss cue at the moment of impact, but only on clients that did not already hear it
       (the resolver and the shooter play it through SSDNSAudio.playOutcome today; see `heard`).
     - "trail": the Whistler whistle a beat after release (sfx.json arrows.whistler; silent until a file exists).
     - "boom": the explosion on landing for thrown dynamite / dynamite arrows (a dud stays quiet). */
  function plan(type, result, info) {
    info = info || {};
    result = resultOf(result);
    var T = TIMING, p = { type: type, result: result, impactAt: 0, duration: 600, cues: [] };
    if (type === "gun") { p.impactAt = result === "miss" ? T.missGrow : T.tracerGrow; p.duration = p.impactAt + Math.max(T.tracerFade, T.missFade) + 200; }
    else if (type === "buck") { p.impactAt = T.pelletGrow; p.duration = T.coneFlash + 260; }
    else if (type === "arrow" || type === "bolt" || type === "thrown") {
      p.impactAt = type === "bolt" ? T.boltFlight : (type === "thrown" ? T.thrownFlight : T.arrowFlight);
      p.duration = p.impactAt + 420;
      if (low(info.arrow) === "whistler") p.cues.push({ at: T.whistleAfter, layer: "trail", cue: "arrow:whistler" });
    }
    else if (type === "spell") {
      var look = lookOf(info);
      var timing = lookTime(look);
      p.impactAt = timing.grow;
      p.duration = timing.grow + timing.hold + timing.fade + 180;
      p.look = look;
    }
    else if (type === "boom") {
      p.impactAt = T.boomFlight; p.duration = T.boomFlight + T.boomFade;
      if (result !== "dud") p.cues.push({ at: T.boomFlight, layer: "boom", cue: "explode" });
    }
    else if (type === "free") { p.impactAt = T.freeGrow; p.duration = T.freeGrow + T.freeFade + 80; }
    else { p.impactAt = T.meleeStrike; p.duration = T.meleeStrike + T.meleeFade + 120; }
    if (result && result !== "dud" && type !== "free" && type !== "boom") p.cues.push({ at: p.impactAt, layer: "result", cue: "outcome" });
    return p;
  }

  /* ---------- public row: only these fields ever leave the DM's client ---------- */
  function num1(v) { var n = Number(v); return isFinite(n) ? Math.round(n * 10) / 10 : null; }
  function sanitize(spec) {
    if (!spec || typeof spec !== "object") return null;
    var out = { v: 1, type: TYPES.indexOf(spec.type) >= 0 ? spec.type : "gun", result: resultOf(spec.result) };
    if (spec.shooter) out.shooter = String(spec.shooter).slice(0, 80);
    if (spec.target) out.target = String(spec.target).slice(0, 80);
    if (spec.src && num1(spec.src.x) != null && num1(spec.src.y) != null) out.src = { x: num1(spec.src.x), y: num1(spec.src.y) };
    if (spec.dir && num1(spec.dir.x) != null && num1(spec.dir.y) != null) out.dir = { x: num1(spec.dir.x), y: num1(spec.dir.y) };
    if (spec.at && num1(spec.at.x) != null && num1(spec.at.y) != null) out.at = { x: num1(spec.at.x), y: num1(spec.at.y) };
    if (spec.arrow) out.arrow = String(spec.arrow).replace(/[^a-z-]/gi, "").slice(0, 20);
    if (spec.sfx) out.sfx = String(spec.sfx).replace(/[^a-z0-9-]/gi, "").slice(0, 40);
    if (spec.weapon) out.weapon = String(spec.weapon).slice(0, 60);
    if (spec.spell) out.spell = String(spec.spell).slice(0, 80);
    if (spec.dmg) out.dmg = String(spec.dmg).toLowerCase().replace(/[^a-z]/g, "").slice(0, 16);
    if (spec.self) out.self = true;
    if (spec.weaponId) out.weaponId = String(spec.weaponId).replace(/[^a-z0-9-]/gi, "").slice(0, 60);
    if (spec.scene) out.scene = String(spec.scene).slice(0, 60);
    var nat = Number(spec.nat);
    if (spec.nat != null && isFinite(nat) && nat >= 1 && nat <= 20) out.nat = Math.round(nat);
    if (spec.crit) out.crit = true;
    var cm = Number(spec.critMin);
    if (spec.critMin != null && isFinite(cm) && cm >= 2 && cm < 20) out.critMin = Math.round(cm);
    if (Array.isArray(spec.heard)) out.heard = spec.heard.filter(Boolean).map(String).slice(0, 4);
    return out;
  }
  /** A player's tableFeed row may carry this request; only the DM's map turns it into a public effect. */
  function request(info) {
    info = info || {};
    var r = { type: classify(info), result: resultOf(info.result) };
    if (info.target) r.target = String(info.target).slice(0, 80);
    if (info.sfx) r.sfx = String(info.sfx).replace(/[^a-z0-9-]/gi, "").slice(0, 40);
    if (info.weapon) r.weapon = String(info.weapon).slice(0, 60);
    if (info.spell) r.spell = String(info.spell).slice(0, 80);
    if (info.dmg) r.dmg = String(info.dmg).toLowerCase().replace(/[^a-z]/g, "").slice(0, 16);
    if (info.self) r.self = true;
    if (info.weaponId) r.weaponId = String(info.weaponId).replace(/[^a-z0-9-]/gi, "").slice(0, 60);
    if (info.arrow) r.arrow = String(info.arrow).replace(/[^a-z-]/gi, "").slice(0, 20);
    var n = Number(info.nat);
    if (info.nat != null && isFinite(n) && n >= 1 && n <= 20) r.nat = Math.round(n);
    if (info.crit) r.crit = true;
    return r;
  }

  /* ---------- painters ---------- */
  function clamp(v, a, b) { a = a == null ? 0 : a; b = b == null ? 1 : b; return Math.max(a, Math.min(b, v)); }
  function easeOut(t) { return 1 - Math.pow(1 - clamp(t), 3); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function rng(seed) { var s = (seed >>> 0) || 1; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  function hash(str) { var h = 2166136261; str = String(str || ""); for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function dirOf(a, b) { var dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1; return { x: dx / d, y: dy / d, d: d }; }
  function grad(ctx, kind, a, b, c, d, e, f) {
    try { return kind === "r" ? ctx.createRadialGradient(a, b, c, d, e, f) : ctx.createLinearGradient(a, b, c, d); } catch (err) { return null; }
  }
  function stops(g, list) { if (!g || !g.addColorStop) return g; list.forEach(function (s) { try { g.addColorStop(s[0], s[1]); } catch (e) {} }); return g; }

  function muzzle(ctx, p, dir, lt, scale) {
    scale = scale || 1;
    /* hold the flash through the tracer's arrival so a hit reads as flash + line, not flash then line */
    var k = 1 - clamp(lt / 200); if (lt < 0 || k <= 0) return;
    var R = 16 * scale * (0.7 + 0.3 * k);
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = stops(grad(ctx, "r", p.x, p.y, 0, p.x, p.y, R), [[0, "rgba(255,250,220," + 0.95 * k + ")"], [0.35, "rgba(255,190,80," + 0.75 * k + ")"], [1, "rgba(255,120,30,0)"]]) || "rgba(255,200,100," + 0.6 * k + ")";
    ctx.beginPath(); ctx.arc(p.x, p.y, R, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(255,220,140," + 0.9 * k + ")"; ctx.lineWidth = 3 * scale; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + dir.x * R * 1.5, p.y + dir.y * R * 1.5); ctx.stroke();
    ctx.restore();
  }
  /* hidden shooter: a soft glow at the fog edge, never a crisp flash at the token */
  function edgeGlow(ctx, p, lt) {
    if (lt < 0 || lt > 220) return; var k = 1 - lt / 220;
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = stops(grad(ctx, "r", p.x, p.y, 0, p.x, p.y, 24), [[0, "rgba(255,200,120," + 0.5 * k + ")"], [1, "rgba(255,140,50,0)"]]) || "rgba(255,200,120," + 0.3 * k + ")";
    ctx.beginPath(); ctx.arc(p.x, p.y, 24, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
  function sparks(ctx, p, lt, seed, color, n, len) {
    if (lt < 0 || lt > 320) return; var k = lt / 320, r = rng(seed);
    color = color || "255,220,150"; n = n || 8; len = len || 16;
    ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.lineCap = "round";
    var fl = 1 - clamp(lt / 160);
    if (fl > 0) {
      ctx.fillStyle = stops(grad(ctx, "r", p.x, p.y, 0, p.x, p.y, 18), [[0, "rgba(255,245,210," + 0.9 * fl + ")"], [1, "rgba(255,150,60,0)"]]) || "rgba(255,230,180," + 0.5 * fl + ")";
      ctx.beginPath(); ctx.arc(p.x, p.y, 18, 0, Math.PI * 2); ctx.fill();
    }
    for (var i = 0; i < n; i++) {
      var a = r() * Math.PI * 2, sp = 0.6 + r() * 0.6, d0 = easeOut(k) * len * 1.6 * sp, d1 = d0 + len * 0.45 * (1 - k);
      ctx.strokeStyle = "rgba(" + color + "," + (1 - k) * 0.95 + ")"; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(p.x + Math.cos(a) * d0, p.y + Math.sin(a) * d0); ctx.lineTo(p.x + Math.cos(a) * d1 * 1.25, p.y + Math.sin(a) * d1 * 1.25); ctx.stroke();
    }
    ctx.restore();
  }
  function redFlash(ctx, p, r, lt, dur) {
    dur = dur || 260; if (lt < 0 || lt > dur) return; var k = 1 - lt / dur;
    ctx.save(); ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(2, r - 2), 0, Math.PI * 2);
    ctx.fillStyle = "rgba(200,40,30," + 0.38 * k + ")"; ctx.fill(); ctx.restore();
  }
  function tracer(ctx, A, B, lt, o) {
    if (lt < 0 || lt > o.grow + o.fade) return;
    var g = easeOut(lt / o.grow), f = lt < o.grow ? 1 : 1 - clamp((lt - o.grow) / o.fade);
    var hx = lerp(A.x, B.x, g), hy = lerp(A.y, B.y, g);
    var tg = lt < o.grow ? 0 : easeOut((lt - o.grow) / o.fade) * 0.85;
    var tx = lerp(A.x, B.x, tg), ty = lerp(A.y, B.y, tg);
    ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.lineCap = "round";
    ctx.strokeStyle = stops(grad(ctx, "l", tx, ty, hx, hy), [[0, "rgba(" + o.glow + ",0)"], [1, "rgba(" + o.glow + "," + o.glowA * f + ")"]]) || "rgba(" + o.glow + "," + o.glowA * f + ")";
    ctx.lineWidth = o.glowW; ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(hx, hy); ctx.stroke();
    ctx.strokeStyle = stops(grad(ctx, "l", tx, ty, hx, hy), [[0, "rgba(" + o.core + "," + 0.15 * f + ")"], [1, "rgba(" + o.core + "," + o.coreA * f + ")"]]) || "rgba(" + o.core + "," + o.coreA * f + ")";
    ctx.lineWidth = o.coreW; ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(hx, hy); ctx.stroke();
    ctx.restore();
  }
  function hitTracer() { return { grow: TIMING.tracerGrow, fade: TIMING.tracerFade, glow: "255,170,60", glowA: 0.55, glowW: 7, core: "255,248,225", coreA: 1, coreW: 2.2 }; }
  function missTracer() { return { grow: TIMING.missGrow, fade: TIMING.missFade, glow: "200,160,110", glowA: 0.25, glowW: 5, core: "235,215,180", coreA: 0.55, coreW: 1.6 }; }
  function dust(ctx, p, lt, seed) {
    if (lt < 0 || lt > 600) return; var k = lt / 600, r = rng(seed);
    ctx.save();
    for (var i = 0; i < 6; i++) {
      var a = r() * Math.PI * 2, d = easeOut(k) * (6 + r() * 10), rr = 3 + r() * 4 + k * 8;
      ctx.fillStyle = "rgba(190,160,110," + 0.45 * (1 - k) + ")"; ctx.beginPath(); ctx.arc(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, rr, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
  function cone(ctx, O, dir, lenPx, lt, seed) {
    if (lt < 0 || lt > TIMING.coneFlash + 90) return;
    var half = Math.atan(0.5), ang = Math.atan2(dir.y, dir.x);
    var fl = lt < 50 ? lt / 50 : 1 - clamp((lt - 50) / (TIMING.coneFlash - 50));
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    if (fl > 0) {
      ctx.fillStyle = stops(grad(ctx, "r", O.x, O.y, 0, O.x, O.y, lenPx), [[0, "rgba(255,235,180," + 0.55 * fl + ")"], [0.5, "rgba(255,170,70," + 0.28 * fl + ")"], [1, "rgba(255,120,40,0)"]]) || "rgba(255,200,120," + 0.3 * fl + ")";
      ctx.beginPath(); ctx.moveTo(O.x, O.y); ctx.arc(O.x, O.y, lenPx, ang - half, ang + half); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "rgba(255,200,120," + 0.35 * fl + ")"; ctx.lineWidth = 1; ctx.stroke();
    }
    var r = rng(seed); ctx.lineCap = "round";
    var g2 = easeOut(lt / TIMING.pelletGrow), f = lt < TIMING.pelletGrow ? 1 : 1 - clamp((lt - TIMING.pelletGrow) / 260);
    for (var i = 0; i < 8; i++) {
      var a = ang + (r() * 2 - 1) * half * 0.9, L = lenPx * (0.75 + r() * 0.3), head = L * g2, tail = Math.max(0, head - 26);
      ctx.strokeStyle = "rgba(255,236,190," + 0.9 * f + ")"; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(O.x + Math.cos(a) * tail, O.y + Math.sin(a) * tail); ctx.lineTo(O.x + Math.cos(a) * head, O.y + Math.sin(a) * head); ctx.stroke();
    }
    ctx.restore();
  }
  function projectile(ctx, A, B, lt, flight, kind) {
    if (lt < 0 || lt > flight + 260) return;
    var d = dirOf(A, B), k = clamp(lt / flight);
    var hx = lerp(A.x, B.x, k), hy = lerp(A.y, B.y, k), f = lt <= flight ? 1 : 1 - (lt - flight) / 260;
    ctx.save(); ctx.lineCap = "round"; ctx.globalCompositeOperation = "lighter";
    var trail = Math.min(k * d.d, 110);
    ctx.strokeStyle = stops(grad(ctx, "l", hx - d.x * trail, hy - d.y * trail, hx, hy), [[0, "rgba(245,215,160,0)"], [1, "rgba(245,215,160," + 0.8 * f + ")"]]) || "rgba(245,215,160," + 0.5 * f + ")";
    ctx.lineWidth = 2.2; if (ctx.setLineDash) ctx.setLineDash([6, 5]);
    ctx.beginPath(); ctx.moveTo(hx - d.x * trail, hy - d.y * trail); ctx.lineTo(hx, hy); ctx.stroke(); if (ctx.setLineDash) ctx.setLineDash([]);
    ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = f;
    var L = kind === "bolt" ? 30 : 42, bx = hx - d.x * L, by = hy - d.y * L, nx = -d.y, ny = d.x;
    ctx.strokeStyle = "#2a1a0c"; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(hx, hy); ctx.stroke();
    ctx.strokeStyle = kind === "thrown" ? "#b9b2a2" : "#e2c085"; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(hx, hy); ctx.stroke();
    ctx.fillStyle = "#e8e2d2"; ctx.beginPath(); ctx.moveTo(hx + d.x * 9, hy + d.y * 9); ctx.lineTo(hx + nx * 5.5, hy + ny * 5.5); ctx.lineTo(hx - nx * 5.5, hy - ny * 5.5); ctx.closePath(); ctx.fill();
    if (kind !== "thrown") {
      ctx.fillStyle = "#b5392c";
      [1, -1].forEach(function (sg) {
        ctx.beginPath(); ctx.moveTo(bx + d.x * 11, by + d.y * 11); ctx.lineTo(bx + nx * 6.5 * sg, by + ny * 6.5 * sg); ctx.lineTo(bx - d.x * 2 + nx * 6.5 * sg, by - d.y * 2 + ny * 6.5 * sg); ctx.lineTo(bx + d.x, by + d.y); ctx.closePath(); ctx.fill();
      });
    }
    ctx.restore();
  }
  function spellLine(ctx, A, B, lt, seed) {
    var T = TIMING; if (lt < 0 || lt > T.spellGrow + T.spellHold + T.spellFade) return;
    var d = dirOf(A, B), nx = -d.y, ny = d.x;
    var g = easeOut(lt / T.spellGrow), f = lt < T.spellGrow + T.spellHold ? 1 : 1 - clamp((lt - T.spellGrow - T.spellHold) / T.spellFade);
    var pts = [];
    for (var i = 0; i <= 40; i++) {
      var u = i / 40 * g, w = Math.sin(u * 18 - lt / 40) * 4 * Math.sin(Math.PI * u / Math.max(g, 0.01));
      pts.push({ x: lerp(A.x, B.x, u) + nx * w, y: lerp(A.y, B.y, u) + ny * w });
    }
    function path() { ctx.beginPath(); pts.forEach(function (p, j) { if (j) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); }); }
    ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(150,50,230," + 0.42 * f + ")"; ctx.lineWidth = 14; path(); ctx.stroke();
    ctx.strokeStyle = "rgba(20,200,170," + 0.95 * f + ")"; ctx.lineWidth = 3.5; path(); ctx.stroke();
    ctx.strokeStyle = "rgba(160,255,235," + 0.6 * f + ")"; ctx.lineWidth = 1; path(); ctx.stroke();
    var r = rng(seed);
    for (var m = 0; m < 14; m++) {
      var uu = r() * g, off = (r() * 2 - 1) * 10 + Math.sin(lt / 120 + m) * 4, life = clamp(lt / 700);
      ctx.fillStyle = m % 2 ? "rgba(180,120,255," + 0.8 * f + ")" : "rgba(110,240,225," + 0.8 * f + ")";
      ctx.beginPath(); ctx.arc(lerp(A.x, B.x, uu) + nx * off, lerp(A.y, B.y, uu) + ny * off - life * 10, 1.6, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
  function bloom(ctx, p, r0, lt, c1, c2, width) {
    if (lt < 0 || lt > 520) return;
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    [[0, c1], [90, c2]].forEach(function (pair) {
      var kk = clamp((lt - pair[0]) / 430); if (kk <= 0 || kk >= 1) return;
      ctx.strokeStyle = "rgba(" + pair[1] + "," + 0.85 * (1 - kk) + ")"; ctx.lineWidth = (width || 3) * (1 - kk) + 1;
      ctx.beginPath(); ctx.arc(p.x, p.y, r0 * (1 + 0.6 * easeOut(kk)), 0, Math.PI * 2); ctx.stroke();
    });
    ctx.restore();
  }
  /* melee: a slash arc across the target from the attacker's side */
  function slash(ctx, T, r, from, lt, hit) {
    var dur = TIMING.meleeFade + TIMING.meleeStrike; if (lt < 0 || lt > dur) return;
    var d = dirOf(from, T), base = Math.atan2(d.y, d.x) + Math.PI; /* the side facing the attacker */
    var sweep = easeOut(lt / TIMING.meleeStrike), f = lt < TIMING.meleeStrike ? 1 : 1 - clamp((lt - TIMING.meleeStrike) / TIMING.meleeFade);
    var R = hit ? r * 1.02 : r * 1.35, a0 = base - 1.15, a1 = a0 + 2.3 * sweep;
    ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.lineCap = "round";
    if (hit) {
      ctx.strokeStyle = "rgba(255,190,120," + 0.35 * f + ")"; ctx.lineWidth = 9; ctx.beginPath(); ctx.arc(T.x, T.y, R, a0, a1); ctx.stroke();
      ctx.strokeStyle = "rgba(255,248,230," + 0.95 * f + ")"; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.arc(T.x, T.y, R, a0, a1); ctx.stroke();
      /* a straight cut across the face of the token */
      var c0 = base - 0.9, c1 = base + 0.9 + Math.PI;
      var p0 = { x: T.x + Math.cos(c0) * r * 0.9, y: T.y + Math.sin(c0) * r * 0.9 }, p1 = { x: T.x + Math.cos(c1) * r * 0.9, y: T.y + Math.sin(c1) * r * 0.9 };
      ctx.strokeStyle = "rgba(255,240,215," + 0.9 * f + ")"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(lerp(p0.x, p1.x, sweep), lerp(p0.y, p1.y, sweep)); ctx.stroke();
    } else {
      ctx.strokeStyle = "rgba(225,215,195," + 0.32 * f + ")"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(T.x, T.y, R, a0, a1); ctx.stroke();
      ctx.strokeStyle = "rgba(225,215,195," + 0.18 * f + ")"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(T.x, T.y, R * 1.12, a0 + 0.2, a1 - 0.1); ctx.stroke();
    }
    ctx.restore();
  }
  function boomArc(ctx, A, B, lt, seed, cell, dud) {
    var T = TIMING; if (lt < 0 || lt > T.boomFlight + T.boomFade) return;
    var k = clamp(lt / T.boomFlight), d = dirOf(A, B), lift = Math.min(d.d * 0.35, cell * 2.2);
    if (lt <= T.boomFlight) {
      var x = lerp(A.x, B.x, k), y = lerp(A.y, B.y, k) - Math.sin(Math.PI * k) * lift;
      ctx.save(); ctx.translate(x, y); ctx.rotate(lt / 60);
      ctx.fillStyle = "#a3312a"; ctx.fillRect(-9, -3, 18, 6); ctx.fillStyle = "#e9d7b0"; ctx.fillRect(-9, -3, 3, 6);
      ctx.restore();
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = "rgba(255,210,120," + (0.6 + 0.4 * Math.sin(lt / 25)) + ")"; ctx.beginPath(); ctx.arc(x + Math.cos(lt / 60) * 10, y + Math.sin(lt / 60) * 10, 2.5, 0, Math.PI * 2); ctx.fill();
      /* faint dotted arc behind it */
      ctx.fillStyle = "rgba(240,210,160,0.35)";
      for (var s = 0; s < 6; s++) { var u = k - s * 0.06; if (u <= 0) break; ctx.beginPath(); ctx.arc(lerp(A.x, B.x, u), lerp(A.y, B.y, u) - Math.sin(Math.PI * u) * lift, 1.4, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
      return;
    }
    var bt = lt - T.boomFlight, bk = clamp(bt / T.boomFade);
    if (dud) { dust(ctx, B, bt, seed); return; }
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    var R = cell * 2 * (0.4 + 0.6 * easeOut(bk)), fl = 1 - clamp(bt / 260);
    if (fl > 0) {
      ctx.fillStyle = stops(grad(ctx, "r", B.x, B.y, 0, B.x, B.y, R), [[0, "rgba(255,250,225," + fl + ")"], [0.35, "rgba(255,170,60," + 0.8 * fl + ")"], [1, "rgba(200,60,20,0)"]]) || "rgba(255,180,80," + 0.6 * fl + ")";
      ctx.beginPath(); ctx.arc(B.x, B.y, R, 0, Math.PI * 2); ctx.fill();
    }
    ctx.strokeStyle = "rgba(255,200,130," + 0.7 * (1 - bk) + ")"; ctx.lineWidth = 3 * (1 - bk) + 1;
    ctx.beginPath(); ctx.arc(B.x, B.y, R * 1.05, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
    sparks(ctx, B, bt, seed, "255,200,120", 12, cell * 0.6);
    ctx.save(); var r = rng(seed + 3);
    for (var i = 0; i < 7; i++) { var a = r() * Math.PI * 2, dd = easeOut(bk) * cell * (1 + r()); ctx.fillStyle = "rgba(70,55,40," + 0.5 * (1 - bk) + ")";
      ctx.beginPath(); ctx.arc(B.x + Math.cos(a) * dd, B.y + Math.sin(a) * dd, 4 + bk * 8, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  }

  /* Locked palette (specs/spell-fx/spell-fx-palette.json). Acid/poison/necrotic/radiant/psychic/thunder
     stay on the default ribbon. fireball / witch-bolt stay unassigned. */
  var LOOK_TIME = {
    ribbon: { grow: 220, hold: 140, fade: 450 },
    fire: { grow: 300, hold: 0, fade: 280 },
    cold: { grow: 360, hold: 0, fade: 600 },
    lightning: { grow: 70, hold: 90, fade: 260 },
    force: { grow: 240, hold: 0, fade: 260 },
    beads: { grow: 260, hold: 0, fade: 260 },
    scurve: { grow: 200, hold: 140, fade: 450 },
    bullet: { grow: 150, hold: 0, fade: 320 },
    shield: { grow: 110, hold: 420, fade: 420 },
    magearmor: { grow: 320, hold: 520, fade: 480 },
    pwt: { grow: 200, hold: 400, fade: 1000 },
    invis: { grow: 280, hold: 200, fade: 500 },
    heal: { grow: 200, hold: 280, fade: 500 },
    bless: { grow: 180, hold: 400, fade: 500 },
    fog: { grow: 400, hold: 600, fade: 500 },
    hand: { grow: 280, hold: 200, fade: 400 }
  };
  var SELF_LOOKS = { shield: 1, magearmor: 1, pwt: 1, invis: 1 };
  function lookTime(look) { return LOOK_TIME[look] || LOOK_TIME.ribbon; }
  function spellKey(spec) {
    return low(spec && (spec.spell || spec.weapon || spec.name));
  }
  function lookOf(spec) {
    spec = spec || {};
    var raw = spellKey(spec);
    var name = raw.replace(/\([^)]*\)/g, " ").replace(/\s+shell\b/g, " ").replace(/\s+/g, " ").trim();
    if (/pact shot|hellshot|lightshot|churn shot|belly shot|sirocco shot|pallbearer load|undertow shot/.test(raw)) return "bullet";
    if (/eldritch blast/.test(name)) return "scurve";
    if (/magic missile|hex needles/.test(name)) return "beads";
    if (/mage armor/.test(name)) return "magearmor";
    if (/\bshield\b/.test(name) && !/shield of faith/.test(name)) return "shield";
    if (/pass without trace/.test(name)) return "pwt";
    if (/invisibility/.test(name)) return "invis";
    if (/healing word|cure wounds/.test(name)) return "heal";
    if (/^bless$/.test(name)) return "bless";
    if (/fog cloud/.test(name)) return "fog";
    if (/mage hand/.test(name)) return "hand";
    var dmg = low(spec.dmg || spec.dmgType || spec.damageType).replace(/[^a-z]/g, "");
    if (dmg === "fire") return "fire";
    if (dmg === "cold") return "cold";
    if (dmg === "lightning" || dmg === "electric") return "lightning";
    if (dmg === "force") return "force";
    if (spec.type === "spell" || name) return "ribbon";
    return "";
  }
  function lookSelf(spec) { return !!SELF_LOOKS[lookOf(spec)]; }
  function rgba(c, a) { return "rgba(" + c + "," + a + ")"; }
  function poly(ctx, pts) {
    ctx.beginPath();
    pts.forEach(function (p, j) { if (j) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); });
  }
  function bowPoint(A, B, u, amp, nx, ny) {
    var w = Math.sin(Math.PI * u) * amp;
    return { x: lerp(A.x, B.x, u) + nx * w, y: lerp(A.y, B.y, u) + ny * w };
  }
  function strokePath(ctx, pts, color, width, alpha) {
    ctx.strokeStyle = rgba(color, alpha);
    ctx.lineWidth = width;
    poly(ctx, pts);
    ctx.stroke();
  }
  /* Black-powder puff. Source-over, light then shade. Revolver ~0.9s, buck ~1.15s. */
  function powderSmoke(ctx, p, dir, lt, wide) {
    var life = wide ? 1150 : 900;
    if (lt < 0 || lt > life) return;
    var k = lt / life;
    var n = wide ? 12 : 7;
    var spread = (wide ? 40 : 28) * Math.PI / 180;
    var drift = (wide ? 30 : 22) * easeOut(k);
    var rise = (wide ? 14 : 12) * easeOut(k);
    var r0 = wide ? 8 : 6;
    var r1 = wide ? 32 : 18;
    var base = Math.atan2(dir.y, dir.x);
    var rand = rng(wide ? 11 : 7);
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    for (var i = 0; i < n; i++) {
      var a = base + (rand() * 2 - 1) * spread;
      var along = drift * (0.35 + rand() * 0.65);
      var x = p.x + Math.cos(a) * along;
      var y = p.y + Math.sin(a) * along - rise * (0.4 + rand());
      var rad = lerp(r0, r1, k) * (0.55 + rand() * 0.6);
      var col = i % 2 ? "118,104,88" : "178,168,150";
      ctx.fillStyle = rgba(col, 0.36 * (1 - k));
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  function ribbonPaint(ctx, A, B, lt, seed) {
    var T = LOOK_TIME.ribbon;
    if (lt < 0 || lt > T.grow + T.hold + T.fade) return;
    var d = dirOf(A, B), nx = -d.y, ny = d.x;
    var g = easeOut(lt / T.grow);
    var f = lt < T.grow + T.hold ? 1 : 1 - clamp((lt - T.grow - T.hold) / T.fade);
    var a = [], b = [];
    for (var i = 0; i <= 36; i++) {
      var u = i / 36 * g;
      var w = Math.sin(u * Math.PI * 2.5) * 7 * Math.sin(Math.PI * u / Math.max(g, 0.01));
      a.push({ x: lerp(A.x, B.x, u) + nx * w, y: lerp(A.y, B.y, u) + ny * w });
      b.push({ x: lerp(A.x, B.x, u) - nx * w, y: lerp(A.y, B.y, u) - ny * w });
    }
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    strokePath(ctx, a, "150,50,230", 10, 0.38 * f);
    strokePath(ctx, b, "20,150,140", 10, 0.38 * f);
    strokePath(ctx, a, "185,120,255", 2.6, 0.9 * f);
    strokePath(ctx, b, "20,200,170", 2.6, 0.95 * f);
    ctx.restore();
  }
  function firePaint(ctx, A, B, lt, seed) {
    var T = LOOK_TIME.fire;
    if (lt < 0 || lt > T.grow + T.fade) return;
    var d = dirOf(A, B);
    var g = easeOut(Math.min(1, lt / T.grow));
    var f = lt < T.grow ? 1 : 1 - clamp((lt - T.grow) / T.fade);
    var hx = lerp(A.x, B.x, g), hy = lerp(A.y, B.y, g);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    var rand = rng(seed);
    for (var i = 0; i < 18; i++) {
      var u = rand() * g;
      var px = lerp(A.x, B.x, u) - d.x * rand() * 12;
      var py = lerp(A.y, B.y, u) - d.y * rand() * 12;
      ctx.fillStyle = rgba(i % 2 ? "255,140,45" : "255,225,160", 0.45 * f);
      ctx.beginPath();
      ctx.arc(px, py, 4 + rand() * 8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = rgba("255,242,205", 0.95 * f);
    ctx.beginPath();
    ctx.arc(hx, hy, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    if (lt > T.grow) bloom(ctx, B, 18, lt - T.grow, "255,150,55", "180,45,15", 4);
  }
  function coldPaint(ctx, A, B, lt) {
    var T = LOOK_TIME.cold;
    if (lt < 0 || lt > T.grow + T.fade) return;
    var d = dirOf(A, B), nx = -d.y, ny = d.x;
    var g = easeOut(Math.min(1, lt / T.grow));
    var f = lt < T.grow ? 1 : 1 - clamp((lt - T.grow) / T.fade);
    var hx = lerp(A.x, B.x, g), hy = lerp(A.y, B.y, g);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = rgba("200,225,250", f);
    ctx.beginPath();
    ctx.moveTo(hx + d.x * 20, hy + d.y * 20);
    ctx.lineTo(hx + nx * 6, hy + ny * 6);
    ctx.lineTo(hx - d.x * 16, hy - d.y * 16);
    ctx.lineTo(hx - nx * 6, hy - ny * 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    if (lt > T.grow) bloom(ctx, B, 16, lt - T.grow, "225,240,255", "90,135,195", 2);
  }
  function jagPaint(ctx, A, B, lt, seed) {
    var T = LOOK_TIME.lightning;
    if (lt < 0 || lt > T.grow + T.hold + T.fade) return;
    var d = dirOf(A, B), nx = -d.y, ny = d.x;
    var g = easeOut(lt / T.grow);
    var f = lt < T.grow + T.hold ? 1 : 1 - clamp((lt - T.grow - T.hold) / T.fade);
    var rand = rng(seed);
    var pts = [A];
    for (var i = 1; i <= 8; i++) {
      var u = i / 8 * g;
      var w = (rand() * 2 - 1) * 12;
      pts.push({ x: lerp(A.x, B.x, u) + nx * w, y: lerp(A.y, B.y, u) + ny * w });
    }
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    strokePath(ctx, pts, "85,120,240", 12, 0.48 * f);
    strokePath(ctx, pts, "232,236,255", 2.6, f);
    ctx.restore();
  }
  function forcePaint(ctx, A, B, lt) {
    var T = LOOK_TIME.force;
    if (lt < 0 || lt > T.grow + T.fade) return;
    var d = dirOf(A, B);
    var f = lt < T.grow ? 1 : 1 - clamp((lt - T.grow) / T.fade);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    for (var i = 0; i < 3; i++) {
      var u = clamp((lt - i * 50) / T.grow);
      if (u <= 0) continue;
      var hx = lerp(A.x, B.x, easeOut(u)), hy = lerp(A.y, B.y, easeOut(u));
      ctx.strokeStyle = rgba(i === 2 ? "215,255,248" : "95,220,205", 0.85 * f);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(hx, hy, 16 + i * 6, Math.atan2(d.y, d.x) - 1.1, Math.atan2(d.y, d.x) + 1.1);
      ctx.stroke();
    }
    ctx.restore();
    if (lt > T.grow) bloom(ctx, B, 20, lt - T.grow, "150,245,230", "30,140,140", 3);
  }
  function beadsPaint(ctx, A, B, lt, seed) {
    var T = LOOK_TIME.beads;
    if (lt < 0 || lt > T.grow + T.fade) return;
    var d = dirOf(A, B), nx = -d.y, ny = d.x;
    var g = easeOut(Math.min(1, lt / T.grow));
    var f = lt < T.grow ? 1 : 1 - clamp((lt - T.grow) / T.fade);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (var i = 0; i < 3; i++) {
      var u = clamp(g - i * 0.18);
      if (u <= 0) continue;
      var p = bowPoint(A, B, u, 22, nx, ny);
      ctx.fillStyle = rgba("155,65,240", 0.85 * f);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = rgba("60,215,195", f);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    if (g > 0.92) bloom(ctx, B, 14, lt - T.grow * 0.92, "170,110,255", "80,230,215", 2);
  }
  function scurvePaint(ctx, A, B, lt) {
    var T = LOOK_TIME.scurve;
    if (lt < 0 || lt > T.grow + T.hold + T.fade) return;
    var d = dirOf(A, B), nx = -d.y, ny = d.x;
    var g = easeOut(lt / T.grow);
    var f = lt < T.grow + T.hold ? 1 : 1 - clamp((lt - T.grow - T.hold) / T.fade);
    var pts = [];
    for (var i = 0; i <= 32; i++) {
      var u = i / 32 * g;
      var w = Math.sin(u * Math.PI * 2) * 16;
      pts.push({ x: lerp(A.x, B.x, u) + nx * w, y: lerp(A.y, B.y, u) + ny * w });
    }
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    strokePath(ctx, pts, "150,50,230", 20, 0.42 * f);
    strokePath(ctx, pts, "25,200,175", 4.4, 0.95 * f);
    ctx.restore();
  }
  function bulletPaint(ctx, A, B, lt, seed) {
    var T = LOOK_TIME.bullet;
    if (lt < 0 || lt > T.grow + T.fade) return;
    var d = dirOf(A, B), nx = -d.y, ny = d.x;
    var g = easeOut(Math.min(1, lt / T.grow));
    var f = lt < T.grow ? 1 : 1 - clamp((lt - T.grow) / T.fade);
    var hx = lerp(A.x, B.x, g), hy = lerp(A.y, B.y, g);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = rgba("40,175,165", 0.55 * f);
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(hx - d.x * 18, hy - d.y * 18);
    ctx.lineTo(hx, hy);
    ctx.stroke();
    ctx.fillStyle = rgba("205,175,255", 0.95 * f);
    ctx.beginPath();
    ctx.ellipse ? ctx.ellipse(hx, hy, 9, 4, Math.atan2(d.y, d.x), 0, Math.PI * 2) : ctx.arc(hx, hy, 5, 0, Math.PI * 2);
    ctx.fill();
    var rand = rng(seed);
    for (var i = 0; i < 3; i++) {
      var u = clamp(g - (i + 1) * 0.2);
      if (u <= 0) continue;
      ctx.strokeStyle = rgba("150,110,240", 0.45 * f);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(lerp(A.x, B.x, u), lerp(A.y, B.y, u), 6 + i * 3, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
    if (lt > T.grow) bloom(ctx, B, 12, lt - T.grow, "170,110,255", "80,230,215", 2);
  }
  function shieldPaint(ctx, T, r, lt) {
    var time = LOOK_TIME.shield;
    if (!T || lt < 0 || lt > time.grow + time.hold + time.fade) return;
    var f = lt < time.grow ? lt / time.grow : (lt < time.grow + time.hold ? 1 : 1 - clamp((lt - time.grow - time.hold) / time.fade));
    var h = r * 2.9, w = r * 2.1;
    ctx.save();
    ctx.translate(T.x - r, T.y);
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = rgba("40,170,160", 0.16 * f);
    ctx.strokeStyle = rgba("95,220,205", 0.95 * f);
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(0, -h * 0.45);
    ctx.lineTo(w * 0.5, -h * 0.2);
    ctx.lineTo(w * 0.42, h * 0.25);
    ctx.quadraticCurveTo(0, h * 0.55, -w * 0.42, h * 0.25);
    ctx.lineTo(-w * 0.5, -h * 0.2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    powderSmoke(ctx, { x: T.x, y: T.y - r }, { x: 0, y: -1 }, lt, false);
  }
  function mageArmorPaint(ctx, T, r, lt) {
    var time = LOOK_TIME.magearmor;
    if (!T || lt < 0 || lt > time.grow + time.hold + time.fade) return;
    var f = lt < time.grow ? 1 : (lt < time.grow + time.hold ? 1 : 1 - clamp((lt - time.grow - time.hold) / time.fade));
    var close = lt < time.grow ? lerp(1.7, 1.22, easeOut(lt / time.grow)) : 1.22;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = rgba("90,215,200", 0.85 * f);
    ctx.lineWidth = 2.4;
    for (var i = 0; i < 6; i++) {
      var a0 = (i / 6) * Math.PI * 2 + lt * 0.0011;
      ctx.beginPath();
      ctx.arc(T.x, T.y, r * close, a0, a0 + 0.7);
      ctx.stroke();
    }
    ctx.restore();
  }
  function utilityPaint(ctx, look, A, B, T, r, lt) {
    var time = lookTime(look);
    if (lt < 0 || lt > time.grow + time.hold + time.fade) return;
    var f = lt < time.grow + time.hold ? 1 : 1 - clamp((lt - time.grow - time.hold) / time.fade);
    var p = T || B || A;
    if (!p) return;
    ctx.save();
    if (look === "pwt" || look === "fog") ctx.globalCompositeOperation = "source-over";
    else ctx.globalCompositeOperation = "lighter";
    var col = look === "heal" ? "140,195,95" : (look === "bless" ? "240,205,120" : (look === "fog" || look === "pwt" ? "150,150,148" : (look === "hand" ? "120,230,215" : "190,215,225")));
    ctx.fillStyle = rgba(col, (look === "fog" ? 0.28 : 0.35) * f);
    ctx.beginPath();
    ctx.arc(p.x, p.y, (r || 18) * (look === "fog" ? 2.2 : 1.3), 0, Math.PI * 2);
    ctx.fill();
    if (look === "hand") {
      var d = dirOf(A, B);
      var g = easeOut(Math.min(1, lt / time.grow));
      ctx.fillStyle = rgba("40,170,160", 0.8 * f);
      ctx.beginPath();
      ctx.arc(lerp(A.x, B.x, g), lerp(A.y, B.y, g), 7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  function spellPaint(ctx, A, B, lt, seed, spec, g) {
    var look = lookOf(spec);
    var T = g && (g.T || g.S);
    var r = (g && (g.rT || g.rS)) || 18;
    if (look === "fire") return firePaint(ctx, A, B, lt, seed);
    if (look === "cold") return coldPaint(ctx, A, B, lt);
    if (look === "lightning") return jagPaint(ctx, A, B, lt, seed);
    if (look === "force") return forcePaint(ctx, A, B, lt);
    if (look === "beads") return beadsPaint(ctx, A, B, lt, seed);
    if (look === "scurve") return scurvePaint(ctx, A, B, lt);
    if (look === "bullet") return bulletPaint(ctx, A, B, lt, seed);
    if (look === "shield") return shieldPaint(ctx, T, r, lt);
    if (look === "magearmor") return mageArmorPaint(ctx, T, r, lt);
    if (look === "pwt" || look === "invis" || look === "heal" || look === "bless" || look === "fog" || look === "hand") {
      return utilityPaint(ctx, look, A, B, T, r, lt);
    }
    return ribbonPaint(ctx, A, B, lt, seed);
  }

  /** Paint one effect frame. g = screen geometry from the map:
      { A (line start), B (impact point), S (shooter centre or null when hidden), T (target centre or null),
        rS, rT, cell, dir, srcHidden } ; lt = ms since the effect started. */
  function paint(ctx, fx, lt, g) {
    if (!ctx || !fx || !g) return;
    var type = fx.type, res = resultOf(fx.result), seed = fx.seed || 7, cell = g.cell || 50;
    var A = g.A, B = g.B, T = g.T || g.B, dir = g.dir || dirOf(A, B);
    var hit = res === "hit" || res === "crit";
    var flashAt = function (dl) { if (g.T && hit) redFlash(ctx, g.T, g.rT || cell * 0.4, lt - dl); };
    if (type === "free") {
      var end = { x: A.x + dir.x * cell * TIMING.freeSquares, y: A.y + dir.y * cell * TIMING.freeSquares };
      if (g.srcHidden) edgeGlow(ctx, A, lt);
      else { muzzle(ctx, A, dir, lt); powderSmoke(ctx, A, dir, lt, false); }
      tracer(ctx, A, end, lt, { grow: TIMING.freeGrow, fade: TIMING.freeFade, glow: "255,170,60", glowA: 0.4, glowW: 6, core: "255,240,210", coreA: 0.8, coreW: 1.8 });
      return;
    }
    if (type === "gun") {
      if (g.srcHidden) edgeGlow(ctx, A, lt);
      else { muzzle(ctx, A, dir, lt); powderSmoke(ctx, A, dir, lt, false); }
      if (res === "miss") {
        var nx = -dir.y, ny = dir.x, side = (seed % 2) ? 1 : -1;
        var wide = { x: T.x + side * nx * cell * 0.55 + dir.x * cell * 1.7, y: T.y + side * ny * cell * 0.55 + dir.y * cell * 1.7 };
        tracer(ctx, A, wide, lt, missTracer()); dust(ctx, wide, lt - TIMING.missGrow, seed);
      } else {
        tracer(ctx, A, B, lt, hitTracer());
        if (hit) { sparks(ctx, B, lt - TIMING.tracerGrow, seed, null, res === "crit" ? 12 : 8); flashAt(TIMING.tracerGrow); }
      }
      return;
    }
    if (type === "buck") {
      if (g.srcHidden) edgeGlow(ctx, A, lt);
      else { muzzle(ctx, A, dir, lt, 1.35); powderSmoke(ctx, A, dir, lt, true); }
      cone(ctx, A, dir, cell * 3, lt, seed);
      if (hit && g.T) { sparks(ctx, g.T, lt - TIMING.pelletGrow, seed + 1, "255,215,150", 6, 12); flashAt(TIMING.pelletGrow); }
      return;
    }
    if (type === "arrow" || type === "bolt" || type === "thrown") {
      var flight = type === "bolt" ? TIMING.boltFlight : (type === "thrown" ? TIMING.thrownFlight : TIMING.arrowFlight);
      if (res === "miss") {
        var mx = -dir.y, my = dir.x, sd = (seed % 2) ? 1 : -1;
        var past = { x: T.x + sd * mx * cell * 0.5 + dir.x * cell * 1.4, y: T.y + sd * my * cell * 0.5 + dir.y * cell * 1.4 };
        projectile(ctx, A, past, lt, flight * 1.25, type); dust(ctx, past, lt - flight * 1.25, seed);
      } else {
        projectile(ctx, A, B, lt, flight, type);
        if (hit) { sparks(ctx, B, lt - flight, seed, "230,200,150", 5, 10); flashAt(flight); }
      }
      return;
    }
    if (type === "spell") {
      var look = lookOf(fx);
      var when = lookTime(look).grow;
      if (res === "miss" && !SELF_LOOKS[look]) {
        var sx = -dir.y, sy = dir.x;
        var off = { x: T.x + sx * cell * 0.6 + dir.x * cell * 0.8, y: T.y + sy * cell * 0.6 + dir.y * cell * 0.8 };
        spellPaint(ctx, A, off, lt, seed, fx, g);
      } else {
        spellPaint(ctx, A, B, lt, seed, fx, g);
        if (g.T && (look === "ribbon" || look === "lightning" || look === "scurve")) bloom(ctx, g.T, g.rT || cell * 0.4, lt - when, "170,110,255", "80,230,215");
        if (look === "ribbon" || look === "fire" || look === "lightning" || look === "force" || look === "scurve" || look === "bullet") flashAt(when);
      }
      return;
    }
    if (type === "boom") { boomArc(ctx, A, g.T || B, lt, seed, cell, res === "dud"); return; }
    /* melee: no line */
    if (!g.T) return;
    var from = g.S || g.A;
    if (type === "blunt" && hit) {
      bloom(ctx, g.T, g.rT, lt - TIMING.meleeStrike * 0.5, "255,235,190", "255,140,60", 6);
      redFlash(ctx, g.T, g.rT, lt - TIMING.meleeStrike * 0.5, 320);
    } else if (type === "blunt") {
      slash(ctx, g.T, g.rT, from, lt, false);
    } else {
      slash(ctx, g.T, g.rT, from, lt, hit);
      if (hit) redFlash(ctx, g.T, g.rT, lt - TIMING.meleeStrike * 0.6, 300);
    }
  }

  /* ---------- pre-effect hook (for a later crit/fumble d20 zoom; NOT built) ----------
     The map calls beforeEffect(event) and starts the effect when the returned promise settles.
     event = { type, result, nat, crit, critMin, natural20, natural1, shooter, target, local }.
     Default resolves at once. A hook that never settles is cut off after HOOK_TIMEOUT_MS. */
  var HOOK_TIMEOUT_MS = 6000;
  var hook = null;
  var hookTimeout = HOOK_TIMEOUT_MS;
  function beforeEffect(ev) {
    if (typeof hook !== "function") return Promise.resolve();
    var p;
    try { p = Promise.resolve(hook(ev)); } catch (e) { return Promise.resolve(); }
    return new Promise(function (done) {
      var t = setTimeout(done, hookTimeout);
      p.then(function () { clearTimeout(t); done(); }, function () { clearTimeout(t); done(); });
    });
  }
  /* setBeforeEffect(fn, { timeoutMs }) — timeoutMs caps how long one effect may wait (default 6000, max 30000) */
  function setBeforeEffect(fn, opts) {
    hook = typeof fn === "function" ? fn : null;
    var ms = opts && Number(opts.timeoutMs);
    hookTimeout = (opts && opts.timeoutMs != null && isFinite(ms) && ms >= 0) ? Math.min(ms, 30000) : HOOK_TIMEOUT_MS;
    return !!hook;
  }
  function effectEvent(spec, extra) {
    spec = spec || {};
    var nat = spec.nat != null ? Number(spec.nat) : null;
    return Object.assign({
      type: spec.type || "", result: resultOf(spec.result), nat: isFinite(nat) ? nat : null,
      crit: !!spec.crit || resultOf(spec.result) === "crit", critMin: spec.critMin || 20,
      natural20: nat === 20, natural1: nat === 1, shooter: spec.shooter || "", target: spec.target || ""
    }, extra || {});
  }

  root.SSDNSMapFx = {
    beforeEffect: beforeEffect, setBeforeEffect: setBeforeEffect, effectEvent: effectEvent, HOOK_TIMEOUT_MS: HOOK_TIMEOUT_MS,
    PREF_KEY: PREF_KEY, enabled: enabled, setEnabled: setEnabled,
    TIMING: TIMING, configure: configure, TYPES: TYPES,
    classify: classify, resultOf: resultOf, plan: plan, sanitize: sanitize, request: request,
    lookOf: lookOf, lookSelf: lookSelf, lookTime: lookTime,
    paint: paint, hash: hash, dirOf: dirOf
  };
  root.SSDNSMapFX = root.SSDNSMapFx; /* alias: both spellings work */
})(typeof window !== "undefined" ? window : globalThis);

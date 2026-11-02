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
    /* spellfile- replaced spellshot when a drop is present. "Fire Bolt" also matches the quarrel test below. */
    if (info.spell || low(info.kind) === "spell" || SPELL_CUES[cue] || /^spellfile-/.test(cue) || /^spell:/.test(id)) return "spell";
    if (/\b(fire bolt|scorching ray|ray of frost|shocking grasp|witch bolt|guiding bolt|lightning bolt)\b/.test(both)) return "spell";
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
      if (look === "witch-bolt" && info.pulse) { p.impactAt = 80; p.duration = 720; }
      if (look === "disintegrate" && info.crumbOnly) { p.impactAt = 40; p.duration = 2300; }
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
  function packList(list, limit) {
    if (!Array.isArray(list)) return null;
    var out = [];
    list.forEach(function (item) {
      if (out.length >= limit) return;
      if (item == null) return;
      if (typeof item === "string" || typeof item === "number") {
        var rawId = String(item).trim();
        if (/^[A-Za-z0-9_-]{1,80}$/.test(rawId)) out.push({ id: rawId });
        return;
      }
      if (typeof item !== "object") return;
      var row = {};
      if (item.id && /^[A-Za-z0-9_-]{1,80}$/.test(String(item.id))) row.id = String(item.id);
      var x = num1(item.x), y = num1(item.y);
      if (x != null && y != null) { row.x = x; row.y = y; }
      var res = item.result ? resultOf(item.result) : "";
      if (res) row.result = res;
      if (item.miss || res === "miss") row.miss = true;
      if (row.id || (row.x != null && row.y != null)) out.push(row);
    });
    return out.length ? out : null;
  }
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
    if (spec.weapon) out.weapon = String(spec.weapon).slice(0, 80);
    var spellName = spellText(spec.spell) || (spec.type === "spell" ? spellText(spec.weapon) : "");
    if (spellName) out.spell = spellName.slice(0, 80);
    var dmgName = spellText(spec.dmg) || spellText(spec.dmgType);
    if (dmgName) out.dmg = dmgName.toLowerCase().replace(/[^a-z]/g, "").slice(0, 16);
    if (spec.self) out.self = true;
    var face = Number(spec.facing);
    if (spec.facing != null && isFinite(face)) out.facing = Math.round(face * 1000) / 1000;
    if (spec.weaponId) out.weaponId = String(spec.weaponId).replace(/[^a-z0-9-]/gi, "").slice(0, 60);
    if (spec.scene) out.scene = String(spec.scene).slice(0, 60);
    var hops = packList(spec.hops, 6);
    if (hops) out.hops = hops;
    var rays = packList(spec.rays, 8);
    if (rays) out.rays = rays;
    if (spec.dust) out.dust = true;
    if (spec.crumbOnly) out.crumbOnly = true;
    if (spec.pulse) out.pulse = true;
    var nat = Number(spec.nat);
    if (spec.nat != null && isFinite(nat) && nat >= 1 && nat <= 20) out.nat = Math.round(nat);
    if (spec.crit) out.crit = true;
    if (spec.who) out.who = String(spec.who).replace(/\s+/g, " ").trim().slice(0, 48);
    if (spec.id) out.zoomId = String(spec.id).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 80);
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
    if (info.weapon) r.weapon = String(info.weapon).slice(0, 80);
    var spellName = spellText(info.spell) || ((info.type === "spell" || info.kind === "spell" || info.spell === true) ? spellText(info.weapon) : "");
    if (spellName) r.spell = spellName.slice(0, 80);
    var dmgName = spellText(info.dmg) || spellText(info.dmgType);
    if (dmgName) r.dmg = dmgName.toLowerCase().replace(/[^a-z]/g, "").slice(0, 16);
    if (info.self) r.self = true;
    var face = Number(info.facing);
    if (info.facing != null && isFinite(face)) r.facing = Math.round(face * 1000) / 1000;
    if (info.at && isFinite(Number(info.at.x)) && isFinite(Number(info.at.y))) {
      r.at = { x: Math.round(Number(info.at.x) * 10) / 10, y: Math.round(Number(info.at.y) * 10) / 10 };
    }
    if (info.weaponId) r.weaponId = String(info.weaponId).replace(/[^a-z0-9-]/gi, "").slice(0, 60);
    var reqHops = packList(info.hops, 6);
    if (reqHops) r.hops = reqHops;
    var reqRays = packList(info.rays, 8);
    if (reqRays) r.rays = reqRays;
    if (info.dust) r.dust = true;
    if (info.crumbOnly) r.crumbOnly = true;
    if (info.pulse) r.pulse = true;
    if (info.arrow) r.arrow = String(info.arrow).replace(/[^a-z-]/gi, "").slice(0, 20);
    var n = Number(info.nat);
    if (info.nat != null && isFinite(n) && n >= 1 && n <= 20) r.nat = Math.round(n);
    if (info.crit) r.crit = true;
    var cm = Number(info.critMin);
    if (info.critMin != null && isFinite(cm) && cm >= 2 && cm <= 20) r.critMin = Math.round(cm);
    return r;
  }

  /* ---------- painters ---------- */
  function clamp(v, a, b) { a = a == null ? 0 : a; b = b == null ? 1 : b; return Math.max(a, Math.min(b, v)); }
  function easeOut(t) { return 1 - Math.pow(1 - clamp(t), 3); }
  function easeInOut(t) { t = clamp(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
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

  /* Locked palette (specs/spell-fx/spell-fx-palette.json). The six v5 types use those locked colours.
     Fireball is its own powder-keg sphere (not the Fire Bolt beam). Thunderwave is a cube off the caster.
     Burning Hands is a 15-ft blast off the palm, not the chunk cone chip. Shatter is a wedge plus a 10-ft burst.
     Chunk 1 Phase 1 paints named outlines for Witch Bolt, Scorching Ray, Guiding Bolt, Sacred Flame,
     Chill Touch, Acid Arrow, Poison Spray, Chain Lightning, and Disintegrate.
     Shocking Grasp and Lightning Bolt stay on lightning. Fire Bolt stays on fire. Acid Splash stays on acid.
     Spiritual Weapon stays a token. Grease, Light, Daylight, and Wall of Fire are zones, not beams. */
  var LOOK_TIME = {
    ribbon: { grow: 220, hold: 140, fade: 450 },
    fire: { grow: 300, hold: 0, fade: 280 },
    cold: { grow: 360, hold: 0, fade: 600 },
    lightning: { grow: 70, hold: 90, fade: 260 },
    force: { grow: 240, hold: 0, fade: 260 },
    acid: { grow: 330, hold: 0, fade: 420 },
    poison: { grow: 430, hold: 0, fade: 520 },
    necrotic: { grow: 260, hold: 160, fade: 560 },
    radiant: { grow: 280, hold: 0, fade: 260 },
    thunder: { grow: 110, hold: 60, fade: 320 },
    /* Fireball grow is the bead's flight. The sphere starts when it arrives. Thunderwave dust hangs through the fade.
       Burning Hands fills a 15-ft cone. Shatter travels the wedge, then the 10-ft burst hangs. */
    fireball: { grow: 380, hold: 360, fade: 1500 },
    thundercube: { grow: 110, hold: 200, fade: 1700 },
    firecone: { grow: 160, hold: 380, fade: 900 },
    shatter: { grow: 180, hold: 260, fade: 1100 },
    psychic: { grow: 300, hold: 0, fade: 300 },
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
    hand: { grow: 280, hold: 200, fade: 400 },
    /* Chunk 1 Phase 1 clocks. They follow the Love-it outlines, not the short damage-type beams. */
    "witch-bolt": { grow: 70, hold: 2930, fade: 700 },
    "scorching-ray": { grow: 110, hold: 520, fade: 400 },
    "guiding-bolt": { grow: 230, hold: 1500, fade: 280 },
    "sacred-flame": { grow: 360, hold: 1100, fade: 600 },
    "chill-touch": { grow: 300, hold: 750, fade: 700 },
    "acid-arrow": { grow: 380, hold: 2920, fade: 800 },
    "poison-spray": { grow: 150, hold: 500, fade: 650 },
    "chain-lightning": { grow: 260, hold: 2400, fade: 700 },
    "disintegrate": { grow: 60, hold: 1740, fade: 1100 }
  };
  var SELF_LOOKS = { shield: 1, magearmor: 1, pwt: 1, invis: 1, flameblade: 1, fireshield: 1, produceflame: 1, agathys: 1, tintype: 1, haze: 1 };
  /* N85 Chunks 2–6 named looks. Damage-type keys already locked by tests stay on lookOf's later pass. */
  var CHUNK_LOOKS = {
    "hex": "hex",
    "hunter's mark": "brand",
    "thorn whip": "thorn",
    "hellish rebuke": "rebuke",
    "flame blade": "flameblade",
    "flaming sphere": "token",
    "spiritual weapon": "token",
    "guardian of faith": "token",
    "heat metal": "heat",
    "fire shield": "fireshield",
    "vampiric touch": "siphon",
    "ray of enfeeblement": "enfeeble",
    "call lightning": "skybolt",
    "sunbeam": "sunshaft",
    "finger of death": "deathray",
    "prismatic spray": "prism",
    "meteor swarm": "meteors",
    "produce flame": "produceflame",
    "ray of sickness": "sickray",
    "chromatic orb": "orb",
    "searing smite": "smitefire",
    "branding smite": "brand",
    "thunderous smite": "thunder",
    "wrathful smite": "fear",
    "blinding smite": "blind",
    "banishing smite": "banish",
    "staggering smite": "stagger",
    "wall of ice": "wallice",
    "wall of thorns": "wallthorn",
    "blade barrier": "wallblade",
    "hunger of hadar": "void",
    "arms of hadar": "void",
    "cloud of daggers": "daggers",
    "insect plague": "swarm",
    "incendiary cloud": "furnace",
    "flame strike": "skypillar",
    "fire storm": "skypillar",
    "freezing sphere": "icebomb",
    "sunburst": "sunburst",
    "circle of death": "deathring",
    "delayed blast fireball": "bead",
    "conjure barrage": "volley",
    "conjure volley": "volley",
    "lightning arrow": "charged",
    "hail of thorns": "thorn",
    "ensnaring strike": "ensnare",
    "contagion": "fever",
    "phantasmal killer": "specter",
    "harm": "deathray",
    "destructive wave": "stomp",
    "cone of cold": "coldcone",
    "vicious mockery": "mockery",
    "dissonant whispers": "whispers",
    "mass healing word": "massword",
    "mass cure wounds": "masscure",
    "heal": "healcolumn",
    /* N91 Chunks 7–9. Soft-locked looks. Keys stay off the damage-type pass. */
    "entangle": "briar",
    "faerie fire": "foxfire",
    "sleep": "chloroform",
    "bane": "jinx",
    "armor of agathys": "agathys",
    "color spray": "limelight",
    "darkness": "darkvoid",
    "hold person": "lasso",
    "burning hands": "firecone",
    "fireball": "fireball",
    "thunderwave": "thundercube",
    "misty step": "dustpop",
    "web": "silk",
    "spike growth": "cholla",
    "mirror image": "tintype",
    "blur": "haze",
    "silence": "hush",
    "counterspell": "snap",
    "fear": "terror",
    "haste": "brass",
    "slow": "molasses",
    "hypnotic pattern": "mesmer",
    "fly": "flight",
    "stinking cloud": "gutfog",
    "wind wall": "gale",
    "banishment": "rift",
    "black tentacles": "tentacles",
    "polymorph": "morph",
    /* Chunk 1 Phase 1 named looks. Damage-type painters stay for the other spells on those types. */
    "witch bolt": "witch-bolt",
    "scorching ray": "scorching-ray",
    "guiding bolt": "guiding-bolt",
    "sacred flame": "sacred-flame",
    "chill touch": "chill-touch",
    "acid arrow": "acid-arrow",
    "poison spray": "poison-spray",
    "chain lightning": "chain-lightning",
    "disintegrate": "disintegrate"
  };
  var CHUNK_KIND = {
    briar: "zone", foxfire: "wrap", chloroform: "shot", jinx: "wrap", agathys: "held",
    limelight: "cone", firecone: "cone", darkvoid: "zone", lasso: "wrap", dustpop: "pop", silk: "zone",
    cholla: "zone", tintype: "held", haze: "held", hush: "zone", snap: "shot",
    terror: "cone", brass: "wrap", molasses: "wrap", mesmer: "zone", flight: "held",
    gutfog: "zone", gale: "wall", rift: "shot", tentacles: "zone", morph: "shot"
  };
  var CHUNK_TIME = {
    zone: { grow: 280, hold: 420, fade: 500 },
    wrap: { grow: 160, hold: 380, fade: 420 },
    held: { grow: 200, hold: 480, fade: 400 },
    shot: { grow: 180, hold: 80, fade: 280 },
    cone: { grow: 90, hold: 50, fade: 180 },
    pop: { grow: 140, hold: 80, fade: 280 },
    wall: { grow: 220, hold: 400, fade: 360 }
  };
  var CHUNK_TILES = {
    "entangle": "map/spell-fx/tiles/01-entangle.jpg",
    "faerie fire": "map/spell-fx/tiles/02-faerie-fire.jpg",
    "sleep": "map/spell-fx/tiles/03-sleep.jpg",
    "bane": "map/spell-fx/tiles/04-bane.jpg",
    "armor of agathys": "map/spell-fx/tiles/05-armor-of-agathys.jpg",
    "color spray": "map/spell-fx/tiles/06-color-spray.jpg",
    "darkness": "map/spell-fx/tiles/07-darkness.jpg",
    "hold person": "map/spell-fx/tiles/08-hold-person.jpg",
    "misty step": "map/spell-fx/tiles/09-misty-step.jpg",
    "web": "map/spell-fx/tiles/10-web.jpg",
    "spike growth": "map/spell-fx/tiles/01-spike-growth.jpg",
    "mirror image": "map/spell-fx/tiles/02-mirror-image.jpg",
    "blur": "map/spell-fx/tiles/03-blur.jpg",
    "silence": "map/spell-fx/tiles/04-silence.jpg",
    "counterspell": "map/spell-fx/tiles/05-counterspell.jpg",
    "fear": "map/spell-fx/tiles/06-fear.jpg",
    "haste": "map/spell-fx/tiles/07-haste.jpg",
    "slow": "map/spell-fx/tiles/08-slow.jpg",
    "hypnotic pattern": "map/spell-fx/tiles/09-hypnotic-pattern.jpg",
    "fly": "map/spell-fx/tiles/10-fly.jpg",
    "stinking cloud": "map/spell-fx/tiles/01-stinking-cloud.jpg",
    "wind wall": "map/spell-fx/tiles/02-wind-wall.jpg",
    "banishment": "map/spell-fx/tiles/03-banishment.jpg",
    "black tentacles": "map/spell-fx/tiles/04-black-tentacles.jpg",
    "polymorph": "map/spell-fx/tiles/05-polymorph.jpg"
  };
  var CHUNK_COLORS = {
    hex: "95,45,100", brand: "230,175,70", thorn: "90,95,45", rebuke: "200,60,15",
    flameblade: "255,125,35", heat: "255,140,45", fireshield: "255,90,16", rime: "200,225,250",
    siphon: "225,70,80", enfeeble: "140,130,140", skybolt: "85,120,240", sunshaft: "255,232,170",
    deathray: "95,45,100", prism: "190,95,40", meteors: "255,125,35", produceflame: "255,160,40",
    sickray: "150,140,70", orb: "255,125,35", smitefire: "255,125,35", thunder: "235,215,170",
    fear: "95,45,100", blind: "255,250,235", banish: "95,220,205", stagger: "215,125,170",
    wallice: "200,225,250", wallthorn: "110,120,70", wallblade: "220,225,235", void: "6,3,8",
    daggers: "220,225,235", swarm: "70,50,30", furnace: "40,34,30", skypillar: "255,125,35",
    icebomb: "200,225,250", sunburst: "255,250,230", deathring: "95,45,100", bead: "255,160,40",
    volley: "90,95,105", charged: "85,120,240", ensnare: "90,95,45", fever: "195,185,110",
    specter: "215,125,170", stomp: "200,170,110", coldcone: "80,125,185", mockery: "215,125,170",
    whispers: "190,170,225", massword: "205,220,140", masscure: "255,232,170", healcolumn: "255,250,230",
    cage: "85,120,240", token: "230,210,140",
    briar: "90,95,45", foxfire: "150,120,170", chloroform: "190,175,210", jinx: "120,30,30",
    agathys: "200,225,250", limelight: "220,170,90", firecone: "255,110,28", darkvoid: "6,5,4", lasso: "95,220,205",
    dustpop: "190,190,185", silk: "220,215,200", cholla: "215,190,130", tintype: "200,205,205",
    haze: "230,180,110", hush: "190,190,180", snap: "95,220,205", terror: "150,70,170",
    brass: "220,180,90", molasses: "225,160,60", mesmer: "210,150,170", flight: "200,185,160",
    gutfog: "120,105,60", gale: "200,185,160", rift: "95,220,205", tentacles: "25,20,28",
    morph: "170,200,110"
  };
  function lookTime(look) {
    /* Burning Hands stays listed as a chunk cone, but the blast is not that 90 ms chip.
       Color Spray and Fear still use the chip. Shatter has its own clock. */
    if (look === "firecone" || look === "shatter") return LOOK_TIME[look];
    var kind = CHUNK_KIND[look];
    if (kind && CHUNK_TIME[kind]) return CHUNK_TIME[kind];
    return LOOK_TIME[look] || LOOK_TIME.ribbon;
  }
  /* A boolean spell flag is not a name. "true" must not become the lookup key. */
  function spellText(v) {
    if (v == null || v === true || v === false) return "";
    var s = String(v).replace(/\s+/g, " ").trim();
    if (!s || s === "true" || s === "false") return "";
    return s;
  }
  function spellKey(spec) {
    spec = spec || {};
    return low(spellText(spec.spell) || spellText(spec.weapon) || spellText(spec.name));
  }
  /* Sheet labels are "Hold Person (Lasso)" or sometimes the western name alone.
     Chunk keys are the 5e name. Try the outside, the inside, and the alias table before ribbon. */
  function spellCandidates(spec) {
    var raw = spellKey(spec);
    var out = [];
    function add(s) {
      s = low(s).replace(/\s+/g, " ").trim();
      if (!s || s === "true" || s === "false") return;
      if (out.indexOf(s) < 0) out.push(s);
    }
    add(raw);
    add(raw.replace(/\s+shell\b/g, " "));
    var stripped = raw.replace(/\s+shell\b/g, " ");
    add(stripped.replace(/\([^)]*\)/g, " "));
    var bits = stripped.match(/\(([^)]+)\)/g) || [];
    bits.forEach(function (bit) { add(bit.replace(/[()]/g, "")); });
    var aliases = (root.SSDNS_RULES && root.SSDNS_RULES.spellAliases) || [];
    var seed = out.slice();
    seed.forEach(function (n) {
      aliases.forEach(function (a) {
        if (!a || !a.phb) return;
        var phb = low(a.phb);
        var alias = low(a.alias);
        if (!phb || !alias || alias === "—" || /prints as 5e/.test(alias)) return;
        if (n === phb || n === phb.replace(/\s+shell$/, "")) add(alias);
        if (n === alias) add(phb);
      });
    });
    return out;
  }
  function lookOf(spec) {
    spec = spec || {};
    var names = spellCandidates(spec);
    var raw = names.join(" ");
    if (/pact shot|hellshot|lightshot|churn shot|belly shot|sirocco shot|pallbearer load|undertow shot/.test(raw)) return "bullet";
    var i, name;
    /* Thunderwave's frontier label is "Porch Boom". That name is not the chunk key.
       Without the rules alias table it used to miss CHUNK_LOOKS and fall through to
       damage-type thunder, which paints the short 3-point wedge. */
    if (/thunderwave|porch boom/.test(raw)) return "thundercube";
    for (i = 0; i < names.length; i++) {
      name = names[i];
      if (/eldritch blast/.test(name)) return "scurve";
      if (/magic missile|hex needles/.test(name)) return "beads";
      if (/mage armor/.test(name)) return "magearmor";
      if (/\bshield\b/.test(name) && !/shield of faith/.test(name) && !/fire shield/.test(name)) return "shield";
      if (/pass without trace/.test(name)) return "pwt";
      if (/invisibility/.test(name)) return "invis";
      if (/^healing word$|^cure wounds$/.test(name)) return "heal";
      if (CHUNK_LOOKS[name]) return CHUNK_LOOKS[name];
      if (/^bless$/.test(name)) return "bless";
      if (/fog cloud/.test(name)) return "fog";
      if (/mage hand/.test(name)) return "hand";
      if (/^acid splash$/.test(name)) return "acid";
      if (/^cloudkill$/.test(name)) return "poison";
      if (/^inflict wounds$|^blight$/.test(name)) return "necrotic";
      if (/^moonbeam$|^spirit guardians$/.test(name)) return "radiant";
      /* Shatter is the wedge-plus-burst. Thunderous Smite and a bare thunder damage type stay on thunderPaint. */
      if (/^shatter$/.test(name)) return "shatter";
      /* Zones paint themselves. An empty look must not fall through to a fire beam. */
      if (/^grease$|^light$|^daylight$|^wall of fire$/.test(name)) return "";
      /* Attack spells whose only look was the damage-type pass. An empty dmg (hidden AC pending resolve) used to paint the purple ribbon. */
      if (/^fire bolt$/.test(name)) return "fire";
      if (/^ray of frost$/.test(name)) return "cold";
      if (/^shocking grasp$/.test(name)) return "lightning";
    }
    var dmg = low(spec.dmg || spec.dmgType || spec.damageType);
    if (/(^|[^a-z])fire([^a-z]|$)/.test(dmg)) return "fire";
    if (/(^|[^a-z])cold([^a-z]|$)/.test(dmg)) return "cold";
    if (/(^|[^a-z])(lightning|electric)([^a-z]|$)/.test(dmg)) return "lightning";
    if (/(^|[^a-z])force([^a-z]|$)/.test(dmg)) return "force";
    if (/(^|[^a-z])acid([^a-z]|$)/.test(dmg)) return "acid";
    if (/(^|[^a-z])poison([^a-z]|$)/.test(dmg)) return "poison";
    if (/(^|[^a-z])necrotic([^a-z]|$)/.test(dmg)) return "necrotic";
    if (/(^|[^a-z])radiant([^a-z]|$)/.test(dmg)) return "radiant";
    if (/(^|[^a-z])psychic([^a-z]|$)/.test(dmg)) return "psychic";
    if (/(^|[^a-z])thunder([^a-z]|$)/.test(dmg)) return "thunder";
    if (spec.type === "spell" || names.length) return "ribbon";
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
  /* Locked v5 types. Colours are spell-fx-palette.json. No new image files. */
function acidPaint(ctx, A, B, lt) {
  var T = LOOK_TIME.acid;
  if (!A || !B || lt < 0 || lt > T.grow + T.fade) return;
  var d = dirOf(A, B), nx = -d.y, ny = d.x;
  var g = easeOut(Math.min(1, lt / T.grow));
  var f = lt < T.grow ? 1 : 1 - clamp((lt - T.grow) / T.fade);
  var lob = Math.sin(Math.PI * g) * 14;
  var hx = lerp(A.x, B.x, g) + nx * lob, hy = lerp(A.y, B.y, g) + ny * lob;
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = rgba("30,40,10", 0.8 * f);
  ctx.beginPath(); ctx.arc(hx, hy, 15, 0, Math.PI * 2); ctx.fill();
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = rgba("125,180,40", 0.7 * f);
  ctx.beginPath(); ctx.arc(hx - 2, hy - 2, 11, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = rgba("225,235,150", 0.85 * f);
  ctx.beginPath(); ctx.arc(hx - 4, hy - 5, 4, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  if (lt > T.grow) bloom(ctx, B, 16, lt - T.grow, "175,210,55", "95,140,20", 2);
}
function poisonPaint(ctx, A, B, lt, seed) {
  var T = LOOK_TIME.poison;
  if (!A || !B || lt < 0 || lt > T.grow + T.fade) return;
  var g = easeOut(Math.min(1, lt / T.grow));
  var f = lt < T.grow ? 1 : 1 - clamp((lt - T.grow) / T.fade);
  var rand = rng(seed || 3);
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  for (var i = 0; i < 6; i++) {
    var u = Math.min(1, g * (0.45 + rand()));
    var x = lerp(A.x, B.x, u) + (rand() - 0.5) * 18;
    var y = lerp(A.y, B.y, u) + (rand() - 0.5) * 18;
    ctx.fillStyle = rgba(i % 2 ? "40,42,18" : "150,140,70", (i % 2 ? 0.35 : 0.28) * f);
    ctx.beginPath(); ctx.arc(x, y, 16 + rand() * 18, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
  if (lt > T.grow) bloom(ctx, B, 22, lt - T.grow, "190,185,80", "110,105,40", 2);
}
function necroticPaint(ctx, A, B, lt, seed) {
  var T = LOOK_TIME.necrotic;
  if (!A || !B || lt < 0 || lt > T.grow + T.hold + T.fade) return;
  var d = dirOf(A, B), nx = -d.y, ny = d.x;
  var g = easeOut(Math.min(1, lt / T.grow));
  var f = lt < T.grow + T.hold ? 1 : 1 - clamp((lt - T.grow - T.hold) / T.fade);
  var rand = rng(seed || 5);
  var pts = [A];
  for (var i = 1; i <= 8; i++) {
    var u = (i / 8) * g;
    var w = Math.sin(u * Math.PI * 2) * 10 + (rand() - 0.5) * 6;
    pts.push({ x: lerp(A.x, B.x, u) + nx * w, y: lerp(A.y, B.y, u) + ny * w });
  }
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  strokePath(ctx, pts, "6,3,8", 16, 0.85 * f);
  ctx.globalCompositeOperation = "lighter";
  strokePath(ctx, pts, "95,45,100", 8, 0.6 * f);
  strokePath(ctx, pts, "185,170,180", 2, 0.7 * f);
  ctx.restore();
  if (lt > T.grow) bloom(ctx, B, 14, lt - T.grow, "170,140,175", "90,40,100", 2);
}
function radiantPaint(ctx, A, B, lt) {
  var T = LOOK_TIME.radiant;
  if (!A || !B || lt < 0 || lt > T.grow + T.fade) return;
  var d = dirOf(A, B), nx = -d.y, ny = d.x;
  var g = easeOut(Math.min(1, lt / T.grow));
  var f = lt < T.grow ? 1 : 1 - clamp((lt - T.grow) / T.fade);
  var lob = Math.sin(Math.PI * g) * 26;
  var hx = lerp(A.x, B.x, g) + nx * lob, hy = lerp(A.y, B.y, g) + ny * lob;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = rgba("255,232,170", f);
  ctx.beginPath(); ctx.arc(hx, hy, 7, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = rgba("230,175,70", 0.55 * f);
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(hx, hy); ctx.stroke();
  if (lt > T.grow * 0.85) {
    var shaft = clamp((lt - T.grow * 0.85) / 180);
    ctx.fillStyle = rgba("255,250,230", 0.45 * f * shaft);
    ctx.fillRect(B.x - 10, B.y - 70 * shaft, 20, 70 * shaft);
  }
  ctx.restore();
  if (lt > T.grow) bloom(ctx, B, 16, lt - T.grow, "255,235,170", "225,170,70", 2);
}
function thunderPaint(ctx, A, B, lt, seed) {
  var T = LOOK_TIME.thunder;
  if (!A || !B || lt < 0 || lt > T.grow + T.hold + T.fade) return;
  var d = dirOf(A, B);
  var ang = Math.atan2(d.y, d.x);
  var f = lt < T.grow + T.hold ? 1 : 1 - clamp((lt - T.grow - T.hold) / T.fade);
  /* A self cube (Thunderwave) aims at the caster. A zero-length wedge reads as no effect. */
  var span = Math.hypot(B.x - A.x, B.y - A.y);
  if (span < 16) {
    var growR = easeOut(Math.min(1, lt / Math.max(1, T.grow)));
    var rad = 18 + 46 * growR;
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = rgba("95,80,60", 0.55 * f);
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(A.x, A.y, rad, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = rgba("235,215,170", 0.85 * f);
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(A.x, A.y, rad * 0.72, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    return;
  }
  var len = d.d * easeOut(Math.min(1, lt / T.grow));
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = rgba("95,80,60", 0.45 * f);
  ctx.beginPath();
  ctx.moveTo(A.x, A.y);
  ctx.lineTo(A.x + Math.cos(ang - 0.28) * len, A.y + Math.sin(ang - 0.28) * len);
  ctx.lineTo(A.x + Math.cos(ang + 0.28) * len, A.y + Math.sin(ang + 0.28) * len);
  ctx.closePath();
  ctx.fill();
  ctx.globalCompositeOperation = "lighter";
  ctx.strokeStyle = rgba("235,215,170", 0.7 * f);
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();
  if (lt > T.grow) {
    bloom(ctx, B, 18, lt - T.grow, "215,185,125", "150,120,80", 4);
    var rand = rng((seed || 9) + 1);
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    for (var i = 0; i < 8; i++) {
      var a = rand() * Math.PI * 2;
      var k = easeOut(clamp((lt - T.grow) / T.fade));
      ctx.fillStyle = rgba("120,100,75", 0.5 * (1 - k));
      ctx.beginPath();
      ctx.arc(B.x + Math.cos(a) * 28 * k, B.y + Math.sin(a) * 28 * k, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}
/* Love-it demo overlays (thunderwave-ui-demo / fireball-ui-demo) lived in the page
   after SSDNSMapFx.paint. These helpers are that spice, in the painter, scaled from
   the demo's 48px cell. Wall of Fire does not call them. */
function nz(x, s) {
  s = s || 0;
  return Math.sin(x + s * 1.7) * 0.5 + Math.sin(x * 2.31 + s * 3.1) * 0.3 + Math.sin(x * 4.77 + s * 0.9) * 0.2;
}
function loveScale(cell) { return (cell || 70) / 48; }
function softDisc(ctx, x, y, r, list, op) {
  if (!(r > 0.5)) return;
  ctx.save();
  ctx.globalCompositeOperation = op || "lighter";
  ctx.fillStyle = stops(grad(ctx, "r", x, y, 0, x, y, r), list) || "rgba(0,0,0,0)";
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
/* Porch Boom page thunderOver: churn inside the cube, concentric gold frames, grit, side blast. */
function loveThunderSpice(ctx, A, d, reach, lt, cell) {
  if (!A || !(reach > 4) || lt < 0) return;
  var sc = loveScale(cell);
  ctx.save();
  ctx.translate(A.x, A.y);
  ctx.rotate(Math.atan2(d.y, d.x));
  var x = 0, y = -reach / 2, w = reach, h = reach, cx = w / 2, cy = 0;
  var pf = 1 - clamp(lt / 260);
  var i;
  if (pf > 0) {
    softDisc(ctx, 0, 0, 46 * sc, [
      [0, "rgba(255,250,230," + pf + ")"],
      [0.3, "rgba(235,215,170," + (0.8 * pf) + ")"],
      [1, "rgba(200,170,110,0)"]
    ]);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = rgba("235,215,170", 0.8 * pf);
    ctx.lineWidth = 3 * sc;
    ctx.lineCap = "round";
    for (i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(30 * sc, i * 7 * sc);
      ctx.stroke();
    }
    ctx.restore();
  }
  var hold = 1 - clamp((lt - 700) / 1100);
  if (hold > 0) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    var dr = rng(808);
    for (i = 0; i < 110; i++) {
      var px = x + dr() * w + nz(lt * 0.003 + i, i) * 10 * sc + lt * 0.03 * dr() * sc;
      var py = y + dr() * h + nz(lt * 0.0025 + i * 1.3, i + 3) * 10 * sc;
      var light = dr() < 0.45;
      softDisc(ctx, px, py, (14 + dr() * 26) * sc, [
        [0, light ? "rgba(165,138,98," + (0.6 * hold) + ")" : "rgba(95,80,60," + (0.8 * hold) + ")"],
        [1, "rgba(95,80,60,0)"]
      ], "source-over");
    }
    var gr = rng(17);
    ctx.fillStyle = rgba("60,48,34", 0.8 * hold);
    for (i = 0; i < 160; i++) ctx.fillRect(x + gr() * w + lt * 0.02 * gr() * sc, y + gr() * h, 1.5 * sc, 1.5 * sc);
    for (i = 0; i < 4; i++) {
      var rt = (lt - i * 110) / 420;
      if (rt <= 0 || rt >= 1) continue;
      var s = lerp(0.1, 1.05, easeOut(rt)), a = (1 - rt) * 0.8;
      var rw = w * s, rh = h * s;
      var ox = lerp(x, cx - rw / 2, 0.35 + 0.65 * clamp(rt * 1.5));
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = rgba("235,215,170", a);
      ctx.lineWidth = 2.5 * sc;
      ctx.strokeRect(ox, cy - rh / 2, rw, rh);
      ctx.strokeStyle = rgba("200,170,110", a * 0.5);
      ctx.lineWidth = 8 * sc;
      ctx.strokeRect(ox, cy - rh / 2, rw, rh);
      ctx.globalCompositeOperation = "source-over";
    }
    ctx.restore();
  }
  var ek = lt - 100;
  if (ek > 0) {
    var ea = ek < 90 ? 1 : 1 - clamp((ek - 90) / 900);
    if (ea > 0) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.shadowColor = "rgba(215,185,125," + ea + ")";
      ctx.shadowBlur = 16 * sc;
      ctx.strokeStyle = rgba("215,185,125", 0.7 * ea);
      ctx.lineWidth = 7 * sc;
      ctx.strokeRect(x, y, w, h);
      ctx.strokeStyle = rgba("245,238,215", ea);
      ctx.lineWidth = 2 * sc;
      ctx.strokeRect(x, y, w, h);
      ctx.shadowBlur = 0;
      ctx.restore();
    }
    var cf = 1 - clamp(ek / 160);
    if (cf > 0) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = rgba("235,215,170", 0.35 * cf);
      ctx.fillRect(x, y, w, h);
      ctx.restore();
    }
  }
  if (lt > 100) {
    var pr = rng(2024);
    ctx.save();
    ctx.lineCap = "round";
    for (i = 0; i < 420; i++) {
      var sideN = Math.floor(pr() * 4), u = pr();
      var v = 0.15 + pr() * 0.45 * (sideN === 1 ? 1.5 : 1);
      var life = 700 + pr() * 900, stt = 100 + pr() * 140;
      var big = pr() < 0.45, spread = (pr() - 0.5) * 0.9;
      var k = (lt - stt) / life;
      if (k <= 0 || k >= 1) continue;
      var sx, sy, vx, vy;
      if (sideN === 0) { sx = x + u * w; sy = y; vx = spread; vy = -1; }
      else if (sideN === 1) { sx = x + w; sy = y + u * h; vx = 1; vy = spread; }
      else if (sideN === 2) { sx = x + u * w; sy = y + h; vx = spread; vy = 1; }
      else { sx = x; sy = y + u * h; vx = -1; vy = spread; }
      var nlen = Math.hypot(vx, vy) || 1;
      vx /= nlen; vy /= nlen;
      var dist = v * life * (1 - Math.pow(1 - k, 2.2)) * 0.55 * sc;
      var qx = sx + vx * dist, qy = sy + vy * dist;
      var al = (1 - k) * (big ? 0.55 : 0.6);
      var tail = (big ? 26 : 14) * (1 - k * 0.6) * sc;
      if (big) {
        softDisc(ctx, qx, qy, (12 + k * 34) * sc, [
          [0, "rgba(140,115,82," + al + ")"],
          [1, "rgba(150,125,90,0)"]
        ], "source-over");
      } else {
        ctx.strokeStyle = pr() < 0.5 ? "rgba(200,175,130," + al + ")" : rgba("95,80,60", al);
        ctx.lineWidth = (1.2 + pr() * 1.8) * sc;
        ctx.beginPath();
        ctx.moveTo(qx - vx * tail, qy - vy * tail);
        ctx.lineTo(qx, qy);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
  ctx.restore();
}
/* Fireball page fireballOver: churning lobes, ragged ring, ember field. No caster-to-target beam. */
function loveFireballSpice(ctx, B, R, lt, cell) {
  if (!B || !(R > 4) || lt < 0) return;
  var sc = loveScale(cell);
  var x = B.x, y = B.y;
  var sr = rng(311);
  var i;
  for (i = 0; i < 34; i++) {
    var an = sr() * Math.PI * 2, stt = 220 + sr() * 500, life = 2400 + sr() * 1400, sz = R * (0.22 + sr() * 0.2);
    var k = (lt - stt) / life;
    if (k <= 0 || k >= 1) { sr(); continue; }
    var d = R * (0.55 + sr() * 0.4) + easeOut(k) * R * 0.45;
    var px = x + Math.cos(an) * d + nz(lt * 0.0006 + i, i) * 8 * sc;
    var py = y + Math.sin(an) * d - k * 18 * sc;
    var a = Math.sin(Math.PI * Math.min(1, k * 1.6)) * 0.62 * (1 - k * 0.6);
    softDisc(ctx, px, py, sz * (0.8 + k * 0.9), [
      [0, "rgba(18,15,12," + (a * 1.2) + ")"],
      [0.6, "rgba(28,23,18," + (a * 0.75) + ")"],
      [1, "rgba(30,25,20,0)"]
    ], "source-over");
  }
  var ia = clamp((lt - 800) / 500) * (1 - clamp((lt - 2600) / 1500));
  if (ia > 0) {
    for (i = 0; i < 9; i++) {
      var iaA = i / 9 * Math.PI * 2 + lt * 0.0002;
      softDisc(ctx, x + Math.cos(iaA) * R * 0.3, y + Math.sin(iaA) * R * 0.3, R * 0.45, [
        [0, "rgba(18,14,12," + (0.5 * ia) + ")"],
        [1, "rgba(18,14,12,0)"]
      ], "source-over");
    }
  }
  var fl = 1 - clamp(lt / 220);
  if (fl > 0) {
    softDisc(ctx, x, y, R * 1.6, [
      [0, "rgba(255,245,220," + (0.4 * fl) + ")"],
      [0.35, "rgba(255,125,35," + (0.3 * fl) + ")"],
      [1, "rgba(200,60,15,0)"]
    ]);
    softDisc(ctx, x, y, lerp(14 * sc, R * 0.55, easeOut(lt / 180)), [
      [0, "rgba(255,255,255," + fl + ")"],
      [0.5, "rgba(255,225,160," + (0.9 * fl) + ")"],
      [1, "rgba(255,125,35,0)"]
    ]);
  }
  var grow = easeOut(lt / 380), fade = 1 - clamp((lt - 750) / 650);
  if (fade > 0) {
    var s = R * 0.88 * grow;
    softDisc(ctx, x, y, s * 1.15, [
      [0, "rgba(255,225,160," + (0.3 * fade) + ")"],
      [0.45, "rgba(255,125,35," + (0.3 * fade) + ")"],
      [0.8, "rgba(200,60,15," + (0.25 * fade) + ")"],
      [1, "rgba(200,60,15,0)"]
    ]);
    var br = rng(19);
    for (i = 0; i < 46; i++) {
      var a0 = br() * Math.PI * 2, d0 = Math.sqrt(br()), rr = 0.22 + br() * 0.28, sp = (br() - 0.5) * 0.004, ph = br() * 10;
      var ang = a0 + lt * sp, dist = d0 * s * 0.78 + nz(lt * 0.004 + ph, i) * s * 0.06;
      var bx = x + Math.cos(ang) * dist, by = y + Math.sin(ang) * dist;
      var rad = rr * s * (0.85 + 0.25 * Math.sin(lt * 0.011 + ph));
      var hotness = 1 - d0 * 0.7, flick = 0.75 + 0.25 * Math.sin(lt * 0.02 + ph * 3);
      if (br() < 0.4 && lt > 200) {
        softDisc(ctx, bx, by, rad * 0.8, [
          [0, "rgba(45,14,3," + (0.6 * fade) + ")"],
          [1, "rgba(40,14,4,0)"]
        ], "source-over");
        continue;
      }
      softDisc(ctx, bx, by, rad, [
        [0, "rgba(" + (hotness > 0.75 ? "255,225,160" : "255,140,45") + "," + (0.36 * fade * flick) + ")"],
        [0.5, "rgba(255,125,35," + (0.24 * fade * flick) + ")"],
        [1, "rgba(200,60,15,0)"]
      ]);
    }
    var coreA = (1 - clamp((lt - 120) / 420)) * fade;
    softDisc(ctx, x, y, s * 0.38, [
      [0, "rgba(255,252,235," + (0.9 * coreA) + ")"],
      [0.5, "rgba(255,225,160," + (0.7 * coreA) + ")"],
      [1, "rgba(255,125,35,0)"]
    ]);
  }
  var rk = (lt - 60) / 520;
  if (rk > 0 && rk < 1.8) {
    var rr = lerp(R * 0.35, R, easeOut(Math.min(1, rk)));
    var ra = rk < 1 ? 1 : 1 - (rk - 1) / 0.8;
    var rw = lerp(30, 12, clamp(rk)) * sc;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = stops(grad(ctx, "r", x, y, Math.max(0, rr - rw), x, y, rr + rw * 0.6), [
      [0, "rgba(255,125,35,0)"],
      [0.55, "rgba(255,225,160," + (0.6 * ra) + ")"],
      [0.75, "rgba(255,125,35," + (0.5 * ra) + ")"],
      [1, "rgba(200,60,15,0)"]
    ]) || rgba("255,140,45", 0.4 * ra);
    ctx.beginPath();
    ctx.arc(x, y, rr + rw, 0, Math.PI * 2);
    ctx.fill();
    var lr = rng(91);
    ctx.lineCap = "round";
    for (i = 0; i < 70; i++) {
      var lan = i / 70 * Math.PI * 2 + lr() * 0.08;
      var len = (6 + lr() * 18) * (0.6 + 0.4 * Math.sin(lt * 0.03 + i)) * sc;
      ctx.strokeStyle = lr() < 0.3 ? "rgba(255,225,160," + (0.28 * ra) + ")" : "rgba(255,140,45," + (0.28 * ra) + ")";
      ctx.lineWidth = (2 + lr() * 4) * sc;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(lan) * (rr - 6 * sc), y + Math.sin(lan) * (rr - 6 * sc));
      ctx.lineTo(x + Math.cos(lan) * (rr + len), y + Math.sin(lan) * (rr + len));
      ctx.stroke();
    }
    ctx.restore();
  }
  var er = rng(4242);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";
  for (i = 0; i < 150; i++) {
    var ean = er() * Math.PI * 2, ev = 0.35 + er() * 0.75, elife = 600 + er() * 1100, est = 40 + er() * 220, ew = 1 + er() * 1.4;
    var ek = (lt - est) / elife;
    if (ek <= 0 || ek >= 1) continue;
    var edist = R * 0.25 + ev * elife * (1 - Math.pow(1 - ek, 2)) * 0.5 * sc;
    var ex = x + Math.cos(ean) * edist, ey = y + Math.sin(ean) * edist + ek * ek * 10 * sc;
    var etail = (3 + 11 * (1 - ek)) * sc;
    ctx.strokeStyle = "rgba(" + (ek < 0.3 ? "255,225,160" : "255,125,35") + "," + (1 - ek) + ")";
    ctx.lineWidth = ew * sc;
    ctx.beginPath();
    ctx.moveTo(ex - Math.cos(ean) * etail, ey - Math.sin(ean) * etail);
    ctx.lineTo(ex, ey);
    ctx.stroke();
  }
  ctx.restore();
  var hg = clamp((lt - 300) / 300) * (1 - clamp((lt - 1200) / 1600));
  if (hg > 0) {
    softDisc(ctx, x, y, R, [
      [0, "rgba(200,60,15," + (0.35 * hg) + ")"],
      [1, "rgba(200,60,15,0)"]
    ]);
  }
  if (lt > 900) {
    var scorch = clamp((lt - 900) / 400) * (1 - clamp((lt - 2200) / 800));
    if (scorch > 0) {
      softDisc(ctx, x, y, R * 1.05, [
        [0, "rgba(12,7,4," + (0.55 * scorch) + ")"],
        [0.55, "rgba(22,12,6," + (0.4 * scorch) + ")"],
        [1, "rgba(30,16,8,0)"]
      ], "source-over");
    }
  }
}
function blastShake(lt, amp, dur) {
  if (!(lt >= 0) || lt > dur || !(amp > 0)) return { x: 0, y: 0 };
  var k = Math.pow(1 - lt / dur, 1.35);
  var mag = amp * k;
  return {
    x: Math.sin(lt * 0.117) * mag + Math.sin(lt * 0.041) * mag * 0.4,
    y: Math.cos(lt * 0.139) * mag * 0.86 + Math.sin(lt * 0.057) * mag * 0.28
  };
}
function shakeOf(spec, lt) {
  var look = lookOf(spec || {});
  if (C1_LOOKS[look]) {
    if (look === "witch-bolt" && spec && spec.pulse) return { x: 0, y: 0 };
    return Chunk1Fx.shakeOf(look, lt);
  }
  if (look === "thundercube") return blastShake(lt, 8, 760);
  if (look === "fireball") return blastShake(lt - LOOK_TIME.fireball.grow, 11, 1000);
  if (look === "firecone") return blastShake(lt, 4, 420);
  if (look === "shatter") return blastShake(lt - LOOK_TIME.shatter.grow, 7, 650);
  return { x: 0, y: 0 };
}
/* Comet from the caster. A short bright tail, not a Fire Bolt line across the whole range. */
function fireballComet(ctx, A, B, lt, travel, cell) {
  var u = easeInOut(lt / Math.max(1, travel));
  var sc = loveScale(cell);
  var i;
  for (i = 8; i >= 1; i--) {
    var uu = clamp(u - i * 0.03);
    softDisc(ctx, lerp(A.x, B.x, uu), lerp(A.y, B.y, uu), Math.max(2.5, (11 - i) * 0.9 * sc), [
      [0, "rgba(255,225,160," + (0.45 * (1 - i / 9)) + ")"],
      [0.5, "rgba(255,120,30," + (0.28 * (1 - i / 9)) + ")"],
      [1, "rgba(200,60,15,0)"]
    ]);
  }
  var hx = lerp(A.x, B.x, u), hy = lerp(A.y, B.y, u);
  var tx = lerp(A.x, B.x, Math.max(0, u - 0.28)), ty = lerp(A.y, B.y, Math.max(0, u - 0.28));
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(255,140,40,0.95)";
  ctx.lineWidth = 7 * sc;
  ctx.beginPath();
  ctx.moveTo(tx, ty);
  ctx.lineTo(hx, hy);
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,248,220,0.95)";
  ctx.lineWidth = 1.8 * sc;
  ctx.beginPath();
  ctx.moveTo(lerp(tx, hx, 0.4), lerp(ty, hy, 0.4));
  ctx.lineTo(hx, hy);
  ctx.stroke();
  ctx.restore();
  softDisc(ctx, hx, hy, 16 * sc, [
    [0, "rgba(255,252,236,1)"],
    [0.4, "rgba(255,210,120,0.85)"],
    [1, "rgba(255,100,20,0)"]
  ]);
  var fl = 1 - clamp(lt / 110);
  if (fl > 0) {
    softDisc(ctx, A.x, A.y, 22 * sc, [
      [0, "rgba(255,225,160," + (0.75 * fl) + ")"],
      [1, "rgba(200,60,15,0)"]
    ]);
  }
}
/* Powder-keg sphere at the chosen point, after the comet arrives. Not a Fire Bolt beam.
   Palette: glow 200,60,15 · core 255,125,35 · hot 255,225,160 · burst 255,140,45. */
function fireballPaint(ctx, A, B, lt, seed, g) {
  var time = LOOK_TIME.fireball;
  var life = time.grow + time.hold + time.fade;
  if (!B || lt < 0 || lt > life) return;
  var cell = (g && g.cell) || 70;
  var radius = cell * 4;
  var flight = time.grow;
  var span = A ? Math.hypot(B.x - A.x, B.y - A.y) : 0;
  var travels = !!(A && span > Math.max(28, cell * 0.5));
  if (travels && lt < flight) {
    fireballComet(ctx, A, B, lt, flight, cell);
    return;
  }
  var boom = travels ? lt - flight : lt;
  var fadeAt = time.grow + time.hold;
  var f = lt < fadeAt ? 1 : 1 - clamp((lt - fadeAt) / time.fade);
  var expand = easeOut(Math.min(1, boom / 180));
  var R = radius * (0.22 + 0.78 * expand);
  var core = boom < 200 ? 1 : f;
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = rgba("180,48,12", 0.72 * f);
  ctx.beginPath();
  ctx.arc(B.x, B.y, R, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  var coreR = Math.max(10, cell * (0.45 + 0.85 * Math.min(1, boom / 140)));
  ctx.fillStyle = stops(grad(ctx, "r", B.x, B.y, 0, B.x, B.y, coreR), [
    [0, "rgba(255,252,236," + 0.98 * core + ")"],
    [0.35, "rgba(255,230,170," + 0.85 * core + ")"],
    [1, "rgba(255,140,40,0)"]
  ]) || rgba("255,236,190", 0.9 * core);
  ctx.beginPath();
  ctx.arc(B.x, B.y, coreR, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = stops(grad(ctx, "r", B.x, B.y, coreR * 0.2, B.x, B.y, R), [
    [0, "rgba(255,160,50," + 0.72 * f + ")"],
    [0.55, "rgba(220,70,16," + 0.55 * f + ")"],
    [1, "rgba(160,30,8,0)"]
  ]) || rgba("255,125,35", 0.62 * f);
  ctx.beginPath();
  ctx.arc(B.x, B.y, R, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = rgba("255,236,190", 0.95 * f);
  ctx.lineWidth = 4 + 8 * (1 - expand);
  ctx.beginPath();
  ctx.arc(B.x, B.y, R, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  loveFireballSpice(ctx, B, radius, boom, cell);
}
/* Canyon thunderclap in a box. A 15-ft cube off the caster's palm, not a cone.
   Palette: glow 200,170,110 · core 235,215,170 · dust 95,80,60 · edge 215,185,125 / 150,120,80. */
function thunderCubePaint(ctx, A, B, lt, seed, g, spec) {
  var time = LOOK_TIME.thundercube;
  var life = time.grow + time.hold + time.fade;
  if (!A || lt < 0 || lt > life) return;
  var cell = (g && g.cell) || 70;
  var side = cell * 3;
  var span = B ? Math.hypot(B.x - A.x, B.y - A.y) : 0;
  var face = spec && isFinite(Number(spec.facing)) ? Number(spec.facing) : null;
  /* A short stub is only a direction hint. A missing stub must still use the aimed facing,
     or the square jumps to screen +x and the old wedge is what people remember. */
  var d = span > Math.max(12, cell * 0.35) ? dirOf(A, B)
    : (face != null ? { x: Math.cos(face), y: Math.sin(face), d: 1 } : { x: 1, y: 0, d: 1 });
  var nx = -d.y, ny = d.x;
  var f = lt < time.grow + time.hold ? 1 : 1 - clamp((lt - time.grow - time.hold) / time.fade);
  var grow = easeOut(Math.min(1, lt / Math.max(1, time.grow)));
  var reach = side * grow;
  var half = reach / 2;
  function corner(fwd, lat) {
    return { x: A.x + d.x * fwd + nx * lat, y: A.y + d.y * fwd + ny * lat };
  }
  function square(fwd, lat) {
    return [corner(0, -lat), corner(fwd, -lat), corner(fwd, lat), corner(0, lat)];
  }
  var box = square(reach, half);
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = rgba("95,80,60", 0.46 * f * Math.max(grow, 0.15));
  poly(ctx, box);
  ctx.closePath();
  ctx.fill();
  var rip;
  for (rip = 0; rip < 3; rip++) {
    var u = clamp(grow - rip * 0.22);
    if (u <= 0) continue;
    ctx.strokeStyle = rgba("215,185,125", (0.55 - rip * 0.12) * f);
    ctx.lineWidth = 2;
    poly(ctx, square(side * u, (side * u) / 2));
    ctx.closePath();
    ctx.stroke();
  }
  ctx.restore();
  var flash = lt < 120 ? 1 - lt / 120 : 0;
  if (flash > 0) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = rgba("255,220,150", 0.95 * flash);
    ctx.beginPath();
    ctx.arc(A.x, A.y, cell * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = rgba("255,252,240", flash);
    ctx.beginPath();
    ctx.arc(A.x, A.y, cell * 0.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  if (lt > time.grow * 0.8) {
    var edge = lt < time.grow + 100 ? 1 : f * 0.7;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = rgba("150,120,80", 0.85 * edge);
    ctx.lineWidth = 6;
    poly(ctx, box);
    ctx.closePath();
    ctx.stroke();
    ctx.strokeStyle = rgba("215,185,125", 0.95 * edge);
    ctx.lineWidth = 2.4;
    ctx.stroke();
    ctx.restore();
  }
  if (lt > time.grow) {
    var k = easeOut(clamp((lt - time.grow) / time.fade));
    var rand = rng((seed || 5) + 8);
    var dirs = [{ x: d.x, y: d.y }, { x: -d.x, y: -d.y }, { x: nx, y: ny }, { x: -nx, y: -ny }];
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    var s, p;
    for (s = 0; s < dirs.length; s++) {
      for (p = 0; p < 4; p++) {
        var along = (p / 3 - 0.5) * side * grow;
        var ox, oy;
        if (s === 0) { ox = A.x + d.x * reach + nx * along; oy = A.y + d.y * reach + ny * along; }
        else if (s === 1) { ox = A.x + nx * along; oy = A.y + ny * along; }
        else {
          ox = A.x + d.x * (reach * 0.5) + (s === 2 ? nx : -nx) * half;
          oy = A.y + d.y * (reach * 0.5) + (s === 2 ? ny : -ny) * half;
        }
        var blow = (16 + rand() * 26) * k;
        ctx.fillStyle = rgba(p % 2 ? "120,100,75" : "95,80,60", 0.55 * (1 - k));
        ctx.beginPath();
        ctx.arc(ox + dirs[s].x * blow, oy + dirs[s].y * blow, 3 + rand() * 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }
  /* Gold shock under the Love-it grit, so the cube stays a filled tan square. */
  var hot = lt < 260 ? 1 - lt / 420 : f * 0.2;
  if (hot > 0.04 && grow > 0.05) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = rgba("255,206,110", 0.7 * hot);
    poly(ctx, box);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = rgba("255,246,214", 0.55 * hot);
    poly(ctx, square(reach * 0.62, half * 0.62));
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = rgba("255,250,236", 0.92 * hot);
    ctx.lineWidth = 3;
    poly(ctx, box);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }
  loveThunderSpice(ctx, A, d, reach, lt, cell);
  /* Lift the cube back toward the Love-it gold after the dirt churn, without erasing the grit. */
  if (hot > 0.04 && grow > 0.05) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = rgba("255,214,140", 0.42 * hot);
    poly(ctx, box);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}
/* Burning Hands and Shatter. Painted here, not as a page overlay.
   aimDir matches the Porch Boom cube: a real aim point wins, otherwise spec.facing. */
function aimDir(A, B, spec, cell) {
  var span = B && A ? Math.hypot(B.x - A.x, B.y - A.y) : 0;
  var face = spec && isFinite(Number(spec.facing)) ? Number(spec.facing) : null;
  if (span > Math.max(12, cell * 0.35)) return dirOf(A, B);
  if (face != null) return { x: Math.cos(face), y: Math.sin(face), d: 1 };
  return { x: 1, y: 0, d: 1 };
}
function sectorPath(ctx, A, ang, half, len) {
  ctx.beginPath();
  ctx.moveTo(A.x, A.y);
  ctx.lineTo(A.x + Math.cos(ang - half) * len, A.y + Math.sin(ang - half) * len);
  ctx.lineTo(A.x + Math.cos(ang + half) * len, A.y + Math.sin(ang + half) * len);
  ctx.closePath();
}
/* Burning Hands. Palette: hot 255,225,160 · core 255,125,35 · burst 255,140,45 · glow 200,60,15 (locked fire). */
function fireConePaint(ctx, A, B, lt, seed, g, spec) {
  var time = LOOK_TIME.firecone;
  var life = time.grow + time.hold + time.fade;
  if (!A || lt < 0 || lt > life) return;
  var cell = (g && g.cell) || 70, sc = loveScale(cell);
  var d = aimDir(A, B, spec, cell);
  var ang = Math.atan2(d.y, d.x), half = Math.atan(0.5);   /* 5e cone: width = distance */
  var L = cell * 3;                                          /* 15 ft */
  var grow = easeOut(Math.min(1, lt / time.grow));
  var reach = L * grow;
  var end = time.grow + time.hold;
  var f = lt < end ? 1 : 1 - clamp((lt - end) / time.fade);
  var i, k;
  /* scorch first, under the flame (source-over) */
  var sa = clamp((lt - 120) / 260) * (1 - clamp((lt - end - 200) / (time.fade - 200)));
  if (sa > 0) {
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = stops(grad(ctx, "r", A.x, A.y, 0, A.x, A.y, L * 1.02), [
      [0, "rgba(14,8,4," + (0.5 * sa) + ")"], [0.7, "rgba(22,12,6," + (0.34 * sa) + ")"], [1, "rgba(30,16,8,0)"]
    ]) || rgba("20,10,5", 0.3 * sa);
    sectorPath(ctx, A, ang, half, L * 1.02);
    ctx.fill();
    ctx.restore();
  }
  /* palm flash */
  var pf = 1 - clamp(lt / 200);
  if (pf > 0) {
    softDisc(ctx, A.x, A.y, 40 * sc, [[0, "rgba(255,250,230," + pf + ")"], [0.35, "rgba(255,190,90," + (0.8 * pf) + ")"], [1, "rgba(255,125,35,0)"]]);
  }
  /* cone body: hot at the palm, deep red at the far edge, advancing front */
  if (reach > 2 && f > 0) {
    var flick = 0.85 + 0.15 * Math.sin(lt * 0.031);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = stops(grad(ctx, "r", A.x, A.y, 0, A.x, A.y, reach * 1.04), [
      [0, "rgba(255,248,220," + (0.7 * f) + ")"],
      [0.22, "rgba(255,200,110," + (0.5 * f * flick) + ")"],
      [0.62, "rgba(255,125,35," + (0.48 * f * flick) + ")"],
      [0.92, "rgba(200,60,15," + (0.34 * f) + ")"],
      [1, "rgba(200,60,15,0)"]
    ]) || rgba("255,140,45", 0.5 * f);
    sectorPath(ctx, A, ang, half, reach * 1.04);
    ctx.fill();
    ctx.restore();
  }
  /* streaming flame lobes inside the cone, clipped so the shape stays a clean cone */
  ctx.save();
  sectorPath(ctx, A, ang, half * 1.12, L * 1.12);
  ctx.clip();
  ctx.globalCompositeOperation = "lighter";
  var fr = rng(1301);
  for (i = 0; i < 90; i++) {
    var born = fr() * (time.grow + time.hold * 0.9);
    var plife = 300 + fr() * 380;
    var off = (fr() * 2 - 1) * 0.95;
    var vel = 0.75 + fr() * 0.5;
    var ph = fr() * 10;
    k = (lt - born) / plife;
    if (k <= 0 || k >= 1) continue;
    var dist = L * clamp(k * vel * 1.05, 0, 1.08);
    var a = ang + off * half + nz(lt * 0.006 + ph, i) * 0.08;
    var px = A.x + Math.cos(a) * dist, py = A.y + Math.sin(a) * dist;
    var u = dist / L;
    var rad = (7 + 20 * u) * sc * (0.8 + 0.4 * fr());
    var alpha = Math.sin(Math.PI * k) * 0.55 * f;
    var col = u < 0.3 ? "255,232,175" : (u < 0.7 ? "255,150,50" : "220,80,20");
    softDisc(ctx, px, py, rad, [[0, "rgba(" + col + "," + alpha + ")"], [0.55, "rgba(255,110,28," + (alpha * 0.45) + ")"], [1, "rgba(200,60,15,0)"]]);
  }
  ctx.restore();
  /* hot side edges + ragged flame front so the cone reads at a glance */
  if (reach > 2 && f > 0) {
    var ea = f * (lt < time.grow ? 1 : 0.75);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    ctx.strokeStyle = rgba("255,200,120", 0.75 * ea);
    ctx.lineWidth = 2 * sc;
    ctx.beginPath();
    ctx.moveTo(A.x + Math.cos(ang - half) * reach, A.y + Math.sin(ang - half) * reach);
    ctx.lineTo(A.x, A.y);
    ctx.lineTo(A.x + Math.cos(ang + half) * reach, A.y + Math.sin(ang + half) * reach);
    ctx.stroke();
    ctx.restore();
    /* soft flame tongues rolling off the front (bowed, not a comb) */
    var lr = rng(77 + (seed || 0));
    var n = 14;
    for (i = 0; i <= n; i++) {
      var t = i / n;
      var la = ang - half * 0.92 + t * half * 1.84;
      var bow = 1 - 0.1 * Math.pow(2 * t - 1, 2);
      var lick = (6 + lr() * 12) * sc * (0.6 + 0.4 * Math.sin(lt * 0.03 + i * 1.7));
      var fd = reach * bow / Math.cos(la - ang) * 0.97 + lick;
      var tx = A.x + Math.cos(la) * fd, ty = A.y + Math.sin(la) * fd;
      softDisc(ctx, tx, ty, (12 + lr() * 9) * sc, [[0, rgba("255,190,90", 0.5 * ea)], [0.5, rgba("255,110,28", 0.32 * ea)], [1, "rgba(200,60,15,0)"]]);
    }
  }
  /* sparks thrown past the cone */
  var er = rng(4711);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";
  for (i = 0; i < 45; i++) {
    var est = 40 + er() * (time.grow + time.hold * 0.8), elife = 380 + er() * 600;
    var ean = ang + (er() * 2 - 1) * half * 1.05, ev = 0.55 + er() * 0.6;
    k = (lt - est) / elife;
    if (k <= 0 || k >= 1) continue;
    var ed = L * (0.25 + ev * (1 - Math.pow(1 - k, 2)) * 1.05);
    var ex = A.x + Math.cos(ean) * ed, ey = A.y + Math.sin(ean) * ed - k * k * 8 * sc;
    var tl = (4 + 10 * (1 - k)) * sc;
    ctx.strokeStyle = "rgba(" + (k < 0.35 ? "255,225,160" : "255,125,35") + "," + (1 - k) + ")";
    ctx.lineWidth = (1 + er() * 1.2) * sc;
    ctx.beginPath();
    ctx.moveTo(ex - Math.cos(ean) * tl, ey - Math.sin(ean) * tl);
    ctx.lineTo(ex, ey);
    ctx.stroke();
  }
  ctx.restore();
  /* smoke curling off the far end once the blast burns out */
  var sr = rng(919);
  for (i = 0; i < 16; i++) {
    var sst = time.grow + 120 + sr() * 400, slife = 900 + sr() * 600;
    var su = 0.55 + sr() * 0.5, soff = (sr() * 2 - 1) * 0.85;
    k = (lt - sst) / slife;
    if (k <= 0 || k >= 1) { continue; }
    var sd = L * su, sang = ang + soff * half;
    var sx = A.x + Math.cos(sang) * sd + nz(lt * 0.001 + i, i) * 6 * sc, sy = A.y + Math.sin(sang) * sd - k * 22 * sc;
    var smA = Math.sin(Math.PI * k) * 0.42;
    softDisc(ctx, sx, sy, (12 + k * 22) * sc, [[0, "rgba(24,19,15," + smA + ")"], [1, "rgba(28,22,18,0)"]], "source-over");
  }
}
/* Shatter. Thunder wedge to the point, then a 10-ft burst. Palette: thunder core 235,215,170 · glow 200,170,110 ·
   dust 95,80,60, plus glass 200,225,250 / 245,250,255 so it never reads as the tan Porch Boom cube. */
function shatterPaint(ctx, A, B, lt, seed, g) {
  var time = LOOK_TIME.shatter;
  var life = time.grow + time.hold + time.fade;
  if (!A || !B || lt < 0 || lt > life) return;
  var cell = (g && g.cell) || 70, sc = loveScale(cell);
  var d = dirOf(A, B);
  if (d.d < 16) { thunderPaint(ctx, A, B, lt, seed); return; }
  var ang = Math.atan2(d.y, d.x), half = 0.28, len = d.d;
  var R = cell * 2;                                    /* 10-ft radius at the point */
  var grow = easeOut(Math.min(1, lt / time.grow));
  var end = time.grow + time.hold;
  var f = lt < end ? 1 : 1 - clamp((lt - end) / time.fade);
  var bt = lt - time.grow;                             /* time since the wave reached the point */
  var i, k;
  /* wedge body: dust-brown fill growing from the caster with a pale rim */
  var wf = f * (1 - clamp((lt - end) / 500));
  if (wf > 0) {
    var reach = len * grow;
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = stops(grad(ctx, "l", A.x, A.y, A.x + d.x * len, A.y + d.y * len), [
      [0, "rgba(95,80,60," + (0.18 * wf) + ")"], [1, "rgba(95,80,60," + (0.5 * wf) + ")"]
    ]) || rgba("95,80,60", 0.4 * wf);
    sectorPath(ctx, A, ang, half, reach);
    ctx.fill();
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = rgba("235,215,170", 0.75 * wf);
    ctx.lineWidth = 2.2 * sc;
    ctx.stroke();
    ctx.restore();
    /* pressure arcs rolling down the wedge (thunder rhythm: three claps) */
    ctx.save();
    sectorPath(ctx, A, ang, half, len * 1.02);
    ctx.clip();
    ctx.globalCompositeOperation = "lighter";
    for (i = 0; i < 5; i++) {
      var at = (lt - i * 70) / 260;
      if (at <= 0 || at >= 1.15) continue;
      var rr = len * easeOut(Math.min(1, at));
      var aa = (at < 1 ? 1 : 1 - (at - 1) / 0.15) * 0.85 * wf;
      ctx.strokeStyle = rgba("245,238,215", aa);
      ctx.lineWidth = 2.5 * sc;
      ctx.beginPath();
      ctx.arc(A.x, A.y, rr, ang - half * 1.1, ang + half * 1.1);
      ctx.stroke();
      ctx.strokeStyle = rgba("200,170,110", aa * 0.5);
      ctx.lineWidth = 9 * sc;
      ctx.stroke();
    }
    ctx.restore();
  }
  /* caster clap */
  var pf = 1 - clamp(lt / 220);
  if (pf > 0) softDisc(ctx, A.x, A.y, 34 * sc, [[0, "rgba(255,250,235," + pf + ")"], [0.35, "rgba(235,215,170," + (0.7 * pf) + ")"], [1, "rgba(200,170,110,0)"]]);
  if (bt < 0) return;
  /* ground cracks radiating from the point (source-over, linger) */
  var ca = clamp(bt / 120) * f;
  if (ca > 0) {
    var cr = rng(5150 + (seed || 0));
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (i = 0; i < 9; i++) {
      var ca0 = (i / 9) * Math.PI * 2 + cr() * 0.5;
      var clen = R * (0.55 + cr() * 0.5) * easeOut(clamp(bt / 160));
      var cx = B.x, cy = B.y, seg;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      for (seg = 1; seg <= 4; seg++) {
        var sa = ca0 + (cr() - 0.5) * 0.7;
        cx += Math.cos(sa) * clen / 4; cy += Math.sin(sa) * clen / 4;
        ctx.lineTo(cx, cy);
      }
      ctx.strokeStyle = rgba("22,17,12", 0.85 * ca);
      ctx.lineWidth = 3.4 * sc;
      ctx.stroke();
      ctx.strokeStyle = rgba("235,215,170", 0.35 * ca);
      ctx.lineWidth = 0.9 * sc;
      ctx.stroke();
    }
    ctx.restore();
  }
  /* white clap flash + gold core */
  var fl = 1 - clamp(bt / 240);
  if (fl > 0) {
    softDisc(ctx, B.x, B.y, R * 1.25, [[0, "rgba(255,252,240," + (0.55 * fl) + ")"], [0.4, "rgba(235,215,170," + (0.35 * fl) + ")"], [1, "rgba(200,170,110,0)"]]);
    softDisc(ctx, B.x, B.y, lerp(10 * sc, R * 0.5, easeOut(bt / 160)), [[0, "rgba(255,255,255," + fl + ")"], [0.6, "rgba(220,235,250," + (0.7 * fl) + ")"], [1, "rgba(200,225,250,0)"]]);
  }
  /* concussion shade so the pale rings read on a bright floor */
  var cs = clamp(bt / 100) * f;
  if (cs > 0) softDisc(ctx, B.x, B.y, R * 1.08, [[0, "rgba(40,32,24," + (0.35 * cs) + ")"], [0.8, "rgba(40,32,24," + (0.22 * cs) + ")"], [1, "rgba(40,32,24,0)"]], "source-over");
  /* 10-ft burst body: tan dust disc that blows out and settles */
  var dk = clamp(bt / (time.hold + time.fade));
  var dA = (1 - dk) * clamp(bt / 80);
  if (dA > 0) {
    var dr = rng(808);
    for (i = 0; i < 56; i++) {
      var dan = dr() * Math.PI * 2, dd = Math.sqrt(dr()) * R * (0.4 + 0.65 * easeOut(bt / 300));
      var light = dr() < 0.45;
      softDisc(ctx, B.x + Math.cos(dan) * dd + nz(lt * 0.002 + i, i) * 6 * sc, B.y + Math.sin(dan) * dd + nz(lt * 0.0025 + i, i + 2) * 6 * sc,
        (12 + dr() * 20) * sc, [[0, light ? "rgba(165,138,98," + (0.6 * dA) + ")" : "rgba(95,80,60," + (0.75 * dA) + ")"], [1, "rgba(95,80,60,0)"]], "source-over");
    }
  }
  /* concentric shock rings to the 10-ft edge */
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (i = 0; i < 3; i++) {
    var rk = (bt - i * 120) / 480;
    if (rk <= 0 || rk >= 1) continue;
    var rr2 = R * lerp(0.15, 1.05, easeOut(rk)), ra = (1 - rk);
    ctx.strokeStyle = rgba("245,238,215", 0.9 * ra);
    ctx.lineWidth = (3.2 - i * 0.6) * sc;
    ctx.beginPath(); ctx.arc(B.x, B.y, rr2, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = rgba(i === 1 ? "200,225,250" : "200,170,110", 0.45 * ra);
    ctx.lineWidth = 10 * sc;
    ctx.stroke();
  }
  /* hard 10-ft edge holds through the hold so the area reads */
  var edge = bt < 90 ? bt / 90 : f * (1 - clamp((bt - time.hold) / 700));
  if (edge > 0) {
    ctx.strokeStyle = rgba("215,185,125", 0.7 * edge);
    ctx.lineWidth = 5 * sc;
    ctx.beginPath(); ctx.arc(B.x, B.y, R, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = rgba("245,250,255", 0.85 * edge);
    ctx.lineWidth = 1.6 * sc;
    ctx.stroke();
  }
  ctx.restore();
  /* glass shards: tumbling slivers thrown out of the burst, the "shatter" read */
  var gr = rng(2718 + (seed || 0));
  ctx.save();
  for (i = 0; i < 70; i++) {
    var gan = gr() * Math.PI * 2, gv = 0.5 + gr() * 0.8, glife = 500 + gr() * 700, gst = gr() * 90, gsz = (2.5 + gr() * 5) * sc, spin = (gr() - 0.5) * 0.03;
    k = (bt - gst) / glife;
    if (k <= 0 || k >= 1) continue;
    var gd = R * (0.1 + gv * (1 - Math.pow(1 - k, 2.4)) * 1.15);
    var gx = B.x + Math.cos(gan) * gd, gy = B.y + Math.sin(gan) * gd;
    var rot = gan + bt * spin;
    var ga = (1 - k) * (0.6 + 0.4 * Math.abs(Math.sin(bt * 0.03 + i)));
    ctx.save();
    ctx.translate(gx, gy);
    ctx.rotate(rot);
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = rgba(i % 3 ? "200,225,250" : "245,250,255", ga);
    ctx.beginPath();
    ctx.moveTo(gsz * 1.6, 0); ctx.lineTo(-gsz * 0.6, gsz * 0.55); ctx.lineTo(-gsz * 0.9, -gsz * 0.35);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
  /* grit streaks blown out past the edge */
  var pr = rng(2024);
  ctx.save();
  ctx.lineCap = "round";
  for (i = 0; i < 110; i++) {
    var pan = pr() * Math.PI * 2, pv = 0.4 + pr() * 0.6, plife = 500 + pr() * 700, pst = 20 + pr() * 120;
    k = (bt - pst) / plife;
    if (k <= 0 || k >= 1) continue;
    var pd = R * (0.6 + pv * (1 - Math.pow(1 - k, 2)) * 0.9);
    var qx = B.x + Math.cos(pan) * pd, qy = B.y + Math.sin(pan) * pd, tail = (10 + 10 * (1 - k)) * sc;
    ctx.strokeStyle = pr() < 0.5 ? rgba("200,175,130", (1 - k) * 0.6) : rgba("95,80,60", (1 - k) * 0.6);
    ctx.lineWidth = (1.2 + pr() * 1.6) * sc;
    ctx.beginPath(); ctx.moveTo(qx - Math.cos(pan) * tail, qy - Math.sin(pan) * tail); ctx.lineTo(qx, qy); ctx.stroke();
  }
  ctx.restore();
}
function psychicPaint(ctx, A, B, lt) {
  var T = LOOK_TIME.psychic;
  if (!A || !B || lt < 0 || lt > T.grow + T.fade) return;
  var g = easeOut(Math.min(1, lt / T.grow));
  var f = lt < T.grow ? 1 : 1 - clamp((lt - T.grow) / T.fade);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.strokeStyle = rgba("215,125,170", 0.85 * f);
  ctx.lineWidth = 2.2;
  for (var i = 0; i < 4; i++) {
    var u = Math.max(0, g - i * 0.18);
    if (u <= 0) continue;
    var x = lerp(A.x, B.x, u), y = lerp(A.y, B.y, u);
    ctx.beginPath(); ctx.arc(x, y, 11, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
  if (lt > T.grow) bloom(ctx, B, 14, lt - T.grow, "235,140,195", "160,50,120", 2);
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
  /* Chunk 1 Phase 1 Love-it outlines. Shape + clear effect, ported from the demo painters.
     Ground marks share this overlay (above tokens) so they stay on the same clock as the beam.
     The scripted ally shot in Guiding Bolt only runs when G.pop is set by a later real hit. */
  var Chunk1Fx = (function () {

  var TAU = Math.PI * 2;
  var PAL = {
    lightning: { glow: '85,120,240', core: '232,236,255', hot: '255,255,255' },
    force: { teal: '95,220,205', deep: '30,140,140', violet: '150,50,230' },
    fire: { glow: '200,60,15', core: '255,125,35', hot: '255,225,160', burst: '255,140,45' },
    radiant: { glow: '230,175,70', core: '255,232,170', hot: '255,250,230' },
    necrotic: { glow: '95,45,100', black: '6,3,8', bone: '185,170,180', ash: '120,112,118' },
    acid: { glow: '80,135,25', core: '125,180,40', dark: '30,40,10', hot: '200,240,120' },
    poison: { glow: '150,140,70', core: '195,185,110', dark: '40,42,18' },
    disint: { core: '60,200,90', hot: '200,255,200', ash: '120,115,105' }
  };
  function clamp(v, a, b) { a = a === undefined ? 0 : a; b = b === undefined ? 1 : b; return Math.max(a, Math.min(b, v)); }
  function rgba(c, a) { return 'rgba(' + c + ',' + clamp(a) + ')'; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function lp(A, B, t) { return { x: lerp(A.x, B.x, t), y: lerp(A.y, B.y, t) }; }
  function easeOut(t) { return 1 - Math.pow(1 - clamp(t), 3); }
  // envelope: 0 before a, ramps to 1 by b, holds to c, ramps to 0 by d
  function env(t, a, b, c, d) { if (t < a || t > d) return 0; if (t < b) return (t - a) / Math.max(1, b - a); if (t <= c) return 1; return 1 - (t - c) / Math.max(1, d - c); }
  function rng(seed) { var s = (seed * 2654435761) >>> 0; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  function dist(A, B) { return Math.hypot(B.x - A.x, B.y - A.y); }
  function norm(A, B) { var d = dist(A, B) || 1; return { x: (B.x - A.x) / d, y: (B.y - A.y) / d }; }
  function edge(A, B, r) { var n = norm(A, B); return { x: A.x + n.x * r, y: A.y + n.y * r }; }

  function jag(A, B, segs, amp, seed) {
    var r = rng(seed), n = norm(A, B), px = -n.y, py = n.x, pts = [];
    for (var i = 0; i <= segs; i++) {
      var u = i / segs, o = (i === 0 || i === segs) ? 0 : (r() - 0.5) * 2 * amp;
      pts.push({ x: lerp(A.x, B.x, u) + px * o, y: lerp(A.y, B.y, u) + py * o });
    }
    return pts;
  }
  function partial(pts, p) { // first p fraction of a polyline
    if (p >= 1) return pts; var n = pts.length - 1, f = p * n, k = Math.floor(f), out = pts.slice(0, k + 1);
    if (k < n) out.push(lp(pts[k], pts[k + 1], f - k)); return out;
  }
  function poly(ctx, pts) { ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y); }
  function stroke(ctx, pts, w, col, blur, blurCol) {
    if (pts.length < 2) return; ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = w; ctx.strokeStyle = col;
    if (blur) { ctx.shadowBlur = blur; ctx.shadowColor = blurCol || col; } poly(ctx, pts); ctx.stroke(); ctx.restore();
  }
  function glow(ctx, x, y, r, stops) {
    if (r <= 0.5) return; var g = ctx.createRadialGradient(x, y, 0, x, y, r);
    for (var i = 0; i < stops.length; i++) g.addColorStop(stops[i][0], stops[i][1]);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  }
  function add(ctx, fn) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; fn(); ctx.restore(); }
  function ring(ctx, x, y, r, w, col, blur) { if (r <= 0) return; ctx.save(); ctx.lineWidth = w; ctx.strokeStyle = col; if (blur) { ctx.shadowBlur = blur; ctx.shadowColor = col; } ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke(); ctx.restore(); }
  // lightning bolt body (locked jag look): glow + mid + white core
  function bolt(ctx, pts, a, thick) {
    var k = thick || 1;
    add(ctx, function () {
      stroke(ctx, pts, 14 * k, rgba(PAL.lightning.glow, 0.28 * a), 18, rgba(PAL.lightning.glow, a));
      stroke(ctx, pts, 5 * k, rgba(PAL.lightning.glow, 0.75 * a));
      stroke(ctx, pts, 2.2 * k, rgba(PAL.lightning.core, a));
      stroke(ctx, pts, 0.9 * k, rgba(PAL.lightning.hot, a));
    });
  }
  // particles: deterministic burst
  function sparks(ctx, x, y, t, n, seed, speed, life, col, size, grav) {
    if (t < 0 || t > life) return; var r = rng(seed), u = t / life;
    add(ctx, function () {
      for (var i = 0; i < n; i++) {
        var a = r() * TAU, v = speed * (0.4 + r() * 0.8), d = v * (1 - Math.pow(1 - u, 2)) * life / 1000 * 0.6;
        var px = x + Math.cos(a) * d, py = y + Math.sin(a) * d + (grav || 0) * u * u;
        ctx.fillStyle = rgba(col, (1 - u) * (0.6 + r() * 0.4)); ctx.beginPath(); ctx.arc(px, py, size * (1 - u * 0.5), 0, TAU); ctx.fill();
      }
    });
  }

  /* ---------- 1. WITCH BOLT ---------- */
  var WB = { strike: 70, zap: 1900, snap: 3000 };
  function witchBolt(ctx, lt, G) {
    var A = G.A, B = G.T[0], rT = G.rT, S = G.S;
    if (lt < 0) return;
    var held = env(lt, 0, 150, WB.snap, WB.snap + 260);
    // caster concentration ring
    ring(ctx, S.x, S.y, G.rS + 7 + Math.sin(lt / 180) * 1.2, 2, rgba(PAL.force.teal, 0.75 * held), 8);
    // strike-in
    if (lt < WB.snap) {
      var bucket = Math.floor(lt / 70), pts = jag(A, B, 12, 9, 11 + bucket);
      var p = clamp(lt / WB.strike), zap = env(lt, WB.zap, WB.zap + 40, WB.zap + 260, WB.zap + 420);
      var flick = 0.75 + 0.25 * rng(bucket * 7 + 3)();
      var a = lt < 260 ? 1 : (0.55 * flick + 0.45 * zap);
      bolt(ctx, partial(pts, p), a, lt < 260 ? 1.15 : 0.8 + 0.4 * zap);
      // teal force rope: two strands spiralling round the beam
      if (p >= 1) {
        var n = norm(A, B), px = -n.y, py = n.x, L = dist(A, B), rope = clamp((lt - 70) / 220);
        for (var s = 0; s < 2; s++) {
          var st = [];
          for (var i = 0; i <= 60; i++) {
            var u = i / 60; if (u > rope) break; var taper = Math.sin(Math.PI * u) * 0.6 + 0.4;
            var o = Math.sin(u * L / 16 - lt / 90 + s * Math.PI) * 10 * taper;
            st.push({ x: A.x + n.x * u * L + px * o, y: A.y + n.y * u * L + py * o });
          }
          add(ctx, function () {
            stroke(ctx, st, 4, rgba(PAL.force.violet, 0.25 * held), 6);
            stroke(ctx, st, 2.6, rgba(s ? PAL.force.deep : PAL.force.teal, 0.95 * held), 4);
          });
        }
      }
      // re-zap pulse runs down the tether
      if (lt >= WB.zap && lt < WB.zap + 220) {
        var q = lp(A, B, (lt - WB.zap) / 220);
        add(ctx, function () { glow(ctx, q.x, q.y, 20, [[0, rgba(PAL.lightning.hot, 1)], [0.35, rgba(PAL.force.teal, 0.8)], [1, rgba(PAL.force.teal, 0)]]); });
      }
    }
    // hit flashes (strike + re-zap)
    [[WB.strike, 1.5], [WB.zap + 220, 1.0]].forEach(function (h) {
      var t = lt - h[0]; if (t < 0 || t > 320) return; var u = t / 320;
      add(ctx, function () {
        glow(ctx, B.x, B.y, G.cell * h[1] * (0.6 + 0.4 * u), [[0, rgba(PAL.lightning.hot, 0.9 * (1 - u))], [0.4, rgba(PAL.lightning.glow, 0.5 * (1 - u))], [1, rgba(PAL.lightning.glow, 0)]]);
        ring(ctx, B.x, B.y, rT + 4 + u * G.cell * 0.9 * h[1], 3 * (1 - u) + 0.5, rgba(PAL.lightning.core, 1 - u), 10);
      });
    });
    // crackling teal/violet cage ring on target
    var cage = env(lt, WB.strike, WB.strike + 180, WB.snap, WB.snap + 260);
    if (cage > 0) {
      var cb = Math.floor(lt / 80), rr = rT + 6;
      add(ctx, function () {
        ring(ctx, B.x, B.y, rr, 2, rgba(PAL.force.teal, 0.85 * cage), 10);
        var r = rng(cb * 13 + 5);
        for (var k = 0; k < 6; k++) {
          var a0 = r() * TAU, a1 = a0 + 0.5 + r() * 0.5, arc = [];
          for (var j = 0; j <= 6; j++) { var aa = lerp(a0, a1, j / 6), rad = rr + (j % 2 ? 1 : -1) * (2 + r() * 3); arc.push({ x: B.x + Math.cos(aa) * rad, y: B.y + Math.sin(aa) * rad }); }
          stroke(ctx, arc, 1.6, rgba(k % 2 ? PAL.force.violet : PAL.lightning.core, 0.9 * cage), 6);
        }
      });
    }
    // snap: tether breaks into fading sparks
    var ts = lt - WB.snap;
    if (ts >= 0 && ts < 700) {
      var r2 = rng(77), L2 = dist(A, B), nn = norm(A, B), u2 = ts / 700;
      add(ctx, function () {
        for (var i = 0; i < 46; i++) {
          var u = r2(), base = lp(A, B, u), a = r2() * TAU, v = 20 + r2() * 50, d = v * easeOut(u2) ;
          var x = base.x + Math.cos(a) * d, y = base.y + Math.sin(a) * d;
          ctx.fillStyle = rgba(i % 3 ? PAL.force.teal : PAL.lightning.core, (1 - u2) * 0.9);
          ctx.beginPath(); ctx.arc(x, y, 1.8 * (1 - u2 * 0.6), 0, TAU); ctx.fill();
        }
        // two snapped halves retracting
        var half = 0.5 * (1 - easeOut(clamp(ts / 260)));
        if (half > 0.01) {
          bolt(ctx, partial(jag(A, B, 12, 9, 999), half), 0.6 * (1 - ts / 260), 0.6);
          bolt(ctx, partial(jag(B, A, 12, 9, 998), half), 0.6 * (1 - ts / 260), 0.6);
        }
      });
    }
  }

  /* ---------- 2. SCORCHING RAY ---------- */
  var SR = { gap: 90, travel: 110, hold: 170, fade: 300 };
  function rayEnd(G, i) { // ray i -> target i; G.miss[i] means fizzle past
    var B = G.T[i]; if (!G.miss || !G.miss[i]) return B;
    var n = norm(G.A, B); return { x: B.x + n.x * G.cell * 1.6 - n.y * G.cell * 0.95, y: B.y + n.y * G.cell * 1.6 + n.x * G.cell * 0.95 };
  }
  function scorchingUnder(ctx, lt, G) {
    for (var i = 0; i < G.T.length; i++) {
      var t = lt - i * SR.gap - SR.travel; if (t < 0) continue;
      var E = rayEnd(G, i), a = clamp(t / 200) * 0.5, A = edge(G.A, E, 4);
      var B = (G.miss && G.miss[i]) ? lp(A, E, 0.8) : edge(E, A, G.rT);
      stroke(ctx, [A, B], 3, 'rgba(20,10,4,' + a + ')');
      stroke(ctx, [A, B], 1, 'rgba(90,40,10,' + a * 0.7 + ')');
    }
  }
  function scorching(ctx, lt, G) {
    for (var i = 0; i < G.T.length; i++) {
      var t = lt - i * SR.gap; if (t < 0) continue;
      var E = rayEnd(G, i), miss = G.miss && G.miss[i], A = G.A;
      var head = clamp(t / SR.travel), tail = clamp((t - SR.travel - SR.hold) / SR.fade);
      var a = 1 - clamp((t - SR.travel - SR.hold) / SR.fade) * 0.6;
      if (tail < 1) {
        var H = lp(A, E, easeOut(head)), Tl = lp(A, E, easeOut(tail) * 0.97);
        if (miss) { H = lp(A, E, Math.min(easeOut(head), 0.86)); }
        var flick = 0.85 + 0.15 * Math.sin(t / 23 + i);
        add(ctx, function () {
          stroke(ctx, [Tl, H], 11, rgba(PAL.fire.glow, 0.35 * a), 14, rgba(PAL.fire.glow, 0.9));
          stroke(ctx, [Tl, H], 4.5 * flick, rgba(PAL.fire.core, 0.95 * a));
          stroke(ctx, [Tl, H], 1.6, rgba(PAL.fire.hot, a));
          glow(ctx, H.x, H.y, 9, [[0, rgba(PAL.fire.hot, a)], [1, rgba(PAL.fire.core, 0)]]);
        });
        // short ember trail along the ray
        var r = rng(31 + i);
        add(ctx, function () {
          for (var k = 0; k < 16; k++) {
            var u = r(), age = t - u * SR.travel; if (age < 0 || u > easeOut(head)) continue;
            var P = lp(A, E, u), off = (r() - 0.5) * 2 * (3 + age / 40), life = clamp(age / 500);
            var n = norm(A, E);
            ctx.fillStyle = rgba(PAL.fire.burst, (1 - life) * 0.8);
            ctx.beginPath(); ctx.arc(P.x - n.y * off, P.y + n.x * off - age / 60, 1.4, 0, TAU); ctx.fill();
          }
        });
      }
      var th = t - SR.travel;
      if (!miss) { // small Fire Bolt burst + embers on hit
        if (th >= 0 && th < 520) {
          var u = th / 520, B = G.T[i];
          add(ctx, function () {
            glow(ctx, B.x, B.y, G.cell * (0.35 + 0.45 * easeOut(clamp(th / 140))), [[0, rgba(PAL.fire.hot, 0.95 * (1 - u))], [0.35, rgba(PAL.fire.core, 0.75 * (1 - u))], [1, rgba(PAL.fire.glow, 0)]]);
          });
          sparks(ctx, B.x, B.y, th, 14, 50 + i, 140, 520, PAL.fire.burst, 1.6, -10);
        }
      } else if (th > -40 && th < 600) { // fizzle into embers past target
        var F = lp(A, E, 0.86);
        sparks(ctx, F.x, F.y, Math.max(0, th), 18, 90 + i, 70, 600, PAL.fire.core, 1.3, 14);
        add(ctx, function () { glow(ctx, F.x, F.y, 12, [[0, rgba(PAL.fire.core, 0.5 * (1 - clamp(th / 300)))], [1, rgba(PAL.fire.glow, 0)]]); });
      }
    }
  }

  /* ---------- 3. GUIDING BOLT ---------- */
  var GB = { travel: 230, pop: 2600 };
  function guiding(ctx, lt, G) {
    var A = G.A, B = G.T[0], n = norm(A, B), L = dist(A, B), rT = G.rT;
    var C = { x: (A.x + B.x) / 2 - n.y * L * 0.18, y: (A.y + B.y) / 2 + n.x * L * 0.18 };
    function qb(u) { var v = 1 - u; return { x: v * v * A.x + 2 * v * u * C.x + u * u * B.x, y: v * v * A.y + 2 * v * u * C.y + u * u * B.y }; }
    if (lt >= 0 && lt < GB.travel + 160) {
      var p = clamp(lt / GB.travel), trailA = 1 - clamp((lt - GB.travel) / 160), tr = [];
      for (var i = 0; i <= 24; i++) { var u = Math.max(0, p - 0.45) + (p - Math.max(0, p - 0.45)) * i / 24; tr.push(qb(u)); }
      add(ctx, function () {
        stroke(ctx, tr, 6, rgba(PAL.radiant.glow, 0.3 * trailA), 10);
        stroke(ctx, tr, 2, rgba(PAL.radiant.core, 0.8 * trailA));
        if (p < 1) { var M = qb(p); glow(ctx, M.x, M.y, 16, [[0, rgba(PAL.radiant.hot, 1)], [0.3, rgba(PAL.radiant.core, 0.9)], [1, rgba(PAL.radiant.glow, 0)]]);
          var r = rng(Math.floor(lt / 30)); for (var k = 0; k < 4; k++) { var q = qb(Math.max(0, p - r() * 0.3)); ctx.fillStyle = rgba(PAL.radiant.hot, 0.9); ctx.fillRect(q.x + (r() - .5) * 8, q.y + (r() - .5) * 8, 1.6, 1.6); } }
      });
    }
    var th = lt - GB.travel;
    if (th >= 0 && th < 420) { var u2 = th / 420; add(ctx, function () {
      glow(ctx, B.x, B.y, G.cell * (0.7 + 0.6 * u2), [[0, rgba(PAL.radiant.hot, (1 - u2))], [0.35, rgba(PAL.radiant.core, 0.6 * (1 - u2))], [1, rgba(PAL.radiant.glow, 0)]]);
      ring(ctx, B.x, B.y, rT + u2 * G.cell, 3 * (1 - u2) + .5, rgba(PAL.radiant.hot, 1 - u2), 10); }); }
    // the mark: gold halo ring + star, held until the next attack pops it
    var mark = env(lt, GB.travel + 120, GB.travel + 420, GB.pop + 60, GB.pop + 60);
    var tp = lt - GB.pop - 60;
    if (mark > 0) {
      var pulse = 0.75 + 0.25 * Math.sin(lt / 260);
      add(ctx, function () {
        glow(ctx, B.x, B.y, rT + 16, [[0.6, rgba(PAL.radiant.glow, 0)], [0.8, rgba(PAL.radiant.glow, 0.45 * mark * pulse)], [1, rgba(PAL.radiant.glow, 0)]]);
        ring(ctx, B.x, B.y, rT + 6, 3.5, rgba(PAL.radiant.core, 0.95 * mark * pulse), 14);
        ring(ctx, B.x, B.y, rT + 11, 1.2, rgba(PAL.radiant.core, 0.6 * mark), 0);
        star(ctx, B.x + rT * 0.95, B.y - rT * 0.95, 12 + Math.sin(lt / 200) * 1.5, mark, lt / 900);
      });
    }
    // next attack lands: plain tracer from the ally, mark pops
    if (G.pop && G.P && G.P.jp) {
      var J = G.P.jp, tt = lt - GB.pop;
      if (tt >= 0 && tt < 200) { var a = 1 - tt / 200, H = lp(J, B, clamp(tt / 60)); stroke(ctx, [lp(J, B, Math.max(0, clamp(tt / 60) - 0.25)), H], 2, 'rgba(255,240,210,' + a + ')', 6); }
    }
    if (G.pop && tp >= 0 && tp < 420) { var u3 = tp / 420; add(ctx, function () {
      ring(ctx, B.x, B.y, rT + 5 + easeOut(u3) * G.cell * 0.9, 3 * (1 - u3), rgba(PAL.radiant.core, 1 - u3), 12);
      star(ctx, B.x + rT * 0.95, B.y - rT * 0.95, 12 + u3 * 16, 1 - u3, 0);
      glow(ctx, B.x, B.y, G.cell * 0.8, [[0, rgba(PAL.radiant.hot, 0.7 * (1 - u3))], [1, rgba(PAL.radiant.glow, 0)]]); });
      sparks(ctx, B.x, B.y, tp, 16, 404, 120, 420, PAL.radiant.core, 1.5, 0);
    }
  }
  function star(ctx, x, y, r, a, rot) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot || 0); ctx.beginPath();
    for (var i = 0; i < 8; i++) { var rr = i % 2 ? r * 0.3 : r, an = i / 8 * TAU; ctx.lineTo(Math.cos(an) * rr, Math.sin(an) * rr); }
    ctx.closePath(); ctx.fillStyle = rgba(PAL.radiant.hot, a); ctx.shadowBlur = 10; ctx.shadowColor = rgba(PAL.radiant.glow, a); ctx.fill(); ctx.restore();
  }

  /* ---------- 4. SACRED FLAME ---------- */
  var SF = { glance: 220, drop: 240, land: 360, hold: 1000, fade: 1500, pool: 2000 };
  function sacredUnder(ctx, lt, G) {
    var B = G.T[0], pa = env(lt, SF.land, SF.land + 120, SF.hold + 300, SF.pool), R = G.cell * 0.95;
    if (pa <= 0) return;
    add(ctx, function () {
      glow(ctx, B.x, B.y, R * 1.25, [[0, rgba(PAL.radiant.core, 0.55 * pa)], [0.6, rgba(PAL.radiant.glow, 0.35 * pa)], [1, rgba(PAL.radiant.glow, 0)]]);
      ctx.save(); ctx.translate(B.x, B.y); ctx.rotate(lt / 1600);
      ring(ctx, 0, 0, R, 2.2, rgba(PAL.radiant.core, 0.9 * pa), 8); ring(ctx, 0, 0, R * 0.78, 1, rgba(PAL.radiant.core, 0.7 * pa), 0);
      ctx.strokeStyle = rgba(PAL.radiant.hot, 0.85 * pa); ctx.lineWidth = 2;
      for (var i = 0; i < 12; i++) { var an = i / 12 * TAU, l = i % 2 ? 6 : 11; ctx.beginPath(); ctx.moveTo(Math.cos(an) * (R + 2), Math.sin(an) * (R + 2)); ctx.lineTo(Math.cos(an) * (R + 2 + l), Math.sin(an) * (R + 2 + l)); ctx.stroke(); }
      ctx.restore();
    });
  }
  function sacred(ctx, lt, G) {
    var A = G.A, B = G.T[0], rT = G.rT;
    // dotted gold glance (marks target, no missile)
    var ga = env(lt, 0, 40, SF.glance + 80, SF.glance + 380);
    if (ga > 0) { var n = Math.floor(dist(A, B) / 12), shown = clamp(lt / SF.glance) * n;
      add(ctx, function () { for (var i = 1; i < shown; i++) { var P = lp(A, B, i / n); glow(ctx, P.x, P.y, 4, [[0, rgba(PAL.radiant.hot, 0.9 * ga)], [1, rgba(PAL.radiant.glow, 0)]]); } }); }
    // column of radiant flame drops from above
    var top = -20, dropP = clamp((lt - SF.drop) / (SF.land - SF.drop)), ca = env(lt, SF.drop, SF.drop + 30, SF.hold, SF.fade);
    if (ca > 0) {
      var headY = lerp(top, B.y, easeOut(dropP)), w = 1 + 0.12 * Math.sin(lt / 30);
      var col = [{ x: B.x, y: top }, { x: B.x, y: headY }];
      add(ctx, function () {
        stroke(ctx, col, 30 * w, rgba(PAL.radiant.glow, 0.22 * ca), 20, rgba(PAL.radiant.glow, 0.8));
        stroke(ctx, col, 12 * w, rgba(PAL.radiant.core, 0.6 * ca));
        stroke(ctx, col, 4, rgba(PAL.radiant.hot, 0.95 * ca));
        // flame tongues wavering along the column
        var r = rng(Math.floor(lt / 50));
        for (var k = 0; k < 10; k++) { var y = lerp(top, headY, r()), ox = (r() - 0.5) * 18 * w; glow(ctx, B.x + ox, y, 7 + r() * 6, [[0, rgba(PAL.radiant.core, 0.45 * ca)], [1, rgba(PAL.radiant.glow, 0)]]); }
        if (dropP >= 1) glow(ctx, B.x, B.y, G.cell * 0.9, [[0, rgba(PAL.radiant.hot, 0.8 * ca)], [0.4, rgba(PAL.radiant.core, 0.45 * ca)], [1, rgba(PAL.radiant.glow, 0)]]);
      });
    }
    // flame tongues licking the pool rim + motes rising
    var pa = env(lt, SF.land, SF.land + 120, SF.hold + 300, SF.pool);
    if (pa > 0) {
      add(ctx, function () {
        var R = G.cell * 0.95;
        for (var i = 0; i < 12; i++) {
          var an = i / 12 * TAU + lt / 1600, h = 8 + 6 * (0.5 + 0.5 * Math.sin(lt / 70 + i * 2.1));
          var bx = B.x + Math.cos(an) * R, by = B.y + Math.sin(an) * R;
          ctx.save(); ctx.translate(bx, by); ctx.rotate(an + Math.PI / 2 + Math.PI / 2);
          ctx.beginPath(); ctx.moveTo(-4, 0); ctx.quadraticCurveTo(0, -h * 1.4, 0, -h * 1.6); ctx.quadraticCurveTo(0, -h * 1.4, 4, 0); ctx.closePath();
          ctx.fillStyle = rgba(PAL.radiant.core, 0.6 * pa); ctx.fill(); ctx.restore();
        }
        var r = rng(321);
        for (var k = 0; k < 22; k++) { var t0 = SF.land + r() * 900, age = (lt - t0) / 900; if (age < 0 || age > 1) continue;
          var an2 = r() * TAU, rad = r() * R; ctx.fillStyle = rgba(PAL.radiant.hot, (1 - age) * pa);
          ctx.beginPath(); ctx.arc(B.x + Math.cos(an2) * rad, B.y + Math.sin(an2) * rad - age * 34, 1.6, 0, TAU); ctx.fill(); }
      });
    }
  }

  /* ---------- 5. CHILL TOUCH (necrotic ray) ---------- */
  var CT = { grow: 300, hold: 650, fade: 1050 };
  function tendrilPts(A, B, lt, prog, tail) {
    var n = norm(A, B), px = -n.y, py = n.x, L = dist(A, B), pts = [];
    for (var i = 0; i <= 64; i++) { var u = i / 64; if (u > prog) break; if (u < tail) continue;
      var o = (Math.sin(u * Math.PI * 2.4 - lt / 140) + 0.35 * Math.sin(u * Math.PI * 6.1 + lt / 90)) * Math.sin(Math.PI * u) * L * 0.08;
      pts.push({ x: A.x + n.x * u * L + px * o, y: A.y + n.y * u * L + py * o }); }
    return pts;
  }
  function chill(ctx, lt, G) {
    var A = G.A, B = G.T[0], rT = G.rT;
    if (lt < 0) return;
    var prog = easeOut(clamp(lt / CT.grow)), tail = clamp((lt - CT.hold) / (CT.fade - CT.hold));
    if (tail < 1) {
      var pts = tendrilPts(A, B, lt, prog, easeOut(tail)), a = 1 - tail * 0.5;
      stroke(ctx, pts, 18, rgba(PAL.necrotic.black, 0.35 * a), 10, rgba(PAL.necrotic.black, 0.8));
      stroke(ctx, pts, 9, rgba(PAL.necrotic.black, 0.55 * a));
      for (var q = 0; q < pts.length; q += 3) { var P = pts[q], rr = 9 + 6 * (0.5 + 0.5 * Math.sin(q * 1.7 + lt / 110)), dy = -((lt / 25 + q * 3) % 14);
        glow(ctx, P.x + Math.sin(q + lt / 200) * 4, P.y + dy * 0.6, rr, [[0, rgba(PAL.necrotic.black, 0.45 * a)], [1, rgba(PAL.necrotic.black, 0)]]); }
      add(ctx, function () { stroke(ctx, pts, 12, rgba(PAL.necrotic.glow, 0.35 * a), 14);
        for (var q = 1; q < pts.length; q += 4) glow(ctx, pts[q].x, pts[q].y, 11, [[0, rgba(PAL.necrotic.glow, 0.35 * a)], [1, rgba(PAL.necrotic.glow, 0)]]);
        stroke(ctx, pts, 1.6, rgba(PAL.necrotic.bone, 0.95 * a)); });
      if (pts.length) { var H = pts[pts.length - 1]; if (lt < CT.grow) glow(ctx, H.x, H.y, 12, [[0, rgba(PAL.necrotic.black, 0.8)], [1, rgba(PAL.necrotic.black, 0)]]); }
    }
    // inward collapse on hit
    var th = lt - CT.grow;
    if (th >= 0 && th < 380) { var u = easeOut(th / 380), R = lerp(G.cell * 1.4, rT * 0.6, u);
      add(ctx, function () { ring(ctx, B.x, B.y, R, 4 * (1 - u) + 1, rgba(PAL.necrotic.glow, 0.9 * (1 - u * 0.6)), 14); });
      glow(ctx, B.x, B.y, R, [[0, rgba(PAL.necrotic.black, 0.55 * u)], [1, rgba(PAL.necrotic.black, 0)]]); }
    // ash flakes drifting down
    var r = rng(55);
    for (var k = 0; k < 26; k++) { var t0 = CT.grow + r() * 700, age = (lt - t0) / 1100, an = r() * TAU, rad = rT * (0.4 + r() * 1.2);
      if (age < 0 || age > 1) continue; var x = B.x + Math.cos(an) * rad + Math.sin(age * 6 + k) * 4, y = B.y + Math.sin(an) * rad + age * 22;
      ctx.save(); ctx.translate(x, y); ctx.rotate(age * 5 + k); ctx.fillStyle = rgba(PAL.necrotic.ash, 0.85 * (1 - age)); ctx.fillRect(-1.6, -1, 3.2, 2); ctx.restore(); }
    // ghostly hand mark lingers = "no healing" cue
    var ha = clamp((lt - CT.grow - 150) / 300);
    if (ha > 0) hand(ctx, B.x, B.y, rT * 1.25, ha * (0.7 + 0.3 * Math.sin(lt / 300)));
  }
  function hand(ctx, x, y, s, a) {
    ctx.save(); ctx.translate(x, y + s * 0.15); ctx.rotate(-0.2); var k = s / 20;
    ctx.beginPath();
    ctx.ellipse(0, 4 * k, 7.5 * k, 8 * k, 0, 0, TAU);
    var fingers = [[-6, -9, 9], [-2, -12, 11], [2.2, -12, 11], [6, -9, 9]];
    fingers.forEach(function (f) { ctx.moveTo(f[0] * k + 1.7 * k, f[1] * k); ctx.ellipse(f[0] * k, f[1] * k + f[2] * k * 0.2, 1.7 * k, f[2] * k * 0.55, 0, 0, TAU); });
    ctx.moveTo(-6 * k, 6 * k); ctx.ellipse(-10 * k, 1 * k, 1.8 * k, 5 * k, -0.9, 0, TAU);
    ctx.shadowBlur = 12; ctx.shadowColor = rgba(PAL.necrotic.glow, a);
    ctx.fillStyle = rgba(PAL.necrotic.bone, 0.22 * a); ctx.fill();
    ctx.lineWidth = 1.4; ctx.strokeStyle = rgba('230,220,235', 0.85 * a); ctx.stroke();
    ctx.restore();
  }

  /* ---------- 6. ACID ARROW ---------- */
  var AA = { travel: 380, flare: 2500, off: 3300 };
  function blob(ctx, x, y, r, seed, t, fill, line) {
    ctx.beginPath(); for (var i = 0; i <= 18; i++) { var an = i / 18 * TAU, rr = r * (1 + 0.16 * Math.sin(an * 3 + seed + t / 120) + 0.08 * Math.sin(an * 5 - t / 90)); ctx.lineTo(x + Math.cos(an) * rr, y + Math.sin(an) * rr); }
    ctx.closePath(); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (line) { ctx.strokeStyle = line; ctx.lineWidth = 1.5; ctx.stroke(); }
  }
  function acidUnder(ctx, lt, G) {
    var A = G.A, B = G.T[0];
    // drips that fell during flight
    for (var i = 0; i < 9; i++) { var td = i * 40 + 30; if (lt < td + 120 || td > AA.travel) continue; var P = lp(A, B, td / AA.travel), a = 0.6 * (1 - clamp((lt - td - 120) / 1400));
      ctx.fillStyle = rgba(PAL.acid.dark, a); ctx.beginPath(); ctx.arc(P.x + (i % 2 ? 3 : -3), P.y + 3, 2.4, 0, TAU); ctx.fill(); }
    var th = lt - AA.travel; if (th < 0) return;
    var pa = clamp(th / 180) * (1 - clamp((lt - AA.off) / 700));
    blob(ctx, B.x + 4, B.y + 6, G.cell * 0.72 * easeOut(clamp(th / 200)), 2, 0, rgba(PAL.acid.dark, 0.6 * pa));
    add(ctx, function () { blob(ctx, B.x + 4, B.y + 6, G.cell * 0.72 * easeOut(clamp(th / 200)), 2, 0, null, rgba(PAL.acid.core, 0.5 * pa)); });
  }
  function acid(ctx, lt, G) {
    var A = G.A, B = G.T[0], rT = G.rT;
    if (lt < 0) return;
    if (lt < AA.travel) { var p = lt / AA.travel, P = lp(A, B, p), h = Math.sin(Math.PI * p) * 34, rr = 7 + Math.sin(Math.PI * p) * 3;
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(P.x, P.y + 2, rr, rr * 0.6, 0, 0, TAU); ctx.fill();
      blob(ctx, P.x, P.y - h, rr, 1, lt, rgba(PAL.acid.dark, 0.9));
      add(ctx, function () { blob(ctx, P.x, P.y - h, rr * 0.8, 1, lt, rgba(PAL.acid.core, 0.9)); glow(ctx, P.x, P.y - h, rr * 2.4, [[0, rgba(PAL.acid.hot, 0.6)], [1, rgba(PAL.acid.glow, 0)]]); });
      for (var i = 0; i < 9; i++) { var td = i * 40 + 30, age = lt - td; if (age < 0 || age > 120) continue; var Q = lp(A, B, td / AA.travel), hh = Math.sin(Math.PI * td / AA.travel) * 34 * (1 - age / 120);
        ctx.fillStyle = rgba(PAL.acid.core, 0.9); ctx.beginPath(); ctx.arc(Q.x + (i % 2 ? 3 : -3), Q.y - hh, 1.8, 0, TAU); ctx.fill(); }
      return; }
    var th = lt - AA.travel;
    // splash burst + splatter
    if (th < 500) { var u = th / 500;
      add(ctx, function () { glow(ctx, B.x, B.y, G.cell * (0.5 + 0.6 * easeOut(clamp(th / 150))), [[0, rgba(PAL.acid.hot, 0.8 * (1 - u))], [0.4, rgba(PAL.acid.core, 0.55 * (1 - u))], [1, rgba(PAL.acid.glow, 0)]]); });
      var r = rng(66); for (var k = 0; k < 18; k++) { var an = r() * TAU, d = (rT + 4) + easeOut(clamp(th / 260)) * G.cell * (0.4 + r() * 0.6);
        var x = B.x + Math.cos(an) * d, y = B.y + Math.sin(an) * d, s = 2 + r() * 2.5;
        ctx.fillStyle = rgba(PAL.acid.core, 0.95 * (1 - u)); ctx.beginPath(); ctx.arc(x, y, s, 0, TAU); ctx.fill();
        stroke(ctx, [{ x: B.x + Math.cos(an) * rT, y: B.y + Math.sin(an) * rT }, { x: x, y: y }], 1.2, rgba(PAL.acid.core, 0.5 * (1 - u))); } }
    // clinging glob: sizzles, bubbles, fumes; re-flares next turn, then drips off
    var ga = clamp(th / 150) * (1 - clamp((lt - AA.off) / 500)), slide = easeOut(clamp((lt - AA.off + 200) / 700)) * 16;
    if (ga > 0) {
      var gx = B.x - rT * 0.45, gy = B.y + rT * 0.2 + slide, fl = env(lt, AA.flare, AA.flare + 80, AA.flare + 200, AA.flare + 600);
      blob(ctx, gx, gy, 10 * (1 - slide / 40), 4, lt, rgba(PAL.acid.dark, 0.9 * ga));
      add(ctx, function () {
        blob(ctx, gx, gy, 8 * (1 - slide / 40), 4, lt, rgba(PAL.acid.core, (0.7 + 0.3 * fl) * ga));
        glow(ctx, gx, gy, 20 + fl * G.cell * 0.9, [[0, rgba(PAL.acid.hot, (0.35 + 0.65 * fl) * ga)], [1, rgba(PAL.acid.glow, 0)]]);
        var r2 = rng(Math.floor(lt / 110)); for (var b = 0; b < 3 + fl * 6; b++) { ctx.strokeStyle = rgba(PAL.acid.hot, 0.8 * ga); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(gx + (r2() - .5) * 14, gy + (r2() - .5) * 12, 1 + r2() * 2.5, 0, TAU); ctx.stroke(); }
      });
      // pale fumes
      var r3 = rng(88); for (var f = 0; f < 8; f++) { var t0 = r3() * 900, age = ((lt - AA.travel - t0) % 900) / 900; if (lt - AA.travel - t0 < 0) continue;
        var fx = gx + (r3() - .5) * 10 + Math.sin(age * 5 + f) * 4, fy = gy - age * 30;
        glow(ctx, fx, fy, 5 + age * 8, [[0, 'rgba(200,215,170,' + 0.35 * (1 - age) * ga + ')'], [1, 'rgba(200,215,170,0)']]); }
      if (lt > AA.off - 200) for (var dI = 0; dI < 4; dI++) { var dt = (lt - AA.off + 200 - dI * 120) / 500; if (dt < 0 || dt > 1) continue;
        ctx.fillStyle = rgba(PAL.acid.core, 0.9 * (1 - dt)); ctx.beginPath(); ctx.arc(gx + (dI - 1.5) * 4, gy + 8 + dt * 18, 1.8, 0, TAU); ctx.fill(); }
    }
  }

  /* ---------- 7. POISON SPRAY ---------- */
  var PS = { reach: 150, swallow: 650, gone: 1250 };
  function poison(ctx, lt, G) {
    var A = G.A, B = G.T[0], rT = G.rT, n = norm(A, B), px = -n.y, py = n.x, L = Math.min(dist(A, B), G.cell * 2.2);
    if (lt < 0) return;
    var r = rng(17);
    // stubby puff from the hand: soft blobs along a short cone
    for (var i = 0; i < 22; i++) { var u = r(), side = (r() - .5) * 2, t0 = u * PS.reach, age = (lt - t0) / 480; if (age < 0 || age > 1) { r(); continue; }
      var d = u * L, w = d * 0.35 * side, x = A.x + n.x * d + px * w, y = A.y + n.y * d + py * w, rad = 6 + d * 0.25 + age * 10, a = (1 - age) * 0.7;
      glow(ctx, x, y, rad, [[0, rgba(PAL.poison.glow, 0.13 * a)], [1, rgba(PAL.poison.dark, 0)]]);
      add(ctx, function () { glow(ctx, x, y, rad * 0.7, [[0, rgba(PAL.poison.core, 0.1 * a)], [1, rgba(PAL.poison.glow, 0)]]); }); r(); }
    // miasma swallows the target, then thins (flat falloff, no rings)
    var ma = env(lt, PS.reach - 30, PS.reach + 150, PS.swallow, PS.gone), sp = 1 + clamp((lt - PS.reach) / (PS.gone - PS.reach)) * 0.5;
    if (ma > 0) {
      // one soft olive body (token stays readable through the middle) + a few lumpy lobes round the edge
      glow(ctx, B.x, B.y, G.cell * 1.15 * sp, [[0, rgba(PAL.poison.glow, 0.16 * ma)], [0.55, rgba(PAL.poison.glow, 0.32 * ma)], [0.8, rgba(PAL.poison.dark, 0.22 * ma)], [1, rgba(PAL.poison.dark, 0)]]);
      add(ctx, function () { glow(ctx, B.x, B.y, G.cell * 1.0 * sp, [[0, rgba(PAL.poison.core, 0.10 * ma)], [0.6, rgba(PAL.poison.core, 0.16 * ma)], [1, rgba(PAL.poison.glow, 0)]]); });
      var r2 = rng(29);
      for (var k = 0; k < 9; k++) { var an = r2() * TAU + lt / 1800, rr = G.cell * (0.75 + r2() * 0.3) * sp, x2 = B.x + Math.cos(an) * rr, y2 = B.y + Math.sin(an) * rr, R = G.cell * (0.35 + r2() * 0.2) * sp;
        glow(ctx, x2, y2, R, [[0, rgba(PAL.poison.glow, 0.22 * ma)], [1, rgba(PAL.poison.dark, 0)]]); }
      // spores
      add(ctx, function () { var r3 = rng(41); for (var s = 0; s < 34; s++) { var an = r3() * TAU, rr = r3() * G.cell * 1.1 * sp; ctx.fillStyle = rgba(PAL.poison.core, 0.9 * ma);
        ctx.beginPath(); ctx.arc(B.x + Math.cos(an + lt / 900) * rr, B.y + Math.sin(an + lt / 900) * rr - (lt - PS.reach) / 80, 1.3, 0, TAU); ctx.fill(); } });
      // curling wisps
      var r4 = rng(53);
      for (var w2 = 0; w2 < 4; w2++) { var base = r4() * TAU + lt / (700 + w2 * 150) * (w2 % 2 ? -1 : 1), cx = B.x + (r4() - .5) * G.cell * 0.9, cy = B.y + (r4() - .5) * G.cell * 0.9, sweep = 1.2 + r4() * 1.4, pts = [];
        for (var j = 0; j <= 12; j++) { var tt = j / 12, an2 = base + tt * sweep * (w2 % 2 ? -1 : 1), rad2 = (6 + tt * G.cell * 0.45) * sp; pts.push({ x: cx + Math.cos(an2) * rad2, y: cy + Math.sin(an2) * rad2 - tt * 6 }); }
        add(ctx, function () { stroke(ctx, pts, 1.6, rgba(PAL.poison.core, 0.28 * ma), 4); }); }
    }
  }

  /* ---------- 8. CHAIN LIGHTNING ---------- */
  var CL = { primary: 80, hop: 60, hold: 380, fade: 320 };
  function chainSegs(G) { var s = [[G.A, G.T[0]]]; for (var i = 1; i < G.T.length; i++) s.push([edge(G.T[i - 1], G.T[i], G.rT * 0.6), G.T[i]]); return s; }
  function segStart(i) { return i === 0 ? 0 : CL.primary + (i - 1) * CL.hop; }
  function chainUnder(ctx, lt, G) {
    for (var i = 0; i < G.T.length; i++) { var t = lt - segStart(i) - (i ? CL.hop : CL.primary); if (t < 0) continue;
      var B = G.T[i], a = clamp(t / 120) * 0.55 * (1 - clamp((lt - 2600) / 700)), r = rng(200 + i);
      for (var k = 0; k < (i ? 3 : 5); k++) { var an = r() * TAU, len = G.cell * (i ? 0.55 : 0.85) * (0.6 + r() * 0.5);
        var E = { x: B.x + Math.cos(an) * len, y: B.y + Math.sin(an) * len }, pts = jag(edge(B, E, G.rT * 0.7), E, 5, 4, 300 + i * 10 + k);
        stroke(ctx, pts, 2.2, 'rgba(15,12,14,' + a + ')'); } }
  }
  function chain(ctx, lt, G) {
    var segs = chainSegs(G);
    for (var i = 0; i < segs.length; i++) {
      var t = lt - segStart(i), dur = i ? CL.hop : CL.primary; if (t < 0) continue;
      var a = 1 - clamp((t - dur - CL.hold) / CL.fade); if (a <= 0) continue;
      var bk = Math.floor(lt / 50), pts = jag(segs[i][0], segs[i][1], i ? 9 : 13, i ? 7 : 11, 40 + i * 17 + bk);
      var flick = 0.7 + 0.3 * rng(bk * 3 + i)();
      bolt(ctx, partial(pts, clamp(t / dur)), a * (t < dur + 120 ? 1 : flick), i ? 0.75 : 1.35);
      if (i === 0 && t > dur) { var r = rng(bk + 9); for (var f = 0; f < 3; f++) { var k = 2 + Math.floor(r() * (pts.length - 4)), P = pts[k], an = Math.atan2(segs[0][1].y - segs[0][0].y, segs[0][1].x - segs[0][0].x) + (r() > .5 ? 1 : -1) * (0.5 + r() * 0.6);
        bolt(ctx, jag(P, { x: P.x + Math.cos(an) * 26, y: P.y + Math.sin(an) * 26 }, 4, 4, bk * 5 + f), a * 0.6 * flick, 0.45); } }
      var th = t - dur, B = segs[i][1], big = i === 0;
      if (th >= 0 && th < 420) { var u = th / 420;
        add(ctx, function () {
          glow(ctx, B.x, B.y, G.cell * (big ? 1.4 : 0.8), [[0, rgba(PAL.lightning.hot, 0.95 * (1 - u))], [0.35, rgba(PAL.lightning.glow, 0.55 * (1 - u))], [1, rgba(PAL.lightning.glow, 0)]]);
          ring(ctx, B.x, B.y, G.rT + easeOut(u) * G.cell * (big ? 1.2 : 0.7), (big ? 4 : 2.5) * (1 - u) + .5, rgba(PAL.lightning.core, 1 - u), 10); });
        sparks(ctx, B.x, B.y, th, big ? 22 : 12, 70 + i, big ? 200 : 140, 420, PAL.lightning.core, 1.4, 0); }
    }
  }

  /* ---------- 9. DISINTEGRATE ---------- */
  var DI = { ray: 60, hold: 300, fade: 520, c0: 340, c1: 1500, ashLife: 1300 };
  function wind(G) { var n = norm(G.S, G.T[0]); var w = { x: n.x * 0.8 + 0.25, y: n.y * 0.8 - 0.45 }; var d = Math.hypot(w.x, w.y); return { x: w.x / d, y: w.y / d }; }
  function front(lt) { return clamp((lt - DI.c0) / (DI.c1 - DI.c0)); }
  function cellNoise(i, j) { var v = Math.sin(i * 12.9898 + j * 78.233) * 43758.5453; return v - Math.floor(v); }
  function disintUnder(ctx, lt, G) {
    if (!G.dust) return;
    var B = G.T[0], wd = wind(G), pa = clamp((lt - 800) / 900); if (pa <= 0) return;
    var cx = B.x + wd.x * 6, cy = B.y + wd.y * 6 + 4, R = G.cell * 0.36;
    ctx.save(); ctx.fillStyle = rgba(PAL.disint.ash, 0.85 * pa); ctx.beginPath(); for (var b = 0; b <= 16; b++) { var ab = b / 16 * TAU, rb = R * (1 + 0.22 * Math.sin(ab * 3 + 1) + 0.12 * Math.sin(ab * 5)); ctx.lineTo(cx + Math.cos(ab) * rb, cy + Math.sin(ab) * rb * 0.62); } ctx.fill();
    ctx.fillStyle = 'rgba(70,66,60,' + 0.8 * pa + ')'; ctx.beginPath(); ctx.ellipse(cx + 2, cy + 2, R * 0.55, R * 0.35, 0.2, 0, TAU); ctx.fill();
    var r = rng(5); for (var k = 0; k < 30; k++) { var an = r() * TAU, rr = r() * R * 1.4; ctx.fillStyle = 'rgba(150,145,135,' + 0.8 * pa + ')'; ctx.fillRect(cx + Math.cos(an) * rr, cy + Math.sin(an) * rr * 0.7, 1.5, 1.5); }
    ctx.restore();
  }
  // erode a token drawn on an offscreen ctx (its own coordinates: cx,cy,r). Called by the page for the killed token.
  function erode(oc, lt, G, cx, cy, r) {
    if (!G || !G.dust) return;
    var f = front(lt); if (f <= 0) return; var wd = wind(G), step = 3, R = r + 12;
    oc.save(); oc.globalCompositeOperation = 'destination-out'; oc.fillStyle = '#000';
    for (var x = -R; x <= R; x += step) for (var y = -R; y <= R; y += step) {
      var proj = (x * wd.x + y * wd.y + R) / (2 * R), nz = (cellNoise(x, y) - 0.5) * 0.22;
      if (proj + nz < f * 1.25 - 0.05) oc.fillRect(cx + x - 1, cy + y - 1, step + 1, step + 1);
    }
    oc.restore();
  }
  function disint(ctx, lt, G) {
    var A = G.A, B = G.T[0], rT = G.rT;
    if (lt < 0) return;
    var a = 1 - clamp((lt - DI.hold) / (DI.fade - DI.hold));
    if (a > 0) { var H = lp(A, B, clamp(lt / DI.ray)), w = a;
      add(ctx, function () {
        stroke(ctx, [A, H], 10 * w, rgba(PAL.disint.core, 0.3 * a), 12, rgba(PAL.disint.core, 0.9));
        stroke(ctx, [A, H], 3 * w + 0.5, rgba(PAL.disint.core, 0.95 * a));
        stroke(ctx, [A, H], 1.2, rgba(PAL.disint.hot, a));
        var r = rng(Math.floor(lt / 40)), n = norm(A, B);
        for (var k = 0; k < 8; k++) { var P = lp(A, H, r()), s = (r() > .5 ? 1 : -1) * (3 + r() * 6); ctx.fillStyle = rgba(PAL.disint.hot, a); ctx.fillRect(P.x - n.y * s, P.y + n.x * s, 1.5, 1.5); }
      }); }
    var th = lt - DI.ray;
    if (th >= 0 && th < 520) { var u = th / 520; add(ctx, function () {
      glow(ctx, B.x, B.y, G.cell * (0.6 + 0.5 * u), [[0, rgba(PAL.disint.hot, 0.95 * (1 - u))], [0.35, rgba(PAL.disint.core, 0.6 * (1 - u))], [1, rgba(PAL.disint.core, 0)]]); }); }
    if (!G.dust) return;
    // crumble: ash + grit blown downwind, green-edged embers at the breaking edge
    var wd = wind(G), f = front(lt), R = rT + 4;
    if (f > 0 && f < 1) { var off = (f * 1.25 - 0.05) * 2 * R - R, px = -wd.y, py = wd.x;
      add(ctx, function () { var r = rng(Math.floor(lt / 45)); for (var k = 0; k < 18; k++) { var s = (r() - 0.5) * 2 * R; if (Math.abs(s) > Math.sqrt(Math.max(0, R * R - off * off))) continue;
        var x = B.x + wd.x * off + px * s + (r() - .5) * 4, y = B.y + wd.y * off + py * s + (r() - .5) * 4;
        glow(ctx, x, y, 4, [[0, rgba(PAL.disint.hot, 0.9)], [1, rgba(PAL.disint.core, 0)]]); } }); }
    var r2 = rng(123);
    for (var i = 0; i < 160; i++) { var t0 = lerp(DI.c0, DI.c1, r2()), s2 = (r2() - 0.5) * 2, age = (lt - t0) / DI.ashLife, sz = 1.3 + r2() * 2.8, tw = r2() * TAU;
      if (age < 0 || age > 1) continue; var fo = ((t0 - DI.c0) / (DI.c1 - DI.c0) * 1.25 - 0.05) * 2 * R - R, half = Math.sqrt(Math.max(0, R * R - fo * fo));
      var x0 = B.x + wd.x * fo - wd.y * s2 * half, y0 = B.y + wd.y * fo + wd.x * s2 * half, d = easeOut(age) * (60 + sz * 22);
      var x = x0 + wd.x * d + Math.sin(age * 7 + tw) * 5, y = y0 + wd.y * d + Math.cos(age * 6 + tw) * 4 + age * 6;
      ctx.fillStyle = (i % 7 === 0) ? rgba(PAL.disint.core, 0.9 * (1 - age)) : rgba(PAL.disint.ash, 0.9 * (1 - age));
      ctx.fillRect(x, y, sz, sz); }
  }

  var PAINT = { 'witch-bolt': witchBolt, 'scorching-ray': scorching, 'guiding-bolt': guiding, 'sacred-flame': sacred, 'chill-touch': chill, 'acid-arrow': acid, 'poison-spray': poison, 'chain-lightning': chain, 'disintegrate': disint };
  var UNDER = { 'scorching-ray': scorchingUnder, 'sacred-flame': sacredUnder, 'acid-arrow': acidUnder, 'chain-lightning': chainUnder, 'disintegrate': disintUnder };
  function shakeOf(look, lt) {
    function sh(t0, mag, dur) { var t = lt - t0; if (t < 0 || t > dur) return { x: 0, y: 0 }; var k = mag * (1 - t / dur); return { x: Math.sin(t * 0.9) * k, y: Math.cos(t * 1.3) * k }; }
    if (look === 'witch-bolt') { var s = sh(WB.strike, 3, 180); var z = sh(WB.zap + 220, 2, 150); return { x: s.x + z.x, y: s.y + z.y }; }
    if (look === 'chain-lightning') return sh(CL.primary, 5, 260);
    return { x: 0, y: 0 };
  }
  return {
    looks: Object.keys(PAINT),
    paint: function (ctx, look, lt, G) { if (PAINT[look] && lt >= 0) PAINT[look](ctx, lt, G); },
    paintUnder: function (ctx, look, lt, G) { if (UNDER[look] && lt >= 0) UNDER[look](ctx, lt, G); },
    erode: function (oc, look, lt, G, cx, cy, r) { if (look === 'disintegrate') erode(oc, lt, G, cx, cy, r); },
    erodeFront: function (lt) { return front(lt); },
    shakeOf: shakeOf
  };
  })();
  var C1_LOOKS = {
    "witch-bolt": 1, "scorching-ray": 1, "guiding-bolt": 1, "sacred-flame": 1, "chill-touch": 1,
    "acid-arrow": 1, "poison-spray": 1, "chain-lightning": 1, "disintegrate": 1
  };
  function c1Geom(look, g, spec) {
    g = g || {};
    spec = spec || {};
    var A = g.A;
    var center = g.T || g.B || A;
    if (!A || !center) return null;
    var cell = g.cell || 70;
    var targets = [];
    var miss = [];
    function pushPoint(p, isMiss) {
      if (!p || !isFinite(Number(p.x)) || !isFinite(Number(p.y))) return;
      targets.push({ x: Number(p.x), y: Number(p.y) });
      miss.push(!!isMiss);
    }
    if (look === "scorching-ray" && g.rays && g.rays.length) {
      g.rays.forEach(function (p) { pushPoint(p, p.miss || resultOf(p.result) === "miss"); });
    } else if (look === "scorching-ray") {
      var d = dirOf(A, center), px = -d.y, py = d.x;
      var missed = resultOf(spec.result) === "miss";
      [0, 0.42, -0.33].forEach(function (s) {
        pushPoint({ x: center.x + px * cell * s, y: center.y + py * cell * s }, missed);
      });
    } else {
      pushPoint(center, resultOf(spec.result) === "miss");
      (g.hops || []).forEach(function (p) { pushPoint(p, false); });
    }
    if (!targets.length) return null;
    return {
      A: A, S: g.S || A, T: targets,
      rT: g.rT || cell * 0.42, rS: g.rS || cell * 0.42, cell: cell, miss: miss,
      dust: !!(spec.dust || g.dust || spec.crumbOnly || g.crumbOnly),
      pop: !!g.pop
    };
  }
  function chunk1Paint(ctx, look, lt, g, spec) {
    var G = c1Geom(look, g, spec);
    if (!G) return;
    var drawLt = lt;
    if (look === "witch-bolt" && (spec.pulse || (g && g.pulse))) drawLt = 1900 + Math.min(Math.max(0, lt), 480);
    else if (look === "disintegrate" && (spec.crumbOnly || (g && g.crumbOnly))) drawLt = lt + 640;
    Chunk1Fx.paintUnder(ctx, look, drawLt, G);
    Chunk1Fx.paint(ctx, look, drawLt, G);
  }
  function paintRider(ctx, look, x, y, r, lt) {
    if (!ctx || !isFinite(x) || !isFinite(y)) return;
    var key = look === "chill-touch" ? "chill-touch" : "guiding-bolt";
    var when = key === "chill-touch" ? 980 : 900;
    var G = {
      A: { x: x, y: y }, S: { x: x, y: y }, T: [{ x: x, y: y }],
      rT: r || 18, rS: r || 18, cell: Math.max(48, (r || 18) * 2.4),
      miss: [false], dust: false, pop: false
    };
    Chunk1Fx.paint(ctx, key, when + ((Number(lt) || 0) % 1600), G);
  }
  function guidePop(ctx, x, y, r, lt, cell) {
    if (!ctx || lt < 0 || lt > 420 || !isFinite(x) || !isFinite(y)) return;
    var G = {
      A: { x: x, y: y }, S: { x: x, y: y }, T: [{ x: x, y: y }],
      rT: r || 18, rS: r || 18, cell: cell || 70, miss: [false], dust: false, pop: true
    };
    Chunk1Fx.paint(ctx, "guiding-bolt", 2660 + lt, G);
  }
  function paintGuidePop(ctx, fx, lt, g) {
    if (!g || !g.pop || !g.T) return;
    var res = resultOf(fx && fx.result);
    if (res !== "hit" && res !== "crit") return;
    if (lookOf(fx) === "guiding-bolt") return;
    guidePop(ctx, g.T.x, g.T.y, g.rT || 18, lt, g.cell || 70);
  }
  function erodeToken(oc, lt, cx, cy, r, from, to) {
    if (!oc) return;
    var G = {
      A: from || { x: cx - 30, y: cy },
      S: from || { x: cx - 30, y: cy },
      T: [to || { x: cx + 8, y: cy - 6 }],
      rT: r || 18, rS: r || 18, cell: Math.max(48, (r || 18) * 2),
      miss: [false], dust: true, pop: false
    };
    Chunk1Fx.erode(oc, "disintegrate", lt, G, cx, cy, r);
  }

  function spellPaint(ctx, A, B, lt, seed, spec, g) {
    var look = lookOf(spec);
    /* Grease, Light, Daylight, and Wall of Fire return "" on purpose. An empty look must not fall through to the purple ribbon. */
    if (!look || look === "token") return;
    if (C1_LOOKS[look]) return chunk1Paint(ctx, look, lt, g || { A: A, B: B, T: B, S: A, cell: 70, rT: 18, rS: 18 }, spec || {});
    var T = g && (g.T || g.S);
    var r = (g && (g.rT || g.rS)) || 18;
    if (look === "fire") return firePaint(ctx, A, B, lt, seed);
    if (look === "cold") return coldPaint(ctx, A, B, lt);
    if (look === "lightning") return jagPaint(ctx, A, B, lt, seed);
    if (look === "force") return forcePaint(ctx, A, B, lt);
    if (look === "acid") return acidPaint(ctx, A, B, lt);
    if (look === "poison") return poisonPaint(ctx, A, B, lt, seed);
    if (look === "necrotic") return necroticPaint(ctx, A, B, lt, seed);
    if (look === "radiant") return radiantPaint(ctx, A, B, lt);
    if (look === "fireball") return fireballPaint(ctx, A, (g && g.T) || B, lt, seed, g);
    if (look === "thundercube") return thunderCubePaint(ctx, A, B, lt, seed, g, spec);
    if (look === "firecone") return fireConePaint(ctx, A, B, lt, seed, g, spec);
    if (look === "shatter") return shatterPaint(ctx, A, (g && g.T) || B, lt, seed, g);
    if (look === "thunder") return thunderPaint(ctx, A, B, lt, seed);
    if (look === "psychic") return psychicPaint(ctx, A, B, lt);
    if (look === "beads") return beadsPaint(ctx, A, B, lt, seed);
    if (look === "scurve") return scurvePaint(ctx, A, B, lt);
    if (look === "bullet") return bulletPaint(ctx, A, B, lt, seed);
    if (look === "shield") return shieldPaint(ctx, T, r, lt);
    if (look === "magearmor") return mageArmorPaint(ctx, T, r, lt);
    if (look === "pwt" || look === "invis" || look === "heal" || look === "bless" || look === "fog" || look === "hand") {
      return utilityPaint(ctx, look, A, B, T, r, lt);
    }
    if (CHUNK_COLORS[look]) return namedPaint(ctx, look, A, B, T, r, lt);
    return ribbonPaint(ctx, A, B, lt, seed);
  }
  /* N91 soft-locked kinds. Older Chunk 1–6 looks stay on the ring/shot path below. */
  function paintChunk(ctx, look, A, B, T, r, lt) {
    var time = lookTime(look);
    var life = time.grow + time.hold + time.fade;
    if (lt < 0 || lt > life) return;
    var f = lt < time.grow + time.hold ? 1 : 1 - clamp((lt - time.grow - time.hold) / time.fade);
    var col = CHUNK_COLORS[look] || "185,120,255";
    var kind = CHUNK_KIND[look];
    var at = T || B || A;
    var rad = r || 18;
    ctx.save();
    if (look === "darkvoid" || look === "gutfog" || look === "tentacles" || look === "silk" || look === "hush" || look === "cholla" || look === "briar" || look === "mesmer") {
      ctx.globalCompositeOperation = "source-over";
    } else {
      ctx.globalCompositeOperation = "lighter";
    }
    if (kind === "zone" && at) {
      var fillA = look === "darkvoid" ? 0.82 : (look === "hush" ? 0.08 : 0.34);
      ctx.fillStyle = rgba(col, fillA * f);
      ctx.beginPath();
      ctx.arc(at.x, at.y, rad * (look === "darkvoid" ? 2.4 : 2.1), 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = rgba(look === "cholla" ? "220,40,30" : (look === "tentacles" ? "95,220,205" : col), 0.85 * f);
      ctx.lineWidth = 2;
      ctx.stroke();
      if (look === "mesmer") {
        var swirl;
        ctx.strokeStyle = rgba("110,170,165", 0.75 * f);
        for (swirl = 0; swirl < 4; swirl++) {
          ctx.beginPath();
          ctx.arc(at.x, at.y, rad * (0.45 + swirl * 0.38), swirl * 0.6, swirl * 0.6 + 2.1);
          ctx.stroke();
        }
      }
      if (look === "silk" || look === "briar" || look === "tentacles") {
        var arm;
        ctx.strokeStyle = rgba(col, 0.75 * f);
        for (arm = 0; arm < 8; arm++) {
          var ang = (arm / 8) * Math.PI * 2;
          ctx.beginPath();
          ctx.moveTo(at.x, at.y);
          ctx.lineTo(at.x + Math.cos(ang) * rad * 2, at.y + Math.sin(ang) * rad * 2);
          ctx.stroke();
        }
      }
      ctx.restore();
      return;
    }
    if (kind === "wall" && A && B) {
      ctx.strokeStyle = rgba(col, 0.55 * f);
      ctx.lineWidth = 10;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(A.x, A.y);
      ctx.lineTo(B.x, B.y);
      ctx.stroke();
      ctx.strokeStyle = rgba("214,160,72", 0.9 * f);
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
      return;
    }
    if (kind === "cone" && A && B) {
      var d = dirOf(A, B);
      var angc = Math.atan2(d.y, d.x);
      var len = rad * 3.4;
      ctx.fillStyle = rgba(col, 0.32 * f);
      ctx.beginPath();
      ctx.moveTo(A.x, A.y);
      ctx.lineTo(A.x + Math.cos(angc - 0.42) * len, A.y + Math.sin(angc - 0.42) * len);
      ctx.lineTo(A.x + Math.cos(angc + 0.42) * len, A.y + Math.sin(angc + 0.42) * len);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      return;
    }
    if (kind === "pop") {
      [A, B].forEach(function (p) {
        if (!p) return;
        ctx.fillStyle = rgba(col, 0.4 * f);
        ctx.beginPath();
        ctx.arc(p.x, p.y, rad * 0.95, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.restore();
      return;
    }
    if ((kind === "wrap" || kind === "held") && at) {
      ctx.strokeStyle = rgba(col, 0.88 * f);
      ctx.lineWidth = kind === "held" ? 3.2 : 2.4;
      ctx.beginPath();
      ctx.arc(at.x, at.y, rad * (kind === "held" ? 1.16 : 1.08), 0, Math.PI * 2);
      ctx.stroke();
      if (look === "tintype") {
        var ghost;
        for (ghost = 0; ghost < 3; ghost++) {
          var orbit = lt * 0.002 + ghost * 2.094;
          ctx.fillStyle = rgba("200,205,205", 0.5 * f);
          ctx.beginPath();
          ctx.arc(at.x + Math.cos(orbit) * rad * 1.55, at.y + Math.sin(orbit) * rad * 0.72, 5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      if (look === "flight") {
        ctx.fillStyle = rgba("30,24,18", 0.5 * f);
        ctx.beginPath();
        if (ctx.ellipse) ctx.ellipse(at.x + rad * 0.85, at.y + rad * 0.95, rad * 0.55, rad * 0.22, 0, 0, Math.PI * 2);
        else ctx.arc(at.x + rad * 0.85, at.y + rad * 0.95, 6, 0, Math.PI * 2);
        ctx.fill();
      }
      if (look === "agathys" && B && A && B !== A) {
        ctx.fillStyle = rgba("80,125,185", 0.7 * f);
        ctx.beginPath();
        ctx.arc(B.x, B.y, 6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      return;
    }
    if (kind === "shot" && A && B) {
      var grow = easeOut(Math.min(1, lt / Math.max(1, time.grow)));
      ctx.fillStyle = rgba(col, 0.9 * f);
      ctx.beginPath();
      ctx.arc(lerp(A.x, B.x, grow), lerp(A.y, B.y, grow), look === "snap" ? 4 : 7, 0, Math.PI * 2);
      ctx.fill();
      if (look === "rift" && B) {
        ctx.strokeStyle = rgba("95,220,205", 0.9 * f);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(B.x, B.y, rad * (1.25 - 0.55 * grow), 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = rgba("10,12,18", 0.55 * f);
        ctx.beginPath();
        ctx.arc(B.x, B.y, rad * 0.45 * grow, 0, Math.PI * 2);
        ctx.fill();
      }
      if (lt > time.grow && B) bloom(ctx, B, 14, lt - time.grow, col, col, 2);
      ctx.restore();
      return;
    }
    ctx.restore();
  }
  function namedPaint(ctx, look, A, B, T, r, lt) {
    if (CHUNK_KIND[look]) return paintChunk(ctx, look, A, B, T, r, lt);
    var time = lookTime(look);
    var life = time.grow + time.hold + time.fade;
    if (lt < 0 || lt > life) return;
    var f = lt < time.grow + time.hold ? 1 : 1 - clamp((lt - time.grow - time.hold) / time.fade);
    var col = CHUNK_COLORS[look] || "185,120,255";
    var ring = !!SELF_LOOKS[look] || look === "cage" || look === "ensnare" || look === "enfeeble" || look === "hex" || look === "brand" || look === "heat" || look === "fever" || look === "rime";
    ctx.save();
    if (look === "void" || look === "swarm" || look === "furnace" || look === "specter") ctx.globalCompositeOperation = "source-over";
    else ctx.globalCompositeOperation = "lighter";
    if (ring) {
      var at = T || B || A;
      if (!at) { ctx.restore(); return; }
      ctx.strokeStyle = rgba(col, (look === "void" ? 0.35 : 0.7) * f);
      ctx.lineWidth = look === "flameblade" ? 4 : 2.5;
      ctx.beginPath();
      ctx.arc(at.x, at.y, (r || 18) * (look === "flameblade" ? 0.72 : 1.08), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      return;
    }
    if ((look === "mockery" || look === "whispers") && (T || B) && ctx.fillText) {
      var note = T || B;
      ctx.fillStyle = rgba(col, 0.9 * f);
      ctx.font = "18px serif";
      ctx.textAlign = "center";
      ctx.fillText("\u266A", note.x, note.y - 10);
    }
    if (A && B) {
      var g = easeOut(Math.min(1, lt / Math.max(1, time.grow)));
      ctx.fillStyle = rgba(col, 0.85 * f);
      ctx.beginPath();
      ctx.arc(lerp(A.x, B.x, g), lerp(A.y, B.y, g), look === "skybolt" || look === "deathray" || look === "sickray" ? 4 : 7, 0, Math.PI * 2);
      ctx.fill();
    }
    if (lt > time.grow && B) bloom(ctx, B, 16, lt - time.grow, col, col, 2);
    ctx.restore();
  }
  function stickyLook(label) {
    var s = low(label);
    if (!s) return "";
    if (/^guided\b/.test(s)) return "guiding-bolt";
    if (/no healing/.test(s)) return "chill-touch";
    if (/^baned\b/.test(s)) return "jinx";
    if (/outlined|foxfire/.test(s)) return "foxfire";
    if (/paralyzed/.test(s)) return "lasso";
    if (/^frightened\b/.test(s)) return "terror";
    if (/^slowed\b/.test(s)) return "molasses";
    if (/^hasted\b/.test(s)) return "brass";
    if (/blurred/.test(s)) return "haze";
    if (/mirror image/.test(s)) return "tintype";
    if (/^flying\b/.test(s)) return "flight";
    if (/retching/.test(s)) return "gutfog";
    if (/^banished\b/.test(s)) return "rift";
    if (/polymorphed/.test(s)) return "morph";
    if (/charmed \+ incapacitated/.test(s)) return "mesmer";
    if (/^hexed\b/.test(s) || s === "hex") return "hex";
    if (/^marked\b/.test(s)) return "brand";
    if (/no reactions/.test(s)) return "cage";
    if (/enfeebled/.test(s)) return "enfeeble";
    if (/fire shield \(chill|chill shield/.test(s)) return "rime";
    if (/fire shield/.test(s)) return "fireshield";
    if (/heated metal|heat metal/.test(s)) return "heat";
    if (/flame blade/.test(s)) return "flameblade";
    if (/branding|branded/.test(s)) return "brand";
    if (/ensnar/.test(s)) return "ensnare";
    if (/phantasmal/.test(s)) return "specter";
    if (/contagion|fever brand/.test(s)) return "fever";
    return "";
  }
  function chunkColor(look) { return CHUNK_COLORS[look] || ""; }
  function namedLook(name) {
    var names = spellCandidates({ spell: name });
    for (var i = 0; i < names.length; i++) if (CHUNK_LOOKS[names[i]]) return CHUNK_LOOKS[names[i]];
    return "";
  }
  function tileOf(name) {
    var names = spellCandidates({ spell: name });
    for (var i = 0; i < names.length; i++) if (CHUNK_TILES[names[i]]) return CHUNK_TILES[names[i]];
    return "";
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
      id: spec.id || "",
      type: spec.type || "", result: resultOf(spec.result), nat: isFinite(nat) ? nat : null,
      crit: !!spec.crit || resultOf(spec.result) === "crit", critMin: spec.critMin || 20,
      natural20: nat === 20, natural1: nat === 1, shooter: spec.shooter || "", target: spec.target || "",
      who: spec.who || spec.characterName || spec.name || ""
    }, extra || {});
  }

  root.SSDNSMapFx = {
    beforeEffect: beforeEffect, setBeforeEffect: setBeforeEffect, effectEvent: effectEvent, HOOK_TIMEOUT_MS: HOOK_TIMEOUT_MS,
    PREF_KEY: PREF_KEY, enabled: enabled, setEnabled: setEnabled,
    TIMING: TIMING, configure: configure, TYPES: TYPES,
    classify: classify, resultOf: resultOf, plan: plan, sanitize: sanitize, request: request,
    lookOf: lookOf, lookSelf: lookSelf, lookTime: lookTime, shakeOf: shakeOf,
    stickyLook: stickyLook, chunkColor: chunkColor, tileOf: tileOf, namedLook: namedLook,
    paint: paint, paintRider: paintRider, paintGuidePop: paintGuidePop,
    erodeToken: erodeToken, erodeFront: function (lt) { return Chunk1Fx.erodeFront(lt); },
    hash: hash, dirOf: dirOf
  };
  root.SSDNSMapFX = root.SSDNSMapFx; /* alias: both spellings work */
})(typeof window !== "undefined" ? window : globalThis);

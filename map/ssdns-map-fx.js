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
      if ((look === "hex" || look === "brand" || look === "heat") && info.pulse) { p.impactAt = 40; p.duration = 820; }
      if (look === "enfeeble" && info.saved) { p.impactAt = 20; p.duration = 560; }
      if (look === "flameblade" && info.swing) { p.impactAt = 160; p.duration = 1100; }
      var spellNow = low(info.spell || info.weapon || "");
      if (look === "deathray" && /finger of death/.test(spellNow)) {
        p.impactAt = 60;
        p.duration = info.rise ? 1500 : 1300;
      }
      if (look === "meteors") {
        var beatN = Math.max(0, Math.min(3, Number(info.beat) || 0));
        p.impactAt += beatN * 120;
        p.duration += beatN * 120;
      }
      if (chunk5Spell(look, info)) {
        var c5 = chunk5Clock(look, info);
        p.impactAt = c5.impact;
        p.duration = c5.duration;
        if (info.pulse) { p.impactAt = 40; p.duration = 700; }
        else if (info.garnish === "clear") { p.impactAt = 20; p.duration = 900; }
      }
      if (chunk4Spell(look, info)) {
        if (info.pulse) { p.impactAt = 40; p.duration = 700; }
        else if (info.garnish === "clear") { p.impactAt = 20; p.duration = 900; }
        else if (info.garnish === "detonate") { p.impactAt = 80; p.duration = 1700; }
        else if (look === "icebomb") { p.impactAt = 820; p.duration = 2400; }
        else if (look === "skypillar" && /fire storm/.test(spellNow)) {
          var extraCols = Math.min(9, (info.hops && info.hops.length) || 0);
          p.impactAt += extraCols * 50;
          p.duration += extraCols * 100;
        }
      }
      if (look === "massword" || look === "masscure") {
        var extraAllies = Math.min(5, (info.hops && info.hops.length) || 0);
        p.duration += extraAllies * (look === "massword" ? 200 : 90);
      }
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
    var hops = packList(spec.hops, 10);
    if (hops) out.hops = hops;
    var rays = packList(spec.rays, 8);
    if (rays) out.rays = rays;
    if (spec.dust) out.dust = true;
    if (spec.crumbOnly) out.crumbOnly = true;
    if (spec.pulse) out.pulse = true;
    if (spec.saved) out.saved = true;
    if (spec.mode === "chill" || spec.mode === "warm" || spec.mode === "radiant" || spec.mode === "necrotic") out.mode = spec.mode;
    var beat = Number(spec.beat);
    if (spec.beat != null && isFinite(beat)) out.beat = Math.max(0, Math.min(7, Math.round(beat)));
    if (spec.killed) out.killed = true;
    if (spec.rise) out.rise = true;
    if (spec.garnish === "place" || spec.garnish === "swipe" || spec.garnish === "clear" || spec.garnish === "detonate") out.garnish = spec.garnish;
    if (spec.cleared) out.cleared = true;
    var rad = Number(spec.radius);
    if (spec.radius != null && isFinite(rad) && rad > 0 && rad <= 500) out.radius = Math.round(rad);
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
    var reqHops = packList(info.hops, 10);
    if (reqHops) r.hops = reqHops;
    var reqRays = packList(info.rays, 8);
    if (reqRays) r.rays = reqRays;
    if (info.dust) r.dust = true;
    if (info.crumbOnly) r.crumbOnly = true;
    if (info.pulse) r.pulse = true;
    if (info.saved) r.saved = true;
    if (info.mode === "chill" || info.mode === "warm" || info.mode === "radiant" || info.mode === "necrotic") r.mode = info.mode;
    var reqBeat = Number(info.beat);
    if (info.beat != null && isFinite(reqBeat)) r.beat = Math.max(0, Math.min(7, Math.round(reqBeat)));
    if (info.killed) r.killed = true;
    if (info.rise) r.rise = true;
    if (info.garnish === "place" || info.garnish === "swipe" || info.garnish === "clear" || info.garnish === "detonate") r.garnish = info.garnish;
    if (info.cleared) r.cleared = true;
    var reqRad = Number(info.radius);
    if (info.radius != null && isFinite(reqRad) && reqRad > 0 && reqRad <= 500) r.radius = Math.round(reqRad);
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
     Chunk 2 Phase 1 paints Hex, Hunter's Mark, Shocking Grasp, Thorn Whip, Hellish Rebuke,
     Flame Blade, Heat Metal, Fire Shield, Vampiric Touch, and Ray of Enfeeblement.
     Chunk 6 Phase 1 paints Mass Healing Word, Mass Cure Wounds, and Heal.
     Healing Word and Cure Wounds stay on the small heal mote. Sacred Flame stays the attack drop.
     Lightning Bolt stays on lightning. Fire Bolt stays on fire. Acid Splash stays on acid.
     Flaming Sphere and Spiritual Weapon stay tokens. Grease, Light, Daylight, and Wall of Fire are zones, not beams. */
  var LOOK_TIME = {
    ribbon: { grow: 220, hold: 140, fade: 450 },
    fire: { grow: 300, hold: 0, fade: 280 },
    cold: { grow: 360, hold: 0, fade: 600 },
    /* Ice Storm: shards fall for grow, then the 20-ft grit and rime. Not the cold needle's clock. */
    hailstorm: { grow: 520, hold: 280, fade: 1100 },
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
    "disintegrate": { grow: 60, hold: 1740, fade: 1100 },
    /* Chunk 2 Phase 1 clocks, from the Love-it demo timings. */
    hex: { grow: 120, hold: 1680, fade: 600 },
    brand: { grow: 120, hold: 1480, fade: 600 },
    "shocking-grasp": { grow: 70, hold: 2530, fade: 480 },
    thorn: { grow: 220, hold: 860, fade: 520 },
    rebuke: { grow: 400, hold: 1100, fade: 700 },
    flameblade: { grow: 380, hold: 1100, fade: 500 },
    heat: { grow: 260, hold: 2300, fade: 650 },
    fireshield: { grow: 400, hold: 1600, fade: 600 },
    rime: { grow: 400, hold: 1600, fade: 600 },
    siphon: { grow: 220, hold: 1680, fade: 700 },
    enfeeble: { grow: 90, hold: 1900, fade: 600 },
    /* Chunk 3 Phase 1 clocks. Shared keys (cold, thunder, brand, deathray) keep their old clocks. */
    skybolt: { grow: 530, hold: 180, fade: 900 },
    sunshaft: { grow: 90, hold: 400, fade: 800 },
    prism: { grow: 280, hold: 120, fade: 500 },
    meteors: { grow: 540, hold: 200, fade: 1200 },
    orb: { grow: 240, hold: 80, fade: 720 },
    produceflame: { grow: 80, hold: 160, fade: 760 },
    sickray: { grow: 70, hold: 280, fade: 700 },
    smitefire: { grow: 110, hold: 80, fade: 640 },
    fear: { grow: 110, hold: 280, fade: 900 },
    blind: { grow: 110, hold: 40, fade: 560 },
    /* Chunk 4 Phase 1 clocks. Sticky idles live on the zone layer; these cover the cast, the tick, and the boom. */
    wallice: { grow: 360, hold: 520, fade: 420 },
    wallthorn: { grow: 360, hold: 520, fade: 420 },
    wallblade: { grow: 360, hold: 520, fade: 420 },
    void: { grow: 280, hold: 620, fade: 420 },
    daggers: { grow: 180, hold: 520, fade: 400 },
    swarm: { grow: 550, hold: 280, fade: 420 },
    furnace: { grow: 600, hold: 280, fade: 420 },
    skypillar: { grow: 120, hold: 900, fade: 480 },
    icebomb: { grow: 820, hold: 900, fade: 520 },
    sunburst: { grow: 60, hold: 900, fade: 450 },
    deathring: { grow: 600, hold: 800, fade: 500 },
    bead: { grow: 260, hold: 280, fade: 320 },
    /* Chunk 6 Phase 1 clocks. grow is the first arrival. Extra allies extend the plan, not this base. */
    massword: { grow: 380, hold: 520, fade: 500 },
    masscure: { grow: 300, hold: 900, fade: 500 },
    healcolumn: { grow: 410, hold: 1020, fade: 700 }
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
    /* Ice Storm is a 20-ft hail cylinder. Ray of Frost stays the cold needle. Freezing Sphere stays icebomb. */
    "ice storm": "hailstorm",
    "hailstorm": "hailstorm",
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
    "disintegrate": "disintegrate",
    /* Chunk 2 Phase 1. Shocking Grasp leaves the generic lightning beam. */
    "shocking grasp": "shocking-grasp"
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
    specter: "215,125,170", stomp: "200,170,110", coldcone: "80,125,185", hailstorm: "200,225,250", mockery: "215,125,170",
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
      /* Shatter is the wedge-plus-burst. A bare thunder damage type stays on thunderPaint.
         Thunderous Smite keeps the thunder key and paints the on-hit boom instead. */
      if (/^shatter$/.test(name)) return "shatter";
      /* Zones paint themselves. An empty look must not fall through to a fire beam. */
      if (/^grease$|^light$|^daylight$|^wall of fire$/.test(name)) return "";
      /* Attack spells whose only look was the damage-type pass. An empty dmg (hidden AC pending resolve) used to paint the purple ribbon. */
      if (/^fire bolt$/.test(name)) return "fire";
      if (/^ray of frost$/.test(name)) return "cold";
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
/* Phase 2 grit. Source-over specks so a Love-it shape keeps its fill.
   n is capped: a lasting zone must not repaint a demo-sized field every frame. */
function gritBurst(ctx, x, y, t, life, n, seed, radius, cols) {
  if (!ctx || !(t >= 0) || !(life > 0) || t > life || !(radius > 1)) return;
  n = Math.max(0, Math.min(40, n || 0));
  if (!n) return;
  var u = t / life;
  var fade = 1 - u;
  if (fade <= 0) return;
  var r = rng((seed || 1) + 17);
  var palette = cols && cols.length ? cols : ["95,80,60", "120,100,75"];
  var i;
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  for (i = 0; i < n; i++) {
    var a = r() * Math.PI * 2;
    var v = 0.25 + r() * 0.75;
    var d = radius * v * (1 - Math.pow(1 - Math.min(1, u * 1.4), 2));
    var drop = radius * 0.12 * u * u;
    ctx.fillStyle = rgba(palette[i % palette.length], fade * (0.4 + r() * 0.45));
    ctx.fillRect(x + Math.cos(a) * d - 1.1, y + Math.sin(a) * d + drop - 1.1, 2.2, 2.2);
  }
  ctx.restore();
}
/* Ice Storm. Rock-hard hail in a 20-ft cylinder on the aim point. Shards fall, then grit and rime.
   No locked storm tile lives under specs/spell-fx, so this stays on the cold palette.
   Not Ray of Frost's needle, and not Freezing Sphere's lobbed icebomb. The 2-round slick is the zone. */
function hailstormPaint(ctx, A, B, lt, seed, g) {
  var time = LOOK_TIME.hailstorm;
  var life = time.grow + time.hold + time.fade;
  if (!B || lt < 0 || lt > life) return;
  var cell = (g && g.cell) || 70;
  var R = cell * 4;
  var fall = time.grow;
  var f = lt < fall + time.hold ? 1 : 1 - clamp((lt - fall - time.hold) / time.fade);
  var rand = rng((seed || 4) + 19);
  var i;
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = rgba("70,72,80", 0.34 * f);
  ctx.beginPath();
  ctx.arc(B.x, B.y - cell * 1.8, R * 0.42, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  for (i = 0; i < 36; i++) {
    var ang = rand() * Math.PI * 2;
    var rad = Math.sqrt(rand()) * R * 0.92;
    var delay = rand() * 160;
    var t = lt - delay;
    if (t < 0) continue;
    var p = clamp(t / fall);
    var x = B.x + Math.cos(ang) * rad;
    var y0 = B.y - cell * (2.2 + rand() * 1.1);
    var y1 = B.y + (rand() - 0.5) * cell * 0.5;
    var y = lerp(y0, y1, easeOut(p));
    var rock = rand() < 0.38;
    ctx.save();
    ctx.globalCompositeOperation = rock ? "source-over" : "lighter";
    ctx.translate(x, y);
    ctx.rotate(ang + p * 2);
    ctx.fillStyle = rock ? rgba("95,80,60", 0.9 * f) : rgba("200,225,250", 0.92 * f);
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(2.4, 0);
    ctx.lineTo(0, 7);
    ctx.lineTo(-2.4, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  if (lt > fall * 0.72) {
    var boom = lt - fall * 0.72;
    var ringR = Math.min(R, R * easeOut(clamp(boom / 220)));
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = rgba("250,252,255", 0.85 * f);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(B.x, B.y, ringR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    gritBurst(ctx, B.x, B.y, boom, time.hold + time.fade, 28, (seed || 4) + 3, R * 0.85, ["95,80,60", "120,100,75", "200,225,250"]);
    var rime = clamp(boom / 160) * f;
    if (rime > 0) {
      ctx.save();
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = rgba("200,225,250", 0.22 * rime);
      ctx.beginPath();
      ctx.arc(B.x, B.y, R * 0.96, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
  }
  /* Lasting slick under the hailstorm one-shot. Same cold palette, not Ray of Frost's needle. */
  function hailstormIdle(ctx, center, cell, seedKey) {
    if (!ctx || !center) return;
    var cellN = cell || 70;
    var R = cellN * 4;
    var spin = ((typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now()) / 900;
    var rand = rng((hash(String(seedKey || "ice")) % 997) + 3);
    var i;
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = rgba("200,225,250", 0.18);
    ctx.beginPath();
    ctx.arc(center.x, center.y, R * 0.96, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = rgba("250,252,255", 0.5);
    ctx.lineWidth = 2;
    ctx.stroke();
    for (i = 0; i < 16; i++) {
      var ang = rand() * Math.PI * 2 + spin * (i % 2 ? 0.04 : -0.03);
      var rad = Math.sqrt(rand()) * R * 0.82;
      ctx.save();
      ctx.translate(center.x + Math.cos(ang) * rad, center.y + Math.sin(ang) * rad);
      ctx.rotate(ang + spin);
      ctx.fillStyle = i % 3 ? rgba("200,225,250", 0.8) : rgba("95,80,60", 0.85);
      ctx.fillRect(-1.6, -7, 3.2, 14);
      ctx.restore();
    }
    ctx.restore();
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
  var er = rng(4242);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";
  for (i = 0; i < 150; i++) {
    var ean = er() * Math.PI * 2, ev = 0.35 + er() * 0.75, elife = 600 + er() * 1100, est = 40 + er() * 220, ew = 1 + er() * 1.4;
    var ek = (lt - est) / elife;
    if (ek <= 0 || ek >= 1) continue;
    var edist = Math.min(R * 0.92, R * 0.2 + ev * ek * R * 0.85);
    var ex = x + Math.cos(ean) * edist, ey = y + Math.sin(ean) * edist + ek * ek * 8 * sc;
    var etail = Math.min(R * 0.07, (3 + 8 * (1 - ek)) * sc);
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
    var smoke = rng(77);
    for (i = 0; i < 8; i++) {
      var sang = smoke() * Math.PI * 2;
      var soff = R * (0.2 + smoke() * 0.55);
      softDisc(ctx, x + Math.cos(sang) * soff, y + Math.sin(sang) * soff, R * (0.22 + smoke() * 0.16), [
        [0, "rgba(40,22,12," + (0.45 * hg) + ")"],
        [1, "rgba(40,22,12,0)"]
      ], "source-over");
    }
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
/* Chunk 3 painters that share a key with an older look. The spell name decides.
   Hail of Thorns is the Chunk 5 burst, not this painter. Harm is the Chunk 5 collapse.
   A bare thunder or cold damage type stays on the old beam. Ice Storm is hailstorm, not that needle.
   Hunter's Mark stays on brand. */
function chunk3Spell(look, spec) {
  var name = low((spec && (spec.spell || spec.weapon)) || "");
  if (look === "skybolt" || look === "sunshaft" || look === "prism" || look === "meteors" || look === "orb" || look === "produceflame" || look === "sickray" || look === "smitefire" || look === "fear" || look === "blind") return true;
  if (look === "deathray" && /finger of death/.test(name)) return true;
  if (look === "brand" && /branding smite/.test(name)) return true;
  if (look === "thunder" && /thunderous smite/.test(name)) return true;
  if (look === "cold" && /ray of frost/.test(name)) return true;
  if (look === "token" && /guardian of faith/.test(name)) return true;
  return false;
}
/* Chunk 4 named looks. Hunger and Arms share `void`. Flame Strike and Fire Storm share `skypillar`.
   Hail of Thorns is the Chunk 5 burst. Wall of Fire, Cloudkill, Fireball, and Sacred Flame stay on their own looks. */
function chunk4Spell(look, spec) {
  var name = low((spec && (spec.spell || spec.weapon)) || "");
  if (look === "wallice" || look === "wallthorn" || look === "wallblade" || look === "daggers" || look === "swarm" || look === "furnace" || look === "icebomb" || look === "sunburst" || look === "deathring" || look === "bead") return true;
  if (look === "void" && /hunger of hadar|arms of hadar/.test(name)) return true;
  if (look === "skypillar" && /flame strike|fire storm/.test(name)) return true;
  return false;
}
/* Chunk 6 heals. Healing Word and Cure Wounds stay on the small `heal` mote. Sacred Flame stays sacred-flame. */
function chunk6Spell(look) {
  return look === "massword" || look === "masscure" || look === "healcolumn";
}
function chunk4Key(look, spec) {
  var name = low((spec && (spec.spell || spec.weapon)) || "");
  if (look === "void" && /arms of hadar/.test(name)) return "arms";
  if (look === "void") return "hunger";
  if (look === "skypillar" && /fire storm/.test(name)) return "storm";
  if (look === "skypillar") return "flame";
  return look;
}
/* Chunk 5 named looks. Barrage and Volley share `volley`. Hail of Thorns shares `thorn`
   with Thorn Whip. Harm shares `deathray` with Finger of Death. The spell name picks the painter. */
function chunk5Key(look, spec) {
  var name = low((spec && (spec.spell || spec.weapon)) || "");
  if (look === "volley") return /conjure volley/.test(name) ? "volley" : "barrage";
  if (look === "thorn" && /hail of thorns/.test(name)) return "hail";
  if (look === "deathray" && /^harm$/.test(name)) return "harm";
  if (look === "charged" || look === "ensnare" || look === "fever" || look === "specter" || look === "stomp" || look === "coldcone" || look === "mockery" || look === "whispers") return look;
  return "";
}
function chunk5Spell(look, spec) { return !!chunk5Key(look, spec); }
function chunk5Clock(look, spec) {
  var key = chunk5Key(look, spec);
  var clocks = {
    barrage: { impact: 230, duration: 1200 },
    volley: { impact: 420, duration: 1700 },
    charged: { impact: 280, duration: 1100 },
    hail: { impact: 220, duration: 1100 },
    ensnare: { impact: 420, duration: 1400 },
    fever: { impact: 460, duration: 1400 },
    specter: { impact: 520, duration: 1500 },
    harm: { impact: 300, duration: 1700 },
    stomp: { impact: 320, duration: 1200 },
    coldcone: { impact: 360, duration: 2100 },
    mockery: { impact: 240, duration: 1100 },
    whispers: { impact: 420, duration: 1400 }
  };
  return clocks[key] || { impact: 240, duration: 1200 };
}
function chunk5Skin(spec) {
  spec = spec || {};
  var mode = low(spec.mode || "");
  if (mode === "radiant") return "radiant";
  if (mode === "necrotic") return "necrotic";
  var dmg = low(spec.dmg || spec.dmgType || "");
  if (dmg === "radiant") return "radiant";
  return "necrotic";
}
/* Lasting token wraps. A bare Restrained or Frightened chip is not a wrap.
   The spell on the condition, or a Contagion chip name, decides. */
function wrapLook(name, spell) {
  var bySpell = spell ? lookOf({ type: "spell", spell: spell }) : "";
  if (bySpell === "ensnare" || bySpell === "fever" || bySpell === "specter") return bySpell;
  var s = low(name);
  if (/contagion/.test(s)) return "fever";
  if (/ensnar/.test(s)) return "ensnare";
  if (/phantasmal/.test(s)) return "specter";
  return "";
}
function c4Mode(spec) {
  spec = spec || {};
  if (spec.garnish === "detonate") return "boom";
  if (spec.garnish === "clear") return "clear";
  if (spec.pulse) return "tick";
  if (spec.quiet) return "idle";
  return "cast";
}
function chunk3Key(look, spec) {
  var name = low((spec && (spec.spell || spec.weapon)) || "");
  if (look === "cold" && /ray of frost/.test(name)) return "frostray";
  if (look === "thunder" && /thunderous smite/.test(name)) return "smiteboom";
  if (look === "brand" && /branding smite/.test(name)) return "smitebrand";
  if (look === "token") return "guardian";
  return look;
}
function shakeOf(spec, lt) {
  var look = lookOf(spec || {});
  if (chunk5Spell(look, spec)) return Chunk5Fx.shakeOf(chunk5Key(look, spec), lt);
  if (chunk6Spell(look)) return { x: 0, y: 0 };
  if (chunk4Spell(look, spec)) return Chunk4Fx.shakeOf(chunk4Key(look, spec), lt, spec || {});
  if (chunk3Spell(look, spec)) return Chunk3Fx.shakeOf(chunk3Key(look, spec), lt, spec || {});
  if (C1_LOOKS[look]) {
    if (look === "witch-bolt" && spec && spec.pulse) return { x: 0, y: 0 };
    return Chunk1Fx.shakeOf(look, lt);
  }
  if (C2_LOOKS[look]) return Chunk2Fx.shakeOf(look, lt);
  if (look === "thundercube") return blastShake(lt, 8, 760);
  if (look === "fireball") return blastShake(lt - LOOK_TIME.fireball.grow, 11, 1000);
  if (look === "firecone") return blastShake(lt, 4, 420);
  if (look === "shatter") return blastShake(lt - LOOK_TIME.shatter.grow, 7, 650);
  if (look === "hailstorm") return blastShake(lt - LOOK_TIME.hailstorm.grow, 6, 420);
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
  var puff = rng((seed || 4) + 9);
  var i;
  for (i = 0; i < 64; i++) {
    var rim = i % 5 === 0;
    var ang = puff() * Math.PI * 2 + Math.sin(boom * 0.015 + i * 1.1) * 0.7;
    var rad = R * (rim ? 0.1 + puff() * 0.1 : 0.18 + puff() * 0.16);
    var dist = rim ? R * (0.78 + puff() * 0.18) : Math.pow(puff(), 0.72) * R * 0.72;
    var flick = 0.7 + 0.3 * Math.sin(boom * 0.023 + i * 0.8);
    var hot = !rim && dist < R * 0.22;
    var px = B.x + Math.cos(ang) * dist, py = B.y + Math.sin(ang) * dist;
    softDisc(ctx, px, py, rad * (0.85 + 0.25 * flick), hot ? [
      [0, "rgba(255,236,190," + (0.85 * f * flick) + ")"],
      [0.45, "rgba(255,140,45," + (0.45 * f * flick) + ")"],
      [1, "rgba(200,60,15,0)"]
    ] : [
      [0, "rgba(" + (puff() < 0.45 ? "255,140,45" : "200,60,15") + "," + (0.92 * f * flick) + ")"],
      [0.5, "rgba(120,28,6," + (0.55 * f * flick) + ")"],
      [1, "rgba(40,10,3,0)"]
    ], "source-over");
  }
  for (i = 0; i < 18; i++) {
    var sang = puff() * Math.PI * 2;
    var soff = Math.pow(puff(), 0.5) * R * 0.55;
    softDisc(ctx, B.x + Math.cos(sang) * soff, B.y + Math.sin(sang) * soff, R * (0.08 + puff() * 0.1), [
      [0, "rgba(28,12,6," + (0.55 * f) + ")"],
      [1, "rgba(20,8,4,0)"]
    ], "source-over");
  }
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = rgba("255,140,45", 0.9 * f);
  ctx.beginPath();
  ctx.arc(B.x, B.y, Math.max(6, R * 0.05), 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = rgba("255,225,160", 0.35 * f);
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  for (i = 0; i < 16; i++) {
    var tick = puff() * Math.PI * 2;
    var td = R * (0.9 + puff() * 0.08);
    var jx = Math.cos(tick), jy = Math.sin(tick);
    ctx.beginPath();
    ctx.moveTo(B.x + jx * td, B.y + jy * td);
    ctx.lineTo(B.x + jx * td * 0.94 + -jy * R * 0.03, B.y + jy * td * 0.94 + jx * R * 0.03);
    ctx.stroke();
  }
  var coreR = Math.max(8, R * 0.14);
  ctx.fillStyle = stops(grad(ctx, "r", B.x, B.y, 0, B.x, B.y, coreR), [
    [0, "rgba(255,252,236," + 0.95 * core + ")"],
    [0.45, "rgba(255,225,160," + 0.7 * core + ")"],
    [1, "rgba(255,125,35,0)"]
  ]) || rgba("255,236,190", 0.9 * core);
  ctx.beginPath();
  ctx.arc(B.x, B.y, coreR, 0, Math.PI * 2);
  ctx.fill();
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
  /* A point on the caster used to fall through to the short thunder ring and the 10-ft
     glass burst never drew. The wedge needs a throw. The burst still belongs on the point. */
  var close = d.d < 16;
  var ang = Math.atan2(d.y, d.x), half = 0.28, len = d.d;
  var R = cell * 2;                                    /* 10-ft radius at the point */
  var grow = easeOut(Math.min(1, lt / time.grow));
  var end = time.grow + time.hold;
  var f = lt < end ? 1 : 1 - clamp((lt - end) / time.fade);
  var bt = lt - time.grow;                             /* time since the wave reached the point */
  var i, k;
  /* wedge body: dust-brown fill growing from the caster with a pale rim */
  var wf = close ? 0 : f * (1 - clamp((lt - end) / 500));
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
  /* Chunk 2 Phase 1 Love-it outlines. Shape + clear effect. Thorn dust-drag and the coil burst
     are in the painter. Hunter's Mark hop, Shocking Grasp's metal-armor flare, and the Flaming Sphere ram stay out.
     Ground scorch shares this overlay (above tokens), same as Chunk 1. */
  var Chunk2Fx = (function () {
  var TAU = Math.PI * 2;
  var PAL = {
    lightning: { glow: "85,120,240", core: "232,236,255", hot: "255,255,255" },
    fire: { glow: "200,60,15", core: "255,125,35", hot: "255,225,160", burst: "255,140,45", ball: "255,242,205" },
    forge: { white: "255,245,220", orange: "255,150,50" },
    cold: { glow: "80,125,185", core: "200,225,250", hot: "250,252,255", mist: "150,185,225" },
    radiant: { glow: "230,175,70", core: "255,232,170", hot: "255,250,230" },
    necrotic: { glow: "95,45,100", black: "6,3,8", bone: "185,170,180", ash: "120,112,118", hex: "170,90,190" },
    thorn: { vine: "90,95,45", tip: "150,110,70", dark: "40,38,18", splinter: "200,160,110" },
    siphon: { ribbon: "225,70,80", drop: "170,20,35", heal: "255,150,160" },
    enfeeble: { glow: "120,95,120", core: "190,178,190", mote: "150,145,150" }
  };
  function clamp(v, a, b) { a = a === undefined ? 0 : a; b = b === undefined ? 1 : b; return Math.max(a, Math.min(b, v)); }
  function rgba(c, a) { return "rgba(" + c + "," + clamp(a) + ")"; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function lp(A, B, t) { return { x: lerp(A.x, B.x, t), y: lerp(A.y, B.y, t) }; }
  function easeOut(t) { return 1 - Math.pow(1 - clamp(t), 3); }
  function easeInOut(t) { t = clamp(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
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
  function partial(pts, p) { if (p >= 1) return pts; var n = pts.length - 1, f = p * n, k = Math.floor(f), out = pts.slice(0, k + 1); if (k < n) out.push(lp(pts[k], pts[k + 1], f - k)); return out; }
  function poly(ctx, pts) { if (!pts || !pts.length) return; ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y); }
  function stroke(ctx, pts, w, col, blur, blurCol) { if (!pts || pts.length < 2) return; ctx.save(); ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.lineWidth = w; ctx.strokeStyle = col; if (blur) { ctx.shadowBlur = blur; ctx.shadowColor = blurCol || col; } poly(ctx, pts); ctx.stroke(); ctx.restore(); }
  function glow(ctx, x, y, r, stops) { if (r <= 0.5) return; var g = ctx.createRadialGradient(x, y, 0, x, y, r); for (var i = 0; i < stops.length; i++) g.addColorStop(stops[i][0], stops[i][1]); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
  function add(ctx, fn) { ctx.save(); ctx.globalCompositeOperation = "lighter"; fn(); ctx.restore(); }
  function ring(ctx, x, y, r, w, col, blur) { if (r <= 0) return; ctx.save(); ctx.lineWidth = w; ctx.strokeStyle = col; if (blur) { ctx.shadowBlur = blur; ctx.shadowColor = col; } ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke(); ctx.restore(); }
  function bolt(ctx, pts, a, thick) { var k = thick || 1; add(ctx, function () { stroke(ctx, pts, 14 * k, rgba(PAL.lightning.glow, 0.28 * a), 18, rgba(PAL.lightning.glow, a)); stroke(ctx, pts, 5 * k, rgba(PAL.lightning.glow, 0.75 * a)); stroke(ctx, pts, 2.2 * k, rgba(PAL.lightning.core, a)); stroke(ctx, pts, 0.9 * k, rgba(PAL.lightning.hot, a)); }); }
  function sparks(ctx, x, y, t, n, seed, speed, life, col, size, grav) {
    if (t < 0 || t > life) return; var r = rng(seed), u = t / life;
    add(ctx, function () { for (var i = 0; i < n; i++) { var a = r() * TAU, v = speed * (0.4 + r() * 0.8), d = v * (1 - Math.pow(1 - u, 2)) * life / 1000 * 0.6; ctx.fillStyle = rgba(col, (1 - u) * (0.6 + r() * 0.4)); ctx.beginPath(); ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d + (grav || 0) * u * u, size * (1 - u * 0.5), 0, TAU); ctx.fill(); } });
  }
  function pulse(ctx, A, B, t, dur, col, hot) {
    if (!A || !B || t < 0 || t > dur + 220) return; var p = easeOut(clamp(t / dur)), a = 1 - clamp((t - dur) / 220);
    var H = lp(A, B, p), Tl = lp(A, B, Math.max(0, p - 0.45));
    add(ctx, function () { stroke(ctx, [Tl, H], 5, rgba(col, 0.35 * a), 10); stroke(ctx, [Tl, H], 1.4, rgba(hot, 0.9 * a)); if (p < 1) glow(ctx, H.x, H.y, 9, [[0, rgba(hot, a)], [1, rgba(col, 0)]]); });
  }
  function tongue(ctx, w, h, fill) { ctx.beginPath(); ctx.moveTo(-w, 0); ctx.quadraticCurveTo(-w * 0.4, -h * 0.6, 0, -h); ctx.quadraticCurveTo(w * 0.4, -h * 0.6, w, 0); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); }
  function flameRing(ctx, x, y, R, n, lt, a, h0, seed) {
    for (var i = 0; i < n; i++) { var an = i / n * TAU + lt / 2200, h = h0 * (0.55 + 0.45 * (0.5 + 0.5 * Math.sin(lt / 85 + i * 2.3 + seed))); ctx.save(); ctx.translate(x + Math.cos(an) * R, y + Math.sin(an) * R); ctx.rotate(an + Math.PI / 2); tongue(ctx, 4.2, h, rgba(PAL.fire.core, 0.7 * a)); tongue(ctx, 2, h * 0.6, rgba(PAL.fire.hot, 0.8 * a)); ctx.restore(); }
  }
  function fireBurst(ctx, B, t, life, R, seed) {
    if (!B || t < 0 || t > life) return; var u = t / life;
    add(ctx, function () { glow(ctx, B.x, B.y, R * (0.55 + 0.45 * easeOut(clamp(t / 140))), [[0, rgba(PAL.fire.ball, 0.95 * (1 - u))], [0.3, rgba(PAL.fire.core, 0.8 * (1 - u))], [0.7, rgba(PAL.fire.glow, 0.45 * (1 - u))], [1, rgba(PAL.fire.glow, 0)]]); flameRing(ctx, B.x, B.y, R * 0.55 * (0.7 + 0.3 * easeOut(u)), 12, t, 1 - u, R * 0.45, seed); });
    sparks(ctx, B.x, B.y, t, 18, seed, 160, life, PAL.fire.burst, 1.6, -18);
  }
  function scorchRing(ctx, B, R, a) {
    if (!B || a <= 0) return; ctx.save(); ctx.fillStyle = "rgba(14,8,4," + (0.55 * a) + ")"; ctx.beginPath(); ctx.arc(B.x, B.y + 3, R, 0, TAU); ctx.arc(B.x, B.y + 3, R * 0.62, 0, TAU, true); ctx.fill("evenodd"); ctx.strokeStyle = "rgba(90,40,10," + (0.6 * a) + ")"; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(B.x, B.y + 3, R * 0.98, 0, TAU); ctx.stroke(); ctx.restore();
  }
  function star(ctx, x, y, r, n, inner, fill, a, rot, blurCol) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot || 0); ctx.beginPath();
    for (var i = 0; i < n * 2; i++) { var rr = i % 2 ? r * inner : r, an = i / (n * 2) * TAU - Math.PI / 2; ctx.lineTo(Math.cos(an) * rr, Math.sin(an) * rr); }
    ctx.closePath(); ctx.fillStyle = rgba(fill, a); if (blurCol) { ctx.shadowBlur = 10; ctx.shadowColor = rgba(blurCol, a); } ctx.fill(); ctx.restore();
  }
  function hand(ctx, x, y, s, a, rot) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot || -0.2); var k = s / 20; ctx.beginPath(); ctx.ellipse(0, 4 * k, 7.5 * k, 8 * k, 0, 0, TAU);
    [[-6, -9, 9], [-2, -12, 11], [2.2, -12, 11], [6, -9, 9]].forEach(function (f) { ctx.moveTo(f[0] * k + 1.7 * k, f[1] * k); ctx.ellipse(f[0] * k, f[1] * k + f[2] * k * 0.2, 1.7 * k, f[2] * k * 0.55, 0, 0, TAU); });
    ctx.moveTo(-6 * k, 6 * k); ctx.ellipse(-10 * k, 1 * k, 1.8 * k, 5 * k, -0.9, 0, TAU);
    ctx.shadowBlur = 12; ctx.shadowColor = rgba(PAL.necrotic.glow, a); ctx.fillStyle = rgba(PAL.necrotic.bone, 0.3 * a); ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = rgba("230,220,235", 0.9 * a); ctx.stroke(); ctx.restore();
  }
  function meleeSlash(ctx, B, t, r, ang) {
    if (!B || t < 0 || t > 260) return; var a = 1 - t / 260, p = clamp(t / 80), pts = [];
    for (var i = 0; i <= 12; i++) { var u = i / 12 * p, an = ang - 0.9 + u * 1.8; pts.push({ x: B.x + Math.cos(an) * r, y: B.y + Math.sin(an) * r }); }
    stroke(ctx, pts, 3, "rgba(255,245,225," + (0.9 * a) + ")", 6);
  }
  function targetOf(G) { return (G && G.T && G.T[0]) || null; }

  var HX = { pulse: 120, flare: 1500 };
  function hexMark(ctx, B, rT, lt, a, fl) {
    if (!B || a <= 0) return;
    var R = rT + 8, rot = lt / 2600, br = 0.55 + 0.15 * Math.sin(lt / 320) + 0.45 * fl, r = rng(9);
    for (var k = 0; k < 7; k++) { var an = r() * TAU, age = ((lt / 1300 + r()) % 1); glow(ctx, B.x + Math.cos(an) * R * 0.9, B.y + Math.sin(an) * R * 0.9 - age * 14, 7 + age * 6, [[0, rgba(PAL.necrotic.black, 0.4 * a * (1 - age))], [1, rgba(PAL.necrotic.black, 0)]]); }
    add(ctx, function () {
      glow(ctx, B.x, B.y, R + 10, [[0.55, rgba(PAL.necrotic.glow, 0)], [0.82, rgba(PAL.necrotic.glow, 0.5 * a * br)], [1, rgba(PAL.necrotic.glow, 0)]]);
      ctx.save(); ctx.translate(B.x, B.y); ctx.rotate(rot); ctx.beginPath();
      for (var i = 0; i <= 6; i++) { var an2 = i / 6 * TAU; ctx.lineTo(Math.cos(an2) * R, Math.sin(an2) * R); }
      ctx.lineWidth = 2.2; ctx.strokeStyle = rgba(PAL.necrotic.hex, 0.9 * a * br); ctx.shadowBlur = 10; ctx.shadowColor = rgba(PAL.necrotic.hex, a); ctx.stroke();
      ctx.lineWidth = 1; ctx.strokeStyle = rgba(PAL.necrotic.bone, 0.45 * a * br);
      for (var t2 = 0; t2 < 2; t2++) { ctx.beginPath(); for (var j = 0; j <= 3; j++) { var an3 = j / 3 * TAU + t2 * Math.PI / 3; ctx.lineTo(Math.cos(an3) * R * 0.97, Math.sin(an3) * R * 0.97); } ctx.stroke(); }
      ctx.lineWidth = 1.6; ctx.strokeStyle = rgba(PAL.necrotic.bone, 0.85 * a * br);
      for (var g = 0; g < 6; g++) { var ag = g / 6 * TAU, cx = Math.cos(ag) * (R + 6), cy = Math.sin(ag) * (R + 6); ctx.save(); ctx.translate(cx, cy); ctx.rotate(ag); ctx.beginPath(); ctx.moveTo(-3, -3); ctx.lineTo(0, 3); ctx.lineTo(3, -3); if (g % 2) { ctx.moveTo(0, 3); ctx.lineTo(0, -4); } ctx.stroke(); ctx.restore(); }
      ctx.restore();
    });
  }
  function hexFlare(ctx, B, rT, lt, cell, fl) {
    if (!B || fl <= 0) return;
    add(ctx, function () { var u = clamp(lt / 600); ring(ctx, B.x, B.y, rT + 8 + easeOut(u) * cell * 0.6, 2.5 * (1 - u), rgba(PAL.necrotic.hex, 1 - u), 10); glow(ctx, B.x, B.y, cell * 0.8, [[0, rgba(PAL.necrotic.hex, 0.45 * fl)], [1, rgba(PAL.necrotic.glow, 0)]]); });
  }
  function hex(ctx, lt, G) {
    var A = G.A, B = targetOf(G), rT = G.rT; if (!B) return;
    if (G.pulse) { var flp = env(lt, 0, 60, 160, 600); hexMark(ctx, B, rT, 800 + lt, 1, flp); hexFlare(ctx, B, rT, lt, G.cell, flp); return; }
    if (G.quiet) { hexMark(ctx, B, rT, lt, 1, 0); return; }
    pulse(ctx, A, B, lt, HX.pulse, PAL.necrotic.hex, PAL.necrotic.bone);
    var a = clamp((lt - HX.pulse) / 280), fl = env(lt, HX.flare, HX.flare + 60, HX.flare + 160, HX.flare + 600);
    if (lt > HX.pulse - 10 && lt < HX.pulse + 380) { var u = (lt - HX.pulse) / 380; add(ctx, function () { ring(ctx, B.x, B.y, lerp(G.cell * 1.1, rT + 8, easeOut(u)), 3 * (1 - u) + 1, rgba(PAL.necrotic.hex, 1 - u * 0.5), 12); }); }
    if (a > 0) hexMark(ctx, B, rT, lt, a, fl);
    hexFlare(ctx, B, rT, lt - HX.flare, G.cell, fl);
  }
  var BR = { pulse: 120, flare: 1100 };
  function hmMark(ctx, B, rT, lt, a, fl) {
    if (!B || a <= 0) return;
    var br = 0.5 + 0.12 * Math.sin(lt / 280) + 0.5 * fl;
    add(ctx, function () {
      ring(ctx, B.x, B.y, rT + 7, 1.6, rgba(PAL.radiant.core, 0.55 * a * br), 8);
      ctx.save(); ctx.translate(B.x, B.y); ctx.rotate(-lt / 3000); ctx.strokeStyle = rgba(PAL.radiant.hot, 0.6 * a * br); ctx.lineWidth = 1.4;
      for (var i = 0; i < 8; i++) { var an = i / 8 * TAU; ctx.beginPath(); ctx.arc(0, 0, rT + 7, an + 0.12, an + 0.42); ctx.stroke(); ctx.beginPath(); ctx.moveTo(Math.cos(an) * (rT + 4), Math.sin(an) * (rT + 4)); ctx.lineTo(Math.cos(an) * (rT + 10), Math.sin(an) * (rT + 10)); ctx.stroke(); }
      ctx.restore();
      glow(ctx, B.x, B.y, rT * 0.9, [[0, rgba(PAL.radiant.core, 0.35 * a * br)], [1, rgba(PAL.radiant.glow, 0)]]);
      star(ctx, B.x, B.y, rT * 0.62, 4, 0.22, PAL.radiant.hot, 0.55 * a * br, Math.PI / 4, PAL.radiant.glow);
      star(ctx, B.x, B.y, rT * 0.42, 4, 0.22, PAL.radiant.core, 0.5 * a * br, 0, PAL.radiant.glow);
      var r = rng(Math.floor(lt / 90));
      for (var k = 0; k < 4; k++) { var an3 = r() * TAU, rr = rT * (0.3 + r() * 0.8); ctx.fillStyle = rgba(PAL.radiant.hot, 0.8 * a * br); ctx.fillRect(B.x + Math.cos(an3) * rr, B.y + Math.sin(an3) * rr, 1.6, 1.6); }
    });
  }
  function brand(ctx, lt, G) {
    var A = G.A, B = targetOf(G), rT = G.rT; if (!B) return;
    if (G.pulse) { var flp = env(lt, 0, 60, 160, 600); hmMark(ctx, B, rT, 600 + lt, 1, flp); sparks(ctx, B.x, B.y, lt, 14, 62, 130, 500, PAL.radiant.hot, 1.5, 0); add(ctx, function () { var u = clamp(lt / 600); ring(ctx, B.x, B.y, rT + 7 + easeOut(u) * G.cell * 0.6, 2.5 * (1 - u), rgba(PAL.radiant.core, 1 - u), 10); }); return; }
    if (G.quiet) { hmMark(ctx, B, rT, lt, 1, 0); return; }
    pulse(ctx, A, B, lt, BR.pulse, PAL.radiant.glow, PAL.radiant.hot);
    var a = clamp((lt - BR.pulse) / 280), fl = env(lt, BR.flare, BR.flare + 60, BR.flare + 160, BR.flare + 600);
    if (lt > BR.pulse && lt < BR.pulse + 380) { var u2 = (lt - BR.pulse) / 380; add(ctx, function () { glow(ctx, B.x, B.y, G.cell * (0.6 + 0.5 * u2), [[0, rgba(PAL.radiant.hot, 0.8 * (1 - u2))], [1, rgba(PAL.radiant.glow, 0)]]); }); sparks(ctx, B.x, B.y, lt - BR.pulse, 12, 61, 110, 380, PAL.radiant.core, 1.4, 0); }
    if (a > 0) hmMark(ctx, B, rT, lt, a, fl);
    if (fl > 0) { sparks(ctx, B.x, B.y, lt - BR.flare, 14, 62, 130, 500, PAL.radiant.hot, 1.5, 0); add(ctx, function () { var u3 = clamp((lt - BR.flare) / 600); ring(ctx, B.x, B.y, rT + 7 + easeOut(u3) * G.cell * 0.6, 2.5 * (1 - u3), rgba(PAL.radiant.core, 1 - u3), 10); }); }
  }

  var SG = { spark: 70, hold: 260, fade: 480, cageEnd: 2600 };
  function sparkCage(ctx, B, rT, lt, cage) {
    if (!B || cage <= 0) return;
    var cb = Math.floor(lt / 70), rr = rT + 6;
    add(ctx, function () {
      ring(ctx, B.x, B.y, rr, 1.8, rgba(PAL.lightning.glow, 0.8 * cage), 10);
      var r = rng(cb * 13 + 5);
      for (var k = 0; k < 7; k++) {
        var a0 = r() * TAU, a1 = a0 + 0.4 + r() * 0.5, arc = [];
        for (var j = 0; j <= 6; j++) { var aa = lerp(a0, a1, j / 6), rad = rr + (j % 2 ? 1 : -1) * (2 + r() * 3); arc.push({ x: B.x + Math.cos(aa) * rad, y: B.y + Math.sin(aa) * rad }); }
        stroke(ctx, arc, 1.6, rgba(k % 2 ? PAL.lightning.glow : PAL.lightning.core, 0.95 * cage), 6);
      }
      for (var s = 0; s < 4; s++) { var an = s / 4 * TAU + Math.PI / 4; ctx.strokeStyle = rgba(PAL.lightning.core, 0.6 * cage); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(B.x + Math.cos(an) * (rr - 5), B.y + Math.sin(an) * (rr - 5)); ctx.lineTo(B.x + Math.cos(an) * (rr + 5), B.y + Math.sin(an) * (rr + 5)); ctx.stroke(); }
    });
  }
  function shocking(ctx, lt, G) {
    var A = G.A, B = targetOf(G), rT = G.rT; if (!B) return;
    if (G.quiet) { sparkCage(ctx, B, rT, lt, 0.85); return; }
    var Bi = edge(B, A, rT * 0.4);
    var a = 1 - clamp((lt - SG.hold) / (SG.fade - SG.hold));
    if (a > 0 && A) {
      var bk = Math.floor(lt / 45), pts = jag(A, Bi, 6, 6, 21 + bk);
      bolt(ctx, partial(pts, clamp(lt / SG.spark)), a * (0.75 + 0.25 * rng(bk)()), 0.9);
      if (lt > SG.spark) for (var f = 0; f < 2; f++) { var r = rng(bk * 3 + f), P = pts[2 + f * 2], an = Math.atan2(Bi.y - A.y, Bi.x - A.x) + (f ? 1 : -1) * (0.7 + r() * 0.5); bolt(ctx, jag(P, { x: P.x + Math.cos(an) * 12, y: P.y + Math.sin(an) * 12 }, 3, 3, bk + f * 7), a * 0.6, 0.4); }
      add(ctx, function () { glow(ctx, A.x, A.y, 12, [[0, rgba(PAL.lightning.hot, 0.8 * a)], [1, rgba(PAL.lightning.glow, 0)]]); });
    }
    var th = lt - SG.spark;
    if (th >= 0 && th < 360) {
      var u = th / 360;
      add(ctx, function () { glow(ctx, B.x, B.y, G.cell * (0.7 + 0.4 * u), [[0, rgba(PAL.lightning.hot, 1 * (1 - u))], [0.4, rgba(PAL.lightning.core, 0.55 * (1 - u))], [1, rgba(PAL.lightning.glow, 0)]]); ring(ctx, B.x, B.y, rT + 3 + easeOut(u) * G.cell * 0.5, 3 * (1 - u) + 0.5, rgba(PAL.lightning.core, 1 - u), 10); });
      sparks(ctx, B.x, B.y, th, 14, 33, 150, 360, PAL.lightning.core, 1.4, 0);
    }
    var cage = env(lt, SG.spark + 60, SG.spark + 260, SG.cageEnd, SG.cageEnd + 300);
    sparkCage(ctx, B, rT, lt, cage);
  }

  var TW = { shoot: 220, coil: 420, y0: 450, y1: 760, back0: 820, back1: 1080, ghost: 1500 };
  function yankP(lt) { return easeInOut((lt - TW.y0) / (TW.y1 - TW.y0)); }
  function vinePts(A, B, lt, prog) {
    var n = norm(A, B), px = -n.y, py = n.x, L = dist(A, B), s1 = [], s2 = [];
    for (var i = 0; i <= 50; i++) { var u = i / 50; if (u > prog) break; var o = Math.sin(u * L / 9 + lt / 60) * 3.2; var base = { x: A.x + n.x * u * L, y: A.y + n.y * u * L }; s1.push({ x: base.x + px * o, y: base.y + py * o }); s2.push({ x: base.x - px * o, y: base.y - py * o }); }
    return [s1, s2];
  }
  function thorn(ctx, lt, G) {
    var A = G.A, live = targetOf(G), rT = G.rT; if (!A || !live) return;
    var slide = tokenState("thorn", lt, "target", G);
    var B = { x: live.x + slide.dx, y: live.y + slide.dy };
    var B0 = G.ghost || live;
    var gh = G.yank ? env(lt, TW.y0, TW.y0 + 80, TW.y1, TW.ghost) : 0;
    if (gh > 0) { ctx.save(); ctx.setLineDash([4, 4]); ring(ctx, B0.x, B0.y, rT, 1.6, "rgba(232,220,200," + (0.6 * gh) + ")"); ctx.restore(); glow(ctx, B0.x, B0.y, rT, [[0, "rgba(232,220,200," + (0.12 * gh) + ")"], [1, "rgba(232,220,200,0)"]]); }
    var prog = easeOut(clamp(lt / TW.shoot)), back = clamp((lt - TW.back0) / (TW.back1 - TW.back0));
    var tip = back > 0 ? lp(B, A, easeInOut(back)) : B;
    if (back < 1) {
      var vs = vinePts(A, tip, lt, back > 0 ? 1 : prog);
      stroke(ctx, vs[0], 4.5, rgba(PAL.thorn.dark, 0.95)); stroke(ctx, vs[1], 4.5, rgba(PAL.thorn.dark, 0.95));
      stroke(ctx, vs[0], 2.4, rgba(PAL.thorn.vine, 1)); stroke(ctx, vs[1], 2.4, rgba("120,120,60", 1));
      var pts = vs[0], n = norm(A, tip);
      for (var k = 2; k < pts.length - 1; k += 3) { var P = pts[k], sd = k % 2 ? 1 : -1, bx = -n.y * sd, by = n.x * sd; ctx.beginPath(); ctx.moveTo(P.x - n.x * 2.5, P.y - n.y * 2.5); ctx.lineTo(P.x + bx * 6 - n.x * 3, P.y + by * 6 - n.y * 3); ctx.lineTo(P.x + n.x * 2.5, P.y + n.y * 2.5); ctx.closePath(); ctx.fillStyle = rgba(PAL.thorn.tip, 1); ctx.fill(); }
      add(ctx, function () { stroke(ctx, vs[0], 8, rgba(PAL.thorn.vine, 0.18), 6); });
    }
    var ca = env(lt, TW.shoot, TW.shoot + 80, TW.back0, TW.back0 + 120);
    if (ca > 0) {
      var tight = easeOut(clamp((lt - TW.shoot) / (TW.coil - TW.shoot))), R = lerp(rT + 14, rT + 4, tight), c = [];
      for (var i = 0; i <= 80; i++) { var an = i / 80 * TAU * 1.6 + Math.atan2(A.y - B.y, A.x - B.x), rr = R + Math.sin(i / 80 * TAU * 5) * 2.5; c.push({ x: B.x + Math.cos(an) * rr, y: B.y + Math.sin(an) * rr }); }
      c = partial(c, clamp((lt - TW.shoot) / 160));
      ctx.save(); ctx.globalAlpha = ca; stroke(ctx, c, 4.5, rgba(PAL.thorn.dark, 0.95)); stroke(ctx, c, 2.4, rgba(PAL.thorn.vine, 1));
      for (var q = 3; q < c.length; q += 6) { var Q = c[q], o = norm(B, Q); ctx.beginPath(); ctx.moveTo(Q.x - o.y * 2.5, Q.y + o.x * 2.5); ctx.lineTo(Q.x + o.x * 6, Q.y + o.y * 6); ctx.lineTo(Q.x + o.y * 2.5, Q.y - o.x * 2.5); ctx.closePath(); ctx.fillStyle = rgba(PAL.thorn.tip, 1); ctx.fill(); }
      ctx.restore();
    }
    if (lt > 80 && lt < TW.back1) gritBurst(ctx, B.x, B.y, lt - 80, 700, 16, 73, G.cell * 0.65);
    if (G.yank && lt > TW.y0) {
      var drag = lp(B0, A, yankP(lt));
      gritBurst(ctx, drag.x, drag.y, lt - TW.y0, 480, 12, 74, G.cell * 0.4);
    }
    var th = lt - TW.shoot;
    if (th >= 0 && th < 380) {
      var u = th / 380, r = rng(73);
      for (var s = 0; s < 12; s++) { var an2 = r() * TAU, d0 = rT * 0.6, d1 = d0 + easeOut(u) * G.cell * (0.5 + r() * 0.4); stroke(ctx, [{ x: B.x + Math.cos(an2) * d0, y: B.y + Math.sin(an2) * d0 }, { x: B.x + Math.cos(an2) * d1, y: B.y + Math.sin(an2) * d1 }], 1.8, rgba(PAL.thorn.splinter, 1 - u)); }
      add(ctx, function () { glow(ctx, B.x, B.y, G.cell * 0.7, [[0, "rgba(200,90,60," + (0.5 * (1 - u)) + ")"], [1, "rgba(120,40,20,0)"]]); });
    }
    var ya = G.yank ? env(lt, TW.y0 - 40, TW.y0 + 40, TW.y1, TW.y1 + 200) : 0;
    if (ya > 0) {
      var nn = norm(B, A);
      for (var c2 = 0; c2 < 3; c2++) { var off = rT + 10 + c2 * 11 + ((lt / 12) % 11), Cp = { x: B.x + nn.x * off, y: B.y + nn.y * off }, px = -nn.y, py = nn.x; stroke(ctx, [{ x: Cp.x - nn.x * 5 + px * 6, y: Cp.y - nn.y * 5 + py * 6 }, Cp, { x: Cp.x - nn.x * 5 - px * 6, y: Cp.y - nn.y * 5 - py * 6 }], 2.4, "rgba(240,225,190," + (0.85 * ya * (1 - c2 * 0.25)) + ")", 4, "rgba(0,0,0,0.8)"); }
    }
  }

  var HR = { hit: 0, flick: 280, bloom: 400 };
  function rebukeUnder(ctx, lt, G) { var B = targetOf(G); if (!B) return; var a = env(lt, HR.bloom + 80, HR.bloom + 260, HR.bloom + 900, HR.bloom + 1500); scorchRing(ctx, B, G.rT + 10, a); }
  function rebuke(ctx, lt, G) {
    var S = G.S || G.A, B = targetOf(G), rT = G.rT; if (!B) return;
    if (S) meleeSlash(ctx, S, lt - HR.hit, (G.rS || rT) + 2, Math.atan2(B.y - S.y, B.x - S.x));
    var tf = lt - HR.flick;
    if (S && tf >= 0 && tf < 160) { var E0 = edge(S, B, (G.rS || 18) + 2), E1 = edge(B, S, rT), p = easeOut(tf / 120), P = lp(E0, E1, Math.min(p, 1)); add(ctx, function () { glow(ctx, E0.x, E0.y, 10, [[0, rgba(PAL.fire.hot, 0.9 * (1 - tf / 160))], [1, rgba(PAL.fire.glow, 0)]]); glow(ctx, P.x, P.y, 6, [[0, rgba(PAL.fire.ball, 1)], [1, rgba(PAL.fire.core, 0)]]); }); }
    fireBurst(ctx, B, lt - HR.bloom, 900, G.cell * 1.15, 44);
    var tb = lt - HR.bloom; if (tb >= 0 && tb < 500) add(ctx, function () { var u = tb / 500; ring(ctx, B.x, B.y, rT + easeOut(u) * G.cell * 0.8, 3 * (1 - u) + 0.5, rgba(PAL.fire.hot, 1 - u), 10); });
  }

  function saber(ctx, S, rS, ang, len, a, lt) {
    var H = { x: S.x + Math.cos(ang) * (rS - 2), y: S.y + Math.sin(ang) * (rS - 2) }, n = { x: Math.cos(ang), y: Math.sin(ang) }, px = -n.y, py = n.x, pts = [];
    for (var i = 0; i <= 14; i++) { var u = i / 14, curve = Math.sin(u * Math.PI * 0.5) * len * 0.12 * u; pts.push({ x: H.x + n.x * u * len + px * curve, y: H.y + n.y * u * len + py * curve }); }
    var fl = 0.85 + 0.15 * Math.sin(lt / 37);
    add(ctx, function () {
      stroke(ctx, pts, 12 * fl, rgba(PAL.fire.glow, 0.4 * a), 16, rgba(PAL.fire.glow, a));
      stroke(ctx, pts, 5, rgba(PAL.fire.core, 0.95 * a)); stroke(ctx, pts, 1.8, rgba(PAL.fire.ball, a));
      glow(ctx, H.x, H.y, 9, [[0, rgba(PAL.fire.hot, 0.9 * a)], [1, rgba(PAL.fire.glow, 0)]]);
      var r = rng(Math.floor(lt / 70));
      for (var k = 0; k < 5; k++) { var q = pts[3 + Math.floor(r() * 10)]; if (!q) continue; glow(ctx, q.x - px * 3, q.y - py * 3, 4 + r() * 4, [[0, rgba(PAL.fire.core, 0.6 * a)], [1, rgba(PAL.fire.glow, 0)]]); }
    });
    ctx.save(); ctx.strokeStyle = "rgba(40,24,12," + a + ")"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(H.x + px * 5, H.y + py * 5); ctx.lineTo(H.x - px * 5, H.y - py * 5); ctx.stroke(); ctx.restore();
  }
  function bladeUnder(ctx, lt, G) {
    if (!G.swing) return; var B = targetOf(G), S = G.S; if (!B || !S) return;
    var a = env(lt, 160, 280, 700, 1100); if (a <= 0) return;
    ctx.save(); ctx.strokeStyle = "rgba(14,8,4," + (0.55 * a) + ")"; ctx.lineWidth = 5; ctx.lineCap = "round"; ctx.beginPath();
    var aS = Math.atan2(B.y - S.y, B.x - S.x);
    ctx.arc(B.x - Math.cos(aS) * G.cell * 0.5, B.y - Math.sin(aS) * G.cell * 0.5, G.cell * 0.62, aS - 0.75, aS + 0.75); ctx.stroke(); ctx.restore();
  }
  function flameBlade(ctx, lt, G) {
    var S = G.S || G.A, B = targetOf(G) || S; if (!S) return;
    var rS = G.rS || 18, base = -0.55, a = G.quiet ? 0.75 : 1;
    if (!G.swing) {
      var ign = G.quiet ? 1 : clamp(lt / 380), len = G.cell * 0.95 * easeOut(ign);
      if (!G.quiet && lt < 560) add(ctx, function () { var u = clamp(lt / 560); ring(ctx, S.x, S.y, rS + 3 + u * 10, 2.5 * (1 - u), rgba(PAL.fire.core, 1 - u), 8); });
      if (len > 1) saber(ctx, S, rS, base, len, a, lt);
      return;
    }
    var toT = Math.atan2(B.y - S.y, B.x - S.x), wind = 70, end = 240, ang;
    if (lt < wind) ang = lerp(base, toT - 1.1, easeOut(lt / wind));
    else if (lt < end) ang = lerp(toT - 1.1, toT + 1.1, easeInOut((lt - wind) / (end - wind)));
    else ang = lerp(toT + 1.1, base, easeOut(clamp((lt - end) / 280)));
    if (lt >= wind && lt < end + 280) {
      var s = easeInOut(clamp((lt - wind) / (end - wind))), fa = 1 - clamp((lt - end) / 280);
      var a0 = toT - 1.1, a1 = lerp(toT - 1.1, toT + 1.1, s), R0 = rS + 4, R1 = rS + G.cell * 0.95;
      add(ctx, function () { ctx.beginPath(); ctx.arc(S.x, S.y, R1, a0, a1); ctx.arc(S.x, S.y, R0 + (R1 - R0) * 0.55, a1, a0, true); ctx.closePath(); ctx.fillStyle = rgba(PAL.fire.core, 0.18 * fa); ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = rgba(PAL.fire.hot, 0.35 * fa); ctx.beginPath(); ctx.arc(S.x, S.y, R1, a0, a1); ctx.stroke(); });
    }
    var ts = lt - (wind + 40);
    if (ts >= 0 && ts < 520) {
      var u = ts / 520, p = clamp(ts / 110), aS = toT, C = { x: B.x - Math.cos(aS) * G.cell * 0.5, y: B.y - Math.sin(aS) * G.cell * 0.5 }, R = G.cell * 0.62, arc = [], inner = [];
      for (var i = 0; i <= 24; i++) { var an = aS - 0.85 + i / 24 * 1.7 * p, th = Math.sin(i / 24 * Math.PI) * 7; arc.push({ x: C.x + Math.cos(an) * R, y: C.y + Math.sin(an) * R }); inner.push({ x: C.x + Math.cos(an) * (R - th), y: C.y + Math.sin(an) * (R - th) }); }
      add(ctx, function () { stroke(ctx, arc, 12, rgba(PAL.fire.glow, 0.5 * (1 - u)), 14, rgba(PAL.fire.glow, 1)); stroke(ctx, arc, 5, rgba(PAL.fire.core, 1 - u)); stroke(ctx, inner, 2, rgba(PAL.fire.ball, 1 - u)); glow(ctx, B.x, B.y, G.cell * 0.7, [[0, rgba(PAL.fire.hot, 0.6 * (1 - u))], [1, rgba(PAL.fire.glow, 0)]]); });
      sparks(ctx, B.x, B.y, ts, 16, 15, 150, 520, PAL.fire.burst, 1.5, -14);
    }
    saber(ctx, S, rS, ang, G.cell * 0.95, 1, lt);
  }

  function garnish(ctx, lt, G) {
    if (lt < 0 || lt > 520) return;
    var C = targetOf(G) || G.S || G.A; if (!C) return;
    var u = lt / 520, r = (G.cell || 70) * 0.5;
    add(ctx, function () { glow(ctx, C.x, C.y, (G.cell || 70) * (0.55 + 0.45 * u), [[0, rgba(PAL.fire.ball, 0.85 * (1 - u))], [0.4, rgba(PAL.fire.core, 0.55 * (1 - u))], [1, rgba(PAL.fire.glow, 0)]]); ring(ctx, C.x, C.y, r + u * (G.cell || 70) * 0.45, 2.2 * (1 - u), rgba(PAL.fire.hot, 1 - u), 8); });
  }

  var HM = { glance: 260, bloom: 300, tick: 2200 };
  function heatGear(ctx, B, rT, lt, ha, br, G) {
    var W0 = { x: B.x + rT * 0.05, y: B.y + rT * 0.95 }, W1 = { x: B.x + rT * 1.25, y: B.y - rT * 0.15 };
    add(ctx, function () {
      glow(ctx, B.x, B.y + rT * 0.35, rT * 1.1, [[0, rgba(PAL.forge.orange, 0.35 * ha * br)], [0.7, rgba(PAL.fire.glow, 0.25 * ha * br)], [1, rgba(PAL.fire.glow, 0)]]);
      ctx.save(); ctx.beginPath(); ctx.arc(B.x, B.y, Math.max(2, rT - 1), 0.15 * Math.PI, 0.85 * Math.PI); ctx.lineWidth = 4; ctx.strokeStyle = rgba(PAL.forge.orange, 0.8 * ha * br); ctx.shadowBlur = 12; ctx.shadowColor = rgba(PAL.fire.core, 1); ctx.stroke();
      ctx.lineWidth = 1.5; ctx.strokeStyle = rgba(PAL.forge.white, 0.9 * ha * br); ctx.stroke(); ctx.restore();
      stroke(ctx, [W0, W1], 9, rgba(PAL.fire.core, 0.45 * ha * br), 14, rgba(PAL.fire.core, 1)); stroke(ctx, [W0, W1], 3.5, rgba(PAL.forge.orange, ha)); stroke(ctx, [W0, W1], 1.4, rgba(PAL.forge.white, ha * Math.min(1, br)));
    });
    var gd = lp(W0, W1, 0.2), nn = norm(W0, W1);
    stroke(ctx, [{ x: gd.x - nn.y * 6, y: gd.y + nn.x * 6 }, { x: gd.x + nn.y * 6, y: gd.y - nn.x * 6 }], 2.5, "rgba(50,30,15," + ha + ")");
    for (var w = 0; w < 4; w++) { var ph = ((lt / 1100) + w / 4) % 1, x0 = B.x + (w - 1.5) * rT * 0.45, y0 = B.y - rT * 0.4 - ph * G.cell * 0.9, pts = []; for (var j = 0; j <= 8; j++) { var v = j / 8; pts.push({ x: x0 + Math.sin(v * TAU + lt / 120 + w) * 3, y: y0 - v * 14 }); } add(ctx, function () { stroke(ctx, pts, 1.5, rgba(PAL.forge.white, 0.35 * ha * Math.sin(Math.PI * ph))); }); }
    var r = rng(3);
    for (var k = 0; k < 6; k++) { var age = ((lt / 1500) + r()) % 1; glow(ctx, W1.x + Math.sin(age * 6 + k) * 4, W1.y - age * 34, 4 + age * 7, [[0, "rgba(40,36,34," + (0.35 * (1 - age) * ha) + ")"], [1, "rgba(40,36,34,0)"]]); }
    return W1;
  }
  function heat(ctx, lt, G) {
    var A = G.A, B = targetOf(G), rT = G.rT; if (!B) return;
    if (G.pulse) { var tkp = env(lt, 0, 60, 160, 650); heatGear(ctx, B, rT, 900 + lt, 1, 0.7 + 0.6 * tkp, G); if (tkp > 0) { var u = clamp(lt / 650); add(ctx, function () { ring(ctx, B.x, B.y, rT + 2 + easeOut(u) * G.cell * 0.55, 3 * (1 - u), rgba(PAL.forge.white, 1 - u), 10); }); sparks(ctx, B.x + rT, B.y, lt, 12, 8, 110, 600, PAL.fire.burst, 1.4, -12); } return; }
    if (!G.quiet) {
      var ga = env(lt, 0, 40, HM.glance + 60, HM.glance + 360);
      if (ga > 0 && A) { var n = Math.max(1, Math.floor(dist(A, B) / 12)), shown = clamp(lt / HM.glance) * n; add(ctx, function () { for (var i = 1; i < shown; i++) { var P = lp(A, B, i / n); glow(ctx, P.x, P.y, 4, [[0, rgba(PAL.fire.hot, 0.9 * ga)], [1, rgba(PAL.fire.glow, 0)]]); } }); }
    }
    var ha = G.quiet ? 1 : clamp((lt - HM.bloom) / 300); if (ha <= 0) return;
    var tk = G.quiet ? 0 : env(lt, HM.tick, HM.tick + 60, HM.tick + 160, HM.tick + 650);
    var fl = G.quiet ? 0 : env(lt, HM.bloom, HM.bloom + 80, HM.bloom + 160, HM.bloom + 600);
    var br = (0.7 + 0.12 * Math.sin(lt / 140)) + 0.6 * tk + 0.4 * fl;
    var W1 = heatGear(ctx, B, rT, lt, ha, br, G);
    if (tk > 0 && W1) { var u2 = clamp((lt - HM.tick) / 650); add(ctx, function () { ring(ctx, B.x, B.y, rT + 2 + easeOut(u2) * G.cell * 0.55, 3 * (1 - u2), rgba(PAL.forge.white, 1 - u2), 10); }); sparks(ctx, W1.x, W1.y, lt - HM.tick, 12, 8, 110, 600, PAL.fire.burst, 1.4, -12); }
  }

  function warmShell(ctx, S, r, lt, a, fl) {
    add(ctx, function () {
      glow(ctx, S.x, S.y, r + 18, [[0.55, rgba(PAL.fire.glow, 0)], [0.8, rgba(PAL.fire.glow, (0.4 + 0.4 * fl) * a)], [1, rgba(PAL.fire.glow, 0)]]);
      ring(ctx, S.x, S.y, r + 6, 2, rgba(PAL.fire.core, (0.6 + 0.4 * fl) * a), 10);
      flameRing(ctx, S.x, S.y, r + 6, 14, lt, (0.55 + 0.45 * fl) * a, 9 + 5 * fl, 1);
    });
  }
  function chillShell(ctx, S, r, lt, a, fl) {
    add(ctx, function () {
      glow(ctx, S.x, S.y, r + 18, [[0.55, rgba(PAL.cold.glow, 0)], [0.8, rgba(PAL.cold.mist, (0.35 + 0.4 * fl) * a)], [1, rgba(PAL.cold.glow, 0)]]);
      ring(ctx, S.x, S.y, r + 6, 2, rgba(PAL.cold.core, (0.6 + 0.4 * fl) * a), 10);
      for (var i = 0; i < 12; i++) { var an = i / 12 * TAU - lt / 3000, R = r + 6 + (i % 2 ? 4 : 1), L = (i % 2 ? 6 : 9) * (1 + 0.35 * fl); ctx.save(); ctx.translate(S.x + Math.cos(an) * R, S.y + Math.sin(an) * R); ctx.rotate(an + Math.PI / 2); ctx.beginPath(); ctx.moveTo(0, -L); ctx.lineTo(2.4, 0); ctx.lineTo(0, L * 0.35); ctx.lineTo(-2.4, 0); ctx.closePath(); ctx.fillStyle = rgba(PAL.cold.hot, (0.65 + 0.35 * fl) * a); ctx.fill(); ctx.restore(); }
    });
  }
  function iceSnap(ctx, S, B, t, G) {
    if (!S || !B || t < 0 || t > 700) return;
    var E0 = edge(S, B, (G.rS || 18) + 6), n = norm(S, B), px = -n.y, py = n.x;
    for (var k = 0; k < 3; k++) { var p = easeOut(clamp((t - k * 25) / 110)), off = (k - 1) * 7, P = lp(E0, edge(B, S, (G.rT || 18) * 0.5), p), a = 1 - clamp((t - 200) / 300); if (a <= 0) continue; ctx.save(); ctx.translate(P.x + px * off, P.y + py * off); ctx.rotate(Math.atan2(n.y, n.x)); add(ctx, function () { glow(ctx, 0, 0, 12, [[0, rgba(PAL.cold.core, 0.6 * a)], [1, rgba(PAL.cold.glow, 0)]]); }); ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(0, 3.5); ctx.lineTo(-8, 0); ctx.lineTo(0, -3.5); ctx.closePath(); ctx.fillStyle = rgba(PAL.cold.hot, a); ctx.fill(); ctx.restore(); }
    var th = t - 110;
    if (th >= 0) { var v = th / 590; add(ctx, function () { glow(ctx, B.x, B.y, G.cell * (0.6 + 0.4 * v), [[0, rgba(PAL.cold.hot, 0.85 * (1 - v))], [0.4, rgba(PAL.cold.core, 0.5 * (1 - v))], [1, rgba(PAL.cold.glow, 0)]]); ctx.strokeStyle = rgba(PAL.cold.core, 1 - v); ctx.lineWidth = 2; for (var s = 0; s < 6; s++) { var an = s / 6 * TAU + 0.3, l = (G.rT || 18) * 0.4 + easeOut(clamp(th / 160)) * G.cell * 0.55; ctx.beginPath(); ctx.moveTo(B.x + Math.cos(an) * (G.rT || 18) * 0.4, B.y + Math.sin(an) * (G.rT || 18) * 0.4); ctx.lineTo(B.x + Math.cos(an) * l, B.y + Math.sin(an) * l); ctx.stroke(); } }); sparks(ctx, B.x, B.y, th, 14, 91, 120, 590, PAL.cold.hot, 1.4, 14); }
  }
  function fireShield(ctx, lt, G) {
    var S = G.S || G.A; if (!S) return;
    var r = G.rS || 18, chill = !!G.chill;
    var settle = G.quiet ? 0.62 : (lt > 700 ? 0.78 : 1);
    var a = (G.quiet ? 1 : easeOut(clamp(lt / 400))) * settle;
    if (!G.quiet && lt < 500) add(ctx, function () { var u = lt / 500; ring(ctx, S.x, S.y, r + 4 + u * 16, 3 * (1 - u), rgba(chill ? PAL.cold.hot : PAL.fire.hot, 1 - u), 10); });
    if (chill) chillShell(ctx, S, r, lt, a, 0);
    else warmShell(ctx, S, r, lt, a, 0);
  }
  function retort(ctx, look, lt, g) {
    if (!ctx || !g || lt < 0 || lt > 640) return;
    var caster = g.T || g.B, attacker = g.S || g.A; if (!attacker) return;
    var G = { cell: g.cell || 70, rT: g.rT || 18, rS: g.rS || 18 };
    if (look === "rime") { if (caster) iceSnap(ctx, caster, attacker, lt, G); return; }
    fireBurst(ctx, attacker, Math.max(0, lt - 30), 520, (g.cell || 70) * 0.72, 12);
  }

  var VT = { clamp0: 0, clamp1: 220, collapse: 220, rib0: 650, rib1: 1250, heal: 1250 };
  function ribbonPts(S, B, G) { var n = norm(B, S), L = dist(B, S), px = -n.y, py = n.x, pts = [], s = n.x > 0 ? -1 : 1; for (var i = 0; i <= 40; i++) { var u = i / 40, bow = Math.sin(Math.PI * u) * Math.max(L * 0.55, G.cell * 0.7) * s; pts.push({ x: B.x + n.x * u * L + px * bow, y: B.y + n.y * u * L + py * bow }); } return pts; }
  function vampiric(ctx, lt, G) {
    var S = G.S || G.A, B = targetOf(G); if (!B) return;
    var rT = G.rT, rS = G.rS || rT;
    var sa = env(lt, 0, 200, 900, 1500);
    if (sa > 0) { var r0 = rng(12); for (var k = 0; k < 9; k++) { var an = r0() * TAU + lt / 900, rr = rT * (0.7 + r0() * 0.5); glow(ctx, B.x + Math.cos(an) * rr, B.y + Math.sin(an) * rr, 10 + r0() * 6, [[0, rgba(PAL.necrotic.black, 0.45 * sa)], [1, rgba(PAL.necrotic.black, 0)]]); } add(ctx, function () { glow(ctx, B.x, B.y, rT + 14, [[0.5, rgba(PAL.necrotic.glow, 0)], [0.8, rgba(PAL.necrotic.glow, 0.55 * sa)], [1, rgba(PAL.necrotic.glow, 0)]]); }); }
    var hA = env(lt, VT.clamp0, VT.clamp1, 800, 1200);
    if (hA > 0 && S) { var from = edge(B, S, rT * 0.55), sc = lerp(1.25, 1, easeOut(clamp(lt / VT.clamp1))); hand(ctx, from.x, from.y, rT * 1.05 * sc, hA, Math.atan2(B.y - S.y, B.x - S.x) + Math.PI / 2); }
    var th = lt - VT.collapse;
    if (th >= 0 && th < 400) { var u = easeOut(th / 400), R = lerp(G.cell * 1.3, rT * 0.55, u); add(ctx, function () { ring(ctx, B.x, B.y, R, 4 * (1 - u) + 1, rgba(PAL.necrotic.hex, 0.9 * (1 - u * 0.6)), 14); }); glow(ctx, B.x, B.y, R, [[0, rgba(PAL.necrotic.black, 0.5 * u)], [1, rgba(PAL.necrotic.black, 0)]]); }
    var r = rng(55);
    for (var q = 0; q < 18; q++) { var t0 = VT.collapse + r() * 600, age = (lt - t0) / 1000, an2 = r() * TAU, rad = rT * (0.4 + r() * 1.1); if (age < 0 || age > 1) continue; ctx.save(); ctx.translate(B.x + Math.cos(an2) * rad, B.y + Math.sin(an2) * rad + age * 18); ctx.rotate(age * 5 + q); ctx.fillStyle = rgba(PAL.necrotic.ash, 0.85 * (1 - age)); ctx.fillRect(-1.6, -1, 3.2, 2); ctx.restore(); }
    if (S) {
      var pts = ribbonPts(edge(S, { x: S.x, y: S.y - 100 }, rS + 2), edge(B, { x: B.x, y: B.y - 100 }, rT * 0.6), G);
      var grow = easeOut(clamp((lt - VT.rib0) / (VT.rib1 - VT.rib0) * 1.6)), ra = 1 - clamp((lt - VT.rib1 - 150) / 500);
      if (lt > VT.rib0 && ra > 0) {
        var shown = partial(pts, grow), endIdx = Math.floor(clamp((lt - VT.rib1 + 400) / 600) * 40), vis = shown.slice(Math.min(endIdx, Math.max(0, shown.length - 2)));
        add(ctx, function () { stroke(ctx, vis, 10, rgba(PAL.siphon.ribbon, 0.3 * ra), 12); stroke(ctx, vis, 3.2, rgba(PAL.siphon.ribbon, 0.95 * ra)); stroke(ctx, vis, 1.1, rgba(PAL.siphon.heal, ra)); });
        for (var d = 0; d < 6; d++) { var p = ((lt - VT.rib0) / 520 - d * 0.16); if (p < 0 || p > 1 || p > grow) continue; var Dp = partial(pts, p), D = Dp[Dp.length - 1]; ctx.fillStyle = rgba(PAL.siphon.drop, 0.95 * ra); ctx.beginPath(); ctx.arc(D.x, D.y, 2.6, 0, TAU); ctx.fill(); add(ctx, function () { glow(ctx, D.x, D.y, 6, [[0, rgba(PAL.siphon.ribbon, 0.8 * ra)], [1, rgba(PAL.siphon.ribbon, 0)]]); }); }
      }
      var hp = lt - VT.heal;
      if (hp >= 0 && hp < 900) {
        var v = hp / 900;
        add(ctx, function () { glow(ctx, S.x, S.y, rS + 16, [[0.5, rgba(PAL.siphon.heal, 0)], [0.8, rgba(PAL.siphon.heal, 0.6 * (1 - v))], [1, rgba(PAL.siphon.heal, 0)]]); ring(ctx, S.x, S.y, rS + 4 + easeOut(v) * G.cell * 0.55, 3 * (1 - v) + 0.5, rgba(PAL.siphon.heal, 1 - v), 10); ring(ctx, S.x, S.y, rS + 3, 2.5, rgba(PAL.siphon.heal, 0.9 * (1 - v)), 8); });
        var r2 = rng(19);
        for (var c = 0; c < 5; c++) { var an3 = r2() * TAU, x = S.x + Math.cos(an3) * rS * 0.9, y = S.y + Math.sin(an3) * rS * 0.9 - v * 20; ctx.save(); ctx.strokeStyle = rgba(PAL.siphon.heal, 1 - v); ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(x - 3, y); ctx.lineTo(x + 3, y); ctx.moveTo(x, y - 3); ctx.lineTo(x, y + 3); ctx.stroke(); ctx.restore(); }
      }
    }
  }

  var RE = { ray: 90, hold: 480, fade: 760, mark: 250 };
  function enfeebleGrey(lt, G) {
    if (G && G.saved) return 1 - clamp(lt / 300);
    return clamp((lt - RE.ray - 40) / 400);
  }
  function strengthMark(ctx, x, y, R, a) {
    ctx.save(); ctx.globalAlpha = a; var w = R * 2.6, h = R * 1.5, rad = h / 2;
    ctx.beginPath(); ctx.moveTo(x - w / 2 + rad, y - h / 2); ctx.arcTo(x + w / 2, y - h / 2, x + w / 2, y + h / 2, rad); ctx.arcTo(x + w / 2, y + h / 2, x - w / 2, y + h / 2, rad); ctx.arcTo(x - w / 2, y + h / 2, x - w / 2, y - h / 2, rad); ctx.arcTo(x - w / 2, y - h / 2, x + w / 2, y - h / 2, rad); ctx.closePath();
    ctx.fillStyle = "rgba(38,28,40,0.92)"; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = rgba(PAL.enfeeble.core, 1); ctx.stroke();
    ctx.fillStyle = "rgba(220,210,220,1)"; ctx.font = "bold " + Math.round(h * 0.72) + "px system-ui"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("STR", x - 3, y + 0.5);
    ctx.strokeStyle = "rgba(10,6,10,1)"; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(x - 6, y - h / 2); ctx.lineTo(x - 2, y - 2); ctx.lineTo(x - 6, y + 1); ctx.lineTo(x - 3, y + h / 2); ctx.stroke();
    ctx.strokeStyle = "rgba(230,120,140,1)"; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(x + w / 2 - 9, y - 2); ctx.lineTo(x + w / 2 - 6, y + 2); ctx.lineTo(x + w / 2 - 3, y - 2); ctx.stroke();
    ctx.restore();
  }
  function enfeeble(ctx, lt, G) {
    var A = G.A, B = targetOf(G), rT = G.rT; if (!B) return;
    if (G.saved) {
      var v = clamp(lt / 500), r3 = rng(8), bx = B.x, by = B.y - rT - 13;
      for (var f = 0; f < 8; f++) { var an = r3() * TAU, d = easeOut(v) * 18; ctx.fillStyle = rgba(PAL.enfeeble.core, 1 - v); ctx.fillRect(bx + Math.cos(an) * d - 1.5, by + Math.sin(an) * d - 1.5, 3, 3); }
      add(ctx, function () { ring(ctx, B.x, B.y, rT + 3 + easeOut(v) * G.cell * 0.5, 2 * (1 - v), "rgba(240,230,210," + (1 - v) + ")", 6); });
      return;
    }
    if (G.quiet) { ring(ctx, B.x, B.y, rT + 3, 2, rgba(PAL.enfeeble.glow, 0.75)); strengthMark(ctx, B.x, B.y - rT - 13 + Math.sin(lt / 400) * 1.5, 9, 0.85); return; }
    var a = 1 - clamp((lt - RE.hold) / (RE.fade - RE.hold));
    if (a > 0 && A) { var H = lp(A, B, clamp(lt / RE.ray)); ctx.save(); stroke(ctx, [A, H], 7, "rgba(25,18,25," + (0.4 * a) + ")"); ctx.restore(); add(ctx, function () { stroke(ctx, [A, H], 6, rgba(PAL.enfeeble.glow, 0.35 * a), 10); stroke(ctx, [A, H], 2, rgba(PAL.enfeeble.core, 0.9 * a)); }); }
    if (A) { var r = rng(44); for (var k = 0; k < 26; k++) { var t0 = RE.ray + r() * 600, age = (lt - t0) / 900, u0 = 0.35 + r() * 0.65, sd = (r() - 0.5) * 10; if (age < 0 || age > 1) continue; var n = norm(A, B), P = lp(A, B, u0 - age * 0.35); ctx.fillStyle = rgba(PAL.enfeeble.mote, 0.85 * (1 - age)); ctx.beginPath(); ctx.arc(P.x - n.y * sd, P.y + n.x * sd, 1.7, 0, TAU); ctx.fill(); } }
    var th = lt - RE.ray; if (th >= 0 && th < 450) { var u = th / 450; add(ctx, function () { glow(ctx, B.x, B.y, G.cell * 0.65, [[0, rgba(PAL.enfeeble.core, 0.55 * (1 - u))], [1, rgba(PAL.enfeeble.glow, 0)]]); }); }
    var gr = enfeebleGrey(lt, G);
    if (gr > 0) ring(ctx, B.x, B.y, rT + 3, 2, rgba(PAL.enfeeble.glow, 0.8 * gr));
    var ma = clamp((lt - RE.mark) / 300);
    if (ma > 0) strengthMark(ctx, B.x, B.y - rT - 13 + Math.sin(lt / 400) * 1.5, 9, ma * (0.8 + 0.2 * Math.sin(lt / 300)));
  }

  function tokenState(look, lt, id, G) {
    var s = { dx: 0, dy: 0, grey: 0 };
    G = G || {};
    if (look === "thorn" && id === "target" && G.yank && lt > TW.y0) { var p = yankP(lt); s.dx = G.yank.x * p; s.dy = G.yank.y * p; }
    if (look === "enfeeble" && id === "target") s.grey = enfeebleGrey(lt, G);
    return s;
  }
  var PAINT = { hex: hex, brand: brand, "shocking-grasp": shocking, thorn: thorn, rebuke: rebuke, flameblade: flameBlade, heat: heat, fireshield: fireShield, rime: fireShield, siphon: vampiric, enfeeble: enfeeble };
  var UNDER = { rebuke: rebukeUnder, flameblade: bladeUnder };
  function shakeOf(look, lt) {
    function sh(t0, mag, dur) { var t = lt - t0; if (t < 0 || t > dur) return { x: 0, y: 0 }; var k = mag * (1 - t / dur); return { x: Math.sin(t * 0.9) * k, y: Math.cos(t * 1.3) * k }; }
    if (look === "shocking-grasp") return sh(SG.spark, 2, 140);
    if (look === "rebuke") return sh(HR.bloom, 3, 220);
    return { x: 0, y: 0 };
  }
  return {
    looks: Object.keys(PAINT),
    paint: function (ctx, look, lt, G) { if (PAINT[look] && lt >= 0) PAINT[look](ctx, lt, G); },
    paintUnder: function (ctx, look, lt, G) { if (UNDER[look] && lt >= 0) UNDER[look](ctx, lt, G); },
    tokenState: tokenState,
    shakeOf: shakeOf,
    garnish: garnish,
    retort: retort,
    yankAt: TW.y0
  };
  })();

  /* Chunk 3 Phase 1 Love-it outlines. Shape + clear effect. One beat per real cast, hit, or token event.
     Demo clocks (second strike, foe step-in, caster step, smite strip) are not reproduced.
     Phase 2 first cut: Prismatic kicked dust, Sunbeam lane motes, Meteor rock grit, Thunderous flung grit.
     Still out: Produce Flame extinguish pop, Call Lightning / Branding ultra-low idle, Banishing and Staggering.
     Ground scorch shares this overlay, same as Chunk 1–2. */
  var Chunk3Fx = (function () {
  var TAU = Math.PI * 2;
  var PAL = {
    lightning: { glow: "85,120,240", core: "232,236,255", hot: "255,255,255", cloud: "70,72,80" },
    fire: { glow: "200,60,15", core: "255,125,35", hot: "255,225,160", burst: "255,140,45", ball: "255,242,205" },
    cold: { glow: "80,125,185", core: "200,225,250", hot: "250,252,255", mist: "150,185,225" },
    radiant: { glow: "230,175,70", core: "255,232,170", hot: "255,250,230" },
    necrotic: { glow: "95,45,100", black: "6,3,8", bone: "185,170,180", ash: "120,112,118", hex: "170,90,190", raise: "140,160,130" },
    acid: { glow: "80,135,25", core: "125,180,40", hot: "225,235,150", dark: "30,40,10" },
    poison: { glow: "150,140,70", core: "195,185,110", hot: "225,220,140", dark: "40,42,18" },
    thunder: { dust: "95,80,60", glow: "200,170,110", core: "235,215,170", hot: "250,240,215" },
    blind: "255,250,235",
    prism: ["140,40,35", "190,95,40", "195,160,70", "120,135,80", "90,115,150", "60,60,110", "110,60,100"],
    prismGrit: "230,225,210"
  };
  function clamp(v, a, b) { a = a === undefined ? 0 : a; b = b === undefined ? 1 : b; return Math.max(a, Math.min(b, v)); }
  function rgba(c, a) { return "rgba(" + c + "," + clamp(a) + ")"; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function lp(A, B, t) { return { x: lerp(A.x, B.x, t), y: lerp(A.y, B.y, t) }; }
  function easeOut(t) { return 1 - Math.pow(1 - clamp(t), 3); }
  function easeInOut(t) { t = clamp(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
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
  function partial(pts, p) { if (!pts || p >= 1) return pts || []; var n = pts.length - 1, f = p * n, k = Math.floor(f), out = pts.slice(0, k + 1); if (k < n) out.push(lp(pts[k], pts[k + 1], f - k)); return out; }
  function poly(ctx, pts) { if (!pts || !pts.length) return; ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y); }
  function stroke(ctx, pts, w, col, blur, blurCol) {
    if (!pts || pts.length < 2) return;
    ctx.save(); ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.lineWidth = w; ctx.strokeStyle = col;
    if (blur) { ctx.shadowBlur = blur; ctx.shadowColor = blurCol || col; }
    poly(ctx, pts); ctx.stroke(); ctx.restore();
  }
  function glow(ctx, x, y, r, stops) {
    if (!(r > 0.5)) return;
    var g = ctx.createRadialGradient(x, y, 0, x, y, r);
    for (var i = 0; i < stops.length; i++) g.addColorStop(stops[i][0], stops[i][1]);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  }
  function add(ctx, fn) { ctx.save(); ctx.globalCompositeOperation = "lighter"; fn(); ctx.restore(); }
  function ring(ctx, x, y, r, w, col, blur) {
    if (!(r > 0)) return;
    ctx.save(); ctx.lineWidth = w; ctx.strokeStyle = col;
    if (blur) { ctx.shadowBlur = blur; ctx.shadowColor = col; }
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke(); ctx.restore();
  }
  function bolt(ctx, pts, a, thick) {
    var k = thick || 1;
    add(ctx, function () {
      stroke(ctx, pts, 14 * k, rgba(PAL.lightning.glow, 0.28 * a), 18, rgba(PAL.lightning.glow, a));
      stroke(ctx, pts, 5 * k, rgba(PAL.lightning.glow, 0.75 * a));
      stroke(ctx, pts, 2.2 * k, rgba(PAL.lightning.core, a));
      stroke(ctx, pts, 0.9 * k, rgba(PAL.lightning.hot, a));
    });
  }
  function sparks(ctx, x, y, t, n, seed, speed, life, col, size, grav) {
    if (t < 0 || t > life) return;
    var r = rng(seed), u = t / life;
    add(ctx, function () {
      for (var i = 0; i < n; i++) {
        var a = r() * TAU, v = speed * (0.4 + r() * 0.8), d = v * (1 - Math.pow(1 - u, 2)) * life / 1000 * 0.6;
        ctx.fillStyle = rgba(col, (1 - u) * (0.6 + r() * 0.4));
        ctx.beginPath();
        ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d + (grav || 0) * u * u, size * (1 - u * 0.5), 0, TAU);
        ctx.fill();
      }
    });
  }
  function tongue(ctx, w, h, fill) {
    ctx.beginPath(); ctx.moveTo(-w, 0); ctx.quadraticCurveTo(-w * 0.4, -h * 0.6, 0, -h); ctx.quadraticCurveTo(w * 0.4, -h * 0.6, w, 0); ctx.closePath();
    ctx.fillStyle = fill; ctx.fill();
  }
  function flameRing(ctx, x, y, R, n, lt, a, h0, seed) {
    for (var i = 0; i < n; i++) {
      var an = i / n * TAU + lt / 2200, h = h0 * (0.55 + 0.45 * (0.5 + 0.5 * Math.sin(lt / 85 + i * 2.3 + seed)));
      ctx.save(); ctx.translate(x + Math.cos(an) * R, y + Math.sin(an) * R); ctx.rotate(an + Math.PI / 2);
      tongue(ctx, 4.2, h, rgba(PAL.fire.core, 0.7 * a)); tongue(ctx, 2, h * 0.6, rgba(PAL.fire.hot, 0.8 * a)); ctx.restore();
    }
  }
  function fireBurst(ctx, B, t, life, R, seed) {
    if (!B || t < 0 || t > life) return;
    var u = t / life;
    add(ctx, function () {
      glow(ctx, B.x, B.y, R * (0.55 + 0.45 * easeOut(clamp(t / 140))), [[0, rgba(PAL.fire.ball, 0.95 * (1 - u))], [0.3, rgba(PAL.fire.core, 0.8 * (1 - u))], [0.7, rgba(PAL.fire.glow, 0.45 * (1 - u))], [1, rgba(PAL.fire.glow, 0)]]);
      flameRing(ctx, B.x, B.y, R * 0.55 * (0.7 + 0.3 * easeOut(u)), 12, t, 1 - u, R * 0.45, seed);
    });
    sparks(ctx, B.x, B.y, t, 18, seed, 160, life, PAL.fire.burst, 1.6, -18);
  }
  function star(ctx, x, y, r, n, inner, fill, a, rot, blurCol) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot || 0); ctx.beginPath();
    for (var i = 0; i < n * 2; i++) {
      var rr = i % 2 ? r * inner : r, an = i / (n * 2) * TAU - Math.PI / 2;
      ctx.lineTo(Math.cos(an) * rr, Math.sin(an) * rr);
    }
    ctx.closePath(); ctx.fillStyle = rgba(fill, a);
    if (blurCol) { ctx.shadowBlur = 10; ctx.shadowColor = rgba(blurCol, a); }
    ctx.fill(); ctx.restore();
  }
  function wedge(ctx, A, ang, L, w0, w1, fill) {
    var n = { x: Math.cos(ang), y: Math.sin(ang) }, px = -n.y, py = n.x, B = { x: A.x + n.x * L, y: A.y + n.y * L };
    ctx.beginPath();
    ctx.moveTo(A.x + px * w0, A.y + py * w0);
    ctx.lineTo(B.x + px * w1, B.y + py * w1);
    ctx.lineTo(B.x - px * w1, B.y - py * w1);
    ctx.lineTo(A.x - px * w0, A.y - py * w0);
    ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
  }
  function flash(ctx, B, t, life, R, col, hot) {
    if (!B || t < 0 || t > life) return;
    var u = t / life;
    add(ctx, function () {
      glow(ctx, B.x, B.y, R * (0.6 + 0.4 * u), [[0, rgba(hot, 1 - u)], [0.4, rgba(col, 0.55 * (1 - u))], [1, rgba(col, 0)]]);
      ring(ctx, B.x, B.y, R * 0.45 + easeOut(u) * R * 0.6, 3 * (1 - u) + 0.5, rgba(hot, 1 - u), 10);
    });
  }
  function pill(ctx, x, y, txt, a, fill, edgeCol, txtCol) {
    if (a <= 0 || !ctx.fillText) return;
    ctx.save(); ctx.globalAlpha = clamp(a); ctx.font = "bold 11px system-ui";
    var measured = ctx.measureText ? ctx.measureText(txt) : null;
    var w = ((measured && measured.width) || (String(txt).length * 6.2)) + 12, h = 15, rad = h / 2;
    ctx.beginPath();
    ctx.moveTo(x - w / 2 + rad, y - h / 2);
    ctx.arcTo(x + w / 2, y - h / 2, x + w / 2, y + h / 2, rad);
    ctx.arcTo(x + w / 2, y + h / 2, x - w / 2, y + h / 2, rad);
    ctx.arcTo(x - w / 2, y + h / 2, x - w / 2, y - h / 2, rad);
    ctx.arcTo(x - w / 2, y - h / 2, x + w / 2, y - h / 2, rad);
    ctx.closePath();
    ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = 1.3; ctx.strokeStyle = edgeCol; ctx.stroke();
    ctx.fillStyle = txtCol; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(txt, x, y + 0.5);
    ctx.restore();
  }
  function targetOf(G) { return (G && G.T && G.T[0]) || null; }
  function aimAng(G) {
    var A = G.A || G.S, B = targetOf(G);
    if (isFinite(G.facing)) return G.facing;
    if (A && B) return Math.atan2(B.y - A.y, B.x - A.x);
    return 0;
  }

  /* 1. Call Lightning — one sky drop per cast. Later rounds are a new cast. */
  var CL = { cloud: 450, drop: 520, dropDur: 80 };
  function stormCloud(ctx, C, R, lt, a) {
    var r = rng(5);
    for (var k = 0; k < 16; k++) {
      var an = r() * TAU + lt / 2200 * (k % 2 ? 1 : -1), rr = R * (0.1 + r() * 0.75), s = R * (0.38 + r() * 0.3);
      glow(ctx, C.x + Math.cos(an) * rr, C.y + Math.sin(an) * rr * 0.6, s, [[0, rgba(PAL.lightning.cloud, 0.8 * a)], [0.6, "rgba(48,50,58," + (0.5 * a) + ")"], [1, "rgba(40,42,50,0)"]]);
    }
    ctx.save(); ctx.strokeStyle = "rgba(130,134,150," + (0.5 * a) + ")"; ctx.lineWidth = 1.6;
    for (var i = 0; i < 3; i++) {
      ctx.beginPath();
      if (ctx.ellipse) ctx.ellipse(C.x, C.y, R * (0.3 + i * 0.2), R * (0.18 + i * 0.12), 0, lt / 600 + i * 2, lt / 600 + i * 2 + 2.3);
      else ctx.arc(C.x, C.y, R * (0.4 + i * 0.15), 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
    var f = rng(Math.floor(lt / 80) + 1)();
    if (f > 0.55) add(ctx, function () { glow(ctx, C.x + (f - 0.75) * R, C.y, R * 0.45, [[0, rgba(PAL.lightning.glow, 0.55 * a * f)], [1, rgba(PAL.lightning.glow, 0)]]); });
  }
  function scorchBranch(ctx, B, R, a, seed) {
    if (!B || a <= 0) return;
    var r = rng(seed);
    ctx.save(); ctx.lineCap = "round";
    glow(ctx, B.x, B.y, R * 0.45, [[0, "rgba(10,6,4," + (0.7 * a) + ")"], [1, "rgba(10,6,4,0)"]]);
    for (var i = 0; i < 7; i++) {
      var an = i / 7 * TAU + r() * 0.4;
      var pts = jag(B, { x: B.x + Math.cos(an) * R * (0.6 + r() * 0.5), y: B.y + Math.sin(an) * R * (0.6 + r() * 0.5) }, 5, 5, seed + i);
      stroke(ctx, pts, 3.2, "rgba(12,8,6," + (0.75 * a) + ")");
      var m = pts[2], an2 = an + (r() > 0.5 ? 0.7 : -0.7);
      if (m) stroke(ctx, jag(m, { x: m.x + Math.cos(an2) * R * 0.3, y: m.y + Math.sin(an2) * R * 0.3 }, 3, 3, seed + 20 + i), 1.8, "rgba(12,8,6," + (0.65 * a) + ")");
    }
    ctx.restore();
  }
  function skyUnder(ctx, lt, G) {
    scorchBranch(ctx, targetOf(G), G.cell * 1.1, env(lt, CL.drop + 40, CL.drop + 140, 1200, 1700), 31);
  }
  function skyStrike(ctx, C, B, t, G, seed) {
    if (!C || !B || t < 0 || t > 520) return;
    var a = 1 - clamp((t - 180) / 340), bk = Math.floor(Math.max(0, t) / 40);
    var pts = jag({ x: C.x, y: C.y + G.cell * 0.15 }, B, 9, 11, seed + bk);
    bolt(ctx, partial(pts, clamp(t / CL.dropDur)), a * (0.8 + 0.2 * rng(bk + 3)()), 1.9);
    if (t > CL.dropDur) {
      for (var f = 0; f < 2; f++) {
        var P = pts[3 + f * 3]; if (!P) continue;
        var d = f ? 1 : -1;
        bolt(ctx, jag(P, { x: P.x + d * 18, y: P.y + 14 }, 3, 4, seed + bk + f), a * 0.6, 0.6);
      }
    }
    var th = t - CL.dropDur;
    if (th >= 0) { flash(ctx, B, th, 440, G.cell * 1.5, PAL.lightning.glow, PAL.lightning.hot); sparks(ctx, B.x, B.y, th, 16, seed, 170, 440, PAL.lightning.core, 1.5, 0); }
  }
  function callLightning(ctx, lt, G) {
    var B = targetOf(G); if (!B) return;
    var C = { x: B.x, y: B.y - G.cell * 1.7 };
    var ca = easeOut(clamp(lt / CL.cloud)) * (lt < CL.drop + 500 ? 1 : lerp(1, 0.35, clamp((lt - CL.drop - 500) / 500)));
    stormCloud(ctx, C, G.cell * 1.15 * (0.82 + 0.18 * easeOut(clamp(lt / CL.cloud))), lt, ca);
    skyStrike(ctx, C, B, lt - CL.drop, G, 11);
  }

  /* 2. Sunbeam — one shaft along the real aim. Concentration tip is the tail of this cast, plus a quiet rider. */
  var SB = { grow: 90, hold: 380, fade: 520, after: 400 };
  function shaftEnd(G) {
    var A = G.A || G.S, B = targetOf(G), cell = G.cell || 70;
    if (!A) return B;
    var ang = aimAng(G);
    var reach = cell * 12;
    if (B && dist(A, B) > cell * 1.5) return B;
    return { x: A.x + Math.cos(ang) * reach, y: A.y + Math.sin(ang) * reach };
  }
  function sunHits(G) {
    var hits = (G.hops && G.hops.length) ? G.hops.slice() : [];
    if (!hits.length && targetOf(G)) hits.push(targetOf(G));
    return hits;
  }
  function sunShot(ctx, t, G) {
    if (t < 0) return;
    var A = G.A || G.S, E = shaftEnd(G); if (!A || !E) return;
    var p = easeOut(clamp(t / SB.grow)), H = lp(A, E, p);
    var a = 1 - clamp((t - SB.hold) / (SB.fade - SB.hold));
    var ag = env(t, SB.hold, SB.fade, SB.fade, SB.fade + SB.after);
    var span = dist(A, E) || 1;
    if (a > 0) add(ctx, function () {
      var w = Math.max(8, G.cell * 0.28);
      stroke(ctx, [A, H], w * 1.35, rgba(PAL.radiant.glow, 0.28 * a), 18, rgba(PAL.radiant.glow, a));
      stroke(ctx, [A, H], w * 0.55, rgba(PAL.radiant.core, 0.8 * a), 8);
      stroke(ctx, [A, H], 3, rgba(PAL.radiant.hot, a));
      glow(ctx, H.x, H.y, G.cell * 0.45, [[0, rgba(PAL.radiant.hot, 0.9 * a)], [1, rgba(PAL.radiant.glow, 0)]]);
      glow(ctx, A.x, A.y, G.cell * 0.4, [[0, rgba(PAL.radiant.hot, 0.8 * a)], [1, rgba(PAL.radiant.glow, 0)]]);
    });
    if (ag > 0) add(ctx, function () {
      stroke(ctx, [A, E], Math.max(6, G.cell * 0.22), rgba(PAL.radiant.glow, 0.22 * ag), 10);
      stroke(ctx, [A, E], 2, rgba(PAL.radiant.core, 0.4 * ag));
    });
    if (t > SB.grow) {
      var dustA = env(t, SB.grow, SB.grow + 80, SB.fade, SB.fade + SB.after);
      if (dustA > 0) {
        var rd = rng(19), nrm = norm(A, E);
        ctx.save();
        ctx.globalCompositeOperation = "source-over";
        for (var m = 0; m < 18; m++) {
          var uu = rd(), Pm = lp(A, E, uu), jit = (rd() - 0.5) * G.cell * 0.35;
          ctx.fillStyle = rgba(m % 2 ? "178,168,150" : "120,100,75", 0.55 * dustA);
          ctx.fillRect(Pm.x - nrm.y * jit, Pm.y + nrm.x * jit, 2.2, 2.2);
        }
        ctx.restore();
      }
    }
    sunHits(G).forEach(function (B, i) {
      var along = clamp(dist(A, B) / span);
      var tb = t - SB.grow * along;
      if (tb < 0 || tb > 520) return;
      var u = tb / 520;
      add(ctx, function () {
        star(ctx, B.x, B.y, G.cell * (0.5 + 0.22 * easeOut(Math.min(1, u * 1.4))), 8, 0.18, PAL.blind, 1 - u, i * 0.4, PAL.radiant.glow);
        glow(ctx, B.x, B.y, G.cell * 0.75, [[0, rgba(PAL.blind, 0.75 * (1 - u))], [1, rgba(PAL.radiant.glow, 0)]]);
      });
    });
  }
  function sunIdle(ctx, lt, G, a) {
    var S = G.S || G.A; if (!S || a <= 0) return;
    var ang = aimAng(G), tip = { x: S.x + Math.cos(ang) * G.cell * 0.55, y: S.y + Math.sin(ang) * G.cell * 0.55 };
    var br = 0.55 + 0.25 * Math.sin(lt / 260);
    add(ctx, function () {
      stroke(ctx, [S, tip], 5, rgba(PAL.radiant.glow, 0.35 * a * br), 10);
      stroke(ctx, [S, tip], 1.6, rgba(PAL.radiant.hot, 0.7 * a * br));
      glow(ctx, S.x, S.y, 10, [[0, rgba(PAL.radiant.hot, 0.65 * a * br)], [1, rgba(PAL.radiant.glow, 0)]]);
    });
  }
  function sunbeam(ctx, lt, G) {
    if (G.quiet) { sunIdle(ctx, lt, G, 0.85); return; }
    sunShot(ctx, lt, G);
    var idle = clamp((lt - (SB.fade + SB.after)) / 240);
    if (idle > 0) sunIdle(ctx, lt, G, idle * 0.7);
  }

  /* 3. Finger of Death — thick plum ray, bone core, collapse. Zombie rise only on the kill follow-up. */
  var FD = { grow: 60, hold: 320, fade: 560 };
  function deathRay(ctx, A, B, t) {
    if (!A || !B || t < 0) return;
    var a = 1 - clamp((t - FD.hold) / (FD.fade - FD.hold));
    if (a <= 0) return;
    var H = lp(A, B, easeOut(clamp(t / FD.grow))), wob = Math.sin(t / 30) * 0.8;
    stroke(ctx, [A, H], 24, "rgba(60,24,66," + (0.55 * a) + ")", 16, "rgba(60,24,66," + a + ")");
    add(ctx, function () { stroke(ctx, [A, H], 20, rgba(PAL.necrotic.glow, 0.28 * a), 14, rgba(PAL.necrotic.glow, a)); });
    stroke(ctx, [A, H], 13 + wob, rgba(PAL.necrotic.black, 0.95 * a));
    add(ctx, function () { stroke(ctx, [A, H], 2.2, rgba(PAL.necrotic.bone, 0.85 * a)); });
  }
  function collapse(ctx, B, t, R0, R1, seed) {
    if (!B || t < -20) return;
    if (t >= 0 && t < 420) {
      var u = easeOut(t / 420), R = lerp(R0, R1, u);
      add(ctx, function () { ring(ctx, B.x, B.y, R, 5 * (1 - u) + 1, rgba(PAL.necrotic.hex, 0.95 * (1 - u * 0.6)), 14); });
      glow(ctx, B.x, B.y, R, [[0, rgba(PAL.necrotic.black, 0.55 * u)], [1, rgba(PAL.necrotic.black, 0)]]);
    }
    var r = rng(seed);
    for (var q = 0; q < 18; q++) {
      var t0 = r() * 500, age = (t - t0) / 900, an = r() * TAU, rad = R1 * (0.5 + r() * 1.4);
      if (age < 0 || age > 1) continue;
      ctx.save();
      ctx.translate(B.x + Math.cos(an) * rad * (1 + age * 0.3), B.y + Math.sin(an) * rad + age * 16);
      ctx.rotate(age * 5 + q);
      ctx.fillStyle = rgba(PAL.necrotic.ash, 0.85 * (1 - age));
      ctx.fillRect(-1.8, -1.1, 3.6, 2.2);
      ctx.restore();
    }
  }
  function raiseSil(ctx, B, t, G) {
    if (!B) return;
    var u = clamp(t / 900);
    if (u <= 0 || u >= 1) return;
    var a = Math.sin(Math.PI * u) * 0.75, h = G.cell * 1.1, y0 = B.y + G.rT * 0.55 - easeOut(u) * G.cell * 0.5, s = h / 40;
    ctx.save(); ctx.translate(B.x, y0); ctx.scale(s, s); ctx.beginPath();
    ctx.arc(0, -33, 5.5, 0, TAU);
    ctx.moveTo(-8, -26); ctx.lineTo(8, -26); ctx.lineTo(6, -6); ctx.lineTo(-6, -6); ctx.closePath();
    ctx.moveTo(-8, -25); ctx.lineTo(-15, -40); ctx.lineTo(-12, -41); ctx.lineTo(-5, -26);
    ctx.moveTo(8, -25); ctx.lineTo(14, -42); ctx.lineTo(17, -40); ctx.lineTo(5, -24);
    ctx.moveTo(-6, -6); ctx.lineTo(-9, 4); ctx.lineTo(-4, 4); ctx.lineTo(0, -4); ctx.lineTo(4, 4); ctx.lineTo(9, 4); ctx.lineTo(6, -6);
    ctx.shadowBlur = 14; ctx.shadowColor = rgba(PAL.necrotic.raise, a);
    ctx.fillStyle = rgba(PAL.necrotic.raise, 0.55 * a); ctx.fill();
    ctx.lineWidth = 1.4; ctx.strokeStyle = rgba("200,215,190", 0.8 * a); ctx.stroke();
    ctx.restore();
    glow(ctx, B.x, B.y + G.rT * 0.3, G.cell * 0.65, [[0, rgba(PAL.necrotic.raise, 0.28 * a)], [1, rgba(PAL.necrotic.raise, 0)]]);
  }
  function fingerOfDeath(ctx, lt, G) {
    var B = targetOf(G); if (!B) return;
    if (G.rise) { raiseSil(ctx, B, lt, G); return; }
    deathRay(ctx, G.A || G.S, B, lt);
    collapse(ctx, B, lt - FD.grow, G.cell * 1.4, G.rT * 0.5, 55);
    if (G.killed) raiseSil(ctx, B, lt - 700, G);
  }

  /* 4. Prismatic Spray — weathered 7-stop fan, normal blend, glass grit, per-target flare. */
  var PS = { grow: 280, fade0: 380, fade1: 760 };
  function prismKind(hop, i) {
    var raw = String((hop && (hop.kind || hop.type || hop.dmg)) || "").toLowerCase();
    if (/blind/.test(raw)) return "blind";
    if (/restrain/.test(raw)) return "restrain";
    if (/lightning/.test(raw)) return "lightning";
    if (/poison/.test(raw)) return "poison";
    if (/acid/.test(raw)) return "acid";
    if (/cold/.test(raw)) return "cold";
    if (/thunder/.test(raw)) return "thunder";
    if (/fire/.test(raw)) return "fire";
    return ["fire", "acid", "lightning", "poison", "cold", "restrain", "blind"][i % 7];
  }
  function prismFlare(ctx, B, kind, t, G, seed) {
    if (!B || t < 0 || t > 620) return;
    var u = t / 620;
    if (kind === "fire") fireBurst(ctx, B, t, 620, G.cell * 0.85, seed);
    else if (kind === "cold") {
      add(ctx, function () {
        ctx.strokeStyle = rgba(PAL.cold.core, 1 - u); ctx.lineWidth = 2;
        for (var s = 0; s < 6; s++) {
          var an = s / 6 * TAU + 0.3, l = G.rT * 0.35 + easeOut(clamp(t / 160)) * G.cell * 0.5;
          ctx.beginPath();
          ctx.moveTo(B.x + Math.cos(an) * G.rT * 0.35, B.y + Math.sin(an) * G.rT * 0.35);
          ctx.lineTo(B.x + Math.cos(an) * l, B.y + Math.sin(an) * l);
          ctx.stroke();
        }
      });
      flash(ctx, B, t, 620, G.cell * 0.9, PAL.cold.glow, PAL.cold.hot);
    } else if (kind === "lightning") {
      flash(ctx, B, t, 520, G.cell * 0.9, PAL.lightning.glow, PAL.lightning.hot);
      sparks(ctx, B.x, B.y, t, 12, seed, 150, 520, PAL.lightning.core, 1.3, 0);
    } else if (kind === "acid") {
      add(ctx, function () { glow(ctx, B.x, B.y, G.cell * 0.7, [[0, rgba(PAL.acid.hot, 0.7 * (1 - u))], [1, rgba(PAL.acid.glow, 0)]]); });
    } else if (kind === "poison") {
      add(ctx, function () { glow(ctx, B.x, B.y, G.cell * 0.7, [[0, rgba(PAL.poison.core, 0.45 * (1 - u))], [1, rgba(PAL.poison.glow, 0)]]); });
    } else if (kind === "thunder") {
      ring(ctx, B.x, B.y, G.rT + easeOut(u) * G.cell * 0.8, 3 * (1 - u), rgba(PAL.thunder.core, 1 - u));
    } else if (kind === "blind") {
      add(ctx, function () { star(ctx, B.x, B.y, G.cell * (0.55 + 0.2 * u), 8, 0.18, PAL.blind, 1 - u, 0.3, PAL.radiant.glow); });
    } else {
      add(ctx, function () {
        var rr = rng(seed + Math.floor(t / 70));
        for (var k = 0; k < 14; k++) {
          var an = rr() * TAU, d = G.rT * (0.4 + rr() * 0.8);
          star(ctx, B.x + Math.cos(an) * d, B.y + Math.sin(an) * d, 3.2, 4, 0.3, "190,190,240", (1 - u) * rr(), 0);
        }
        ring(ctx, B.x, B.y, G.rT + 4, 2, rgba("190,190,240", 0.75 * (1 - u)), 8);
      });
    }
  }
  function prismatic(ctx, lt, G) {
    var A = G.A || G.S; if (!A) return;
    var base = aimAng(G), half = Math.atan(0.5), L = G.cell * 12;
    var p = easeOut(clamp(lt / PS.grow)), a = 1 - clamp((lt - PS.fade0) / (PS.fade1 - PS.fade0));
    if (a > 0) {
      for (var i = 0; i < 7; i++) {
        var ang = base - half + (i + 0.5) / 7 * half * 2 + Math.sin(lt / 90 + i) * 0.012;
        var col = PAL.prism[i], len = L * p * (0.9 + 0.1 * Math.sin(i * 1.7));
        wedge(ctx, A, ang, len, 1.5, len * 0.03, rgba(col, 0.62 * a));
        wedge(ctx, A, ang, len, 0.5, len * 0.01, rgba(PAL.prismGrit, 0.16 * a));
      }
      var grit = rng(Math.floor(lt / 50) + 4);
      add(ctx, function () {
        for (var k = 0; k < 36; k++) {
          var an = base - half + grit() * half * 2, d = grit() * L * p;
          ctx.fillStyle = rgba(PAL.prismGrit, 0.65 * a * grit());
          ctx.fillRect(A.x + Math.cos(an) * d, A.y + Math.sin(an) * d, 1.6, 1.6);
        }
        glow(ctx, A.x, A.y, 14, [[0, rgba(PAL.prismGrit, 0.85 * a)], [1, "rgba(190,95,40,0)"]]);
      });
      ctx.save();
      ctx.globalCompositeOperation = "source-over";
      var kicked = rng(91);
      for (var d = 0; d < 22; d++) {
        var anD = base - half + kicked() * half * 2;
        var kick = p * L * (0.15 + kicked() * 0.7);
        ctx.fillStyle = rgba(kicked() < 0.5 ? "95,80,60" : "120,100,75", 0.55 * a);
        ctx.fillRect(A.x + Math.cos(anD) * kick, A.y + Math.sin(anD) * kick, 2.4, 2.4);
      }
      ctx.restore();
    }
    var marks = (G.hops && G.hops.length) ? G.hops : (targetOf(G) ? [targetOf(G)] : []);
    marks.forEach(function (B, i) { prismFlare(ctx, B, prismKind(B, i), lt - 300 - i * 36, G, 5 + i); });
  }

  /* 5. Meteor Swarm — one sky meteor per placed point. Stagger is the point index, not a scripted quartet. */
  var MS = { travel: 420, life: 1100, gap: 120 };
  function meteorUnder(ctx, lt, G) {
    var B = targetOf(G); if (!B) return;
    var t = lt - (G.beat || 0) * MS.gap - MS.travel - 40;
    if (t < 0) return;
    var a = clamp(t / 180), R = G.cell * 1.9;
    glow(ctx, B.x, B.y, R, [[0, "rgba(10,6,3," + (0.72 * a) + ")"], [0.65, "rgba(18,10,5," + (0.5 * a) + ")"], [1, "rgba(18,10,5,0)"]]);
    ctx.save(); ctx.strokeStyle = "rgba(70,30,10," + (0.55 * a) + ")"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(B.x, B.y, R * 0.55, 0, TAU); ctx.stroke(); ctx.restore();
  }
  function meteor(ctx, lt, G) {
    var B = targetOf(G); if (!B) return;
    var delay = (G.beat || 0) * MS.gap;
    var t = lt - delay;
    var S0 = { x: B.x + G.cell * (1.4 + (G.beat || 0) * 0.28), y: B.y - G.cell * 4.2 };
    if (t >= 0 && t < MS.travel) {
      var p = clamp(t / MS.travel), p2 = p * p * 0.25 + p * 0.75, H = lp(S0, B, p2), n = norm(S0, B);
      for (var k = 12; k >= 1; k--) {
        var q = clamp(p2 - k * 0.03), P = lp(S0, B, q);
        if (q <= 0) continue;
        glow(ctx, P.x - n.y * Math.sin(k) * 2, P.y + n.x * Math.sin(k) * 2, 6 + k * 1.3, [[0, "rgba(25,18,14," + (0.32 * (1 - k / 13)) + ")"], [1, "rgba(25,18,14,0)"]]);
      }
      add(ctx, function () {
        for (var j = 8; j >= 1; j--) {
          var q2 = clamp(p2 - j * 0.02), P2 = lp(S0, B, q2);
          glow(ctx, P2.x, P2.y, 14 - j, [[0, rgba(PAL.fire.core, 0.65 * (1 - j / 9))], [1, rgba(PAL.fire.glow, 0)]]);
        }
        glow(ctx, H.x, H.y, G.cell * 0.7, [[0, rgba(PAL.fire.ball, 0.95)], [0.35, rgba(PAL.fire.core, 0.8)], [1, rgba(PAL.fire.glow, 0)]]);
      });
      ctx.save(); ctx.fillStyle = "rgba(45,28,20,0.95)"; ctx.beginPath();
      var rr = rng(9 + (G.beat || 0));
      for (var v = 0; v < 8; v++) {
        var an = v / 8 * TAU, rad = 7 * (0.75 + rr() * 0.35);
        if (v) ctx.lineTo(H.x + Math.cos(an) * rad, H.y + Math.sin(an) * rad);
        else ctx.moveTo(H.x + Math.cos(an) * rad, H.y + Math.sin(an) * rad);
      }
      ctx.closePath(); ctx.fill(); ctx.restore();
    }
    var tb = t - MS.travel;
    if (tb >= 0) {
      fireBurst(ctx, B, tb, MS.life, G.cell * 2.15, 30 + (G.beat || 0));
      gritBurst(ctx, B.x, B.y, tb, 700, 18, 30 + (G.beat || 0), G.cell * 1.4, ["45,28,20", "95,80,60"]);
      if (tb < 420) add(ctx, function () {
        var u = tb / 420;
        ring(ctx, B.x, B.y, G.cell * 0.55 + easeOut(u) * G.cell * 1.85, 4 * (1 - u) + 0.5, rgba(PAL.fire.hot, 1 - u), 12);
      });
    }
  }

  /* 6. Guardian of Faith — garnish only. The token art is the body. */
  function guardian(ctx, lt, G) {
    var C = (G.S && (G.garnish === "swipe" || G.garnish === "clear")) ? G.S : (targetOf(G) || G.S);
    if (!C) return;
    if (G.garnish === "clear") {
      var v = clamp(lt / 800), r = rng(77);
      add(ctx, function () {
        for (var k = 0; k < 36; k++) {
          var an = r() * TAU, d = G.cell * (0.15 + r() * 0.85) * (0.35 + 0.65 * easeOut(v));
          ctx.fillStyle = rgba(k % 2 ? PAL.radiant.core : PAL.radiant.hot, (1 - v) * (0.45 + r() * 0.5));
          ctx.beginPath(); ctx.arc(C.x + Math.cos(an) * d, C.y + Math.sin(an) * d - v * 12, 1.7, 0, TAU); ctx.fill();
        }
        glow(ctx, C.x, C.y, G.cell * 1.05, [[0, rgba(PAL.radiant.core, 0.4 * (1 - v))], [1, rgba(PAL.radiant.glow, 0)]]);
      });
      return;
    }
    if (G.garnish === "swipe") {
      var foe = targetOf(G) || C;
      var t = lt, u2 = clamp(t / 600), prog = clamp(t / 130);
      var aS = Math.atan2(foe.y - C.y, foe.x - C.x);
      var Cc = { x: foe.x - Math.cos(aS) * G.cell * 0.5, y: foe.y - Math.sin(aS) * G.cell * 0.5 };
      var R = G.cell * 0.66, arc = [], inner = [];
      for (var i = 0; i <= 22; i++) {
        var an = aS - 0.9 + (i / 22) * 1.8 * prog, th = Math.sin(i / 22 * Math.PI) * 8;
        arc.push({ x: Cc.x + Math.cos(an) * R, y: Cc.y + Math.sin(an) * R });
        inner.push({ x: Cc.x + Math.cos(an) * (R - th), y: Cc.y + Math.sin(an) * (R - th) });
      }
      add(ctx, function () {
        stroke(ctx, arc, 12, rgba(PAL.radiant.glow, 0.5 * (1 - u2)), 14, rgba(PAL.radiant.glow, 1));
        stroke(ctx, arc, 4.5, rgba(PAL.radiant.core, 1 - u2));
        stroke(ctx, inner, 2, rgba(PAL.radiant.hot, 1 - u2));
        glow(ctx, foe.x, foe.y, G.cell * 0.65, [[0, rgba(PAL.radiant.hot, 0.5 * (1 - u2))], [1, rgba(PAL.radiant.glow, 0)]]);
      });
      sparks(ctx, foe.x, foe.y, t, 16, 21, 140, 600, PAL.radiant.core, 1.5, 0);
      return;
    }
    if (lt > 640) return;
    var u = lt / 640;
    add(ctx, function () {
      glow(ctx, C.x, C.y, G.cell * (0.7 + 0.85 * u), [[0, rgba(PAL.radiant.hot, 0.85 * (1 - u))], [0.4, rgba(PAL.radiant.core, 0.5 * (1 - u))], [1, rgba(PAL.radiant.glow, 0)]]);
      ring(ctx, C.x, C.y, G.cell * (0.45 + u), 3 * (1 - u), rgba(PAL.radiant.hot, 1 - u), 10);
    });
    sparks(ctx, C.x, C.y, lt, 18, 7, 130, 640, PAL.radiant.core, 1.5, -8);
  }

  /* 7. Chromatic Orb — one typed orb. All six locked cores. */
  function orbKey(dmg) {
    var s = String(dmg || "").toLowerCase().replace(/[^a-z]/g, "");
    var keys = ["lightning", "thunder", "poison", "acid", "cold", "fire"];
    for (var i = 0; i < keys.length; i++) if (s === keys[i]) return keys[i];
    if (s.length > 12) return "fire";
    for (var j = 0; j < keys.length; j++) if (s.indexOf(keys[j]) >= 0) return keys[j];
    return "fire";
  }
  function orbPalette(key) {
    if (key === "lightning") return { glow: PAL.lightning.glow, core: PAL.lightning.core, hot: PAL.lightning.hot };
    if (key === "thunder") return { glow: PAL.thunder.glow, core: PAL.thunder.core, hot: PAL.thunder.hot };
    return PAL[key] || PAL.fire;
  }
  function orbBurst(ctx, B, key, tb, G, seed) {
    var c = orbPalette(key), u = clamp(tb / 700);
    if (u >= 1) return;
    if (key === "fire") { fireBurst(ctx, B, tb, 700, G.cell * 1.0, seed); return; }
    if (key === "cold") {
      flash(ctx, B, tb, 700, G.cell * 1.05, PAL.cold.glow, PAL.cold.hot);
      add(ctx, function () {
        for (var s = 0; s < 7; s++) {
          var an = s / 7 * TAU + 0.2, d1 = G.rT * 0.3 + easeOut(clamp(tb / 160)) * G.cell * 0.65;
          ctx.save(); ctx.translate(B.x + Math.cos(an) * d1, B.y + Math.sin(an) * d1); ctx.rotate(an);
          ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(0, 2.4); ctx.lineTo(-6, 0); ctx.lineTo(0, -2.4); ctx.closePath();
          ctx.fillStyle = rgba(PAL.cold.hot, 1 - u); ctx.fill(); ctx.restore();
        }
      });
      sparks(ctx, B.x, B.y, tb, 12, seed, 110, 700, PAL.cold.core, 1.3, 12);
      return;
    }
    if (key === "acid") {
      ctx.save(); ctx.fillStyle = rgba(PAL.acid.dark, 0.55 * (1 - u));
      ctx.beginPath();
      if (ctx.ellipse) ctx.ellipse(B.x, B.y + 4, G.cell * 0.62 * easeOut(clamp(tb / 150)), G.cell * 0.4 * easeOut(clamp(tb / 150)), 0, 0, TAU);
      else ctx.arc(B.x, B.y + 4, G.cell * 0.45 * easeOut(clamp(tb / 150)), 0, TAU);
      ctx.fill(); ctx.restore();
      add(ctx, function () {
        glow(ctx, B.x, B.y, G.cell * 0.85, [[0, rgba(PAL.acid.hot, 0.75 * (1 - u))], [0.45, rgba(PAL.acid.core, 0.5 * (1 - u))], [1, rgba(PAL.acid.glow, 0)]]);
        ring(ctx, B.x, B.y, G.rT * 0.45 + easeOut(u) * G.cell * 0.65, 2.4 * (1 - u), rgba(PAL.acid.core, 1 - u), 8);
      });
      return;
    }
    if (key === "lightning") {
      flash(ctx, B, tb, 560, G.cell * 1.0, PAL.lightning.glow, PAL.lightning.hot);
      sparks(ctx, B.x, B.y, tb, 14, seed, 160, 560, PAL.lightning.core, 1.4, 0);
      return;
    }
    if (key === "poison") {
      add(ctx, function () { glow(ctx, B.x, B.y, G.cell * 0.9, [[0, rgba(PAL.poison.hot, 0.55 * (1 - u))], [0.5, rgba(PAL.poison.core, 0.4 * (1 - u))], [1, rgba(PAL.poison.glow, 0)]]); });
      var r = rng(seed);
      for (var k = 0; k < 7; k++) {
        var age = ((tb / 700) + r()) % 1, an2 = r() * TAU;
        glow(ctx, B.x + Math.cos(an2) * G.rT * 0.7, B.y + Math.sin(an2) * G.rT * 0.5 - age * 18, 6 + age * 6, [[0, rgba(PAL.poison.core, 0.35 * (1 - u) * Math.sin(Math.PI * age))], [1, rgba(PAL.poison.glow, 0)]]);
      }
      return;
    }
    ring(ctx, B.x, B.y, G.rT + easeOut(u) * G.cell * 0.9, 4 * (1 - u) + 1, rgba(c.core, 1 - u));
    add(ctx, function () { glow(ctx, B.x, B.y, G.cell * 0.8, [[0, rgba(c.hot, 0.55 * (1 - u))], [1, rgba(c.glow, 0)]]); });
  }
  function chromatic(ctx, lt, G) {
    var A = G.A || G.S, B = targetOf(G); if (!A || !B) return;
    var key = orbKey(G.dmg), c = orbPalette(key), travel = 240;
    if (lt < travel) {
      var p = easeInOut(clamp(lt / travel)), H = lp(A, B, p);
      add(ctx, function () {
        for (var k = 6; k >= 1; k--) {
          var P = lp(A, B, clamp(p - k * 0.04));
          glow(ctx, P.x, P.y, 10 - k, [[0, rgba(c.core, 0.6 * (1 - k / 7))], [1, rgba(c.glow, 0)]]);
        }
        glow(ctx, H.x, H.y, 18, [[0, rgba(c.hot, 1)], [0.35, rgba(c.core, 0.95)], [0.7, rgba(c.glow, 0.5)], [1, rgba(c.glow, 0)]]);
      });
      ctx.save(); ctx.beginPath(); ctx.arc(H.x, H.y, 6.2, 0, TAU); ctx.lineWidth = 1.5; ctx.strokeStyle = rgba(c.glow, 0.9); ctx.stroke(); ctx.restore();
      return;
    }
    orbBurst(ctx, B, key, lt - travel, G, 40);
  }

  /* 8. Produce Flame — held coal on the caster. Throw only when the attack leaves the square. */
  function palm(S, rS) { return { x: S.x + rS * 0.72, y: S.y - rS * 0.72 }; }
  function coal(ctx, M, S, lt, a, G) {
    if (!M || a <= 0) return;
    var fl = 0.85 + 0.15 * Math.sin(lt / 45);
    add(ctx, function () {
      if (S) glow(ctx, S.x, S.y, G.cell * 1.15, [[0, rgba(PAL.fire.core, 0.12 * a)], [1, rgba(PAL.fire.glow, 0)]]);
      glow(ctx, M.x, M.y, 13 * fl, [[0, rgba(PAL.fire.ball, a)], [0.4, rgba(PAL.fire.core, 0.85 * a)], [1, rgba(PAL.fire.glow, 0)]]);
      for (var f = 0; f < 3; f++) {
        ctx.save(); ctx.translate(M.x + (f - 1) * 3, M.y + 2);
        tongue(ctx, 3, (8 + 4 * Math.sin(lt / 70 + f * 2)) * a, rgba(PAL.fire.core, 0.8 * a));
        tongue(ctx, 1.5, (5 + 2 * Math.sin(lt / 50 + f)) * a, rgba(PAL.fire.hot, 0.9 * a));
        ctx.restore();
      }
    });
  }
  function produceFlame(ctx, lt, G) {
    var S = G.S || G.A; if (!S) return;
    var M = palm(S, G.rS || 18);
    if (G.quiet || !G.throw) {
      var ign = G.quiet ? 1 : easeOut(clamp(lt / 280));
      coal(ctx, M, S, lt, ign, G);
      if (!G.quiet && lt < 420) add(ctx, function () {
        var u = clamp(lt / 420);
        ring(ctx, M.x, M.y, 4 + u * 14, 2 * (1 - u), rgba(PAL.fire.hot, 1 - u), 6);
      });
      return;
    }
    var B = targetOf(G); if (!B) { coal(ctx, M, S, lt, 1, G); return; }
    var release = 70, travel = 240;
    if (lt < release) coal(ctx, M, S, lt, 1, G);
    var t = lt - release;
    if (t >= 0 && t < travel) {
      var p = clamp(t / travel), H = lp(M, B, p);
      H = { x: H.x, y: H.y - Math.sin(Math.PI * p) * G.cell * 0.45 };
      add(ctx, function () {
        for (var k = 8; k >= 1; k--) {
          var q = clamp(p - k * 0.045), P = lp(M, B, q);
          P.y -= Math.sin(Math.PI * q) * G.cell * 0.45;
          glow(ctx, P.x, P.y, 6 - k * 0.35, [[0, rgba(PAL.fire.burst, 0.7 * (1 - k / 9))], [1, rgba(PAL.fire.glow, 0)]]);
        }
        glow(ctx, H.x, H.y, 12, [[0, rgba(PAL.fire.ball, 1)], [0.45, rgba(PAL.fire.core, 0.85)], [1, rgba(PAL.fire.glow, 0)]]);
      });
    }
    fireBurst(ctx, B, t - travel, 620, G.cell * 0.72, 13);
  }

  /* 9. Ray of Frost and Ray of Sickness. */
  var RF = { grow: 70, hold: 260, fade: 460 };
  function needle(ctx, A, B, t, glowC, coreC, wavy, dark) {
    if (!A || !B || t < 0) return;
    var a = 1 - clamp((t - RF.hold) / (RF.fade - RF.hold));
    if (a <= 0) return;
    var H = lp(A, B, easeOut(clamp(t / RF.grow))), pts = [A, H];
    if (wavy) {
      pts = [];
      var n = norm(A, B), L = dist(A, H);
      for (var i = 0; i <= 28; i++) {
        var u = i / 28, o = Math.sin(u * L / 14 + t / 40) * 2.4;
        pts.push({ x: A.x + n.x * u * L - n.y * o, y: A.y + n.y * u * L + n.x * o });
      }
      stroke(ctx, pts, 7, rgba(dark || PAL.poison.dark, 0.8 * a), 8, rgba(dark || PAL.poison.dark, a));
      stroke(ctx, pts, 2.4, "rgba(135,140,55," + a + ")");
      add(ctx, function () { stroke(ctx, pts, 5, rgba(glowC, 0.14 * a), 6); glow(ctx, H.x, H.y, 8, [[0, rgba(coreC, 0.5 * a)], [1, rgba(glowC, 0)]]); });
      return;
    }
    add(ctx, function () {
      stroke(ctx, pts, 5, rgba(glowC, 0.45 * a), 8, rgba(glowC, a));
      stroke(ctx, pts, 1.5, rgba(coreC, a));
      glow(ctx, H.x, H.y, 9, [[0, rgba(coreC, a)], [1, rgba(glowC, 0)]]);
    });
  }
  function frostRay(ctx, lt, G) {
    var B = targetOf(G); if (!B) return;
    var A = G.A || G.S;
    if (!G.quiet) needle(ctx, A, B, lt, PAL.cold.glow, PAL.cold.hot, false);
    var th = lt - (G.quiet ? 0 : RF.grow);
    if (!G.quiet && th >= 0 && th < 380) {
      var u = th / 380;
      add(ctx, function () {
        glow(ctx, B.x, B.y, G.cell * 0.65, [[0, rgba(PAL.cold.hot, 0.75 * (1 - u))], [1, rgba(PAL.cold.glow, 0)]]);
        ctx.strokeStyle = rgba(PAL.cold.hot, 1 - u); ctx.lineWidth = 1.3;
        var r = rng(4);
        for (var s = 0; s < 5; s++) {
          var an = r() * TAU;
          ctx.beginPath();
          ctx.moveTo(B.x + Math.cos(an) * G.rT * 0.3, B.y + Math.sin(an) * G.rT * 0.3);
          ctx.lineTo(B.x + Math.cos(an + 0.35) * G.rT * 0.7, B.y + Math.sin(an + 0.35) * G.rT * 0.7);
          ctx.lineTo(B.x + Math.cos(an) * G.rT * 1.05, B.y + Math.sin(an) * G.rT * 1.05);
          ctx.stroke();
        }
      });
    }
    var rim = G.quiet ? 0.9 : env(lt, RF.grow + 30, RF.grow + 220, 900, 1200);
    if (rim > 0) {
      add(ctx, function () {
        ring(ctx, B.x, B.y, G.rT + 2, 2.1, rgba(PAL.cold.core, 0.75 * rim), 8);
        var r2 = rng(15);
        for (var i = 0; i < 12; i++) {
          var an2 = r2() * TAU, L2 = 4 + r2() * 5;
          ctx.save(); ctx.translate(B.x + Math.cos(an2) * (G.rT + 2), B.y + Math.sin(an2) * (G.rT + 2)); ctx.rotate(an2 + Math.PI / 2);
          ctx.beginPath(); ctx.moveTo(0, -L2); ctx.lineTo(2, 0); ctx.lineTo(0, L2 * 0.35); ctx.lineTo(-2, 0); ctx.closePath();
          ctx.fillStyle = rgba(PAL.cold.hot, 0.8 * rim); ctx.fill(); ctx.restore();
        }
      });
      pill(ctx, B.x, B.y - G.rT - 14, "SPD \u221210", rim, "rgba(22,32,48,0.92)", rgba(PAL.cold.core, 1), "rgba(220,235,250,1)");
    }
  }
  function sickRay(ctx, lt, G) {
    var B = targetOf(G); if (!B) return;
    var A = G.A || G.S;
    if (!G.quiet) needle(ctx, A, B, lt, PAL.poison.glow, PAL.poison.core, true, PAL.poison.dark);
    var ts = lt - (G.quiet ? 0 : RF.grow);
    if (!G.quiet && ts >= 0 && ts < 450) {
      var v = ts / 450;
      add(ctx, function () { glow(ctx, B.x, B.y, G.cell * 0.7, [[0, rgba(PAL.poison.core, 0.4 * (1 - v))], [1, rgba(PAL.poison.glow, 0)]]); });
    }
    var sa = G.quiet ? 0.9 : clamp(ts / 280);
    if (sa > 0) {
      var r2 = rng(8);
      for (var k = 0; k < 7; k++) {
        var age = ((lt / 1400) + r2()) % 1, an2 = r2() * TAU;
        glow(ctx, B.x + Math.cos(an2) * G.rT * 0.75, B.y + Math.sin(an2) * G.rT * 0.55 - age * 20, 6 + age * 6, [[0, rgba(PAL.poison.core, 0.32 * sa * Math.sin(Math.PI * age))], [1, rgba(PAL.poison.glow, 0)]]);
      }
      /* Lasting POISONED word is the map condition chip (same olive/gold, over the token).
         A quiet rider must not stack a second pill on that chip. The cast still flashes the word. */
      if (!G.quiet) pill(ctx, B.x, B.y - G.rT - 14, "POISONED", sa, "rgba(36,36,16,0.92)", rgba(PAL.poison.core, 1), "rgba(230,225,170,1)");
    }
  }

  /* 10. Smite family — weapon-edge flash, then the rider. No cast missile. */
  function weaponEdge(ctx, S, B, t, G) {
    if (!S || !B || t < 0 || t > 260) return;
    var a = 1 - t / 260, p = clamp(t / 90), ang = Math.atan2(B.y - S.y, B.x - S.x), r = (G.rS || 18) + 5, pts = [];
    for (var i = 0; i <= 12; i++) {
      var an = ang - 0.8 + (i / 12) * 1.6 * p;
      pts.push({ x: S.x + Math.cos(an) * r, y: S.y + Math.sin(an) * r });
    }
    add(ctx, function () {
      stroke(ctx, pts, 6, "rgba(255,240,200," + (0.4 * a) + ")", 10);
      stroke(ctx, pts, 2.2, "rgba(255,252,240," + a + ")");
    });
  }
  function brandStar(ctx, B, rT, lt, a) {
    if (!B || a <= 0) return;
    var br = 0.55 + 0.12 * Math.sin(lt / 300);
    add(ctx, function () {
      ring(ctx, B.x, B.y, rT * 0.62, 2, rgba(PAL.radiant.core, 0.8 * a * br), 10);
      star(ctx, B.x, B.y, rT * 0.5, 5, 0.42, PAL.radiant.hot, 0.62 * a * br, 0, PAL.radiant.glow);
      ring(ctx, B.x, B.y, rT + 5, 1.4, rgba(PAL.radiant.glow, 0.5 * a * br), 8);
    });
  }
  function smiteOf(kind) {
    return function (ctx, lt, G) {
      var S = G.S || G.A, B = targetOf(G); if (!B) return;
      if (G.quiet && kind === "branding") { brandStar(ctx, B, G.rT, lt, 0.9); return; }
      weaponEdge(ctx, S, B, lt, G);
      var tb = lt - 110;
      if (tb < 0) return;
      if (kind === "searing") fireBurst(ctx, B, tb, 680, G.cell * 0.95, 3);
      if (kind === "branding") {
        flash(ctx, B, tb, 420, G.cell * 0.95, PAL.radiant.glow, PAL.radiant.hot);
        brandStar(ctx, B, G.rT, lt, clamp(tb / 180));
      }
      if (kind === "thunderous") {
        if (tb < 560) {
          var u = tb / 560;
          ring(ctx, B.x, B.y, G.rT + easeOut(u) * G.cell * 1.25, 6 * (1 - u) + 1, rgba(PAL.thunder.dust, 0.7 * (1 - u)));
          add(ctx, function () {
            ring(ctx, B.x, B.y, G.rT + easeOut(u) * G.cell * 1.15, 3 * (1 - u) + 0.5, rgba(PAL.thunder.core, 1 - u), 10);
            glow(ctx, B.x, B.y, G.cell * 0.75, [[0, rgba(PAL.thunder.hot, 0.55 * (1 - u))], [1, rgba(PAL.thunder.glow, 0)]]);
          });
          gritBurst(ctx, B.x, B.y, tb, 620, 16, 21, G.cell * 0.9, ["95,80,60", "120,100,75"]);
        }
        var away = (S && B) ? norm(S, B) : { x: 1, y: 0 };
        var pa = env(tb, 0, 40, 280, 620);
        if (pa > 0) {
          for (var c = 0; c < 3; c++) {
            var along = G.rT + 8 + c * (G.cell * 0.38);
            var P = { x: B.x + away.x * along, y: B.y + away.y * along };
            var px = -away.y, py = away.x;
            stroke(ctx, [
              { x: P.x - away.x * 6 + px * 8, y: P.y - away.y * 6 + py * 8 },
              P,
              { x: P.x - away.x * 6 - px * 8, y: P.y - away.y * 6 - py * 8 }
            ], 2.4, "rgba(240,225,190," + (0.85 * pa * (1 - c * 0.22)) + ")", 4, "rgba(0,0,0,0.8)");
          }
        }
      }
      if (kind === "wrathful") {
        flash(ctx, B, tb, 400, G.cell * 0.85, PAL.necrotic.glow, PAL.necrotic.hex);
        var wa = env(tb, 0, 100, 700, 1100);
        if (wa > 0) {
          var r = rng(17);
          for (var k = 0; k < 8; k++) {
            var age = ((tb / 900) + r()) % 1, an = r() * TAU, pts = [];
            for (var j = 0; j <= 8; j++) {
              var vv = j / 8;
              pts.push({ x: B.x + Math.cos(an) * G.rT * 0.65 + Math.sin(vv * 5 + k) * 3, y: B.y - age * 22 - vv * 16 });
            }
            add(ctx, function () { stroke(ctx, pts, 2.1, rgba(PAL.necrotic.hex, 0.7 * wa * Math.sin(Math.PI * age)), 6); });
          }
        }
      }
      if (kind === "blinding" && tb < 560) {
        var bu = tb / 560;
        add(ctx, function () {
          star(ctx, B.x, B.y, G.cell * (0.55 + 0.32 * easeOut(bu)), 10, 0.16, PAL.blind, 1 - bu, 0.2, PAL.radiant.glow);
          glow(ctx, B.x, B.y, G.cell * 1.0, [[0, rgba(PAL.blind, 0.9 * (1 - bu))], [1, rgba(PAL.blind, 0)]]);
        });
      }
    };
  }

  function tokenState(look, lt, id, G) {
    var s = { dx: 0, dy: 0, grey: 0, tint: null };
    if (id !== "target") return s;
    if ((look === "deathray" || look === "finger") && (G.rise || G.killed)) s.grey = G.rise ? clamp(lt / 420) : clamp((lt - 700) / 400);
    if (look === "frostray") {
      var rim = G.quiet ? 0.9 : env(lt, RF.grow + 30, RF.grow + 220, 900, 1200);
      if (rim > 0) s.tint = { col: PAL.cold.mist, a: 0.28 * rim };
    }
    if (look === "sickray") {
      var sa = G.quiet ? 0.85 : clamp((lt - RF.grow) / 280);
      if (sa > 0) s.tint = { col: PAL.poison.glow, a: 0.34 * sa };
    }
    return s;
  }
  var PAINT = {
    skybolt: callLightning,
    sunshaft: sunbeam,
    deathray: fingerOfDeath,
    prism: prismatic,
    meteors: meteor,
    guardian: guardian,
    orb: chromatic,
    produceflame: produceFlame,
    frostray: frostRay,
    sickray: sickRay,
    smitefire: smiteOf("searing"),
    smitebrand: smiteOf("branding"),
    smiteboom: smiteOf("thunderous"),
    fear: smiteOf("wrathful"),
    blind: smiteOf("blinding")
  };
  var UNDER = { skybolt: skyUnder, meteors: meteorUnder };
  function shakeOf(look, lt, spec) {
    function sh(t0, mag, dur) {
      var t = lt - t0;
      if (t < 0 || t > dur) return { x: 0, y: 0 };
      var k = mag * (1 - t / dur);
      return { x: Math.sin(t * 0.9) * k, y: Math.cos(t * 1.3) * k };
    }
    var beat = spec && spec.beat ? Number(spec.beat) || 0 : 0;
    if (look === "skybolt") return sh(CL.drop + CL.dropDur, 3.2, 200);
    if (look === "meteors") return sh(MS.travel + beat * MS.gap, 4.2, 260);
    if (look === "deathray" && !(spec && spec.rise)) return sh(FD.grow, 1.6, 160);
    if (look === "smiteboom") return sh(120, 3, 200);
    return { x: 0, y: 0 };
  }
  return {
    looks: Object.keys(PAINT),
    paint: function (ctx, look, lt, G) { if (PAINT[look] && lt >= 0) PAINT[look](ctx, lt, G); },
    paintUnder: function (ctx, look, lt, G) { if (UNDER[look] && lt >= 0) UNDER[look](ctx, lt, G); },
    tokenState: tokenState,
    shakeOf: shakeOf,
    orbKey: orbKey
  };
  })();

  /* Chunk 4 Phase 1 Love-it outlines. Shape + clear effect. One beat per real cast, enter, start, end, Clear, or detonate.
     Demo clocks (foe step-ins, scripted second skins, the DM CLEAR pill) are not reproduced.
     Phase 2 first cut: Flame Strike and Fire Storm flung dirt, Sunburst dust motes, Freezing Sphere debris.
     Still out: wall-raise dust, thorn dust, briar grit, Blade Barrier sparks, Hunger whispers. Art idle webms are not in the tip assets, so slots 4–5 loop on the canvas.
     Sticky walls, voids, cubes, swarms, furnace clouds, and the Delayed Blast bead idle on the zone layer.
     Rules radii: Freezing Sphere, Sunburst, and Circle of Death are 60 ft. The Love-it board drew those at 4.5 cells. */
  var Chunk4Fx = (function () {
    var TAU = Math.PI * 2;
    var PAL = {
      fire: { glow: "200,60,15", core: "255,125,35", hot: "255,225,160", burst: "255,140,45", ball: "255,242,205", smoke: "40,34,30" },
      cold: { glow: "80,125,185", core: "200,225,250", hot: "250,252,255", mist: "150,185,225" },
      radiant: { glow: "230,175,70", core: "255,232,170", hot: "255,250,230" },
      necrotic: { glow: "95,45,100", black: "6,3,8", bone: "185,170,180", ash: "120,112,118", hex: "170,90,190" },
      acid: { glow: "80,135,25", core: "125,180,40", bloom: "175,210,55", hot: "225,235,150" },
      voidc: { body: "6,3,8", vein: "14,8,16", plum: "60,30,66" },
      steel: { metal: "90,95,105", glint: "220,225,235", spark: "255,190,110", grip: "70,45,28" },
      briar: { wood: "70,62,38", bark: "135,115,75", sage: "110,120,70", prick: "150,175,80", prickHot: "220,235,170" },
      swarm: { body: "70,50,30", wing: "150,130,95", bite: "200,60,40", biteHot: "255,170,140" },
      blind: "255,250,235"
    };
    var AH = { out: 280, hold: 430, back: 760 };
    var FZ = { travel: 380, det: 820 };
    function clamp(v, a, b) { a = a === undefined ? 0 : a; b = b === undefined ? 1 : b; return Math.max(a, Math.min(b, v)); }
    function rgba(c, a) { return "rgba(" + c + "," + clamp(a) + ")"; }
    function lerp(a, b, t) { return a + (b - a) * t; }
    function lp(A, B, t) { return { x: lerp(A.x, B.x, t), y: lerp(A.y, B.y, t) }; }
    function easeOut(t) { return 1 - Math.pow(1 - clamp(t), 3); }
    function easeIn(t) { t = clamp(t); return t * t; }
    function easeInOut(t) { t = clamp(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
    function env(t, a, b, c, d) { if (t < a || t > d) return 0; if (t < b) return (t - a) / Math.max(1, b - a); if (t <= c) return 1; return 1 - (t - c) / Math.max(1, d - c); }
    function rng(seed) { var s = (seed * 2654435761) >>> 0; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
    function dist(A, B) { return Math.hypot(B.x - A.x, B.y - A.y); }
    function norm(A, B) { var d = dist(A, B) || 1; return { x: (B.x - A.x) / d, y: (B.y - A.y) / d }; }
    function jag(A, B, segs, amp, seed) {
      var r = rng(seed), n = norm(A, B), px = -n.y, py = n.x, pts = [];
      for (var i = 0; i <= segs; i++) {
        var u = i / segs, o = (i === 0 || i === segs) ? 0 : (r() - 0.5) * 2 * amp;
        pts.push({ x: lerp(A.x, B.x, u) + px * o, y: lerp(A.y, B.y, u) + py * o });
      }
      return pts;
    }
    function poly(ctx, pts) {
      if (!pts || !pts.length) return;
      ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
      for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    }
    function stroke(ctx, pts, w, col, blur, blurCol) {
      if (!pts || pts.length < 2) return;
      ctx.save(); ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.lineWidth = w; ctx.strokeStyle = col;
      if (blur) { ctx.shadowBlur = blur; ctx.shadowColor = blurCol || col; }
      poly(ctx, pts); ctx.stroke(); ctx.restore();
    }
    function glow(ctx, x, y, r, stops) {
      if (!(r > 0.5)) return;
      var g = ctx.createRadialGradient(x, y, 0, x, y, r);
      for (var i = 0; i < stops.length; i++) g.addColorStop(stops[i][0], stops[i][1]);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    }
    function add(ctx, fn) { ctx.save(); ctx.globalCompositeOperation = "lighter"; fn(); ctx.restore(); }
    function ring(ctx, x, y, r, w, col, blur) {
      if (!(r > 0) || !(w > 0)) return;
      ctx.save(); ctx.lineWidth = w; ctx.strokeStyle = col;
      if (blur) { ctx.shadowBlur = blur; ctx.shadowColor = col; }
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke(); ctx.restore();
    }
    function sparks(ctx, x, y, t, n, seed, speed, life, col, size, grav) {
      if (t < 0 || t > life) return;
      var r = rng(seed), u = t / life;
      add(ctx, function () {
        for (var i = 0; i < n; i++) {
          var a = r() * TAU, v = speed * (0.4 + r() * 0.8), d = v * (1 - Math.pow(1 - u, 2)) * life / 1000 * 0.6;
          ctx.fillStyle = rgba(col, (1 - u) * (0.6 + r() * 0.4));
          ctx.beginPath();
          ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d + (grav || 0) * u * u, size * (1 - u * 0.5), 0, TAU);
          ctx.fill();
        }
      });
    }
    function tongue(ctx, w, h, fill) {
      ctx.beginPath(); ctx.moveTo(-w, 0); ctx.quadraticCurveTo(-w * 0.4, -h * 0.6, 0, -h); ctx.quadraticCurveTo(w * 0.4, -h * 0.6, w, 0); ctx.closePath();
      ctx.fillStyle = fill; ctx.fill();
    }
    function flameRing(ctx, x, y, R, n, lt, a, h0, seed) {
      for (var i = 0; i < n; i++) {
        var an = i / n * TAU + lt / 2200, h = h0 * (0.55 + 0.45 * (0.5 + 0.5 * Math.sin(lt / 85 + i * 2.3 + seed)));
        ctx.save(); ctx.translate(x + Math.cos(an) * R, y + Math.sin(an) * R); ctx.rotate(an + Math.PI / 2);
        var kw = Math.max(1, Math.sqrt(Math.max(1, R) / 40));
        tongue(ctx, 4.2 * kw, h, rgba(PAL.fire.core, 0.7 * a));
        tongue(ctx, 2 * kw, h * 0.6, rgba(PAL.fire.hot, 0.8 * a));
        ctx.restore();
      }
    }
    function fireBurst(ctx, B, t, life, R, seed) {
      if (!B || t < 0 || t > life) return;
      var u = t / life;
      add(ctx, function () {
        glow(ctx, B.x, B.y, R * (0.55 + 0.45 * easeOut(clamp(t / 140))), [[0, rgba(PAL.fire.ball, 0.95 * (1 - u))], [0.3, rgba(PAL.fire.core, 0.8 * (1 - u))], [0.7, rgba(PAL.fire.glow, 0.45 * (1 - u))], [1, rgba(PAL.fire.glow, 0)]]);
        flameRing(ctx, B.x, B.y, R * 0.55 * (0.7 + 0.3 * easeOut(u)), 12, t, 1 - u, R * 0.45, seed);
      });
      sparks(ctx, B.x, B.y, t, 18, seed, 160, life, PAL.fire.burst, 1.6, -18);
    }
    function scorch(ctx, B, R, a) {
      if (!B || a <= 0) return;
      glow(ctx, B.x, B.y + 2, R, [[0, "rgba(10,6,3," + (0.7 * a) + ")"], [0.65, "rgba(18,10,5," + (0.5 * a) + ")"], [1, "rgba(18,10,5,0)"]]);
      ctx.save(); ctx.strokeStyle = "rgba(80,35,10," + (0.5 * a) + ")"; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(B.x, B.y + 2, R * 0.6, 0, TAU); ctx.stroke(); ctx.restore();
    }
    function star(ctx, x, y, r, n, inner, fill, a, rot, blurCol) {
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot || 0); ctx.beginPath();
      for (var i = 0; i < n * 2; i++) {
        var rr = i % 2 ? r * inner : r, an = i / (n * 2) * TAU - Math.PI / 2;
        ctx.lineTo(Math.cos(an) * rr, Math.sin(an) * rr);
      }
      ctx.closePath(); ctx.fillStyle = rgba(fill, a);
      if (blurCol) { ctx.shadowBlur = 10; ctx.shadowColor = rgba(blurCol, a); }
      ctx.fill(); ctx.restore();
    }
    function wedge(ctx, A, ang, L, w0, w1, fill) {
      var n = { x: Math.cos(ang), y: Math.sin(ang) }, px = -n.y, py = n.x, B = { x: A.x + n.x * L, y: A.y + n.y * L };
      ctx.beginPath();
      ctx.moveTo(A.x + px * w0, A.y + py * w0);
      ctx.lineTo(B.x + px * w1, B.y + py * w1);
      ctx.lineTo(B.x - px * w1, B.y - py * w1);
      ctx.lineTo(A.x - px * w0, A.y - py * w0);
      ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
    }
    function flash(ctx, B, t, life, R, col, hot) {
      if (!B || t < 0 || t > life) return;
      var u = t / life;
      add(ctx, function () {
        glow(ctx, B.x, B.y, R * (0.6 + 0.4 * u), [[0, rgba(hot, 1 - u)], [0.4, rgba(col, 0.55 * (1 - u))], [1, rgba(col, 0)]]);
        ring(ctx, B.x, B.y, R * 0.45 + easeOut(u) * R * 0.6, 3 * (1 - u) + 0.5, rgba(hot, 1 - u), 10);
      });
    }
    function shard(ctx, x, y, an, L, w, col) {
      ctx.save(); ctx.translate(x, y); ctx.rotate(an); ctx.beginPath();
      ctx.moveTo(L, 0); ctx.lineTo(0, w); ctx.lineTo(-L * 0.6, 0); ctx.lineTo(0, -w); ctx.closePath();
      ctx.fillStyle = col; ctx.fill(); ctx.restore();
    }
    function collapse(ctx, B, t, R0, R1, seed) {
      if (!B) return;
      if (t >= 0 && t < 420) {
        var u = easeOut(t / 420), R = lerp(R0, R1, u);
        add(ctx, function () { ring(ctx, B.x, B.y, R, 5 * (1 - u) + 1, rgba(PAL.necrotic.hex, 0.95 * (1 - u * 0.6)), 14); });
        glow(ctx, B.x, B.y, R, [[0, rgba(PAL.necrotic.black, 0.6 * u)], [1, rgba(PAL.necrotic.black, 0)]]);
      }
      var r = rng(seed);
      for (var q = 0; q < 18; q++) {
        var t0 = r() * 500, age = (t - t0) / 1000, an = r() * TAU, rad = R1 * (0.6 + r() * 1.6);
        if (age < 0 || age > 1) continue;
        ctx.save();
        ctx.translate(B.x + Math.cos(an) * rad * (1 + age * 0.4), B.y + Math.sin(an) * rad + age * 16);
        ctx.rotate(age * 5 + q);
        ctx.fillStyle = rgba(PAL.necrotic.ash, 0.9 * (1 - age));
        ctx.fillRect(-1.8, -1.1, 3.6, 2.2);
        ctx.restore();
      }
    }
    function clearPop(ctx, C, R, t) {
      if (!C || t < 0 || t > 800) return;
      var v = t / 800, r = rng(91);
      for (var k = 0; k < 34; k++) {
        var an = r() * TAU, d = R * (0.3 + r() * 0.8) * (0.6 + 0.4 * easeOut(v));
        ctx.fillStyle = "rgba(150,140,125," + (0.55 * (1 - v) * (0.4 + r() * 0.6)) + ")";
        ctx.beginPath();
        ctx.arc(C.x + Math.cos(an) * d, C.y + Math.sin(an) * d - v * 10, 1.8, 0, TAU);
        ctx.fill();
      }
    }
    function band(ctx, A, B, hw, fill) {
      if (!A || !B) return;
      var n = norm(A, B), px = -n.y * hw, py = n.x * hw;
      ctx.beginPath();
      ctx.moveTo(A.x + px, A.y + py); ctx.lineTo(B.x + px, B.y + py); ctx.lineTo(B.x - px, B.y - py); ctx.lineTo(A.x - px, A.y - py);
      ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
    }
    function oval(ctx, rx, ry) {
      ctx.beginPath();
      if (ctx.ellipse) ctx.ellipse(0, 0, Math.max(0.4, rx), Math.max(0.4, ry), 0, 0, TAU);
      else ctx.arc(0, 0, Math.max(rx, ry), 0, TAU);
    }
    function centerOf(G) { return (G && G.Z) || (G && G.T && G.T[0]) || null; }
    function marksOf(G) { return (G && G.T) || []; }
    function slashHit(ctx, B, t, G, seed) {
      if (!B || t < 0 || t > 520) return;
      var u = t / 520, r = rng(seed), rT = G.rT || 18;
      for (var s = 0; s < 3; s++) {
        var ts = t - s * 50;
        if (ts < 0 || ts > 240) continue;
        var a = 1 - ts / 240, p = clamp(ts / 70), an = -0.7 + r() * 0.5 + s * 0.55, n = { x: Math.cos(an), y: Math.sin(an) };
        var P0 = { x: B.x - n.x * rT * 1.1, y: B.y - n.y * rT * 1.1 }, P1 = { x: P0.x + n.x * rT * 2.2 * p, y: P0.y + n.y * rT * 2.2 * p };
        add(ctx, function () { stroke(ctx, [P0, P1], 5, rgba(PAL.steel.spark, 0.45 * a), 8); stroke(ctx, [P0, P1], 1.6, rgba(PAL.steel.glint, a)); });
      }
      sparks(ctx, B.x, B.y, t, 16, seed, 190, 520, PAL.steel.spark, 1.4, 14);
      add(ctx, function () { glow(ctx, B.x, B.y, G.cell * 0.6, [[0, rgba(PAL.steel.spark, 0.45 * (1 - u))], [1, rgba(PAL.steel.spark, 0)]]); });
    }
    function iceHit(ctx, B, t, G) {
      if (!B || t < 0 || t > 600) return;
      var u = t / 600;
      flash(ctx, B, t, 520, G.cell, PAL.cold.glow, PAL.cold.hot);
      add(ctx, function () {
        for (var s = 0; s < 8; s++) {
          var an = s / 8 * TAU + 0.2, d = (G.rT || 16) * 0.3 + easeOut(clamp(t / 160)) * G.cell * 0.7;
          shard(ctx, B.x + Math.cos(an) * d, B.y + Math.sin(an) * d, an, 7, 2.5, rgba(PAL.cold.hot, 1 - u));
        }
      });
      sparks(ctx, B.x, B.y, t, 12, 8, 110, 600, PAL.cold.core, 1.3, 14);
    }
    function thornHit(ctx, B, t, G) {
      if (!B || t < 0 || t > 600) return;
      var u = t / 600;
      flash(ctx, B, t, 480, G.cell * 0.85, PAL.briar.prick, PAL.briar.prickHot);
      for (var s = 0; s < 7; s++) {
        var an = s / 7 * TAU + 0.5, d = lerp(G.cell * 0.95, (G.rT || 16) * 0.45, easeOut(clamp(t / 180)));
        shard(ctx, B.x + Math.cos(an) * d, B.y + Math.sin(an) * d, an + Math.PI, 7, 2, rgba("62,50,26", 1 - u));
      }
      sparks(ctx, B.x, B.y, t, 8, 12, 70, 600, PAL.briar.prick, 1.2, 10);
    }
    function biteHit(ctx, B, t, G, seed) {
      if (!B || t < 0 || t > 560) return;
      var u = t / 560, rb = rng(seed);
      flash(ctx, B, t, 440, G.cell * 0.7, PAL.swarm.bite, PAL.swarm.biteHot);
      for (var k = 0; k < 10; k++) {
        var an = rb() * TAU, d = lerp(G.cell * 0.9, (G.rT || 16) * 0.55, easeOut(clamp(t / 220)));
        ctx.save(); ctx.translate(B.x + Math.cos(an) * d, B.y + Math.sin(an) * d); ctx.rotate(an);
        ctx.fillStyle = rgba(PAL.swarm.body, 0.9 * (1 - u)); oval(ctx, 2.8, 1.2); ctx.fill(); ctx.restore();
      }
    }
    function tickMarks(ctx, lt, G, fn) {
      marksOf(G).forEach(function (B, i) { fn(ctx, B, lt - i * 40, G, 40 + i); });
    }

    /* Walls. One skin per cast, along the aimed line. Idle is the zone layer. */
    function wallEnd(W, lt, mode) {
      var p = mode === "idle" ? 1 : easeOut(clamp(lt / 360));
      return { p: p, E: lp(W.A, W.B, p), a: mode === "idle" ? 0.62 : lerp(1, 0.62, clamp((lt - 360) / 500)) };
    }
    function iceWall(ctx, W, lt, G, mode) {
      var st = wallEnd(W, lt, mode), a = st.a, E = st.E, c = G.cell, hw = c * 0.24, n = norm(W.A, W.B), L = dist(W.A, E), r = rng(3);
      band(ctx, W.A, E, hw, rgba(PAL.cold.mist, 0.38 * a));
      band(ctx, W.A, E, hw * 0.45, rgba(PAL.cold.core, 0.22 * a));
      add(ctx, function () {
        band(ctx, W.A, E, hw * 1.3, rgba(PAL.cold.glow, 0.16 * a));
        stroke(ctx, [{ x: W.A.x, y: W.A.y - hw }, { x: E.x, y: E.y - hw }], 1.6, rgba(PAL.cold.core, 0.8 * a), 6);
        stroke(ctx, [{ x: W.A.x, y: W.A.y + hw }, { x: E.x, y: E.y + hw }], 1.6, rgba(PAL.cold.core, 0.8 * a), 6);
        var step = c * 0.5, guard = 0;
        for (var k = 0; k * step <= L && guard < 80; k++, guard++) {
          var P = { x: W.A.x + n.x * k * step, y: W.A.y + n.y * k * step };
          star(ctx, P.x, P.y, hw * (k % 2 ? 0.6 : 0.95), 6, 0.32, PAL.cold.core, (k % 2 ? 0.35 : 0.6) * a, 0, PAL.cold.glow);
        }
        for (var q = 0; q < 26; q++) {
          var u = r(), side = r() > 0.5 ? 1 : -1;
          if (u * dist(W.A, W.B) > L) continue;
          ctx.fillStyle = rgba(PAL.cold.hot, 0.7 * a);
          ctx.fillRect(W.A.x + n.x * u * dist(W.A, W.B) - 1, W.A.y + side * (hw + 1 + r() * 3) - 1, 2, 2);
        }
        if (st.p >= 1) {
          var Pg = lp(W.A, W.B, (lt / 1700) % 1);
          glow(ctx, Pg.x, Pg.y, hw * 1.6, [[0, rgba(PAL.cold.hot, 0.35 * a)], [1, rgba(PAL.cold.glow, 0)]]);
        } else glow(ctx, E.x, E.y, c * 0.6, [[0, rgba(PAL.cold.hot, 0.9)], [1, rgba(PAL.cold.glow, 0)]]);
      });
    }
    function thornWall(ctx, W, lt, G, mode) {
      var st = wallEnd(W, lt, mode), a = st.a * 1.15, E = st.E, c = G.cell, hw = c * 0.27, n = norm(W.A, W.B), L = dist(W.A, E);
      band(ctx, W.A, E, hw * 1.05, "rgba(32,28,16," + clamp(0.35 * a) + ")");
      for (var v = 0; v < 3; v++) {
        var pts = [];
        for (var s = 0; s <= 40; s++) {
          var u = s / 40, d = u * L, o = Math.sin(d / (c * 0.32) + v * 2.1) * hw * 0.8;
          pts.push({ x: W.A.x + n.x * d - n.y * o, y: W.A.y + n.y * d + n.x * o });
        }
        stroke(ctx, pts, 3.4, rgba(PAL.briar.wood, 0.95 * a));
        stroke(ctx, pts, 1, rgba(PAL.briar.bark, 0.55 * a));
        for (var k = 1; k < pts.length - 1; k += 2) {
          var P = pts[k], Q = pts[k + 1], tn = norm(P, Q), sd = (k + v) % 4 < 2 ? 1 : -1;
          ctx.beginPath();
          ctx.moveTo(P.x - tn.x * 2, P.y - tn.y * 2);
          ctx.lineTo(P.x - tn.y * 6 * sd + tn.x * 2, P.y + tn.x * 6 * sd + tn.y * 2);
          ctx.lineTo(P.x + tn.x * 2, P.y + tn.y * 2);
          ctx.closePath(); ctx.fillStyle = rgba("48,40,22", a); ctx.fill();
          if ((k + v) % 6 === 1) {
            ctx.save(); ctx.translate(P.x + tn.y * 4, P.y - tn.x * 4); ctx.rotate(Math.atan2(tn.y, tn.x) + 0.6);
            ctx.fillStyle = rgba(PAL.briar.sage, 0.85 * a); oval(ctx, 3, 1.6); ctx.fill(); ctx.restore();
          }
        }
      }
      if (st.p < 1) add(ctx, function () { glow(ctx, E.x, E.y, c * 0.45, [[0, rgba(PAL.briar.prickHot, 0.5)], [1, rgba(PAL.briar.prick, 0)]]); });
    }
    function bladeWall(ctx, W, lt, G, mode) {
      var st = wallEnd(W, lt, mode), a = st.a * 1.2, E = st.E, c = G.cell, hw = c * 0.26, n = norm(W.A, W.B), L = dist(W.A, E);
      stroke(ctx, [W.A, E], 2, rgba("40,40,46", 0.7 * a));
      var guard = 0;
      for (var k = 0; k * c * 0.62 <= L && guard < 48; k++, guard++) {
        var H = { x: W.A.x + n.x * (k * c * 0.62 + c * 0.2), y: W.A.y + n.y * (k * c * 0.62 + c * 0.2) };
        if (dist(W.A, H) > L + 1) break;
        var spin = lt / 70 * (k % 2 ? 1 : -1) + k;
        add(ctx, function () { ring(ctx, H.x, H.y, hw * 1.05, 2.5, rgba(PAL.steel.glint, 0.12 * a)); });
        for (var b = 0; b < 3; b++) {
          var an = spin + b / 3 * TAU;
          ctx.save(); ctx.translate(H.x, H.y); ctx.rotate(an); ctx.beginPath();
          ctx.moveTo(2, -2); ctx.lineTo(hw * 1.15, -0.6); ctx.lineTo(hw * 1.25, 1.2); ctx.lineTo(2, 2.4); ctx.closePath();
          ctx.fillStyle = rgba(PAL.steel.metal, 0.95 * clamp(a)); ctx.fill();
          ctx.lineWidth = 0.9; ctx.strokeStyle = rgba(PAL.steel.glint, 0.85 * clamp(a)); ctx.stroke(); ctx.restore();
        }
        ctx.beginPath(); ctx.arc(H.x, H.y, 3.2, 0, TAU); ctx.fillStyle = rgba("55,58,66", clamp(a)); ctx.fill();
        var gl = Math.sin(lt / 55 + k * 1.9);
        if (gl > 0.82) add(ctx, function () { star(ctx, H.x + Math.cos(spin) * hw, H.y + Math.sin(spin) * hw, 5, 4, 0.2, PAL.steel.glint, (gl - 0.82) / 0.18 * clamp(a), 0.3); });
      }
      if (st.p < 1) sparks(ctx, E.x, E.y, lt % 120, 6, Math.floor(lt / 120) + 4, 120, 120, PAL.steel.spark, 1.2, 6);
    }
    function wallSkin(ctx, lt, G) {
      var skins = { ice: iceWall, thorns: thornWall, blades: bladeWall };
      (G.W || []).forEach(function (W) {
        if (!W || !W.A || !W.B) return;
        var E = wallEnd(W, lt, G.mode).E;
        band(ctx, W.A, E, G.cell * 0.34, "rgba(10,8,6,0.32)");
        (skins[W.skin] || iceWall)(ctx, W, lt, G, G.mode);
      });
    }
    function wallTick(ctx, lt, G) {
      var hit = G.skin === "thorns" ? thornHit : (G.skin === "blades" ? function (c, B, t, Gg) { slashHit(c, B, t, Gg, 33); } : iceHit);
      tickMarks(ctx, lt, G, hit);
    }

    /* Hunger of Hadar. Near-black void, cold/acid rim flecks, no purple swirl. */
    function hhR(lt, G) {
      var full = G.cell * (G.zr || 4);
      if (G.mode === "idle" || G.mode === "tick" || G.mode === "clear") return full;
      return full * (0.25 + 0.75 * easeOut(clamp(lt / 450)));
    }
    function voidBody(ctx, C, R, lt, a, seed) {
      if (!C || a <= 0 || !(R > 1)) return;
      var r = rng(seed);
      for (var v = 0; v < 11; v++) {
        var an = r() * TAU, l = R * (1.1 + r() * 0.25);
        stroke(ctx, jag({ x: C.x + Math.cos(an) * R * 0.75, y: C.y + Math.sin(an) * R * 0.75 }, { x: C.x + Math.cos(an) * l, y: C.y + Math.sin(an) * l }, 5, 5, seed + v), 2.2, rgba(PAL.voidc.body, 0.6 * a));
      }
      glow(ctx, C.x, C.y, R, [[0, rgba(PAL.voidc.body, 0.93 * a)], [0.72, rgba(PAL.voidc.body, 0.9 * a)], [0.9, rgba(PAL.voidc.body, 0.55 * a)], [1, rgba(PAL.voidc.body, 0)]]);
      for (var k = 0; k < 22; k++) {
        var an2 = k / 22 * TAU + lt / 9000 * (k % 2 ? 1 : -1), rr = R * (0.86 + 0.08 * Math.sin(lt / 700 + k)), s = R * (0.13 + (k % 5) * 0.02);
        glow(ctx, C.x + Math.cos(an2) * rr, C.y + Math.sin(an2) * rr, s, [[0, rgba(PAL.voidc.vein, 0.6 * a)], [1, rgba(PAL.voidc.vein, 0)]]);
      }
    }
    function rimFlecks(ctx, C, R, lt, a) {
      if (!C || a <= 0) return;
      var r = rng(5);
      add(ctx, function () {
        for (var i = 0; i < 26; i++) {
          var an = r() * TAU + lt / 12000, rr = R * (0.88 + r() * 0.14), tw = 0.5 + 0.5 * Math.sin(lt / 190 + i * 1.7);
          var col = i % 3 === 2 ? PAL.acid.bloom : PAL.cold.core;
          glow(ctx, C.x + Math.cos(an) * rr, C.y + Math.sin(an) * rr, 4 + r() * 3, [[0, rgba(col, 0.85 * a * tw)], [1, rgba(col, 0)]]);
        }
      });
    }
    function hungerTick(ctx, lt, G) {
      var acid = /acid/.test(G.dmg || "");
      tickMarks(ctx, lt, G, function (c, B, t) {
        if (acid) {
          flash(c, B, t, 460, G.cell * 0.8, PAL.acid.glow, PAL.acid.hot);
          var r = rng(40), u2 = clamp(t / 520);
          if (t < 0 || t > 520) return;
          for (var k = 0; k < 9; k++) {
            var an = r() * TAU, d = (G.rT || 16) * (0.4 + r() * 0.9) * easeOut(clamp(t / 300));
            c.fillStyle = rgba(PAL.acid.core, 1 - u2);
            c.beginPath(); c.arc(B.x + Math.cos(an) * d, B.y + Math.sin(an) * d, 1.9, 0, TAU); c.fill();
          }
        } else iceHit(c, B, t, G);
      });
    }
    function hunger(ctx, lt, G) {
      var C = centerOf(G); if (!C) return;
      if (G.mode === "tick") { hungerTick(ctx, lt, G); return; }
      if (G.mode === "clear") { clearPop(ctx, C, G.cell * (G.zr || 4), lt); return; }
      var R = hhR(lt, G), a = G.mode === "idle" ? 0.92 : easeOut(clamp(lt / 300));
      glow(ctx, C.x, C.y, R, [[0, rgba(PAL.voidc.body, 0.2 * a)], [0.85, rgba(PAL.voidc.body, 0.16 * a)], [1, rgba(PAL.voidc.body, 0)]]);
      if (G.mode === "cast" && lt < 650) {
        add(ctx, function () {
          var u = clamp(lt / 650);
          ring(ctx, C.x, C.y, lerp(R * 1.25, R * 0.98, easeOut(u)), 2 * (1 - u), rgba(PAL.cold.glow, 0.5 * (1 - u)), 10);
        });
      }
      rimFlecks(ctx, C, R, lt, a);
    }
    function hungerUnder(ctx, lt, G) {
      if (G.mode === "tick" || G.mode === "clear") return;
      var C = centerOf(G); if (!C) return;
      voidBody(ctx, C, hhR(lt, G), lt, G.mode === "idle" ? 0.92 : easeOut(clamp(lt / 300)), 17);
    }

    /* Arms of Hadar. Self-centred lash, then retract. Not a zone. */
    function ahExt(t) {
      if (t < 0) return 0;
      if (t < AH.out) return easeOut(t / AH.out);
      if (t < AH.hold) return 1;
      return 1 - easeInOut((t - AH.hold) / (AH.back - AH.hold));
    }
    function ahTendrils(G) {
      var S = G.S || G.A, list = [];
      if (!S) return list;
      marksOf(G).forEach(function (B) {
        if (dist(S, B) < G.cell * 0.45) return;
        list.push({ an: Math.atan2(B.y - S.y, B.x - S.x), L: Math.min(G.cell * 2.4, dist(S, B) + (G.rT || 16) * 0.15), hit: true });
      });
      var fill = [0.35, 1.25, 2.6, 3.4, 4.6, 5.5, 0.9, 2.1];
      for (var i = 0; list.length < 8 && i < fill.length; i++) {
        var ok = list.every(function (q) { return Math.abs(Math.atan2(Math.sin(q.an - fill[i]), Math.cos(q.an - fill[i]))) > 0.45; });
        if (ok) list.push({ an: fill[i], L: G.cell * 2.05, hit: false });
      }
      return list;
    }
    function armsUnder(ctx, lt, G) {
      if (G.mode !== "cast") return;
      var S = G.S || G.A; if (!S) return;
      var e = ahExt(lt), pa = env(lt, 0, 120, 700, 1300);
      glow(ctx, S.x, S.y, G.cell * 1.15, [[0, rgba(PAL.voidc.body, 0.8 * pa)], [0.7, rgba(PAL.voidc.body, 0.5 * pa)], [1, rgba(PAL.voidc.body, 0)]]);
      if (!(e > 0)) return;
      ahTendrils(G).forEach(function (q, i) {
        var L = q.L * e, nx = Math.cos(q.an), ny = Math.sin(q.an), pts = [];
        for (var s = 0; s <= 16; s++) {
          var u = s / 16, o = Math.sin(u * 3.2 + lt / 55 + i * 1.7) * G.cell * 0.22 * u * (1 - u * 0.4);
          pts.push({ x: S.x + nx * u * L - ny * o, y: S.y + ny * u * L + nx * o });
        }
        add(ctx, function () { stroke(ctx, pts, 18, rgba(PAL.necrotic.glow, 0.22), 12); });
        for (var k = 0; k < 16; k++) stroke(ctx, [pts[k], pts[k + 1]], lerp(14, 2.5, k / 16), rgba(PAL.voidc.body, 0.95));
        for (var k2 = 0; k2 < 16; k2 += 2) stroke(ctx, [pts[k2], pts[k2 + 1]], 1.2, rgba(PAL.voidc.plum, 0.7));
        add(ctx, function () {
          [5, 11].forEach(function (k3, j) {
            var P = pts[k3]; if (!P) return;
            var col = (i + j) % 2 ? PAL.acid.bloom : PAL.cold.core;
            glow(ctx, P.x, P.y, 4, [[0, rgba(col, 0.8 * e)], [1, rgba(col, 0)]]);
          });
        });
      });
    }
    function arms(ctx, lt, G) {
      if (G.mode !== "cast") return;
      var S = G.S || G.A; if (!S) return;
      marksOf(G).forEach(function (B, i) {
        if (dist(S, B) < G.cell * 0.45) return;
        var t = lt - AH.out + 30 - i * 15;
        if (t < 0 || t > 560) return;
        var u = t / 560, p = easeOut(clamp(t / 140));
        flash(ctx, B, t, 380, G.cell * 0.6, PAL.necrotic.glow, PAL.necrotic.hex);
        var an0 = Math.atan2(S.y - B.y, S.x - B.x);
        [-1, 1].forEach(function (sd) {
          var pts = [];
          for (var j = 0; j <= 10; j++) {
            var an = an0 + sd * lerp(1.9, 0.55, p) * (j / 10) + sd * 0.15;
            pts.push({ x: B.x + Math.cos(an) * ((G.rT || 16) + 4), y: B.y + Math.sin(an) * ((G.rT || 16) + 4) });
          }
          stroke(ctx, pts, 4.5 * (1 - u * 0.6), rgba(PAL.voidc.body, 0.95 * (1 - u)));
          add(ctx, function () { stroke(ctx, pts, 1.4, rgba(PAL.necrotic.hex, 0.8 * (1 - u))); });
        });
      });
      var r = rng(9);
      for (var k = 0; k < 14; k++) {
        var t0 = AH.hold + r() * 300, age = (lt - t0) / 900, an = r() * TAU, d = G.cell * (0.5 + r() * 1.5);
        if (age < 0 || age > 1) continue;
        glow(ctx, S.x + Math.cos(an) * d, S.y + Math.sin(an) * d - age * 18, 6 + age * 8, [[0, rgba(PAL.voidc.body, 0.55 * Math.sin(Math.PI * age))], [1, rgba(PAL.voidc.body, 0)]]);
      }
    }

    /* Cloud of Daggers. Canvas spin. The cube is one square. */
    function knife(ctx, x, y, an, s, a) {
      ctx.save(); ctx.translate(x, y); ctx.rotate(an); ctx.scale(s, s);
      ctx.fillStyle = rgba(PAL.steel.grip, 0.95 * a); ctx.fillRect(-9, -1.5, 5, 3);
      ctx.fillStyle = rgba("150,130,90", 0.9 * a); ctx.fillRect(-4.5, -2.6, 1.4, 5.2);
      ctx.beginPath(); ctx.moveTo(-3, -1.8); ctx.lineTo(7, -1.6); ctx.quadraticCurveTo(10, -0.6, 11, 0.6); ctx.lineTo(7, 1.8); ctx.lineTo(-3, 1.8); ctx.closePath();
      ctx.fillStyle = rgba(PAL.steel.metal, a); ctx.fill();
      ctx.lineWidth = 0.8; ctx.strokeStyle = rgba(PAL.steel.glint, 0.9 * a);
      ctx.beginPath(); ctx.moveTo(-2.5, -1.5); ctx.lineTo(7, -1.3); ctx.stroke();
      ctx.restore();
    }
    function daggersUnder(ctx, lt, G) {
      if (G.mode === "tick" || G.mode === "clear") return;
      var C = centerOf(G); if (!C) return;
      var a = G.mode === "idle" ? 0.9 : clamp((lt - 80) / 200);
      if (a <= 0) return;
      var h = G.cell / 2 - 1;
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0," + (0.22 * a) + ")";
      ctx.fillRect(C.x - h, C.y - h, h * 2, h * 2);
      ctx.setLineDash([5, 4]); ctx.lineWidth = 1.3; ctx.strokeStyle = rgba(PAL.steel.glint, 0.5 * a);
      ctx.strokeRect(C.x - h, C.y - h, h * 2, h * 2);
      ctx.restore();
    }
    function daggers(ctx, lt, G) {
      var C = centerOf(G); if (!C) return;
      if (G.mode === "tick") { tickMarks(ctx, lt, G, function (c, B, t, Gg, seed) { slashHit(c, B, t, Gg, seed); }); return; }
      if (G.mode === "clear") { clearPop(ctx, C, G.cell * 0.8, lt); return; }
      var formed = G.mode === "idle" ? 1 : easeOut(clamp((lt - 80) / 320));
      var a = G.mode === "idle" ? 0.92 : 0.92 * clamp(lt / 160);
      if (!(formed > 0) || a <= 0) return;
      if (G.mode === "cast" && G.A) {
        var p = easeOut(clamp(lt / 180)), H = lp(G.A, C, p);
        add(ctx, function () { stroke(ctx, [G.A, H], 1.4, rgba(PAL.steel.glint, 0.9 * (1 - clamp((lt - 180) / 220)))); });
      }
      add(ctx, function () { glow(ctx, C.x, C.y, G.cell * 0.85, [[0, rgba(PAL.steel.glint, 0.1 * a)], [1, rgba(PAL.steel.glint, 0)]]); });
      var r = rng(21);
      for (var i = 0; i < 13; i++) {
        var fr = r(), rad = G.cell * (0.15 + 0.62 * fr) * formed, w = (2.4 + 1.6 * r()) * (i % 4 === 3 ? -1 : 1), ph = r() * TAU, tilt = 0.55 + r() * 0.35;
        var ang = ph + lt / 1000 * w, x = C.x + Math.cos(ang) * rad, y = C.y + Math.sin(ang) * rad * tilt;
        var tan = ang + (w > 0 ? Math.PI / 2 : -Math.PI / 2), self = lt / 110 * (i % 2 ? 1 : -1) + i;
        add(ctx, function () {
          var pts = [];
          for (var j = 0; j <= 8; j++) {
            var aa = ang - (w > 0 ? 1 : -1) * 0.7 * j / 8;
            pts.push({ x: C.x + Math.cos(aa) * rad, y: C.y + Math.sin(aa) * rad * tilt });
          }
          stroke(ctx, pts, 3, rgba(PAL.steel.glint, 0.22 * a));
        });
        ctx.save(); ctx.shadowColor = "rgba(0,0,0,0.85)"; ctx.shadowBlur = 3;
        knife(ctx, x, y, tan + Math.sin(self) * 0.9, 1.55, a); ctx.restore();
      }
    }

    /* Insect Plague. Low-alpha locust annulus so tokens still read. */
    function plagueUnder(ctx, lt, G) {
      if (G.mode === "tick" || G.mode === "clear") return;
      var C = centerOf(G); if (!C) return;
      var R = G.cell * (G.zr || 4) * (G.mode === "idle" ? 1 : (0.3 + 0.7 * easeOut(clamp(lt / 550))));
      var a = G.mode === "idle" ? 0.85 : clamp(lt / 300);
      glow(ctx, C.x, C.y, R, [[0, "rgba(28,20,10," + (0.1 * a) + ")"], [0.6, "rgba(28,20,10," + (0.3 * a) + ")"], [0.92, "rgba(28,20,10," + (0.26 * a) + ")"], [1, "rgba(28,20,10,0)"]]);
    }
    function plague(ctx, lt, G) {
      var C = centerOf(G); if (!C) return;
      if (G.mode === "tick") { tickMarks(ctx, lt, G, biteHit); return; }
      if (G.mode === "clear") { clearPop(ctx, C, G.cell * (G.zr || 4), lt); return; }
      var R = G.cell * (G.zr || 4), f = G.mode === "idle" ? 1 : easeOut(clamp(lt / 550)), a = G.mode === "idle" ? 0.8 : clamp(lt / 250);
      var r = rng(13), rc = rng(14);
      for (var c = 0; c < 34; c++) {
        var an = rc() * TAU + lt / 2300 * (rc() < 0.85 ? 1 : -1), d = R * (0.45 + 0.48 * rc()) * (0.25 + 0.75 * f);
        glow(ctx, C.x + Math.cos(an) * d, C.y + Math.sin(an) * d, G.cell * (0.55 + 0.35 * rc()), [[0, "rgba(30,20,10," + (0.45 * a) + ")"], [1, "rgba(30,20,10,0)"]]);
      }
      var bodies = G.mode === "idle" ? 42 : 90;
      for (var i = 0; i < bodies; i++) {
        var fr = r(), rad = R * (0.3 + 0.68 * Math.pow(fr, 0.55)) * (0.25 + 0.75 * f), w = (0.7 + 0.9 * r()) * (r() < 0.82 ? 1 : -1), ph = r() * TAU, jit = r() * TAU;
        var ang = ph + lt / 1000 * w, rr = rad * (1 + 0.07 * Math.sin(lt / 260 + jit));
        var x = C.x + Math.cos(ang) * rr + Math.sin(lt / 90 + jit) * 1.5, y = C.y + Math.sin(ang) * rr + Math.cos(lt / 110 + jit) * 1.5;
        var al = a * (0.55 + 0.3 * fr);
        ctx.save(); ctx.translate(x, y); ctx.rotate(ang + (w > 0 ? Math.PI / 2 : -Math.PI / 2));
        if ((Math.floor(lt / 45) + i) % 2) { ctx.fillStyle = rgba(PAL.swarm.wing, al * 0.6); oval(ctx, 2, 3.8); ctx.fill(); }
        ctx.fillStyle = rgba("26,17,8", al); oval(ctx, 4.2, 1.7); ctx.fill();
        ctx.fillStyle = rgba(PAL.swarm.body, al * 0.9); ctx.translate(2.4, 0); oval(ctx, 1.4, 1.3); ctx.fill();
        ctx.restore();
      }
    }

    /* Incendiary Cloud. Furnace smoke, slow half-square drift away from the caster, then it holds. */
    function icCenter(G) {
      var C = centerOf(G) || { x: 0, y: 0 };
      if (G.mode !== "idle") return C;
      var dir = G.drift || { x: 1, y: 0 };
      var u = easeInOut((G.age || 0) / 2500);
      return { x: C.x + dir.x * G.cell * 0.5 * u, y: C.y + dir.y * G.cell * 0.5 * u };
    }
    function icR(lt, G) {
      var full = G.cell * (G.zr || 4);
      if (G.mode === "idle") return full;
      return full * (0.3 + 0.7 * easeOut(clamp(lt / 600)));
    }
    function incendiaryUnder(ctx, lt, G) {
      if (G.mode === "tick" || G.mode === "clear") return;
      var C = icCenter(G), R = icR(lt, G), a = G.mode === "idle" ? 0.9 : clamp(lt / 250), r = rng(29);
      glow(ctx, C.x, C.y, R, [[0, rgba(PAL.fire.smoke, 0.85 * a)], [0.8, rgba(PAL.fire.smoke, 0.75 * a)], [1, rgba(PAL.fire.smoke, 0)]]);
      for (var k = 0; k < 18; k++) {
        var an = r() * TAU + lt / 9000, d = R * 0.85 * Math.sqrt(r()), s = G.cell * (0.7 + r() * 0.45);
        glow(ctx, C.x + Math.cos(an) * d, C.y + Math.sin(an) * d, s, [[0, rgba(k % 3 ? PAL.fire.smoke : "28,22,20", 0.55 * a)], [1, rgba(PAL.fire.smoke, 0)]]);
      }
      add(ctx, function () {
        glow(ctx, C.x, C.y, R * 0.95, [[0, rgba(PAL.fire.glow, 0.32 * a)], [0.7, rgba(PAL.fire.glow, 0.18 * a)], [1, rgba(PAL.fire.glow, 0)]]);
        var rv = rng(31);
        for (var v = 0; v < 8; v++) {
          var an = rv() * TAU, d0 = R * (0.1 + 0.5 * rv()), L = G.cell * (0.6 + rv() * 0.7), fl = 0.55 + 0.45 * Math.sin(lt / (90 + v * 13) + v);
          var P0 = { x: C.x + Math.cos(an) * d0, y: C.y + Math.sin(an) * d0 };
          var P2 = { x: P0.x + Math.cos(an + 1.2) * L, y: P0.y + Math.sin(an + 1.2) * L };
          stroke(ctx, [P0, P2], 4, rgba(PAL.fire.glow, 0.35 * a * fl), 8);
          stroke(ctx, [P0, P2], 1.4, rgba(PAL.fire.core, 0.6 * a * fl));
        }
      });
    }
    function incendiary(ctx, lt, G) {
      var C = icCenter(G);
      if (G.mode === "tick") { tickMarks(ctx, lt, G, function (c, B, t, Gg, seed) { fireBurst(c, B, t, 620, Gg.cell * 0.75, seed); }); return; }
      if (G.mode === "clear") { clearPop(ctx, C, G.cell * (G.zr || 4), lt); return; }
      var R = icR(lt, G), a = G.mode === "idle" ? 0.85 : clamp(lt / 250);
      glow(ctx, C.x, C.y, R, [[0, rgba(PAL.fire.smoke, 0.2 * a)], [0.85, rgba(PAL.fire.smoke, 0.16 * a)], [1, rgba(PAL.fire.smoke, 0)]]);
      var r = rng(43);
      add(ctx, function () {
        for (var k = 0; k < 28; k++) {
          var ph = r(), age = ((lt / 1600) + ph) % 1, an = r() * TAU, d = R * 0.85 * Math.sqrt(r());
          ctx.fillStyle = rgba(k % 2 ? PAL.fire.core : PAL.fire.hot, a * 0.8 * Math.sin(Math.PI * age));
          ctx.beginPath();
          ctx.arc(C.x + Math.cos(an) * d, C.y + Math.sin(an) * d - age * 22, 1.3, 0, TAU);
          ctx.fill();
        }
      });
    }

    /* Flame Strike: one thick gold-sheathed column. Fire Storm: thinner columns, staggered 100 ms. */
    function column(ctx, B, H, t, w, drop, hold, fade, sheath) {
      if (!B || t < 0) return;
      var a = 1 - clamp((t - hold) / Math.max(1, fade - hold));
      if (a <= 0) return;
      var top = { x: B.x, y: B.y - H }, head = { x: B.x, y: lerp(top.y, B.y, easeIn(clamp(t / drop))) };
      var fl = 1 + 0.07 * Math.sin(t / 28);
      add(ctx, function () {
        if (sheath) {
          stroke(ctx, [top, head], w * 2.1 * fl, rgba(PAL.radiant.glow, 0.24 * a), 18, rgba(PAL.radiant.glow, a));
          stroke(ctx, [top, head], w * 1.5 * fl, rgba(PAL.radiant.core, 0.28 * a));
        }
        stroke(ctx, [top, head], w * 1.1 * fl, rgba(PAL.fire.glow, 0.55 * a), 14, rgba(PAL.fire.glow, a));
        stroke(ctx, [top, head], w * 0.72 * fl, rgba(PAL.fire.core, 0.85 * a));
        stroke(ctx, [top, head], Math.max(1.2, w * 0.3), rgba(PAL.fire.hot, a));
      });
    }
    function flameUnder(ctx, lt, G) {
      var B = marksOf(G)[0];
      if (B) scorch(ctx, B, G.cell * 1.9, clamp((lt - 180) / 200));
    }
    function flame(ctx, lt, G) {
      var B = marksOf(G)[0]; if (!B) return;
      column(ctx, B, G.cell * 7.5, lt, G.cell * 0.95, 120, 650, 1000, true);
      if (lt >= 120) {
        fireBurst(ctx, B, lt - 120, 1000, G.cell * 2.0, 3);
        if (lt < 770) add(ctx, function () {
          var u = (lt - 120) / 650;
          ring(ctx, B.x, B.y, G.cell * 0.8 + easeOut(clamp(u)) * G.cell * 1.4, 5 * (1 - clamp(u)) + 0.8, rgba(PAL.radiant.core, 1 - clamp(u)), 14);
        });
        sparks(ctx, B.x, B.y, lt - 120, 16, 77, 120, 1000, PAL.radiant.core, 1.6, -30);
        gritBurst(ctx, B.x, B.y, lt - 140, 900, 16, 8, G.cell * 1.2, ["95,80,60", "120,100,75"]);
      }
    }
    function stormUnder(ctx, lt, G) {
      var pts = marksOf(G);
      pts.forEach(function (P, i) { scorch(ctx, P, G.cell * 0.85, clamp((lt - i * 100 - 140) / 200)); });
    }
    function storm(ctx, lt, G) {
      marksOf(G).forEach(function (P, i) {
        var t = lt - i * 100;
        column(ctx, P, G.cell * 2.6, t, G.cell * 0.4, 100, 420, 680, false);
        fireBurst(ctx, P, t - 100, 700, G.cell, 20 + i);
        if (t >= 140) gritBurst(ctx, P.x, P.y, t - 140, 700, 12, 20 + i, G.cell * 0.7, ["95,80,60", "45,28,20"]);
      });
    }

    /* Freezing Sphere. Lob, mark-scale bead, then a 60-ft cold sphere. Not a token. */
    function fzPos(lt, G) {
      var A = G.A || G.S, B = centerOf(G) || A;
      if (!A || !B) return null;
      var p = clamp(lt / FZ.travel), P = lp(A, B, p);
      return { x: P.x, y: P.y - Math.sin(Math.PI * p) * G.cell * 1.2, p: p, B: B };
    }
    function freezingUnder(ctx, lt, G) {
      var td = lt - FZ.det, C = centerOf(G); if (!C) return;
      var a = env(td, 60, 220, 620, 1500);
      if (a <= 0) return;
      var R = G.cell * (G.zr || 12), r = rng(19);
      glow(ctx, C.x, C.y, R, [[0, "rgba(200,225,250," + (0.16 * a) + ")"], [0.9, "rgba(200,225,250," + (0.24 * a) + ")"], [1, "rgba(200,225,250,0)"]]);
      ctx.save(); ctx.strokeStyle = "rgba(235,245,255," + (0.6 * a) + ")"; ctx.lineWidth = 1;
      for (var k = 0; k < 48; k++) {
        var an = r() * TAU, d = R * Math.sqrt(r()) * 0.95, x = C.x + Math.cos(an) * d, y = C.y + Math.sin(an) * d, s = 2.5 + r() * 4;
        ctx.beginPath();
        for (var j = 0; j < 3; j++) {
          var b = j / 3 * Math.PI + r();
          ctx.moveTo(x - Math.cos(b) * s, y - Math.sin(b) * s);
          ctx.lineTo(x + Math.cos(b) * s, y + Math.sin(b) * s);
        }
        ctx.stroke();
      }
      ctx.restore();
    }
    function freezing(ctx, lt, G) {
      var C = centerOf(G); if (!C) return;
      var R = G.cell * (G.zr || 12), td = lt - FZ.det;
      if (lt < FZ.travel) {
        var O = fzPos(lt, G); if (!O) return;
        for (var k = 8; k >= 1; k--) {
          var Q = fzPos(Math.max(0, lt - k * 22), G);
          if (Q) glow(ctx, Q.x, Q.y, 5 + k * 0.9, [[0, rgba(PAL.cold.mist, 0.28 * (1 - k / 9))], [1, rgba(PAL.cold.mist, 0)]]);
        }
        add(ctx, function () { glow(ctx, O.x, O.y, 16, [[0, rgba(PAL.cold.hot, 1)], [0.35, rgba(PAL.cold.core, 0.8)], [1, rgba(PAL.cold.glow, 0)]]); });
        ctx.save(); ctx.beginPath(); ctx.arc(O.x, O.y, 6.5, 0, TAU); ctx.fillStyle = "rgba(232,242,252,0.95)"; ctx.fill();
        ctx.lineWidth = 1.3; ctx.strokeStyle = rgba(PAL.cold.glow, 0.9); ctx.stroke(); ctx.restore();
        return;
      }
      if (td < 0) {
        var hb = lt - FZ.travel, pu = 0.8 + 0.2 * Math.sin(hb / 60);
        add(ctx, function () {
          glow(ctx, C.x, C.y, 18 * pu, [[0, rgba(PAL.cold.hot, 0.95)], [0.4, rgba(PAL.cold.core, 0.6)], [1, rgba(PAL.cold.glow, 0)]]);
          for (var s = 0; s < 4; s++) {
            var an = s / 4 * TAU + hb / 140;
            shard(ctx, C.x + Math.cos(an) * 13, C.y + Math.sin(an) * 13, an + Math.PI / 2, 4, 1.5, rgba(PAL.cold.hot, 0.9));
          }
        });
        ctx.save(); ctx.beginPath(); ctx.arc(C.x, C.y, 6.5, 0, TAU); ctx.fillStyle = "rgba(232,242,252,0.95)"; ctx.fill(); ctx.restore();
        return;
      }
      var u = clamp(td / 700);
      if (td < 700) add(ctx, function () {
        glow(ctx, C.x, C.y, R * (0.3 + 0.7 * easeOut(td / 250)), [[0, rgba(PAL.cold.hot, 0.95 * (1 - u))], [0.35, rgba(PAL.cold.core, 0.6 * (1 - u))], [0.8, rgba(PAL.cold.glow, 0.35 * (1 - u))], [1, rgba(PAL.cold.glow, 0)]]);
        ring(ctx, C.x, C.y, R * easeOut(clamp(td / 350)), 5 * (1 - u) + 0.6, rgba(PAL.cold.hot, 1 - u), 14);
      });
      if (td < 560) {
        var r = rng(23);
        add(ctx, function () {
          for (var s = 0; s < 30; s++) {
            var an = s / 30 * TAU + r() * 0.15, d = R * (0.1 + 0.9 * easeOut(td / 300)) * (0.55 + 0.45 * r()), L = 8 + r() * 9;
            shard(ctx, C.x + Math.cos(an) * d, C.y + Math.sin(an) * d, an, L, 2.3, rgba(PAL.cold.hot, 0.95 * (1 - clamp((td - 250) / 310))));
          }
        });
      }
      sparks(ctx, C.x, C.y, td, 24, 25, 420, 900, PAL.cold.core, 1.6, 0);
      if (td >= 40 && td < 1400) gritBurst(ctx, C.x, C.y, td, 1400, 20, 25, G.cell * 2.2, ["200,225,250", "150,185,225", "95,80,60"]);
    }

    /* Sunburst and Circle of Death. Separate skins. Rules radius 60 ft. */
    function sunburst(ctx, lt, G) {
      var C = centerOf(G); if (!C) return;
      var R = G.cell * (G.zr || 12);
      if (lt < 1000) {
        var ca = env(lt, 0, 60, 260, 950), u = clamp(lt / 900);
        add(ctx, function () {
          glow(ctx, C.x, C.y, R * 1.05, [[0, rgba(PAL.blind, 0.55 * env(lt, 0, 40, 130, 520))], [1, rgba(PAL.blind, 0)]]);
          var r = rng(11);
          for (var k = 0; k < 18; k++) {
            var an = k / 18 * TAU + r() * 0.1, L = R * (0.55 + 0.45 * easeOut(lt / 220)) * (0.7 + 0.3 * r());
            wedge(ctx, C, an, L, 7, 0.8, rgba(PAL.radiant.core, 0.5 * ca));
            wedge(ctx, C, an, L * 0.8, 2.5, 0.4, rgba(PAL.radiant.hot, 0.6 * ca));
          }
          glow(ctx, C.x, C.y, G.cell * (1.1 + 0.9 * easeOut(lt / 150)), [[0, rgba(PAL.radiant.hot, ca)], [0.35, rgba(PAL.radiant.core, 0.85 * ca)], [1, rgba(PAL.radiant.glow, 0)]]);
          ring(ctx, C.x, C.y, R * easeOut(lt / 450), 10 * (1 - u) + 1.5, rgba(PAL.radiant.glow, 0.7 * (1 - u)), 16);
        });
        var motes = rng(48);
        ctx.save();
        ctx.globalCompositeOperation = "source-over";
        for (var dm = 0; dm < 18; dm++) {
          var anM = motes() * TAU, dM = R * (0.2 + motes() * 0.75) * easeOut(clamp(lt / 400));
          ctx.fillStyle = rgba(dm % 2 ? "178,168,150" : "120,100,75", 0.5 * ca);
          ctx.fillRect(C.x + Math.cos(anM) * dM, C.y + Math.sin(anM) * dM, 2.2, 2.2);
        }
        ctx.restore();
      }
      marksOf(G).forEach(function (B, i) {
        var tb = lt - 200 * clamp(dist(C, B) / Math.max(1, R));
        if (tb < 0 || tb > 560) return;
        var uu = tb / 560;
        add(ctx, function () { star(ctx, B.x, B.y, G.cell * (0.55 + 0.25 * easeOut(uu)), 8, 0.18, PAL.blind, 1 - uu, i * 0.4, PAL.radiant.glow); });
      });
    }
    function circleUnder(ctx, lt, G) {
      var C = centerOf(G); if (!C) return;
      var R = G.cell * (G.zr || 12) * easeOut(clamp(lt / 600)), a = env(lt, 0, 100, 900, 1600);
      if (a <= 0) return;
      glow(ctx, C.x, C.y, Math.max(1, R), [[0, rgba(PAL.necrotic.black, 0.35 * a)], [1, rgba(PAL.necrotic.black, 0)]]);
    }
    function circleOfDeath(ctx, lt, G) {
      var C = centerOf(G); if (!C) return;
      var R0 = G.cell * (G.zr || 12), R = R0 * easeOut(clamp(lt / 600)), a = env(lt, 0, 60, 800, 1400);
      if (a > 0 && R > 2) {
        ring(ctx, C.x, C.y, R, Math.max(8, G.cell * 0.55), rgba(PAL.necrotic.black, 0.72 * a));
        add(ctx, function () { ring(ctx, C.x, C.y, R, Math.max(6, G.cell * 0.7), rgba(PAL.necrotic.glow, 0.28 * a), 14); });
        ring(ctx, C.x, C.y, Math.max(1, R - G.cell * 0.28), 1.6, rgba(PAL.necrotic.bone, 0.75 * a));
      }
      var r = rng(61);
      for (var k = 0; k < 28; k++) {
        var an = r() * TAU, born = 600 * (0.15 + 0.85 * r()), age = (lt - born) / 1100;
        if (age < 0 || age > 1) continue;
        var d = R0 * easeOut(born / 600);
        glow(ctx, C.x + Math.cos(an) * d, C.y + Math.sin(an) * d - age * 24, 8 + age * 10, [[0, "rgba(45,32,48," + (0.5 * Math.sin(Math.PI * age)) + ")"], [1, "rgba(45,32,48,0)"]]);
      }
      marksOf(G).forEach(function (B, i) {
        var f = clamp(dist(C, B) / Math.max(1, R0));
        collapse(ctx, B, lt - 600 * (1 - Math.pow(1 - f, 1 / 3)), G.cell * 1.1, (G.rT || 16) * 0.5, 80 + i);
      });
    }

    /* Delayed Blast Fireball. Sticky bead on one square. Detonate is the Fireball-family bloom. */
    function dbfUnder(ctx, lt, G) {
      var C = centerOf(G); if (!C) return;
      if (G.mode === "boom") { scorch(ctx, C, G.cell * (G.zr || 4) * 0.75, clamp((lt - 80) / 250)); return; }
      if (G.mode === "tick" || G.mode === "clear") return;
      var show = G.mode === "idle" || lt > 180;
      if (!show) return;
      var h = G.cell / 2 - 1, a = G.mode === "idle" ? 0.9 : clamp((lt - 180) / 200);
      add(ctx, function () { glow(ctx, C.x, C.y, G.cell * 0.7, [[0, rgba(PAL.fire.core, 0.22 * a)], [1, rgba(PAL.fire.glow, 0)]]); });
      ctx.save(); ctx.setLineDash([4, 4]); ctx.lineWidth = 1.2; ctx.strokeStyle = rgba(PAL.fire.burst, 0.45 * a);
      ctx.strokeRect(C.x - h, C.y - h, h * 2, h * 2); ctx.restore();
    }
    function beadCore(ctx, C, lt, G) {
      var total = G.rounds > 0 ? G.rounds : 10;
      var left = (G.roundsLeft != null && isFinite(Number(G.roundsLeft))) ? Number(G.roundsLeft) : total;
      var prog = clamp(1 - left / Math.max(1, total));
      var speed = 1.1 + prog * 2.2;
      var ph = (lt / 1000) * speed, u = ph % 1, pu = 0.85 + 0.15 * Math.sin(ph * TAU);
      add(ctx, function () {
        glow(ctx, C.x, C.y, 21 * pu, [[0, rgba(PAL.fire.ball, 1)], [0.35, rgba(PAL.fire.core, 0.85)], [1, rgba(PAL.fire.glow, 0)]]);
        ring(ctx, C.x, C.y, 9 + u * G.cell * 0.45, 2.4 * (1 - u) + 0.4, rgba(PAL.fire.burst, 0.9 * (1 - u)), 8);
        var lit = 8 - Math.floor(prog * 8);
        for (var s = 0; s < 8; s++) {
          var a0 = -Math.PI / 2 + s / 8 * TAU + 0.06;
          ctx.save(); ctx.lineWidth = 2; ctx.strokeStyle = rgba(s < lit ? PAL.fire.hot : PAL.fire.glow, s < lit ? 0.85 : 0.25);
          ctx.beginPath(); ctx.arc(C.x, C.y, 19, a0, a0 + TAU / 8 - 0.16); ctx.stroke(); ctx.restore();
        }
      });
      ctx.save(); ctx.beginPath(); ctx.arc(C.x, C.y, 4.5, 0, TAU); ctx.fillStyle = "rgba(255,248,230,1)"; ctx.fill(); ctx.restore();
    }
    function dbfBoom(ctx, lt, G) {
      var C = centerOf(G); if (!C) return;
      var R = G.cell * (G.zr || 4), v = clamp(lt / 1400);
      if (lt < 120) add(ctx, function () { glow(ctx, C.x, C.y, G.cell * 1.2, [[0, rgba(PAL.fire.ball, 1 - lt / 120)], [1, rgba(PAL.fire.core, 0)]]); });
      var r = rng(71);
      for (var k = 0; k < 16; k++) {
        var an = k / 16 * TAU + r() * 0.3, d = R * (0.75 + 0.2 * easeOut(clamp(lt / 500))), sa = env(lt, 150, 350, 700, 1400);
        glow(ctx, C.x + Math.cos(an) * d, C.y + Math.sin(an) * d, G.cell * (0.7 + 0.35 * r()), [[0, rgba("25,18,14", 0.6 * sa)], [1, "rgba(25,18,14,0)"]]);
      }
      add(ctx, function () {
        glow(ctx, C.x, C.y, R * (0.35 + 0.65 * easeOut(clamp(lt / 220))), [[0, rgba(PAL.fire.ball, 0.95 * (1 - v))], [0.3, rgba(PAL.fire.core, 0.85 * (1 - v))], [0.7, rgba(PAL.fire.glow, 0.5 * (1 - v))], [1, rgba(PAL.fire.glow, 0)]]);
        flameRing(ctx, C.x, C.y, R * 0.6 * (0.6 + 0.4 * easeOut(v)), 24, lt, 1 - v, R * 0.2, 5);
        if (lt < 450) ring(ctx, C.x, C.y, G.cell * 0.6 + easeOut(lt / 450) * R * 0.95, 5 * (1 - lt / 450) + 0.6, rgba(PAL.fire.hot, 1 - lt / 450), 14);
      });
      sparks(ctx, C.x, C.y, lt, 28, 9, 380, 1400, PAL.fire.burst, 1.8, -20);
    }
    function dbf(ctx, lt, G) {
      var C = centerOf(G); if (!C) return;
      if (G.mode === "boom") { dbfBoom(ctx, lt, G); return; }
      if (G.mode === "clear") { clearPop(ctx, C, G.cell, lt); return; }
      if (G.mode === "idle") { beadCore(ctx, C, lt, G); return; }
      var A = G.A || C;
      if (lt < 260) {
        var p = easeOut(lt / 260), H = lp(A, C, p);
        add(ctx, function () {
          for (var k = 6; k >= 1; k--) {
            var P = lp(A, C, clamp(p - k * 0.05));
            glow(ctx, P.x, P.y, 7 - k * 0.6, [[0, rgba(PAL.fire.burst, 0.6 * (1 - k / 7))], [1, rgba(PAL.fire.glow, 0)]]);
          }
          glow(ctx, H.x, H.y, 12, [[0, rgba(PAL.fire.ball, 1)], [0.4, rgba(PAL.fire.core, 0.85)], [1, rgba(PAL.fire.glow, 0)]]);
        });
        return;
      }
      beadCore(ctx, C, lt, G);
    }

    function paintOne(map, ctx, look, lt, G) {
      var fn = map[look];
      if (fn && lt >= 0) fn(ctx, lt, G || {});
    }
    var PAINT = {
      wallice: function (ctx, lt, G) { if (G.mode === "tick") wallTick(ctx, lt, G); else if (G.mode === "clear") clearPop(ctx, centerOf(G), G.cell * 2, lt); },
      wallthorn: function (ctx, lt, G) { if (G.mode === "tick") wallTick(ctx, lt, G); else if (G.mode === "clear") clearPop(ctx, centerOf(G), G.cell * 2, lt); },
      wallblade: function (ctx, lt, G) { if (G.mode === "tick") wallTick(ctx, lt, G); else if (G.mode === "clear") clearPop(ctx, centerOf(G), G.cell * 2, lt); },
      hunger: hunger, arms: arms, daggers: daggers, swarm: plague, furnace: incendiary,
      flame: flame, storm: storm, icebomb: freezing, sunburst: sunburst, deathring: circleOfDeath, bead: dbf
    };
    var UNDER = {
      wallice: wallSkin, wallthorn: wallSkin, wallblade: wallSkin,
      hunger: hungerUnder, arms: armsUnder, daggers: daggersUnder, swarm: plagueUnder, furnace: incendiaryUnder,
      flame: flameUnder, storm: stormUnder, icebomb: freezingUnder, deathring: circleUnder, bead: dbfUnder
    };
    function tokenState(look, lt, id, G) {
      var s = { dx: 0, dy: 0, grey: 0, tint: null };
      var P = (G.T && G.T[0]) || G.Z;
      var C = G.Z || P;
      if (!P || !C || id !== "target") return s;
      var inside = dist(P, C) <= G.cell * (G.zr || 1) + (G.rT || 0);
      if (look === "hunger" && inside && G.mode !== "clear" && G.mode !== "tick") s.tint = { col: "20,12,26", a: 0.28 };
      if (look === "icebomb" && inside && lt > FZ.det) s.tint = { col: PAL.cold.mist, a: 0.38 * env(lt - FZ.det, 40, 200, 700, 1400) };
      if (look === "sunburst" && inside) s.tint = { col: PAL.blind, a: 0.5 * env(lt, 30, 90, 260, 900) };
      return s;
    }
    function shakeOf(look, lt, spec) {
      function sh(t0, mag, dur) {
        var t = lt - t0;
        if (t < 0 || t > dur) return { x: 0, y: 0 };
        var k = mag * (1 - t / dur);
        return { x: Math.sin(t * 0.9) * k, y: Math.cos(t * 1.3) * k };
      }
      spec = spec || {};
      if (spec.pulse || spec.garnish === "clear" || spec.quiet) return { x: 0, y: 0 };
      if (look === "arms") return sh(AH.out - 20, 1.6, 160);
      if (look === "flame") return sh(120, 4, 260);
      if (look === "storm") {
        var o = sh(100, 2.2, 180);
        var n = Math.min(9, (spec.hops && spec.hops.length) || 0);
        for (var i = 0; i < n; i++) {
          var s = sh(100 + (i + 1) * 100, 1.4, 140);
          o.x += s.x; o.y += s.y;
        }
        return o;
      }
      if (look === "icebomb") return sh(FZ.det, 4, 260);
      if (look === "sunburst") return sh(40, 2.5, 200);
      if (look === "deathring") return sh(80, 1.6, 180);
      if (look === "bead" && spec.garnish === "detonate") return sh(40, 6, 360);
      return { x: 0, y: 0 };
    }
    return {
      looks: Object.keys(PAINT),
      paint: function (ctx, look, lt, G) { paintOne(PAINT, ctx, look, lt, G); },
      paintUnder: function (ctx, look, lt, G) {
        if (G && (G.mode === "tick")) return;
        if (G && G.mode === "clear") return;
        paintOne(UNDER, ctx, look, lt, G);
      },
      tokenState: tokenState,
      shakeOf: shakeOf
    };
  })();

  /* Chunk 5. Cone of Cold sheds snow past the cone. Conjure Volley kicks a short ground grit. */
  var Chunk5Fx = (function () {
    var TAU = Math.PI * 2;
    var PAL = {
      steel: { metal: "90,95,105", dark: "55,58,66", glint: "220,225,235", spark: "255,190,110", fletch: "135,115,75" },
      force: "95,220,205",
      dust: "120,95,70",
      lightning: { glow: "85,120,240", core: "232,236,255", hot: "255,255,255" },
      briar: { wood: "70,62,38", vine: "90,95,45", dark: "40,38,18", sage: "110,120,70", tip: "150,110,70", prick: "150,175,80", prickHot: "220,235,170", splinter: "200,160,110" },
      poison: { glow: "150,140,70", core: "195,185,110", dark: "40,42,18", pox: "200,170,70", hot: "240,230,160" },
      psychic: { glow: "150,45,105", core: "215,125,170", hot: "245,200,220", wisp: "190,170,225" },
      necrotic: { glow: "95,45,100", black: "6,3,8", bone: "185,170,180", ash: "120,112,118", hex: "170,90,190" },
      thunder: { glow: "200,170,110", core: "235,215,170", dust: "95,80,60" },
      radiant: { glow: "230,175,70", core: "255,232,170", hot: "255,250,230" },
      cold: { glow: "80,125,185", core: "200,225,250", hot: "250,252,255", mist: "150,185,225" },
      note: { paper: "205,188,150", edge: "60,62,70" }
    };
    function clamp(v, a, b) { a = a === undefined ? 0 : a; b = b === undefined ? 1 : b; return Math.max(a, Math.min(b, v)); }
    function rgba(c, a) { return "rgba(" + c + "," + clamp(a) + ")"; }
    function lerp(a, b, t) { return a + (b - a) * t; }
    function lp(A, B, t) { return { x: lerp(A.x, B.x, t), y: lerp(A.y, B.y, t) }; }
    function easeOut(t) { return 1 - Math.pow(1 - clamp(t), 3); }
    function easeIn(t) { t = clamp(t); return t * t; }
    function easeInOut(t) { t = clamp(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
    function env(t, a, b, c, d) { if (t < a || t > d) return 0; if (t < b) return (t - a) / Math.max(1, b - a); if (t <= c) return 1; return 1 - (t - c) / Math.max(1, d - c); }
    function rng(seed) { var s = (seed * 2654435761) >>> 0; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
    function dist(A, B) { return Math.hypot((B.x - A.x), (B.y - A.y)); }
    function norm(A, B) { var d = dist(A, B) || 1; return { x: (B.x - A.x) / d, y: (B.y - A.y) / d }; }
    function scOf(G) { return ((G && G.cell) || 70) / 70; }
    function poly(ctx, pts) {
      if (!pts || pts.length < 2) return;
      ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
      for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    }
    function stroke(ctx, pts, w, col, blur, blurCol) {
      if (!pts || pts.length < 2) return;
      ctx.save(); ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.lineWidth = w; ctx.strokeStyle = col;
      if (blur) { ctx.shadowBlur = blur; ctx.shadowColor = blurCol || col; }
      poly(ctx, pts); ctx.stroke(); ctx.restore();
    }
    function glow(ctx, x, y, r, stops) {
      if (!(r > 0.5)) return;
      var g = ctx.createRadialGradient(x, y, 0, x, y, r);
      for (var i = 0; i < stops.length; i++) g.addColorStop(stops[i][0], stops[i][1]);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    }
    function add(ctx, fn) { ctx.save(); ctx.globalCompositeOperation = "lighter"; fn(); ctx.restore(); }
    function ring(ctx, x, y, r, w, col, blur) {
      if (!(r > 0) || !(w > 0)) return;
      ctx.save(); ctx.lineWidth = w; ctx.strokeStyle = col;
      if (blur) { ctx.shadowBlur = blur; ctx.shadowColor = col; }
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke(); ctx.restore();
    }
    function sparks(ctx, x, y, t, n, seed, speed, life, col, size) {
      if (t < 0 || t > life) return;
      var r = rng(seed), u = t / life;
      add(ctx, function () {
        for (var i = 0; i < n; i++) {
          var a = r() * TAU, v = speed * (0.4 + r() * 0.8), d = v * (1 - Math.pow(1 - u, 2)) * life / 1000 * 0.6;
          ctx.fillStyle = rgba(col, (1 - u) * (0.6 + r() * 0.4));
          ctx.beginPath(); ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, size * (1 - u * 0.5), 0, TAU); ctx.fill();
        }
      });
    }
    function jag(A, B, segs, amp, seed) {
      var r = rng(seed), n = norm(A, B), px = -n.y, py = n.x, pts = [];
      for (var i = 0; i <= segs; i++) {
        var u = i / segs, o = (i === 0 || i === segs) ? 0 : (r() - 0.5) * 2 * amp;
        pts.push({ x: lerp(A.x, B.x, u) + px * o, y: lerp(A.y, B.y, u) + py * o });
      }
      return pts;
    }
    function puff(ctx, x, y, t, life, R, seed) {
      if (t < 0 || t > life) return;
      var u = t / life, r = rng(seed);
      for (var k = 0; k < 5; k++) {
        var an = r() * TAU, d = R * (0.25 + 0.75 * easeOut(u)) * (0.5 + r() * 0.5);
        glow(ctx, x + Math.cos(an) * d, y + Math.sin(an) * d - u * 5, R * 0.5 * (0.6 + 0.6 * u), [[0, rgba(PAL.dust, 0.4 * (1 - u))], [1, rgba(PAL.dust, 0)]]);
      }
    }
    function clearPop(ctx, C, R, t) {
      if (!C || t < 0 || t > 800) return;
      var v = t / 800, r = rng(91);
      for (var k = 0; k < 28; k++) {
        var an = r() * TAU, d = R * (0.3 + r() * 0.8) * (0.6 + 0.4 * easeOut(v));
        ctx.fillStyle = "rgba(150,140,125," + (0.55 * (1 - v) * (0.4 + r() * 0.6)) + ")";
        ctx.beginPath(); ctx.arc(C.x + Math.cos(an) * d, C.y + Math.sin(an) * d - v * 8, 1.8, 0, TAU); ctx.fill();
      }
    }
    function coneGeom(G) {
      var ang = Number(G.facing);
      if (!isFinite(ang)) ang = 0;
      var cells = (G.cone && G.cone.L) || 12;
      return { ang: ang, L: cells * (G.cell || 70), half: Math.atan(0.5) };
    }
    function conePath(ctx, S, ang, L, half) {
      ctx.beginPath(); ctx.moveTo(S.x, S.y);
      ctx.arc(S.x, S.y, Math.max(1, L), ang - half, ang + half);
      ctx.closePath();
    }
    function victims(G) {
      var S = G.S || G.A, out = [], i;
      for (i = 0; i < (G.T || []).length; i++) {
        var B = G.T[i];
        if (!B) continue;
        if (S && dist(S, B) < Math.max(8, (G.rS || 18) * 0.75)) continue;
        out.push(B);
      }
      return out;
    }
    function primary(G) { var list = victims(G); return list[0] || (G.T && G.T[0]) || G.Z || G.S; }
    function arrow(ctx, H, n, len, a, sc, trail) {
      if (a <= 0) return;
      var px = -n.y, py = n.x, Tl = { x: H.x - n.x * len, y: H.y - n.y * len };
      if (trail) add(ctx, function () { stroke(ctx, [{ x: H.x - n.x * len * trail, y: H.y - n.y * len * trail }, Tl], 2.4 * sc, rgba(PAL.force, 0.22 * a), 6); });
      stroke(ctx, [Tl, H], 2.2 * sc, rgba(PAL.steel.metal, a));
      ctx.save(); ctx.beginPath();
      ctx.moveTo(H.x + n.x * 5 * sc, H.y + n.y * 5 * sc);
      ctx.lineTo(H.x - n.x * 2 * sc + px * 3 * sc, H.y - n.y * 2 * sc + py * 3 * sc);
      ctx.lineTo(H.x - n.x * 2 * sc - px * 3 * sc, H.y - n.y * 2 * sc - py * 3 * sc);
      ctx.closePath(); ctx.fillStyle = rgba(PAL.steel.dark, a); ctx.fill(); ctx.restore();
      stroke(ctx, [{ x: Tl.x + px * 2 * sc, y: Tl.y + py * 2 * sc }, { x: Tl.x + n.x * 3 * sc, y: Tl.y + n.y * 3 * sc }], 1.1 * sc, rgba(PAL.steel.fletch, a));
    }
    function sparkHit(ctx, B, t, seed, G) {
      if (!B || t < 0 || t > 480) return;
      var u = t / 480, sc = scOf(G);
      add(ctx, function () { glow(ctx, B.x, B.y, G.cell * 0.45, [[0, rgba(PAL.steel.spark, 0.55 * (1 - u))], [1, rgba(PAL.steel.spark, 0)]]); });
      sparks(ctx, B.x, B.y, t, 10, seed, 180 * sc, 420, PAL.steel.spark, 1.3 * sc);
      puff(ctx, B.x, B.y, t, 420, 12 * sc, seed + 3);
    }
    function bolt(ctx, A, B, seed, w, a) {
      if (!A || !B || a <= 0) return;
      var d = dist(A, B), pts = jag(A, B, Math.max(4, Math.round(d / 18)), Math.min(12, d * 0.08), seed);
      add(ctx, function () {
        stroke(ctx, pts, w * 3, rgba(PAL.lightning.glow, 0.45 * a), 12);
        stroke(ctx, pts, w, rgba(PAL.lightning.core, a), 6);
        stroke(ctx, pts, Math.max(0.6, w * 0.35), rgba(PAL.lightning.hot, a));
      });
    }
    function flash(ctx, B, t, life, R, col, hot) {
      if (!B || t < 0 || t > life) return;
      var u = t / life;
      add(ctx, function () {
        glow(ctx, B.x, B.y, R * (0.55 + 0.45 * u), [[0, rgba(hot, 1 - u)], [0.45, rgba(col, 0.5 * (1 - u))], [1, rgba(col, 0)]]);
        ring(ctx, B.x, B.y, R * (0.35 + 0.6 * easeOut(u)), 2.4 * (1 - u) + 0.4, rgba(hot, 1 - u), 8);
      });
    }
    function pricks(ctx, B, t, seed, G) {
      if (!B || t < 0 || t > 420) return;
      var u = t / 420, r = rng(seed), sc = scOf(G);
      add(ctx, function () { glow(ctx, B.x, B.y, G.cell * 0.5, [[0, rgba(PAL.briar.prickHot, 0.65 * (1 - u))], [0.5, rgba(PAL.briar.prick, 0.35 * (1 - u))], [1, rgba(PAL.briar.prick, 0)]]); });
      for (var k = 0; k < 8; k++) {
        var an = r() * TAU, d0 = (G.rT || 16) * (0.4 + 0.8 * easeOut(u));
        stroke(ctx, [{ x: B.x + Math.cos(an) * d0, y: B.y + Math.sin(an) * d0 }, { x: B.x + Math.cos(an) * (d0 + 6 * sc), y: B.y + Math.sin(an) * (d0 + 6 * sc) }], 1.6 * sc, rgba(PAL.briar.splinter, 1 - u));
      }
    }
    function spike(ctx, B, an, L0, L1, w, a) {
      var n = { x: Math.cos(an), y: Math.sin(an) }, px = -n.y, py = n.x;
      var P0 = { x: B.x + n.x * L0, y: B.y + n.y * L0 }, P1 = { x: B.x + n.x * L1, y: B.y + n.y * L1 };
      ctx.beginPath();
      ctx.moveTo(P0.x + px * w, P0.y + py * w); ctx.lineTo(P1.x, P1.y); ctx.lineTo(P0.x - px * w, P0.y - py * w);
      ctx.closePath(); ctx.fillStyle = rgba(PAL.briar.dark, a); ctx.fill();
      stroke(ctx, [lp(P0, P1, 0.55), P1], Math.max(1, w * 0.4), rgba(PAL.briar.prick, a));
    }
    function vinePath(B, k, rT, sq) {
      var a0 = k / 6 * TAU + 0.4, pts = [], s, R0 = rT * 1.45, R1 = rT * 1.02 * sq;
      for (s = 0; s <= 8; s++) {
        var u = s / 8, an = a0 + u * 1.05, rr = lerp(R0, R1, u);
        pts.push({ x: B.x + Math.cos(an) * rr, y: B.y + Math.sin(an) * rr });
      }
      for (s = 1; s <= 12; s++) {
        var an2 = a0 + 1.05 + s / 12 * 1.5, rr2 = R1 + Math.sin(s * 0.8 + k) * 1.6;
        pts.push({ x: B.x + Math.cos(an2) * rr2, y: B.y + Math.sin(an2) * rr2 });
      }
      return pts;
    }
    function vines(ctx, B, frac, a, sq, G) {
      if (!B || a <= 0) return;
      var sc = scOf(G);
      for (var k = 0; k < 6; k++) {
        var all = vinePath(B, k, G.rT || 18, sq);
        var n = Math.max(2, Math.round(all.length * clamp(frac - k * 0.02)));
        var pts = all.slice(0, n);
        if (pts.length < 2) continue;
        stroke(ctx, pts, 5.2 * sc, rgba(PAL.briar.dark, 0.92 * a));
        stroke(ctx, pts, 2.4 * sc, rgba(PAL.briar.vine, a));
        var tip = pts[pts.length - 1];
        ctx.beginPath();
        if (ctx.ellipse) ctx.ellipse(tip.x, tip.y, 4 * sc, 2 * sc, k, 0, TAU);
        else ctx.arc(tip.x, tip.y, 3 * sc, 0, TAU);
        ctx.fillStyle = rgba(PAL.briar.sage, 0.9 * a); ctx.fill();
      }
    }
    function shard(ctx, x, y, an, L, w, col) {
      ctx.save(); ctx.translate(x, y); ctx.rotate(an); ctx.beginPath();
      ctx.moveTo(L, 0); ctx.lineTo(0, w); ctx.lineTo(-L * 0.55, 0); ctx.lineTo(0, -w); ctx.closePath();
      ctx.fillStyle = col; ctx.fill(); ctx.restore();
    }
    function noteGlyph(ctx, x, y, kind, sz, rot, a) {
      if (a <= 0) return;
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(sz / 10, sz / 10); ctx.globalAlpha = clamp(a);
      ctx.fillStyle = "rgb(" + PAL.note.paper + ")"; ctx.strokeStyle = "rgb(" + PAL.note.edge + ")"; ctx.lineWidth = 1.1;
      ctx.shadowBlur = 6; ctx.shadowColor = rgba(PAL.psychic.core, 0.75);
      function head(hx) {
        ctx.beginPath();
        if (ctx.ellipse) ctx.ellipse(hx, 6, 3.4, 2.4, -0.4, 0, TAU);
        else ctx.arc(hx, 6, 3, 0, TAU);
        ctx.fill(); ctx.stroke();
      }
      function stem(hx) { ctx.fillRect(hx + 2.2, -8, 1.6, 14); }
      if (kind === 0) { head(0); stem(0); }
      else { head(-5); head(5); stem(-5); stem(5); ctx.fillRect(-2.4, -8.5, 10, 2.4); }
      ctx.restore();
    }
    function anchor(S, aim, G) {
      var n = (aim && dist(S, aim) > 4) ? norm(S, aim) : { x: Math.cos(G.facing || 0), y: Math.sin(G.facing || 0) };
      var M = { x: S.x + n.x * ((G.rS || 18) + 6), y: S.y + n.y * ((G.rS || 18) + 6) };
      return { n: n, M: M };
    }

    function barrageUnder(ctx, lt, G) {
      var S = G.S || G.A; if (!S) return;
      var c = coneGeom(G), a = env(lt, 0, 40, 280, 700);
      if (a <= 0) return;
      ctx.save(); conePath(ctx, S, c.ang, c.L * easeOut(clamp(lt / 230)), c.half);
      var g = ctx.createRadialGradient(S.x, S.y, 0, S.x, S.y, Math.max(8, c.L));
      g.addColorStop(0, rgba(PAL.force, 0.12 * a)); g.addColorStop(1, rgba(PAL.force, 0.02 * a));
      ctx.fillStyle = g; ctx.fill(); ctx.restore();
    }
    function barrage(ctx, lt, G) {
      var S = G.S || G.A; if (!S) return;
      var c = coneGeom(G), r = rng(12), sc = scOf(G);
      for (var k = 0; k < 28; k++) {
        var an = c.ang + (r() * 2 - 1) * c.half * 0.92, D = c.L * (0.45 + 0.55 * r()), t0 = r() * 60, t = lt - t0;
        if (t < 0) continue;
        var n = { x: Math.cos(an), y: Math.sin(an) }, p = clamp(t / 230);
        var H = { x: S.x + n.x * ((G.rS || 18) + D * easeOut(p)), y: S.y + n.y * ((G.rS || 18) + D * easeOut(p)) };
        var a = 1 - clamp((t - 230) / 420);
        arrow(ctx, H, n, 18 * sc, a, sc, p < 1 ? 2.2 : 0);
        if (p >= 1) puff(ctx, H.x, H.y, t - 230, 320, 8 * sc, k);
      }
      victims(G).forEach(function (B, i) { sparkHit(ctx, B, lt - 180 - i * 30, 30 + i, G); });
    }
    function volleyUnder(ctx, lt, G) {
      var Z = G.Z || primary(G); if (!Z) return;
      var R = (G.zr || 8) * G.cell, a = env(lt, 0, 80, 900, 1500);
      if (a <= 0) return;
      glow(ctx, Z.x, Z.y, R * 1.02, [[0, rgba(PAL.dust, 0.28 * a)], [0.75, rgba(PAL.dust, 0.16 * a)], [1, rgba(PAL.dust, 0)]]);
      var r = rng(44), sc = scOf(G);
      for (var k = 0; k < 36; k++) {
        var t0 = r() * 700, an = r() * TAU, d = Math.sqrt(r()) * R * 0.92;
        var x = Z.x + Math.cos(an) * d, y = Z.y + Math.sin(an) * d, ta = lt - t0 - 190;
        if (ta < 80) continue;
        var sa = 1 - clamp((ta - 500) / 500);
        if (sa <= 0) continue;
        stroke(ctx, [{ x: x - 2 * sc, y: y - 8 * sc }, { x: x, y: y }], 1.8 * sc, rgba(PAL.steel.dark, 0.85 * sa));
      }
    }
    function volley(ctx, lt, G) {
      var Z = G.Z || primary(G); if (!Z) return;
      var R = (G.zr || 8) * G.cell, r = rng(44), sc = scOf(G);
      var dn = norm({ x: 0, y: 0 }, { x: 0.28, y: 1 });
      for (var q = 0; q < 48; q++) {
        var t0 = r() * 700, an = r() * TAU, d = Math.sqrt(r()) * R * 0.92;
        var X = { x: Z.x + Math.cos(an) * d, y: Z.y + Math.sin(an) * d }, tq = lt - t0;
        if (tq < 0 || tq > 900) continue;
        if (tq < 190) {
          var f = easeIn(tq / 190);
          var Hh = { x: X.x - dn.x * 150 * sc * (1 - f), y: X.y - dn.y * 150 * sc * (1 - f) };
          arrow(ctx, Hh, dn, 18 * sc, 0.5 + 0.5 * f, sc, 2.4);
        } else {
          puff(ctx, X.x, X.y, tq - 190, 360, 7 * sc, 100 + q);
          sparks(ctx, X.x, X.y, tq - 190, 3, 200 + q, 100, 220, PAL.steel.spark, 1.1 * sc);
        }
      }
      victims(G).forEach(function (B, i) { sparkHit(ctx, B, lt - 220 - i * 40, 70 + i, G); });
      if (lt > 180) gritBurst(ctx, Z.x, Z.y, lt - 180, 800, 16, 44, Math.min(R, G.cell * 3), ["120,95,70", "95,80,60"]);
    }
    function lightningUnder(ctx, lt, G) {
      var t = lt - 200; if (t < 0) return;
      var B = primary(G); if (!B) return;
      var a = env(t, 0, 20, 180, 700);
      glow(ctx, B.x, B.y + 2, G.cell * 0.55, [[0, "rgba(15,12,10," + (0.45 * a) + ")"], [1, "rgba(15,12,10,0)"]]);
    }
    function lightningArrow(ctx, lt, G) {
      var S = G.S || G.A; if (!S) return;
      var B = primary(G), aim = B || { x: S.x + Math.cos(G.facing || 0) * G.cell, y: S.y + Math.sin(G.facing || 0) * G.cell };
      var W = anchor(S, aim, G), sc = scOf(G);
      if (lt < 220) {
        var ca = clamp(lt / 80), sd = Math.floor(lt / 50);
        add(ctx, function () {
          glow(ctx, W.M.x, W.M.y, (12 + 3 * Math.sin(lt / 60)) * sc, [[0, rgba(PAL.lightning.hot, 0.7 * ca)], [0.45, rgba(PAL.lightning.glow, 0.4 * ca)], [1, rgba(PAL.lightning.glow, 0)]]);
          for (var k = 0; k < 3; k++) {
            var rr = rng(sd * 5 + k);
            stroke(ctx, jag(S, { x: W.M.x + (rr() - 0.5) * 8, y: W.M.y + (rr() - 0.5) * 8 }, 4, 3 * sc, sd + k), 1.1 * sc, rgba(PAL.lightning.core, 0.7 * ca), 6);
          }
        });
      }
      var t = lt - 200; if (t < 0 || !B || dist(S, B) < (G.rS || 18)) return;
      var a = 1 - clamp((t - 140) / 280);
      bolt(ctx, W.M, B, 11 + Math.floor(t / 40), 2.2 * sc, a);
      flash(ctx, B, t, 460, G.cell * 0.9, PAL.lightning.glow, PAL.lightning.hot);
      sparks(ctx, B.x, B.y, t, 12, 5, 200, 420, PAL.lightning.core, 1.2 * sc);
      victims(G).slice(1).forEach(function (C, i) {
        var ts = t - 70 - i * 20; if (ts < 0) return;
        var sa = 1 - clamp((ts - 100) / 200);
        bolt(ctx, B, C, 80 + i * 9, 1.2 * sc, sa);
        flash(ctx, C, ts, 320, G.cell * 0.55, PAL.lightning.glow, PAL.lightning.core);
      });
    }
    function hailUnder(ctx, lt, G) {
      if (lt < 0) return;
      var B = primary(G); if (!B) return;
      var a = env(lt, 0, 60, 480, 1100), r = rng(8), sc = scOf(G);
      for (var k = 0; k < 18; k++) {
        var an = r() * TAU, d = G.cell * (0.25 + r() * 0.9);
        ctx.fillStyle = rgba(r() > 0.5 ? PAL.briar.wood : PAL.briar.sage, 0.55 * a);
        ctx.fillRect(B.x + Math.cos(an) * d, B.y + Math.sin(an) * d, 3 * sc, 2 * sc);
      }
    }
    function hail(ctx, lt, G) {
      var B = primary(G); if (!B) return;
      var R = G.cell * 1.15, g = easeOut(clamp(lt / 220)), a = 1 - clamp((lt - 360) / 500), r = rng(3), sc = scOf(G);
      if (a > 0) {
        add(ctx, function () { glow(ctx, B.x, B.y, R * (0.45 + 0.7 * g), [[0, rgba(PAL.briar.prickHot, 0.55 * a)], [0.6, rgba(PAL.briar.prick, 0.28 * a)], [1, rgba(PAL.briar.prick, 0)]]); });
        ring(ctx, B.x, B.y, R * g, 2.6 * sc, rgba(PAL.briar.dark, 0.55 * a));
        for (var k = 0; k < 22; k++) {
          var an = k / 22 * TAU + (r() - 0.5) * 0.15, L = R * (0.5 + 0.5 * r()) * g;
          spike(ctx, B, an, (G.rT || 16) * 0.3, L, (2.6 + r()) * sc, a);
        }
      }
      puff(ctx, B.x, B.y, lt, 560, R * 0.55, 9);
      pricks(ctx, B, lt, 2, G);
      victims(G).slice(1).forEach(function (C, i) { pricks(ctx, C, lt - 80 - i * 24, 20 + i, G); });
    }
    function ensnareUnder(ctx, lt, G) {
      if (G.mode === "tick" || G.mode === "clear") return;
      var B = primary(G); if (!B) return;
      var a = G.mode === "idle" ? 0.45 : clamp(lt / 140) * (1 - 0.45 * clamp((lt - 500) / 400));
      var r = rng(17);
      for (var k = 0; k < 6; k++) {
        var an = r() * TAU;
        var P0 = { x: B.x + Math.cos(an) * (G.rT || 16) * 0.7, y: B.y + Math.sin(an) * (G.rT || 16) * 0.7 };
        var P1 = { x: B.x + Math.cos(an) * (G.rT || 16) * (1.5 + r() * 0.4), y: B.y + Math.sin(an) * (G.rT || 16) * (1.5 + r() * 0.4) };
        stroke(ctx, jag(P0, P1, 3, 2, 5 + k), 1.4 * scOf(G), "rgba(25,18,12," + (0.7 * a) + ")");
      }
    }
    function ensnare(ctx, lt, G) {
      var B = primary(G); if (!B) return;
      if (G.mode === "clear") {
        vines(ctx, B, 1, 1 - clamp(lt / 320), 1, G);
        clearPop(ctx, B, G.cell * 0.8, lt);
        return;
      }
      if (G.mode === "tick") { pricks(ctx, B, lt, 7, G); return; }
      if (G.mode === "idle") {
        var sq = 1 + 0.03 * Math.sin(lt / 380);
        vines(ctx, B, 1, 0.92, sq, G);
        return;
      }
      var frac = easeOut(clamp(lt / 420)), a = clamp(lt / 80);
      vines(ctx, B, frac, a, 1, G);
      puff(ctx, B.x, B.y, lt, 420, G.cell * 0.55, 4);
      pricks(ctx, B, lt - 40, 6, G);
    }
    function contagion(ctx, lt, G) {
      var B = primary(G); if (!B) return;
      var S = G.S || G.A || B, sc = scOf(G);
      if (G.mode === "clear") {
        ring(ctx, B.x, B.y, (G.rT || 18) + 4, 6 * sc, rgba(PAL.poison.dark, 0.5 * (1 - clamp(lt / 320))));
        clearPop(ctx, B, G.cell * 0.8, lt);
        return;
      }
      var idle = G.mode === "idle";
      var t = idle ? 800 : lt;
      if (!idle && lt < 520) {
        var n = norm(S, B), p = easeOut(clamp(lt / 200)), hand = lp(S, { x: B.x - n.x * (G.rT || 18), y: B.y - n.y * (G.rT || 18) }, p);
        add(ctx, function () {
          stroke(ctx, [S, hand], 8 * sc, rgba(PAL.poison.glow, 0.35 * (1 - clamp((lt - 280) / 200))), 10);
          stroke(ctx, [S, hand], 3 * sc, rgba(PAL.poison.core, 0.8), 6);
          glow(ctx, hand.x, hand.y, 12 * sc, [[0, rgba(PAL.poison.hot, 0.65)], [1, rgba(PAL.poison.glow, 0)]]);
        });
      }
      if (!idle && lt < 360) return;
      var wa = idle ? 0.9 : clamp((lt - 360) / 160);
      var pu = 0.5 + 0.5 * Math.sin((idle ? lt : lt - 360) / 180);
      ring(ctx, B.x, B.y, (G.rT || 18) + 3, 6 * sc, rgba(PAL.poison.dark, 0.7 * wa));
      add(ctx, function () {
        ring(ctx, B.x, B.y, (G.rT || 18) + 3, 2.2 * sc, rgba(PAL.poison.core, (0.65 + 0.3 * pu) * wa), 8);
        var pr = ((lt % 1100) / 1100);
        ring(ctx, B.x, B.y, (G.rT || 18) + 4 + pr * 12 * sc, 1.6 * sc, rgba(PAL.poison.core, 0.45 * (1 - pr) * wa), 4);
      });
      for (var d = 0; d < 8; d++) {
        var an = d / 8 * TAU, x = B.x + Math.cos(an) * ((G.rT || 18) + 2), y = B.y + Math.sin(an) * ((G.rT || 18) + 2);
        ctx.beginPath(); ctx.arc(x, y, (d % 3 ? 2 : 3) * sc, 0, TAU);
        ctx.fillStyle = rgba(PAL.poison.pox, 0.9 * wa); ctx.fill();
      }
      var Sg = { x: B.x + (G.rT || 18) * 0.72, y: B.y - (G.rT || 18) * 0.72 };
      ctx.beginPath(); ctx.arc(Sg.x, Sg.y, 8 * sc, 0, TAU);
      ctx.fillStyle = rgba(PAL.poison.dark, 0.85 * wa); ctx.fill();
      ctx.lineWidth = 1.3 * sc; ctx.strokeStyle = rgba(PAL.poison.pox, wa); ctx.stroke();
      for (var q = 0; q < 3; q++) {
        var aq = q / 3 * TAU - Math.PI / 2;
        ctx.beginPath(); ctx.arc(Sg.x + Math.cos(aq) * 3.4 * sc, Sg.y + Math.sin(aq) * 3.4 * sc, 1.7 * sc, 0, TAU);
        ctx.fillStyle = rgba(PAL.poison.hot, (0.7 + 0.3 * pu) * wa); ctx.fill();
      }
      if (!idle && t < 900) flash(ctx, B, lt - 360, 420, G.cell * 0.7, PAL.poison.glow, PAL.poison.hot);
    }
    function specterShape(ctx, x, y, s) {
      ctx.beginPath();
      ctx.moveTo(x - 0.13 * s, y); ctx.lineTo(x - 0.12 * s, y - 0.15 * s);
      ctx.quadraticCurveTo(x, y - 0.19 * s, x + 0.12 * s, y - 0.15 * s); ctx.lineTo(x + 0.13 * s, y);
      ctx.lineTo(x + 0.28 * s, y + 0.02 * s); ctx.lineTo(x + 0.12 * s, y + 0.08 * s);
      ctx.lineTo(x + 0.34 * s, y + 1.05 * s);
      ctx.lineTo(x, y + 0.92 * s);
      ctx.lineTo(x - 0.34 * s, y + 1.05 * s);
      ctx.lineTo(x - 0.12 * s, y + 0.08 * s); ctx.lineTo(x - 0.28 * s, y + 0.02 * s);
      ctx.closePath();
    }
    function phantasm(ctx, lt, G) {
      var B = primary(G); if (!B) return;
      var A = G.A || G.S || B, sc = scOf(G);
      if (G.mode === "clear") {
        var lift = clamp(lt / 320);
        drawSpecter(ctx, B, G, 1 - lift, lt, -lift * 16 * sc);
        clearPop(ctx, B, G.cell * 0.85, lt);
        return;
      }
      if (G.mode === "tick") {
        var u = clamp(lt / 520);
        add(ctx, function () { ring(ctx, B.x, B.y, (G.rT || 18) + easeOut(u) * G.cell * 0.6, 3 * (1 - u) + 0.4, rgba(PAL.psychic.core, 1 - u), 10); });
        return;
      }
      if (G.mode !== "idle" && lt < 480) {
        var p = easeOut(clamp(lt / 320)), a = 1 - clamp((lt - 320) / 200), n = norm(A, B), pts = [];
        for (var s = 0; s <= 18; s++) {
          var uu = s / 18 * p, w = Math.sin(uu * 10) * 6 * Math.sin(Math.PI * uu);
          pts.push({ x: lerp(A.x, B.x, uu) - n.y * w, y: lerp(A.y, B.y, uu) + n.x * w });
        }
        add(ctx, function () {
          stroke(ctx, pts, 5 * sc, rgba(PAL.psychic.glow, 0.4 * a), 10);
          stroke(ctx, pts, 1.4 * sc, rgba(PAL.psychic.core, 0.9 * a));
        });
      }
      var rise = G.mode === "idle" ? 1 : easeOut(clamp((lt - 200) / 400));
      if (rise <= 0) return;
      drawSpecter(ctx, B, G, rise, lt, (1 - rise) * 14 * sc);
      if (G.mode !== "idle") flash(ctx, B, lt - 280, 360, G.cell * 0.7, PAL.psychic.glow, PAL.psychic.hot);
    }
    function drawSpecter(ctx, B, G, a, lt, lift) {
      if (a <= 0) return;
      var s = G.cell * 1.35, sc = scOf(G);
      var x = B.x + G.cell * 0.28 + Math.sin(lt / 900) * 2 * sc;
      var y = B.y - G.cell * 0.95 + lift + Math.sin(lt / 640) * 2 * sc;
      specterShape(ctx, x, y, s);
      var g = ctx.createLinearGradient(x, y - 0.2 * s, x, y + s);
      g.addColorStop(0, rgba("128,122,134", 0.62 * a));
      g.addColorStop(1, rgba("92,88,98", 0));
      ctx.fillStyle = g; ctx.fill();
      add(ctx, function () {
        ctx.lineWidth = 1.2 * sc; ctx.strokeStyle = rgba(PAL.psychic.core, 0.4 * a);
        specterShape(ctx, x, y, s); ctx.stroke();
        glow(ctx, x - 0.04 * s, y + 0.16 * s, 3.2 * sc, [[0, rgba(PAL.psychic.hot, 0.8 * a)], [1, rgba(PAL.psychic.glow, 0)]]);
        glow(ctx, x + 0.04 * s, y + 0.16 * s, 3.2 * sc, [[0, rgba(PAL.psychic.hot, 0.8 * a)], [1, rgba(PAL.psychic.glow, 0)]]);
      });
      add(ctx, function () { ring(ctx, B.x, B.y, (G.rT || 18) + 2, 1.3 * sc, rgba(PAL.psychic.core, 0.4 * a), 5); });
    }
    function harmUnder(ctx, lt, G) {
      var A = G.A || G.S, B = primary(G); if (!A || !B) return;
      var p = easeIn(clamp(lt / 300)), a = env(lt, 0, 40, 300, 900), r = rng(5);
      for (var k = 0; k < 10; k++) {
        var u = r() * p, P = lp(A, B, u), age = clamp((lt - u * 300) / 600);
        glow(ctx, P.x, P.y - age * 8, 8 + age * 10, [[0, "rgba(30,18,32," + (0.4 * (1 - age) * a) + ")"], [1, "rgba(30,18,32,0)"]]);
      }
    }
    function harm(ctx, lt, G) {
      var A = G.A || G.S, B = primary(G); if (!A || !B) return;
      var sc = scOf(G);
      if (lt < 480) {
        var p = easeIn(clamp(lt / 300)), a = 1 - clamp((lt - 300) / 180), H = lp(A, B, p), n = norm(A, B), L = dist(A, B);
        for (var k = 0; k < 14; k++) {
          var u = k / 13, back = u * Math.min(L * 0.5, L * p);
          var wob = Math.sin(lt / 40 + k) * 4 * sc * u;
          var P = { x: H.x - n.x * back - n.y * wob, y: H.y - n.y * back + n.x * wob };
          var rr = (26 - 12 * u) * sc;
          glow(ctx, P.x, P.y, rr, [[0, rgba(PAL.necrotic.black, 0.72 * a * (1 - u * 0.5))], [0.65, "rgba(30,14,34," + (0.45 * a) + ")"], [1, "rgba(30,14,34,0)"]]);
        }
        add(ctx, function () { glow(ctx, H.x, H.y, 16 * sc, [[0, rgba(PAL.necrotic.glow, 0.55 * a)], [1, rgba(PAL.necrotic.glow, 0)]]); });
      }
      var t = lt - 300; if (t < 0) return;
      collapse(ctx, B, t, G.cell * 1.6, (G.rT || 16) * 0.4, 21);
      collapse(ctx, B, t - 70, G.cell * 1.1, (G.rT || 16) * 0.35, 22);
      var ta = t - 360;
      if (ta >= 0 && ta < 480) {
        var u = ta / 480;
        add(ctx, function () {
          glow(ctx, B.x, B.y, G.cell * (0.5 + 0.5 * u), [[0, rgba(PAL.necrotic.bone, 0.85 * (1 - u))], [0.5, rgba(PAL.necrotic.ash, 0.4 * (1 - u))], [1, rgba(PAL.necrotic.ash, 0)]]);
          ring(ctx, B.x, B.y, (G.rT || 16) * (1 + u * 0.6), 2 * (1 - u) + 0.4, rgba(PAL.necrotic.bone, 1 - u), 6);
        });
      }
    }
    function collapse(ctx, B, t, R0, R1, seed) {
      if (!B || t < 0) return;
      if (t < 400) {
        var u = easeOut(t / 400), R = lerp(R0, R1, u);
        add(ctx, function () { ring(ctx, B.x, B.y, R, 4 * (1 - u) + 1, rgba(PAL.necrotic.hex, 0.9 * (1 - u * 0.5)), 10); });
        glow(ctx, B.x, B.y, Math.max(4, R), [[0, rgba(PAL.necrotic.black, 0.55 * u)], [1, rgba(PAL.necrotic.black, 0)]]);
      }
      var r = rng(seed);
      for (var q = 0; q < 12; q++) {
        var t0 = r() * 400, age = (t - t0) / 800, an = r() * TAU, rad = R1 * (0.5 + r());
        if (age < 0 || age > 1) continue;
        ctx.fillStyle = rgba(PAL.necrotic.ash, 0.85 * (1 - age));
        ctx.fillRect(B.x + Math.cos(an) * rad - 1.5, B.y + Math.sin(an) * rad - 1.5, 3, 3);
      }
    }
    function waveUnder(ctx, lt, G) {
      var S = G.S || G.A; if (!S) return;
      var a = env(lt, 0, 30, 420, 1000), R = (G.zr || 6) * G.cell * easeOut(clamp(lt / 320)), r = rng(50);
      glow(ctx, S.x, S.y, Math.max(4, R), [[0, rgba(PAL.thunder.dust, 0.22 * a)], [1, rgba(PAL.thunder.dust, 0)]]);
      for (var k = 0; k < 8; k++) {
        var an = r() * TAU, L = G.cell * (0.4 + r() * 0.8) * easeOut(clamp(lt / 140));
        stroke(ctx, jag({ x: S.x, y: S.y }, { x: S.x + Math.cos(an) * L, y: S.y + Math.sin(an) * L }, 3, 2, k), 1.4, "rgba(25,18,12," + (0.65 * a) + ")");
      }
    }
    function wave(ctx, lt, G) {
      var S = G.S || G.A; if (!S) return;
      var R0 = (G.zr || 6) * G.cell, R = R0 * easeOut(clamp(lt / 320)), a = env(lt, 0, 20, 320, 780);
      var sk = G.skin === "radiant" ? PAL.radiant : PAL.necrotic, sc = scOf(G);
      if (lt < 180) add(ctx, function () { glow(ctx, S.x, S.y, G.cell * (0.6 + lt / 180), [[0, rgba(PAL.thunder.core, 0.85 * (1 - lt / 180))], [1, rgba(PAL.thunder.glow, 0)]]); });
      if (a > 0 && R > 2) {
        ring(ctx, S.x, S.y, R, G.cell * 0.28, rgba(PAL.thunder.dust, 0.45 * a));
        add(ctx, function () {
          ring(ctx, S.x, S.y, R, 2.2 * sc, rgba(PAL.thunder.core, a), 6);
          ring(ctx, S.x, S.y, R + G.cell * 0.16, 7 * sc, rgba(sk.glow, 0.55 * a), 12);
          ring(ctx, S.x, S.y, R + G.cell * 0.16, 1.5 * sc, rgba(G.skin === "radiant" ? sk.core : PAL.necrotic.hex, 0.9 * a), 5);
        });
        if (G.skin !== "radiant") ring(ctx, S.x, S.y, R + G.cell * 0.16, 4 * sc, rgba(PAL.necrotic.black, 0.55 * a));
      }
      victims(G).forEach(function (B, i) {
        var reach = clamp(dist(S, B) / Math.max(1, R0));
        var tb = lt - 320 * (1 - Math.cbrt(1 - reach));
        if (tb < 0 || tb > 520) return;
        flash(ctx, B, tb, 360, G.cell * 0.5, PAL.thunder.glow, PAL.thunder.core);
        add(ctx, function () { glow(ctx, B.x, B.y, G.cell * 0.35, [[0, rgba(G.skin === "radiant" ? sk.core : PAL.necrotic.hex, 0.55 * (1 - tb / 520))], [1, rgba(sk.glow, 0)]]); });
      });
    }
    function coldUnder(ctx, lt, G) {
      var S = G.S || G.A; if (!S) return;
      var c = coneGeom(G), front = c.L * easeOut(clamp(lt / 360));
      var ra = clamp(lt / 160) * (1 - clamp((lt - 1500) / 600));
      if (ra <= 0) return;
      ctx.save(); conePath(ctx, S, c.ang, front, c.half); ctx.clip();
      var g = ctx.createRadialGradient(S.x, S.y, G.rS || 8, S.x, S.y, Math.max(8, c.L));
      g.addColorStop(0, rgba(PAL.cold.core, 0.24 * ra));
      g.addColorStop(1, rgba(PAL.cold.mist, 0.04 * ra));
      ctx.fillStyle = g; ctx.fillRect(S.x - c.L, S.y - c.L, c.L * 2, c.L * 2);
      var r = rng(19);
      for (var k = 0; k < 70; k++) {
        var an = c.ang + (r() * 2 - 1) * c.half, d = (G.rS || 8) + r() * Math.max(1, front - (G.rS || 8));
        ctx.fillStyle = rgba(PAL.cold.hot, 0.45 * ra);
        ctx.fillRect(S.x + Math.cos(an) * d, S.y + Math.sin(an) * d, 2, 2);
      }
      ctx.restore();
    }
    function cold(ctx, lt, G) {
      var S = G.S || G.A; if (!S) return;
      var c = coneGeom(G), front = c.L * easeOut(clamp(lt / 360)), a = env(lt, 0, 30, 900, 1500), r = rng(29), sc = scOf(G);
      if (a > 0) {
        add(ctx, function () {
          ctx.save(); conePath(ctx, S, c.ang, front, c.half); ctx.clip();
          var g = ctx.createRadialGradient(S.x, S.y, 0, S.x, S.y, Math.max(8, c.L));
          g.addColorStop(0, rgba(PAL.cold.hot, 0.4 * a));
          g.addColorStop(0.45, rgba(PAL.cold.core, 0.2 * a));
          g.addColorStop(1, rgba(PAL.cold.glow, 0));
          ctx.fillStyle = g; ctx.fillRect(S.x - c.L, S.y - c.L, c.L * 2, c.L * 2);
          for (var k = 0; k < 40; k++) {
            var an = c.ang + (r() * 2 - 1) * c.half * 0.95, sp = 0.65 + r() * 0.5;
            var d = (G.rS || 8) + ((lt * sp + r() * c.L) % Math.max(8, front));
            if (d > front) continue;
            var n = { x: Math.cos(an), y: Math.sin(an) }, Ls = (7 + 8 * r()) * sc;
            stroke(ctx, [{ x: S.x + n.x * d, y: S.y + n.y * d }, { x: S.x + n.x * (d + Ls), y: S.y + n.y * (d + Ls) }], 1.2 * sc, rgba(PAL.cold.hot, 0.55 * a));
          }
          ctx.restore();
        });
      }
      var r2 = rng(31);
      for (var q = 0; q < 16; q++) {
        var an2 = c.ang + (r2() * 2 - 1) * c.half * 0.85, tq = lt - r2() * 200, d2 = (G.rS || 8) + tq * (0.8 + r2() * 0.4);
        if (tq < 0 || d2 > c.L) continue;
        add(ctx, function () { shard(ctx, S.x + Math.cos(an2) * d2, S.y + Math.sin(an2) * d2, an2, 8 * sc, 2 * sc, rgba(PAL.cold.core, 0.8)); });
      }
      victims(G).forEach(function (B, i) {
        var tb = lt - 360 * clamp((dist(S, B) - (G.rS || 0)) / Math.max(1, c.L)) * 0.6;
        flash(ctx, B, tb, 420, G.cell * 0.55, PAL.cold.glow, PAL.cold.hot);
      });
      var snowA = env(lt, 40, 160, 1100, 1800);
      if (snowA > 0) {
        var snow = rng(37);
        ctx.save();
        ctx.globalCompositeOperation = "source-over";
        for (var sn = 0; sn < 14; sn++) {
          var side = snow() < 0.5 ? 1 : -1;
          var anS = c.ang + side * (c.half + 0.08 + snow() * 0.2);
          var dS = (G.rS || 8) + snow() * c.L * 0.8;
          ctx.fillStyle = rgba("250,252,255", 0.65 * snowA);
          ctx.fillRect(S.x + Math.cos(anS) * dS, S.y + Math.sin(anS) * dS, 2.2, 2.2);
        }
        ctx.restore();
      }
    }
    function mockery(ctx, lt, G) {
      var A = G.A || G.S, B = primary(G); if (!A || !B) return;
      var n = norm(A, B), px = -n.y, py = n.x, p = easeOut(clamp(lt / 240)), a = 1 - clamp((lt - 300) / 280), sc = scOf(G);
      if (a > 0) {
        add(ctx, function () {
          for (var l = -1; l <= 1; l++) {
            var pts = [], segs = 8;
            for (var s = 0; s <= segs; s++) {
              var u = s / segs * p, z = (s % 2 ? 1 : -1) * 5 * sc * Math.sin(Math.PI * u) + l * 6 * sc;
              pts.push({ x: lerp(A.x, B.x, u) + px * z, y: lerp(A.y, B.y, u) + py * z });
            }
            stroke(ctx, pts, 3.5 * sc, rgba(PAL.psychic.glow, 0.28 * a), 6);
            stroke(ctx, pts, 1.3 * sc, rgba(PAL.psychic.core, 0.8 * a));
          }
        });
      }
      for (var k = 0; k < 6; k++) {
        var t = lt - k * 40, u = easeOut(clamp(t / 300));
        if (t < 0) continue;
        var na = 1 - clamp((t - 380) / 280);
        if (na <= 0) continue;
        var w = Math.sin(t / 55 + k) * 8 * sc + (k % 2 ? 8 : -8) * sc;
        noteGlyph(ctx, lerp(A.x, B.x, u * 0.92) + px * w, lerp(A.y, B.y, u * 0.92) + py * w, k % 3 === 1 ? 1 : 0, 13 * sc, Math.sin(t / 80 + k) * 0.5, na);
      }
      var th = lt - 240; if (th < 0) return;
      flash(ctx, B, th, 400, G.cell * 0.7, PAL.psychic.glow, PAL.psychic.hot);
      var ca = env(th, 0, 30, 400, 700);
      if (ca > 0) {
        var C0 = { x: B.x - (G.rT || 16) * 0.2, y: B.y - (G.rT || 16) * 0.8 };
        var C1 = { x: B.x + (G.rT || 16) * 0.9, y: B.y + (G.rT || 16) * 0.15 };
        add(ctx, function () { stroke(ctx, jag(C0, C1, 4, 3, 3), 2.4 * sc, rgba(PAL.psychic.core, ca), 6); });
        for (var v = 0; v < 2; v++) {
          var cx = B.x + (G.rT || 16) + 8 * sc, cy = B.y + v * 6 * sc;
          stroke(ctx, [{ x: cx - 4 * sc, y: cy - 3 * sc }, { x: cx, y: cy + 2 * sc }, { x: cx + 4 * sc, y: cy - 3 * sc }], 1.6 * sc, rgba(PAL.psychic.core, ca));
        }
      }
    }
    function whispers(ctx, lt, G) {
      var A = G.A || G.S, B = primary(G); if (!A || !B) return;
      var n = norm(A, B), p = easeOut(clamp(lt / 380)), a = 1 - clamp((lt - 460) / 340), sc = scOf(G);
      var E = { x: A.x + n.x * ((G.rS || 18) + 4), y: A.y + n.y * ((G.rS || 18) + 4) };
      if (a > 0) {
        add(ctx, function () {
          for (var w = 0; w < 4; w++) {
            var pts = [];
            for (var s = 0; s <= 16; s++) {
              var u = s / 16 * p, o = Math.sin(u * 8 + w) * (4 + w) * sc * Math.sin(Math.PI * u);
              pts.push({ x: lerp(E.x, B.x, u) - n.y * o, y: lerp(E.y, B.y, u) + n.x * o });
            }
            stroke(ctx, pts, 2.6 * sc, rgba(PAL.psychic.wisp, 0.28 * a), 8);
            stroke(ctx, pts, 1 * sc, rgba(PAL.psychic.wisp, 0.75 * a));
          }
        });
      }
      var th = lt - 380;
      flash(ctx, B, th, 400, G.cell * 0.65, PAL.psychic.wisp, PAL.psychic.hot);
      var fa = env(th, 40, 120, 500, 800);
      if (fa > 0) {
        for (var c = 0; c < 3; c++) {
          var d = (G.rT || 16) + (8 + c * 7) * sc, P = { x: B.x + n.x * d, y: B.y + n.y * d }, qx = -n.y, qy = n.x;
          add(ctx, function () {
            stroke(ctx, [
              { x: P.x - n.x * 4 * sc + qx * 4 * sc, y: P.y - n.y * 4 * sc + qy * 4 * sc },
              P,
              { x: P.x - n.x * 4 * sc - qx * 4 * sc, y: P.y - n.y * 4 * sc - qy * 4 * sc }
            ], 1.5 * sc, rgba(PAL.psychic.wisp, 0.75 * fa), 4);
          });
        }
      }
    }
    function verbalUnder(ctx, lt, G) {
      var B = primary(G), A = G.A || G.S; if (!A || !B) return;
      var t = lt - 420, a = env(t, 20, 80, 700, 1100);
      if (a <= 0) return;
      var n = norm(A, B), f = easeInOut(clamp((t - 40) / 420));
      var from = B, to = { x: B.x + n.x * G.cell * f, y: B.y + n.y * G.cell * f };
      var px = -n.y * (G.rT || 16) * 0.4, py = n.x * (G.rT || 16) * 0.4;
      ctx.beginPath();
      ctx.moveTo(from.x + px, from.y + py); ctx.lineTo(to.x + px, to.y + py);
      ctx.lineTo(to.x - px, to.y - py); ctx.lineTo(from.x - px, from.y - py);
      ctx.closePath(); ctx.fillStyle = rgba(PAL.dust, 0.35 * a); ctx.fill();
    }

    var PAINT = {
      barrage: barrage, volley: volley, charged: lightningArrow, hail: hail, ensnare: ensnare,
      fever: contagion, specter: phantasm, harm: harm, stomp: wave, coldcone: cold, mockery: mockery, whispers: whispers
    };
    var UNDER = {
      barrage: barrageUnder, volley: volleyUnder, charged: lightningUnder, hail: hailUnder, ensnare: ensnareUnder,
      harm: harmUnder, stomp: waveUnder, coldcone: coldUnder, whispers: verbalUnder
    };
    function tokenState(key, lt, id, G) {
      var s = { dx: 0, dy: 0, grey: 0, tint: null };
      if (id && id !== "target") return s;
      var B = primary(G), S = G.S || G.A;
      if (key === "ensnare" && G.mode === "cast") {
        if (lt > 0 && lt < 200) s.dx = Math.sin(lt / 22) * 2.2 * (1 - lt / 200);
        s.tint = { col: PAL.briar.vine, a: 0.1 };
      }
      if (key === "ensnare" && G.mode === "idle") s.tint = { col: PAL.briar.vine, a: 0.08 };
      if (key === "fever") {
        var ca = G.mode === "clear" ? 1 - clamp(lt / 320) : (G.mode === "idle" || lt > 360 ? 1 : 0);
        if (ca > 0) s.tint = { col: PAL.poison.pox, a: (0.16 + 0.06 * Math.sin(lt / 180)) * ca };
      }
      if (key === "specter") {
        var pa = G.mode === "clear" ? 1 - clamp(lt / 320) : (G.mode === "idle" || lt > 280 ? 1 : 0);
        if (pa > 0) s.tint = { col: "60,40,70", a: 0.16 * pa };
      }
      if (key === "harm") s.grey = env(lt, 480, 700, 1100, 1500);
      if (key === "stomp" && B && S) {
        var n = norm(S, B), reach = clamp(dist(S, B) / Math.max(1, (G.zr || 6) * G.cell));
        var t = lt - 320 * (1 - Math.cbrt(1 - reach));
        var pt = t < 0 ? 0 : easeOut(clamp(t / 160)) * (1 - easeInOut(clamp((t - 180) / 280)));
        s.dx = n.x * G.cell * 0.22 * pt; s.dy = n.y * G.cell * 0.22 * pt;
      }
      if (key === "coldcone") {
        var fa = env(lt, 200, 400, 1400, 1900);
        if (fa > 0) s.tint = { col: PAL.cold.mist, a: 0.32 * fa };
      }
      if (key === "mockery") {
        var ma = env(lt, 240, 300, 640, 900);
        if (ma > 0) s.tint = { col: PAL.psychic.core, a: 0.18 * ma };
      }
      if (key === "whispers" && B && S && G.mode !== "clear") {
        var f = easeInOut(clamp((lt - 440) / 420)), n2 = norm(S, B);
        s.dx = n2.x * G.cell * f; s.dy = n2.y * G.cell * f;
      }
      return s;
    }
    function shakeOf(key, lt) {
      function sh(t0, mag, dur) {
        var t = lt - t0;
        if (t < 0 || t > dur) return { x: 0, y: 0 };
        var k = mag * (1 - t / dur);
        return { x: Math.sin(t * 0.9) * k, y: Math.cos(t * 1.3) * k };
      }
      if (key === "charged") return sh(200, 2, 180);
      if (key === "harm") return sh(660, 2.4, 200);
      if (key === "stomp") return sh(20, 4.5, 280);
      if (key === "coldcone") return sh(30, 1.5, 240);
      if (key === "volley") return sh(250, 1.1, 360);
      return { x: 0, y: 0 };
    }
    return {
      paint: function (ctx, key, lt, G) { if (PAINT[key] && lt >= 0 && G) PAINT[key](ctx, lt, G); },
      paintUnder: function (ctx, key, lt, G) {
        if (!UNDER[key] || lt < 0 || !G) return;
        if (G.mode === "tick" || G.mode === "clear") return;
        UNDER[key](ctx, lt, G);
      },
      tokenState: tokenState,
      shakeOf: shakeOf
    };
  })();

  /* Chunk 6 Phase 1 Love-it outlines. Shape + clear effect.
     One cast, then a staggered arrival on each chosen ally (the cast's hops, up to six).
     Teal clear-sparkles paint only when Heal actually drops Blinded or Deafened (G.clear).
     No board shake, no create-token, no token wrap. */
  var Chunk6Fx = (function () {
  var TAU = Math.PI * 2;
  var PAL = {
    hw: { glow: "140,195,95", ring1: "210,220,120", ring2: "120,175,85", motes: "230,215,130", tint: "205,220,140" },
    bless: "230,175,70",
    radiant: { glow: "230,175,70", core: "255,232,170", hot: "255,250,230" },
    amber: { glow: "235,160,70", core: "255,215,150", hot: "255,240,205" },
    pane: { amber: "225,150,55", gold: "245,200,105", rose: "220,120,80", lead: "35,26,16" },
    teal: "95,220,205"
  };
  function clamp(v, a, b) { a = a === undefined ? 0 : a; b = b === undefined ? 1 : b; return Math.max(a, Math.min(b, v)); }
  function rgba(c, a) { return "rgba(" + c + "," + clamp(a) + ")"; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function lp(A, B, t) { return { x: lerp(A.x, B.x, t), y: lerp(A.y, B.y, t) }; }
  function easeOut(t) { return 1 - Math.pow(1 - clamp(t), 3); }
  function easeIn(t) { t = clamp(t); return t * t; }
  function easeInOut(t) { t = clamp(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function env(t, a, b, c, d) { if (t < a || t > d) return 0; if (t < b) return (t - a) / Math.max(1, b - a); if (t <= c) return 1; return 1 - (t - c) / Math.max(1, d - c); }
  function rng(seed) { var s = (seed * 2654435761) >>> 0; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  function dist(A, B) { return Math.hypot(B.x - A.x, B.y - A.y); }
  function norm(A, B) { var d = dist(A, B) || 1; return { x: (B.x - A.x) / d, y: (B.y - A.y) / d }; }
  function edge(A, B, r) { var n = norm(A, B); return { x: A.x + n.x * r, y: A.y + n.y * r }; }
  function poly(ctx, pts) { ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y); }
  function stroke(ctx, pts, w, col, blur, blurCol) {
    if (!pts || pts.length < 2) return;
    ctx.save(); ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.lineWidth = w; ctx.strokeStyle = col;
    if (blur) { ctx.shadowBlur = blur; ctx.shadowColor = blurCol || col; }
    poly(ctx, pts); ctx.stroke(); ctx.restore();
  }
  function glow(ctx, x, y, r, stops) {
    if (r <= 0.5) return;
    var g = ctx.createRadialGradient(x, y, 0, x, y, r);
    for (var i = 0; i < stops.length; i++) g.addColorStop(stops[i][0], stops[i][1]);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  }
  function add(ctx, fn) { ctx.save(); ctx.globalCompositeOperation = "lighter"; fn(); ctx.restore(); }
  function ring(ctx, x, y, r, w, col, blur) {
    if (r <= 0 || w <= 0) return;
    ctx.save(); ctx.lineWidth = w; ctx.strokeStyle = col;
    if (blur) { ctx.shadowBlur = blur; ctx.shadowColor = col; }
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke(); ctx.restore();
  }
  function motes(ctx, B, t, life, n, seed, R, col, rise, size) {
    if (t < 0 || t > life) return;
    var r = rng(seed);
    add(ctx, function () {
      for (var i = 0; i < n; i++) {
        var d0 = r() * 0.35, u = clamp((t / life - d0) / (1 - d0));
        if (u <= 0 || u >= 1) { r(); r(); continue; }
        var an = r() * TAU, rr = R * (0.25 + 0.75 * r());
        var x = B.x + Math.cos(an) * rr + Math.sin(u * 6 + i) * 2.5;
        var y = B.y + Math.sin(an) * rr * 0.6 - rise * easeOut(u);
        var a = Math.sin(Math.PI * u);
        glow(ctx, x, y, size * 2.6, [[0, rgba(col, 0.55 * a)], [1, rgba(col, 0)]]);
        ctx.fillStyle = rgba(PAL.radiant.hot, 0.85 * a);
        ctx.beginPath(); ctx.arc(x, y, size * 0.55, 0, TAU); ctx.fill();
      }
    });
  }
  function softHalo(ctx, B, R, w, col, a) {
    if (a <= 0) return;
    add(ctx, function () {
      ring(ctx, B.x, B.y, R, w * 2.2, rgba(col, 0.18 * a), 16);
      ring(ctx, B.x, B.y, R, w, rgba(col, 0.55 * a), 8);
    });
  }
  function rimGlow(ctx, B, rIn, rOut, col, a) {
    if (a <= 0) return;
    add(ctx, function () {
      var g = ctx.createRadialGradient(B.x, B.y, rIn * 0.4, B.x, B.y, rOut);
      g.addColorStop(0, rgba(col, 0.06 * a));
      g.addColorStop(Math.min(0.92, rIn / rOut), rgba(col, 0.42 * a));
      g.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(B.x, B.y, rOut, 0, TAU); ctx.fill();
    });
  }
  function curve(A, B, bend, n) {
    var m = lp(A, B, 0.5), nn = norm(A, B), C = { x: m.x - nn.y * bend, y: m.y + nn.x * bend }, pts = [];
    for (var i = 0; i <= n; i++) {
      var u = i / n, v = 1 - u;
      pts.push({ x: v * v * A.x + 2 * v * u * C.x + u * u * B.x, y: v * v * A.y + 2 * v * u * C.y + u * u * B.y });
    }
    return pts;
  }
  function wavy(A, B, bend, amp, ph, n) {
    var pts = curve(A, B, bend, n), nn = norm(A, B);
    return pts.map(function (P, k) {
      var u = k / n, o = Math.sin(u * 7 + ph) * amp * Math.sin(Math.PI * u);
      return { x: P.x - nn.y * o, y: P.y + nn.x * o };
    });
  }
  function taper(ctx, pts, w, col, blur) {
    if (!pts || pts.length < 2) return;
    for (var k = 1; k < pts.length; k++) {
      var u = k / (pts.length - 1);
      stroke(ctx, [pts[k - 1], pts[k]], Math.max(0.4, w * (0.25 + 0.75 * u)), col, blur);
    }
  }
  function slice(pts, u0, u1) {
    var n = pts.length - 1, a = Math.max(0, Math.floor(u0 * n)), b = Math.min(n, Math.ceil(u1 * n));
    return pts.slice(a, b + 1);
  }

  var MHW = { ring: 150, first: 120, stagger: 200, travel: 260, glowLife: 620, moteLife: 820 };
  function mhwArrive(i) { return MHW.first + i * MHW.stagger + MHW.travel; }
  function mhwUnder(ctx, lt, G) {
    var a = env(lt, 0, 60, 260, 700);
    if (a <= 0 || !G.S) return;
    add(ctx, function () {
      glow(ctx, G.S.x, G.S.y, G.rS * 1.9, [[0, rgba(PAL.bless, 0)], [0.55, rgba(PAL.bless, 0.12 * a)], [1, rgba(PAL.bless, 0)]]);
    });
  }
  function mhw(ctx, lt, G) {
    var u = clamp(lt / MHW.ring), ra = 1 - clamp((lt - MHW.ring) / 380);
    if (lt < MHW.ring + 380 && G.S) add(ctx, function () {
      var R = G.rS + 4 + easeOut(u) * G.cell * 1.4;
      ring(ctx, G.S.x, G.S.y, R, 6 * ra, rgba(PAL.bless, 0.22 * ra), 14);
      ring(ctx, G.S.x, G.S.y, R, 1.6 * ra + 0.3, rgba(PAL.radiant.core, 0.75 * ra), 6);
      glow(ctx, G.S.x, G.S.y, G.rS * 1.4, [[0, rgba(PAL.radiant.hot, 0)], [0.7, rgba(PAL.radiant.core, 0.25 * ra)], [1, rgba(PAL.radiant.core, 0)]]);
    });
    (G.T || []).forEach(function (B, i) {
      var t0 = MHW.first + i * MHW.stagger, t = lt - t0;
      var E = edge(G.S, B, G.rS + 2), F = edge(B, G.S, G.rT + 2);
      var pts = curve(E, F, (i % 2 ? 1 : -1) * 14, 24);
      if (t >= 0 && t < MHW.travel + 260) {
        var p = easeInOut(clamp(t / MHW.travel)), ta = 1 - clamp((t - MHW.travel) / 260), H = pts[Math.round(p * 24)];
        add(ctx, function () {
          var tr = slice(pts, Math.max(0, p - 0.55), p);
          stroke(ctx, tr, 3, rgba(PAL.bless, 0.18 * ta), 6);
          stroke(ctx, tr, 0.9, rgba(PAL.radiant.core, 0.6 * ta));
          if (p < 1 && H) glow(ctx, H.x, H.y, 9, [[0, rgba(PAL.radiant.hot, 0.95)], [0.4, rgba(PAL.hw.ring1, 0.6)], [1, rgba(PAL.hw.glow, 0)]]);
        });
      }
      var th = lt - mhwArrive(i);
      if (th < 0) return;
      var ga = env(th, 0, 70, 220, MHW.glowLife);
      rimGlow(ctx, B, G.rT, G.rT * 1.6, PAL.hw.glow, ga);
      if (th < 420) softHalo(ctx, B, G.rT + 2 + easeOut(th / 420) * G.cell * 0.35, 1.4, PAL.hw.ring1, 1 - th / 420);
      motes(ctx, B, th, MHW.moteLife, 7, 11 + i, G.rT * 0.9, PAL.hw.motes, G.cell * 0.55, 2.2);
    });
  }

  var MCW = { first: 0, stagger: 90, travel: 300, bloom: 520, after: 420 };
  function mcwArrive(i) { return MCW.first + i * MCW.stagger + MCW.travel; }
  function mcwUnder(ctx, lt, G) {
    var a = env(lt, 0, 80, 500, 1100);
    if (a > 0 && G.S) add(ctx, function () {
      glow(ctx, G.S.x, G.S.y, G.cell * 1.3, [[0, rgba(PAL.amber.core, 0.16 * a)], [0.6, rgba(PAL.amber.glow, 0.1 * a)], [1, rgba(PAL.amber.glow, 0)]]);
    });
    (G.T || []).forEach(function (B, i) {
      var th = lt - mcwArrive(i), pa = env(th, 0, 80, 300, 900);
      if (pa > 0) add(ctx, function () {
        glow(ctx, B.x, B.y + G.rT * 0.15, G.cell * 0.95, [[0, rgba(PAL.amber.glow, 0)], [0.5, rgba(PAL.amber.glow, 0.16 * pa)], [1, rgba(PAL.amber.glow, 0)]]);
      });
    });
  }
  function mcw(ctx, lt, G) {
    (G.T || []).forEach(function (B, i) {
      var t0 = MCW.first + i * MCW.stagger, t = lt - t0;
      var E = edge(G.S, B, G.rS * 0.7), F = edge(B, G.S, G.rT * 0.6);
      if (t >= 0 && t < MCW.travel + 380) {
        var p = easeOut(clamp(t / MCW.travel)), wa = 1 - clamp((t - MCW.travel) / 380);
        add(ctx, function () {
          for (var s = 0; s < 3; s++) {
            var pts = wavy(E, F, (s - 1) * 16 + (i % 2 ? 8 : -8), 5 + s * 2, t / 140 + s * 1.9 + i, 30);
            var tr = slice(pts, Math.max(0, p - 0.85), p), w = s === 1 ? 1 : 0.65;
            taper(ctx, tr, 16 * w, rgba(PAL.amber.glow, 0.13 * wa), 18);
            taper(ctx, tr, 6 * w, rgba(PAL.amber.core, 0.26 * wa), 8);
            taper(ctx, tr, 1.6 * w, rgba(PAL.amber.hot, 0.32 * wa));
          }
          var H = lp(E, F, p);
          if (p < 1) glow(ctx, H.x, H.y, G.cell * 0.42, [[0, rgba(PAL.amber.hot, 0.8)], [0.45, rgba(PAL.amber.glow, 0.35)], [1, rgba(PAL.amber.glow, 0)]]);
        });
      }
      var th = lt - mcwArrive(i);
      if (th < 0) return;
      var ba = env(th, 0, 90, MCW.bloom - 200, MCW.bloom + MCW.after);
      rimGlow(ctx, B, G.rT + 2, G.rT * 1.9, PAL.amber.glow, ba);
      softHalo(ctx, B, G.rT + 3, 2.6, PAL.radiant.core, ba * 0.9);
      if (th < 520) softHalo(ctx, B, G.rT + 3 + easeOut(th / 520) * G.cell * 0.55, 2, PAL.radiant.glow, 1 - th / 520);
      if (th < 300) add(ctx, function () {
        glow(ctx, B.x, B.y, G.rT * 1.5, [[0, rgba(PAL.amber.hot, 0.32 * (1 - th / 300))], [1, rgba(PAL.amber.glow, 0)]]);
      });
      motes(ctx, B, th - 60, 900, 9, 31 + i, G.rT, PAL.radiant.core, G.cell * 0.6, 2.4);
    });
  }

  var HL = { thread: 260, drop: 150, hold: 380, after: 650, pool: [380, 520, 1050, 1700], clear: 520 };
  function hlHit() { return HL.thread + HL.drop; }
  function hlUnder(ctx, lt, G) {
    var B = G.T && G.T[0];
    if (!B) return;
    var a = env(lt, HL.pool[0], HL.pool[1], HL.pool[2], HL.pool[3]);
    if (a <= 0) return;
    var R = G.cell * (1.35 + 0.4 * easeOut(clamp((lt - HL.pool[0]) / 400))), n = 12, rot = (lt - HL.pool[0]) / 9000;
    add(ctx, function () {
      glow(ctx, B.x, B.y, R * 1.15, [[0, rgba(PAL.radiant.core, 0.3 * a)], [0.6, rgba(PAL.pane.gold, 0.14 * a)], [1, rgba(PAL.pane.amber, 0)]]);
      for (var k = 0; k < n; k++) {
        var a0 = rot + k / n * TAU, a1 = a0 + TAU / n * 0.82;
        var col = k % 3 === 0 ? PAL.pane.rose : (k % 2 ? PAL.pane.amber : PAL.pane.gold);
        ctx.beginPath();
        ctx.moveTo(B.x + Math.cos(a0) * G.rT * 1.1, B.y + Math.sin(a0) * G.rT * 1.1);
        ctx.arc(B.x, B.y, R, a0, a1);
        ctx.arc(B.x, B.y, G.rT * 1.1, a1, a0, true);
        ctx.closePath();
        var g = ctx.createRadialGradient(B.x, B.y, G.rT, B.x, B.y, R);
        g.addColorStop(0, rgba(col, 0.46 * a));
        g.addColorStop(0.75, rgba(col, 0.16 * a));
        g.addColorStop(1, rgba(col, 0));
        ctx.fillStyle = g; ctx.fill();
      }
    });
    ctx.save();
    ctx.strokeStyle = rgba(PAL.pane.lead, 0.4 * a);
    ctx.lineWidth = 1.2;
    for (var j = 0; j < n; j++) {
      var an = rot + j / n * TAU - TAU / n * 0.09;
      ctx.beginPath();
      ctx.moveTo(B.x + Math.cos(an) * G.rT * 1.1, B.y + Math.sin(an) * G.rT * 1.1);
      ctx.lineTo(B.x + Math.cos(an) * R * 0.95, B.y + Math.sin(an) * R * 0.95);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(B.x, B.y, G.rT * 1.1 + (R - G.rT * 1.1) * 0.55, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }
  function heal(ctx, lt, G) {
    var B = G.T && G.T[0];
    if (!B || !G.S) return;
    var F = edge(B, G.S, G.rT + 2);
    var ta = env(lt, 0, 60, HL.thread + 40, HL.thread + 260), p = easeInOut(clamp(lt / HL.thread));
    if (ta > 0) add(ctx, function () {
      var tr = slice(curve(G.A || G.S, F, 6, 24), 0, p);
      stroke(ctx, tr, 3, rgba(PAL.bless, 0.2 * ta), 6);
      stroke(ctx, tr, 1, rgba(PAL.radiant.core, 0.65 * ta));
    });
    var t = lt - HL.thread;
    if (t < 0) return;
    var top = B.y - G.cell * 4.2, fall = easeIn(clamp(t / HL.drop)), yb = lerp(top, B.y, fall);
    var ca = env(t, 0, 40, HL.drop + HL.hold, HL.drop + HL.hold + 300), w = G.cell * 0.62;
    if (ca > 0) add(ctx, function () {
      var g = ctx.createLinearGradient(B.x - w * 1.6, 0, B.x + w * 1.6, 0);
      g.addColorStop(0, rgba(PAL.radiant.glow, 0));
      g.addColorStop(0.3, rgba(PAL.radiant.glow, 0.22 * ca));
      g.addColorStop(0.5, rgba(PAL.radiant.hot, 0.5 * ca));
      g.addColorStop(0.7, rgba(PAL.radiant.glow, 0.22 * ca));
      g.addColorStop(1, rgba(PAL.radiant.glow, 0));
      ctx.fillStyle = g;
      ctx.fillRect(B.x - w * 1.6, Math.max(0, top - 40), w * 3.2, Math.max(1, yb - Math.max(0, top - 40)));
      var g2 = ctx.createLinearGradient(B.x - w * 0.4, 0, B.x + w * 0.4, 0);
      g2.addColorStop(0, rgba(PAL.radiant.core, 0));
      g2.addColorStop(0.5, rgba(PAL.radiant.hot, 0.55 * ca));
      g2.addColorStop(1, rgba(PAL.radiant.core, 0));
      ctx.fillStyle = g2;
      ctx.fillRect(B.x - w * 0.4, Math.max(0, top - 40), w * 0.8, Math.max(1, yb - Math.max(0, top - 40)));
      var r = rng(5);
      for (var k = 0; k < 14; k++) {
        var x = B.x + (r() - 0.5) * w * 1.8, y = lerp(top, yb, (r() + t / 700) % 1);
        glow(ctx, x, y, 3.5, [[0, rgba(PAL.radiant.hot, 0.8 * ca)], [1, rgba(PAL.radiant.core, 0)]]);
      }
      glow(ctx, B.x, yb, w * 1.4, [[0, rgba(PAL.radiant.hot, 0.5 * ca)], [1, rgba(PAL.radiant.glow, 0)]]);
    });
    var th = t - HL.drop;
    if (th < 0) return;
    if (th < 520) add(ctx, function () {
      var u = th / 520;
      glow(ctx, B.x, B.y, G.cell * (0.9 + 0.7 * easeOut(u)), [[0, rgba(PAL.radiant.hot, 0.8 * (1 - u))], [0.35, rgba(PAL.radiant.core, 0.6 * (1 - u))], [1, rgba(PAL.radiant.glow, 0)]]);
    });
    for (var h = 0; h < 3; h++) {
      var tr2 = th - h * 110;
      if (tr2 > 0 && tr2 < 640) softHalo(ctx, B, G.rT + 4 + easeOut(tr2 / 640) * G.cell * (1.0 + h * 0.35), 2.6 - h * 0.6, h ? PAL.radiant.glow : PAL.radiant.core, 1 - tr2 / 640);
    }
    var aa = env(th, 200, 320, 320 + HL.after * 0.4, 320 + HL.after);
    rimGlow(ctx, B, G.rT + 2, G.rT * 1.8, PAL.radiant.glow, 0.9 * aa);
    softHalo(ctx, B, G.rT + 3, 2.2, PAL.radiant.core, 0.8 * aa);
    motes(ctx, B, th - 80, 1100, 12, 77, G.rT * 1.1, PAL.radiant.core, G.cell * 0.8, 2.6);
    if (G.clear) motes(ctx, B, th - HL.clear, 1100, 10, 91, G.rT * 1.05, PAL.teal, G.cell * 1.0, 1.9);
  }

  function tokenState(look, lt, id, G) {
    var s = { dx: 0, dy: 0, grey: 0, tint: null };
    var ti = typeof id === "number" ? id : (id === "target" ? 0 : -1);
    if (ti < 0 || !G || !G.T || ti >= G.T.length) return s;
    if (look === "massword") {
      var a = env(lt - mhwArrive(ti), 0, 80, 200, 700);
      if (a > 0) s.tint = { col: PAL.hw.tint, a: 0.1 * a };
    }
    if (look === "masscure") {
      var b = env(lt - mcwArrive(ti), 0, 90, 380, 940);
      if (b > 0) s.tint = { col: PAL.amber.core, a: 0.16 * b };
    }
    if (look === "healcolumn") {
      var c = env(lt - hlHit(), 0, 60, 380, 1100);
      if (c > 0) s.tint = { col: PAL.radiant.core, a: 0.24 * c };
    }
    return s;
  }
  var PAINT = { massword: mhw, masscure: mcw, healcolumn: heal };
  var UNDER = { massword: mhwUnder, masscure: mcwUnder, healcolumn: hlUnder };
  return {
    looks: Object.keys(PAINT),
    paint: function (ctx, look, lt, G) { if (PAINT[look] && lt >= 0 && G) PAINT[look](ctx, lt, G); },
    paintUnder: function (ctx, look, lt, G) { if (UNDER[look] && lt >= 0 && G) UNDER[look](ctx, lt, G); },
    tokenState: function (look, lt, id, G) { return lt >= 0 ? tokenState(look, lt, id, G) : { dx: 0, dy: 0, grey: 0, tint: null }; },
    shakeOf: function () { return { x: 0, y: 0 }; }
  };
  })();


  var C1_LOOKS = {
    "witch-bolt": 1, "scorching-ray": 1, "guiding-bolt": 1, "sacred-flame": 1, "chill-touch": 1,
    "acid-arrow": 1, "poison-spray": 1, "chain-lightning": 1, "disintegrate": 1
  };
  var C2_LOOKS = {
    hex: 1, brand: 1, "shocking-grasp": 1, thorn: 1, rebuke: 1, flameblade: 1,
    heat: 1, fireshield: 1, rime: 1, siphon: 1, enfeeble: 1
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
  function c2Geom(look, g, spec) {
    g = g || {};
    spec = spec || {};
    var S = g.S || g.A;
    var A = g.A || S;
    if (!A && !S) return null;
    var cell = g.cell || 70;
    var miss = resultOf(spec.result) === "miss";
    var center = miss && g.B ? g.B : (g.T || g.B || S || A);
    if (!center) return null;
    var name = low(spec.spell || spec.weapon || "");
    var chill = look === "rime" || low(spec.mode) === "chill" || /fire shield \(chill|chill shield/.test(name);
    var far = !!(S && Math.hypot(center.x - S.x, center.y - S.y) > cell * 0.75);
    return {
      A: A, S: S || A, T: [center],
      rT: g.rT || cell * 0.42, rS: g.rS || cell * 0.42, cell: cell,
      yank: miss ? null : (g.yank || null),
      ghost: g.ghost || null,
      chill: chill,
      quiet: !!g.quiet,
      pulse: !!(spec.pulse || g.pulse),
      saved: !!(spec.saved || g.saved),
      swing: look === "flameblade" && far
    };
  }
  function chunk2Paint(ctx, look, lt, g, spec) {
    var G = c2Geom(look, g, spec);
    if (!G) return;
    Chunk2Fx.paintUnder(ctx, look, lt, G);
    Chunk2Fx.paint(ctx, look, lt, G);
  }
  function c3Geom(look, g, spec) {
    g = g || {};
    spec = spec || {};
    var S = g.S || g.A;
    var A = g.A || S;
    if (!A && !S) return null;
    var cell = g.cell || 70;
    var center = g.T || g.B || S || A;
    if (!center) return null;
    var key = chunk3Key(look, spec);
    var far = !!(S && Math.hypot(center.x - S.x, center.y - S.y) > cell * 0.75);
    var face = Number(spec.facing);
    if (!isFinite(face)) face = Number(g.facing);
    return {
      A: A, S: S || A, T: [center],
      rT: g.rT || cell * 0.42, rS: g.rS || cell * 0.42, cell: cell,
      hops: g.hops || [],
      quiet: !!g.quiet,
      killed: !!(spec.killed),
      rise: !!(spec.rise),
      beat: Math.max(0, Math.min(7, Number(spec.beat) || 0)),
      dmg: low(spec.dmg || spec.dmgType || ""),
      facing: isFinite(face) ? face : null,
      garnish: spec.garnish || "",
      throw: key === "produceflame" && far && !g.quiet
    };
  }
  function chunk3Paint(ctx, look, lt, g, spec) {
    var G = c3Geom(look, g, spec);
    if (!G) return;
    var key = chunk3Key(look, spec || {});
    Chunk3Fx.paintUnder(ctx, key, lt, G);
    Chunk3Fx.paint(ctx, key, lt, G);
  }
  function c4Geom(look, g, spec) {
    g = g || {};
    spec = spec || {};
    var S = g.S || g.A;
    var A = g.A || S;
    var cell = g.cell || 70;
    var center = g.T || g.B || g.Z || S || A;
    if (!center) return null;
    var key = chunk4Key(look, spec);
    var face = Number(spec.facing);
    if (!isFinite(face)) face = Number(g.facing);
    if (!isFinite(face) && A && center) face = Math.atan2(center.y - A.y, center.x - A.x);
    if (!isFinite(face)) face = 0;
    var mode = g.quiet ? "idle" : c4Mode(spec);
    var zrMap = { hunger: 4, swarm: 4, furnace: 4, bead: 4, icebomb: 12, sunburst: 12, deathring: 12, arms: 2, daggers: 1, flame: 2, storm: 2 };
    var zr = zrMap[key] || 4;
    if (Number(g.zr) > 0) zr = Number(g.zr);
    else if (Number(spec.radius) > 0) zr = Number(spec.radius) / 5;
    if (key === "bead" && mode === "boom") zr = 4;
    var targets = [];
    function push(p) {
      if (!p || !isFinite(Number(p.x)) || !isFinite(Number(p.y))) return;
      targets.push({ x: Number(p.x), y: Number(p.y) });
    }
    if (mode === "tick") push(center);
    else {
      push(g.Z || center);
      (g.hops || []).forEach(push);
    }
    if (!targets.length) push(center);
    var skin = key === "wallthorn" ? "thorns" : (key === "wallblade" ? "blades" : "ice");
    var W = (g.W && g.W.length) ? g.W : [];
    if (!W.length && (key === "wallice" || key === "wallthorn" || key === "wallblade")) {
      var cells = key === "wallthorn" ? 12 : 20;
      var hx = Math.cos(face) * cells * cell / 2;
      var hy = Math.sin(face) * cells * cell / 2;
      W = [{ A: { x: center.x - hx, y: center.y - hy }, B: { x: center.x + hx, y: center.y + hy }, skin: skin }];
    }
    return {
      A: A || center, S: S || A || center, T: targets,
      rT: g.rT || cell * 0.42, rS: g.rS || cell * 0.42, cell: cell,
      Z: g.Z || center, zr: zr, W: W, skin: skin, facing: face, mode: mode,
      dmg: low(spec.dmg || spec.dmgType || ""),
      age: Number(g.age) || 0,
      drift: g.drift || null,
      rounds: g.rounds, roundsLeft: g.roundsLeft,
      quiet: mode === "idle"
    };
  }
  function chunk4Paint(ctx, look, lt, g, spec) {
    var G = c4Geom(look, g, spec);
    if (!G) return;
    var key = chunk4Key(look, spec || {});
    Chunk4Fx.paintUnder(ctx, key, lt, G);
    Chunk4Fx.paint(ctx, key, lt, G);
  }
  function c5Geom(look, g, spec) {
    g = g || {};
    spec = spec || {};
    var S = g.S || g.A;
    var A = g.A || S;
    var cell = g.cell || 70;
    var center = g.T || g.B || g.Z || S || A;
    if (!center && !S) return null;
    var key = chunk5Key(look, spec);
    if (!key) return null;
    var face = Number(spec.facing);
    if (!isFinite(face)) face = Number(g.facing);
    if (!isFinite(face) && A && center) face = Math.atan2(center.y - A.y, center.x - A.x);
    if (!isFinite(face)) face = 0;
    var mode = spec.garnish === "clear" ? "clear" : (spec.pulse || g.pulse ? "tick" : (g.quiet ? "idle" : "cast"));
    var targets = [];
    function push(p) {
      if (!p || !isFinite(Number(p.x)) || !isFinite(Number(p.y))) return;
      var i;
      for (i = 0; i < targets.length; i++) {
        if (Math.hypot(targets[i].x - p.x, targets[i].y - p.y) < 6) return;
      }
      targets.push({ x: Number(p.x), y: Number(p.y) });
    }
    push(center);
    (g.hops || []).forEach(push);
    if (!targets.length && (S || A)) push(S || A);
    var len = key === "barrage" || key === "coldcone" ? 12 : 0;
    var zr = key === "volley" ? 8 : (key === "stomp" ? 6 : (key === "hail" ? 1 : 0));
    if (Number(g.zr) > 0 && (key === "volley" || key === "stomp")) zr = Number(g.zr);
    var aim = key === "volley" ? (g.Z || center) : (S || A || center);
    return {
      A: A || center, S: S || A || center, T: targets,
      rT: g.rT || cell * 0.42, rS: g.rS || cell * 0.42, cell: cell,
      Z: aim, zr: zr, facing: face,
      cone: { ang: face, L: len },
      mode: mode, skin: key === "stomp" ? chunk5Skin(spec) : "",
      quiet: mode === "idle"
    };
  }
  function chunk5Paint(ctx, look, lt, g, spec) {
    var G = c5Geom(look, g, spec);
    if (!G) return;
    var key = chunk5Key(look, spec || {});
    Chunk5Fx.paintUnder(ctx, key, lt, G);
    Chunk5Fx.paint(ctx, key, lt, G);
  }
  function c6Geom(look, g, spec) {
    g = g || {};
    spec = spec || {};
    var S = (g.S && isFinite(Number(g.S.x)) && isFinite(Number(g.S.y))) ? g.S : (g.A || null);
    if (!S) return null;
    var cell = g.cell || 70;
    var targets = [];
    function push(p) {
      if (!p || !isFinite(Number(p.x)) || !isFinite(Number(p.y))) return;
      if (targets.length >= 6) return;
      targets.push({ x: Number(p.x), y: Number(p.y) });
    }
    push(g.T || g.B || S);
    (g.hops || []).forEach(push);
    if (!targets.length) return null;
    return {
      A: S, S: S, T: targets,
      rT: g.rT || cell * 0.42, rS: g.rS || cell * 0.42, cell: cell,
      clear: !!(spec.cleared || g.cleared)
    };
  }
  function chunk6Paint(ctx, look, lt, g, spec) {
    var G = c6Geom(look, g, spec);
    if (!G) return;
    Chunk6Fx.paintUnder(ctx, look, lt, G);
    Chunk6Fx.paint(ctx, look, lt, G);
  }
  function zoneLayer(ctx, spec, lt, g, layer) {
    var look = lookOf(spec || {});
    if (!chunk4Spell(look, spec)) return;
    var G = c4Geom(look, Object.assign({}, g || {}, { quiet: true }), Object.assign({}, spec || {}, { quiet: true }));
    if (!G) return;
    var key = chunk4Key(look, spec || {});
    if (layer === "under") Chunk4Fx.paintUnder(ctx, key, lt, G);
    else Chunk4Fx.paint(ctx, key, lt, G);
  }
  function tokenNudge(spec, lt, g) {
    var look = lookOf(spec || {});
    if (chunk5Spell(look, spec)) {
      var G5 = c5Geom(look, g, spec || {});
      if (!G5) return { dx: 0, dy: 0, grey: 0, tint: null };
      return Chunk5Fx.tokenState(chunk5Key(look, spec), lt, "target", G5);
    }
    if (chunk6Spell(look)) {
      var G6 = c6Geom(look, g, spec || {});
      if (!G6) return { dx: 0, dy: 0, grey: 0 };
      var idx = g && isFinite(Number(g.healIndex)) ? Number(g.healIndex) : 0;
      return Chunk6Fx.tokenState(look, lt, idx, G6);
    }
    if (chunk4Spell(look, spec)) {
      var G4 = c4Geom(look, g, spec || {});
      if (!G4) return { dx: 0, dy: 0, grey: 0 };
      return Chunk4Fx.tokenState(chunk4Key(look, spec), lt, "target", G4);
    }
    if (chunk3Spell(look, spec) && look !== "token") {
      var G3 = c3Geom(look, g, spec || {});
      if (!G3) return { dx: 0, dy: 0, grey: 0 };
      return Chunk3Fx.tokenState(chunk3Key(look, spec), lt, "target", G3);
    }
    if (look !== "thorn" && look !== "enfeeble") return { dx: 0, dy: 0, grey: 0 };
    var G = c2Geom(look, g, spec || {});
    if (!G) return { dx: 0, dy: 0, grey: 0 };
    return Chunk2Fx.tokenState(look, lt, "target", G);
  }
  function shieldLookOf(marks) {
    var i, s;
    for (i = 0; i < (marks || []).length; i++) {
      s = stickyLook(marks[i]);
      if (s === "fireshield" || s === "rime") return s;
    }
    return "";
  }
  function paintRider(ctx, look, x, y, r, lt) {
    if (!ctx || !isFinite(x) || !isFinite(y)) return;
    var phase = Number(lt) || 0;
    if (look === "produceflame" || look === "frostray" || look === "sickray") {
      var heldName = look === "frostray" ? "Ray of Frost" : (look === "sickray" ? "Ray of Sickness" : "Produce Flame");
      var heldLook = look === "frostray" ? "cold" : look;
      var held = c3Geom(heldLook, {
        A: { x: x, y: y }, S: { x: x, y: y }, T: { x: x, y: y },
        rT: r || 18, rS: r || 18, cell: Math.max(48, (r || 18) * 2.4), quiet: true
      }, { spell: heldName });
      if (!held) return;
      held.quiet = true;
      Chunk3Fx.paint(ctx, look, 480 + (phase % 900), held);
      return;
    }
    if (look === "ensnare" || look === "fever" || look === "specter") {
      var wrapName = look === "ensnare" ? "Ensnaring Strike" : (look === "fever" ? "Contagion" : "Phantasmal Killer");
      var heldWrap = c5Geom(look, {
        A: { x: x, y: y }, S: { x: x, y: y }, T: { x: x, y: y },
        rT: r || 18, rS: r || 18, cell: Math.max(48, (r || 18) * 2.4), quiet: true
      }, { spell: wrapName });
      if (!heldWrap) return;
      heldWrap.mode = "idle";
      heldWrap.quiet = true;
      Chunk5Fx.paintUnder(ctx, look, 900 + (phase % 1200), heldWrap);
      Chunk5Fx.paint(ctx, look, 900 + (phase % 1200), heldWrap);
      return;
    }
    if (look === "cage" || look === "rime" || C2_LOOKS[look]) {
      var key = look === "cage" ? "shocking-grasp" : look;
      var span = key === "hex" ? 500 : (key === "brand" ? 400 : (key === "heat" ? 900 : (key === "enfeeble" ? 700 : 600)));
      var base = key === "hex" ? 760 : (key === "brand" ? 480 : (key === "heat" ? 800 : (key === "enfeeble" ? 900 : (key === "shocking-grasp" ? 860 : 520))));
      var G = c2Geom(key, {
        A: { x: x, y: y }, S: { x: x, y: y }, T: { x: x, y: y },
        rT: r || 18, rS: r || 18, cell: Math.max(48, (r || 18) * 2.4), quiet: true
      }, { mode: look === "rime" ? "chill" : "" });
      if (!G) return;
      G.quiet = true;
      Chunk2Fx.paintUnder(ctx, key, base + (phase % span), G);
      Chunk2Fx.paint(ctx, key, base + (phase % span), G);
      return;
    }
    var c1 = look === "chill-touch" ? "chill-touch" : "guiding-bolt";
    var when = c1 === "chill-touch" ? 980 : 900;
    var mark = {
      A: { x: x, y: y }, S: { x: x, y: y }, T: [{ x: x, y: y }],
      rT: r || 18, rS: r || 18, cell: Math.max(48, (r || 18) * 2.4),
      miss: [false], dust: false, pop: false
    };
    Chunk1Fx.paint(ctx, c1, when + (phase % 1600), mark);
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
    var spellName = low((spec && (spec.spell || spec.weapon)) || "");
    if (!look) return;
    if (look === "token") {
      if (/flaming sphere/.test(spellName)) {
        var puff = c2Geom("heat", g || { A: A, B: B, T: B, S: A, cell: 70, rT: 18, rS: 18 }, spec || {});
        if (puff) Chunk2Fx.garnish(ctx, lt, puff);
      }
      if (/guardian of faith/.test(spellName)) {
        return chunk3Paint(ctx, look, lt, g || { A: A, B: B, T: B, S: A, cell: 70, rT: 18, rS: 18 }, spec || {});
      }
      return;
    }
    /* Chunk 5 before the shared-key painters. Hail of Thorns is not the Thorn Whip vine.
       Harm is not the Finger of Death ray. */
    if (chunk5Spell(look, spec)) {
      return chunk5Paint(ctx, look, lt, g || { A: A, B: B, T: B, S: A, cell: 70, rT: 18, rS: 18 }, spec || {});
    }
    /* Chunk 3 named looks, plus the shared-key spells that must not steal the older painter. */
    if (chunk3Spell(look, spec)) {
      return chunk3Paint(ctx, look, lt, g || { A: A, B: B, T: B, S: A, cell: 70, rT: 18, rS: 18 }, spec || {});
    }
    /* Thorn Whip gets the vine. Hail of Thorns already returned above. */
    if (C2_LOOKS[look] && !(look === "thorn" && /hail of thorns/.test(spellName))) {
      return chunk2Paint(ctx, look, lt, g || { A: A, B: B, T: B, S: A, cell: 70, rT: 18, rS: 18 }, spec || {});
    }
    if (C1_LOOKS[look]) return chunk1Paint(ctx, look, lt, g || { A: A, B: B, T: B, S: A, cell: 70, rT: 18, rS: 18 }, spec || {});
    if (chunk4Spell(look, spec)) {
      return chunk4Paint(ctx, look, lt, g || { A: A, B: B, T: B, S: A, cell: 70, rT: 18, rS: 18 }, spec || {});
    }
    if (chunk6Spell(look)) {
      return chunk6Paint(ctx, look, lt, g || { A: A, B: B, T: B, S: A, cell: 70, rT: 18, rS: 18 }, spec || {});
    }
    var T = g && (g.T || g.S);
    var r = (g && (g.rT || g.rS)) || 18;
    if (look === "fire") return firePaint(ctx, A, B, lt, seed);
    if (look === "hailstorm") return hailstormPaint(ctx, A, (g && g.T) || B, lt, seed, g);
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
    if (/produce flame|flame in hand/.test(s)) return "produceflame";
    if (/speed −10|speed -10|spd −10|spd -10/.test(s)) return "frostray";
    if (/^poisoned\b/.test(s)) return "sickray";
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
    if (hit) {
      var shell = shieldLookOf(g.marks);
      if (shell) Chunk2Fx.retort(ctx, shell, lt, g);
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
  /* In-flight fire and lightning. 5 ft around the head, then a short impact flash.
     Fireball's flash is the painted 20-ft burst, not a Fire Bolt beam. The light
     ends with the flash; the long ember fade does not keep a standing emitter.
     Cold, force, cones, and touch spells are not projectiles. */
  function projectileLight(spec, lt) {
    var look = lookOf(spec || {});
    if (!isFinite(lt) || lt < 0) return null;
    var flight, end, curve, flashFeet, flashMs;
    if (look === "fire") {
      flight = LOOK_TIME.fire.grow;
      end = flight + LOOK_TIME.fire.fade;
      curve = "easeOut";
      flashFeet = 15;
      flashMs = 180;
    } else if (look === "lightning") {
      flight = LOOK_TIME.lightning.grow;
      end = flight + LOOK_TIME.lightning.hold + LOOK_TIME.lightning.fade;
      curve = "easeOut";
      flashFeet = 15;
      flashMs = 200;
    } else if (look === "fireball") {
      flight = LOOK_TIME.fireball.grow;
      end = flight + LOOK_TIME.fireball.hold + LOOK_TIME.fireball.fade;
      curve = "easeInOut";
      flashFeet = 20;
      flashMs = 400;
    } else if (look === "scorching-ray") {
      flight = 110;
      end = flight + 170 + 300;
      curve = "easeOut";
      flashFeet = 15;
      flashMs = 180;
    } else if (look === "chain-lightning") {
      flight = 80;
      end = flight + 380 + 320;
      curve = "easeOut";
      flashFeet = 15;
      flashMs = 200;
    } else return null;
    if (lt > end) return null;
    if (lt < flight) {
      var t = lt / Math.max(1, flight);
      var u = curve === "easeInOut" ? easeInOut(t) : easeOut(t);
      return { phase: "flight", u: u, feet: 5, look: look };
    }
    if (lt >= flight + flashMs) return null;
    return { phase: "flash", u: 1, feet: flashFeet, look: look };
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

  /* One motion clock. A late frame (a full map redraw, a busy room) moves at most
     maxStep ms, so a bolt does not leap to its impact. Time already missed is
     dropped, not replayed as a stutter. Calls within 4ms share one stamp so
     the projectile, its light, and a token slide in the same turn stay together. */
  function makeAnimClock(maxStep) {
    var cap = maxStep > 0 ? maxStep : 50;
    var wallAt = 0;
    var clock = 0;
    var seen = false;
    return function (wall) {
      if (!isFinite(wall)) wall = 0;
      if (!seen) { seen = true; wallAt = wall; return clock; }
      if (wall - wallAt < 4) return clock;
      var dt = wall - wallAt;
      wallAt = wall;
      if (!(dt > 0)) dt = 0;
      if (dt > cap) dt = cap;
      clock += dt;
      return clock;
    };
  }

  root.SSDNSMapFx = {
    beforeEffect: beforeEffect, setBeforeEffect: setBeforeEffect, effectEvent: effectEvent, HOOK_TIMEOUT_MS: HOOK_TIMEOUT_MS,
    PREF_KEY: PREF_KEY, enabled: enabled, setEnabled: setEnabled,
    TIMING: TIMING, configure: configure, TYPES: TYPES,
    classify: classify, resultOf: resultOf, plan: plan, sanitize: sanitize, request: request,
    lookOf: lookOf, lookSelf: lookSelf, lookTime: lookTime, shakeOf: shakeOf,
    stickyLook: stickyLook, wrapLook: wrapLook, chunkColor: chunkColor, tileOf: tileOf, namedLook: namedLook,
    paint: paint, paintRider: paintRider, paintGuidePop: paintGuidePop, zoneLayer: zoneLayer, hailIdle: hailstormIdle,
    erodeToken: erodeToken, erodeFront: function (lt) { return Chunk1Fx.erodeFront(lt); },
    nudge: tokenNudge, retort: function (ctx, look, lt, g) { Chunk2Fx.retort(ctx, look, lt, g); },
    hash: hash, dirOf: dirOf,
    projectileLight: projectileLight,
    makeAnimClock: makeAnimClock
  };
  root.SSDNSMapFX = root.SSDNSMapFx; /* alias: both spellings work */
})(typeof window !== "undefined" ? window : globalThis);

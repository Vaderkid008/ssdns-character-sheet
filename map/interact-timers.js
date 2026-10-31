/* N87 Interact + Turn# timers / doors (sheet 0.3.175 / DMCC 0.2.188).
   Door Open / Lockpick / Peek and staged fuse / plunger / timer / instant.
   Registers on the N86 SSDNSAssets hooks (registerAction, onRound, onInteract).
   Door actions use the "door:" prefix so they do not steal a gate's "open". */
(function (root) {
  "use strict";

  var REACH_FT = 5;
  var BOOM_SFX = "magic/fireball_explosion_#4-1793418958878.mp3";
  var TIMER_ACTIONS = ["light-fuse", "push-plunger", "start-timer", "trigger", "defuse", "clear-timer"];
  var DOOR_ACTIONS = { open: 1, close: 1, lockpick: 1, peek: 1 };
  var bound = null;
  var applying = false;

  function num(v) {
    var n = Number(v);
    return isFinite(n) ? n : 0;
  }
  function round4(v) {
    return Math.round(num(v) * 10000) / 10000;
  }
  function clone(v) {
    try { return JSON.parse(JSON.stringify(v)); } catch (e) { return v; }
  }

  function isSecret(wall) {
    return !!(wall && (wall.secret || wall.hidden));
  }
  function wallRef(wall) {
    if (!wall) return null;
    return { x1: round4(wall.x1), y1: round4(wall.y1), x2: round4(wall.x2), y2: round4(wall.y2) };
  }
  function sameRef(a, b) {
    if (!a || !b) return false;
    var a1 = round4(a.x1), ay1 = round4(a.y1), a2 = round4(a.x2), ay2 = round4(a.y2);
    var b1 = round4(b.x1), by1 = round4(b.y1), b2 = round4(b.x2), by2 = round4(b.y2);
    var fore = Math.abs(a1 - b1) < 0.05 && Math.abs(ay1 - by1) < 0.05 && Math.abs(a2 - b2) < 0.05 && Math.abs(ay2 - by2) < 0.05;
    var back = Math.abs(a1 - b2) < 0.05 && Math.abs(ay1 - by2) < 0.05 && Math.abs(a2 - b1) < 0.05 && Math.abs(ay2 - by1) < 0.05;
    return fore || back;
  }
  function findWall(walls, ref) {
    var list = walls || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].door && sameRef(list[i], ref)) return list[i];
    }
    return null;
  }
  function nearestPoint(px, py, wall) {
    var x1 = num(wall.x1), y1 = num(wall.y1), x2 = num(wall.x2), y2 = num(wall.y2);
    var dx = x2 - x1, dy = y2 - y1;
    var len2 = dx * dx + dy * dy || 1;
    var t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2));
    return { x: x1 + t * dx, y: y1 + t * dy };
  }
  /* Chebyshev feet from a token footprint to the nearest point on a wall segment.
     A footprint that touches the segment is 0 ft. One square off is 5 ft. */
  function feetToWall(token, wall) {
    if (!token || !token.pos || !wall) return null;
    var size = Math.max(1, Math.floor(num(token.size)) || 1);
    var box = {
      x0: num(token.pos.x),
      y0: num(token.pos.y),
      x1: num(token.pos.x) + size,
      y1: num(token.pos.y) + size
    };
    var samples = 9;
    var best = Infinity;
    for (var i = 0; i < samples; i++) {
      var t = samples === 1 ? 0 : i / (samples - 1);
      var px = num(wall.x1) + (num(wall.x2) - num(wall.x1)) * t;
      var py = num(wall.y1) + (num(wall.y2) - num(wall.y1)) * t;
      var dx = 0, dy = 0;
      if (px < box.x0) dx = box.x0 - px;
      else if (px > box.x1) dx = px - box.x1;
      if (py < box.y0) dy = box.y0 - py;
      else if (py > box.y1) dy = py - box.y1;
      var gap = Math.max(dx, dy);
      if (gap < best) best = gap;
    }
    if (!isFinite(best)) return null;
    return Math.round(best * 5 * 1000) / 1000;
  }
  function nearestDoor(walls, gx, gy, maxDist) {
    var best = null, bestD = num(maxDist) || 0.45;
    (walls || []).forEach(function (wall) {
      if (!wall || !wall.door) return;
      var p = nearestPoint(gx, gy, wall);
      var d = Math.hypot(gx - p.x, gy - p.y);
      if (d <= bestD) { bestD = d; best = wall; }
    });
    return best;
  }
  function inReach(token, wall, dm, reachFt) {
    if (dm) return { ok: true, feet: feetToWall(token, wall) };
    var ft = feetToWall(token, wall);
    var cap = num(reachFt) || REACH_FT;
    return { ok: ft != null && ft <= cap + 0.001, feet: ft };
  }

  /* Ajar: sight passes like an open door. Movement stays blocked until open. */
  function peekRule(wall) {
    var open = !!(wall && wall.open);
    var ajar = !!(wall && wall.ajar) && !open;
    return { blocksMove: !open, blocksSight: !(open || ajar), ajar: ajar, open: open };
  }

  function doorLockBox(wall) {
    var dc = num(wall && wall.lockDc);
    return {
      name: "Door",
      boxType: "door",
      lock: {
        dc: dc > 0 ? dc : 0,
        unlocked: !(wall && wall.locked),
        method: ["tools"],
        jammed: false,
        jamOnFail: false
      },
      log: []
    };
  }
  function lockpick(wall, sheet, rng, forced) {
    var box = doorLockBox(wall);
    var Loot = root.SSDNSLoot;
    var res = Loot && Loot.resolve
      ? Loot.resolve(box, "lockpick-yes", sheet || {}, rng, forced || null)
      : standaloneLockpick(box, sheet, rng, forced);
    return {
      ok: res.ok !== false,
      success: !!res.success,
      nat: res.nat,
      total: res.total,
      dc: res.dc != null ? res.dc : (box.lock && box.lock.dc),
      locked: !res.success,
      trap: false,
      detail: (box.log && box.log.length) ? box.log[box.log.length - 1] : (res.reason || ""),
      log: box.log || []
    };
  }
  function standaloneLockpick(box, sheet, rng, forced) {
    forced = forced || {};
    sheet = sheet || {};
    var dc = box.lock.dc;
    if (!(dc > 0) || box.lock.unlocked) return { ok: true, success: true, box: box };
    var dex = 0, tools = 0;
    if (sheet.mods && isFinite(Number(sheet.mods.DEX))) dex = Number(sheet.mods.DEX);
    if (sheet.thievesTools) tools = num(sheet.prof);
    var nat = forced.nat != null ? Number(forced.nat) : (1 + Math.floor((typeof rng === "function" ? rng() : Math.random()) * 20));
    var total = forced.total != null ? Number(forced.total) : nat + dex + tools;
    var success = total >= dc;
    box.log.push("Lockpick — Dex + thieves' tools: " + nat + " vs DC " + dc + (success ? ". Unlocked." : ". Failed. Still locked."));
    if (success) box.lock.unlocked = true;
    return { ok: true, success: success, nat: nat, total: total, dc: dc, box: box };
  }

  function applyDoor(wall, action, ctx) {
    ctx = ctx || {};
    if (applying) return { ok: true, reentry: true };
    if (!wall || !wall.door) return { ok: false, reason: "Not a door" };
    if (isSecret(wall) && !ctx.dm) return { ok: false, reason: "hidden", silent: true };
    if (!ctx.ignoreReach) {
      var gate = inReach(ctx.token, wall, !!ctx.dm, ctx.reachFt);
      if (!gate.ok) return { ok: false, reason: "reach", feet: gate.feet, toast: reachToast(gate.feet) };
    }
    applying = true;
    var result;
    try {
      result = mutateDoor(wall, action, ctx);
    } finally {
      applying = false;
    }
    return result;
  }
  function mutateDoor(wall, action, ctx) {
    if (action === "open") {
      if (wall.locked) return { ok: false, reason: "Locked", toast: "Locked", wall: wall };
      wall.open = true;
      wall.ajar = false;
      return { ok: true, action: "open", wall: wall, log: "Door opened" };
    }
    if (action === "close") {
      wall.open = false;
      wall.ajar = false;
      return { ok: true, action: "close", wall: wall, log: "Door closed" };
    }
    if (action === "peek") {
      if (wall.open) return { ok: true, action: "peek", ajar: false, open: true, los: peekRule(wall), log: "Door is open" };
      wall.ajar = !wall.ajar;
      var rule = peekRule(wall);
      return { ok: true, action: "peek", ajar: !!wall.ajar, los: rule, log: wall.ajar ? "Door ajar" : "Door shut" };
    }
    if (action === "lockpick") {
      if (!wall.locked) return { ok: true, success: true, already: true, locked: false, log: "Door is not locked" };
      var rolled = lockpick(wall, ctx.sheet, ctx.rng, ctx.forced);
      if (ctx.forced && ctx.forced.total != null && wall.lockDc) {
        rolled.success = num(ctx.forced.total) >= num(wall.lockDc);
        rolled.total = num(ctx.forced.total);
      }
      if (rolled.success) wall.locked = false;
      rolled.locked = !!wall.locked;
      rolled.trap = false;
      rolled.wall = wall;
      rolled.logLine = rolled.success ? "Lockpick succeeds. Door unlocked." : "Lockpick fails. Door stays locked.";
      return rolled;
    }
    return { ok: false, reason: "No such action" };
  }
  function reachToast(feet) {
    var n = feet == null || !isFinite(Number(feet)) ? "?" : String(feet);
    return "Out of reach (" + n + " ft). Interact needs to be within 5 ft.";
  }
  function doorMenu(wall, ctx) {
    ctx = ctx || {};
    if (!wall || !wall.door) return { reach: false, actions: [], hidden: true };
    if (isSecret(wall) && !ctx.dm) return { reach: false, actions: [], hidden: true };
    var gate = inReach(ctx.token, wall, !!ctx.dm, ctx.reachFt);
    if (!gate.ok) return { reach: false, feet: gate.feet, actions: [], toast: reachToast(gate.feet) };
    var actions = [];
    actions.push(wall.open ? { id: "close", label: "Close" } : { id: "open", label: "Open" });
    if (wall.locked && !wall.open) actions.push({ id: "lockpick", label: "Lockpick" });
    if (!wall.open) actions.push({ id: "peek", label: wall.ajar ? "Shut peek" : "Peek" });
    return { reach: true, feet: gate.feet, actions: actions };
  }

  function ensureState(asset) {
    asset.state = asset.state || {};
    asset.props = asset.props || {};
    asset.props.timer = asset.props.timer || { mode: "", fuseRounds: 0 };
    return asset.state;
  }
  /* Turn#: the strip Round counter. The arming round does not count.
     A fuse of N fires when round === armedAtRound + N. */
  function arm(asset, opts) {
    opts = opts || {};
    asset = asset || {};
    var st = ensureState(asset);
    var mode = opts.mode || asset.props.timer.mode || "timer";
    var n = opts.fuseRounds != null ? num(opts.fuseRounds) : num(asset.props.timer.fuseRounds);
    var round = num(opts.round);
    var started = !!opts.started;
    asset.props.timer.mode = mode;
    asset.props.timer.fuseRounds = n;
    st.fired = false;
    st.firedRound = null;
    st.instant = mode === "instant" || mode === "plunger";
    if (st.instant) {
      st.waiting = false;
      st.pendingFuse = 0;
      st.armedAtRound = started ? round : null;
      st.firesAtRound = round;
      return { state: st, fireNow: true, waiting: false, log: (mode === "plunger" ? "Plunger pushed." : "Instant trigger.") };
    }
    if (!(n > 0)) n = 1;
    asset.props.timer.fuseRounds = n;
    if (!started) {
      st.waiting = true;
      st.pendingFuse = n;
      st.armedAtRound = null;
      st.firesAtRound = null;
      return { state: st, fireNow: false, waiting: true, log: "Waiting for initiative." };
    }
    st.waiting = false;
    st.pendingFuse = 0;
    st.armedAtRound = round;
    st.firesAtRound = round + n;
    return { state: st, fireNow: false, waiting: false, log: "Armed at round " + round + ". Fires at round " + st.firesAtRound + "." };
  }
  function beginCombat(asset, round) {
    var st = asset && asset.state;
    if (!st || !st.waiting) return st || null;
    var n = num(st.pendingFuse) || num(asset.props && asset.props.timer && asset.props.timer.fuseRounds) || 1;
    st.waiting = false;
    st.pendingFuse = 0;
    st.fired = false;
    st.armedAtRound = num(round);
    st.firesAtRound = num(round) + n;
    return st;
  }
  function due(asset, round) {
    var st = asset && asset.state;
    if (!st || st.fired) return false;
    if (st.firesAtRound == null || st.waiting) return false;
    return num(round) >= num(st.firesAtRound);
  }
  function consume(asset, round, force) {
    var st = ensureState(asset);
    if (st.fired) return null;
    if (!force && !due(asset, round)) return null;
    var at = st.firesAtRound;
    st.fired = true;
    st.firedRound = num(round);
    st.firesAtRound = null;
    st.armedAtRound = null;
    st.waiting = false;
    return { effects: asset.effects || [], firedAt: at, round: num(round) };
  }
  function defuse(asset) {
    var st = ensureState(asset);
    st.armedAtRound = null;
    st.firesAtRound = null;
    st.waiting = false;
    st.pendingFuse = 0;
    st.fired = false;
    st.firedRound = null;
    st.instant = false;
    return st;
  }
  function onCombatStart(round, list) {
    var tokens = list || (bound && bound.tokens && bound.tokens()) || [];
    var armed = [];
    tokens.forEach(function (token) {
      if (!token || !token.asset || !token.asset.state || !token.asset.state.waiting) return;
      beginCombat(token.asset, round);
      armed.push(token);
      if (!list && bound && bound.sync) bound.sync(token);
      if (!list && bound && bound.log) bound.log(tokenLabel(token) + " starts counting. Fires at round " + token.asset.state.firesAtRound + ".");
    });
    return armed;
  }

  function tokenLabel(token) {
    return (token && token.asset && token.asset.name) || (token && (token.name || token.label)) || "Asset";
  }
  function pointToBoxFeet(px, py, token) {
    var size = Math.max(1, num(token && token.size) || 1);
    var x0 = num(token.x != null ? token.x : (token.pos && token.pos.x));
    var y0 = num(token.y != null ? token.y : (token.pos && token.pos.y));
    var dx = 0, dy = 0;
    if (px < x0) dx = x0 - px;
    else if (px > x0 + size) dx = px - (x0 + size);
    if (py < y0) dy = y0 - py;
    else if (py > y0 + size) dy = py - (y0 + size);
    return Math.max(dx, dy) * 5;
  }
  function blastOrigin(token) {
    var size = Math.max(1, num(token && token.size) || 1);
    var x = token.pos ? num(token.pos.x) : num(token.x);
    var y = token.pos ? num(token.pos.y) : num(token.y);
    return { x: x + size / 2, y: y + size / 2 };
  }
  function targetsInRadius(tokens, origin, radiusFt, skipId) {
    var cap = num(radiusFt);
    var hits = [];
    (tokens || []).forEach(function (token) {
      if (!token || token.id === skipId) return;
      if (pointToBoxFeet(origin.x, origin.y, token) <= cap + 0.05) hits.push(token);
    });
    return hits;
  }
  function parseTarget(id) {
    if (!id) return null;
    if (typeof id === "object") return id;
    var text = String(id);
    var parts = text.split(",");
    if (parts.length === 4 && parts.every(function (p) { return isFinite(Number(p)); })) {
      return { x1: Number(parts[0]), y1: Number(parts[1]), x2: Number(parts[2]), y2: Number(parts[3]) };
    }
    return text;
  }
  function applyTarget(world, id, mode) {
    var ref = parseTarget(id);
    if (!ref) return null;
    if (typeof ref === "object" && ref.x1 != null) {
      var wall = findWall(world.walls || [], ref);
      if (!wall) return null;
      wall.locked = false;
      if (mode === "open") { wall.open = true; wall.ajar = false; }
      return { kind: "door", wall: wallRef(wall) };
    }
    var tokens = world.tokens || [];
    for (var i = 0; i < tokens.length; i++) {
      var token = tokens[i];
      if (!token || token.id !== ref) continue;
      token.asset = token.asset || { state: {} };
      token.asset.state = token.asset.state || {};
      if (mode === "unlock" || mode === "open") token.asset.state.locked = false;
      if (mode === "open") token.asset.state.open = true;
      return { kind: "asset", id: token.id };
    }
    return null;
  }
  function normalizeEffect(raw) {
    raw = raw || {};
    var type = String(raw.type || "").toLowerCase();
    if (!type) return null;
    var eff = { type: type };
    if (type === "explosion") {
      eff.radiusFt = num(raw.radiusFt);
      eff.damage = raw.damage == null ? 0 : raw.damage;
      eff.damageType = raw.damageType || "";
      eff.save = raw.save || "DEX";
      eff.dc = num(raw.dc);
      eff.halfOnSave = !!raw.halfOnSave;
    } else if (type === "unlock" || type === "open") {
      var targets = raw.targets || [];
      if (typeof targets === "string") targets = targets.split(/[\s,]+/).filter(Boolean).map(parseTarget);
      eff.targets = targets;
    } else if (type === "condition") {
      eff.condition = raw.condition || "";
      eff.radiusFt = num(raw.radiusFt);
    } else if (type === "sfx") {
      eff.ref = raw.ref || BOOM_SFX;
    }
    return eff;
  }
  function dispatch(effects, world, source) {
    world = world || {};
    var plan = { logs: [], unlocks: [], opens: [], explosions: [], conditions: [], sfx: [], clears: [] };
    (effects || []).forEach(function (raw) {
      var eff = normalizeEffect(raw);
      if (!eff) return;
      if (eff.type === "unlock" || eff.type === "open") {
        (eff.targets || []).forEach(function (id) {
          var hit = applyTarget(world, id, eff.type);
          if (!hit) return;
          if (eff.type === "unlock") plan.unlocks.push(hit);
          else plan.opens.push(hit);
          plan.logs.push((eff.type === "unlock" ? "Unlock " : "Open ") + (hit.id || "door"));
        });
      } else if (eff.type === "explosion") {
        var origin = source ? blastOrigin(source) : (world.origin || { x: 0, y: 0 });
        var targets = targetsInRadius(world.tokens || [], origin, eff.radiusFt, source && source.id);
        plan.explosions.push({ effect: eff, origin: origin, targets: targets });
        plan.logs.push("Explosion " + eff.radiusFt + " ft" + (eff.damage ? " · " + eff.damage + " " + (eff.damageType || "") : ""));
      } else if (eff.type === "condition") {
        var from = source ? blastOrigin(source) : (world.origin || { x: 0, y: 0 });
        var who = targetsInRadius(world.tokens || [], from, eff.radiusFt, source && source.id);
        plan.conditions.push({ effect: eff, targets: who });
        plan.logs.push("Condition " + (eff.condition || "") + (who.length ? " · " + who.map(function (t) { return t.name || t.id; }).join(", ") : ""));
      } else if (eff.type === "sfx") {
        plan.sfx.push(eff.ref || BOOM_SFX);
        plan.logs.push("SFX");
      } else if (eff.type === "clear") {
        if (source && source.asset) defuse(source.asset);
        plan.clears.push(true);
        plan.logs.push("Timer clear");
      }
    });
    return plan;
  }
  function onRound(round, list) {
    var tokens = list || (bound && bound.tokens && bound.tokens()) || [];
    var live = !list && !!bound;
    var fired = [];
    tokens.forEach(function (token) {
      if (!token || !token.asset) return;
      if (!due(token.asset, round)) return;
      var shot = consume(token.asset, round, false);
      if (!shot) return;
      var world = {
        tokens: tokens,
        walls: (bound && bound.walls && live) ? bound.walls() : (token._walls || [])
      };
      var plan = dispatch(shot.effects, world, token);
      var name = tokenLabel(token);
      plan.logs.unshift(name + " goes off (round " + num(round) + ").");
      fired.push({ token: token, plan: plan, shot: shot });
      if (!live || !bound) return;
      if (bound.sync) bound.sync(token);
      if (bound.saveScene && (plan.unlocks.length || plan.opens.length)) bound.saveScene();
      plan.logs.forEach(function (line) { if (bound.log) bound.log(line); });
      if (plan.explosions.length && bound.blast) plan.explosions.forEach(function (ex) { bound.blast(ex, token); });
      else if (bound.playSfx) plan.sfx.forEach(function (ref) { bound.playSfx(ref); });
    });
    return fired;
  }

  function handleAction(id, ctx) {
    ctx = ctx || {};
    var token = ctx.token;
    if (!token && bound && bound.tokenById) token = bound.tokenById(ctx.tokenId);
    if (!token) return { ok: false, reason: "no asset" };
    token.asset = token.asset || { state: {}, props: { timer: {} }, effects: [] };
    var round = ctx.round != null ? num(ctx.round) : (bound && bound.round ? num(bound.round()) : 1);
    var started = ctx.started != null ? !!ctx.started : (bound && bound.started ? !!bound.started() : false);
    if (!ctx.dm && bound && bound.feetBetween && bound.tokenById) {
      var actor = ctx.byToken || (ctx.by ? bound.tokenById(ctx.by) : null);
      if (actor) {
        var ft = bound.feetBetween(actor, token);
        if (ft != null && ft > REACH_FT) return { ok: false, handled: true, reason: "reach", feet: ft, toast: reachToast(ft) };
      }
    }
    if (id === "defuse" || id === "clear-timer") {
      defuse(token.asset);
      if (bound && bound.sync && !ctx.listOnly) bound.sync(token);
      return { ok: true, handled: true, action: id, log: "Defused " + tokenLabel(token) + "." };
    }
    if (id === "light-fuse" || id === "start-timer") {
      var mode = id === "light-fuse" ? "fuse" : "timer";
      var n = ctx.fuseRounds != null ? ctx.fuseRounds : (token.asset.props && token.asset.props.timer && token.asset.props.timer.fuseRounds);
      var armed = arm(token.asset, { round: round, started: started, mode: mode, fuseRounds: n });
      if (bound && bound.sync && !ctx.listOnly) bound.sync(token);
      return { ok: true, handled: true, action: id, waiting: armed.waiting, fireNow: false, state: token.asset.state, log: tokenLabel(token) + ": " + armed.log };
    }
    if (id === "push-plunger" || id === "trigger") {
      var which = id === "push-plunger" ? "plunger" : "instant";
      arm(token.asset, { round: round, started: started, mode: which, fuseRounds: 0 });
      var shot = consume(token.asset, round, true);
      var world = { tokens: bound && bound.tokens ? bound.tokens() : [token], walls: bound && bound.walls ? bound.walls() : [] };
      var plan = dispatch((token.asset && token.asset.effects) || [], world, token);
      plan.logs.unshift(tokenLabel(token) + (which === "plunger" ? " plunger" : " triggers") + ".");
      if (bound && !ctx.listOnly) {
        if (bound.sync) bound.sync(token);
        if (bound.saveScene && (plan.unlocks.length || plan.opens.length)) bound.saveScene();
        plan.logs.forEach(function (line) { if (bound.log) bound.log(line); });
        if (plan.explosions.length && bound.blast) plan.explosions.forEach(function (ex) { bound.blast(ex, token); });
        else if (bound.playSfx) {
          var cue = (token.asset.sfx && token.asset.sfx.interact) || "";
          if (cue) bound.playSfx(cue);
          plan.sfx.forEach(function (ref) { bound.playSfx(ref); });
        }
      }
      return { ok: true, handled: true, action: id, plan: plan, log: plan.logs[0] };
    }
    return { ok: false, handled: true, reason: "No such action" };
  }

  function chipText(token, round, viewer) {
    if (!token) return "";
    var asset = token.asset;
    if (!asset) return "";
    var hidden = !!(token.hidden || asset.hiddenFromPlayers);
    if (viewer !== "dm" && hidden) return "";
    var st = asset.state || {};
    if (viewer !== "dm" && !st.countdownVisible && asset.turnsLeft == null && !asset.waiting) return "";
    if (viewer !== "dm") {
      if (asset.waiting || st.waiting) return st.countdownVisible || asset.waiting ? "Wait" : "";
      if (!st.countdownVisible && asset.turnsLeft == null) return "";
      if (st.firesAtRound == null && asset.turnsLeft != null) return String(asset.turnsLeft);
      if (!st.countdownVisible) return "";
    }
    if (st.waiting || asset.waiting) return "Wait";
    if (st.firesAtRound == null) return "";
    return String(Math.max(0, num(st.firesAtRound) - num(round)));
  }

  function publicAsset(token, opts) {
    if (!token || token.hidden) return null;
    var asset = token.asset;
    if (!asset || asset.hiddenFromPlayers) return null;
    opts = opts || {};
    var st = asset.state || {};
    var pub = {
      name: asset.name || token.name || "",
      size: token.size || asset.size || 1,
      image: token.image || asset.image || "",
      on: !!st.on,
      open: !!st.open
    };
    var actions = (asset.interact && asset.interact.actions) || asset.actions;
    if (Array.isArray(actions)) {
      pub.actions = actions.map(function (a) { return typeof a === "string" ? a : (a && (a.label || a.id)) || ""; }).filter(Boolean);
    }
    var max = num(asset.hpMax || (asset.props && asset.props.health && asset.props.health.max));
    if (max > 0 && st.hp != null && isFinite(Number(st.hp))) {
      pub.hpPct = Math.max(0, Math.min(100, Math.round(num(st.hp) / max * 100)));
    }
    if (st.countdownVisible && st.waiting) pub.waiting = true;
    else if (st.countdownVisible && st.firesAtRound != null && opts.round != null) {
      pub.turnsLeft = Math.max(0, num(st.firesAtRound) - num(opts.round));
    }
    return pub;
  }

  function assetMenu(token, ctx) {
    ctx = ctx || {};
    var timer = token && token.asset && token.asset.props && token.asset.props.timer;
    var mode = timer && timer.mode;
    if (!mode) return { actions: [] };
    if (!ctx.dm && ctx.feet != null && ctx.feet > REACH_FT) {
      return { reach: false, feet: ctx.feet, actions: [], toast: reachToast(ctx.feet) };
    }
    var actions = [];
    var st = (token.asset && token.asset.state) || {};
    if (mode === "fuse") actions.push({ id: "light-fuse", label: "Light fuse" });
    else if (mode === "timer") actions.push({ id: "start-timer", label: "Start timer" });
    else if (mode === "plunger") actions.push({ id: "push-plunger", label: "Push plunger" });
    else if (mode === "instant") actions.push({ id: "trigger", label: "Trigger" });
    if (st.firesAtRound != null || st.waiting) actions.push({ id: "defuse", label: "Defuse" });
    return { actions: actions, reach: true };
  }

  function effectRowHtml() {
    return '<div class="ssm-bomb-fx" data-act="bombFx">' +
      '<select data-fx="type" aria-label="Effect">' +
      '<option value="explosion">Explosion</option>' +
      '<option value="unlock">Unlock</option>' +
      '<option value="open">Open</option>' +
      '<option value="condition">Condition</option>' +
      '<option value="sfx">SFX</option>' +
      '<option value="clear">Clear timer</option>' +
      '</select>' +
      '<input data-fx="radiusFt" type="number" min="0" placeholder="radius ft" aria-label="Radius feet">' +
      '<input data-fx="damage" placeholder="damage" aria-label="Damage">' +
      '<input data-fx="damageType" placeholder="type" aria-label="Damage type">' +
      '<input data-fx="save" placeholder="DEX" aria-label="Save">' +
      '<input data-fx="dc" type="number" min="0" placeholder="DC" aria-label="DC">' +
      '<label><input data-fx="half" type="checkbox"> Half on save</label>' +
      '<input data-fx="targets" placeholder="targets" aria-label="Targets">' +
      '<input data-fx="condition" placeholder="condition" aria-label="Condition">' +
      '<input data-fx="ref" placeholder="sfx ref" aria-label="SFX ref">' +
      '</div>';
  }
  function bombPanelHtml(token) {
    if (!token) return "";
    var asset = token.asset || {};
    var timer = (asset.props && asset.props.timer) || {};
    var st = asset.state || {};
    var mode = timer.mode || "fuse";
    var n = timer.fuseRounds || 1;
    function opt(id, label) {
      return '<option value="' + id + '"' + (mode === id ? " selected" : "") + ">" + label + "</option>";
    }
    var status = "";
    if (st.waiting) status = "Waiting for initiative";
    else if (st.firesAtRound != null) status = "Fires at round " + st.firesAtRound;
    return '<div class="ssm-section">Bomb / timer</div>' +
      '<div data-act="bombPanel">' +
      '<label class="ssm-act">Mode <select data-act="bombMode" aria-label="Timer mode">' +
      opt("fuse", "Fuse") + opt("timer", "Timer") + opt("plunger", "Plunger") + opt("instant", "Instant") +
      "</select></label>" +
      '<label class="ssm-act">N turns <input data-act="bombN" type="number" min="0" step="1" value="' + num(n) + '" aria-label="Fuse rounds"></label>' +
      '<label class="ssm-act"><input data-act="bombShow" type="checkbox"' + (st.countdownVisible ? " checked" : "") + "> Players see countdown</label>" +
      '<div data-act="bombEffects">' + effectRowHtml() + "</div>" +
      '<div class="ssm-row"><button type="button" data-act="bombAddFx">Add effect</button>' +
      '<button type="button" data-act="bombArm">Arm</button>' +
      '<button type="button" data-act="bombDefuse">Defuse</button>' +
      '<button type="button" data-act="bombNow">Trigger now</button></div>' +
      (status ? '<p data-act="bombStatus">' + status + "</p>" : '<p data-act="bombStatus"></p>') +
      "</div>";
  }

  function installHooks() {
    var Assets = root.SSDNSAssets;
    if (!(Assets && typeof Assets.registerAction === "function")) return false;
    TIMER_ACTIONS.forEach(function (id) {
      Assets.registerAction(id, function (tokenId, action, by) {
        var dm = bound && bound.isDm ? !!bound.isDm(by) : false;
        var res = handleAction(action || id, { tokenId: tokenId, by: by, dm: dm });
        if (res) res.handled = true;
        if (res && res.log && bound && bound.log && id !== "push-plunger" && id !== "trigger") bound.log(res.log);
        return res;
      });
    });
    Object.keys(DOOR_ACTIONS).forEach(function (id) {
      Assets.registerAction("door:" + id, function (tokenId, action, by) {
        if (bound && bound.performDoor) return bound.performDoor(tokenId, action || id, by);
        return { ok: false, handled: true, reason: "map not attached" };
      });
    });
    if (!Assets.__n87Round) {
      var prevRound = Assets.onRound;
      Assets.onRound = function (round) {
        var note = null;
        try { if (typeof prevRound === "function") note = prevRound.call(Assets, round); } catch (e) {}
        var fired = onRound(round);
        return note && note.due ? note : { note: note, fired: fired };
      };
      Assets.__n87Round = true;
    }
    var Lib = root.SSDNSAssetLibrary;
    if (Lib && typeof Lib.publicAsset === "function" && !Lib.__n87Pub) {
      var prevPub = Lib.publicAsset;
      Lib.publicAsset = function (token) {
        var pub = prevPub(token);
        if (!pub || !token || !token.asset) return pub;
        var extra = publicAsset(token, { round: bound && bound.round ? bound.round() : null });
        if (!extra) return null;
        if (extra.waiting) pub.waiting = true;
        if (extra.turnsLeft != null) pub.turnsLeft = extra.turnsLeft;
        delete pub.firesAtRound;
        delete pub.armedAtRound;
        delete pub.effects;
        delete pub.notes;
        delete pub.immunities;
        return pub;
      };
      Lib.__n87Pub = true;
    }
    return true;
  }

  function attach(host) {
    bound = host || null;
    installHooks();
  }

  root.SSDNSInteract = {
    REACH_FT: REACH_FT,
    BOOM_SFX: BOOM_SFX,
    TIMER_ACTIONS: TIMER_ACTIONS.slice(),
    isSecret: isSecret,
    wallRef: wallRef,
    sameRef: sameRef,
    findWall: findWall,
    feetToWall: feetToWall,
    nearestDoor: nearestDoor,
    inReach: inReach,
    peekRule: peekRule,
    doorLockBox: doorLockBox,
    lockpick: lockpick,
    applyDoor: applyDoor,
    doorMenu: doorMenu,
    reachToast: reachToast,
    arm: arm,
    beginCombat: beginCombat,
    due: due,
    consume: consume,
    defuse: defuse,
    onCombatStart: onCombatStart,
    onRound: onRound,
    dispatch: dispatch,
    normalizeEffect: normalizeEffect,
    handleAction: handleAction,
    chipText: chipText,
    publicAsset: publicAsset,
    assetMenu: assetMenu,
    bombPanelHtml: bombPanelHtml,
    effectRowHtml: effectRowHtml,
    installHooks: installHooks,
    attach: attach,
    pendingN86: function () { return !(root.SSDNSAssets && typeof root.SSDNSAssets.registerAction === "function" && root.SSDNSAssets.__n87Round); }
  };
  installHooks();
})(typeof window !== "undefined" ? window : globalThis);

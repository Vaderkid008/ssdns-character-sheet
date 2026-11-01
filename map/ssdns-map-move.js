/**
 * BG3-style map movement (sheet 0.3.131 / DMCC 0.2.144). One module for the player sheet Map and the DMCC Map.
 *
 * Chebyshev: every square costs 5 ft, including diagonals (not 5e 5/10).
 * Allies can be walked through. A square that is occupied (ally or enemy) is not a legal end.
 * Enemies block the square. Walls block a step when the map already has wall segments (ctx.crosses).
 * No wall data means the step is open. This file does not invent a new collision format.
 *
 * Extension points (keep these stable for later patches):
 *   terrainCost(square, ctx)  default 1. Difficult terrain later returns 2 (2× feet) without a path rewrite.
 *   isBlocked(x, y, ctx)      out of bounds, or ctx.isBlocked / ctx.wallCells when a map marks squares.
 *   canEndOn(x, y, ctx)       false when the mover's footprint would overlap any token.
 *   leaveReachCue(path, ctx)  true when a step leaves hostile melee reach. Disengage, teleport, and forced moves skip it.
 *   leaveReachPlan(path, ctx) the pause points. Footprint Chebyshev, same gap as N64 feetBetween.
 *   previewSlot(state, dest)  desktop mode "click" commits immediately.
 *     Mobile two-tap is NOT in this PR (own patch before alpha). Set state.mode = "confirm":
 *     the first tap stores state.pending, the same square again commits. Do not rewrite computeReach / computePath.
 *   ctx.moverSize             footprint in squares (1–4). Speed mods stay in the caller's budget feet.
 */
(function (root) {
  "use strict";
  var FEET = 5;
  var DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

  function num(v, d) {
    var n = Number(v);
    return isFinite(n) ? n : d;
  }
  function key(x, y) { return x + "," + y; }
  function squares(size) {
    var n = Math.floor(num(size, 1));
    return n >= 1 && n <= 4 ? n : 1;
  }
  function cells(x, y, size) {
    var s = squares(size);
    var out = [];
    var yy, xx;
    for (yy = 0; yy < s; yy++) for (xx = 0; xx < s; xx++) out.push({ x: x + xx, y: y + yy });
    return out;
  }
  function terrainCost(square, ctx) {
    if (ctx && typeof ctx.terrainCost === "function") {
      var n = num(ctx.terrainCost(square), 1);
      if (n > 0) return n;
    }
    return 1;
  }
  function inBounds(x, y, grid) {
    if (!grid) return true;
    return x >= 0 && y >= 0 && x < num(grid.cols, 0) && y < num(grid.rows, 0);
  }
  function isBlocked(x, y, ctx) {
    ctx = ctx || {};
    if (ctx.grid && !inBounds(x, y, ctx.grid)) return true;
    if (typeof ctx.isBlocked === "function" && ctx.isBlocked(x, y)) return true;
    if (ctx.wallCells && typeof ctx.wallCells.has === "function" && ctx.wallCells.has(key(x, y))) return true;
    return false;
  }
  function occupants(ctx) { return (ctx && ctx.occupants) || []; }
  function occupiedAt(x, y, ctx) {
    var list = occupants(ctx);
    var ignore = (ctx && ctx.ignoreId) || "";
    var i, t, s, tx, ty;
    for (i = 0; i < list.length; i++) {
      t = list[i];
      if (!t || t.id === ignore) continue;
      s = squares(t.size);
      tx = t.x != null ? t.x : (t.pos && t.pos.x);
      ty = t.y != null ? t.y : (t.pos && t.pos.y);
      if (x >= tx && x < tx + s && y >= ty && y < ty + s) return t;
    }
    return null;
  }
  function footprintBlocked(x, y, ctx) {
    var spot = cells(x, y, ctx && ctx.moverSize);
    var i;
    for (i = 0; i < spot.length; i++) if (isBlocked(spot[i].x, spot[i].y, ctx)) return true;
    return false;
  }
  function footprintOccupant(x, y, ctx) {
    var spot = cells(x, y, ctx && ctx.moverSize);
    var i, occ;
    for (i = 0; i < spot.length; i++) {
      occ = occupiedAt(spot[i].x, spot[i].y, ctx);
      if (occ) return occ;
    }
    return null;
  }
  /**
   * Segment a→b crosses wall segment w.
   * A hit at the start (t < 1e-6, mover's side) is not a crossing: a token whose
   * centre already sits on the wall can step off. Open doors are not walls.
   * Wall fields stay {x1,y1,x2,y2,open}. This does not add a collision format.
   */
  function segmentBlocks(x1, y1, x2, y2, wall) {
    if (!wall || wall.open) return false;
    var d = (x2 - x1) * (wall.y2 - wall.y1) - (y2 - y1) * (wall.x2 - wall.x1);
    if (Math.abs(d) < 0.0001) return false;
    var t = ((wall.x1 - x1) * (wall.y2 - wall.y1) - (wall.y1 - y1) * (wall.x2 - wall.x1)) / d;
    var u = ((wall.x1 - x1) * (y2 - y1) - (wall.y1 - y1) * (x2 - x1)) / d;
    return t >= 1e-6 && t <= 1 && u >= 0 && u <= 1;
  }
  /**
   * Edges a footprint actually crosses when its top-left steps from → to.
   * Probes the middle of each leading edge, so a wall that only shares a
   * corner (common for a 2×2, whose centre sits on a grid point) does not
   * block an empty square. Size 1 keeps the centre ray in stepBlocked.
   */
  function leadingEdges(from, to, size) {
    var dx = to.x - from.x;
    var dy = to.y - from.y;
    var edges = [];
    var i, line;
    if (dx > 0) {
      line = from.x + size;
      for (i = 0; i < size; i++) edges.push({ mx: line, my: to.y + i + 0.5, nx: -1, ny: 0 });
    } else if (dx < 0) {
      line = from.x;
      for (i = 0; i < size; i++) edges.push({ mx: line, my: to.y + i + 0.5, nx: 1, ny: 0 });
    }
    if (dy > 0) {
      line = from.y + size;
      for (i = 0; i < size; i++) edges.push({ mx: to.x + i + 0.5, my: line, nx: 0, ny: -1 });
    } else if (dy < 0) {
      line = from.y;
      for (i = 0; i < size; i++) edges.push({ mx: to.x + i + 0.5, my: line, nx: 0, ny: 1 });
    }
    return edges;
  }
  function footprintCrosses(from, to, size, crosses) {
    if (!from || !to || typeof crosses !== "function") return false;
    if (from.x === to.x && from.y === to.y) return false;
    var s = squares(size);
    var edges = leadingEdges(from, to, s);
    var i, e, span = 0.25;
    for (i = 0; i < edges.length; i++) {
      e = edges[i];
      if (crosses(
        { x: e.mx + e.nx * span, y: e.my + e.ny * span },
        { x: e.mx - e.nx * span, y: e.my - e.ny * span }
      )) return true;
    }
    return false;
  }
  /**
   * A Large (or bigger) body cannot finish on a footprint a wall cuts through.
   * Probes each internal grid edge. A wall that only touches an outer corner
   * misses these midpoints, so an empty diagonal step stays open.
   */
  function stanceBlocked(x, y, size, crosses) {
    if (typeof crosses !== "function") return false;
    var s = squares(size);
    if (s <= 1) return false;
    var k, i, span = 0.25, mx, my;
    for (k = 1; k < s; k++) {
      for (i = 0; i < s; i++) {
        mx = x + k;
        my = y + i + 0.5;
        if (crosses({ x: mx - span, y: my }, { x: mx + span, y: my })) return true;
        mx = x + i + 0.5;
        my = y + k;
        if (crosses({ x: mx, y: my - span }, { x: mx, y: my + span })) return true;
      }
    }
    return false;
  }
  function slideBlocked(from, to, size, crosses) {
    if (!from || !to || typeof crosses !== "function") return false;
    var s = squares(size);
    var x = from.x, y = from.y, guard = 0, sx, sy, nx, ny;
    while ((x !== to.x || y !== to.y) && guard++ < 80) {
      sx = to.x === x ? 0 : (to.x > x ? 1 : -1);
      sy = to.y === y ? 0 : (to.y > y ? 1 : -1);
      nx = x + sx;
      ny = y + sy;
      if (s > 1) {
        if (stanceBlocked(nx, ny, s, crosses)) return true;
        if (footprintCrosses({ x: x, y: y }, { x: nx, y: ny }, s, crosses)) return true;
      } else if (crosses({ x: x + 0.5, y: y + 0.5 }, { x: nx + 0.5, y: ny + 0.5 })) return true;
      x = nx;
      y = ny;
    }
    return false;
  }
  function stepBlocked(from, to, ctx) {
    if (footprintBlocked(to.x, to.y, ctx)) return true;
    if (ctx && typeof ctx.crosses === "function") {
      var size = squares(ctx.moverSize);
      if (size > 1) {
        if (stanceBlocked(to.x, to.y, size, ctx.crosses)) return true;
        if (footprintCrosses(from, to, size, ctx.crosses)) return true;
      } else {
        var ax = from.x + size / 2, ay = from.y + size / 2;
        var bx = to.x + size / 2, by = to.y + size / 2;
        if (ctx.crosses({ x: ax, y: ay }, { x: bx, y: by })) return true;
      }
    }
    var occ = footprintOccupant(to.x, to.y, ctx);
    if (!occ) return false;
    /* Allies are passable. Enemies and anyone else occupy the square. */
    return !occ.ally;
  }
  function canEndOn(x, y, ctx) {
    if (ctx && typeof ctx.canEndOn === "function") return !!ctx.canEndOn(x, y);
    if (footprintBlocked(x, y, ctx)) return false;
    return !footprintOccupant(x, y, ctx);
  }
  function computeReach(origin, budgetFeet, ctx) {
    ctx = ctx || {};
    var ox = origin.x, oy = origin.y;
    var maxFeet = Math.max(0, num(budgetFeet, 0));
    var reach = new Map();
    reach.set(key(ox, oy), { x: ox, y: oy, costFt: 0 });
    var q = [{ x: ox, y: oy, cost: 0 }];
    var guard = 0;
    var limit = ((ctx.grid && ctx.grid.cols && ctx.grid.rows) ? ctx.grid.cols * ctx.grid.rows : 800) * 8;
    var bi, i, cur, d, nx, ny, mult, nc, nk, prev, known;
    while (q.length && guard++ < limit) {
      bi = 0;
      for (i = 1; i < q.length; i++) if (q[i].cost < q[bi].cost) bi = i;
      cur = q.splice(bi, 1)[0];
      known = reach.get(key(cur.x, cur.y));
      if (known && known.costFt < cur.cost) continue;
      for (d = 0; d < DIRS.length; d++) {
        nx = cur.x + DIRS[d][0];
        ny = cur.y + DIRS[d][1];
        if (stepBlocked(cur, { x: nx, y: ny }, ctx)) continue;
        mult = terrainCost({ x: nx, y: ny }, ctx);
        nc = cur.cost + FEET * mult;
        if (nc > maxFeet + 0.001) continue;
        nk = key(nx, ny);
        prev = reach.get(nk);
        if (prev && prev.costFt <= nc) continue;
        reach.set(nk, { x: nx, y: ny, costFt: nc });
        q.push({ x: nx, y: ny, cost: nc });
      }
    }
    return reach;
  }
  function computePath(origin, dest, budgetFeet, ctx) {
    if (!origin || !dest) return null;
    ctx = ctx || {};
    var reach = ctx.reach || computeReach(origin, budgetFeet, ctx);
    var node = reach.get(key(dest.x, dest.y));
    if (!node || node.costFt <= 0 && (dest.x !== origin.x || dest.y !== origin.y)) return null;
    if (dest.x === origin.x && dest.y === origin.y) return { path: [{ x: origin.x, y: origin.y }], costFt: 0, reach: reach };
    if (!canEndOn(dest.x, dest.y, ctx)) return null;
    var path = [{ x: dest.x, y: dest.y }];
    var cx = dest.x, cy = dest.y, guard = 0, best, bestC, d, nx, ny, step;
    while ((cx !== origin.x || cy !== origin.y) && guard++ < 800) {
      best = null;
      bestC = reach.get(key(cx, cy)).costFt;
      for (d = 0; d < DIRS.length; d++) {
        nx = cx + DIRS[d][0];
        ny = cy + DIRS[d][1];
        step = reach.get(key(nx, ny));
        if (!step || step.costFt >= bestC) continue;
        bestC = step.costFt;
        best = step;
      }
      if (!best) return null;
      path.push({ x: best.x, y: best.y });
      cx = best.x;
      cy = best.y;
    }
    if (cx !== origin.x || cy !== origin.y) return null;
    path.reverse();
    return { path: path, costFt: node.costFt, reach: reach };
  }
  function chebyshev(ax, ay, bx, by) {
    return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
  }
  /** Squares between two footprints on one axis. 0 when the spans overlap or touch. Same rule as N64 axisGap. */
  function axisGap(origin, span, other, otherSpan) {
    var a0 = num(origin, 0);
    var b0 = num(other, 0);
    var a1 = a0 + squares(span) - 1;
    var b1 = b0 + squares(otherSpan) - 1;
    if (a1 < b0) return b0 - a1;
    if (b1 < a0) return a0 - b1;
    return 0;
  }
  function boxOf(ent, sizeOverride) {
    var x = ent && ent.x != null ? ent.x : (ent && ent.pos && ent.pos.x);
    var y = ent && ent.y != null ? ent.y : (ent && ent.pos && ent.pos.y);
    var size = sizeOverride != null ? sizeOverride : (ent && ent.size);
    return { x: num(x, 0), y: num(y, 0), size: squares(size) };
  }
  /** N64 feet: Chebyshev between the nearest squares of each footprint, times 5. Overlap is 0. */
  function feetBetweenBoxes(a, b) {
    var A = boxOf(a);
    var B = boxOf(b);
    return Math.max(axisGap(A.x, A.size, B.x, B.size), axisGap(A.y, A.size, B.y, B.size)) * FEET;
  }
  function reachFeet(enemy) {
    var raw = enemy && (enemy.reachFt != null ? enemy.reachFt : enemy.reach);
    var n = num(raw, 5);
    return n > 0 ? n : 5;
  }
  function inMeleeBoxes(mover, enemy) {
    return feetBetweenBoxes(mover, enemy) <= reachFeet(enemy);
  }
  /** N69: unconscious, dead, defeated, dying, or 0 HP. No HP pool is not down from the number alone. */
  function reactorIneligible(enemy) {
    if (!enemy) return false;
    if (enemy.reactorDown === true || enemy.unconscious === true || enemy.dead === true || enemy.defeated === true || enemy.down === true) return true;
    var status = String(enemy.status || "");
    if (/^(down|dead|unconscious|dying|defeated)$/i.test(status)) return true;
    var conds = enemy.conditions || [];
    var i, raw, name;
    for (i = 0; i < conds.length; i++) {
      raw = conds[i];
      name = raw && typeof raw === "object" ? (raw.name || raw.label || "") : raw;
      if (/\b(?:unconscious|dead|dying|defeated)\b/i.test(String(name || ""))) return true;
    }
    if (enemy.noHpPool || enemy.noHp) return false;
    var hp = enemy.hp;
    if (hp && typeof hp === "object") hp = hp.cur != null ? hp.cur : (hp.current != null ? hp.current : null);
    if (hp != null && hp !== "" && isFinite(Number(hp)) && Number(hp) <= 0) return true;
    return false;
  }
  /**
   * Steps that leave a hostile's melee reach. index is the path square that would leave.
   * Pause before committing that square. Disengage, teleport, and forced movement do not provoke.
   */
  function leaveReachPlan(path, ctx) {
    ctx = ctx || {};
    if (ctx.disengage || ctx.teleport || ctx.forced) return { pauses: [] };
    var enemies = ctx.enemies || [];
    if (!path || path.length < 2 || !enemies.length) return { pauses: [] };
    var size = squares(ctx.moverSize);
    var pauses = [];
    var i, e, before, after, who, foe;
    for (i = 1; i < path.length; i++) {
      who = [];
      before = { x: path[i - 1].x, y: path[i - 1].y, size: size };
      after = { x: path[i].x, y: path[i].y, size: size };
      for (e = 0; e < enemies.length; e++) {
        foe = enemies[e];
        if (!foe || foe.ally || reactorIneligible(foe)) continue;
        if (inMeleeBoxes(before, foe) && !inMeleeBoxes(after, foe)) who.push(foe);
      }
      if (who.length) pauses.push({ index: i, reactors: who });
    }
    return { pauses: pauses };
  }
  /** True when any step of the path leaves melee reach. The map pauses on leaveReachPlan, not on a toast. */
  function leaveReachCue(path, ctx) {
    var plan = leaveReachPlan(path, ctx);
    var first = plan.pauses[0];
    if (!first || !first.reactors.length) return { left: false };
    var foe = first.reactors[0];
    return { left: true, name: foe.name || foe.label || "an enemy", at: first.index };
  }
  /**
   * Tap-preview slot for the pre-alpha mobile patch.
   * mode "click" (desktop, this PR): commit is true.
   * mode "confirm" (later): first tap only fills pending; the same square again commits.
   */
  /**
   * Grid step away from a point. Snaps to the stronger axis inside about 25 degrees
   * so a nearly-east shove does not also step north.
   */
  function pushStep(dx, dy) {
    var ax = Math.abs(num(dx, 0));
    var ay = Math.abs(num(dy, 0));
    if (ax < 1e-6 && ay < 1e-6) return { x: 0, y: 0 };
    var sx = dx > 0 ? 1 : (dx < 0 ? -1 : 0);
    var sy = dy > 0 ? 1 : (dy < 0 ? -1 : 0);
    if (ax > 0 && ay / ax < 0.45) sy = 0;
    else if (ay > 0 && ax / ay < 0.45) sx = 0;
    return { x: sx, y: sy };
  }
  /**
   * Forced movement. `count` Chebyshev steps of `step` ({x,y} each -1, 0, or 1).
   * Stops on the last square that stays inside the grid and does not cross a wall.
   * Creatures do not stop the slide. Opportunity attacks are not this function's job:
   * leaveReachPlan already skips ctx.forced, and the map shove never asks for one.
   * Thunderwave / Porch Boom walks 2 squares (10 ft) away from the caster on a failed save.
   * Same walker later: Thunderous Smite 10, Repelling Blast 10, Mule Kick 20.
   */
  function forcedDest(origin, step, count, size, crosses, grid) {
    var x = num(origin && origin.x, 0);
    var y = num(origin && origin.y, 0);
    var sx = step && step.x > 0 ? 1 : (step && step.x < 0 ? -1 : 0);
    var sy = step && step.y > 0 ? 1 : (step && step.y < 0 ? -1 : 0);
    var n = Math.max(0, Math.round(num(count, 0)));
    var s = squares(size);
    var walked = 0;
    var i, nx, ny;
    if (!sx && !sy) return { x: x, y: y, squares: 0 };
    for (i = 0; i < n; i++) {
      nx = x + sx;
      ny = y + sy;
      if (grid) {
        if (nx < 0 || ny < 0) break;
        if (nx + s > num(grid.cols, 0) || ny + s > num(grid.rows, 0)) break;
      }
      if (typeof crosses === "function" && slideBlocked({ x: x, y: y }, { x: nx, y: ny }, s, crosses)) break;
      x = nx;
      y = ny;
      walked += 1;
    }
    return { x: x, y: y, squares: walked };
  }
  function previewSlot(state, dest, built) {
    state = state || { mode: "click", pending: null };
    if (!built) return { commit: false, pending: null, preview: null };
    if (state.mode !== "confirm") return { commit: true, pending: null, preview: built };
    var p = state.pending;
    if (p && p.x === dest.x && p.y === dest.y) return { commit: true, pending: null, preview: built };
    return {
      commit: false,
      pending: { x: dest.x, y: dest.y, path: built.path, costFt: built.costFt },
      preview: built
    };
  }

  root.SSDNSMapMove = {
    FEET: FEET,
    terrainCost: terrainCost,
    isBlocked: isBlocked,
    canEndOn: canEndOn,
    occupiedAt: occupiedAt,
    computeReach: computeReach,
    computePath: computePath,
    footprintCrosses: footprintCrosses,
    stanceBlocked: stanceBlocked,
    slideBlocked: slideBlocked,
    pushStep: pushStep,
    forcedDest: forcedDest,
    axisGap: axisGap,
    feetBetweenBoxes: feetBetweenBoxes,
    leaveReachPlan: leaveReachPlan,
    leaveReachCue: leaveReachCue,
    reactorIneligible: reactorIneligible,
    previewSlot: previewSlot,
    chebyshev: chebyshev,
    segmentBlocks: segmentBlocks
  };
})(typeof window !== "undefined" ? window : globalThis);

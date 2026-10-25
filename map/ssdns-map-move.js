/**
 * BG3-style map movement (sheet 0.3.127 / DMCC 0.2.140). One module for the player sheet Map and the DMCC Map.
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
 *   leaveReachCue(path, ctx)  soft cue only. Opportunity attacks stay on the DM-approve path. Disengage skips the cue.
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
  function stepBlocked(from, to, ctx) {
    if (footprintBlocked(to.x, to.y, ctx)) return true;
    if (ctx && typeof ctx.crosses === "function") {
      var size = squares(ctx.moverSize);
      var ax = from.x + size / 2, ay = from.y + size / 2;
      var bx = to.x + size / 2, by = to.y + size / 2;
      if (ctx.crosses({ x: ax, y: ay }, { x: bx, y: by })) return true;
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
  function inMelee(enemy, px, py) {
    var s = squares(enemy.size);
    var ex = enemy.x != null ? enemy.x : enemy.pos.x;
    var ey = enemy.y != null ? enemy.y : enemy.pos.y;
    var best = Infinity;
    var x, y, d;
    for (y = ey; y < ey + s; y++) {
      for (x = ex; x < ex + s; x++) {
        d = chebyshev(x, y, px, py);
        if (d < best) best = d;
      }
    }
    var reach = num(enemy.reachFt != null ? enemy.reachFt : enemy.reach, 5);
    return best > 0 && best * FEET <= reach;
  }
  /** Soft cue when the path steps out of an enemy's melee reach. No attack is rolled here. */
  function leaveReachCue(path, ctx) {
    ctx = ctx || {};
    if (ctx.disengage) return { left: false };
    var enemies = ctx.enemies || [];
    if (!path || path.length < 2 || !enemies.length) return { left: false };
    var i, e, s, t;
    for (i = 0; i < enemies.length; i++) {
      e = enemies[i];
      for (s = 0; s < path.length; s++) {
        if (!inMelee(e, path[s].x, path[s].y)) continue;
        for (t = s + 1; t < path.length; t++) {
          if (!inMelee(e, path[t].x, path[t].y)) {
            return { left: true, name: e.name || e.label || "an enemy" };
          }
        }
      }
    }
    return { left: false };
  }
  /**
   * Tap-preview slot for the pre-alpha mobile patch.
   * mode "click" (desktop, this PR): commit is true.
   * mode "confirm" (later): first tap only fills pending; the same square again commits.
   */
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
    leaveReachCue: leaveReachCue,
    previewSlot: previewSlot,
    chebyshev: chebyshev,
    segmentBlocks: segmentBlocks
  };
})(typeof window !== "undefined" ? window : globalThis);

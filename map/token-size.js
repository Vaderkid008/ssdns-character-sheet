/* Token size by creature size (Jessey 2026-10-20 3:42 PM CT).
   Tiny / Small / Medium = 1 square (the map's grid is whole squares), Large 2x2, Huge 3x3, Gargantuan 4x4.
   A token's footprint is pos.x..pos.x+size, pos.y..pos.y+size (top-left anchored, in squares).
   Its name label + DM HP bar sit in the row under the footprint, centred, and can be wider than it.
   Pure helpers: no DOM, no state. ssdns-map.js uses them for placement, dragging and drawing. */
(function (root) {
  "use strict";
  var BY_NAME = { tiny: 1, small: 1, medium: 1, large: 2, huge: 3, gargantuan: 4 };
  var MAX = 4;
  /** "Large" / "large" / 2 / "2" -> squares per side (1..4). Unknown or blank -> 1 (Medium). */
  function squares(size) {
    if (size == null || size === "") return 1;
    if (typeof size === "number" || /^\s*\d+(\.\d+)?\s*$/.test(String(size))) {
      var n = Math.floor(Number(size));
      return isFinite(n) ? Math.max(1, Math.min(MAX, n)) : 1;
    }
    var key = String(size).trim().toLowerCase().split(/[\s(]/)[0];
    return BY_NAME[key] || 1;
  }
  function sizeOf(t) { return squares(t && t.size); }
  /** Label font in squares. Medium keeps its old size (r*0.4); bigger tokens cap at 1.5x Medium. */
  function labelFontCells(size) { return Math.min(squares(size), 1.5) * 0.85 * 0.5 * 0.4; }
  /** Estimated label width in squares (canvas text ~0.62em per character, labels cap at 16 characters).
      cellPx = screen pixels per square (grid px x zoom). The map draws names at 11px or more, so zoomed out a
      name covers more squares; placement passes the DM's current zoom (never less than zoom 1). */
  function labelCells(label, size, cellPx) {
    var chars = Math.min(16, String(label == null ? "" : label).length);
    var cpx = cellPx > 0 ? cellPx : 70;
    var fontPx = Math.max(11, labelFontCells(size) * cpx);
    return chars * 0.62 * fontPx / cpx + 0.1;
  }
  function footprint(t) {
    var s = sizeOf(t);
    return { x: Number(t.pos.x) || 0, y: Number(t.pos.y) || 0, w: s, h: s };
  }
  /** The band under the footprint holding the name + HP bar: one row, at least as wide as the token. */
  function labelBand(t, label, cellPx) {
    var s = sizeOf(t);
    var txt = label != null ? label : (t.label || t.name || "");
    var w = Math.max(s, labelCells(txt, s, cellPx));
    var cx = (Number(t.pos.x) || 0) + s / 2;
    return { x: cx - w / 2, y: (Number(t.pos.y) || 0) + s, w: w, h: 1 };
  }
  var EPS = 1e-6;
  function overlap(a, b) {
    return a.x < b.x + b.w - EPS && b.x < a.x + a.w - EPS && a.y < b.y + b.h - EPS && b.y < a.y + a.h - EPS;
  }
  function inGrid(x, y, s, grid) {
    var cols = (grid && grid.cols) || 30, rows = (grid && grid.rows) || 20;
    return x >= 0 && y >= 0 && x + s <= cols && y + s <= rows;
  }
  /** True when a size-s footprint at (x,y) overlaps any other token's footprint. */
  function areaTaken(x, y, s, others) {
    var me = { x: x, y: y, w: squares(s), h: squares(s) };
    return (others || []).some(function (o) { return o && o.pos && overlap(me, footprint(o)); });
  }
  /** Placement check: footprints never overlap; with labels on, neither label band may cover another token or label. */
  function fits(x, y, s, label, others, grid, withLabels, cellPx) {
    s = squares(s);
    if (!inGrid(x, y, s, grid)) return false;
    var me = { pos: { x: x, y: y }, size: s, label: label };
    var mine = footprint(me), myBand = labelBand(me, label, cellPx);
    return !(others || []).some(function (o) {
      if (!o || !o.pos) return false;
      var f = footprint(o);
      if (overlap(mine, f)) return true;
      if (!withLabels) return false;
      var b = labelBand(o, null, cellPx);
      return overlap(mine, b) || overlap(myBand, f) || overlap(myBand, b);
    });
  }
  /** Nearest open spot to start (square spiral). First pass keeps labels clear; if the map is too full,
      settle for footprints only. Returns {x,y} (top-left) or null. */
  function findSpot(start, s, label, others, grid, cellPx) {
    s = squares(s);
    var cols = (grid && grid.cols) || 30, rows = (grid && grid.rows) || 20;
    var sx = Math.max(0, Math.min(cols - s, (start && start.x) || 0));
    var sy = Math.max(0, Math.min(rows - s, (start && start.y) || 0));
    var max = Math.max(cols, rows);
    for (var pass = 0; pass < 2; pass++) {
      var labels = pass === 0;
      if (fits(sx, sy, s, label, others, grid, labels, cellPx)) return { x: sx, y: sy };
      for (var r = 1; r < max; r++) {
        for (var y = sy - r; y <= sy + r; y++) {
          for (var x = sx - r; x <= sx + r; x++) {
            if (Math.max(Math.abs(x - sx), Math.abs(y - sy)) !== r) continue;
            if (fits(x, y, s, label, others, grid, labels, cellPx)) return { x: x, y: y };
          }
        }
      }
    }
    return null;
  }
  /** Keep a footprint inside the grid. */
  function clampPos(x, y, s, grid) {
    s = squares(s);
    var cols = (grid && grid.cols) || 30, rows = (grid && grid.rows) || 20;
    return { x: Math.max(0, Math.min(cols - s, x)), y: Math.max(0, Math.min(rows - s, y)) };
  }
  root.SSDNSTokenSize = {
    squares: squares, sizeOf: sizeOf, labelFontCells: labelFontCells, labelCells: labelCells,
    footprint: footprint, labelBand: labelBand, overlap: overlap, areaTaken: areaTaken,
    fits: fits, findSpot: findSpot, clampPos: clampPos
  };
})(typeof window !== "undefined" ? window : globalThis);

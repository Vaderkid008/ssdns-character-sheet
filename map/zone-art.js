/**
 * Lasting-zone plates for the 18 approved replacements.
 * Same pattern as the Fireball aftermath: one shared loop per asset,
 * a still plate when motion is off or the loop cannot play, and no
 * decoding once the last zone of that spell is gone.
 * The plate follows the zone record. It does not change the hit test.
 * rules.js is not edited.
 */
(function (root) {
  "use strict";

  var PLATE = 512;
  var RING = 256;

  /* side/length are the book defaults. A saved zone's own radius, side,
     length, width, and facing win, so Fog Cloud upcast scales this plate. */
  var BOOK = {
    "grease": { slug: "grease", kind: "square", side: 10 },
    "entangle": { slug: "entangle", kind: "square", side: 20 },
    "web": { slug: "web", kind: "square", side: 20 },
    "fog cloud": { slug: "fog-cloud", kind: "circle" },
    "cloudkill": { slug: "cloudkill", kind: "circle" },
    "stinking cloud": { slug: "stinking-cloud", kind: "circle" },
    "wall of thorns": { slug: "wall-of-thorns", kind: "wall", length: 60 },
    "blade barrier": { slug: "blade-barrier", kind: "wall", length: 100 },
    "wind wall": { slug: "wind-wall", kind: "wall", length: 50 },
    "light": { slug: "light", kind: "circle", rings: true },
    "darkness": { slug: "darkness", kind: "circle" },
    "daylight": { slug: "daylight", kind: "circle", rings: true },
    "moonbeam": { slug: "moonbeam", kind: "circle", rings: true },
    "silence": { slug: "silence", kind: "circle" },
    "call lightning": { slug: "call-lightning", kind: "circle" },
    "spike growth": { slug: "spike-growth", kind: "circle" },
    "hypnotic pattern": { slug: "hypnotic-pattern", kind: "square", side: 30 },
    "black tentacles": { slug: "black-tentacles", kind: "square", side: 20 }
  };

  var media = {};

  function specOf(zone) {
    if (!zone) return null;
    return BOOK[String(zone.key || "").toLowerCase()] || null;
  }
  function num(v) {
    var n = Number(v);
    return isFinite(n) ? n : 0;
  }
  function radiusFt(zone) {
    return num(zone && zone.radius);
  }
  function sideFt(zone, spec) {
    if (num(zone && zone.side) > 0) return num(zone.side);
    var shape = String(zone && zone.shape || "");
    if ((shape === "cube" || shape === "square") && num(zone.radius) > 0) return num(zone.radius) * 2;
    return spec.side || 0;
  }
  function lengthFt(zone, spec) {
    return num(zone && zone.length) || spec.length || 0;
  }
  function widthFt(zone) {
    return num(zone && zone.width) || 5;
  }

  /* World pixels, before the view zoom. Screen size is this times zoom. */
  function layout(zone, px) {
    var spec = specOf(zone);
    if (!spec || !zone || !zone.origin) return null;
    var cell = num(px) || 70;
    var ox = num(zone.origin.x) * cell;
    var oy = num(zone.origin.y) * cell;
    if (zone.gridBox) {
      var cells = Math.max(1, Math.round(num(zone.squares) || 1));
      var box = cells * cell;
      return {
        kind: "square", slug: spec.slug, rings: !!spec.rings,
        x: ox, y: oy, size: box, sideFt: cells * 5, cell: cell
      };
    }
    if (spec.kind === "circle") {
      var rFt = radiusFt(zone);
      return {
        kind: "circle", slug: spec.slug, rings: !!spec.rings,
        cx: ox, cy: oy, r: (rFt / 5) * cell, radiusFt: rFt
      };
    }
    if (spec.kind === "square") {
      var side = sideFt(zone, spec);
      var size = (side / 5) * cell;
      return {
        kind: "square", slug: spec.slug, rings: !!spec.rings,
        x: ox - size / 2, y: oy - size / 2, size: size, sideFt: side
      };
    }
    var len = lengthFt(zone, spec);
    var wide = widthFt(zone);
    var n = Math.max(1, Math.round(len / 5));
    var face = num(zone.facing);
    var fx = Math.cos(face), fy = Math.sin(face);
    var lx = -fy, ly = fx;
    var ft = cell / 5;
    var tiles = [];
    var i;
    for (i = 0; i < n; i++) {
      var along = (i + 0.5 - n / 2) * 5;
      tiles.push({ x: ox + fx * along * ft, y: oy + fy * along * ft, i: i });
    }
    var corners = [[-len / 2, -wide / 2], [len / 2, -wide / 2], [len / 2, wide / 2], [-len / 2, wide / 2]].map(function (c) {
      return { x: ox + (fx * c[0] + lx * c[1]) * ft, y: oy + (fy * c[0] + ly * c[1]) * ft };
    });
    return {
      kind: "wall", slug: spec.slug, rings: false,
      facing: face, tiles: tiles, corners: corners,
      lengthFt: len, widthFt: wide, count: n, cell: cell
    };
  }

  function slot(slug) {
    if (!media[slug]) media[slug] = { img: null, imgState: "idle", video: null, videoState: "idle", kicked: false };
    return media[slug];
  }
  function stillSrc(slug) { return "fx/zones/" + slug + "/" + slug + "-still.png"; }
  function loopSrc(slug) { return "fx/zones/" + slug + "/" + slug + "-idle.webm"; }

  function ensureStill(slug, env) {
    var s = slot(slug);
    if (s.img) return s.img;
    var Img = root.Image;
    if (!Img) return null;
    var img = new Img();
    img.decoding = "async";
    s.img = img;
    s.imgState = "loading";
    img.addEventListener("load", function () {
      s.imgState = "live";
      if (env && env.requestDraw) env.requestDraw();
    });
    img.addEventListener("error", function () {
      s.imgState = "dead";
      if (env && env.requestDraw) env.requestDraw();
    });
    img.src = env && env.asset ? env.asset(stillSrc(slug)) : stillSrc(slug);
    return img;
  }
  function stillReady(slug) {
    var s = media[slug];
    var img = s && s.img;
    return !!(img && img.complete && img.naturalWidth > 0 && s.imgState !== "dead");
  }
  function ensureVideo(slug, env) {
    var s = slot(slug);
    if (s.video) return s.video;
    if (!root.document || !root.document.createElement) return null;
    var v = root.document.createElement("video");
    v.muted = true;
    v.loop = true;
    v.playsInline = true;
    v.preload = "auto";
    v.setAttribute("playsinline", "");
    v.setAttribute("aria-hidden", "true");
    /* In the document, off the map. A detached loop does not decode. */
    v.style.cssText = "position:fixed;left:-4800px;top:0;width:512px;height:512px;opacity:0.02;pointer-events:none;";
    s.video = v;
    s.videoState = "loading";
    v.addEventListener("error", function () {
      s.videoState = "dead";
      if (env && env.requestDraw) env.requestDraw();
    });
    v.addEventListener("loadeddata", function () {
      if (s.videoState === "dead") return;
      s.videoState = "live";
      if (env && env.requestDraw) env.requestDraw();
    });
    var host = root.document.body || root.document.documentElement;
    if (host) host.appendChild(v);
    v.src = env && env.asset ? env.asset(loopSrc(slug)) : loopSrc(slug);
    return v;
  }
  function tryPlay(slug) {
    var s = media[slug];
    if (!s || !s.video || s.videoState === "dead") return;
    var v = s.video;
    if (!v.paused && v.readyState >= 2) {
      s.videoState = "live";
      return;
    }
    if (s.kicked) return;
    s.kicked = true;
    var p;
    try { p = v.play(); } catch (e) { s.videoState = "dead"; return; }
    if (p && typeof p.then === "function") {
      p.then(function () { if (s.videoState !== "dead") s.videoState = "live"; }).catch(function () {
        s.videoState = "dead";
      });
    }
  }
  function pause(slug) {
    var s = media[slug];
    if (!s || !s.video) return;
    if (!s.video.paused) {
      try { s.video.pause(); } catch (e) {}
    }
    s.kicked = false;
  }
  function frameOf(slug, fxOn) {
    var s = media[slug];
    if (fxOn && s && s.video && s.videoState !== "dead" && s.video.readyState >= 2 && !s.video.paused && s.video.videoWidth > 0) return s.video;
    if (stillReady(slug)) return s.img;
    return null;
  }

  function screenOf(env, wx, wy) {
    if (env && env.worldToScreen) return env.worldToScreen(wx, wy);
    var z = (env && env.zoom) || 1;
    return { x: wx * z, y: wy * z };
  }
  function drawPlate(ctx, frame, env, lay) {
    var z = (env && env.zoom) || 1;
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    if (lay.kind === "circle") {
      var c = screenOf(env, lay.cx, lay.cy);
      var r = lay.r * z;
      ctx.beginPath();
      ctx.arc(c.x, c.y, Math.max(1, r), 0, Math.PI * 2);
      ctx.clip();
      var scale = r / RING;
      ctx.drawImage(frame, c.x - RING * scale, c.y - RING * scale, PLATE * scale, PLATE * scale);
    } else if (lay.kind === "square") {
      var tl = screenOf(env, lay.x, lay.y);
      var size = lay.size * z;
      ctx.beginPath();
      ctx.rect(tl.x, tl.y, size, size);
      ctx.clip();
      ctx.drawImage(frame, tl.x, tl.y, size, size);
    } else {
      var cell = (lay.cell || 70) * z;
      ctx.beginPath();
      lay.corners.forEach(function (p, i) {
        var s = screenOf(env, p.x, p.y);
        if (i === 0) ctx.moveTo(s.x, s.y);
        else ctx.lineTo(s.x, s.y);
      });
      ctx.closePath();
      ctx.clip();
      lay.tiles.forEach(function (t) {
        var s = screenOf(env, t.x, t.y);
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(lay.facing || 0);
        ctx.drawImage(frame, -cell / 2, -cell / 2, cell, cell);
        ctx.restore();
      });
    }
    ctx.restore();
  }
  function strokeWait(ctx, env, lay) {
    var z = (env && env.zoom) || 1;
    ctx.save();
    ctx.beginPath();
    if (lay.kind === "circle") {
      var c = screenOf(env, lay.cx, lay.cy);
      ctx.arc(c.x, c.y, Math.max(1, lay.r * z), 0, Math.PI * 2);
    } else if (lay.kind === "square") {
      var tl = screenOf(env, lay.x, lay.y);
      var size = lay.size * z;
      ctx.rect(tl.x, tl.y, size, size);
    } else {
      lay.corners.forEach(function (p, i) {
        var s = screenOf(env, p.x, p.y);
        if (i === 0) ctx.moveTo(s.x, s.y);
        else ctx.lineTo(s.x, s.y);
      });
      ctx.closePath();
    }
    ctx.strokeStyle = "rgba(201,162,39,0.85)";
    ctx.lineWidth = 1.25;
    ctx.stroke();
    ctx.restore();
  }

  function paint(ctx, zone, env) {
    var spec = specOf(zone);
    if (!spec) return "skip";
    var lay = layout(zone, env && env.px);
    if (!lay || !ctx) return "skip";
    var fx = !!(env && env.fxOn && env.fxOn());
    ensureStill(spec.slug, env);
    if (fx) ensureVideo(spec.slug, env);
    var frame = frameOf(spec.slug, fx);
    if (frame) {
      drawPlate(ctx, frame, env, lay);
      return "art";
    }
    var s = media[spec.slug];
    var stillDead = s && s.imgState === "dead";
    var videoDead = !fx || (s && s.videoState === "dead");
    if (stillDead && videoDead) return "miss";
    strokeWait(ctx, env, lay);
    return "wait";
  }

  function wanted(zones) {
    var slugs = {};
    (zones || []).forEach(function (z) {
      var spec = specOf(z);
      if (spec) slugs[spec.slug] = 1;
    });
    return slugs;
  }
  function sync(zones, env) {
    var slugs = wanted(zones);
    var fx = !!(env && env.fxOn && env.fxOn());
    var slug;
    for (slug in media) {
      if (!Object.prototype.hasOwnProperty.call(media, slug)) continue;
      if (!slugs[slug] || !fx) pause(slug);
    }
    if (!fx) return false;
    var live = false;
    for (slug in slugs) {
      if (!Object.prototype.hasOwnProperty.call(slugs, slug)) continue;
      ensureStill(slug, env);
      var v = ensureVideo(slug, env);
      if (!v) continue;
      tryPlay(slug);
      if (media[slug].videoState !== "dead") live = true;
    }
    return live;
  }
  function revive() {
    var slug;
    for (slug in media) {
      if (!Object.prototype.hasOwnProperty.call(media, slug)) continue;
      if (media[slug].videoState === "dead") {
        media[slug].videoState = "idle";
        media[slug].kicked = false;
      }
    }
  }
  function paths(key) {
    var spec = BOOK[String(key || "").toLowerCase()];
    if (!spec) return null;
    return { still: stillSrc(spec.slug), loop: loopSrc(spec.slug), slug: spec.slug, kind: spec.kind, rings: !!spec.rings };
  }

  root.SSDNSZoneArt = {
    book: BOOK,
    owns: function (key) { return !!BOOK[String(key || "").toLowerCase()]; },
    paths: paths,
    layout: layout,
    paint: paint,
    sync: sync,
    revive: revive,
    media: function () { return media; }
  };
})(typeof window !== "undefined" ? window : globalThis);

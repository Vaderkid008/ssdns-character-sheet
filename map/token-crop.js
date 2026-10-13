/* Round token cropper. Fit covers the circle (a contain scale leaves empty
   corners). Export always draws a destination at least 1px wide, so zooming
   out cannot produce an empty file. A tainted canvas keeps the original URL. */
(function (root) {
  "use strict";
  var OUT = 128;
  var VIEW = 240;
  var cache = Object.create(null);
  var PRESETS = {
    jolene: "tokenImages/jolene.webp",
    caleb: "tokenImages/caleb.webp",
    mira: "tokenImages/mira.webp",
    wes: "tokenImages/wes.webp",
    "bandit-1": "tokenImages/bandit-1.webp",
    "bandit-2": "tokenImages/bandit-2.webp",
    "bandit-3": "tokenImages/bandit-3.webp",
    "abigail-ellen": "tokenImages/abigail-ellen.webp",
    townsfolk: "tokenImages/townsfolk.webp"
  };

  function coverScale(imgW, imgH, view) {
    var w = Number(imgW) || 1;
    var h = Number(imgH) || 1;
    var v = Number(view) || 1;
    return Math.max(v / w, v / h);
  }

  function topBias(imgW, imgH) {
    var w = Number(imgW) || 1;
    var h = Number(imgH) || 1;
    var side = Math.min(w, h);
    var leftover = Math.max(0, h - side);
    return { x: (w - side) / 2, y: leftover * 0.12, side: side };
  }

  function fitFrame(imgW, imgH, view) {
    var v = Number(view) || VIEW;
    var scale = coverScale(imgW, imgH, v);
    var dw = (Number(imgW) || 1) * scale;
    var dh = (Number(imgH) || 1) * scale;
    var panX = (v - dw) / 2;
    var panY = dh > v ? (v - dh) * 0.12 : (v - dh) / 2;
    return { scale: scale, panX: panX, panY: panY };
  }

  function exportPlacement(imgW, imgH, view, scale, panX, panY, out) {
    var v = Number(view) || VIEW;
    var o = Number(out) || OUT;
    var s = Number(scale);
    if (!(s > 0)) s = coverScale(imgW, imgH, v);
    var ratio = o / v;
    var dw = Math.max(1, (Number(imgW) || 1) * s * ratio);
    var dh = Math.max(1, (Number(imgH) || 1) * s * ratio);
    return {
      dx: (Number(panX) || 0) * ratio,
      dy: (Number(panY) || 0) * ratio,
      dw: dw,
      dh: dh,
      empty: false
    };
  }

  function slug(value) {
    return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }

  function preset(id) {
    var key = slug(id);
    return PRESETS[key] || "";
  }

  function paint(canvas, img, frame, view) {
    var ctx = canvas.getContext("2d");
    var size = canvas.width || OUT;
    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 0.5, 0, Math.PI * 2);
    ctx.clip();
    var place = exportPlacement(img.width, img.height, view, frame.scale, frame.panX, frame.panY, size);
    ctx.drawImage(img, place.dx, place.dy, place.dw, place.dh);
    ctx.restore();
    return place;
  }

  function exportImage(img, frame) {
    var canvas = root.document.createElement("canvas");
    canvas.width = OUT;
    canvas.height = OUT;
    var fitted = frame || fitFrame(img.width, img.height, VIEW);
    paint(canvas, img, { scale: fitted.scale, panX: fitted.panX * (VIEW / (fitted.view || VIEW)), panY: fitted.panY * (VIEW / (fitted.view || VIEW)) }, fitted.view || VIEW);
    var url;
    try { url = canvas.toDataURL("image/webp", 0.82); }
    catch (e) { return ""; }
    if (!url || url === "data:,") return "";
    return url;
  }

  function loadImage(src, cors) {
    return new Promise(function (resolve, reject) {
      var im = new root.Image();
      if (cors) {
        try { im.crossOrigin = "anonymous"; } catch (e) {}
      }
      im.onload = function () { resolve(im); };
      im.onerror = function () { reject(new Error("image")); };
      im.src = src;
    });
  }

  function cropUrl(src) {
    if (!src) return Promise.resolve("");
    if (cache[src]) return Promise.resolve(cache[src]);
    if (/^tokenImages\//.test(src)) {
      cache[src] = src;
      return Promise.resolve(src);
    }
    return loadImage(src, true).then(function (im) {
      var url = "";
      try { url = exportImage(im, fitFrame(im.width, im.height, VIEW)); }
      catch (e) { url = ""; }
      if (!url) url = src;
      cache[src] = url;
      return url;
    }).catch(function () {
      return loadImage(src, false).then(function () {
        cache[src] = src;
        return src;
      }).catch(function () { return ""; });
    });
  }

  function open(opts) {
    opts = opts || {};
    var host = opts.host || root.document.body;
    var old = host.querySelector("[data-act='cropper']");
    if (old) old.remove();
    var box = root.document.createElement("div");
    box.setAttribute("data-act", "cropper");
    box.className = "ssm-cropper";
    box.innerHTML = ''
      + '<div class="ssm-crop-head"><b>Token image</b><button type="button" data-act="cropClose">×</button></div>'
      + '<canvas data-act="cropView" width="240" height="240"></canvas>'
      + '<div class="ssm-crop-row">'
      + '<button type="button" data-act="cropFit">Fit</button>'
      + '<label>Zoom <input data-act="cropZoom" type="range" min="0.05" max="4" step="0.01" value="1"></label>'
      + '</div>'
      + '<div class="ssm-crop-row"><input data-act="cropFile" type="file" accept="image/*"><button type="button" data-act="cropSave">Use image</button></div>'
      + '<p class="ssm-crop-note" data-act="cropNote"></p>';
    host.appendChild(box);
    var view = box.querySelector("[data-act='cropView']");
    var note = box.querySelector("[data-act='cropNote']");
    var zoom = box.querySelector("[data-act='cropZoom']");
    var frame = { scale: 1, panX: 0, panY: 0, view: VIEW };
    var img = null;
    var drag = null;

    function show(msg) { if (note) note.textContent = msg || ""; }
    function redraw() {
      if (!img) return;
      view.width = VIEW;
      view.height = VIEW;
      paint(view, img, frame, VIEW);
      box.setAttribute("data-scale", String(frame.scale));
      if (zoom) zoom.value = String(Math.max(0.05, Math.min(4, frame.scale)));
    }
    function useFit() {
      if (!img) { show("Choose an image first"); return; }
      var fit = fitFrame(img.width, img.height, VIEW);
      frame.scale = fit.scale;
      frame.panX = fit.panX;
      frame.panY = fit.panY;
      redraw();
    }
    function adopt(next) {
      img = next;
      useFit();
    }
    function fromFile(file) {
      if (!file) return;
      var reader = new root.FileReader();
      reader.onload = function () {
        loadImage(String(reader.result || ""), false).then(adopt).catch(function () { show("That image didn't open"); });
      };
      reader.readAsDataURL(file);
    }

    box.querySelector("[data-act='cropClose']").addEventListener("click", function () { box.remove(); });
    box.querySelector("[data-act='cropFit']").addEventListener("click", useFit);
    zoom.addEventListener("input", function () {
      if (!img) return;
      var next = Number(zoom.value);
      if (!(next > 0)) return;
      var cx = VIEW / 2;
      var cy = VIEW / 2;
      var k = next / frame.scale;
      frame.panX = cx - (cx - frame.panX) * k;
      frame.panY = cy - (cy - frame.panY) * k;
      frame.scale = next;
      redraw();
    });
    box.querySelector("[data-act='cropFile']").addEventListener("change", function (e) {
      var file = e.target.files && e.target.files[0];
      fromFile(file);
    });
    view.addEventListener("pointerdown", function (e) {
      if (!img) return;
      drag = { x: e.clientX, y: e.clientY, panX: frame.panX, panY: frame.panY };
      if (view.setPointerCapture) view.setPointerCapture(e.pointerId);
    });
    view.addEventListener("pointermove", function (e) {
      if (!drag) return;
      frame.panX = drag.panX + (e.clientX - drag.x);
      frame.panY = drag.panY + (e.clientY - drag.y);
      redraw();
    });
    function endDrag() { drag = null; }
    view.addEventListener("pointerup", endDrag);
    view.addEventListener("pointercancel", endDrag);
    box.querySelector("[data-act='cropSave']").addEventListener("click", function () {
      if (!img) { show("Choose an image first"); return; }
      var url = "";
      try { url = exportImage(img, frame); }
      catch (e) { url = ""; }
      if (!url) {
        show("The browser blocked that image. The original picture stays.");
        if (opts.onFallback) opts.onFallback(opts.src || "");
        return;
      }
      cache[url] = url;
      if (opts.onSave) opts.onSave(url);
      box.remove();
    });
    if (opts.src) {
      loadImage(opts.src, true).then(adopt).catch(function () {
        loadImage(opts.src, false).then(function (im) {
          adopt(im);
          show("This picture is on another host. Fit still works. If saving is blocked, the original picture stays.");
        }).catch(function () { show("That image didn't open"); });
      });
    }
    return box;
  }

  root.SSDNSTokenCrop = {
    coverScale: coverScale,
    topBias: topBias,
    fitFrame: fitFrame,
    exportPlacement: exportPlacement,
    exportImage: exportImage,
    cropUrl: cropUrl,
    preset: preset,
    open: open,
    cache: cache
  };
})(typeof window !== "undefined" ? window : globalThis);

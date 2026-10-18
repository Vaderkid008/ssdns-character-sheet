/* SSDNS media uploads (sheet 0.3.50 / DMCC 0.2.63).
   Art: any image -> center-cropped square WEBP (512x512 default). Players keep it inside the
   .ssdns file. The DM uploads to Firebase Storage when the project has Storage turned on.
   Audio: DM-only "Add audio" to Firebase Storage. Firebase is optional: without it the game
   still runs on the sheet or on paper. */
(function (root) {
  "use strict";
  var SDK = "https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js";
  var ART = { size: 512, maxBytes: 1024 * 1024, inlineMax: 200 * 1024, hint: "Best: 512×512 PNG or WEBP, under 1 MB. Bigger images are cropped to a square and shrunk." };
  var AUDIO = { maxBytes: 15 * 1024 * 1024, types: /^audio\/(mpeg|mp3|ogg|webm|mp4|aac|x-m4a|wav|x-wav)$/i, hint: "MP3 or OGG, under 15 MB. Uploads count against the free 5 GB of Firebase Storage." };
  var FREE_BYTES = 5 * 1024 * 1024 * 1024;
  var mod = null;

  function slug(s) { return String(s || "file").toLowerCase().replace(/\.[a-z0-9]+$/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "file"; }
  function fmtBytes(n) { n = Number(n) || 0; if (n >= 1073741824) return (n / 1073741824).toFixed(2) + " GB"; if (n >= 1048576) return (n / 1048576).toFixed(1) + " MB"; return Math.max(1, Math.round(n / 1024)) + " KB"; }

  function loadImage(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file), im = new Image();
      im.onload = function () { resolve({ im: im, url: url }); };
      im.onerror = function () { URL.revokeObjectURL(url); reject(new Error("That file isn't an image we can read.")); };
      im.src = url;
    });
  }
  /* Center-crop to a square and scale to size. Returns {blob, dataUrl, width, height, cropped}. */
  function cropSquare(file, size) {
    size = size || ART.size;
    if (!file || !/^image\//.test(file.type || "")) return Promise.reject(new Error("Pick a PNG, WEBP or JPG image."));
    return loadImage(file).then(function (r) {
      var w = r.im.naturalWidth, h = r.im.naturalHeight, side = Math.min(w, h);
      var cv = document.createElement("canvas"); cv.width = size; cv.height = size;
      var ctx = cv.getContext("2d");
      ctx.drawImage(r.im, (w - side) / 2, (h - side) / 2, side, side, 0, 0, size, size);
      URL.revokeObjectURL(r.url);
      return new Promise(function (resolve) {
        cv.toBlob(function (blob) {
          var fr = new FileReader();
          fr.onload = function () { resolve({ blob: blob, dataUrl: String(fr.result), width: size, height: size, cropped: w !== h || w !== size, from: [w, h] }); };
          fr.readAsDataURL(blob);
        }, "image/webp", 0.85);
      });
    });
  }

  function dmCtx() { var D = root.DMCC; return D && D.state && D.state.app && D.state.uid && !D.state.demo ? { app: D.state.app, uid: D.state.uid } : null; }
  function storage(ctx) {
    ctx = ctx || dmCtx();
    if (!ctx) return Promise.reject(new Error("Open a live room first. Firebase Storage needs the DM signed in."));
    var cfg = root.SSDNS_FIREBASE_CONFIG || {};
    if (!cfg.storageBucket) return Promise.reject(new Error("No storageBucket in firebase-config.js. See /setup/ (optional)."));
    return (mod ? Promise.resolve(mod) : import(SDK).then(function (m) { mod = m; return m; })).then(function (m) { return { m: m, st: m.getStorage(ctx.app), uid: ctx.uid }; });
  }
  function friendly(err) {
    var code = String((err && err.code) || ""), msg = String((err && err.message) || err || "");
    if (/unauthorized|permission/i.test(code + msg)) return "Storage said no. Turn on Storage and publish storage.rules (see /setup/ → Setting up Firebase).";
    if (/bucket|not.?found|project-not|no-default-bucket|retry-limit/i.test(code + msg)) return "Firebase Storage isn't turned on for this project yet. It's optional. See /setup/ → Setting up Firebase.";
    return msg || "Upload failed.";
  }
  /* kind: "audio" | "images". Path: dm/{uid}/{kind}/{time}-{name}. Only that DM can write there (storage.rules). */
  function upload(blob, kind, name, onProgress, ctx) {
    return storage(ctx).then(function (s) {
      var path = "dm/" + s.uid + "/" + (kind === "audio" ? "audio" : "images") + "/" + Date.now().toString(36) + "-" + slug(name) + (kind === "audio" ? "" : ".webp");
      var ref = s.m.ref(s.st, path);
      return new Promise(function (resolve, reject) {
        var task = s.m.uploadBytesResumable(ref, blob, { contentType: blob.type || (kind === "audio" ? "audio/mpeg" : "image/webp"), cacheControl: "public,max-age=31536000" });
        task.on("state_changed", function (snap) { if (onProgress) onProgress(snap.bytesTransferred / (snap.totalBytes || 1)); }, function (err) { reject(new Error(friendly(err))); }, function () {
          s.m.getDownloadURL(ref).then(function (url) { resolve({ url: url, path: path, size: blob.size, name: name }); }, function (err) { reject(new Error(friendly(err))); });
        });
      });
    }, function (err) { throw new Error(friendly(err)); });
  }
  function usage(ctx) {
    return storage(ctx).then(function (s) {
      var base = s.m.ref(s.st, "dm/" + s.uid);
      function walk(ref) {
        return s.m.listAll(ref).then(function (res) {
          return Promise.all(res.items.map(function (it) { return s.m.getMetadata(it).then(function (md) { return Number(md.size) || 0; }, function () { return 0; }); })
            .concat(res.prefixes.map(walk))).then(function (arr) { return arr.reduce(function (a, b) { return a + b; }, 0); });
        });
      }
      return walk(base).then(function (bytes) { return { bytes: bytes, free: FREE_BYTES, pct: bytes / FREE_BYTES * 100, label: fmtBytes(bytes) + " of " + fmtBytes(FREE_BYTES) + " free tier" }; });
    }, function (err) { throw new Error(friendly(err)); });
  }
  function remove(path, ctx) { return storage(ctx).then(function (s) { return s.m.deleteObject(s.m.ref(s.st, path)); }); }
  function checkAudio(file) {
    if (!file) return "Pick an audio file.";
    if (!AUDIO.types.test(file.type || "") && !/\.(mp3|ogg|m4a|wav|webm)$/i.test(file.name || "")) return "That isn't an audio file (MP3 or OGG works best).";
    if (file.size > AUDIO.maxBytes) return "That file is " + fmtBytes(file.size) + ". Keep audio under 15 MB (export as MP3 ~128 kbps).";
    return "";
  }

  /* Art file inputs: [data-art-file] with data-art-target="<css selector of the text input to fill>". */
  function onArtFile(input) {
    var f = input.files && input.files[0]; if (!f) return;
    var scope = input.closest("[data-item-form]") || document;
    var sel = input.getAttribute("data-art-target") || "[data-item-art]";
    var target = scope.querySelector(sel) || document.querySelector(sel);
    var note = input.parentNode && input.parentNode.parentNode ? input.parentNode.parentNode.querySelector("[data-art-note]") : null;
    function say(t) { if (note) note.textContent = t; }
    if (f.size > 8 * ART.maxBytes) { say("That image is " + fmtBytes(f.size) + ". Pick one under 8 MB; we shrink it to 512×512."); return; }
    say("Cropping…");
    cropSquare(f, ART.size).then(function (out) {
      var ctx = dmCtx();
      var done = function (val, how) { if (target) { target.value = val; target.dispatchEvent(new Event("input", { bubbles: true })); target.dispatchEvent(new Event("change", { bubbles: true })); } say((out.cropped ? "Cropped to 512×512. " : "") + how); };
      if (ctx) {
        say("Uploading…");
        return upload(out.blob, "images", f.name, function (p) { say("Uploading " + Math.round(p * 100) + "%"); }).then(function (r) { done(r.url, "Uploaded (" + fmtBytes(r.size) + ")."); }, function (err) {
          if (out.blob.size <= ART.inlineMax) done(out.dataUrl, err.message + " Kept the picture inside the file instead.");
          else say(err.message);
        });
      }
      if (out.blob.size > ART.inlineMax) { say("Still too big after cropping (" + fmtBytes(out.blob.size) + "). Try a simpler image."); return; }
      done(out.dataUrl, "Saved inside your character file (" + fmtBytes(out.blob.size) + ").");
    }).catch(function (err) { say(err.message || "Couldn't read that image."); });
  }
  if (typeof document !== "undefined") {
    document.addEventListener("change", function (e) { var t = e.target; if (t && t.hasAttribute && t.hasAttribute("data-art-file")) onArtFile(t); });
  }

  root.SSDNSMedia = { ART: ART, AUDIO: AUDIO, FREE_BYTES: FREE_BYTES, cropSquare: cropSquare, upload: upload, usage: usage, remove: remove, checkAudio: checkAudio, fmtBytes: fmtBytes, friendly: friendly, slug: slug, dmCtx: dmCtx };
})(typeof window !== "undefined" ? window : globalThis);

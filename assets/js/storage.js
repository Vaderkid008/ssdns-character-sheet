/*
 * SSDNS storage: browser backups (localStorage), file handles (IndexedDB), file save/download.
 * Nothing here talks to a server.
 */
(function (root) {
  "use strict";
  var P = "ssdns.v1.";
  var MAX_VERSIONS = 10;
  var ls = root.localStorage;

  function get(k) { try { var v = ls.getItem(P + k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
  function setRaw(k, str) { ls.setItem(P + k, str); }

  /** setItem that frees space by trimming old versions if the browser runs out. */
  function safeSet(k, str) {
    try { setRaw(k, str); return true; }
    catch (e) {
      // QuotaExceeded: trim the oldest versions of every character, then retry once.
      var idx = get("index") || [];
      idx.forEach(function (c) {
        var h = get("hist." + c.id) || [];
        if (h.length > 3) { try { setRaw("hist." + c.id, JSON.stringify(h.slice(-3))); } catch (e2) {} }
      });
      try { setRaw(k, str); return true; } catch (e3) { throw e3; }
    }
  }

  function index() { return get("index") || []; }
  function touchIndex(doc) {
    var idx = index().filter(function (c) { return c.id !== doc.id; });
    var ch = doc.character || {};
    idx.unshift({ id: doc.id, name: ch.name || "(unnamed)", calling: ch.calling || "", level: ch.level || "", updatedAt: doc.updatedAt });
    safeSet("index", JSON.stringify(idx.slice(0, 50)));
  }
  function saveCurrent(doc) {
    var str = JSON.stringify(doc);
    safeSet("char." + doc.id, str);
    touchIndex(doc);
    setRaw("last", JSON.stringify(doc.id));
    return str.length;
  }
  function loadCurrent(id) { return id ? get("char." + id) : null; }
  function lastId() { return get("last"); }
  function history(id) { return get("hist." + id) || []; }
  /** Keep a snapshot. Skips if identical to the newest one. Returns true if stored. */
  function pushHistory(doc, reason) {
    var h = history(doc.id);
    var body = JSON.stringify(doc);
    if (h.length && JSON.stringify(h[h.length - 1].doc) === body) return false;
    h.push({ at: new Date().toISOString(), reason: reason || "autosave", doc: JSON.parse(body) });
    while (h.length > MAX_VERSIONS) h.shift();
    safeSet("hist." + doc.id, JSON.stringify(h));
    return true;
  }

  // ---------- IndexedDB for FileSystemFileHandle (Chrome / Edge only)
  var dbp = null;
  function db() {
    if (!root.indexedDB) return Promise.reject(new Error("no indexedDB"));
    if (dbp) return dbp;
    dbp = new Promise(function (res, rej) {
      var r = root.indexedDB.open("ssdns-sheet", 1);
      r.onupgradeneeded = function () { r.result.createObjectStore("handles"); };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
    return dbp;
  }
  function idb(mode, fn) {
    return db().then(function (d) {
      return new Promise(function (res, rej) {
        var tx = d.transaction("handles", mode);
        var q = fn(tx.objectStore("handles"));
        tx.oncomplete = function () { res(q && q.result); };
        tx.onerror = function () { rej(tx.error); };
      });
    });
  }
  function putHandle(id, h) { return idb("readwrite", function (s) { return s.put(h, id); }).catch(function () {}); }
  function getHandle(id) { return idb("readonly", function (s) { return s.get(id); }).catch(function () { return null; }); }
  function delHandle(id) { return idb("readwrite", function (s) { return s.delete(id); }).catch(function () {}); }

  // ---------- files
  var forceFallback = /[?&]nofs=1/.test(root.location.search);
  var fsSupported = !forceFallback && typeof root.showOpenFilePicker === "function" && typeof root.showSaveFilePicker === "function";
  var TYPES = [{ description: "SSDNS character", accept: { "application/json": [".ssdns"] } }];

  function pickOpen() {
    return root.showOpenFilePicker({ types: TYPES, multiple: false }).then(function (hs) { return hs[0]; });
  }
  function pickSave(name) {
    return root.showSaveFilePicker({ suggestedName: name, types: TYPES });
  }
  function permission(handle, ask) {
    var o = { mode: "readwrite" };
    if (!handle.queryPermission) return Promise.resolve("granted");
    return handle.queryPermission(o).then(function (p) {
      if (p === "granted" || !ask) return p;
      return handle.requestPermission(o);
    });
  }
  function writeHandle(handle, text) {
    return handle.createWritable().then(function (w) {
      return w.write(text).then(function () { return w.close(); });
    });
  }
  function download(name, text) {
    var blob = new Blob([text], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }

  root.SSDNSStore = {
    MAX_VERSIONS: MAX_VERSIONS, index: index, saveCurrent: saveCurrent, loadCurrent: loadCurrent, lastId: lastId,
    history: history, pushHistory: pushHistory, putHandle: putHandle, getHandle: getHandle, delHandle: delHandle,
    fsSupported: fsSupported, pickOpen: pickOpen, pickSave: pickSave, permission: permission, writeHandle: writeHandle, download: download
  };
})(window);

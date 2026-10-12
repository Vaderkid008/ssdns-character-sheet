/* Firebase RTDB adapter for SSDNSMap.
   Paths are rooms/<code>/<path>. subscribe() delivers child paths the way the mock does.
   Reuses the caller's firebase 10.14.1 namespace (anon auth already done). */
(function (root) {
  "use strict";

  function clone(v) {
    if (v == null || typeof v !== "object") return v;
    try { return JSON.parse(JSON.stringify(v)); } catch (e) { return v; }
  }
  function num(v) {
    var n = Number(v);
    return isFinite(n) ? n : 0;
  }
  function rowsOf(val) {
    if (Array.isArray(val)) return val.slice();
    if (!val || typeof val !== "object") return [];
    return Object.keys(val).map(function (id) {
      var row = val[id];
      if (!row || typeof row !== "object") return { id: id, text: String(row || "") };
      return Object.assign({ id: row.id || id }, row);
    }).sort(function (a, b) {
      return String(a.ts || "").localeCompare(String(b.ts || ""));
    });
  }
  function modeFor(path) {
    if (path === "chat") return "chat";
    if (path === "tableFeed") return "feed";
    if (path === "map/public/tokens") return "tokens";
    if (path === "map/dm/tokens" || path === "map/public/scenes") return "children";
    return "value";
  }

  function create(opts) {
    opts = opts || {};
    var db = opts.db;
    var fb = opts.fb;
    var roomCode = opts.roomCode;
    var role = opts.role === "dm" ? "dm" : "player";
    if (!db || !fb || !roomCode) throw new Error("SSDNSMapFirebase: db, fb, and roomCode are required");
    var seqs = {};
    var controlCache = {};

    function full(path) {
      return "rooms/" + roomCode + "/" + String(path || "").replace(/^\/+/, "");
    }
    function ref(path) {
      return fb.ref(db, full(path));
    }
    function blocked(path) {
      return role !== "dm" && String(path || "").indexOf("map/dm") === 0;
    }
    function syncControl(path, value) {
      if (role !== "dm" || !value || typeof value !== "object" || !fb.set) return;
      var m = /^map\/public\/tokens\/([^/]+)$/.exec(path);
      if (!m) return;
      var id = m[1];
      var uids = {};
      if (value.ownerUid && value.ownerCanMove !== false) uids[value.ownerUid] = true;
      (value.controlledBy || []).forEach(function (u) { if (u) uids[u] = true; });
      var key = JSON.stringify(uids);
      if (controlCache[id] === key) return;
      controlCache[id] = key;
      var ctrl = ref("map/public/control/" + id);
      if (!Object.keys(uids).length) {
        if (fb.remove) fb.remove(ctrl).catch(function () {});
        return;
      }
      fb.set(ctrl, uids).catch(function () {});
    }
    function deliverTree(path, val, prev, cb) {
      var mode = modeFor(path);
      var tree = val && typeof val === "object" ? val : {};
      var before = prev && typeof prev === "object" ? prev : {};
      var ids = {};
      Object.keys(before).forEach(function (k) { ids[k] = 1; });
      Object.keys(tree).forEach(function (k) { ids[k] = 1; });
      Object.keys(ids).forEach(function (id) {
        var next = tree[id];
        var old = before[id];
        var childPath = path + "/" + id;
        if (next == null) {
          if (old != null) cb(null, { path: childPath, removed: true });
          return;
        }
        if (mode === "tokens") {
          var rest = function (obj) {
            var c = Object.assign({}, obj || {});
            delete c.pos;
            delete c.patch;
            return c;
          };
          var restChanged = JSON.stringify(rest(old)) !== JSON.stringify(rest(next));
          if (old == null || restChanged) cb(clone(next), { path: childPath, seq: next.seq, by: next.by });
          var nextPos = next.pos;
          if (nextPos && (nextPos.by || nextPos.seq) && JSON.stringify((old && old.pos) || null) !== JSON.stringify(nextPos)) {
            cb(clone(nextPos), { path: childPath + "/pos", seq: nextPos.seq, by: nextPos.by });
          }
          var nextPatch = next.patch;
          if (nextPatch && JSON.stringify((old && old.patch) || null) !== JSON.stringify(nextPatch)) {
            cb(clone(nextPatch), { path: childPath + "/patch", seq: nextPatch.seq, by: nextPatch.by });
          }
          return;
        }
        if (JSON.stringify(old == null ? null : old) !== JSON.stringify(next)) {
          cb(clone(next), { path: childPath, seq: next.seq, by: next.by });
        }
      });
      return clone(tree);
    }

    return {
      subscribe: function (path, cb) {
        if (blocked(path) || !fb.onValue) return function () {};
        var mode = modeFor(path);
        var seenFeed = {};
        var prev = mode === "chat" ? null : undefined;
        var r = ref(path);
        var unsub = fb.onValue(r, function (snap) {
          var val = snap && snap.val ? snap.val() : null;
          if (mode === "chat") {
            var list = rowsOf(val);
            if (prev && JSON.stringify(list) === JSON.stringify(prev)) return;
            prev = list;
            cb(list, { path: path });
            return;
          }
          if (mode === "feed") {
            rowsOf(val).forEach(function (row) {
              if (!row || seenFeed[row.id]) return;
              seenFeed[row.id] = 1;
              cb(clone(row), { path: "tableFeed/" + row.id, seq: row.seq, by: row.from });
            });
            return;
          }
          if (mode === "value") {
            cb(clone(val), { path: path, seq: val && val.seq, by: val && val.by });
            return;
          }
          prev = deliverTree(path, val, prev, cb);
        }, function () {});
        return function () {
          if (typeof unsub === "function") unsub();
          else { try { fb.off(r, "value", unsub); } catch (e) {} }
        };
      },
      write: function (path, value, meta) {
        if (blocked(path)) return Promise.resolve();
        var seq = num(meta && meta.seq) || num(value && value.seq);
        if (seq && seqs[path] && seq < seqs[path]) return Promise.resolve({ dropped: true });
        var r = ref(path);
        var op;
        if (fb.runTransaction) {
          op = fb.runTransaction(r, function (cur) {
            var curSeq = cur && typeof cur === "object" ? num(cur.seq) : 0;
            if (seq && curSeq && seq < curSeq) return;
            return value;
          });
        } else {
          op = fb.set(r, value).then(function () { return { committed: true }; });
        }
        return Promise.resolve(op).then(function (res) {
          if (res && res.committed === false) return { dropped: true };
          if (seq) seqs[path] = seq;
          syncControl(path, value);
          return { ok: true };
        });
      },
      remove: function (path) {
        if (blocked(path) || !fb.remove) return Promise.resolve();
        delete seqs[path];
        return fb.remove(ref(path));
      }
    };
  }

  function memory(opts) {
    opts = opts || {};
    var role = opts.role === "dm" ? "dm" : "player";
    var store = opts.store || { pub: {}, dm: {} };
    var subs = [];
    var bus = opts.bus || null;
    function bucket(path) { return String(path).indexOf("map/dm") === 0 ? store.dm : store.pub; }
    function matches(sub, write) { return write === sub || write.indexOf(sub + "/") === 0; }
    function deliver(path, value, meta) {
      var msg = Object.assign({ path: path }, meta || {});
      subs.forEach(function (s) {
        if (matches(s.path, path)) s.cb(clone(value), msg);
      });
    }
    if (bus) bus.push(deliver);
    function fan(path, value, meta) {
      var list = bus || [deliver];
      list.forEach(function (fn) { fn(path, value, meta); });
    }
    return {
      subscribe: function (path, cb) {
        if (role !== "dm" && String(path).indexOf("map/dm") === 0) return function () {};
        var entry = { path: path, cb: cb };
        subs.push(entry);
        var bag = bucket(path);
        Object.keys(bag).forEach(function (k) {
          if (matches(path, k) && bag[k]) cb(clone(bag[k].value), { path: k, seq: bag[k].seq, by: bag[k].by });
        });
        return function () {
          var i = subs.indexOf(entry);
          if (i >= 0) subs.splice(i, 1);
        };
      },
      write: function (path, value, meta) {
        if (role !== "dm" && String(path).indexOf("map/dm") === 0) return Promise.resolve();
        var bag = bucket(path);
        var seq = meta && meta.seq;
        var prev = bag[path];
        if (prev && seq && prev.seq && seq < prev.seq) return Promise.resolve({ dropped: true });
        bag[path] = { value: clone(value), seq: seq, by: meta && meta.by };
        if (opts.onWrite) opts.onWrite(path, value, meta);
        fan(path, value, meta || {});
        return Promise.resolve({ ok: true });
      },
      remove: function (path) {
        if (role !== "dm" && String(path).indexOf("map/dm") === 0) return Promise.resolve();
        delete bucket(path)[path];
        if (opts.onWrite) opts.onWrite(path, null, { removed: true });
        fan(path, null, { removed: true });
        return Promise.resolve();
      },
      _store: store
    };
  }

  root.SSDNSMapFirebase = { create: create, memory: memory };
})(typeof window !== "undefined" ? window : globalThis);

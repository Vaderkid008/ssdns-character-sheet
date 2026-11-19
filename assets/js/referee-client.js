/* Sends the action bus to the referee when window.SSDNS_REFEREE.enabled
   is exactly true. The flag is off unless a host sets it. With the flag
   off, attach() returns and the local adapter stays in place, so the
   sheet and the DM page behave as they do today.
   A desktop host can pass call() and listen() instead of Firebase. */
(function (root) {
  "use strict";
  var APP = "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
  var FN = "https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js";
  var DB = "https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js";
  var attached = "";

  function enabled() {
    var f = root.SSDNS_REFEREE;
    return !!(f && f.enabled === true);
  }

  function appNamed(mod) {
    try { return mod.getApp("ssdns-dm"); } catch (e) {}
    try { return mod.getApp("ssdns-player-join"); } catch (e2) {}
    return null;
  }

  async function liveCall(roomId, action) {
    var appMod = await import(APP);
    var fnMod = await import(FN);
    var app = appNamed(appMod);
    if (!app) return null;
    var functions = fnMod.getFunctions(app, "us-central1");
    var run = fnMod.httpsCallable(functions, "referee");
    var res = await run({
      roomId: roomId,
      action: { name: action.name, payload: action.payload, by: action.by, seq: action.seq }
    });
    return res && res.data && res.data.action || null;
  }

  async function liveListen(roomId, fan) {
    var appMod = await import(APP);
    var dbMod = await import(DB);
    var app = appNamed(appMod);
    if (!app) return function () {};
    var db = dbMod.getDatabase(app);
    var node = dbMod.ref(db, "rooms/" + roomId + "/referee/log");
    return dbMod.onChildAdded(node, function (snap) {
      var value = snap.val();
      if (value) fan(value);
    });
  }

  function attach(roomId, deps) {
    if (!enabled()) return { enabled: false };
    var GA = root.SSDNSGameActions;
    if (!GA || typeof GA.use !== "function") return { enabled: false, reason: "actions" };
    roomId = String(roomId || "");
    if (!roomId) return { enabled: false, reason: "room" };
    if (attached === roomId && !(deps && deps.call)) return { enabled: true, roomId: roomId };
    var subs = [];
    function fan(action) {
      if (!action) return;
      subs.slice().forEach(function (fn) {
        try { fn(action); } catch (e) {}
      });
    }
    var call = deps && deps.call ? deps.call : function (id, action) { return liveCall(id, action); };
    var adapter = {
      name: "referee",
      send: function (action) {
        Promise.resolve()
          .then(function () { return call(roomId, action); })
          .then(function (accepted) { if (accepted) fan(accepted); })
          .catch(function () {});
      },
      subscribe: function (fn) {
        subs.push(fn);
        return function () {
          var i = subs.indexOf(fn);
          if (i >= 0) subs.splice(i, 1);
        };
      }
    };
    GA.use(adapter);
    attached = roomId;
    if (deps && deps.listen) deps.listen(roomId, fan);
    else liveListen(roomId, fan).catch(function () {});
    return { enabled: true, roomId: roomId };
  }

  root.SSDNSRefereeClient = { enabled: enabled, attach: attach };
})(typeof window !== "undefined" ? window : globalThis);

/* Slice 1 game actions. Each shared change is a named action with a seq.
   A smaller seq never replaces a larger one for the same subject.
   Screens call the named actions and on(). The backend is an adapter
   (send + subscribe). This file does not talk to a host. */
(function (root) {
  "use strict";
  var lastSeq = {};
  var seen = {};
  var listeners = [];
  var log = [];
  var clock = 0;

  function num(v) {
    var n = Number(v);
    return isFinite(n) ? n : 0;
  }
  var holds = {};
  var lastKind = {};
  function doorKey(payload) {
    payload = payload || {};
    return "door:" + (payload.doorId || payload.tokenId || "");
  }
  function subject(name, payload) {
    payload = payload || {};
    if (name === "moveToken" || name === "setTokenImage") return name + ":" + (payload.tokenId || "");
    if (name === "rollInitiative") return name + ":" + (payload.key || payload.playerId || "");
    if (name === "takeLoot") return "takeLoot:" + (payload.boxId || "") + ":" + (payload.rowId || "");
    if (name === "openDoor" || name === "pickLock" || name === "forceLock" || name === "cancelCommand") return doorKey(payload);
    if (name === "postRoll" || name === "postChat" || name === "setCondition" || name === "request") return name + ":" + (payload.id || "");
    if (name === "setPresence" || name === "holdTurn" || name === "skipTurn" || name === "takeControl" || name === "handControl" || name === "removeToken") return "player:" + (payload.playerId || "");
    return name || "";
  }
  function noteKind(action) {
    if (!action) return;
    var key = subject(action.name, action.payload);
    var prev = lastKind[key];
    if (!prev || num(action.seq) >= num(prev.seq)) lastKind[key] = { name: action.name, seq: num(action.seq), by: action.by || "" };
  }
  function blocked(name, payload) {
    var key = subject(name, payload || {});
    var last = lastKind[key];
    return !!(last && last.name === "cancelCommand");
  }
  function once(name, payload, by) {
    var key = subject(name, payload || {});
    var prior = holds[key];
    if (prior) return { ok: false, reason: "Already taken.", action: prior };
    var action = dispatch(name, payload || {}, { by: by || "" });
    if (blocked(name, payload)) return { ok: false, reason: "Cancelled.", cancelled: true, action: action };
    holds[key] = action;
    return { ok: true, action: action };
  }
  /* A missing seq applies only when this subject has no ordered write yet. */
  function accept(prev, next) {
    prev = num(prev);
    next = num(next);
    if (!next) return !prev;
    if (!prev) return true;
    return next >= prev;
  }
  function emit(action) {
    var key = subject(action.name, action.payload);
    var seq = num(action.seq);
    if (!accept(lastSeq[key] || 0, seq)) return false;
    var seenKey = key + ":" + seq;
    if (seq && seen[seenKey]) return false;
    if (action.name === "takeLoot") {
      var holdKey = subject(action.name, action.payload);
      var prior = holds[holdKey];
      if (prior && num(prior.seq) !== seq) return false;
      if (!prior) holds[holdKey] = action;
    }
    if (seq) {
      lastSeq[key] = seq;
      seen[seenKey] = 1;
    }
    noteKind(action);
    log.push(action);
    if (log.length > 80) log.shift();
    listeners.forEach(function (fn) {
      try { fn(action); } catch (e) {}
    });
    return true;
  }
  function nextSeq() {
    var n = Date.now();
    if (n <= clock) n = clock + 1;
    clock = n;
    return n;
  }
  var transport = null;
  var detachTransport = null;
  function localAdapter() {
    var subs = [];
    return {
      name: "local",
      send: function (action) {
        subs.slice().forEach(function (fn) {
          try { fn(action); } catch (e) {}
        });
      },
      subscribe: function (fn) {
        subs.push(fn);
        return function () {
          var i = subs.indexOf(fn);
          if (i >= 0) subs.splice(i, 1);
        };
      }
    };
  }
  function use(next) {
    if (detachTransport) {
      try { detachTransport(); } catch (e) {}
      detachTransport = null;
    }
    if (!next || typeof next.send !== "function" || typeof next.subscribe !== "function") next = localAdapter();
    transport = next;
    var off = transport.subscribe(function (action) { emit(action); });
    detachTransport = typeof off === "function" ? off : null;
    return transport.name || "";
  }
  function dispatch(name, payload, meta) {
    meta = meta || {};
    var action = {
      name: name,
      seq: num(meta.seq) || nextSeq(),
      by: meta.by || "",
      payload: payload || {}
    };
    transport.send(action);
    return action;
  }
  function on(fn) {
    if (typeof fn !== "function") return function () {};
    listeners.push(fn);
    return function () {
      var i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    };
  }

  use(null);
  root.SSDNSGameActions = {
    accept: accept,
    use: use,
    transport: function () { return transport && transport.name || ""; },
    dispatch: dispatch,
    applyRemote: function (name, payload, seq, by) {
      return emit({ name: name, seq: num(seq), by: by || "", payload: payload || {} });
    },
    on: on,
    recent: function () { return log.slice(); },
    moveToken: function (tokenId, pos, by) {
      pos = pos || {};
      return dispatch("moveToken", {
        tokenId: tokenId || "",
        x: num(pos.x),
        y: num(pos.y),
        sceneId: pos.sceneId || ""
      }, { by: by || "" });
    },
    setTokenImage: function (tokenId, image, by) {
      return dispatch("setTokenImage", {
        tokenId: tokenId || "",
        image: image == null ? "" : String(image)
      }, { by: by || "" });
    },
    rollInitiative: function (body, by) {
      body = body || {};
      return dispatch("rollInitiative", {
        key: body.key || body.playerId || "",
        playerId: body.playerId || "",
        tokenId: body.tokenId || "",
        init: num(body.init),
        name: body.name || "",
        ts: body.ts || ""
      }, { by: by || body.playerId || "" });
    },
    setInitiative: function (body, by) {
      body = body || {};
      return dispatch("setInitiative", {
        round: num(body.round),
        turn: body.turn == null ? 0 : num(body.turn),
        started: !!body.started,
        order: body.order == null ? null : body.order,
        turnSeq: num(body.turnSeq)
      }, { by: by || "" });
    },
    /* Slice 2. takeLoot is once per box row. Door actions lose to a later cancel. */
    blocked: blocked,
    takeLoot: function (body, by) { return once("takeLoot", body, by); },
    openDoor: function (body, by) {
      var action = dispatch("openDoor", body || {}, { by: by || "" });
      return blocked("openDoor", body) ? { ok: false, cancelled: true, action: action } : { ok: true, action: action };
    },
    pickLock: function (body, by) {
      var action = dispatch("pickLock", body || {}, { by: by || "" });
      return blocked("pickLock", body) ? { ok: false, cancelled: true, action: action } : { ok: true, action: action };
    },
    forceLock: function (body, by) {
      var action = dispatch("forceLock", body || {}, { by: by || "" });
      return blocked("forceLock", body) ? { ok: false, cancelled: true, action: action } : { ok: true, action: action };
    },
    cancelCommand: function (body, by) {
      var action = dispatch("cancelCommand", body || {}, { by: by || "" });
      return { ok: true, action: action };
    }
  };
})(typeof window !== "undefined" ? window : globalThis);

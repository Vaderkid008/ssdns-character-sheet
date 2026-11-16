/* Slice 1 game actions. Each shared change is a named action with a seq.
   A smaller seq never replaces a larger one for the same subject.
   Screens subscribe with on(). No server and no rules change. */
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
  function subject(name, payload) {
    payload = payload || {};
    if (name === "moveToken" || name === "setTokenImage") return name + ":" + (payload.tokenId || "");
    if (name === "rollInitiative") return name + ":" + (payload.key || payload.playerId || "");
    return name || "";
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
    if (seq) {
      lastSeq[key] = seq;
      seen[seenKey] = 1;
    }
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
  function dispatch(name, payload, meta) {
    meta = meta || {};
    var action = {
      name: name,
      seq: num(meta.seq) || nextSeq(),
      by: meta.by || "",
      payload: payload || {}
    };
    emit(action);
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

  root.SSDNSGameActions = {
    accept: accept,
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
    }
  };
})(typeof window !== "undefined" ? window : globalThis);

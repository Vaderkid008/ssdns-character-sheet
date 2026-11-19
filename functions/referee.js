/* Portable game-actions referee. No Firebase import.
   A Cloud Function or a later desktop host calls apply() and writes
   the returned paths. The host assigns nothing itself: apply() is the
   only place a room seq is chosen. */

export const LIMITS = {
  movePerTokenPerSec: 8,
  otherPerPlayerPerMin: 30,
  roomPerSec: 20
};

const MOVE_WINDOW = 1000;
const OTHER_WINDOW = 60 * 1000;
const ROOM_WINDOW = 1000;
const ID = /^[A-Za-z0-9_-]{1,64}$/;

const NAMES = {
  moveToken: ["tokenId", "x", "y", "sceneId"],
  setTokenImage: ["tokenId", "image"],
  rollInitiative: ["key", "playerId", "tokenId", "init", "name", "ts"],
  setInitiative: ["round", "turn", "started", "order", "turnSeq"],
  takeLoot: ["boxId", "rowId"],
  setHp: ["id", "hp", "maxHp"]
};

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function prune(list, now, windowMs) {
  const cut = now - windowMs;
  const next = [];
  for (const t of list || []) {
    if (t > cut) next.push(t);
  }
  return next;
}

function blank() {
  return { seq: 0, rates: { room: [], players: {}, tokens: {} }, holds: {}, seen: {} };
}

export function normalize(raw) {
  const state = raw && typeof raw === "object" ? raw : {};
  const rates = state.rates && typeof state.rates === "object" ? state.rates : {};
  return {
    seq: num(state.seq),
    rates: {
      room: Array.isArray(rates.room) ? rates.room.filter((t) => num(t)).map(num) : [],
      players: rates.players && typeof rates.players === "object" ? rates.players : {},
      tokens: rates.tokens && typeof rates.tokens === "object" ? rates.tokens : {}
    },
    holds: state.holds && typeof state.holds === "object" ? state.holds : {},
    seen: state.seen && typeof state.seen === "object" ? state.seen : {}
  };
}

function id(value) {
  const s = String(value || "");
  return ID.test(s) ? s : "";
}

function pick(action) {
  const name = String(action && action.name || "");
  const fields = NAMES[name];
  if (!fields) return null;
  const src = action.payload && typeof action.payload === "object" ? action.payload : {};
  const payload = {};
  fields.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(src, key)) payload[key] = src[key];
  });
  if (name === "setTokenImage" && String(payload.image || "").length > 500000) return { error: "Picture is too large." };
  if (name === "setInitiative" && payload.order != null) {
    if (!Array.isArray(payload.order) || payload.order.length > 80) return { error: "Order is not a turn list." };
    payload.order = payload.order.slice();
  }
  return { name, payload };
}

function remember(state, key, serverSeq) {
  state.seen[key] = serverSeq;
  const keys = Object.keys(state.seen);
  if (keys.length > 80) delete state.seen[keys[0]];
}

function charge(state, kind, tokenId, uid, now) {
  const room = prune(state.rates.room, now, ROOM_WINDOW);
  if (room.length >= LIMITS.roomPerSec) return { ok: false, reason: "This room is too busy." };
  if (kind === "moveToken") {
    const prior = prune(state.rates.tokens[tokenId], now, MOVE_WINDOW);
    if (prior.length >= LIMITS.movePerTokenPerSec) return { ok: false, reason: "That token is moving too fast." };
    prior.push(now);
    state.rates.tokens[tokenId] = prior;
  } else {
    const prior = prune(state.rates.players[uid], now, OTHER_WINDOW);
    if (prior.length >= LIMITS.otherPerPlayerPerMin) return { ok: false, reason: "Too many actions this minute." };
    prior.push(now);
    state.rates.players[uid] = prior;
  }
  room.push(now);
  state.rates.room = room;
  return { ok: true };
}

function project(name, payload, seq, uid, now) {
  const writes = {};
  if (name === "moveToken") {
    const tokenId = id(payload.tokenId);
    if (!tokenId) return { error: "Missing token." };
    writes["map/public/tokens/" + tokenId + "/pos"] = {
      x: num(payload.x), y: num(payload.y), seq, by: uid
    };
    const sceneId = id(payload.sceneId);
    if (sceneId) writes["map/public/tokens/" + tokenId + "/sceneId"] = sceneId;
    return { writes, tokenId };
  }
  if (name === "setTokenImage") {
    const tokenId = id(payload.tokenId);
    if (!tokenId) return { error: "Missing token." };
    writes["map/public/tokens/" + tokenId + "/image"] = payload.image == null ? "" : String(payload.image);
    writes["map/public/tokens/" + tokenId + "/imageSeq"] = seq;
    return { writes, tokenId };
  }
  if (name === "rollInitiative") {
    const playerId = id(payload.playerId || payload.key);
    if (!playerId) return { error: "Missing player." };
    writes["playerInit/" + playerId] = {
      ts: String(payload.ts || now),
      init: num(payload.init),
      name: String(payload.name || "").slice(0, 80),
      seq
    };
    return { writes, tokenId: "" };
  }
  if (name === "setInitiative") {
    writes["table/initiative/round"] = num(payload.round);
    writes["table/initiative/turn"] = payload.turn == null ? 0 : num(payload.turn);
    writes["table/initiative/started"] = !!payload.started;
    writes["table/initiative/turnSeq"] = num(payload.turnSeq);
    writes["table/initiative/actionSeq"] = seq;
    if (Object.prototype.hasOwnProperty.call(payload, "order")) writes["table/initiative/order"] = payload.order;
    return { writes, tokenId: "" };
  }
  if (name === "takeLoot") {
    const boxId = id(payload.boxId);
    const rowId = id(payload.rowId);
    if (!boxId || !rowId) return { error: "Missing loot row." };
    writes["referee/loot/" + boxId + "/" + rowId] = { by: uid, seq, at: now };
    return { writes, tokenId: "", hold: "takeLoot:" + boxId + ":" + rowId };
  }
  if (name === "setHp") {
    const subject = id(payload.id);
    if (!subject) return { error: "Missing HP row." };
    writes["encounter/hp/" + subject + "/hp"] = num(payload.hp);
    writes["encounter/hp/" + subject + "/maxHp"] = num(payload.maxHp);
    writes["encounter/hp/" + subject + "/seq"] = seq;
    return { writes, tokenId: "" };
  }
  return { error: "Unknown action." };
}

/* state is mutated only when the action is accepted.
   ctx: { uid, now, clientSeq } */
export function apply(raw, action, ctx) {
  const state = normalize(raw);
  const uid = id(ctx && ctx.uid);
  const now = num(ctx && ctx.now) || Date.now();
  if (!uid) return { ok: false, reason: "Sign in first.", state };
  const picked = pick(action);
  if (!picked || picked.error) {
    const billedEarly = charge(state, "other", "", uid, now);
    if (!billedEarly.ok) return { ok: false, reason: billedEarly.reason, state, persist: true };
    return { ok: false, reason: (picked && picked.error) || "Unknown action.", state, persist: true };
  }
  const clientSeq = num(ctx && ctx.clientSeq);
  const subject = picked.name + ":" + JSON.stringify(picked.payload.tokenId || picked.payload.playerId || picked.payload.id || picked.payload.boxId || "");
  const seenKey = uid + "|" + subject + "|" + clientSeq;
  if (clientSeq && state.seen[seenKey]) {
    return {
      ok: true,
      duplicate: true,
      seq: state.seen[seenKey],
      state,
      action: null,
      writes: {}
    };
  }
  const projected = project(picked.name, picked.payload, state.seq + 1, uid, now);
  if (projected.error) {
    const billedBad = charge(state, "other", "", uid, now);
    if (!billedBad.ok) return { ok: false, reason: billedBad.reason, state, persist: true };
    return { ok: false, reason: projected.error, state, persist: true };
  }
  if (projected.hold && state.holds[projected.hold]) {
    const billedHold = charge(state, picked.name, projected.tokenId, uid, now);
    if (!billedHold.ok) return { ok: false, reason: billedHold.reason, state, persist: true };
    return { ok: false, reason: "Already taken.", state, persist: true };
  }
  const billed = charge(state, picked.name, projected.tokenId, uid, now);
  if (!billed.ok) return { ok: false, reason: billed.reason, state, persist: true };
  state.seq += 1;
  if (projected.hold) state.holds[projected.hold] = state.seq;
  if (clientSeq) remember(state, seenKey, state.seq);
  const accepted = {
    name: picked.name,
    seq: state.seq,
    by: uid,
    payload: picked.payload,
    at: now
  };
  const writes = projected.writes;
  writes["referee/log/" + state.seq] = accepted;
  return { ok: true, state, action: accepted, writes, seq: state.seq };
}

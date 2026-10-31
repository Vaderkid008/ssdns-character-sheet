/* SSDNS Map module. One global. No URL, no storage, no channel. */
window.SSDNSTokenBorder = (function () {
  function side(token) {
    var kind = String((token && token.kind) || "").toLowerCase();
    if (kind === "enemy") return "enemy";
    if (kind === "friendly" || kind === "ally") return "friendly";
    if (kind === "player" || (token && token.ownerUid)) return "player";
    return "other";
  }
  function paint(ctx, token, x, y, r, color) {
    if (!ctx || !r) return side(token);
    var which = side(token);
    if (which === "player") {
      var gold = "#c9a227";
      var hi = "#f6e7b2";
      ctx.save();
      ctx.strokeStyle = gold;
      ctx.lineWidth = Math.max(3, r * 0.09);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
      var beads = Math.max(10, Math.round(r / 3.2));
      var br = Math.max(1.4, r * 0.055);
      var i;
      for (i = 0; i < beads; i++) {
        var a = (i / beads) * Math.PI * 2;
        ctx.beginPath();
        ctx.fillStyle = i % 2 ? hi : gold;
        ctx.arc(x + Math.cos(a) * r, y + Math.sin(a) * r, br, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = hi;
      ctx.lineWidth = Math.max(1.2, r * 0.035);
      for (i = 0; i < 4; i++) {
        var ang = (i / 4) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(ang) * (r - br), y + Math.sin(ang) * (r - br));
        ctx.lineTo(x + Math.cos(ang) * (r + br * 1.8), y + Math.sin(ang) * (r + br * 1.8));
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(x, y, Math.max(2, r - Math.max(5, r * 0.16)), 0, Math.PI * 2);
      ctx.strokeStyle = color || "#4a90d9";
      ctx.lineWidth = Math.max(1.25, r * 0.035);
      ctx.stroke();
      ctx.restore();
      return which;
    }
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.lineWidth = 3;
    if (which === "enemy") ctx.strokeStyle = (token && token.color) ? token.color : "#6e2430";
    else ctx.strokeStyle = color || "#888";
    ctx.stroke();
    ctx.restore();
    return which;
  }
  return { side: side, paint: paint };
})();
/* B13: Move mode is page-wide so the strip can toggle it before the map finishes booting.
   Default off. In a fight, green reach and click-to-walk follow this flag. Outside a fight
   the map still click-walks and this flag does not gate it. */
window.SSDNSMoveMode = (function () {
  var on = false;
  function paint() {
    if (typeof document === "undefined") return;
    var nodes = document.querySelectorAll("[data-tl-movemode]");
    var i;
    for (i = 0; i < nodes.length; i++) {
      nodes[i].classList.toggle("is-on", on);
      nodes[i].setAttribute("aria-pressed", on ? "true" : "false");
    }
  }
  function emit(why) {
    paint();
    try {
      window.dispatchEvent(new CustomEvent("ssdns:move-mode", { detail: { on: on, why: why || "" } }));
    } catch (e) {}
  }
  function set(next, why) {
    next = !!next;
    if (next === on) return on;
    on = next;
    emit(why || "set");
    return on;
  }
  if (typeof document !== "undefined") {
    document.addEventListener("click", function (e) {
      var t = e.target && e.target.closest && e.target.closest("[data-tl-movemode]");
      if (!t) return;
      if (t.getAttribute("aria-disabled") === "true" || t.classList.contains("turn-locked")) return;
      e.preventDefault();
      set(!on, "toggle");
    }, true);
  }
  return {
    isOn: function () { return on; },
    set: set,
    toggle: function () { return set(!on, "toggle"); }
  };
})();
/* N68: who sees the under-token HP bar. DM always (card, else the token's own numbers).
   A player sees their own PC when canControl is true. Everyone else sees a bar only
   from public revealed HP (reveal.hp). No HP pool never draws one. */
window.SSDNSMapBar = (function () {
  function num(v) {
    if (v == null || v === "") return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
  }
  function hp(info) {
    info = info || {};
    if (info.noHpPool === true) return null;
    var role = info.role === "dm" ? "dm" : "player";
    var cur = null;
    var max = null;
    if (role === "dm") {
      var haveCard = info.dmMax != null && info.dmMax !== "" && info.dmCur != null;
      if (haveCard) {
        cur = info.dmCur === "" ? 0 : num(info.dmCur);
        max = num(info.dmMax);
      } else {
        cur = num(info.tokenHp);
        max = num(info.tokenMax);
      }
    } else if (info.canControl) {
      cur = num(info.ownCur);
      max = num(info.ownMax);
    } else {
      var revealed = info.revealed || {};
      cur = num(revealed.hp);
      max = num(revealed.maxHp);
    }
    if (cur == null || max == null || !(max > 0)) return null;
    return { cur: cur, max: max };
  }
  return { hp: hp };
})();
window.SSDNSMap = { create(opts) {
  const el = opts.el;
  if (!el) throw new Error('SSDNSMap: el required');
  const role = opts.role === 'dm' ? 'dm' : 'player';
  el.classList.add(role === 'player' ? 'ssdns-role-player' : 'ssdns-role-dm');
  if (role === 'player') el.classList.add('ssdns-chat-side');
  const uid = opts.uid;
  if (!uid) throw new Error('SSDNSMap: uid required');
  const adapter = opts.adapter;
  const host = opts.host || {};
  const options = opts.options || {};
  if (!options.scene) throw new Error('SSDNSMap: options.scene required');
  const BASE_GRID = JSON.parse(JSON.stringify(options.scene.grid || { cols: 30, rows: 20, px: 70 }));
  function asset(src) {
    if (!src) return '';
    if (/^(https?:|data:|blob:|\/)/.test(src)) return src;
    return (options.assetBase || '') + src;
  }
  const listeners = [];
  const unsubs = [];
  const seenSeq = {};
  let raf = 0, animRaf = 0, dead = false;

  function q(name) { return el.querySelector('[data-act="' + name + '"]'); }
  function on(target, ev, fn, opt) { target.addEventListener(ev, fn, opt); listeners.push([target, ev, fn, opt]); }
  function emit(name, detail) {
    el.dispatchEvent(new CustomEvent(name, { detail }));
    if (host.on) host.on(name, detail);
  }
  function requestDraw() { if (raf || dead) return; raf = requestAnimationFrame(() => { raf = 0; if (!dead) draw(); }); }
  function toast(msg) {
    let t = q('toast');
    if (!t) { t = document.createElement('div'); t.setAttribute('data-act', 'toast'); t.style.cssText = 'position:absolute;bottom:16px;left:50%;transform:translateX(-50%);background:rgba(180,60,60,.95);color:#fff;padding:8px 16px;border-radius:6px;z-index:20;font-size:14px;'; el.appendChild(t); }
    t.textContent = msg; t.style.display = 'block';
    setTimeout(() => { if (t) t.style.display = 'none'; }, 2200);
  }
  function newer(path, seq) {
    if (!seq) return true;
    if (seenSeq[path] && seq < seenSeq[path]) return false;
    seenSeq[path] = seq;
    return true;
  }
  function write(path, value) {
    const seq = Date.now();
    if (!newer(path, seq)) return;
    if (adapter && adapter.write) adapter.write(path, value, { seq, by: uid });
  }
  function postSlide(id, points) { write('map/public/events/slide', { id, points, seq: Date.now() }); }
  function postPing(ping) { write('map/public/events/ping', ping); }
  function postScenes() { write('map/public/playerScenes', shared.playerScenes || {}); }
  function postGrant(t) { write('map/public/tokens/' + t.id, publicToken(t)); }

  let shared = { tokens: {}, playerScenes: {}, scenes: {}, fogRevealed: false };

  function publicToken(t) {
    if (!t || t.hidden) return null;
    if (t.kind === 'asset' && t.asset && t.asset.hiddenFromPlayers) return null;
    const pubAsset = (t.kind === 'asset' && window.SSDNSAssetLibrary && window.SSDNSAssetLibrary.publicAsset)
      ? window.SSDNSAssetLibrary.publicAsset(t) : null;
    return {
      id: t.id,
      pos: t.pos ? { x: t.pos.x, y: t.pos.y } : { x: 0, y: 0 },
      color: t.color || '', torch: !!t.torch, status: t.status || '',
      lights: Array.isArray(t.lights) ? t.lights.map(l => Object.assign({}, l)) : [],
      darkvision: Number(t.darkvision) || 0, skulker: !!t.skulker, devilsSight: !!t.devilsSight,
      facing: Number(t.facing) || 0, dmDoused: !!t.dmDoused,
      conditions: t.conditions ? [...t.conditions] : [],
      sceneId: t.sceneId || activeSceneId() || 'scn_dustyspur01', image: t.image || '',
      veil: !!t.veil,
      ownerUid: t.ownerUid || '', controlledBy: t.controlledBy || [],
      ownerCanMove: t.ownerCanMove !== false, locked: !!t.locked,
      label: t.label || t.name || '', size: t.size || 1, name: t.name || '',
      kind: t.kind || '', lootBoxId: t.lootBoxId || '',
      spellPiece: t.spellPiece || '', zoneId: t.zoneId || '',
      noHpPool: !!t.noHpPool, notTargetable: !!t.notTargetable, noInit: !!t.noInit,
      assetDefId: t.assetDefId || '', asset: pubAsset,
      moveFeet: t.moveFeet != null && t.moveFeet !== '' ? Number(t.moveFeet) : null,
      /* Fight-row gear is not a token field. */
      lootLock: t.kind === 'chest' && t.loot ? {
        name: t.loot.name || '', boxType: t.loot.boxType || '',
        lock: t.loot.lock || null, barrier: t.loot.barrier || null,
        hidden: !!t.loot.hidden, found: t.loot.found !== false, hideDc: t.loot.hideDc || 0,
        trap: t.loot.trap || null
      } : null
    };
  }
  function saveToken(id) {
    if (role !== 'dm') return;
    const t = shared.tokens && shared.tokens[id];
    if (!t) return;
    const pub = publicToken(t);
    if (pub) write('map/public/tokens/' + id, pub);
    else if (adapter && adapter.remove) adapter.remove('map/public/tokens/' + id);
    write('map/dm/tokens/' + id, JSON.parse(JSON.stringify(t, (k, v) => k === '_img' ? undefined : v)));
    if (typeof autosave === 'function') autosave();
  }
  function saveScene(sceneId) {
    if (role !== 'dm') return;
    // 0.3.54: default to the scene the DM is looking at (was always the Dusty Spur).
    const sid = sceneId || (typeof activeSceneId === 'function' ? activeSceneId() : '') || (state && state.scene && state.scene.id) || 'scn_dustyspur01';
    const data = (shared.scenes && shared.scenes[sid]) || {};
    write('map/public/scenes/' + sid, data);
    write('map/dm/scenes/' + sid, data);
    if (typeof autosave === 'function') autosave();
  }
  function saveShared() {
    // seed only
    if (role !== 'dm') return;
    Object.keys(shared.tokens || {}).forEach(saveToken);
    Object.keys(shared.scenes || {}).forEach(saveScene);
    write('map/public/playerScenes', shared.playerScenes || {});
  }
  function publishPlayerMove(token) {
    if (!token || role !== 'player') return;
    const pos = { x: token.pos.x, y: token.pos.y, by: uid, seq: Date.now() };
    write('map/public/tokens/' + token.id + '/pos', pos);
  }
  function publishPlayerPatch(token, patch) {
    if (!token || role !== 'player') return;
    const safe = { seq: Date.now(), by: uid };
    if (patch && patch.color != null) safe.color = String(patch.color);
    if (patch && patch.label != null) safe.label = String(patch.label);
    if (patch && patch.veil != null) safe.veil = !!patch.veil;
    if (patch && patch.lights) safe.lights = patch.lights;
    if (patch && patch.darkvision != null) safe.darkvision = Number(patch.darkvision) || 0;
    if (patch && patch.skulker != null) safe.skulker = !!patch.skulker;
    if (patch && patch.devilsSight != null) safe.devilsSight = !!patch.devilsSight;
    if (patch && patch.facing != null) safe.facing = Number(patch.facing) || 0;
    write('map/public/tokens/' + token.id + '/patch', safe);
  }
  // About 6 Hz. Inside the 5–8 Hz cap, and only when the cell changed.
  const STREAM_MS = 160;
  let streamAt = 0;
  let streamTimer = 0;
  const streamSent = {};
  function dragTokenIds() {
    if (!state.drag || !state.drag.token || state.offline) return [];
    const ids = state.selectedIds && state.selectedIds.length ? state.selectedIds.slice() : [state.drag.token.id];
    if (ids.indexOf(state.drag.token.id) < 0) ids.push(state.drag.token.id);
    return ids;
  }
  function streamChangedIds() {
    const out = [];
    dragTokenIds().forEach(id => {
      const t = state.tokens.find(tok => tok && tok.id === id);
      if (!t || !t.pos || !canControl(t)) return;
      const key = t.pos.x + ',' + t.pos.y;
      if (streamSent[id] === key) return;
      out.push(t);
    });
    return out;
  }
  function writeStreamToken(t) {
    if (!t) return;
    streamSent[t.id] = t.pos.x + ',' + t.pos.y;
    if (role === 'player') {
      publishPlayerMove(t);
      return;
    }
    if (!shared.tokens[t.id]) return;
    shared.tokens[t.id].pos = { x: t.pos.x, y: t.pos.y, by: uid, ts: Date.now() };
    if (t.hidden || shared.tokens[t.id].hidden) {
      write('map/dm/tokens/' + t.id, JSON.parse(JSON.stringify(shared.tokens[t.id], (k, v) => k === '_img' ? undefined : v)));
      return;
    }
    saveToken(t.id);
  }
  function sendStream(list) {
    (list || []).forEach(writeStreamToken);
    streamAt = Date.now();
  }
  function clearStreamTimer() {
    if (!streamTimer) return;
    clearTimeout(streamTimer);
    streamTimer = 0;
  }
  function streamDrag() {
    if (state.offline || !state.drag || !state.drag.token) return;
    const pending = streamChangedIds();
    if (!pending.length) return;
    const now = Date.now();
    if (streamAt && now - streamAt < STREAM_MS) {
      if (!streamTimer) {
        streamTimer = setTimeout(() => {
          streamTimer = 0;
          if (state.offline || !state.drag || !state.drag.token) return;
          const again = streamChangedIds();
          if (again.length) sendStream(again);
        }, STREAM_MS);
      }
      return;
    }
    clearStreamTimer();
    sendStream(pending);
  }
  function applyPublic(pub) {
    if (!pub) return;
    shared.tokens = pub.tokens || shared.tokens;
    shared.playerScenes = pub.playerScenes || shared.playerScenes;
    shared.scenes = pub.scenes || shared.scenes;
    if (state && state.tokens) {
      if (role === 'player') state.tokens = Object.values(shared.tokens);
      applySharedToTokens();
    }
    requestDraw();
  }

async function load() {
  const scene = options.scene;
  if (!scene) throw new Error('SSDNSMap: options.scene required');
  const roomData = options.room || { table: { initiative: { order: [], turn: 0 } } };
  if (role === 'dm') {
    const tokensData = options.tokens || { tokens: {} };
    if (!Object.keys(shared.tokens).length && tokensData.tokens) {
      shared.tokens = JSON.parse(JSON.stringify(tokensData.tokens));
      saveShared();
    }
    return { scene, tokens: Object.values(shared.tokens), room: roomData };
  }
  return { scene, tokens: Object.values(shared.tokens || {}), room: roomData };
}

function applySharedToTokens() {
  for (const t of state.tokens) {
    const s = shared.tokens[t.id];
    if (s) {
      t.pos = { ...s.pos };
      t.hidden = !!s.hidden;
      t.locked = !!s.locked;
      t.controlledBy = s.controlledBy || t.controlledBy || [];
      t.ownerCanMove = s.ownerCanMove !== false;
      t.color = s.color || t.color;
      if (s.label) t.label = s.label;
      t.torch = !!s.torch;
      if (Array.isArray(s.lights)) t.lights = s.lights.map(l => Object.assign({}, l));
      if (s.darkvision != null) t.darkvision = Number(s.darkvision) || 0;
      if (s.skulker != null) t.skulker = !!s.skulker;
      if (s.facing != null) t.facing = Number(s.facing) || 0;
      if (s.dmDoused != null) t.dmDoused = !!s.dmDoused;
      if (s.dmDarkvision != null && s.dmDarkvision !== '') t.dmDarkvision = Number(s.dmDarkvision) || 0;
      if (s.dmTorch != null) t.dmTorch = !!s.dmTorch;
      t.status = s.status || '';
      t.conditions = s.conditions ? [...s.conditions] : [];
      stampScene(t, s);
      if ((s.kind === 'asset' || t.kind === 'asset') && s.image && s.image !== t.image) t._img = null;
      t.image = s.image || t.image || '';
      t.veil = !!s.veil;
      t.sheetId = s.sheetId || t.sheetId || '';
      if (s.ownerUid) t.ownerUid = s.ownerUid;
      if (s.combatantId) t.combatantId = s.combatantId;
      if (s.kind) t.kind = s.kind;
      if (s.spellPiece) t.spellPiece = s.spellPiece;
      if (s.zoneId) t.zoneId = s.zoneId;
      if (s.noHpPool) t.noHpPool = true;
      if (s.notTargetable) t.notTargetable = true;
      if (s.noInit) t.noInit = true;
      if (s.kind === 'asset' || s.asset) {
        t.kind = 'asset';
        if (s.asset) t.asset = s.asset;
        if (s.assetDefId) t.assetDefId = s.assetDefId;
        if (s.size) t.size = tokSquares(s.size);
        if (s.asset && s.asset.targetable) t.notTargetable = false;
        else if (s.notTargetable) t.notTargetable = true;
      }
      if (s.moveFeet != null && s.moveFeet !== '') t.moveFeet = Number(s.moveFeet) || 0;
      if (s.spellPiece && s.size) t.size = tokSquares(s.size);
      if (s.name) t.name = s.name;
      if (s.lootBoxId) t.lootBoxId = s.lootBoxId;
      if (s.lootLock && (!t.loot || !t.loot.id)) t.loot = Object.assign({ id: s.lootBoxId || t.lootBoxId || '' }, s.lootLock);
      else if (s.loot && s.loot.id && (!t.loot || !t.loot.id)) t.loot = s.loot;
      if (t.image && !t._img) loadTokenImage(t);
    }
  }
}

// --- map state ---
/* 0.3.67: target picker values. 'Free shot' fires with no target; 'No target' is an explicit choice. */
const FREE_SHOT = '__free';
const NO_TARGET = '__none';
const state = {
  scene: null,
  tokens: [],
  room: null,
  view: { x: 0, y: 0, zoom: 1 },
  drag: null,
  selected: null,
  selectedIds: [],
  fogMode: null,
  fogStart: null,
  tool: null, // 'ping' | 'ruler'
  ruler: null,
  pings: [],
  showPlayerFov: true,
  undoStack: [],
  redoStack: [],
  /* Ghost Plan retired (BG3 movement). The flag stays so old drag branches cannot come back on. */
  offline: false,
  ghostPlan: false,
  moveHover: null,
  moveConfirm: { mode: "click", pending: null },
  moveReachKey: "",
  moveReach: null,
  snap: true,
  showWalls: true,
  /* N59: Door tool modifier. On, a click hides that door from players until it is revealed. */
  secretDoor: false,
  pendingMoves: [],
  gridStrength: 1.0,
  minStrength: 1.0,
  currentTurnId: null,
  showRange: false,
  /* Yellow bright / blue dim / gray darkvision measurement strokes. Off: lighting wash and FOV stay, the rings do not. DM only. */
  showLightRings: false,
  /* B13: in a fight, green reach and click-to-walk are off until the strip Move chip is on.
     Outside a fight this flag is ignored and click-to-move stays free. Edit tokens bypasses it. */
  moveMode: false,
  /* DM "Edit tokens". Off by default. Persisted only for the DM role (ssdns.map.dmEdit). */
  dmEdit: false,
  rangeWeaponId: "",
  rangeChoices: [],
  rangeMoved: {},
  playerTarget: "",
  drawerOpen: false,
  drawerTokenId: null,
  drawerOffhand: false,
  drawerFan: false,
  pendingTarget: null,
  spellZones: [],
  spellZonesLive: false,
  zoneSeq: 0,
  /* Ids a DM expiry or Clear already removed. A later sheet sync cannot put that instance back. */
  zoneGone: {},
  role,
  uid,
  chat: [],
  initiative: null
};
if (window.SSDNSMoveMode && window.SSDNSMoveMode.isOn()) state.moveMode = true;
/* DM-only. A player map never reads this key, even if the same browser stored it. */
if (role === 'dm') {
  try { state.dmEdit = localStorage.getItem('ssdns.map.dmEdit') === '1'; } catch (e) {}
}

const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d');
el.appendChild(canvas);
/* attack-fx: overlay above the tokens; pointer events pass through to the map canvas */
const fxCanvas = document.createElement('canvas');
fxCanvas.className = 'ssm-fx';
fxCanvas.setAttribute('aria-hidden', 'true');
let fxCtx = null;
try { fxCtx = fxCanvas.getContext('2d'); } catch (e) { fxCtx = null; }
el.appendChild(fxCanvas);

const toolbar = document.createElement('div');
toolbar.className = 'ssdns-toolbar';
toolbar.innerHTML = `
  <span data-act="roleBadge">${role === 'player' ? 'Player' : role.toUpperCase()}</span>
  <label>Grid <input data-act="strength" type="range" min="1" max="3" step="0.1" value="1"></label>
  <button data-act="helpBtn">?</button>
  <span data-act="zoomLabel">1.00×</span>
  <button data-act="reset">Reset view</button>
  <button data-act="fxBtn" type="button" class="ssm-fx-btn" title="Attack effects on the map (firing lines). Saved for you on this device.">Effects: ON</button>
  ${role === 'dm' ? `<button data-act="challengeBtn" type="button" class="ssm-challenge" title="Challenge picked players. Same check picker as the DMCC bar.">Challenge</button>` : ``}
  ${role === 'dm' ? `
    <button data-act="fogBtn" class="active">Fog: ON</button>
    <button data-act="showFovBtn" class="active">Show Player FOV: ON</button>
    <button data-act="mapsBtn" class="ssm-maps-btn" title="Maps: built-in, my maps, world">Maps ▾</button>
    <button data-act="assetsBtn" class="ssm-maps-btn" title="Asset library for this room">Assets</button>
    <select data-act="sceneSelect" hidden aria-hidden="true"></select>
    <button data-act="myViewBtn">My view</button>
    <button data-act="setFloorBtn">Set floor</button>
    <button data-act="dmEditBtn" type="button" aria-pressed="false" title="Free-move any token. Walls, reach, and Move feet are ignored. Off keeps click-to-walk.">Edit tokens</button>
    <button data-act="showSceneBtn">Show to players</button>
    <button data-act="importWallsBtn">Import Walls</button>
  ` : ``}
`;
el.appendChild(toolbar);
const toolbarMain = document.createElement('div');
toolbarMain.className = 'ssm-toolbar-main';
const moveTools = toolbar.querySelector('[data-act="moveTools"]');
while (toolbar.firstChild && toolbar.firstChild !== moveTools) toolbarMain.appendChild(toolbar.firstChild);
toolbar.insertBefore(toolbarMain, toolbar.firstChild);
if (window.SSDNSDice && window.SSDNSDice.mount) {
  const diceBar = document.createElement('div');
  diceBar.className = 'dice-bar dice-bar-map';
  diceBar.setAttribute('data-act', 'diceLane');
  el.appendChild(diceBar);
  window.SSDNSDice.mount(diceBar);
}
/* 0.3.68: the DMCC Fight tab's Range picker and this drawer's share one override */
if (role === 'dm' && window.SSDNSRangeRings && window.SSDNSRangeRings.onOverride) {
  const offOverride = window.SSDNSRangeRings.onOverride(next => {
    if (!el.isConnected) { offOverride(); return; }
    state.rangeOverride = next;
    if (q('drawer')) renderDrawer();
    draw();
  });
}
on(document, 'keydown', e => {
  if (e.key === 'Escape' && state.blast) {
    e.preventDefault();
    cancelBlast();
    return;
  }
  if (role === 'dm' && e.key === 'Escape' && state.pendingTarget) {
    e.preventDefault();
    cancelPendingTarget();
    return;
  }
  /* B13: Esc leaves Move mode even when the strip, not the canvas, has focus. A fog polygon
     in progress and a text field keep Esc for themselves. */
  if (e.key === 'Escape' && state.moveMode && fightOn()) {
    const tag = e.target && e.target.tagName;
    const typing = tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA';
    const poly = role === 'dm' && (state.tool === 'reveal' || state.tool === 'hide') && state.fogKind === 'poly' && state.polyPoints && state.polyPoints.length;
    if (!typing && !poly) {
      e.preventDefault();
      if (window.SSDNSMoveMode) window.SSDNSMoveMode.set(false, 'esc');
      return;
    }
  }
  if (!el.matches(':hover') && !el.contains(e.target)) return;
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA')) return;
  if (role === 'dm' && (state.tool === 'reveal' || state.tool === 'hide') && state.fogKind === 'poly' && state.polyPoints && state.polyPoints.length) {
    if (e.key === 'Escape') {
      e.preventDefault();
      state.polyPoints = [];
      state.polyHover = null;
      draw();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      commitPoly();
      return;
    }
    if (e.key === 'Backspace') {
      e.preventDefault();
      e.stopImmediatePropagation();
      state.polyPoints.pop();
      draw();
      return;
    }
  }
  if (e.key === 'Escape') {
    if (state.placeAsset) {
      e.preventDefault();
      state.placeAsset = null;
      toast('Place cancelled');
      applyCursor();
      return;
    }
    if (state.moveHover || (state.moveConfirm && state.moveConfirm.pending)) {
      e.preventDefault();
      clearMovePreview();
      return;
    }
  }
  if (e.key === 'Shift' && state.drag && state.drag.token && state.ghostPlan) { dropPin(); return; }
  if (e.key === 'Backspace' && state.drag && state.drag.pins && state.ghostPlan) { e.preventDefault(); popPin(); return; }
  if (e.key.toLowerCase() === 'x' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); recallPath(); }
});
const chatdock = document.createElement('div');
chatdock.className = 'ssdns-chatdock';
chatdock.innerHTML = `<div class="ssdns-chathead"><button type="button" data-act="chatToggle" aria-expanded="true" title="Minimize chat"><span class="ssm-chat-label">Chat</span> <span data-act="chatCaret" aria-hidden="true">▾</span> <span data-act="chatBadge" class="ssm-chatbadge" hidden>0</span></button><span data-act="chatFilters"><button type="button" data-chat-filter="all" class="on">All</button><button type="button" data-chat-filter="rolls">Rolls</button><button type="button" data-chat-filter="talk">Talk</button></span><span class="name-mode" role="group" aria-label="Show names as"><button type="button" data-name-mode="character">Character</button><button type="button" data-name-mode="player">Player</button></span><button type="button" data-act="chatPop">Pop out</button><button type="button" data-act="chatWindow" class="ssm-chat-tab">Open in new tab</button><button type="button" data-act="chatDock" hidden>Dock</button></div><p class="ssdns-chatnote" data-act="chatPopNote" hidden></p><div data-act="chatlog"></div><div data-act="chatrow"><input data-act="chatInput" placeholder="Chat or /roll"><button type="button" data-act="chatSend">Send</button></div>`;
el.appendChild(chatdock);
/* DM bottom chat: drag the top edge to resize (saved per device). */
const CHAT_H_KEY = 'ssdns.map.chatHeight.' + (role === 'dm' ? 'dm' : 'player');
function applyChatHeight(px) {
  const log = chatdock.querySelector('[data-act="chatlog"]');
  if (!log) return;
  const h = Math.max(60, Math.min(640, Math.round(Number(px) || 0)));
  if (!Number(px)) { log.style.maxHeight = ''; log.style.height = ''; return; }
  log.style.maxHeight = h + 'px';
  log.style.height = h + 'px';
  chatdock.setAttribute('data-chat-height', String(h));
}
if (role === 'dm') {
  const grip = document.createElement('div');
  grip.className = 'ssm-chat-grip';
  grip.setAttribute('data-act', 'chatResize');
  grip.setAttribute('role', 'separator');
  grip.setAttribute('aria-label', 'Drag to resize chat');
  grip.title = 'Drag to resize chat (double-click to reset)';
  chatdock.insertBefore(grip, chatdock.firstChild);
  try { const saved = Number(localStorage.getItem(CHAT_H_KEY)); if (saved) applyChatHeight(saved); } catch (e) {}
  let dragY = null;
  let startH = 0;
  grip.addEventListener('pointerdown', (e) => {
    const log = chatdock.querySelector('[data-act="chatlog"]');
    dragY = e.clientY;
    startH = (log && log.getBoundingClientRect().height) || Number(chatdock.getAttribute('data-chat-height')) || 140;
    try { grip.setPointerCapture(e.pointerId); } catch (err) {}
    e.preventDefault();
  });
  grip.addEventListener('pointermove', (e) => {
    if (dragY == null) return;
    applyChatHeight(startH + (dragY - e.clientY));
  });
  const endDrag = () => {
    if (dragY == null) return;
    dragY = null;
    try { localStorage.setItem(CHAT_H_KEY, chatdock.getAttribute('data-chat-height') || ''); } catch (e) {}
  };
  grip.addEventListener('pointerup', endDrag);
  grip.addEventListener('pointercancel', endDrag);
  grip.addEventListener('dblclick', () => {
    applyChatHeight(0);
    chatdock.removeAttribute('data-chat-height');
    try { localStorage.removeItem(CHAT_H_KEY); } catch (e) {}
  });
}
state.chatFilter = 'all';
state.chatOpen = true;
state.chatSeen = 0;
let mapClearKey = "";
function logRowHidden(row) {
  return !!(window.SSDNSTableLog && window.SSDNSTableLog.hidden && window.SSDNSTableLog.hidden(row && row.ts));
}
function mapClearMark() {
  if (!window.SSDNSTableLog || !window.SSDNSTableLog.clearedAt) return "";
  const v = window.SSDNSTableLog.clearedAt();
  return v == null || v === "" ? "" : String(v);
}
try {
  const savedFilter = localStorage.getItem('ssdns.map.chatFilter');
  if (savedFilter === 'rolls' || savedFilter === 'talk' || savedFilter === 'all') state.chatFilter = savedFilter;
  const Equip = window.SSDNSEquip;
  const chatKey = role === 'dm' ? 'ssdns.map.chatOpen.dm' : 'ssdns.map.chatOpen.player';
  if (Equip && Equip.readChatOpen) state.chatOpen = Equip.readChatOpen(localStorage, role);
  else {
    const specific = localStorage.getItem(chatKey);
    if (specific === '0' || specific === '1') state.chatOpen = specific === '1';
    else if (localStorage.getItem('ssdns.map.chatOpen') === '0' || localStorage.getItem('ssdns.map.chatOpen') === '1') {
      state.chatOpen = localStorage.getItem('ssdns.map.chatOpen') === '1';
      localStorage.setItem(chatKey, state.chatOpen ? '1' : '0');
    }
  }
  /* Player desktop dock remembers open/closed on its own key. Older chatOpen keys still apply when it is unset. */
  if (role === 'player') {
    const dockState = localStorage.getItem('ssdns.map.chatDock');
    if (dockState === 'open' || dockState === 'closed') state.chatOpen = dockState === 'open';
  }
} catch (e) {}
/* A private line (dockTo / to other than the whole table) stays off a player's map and popup. */
function audienceOk(row) {
  if (role === 'dm' || !row) return true;
  const to = row.to || row.dockTo;
  return !to || to === 'all' || to === uid;
}
function chatBucket(row) {
  if (!row || row.kind === 'sfx') return '';
  if (row.kind === 'roll' || row.kind === 'rolls' || row.attack) return 'rolls';
  const text = String(row.text || '');
  if (/\bd20\b/.test(text) || /→\s*(HIT|MISS|CRIT)/.test(text)) return 'rolls';
  return 'talk';
}
function paintRoleBadge() {
  const badge = q('roleBadge');
  if (!badge) return;
  if (role !== 'player') {
    badge.textContent = 'DM';
    return;
  }
  let player = '';
  let character = '';
  try {
    const doc = window.SSDNSApp && window.SSDNSApp.doc && window.SSDNSApp.doc();
    const c = doc && doc.character;
    if (c) {
      player = String(c.player || '').trim();
      character = String(c.name || '').trim();
    }
  } catch (e) {}
  if (!character && host.displayName) {
    const shown = String(host.displayName(uid) || '').trim();
    if (shown && shown !== uid) character = shown;
  }
  if (!player && Array.isArray(options.players)) {
    const row = options.players.filter(p => p && (p.uid === uid || p.id === uid))[0];
    const named = row && String(row.name || '').trim();
    if (named && named !== uid) player = named;
  }
  const bits = [];
  [player, character].forEach(bit => {
    if (!bit || bit === uid) return;
    if (bits.indexOf(bit) < 0) bits.push(bit);
  });
  badge.textContent = bits.join(' · ') || 'Player';
}
function chatName(row) {
  return row.fromName || row.who || (host.displayName ? host.displayName(row.from) : row.from) || '';
}
function publishTokenColors() {
  const bag = {};
  (state.tokens || []).forEach(t => {
    if (!t || !t.color) return;
    if (t.hidden && role !== 'dm') return;
    [t.name, t.label, t.ownerUid].forEach(key => {
      const id = String(key || '').trim().toLowerCase();
      if (id) bag[id] = String(t.color);
    });
  });
  window.SSDNSTokenColors = bag;
}
function chatLineHtml(row) {
  const name = chatName(row);
  let text = String(row.text || '');
  /* 0.3.80: an older single-die row "d4 1d4 = 4 (4)" shows as "1d4 = 4" (Jessey's UI notes) */
  if (row && row.kind === 'roll' && window.SSDNSDice && window.SSDNSDice.tidySingle) text = window.SSDNSDice.tidySingle(text);
  const Applied = window.SSDNSApplied;
  if (Applied && Applied.rewriteSpeaker) text = Applied.rewriteSpeaker(text, row || {});
  const shown = (Applied && Applied.chosenName && row && !Applied.neutralSpeaker(name) && Applied.chosenName(row)) || name;
  const bucket = chatBucket(row);
  const startsWithName = !!(shown && (text === shown || text.indexOf(shown + ' ') === 0 || text.indexOf(shown + ':') === 0 || text.indexOf(shown + '\n') === 0));
  let html;
  if (Applied && Applied.leadNameHtml && (bucket === 'rolls' || startsWithName)) html = Applied.leadNameHtml(shown && text.indexOf(shown) !== 0 ? (shown + ': ' + text) : text);
  else if (Applied && Applied.whoHtml) html = Applied.whoHtml(shown) + ': ' + esc(text);
  else html = esc(shown + ': ' + text);
  if (window.SSDNSDice && window.SSDNSDice.lead) return window.SSDNSDice.lead(row, html);
  return html;
}
function renderChat() {
  publishTokenColors();
  const log = q('chatlog');
  if (!log) return;
  const rows = (state.chat || []).filter(row => {
    if (logRowHidden(row)) return false;
    const bucket = chatBucket(row);
    if (!bucket) return false;
    if (state.chatFilter === 'rolls') return bucket === 'rolls';
    if (state.chatFilter === 'talk') return bucket === 'talk';
    return true;
  });
  log.innerHTML = rows.map(row => '<div class="ssm-chatline">' + chatLineHtml(row) + '</div>').join('');
  log.scrollTop = log.scrollHeight;
  chatdock.classList.toggle('ssm-chat-shut', !state.chatOpen);
  const toggle = q('chatToggle');
  if (toggle) {
    toggle.setAttribute('aria-expanded', state.chatOpen ? 'true' : 'false');
    toggle.title = state.chatOpen ? 'Minimize chat' : 'Restore chat';
  }
  const caret = q('chatCaret');
  if (caret) caret.textContent = state.chatOpen ? '▾' : (role === 'dm' ? '▲' : '▸');
  document.querySelectorAll('[data-chat-filter]').forEach(btn => {
    if (btn.closest && btn.closest('.ssdns-map') !== el && !el.contains(btn)) return;
    btn.classList.toggle('on', btn.getAttribute('data-chat-filter') === state.chatFilter);
  });
  const badge = q('chatBadge');
  const listed = (state.chat || []).filter(row => !logRowHidden(row) && chatBucket(row));
  const countable = listed.filter(row => !window.SSDNSTableLog || window.SSDNSTableLog.countsAsUnread(row.ts));
  const clearMark = mapClearMark();
  if (clearMark !== mapClearKey) {
    mapClearKey = clearMark;
    state.chatSeen = countable.length;
  } else if (state.chatOpen) state.chatSeen = countable.length;
  const unread = Math.max(0, countable.length - state.chatSeen);
  if (badge) {
    badge.hidden = unread < 1;
    badge.textContent = role === 'dm' && !state.chatOpen ? '(' + unread + ' new)' : String(unread);
  }
  syncChatPop();
}
if (!el._nameMode) {
  el._nameMode = true;
  window.addEventListener('ssdns-name-mode', () => { if (el.isConnected) renderChat(); });
}
paintRoleBadge();
function pushFeed(row) {
  if (row && row.event === 'zone') { applyZoneFeed(row); return; }
  if (row && row.event === 'asset') {
    try { applyAssetRequest(row); } catch (eAsset) {}
    if (!row || row.kind === 'sfx') return;
  }
  if (row && row.event === 'asset-sfx') {
    try { playAssetSfx(row.sfxUrl, row.from); } catch (eSfx) {}
    return;
  }
  if (row && row.zoom && window.SSDNSD20Zoom && window.SSDNSD20Zoom.play) {
    try { window.SSDNSD20Zoom.play(row.zoom); } catch (eZoom) {}
  } else if (row && row.die && window.SSDNSD20Zoom && window.SSDNSD20Zoom.present) {
    var dieTs = Date.parse(row.ts || "");
    if (!dieTs || Date.now() - dieTs < 20000) {
      try { window.SSDNSD20Zoom.present(row.die); } catch (eDie) {}
    }
  }
  if (row && (row.fx || row.fxReq)) { try { fxFromFeed(row); } catch (e) {} }
  if (!row || row.kind === 'sfx') { if (row && host.sfx) host.sfx(row); return; }
  if (!audienceOk(row)) return;
  state.chat = state.chat || [];
  state.chat.push(row);
  if (state.chat.length > 100) {
    const drop = state.chat.length - 100;
    state.chat.splice(0, drop);
    state.chatSeen = Math.max(0, state.chatSeen - drop);
  }
  if (state.chatOpen) state.chatSeen = state.chat.filter(chatBucket).length;
  renderChat();
}
function setChat(rows) {
  state.chat = (rows || []).filter(row => row && row.kind !== 'sfx' && audienceOk(row));
  state.chatSeen = state.chat.filter(chatBucket).length;
  renderChat();
}
function pushChat(row) { pushFeed(row); }
function setChatFilter(next) {
  if (next !== 'all' && next !== 'rolls' && next !== 'talk') return;
  const changed = state.chatFilter !== next;
  state.chatFilter = next;
  try { localStorage.setItem('ssdns.map.chatFilter', next); } catch (e) {}
  renderChat();
  if (changed && chatUi && chatUi.setFilter) chatUi.setFilter(next);
}
function reflowAfterChat() {
  if (role !== 'player') return;
  requestAnimationFrame(() => {
    resize();
    requestDraw();
  });
}
function setChatOpen(open) {
  state.chatOpen = !!open;
  if (state.chatOpen) state.chatSeen = (state.chat || []).filter(chatBucket).length;
  try {
    const Equip = window.SSDNSEquip;
    if (Equip && Equip.writeChatOpen) Equip.writeChatOpen(localStorage, role, state.chatOpen);
    else localStorage.setItem(role === 'dm' ? 'ssdns.map.chatOpen.dm' : 'ssdns.map.chatOpen.player', state.chatOpen ? '1' : '0');
    if (role === 'player') localStorage.setItem('ssdns.map.chatDock', state.chatOpen ? 'open' : 'closed');
  } catch (e) {}
  renderChat();
  reflowAfterChat();
}

function refreshSelectedPanel() {
  if (role !== 'dm') return;
  const list = q('targetList');
  const actions = q('actionList');
  if (!list) return;
  const t = state.selected;
  if (!t) {
    list.textContent = 'None';
    if (actions) actions.textContent = 'Select a token';
    return;
  }
  const who = [];
  if (t.ownerUid && t.ownerCanMove !== false) who.push(t.ownerUid + ' (owner)');
  if (t.ownerUid && t.ownerCanMove === false) who.push(t.ownerUid + ' locked out');
  (t.controlledBy || []).forEach(u => { if (u !== t.ownerUid) who.push(u); });
  list.textContent = (t.label || t.name || t.id) + (who.length ? ' — ' + who.join(', ') : '');
  if (actions) actions.textContent = 'Actions for ' + (t.label || t.name || t.id);
}
function sendChat() {
  const input = q('chatInput');
  if (!input || !input.value.trim()) return;
  const text = input.value.trim();
  input.value = '';
  emit('chat:send', { text });
}
function mapChatItems() {
  return (state.chat || []).filter(row => row && row.kind !== 'sfx' && audienceOk(row) && !logRowHidden(row)).map(row => {
    const crit = !!row.crit || Number(row.nat) === 20;
    const attack = row.kind === 'roll' || !!row.attack;
    return {
      id: row.id,
      kind: row.kind || 'chat',
      who: row.fromName || row.who || (host.displayName ? host.displayName(row.from) : row.from) || '',
      text: row.text || '',
      ts: row.ts,
      tag: row.tag || (crit ? 'CRITICAL' : (attack ? 'ATTACK' : '')),
      cls: row.cls || (crit ? 'roll-crit' : (attack ? 'roll-attack' : ''))
    };
  });
}
let chatUi = null;
function syncChatPop() {
  if (!chatUi) return;
  chatUi.setMapItems(mapChatItems());
}
if (window.SSDNSMapChat) {
  chatUi = window.SSDNSMapChat.attach({
    root: el,
    dm: role === "dm",
    onClear: function () {
      if (window.DMCC && window.DMCC.clearTableLog) window.DMCC.clearTableLog();
    },
    send: function (text) {
      const input = q('chatInput');
      if (!input) return;
      input.value = text;
      sendChat();
    },
    onMode: function (open, mode, extra) {
      el.classList.toggle('ssdns-chat-popped', !!open);
      reflowAfterChat();
      const popBtn = q('chatPop');
      const dockBtn = q('chatDock');
      const note = q('chatPopNote');
      if (popBtn) popBtn.hidden = !!open;
      if (dockBtn) dockBtn.hidden = !open;
      if (!note) return;
      if (extra === 'blocked') {
        note.hidden = false;
        note.textContent = 'The browser blocked the new tab.';
        return;
      }
      note.hidden = !open;
      note.textContent = mode === 'overlay' ? 'Chat covers the map. Dock puts it back.' : 'Chat is floating over the map.';
    },
    onFilter: function (next) { setChatFilter(next); }
  });
  if (window.SSDNSTableLog && window.SSDNSTableLog.onChange) {
    unsubs.push(window.SSDNSTableLog.onChange(function () { if (!dead) renderChat(); }));
  }
}

if (role === 'dm') {
  const leftbar = document.createElement('div');
  leftbar.className = 'ssdns-leftbar';
  leftbar.innerHTML = `
    <button data-act="pingBtn">Ping</button>
    <button data-act="rulerBtn">Ruler</button>
    <div class="ssm-colorpick">
      <span class="ssm-swatch" data-act="colorSwatch"></span>
      <select data-act="colorBtn" aria-label="Token color"></select>
    </div>
    <input data-act="colorCustom" type="color" value="#4a90d9" hidden aria-label="Custom token color">
    <div class="panel-title">Fog</div>
    <button data-act="revealFogBtn" type="button">Reveal: Box</button>
    <select data-act="revealShape" aria-label="Reveal shape">
      <option value="box">Box</option>
      <option value="square">Square</option>
      <option value="poly">Poly</option>
      <option value="brush">Brush</option>
    </select>
    <button data-act="hideFogBtn" type="button">Hide: Box</button>
    <select data-act="hideShape" aria-label="Hide shape">
      <option value="box">Box</option>
      <option value="square">Square</option>
      <option value="poly">Poly</option>
      <option value="brush">Brush</option>
    </select>
    <button data-act="eraseFogBtn" type="button">Erase</button>
    <button data-act="deleteFogBtn" type="button">Delete selection</button>
    <button data-act="fogUndoBtn" type="button">Undo</button>
    <button data-act="fogRedoBtn" type="button">Redo</button>
    <button data-act="hideBtn">Hide/Reveal</button>
    <button data-act="hideAllBtn">Hide All</button>
    <button data-act="revealAllBtn">Reveal All</button>
    <div style="height:16px;border-top:1px solid #5a4e40;margin-top:8px;padding-top:8px"></div>
    <button data-act="wallBtn">Wall</button>
    <button data-act="roomBtn">Room</button>
    <button data-act="doorBtn">Door</button>
    <button data-act="secretDoorBtn" type="button" aria-pressed="false" title="Hide a door from players. Click the door again to reveal it. Shift-click does the same.">Secret: OFF</button>
    <div data-act="doorEdit" hidden>
      <label><input data-act="doorLocked" type="checkbox"> Locked</label>
      <label>Lock DC <input data-act="doorLockDc" type="number" min="0" value="15" aria-label="Lock DC"></label>
      <label><input data-act="doorAjar" type="checkbox"> Ajar</label>
      <label title="Stub only. A failed lockpick stays locked and does not spring a trap."><input data-act="doorTrapOnFail" type="checkbox"> Trap on fail (stub)</label>
    </div>
    <button data-act="windowBtn">Window</button>
    <button data-act="delWallBtn">Del Wall</button>
    <button data-act="undoWallBtn">Undo Wall</button>
    <button data-act="clearWallsBtn">Clear Walls</button>
    <button data-act="snapBtn">Snap: ON</button>
    <button data-act="wallsVisBtn" class="active">Walls: ON</button>
  `;
  el.appendChild(leftbar);

  const rightbar = document.createElement('div');
  rightbar.className = 'ssdns-rightbar';
  rightbar.innerHTML = `
    <div class="panel-title">DM Tools</div>
    <div class="ssm-move-tools" data-act="moveTools" role="group" aria-label="Token moves">
      <button type="button" data-act="lockBtn">Lock</button>
      <button type="button" data-act="undoBtn">Undo Move</button>
      <button type="button" data-act="redoBtn">Redo Move</button>
    </div>
    <button data-act="addTokenBtn">Add token</button>
    <button type="button" data-act="bestiaryBtn" aria-expanded="false" title="Place a bestiary creature: it joins the fight already linked">Bestiary</button>
    <button data-act="addPcBtn">Add player token</button>
    <button data-act="dupTokenBtn">Duplicate</button>
    <button data-act="copyTokenBtn">Copy</button>
    <button data-act="pasteTokenBtn">Paste</button>
    <button data-act="delTokenBtn">Delete</button>
    <div style="height:8px"></div>
    <div class="panel-title">Control</div>
    <select data-act="grantUid"></select>
    <button data-act="grantBtn">Grant</button>
    <button data-act="revokeBtn">Revoke</button>
    <div class="panel-title">Sheet</div>
    <div data-act="actionSlot"></div>
    <div style="height:12px"></div>
    <div class="panel-title">Selected</div>
    <div data-act="targetList" class="panel-list">None</div>
    <label class="ssm-range"><input type="checkbox" data-act="showRange"> Show range</label>
    <select data-act="rangeWeapon" aria-label="Token weapon" hidden></select>
    <input data-act="dmLabel" placeholder="Label" style="width:100%;background:#3a3228;color:#e8dcc8;border:1px solid #5a4e40;border-radius:4px;padding:4px;">
    <div class="panel-title">Actions</div>
    <div data-act="actionList" class="panel-list">Select a token</div>
    <div style="height:8px"></div>
    <label class="ssm-ambient">Ambient
      <select data-act="ambientSel" aria-label="Ambient light">
        <option value="dark">Dark</option>
        <option value="dim">Dim</option>
        <option value="bright">Bright</option>
      </select>
    </label>
    <label class="ssm-range" title="Test overlay. Players never see these rings."><input type="checkbox" data-act="showLightRings"> Light rings</label>
    <label class="ssm-ambient">Sight
      <select data-act="visionSel" aria-label="Player sight">
        <option value="party">Party sight</option>
        <option value="own">Own token</option>
      </select>
    </label>
    <button type="button" data-act="dmDouseBtn">Douse lights</button>
    <button type="button" data-act="dmRelightBtn">Relight</button>
    <select data-act="condSelect">
      <option value="">Condition…</option>
      <option value="unconscious">Unconscious</option>
      <option value="paralyzed">Paralyzed</option>
      <option value="poisoned">Poisoned</option>
      <option value="stunned">Stunned</option>
      <option value="prone">Prone</option>
    </select>
    <button data-act="condToggleBtn">Toggle Cond</button>
    <button data-act="downBtn">Down</button>
    <div class="panel-title">Spell grids</div>
    <div data-act="zoneList" class="panel-list">None</div>
    <button type="button" data-act="clearAllZonesBtn" title="Remove every spell grid in this scene">Clear all grids</button>
  `;
  el.appendChild(rightbar);
} else {
  const card = document.createElement('div');
  card.className = 'ssdns-playercard';
  card.setAttribute('data-act', 'playerCard');
  card.innerHTML = `
    <div class="ssm-card-head" data-act="playerCardHead">
      <button type="button" data-act="playerCardMin" aria-expanded="true" title="Collapse card"><span class="ssm-dock-label" data-act="playerDockLabel">My token</span> <span data-act="playerCaret" aria-hidden="true">◂</span></button>
      <b data-act="playerName">My token</b>
      <button type="button" data-act="playerDock" title="Dock to the side" hidden>Dock</button>
    </div>
    <div class="ssm-card-body">
      <div class="ssm-tools">
        <button type="button" data-act="playerPingBtn">Ping</button>
        <button type="button" data-act="playerRulerBtn">Ruler</button>
        <div class="ssm-lights" data-act="playerLights">No light in hand</div>
        <button type="button" data-act="addMineBtn" hidden>Add my token</button>
      </div>
      <label class="ssm-range"><input type="checkbox" data-act="showRange"> Show my range</label>
      <select data-act="rangeWeapon" aria-label="Equipped weapon" hidden></select>
      <div class="ssm-stat" data-act="playerStats"></div>
      <div data-act="actionSlot"></div>
      <details class="ssm-settings" data-act="playerSettings">
        <summary>Settings</summary>
        <label>Label <input data-act="playerLabel" placeholder="My label" aria-label="My label"></label>
        <div class="ssm-colorpick">
          <span class="ssm-swatch" data-act="playerSwatch"></span>
          <select data-act="playerColorBtn" aria-label="My color"></select>
        </div>
        <input data-act="playerColorCustom" type="color" value="#4a90d9" hidden aria-label="Custom color">
        <button type="button" data-act="playerHiddenBtn">Hidden: OFF</button>
      </details>
    </div>
  `;
  el.appendChild(card);
}

// --- attack effects (firing lines) ---
/* Jessey 2026-10-20: every client draws attack effects on its own overlay canvas (above the tokens).
   The DM's client is the only publisher: it resolves token positions, strips anything hidden, and writes one
   public row (tableFeed, kind "sfx", event "fx") that the sheet and DMCC sound handlers already ignore.
   Players never get a hidden token's id or position: a hidden shooter becomes a fog-edge start point, or no row. */
const FXA = window.SSDNSMapFx || null;
const fxBoot = Date.now();
const fxLive = [];
const fxTimers = [];
let fxRaf = 0;
state.fxLog = [];
function fxOn() { return !!(FXA && FXA.enabled()); }
function fxPx() { return (state.scene && state.scene.grid && state.scene.grid.px) || 70; }
function fxCenter(t) { const s = t.size || 1; return { x: t.pos.x + s / 2, y: t.pos.y + s / 2 }; }
function fxRadius(t) { return (t.size || 1) / 2 * 0.85; }
function fxSceneOk(t) {
  return onViewedScene(t);
}
/* Same test the token pass in draw() uses, for any grid point. The DM sees the whole viewed floor. */
function playerSees(gx, gy) {
  if (role !== 'player') return true;
  let sd = null;
  try { sd = sceneData(); } catch (e) { return false; }
  let visible = pointInSight(gx, gy, sightFor(uid));
  (sd.fogShapes || []).forEach(shape => { if (shapeContains(shape, gx, gy)) visible = shape.op !== 'hide'; });
  return visible;
}
function tokenSeen(t) {
  if (!t || !t.pos) return false;
  if (!fxSceneOk(t)) return false;
  if (role !== 'player') return true;
  if (t.hidden) return false;
  if (t.veil && t.ownerUid !== uid) return false;
  const c = fxCenter(t);
  return playerSees(c.x, c.y);
}
/* DM: could any player see this grid point? Union of party sight (each player's bubble and every light),
   then Reveal/Hide shapes (last match wins). Hidden tokens never light. */
function fxPublicSees(gx, gy, sid) {
  let sd = null;
  try { sd = sceneData(sid); } catch (e) { return false; }
  let visible = pointInSight(gx, gy, buildSight(null, sid, 'party'));
  (sd.fogShapes || []).forEach(shape => { if (shapeContains(shape, gx, gy)) visible = shape.op !== 'hide'; });
  return visible;
}
/* First point on a→b that passes test(), searching in 0.05-square steps. */
function fxWalk(a, b, test) {
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  if (!d) return test(a.x, a.y) ? { x: a.x, y: a.y, at: 0 } : null;
  const steps = Math.ceil(d / 0.05);
  for (let i = 0; i <= steps; i++) {
    const u = i / steps, x = a.x + (b.x - a.x) * u, y = a.y + (b.y - a.y) * u;
    if (test(x, y)) return { x, y, at: d * u };
  }
  return null;
}
function fxRef(ref) {
  if (!ref) return null;
  const t = tokenByRef(String(ref)); /* id, combatantId (DM only: public tokens carry none) or ownerUid */
  if (!t || !t.pos) return null;
  if (role === 'player' && t.hidden) return null;
  return t;
}
/* A free shot has no target: it fires toward the shooter's last target if there is one, else the nearest other side. */
function fxFacing(S, spec) {
  if (spec && spec.dir && isFinite(spec.dir.x) && isFinite(spec.dir.y) && (spec.dir.x || spec.dir.y)) return spec.dir;
  const c = fxCenter(S);
  let best = null, bestD = Infinity;
  const faceScene = sceneKey(S);
  (state.tokens || []).forEach(t => {
    if (!t || t === S || !t.pos || t.hidden || t.kind === 'marker') return;
    if (sceneKey(t) !== faceScene) return;
    if (!!t.ownerUid === !!S.ownerUid && t.kind === S.kind) return;
    const o = fxCenter(t), d = Math.hypot(o.x - c.x, o.y - c.y);
    if (d < bestD) { bestD = d; best = o; }
  });
  if (!best) return { x: 1, y: 0 };
  const d = Math.hypot(best.x - c.x, best.y - c.y) || 1;
  return { x: (best.x - c.x) / d, y: (best.y - c.y) / d };
}
/** Work out what this client may draw. Returns null when it must draw nothing. */
function fxGeometry(spec) {
  const type = FXA ? FXA.classify(spec) : 'gun';
  const S = fxRef(spec.shooter), T = fxRef(spec.target);
  const melee = type === 'blade' || type === 'blunt';
  const geo = { type, S: null, T: null, rS: 0.42, rT: 0.42, src: null, srcHidden: false, dir: null };
  if (spec.target && !T) return null;
  if (T) {
    if (!tokenSeen(T)) return null; /* never draw at something this player can't see */
    geo.T = fxCenter(T); geo.rT = fxRadius(T); geo.tokT = T;
  }
  if (S && tokenSeen(S)) { geo.S = fxCenter(S); geo.rS = fxRadius(S); geo.tokS = S; }
  else if (S && role === 'player' && T) {
    /* shooter is in this player's dark: start where the line comes out of it, no muzzle flash */
    const edge = fxWalk(fxCenter(S), geo.T, playerSees);
    if (!edge) return null;
    geo.src = { x: edge.x, y: edge.y }; geo.srcHidden = true;
  } else if (!S && spec.src && T) {
    const from = { x: Number(spec.src.x), y: Number(spec.src.y) };
    if (!isFinite(from.x) || !isFinite(from.y)) return null;
    const edge = role === 'player' ? fxWalk(from, geo.T, playerSees) : { x: from.x, y: from.y };
    if (!edge) return null;
    geo.src = { x: edge.x, y: edge.y }; geo.srcHidden = true;
  } else return null;
  var spellSelf = type === 'spell' && (spec.self || (FXA.lookSelf && FXA.lookSelf(spec)));
  if (type === 'free') {
    if (!geo.S) return null;
    geo.dir = fxFacing(S, spec);
  } else if (!geo.T && spellSelf && (geo.S || geo.src)) {
    geo.T = geo.S || geo.src;
    geo.rT = geo.rS || 0.42;
    geo.self = true;
    geo.tokT = geo.tokS || null;
  } else if (!geo.T) return null;
  if (melee && !geo.S && !geo.src) return null;
  return geo;
}
function fxOutcomeInfo(spec, type) {
  return {
    id: spec.weaponId || '', name: spec.weapon || '', weapon: spec.weapon || '',
    gun: type === 'gun' || type === 'buck', spell: type === 'spell', kind: type === 'spell' ? 'spell' : (type === 'thrown' ? 'thrown' : ''),
    group: type === 'arrow' || type === 'bolt' ? 'bow' : '', dmgType: type === 'blunt' ? 'bludgeoning' : (type === 'blade' ? 'slashing' : ''),
    nat: spec.nat
  };
}
/* Sound layers this client plays on the frame it draws. The shot/strike cue is never played here: the existing
   queue already plays and shares it. `heard` lists clients that already played the hit/miss (resolver/shooter). */
function fxCues(spec, plan) {
  const A = window.SSDNSAudio;
  if (!A || !plan) return [];
  const heard = Array.isArray(spec.heard) ? spec.heard : [];
  const mine = heard.indexOf(uid) >= 0;
  const out = [];
  (plan.cues || []).forEach(c => {
    let cue = '';
    if (c.layer === 'result') {
      if (mine || !plan.result || !A.outcomeCue) return;
      cue = A.outcomeCue(fxOutcomeInfo(spec, plan.type), plan.result === 'crit' ? 'crit' : plan.result);
    } else if (c.layer === 'trail') {
      const key = A.arrowKey ? A.arrowKey(String(c.cue).split(':')[1] || '') : '';
      if (key && A.hasFile && A.hasFile(key)) cue = key; /* silent until a whistle file is listed in sfx.json */
    } else if (c.layer === 'boom') {
      if (mine) return;
      const key = spec.arrow === 'dynamite' && A.arrowCue ? A.arrowCue('dynamite', 'explode') : 'explode';
      cue = key || 'explode';
    }
    if (cue) out.push({ at: c.at, cue: cue, layer: c.layer });
  });
  return out;
}
function fxPlay(spec, geo, opts) {
  opts = opts || {};
  const type = geo.type;
  const plan = FXA.plan(type, spec.result, spec);
  const cues = fxCues(spec, plan);
  const seed = FXA.hash(String(spec.id || '') + type + (spec.shooter || '') + (spec.target || '')) || 7;
  const entry = { spec: Object.assign({}, spec, { type: type, seed: seed }), geo, plan, cues, t0: 0 };
  const log = { type, result: plan.result, srcHidden: !!geo.srcHidden, cues: cues.map(c => c.layer + ':' + c.cue + '@' + c.at), local: !!opts.local, nat: spec.nat == null ? null : spec.nat, crit: !!spec.crit };
  state.fxLog.push(log);
  if (state.fxLog.length > 30) state.fxLog.shift();
  const ev = FXA.effectEvent(Object.assign({}, spec, { type: type }), { local: !!opts.local });
  try { el.dispatchEvent(new CustomEvent('ssdns-map-fx', { detail: ev })); } catch (e) {}
  return FXA.beforeEffect(ev).then(() => {
    if (dead || !fxOn()) return false;
    entry.t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    fxLive.push(entry);
    cues.forEach(c => {
      const t = setTimeout(() => {
        const i = fxTimers.indexOf(t); if (i >= 0) fxTimers.splice(i, 1);
        if (dead || !fxOn() || !window.SSDNSAudio) return;
        if (window.SSDNSAudio.playNow) window.SSDNSAudio.playNow(c.cue);
        else window.SSDNSAudio.play(c.cue);
      }, Math.max(0, c.at));
      fxTimers.push(t);
    });
    if (!fxRaf) fxRaf = requestAnimationFrame(fxFrame);
    return true;
  });
}
/** Draw an effect on this client. Returns the promise from fxPlay, or null when nothing may be drawn. */
function startFx(spec, opts) {
  if (!FXA || !spec || !fxOn() || !state.scene) return null;
  const geo = fxGeometry(spec);
  if (!geo) return null;
  return fxPlay(spec, geo, opts);
}
function fxScreen(entry) {
  const px = fxPx(), z = state.view.zoom, cell = px * z;
  const g = entry.geo, type = entry.spec.type;
  /* follow tokens that move while the effect plays (cheap: two lookups) */
  if (g.tokS && g.tokS.pos) g.S = fxCenter(g.tokS);
  if (g.tokT && g.tokT.pos) g.T = fxCenter(g.tokT);
  const S = g.S ? worldToScreen(g.S.x * px, g.S.y * px) : null;
  const T = g.T ? worldToScreen(g.T.x * px, g.T.y * px) : null;
  const src = g.src ? worldToScreen(g.src.x * px, g.src.y * px) : null;
  const rS = g.rS * cell, rT = g.rT * cell;
  let dir;
  if (type === 'free') dir = g.dir;
  else {
    const from = src || S;
    const dx = T.x - from.x, dy = T.y - from.y, d = Math.hypot(dx, dy) || 1;
    dir = { x: dx / d, y: dy / d };
  }
  const A = src ? src : { x: S.x + dir.x * (rS + 3), y: S.y + dir.y * (rS + 3) };
  const B = T ? { x: T.x - dir.x * rT * 0.55, y: T.y - dir.y * rT * 0.55 } : null;
  return { A, B: B || A, S, T, rS, rT, cell, dir, srcHidden: !!g.srcHidden };
}
function fxFrame() {
  fxRaf = 0;
  if (dead || !fxCtx) { fxLive.length = 0; return; }
  const box = viewBox();
  fxCtx.clearRect(0, 0, box.w, box.h);
  const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  for (let i = fxLive.length - 1; i >= 0; i--) {
    const e = fxLive[i], lt = now - e.t0;
    if (lt > e.plan.duration) { fxLive.splice(i, 1); continue; }
    try { FXA.paint(fxCtx, e.spec, lt, fxScreen(e)); } catch (err) { fxLive.splice(i, 1); }
  }
  if (fxLive.length) fxRaf = requestAnimationFrame(fxFrame);
  else fxCtx.clearRect(0, 0, box.w, box.h);
}
function fxStopAll() {
  fxLive.length = 0;
  fxTimers.splice(0).forEach(t => { try { clearTimeout(t); } catch (e) {} });
  if (fxRaf) { cancelAnimationFrame(fxRaf); fxRaf = 0; }
  if (fxCtx) { const box = viewBox(); fxCtx.clearRect(0, 0, box.w, box.h); }
}
/** DM only: what players may receive for this effect. null = players get nothing. Never carries a hidden token. */
function fxPublic(spec) {
  if (role !== 'dm' || !FXA || !spec) return null;
  const type = FXA.classify(spec);
  const S = fxRef(spec.shooter), T = fxRef(spec.target);
  if (!S) return null;
  if (spec.target && !T) return null;
  if (T && T.hidden) return null;
  const pub = {
    type, result: spec.result, arrow: spec.arrow, sfx: spec.sfx, weapon: spec.weapon, weaponId: spec.weaponId,
    spell: spec.spell || "", dmg: spec.dmg || "", self: !!spec.self,
    nat: spec.nat, crit: spec.crit, critMin: spec.critMin, heard: spec.heard, scene: S.sceneId || ''
  };
  if (T) pub.target = T.id;
  const sc = fxCenter(S);
  const sid = S.sceneId || 'scn_dustyspur01';
  const seen = (x, y) => fxPublicSees(x, y, sid);
  if (S.hidden || !seen(sc.x, sc.y)) {
    if (!T || type === 'free') return null;
    const tc = fxCenter(T);
    const edge = fxWalk(sc, tc, seen);
    /* a hidden token standing in the open has no fog edge to fire from: players see nothing */
    if (!edge || edge.at < 1) return null;
    pub.src = { x: edge.x, y: edge.y };
  } else pub.shooter = S.id;
  if (type === 'free') pub.dir = fxFacing(S, spec);
  return FXA.sanitize(pub);
}
/** DM: draw locally with full knowledge, then publish the cleaned row. Returns the public fx (or null). */
function dmFx(spec, rowId) {
  if (role !== 'dm' || !FXA || !spec) return null;
  startFx(spec, { local: true });
  const pub = fxPublic(spec);
  if (!pub) return null;
  const id = 'fx_' + String(rowId || (Date.now().toString(36) + Math.random().toString(36).slice(2, 6))).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60);
  const row = { id, ts: new Date().toISOString(), from: uid, fromName: 'DM', text: 'fx', kind: 'sfx', event: 'fx', fx: pub };
  try {
    if (adapter && adapter.write) {
      const p = adapter.write('tableFeed/' + id, row, { by: uid });
      if (p && p.catch) p.catch(() => {}); /* a second DM tab writing the same id is refused by the rules: fine */
    }
  } catch (e) {}
  return pub;
}
/* Feed rows: public fx rows draw here; a player's fxReq is turned into a public row by the DM's map only. */
function fxFromFeed(row) {
  if (!FXA || !row) return;
  const ts = Date.parse(row.ts || '');
  if (ts && ts < fxBoot - FXA.TIMING.stale) return; /* history replayed on load */
  if (ts && Date.now() - ts > 60000) return; /* late replay after a reconnect (60 s leaves room for clock skew) */
  if (row.fx && typeof row.fx === 'object') {
    if (row.from === uid) return; /* drew it locally */
    startFx(Object.assign({}, row.fx, { id: (row.fx && row.fx.zoomId) || row.id }), { local: false });
    return;
  }
  if (row.fxReq && typeof row.fxReq === 'object' && role === 'dm' && row.from && row.from !== uid) {
    const req = row.fxReq;
    dmFx({
      id: row.id, who: (row.zoom && row.zoom.who) || row.characterName || row.fromName || row.who || "",
      type: req.type, result: req.result, target: req.target || (req.self ? row.from : ""), shooter: row.from, sfx: req.sfx,
      weapon: req.weapon, weaponId: req.weaponId, arrow: req.arrow, nat: req.nat, crit: req.crit, critMin: req.critMin,
      spell: req.spell || "", dmg: req.dmg || "", self: !!req.self || req.target === row.from,
      heard: req.heard === false ? [] : [row.from]
    }, row.id);
  }
}

// --- render ---
function viewBox() {
  const w = canvas.clientWidth || el.clientWidth || 1;
  const h = canvas.clientHeight || el.clientHeight || 1;
  return { w: w, h: h };
}
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const box = viewBox();
  if (canvas.width !== Math.round(box.w * dpr) || canvas.height !== Math.round(box.h * dpr)) {
    canvas.width = box.w * dpr;
    canvas.height = box.h * dpr;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  sizeFxCanvas(dpr, box);
  draw();
}
function sizeFxCanvas(dpr, box) {
  if (!fxCanvas) return;
  const st = fxCanvas.style;
  st.left = (canvas.offsetLeft || 0) + 'px';
  st.top = (canvas.offsetTop || 0) + 'px';
  st.width = box.w + 'px';
  st.height = box.h + 'px';
  if (fxCanvas.width !== Math.round(box.w * dpr) || fxCanvas.height !== Math.round(box.h * dpr)) {
    fxCanvas.width = box.w * dpr;
    fxCanvas.height = box.h * dpr;
  }
  if (fxCtx && fxCtx.setTransform) fxCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
const ro = new ResizeObserver(resize);
ro.observe(el);
ro.observe(canvas);

function worldToScreen(wx, wy) {
  const box = viewBox();
  return {
    x: (wx - state.view.x) * state.view.zoom + box.w / 2,
    y: (wy - state.view.y) * state.view.zoom + box.h / 2
  };
}
function screenToWorld(sx, sy) {
  const box = viewBox();
  return {
    x: (sx - box.w / 2) / state.view.zoom + state.view.x,
    y: (sy - box.h / 2) / state.view.zoom + state.view.y
  };
}
function localXY(e) {
  const r = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : { left: 0, top: 0 };
  return { x: e.clientX - (r.left || 0), y: e.clientY - (r.top || 0) };
}
function pointerWorld(e) {
  const p = localXY(e);
  return screenToWorld(p.x, p.y);
}
function gridPoint(world) {
  const px = (state.scene && state.scene.grid && state.scene.grid.px) || 1;
  let x = world.x / px;
  let y = world.y / px;
  if (state.snap) { x = Math.round(x); y = Math.round(y); }
  return { x: x, y: y };
}
function sameGrid(a, b) {
  return !!a && !!b && Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01;
}
function screenDistGrid(a, b) {
  const px = (state.scene && state.scene.grid && state.scene.grid.px) || 1;
  const pa = worldToScreen(a.x * px, a.y * px);
  const pb = worldToScreen(b.x * px, b.y * px);
  return Math.hypot(pa.x - pb.x, pa.y - pb.y);
}
function pointInPoly(x, y, points) {
  if (!points || points.length < 3) return false;
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const xi = points[i].x, yi = points[i].y;
    const xj = points[j].x, yj = points[j].y;
    const denom = (yj - yi) || 1e-9;
    const intersect = ((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / denom + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}
function tracePoly(points, close) {
  const px = state.scene.grid.px;
  ctx.beginPath();
  points.forEach((p, i) => {
    const s = worldToScreen(p.x * px, p.y * px);
    if (i === 0) ctx.moveTo(s.x, s.y);
    else ctx.lineTo(s.x, s.y);
  });
  if (close) ctx.closePath();
}
let fogSeq = 1;
function fogId() { return 'fg_' + (fogSeq++); }
function cloneShapes(list) { return JSON.parse(JSON.stringify(list || [])); }
function shapeWord(kind) {
  if (kind === 'poly') return 'Poly';
  if (kind === 'brush') return 'Brush';
  if (kind === 'square') return 'Square';
  return 'Box';
}
function fogOp() { return state.tool === 'hide' ? 'hide' : 'reveal'; }
function mirrorFog(scene) {
  const shapes = scene.fogShapes || [];
  scene.fogRects = shapes.filter(s => s && s.op === 'reveal' && (s.kind === 'box' || s.kind === 'square')).map(s => ({ x: s.x, y: s.y, w: s.w, h: s.h }));
  scene.fogPolys = shapes.filter(s => s && s.op === 'reveal' && s.kind === 'poly' && s.points).map(s => ({ points: s.points }));
}
function rememberFog() {
  if (!state.fogBefore) state.fogBefore = cloneShapes(sceneData().fogShapes);
}
function renderFogHistory() {
  const past = state.fogPast || [];
  const future = state.fogFuture || [];
  const undo = q('fogUndoBtn');
  const redo = q('fogRedoBtn');
  if (undo) undo.disabled = !past.length;
  if (redo) redo.disabled = !future.length;
}
function commitFog(label) {
  const scene = sceneData();
  mirrorFog(scene);
  if (!state.fogPast) state.fogPast = [];
  state.fogPast.push({ label: label, before: state.fogBefore || [], after: cloneShapes(scene.fogShapes) });
  if (state.fogPast.length > 40) state.fogPast.shift();
  state.fogFuture = [];
  state.fogBefore = null;
  saveScene();
  renderFogHistory();
  toast(label);
  draw();
}
function applyFogSnapshot(shapes) {
  const scene = sceneData();
  scene.fogShapes = cloneShapes(shapes);
  mirrorFog(scene);
  state.fogSelection = (state.fogSelection || []).filter(id => scene.fogShapes.some(s => s.id === id));
  state.fogBefore = null;
  saveScene();
  renderFogHistory();
  draw();
}
function undoFog() {
  const past = state.fogPast || [];
  const step = past.pop();
  if (!step) { toast('Nothing to undo'); return; }
  if (!state.fogFuture) state.fogFuture = [];
  state.fogFuture.push(step);
  applyFogSnapshot(step.before);
}
function redoFog() {
  const future = state.fogFuture || [];
  const step = future.pop();
  if (!step) { toast('Nothing to redo'); return; }
  if (!state.fogPast) state.fogPast = [];
  state.fogPast.push(step);
  applyFogSnapshot(step.after);
}
function jumpFog(index) {
  const past = state.fogPast || [];
  while (past.length - 1 > index) {
    const step = past.pop();
    if (!step) break;
    if (!state.fogFuture) state.fogFuture = [];
    state.fogFuture.push(step);
  }
  const current = past[past.length - 1];
  if (current) applyFogSnapshot(current.after);
}
function addFogShape(shape) {
  rememberFog();
  shape.id = shape.id || fogId();
  shape.op = shape.op || fogOp();
  sceneData().fogShapes.push(shape);
  const word = shape.op === 'hide' ? 'Hide' : 'Reveal';
  commitFog(word + ' ' + shapeWord(shape.kind).toLowerCase());
}
function addFogSquares(cells) {
  const list = [];
  const seen = {};
  (cells || []).forEach(c => {
    const x = Math.floor(Number(c.x));
    const y = Math.floor(Number(c.y));
    if (!isFinite(x) || !isFinite(y)) return;
    const key = x + ',' + y;
    if (seen[key]) return;
    seen[key] = true;
    list.push({ id: fogId(), op: fogOp(), kind: 'square', x: x, y: y, w: 1, h: 1 });
  });
  if (!list.length) return;
  rememberFog();
  list.forEach(shape => sceneData().fogShapes.push(shape));
  commitFog((list[0].op === 'hide' ? 'Hide' : 'Reveal') + ' square');
}
function commitPoly() {
  const pts = state.polyPoints || [];
  if (pts.length < 3) return false;
  const op = fogOp();
  state.polyPoints = [];
  state.polyHover = null;
  addFogShape({ op: op, kind: 'poly', points: pts.map(p => ({ x: p.x, y: p.y })) });
  return true;
}
function shapeContains(shape, x, y) {
  if (!shape) return false;
  if (shape.kind === 'box' || shape.kind === 'square') return x >= shape.x && y >= shape.y && x < shape.x + shape.w && y < shape.y + shape.h;
  if (shape.kind === 'poly') return pointInPoly(x, y, shape.points || []);
  if (shape.kind === 'brush') return (shape.cells || []).some(c => x >= c.x && y >= c.y && x < c.x + 1 && y < c.y + 1);
  return false;
}
function fogAt(x, y) {
  const shapes = sceneData().fogShapes || [];
  for (let i = shapes.length - 1; i >= 0; i--) {
    if (shapeContains(shapes[i], x, y)) return shapes[i];
  }
  return null;
}
function fogCovers(x, y) {
  let hidden = sceneData().fogRevealed !== true;
  (sceneData().fogShapes || []).forEach(shape => {
    if (shapeContains(shape, x, y)) hidden = shape.op === 'hide';
  });
  return hidden;
}
/* Fog sight. Option A (default): shared party sight — each player sees the union of party bubbles
   (darkvision, or a 2-square bubble with none) plus every light. Option B: scene.visionMode "own"
   keeps sight to the viewer's own token. The DM always sees the map. Ambient bright/dim opens the
   scene (hide shapes still hide). A legacy torch is bright 20 ft / dim 20 ft (outer 8 squares).
   Walls do not block sight yet. Grid units (squares). */
function playerSceneOf(viewerUid) {
  if (role === 'player' && viewerUid === uid) return getPlayerScene();
  const own = state.tokens.find(t => t && t.ownerUid === viewerUid);
  return (own && own.sceneId) || (shared.playerScenes && shared.playerScenes[viewerUid]) || 'scn_dustyspur01';
}
function visionModeOf(sd) { return sd && sd.visionMode === 'own' ? 'own' : 'party'; }
function ambientOf(sd) {
  const a = sd && sd.ambient;
  return a === 'bright' || a === 'dim' ? a : 'dark';
}
function tokenLightList(t) {
  if (!t || !t.pos || t.hidden || t.dmDoused) return [];
  const c = fxCenter(t);
  const face = (Number(t.facing) || 0) * Math.PI / 180;
  const rows = Array.isArray(t.lights) ? t.lights.filter(l => l && !l.out) : [];
  if (rows.length) {
    return rows.map(l => {
      const bright = Number(l.bright) || 0, dim = Number(l.dim) || 0;
      const ZL = window.SSDNSSpellZones;
      const spellLevel = ZL && ZL.spellLightLevel ? ZL.spellLightLevel(l) : null;
      return {
        x: c.x, y: c.y, bright: bright, dim: dim, radius: (bright + dim) / 5, cone: !!l.cone, facing: face, name: l.name || '',
        id: l.id || '', magical: !!(l.magical || l.spell || l.feature || spellLevel != null), spell: !!l.spell,
        spellLevel: spellLevel, feature: !!l.feature
      };
    });
  }
  if (t.torch) return [{ x: c.x, y: c.y, bright: 20, dim: 20, radius: 8, cone: false, facing: face, name: 'Torch' }];
  return [];
}
function inLight(ls, gx, gy) {
  if (!ls) return false;
  const d = Math.hypot(gx - ls.x, gy - ls.y);
  if (d > ls.radius) return false;
  if (!ls.cone) return true;
  let diff = Math.abs(Math.atan2(gy - ls.y, gx - ls.x) - (ls.facing || 0));
  if (diff > Math.PI) diff = Math.abs(diff - Math.PI * 2);
  return diff <= Math.atan(0.5) + 0.001;
}
function buildSight(viewerUid, sceneId, forceMode) {
  const sid = sceneId || playerSceneOf(viewerUid || '');
  const sd = sceneData(sid);
  const amb = ambientOf(sd);
  const mode = forceMode || visionModeOf(sd);
  const open = sd.fogRevealed === true || amb === 'bright' || amb === 'dim';
  const out = {
    uid: viewerUid || '', sceneId: sid, open: open, fogOn: !open, ambient: amb, mode: mode,
    center: null, radius: 2, bubbles: [], lights: [], shapes: sd.fogShapes || []
  };
  for (const t of state.tokens) {
    if (!t || !t.pos || t.hidden) continue;
    if ((t.sceneId || 'scn_dustyspur01') !== sid) continue;
    tokenLightList(t).forEach(ls => out.lights.push(ls));
    const party = !!(t.ownerUid || t.kind === 'player');
    if (!party) continue;
    const mine = viewerUid && t.ownerUid === viewerUid;
    if (mode === 'own' && viewerUid && !mine) continue;
    const dv = Number(t.darkvision) || 0;
    const radius = dv > 0 ? dv / 5 : 2;
    const bubble = { x: t.pos.x + (t.size || 1) / 2, y: t.pos.y + (t.size || 1) / 2, radius: radius, darkvision: dv, devilsSight: !!t.devilsSight, uid: t.ownerUid || '' };
    out.bubbles.push(bubble);
    if (mine) { out.center = { x: bubble.x, y: bubble.y }; out.radius = radius; }
  }
  return out;
}
function sightFor(viewerUid, sceneId) { return buildSight(viewerUid, sceneId, ''); }
function pointInSight(gx, gy, sight) {
  if (!sight) return false;
  if (sight.open) return true;
  for (const b of sight.bubbles || []) {
    if (Math.hypot(gx - b.x, gy - b.y) <= b.radius) return true;
  }
  if (sight.center && Math.hypot(gx - sight.center.x, gy - sight.center.y) <= sight.radius) return true;
  for (const ls of sight.lights || []) {
    if (inLight(ls, gx, gy)) return true;
  }
  return false;
}
function tokenSeenBy(t, sight) {
  if (!t || !t.pos || !sight) return false;
  if (t.hidden) return false;
  if ((t.sceneId || 'scn_dustyspur01') !== sight.sceneId) return false;
  const gx = t.pos.x + (t.size || 1) / 2;
  const gy = t.pos.y + (t.size || 1) / 2;
  let visible = pointInSight(gx, gy, sight);
  sight.shapes.forEach(shape => {
    if (shapeContains(shape, gx, gy)) visible = shape.op !== 'hide';
  });
  if (!visible) return false;
  if (zoneHidesToken(t, sight)) return false;
  if (t.veil && t.ownerUid !== sight.uid) return false;
  return true;
}
function spellZoneList() {
  if (state.spellZonesLive) return state.spellZones || [];
  try {
    const sd = sceneData();
    if (sd && Array.isArray(sd.spellZones)) return sd.spellZones;
  } catch (e) {}
  return state.spellZones || [];
}
function liveSpellZones() {
  const list = spellZoneList();
  return list.map(z => {
    if (!z || !z.follow) return z;
    const t = tokenByRef(z.casterId) || tokenByRef(z.followId);
    if (!t || !t.pos) return z;
    const s = t.size || 1;
    return Object.assign({}, z, { origin: { x: t.pos.x + s / 2, y: t.pos.y + s / 2 } });
  });
}
function zoneViewer(sight) {
  const bubbles = (sight && sight.bubbles) || [];
  const mine = sight && sight.uid ? bubbles.filter(b => b && b.uid === sight.uid) : [];
  const pick = (mine.length ? mine : bubbles).filter(Boolean);
  if (pick.length) return pick;
  if (role === 'player') {
    const t = (state.tokens || []).find(tok => tok && tok.ownerUid === uid && tok.pos);
    if (!t) return [];
    return [{ x: t.pos.x + (t.size || 1) / 2, y: t.pos.y + (t.size || 1) / 2, devilsSight: !!t.devilsSight, uid: uid }];
  }
  return [];
}
function zoneHidesPoint(gx, gy, sight) {
  const Z = window.SSDNSSpellZones;
  const zones = spellZoneList();
  if (!Z || !Z.hides || !zones.length) return false;
  const viewers = zoneViewer(sight);
  if (!viewers.length) return Z.hides(gx, gy, zones, null);
  return viewers.every(v => Z.hides(gx, gy, zones, v) || (Z.viewerBlinded && Z.viewerBlinded(v, zones) && Z.pointIn && zones.some(z => z.blindedInside && Z.pointIn(z, v.x, v.y))));
}
function zoneHidesToken(t, sight) {
  if (!t || !t.pos) return false;
  const gx = t.pos.x + (t.size || 1) / 2;
  const gy = t.pos.y + (t.size || 1) / 2;
  return zoneHidesPoint(gx, gy, sight);
}
function paintStickyMarks(ctx, t, s, r) {
  const FX = window.SSDNSMapFx;
  if (!FX || !FX.stickyLook || !t) return;
  const names = [];
  (t.conditions || []).forEach(c => names.push(typeof c === "string" ? c : (c && c.name) || ""));
  try { tokenConditions(t).forEach(c => names.push(typeof c === "string" ? c : (c && c.name) || "")); } catch (e) {}
  const seen = {};
  names.forEach(name => {
    const look = FX.stickyLook(name);
    if (!look || seen[look]) return;
    seen[look] = 1;
    const col = (FX.chunkColor && FX.chunkColor(look)) || "185,170,180";
    ctx.save();
    ctx.globalAlpha = 0.42;
    ctx.strokeStyle = "rgba(" + col + ",0.9)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(s.x, s.y, r + 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  });
}
function syncPieceOrigin(t) {
  if (role !== "dm" || !t || !t.spellPiece || !t.zoneId || !t.pos) return;
  const zones = spellZoneList();
  const z = zones.find(one => one && String(one.id) === String(t.zoneId));
  if (!z || !z.origin) return;
  if (z.origin.x === t.pos.x && z.origin.y === t.pos.y) return;
  z.origin = { x: t.pos.x, y: t.pos.y };
  state.zoneSeq = Date.now();
  publishZoneFeed(zones);
  persistSpellZones();
}
function syncSpellPieces() {
  const Tok = window.SSDNSSpellTokens;
  if (!Tok || role !== "dm") return;
  const zones = spellZoneList();
  const want = {};
  zones.forEach(z => {
    if (!z || !z.id) return;
    const row = Tok.spec(z.key || z.spell);
    if (!row || row.kind !== "token") return;
    want[String(z.id)] = { zone: z, row: row };
  });
  const drop = (state.tokens || []).filter(t => t && t.spellPiece && t.zoneId && !want[String(t.zoneId)]).map(t => t.id);
  if (drop.length) removeMapTokens(drop, { silent: true, keepOwner: true });
  Object.keys(want).forEach(id => {
    const z = want[id].zone;
    const row = want[id].row;
    let existing = (state.tokens || []).find(t => t && String(t.zoneId) === id);
    const at = { x: Math.floor(Number(z.origin && z.origin.x) || 0), y: Math.floor(Number(z.origin && z.origin.y) || 0) };
    if (!existing) {
      existing = makeToken({
        kind: "spell",
        name: row.name,
        label: row.label,
        size: row.squares,
        image: row.image,
        color: row.color,
        pos: at,
        spellPiece: row.key,
        zoneId: id,
        moveFeet: row.moveFeet,
        ownerCanMove: row.moveFeet > 0
      });
      if (existing && existing.image) loadTokenImage(existing);
      if (existing) saveToken(existing.id);
      return;
    }
    const dragging = state.drag && state.drag.token && state.drag.token.id === existing.id;
    if (!dragging && existing.pos && (existing.pos.x !== at.x || existing.pos.y !== at.y)) {
      existing.pos = { x: at.x, y: at.y };
      if (shared.tokens[existing.id]) shared.tokens[existing.id].pos = { x: at.x, y: at.y };
      saveToken(existing.id);
    }
  });
}
function zoneIsToken(zone) {
  if (!zone) return false;
  if (zone.createToken) return true;
  const Tok = window.SSDNSSpellTokens;
  return !!(Tok && Tok.isToken && Tok.isToken(zone.key || zone.spell));
}
function paintTokenAura(zone, px) {
  if (!zone || !zone.origin) return;
  const Tok = window.SSDNSSpellTokens;
  const row = Tok && Tok.spec ? Tok.spec(zone.key || zone.spell) : null;
  const aura = row ? Number(row.aura) : 0;
  const squares = (row && row.squares) || Number(zone.footprint) || 1;
  const wx = (Number(zone.origin.x) + squares / 2) * px;
  const wy = (Number(zone.origin.y) + squares / 2) * px;
  if (aura > 0) strokeRing(wx, wy, (aura / 5) * px, "rgba(255,220,140,0.8)", "rgba(255,220,140,0.06)");
  if (role === "dm") {
    const tag = worldToScreen(wx, wy);
    const left = zoneTimeLabel(zone);
    ctx.save();
    ctx.font = "12px sans-serif";
    ctx.fillStyle = "#fff8e8";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText((zone.spell || "Token") + (left ? " · " + left : ""), tag.x, tag.y);
    ctx.restore();
  }
}
function zoneStyle(key) {
  const styles = {
    darkness: ["rgba(0,0,0,0.88)", "rgba(90,90,120,0.95)"],
    "fog cloud": ["rgba(186,186,196,0.62)", "rgba(230,230,236,0.95)"],
    "hunger of hadar": ["rgba(6,3,8,0.9)", "rgba(80,125,185,0.55)"],
    light: ["rgba(255,214,90,0.16)", "rgba(255,206,80,0.98)"],
    daylight: ["rgba(255,236,160,0.2)", "rgba(255,230,120,0.98)"],
    "wall of fire": ["rgba(255,90,16,0.5)", "rgba(255,150,40,0.98)"],
    "wall of ice": ["rgba(150,220,255,0.42)", "rgba(190,240,255,0.98)"],
    "wall of thorns": ["rgba(30,110,40,0.5)", "rgba(90,190,70,0.98)"],
    "blade barrier": ["rgba(210,210,220,0.42)", "rgba(240,240,248,0.98)"],
    "wind wall": ["rgba(214,184,120,0.34)", "rgba(230,200,140,0.95)"],
    "cloud of daggers": ["rgba(180,180,190,0.35)", "rgba(220,220,230,0.95)"],
    "flaming sphere": ["rgba(255,90,16,0.45)", "rgba(255,160,40,0.98)"],
    moonbeam: ["rgba(210,220,255,0.28)", "rgba(230,236,255,0.98)"],
    "call lightning": ["rgba(120,170,255,0.28)", "rgba(180,210,255,0.95)"],
    "spiritual weapon": ["rgba(200,180,255,0.3)", "rgba(220,200,255,0.95)"],
    "spirit guardians": ["rgba(255,220,120,0.22)", "rgba(255,210,80,0.95)"],
    cloudkill: ["rgba(90,140,40,0.4)", "rgba(140,180,60,0.95)"],
    "insect plague": ["rgba(120,90,40,0.35)", "rgba(160,120,50,0.95)"],
    "incendiary cloud": ["rgba(255,70,20,0.4)", "rgba(255,120,40,0.98)"],
    "guardian of faith": ["rgba(255,230,160,0.28)", "rgba(255,220,120,0.98)"],
    "delayed blast fireball": ["rgba(255,60,20,0.45)", "rgba(255,140,40,0.98)"]
  };
  return styles[key] || ["rgba(200,180,80,0.28)", "rgba(230,210,120,0.95)"];
}
function zonePaintViewer() {
  if (role !== "player") return null;
  const t = (state.tokens || []).find(tok => tok && tok.ownerUid === uid && tok.pos);
  if (!t) return { x: 0, y: 0, devilsSight: false };
  return { x: t.pos.x + (t.size || 1) / 2, y: t.pos.y + (t.size || 1) / 2, devilsSight: !!t.devilsSight };
}
function traceZone(zone, px) {
  if (!zone || !zone.origin || !state.scene) return false;
  const wx = zone.origin.x * px;
  const wy = zone.origin.y * px;
  if (zone.shape !== "wall") {
    const c = worldToScreen(wx, wy);
    const r = Math.max(2, ((Number(zone.radius) || 0) / 5) * px * (state.view.zoom || 1));
    ctx.beginPath();
    ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
    return true;
  }
  const len = Number(zone.length) || 0;
  const w = Number(zone.width) || 5;
  const facing = Number(zone.facing) || 0;
  const ft = px / 5;
  const fx = Math.cos(facing), fy = Math.sin(facing), lx = -fy, ly = fx;
  const corners = [[-len / 2, -w / 2], [len / 2, -w / 2], [len / 2, w / 2], [-len / 2, w / 2]];
  ctx.beginPath();
  corners.forEach((c, i) => {
    const s = worldToScreen(wx + (fx * c[0] + lx * c[1]) * ft, wy + (fy * c[0] + ly * c[1]) * ft);
    if (i === 0) ctx.moveTo(s.x, s.y);
    else ctx.lineTo(s.x, s.y);
  });
  ctx.closePath();
  return true;
}
function paintSpellZones() {
  if (!state.scene) return;
  const zones = liveSpellZones();
  if (!zones.length) return;
  const px = state.scene.grid.px || 70;
  const Z = window.SSDNSSpellZones;
  const viewer = zonePaintViewer();
  zones.forEach(zone => {
    if (zoneIsToken(zone)) {
      paintTokenAura(zone, px);
      return;
    }
    const style = zoneStyle(zone.key);
    const obscures = !!(zone.heavilyObscured || zone.magicalDark || zone.noLight || zone.blindedInside);
    let solid = role === "dm";
    if (role === "player" && obscures && Z && Z.hides) {
      solid = !viewer || Z.hides(zone.origin.x, zone.origin.y, [zone], viewer);
    }
    if (!traceZone(zone, px)) return;
    ctx.save();
    ctx.fillStyle = style[0];
    ctx.globalAlpha = solid ? 1 : 0.4;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = style[1];
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
    if (role === "dm" && zone.origin) {
      const tag = worldToScreen(zone.origin.x * px, zone.origin.y * px);
      const left = zoneTimeLabel(zone);
      ctx.save();
      ctx.font = "12px sans-serif";
      ctx.fillStyle = "#fff8e8";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText((zone.spell || "Zone") + (left ? " · " + left : ""), tag.x, tag.y);
      ctx.restore();
    }
    if (zone.light) {
      const brightFt = Number(zone.light.bright) || 0;
      const dimFt = Number(zone.light.dim) || 0;
      const wx = zone.origin.x * px;
      const wy = zone.origin.y * px;
      if (dimFt > 0) strokeRing(wx, wy, ((brightFt + dimFt) / 5) * px, "rgba(160,190,255,0.9)", "rgba(120,160,220,0.08)");
      if (brightFt > 0) strokeRing(wx, wy, (brightFt / 5) * px, "rgba(255,206,80,0.98)", "rgba(255,196,60,0.16)");
    }
  });
}
function paintZoneBlind() {
  if (role !== "player" || !state.scene) return;
  const Z = window.SSDNSSpellZones;
  const viewer = zonePaintViewer();
  if (!Z || !viewer || !Z.viewerBlinded || !Z.viewerBlinded(viewer, spellZoneList())) return;
  const box = viewBox();
  ctx.save();
  ctx.fillStyle = "rgba(6,0,10,0.92)";
  ctx.fillRect(0, 0, box.w, box.h);
  ctx.restore();
}
function stampDispelledLights() {
  const Z = window.SSDNSSpellZones;
  if (!Z || !Z.dispelledCarried) return;
  const zones = spellZoneList();
  (state.tokens || []).forEach(t => {
    if (!t || !t.pos || !Array.isArray(t.lights)) return;
    const c = fxCenter(t);
    if (!t._dispelledLights) t._dispelledLights = {};
    Z.dispelledCarried(zones, t.lights.map(l => Object.assign({ x: c.x, y: c.y }, l))).forEach(l => {
      const id = l.id || l.name;
      if (id) t._dispelledLights[id] = true;
    });
    t.lights.forEach(l => {
      if (l && t._dispelledLights[l.id || l.name]) { l.out = true; l._zoneOut = true; }
    });
  });
}
function zoneTimeLabel(zone) {
  const n = Number(zone && zone.roundsLeft);
  if (!(n > 0)) return (zone && zone.dur) || "";
  if (n % 600 === 0) return (n / 600) + (n === 600 ? " hour" : " hours");
  if (n % 10 === 0) return (n / 10) + " min";
  return n + " rd";
}
function buryZones(list) {
  (list || []).forEach(z => { if (z && z.id) state.zoneGone[String(z.id)] = 1; });
}
function renderZoneClear() {
  if (role !== "dm") return;
  const box = q("zoneList");
  if (!box) return;
  const zones = spellZoneList();
  box.textContent = "";
  if (!zones.length) {
    box.textContent = "None";
    return;
  }
  zones.forEach(zone => {
    const b = document.createElement("button");
    b.type = "button";
    const left = zoneTimeLabel(zone);
    b.textContent = "Clear " + (zone.spell || "grid") + (left ? " · " + left : "");
    b.title = "Remove this " + (zone.spell || "spell") + " grid";
    b.addEventListener("click", () => clearSpellGrid({ id: zone.id }));
    box.appendChild(b);
  });
}
function adoptSpellZones(list, seq) {
  const next = (Array.isArray(list) ? list : []).map(z => Object.assign({}, z));
  state.spellZones = next.filter(z => !(z && z.id && state.zoneGone[String(z.id)]));
  state.spellZonesLive = true;
  if (seq) state.zoneSeq = Number(seq) || state.zoneSeq;
  stampDispelledLights();
  renderZoneClear();
  requestDraw();
  try {
    window.dispatchEvent(new CustomEvent("ssdns-zones-live", { detail: { zones: state.spellZones.slice(), seq: state.zoneSeq } }));
  } catch (e) {}
  syncSpellPieces();
}
function persistSpellZones() {
  if (role !== "dm") return;
  try {
    const sd = sceneData();
    sd.spellZones = (state.spellZones || []).map(z => Object.assign({}, z));
    sd.zoneSeq = state.zoneSeq;
    saveScene();
  } catch (e) {}
}
function publishZoneFeed(zones) {
  if (!adapter || !adapter.write || !uid) return;
  const id = "zone_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const row = {
    id: id, ts: new Date().toISOString(), from: uid,
    fromName: role === "dm" ? "DM" : "Player",
    text: "zone", kind: "sfx", event: "zone",
    zones: zones, zoneSeq: state.zoneSeq
  };
  try {
    const p = adapter.write("tableFeed/" + id, row, { by: uid });
    if (p && p.catch) p.catch(() => {});
  } catch (e) {}
}
function applyZoneFeed(row) {
  if (!row || row.event !== "zone" || !Array.isArray(row.zones)) return;
  if (row.from && row.from === uid) return;
  const seq = Number(row.zoneSeq) || 0;
  if (state.spellZonesLive && seq && state.zoneSeq && seq < state.zoneSeq) return;
  adoptSpellZones(row.zones, seq || Date.now());
  persistSpellZones();
}
function clampZoneRounds(existing, incoming) {
  const prev = {};
  (existing || []).forEach(z => { if (z && z.id && z.roundsLeft != null) prev[String(z.id)] = z; });
  return (incoming || []).map(z => {
    const old = z && z.id ? prev[String(z.id)] : null;
    if (!old) return Object.assign({}, z);
    const left = Number(old.roundsLeft);
    const next = Number(z.roundsLeft);
    if (isFinite(left) && isFinite(next) && left < next) {
      return Object.assign({}, z, { roundsLeft: left, rounds: old.rounds != null ? old.rounds : z.rounds });
    }
    return Object.assign({}, z);
  });
}
function setSpellZones(zones, opts) {
  opts = opts || {};
  const casterId = opts.casterId || "";
  const existing = spellZoneList() || [];
  const incoming = clampZoneRounds(existing, (Array.isArray(zones) ? zones : []).filter(z => !(z && z.id && state.zoneGone[String(z.id)])));
  const keep = existing.filter(z => casterId && z && z.casterId && z.casterId !== casterId);
  const merged = keep.concat(incoming.map(z => Object.assign({}, z, { casterId: z.casterId || casterId })));
  const Z = window.SSDNSSpellZones;
  const settled = Z && Z.settle ? Z.settle(merged) : { zones: merged };
  const still = {};
  (settled.zones || []).forEach(z => { if (z && z.id) still[String(z.id)] = 1; });
  existing.forEach(z => { if (z && z.id && !still[String(z.id)]) state.zoneGone[String(z.id)] = 1; });
  state.zoneSeq = Date.now();
  adoptSpellZones(settled.zones, state.zoneSeq);
  publishZoneFeed(state.spellZones);
  persistSpellZones();
}
/* One Clear tool. DM only: one grid instance, or every grid in the scene. */
function clearSpellGrid(opts) {
  if (role !== "dm") return { zones: spellZoneList(), removed: [], logs: [] };
  opts = opts || {};
  const Z = window.SSDNSSpellZones;
  const current = spellZoneList();
  if (!Z || !Z.clearZones) {
    toast("Spell grids are not loaded");
    return { zones: current, removed: [], logs: [] };
  }
  if (opts.all) {
    if (!current.length) { toast("No spell grid in this scene"); return { zones: current, removed: [], logs: [] }; }
    const ask = "Clear all " + current.length + " spell grid" + (current.length === 1 ? "" : "s") + " in this scene?";
    const yes = opts.confirmed ? true : (typeof window.confirm === "function" ? window.confirm(ask) : true);
    if (!yes) { toast("Kept the spell grids"); return { zones: current, removed: [], logs: [] }; }
  }
  const result = Z.clearZones(current, opts);
  if (!result.removed.length) {
    toast(opts.id ? "That grid is already gone" : "No spell grid in this scene");
    return result;
  }
  buryZones(result.removed);
  state.zoneSeq = Date.now();
  adoptSpellZones(result.zones, state.zoneSeq);
  publishZoneFeed(state.spellZones);
  persistSpellZones();
  result.logs.forEach(line => toast(line));
  try {
    window.dispatchEvent(new CustomEvent("ssdns-zone-clear", {
      detail: { removed: result.removed.slice(), logs: result.logs.slice(), all: !!opts.all }
    }));
  } catch (e) {}
  return result;
}
function tokenSnapshot(id) {
  const t = tokenByRef(id);
  if (!t || !t.pos) return null;
  return {
    id: t.id, x: Number(t.pos.x), y: Number(t.pos.y), size: t.size || 1,
    devilsSight: !!t.devilsSight, darkvision: Number(t.darkvision) || 0,
    name: t.name || t.label || ""
  };
}
function zoneTurnKey() {
  const init = state.initiative || {};
  if (!init.started && init.round == null) return "";
  return (init.round || 1) + ":" + (init.turn || 0);
}
function dispatchZoneTicks(ticks, mover, from, to) {
  if (!ticks || !ticks.length) return;
  const Z = window.SSDNSSpellZones;
  state.zoneSeen = state.zoneSeen || {};
  const turnKey = zoneTurnKey();
  const tokenId = (mover && (mover.combatantId || mover.ownerUid || mover.id)) || "";
  const fresh = !turnKey || !Z || !Z.once ? ticks : ticks.filter(t => Z.once(state.zoneSeen, t, (t && t.targetId) || tokenId, turnKey));
  if (!fresh.length) return;
  try {
    window.dispatchEvent(new CustomEvent("ssdns-zone-tick", {
      detail: { ticks: fresh, tokenId: mover && mover.id, ownerUid: mover && mover.ownerUid, from: from, to: to }
    }));
  } catch (e) {}
}
function sweepFollow(mover, from, to) {
  const Z = window.SSDNSSpellZones;
  if (!Z || !mover || !from || !to) return;
  const ids = [mover.id, mover.ownerUid, mover.combatantId].filter(Boolean);
  const owned = spellZoneList().filter(z => z && z.follow && ids.some(id => id === z.casterId || id === z.followId));
  if (!owned.length) return;
  const s = mover.size || 1;
  (state.tokens || []).forEach(t => {
    if (!t || !t.pos || t.id === mover.id) return;
    const ticks = [];
    owned.forEach(z => {
      const oldZ = Object.assign({}, z, { origin: { x: from.x + s / 2, y: from.y + s / 2 } });
      const newZ = Object.assign({}, z, { origin: { x: to.x + s / 2, y: to.y + s / 2 } });
      const tok = {
        x: t.pos.x, y: t.pos.y, size: t.size || 1,
        id: t.combatantId || t.ownerUid || t.id,
        ownerUid: t.ownerUid || "",
        name: t.name || t.label || ""
      };
      if (Z.tokenIn(oldZ, tok, 0) || !Z.tokenIn(newZ, tok, 0)) return;
      Z.phaseDue({ zones: [newZ] }, tok, "enter").forEach(tick => ticks.push(tick));
    });
    if (ticks.length) dispatchZoneTicks(ticks, t, from, to);
  });
}
function noteZoneCross(mover, from, to) {
  const Z = window.SSDNSSpellZones;
  if (!Z || !Z.moveDue || !mover || !from || !to) return;
  if (from.x === to.x && from.y === to.y) return;
  const token = {
    id: mover.combatantId || mover.ownerUid || mover.id,
    ownerUid: mover.ownerUid || "",
    name: mover.name || mover.label || "",
    x: to.x, y: to.y, size: mover.size || 1
  };
  const ticks = Z.moveDue(liveSpellZones(), from, to, token);
  dispatchZoneTicks(ticks, mover, from, to);
  sweepFollow(mover, from, to);
}
function rangedWeaponShot(attack) {
  if (!attack) return false;
  const id = String(attack.id || "");
  if (attack.spell || attack.kind === "spell" || id.indexOf("spell:") === 0) return false;
  const blob = (String(attack.kind || "") + " " + String(attack.group || "") + " " + String(attack.type || "") + " " + String(attack.name || "")).toLowerCase();
  if (/\bmelee\b/.test(blob) && !/\b(ranged|gun|firearm|bow|thrown|rifle|pistol)\b/.test(blob)) return false;
  if (/\b(ranged|gun|firearm|bow|thrown|rifle|pistol)\b/.test(blob)) return true;
  const n = parseInt(String(attack.range || attack.normal || ""), 10);
  return n > 5;
}
/* the token a target id names (combatant id, token id, player uid, sheet id) */
function targetToken(id) {
  if (!id) return null;
  return tokenByRef(id) || (state.tokens || []).find(t => t && (t.sheetId === id || t.playerId === id)) || null;
}
/* null = the map can't judge (no such token on the map): callers keep their old behaviour */
function canPlayerSee(viewerUid, targetId) {
  if (!viewerUid || !targetId || targetId === FREE_SHOT) return null;
  const tok = targetToken(targetId);
  if (!tok) return null;
  if (tok.ownerUid && tok.ownerUid === viewerUid) return true;
  return tokenSeenBy(tok, sightFor(viewerUid));
}
/* the weapon the player has picked on the map (the Range picker); first one when none picked */
function playerSightWeapon() {
  if (role !== 'player') return null;
  let choices = state.rangeChoices && state.rangeChoices.length ? state.rangeChoices : null;
  if (!choices) { try { choices = currentRangeChoices(); } catch (e) { choices = []; } }
  return (choices || []).filter(c => c.id === state.rangeWeaponId)[0] || (choices || [])[0] || null;
}
/* { visible, outOfRange, feet, band } for this player and a target id, or null when the map can't judge */
function targetSight(targetId) {
  if (role !== 'player' || !targetId || targetId === FREE_SHOT) return null;
  const tok = targetToken(targetId);
  if (!tok) return null;
  const mine = (state.tokens || []).find(t => t && t.ownerUid === uid);
  if (mine && mine.id === tok.id) return { visible: true, outOfRange: false, feet: 0, band: '' };
  const visible = tokenSeenBy(tok, sightFor(uid));
  const weapon = playerSightWeapon();
  const verdict = visible && weapon && mine ? rangeButtonNote(weapon, tok.id, mine.id) : null;
  const feet = mine ? feetBetween(mine, tok) : null;
  return { visible: visible, outOfRange: !!(verdict && verdict.band === 'blocked'), feet: feet, band: (verdict && verdict.band) || '', weapon: weapon ? (weapon.name || weapon.id) : '' };
}
let sightSig = '';
/* the sheet's Target list rebuilds when what this player can see or reach changes */
function noteSightChange() {
  if (role !== 'player') return;
  const sight = sightFor(uid);
  const w = playerSightWeapon();
  const sig = (state.tokens || []).filter(t => t && t.pos).map(t => {
    const s = tokenSeenBy(t, sight) ? 1 : 0;
    const r = s ? targetSight(t.id) : null;
    return t.id + ':' + s + (r && r.outOfRange ? 'x' : '');
  }).join('|') + '#' + (w ? w.id : '');
  if (sig === sightSig) return;
  sightSig = sig;
  try { window.dispatchEvent(new CustomEvent('ssdns-map-sight', { detail: { uid: uid } })); } catch (e) {}
  if (state.drawerOpen || q('actionSlot')) { try { paintPlayerFight(); } catch (e) {} }
}
function clipShape(shape) {
  const px = state.scene.grid.px;
  if (!shape) return false;
  if (shape.kind === 'box' || shape.kind === 'square') {
    const a = worldToScreen(shape.x * px, shape.y * px);
    const b = worldToScreen((shape.x + shape.w) * px, (shape.y + shape.h) * px);
    ctx.beginPath();
    ctx.rect(a.x, a.y, Math.max(1, b.x - a.x), Math.max(1, b.y - a.y));
    return true;
  }
  if (shape.kind === 'poly' && shape.points && shape.points.length >= 3) {
    tracePoly(shape.points, true);
    return true;
  }
  if (shape.kind === 'brush' && shape.cells && shape.cells.length) {
    ctx.beginPath();
    shape.cells.forEach(c => {
      const a = worldToScreen(c.x * px, c.y * px);
      const b = worldToScreen((c.x + 1) * px, (c.y + 1) * px);
      ctx.rect(a.x, a.y, Math.max(1, b.x - a.x), Math.max(1, b.y - a.y));
    });
    return true;
  }
  return false;
}
function paintPlayerFog(img, cols, rows, px, box) {
  const topLeft = worldToScreen(0, 0);
  const paintMap = () => {
    if (img) ctx.drawImage(img, topLeft.x, topLeft.y, cols * px * state.view.zoom, rows * px * state.view.zoom);
  };
  (sceneData().fogShapes || []).forEach(shape => {
    ctx.save();
    if (!clipShape(shape)) { ctx.restore(); return; }
    ctx.clip();
    if (shape.op === 'hide') {
      ctx.fillStyle = '#0a0806';
      ctx.fillRect(0, 0, box.w, box.h);
    } else paintMap();
    ctx.restore();
  });
}
function paintFogShapes(px) {
  if (role !== 'dm') return;
  (sceneData().fogShapes || []).forEach(shape => {
    const selected = (state.fogSelection || []).indexOf(shape.id) >= 0;
    const hide = shape.op === 'hide';
    ctx.save();
    ctx.strokeStyle = selected ? 'rgba(255,255,255,0.95)' : (hide ? 'rgba(90,150,230,0.95)' : 'rgba(200,180,80,0.9)');
    ctx.fillStyle = hide ? 'rgba(12,28,60,0.35)' : 'rgba(200,180,80,0.16)';
    ctx.lineWidth = selected ? 3 : 2;
    ctx.setLineDash(selected ? [] : [4, 4]);
    if (clipShape(shape)) { ctx.fill(); ctx.stroke(); }
    ctx.restore();
  });
  if ((state.tool === 'reveal' || state.tool === 'hide') && state.fogKind === 'poly' && state.polyPoints && state.polyPoints.length) {
    ctx.save();
    ctx.strokeStyle = state.tool === 'hide' ? 'rgba(140,190,255,0.95)' : 'rgba(255,220,120,0.95)';
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.beginPath();
    state.polyPoints.forEach((p, i) => {
      const s = worldToScreen(p.x * px, p.y * px);
      if (i === 0) ctx.moveTo(s.x, s.y);
      else ctx.lineTo(s.x, s.y);
    });
    if (state.polyHover) {
      const h = worldToScreen(state.polyHover.x, state.polyHover.y);
      ctx.lineTo(h.x, h.y);
    }
    ctx.stroke();
    state.polyPoints.forEach((p, i) => {
      const s = worldToScreen(p.x * px, p.y * px);
      ctx.beginPath();
      ctx.arc(s.x, s.y, i === 0 ? 6 : 4, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }
  if (state.drag && state.drag.fog && state.fogStart) {
    const pts = [...pointers.values()];
    if (pts.length) {
      const cur = screenToWorld(pts[0].x, pts[0].y);
      const x1 = Math.min(state.fogStart.x, cur.x);
      const y1 = Math.min(state.fogStart.y, cur.y);
      const x2 = Math.max(state.fogStart.x, cur.x);
      const y2 = Math.max(state.fogStart.y, cur.y);
      const a = worldToScreen(x1, y1);
      const b = worldToScreen(x2, y2);
      ctx.save();
      ctx.strokeStyle = state.tool === 'hide' ? 'rgba(140,190,255,0.95)' : 'rgba(255,220,120,0.95)';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
      ctx.restore();
    }
  }
  if (state.brushCells && state.brushCells.length) {
    ctx.save();
    ctx.fillStyle = state.tool === 'hide' ? 'rgba(80,140,220,0.45)' : 'rgba(255,220,120,0.45)';
    state.brushCells.forEach(c => {
      const a = worldToScreen(c.x * px, c.y * px);
      const b = worldToScreen((c.x + 1) * px, (c.y + 1) * px);
      ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
    });
    ctx.restore();
  }
}
function paintZoom() {
  const z = q('zoomLabel');
  if (z) z.textContent = (state.view.zoom || 1).toFixed(2) + '×';
}

function rangeToken() {
  if (role === 'player') return state.tokens.find(t => t && t.ownerUid === uid) || null;
  return state.selected || null;
}
function choiceFromAttack(a, feats) {
  feats = feats || {};
  if (!a) return null;
  const id = String(a.id || a.name || '');
  if (!id) return null;
  return {
    id: id,
    name: a.name || a.id || 'Weapon',
    weapon: a.weapon || '',
    range: a.range || '',
    properties: Array.isArray(a.properties) ? a.properties.join(', ') : (a.properties || ''),
    group: a.group || '',
    kind: a.kind || '',
    mod: a.mod || '',
    tier: a.tier || '',
    unwieldy: !!a.unwieldy,
    scatter: !!a.scatter,
    load: a.load || '',
    scope: !!(a.scope || /scope/i.test(a.mod || '')),
    longRangeHex: !!(a.longRangeHex || feats.longRangeHex),
    sharpshooter: !!(a.sharpshooter || feats.sharpshooter)
  };
}
function currentRangeChoices() {
  const token = rangeToken();
  if (!token) return [];
  if (role === 'player' && typeof host.rangeWeapons === 'function') {
    try { return host.rangeWeapons() || []; } catch (e) { return []; }
  }
  const card = lookupCard(token.id) || lookupCard(token.combatantId) || lookupCard(token.ownerUid);
  if (!card) return [];
  const feats = { longRangeHex: !!card.longRangeHex, sharpshooter: !!card.sharpshooter };
  const list = [];
  (card.attacks || []).forEach(a => {
    const choice = choiceFromAttack(a, feats);
    if (choice) list.push(choice);
  });
  (card.items || []).forEach(item => {
    if (!window.SSDNSItems || !window.SSDNSItems.ringSpec) return;
    const spec = window.SSDNSItems.ringSpec(item);
    if (spec) list.push(spec);
  });
  (card.spells || []).forEach(s => {
    if (!s) return;
    const range = s.range || (window.SSDNSSpellCast && window.SSDNSSpellCast.rangeOf && window.SSDNSSpellCast.rangeOf(s.name)) || '';
    if (!range) return;
    list.push({
      id: 'spell:' + (s.id || s.name),
      name: s.name || 'Spell',
      kind: 'spell',
      spell: true,
      spellKind: s.kind || 'attack',
      range: range,
      longRangeHex: !!feats.longRangeHex
    });
  });
  return list;
}
const MAP_COND_ICONS = { unconscious: '\u{1F4A4}', paralyzed: '\u26A1', poisoned: '\u2620\uFE0F', stunned: '\u{1F4AB}', prone: '\u2B07\uFE0F' };
function condIcon(name) {
  const C = window.SSDNSConditions;
  if (C && typeof C.icon === 'function') return C.icon(name);
  return MAP_COND_ICONS[String(name || '').toLowerCase()] || '\u25CF';
}
/* Every condition on a token: the map's own toolbar list + the linked combatant's tracked conditions (initiative
   copy; masked for hidden enemies on the player side) + the player's own sheet for their own token. */
function tokenConditions(t) {
  if (!t) return [];
  const out = [];
  const seen = {};
  const add = (raw) => {
    const name = String((raw && typeof raw === 'object' ? (raw.name || raw.label) : raw) || '').trim();
    if (!name) return;
    const key = name.toLowerCase().replace(/\s+\d+r?$/, '');
    if (seen[key]) return;
    seen[key] = 1;
    out.push(name);
  };
  (t.conditions || []).forEach(add);
  if (t.hidden && role !== 'dm') return out;
  const order = (state.initiative && state.initiative.order) || [];
  const row = order.find(o => o && ((t.combatantId && (o.id === t.combatantId || o.playerId === t.combatantId)) ||
    (t.ownerUid && (o.playerId === t.ownerUid || o.id === t.ownerUid)) || o.id === t.id));
  if (row && !(row.mapHidden && role !== 'dm')) (row.conditions || []).forEach(add);
  if (role === 'player' && t.ownerUid && t.ownerUid === uid && window.SSDNSApp && window.SSDNSApp.doc) {
    try {
      const c = window.SSDNSApp.doc().character;
      ((c && c.activeConditions) || []).forEach(add);
    } catch (e) {}
  }
  return out;
}
function paintRangeControls() {
  const on = !!state.showRange;
  const box = q('showRange');
  const drawerBox = q('drawerRange');
  if (box && box.checked !== on) box.checked = on;
  if (drawerBox && drawerBox.checked !== on) drawerBox.checked = on;
  const choices = on ? currentRangeChoices() : [];
  state.rangeChoices = choices;
  const sig = choices.map(c => c.id).join('|');
  [q('rangeWeapon'), q('drawerRangeWeapon')].forEach(sel => {
    if (!sel) return;
    sel.hidden = !on || !choices.length;
    if (sel.getAttribute('data-sig') !== sig) {
      sel.setAttribute('data-sig', sig);
      sel.innerHTML = choices.map(c => '<option value="' + esc(c.id) + '">' + esc(c.name || c.id) + '</option>').join('');
    }
    if (state.rangeWeaponId && choices.some(c => c.id === state.rangeWeaponId)) sel.value = state.rangeWeaponId;
    else if (choices[0]) {
      state.rangeWeaponId = choices[0].id;
      sel.value = choices[0].id;
    }
  });
}
function onRangeToggle(on) {
  state.showRange = !!on;
  if (state.showRange && role === 'dm' && !state.selected) toast('Select a token');
  if (state.showRange && role === 'player' && !rangeToken()) toast('No token found');
  paintRangeControls();
  const choices = state.rangeChoices || [];
  if (state.showRange && !choices.length) toast(role === 'player' ? 'No equipped weapon' : 'No equipped weapon on this token');
  requestDraw();
}
function bindRangeUi() {
  const box = q('showRange');
  const sel = q('rangeWeapon');
  if (box && !box.dataset.bound) {
    box.dataset.bound = '1';
    box.addEventListener('change', () => onRangeToggle(box.checked));
  }
  if (sel && !sel.dataset.bound) {
    sel.dataset.bound = '1';
    sel.addEventListener('change', () => {
      state.rangeWeaponId = sel.value;
      const other = q('drawerRangeWeapon');
      if (other) other.value = sel.value;
      requestDraw();
    });
  }
}
function refreshRangeSurfaces() {
  if (role === 'player') paintPlayerFight();
  else if (state.drawerOpen) renderDrawer();
}
function markRangeMoved(id, from, to) {
  if (!id || !from || !to) return;
  if (from.x === to.x && from.y === to.y) return;
  if (!state.rangeMoved) state.rangeMoved = {};
  state.rangeMoved[id] = true;
}
function paintRangeRings() {
  if (!state.showRange || !window.SSDNSRangeRings) {
    el.dataset.rangeBand = '';
    return;
  }
  const token = rangeToken();
  if (!token || !token.pos) {
    el.dataset.rangeBand = '';
    return;
  }
  const choices = state.rangeChoices || [];
  const picked = choices.filter(c => c.id === state.rangeWeaponId)[0] || choices[0];
  if (!picked) return;
  const px = state.scene.grid.px;
  const moved = !!(state.rangeMoved && state.rangeMoved[token.id]);
  const pack = window.SSDNSRangeRings.rings(Object.assign({}, picked, {
    moved: moved,
    hostileFeet: nearestHostileFeet(token)
  }));
  const highlight = highlightBand(token, picked, pack.rings || []);
  el.dataset.rangeBand = highlight || '';
  /* N64: rings are measured from the footprint edge. The circle is still
     drawn around the centre, so the radius grows by half the footprint.
     A Large 5 ft reach then covers the squares that touch the 2×2. */
  const squares = tokSquares(token.size);
  const center = worldToScreen((token.pos.x + squares / 2) * px, (token.pos.y + squares / 2) * px);
  ctx.save();
  (pack.rings || []).forEach(ring => {
    const radius = ((ring.feet / 5) + squares / 2) * px * state.view.zoom;
    if (!(radius > 0)) return;
    const hot = ring.role === highlight;
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
    if (ring.fill) {
      ctx.fillStyle = hot ? ring.fill.replace(/0\.\d+\)/, "0.34)") : ring.fill;
      ctx.fill();
    }
    ctx.strokeStyle = ring.stroke;
    ctx.lineWidth = (ring.width || 2) + (hot ? 4 : 0);
    ctx.setLineDash([]);
    ctx.stroke();
  });
  if (pack.label) {
    ctx.font = '12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(12,8,6,0.8)';
    ctx.fillStyle = '#f4f0e8';
    const y = center.y - (squares * px * state.view.zoom) / 2 - 8;
    ctx.strokeText(pack.label, center.x, y);
    ctx.fillText(pack.label, center.x, y);
  }
  ctx.restore();
}
function paintAmmoColumn(ctx, s, r, rows) {
  const rowH = 15;
  const colX = s.x + r + 8;
  let y = s.y - ((rows.length - 1) * rowH) / 2;
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = '11px system-ui';
  rows.forEach(row => {
    const loaded = row && row.loaded != null ? row.loaded : 0;
    const cap = row && row.cap != null ? row.cap : 0;
    /* SAMPLE trackers: non-gun rows bring their own text ("18" arrows, "1·9" loaded·bolts, "2/3" javelins) */
    const label = row && row.text != null ? String(row.text) : loaded + '/' + cap;
    const tw = (ctx.measureText && ctx.measureText(label).width) || 22;
    ctx.fillStyle = 'rgba(20,16,12,0.9)';
    ctx.fillRect(colX - 2, y - 7, 16 + tw + 6, 14);
    /* 0.3.64: the round that fires next in this gun (falls back to the old gun glyph with no look) */
    if (row && row.look && row.look.type) paintRoundIcon(ctx, row.look, colX, y, 12);
    else if (row && (row.icon === 'bow' || row.icon === 'xbow' || row.icon === 'thrown')) paintWeaponIcon(ctx, row.icon, colX, y - 6, 12);
    else paintWeaponIcon(ctx, (row && row.icon) || 'pistol', colX, y - 5, 11);
    /* empty gun: the count goes muted red */
    ctx.fillStyle = loaded > 0 ? '#e2c56a' : '#c27a70';
    ctx.font = '11px system-ui';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, colX + 14, y);
    y += rowH;
  });
  ctx.restore();
}
/* 0.3.64: token ammo badge round, drawn side-on in the #73 round art colours. look = SSDNSAmmoDisplay.roundLook().
   cart = brass case + copper tip; rf22 = small brass .22; ball = lead ball + percussion cap;
   shell = brass head + hull in the gauge colour (slug: black band); hex = purple round with its level. */
function paintRoundIcon(ctx, look, x, y, w) {
  const type = look.type;
  ctx.save();
  ctx.translate(x, y);
  ctx.lineWidth = 0.6;
  if (type === 'shell') {
    const h = 7, head = 3.4;
    ctx.fillStyle = '#d7b15e'; ctx.strokeStyle = '#8a6a32';
    ctx.fillRect(0, -h / 2 - 0.6, 1.4, h + 1.2);
    ctx.fillRect(1.4, -h / 2, head, h);
    ctx.fillStyle = look.hull || '#c4322e'; ctx.strokeStyle = look.hullDark || '#8e241f';
    ctx.fillRect(1.4 + head, -h / 2, w - 1.4 - head, h);
    ctx.strokeRect(1.4 + head, -h / 2, w - 1.4 - head, h);
    if (look.slug) { ctx.fillStyle = '#111111'; ctx.fillRect(1.4 + head + (w - head) * 0.3, -h / 2, (w - head) * 0.3, h); }
  } else if (type === 'hex') {
    ctx.fillStyle = look.tone || '#8b5cf6';
    ctx.shadowColor = 'rgba(160,120,255,0.8)'; ctx.shadowBlur = 3;
    ctx.beginPath(); ctx.arc(w / 2, 0, 5, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 7px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(look.hexLevel || 1), w / 2, 0.5);
  } else if (type === 'ball') {
    ctx.fillStyle = '#b8862f';
    ctx.fillRect(w - 3, -2, 3, 4);
    ctx.fillStyle = look.tone || '#7d8b99';
    ctx.beginPath(); ctx.arc(4.5, 0, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.beginPath(); ctx.arc(3.3, -1.3, 1.2, 0, Math.PI * 2); ctx.fill();
  } else {
    const small = type === 'rf22';
    const h = small ? 3.6 : 5, cw = small ? w * 0.5 : w * 0.6;
    ctx.fillStyle = look.tone || '#e0b44a'; ctx.strokeStyle = '#5c4316';
    ctx.fillRect(0, -h / 2, cw, h);
    ctx.strokeRect(0, -h / 2, cw, h);
    ctx.fillStyle = '#c2421f';
    ctx.beginPath();
    ctx.moveTo(cw, -h / 2 + 0.4);
    ctx.lineTo(cw + (small ? 3 : 3.4), -h / 2 + 0.4);
    ctx.quadraticCurveTo(w - (small ? 2 : 0), 0, cw + (small ? 3 : 3.4), h / 2 - 0.4);
    ctx.lineTo(cw, h / 2 - 0.4);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}
function paintWeaponIcon(ctx, kind, x, y, size) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#e2c56a';
  if (kind === 'shotgun') {
    ctx.fillRect(0, size * 0.22, size, size * 0.28);
    ctx.fillRect(size * 0.18, size * 0.48, size * 0.16, size * 0.42);
  } else if (kind === 'rifle') {
    ctx.fillRect(0, size * 0.32, size, size * 0.16);
    ctx.fillRect(size * 0.22, size * 0.48, size * 0.12, size * 0.4);
  } else if (kind === 'xbow') {
    /* SAMPLE trackers: crossbow = prod across the top of an upright stock */
    ctx.strokeStyle = '#e2c56a'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(size * 0.5, size * 0.75, size * 0.55, -Math.PI * 0.82, -Math.PI * 0.18); ctx.stroke();
    ctx.fillRect(size * 0.42, size * 0.1, size * 0.16, size * 0.9);
  } else if (kind === 'bow') {
    /* SAMPLE trackers: bow = arc + string + arrow */
    ctx.strokeStyle = '#e2c56a'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(size * 0.15, size * 0.5, size * 0.5, -Math.PI / 2.6, Math.PI / 2.6); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(size * 0.33, size * 0.05); ctx.lineTo(size * 0.33, size * 0.95); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, size * 0.5); ctx.lineTo(size, size * 0.5); ctx.stroke();
  } else if (kind === 'thrown') {
    ctx.beginPath(); ctx.moveTo(size, size * 0.1); ctx.lineTo(size * 0.62, size * 0.32); ctx.lineTo(size * 0.78, size * 0.48); ctx.closePath(); ctx.fill();
    ctx.fillRect(size * 0.05, size * 0.42, size * 0.7, size * 0.14);
  } else {
    ctx.fillRect(0, size * 0.2, size * 0.7, size * 0.2);
    ctx.fillRect(size * 0.28, size * 0.4, size * 0.16, size * 0.45);
  }
  ctx.restore();
}
/* N59 closed-door glyph. Players (and the DM's player-FOV preview) get a gap, a door slab,
   and an arch on a Door-tool segment they can see. The DM dashed editor line is separate.
   A secret/hidden door draws no glyph until the DM reveals it. Closed doors still stop
   light and movement; nothing here opens a gap under the door. */
const DOOR_GLYPH_GAP = '#140e0a';
const DOOR_GLYPH_JAMB = '#e6d2ae';
const DOOR_GLYPH_SLAB = '#8d5a32';
const DOOR_GLYPH_ARCH = '#f3e6c8';
function doorIsSecret(w) {
  return !!(w && (w.secret || w.hidden));
}
function winningFog(shapes, x, y) {
  let op = '';
  (shapes || []).forEach(sh => {
    if (sh && shapeContains(sh, x, y)) op = sh.op === 'hide' ? 'hide' : 'reveal';
  });
  return op;
}
function glyphRayBlocked(x1, y1, x2, y2, w) {
  if (!w || w.open || w.ajar || (w.window && !w.shut)) return false;
  const d = (x2 - x1) * (w.y2 - w.y1) - (y2 - y1) * (w.x2 - w.x1);
  if (Math.abs(d) < 1e-4) return false;
  const t = ((w.x1 - x1) * (w.y2 - w.y1) - (w.y1 - y1) * (w.x2 - w.x1)) / d;
  const u = ((w.x1 - x1) * (y2 - y1) - (w.y1 - y1) * (x2 - x1)) / d;
  return t > 0.02 && t < 0.98 && u > 0.02 && u < 0.98;
}
function doorGlyphSide(wall, sight, walls) {
  if (!wall || !wall.door || wall.open || doorIsSecret(wall) || !sight) return null;
  const mx = (Number(wall.x1) + Number(wall.x2)) / 2;
  const my = (Number(wall.y1) + Number(wall.y2)) / 2;
  const dx = Number(wall.x2) - Number(wall.x1);
  const dy = Number(wall.y2) - Number(wall.y1);
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const shapes = sight.shapes || [];
  const dark = sight.ambient !== 'bright' && sight.ambient !== 'dim';
  const sources = [];
  (sight.bubbles || []).forEach(b => {
    if (!b) return;
    sources.push({ x: b.x, y: b.y, radius: dark ? (Number(b.radius) || 0) : Infinity, cone: false });
  });
  if (dark) {
    (sight.lights || []).forEach(ls => {
      if (!ls) return;
      sources.push({
        x: ls.x, y: ls.y, radius: Number(ls.radius) || 0,
        cone: !!ls.cone, facing: ls.facing || 0, light: true
      });
    });
  }
  let best = null;
  sources.forEach(s => {
    const side = (s.x - mx) * nx + (s.y - my) * ny;
    if (Math.abs(side) < 0.04) return;
    const sign = side > 0 ? 1 : -1;
    const dist = Math.hypot(s.x - mx, s.y - my);
    if (dist > s.radius + 0.05) return;
    const gap = Math.min(0.2, Math.max(0.06, dist * 0.45));
    const px = mx + nx * sign * gap;
    const py = my + ny * sign * gap;
    if (s.light && !inLight({ x: s.x, y: s.y, radius: s.radius, cone: s.cone, facing: s.facing }, px, py)) return;
    if (winningFog(shapes, px, py) === 'hide') return;
    const list = walls || [];
    for (let i = 0; i < list.length; i++) {
      if (list[i] === wall) continue;
      if (glyphRayBlocked(s.x, s.y, px, py, list[i])) return;
    }
    if (!best || dist < best.dist) best = { nx: nx * sign, ny: ny * sign, dist: dist };
  });
  if (best) return best;
  if (winningFog(shapes, mx, my) === 'reveal') return { nx: nx, ny: ny, dist: Infinity };
  return null;
}
function paintOneDoorGlyph(wall, side, px, withGap) {
  const a = worldToScreen(wall.x1 * px, wall.y1 * px);
  const b = worldToScreen(wall.x2 * px, wall.y2 * px);
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const n0 = worldToScreen(0, 0);
  const n1 = worldToScreen(side.nx * px, side.ny * px);
  let snx = n1.x - n0.x;
  let sny = n1.y - n0.y;
  const sl = Math.hypot(snx, sny) || 1;
  snx /= sl;
  sny /= sl;
  const inset = Math.min(len * 0.14, 12);
  const ax = a.x + ux * inset;
  const ay = a.y + uy * inset;
  const bx = b.x - ux * inset;
  const by = b.y - uy * inset;
  const slab = Math.max(8, Math.min(len * 0.42, px * (state.view.zoom || 1) * 0.34));
  ctx.save();
  ctx.setLineDash([]);
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'miter';
  if (withGap) {
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.strokeStyle = DOOR_GLYPH_GAP;
    ctx.lineWidth = Math.max(7, slab * 0.55);
    ctx.stroke();
  }
  const tick = Math.max(5, slab * 0.35);
  ctx.beginPath();
  ctx.moveTo(ax - snx * tick, ay - sny * tick);
  ctx.lineTo(ax + snx * tick, ay + sny * tick);
  ctx.moveTo(bx - snx * tick, by - sny * tick);
  ctx.lineTo(bx + snx * tick, by + sny * tick);
  ctx.strokeStyle = DOOR_GLYPH_JAMB;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx, by);
  ctx.lineTo(bx + snx * slab, by + sny * slab);
  ctx.lineTo(ax + snx * slab, ay + sny * slab);
  ctx.closePath();
  ctx.fillStyle = DOOR_GLYPH_SLAB;
  ctx.fill();
  ctx.strokeStyle = '#c4a574';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.quadraticCurveTo(mx + snx * slab * 1.15, my + sny * slab * 1.15, bx, by);
  ctx.strokeStyle = DOOR_GLYPH_ARCH;
  ctx.lineWidth = 2;
  ctx.stroke();
  if (wall.ajar) {
    ctx.beginPath();
    ctx.moveTo(ax + ux * (len * 0.18), ay + sny * slab * 0.15);
    ctx.lineTo(mx + snx * slab * 0.55, my + sny * slab * 0.72);
    ctx.lineTo(bx - ux * (len * 0.12), by + sny * slab * 0.2);
    ctx.strokeStyle = '#f6e2b0';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  ctx.restore();
}
function doorGlyphSight() {
  if (role === 'player') return sightFor(uid, getPlayerScene());
  return buildSight(null, activeSceneId(), 'party');
}
function paintClosedDoorGlyphs() {
  if (!state.scene) return;
  if (role !== 'player' && !(role === 'dm' && state.showPlayerFov)) return;
  const walls = sceneData().walls || [];
  if (!walls.length) return;
  const sight = doorGlyphSight();
  const cell = state.scene.grid.px || 70;
  walls.forEach(w => {
    const side = doorGlyphSide(w, sight, walls);
    if (side) paintOneDoorGlyph(w, side, cell, role === 'player');
  });
}
function doorGlyphReport() {
  const sight = doorGlyphSight();
  const walls = sceneData().walls || [];
  return walls.filter(w => w && w.door).map(w => {
    const side = w.open ? null : doorGlyphSide(w, sight, walls);
    return {
      x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2,
      open: !!w.open,
      ajar: !!w.ajar,
      secret: doorIsSecret(w),
      shown: !!side,
      nx: side ? side.nx : 0,
      ny: side ? side.ny : 0
    };
  });
}
function draw() {
  publishTokenColors();
  if (!state.scene) return;
  try { sceneData(); } catch (e) { console.error(e); return; }
  ctx.globalAlpha = 1; // ensure no leaked alpha dims the DM view
  const { cols, rows, px } = state.scene.grid;
  const img = state.scene._img;
  const box = viewBox();
  ctx.clearRect(0, 0, box.w, box.h);

  syncOwnerLights();
  if (role === 'dm') syncSnapshotLights();
  else paintAddMine();
  const viewSight = role === 'player' ? sightFor(uid) : buildSight(null, (state.scene && state.scene.id) || '', 'party');
  const lightSources = (viewSight.lights || []).map(ls => ({
    x: ls.x * px, y: ls.y * px, radius: ls.radius, bright: (Number(ls.bright) || 0) / 5, cone: !!ls.cone, facing: ls.facing || 0
  }));

  const sight = role === 'player' ? sightFor(uid, getPlayerScene()) : null;
  const sightGun = role === 'player' ? playerSightWeapon() : null;
  const sightMine = role === 'player' ? state.tokens.find(t => t.ownerUid === uid) : null;
  if (role === 'player') noteSightChange();
  // map image — for players with fog on, only draw inside vision/revealed areas
  if (img) {
    if (role === 'player' && viewSight.fogOn) {
      ctx.fillStyle = '#0a0806';
      ctx.fillRect(0, 0, box.w, box.h);
      (viewSight.bubbles || []).forEach(b => drawVisible(b.x * px, b.y * px, b.radius * px));
      for (const ls of lightSources) drawVisible(ls.x, ls.y, ls.radius * px, ls);
      paintPlayerFog(img, cols, rows, px, box);
    } else if (role === 'player') {
      const topLeft = worldToScreen(0, 0);
      ctx.drawImage(img, topLeft.x, topLeft.y, cols * px * state.view.zoom, rows * px * state.view.zoom);
      if (viewSight.ambient === 'dim') {
        ctx.fillStyle = 'rgba(18, 24, 48, 0.42)';
        ctx.fillRect(0, 0, box.w, box.h);
        for (const ls of lightSources) if (ls.bright > 0) drawVisible(ls.x, ls.y, ls.bright * px, ls);
        (viewSight.bubbles || []).forEach(b => { if (b.darkvision) drawVisible(b.x * px, b.y * px, b.radius * px); });
      }
      paintPlayerFog(img, cols, rows, px, box);
    } else {
      // DM always sees the full map
      const topLeft = worldToScreen(0, 0);
      ctx.drawImage(img, topLeft.x, topLeft.y, cols * px * state.view.zoom, rows * px * state.view.zoom);

      /* Show Player FOV follows the ambient the players are under. Bright: no wash.
         Dim: blue wash, bright light and darkvision punched back. Dark: black fog. */
      if (role === 'dm' && state.showPlayerFov && img && viewSight.ambient !== 'bright') {
        if (viewSight.ambient === 'dim') {
          ctx.fillStyle = 'rgba(18, 24, 48, 0.42)';
          ctx.fillRect(0, 0, box.w, box.h);
          for (const ls of lightSources) if (ls.bright > 0) drawVisible(ls.x, ls.y, ls.bright * px, ls);
          (viewSight.bubbles || []).forEach(b => { if (b.darkvision) drawVisible(b.x * px, b.y * px, b.radius * px); });
        } else {
          ctx.fillStyle = 'rgba(0,0,0,0.55)';
          ctx.fillRect(0, 0, box.w, box.h);
          for (const ls of lightSources) drawVisible(ls.x, ls.y, ls.radius * px, ls);
          (viewSight.bubbles || []).forEach(b => drawVisible(b.x * px, b.y * px, b.radius * px));
        }
      }
    }
  }
  paintLightRings(viewSight, px);

  // walls
  if (sceneData().walls.length && role === 'dm' && state.showWalls) {
    for (const w of sceneData().walls) {
      const a = worldToScreen(w.x1 * px, w.y1 * px);
      const b = worldToScreen(w.x2 * px, w.y2 * px);
      const isDoor = !!w.door;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      if (w.open) {
        ctx.strokeStyle = 'rgba(80,220,120,0.95)';
        ctx.lineWidth = 5;
        ctx.setLineDash([6, 4]);
        ctx.stroke();
      } else if (w.window && w.shut) {
        ctx.lineWidth = 5;
        ctx.setLineDash([8, 8]);
        ctx.strokeStyle = 'rgba(120,190,255,0.95)';
        ctx.stroke();
        ctx.strokeStyle = 'rgba(220,60,60,0.95)';
        ctx.lineDashOffset = 8;
        ctx.stroke();
        ctx.lineDashOffset = 0;
      } else if (w.window) {
        ctx.strokeStyle = 'rgba(120,190,255,0.95)';
        ctx.lineWidth = 5;
        ctx.setLineDash([6, 4]);
        ctx.stroke();
      } else if (isDoor) {
        const secret = doorIsSecret(w);
        ctx.strokeStyle = secret ? 'rgba(230,180,70,0.95)' : 'rgba(220,60,60,0.95)';
        ctx.lineWidth = 5;
        ctx.setLineDash(secret ? [2, 5] : [6, 4]);
        ctx.stroke();
        if (secret) {
          ctx.save();
          ctx.setLineDash([]);
          ctx.fillStyle = 'rgba(230,180,70,0.95)';
          ctx.font = '11px system-ui';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillText('secret', (a.x + b.x) / 2, (a.y + b.y) / 2 - 6);
          ctx.restore();
        }
      } else {
        ctx.strokeStyle = 'rgba(200,160,80,0.85)';
        ctx.lineWidth = 3;
        ctx.setLineDash([]);
        ctx.stroke();
      }
    }
    ctx.setLineDash([]);
  }
  // marquee select box
  if (role === 'dm' && state.drag && state.drag.select) {
    const pts = [...pointers.values()];
    if (pts.length) {
      const x = Math.min(state.drag.sx, pts[0].x);
      const y = Math.min(state.drag.sy, pts[0].y);
      const w = Math.abs(pts[0].x - state.drag.sx);
      const h = Math.abs(pts[0].y - state.drag.sy);
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(x, y, w, h);
      ctx.fillRect(x, y, w, h);
      ctx.restore();
    }
  }
  if (role === 'dm' && state.tool === 'room' && state.roomStart) {
    const pts = [...pointers.values()];
    if (pts.length) {
      const cur = screenToWorld(pts[0].x, pts[0].y);
      const px = state.scene.grid.px;
      let gx = cur.x / px, gy = cur.y / px;
      if (state.snap) { gx = Math.round(gx); gy = Math.round(gy); }
      const a = worldToScreen(Math.min(state.roomStart.x, gx) * px, Math.min(state.roomStart.y, gy) * px);
      const b = worldToScreen(Math.max(state.roomStart.x, gx) * px, Math.max(state.roomStart.y, gy) * px);
      ctx.save();
      ctx.strokeStyle = 'rgba(255,220,100,1)';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
      ctx.restore();
    }
  }
  if (role === 'dm' && state.tool === 'wall' && state.wallStart) {
    const pts = [...pointers.values()];
    if (pts.length) {
      const cur = screenToWorld(pts[0].x, pts[0].y);
      const a = worldToScreen(state.wallStart.x * px, state.wallStart.y * px);
      const b = worldToScreen(cur.x, cur.y);
      ctx.save();
      ctx.strokeStyle = 'rgba(255,220,100,1)';
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.restore();
    }
  }
  if (role === 'dm') paintFogShapes(px);

  // grid
  const strength = Math.max(state.gridStrength, state.minStrength);
  ctx.lineWidth = 1;
  const alpha = 0.25 + 0.25 * (strength - 1);
  ctx.strokeStyle = `rgba(232,220,200,${alpha})`;
  ctx.beginPath();
  for (let c = 0; c <= cols; c++) {
    const a = worldToScreen(c * px, 0);
    const b = worldToScreen(c * px, rows * px);
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
  }
  for (let r = 0; r <= rows; r++) {
    const a = worldToScreen(0, r * px);
    const b = worldToScreen(cols * px, r * px);
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
  }
  ctx.stroke();

  // labels
  if (state.scene.grid.labels && state.view.zoom > 0.4) {
    ctx.fillStyle = 'rgba(232,220,200,0.7)';
    ctx.font = '10px system-ui';
    ctx.textAlign = 'center';
    for (let c = 0; c < cols; c++) {
      const colLetter = c < 26 ? String.fromCharCode(65 + c) : 'A' + String.fromCharCode(65 + c - 26);
      const p = worldToScreen(c * px + px / 2, -8 / state.view.zoom);
      if (p.y > -20 && p.y < 30) ctx.fillText(colLetter, p.x, p.y);
    }
    for (let r = 0; r < rows; r++) {
      const p = worldToScreen(-12 / state.view.zoom, r * px + px / 2);
      if (p.x > -20 && p.x < 40) ctx.fillText(String(r + 1), p.x, p.y + 4);
    }
  }

  paintRangeControls();
  paintRangeRings();
  paintMoveReach();
  paintClosedDoorGlyphs();
  stampDispelledLights();
  paintSpellZones();

  // tokens — this floor only. Players already skipped other scenes; the DM does too.
  for (const t of state.tokens) {
    const isHidden = t.hidden;
    if (isHidden && role !== 'dm') continue;
    if (!onViewedScene(t)) continue;

    if (role === 'player') {
      /* same test the Target lists use (tokenSeenBy) */
      if (!tokenSeenBy(t, sight)) continue;
    }

    const size = t.size || 1;
    const cx = (t.pos.x + size / 2) * px;
    const cy = (t.pos.y + size / 2) * px;
    const s = worldToScreen(cx, cy);
    const r = (size * px * state.view.zoom) / 2 * 0.85;

    let ring = t.color || '#888';
    if (!t.color) {
      if (t.kind === 'player') ring = '#4a90d9';
      else if (t.kind === 'enemy') ring = '#8b3a3a';
      else if (t.kind === 'friendly') ring = '#2a9d8f';
    }

    // Hidden tokens stay on the DM map, drawn dimmed. Players never reach this branch.
    ctx.save();
    if (isHidden && role === 'dm') ctx.globalAlpha = 0.4;
    if (t.veil && (role === 'dm' || t.ownerUid === uid)) ctx.globalAlpha = 0.45;
    /* fog-aware targeting: seen but past the picked weapon's long range -> grey wash on this player's map */
    let outOfReach = false;
    if (role === 'player' && sightGun && sightMine && t.id !== sightMine.id) {
      const v = rangeButtonNote(sightGun, t.id, sightMine.id);
      outOfReach = !!(v && v.band === 'blocked');
      if (outOfReach) { ctx.globalAlpha *= 0.6; try { ctx.filter = 'grayscale(1) brightness(0.75)'; } catch (e) {} }
    }

    ctx.beginPath();
    ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(30,25,20,0.85)';
    ctx.fill();
    /* 0.2.77: a token copied through JSON (demo table, patches) can carry a plain-object _img; one bad
       portrait used to throw out of draw() and stop every later token (and its ammo badge) from drawing. */
    if (t._img && !(typeof HTMLImageElement !== 'undefined' && t._img instanceof HTMLImageElement)) { t._img = null; if (t.image) loadTokenImage(t); }
    if (t.image && t._img) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(s.x, s.y, r - 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(t._img, s.x - r, s.y - r, r * 2, r * 2);
      ctx.restore();
    }
    paintStickyMarks(ctx, t, s, r);
    if (window.SSDNSTokenBorder) window.SSDNSTokenBorder.paint(ctx, t, s.x, s.y, r, ring);
    else {
      ctx.beginPath();
      ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
      ctx.strokeStyle = ring;
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    // lock icon
    if (t.locked) {
      ctx.save();
      ctx.globalAlpha = 1;
      ctx.font = `${Math.max(16, r * 0.6)}px system-ui`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🔒', s.x, s.y);
      ctx.restore();
    }

    // selection highlight
    if (role === 'dm' && state.selectedIds.includes(t.id)) {
      ctx.beginPath();
      ctx.arc(s.x, s.y, r + 5, 0, Math.PI * 2);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 2]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (t.combatantId && t.combatantId === state.currentTurnId) {
      const pulse = 0.6 + 0.4 * Math.sin(Date.now() / 300);
      ctx.beginPath();
      ctx.arc(s.x, s.y, r + 6, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255,255,255,${pulse})`;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(s.x, s.y, r + 2, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255,255,255,${0.4 + pulse * 0.4})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    const barHp = underTokenHp(t);
    /* Down X for the DM still comes from the real pool. Players only get it from public status. */
    let hpCur = null;
    let hpMax = null;
    if (role === 'dm' && barHp) {
      hpCur = barHp.cur;
      hpMax = barHp.max;
    }
    // condition badges stay inside the token's alpha, so a hidden token stays dim
    /* condition symbols (Jessey 2026-10-20 9:22 PM): the lit condition chips the sheet / DMCC track now reach the
       token too (before, only the map toolbar's own Condition list did). Players read the masked initiative copy,
       so a hidden enemy never shows them anything. */
    const condList = tokenConditions(t);
    if (condList.length) {
      /* Option B: ~28px on a medium token (was ~18px from r * 0.62). Icon ~16px, 2px ring. */
      const size = Math.max(22, r * 0.97);
      const shown = condList.slice(0, 4);
      const extra = condList.length - shown.length;
      ctx.font = `${Math.round(size * 0.57)}px system-ui, "Noto Color Emoji", "Apple Color Emoji", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const step = size * 1.02;
      const count = shown.length + (extra > 0 ? 1 : 0);
      let badgeX = s.x - ((count - 1) * step) / 2;
      const badgeY = s.y - r + size * 0.15;
      const disc = (txt) => {
        ctx.fillStyle = 'rgba(20,12,6,0.82)';
        ctx.beginPath();
        ctx.arc(badgeX, badgeY, size * 0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(232,220,200,0.85)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.fillText(txt, badgeX, badgeY + 1);
        badgeX += step;
      };
      shown.forEach((c) => disc(condIcon(c)));
      if (extra > 0) disc('+' + extra);
    }
    const downMark = String(t.status || '').toLowerCase() === 'down' || (role === 'dm' && hpCur != null && hpCur <= 0);
    // red X if downed. Players only see it from the public status, never from an HP number.
    if (downMark) {
      ctx.strokeStyle = '#e74c3c';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(s.x - r * 0.6, s.y - r * 0.6);
      ctx.lineTo(s.x + r * 0.6, s.y + r * 0.6);
      ctx.moveTo(s.x + r * 0.6, s.y - r * 0.6);
      ctx.lineTo(s.x - r * 0.6, s.y + r * 0.6);
      ctx.stroke();
    }

    ctx.fillStyle = '#e8dcc8';
    /* token size: big tokens' names cap at 1.5x Medium (Medium unchanged) so labels stay in the row below */
    const rMed = (px * state.view.zoom) / 2 * 0.85;
    const nameFont = Math.max(11, Math.min(r, rMed * 1.5) * 0.4);
    ctx.font = `${nameFont}px system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const nameY = s.y + r + 4;
    ctx.fillText(t.label || t.name.slice(0, 8), s.x, nameY);
    paintAssetChip(ctx, t, s, r);
    /* B2: DM-only link badge. Players never reach a hidden token, and this mark is role-gated too. */
    if (role === 'dm' && !t.spellPiece && t.kind !== 'asset') {
      const linkedSheet = !!(t.ownerUid && partyList().some(p => p && (p.uid || p.id) === t.ownerUid));
      const mark = linkedSheet ? '⛓' : '⚠';
      ctx.font = 'bold ' + Math.max(11, Math.round(r * 0.42)) + 'px system-ui, "Noto Color Emoji", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const bx = s.x + r * 0.72;
      const by = s.y - r * 0.72;
      ctx.beginPath();
      ctx.arc(bx, by, Math.max(7, r * 0.28), 0, Math.PI * 2);
      ctx.fillStyle = linkedSheet ? 'rgba(40, 90, 48, 0.95)' : 'rgba(120, 72, 16, 0.95)';
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = linkedSheet ? '#b7e0b2' : '#e2c56a';
      ctx.stroke();
      ctx.fillStyle = '#fff8e8';
      ctx.fillText(mark, bx, by + 0.5);
    }
    if (state.selected && state.selected.id === t.id && host.rounds) {
      let rows = [];
      try {
        const raw = host.rounds(t);
        if (Array.isArray(raw)) rows = raw;
      } catch (e) { rows = []; }
      if (rows.length) paintAmmoColumn(ctx, s, r, rows);
    }
    if (outOfReach) {
      try { ctx.filter = 'none'; } catch (e) {}
      ctx.beginPath();
      ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(110,110,110,0.45)';
      ctx.fill();
    }
    ctx.restore();

    /* HP bar under the name. DM always. A player sees their own PC via canControl,
       and an enemy or NPC only when that combatant's reveal.hp is public. */
    if (barHp && barHp.max) {
      const pct = Math.max(0, Math.min(1, (Number(barHp.cur) || 0) / barHp.max));
      const bw = r * 1.8, bh = 5;
      const barY = nameY + Math.max(14, nameFont + 2);
      ctx.fillStyle = '#333';
      ctx.fillRect(s.x - bw/2, barY, bw, bh);
      ctx.fillStyle = pct > 0.5 ? '#4caf50' : pct > 0.25 ? '#ff9800' : '#f44336';
      ctx.fillRect(s.x - bw/2, barY, bw * pct, bh);
    }
  }

  // live rect preview while dragging
  if (role === 'dm' && state.drag && state.drag.fog && state.fogStart) {
    const w = screenToWorld(state.drag.sx, state.drag.sy); // fallback
    // use last pointer if available
    const pts = [...pointers.values()];
    if (pts.length) {
      const cur = screenToWorld(pts[0].x, pts[0].y);
      const a = worldToScreen(Math.min(state.fogStart.x, cur.x), Math.min(state.fogStart.y, cur.y));
      const b = worldToScreen(Math.max(state.fogStart.x, cur.x), Math.max(state.fogStart.y, cur.y));
      ctx.save();
      ctx.strokeStyle = 'rgba(200,180,80,0.9)';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
      ctx.restore();
    }
  }

  // pending move ghosts (DM, offline)
  if (state.offline && state.pendingMoves.length) {
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.setLineDash([4, 3]);
    for (const m of state.pendingMoves) {
      const t = state.tokens.find(tok => tok.id === m.id);
      if (!t) continue;
      const gs = (t.size || 1) / 2; /* token size: ghost centred on the whole footprint */
      const s = worldToScreen((m.x + gs) * px, (m.y + gs) * px);
      if (m.path) drawPath(m.path, t.color || '#ccc');
      const r = ((t.size || 1) * px * state.view.zoom) / 2 * 0.85;
      ctx.beginPath();
      ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
      ctx.strokeStyle = t.color || '#ccc';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.restore();
  }

  if (state.recall) drawPath(state.recall, '#fff');
  // ruler
  if (state.ruler) {
    const a = worldToScreen(state.ruler.x1, state.ruler.y1);
    const b = worldToScreen(state.ruler.x2, state.ruler.y2);
    ctx.strokeStyle = '#c9a227';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    const dist = Math.hypot(state.ruler.x2 - state.ruler.x1, state.ruler.y2 - state.ruler.y1) / px;
    const ft = Math.round(dist * 5);
    ctx.fillStyle = '#e8dcc8';
    ctx.font = '12px system-ui';
    ctx.fillText(`${dist.toFixed(1)} sq · ${ft} ft`, (a.x + b.x) / 2, (a.y + b.y) / 2 - 8);
  }

  // pings
  for (const p of state.pings) {
    if (p.sceneId && p.sceneId !== activeSceneId()) continue;
    const age = (Date.now() - p.ts) / 2500;
    const sc = worldToScreen(p.x, p.y);
    ctx.save();
    ctx.beginPath();
    ctx.arc(sc.x, sc.y, 12 + age * 20, 0, Math.PI * 2);
    ctx.strokeStyle = p.color || '#ff5050';
    ctx.globalAlpha = 1 - age;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();
  }
  paintMoveHover();
  paintMoveReadout();
  paintPendingTargets(px);
  paintPendingBanner();
  paintBlast();
  paintBlastBanner();
  paintZoneBlind();
  refreshSelectedPanel();
}

// --- interaction ---
let pointers = new Map();
function flashBtn(id) {
  const b = q(id);
  if (!b) return;
  b.classList.add('active');
  setTimeout(() => b.classList.remove('active'), 180);
}
function iconCursor(emoji) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40'><text y='30' font-size='28'>${emoji}</text></svg>`;
  return `url("data:image/svg+xml;utf8,${svg}") 6 28, crosshair`;
}
function applyCursor() {
  if (state.blast || state.placeAsset) { canvas.style.cursor = 'crosshair'; return; }
  if (state.tool === 'reveal' || state.tool === 'hide' || state.tool === 'erase' || state.tool === 'wall' || state.tool === 'room' || state.tool === 'door' || state.tool === 'window') canvas.style.cursor = 'crosshair';
  else if (state.tool === 'ruler') canvas.style.cursor = iconCursor('📏');
  else if (state.tool === 'ping') canvas.style.cursor = iconCursor('📡');
  else if (state.offline) canvas.style.cursor = iconCursor('👻');
  else canvas.style.cursor = 'default';
}
function paintFogTools() {
  const revealKind = (q('revealShape') && q('revealShape').value) || 'box';
  const hideKind = (q('hideShape') && q('hideShape').value) || 'box';
  const reveal = q('revealFogBtn');
  const hide = q('hideFogBtn');
  const erase = q('eraseFogBtn');
  if (reveal) {
    reveal.textContent = 'Reveal: ' + shapeWord(revealKind);
    reveal.classList.toggle('active', state.tool === 'reveal');
  }
  if (hide) {
    hide.textContent = 'Hide: ' + shapeWord(hideKind);
    hide.classList.toggle('active', state.tool === 'hide');
  }
  if (erase) erase.classList.toggle('active', state.tool === 'erase');
}
function clearToolButtons() {
  el.querySelectorAll('.ssdns-leftbar button').forEach(b => {
    const act = b.getAttribute('data-act');
    if (act === 'fogBtn' || act === 'showFovBtn' || act === 'wallsVisBtn' || act === 'fogUndoBtn' || act === 'fogRedoBtn' || act === 'deleteFogBtn') return;
    b.classList.remove('active');
  });
}
function paintSecretBtn() {
  const b = q('secretDoorBtn');
  if (!b) return;
  const on = !!state.secretDoor;
  b.textContent = on ? 'Secret: ON' : 'Secret: OFF';
  b.classList.toggle('active', on);
  b.setAttribute('aria-pressed', on ? 'true' : 'false');
}
function markDoorTool() {
  ['rulerBtn','pingBtn','wallBtn','delWallBtn','roomBtn','doorBtn','windowBtn'].forEach(id => {
    const b = q(id);
    const toolMap = { rulerBtn: 'ruler', pingBtn: 'ping', wallBtn: 'wall', delWallBtn: 'delwall', roomBtn: 'room', doorBtn: 'door', windowBtn: 'window' };
    if (b && state.tool === toolMap[id]) b.classList.add('active');
  });
}
function armFog(op) {
  const sel = q(op === 'hide' ? 'hideShape' : 'revealShape');
  const kind = (sel && sel.value) || 'box';
  if (state.tool === op) {
    state.tool = null;
    state.fogKind = null;
  } else {
    state.tool = op;
    state.fogKind = kind;
  }
  state.fogMode = state.tool;
  state.secretDoor = false;
  if (state.fogKind !== 'poly') { state.polyPoints = []; state.polyHover = null; }
  clearToolButtons();
  paintSecretBtn();
  paintFogTools();
  applyCursor();
  draw();
}
function setTool(tool) {
  const wallTool = tool === 'wall' || tool === 'room' || tool === 'door' || tool === 'window' || tool === 'delwall';
  state.tool = state.tool === tool ? null : tool;
  state.fogMode = null;
  state.fogKind = null;
  state.polyPoints = [];
  state.polyHover = null;
  state.secretDoor = false;
  if (wallTool) revealWallLines();
  clearToolButtons();
  markDoorTool();
  paintSecretBtn();
  paintFogTools();
  applyCursor();
  draw();
}
function armSecretDoor() {
  state.secretDoor = !state.secretDoor;
  if (state.secretDoor) {
    state.tool = 'door';
    state.fogMode = null;
    state.fogKind = null;
    state.polyPoints = [];
    state.polyHover = null;
    revealWallLines();
  }
  clearToolButtons();
  markDoorTool();
  paintSecretBtn();
  paintFogTools();
  applyCursor();
  draw();
}

function isDiagonal(x1, y1, x2, y2) {
  const dx = Math.abs(x2 - x1), dy = Math.abs(y2 - y1);
  if (dx < 1 || dy < 1) return false;
  const ratio = dx / dy;
  return ratio > 0.6 && ratio < 1.6;
}
function pushWall(x1, y1, x2, y2) {
  if (!isDiagonal(x1, y1, x2, y2)) {
    sceneData().walls.push({ x1, y1, x2, y2, open: false });
    return;
  }
  const sx = Math.sign(x2 - x1), sy = Math.sign(y2 - y1);
  const steps = Math.round(Math.min(Math.abs(x2 - x1), Math.abs(y2 - y1)));
  for (let i = 0; i < steps; i++) {
    sceneData().walls.push({
      x1: x1 + sx * i, y1: y1 + sy * i,
      x2: x1 + sx * (i + 1), y2: y1 + sy * (i + 1),
      open: false
    });
  }
}
function cutFeature(wall, clickX, clickY, extra) {
  const dx = wall.x2 - wall.x1, dy = wall.y2 - wall.y1;
  const len = Math.hypot(dx, dy) || 1;
  const len2 = len * len;
  let t = ((clickX - wall.x1) * dx + (clickY - wall.y1) * dy) / len2;
  t = Math.max(0, Math.min(0.999, t));
  const unit = (Math.abs(dx) > 0.5 && Math.abs(dy) > 0.5 ? Math.SQRT2 : 1) / len;
  let t0 = Math.floor(t / unit) * unit;
  t0 = Math.max(0, Math.min(1 - unit, t0));
  const t1 = Math.min(1, t0 + unit);
  const at = (tt) => ({ x: wall.x1 + tt * dx, y: wall.y1 + tt * dy });
  const a = at(0), b = at(t0), c = at(t1), d = at(1);
  const segs = [];
  if (t0 > 0.02) segs.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
  segs.push({ x1: b.x, y1: b.y, x2: c.x, y2: c.y, ...extra });
  if (t1 < 0.98) segs.push({ x1: c.x, y1: c.y, x2: d.x, y2: d.y });
  return segs;
}
function isPlain(w) { return !w.open && !w.window && !w.door && !w.shut && !w.secret && !w.hidden; }
function collapsePlainWalls() {
  const walls = sceneData().walls;
  const keep = walls.filter(w => !isPlain(w));
  const plain = walls.filter(isPlain);
  const lines = new Map();
  for (const w of plain) {
    const horiz = Math.abs(w.y1 - w.y2) < 0.08;
    const vert = Math.abs(w.x1 - w.x2) < 0.08;
    if (!horiz && !vert) { keep.push(w); continue; }
    const key = horiz ? 'h:' + Math.round(w.y1 * 100) : 'v:' + Math.round(w.x1 * 100);
    const a = horiz ? Math.min(w.x1, w.x2) : Math.min(w.y1, w.y2);
    const b = horiz ? Math.max(w.x1, w.x2) : Math.max(w.y1, w.y2);
    if (!lines.has(key)) lines.set(key, []);
    lines.get(key).push({ a, b, horiz, c: horiz ? w.y1 : w.x1 });
  }
  for (const segs of lines.values()) {
    segs.sort((p, q) => p.a - q.a);
    let cur = null;
    for (const s of segs) {
      if (!cur || s.a > cur.b + 0.08) {
        if (cur && cur.b - cur.a > 0.2) pushMerged(keep, cur);
        cur = { ...s };
      } else {
        cur.b = Math.max(cur.b, s.b);
      }
    }
    if (cur && cur.b - cur.a > 0.2) pushMerged(keep, cur);
  }
  sceneData().walls = keep;
}
function pushMerged(out, cur) {
  if (cur.horiz) out.push({ x1: cur.a, y1: cur.c, x2: cur.b, y2: cur.c, open: false });
  else out.push({ x1: cur.c, y1: cur.a, x2: cur.c, y2: cur.b, open: false });
}
function samePt(a, b) { return Math.hypot(a.x - b.x, a.y - b.y) < 0.08; }
function mergePlainWalls() {
  const walls = sceneData().walls;
  let changed = true;
  while (changed) {
    changed = false;
    outer: for (let i = 0; i < walls.length; i++) {
      for (let j = i + 1; j < walls.length; j++) {
        const a = walls[i], b = walls[j];
        if (!isPlain(a) || !isPlain(b)) continue;
        const cross = (a.x2 - a.x1) * (b.y2 - b.y1) - (a.y2 - a.y1) * (b.x2 - b.x1);
        if (Math.abs(cross) > 0.08) continue;
        let nx1, ny1, nx2, ny2, hit = false;
        if (samePt({x:a.x2,y:a.y2},{x:b.x1,y:b.y1})) { nx1=a.x1; ny1=a.y1; nx2=b.x2; ny2=b.y2; hit = true; }
        else if (samePt({x:a.x2,y:a.y2},{x:b.x2,y:b.y2})) { nx1=a.x1; ny1=a.y1; nx2=b.x1; ny2=b.y1; hit = true; }
        else if (samePt({x:a.x1,y:a.y1},{x:b.x1,y:b.y1})) { nx1=a.x2; ny1=a.y2; nx2=b.x2; ny2=b.y2; hit = true; }
        else if (samePt({x:a.x1,y:a.y1},{x:b.x2,y:b.y2})) { nx1=a.x2; ny1=a.y2; nx2=b.x1; ny2=b.y1; hit = true; }
        if (!hit) continue;
        walls.splice(j, 1);
        walls.splice(i, 1, { x1: nx1, y1: ny1, x2: nx2, y2: ny2 });
        changed = true;
        break outer;
      }
    }
  }
}
function selectedTokens() {
  const ids = state.selectedIds.length ? state.selectedIds : (state.selected ? [state.selected.id] : []);
  return state.tokens.filter(t => ids.includes(t.id));
}
function cloneToken(src, dx, dy) {
  if (!src || !src.pos || !state.scene) { toast('Cannot copy that'); return null; }
  const id = 'tok_' + Date.now().toString(36) + Math.floor(Math.random() * 1000);
  const clean = JSON.parse(JSON.stringify(src, (k, v) => k === '_img' ? undefined : v));
  clean.id = id;
  clean.sheetId = '';
  clean.ownerUid = '';
  clean.controlledBy = [];
  clean.combatantId = id;
  clean.label = (src.label || 'Tok') + '*';
  clean.size = tokSquares(src.size);
  clean.pos = clampFootprint(src.pos.x + dx, src.pos.y + dy, clean.size);
  delete clean._img;
  if (areaTaken(clean.pos.x, clean.pos.y, clean.size)) {
    toast('That square is taken');
    return null;
  }
  state.tokens.push(clean);
  shared.tokens[id] = JSON.parse(JSON.stringify(clean));
  const playerTok = !!(src.ownerUid || src.kind === 'player' || src.sheetId);
  emit('combatant:add', playerTok ? { tokenId: id } : {
    tokenId: id,
    duplicate: true,
    sourceId: src.id,
    sourceCombatantId: src.combatantId || '',
    hidden: !!src.hidden,
    name: src.name || src.label || ''
  });
  return clean;
}
function copyTokens() {
  const list = selectedTokens();
  if (!list.length) { toast('Select a token'); return; }
  state.clipboard = list.map(t => JSON.parse(JSON.stringify(t)));
  toast('Copied ' + list.length);
}
function pasteTokens() {
  if (!state.clipboard || !state.clipboard.length) { toast('Nothing copied'); return; }
  const made = state.clipboard.map((src, i) => cloneToken(src, 1, i)).filter(Boolean);
  if (!made.length) return;
  state.selectedIds = made.map(t => t.id);
  state.selected = made[0];
  made.forEach(t => saveToken(t.id));
  toast('Pasted ' + made.length + ' — own stats, not linked');
  draw();
}
const PC_COLORS = ['#4a90d9', '#2a9d8f', '#9b59b6', '#e67e22', '#d35400', '#c9a227'];
const TOKEN_COLORS = [
  { name: 'Dust Blue', value: '#4a90d9' },
  { name: 'Saloon Red', value: '#8b3a3a' },
  { name: 'Sage', value: '#2a9d8f' },
  { name: 'Violet', value: '#9b59b6' },
  { name: 'Rust', value: '#e67e22' },
  { name: 'Ember', value: '#d35400' },
  { name: 'Brass', value: '#c9a227' },
  { name: 'Rose', value: '#e91e63' },
  { name: 'Lantern', value: '#ffeb3b' },
  { name: 'Bone', value: '#ffffff' },
  { name: 'Ash', value: '#888888' }
];
function fillColorSelect(sel) {
  if (!sel || sel.dataset.filled) return;
  sel.dataset.filled = '1';
  sel.innerHTML = TOKEN_COLORS.map(c => '<option value="' + c.value + '">' + c.name + '</option>').join('') + '<option value="custom">Custom</option>';
}
function paintSwatch(el, color) {
  if (!el) return;
  el.style.background = color && color !== 'custom' ? color : 'transparent';
}
function loadTokenImage(t) {
  if (!t || !t.image || t._img) return;
  const im = new Image();
  const src = asset(t.image);
  if (src && !/^(data:|blob:)/.test(src)) {
    try { im.crossOrigin = 'anonymous'; } catch (e) {}
  }
  im.onload = () => { t._img = im; draw(); };
  im.onerror = () => {
    if (im.crossOrigin) {
      const plain = new Image();
      plain.onload = () => { t._img = plain; draw(); };
      plain.onerror = () => { t._img = null; };
      plain.src = src;
      return;
    }
    t._img = null;
  };
  im.src = src;
}
function rememberTokenImage(t, src) {
  if (!t || !src) return;
  t.image = src;
  t._img = null;
  if (shared.tokens[t.id]) shared.tokens[t.id].image = src;
  loadTokenImage(t);
  if (role === 'dm') saveToken(t.id);
  draw();
}
function scheduleDefaultImage(t, src) {
  if (!t || t.image || !src) return;
  const Crop = window.SSDNSTokenCrop;
  const preset = Crop && Crop.preset ? (Crop.preset(src) || '') : '';
  if (preset) { rememberTokenImage(t, preset); return; }
  if (/^tokenImages\//.test(src)) { rememberTokenImage(t, src); return; }
  if (!Crop || typeof Crop.cropUrl !== 'function') return;
  Crop.cropUrl(asset(src)).then(out => {
    if (!out || t.image) return;
    rememberTokenImage(t, out);
  }).catch(() => {});
}
function partyList() {
  const raw = typeof options.players === 'function' ? options.players() : (options.players || (host.players && host.players()) || []);
  return (Array.isArray(raw) ? raw : []).filter(p => p && (p.uid || p.id));
}
function dismissedMap() {
  if (!state.dismissed || typeof state.dismissed !== 'object') state.dismissed = {};
  return state.dismissed;
}
function tokenForOwner(ownerUid) {
  if (!ownerUid) return null;
  const live = state.tokens.find(t => t.ownerUid === ownerUid);
  if (live) return live;
  const sharedHit = Object.values(shared.tokens || {}).find(t => t && t.ownerUid === ownerUid);
  return sharedHit || null;
}
function viewCenterCell() {
  const grid = (state.scene && state.scene.grid) || { cols: 30, rows: 20, px: 70 };
  const px = grid.px || 70;
  let x = Math.round((state.view.x || 0) / px - 0.5);
  let y = Math.round((state.view.y || 0) / px - 0.5);
  x = Math.max(0, Math.min((grid.cols || 30) - 1, x));
  y = Math.max(0, Math.min((grid.rows || 20) - 1, y));
  return { x: x, y: y };
}
/* Squares between two footprints on one axis. 0 when the spans overlap or touch the same square. */
function axisGap(origin, span, other, otherSpan) {
  const a0 = Number(origin) || 0;
  const b0 = Number(other) || 0;
  const a1 = a0 + span - 1;
  const b1 = b0 + otherSpan - 1;
  if (a1 < b0) return b0 - a1;
  if (b1 < a0) return a0 - b1;
  return 0;
}
/* N64: 5e distance. Chebyshev between the nearest squares of each footprint, times 5 ft.
   Overlap is 0. Adjacent Large (2) and Medium (1) is 1 square → 5 ft, not the ~8 ft centre hypot. */
function feetBetween(a, b) {
  if (!a || !b || !a.pos || !b.pos) return null;
  const sa = tokSquares(a.size);
  const sb = tokSquares(b.size);
  const gap = Math.max(axisGap(a.pos.x, sa, b.pos.x, sb), axisGap(a.pos.y, sa, b.pos.y, sb));
  return gap * 5;
}
function tokenByRef(id) {
  if (!id) return null;
  const direct = (state.tokens || []).find(t => t && (t.id === id || t.combatantId === id || t.ownerUid === id));
  if (direct) return direct;
  /* Public tokens omit combatantId. The fight row's mapTokenId is how a sheet target id finds the square. */
  const order = (state.initiative && state.initiative.order) || [];
  const row = order.find(r => r && (r.id === id || r.playerId === id || r.mapTokenId === id));
  if (!row) return null;
  return (state.tokens || []).find(t => t && (
    t.id === row.id ||
    (row.mapTokenId && t.id === row.mapTokenId) ||
    (t.combatantId && (t.combatantId === row.id || t.combatantId === row.playerId)) ||
    (row.playerId && t.ownerUid === row.playerId) ||
    (row.kind === "player" && row.id && t.ownerUid === row.id)
  )) || null;
}
function nearestHostileFeet(shooter) {
  if (!shooter) return null;
  let hostile = null;
  (state.tokens || []).forEach(t => {
    if (!t || t.id === shooter.id || !t.pos || t.spellPiece || t.notTargetable) return;
    const otherPc = !!t.ownerUid;
    const hostileTok = shooter.ownerUid ? !otherPc : otherPc;
    if (!hostileTok) return;
    const ft = feetBetween(shooter, t);
    if (ft == null) return;
    if (hostile == null || ft < hostile) hostile = ft;
  });
  return hostile;
}
function highlightBand(shooter, attack, rings) {
  const tgt = rangeHighlightToken(shooter);
  if (!tgt || !attack) return "";
  const verdict = rangeButtonNote(attack, tgt.id, shooter.id);
  const band = verdict && verdict.band;
  if (!band) return "";
  const roles = (rings || []).map(r => r.role);
  if (band === "close" && roles.indexOf("close") >= 0) return "close";
  if (band === "warn" && roles.indexOf("warn") >= 0) return "warn";
  if ((band === "long" || band === "blocked") && roles.indexOf("limit") >= 0) return "limit";
  if (band === "blocked" && roles.indexOf("past") >= 0) return "past";
  if (band === "blocked" && roles.indexOf("spell") >= 0) return "spell";
  if (roles.indexOf("normal") >= 0) return "normal";
  if (roles.indexOf("reach") >= 0) return "reach";
  if (roles.indexOf("spell") >= 0) return "spell";
  if (roles.indexOf("limit") >= 0) return "limit";
  return "";
}
function rangeHighlightToken(shooter) {
  let id = "";
  if (role === "player") id = state.playerTarget || "";
  else {
    const box = q("drawer");
    const sel = box && box.querySelector('[data-act="cylTarget"]');
    id = state.rangeTargetId === NO_TARGET ? "" : (state.rangeTargetId || (sel && sel.value) || "");
    if (!id && state.selected && shooter && state.selected.id !== shooter.id) id = state.selected.id;
  }
  const tgt = tokenByRef(id);
  if (!tgt || !shooter || tgt.id === shooter.id) return null;
  return tgt;
}
function rangeButtonNote(attack, targetId, shooterId) {
  if (!window.SSDNSRangeRings || !window.SSDNSRangeRings.resolve || !attack || !targetId) return null;
  const shooter = tokenByRef(shooterId) ||
    (role === 'player' ? (state.tokens || []).find(t => t && t.ownerUid === uid) : null);
  const tgt = tokenByRef(targetId);
  if (!shooter || !tgt || !shooter.pos || !tgt.pos) return null;
  const id = String(attack.id || '');
  const spell = !!(attack.spell || attack.kind === 'spell' || id.indexOf('spell:') === 0);
  const verdict = window.SSDNSRangeRings.resolve(Object.assign({}, attack, { spell: spell, kind: spell ? 'spell' : (attack.kind || '') }), feetBetween(shooter, tgt), {
    hasTarget: true,
    hostileFeet: nearestHostileFeet(shooter),
    override: role === 'dm' ? rangeOverrideNow() : 'auto'
  });
  const Z = window.SSDNSSpellZones;
  if (verdict && Z && Z.crossesWall && rangedWeaponShot(attack)) {
    const walls = Z.crossesWall(spellZoneList(), fxCenter(shooter), fxCenter(tgt));
    const ov = role === 'dm' ? rangeOverrideNow() : 'auto';
    if (walls.length && ov !== 'ignore' && ov !== 'adv') {
      verdict.disadvantage = true;
      verdict.advantage = false;
      const note = 'DIS: wind wall';
      verdict.note = verdict.note ? (verdict.note + ' · ' + note) : note;
      if (!verdict.button) verdict.button = 'DIS · wind wall';
    }
  }
  return verdict;
}
/* 0.3.68: the DM range override is shared with the DMCC Fight tab picker (SSDNSRangeRings keeps it). */
function rangeOverrideNow() {
  const R = window.SSDNSRangeRings;
  if (R && R.getOverride) return R.getOverride();
  return state.rangeOverride || 'auto';
}
function armRange(attack, targetId, shooterId) {
  const verdict = rangeButtonNote(attack, targetId, shooterId);
  if (!verdict || !verdict.apply || !window.SSDNSRangeRings.arm) return verdict;
  const tok = tokenByRef(targetId) || (state.tokens || []).find(t => t && tokenCombatant(t.id) === targetId) || null;
  verdict.targetRefs = [targetId, tok && tok.id, tok && tok.combatantId, tok && tok.sheetId, tok && tok.ownerUid]
    .filter(Boolean).map(String);
  window.SSDNSRangeRings.arm(verdict);
  return verdict;
}
function noteOverride(verdict) {
  if (verdict && verdict.log && role === 'dm') emit('chat:send', { text: verdict.log });
}
/* 0.3.72: DM drawer 'Off-hand' toggle: the next PC weapon shot is the off-hand (bonus action) attack. */
function offhandToggle(show) {
  if (!show) return '';
  return '<label class="ssm-offhand" title="Bonus action after the Attack action. The sheet spends their Bonus pip and drops a positive ability mod from damage.">' +
    '<input type="checkbox" data-act="offhandToggle"' + (state.drawerOffhand ? ' checked' : '') + '> Off-hand (bonus action) for the next shot</label>';
}
/* 0.3.73: DM drawer 'Fan the Hammer' toggle (Pistolero PCs): the next pistol shot is the Fan bonus attack. */
function fanToggle(show) {
  if (!show) return '';
  return '<label class="ssm-offhand ssm-fan" title="Pistolero: one more pistol attack as a bonus action after the Attack action. Adds the ability modifier. No Tactical Reload this turn.">' +
    '<input type="checkbox" data-act="fanToggle"' + (state.drawerFan ? ' checked' : '') + '> Fan the Hammer (bonus action) for the next shot</label>';
}
function clearOffhand() {
  if (!state.drawerOffhand && !state.drawerFan) return;
  state.drawerOffhand = false;
  state.drawerFan = false;
  if (state.drawerOpen) setTimeout(() => { try { renderDrawer(); } catch (e) {} }, 0);
}
function disMark(verdict) {
  if (verdict && !verdict.blocked && verdict.advantage) return ' <span class="ssm-adv">Advantage</span>';
  if (!verdict || verdict.blocked || !verdict.disadvantage) return '';
  return ' <span class="ssm-dis">Disadvantage</span>';
}
function touchGate(attack, shooterId, targetToken) {
  const Area = window.SSDNSSpellArea;
  if (!Area || !Area.touchBlock || !attack) return "";
  const Cast = window.SSDNSSpellCast;
  const label = attack.name || attack.id || "";
  const range = attack.range || (Cast && Cast.rangeOf && Cast.rangeOf(label)) || "";
  if (!/touch/i.test(String(range))) return "";
  const kind = attack.kind || attack.spellKind || "";
  const feet = targetToken ? feetBetween(tokenByRef(shooterId), targetToken) : null;
  return Area.touchBlock(feet, range, { allowUnmeasured: kind === "heal" });
}
function armAttack(attack, targetId, shooterId) {
  const sid = shooterId || (role === 'player' ? uid : '');
  return armRange(attack || {}, targetId, sid);
}
/* 0.3.67: Attacks target pick. A clear banner (drawer top + over the map) with Cancel,
   valid targets ringed on the map, Esc or Cancel ends it. */
function pendingValidTokens() {
  const pend = state.pendingTarget;
  if (!pend) return [];
  const ids = Array.isArray(state.pendingValid) ? state.pendingValid : [];
  return (state.tokens || []).filter(t => {
    if (!t || !t.pos || t.spellPiece || t.notTargetable) return false;
    if (t.id === pend.tokenId) return pend.spellKind === 'heal';
    if (!ids.length) return !t.hidden;
    return ids.indexOf(tokenCombatant(t.id)) >= 0 || ids.indexOf(t.id) >= 0 || (t.ownerUid && ids.indexOf(t.ownerUid) >= 0);
  });
}
function paintPendingTargets(px) {
  if (role !== 'dm' || !state.pendingTarget) return;
  const pulse = 0.55 + 0.45 * Math.sin(Date.now() / 220);
  pendingValidTokens().forEach(t => {
    const size = t.size || 1;
    const c = worldToScreen((t.pos.x + size / 2) * px, (t.pos.y + size / 2) * px);
    const r = (size * px * state.view.zoom) / 2 + 6;
    ctx.save();
    ctx.beginPath();
    ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
    ctx.strokeStyle = '#ffd34d';
    ctx.globalAlpha = pulse;
    ctx.lineWidth = 4;
    ctx.setLineDash([8, 6]);
    ctx.stroke();
    ctx.restore();
  });
  if (!state._pendingPulse) {
    state._pendingPulse = setInterval(() => {
      if (!state.pendingTarget) { clearInterval(state._pendingPulse); state._pendingPulse = null; return; }
      draw();
    }, 120);
  }
}
function pendingLabel() {
  const pend = state.pendingTarget;
  if (!pend) return '';
  const card = lookupCard(pend.tokenId);
  const wid = pend.weaponId || pend.spellId || '';
  const hit = card && ((card.attacks || []).find(a => a && (a.id === wid || a.name === wid)) || (card.spells || []).find(s => s && (s.id === wid || s.name === wid)));
  return (hit && hit.name) || wid;
}
function pendingBannerHtml(tokenId) {
  if (!state.pendingTarget || state.pendingTarget.tokenId !== tokenId) return '';
  const what = pendingLabel();
  return '<div class="ssm-pending" role="status" aria-live="polite"><span class="ssm-pending-text"><b>Click a target</b>' +
    (what ? ' for ' + esc(what) : '') + '. Highlighted tokens can be targeted. Esc cancels.</span>' +
    '<button type="button" data-act="pendingCancel">Cancel</button></div>';
}
function paintPendingBanner() {
  if (role !== 'dm') return;
  let bar = el.querySelector('.ssm-pending-map');
  if (!state.pendingTarget) {
    if (bar) bar.hidden = true;
    return;
  }
  if (!bar) {
    bar = document.createElement('div');
    bar.className = 'ssm-pending-map';
    bar.setAttribute('role', 'status');
    bar.innerHTML = '<span class="ssm-pending-text"></span><button type="button" data-act="pendingCancelMap">Cancel</button>';
    bar.addEventListener('pointerdown', ev => ev.stopPropagation());
    bar.querySelector('[data-act="pendingCancelMap"]').addEventListener('click', ev => { ev.stopPropagation(); cancelPendingTarget(); });
    el.appendChild(bar);
  }
  const what = pendingLabel();
  const txt = 'Click a target' + (what ? ' for ' + what : '') + ' · Esc cancels';
  const span = bar.querySelector('.ssm-pending-text');
  if (span.textContent !== txt) span.textContent = txt;
  bar.hidden = false;
}
function cancelPendingTarget() {
  if (!state.pendingTarget) return;
  state.pendingTarget = null;
  if (window.SSDNSRangeRings && window.SSDNSRangeRings.clear) window.SSDNSRangeRings.clear();
  paintPendingBanner();
  renderDrawer();
  draw();
}
/* N77: place a spell's area on the grid. Sphere, cylinder, cone, cube, square, line, and wall. */
function blastCaster(spec) {
  const id = spec && spec.casterId || "";
  if (id) return tokenByRef(id);
  return (state.tokens || []).find(t => t && t.ownerUid && t.ownerUid === uid) || null;
}
function casterOrigin(caster) {
  const sz = (caster && caster.size) || 1;
  return { x: caster.pos.x + sz / 2, y: caster.pos.y + sz / 2, casterSize: sz };
}
function blastInRange(area, originSq, caster) {
  if (!area || area.rangeFeet == null || !area.rangeFeet) return true;
  if (!caster || !caster.pos) return true;
  const sz = caster.size || 1;
  const dist = Math.max(Math.abs(originSq.x * 5 - (caster.pos.x + sz / 2) * 5), Math.abs(originSq.y * 5 - (caster.pos.y + sz / 2) * 5));
  return dist <= area.rangeFeet + 2.5;
}
function tokensInBlast(area, origins, facing, excludeId) {
  const Area = window.SSDNSSpellArea;
  if (!Area || !area || !Area.hits) return [];
  const out = [];
  (state.tokens || []).forEach(t => {
    if (!t || !t.pos) return;
    if (t.hidden && role !== "dm") return;
    if (!onViewedScene(t)) return;
    if (excludeId && area.self && (t.id === excludeId || t.ownerUid === excludeId || t.combatantId === excludeId)) return;
    const tok = { x: t.pos.x, y: t.pos.y, size: t.size || 1 };
    const hit = (origins || []).some(o => Area.hits(area, { x: o.x * 5, y: o.y * 5, casterSize: o.casterSize || 1 }, facing || 0, tok));
    if (!hit) return;
    const row = rowForToken(t);
    const strike = window.SSDNSSpellArea && window.SSDNSSpellArea.strikeTargetId
      ? window.SSDNSSpellArea.strikeTargetId({
        id: t.id, combatantId: t.combatantId || "", ownerUid: t.ownerUid || "", name: t.name || t.label || ""
      }, row ? [row] : [])
      : ((row && (row.kind === "player" ? (row.playerId || row.id) : row.id)) || t.combatantId || t.ownerUid || t.id);
    out.push({
      id: t.id, combatantId: strike || t.combatantId || "", ownerUid: t.ownerUid || (row && row.playerId) || "",
      name: (row && row.name) || t.name || t.label || "Token", x: t.pos.x, y: t.pos.y, size: t.size || 1, kind: t.kind || ""
    });
  });
  return out;
}
function strokeBlastBox(wx, wy, area, facing, casterSize, px) {
  const ft = px / 5;
  let f0 = 0, f1 = 0, l0 = 0, l1 = 0;
  if (area.shape === "cube" || area.shape === "square") {
    const side = area.side || 0;
    if (area.self) {
      const start = (Math.max(1, casterSize) * 5) / 2;
      f0 = start; f1 = start + side; l0 = -side / 2; l1 = side / 2;
    } else {
      f0 = -side / 2; f1 = side / 2; l0 = -side / 2; l1 = side / 2;
    }
  } else if (area.shape === "line") {
    f0 = 0; f1 = area.length || 0; l0 = -(area.width || 5) / 2; l1 = (area.width || 5) / 2;
  } else if (area.shape === "wall") {
    const len = area.length || 0;
    const w = area.width || 5;
    f0 = -len / 2; f1 = len / 2; l0 = -w / 2; l1 = w / 2;
  } else return;
  const fx = Math.cos(facing), fy = Math.sin(facing), lx = -fy, ly = fx;
  const corners = [[f0, l0], [f1, l0], [f1, l1], [f0, l1]];
  ctx.save();
  ctx.beginPath();
  corners.forEach((c, i) => {
    const s = worldToScreen(wx + (fx * c[0] + lx * c[1]) * ft, wy + (fy * c[0] + ly * c[1]) * ft);
    if (i === 0) ctx.moveTo(s.x, s.y);
    else ctx.lineTo(s.x, s.y);
  });
  ctx.closePath();
  ctx.globalAlpha = 0.28;
  ctx.fillStyle = "rgba(255,120,40,0.95)";
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = "rgba(255,160,60,0.98)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}
function paintBlast() {
  const b = state.blast;
  if (!b || !b.area || !state.scene) return;
  const px = (state.scene.grid && state.scene.grid.px) || 70;
  const area = b.area;
  const spots = [];
  (b.points || []).forEach(p => spots.push(p));
  if (b.origin) spots.push(b.origin);
  else if (b.hover && b.needsPoint) spots.push(b.hover);
  const facing = b.facing || 0;
  spots.forEach(o => {
    const wx = o.x * px, wy = o.y * px;
    if (area.shape === "sphere" || area.shape === "cylinder") strokeRing(wx, wy, ((area.radius || 0) / 5) * px, "rgba(255,140,50,0.98)", "rgba(255,90,20,0.16)");
    else if (area.shape === "cone") strokeCone(wx, wy, ((area.length || 0) / 5) * px, facing, "rgba(255,140,50,0.98)");
    else strokeBlastBox(wx, wy, area, facing, o.casterSize || b.casterSize || 1, px);
  });
}
function paintBlastBanner() {
  let bar = el.querySelector(".ssm-blast-map");
  if (!state.blast) {
    if (bar) bar.hidden = true;
    return;
  }
  if (!bar) {
    bar = document.createElement("div");
    bar.className = "ssm-blast-map";
    bar.setAttribute("role", "status");
    bar.innerHTML = '<span class="ssm-pending-text"></span><button type="button" data-act="blastCast">Cast</button><button type="button" data-act="blastCancel">Cancel</button>';
    bar.addEventListener("pointerdown", ev => ev.stopPropagation());
    bar.querySelector("[data-act=blastCast]").addEventListener("click", ev => { ev.preventDefault(); ev.stopPropagation(); confirmBlast(); });
    bar.querySelector("[data-act=blastCancel]").addEventListener("click", ev => { ev.preventDefault(); ev.stopPropagation(); cancelBlast(); });
    el.appendChild(bar);
  }
  const b = state.blast;
  const name = (b.spec && b.spec.name) || "Spell";
  const label = (b.area && b.area.label) || "";
  let txt = "Click where " + name + " goes off";
  if (b.area && b.area.self && b.needsAim) txt = "Aim " + name + ", then click to cast";
  else if (b.area && b.area.self) txt = name + " is centered on you. Cast to confirm";
  else if (b.area && b.area.count > 1) txt = name + ": point " + ((b.points && b.points.length) || 0) + " of " + b.area.count;
  else if (b.placed) txt = name + " is set. Click again or Cast";
  if (label) txt += " (" + label + ")";
  txt += ". Esc cancels.";
  const span = bar.querySelector(".ssm-pending-text");
  if (span && span.textContent !== txt) span.textContent = txt;
  bar.hidden = false;
}
function confirmBlast() {
  const b = state.blast;
  if (!b) return;
  if (!b.origin) { toast("Pick a point on the map"); return; }
  const origins = (b.points && b.points.length) ? b.points.slice() : [b.origin];
  origins.forEach(o => { if (!o.casterSize && b.casterSize) o.casterSize = b.casterSize; });
  const tokens = tokensInBlast(b.area, origins, b.facing || 0, b.casterId);
  const payload = { origin: b.origin, origins: origins, facing: b.facing || 0, tokens: tokens, area: b.area };
  const resolve = b.resolve;
  state.blast = null;
  paintBlastBanner();
  draw();
  if (resolve) resolve(payload);
}
function cancelBlast() {
  const b = state.blast;
  if (!b) return;
  const resolve = b.resolve;
  state.blast = null;
  paintBlastBanner();
  draw();
  if (resolve) resolve(null);
}
function placeBlast(spec) {
  spec = spec || {};
  const area = spec.area;
  if (!area) return Promise.resolve(null);
  if (state.blast) cancelBlast();
  return new Promise(resolve => {
    const caster = blastCaster(spec);
    const origin = area.self && caster && caster.pos ? casterOrigin(caster) : null;
    const needsAim = area.shape === "cone" || area.shape === "line" || area.shape === "wall" || (area.self && (area.shape === "cube" || area.shape === "square"));
    state.blast = {
      spec: spec, area: area, origin: origin, facing: 0, needsAim: needsAim, needsPoint: !area.self,
      casterId: (caster && caster.id) || spec.casterId || "", casterSize: origin ? origin.casterSize : 1,
      points: [], hover: null, placed: !!(origin && !needsAim), resolve: resolve
    };
    if (area.self && !origin) toast("Put your token on the map first");
    paintBlastBanner();
    applyCursor();
    draw();
  });
}
function blastPointer(e, kind) {
  const b = state.blast;
  if (!b || !state.scene) return;
  const cell = cellUnderEvent(e);
  const hover = { x: cell.x + 0.5, y: cell.y + 0.5 };
  const px = (state.scene.grid && state.scene.grid.px) || 70;
  const w = pointerWorld(e);
  const feet = { x: (w.x / px) * 5, y: (w.y / px) * 5 };
  if (kind === "move") {
    b.hover = hover;
    if (b.origin && b.needsAim) b.facing = Math.atan2(feet.y - b.origin.y * 5, feet.x - b.origin.x * 5);
    draw();
    return;
  }
  if (b.needsPoint && !b.origin) {
    if (!blastInRange(b.area, hover, blastCaster(b.spec))) { toast("Out of range"); return; }
    const count = (b.area && b.area.count) || 1;
    if (count > 1) {
      b.points.push(hover);
      if (b.points.length < count) {
        toast("Point " + b.points.length + " of " + count);
        paintBlastBanner();
        draw();
        return;
      }
      b.origin = b.points[0];
    } else b.origin = hover;
    b.placed = !b.needsAim;
    paintBlastBanner();
    draw();
    return;
  }
  if (b.needsAim && b.origin) {
    b.facing = Math.atan2(feet.y - b.origin.y * 5, feet.x - b.origin.x * 5);
    confirmBlast();
    return;
  }
  if (b.placed && b.origin) confirmBlast();
}
function hideChestMenu() {
  const menu = el.querySelector('[data-act="chestMenu"]');
  if (menu) menu.hidden = true;
}
function lootStub(token) {
  if (!token) return null;
  if (token.loot && token.loot.lock) return token.loot;
  const lock = token.lootLock;
  if (!lock) return null;
  return {
    id: token.lootBoxId || token.id,
    name: lock.name || token.name || 'Chest',
    boxType: lock.boxType || '',
    lock: lock.lock || { dc: 0, unlocked: true, method: [], jammed: false },
    barrier: lock.barrier || null,
    hidden: !!lock.hidden,
    found: lock.found !== false,
    hideDc: lock.hideDc || 0,
    trap: lock.trap || null,
    log: token.loot && token.loot.log || []
  };
}
function showChestMenu(token) {
  let menu = el.querySelector('[data-act="chestMenu"]');
  if (!menu) {
    menu = document.createElement('div');
    menu.className = 'ssm-chest-menu';
    menu.setAttribute('data-act', 'chestMenu');
    menu.addEventListener('pointerdown', ev => ev.stopPropagation());
    menu.addEventListener('click', ev => {
      const act = ev.target && ev.target.getAttribute && ev.target.getAttribute('data-chest');
      if (!act) return;
      ev.preventDefault();
      ev.stopPropagation();
      const boxId = menu.getAttribute('data-box') || '';
      const Give = window.SSDNSLootGive;
      if (act === 'take-all' && !(Give && Give.chestAct)) {
        if (adapter && adapter.write) adapter.write('map/public/events/loot', {
          boxId: boxId, action: 'take-all', from: uid, seq: Date.now()
        }, { seq: Date.now(), by: uid });
        toast('Take sent');
        return;
      }
      if (Give && Give.chestAct) {
        Promise.resolve(Give.chestAct(boxId, act)).then(() => {
          if (Give.menuHtml) menu.innerHTML = Give.menuHtml(boxId);
        });
        return;
      }
      const Loot = window.SSDNSLoot;
      const live = state.tokens.find(t => t && t.lootBoxId === boxId) || token;
      const box = lootStub(live);
      if (!Loot || !box || !Loot.playCheck) return;
      let sheet = {};
      try { sheet = (window.SSDNSApp && window.SSDNSApp.doc && window.SSDNSApp.doc().character) || {}; } catch (e) { sheet = {}; }
      const res = Loot.playCheck(box, act, sheet);
      if (live) live.loot = box;
      if (adapter && adapter.write) adapter.write('map/public/events/loot', {
        boxId: boxId, action: act, nat: res && res.nat, total: res && res.total,
        success: !!(res && res.success), seq: Date.now()
      }, { seq: Date.now(), by: uid });
      menu.innerHTML = chestMenuHtml(box);
      if (res && res.notice) toast(res.notice);
    });
    el.appendChild(menu);
  }
  menu.setAttribute('data-box', token.lootBoxId || (token.loot && token.loot.id) || '');
  menu.hidden = false;
  const Give = window.SSDNSLootGive;
  if (Give && Give.menuHtml && Give.box && Give.box(token.lootBoxId)) menu.innerHTML = Give.menuHtml(token.lootBoxId);
  else menu.innerHTML = chestMenuHtml(lootStub(token));
}
function chestMenuHtml(box) {
  const Loot = window.SSDNSLoot;
  if (!Loot || !Loot.menu || !box) return '<p>Chest</p>';
  let sheet = {};
  try { sheet = (window.SSDNSApp && window.SSDNSApp.doc && window.SSDNSApp.doc().character) || {}; } catch (e) { sheet = {}; }
  const opts = Loot.menu(box, sheet);
  const open = box.boxType === 'enemy-drop' && Loot.blocked && !Loot.blocked(box);
  const take = open ? '<button type="button" data-chest="take-all">Take all</button> ' : '';
  return '<p><b>' + (box.name || 'Chest') + '</b></p>' + take + opts.map(o => {
    if (o.disabled) return '<p>' + o.label + '</p>';
    return '<button type="button" data-chest="' + o.id + '">' + o.label + '</button> ';
  }).join('');
}
function tokenPos(id) {
  if (!id) return null;
  const t = (state.tokens || []).find(tok => tok && (tok.id === id || tok.combatantId === id));
  if (!t || !t.pos || !isFinite(Number(t.pos.x)) || !isFinite(Number(t.pos.y))) return null;
  return { x: Number(t.pos.x), y: Number(t.pos.y) };
}
function pinLootChest(box, at) {
  if (role !== 'dm' || !box || !state.scene) return null;
  const given = at && isFinite(Number(at.x)) && isFinite(Number(at.y)) ? { x: Number(at.x), y: Number(at.y) } : null;
  const spot = given || nextFreeSpot(1, box.name || 'Chest');
  const token = makeToken({
    kind: 'chest',
    name: box.name || 'Chest',
    label: String(box.boxType || 'chest').replace('supply-crate', 'Crate').replace('outlaw-stash', 'Stash').replace('saddlebag', 'Saddlebag').replace('strongbox', 'Strongbox').replace('sealed-crate', 'Sealed').replace('enemy-drop', 'Loot').slice(0, 16),
    color: '#8a5a2b',
    ownerCanMove: false,
    pos: spot || undefined
  });
  if (!token) return null;
  token.kind = 'chest';
  token.lootBoxId = box.id;
  token.loot = box;
  if (shared.tokens[token.id]) {
    shared.tokens[token.id].kind = 'chest';
    shared.tokens[token.id].lootBoxId = box.id;
    shared.tokens[token.id].loot = box;
  }
  box.tokenId = token.id;
  saveToken(token.id);
  selectToken(token);
  return token;
}
function focusLootChest(boxId) {
  const token = state.tokens.find(t => t && (t.lootBoxId === boxId || (t.loot && t.loot.id === boxId)));
  if (!token) return "";
  selectToken(token);
  return token.id;
}
const seenAssetReq = {};
function assetLib() { return window.SSDNSAssetLibrary || null; }
function myMapToken() {
  return (state.tokens || []).find(t => t && t.ownerUid === uid && onViewedScene(t)) || null;
}
function assetReachNeed(token) {
  const a = token && token.asset;
  if (!a) return 5;
  if (a.reachFt != null && a.reachFt !== "") return Number(a.reachFt);
  if (a.interact && a.interact.reachFt != null) return Number(a.interact.reachFt);
  return 5;
}
function commitAssetToken(token, res) {
  if (!token || !res || !res.ok) return;
  token.asset = res.asset;
  token.image = res.image || token.image || "";
  token.lights = res.lights || [];
  token._img = null;
  if (token.image) loadTokenImage(token);
  if (shared.tokens[token.id]) {
    shared.tokens[token.id].asset = JSON.parse(JSON.stringify(token.asset));
    shared.tokens[token.id].image = token.image;
    shared.tokens[token.id].lights = JSON.parse(JSON.stringify(token.lights || []));
    shared.tokens[token.id].kind = "asset";
    shared.tokens[token.id].assetDefId = token.assetDefId || (token.asset && token.asset.defId) || "";
  }
  saveToken(token.id);
  draw();
}
function playAssetSfx(url, from) {
  if (!url || (from && from === uid)) return;
  const Audio = window.SSDNSAudio;
  if (Audio && Audio.playUrl) Audio.playUrl(url);
}
function postAssetSfx(ref) {
  const A = assetLib();
  const url = A && A.sfxUrl ? A.sfxUrl(ref) : "";
  if (!url) return;
  playAssetSfx(url, "");
  if (!adapter || !adapter.write || !uid) return;
  const id = "assetsfx_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const row = { id: id, ts: new Date().toISOString(), from: uid, fromName: "DM", text: "sfx", kind: "sfx", event: "asset-sfx", sfxUrl: url };
  try {
    const p = adapter.write("tableFeed/" + id, row, { by: uid });
    if (p && p.catch) p.catch(() => {});
  } catch (e) {}
}
function postAssetLog(text) {
  if (!text || !adapter || !adapter.write || !uid) return;
  const id = "assetlog_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const row = {
    id: id, ts: new Date().toISOString(), from: uid,
    fromName: role === "dm" ? "DM" : "Table", text: String(text), kind: "note"
  };
  try {
    const p = adapter.write("tableFeed/" + id, row, { by: uid });
    if (p && p.catch) p.catch(() => {});
  } catch (e) {}
}
function finishAsset(token, res) {
  commitAssetToken(token, res);
  if (res.sfx) postAssetSfx(res.sfx);
  if (res.log) postAssetLog(res.log);
  if (res.log) toast(res.log);
  const menu = el.querySelector('[data-act="assetMenu"]');
  if (menu && !menu.hidden && menu.getAttribute("data-token") === token.id) showAssetMenu(token);
}
function interactApi() { return window.SSDNSInteract || null; }
function syncTokenRecord(token) {
  if (!token) return;
  const copy = token.asset ? JSON.parse(JSON.stringify(token.asset)) : null;
  const live = state.tokens.find(t => t && t.id === token.id);
  if (live && live !== token && copy) live.asset = JSON.parse(JSON.stringify(copy));
  if (shared.tokens && shared.tokens[token.id]) {
    if (copy) shared.tokens[token.id].asset = copy;
    else delete shared.tokens[token.id].asset;
  }
  if (role === "dm") saveToken(token.id);
}
function playInteractSfx(ref) {
  const Audio = window.SSDNSAudio;
  if (!Audio || !ref) return;
  try {
    if (Audio.playUrl && Audio.fileUrl) Audio.playUrl(Audio.fileUrl("sfx", ref));
    else if (Audio.playUrl) Audio.playUrl(ref);
  } catch (e) {}
}
function blastFromPlan(ex, token) {
  const effect = (ex && ex.effect) || {};
  const I = interactApi();
  try {
    window.dispatchEvent(new CustomEvent("ssdns-asset-blast", { detail: {
      tokenId: token && token.id,
      name: (token && token.asset && token.asset.name) || (token && token.name) || "Bomb",
      origin: ex && ex.origin, radiusFt: effect.radiusFt, damage: effect.damage,
      damageType: effect.damageType || "", save: effect.save || "DEX", dc: effect.dc,
      halfOnSave: !!effect.halfOnSave, targets: (ex && ex.targets) || [],
      sfx: (I && I.BOOM_SFX) || ""
    }}));
  } catch (e) {}
}
function postDoorReq(assetReq, text) {
  if (!adapter || !adapter.write) return;
  const id = "asset_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const row = {
    id: id, ts: new Date().toISOString(), from: uid,
    fromName: role === "dm" ? "DM" : "Player",
    text: text || "asset", kind: "sfx", event: "asset", assetReq: assetReq
  };
  try {
    const p = adapter.write("tableFeed/" + id, row, { by: uid });
    if (p && p.catch) p.catch(() => {});
  } catch (e) {}
}
function playerSheet() {
  try { return (window.SSDNSApp && window.SSDNSApp.doc && window.SSDNSApp.doc().character) || {}; } catch (e) { return {}; }
}
function performDoor(target, action, by) {
  const I = interactApi();
  if (!I) return { ok: false, handled: true, reason: "no interact" };
  const ref = target && target.wall ? target.wall : target;
  const wall = I.findWall(sceneData().walls || [], ref);
  if (!wall || !wall.door) return { ok: false, handled: true, reason: "Not a door" };
  const fromPlayer = !!(by && by !== uid);
  if (fromPlayer && doorIsSecret(wall)) return { ok: false, handled: true, reason: "hidden", silent: true };
  const actor = (state.tokens || []).find(t => t && (t.ownerUid === by || t.id === by)) || null;
  if (fromPlayer) {
    const gate = I.inReach(actor, wall, false, 5);
    if (!gate.ok) {
      const msg = I.reachToast(gate.feet);
      toast(msg);
      return { ok: false, handled: true, reason: "reach", toast: msg, feet: gate.feet };
    }
  }
  if (action === "lockpick") {
    const dc = Number(wall.lockDc) || 0;
    let ok = false;
    if (target && target.total != null && target.total !== "") ok = Number(target.total) >= dc;
    else if (target && target.success != null) ok = !!target.success;
    else {
      const rolled = I.lockpick(wall, playerSheet());
      ok = !!rolled.success;
    }
    if (ok) wall.locked = false;
    const line = ok ? "Lockpick succeeds. Door unlocked." : "Lockpick fails. Door stays locked.";
    toast(ok ? "Door unlocked" : "Still locked");
    postAssetLog(line);
    saveScene();
    draw();
    return { ok: true, handled: true, success: ok, log: line, toast: ok ? "Door unlocked" : "Still locked" };
  }
  const res = I.applyDoor(wall, action, { dm: !fromPlayer, token: actor, by: by || uid, ignoreReach: !fromPlayer });
  if (res && res.toast) toast(res.toast);
  else if (res && (res.logLine || res.log)) toast(res.logLine || res.log);
  if (res && (res.logLine || res.log)) postAssetLog(res.logLine || res.log);
  if (res && res.ok !== false) saveScene();
  draw();
  if (res) res.handled = true;
  return res || { ok: false, handled: true };
}
function rememberDoorAt(gx, gy) {
  const I = interactApi();
  if (!I || role !== "dm") return;
  const wall = I.nearestDoor(sceneData().walls || [], gx, gy, 1.2);
  state.doorPick = wall && wall.door ? wall : null;
  paintDoorEdit();
}
function paintDoorEdit() {
  const box = q("doorEdit");
  if (!box || role !== "dm") return;
  const wall = state.doorPick;
  const live = wall && (sceneData().walls || []).indexOf(wall) >= 0;
  box.hidden = !live;
  if (!live) return;
  const locked = box.querySelector('[data-act="doorLocked"]');
  const dc = box.querySelector('[data-act="doorLockDc"]');
  const ajar = box.querySelector('[data-act="doorAjar"]');
  const trap = box.querySelector('[data-act="doorTrapOnFail"]');
  if (locked) locked.checked = !!wall.locked;
  if (dc && document.activeElement !== dc) dc.value = wall.lockDc != null ? wall.lockDc : 15;
  if (ajar) ajar.checked = !!wall.ajar;
  if (trap) trap.checked = !!wall.trapOnFail;
}
function commitDoorEdit() {
  const wall = state.doorPick;
  if (!wall || role !== "dm" || (sceneData().walls || []).indexOf(wall) < 0) return;
  const box = q("doorEdit");
  if (!box) return;
  wall.locked = !!box.querySelector('[data-act="doorLocked"]').checked;
  wall.lockDc = Math.max(0, parseInt(box.querySelector('[data-act="doorLockDc"]').value, 10) || 0);
  wall.trapOnFail = !!box.querySelector('[data-act="doorTrapOnFail"]').checked;
  if (box.querySelector('[data-act="doorAjar"]').checked) { wall.ajar = true; wall.open = false; }
  else wall.ajar = false;
  saveScene();
  draw();
}
function hideDoorMenu() {
  const menu = el.querySelector('[data-act="doorMenu"]');
  if (menu) menu.hidden = true;
}
function tryDoorClick(e, world) {
  if (!e || e.button !== 0 || state.tool) return false;
  const I = interactApi();
  if (!I || !state.scene) return false;
  const px = state.scene.grid.px || 70;
  const wall = I.nearestDoor(sceneData().walls || [], world.x / px, world.y / px, 0.7);
  if (!wall) return false;
  if (role !== "dm" && doorIsSecret(wall)) return false;
  showDoorMenu(wall);
  return true;
}
function showDoorMenu(wall) {
  const I = interactApi();
  if (!I || !wall) return;
  hideChestMenu();
  hideAssetMenu();
  let menu = el.querySelector('[data-act="doorMenu"]');
  if (!menu) {
    menu = document.createElement("div");
    menu.className = "ssm-chest-menu";
    menu.setAttribute("data-act", "doorMenu");
    menu.addEventListener("pointerdown", ev => ev.stopPropagation());
    menu.addEventListener("click", ev => {
      const act = ev.target && ev.target.getAttribute && ev.target.getAttribute("data-door");
      if (!act) return;
      ev.preventDefault();
      ev.stopPropagation();
      const live = I.findWall(sceneData().walls || [], menu._wallRef);
      if (!live) { toast("That door is gone"); return; }
      runDoorAction(live, act);
    });
    el.appendChild(menu);
  }
  menu._wallRef = I.wallRef(wall);
  const mine = role === "dm" ? null : myMapToken();
  const pack = I.doorMenu(wall, { token: mine, dm: role === "dm" });
  if (!pack.reach) {
    menu.hidden = true;
    if (pack.toast && !pack.hidden) toast(pack.toast);
    return;
  }
  menu.hidden = false;
  const lockNote = wall.locked ? " <span>Locked" + (role === "dm" && wall.lockDc ? " DC " + wall.lockDc : "") + "</span>" : "";
  menu.innerHTML = "<p><b>Door</b>" + lockNote + "</p>" + (pack.actions || []).map(o => {
    return '<button type="button" data-door="' + o.id + '">' + o.label + "</button> ";
  }).join("");
}
function runDoorAction(wall, action) {
  const I = interactApi();
  const Assets = window.SSDNSAssets;
  if (!I || !Assets || !Assets.onInteract) return;
  const mine = role === "dm" ? null : myMapToken();
  if (role !== "dm") {
    const pack = I.doorMenu(wall, { token: mine, dm: false });
    if (!pack.reach) { if (pack.toast) toast(pack.toast); return; }
    let nat = null, total = null, success = null;
    if (action === "lockpick") {
      const Loot = window.SSDNSLoot;
      const box = I.doorLockBox(wall);
      const sheet = playerSheet();
      const res = Loot && Loot.playCheck ? Loot.playCheck(box, "lockpick-yes", sheet) : I.lockpick(wall, sheet);
      nat = res && res.nat; total = res && res.total; success = !!(res && res.success);
      toast(success ? "Lockpick sent" : "Still locked");
    } else if (action === "open" && wall.locked) toast("Locked");
    else toast(action === "peek" ? "Peek sent" : "Sent");
    postDoorReq({ door: I.wallRef(wall), action: action, by: uid, nat: nat, total: total, success: success }, action);
    return;
  }
  const target = { door: true, wall: I.wallRef(wall), action: action };
  if (action === "lockpick") {
    const Loot = window.SSDNSLoot;
    const box = I.doorLockBox(wall);
    const res = Loot && Loot.playCheck ? Loot.playCheck(box, "lockpick-yes", playerSheet()) : I.lockpick(wall, playerSheet());
    target.nat = res && res.nat;
    target.total = res && res.total;
    target.success = !!(res && res.success);
  }
  Assets.onInteract(target, action, uid);
  showDoorMenu(wall);
}
function readBombEffects(rootEl) {
  const I = interactApi();
  if (!I || !rootEl) return [];
  return Array.prototype.map.call(rootEl.querySelectorAll('[data-act="bombFx"]'), row => {
    const val = (name) => {
      const node = row.querySelector('[data-fx="' + name + '"]');
      if (!node) return "";
      if (node.type === "checkbox") return !!node.checked;
      return node.value;
    };
    const targets = String(val("targets") || "").split(/[\s,]+/).filter(Boolean);
    return I.normalizeEffect({
      type: val("type"), radiusFt: val("radiusFt"), damage: val("damage"), damageType: val("damageType"),
      save: val("save"), dc: val("dc"), halfOnSave: val("half"), targets: targets,
      condition: val("condition"), ref: val("ref")
    });
  }).filter(Boolean);
}
function bindBomb(d, token) {
  const I = interactApi();
  if (!d || !token || !I) return;
  const panel = d.querySelector('[data-act="bombPanel"]');
  if (!panel || panel._bound) return;
  panel._bound = true;
  const add = panel.querySelector('[data-act="bombAddFx"]');
  if (add) add.addEventListener("click", ev => {
    ev.preventDefault();
    const box = panel.querySelector('[data-act="bombEffects"]');
    if (box) box.insertAdjacentHTML("beforeend", I.effectRowHtml());
  });
  const stamp = () => {
    const mode = (panel.querySelector('[data-act="bombMode"]') || {}).value || "fuse";
    const n = parseInt((panel.querySelector('[data-act="bombN"]') || {}).value, 10);
    const show = !!((panel.querySelector('[data-act="bombShow"]') || {}).checked);
    token.asset = token.asset || { state: {}, props: { timer: {} }, effects: [], interact: { actions: [] } };
    token.asset.props = token.asset.props || {};
    token.asset.props.timer = { mode: mode, fuseRounds: isFinite(n) ? n : 1 };
    token.asset.state = token.asset.state || {};
    token.asset.state.countdownVisible = show;
    token.asset.effects = readBombEffects(panel);
    token.asset.name = token.asset.name || token.name || "Bomb";
    if (token.kind !== "player") token.kind = token.kind || "asset";
    return token.asset;
  };
  const armBtn = panel.querySelector('[data-act="bombArm"]');
  if (armBtn) armBtn.addEventListener("click", ev => {
    ev.preventDefault();
    const asset = stamp();
    const mode = asset.props.timer.mode;
    const started = !!(state.initiative && state.initiative.started);
    const round = (state.initiative && state.initiative.round) || 1;
    if (mode === "instant" || mode === "plunger") {
      const Assets = window.SSDNSAssets;
      if (Assets && Assets.onInteract) Assets.onInteract(token.id, mode === "plunger" ? "push-plunger" : "trigger", uid);
      return;
    }
    const armed = I.arm(asset, { round: round, started: started, mode: mode === "timer" ? "timer" : "fuse", fuseRounds: asset.props.timer.fuseRounds });
    syncTokenRecord(token);
    const line = (token.name || "Bomb") + ": " + (armed.log || "Armed");
    toast(line);
    postAssetLog(line);
    draw();
  });
  const def = panel.querySelector('[data-act="bombDefuse"]');
  if (def) def.addEventListener("click", ev => {
    ev.preventDefault();
    stamp();
    const Assets = window.SSDNSAssets;
    if (Assets && Assets.onInteract) Assets.onInteract(token.id, "defuse", uid);
    else { I.defuse(token.asset); syncTokenRecord(token); toast("Defused"); }
    draw();
  });
  const now = panel.querySelector('[data-act="bombNow"]');
  if (now) now.addEventListener("click", ev => {
    ev.preventDefault();
    stamp();
    const Assets = window.SSDNSAssets;
    if (Assets && Assets.onInteract) Assets.onInteract(token.id, "trigger", uid);
  });
}
function paintAssetChip(ctx, token, s, r) {
  const I = interactApi();
  if (!I) return;
  const text = I.chipText(token, (state.initiative && state.initiative.round) || 1, role === "dm" ? "dm" : "player");
  if (!text) return;
  ctx.save();
  ctx.font = "bold 11px system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const tw = (ctx.measureText && ctx.measureText(text).width) || 16;
  const w = Math.max(18, tw + 10);
  const x = s.x - w / 2;
  const y = s.y - r - 16;
  ctx.fillStyle = "rgba(90, 28, 16, 0.92)";
  ctx.fillRect(x, y, w, 14);
  ctx.strokeStyle = "#e2c56a";
  ctx.strokeRect(x, y, w, 14);
  ctx.fillStyle = "#f6e2b0";
  ctx.fillText(text, s.x, y + 7);
  ctx.restore();
}
function attachInteract() {
  const I = interactApi();
  if (!I || !I.attach) return;
  I.attach({
    tokens: function () { return state.tokens || []; },
    walls: function () { return sceneData().walls || []; },
    round: function () { return (state.initiative && state.initiative.round) || 1; },
    started: function () { return !!(state.initiative && state.initiative.started); },
    tokenById: function (id) {
      return (state.tokens || []).find(t => t && (t.id === id || t.ownerUid === id)) || null;
    },
    feetBetween: function (a, b) { return feetBetween(a, b); },
    isDm: function (by) { return !by || by === uid; },
    sync: function (token) { syncTokenRecord(token); draw(); },
    saveScene: function () { saveScene(); },
    log: function (line) { if (role === "dm") postAssetLog(line); },
    playSfx: playInteractSfx,
    blast: blastFromPlan,
    performDoor: performDoor
  });
}
function applyAssetRequest(row) {
  if (role !== "dm" || !row || row.event !== "asset") return;
  if (row.id && seenAssetReq[row.id]) return;
  if (row.id) seenAssetReq[row.id] = 1;
  const req = row.assetReq || {};
  const Assets = window.SSDNSAssets;
  if (req.door && Assets && Assets.onInteract) {
    Assets.onInteract({
      door: true, wall: req.door, action: req.action,
      nat: req.nat, total: req.total, success: req.success
    }, req.action, req.by || row.from);
    return;
  }
  const A = assetLib();
  const token = (state.tokens || []).find(t => t && t.id === req.tokenId);
  if (!token) return;
  if (Assets && Assets.onInteract) {
    const via = Assets.onInteract(token.id, req.action, req.by || row.from);
    if (via && (via.handled || via.ok || via.stub)) {
      if (via.stub && !via.ok) toast("Coming soon");
      else if (!via.ok && via.toast) toast(via.toast);
      return;
    }
    if (via && via.toast) { toast(via.toast); return; }
  }
  if (!A) return;
  const res = A.applyFeed(token, row);
  if (!res || !res.ok) return;
  finishAsset(token, res);
}
function dmApplyAsset(token, action) {
  const A = assetLib();
  if (!A || !token) return { ok: false, reason: "no-asset" };
  const res = A.applyAction(token.asset, action);
  if (!res || !res.ok) return res || { ok: false };
  finishAsset(token, res);
  return res;
}
if (window.SSDNSAssetLibrary && window.SSDNSAssetLibrary.bind) {
  window.SSDNSAssetLibrary.bind({
    tokens: function () { return state.tokens || []; },
    apply: function (id, action) {
      const t = (state.tokens || []).find(tok => tok && tok.id === id);
      if (!t) return { ok: false, reason: "missing" };
      return dmApplyAsset(t, action);
    }
  });
}
function requestAssetAction(token, action) {
  if (!token || token.kind !== "asset") return;
  const A = assetLib();
  if (!A) return;
  const Assets = window.SSDNSAssets;
  if (role !== "dm") {
    if (!tokenSeenBy(token, sightFor(uid, getPlayerScene()))) { toast("You can't see that."); return; }
    const gate = A.reachGate(myMapToken(), token, assetReachNeed(token));
    if (!gate.ok) { toast(gate.feet == null ? "You need a token on this map." : gate.text); return; }
    const row = A.feedRow({ tokenId: token.id, action: action, by: uid, fromName: "Player" });
    if (adapter && adapter.write && uid) {
      try {
        const p = adapter.write("tableFeed/" + row.id, row, { by: uid });
        if (p && p.catch) p.catch(() => {});
      } catch (e) {}
    }
    toast("Sent");
    return;
  }
  const res = Assets && Assets.onInteract ? Assets.onInteract(token.id, action, uid) : dmApplyAsset(token, action);
  if (res && res.stub) toast("Coming soon");
  else if (res && res.ok === false && res.reason === "no-host") dmApplyAsset(token, action);
}
function placeAssetAt(def, cell) {
  if (role !== "dm" || !def) return null;
  const A = assetLib();
  if (!A || !A.instanceFromDef) return null;
  const inst = A.instanceFromDef(def);
  const token = makeToken({
    kind: "asset",
    name: def.name || "Asset",
    label: String(def.name || "Asset").slice(0, 16),
    size: def.size || 1,
    image: A.imageFor(inst),
    color: "#c9a227",
    ownerCanMove: false,
    targetable: !!def.targetable,
    hidden: !!def.hiddenFromPlayers,
    assetDefId: def.id,
    asset: inst,
    lights: A.lightsFor(inst),
    pos: cell
  });
  if (!token) return null;
  selectToken(token);
  toast("Placed " + (def.name || "asset"));
  return token;
}
function hideAssetMenu() {
  const menu = el.querySelector('[data-act="assetMenu"]');
  if (menu) menu.hidden = true;
}
function assetMenuHtml(token) {
  const A = assetLib();
  const acts = A && A.menuActions ? A.menuActions(token.asset) : [];
  const name = (token.asset && token.asset.name) || token.name || "Asset";
  const rows = acts.map(act => {
    if (act.stub) return '<button type="button" data-asset="' + act.id + '" disabled>' + act.label + "</button> ";
    return '<button type="button" data-asset="' + act.id + '">' + act.label + "</button> ";
  }).join("");
  return "<p><b>" + name.replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])) + "</b></p>" + (rows || "<p>No actions</p>");
}
function showAssetMenu(token) {
  if (!token) return;
  let menu = el.querySelector('[data-act="assetMenu"]');
  if (!menu) {
    menu = document.createElement("div");
    menu.className = "ssm-chest-menu";
    menu.setAttribute("data-act", "assetMenu");
    menu.addEventListener("pointerdown", ev => ev.stopPropagation());
    menu.addEventListener("click", ev => {
      const act = ev.target && ev.target.getAttribute && ev.target.getAttribute("data-asset");
      if (!act || ev.target.disabled) return;
      ev.preventDefault();
      ev.stopPropagation();
      const id = menu.getAttribute("data-token") || "";
      const live = state.tokens.find(t => t && t.id === id);
      if (live) requestAssetAction(live, act);
    });
    el.appendChild(menu);
  }
  menu.setAttribute("data-token", token.id);
  menu.hidden = false;
  menu.innerHTML = assetMenuHtml(token);
}
function selectToken(token) {
  if (!token) return;
  if (state.pendingTarget && role === 'dm') {
    if (token.id === state.pendingTarget.tokenId && state.pendingTarget.spellKind !== 'heal') {
      toast('Pick a different token');
      return;
    }
    const card = lookupCard(state.pendingTarget.tokenId);
    const wid = state.pendingTarget.weaponId || state.pendingTarget.spellId || '';
    const attack = card && ((card.attacks || []).find(a => a && (a.id === wid || a.name === wid)) || (card.spells || []).find(s => s && (s.id === wid || s.name === wid)));
    const verdict = armRange(attack || { id: wid }, token.id, state.pendingTarget.tokenId);
    const reach = touchGate(attack || { id: wid, name: (attack && attack.name) || wid }, state.pendingTarget.tokenId, token);
    if (reach) {
      toast(reach);
      return;
    }
    if (verdict && verdict.blocked) {
      noteOverride(verdict);
      if (window.SSDNSRangeRings && window.SSDNSRangeRings.clear) window.SSDNSRangeRings.clear();
      toast(verdict.button || 'Out of range');
      state.rangeTargetId = tokenCombatant(token.id);
      state.pendingTarget = null;
      paintPendingBanner();
      renderDrawer();
      draw();
      return;
    }
    const shot = state.pendingTarget;
    /* 0.3.67: store the combatant id (what the cylinder Target select uses) so the two stay in sync. */
    state.rangeTargetId = tokenCombatant(token.id);
    state.pendingTarget = null;
    paintPendingBanner();
    renderDrawer();
    draw();
    if (token.kind === 'asset' && window.SSDNSAssets && window.SSDNSAssets.onTarget) {
      try { window.SSDNSAssets.onTarget(token.id, attack || { id: wid }); } catch (eAssetTgt) {}
    }
    emit('drawer:target', Object.assign({ tokenId: shot.tokenId, weaponId: shot.weaponId || '', spellId: shot.spellId || '', targetTokenId: token.id, combatantId: tokenCombatant(shot.tokenId), targetCombatantId: tokenCombatant(token.id) }, shot.offhand && !shot.spellId ? { offhand: true } : (shot.fan && !shot.spellId ? { fan: true } : {})));
    if ((shot.offhand || shot.fan) && !shot.spellId) clearOffhand();
    return;
  }
  state.selected = token;
  state.selectedIds = [token.id];
  refreshSelectedPanel();
  if (token && (token.kind === 'chest' || token.lootBoxId)) {
    hideDoorMenu();
    showChestMenu(token);
    hideAssetMenu();
    const Give = window.SSDNSLootGive;
    if (Give && Give.selectBox && token.lootBoxId) Give.selectBox(token.lootBoxId);
  } else if (token && token.kind === 'asset') {
    hideChestMenu();
    hideDoorMenu();
    showAssetMenu(token);
  } else {
    hideChestMenu();
    hideAssetMenu();
  }
  if (role === 'dm') openDrawer(token.id);
  draw();
}
function playerTokenId(pid) {
  return 'ply_' + String(pid || '').replace(/[^A-Za-z0-9_-]/g, '_');
}
let tokensReady = false;
let viewReady = false;
let partySynced = false;
/* Untagged tokens used to be forced onto Dusty Spur, so on any other pack they vanished
   once the DM view filtered by floor. Keep a tag that is already set. Otherwise stamp the
   floor that is open now (Dusty Spur at boot, before a swap) and remember it on the token. */
let sceneTagging = false;
function stampScene(t, s) {
  if (!t) return;
  if (s && s.sceneId) { t.sceneId = s.sceneId; return; }
  if (t.sceneId) {
    if (s && !s.sceneId) s.sceneId = t.sceneId;
    return;
  }
  const sid = activeSceneId() || 'scn_dustyspur01';
  t.sceneId = sid;
  if (s) s.sceneId = sid;
  if (sceneTagging || role !== 'dm') return;
  sceneTagging = true;
  try { saveToken(t.id); } catch (e) {}
  sceneTagging = false;
}
function adoptSharedTokens() {
  const stamped = [];
  Object.keys(shared.tokens || {}).forEach(id => {
    const src = shared.tokens[id];
    if (!src || state.tokens.some(t => t && t.id === id)) return;
    /* A token with no sceneId belongs on the floor that is open when it first shows up.
       Boot has not swapped yet, so that floor is Dusty Spur and old single-map tokens stay put. */
    if (!src.sceneId) {
      src.sceneId = activeSceneId() || 'scn_dustyspur01';
      stamped.push(id);
    }
    state.tokens.push(JSON.parse(JSON.stringify(src)));
  });
  applySharedToTokens();
  stamped.forEach(saveToken);
}
function noteTokensReady() {
  tokensReady = true;
  syncPartyFromSnapshot();
}
function syncPartyFromSnapshot() {
  if (role !== 'dm' || !state.scene || !tokensReady || !viewReady || partySynced) return;
  partySynced = true;
  adoptSharedTokens();
  dedupePlayerTokens();
  dedupeLinkedTokens(fightKeepMap());
  ensurePartyTokens();
}
function makeToken(spec) {
  if (!state.scene) return null;
  spec = spec || {};
  const grid = state.scene.grid || { cols: 30, rows: 20 };
  const spot = spec.pos || viewCenterCell();
  const stable = spec.id || (spec.ownerUid && spec.kind === 'player' ? playerTokenId(spec.ownerUid) : '');
  if (stable) {
    const existing = state.tokens.find(t => t && t.id === stable);
    if (existing) return existing;
  }
  const id = stable || ('tok_' + Date.now().toString(36) + Math.floor(Math.random() * 1000));
  const owner = spec.ownerUid || '';
  const squares = tokSquares(spec.size); /* token size: Tiny-Medium 1, Large 2, Huge 3, Gargantuan 4; PCs default Medium */
  const at = clampFootprint(spot.x, spot.y, squares, grid);
  const token = {
    id: id,
    kind: spec.kind || 'npc',
    name: spec.name || 'Token',
    label: String(spec.label || spec.name || 'Tok').slice(0, 16),
    ownerUid: spec.ownerUid || '',
    controlledBy: spec.controlledBy ? spec.controlledBy.slice() : [],
    ownerCanMove: spec.ownerCanMove !== false,
    size: squares,
    color: spec.color || '',
    status: '',
    conditions: [],
    locked: false,
    hidden: false,
    pos: { x: at.x, y: at.y },
    sceneId: activeSceneId() || 'scn_dustyspur01',
    image: spec.image || '',
    sheetId: spec.sheetId || (spec.kind === 'player' ? owner : ''),
    combatantId: spec.combatantId || (spec.kind === 'player' ? owner : '')
  };
  if (spec.spellPiece) {
    token.spellPiece = String(spec.spellPiece);
    token.zoneId = spec.zoneId || '';
    token.noHpPool = true;
    token.notTargetable = true;
    token.noInit = true;
    token.moveFeet = Number(spec.moveFeet) || 0;
    token.kind = 'spell';
    token.combatantId = '';
    token.ownerCanMove = token.moveFeet > 0;
  }
  if (spec.kind === 'asset') {
    token.kind = 'asset';
    token.noInit = true;
    token.noHpPool = true;
    token.notTargetable = !spec.targetable;
    token.ownerCanMove = false;
    token.assetDefId = spec.assetDefId || '';
    token.asset = spec.asset || null;
    token.hidden = !!spec.hidden;
    if (Array.isArray(spec.lights)) token.lights = spec.lights;
  }
  state.tokens.push(token);
  shared.tokens[id] = JSON.parse(JSON.stringify(token));
  if (!token.spellPiece && !token.noInit) emit('combatant:add', { tokenId: id });
  saveToken(id);
  return token;
}
function canonicalPlayerToken(uid) {
  if (!uid || role !== 'dm') return null;
  const want = playerTokenId(uid);
  adoptSharedTokens();
  const owned = state.tokens.filter(t => t && t.ownerUid === uid);
  if (!owned.length) return null;
  let canon = owned.find(t => t.id === want) || owned[0];
  if (canon.id !== want) {
    const oldId = canon.id;
    const next = JSON.parse(JSON.stringify(canon));
    next.id = want;
    next.kind = 'player';
    next.ownerUid = uid;
    next.combatantId = next.combatantId || uid;
    next.sheetId = next.sheetId || uid;
    state.tokens = state.tokens.filter(t => t && t.id !== oldId);
    delete shared.tokens[oldId];
    if (adapter && adapter.remove) {
      adapter.remove('map/public/tokens/' + oldId);
      adapter.remove('map/dm/tokens/' + oldId);
    }
    state.tokens.push(next);
    shared.tokens[want] = JSON.parse(JSON.stringify(next));
    saveToken(want);
    canon = next;
    emit('party:sync', { playerId: uid, tokenId: want, replacedId: oldId });
  } else if (!canon.combatantId || !canon.sheetId) {
    if (!canon.combatantId) canon.combatantId = uid;
    if (!canon.sheetId) canon.sheetId = uid;
    canon.kind = canon.kind || 'player';
    const copy = shared.tokens[want] || (shared.tokens[want] = { id: want });
    copy.ownerUid = uid;
    copy.combatantId = canon.combatantId;
    copy.sheetId = canon.sheetId;
    copy.kind = canon.kind;
    saveToken(want);
  }
  const extras = [];
  state.tokens.forEach(t => {
    if (t && t.ownerUid === uid && t.id !== want) extras.push(t.id);
  });
  Object.keys(shared.tokens || {}).forEach(id => {
    const t = shared.tokens[id];
    if (t && t.ownerUid === uid && id !== want && extras.indexOf(id) < 0) extras.push(id);
  });
  if (extras.length) removeMapTokens(extras, { keepOwner: true, silent: true });
  return state.tokens.find(t => t && t.id === want) || null;
}
function dedupePlayerTokens() {
  if (role !== 'dm') return;
  const uids = {};
  state.tokens.forEach(t => { if (t && t.ownerUid) uids[t.ownerUid] = 1; });
  Object.keys(shared.tokens || {}).forEach(id => {
    const t = shared.tokens[id];
    if (t && t.ownerUid) uids[t.ownerUid] = 1;
  });
  Object.keys(uids).forEach(uid => canonicalPlayerToken(uid));
}
function ensurePartyTokens() {
  if (role !== 'dm' || !state.scene || !tokensReady || !viewReady) return;
  const list = partyList();
  list.forEach((p, i) => {
    const who = p.uid || p.id;
    if (!who || dismissedMap()[who]) return;
    let token = canonicalPlayerToken(who);
    if (!token) {
      const cell = viewCenterCell();
      const name = p.name || p.label || who;
      token = makeToken({
        id: playerTokenId(who),
        kind: 'player',
        name: name,
        label: name,
        ownerUid: who,
        ownerCanMove: true,
        combatantId: who,
        sheetId: who,
        color: PC_COLORS[i % PC_COLORS.length],
        pos: { x: cell.x + (i % 5) - 2, y: cell.y }
      });
    }
    if (token && !token.image) {
      const preset = window.SSDNSTokenCrop && window.SSDNSTokenCrop.preset && window.SSDNSTokenCrop.preset(p.name || who);
      if (preset) rememberTokenImage(token, preset);
      else if (p.portrait) scheduleDefaultImage(token, p.portrait);
    }
    if (token) emit('party:sync', { playerId: who, tokenId: token.id });
  });
}
/* Map bestiary (Jessey approved 2026-10-20 9:28 PM): DM toolbar button -> searchable creature list with token art.
   Click a creature then a square, or drag it onto a square. The DMCC adds it to the fight and links the new token
   (same path as the Fight tab's "Add to initiative" + Link to...), so it is a combatant the moment it lands. */
function bestiaryGroups() {
  const choices = (typeof host.linkChoices === 'function' && host.linkChoices()) || {};
  return choices.bestiary || [];
}
function placeBeastAt(beast, world) {
  if (!beast || !beast.id || !state.scene) return;
  const px = (state.scene.grid && state.scene.grid.px) || 70;
  const cell = { x: Math.floor(world.x / px), y: Math.floor(world.y / px) };
  const grid = state.scene.grid || {};
  if (cell.x < 0 || cell.y < 0 || cell.x >= (grid.cols || 30) || cell.y >= (grid.rows || 20)) { toast('Drop it on a square'); return; }
  emit('bestiary:place', { beastId: beast.id, name: beast.name || '', at: cell });
  if (!state.beastKeep) armBeast(null);
}
function armBeast(beast) {
  state.beastArmed = beast || null;
  const panel = q('bestiaryPanel');
  if (panel) panel.querySelectorAll('.ssm-beast').forEach(b => b.classList.toggle('is-armed', !!beast && b.getAttribute('data-beast') === beast.id));
  const hint = q('bestiaryHint');
  if (hint) hint.textContent = beast ? ('Click a square to place ' + (beast.name || 'it') + (state.beastKeep ? ' (keeps placing until you pick another or press Esc)' : '') + '.') : 'Click a creature, then a square. Or drag it onto the map.';
  el.classList.toggle('ssm-placing', !!beast);
}
function paintBestiaryList() {
  const panel = q('bestiaryPanel');
  if (!panel) return;
  const list = panel.querySelector('.ssm-bestiary-list');
  const needle = String((panel.querySelector('input[type=search]') || {}).value || '').trim().toLowerCase();
  const groups = bestiaryGroups();
  let html = '';
  groups.forEach(g => {
    const rows = (g.options || []).filter(b => !needle || String(b.name || b.id).toLowerCase().indexOf(needle) >= 0 || String(g.label || '').toLowerCase().indexOf(needle) >= 0);
    if (!rows.length) return;
    html += '<div class="ssm-bestiary-group">' + esc(g.label || 'Bestiary') + '</div>';
    rows.forEach(b => {
      const art = b.token ? '<img alt="" loading="lazy" src="' + esc(asset(b.token)) + '">' : '<span class="ssm-beast-ph" aria-hidden="true"></span>';
      const meta = [b.size || '', b.cr != null && b.cr !== '' ? 'CR ' + b.cr : ''].filter(Boolean).join(' · ');
      html += '<button type="button" class="ssm-beast' + (state.beastArmed && state.beastArmed.id === b.id ? ' is-armed' : '') + '" draggable="true" data-beast="' + esc(b.id) + '" data-name="' + esc(b.name || b.id) + '">' + art +
        '<span><b>' + esc(b.name || b.id) + '</b>' + (meta ? '<span class="ssm-beast-meta">' + esc(meta) + '</span>' : '') + '</span></button>';
    });
  });
  list.innerHTML = html || '<p class="ssm-tactics">No creature matches.</p>';
  list.querySelectorAll('.ssm-beast').forEach(b => {
    const beast = { id: b.getAttribute('data-beast'), name: b.getAttribute('data-name') };
    b.addEventListener('click', () => armBeast(state.beastArmed && state.beastArmed.id === beast.id ? null : beast));
    b.addEventListener('dragstart', (ev) => {
      try { ev.dataTransfer.setData('text/x-ssdns-beast', JSON.stringify(beast)); ev.dataTransfer.effectAllowed = 'copy'; } catch (e) {}
      state.beastDrag = beast;
    });
    b.addEventListener('dragend', () => { state.beastDrag = null; });
  });
}
function toggleBestiary(force) {
  if (role !== 'dm') return;
  let panel = q('bestiaryPanel');
  const open = force != null ? !!force : !(panel && !panel.hidden);
  if (!panel) {
    panel = document.createElement('div');
    panel.setAttribute('data-act', 'bestiaryPanel');
    panel.className = 'ssm-bestiary';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Bestiary');
    panel.innerHTML = '<div class="ssm-bestiary-head"><b>Bestiary</b>' +
      '<label class="ssm-act" title="Keep placing the same creature (Bandit 1, Bandit 2, ...)"><input type="checkbox" data-act="bestiaryKeep"> Place several</label>' +
      '<button type="button" data-act="bestiaryClose" aria-label="Close bestiary">×</button></div>' +
      '<input type="search" data-act="bestiarySearch" placeholder="Search creatures" aria-label="Search creatures">' +
      '<div class="ssm-bestiary-list"></div>' +
      '<p class="ssm-bestiary-hint" data-act="bestiaryHint">Click a creature, then a square. Or drag it onto the map.</p>';
    el.appendChild(panel);
    panel.querySelector('[data-act="bestiaryClose"]').addEventListener('click', () => toggleBestiary(false));
    panel.querySelector('[data-act="bestiarySearch"]').addEventListener('input', paintBestiaryList);
    const keep = panel.querySelector('[data-act="bestiaryKeep"]');
    keep.addEventListener('change', () => { state.beastKeep = !!keep.checked; armBeast(state.beastArmed); });
    ['pointerdown', 'wheel'].forEach(ev => panel.addEventListener(ev, (e) => e.stopPropagation()));
  }
  panel.hidden = !open;
  const btn = q('bestiaryBtn');
  if (btn) { btn.setAttribute('aria-expanded', open ? 'true' : 'false'); btn.classList.toggle('active', open); }
  if (open) { paintBestiaryList(); const sb = panel.querySelector('input[type=search]'); if (sb) sb.focus(); }
  else armBeast(null);
}
function bindBestiaryDrop() {
  on(canvas, 'dragover', (e) => {
    if (role !== 'dm' || !state.beastDrag) return;
    e.preventDefault();
    try { e.dataTransfer.dropEffect = 'copy'; } catch (err) {}
  });
  on(canvas, 'drop', (e) => {
    if (role !== 'dm') return;
    let beast = state.beastDrag;
    try { const raw = e.dataTransfer.getData('text/x-ssdns-beast'); if (raw) beast = JSON.parse(raw); } catch (err) {}
    if (!beast || !beast.id) return;
    e.preventDefault();
    state.beastDrag = null;
    const keep = state.beastKeep;
    state.beastKeep = true; /* a drop never disarms a click-armed creature */
    placeBeastAt(beast, pointerWorld(e));
    state.beastKeep = keep;
  });
  on(window, 'keydown', (e) => { if (e.key === 'Escape' && state.beastArmed) armBeast(null); });
}
function addEnemyToken() {
  const cell = viewCenterCell();
  const n = state.tokens.filter(t => t.kind === 'npc' || t.kind === 'enemy').length;
  const token = makeToken({
    kind: 'npc',
    name: 'Enemy',
    label: 'Enemy',
    ownerUid: '',
    ownerCanMove: false,
    color: '#a33b3b',
    pos: { x: cell.x + (n % 4), y: cell.y }
  });
  if (!token) { toast('Open a scene first'); return; }
  selectToken(token);
  toast('Enemy token added. Grant it to a player, or leave it for the DM.');
}
function ownedTokenIds(uid, exceptId) {
  const ids = [];
  const want = playerTokenId(uid);
  state.tokens.forEach(tok => {
    if (!tok || tok.id === exceptId) return;
    if (tok.id === want || tok.ownerUid === uid) ids.push(tok.id);
  });
  Object.keys(shared.tokens || {}).forEach(id => {
    if (id === exceptId || ids.indexOf(id) >= 0) return;
    const s = shared.tokens[id];
    if (id === want || (s && s.ownerUid === uid)) ids.push(id);
  });
  return ids;
}
/* Move one token onto the stable player id, keeping the position it has now. */
function retargetTokenId(t, want) {
  if (!t || t.id === want) return t;
  const oldId = t.id;
  const next = JSON.parse(JSON.stringify(t, (k, v) => (k === '_img' || k === '_lightSig') ? undefined : v));
  next.id = want;
  if (t._img) next._img = t._img;
  state.tokens = state.tokens.filter(tok => tok && tok.id !== oldId);
  delete shared.tokens[oldId];
  if (adapter && adapter.remove) {
    adapter.remove('map/public/tokens/' + oldId);
    adapter.remove('map/dm/tokens/' + oldId);
  }
  state.tokens.push(next);
  shared.tokens[want] = JSON.parse(JSON.stringify(next, (k, v) => k === '_img' ? undefined : v));
  saveToken(want);
  return next;
}
/* DM button and the player's Add-my-token request. replace removes the old token instead of duplicating. */
function addPlayerTokenFor(who, opts) {
  opts = opts || {};
  if (role !== 'dm') return null;
  if (!who) { if (!opts.quiet) toast('No player to add'); return null; }
  delete dismissedMap()[who];
  if (adapter && adapter.remove) adapter.remove('map/dm/dismissed/' + who);
  const existing = canonicalPlayerToken(who) || tokenForOwner(who);
  if (existing && !opts.replace) { if (!opts.quiet) toast('That player already has a token'); return existing; }
  const had = !!existing;
  if (existing && opts.replace) {
    const ids = ownedTokenIds(who, '');
    if (ids.length) removeMapTokens(ids, { keepOwner: true, silent: true });
  }
  const p = partyList().find(x => (x.uid || x.id) === who) || {};
  const name = opts.name || p.name || p.label || who;
  /* Same next-free square a linked enemy uses (placeLinkedToken → nextFreeSpot), so a second
     player does not land on the square the first one already occupies. */
  const label = String(name).slice(0, 16);
  const spot = nextFreeSpot(1, label);
  if (!spot) { if (!opts.quiet) toast('No open square'); return null; }
  const token = makeToken({
    id: playerTokenId(who),
    kind: 'player',
    name: name,
    label: name,
    ownerUid: who,
    ownerCanMove: true,
    combatantId: who,
    sheetId: who,
    color: opts.color || '#4a90d9',
    pos: spot
  });
  if (!token) return null;
  if (opts.sceneId) {
    token.sceneId = opts.sceneId;
    if (shared.tokens[token.id]) shared.tokens[token.id].sceneId = opts.sceneId;
    saveToken(token.id);
  }
  const profile = p.lightProfile || null;
  if (profile) applyLightsToToken(token, profile, 'snap');
  emit('party:sync', { playerId: who, tokenId: token.id });
  if (!opts.quiet) selectToken(token);
  if (had && opts.replace) toast("Replaced " + name + "'s old token.");
  else if (!opts.quiet) toast('Player token added');
  return token;
}
function addPlayerToken() {
  const who = q('grantUid') && q('grantUid').value;
  return addPlayerTokenFor(who, {});
}
let defaultSceneDone = false;
let sawRemoteScene = false;
function ensureDefaultScene() {
  if (role !== 'dm' || sawRemoteScene || defaultSceneDone) return;
  const sid = (state.scene && state.scene.id) || 'scn_dustyspur01';
  const cur = (shared.scenes && shared.scenes[sid]) || {};
  if (cur.walls && cur.walls.length) { defaultSceneDone = true; return; }
  shared.scenes[sid] = {
    id: sid,
    name: (state.scene && state.scene.name) || 'Dusty Spur',
    walls: cur.walls || [],
    fogRects: cur.fogRects || [],
    fogPolys: cur.fogPolys || [],
    fogRevealed: cur.fogRevealed === true
  };
  if (Array.isArray(cur.fogShapes)) shared.scenes[sid].fogShapes = cur.fogShapes;
  defaultSceneDone = true;
  saveScene(sid);
}

/* ---- BG3 click-to-move (map/ssdns-map-move.js). Sheet Map and DMCC Map share this. ---- */
function moveApi() { return window.SSDNSMapMove || null; }
function clearMovePreview() {
  state.moveHover = null;
  if (state.moveConfirm) state.moveConfirm.pending = null;
  requestDraw();
}
/* Right-click leaves Move mode during a fight. Outside a fight it only clears the path preview. */
function cancelMoveGesture() {
  if (fightOn() && state.moveMode && window.SSDNSMoveMode) window.SSDNSMoveMode.set(false, 'cancel');
  else clearMovePreview();
}
let suppressFeetToast = false;
function exitMoveMode(why) {
  if (!window.SSDNSMoveMode || !window.SSDNSMoveMode.isOn()) return;
  window.SSDNSMoveMode.set(false, why || 'set');
}
/* Feet at 0 drops Move mode. The walk that spent the last feet toasts once itself. */
function checkFeet() {
  if (!state.moveMode || !fightOn() || dmEditing()) return;
  const mover = activeMover();
  if (!mover) return;
  const b = budgetFor(mover);
  if (!b || b.free || b.left > 0) return;
  exitMoveMode('feet');
}
function onMoveModeEvent(e) {
  if (dead) return;
  const why = (e && e.detail && e.detail.why) || '';
  const on = !!(window.SSDNSMoveMode && window.SSDNSMoveMode.isOn());
  if (on && fightOn() && !dmEditing() && why !== 'blocked' && why !== 'feet') {
    const mover = activeMover();
    const b = mover ? budgetFor(mover) : null;
    if (b && !b.free && b.left <= 0) {
      toast(role === 'dm' ? dmFeetToast(b, mover) : ('No movement left this turn' + (b.dash ? '.' : '. Dash uses your Action to double it.')));
      exitMoveMode('blocked');
      return;
    }
  }
  const was = !!state.moveMode;
  state.moveMode = on;
  if (!on) {
    state.moveHover = null;
    if (state.moveConfirm) state.moveConfirm.pending = null;
  }
  state.moveReachKey = '';
  if (was && !on && why === 'feet' && !suppressFeetToast) toast('No movement left');
  requestDraw();
}
on(window, 'ssdns:move-mode', onMoveModeEvent);
on(document, 'click', (e) => {
  if (!state.moveMode) return;
  const t = e.target && e.target.closest && e.target.closest('#btnEndTurn, #btnNextTurn, [data-act="stripNext"]');
  if (!t) return;
  exitMoveMode('turn');
});
function fightOn() {
  const T = window.SSDNSTurn;
  return !!(T && T.inFight && T.inFight(state.initiative));
}
/* Edit tokens is DM-only. Player maps have no toggle and this stays false for role !== 'dm'. */
function dmEditing() {
  return role === 'dm' && !!state.dmEdit;
}
const DM_EDIT_KEY = 'ssdns.map.dmEdit';
const DM_EDIT_HINT = 'Swap to Edit map tokens to freely move';
function toastDmEditHint() {
  if (!dmEditing() && role === 'dm' && fightOn()) toast(DM_EDIT_HINT);
}
function paintDmEdit() {
  const b = q('dmEditBtn');
  if (!b || role !== 'dm') return;
  const on = dmEditing();
  b.classList.toggle('active', on);
  b.setAttribute('aria-pressed', on ? 'true' : 'false');
  b.textContent = on ? 'Edit tokens: ON' : 'Edit tokens';
}
function setDmEdit(on) {
  if (role !== 'dm') return;
  state.dmEdit = !!on;
  try { localStorage.setItem(DM_EDIT_KEY, state.dmEdit ? '1' : '0'); } catch (e) {}
  state.moveHover = null;
  if (state.moveConfirm) state.moveConfirm.pending = null;
  state.moveReachKey = '';
  paintDmEdit();
  if (!on) checkFeet();
  requestDraw();
}
function linkedIdForRow(row) {
  if (!row || row.kind === 'player' || !row.id) return '';
  if (row.mapTokenId) return row.mapTokenId;
  if (typeof host.linkedTokenId !== 'function') return '';
  try { return host.linkedTokenId(row.id) || ''; } catch (e) { return ''; }
}
function sheetHpNow() {
  let c = null;
  try { c = window.SSDNSApp && window.SSDNSApp.doc && window.SSDNSApp.doc().character; } catch (e) { c = null; }
  if (!c) return { cur: null, max: null };
  const max = (window.SSDNSSheet && window.SSDNSSheet.effHpMax && c.hpMax !== '' && c.hpMax != null)
    ? window.SSDNSSheet.effHpMax(Number(c.hpMax))
    : c.hpMax;
  return { cur: c.hpCurrent, max: max };
}
/* N68: numbers for the under-token bar. Own PCs use the sheet when canControl is true.
   Linked enemies use public revealed.hp only — never the DM card, never name/AC/block. */
function underTokenHp(t) {
  const Bar = window.SSDNSMapBar;
  if (!Bar || !t) return null;
  if (role === 'dm') {
    let card = null;
    try {
      if (host.getCard) card = host.getCard(t.id) || (t.combatantId && host.getCard(t.combatantId)) || (t.ownerUid && host.getCard(t.ownerUid)) || null;
    } catch (e) { card = null; }
    const hp = card && card.hp;
    return Bar.hp({
      role: 'dm',
      noHpPool: !!(t && t.noHpPool) || !!(card && card.noHpPool === true),
      dmCur: hp && hp.cur,
      dmMax: hp && hp.max,
      tokenHp: t.hp,
      tokenMax: t.maxHp
    });
  }
  const own = !!(t.ownerUid && t.ownerUid === uid) && canControl(t);
  const sheet = own ? sheetHpNow() : { cur: null, max: null };
  const row = rowForToken(t);
  let revealed = null;
  if (!own) {
    if (window.SSDNSApplied && window.SSDNSApplied.publicBarHp) revealed = window.SSDNSApplied.publicBarHp(row);
    else if (row && row.revealed && row.revealed.hp != null && row.revealed.hp !== '') revealed = { hp: row.revealed.hp, maxHp: row.revealed.maxHp };
  }
  return Bar.hp({
    role: 'player',
    canControl: own,
    noHpPool: !!(t && t.noHpPool) || !!(row && row.noHpPool === true),
    ownCur: sheet.cur,
    ownMax: sheet.max,
    revealed: revealed
  });
}
function rowForToken(token) {
  const order = (state.initiative && state.initiative.order) || [];
  if (!token) return null;
  const hit = order.find(row => row && (
    (token.combatantId && token.combatantId === row.id) ||
    token.id === row.id ||
    (row.mapTokenId && token.id === row.mapTokenId) ||
    (linkedIdForRow(row) && token.id === linkedIdForRow(row)) ||
    (row.playerId && token.ownerUid === row.playerId) ||
    (row.kind === 'player' && row.id && token.ownerUid === row.id) ||
    (row.kind === 'player' && token.sheetId && (token.sheetId === row.playerId || token.sheetId === row.id)) ||
    (row.kind === 'player' && token.combatantId && (token.combatantId === row.playerId || token.combatantId === row.id)) ||
    (row.kind === 'player' && token.id && playerTokenId(row.playerId || row.id) === token.id)
  ));
  if (hit) return hit;
  const R = window.SSDNSReact;
  const pid = R && R.linkedPlayerId ? R.linkedPlayerId(token, order) : '';
  if (!pid) return null;
  return order.find(row => row && row.kind === 'player' && (row.playerId === pid || row.id === pid)) || null;
}
function tokenForRow(row) {
  if (!row) return null;
  const linked = linkedIdForRow(row);
  return state.tokens.find(t => t && t.pos && (
    (t.combatantId && t.combatantId === row.id) ||
    t.id === row.id ||
    (row.mapTokenId && t.id === row.mapTokenId) ||
    (linked && t.id === linked) ||
    (row.playerId && t.ownerUid === row.playerId) ||
    (row.kind === 'player' && row.id && t.ownerUid === row.id)
  )) || null;
}
function allyOf(mover, other) {
  if (!mover || !other) return false;
  const side = (tok) => {
    const k = String(tok.kind || tok.side || '').toLowerCase();
    if (k === 'enemy') return 'enemy';
    if (k === 'friendly' || k === 'ally') return 'ally';
    if (k === 'player' || tok.ownerUid) return 'player';
    return 'other';
  };
  const a = side(mover), b = side(other);
  if (a === 'enemy') return b === 'enemy';
  return (a === 'player' || a === 'ally') && (b === 'player' || b === 'ally');
}
function activeMover() {
  if (fightOn()) {
    const T = window.SSDNSTurn;
    const row = T && T.current ? T.current(state.initiative) : null;
    const token = tokenForRow(row);
    if (!token || token.locked) return null;
    if (role === 'dm') return canControl(token) ? token : null;
    if (!canControl(token) || turnBlocksMove()) return null;
    if (token.ownerUid && token.ownerUid !== uid && !(row && row.playerId === uid)) return null;
    return token;
  }
  if (role === 'player') {
    if (state.selected && canDrag(state.selected)) return state.selected;
    return state.tokens.find(t => t && t.ownerUid === uid && canDrag(t)) || null;
  }
  return state.selected && canDrag(state.selected) ? state.selected : null;
}
function budgetFor(token) {
  const free = { free: true, active: false, left: 100000, max: 100000, speed: 0, dash: false, disengage: false };
  if (!fightOn()) return free;
  if (host.movementBudget) {
    try {
      const b = host.movementBudget(token);
      if (b && typeof b === 'object') return b;
    } catch (e) {}
  }
  const T = window.SSDNSTurn;
  if (role === 'player' && T && window.SSDNSActionPips && window.SSDNSActionPips.state) {
    const m = window.SSDNSActionPips.state() || {};
    const sp = window.SSDNSTurnLock && window.SSDNSTurnLock.speed ? window.SSDNSTurnLock.speed() : 30;
    const mv = T.moveLeft(m, sp);
    return { free: false, active: true, left: mv.left, max: mv.max, speed: sp, dash: !!m.dash, disengage: !!m.disengage };
  }
  const row = rowForToken(token) || (T && T.current && T.current(state.initiative));
  const sp = Math.max(0, parseInt(row && (row.speed != null ? row.speed : (row.card && row.card.speed)), 10) || 30);
  const stored = (state.initiative && state.initiative.markers && row && state.initiative.markers[row.id]) || {};
  const mv = T ? T.moveLeft(stored, sp) : { left: sp, max: sp };
  return { free: false, active: true, left: mv.left, max: mv.max, speed: sp, dash: !!stored.dash, disengage: !!stored.disengage, local: true };
}
function spendFeet(token, feet) {
  const n = parseInt(feet, 10) || 0;
  if (!n) return;
  /* The sheet and the DMCC both pass spendMove. It returns true only when that host
     wrote the feet (DMCC). The player sheet's copy is a no-op so the sheet's own
     Move store (action pips) still records the walk. */
  if (typeof host.spendMove === 'function') {
    let handled = false;
    try { handled = host.spendMove(token, n) === true; } catch (e) { handled = false; }
    if (handled) {
      state.moveReachKey = '';
      return;
    }
  }
  if (role === 'player' && window.SSDNSActionPips && window.SSDNSActionPips.move) {
    window.SSDNSActionPips.move(n);
    if (window.SSDNSTurnLock && window.SSDNSTurnLock.apply) window.SSDNSTurnLock.apply();
  } else if (fightOn()) {
    const T = window.SSDNSTurn;
    const row = rowForToken(token);
    if (T && row && state.initiative) {
      state.initiative.markers = Object.assign({}, state.initiative.markers || {});
      const m = T.markersFor(state.initiative.markers[row.id], state.initiative, row).markers;
      m.moveUsed = Math.max(0, (parseInt(m.moveUsed, 10) || 0) + n);
      state.initiative.markers[row.id] = m;
    }
  }
  state.moveReachKey = '';
}
function reactorFacts(t) {
  const row = rowForToken(t);
  let status = (t && t.status) || '';
  let hp = t && t.hp != null && t.hp !== '' ? t.hp : null;
  let noHpPool = !!(t && t.noHpPool);
  if (row) {
    if (row.status) status = row.status;
    if (row.noHpPool) noHpPool = true;
    if (row.hp != null && row.hp !== '') hp = row.hp;
  }
  if (role === 'dm' && t && typeof host.getCard === 'function') {
    try {
      const card = host.getCard(t.id) || (t.combatantId && host.getCard(t.combatantId)) || (t.ownerUid && host.getCard(t.ownerUid)) || null;
      if (card) {
        if (card.noHpPool) noHpPool = true;
        if (card.status) status = card.status;
        if (card.hp && card.hp.cur != null && card.hp.cur !== '') hp = card.hp.cur;
      }
    } catch (e) {}
  }
  if (role === 'player' && t && t.ownerUid && t.ownerUid === uid && window.SSDNSApp && window.SSDNSApp.doc) {
    try {
      const c = window.SSDNSApp.doc().character;
      if (c && c.hpCurrent != null && c.hpCurrent !== '') hp = c.hpCurrent;
    } catch (e) {}
  }
  return { status: status || '', hp: hp, noHpPool: noHpPool, conditions: tokenConditions(t) };
}
function reactorPlayerId(t) {
  if (!t) return '';
  if (t.ownerUid) return t.ownerUid;
  if (t.sheetId) return t.sheetId;
  const order = (state.initiative && state.initiative.order) || [];
  const R = window.SSDNSReact;
  if (R && R.linkedPlayerId) {
    const linked = R.linkedPlayerId(t, order);
    if (linked) return linked;
  }
  const row = rowForToken(t);
  if (row && row.kind === 'player') return row.playerId || row.id || '';
  /* Fight row mapTokenId is DM-only. The map's initiative copy does not carry it.
     The DM card still knows which token is this PC. */
  if (role === 'dm' && typeof host.getCard === 'function') {
    try {
      const card = host.getCard(t.id) || (t.combatantId && host.getCard(t.combatantId)) || null;
      const owner = card && (card.owner || '');
      if (owner && (card.kind === 'pc' || card.kind === 'player') && !card.dmActsAs) return owner;
    } catch (e) {}
  }
  return '';
}
function reactorDmRuns(t) {
  if (!t) return false;
  const row = rowForToken(t);
  const playerId = reactorPlayerId(t);
  if (!playerId) return true;
  if (t.dmActsAs || (row && row.dmActsAs)) return true;
  if (role !== 'dm' || typeof host.getCard !== 'function') return false;
  try {
    const card = host.getCard(t.id) || (t.combatantId && host.getCard(t.combatantId)) || (playerId && host.getCard(playerId));
    return !!(card && card.dmActsAs);
  } catch (e) { return false; }
}
function moveContext(mover, budget) {
  const grid = (state.scene && state.scene.grid) || { cols: 30, rows: 20 };
  const sceneId = (mover && mover.sceneId) || activeSceneId() || 'scn_dustyspur01';
  const list = blockingTokens(mover ? { [mover.id]: true } : {}).filter(t => (t.sceneId || 'scn_dustyspur01') === sceneId && t.pos);
  const occupants = list.map(t => {
    const facts = reactorFacts(t);
    const playerId = reactorPlayerId(t);
    let gunsmoke = false;
    if (playerId && uid && playerId === uid && window.SSDNSReact && window.SSDNSReact.hasGunsmoke && window.SSDNSApp && window.SSDNSApp.doc) {
      try { gunsmoke = window.SSDNSReact.hasGunsmoke((window.SSDNSApp.doc().character || {}).feats); } catch (e) { gunsmoke = false; }
    }
    return {
      id: t.id,
      x: t.pos.x,
      y: t.pos.y,
      size: tokSquares(t.size),
      kind: playerId ? 'player' : (t.kind || 'enemy'),
      ally: allyOf(mover, t),
      name: t.name || t.label || 'a creature',
      reachFt: reachFeetOf(t),
      reaction: reactionSpentOf(t),
      playerId: playerId,
      self: !!(uid && playerId && playerId === uid),
      dmRuns: reactorDmRuns(t),
      gunsmoke: gunsmoke,
      status: facts.status,
      hp: facts.hp,
      noHpPool: facts.noHpPool,
      conditions: facts.conditions
    };
  });
  return {
    grid: { cols: grid.cols || 30, rows: grid.rows || 20 },
    occupants: occupants,
    ignoreId: mover ? mover.id : '',
    moverSize: mover ? tokSquares(mover.size) : 1,
    /* Same start-on-wall rule as plain drags: crossesWall ignores t < 1e-6. */
    crosses: (a, b) => crossesWall(a.x, a.y, b.x, b.y),
    isBlocked: (x, y) => !!(window.SSDNSAssetLibrary && window.SSDNSAssetLibrary.cellBlockedByGate && window.SSDNSAssetLibrary.cellBlockedByGate(
      (state.tokens || []).filter(t => t && (t.sceneId || 'scn_dustyspur01') === sceneId && !(role !== 'dm' && t.hidden)), x, y)),
    disengage: !!(budget && budget.disengage),
    teleport: !!(budget && budget.teleport),
    forced: !!(budget && budget.forced),
    enemies: occupants.filter(o => !o.ally),
    terrainCost: (square) => {
      const Z = window.SSDNSSpellZones;
      if (!Z || !Z.terrainMult || !square) return 1;
      return Z.terrainMult(liveSpellZones(), {
        x: square.x, y: square.y, size: 1,
        id: mover ? (mover.combatantId || mover.ownerUid || mover.id) : "",
        ownerUid: (mover && mover.ownerUid) || ""
      });
    }
  };
}
function reachFeetOf(token) {
  const raw = token && (token.reachFt != null ? token.reachFt : token.reach);
  const n = parseInt(raw, 10);
  return isFinite(n) && n > 0 ? n : 5;
}
function reactionSpentOf(token) {
  const row = rowForToken(token);
  if (role === 'player' && window.SSDNSActionPips && token && token.ownerUid === uid) {
    const st = window.SSDNSActionPips.state ? window.SSDNSActionPips.state() : null;
    if (st) return !!st.reaction;
  }
  if (!row || !state.initiative) return false;
  const stored = (state.initiative.markers && state.initiative.markers[row.id]) || {};
  return !!stored.reaction;
}
function cellUnderEvent(e) {
  const w = pointerWorld(e);
  const px = (state.scene && state.scene.grid && state.scene.grid.px) || 70;
  return { x: Math.floor(w.x / px), y: Math.floor(w.y / px) };
}
function tokenSliding(id) {
  return (state.slides || []).some(s => s && s.id === id);
}
function reachFor(mover, budget) {
  const M = moveApi();
  if (!M || !mover) return null;
  const feet = budget.free ? 100000 : Math.max(0, budget.left || 0);
  const ctxm = moveContext(mover, budget);
  let wallSig = 0;
  try {
    (sceneData().walls || []).forEach(w => { wallSig += (w.x1 || 0) + (w.y1 || 0) + (w.x2 || 0) + (w.y2 || 0) + (w.open ? 1 : 0); });
  } catch (e) { wallSig = 0; }
  const posSig = state.tokens.map(t => t && t.pos ? t.id + ':' + t.pos.x + ',' + t.pos.y : '').join(';');
  const zoneSig = spellZoneList().map(z => z && (z.id + "@" + (z.origin && z.origin.x) + "," + (z.origin && z.origin.y) + (z.halfSpeed ? "h" : "") + (z.difficult ? "d" : ""))).join(";");
  const key = [mover.id, mover.pos.x, mover.pos.y, feet, budget.free ? 1 : 0, wallSig, posSig, zoneSig].join('|');
  if (state.moveReachKey === key && state.moveReach) return { reach: state.moveReach, ctx: ctxm, budget: budget };
  const reach = M.computeReach({ x: mover.pos.x, y: mover.pos.y }, feet, ctxm);
  state.moveReachKey = key;
  state.moveReach = reach;
  return { reach: reach, ctx: ctxm, budget: budget };
}
function hoverAt(cell, screen) {
  const M = moveApi();
  const mover = activeMover();
  if (!M || !mover || !cell || tokenSliding(mover.id)) { state.moveHover = null; return; }
  const budget = budgetFor(mover);
  const pack = reachFor(mover, budget);
  if (!pack) { state.moveHover = null; return; }
  const origin = { x: mover.pos.x, y: mover.pos.y };
  const same = cell.x === origin.x && cell.y === origin.y;
  const built = same ? null : M.computePath(origin, cell, budget.free ? 100000 : budget.left, Object.assign({}, pack.ctx, { reach: pack.reach }));
  const endOk = !same && M.canEndOn(cell.x, cell.y, pack.ctx);
  state.moveHover = {
    x: cell.x,
    y: cell.y,
    sx: screen ? screen.x : 0,
    sy: screen ? screen.y : 0,
    ok: !!built,
    blocked: !same && !endOk,
    path: built ? built.path : null,
    costFt: built ? built.costFt : 0,
    left: budget.left,
    free: !!budget.free,
    showReach: !budget.free && fightOn()
  };
}
function noteMoveHover(e) {
  /* Edit tokens and a fight with Move mode off show no path. Outside a fight the path stays. */
  if (dmEditing() || (fightOn() && !state.moveMode)) {
    if (state.moveHover) { state.moveHover = null; requestDraw(); }
    return;
  }
  if (!moveApi() || !state.scene || state.tool) return;
  if (state.drag && !state.drag.moveAim) return;
  const local = localXY(e);
  hoverAt(cellUnderEvent(e), local);
  requestDraw();
}
function flashLeaveReach() {
  el.classList.add('ssm-oa-flash');
  setTimeout(() => { if (!dead) el.classList.remove('ssm-oa-flash'); }, 700);
}
let reactHold = null;
window.SSDNSLeaveHold = {
  promptId: function () { return reactHold && reactHold.session ? reactHold.session.promptId : ""; }
};
function pathCost(built, fromIdx, toIdx) {
  const path = built && built.path;
  if (!path || toIdx <= fromIdx) return 0;
  const reach = built.reach;
  if (reach && typeof reach.get === 'function') {
    const a = reach.get(path[fromIdx].x + ',' + path[fromIdx].y);
    const b = reach.get(path[toIdx].x + ',' + path[toIdx].y);
    if (a && b) return Math.max(0, (b.costFt || 0) - (a.costFt || 0));
  }
  return (toIdx - fromIdx) * 5;
}
function paintReactWait(on) {
  let bar = q('reactWait');
  if (!on) {
    if (bar && bar.parentNode) bar.parentNode.removeChild(bar);
    return;
  }
  if (!bar) {
    bar = document.createElement('div');
    bar.setAttribute('data-act', 'reactWait');
    bar.className = 'ssm-react-wait';
    el.appendChild(bar);
  }
  bar.textContent = 'Waiting on opportunity attacks…';
}
function slideSegment(mover, built, fromIdx, toIdx, budget) {
  const path = built && built.path;
  if (!mover || !path || toIdx <= fromIdx) return false;
  const points = path.slice(fromIdx, toIdx + 1);
  if (points.length < 2) return false;
  const origin = { x: points[0].x, y: points[0].y };
  const dest = points[points.length - 1];
  const costFt = pathCost(built, fromIdx, toIdx);
  mover.pos.x = origin.x;
  mover.pos.y = origin.y;
  state.undoStack.push({ type: 'move', ids: [mover.id], from: { [mover.id]: origin }, to: { [mover.id]: { x: dest.x, y: dest.y } }, feet: budget && budget.free ? 0 : costFt });
  state.redoStack = [];
  markRangeMoved(mover.id, origin, dest);
  noteZoneCross(mover, origin, { x: dest.x, y: dest.y });
  startSlide(mover.id, points);
  postSlide(mover.id, points);
  if (budget && !budget.free) {
    suppressFeetToast = true;
    try {
      spendFeet(mover, costFt);
      const after = budgetFor(mover);
      if (fightOn() && after && !after.free && after.left <= 0) exitMoveMode('feet');
    } finally { suppressFeetToast = false; }
  }
  state.moveHover = null;
  if (state.moveConfirm) state.moveConfirm.pending = null;
  state.moveReachKey = '';
  requestDraw();
  return true;
}
function clearReactHold() {
  const R = window.SSDNSReact;
  if (reactHold && R && reactHold.session) R.unbind(reactHold.session.promptId);
  reactHold = null;
  paintReactWait(false);
  if (R && R.close) R.close();
}
function armLeaveReactor(view, oaId) {
  const reactorId = view && view.reactorId;
  if (role === 'dm' && window.DMCCEnhance && typeof window.DMCCEnhance.armReactOa === 'function') {
    try { window.DMCCEnhance.armReactOa(reactorId, oaId); return; } catch (e) {}
  }
  if (view && view.self && window.SSDNSActionPips && window.SSDNSActionPips.setOa) {
    window.SSDNSActionPips.setOa('oaArmed', oaId);
  }
}
function presentLeave(view) {
  const R = window.SSDNSReact;
  if (!R || !reactHold) return;
  const handler = function (choice, meta) { onLeaveChoice(choice, meta || {}); };
  R.bind(view.promptId, handler);
  let shown = false;
  if (typeof host.presentReact === 'function') {
    try { shown = host.presentReact(view, handler) === true; } catch (e) { shown = false; }
  }
  reactHold.remote = !!shown;
  if (shown) return;
  /* N73: a linked PC never gets both an Attack modal and an Attack mirror.
     If the host did not take the prompt, the DM still only waits. */
  const owns = !!(view && !view.dmRuns && (view.playerOwns || view.reactorKind === 'player' || view.reactorPlayerId));
  if (owns && role === 'dm') {
    R.openMirror(Object.assign({}, view, {
      playerOwns: true,
      dmRuns: false,
      hideAttack: true,
      spells: [],
      mirrorText: (view.reactorName || 'Someone') + ' is deciding on an opportunity attack…'
    }), function (choice, meta) {
      if (choice !== 'cancel') return;
      handler('cancel', meta || {});
    });
    return;
  }
  R.openModal(view, handler);
  if (role === 'dm') R.openMirror(view, handler);
}
/* After Attack, this client refreshes its own card. A remote reactor already switched on their click, so do not post a second ask. */
function refreshArmedCard() {
  const R = window.SSDNSReact;
  if (!reactHold || !R) return;
  const view = R.leaveView(reactHold.session, reactHold.moverName);
  if (!view) return;
  view.moverId = reactHold.moverId;
  view.moverPlayerId = reactHold.moverPlayerId;
  /* N70: only the client that makes the strike shows "Make the opportunity attack".
     A remote mover keeps the wait bar until the strike or Pass/Cancel. */
  const makesStrike = !!(view.self || !reactHold.remote || (view.dmRuns && role === 'dm'));
  if (!makesStrike) return;
  const handler = function (choice, meta) { onLeaveChoice(choice, meta || {}); };
  R.bind(view.promptId, handler);
  R.openModal(view, handler);
  if (role === 'dm') R.openMirror(view, handler);
}
function releaseReactHold(choice) {
  const R = window.SSDNSReact;
  if (!reactHold) {
    paintReactWait(false);
    if (R && R.close) R.close();
    return;
  }
  onLeaveChoice(choice || 'cancel', { escape: true });
}
function showLeaveCard() {
  const R = window.SSDNSReact;
  if (!reactHold || !R) return;
  if (typeof R.skipIneligible === 'function') {
    const skipped = R.skipIneligible(reactHold.session);
    (skipped.commits || []).forEach(function (c) {
      slideSegment(reactHold.mover, reactHold.built, c.from, c.to, reactHold.budget);
    });
    if (!reactHold.session || reactHold.session.phase === 'done' || skipped.done) {
      clearReactHold();
      return;
    }
  }
  let view = R.leaveView(reactHold.session, reactHold.moverName);
  if (!view || (typeof R.isIneligibleReactor === 'function' && R.isIneligibleReactor(view))) {
    onLeaveChoice('pass', {});
    return;
  }
  view.moverId = reactHold.moverId;
  view.moverPlayerId = reactHold.moverPlayerId;
  if (window.SSDNSDmJoin && typeof window.SSDNSDmJoin.enrichLeave === 'function') {
    try { view = window.SSDNSDmJoin.enrichLeave(view) || view; } catch (e) {}
  }
  presentLeave(view);
}
function clearArmedOa(oaId) {
  const P = window.SSDNSActionPips;
  if (P && P.state && P.setOa) {
    const st = P.state();
    if (st && st.oaArmed && (!oaId || st.oaArmed === oaId)) P.setOa('oaArmed', '');
  }
  if (window.DMCCEnhance && typeof window.DMCCEnhance.clearReactOa === 'function') {
    try { window.DMCCEnhance.clearReactOa(oaId); } catch (e) {}
  }
  if (window.SSDNSReact) window.SSDNSReact.oaCast = null;
}
function onLeaveChoice(choice, meta) {
  const R = window.SSDNSReact;
  if (!reactHold || !R) return;
  meta = meta || {};
  const session = reactHold.session;
  if (choice === 'cancel') {
    let guard = 0;
    while (reactHold && session.phase !== 'done' && guard++ < 40) {
      const step = R.answerLeave(session, 'pass', {});
      if (step.commit) slideSegment(reactHold.mover, reactHold.built, step.commit.from, step.commit.to, reactHold.budget);
      if (step.done || (!step.next && !step.commit)) break;
    }
    clearReactHold();
    return;
  }
  const striking = session.phase === 'attacking' || session.phase === 'casting';
  if (choice === 'attacked' && !striking) return;
  if (choice === 'attacked' && meta.oaId && session.oaId && meta.oaId !== session.oaId) return;
  const stamp = session.pi + ':' + session.qi + ':' + session.phase + ':' + choice;
  if (reactHold.stamp === stamp) return;
  reactHold.stamp = stamp;
  if (choice === 'attacked' || (choice === 'pass' && striking)) {
    if (typeof R.forgetSpent === 'function') R.forgetSpent(meta.oaId || session.oaId);
  }
  if (choice === 'pass' && striking) clearArmedOa(session.oaId || meta.oaId);
  const preview = R.leaveView(session, reactHold.moverName);
  const owns = !!(preview && preview.playerOwns);
  if (choice === 'allow') {
    meta.allowed = true;
    meta.oaId = meta.oaId || ('oa_' + Date.now().toString(36));
    if (preview && preview.self) armLeaveReactor(preview, meta.oaId);
  } else if ((choice === 'attack' || choice === 'cast') && !meta.oaId && !(owns && !meta.allowed)) {
    meta.oaId = 'oa_' + Date.now().toString(36);
    armLeaveReactor(preview, meta.oaId);
  }
  const result = R.answerLeave(session, choice, meta);
  if (result.toast) toast(result.toast);
  if (result.pending) {
    if (owns && window.SSDNSDmJoin && typeof window.SSDNSDmJoin.postReactAnswer === 'function') {
      try {
        window.SSDNSDmJoin.postReactAnswer(Object.assign({}, preview, {
          spellName: meta.spellName || '',
          spellLevel: meta.spellLevel || 0,
          gunsmoke: true
        }), choice, meta);
      } catch (e) {}
    }
    R.openModal({
      kind: 'leave',
      kicker: 'Opportunity attack',
      text: 'Waiting on the DM…',
      hideAttack: true,
      passLabel: 'Pass'
    }, function (c2) {
      if (c2 === 'pass' || c2 === 'cancel') onLeaveChoice('pass', {});
    });
    return;
  }
  if (result.armed) {
    const armedView = R.leaveView(session, reactHold.moverName);
    const localStrike = !!(armedView && (armedView.self || !reactHold.remote || (armedView.dmRuns && role === 'dm')));
    if (localStrike) {
      R.watchSpent(result.oaId, function () { onLeaveChoice('attacked', { oaId: result.oaId }); });
      refreshArmedCard();
    }
    return;
  }
  if (result.commit) slideSegment(reactHold.mover, reactHold.built, result.commit.from, result.commit.to, reactHold.budget);
  if (result.done) { clearReactHold(); return; }
  showLeaveCard();
}
function commitWalk(mover, built, budget) {
  if (!mover || !built || !built.path || built.path.length < 2) return;
  if (reactHold) { toast('Waiting on opportunity attacks…'); return; }
  const M = moveApi();
  const ctx = moveContext(mover, budget);
  /* Outside a fight there is no reaction window. A card must not cover the lobby. */
  if (!fightOn()) {
    slideSegment(mover, built, 0, built.path.length - 1, budget);
    return;
  }
  const plan = M && M.leaveReachPlan ? M.leaveReachPlan(built.path, ctx) : { pauses: [] };
  let pauses = plan.pauses || [];
  if (window.SSDNSReact && window.SSDNSReact.withoutIneligible) pauses = window.SSDNSReact.withoutIneligible(pauses);
  const filtered = window.SSDNSReact && window.SSDNSReact.withoutSpent
    ? window.SSDNSReact.withoutSpent(pauses)
    : { pauses: pauses, toasts: [] };
  (filtered.toasts || []).forEach(function (line) { toast(line); });
  if (!filtered.pauses.length) {
    slideSegment(mover, built, 0, built.path.length - 1, budget);
    return;
  }
  const session = window.SSDNSReact.freshLeave({ pauses: filtered.pauses }, built.path.length);
  session.moverId = mover.id;
  session.moverName = mover.label || mover.name || 'Someone';
  session.moverPlayerId = role === 'player' ? uid : '';
  const pre = filtered.pauses[0].index - 1;
  if (pre >= 1) slideSegment(mover, built, 0, pre, budget);
  reactHold = {
    mover: mover,
    moverId: mover.id,
    moverName: session.moverName,
    moverPlayerId: session.moverPlayerId,
    built: built,
    budget: budget,
    session: session
  };
  paintReactWait(true);
  flashLeaveReach();
  showLeaveCard();
}
function currentFightRow() {
  const T = window.SSDNSTurn;
  if (T && T.current && state.initiative) {
    const row = T.current(state.initiative);
    if (row) return row;
  }
  const order = (state.initiative && state.initiative.order) || [];
  const turn = (state.initiative && state.initiative.turn) || 0;
  return order[turn] || null;
}
function drawerIsCurrentEnemy(tokenId) {
  if (role !== 'dm' || !fightOn() || !tokenId) return false;
  const row = currentFightRow();
  if (!row || row.kind === 'player') return false;
  const token = tokenForRow(row);
  if (token && token.id === tokenId) return true;
  const cid = tokenCombatant(tokenId);
  return cid === row.id || tokenId === row.id || (!!row.mapTokenId && tokenId === row.mapTokenId);
}
/* B3: say why the walk stopped. Players keep the older sentence. */
function dmFeetToast(budget, mover) {
  const row = currentFightRow();
  const name = (budget && budget.name) || (row && (row.name || row.id)) || 'this combatant';
  if (!mover || (budget && budget.unlinked) || (budget && budget.active === false)) {
    return "This token isn't linked to " + name + " in the turn order. Link it, or turn on Edit tokens.";
  }
  const speed = Number(budget && budget.speed);
  if (!(speed > 0)) return 'Speed 0 ft. Set a speed on the token.';
  const max = budget.max != null ? budget.max : speed;
  const used = budget.used != null ? budget.used : Math.max(0, max - (budget.left || 0));
  return 'No movement left (' + used + '/' + max + ' used). Dash, or the DM can give feet back.';
}
function tryClickMove(cell) {
  const M = moveApi();
  if (!M || !cell || !state.scene) return false;
  if (state.tool) return false;
  /* Edit ON: empty-square clicks do not click-walk and do not spend feet. */
  if (dmEditing()) return false;
  /* B13: in a fight, clicks walk only while Move mode is on. Outside a fight they still walk. */
  if (fightOn() && !state.moveMode) return false;
  if (reactHold) { toast('Waiting on opportunity attacks…'); return true; }
  const mover = activeMover();
  if (mover && role === 'dm' && !onViewedScene(mover)) return true;
  if (!mover) {
    if (fightOn() && role === 'player') toast("It isn't your turn. Your token moves on your turn.");
    else if (fightOn() && role === 'dm') {
      const row = currentFightRow();
      if (row && row.kind !== 'player' && !tokenForRow(row)) toast(dmFeetToast({ unlinked: true, name: row.name || row.id || '' }, null));
    }
    return false;
  }
  if (tokenSliding(mover.id)) return true;
  const budget = budgetFor(mover);
  if (!budget.free && budget.left <= 0) {
    if (role === 'dm') toast(dmFeetToast(budget, mover));
    else toast('No movement left this turn' + (budget.dash ? '.' : '. Dash uses your Action to double it.'));
    return true;
  }
  const origin = { x: mover.pos.x, y: mover.pos.y };
  if (cell.x === origin.x && cell.y === origin.y) return false;
  const pack = reachFor(mover, budget);
  const feet = budget.free ? 100000 : budget.left;
  const built = M.computePath(origin, cell, feet, Object.assign({}, pack.ctx, { reach: pack.reach }));
  const slot = M.previewSlot(state.moveConfirm, cell, built);
  if (state.moveConfirm) state.moveConfirm.pending = slot.pending;
  if (!built) {
    const why = pack && !M.canEndOn(cell.x, cell.y, pack.ctx) ? 'That square is taken' : (budget.free ? "Can't move there" : 'Out of reach');
    if (role === 'dm' && !budget.free && why !== 'That square is taken') toastDmEditHint();
    else toast(why);
    requestDraw();
    return true;
  }
  if (!slot.commit) {
    hoverAt(cell, state.moveHover);
    requestDraw();
    return true;
  }
  commitWalk(mover, built, budget);
  return true;
}
function paintMoveReach() {
  if (dmEditing()) return;
  const hover = state.moveHover;
  const mover = activeMover();
  /* Green fill exists only while Move mode is on. The walk is gated the same way. */
  if (!state.moveMode) return;
  if (!mover || !fightOn()) return;
  if (role === 'dm' && !onViewedScene(mover)) return;
  const budget = budgetFor(mover);
  if (budget.free || budget.left <= 0) return;
  const pack = reachFor(mover, budget);
  const M = moveApi();
  if (!pack || !M) return;
  const px = state.scene.grid.px;
  ctx.save();
  pack.reach.forEach(node => {
    if (!node || node.costFt <= 0) return;
    if (!M.canEndOn(node.x, node.y, pack.ctx)) return;
    const a = worldToScreen(node.x * px, node.y * px);
    const b = worldToScreen((node.x + 1) * px, (node.y + 1) * px);
    ctx.fillStyle = 'rgba(64, 168, 96, 0.34)';
    ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
  });
  ctx.restore();
  if (hover && hover.showReach === false) return;
}
function paintMoveHover() {
  const hover = state.moveHover;
  if (!hover || !state.scene) return;
  const px = state.scene.grid.px;
  const a = worldToScreen(hover.x * px, hover.y * px);
  const b = worldToScreen((hover.x + 1) * px, (hover.y + 1) * px);
  ctx.save();
  ctx.fillStyle = hover.ok ? 'rgba(210, 184, 90, 0.35)' : 'rgba(176, 48, 48, 0.38)';
  ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
  if (hover.path && hover.path.length > 1) {
    ctx.strokeStyle = hover.ok ? '#e2c56a' : '#e07070';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    hover.path.forEach((pt, i) => {
      const s = worldToScreen((pt.x + 0.5) * px, (pt.y + 0.5) * px);
      if (i === 0) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y);
    });
    ctx.stroke();
  }
  const label = hover.ok
    ? (hover.free ? (hover.costFt + ' ft') : (hover.costFt + ' ft / ' + hover.left))
    : (hover.blocked ? "can't stop" : 'out of reach');
  ctx.setLineDash([]);
  ctx.font = '12px system-ui';
  ctx.textBaseline = 'bottom';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(12, 9, 6, 0.85)';
  ctx.fillStyle = hover.ok ? '#f6e7b2' : '#ffd0c8';
  const lx = (hover.sx || b.x) + 14;
  const ly = (hover.sy || a.y) - 6;
  ctx.strokeText(label, lx, ly);
  ctx.fillText(label, lx, ly);
  ctx.restore();
}
function showTurnPop(text) {
  let pop = q('turnPop');
  if (!pop) {
    pop = document.createElement('div');
    pop.setAttribute('data-act', 'turnPop');
    pop.className = 'ssm-turnpop';
    el.appendChild(pop);
  }
  pop.textContent = text;
  pop.classList.remove('is-on');
  void pop.offsetWidth;
  pop.classList.add('is-on');
}
function paintMoveReadout() {
  const slot = q('moveReadout');
  if (!slot) return;
  const mover = activeMover();
  if (!mover || !fightOn()) { slot.hidden = true; return; }
  const b = budgetFor(mover);
  if (b.free) { slot.hidden = true; return; }
  slot.hidden = false;
  const text = 'Move ' + b.left + '/' + b.max + ' ft';
  if (slot.textContent !== text) slot.textContent = text;
  const modeOn = !!(window.SSDNSMoveMode && window.SSDNSMoveMode.isOn());
  slot.classList.toggle('is-on', modeOn);
  slot.setAttribute('aria-pressed', modeOn ? 'true' : 'false');
}
function pathFeet(points) {
  let d = 0;
  for (let i = 1; i < points.length; i++) d += Math.hypot(points[i].x - points[i-1].x, points[i].y - points[i-1].y);
  return Math.round(d * 5);
}
function drawPath(points, color) {
  if (!points || points.length < 2) return;
  const px = state.scene.grid.px;
  ctx.save();
  ctx.strokeStyle = color || '#c9a227';
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  points.forEach((pt, i) => {
    const s = worldToScreen((pt.x + 0.5) * px, (pt.y + 0.5) * px);
    if (i === 0) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y);
  });
  ctx.stroke();
  points.forEach(pt => {
    const s = worldToScreen((pt.x + 0.5) * px, (pt.y + 0.5) * px);
    ctx.beginPath();
    ctx.arc(s.x, s.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = color || '#c9a227';
    ctx.fill();
  });
  const last = points[points.length - 1];
  const s = worldToScreen((last.x + 0.5) * px, (last.y + 0.5) * px);
  ctx.fillStyle = '#e8dcc8';
  ctx.font = '12px system-ui';
  ctx.fillText(pathFeet(points) + ' ft', s.x + 8, s.y - 8);
  ctx.restore();
}
function startSlide(id, points) {
  const token = state.tokens.find(t => t.id === id);
  if (!token || !points || points.length < 2) return;
  state.slides = (state.slides || []).filter(s => s.id !== id);
  state.lastPaths = state.lastPaths || {};
  state.lastPaths[id] = points.map(pt => ({ x: pt.x, y: pt.y }));
  state.slides.push({ id, points, start: Date.now(), ms: Math.max(400, points.length * 280) });
  ensureAnim();
}
function dropPin() {
  if (!state.drag || !state.drag.token) return;
  const t = state.drag.token;
  const gx = state.drag.ghost ? state.drag.ghost.x : t.pos.x;
  const gy = state.drag.ghost ? state.drag.ghost.y : t.pos.y;
  if (!state.drag.pins) state.drag.pins = [{ x: state.drag.starts?.[t.id]?.x ?? t.pos.x, y: state.drag.starts?.[t.id]?.y ?? t.pos.y }];
  const last = state.drag.pins[state.drag.pins.length - 1];
  if (Math.hypot(gx - last.x, gy - last.y) < 0.4) return;
  state.drag.pins.push({ x: gx, y: gy });
  toast('Pin ' + (state.drag.pins.length - 1));
  draw();
}
function popPin() {
  if (!state.drag || !state.drag.pins || state.drag.pins.length < 2) { toast('No pin to remove'); return; }
  state.drag.pins.pop();
  toast('Pin removed');
  draw();
}
/* Ghost Plan is retired. Names stay as no-ops so nothing dual-maintains a second move UI. */
function commitGhost() { state.pendingMoves = []; state.offline = false; state.ghostPlan = false; }
function cancelGhost() { state.pendingMoves = []; state.offline = false; state.ghostPlan = false; clearMovePreview(); }
function toggleGhost() { state.offline = false; state.ghostPlan = false; state.pendingMoves = []; }

function setLabel(token, value) {
  if (!token) return;
  token.label = value.slice(0, 16);
  if (shared.tokens[token.id]) shared.tokens[token.id].label = token.label;
  if (role === 'dm') saveToken(token.id);
  else publishPlayerPatch(token, { label: token.label });
  draw();
}
function canControlBy(token, by) {
  if (!token || !by) return false;
  const rec = shared.tokens && shared.tokens[token.id];
  const src = rec || token;
  const list = src.controlledBy || [];
  const ownerOk = src.ownerCanMove !== false;
  if (src.ownerUid === by && ownerOk) return true;
  return Array.isArray(list) && list.includes(by);
}
function canControl(token) {
  if (!token) return false;
  if (role === 'dm') return true;
  return canControlBy(token, uid);
}
function fillGrant() {
  const sel = q('grantUid');
  if (!sel || role !== 'dm') return;
  const raw = typeof options.players === 'function' ? options.players() : (options.players || (host.players && host.players()) || []);
  const list = Array.isArray(raw) ? raw : [];
  const prev = sel.value;
  sel.innerHTML = '';
  if (!list.length) {
    const o = document.createElement('option');
    o.value = '';
    o.textContent = 'No players in the room';
    sel.appendChild(o);
    return;
  }
  list.forEach(p => {
    const o = document.createElement('option');
    o.value = (p && (p.uid || p.id)) || '';
    o.textContent = (p && (p.name || p.label)) || o.value;
    if (o.value) sel.appendChild(o);
  });
  if (prev) sel.value = prev;
}
/* turn order PR 2 (item 5, Jessey 2026-10-21): during initiative a player drags their own token only on their own turn
   (or while the DM has unlocked them, table/initiative/unlock). The DM always can; outside combat everyone moves freely. */
function turnBlocksMove() {
  if (role === 'dm') return false;
  const T = window.SSDNSTurn;
  if (!T || !T.lockedFor) return false;
  return T.lockedFor(state.initiative, uid, '');
}
function canDrag(token) {
  if (!token) return false;
  if (token.locked) return false;
  if (!canControl(token)) return false;
  if (turnBlocksMove()) return false;
  return true;
}
function beastClick(e) {
  if (role !== 'dm' || !state.beastArmed || e.button !== 0) return false;
  e.preventDefault();
  placeBeastAt(state.beastArmed, pointerWorld(e));
  return true;
}
function onPointerDown(e) {
  pointers.set(e.pointerId, Object.assign({ t: Date.now() }, localXY(e)));
  if (pointers.size === 1) {
    /* 0.3.67: a pending Attacks target pick wins over the active tool (ruler, ping, walls, fog...),
       so the click on the target is never swallowed and the prompt never goes stale. */
    if (state.blast && e.button === 0) {
      e.preventDefault();
      blastPointer(e, 'down');
      return;
    }
    if (role === 'dm' && state.pendingTarget && e.button === 0) {
      const pw = pointerWorld(e);
      const pickHit = hitTest(pw.x, pw.y);
      e.preventDefault();
      if (pickHit) selectToken(pickHit);
      else toast('Click a highlighted token, or Cancel');
      return;
    }
    if (e.button === 1) {
      e.preventDefault();
      e.stopPropagation();
      state.drag = { pan: true, middle: true, sx: e.clientX, sy: e.clientY, vx: state.view.x, vy: state.view.y };
      draw();
      return;
    }
    if (role === 'dm' && state.tool === 'room') {
      const w = pointerWorld(e);
      const px = state.scene.grid.px;
      let gx = w.x / px, gy = w.y / px;
      if (state.snap) { gx = Math.round(gx); gy = Math.round(gy); }
      state.roomStart = { x: gx, y: gy };
      state.drag = { room: true };
      draw();
      return;
    }
    if (role === 'dm' && state.tool === 'door') {
      const w = pointerWorld(e);
      const px = state.scene.grid.px;
      if (!sceneData().walls.length) { toast('No walls'); return; }
      let best = 0, bestD = Infinity, bestT = 0.5;
      sceneData().walls.forEach((wall, i) => {
        const ax = wall.x1 * px, ay = wall.y1 * px;
        const bx = wall.x2 * px, by = wall.y2 * px;
        const dx = bx - ax, dy = by - ay;
        const len2 = dx*dx + dy*dy || 1;
        const t = Math.max(0, Math.min(1, ((w.x - ax)*dx + (w.y - ay)*dy) / len2));
        const d = Math.hypot(w.x - (ax + t*dx), w.y - (ay + t*dy));
        if (d < bestD) { bestD = d; best = i; bestT = t; }
      });
      const wall = sceneData().walls[best];
      const len = Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1);
      const markSecret = !!(state.secretDoor || e.shiftKey);
      if (e.button === 2) {
        if (wall.door || wall.window || len <= 1.5) {
          wall.open = false; wall.window = false; wall.shut = false; wall.door = false;
          wall.secret = false;
          delete wall.hidden;
          mergePlainWalls();
          toast('Door removed, wall restored');
        }
      } else if (markSecret && wall.window && !wall.door) {
        toast('That is a window');
      } else if (markSecret && (wall.door || doorIsSecret(wall) || len <= 1.5)) {
        const next = !doorIsSecret(wall);
        wall.door = true;
        wall.open = false;
        wall.window = false;
        wall.shut = false;
        wall.secret = next;
        if (!next) delete wall.hidden;
        toast(next ? 'Secret door — hidden from players' : 'Door revealed');
      } else if (markSecret && len > 1.5) {
        const segs = cutFeature(wall, w.x / px, w.y / px, { open: false, door: true, secret: true });
        sceneData().walls.splice(best, 1, ...segs);
        toast('Secret door cut (1 square)');
      } else if (wall.door || (len <= 1.5 && wall.open)) {
        wall.open = !wall.open;
        wall.door = true;
        toast(wall.open ? 'Door opened' : 'Door closed');
      } else if (len > 1.5) {
        const segs = cutFeature(wall, w.x / px, w.y / px, { open: false, door: true });
        sceneData().walls.splice(best, 1, ...segs);
        toast('Door cut (1 square)');
      }
      rememberDoorAt(w.x / px, w.y / px);
      saveScene();
      draw();
      return;
    }
    if (role === 'dm' && state.tool === 'window') {
      const w = pointerWorld(e);
      const px = state.scene.grid.px;
      if (!sceneData().walls.length) { toast('No walls'); return; }
      let best = 0, bestD = Infinity, bestT = 0.5;
      sceneData().walls.forEach((wall, i) => {
        const ax = wall.x1 * px, ay = wall.y1 * px;
        const bx = wall.x2 * px, by = wall.y2 * px;
        const dx = bx - ax, dy = by - ay;
        const len2 = dx*dx + dy*dy || 1;
        const t = Math.max(0, Math.min(1, ((w.x - ax)*dx + (w.y - ay)*dy) / len2));
        const d = Math.hypot(w.x - (ax + t*dx), w.y - (ay + t*dy));
        if (d < bestD) { bestD = d; best = i; bestT = t; }
      });
      const wall = sceneData().walls[best];
      const len = Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1);
      if (e.button === 2 && (wall.window || len <= 1.5)) {
        wall.window = false; wall.shut = false; wall.open = false; wall.door = false;
        mergePlainWalls();
        toast('Window removed, wall restored');
      } else if (wall.window) {
        wall.shut = !wall.shut;
        toast(wall.shut ? 'Window shut' : 'Window open');
      } else if (len <= 1.5) {
        wall.window = true;
        wall.shut = false;
        wall.open = false;
        toast('Window set');
      } else {
        const segs = cutFeature(wall, w.x / px, w.y / px, { window: true, shut: false, door: false });
        sceneData().walls.splice(best, 1, ...segs);
        toast('Window cut (1 square)');
      }
      saveScene();
      draw();
      return;
    }
    if (role === 'dm' && (state.tool === 'wall' || state.tool === 'delwall')) {
      const w = pointerWorld(e);
      const px = state.scene.grid.px;
      if (e.button === 2 || e.shiftKey || state.tool === 'delwall') {
        if (!sceneData().walls.length) { toast('No walls'); return; }
        let best = 0, bestD = Infinity;
        sceneData().walls.forEach((wall, i) => {
          const ax = wall.x1 * px, ay = wall.y1 * px;
          const bx = wall.x2 * px, by = wall.y2 * px;
          const dx = bx - ax, dy = by - ay;
          const len2 = dx*dx + dy*dy || 1;
          const t = Math.max(0, Math.min(1, ((w.x - ax)*dx + (w.y - ay)*dy) / len2));
          const pxp = ax + t*dx, pyp = ay + t*dy;
          const d = Math.hypot(w.x - pxp, w.y - pyp);
          if (d < bestD) { bestD = d; best = i; }
        });
        sceneData().walls.splice(best, 1);
        saveScene();
        toast('Wall deleted (' + sceneData().walls.length + ' left)');
        draw();
        return;
      }
      const gx = Math.round(w.x / px), gy = Math.round(w.y / px);
      state.wallStart = { x: gx, y: gy };
      state.drag = { wall: true };
      draw();
      return;
    }
    if (role === 'dm' && state.tool === 'erase') {
      e.preventDefault();
      e.stopPropagation();
      const w = pointerWorld(e);
      const px = state.scene.grid.px;
      const hit = fogAt(w.x / px, w.y / px);
      if (e.shiftKey) {
        if (!hit) return;
        if (!state.fogSelection) state.fogSelection = [];
        const idx = state.fogSelection.indexOf(hit.id);
        if (idx >= 0) state.fogSelection.splice(idx, 1);
        else state.fogSelection.push(hit.id);
        draw();
        return;
      }
      if (!hit) {
        state.fogSelection = [];
        draw();
        return;
      }
      rememberFog();
      sceneData().fogShapes = sceneData().fogShapes.filter(s => s.id !== hit.id);
      state.fogSelection = (state.fogSelection || []).filter(id => id !== hit.id);
      commitFog('Erase');
      return;
    }
    if (role === 'dm' && (state.tool === 'reveal' || state.tool === 'hide') && state.fogKind === 'box') {
      e.preventDefault();
      const w = pointerWorld(e);
      state.fogStart = w;
      state.drag = { fog: true, sx: e.clientX, sy: e.clientY };
      return;
    }
    if (role === 'dm' && (state.tool === 'reveal' || state.tool === 'hide') && state.fogKind === 'square') {
      e.preventDefault();
      const w = pointerWorld(e);
      const px = state.scene.grid.px;
      state.brushCells = [{ x: Math.floor(w.x / px), y: Math.floor(w.y / px) }];
      state.drag = { square: true };
      draw();
      return;
    }
    if (role === 'dm' && (state.tool === 'reveal' || state.tool === 'hide') && state.fogKind === 'brush') {
      e.preventDefault();
      const w = pointerWorld(e);
      const px = state.scene.grid.px;
      state.brushCells = [{ x: Math.floor(w.x / px), y: Math.floor(w.y / px) }];
      state.drag = { brush: true };
      draw();
      return;
    }
    if (role === 'dm' && (state.tool === 'reveal' || state.tool === 'hide') && state.fogKind === 'poly') {
      e.preventDefault();
      e.stopPropagation();
      if (!state.polyPoints) state.polyPoints = [];
      if (e.button === 2) {
        if (state.polyPoints.length >= 3) commitPoly();
        else { state.polyPoints = []; state.polyHover = null; draw(); }
        return;
      }
      if (e.button !== 0) return;
      const g = gridPoint(pointerWorld(e));
      const pts = state.polyPoints;
      const onFirst = pts.length >= 3 && (sameGrid(g, pts[0]) || screenDistGrid(pts[0], g) <= 12);
      if (onFirst || (pts.length >= 3 && e.detail === 2)) {
        commitPoly();
        return;
      }
      if (pts.length && sameGrid(g, pts[pts.length - 1])) { draw(); return; }
      pts.push(g);
      draw();
      return;
    }
    if (state.tool === 'ping') {
      const w = pointerWorld(e);
      const myToken = state.tokens.find(t => t.ownerUid === uid);
      const color = myToken?.color || '#ff5050';
      const ping = { x: w.x, y: w.y, ts: Date.now(), by: uid, color };
      state.pings.push(ping);
      postPing(ping);
      setTimeout(() => {
        state.pings = state.pings.filter(p => p.ts !== ping.ts);
        draw();
      }, 2500);
      draw();
      return;
    }
    if (state.tool === 'ruler') {
      const w = pointerWorld(e);
      state.ruler = { x1: w.x, y1: w.y, x2: w.x, y2: w.y };
      state.drag = { ruler: true };
      return;
    }
    if (role === 'dm' && state.placeAsset && !state.tool) {
      if (e.button === 2) {
        state.placeAsset = null;
        toast('Place cancelled');
        applyCursor();
        return;
      }
      if (e.button === 0) {
        const wPlace = pointerWorld(e);
        const placePx = (state.scene.grid && state.scene.grid.px) || 70;
        placeAssetAt(state.placeAsset, { x: Math.floor(wPlace.x / placePx), y: Math.floor(wPlace.y / placePx) });
        state.placeAsset = null;
        applyCursor();
        e.preventDefault();
        return;
      }
    }
    const w = pointerWorld(e);
    const hit = hitTest(w.x, w.y);
    if (hit && hit.kind === 'asset' && role === 'player' && !e.shiftKey) {
      if (!tokenSeenBy(hit, sightFor(uid, getPlayerScene()))) { toast("You can't see that."); return; }
      selectToken(hit);
      return;
    }
    if (hit && (hit.kind === 'chest' || hit.lootBoxId) && !e.shiftKey) {
      selectToken(hit);
      return;
    }
    if (hit && state.pendingTarget && role === 'dm') {
      selectToken(hit);
      return;
    }
    if (hit && (canDrag(hit) || (role === 'dm' && hit.locked))) {
      if (e.button === 2 && !state.tool) { cancelMoveGesture(); return; }
      if (hit.locked && role === 'dm') {
        // select locked token so DM can unlock it, but don't start a drag
        state.selectedIds = [hit.id];
        state.selected = hit;
        openDrawer(hit.id);
        draw();
        return;
      }
      if (role === 'dm' && e.ctrlKey) {
        const idx = state.selectedIds.indexOf(hit.id);
        if (idx >= 0) state.selectedIds.splice(idx, 1);
        else state.selectedIds.push(hit.id);
        state.selected = hit;
        draw();
        return;
      } else if (role === 'dm' && state.selectedIds.includes(hit.id)) {
        // already in selection — keep group and drag all
        state.selected = hit;
      } else {
        state.selectedIds = [hit.id];
        state.selected = hit;
      }
      /* During a fight the current combatant walks by click only while Move mode is on.
         Move mode off selects the token and does not drag it (a drag would skip the foot cost).
         Edit tokens (DM only) skips this and falls through to a plain drag: no feet, no click-walk. */
      if (!dmEditing() && fightOn() && activeMover() && activeMover().id === hit.id && moveApi()) {
        state.selectedIds = [hit.id];
        state.selected = hit;
        if (!state.moveMode) {
          if (role === 'dm') openDrawer(hit.id);
          draw();
          return;
        }
        state.drag = { moveAim: true, token: hit, sx: e.clientX, sy: e.clientY };
        if (role === 'dm') openDrawer(hit.id);
        draw();
        return;
      }
      /* token size: ox/oy is the grabbed square, so a 4x4 token grabbed by a corner does not jump */
      const gpx = state.scene.grid.px;
      state.drag = { token: hit, ox: Math.round(w.x / gpx - 0.5), oy: Math.round(w.y / gpx - 0.5), sx: e.clientX, sy: e.clientY, starts: {} };
      state.selectedIds.forEach(id => {
        const t = state.tokens.find(tok => tok.id === id);
        if (t) state.drag.starts[id] = { x: t.pos.x, y: t.pos.y };
      });
      if (role === 'dm') openDrawer(hit.id);
      if (hit.kind === 'asset') showAssetMenu(hit);
    } else if (hit && role === 'player') {
      if (hit.locked) toast('That token is locked');
      else if (canControl(hit) && turnBlocksMove()) toast("It isn't your turn. Your token moves on your turn.");
      else toast('No permission to move that token');
    } else if (tryDoorClick(e, w)) {
      /* N87 door menu. A secret door is not a click target for a player. */
    } else {
      if (e.button === 1 || e.altKey) {
        state.drag = { pan: true, sx: e.clientX, sy: e.clientY, vx: state.view.x, vy: state.view.y };
      } else if (e.button === 2 && !state.tool) {
        cancelMoveGesture();
        return;
      } else if (role === 'dm' && !state.tool) {
        const selPt = localXY(e);
        state.drag = { select: true, sx: selPt.x, sy: selPt.y, cx: e.clientX, cy: e.clientY };
      } else {
        state.drag = { pan: true, sx: e.clientX, sy: e.clientY, vx: state.view.x, vy: state.view.y, clickMove: !state.tool && e.button === 0 };
      }
    }
  }
  e.preventDefault();
}
function onPointerMove(e) {
  if (state.blast) {
    blastPointer(e, 'move');
    return;
  }
  if (state.drag && state.drag.moveAim) {
    noteMoveHover(e);
    return;
  }
  if (!(e.buttons & 1) && !state.drag) noteMoveHover(e);
  const polyLive = role === 'dm' && (state.tool === 'reveal' || state.tool === 'hide') && state.fogKind === 'poly' && state.polyPoints && state.polyPoints.length;
  if (state.drag && (state.drag.brush || state.drag.square) && state.brushCells) {
    const w = pointerWorld(e);
    const px = state.scene.grid.px;
    const cell = { x: Math.floor(w.x / px), y: Math.floor(w.y / px) };
    if (!state.brushCells.some(c => c.x === cell.x && c.y === cell.y)) state.brushCells.push(cell);
  }
  if (polyLive) state.polyHover = pointerWorld(e);
  if (!pointers.has(e.pointerId)) {
    if (polyLive) draw();
    return;
  }
  pointers.set(e.pointerId, localXY(e));
  if (state.tool === 'wall' && state.wallStart) draw();
  if (state.tool === 'room' && state.roomStart) draw();
  if (pointers.size === 1 && state.drag) {
    if (state.drag.pan) {
      e.preventDefault();
      e.stopPropagation();
      const dx = (e.clientX - state.drag.sx) / state.view.zoom;
      const dy = (e.clientY - state.drag.sy) / state.view.zoom;
      state.view.x = state.drag.vx - dx;
      state.view.y = state.drag.vy - dy;
    } else if (state.drag.ruler && state.ruler) {
      const w = pointerWorld(e);
      state.ruler.x2 = w.x;
      state.ruler.y2 = w.y;
    } else if (state.drag.select) {
      // marquee in progress — just redraw
    } else if (state.drag.token) {
      const w = pointerWorld(e);
      const px = state.scene.grid.px;
      let nx = Math.round(w.x / px - 0.5);
      let ny = Math.round(w.y / px - 0.5);
      const dx = nx - state.drag.ox;
      const dy = ny - state.drag.oy;
      const ids = state.selectedIds.length ? state.selectedIds : [state.drag.token.id];
      state.drag.blocked = false;
      state.drag.walled = false;
      ids.forEach(id => {
        const t = state.tokens.find(tok => tok.id === id);
        if (!t || !onViewedScene(t)) return;
        const start = state.drag.starts ? state.drag.starts[id] : { x: t.pos.x, y: t.pos.y };
        if (!state.drag.starts) state.drag.starts = {};
        if (!state.drag.starts[id]) state.drag.starts[id] = { x: t.pos.x - dx, y: t.pos.y - dy };
        const tsz = tokSquares(t.size);
        const snap = clampFootprint(state.drag.starts[id].x + dx, state.drag.starts[id].y + dy, tsz);
        let newX = snap.x;
        let newY = snap.y;
        if (t.spellPiece && window.SSDNSSpellTokens) {
          const turn = zoneTurnKey();
          const home0 = state.drag.starts[id];
          if (turn) {
            if (!t.pieceHome || t.pieceHome.turn !== turn) t.pieceHome = { turn: turn, x: home0.x, y: home0.y };
          }
          const home = turn && t.pieceHome ? t.pieceHome : home0;
          const capped = window.SSDNSSpellTokens.clampStep(home, { x: newX, y: newY }, t.moveFeet);
          newX = capped.x;
          newY = capped.y;
        }
        const allowStack = dmEditing() || (role === 'dm' && e.shiftKey);
        const half = tsz / 2;
        const centerBlocked = crossesWall(t.pos.x + half, t.pos.y + half, newX + half, newY + half);
        /* N64: a 2×2 centre sits on a grid point and clips wall corners it does not cross. */
        const wallBlocked = !dmEditing() && (tsz > 1 ? largeSlideBlocked({ x: t.pos.x, y: t.pos.y }, { x: newX, y: newY }, tsz) : centerBlocked);
        if (!allowStack && areaTaken(newX, newY, tsz, state.drag.starts)) {
          state.drag.blocked = true;
        } else if (!wallBlocked) {
          if (state.offline) {
            state.drag.ghost = { x: newX, y: newY };
            const existing = state.pendingMoves.find(m => m.id === t.id);
            const origin = state.drag.starts[t.id] || { x: t.pos.x, y: t.pos.y };
            const path = state.drag.pins ? state.drag.pins.concat([{ x: newX, y: newY }]) : [{ x: origin.x, y: origin.y }, { x: newX, y: newY }];
            if (existing) { existing.x = newX; existing.y = newY; existing.path = path; }
            else state.pendingMoves.push({ id: t.id, x: newX, y: newY, fromX: origin.x, fromY: origin.y, path });
          } else {
            const origin = state.drag.starts && state.drag.starts[id];
            const prevX = t.pos.x;
            const prevY = t.pos.y;
            t.pos.x = newX;
            t.pos.y = newY;
            if (origin) markRangeMoved(t.id, origin, { x: newX, y: newY });
            if (shared.tokens[t.id]) shared.tokens[t.id].pos = { ...t.pos, by: uid, ts: Date.now() };
            if (prevX !== newX || prevY !== newY) state.drag.rangeMoved = true;
          }
        } else if (newX !== t.pos.x || newY !== t.pos.y) {
          state.drag.walled = true;
        }
      });
      if (!state.drag.recorded) {
        state.undoStack.push({ type: 'move', ids: ids.slice(), from: { ...state.drag.starts } });
        state.drag.recorded = true;
        state.redoStack = [];
      }
      if (state.drag.rangeMoved) {
        state.drag.rangeMoved = false;
        refreshRangeSurfaces();
        streamDrag();
      }
    }
    draw();
  } else if (polyLive) draw();
}
function onPointerUp(e) {
  /* A real click wobbles. 8px treated those as pans, so the path preview stuck and the token never walked.
     Half a square still counts as a click. A longer drag still pans (or marquees, for the DM). */
  const CLICK_SLOP = 40;
  if (state.drag && state.drag.moveAim && e.button === 0) {
    tryClickMove(cellUnderEvent(e));
    state.drag = { moveAimDone: true };
  } else if (state.drag && state.drag.clickMove && e.button === 0 && !state.tool) {
    const dx = e.clientX - state.drag.sx, dy = e.clientY - state.drag.sy;
    if (Math.hypot(dx, dy) < CLICK_SLOP) {
      if (state.drag.vx != null) { state.view.x = state.drag.vx; state.view.y = state.drag.vy; }
      tryClickMove(cellUnderEvent(e));
    }
  } else if (state.drag && state.drag.select && state.drag.cx != null && e.button === 0 && !state.tool) {
    const dx = e.clientX - state.drag.cx, dy = e.clientY - state.drag.cy;
    if (Math.hypot(dx, dy) < CLICK_SLOP) {
      tryClickMove(cellUnderEvent(e));
      state.drag.select = false;
    }
  }
  const wasTokenDrag = !!(state.drag && state.drag.token && !state.drag.moveAimDone);
  if (wasTokenDrag) clearStreamTimer();
  if (state.drag && state.drag.walled) toastDmEditHint();
  if (state.drag && state.drag.token && state.drag.blocked && !(role === 'dm' && e.shiftKey) && !dmEditing()) {
    const starts = state.drag.starts || {};
    Object.keys(starts).forEach(id => {
      const t = state.tokens.find(tok => tok.id === id);
      if (!t || !starts[id]) return;
      t.pos.x = starts[id].x;
      t.pos.y = starts[id].y;
      if (shared.tokens[t.id]) shared.tokens[t.id].pos = Object.assign({}, t.pos, { by: uid, ts: Date.now() });
    });
    state.drag.pins = null;
    toast('That square is taken');
  }
  if (state.drag && state.drag.token && !state.offline && state.drag.pins && state.drag.pins.length) {
    const t = state.drag.token;
    const pts = state.drag.pins.concat([{ x: t.pos.x, y: t.pos.y }]);
    startSlide(t.id, pts);
    postSlide(t.id, pts);
  } else if (state.drag && state.drag.token && role === 'player' && !state.offline) {
    publishPlayerMove(state.drag.token);
  }
  if (state.drag && state.drag.token && role === 'dm' && !state.offline) {
    const ids = state.selectedIds.length ? state.selectedIds : [state.drag.token.id];
    ids.forEach(id => {
      const piece = state.tokens.find(tok => tok && tok.id === id);
      if (piece && piece.spellPiece) syncPieceOrigin(piece);
      saveToken(id);
    });
  }
  if (state.drag && state.drag.token && state.drag.recorded && state.undoStack.length) {
    const last = state.undoStack[state.undoStack.length - 1];
    if (last.type === 'move') {
      last.to = {};
      Object.keys(last.from).forEach(id => {
        const t = state.tokens.find(tok => tok.id === id);
        if (t) last.to[id] = { x: t.pos.x, y: t.pos.y };
      });
    }
  }
  if (state.drag && state.drag.wall && state.wallStart) {
    const w = pointerWorld(e);
    const px = state.scene.grid.px;
    const x2 = Math.round(w.x / px), y2 = Math.round(w.y / px);
    if (Math.hypot(x2 - state.wallStart.x, y2 - state.wallStart.y) > 0.3) {
      pushWall(state.wallStart.x, state.wallStart.y, x2, y2);
      saveScene();
      toast(isDiagonal(state.wallStart.x, state.wallStart.y, x2, y2) ? 'Diagonal wall' : 'Wall created');
    }
    state.wallStart = null;
  }
  if (state.drag && state.drag.room && state.roomStart) {
    const w = pointerWorld(e);
    const px = state.scene.grid.px;
    let gx = w.x / px, gy = w.y / px;
    if (state.snap) { gx = Math.round(gx); gy = Math.round(gy); }
    const x1 = Math.min(state.roomStart.x, gx), y1 = Math.min(state.roomStart.y, gy);
    const x2 = Math.max(state.roomStart.x, gx), y2 = Math.max(state.roomStart.y, gy);
    if (x2 - x1 >= 1 && y2 - y1 >= 1) {
      sceneData().walls.push(
        { x1, y1, x2, y2: y1 },
        { x1: x2, y1, x2, y2 },
        { x1: x2, y1: y2, x2: x1, y2 },
        { x1, y1: y2, x2: x1, y2: y1 }
      );
      collapsePlainWalls();
      saveScene();
      toast('Room created');
    }
    state.roomStart = null;
  }
  if (state.drag && state.drag.select) {
    const pts = [...pointers.values()];
    if (pts.length) {
      const x1 = Math.min(state.drag.sx, pts[0].x);
      const y1 = Math.min(state.drag.sy, pts[0].y);
      const x2 = Math.max(state.drag.sx, pts[0].x);
      const y2 = Math.max(state.drag.sy, pts[0].y);
      const a = screenToWorld(x1, y1);
      const b = screenToWorld(x2, y2);
      const px = state.scene.grid.px;
      state.selectedIds = state.tokens.filter(t => {
        if (!t || !t.pos || !onViewedScene(t)) return false;
        const cx = (t.pos.x + 0.5) * px;
        const cy = (t.pos.y + 0.5) * px;
        return cx >= Math.min(a.x, b.x) && cx <= Math.max(a.x, b.x) &&
               cy >= Math.min(a.y, b.y) && cy <= Math.max(a.y, b.y);
      }).map(t => t.id);
      if (state.selectedIds.length) state.selected = state.tokens.find(t => t.id === state.selectedIds[0]);
    }
  }
  if (state.drag && state.drag.fog && state.fogStart) {
    const w = pointerWorld(e);
    const px = state.scene.grid.px;
    const x1 = Math.min(state.fogStart.x, w.x);
    const y1 = Math.min(state.fogStart.y, w.y);
    const x2 = Math.max(state.fogStart.x, w.x);
    const y2 = Math.max(state.fogStart.y, w.y);
    addFogShape({
      op: fogOp(),
      kind: 'box',
      x: Math.floor(x1 / px),
      y: Math.floor(y1 / px),
      w: Math.max(1, Math.ceil((x2 - x1) / px)),
      h: Math.max(1, Math.ceil((y2 - y1) / px))
    });
  }
  if (state.drag && state.drag.square && state.brushCells && state.brushCells.length) {
    addFogSquares(state.brushCells);
    state.brushCells = null;
  }
  if (state.drag && state.drag.brush && state.brushCells && state.brushCells.length) {
    addFogShape({ op: fogOp(), kind: 'brush', cells: state.brushCells.map(c => ({ x: c.x, y: c.y })) });
    state.brushCells = null;
  }
  if (wasTokenDrag && state.drag && state.drag.starts) {
    Object.keys(state.drag.starts).forEach(id => {
      const t = state.tokens.find(tok => tok && tok.id === id);
      const origin = state.drag.starts[id];
      if (!t || !origin || !t.pos) return;
      noteZoneCross(t, origin, { x: t.pos.x, y: t.pos.y });
    });
  }
  pointers.delete(e.pointerId);
  if (pointers.size === 0) state.drag = null;
  state.fogStart = null;
  if (wasTokenDrag) refreshRangeSurfaces();
  draw();
}
function raycastVisible(cx, cy, radius) {
  const points = [];
  const steps = 90;
  const px = state.scene.grid.px;
  for (let i = 0; i < steps; i++) {
    const ang = (i / steps) * Math.PI * 2;
    const ex = cx + Math.cos(ang) * radius;
    const ey = cy + Math.sin(ang) * radius;
    let hitX = ex, hitY = ey, best = 1;
    if (sceneData().walls.length) {
      for (const w of sceneData().walls) {
        const wx1 = w.x1 * px, wy1 = w.y1 * px;
        const wx2 = w.x2 * px, wy2 = w.y2 * px;
        if (w.open || (w.window && !w.shut)) continue;
        if (w.ajar) continue; /* N87 peek: sight passes. Movement still requires open. */
        const d = (ex - cx) * (wy2 - wy1) - (ey - cy) * (wx2 - wx1);
        if (Math.abs(d) < 0.0001) continue;
        const t = ((wx1 - cx) * (wy2 - wy1) - (wy1 - cy) * (wx2 - wx1)) / d;
        const u = ((wx1 - cx) * (ey - cy) - (wy1 - cy) * (ex - cx)) / d;
        if (t > 0.001 && t < best && u >= 0 && u <= 1) {
          best = t;
          hitX = cx + t * (ex - cx);
          hitY = cy + t * (ey - cy);
        }
      }
    }
    points.push(worldToScreen(hitX, hitY));
  }
  return points;
}
function cleanLightRows(list, doused) {
  return (Array.isArray(list) ? list : []).filter(l => l && (l.name || l.bright || l.dim)).map(l => ({
    id: l.id || '',
    name: l.name || 'Light',
    bright: Number(l.bright) || 0,
    dim: Number(l.dim) || 0,
    cone: !!l.cone,
    out: !!(doused || l.out)
  }));
}
function profileForOwner(ownerUid) {
  if (!ownerUid) return null;
  const p = partyList().find(x => x && (x.uid || x.id) === ownerUid);
  return p && p.lightProfile ? p.lightProfile : null;
}
/* Stamp lights onto a token. dmDoused forces every light out. A DM hand darkvision or Give torch
   wins over the sheet profile for that field. source 'snap' is the DM write from the player snapshot. */
function applyLightsToToken(token, profile, source) {
  if (!token || role !== 'dm') return false;
  const doused = !!token.dmDoused;
  const fromSheet = profile && Array.isArray(profile.lights);
  const base = fromSheet ? profile.lights : (source === 'hand' || source === 'patch' ? (token.lights || []) : []);
  let lights = cleanLightRows(base, doused).filter(l => l.id !== 'dm-torch');
  if (token.dmTorch) lights.push({ id: 'dm-torch', name: 'Torch', bright: 20, dim: 20, cone: false, out: !!doused });
  let dv;
  if (token.dmDarkvision != null && token.dmDarkvision !== '') dv = Number(token.dmDarkvision) || 0;
  else if (profile && profile.darkvision != null) dv = Number(profile.darkvision) || 0;
  else dv = Number(token.darkvision) || 0;
  const sk = profile && profile.skulker != null ? !!profile.skulker : !!token.skulker;
  const devil = profile && profile.devilsSight != null ? !!profile.devilsSight : !!token.devilsSight;
  const sig = JSON.stringify({ lights: lights, dv: dv, sk: sk, devil: devil, doused: doused, torch: !!token.dmTorch, hand: token.dmDarkvision != null ? token.dmDarkvision : null });
  if (token._lightSig === sig) return false;
  token._lightSig = sig;
  token.lights = lights;
  token.darkvision = dv;
  token.skulker = sk;
  token.devilsSight = devil;
  if (doused) token.torch = false;
  else if (token.dmTorch) token.torch = true;
  if (source === 'snap') token._lightFromSnap = true;
  const copy = shared.tokens[token.id] || (shared.tokens[token.id] = { id: token.id });
  copy.lights = lights.map(l => Object.assign({}, l));
  copy.darkvision = dv;
  copy.skulker = sk;
  copy.devilsSight = devil;
  copy.dmDoused = doused;
  copy.dmTorch = !!token.dmTorch;
  if (token.dmDarkvision != null && token.dmDarkvision !== '') copy.dmDarkvision = Number(token.dmDarkvision) || 0;
  else delete copy.dmDarkvision;
  if (doused) copy.torch = false;
  const live = state.tokens.find(tok => tok && tok.id === token.id);
  if (live && live !== token) {
    live.lights = lights.map(l => Object.assign({}, l));
    live.darkvision = dv;
    live.skulker = sk;
    live.devilsSight = devil;
    live.dmDoused = doused;
    live.dmTorch = !!token.dmTorch;
    live._lightSig = sig;
    live._lightFromSnap = token._lightFromSnap;
    if (token.dmDarkvision != null && token.dmDarkvision !== '') live.dmDarkvision = Number(token.dmDarkvision) || 0;
    else delete live.dmDarkvision;
  }
  saveToken(token.id);
  return true;
}
/* DM map: each party snapshot's lightProfile lands on that player's canonical token.
   Does not dedupe and does not move tokens. The player's own Map client stays a second path. */
function syncSnapshotLights() {
  if (role !== 'dm') return false;
  let changed = false;
  partyList().forEach(p => {
    const who = p && (p.uid || p.id);
    if (!who || !p.lightProfile) return;
    const want = playerTokenId(who);
    const token = state.tokens.find(t => t && t.id === want) || state.tokens.find(t => t && t.ownerUid === who);
    if (!token) return;
    if (applyLightsToToken(token, p.lightProfile, 'snap')) changed = true;
  });
  if (changed && state.drawerOpen) {
    try { renderDrawer(); } catch (e) {}
  }
  return changed;
}
function mySceneToken() {
  if (role !== 'player' || !uid) return null;
  const scene = (typeof getPlayerScene === 'function' && getPlayerScene()) || 'scn_dustyspur01';
  return state.tokens.find(t => t && t.ownerUid === uid && !t.hidden && (t.sceneId || 'scn_dustyspur01') === scene) || null;
}
function paintAddMine() {
  const btn = q('addMineBtn');
  if (!btn || role !== 'player') return;
  btn.hidden = !!mySceneToken();
}
function syncOwnerLights() {
  if (role !== 'player' || typeof host.lightsProfile !== 'function') return;
  let profile = null;
  try { profile = host.lightsProfile(); } catch (e) { return; }
  if (!profile) return;
  /* Prefer the canonical id so a link swap doesn't keep patching a removed token. */
  const want = playerTokenId(uid);
  const me = state.tokens.find(t => t && t.id === want) || state.tokens.find(t => t && t.ownerUid === uid);
  if (!me) return;
  const lights = (profile.lights || []).map(l => Object.assign({}, l, { out: !!(me.dmDoused || l.out) }));
  const devil = !!profile.devilsSight;
  const sig = JSON.stringify({ lights: lights, darkvision: Number(profile.darkvision) || 0, skulker: !!profile.skulker, devil: devil });
  if (me._lightSig !== sig) {
    me._lightSig = sig;
    me.lights = lights;
    me.darkvision = Number(profile.darkvision) || 0;
    me.skulker = !!profile.skulker;
    me.devilsSight = devil;
    const copy = shared.tokens[me.id];
    if (copy) { copy.lights = lights.map(l => Object.assign({}, l)); copy.darkvision = me.darkvision; copy.skulker = me.skulker; copy.devilsSight = devil; }
    publishPlayerPatch(me, { lights: lights, darkvision: me.darkvision, skulker: me.skulker, devilsSight: devil });
  }
  stampDispelledLights();
}
function lightStatusText(token) {
  const owner = token && token.ownerUid;
  const party = owner ? partyList().find(p => p && (p.uid || p.id) === owner) : null;
  if (!owner || !party) return { warn: true, text: '⚠ Not linked to a sheet' };
  const name = party.name || party.label || 'sheet';
  const bits = [];
  if (token.dmDoused) bits.push('doused');
  else (token.lights || []).forEach(l => {
    if (!l || l.out) return;
    bits.push(String(l.name || 'light').toLowerCase() + ' ' + (Number(l.bright) || 0) + '/' + (Number(l.dim) || 0));
  });
  const dv = Number(token.darkvision) || 0;
  if (dv) bits.push('darkvision ' + dv);
  const detail = bits.length ? ' (' + bits.join(', ') + ')' : '';
  return { warn: false, text: 'Linked: ' + name + ' · lights synced ✓' + detail };
}
function lightDrawerHtml(token) {
  if (role !== 'dm' || !token) return '';
  const status = lightStatusText(token);
  const dvShown = token.dmDarkvision != null && token.dmDarkvision !== ''
    ? (Number(token.dmDarkvision) || 0)
    : (Number(token.darkvision) || 0);
  return '<p class="ssm-linkstatus' + (status.warn ? ' is-warn' : '') + '" data-act="linkStatus">' + esc(status.text) + '</p>' +
    '<div class="ssm-lighthand">' +
    '<label class="ssm-act">Darkvision <input data-act="dmDarkvision" type="number" min="0" step="5" value="' + esc(dvShown) + '" aria-label="Darkvision feet"> ft</label>' +
    '<label class="ssm-act"><input type="checkbox" data-act="dmTorch"' + (token.dmTorch ? ' checked' : '') + '> Give torch</label>' +
    '<button type="button" data-act="nudgeOpen" class="ssm-nudge" title="Move this token to the nearest open square on this floor">Nudge to open square</button>' +
    '</div>';
}
function bindLightHands(rootEl, tokenId) {
  if (!rootEl || role !== 'dm') return;
  const tok = () => state.tokens.find(t => t && t.id === tokenId) || null;
  const dv = rootEl.querySelector('[data-act="dmDarkvision"]');
  if (dv) dv.addEventListener('change', () => {
    const t = tok();
    if (!t) return;
    const raw = String(dv.value == null ? '' : dv.value).trim();
    if (raw === '') delete t.dmDarkvision;
    else t.dmDarkvision = Math.max(0, parseInt(raw, 10) || 0);
    t._lightSig = '';
    applyLightsToToken(t, profileForOwner(t.ownerUid), 'hand');
    toast('Darkvision set');
    renderDrawer();
    draw();
  });
  const nudge = rootEl.querySelector('[data-act="nudgeOpen"]');
  if (nudge) nudge.addEventListener('click', () => {
    const t = tok();
    if (t) nudgeToOpen(t);
  });
  const torch = rootEl.querySelector('[data-act="dmTorch"]');
  if (torch) torch.addEventListener('change', () => {
    const t = tok();
    if (!t) return;
    t.dmTorch = !!torch.checked;
    t._lightSig = '';
    applyLightsToToken(t, profileForOwner(t.ownerUid), 'hand');
    toast(t.dmTorch ? 'Torch given' : 'Torch taken back');
    renderDrawer();
    draw();
  });
}
function strokeRing(wx, wy, radiusWorld, stroke, fill) {
  const c = worldToScreen(wx, wy);
  const z = state.view.zoom || 1;
  ctx.save();
  ctx.beginPath();
  ctx.arc(c.x, c.y, Math.max(1, radiusWorld * z), 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 2;
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}
function strokeCone(wx, wy, radiusWorld, facing, stroke) {
  const c = worldToScreen(wx, wy);
  const z = state.view.zoom || 1;
  const spread = Math.atan(0.5);
  const r = Math.max(1, radiusWorld * z);
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(c.x, c.y);
  ctx.arc(c.x, c.y, r, facing - spread, facing + spread);
  ctx.closePath();
  ctx.globalAlpha = 0.28;
  ctx.fillStyle = stroke;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}
function paintLightRings(sight, px) {
  const readout = q('playerLights');
  if (readout && role === 'player') {
    const mine = state.tokens.find(t => t && t.ownerUid === uid);
    const rows = mine ? tokenLightList(mine) : [];
    const dv = mine && Number(mine.darkvision) || 0;
    readout.textContent = (rows.length ? rows.map(l => (l.name || 'Light') + ' ' + (l.bright || 0) + '/' + (l.dim || 0)).join(' · ') : 'No light in hand') + (dv ? ' · darkvision ' + dv + ' ft' : '');
  }
  /* Measurement strokes are a DM test overlay. Players never see them, even if the flag is on.
     Lighting wash, fog punches, torch and darkvision sight, and the player lights readout stay. */
  if (role !== 'dm' || !state.showLightRings) return;
  const lights = (sight && sight.lights) || [];
  lights.forEach(ls => {
    const wx = ls.x * px, wy = ls.y * px;
    const dimR = ls.radius * px;
    const brightR = (Number(ls.bright) || 0) / 5 * px;
    if (ls.cone) {
      strokeCone(wx, wy, dimR, ls.facing || 0, 'rgba(160,190,255,0.95)');
      if (brightR > 0) strokeCone(wx, wy, brightR, ls.facing || 0, 'rgba(255,206,80,0.98)');
      return;
    }
    if (dimR > 0) strokeRing(wx, wy, dimR, 'rgba(150,180,255,0.9)', 'rgba(120,150,220,0.10)');
    if (brightR > 0) strokeRing(wx, wy, brightR, 'rgba(255,206,80,0.98)', 'rgba(255,196,60,0.16)');
  });
  (sight && sight.bubbles || []).forEach(b => {
    if (!b.darkvision) return;
    strokeRing(b.x * px, b.y * px, b.radius * px, 'rgba(190,190,200,0.8)', 'rgba(40,40,48,0.05)');
  });
}
function drawVisible(cx, cy, radius, cone) {
  const pts = raycastVisible(cx, cy, radius);
  if (!pts.length) return;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.clip();
  /* A bullseye lantern is a cone. The circle punch would light behind the holder. */
  if (cone && cone.cone) {
    const c = worldToScreen(cx, cy);
    const z = state.view.zoom || 1;
    const spread = Math.atan(0.5);
    const face = Number(cone.facing) || 0;
    ctx.beginPath();
    ctx.moveTo(c.x, c.y);
    ctx.arc(c.x, c.y, Math.max(1, radius * z), face - spread, face + spread);
    ctx.closePath();
    ctx.clip();
  }
  const topLeft = worldToScreen(0, 0);
  const { cols, rows, px } = state.scene.grid;
  ctx.drawImage(state.scene._img, topLeft.x, topLeft.y, cols * px * state.view.zoom, rows * px * state.view.zoom);
  ctx.restore();
}
/* Local copy of SSDNSMapMove.segmentBlocks so a map that loads without that file still unsticks.
   Ignore a hit at the start (t < 1e-6): a token whose centre sits on the wall can step off.
   Open doors (w.open) are not walls. Wall records are unchanged. */
function segmentBlocks(x1, y1, x2, y2, w) {
  const M = moveApi();
  if (M && M.segmentBlocks) return M.segmentBlocks(x1, y1, x2, y2, w);
  if (!w || w.open) return false;
  const d = (x2 - x1) * (w.y2 - w.y1) - (y2 - y1) * (w.x2 - w.x1);
  if (Math.abs(d) < 0.0001) return false;
  const t = ((w.x1 - x1) * (w.y2 - w.y1) - (w.y1 - y1) * (w.x2 - w.x1)) / d;
  const u = ((w.x1 - x1) * (y2 - y1) - (w.y1 - y1) * (x2 - x1)) / d;
  return t >= 1e-6 && t <= 1 && u >= 0 && u <= 1;
}
function crossesWall(x1, y1, x2, y2) {
  const walls = sceneData().walls;
  if (!walls.length) return false;
  for (const w of walls) {
    if (w.open) continue;
    if (segmentBlocks(x1, y1, x2, y2, w)) return true;
  }
  return false;
}
/* N64: drag a Large (or bigger) footprint one square at a time across the edges it actually crosses. */
function largeSlideBlocked(from, to, size) {
  const M = moveApi();
  if (M && M.slideBlocked) return !!M.slideBlocked(from, to, size, (a, b) => crossesWall(a.x, a.y, b.x, b.y));
  const half = (size || 1) / 2;
  return crossesWall((from.x || 0) + half, (from.y || 0) + half, (to.x || 0) + half, (to.y || 0) + half);
}
function tokenCombatant(tokenId) {
  const token = state.tokens.find(t => t.id === tokenId);
  return (token && (token.combatantId || token.sheetId)) || tokenId;
}
function cellTaken(x, y, ignore) {
  const skip = ignore || {};
  return state.tokens.some(t => {
    if (!t || !t.pos || skip[t.id]) return false;
    if (role !== 'dm' && t.hidden) return false;
    if (!onViewedScene(t)) return false;
    if (window.SSDNSAssetLibrary && window.SSDNSAssetLibrary.gatePassable && window.SSDNSAssetLibrary.gatePassable(t)) return false;
    const size = t.size || 1;
    return x >= t.pos.x && x < t.pos.x + size && y >= t.pos.y && y < t.pos.y + size;
  });
}
/* Token size (2026-10-20): footprint helpers. A token covers pos..pos+size squares on both axes. */
function tokSquares(size) {
  const T = window.SSDNSTokenSize;
  if (T) return T.squares(size);
  const n = Math.floor(Number(size));
  return n >= 1 && n <= 4 ? n : 1;
}
function clampFootprint(x, y, size, grid) {
  const g = grid || (state.scene && state.scene.grid) || { cols: 30, rows: 20 };
  const s = tokSquares(size);
  return {
    x: Math.max(0, Math.min((g.cols || 30) - s, x)),
    y: Math.max(0, Math.min((g.rows || 20) - s, y))
  };
}
/** Tokens that block movement / placement for this viewer (players never collide with what they cannot see). */
function blockingTokens(ignore) {
  const skip = ignore || {};
  return state.tokens.filter(t => t && t.pos && !skip[t.id] && !(role !== 'dm' && t.hidden) && !(window.SSDNSAssetLibrary && window.SSDNSAssetLibrary.gatePassable && window.SSDNSAssetLibrary.gatePassable(t)));
}
function areaTaken(x, y, size, ignore) {
  const s = tokSquares(size);
  if (s === 1) return cellTaken(x, y, ignore);
  const T = window.SSDNSTokenSize;
  if (T) return T.areaTaken(x, y, s, blockingTokens(ignore).filter(onViewedScene));
  for (let yy = y; yy < y + s; yy++) for (let xx = x; xx < x + s; xx++) if (cellTaken(xx, yy, ignore)) return true;
  return false;
}
/** Auto-placement: nearest spot to the view centre where the whole footprint fits and no name label
    (or DM HP bar) lands on another token or label. Falls back to footprint-only when the map is full. */
function nextFreeSpot(size, label, preferred) {
  if (preferred) return preferred; /* bestiary drop: the square the DM picked (already checked free) */
  if (!state.scene) return null;
  const T = window.SSDNSTokenSize;
  const s = tokSquares(size);
  if (!T) return s === 1 ? nextFreeCell() : null;
  const grid = state.scene.grid || { cols: 30, rows: 20 };
  const others = blockingTokens().filter(onViewedScene);
  /* labels are judged at the DM's current zoom (or zoom 1 if closer): names never draw under 11px */
  const cellPx = (grid.px || 70) * Math.min(1, (state.view && state.view.zoom) || 1);
  return T.findSpot(viewCenterCell(), s, label, others, grid, cellPx);
}
function spotNear(cell, size, label) {
  if (!state.scene) return null;
  const T = window.SSDNSTokenSize;
  const grid = state.scene.grid || { cols: 30, rows: 20 };
  const s = tokSquares(size);
  const others = blockingTokens().filter(onViewedScene);
  const cx = Math.max(0, Math.min((grid.cols || 30) - s, cell.x));
  const cy = Math.max(0, Math.min((grid.rows || 20) - s, cell.y));
  if (T && T.findSpot) {
    const cellPx = (grid.px || 70) * Math.min(1, (state.view && state.view.zoom) || 1);
    return T.findSpot({ x: cx, y: cy }, s, label, others, grid, cellPx);
  }
  return s === 1 && !cellTaken(cx, cy) ? { x: cx, y: cy } : nextFreeCell();
}
/* DM drawer: slide a token off a wall or a crowded square onto the nearest open cell on this floor.
   spotNear already treats this token as occupying its own cell, so the result is a different square. */
function nudgeToOpen(token) {
  if (role !== 'dm' || !token || !token.pos || !state.scene) return;
  if (!onViewedScene(token)) {
    toast('That token is on ' + floorName(token.sceneId));
    return;
  }
  const from = { x: token.pos.x, y: token.pos.y };
  const spot = spotNear(from, token.size || 1, token.label || token.name || '');
  if (!spot) { toast('No open square'); return; }
  if (spot.x === from.x && spot.y === from.y) { toast('Already on an open square'); return; }
  const to = { x: spot.x, y: spot.y };
  state.undoStack.push({ type: 'move', ids: [token.id], from: { [token.id]: from }, to: { [token.id]: to } });
  state.redoStack = [];
  token.pos.x = to.x;
  token.pos.y = to.y;
  if (shared.tokens[token.id]) shared.tokens[token.id].pos = { x: to.x, y: to.y, by: uid, ts: Date.now() };
  saveToken(token.id);
  state.moveReachKey = '';
  toast('Nudged to an open square');
  draw();
}
function nextFreeCell() {
  if (!state.scene) return null;
  const grid = state.scene.grid || { cols: 30, rows: 20 };
  const cols = grid.cols || 30;
  const rows = grid.rows || 20;
  const start = viewCenterCell();
  const free = (x, y) => x >= 0 && y >= 0 && x < cols && y < rows && !cellTaken(x, y);
  if (free(start.x, start.y)) return { x: start.x, y: start.y };
  const max = Math.max(cols, rows);
  for (let r = 1; r < max; r++) {
    for (let y = start.y - r; y <= start.y + r; y++) {
      for (let x = start.x - r; x <= start.x + r; x++) {
        if (Math.max(Math.abs(x - start.x), Math.abs(y - start.y)) !== r) continue;
        if (free(x, y)) return { x: x, y: y };
      }
    }
  }
  return null;
}
/* 0.3.59: a linked (enemy / NPC) token is one per combatant. Player tokens are keyed by ownerUid instead. */
function linkedKind(t) { return !!(t && t.combatantId && !t.ownerUid && t.kind !== 'player'); }
function tokenForCombatant(cid) {
  if (!cid) return null;
  const live = state.tokens.find(t => linkedKind(t) && t.combatantId === cid);
  if (live) return live;
  const id = Object.keys(shared.tokens || {}).find(k => linkedKind(shared.tokens[k]) && shared.tokens[k].combatantId === cid);
  if (!id) return null;
  const copy = JSON.parse(JSON.stringify(shared.tokens[id]));
  copy.id = copy.id || id;
  state.tokens.push(copy);
  return copy;
}
function linkedGroups() {
  const by = {};
  const seen = {};
  const add = (t, id) => {
    if (!linkedKind(t) || seen[id]) return;
    seen[id] = 1;
    (by[t.combatantId] = by[t.combatantId] || []).push(id);
  };
  state.tokens.forEach(t => t && add(t, t.id));
  Object.keys(shared.tokens || {}).forEach(id => add(shared.tokens[id], id));
  return by;
}
/** Extra copies of one combatant's token. keep maps combatantId -> the token id to keep. */
function duplicateLinkedIds(keep) {
  keep = keep || {};
  const groups = linkedGroups();
  const out = [];
  Object.keys(groups).forEach(cid => {
    const ids = groups[cid];
    if (ids.length < 2) return;
    const want = keep[cid] && ids.indexOf(keep[cid]) >= 0 ? keep[cid] : ids[ids.length - 1];
    ids.forEach(id => { if (id !== want) out.push(id); });
  });
  return out;
}
function dedupeLinkedTokens(keep) {
  if (role !== 'dm') return 0;
  const extra = duplicateLinkedIds(keep);
  if (extra.length) removeMapTokens(extra, { silent: true });
  return extra.length;
}
/** Duplicates plus linked tokens whose combatant is no longer in the fight (liveIds: combatant ids). */
function staleTokenIds(liveIds, keep) {
  const out = duplicateLinkedIds(keep);
  if (Array.isArray(liveIds)) {
    const live = {};
    liveIds.forEach(id => { live[id] = 1; });
    const groups = linkedGroups();
    Object.keys(groups).forEach(cid => {
      if (live[cid]) return;
      groups[cid].forEach(id => { if (out.indexOf(id) < 0) out.push(id); });
    });
  }
  return out;
}
function clearStaleTokens(liveIds, keep) {
  if (role !== 'dm') return 0;
  const ids = staleTokenIds(liveIds, keep);
  if (ids.length) removeMapTokens(ids, { silent: true });
  requestDraw();
  return ids.length;
}
function fightKeepMap() {
  try {
    const f = window.SSDNSMapFight;
    return f && typeof f.linkedTokenIds === 'function' ? (f.linkedTokenIds() || {}) : {};
  } catch (e) { return {}; }
}
function placeLinkedToken(spec) {
  if (role !== 'dm' || !state.scene) return null;
  spec = spec || {};
  /* 0.3.59: adopt this combatant's token if it already exists, instead of stacking a copy */
  const had = spec.combatantId ? tokenForCombatant(spec.combatantId) : null;
  if (had) return had;
  const label = String(spec.label || spec.name || '').slice(0, 16);
  /* map bestiary: a wanted square (click / drop) is used, or the nearest open spot for the creature's footprint */
  const want = spec.at && isFinite(spec.at.x) && isFinite(spec.at.y) ? { x: Math.floor(spec.at.x), y: Math.floor(spec.at.y) } : null;
  const spot = nextFreeSpot(spec.size, label, want ? spotNear(want, spec.size, label) : null);
  if (!spot) { toast('No open square'); return null; }
  const clean = Object.assign({}, spec);
  delete clean.at;
  return makeToken(Object.assign(clean, { pos: spot, kind: spec.kind || 'npc' }));
}
function hasToken(id) {
  return !!(id && state.tokens.some(t => t && t.id === id));
}
function tokenForPlayer(pid) {
  if (!pid) return null;
  const want = playerTokenId(pid);
  const hits = state.tokens.filter(t => t && (t.id === want || t.ownerUid === pid || t.combatantId === pid || t.sheetId === pid));
  return hits.find(t => t.id === want) || hits[0] || null;
}
function releaseToken(id) {
  const t = state.tokens.find(tok => tok && tok.id === id);
  if (!t) return;
  delete t.combatantId;
  const copy = shared.tokens[id];
  if (copy) delete copy.combatantId;
  saveToken(id);
  if (state.drawerOpen && state.drawerTokenId === id) renderDrawer();
}
function removeMapTokens(ids, opts) {
  opts = opts || {};
  const list = (ids || []).filter(Boolean);
  if (!list.length) return;
  const goneInfo = list.map(id => {
    const gone = (shared.tokens && shared.tokens[id]) || state.tokens.find(t => t && t.id === id) || {};
    return { id: id, ownerUid: gone.ownerUid || '', combatantId: gone.combatantId || '' };
  });
  state.tokens = state.tokens.filter(t => !list.includes(t.id));
  goneInfo.forEach(info => {
    if (info.ownerUid && !opts.keepOwner) {
      dismissedMap()[info.ownerUid] = true;
      write('map/dm/dismissed/' + info.ownerUid, true);
    }
    delete shared.tokens[info.id];
    if (adapter && adapter.remove) {
      adapter.remove('map/public/tokens/' + info.id);
      adapter.remove('map/dm/tokens/' + info.id);
    }
  });
  if (!opts.silent) {
    goneInfo.forEach(info => emit('combatant:remove', { tokenId: info.id, combatantId: info.combatantId, ownerUid: info.ownerUid }));
  }
  if (state.drawerOpen && list.includes(state.drawerTokenId)) closeDrawer();
  if (list.includes(state.currentTurnId)) state.currentTurnId = null;
  dropLocalAim(goneInfo.reduce((ids, info) => ids.concat([info.id, info.combatantId, info.ownerUid]), []));
  if (state.selected && list.includes(state.selected.id)) state.selected = null;
  state.selectedIds = (state.selectedIds || []).filter(id => !list.includes(id));
  draw();
}
  function patchToken(id, fields) {
    if (role !== 'dm' || !id || !fields) return null;
    const t = state.tokens.find(tok => tok && tok.id === id);
    if (!t) return null;
    if (fields.status != null) t.status = fields.status;
    if (fields.name) t.name = fields.name;
    if (fields.label) t.label = String(fields.label).slice(0, 16);
    if (fields.combatantId) t.combatantId = fields.combatantId;
    if (fields.image && !t.image) t.image = fields.image;
    const copy = shared.tokens[t.id] || (shared.tokens[t.id] = { id: t.id });
    copy.status = t.status || '';
    if (t.name) copy.name = t.name;
    if (t.label) copy.label = t.label;
    if (t.combatantId) copy.combatantId = t.combatantId;
    if (t.image) {
      copy.image = t.image;
      loadTokenImage(t);
    }
    saveToken(t.id);
    draw();
    return t;
  }
  function applyLink(tokenId, patch) {
  if (role !== 'dm' || !patch) return null;
  let t = state.tokens.find(tok => tok && tok.id === tokenId);
  if (!t) return null;
  const reopen = state.drawerOpen && state.drawerTokenId === tokenId;
  if (patch.ownerUid) {
    const linkUid = patch.ownerUid;
    const want = playerTokenId(linkUid);
    const linkName = patch.name || ((partyList().find(p => p && (p.uid || p.id) === linkUid) || {}).name) || 'them';
    const others = ownedTokenIds(linkUid, t.id);
    /* Explicit DM link only: a new token becomes canonical at its own square and the old one goes.
       dedupePlayerTokens / canonicalPlayerToken still keep the old id on every other pass. */
    if (t.id !== want && others.length) {
      const pos = t.pos ? { x: t.pos.x, y: t.pos.y } : null;
      const sceneId = t.sceneId;
      removeMapTokens(others, { keepOwner: true, silent: true });
      t = retargetTokenId(t, want);
      if (pos) t.pos = { x: pos.x, y: pos.y };
      if (sceneId) t.sceneId = sceneId;
      t.kind = patch.kind || 'player';
      t.ownerUid = linkUid;
      tokenId = t.id;
      toast("Replaced " + linkName + "'s old token.");
    } else {
      t.ownerUid = linkUid;
      const pre = shared.tokens[t.id];
      if (pre) pre.ownerUid = linkUid;
      const canon = canonicalPlayerToken(linkUid);
      if (canon) {
        t = canon;
        tokenId = canon.id;
      }
    }
    delete dismissedMap()[linkUid];
    if (adapter && adapter.remove) adapter.remove('map/dm/dismissed/' + linkUid);
  }
  if (patch.kind) t.kind = patch.kind;
  if (patch.size != null && patch.size !== '') {
    /* token size: linking a token to a bestiary creature takes the creature's footprint */
    const sq = tokSquares(patch.size);
    if (sq !== tokSquares(t.size)) {
      t.size = sq;
      const fit = clampFootprint(t.pos.x, t.pos.y, sq);
      t.pos = { x: fit.x, y: fit.y };
      if (areaTaken(fit.x, fit.y, sq, { [t.id]: 1 })) toast('Bigger token overlaps another. Drag it to open ground.');
    }
  }
  if (patch.ownerUid != null) t.ownerUid = patch.ownerUid;
  if (patch.combatantId) t.combatantId = patch.combatantId;
  if (patch.sheetId != null) t.sheetId = patch.sheetId;
  if (patch.name) t.name = patch.name;
  if (patch.label) t.label = String(patch.label).slice(0, 16);
  if (patch.color) t.color = patch.color;
  if (patch.image && !t.image) t.image = patch.image;
  if (patch.portrait && !t.image && !patch.image) scheduleDefaultImage(t, patch.portrait);
  if (patch.status != null) t.status = patch.status;
  if (patch.ownerCanMove != null) t.ownerCanMove = patch.ownerCanMove !== false;
  else if (patch.ownerUid) t.ownerCanMove = true;
  const copy = shared.tokens[t.id] || (shared.tokens[t.id] = { id: t.id });
  ['kind', 'ownerUid', 'combatantId', 'sheetId', 'name', 'label', 'color', 'ownerCanMove', 'pos', 'sceneId', 'size', 'hidden', 'locked', 'status', 'image'].forEach(key => {
    if (t[key] !== undefined) copy[key] = t[key];
  });
  if (t.controlledBy) copy.controlledBy = t.controlledBy.slice();
  if (t.conditions) copy.conditions = t.conditions.slice();
  if (t.image) loadTokenImage(t);
  saveToken(t.id);
  draw();
  if (patch.ownerUid) emit('party:sync', { playerId: patch.ownerUid, tokenId: t.id });
  if (reopen) openDrawer(t.id);
  return t;
}
function hitTest(wx, wy) {
  const px = state.scene.grid.px;
  for (let i = state.tokens.length - 1; i >= 0; i--) {
    const t = state.tokens[i];
    if (!t || !t.pos) continue;
    if (t.hidden && role !== 'dm') continue;
    if (!onViewedScene(t)) continue;
    const size = t.size || 1;
    const left = t.pos.x * px, top = t.pos.y * px;
    if (wx >= left && wx <= left + size * px && wy >= top && wy <= top + size * px) return t;
  }
  return null;
}

function swallowMiddle(e) {
  if (e.button !== 1) return;
  e.preventDefault();
  e.stopPropagation();
}
/* bestiary: an armed creature lands on the clicked square before any tool sees the click */
on(canvas, 'pointerdown', (e) => { if (pointers.size === 0 && beastClick(e)) return; onPointerDown(e); });
on(el, 'pointerdown', e => { if (e.button === 1 && e.target !== canvas) swallowMiddle(e); });
on(canvas, 'mousedown', swallowMiddle);
on(el, 'mousedown', swallowMiddle);
on(canvas, 'contextmenu', e => e.preventDefault());
on(canvas, 'auxclick', swallowMiddle);
on(el, 'auxclick', swallowMiddle);
on(canvas, 'pointermove', onPointerMove);
on(canvas, 'pointerup', onPointerUp);
on(canvas, 'pointercancel', onPointerUp);
on(canvas, 'wheel', e => {
  e.preventDefault();
  e.stopPropagation();
  if ((e.buttons & 4) || (state.drag && state.drag.middle)) return;
  const before = pointerWorld(e);
  const factor = e.deltaY < 0 ? 1.1 : 0.9;
  state.view.zoom = Math.max(0.25, Math.min(4, state.view.zoom * factor));
  const after = pointerWorld(e);
  state.view.x += before.x - after.x;
  state.view.y += before.y - after.y;
  paintZoom();
  draw();
}, { passive: false });

q('chatSend').addEventListener('click', sendChat);
q('chatPop').addEventListener('click', () => { if (chatUi) chatUi.pop(); });
q('chatWindow').addEventListener('click', () => { if (chatUi && chatUi.openTab) chatUi.openTab(); });
q('chatDock').addEventListener('click', () => { if (chatUi) chatUi.dock(); });

q('helpBtn').addEventListener('click', () => {
  let box = q('helpBox');
  if (box) { box.remove(); return; }
  box = document.createElement('div');
  box.setAttribute('data-act', 'helpBox');
  box.style.cssText = 'position:absolute;top:48px;right:16px;width:320px;max-height:70vh;overflow:auto;background:#1c1814;color:#e8dcc8;border:1px solid #5a4e40;border-radius:8px;padding:12px;z-index:20;font:13px system-ui;';
  const dm = role === 'dm';
  box.innerHTML = `<b>How to use the map</b><br><br>
<b>Move</b> Outside a fight, click a square to walk. There is no green cage. In a fight, click the Move feet chip to enter Move mode. The green squares are the feet you have left (every square is 5 ft, diagonals too). Hover shows the path and the cost, and a click on a green square walks. Move mode stays on for another step. It turns off when your feet hit 0, when you click Move again, press Esc, right-click, or the turn ends.${dm ? ' Edit tokens still drags any token and ignores Move mode.' : ''} Drag still slides a token when you are not spending combat movement. Walls block the path. You can walk through an ally, and you cannot stop on an occupied square.<br>
<b>Middle mouse</b> Pans the map. It does not zoom.<br>
<b>X</b> Show the last path for the selected token.<br>
<b>Ping</b> Click the map. Color matches your token.<br>
<b>Ruler</b> Drag to measure. 1 square = 5 ft.<br>
<b>Torch</b> 40 ft of light. Does not pass walls.<br><br>
${dm ? `<b>DM</b><br>
Ctrl-click or drag a box to select many.<br>
Copy Ctrl+C, Paste Ctrl+V, Delete removes from the turn order.<br>
Door / Window: click a wall. Click again to open or shut. Right-click removes it. Secret: ON hides that door from players (no door mark) until you click it again to reveal. Shift-click does the same. Opening a door still opens sight. A secret door stays a wall on the player map until it is revealed. With the select tool, click a door for Open, Lockpick, or Peek. Locked, Lock DC, and Ajar sit under the Door tool. Peek (ajar) lets sight through and still blocks movement.<br>
<b>Assets</b> The library for this room. Add, edit, duplicate, delete, export, and import. Place, then click a square. Players within 5 ft can turn an asset on or off, open or close a gate, and light it. Health, traps, range, links, and immunities are saved and marked coming soon.<br>
Wall and Room: drag, release to commit.<br>
Walls: OFF hides the lines so you can see the raw map. Walls still block.<br>
Grant / Revoke: pick a player, then a token. Revoke on their own token locks them out. Grant gives it back.<br>
Reveal clears fog. Hide paints fog back. Each has a Box, Square, Poly, or Brush picker, and the button name is the action. Square: click one grid cell, or drag across cells. Each cell erases on its own. A drag is one history step. Poly: click as many corners as you need, then the first point, double-click, or Enter. Erase deletes one shape. Shift-click selects more, then Delete selection removes them together. Undo and Redo walk the fog history.<br>
Show Player FOV greys the rest and brightens their light.<br>
Set floor, then Show to players, to move someone to another map.` : `<b>Player</b><br>
You move your own token, and any the DM has granted you.<br>
My color changes your ring. Ping uses that color. The button stays lit while the tool is on.<br>
On your turn, click a green square to walk. Dash on the turn strip adds feet.<br>
Fog hides what you cannot see. A torch or your vision opens a circle. Within 5 ft, click a door you can see: Open, Lockpick, or Peek. Peek leaves it ajar (you can see through; you still can't walk through).`}
<br><br>Click ? again to close.`;
  el.appendChild(box);
});

q('chatInput').addEventListener('keydown', e => { if (e.key === 'Enter') sendChat(); });
q('chatToggle').addEventListener('click', () => setChatOpen(!state.chatOpen));
el.querySelectorAll('[data-chat-filter]').forEach(btn => {
  btn.addEventListener('click', () => setChatFilter(btn.getAttribute('data-chat-filter')));
});
setChatOpen(state.chatOpen);
q('strength').addEventListener('input', e => {
  state.gridStrength = Math.max(state.minStrength, parseFloat(e.target.value));
  e.target.value = state.gridStrength;
  if (options.setGrid) options.setGrid(state.gridStrength);
  draw();
});
function paintFxBtn() {
  const b = q('fxBtn');
  if (!b) return;
  const on = fxOn();
  b.textContent = 'Effects: ' + (on ? 'ON' : 'OFF');
  b.classList.toggle('active', on);
  b.setAttribute('aria-pressed', on ? 'true' : 'false');
  b.hidden = !FXA;
}
if (q('challengeBtn')) {
  q('challengeBtn').addEventListener('click', () => emit('challenge:open', {}));
}
if (q('fxBtn')) {
  q('fxBtn').addEventListener('click', () => {
    if (!FXA) return;
    FXA.setEnabled(!FXA.enabled());
    if (!FXA.enabled()) fxStopAll();
    paintFxBtn();
  });
  on(window, 'ssdns-map-fx-pref', () => { if (!fxOn()) fxStopAll(); paintFxBtn(); });
  paintFxBtn();
}
q('reset').addEventListener('click', () => {
  const { cols, rows, px } = state.scene.grid;
  state.view.x = (cols * px) / 2;
  state.view.y = (rows * px) / 2;
  state.view.zoom = 1;
  paintZoom();
  draw();
});

if (role === 'dm') {
  q('hideBtn').addEventListener('click', () => {
    if (!state.selected) { toast('Select a token first'); return; }
    state.selected.hidden = !state.selected.hidden;
    if (shared.tokens[state.selected.id]) {
      shared.tokens[state.selected.id].hidden = state.selected.hidden;
      saveToken(state.selected.id);
    }
    emit('token:hidden', {
      tokenId: state.selected.id,
      hidden: !!state.selected.hidden,
      combatantId: state.selected.combatantId || ''
    });
    flashBtn('hideBtn');
    draw();
  });
  fillColorSelect(q('colorBtn'));
  function applyDmColor(color) {
    const targets = state.selectedIds.length ? state.tokens.filter(t => state.selectedIds.includes(t.id)) : (state.selected ? [state.selected] : []);
    if (!targets.length) { toast('Select a token first'); return; }
    targets.forEach(t => {
      t.color = color;
      if (shared.tokens[t.id]) shared.tokens[t.id].color = color;
    });
    targets.forEach(t => saveToken(t.id));
    paintSwatch(q('colorSwatch'), color);
    draw();
  }
  q('colorBtn').addEventListener('change', () => {
    const sel = q('colorBtn');
    const custom = q('colorCustom');
    if (sel.value === 'custom') {
      if (custom) { custom.hidden = false; custom.click(); }
      return;
    }
    if (custom) custom.hidden = true;
    applyDmColor(sel.value);
  });
  if (q('colorCustom')) q('colorCustom').addEventListener('input', () => applyDmColor(q('colorCustom').value));
  q('lockBtn').addEventListener('click', () => {
    const targets = state.selectedIds.length ? state.tokens.filter(t => state.selectedIds.includes(t.id)) : (state.selected ? [state.selected] : []);
    if (!targets.length) { toast('Select a token first'); return; }
    targets.forEach(t => {
      t.locked = !t.locked;
      if (shared.tokens[t.id]) shared.tokens[t.id].locked = t.locked;
    });
    targets.forEach(t => saveToken(t.id));
    flashBtn('lockBtn');
    toast(targets[0].locked ? 'Locked' : 'Unlocked');
    draw();
  });
  q('clearAllZonesBtn').addEventListener('click', () => clearSpellGrid({ all: true }));
  renderZoneClear();
  q('downBtn').addEventListener('click', () => {
    const targets = state.selectedIds.length ? state.tokens.filter(t => state.selectedIds.includes(t.id)) : (state.selected ? [state.selected] : []);
    if (!targets.length) { toast('Select a token first'); return; }
    targets.forEach(t => {
      t.status = t.status === 'down' ? '' : 'down';
      if (shared.tokens[t.id]) shared.tokens[t.id].status = t.status;
    });
    targets.forEach(t => saveToken(t.id));
    flashBtn('downBtn');
    draw();
  });
  q('condToggleBtn').addEventListener('click', () => {
    const targets = state.selectedIds.length ? state.tokens.filter(t => state.selectedIds.includes(t.id)) : (state.selected ? [state.selected] : []);
    if (!targets.length) { toast('Select a token first'); return; }
    const sel = q('condSelect');
    const cond = sel.value;
    if (!cond) { toast('Pick a condition'); return; }
    targets.forEach(t => {
      if (!t.conditions) t.conditions = [];
      const idx = t.conditions.indexOf(cond);
      if (idx >= 0) t.conditions.splice(idx, 1);
      else t.conditions.push(cond);
      if (shared.tokens[t.id]) shared.tokens[t.id].conditions = [...t.conditions];
    });
    targets.forEach(t => saveToken(t.id));
    flashBtn('condToggleBtn');
    draw();
  });
  q('fogBtn').addEventListener('click', () => {
    sceneData().fogRevealed = !sceneData().fogRevealed;
    const fb = q('fogBtn');
    fb.textContent = sceneData().fogRevealed ? 'Fog: OFF' : 'Fog: ON';
    fb.classList.toggle('active', !sceneData().fogRevealed);
    saveScene();
    draw();
  });
  q('revealFogBtn').addEventListener('click', () => armFog('reveal'));
  q('hideFogBtn').addEventListener('click', () => armFog('hide'));
  q('eraseFogBtn').addEventListener('click', () => {
    if (state.tool === 'erase') {
      state.tool = null;
      state.fogKind = null;
      clearToolButtons();
      paintFogTools();
      applyCursor();
      draw();
      return;
    }
    state.tool = 'erase';
    state.fogKind = null;
    state.polyPoints = [];
    state.polyHover = null;
    clearToolButtons();
    paintFogTools();
    applyCursor();
    draw();
  });
  q('revealShape').addEventListener('change', () => {
    if (state.tool === 'reveal') {
      state.fogKind = q('revealShape').value;
      if (state.fogKind !== 'poly') { state.polyPoints = []; state.polyHover = null; }
    }
    paintFogTools();
    draw();
  });
  q('hideShape').addEventListener('change', () => {
    if (state.tool === 'hide') {
      state.fogKind = q('hideShape').value;
      if (state.fogKind !== 'poly') { state.polyPoints = []; state.polyHover = null; }
    }
    paintFogTools();
    draw();
  });
  q('deleteFogBtn').addEventListener('click', () => {
    const ids = state.fogSelection || [];
    if (!ids.length) { toast('Hold Shift and use Erase to make a selection.'); return; }
    rememberFog();
    sceneData().fogShapes = sceneData().fogShapes.filter(s => ids.indexOf(s.id) < 0);
    state.fogSelection = [];
    commitFog(ids.length === 1 ? 'Erase' : 'Erase ' + ids.length);
  });
  q('fogUndoBtn').addEventListener('click', undoFog);
  q('fogRedoBtn').addEventListener('click', redoFog);
  renderFogHistory();
  q('wallBtn').addEventListener('click', () => setTool('wall'));
  q('roomBtn').addEventListener('click', () => setTool('room'));
  q('doorBtn').addEventListener('click', () => setTool('door'));
  q('secretDoorBtn').addEventListener('click', () => armSecretDoor());
  ['doorLocked', 'doorLockDc', 'doorAjar', 'doorTrapOnFail'].forEach(name => {
    const node = q(name);
    if (!node) return;
    node.addEventListener('change', () => commitDoorEdit());
  });
  q('windowBtn').addEventListener('click', () => setTool('window'));
  q('snapBtn').addEventListener('click', () => {
    state.snap = !state.snap;
    const b = q('snapBtn');
    b.textContent = state.snap ? 'Snap: ON' : 'Snap: OFF';
    b.classList.toggle('active', state.snap);
  });
  function revealWallLines() {
    if (role !== 'dm' || state.showWalls) return;
    state.showWalls = true;
    const b = q('wallsVisBtn');
    if (!b) return;
    b.textContent = 'Walls: ON';
    b.classList.add('active');
  }
  q('wallsVisBtn').addEventListener('click', () => {
    state.showWalls = !state.showWalls;
    const b = q('wallsVisBtn');
    b.textContent = state.showWalls ? 'Walls: ON' : 'Walls: OFF';
    b.classList.toggle('active', state.showWalls);
    draw();
  });
  q('delWallBtn').addEventListener('click', () => setTool('delwall'));
  q('undoWallBtn').addEventListener('click', () => {
    if (sceneData().walls.length) {
      sceneData().walls.pop();
      saveScene();
      toast('Last wall removed');
      flashBtn('undoWallBtn');
      draw();
    } else toast('No walls');
  });
  q('clearWallsBtn').addEventListener('click', () => {
    sceneData().walls = [];
    saveScene();
    toast('All walls cleared');
    flashBtn('clearWallsBtn');
    draw();
  });
  const importBtn = q('importWallsBtn');
  if (importBtn) importBtn.addEventListener('click', () => {
    const packScene = builtinScenes().find(s => s.id === activeSceneId());
    const fromPack = packScene && Array.isArray(packScene.walls) && packScene.walls.length ? JSON.stringify(packScene.walls) : '';
    const raw = prompt('Paste walls JSON (array of {x1,y1,x2,y2}):', fromPack);
    if (!raw) return;
    try {
      const walls = JSON.parse(raw);
      if (Array.isArray(walls)) {
        sceneData().walls = walls;
        saveScene();
        toast('Imported ' + walls.length + ' walls');
        draw();
      }
    } catch (e) {
      toast('Invalid walls JSON');
    }
  });
  q('rulerBtn').addEventListener('click', () => setTool('ruler'));
  q('pingBtn').addEventListener('click', () => setTool('ping'));
  q('undoBtn').addEventListener('click', () => {
    const action = state.undoStack.pop();
    if (!action) return;
    state.redoStack.push(action);
    if (action.type === 'move' && action.from) {
      state.slides = (state.slides || []).filter(s => !action.from[s.id]);
      if (action.feet) {
        const back = state.tokens.find(tok => tok && action.from[tok.id]);
        if (back) spendFeet(back, -action.feet);
      }
      Object.keys(action.from).forEach(id => {
        const t = state.tokens.find(tok => tok.id === id);
        if (t) {
          t.pos.x = action.from[id].x;
          t.pos.y = action.from[id].y;
          if (shared.tokens[t.id]) shared.tokens[t.id].pos = { ...t.pos };
          saveToken(id);
        }
      });
    }
    flashBtn('undoBtn');
    draw();
  });
  q('redoBtn').addEventListener('click', () => {
    const action = state.redoStack.pop();
    if (!action) return;
    state.undoStack.push(action);
    if (action.type === 'move' && action.to) {
      state.slides = (state.slides || []).filter(s => !action.to[s.id]);
      if (action.feet) {
        const again = state.tokens.find(tok => tok && action.to[tok.id]);
        if (again) spendFeet(again, action.feet);
      }
      Object.keys(action.to).forEach(id => {
        const t = state.tokens.find(tok => tok.id === id);
        if (t) {
          t.pos.x = action.to[id].x;
          t.pos.y = action.to[id].y;
          if (shared.tokens[t.id]) shared.tokens[t.id].pos = { ...t.pos };
          saveToken(id);
        }
      });
    }
    flashBtn('redoBtn');
    draw();
  });
  q('dmLabel').addEventListener('change', () => {
    if (!state.selected) { toast('Select a token'); return; }
    setLabel(state.selected, q('dmLabel').value.trim());
    toast('Label set');
  });
  /* Ghost Plan buttons are gone. toggleGhost / cancelGhost stay as no-ops. */
  q('revealAllBtn').addEventListener('click', () => {
    sceneData().fogRevealed = true;
    sceneData().fogRects = [];
    sceneData().fogPolys = [];
    sceneData().fogShapes = [];
    state.polyPoints = [];
    state.polyHover = null;
    state.fogSelection = [];
    state.fogPast = [];
    state.fogFuture = [];
    q('fogBtn').textContent = 'Fog: OFF';
    saveScene();
    renderFogHistory();
    draw();
  });
  q('hideAllBtn').addEventListener('click', () => {
    sceneData().fogRevealed = false;
    sceneData().fogRects = [];
    sceneData().fogPolys = [];
    sceneData().fogShapes = [];
    state.polyPoints = [];
    state.polyHover = null;
    state.fogSelection = [];
    state.fogPast = [];
    state.fogFuture = [];
    q('fogBtn').textContent = 'Fog: ON';
    saveScene();
    renderFogHistory();
    draw();
  });
  if (q('ambientSel')) q('ambientSel').addEventListener('change', () => {
    sceneData().ambient = q('ambientSel').value === 'bright' || q('ambientSel').value === 'dim' ? q('ambientSel').value : 'dark';
    saveScene();
    draw();
  });
  if (q('showLightRings')) q('showLightRings').addEventListener('change', () => {
    state.showLightRings = !!q('showLightRings').checked;
    draw();
  });
  if (q('visionSel')) q('visionSel').addEventListener('change', () => {
    sceneData().visionMode = q('visionSel').value === 'own' ? 'own' : 'party';
    saveScene();
    draw();
  });
  function douseSelected(out) {
    const targets = state.selectedIds.length ? state.tokens.filter(t => state.selectedIds.includes(t.id)) : (state.selected ? [state.selected] : []);
    if (!targets.length) { toast('Select a token first'); return; }
    targets.forEach(t => {
      t.dmDoused = !!out;
      if (out) t.torch = false;
      if (Array.isArray(t.lights)) t.lights.forEach(l => { l.out = !!out; });
      const copy = shared.tokens[t.id];
      if (copy) {
        copy.dmDoused = !!out;
        if (out) copy.torch = false;
        if (Array.isArray(copy.lights)) copy.lights.forEach(l => { l.out = !!out; });
        else if (Array.isArray(t.lights)) copy.lights = t.lights.map(l => Object.assign({}, l));
      }
      saveToken(t.id);
    });
    toast(out ? 'Lights out' : 'Lights relit');
    draw();
  }
  if (q('dmDouseBtn')) q('dmDouseBtn').addEventListener('click', () => douseSelected(true));
  if (q('dmRelightBtn')) q('dmRelightBtn').addEventListener('click', () => douseSelected(false));
  q('showFovBtn').addEventListener('click', () => {
    state.showPlayerFov = !state.showPlayerFov;
    q('showFovBtn').textContent = state.showPlayerFov ? 'Show Player FOV: ON' : 'Show Player FOV: OFF';
    q('showFovBtn').classList.toggle('active', state.showPlayerFov);
    draw();
  });
  q('mapsBtn').addEventListener('click', () => {
    if (window.SSDNSMapLibrary && window.SSDNSMapLibrary.open) window.SSDNSMapLibrary.open(libraryApi());
    else toast('Map menu not loaded');
  });
  if (q('assetsBtn')) q('assetsBtn').addEventListener('click', () => {
    if (window.SSDNSAssetLibrary && window.SSDNSAssetLibrary.open) window.SSDNSAssetLibrary.open(assetApi());
    else toast('Asset library not loaded');
  });
  q('myViewBtn').addEventListener('click', () => {
    const sel = q('sceneSelect');
    swapScene(sel.value);
    flashBtn('myViewBtn');
    toast('My view: ' + sel.options[sel.selectedIndex].text);
  });
  if (q('dmEditBtn')) {
    paintDmEdit();
    q('dmEditBtn').addEventListener('click', () => setDmEdit(!state.dmEdit));
  }
  q('setFloorBtn').addEventListener('click', () => {
    const targets = state.selectedIds.length ? state.tokens.filter(t => state.selectedIds.includes(t.id)) : (state.selected ? [state.selected] : []);
    if (!targets.length) { toast('Select a token first'); return; }
    const sel = q('sceneSelect');
    const sceneId = sel.value;
    if (!shared.playerScenes) shared.playerScenes = {};
    targets.forEach(t => {
      t.sceneId = sceneId;
      if (shared.tokens[t.id]) shared.tokens[t.id].sceneId = sceneId;
      if (t.ownerUid) shared.playerScenes[t.ownerUid] = sceneId;
      saveToken(t.id);
    });
    postScenes();
    flashBtn('setFloorBtn');
    toast('Floor set to ' + sel.options[sel.selectedIndex].text);
    draw();
    renderTurnStrip();
  });
  q('showSceneBtn').addEventListener('click', () => {
    postScenes();
    toast('Floors pushed to players');
  });
  q('addTokenBtn').addEventListener('click', () => { addEnemyToken(); flashBtn('addTokenBtn'); });
  if (q('bestiaryBtn')) { q('bestiaryBtn').addEventListener('click', () => toggleBestiary()); bindBestiaryDrop(); }
  q('addPcBtn').addEventListener('click', () => { addPlayerToken(); flashBtn('addPcBtn'); });
  q('dupTokenBtn').addEventListener('click', () => {
    const list = selectedTokens();
    if (!list.length) { toast('Select a token'); return; }
    const made = list.map((src, i) => cloneToken(src, 1, i)).filter(Boolean);
    state.selectedIds = made.map(t => t.id);
    state.selected = made[0];
    made.forEach(t => saveToken(t.id));
    flashBtn('dupTokenBtn');
    toast('Duplicated ' + made.length);
    draw();
  });
  q('copyTokenBtn').addEventListener('click', () => { copyTokens(); flashBtn('copyTokenBtn'); });
  q('pasteTokenBtn').addEventListener('click', () => { pasteTokens(); flashBtn('pasteTokenBtn'); });
  function setControl(grant) {
    const who = q('grantUid').value;
    if (!who) { toast('No player to grant'); return; }
    const list = selectedTokens();
    if (!list.length) { toast('Select a token'); return; }
    list.forEach(t => {
      t.controlledBy = t.controlledBy || [];
      if (grant && !t.controlledBy.includes(who)) t.controlledBy.push(who);
      if (!grant) t.controlledBy = t.controlledBy.filter(u => u !== who);
      if (grant && t.ownerUid === who) t.ownerCanMove = true;
      if (!grant && t.ownerUid === who) t.ownerCanMove = false;
      if (!shared.tokens[t.id]) shared.tokens[t.id] = { id: t.id };
      shared.tokens[t.id].controlledBy = t.controlledBy;
      shared.tokens[t.id].ownerCanMove = t.ownerCanMove !== false;
      postGrant(t);
      saveToken(t.id);
    });
    toast((grant ? 'Granted ' : 'Revoked ') + who);
    draw();
  }
  q('grantBtn').addEventListener('click', () => setControl(true));
  q('revokeBtn').addEventListener('click', () => setControl(false));
  on(document, 'keydown', e => {
    if (e.key === 'Shift' && state.drag && state.drag.token) { dropPin(); return; }
    if (e.key.toLowerCase() === 'x' && !e.ctrlKey && !e.metaKey) {
      const sel = state.selected || state.tokens.find(tok => tok.ownerUid === uid);
      const path = sel && state.lastPaths && state.lastPaths[sel.id];
      if (path) { state.recall = path; toast('Last path'); draw(); setTimeout(() => { state.recall = null; draw(); }, 2500); }
      else toast('No saved path');
      return;
    }
    if (role !== 'dm') return;
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') { e.preventDefault(); copyTokens(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') { e.preventDefault(); pasteTokens(); }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); q('delTokenBtn').click(); }
  });
  q('delTokenBtn').addEventListener('click', () => {
    const ids = state.selectedIds.length ? [...state.selectedIds] : (state.selected ? [state.selected.id] : []);
    if (!ids.length) { toast('Select a token'); return; }
    removeMapTokens(ids);
    flashBtn('delTokenBtn');
    toast('Removed from map and turn order');
  });
  renderActions();
  bindRangeUi();
} else {
  fillColorSelect(q('playerColorBtn'));
  (function placePlayerCard() {
    const card = q('playerCard');
    if (!card) return;
    applyTokenDock(card);
    bindTokenDrag(card);
    const minBtn = q('playerCardMin');
    if (minBtn) minBtn.addEventListener('click', () => toggleTokenShut(card));
    const dockBtn = q('playerDock');
    if (dockBtn) dockBtn.addEventListener('click', () => {
      const st = tokenDockState();
      dockToken(card, (st && st.side) || 'left');
    });
  })();
  function myToken() {
    return state.tokens.find(t => t.ownerUid === uid) || Object.values(shared.tokens || {}).find(t => t && t.ownerUid === uid) || null;
  }
  function applyPlayerColor(color) {
    const myTokenRow = myToken();
    if (!myTokenRow) { toast('No token found'); return; }
    myTokenRow.color = color;
    if (shared.tokens[myTokenRow.id]) shared.tokens[myTokenRow.id].color = color;
    paintSwatch(q('playerSwatch'), color);
    publishPlayerPatch(myTokenRow, { color: color });
    draw();
  }
  q('playerColorBtn').addEventListener('change', () => {
    const sel = q('playerColorBtn');
    const custom = q('playerColorCustom');
    if (sel.value === 'custom') {
      if (custom) { custom.hidden = false; if (custom.showPicker) custom.showPicker(); else custom.click(); }
      return;
    }
    if (custom) custom.hidden = true;
    applyPlayerColor(sel.value);
  });
  if (q('playerColorCustom')) q('playerColorCustom').addEventListener('input', () => applyPlayerColor(q('playerColorCustom').value));
  q('playerHiddenBtn').addEventListener('click', () => {
    const row = myToken();
    const id = (row && row.id) || playerTokenId(uid);
    const next = !(row && row.veil);
    if (row) row.veil = next;
    if (shared.tokens[id]) shared.tokens[id].veil = next;
    const btn = q('playerHiddenBtn');
    if (btn) {
      btn.textContent = next ? 'Hidden: ON' : 'Hidden: OFF';
      btn.classList.toggle('active', next);
    }
    publishPlayerPatch({ id: id }, { veil: next });
    draw();
  });
  q('playerPingBtn').addEventListener('click', () => {
    state.tool = state.tool === 'ping' ? null : 'ping';
    q('playerRulerBtn').classList.remove('active');
    q('playerRulerBtn').textContent = 'Ruler';
    const b = q('playerPingBtn');
    b.textContent = state.tool === 'ping' ? 'Ping…' : 'Ping';
    b.classList.toggle('active', state.tool === 'ping');
    applyCursor();
  });
  q('playerRulerBtn').addEventListener('click', () => {
    state.tool = state.tool === 'ruler' ? null : 'ruler';
    q('playerPingBtn').classList.remove('active');
    q('playerPingBtn').textContent = 'Ping';
    const b = q('playerRulerBtn');
    b.textContent = state.tool === 'ruler' ? 'Ruler…' : 'Ruler';
    b.classList.toggle('active', state.tool === 'ruler');
    applyCursor();
  });
  /* The test torch toggle is gone. Light comes from held items, trinket lanterns, and light spells. */
  q('playerLabel').addEventListener('change', () => {
    const me = state.tokens.find(tok => tok.ownerUid === uid);
    if (!me) return;
    setLabel(me, q('playerLabel').value.trim());
    toast('Label set');
  });
  if (q('addMineBtn')) q('addMineBtn').addEventListener('click', () => {
    if (mySceneToken()) { paintAddMine(); return; }
    const Join = window.SSDNSDmJoin;
    if (!Join || typeof Join.postAddToken !== 'function') { toast('Join the table first'); return; }
    const sceneId = (typeof getPlayerScene === 'function' && getPlayerScene()) || '';
    Promise.resolve(Join.postAddToken({ sceneId: sceneId })).then(res => {
      toast(res && res.ok ? 'Asked the DM to add your token' : "Couldn't ask for a token");
    }).catch(() => toast("Couldn't ask for a token"));
  });
  paintAddMine();
  renderActions();
  bindRangeUi();
}

// --- scene images ---
// 0.3.54: built-in packs (map/map-packs.js) + the DM's own library (map/dm/library).
const LEGACY_SCENES = [
  { id: 'scn_dustyspur01', name: 'Dusty Spur', folder: 'builtin', img: 'dusty-spur-saloon_30x20_70px.webp' },
  { id: 'scn_street', name: 'Main Street', folder: 'builtin', img: 'main-street.webp' },
  { id: 'scn_upstairs', name: 'Upstairs', folder: 'builtin', img: 'upstairs.webp' }
];
let library = {};
function builtinScenes() {
  const pack = window.SSDNS_MAP_PACKS;
  if (!pack || !Array.isArray(pack.scenes) || !pack.scenes.length) return LEGACY_SCENES;
  return pack.scenes.map(sc => Object.assign({ folder: 'builtin' }, sc));
}
function worldMaps() {
  const pack = window.SSDNS_MAP_PACKS;
  return (pack && Array.isArray(pack.world) ? pack.world : []).map(w => Object.assign({ folder: 'world' }, w));
}
function libraryScenes() {
  return Object.keys(library || {}).map(id => library[id]).filter(e => e && e.id && !e.deleted).map(e => Object.assign({}, e, { folder: 'mine' }));
}
function publicMetaScenes() {
  const out = [];
  Object.keys(shared.scenes || {}).forEach(id => {
    const m = shared.scenes[id] && shared.scenes[id].meta;
    if (m && m.src) out.push({ id, name: m.name || 'Map', folder: 'mine', src: m.src, grid: m.grid });
  });
  return out;
}
function allScenes() {
  const seen = {};
  const list = [];
  builtinScenes().concat(libraryScenes(), publicMetaScenes()).forEach(sc => { if (sc && !seen[sc.id]) { seen[sc.id] = 1; list.push(sc); } });
  return list;
}
const SCENES = { find: fn => allScenes().find(fn), filter: fn => allScenes().filter(fn) };
function fillSceneSelect() {
  const sel = q('sceneSelect');
  if (!sel) return;
  const keep = sel.value || activeSceneId();
  sel.innerHTML = '';
  allScenes().forEach(s => {
    const o = document.createElement('option');
    o.value = s.id;
    o.textContent = s.name;
    sel.appendChild(o);
  });
  if (keep && allScenes().some(s => s.id === keep)) sel.value = keep;
}
function sceneGrid(sc) {
  const base = BASE_GRID;
  const g = (sc && sc.grid) || {};
  return Object.assign({}, base, {
    cols: Math.max(1, Math.round(Number(g.cols) || base.cols)),
    rows: Math.max(1, Math.round(Number(g.rows) || base.rows)),
    px: Number(g.px) || base.px || 70
  });
}
function seedPackWalls(sc) {
  if (role !== 'dm' || !sc || !Array.isArray(sc.walls) || !sc.walls.length) return false;
  const sd = sceneData(sc.id);
  if (sd.walls.length || sd.seededPack) return false;
  sd.walls = sc.walls.map(w => Object.assign({}, w));
  sd.seededPack = true;
  saveScene(sc.id);
  return true;
}
function restoreSnapshot(sid, snap, opts) {
  if (role !== 'dm' || !snap) return false;
  opts = opts || {};
  const sd = sceneData(sid);
  const empty = !sd.walls.length && !(sd.fogShapes || []).length;
  if (!empty && !opts.force) return false;
  if (Array.isArray(snap.walls)) sd.walls = snap.walls.map(w => Object.assign({}, w));
  if (Array.isArray(snap.fogShapes)) sd.fogShapes = snap.fogShapes.map(f => JSON.parse(JSON.stringify(f)));
  sd.fogRevealed = snap.fogRevealed === true;
  sd.seededPack = true;
  (snap.tokens || []).forEach(t => {
    if (!t || !t.id || t.kind === 'player' || t.ownerUid) return;
    if (shared.tokens[t.id] && !opts.force) return;
    const tok = JSON.parse(JSON.stringify(t));
    tok.sceneId = sid;
    shared.tokens[tok.id] = tok;
    const live = state.tokens.find(x => x.id === tok.id);
    if (live) Object.assign(live, tok); else state.tokens.push(JSON.parse(JSON.stringify(tok)));
    saveToken(tok.id);
  });
  saveScene(sid);
  return true;
}
function snapshotScene(sid) {
  const sd = sceneData(sid);
  const toks = Object.keys(shared.tokens || {}).map(id => shared.tokens[id]).filter(t => t && (t.sceneId || 'scn_dustyspur01') === sid && t.kind !== 'player' && !t.ownerUid);
  return {
    walls: JSON.parse(JSON.stringify(sd.walls || [])),
    fogShapes: JSON.parse(JSON.stringify(sd.fogShapes || [])),
    fogRevealed: sd.fogRevealed === true,
    tokens: JSON.parse(JSON.stringify(toks, (k, v) => k === '_img' ? undefined : v)),
    savedAt: Date.now()
  };
}
let assetLibrary = {};
function saveAssetDef(entry) {
  if (!entry || !entry.id) return;
  assetLibrary[entry.id] = JSON.parse(JSON.stringify(entry));
  try { localStorage.setItem('ssdns.assets.v1', JSON.stringify(assetLibrary)); } catch (e) {}
  if (role === 'dm') write('map/dm/assetLibrary/' + entry.id, assetLibrary[entry.id]);
}
function removeAssetDef(id) {
  if (!assetLibrary[id]) return;
  delete assetLibrary[id];
  try { localStorage.setItem('ssdns.assets.v1', JSON.stringify(assetLibrary)); } catch (e) {}
  if (adapter && adapter.remove) adapter.remove('map/dm/assetLibrary/' + id);
}
function absorbAssetLibrary(value) {
  if (!value || typeof value !== 'object') return;
  if (value.id && (value.name || value.v)) assetLibrary[value.id] = value;
  else Object.keys(value).forEach(id => { if (value[id] && value[id].id) assetLibrary[value[id].id] = value[id]; });
  try { localStorage.setItem('ssdns.assets.v1', JSON.stringify(assetLibrary)); } catch (e) {}
  if (window.SSDNSAssetLibrary && window.SSDNSAssetLibrary.refresh) window.SSDNSAssetLibrary.refresh();
}
if (role === 'dm') {
  try { assetLibrary = JSON.parse(localStorage.getItem('ssdns.assets.v1') || '{}') || {}; } catch (e) { assetLibrary = {}; }
}
function assetApi() {
  return {
    role,
    library: () => assetLibrary,
    save: saveAssetDef,
    remove: removeAssetDef,
    toast,
    place: (def) => {
      state.placeAsset = def;
      applyCursor();
      toast('Click a square to place ' + (def && def.name ? def.name : 'the asset'));
    }
  };
}
function saveLibraryEntry(entry) {
  if (!entry || !entry.id) return;
  library[entry.id] = JSON.parse(JSON.stringify(entry));
  try { localStorage.setItem('ssdns.maps.v1', JSON.stringify(library)); } catch (e) {}
  if (role === 'dm') write('map/dm/library/' + entry.id, library[entry.id]);
  if (entry.src && role === 'dm') {
    const sd = sceneData(entry.id);
    sd.meta = { name: entry.name || 'Map', src: entry.src, grid: { cols: entry.grid.cols, rows: entry.grid.rows, px: entry.grid.px || 70 } };
    saveScene(entry.id);
  }
}
function removeLibraryEntry(id) {
  if (!library[id]) return;
  delete library[id];
  try { localStorage.setItem('ssdns.maps.v1', JSON.stringify(library)); } catch (e) {}
  if (adapter && adapter.remove) adapter.remove('map/dm/library/' + id);
  if (shared.scenes && shared.scenes[id] && shared.scenes[id].meta) { delete shared.scenes[id].meta; saveScene(id); }
}
if (role === 'dm') {
  try { library = JSON.parse(localStorage.getItem('ssdns.maps.v1') || '{}') || {}; } catch (e) { library = {}; }
}
let autosaveTimer = 0;
function autosave() {
  if (role !== 'dm') return;
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    const sid = activeSceneId();
    const entry = library[sid];
    if (!entry) return;
    entry.snapshot = snapshotScene(sid);
    entry.updatedAt = Date.now();
    saveLibraryEntry(entry);
  }, 1500);
}
function swapScene(id) {
  const sc = allScenes().find(s => s.id === id);
  if (!sc) return false;
  if (role === 'dm') {
    const cur = activeSceneId();
    if (library[cur] && cur !== id) { library[cur].snapshot = snapshotScene(cur); saveLibraryEntry(library[cur]); }
    state.dmView = id;
    const sel = q('sceneSelect');
    if (sel) { fillSceneSelect(); sel.value = id; }
    if (!seedPackWalls(sc) && library[id] && library[id].snapshot) restoreSnapshot(id, library[id].snapshot);
  }
  loadSceneImage(id, { center: true });
  const sd = sceneData();
  const fogBtn = q('fogBtn');
  if (fogBtn) {
    fogBtn.textContent = sd.fogRevealed ? 'Fog: OFF' : 'Fog: ON';
    fogBtn.classList.toggle('active', !sd.fogRevealed);
    const ambSel = q('ambientSel');
    if (ambSel) ambSel.value = sd.ambient === 'bright' || sd.ambient === 'dim' ? sd.ambient : 'dark';
    const visSel = q('visionSel');
    if (visSel) visSel.value = sd.visionMode === 'own' ? 'own' : 'party';
  }
  if (window.SSDNSMapLibrary && window.SSDNSMapLibrary.refresh) window.SSDNSMapLibrary.refresh();
  renderTurnStrip();
  return true;
}
function sceneKey(t) {
  return (t && t.sceneId) || 'scn_dustyspur01';
}
function onViewedScene(t) {
  return !!t && sceneKey(t) === activeSceneId();
}
function floorName(sceneId) {
  const sid = sceneId || 'scn_dustyspur01';
  const sc = allScenes().find(s => s && s.id === sid);
  return (sc && sc.name) || 'another floor';
}
function activeSceneId() {
  if (role === 'dm') return state.dmView || 'scn_dustyspur01';
  return getPlayerScene();
}
function sceneData(id) {
  const sid = id || activeSceneId();
  if (!shared.scenes) shared.scenes = {};
  if (!shared.scenes[sid] || typeof shared.scenes[sid] !== "object") {
    shared.scenes[sid] = { walls: [], fogRects: [], fogRevealed: false };
  }
  const scene = shared.scenes[sid];
  // Realtime Database drops empty arrays, so a fresh scene comes back without walls.
  if (!Array.isArray(scene.walls)) scene.walls = [];
  if (!Array.isArray(scene.fogRects)) scene.fogRects = [];
  if (!Array.isArray(scene.fogPolys)) scene.fogPolys = [];
  if (!Array.isArray(scene.fogShapes)) {
    const shapes = [];
    scene.fogRects.forEach(r => {
      if (!r) return;
      shapes.push({ id: fogId(), op: 'reveal', kind: 'box', x: r.x || 0, y: r.y || 0, w: r.w || 1, h: r.h || 1 });
    });
    scene.fogPolys.forEach(p => {
      if (!p || !p.points || p.points.length < 3) return;
      shapes.push({ id: fogId(), op: 'reveal', kind: 'poly', points: p.points.map(pt => ({ x: pt.x, y: pt.y })) });
    });
    scene.fogShapes = shapes;
  }
  return scene;
}
function migrateGlobalToScenes() {
  if (shared._migrated) return;
  shared._migrated = true;
  const saloon = sceneData('scn_dustyspur01');
  let changed = false;
  if (shared.walls && shared.walls.length && !saloon.walls.length) { saloon.walls = shared.walls; changed = true; }
  if (shared.fogRects && shared.fogRects.length && !saloon.fogRects.length) { saloon.fogRects = shared.fogRects; changed = true; }
  if (shared.fogRevealed === true && saloon.fogRevealed !== true) { saloon.fogRevealed = true; changed = true; }
  if (changed) saveScene();
}
function getPlayerScene() {
  if (role !== 'player') return state.dmView || 'scn_dustyspur01';
  const my = state.tokens.find(t => t.ownerUid === uid);
  return my?.sceneId || shared.playerScenes?.[uid] || 'scn_dustyspur01';
}
async function loadSceneImage(sceneId, opts) {
  const scene = SCENES.find(s => s.id === sceneId) || builtinScenes()[0];
  if (state.scene) {
    const before = state.scene.grid || {};
    state.scene.grid = sceneGrid(scene);
    state.scene.mapId = scene.id;
    const g = state.scene.grid;
    if ((opts && opts.center) || before.cols !== g.cols || before.rows !== g.rows) {
      state.view.x = (g.cols * g.px) / 2;
      state.view.y = (g.rows * g.px) / 2;
    }
  }
  const img = new Image();
  img.src = scene.src || asset(scene.img);
  try { await img.decode(); } catch (e) { toast('Map image did not load: ' + (scene.name || scene.id)); }
  if (state.scene && state.scene.mapId === scene.id) state.scene._img = img;
  draw();
}

// --- init ---

  function ensureAnim() {
    if (animRaf || dead) return;
    const step = () => {
      if (dead) return;
      const now = Date.now();
      let live = false;
      state.slides = (state.slides || []).filter(s => {
        const t = state.tokens.find(tok => tok.id === s.id);
        if (!t) return false;
        live = true;
        const u = Math.min(1, (now - s.start) / s.ms);
        const segs = s.points.length - 1;
        const f = u * segs;
        const i = Math.min(segs - 1, Math.floor(f));
        const k = f - i;
        const a = s.points[i], b = s.points[i + 1];
        t.pos.x = a.x + (b.x - a.x) * k;
        t.pos.y = a.y + (b.y - a.y) * k;
        if (u >= 1) {
          t.pos.x = s.points[segs].x; t.pos.y = s.points[segs].y;
          if (shared.tokens[t.id]) shared.tokens[t.id].pos = { x: t.pos.x, y: t.pos.y, by: uid, seq: Date.now() };
          if (role === 'dm') write('map/public/tokens/' + t.id + '/pos', shared.tokens[t.id].pos);
          else publishPlayerMove(t);
          return false;
        }
        return true;
      });
      state.pings = (state.pings || []).filter(p => now - p.ts < 2500);
      if (state.currentTurnId) live = true;
      if (live || (state.slides && state.slides.length) || (state.pings && state.pings.length)) {
        draw();
        animRaf = requestAnimationFrame(step);
      } else animRaf = 0;
    };
    animRaf = requestAnimationFrame(step);
  }
  function syncCombatants(initiative) {
    const prevId = state.currentTurnId;
    const prevStarted = !!(state.initiative && state.initiative.started);
    state.initiative = initiative || { order: [], turn: 0 };
    /* N76: an ended map initiative heals a stale sheet lock before the next Attack click.
       A live fight stays with showTurn. A null payload is only the local placeholder and must not clear a real fight. */
    if (initiative && window.SSDNSTurn && typeof window.SSDNSTurn.inFight === 'function' && !window.SSDNSTurn.inFight(initiative)) {
      if (window.SSDNSActionPips && window.SSDNSActionPips.onTurn) window.SSDNSActionPips.onTurn(initiative);
      if (window.SSDNSTurnLock && window.SSDNSTurnLock.onTurn) window.SSDNSTurnLock.onTurn();
    }
    const order = state.initiative.order || [];
    const turn = state.initiative.turn || 0;
    state.currentTurnId = order[turn] ? order[turn].id : null;
    if (state.currentTurnId !== prevId || !!state.initiative.started !== prevStarted) {
      state.moveHover = null;
      if (state.moveConfirm) state.moveConfirm.pending = null;
      state.moveReachKey = '';
      /* First sync (map just opened) keeps a Move the player already turned on. A later turn change or the fight ending leaves Move mode. */
      const hadTurn = prevId != null || prevStarted;
      if (hadTurn) exitMoveMode('turn');
      if (prevStarted && !state.initiative.started) clearLocalAim();
      if (fightOn() && state.currentTurnId && state.currentTurnId !== prevId) {
        const T = window.SSDNSTurn;
        const cur = T && T.current ? T.current(state.initiative) : order[turn];
        const name = (cur && (cur.name || cur.id)) || 'Someone';
        const mine = role === 'player' && cur && cur.kind === 'player' && (cur.playerId === uid || cur.id === uid || cur.ownerUid === uid);
        showTurnPop(mine ? 'YOUR TURN' : (name + "'s turn"));
      }
    }
    if (state.currentTurnId !== prevId && state.rangeMoved) {
      const fresh = state.tokens.find(tok => tok && (tok.combatantId === state.currentTurnId || tok.id === state.currentTurnId || tok.ownerUid === state.currentTurnId));
      if (fresh) delete state.rangeMoved[fresh.id];
    }
    renderTurnStrip();
    renderActions();
    if (role === 'dm' && state.drawerOpen && state.currentTurnId && state.currentTurnId !== prevId) {
      state.pendingTarget = null;
      const t = state.tokens.find(tok => tok.combatantId === state.currentTurnId || tok.id === state.currentTurnId);
      if (t) { state.selected = t; state.selectedIds = [t.id]; openDrawer(t.id); }
    }
    /* N65: back on this combatant's turn, aim where they last attacked. Selection only. */
    if (state.currentTurnId !== prevId) restoreTurnAim();
    requestDraw();
  }
  function clearLocalAim() {
    state.playerTarget = "";
    state.rangeTargetId = NO_TARGET;
    state.rowTargets = {};
    if (role === "player" && host.setSheetTarget) host.setSheetTarget("");
    if (state.drawerOpen) { try { renderDrawer(); } catch (e) {} }
    try { renderActions(); } catch (e) {}
  }
  function dropLocalAim(ids) {
    const drop = {};
    (ids || []).forEach(id => { if (id) drop[String(id)] = 1; });
    let playerCleared = false;
    let rangeCleared = false;
    if (state.playerTarget && drop[String(state.playerTarget)]) { state.playerTarget = ""; playerCleared = true; }
    if (state.rangeTargetId && state.rangeTargetId !== NO_TARGET && drop[String(state.rangeTargetId)]) {
      state.rangeTargetId = NO_TARGET;
      rangeCleared = true;
    }
    if (state.rowTargets) {
      Object.keys(state.rowTargets).forEach(k => {
        if (drop[String(state.rowTargets[k])]) delete state.rowTargets[k];
      });
    }
    if (playerCleared && role === "player" && host.setSheetTarget) host.setSheetTarget("");
    if (playerCleared || rangeCleared) {
      if (state.drawerOpen) { try { renderDrawer(); } catch (e) {} }
      try { renderActions(); } catch (e) {}
    }
  }
  function myTurnRow(row) {
    return !!(row && row.kind === "player" && (row.playerId === uid || row.id === uid || row.ownerUid === uid));
  }
  function restoreTurnAim() {
    if (!state.initiative || !state.initiative.started || !state.currentTurnId) return;
    const order = state.initiative.order || [];
    const turn = state.initiative.turn || 0;
    const actor = order[turn];
    const aim = actor && actor.lastTargetId ? String(actor.lastTargetId) : "";
    if (!aim) return;
    const tok = tokenByRef(aim);
    if (!tok) return;
    if (role === "player") {
      if (!myTurnRow(actor)) return;
      state.playerTarget = aim;
      if (host.setSheetTarget) host.setSheetTarget(aim);
      try { renderActions(); } catch (e) {}
      return;
    }
    state.rangeTargetId = aim;
    if (state.drawerOpen) { try { renderDrawer(); } catch (e) {} }
  }
  /* Crowded DM strip: the face keeps the initials; the name shrinks to a short label (first word, or the
     first letters of a long single word). A trailing number stays, so Outlaw 1 and Outlaw 2 still differ. */
  function shortStripName(raw) {
    const text = String(raw || '').trim();
    if (text.length <= 10) return text;
    const m = text.match(/^(.*?)(\s+\d+)$/);
    const suffix = m ? m[2] : '';
    const base = (m ? m[1] : text).trim();
    const word = base.split(/\s+/)[0] || base;
    const short = word.length > 8 ? word.slice(0, 7) + '\u2026' : word;
    const out = (short + suffix).trim();
    return out.length < text.length ? out : (text.slice(0, 9) + '\u2026');
  }
  function renderTurnStrip() {
    let strip = q('turnStrip');
    if (!strip) {
      strip = document.createElement('div');
      strip.setAttribute('data-act', 'turnStrip');
      strip.className = 'ssm-turnstrip';
      el.appendChild(strip);
    }
    const order = (state.initiative && state.initiative.order) || [];
    const turn = (state.initiative && state.initiative.turn) || 0;
    const len = order.length || 1;
    /* 0.2.77: the DM keeps the strip with no fight running ("No fight running" + Roll Initiative);
       players still see it only while there is a turn order. */
    strip.hidden = !order.length && role !== 'dm';
    strip.innerHTML = '';
    strip.classList.toggle('is-idle', !order.length);
    strip.classList.remove('is-crowded');
    if (!order.length) {
      if (role === 'dm') {
        const idle = document.createElement('span');
        idle.className = 'ssm-strip-idle';
        idle.textContent = 'No fight running';
        strip.appendChild(idle);
        const roll = document.createElement('button');
        roll.type = 'button';
        roll.className = 'btn btn-primary btn-roll-init';
        roll.setAttribute('data-act', 'stripRollInit');
        roll.textContent = 'Roll Initiative';
        roll.addEventListener('click', () => emit('initiative:roll', {}));
        strip.appendChild(roll);
        appendStripChallenge(strip);
      }
      return;
    }
    /* Many combatants: only the chips scroll. Markers, Next, Undo last Next and End combat stay pinned
       on the right (they are siblings after the scroller, not inside it). Past about 6, DM chips shrink. */
    const chipCount = order.filter(c => role === 'dm' || !(c && c.mapHidden)).length;
    const crowded = role === 'dm' && chipCount > 6;
    strip.classList.toggle('is-crowded', crowded);
    const roundEl = document.createElement('b');
    roundEl.className = 'turn-round';
    roundEl.textContent = 'Round ' + (Number(state.initiative && state.initiative.round) || 1);
    strip.appendChild(roundEl);
    if (role === 'dm') {
      const cur = order[turn];
      const badge = document.createElement('b');
      badge.className = 'dm-turn-now';
      badge.textContent = (cur && (cur.name || cur.id)) || 'Turn';
      strip.appendChild(badge);
      const away = cur && tokenForRow(cur);
      if (away && !onViewedScene(away)) {
        const note = document.createElement('span');
        note.className = 'ssm-floor-note';
        note.setAttribute('data-act', 'floorNote');
        note.textContent = 'on ' + floorName(away.sceneId);
        strip.appendChild(note);
      }
    }
    const chips = document.createElement('div');
    chips.className = 'ssm-strip-chips';
    chips.setAttribute('data-act', 'stripChips');
    order.forEach((c, i) => {
      if (role !== 'dm' && c && c.mapHidden) return;
      const b = document.createElement('span');
      const friendly = c && (c.side === 'friendly' || c.side === 'ally');
      const side = c && c.kind === 'player' ? 'side-pc player' : (friendly ? 'side-ally' : (c && c.kind === 'enemy' ? 'side-enemy enemy' : 'side-pc player'));
      const dist = (i - turn + len) % len;
      const stateCls = i === turn ? ' current' : (dist > 0 && dist <= 2 ? ' ondeck' : ' later');
      b.className = 'turn-chip ' + side + stateCls;
      const raw = String((c && (c.name || c.id)) || '');
      const letters = raw.replace(/[^A-Za-z]/g, '');
      const initials = (letters.slice(0, 1) + (letters.length > 1 ? letters.slice(-1) : '')).toUpperCase() || '?';
      const shownName = crowded ? shortStripName(raw) : raw;
      if (shownName !== raw) b.title = raw;
      b.innerHTML = '<span class="chip-face">' + esc(initials) + '</span><span class="chip-name">' + esc(shownName) + '</span>';
      if (role === 'dm') {
        b.addEventListener('click', () => {
          const t = state.tokens.find(tok => tok.combatantId === c.id || tok.id === c.id);
          if (t) selectToken(t);
        });
      }
      chips.appendChild(b);
    });
    strip.appendChild(chips);
    if (role === 'player') {
      const read = document.createElement('button');
      read.type = 'button';
      read.className = 'ssm-move-readout tl-move';
      read.setAttribute('data-act', 'moveReadout');
      read.setAttribute('data-tl-movemode', '');
      read.setAttribute('aria-pressed', 'false');
      read.title = 'Move mode. Click to walk. Click again, Esc, or right-click to leave.';
      read.hidden = true;
      strip.appendChild(read);
    }
    if (role === 'dm') appendStripMarkers(strip); /* Turn UX on the map: the current player's markers, before Next */
    if (role === 'dm') {
      appendStripChallenge(strip);
      const next = document.createElement('button');
      next.type = 'button';
      next.className = 'btn btn-primary btn-next';
      next.setAttribute('data-act', 'stripNext');
      next.textContent = 'Next';
      next.addEventListener('click', () => emit('initiative:next', {}));
      strip.appendChild(next);
      const prev = document.createElement('button');
      prev.type = 'button';
      prev.className = 'btn sm';
      prev.setAttribute('data-act', 'stripUndoNext');
      prev.textContent = 'Undo last Next'; /* turn order PR 1: the DM page asks first and restores, never refreshes markers */
      prev.title = 'Undo the last Next (the DM page asks first)';
      prev.addEventListener('click', () => emit('initiative:prev', {}));
      strip.appendChild(prev);
      /* 0.2.77: End combat sits at the far end, set apart from Next / Previous; the DM page asks first. */
      const gap = document.createElement('span');
      gap.className = 'ssm-strip-gap';
      strip.appendChild(gap);
      const end = document.createElement('button');
      end.type = 'button';
      end.className = 'btn sm btn-end-combat';
      end.setAttribute('data-act', 'stripEndCombat');
      end.textContent = 'End combat';
      end.title = 'End the fight (asks first)';
      end.addEventListener('click', () => emit('initiative:end', {}));
      strip.appendChild(end);
    }
  }
  /* Turn UX on the map: markers for the combatant whose turn it is (DM page only; the host returns the same HTML as the
     DM card's marker row, and the DM page's own click handler edits them) */
  function appendStripChallenge(strip) {
    if (role !== 'dm' || !strip) return;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn sm ssm-challenge';
    b.setAttribute('data-act', 'stripChallenge');
    b.textContent = 'Challenge';
    b.title = 'Challenge picked players';
    b.addEventListener('click', () => emit('challenge:open', {}));
    strip.appendChild(b);
  }
  function appendStripMarkers(strip) {
    const marks = document.createElement('span');
    marks.className = 'ssm-strip-markers';
    marks.setAttribute('data-act', 'stripMarkers');
    strip.appendChild(marks);
    fillStripMarkers();
  }
  function fillStripMarkers() {
    const slot = q('stripMarkers');
    if (!slot) return;
    let html = '';
    if (role === 'dm' && state.currentTurnId && host.turnMarkers) {
      try { html = host.turnMarkers(state.currentTurnId) || ''; } catch (e) { html = ''; }
    }
    if (slot.innerHTML !== html) slot.innerHTML = html;
  }
  function renderActions() {
    if (role === 'player') { paintPlayerFight(); return; }
    const slot = q('actionSlot');
    if (!slot || !host.actions || !host.actions.get) return;
    const tokenId = state.selected ? state.selected.id : null;
    const list = host.actions.get({ role, uid, tokenId }) || [];
    slot.innerHTML = '';
    list.forEach(a => {
      const wrap = document.createElement('div');
      wrap.className = 'ssm-action';
      const b = document.createElement('button');
      b.textContent = a.label || a.id;
      b.disabled = a.enabled === false;
      if (a.title) b.title = a.title;
      b.addEventListener('click', () => {
        const ctx = { id: a.id, tokenId, targetId: tokenId };
        emit('action:run', ctx);
        const ret = host.actions.run ? host.actions.run(a.id, ctx) : null;
        Promise.resolve(ret).then(() => emit('action:done', ctx)).catch(err => emit('action:error', { id: a.id, error: String(err) }));
      });
      wrap.appendChild(b);
      const cyl = a.cylinder;
      if (cyl && cyl.cap) {
        const gun = document.createElement('button');
        gun.type = 'button';
        gun.className = 'ssm-cyl-btn';
        gun.title = 'Reload';
        gun.setAttribute('aria-label', (a.label || 'Gun') + ' cylinder ' + (cyl.loaded || 0) + '/' + cyl.cap);
        const flags = Array.isArray(cyl.chambers) ? cyl.chambers : null;
        for (let k = 0; k < Number(cyl.cap); k++) {
          const dot = document.createElement('span');
          const full = flags ? !!flags[k] : k < (Number(cyl.loaded) || 0);
          dot.className = 'chamber-dot' + (full ? ' full' : '');
          gun.appendChild(dot);
        }
        gun.addEventListener('click', (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          const id = 'reload:' + cyl.index;
          if (host.actions && host.actions.run) host.actions.run(id, { id: id, tokenId });
        });
        wrap.appendChild(gun);
      }
      slot.appendChild(wrap);
    });
  }

  // --- DM drawer (role === 'dm' only). Player create() never calls these. ---
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }
  function speedLabel(speed) {
    if (speed == null || speed === '') return '30 ft';
    const s = String(speed);
    return /ft/i.test(s) ? s : s + ' ft';
  }
  function condLabel(c) {
    if (c && typeof c === 'object') return c.name || c.label || '';
    return c == null ? '' : String(c);
  }
  function conditionNames() {
    const Cond = window.SSDNSConditions;
    const rows = Cond && typeof Cond.catalog === 'function' ? Cond.catalog() : null;
    const names = rows && rows.length ? rows.map(item => item && item.name).filter(Boolean) : ['Prone', 'Unconscious', 'Paralyzed', 'Poisoned', 'Stunned', 'Grappled', 'Frightened', 'Restrained'];
    return names.length ? names : ['Prone'];
  }
  function lookupCard(tokenId) {
    if (role !== 'dm' || typeof host.getCard !== 'function' || !tokenId) return null;
    const direct = host.getCard(tokenId);
    if (direct) return direct;
    const token = state.tokens.find(t => t.id === tokenId);
    const alt = token && (token.combatantId || token.sheetId || token.ownerUid);
    if (alt && alt !== tokenId) return host.getCard(alt) || null;
    return null;
  }
  function openDrawer(tokenId) {
    if (role !== 'dm') return;
    const same = state.drawerOpen && state.drawerTokenId === tokenId;
    state.drawerOpen = true;
    state.drawerTokenId = tokenId;
    if (!same) state.rangeTargetId = '';
    if (!same) emit('drawer:open', { tokenId, combatantId: tokenCombatant(tokenId) });
    /* map token guns: range rings start on the token's remembered weapon, not always the first (melee) one */
    if (!same) {
      const card0 = lookupCard(tokenId);
      const wid0 = card0 ? activeWeaponId(card0, tokenId) : '';
      if (wid0) state.rangeWeaponId = wid0;
    }
    renderDrawer();
  }
  function closeDrawer() {
    if (!state.drawerOpen) return;
    const id = state.drawerTokenId;
    state.drawerOpen = false;
    state.drawerTokenId = null;
    state.pendingTarget = null;
    const d = q('drawer');
    if (d) d.remove();
    el.classList.remove('ssm-token-dock', 'ssm-token-left', 'ssm-token-right', 'ssm-token-shut');
    reflowTokenDock();
    emit('drawer:close', { tokenId: id });
  }
  function spellFoldOpen(which) {
    try {
      const raw = localStorage.getItem('ssdns.spellFold');
      if (!raw) return false;
      const obj = JSON.parse(raw);
      return !!(obj && obj[which]);
    } catch (e) { return false; }
  }
  function rememberSpellFold(which, open) {
    let obj = {};
    try { obj = JSON.parse(localStorage.getItem('ssdns.spellFold') || '{}') || {}; } catch (e) { obj = {}; }
    obj[which] = !!open;
    try { localStorage.setItem('ssdns.spellFold', JSON.stringify(obj)); } catch (e) {}
  }
  function levelWord(level) {
    const n = Number(level);
    if (!isFinite(n) || n <= 0) return 'Cantrip';
    if (n === 1) return '1st';
    if (n === 2) return '2nd';
    if (n === 3) return '3rd';
    return n + 'th';
  }
  function spellLevelKey(s) {
    if (!s || s.level == null || s.level === '') return '';
    const n = Number(s.level);
    return isFinite(n) ? String(n) : '';
  }
  function groupedSpells(spells, render) {
    const list = (spells || []).filter(Boolean);
    if (!list.length) return '';
    const keys = [];
    list.forEach(s => {
      const k = spellLevelKey(s);
      if (keys.indexOf(k) < 0) keys.push(k);
    });
    if (keys.length < 2) return list.map(render).join('');
    keys.sort((a, b) => {
      if (a === '') return -1;
      if (b === '') return 1;
      return Number(a) - Number(b);
    });
    return keys.map(k => {
      const rows = list.filter(s => spellLevelKey(s) === k).map(render).join('');
      const head = k === '' ? '' : '<div class="ssm-spell-lv">' + esc(levelWord(k)) + '</div>';
      return head + rows;
    }).join('');
  }
  function spellsBlock(inner, count) {
    if (!inner) return '';
    const which = role === 'dm' ? 'dm' : 'player';
    const open = spellFoldOpen(which) ? ' open' : '';
    return '<details class="ssm-spells" data-act="spellFold" data-fold="' + which + '"' + open + '>' +
      '<summary>Spells (' + count + ')</summary>' + inner + '</details>';
  }
  function bindSpellFold(root) {
    if (!root) return;
    root.querySelectorAll('[data-act="spellFold"]').forEach(d => {
      d.addEventListener('toggle', () => rememberSpellFold(d.getAttribute('data-fold') || (role === 'dm' ? 'dm' : 'player'), d.open));
    });
  }
  function cleanWeaponName(text) {
    return String(text || '')
      .replace(/\s*[·\-–]\s*Attack\s*$/i, '')
      .replace(/\s*[·\-–]\s*Cast\s*$/i, '')
      .replace(/\s*-\s*Not sold\b/ig, '')
      .replace(/\s*-\s*[\d,]+\s*ES\b/ig, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
  function hitText(raw) {
    if (raw == null || raw === '') return '';
    const s = String(raw).trim();
    if (!s) return '';
    if (s.charAt(0) === '+' || s.charAt(0) === '-') return s;
    return '+' + s;
  }
  function attackLine(a) {
    const name = a.name || a.id || 'Attack';
    const hit = hitText(a.toHit);
    const dmg = a.damage ? String(a.damage).trim() : '';
    const ammo = a.ammo && a.ammo.cap ? '[' + (a.ammo.loaded != null ? a.ammo.loaded : 0) + '/' + a.ammo.cap + ']' : '';
    return [name, hit, dmg, ammo].filter(Boolean).join(' ');
  }
  function cardFromActions(list) {
    const attacks = [];
    const spells = [];
    const reload = {};
    const tr = {};
    (list || []).forEach(a => {
      if (!a || !a.id) return;
      if (String(a.id).indexOf('cast:') === 0) return;
      if (String(a.id).indexOf('reload:') === 0) { reload[String(a.id).slice(7)] = a.id; return; }
      if (String(a.id).indexOf('tr:') === 0) { tr[String(a.id).slice(3)] = a.id; return; }
      if (a.id === 'pact' || String(a.id).indexOf('spell:') === 0 || a.group === 'spell') {
        const name = cleanWeaponName(String(a.label || a.name || '').replace(/^Cast\s+/i, ''));
        if (!name || /^Melee \d+$/i.test(name)) return;
        spells.push({ id: a.id, name: name, level: a.level, kind: a.kind || '', damage: a.damage || '', toHit: a.toHit, dc: a.dc, enabled: a.enabled });
        return;
      }
      if (String(a.id).indexOf('gunroll:') === 0 || String(a.id).indexOf('melee:') === 0 || a.group === 'attack') {
        const name = cleanWeaponName(a.label || a.name || a.id);
        if (!name || /^Melee \d+$/i.test(name)) return;
        const ammo = a.cylinder && a.cylinder.cap ? { loaded: a.cylinder.loaded, cap: a.cylinder.cap, chambers: a.cylinder.chambers } : (a.ammo || null);
        attacks.push({
          id: a.id,
          name: name,
          toHit: a.toHit,
          damage: a.damage || '',
          ammo: ammo,
          action: a.action || '',
          weapon: a.weapon || '',
          ammoDisplay: a.ammoDisplay || '',
          group: a.group || '',
          tier: a.tier || '',
          scatter: !!a.scatter,
          jammed: !!a.jammed,
          dirty: !!a.dirty,
          fouled: !!a.fouled,
          ruined: !!(a.ruined || a.broken),
          broken: !!a.broken,
          exploded: !!a.exploded,
          misStreak: Number(a.misStreak) || 0,
          pendingD4: !!a.pendingD4,
          lockedChambers: a.lockedChambers || (a.ammo && a.ammo.locked) || [],
          mod: a.mod || '',
          muzzleloader: !!a.muzzleloader,
          reopenUsed: !!a.reopenUsed,
          feats: a.feats || [],
          gunIndex: a.gunIndex
        });
      }
    });
    attacks.forEach(a => {
      if (String(a.id).indexOf('gunroll:') !== 0) return;
      const idx = String(a.id).slice(8);
      if (reload[idx]) a.reloadId = reload[idx];
      else if (a.ammo && a.ammo.cap) a.reloadId = 'reload:' + idx;
      if (tr[idx]) a.trId = tr[idx];
    });
    return { attacks: attacks, spells: spells };
  }
  function playerTargetOptions() {
    let rows = [];
    if (typeof host.sheetTargets === 'function') {
      const pack = host.sheetTargets() || [];
      rows = Array.isArray(pack) ? pack : (pack.options || []);
    } else {
      const sel = document.getElementById('atkTarget');
      if (sel && sel.options && sel.options.length) {
        rows = Array.from(sel.options).map(o => ({ id: o.value, label: o.textContent || o.value, baseLabel: o.getAttribute('data-label') || '' }));
      } else {
        rows = (state.tokens || []).filter(t => t && !t.hidden && !(t.ownerUid && t.ownerUid === uid)).map(t => ({ id: t.id, label: t.name || t.label || t.id }));
      }
    }
    const options = [{ id: FREE_SHOT, label: 'Free shot' }, { id: '', label: 'No target' }];
    rows.forEach(o => {
      if (!o) return;
      const id = o.id != null ? String(o.id) : '';
      if (!id || id === FREE_SHOT || options.some(x => x.id === id)) return;
      /* fog-aware targeting: only what this player can see; past long range is listed but can't be picked */
      const seen = targetSight(id);
      if (seen && !seen.visible) return;
      const label = o.baseLabel || o.label || o.name || id;
      if (seen && seen.outOfRange) options.push({ id: id, label: label + ' — out of range, ' + (seen.feet != null ? seen.feet : '?') + ' ft', disabled: true });
      else options.push({ id: id, label: label });
    });
    return options;
  }
  function playerFightModel() {
    if (typeof host.ownCard === 'function') {
      try {
        const own = host.ownCard();
        if (own) return own;
      } catch (e) {}
    }
    const tokenId = state.selected ? state.selected.id : null;
    const list = host.actions && host.actions.get ? (host.actions.get({ role: role, uid: uid, tokenId: tokenId }) || []) : [];
    const built = cardFromActions(list);
    return { name: '', attacks: built.attacks, spells: built.spells };
  }
  function spellNameFromAct(id) {
    const rest = String(id || '').slice(6);
    const parts = rest.split(':');
    if (parts.length >= 2 && /^\d+$/.test(parts[0])) return parts.slice(1).join(':');
    return rest;
  }
  function mapActLabel(id) {
    id = String(id || '');
    if (id.indexOf('spell:') === 0) return spellNameFromAct(id) || 'Spell';
    if (id === 'pact') return 'Pact Shot';
    if (id.indexOf('offhand:') === 0) return 'Off-hand attack';
    if (id.indexOf('fan:') === 0) return 'Fan the Hammer';
    if (id.indexOf('reload:') === 0) return 'Reload';
    if (id.indexOf('tr:') === 0) return 'Tactical Reload';
    if (id.indexOf('unload:') === 0) return 'Unload';
    if (id.indexOf('reopen:') === 0) return 'Reopen chamber';
    return 'Attack';
  }
  /* Same costs as the sheet buttons. Reload uses SSDNSApp.reloadCost (action, Quick Reload bonus, or slow full turn).
     Tactical Reload is a bonus action. Unload and Reopen chamber are actions. */
  function mapActionCost(id) {
    id = String(id || '');
    if (id.indexOf('offhand:') === 0 || id.indexOf('fan:') === 0) return 'bonus';
    if (id.indexOf('gunroll:') === 0 || id.indexOf('melee:') === 0 || id === 'pact') return 'attack';
    if (id.indexOf('spell:') === 0) {
      const P = window.SSDNSActionPips;
      const name = spellNameFromAct(id);
      return (P && P.spellCost && P.spellCost(name)) || 'action';
    }
    const gun = id.match(/^(reload|tr|unload|reopen):(\d+)/);
    if (!gun) return '';
    if (gun[1] === 'tr') return 'bonus';
    if (gun[1] === 'unload' || gun[1] === 'reopen') return 'action';
    const App = window.SSDNSApp;
    const cost = App && App.reloadCost ? App.reloadCost(Number(gun[2])) : '';
    return cost || 'action';
  }
  /* N76: free-action (no live fight) fires Attack, Reload, and Unjam.
     A pip spent last fight must not hard-block, and a stale sheet inFight must not beat an ended map initiative.
     A placeholder {order:[], turn:0} with no started flag is not an end.
     A map initiative that has started still counts, even if the sheet has not caught up. */
  function fightLive() {
    const T = window.SSDNSTurn;
    const Lock = window.SSDNSTurnLock;
    const sheet = !!(Lock && Lock.inFight && Lock.inFight());
    const init = state.initiative;
    const hasStarted = !!(init && typeof init === 'object' && Object.prototype.hasOwnProperty.call(init, 'started'));
    if (hasStarted && init.started === false) return false;
    if (hasStarted && init.started === true && T && typeof T.inFight === 'function' && !T.inFight(init)) return false;
    if (hasStarted && T && typeof T.inFight === 'function' && T.inFight(init)) return true;
    return sheet;
  }
  /* Player map only. On your turn a spent Action, Bonus, or Reaction stops the roll.
     Off your turn, Turn Lock still says it isn't your turn; a spent Reaction stops an
     approved opportunity attack and a reaction spell. Reload is not an opportunity attack.
     Enemies are not gated here. Outside initiative, spent pips do not hard-block. */
  function playerMapGate(id, label) {
    if (role !== 'player') return '';
    const cost = mapActionCost(id);
    const P = window.SSDNSActionPips;
    const st = P && P.state ? P.state() : {};
    const Lock = window.SSDNSTurnLock;
    const inFight = fightLive();
    const mine = !!(Lock && Lock.myTurn && Lock.myTurn());
    const gear = /^(reload|tr|unload|reopen|clean|unjam):/.test(String(id || ''));
    /* N52: off your turn, during initiative, while the DM has not unlocked it.
       Gear and every other attack path stop here. Opportunity attacks and reaction spells stay open. */
    if (inFight && !mine && Lock && Lock.locked && Lock.locked()) {
      if (!gear && st.oaArmed && (cost === 'attack' || cost === 'action')) return P && P.blockMap ? P.blockMap('reaction', label || 'Opportunity attack') : '';
      if (cost === 'reaction') return P && P.blockMap ? P.blockMap('reaction', label || 'Reaction') : '';
      if (Lock.offTurnBlock) return Lock.offTurnBlock(cost === 'attack' ? 'attack' : 'gear');
      const msg = "It isn't your turn";
      toast(msg);
      return msg;
    }
    /* N76: free-action. Spent pips from the last fight must not hard-block Attack, Reload, or Unjam. */
    if (!inFight) return '';
    if (!cost || !P || !P.blockMap) return '';
    return P.blockMap(cost, label || '');
  }
  function itemByUid(itemUid) {
    const want = String(itemUid || '');
    let card = null;
    try { card = playerFightModel(); } catch (e) { card = null; }
    return ((card && card.items) || []).find(it => it && (String(it.uid || '') === want || String(it.id || '') === want)) || null;
  }
  function itemMapCost(item) {
    const raw = item && (item.actionCost || item.cost);
    const cost = raw == null || raw === '' ? 'action' : String(raw).toLowerCase();
    if (cost === 'free' || cost === 'none') return '';
    return cost;
  }
  function playerUseItem(itemUid) {
    const Items = window.SSDNSItems;
    if (!Items || !Items.useOnSheet) return;
    const item = itemByUid(itemUid);
    const label = (item && item.name) || 'Item';
    const Lock = window.SSDNSTurnLock;
    if (role === 'player' && Lock && Lock.offTurnBlock && Lock.offTurnBlock('gear')) return;
    const cost = role === 'player' ? itemMapCost(item) : '';
    if (cost && window.SSDNSActionPips && window.SSDNSActionPips.blockMap && window.SSDNSActionPips.blockMap(cost, label)) return;
    const plan = Items.useOnSheet(itemUid);
    const finish = (res) => {
      if (!res || res.ok === false) return;
      if (role === 'player' && cost && window.SSDNSActionPips && window.SSDNSActionPips.spend) window.SSDNSActionPips.spend(cost, label);
    };
    if (plan && typeof plan.then === 'function') plan.then(finish);
    else finish(plan);
  }
  function runPlayer(id, extra) {
    if (!id) return;
    extra = extra || {};
    const tokenId = state.selected ? state.selected.id : null;
    const targetId = extra.targetId != null ? extra.targetId : ((state.rowTargets && state.rowTargets[id]) || state.playerTarget || '');
    /* fog-aware targeting: the picked attack becomes the weapon the Target list and the grey wash measure */
    const gunN = String(id).match(/^(?:gunroll|fan|offhand):(\d+)/);
    const pickIds = gunN ? ['gun:' + gunN[1], id] : [id];
    const choiceList = (() => { try { return currentRangeChoices() || []; } catch (e) { return []; } })();
    const pickHit = pickIds.find(x => choiceList.some(c => c.id === x));
    if (pickHit && pickHit !== state.rangeWeaponId) { state.rangeWeaponId = pickHit; requestDraw(); }
    const seen = targetId && targetId !== FREE_SHOT ? targetSight(targetId) : null;
    if (seen && !seen.visible) { toast("You can't see that target"); return; }
    if (targetId === FREE_SHOT) {
      if (window.SSDNSRangeRings && window.SSDNSRangeRings.clear) window.SSDNSRangeRings.clear();
    } else if (String(id).indexOf('gunroll:') === 0 || String(id).indexOf('melee:') === 0 || String(id).indexOf('offhand:') === 0 || String(id).indexOf('fan:') === 0 || String(id).indexOf('spell:') === 0 || id === 'pact') {
      const card = playerFightModel();
      const attack = ((card && card.attacks) || []).concat((card && card.spells) || []).find(a => a && a.id === id);
      const verdict = armRange(attack || { id: id }, targetId, uid);
      if (verdict && verdict.blocked) {
        if (window.SSDNSRangeRings && window.SSDNSRangeRings.clear) window.SSDNSRangeRings.clear();
        toast(verdict.button || 'Out of range');
        return;
      }
    }
    if (playerMapGate(id, mapActLabel(id))) return;
    state.playerTarget = targetId;
    const ctx = { id: id, tokenId: tokenId, targetId: targetId };
    if (extra.chamber != null && extra.chamber !== '') ctx.chamber = extra.chamber;
    if (host.setSheetTarget) host.setSheetTarget(targetId);
    emit('action:run', ctx);
    const ret = host.actions && host.actions.run ? host.actions.run(id, ctx) : null;
    Promise.resolve(ret).then(() => {
      emit('action:done', ctx);
      paintPlayerFight();
    }).catch(err => emit('action:error', { id: id, error: String(err) }));
  }
  function cleanActId(a) {
    const id = String(a && a.id || '');
    if (id.indexOf('gunroll:') === 0) return 'clean:' + id.slice(8);
    if (a && a.gunIndex != null && a.gunIndex !== '') return 'clean:' + a.gunIndex;
    return '';
  }
  function cleanControl(a, act) {
    const M = window.SSDNSMisfire;
    if (!a || !M || typeof M.cleanOptions !== 'function') return '';
    const ammo = a.ammo || {};
    const gun = {
      dirty: !!(a.dirty || ammo.dirty),
      fouled: !!(a.fouled || ammo.fouled),
      ruined: !!(a.ruined || a.broken || ammo.ruined || ammo.broken),
      broken: !!(a.broken || ammo.broken),
      jammed: !!(a.jammed || ammo.jammed),
      misStreak: Number(a.misStreak || ammo.misStreak || 0),
      pendingD4: !!(a.pendingD4 || ammo.pendingD4)
    };
    const opts = M.cleanOptions(gun);
    if (!opts.length) return '';
    const dirtyKit = opts.some((o) => o.id === 'dirty-kit');
    const label = dirtyKit ? 'Clean 10 min' : 'Clean';
    const title = dirtyKit ? ' title="Clean 10 min + kit/tools → Clear Dirty when the gun is Dirty. Fouled is separate."' : '';
    let idAttr = '';
    if (act === 'playerClean') {
      const cid = cleanActId(a);
      if (!cid) return '';
      idAttr = ' data-id="' + esc(cid) + '"';
    } else {
      idAttr = ' data-wid="' + esc(a.id || '') + '"';
    }
    return '<button type="button" data-act="' + act + '"' + idAttr + title + (gun.pendingD4 ? ' disabled' : '') + '>' + label + '</button>';
  }
  function gunFlags(a) {
    const ammo = (a && a.ammo) || {};
    return {
      dirty: !!(a && (a.dirty || ammo.dirty)),
      fouled: !!(a && (a.fouled || ammo.fouled)),
      ruined: !!(a && (a.ruined || a.broken || ammo.ruined || ammo.broken)),
      broken: !!(a && (a.broken || ammo.broken)),
      jammed: !!(a && (a.jammed || ammo.jammed)),
      pendingD4: !!(a && (a.pendingD4 || ammo.pendingD4)),
      mod: (a && a.mod) || '',
      weapon: (a && a.weapon) || '',
      name: (a && a.name) || '',
      feats: (a && a.feats) || [],
      muzzleloader: !!(a && a.muzzleloader),
      properties: (a && a.properties) || '',
      rugged: !!(a && a.rugged)
    };
  }
  function lockList(a) {
    if (!a) return [];
    if (Array.isArray(a.lockedChambers)) return a.lockedChambers;
    if (a.ammo && Array.isArray(a.ammo.locked)) return a.ammo.locked;
    return [];
  }
  function crossClass(a) {
    const ammo = (a && a.ammo) || {};
    const on = !!(a && (a.ruined || a.broken || a.exploded || a.wrecked || ammo.ruined || ammo.broken || ammo.exploded));
    return on ? " gun-x" : "";
  }
  function lockupMark(a) {
    const n = lockList(a).length;
    const checked = n > 0 ? ' checked' : '';
    return '<label class="ssm-lockup"><input type="checkbox" disabled' + checked + ' aria-label="Locked up"> LOCKED UP ×' + n + '</label>';
  }
  function sideButton(a, act, idPrefix, label) {
    const gi = gunIndexOf(a);
    let idAttr = '';
    if (act.indexOf('player') === 0) {
      if (gi === '') return '';
      idAttr = ' data-id="' + esc(idPrefix + ':' + gi) + '"';
    } else {
      idAttr = ' data-wid="' + esc(a.id || '') + '" data-gun="' + esc(gi) + '"';
    }
    return '<button type="button" data-act="' + act + '"' + idAttr + '>' + esc(label) + '</button>';
  }
  function unjamControl(a, act) {
    const gun = gunFlags(a);
    if (!gun.jammed || gun.fouled || gun.ruined) return '';
    const M = window.SSDNSMisfire;
    const free = M && M.unjamIsFree && M.unjamIsFree(gun);
    return sideButton(a, act, 'unjam', free ? 'Unjam (free action)' : 'Unjam (bonus action)');
  }
  function npcUnjam(a) {
    const gun = gunFlags(a);
    if (!gun.jammed || gun.fouled || gun.ruined) return '';
    return sideButton(a, 'rowUnjam', 'unjam', 'Unjam (free · DM)');
  }
  function reopenControl(a, act) {
    if (!a || !a.muzzleloader || !lockList(a).length) return '';
    const used = !!a.reopenUsed;
    return sideButton(a, act, 'reopen', used ? 'Reopen chamber (used)' : 'Reopen chamber');
  }
  /* Mech PR A (M2): the DM reopens a locked chamber on an enemy / NPC gun. Free, no feat needed (DM tool). */
  function npcReopen(a) {
    const n = lockList(a).length;
    if (!a || !n) return '';
    return sideButton(a, 'rowReopen', 'reopen', 'Reopen chamber (DM) · ' + n + ' locked');
  }
  /* Mech PR A (M4): the DM adds rounds to an enemy / NPC gun. Silent: no chat or log line. */
  function npcAddRounds(a) {
    if (!a || !a.ammo || !a.ammo.cap) return '';
    return '<button type="button" data-act="rowAddRounds" data-wid="' + esc(a.id || '') + '">Add rounds</button>';
  }
  /* B9: DM Jam. Hidden once the gun is already jammed (Unjam shows instead). Never a Dirty control. */
  function npcJam(a) {
    const gun = gunFlags(a);
    if (!a || gun.jammed || gun.fouled || gun.ruined) return '';
    if (!(a.ammo && a.ammo.cap) && (a.misfire == null || a.misfire === '')) return '';
    return sideButton(a, 'rowJam', 'jam', 'Jam');
  }
  /* B9: DM Lock chamber. The picked hole shows X and will not fire. Reopen clears it. */
  function npcLock(a) {
    const cap = a && a.ammo ? (Number(a.ammo.cap) || 0) : 0;
    if (!cap) return '';
    const locks = lockList(a);
    if (locks.length >= cap) return '';
    let opts = '';
    for (let k = 0; k < cap; k++) {
      if (locks.some(n => Number(n) === k)) continue;
      opts += '<option value="' + k + '">Chamber ' + (k + 1) + '</option>';
    }
    return '<label class="ssm-lockpick">Lock <select data-act="lockPick" data-wid="' + esc(a.id || '') + '" aria-label="Chamber to lock">' + opts + '</select></label>' +
      sideButton(a, 'rowLock', 'lock', 'Lock chamber');
  }
  /* map token guns (Jessey 2026-10-20 9:21 PM): Misfire badge, same box as the player gun card's "MISFIRE 1–4". */
  function misfireBadge(a) {
    const raw = a && a.misfire != null && a.misfire !== '' ? String(a.misfire) : '';
    if (!raw) return '';
    const n = Number(raw);
    const text = isFinite(n) && n > 1 ? '1–' + n : raw;
    const streak = Number(a.misStreak) || 0;
    return '<span class="ssm-mf" data-act="mfBadge" title="Misfire on a natural ' + esc(text) + '">Misfire <b>' + esc(text) + '</b>' +
      (streak ? ' · streak ' + esc(streak) : '') + '</span>';
  }
  function jamBadge(a) {
    const g = gunFlags(a);
    if (g.ruined) return '<span class="ssm-gunflag bad">Ruined</span>';
    if (g.fouled) return '<span class="ssm-gunflag bad">Fouled</span>';
    if (g.jammed) return '<span class="ssm-gunflag bad" data-act="jamBadge">Jammed</span>';
    if (g.dirty) return '<span class="ssm-gunflag">Dirty</span>';
    return '';
  }
  /* The token's weapon: the one picked on this card this session, else the one it last used (card.lastWeaponId,
     kept by the DMCC on the fight row), else the old default (the first weapon). */
  function activeWeaponId(card, tokenId) {
    const list = (card && card.attacks) || [];
    const has = (id) => !!id && list.some(a => a && String(a.id) === String(id));
    const picked = state.tokenWeapon && state.tokenWeapon[tokenId];
    if (has(picked)) return String(picked);
    if (has(card && card.lastWeaponId)) return String(card.lastWeaponId);
    return list[0] ? String(list[0].id) : '';
  }
  function noteWeapon(tokenId, wid) {
    if (!tokenId || !wid) return;
    state.tokenWeapon = state.tokenWeapon || {};
    state.tokenWeapon[tokenId] = String(wid);
  }
  function gunIndexOf(a) {
    if (a && a.gunIndex != null && a.gunIndex !== '') return String(a.gunIndex);
    const id = String(a && a.id || '');
    if (id.indexOf('gunroll:') === 0) return id.slice(8);
    return '';
  }
  function rememberGun(el, field, value) {
    const key = (el && (el.getAttribute('data-wid') || el.getAttribute('data-gun'))) || '';
    if (!key) return;
    state.gunUi = state.gunUi || {};
    state.gunUi[key] = state.gunUi[key] || {};
    state.gunUi[key][field] = value;
  }
  function recalled(a, field, fallback) {
    const key = String((a && a.id) || gunIndexOf(a) || '');
    const bag = state.gunUi && state.gunUi[key];
    if (bag && bag[field] != null && bag[field] !== '') return bag[field];
    return fallback || '';
  }
  function poolSelect(a, act) {
    const gi = gunIndexOf(a);
    const pools = (a && a.pools) || [];
    const cur = a && a.ammoPool != null ? String(a.ammoPool) : '';
    let opts = '';
    if (!pools.length) opts = '<option value="">No matching ammo</option>';
    else pools.forEach(p => {
      const v = String(p.idx);
      opts += '<option value="' + esc(v) + '"' + (v === cur ? ' selected' : '') + '>' + esc(p.label || v) + '</option>';
    });
    return '<label class="ssm-pool">Ammo <select data-act="' + act + '" data-gun="' + esc(gi) + '" data-wid="' + esc(a.id || '') + '" aria-label="Ammo for this gun">' + opts + '</select></label>';
  }
  function modeChecks(a, advAct, disAct) {
    const mode = a && (a.attackMode === 'adv' || a.attackMode === 'dis') ? a.attackMode : '';
    const gi = gunIndexOf(a);
    return '<label class="ssm-mode"><input type="checkbox" data-act="' + advAct + '" data-gun="' + esc(gi) + '" data-wid="' + esc(a.id || '') + '"' + (mode === 'adv' ? ' checked' : '') + '> Adv</label>' +
      '<label class="ssm-mode"><input type="checkbox" data-act="' + disAct + '" data-gun="' + esc(gi) + '" data-wid="' + esc(a.id || '') + '"' + (mode === 'dis' ? ' checked' : '') + '> Dis</label>';
  }
  function loadedHexNames(a) {
    const flags = a && a.ammo && Array.isArray(a.ammo.chambers) ? a.ammo.chambers : [];
    const names = [];
    flags.forEach(raw => {
      const s = String(raw || '');
      if (s.indexOf('k:hex:') !== 0) return;
      const p = s.split(':');
      if (p.length < 6 || !p[5]) return;
      let name = p.slice(5).join(':');
      try { name = decodeURIComponent(name); } catch (e) { /* keep the raw name */ }
      if (name) names.push(name);
    });
    return names;
  }
  function hexCastControl(a, prefix) {
    if (!a || a.calling !== 'hexslinger' || !a.caster) return '';
    const gi = gunIndexOf(a);
    const spells = a.castSpells || [];
    const loadedNames = loadedHexNames(a);
    let picked = recalled(a, 'spell', '');
    if (!picked && prefix === 'player') {
      const gear = document.querySelector('[data-castspell="' + gi + '"]');
      picked = gear && gear.value || '';
    }
    if (picked && spells.length && !spells.some(s => s && s.value === picked)) picked = '';
    if (!picked && spells[0]) picked = spells[0].value;
    let spellOpts = spells.length ? '' : '<option value="">No spells on this sheet</option>';
    spells.forEach(s => {
      const v = s.value || '';
      spellOpts += '<option value="' + esc(v) + '"' + (v === picked ? ' selected' : '') + '>' + esc(s.label || s.name || v) + '</option>';
    });
    const chosen = spells.filter(s => s && s.value === picked)[0] || null;
    const slots = (chosen && chosen.slots) || [];
    let slotLv = recalled(a, 'slot', '');
    if (!slotLv && prefix === 'player') {
      const gearSlot = document.querySelector('[data-castslot="' + gi + '"]');
      slotLv = gearSlot && gearSlot.value || '';
    }
    if (slotLv && slots.length && !slots.some(s => String(s.value) === String(slotLv))) slotLv = '';
    if (!slotLv && slots[0]) slotLv = String(slots[0].value);
    let slotOpts = '';
    slots.forEach(s => {
      const v = String(s.value);
      slotOpts += '<option value="' + esc(v) + '"' + (v === String(slotLv) ? ' selected' : '') + '>' + esc(s.label || v) + '</option>';
    });
    let hexLv = recalled(a, 'hex', '1');
    let lvl = '';
    for (let n = 1; n <= 9; n++) {
      const suf = n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th';
      lvl += '<option value="' + n + '"' + (String(hexLv) === String(n) ? ' selected' : '') + '>' + n + suf + '</option>';
    }
    const slotHidden = slots.length ? '' : ' hidden';
    const nameLine = loadedNames.length ? '<span class="ssm-hexnames">Loaded: ' + esc(loadedNames.join(', ')) + '</span>' : '';
    return nameLine + '<span class="ssm-hex" data-gun="' + esc(gi) + '">' +
      '<select data-act="' + prefix + 'HexLvl" data-gun="' + esc(gi) + '" data-wid="' + esc(a.id || '') + '" aria-label="Hex lead shell level">' + lvl + '</select>' +
      '<button type="button" data-act="' + prefix + 'Hex" data-gun="' + esc(gi) + '" data-wid="' + esc(a.id || '') + '">+ Hex shell</button>' +
      '<select data-act="' + prefix + 'CastSpell" data-gun="' + esc(gi) + '" data-wid="' + esc(a.id || '') + '" aria-label="Spell to cast through this gun">' + spellOpts + '</select>' +
      '<select data-act="' + prefix + 'CastSlot" data-gun="' + esc(gi) + '" data-wid="' + esc(a.id || '') + '" aria-label="Shell or slot level"' + slotHidden + '>' + slotOpts + '</select>' +
      '<button type="button" data-act="' + prefix + 'Cast" data-gun="' + esc(gi) + '" data-wid="' + esc(a.id || '') + '">Cast through gun</button>' +
      '</span>';
  }
  function gunExtras(a, side) {
    const gi = gunIndexOf(a);
    const unload = side === 'player' && ((a && a.reloadId) || (a && a.ammo && a.ammo.cap))
      ? '<button type="button" data-act="playerUnload" data-id="unload:' + esc(gi) + '">Unload</button>'
      : '';
    const npcUnload = side === 'npc' && a && a.ammo && a.ammo.cap
      ? '<button type="button" data-act="rowUnload" data-wid="' + esc(a.id || '') + '">Unload</button>'
      : '';
    if (side === 'npc') {
      const npcTr = a && a.tr
        ? '<button type="button" data-act="rowTr" data-wid="' + esc(a.id || '') + '" data-gun="' + esc(gi) + '">TR</button>'
        : '';
      return npcUnload + npcTr + modeChecks(a, 'rowAdv', 'rowDis');
    }
    const tr = side === 'row' && a && a.tr
      ? '<button type="button" data-act="rowTr" data-wid="' + esc(a.id || '') + '" data-gun="' + esc(gi) + '">TR</button>'
      : '';
    const pools = poolSelect(a, side === 'player' ? 'playerPool' : 'rowPool');
    const modes = modeChecks(a, side === 'player' ? 'playerAdv' : 'rowAdv', side === 'player' ? 'playerDis' : 'rowDis');
    const hex = hexCastControl(a, side === 'player' ? 'player' : 'row');
    return unload + tr + pools + modes + hex;
  }
  function playerCylinderRow(a, targetHtml) {
    const cap = a.ammo ? (Number(a.ammo.cap) || 0) : 0;
    const loaded = a.ammo ? (Number(a.ammo.loaded) || 0) : 0;
    const flags = a.ammo && Array.isArray(a.ammo.chambers) ? a.ammo.chambers : null;
    const spareN = a.spare != null && a.spare !== '' ? a.spare : (a.ammo && a.ammo.spare != null ? a.ammo.spare : null);
    const reloadLabel = 'Reload' + (spareN != null && spareN !== '' ? ' · ' + spareN : '');
    const reload = a.reloadId ? '<button type="button" data-act="playerReload" data-id="' + esc(a.reloadId) + '">' + esc(reloadLabel) + '</button>' : '';
    const tr = a.trId ? '<button type="button" data-act="playerTr" data-id="' + esc(a.trId) + '">TR</button>' : '';
    const lockup = lockupMark(a);
    const clean = cleanControl(a, 'playerClean');
    const unjam = unjamControl(a, 'playerUnjam');
    const reopen = reopenControl(a, 'playerReopen');
    const extras = gunExtras(a, 'player');
    const tube = window.SSDNSAmmoDisplay && window.SSDNSAmmoDisplay.kind && window.SSDNSAmmoDisplay.kind({
      action: a.action || '', name: a.name || '', weapon: a.weapon || '', group: a.group || '', ammo: a.ammoName || '', ammoDisplay: a.ammoDisplay || ''
    }) === 'tube';
    const cycle = tube ? '<button type="button" data-act="playerCycle" data-gun="' + esc(gunIndexOf(a)) + '" title="Cycle (free): eject the chambered round onto the ground and chamber the next. Not back into the belt.">Cycle</button>' : '';
    const select = '<select data-act="cylTarget" aria-label="Target">' + targetHtml + '</select>';
    const graphic = cap && window.SSDNSAmmoDisplay && window.SSDNSAmmoDisplay.enabled();
    if (graphic) {
      const picture = window.SSDNSAmmoDisplay.html({
        name: a.name || '',
        action: a.action || '',
        weapon: a.weapon || '',
        ammoDisplay: a.ammoDisplay || '',
        group: a.group || '',
        tier: a.tier || '',
        ammo: a.ammoName || '',
        scatter: !!a.scatter,
        cap: cap,
        loaded: loaded,
        chambers: flags || undefined,
        jammed: !!a.jammed,
        locked: lockList(a),
        size: 'drawer',
        attr: 'data-act="playerChamber" data-wid="' + esc(a.id) + '"',
        attrs: function (k) { return { 'data-k': String(k) }; }
      });
      return '<div class="cylinder-row cylinder-graphic' + crossClass(a) + '"><span class="cyl-name">' + esc(a.name || 'Gun') + '</span>' + picture +
        '<span class="ssm-rounds">' + loaded + '/' + cap + '</span>' + select + lockup + reload + tr + cycle + clean + unjam + reopen + extras + '</div>';
    }
    let dots = '';
    const locks = lockList(a);
    const spinKind = window.SSDNSAmmoDisplay && window.SSDNSAmmoDisplay.spins && window.SSDNSAmmoDisplay.spins({
      action: a.action || '', name: a.name || '', weapon: a.weapon || '', group: a.group || '', ammo: a.ammoName || ''
    });
    for (let k = 0; k < cap; k++) {
      const locked = locks.some(n => Number(n) === k);
      const full = !locked && (flags ? !!flags[k] : k < loaded);
      const act = spinKind && k > 0 ? 'playerSpin' : 'playerChamber';
      const label = spinKind && k > 0 ? ('Spin chamber ' + (k + 1) + ' under the hammer') : ((locked ? 'Locked chamber ' : 'Chamber ') + (k + 1) + (spinKind && k === 0 ? ', under the hammer' : ''));
      dots += '<button type="button" class="chamber-dot' + (locked ? ' locked' : (full ? ' full' : '')) + (spinKind && k === 0 ? ' hammer' : '') + '" data-act="' + act + '" data-wid="' + esc(a.id) + '" data-k="' + k + '" aria-label="' + label + '">' + (locked ? 'X' : '') + '</button>';
    }
    const dotsHtml = cap ? '<span class="chamber-dots">' + dots + '</span>' : '';
    const rounds = cap ? '<span class="ssm-rounds">' + loaded + '/' + cap + '</span>' : '';
    return '<div class="cylinder-row' + crossClass(a) + '"><span class="cyl-name">' + esc(a.name || 'Gun') + '</span>' + dotsHtml + rounds + select + lockup + reload + tr + cycle + clean + unjam + reopen + extras + '</div>';
  }
  function paintPlayerFight() {
    const slot = q('actionSlot');
    if (!slot) return;
    const card = playerFightModel();
    const nameEl = q('playerName');
    if (nameEl && card.name) nameEl.textContent = card.name;
    const dockLabel = q('playerDockLabel');
    if (dockLabel && card.name) dockLabel.textContent = card.name;
    paintAddMine();
    paintRoleBadge();
    const stats = q('playerStats');
    if (stats) {
      const hp = card.hp || {};
      const has = card.ac != null || hp.cur != null || hp.max != null || card.speed != null;
      const maxHp = Number(hp.max);
      const curHp = Number(hp.cur);
      const hpPct = isFinite(maxHp) && maxHp > 0 && isFinite(curHp) ? Math.max(0, Math.min(100, (curHp / maxHp) * 100)) : null;
      const line = has
        ? '<div>AC ' + esc(card.ac != null ? card.ac : '—') + ' · HP ' + esc(hp.cur != null ? hp.cur : '—') + '/' + esc(hp.max != null ? hp.max : '—') +
          (hp.temp ? ' (+' + esc(hp.temp) + ')' : '') + ' · ' + esc(speedLabel(card.speed)) + '</div>'
        : '';
      const bar = hpPct == null ? '' : '<div class="ssm-hpbar" role="meter" aria-label="HP" aria-valuenow="' + esc(curHp) + '" aria-valuemax="' + esc(maxHp) + '"><span style="width:' + hpPct + '%"></span></div>';
      stats.innerHTML = line + bar;
    }
    const targetHtml = playerTargetOptions().map(o => {
      const on = String(o.id) === String(state.playerTarget || '') ? ' selected' : '';
      const off = o.disabled ? ' disabled' : '';
      return '<option value="' + esc(o.id) + '"' + (o.disabled ? off : on) + '>' + esc(o.label || 'No target') + '</option>';
    }).join('');
    const attacks = (card.attacks || []).map(a => {
      const rowTarget = (state.rowTargets && state.rowTargets[a.id]) || state.playerTarget || '';
      const verdict = rangeButtonNote(a, rowTarget, uid);
      let text = attackLine(a);
      let off = '';
      if (verdict && verdict.blocked) { text = verdict.button || 'Out of range'; off = ' disabled'; }
      else if (verdict && verdict.button) text = attackLine(a) + ' · ' + verdict.button;
      if (a.enabled === false) off = ' disabled'; /* 0.3.73: e.g. Fan before a pistol attack this turn */
      const tip = a.title ? ' title="' + esc(a.title) + '"' : '';
      if (a.arm) return '<button type="button" class="ssm-atk ssm-arm' + (a.armed ? ' on' : '') + '" data-act="playerAttack" data-id="' + esc(a.id) + '" aria-pressed="' + (a.armed ? 'true' : 'false') + '"' + (a.enabled === false ? ' disabled' : '') + tip + '>' + esc(a.name || a.id) + '</button>';
      return '<button type="button" class="ssm-atk' + (a.fan ? ' ssm-fan' : '') + '" data-act="playerAttack" data-id="' + esc(a.id) + '"' + off + tip + '>' + esc(text) + disMark(verdict) + '</button>';
    }).join('');
    const cylinders = (card.attacks || []).filter(a => (a.ammo && a.ammo.cap) || a.reloadId || a.trId).map(a => {
      const chosen = (state.rowTargets && (state.rowTargets[a.id] || state.rowTargets[a.reloadId])) || state.playerTarget || '';
      const html = playerTargetOptions().map(o => {
        const on = String(o.id) === String(chosen) ? ' selected' : '';
      const off = o.disabled ? ' disabled' : '';
        return '<option value="' + esc(o.id) + '"' + (o.disabled ? off : on) + '>' + esc(o.label || 'No target') + '</option>';
      }).join('');
      return playerCylinderRow(a, html);
    }).join('');
    const spellButtons = groupedSpells(card.spells || [], s => {
      const spellTarget = (state.rowTargets && state.rowTargets[s.id]) || state.playerTarget || '';
      const verdict = rangeButtonNote(s, spellTarget, uid);
      const meta = [
        s.kind === 'save' ? 'save' : (s.kind === 'attack' ? 'attack' : (s.kind && s.kind !== 'none' ? s.kind : '')),
        s.dc !== '' && s.dc != null && s.kind === 'save' ? 'DC ' + s.dc : '',
        s.toHit !== '' && s.toHit != null && s.kind === 'attack' ? '+' + s.toHit : '',
        s.damage || ''
      ].filter(Boolean).join(' · ');
      let off = '';
      let extra = '';
      if (verdict && verdict.blocked) { extra = ' · ' + (verdict.button || 'out of range'); off = ' disabled'; }
      else if (verdict && verdict.button) extra = ' · ' + verdict.button;
      if (s.enabled === false) off = ' disabled'; /* B7: iron not in hand keeps Pact Shot visible but disabled */
      return '<button type="button" class="ssm-atk" data-act="playerSpell" data-id="' + esc(s.id) + '"' + off + '>' +
        esc(s.name || s.id) + (s.level != null && s.level !== '' ? ' (L' + esc(s.level) + ')' : '') + (meta ? ' · ' + esc(meta) : '') + esc(extra) + disMark(verdict) + '</button>';
    });
    const spells = spellsBlock(spellButtons, (card.spells || []).length);
    const itemRows = window.SSDNSItems && card.items && card.items.length
      ? '<div class="ssm-section">Items</div>' + window.SSDNSItems.drawerRows(card.items, { name: card.name || '' })
      : '';
    slot.innerHTML =
      (attacks ? '<div class="ssm-section">Attacks</div>' + attacks : '') +
      (cylinders ? '<div class="ssm-section">Cylinder</div>' + cylinders : '') +
      spells +
      itemRows;
    bindSpellFold(slot);
    slot.querySelectorAll('[data-act="useItem"]').forEach(b => {
      b.addEventListener('click', () => playerUseItem(b.getAttribute('data-uid')));
    });
    slot.querySelectorAll('[data-act="playerAttack"], [data-act="playerSpell"], [data-act="playerReload"], [data-act="playerTr"], [data-act="playerClean"], [data-act="playerUnjam"], [data-act="playerReopen"], [data-act="playerUnload"]').forEach(b => {
      b.addEventListener('click', () => runPlayer(b.getAttribute('data-id') || b.getAttribute('data-wid')));
    });
    const appGun = () => window.SSDNSApp || null;
    slot.querySelectorAll('[data-act="playerPool"]').forEach(sel => {
      sel.addEventListener('change', () => {
        const app = appGun();
        if (app && app.setAmmoPool) app.setAmmoPool(Number(sel.getAttribute('data-gun')), sel.value);
        paintPlayerFight();
      });
    });
    const bindMode = (box, mode) => {
      box.addEventListener('change', () => {
        const app = appGun();
        const on = box.checked ? mode : '';
        if (app && app.setAttackMode) app.setAttackMode(Number(box.getAttribute('data-gun')), on);
        paintPlayerFight();
      });
    };
    slot.querySelectorAll('[data-act="playerAdv"]').forEach(b => bindMode(b, 'adv'));
    slot.querySelectorAll('[data-act="playerDis"]').forEach(b => bindMode(b, 'dis'));
    slot.querySelectorAll('[data-act="playerHexLvl"]').forEach(sel => {
      sel.addEventListener('change', () => rememberGun(sel, 'hex', sel.value));
    });
    slot.querySelectorAll('[data-act="playerHex"]').forEach(b => {
      b.addEventListener('click', () => {
        const gi = b.getAttribute('data-gun');
        const lvl = slot.querySelector('[data-act="playerHexLvl"][data-gun="' + gi + '"]');
        const spell = slot.querySelector('[data-act="playerCastSpell"][data-gun="' + gi + '"]');
        const slotSel = slot.querySelector('[data-act="playerCastSlot"][data-gun="' + gi + '"]');
        const spellVal = spell && spell.value || '';
        const spellLv = parseInt(String(spellVal).split(':')[0], 10) || 0;
        const hexLv = parseInt(lvl && lvl.value, 10) || 1;
        const castLv = parseInt(slotSel && slotSel.value, 10) || 0;
        const use = spellLv > 0 ? Math.max(spellLv, hexLv >= spellLv ? hexLv : 0, castLv >= spellLv ? castLv : 0) : hexLv;
        const app = appGun();
        if (app && app.loadHexAt) app.loadHexAt(Number(gi), use, spellVal);
        paintPlayerFight();
      });
    });
    slot.querySelectorAll('[data-act="playerCastSpell"], [data-act="playerCastSlot"]').forEach(sel => {
      sel.addEventListener('change', () => {
        rememberGun(sel, sel.getAttribute('data-act') === 'playerCastSpell' ? 'spell' : 'slot', sel.value);
        const app = appGun();
        const gi = sel.getAttribute('data-gun');
        const spell = slot.querySelector('[data-act="playerCastSpell"][data-gun="' + gi + '"]');
        const slotSel = slot.querySelector('[data-act="playerCastSlot"][data-gun="' + gi + '"]');
        if (app && app.prepareGunCast) app.prepareGunCast(Number(gi), spell && spell.value, slotSel && slotSel.value);
        paintPlayerFight();
      });
    });
    slot.querySelectorAll('[data-act="playerCast"]').forEach(b => {
      b.addEventListener('click', () => {
        const gi = b.getAttribute('data-gun');
        const spell = slot.querySelector('[data-act="playerCastSpell"][data-gun="' + gi + '"]');
        const slotSel = slot.querySelector('[data-act="playerCastSlot"][data-gun="' + gi + '"]');
        const app = appGun();
        if (app && app.prepareGunCast) app.prepareGunCast(Number(gi), spell && spell.value, slotSel && !slotSel.hidden ? slotSel.value : '');
        if (window.SSDNSGunCast) window.SSDNSGunCast(Number(gi));
        paintPlayerFight();
      });
    });
    slot.querySelectorAll('[data-act="playerChamber"]').forEach(b => {
      b.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const row = b.closest('.cylinder-row');
        const sel = row && row.querySelector('[data-act="cylTarget"]');
        const targetId = sel ? sel.value : '';
        runPlayer(b.getAttribute('data-wid'), { chamber: b.getAttribute('data-k'), targetId: targetId });
      });
    });
    slot.querySelectorAll('[data-act="playerSpin"]').forEach(b => {
      b.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const id = String(b.getAttribute('data-wid') || '');
        const m = id.match(/gunroll:(\d+)/);
        const gi = m ? Number(m[1]) : Number(b.getAttribute('data-gun'));
        const app = appGun();
        if (app && app.spinCylinder) app.spinCylinder(gi, Number(b.getAttribute('data-k')));
        paintPlayerFight();
      });
    });
    slot.querySelectorAll('[data-act="playerCycle"]').forEach(b => {
      b.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const app = appGun();
        if (app && app.cycleTube) app.cycleTube(Number(b.getAttribute('data-gun')));
        paintPlayerFight();
      });
    });
    slot.querySelectorAll('[data-act="cylTarget"]').forEach(sel => {
      sel.addEventListener('change', () => {
        const row = sel.closest('.cylinder-row');
        const gunBtn = row && row.querySelector('[data-act="playerReload"], [data-act="playerChamber"]');
        const wid = gunBtn ? (gunBtn.getAttribute('data-wid') || gunBtn.getAttribute('data-id') || '') : '';
        state.rowTargets = state.rowTargets || {};
        if (wid) state.rowTargets[wid] = sel.value;
        state.playerTarget = sel.value;
        if (host.setSheetTarget) host.setSheetTarget(sel.value);
        paintPlayerFight();
        requestDraw();
      });
    });
  }
  /* B14: the token card docks like map chat (player left, DM right). Drag the head to float it,
     drop the pointer on a side edge to dock there again. Open/collapsed, side, and float spot
     stay on this device. DM keeps ssdns.dmCard; the player card keeps ssdns.playerCard. */
  const TOKEN_DOCK_KEY = role === 'dm' ? 'ssdns.dmCard' : 'ssdns.playerCard';
  let dmCardResize = false;
  function defaultDockSide() { return role === 'player' ? 'left' : 'right'; }
  function readTokenDock() {
    try {
      const saved = JSON.parse(localStorage.getItem(TOKEN_DOCK_KEY) || 'null');
      if (saved && typeof saved === 'object') return saved;
    } catch (e) {}
    return null;
  }
  function tokenDockState() {
    const saved = readTokenDock();
    const fallback = defaultDockSide();
    if (!saved) return { mode: 'dock', side: fallback, open: true, min: false };
    if (saved.mode === 'dock') {
      const side = saved.side === 'left' || saved.side === 'right' ? saved.side : fallback;
      const shut = saved.open === false || saved.min === true;
      return { mode: 'dock', side: side, open: !shut, min: shut };
    }
    if (saved.mode === 'float' || (isFinite(saved.x) && isFinite(saved.y))) {
      const side = saved.side === 'left' || saved.side === 'right' ? saved.side : fallback;
      return { mode: 'float', x: Number(saved.x), y: Number(saved.y), side: side, open: saved.min !== true, min: !!saved.min };
    }
    return { mode: 'dock', side: fallback, open: true, min: false };
  }
  function writeTokenDock(obj) {
    try {
      if (!obj) localStorage.removeItem(TOKEN_DOCK_KEY);
      else localStorage.setItem(TOKEN_DOCK_KEY, JSON.stringify(obj));
    } catch (e) {}
  }
  function reflowTokenDock() {
    try {
      requestAnimationFrame(() => { try { resize(); } catch (e) {} });
    } catch (e) {}
  }
  function syncDockChrome(panel) {
    if (!panel) return;
    const floating = panel.classList.contains('placed') || panel.classList.contains('ssm-float');
    const shut = !floating && el.classList.contains('ssm-token-shut');
    const collapse = panel.querySelector('[data-act="drawerCollapse"], [data-act="playerCardMin"]');
    if (collapse) {
      const closed = shut || (floating && panel.classList.contains('min'));
      collapse.setAttribute('aria-expanded', closed ? 'false' : 'true');
      collapse.title = closed ? 'Expand card' : 'Collapse card';
    }
    const caret = panel.querySelector('[data-act="drawerCaret"], [data-act="playerCaret"]');
    if (caret) {
      const side = el.classList.contains('ssm-token-left') ? 'left' : (el.classList.contains('ssm-token-right') ? 'right' : defaultDockSide());
      caret.textContent = side === 'left' ? '◂' : '▸';
    }
    const dockBtn = panel.querySelector('[data-act="drawerDock"], [data-act="playerDock"]');
    if (dockBtn) dockBtn.hidden = !floating;
    const label = panel.querySelector('.ssm-dock-label');
    if (label) {
      const nameEl = panel.querySelector('.ssm-drawer-head b, [data-act="playerName"]');
      const name = nameEl && String(nameEl.textContent || '').trim();
      if (name) label.textContent = name;
    }
  }
  function applyTokenDock(panel) {
    if (!panel) return;
    const st = tokenDockState();
    const playerCard = panel.classList.contains('ssdns-playercard');
    if (st.mode === 'float' && isFinite(st.x) && isFinite(st.y)) {
      panel.classList.add('placed', 'ssm-float');
      el.classList.remove('ssm-token-dock', 'ssm-token-left', 'ssm-token-right', 'ssm-token-shut');
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
      panel.style.left = st.x + 'px';
      panel.style.top = st.y + 'px';
      if (!playerCard) clampDmCard(panel);
      panel.classList.toggle('min', !!st.min);
      syncDockChrome(panel);
      reflowTokenDock();
      return;
    }
    panel.classList.remove('placed', 'ssm-float');
    panel.style.left = '';
    panel.style.top = '';
    panel.style.right = '';
    panel.style.bottom = '';
    const shut = !!st.min || st.open === false;
    el.classList.add('ssm-token-dock');
    el.classList.toggle('ssm-token-left', st.side === 'left');
    el.classList.toggle('ssm-token-right', st.side !== 'left');
    el.classList.toggle('ssm-token-shut', shut);
    panel.classList.toggle('min', shut);
    syncDockChrome(panel);
    reflowTokenDock();
  }
  function dockToken(panel, side) {
    const prev = tokenDockState();
    const shut = !!(prev && (prev.min || prev.open === false) && (panel.classList.contains('min') || el.classList.contains('ssm-token-shut')));
    writeTokenDock({ mode: 'dock', side: side === 'left' ? 'left' : 'right', open: !shut, min: shut });
    applyTokenDock(panel);
  }
  function saveFloat(panel) {
    const prev = readTokenDock() || {};
    const x = parseFloat(panel.style.left);
    const y = parseFloat(panel.style.top);
    if (!isFinite(x) || !isFinite(y)) return;
    const min = panel.classList.contains('min');
    const side = prev.side === 'left' || prev.side === 'right' ? prev.side : defaultDockSide();
    writeTokenDock({ mode: 'float', x: Math.round(x), y: Math.round(y), side: side, open: !min, min: min });
  }
  function resetTokenDock(panel) {
    writeTokenDock(null);
    if (panel) panel.classList.remove('min');
    applyTokenDock(panel);
  }
  function toggleTokenShut(panel) {
    if (!panel) return;
    const floating = panel.classList.contains('placed') || panel.classList.contains('ssm-float');
    if (floating) {
      panel.classList.toggle('min');
      saveFloat(panel);
      syncDockChrome(panel);
      return;
    }
    const st = tokenDockState();
    const shut = !el.classList.contains('ssm-token-shut');
    writeTokenDock({ mode: 'dock', side: st.side || defaultDockSide(), open: !shut, min: shut });
    applyTokenDock(panel);
  }
  function edgeSide(clientX, host) {
    if (!host || !isFinite(clientX)) return '';
    const edge = 28;
    if (clientX <= host.left + edge) return 'left';
    if (clientX >= host.right - edge) return 'right';
    return '';
  }
  function bindTokenDrag(panel) {
    let drag = null;
    on(panel, 'pointerdown', (e) => {
      const head = e.target.closest && (e.target.closest('.ssm-drawer-head') || e.target.closest('.ssm-card-head'));
      if (!head || !panel.contains(head)) return;
      if (e.target.closest && e.target.closest('button, a, input, select, textarea, label')) return;
      const rect = panel.getBoundingClientRect();
      const host = el.getBoundingClientRect();
      const pad = mapPad();
      drag = {
        x0: e.clientX,
        y0: e.clientY,
        left: rect.left - host.left - pad.x,
        top: rect.top - host.top - pad.y,
        host: host,
        pad: pad,
        moved: false
      };
      if (head.setPointerCapture && e.pointerId != null) {
        try { head.setPointerCapture(e.pointerId); } catch (err) {}
      }
      e.preventDefault();
    });
    on(panel, 'pointermove', (e) => {
      if (!drag) return;
      if (!drag.moved) {
        if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 4) return;
        drag.moved = true;
        panel.classList.add('placed', 'ssm-float');
        el.classList.remove('ssm-token-dock', 'ssm-token-left', 'ssm-token-right', 'ssm-token-shut');
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
        panel.style.left = Math.round(drag.left) + 'px';
        panel.style.top = Math.round(drag.top) + 'px';
      }
      const limits = cardLimits(panel, drag.host, drag.pad);
      const x = Math.min(Math.max(0, drag.left + (e.clientX - drag.x0)), limits.maxX);
      const y = Math.min(Math.max(0, drag.top + (e.clientY - drag.y0)), limits.maxY);
      panel.style.left = Math.round(x) + 'px';
      panel.style.top = Math.round(y) + 'px';
    });
    const endDrag = (e, allowSnap) => {
      if (!drag) return;
      const moved = drag.moved;
      const host = drag.host;
      drag = null;
      if (!moved) return;
      if (panel.classList.contains('ssm-drawer')) clampDmCard(panel);
      const side = allowSnap ? edgeSide(e && e.clientX, host) : '';
      if (side) dockToken(panel, side);
      else saveFloat(panel);
      syncDockChrome(panel);
      reflowTokenDock();
    };
    on(panel, 'pointerup', (e) => endDrag(e, true));
    on(panel, 'pointercancel', (e) => endDrag(e, false));
  }
  function mapPad() {
    const n = (v) => { const x = parseFloat(v); return isFinite(x) ? x : 0; };
    let cs = null;
    try { cs = window.getComputedStyle(el); } catch (e) { cs = null; }
    if (!cs) return { x: 0, y: 0, r: 0, b: 0 };
    return {
      x: n(cs.borderLeftWidth) + n(cs.paddingLeft),
      y: n(cs.borderTopWidth) + n(cs.paddingTop),
      r: n(cs.borderRightWidth) + n(cs.paddingRight),
      b: n(cs.borderBottomWidth) + n(cs.paddingBottom)
    };
  }
  function cardLimits(d, host, pad) {
    const rect = d.getBoundingClientRect();
    const w = rect.width || d.offsetWidth || 260;
    const h = rect.height || d.offsetHeight || 48;
    const innerW = Math.max(0, host.width - pad.x - pad.r);
    const innerH = Math.max(0, host.height - pad.y - pad.b);
    const keepH = Math.min(Math.max(h, 36), innerH);
    return {
      maxX: Math.max(0, innerW - Math.min(w, innerW)),
      maxY: Math.max(0, innerH - keepH)
    };
  }
  function clampDmCard(d) {
    if (!d || !d.classList.contains('placed')) return;
    const host = el.getBoundingClientRect();
    if (!host.width || !host.height) return;
    const x = parseFloat(d.style.left);
    const y = parseFloat(d.style.top);
    if (!isFinite(x) || !isFinite(y)) return;
    const limits = cardLimits(d, host, mapPad());
    d.style.left = Math.round(Math.min(Math.max(0, x), limits.maxX)) + 'px';
    d.style.top = Math.round(Math.min(Math.max(0, y), limits.maxY)) + 'px';
    d.style.right = 'auto';
    d.style.bottom = 'auto';
  }
  function bindDmCard(d) {
    applyTokenDock(d);
    bindTokenDrag(d);
    on(d, 'click', (e) => {
      /* turn order PR 2 (items 8, 9): the DM page's own handler changes the player's markers; repaint after it */
      const pip = e.target.closest && e.target.closest('[data-dm-pip], [data-pip-reset], [data-dm-move], [data-dm-act]');
      if (pip && d.contains(pip)) { setTimeout(() => renderDrawer(), 30); return; }
      const collapse = e.target.closest && e.target.closest('[data-act="drawerCollapse"]');
      if (collapse && d.contains(collapse)) {
        e.preventDefault();
        toggleTokenShut(d);
        return;
      }
      const dockBtn = e.target.closest && e.target.closest('[data-act="drawerDock"]');
      if (dockBtn && d.contains(dockBtn)) {
        e.preventDefault();
        const st = tokenDockState();
        dockToken(d, (st && st.side) || 'right');
        return;
      }
      const btn = e.target.closest && e.target.closest('[data-act="drawerReset"]');
      if (!btn || !d.contains(btn)) return;
      e.preventDefault();
      resetTokenDock(d);
    });
    if (!dmCardResize) {
      dmCardResize = true;
      on(window, 'resize', () => {
        const live = q('drawer');
        if (live && live.classList.contains('placed')) clampDmCard(live);
      });
    }
  }
  function drawerHeadHtml(title, kind) {
    const kindHtml = kind ? ' <span class="ssm-kind">' + esc(kind) + '</span>' : '';
    return '<div class="ssm-drawer-head">' +
      '<button type="button" data-act="drawerCollapse" aria-expanded="true" title="Collapse card"><span class="ssm-dock-label">' + esc(title || 'Card') + '</span> <span data-act="drawerCaret" aria-hidden="true">▸</span></button>' +
      '<b>' + esc(title || 'Card') + '</b>' + kindHtml +
      '<button type="button" data-act="drawerDock" title="Dock to the side" hidden>Dock</button>' +
      '<button type="button" data-act="drawerReset" title="Reset card position" aria-label="Reset card position">Reset</button>' +
      '<button type="button" data-act="drawerClose">×</button></div>';
  }
  function gearDrawerHtml(card) {
    if (!card || card.kind === 'pc') return '';
    const EL = window.SSDNSEnemyLoot;
    if (!EL) return '';
    const rows = Array.isArray(card.inventory) ? card.inventory : [];
    const list = rows.map(item => {
      const id = item && item.id || '';
      const tags = EL.tagLine ? EL.tagLine(item) : '';
      return '<li><span>' + esc((item.qty > 1 ? item.qty + ' × ' : '') + (item.name || id)) +
        (tags ? ' <span class="ssm-gear-tag">' + esc(tags) + '</span>' : '') + '</span>' +
        '<button type="button" data-act="gearRemove" data-item="' + esc(id) + '">Remove</button></li>';
    }).join('');
    const groups = (EL.choices ? EL.choices() : []).map(g => {
      const opts = (g.options || []).map(o => '<option value="' + esc(o.id) + '">' + esc(o.name || o.id) + '</option>').join('');
      return '<optgroup label="' + esc(g.label || 'Items') + '">' + opts + '</optgroup>';
    }).join('');
    const hp = card.hp || {};
    const cur = Number(hp.cur);
    const down = /down|dead/i.test(String(card.status || '')) || (hp.cur !== '' && hp.cur != null && isFinite(cur) && cur <= 0 && card.noHpPool !== true);
    const dropped = !!card.lootDropped;
    const dropBtn = down
      ? '<button type="button" data-act="dropLoot"' + (dropped ? ' disabled' : '') + '>' + (dropped ? 'Loot dropped' : 'Drop loot') + '</button>'
      : '';
    return '<div class="ssm-section">Gear</div>' +
      (list ? '<ul class="ssm-gear">' + list + '</ul>' : '<p class="ssm-tactics">Nothing in their pockets yet.</p>') +
      '<div class="ssm-row">' +
        '<select data-act="gearPick" aria-label="Add gear">' + groups + '</select>' +
        '<input data-act="gearQty" type="number" min="1" value="1" aria-label="Quantity">' +
        '<button type="button" data-act="gearAdd">Add</button>' +
        dropBtn +
      '</div>';
  }
  function renderDrawer() {
    if (role !== 'dm' || !state.drawerOpen) return;
    let d = q('drawer');
    if (!d) {
      d = document.createElement('aside');
      d.setAttribute('data-act', 'drawer');
      d.className = 'ssm-drawer';
      d.setAttribute('role', 'dialog');
      d.setAttribute('aria-label', 'Combatant card');
      el.appendChild(d);
      bindDmCard(d);
    }
    const tokenId = state.drawerTokenId;
    const assetTok = state.tokens.find(t => t && t.id === tokenId && t.kind === 'asset');
    if (assetTok) {
      const A = window.SSDNSAssetLibrary;
      const acts = A && A.menuActions ? A.menuActions(assetTok.asset) : [];
      const buttons = acts.map(act => '<button type="button" data-asset-act="' + esc(act.id) + '"' + (act.stub ? ' disabled' : '') + '>' + esc(act.label) + '</button>').join(' ');
      const notes = (assetTok.asset && assetTok.asset.notes) || '';
      d.innerHTML = drawerHeadHtml(assetTok.name || 'Asset', 'asset') +
        '<div class="ssm-drawer-body">' +
        '<p class="ssm-tactics">This copy on the map. Edit the library card to change art and properties.</p>' +
        '<div class="ssm-row">' + buttons + '</div>' +
        '<label class="ssm-section">Notes (DM only)<textarea data-act="assetNotes" rows="3">' + esc(notes) + '</textarea></label>' +
        '<label><input type="checkbox" data-act="assetTarget"' + (assetTok.notTargetable ? '' : ' checked') + '> Targetable</label>' +
        '<label><input type="checkbox" data-act="assetHide"' + (assetTok.hidden ? ' checked' : '') + '> Hidden from players</label>' +
        '<div class="ssm-row"><button type="button" data-act="assetDelete">Delete from map</button></div>' +
        '</div>';
      const c = d.querySelector('[data-act="drawerClose"]');
      if (c) c.addEventListener('click', closeDrawer);
      d.querySelectorAll('[data-asset-act]').forEach(btn => {
        btn.addEventListener('click', () => requestAssetAction(assetTok, btn.getAttribute('data-asset-act')));
      });
      const noteBox = d.querySelector('[data-act="assetNotes"]');
      if (noteBox) noteBox.addEventListener('change', () => {
        if (!assetTok.asset) return;
        assetTok.asset.notes = String(noteBox.value || '').slice(0, 500);
        if (shared.tokens[assetTok.id]) shared.tokens[assetTok.id].asset = JSON.parse(JSON.stringify(assetTok.asset));
        saveToken(assetTok.id);
      });
      const tgt = d.querySelector('[data-act="assetTarget"]');
      if (tgt) tgt.addEventListener('change', () => {
        assetTok.notTargetable = !tgt.checked;
        if (assetTok.asset) assetTok.asset.targetable = !!tgt.checked;
        if (shared.tokens[assetTok.id]) {
          shared.tokens[assetTok.id].notTargetable = assetTok.notTargetable;
          shared.tokens[assetTok.id].asset = JSON.parse(JSON.stringify(assetTok.asset));
        }
        saveToken(assetTok.id);
      });
      const hide = d.querySelector('[data-act="assetHide"]');
      if (hide) hide.addEventListener('change', () => {
        assetTok.hidden = !!hide.checked;
        if (assetTok.asset) assetTok.asset.hiddenFromPlayers = assetTok.hidden;
        if (shared.tokens[assetTok.id]) {
          shared.tokens[assetTok.id].hidden = assetTok.hidden;
          shared.tokens[assetTok.id].asset = JSON.parse(JSON.stringify(assetTok.asset));
        }
        saveToken(assetTok.id);
        draw();
      });
      const del = d.querySelector('[data-act="assetDelete"]');
      if (del) del.addEventListener('click', () => {
        if (!confirm('Delete this asset from the map?')) return;
        removeMapTokens([assetTok.id]);
        hideAssetMenu();
        closeDrawer();
      });
      return;
    }
    const card = lookupCard(tokenId);
    if (!card) {
      const choices = (typeof host.linkChoices === 'function' && host.linkChoices()) || {};
      const option = (value, label) => '<option value="' + esc(value) + '">' + esc(label) + '</option>';
      const group = (label, inner) => inner ? '<optgroup label="' + esc(label) + '">' + inner + '</optgroup>' : '';
      const players = (choices.players || []).map(p => option('player:' + (p.id || ''), p.label || p.name || p.id)).join('');
      const enemies = (choices.enemies || []).map(row => option('enemy:' + (row.id || ''), row.label || row.name || row.id)).join('');
      const beasts = (choices.bestiary || []).map(g => group(g.label || 'Bestiary', (g.options || []).map(b => option('beast:' + (b.id || ''), b.name || b.id)).join(''))).join('');
      const custom = choices.customLabel || 'New custom enemy (Bandit)';
      const bare = state.tokens.find(t => t && t.id === tokenId);
      d.innerHTML = drawerHeadHtml('No fight card linked') +
        '<div class="ssm-drawer-body">' +
        lightDrawerHtml(bare) +
        (window.SSDNSInteract ? window.SSDNSInteract.bombPanelHtml(bare) : '') +
        '<label class="ssm-section" for="ssm-link-pick">Link to…</label>' +
        '<select data-act="linkPick" id="ssm-link-pick" aria-label="Link to…">' +
        '<option value="">Link to…</option>' +
        group('Current players', players) +
        group('In this fight', enemies) +
        beasts +
        group('Custom', option('custom', custom)) +
        '</select>' +
        '<p class="ssm-tactics">Players can be laid out before a fight. A bestiary or custom enemy is added on the Fight tab and linked here.</p>' +
        '</div>';
      const c = d.querySelector('[data-act="drawerClose"]');
      if (c) c.addEventListener('click', closeDrawer);
      const pick = d.querySelector('[data-act="linkPick"]');
      if (pick) pick.addEventListener('change', () => {
        const link = pick.value;
        if (!link) return;
        emit('drawer:link', { tokenId: tokenId, link: link });
        pick.value = '';
      });
      bindLightHands(d, tokenId);
      bindBomb(d, bare);
      syncDockChrome(d);
      return;
    }
    const isPc = card.kind === 'pc';
    const canAct = !isPc || card.dmActsAs === true;
    const hp = card.hp || {};
    const picked = state.selected && state.selected.id !== tokenId ? state.selected : null;
    const targetPack = (typeof host.combatTargets === 'function' && host.combatTargets({
      tokenId: tokenId,
      combatantId: tokenCombatant(tokenId),
      selectedTokenId: picked ? picked.id : '',
      selectedCombatantId: picked ? tokenCombatant(picked.id) : ''
    })) || { options: [], selected: '' };
    const aimId = state.rangeTargetId === NO_TARGET ? '' : (state.rangeTargetId || targetPack.selected || '');
    state.pendingValid = (targetPack.options || []).map(o => o && o.id).filter(Boolean);
    /* 0.3.67: 'Free shot' is always the first entry: the gun fires with no target. */
    const aimListed = aimId === FREE_SHOT || (targetPack.options || []).some(o => o && o.id === aimId);
    const targetOptions = '<option value="' + FREE_SHOT + '"' + (aimId === FREE_SHOT ? ' selected' : '') + '>Free shot</option>' +
      '<option value=""' + (aimListed ? '' : ' selected') + '>' + ((targetPack.options || []).length ? 'No target' : 'No targets') + '</option>' +
      (targetPack.options || []).map(o => {
        const id = o && (o.id || '');
        const on = id && id === aimId ? ' selected' : '';
        return '<option value="' + esc(id) + '"' + on + '>' + esc((o && (o.label || o.name)) || id) + '</option>';
      }).join('');
    const activeWid = activeWeaponId(card, tokenId);
    /* B9: DM-run guns — enemies, NPC allies, and creatures — not only kind enemy. */
    const npc = !isPc;
    const attacks = (card.attacks || []).map(a => {
      const ammo = a.ammo ? ' [' + (a.ammo.loaded != null ? a.ammo.loaded : '—') + '/' + (a.ammo.cap != null ? a.ammo.cap : '—') + ']' : '';
      const base = (a.name || a.id) + ' +' + (a.toHit != null && a.toHit !== '' ? a.toHit : 0) + ' ' + (a.damage || '') + ammo;
      const verdict = rangeButtonNote(a, aimId, tokenId);
      let text = base;
      let off = canAct ? '' : 'disabled';
      if (verdict && verdict.blocked) { text = (a.name || a.id || 'Attack') + ' · ' + (verdict.button || 'Out of range'); off = 'disabled'; }
      else if (verdict && verdict.button) text = base + ' · ' + verdict.button;
      const lit = String(a.id) === activeWid ? ' is-active' : '';
      return '<button type="button" class="ssm-atk' + lit + '" data-wid="' + esc(a.id) + '" ' + off + '>' + esc(text) + disMark(verdict) + '</button>';
    }).join('');
    /* active weapon's gun card first, the rest after (same rows as before) */
    const gunList = (card.attacks || []).filter(a => a && a.ammo && a.ammo.cap);
    gunList.sort((x, y) => (String(y.id) === activeWid ? 1 : 0) - (String(x.id) === activeWid ? 1 : 0));
    const cylinders = gunList.map(a => {
      const cap = Number(a.ammo.cap) || 0;
      const loaded = Number(a.ammo.loaded) || 0;
      const flags = Array.isArray(a.ammo.chambers) ? a.ammo.chambers : null;
      const rowClean = (isPc && canAct) ? cleanControl(a, 'rowClean') : (npc ? cleanControl(a, 'rowClean') : '');
      /* map token guns: the DM unjams an NPC's gun free, same as DM unjam for players */
      const rowUnjam = (isPc && canAct) ? unjamControl(a, 'rowUnjam') : (npc ? npcUnjam(a) : '');
      const rowReopen = (isPc && canAct) ? reopenControl(a, 'rowReopen') : (npc ? npcReopen(a) + npcAddRounds(a) : '');
      const rowJamLock = npc ? (npcJam(a) + npcLock(a)) : '';
      const badges = misfireBadge(a) + jamBadge(a);
      const lit = String(a.id) === activeWid ? ' is-active' : '';
      const graphic = window.SSDNSAmmoDisplay && window.SSDNSAmmoDisplay.enabled();
      if (graphic) {
        const picture = window.SSDNSAmmoDisplay.html({
          name: a.name || '',
          action: a.action || '',
          weapon: a.weapon || '',
          ammoDisplay: a.ammoDisplay || (a.ammo && a.ammo.ammoDisplay) || '',
          group: a.group || '',
          tier: a.tier || '',
          ammo: a.ammoName || '',
          scatter: !!a.scatter,
          cap: cap,
          loaded: loaded,
          chambers: flags || undefined,
          jammed: !!(a.jammed || (a.ammo && a.ammo.jammed)),
          locked: lockList(a),
          size: 'drawer',
          attr: 'data-act="chamber" data-wid="' + esc(a.id) + '"',
          attrs: function (k) { return { 'data-k': String(k) }; }
        });
        const spareN = a.spare != null && a.spare !== '' ? a.spare : (a.ammo && a.ammo.spare != null ? a.ammo.spare : '');
        const rowReload = '<button type="button" data-act="rowReload" data-wid="' + esc(a.id) + '">Reload' + (spareN !== '' ? ' · ' + esc(spareN) : '') + '</button>';
        const rowExtras = (isPc && canAct) ? gunExtras(a, 'row') : (npc ? gunExtras(a, 'npc') : '');
        const tubeRow = window.SSDNSAmmoDisplay && window.SSDNSAmmoDisplay.kind && window.SSDNSAmmoDisplay.kind({
          action: a.action || '', name: a.name || '', weapon: a.weapon || '', group: a.group || '', ammo: a.ammoName || ''
        }) === 'tube';
        const rowCycle = tubeRow ? '<button type="button" data-act="rowCycle" data-wid="' + esc(a.id) + '">Cycle</button>' : '';
        return '<div class="cylinder-row cylinder-graphic' + crossClass(a) + lit + '" data-gun-wid="' + esc(a.id) + '"><span class="cyl-name">' + esc(a.name || 'Gun') + '</span>' + picture + '<span class="ssm-rounds">' + loaded + '/' + cap + '</span>' + badges + '<select data-act="cylTarget" aria-label="Target">' + targetOptions + '</select>' + lockupMark(a) + rowReload + rowCycle + rowClean + rowUnjam + rowReopen + rowJamLock + rowExtras + '</div>';
      }
      let dots = '';
      const locks = lockList(a);
      const spinKind = window.SSDNSAmmoDisplay && window.SSDNSAmmoDisplay.spins && window.SSDNSAmmoDisplay.spins({
        action: a.action || '', name: a.name || '', weapon: a.weapon || '', group: a.group || '', ammo: a.ammoName || ''
      });
      for (let k = 0; k < cap; k++) {
        const locked = locks.some(n => Number(n) === k);
        const full = !locked && (flags ? !!flags[k] : k < loaded);
        const act = spinKind && k > 0 ? 'spin' : 'chamber';
        dots += '<button type="button" class="chamber-dot' + (locked ? ' locked' : (full ? ' full' : '')) + '" data-act="' + act + '" data-wid="' + esc(a.id) + '" data-k="' + k + '" aria-label="' + (spinKind && k > 0 ? ('Spin chamber ' + (k + 1)) : ((locked ? 'Locked chamber ' : 'Chamber ') + (k + 1))) + '">' + (locked ? 'X' : '') + '</button>';
      }
      const spareN = a.spare != null && a.spare !== '' ? a.spare : (a.ammo && a.ammo.spare != null ? a.ammo.spare : '');
      const rowReload = '<button type="button" data-act="rowReload" data-wid="' + esc(a.id) + '">Reload' + (spareN !== '' ? ' · ' + esc(spareN) : '') + '</button>';
      const rowExtras = (isPc && canAct) ? gunExtras(a, 'row') : (npc ? gunExtras(a, 'npc') : '');
      const tubeDots = window.SSDNSAmmoDisplay && window.SSDNSAmmoDisplay.kind && window.SSDNSAmmoDisplay.kind({
        action: a.action || '', name: a.name || '', weapon: a.weapon || '', group: a.group || '', ammo: a.ammoName || ''
      }) === 'tube';
      const rowCycleDots = tubeDots ? '<button type="button" data-act="rowCycle" data-wid="' + esc(a.id) + '">Cycle</button>' : '';
      return '<div class="cylinder-row' + crossClass(a) + lit + '" data-gun-wid="' + esc(a.id) + '"><span class="cyl-name">' + esc(a.name || 'Gun') + '</span><span class="chamber-dots">' + dots + '</span><span class="ssm-rounds">' + loaded + '/' + cap + '</span>' + badges + '<select data-act="cylTarget" aria-label="Target">' + targetOptions + '</select>' + lockupMark(a) + rowReload + rowCycleDots + rowClean + rowUnjam + rowReopen + rowJamLock + rowExtras + '</div>';
    }).join('');
    const spellButtons = groupedSpells(card.spells || [], s => {
      const meta = [
        s.kind === 'save' ? 'save' : (s.kind === 'attack' ? 'attack' : (s.kind && s.kind !== 'none' ? s.kind : '')),
        s.dc !== '' && s.dc != null && s.kind === 'save' ? 'DC ' + s.dc : '',
        s.toHit !== '' && s.toHit != null && s.kind === 'attack' ? '+' + s.toHit : '',
        s.damage || '',
        s.concentration ? 'concentration' : ''
      ].filter(Boolean).join(' · ');
      const verdict = rangeButtonNote(s, aimId, tokenId);
      let off = canAct ? '' : 'disabled';
      let extra = '';
      if (verdict && verdict.blocked) { extra = ' · ' + (verdict.button || 'out of range'); off = 'disabled'; }
      else if (verdict && verdict.button) extra = ' · ' + verdict.button;
      return '<button type="button" class="ssm-atk" data-sid="' + esc(s.id) + '" data-skind="' + esc(s.kind || '') + '" ' + off + '>' +
        esc(s.name || s.id) + (s.level != null ? ' (L' + esc(s.level) + ')' : '') + (meta ? ' · ' + esc(meta) : '') + esc(extra) + disMark(verdict) + '</button>';
    });
    const spells = spellsBlock(spellButtons, (card.spells || []).length);
    const conds = (card.conditions || []).map(c => {
      const name = condLabel(c);
      return '<span class="ssm-cond">' + esc(name) +
        '<button type="button" class="ssm-cond-x" data-act="condX" data-cond="' + esc(name) + '" aria-label="Remove ' + esc(name) + '">×</button></span>';
    }).join(' ');
    const condOptions = conditionNames().map(name => '<option value="' + esc(name) + '">' + esc(name) + '</option>').join('');
    const weaponOptions = (card.attacks || []).map(a => '<option value="' + esc(a.id || a.name || '') + '"' + (String(a.id) === activeWid ? ' selected' : '') + '>' + esc(a.name || a.id || 'Weapon') + '</option>').join('') || '<option value="">No weapon</option>';
    /* map token guns + targets (Jessey 2026-10-20 9:21 / 9:24 PM): every token's card gets a Weapon picker and a
       Target picker at the top of Attacks. Before this the only target menus sat on gun rows, so a token with
       no gun (melee-only NPC, most bestiary beasts, a spellcaster) had no way to choose its target. */
    const weaponBar = (card.attacks || []).length
      ? '<label class="ssm-act ssm-weapon">Weapon <select data-act="tokenWeapon" aria-label="Weapon">' + weaponOptions + '</select></label>'
      : '';
    const targetBar = ((card.attacks || []).length || (card.spells || []).length)
      ? '<label class="ssm-act ssm-target">Target <select data-act="cylTarget" data-main="1" aria-label="Target">' + targetOptions + '</select></label>'
      : '';
    const selfTok = tokenByRef(tokenId) || tokenByRef(tokenCombatant(tokenId));
    const aimTok = aimId ? (tokenByRef(aimId) || (state.tokens || []).find(tok => tok && tokenCombatant(tok.id) === aimId) || null) : null;
    const grabFt = (selfTok && aimTok) ? feetBetween(selfTok, aimTok) : null;
    const grabFar = grabFt != null && grabFt > 5;
    const grabDisabled = !aimId || grabFar;
    const grabTitle = !aimId
      ? 'Pick a target within 5 ft.'
      : (grabFar
        ? ('Out of reach (' + grabFt + ' ft). Rob/Disarm needs to be within 5 ft.')
        : 'Robbing is frowned on in town and by lawmen and can lead to a confrontation. The DM decides whether it counts as a robbery or a disarm. No automatic reputation tracking.');
    const grabAttr = (grabDisabled ? ' disabled' : '') + ' title="' + esc(grabTitle) + '"';
    const detail = (extra) => Object.assign({ tokenId: tokenId, combatantId: tokenCombatant(tokenId) }, extra || {});
    /* 0.3.72: off-hand flag for the next PC weapon shot the DM sends (one shot, then it clears) */
    const shotDetail = (extra) => detail(Object.assign(state.drawerOffhand ? { offhand: true } : (state.drawerFan ? { fan: true } : {}), extra || {}));
    const noHpPool = card.noHpPool === true;
    const maxHp = noHpPool ? NaN : Number(hp.max);
    const haveCur = !noHpPool && hp.cur !== "" && hp.cur != null && isFinite(Number(hp.cur));
    const curHp = haveCur ? Number(hp.cur) : NaN;
    const hpPct = isFinite(maxHp) && maxHp > 0 && haveCur ? Math.max(0, Math.min(100, (curHp / maxHp) * 100)) : null;
    const hpBar = hpPct == null ? '' : '<div class="ssm-hpbar" role="meter" aria-label="HP" aria-valuenow="' + esc(curHp) + '" aria-valuemax="' + esc(maxHp) + '"><span style="width:' + hpPct + '%"></span></div>';
    const ds = card.deathSaves;
    const marks = (arr) => (Array.isArray(arr) ? arr : [false, false, false]).slice(0, 3).map(on => on ? '●' : '○').join('');
    const deathLine = (haveCur && curHp <= 0)
      ? '<div class="ssm-deaths">Death saves · S ' + marks(ds && ds.success) + ' · F ' + marks(ds && ds.fail) + '</div>'
      : '';
    const actToggle = isPc
      ? '<label class="ssm-act"><input type="checkbox" data-act="actFor"' + (card.dmActsAs ? ' checked' : '') + '> Act for player</label>'
      : '';
    /* turn order PR 2 (items 8, 9) plus B3: the current enemy's Action / Bonus / R and Move, same store as the DM strip */
    let markerRow = '';
    if ((isPc || drawerIsCurrentEnemy(tokenId)) && window.DMCCEnhance && typeof window.DMCCEnhance.mapMarkersHtml === 'function') {
      markerRow = window.DMCCEnhance.mapMarkersHtml(tokenCombatant(tokenId)) || '';
      if (!markerRow && !isPc) {
        const row = currentFightRow();
        if (row && row.id) markerRow = window.DMCCEnhance.mapMarkersHtml(row.id) || '';
      }
    }
    const speedNum = (() => {
      const n = parseInt(card.speed, 10);
      return isFinite(n) && n >= 0 ? n : 30;
    })();
    const speedBit = isPc
      ? esc(speedLabel(card.speed))
      : '<label class="ssm-act ssm-speed">Speed <input data-act="enemySpeed" type="number" min="0" step="5" value="' + speedNum + '" aria-label="Speed in feet"> ft</label>';
    const coverKey = (window.SSDNSApplied && window.SSDNSApplied.coverKey)
      ? window.SSDNSApplied.coverKey(card.cover)
      : (card.cover || '');
    const coverTitle = "Half cover +2 to AC and Dexterity saves. Three-quarters +5. Total cover can't be targeted.";
    const coverOpt = (val, label) => '<option value="' + val + '"' + (coverKey === val ? ' selected' : '') + '>' + label + '</option>';
    const coverRow = '<label class="ssm-act" title="' + esc(coverTitle) + '">Cover <select data-act="coverPick" aria-label="Cover" title="' + esc(coverTitle) + '">' +
      coverOpt('', 'None') + coverOpt('half', 'Half +2') + coverOpt('three', '3/4 +5') + coverOpt('full', 'Total') +
      '</select></label>' +
      '<label class="ssm-act" title="Lock cover so the player can\'t change it."><input type="checkbox" data-act="coverLock"' + (card.coverLock ? ' checked' : '') + '> Lock cover</label>';
    /* N68: enemy/NPC only. Ticks the linked combatant's reveal.hp. Does not reveal name, AC, or the stat block. */
    const revealHpRow = (!isPc && !noHpPool)
      ? '<label class="ssm-act" title="Players see this token\'s HP bar on the map. Name, AC, and the stat block stay as they are."><input type="checkbox" data-act="revealHp"' + (card.revealHp ? ' checked' : '') + '> Reveal HP</label>'
      : '';
    d.innerHTML =
      drawerHeadHtml(card.name || tokenId, card.kind || '') +
      '<div class="ssm-drawer-body">' +
      lightDrawerHtml(state.tokens.find(t => t && t.id === tokenId)) +
      (window.SSDNSInteract ? window.SSDNSInteract.bombPanelHtml(state.tokens.find(t => t && t.id === tokenId)) : '') +
      pendingBannerHtml(tokenId) +
      '<div>AC ' + esc(card.ac != null ? card.ac : '—') + (noHpPool ? ' · No HP pool' : ' · HP ' + esc(hp.cur != null ? hp.cur : '—') + '/' + esc(hp.max != null ? hp.max : '—')) +
      (hp.temp ? ' (+' + esc(hp.temp) + ')' : '') + ' · ' + speedBit + '</div>' +
      hpBar +
      deathLine +
      markerRow +
      actToggle +
      coverRow +
      revealHpRow +
      '<label class="ssm-act ssm-range"><input type="checkbox" data-act="drawerRange"' + (state.showRange ? ' checked' : '') + '> Show range</label>' +
      '<label class="ssm-act">Range: <select data-act="rangeOverride" aria-label="Range: Auto">' +
        '<option value="auto"' + (rangeOverrideNow() === 'auto' ? ' selected' : '') + '>Auto</option>' +
        '<option value="ignore"' + (rangeOverrideNow() === 'ignore' ? ' selected' : '') + '>Ignore range</option>' +
        '<option value="force"' + (rangeOverrideNow() === 'force' ? ' selected' : '') + '>Force DIS</option>' +
        '<option value="adv"' + (rangeOverrideNow() === 'adv' ? ' selected' : '') + '>Force ADV</option>' +
      '</select></label>' +
      '<select data-act="drawerRangeWeapon" aria-label="Token weapon" hidden></select>' +
      (conds ? '<div class="ssm-conds">' + conds + '</div>' : '') +
      (card.tactics ? '<div class="ssm-tactics">' + esc(card.tactics) + '</div>' : '') +
      '<div class="ssm-section">Attacks</div>' + weaponBar + targetBar + offhandToggle(isPc && canAct && (card.attacks || []).length) + fanToggle(isPc && canAct && card.pistolero === true && (card.attacks || []).length) + attacks +
      (cylinders ? '<div class="ssm-section">Cylinder</div>' + cylinders : '') +
      spells +
      gearDrawerHtml(card) +
      '<div class="ssm-row">' +
        '<input data-act="hpAmt" type="number" value="1" min="0" aria-label="HP amount">' +
        '<button type="button" data-act="hpMinus">− HP</button><button type="button" data-act="hpPlus">+ HP</button>' +
        '<button type="button" data-act="hpSet">Set HP</button>' +
        '<button type="button" data-act="downCard">Down</button>' +
      '</div>' +
      '<div class="ssm-row">' +
        '<select data-act="condPick" aria-label="Condition">' + condOptions + '</select>' +
        '<button type="button" data-act="condBtn">Condition</button>' +
      '</div>' +
      '<div class="ssm-row">' +
        '<select data-act="weaponPick" aria-label="Weapon">' + weaponOptions + '</select>' +
        '<button type="button" data-act="reloadBtn">Reload</button><button type="button" data-act="unloadBtn">Unload</button>' +
        '<button type="button" data-act="deathBtn">Death save</button><button type="button" data-act="undoBtnD">Undo</button>' +
      '</div>' +
      (window.SSDNSItems && card.items && card.items.length ? '<div class="ssm-section">Items</div>' + window.SSDNSItems.drawerRows(card.items, { name: card.name || '', dm: role === 'dm' }) : '') +
      '<div class="ssm-row">' +
        '<button type="button" data-act="robBtn"' + grabAttr + '>Rob/Disarm</button>' +
      '</div>' +
      '<button type="button" data-act="imageBtn">Replace image</button>' +
      '</div>';
    bindSpellFold(d);
    bindBomb(d, state.tokens.find(t => t && t.id === tokenId));
    const readHp = () => {
      const elAmt = d.querySelector('[data-act="hpAmt"]');
      const n = parseInt(elAmt && elAmt.value, 10);
      if (!isFinite(n) || n === 0) return 1;
      return n < 0 ? -n : n;
    };
    const pickedWeapon = () => {
      const sel = d.querySelector('[data-act="weaponPick"]');
      return sel && sel.value ? sel.value : null;
    };
    d.querySelector('[data-act="drawerClose"]').addEventListener('click', closeDrawer);
    bindLightHands(d, tokenId);
    const chosenTarget = () => {
      if (state.rangeTargetId === NO_TARGET) return '';
      if (state.rangeTargetId) return state.rangeTargetId;
      const cyl = d.querySelector('[data-act="cylTarget"]');
      return (cyl && cyl.value) || '';
    };
    d.querySelectorAll('.ssm-atk').forEach(b => {
      b.addEventListener('click', () => {
        if (b.disabled) return;
        const sid = b.hasAttribute('data-sid') ? b.getAttribute('data-sid') : '';
        const wid = sid ? '' : b.getAttribute('data-wid');
        const skind = sid ? (b.getAttribute('data-skind') || '') : '';
        if (sid) emit('drawer:spell', detail({ spellId: sid }));
        else { noteWeapon(tokenId, wid); emit('drawer:attack', detail({ weaponId: wid })); }
        /* 0.3.67: use the target already chosen in the cylinder menu / by clicking; ask only when none. */
        const aim = chosenTarget();
        if (aim === FREE_SHOT && !sid) {
          state.pendingTarget = null;
          paintPendingBanner();
          emit('drawer:target', shotDetail({ weaponId: wid, free: true, targetTokenId: '', targetCombatantId: FREE_SHOT }));
          clearOffhand();
          return;
        }
        if (sid && window.SSDNSSpellArea && window.SSDNSSpellArea.areaOf && skind !== 'attack' && skind !== 'weapon') {
          const blast = window.SSDNSSpellArea.areaOf(b.textContent || sid) || window.SSDNSSpellArea.areaOf(sid);
          if (blast) {
            state.pendingTarget = null;
            paintPendingBanner();
            emit('drawer:target', detail({ spellId: sid, targetTokenId: '', targetCombatantId: '' }));
            return;
          }
        }
        const aimTok = aim && aim !== FREE_SHOT ? (state.tokens || []).find(tok => tok && (tokenCombatant(tok.id) === aim || tok.id === aim)) : null;
        if (aimTok && (aimTok.id !== tokenId || skind === 'heal')) {
          const attack = sid
            ? ((card.spells || []).find(s => s && (s.id === sid || s.name === sid)) || { id: sid })
            : ((card.attacks || []).find(a => a && (a.id === wid || a.name === wid)) || { id: wid });
          const verdict = armRange(attack, aimTok.id, tokenId);
          const reach = sid ? touchGate(attack, tokenId, aimTok) : "";
          if (reach) {
            toast(reach);
            return;
          }
          if (verdict && verdict.blocked) {
            noteOverride(verdict);
            if (window.SSDNSRangeRings && window.SSDNSRangeRings.clear) window.SSDNSRangeRings.clear();
            toast(verdict.button || 'Out of range');
            return;
          }
          state.pendingTarget = null;
          paintPendingBanner();
          emit('drawer:target', (sid ? detail : shotDetail)({ weaponId: wid || '', spellId: sid || '', targetTokenId: aimTok.id, targetCombatantId: tokenCombatant(aimTok.id) }));
          if (!sid) clearOffhand();
          return;
        }
        state.pendingTarget = sid ? { tokenId, spellId: sid, spellKind: skind, label: b.textContent || '' } : { tokenId, weaponId: wid, label: b.textContent || '', offhand: !!state.drawerOffhand, fan: !state.drawerOffhand && !!state.drawerFan };
        renderDrawer();
        paintPendingBanner();
        draw();
      });
    });
    const ohBox = d.querySelector('[data-act="offhandToggle"]');
    if (ohBox) ohBox.addEventListener('change', () => { state.drawerOffhand = !!ohBox.checked; if (state.drawerOffhand) state.drawerFan = false; renderDrawer(); });
    const fanBox = d.querySelector('[data-act="fanToggle"]');
    if (fanBox) fanBox.addEventListener('change', () => { state.drawerFan = !!fanBox.checked; if (state.drawerFan) state.drawerOffhand = false; renderDrawer(); });
    const cancelBtn = d.querySelector('[data-act="pendingCancel"]');
    if (cancelBtn) cancelBtn.addEventListener('click', (ev) => { ev.stopPropagation(); cancelPendingTarget(); });
    d.querySelectorAll('[data-act="cylTarget"]').forEach(sel => {
      sel.addEventListener('change', () => {
        /* 0.3.67: 'No target' is a real choice; it must not snap back to the fight's default target */
        state.rangeTargetId = sel.value || NO_TARGET;
        renderDrawer();
        draw();
      });
    });
    /* N82: a PC card from the DM is a fresh copy. Spin/Cycle must go to the sheet (free),
       the same handlers the player already uses. Mutating this copy vanished on the next paint. */
    d.querySelectorAll('[data-act="rowCycle"]').forEach(b => {
      b.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (isPc && !canAct) { toast('The player acts for themselves'); return; }
        emit('drawer:cycle', detail({ weaponId: b.getAttribute('data-wid') }));
      });
    });
    d.querySelectorAll('[data-act="spin"]').forEach(b => {
      b.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (isPc && !canAct) { toast('The player acts for themselves'); return; }
        emit('drawer:spin', detail({ weaponId: b.getAttribute('data-wid'), chamber: Number(b.getAttribute('data-k')) }));
      });
    });
    d.querySelectorAll('[data-act="chamber"]').forEach(b => {
      b.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (!canAct) { toast('The player acts for themselves'); return; }
        const wid0 = b.getAttribute('data-wid');
        const k0 = Number(b.getAttribute('data-k'));
        if (!isPc && isFinite(k0)) {
          const attack0 = (card.attacks || []).find(a => a && (String(a.id) === String(wid0) || String(a.name) === String(wid0)));
          if (lockList(attack0).some(n => Number(n) === k0)) { toast('That chamber is locked.'); return; }
          const flags0 = attack0 && attack0.ammo && Array.isArray(attack0.ammo.chambers) ? attack0.ammo.chambers : null;
          const loaded0 = attack0 && attack0.ammo ? (Number(attack0.ammo.loaded) || 0) : 0;
          const full0 = flags0 ? !!flags0[k0] : k0 < loaded0;
          if (!full0) { toast('Click.'); return; }
        }
        const row = b.closest('.cylinder-row');
        const sel = row && row.querySelector('[data-act="cylTarget"]');
        const targetId = sel && sel.value;
        if (!targetId) { toast('Pick a target'); return; }
        if (targetId === FREE_SHOT) {
          emit('drawer:target', shotDetail({ weaponId: b.getAttribute('data-wid'), chamber: Number(b.getAttribute('data-k')), free: true, targetTokenId: '', targetCombatantId: FREE_SHOT }));
          clearOffhand();
          return;
        }
        const targetTok = state.tokens.find(tok => tok && (tokenCombatant(tok.id) === targetId || tok.id === targetId));
        const wid = b.getAttribute('data-wid');
        noteWeapon(tokenId, wid);
        const attack = ((card.attacks || []).find(a => a && (a.id === wid || a.name === wid))) || { id: wid };
        const verdict = armRange(attack, targetTok ? targetTok.id : targetId, tokenId);
        if (verdict && verdict.blocked) {
          noteOverride(verdict);
          if (window.SSDNSRangeRings && window.SSDNSRangeRings.clear) window.SSDNSRangeRings.clear();
          toast(verdict.button || 'Out of range');
          return;
        }
        emit('drawer:target', shotDetail({
          weaponId: wid,
          chamber: Number(b.getAttribute('data-k')),
          targetTokenId: targetTok ? targetTok.id : '',
          targetCombatantId: targetId
        }));
        clearOffhand();
      });
    });
    d.querySelector('[data-act="hpMinus"]').addEventListener('click', () => emit('drawer:hp', detail({ delta: -readHp() })));
    d.querySelector('[data-act="hpPlus"]').addEventListener('click', () => emit('drawer:hp', detail({ delta: readHp() })));
    d.querySelector('[data-act="hpSet"]').addEventListener('click', () => emit('drawer:hp', detail({ set: readHp() })));
    d.querySelector('[data-act="downCard"]').addEventListener('click', () => emit('drawer:down', detail()));
    const gearAdd = d.querySelector('[data-act="gearAdd"]');
    if (gearAdd) gearAdd.addEventListener('click', () => {
      const pick = d.querySelector('[data-act="gearPick"]');
      const qtyEl = d.querySelector('[data-act="gearQty"]');
      const qty = parseInt(qtyEl && qtyEl.value, 10);
      emit('drawer:gearAdd', detail({ itemId: pick && pick.value || '', qty: isFinite(qty) && qty > 0 ? qty : 1 }));
    });
    d.querySelectorAll('[data-act="gearRemove"]').forEach(b => {
      b.addEventListener('click', () => emit('drawer:gearRemove', detail({ itemId: b.getAttribute('data-item') || '' })));
    });
    const dropBtn = d.querySelector('[data-act="dropLoot"]');
    if (dropBtn) dropBtn.addEventListener('click', () => {
      if (dropBtn.disabled) return;
      emit('drawer:dropLoot', detail());
    });
    d.querySelectorAll('[data-act="condX"]').forEach(b => {
      b.addEventListener('click', () => {
        const name = b.getAttribute('data-cond') || '';
        if (!name) return;
        emit('drawer:condition', detail({ condition: name, on: false }));
      });
    });
    const actBox = d.querySelector('[data-act="actFor"]');
    if (actBox) actBox.addEventListener('change', () => emit('drawer:act', detail({ on: !!actBox.checked })));
    const revealHpBox = d.querySelector('[data-act="revealHp"]');
    if (revealHpBox) revealHpBox.addEventListener('change', () => emit('drawer:revealHp', detail({ on: !!revealHpBox.checked })));
    const speedBox = d.querySelector('[data-act="enemySpeed"]');
    if (speedBox) speedBox.addEventListener('change', () => {
      const n = parseInt(speedBox.value, 10);
      if (!isFinite(n) || n < 0) { speedBox.value = String(speedNum); return; }
      emit('drawer:speed', detail({ speed: n }));
    });
    const coverPick = d.querySelector('[data-act="coverPick"]');
    const coverLock = d.querySelector('[data-act="coverLock"]');
    const emitCover = () => emit('drawer:cover', detail({
      cover: coverPick ? coverPick.value : '',
      lock: !!(coverLock && coverLock.checked)
    }));
    if (coverPick) coverPick.addEventListener('change', emitCover);
    if (coverLock) coverLock.addEventListener('change', emitCover);
    const rangeBox = d.querySelector('[data-act="drawerRange"]');
    if (rangeBox) rangeBox.addEventListener('change', () => onRangeToggle(rangeBox.checked));
    const rangeSel = d.querySelector('[data-act="drawerRangeWeapon"]');
    if (rangeSel) rangeSel.addEventListener('change', () => {
      state.rangeWeaponId = rangeSel.value;
      const other = q('rangeWeapon');
      if (other) other.value = rangeSel.value;
      requestDraw();
    });
    paintRangeControls();
    d.querySelector('[data-act="imageBtn"]').addEventListener('click', () => {
      const token = state.tokens.find(tok => tok && tok.id === tokenId);
      const Crop = window.SSDNSTokenCrop;
      if (!token || !Crop || typeof Crop.open !== 'function') { toast('Image cropper is not loaded'); return; }
      Crop.open({
        host: el,
        src: token.image ? asset(token.image) : '',
        onSave: (url) => rememberTokenImage(token, url),
        onFallback: () => toast('The browser blocked that image. The original picture stays.')
      });
    });
    d.querySelector('[data-act="condBtn"]').addEventListener('click', () => {
      const sel = d.querySelector('[data-act="condPick"]');
      const name = String((sel && sel.value) || '').trim();
      if (!name) return;
      const already = (card.conditions || []).some(x => condLabel(x).toLowerCase() === name.toLowerCase());
      emit('drawer:condition', detail({ condition: name, on: !already }));
    });
    d.querySelectorAll('[data-act="rowReload"]').forEach(b => {
      b.addEventListener('click', () => { noteWeapon(tokenId, b.getAttribute('data-wid')); emit('drawer:reload', detail({ weaponId: b.getAttribute('data-wid') })); });
    });
    d.querySelectorAll('[data-act="rowUnload"]').forEach(b => {
      b.addEventListener('click', () => { noteWeapon(tokenId, b.getAttribute('data-wid')); emit('drawer:unload', detail({ weaponId: b.getAttribute('data-wid') })); });
    });
    const tokenWeaponSel = d.querySelector('[data-act="tokenWeapon"]');
    if (tokenWeaponSel) tokenWeaponSel.addEventListener('change', () => {
      const wid = tokenWeaponSel.value;
      if (!wid) return;
      noteWeapon(tokenId, wid);
      if (state.showRange) state.rangeWeaponId = wid;
      emit('drawer:weapon', detail({ weaponId: wid }));
      renderDrawer();
      requestDraw();
    });
    d.querySelectorAll('[data-act="rowClean"]').forEach(b => {
      b.addEventListener('click', () => {
        if (b.disabled) return;
        if (!canAct) { toast('The player acts for themselves'); return; }
        emit('drawer:clean', detail({ weaponId: b.getAttribute('data-wid') }));
      });
    });
    d.querySelectorAll('[data-act="rowUnjam"]').forEach(b => {
      b.addEventListener('click', () => {
        if (!canAct) { toast('The player acts for themselves'); return; }
        emit('drawer:unjam', detail({ weaponId: b.getAttribute('data-wid'), gunIndex: b.getAttribute('data-gun') }));
      });
    });
    d.querySelectorAll('[data-act="rowAddRounds"]').forEach(b => {
      b.addEventListener('click', () => {
        if (isPc) return;
        noteWeapon(tokenId, b.getAttribute('data-wid'));
        emit('drawer:addrounds', detail({ weaponId: b.getAttribute('data-wid') }));
      });
    });
    d.querySelectorAll('[data-act="rowReopen"]').forEach(b => {
      b.addEventListener('click', () => {
        if (!canAct) { toast('The player acts for themselves'); return; }
        emit('drawer:reopen', detail({ weaponId: b.getAttribute('data-wid'), gunIndex: b.getAttribute('data-gun') }));
      });
    });
    d.querySelectorAll('[data-act="rowJam"]').forEach(b => {
      b.addEventListener('click', () => {
        if (isPc) return;
        emit('drawer:jam', detail({ weaponId: b.getAttribute('data-wid') }));
      });
    });
    d.querySelectorAll('[data-act="rowLock"]').forEach(b => {
      b.addEventListener('click', () => {
        if (isPc) return;
        const row = b.closest('.cylinder-row');
        const sel = row && row.querySelector('[data-act="lockPick"]');
        const raw = sel && sel.value !== '' ? sel.value : b.getAttribute('data-k');
        emit('drawer:lock', detail({ weaponId: b.getAttribute('data-wid'), chamber: raw === '' || raw == null ? '' : Number(raw) }));
      });
    });
    const actGate = () => {
      if (canAct) return true;
      toast('The player acts for themselves');
      return false;
    };
    d.querySelectorAll('[data-act="rowPool"]').forEach(sel => {
      sel.addEventListener('change', () => {
        if (!actGate()) return;
        emit('drawer:pool', detail({ weaponId: sel.getAttribute('data-wid'), pool: sel.value }));
      });
    });
    d.querySelectorAll('[data-act="rowTr"]').forEach(b => {
      b.addEventListener('click', () => {
        if (!actGate()) return;
        emit('drawer:tr', detail({ weaponId: b.getAttribute('data-wid') }));
      });
    });
    d.querySelectorAll('[data-act="rowHexLvl"], [data-act="rowCastSpell"], [data-act="rowCastSlot"]').forEach(sel => {
      sel.addEventListener('change', () => {
        const field = sel.getAttribute('data-act') === 'rowHexLvl' ? 'hex' : (sel.getAttribute('data-act') === 'rowCastSpell' ? 'spell' : 'slot');
        rememberGun(sel, field, sel.value);
        if (field === 'spell') renderDrawer();
      });
    });
    d.querySelectorAll('[data-act="rowHex"]').forEach(b => {
      b.addEventListener('click', () => {
        if (!actGate()) return;
        const gi = b.getAttribute('data-gun');
        const lvl = d.querySelector('[data-act="rowHexLvl"][data-gun="' + gi + '"]');
        const spell = d.querySelector('[data-act="rowCastSpell"][data-gun="' + gi + '"]');
        const slotSel = d.querySelector('[data-act="rowCastSlot"][data-gun="' + gi + '"]');
        const spellVal = spell && spell.value || '';
        const spellLv = parseInt(String(spellVal).split(':')[0], 10) || 0;
        const hexLv = parseInt(lvl && lvl.value, 10) || 1;
        const castLv = parseInt(slotSel && slotSel.value, 10) || 0;
        const use = spellLv > 0 ? Math.max(spellLv, hexLv >= spellLv ? hexLv : 0, castLv >= spellLv ? castLv : 0) : hexLv;
        emit('drawer:hex', detail({ weaponId: b.getAttribute('data-wid'), level: use, spell: spellVal }));
      });
    });
    d.querySelectorAll('[data-act="rowCast"]').forEach(b => {
      b.addEventListener('click', () => {
        if (!actGate()) return;
        const gi = b.getAttribute('data-gun');
        const spell = d.querySelector('[data-act="rowCastSpell"][data-gun="' + gi + '"]');
        const slotSel = d.querySelector('[data-act="rowCastSlot"][data-gun="' + gi + '"]');
        emit('drawer:castgun', detail({
          weaponId: b.getAttribute('data-wid'),
          spell: spell ? spell.value : '',
          slot: slotSel && !slotSel.hidden ? slotSel.value : ''
        }));
      });
    });
    const bindRowMode = (box, mode) => {
      box.addEventListener('change', () => {
        if (!actGate()) { box.checked = !box.checked; return; }
        const on = box.checked ? mode : '';
        emit('drawer:mode', detail({ weaponId: box.getAttribute('data-wid'), mode: on }));
      });
    };
    d.querySelectorAll('[data-act="rowAdv"]').forEach(b => bindRowMode(b, 'adv'));
    d.querySelectorAll('[data-act="rowDis"]').forEach(b => bindRowMode(b, 'dis'));
    const rangeMode = d.querySelector('[data-act="rangeOverride"]');
    if (rangeMode) rangeMode.addEventListener('change', () => {
      state.rangeOverride = rangeMode.value || 'auto';
      if (window.SSDNSRangeRings && window.SSDNSRangeRings.setOverride) window.SSDNSRangeRings.setOverride(state.rangeOverride);
      renderDrawer();
    });
    d.querySelector('[data-act="reloadBtn"]').addEventListener('click', () => emit('drawer:reload', detail({ weaponId: pickedWeapon() })));
    d.querySelector('[data-act="unloadBtn"]').addEventListener('click', () => emit('drawer:unload', detail({ weaponId: pickedWeapon() })));
    const emitGrab = (name) => {
      if (grabDisabled) return;
      emit(name, detail({
        targetTokenId: aimTok ? aimTok.id : '',
        targetCombatantId: aimId,
        feet: grabFt
      }));
    };
    const robBtn = d.querySelector('[data-act="robBtn"]');
    if (robBtn) robBtn.addEventListener('click', () => emitGrab('drawer:rob'));
    d.querySelectorAll('[data-act="useItem"]').forEach(b => {
      b.addEventListener('click', () => {
        const uid = b.getAttribute('data-uid');
        if (role === 'player') playerUseItem(uid);
        else emit('drawer:useitem', detail({ itemUid: uid }));
      });
    });
    d.querySelector('[data-act="deathBtn"]').addEventListener('click', () => emit('drawer:deathsave', detail()));
    d.querySelector('[data-act="undoBtnD"]').addEventListener('click', () => emit('drawer:undo', detail()));
    syncDockChrome(d);
  }
  function refreshCard(tokenId) {
    /* 0.3.64: the token ammo badge is drawn on the canvas from host.rounds(); the sheet's publishGunCard and the
       DM's snapshot refresh both land here, so a reload, swap or spent round redraws it live. */
    requestDraw();
    if (role === 'player') { paintPlayerFight(); return; }
    if (role !== 'dm') return;
    fillStripMarkers();
    if (state.drawerOpen && (!tokenId || tokenId === state.drawerTokenId)) renderDrawer();
  }

  function destroy() {
    dead = true;
    state.drawerOpen = false;
    state.drawerTokenId = null;
    state.pendingTarget = null;
    if (raf) cancelAnimationFrame(raf);
    if (animRaf) cancelAnimationFrame(animRaf);
    fxStopAll();
    if (ro) ro.disconnect();
    listeners.forEach(([t, ev, fn, opt]) => t.removeEventListener(ev, fn, opt));
    listeners.length = 0;
    unsubs.forEach(u => { try { u(); } catch (e) {} });
    if (chatUi) { chatUi.detach(); chatUi = null; }
    clearStreamTimer();
    el.innerHTML = '';
  }

  function dropToken(id) {
    delete shared.tokens[id];
    state.tokens = state.tokens.filter(t => t.id !== id);
    if (state.selected && state.selected.id === id) state.selected = null;
    state.selectedIds = (state.selectedIds || []).filter(x => x !== id);
  }
  function dragPosKeep() {
    const ids = dragTokenIds();
    if (!ids.length) return null;
    const keep = {};
    ids.forEach(id => {
      const t = state.tokens.find(tok => tok && tok.id === id);
      if (t && t.pos) keep[id] = { x: t.pos.x, y: t.pos.y };
    });
    return Object.keys(keep).length ? keep : null;
  }
  function restoreDragPos(keep) {
    if (!keep) return;
    Object.keys(keep).forEach(id => {
      const t = state.tokens.find(tok => tok && tok.id === id);
      if (t) t.pos = Object.assign({}, t.pos, keep[id]);
      if (shared.tokens[id]) shared.tokens[id].pos = Object.assign({}, shared.tokens[id].pos || {}, keep[id]);
    });
  }
  function handlePublicToken(path, value, meta) {
    if (meta && meta.ready) {
      noteTokensReady();
      return;
    }
    const parts = (path || '').split('/');
    // map/public/tokens/<id>[/pos|/patch]
    const id = parts[3];
    if (!id) return;
    const sub = parts[4];
    if (value == null || (meta && meta.removed)) {
      if (!newer(path, meta && meta.seq)) return;
      if (role === 'dm' && shared.tokens[id] && shared.tokens[id].hidden) {
        let kept = state.tokens.find(tok => tok.id === id);
        if (!kept) {
          kept = Object.assign({}, shared.tokens[id]);
          state.tokens.push(kept);
        }
        kept.hidden = true;
        requestDraw();
        return;
      }
      dropToken(id);
      if (role === 'player') state.tokens = Object.values(shared.tokens).filter(t => !t.hidden);
      requestDraw();
      return;
    }
    const seq = (meta && meta.seq) || (value && value.seq);
    if (!newer(path, seq)) return;
    if (role === 'player' && value && typeof value === 'object') {
      delete value.hp;
      delete value.maxHp;
      delete value.ac;
      delete value.notes;
      if (value.hidden) {
        dropToken(id);
        state.tokens = Object.values(shared.tokens).filter(t => !t.hidden);
        requestDraw();
        return;
      }
      delete value.hidden;
    }
    const keep = dragPosKeep();
    let remotePos = false;
    if (sub === 'pos') {
      if (!(keep && keep[id])) {
        const t = shared.tokens[id];
        const prevPos = t && t.pos ? { x: t.pos.x, y: t.pos.y } : null;
        const by = (meta && meta.by) || (value && value.by);
        if (role === 'dm' && t && by && by !== uid) {
          if (!canControlBy(t, by)) return;
          t.pos = { x: value.x, y: value.y, by, seq };
          saveToken(id);
        } else if (shared.tokens[id]) {
          shared.tokens[id].pos = { x: value.x, y: value.y };
        }
        if (prevPos && value) markRangeMoved(id, prevPos, { x: value.x, y: value.y });
        remotePos = true;
      }
    } else if (sub === 'patch') {
      const t = shared.tokens[id];
      if (!t || !value) return;
      const by = (meta && meta.by) || value.by;
      if (!canControlBy(t, by)) return;
      const cosmetic = {};
      if (value.color != null) cosmetic.color = value.color;
      if (value.label != null) cosmetic.label = value.label;
      if (value.veil != null) cosmetic.veil = !!value.veil;
      if (value.facing != null) cosmetic.facing = Number(value.facing) || 0;
      /* Non-DM clients paint the patch as sent. The DM re-merges so dmDoused and a hand torch/darkvision win. */
      if (role !== 'dm') {
        if (value.lights) cosmetic.lights = value.lights;
        if (value.darkvision != null) cosmetic.darkvision = Number(value.darkvision) || 0;
        if (value.skulker != null) cosmetic.skulker = !!value.skulker;
        if (value.devilsSight != null) cosmetic.devilsSight = !!value.devilsSight;
      }
      Object.assign(t, cosmetic);
      /* ownerCanMove:false never reaches here (canControlBy). The snapshot write covers that case. */
      if (role === 'dm' && (value.lights || value.darkvision != null || value.skulker != null)) {
        const live = state.tokens.find(tok => tok && tok.id === id) || t;
        live._lightSig = '';
        applyLightsToToken(live, {
          lights: value.lights || live.lights || [],
          darkvision: value.darkvision != null ? value.darkvision : live.darkvision,
          skulker: value.skulker != null ? value.skulker : live.skulker,
          devilsSight: value.devilsSight != null ? value.devilsSight : live.devilsSight
        }, 'patch');
      } else if (role === 'dm') saveToken(id);
    } else if (value && (value.id || id)) {
      const tid = value.id || id;
      const next = Object.assign({}, value);
      if (role === 'player') {
        delete next.hp;
        delete next.maxHp;
        delete next.ac;
        delete next.notes;
        delete next.hidden;
      }
      /* A public snapshot omits combatantId and can arrive with a blank ownerUid.
         Do not wipe the DM token's player link. */
      const prevTok = shared.tokens[tid] || {};
      if (!next.ownerUid && prevTok.ownerUid) next.ownerUid = prevTok.ownerUid;
      if (!next.combatantId && prevTok.combatantId) next.combatantId = prevTok.combatantId;
      if (!next.sheetId && prevTok.sheetId) next.sheetId = prevTok.sheetId;
      if (!next.kind && prevTok.kind) next.kind = prevTok.kind;
      if (role === 'dm' && next.asset && prevTok.asset && prevTok.asset.props && !next.asset.props) next.asset = prevTok.asset;
      shared.tokens[tid] = Object.assign({}, prevTok, next);
      if (role === 'dm' && !state.tokens.some(tok => tok && tok.id === tid)) {
        state.tokens.push(JSON.parse(JSON.stringify(shared.tokens[tid])));
      }
    }
    if (role === 'player') state.tokens = Object.values(shared.tokens).filter(t => !t.hidden);
    applySharedToTokens();
    restoreDragPos(keep);
    if (remotePos) refreshRangeSurfaces();
    requestDraw();
  }

  if (adapter && adapter.subscribe) {
    unsubs.push(adapter.subscribe('map/public/tokens', (value, meta) => {
      handlePublicToken(meta && meta.path, value, meta);
    }));
    unsubs.push(adapter.subscribe('map/public/scenes', (value, meta) => {
      const path = meta && meta.path || '';
      const sid = path.split('/').pop();
      if (sid && sid !== 'scenes' && value && typeof value === 'object') {
        sawRemoteScene = true;
        if (!shared.scenes) shared.scenes = {};
        const next = Object.assign({}, value);
        if (!Array.isArray(next.walls)) next.walls = [];
        if (!Array.isArray(next.fogRects)) next.fogRects = [];
        if (!Array.isArray(next.fogPolys)) next.fogPolys = [];
        const hadMeta = JSON.stringify((shared.scenes[sid] || {}).meta || null);
        shared.scenes[sid] = next;
        if (Array.isArray(next.spellZones) && sid === activeSceneId() && (!state.spellZonesLive || (Number(next.zoneSeq) || 0) >= (state.zoneSeq || 0))) {
          adoptSpellZones(next.spellZones, Number(next.zoneSeq) || 0);
        }
        if (role === 'player' && state.scene && sid === getPlayerScene() && JSON.stringify(next.meta || null) !== hadMeta) loadSceneImage(sid);
        requestDraw();
      }
    }));
    unsubs.push(adapter.subscribe('map/public/playerScenes', (value) => {
      shared.playerScenes = value || {};
      if (role === 'player' && state.scene) loadSceneImage(getPlayerScene());
      requestDraw();
    }));
    unsubs.push(adapter.subscribe('map/public/events/slide', (value) => {
      if (value && value.id) startSlide(value.id, value.points);
    }));
    unsubs.push(adapter.subscribe('map/public/events/ping', (value) => {
      if (!value) return;
      state.pings.push(value);
      ensureAnim();
      requestDraw();
    }));
    unsubs.push(adapter.subscribe('map/public/events/loot', (value) => {
      if (!value || role !== 'dm') return;
      if (window.SSDNSLootGive && window.SSDNSLootGive.applyRemote) window.SSDNSLootGive.applyRemote(value);
    }));
    unsubs.push(adapter.subscribe('table/initiative', (value) => syncCombatants(value)));
    unsubs.push(adapter.subscribe('chat', (value) => { if (Array.isArray(value)) setChat(value); }));
    unsubs.push(adapter.subscribe('tableFeed', (value) => { if (value) pushFeed(value); }));
    if (role === 'dm') {
      unsubs.push(adapter.subscribe('map/dm/tokens', (value, meta) => {
        const path = meta && meta.path || '';
        const id = path.split('/').pop();
        if (id && value) {
          shared.tokens[id] = Object.assign(shared.tokens[id] || {}, value);
          applySharedToTokens();
          requestDraw();
        }
      }));
      unsubs.push(adapter.subscribe('map/dm/library', (value) => {
        if (!value || typeof value !== 'object') return;
        Object.keys(value).forEach(id => { if (value[id] && value[id].id) library[id] = value[id]; });
        try { localStorage.setItem('ssdns.maps.v1', JSON.stringify(library)); } catch (e) {}
        fillSceneSelect();
        if (window.SSDNSMapLibrary && window.SSDNSMapLibrary.refresh) window.SSDNSMapLibrary.refresh();
      }));
      unsubs.push(adapter.subscribe('map/dm/assetLibrary', (value) => { absorbAssetLibrary(value); }));
      unsubs.push(adapter.subscribe('map/dm/dismissed', (value, meta) => {
        const path = (meta && meta.path) || '';
        const id = path.split('/').pop();
        if (!state.dismissed || typeof state.dismissed !== 'object') state.dismissed = {};
        if (!id || id === 'dismissed') {
          state.dismissed = value && typeof value === 'object' ? Object.assign({}, value) : {};
          return;
        }
        if (value) state.dismissed[id] = true;
        else delete state.dismissed[id];
      }));
    }
  }

function libraryApi() {
  return {
    role,
    list: allScenes,
    builtins: builtinScenes,
    world: worldMaps,
    library: () => library,
    current: activeSceneId,
    swap: swapScene,
    snapshot: snapshotScene,
    restore: restoreSnapshot,
    save: saveLibraryEntry,
    remove: removeLibraryEntry,
    asset,
    toast,
    gridOf: sceneGrid,
    sceneState: sid => sceneData(sid),
    pushHandout: (w) => {
      const url = new URL(asset(w.img), location.href).href;
      if (typeof window.SSDNSPushHandout === 'function') return window.SSDNSPushHandout({ name: w.name, url, text: w.text || '', to: 'all' }, true);
      toast('Handouts need the DM Command Center');
      return Promise.resolve(false);
    }
  };
}
async function boot() {
  try {
    const data = await load();
    state.scene = data.scene;
    const remoteIds = Object.keys(shared.tokens || {});
    if (role === 'player' && remoteIds.length) {
      state.tokens = Object.values(shared.tokens).filter(t => !t.hidden);
    } else if (role === 'dm' && tokensReady && remoteIds.length) {
      state.tokens = remoteIds.map(id => JSON.parse(JSON.stringify(shared.tokens[id])));
    } else {
      state.tokens = data.tokens || [];
    }
    state.room = data.room;
    applySharedToTokens();
    migrateGlobalToScenes();
    collapsePlainWalls();
    sceneData('scn_dustyspur01').fogRevealed = false;
    if (role === 'dm') {
      fillGrant();
      const grantSel = q('grantUid');
      if (grantSel) on(grantSel, 'pointerdown', fillGrant);
      fillSceneSelect();
      const fb = q('fogBtn');
      if (fb) { fb.textContent = 'Fog: ON'; fb.classList.add('active'); }
      const fov = q('showFovBtn');
      if (fov) { fov.textContent = 'Show Player FOV: ON'; fov.classList.add('active'); }
      state.showPlayerFov = true;
    }

    /* A live initiative subscribe can land before the scene image finishes. Do not
       wipe that turn id with the empty seed the host passes before the fight syncs. */
    if (!state.initiative || !((state.initiative.order || []).length)) {
      const order = data.room.table?.initiative?.order || [];
      const turnIdx = data.room.table?.initiative?.turn ?? 0;
      state.currentTurnId = order[turnIdx]?.id || null;
    }

    const img = new Image();
    img.src = asset('dusty-spur-saloon_30x20_70px.webp');
    await img.decode();
    state.scene._img = img;
    if (role === 'player') loadSceneImage(getPlayerScene());

    const { cols, rows, px } = state.scene.grid;
    const savedGrid = options.getGrid ? parseFloat(options.getGrid()) : NaN;
    if (!isNaN(savedGrid)) {
      state.gridStrength = savedGrid;
      const slider = q('strength');
      if (slider) slider.value = savedGrid;
    }
    const me = role === 'player' ? state.tokens.find(t => t.ownerUid === uid) : null;
    if (me) {
      state.view.x = (me.pos.x + 0.5) * px;
      state.view.y = (me.pos.y + 0.5) * px;
    } else {
      state.view.x = (cols * px) / 2;
      state.view.y = (rows * px) / 2;
    }
    if (role === 'dm') {
      viewReady = true;
      syncPartyFromSnapshot();
      if (options.ensureScene) ensureDefaultScene();
    }

    el.classList.remove('hidden');
    paintZoom();
    resize();
  } catch (err) {
    console.error(err);
    toast('Failed to load map: ' + (err && err.message ? err.message : err));
    el.classList.remove('hidden');
  }

  if (!state.initiative) {
    const seeded = state.room && state.room.table && state.room.table.initiative;
    const hasOrder = seeded && Array.isArray(seeded.order) && seeded.order.length;
    if (hasOrder) syncCombatants(seeded);
    else {
      renderTurnStrip();
      renderActions();
    }
  }
  on(window, 'ssdns:pips-change', () => {
    state.moveReachKey = '';
    checkFeet();
    /* B4: the sheet already spent. Repaint the map Fight card and the DM strip so the pip doesn't look free. */
    try {
      if (role === 'player') paintPlayerFight();
      else fillStripMarkers();
    } catch (e) {}
    requestDraw();
  });
  on(window, 'ssdns:pips-reset', () => {
    state.moveHover = null;
    state.moveReachKey = '';
    clearReactHold();
    exitMoveMode('turn');
    requestDraw();
  });
  on(window, 'ssdns:oa-spent', (ev) => {
    const id = ev && ev.detail;
    if (id && window.SSDNSReact && window.SSDNSReact.noteSpent) window.SSDNSReact.noteSpent(id);
  });
  if (typeof options.onReady === 'function') {
    try { options.onReady(); } catch (e) {}
  }
}

boot().catch(err => { console.error(err); toast('Failed to load map: ' + (err && err.message ? err.message : err)); });

function shoveToken(id, spec) {
  spec = spec || {};
  if (role !== "dm") return null;
  const t = tokenByRef(id);
  if (!t || !t.pos) return null;
  const feet = Math.max(0, Number(spec.feet) || 0);
  if (!feet) return null;
  const squares = feet / 5;
  const fromTok = spec.fromId ? tokenByRef(spec.fromId) : null;
  const size = t.size || 1;
  const cx = t.pos.x + size / 2;
  const cy = t.pos.y + size / 2;
  let fx = cx;
  let fy = cy;
  if (fromTok && fromTok.pos) {
    const fs = fromTok.size || 1;
    fx = fromTok.pos.x + fs / 2;
    fy = fromTok.pos.y + fs / 2;
  } else if (spec.from && spec.from.x != null) {
    fx = Number(spec.from.x);
    fy = Number(spec.from.y);
  } else return null;
  let dx = cx - fx;
  let dy = cy - fy;
  const len = Math.hypot(dx, dy) || 1;
  dx /= len;
  dy /= len;
  if (spec.dir === "pull") { dx = -dx; dy = -dy; }
  let destX = Math.round(t.pos.x + dx * squares);
  let destY = Math.round(t.pos.y + dy * squares);
  if (spec.dir === "pull" && fromTok && fromTok.pos) {
    const overlap = Math.abs(destX - fromTok.pos.x) < 1 && Math.abs(destY - fromTok.pos.y) < 1;
    if (overlap) {
      destX = Math.round(t.pos.x + dx * Math.max(0, squares - 1));
      destY = Math.round(t.pos.y + dy * Math.max(0, squares - 1));
    }
  }
  const origin = { x: t.pos.x, y: t.pos.y };
  const dest = { x: destX, y: destY };
  if (dest.x === origin.x && dest.y === origin.y) return { from: origin, to: dest, moved: false };
  t.pos = { x: dest.x, y: dest.y };
  if (shared.tokens[t.id]) shared.tokens[t.id].pos = { x: dest.x, y: dest.y };
  startSlide(t.id, [origin, dest]);
  saveToken(t.id);
  draw();
  return { from: origin, to: dest, moved: true };
}
function setTokenHidden(id, hidden) {
  if (role !== "dm") return null;
  const t = tokenByRef(id);
  if (!t) return null;
  t.hidden = !!hidden;
  if (shared.tokens[t.id]) shared.tokens[t.id].hidden = t.hidden;
  saveToken(t.id);
  draw();
  return { id: t.id, hidden: t.hidden };
}
attachInteract();
return {
  destroy,
  syncCombatants,
  setChat,
  pushFeed,
  requestDraw,
  refreshCard,
  refreshStrip: fillStripMarkers,
  refreshMove: function () {
    state.moveHover = null;
    state.moveReachKey = '';
    checkFeet();
    if (role === 'dm') {
      try { fillStripMarkers(); } catch (e) {}
      if (state.drawerOpen) { try { renderDrawer(); } catch (e2) {} }
    }
    requestDraw();
  },
  feetBetween: function (idA, idB) {
    return feetBetween(tokenByRef(idA), tokenByRef(idB));
  },
  refreshPlayers: function () {
    fillGrant();
    ensurePartyTokens();
    syncSnapshotLights();
    if (role === 'player') paintAddMine();
  },
  addPlayerTokenFor,
  ensureDefaultScene: ensureDefaultScene,
  maps: function () { return libraryApi(); },
  placeLinkedToken,
  pinLootChest,
  tokenPos,
  focusLootChest,
  setTool,
  removeToken: function (id) { removeMapTokens([id], { silent: true }); },
  applyLink,
  patchToken,
  tokenForPlayer,
  hasToken,
  releaseToken,
  armAttack,
  placeBlast,
  cancelBlast,
  tokensInBlast,
  shoveToken,
  setTokenHidden,
  setSpellZones: setSpellZones,
  spellZones: function () { return spellZoneList(); },
  clearSpellZones: function (opts) { return clearSpellGrid(opts || {}); },
  turnKey: function () { return zoneTurnKey(); },
  tokenSnapshot: function (id) { return tokenSnapshot(id); },
  /* fog-aware targeting */
  canPlayerSee: function (viewerUid, targetId) { return canPlayerSee(viewerUid, targetId); },
  /* N59: which closed doors this client paints a glyph for. Secret doors stay shown:false. */
  doorGlyphs: function () { return doorGlyphReport(); },
  /* N87: Open / Lockpick / Peek go through SSDNSAssets.onInteract ({door:true}). */
  doorInteract: function (wallRef, action) {
    const Assets = window.SSDNSAssets;
    if (Assets && Assets.onInteract) {
      return Assets.onInteract({ door: true, wall: wallRef, action: action || "" }, action || "", uid);
    }
    return { ok: false, door: true, stub: true };
  },
  targetSight: function (targetId) { return targetSight(targetId); },
  /* attack-fx: DM -> draw + publish the cleaned row; player -> draw locally only. */
  fx: function (spec) {
    if (!spec) return null;
    if (role === 'dm') return dmFx(spec, spec.id || '');
    startFx(spec, { local: true });
    return null;
  },
  fxPublic: function (spec) { return fxPublic(spec || {}); },
  fxActive: function () { return fxLive.length; },
  fxLog: function () { return (state.fxLog || []).slice(); },
  fxAnimating: function () { return !!fxRaf; },
  tokensLoaded: function () { return !!(tokensReady && state.scene); },
  focusToken: function (id) {
    const t = state.tokens.find(tok => tok && tok.id === id);
    if (!t) return '';
    selectToken(t);
    return t.id;
  },
  /* token size: read-only footprints for tests/tools. Same visibility as drawing: players never get hidden tokens. */
  /* B6: the floor this client is drawing, plus occupancy and hit-test on that floor only. */
  viewedScene: function () { return activeSceneId(); },
  squareTaken: function (x, y, ignoreId) {
    const skip = {};
    if (ignoreId) skip[ignoreId] = 1;
    return cellTaken(x, y, skip);
  },
  hitToken: function (wx, wy) {
    const t = hitTest(wx, wy);
    return t ? t.id : '';
  },
  tokenBoxes: function () {
    const px = (state.scene && state.scene.grid && state.scene.grid.px) || 70;
    return state.tokens.filter(t => t && t.pos && !(t.hidden && role !== 'dm') && onViewedScene(t)).map(t => {
      const sz = t.size || 1;
      const a = worldToScreen(t.pos.x * px, t.pos.y * px);
      const b = worldToScreen((t.pos.x + sz) * px, (t.pos.y + sz) * px);
      return { id: t.id, label: t.label || t.name || '', kind: t.kind || '', size: sz, x: t.pos.x, y: t.pos.y,
        hidden: !!t.hidden, sceneId: t.sceneId || '', screen: { x1: a.x, y1: a.y, x2: b.x, y2: b.y } };
    });
  },
  drawerTokenId: function () { return state.drawerOpen ? (state.drawerTokenId || '') : ''; },
  tokenForCombatant: function (cid) { const t = tokenForCombatant(cid); return t ? t.id : ''; },
  combatantForToken: function (id) { return tokenCombatant(id) || ''; },
  releaseReactHold: releaseReactHold,
  dedupeLinkedTokens,
  staleTokenIds,
  clearStaleTokens
};
}
};

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
      var haveCard = info.dmMax != null && info.dmMax !== "" && info.dmCur != null && info.dmCur !== "";
      if (haveCard) {
        cur = num(info.dmCur);
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
  let fxShake = { x: 0, y: 0 };
  let fxShaking = false;
  let fxFrameOn = false;

  function q(name) { return el.querySelector('[data-act="' + name + '"]'); }
  function on(target, ev, fn, opt) { target.addEventListener(ev, fn, opt); listeners.push([target, ev, fn, opt]); }
  function emit(name, detail) {
    el.dispatchEvent(new CustomEvent(name, { detail }));
    if (host.on) host.on(name, detail);
  }
  function requestDraw() { if (raf || dead) return; raf = requestAnimationFrame(() => { raf = 0; if (!dead) { draw(); placeCommandMenu(); } }); }
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
      conditionSpells: t.conditionSpells ? Object.assign({}, t.conditionSpells) : {},
      sceneId: t.sceneId || activeSceneId() || 'scn_dustyspur01', image: t.image || '',
      veil: !!t.veil,
      ownerUid: t.ownerUid || '', controlledBy: t.controlledBy || [],
      ownerCanMove: t.ownerCanMove !== false, locked: !!t.locked,
      label: t.label || t.name || '', size: t.size || 1, name: t.name || '',
      kind: t.kind || '', storyMarker: t.storyMarker || '', lootBoxId: t.lootBoxId || '',
      weaponDrop: t.weaponDrop ? { name: t.weaponDrop.name || t.name || '', itemId: t.weaponDrop.itemId || '', dirty: !!t.weaponDrop.dirty, taken: !!t.weaponDrop.taken } : null,
      spellPiece: t.spellPiece || '', zoneId: t.zoneId || '',
      noHpPool: !!t.noHpPool, notTargetable: !!t.notTargetable, noInit: !!t.noInit,
      damageBudget: t.spellPiece === 'guardian of faith' ? (Number(t.damageBudget) || 60) : null,
      budgetLeft: t.spellPiece === 'guardian of faith' ? (t.budgetLeft != null ? Number(t.budgetLeft) : (Number(t.damageBudget) || 60)) : null,
      assetDefId: t.assetDefId || '', asset: pubAsset,
      moveFeet: t.moveFeet != null && t.moveFeet !== '' ? Number(t.moveFeet) : null,
      /* Fight-row gear is not a token field. */
      lootLock: t.kind === 'chest' && t.loot ? {
        name: t.loot.name || '', boxType: t.loot.boxType || '',
        lock: t.loot.lock || null, barrier: t.loot.barrier || null,
        hidden: !!t.loot.hidden, found: t.loot.found !== false, hideDc: t.loot.hideDc || 0,
        trap: t.loot.trap || null
      } : null,
      lootState: t.loot ? {
        taken: !!t.loot.taken,
        opened: !!t.loot.opened,
        rows: (t.loot.contents || []).map(r => ({ id: r && r.id, taken: !!(r && r.taken) })),
        lock: t.loot.lock ? {
          dc: Number(t.loot.lock.dc) || 0,
          unlocked: !!t.loot.lock.unlocked,
          allowRetries: !!t.loot.lock.allowRetries,
          attempts: t.loot.lock.attempts || {}
        } : null
      } : null
    };
  }
  const buriedTokens = {};
  function buryToken(id) {
    if (!id) return;
    buriedTokens[String(id)] = Date.now();
  }
  function tokenBuried(id) {
    return !!(id && buriedTokens[String(id)]);
  }
  function saveToken(id) {
    if (role !== 'dm') return;
    if (tokenBuried(id)) return;
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
      if (s.conditionSpells && typeof s.conditionSpells === "object") t.conditionSpells = Object.assign({}, s.conditionSpells);
      stampScene(t, s);
      if ((s.kind === 'asset' || t.kind === 'asset') && s.image && s.image !== t.image) t._img = null;
      t.image = s.image || t.image || '';
      if (s.kind === 'party' || s.storyMarker === 'party' || t.kind === 'party' || t.storyMarker === 'party') {
        const face = partyFace(t.image);
        if (face !== t.image) {
          t.image = face;
          t._img = null;
          if (s) s.image = face;
          if (role === 'dm') saveToken(t.id);
        }
      }
      t.veil = !!s.veil;
      t.sheetId = s.sheetId || t.sheetId || '';
      if (s.spellPiece) t.ownerUid = s.ownerUid || '';
      else if (s.ownerUid) t.ownerUid = s.ownerUid;
      if (s.combatantId) t.combatantId = s.combatantId;
      if (s.kind) t.kind = s.kind;
      if (s.storyMarker) t.storyMarker = s.storyMarker;
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
      if (s.damageBudget != null && s.damageBudget !== '') t.damageBudget = Number(s.damageBudget) || 0;
      if (s.budgetLeft != null && s.budgetLeft !== '') t.budgetLeft = Number(s.budgetLeft);
      if (s.spellPiece && s.size) t.size = tokSquares(s.size);
      if (s.name) t.name = s.name;
      if (s.lootBoxId) t.lootBoxId = s.lootBoxId;
      if (s.weaponDrop && typeof s.weaponDrop === 'object') t.weaponDrop = Object.assign({}, s.weaponDrop);
      if (s.lootLock && (!t.loot || !t.loot.id)) t.loot = Object.assign({ id: s.lootBoxId || t.lootBoxId || '' }, s.lootLock);
      else if (s.loot && s.loot.id && (!t.loot || !t.loot.id)) t.loot = s.loot;
      if (s.lootState && t.loot) {
        adoptLootState(t.loot, s.lootState);
        const menu = el.querySelector('[data-act="chestMenu"]');
        const boxId = t.lootBoxId || (t.loot && t.loot.id) || '';
        if (menu && !menu.hidden && menu.getAttribute('data-box') === boxId) menu.innerHTML = chestMenuHtml(t.loot);
      }
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
  /* Last canvas size that was actually paintable. A 0×0 read during fullscreen must not replace it. */
  layoutBox: null,
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
  /* DM "Show downed". Off hides Unconscious / 0 HP from targeting and saves. Room setting, not this device. */
  showDowned: false,
  /* Yellow bright / blue dim / gray darkvision measurement strokes. Off: lighting wash and FOV stay, the rings do not. DM only. */
  showLightRings: false,
  /* B13: in a fight, green reach and click-to-walk are off until the strip Move chip is on.
     Outside a fight this flag is ignored and click-to-move stays free. Edit tokens bypasses it. */
  moveMode: false,
  /* Reach and path arrows stay off until the token menu's Move is tapped. */
  moveArmed: false,
  commandToken: "",
  /* DM "Edit tokens". Off by default. Persisted only for the DM role (ssdns.map.dmEdit). */
  dmEdit: false,
  rangeWeaponId: "",
  rangeChoices: [],
  rangeMoved: {},
  playerTarget: "",
  /* Last creature chosen in the target picker. Survives a redraw that would
     otherwise land on Free shot. Cleared when they pick Free shot or No target. */
  lastAimId: "",
  aimBlank: false,
  drawerOpen: false,
  drawerTokenId: null,
  drawerOffhand: false,
  drawerFan: false,
  pendingTarget: null,
  spellZones: [],
  spellZonesLive: false,
  /* True after a DM scene or a full DM zone publish. Players may then drop a piece whose zone is gone. */
  zoneRoster: false,
  spellEmitters: [],
  spellEmittersLive: false,
  lightSeq: 0,
  lightRound: 0,
  lightCast: null,
  selectedLight: "",
  selectedDark: "",
  /* Clear-row hover. The id is a zone in this scene, or "". Players never set it. */
  zonePulse: "",
  zoneSeq: 0,
  /* Ids a DM expiry or Clear already removed. A later sheet sync cannot put that instance back. */
  zoneGone: {},
  role,
  uid,
  chat: [],
  initiative: null
};
if (window.SSDNSMoveMode && window.SSDNSMoveMode.isOn()) state.moveMode = true;
/* DM-only. A player map never reads these keys, even if the same browser stored them. */
if (role === 'dm') {
  try { state.dmEdit = localStorage.getItem('ssdns.map.dmEdit') === '1'; } catch (e) {}
  try { state.showLightRings = localStorage.getItem('ssdns.map.lightRings') === '1'; } catch (e2) {}
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
/* DM-only remaining-rounds plates. Players keep the layer empty and hidden. */
const zoneBadgeLayer = document.createElement('div');
zoneBadgeLayer.className = 'ssm-zone-badges';
zoneBadgeLayer.setAttribute('aria-hidden', 'true');
if (role !== 'dm') zoneBadgeLayer.hidden = true;
el.appendChild(zoneBadgeLayer);
let zoneBadgeSig = '';
let zoneListSigSeen = '';

const toolbar = document.createElement('div');
toolbar.className = 'ssdns-toolbar';
toolbar.innerHTML = `
  <span data-act="roleBadge">${role === 'player' ? 'Player' : role.toUpperCase()}</span>
  <label>Grid <input data-act="strength" type="range" min="1" max="3" step="0.1" value="1"></label>
  <button data-act="helpBtn">?</button>
  <span data-act="zoomLabel">1.00×</span>
  <button data-act="reset">Reset view</button>
  <button data-act="fxBtn" type="button" class="ssm-fx-btn" title="Attack effects on the map (firing lines). Saved for you on this device.">Effects: ON</button>
  <button data-act="condPillBtn" type="button" class="ssm-cond-pill-btn" title="Condition pills on tokens. Normal is the olive and gold word over the token. Compact is a smaller bubble. Saved for you on this device.">Pills: Normal</button>
  ${role === 'dm' ? `<button data-act="showDownedBtn" type="button" class="ssm-fx-btn" aria-pressed="false" title="Unconscious and 0 HP tokens stay out of targeting and saves. Turn this on to include them. The room follows this switch.">Show downed: OFF</button>` : ``}
  ${role === 'dm'
    ? `<button data-act="challengeBtn" type="button" class="ssm-challenge" title="Challenge picked players. Same check picker as the DMCC bar.">Challenge</button>
    <button data-act="shortRestBtn" type="button" title="Short rest for every seated player. Same command as Fight → Short rest (party).">Short rest (party)</button>
    <button data-act="longRestBtn" type="button" title="Long rest for every seated player. Same command as Fight → Long rest (party).">Long rest (party)</button>`
    : `<button data-act="shortRestBtn" type="button" title="Short rest on this character. Same as the sheet Short rest, including the tools prompt.">Short rest</button>
    <button data-act="longRestBtn" type="button" title="Long rest on this character. Same as the sheet Long rest.">Long rest</button>`}
  ${role === 'dm' ? `
    <button data-act="fogBtn" class="active">Fog: ON</button>
    <button data-act="showFovBtn" class="active">Show Player FOV: ON</button>
    <button data-act="mapsBtn" class="ssm-maps-btn" title="Maps: built-in, my maps, world">Maps ▾</button>
    <button data-act="betweenBtn" type="button" title="Show the Between Encounters cover to the table. Players follow. Fog stays off and the scene starts bright. Raise the Grid slider to put squares on it.">Between encounters</button>
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
  if (e.key === 'Escape' && state.lightCast) {
    e.preventDefault();
    cancelLightCast();
    return;
  }
  if (role === 'dm' && e.key === 'Escape' && state.pendingTarget) {
    e.preventDefault();
    cancelPendingTarget();
    return;
  }
  /* B13: Esc leaves Move mode even when the strip, not the canvas, has focus. A fog polygon
     in progress and a text field keep Esc for themselves. */
  if (e.key === 'Escape' && state.moveArmed) {
    const tag = e.target && e.target.tagName;
    const typing = tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA';
    if (!typing) {
      e.preventDefault();
      cancelTokenCommand('esc');
      return;
    }
  }
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
  if (row && row.event === 'zone-tick') { applyZoneTickFeed(row); return; }
  if (row && row.event === 'spell-light') { applyLightFeed(row); return; }
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
    <button type="button" data-act="placeChestBtn" title="Drop a chest on the map. Lock DC is the number above, once a door is selected. Before that, the field defaults to 15. 0 is unlocked. Guide: 10, 15, 20, 25.">Place chest</button>
    <label title="When on, the same character may pick this lock again."><input data-act="lockAllowRetries" type="checkbox"> Allow retries</label>
    <button type="button" data-act="resetLockBtn" title="Clear every character's attempt on the selected door or chest.">Reset attempts</button>
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
    <div class="ssm-right-scroll">
    <div class="panel-title">DM Tools</div>
    <div class="ssm-move-tools" data-act="moveTools" role="group" aria-label="Token moves">
      <button type="button" data-act="lockBtn">Lock</button>
      <button type="button" data-act="undoBtn">Undo Move</button>
      <button type="button" data-act="redoBtn">Redo Move</button>
    </div>
    <button data-act="addTokenBtn">Add token</button>
    <button type="button" data-act="bestiaryBtn" aria-expanded="false" title="Place a bestiary creature: it joins the fight already linked">Bestiary</button>
    <button type="button" data-act="randomizeLootBtn" title="Add pocket loot to every enemy on this map. Skips players, allies, spell pieces, and tokens already rolled or already dropped.">Randomize loot</button>
    <button data-act="addPcBtn">Add player token</button>
    <button type="button" data-act="partyTokenBtn" title="One story marker for the whole party on this map. It is not a fighter, and moving it does not move anyone's token.">Party token</button>
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
    <div class="ssm-light-legend" data-act="lightLegend" data-ambient="dark" aria-label="Light: Bright, Dim, Dark, magical darkness">
      <span data-level="bright">Bright</span>
      <span data-level="dim">Dim</span>
      <span data-level="dark">Dark</span>
      <span data-level="mdark">Magic</span>
    </div>
    <label class="ssm-range" title="DM guide only. Bright and dim rings for measuring light. Players never see them. The light itself is how it cuts through fog and darkness."><input type="checkbox" data-act="showLightRings"> Light rings (DM guide)</label>
    <label class="ssm-ambient" title="Own token is the default. Shared party sight is the live union of every party member. Squares close when nobody still sees them.">Sight
      <select data-act="visionSel" aria-label="Player sight">
        <option value="own">Own token</option>
        <option value="party">Shared party sight</option>
      </select>
    </label>
    <label class="ssm-ambient">Region
      <select data-act="regionLevel" aria-label="Light region level">
        <option value="dim">Dim</option>
        <option value="bright">Bright</option>
        <option value="dark">Dark</option>
        <option value="mdark">Magical darkness</option>
      </select>
    </label>
    <button type="button" data-act="regionBtn" title="Drag a box. Bright, Dim, and Dark replace the map ambient. Magical darkness is the ink wash: darkvision and ordinary light do not pierce it.">Paint region</button>
    <button type="button" data-act="regionEraseBtn" title="Click a painted light region to remove it.">Erase region</button>
    <button type="button" data-act="testLightBtn" aria-pressed="false" title="Drop a torch on a square. Click the same square to put it out, then again to pick it up. Bright 20 ft, dim 20 ft.">Test light</button>
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
    </div>
    <div class="ssm-spell-grids" data-act="spellGrids">
      <div class="panel-title">Spell grids</div>
      <div data-act="zoneList" class="panel-list">None</div>
      <div class="ssm-time-skip" data-act="timeSkip">
        <div class="panel-title">Advance time</div>
        <button type="button" data-act="timeSkipBtn" data-steps="1" data-tip="Count zone timers down by 1 round. No damage or saves for the skipped round.">+1 round</button>
        <button type="button" data-act="timeSkipBtn" data-steps="10" data-tip="Count zone timers down by 10 rounds (1 minute). No damage or saves for the skipped rounds.">+1 min</button>
        <button type="button" data-act="timeSkipBtn" data-steps="100" data-tip="Count zone timers down by 100 rounds (10 minutes). No damage or saves for the skipped rounds.">+10 min</button>
        <button type="button" data-act="timeSkipBtn" data-steps="600" data-tip="Count zone timers down by 600 rounds (1 hour). No damage or saves for the skipped rounds.">+1 hour</button>
      </div>
      <button type="button" data-act="clearAllZonesBtn" title="Remove every spell grid in this scene">Clear all grids</button>
    </div>
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
      <span class="n62-pill" data-act="n62Call" hidden></span>
      <button type="button" data-act="playerDock" title="Dock to the side" hidden>Dock</button>
    </div>
    <div class="ssm-card-body n62">
      <div class="n62-zone">
        <div class="n62-zlabel">1 · Identity</div>
        <div class="ssm-stat" data-act="playerStats"></div>
        <div data-act="n62Conds"></div>
      </div>
      <div data-act="n62Full">
        <div class="n62-econ" data-act="n62Econ"></div>
        <div class="n62-tabsbar" data-act="n62Tabs">
          <button type="button" data-n62-tab="fight" class="on">Fight</button>
          <button type="button" data-n62-tab="gear">Gear</button>
          <button type="button" data-n62-tab="more">More</button>
        </div>
        <div data-n62-pane="fight">
          <div class="n62-zone">
            <div class="n62-zlabel">2 · Primary — one card height</div>
            <div class="n62-arms" data-act="n62Arms"></div>
            <div class="n62-switch" data-act="n62Switch"></div>
            <div data-act="actionSlot" data-n62-bind="1"></div>
          </div>
          <div class="n62-zone">
            <div class="n62-zlabel">3 · Overflow</div>
            <details class="n62-acc" data-n62-acc="cond">
              <summary>Conditions <small data-act="n62CondSum">none</small></summary>
              <div class="n62-accbody" data-act="n62CondBody"></div>
            </details>
            <details class="n62-acc" data-n62-acc="cover">
              <summary>Cover &amp; range <small>Show range</small></summary>
              <div class="n62-accbody">
                <label class="ssm-range"><input type="checkbox" data-act="showRange"> Show my range</label>
                <select data-act="rangeWeapon" aria-label="Equipped weapon" hidden></select>
              </div>
            </details>
            <details class="n62-acc" data-n62-acc="link">
              <summary>Link · lights · vision</summary>
              <div class="n62-accbody">
                <div class="n62-zlabel">Light</div>
                <div class="ssm-lights" data-act="playerLights">No light in hand</div>
                <div class="ssm-spell-lights" data-act="playerSpellLights"></div>
                <div class="ssm-light-legend" data-act="lightLegend" data-ambient="dark" aria-label="Light: Bright, Dim, Dark, magical darkness">
                  <span data-level="bright">Bright</span>
                  <span data-level="dim">Dim</span>
                  <span data-level="dark">Dark</span>
                  <span data-level="mdark">Magic</span>
                </div>
              </div>
            </details>
            <details class="n62-acc" data-n62-acc="extras">
              <summary>Gear extras <small>reload · consumables</small></summary>
              <div class="n62-accbody" data-act="n62Extras"></div>
            </details>
          </div>
          <button type="button" class="n62-end" data-act="n62End">End turn ▸</button>
        </div>
        <div data-n62-pane="gear" hidden>
          <div class="n62-zone">
            <div class="n62-zlabel">Gear</div>
            <div class="ssm-tools">
              <button type="button" data-act="playerPingBtn">Ping</button>
              <button type="button" data-act="playerRulerBtn">Ruler</button>
              <button type="button" data-act="addMineBtn" hidden>Add my token</button>
            </div>
            <div data-act="n62GearList"></div>
          </div>
        </div>
        <div data-n62-pane="more" hidden>
          <div class="n62-zone">
            <div class="n62-zlabel">More</div>
            <div data-act="n62MoreList"></div>
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
        </div>
      </div>
      <div data-act="n62Compact" hidden></div>
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
/* Shared with token slides. 50ms cap: a hitch eases forward instead of skipping the impact. */
const fxAnimNow = (FXA && FXA.makeAnimClock) ? FXA.makeAnimClock(50) : function (wall) { return wall; };
function fxStamp() {
  const wall = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
  return fxAnimNow(wall);
}
const fxBoot = Date.now();
const fxLive = [];
/* Short lights riding a fire or lightning projectile. Cleared when the FX ends or Effects is off. */
let fxBoltLights = [];
const fxTimers = [];
const fxDrew = [];
let fxRaf = 0;
state.fxLog = [];
function fxRemember(id) {
  if (!id) return;
  const key = String(id);
  if (fxDrew.indexOf(key) >= 0) return;
  fxDrew.push(key);
  if (fxDrew.length > 48) fxDrew.shift();
}
function fxRemembered(id) {
  return !!(id && fxDrew.indexOf(String(id)) >= 0);
}
/* A public row id is fx_<rollId>; the caster remembered the roll id when they painted locally. */
function fxAlready(id) {
  if (!id) return false;
  const key = String(id);
  if (fxRemembered(key)) return true;
  if (key.indexOf('fx_') === 0 && fxRemembered(key.slice(3))) return true;
  if (fxRemembered('fx_' + key)) return true;
  return false;
}
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
function fxTokenRaw(ref) {
  if (!ref) return null;
  const t = tokenByRef(String(ref));
  if (!t || !t.pos) return null;
  return t;
}
function fxRef(ref) {
  const t = fxTokenRaw(ref); /* id, combatantId (DM only: public tokens carry none) or ownerUid */
  if (!t) return null;
  if (role === 'player' && t.hidden) return null;
  return t;
}
/* A free shot has no target: it fires toward the shooter's last target if there is one, else the nearest other side. */
function fxPoint(spec) {
  const p = spec && spec.at;
  if (!p) return null;
  const x = Number(p.x), y = Number(p.y);
  if (!isFinite(x) || !isFinite(y)) return null;
  return { x: x, y: y };
}
function fxFacing(S, spec) {
  if (spec && spec.dir && isFinite(spec.dir.x) && isFinite(spec.dir.y) && (spec.dir.x || spec.dir.y)) return spec.dir;
  const c = fxCenter(S);
  let best = null, bestD = Infinity;
  const faceScene = sceneKey(S);
  (state.tokens || []).forEach(t => {
    if (!t || t === S || !t.pos || t.hidden || t.kind === 'marker' || isPartyToken(t)) return;
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
  const rawT = fxTokenRaw(spec.target);
  const melee = type === 'blade' || type === 'blunt';
  const ownCast = !!(spec.shooter && String(spec.shooter) === String(uid));
  const geo = { type, S: null, T: null, rS: 0.42, rT: 0.42, src: null, srcHidden: false, dir: null };
  /* A hidden token stays hidden. A missing token (no target, or a fight row with no map piece) still lets a spell leave the caster. */
  if (spec.target && rawT && !T) return null;
  if (T) {
    /* The caster's own spell still lands on the token they chose. Other players stay fog-clipped. */
    if (!tokenSeen(T) && !(ownCast && type === 'spell')) return null;
    geo.T = fxCenter(T); geo.rT = fxRadius(T); geo.tokT = T;
  } else {
    const at = fxPoint(spec);
    if (at) {
      if (role === 'player' && !ownCast && !playerSees(at.x, at.y)) return null;
      geo.T = at; geo.rT = 0.55; geo.point = true;
    }
  }
  if (S && tokenSeen(S)) { geo.S = fxCenter(S); geo.rS = fxRadius(S); geo.tokS = S; }
  else if (S && role === 'player' && geo.T) {
    /* shooter is in this player's dark: start where the line comes out of it, no muzzle flash */
    const edge = fxWalk(fxCenter(S), geo.T, playerSees);
    if (!edge) return null;
    geo.src = { x: edge.x, y: edge.y }; geo.srcHidden = true;
  } else if (!S && spec.src && geo.T) {
    const from = { x: Number(spec.src.x), y: Number(spec.src.y) };
    if (!isFinite(from.x) || !isFinite(from.y)) return null;
    const edge = role === 'player' ? fxWalk(from, geo.T, playerSees) : { x: from.x, y: from.y };
    if (!edge) return null;
    geo.src = { x: edge.x, y: edge.y }; geo.srcHidden = true;
  } else if (geo.T && type === 'spell') {
    /* A placed point still paints when the caster token is on another floor or did not resolve.
       Shatter's burst belongs on that point. Dropping the geometry read as the aim being rejected. */
    geo.src = { x: geo.T.x, y: geo.T.y };
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
  } else if (!geo.T && type === 'spell' && (geo.S || geo.src)) {
    const from = geo.S || geo.src;
    const faceTok = S || { pos: { x: from.x, y: from.y }, size: 1, ownerUid: spec.shooter || 'x', kind: 'player' };
    const face = fxFacing(faceTok, spec);
    geo.T = { x: from.x + face.x * 3, y: from.y + face.y * 3 };
    geo.rT = 0.42;
    geo.point = true;
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
    entry.t0 = fxStamp();
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
  const screen = { A, B: B || A, S, T, rS, rT, cell, dir, srcHidden: !!g.srcHidden };
  if (entry.spec) {
    screen.hops = fxListScreens(entry.spec.hops);
    screen.rays = fxListScreens(entry.spec.rays);
    screen.dust = !!entry.spec.dust;
    screen.crumbOnly = !!entry.spec.crumbOnly;
    screen.pulse = !!entry.spec.pulse;
  }
  screen.marks = fxMarkNames(g.tokT);
  const look = FXA && FXA.lookOf ? FXA.lookOf(entry.spec || {}) : "";
  screen.pop = look !== "guiding-bolt" && screen.marks.some(n => /^guided\b/i.test(String(n || "")));
  const castRes = String((entry.spec && entry.spec.result) || "");
  const spellNow = String((entry.spec && (entry.spec.spell || entry.spec.weapon)) || "");
  /* Thorn Whip yanks. Hail of Thorns shares the thorn key and must not. */
  if (look === "thorn" && !/hail of thorns/i.test(spellNow) && (castRes === "hit" || castRes === "crit") && g.T && !g.yankOrigin) {
    g.yankOrigin = { x: g.T.x, y: g.T.y };
  }
  if (/hail of thorns/i.test(spellNow) && g.T) {
    screen.hops = (screen.hops || []).concat(fxNeighbors(g.T, 1, [g.tokT, g.tokS]));
  }
  if (/lightning arrow/i.test(spellNow) && g.T) {
    screen.hops = (screen.hops || []).concat(fxNeighbors(g.T, 2, [g.tokT, g.tokS]));
  }
  if (g.yankOrigin) {
    screen.ghost = worldToScreen(g.yankOrigin.x * px, g.yankOrigin.y * px);
    const moved = !!(g.T && Math.hypot(g.T.x - g.yankOrigin.x, g.T.y - g.yankOrigin.y) > 0.35);
    const toward = S || src;
    if (!moved && screen.ghost && toward) {
      const dx = toward.x - screen.ghost.x;
      const dy = toward.y - screen.ghost.y;
      const dist = Math.hypot(dx, dy) || 1;
      const pull = Math.min(cell * 2, Math.max(0, dist - rS - rT - 6));
      screen.yank = { x: (dx / dist) * pull, y: (dy / dist) * pull };
    }
  }
  if (entry.spec && entry.spec.mode) screen.mode = entry.spec.mode;
  if (entry.spec && entry.spec.facing != null && isFinite(Number(entry.spec.facing))) screen.facing = Number(entry.spec.facing);
  return screen;
}
/* Extra beam targets travel as token ids or grid points. Screen pixels are resolved here, not in the painter. */
/* Creatures actually standing near the hit. Squares are 5 ft. Hail is 1, Lightning Arrow splash is 2. */
function fxNeighbors(worldCenter, squares, skip) {
  if (!worldCenter) return [];
  const px = fxPx();
  const out = [];
  (state.tokens || []).forEach(t => {
    if (!t || !t.pos || t.kind === "marker" || t.kind === "asset" || isPartyToken(t)) return;
    if (skip && skip.some(one => one && (one === t || one.id === t.id))) return;
    if (!tokenSeen(t)) return;
    const c = fxCenter(t);
    const d = Math.max(Math.abs(c.x - worldCenter.x), Math.abs(c.y - worldCenter.y));
    if (d <= 0.2 || d > squares + 0.05) return;
    const p = worldToScreen(c.x * px, c.y * px);
    out.push({ x: p.x, y: p.y });
  });
  return out.slice(0, 8);
}
function fxListScreens(list) {
  const px = fxPx();
  const out = [];
  (list || []).forEach(item => {
    if (!item) return;
    const miss = !!(item.miss || item.result === "miss");
    const result = item.result || "";
    if (typeof item === "string" || (item.id && item.x == null && item.y == null)) {
      const t = fxRef(typeof item === "string" ? item : item.id);
      if (!t || !tokenSeen(t)) return;
      const c = fxCenter(t);
      const p = worldToScreen(c.x * px, c.y * px);
      out.push({ x: p.x, y: p.y, miss: miss, result: result });
      return;
    }
    const x = Number(item.x), y = Number(item.y);
    if (!isFinite(x) || !isFinite(y)) return;
    if (role === "player" && !playerSees(x, y)) return;
    const p = worldToScreen(x * px, y * px);
    out.push({ x: p.x, y: p.y, miss: miss, result: result });
  });
  return out;
}
function fxMarkNames(t) {
  if (!t) return [];
  try { return tokenConditions(t) || []; } catch (e) { return []; }
}
let fxErodeCanvas = null;
function fxDustFrame(t) {
  if (!FXA || !t || !FXA.lookOf) return null;
  const now = fxStamp();
  for (let i = 0; i < fxLive.length; i++) {
    const e = fxLive[i];
    if (!e || !e.spec || !e.geo || !e.geo.tokT) continue;
    if (e.geo.tokT !== t && e.geo.tokT.id !== t.id) continue;
    if (FXA.lookOf(e.spec) !== "disintegrate") continue;
    if (!e.spec.dust && !e.spec.crumbOnly) continue;
    const lt = now - e.t0 + (e.spec.crumbOnly ? 640 : 0);
    if (FXA.erodeFront && !(FXA.erodeFront(lt) > 0)) continue;
    let from = null;
    if (e.geo.S) {
      const px = fxPx();
      from = worldToScreen(e.geo.S.x * px, e.geo.S.y * px);
    }
    return { lt: lt, from: from };
  }
  return null;
}
function fxDpr() {
  return Math.min((typeof window !== 'undefined' && window.devicePixelRatio) || 1, 2);
}
function fxCollectShake(now) {
  let x = 0, y = 0;
  if (FXA && FXA.shakeOf) {
    fxLive.forEach(e => {
      const s = FXA.shakeOf(e.spec, now - e.t0);
      if (!s) return;
      x += Number(s.x) || 0;
      y += Number(s.y) || 0;
    });
  }
  const cap = 12;
  const m = Math.hypot(x, y);
  if (m > cap) { x *= cap / m; y *= cap / m; }
  return { x: x, y: y };
}
function fxFrame() {
  fxRaf = 0;
  if (fxFrameOn) return;
  fxFrameOn = true;
  try {
    if (dead || !fxCtx) { fxLive.length = 0; fxShake = { x: 0, y: 0 }; fxShaking = false; return; }
    const box = viewBox();
    const dpr = fxDpr();
    const now = fxStamp();
    for (let i = fxLive.length - 1; i >= 0; i--) {
      if (now - fxLive[i].t0 > fxLive[i].plan.duration) fxLive.splice(i, 1);
    }
    const next = fxCollectShake(now);
    const shook = Math.hypot(next.x, next.y) > 0.4;
    const was = fxShaking;
    fxShake = next;
    fxShaking = shook;
    let erodeLive = false;
    let bodyLive = false;
    fxLive.forEach(e => {
      if (!e.spec || !FXA || !FXA.lookOf) return;
      const look = FXA.lookOf(e.spec);
      if ((e.spec.dust || e.spec.crumbOnly) && look === "disintegrate") erodeLive = true;
      const spellName = String((e.spec && (e.spec.spell || e.spec.weapon)) || "");
      if (look === "thorn" || look === "enfeeble" || look === "deathray" || look === "sickray" || look === "sunburst" || look === "icebomb" || look === "void" || look === "massword" || look === "masscure" || look === "healcolumn" || (look === "cold" && /ray of frost/i.test(spellName))) bodyLive = true;
    });
    let boltLit = false;
    try { boltLit = syncFxLights(now); } catch (eLit) { boltLit = false; }
    if (shook || was || erodeLive || bodyLive || boltLit) { try { draw(); } catch (e) {} }
    if (fxCtx.setTransform) fxCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    fxCtx.clearRect(0, 0, box.w, box.h);
    if (shook && fxCtx.setTransform) fxCtx.setTransform(dpr, 0, 0, dpr, fxShake.x * dpr, fxShake.y * dpr);
    for (let i = fxLive.length - 1; i >= 0; i--) {
      const e = fxLive[i];
      const sg = fxScreen(e);
      try { FXA.paint(fxCtx, e.spec, now - e.t0, sg); } catch (err) { fxLive.splice(i, 1); continue; }
      try { if (FXA.paintGuidePop) FXA.paintGuidePop(fxCtx, e.spec, now - e.t0, sg); } catch (err2) {}
    }
    if (fxCtx.setTransform) fxCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (fxLive.length) fxRaf = requestAnimationFrame(fxFrame);
    else fxCtx.clearRect(0, 0, box.w, box.h);
  } finally {
    fxFrameOn = false;
  }
}
/* Grid light for one in-flight bolt. A hidden caster starts at the fog edge, same as gun FX. */
function fxLightSpan(g) {
  if (!g || !g.T) return null;
  const tok = g.tokS;
  if (tok && tok.hidden) {
    const origin = fxCenter(tok);
    const see = (x, y) => role === 'player' ? playerSees(x, y) : fxPublicSees(x, y, tok.sceneId);
    const edge = fxWalk(origin, g.T, see);
    if (!edge || edge.at < 1) return null;
    return { from: { x: edge.x, y: edge.y }, to: g.T };
  }
  const from = (g.srcHidden && g.src) ? g.src : (g.S || g.src);
  if (!from) return null;
  return { from: from, to: g.T };
}
function syncFxLights(now) {
  const prev = fxBoltLights.length;
  if (!fxOn() || !FXA || !FXA.projectileLight) { fxBoltLights = []; return prev > 0; }
  const lights = [];
  fxLive.forEach(e => {
    if (!e || !e.spec || !e.geo) return;
    const spot = FXA.projectileLight(e.spec, now - e.t0);
    if (!spot) return;
    const span = fxLightSpan(e.geo);
    if (!span) return;
    const u = Math.max(0, Math.min(1, Number(spot.u) || 0));
    const x = span.from.x + (span.to.x - span.from.x) * u;
    const y = span.from.y + (span.to.y - span.from.y) * u;
    if ((e.geo.srcHidden || (e.geo.tokS && e.geo.tokS.hidden)) && role === 'player' && !playerSees(x, y)) return;
    const feet = Number(spot.feet) > 0 ? Number(spot.feet) : 5;
    lights.push({
      x: x, y: y, bright: feet, dim: 0, radius: feet / 5,
      cone: false, facing: 0, name: '', id: 'fx-bolt', magical: true, spell: true
    });
  });
  fxBoltLights = lights;
  return lights.length > 0 || prev > 0;
}
function fxStopAll() {
  fxLive.length = 0;
  const hadLight = fxBoltLights.length > 0;
  fxBoltLights = [];
  fxTimers.splice(0).forEach(t => { try { clearTimeout(t); } catch (e) {} });
  if (fxRaf) { cancelAnimationFrame(fxRaf); fxRaf = 0; }
  const was = fxShaking || fxShake.x || fxShake.y;
  fxShake = { x: 0, y: 0 };
  fxShaking = false;
  if (fxCtx) {
    const box = viewBox();
    if (fxCtx.setTransform) fxCtx.setTransform(fxDpr(), 0, 0, fxDpr(), 0, 0);
    fxCtx.clearRect(0, 0, box.w, box.h);
  }
  if (was || hadLight) { try { draw(); } catch (e) {} }
}
/* Chain hops travel as fight-row ids. Public tokens omit combatantId, so a player
   map cannot resolve them and the extra bolts never draw. Stamp the square the
   party can see. A hidden token or a square outside party sight is left out. */
function fxPublicPoints(list, seen) {
  if (!Array.isArray(list) || !list.length || typeof seen !== "function") return null;
  const out = [];
  list.forEach(item => {
    if (!item || out.length >= 10) return;
    let x = Number(item.x);
    let y = Number(item.y);
    let id = "";
    if (typeof item === "string" || typeof item === "number") id = String(item);
    else if (item.id) id = String(item.id);
    if (!isFinite(x) || !isFinite(y)) {
      const t = fxTokenRaw(id);
      if (!t || !t.pos || t.hidden) return;
      const c = fxCenter(t);
      x = c.x;
      y = c.y;
    }
    if (!seen(x, y)) return;
    const row = { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
    if (id && /^[A-Za-z0-9_-]{1,80}$/.test(id)) row.id = id;
    if (item.miss || item.result === "miss") row.miss = true;
    if (item.result) row.result = item.result;
    out.push(row);
  });
  return out.length ? out : null;
}
/** DM only: what players may receive for this effect. null = players get nothing. Never carries a hidden token. */
function fxPublic(spec) {
  if (role !== 'dm' || !FXA || !spec) return null;
  const type = FXA.classify(spec);
  const S = fxRef(spec.shooter), T = fxRef(spec.target);
  if (!S) {
    const lone = type === 'spell' ? fxPoint(spec) : null;
    if (!lone) return null;
    const placed = {
      type, result: spec.result, spell: spec.spell || '', dmg: spec.dmg || '', self: false,
      facing: spec.facing, at: { x: Math.round(lone.x * 10) / 10, y: Math.round(lone.y * 10) / 10 },
      heard: spec.heard
    };
    if (spec.id) placed.id = spec.id;
    return FXA.sanitize(placed);
  }
  /* A fight-row id with no token still has the stamped square. Players draw the column there. */
  if (spec.target && !T && !fxPoint(spec)) return null;
  if (T && T.hidden) return null;
  const pub = {
    type, result: spec.result, arrow: spec.arrow, sfx: spec.sfx, weapon: spec.weapon, weaponId: spec.weaponId,
    spell: spec.spell || "", dmg: spec.dmg || "", self: !!spec.self,
    facing: spec.facing,
    nat: spec.nat, crit: spec.crit, critMin: spec.critMin, heard: spec.heard, scene: S.sceneId || ''
  };
  if (spec.dust) pub.dust = true;
  if (spec.crumbOnly) pub.crumbOnly = true;
  if (spec.pulse) pub.pulse = true;
  if (spec.saved) pub.saved = true;
    if (spec.mode === "chill" || spec.mode === "warm") pub.mode = spec.mode;
    if (spec.beat != null && isFinite(Number(spec.beat))) pub.beat = Math.max(0, Math.min(7, Math.round(Number(spec.beat))));
    if (spec.killed) pub.killed = true;
    if (spec.rise) pub.rise = true;
    if (spec.garnish === "place" || spec.garnish === "swipe" || spec.garnish === "clear" || spec.garnish === "detonate") pub.garnish = spec.garnish;
  if (spec.cleared) pub.cleared = true;
  if (spec.id) pub.id = spec.id;
  if (T) pub.target = T.id;
  const sc = fxCenter(S);
  const sid = S.sceneId || 'scn_dustyspur01';
  const seen = (x, y) => fxPublicSees(x, y, sid);
  const hopPub = fxPublicPoints(spec.hops, seen);
  const rayPub = fxPublicPoints(spec.rays, seen);
  if (hopPub) pub.hops = hopPub;
  if (rayPub) pub.rays = rayPub;
  const point = !T ? fxPoint(spec) : null;
  if (S.hidden || !seen(sc.x, sc.y)) {
    const aim = T ? fxCenter(T) : point;
    if (!aim || type === 'free') return null;
    const edge = fxWalk(sc, aim, seen);
    /* a hidden token standing in the open has no fog edge to fire from: players see nothing */
    if (!edge || edge.at < 1) return null;
    pub.src = { x: edge.x, y: edge.y };
  } else pub.shooter = S.id;
  if (point) {
    if (!seen(point.x, point.y)) return null;
    pub.at = { x: Math.round(point.x * 10) / 10, y: Math.round(point.y * 10) / 10 };
  }
  if (type === 'free') pub.dir = fxFacing(S, spec);
  return FXA.sanitize(pub);
}
function fxSpecFromReq(row) {
  const req = row.fxReq || {};
  return {
    id: row.id,
    who: (row.zoom && row.zoom.who) || row.characterName || row.fromName || row.who || "",
    type: req.type, result: req.result, target: req.target || (req.self ? row.from : ""), shooter: row.from, sfx: req.sfx,
    weapon: req.weapon, weaponId: req.weaponId, arrow: req.arrow, nat: req.nat, crit: req.crit, critMin: req.critMin,
    spell: req.spell || "", dmg: req.dmg || "", self: !!req.self || req.target === row.from,
    facing: req.facing,
    at: req.at || null,
    heard: req.heard === false ? [] : [row.from],
    hops: req.hops, rays: req.rays,
    dust: !!req.dust, crumbOnly: !!req.crumbOnly, pulse: !!req.pulse, saved: !!req.saved,
    mode: req.mode === "chill" || req.mode === "warm" ? req.mode : "",
    beat: req.beat, killed: !!req.killed, rise: !!req.rise,
    garnish: req.garnish === "place" || req.garnish === "swipe" || req.garnish === "clear" || req.garnish === "detonate" ? req.garnish : "",
    cleared: !!req.cleared,
    radius: Number(req.radius) > 0 ? Number(req.radius) : 0
  };
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
/* Feed rows: public fx rows draw here. The caster's own fxReq paints on this map immediately
   (no initiative gate). Only the DM publishes the cleaned row, including a request from the DM's own sheet. */
function fxFromFeed(row) {
  if (!FXA || !row) return;
  const ts = Date.parse(row.ts || '');
  if (ts && ts < fxBoot - FXA.TIMING.stale) return; /* history replayed on load */
  if (ts && Date.now() - ts > 60000) return; /* late replay after a reconnect (60 s leaves room for clock skew) */
  if (row.fx && typeof row.fx === 'object') {
    /* The DM map already drew this when it published. A player map with the same uid (the DM's sheet) has not. */
    if (row.from === uid && role === 'dm') return;
    const drawId = (row.fx && row.fx.zoomId) || row.id;
    if (fxAlready(drawId) || fxAlready(row.id)) return;
    const started = startFx(Object.assign({}, row.fx, { id: drawId }), { local: false });
    if (started) fxRemember(drawId);
    return;
  }
  if (!(row.fxReq && typeof row.fxReq === 'object' && row.from)) return;
  const mine = row.from === uid;
  if (!mine && role !== 'dm') return;
  if (mine && fxAlready(row.id)) return;
  const spec = fxSpecFromReq(row);
  if (role === 'dm') {
    dmFx(spec, row.id);
    if (mine) fxRemember(row.id);
    return;
  }
  const started = startFx(spec, { local: true });
  if (started) fxRemember(row.id);
}

// --- render ---
function liveCanvasBox() {
  return { w: canvas.clientWidth || 0, h: canvas.clientHeight || 0 };
}
function viewBox() {
  const live = liveCanvasBox();
  if (live.w > 1 && live.h > 1) return live;
  if (state.layoutBox && state.layoutBox.w > 1 && state.layoutBox.h > 1) return state.layoutBox;
  return { w: 1, h: 1 };
}
/* Full screen can report 0×0 while the grid settles. Writing that into the bitmap
   clears the board, and the next observation often never comes, so the map stays black
   until the button is pressed again. Keep the last good buffer and try once layout lands. */
let layoutTries = 0;
let layoutTimer = 0;
function scheduleLayout() {
  if (layoutTimer || dead || layoutTries > 12) return;
  layoutTries += 1;
  layoutTimer = requestAnimationFrame(() => {
    layoutTimer = 0;
    resize();
  });
}
function syncBacking() {
  const dpr = Math.min((typeof window !== 'undefined' && window.devicePixelRatio) || 1, 2);
  const live = liveCanvasBox();
  if (live.w < 2 || live.h < 2) return false;
  state.layoutBox = { w: live.w, h: live.h };
  const bw = Math.round(live.w * dpr);
  const bh = Math.round(live.h * dpr);
  if (canvas.width !== bw || canvas.height !== bh) {
    canvas.width = bw;
    canvas.height = bh;
  }
  if (ctx && ctx.setTransform) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  sizeFxCanvas(dpr, live);
  return true;
}
function isBackdropScene() {
  return !!(state.scene && state.scene.grid && state.scene.grid.show === false);
}
/* Clear rectangle of the map stage. Grid chrome that does not cover the canvas is ignored.
   Absolute bars (the standalone demo) are inset so the picture is not hidden under them. */
function stageClearBox() {
  const box = viewBox();
  if (!(box.w > 2 && box.h > 2) || !canvas.getBoundingClientRect) return box;
  let rect;
  try { rect = canvas.getBoundingClientRect(); } catch (e) { return box; }
  if (!rect || !(rect.width > 2)) return box;
  let L = 0, T = 0, R = box.w, B = box.h;
  const nodes = el.querySelectorAll('.ssdns-toolbar, .ssdns-leftbar, .ssdns-rightbar, .ssdns-chatdock, .ssm-turnstrip');
  nodes.forEach(node => {
    if (!node || node.hidden) return;
    let pos = '';
    try { pos = window.getComputedStyle(node).position; } catch (e) { pos = ''; }
    if (pos !== 'absolute' && pos !== 'fixed') return;
    let r;
    try { r = node.getBoundingClientRect(); } catch (e2) { return; }
    if (!r || r.width < 8 || r.height < 8) return;
    const x1 = r.left - rect.left, y1 = r.top - rect.top;
    const x2 = r.right - rect.left, y2 = r.bottom - rect.top;
    if (x2 <= L || y2 <= T || x1 >= R || y1 >= B) return;
    const overlapH = Math.min(y2, B) - Math.max(y1, T);
    const overlapW = Math.min(x2, R) - Math.max(x1, L);
    if (x1 <= L + 4 && overlapH > (B - T) * 0.35) L = Math.max(L, x2);
    else if (x2 >= R - 4 && overlapH > (B - T) * 0.35) R = Math.min(R, x1);
    else if (y1 <= T + 4 && overlapW > (R - L) * 0.35) T = Math.max(T, y2);
    else if (y2 >= B - 4 && overlapW > (R - L) * 0.35) B = Math.min(B, y1);
  });
  if (R - L < 40 || B - T < 40) return { w: box.w, h: box.h, ox: 0, oy: 0 };
  return { w: R - L, h: B - T, ox: L, oy: T };
}
/* Contain the backdrop in the clear stage and center it there. */
function fitBackdrop() {
  if (!isBackdropScene()) return false;
  const g = state.scene.grid;
  const worldW = g.cols * g.px;
  const worldH = g.rows * g.px;
  const vis = stageClearBox();
  if (!(vis.w > 2 && vis.h > 2 && worldW > 0 && worldH > 0)) return false;
  const pad = 8;
  const fitW = Math.max(1, vis.w - pad * 2);
  const fitH = Math.max(1, vis.h - pad * 2);
  const zoom = Math.min(fitW / worldW, fitH / worldH);
  if (!(zoom > 0)) return false;
  const canvasBox = viewBox();
  const visCx = (vis.ox || 0) + vis.w / 2;
  const visCy = (vis.oy || 0) + vis.h / 2;
  state.view.zoom = zoom;
  state.view.x = worldW / 2 - (visCx - canvasBox.w / 2) / zoom;
  state.view.y = worldH / 2 - (visCy - canvasBox.h / 2) / zoom;
  paintZoom();
  return true;
}
function resize() {
  if (!syncBacking()) {
    scheduleLayout();
    return;
  }
  layoutTries = 0;
  if (isBackdropScene()) fitBackdrop();
  draw();
}
function noteLootForce(on) {
  state.lootForce = !!on;
  const btn = q('randomizeLootBtn');
  if (!btn) return;
  btn.textContent = on ? 'Randomize again' : 'Randomize loot';
  btn.title = on
    ? 'Roll pocket loot again for enemies already randomized. Dropped loot, players, and allies stay skipped.'
    : 'Add pocket loot to every enemy on this map. Skips players, allies, spell pieces, and tokens already rolled or already dropped.';
}
function relayout() {
  layoutTries = 0;
  resize();
  if (!layoutTimer) {
    layoutTimer = requestAnimationFrame(() => {
      layoutTimer = 0;
      resize();
    });
  }
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
  if (zoneBadgeLayer) {
    const st = zoneBadgeLayer.style;
    st.left = (canvas.offsetLeft || 0) + 'px';
    st.top = (canvas.offsetTop || 0) + 'px';
    st.width = box.w + 'px';
    st.height = box.h + 'px';
  }
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
/* L0225 vision. Default is the viewer's own token (darkvision, or a 2-square bubble)
   plus every lit square. Squares another party member can currently see also show on the
   map, and only while they are still seen — nothing is stored as explored fog.
   scene.visionMode "party" is the DM toggle for full shared party sight: the live union
   is what you can target, not only what the map shows. DM Show Player FOV / see-all stays.
   L0226 layers: ambient, painted regions, emitters (brightest wins), magical darkness
   (L0227–L0230 ink wash), then this viewer's darkvision. Darkvision does not pierce
   that wash. Devil's Sight does. Show Player FOV uses the same ink the player sees.
   Ambient bright/dim still opens the scene for paint. Hide shapes still hide.
   A legacy torch is bright 20 ft / dim 20 ft (outer 8 squares). Walls do not block the
   sight test yet; the light punch still clips on walls. Grid units (squares). */
function playerSceneOf(viewerUid) {
  if (role === 'player' && viewerUid === uid) return getPlayerScene();
  const own = state.tokens.find(t => t && t.ownerUid === viewerUid);
  return (own && own.sceneId) || (shared.playerScenes && shared.playerScenes[viewerUid]) || 'scn_dustyspur01';
}
function visionModeOf(sd) { return sd && sd.visionMode === 'party' ? 'party' : 'own'; }
function ambientOf(sd) {
  const a = sd && sd.ambient;
  return a === 'bright' || a === 'dim' ? a : 'dark';
}
function tokenLightList(t) {
  if (!t || !t.pos || t.hidden || t.dmDoused || isPartyToken(t)) return [];
  const c = fxCenter(t);
  const face = (Number(t.facing) || 0) * Math.PI / 180;
  const rows = Array.isArray(t.lights) ? t.lights.filter(l => l && !l.out) : [];
  const out = rows.map(l => {
    const bright = Number(l.bright) || 0, dim = Number(l.dim) || 0;
    const ZL = window.SSDNSSpellZones;
    const spellLevel = ZL && ZL.spellLightLevel ? ZL.spellLightLevel(l) : null;
    return {
      x: c.x, y: c.y, bright: bright, dim: dim, radius: (bright + dim) / 5, cone: !!l.cone, facing: face, name: l.name || '',
      id: l.id || '', magical: !!(l.magical || l.spell || l.feature || spellLevel != null), spell: !!l.spell,
      spellLevel: spellLevel, feature: !!l.feature
    };
  });
  /* The sphere's 20/20 light rides the token. The zone record stays at the cast
     point for the damage tick and must not also emit a light. */
  if (t.spellPiece === 'flaming sphere' && !out.some(l => /flaming sphere/i.test(l.name || ''))) {
    out.push({
      x: c.x, y: c.y, bright: 20, dim: 20, radius: 8, cone: false, facing: face,
      name: 'Flaming Sphere', id: 'sphere:' + t.id, magical: true, spell: true, spellLevel: 2
    });
  }
  if (out.length) return out;
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
  const revealed = sd.fogRevealed === true;
  const open = revealed || amb === 'bright' || amb === 'dim';
  const out = {
    uid: viewerUid || '', sceneId: sid, open: open, fogOn: !open, fogRevealed: revealed, ambient: amb, mode: mode,
    center: null, radius: 2, bubbles: [], liveParty: [], lights: [],
    regions: normalizeLightRegions(sd.lightRegions), darkness: magicalDarknessZones(sid),
    shapes: sd.fogShapes || []
  };
  for (const t of state.tokens) {
    if (!t || !t.pos || t.hidden || isPartyToken(t)) continue;
    if ((t.sceneId || 'scn_dustyspur01') !== sid) continue;
    tokenLightList(t).forEach(ls => out.lights.push(ls));
    const party = !!(t.ownerUid || t.kind === 'player');
    if (!party) continue;
    const mine = viewerUid && t.ownerUid === viewerUid;
    const dv = Number(t.darkvision) || 0;
    const radius = dv > 0 ? dv / 5 : 2;
    const bubble = { x: t.pos.x + (t.size || 1) / 2, y: t.pos.y + (t.size || 1) / 2, radius: radius, darkvision: dv, devilsSight: !!t.devilsSight, uid: t.ownerUid || '' };
    /* Own token keeps the bubble for targeting. An ally's current bubble is only a live map square. */
    if (mode === 'own' && viewerUid && !mine) { out.liveParty.push(bubble); continue; }
    out.bubbles.push(bubble);
    if (mine) { out.center = { x: bubble.x, y: bubble.y }; out.radius = radius; }
  }
  testLightRows(sd).forEach(ls => out.lights.push(ls));
  zoneLightRows().forEach(ls => out.lights.push(ls));
  spellEmitterRows(sid).forEach(ls => out.lights.push(ls));
  if (fxOn()) fxBoltLights.forEach(ls => { if (ls) out.lights.push(ls); });
  return out;
}
function sightFor(viewerUid, sceneId) { return buildSight(viewerUid, sceneId, ''); }
function insideBubbles(gx, gy, sight) {
  for (const b of (sight && sight.bubbles) || []) {
    if (b && Math.hypot(gx - b.x, gy - b.y) <= b.radius) return true;
  }
  if (sight && sight.center && Math.hypot(gx - sight.center.x, gy - sight.center.y) <= sight.radius) return true;
  return false;
}
/* Light before this viewer's darkvision. Magical darkness forces dark unless Devil's Sight sees through. */
function darknessViewers(sight) {
  const out = [];
  ((sight && sight.bubbles) || []).forEach(b => { if (b) out.push(b); });
  return out;
}
function magicalDarkBlocks(gx, gy, sight) {
  const L = window.SSDNSLighting;
  const zones = (sight && sight.darkness) || [];
  if (!L || !L.magicalDarkBlocks || !zones.length) return false;
  return L.magicalDarkBlocks(gx, gy, zones, darknessViewers(sight));
}
function devilSeesSquare(gx, gy, sight) {
  const L = window.SSDNSLighting;
  const zones = (sight && sight.darkness) || [];
  if (!L || !L.devilSees || !L.darknessContains || !zones.length) return false;
  return darknessViewers(sight).some(v => v && v.devilsSight && zones.some(z => L.darknessContains(z, gx, gy) && L.devilSees(z, v, gx, gy)));
}
function lightLevelAt(gx, gy, sight) {
  if (!sight) return 'dark';
  const L = window.SSDNSLighting;
  if (L && L.stackLevel) {
    return L.stackLevel(gx, gy, {
      ambient: sight.ambient,
      regions: sight.regions || [],
      emitters: sight.lights || [],
      darkness: sight.darkness || [],
      viewers: darknessViewers(sight)
    });
  }
  if (sight.ambient === 'bright') return 'bright';
  if (sight.ambient === 'dim') return 'dim';
  for (const ls of sight.lights || []) if (inLight(ls, gx, gy)) return 'dim';
  return 'dark';
}
function pointInSight(gx, gy, sight) {
  if (!sight) return false;
  if (sight.fogRevealed) return true;
  /* Devil's Sight opens magical darkness out to 120 ft. A normal bubble does not. */
  if (devilSeesSquare(gx, gy, sight)) return true;
  if (magicalDarkBlocks(gx, gy, sight)) return false;
  if (insideBubbles(gx, gy, sight)) return true;
  return lightLevelAt(gx, gy, sight) !== 'dark';
}
/* An ally's live square. Magical darkness blocks them unless Devil's Sight sees through. */
function allySeesNow(b, gx, gy, sight) {
  if (!b) return false;
  const solo = { darkness: (sight && sight.darkness) || [], bubbles: [b] };
  if (devilSeesSquare(gx, gy, solo)) return Math.hypot(gx - b.x, gy - b.y) <= 24.001;
  if (Math.hypot(gx - b.x, gy - b.y) > b.radius + 0.001) return false;
  if (magicalDarkBlocks(gx, gy, solo)) return false;
  return true;
}
/* Map squares an ally can see right now. Not used for targeting. Not stored.
   Reveal/hide shapes still win, same as the token test. */
function squareShown(gx, gy, sight) {
  if (!sight) return false;
  let shown = pointInSight(gx, gy, sight);
  if (!shown && sight.mode === 'own' && !sight.fogRevealed && sight.ambient !== 'bright' && sight.ambient !== 'dim') {
    shown = (sight.liveParty || []).some(b => allySeesNow(b, gx, gy, sight));
  }
  (sight.shapes || []).forEach(shape => {
    if (shapeContains(shape, gx, gy)) shown = shape.op !== 'hide';
  });
  return shown;
}
function tokenSeenBy(t, sight) {
  if (!t || !t.pos || !sight) return false;
  if (t.hidden) return false;
  if ((t.sceneId || 'scn_dustyspur01') !== sight.sceneId) return false;
  /* The caster's own spell token (Spiritual Weapon, the sphere, the guardian) stays visible
     to them in the dark. Fog hiding it made a successful cast look like no token dropped. */
  if (sight.uid && ((t.controlledBy || []).indexOf(sight.uid) >= 0)) return true;
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
    if (!z) return z;
    if (z.followTarget) {
      const followTok = tokenByRef(z.followTarget);
      if (!followTok || !followTok.pos || followTok.hidden) return Object.assign({}, z, { light: null, lightHidden: true });
      const sid = followTok.sceneId || "scn_dustyspur01";
      let here = "scn_dustyspur01";
      try { here = activeSceneId(); } catch (e) {}
      if (sid !== here) return Object.assign({}, z, { light: null, lightHidden: true });
      const fs = followTok.size || 1;
      return Object.assign({}, z, { origin: { x: followTok.pos.x + fs / 2, y: followTok.pos.y + fs / 2 } });
    }
    if (!z.follow) return z;
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
function fxCoversLook(t, look) {
  if (!t || !look || !fxLive.length || !FXA || !FXA.lookOf) return false;
  for (let i = 0; i < fxLive.length; i++) {
    const e = fxLive[i];
    if (!e || !e.spec || !e.geo) continue;
    const got = FXA.lookOf(e.spec);
    const mode = e.spec.mode || "";
    const spellName = String((e.spec && (e.spec.spell || e.spec.weapon)) || "");
    const same = got === look
      || (look === "rime" && got === "fireshield" && mode === "chill")
      || (look === "fireshield" && got === "fireshield" && mode !== "chill")
      || (look === "cage" && got === "shocking-grasp")
      || (look === "frostray" && got === "cold" && /ray of frost/i.test(spellName));
    if (!same) continue;
    const ids = [e.geo.tokT, e.geo.tokS];
    if (ids.some(one => one && (one === t || one.id === t.id))) return true;
  }
  return false;
}
function fxHealSlot(e, t) {
  if (!e || !e.spec || !t || !FXA || !FXA.lookOf) return -1;
  const look = FXA.lookOf(e.spec);
  if (look !== "massword" && look !== "masscure" && look !== "healcolumn") return -1;
  if (e.geo && e.geo.tokT && (e.geo.tokT === t || e.geo.tokT.id === t.id)) return 0;
  const hops = e.spec.hops || [];
  for (let i = 0; i < hops.length; i++) {
    const id = hops[i] && hops[i].id;
    if (!id) continue;
    const hop = fxRef(id) || fxTokenRaw(id);
    if (hop && (hop === t || hop.id === t.id)) return i + 1;
  }
  return -1;
}
function fxBodyNudge(t) {
  if (!FXA || !FXA.nudge || !t || !fxLive.length) return null;
  const now = fxStamp();
  for (let i = 0; i < fxLive.length; i++) {
    const e = fxLive[i];
    if (!e || !e.spec) continue;
    const slot = fxHealSlot(e, t);
    if (slot >= 0) {
      const screen = fxScreen(e);
      screen.healIndex = slot;
      const n = FXA.nudge(e.spec, now - e.t0, screen);
      if (n && (n.dx || n.dy || n.grey || (n.tint && n.tint.a))) return n;
      continue;
    }
    if (!e.geo || !e.geo.tokT) continue;
    if (e.geo.tokT !== t && e.geo.tokT.id !== t.id) continue;
    const n = FXA.nudge(e.spec, now - e.t0, fxScreen(e));
    if (n && (n.dx || n.dy || n.grey || (n.tint && n.tint.a))) return n;
  }
  return null;
}
function tokenIsEnfeebled(t) {
  if (!FXA || !FXA.stickyLook || !t) return false;
  const names = tokenConditions(t);
  for (let i = 0; i < names.length; i++) if (FXA.stickyLook(names[i]) === "enfeeble") return true;
  return false;
}
function conditionSpellMap(t) {
  const spells = {};
  const take = (raw) => {
    if (!raw || typeof raw !== "object" || !raw.spell) return;
    const name = String(raw.name || raw.label || "").trim().toLowerCase();
    if (name) spells[name] = String(raw.spell);
  };
  let names = [];
  try { names = tokenConditions(t) || []; } catch (e) { names = []; }
  const live = {};
  names.forEach(name => { live[String(name || "").trim().toLowerCase()] = 1; });
  Object.keys((t && t.conditionSpells) || {}).forEach(key => {
    if (live[key]) spells[key] = t.conditionSpells[key];
  });
  (t && t.conditions || []).forEach(take);
  const order = (state.initiative && state.initiative.order) || [];
  const row = t && order.find(o => o && ((t.combatantId && (o.id === t.combatantId || o.playerId === t.combatantId)) ||
    (t.ownerUid && (o.playerId === t.ownerUid || o.id === t.ownerUid)) || o.id === t.id));
  if (row && !(row.mapHidden && role !== "dm")) (row.conditions || []).forEach(take);
  return spells;
}
function wrapLooksOn(t) {
  const FX = window.SSDNSMapFx;
  if (!FX || !FX.wrapLook || !t) return {};
  const spells = conditionSpellMap(t);
  const looks = {};
  let names = [];
  try { names = tokenConditions(t) || []; } catch (e) { names = []; }
  names.forEach(name => {
    const key = String(name || "").trim().toLowerCase();
    const look = FX.wrapLook(name, spells[key] || "");
    if (look) looks[look] = spells[key] || name;
  });
  return looks;
}
/* The wrap stays while its condition is on the token. Losing that condition plays the grey dust pop. */
function watchWraps(t) {
  if (!t || !window.SSDNSMapFx || !window.SSDNSMapFx.wrapLook) return;
  const looks = wrapLooksOn(t);
  const sig = Object.keys(looks).sort().join("|");
  if (t._wrapSig == null) { t._wrapSig = sig; t._wrapLooks = looks; return; }
  if (t._wrapSig === sig) return;
  const prev = t._wrapLooks || {};
  t._wrapSig = sig;
  t._wrapLooks = looks;
  if (role !== "dm") return;
  Object.keys(prev).forEach(look => {
    if (looks[look]) return;
    const spell = look === "ensnare" ? "Ensnaring Strike" : (look === "fever" ? "Contagion" : "Phantasmal Killer");
    dmFx({
      type: "spell",
      spell: spell,
      weapon: spell,
      shooter: t.id,
      target: t.id,
      result: "hit",
      garnish: "clear"
    });
  });
  const spells = conditionSpellMap(t);
  t.conditionSpells = spells;
  const copy = shared.tokens[t.id];
  if (copy) {
    copy.conditionSpells = Object.assign({}, spells);
    saveToken(t.id);
  }
}
function paintStickyMarks(ctx, t, s, r) {
  const FX = window.SSDNSMapFx;
  if (!FX || !FX.stickyLook || !t) return;
  watchWraps(t);
  const spells = conditionSpellMap(t);
  const names = [];
  (t.conditions || []).forEach(c => names.push(typeof c === "string" ? c : (c && c.name) || ""));
  try { tokenConditions(t).forEach(c => names.push(typeof c === "string" ? c : (c && c.name) || "")); } catch (e) {}
  const seen = {};
  names.forEach(name => {
    const key = String(name || "").trim().toLowerCase();
    const wrap = FX.wrapLook ? FX.wrapLook(name, spells[key] || "") : "";
    const look = wrap || FX.stickyLook(name);
    if (!look || seen[look]) return;
    seen[look] = 1;
    if (wrap) {
      if (!fxCoversLook(t, wrap) && FX.paintRider) FX.paintRider(ctx, wrap, s.x, s.y, r, fxStamp());
      return;
    }
    const rich = look === "guiding-bolt" || look === "chill-touch" || look === "cage"
      || look === "hex" || look === "brand" || look === "heat" || look === "fireshield"
      || look === "rime" || look === "flameblade" || look === "enfeeble"
      || look === "produceflame" || look === "frostray" || look === "sickray";
    if (rich && FX.paintRider) {
      if (!fxCoversLook(t, look)) FX.paintRider(ctx, look, s.x, s.y, r, fxStamp());
      return;
    }
    const col = (FX.chunkColor && FX.chunkColor(look)) || "185,170,180";
    /* Lasting wrap. The cast glow fades; this ring stays while the condition is on the token. */
    ctx.save();
    ctx.globalAlpha = 0.95;
    ctx.strokeStyle = "rgba(" + col + ",0.95)";
    ctx.lineWidth = 3.4;
    ctx.beginPath();
    ctx.arc(s.x, s.y, r + 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 1.7;
    ctx.beginPath();
    ctx.arc(s.x, s.y, r + 11, 0.35, Math.PI * 1.65);
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
function stampPieceBudget(token, budget, spent) {
  if (!token || !(budget > 0)) return false;
  const left = Math.max(0, budget - (Number(spent) || 0));
  const changed = token.damageBudget !== budget || token.budgetLeft !== left;
  token.damageBudget = budget;
  token.budgetLeft = left;
  if (shared.tokens[token.id]) {
    shared.tokens[token.id].damageBudget = budget;
    shared.tokens[token.id].budgetLeft = left;
  }
  return changed;
}
function syncSpellPieces() {
  const Tok = window.SSDNSSpellTokens;
  if (!Tok) return;
  const zones = spellZoneList();
  const want = {};
  zones.forEach(z => {
    if (!z || !z.id) return;
    const row = Tok.spec(z.key || z.spell);
    if (!row || row.kind !== "token") return;
    want[String(z.id)] = { zone: z, row: row };
  });
  /* The DM always owns the roster. A player drops a piece only after a full DM publish or scene,
     so a partial sheet sync cannot delete a zone this map has not heard yet. */
  if (role === "dm" || state.zoneRoster) {
    const dropping = (state.tokens || []).filter(t => t && t.spellPiece && t.zoneId && !want[String(t.zoneId)]);
    dropping.forEach(t => { if (t.spellPiece === "guardian of faith") guardianGarnish(t, t, "clear"); });
    const drop = dropping.map(t => t.id);
    if (drop.length && role === "dm") removeMapTokens(drop, { silent: true, keepOwner: true });
    else if (drop.length) {
      state.tokens = (state.tokens || []).filter(t => t && drop.indexOf(t.id) < 0);
      drop.forEach(id => { delete shared.tokens[id]; });
      requestDraw();
    }
  }
  Object.keys(want).forEach(id => {
    const z = want[id].zone;
    const row = want[id].row;
    let existing = (state.tokens || []).find(t => t && String(t.zoneId) === id);
    const at = { x: Math.floor(Number(z.origin && z.origin.x) || 0), y: Math.floor(Number(z.origin && z.origin.y) || 0) };
    const budget = Number(z.budget) || 0;
    const spent = Number(z.spent) || 0;
    if (!existing) {
      existing = makeToken({
        id: "spell_" + id,
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
        ownerUid: "",
        controlledBy: (z.casterId || z.casterUid) ? [String(z.casterId || z.casterUid)] : [],
        ownerCanMove: false
      });
      if (existing && existing.image) loadTokenImage(existing);
      if (existing) {
        const caster = String(z.casterId || z.casterUid || "");
        existing.controlledBy = existing.controlledBy || [];
        if (caster && existing.controlledBy.indexOf(caster) < 0) existing.controlledBy.push(caster);
        if (existing.ownerUid) {
          const who = existing.ownerUid;
          existing.ownerUid = "";
          if (who && existing.controlledBy.indexOf(who) < 0) existing.controlledBy.push(who);
        }
        if (existing.pos && (existing.pos.x !== at.x || existing.pos.y !== at.y)) existing.pos = { x: at.x, y: at.y };
        stampPieceBudget(existing, budget, spent);
        if (shared.tokens[existing.id]) {
          shared.tokens[existing.id].ownerUid = "";
          shared.tokens[existing.id].controlledBy = existing.controlledBy.slice();
          shared.tokens[existing.id].pos = { x: existing.pos.x, y: existing.pos.y };
          shared.tokens[existing.id].spellPiece = existing.spellPiece;
          shared.tokens[existing.id].zoneId = existing.zoneId;
        }
        saveToken(existing.id);
      }
      if (existing && existing.spellPiece === "guardian of faith") guardianGarnish(existing, existing, "place");
      return;
    }
    const casterLive = String(z.casterId || z.casterUid || "");
    existing.controlledBy = existing.controlledBy || [];
    let controlChanged = false;
    if (casterLive && existing.controlledBy.indexOf(casterLive) < 0) {
      existing.controlledBy.push(casterLive);
      controlChanged = true;
    }
    if (existing.ownerUid) {
      const who = existing.ownerUid;
      existing.ownerUid = "";
      if (who && existing.controlledBy.indexOf(who) < 0) existing.controlledBy.push(who);
      controlChanged = true;
    }
    if (stampPieceBudget(existing, budget, spent)) controlChanged = true;
    if (controlChanged) {
      if (shared.tokens[existing.id]) {
        shared.tokens[existing.id].ownerUid = existing.ownerUid || "";
        shared.tokens[existing.id].controlledBy = existing.controlledBy.slice();
      }
      saveToken(existing.id);
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
  let ox = Number(zone.origin.x);
  let oy = Number(zone.origin.y);
  /* The 5-ft aura is the within-5-ft cue. It follows the sphere token, not the cast point. */
  if (row && row.key === 'flaming sphere') {
    const piece = sphereTokenForZone(zone);
    if (piece && piece.pos) { ox = piece.pos.x; oy = piece.pos.y; }
  }
  const wx = (ox + squares / 2) * px;
  const wy = (oy + squares / 2) * px;
  if (aura > 0) {
    if (row && row.key === "guardian of faith") paintGuardianAura(wx, wy, (aura / 5) * px);
    else strokeRing(wx, wy, (aura / 5) * px, "rgba(255,220,140,0.8)", "rgba(255,220,140,0.06)");
  }
  paintZonePulse(zone, px);
}
/* Faint gold dashed 10-ft ring. The guardian token art is the body; this is only the aura. */
function paintGuardianAura(wx, wy, radiusWorld) {
  const c = worldToScreen(wx, wy);
  const z = state.view.zoom || 1;
  const r = Math.max(1, radiusWorld * z);
  const pulse = 0.26 + 0.16 * (0.5 + 0.5 * Math.sin(Date.now() / 520));
  ctx.save();
  ctx.setLineDash([9, 7]);
  ctx.lineDashOffset = -Date.now() / 60;
  ctx.strokeStyle = "rgba(255,232,170," + pulse.toFixed(3) + ")";
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}
function guardianGarnish(from, to, garnish) {
  if (!FXA || !from) return;
  const spec = {
    type: "spell",
    spell: "Guardian of Faith",
    weapon: "Guardian of Faith",
    shooter: from.id,
    target: (to && to.id) || from.id,
    self: !to || to.id === from.id,
    result: "hit",
    garnish: garnish
  };
  if (role === "dm") dmFx(spec);
  else startFx(spec, { local: true });
}
function zoneStyle(key) {
  const styles = {
    darkness: ["rgba(46, 12, 84, 0.94)", "rgba(170, 120, 230, 0.95)"],
    "fog cloud": ["rgba(186,186,196,0.62)", "rgba(230,230,236,0.95)"],
    "hunger of hadar": ["rgba(46, 12, 84, 0.94)", "rgba(80,125,185,0.55)"],
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
    "delayed blast fireball": ["rgba(255,60,20,0.45)", "rgba(255,140,40,0.98)"],
    entangle: ["rgba(90,95,45,0.38)", "rgba(170,210,110,0.95)"],
    web: ["rgba(220,215,200,0.3)", "rgba(120,110,95,0.95)"],
    "spike growth": ["rgba(215,190,130,0.32)", "rgba(220,40,30,0.95)"],
    silence: ["rgba(190,190,180,0.1)", "rgba(214,160,72,0.9)"],
    "hypnotic pattern": ["rgba(210,150,170,0.24)", "rgba(110,170,165,0.95)"],
    "stinking cloud": ["rgba(120,105,60,0.48)", "rgba(165,150,70,0.95)"],
    "black tentacles": ["rgba(25,20,28,0.58)", "rgba(95,220,205,0.95)"]
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
/* Wall of Fire idle loop. Born times stay off the saved zone so a recast reignites. */
const zoneFxBorn = {};
function zoneFxId(z) {
  return String((z && (z.id || z.key)) || "wof");
}
function zoneLoopLive() {
  const zones = spellZoneList() || [];
  const live = {};
  let hit = false;
  let guard = false;
  zones.forEach(z => {
    if (!z) return;
    if (z.key === "guardian of faith") guard = true;
    /* The 18 replacement plates run their own shared loops. Leave the
       procedural pump for the zones that still use it. */
    const Art = window.SSDNSZoneArt;
    if (!(Art && Art.owns && Art.owns(z.key))) {
      if (chunk4ZoneKey(z.key) || z.key === "call lightning") { live[zoneFxId(z)] = 1; hit = true; }
    }
    if (z.key !== "wall of fire") return;
    live[zoneFxId(z)] = 1;
    hit = true;
  });
  Object.keys(zoneFxBorn).forEach(id => { if (!live[id]) delete zoneFxBorn[id]; });
  if (syncScarMotion(zones)) hit = true;
  const Art = window.SSDNSZoneArt;
  if (Art && Art.sync && Art.sync(zones.filter(z => z && !zoneIsToken(z)), zoneArtEnv())) hit = true;
  return hit || guard;
}
function zoneArtEnv() {
  const px = (state.scene && state.scene.grid && state.scene.grid.px) || 70;
  return {
    asset: asset,
    worldToScreen: worldToScreen,
    px: px,
    zoom: (state.view && state.view.zoom) || 1,
    fxOn: scarFxOn,
    requestDraw: requestDraw
  };
}
function paintZoneLightRings(zone, px) {
  /* Same DM guide as the torch and darkvision measurement strokes. Off by default.
     Players never see them. The lighting wash and the zone plate stay. */
  if (role !== 'dm' || !state.showLightRings) return;
  if (!zone || !zone.light || !zone.origin) return;
  const brightFt = Number(zone.light.bright) || 0;
  const dimFt = Number(zone.light.dim) || 0;
  const wx = zone.origin.x * px;
  const wy = zone.origin.y * px;
  if (dimFt > 0) strokeRing(wx, wy, ((brightFt + dimFt) / 5) * px, "rgba(160,190,255,0.9)", "rgba(120,160,220,0.08)");
  if (brightFt > 0) strokeRing(wx, wy, (brightFt / 5) * px, "rgba(255,206,80,0.98)", "rgba(255,196,60,0.16)");
}
function chunk4ZoneKey(key) {
  const k = String(key || "").toLowerCase();
  if (k === "wall of ice" || k === "wall of thorns" || k === "blade barrier" || k === "hunger of hadar" || k === "cloud of daggers" || k === "insect plague" || k === "incendiary cloud" || k === "delayed blast fireball") return k;
  return "";
}
function chunk4ScreenGeom(zone, px) {
  const cell = px * (state.view.zoom || 1);
  const C = worldToScreen(Number(zone.origin.x) * px, Number(zone.origin.y) * px);
  const id = zoneFxId(zone);
  const now = Date.now();
  if (!zoneFxBorn[id]) zoneFxBorn[id] = now;
  const face = Number(zone.facing) || 0;
  const g = {
    A: C, S: C, T: C, Z: C, cell: cell,
    rT: cell * 0.42, rS: cell * 0.42,
    facing: face, quiet: true,
    age: now - zoneFxBorn[id],
    rounds: zone.rounds, roundsLeft: zone.roundsLeft
  };
  if (zone.radius) g.zr = Number(zone.radius) / 5;
  if (zone.shape === "wall") {
    const lenFt = Number(zone.length) || (zone.key === "wall of thorns" ? 60 : 100);
    const half = (lenFt / 5) * cell / 2;
    const fx = Math.cos(face), fy = Math.sin(face);
    const skin = zone.key === "wall of ice" ? "ice" : (zone.key === "wall of thorns" ? "thorns" : "blades");
    g.W = [{
      A: { x: C.x - fx * half, y: C.y - fy * half },
      B: { x: C.x + fx * half, y: C.y + fy * half },
      skin: skin
    }];
  }
  const caster = tokenByRef(zone.casterId);
  if (caster && caster.pos) {
    const cs = fxCenter(caster);
    const cp = worldToScreen(cs.x * px, cs.y * px);
    const dx = C.x - cp.x, dy = C.y - cp.y, d = Math.hypot(dx, dy) || 1;
    g.drift = { x: dx / d, y: dy / d };
    g.A = cp;
    g.S = cp;
  }
  return g;
}
function paintChunk4Zone(zone, px, layer) {
  if (!FXA || !FXA.zoneLayer || !zone || !zone.origin) return;
  FXA.zoneLayer(ctx, { type: "spell", spell: zone.spell || zone.key, result: "hit", quiet: true }, Date.now(), chunk4ScreenGeom(zone, px), layer);
}
function paintChunk4Overs() {
  if (!state.scene) return;
  const px = state.scene.grid.px || 70;
  (liveSpellZones() || []).forEach(zone => {
    if (!zone || zoneIsToken(zone) || !chunk4ZoneKey(zone.key)) return;
    paintChunk4Zone(zone, px, "over");
  });
}
function hungerVoidTint(t) {
  const Z = window.SSDNSSpellZones;
  if (!Z || !Z.tokenIn || !t || !t.pos) return null;
  const tok = { x: t.pos.x, y: t.pos.y, size: t.size || 1, id: t.id };
  const hit = (liveSpellZones() || []).some(z => z && z.key === "hunger of hadar" && Z.tokenIn(z, tok, 0));
  return hit ? { col: "20,12,26", a: 0.28 } : null;
}
function wallScreen(ox, oy, fx, fy, lx, ly, alongFt, latFt, ft) {
  return worldToScreen(ox + (fx * alongFt + lx * latFt) * ft, oy + (fy * alongFt + ly * latFt) * ft);
}
/* Burning fence: one-square flame panels along the wall, heat only on the hot side, low idle flicker. */
function paintWallOfFire(zone, px) {
  if (!zone || !zone.origin) return;
  const id = zoneFxId(zone);
  const now = Date.now();
  if (!zoneFxBorn[id]) zoneFxBorn[id] = now;
  const age = now - zoneFxBorn[id];
  const lenFt = Number(zone.length) || 60;
  const n = Math.max(1, Math.round(lenFt / 5));
  const facing = Number(zone.facing) || 0;
  const fx = Math.cos(facing), fy = Math.sin(facing);
  const lx = -fy, ly = fx;
  const ox = zone.origin.x * px;
  const oy = zone.origin.y * px;
  const ft = px / 5;
  const hotFt = Number(zone.hotSide) > 0 ? Number(zone.hotSide) : 10;
  ctx.save();
  for (let i = 0; i < n; i++) {
    const along = (i + 0.5 - n / 2) * 5;
    const igniteAt = i * 60;
    if (age < igniteAt) continue;
    const lit = Math.min(1, (age - igniteAt) / 160);
    const flick = 0.58 + 0.42 * (0.5 + 0.5 * Math.sin(now / 140 + i * 1.85));
    const a = age > igniteAt + 420 ? flick : Math.max(lit, 0.2);
    const span = [
      wallScreen(ox, oy, fx, fy, lx, ly, along - 2.5, -2.5, ft),
      wallScreen(ox, oy, fx, fy, lx, ly, along + 2.5, -2.5, ft),
      wallScreen(ox, oy, fx, fy, lx, ly, along + 2.5, 2.5, ft),
      wallScreen(ox, oy, fx, fy, lx, ly, along - 2.5, 2.5, ft)
    ];
    const hot = [
      wallScreen(ox, oy, fx, fy, lx, ly, along - 2.5, 2.5, ft),
      wallScreen(ox, oy, fx, fy, lx, ly, along + 2.5, 2.5, ft),
      wallScreen(ox, oy, fx, fy, lx, ly, along + 2.5, 2.5 + hotFt, ft),
      wallScreen(ox, oy, fx, fy, lx, ly, along - 2.5, 2.5 + hotFt, ft)
    ];
    ctx.globalCompositeOperation = "source-over";
    ctx.beginPath();
    hot.forEach((p, k) => { if (k) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); });
    ctx.closePath();
    ctx.fillStyle = "rgba(200,60,15," + (0.16 * a) + ")";
    ctx.fill();
    ctx.globalCompositeOperation = "lighter";
    ctx.beginPath();
    span.forEach((p, k) => { if (k) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); });
    ctx.closePath();
    ctx.fillStyle = "rgba(255,110,28," + (0.34 * a) + ")";
    ctx.fill();
    const mid = wallScreen(ox, oy, fx, fy, lx, ly, along, 0, ft);
    const tongue = 0.55 + 0.45 * Math.sin(now / 90 + i);
    ctx.fillStyle = "rgba(255,225,160," + (0.45 * a * tongue) + ")";
    ctx.beginPath();
    ctx.arc(mid.x, mid.y, Math.max(3, ft * 1.15 * (0.65 + 0.35 * tongue)), 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,140,45," + (0.35 * a) + ")";
    ctx.beginPath();
    ctx.arc(mid.x + lx * ft * 0.4, mid.y + ly * ft * 0.35, Math.max(2, ft * 0.45), 0, Math.PI * 2);
    ctx.fill();
    if (i > 0) {
      const seam = wallScreen(ox, oy, fx, fy, lx, ly, along - 2.5, 0, ft);
      ctx.strokeStyle = "rgba(255,200,120," + (0.35 * a) + ")";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(seam.x - lx * ft * 1.2, seam.y - ly * ft * 1.2);
      ctx.lineTo(seam.x + lx * ft * 1.2, seam.y + ly * ft * 1.2);
      ctx.stroke();
    }
  }
  ctx.restore();
}
/* Clear-row hover. A thicker ember stroke on that zone only. DM map only. */
function paintZonePulse(zone, px) {
  if (role !== "dm" || !state.zonePulse || !zone || String(state.zonePulse) !== String(zone.id)) return;
  if (!traceZone(zone, px)) return;
  const a = 0.35 + 0.55 * (0.5 + 0.5 * Math.sin(Date.now() / 160));
  ctx.save();
  ctx.strokeStyle = "rgba(255,150,50," + a.toFixed(3) + ")";
  ctx.lineWidth = 4;
  ctx.setLineDash([]);
  ctx.stroke();
  ctx.restore();
}
function zoneCasterNames(zones) {
  const names = {};
  const order = (state.initiative && state.initiative.order) || [];
  (zones || []).forEach(z => {
    if (!z) return;
    let label = z.casterName || "";
    const t = tokenByRef(z.casterId);
    if (t && (t.name || t.label)) label = t.name || t.label;
    const row = order.find(r => r && (r.id === z.casterId || r.playerId === z.casterId || r.mapTokenId === z.casterId));
    if (row && row.name) label = row.name;
    if (!label) return;
    if (z.id) names[z.id] = label;
    if (z.casterId) names[z.casterId] = label;
  });
  return names;
}
function zoneDmMark() {
  const wrap = document.createElement("span");
  wrap.className = "eye";
  wrap.innerHTML = '<svg width="9" height="9" viewBox="0 0 16 16" aria-hidden="true"><path fill="none" stroke="#c9a227" stroke-width="1.6" d="M1 8s2.6-5 7-5 7 5 7 5-2.6 5-7 5-7-5-7-5z"/><circle cx="8" cy="8" r="2" fill="#c9a227"/><path d="M2 14 L14 2" stroke="#c9a227" stroke-width="1.6"/></svg>';
  return wrap;
}
function buildZoneBadge(mark) {
  const node = document.createElement("div");
  const pulse = state.zonePulse && String(state.zonePulse) === String(mark.id);
  node.className = "ssm-zb is-" + (mark.icon || "zone") + (mark.low ? " is-low" : "") + (pulse ? " is-pulse" : "");
  node.dataset.zoneId = mark.id != null ? String(mark.id) : "";
  const ico = document.createElement("div");
  ico.className = "ico";
  const ic = document.createElement("i");
  ic.className = "ssm-zico";
  ico.appendChild(ic);
  const v = document.createElement("div");
  v.className = "v";
  const n = document.createElement("div");
  n.className = "n";
  n.textContent = mark.text || "";
  const pips = document.createElement("div");
  pips.className = "pips";
  (mark.pips || []).forEach(on => {
    const pip = document.createElement("b");
    if (!on) pip.className = "x";
    pips.appendChild(pip);
  });
  v.appendChild(n);
  v.appendChild(pips);
  if (mark.who) {
    const who = document.createElement("div");
    who.className = "who";
    who.textContent = mark.who;
    v.appendChild(who);
  }
  const dm = document.createElement("div");
  dm.className = "dm";
  dm.appendChild(zoneDmMark());
  dm.appendChild(document.createTextNode("DM"));
  node.appendChild(ico);
  node.appendChild(v);
  node.appendChild(dm);
  return node;
}
function paintZoneBadges(zones) {
  if (!zoneBadgeLayer) return;
  if (role !== "dm") {
    zoneBadgeLayer.hidden = true;
    if (zoneBadgeLayer.childElementCount) zoneBadgeLayer.textContent = "";
    zoneBadgeSig = "";
    return;
  }
  zoneBadgeLayer.hidden = false;
  const list = (zones || []).filter(z => z && z.origin);
  const Z = window.SSDNSSpellZones;
  const marks = (Z && Z.zoneMarks ? Z.zoneMarks(list, zoneCasterNames(list)) : []).filter(m => m && m.show);
  const sig = marks.map(m => [m.id, m.text, m.low ? 1 : 0, m.who, m.icon, (m.pips || []).join(""), state.zonePulse && String(state.zonePulse) === String(m.id) ? 1 : 0].join("~")).join(";");
  if (sig !== zoneBadgeSig) {
    zoneBadgeSig = sig;
    zoneBadgeLayer.textContent = "";
    marks.forEach(mark => zoneBadgeLayer.appendChild(buildZoneBadge(mark)));
  }
  const px = (state.scene && state.scene.grid && state.scene.grid.px) || 70;
  const nodes = zoneBadgeLayer.querySelectorAll(".ssm-zb");
  const used = [];
  let i = 0;
  marks.forEach(mark => {
    const zone = list.find(z => String(z.id) === String(mark.id));
    const node = nodes[i++];
    if (!node || !zone || !zone.origin) return;
    const s = worldToScreen(Number(zone.origin.x) * px, Number(zone.origin.y) * px);
    let left = Math.round(s.x - 12);
    let top = Math.round(Math.max(32, s.y));
    used.forEach(p => {
      if (Math.abs(p.left - left) < 80 && Math.abs(p.top - top) < 30) top = Math.max(32, p.top - 32);
    });
    used.push({ left: left, top: top });
    node.style.left = left + "px";
    node.style.top = top + "px";
  });
}
/* Fireball's leftover scar. The 8d6 burst stays on the cast painter.
   This plate is the existing 20-ft burn-scar only: char underneath, the
   looping flame overlay on top, and the still plate when motion is off
   or the loop cannot play. One shared loop for every scar in the scene.
   Ring centre (505, 516) and radius 289 are the hand-fit on the 1024 plate.
   The 480 loop is that same plate. The clip is the zone circle, so the
   square media cannot grow the footprint or lay an opaque rectangle. */
const SCAR_ART = {
  char: "fx/fireball-aftermath/char-decal.png",
  still: "fx/fireball-aftermath/overlay.png",
  loop: "fx/fireball-aftermath/idle-overlay.webm"
};
const SCAR_PLATE = 1024;
const SCAR_RING = { cx: 505, cy: 516, r: 289 };
const scarStill = { char: null, still: null };
let scarVideo = null;
let scarVideoState = "idle";
let scarPlayKicked = false;
function scarFxOn() {
  try {
    const FX = window.SSDNSMapFx;
    if (FX && typeof FX.enabled === "function") {
      if (!FX.enabled()) return false;
    } else if (window.localStorage && window.localStorage.getItem("ssdns.map.fx") === "0") return false;
  } catch (e) {}
  try {
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  } catch (e2) {}
  return true;
}
function scarReady(img) {
  return !!(img && img.complete && img.naturalWidth > 0 && !img._scarDead);
}
function scarRingFor(pxSize) {
  const s = (Number(pxSize) || SCAR_PLATE) / SCAR_PLATE;
  return { w: pxSize, h: pxSize, cx: SCAR_RING.cx * s, cy: SCAR_RING.cy * s, r: SCAR_RING.r * s };
}
function scarImage(slot) {
  if (scarStill[slot]) return scarStill[slot];
  const img = new Image();
  img.decoding = "async";
  img.addEventListener("load", () => requestDraw());
  img.addEventListener("error", () => { img._scarDead = true; requestDraw(); });
  img.src = asset(SCAR_ART[slot]);
  scarStill[slot] = img;
  return img;
}
function scarLoop() {
  if (scarVideo) return scarVideo;
  const v = document.createElement("video");
  v.muted = true;
  v.loop = true;
  v.playsInline = true;
  v.preload = "auto";
  v.setAttribute("playsinline", "");
  v.setAttribute("aria-hidden", "true");
  /* Off the map, but in the document. A detached or display:none loop
     does not decode, so the canvas would stick on the still plate. */
  v.style.cssText = "position:fixed;left:-4800px;top:0;width:480px;height:480px;opacity:0.02;pointer-events:none;";
  scarVideo = v;
  scarVideoState = "loading";
  v.addEventListener("error", () => { scarVideoState = "dead"; requestDraw(); });
  v.addEventListener("loadeddata", () => {
    if (scarVideoState === "dead") return;
    scarVideoState = "live";
    requestDraw();
  });
  const host = document.body || document.documentElement;
  if (host) host.appendChild(v);
  v.src = asset(SCAR_ART.loop);
  return v;
}
function scarTryPlay(v) {
  if (!v || scarVideoState === "dead") return;
  if (!v.paused && v.readyState >= 2) {
    scarVideoState = "live";
    return;
  }
  if (scarPlayKicked) return;
  scarPlayKicked = true;
  let p;
  try { p = v.play(); } catch (e) { scarVideoState = "dead"; return; }
  if (p && typeof p.then === "function") {
    p.then(() => { if (scarVideoState !== "dead") scarVideoState = "live"; }).catch(() => {
      scarVideoState = "dead";
      requestDraw();
    });
  }
}
/* True while a scar still needs frames. No fireball zone pauses the loop
   and drops out of the animation pump, so a cleared scene does not keep decoding. */
function syncScarMotion(zones) {
  const want = scarFxOn() && (zones || []).some(z => z && z.key === "fireball" && !zoneIsToken(z));
  if (!want) {
    if (scarVideo && !scarVideo.paused) {
      try { scarVideo.pause(); } catch (e) {}
    }
    scarPlayKicked = false;
    return false;
  }
  const v = scarLoop();
  scarTryPlay(v);
  return scarVideoState !== "dead";
}
function scarFrame() {
  const v = scarVideo;
  if (!scarFxOn() || !v || scarVideoState === "dead") return null;
  if (v.readyState >= 2 && !v.paused && v.videoWidth > 0) return v;
  return null;
}
function scarBlit(img, ring, center, radius) {
  if (!img || !ring || !(ring.r > 0) || !(radius > 0)) return;
  const scale = radius / ring.r;
  ctx.drawImage(img, center.x - ring.cx * scale, center.y - ring.cy * scale, ring.w * scale, ring.h * scale);
}
function paintFireballScar(zone, px) {
  if (!zone || !zone.origin) return;
  const char = scarImage("char");
  const still = scarImage("still");
  const motion = scarFrame();
  const charOk = scarReady(char);
  const stillOk = scarReady(still);
  if (!charOk && !stillOk && !motion) {
    if (char && char._scarDead && still && still._scarDead) paintLastingZoneDisc(zone, px);
    else if (traceZone(zone, px)) {
      ctx.save();
      ctx.strokeStyle = "rgba(196,140,64,0.9)";
      ctx.lineWidth = 1.25;
      ctx.stroke();
      ctx.restore();
    }
    return;
  }
  if (!traceZone(zone, px)) return;
  const zoom = state.view.zoom || 1;
  const radius = Math.max(2, ((Number(zone.radius) || 0) / 5) * px * zoom);
  const center = worldToScreen(Number(zone.origin.x) * px, Number(zone.origin.y) * px);
  ctx.save();
  ctx.clip();
  ctx.globalCompositeOperation = "source-over";
  if (charOk) scarBlit(char, scarRingFor(char.naturalWidth || SCAR_PLATE), center, radius);
  if (motion) scarBlit(motion, scarRingFor(motion.videoWidth || 480), center, radius);
  else if (stillOk) scarBlit(still, scarRingFor(still.naturalWidth || SCAR_PLATE), center, radius);
  ctx.restore();
  if (!traceZone(zone, px)) return;
  ctx.save();
  ctx.strokeStyle = "rgba(196,140,64,0.9)";
  ctx.lineWidth = 1.25;
  ctx.stroke();
  ctx.restore();
}
window.addEventListener("ssdns-map-fx-pref", () => {
  if (scarFxOn() && scarVideoState === "dead") {
    scarVideoState = "idle";
    scarPlayKicked = false;
  }
  if (window.SSDNSZoneArt && window.SSDNSZoneArt.revive) window.SSDNSZoneArt.revive();
  syncScarMotion(spellZoneList());
  requestDraw();
});
try {
  if (window.matchMedia) {
    const reduceQ = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onReduce = () => { syncScarMotion(spellZoneList()); requestDraw(); };
    if (reduceQ.addEventListener) reduceQ.addEventListener("change", onReduce);
    else if (reduceQ.addListener) reduceQ.addListener(onReduce);
  }
} catch (eReduce) {}
/* Lasting ink, drawn with the other zone plates (after the player's fog).
   Hunger's cast FX fades; without this disc the sphere vanishes into the black fog. */
function paintLastingZoneDisc(zone, px) {
  if (!zone || !zone.origin) return;
  const style = zoneStyle(zone.key);
  const obscures = !!(zone.heavilyObscured || zone.magicalDark || zone.noLight || zone.blindedInside);
  const Z = window.SSDNSSpellZones;
  const viewer = zonePaintViewer();
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
}
function paintSpellZones() {
  if (!state.scene) { paintZoneBadges([]); return; }
  const zones = liveSpellZones();
  paintZoneBadges(zones);
  syncZoneClear();
  if (!zones.length) {
    const Art = window.SSDNSZoneArt;
    if (Art && Art.sync) Art.sync([], zoneArtEnv());
    return;
  }
  const px = state.scene.grid.px || 70;
  zones.forEach(zone => {
    if (zoneIsToken(zone)) {
      paintTokenAura(zone, px);
      return;
    }
    const Art = window.SSDNSZoneArt;
    if (Art && Art.owns && Art.owns(zone.key)) {
      const hit = Art.paint(ctx, zone, zoneArtEnv());
      if (hit === "art" || hit === "wait") {
        paintZoneLightRings(zone, px);
        paintZonePulse(zone, px);
        return;
      }
    }
    if (zone.key === "wall of fire") {
      paintWallOfFire(zone, px);
      paintZonePulse(zone, px);
      return;
    }
    if (zone.key === "ice storm" && FXA && FXA.hailIdle) {
      const cell = px * (state.view.zoom || 1);
      const C = worldToScreen(Number(zone.origin.x) * px, Number(zone.origin.y) * px);
      try { FXA.hailIdle(ctx, C, cell, zone.id || "ice"); } catch (eIce) {}
      paintZonePulse(zone, px);
      return;
    }
    if (zone.key === "call lightning" && FXA && FXA.stormIdle) {
      const cell = px * (state.view.zoom || 1);
      const C = worldToScreen(Number(zone.origin.x) * px, Number(zone.origin.y) * px);
      try { FXA.stormIdle(ctx, C, cell, zone.id || "storm"); } catch (eStorm) {}
      paintLastingZoneDisc(zone, px);
      paintZonePulse(zone, px);
      return;
    }
    if (zone.key === "hunger of hadar") {
      paintLastingZoneDisc(zone, px);
      paintChunk4Zone(zone, px, "under");
      paintZonePulse(zone, px);
      return;
    }
    if (chunk4ZoneKey(zone.key)) {
      paintChunk4Zone(zone, px, "under");
      paintZonePulse(zone, px);
      return;
    }
    if (zone.key === "fireball") {
      paintFireballScar(zone, px);
      paintZonePulse(zone, px);
      return;
    }
    paintLastingZoneDisc(zone, px);
    paintZonePulse(zone, px);
    /* Bright/dim rings live only while this zone is in the list. Dismissing Light drops the zone. */
    paintZoneLightRings(zone, px);
  });
  if (zoneLoopLive()) ensureAnim();
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
  const em = spellEmitterList().map(cloneEmitter);
  let changed = false;
  em.forEach(row => {
    if (!row || row.doused) return;
    const at = emitterCenter(row);
    if (!at) return;
    const hit = Z.dispelledCarried(zones, [Object.assign({ x: at.x, y: at.y, spell: true }, row)]);
    if (hit.length) { row.doused = true; changed = true; }
  });
  if (changed) commitEmitters(em);
  stampDispelledDarkness();
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
function zoneListSig(zones) {
  return (zones || []).map(z => z && [z.id, z.roundsLeft, z.rounds, z.spell, z.key, z.casterId, z.casterName].join(":")).join("|");
}
function syncZoneClear() {
  if (role !== "dm") return;
  const sig = zoneListSig(spellZoneList());
  if (sig === zoneListSigSeen) return;
  renderZoneClear();
}
function armZonePulse(id) {
  const Z = window.SSDNSSpellZones;
  const next = Z && Z.pulseZoneId ? Z.pulseZoneId(spellZoneList(), id) : (id ? String(id) : "");
  state.zonePulse = next;
  if (next) ensureAnim();
  else requestDraw();
}
function disarmZonePulse(id) {
  if (!state.zonePulse) return;
  if (id != null && String(state.zonePulse) !== String(id)) return;
  state.zonePulse = "";
  requestDraw();
}
function renderZoneClear() {
  if (role !== "dm") return;
  const box = q("zoneList");
  if (!box) return;
  const zones = spellZoneList();
  zoneListSigSeen = zoneListSig(zones);
  box.textContent = "";
  if (!zones.length) {
    box.textContent = "None";
    state.zonePulse = "";
    return;
  }
  const Z = window.SSDNSSpellZones;
  const names = zoneCasterNames(zones);
  const marks = Z && Z.zoneMarks ? Z.zoneMarks(zones, names) : zones.map(zone => ({
    id: zone.id,
    spell: zone.spell || "grid",
    low: false,
    icon: "zone",
    clearLabel: "Clear " + (zone.spell || "grid") + (zoneTimeLabel(zone) ? " · " + zoneTimeLabel(zone) : "")
  }));
  marks.forEach(mark => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "ssm-zone-clear is-" + (mark.icon || "zone") + (mark.low ? " is-low" : "");
    b.dataset.zoneId = mark.id != null ? String(mark.id) : "";
    const ic = document.createElement("i");
    ic.className = "ssm-zico";
    ic.setAttribute("aria-hidden", "true");
    const label = document.createElement("span");
    label.textContent = mark.clearLabel || ("Clear " + (mark.spell || "grid"));
    b.appendChild(ic);
    b.appendChild(label);
    b.title = "Remove this " + (mark.spell || "spell") + " grid";
    b.addEventListener("click", () => clearSpellGrid({ id: mark.id }));
    b.addEventListener("mouseenter", () => armZonePulse(mark.id));
    b.addEventListener("mouseleave", () => disarmZonePulse(mark.id));
    b.addEventListener("focus", () => armZonePulse(mark.id));
    b.addEventListener("blur", () => disarmZonePulse(mark.id));
    box.appendChild(b);
  });
  if (state.zonePulse && !marks.some(m => String(m.id) === String(state.zonePulse))) state.zonePulse = "";
}
function noteChunk4ZoneGone(prev, next) {
  if (role !== "dm" || !FXA) return;
  const still = {};
  (next || []).forEach(z => { if (z && z.id) still[String(z.id)] = 1; });
  (prev || []).forEach(zone => {
    if (!zone || !zone.id || still[String(zone.id)] || !zone.origin || zone.blast) return;
    if (!chunk4ZoneKey(zone.key)) return;
    const mover = (state.tokens || []).find(t => t && t.id);
    const caster = tokenByRef(zone.casterId);
    const shooter = (caster && caster.id) || (mover && mover.id);
    if (!shooter) return;
    dmFx({
      type: "spell",
      spell: zone.spell || zone.key,
      weapon: zone.spell || zone.key,
      shooter: shooter,
      result: "hit",
      garnish: "clear",
      at: { x: Number(zone.origin.x), y: Number(zone.origin.y) }
    });
  });
}
function adoptSpellZones(list, seq, opts) {
  const prev = (state.spellZones || []).slice();
  const next = (Array.isArray(list) ? list : []).map(z => Object.assign({}, z));
  state.spellZones = next.filter(z => !(z && z.id && state.zoneGone[String(z.id)]));
  noteChunk4ZoneGone(prev, state.spellZones);
  state.spellZonesLive = true;
  if (opts && opts.roster) state.zoneRoster = true;
  if (seq) state.zoneSeq = Number(seq) || state.zoneSeq;
  stampDispelledLights();
  stampBorrowedLights();
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
    zones: zones, zoneSeq: state.zoneSeq,
    full: role === "dm"
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
  const incoming = row.zones.filter(z => z && z.id);
  const Z = window.SSDNSSpellZones;
  const full = !!row.full;
  let merged;
  if (Z && Z.mergeFeed) merged = Z.mergeFeed(state.spellZones, incoming, { full: full, sender: row.from || "" });
  else if (full) merged = incoming.map(z => Object.assign({}, z));
  else {
    const incomingIds = {};
    incoming.forEach(z => { incomingIds[String(z.id)] = 1; });
    const sender = String(row.from || "");
    const kept = (state.spellZones || []).filter(z => {
      if (!z || !z.id || incomingIds[String(z.id)]) return false;
      if (sender && (String(z.casterId || "") === sender || String(z.casterUid || "") === sender)) return false;
      return true;
    });
    merged = kept.concat(incoming);
  }
  adoptSpellZones(merged, seq || Date.now(), { roster: full });
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
  if (state.zonePulse && result.removed.some(z => z && String(z.id) === String(state.zonePulse))) state.zonePulse = "";
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
    hp: t.hp != null && t.hp !== "" ? Number(t.hp) : null,
    maxHp: t.maxHp != null && t.maxHp !== "" ? Number(t.maxHp) : null,
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
  if (hideDownedToken(mover)) return;
  const Z = window.SSDNSSpellZones;
  state.zoneSeen = state.zoneSeen || {};
  const turnKey = zoneTurnKey();
  const tokenId = (mover && (mover.combatantId || mover.ownerUid || mover.id)) || "";
  const fresh = !turnKey || !Z || !Z.once ? ticks : ticks.filter(t => Z.once(state.zoneSeen, t, (t && t.targetId) || tokenId, turnKey));
  if (!fresh.length) return;
  fresh.forEach(tick => {
    if (!tick || !mover) return;
    if (/guardian of faith/i.test(String(tick.spell || ""))) {
      const guard = (state.tokens || []).find(t => t && t.spellPiece === "guardian of faith" && (!tick.zoneId || String(t.zoneId) === String(tick.zoneId)));
      if (guard) guardianGarnish(guard, mover, "swipe");
    }
    if (!chunk4ZoneKey(tick.spell) || /delayed blast fireball/i.test(String(tick.spell || ""))) return;
    const spec = {
      type: "spell",
      spell: tick.spell,
      weapon: tick.spell,
      shooter: mover.id,
      target: mover.id,
      result: "hit",
      pulse: true,
      dmg: tick.type || ""
    };
    if (role === "dm") dmFx(spec);
    else startFx(spec, { local: true });
  });
  try {
    window.dispatchEvent(new CustomEvent("ssdns-zone-tick", {
      detail: { ticks: fresh, tokenId: mover && mover.id, ownerUid: mover && mover.ownerUid, combatantId: mover && mover.combatantId, from: from, to: to }
    }));
  } catch (e) {}
  if (role !== "dm" && adapter && adapter.write && uid) {
    const id = "zt_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    const slim = fresh.map(tick => ({
      spell: tick.spell || "", when: tick.when || "", save: tick.save || "", dice: tick.dice || "",
      type: tick.type || "", half: !!tick.half, dc: tick.dc, zoneId: tick.zoneId || "",
      casterId: tick.casterId || "", targetId: tick.targetId || "", targetName: tick.targetName || "",
      amount: tick.amount || 0, formula: tick.formula || "", faces: tick.faces || [], auto: !!tick.auto,
      onFail: tick.onFail || "", budget: tick.budget || 0
    }));
    try {
      const p = adapter.write("tableFeed/" + id, {
        id: id, ts: new Date().toISOString(), from: uid, text: "zone-tick", kind: "sfx", event: "zone-tick",
        ticks: slim, tokenId: mover.id, ownerUid: mover.ownerUid || "", combatantId: mover.combatantId || ""
      }, { by: uid });
      if (p && p.catch) p.catch(() => {});
    } catch (e2) {}
  }
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
function creatureOn(x, y, ignoreId) {
  const hit = (state.tokens || []).find(t => {
    if (!t || !t.pos || t.id === ignoreId) return false;
    if (t.spellPiece || t.notTargetable || t.kind === "asset" || t.kind === "chest" || t.kind === "marker" || isPartyToken(t)) return false;
    if (hideDownedToken(t)) return false;
    const size = t.size || 1;
    return x >= t.pos.x && x < t.pos.x + size && y >= t.pos.y && y < t.pos.y + size;
  });
  return hit || null;
}
function lastOpenStep(from, to, ignoreId, size) {
  const Tok = window.SSDNSSpellTokens;
  const steps = 8;
  let last = { x: from.x, y: from.y };
  let i;
  for (i = 1; i <= steps; i++) {
    const x = Math.round(from.x + (to.x - from.x) * (i / steps));
    const y = Math.round(from.y + (to.y - from.y) * (i / steps));
    const capped = Tok && Tok.clampStep ? Tok.clampStep(from, { x: x, y: y }, 30) : { x: x, y: y };
    if (creatureOn(capped.x, capped.y, ignoreId) || areaTaken(capped.x, capped.y, size || 1, { [ignoreId]: 1 })) break;
    last = { x: capped.x, y: capped.y };
  }
  return last;
}
function noteSphereRam(sphere, creature) {
  if (!sphere || !creature) return;
  const z = liveSpellZones().find(one => one && String(one.id) === String(sphere.zoneId));
  const tick = (z && (z.ticks || []).find(t => t && t.save)) || { dice: "2d6", type: "fire", save: "DEX", half: true };
  const who = {
    id: creature.combatantId || creature.ownerUid || creature.id,
    name: creature.name || creature.label || "creature"
  };
  dispatchZoneTicks([Object.assign({}, tick, {
    spell: (z && z.spell) || "Flaming Sphere",
    zoneId: (z && z.id) || sphere.zoneId || "",
    casterId: (z && z.casterId) || "",
    dc: z ? z.dc : null,
    when: "ram",
    half: tick.half !== false,
    targetId: who.id,
    targetName: who.name
  })], creature, sphere.pos, sphere.pos);
  toast((who.name || "Creature") + " — the sphere rams them.");
}
function moveSpellPiece(tokenId, x, y) {
  const t = (state.tokens || []).find(tok => tok && tok.id === tokenId);
  if (!t || !t.pos) return null;
  const Tok = window.SSDNSSpellTokens;
  const feet = t.moveFeet != null ? t.moveFeet : 0;
  const dest = Tok && Tok.clampStep ? Tok.clampStep(t.pos, { x: x, y: y }, feet) : { x: Math.round(x), y: Math.round(y) };
  const from = { x: t.pos.x, y: t.pos.y };
  let land = dest;
  let rammed = null;
  if (t.spellPiece === "flaming sphere") {
    const occ = creatureOn(dest.x, dest.y, t.id);
    if (occ) {
      rammed = occ;
      land = lastOpenStep(from, dest, t.id, t.size || 1);
    }
  } else if (feet <= 0) {
    land = from;
  } else if (areaTaken(dest.x, dest.y, t.size || 1, { [t.id]: 1 })) {
    return null;
  }
  t.pos.x = land.x;
  t.pos.y = land.y;
  if (shared.tokens[t.id]) shared.tokens[t.id].pos = { x: land.x, y: land.y, by: uid, ts: Date.now() };
  if (role === "dm") {
    syncPieceOrigin(t);
    saveToken(t.id);
  } else publishPlayerMove(t);
  noteZoneCross(t, from, { x: land.x, y: land.y });
  if (rammed) noteSphereRam(t, rammed);
  draw();
  return {
    tokenId: t.id,
    from: from,
    to: { x: land.x, y: land.y },
    rammed: rammed ? { id: rammed.combatantId || rammed.ownerUid || rammed.id, name: rammed.name || rammed.label || "" } : null
  };
}
function commitPieceAim(cell) {
  const aim = state.pieceAim;
  state.pieceAim = null;
  if (!aim || !aim.resolve) return;
  const moved = cell ? moveSpellPiece(aim.tokenId, cell.x, cell.y) : null;
  aim.resolve(moved);
}
function aimSpellPiece(spec) {
  spec = spec || {};
  const Tok = window.SSDNSSpellTokens;
  const key = Tok && Tok.norm ? Tok.norm(spec.spell) : String(spec.spell || "").toLowerCase();
  const caster = String(spec.casterId || "");
  const piece = (state.tokens || []).find(t => {
    if (!t || t.spellPiece !== key) return false;
    if (!caster) return true;
    return (t.controlledBy || []).indexOf(caster) >= 0;
  }) || (state.tokens || []).find(t => t && t.spellPiece === key);
  if (!piece) return Promise.resolve(null);
  if (state.pieceAim && state.pieceAim.resolve) state.pieceAim.resolve(null);
  return new Promise(resolve => {
    state.pieceAim = {
      tokenId: piece.id,
      feet: spec.feet != null ? spec.feet : piece.moveFeet,
      resolve: resolve
    };
    toast("Click a square for " + (piece.name || "the token") + ". Right-click cancels.");
    draw();
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
/* Every condition on a token: the map's own toolbar list + the linked combatant's tracked conditions (initiative
   copy; masked for hidden enemies on the player side) + the player's own sheet for their own token.
   Raws keep exhaustion level for the word pill. tokenConditions still returns the same name strings. */
function tokenConditionRaws(t) {
  if (!t) return [];
  const out = [];
  const seen = {};
  const add = (raw) => {
    const name = String((raw && typeof raw === 'object' ? (raw.name || raw.label) : raw) || '').trim();
    if (!name) return;
    const key = name.toLowerCase().replace(/\s+\d+r?$/, '');
    const prev = seen[key];
    if (prev) {
      const cur = out[prev - 1];
      const curLv = cur && typeof cur === 'object' ? (Number(cur.level) || 0) : 0;
      const nextLv = raw && typeof raw === 'object' ? (Number(raw.level) || 0) : 0;
      if (nextLv > curLv) out[prev - 1] = raw;
      return;
    }
    seen[key] = out.length + 1;
    out.push(raw);
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
function tokenConditions(t) {
  return tokenConditionRaws(t).map(raw => String((raw && typeof raw === 'object' ? (raw.name || raw.label) : raw) || '').trim()).filter(Boolean);
}
function condTextWidth(ctx, txt) {
  try {
    const m = ctx && ctx.measureText ? ctx.measureText(txt) : null;
    if (m && m.width) return m.width;
  } catch (e) {}
  return String(txt || '').length * 7.2;
}
/* Per viewer. Normal is the default. Compact is the smaller bubble. Not synced to the room. */
function condPillCompact() {
  try { return localStorage.getItem('ssdns.map.condPills') === 'compact'; } catch (e) { return false; }
}
/* Word pills on the token (player Map and DMCC Map share this paint).
   Normal locks the circled olive/gold chip: dark olive fill, thin gold edge, cream word,
   15×11 type, centered just above the token. Compact is that same chip, smaller.
   Unconscious is not a pill — the downed X on the token is the mark.
   Exhaustion uses EXHAUSTION N until that word is wider than POISONED at this size, then EXH N. */
function paintCondWordPills(ctx, s, r, raws) {
  if (!ctx || !raws || !raws.length || !s) return;
  const visible = [];
  raws.forEach(raw => {
    const label = String((raw && typeof raw === 'object' ? (raw.name || raw.label) : raw) || '').trim();
    if (!label || /^unconscious\b/i.test(label)) return;
    visible.push(raw);
  });
  if (!visible.length) return;
  const shown = visible.slice(0, 2);
  const extra = visible.length - shown.length;
  const compact = condPillCompact();
  const pillH = compact ? 11 : 15;
  const fontPx = compact ? 8 : 11;
  const pad = compact ? 8 : 12;
  const lineW = compact ? 1 : 1.3;
  const gap = compact ? 2 : 3;
  const lift = compact ? 10 : 14;
  const fill = 'rgba(36,36,16,0.92)';
  const edge = 'rgba(195,185,110,1)';
  const ink = 'rgba(230,225,170,1)';
  ctx.save();
  ctx.font = 'bold ' + fontPx + 'px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const textW = (txt) => condTextWidth(ctx, txt);
  const fitBudget = Math.max(textW('POISONED'), r * 2.35 - pad);
  const C = window.SSDNSConditions;
  const words = shown.map(raw => {
    if (C && typeof C.pillWordFit === 'function') return C.pillWordFit(raw, textW, fitBudget);
    if (C && typeof C.pillWord === 'function') return C.pillWord(raw);
    const name = String((raw && typeof raw === 'object' ? (raw.name || raw.label) : raw) || '').trim();
    return name.toUpperCase();
  }).filter(Boolean);
  if (extra > 0) words.push('+' + extra);
  if (!words.length) { ctx.restore(); return; }
  const anchor = s.y - r - lift;
  words.forEach((txt, i) => {
    const w = Math.max(pillH, textW(txt) + pad);
    const cy = anchor - i * (pillH + gap);
    const x = s.x;
    const rad = pillH / 2;
    const left = x - w / 2;
    const right = x + w / 2;
    const y0 = cy - pillH / 2;
    const y1 = cy + pillH / 2;
    ctx.beginPath();
    ctx.moveTo(left + rad, y0);
    ctx.arcTo(right, y0, right, y1, rad);
    ctx.arcTo(right, y1, left, y1, rad);
    ctx.arcTo(left, y1, left, y0, rad);
    ctx.arcTo(left, y0, right, y0, rad);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = lineW;
    ctx.strokeStyle = edge;
    ctx.stroke();
    ctx.fillStyle = ink;
    ctx.fillText(txt, x, cy + 0.5);
  });
  ctx.restore();
}
/* DM token HP bar. It sits under the nameplate, below the ring, the same slot
   the player map uses. It is not clipped to the portrait. Unknown max draws
   nothing. 0 HP is an empty track with a red edge. Temp HP stays on the card. */
function paintDmTokenHpBar(ctx, s, r, hp, top) {
  if (!ctx || !s || !(r > 0) || !hp || !(Number(hp.max) > 0)) return;
  const max = Number(hp.max);
  const curRaw = Number(hp.cur);
  const cur = isFinite(curRaw) ? Math.max(0, curRaw) : 0;
  const pct = Math.max(0, Math.min(1, cur / max));
  const compact = condPillCompact();
  const bh = compact
    ? Math.max(3, Math.min(4, Math.round(r * 0.14)))
    : Math.max(5, Math.min(11, Math.round(r * 0.32)));
  const barY = top != null ? top : (s.y + r + 4 + Math.max(14, 13));
  const bw = r * 1.8;
  const x = s.x - bw / 2;
  const dead = cur <= 0;
  const midY = barY + bh / 2;
  ctx.save();
  ctx.fillStyle = 'rgba(18,14,10,0.92)';
  ctx.fillRect(x, barY, bw, bh);
  if (pct > 0) {
    ctx.fillStyle = pct > 0.5 ? '#4caf50' : pct > 0.25 ? '#ff9800' : '#f44336';
    ctx.fillRect(x, barY, bw * pct, bh);
  }
  ctx.lineWidth = 1;
  ctx.strokeStyle = dead ? '#e74c3c' : 'rgba(232,220,200,0.92)';
  ctx.strokeRect(x + 0.5, barY + 0.5, Math.max(0, bw - 1), Math.max(0, bh - 1));
  if (!compact && r >= 24 && bh >= 8) {
    const label = String(Math.round(cur)) + '/' + String(Math.round(max));
    let fontPx = Math.min(11, Math.max(8, Math.floor(bh - 1)));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold ' + fontPx + 'px system-ui, sans-serif';
    let tw = condTextWidth(ctx, label);
    while (fontPx > 8 && tw > bw - 4) {
      fontPx -= 1;
      ctx.font = 'bold ' + fontPx + 'px system-ui, sans-serif';
      tw = condTextWidth(ctx, label);
    }
    if (tw <= bw - 2) {
      ctx.lineJoin = 'round';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(12,8,6,0.9)';
      ctx.strokeText(label, s.x, midY + 0.5);
      ctx.fillStyle = dead ? '#f0b4ae' : '#fff8e8';
      ctx.fillText(label, s.x, midY + 0.5);
    }
  }
  ctx.restore();
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
   shell = brass head + hull in the gauge colour (slug: black band); hex = dark round, Eldorite glow for that shell level. */
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
    const cols = look.hexColors && look.hexColors.length ? look.hexColors : [look.tone || '#9ff2d6'];
    const cx = w / 2;
    ctx.shadowColor = cols[0];
    ctx.shadowBlur = 3;
    ctx.fillStyle = '#1c2022';
    ctx.beginPath();
    ctx.arc(cx, 0, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    if (cols.length > 1) {
      ctx.strokeStyle = cols[0];
      ctx.beginPath();
      ctx.arc(cx, 0, 2.5, Math.PI * 0.15, Math.PI * 1.05);
      ctx.stroke();
      ctx.strokeStyle = cols[1];
      ctx.beginPath();
      ctx.arc(cx, 0, 2.5, Math.PI * 1.15, Math.PI * 2.05);
      ctx.stroke();
    } else {
      ctx.strokeStyle = cols[0];
      ctx.beginPath();
      ctx.arc(cx, 0, 2.5, 0.5, Math.PI * 1.85);
      ctx.stroke();
    }
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 7px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(look.hexLevel || 1), cx, 0.5);
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
  if (!syncBacking()) {
    scheduleLayout();
    return;
  }
  try { sceneData(); } catch (e) { console.error(e); return; }
  const dpr = Math.min((typeof window !== 'undefined' && window.devicePixelRatio) || 1, 2);
  if (ctx.setTransform) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.globalAlpha = 1; // ensure no leaked alpha dims the DM view
  const { cols, rows, px } = state.scene.grid;
  const img = state.scene._img;
  const box = viewBox();
  ctx.clearRect(0, 0, box.w, box.h);
  const shakeX = fxShake.x || 0, shakeY = fxShake.y || 0;
  if ((shakeX || shakeY) && ctx.setTransform) ctx.setTransform(dpr, 0, 0, dpr, shakeX * dpr, shakeY * dpr);

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
      paintRegionLayer(viewSight, px, box, true);
      (viewSight.bubbles || []).forEach(b => drawVisible(b.x * px, b.y * px, b.radius * px));
      for (const ls of lightSources) drawVisible(ls.x, ls.y, ls.radius * px, ls);
      paintLightGlow(lightSources, px, viewSight);
      paintOwnLiveSquares(viewSight, px, box, lightSources);
      paintMagicalDarknessLayer(viewSight, px);
      paintTestLightMarks(px, viewSight);
      paintPlayerFog(img, cols, rows, px, box);
    } else if (role === 'player') {
      const topLeft = worldToScreen(0, 0);
      ctx.drawImage(img, topLeft.x, topLeft.y, cols * px * state.view.zoom, rows * px * state.view.zoom);
      if (viewSight.ambient === 'dim') {
        ctx.fillStyle = 'rgba(16, 16, 20, 0.72)';
        ctx.fillRect(0, 0, box.w, box.h);
      }
      paintRegionLayer(viewSight, px, box, true);
      if (viewSight.ambient === 'dim') {
        for (const ls of lightSources) if (ls.bright > 0) drawVisible(ls.x, ls.y, ls.bright * px, ls);
        (viewSight.bubbles || []).forEach(b => { if (b.darkvision) drawVisible(b.x * px, b.y * px, b.radius * px); });
      } else if ((viewSight.regions || []).some(r => r && r.level !== 'bright')) {
        for (const ls of lightSources) drawVisible(ls.x, ls.y, ls.radius * px, ls);
        (viewSight.bubbles || []).forEach(b => drawVisible(b.x * px, b.y * px, b.radius * px));
      }
      paintLightGlow(lightSources, px, viewSight);
      paintTestLightMarks(px, viewSight);
      paintPlayerFog(img, cols, rows, px, box);
    } else {
      // DM always sees the full map
      const topLeft = worldToScreen(0, 0);
      ctx.drawImage(img, topLeft.x, topLeft.y, cols * px * state.view.zoom, rows * px * state.view.zoom);

      /* Show Player FOV follows the ambient the players are under. Bright: no wash.
         Dim: darker desaturated wash, bright core punched back, dim ring and dim-only lights glow.
         Dark: black fog, same glow. See-all (FOV off) keeps the whole map. */
      if (role === 'dm' && state.showPlayerFov && img && viewSight.ambient !== 'bright') {
        if (viewSight.ambient === 'dim') {
          ctx.fillStyle = 'rgba(16, 16, 20, 0.72)';
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
      if ((viewSight.regions || []).length) {
        paintRegionLayer(viewSight, px, box, !!state.showPlayerFov);
        if (state.showPlayerFov) {
          for (const ls of lightSources) drawVisible(ls.x, ls.y, ls.radius * px, ls);
          (viewSight.bubbles || []).forEach(b => drawVisible(b.x * px, b.y * px, b.radius * px));
        }
      }
    }
  }
  if (role !== 'player') {
    paintLightGlow(lightSources, px, viewSight);
    paintTestLightMarks(px, viewSight);
  }
  paintLightRings(viewSight, px);
  paintLightLegend(viewSight.ambient);
  notePartyDark(viewSight);

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
  if (role === 'dm') paintRegionFrames(px);

  // grid. A backdrop scene (grid.show === false) stays clear at the slider's low end.
  // Raising Grid above that draws the squares again.
  const gridShown = !(state.scene.grid && state.scene.grid.show === false) || state.gridStrength > state.minStrength + 0.001;
  if (gridShown) {
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
  }

  paintRangeControls();
  paintRangeRings();
  paintMoveReach();
  paintClosedDoorGlyphs();
  stampDispelledLights();
  stampDispelledDarkness();
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
    const nudge = fxBodyNudge(t);
    let portraitGrey = nudge && nudge.grey ? nudge.grey : 0;
    if (portraitGrey < 1 && tokenIsEnfeebled(t)) portraitGrey = 1;
    if (nudge && (nudge.dx || nudge.dy)) ctx.translate(nudge.dx || 0, nudge.dy || 0);
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
      const dust = fxDustFrame(t);
      if (dust && FXA && FXA.erodeToken && typeof document !== "undefined") {
        const d = Math.ceil(r * 2 + 16);
        if (!fxErodeCanvas) fxErodeCanvas = document.createElement("canvas");
        if (fxErodeCanvas.width !== d || fxErodeCanvas.height !== d) {
          fxErodeCanvas.width = d;
          fxErodeCanvas.height = d;
        }
        const oc = fxErodeCanvas.getContext("2d");
        if (oc) {
          oc.setTransform(1, 0, 0, 1, 0, 0);
          oc.clearRect(0, 0, d, d);
          oc.save();
          oc.beginPath();
          oc.arc(d / 2, d / 2, Math.max(1, r - 2), 0, Math.PI * 2);
          oc.clip();
          oc.drawImage(t._img, d / 2 - r, d / 2 - r, r * 2, r * 2);
          oc.restore();
          FXA.erodeToken(oc, dust.lt, d / 2, d / 2, r, dust.from, { x: s.x, y: s.y });
          ctx.save();
          if (portraitGrey > 0.02) { try { ctx.filter = "grayscale(" + portraitGrey.toFixed(3) + ") brightness(" + (1 - 0.12 * portraitGrey).toFixed(3) + ")"; } catch (e) {} }
          ctx.drawImage(fxErodeCanvas, s.x - d / 2, s.y - d / 2);
          ctx.restore();
        }
      } else {
        ctx.save();
        ctx.beginPath();
        ctx.arc(s.x, s.y, r - 2, 0, Math.PI * 2);
        ctx.clip();
        if (portraitGrey > 0.02) { try { ctx.filter = "grayscale(" + portraitGrey.toFixed(3) + ") brightness(" + (1 - 0.12 * portraitGrey).toFixed(3) + ")"; } catch (e) {} }
        ctx.drawImage(t._img, s.x - r, s.y - r, r * 2, r * 2);
        ctx.restore();
      }
    }
    if (portraitGrey > 0.02) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(s.x, s.y, Math.max(1, r - 2), 0, Math.PI * 2);
      ctx.fillStyle = "rgba(90,70,100," + (0.28 * portraitGrey) + ")";
      ctx.fill();
      ctx.restore();
    }
    const voidTint = hungerVoidTint(t);
    const tint = (nudge && nudge.tint && nudge.tint.a > 0 && nudge.tint.col) ? nudge.tint : voidTint;
    if (tint && tint.a > 0 && tint.col) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(s.x, s.y, Math.max(1, r - 2), 0, Math.PI * 2);
      ctx.fillStyle = "rgba(" + tint.col + "," + Math.max(0, Math.min(0.55, tint.a)) + ")";
      ctx.fill();
      ctx.restore();
    }
    paintStickyMarks(ctx, t, s, r);
    if (t.weaponDrop || t.kind === 'drop') {
      ctx.save();
      ctx.translate(s.x, s.y - r - 10);
      ctx.fillStyle = '#e2c56a';
      ctx.strokeStyle = '#2a2114';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -8);
      ctx.lineTo(8, 0);
      ctx.lineTo(0, 8);
      ctx.lineTo(-8, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
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
    /* DM bar is under the name, clear of the ring. Assets, chests, and spell pieces are not creatures. */
    if (role === 'dm' && barHp && !t.spellPiece && t.kind !== 'asset' && t.kind !== 'chest' && !isPartyToken(t)) {
      paintDmTokenHpBar(ctx, s, r, barHp, nameY + Math.max(14, nameFont + 2));
    }
    /* Guardian budget is a number on the card, not an HP bar. */
    if (t.spellPiece === 'guardian of faith' && t.budgetLeft != null && t.budgetLeft !== '') {
      ctx.fillStyle = '#e6c36a';
      ctx.font = `${Math.max(11, nameFont)}px system-ui`;
      ctx.fillText(String(t.budgetLeft), s.x, nameY + nameFont + 2);
    }
    paintAssetChip(ctx, t, s, r);
    const condRaws = tokenConditionRaws(t);
    /* DM-only link badge. A player token that is not on a sheet shows ⚠. A linked one shows ⛓.
       Bestiary enemies, monsters, and NPC hostiles are not sheet tokens, so they get no mark.
       Players never reach this block. The word pill sits above the token, so this mark stays on the upper corner. */
    if (role === 'dm' && !t.spellPiece && t.kind !== 'asset' && tokenWantsSheetLink(t)) {
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
    /* Word pills sit above the token and stay inside this token's alpha, so a hidden token stays dim.
       The sheet / DMCC conditions reach the token (players read the masked initiative copy, so a hidden enemy shows them nothing).
       Painted after the link badge so the word is not covered. */
    paintCondWordPills(ctx, s, r, condRaws);
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

    /* Under-name bar stays the player view: own PC via canControl, or an enemy
       only when that combatant's reveal.hp is public. It sits below the nameplate,
       clear of the ring. The DM uses the same slot. */
    if (role !== 'dm' && barHp && barHp.max) {
      ctx.save();
      if (nudge && (nudge.dx || nudge.dy)) ctx.translate(nudge.dx || 0, nudge.dy || 0);
      const pct = Math.max(0, Math.min(1, (Number(barHp.cur) || 0) / barHp.max));
      const bw = r * 1.8, bh = 5;
      const barY = nameY + Math.max(14, nameFont + 2);
      ctx.fillStyle = '#333';
      ctx.fillRect(s.x - bw/2, barY, bw, bh);
      ctx.fillStyle = pct > 0.5 ? '#4caf50' : pct > 0.25 ? '#ff9800' : '#f44336';
      ctx.fillRect(s.x - bw/2, barY, bw * pct, bh);
      ctx.restore();
    }
  }

  // live rect preview while dragging a light region
  if (role === 'dm' && state.drag && state.drag.region && state.regionStart) {
    const pts = [...pointers.values()];
    if (pts.length) {
      const cur = screenToWorld(pts[0].x, pts[0].y);
      const a = worldToScreen(Math.min(state.regionStart.x, cur.x), Math.min(state.regionStart.y, cur.y));
      const b = worldToScreen(Math.max(state.regionStart.x, cur.x), Math.max(state.regionStart.y, cur.y));
      const level = (q('regionLevel') && q('regionLevel').value) || 'dim';
      ctx.save();
      ctx.strokeStyle = level === 'bright' ? 'rgba(243,226,176,0.95)' : (level === 'mdark' ? 'rgba(170,120,230,0.95)' : (level === 'dark' ? 'rgba(140,160,230,0.95)' : 'rgba(180,190,210,0.95)'));
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
      ctx.restore();
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

  paintChunk4Overs();

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
  if (ctx.setTransform) {
    const dpr = Math.min((typeof window !== 'undefined' && window.devicePixelRatio) || 1, 2);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
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
  if (state.blast || state.lightCast || state.placeAsset) { canvas.style.cursor = 'crosshair'; return; }
  if (state.tool === 'reveal' || state.tool === 'hide' || state.tool === 'erase' || state.tool === 'wall' || state.tool === 'room' || state.tool === 'door' || state.tool === 'window' || state.tool === 'testlight' || state.tool === 'region' || state.tool === 'regionerase') canvas.style.cursor = 'crosshair';
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
  paintTestLightBtn();
  paintRegionTools();
  applyCursor();
  draw();
}
function paintRegionTools() {
  const paint = q('regionBtn');
  const erase = q('regionEraseBtn');
  if (paint) {
    paint.classList.toggle('active', state.tool === 'region');
    paint.setAttribute('aria-pressed', state.tool === 'region' ? 'true' : 'false');
  }
  if (erase) {
    erase.classList.toggle('active', state.tool === 'regionerase');
    erase.setAttribute('aria-pressed', state.tool === 'regionerase' ? 'true' : 'false');
  }
}
function armRegionTool(tool) {
  state.tool = state.tool === tool ? null : tool;
  state.fogMode = null;
  state.fogKind = null;
  state.polyPoints = [];
  state.polyHover = null;
  state.secretDoor = false;
  clearToolButtons();
  paintSecretBtn();
  paintFogTools();
  paintTestLightBtn();
  paintRegionTools();
  applyCursor();
  draw();
}
function commitLightRegion(a, b) {
  if (!a || !b || !state.scene) return;
  const px = state.scene.grid.px || 70;
  const x1 = Math.min(a.x, b.x), y1 = Math.min(a.y, b.y);
  const x2 = Math.max(a.x, b.x), y2 = Math.max(a.y, b.y);
  const levelSel = q('regionLevel') && q('regionLevel').value;
  const scene = sceneData();
  const box = {
    x: Math.floor(x1 / px),
    y: Math.floor(y1 / px),
    w: Math.max(1, Math.ceil((x2 - x1) / px)),
    h: Math.max(1, Math.ceil((y2 - y1) / px))
  };
  if (levelSel === 'mdark') {
    if (!Array.isArray(scene.magicalDark)) scene.magicalDark = [];
    scene.magicalDark.push({
      id: 'md_' + Date.now().toString(36),
      kind: 'box',
      magicalDark: true,
      level: 2,
      blocksDarkvision: true,
      blocksNonmagical: true,
      devilsSightSees: true,
      dispelsLightAtOrBelow: 2,
      dispelledByLightAtOrAbove: 3,
      x: box.x, y: box.y, w: box.w, h: box.h
    });
    saveScene();
    toast('Magical darkness');
    draw();
    return;
  }
  const level = levelSel === 'bright' || levelSel === 'dark' ? levelSel : 'dim';
  scene.lightRegions.push({
    id: 'lr_' + Date.now().toString(36),
    level: level,
    kind: 'box',
    x: box.x, y: box.y, w: box.w, h: box.h
  });
  saveScene();
  toast(level.charAt(0).toUpperCase() + level.slice(1) + ' region');
  draw();
}
function eraseLightRegion(gx, gy) {
  const scene = sceneData();
  const list = scene.lightRegions || [];
  for (let i = list.length - 1; i >= 0; i--) {
    const r = list[i];
    if (!r) continue;
    if (gx >= r.x && gy >= r.y && gx < r.x + r.w && gy < r.y + r.h) {
      list.splice(i, 1);
      saveScene();
      toast('Region erased');
      draw();
      return;
    }
  }
  const dark = scene.magicalDark || [];
  for (let i = dark.length - 1; i >= 0; i--) {
    const r = dark[i];
    if (!r) continue;
    if (gx >= r.x && gy >= r.y && gx < r.x + r.w && gy < r.y + r.h) {
      dark.splice(i, 1);
      if (state.selectedDark === r.id) state.selectedDark = "";
      saveScene();
      toast('Darkness erased');
      draw();
      return;
    }
  }
}
function syncSightControls() {
  let sd = null;
  try { sd = sceneData(); } catch (e) { return; }
  const ambSel = q('ambientSel');
  if (ambSel && document.activeElement !== ambSel) {
    const amb = sd.ambient === 'bright' || sd.ambient === 'dim' ? sd.ambient : 'dark';
    if (ambSel.value !== amb) ambSel.value = amb;
  }
  const visSel = q('visionSel');
  if (visSel && document.activeElement !== visSel) {
    const mode = sd.visionMode === 'party' ? 'party' : 'own';
    if (visSel.value !== mode) visSel.value = mode;
  }
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
  paintTestLightBtn();
  paintRegionTools();
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
  paintTestLightBtn();
  paintRegionTools();
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
  if (isPartyToken(src)) { toast('One party token on this map'); return null; }
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
  const picked = selectedTokens();
  const list = picked.filter(t => !isPartyToken(t));
  if (!list.length) { toast(picked.some(isPartyToken) ? 'The party token stays one per map' : 'Select a token'); return; }
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
  /* Top-left of the square. A stored centre (n + 0.5) floors onto that square,
     so two Medium tokens sharing an edge stay 1 square / 5 ft, not 10. */
  const ax = Math.floor(Number(a.pos.x) + 1e-6);
  const ay = Math.floor(Number(a.pos.y) + 1e-6);
  const bx = Math.floor(Number(b.pos.x) + 1e-6);
  const by = Math.floor(Number(b.pos.y) + 1e-6);
  if (![ax, ay, bx, by].every((n) => isFinite(n))) return null;
  const gap = Math.max(axisGap(ax, sa, bx, sb), axisGap(ay, sa, by, sb));
  return gap * 5;
}
function tokenByRef(id) {
  if (!id) return null;
  const all = state.tokens || [];
  const exact = all.find(t => t && t.id === id);
  if (exact) return exact;
  const body = all.filter(t => t && !t.spellPiece);
  const combat = body.find(t => t && t.combatantId === id);
  if (combat) return combat;
  const player = body.find(t => t && t.kind === "player" && (t.ownerUid === id || t.sheetId === id));
  if (player) return player;
  /* Public tokens omit combatantId. The fight row's mapTokenId is how a sheet target id finds the square. */
  const order = (state.initiative && state.initiative.order) || [];
  const row = order.find(r => r && (r.id === id || r.playerId === id || r.mapTokenId === id));
  if (row) {
    const linked = all.find(t => t && row.mapTokenId && t.id === row.mapTokenId);
    if (linked) return linked;
    const owned = body.find(t => t && t.kind === "player" && ((row.playerId && t.ownerUid === row.playerId) || (row.kind === "player" && row.id && t.ownerUid === row.id)));
    if (owned) return owned;
  }
  return body.find(t => t && t.ownerUid === id) || null;
}
function nearestHostileFeet(shooter) {
  if (!shooter) return null;
  let hostile = null;
  (state.tokens || []).forEach(t => {
    if (!t || t.id === shooter.id || !t.pos || t.spellPiece || t.notTargetable || hideDownedToken(t)) return;
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
/* Shatter and the other "point of your choice" spells are not a creature shot.
   Measuring the selected token and disabling the button stopped the cast before the map could take a point. */
function pointPlacedSpell(attack) {
  const Area = window.SSDNSSpellArea;
  if (!Area || !Area.areaOf || !attack) return false;
  const names = [];
  if (typeof attack === "string") names.push(attack);
  else {
    if (attack.name) names.push(attack.name);
    if (attack.id) names.push(attack.id);
    if (attack.spellId) names.push(attack.spellId);
  }
  for (let i = 0; i < names.length; i++) {
    const area = Area.areaOf(names[i]);
    if (area && !area.self) return true;
  }
  return false;
}
function rangeButtonNote(attack, targetId, shooterId) {
  if (pointPlacedSpell(attack)) return null;
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
  const measured = feet != null && feet !== "" && isFinite(Number(feet));
  /* A failed measurement is not "across the room". Touch still stops when the map can see more than 5 ft. */
  return Area.touchBlock(feet, range, { allowUnmeasured: kind === "heal" || !measured });
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
    if (!t || !t.pos || t.spellPiece || t.notTargetable || hideDownedToken(t)) return false;
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
  const Area = window.SSDNSSpellArea;
  const who = caster && caster.pos ? { x: caster.pos.x, y: caster.pos.y, size: caster.size || 1 } : null;
  if (Area && Area.pointInReach) return Area.pointInReach(area, who, originSq);
  if (!area || area.rangeFeet == null || !area.rangeFeet) return true;
  if (!who) return true;
  const sz = who.size || 1;
  const dist = Math.max(Math.abs(originSq.x * 5 - (who.x + sz / 2) * 5), Math.abs(originSq.y * 5 - (who.y + sz / 2) * 5));
  return dist <= area.rangeFeet + 2.5;
}
function tokensInBlast(area, origins, facing, excludeId) {
  const Area = window.SSDNSSpellArea;
  if (!Area || !area || !Area.hits) return [];
  const out = [];
  (state.tokens || []).forEach(t => {
    if (!t || !t.pos) return;
    if (hideDownedToken(t) || isPartyToken(t)) return;
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
function tokenAtOrigin(origin) {
  if (!origin) return null;
  const x = Number(origin.x), y = Number(origin.y);
  return (state.tokens || []).find(t => {
    if (!t || !t.pos || t.spellPiece) return false;
    if (t.hidden && role !== "dm") return false;
    if (!onViewedScene(t)) return false;
    const s = t.size || 1;
    const cx = t.pos.x + s / 2, cy = t.pos.y + s / 2;
    return Math.abs(cx - x) <= s / 2 + 0.05 && Math.abs(cy - y) <= s / 2 + 0.05;
  }) || null;
}
function anchorPayload(token) {
  if (!token) return null;
  return {
    id: token.id, name: token.name || token.label || "", ownerUid: token.ownerUid || "",
    kind: token.kind || "", dexMod: Number(token.dexMod || token.dex || 0) || 0
  };
}
function confirmBlast() {
  const aiming = state.blast;
  if (aiming && aiming.needsAim && aiming.origin && aiming.hover) {
    const ox = Number(aiming.origin.x) * 5;
    const oy = Number(aiming.origin.y) * 5;
    const hx = Number(aiming.hover.x) * 5;
    const hy = Number(aiming.hover.y) * 5;
    if (Math.hypot(hx - ox, hy - oy) > 0.5) aiming.facing = Math.atan2(hy - oy, hx - ox);
  }
  const b = state.blast;
  if (!b) return;
  if (!b.origin) { toast("Pick a point on the map"); return; }
  const origins = (b.points && b.points.length) ? b.points.slice() : [b.origin];
  origins.forEach(o => { if (!o.casterSize && b.casterSize) o.casterSize = b.casterSize; });
  const anchor = tokenAtOrigin(b.origin);
  const L = window.SSDNSLighting;
  const spec = L && L.emitter ? L.emitter((b.spec && b.spec.name) || "") : null;
  const casterTok = blastCaster(b.spec);
  if (anchor && hideDownedToken(anchor) && spec && L.needsUnwillingSave && L.needsUnwillingSave(spec, anchor, casterTok)) {
    toast('Down. Turn on Show downed to include them.');
    const resolveSkip = b.resolve;
    state.blast = null;
    paintBlastBanner();
    draw();
    if (resolveSkip) resolveSkip(null);
    return;
  }
  if (anchor && spec && L.needsUnwillingSave && L.needsUnwillingSave(spec, anchor, casterTok)) {
    const dc = Number(b.spec && b.spec.dc) || 0;
    const mod = Number(anchor.dexMod || anchor.dex || 0) || 0;
    const resolveFail = b.resolve;
    if (!(dc > 0)) {
      toast("Unwilling target. No spell DC, so the light does not catch.");
      state.blast = null;
      paintBlastBanner();
      draw();
      if (resolveFail) resolveFail(null);
      return;
    }
    const roll = 1 + Math.floor(Math.random() * 20);
    const save = L.dexSave(roll, mod, dc);
    toast("DEX " + roll + (mod ? (mod > 0 ? "+" + mod : mod) : "") + " = " + save.total + " vs DC " + dc + (save.passed ? ". The light doesn't catch." : ". The light takes hold."));
    if (save.passed) {
      state.blast = null;
      paintBlastBanner();
      draw();
      if (resolveFail) resolveFail(null);
      return;
    }
  }
  const tokens = tokensInBlast(b.area, origins, b.facing || 0, b.casterId);
  const payload = { origin: b.origin, origins: origins, facing: b.facing || 0, tokens: tokens, area: b.area, anchorToken: anchorPayload(anchor) };
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
function blastCreatureAt(e) {
  if (!state.scene) return null;
  const w = pointerWorld(e);
  const t = hitTest(w.x, w.y);
  if (!t || !t.pos || t.spellPiece || t.notTargetable || isPartyToken(t)) return null;
  if (t.kind === "marker" || t.kind === "chest" || t.kind === "asset") return null;
  if (hideDownedToken(t)) return null;
  return t;
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
    /* Touch spells (Light) commit on the legal click. A second click read as the cast doing nothing. */
    if (b.placed && b.area && b.area.rangeFeet != null && Number(b.area.rangeFeet) <= 5) {
      confirmBlast();
      return;
    }
    /* A creature under the cursor is the point. One click centers the sphere on them.
       Empty ground still waits for Cast or a second click so the ring can be checked. */
    if (b.placed && !b.needsAim) {
      const under = blastCreatureAt(e);
      if (under) {
        const sz = under.size || 1;
        const center = { x: under.pos.x + sz / 2, y: under.pos.y + sz / 2 };
        if (blastInRange(b.area, center, blastCaster(b.spec))) b.origin = center;
        confirmBlast();
        return;
      }
    }
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
function adoptLootState(box, state) {
  if (!box || !state) return box;
  if (state.taken) box.taken = true;
  if (state.opened) box.opened = true;
  if (state.lock) {
    box.lock = box.lock || {};
    if (state.lock.unlocked) box.lock.unlocked = true;
    box.lock.allowRetries = !!state.lock.allowRetries;
    box.lock.attempts = Object.assign({}, box.lock.attempts || {}, state.lock.attempts || {});
    if (state.lock.dc) box.lock.dc = state.lock.dc;
  }
  const rows = state.rows || [];
  (box.contents || []).forEach((row, i) => {
    const mark = rows.filter(r => r && row && r.id && r.id === row.id)[0] || rows[i];
    if (mark && mark.taken) row.taken = true;
  });
  return box;
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
function collectableToken(t) {
  if (!t || t === undefined) return false;
  if (t.loot && t.loot.taken) return false;
  if (t.weaponDrop && t.weaponDrop.taken) return false;
  return t.kind === 'chest' || t.kind === 'drop' || !!t.lootBoxId || !!t.weaponDrop;
}
function dropBox(token) {
  if (!token) return null;
  if (token.loot && (token.loot.contents || token.loot.lock)) return token.loot;
  const w = token.weaponDrop;
  if (!w) return lootStub(token);
  const box = {
    id: token.lootBoxId || token.id,
    name: w.name || token.name || 'Dropped weapon',
    boxType: 'enemy-drop',
    shared: true,
    reveal: 'everyone',
    rolled: true,
    opened: true,
    taken: !!w.taken,
    contents: [{ id: w.itemId || w.name || 'weapon', qty: 1, name: w.name || 'Dropped weapon', dirty: !!w.dirty, hand: true, band: 'drop' }],
    cash: { es: 0, black: 0, blackId: '', branch: 'none' },
    lock: { dc: 0, unlocked: true, method: [], jammed: false },
    log: ['Dropped on the map']
  };
  token.loot = box;
  return box;
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
      if (act === 'pick' && !(Give && Give.chestAct)) {
        const live = state.tokens.find(t => t && (t.lootBoxId === boxId || t.id === boxId)) || token;
        const box = dropBox(live);
        const Loot = window.SSDNSLoot;
        const sheet = playerCharacter() || {};
        const res = Loot && Loot.pickLock ? Loot.pickLock(box, sheet, uid) : { ok: false, reason: "Can't pick that" };
        if (box) box._rollLine = res.line || res.reason || "";
        if (live) { live.loot = box; saveToken(live.id); }
        postAssetLog((sheet.name || "Someone") + " " + (res.line || res.reason || "tries the lock"));
        toast(res.line || res.reason || "Pick lock");
        if (res.success) box._showLoot = true;
        menu.innerHTML = chestMenuHtml(box);
        requestDraw();
        return;
      }
      if (act === 'open' && !(Give && Give.chestAct)) {
        const live = state.tokens.find(t => t && (t.lootBoxId === boxId || t.id === boxId)) || token;
        const box = dropBox(live);
        const locked = box && box.lock && Number(box.lock.dc) > 0 && !box.lock.unlocked;
        if (locked) { toast("Locked"); return; }
        if (box) { box.opened = true; box._showLoot = true; }
        if (live) { live.loot = box; saveToken(live.id); }
        menu.innerHTML = chestMenuHtml(box);
        return;
      }
      if (act === 'loot' && !(Give && Give.chestAct)) {
        const live = state.tokens.find(t => t && (t.lootBoxId === boxId || t.id === boxId)) || token;
        const box = dropBox(live);
        const locked = box && box.lock && Number(box.lock.dc) > 0 && !box.lock.unlocked;
        if (locked) { toast("Still locked."); return; }
        if (box) box._showLoot = true;
        menu.innerHTML = chestMenuHtml(box);
        return;
      }
      if (act === 'take-one' && !(Give && Give.chestAct)) {
        const live = state.tokens.find(t => t && (t.lootBoxId === boxId || t.id === boxId)) || token;
        const box = dropBox(live);
        const index = Number(ev.target.getAttribute('data-index'));
        const row = box && (box.contents || [])[index];
        if (!row || row.taken) { toast("Gone."); if (box) menu.innerHTML = chestMenuHtml(box); return; }
        const Loot = window.SSDNSLoot;
        const result = Loot && Loot.takeRows ? Loot.takeRows(box, uid, [row], playerCharacter() || {}) : null;
        if (live) { live.loot = box; saveToken(live.id); }
        if (!result || !result.ok) { toast((result && result.reason) || "Gone."); menu.innerHTML = chestMenuHtml(box); return; }
        if (Loot.applyTake && playerCharacter()) Loot.applyTake(playerCharacter(), result);
        toast("Collected " + (row.name || "item"));
        postAssetLog((row.name || "An item") + " taken");
        menu.innerHTML = chestMenuHtml(box);
        requestDraw();
        return;
      }
      if (act === 'take-all' && !(Give && Give.chestAct)) {
        const live = state.tokens.find(t => t && (t.lootBoxId === boxId || t.id === boxId)) || token;
        const box = dropBox(live);
        const result = collectMapLoot(box, uid);
        if (live) {
          live.loot = box;
          if (live.weaponDrop) live.weaponDrop.taken = !!box.taken;
          saveToken(live.id);
        }
        if (result && result.ok && adapter && adapter.write) adapter.write('map/public/events/loot', {
          boxId: boxId, action: 'take-all', from: uid, seq: Date.now(), taken: true
        }, { seq: Date.now(), by: uid });
        toast(result && result.toast ? result.toast : (result && result.reason) || "Can't take that");
        menu.innerHTML = chestMenuHtml(box);
        requestDraw();
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
  else menu.innerHTML = chestMenuHtml(dropBox(token) || lootStub(token));
}
function playerCharacter() {
  try { return (window.SSDNSApp && window.SSDNSApp.doc && window.SSDNSApp.doc().character) || null; } catch (e) { return null; }
}
function carriedItems() {
  const sheet = playerCharacter();
  return ((sheet && sheet.items) || []).filter(it => it && (it.count == null || Number(it.count) > 0) && (it.catalogId || it.id || it.name));
}
/* Take lands on the sheet once. A second take of the same box is refused. */
function collectMapLoot(box, who) {
  const Loot = window.SSDNSLoot;
  if (!Loot || !Loot.takeAll || !box) return { ok: false, reason: "Can't take that" };
  if (box.taken) return { ok: false, reason: "Already taken." };
  box.opener = who || uid;
  box.shared = true;
  box.reveal = "everyone";
  box.boxType = box.boxType || "enemy-drop";
  const sheet = playerCharacter() || {};
  const result = Loot.takeAll(box, who || uid, sheet);
  if (!result || !result.ok) return { ok: false, reason: (result && result.reason) || "Can't take that" };
  if (Loot.applyTake && playerCharacter()) Loot.applyTake(playerCharacter(), result);
  const names = ((result.xfer && result.xfer.legs) || []).map(leg => {
    const p = (leg && leg.payload) || {};
    return p.text || p.itemId || (p.ammo && p.ammo.type) || "";
  }).filter(Boolean);
  let toastText = names.length ? ("Collected " + names.join(", ")) : "Collected";
  if (result.warning) toastText += " · " + result.warning;
  return { ok: true, toast: toastText, result: result };
}
function resetSelectedLock() {
  if (role !== "dm") return;
  const chest = state.selected && state.selected.loot && state.selected.loot.lock ? state.selected : null;
  if (chest) {
    chest.loot.lock.attempts = {};
    saveToken(chest.id);
    toast("Lock attempts reset");
    return;
  }
  const wall = state.doorPick;
  if (wall && wall.door) {
    wall.pickAttempts = {};
    saveScene();
    toast("Lock attempts reset");
    return;
  }
  toast("Select a chest or a door first");
}
function placeLockedChest() {
  if (role !== "dm") return null;
  const raw = q("doorLockDc") && q("doorLockDc").value;
  const dc = Math.max(0, parseInt(raw, 10) || 0);
  const id = "chest_" + Date.now().toString(36);
  const box = {
    id: id,
    name: "Chest",
    boxType: "strongbox",
    rolled: true,
    opened: false,
    taken: false,
    contents: [{ id: "trail-rations", qty: 1, name: "Trail rations" }],
    cash: { es: 0, black: 0, blackId: "", branch: "none" },
    lock: {
      dc: dc, unlocked: !(dc > 0), method: dc > 0 ? ["tools"] : [], jammed: false, jamOnFail: false,
      allowRetries: !!(q("lockAllowRetries") && q("lockAllowRetries").checked), attempts: {}
    },
    log: ["DM placed a chest"]
  };
  const sel = state.selected;
  const at = sel && sel.pos ? { x: sel.pos.x + 1, y: sel.pos.y } : null;
  const token = pinLootChest(box, at);
  toast(token ? ("Chest placed" + (dc > 0 ? " · lock DC " + dc : "")) : "Couldn't place a chest");
  return token;
}
function dropCarriedItem(itemId) {
  const sheet = playerCharacter();
  const Items = window.SSDNSItems;
  const item = carriedItems().find(it => (it.catalogId || it.id) === itemId) || carriedItems()[0];
  if (!item) { toast("Nothing to drop"); return null; }
  if (Items && Items.drop) {
    const res = Items.drop(sheet, item.catalogId || item.id, { dm: role === "dm" });
    if (!res || !res.ok) { toast((res && res.reason) || "Can't drop that"); return null; }
  }
  const actor = commandToken();
  const at = actor && actor.pos ? { x: actor.pos.x + 1, y: actor.pos.y } : null;
  const token = pinWeaponDrop({
    name: item.name || "Dropped item",
    itemId: item.catalogId || item.id || item.name,
    at: at,
    reason: "Dropped from inventory"
  });
  toast((item.name || "Item") + " is on the map");
  return token;
}
function chestMenuHtml(box) {
  if (!box) return '<p>Chest</p>';
  const locked = !!(box.lock && Number(box.lock.dc) > 0 && !box.lock.unlocked);
  const prior = box.lock && box.lock.attempts && box.lock.attempts[uid];
  const parts = ['<p><b>' + (box.name || 'Chest') + '</b>' + (locked ? ' <span>Locked</span>' : '') + '</p>'];
  if (box._rollLine) parts.push('<p class="ssm-roll">' + box._rollLine + '</p>');
  else if (prior && prior.line) parts.push('<p class="ssm-roll">' + prior.line + '</p>');
  parts.push('<button type="button" data-chest="open">Open</button>');
  if (locked) {
    if (prior && !box.lock.allowRetries && !prior.success) parts.push('<p>Pick failed</p>');
    else parts.push('<button type="button" data-chest="pick">Pick lock</button>');
  }
  parts.push('<button type="button" data-chest="loot"' + (locked ? ' disabled' : '') + '>Loot</button>');
  if (!locked && box._showLoot) {
    (box.contents || []).forEach((row, i) => {
      if (!row) return;
      if (row.taken) parts.push('<p>' + (row.name || 'Item') + ' — gone</p>');
      else parts.push('<button type="button" data-chest="take-one" data-index="' + i + '">Take ' + (row.name || 'item') + '</button>');
    });
    if ((box.contents || []).some(row => row && !row.taken)) parts.push('<button type="button" data-chest="take-all">Take all</button>');
  }
  return parts.join('');
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
function pinWeaponDrop(spec) {
  if (!state.scene) return null;
  spec = spec || {};
  const name = String(spec.name || 'Dropped weapon');
  const itemId = String(spec.itemId || spec.weaponId || name);
  const dirty = !!spec.dirty;
  const at = spec.at && isFinite(Number(spec.at.x)) && isFinite(Number(spec.at.y)) ? { x: Number(spec.at.x), y: Number(spec.at.y) } : null;
  const boxId = spec.boxId || ('drop_' + Date.now().toString(36) + Math.floor(Math.random() * 1000));
  const box = {
    id: boxId,
    name: name,
    boxType: 'enemy-drop',
    shared: true,
    reveal: 'everyone',
    rolled: true,
    opened: true,
    taken: false,
    weaponDrop: true,
    contents: [{ id: itemId, qty: 1, name: name, dirty: dirty, hand: true, band: 'drop' }],
    cash: { es: 0, black: 0, blackId: '', branch: 'none' },
    lock: { dc: 0, unlocked: true, method: [], jammed: false },
    log: [spec.reason || 'Dropped on the map']
  };
  const token = makeToken({
    kind: 'drop',
    name: name,
    label: 'Drop',
    color: '#c9a227',
    ownerCanMove: false,
    pos: at || undefined
  });
  if (!token) return null;
  token.kind = 'drop';
  token.weaponDrop = { name: name, itemId: itemId, dirty: dirty, taken: false, fromId: spec.fromId || '' };
  token.lootBoxId = boxId;
  token.loot = box;
  token.ownerCanMove = false;
  if (shared.tokens[token.id]) {
    shared.tokens[token.id].kind = 'drop';
    shared.tokens[token.id].lootBoxId = boxId;
    shared.tokens[token.id].weaponDrop = Object.assign({}, token.weaponDrop);
    shared.tokens[token.id].name = name;
    shared.tokens[token.id].label = 'Drop';
    shared.tokens[token.id].color = '#c9a227';
  }
  saveToken(token.id);
  requestDraw();
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
    if (by && target && target.attempt) {
      wall.pickAttempts = wall.pickAttempts || {};
      wall.pickAttempts[by] = target.attempt;
    }
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
  wall.allowRetries = !!(q("lockAllowRetries") && q("lockAllowRetries").checked);
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
  const pack = I.doorMenu(wall, { token: mine, dm: role === "dm", who: uid });
  if (!pack.reach) {
    menu.hidden = true;
    if (pack.toast && !pack.hidden) toast(pack.toast);
    return;
  }
  menu.hidden = false;
  const lockNote = wall.locked ? " <span>Locked" + (role === "dm" && wall.lockDc ? " DC " + wall.lockDc : "") + "</span>" : "";
  const prior = wall.pickAttempts && wall.pickAttempts[uid];
  const roll = prior && prior.line ? '<p class="ssm-roll">' + prior.line + "</p>" : "";
  menu.innerHTML = "<p><b>Door</b>" + lockNote + "</p>" + roll + (pack.actions || []).map(o => {
    if (o.disabled) return "<p>" + o.label + "</p>";
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
      if (wall.pickAttempts) box.lock.attempts = wall.pickAttempts;
      box.lock.allowRetries = !!wall.allowRetries;
      const sheet = playerSheet();
      const res = Loot && Loot.pickLock ? Loot.pickLock(box, sheet, uid) : (I.lockpick(wall, sheet));
      nat = res && res.nat; total = res && res.total; success = !!(res && res.success);
      wall.pickAttempts = (box.lock && box.lock.attempts) || wall.pickAttempts || {};
      if (res && res.line) wall.pickAttempts[uid] = Object.assign({}, wall.pickAttempts[uid], { line: res.line });
      toast(res && (res.line || res.reason) || (success ? "Unlocked" : "Still locked"));
      postAssetLog(res && (res.line || res.reason) || "Pick lock");
    } else if (action === "open" && wall.locked) toast("Locked");
    else toast(action === "peek" ? "Peek sent" : "Sent");
    const attempt = wall.pickAttempts && wall.pickAttempts[uid];
    postDoorReq({ door: I.wallRef(wall), action: action, by: uid, nat: nat, total: total, success: success, attempt: attempt || null }, action);
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
      nat: req.nat, total: req.total, success: req.success, attempt: req.attempt || null
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
function commandToken() {
  return (state.tokens || []).find(t => t && t.id === state.commandToken) || null;
}
function interactTarget(actor) {
  if (!actor || !actor.pos) return null;
  const I = interactApi();
  const walls = ((sceneData() && sceneData().walls) || []).filter(w => w && w.door && (role === 'dm' || !doorIsSecret(w)));
  if (I && I.inReach) {
    for (let i = 0; i < walls.length; i++) {
      const gate = I.inReach(actor, walls[i], false, 5);
      if (gate && gate.ok) return { kind: 'door', wall: walls[i] };
    }
  }
  const near = (state.tokens || []).filter(t => t && t !== actor && feetBetween(actor, t) != null && feetBetween(actor, t) <= 5);
  const chest = near.find(t => collectableToken(t));
  if (chest) return { kind: 'chest', token: chest };
  const A = assetLib();
  const asset = near.find(t => {
    if (!t || t.kind !== 'asset' || !A || !A.reachGate || !A.menuActions) return false;
    const gate = A.reachGate(actor, t, assetReachNeed(t));
    return !!(gate && gate.ok && A.menuActions(t.asset).some(a => a && !a.stub));
  });
  if (asset) return { kind: 'asset', token: asset };
  return null;
}
function hideCommandMenu() {
  state.commandToken = "";
  const menu = el.querySelector('[data-act="tokenCmd"]');
  if (menu) menu.remove();
  if (el) el.dataset.moveArmed = state.moveArmed ? '1' : '0';
}
function cancelTokenCommand(why) {
  state.moveArmed = false;
  state.moveHover = null;
  if (state.moveConfirm) state.moveConfirm.pending = null;
  if (state.moveMode && window.SSDNSMoveMode) window.SSDNSMoveMode.set(false, why || 'cancel');
  hideCommandMenu();
  requestDraw();
}
function armTokenMove() {
  const token = commandToken();
  if (!token || !canDrag(token)) return;
  state.moveArmed = true;
  if (fightOn() && window.SSDNSMoveMode) window.SSDNSMoveMode.set(true, 'menu');
  placeCommandMenu();
  requestDraw();
}
function useTokenInteract() {
  const token = commandToken();
  const hit = interactTarget(token);
  if (!hit) return;
  if (hit.kind === 'door') showDoorMenu(hit.wall, token);
  else if (hit.kind === 'chest' || hit.kind === 'drop') showChestMenu(hit.token);
  else if (hit.kind === 'asset') showAssetMenu(hit.token);
}
function placeCommandMenu() {
  const token = commandToken();
  let menu = el.querySelector('[data-act="tokenCmd"]');
  if (!token || !state.scene) {
    if (menu) menu.remove();
    if (el) el.dataset.moveArmed = state.moveArmed ? '1' : '0';
    return;
  }
  if (!menu) {
    menu = document.createElement('div');
    menu.className = 'ssm-token-cmd';
    menu.setAttribute('data-act', 'tokenCmd');
    menu.innerHTML = '<button type="button" data-act="tokenCmdMove">Move</button><button type="button" data-act="tokenCmdInteract">Interact</button><button type="button" data-act="tokenCmdDrop">Drop</button>';
    menu.addEventListener('pointerdown', ev => ev.stopPropagation());
    menu.addEventListener('click', ev => {
      ev.stopPropagation();
      const act = ev.target && ev.target.getAttribute && ev.target.getAttribute('data-act');
      if (act === 'tokenCmdMove') armTokenMove();
      if (act === 'tokenCmdInteract') useTokenInteract();
      if (act === 'tokenCmdDrop') {
        const items = carriedItems();
        if (!items.length) { toast("Nothing to drop"); return; }
        menu.innerHTML = items.slice(0, 6).map(it => '<button type="button" data-act="tokenCmdDropItem" data-item="' + String(it.catalogId || it.id).replace(/"/g, "") + '">' + (it.name || it.catalogId || "Item") + '</button>').join("") + '<button type="button" data-act="tokenCmdDropBack">Back</button>';
        return;
      }
      if (act === 'tokenCmdDropItem') dropCarriedItem(ev.target.getAttribute('data-item'));
      if (act === 'tokenCmdDropBack') { menu.remove(); placeCommandMenu(); }
    });
    el.appendChild(menu);
  }
  const move = menu.querySelector('[data-act="tokenCmdMove"]');
  const interact = menu.querySelector('[data-act="tokenCmdInteract"]');
  if (move) {
    move.disabled = !canDrag(token);
    move.classList.toggle('is-on', !!state.moveArmed);
  }
  if (interact) interact.disabled = !interactTarget(token);
  const dropBtn = menu.querySelector('[data-act="tokenCmdDrop"]');
  if (dropBtn) dropBtn.disabled = !carriedItems().length;
  const px = state.scene.grid.px || 70;
  const s = worldToScreen((token.pos.x + 0.5) * px, token.pos.y * px);
  const r = ((Number(token.size) || 1) * px * (state.view.zoom || 1)) / 2;
  const ox = canvas ? canvas.offsetLeft || 0 : 0;
  const oy = canvas ? canvas.offsetTop || 0 : 0;
  menu.style.left = Math.round(ox + s.x + r + 8) + 'px';
  menu.style.top = Math.round(oy + s.y - 8) + 'px';
  el.dataset.moveArmed = state.moveArmed ? '1' : '0';
}
function showCommandMenu(token) {
  if (!token || !token.id) return;
  if (state.commandToken !== token.id) {
    state.moveArmed = false;
    state.moveHover = null;
    if (state.moveConfirm) state.moveConfirm.pending = null;
  }
  state.commandToken = token.id;
  placeCommandMenu();
}
function selectToken(token) {
  if (!token) return;
  if (state.pendingTarget && role === 'dm') {
    if (hideDownedToken(token)) {
      toast('Down. Turn on Show downed to include them.');
      return;
    }
    if (state.pendingTarget.spellId && pointPlacedSpell(state.pendingTarget)) {
      const shot = state.pendingTarget;
      state.pendingTarget = null;
      paintPendingBanner();
      renderDrawer();
      draw();
      emit('drawer:target', { tokenId: shot.tokenId, weaponId: '', spellId: shot.spellId, targetTokenId: '', combatantId: tokenCombatant(shot.tokenId), targetCombatantId: '' });
      return;
    }
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
/* Story marker for a big map outside a fight. One per scene. Not a combatant. */
function isPartyToken(t) {
  return !!(t && (t.kind === 'party' || t.storyMarker === 'party'));
}
function partyTokenId(sceneId) {
  return 'pty_' + String(sceneId || activeSceneId() || 'scn_dustyspur01');
}
function partyOnScene(sceneId) {
  const sid = sceneId || activeSceneId() || 'scn_dustyspur01';
  return (state.tokens || []).find(t => t && isPartyToken(t) && (t.sceneId || 'scn_dustyspur01') === sid) || null;
}
/* Hell Maker, square-fit from assets/img/dm-only/hell-maker.webp. Story marker only. */
const PARTY_ART = '../assets/images/party-hell-maker.webp';
function partyFace(image) {
  const src = String(image || '');
  if (!src || src.indexOf('asset-baggage-cart') >= 0 || src.indexOf('party-six-shooter.svg') >= 0) return PARTY_ART;
  return src;
}
function placePartyToken(opts) {
  if (role !== 'dm' || !state.scene) return null;
  opts = opts || {};
  const sid = activeSceneId() || 'scn_dustyspur01';
  const existing = partyOnScene(sid);
  if (existing) {
    selectToken(existing);
    openDrawer(existing.id);
    toast('Party token is already on this map');
    draw();
    return existing;
  }
  const cell = (opts.pos && isFinite(opts.pos.x) && isFinite(opts.pos.y)) ? { x: Math.floor(opts.pos.x), y: Math.floor(opts.pos.y) } : viewCenterCell();
  const label = String(opts.label || 'Party').slice(0, 16) || 'Party';
  const token = makeToken({
    id: partyTokenId(sid),
    kind: 'party',
    storyMarker: 'party',
    name: label,
    label: label,
    ownerUid: '',
    ownerCanMove: false,
    controlledBy: [],
    combatantId: '',
    sheetId: '',
    noInit: true,
    noHpPool: true,
    notTargetable: true,
    color: '#c9a227',
    image: PARTY_ART,
    size: 1,
    pos: cell,
    sceneId: sid
  });
  if (!token) return null;
  selectToken(token);
  openDrawer(token.id);
  toast('Party token placed');
  draw();
  return token;
}
function movePartyToken(x, y) {
  if (role !== 'dm') return null;
  const t = partyOnScene();
  if (!t || !t.pos) return null;
  const others = (state.tokens || []).filter(tok => tok && tok.pos && tok.id !== t.id).map(tok => ({ id: tok.id, x: tok.pos.x, y: tok.pos.y }));
  const spot = clampFootprint(Math.floor(Number(x)), Math.floor(Number(y)), t.size || 1);
  t.pos = { x: spot.x, y: spot.y };
  if (shared.tokens[t.id]) shared.tokens[t.id].pos = { x: spot.x, y: spot.y };
  saveToken(t.id);
  draw();
  const moved = others.some(row => {
    const live = state.tokens.find(tok => tok && tok.id === row.id);
    return live && live.pos && (live.pos.x !== row.x || live.pos.y !== row.y);
  });
  return { id: t.id, x: t.pos.x, y: t.pos.y, othersMoved: moved };
}
function renamePartyToken(label) {
  if (role !== 'dm') return '';
  const t = partyOnScene();
  if (!t) return '';
  const next = String(label || 'Party').slice(0, 16) || 'Party';
  setLabel(t, next);
  t.name = next;
  if (shared.tokens[t.id]) shared.tokens[t.id].name = next;
  saveToken(t.id);
  draw();
  return t.label;
}
function removePartyToken() {
  if (role !== 'dm') return false;
  const t = partyOnScene();
  if (!t) return false;
  removeMapTokens([t.id], { silent: true, keepOwner: true });
  return true;
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
    sceneId: spec.sceneId || activeSceneId() || 'scn_dustyspur01',
    image: spec.image || '',
    sheetId: spec.sheetId || (spec.kind === 'player' ? owner : ''),
    combatantId: spec.combatantId || (spec.kind === 'player' ? owner : '')
  };
  if (spec.kind === 'party' || spec.storyMarker === 'party') {
    token.kind = 'party';
    token.storyMarker = 'party';
    token.noInit = true;
    token.noHpPool = true;
    token.notTargetable = true;
    token.ownerUid = '';
    token.ownerCanMove = false;
    token.controlledBy = [];
    token.combatantId = '';
    token.sheetId = '';
    token.lights = [];
    token.torch = false;
    token.darkvision = 0;
  }
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
  function keepSpellControl(t, id) {
    if (!t || !(t.spellPiece || t.kind === "spell" || t.zoneId)) return false;
    const who = t.ownerUid || uid;
    t.ownerUid = "";
    t.controlledBy = t.controlledBy || [];
    if (who && t.controlledBy.indexOf(who) < 0) t.controlledBy.push(who);
    const copy = shared.tokens[id] || (shared.tokens[id] = { id: id });
    copy.ownerUid = "";
    copy.controlledBy = t.controlledBy.slice();
    saveToken(id);
    return true;
  }
  state.tokens.forEach(t => {
    if (!(t && t.ownerUid === uid && t.id !== want)) return;
    if (!keepSpellControl(t, t.id)) extras.push(t.id);
  });
  Object.keys(shared.tokens || {}).forEach(id => {
    const t = shared.tokens[id];
    if (!(t && t.ownerUid === uid && id !== want) || extras.indexOf(id) >= 0) return;
    const live = state.tokens.find(tok => tok && tok.id === id);
    if (live) return;
    if (!keepSpellControl(t, id)) extras.push(id);
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
/* New and empty rooms start on the title cover. Rooms that already saved a scene,
   and every token/party/sight fallback that still says scn_dustyspur01, stay put. */
function roomAlreadyMapped() {
  const scenes = shared.scenes || {};
  return Object.keys(scenes).some(id => {
    const sc = scenes[id];
    if (!sc || typeof sc !== 'object') return false;
    if (Array.isArray(sc.walls) && sc.walls.length) return true;
    if (Array.isArray(sc.fogShapes) && sc.fogShapes.length) return true;
    if (sc.meta && sc.meta.src) return true;
    if (sc.seededPlay || sc.seededPack || sc.seededWorld) return true;
    return false;
  });
}
function ensureDefaultScene() {
  if (role !== 'dm' || defaultSceneDone) return;
  const sid = (state.scene && state.scene.id) || 'scn_dustyspur01';
  const cur = (shared.scenes && shared.scenes[sid]) || {};
  /* A scene that already has walls, fog, or a saved image is a room in progress.
     The bootstrap write of an empty Dusty Spur during boot does not count. */
  if (cur.walls && cur.walls.length) { defaultSceneDone = true; return; }
  if (roomAlreadyMapped()) { defaultSceneDone = true; return; }
  if (sawRemoteScene && sid !== 'scn_dustyspur01' && sid !== DEFAULT_SCENE_ID) { defaultSceneDone = true; return; }
  defaultSceneDone = true;
  showBetweenEncounters({ moveTokens: false, quiet: true });
}
function coverRecord() {
  return builtinScenes().find(s => s && s.id === DEFAULT_SCENE_ID) || null;
}
/* Fog off and daylight, unless the DM has already painted fog on the cover. */
function brightenCover() {
  const sd = sceneData(DEFAULT_SCENE_ID);
  if ((sd.fogShapes || []).length) return sd;
  let changed = false;
  if (sd.fogRevealed !== true) { sd.fogRevealed = true; changed = true; }
  if (!sd.ambient) { sd.ambient = 'bright'; changed = true; }
  if (changed) saveScene(DEFAULT_SCENE_ID);
  return sd;
}
function seatPlayers(id, moveTokens) {
  if (!shared.playerScenes) shared.playerScenes = {};
  partyList().forEach(p => {
    const u = p && (p.uid || p.id);
    if (!u) return;
    if (moveTokens || !shared.playerScenes[u]) shared.playerScenes[u] = id;
  });
  /* Player tokens keep the square they already occupy. On the title cover those
     squares sit on the painted title. Moving them would be a made-up layout. */
  (state.tokens || []).forEach(t => {
    if (!t || !t.ownerUid || isPartyToken(t)) return;
    if (!moveTokens && t.sceneId && t.sceneId !== id) return;
    if (moveTokens || !t.sceneId) {
      t.sceneId = id;
      if (shared.tokens[t.id]) shared.tokens[t.id].sceneId = id;
      shared.playerScenes[t.ownerUid] = id;
      saveToken(t.id);
    }
  });
  postScenes();
}
function showBetweenEncounters(opts) {
  opts = opts || {};
  if (role !== 'dm') return false;
  if (!coverRecord()) { toast('Cover map is missing'); return false; }
  brightenCover();
  const ok = swapScene(DEFAULT_SCENE_ID);
  seatPlayers(DEFAULT_SCENE_ID, opts.moveTokens !== false);
  renderTurnStrip();
  draw();
  if (!opts.quiet) toast('Between encounters');
  return ok !== false;
}
function worldSceneId(worldId) {
  return 'scn_' + String(worldId || '').replace(/[^a-z0-9_]+/gi, '_');
}
function worldSceneReady(sid) {
  if (library[sid]) return true;
  const sd = shared.scenes && shared.scenes[sid];
  if (!sd || typeof sd !== 'object') return false;
  if (sd.seededWorld) return true;
  if (sd.meta && sd.meta.src) return true;
  if (Array.isArray(sd.walls) && sd.walls.length) return true;
  if (Array.isArray(sd.fogShapes) && sd.fogShapes.length) return true;
  return Object.keys(shared.tokens || {}).some(tid => {
    const t = shared.tokens[tid];
    return t && (t.sceneId || '') === sid;
  });
}
function fitWorldGrid(w, h) {
  const ppsq = 70;
  return {
    cols: Math.max(1, Math.min(200, Math.round((Number(w) || 2100) / ppsq))),
    rows: Math.max(1, Math.min(200, Math.round((Number(h) || 1400) / ppsq))),
    px: ppsq,
    show: false,
    labels: false
  };
}
/* One scene per world image. A second open swaps to it and leaves walls and tokens alone. */
function openWorldAsMap(worldId) {
  if (role !== 'dm') return false;
  const w = worldMaps().find(m => m && m.id === worldId);
  if (!w) return false;
  const sid = worldSceneId(w.id);
  if (worldSceneReady(sid)) return swapScene(sid);
  const entry = {
    id: sid,
    name: w.name || 'World map',
    src: asset(w.img),
    thumb: asset(w.thumb || w.img),
    grid: fitWorldGrid(w.w, w.h),
    ppsq: 70,
    from: w.id,
    notes: 'Opened from the World folder',
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  saveLibraryEntry(entry);
  const sd = sceneData(sid);
  if (!sd.seededWorld) {
    if (!sd.ambient) sd.ambient = 'bright';
    if (!sd.walls.length && !(sd.fogShapes || []).length) sd.fogRevealed = true;
    sd.seededWorld = true;
    saveScene(sid);
  }
  return swapScene(sid);
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
  state.moveArmed = false;
  if (fightOn() && state.moveMode && window.SSDNSMoveMode) window.SSDNSMoveMode.set(false, 'cancel');
  else clearMovePreview();
  placeCommandMenu();
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
  state.moveArmed = !!on;
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
  if (on) hideCommandMenu();
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
/* 0.3.216 / 0.2.229: Unconscious or 0 HP. No HP pool is down only from status or the condition.
   Show downed (DM, room-wide, default off) puts them back on the target list and into saves. */
function showDownedNow() {
  const A = window.SSDNSApplied;
  if (A && typeof A.showDowned === 'function') return !!A.showDowned();
  return !!state.showDowned;
}
function tokenDowned(t) {
  if (!t || t.spellPiece || t.kind === 'asset' || t.kind === 'chest' || isPartyToken(t)) return false;
  const facts = reactorFacts(t);
  const row = {
    kind: t.ownerUid ? 'player' : (t.kind || ''),
    status: facts.status || '',
    hp: facts.hp,
    noHpPool: !!facts.noHpPool,
    conditions: facts.conditions || []
  };
  const A = window.SSDNSApplied;
  if (A && typeof A.isDownedTarget === 'function') return !!A.isDownedTarget(row);
  const status = String(row.status || '');
  if (/^(down|dead|unconscious|dying)$/i.test(status)) return true;
  if ((row.conditions || []).some(name => /unconscious|dead|dying/i.test(String(name || '')))) return true;
  const hp = row.hp;
  return hp != null && hp !== '' && isFinite(Number(hp)) && Number(hp) <= 0 && !row.noHpPool;
}
function tokenDusted(t) {
  if (!t) return false;
  if (tokenBuried(t.id) || tokenBuried(t.combatantId)) return true;
  if (/disintegrat/i.test(String(t.status || ""))) return true;
  const row = rowForToken(t);
  return !!(row && (row.disintegrated || /disintegrat/i.test(String(row.status || ""))));
}
function hideDownedToken(t) {
  /* Dust stays off the target list even when Show downed is on. */
  if (tokenDusted(t)) return true;
  return tokenDowned(t) && !showDownedNow();
}
function adoptShowDowned(on) {
  const next = !!on;
  state.showDowned = next;
  const A = window.SSDNSApplied;
  if (A && typeof A.setShowDowned === 'function' && typeof A.showDowned === 'function' && A.showDowned() !== next) A.setShowDowned(next);
  paintShowDownedBtn();
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
  /* Arrows stay hidden until Move is tapped, in a fight and outside one. */
  if (dmEditing() || !state.moveArmed) {
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
  /* Clicks walk only after Move is tapped. Outside a fight that is the same gate. */
  if (!state.moveArmed) return false;
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
  if (dmEditing() || !state.moveArmed) return;
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
  if (!state.moveArmed) return;
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
  state.slides.push({ id, points, start: fxStamp(), ms: Math.max(400, points.length * 280) });
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
/* Place is one shot, and it runs before fog/wall/ping so a tool cannot swallow
   the click and leave Place armed (the next token click would drop an asset
   instead of opening the character drawer). Right-click or Esc cancels. */
function assetClick(e) {
  if (role !== 'dm' || !state.placeAsset) return false;
  if (e.button === 2) {
    e.preventDefault();
    state.placeAsset = null;
    toast('Place cancelled');
    applyCursor();
    return true;
  }
  if (e.button !== 0) return false;
  e.preventDefault();
  const wPlace = pointerWorld(e);
  const placePx = (state.scene.grid && state.scene.grid.px) || 70;
  placeAssetAt(state.placeAsset, { x: Math.floor(wPlace.x / placePx), y: Math.floor(wPlace.y / placePx) });
  state.placeAsset = null;
  applyCursor();
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
    if (state.pieceAim && e.button === 2) {
      e.preventDefault();
      const aim = state.pieceAim;
      state.pieceAim = null;
      if (aim.resolve) aim.resolve(null);
      toast('Move cancelled');
      return;
    }
    if (state.pieceAim && e.button === 0) {
      e.preventDefault();
      commitPieceAim(cellUnderEvent(e));
      return;
    }
    if (state.lightCast && e.button === 0) {
      e.preventDefault();
      lightCastPointer(e);
      return;
    }
    if (state.lightCast && e.button === 2) {
      e.preventDefault();
      cancelLightCast();
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
    if (role === 'dm' && state.tool === 'testlight') {
      e.preventDefault();
      const w = pointerWorld(e);
      const cellPx = state.scene.grid.px;
      dropTestTorch({ x: w.x / cellPx, y: w.y / cellPx });
      return;
    }
    if (role === 'dm' && state.tool === 'region') {
      e.preventDefault();
      state.regionStart = pointerWorld(e);
      state.drag = { region: true, sx: e.clientX, sy: e.clientY };
      return;
    }
    if (role === 'dm' && state.tool === 'regionerase') {
      e.preventDefault();
      const w = pointerWorld(e);
      const cellPx = state.scene.grid.px;
      eraseLightRegion(w.x / cellPx, w.y / cellPx);
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
    const w = pointerWorld(e);
    if (role === 'dm' && !state.tool && e.button === 0 && state.scene) {
      const cellPx = state.scene.grid.px || 70;
      const darkHit = darknessAt(w.x / cellPx, w.y / cellPx);
      state.selectedDark = darkHit && !hitTest(w.x, w.y) ? (darkHit.id || "") : "";
      if (state.selectedDark) {
        state.selectedLight = "";
        toast("Darkness selected. Douse puts it out.");
      }
    }
    const orb = !state.tool && e.button === 0 ? spellOrbAt(w.x, w.y) : null;
    if (orb && canMoveOrb(orb)) {
      e.preventDefault();
      state.selectedLight = orb.id;
      state.drag = { spellOrb: { id: orb.id, x: (Number(orb.x) || 0) + 0.5, y: (Number(orb.y) || 0) + 0.5, ox: (Number(orb.x) || 0) + 0.5, oy: (Number(orb.y) || 0) + 0.5 } };
      draw();
      return;
    }
    const hit = hitTest(w.x, w.y);
    if (hit && hit.kind === 'asset' && role === 'player' && !e.shiftKey) {
      if (!tokenSeenBy(hit, sightFor(uid, getPlayerScene()))) { toast("You can't see that."); return; }
      selectToken(hit);
      showCommandMenu(hit);
      return;
    }
    if (hit && (hit.kind === 'chest' || hit.lootBoxId) && !e.shiftKey) {
      selectToken(hit);
      showCommandMenu(hit);
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
        showCommandMenu(hit);
        openDrawer(hit.id);
        draw();
        return;
      }
      if (role === 'dm' && e.ctrlKey) {
        const idx = state.selectedIds.indexOf(hit.id);
        if (idx >= 0) state.selectedIds.splice(idx, 1);
        else state.selectedIds.push(hit.id);
        state.selected = hit;
        showCommandMenu(hit);
        draw();
        return;
      } else if (role === 'dm' && state.selectedIds.includes(hit.id) && !isPartyToken(hit)) {
        // already in selection — keep group and drag all. The party marker never rides along.
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
        showCommandMenu(hit);
        if (!state.moveArmed || !state.moveMode) {
          if (role === 'dm') openDrawer(hit.id);
          draw();
          return;
        }
        state.drag = { moveAim: true, token: hit, sx: e.clientX, sy: e.clientY, deferDrawer: role === 'dm' ? hit.id : "" };
        try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
        draw();
        return;
      }
      /* A plain click selects and shows Move / Interact. The drag and the path wait for Move.
         Edit tokens is the free drag: the card waits until the pointer is up, so docking it
         cannot slide the map out from under the cursor mid-drag. */
      if (!dmEditing() && !state.moveArmed) {
        showCommandMenu(hit);
        if (role === 'dm') openDrawer(hit.id);
        draw();
        return;
      }
      hideCommandMenu();
      /* token size: ox/oy is the grabbed square, so a 4x4 token grabbed by a corner does not jump */
      const gpx = state.scene.grid.px;
      if (isPartyToken(hit)) {
        state.selectedIds = [hit.id];
        state.selected = hit;
      } else {
        state.selectedIds = state.selectedIds.filter(id => {
          const tok = state.tokens.find(t => t && t.id === id);
          return tok && !isPartyToken(tok);
        });
        if (state.selectedIds.indexOf(hit.id) < 0) state.selectedIds.push(hit.id);
      }
      state.drag = { token: hit, ox: Math.round(w.x / gpx - 0.5), oy: Math.round(w.y / gpx - 0.5), sx: e.clientX, sy: e.clientY, starts: {}, deferDrawer: role === 'dm' ? hit.id : "" };
      try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
      state.selectedIds.forEach(id => {
        const t = state.tokens.find(tok => tok.id === id);
        if (t && (isPartyToken(hit) || !isPartyToken(t))) state.drag.starts[id] = { x: t.pos.x, y: t.pos.y };
      });
      if (hit.kind === 'asset') showAssetMenu(hit);
    } else if (hit && role === 'player') {
      selectToken(hit);
      if (isPartyToken(hit)) {
        hideCommandMenu();
        toast('The DM moves the party token');
        draw();
        return;
      }
      showCommandMenu(hit);
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
        state.drag = { pan: true, sx: e.clientX, sy: e.clientY, vx: state.view.x, vy: state.view.y, clickMove: state.moveArmed && !state.tool && e.button === 0, dismissMenu: !state.moveArmed && !state.tool && e.button === 0 };
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
  if (state.drag && state.drag.spellOrb && state.scene) {
    const w = pointerWorld(e);
    const px = state.scene.grid.px || 70;
    state.drag.spellOrb.x = Math.floor(w.x / px) + 0.5;
    state.drag.spellOrb.y = Math.floor(w.y / px) + 0.5;
    draw();
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
        const sphere = t.spellPiece === "flaming sphere";
        const ramHit = sphere ? creatureOn(newX, newY, t.id) : null;
        /* The sphere floats over a 5-ft barrier and across a 10-ft pit, then stops when it rams a creature. */
        if (ramHit) {
          state.drag.rammed = { id: t.id, creature: ramHit };
        } else if (!allowStack && areaTaken(newX, newY, tsz, state.drag.starts)) {
          state.drag.blocked = true;
          if (sphere) state.drag.rammed = null;
        } else if (!wallBlocked || sphere) {
          if (sphere) state.drag.rammed = null;
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
      cancelTokenCommand('ground');
    }
  } else if (state.drag && state.drag.dismissMenu && e.button === 0) {
    const dx = e.clientX - state.drag.sx, dy = e.clientY - state.drag.sy;
    if (Math.hypot(dx, dy) < CLICK_SLOP) hideCommandMenu();
  } else if (state.drag && state.drag.select && state.drag.cx != null && e.button === 0 && !state.tool) {
    const dx = e.clientX - state.drag.cx, dy = e.clientY - state.drag.cy;
    if (Math.hypot(dx, dy) < CLICK_SLOP) {
      if (state.moveArmed) {
        tryClickMove(cellUnderEvent(e));
        cancelTokenCommand('ground');
      } else hideCommandMenu();
      state.drag.select = false;
    }
  }
  const wasTokenDrag = !!(state.drag && state.drag.token && !state.drag.moveAimDone);
  if (wasTokenDrag && state.drag.starts && state.drag.sx != null) {
    const mdx = e.clientX - state.drag.sx;
    const mdy = e.clientY - state.drag.sy;
    const cell = ((state.scene && state.scene.grid && state.scene.grid.px) || 70) * (state.view.zoom || 1);
    if (Math.hypot(mdx, mdy) < Math.max(8, cell / 2)) {
      Object.keys(state.drag.starts).forEach(id => {
        const t = state.tokens.find(tok => tok && tok.id === id);
        if (!t || !state.drag.starts[id]) return;
        t.pos.x = state.drag.starts[id].x;
        t.pos.y = state.drag.starts[id].y;
        if (shared.tokens[t.id]) shared.tokens[t.id].pos = Object.assign({}, t.pos, { by: uid, ts: Date.now() });
      });
      state.drag.clickOnly = true;
    }
  }
  if (wasTokenDrag) clearStreamTimer();
  if (state.drag && state.drag.walled) toastDmEditHint();
  if (state.drag && state.drag.rammed && state.drag.rammed.creature && !state.drag.blocked) {
    const piece = state.tokens.find(tok => tok && tok.id === state.drag.rammed.id);
    if (piece) noteSphereRam(piece, state.drag.rammed.creature);
  }
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
  if (state.drag && state.drag.region && state.regionStart) {
    commitLightRegion(state.regionStart, pointerWorld(e));
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
  if (state.drag && state.drag.spellOrb) {
    const orb = state.drag.spellOrb;
    moveSpellOrb(orb.id, { x: orb.x, y: orb.y }, false);
  }
  if (wasTokenDrag && state.drag && state.drag.starts) {
    Object.keys(state.drag.starts).forEach(id => {
      const t = state.tokens.find(tok => tok && tok.id === id);
      const origin = state.drag.starts[id];
      if (!t || !origin || !t.pos || isPartyToken(t)) return;
      noteZoneCross(t, origin, { x: t.pos.x, y: t.pos.y });
    });
  }
  pointers.delete(e.pointerId);
  const deferDrawer = state.drag && state.drag.deferDrawer;
  if (pointers.size === 0) state.drag = null;
  if (deferDrawer && role === 'dm') openDrawer(deferDrawer);
  state.fogStart = null;
  state.regionStart = null;
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
/* Player tokens stand in for a character sheet. Enemies, bestiary, NPCs, and friendlies do not. */
function tokenWantsSheetLink(token) {
  if (!token) return false;
  if (token.kind === 'player') return true;
  if (token.sheetId) return true;
  if (token.ownerUid) return true;
  return false;
}
function lightStatusText(token) {
  if (!token) return null;
  const owner = token.ownerUid;
  const party = owner ? partyList().find(p => p && (p.uid || p.id) === owner) : null;
  if (!party) {
    if (!tokenWantsSheetLink(token)) {
      const borrowed = (token.borrowedLights || []).map(r => r && r.text).filter(Boolean);
      return borrowed.length ? { warn: false, text: borrowed.join(' · ') } : null;
    }
    const borrowed = (token.borrowedLights || []).map(r => r && r.text).filter(Boolean);
    return { warn: true, text: '⚠ Not linked to a sheet' + (borrowed.length ? ' · ' + borrowed.join(' · ') : '') };
  }
  const name = party.name || party.label || 'sheet';
  const bits = [];
  if (token.dmDoused) bits.push('doused');
  else (token.borrowedLights || []).forEach(row => {
    if (row && row.text) bits.push(row.text);
  });
  if (!token.dmDoused) (token.lights || []).forEach(l => {
    if (!l || l.out) return;
    bits.push(String(l.name || 'light').toLowerCase() + ' ' + (Number(l.bright) || 0) + '/' + (Number(l.dim) || 0));
  });
  const dv = Number(token.darkvision) || 0;
  if (dv) bits.push('darkvision ' + dv);
  const detail = bits.length ? ' (' + bits.join(', ') + ')' : '';
  return { warn: false, text: 'Linked: ' + name + ' · lights synced ✓' + detail };
}
/* 0.3.224: filled HP bar lives in the AC / HP / Speed row. Same bands as the map-token bar. */
function drawerHpTone(pct) {
  const dead = pct <= 0 ? ' is-dead' : '';
  const band = pct > 50 ? 'is-high' : (pct > 25 ? 'is-mid' : 'is-low');
  return band + dead;
}
function drawerVitalsHtml(ac, hp, speedBit, noHpPool, edit) {
  hp = hp || {};
  const maxHp = noHpPool ? NaN : Number(hp.max);
  const haveCur = !noHpPool && hp.cur !== '' && hp.cur != null && isFinite(Number(hp.cur));
  const curHp = haveCur ? Number(hp.cur) : NaN;
  const hpPct = isFinite(maxHp) && maxHp > 0 && haveCur ? Math.max(0, Math.min(100, (curHp / maxHp) * 100)) : null;
  const num = noHpPool
    ? 'No HP pool'
    : ('HP ' + (hp.cur != null && hp.cur !== '' ? hp.cur : '—') + '/' + (hp.max != null && hp.max !== '' ? hp.max : '—') + (hp.temp ? ' (+' + hp.temp + ')' : ''));
  const bar = hpPct == null ? '' : '<div class="ssm-hpbar ssm-hpbar-row ' + drawerHpTone(hpPct) + '" role="meter" aria-label="HP" aria-valuemin="0" aria-valuenow="' + esc(curHp) + '" aria-valuemax="' + esc(maxHp) + '"><span style="width:' + hpPct + '%"></span></div>';
  const acBit = edit
    ? '<label class="ssm-act ssm-ac">AC <input data-act="enemyAc" type="number" min="0" step="1" value="' + (ac != null && ac !== '' ? esc(ac) : '') + '" aria-label="Armor class"></label>'
    : '<span class="ssm-vital">AC ' + esc(ac != null ? ac : '—') + '</span>';
  const maxBit = (edit && !noHpPool)
    ? '<label class="ssm-act ssm-maxhp">Max <input data-act="enemyMaxHp" type="number" min="0" step="1" value="' + (hp.max != null && hp.max !== '' ? esc(hp.max) : '') + '" aria-label="Maximum HP"></label>'
    : '';
  return '<div class="ssm-vitals" data-act="vitals">' +
    acBit +
    '<span class="ssm-vital ssm-vital-hp"><span class="ssm-hpnum">' + esc(num) + '</span><span class="ssm-hpedit">' + bar + maxBit + '</span></span>' +
    '<span class="ssm-vital">' + speedBit + '</span></div>';
}
function dmToolsHtml(inner) {
  if (!inner) return '';
  return '<section class="ssm-dmtools" data-act="dmTools"><div class="ssm-section">DM tools</div>' + inner + '</section>';
}
function bombToolsHtml(token) {
  const I = window.SSDNSInteract;
  if (!I || !token || typeof I.bombPanelHtml !== 'function') return '';
  return dmToolsHtml(I.bombPanelHtml(token));
}
function lightDrawerHtml(token) {
  if (role !== 'dm' || !token) return '';
  const status = lightStatusText(token);
  const dvShown = token.dmDarkvision != null && token.dmDarkvision !== ''
    ? (Number(token.dmDarkvision) || 0)
    : (Number(token.darkvision) || 0);
  const statusHtml = status && status.text
    ? '<p class="ssm-linkstatus' + (status.warn ? ' is-warn' : '') + '" data-act="linkStatus">' + esc(status.text) + '</p>'
    : '';
  return statusHtml +
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
function testLightRows(sd) {
  const list = sd && Array.isArray(sd.testLights) ? sd.testLights : [];
  const rows = [];
  list.forEach(l => {
    if (!l || l.out) return;
    const bright = Number(l.bright) || 0;
    const dim = Number(l.dim) || 0;
    rows.push({
      x: (Number(l.x) || 0) + 0.5,
      y: (Number(l.y) || 0) + 0.5,
      bright: bright,
      dim: dim,
      radius: (bright + dim) / 5,
      cone: false,
      facing: 0,
      name: l.name || 'Torch',
      id: l.id || 'test-torch',
      catalogId: l.catalogId || 'torch-pitch-stick',
      test: true
    });
  });
  return rows;
}
function torchSpec() {
  const T = window.SSDNSLighting && window.SSDNSLighting.TABLE && window.SSDNSLighting.TABLE['torch-pitch-stick'];
  return {
    bright: T && T.bright != null ? Number(T.bright) : 20,
    dim: T && T.dim != null ? Number(T.dim) : 20,
    name: (T && T.name) || 'Torch'
  };
}
/* Drop a torch on a square. Second click puts it out. Third click picks it up. */
function dropTestTorch(cell) {
  if (role !== 'dm' || !state.scene) return;
  const scene = sceneData();
  const g = state.scene.grid || { cols: 1, rows: 1 };
  const x = Math.max(0, Math.min((g.cols || 1) - 1, Math.floor(Number(cell.x) || 0)));
  const y = Math.max(0, Math.min((g.rows || 1) - 1, Math.floor(Number(cell.y) || 0)));
  const list = scene.testLights;
  const hit = list.find(l => l && l.x === x && l.y === y);
  if (!hit) {
    const spec = torchSpec();
    list.push({
      id: 'tl_' + Date.now().toString(36),
      x: x, y: y,
      bright: spec.bright, dim: spec.dim,
      name: spec.name,
      catalogId: 'torch-pitch-stick',
      out: false
    });
    toast('Torch on ' + x + ',' + y);
  } else if (!hit.out) {
    hit.out = true;
    toast('Torch out');
  } else {
    scene.testLights = list.filter(l => l !== hit);
    toast('Torch picked up');
  }
  saveScene();
  draw();
}
function paintTestLightBtn() {
  const b = q('testLightBtn');
  if (!b) return;
  const on = state.tool === 'testlight';
  b.classList.toggle('active', on);
  b.setAttribute('aria-pressed', on ? 'true' : 'false');
}
function sphereTokenForZone(z) {
  if (!z || String(z.key || z.spell || '').toLowerCase() !== 'flaming sphere') return null;
  return (state.tokens || []).find(t => t && t.spellPiece === 'flaming sphere' && String(t.zoneId || '') === String(z.id)) || null;
}
function zoneLightRows() {
  const L = window.SSDNSLighting;
  const rows = [];
  liveSpellZones().forEach(z => {
    if (!z || !z.light || z.lightOut || z.lightHidden) return;
    /* Static zone origin. The live token emits this light instead, including while it is dragged. */
    if (sphereTokenForZone(z)) return;
    const bright = Number(z.light.bright) || 0;
    const dim = Number(z.light.dim) || 0;
    const pts = (z.shape === "wall" && L && L.wallLightPoints) ? L.wallLightPoints(z) : [z.origin];
    pts.forEach((p, i) => {
      if (!p || p.x == null) return;
      rows.push({
        x: Number(p.x), y: Number(p.y), bright: bright, dim: dim, radius: (bright + dim) / 5,
        cone: false, facing: 0, name: z.spell || "Light", id: "zone:" + z.id + ":" + i,
        magical: true, spell: true, spellLevel: z.light.spellLevel != null ? Number(z.light.spellLevel) : (Number(z.level) || 0)
      });
    });
  });
  return rows;
}
function spellEmitterList(sceneId) {
  const sid = sceneId || activeSceneId();
  if (state.spellEmittersLive && sid === activeSceneId()) return state.spellEmitters || [];
  try {
    const sd = sceneData(sid);
    if (sd && Array.isArray(sd.spellEmitters)) return sd.spellEmitters;
  } catch (e) {}
  return state.spellEmitters || [];
}
function emitterCenter(em) {
  if (!em || em.doused) return null;
  if (em.followId) {
    const t = tokenByRef(em.followId);
    if (!t || !t.pos || t.hidden) return null;
    const sid = t.sceneId || "scn_dustyspur01";
    if (sid !== activeSceneId()) return null;
    const s = t.size || 1;
    return { x: t.pos.x + s / 2, y: t.pos.y + s / 2 };
  }
  return { x: (Number(em.x) || 0) + 0.5, y: (Number(em.y) || 0) + 0.5 };
}
function spellEmitterRows(sceneId) {
  const rows = [];
  spellEmitterList(sceneId).forEach(em => {
    if (!em || em.doused) return;
    const at = emitterCenter(em);
    if (!at) return;
    const bright = Number(em.bright) || 0;
    const dim = Number(em.dim) || 0;
    rows.push({
      x: at.x, y: at.y, bright: bright, dim: dim, radius: (bright + dim) / 5,
      cone: false, facing: 0, name: em.name || "Light", id: em.id || "",
      magical: em.magical !== false, spell: true,
      spellLevel: em.spellLevel != null ? Number(em.spellLevel) : 0
    });
  });
  return rows;
}
function cloneEmitter(em) {
  return em ? Object.assign({}, em) : em;
}
function commitEmitters(list) {
  const next = (list || []).map(cloneEmitter);
  state.spellEmitters = next;
  state.spellEmittersLive = true;
  state.lightSeq = Date.now();
  try {
    const sd = sceneData();
    sd.spellEmitters = next.map(cloneEmitter);
    sd.lightSeq = state.lightSeq;
  } catch (e) {}
  if (role === "dm") { try { saveScene(); } catch (err) {} }
  publishLightFeed(next);
  stampBorrowedLights();
  requestDraw();
}
function publishLightFeed(list) {
  if (!adapter || !adapter.write || !uid) return;
  const id = "slight_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const row = {
    id: id, ts: new Date().toISOString(), from: uid,
    fromName: role === "dm" ? "DM" : "Player",
    text: "spell-light", kind: "sfx", event: "spell-light",
    emitters: list, lightSeq: state.lightSeq, sceneId: activeSceneId()
  };
  try {
    const p = adapter.write("tableFeed/" + id, row, { by: uid });
    if (p && p.catch) p.catch(() => {});
  } catch (e) {}
}
function adoptSpellEmitters(list, seq) {
  state.spellEmitters = (Array.isArray(list) ? list : []).map(cloneEmitter);
  state.spellEmittersLive = true;
  if (seq) state.lightSeq = Number(seq) || state.lightSeq;
  stampBorrowedLights();
  requestDraw();
}
function applyLightFeed(row) {
  if (!row || row.event !== "spell-light" || !Array.isArray(row.emitters)) return;
  if (row.from && row.from === uid) return;
  if (row.sceneId && row.sceneId !== activeSceneId()) return;
  const seq = Number(row.lightSeq) || 0;
  if (state.spellEmittersLive && seq && state.lightSeq && seq < state.lightSeq) return;
  adoptSpellEmitters(row.emitters, seq || Date.now());
  if (role === "dm") {
    try {
      const sd = sceneData();
      sd.spellEmitters = state.spellEmitters.map(cloneEmitter);
      sd.lightSeq = state.lightSeq;
      saveScene();
    } catch (e) {}
  }
}
function borrowedForToken(tokenId) {
  const L = window.SSDNSLighting;
  const out = [];
  spellEmitterList().forEach(em => {
    if (!em || em.doused || String(em.followId || "") !== String(tokenId)) return;
    out.push(L && L.borrowedRow ? L.borrowedRow(em) : { text: (em.name || "Light") + " from " + (em.casterName || "someone") });
  });
  spellZoneList().forEach(z => {
    if (!z || z.lightOut || !z.light || String(z.followTarget || "") !== String(tokenId)) return;
    const row = {
      id: "zone:" + z.id, name: z.spell || "Light", casterName: z.casterName || "", dur: z.dur || "",
      bright: Number(z.light.bright) || 0, dim: Number(z.light.dim) || 0
    };
    row.text = L && L.borrowedText ? L.borrowedText(row) : (row.name + " from " + (row.casterName || "someone"));
    out.push(row);
  });
  return out;
}
function stampBorrowedLights() {
  (state.tokens || []).forEach(t => {
    if (!t || !t.id) return;
    const rows = borrowedForToken(t.id);
    const sig = JSON.stringify(rows);
    if (t._borrowSig === sig) return;
    t._borrowSig = sig;
    t.borrowedLights = rows;
    const copy = shared.tokens && shared.tokens[t.id];
    if (copy) copy.borrowedLights = rows.map(r => Object.assign({}, r));
  });
  adoptBorrowedSheet();
}
function adoptBorrowedSheet() {
  if (role !== "player" || !window.SSDNSApp || !window.SSDNSApp.applyPatch) return;
  const me = (state.tokens || []).find(t => t && t.ownerUid === uid);
  if (!me) return;
  const rows = (me.borrowedLights || []).map(r => Object.assign({}, r));
  const sig = JSON.stringify(rows);
  if (state._sheetBorrowSig === sig) return;
  state._sheetBorrowSig = sig;
  try {
    window.SSDNSApp.applyPatch(d => { if (d && d.character) d.character.borrowedLights = rows; });
    if (window.SSDNSLighting && window.SSDNSLighting.paintBox) window.SSDNSLighting.paintBox();
  } catch (e) {}
}
function casterCenterOf(token) {
  if (!token || !token.pos) return null;
  const s = token.size || 1;
  return { x: token.pos.x + s / 2, y: token.pos.y + s / 2, id: token.id, ownerUid: token.ownerUid || "", kind: token.kind || "" };
}
function lightCasterToken(casterId) {
  return tokenByRef(casterId) || (state.tokens || []).find(t => t && t.ownerUid === uid && t.pos && onViewedScene(t)) || null;
}
function newLightId(prefix) {
  return (prefix || "sl") + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
}
function storePointLight(spec, at, follow, meta) {
  const cellX = Math.floor(Number(at && at.x) || 0);
  const cellY = Math.floor(Number(at && at.y) || 0);
  const row = {
    id: newLightId("sl"),
    key: spec.key, name: spec.name, bright: spec.bright, dim: spec.dim,
    spellLevel: spec.spellLevel, magical: spec.magical !== false,
    x: cellX, y: cellY, followId: follow || "",
    casterId: meta.casterId || "", casterUid: meta.casterUid || "", casterName: meta.casterName || "",
    conc: !!spec.conc, dur: spec.dur || "", rounds: spec.rounds || 0,
    roundsLeft: spec.rounds > 0 ? spec.rounds : 0,
    doused: false, groupId: meta.groupId || "", movedRound: 0
  };
  const list = spellEmitterList().map(cloneEmitter);
  if (spec.place === "point-or-token" && meta.casterId) {
    const kept = list.filter(em => !(em && em.key === spec.key && String(em.casterId) === String(meta.casterId)));
    kept.push(row);
    commitEmitters(kept);
  } else {
    list.push(row);
    commitEmitters(list);
  }
  return row;
}
function storeOrbLights(spec, points, meta) {
  const groupId = newLightId("dlg");
  const list = spellEmitterList().filter(em => !(em && em.key === "dancing-lights" && meta.casterId && String(em.casterId) === String(meta.casterId)));
  (points || []).forEach(p => {
    list.push({
      id: newLightId("orb"),
      key: spec.key, name: spec.name, bright: spec.bright, dim: spec.dim,
      spellLevel: spec.spellLevel, magical: true,
      x: Math.floor(Number(p.x) || 0), y: Math.floor(Number(p.y) || 0), followId: "",
      casterId: meta.casterId || "", casterUid: meta.casterUid || "", casterName: meta.casterName || "",
      conc: true, dur: spec.dur || "1 minute", rounds: spec.rounds || 10,
      roundsLeft: spec.rounds || 10, doused: false, groupId: groupId, movedRound: 0
    });
  });
  commitEmitters(list);
  return groupId;
}
function lightIsZone(name) {
  const Z = window.SSDNSSpellZones;
  return !!(Z && Z.isZone && Z.isZone(name));
}
function placeSpellLight(opts) {
  opts = opts || {};
  const L = window.SSDNSLighting;
  const spec = L && L.emitter ? (L.emitter(opts.key || opts.name) || L.emitter(opts.name)) : null;
  if (!spec) return Promise.resolve(null);
  if (state.lightCast) cancelLightCast();
  const casterTok = lightCasterToken(opts.casterId);
  const caster = casterCenterOf(casterTok);
  if (spec.place === "caster" || spec.place === "target") return Promise.resolve({ caster: true, spec: spec });
  if (!caster && spec.range > 0) { toast("Put your token on the map first"); return Promise.resolve(null); }
  return new Promise(resolve => {
    state.lightCast = {
      spec: spec, caster: caster,
      casterId: (casterTok && casterTok.id) || opts.casterId || "",
      casterUid: opts.casterId || uid || "",
      casterName: opts.casterName || "",
      dc: opts.dc, points: [], hover: null, resolve: resolve
    };
    paintLightCastBanner();
    applyCursor();
    draw();
  });
}
function cancelLightCast() {
  const cast = state.lightCast;
  if (!cast) return;
  const resolve = cast.resolve;
  state.lightCast = null;
  paintLightCastBanner();
  applyCursor();
  draw();
  if (resolve) resolve(null);
}
function paintLightCastBanner() {
  let bar = el.querySelector(".ssm-lightcast");
  if (!state.lightCast) {
    if (bar) bar.hidden = true;
    return;
  }
  if (!bar) {
    bar = document.createElement("div");
    bar.className = "ssm-blast-map ssm-lightcast";
    bar.setAttribute("role", "status");
    bar.innerHTML = '<span class="ssm-pending-text"></span><button type="button" data-act="lightPlace">Place</button><button type="button" data-act="lightCancel">Cancel</button>';
    bar.addEventListener("pointerdown", ev => ev.stopPropagation());
    bar.querySelector("[data-act=lightPlace]").addEventListener("click", ev => { ev.preventDefault(); ev.stopPropagation(); finishLightCast(); });
    bar.querySelector("[data-act=lightCancel]").addEventListener("click", ev => { ev.preventDefault(); ev.stopPropagation(); cancelLightCast(); });
    el.appendChild(bar);
  }
  const cast = state.lightCast;
  const name = (cast.spec && cast.spec.name) || "Light";
  let txt = "Click a square or a token for " + name;
  if (cast.spec && cast.spec.place === "orbs") txt = name + ": " + (cast.points.length) + " of " + (cast.spec.max || 4) + " within 120 ft, each within 20 ft of another";
  else if (cast.spec && cast.spec.range) txt += " (within " + cast.spec.range + " ft)";
  txt += ". Esc cancels.";
  const span = bar.querySelector(".ssm-pending-text");
  if (span && span.textContent !== txt) span.textContent = txt;
  bar.hidden = false;
}
function refuseUnwilling(spec, anchor, cast) {
  const L = window.SSDNSLighting;
  if (!anchor || !spec || !L || !L.needsUnwillingSave || !L.needsUnwillingSave(spec, anchor, cast.caster)) return false;
  const dc = Number(cast.dc) || 0;
  const mod = Number(anchor.dexMod || anchor.dex || 0) || 0;
  if (!(dc > 0)) { toast("Unwilling target. No spell DC, so the light does not catch."); return true; }
  const roll = 1 + Math.floor(Math.random() * 20);
  const save = L.dexSave(roll, mod, dc);
  toast("DEX " + roll + (mod ? (mod > 0 ? "+" + mod : mod) : "") + " = " + save.total + " vs DC " + dc + (save.passed ? ". The light doesn't catch." : ". The light takes hold."));
  return !!save.passed;
}
function finishLightCast() {
  const cast = state.lightCast;
  if (!cast || !cast.spec) return;
  const L = window.SSDNSLighting;
  const spec = cast.spec;
  let points = (cast.points || []).slice();
  if (spec.place !== "orbs") {
    if (!cast.hover && !points.length) { toast("Pick a square"); return; }
    points = points.length ? points : [cast.hover];
  }
  if (!points.length) { toast("Place at least one light"); return; }
  if (spec.place === "orbs" && L && L.clusterOk && !L.clusterOk(points, spec.cluster || 20)) {
    toast("Each light must be within 20 ft of another.");
    return;
  }
  const anchor = tokenAtOrigin(points[0]);
  if (refuseUnwilling(spec, anchor, cast)) { cancelLightCast(); return; }
  const meta = { casterId: cast.casterId || "", casterUid: cast.casterUid || "", casterName: cast.casterName || "" };
  let groupId = "";
  const storeHere = !lightIsZone(spec.name);
  if (storeHere && spec.place === "orbs") groupId = storeOrbLights(spec, points, meta);
  else if (storeHere) storePointLight(spec, points[0], anchor ? anchor.id : "", meta);
  const payload = {
    origin: points[0], points: points, anchorToken: anchorPayload(anchor),
    groupId: groupId, stored: storeHere, spec: spec,
    undo: groupId ? { groupId: groupId } : null
  };
  const resolve = cast.resolve;
  state.lightCast = null;
  paintLightCastBanner();
  applyCursor();
  draw();
  if (resolve) resolve(payload);
}
function lightCastPointer(e) {
  const cast = state.lightCast;
  if (!cast || !state.scene) return;
  const w = pointerWorld(e);
  const px = state.scene.grid.px || 70;
  const cell = { x: Math.floor(w.x / px) + 0.5, y: Math.floor(w.y / px) + 0.5 };
  const L = window.SSDNSLighting;
  if (cast.spec && cast.spec.place === "orbs") {
    const verdict = L && L.canAddOrb ? L.canAddOrb(cast.points, cell, cast.caster, cast.spec) : { ok: false, reason: "Can't place that." };
    if (!verdict.ok) { toast(verdict.reason); return; }
    cast.points = verdict.orbs;
    cast.hover = cell;
    if (cast.points.length >= (cast.spec.max || 4)) { finishLightCast(); return; }
    paintLightCastBanner();
    draw();
    return;
  }
  if (L && L.inRangeOf && !L.inRangeOf(cast.caster, cell, cast.spec.range || 0)) { toast("Out of range"); return; }
  cast.hover = cell;
  cast.points = [cell];
  finishLightCast();
}
function undoSpellLight(undo) {
  if (!undo) return;
  const list = spellEmitterList().filter(em => {
    if (!em) return false;
    if (undo.groupId && em.groupId === undo.groupId) return false;
    if (undo.ids && undo.ids.indexOf(em.id) >= 0) return false;
    return true;
  });
  commitEmitters(list);
}
function spellOrbAt(wx, wy) {
  const px = (state.scene && state.scene.grid && state.scene.grid.px) || 70;
  const gx = wx / px, gy = wy / px;
  let best = null, bestD = 0.45;
  spellEmitterList().forEach(em => {
    if (!em || em.doused || em.followId) return;
    const d = Math.hypot(gx - ((Number(em.x) || 0) + 0.5), gy - ((Number(em.y) || 0) + 0.5));
    if (d < bestD) { bestD = d; best = em; }
  });
  return best;
}
function canMoveOrb(em) {
  if (!em) return false;
  if (role === "dm") return true;
  const caster = tokenByRef(em.casterId);
  if (caster && canControl(caster)) return true;
  if (em.casterId && (em.casterId === uid)) return true;
  return false;
}
function moveSpellOrb(id, toCell, previewOnly) {
  const L = window.SSDNSLighting;
  const list = spellEmitterList().map(cloneEmitter);
  const em = list.find(e => e && e.id === id);
  if (!em || em.key !== "dancing-lights") return false;
  const from = { x: (Number(em.x) || 0) + 0.5, y: (Number(em.y) || 0) + 0.5 };
  const to = { x: Math.floor(Number(toCell.x)) + 0.5, y: Math.floor(Number(toCell.y)) + 0.5 };
  if (Math.hypot(to.x - from.x, to.y - from.y) < 0.2) {
    if (!previewOnly && role === "dm") {
      state.selectedLight = id;
      toast("Light selected. Douse puts it out.");
      draw();
    }
    return false;
  }
  const group = list.filter(e => e && e.groupId && e.groupId === em.groupId && !e.doused);
  const orbs = group.map(e => ({ x: (Number(e.x) || 0) + 0.5, y: (Number(e.y) || 0) + 0.5, id: e.id }));
  const idx = orbs.findIndex(o => o.id === id);
  const caster = casterCenterOf(tokenByRef(em.casterId));
  const spec = L && L.emitter ? L.emitter("dancing-lights") : null;
  const round = (state.initiative && state.initiative.started && state.initiative.round) || 0;
  if (round && em.movedRound === round) { if (!previewOnly) toast("Dancing Lights already moved this round."); return false; }
  const verdict = L && L.canDragOrb ? L.canDragOrb(orbs, idx, to, caster, spec, from) : { ok: false, reason: "That light can't move." };
  if (!verdict.ok) { if (!previewOnly) toast(verdict.reason); return false; }
  if (previewOnly) return true;
  em.x = Math.floor(to.x);
  em.y = Math.floor(to.y);
  group.forEach(e => { e.movedRound = round || e.movedRound; });
  commitEmitters(list);
  toast("Bonus action: Dancing Lights moved.");
  return true;
}
function paintSpellLightMarks(px, sight) {
  const list = spellEmitterList();
  list.forEach(em => {
    if (!em) return;
    const at = emitterCenter(em);
    if (!at) return;
    const preview = state.drag && state.drag.spellOrb && state.drag.spellOrb.id === em.id ? state.drag.spellOrb : null;
    const gx = preview ? preview.x : at.x;
    const gy = preview ? preview.y : at.y;
    if (role !== "dm" && sight && !pointInSight(gx, gy, sight)) return;
    const c = worldToScreen(gx * px, gy * px);
    ctx.save();
    ctx.beginPath();
    ctx.arc(c.x, c.y, Math.max(3, (em.bright > 0 ? 5 : 4) * (state.view.zoom || 1)), 0, Math.PI * 2);
    ctx.fillStyle = em.doused ? "rgba(90, 86, 80, 0.85)" : (em.bright > 0 ? "rgba(255, 214, 120, 0.95)" : "rgba(186, 176, 255, 0.95)");
    if (state.selectedLight && state.selectedLight === em.id) ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.fill();
    if (state.selectedLight && state.selectedLight === em.id) { ctx.lineWidth = 2; ctx.stroke(); }
    ctx.restore();
  });
  const cast = state.lightCast;
  if (cast && cast.points) {
    cast.points.forEach(p => {
      const c = worldToScreen(p.x * px, p.y * px);
      ctx.save();
      ctx.beginPath();
      ctx.arc(c.x, c.y, Math.max(3, 4 * (state.view.zoom || 1)), 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255, 230, 160, 0.85)";
      ctx.fill();
      ctx.restore();
    });
  }
}
function tickSpellEmitters(steps) {
  const L = window.SSDNSLighting;
  if (!L || !L.tickEmitters) return;
  const before = spellEmitterList();
  const ticked = L.tickEmitters(before, steps);
  if (!ticked.removed.length && ticked.emitters.length === before.length) {
    const changed = ticked.emitters.some(em => {
      const prev = before.find(b => b && em && b.id === em.id);
      return prev && Number(prev.roundsLeft) !== Number(em.roundsLeft);
    });
    if (!changed) return;
  }
  ticked.removed.forEach(em => toast((em.name || "Light") + " ends."));
  commitEmitters(ticked.emitters);
}
function noteLightRound(init) {
  if (!init) return;
  const round = Number(init.round) || 0;
  if (!init.started || !(round > 0)) { state.lightRound = round; return; }
  const prev = state.lightRound;
  state.lightRound = round;
  if (prev == null || !(prev > 0) || round <= prev) return;
  const steps = round - prev;
  if (role === "dm") tickSpellEmitters(steps);
  try { window.dispatchEvent(new CustomEvent("ssdns-light-round", { detail: { steps: steps } })); } catch (e) {}
}
function dropEmittersWhere(pred) {
  const before = spellEmitterList();
  const next = before.filter(em => em && !pred(em));
  if (next.length === before.length) return;
  commitEmitters(next);
}
let darkStampLock = false;
function gatherDarkLights() {
  const lights = [];
  (state.tokens || []).forEach(t => { tokenLightList(t).forEach(ls => lights.push(ls)); });
  try { spellEmitterRows().forEach(ls => lights.push(ls)); } catch (e) {}
  try { zoneLightRows().forEach(ls => lights.push(ls)); } catch (e2) {}
  return lights;
}
function stampDispelledDarkness() {
  if (darkStampLock) return;
  const L = window.SSDNSLighting;
  if (!L || !L.lightsDispelDark) return;
  const lights = gatherDarkLights();
  let scene = null;
  try { scene = sceneData(); } catch (e) { scene = null; }
  if (scene && Array.isArray(scene.magicalDark)) {
    const before = scene.magicalDark.length;
    scene.magicalDark = scene.magicalDark.filter(z => z && !(!z.doused && L.lightsDispelDark(Object.assign({ kind: "box", magicalDark: true, level: z.level != null ? z.level : 2 }, z), lights)));
    if (scene.magicalDark.length !== before) {
      if (role === "dm") { try { saveScene(); } catch (err) {} }
      toast("A light dispels the darkness.");
      requestDraw();
    }
  }
  const zones = spellZoneList();
  const drop = zones.filter(z => z && z.magicalDark && !z.darkOut && !z.doused && L.lightsDispelDark(z, lights));
  if (!drop.length) return;
  const gone = {};
  drop.forEach(z => { if (z.id) gone[String(z.id)] = 1; });
  darkStampLock = true;
  try { setSpellZones(zones.filter(z => !(z && gone[String(z.id)])), {}); }
  finally { darkStampLock = false; }
  toast((drop[0].spell || "A light") + " dispels the darkness.");
}
function darknessAt(gx, gy) {
  const L = window.SSDNSLighting;
  const zones = magicalDarknessZones();
  for (let i = zones.length - 1; i >= 0; i--) {
    const z = zones[i];
    if (L && L.darknessContains && L.darknessContains(z, gx, gy)) return z;
    if (!L && z.kind === "box" && gx >= z.x && gy >= z.y && gx < z.x + z.w && gy < z.y + z.h) return z;
  }
  return null;
}
function douseDarkZone(id, out) {
  if (!id) return false;
  const scene = sceneData();
  const painted = scene.magicalDark || [];
  const hitPaint = painted.find(z => z && z.id === id);
  if (hitPaint) {
    hitPaint.doused = !!out;
    saveScene();
    toast(out ? "Darkness doused" : "Darkness restored");
    return true;
  }
  const zones = spellZoneList().map(z => Object.assign({}, z));
  const hit = zones.find(z => z && String(z.id) === String(id) && z.magicalDark);
  if (!hit) return false;
  hit.darkOut = !!out;
  setSpellZones(zones, {});
  toast(out ? "Darkness doused" : "Darkness restored");
  return true;
}
function douseEmitterId(id, out) {
  if (!id) return false;
  if (String(id).indexOf("zone:") === 0) {
    const zid = String(id).slice(5);
    const zones = spellZoneList().map(z => Object.assign({}, z));
    const hit = zones.find(z => z && String(z.id) === zid);
    if (!hit) return false;
    hit.lightOut = !!out;
    if (typeof setSpellZones === "function") setSpellZones(zones, {});
    toast(out ? "Light doused" : "Light relit");
    return true;
  }
  const list = spellEmitterList().map(cloneEmitter);
  const hit = list.find(em => em && em.id === id);
  if (!hit) return false;
  hit.doused = !!out;
  commitEmitters(list);
  toast(out ? "Light doused" : "Light relit");
  return true;
}
function paintLightLegend(ambient) {
  const amb = ambient === 'bright' || ambient === 'dim' ? ambient : 'dark';
  el.querySelectorAll('[data-act="lightLegend"]').forEach(node => node.setAttribute('data-ambient', amb));
}
/* Once, when the scene is Dark and no party token is carrying a light. */
function notePartyDark(sight) {
  if (!sight || sight.ambient !== 'dark') { state._partyDarkSig = ''; return; }
  const party = state.tokens.filter(t => t && t.pos && !t.hidden && (t.ownerUid || t.kind === 'player') && (t.sceneId || 'scn_dustyspur01') === sight.sceneId);
  if (!party.length) { state._partyDarkSig = ''; return; }
  const lit = party.some(t => tokenLightList(t).length > 0);
  const sig = sight.sceneId + (lit ? ':lit' : ':dark');
  if (state._partyDarkSig === sig) return;
  state._partyDarkSig = sig;
  if (!lit) toast('No one in the party is carrying a light.');
}
function clipLightDisc(ls, radiusPx, g) {
  /* Caller passes pixel coordinates (draw() already scaled grid squares). */
  const pen = g || ctx;
  const ox = Number(ls.x);
  const oy = Number(ls.y);
  const pts = raycastVisible(ox, oy, radiusPx);
  if (!pts.length) return false;
  pen.beginPath();
  pen.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) pen.lineTo(pts[i].x, pts[i].y);
  pen.closePath();
  pen.clip();
  if (ls && ls.cone) {
    const c = worldToScreen(ox, oy);
    const z = state.view.zoom || 1;
    const spread = Math.atan(0.5);
    const face = Number(ls.facing) || 0;
    pen.beginPath();
    pen.moveTo(c.x, c.y);
    pen.arc(c.x, c.y, Math.max(1, radiusPx * z), face - spread, face + spread);
    pen.closePath();
    pen.clip();
  }
  return true;
}
function paintGlowDisc(ls, radiusPx, paint) {
  ctx.save();
  if (!clipLightDisc(ls, radiusPx)) { ctx.restore(); return; }
  const c = worldToScreen(ls.x, ls.y);
  const z = state.view.zoom || 1;
  const oR = Math.max(2, radiusPx * z);
  paint(c, oR, z);
  ctx.restore();
}
/* One dim veil. Overlapping sources (Wall of Fire's row, Fire Shield plus Sunbeam)
   used to stack this black wash until the map went dark. */
function paintOneVeil(pen, ls, px) {
  if (!pen || !ls || !(ls.radius > 0)) return;
  const outer = ls.radius * px;
  pen.save();
  if (!clipLightDisc(ls, outer, pen)) { pen.restore(); return; }
  const c = worldToScreen(ls.x, ls.y);
  const z = state.view.zoom || 1;
  const oR = Math.max(2, outer * z);
  const brightPx = Math.max(0, (Number(ls.bright) || 0) * px);
  const bR = Math.min(oR - 0.5, Math.max(0, brightPx * z));
  const g = pen.createRadialGradient(c.x, c.y, (ls.bright > 0 && bR + 1 < oR) ? bR : 0, c.x, c.y, oR);
  if (ls.bright > 0 && bR + 1 < oR) {
    g.addColorStop(0, 'rgba(7, 7, 10, 0)');
    g.addColorStop(0.16, 'rgba(8, 8, 12, 0.62)');
    g.addColorStop(1, 'rgba(5, 5, 8, 0.8)');
  } else {
    g.addColorStop(0, 'rgba(8, 8, 12, 0.38)');
    g.addColorStop(1, 'rgba(5, 5, 8, 0.7)');
  }
  pen.fillStyle = g;
  pen.fillRect(c.x - oR - 2, c.y - oR - 2, oR * 2 + 4, oR * 2 + 4);
  pen.restore();
}
function lightScratch(box) {
  const dpr = Math.min((typeof window !== 'undefined' && window.devicePixelRatio) || 1, 2);
  if (!lightScratch.canvas) lightScratch.canvas = document.createElement('canvas');
  const oc = lightScratch.canvas;
  const w = Math.max(1, Math.ceil(box.w * dpr));
  const h = Math.max(1, Math.ceil(box.h * dpr));
  if (oc.width !== w || oc.height !== h) { oc.width = w; oc.height = h; }
  const pen = oc.getContext('2d');
  pen.setTransform(dpr, 0, 0, dpr, 0, 0);
  pen.clearRect(0, 0, box.w, box.h);
  pen.globalCompositeOperation = 'source-over';
  return { canvas: oc, pen: pen, dpr: dpr };
}
/* After a full reveal, darken the dim ring. A dim-only light stays visible, not a hard hole. */
function paintDarkDimVeil(sources, px) {
  const list = (sources || []).filter(ls => ls && ls.radius > 0);
  if (!list.length) return;
  const box = viewBox();
  const layer = lightScratch(box);
  list.forEach((ls, i) => {
    layer.pen.save();
    layer.pen.globalCompositeOperation = i === 0 ? 'source-over' : 'destination-over';
    paintOneVeil(layer.pen, ls, px);
    layer.pen.restore();
  });
  /* A smaller light's dim ring used to sit in a larger light's bright centre
     (Fire Shield inside Sunbeam, Wall of Fire's row). Punch every bright disc clear. */
  list.forEach(ls => {
    const brightPx = ((Number(ls.bright) || 0) / 5) * px;
    if (!(brightPx > 1)) return;
    layer.pen.save();
    layer.pen.globalCompositeOperation = 'destination-out';
    if (!clipLightDisc(ls, brightPx, layer.pen)) { layer.pen.restore(); return; }
    layer.pen.fillStyle = '#000';
    const c = worldToScreen(ls.x, ls.y);
    const z = state.view.zoom || 1;
    const r = Math.max(2, brightPx * z);
    layer.pen.fillRect(c.x - r - 2, c.y - r - 2, r * 2 + 4, r * 2 + 4);
    layer.pen.restore();
  });
  ctx.save();
  ctx.drawImage(layer.canvas, 0, 0, box.w, box.h);
  ctx.restore();
}
/* In Dim, lift the dim ring and any dim-only source so it reads against the wash. */
function paintDimLift(sources, px) {
  const list = (sources || []).filter(ls => {
    if (!ls || !(ls.radius > 0)) return false;
    const onlyDim = !(ls.bright > 0);
    return onlyDim || ls.radius > ls.bright;
  });
  if (!list.length) return;
  const box = viewBox();
  const layer = lightScratch(box);
  list.forEach((ls, i) => {
    const onlyDim = !(ls.bright > 0);
    layer.pen.save();
    layer.pen.globalCompositeOperation = i === 0 ? 'source-over' : 'destination-over';
    const outer = ls.radius * px;
    if (!clipLightDisc(ls, outer, layer.pen)) { layer.pen.restore(); return; }
    const c = worldToScreen(ls.x, ls.y);
    const z = state.view.zoom || 1;
    const oR = Math.max(2, outer * z);
    const bR = Math.max(0, (Number(ls.bright) || 0) * px * z);
    const g = layer.pen.createRadialGradient(c.x, c.y, 0, c.x, c.y, oR);
    if (onlyDim) {
      g.addColorStop(0, 'rgba(0,0,0,0.7)');
      g.addColorStop(0.72, 'rgba(0,0,0,0.28)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
    } else {
      const edge = Math.max(0.02, Math.min(0.9, bR / oR));
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(edge, 'rgba(0,0,0,0)');
      g.addColorStop(Math.min(0.98, edge + 0.06), 'rgba(0,0,0,0.4)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
    }
    layer.pen.fillStyle = g;
    layer.pen.fillRect(c.x - oR - 2, c.y - oR - 2, oR * 2 + 4, oR * 2 + 4);
    layer.pen.restore();
  });
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.drawImage(layer.canvas, 0, 0, box.w, box.h);
  ctx.restore();
}
/* Dim and dark keep these stops. Bright ground is near-zero; the same
   dim/dark stops are redrawn only where the light cuts dim, dark, or fog. */
function haloTint(amb) {
  if (amb === 'dim') return { hot: 0.5, dimA: 0.34 };
  if (amb === 'bright') return { hot: 0.02, dimA: 0.02 };
  return { hot: 0.5, dimA: 0.42 };
}
function paintOneHalo(pen, ls, px, hot, dimA) {
  if (!pen || !ls || !(ls.radius > 0)) return;
  const outer = ls.radius * px;
  pen.save();
  if (!clipLightDisc(ls, outer, pen)) { pen.restore(); return; }
  const c = worldToScreen(ls.x, ls.y);
  const z = state.view.zoom || 1;
  const oR = Math.max(2, outer * z);
  const bR = Math.max(0, (Number(ls.bright) || 0) * px * z);
  const g = pen.createRadialGradient(c.x, c.y, 0, c.x, c.y, oR);
  if (ls.bright > 0 && bR + 1 < oR) {
    g.addColorStop(0, 'rgba(255, 214, 120, ' + hot + ')');
    g.addColorStop(Math.max(0.02, Math.min(0.92, bR / oR)), 'rgba(255, 170, 60, ' + (hot * 0.65) + ')');
    g.addColorStop(1, 'rgba(140, 150, 190, 0)');
  } else {
    g.addColorStop(0, 'rgba(255, 206, 130, ' + dimA + ')');
    g.addColorStop(0.55, 'rgba(180, 170, 140, ' + (dimA * 0.45) + ')');
    g.addColorStop(1, 'rgba(120, 120, 140, 0)');
  }
  pen.fillStyle = g;
  pen.fillRect(c.x - oR - 2, c.y - oR - 2, oR * 2 + 4, oR * 2 + 4);
  pen.restore();
}
function punchBrightFromHalo(pen, self, sources, px, sight) {
  const box = viewBox();
  ((sight && sight.regions) || []).forEach(region => {
    if (!region || region.level !== 'bright') return;
    pen.save();
    pen.globalCompositeOperation = 'destination-out';
    if (!clipLightRegion(region, px, pen)) { pen.restore(); return; }
    pen.clip();
    pen.fillStyle = '#000';
    pen.fillRect(0, 0, box.w, box.h);
    pen.restore();
  });
  (sources || []).forEach(other => {
    if (!other || other === self) return;
    const brightPx = (Number(other.bright) || 0) * px;
    if (!(brightPx > 1)) return;
    pen.save();
    pen.globalCompositeOperation = 'destination-out';
    if (!clipLightDisc(other, brightPx, pen)) { pen.restore(); return; }
    pen.fillStyle = '#000';
    const c = worldToScreen(other.x, other.y);
    const z = state.view.zoom || 1;
    const r = Math.max(2, brightPx * z);
    pen.fillRect(c.x - r - 2, c.y - r - 2, r * 2 + 4, r * 2 + 4);
    pen.restore();
  });
}
function clipFogPocket(zone, px, pen) {
  if (!zone || !zone.origin || !(Number(zone.radius) > 0)) return false;
  const c = worldToScreen(Number(zone.origin.x) * px, Number(zone.origin.y) * px);
  const z = state.view.zoom || 1;
  pen.beginPath();
  pen.arc(c.x, c.y, Math.max(1, (Number(zone.radius) / 5) * px * z), 0, Math.PI * 2);
  return true;
}
/* Bright ground stays clear. Dim, dark, and fog still get the old tint. */
function paintHaloCuts(pen, ls, px, sight) {
  const dark = { hot: 0.5, dimA: 0.42 };
  const dim = { hot: 0.5, dimA: 0.34 };
  const pockets = [];
  ((sight && sight.regions) || []).forEach(region => {
    if (!region) return;
    if (region.level === 'dim') pockets.push({ clip: (p) => clipLightRegion(region, px, p), tint: dim });
    if (region.level === 'dark') pockets.push({ clip: (p) => clipLightRegion(region, px, p), tint: dark });
  });
  ((sight && sight.darkness) || []).forEach(zone => {
    pockets.push({ clip: (p) => clipDarkZone(zone, px, p), tint: dark });
  });
  try {
    (liveSpellZones() || []).forEach(zone => {
      if (!zone || zone.magicalDark || !zone.heavilyObscured) return;
      pockets.push({ clip: (p) => clipFogPocket(zone, px, p), tint: dark });
    });
  } catch (e) {}
  pockets.forEach(pocket => {
    pen.save();
    if (!pocket.clip(pen)) { pen.restore(); return; }
    pen.clip();
    paintOneHalo(pen, ls, px, pocket.tint.hot, pocket.tint.dimA);
    pen.restore();
  });
}
function paintTorchHalo(sources, px, amb, sight) {
  const tint = haloTint(amb);
  const box = viewBox();
  const list = sources || [];
  list.forEach(ls => {
    if (!ls || !(ls.radius > 0)) return;
    const layer = lightScratch(box);
    paintOneHalo(layer.pen, ls, px, tint.hot, tint.dimA);
    punchBrightFromHalo(layer.pen, ls, list, px, sight);
    if (amb === 'bright') paintHaloCuts(layer.pen, ls, px, sight);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(layer.canvas, 0, 0, box.w, box.h);
    ctx.restore();
  });
}
function normalizeLightRegions(list) {
  const out = [];
  (Array.isArray(list) ? list : []).forEach(r => {
    if (!r) return;
    const level = r.level === 'bright' || r.level === 'dim' || r.level === 'dark' ? r.level : '';
    const w = Number(r.w) || 0, h = Number(r.h) || 0;
    if (!level || !(w > 0) || !(h > 0)) return;
    out.push({ id: r.id || ('lr_' + out.length), level: level, kind: 'box', x: Number(r.x) || 0, y: Number(r.y) || 0, w: w, h: h });
  });
  return out;
}
/* L0230. Deep violet / ink purple. One wash for players and the DM, including Show Player FOV.
   Plain Dark stays the black / near-black fog. */
const MAGICAL_DARK_WASH = "rgba(46, 12, 84, 0.94)";
function magicalDarkRow(z, source) {
  if (!z) return null;
  return {
    id: z.id || "",
    magicalDark: true,
    source: source,
    kind: z.kind === "box" || (!z.origin && (Number(z.w) || 0) > 0) ? "box" : "sphere",
    x: Number(z.x) || 0,
    y: Number(z.y) || 0,
    w: Number(z.w) || 0,
    h: Number(z.h) || 0,
    origin: z.origin && z.origin.x != null ? { x: Number(z.origin.x), y: Number(z.origin.y) } : null,
    radius: Number(z.radius) || 0,
    level: z.level != null ? Number(z.level) : 2,
    blocksDarkvision: z.blocksDarkvision !== false,
    blocksNonmagical: z.blocksNonmagical !== false,
    devilsSightSees: z.devilsSightSees !== false,
    blindedInside: !!z.blindedInside,
    noLight: !!z.noLight,
    dispelsLightAtOrBelow: z.dispelsLightAtOrBelow != null ? Number(z.dispelsLightAtOrBelow) : 2,
    dispelledByLightAtOrAbove: z.dispelledByLightAtOrAbove != null ? Number(z.dispelledByLightAtOrAbove) : 3,
    conc: !!z.conc,
    casterId: z.casterId || "",
    casterUid: z.casterUid || "",
    spell: z.spell || z.name || "",
    key: z.key || ""
  };
}
/* DM-painted boxes plus spell concentration zones (Darkness, Hunger of Hadar). */
function magicalDarknessZones(sceneId) {
  const out = [];
  let painted = [];
  try { painted = sceneData(sceneId).magicalDark || []; } catch (e) { painted = []; }
  painted.forEach(z => {
    if (!z || z.doused) return;
    const row = magicalDarkRow(Object.assign({ kind: "box", magicalDark: true, level: z.level != null ? z.level : 2 }, z), "dm");
    if (row && row.w > 0 && row.h > 0) out.push(row);
  });
  let spells = [];
  try {
    if (!sceneId || sceneId === activeSceneId()) spells = liveSpellZones();
  } catch (e2) { spells = []; }
  spells.forEach(z => {
    if (!z || !z.magicalDark || z.darkOut || z.doused) return;
    const row = magicalDarkRow(z, "spell");
    if (row && (row.origin || (row.w > 0 && row.h > 0))) out.push(row);
  });
  return out;
}
function clipDarkZone(zone, px, g) {
  if (!zone) return false;
  const pen = g || ctx;
  if (zone.kind === "box" || (!zone.origin && zone.w > 0 && zone.h > 0)) return clipLightRegion(zone, px, pen);
  const origin = zone.origin;
  if (!origin || !(Number(zone.radius) > 0)) return false;
  const c = worldToScreen(origin.x * px, origin.y * px);
  const z = state.view.zoom || 1;
  pen.beginPath();
  pen.arc(c.x, c.y, Math.max(1, (zone.radius / 5) * px * z), 0, Math.PI * 2);
  return true;
}
function punchDevilsSight(sight, px, zones) {
  if (!state.scene || !state.scene._img) return;
  const L = window.SSDNSLighting;
  const box = viewBox();
  /* Own Devil's Sight opens the ink. An ally's live square opens it too, then dims, and does not become this viewer's target. */
  const groups = [
    { list: darknessViewers(sight), dim: false },
    { list: (sight && sight.liveParty) || [], dim: true }
  ];
  groups.forEach(group => {
    group.list.forEach(b => {
      if (!b || !b.devilsSight) return;
      zones.forEach(zone => {
        if (zone.blindedInside && L && L.darknessContains && L.darknessContains(zone, b.x, b.y)) return;
        ctx.save();
        if (!clipDarkZone(zone, px)) { ctx.restore(); return; }
        ctx.clip();
        drawVisible(b.x * px, b.y * px, 24 * px);
        if (group.dim) {
          ctx.fillStyle = "rgba(16, 16, 20, 0.62)";
          ctx.fillRect(0, 0, box.w, box.h);
        }
        ctx.restore();
      });
    });
  });
}
/* L0229–L0230. The fill is MAGICAL_DARK_WASH for every viewer. Show Player FOV calls this too. */
function paintMagicalDarknessLayer(sight, px) {
  const zones = (sight && sight.darkness) || [];
  if (!zones.length || !px) return;
  const box = viewBox();
  zones.forEach(zone => {
    ctx.save();
    if (!clipDarkZone(zone, px)) { ctx.restore(); return; }
    ctx.clip();
    ctx.fillStyle = MAGICAL_DARK_WASH;
    ctx.fillRect(0, 0, box.w, box.h);
    ctx.restore();
  });
  punchDevilsSight(sight, px, zones);
}
function clipLightRegion(region, px, g) {
  if (!region) return false;
  const pen = g || ctx;
  const x = Number(region.x) || 0, y = Number(region.y) || 0;
  const w = Number(region.w) || 0, h = Number(region.h) || 0;
  if (!(w > 0) || !(h > 0)) return false;
  const a = worldToScreen(x * px, y * px);
  const b = worldToScreen((x + w) * px, (y + h) * px);
  pen.beginPath();
  pen.rect(a.x, a.y, Math.max(1, b.x - a.x), Math.max(1, b.y - a.y));
  return true;
}
function paintOneRegion(region, px, box, hard) {
  if (!clipLightRegion(region, px)) return;
  ctx.clip();
  if (!hard) {
    if (region.level === 'bright') return;
    ctx.fillStyle = region.level === 'dim' ? 'rgba(16, 16, 20, 0.28)' : 'rgba(0, 0, 0, 0.35)';
    ctx.fillRect(0, 0, box.w, box.h);
    return;
  }
  if (region.level === 'dark') {
    ctx.fillStyle = role === 'dm' && state.showPlayerFov ? 'rgba(0, 0, 0, 0.55)' : '#0a0806';
    ctx.fillRect(0, 0, box.w, box.h);
    return;
  }
  if (!state.scene || !state.scene._img) return;
  const topLeft = worldToScreen(0, 0);
  const grid = state.scene.grid;
  ctx.drawImage(state.scene._img, topLeft.x, topLeft.y, grid.cols * px * state.view.zoom, grid.rows * px * state.view.zoom);
  if (region.level === 'dim') {
    ctx.fillStyle = 'rgba(16, 16, 20, 0.72)';
    ctx.fillRect(0, 0, box.w, box.h);
  }
}
/* Layer 2. hard=true replaces the base. hard=false is the DM see-all tint, which does not hide the map. */
function paintRegionLayer(sight, px, box, hard) {
  ((sight && sight.regions) || []).forEach(region => {
    ctx.save();
    paintOneRegion(region, px, box, hard);
    ctx.restore();
  });
}
function paintRegionFrames(px) {
  if (role !== 'dm') return;
  let list = [];
  try { list = sceneData().lightRegions || []; } catch (e) { list = []; }
  list.forEach(r => {
    if (!r || !(r.w > 0) || !(r.h > 0)) return;
    const a = worldToScreen(r.x * px, r.y * px);
    const b = worldToScreen((r.x + r.w) * px, (r.y + r.h) * px);
    ctx.save();
    ctx.setLineDash([5, 4]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = r.level === 'bright' ? 'rgba(243, 226, 176, 0.95)' : (r.level === 'dark' ? 'rgba(120, 140, 220, 0.9)' : 'rgba(160, 170, 190, 0.95)');
    ctx.strokeRect(a.x, a.y, Math.max(1, b.x - a.x), Math.max(1, b.y - a.y));
    ctx.restore();
  });
  let darks = [];
  try { darks = sceneData().magicalDark || []; } catch (e2) { darks = []; }
  darks.forEach(r => {
    if (!r || !(r.w > 0) || !(r.h > 0)) return;
    const a = worldToScreen(r.x * px, r.y * px);
    const b = worldToScreen((r.x + r.w) * px, (r.y + r.h) * px);
    ctx.save();
    ctx.setLineDash([5, 4]);
    ctx.lineWidth = state.selectedDark && state.selectedDark === r.id ? 3 : 2;
    ctx.strokeStyle = r.doused ? 'rgba(120, 110, 130, 0.75)' : 'rgba(170, 120, 230, 0.95)';
    ctx.strokeRect(a.x, a.y, Math.max(1, b.x - a.x), Math.max(1, b.y - a.y));
    ctx.restore();
  });
}
/* Own-token default: show squares an ally currently sees, dimmed, and do not keep them. */
function paintOwnLiveSquares(sight, px, box, lightSources) {
  if (role !== 'player' || !sight || sight.mode !== 'own' || sight.fogRevealed) return;
  if (sight.ambient === 'bright' || sight.ambient === 'dim') return;
  const extra = sight.liveParty || [];
  if (!extra.length) return;
  extra.forEach(b => drawVisible(b.x * px, b.y * px, b.radius * px));
  extra.forEach(b => {
    const pts = raycastVisible(b.x * px, b.y * px, b.radius * px);
    if (!pts.length) return;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    ctx.clip();
    ctx.fillStyle = 'rgba(16, 16, 20, 0.62)';
    ctx.fillRect(0, 0, box.w, box.h);
    ctx.restore();
  });
  (sight.regions || []).forEach(region => {
    if (!region || region.level === 'dark') return;
    ctx.save();
    paintOneRegion(region, px, box, true);
    ctx.restore();
  });
  (lightSources || []).forEach(ls => {
    if (!(ls.radius > 0)) return;
    drawVisible(ls.x, ls.y, (ls.bright > 0 ? ls.bright : ls.radius) * px, ls);
  });
  (sight.bubbles || []).forEach(b => drawVisible(b.x * px, b.y * px, b.radius * px));
}
function repunchBrightAndDarkvision(sources, sight, px) {
  (sources || []).forEach(ls => {
    if (ls && ls.bright > 0) drawVisible(ls.x, ls.y, ls.bright * px, ls);
  });
  ((sight && sight.bubbles) || []).forEach(b => {
    if (b && b.darkvision) drawVisible(b.x * px, b.y * px, b.radius * px);
  });
}
/* Dim veil only inside Dark regions, so a bright outdoors stays bright. */
function paintVeilInDarkRegions(sources, px, regions) {
  (regions || []).forEach(region => {
    if (!region || region.level !== 'dark') return;
    ctx.save();
    if (!clipLightRegion(region, px)) { ctx.restore(); return; }
    ctx.clip();
    paintDarkDimVeil(sources, px);
    ctx.restore();
  });
}
/* Soft glow: bright core, dim ring. Dim-only lights (Dancing Lights) still show in Dim and Dark. */
function paintLightGlow(sources, px, sight) {
  const amb = sight && sight.ambient || 'dark';
  const regions = (sight && sight.regions) || [];
  const darkRoom = regions.some(r => r && r.level === 'dark');
  const box = viewBox();
  const washed = amb !== 'bright' && !(role === 'dm' && !state.showPlayerFov);
  if (!washed && amb === 'bright' && !darkRoom) {
    paintTorchHalo(sources, px, amb, sight);
    paintMagicalDarknessLayer(sight, px);
    return;
  }
  if (washed && amb === 'dark') paintDarkDimVeil(sources, px);
  if (washed && amb === 'dim' && !darkRoom) paintDimLift(sources, px);
  if (regions.length && (washed || darkRoom)) {
    paintRegionLayer({ regions: regions.filter(r => r && r.level !== 'dark') }, px, box, true);
    repunchBrightAndDarkvision(sources, sight, px);
    if (darkRoom && amb !== 'dark') paintVeilInDarkRegions(sources, px, regions);
    repunchBrightAndDarkvision(sources, sight, px);
  }
  paintTorchHalo(sources, px, amb, sight);
  /* After the glow, so Light, Gas Lamp, and torches do not punch a hole in the ink. */
  paintMagicalDarknessLayer(sight, px);
}
function paintTestLightMarks(px, sight) {
  let list = [];
  try { list = (sceneData().testLights || []).slice(); } catch (e) { list = []; }
  list.forEach(l => {
    if (!l) return;
    const gx = (Number(l.x) || 0) + 0.5;
    const gy = (Number(l.y) || 0) + 0.5;
    if (role !== 'dm' && !pointInSight(gx, gy, sight)) return;
    const c = worldToScreen(gx * px, gy * px);
    ctx.save();
    ctx.beginPath();
    ctx.arc(c.x, c.y, Math.max(3, 5 * (state.view.zoom || 1)), 0, Math.PI * 2);
    ctx.fillStyle = l.out ? 'rgba(90, 86, 80, 0.85)' : 'rgba(255, 168, 48, 0.95)';
    ctx.fill();
    ctx.restore();
  });
  paintSpellLightMarks(px, sight);
}
function paintLightRings(sight, px) {
  const readout = q('playerLights');
  if (readout && role === 'player') {
    const mine = state.tokens.find(t => t && t.ownerUid === uid);
    const rows = mine ? tokenLightList(mine) : [];
    const dv = mine && Number(mine.darkvision) || 0;
    readout.textContent = (rows.length ? rows.map(l => (l.name || 'Light') + ' ' + (l.bright || 0) + '/' + (l.dim || 0)).join(' · ') : 'No light in hand') + (dv ? ' · darkvision ' + dv + ' ft' : '');
    paintPlayerSpellLights();
  }
  paintLightMeasure(sight, px);
}
function playerCharacter() {
  try {
    const doc = window.SSDNSApp && window.SSDNSApp.doc && window.SSDNSApp.doc();
    return doc && doc.character;
  } catch (e) { return null; }
}
function paintPlayerSpellLights() {
  const box = q('playerSpellLights');
  if (!box || role !== 'player') return;
  const L = window.SSDNSLighting;
  const c = playerCharacter();
  const rows = L && L.drawerSpellRows && c ? L.drawerSpellRows(c).slice() : [];
  const known = {};
  rows.forEach(r => { if (r && r.key) known[r.key] = 1; });
  const mine = state.tokens.find(t => t && t.ownerUid === uid);
  const stuckName = {
    "produce flame": "spell:produce-flame",
    "flame blade": "spell:flame-blade",
    "fire shield": "spell:fire-shield",
    "sunbeam": "spell:sunbeam",
    "light": "spell:light",
    "dancing lights": "spell:dancing-lights",
    "daylight": "spell:daylight"
  };
  (mine && mine.lights || []).forEach(l => {
    if (!l || l.out) return;
    const key = stuckName[String(l.name || "").toLowerCase()];
    if (!key || known[key]) return;
    known[key] = 1;
    rows.push({ key: key, name: l.name, bright: Number(l.bright) || 0, dim: Number(l.dim) || 0, off: false, stuck: true });
  });
  if (!rows.length) { box.innerHTML = ''; return; }
  box.innerHTML = rows.map(row => {
    const on = !row.off;
    return '<button type="button" class="ssm-light-toggle' + (on ? ' on' : '') + '" data-act="spellLight" data-light-key="' + esc(row.key) + '" aria-pressed="' + (on ? 'true' : 'false') + '">' +
      esc(row.name) + ' ' + (row.bright || 0) + '/' + (row.dim || 0) + (on ? ' · on' : ' · off') + '</button>';
  }).join('');
}
function togglePlayerSpellLight(key) {
  const L = window.SSDNSLighting;
  const c = playerCharacter();
  if (!L || !L.setSpellGlow || !c || !key) return;
  const id = String(key).indexOf('spell:') === 0 ? String(key) : ('spell:' + key);
  const bare = id.replace(/^spell:/, '');
  const row = (L.drawerSpellRows(c) || []).find(r => r && r.key === id);
  const wantOut = row ? !row.off : true;
  if (row) {
    if (window.SSDNSApp && window.SSDNSApp.applyPatch) {
      window.SSDNSApp.applyPatch(d => { if (d && d.character) L.setSpellGlow(d.character, id, wantOut); });
    } else L.setSpellGlow(c, id, wantOut);
  }
  const mine = uid;
  spellEmitterList().forEach(em => {
    if (!em) return;
    const emKey = String(em.key || '').replace(/^spell:/, '');
    if (emKey !== bare) return;
    const owner = em.casterUid || em.casterId || '';
    if (owner && owner !== mine && !(tokenByRef(em.casterId) && tokenByRef(em.casterId).ownerUid === mine)) return;
    douseEmitterId(em.id, wantOut);
  });
  if (wantOut) {
    try {
      window.dispatchEvent(new CustomEvent('ssdns-light-dismiss', { detail: { key: bare, casterId: mine } }));
    } catch (e) {}
  }
  syncOwnerLights();
  if (L.paintBox) { try { L.paintBox(); } catch (e2) {} }
  paintPlayerSpellLights();
  requestDraw();
}
function paintLightMeasure(sight, px) {
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
    if (!t || !t.pos || skip[t.id] || isPartyToken(t)) return false;
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
  return state.tokens.filter(t => t && t.pos && !skip[t.id] && !isPartyToken(t) && !(role !== 'dm' && t.hidden) && !(window.SSDNSAssetLibrary && window.SSDNSAssetLibrary.gatePassable && window.SSDNSAssetLibrary.gatePassable(t)));
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
/* Remove the map piece and leave the fight row. Disintegrate uses this after the dust crumb.
   silent skips combatant:remove, which would delete the combatant. keepOwner does not dismiss a PC. */
function dropTokenKeepRow(id) {
  if (role !== 'dm' || !id) return false;
  const t = tokenByRef(id) || (state.tokens || []).find(tok => tok && (tok.id === id || tok.combatantId === id || tok.ownerUid === id));
  if (!t) return false;
  removeMapTokens([t.id], { silent: true, keepOwner: true });
  return true;
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
    buryToken(info.id);
    if (info.combatantId) buryToken(info.combatantId);
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
    const t = tokenByRef(id);
    if (!t) return null;
    if (fields.status != null) t.status = fields.status;
    if (fields.hp != null && fields.hp !== "") t.hp = Number(fields.hp);
    if (fields.maxHp != null && fields.maxHp !== "") t.maxHp = Number(fields.maxHp);
    if (fields.name) t.name = fields.name;
    if (fields.label) t.label = String(fields.label).slice(0, 16);
    if (fields.combatantId) t.combatantId = fields.combatantId;
    if (fields.image && !t.image) t.image = fields.image;
    if (Array.isArray(fields.conditions)) {
      const names = [];
      const spells = Object.assign({}, t.conditionSpells || {});
      fields.conditions.forEach(c => {
        if (c && typeof c === "object") {
          const name = String(c.name || c.label || "").trim();
          if (!name) return;
          names.push(name);
          if (c.spell) spells[name.toLowerCase()] = String(c.spell);
        } else {
          const name = String(c || "").trim();
          if (name && name !== "[object Object]") names.push(name);
        }
      });
      t.conditions = names;
      t.conditionSpells = spells;
    }
    const copy = shared.tokens[t.id] || (shared.tokens[t.id] = { id: t.id });
    if (Array.isArray(fields.conditions)) {
      copy.conditions = t.conditions.slice();
      copy.conditionSpells = Object.assign({}, t.conditionSpells || {});
    }
    copy.status = t.status || '';
    if (t.hp != null && t.hp !== "") copy.hp = t.hp;
    if (t.maxHp != null && t.maxHp !== "") copy.maxHp = t.maxHp;
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
  let keepPc = false;
  if (patch.ownerUid) {
    const linkUid = patch.ownerUid;
    const want = playerTokenId(linkUid);
    const linkName = patch.name || ((partyList().find(p => p && (p.uid || p.id) === linkUid) || {}).name) || 'them';
    const others = ownedTokenIds(linkUid, t.id);
    const canonLive = state.tokens.find(tok => tok && tok.id === want && tok.id !== t.id);
    /* An extra piece (Spiritual Weapon, a summon) must not become the PC or delete that token. */
    if (canonLive && t.kind !== "player") {
      keepPc = true;
      t.controlledBy = t.controlledBy || [];
      if (!t.controlledBy.includes(linkUid)) t.controlledBy.push(linkUid);
      if (t.ownerUid === linkUid) t.ownerUid = "";
      const preGrant = shared.tokens[t.id] || (shared.tokens[t.id] = { id: t.id });
      preGrant.controlledBy = t.controlledBy.slice();
      preGrant.ownerUid = t.ownerUid || "";
      saveToken(t.id);
      postGrant(t);
      toast(linkName + " can move this token. Their character token stays.");
    } else {
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
  if (patch.ownerUid != null && !keepPc) t.ownerUid = patch.ownerUid;
  if (patch.combatantId) t.combatantId = patch.combatantId;
  if (patch.sheetId != null) t.sheetId = patch.sheetId;
  if (patch.name) t.name = patch.name;
  if (patch.label) t.label = String(patch.label).slice(0, 16);
  if (patch.color) t.color = patch.color;
  if (patch.image && !t.image) t.image = patch.image;
  if (patch.portrait && !t.image && !patch.image) scheduleDefaultImage(t, patch.portrait);
  if (patch.status != null) t.status = patch.status;
  if (patch.ownerCanMove != null) t.ownerCanMove = patch.ownerCanMove !== false;
  else if (patch.ownerUid && !keepPc) t.ownerCanMove = true;
  const copy = shared.tokens[t.id] || (shared.tokens[t.id] = { id: t.id });
  ['kind', 'ownerUid', 'combatantId', 'sheetId', 'name', 'label', 'color', 'ownerCanMove', 'pos', 'sceneId', 'size', 'hidden', 'locked', 'status', 'image'].forEach(key => {
    if (t[key] !== undefined) copy[key] = t[key];
  });
  if (t.controlledBy) copy.controlledBy = t.controlledBy.slice();
  if (t.conditions) copy.conditions = t.conditions.slice();
  if (t.image) loadTokenImage(t);
  saveToken(t.id);
  draw();
  if (patch.ownerUid && !keepPc) emit('party:sync', { playerId: patch.ownerUid, tokenId: t.id });
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
/* bestiary and asset Place land on the clicked square before any tool sees the click */
on(canvas, 'pointerdown', (e) => {
  if (pointers.size === 0 && beastClick(e)) return;
  if (pointers.size === 0 && assetClick(e)) return;
  onPointerDown(e);
});
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
<b>Assets</b> The library for this room. Add, edit, duplicate, delete, export, and import. The list stays beside the map, so clicking a player or creature still opens their card. Place, then click a square (Esc or right-click cancels). Players within 5 ft can turn an asset on or off, open or close a gate, and light it. Health, traps, range, links, and immunities are saved and marked coming soon.<br>
Wall and Room: drag, release to commit.<br>
Walls: OFF hides the lines so you can see the raw map. Walls still block.<br>
Grant / Revoke: pick a player, then a token. Revoke on their own token locks them out. Grant gives it back.<br>
Reveal clears fog. Hide paints fog back. Each has a Box, Square, Poly, or Brush picker, and the button name is the action. Square: click one grid cell, or drag across cells. Each cell erases on its own. A drag is one history step. Poly: click as many corners as you need, then the first point, double-click, or Enter. Erase deletes one shape. Shift-click selects more, then Delete selection removes them together. Undo and Redo walk the fog history.<br>
Show Player FOV greys the rest and brightens their light. Magical darkness is the same ink purple the player sees.<br>
Set floor, then Show to players, to move someone to another map.` : `<b>Player</b><br>
You move your own token, and any the DM has granted you.<br>
My color changes your ring. Ping uses that color. The button stays lit while the tool is on.<br>
On your turn, click a green square to walk. Dash on the turn strip adds feet.<br>
Fog hides what you cannot see. A torch or your vision opens a circle. Magical darkness is ink purple: darkvision and a torch do not open it. Devil's Sight does. Within 5 ft, click a door you can see: Open, Lockpick, or Peek. Peek leaves it ajar (you can see through; you still can't walk through).`}
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
/* 0.3.198: toolbar rest. Player uses the sheet. DM uses the same party rest as the Fight tab. */
function mapRest(kind) {
  if (role === 'dm') {
    const party = window.SSDNSPartyRest;
    if (typeof party !== 'function') {
      toast('Party rest is not loaded. Use Short rest or Long rest on the Fight tab.');
      return;
    }
    try {
      Promise.resolve(party(kind)).catch(() => toast('Party rest did not send.'));
    } catch (e) {
      toast('Party rest did not send.');
    }
    return;
  }
  const sheet = window.SSDNSSheet;
  if (!sheet || typeof sheet.applyRest !== 'function') {
    toast('Character sheet rest is not loaded. Open the sheet to take a rest.');
    return;
  }
  sheet.applyRest(kind);
}
if (q('shortRestBtn')) q('shortRestBtn').addEventListener('click', () => mapRest('short'));
if (q('longRestBtn')) q('longRestBtn').addEventListener('click', () => mapRest('long'));
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
function paintCondPillBtn() {
  const b = q('condPillBtn');
  if (!b) return;
  const compact = condPillCompact();
  b.textContent = 'Pills: ' + (compact ? 'Compact' : 'Normal');
  b.setAttribute('data-size', compact ? 'compact' : 'normal');
  b.setAttribute('aria-pressed', compact ? 'true' : 'false');
}
if (q('condPillBtn')) {
  q('condPillBtn').addEventListener('click', () => {
    try { localStorage.setItem('ssdns.map.condPills', condPillCompact() ? 'normal' : 'compact'); } catch (e) {}
    paintCondPillBtn();
    requestDraw();
  });
  paintCondPillBtn();
}
function paintShowDownedBtn() {
  const b = q('showDownedBtn');
  if (!b) return;
  const on = showDownedNow();
  b.textContent = 'Show downed: ' + (on ? 'ON' : 'OFF');
  b.classList.toggle('active', on);
  b.setAttribute('aria-pressed', on ? 'true' : 'false');
}
function toggleShowDowned() {
  const next = !showDownedNow();
  if (window.SSDNSMapFight && typeof window.SSDNSMapFight.setShowDowned === 'function') {
    try { window.SSDNSMapFight.setShowDowned(next); } catch (e) {
      adoptShowDowned(next);
      if (role === 'dm') write('table/initiative/showDowned', next);
    }
  } else {
    adoptShowDowned(next);
    if (role === 'dm') write('table/initiative/showDowned', next);
  }
  state.showDowned = next;
  paintShowDownedBtn();
  if (state.drawerOpen) { try { renderDrawer(); } catch (e) {} }
  try { renderActions(); } catch (e) {}
  requestDraw();
}
if (q('showDownedBtn')) {
  q('showDownedBtn').addEventListener('click', () => toggleShowDowned());
  paintShowDownedBtn();
}
on(window, 'ssdns-show-downed', () => {
  state.showDowned = showDownedNow();
  paintShowDownedBtn();
  if (state.drawerOpen) { try { renderDrawer(); } catch (e) {} }
  try { renderActions(); } catch (e) {}
  requestDraw();
});
q('reset').addEventListener('click', () => {
  if (fitBackdrop()) { draw(); return; }
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
  el.querySelectorAll('[data-act="timeSkipBtn"]').forEach(btn => {
    btn.title = btn.getAttribute('data-tip') || '';
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      if (state.initiative && state.initiative.started) return;
      const steps = Number(btn.getAttribute('data-steps'));
      if (!(steps > 0)) return;
      window.dispatchEvent(new CustomEvent('ssdns-advance-time', { detail: { steps: steps } }));
    });
  });
  paintTimeSkip();
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
  if (q('placeChestBtn')) q('placeChestBtn').addEventListener('click', () => placeLockedChest());
  if (q('resetLockBtn')) q('resetLockBtn').addEventListener('click', () => resetSelectedLock());
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
  if (q('showLightRings')) {
    q('showLightRings').checked = !!state.showLightRings;
    q('showLightRings').addEventListener('change', () => {
      if (role !== 'dm') return;
      state.showLightRings = !!q('showLightRings').checked;
      try { localStorage.setItem('ssdns.map.lightRings', state.showLightRings ? '1' : '0'); } catch (e) {}
      draw();
    });
  }
  if (q('visionSel')) q('visionSel').addEventListener('change', () => {
    sceneData().visionMode = q('visionSel').value === 'party' ? 'party' : 'own';
    saveScene();
    draw();
  });
  if (q('regionBtn')) q('regionBtn').addEventListener('click', () => armRegionTool('region'));
  if (q('regionEraseBtn')) q('regionEraseBtn').addEventListener('click', () => armRegionTool('regionerase'));
function douseSelected(out) {
  if (state.selectedLight && douseEmitterId(state.selectedLight, !!out)) {
    draw();
    return;
  }
  if (state.selectedDark && douseDarkZone(state.selectedDark, !!out)) {
    draw();
    return;
  }
  const targets = state.selectedIds.length ? state.tokens.filter(t => state.selectedIds.includes(t.id)) : (state.selected ? [state.selected] : []);
  if (!targets.length) { toast('Select a token or a spell light first'); return; }
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
    const ids = [];
    targets.forEach(t => [t.id, t.ownerUid, t.combatantId].forEach(id => { if (id) ids.push(String(id)); }));
    const lights = spellEmitterList().map(cloneEmitter);
    let lightChanged = false;
    lights.forEach(em => {
      if (!em || !em.followId || ids.indexOf(String(em.followId)) < 0) return;
      em.doused = !!out;
      lightChanged = true;
    });
    if (lightChanged) commitEmitters(lights);
    const zones = spellZoneList().map(z => Object.assign({}, z));
    let zoneChanged = false;
    zones.forEach(z => {
      if (!z || !z.followTarget || ids.indexOf(String(z.followTarget)) < 0) return;
      z.lightOut = !!out;
      zoneChanged = true;
    });
    zones.forEach(z => {
      if (!z || !z.magicalDark) return;
      const cid = String(z.casterId || "");
      const cuid = String(z.casterUid || "");
      if (ids.indexOf(cid) < 0 && ids.indexOf(cuid) < 0) return;
      z.darkOut = !!out;
      zoneChanged = true;
    });
    if (zoneChanged) setSpellZones(zones, {});
    toast(out ? 'Lights out' : 'Lights relit');
    draw();
  }
  if (q('testLightBtn')) q('testLightBtn').addEventListener('click', () => {
    setTool('testlight');
    toast(state.tool === 'testlight' ? 'Click a square to drop a torch' : 'Test light off');
  });
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
  if (q('betweenBtn')) q('betweenBtn').addEventListener('click', () => showBetweenEncounters());
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
  if (q('randomizeLootBtn')) q('randomizeLootBtn').addEventListener('click', () => {
    const ids = (state.tokens || []).filter(t => {
      if (!t || !onViewedScene(t)) return false;
      if (t.kind === 'player' || t.kind === 'asset' || t.kind === 'chest' || isPartyToken(t)) return false;
      if (t.spellPiece || t.lootBoxId) return false;
      return true;
    }).map(t => t.id);
    const force = !!state.lootForce;
    state.lootForce = false;
    noteLootForce(false);
    emit('loot:randomize', { tokenIds: ids, force: force });
  });
  q('addPcBtn').addEventListener('click', () => { addPlayerToken(); flashBtn('addPcBtn'); });
  if (q('partyTokenBtn')) q('partyTokenBtn').addEventListener('click', () => { placePartyToken(); flashBtn('partyTokenBtn'); });
  q('dupTokenBtn').addEventListener('click', () => {
    const list = selectedTokens();
    if (!list.length) { toast('Select a token'); return; }
    const made = list.map((src, i) => cloneToken(src, 1, i)).filter(Boolean);
    if (!made.length) return;
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
    const list = selectedTokens().filter(t => !isPartyToken(t));
    if (!list.length) { toast(selectedTokens().some(isPartyToken) ? 'The party token stays with the DM' : 'Select a token'); return; }
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
  const n62Card = q('playerCard');
  if (n62Card && !n62Card.dataset.n62) {
    n62Card.dataset.n62 = '1';
    n62Card.addEventListener('click', (e) => {
      const lightBtn = e.target && e.target.closest && e.target.closest('[data-act="spellLight"]');
      if (lightBtn) {
        e.preventDefault();
        togglePlayerSpellLight(lightBtn.getAttribute('data-light-key'));
        return;
      }
      n62OnClick(e, () => paintPlayerFight());
    });
  }
}

// --- scene images ---
// 0.3.54: built-in packs (map/map-packs.js) + the DM's own library (map/dm/library).
/* Empty rooms open this scene. Do not use it as a stand-in for a missing token sceneId. */
const DEFAULT_SCENE_ID = 'scn_between';
const LEGACY_SCENES = [
  { id: 'scn_dustyspur01', name: 'Dusty Spur', folder: 'builtin', img: 'dusty-spur-saloon_30x20_70px.webp' },
  { id: 'scn_street', name: 'Main Street', folder: 'builtin', img: 'main-street.webp' },
  { id: 'scn_upstairs', name: 'Upstairs', folder: 'builtin', img: 'upstairs.webp' },
  { id: 'scn_between', name: 'Six-Shooters & Sorcery — Between Encounters', folder: 'builtin', img: 'packs/between-encounters.webp', grid: { cols: 37, rows: 21, px: 70, show: false, labels: false } }
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
  const out = Object.assign({}, base, {
    cols: Math.max(1, Math.round(Number(g.cols) || base.cols)),
    rows: Math.max(1, Math.round(Number(g.rows) || base.rows)),
    px: Number(g.px) || base.px || 70
  });
  if (g.show === false) out.show = false;
  if (g.labels === false) out.labels = false;
  else if (g.labels === true) out.labels = true;
  return out;
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
/* 0.3.220: first open of a built-in scene with play data drops its assets, loot, and start spots.
   A room that already has the N90 walls still gets this once (seededPlay is separate from seededPack). */
function seedPackPlay(sc) {
  if (role !== 'dm' || !sc || !sc.play) return false;
  const sd = sceneData(sc.id);
  if (sd.seededPlay) return false;
  if (!sd.ambient && sc.play.ambient) sd.ambient = sc.play.ambient;
  if (sc.play.fogOff && !(sd.fogShapes || []).length) sd.fogRevealed = true;
  if (Array.isArray(sc.play.zones)) sd.zones = JSON.parse(JSON.stringify(sc.play.zones));
  if (Array.isArray(sc.play.spawns)) sd.spawns = JSON.parse(JSON.stringify(sc.play.spawns));
  if (Array.isArray(sc.play.cover)) sd.cover = JSON.parse(JSON.stringify(sc.play.cover));
  (sc.play.tokens || []).forEach(t => {
    if (!t || !t.id || t.kind === 'player' || t.ownerUid) return;
    if (shared.tokens[t.id]) return;
    const tok = JSON.parse(JSON.stringify(t));
    tok.sceneId = sc.id;
    shared.tokens[tok.id] = tok;
    const live = state.tokens.find(x => x.id === tok.id);
    if (live) Object.assign(live, tok); else state.tokens.push(JSON.parse(JSON.stringify(tok)));
    saveToken(tok.id);
  });
  sd.seededPlay = true;
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
    mount: () => el,
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
    const metaGrid = { cols: entry.grid.cols, rows: entry.grid.rows, px: entry.grid.px || 70 };
    if (entry.grid.show === false) metaGrid.show = false;
    if (entry.grid.labels === false) metaGrid.labels = false;
    sd.meta = { name: entry.name || 'Map', src: entry.src, grid: metaGrid };
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
    const seededWalls = seedPackWalls(sc);
    seedPackPlay(sc);
    if (!seededWalls && library[id] && library[id].snapshot) restoreSnapshot(id, library[id].snapshot);
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
    if (visSel) visSel.value = sd.visionMode === 'party' ? 'party' : 'own';
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
  if (!Array.isArray(scene.testLights)) scene.testLights = [];
  if (!Array.isArray(scene.spellEmitters)) scene.spellEmitters = [];
  if (!Array.isArray(scene.lightRegions)) scene.lightRegions = [];
  if (!Array.isArray(scene.magicalDark)) scene.magicalDark = [];
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
function followPlayerScene() {
  if (role !== 'player' || !state || !state.scene) return;
  const sid = getPlayerScene();
  if (!sid) return;
  if ((state.scene.mapId || state.scene.id) === sid) return;
  loadSceneImage(sid);
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
    if (g.show === false) fitBackdrop();
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
      const now = fxStamp();
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
      if (zoneLoopLive()) live = true;
      if (state.zonePulse) live = true;
      if (live || (state.slides && state.slides.length) || (state.pings && state.pings.length)) {
        draw();
        animRaf = requestAnimationFrame(step);
      } else animRaf = 0;
    };
    animRaf = requestAnimationFrame(step);
  }
  /* First snapshot is the fight as we found it. A start after that slams
     ROLL INITIATIVE, then ROUND n. A later round increment slams ROUND n only. */
  let stingerSeen = false;
  let stingerQueue = [];
  let stingerPlaying = false;
  let stingerTimer = 0;
  function planCombatStinger(prev, next) {
    const was = !!(prev && prev.started);
    const now = !!(next && next.started);
    const prevRound = Number(prev && prev.round) || 0;
    const round = Number(next && next.round) || 0;
    if (!was && now) return [{ kind: "init" }, { kind: "round", n: round || 1 }];
    if (was && now && round > prevRound) return [{ kind: "round", n: round }];
    return [];
  }
  function stingerNode() {
    let pop = q('combatStinger');
    if (pop) return pop;
    pop = document.createElement('div');
    pop.setAttribute('data-act', 'combatStinger');
    pop.className = 'ssm-stinger';
    pop.setAttribute('aria-live', 'polite');
    pop.innerHTML = '<div class="ssm-stinger-plate" data-act="stingerPlate"></div>';
    el.appendChild(pop);
    return pop;
  }
  function paintStinger(card) {
    const pop = stingerNode();
    const plate = pop.querySelector('[data-act="stingerPlate"]');
    const rule = '<div class="ssm-stinger-rule" aria-hidden="true"></div>';
    if (card && card.kind === 'round') {
      plate.innerHTML = rule + '<div class="ssm-stinger-kicker">ROUND</div><div class="ssm-stinger-num">' + esc(card.n) + '</div>' + rule;
    } else {
      plate.innerHTML = rule + '<div class="ssm-stinger-word">ROLL</div><div class="ssm-stinger-word">INITIATIVE</div>' + rule;
    }
    pop.classList.remove('is-on');
    void pop.offsetWidth;
    pop.classList.add('is-on');
  }
  function hideStinger() {
    const pop = q('combatStinger');
    if (pop) pop.classList.remove('is-on');
  }
  function pumpStinger() {
    const card = stingerQueue.shift();
    if (!card) { stingerPlaying = false; hideStinger(); return; }
    stingerPlaying = true;
    paintStinger(card);
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const life = reduce ? 1100 : 2300;
    clearTimeout(stingerTimer);
    stingerTimer = setTimeout(() => {
      hideStinger();
      stingerTimer = setTimeout(pumpStinger, reduce ? 60 : 160);
    }, life);
  }
  function playStingers(cards) {
    if (!cards || !cards.length) return;
    stingerQueue = stingerQueue.concat(cards);
    if (!stingerPlaying) pumpStinger();
  }
  function noteCombatStinger(prev, next) {
    if (!next) return;
    if (!stingerSeen) { stingerSeen = true; return; }
    playStingers(planCombatStinger(prev, next));
  }
  const TIME_SKIP_OFF = "Initiative is running. Zone timers advance when the round wraps, so Advance time is off.";
function paintTimeSkip() {
  const blocked = !!(state.initiative && state.initiative.started);
  el.querySelectorAll('[data-act="timeSkipBtn"]').forEach(btn => {
    btn.disabled = blocked;
    btn.title = blocked ? TIME_SKIP_OFF : (btn.getAttribute("data-tip") || "");
  });
}
function syncCombatants(initiative) {
    const prevId = state.currentTurnId;
    const prevStarted = !!(state.initiative && state.initiative.started);
    const prevInit = state.initiative;
    state.initiative = initiative || { order: [], turn: 0 };
    noteCombatStinger(prevInit, state.initiative);
    if (initiative && Object.prototype.hasOwnProperty.call(initiative, 'showDowned')) adoptShowDowned(!!initiative.showDowned);
    noteLightRound(state.initiative);
    /* N76: an ended map initiative heals a stale sheet lock before the next Attack click.
       A live fight stays with showTurn. A null payload is only the local placeholder and must not clear a real fight. */
    if (initiative && window.SSDNSTurn && typeof window.SSDNSTurn.inFight === 'function' && !window.SSDNSTurn.inFight(initiative)) {
      if (window.SSDNSActionPips && window.SSDNSActionPips.onTurn) window.SSDNSActionPips.onTurn(initiative);
      if (window.SSDNSTurnLock && window.SSDNSTurnLock.onTurn) window.SSDNSTurnLock.onTurn();
    }
    const order = state.initiative.order || [];
    const turn = state.initiative.turn || 0;
    state.currentTurnId = order[turn] ? order[turn].id : null;
    paintTimeSkip();
    if (state.currentTurnId !== prevId || !!state.initiative.started !== prevStarted) {
      state.moveHover = null;
      if (state.moveConfirm) state.moveConfirm.pending = null;
      state.moveReachKey = '';
      /* First sync (map just opened) keeps a Move the player already turned on. A later turn change or the fight ending leaves Move mode. */
      const hadTurn = prevId != null || prevStarted;
      if (hadTurn) exitMoveMode('turn');
      if (prevStarted && !state.initiative.started) clearLocalAim();
      if (state.n62 && state.currentTurnId !== prevId) state.n62.peek = false;
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
    state.lastAimId = "";
    state.aimBlank = false;
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
    if (state.lastAimId && drop[String(state.lastAimId)]) { state.lastAimId = ""; state.aimBlank = true; }
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
    if (!tok || hideDownedToken(tok)) return;
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
    if (role === 'dm' && toolbar.parentNode) toolbar.parentNode.removeChild(toolbar);
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
        const tail = beginStripTail(strip);
        appendStripChallenge(tail);
        dockDmMapTools(strip);
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
      const tail = beginStripTail(strip);
      appendStripChallenge(tail);
      const next = document.createElement('button');
      next.type = 'button';
      next.className = 'btn btn-primary btn-next';
      next.setAttribute('data-act', 'stripNext');
      next.textContent = 'Next';
      next.addEventListener('click', () => emit('initiative:next', {}));
      tail.appendChild(next);
      const prev = document.createElement('button');
      prev.type = 'button';
      prev.className = 'btn sm';
      prev.setAttribute('data-act', 'stripUndoNext');
      prev.textContent = 'Undo last Next'; /* turn order PR 1: the DM page asks first and restores, never refreshes markers */
      prev.title = 'Undo the last Next (the DM page asks first)';
      prev.addEventListener('click', () => emit('initiative:prev', {}));
      tail.appendChild(prev);
      /* 0.2.77: End combat sits at the far end, set apart from Next / Previous; the DM page asks first. */
      const gap = document.createElement('span');
      gap.className = 'ssm-strip-gap';
      tail.appendChild(gap);
      const end = document.createElement('button');
      end.type = 'button';
      end.className = 'btn sm btn-end-combat';
      end.setAttribute('data-act', 'stripEndCombat');
      end.textContent = 'End combat';
      end.title = 'End the fight (asks first)';
      end.addEventListener('click', () => emit('initiative:end', {}));
      tail.appendChild(end);
      dockDmMapTools(strip);
    }
  }
  /* Challenge / Next / Undo / End stay one cluster on the right of the fight row. */
  function beginStripTail(strip) {
    const tail = document.createElement('div');
    tail.className = 'ssm-strip-tail';
    tail.setAttribute('data-act', 'stripTail');
    strip.appendChild(tail);
    return tail;
  }
  /* Turn UX on the map: markers for the combatant whose turn it is (DM page only; the host returns the same HTML as the
     DM card's marker row, and the DM page's own click handler edits them) */
  /* N42: the DM map tools sit in the open middle of the fight strip, between the
     action cluster and Next / End combat. The toolbar node is moved, not copied. */
  function dockDmMapTools(strip) {
    if (role !== 'dm' || !strip || !toolbar) return;
    let slot = strip.querySelector('[data-act="stripTools"]');
    if (!slot) {
      slot = document.createElement('div');
      slot.className = 'ssm-strip-tools';
      slot.setAttribute('data-act', 'stripTools');
    }
    strip.appendChild(slot);
    slot.appendChild(toolbar);
    toolbar.classList.add('is-docked');
    el.classList.add('dm-tools-docked');
  }
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
    const tok = state.tokens.find(t => t && t.id === tokenId);
    if (!tok || tok.kind !== 'asset') hideAssetMenu();
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
      const aimed = tokenByRef(id);
      if (aimed && hideDownedToken(aimed)) return;
      /* fog-aware targeting: only what this player can see; past long range is listed but can't be picked */
      const seen = targetSight(id);
      if (seen && !seen.visible) return;
      const label = o.baseLabel || o.label || o.name || id;
      if (seen && seen.outOfRange) options.push({ id: id, label: label + ' — out of range, ' + (seen.feet != null ? seen.feet : '?') + ' ft', disabled: true });
      else options.push({ id: id, label: label });
    });
    return options;
  }
  /* Free shot stays in the list, but a redraw must not select it on its own.
     The last creature sticks until they pick someone else, pick Free shot or
     No target, or that creature leaves the list. */
  function settleAim(keep, creatureIds, explicitBlank, explicitFree) {
    const T = window.SSDNSTurn;
    const sticky = (explicitBlank || explicitFree) ? "" : (state.lastAimId || "");
    const cur = explicitFree ? FREE_SHOT : (explicitBlank ? "" : (keep || ""));
    const pick = T && T.chooseTarget ? T.chooseTarget(cur, sticky, creatureIds || []) : { value: cur, sticky: sticky };
    if (!explicitBlank && !explicitFree) state.lastAimId = pick.sticky || "";
    return pick.value;
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
    if (targetId && targetId !== FREE_SHOT) {
      const aimedTok = tokenByRef(targetId);
      if (aimedTok && hideDownedToken(aimedTok)) { toast('Down. The DM can show downed targets.'); return; }
    }
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
  /* N62: one Fight surface for the player Map card and the DM PC drawer.
     Identity, a single primary card (cast graphic or signature weapon; the Caster Gun for Hexslinger),
     then overflow. Spell buttons are not dumped under the card. */
  function n62Ensure() {
    if (!state.n62 || typeof state.n62 !== 'object') state.n62 = {};
    const ui = state.n62;
    if (!ui.tab) ui.tab = 'fight';
    if (!ui.prim) ui.prim = 'cast';
    if (ui.open == null) ui.open = '';
    if (ui.hot == null) ui.hot = '';
    if (!ui.acc) ui.acc = {};
    return ui;
  }
  function n62For(id) {
    const ui = n62Ensure();
    const key = String(id || (role === 'player' ? 'me' : ''));
    if (ui.for !== key) {
      ui.for = key;
      ui.open = '';
      ui.hot = '';
      ui.peek = false;
      ui.tab = 'fight';
      ui.prim = 'cast';
      ui.acc = {};
    }
    return ui;
  }
  function n62IsHex(card) {
    return !!(card && card.calling === 'hexslinger');
  }
  function n62CallPretty(card) {
    const id = card && card.calling;
    if (!id) return (card && card.kind) || '';
    return String(id).split('-').filter(Boolean).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }
  function n62Mine(tokenId) {
    if (role === 'player') {
      if (!fightLive()) return true;
      const Lock = window.SSDNSTurnLock;
      return !!(Lock && Lock.myTurn && Lock.myTurn());
    }
    const init = state.initiative;
    if (!init || !init.started || !state.currentTurnId) return true;
    const cur = String(state.currentTurnId);
    if (tokenId && cur === String(tokenId)) return true;
    const tok = (state.tokens || []).find(t => t && String(t.id) === String(tokenId));
    if (!tok) return false;
    return cur === String(tok.id) || (!!tok.combatantId && cur === String(tok.combatantId)) || (!!tok.ownerUid && cur === String(tok.ownerUid));
  }
  function n62FullNow(tokenId) {
    if (n62Mine(tokenId)) return true;
    return !!n62Ensure().peek;
  }
  function n62ActorName() {
    const id = state.currentTurnId;
    if (!id) return 'Someone';
    const order = (state.initiative && state.initiative.order) || [];
    const row = order.find(o => o && (o.id === id || o.playerId === id));
    if (row && row.name) return row.name;
    const tok = (state.tokens || []).find(t => t && (t.id === id || t.combatantId === id || t.ownerUid === id));
    return (tok && (tok.name || tok.label)) || 'Someone';
  }
  function n62Meta(sp) {
    const P = window.SSDNSActionPips;
    const cost = P && P.spellCost ? P.spellCost(sp && sp.name) : '';
    return [cost, sp && sp.kind && sp.kind !== 'none' ? sp.kind : '', sp && sp.concentration ? 'conc.' : ''].filter(Boolean).join(' · ');
  }
  function n62Quick(card) {
    if (!card || card.calling !== 'pact-seeker') return [];
    const spells = card.spells || [];
    const out = [];
    const pact = spells.find(s => s && (s.id === 'pact' || /pact shot/i.test(s.name || '')));
    if (pact) out.push(Object.assign({}, pact, { first: true, sub: 'signature · action' }));
    spells.forEach(s => {
      if (!s || s === pact) return;
      if (!(Number(s.level) > 0) && /eldritch|blast/i.test(s.name || '')) out.push(Object.assign({}, s, { sub: 'cantrip · ready' }));
    });
    const hex = spells.find(s => s && /^hex\b/i.test(s.name || '') && Number(s.level) === 1);
    if (hex) out.push(Object.assign({}, hex, { sub: 'L1 · bonus · conc.' }));
    return out;
  }
  function n62Pack(card) {
    const spells = (card && card.spells) || [];
    const cantrips = [];
    const by = {};
    spells.forEach(s => {
      if (!s) return;
      const lv = Number(s.level) || 0;
      const copy = Object.assign({}, s, { meta: n62Meta(s) });
      if (lv <= 0) { if (s.id !== 'pact') cantrips.push(copy); }
      else (by[lv] || (by[lv] = [])).push(copy);
    });
    const slots = (card && card.slots) || {};
    const keys = {};
    Object.keys(slots).forEach(k => { const n = Number(k); if (n > 0) keys[n] = true; });
    Object.keys(by).forEach(k => { keys[Number(k)] = true; });
    const levels = Object.keys(keys).map(Number).filter(n => n > 0).sort((a, b) => a - b).map(lv => {
      const slot = slots[lv] || slots[String(lv)] || {};
      let total = Number(slot.total != null ? slot.total : slot.max);
      if (!isFinite(total) || total < 0) total = 0;
      let spent = Number(slot.spent);
      if (!isFinite(spent)) spent = (slot.left != null && total) ? Math.max(0, total - Number(slot.left)) : 0;
      if (!total && by[lv]) total = by[lv].length;
      return total > 0 ? { level: lv, total: total, spent: Math.min(spent, total), spells: by[lv] || [] } : null;
    }).filter(Boolean);
    return { cantrips: cantrips, levels: levels, quick: n62Quick(card) };
  }
  function n62HasCast(card) {
    if (!card || n62IsHex(card)) return false;
    const Skins = window.SSDNSCastSkins;
    if (!Skins || !Skins.skinFor || !Skins.skinFor(card.calling) || !Skins.drawerCard) return false;
    const packed = n62Pack(card);
    return !!(packed.levels.length || packed.cantrips.length || packed.quick.length);
  }
  function n62Mode(card) {
    if (n62IsHex(card)) return 'gun';
    if (n62HasCast(card) && n62Ensure().prim !== 'weapon') return 'cast';
    return 'weapon';
  }
  function n62CastAttr(sp, dm) {
    if (!sp) return 'disabled';
    const id = esc(sp.id || '');
    const kind = esc(sp.kind || '');
    if (dm) return 'data-sid="' + id + '" data-skind="' + kind + '"';
    return 'data-act="playerSpell" data-id="' + id + '"' + (sp.enabled === false ? ' disabled' : '');
  }
  function n62CastCard(card, dm) {
    const Skins = window.SSDNSCastSkins;
    if (!n62HasCast(card)) return '';
    const ui = n62Ensure();
    const packed = n62Pack(card);
    const skin = Skins.skinFor(card.calling);
    return Skins.drawerCard({
      calling: card.calling,
      focus: skin && skin.focus,
      cantrips: packed.cantrips,
      levels: packed.levels,
      quick: packed.quick,
      open: ui.open,
      hot: ui.hot,
      dm: !!dm,
      castAttr: (sp) => n62CastAttr(sp, dm)
    }, ui.open);
  }
  function n62ActiveName(card) {
    const list = (card && card.attacks) || [];
    const id = activeWeaponId(card, role === 'dm' ? state.drawerTokenId : ((state.selected && state.selected.id) || ''));
    const hit = list.find(a => a && String(a.id) === String(id) && !a.arm) || list.find(a => a && !a.arm) || list[0];
    return (hit && (hit.name || hit.id)) || 'Weapon';
  }
  function n62WeaponCard(card, hitHtml, cylinders, bars) {
    return '<section class="n62-wcard" data-n62-card="1"><div class="n61-tag">Signature weapon</div>' +
      '<div class="n62-wart"><div>' + esc(n62ActiveName(card)) + '<small>signature weapon</small></div></div>' +
      (bars || '') +
      (hitHtml ? '<div class="n62-attacks">' + hitHtml + '</div>' : '<span class="n62-none">No attack on this card.</span>') +
      (cylinders || '') +
      '<p class="n61-who">Same card height as the cast surface. Swap with ✧ Cast / Weapon.</p></section>';
  }
  function n62HexCard(card, hitHtml, cylinders, bars, dm) {
    const gun = ((card && card.attacks) || []).find(a => a && (a.caster || (a.ammo && a.ammo.cap))) || null;
    const capN = gun && gun.ammo ? (Number(gun.ammo.cap) || 0) : 0;
    const loaded = gun && gun.ammo ? (Number(gun.ammo.loaded) || 0) : 0;
    const hexN = gun ? loadedHexNames(gun).length : 0;
    const line = gun ? attackLine(gun) : 'Caster Gun';
    const chips = ((card && card.spells) || []).filter(s => s && !(Number(s.level) > 0) && s.id !== 'pact').slice(0, 3).map(s => {
      return '<button type="button" class="n61-chip' + (dm ? ' ssm-atk' : '') + '" ' + n62CastAttr(s, dm) + '>✧ ' + esc(s.name) + '<i>dry fire</i></button>';
    }).join('');
    return '<section class="n61-card bg-hex gun" data-calling="hexslinger" data-n62-card="1">' +
      '<div class="n61-tag">Hexslinger · signature card</div>' +
      '<div class="n62-sigrow"><h2>Caster Gun</h2><span><b>' + loaded + '/' + (capN || 6) + '</b> · ' + hexN + ' hex lead</span></div>' +
      '<div class="n62-sigrow"><span>' + esc(line) + '</span>' + (chips ? '<span class="n61-chips">' + chips + '</span>' : '') + '</div>' +
      (bars || '') +
      '<div class="n62-cylhost">' + (cylinders || '') + '</div>' +
      '<div class="n62-legend"><span><i class="n62-dot" style="background:#e8bf62;box-shadow:0 0 6px #3fb8a8"></i>hex lead = slot</span>' +
      '<span><i class="n62-dot" style="background:#c99434"></i>plain round</span>' +
      '<span><i class="n62-dot" style="background:#050506;border:1px solid #555"></i>empty</span></div>' +
      '<p class="n61-gunnote"><b>Cylinder stays on the gun.</b> Hex lead chambers are the slots. This card does not add a second token wall. Load a hex lead, then cast. Cantrips dry-fire.</p>' +
      (hitHtml ? '<div class="n62-attacks">' + hitHtml + '</div>' : '') +
      '<p class="n61-cap">Tap a hex chamber to cast the loaded lead. Tap a plain round to fire. <em>The only gun in the system.</em></p></section>';
  }
  function n62SwitchHtml(card) {
    if (n62IsHex(card) || !n62HasCast(card)) return '';
    const prim = n62Ensure().prim === 'weapon' ? 'weapon' : 'cast';
    return '<button type="button" data-n62-prim="cast"' + (prim === 'cast' ? ' class="on"' : '') + '>✧ Cast</button>' +
      '<button type="button" data-n62-prim="weapon"' + (prim === 'weapon' ? ' class="on"' : '') + '>Weapon</button>';
  }
  function n62PrimaryHtml(card, parts, dm) {
    const mode = n62Mode(card);
    if (mode === 'gun') return n62HexCard(card, parts.hitHtml, parts.cylinders, parts.bars, dm);
    if (mode === 'cast') {
      const cast = n62CastCard(card, dm);
      if (cast) return cast;
    }
    return n62WeaponCard(card, parts.hitHtml, parts.cylinders, parts.bars);
  }
  function n62Identity(card) {
    const hp = (card && card.hp) || {};
    const maxHp = Number(hp.max);
    const curHp = Number(hp.cur);
    const have = isFinite(maxHp) && maxHp > 0 && isFinite(curHp);
    const hpPct = have ? Math.max(0, Math.min(100, (curHp / maxHp) * 100)) : 0;
    const cur = hp.cur != null && hp.cur !== '' ? hp.cur : '—';
    const max = hp.max != null && hp.max !== '' ? hp.max : '—';
    let init = '';
    if (card && card.init != null && card.init !== '') {
      const n = Number(card.init);
      init = ' · Init ' + (isFinite(n) && n >= 0 ? '+' + n : card.init);
    }
    const temp = hp.temp ? ('Temp ' + hp.temp) : 'Temp 0';
    const bar = have ? '<div class="ssm-hpbar" role="meter" aria-label="HP" aria-valuenow="' + esc(curHp) + '" aria-valuemax="' + esc(maxHp) + '"><span style="width:' + hpPct + '%"></span></div>' : '';
    return '<div class="n62-identrow"><div class="n62-stat"><b>' + esc(card && card.ac != null ? card.ac : '—') + '</b><small>AC</small></div>' +
      '<div class="n62-hp"><div class="n62-hprow"><span>HP</span><b>' + esc(cur) + ' / ' + esc(max) + '</b></div>' + bar +
      '<div class="n62-hprow n62-sub"><span>' + esc(speedLabel(card && card.speed)) + esc(init) + '</span><span>' + esc(temp) + '</span></div></div></div>';
  }
  function n62EconHtml() {
    const P = window.SSDNSActionPips;
    const st = P && P.state ? P.state() : {};
    const chip = (key, label, used) => '<button type="button" class="n62-ec' + (used ? ' used' : '') + '" data-n62-pip="' + key + '">' + label + '</button>';
    const moveUsed = !!(st && Number(st.moveUsed) > 0);
    return chip('action', 'Action', !!(st && st.action)) + chip('bonus', 'Bonus', !!(st && st.bonus)) + chip('reaction', 'React', !!(st && st.reaction)) +
      '<span class="n62-ec' + (moveUsed ? ' used' : '') + '">Move</span>';
  }
  function n62ReactionSpell(card) {
    const P = window.SSDNSActionPips;
    return ((card && card.spells) || []).find(s => s && P && P.spellCost && P.spellCost(s.name) === 'reaction') || null;
  }
  function n62PeekHtml(card, dm) {
    const labels = { scholar: 'Ledger', 'pact-seeker': 'Sigil rail', hexslinger: 'Caster Gun', lawman: 'Badges' };
    const label = labels[card && card.calling] || (n62IsHex(card) ? 'Caster Gun' : 'Slots');
    let mini = '';
    if (n62IsHex(card)) {
      const gun = ((card.attacks) || []).find(a => a && a.ammo && a.ammo.cap);
      const flags = gun && gun.ammo && Array.isArray(gun.ammo.chambers) ? gun.ammo.chambers : [];
      const capN = gun && gun.ammo ? Number(gun.ammo.cap) || 0 : 0;
      for (let i = 0; i < capN; i++) {
        const raw = String(flags[i] || '');
        const hex = raw.indexOf('hex') >= 0;
        const empty = !raw || raw === 'empty' || raw === '0' || raw === 'false';
        const bg = hex ? '#e8bf62' : (empty ? '#050506' : '#c99434');
        mini += '<i class="n62-dot" style="background:' + bg + ';border:1px solid #555"></i>';
      }
    } else {
      n62Pack(card).levels.forEach(row => {
        mini += '<b style="color:#d8a948;font-size:10px">L' + row.level + '</b>';
        for (let i = 0; i < row.total; i++) mini += '<i class="n62-pip' + (i < row.spent ? ' spent' : '') + '" style="width:9px;height:9px"></i>';
      });
    }
    const react = n62ReactionSpell(card);
    const reactBtn = react
      ? (dm
        ? '<button type="button" class="n62-react ssm-atk" data-sid="' + esc(react.id) + '" data-skind="' + esc(react.kind || '') + '">⚡ Reaction ready — ' + esc(react.name) + '</button>'
        : '<button type="button" class="n62-react" data-act="playerSpell" data-id="' + esc(react.id) + '">⚡ Reaction ready — ' + esc(react.name) + '</button>')
      : '<button type="button" class="n62-react" data-act="n62ReactNone">⚡ Reaction ready</button>';
    return '<div class="n62-wait"><b>Waiting</b> — ' + esc(n62ActorName()) + ' is acting. Drawer stays compact until your turn.</div>' +
      '<button type="button" class="n62-peek" data-act="n62Peek"><span>✧ ' + esc(label) + ' — slots</span><span class="n62-mini">' + mini + '</span><span style="color:#d8a948">▸</span></button>' +
      reactBtn;
  }
  function n62PlayerConds() {
    const names = [];
    const add = (c) => {
      const n = condLabel(c);
      if (n && names.indexOf(n) < 0) names.push(n);
    };
    try {
      const c = window.SSDNSApp && window.SSDNSApp.doc && window.SSDNSApp.doc().character;
      ((c && c.activeConditions) || []).forEach(add);
      if (c && c.spellMarks && c.spellMarks.conc) add('Concentrating · ' + c.spellMarks.conc);
    } catch (e) {}
    const me = (state.tokens || []).find(t => t && t.ownerUid && t.ownerUid === uid);
    if (me) {
      try { tokenConditions(me).forEach(add); } catch (e2) {}
    }
    return names;
  }
  function n62Sync(root, tokenId) {
    if (!root) return;
    const ui = n62Ensure();
    const full = n62FullNow(tokenId);
    root.querySelectorAll('[data-n62-tab]').forEach(b => b.classList.toggle('on', b.getAttribute('data-n62-tab') === ui.tab));
    root.querySelectorAll('[data-n62-pane]').forEach(p => { p.hidden = p.getAttribute('data-n62-pane') !== ui.tab; });
    const fullEl = root.querySelector('[data-act="n62Full"]');
    const compEl = root.querySelector('[data-act="n62Compact"]');
    if (fullEl) fullEl.hidden = !full;
    if (compEl) compEl.hidden = !!full;
  }
  function n62LooseHtml(card, dm) {
    return ((card && card.spells) || []).filter(s => s && String(s.id || '').indexOf('sig:') === 0).map(s => {
      return '<button type="button" class="ssm-atk" ' + n62CastAttr(s, dm) + '>' + esc(s.name || s.id) + '</button>';
    }).join('');
  }
  function n62FallbackHtml(card, dm) {
    if (n62HasCast(card) || n62IsHex(card)) return '';
    return ((card && card.spells) || []).filter(s => s && String(s.id || '').indexOf('sig:') !== 0).map(s => {
      return '<button type="button" class="ssm-atk" ' + n62CastAttr(s, dm) + '>' + esc(s.name || s.id) + (Number(s.level) > 0 ? ' (L' + Number(s.level) + ')' : '') + '</button>';
    }).join('');
  }
  function n62PaintPlayer(card, parts) {
    n62For('me');
    const root = q('playerCard');
    if (!root) return;
    const stats = q('playerStats');
    if (stats) stats.innerHTML = n62Identity(card);
    const pill = q('n62Call');
    if (pill) {
      const label = n62CallPretty(card);
      pill.hidden = !label;
      pill.textContent = label;
    }
    const names = n62PlayerConds();
    const conds = q('n62Conds');
    if (conds) conds.innerHTML = names.length ? names.map(n => '<span class="ssm-cond">' + esc(n) + '</span>').join(' ') : '<span class="n62-none">No conditions</span>';
    const sum = q('n62CondSum');
    if (sum) sum.textContent = names.length ? (names.length + ' active') : 'none';
    const condBody = q('n62CondBody');
    if (condBody) condBody.innerHTML = names.length ? names.map(n => '<div class="n62-li"><span>' + esc(n) + '</span></div>').join('') : '<span class="n62-none">No conditions</span>';
    const econ = q('n62Econ');
    if (econ) econ.innerHTML = n62EconHtml();
    const arms = q('n62Arms');
    if (arms) arms.innerHTML = (parts.armHtml || '') + n62LooseHtml(card, false);
    const sw = q('n62Switch');
    if (sw) {
      const buttons = n62SwitchHtml(card);
      sw.innerHTML = buttons;
      sw.hidden = !buttons;
    }
    const mode = n62Mode(card);
    const bars = '<label class="ssm-act">Target <select data-act="n62Target" aria-label="Target">' + (parts.targetHtml || '') + '</select></label>';
    const slot = q('actionSlot');
    if (slot) slot.innerHTML = n62PrimaryHtml(card, { hitHtml: parts.hitHtml, cylinders: mode === 'cast' ? '' : parts.cylinders, bars: bars }, false);
    const extras = q('n62Extras');
    if (extras) {
      const fallback = n62FallbackHtml(card, false);
      const cyl = (mode === 'cast' && parts.cylinders) ? parts.cylinders : '<span class="n62-none">Reload, tactical reload, and the cylinder live on the primary card.</span>';
      extras.innerHTML = cyl + (fallback ? '<div class="n62-attacks">' + fallback + '</div>' : '');
    }
    const gear = q('n62GearList');
    if (gear) gear.innerHTML = parts.itemRows || '<span class="n62-none">Nothing in hand.</span>';
    const more = q('n62MoreList');
    if (more) {
      const rows = ((card && card.spells) || []).map(s => '<div class="n62-li"><span>' + esc(s.name || s.id) + '</span><small>' + (Number(s.level) > 0 ? ('L' + s.level) : 'cantrip') + '</small></div>').join('');
      more.innerHTML = rows || '<span class="n62-none">No spells on this sheet.</span>';
    }
    const compact = q('n62Compact');
    if (compact) compact.innerHTML = n62PeekHtml(card, false);
    n62Sync(root, null);
  }
  function n62DmHtml(bag) {
    const card = bag.card;
    n62For(bag.tokenId);
    const mode = n62Mode(card);
    const ui = n62Ensure();
    const primary = n62PrimaryHtml(card, {
      hitHtml: bag.attacks,
      cylinders: mode === 'cast' ? '' : bag.cylinders,
      bars: bag.bars
    }, true);
    const accOpen = (key) => (ui.acc && ui.acc[key]) ? ' open' : '';
    const names = ((card.conditions) || []).map(condLabel).filter(Boolean);
    if (card.conc && !names.some(n => String(n).indexOf(card.conc) >= 0)) names.unshift('Concentrating · ' + card.conc);
    const condLine = names.length ? names.map(n => '<span class="ssm-cond">' + esc(n) + '</span>').join(' ') : '<span class="n62-none">No conditions</span>';
    const spellList = ((card.spells) || []).map(s => '<div class="n62-li"><span>' + esc(s.name || s.id) + '</span><small>' + (Number(s.level) > 0 ? ('L' + s.level) : 'cantrip') + '</small></div>').join('') || '<span class="n62-none">No spells on this card.</span>';
    const items = window.SSDNSItems && card.items && card.items.length
      ? window.SSDNSItems.drawerRows(card.items, { name: card.name || '', dm: true })
      : '<span class="n62-none">No items on the snapshot.</span>';
    const rangeHtml = '<label class="ssm-act ssm-range"><input type="checkbox" data-act="drawerRange"' + (state.showRange ? ' checked' : '') + '> Show range</label>' +
      '<label class="ssm-act">Range: <select data-act="rangeOverride" aria-label="Range: Auto">' +
      '<option value="auto"' + (rangeOverrideNow() === 'auto' ? ' selected' : '') + '>Auto</option>' +
      '<option value="ignore"' + (rangeOverrideNow() === 'ignore' ? ' selected' : '') + '>Ignore range</option>' +
      '<option value="force"' + (rangeOverrideNow() === 'force' ? ' selected' : '') + '>Force DIS</option>' +
      '<option value="adv"' + (rangeOverrideNow() === 'adv' ? ' selected' : '') + '>Force ADV</option>' +
      '</select></label><select data-act="drawerRangeWeapon" aria-label="Token weapon" hidden></select>';
    const sw = n62SwitchHtml(card);
    const extras = (mode === 'cast' && bag.cylinders ? bag.cylinders : '<span class="n62-none">Reload and the cylinder live on the primary card.</span>') +
      (n62FallbackHtml(card, true) ? '<div class="n62-attacks">' + n62FallbackHtml(card, true) + '</div>' : '') +
      (n62LooseHtml(card, true) ? '<div class="n62-attacks">' + n62LooseHtml(card, true) + '</div>' : '') +
      '<div class="ssm-row"><select data-act="weaponPick" aria-label="Weapon">' + bag.weaponOptions + '</select>' +
      '<button type="button" data-act="reloadBtn">Reload</button><button type="button" data-act="unloadBtn">Unload</button></div>';
    const full = n62FullNow(bag.tokenId);
    const tab = (id, label) => '<button type="button" data-n62-tab="' + id + '"' + (ui.tab === id ? ' class="on"' : '') + '>' + label + '</button>';
    const pane = (id, inner) => '<div data-n62-pane="' + id + '"' + (ui.tab === id ? '' : ' hidden') + '>' + inner + '</div>';
    return drawerHeadHtml(card.name || bag.tokenId, n62CallPretty(card), { gear: true }) +
      '<div class="ssm-drawer-body n62">' +
      (bag.pending || '') +
      '<div class="n62-zone"><div class="n62-zlabel">1 · Identity</div>' + n62Identity(card) + (bag.death || '') +
      '<div class="n62-conds">' + condLine + '</div>' +
      (bag.tactics ? '<div class="ssm-tactics">' + esc(bag.tactics) + '</div>' : '') + '</div>' +
      '<div data-act="n62Full"' + (full ? '' : ' hidden') + '>' +
      '<div class="n62-econ">' + (bag.markerRow || '') + '</div>' +
      '<div class="n62-tabsbar">' + tab('fight', 'Fight') + tab('gear', 'Gear') + tab('more', 'More') + '</div>' +
      pane('fight',
        '<div class="n62-zone"><div class="n62-zlabel">2 · Primary — one card height</div>' +
        (sw ? '<div class="n62-switch">' + sw + '</div>' : '') + primary + '</div>' +
        '<div class="n62-zone"><div class="n62-zlabel">3 · Overflow</div>' +
        '<details class="n62-acc" data-n62-acc="cond"' + accOpen('cond') + '><summary>Conditions <small>' + (names.length ? names.length + ' active' : 'none') + '</small></summary><div class="n62-accbody">' +
        (bag.conds ? '<div class="ssm-conds">' + bag.conds + '</div>' : '') +
        '<div class="ssm-row"><input data-act="hpAmt" type="number" value="1" min="0" aria-label="HP amount">' +
        '<button type="button" data-act="hpMinus">− HP</button><button type="button" data-act="hpPlus">+ HP</button>' +
        '<button type="button" data-act="hpSet">Set HP</button><button type="button" data-act="downCard">Down</button></div>' +
        '<div class="ssm-row"><select data-act="condPick" aria-label="Condition">' + bag.condOptions + '</select><button type="button" data-act="condBtn">Condition</button></div>' +
        '</div></details>' +
        '<details class="n62-acc" data-n62-acc="cover"' + accOpen('cover') + '><summary>Cover &amp; range</summary><div class="n62-accbody">' + (bag.coverRow || '') + '</div></details>' +
        '<details class="n62-acc" data-n62-acc="link"' + accOpen('link') + '><summary>Link · lights · vision <small>DM</small></summary><div class="n62-accbody">' + (bag.light || '') + rangeHtml + '</div></details>' +
        '<details class="n62-acc" data-n62-acc="extras"' + accOpen('extras') + '><summary>Gear extras <small>reload · consumables</small></summary><div class="n62-accbody">' + extras + '</div></details>' +
        '</div>') +
      pane('gear', '<div class="n62-zone"><div class="n62-zlabel">Gear</div>' + items + (bag.gear || '') + '</div>') +
      pane('more', '<div class="n62-zone"><div class="n62-zlabel">More</div>' + (bag.actToggle || '') +
        '<div class="ssm-row"><button type="button" data-act="deathBtn">Death save</button><button type="button" data-act="undoBtnD">Undo</button></div>' +
        '<div class="ssm-row"><button type="button" data-act="robBtn"' + (bag.grabAttr || '') + '>Rob/Disarm</button>' +
        '<button type="button" data-act="shoveBtn"' + (bag.shoveAttr || '') + '>Shove</button></div>' +
        '<button type="button" data-act="imageBtn">Replace image</button>' +
        '<div class="n62-zlabel">Spells</div>' + spellList + '</div>') +
      '</div>' +
      '<div data-act="n62Compact"' + (full ? ' hidden' : '') + '>' + n62PeekHtml(card, true) +
      '<details class="n62-acc"><summary>Conditions <small>' + (names.length ? names.length + ' active' : 'none') + '</small></summary><div class="n62-accbody">' + condLine + '</div></details></div>' +
      dmToolsHtml(bag.bomb) +
      '</div>';
  }
  function n62OnClick(e, repaint) {
    const t = e.target && e.target.closest ? e.target : null;
    if (!t || !t.closest) return false;
    const tab = t.closest('[data-n62-tab]');
    if (tab) { e.preventDefault(); n62Ensure().tab = tab.getAttribute('data-n62-tab') || 'fight'; repaint(); return true; }
    const prim = t.closest('[data-n62-prim]');
    if (prim) {
      e.preventDefault();
      const ui = n62Ensure();
      ui.prim = prim.getAttribute('data-n62-prim') || 'cast';
      ui.open = '';
      ui.hot = '';
      repaint();
      return true;
    }
    const slotBtn = t.closest('[data-n62-slot]');
    if (slotBtn) {
      e.preventDefault();
      e.stopPropagation();
      if (slotBtn.disabled) return true;
      const id = slotBtn.getAttribute('data-n62-slot') || '';
      const ui = n62Ensure();
      ui.open = ui.open === id ? '' : id;
      ui.hot = '';
      repaint();
      return true;
    }
    const pick = t.closest('[data-n62-pick]');
    if (pick) { e.preventDefault(); e.stopPropagation(); n62Ensure().hot = pick.getAttribute('data-n62-pick') || ''; repaint(); return true; }
    const close = t.closest('[data-n62-x]');
    if (close) { e.preventDefault(); e.stopPropagation(); n62Ensure().open = ''; n62Ensure().hot = ''; repaint(); return true; }
    const peek = t.closest('[data-act="n62Peek"]');
    if (peek) { e.preventDefault(); n62Ensure().peek = true; repaint(); return true; }
    const pip = t.closest('[data-n62-pip]');
    if (pip) {
      e.preventDefault();
      const P = window.SSDNSActionPips;
      if (P && P.toggle) P.toggle(pip.getAttribute('data-n62-pip'));
      repaint();
      return true;
    }
    const gear = t.closest('[data-act="n62Gear"]');
    if (gear) {
      e.preventDefault();
      const hostEl = gear.closest('.ssm-drawer, .ssdns-playercard');
      const box = hostEl && hostEl.querySelector('[data-n62-acc="link"]');
      if (box) box.open = !box.open;
      return true;
    }
    const end = t.closest('[data-act="n62End"]');
    if (end) { e.preventDefault(); if (role === 'player') runPlayer('endturn'); return true; }
    const none = t.closest('[data-act="n62ReactNone"]');
    if (none) { e.preventDefault(); toast('No reaction spell is prepared.'); return true; }
    return false;
  }

  function paintPlayerFight() {
    const slot = q('actionSlot');
    if (!slot) return;
    /* 0.3.228: the player card is the scrolling menu. A pick rebuilds the rows
       under the focused control, and the browser then jumps that scroller to the top. */
    const panel = (slot.closest && slot.closest('.ssdns-playercard')) || q('playerCard') || slot;
    const keep = readPanelScroll(panel);
    releasePanelFocus(panel);
    const n62on = slot.hasAttribute('data-n62-bind');
    const root = n62on ? (q('playerCard') || slot) : slot;
    const card = playerFightModel();
    const nameEl = q('playerName');
    if (nameEl && card.name) nameEl.textContent = card.name;
    const dockLabel = q('playerDockLabel');
    if (dockLabel && card.name) dockLabel.textContent = card.name;
    paintAddMine();
    paintRoleBadge();
    const stats = q('playerStats');
    if (stats && !n62on) {
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
    let armHtml = '';
    let hitHtml = '';
    const targetChoices = playerTargetOptions();
    const playerCreatures = targetChoices.filter(o => o && o.id && o.id !== FREE_SHOT).map(o => o.id);
    const playerAim = settleAim(state.playerTarget || "", playerCreatures, state.aimBlank && !state.playerTarget, state.playerTarget === FREE_SHOT);
    if (playerAim && playerAim !== FREE_SHOT) { state.playerTarget = playerAim; state.aimBlank = false; }
    else if (playerAim === FREE_SHOT) { state.playerTarget = FREE_SHOT; state.aimBlank = true; }
    const targetHtml = targetChoices.map(o => {
      const on = String(o.id) === String(playerAim || '') ? ' selected' : '';
      const off = o.disabled ? ' disabled' : '';
      return '<option value="' + esc(o.id) + '"' + off + on + '>' + esc(o.label || 'No target') + '</option>';
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
      const btn = a.arm
        ? '<button type="button" class="ssm-atk ssm-arm' + (a.armed ? ' on' : '') + '" data-act="playerAttack" data-id="' + esc(a.id) + '" aria-pressed="' + (a.armed ? 'true' : 'false') + '"' + (a.enabled === false ? ' disabled' : '') + tip + '>' + esc(a.name || a.id) + '</button>'
        : '<button type="button" class="ssm-atk' + (a.fan ? ' ssm-fan' : '') + '" data-act="playerAttack" data-id="' + esc(a.id) + '"' + off + tip + '>' + esc(text) + disMark(verdict) + '</button>';
      if (a.arm) armHtml += btn;
      else hitHtml += btn;
      return btn;
    }).join('');
    const playerShove = (() => {
      const Shove = window.SSDNSShove;
      const aim = state.playerTarget || '';
      const selfTok = (state.tokens || []).find(t => t && t.ownerUid === uid);
      const aimTok = aim ? (tokenByRef(aim) || (state.tokens || []).find(t => t && (t.id === aim || tokenCombatant(t.id) === aim))) : null;
      const feet = selfTok && aimTok ? feetBetween(selfTok, aimTok) : null;
      const opt = document.querySelector('#atkTarget') && document.querySelector('#atkTarget').selectedOptions && document.querySelector('#atkTarget').selectedOptions[0];
      if (!Shove || !aim) return { ok: false, reason: 'Pick a creature to shove.' };
      return Shove.gate({
        actorSize: card.creatureSize || 'Medium',
        targetSize: (opt && opt.getAttribute('data-creature-size')) || 'Medium',
        feet: feet,
        reach: card.reachFeet || 5
      });
    })();
    const shoveHtml = '<button type="button" class="ssm-atk" data-act="playerShove"' + (playerShove.ok ? '' : ' disabled') + ' title="' + esc(playerShove.reason || 'Shove') + '">Shove</button>';
    hitHtml += shoveHtml;
    const cylinders = (card.attacks || []).filter(a => (a.ammo && a.ammo.cap) || a.reloadId || a.trId).map(a => {
      const chosen = (state.rowTargets && (state.rowTargets[a.id] || state.rowTargets[a.reloadId])) || state.playerTarget || '';
      const html = playerTargetOptions().map(o => {
        const on = String(o.id) === String(chosen) ? ' selected' : '';
      const off = o.disabled ? ' disabled' : '';
        return '<option value="' + esc(o.id) + '"' + off + on + '>' + esc(o.label || 'No target') + '</option>';
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
    if (n62on) n62PaintPlayer(card, { armHtml: armHtml, hitHtml: hitHtml, cylinders: cylinders, itemRows: itemRows, targetHtml: targetHtml });
    else slot.innerHTML =
      (attacks || shoveHtml ? '<div class="ssm-section">Attacks</div>' + attacks + shoveHtml : '') +
      (cylinders ? '<div class="ssm-section">Cylinder</div>' + cylinders : '') +
      spells +
      itemRows;
    bindSpellFold(root);
    root.querySelectorAll('[data-act="useItem"]').forEach(b => {
      b.addEventListener('click', () => playerUseItem(b.getAttribute('data-uid')));
    });
    root.querySelectorAll('[data-act="playerShove"]').forEach(b => {
      b.addEventListener('click', () => {
        if (b.disabled) return;
        if (window.SSDNSPlaytest && window.SSDNSPlaytest.shove) window.SSDNSPlaytest.shove();
      });
    });
    root.querySelectorAll('[data-act="playerAttack"], [data-act="playerSpell"], [data-act="playerReload"], [data-act="playerTr"], [data-act="playerClean"], [data-act="playerUnjam"], [data-act="playerReopen"], [data-act="playerUnload"]').forEach(b => {
      b.addEventListener('click', () => runPlayer(b.getAttribute('data-id') || b.getAttribute('data-wid')));
    });
    const appGun = () => window.SSDNSApp || null;
    root.querySelectorAll('[data-act="playerPool"]').forEach(sel => {
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
    root.querySelectorAll('[data-act="playerAdv"]').forEach(b => bindMode(b, 'adv'));
    root.querySelectorAll('[data-act="playerDis"]').forEach(b => bindMode(b, 'dis'));
    root.querySelectorAll('[data-act="playerHexLvl"]').forEach(sel => {
      sel.addEventListener('change', () => rememberGun(sel, 'hex', sel.value));
    });
    root.querySelectorAll('[data-act="playerHex"]').forEach(b => {
      b.addEventListener('click', () => {
        const gi = b.getAttribute('data-gun');
        const lvl = root.querySelector('[data-act="playerHexLvl"][data-gun="' + gi + '"]');
        const spell = root.querySelector('[data-act="playerCastSpell"][data-gun="' + gi + '"]');
        const slotSel = root.querySelector('[data-act="playerCastSlot"][data-gun="' + gi + '"]');
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
    root.querySelectorAll('[data-act="playerCastSpell"], [data-act="playerCastSlot"]').forEach(sel => {
      sel.addEventListener('change', () => {
        rememberGun(sel, sel.getAttribute('data-act') === 'playerCastSpell' ? 'spell' : 'slot', sel.value);
        const app = appGun();
        const gi = sel.getAttribute('data-gun');
        const spell = root.querySelector('[data-act="playerCastSpell"][data-gun="' + gi + '"]');
        const slotSel = root.querySelector('[data-act="playerCastSlot"][data-gun="' + gi + '"]');
        if (app && app.prepareGunCast) app.prepareGunCast(Number(gi), spell && spell.value, slotSel && slotSel.value);
        paintPlayerFight();
      });
    });
    root.querySelectorAll('[data-act="playerCast"]').forEach(b => {
      b.addEventListener('click', () => {
        const gi = b.getAttribute('data-gun');
        const spell = root.querySelector('[data-act="playerCastSpell"][data-gun="' + gi + '"]');
        const slotSel = root.querySelector('[data-act="playerCastSlot"][data-gun="' + gi + '"]');
        const row = b.closest('.cylinder-row');
        const cyl = row && row.querySelector('[data-act="cylTarget"]');
        if (cyl && host.setSheetTarget) host.setSheetTarget(cyl.value);
        const app = appGun();
        if (app && app.prepareGunCast) app.prepareGunCast(Number(gi), spell && spell.value, slotSel && !slotSel.hidden ? slotSel.value : '');
        if (window.SSDNSGunCast) window.SSDNSGunCast(Number(gi));
        paintPlayerFight();
      });
    });
    root.querySelectorAll('[data-act="playerChamber"]').forEach(b => {
      b.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const row = b.closest('.cylinder-row');
        const sel = row && row.querySelector('[data-act="cylTarget"]');
        const targetId = sel ? sel.value : '';
        const wid = b.getAttribute('data-wid') || '';
        const k = b.getAttribute('data-k');
        const gunN = String(wid).match(/gunroll:(\d+)/);
        const atk = (playerFightModel().attacks || []).find(a => a && String(a.id) === String(wid));
        const flags = atk && atk.ammo && Array.isArray(atk.ammo.chambers) ? atk.ammo.chambers : null;
        const token = flags && k != null ? flags[Number(k)] : '';
        const parsed = appGun() && appGun().parseChamber ? appGun().parseChamber(token) : null;
        if (parsed && parsed.kind === 'hex' && gunN && window.SSDNSGunCastHex) {
          state.playerTarget = targetId;
          state.rowTargets = state.rowTargets || {};
          state.rowTargets[wid] = targetId;
          if (host.setSheetTarget) host.setSheetTarget(targetId);
          window.SSDNSGunCastHex(Number(gunN[1]), Number(k));
          return;
        }
        runPlayer(wid, { chamber: k, targetId: targetId });
      });
    });
    root.querySelectorAll('[data-act="playerSpin"]').forEach(b => {
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
    root.querySelectorAll('[data-act="playerCycle"]').forEach(b => {
      b.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const app = appGun();
        if (app && app.cycleTube) app.cycleTube(Number(b.getAttribute('data-gun')));
        paintPlayerFight();
      });
    });
    root.querySelectorAll('[data-act="cylTarget"]').forEach(sel => {
      sel.addEventListener('change', () => {
        const row = sel.closest('.cylinder-row');
        const gunBtn = row && row.querySelector('[data-act="playerReload"], [data-act="playerChamber"]');
        const wid = gunBtn ? (gunBtn.getAttribute('data-wid') || gunBtn.getAttribute('data-id') || '') : '';
        state.rowTargets = state.rowTargets || {};
        if (wid) state.rowTargets[wid] = sel.value;
        state.playerTarget = sel.value;
        state.aimBlank = !sel.value || sel.value === FREE_SHOT;
        state.lastAimId = state.aimBlank ? "" : sel.value;
        if (host.setSheetTarget) host.setSheetTarget(sel.value);
        paintPlayerFight();
        requestDraw();
      });
    });
    root.querySelectorAll('[data-act="n62Target"]').forEach(sel => {
      sel.addEventListener('change', () => {
        state.playerTarget = sel.value;
        state.aimBlank = !sel.value || sel.value === FREE_SHOT;
        state.lastAimId = state.aimBlank ? "" : sel.value;
        if (host.setSheetTarget) host.setSheetTarget(sel.value);
        paintPlayerFight();
        requestDraw();
      });
    });
    writePanelScroll(panel, keep);
    schedulePanelScroll(panel, keep);
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
      requestAnimationFrame(() => {
        try { resize(); } catch (e) {}
        try { placeCommandMenu(); } catch (e2) {}
      });
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
      if (n62OnClick(e, () => renderDrawer())) return;
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
  function drawerHeadHtml(title, kind, opts) {
    opts = opts || {};
    const kindHtml = kind ? ' <span class="' + (opts.gear ? 'n62-pill' : 'ssm-kind') + '">' + esc(kind) + '</span>' : '';
    const gear = opts.gear ? '<button type="button" data-act="n62Gear" class="n62-gear" title="Link, lights, darkvision, show range">⚙</button>' : '';
    return '<div class="ssm-drawer-head">' +
      '<button type="button" data-act="drawerCollapse" aria-expanded="true" title="Collapse card"><span class="ssm-dock-label">' + esc(title || 'Card') + '</span> <span data-act="drawerCaret" aria-hidden="true">▸</span></button>' +
      '<b>' + esc(title || 'Card') + '</b>' + kindHtml + gear +
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
  /* 0.3.228: token drawer and player card. innerHTML rebuilds the scrolling
     body (and Chrome drops scroll when the focused row is removed). Remember
     both the card and the body, then put that scroll back after the paint. */
  function readPanelScroll(root) {
    if (!root || !root.querySelector) return null;
    const body = root.querySelector('.ssm-drawer-body, .ssm-card-body');
    const live = {
      rootTop: root.scrollTop || 0,
      rootLeft: root.scrollLeft || 0,
      bodyTop: body ? (body.scrollTop || 0) : 0,
      bodyLeft: body ? (body.scrollLeft || 0) : 0
    };
    /* A second pick in the same frame can land after the browser has already
       zeroed the scroller and before the frame restore. Keep the scroll we
       meant to put back, unless the user has moved to a new offset. */
    const pending = root._panelScrollKeep;
    if (!pending) return live;
    return {
      rootTop: live.rootTop || pending.rootTop || 0,
      rootLeft: live.rootLeft || pending.rootLeft || 0,
      bodyTop: live.bodyTop || pending.bodyTop || 0,
      bodyLeft: live.bodyLeft || pending.bodyLeft || 0
    };
  }
  function writePanelScroll(root, keep) {
    if (!root || !keep) return;
    if (root.scrollTop !== keep.rootTop) root.scrollTop = keep.rootTop;
    if (keep.rootLeft && root.scrollLeft !== keep.rootLeft) root.scrollLeft = keep.rootLeft;
    const body = root.querySelector('.ssm-drawer-body, .ssm-card-body');
    if (!body) return;
    if (body.scrollTop !== keep.bodyTop) body.scrollTop = keep.bodyTop;
    if (keep.bodyLeft && body.scrollLeft !== keep.bodyLeft) body.scrollLeft = keep.bodyLeft;
  }
  function releasePanelFocus(root) {
    const active = document.activeElement;
    if (!active || !root || !root.contains || !root.contains(active)) return;
    const tag = active.tagName;
    if (tag !== 'BUTTON' && tag !== 'SELECT' && tag !== 'A') return;
    try { active.blur(); } catch (e) {}
  }
  function schedulePanelScroll(root, keep) {
    if (!root || !keep) return;
    root._panelScrollKeep = keep;
    if (typeof requestAnimationFrame !== 'function') {
      root._panelScrollKeep = null;
      return;
    }
    const gen = (root._panelScrollGen = (root._panelScrollGen || 0) + 1);
    requestAnimationFrame(() => {
      if (root._panelScrollGen !== gen) return;
      writePanelScroll(root, keep);
      if (root._panelScrollGen === gen) root._panelScrollKeep = null;
    });
  }
  function renderDrawer() {
    if (role !== 'dm' || !state.drawerOpen) return;
    const panel = q('drawer');
    const keep = readPanelScroll(panel);
    releasePanelFocus(panel);
    const done = () => {
      const next = q('drawer');
      writePanelScroll(next, keep);
      schedulePanelScroll(next, keep);
    };
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
    d.classList.remove('n62');
    const tokenId = state.drawerTokenId;
    const partyTok = state.tokens.find(t => t && t.id === tokenId && isPartyToken(t));
    if (partyTok) {
      d.innerHTML = drawerHeadHtml(partyTok.label || 'Party', 'story') +
        '<div class="ssm-drawer-body">' +
        '<p class="ssm-tactics">Story marker for the whole party on this map. It has no HP, and it does not join the fight. Drag moves only this marker.</p>' +
        '<label>Name <input data-act="partyName" maxlength="16" value="' + esc(partyTok.label || 'Party') + '" aria-label="Party token name"></label>' +
        '<div class="ssm-row"><button type="button" data-act="partyDelete">Remove party token</button></div>' +
        '</div>';
      const c = d.querySelector('[data-act="drawerClose"]');
      if (c) c.addEventListener('click', closeDrawer);
      const nameBox = d.querySelector('[data-act="partyName"]');
      if (nameBox) nameBox.addEventListener('change', () => { renamePartyToken(nameBox.value); });
      const del = d.querySelector('[data-act="partyDelete"]');
      if (del) del.addEventListener('click', () => { removePartyToken(); closeDrawer(); });
      syncDockChrome(d);
      done();
      return;
    }
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
      syncDockChrome(d);
      done();
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
        '<label class="ssm-section" for="ssm-link-pick">Link to…</label>' +
        '<select data-act="linkPick" id="ssm-link-pick" aria-label="Link to…">' +
        '<option value="">Link to…</option>' +
        group('Current players', players) +
        group('In this fight', enemies) +
        beasts +
        group('Custom', option('custom', custom)) +
        '</select>' +
        '<p class="ssm-tactics">Players can be laid out before a fight. A bestiary or custom enemy is added on the Fight tab and linked here.</p>' +
        lightDrawerHtml(bare) +
        bombToolsHtml(bare) +
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
      done();
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
    const creatureIds = (targetPack.options || []).map(o => o && o.id).filter(id => id && id !== FREE_SHOT);
    const explicitBlank = state.rangeTargetId === NO_TARGET;
    const explicitFree = state.rangeTargetId === FREE_SHOT;
    const remembered = explicitBlank || explicitFree ? "" : (state.rangeTargetId || targetPack.selected || "");
    const aimId = settleAim(remembered, creatureIds, explicitBlank, explicitFree);
    if (!explicitBlank && !explicitFree && aimId && aimId !== FREE_SHOT) state.rangeTargetId = aimId;
    else if (aimId === FREE_SHOT && !explicitBlank) state.rangeTargetId = FREE_SHOT;
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
    const shoveGate = (() => {
      const Shove = window.SSDNSShove;
      if (role === 'dm' && window.SSDNSMapFight && typeof window.SSDNSMapFight.shoveGate === 'function') {
        return window.SSDNSMapFight.shoveGate({
          tokenId: tokenId,
          combatantId: tokenCombatant(tokenId),
          targetTokenId: aimTok ? aimTok.id : '',
          targetCombatantId: aimId,
          feet: grabFt
        }) || { ok: false, reason: 'Pick a creature within reach.' };
      }
      const opt = document.querySelector('#atkTarget') && document.querySelector('#atkTarget').selectedOptions && document.querySelector('#atkTarget').selectedOptions[0];
      const targetSize = (opt && opt.getAttribute('data-creature-size')) || 'Medium';
      if (!Shove) return { ok: false, reason: 'Shove isn\'t loaded' };
      if (!aimId && !(opt && opt.value && opt.value !== '__free')) return { ok: false, reason: 'Pick a creature to shove.' };
      return Shove.gate({
        actorSize: (card && card.creatureSize) || 'Medium',
        targetSize: targetSize,
        feet: grabFt,
        reach: (card && card.reachFeet) || 5
      });
    })();
    const shoveAttr = (shoveGate.ok ? '' : ' disabled') + ' title="' + esc(shoveGate.reason || 'Shove') + '"';
    const detail = (extra) => Object.assign({ tokenId: tokenId, combatantId: tokenCombatant(tokenId) }, extra || {});
    /* 0.3.72: off-hand flag for the next PC weapon shot the DM sends (one shot, then it clears) */
    const shotDetail = (extra) => detail(Object.assign(state.drawerOffhand ? { offhand: true } : (state.drawerFan ? { fan: true } : {}), extra || {}));
    const noHpPool = card.noHpPool === true;
    const haveCur = !noHpPool && hp.cur !== "" && hp.cur != null && isFinite(Number(hp.cur));
    const curHp = haveCur ? Number(hp.cur) : NaN;
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
    d.classList.toggle('n62', !!isPc);
    const n62Bars = weaponBar + targetBar + offhandToggle(isPc && canAct && (card.attacks || []).length) + fanToggle(isPc && canAct && card.pistolero === true && (card.attacks || []).length);
    d.innerHTML = isPc ? n62DmHtml({
      card: card,
      tokenId: tokenId,
      attacks: attacks,
      cylinders: cylinders,
      bars: n62Bars,
      weaponOptions: weaponOptions,
      condOptions: condOptions,
      conds: conds,
      coverRow: coverRow,
      death: deathLine,
      tactics: card.tactics || '',
      markerRow: markerRow,
      actToggle: actToggle,
      bomb: window.SSDNSInteract ? window.SSDNSInteract.bombPanelHtml(state.tokens.find(t => t && t.id === tokenId)) : '',
      pending: pendingBannerHtml(tokenId),
      light: lightDrawerHtml(state.tokens.find(t => t && t.id === tokenId)),
      gear: gearDrawerHtml(card),
      grabAttr: grabAttr,
      shoveAttr: shoveAttr
    }) : (
      drawerHeadHtml(card.name || tokenId, card.kind || '') +
      '<div class="ssm-drawer-body">' +
      lightDrawerHtml(state.tokens.find(t => t && t.id === tokenId)) +
      pendingBannerHtml(tokenId) +
      drawerVitalsHtml(card.ac, hp, speedBit, noHpPool, true) +
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
        '<button type="button" data-act="shoveBtn"' + shoveAttr + '>Shove</button>' +
      '</div>' +
      '<button type="button" data-act="imageBtn">Replace image</button>' +
      bombToolsHtml(state.tokens.find(t => t && t.id === tokenId)) +
      '</div>');
    bindSpellFold(d);
    d.querySelectorAll('details[data-n62-acc]').forEach(box => {
      box.addEventListener('toggle', () => {
        const ui = n62Ensure();
        ui.acc = ui.acc || {};
        ui.acc[box.getAttribute('data-n62-acc') || ''] = !!box.open;
      });
    });
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
          const named = (card.spells || []).find(s => s && (String(s.id) === String(sid) || String(s.name) === String(sid)));
          const label = (named && named.name) || sid || b.textContent;
          const blast = window.SSDNSSpellArea.areaOf(label) || window.SSDNSSpellArea.areaOf(sid) || window.SSDNSSpellArea.areaOf(b.textContent || "");
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
        /* 0.3.67: 'No target' is a real choice; it must not snap back to the fight's default target.
           A creature stays selected across the next attack. Free shot is only kept when they pick it. */
        state.rangeTargetId = sel.value || NO_TARGET;
        state.lastAimId = (!sel.value || sel.value === FREE_SHOT) ? "" : sel.value;
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
    const acBox = d.querySelector('[data-act="enemyAc"]');
    if (acBox) acBox.addEventListener('change', () => {
      const n = parseInt(acBox.value, 10);
      if (!isFinite(n) || n < 0) { acBox.value = card.ac != null ? String(card.ac) : ''; return; }
      emit('drawer:ac', detail({ ac: n }));
    });
    const maxBox = d.querySelector('[data-act="enemyMaxHp"]');
    if (maxBox) maxBox.addEventListener('change', () => {
      const n = parseInt(maxBox.value, 10);
      if (!isFinite(n) || n < 0) { maxBox.value = hp.max != null ? String(hp.max) : ''; return; }
      emit('drawer:maxHp', detail({ maxHp: n }));
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
        const castRow = b.closest('.cylinder-row');
        const castCyl = castRow && castRow.querySelector('[data-act="cylTarget"]');
        const castAim = (castCyl && castCyl.value) || chosenTarget();
        emit('drawer:castgun', detail({
          weaponId: b.getAttribute('data-wid'),
          spell: spell ? spell.value : '',
          slot: slotSel && !slotSel.hidden ? slotSel.value : '',
          targetCombatantId: castAim && castAim !== FREE_SHOT ? castAim : ''
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
    const shoveBtn = d.querySelector('[data-act="shoveBtn"]');
    if (shoveBtn) shoveBtn.addEventListener('click', () => {
      if (shoveBtn.disabled) return;
      if (role === 'player' && window.SSDNSPlaytest && window.SSDNSPlaytest.shove) {
        window.SSDNSPlaytest.shove();
        return;
      }
      emit('drawer:shove', detail({
        targetTokenId: aimTok ? aimTok.id : '',
        targetCombatantId: aimId,
        feet: grabFt
      }));
    });
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
    done();
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
    /* A dusted token must not come back from a status write that landed after the delete.
       The status write itself is allowed while the crumb is still on the token. */
    if (tokenBuried(id) && !(meta && meta.removed) && value != null) {
      dropToken(id);
      if (role === 'dm' && adapter && adapter.remove && !sub) adapter.remove('map/public/tokens/' + id);
      if (role === 'player') state.tokens = Object.values(shared.tokens).filter(t => !t.hidden && !tokenBuried(t.id));
      requestDraw();
      return;
    }
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
      if (role === 'player') state.tokens = Object.values(shared.tokens).filter(t => t && !t.hidden && !tokenBuried(t.id));
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
      if (tokenBuried(tid)) {
        dropToken(tid);
        if (role === 'dm' && adapter && adapter.remove) adapter.remove('map/public/tokens/' + tid);
        if (role === 'player') state.tokens = Object.values(shared.tokens).filter(t => t && !t.hidden && !tokenBuried(t.id));
        requestDraw();
        return;
      }
      shared.tokens[tid] = Object.assign({}, prevTok, next);
      if (role === 'dm' && !state.tokens.some(tok => tok && tok.id === tid)) {
        state.tokens.push(JSON.parse(JSON.stringify(shared.tokens[tid])));
      }
    }
    if (role === 'player') state.tokens = Object.values(shared.tokens).filter(t => t && !t.hidden && !tokenBuried(t.id));
    applySharedToTokens();
    restoreDragPos(keep);
    if (remotePos) refreshRangeSurfaces();
    if (role === 'player') followPlayerScene();
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
          adoptSpellZones(next.spellZones, Number(next.zoneSeq) || 0, { roster: true });
        }
        if (Array.isArray(next.spellEmitters) && sid === activeSceneId() && (!state.spellEmittersLive || (Number(next.lightSeq) || 0) >= (state.lightSeq || 0))) {
          adoptSpellEmitters(next.spellEmitters, Number(next.lightSeq) || 0);
        }
        if (sid === activeSceneId()) syncSightControls();
        if (role === 'player' && state.scene && sid === getPlayerScene() && JSON.stringify(next.meta || null) !== hadMeta) loadSceneImage(sid);
        requestDraw();
      }
    }));
    unsubs.push(adapter.subscribe('map/public/playerScenes', (value) => {
      shared.playerScenes = value || {};
      followPlayerScene();
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
          if (tokenBuried(id)) {
            delete shared.tokens[id];
            state.tokens = state.tokens.filter(t => t && t.id !== id);
            if (adapter && adapter.remove) adapter.remove('map/dm/tokens/' + id);
            requestDraw();
            return;
          }
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
    },
    openWorld: openWorldAsMap
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
    /* A backdrop stays contained. Centering on the token would slide the title off the stage. */
    if (!isBackdropScene() && me) {
      state.view.x = (me.pos.x + 0.5) * px;
      state.view.y = (me.pos.y + 0.5) * px;
    } else if (!isBackdropScene()) {
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

/* Forced move (Thunderwave and the same hook later). Slides `feet` away from fromId.
   Stops short of a wall or the map edge. Does not ask for an opportunity attack:
   voluntary steps go through leaveReachPlan; this write does not. spec.forced defaults on. */
function shoveToken(id, spec) {
  spec = spec || {};
  if (role !== "dm") return null;
  const t = tokenByRef(id);
  if (!t || !t.pos) return null;
  const feet = Math.max(0, Number(spec.feet) || 0);
  if (!feet) return null;
  const squares = Math.max(1, Math.round(feet / 5));
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
  if (spec.dir === "pull") { dx = -dx; dy = -dy; }
  const M = moveApi();
  const step = M && M.pushStep ? M.pushStep(dx, dy) : {
    x: Math.abs(dx) < 1e-6 ? 0 : (dx > 0 ? 1 : -1),
    y: Math.abs(dy) < 1e-6 ? 0 : (dy > 0 ? 1 : -1)
  };
  const origin = { x: t.pos.x, y: t.pos.y };
  if (!step.x && !step.y) return { from: origin, to: origin, moved: false, forced: true, squares: 0 };
  const grid = (state.scene && state.scene.grid) || null;
  const crosses = (a, b) => crossesWall(a.x, a.y, b.x, b.y);
  let destX = origin.x;
  let destY = origin.y;
  let walked = 0;
  if (M && M.forcedDest) {
    const landed = M.forcedDest(origin, step, squares, size, crosses, grid);
    destX = landed.x;
    destY = landed.y;
    walked = landed.squares || 0;
  } else {
    for (let i = 0; i < squares; i++) {
      const nx = destX + (step.x || 0);
      const ny = destY + (step.y || 0);
      const blocked = size > 1
        ? largeSlideBlocked({ x: destX, y: destY }, { x: nx, y: ny }, size)
        : crossesWall(destX + size / 2, destY + size / 2, nx + size / 2, ny + size / 2);
      if (blocked) break;
      destX = nx;
      destY = ny;
      walked += 1;
    }
  }
  if (spec.dir === "pull" && fromTok && fromTok.pos && walked > 0) {
    const overlap = Math.abs(destX - fromTok.pos.x) < 1 && Math.abs(destY - fromTok.pos.y) < 1;
    if (overlap) {
      destX -= step.x || 0;
      destY -= step.y || 0;
      walked -= 1;
    }
  }
  const dest = { x: destX, y: destY };
  if (dest.x === origin.x && dest.y === origin.y) return { from: origin, to: dest, moved: false, forced: true, squares: 0 };
  t.pos = { x: dest.x, y: dest.y };
  if (shared.tokens[t.id]) shared.tokens[t.id].pos = { x: dest.x, y: dest.y };
  startSlide(t.id, [origin, dest]);
  saveToken(t.id);
  draw();
  return { from: origin, to: dest, moved: true, forced: spec.forced !== false, squares: walked };
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
function applyZoneTickFeed(row) {
  if (!row || row.event !== "zone-tick" || role !== "dm") return;
  if (row.from && row.from === uid) return;
  const ticks = Array.isArray(row.ticks) ? row.ticks : [];
  if (!ticks.length) return;
  try {
    window.dispatchEvent(new CustomEvent("ssdns-zone-tick", {
      detail: {
        ticks: ticks,
        tokenId: row.tokenId || row.combatantId || "",
        ownerUid: row.ownerUid || "",
        combatantId: row.combatantId || ""
      }
    }));
  } catch (e) {}
}
window.addEventListener("ssdns-light-dismiss", (e) => {
  const key = String((e && e.detail && e.detail.key) || "").replace(/^spell:/, "");
  if (!key) return;
  dropEmittersWhere(em => em.key === key && (!em.casterUid || em.casterUid === uid || em.casterId === uid || (tokenByRef(em.casterId) && tokenByRef(em.casterId).ownerUid === uid)));
  const catalog = key.indexOf("spell:") === 0 ? key : ("spell:" + key);
  const bare = key.replace(/^spell:/, "");
  const who = String((e.detail && e.detail.casterId) || "");
  (state.tokens || []).forEach(t => {
    if (!t || !Array.isArray(t.lights)) return;
    if (who) {
      if (t.ownerUid !== who && t.combatantId !== who && t.id !== who) return;
    } else if (t.ownerUid !== uid) return;
    const next = t.lights.filter(l => {
      if (!l) return false;
      const id = String(l.id || l.catalogId || "");
      const name = String(l.name || "").toLowerCase();
      if (id === catalog || id === bare || id === key) return false;
      if (bare === "fire-shield" && /fire shield/.test(name)) return false;
      if (bare === "sunbeam" && /sunbeam/.test(name)) return false;
      return true;
    });
    if (next.length === t.lights.length) return;
    t.lights = next;
    t._lightSig = "";
    const copy = shared.tokens && shared.tokens[t.id];
    if (copy) copy.lights = next.map(l => Object.assign({}, l));
    if (role === "dm") saveToken(t.id);
  });
  requestDraw();
});
window.addEventListener("ssdns-conc-end", (e) => {
  const detail = (e && e.detail) || {};
  const L = window.SSDNSLighting;
  if (L && L.dropConcEmitters) {
    const dropped = L.dropConcEmitters(spellEmitterList(), detail.casterId || "", detail.spell || "");
    if (dropped.removed && dropped.removed.length) commitEmitters(dropped.emitters);
  }
  if (!L || !L.dropConcDarkness) return;
  const dark = L.dropConcDarkness(spellZoneList(), detail.casterId || "", detail.spell || "");
  if (dark.removed && dark.removed.length) {
    setSpellZones(dark.zones, {});
    toast((detail.spell || "Darkness") + " ends.");
  }
});
window.addEventListener("ssdns-spell-light", (e) => {
  const d = (e && e.detail) || {};
  if (d.action !== "borrow") return;
  const L = window.SSDNSLighting;
  const spec = L && L.emitter ? L.emitter(d.key || d.name) : null;
  if (!spec) return;
  const tok = tokenByRef(d.followId);
  const at = tok && tok.pos ? { x: tok.pos.x + (tok.size || 1) / 2, y: tok.pos.y + (tok.size || 1) / 2 } : { x: 0, y: 0 };
  storePointLight(spec, at, (tok && tok.id) || d.followId || "", {
    casterId: d.casterId || "", casterUid: d.casterUid || d.casterId || "", casterName: d.casterName || ""
  });
});
attachInteract();
return {
  destroy,
  syncCombatants,
  combatStingerPlan: planCombatStinger,
  showCombatStinger: function (card) { paintStinger(card || { kind: "init" }); },
  setChat,
  pushFeed,
  requestDraw,
  relayout,
  noteLootForce,
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
  placePartyToken,
  movePartyToken,
  renamePartyToken,
  removePartyToken,
  mayDrag: function (id) { return canDrag(tokenByRef(id)); },
  ensureDefaultScene: ensureDefaultScene,
  maps: function () { return libraryApi(); },
  placeLinkedToken,
  pinLootChest,
  pinWeaponDrop,
  tokenPos,
  focusLootChest,
  setTool,
  removeToken: function (id) { removeMapTokens([id], { silent: true }); },
  dropTokenKeepRow: function (id) { return dropTokenKeepRow(id); },
  applyLink,
  patchToken,
  tokenForPlayer,
  hasToken,
  releaseToken,
  armAttack,
  placeBlast,
  aimSpellPiece,
  moveSpellPiece,
  cancelBlast,
  tokensInBlast,
  shoveToken,
  setTokenHidden,
  setSpellZones: setSpellZones,
  spellZones: function () { return spellZoneList(); },
  placeSpellLight: placeSpellLight,
  cancelSpellLight: cancelLightCast,
  undoSpellLight: undoSpellLight,
  spellEmitters: function () { return spellEmitterList(); },
  clearSpellZones: function (opts) { return clearSpellGrid(opts || {}); },
  turnKey: function () { return zoneTurnKey(); },
  tokenSnapshot: function (id) { return tokenSnapshot(id); },
  tokenLink: function (id) {
    const t = tokenByRef(id);
    if (!t) return null;
    return { tokenId: t.id, combatantId: t.combatantId || "", ownerUid: t.ownerUid || "", name: t.name || t.label || "" };
  },
  /* fog-aware targeting */
  canPlayerSee: function (viewerUid, targetId) { return canPlayerSee(viewerUid, targetId); },
  /* L0225/L0226: live square (not stored) and the light stack at a grid point. */
  squareShown: function (gx, gy, viewerUid) {
    return squareShown(gx, gy, sightFor(viewerUid || uid));
  },
  lightAt: function (gx, gy, viewerUid) {
    return lightLevelAt(gx, gy, sightFor(viewerUid || uid));
  },
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
    if (spec.id && fxAlready(spec.id)) return null;
    const started = startFx(spec, { local: true });
    if (started && spec.id) fxRemember(spec.id);
    return started;
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
        hidden: !!t.hidden, sceneId: t.sceneId || '', ownerUid: t.ownerUid || '',
        story: isPartyToken(t), noInit: !!t.noInit, notTargetable: !!t.notTargetable, noHpPool: !!t.noHpPool,
        controlledBy: (t.controlledBy || []).slice(), spellPiece: t.spellPiece || '', zoneId: t.zoneId || '',
        budgetLeft: t.budgetLeft != null ? t.budgetLeft : null, image: t.image || '',
        screen: { x1: a.x, y1: a.y, x2: b.x, y2: b.y } };
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

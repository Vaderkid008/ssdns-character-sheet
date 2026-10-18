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
window.SSDNSMap = { create(opts) {
  const el = opts.el;
  if (!el) throw new Error('SSDNSMap: el required');
  const role = opts.role === 'dm' ? 'dm' : 'player';
  el.classList.add(role === 'player' ? 'ssdns-role-player' : 'ssdns-role-dm');
  const uid = opts.uid;
  if (!uid) throw new Error('SSDNSMap: uid required');
  const adapter = opts.adapter;
  const host = opts.host || {};
  const options = opts.options || {};
  if (!options.scene) throw new Error('SSDNSMap: options.scene required');
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
    return {
      id: t.id,
      pos: t.pos ? { x: t.pos.x, y: t.pos.y } : { x: 0, y: 0 },
      color: t.color || '', torch: !!t.torch, status: t.status || '',
      conditions: t.conditions ? [...t.conditions] : [],
      sceneId: t.sceneId || 'scn_dustyspur01', image: t.image || '',
      veil: !!t.veil,
      ownerUid: t.ownerUid || '', controlledBy: t.controlledBy || [],
      ownerCanMove: t.ownerCanMove !== false, locked: !!t.locked,
      label: t.label || t.name || '', size: t.size || 1, name: t.name || ''
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
  }
  function saveScene(sceneId) {
    if (role !== 'dm') return;
    const sid = sceneId || (state && state.scene && state.scene.id) || 'scn_dustyspur01';
    const data = (shared.scenes && shared.scenes[sid]) || {};
    write('map/public/scenes/' + sid, data);
    write('map/dm/scenes/' + sid, data);
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
      t.status = s.status || '';
      t.conditions = s.conditions ? [...s.conditions] : [];
      t.sceneId = s.sceneId || 'scn_dustyspur01';
      t.image = s.image || t.image || '';
      t.veil = !!s.veil;
      t.sheetId = s.sheetId || t.sheetId || '';
      if (s.ownerUid) t.ownerUid = s.ownerUid;
      if (s.combatantId) t.combatantId = s.combatantId;
      if (s.kind) t.kind = s.kind;
      if (s.name) t.name = s.name;
      if (t.image && !t._img) loadTokenImage(t);
    }
  }
}

// --- map state ---
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
  offline: false,
  snap: true,
  showWalls: true,
  pendingMoves: [],
  gridStrength: 1.0,
  minStrength: 1.0,
  currentTurnId: null,
  showRange: false,
  rangeWeaponId: "",
  rangeChoices: [],
  rangeMoved: {},
  playerTarget: "",
  drawerOpen: false,
  drawerTokenId: null,
  pendingTarget: null,
  role,
  uid,
  chat: [],
  initiative: null
};

const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d');
el.appendChild(canvas);

const toolbar = document.createElement('div');
toolbar.className = 'ssdns-toolbar';
toolbar.innerHTML = `
  <span data-act="roleBadge">${role === 'player' ? 'Player' : role.toUpperCase()}</span>
  <label>Grid <input data-act="strength" type="range" min="1" max="3" step="0.1" value="1"></label>
  <button data-act="helpBtn">?</button>
  <span data-act="zoomLabel">1.00×</span>
  <button data-act="reset">Reset view</button>
  ${role === 'dm' ? `
    <button data-act="fogBtn" class="active">Fog: ON</button>
    <button data-act="showFovBtn" class="active">Show Player FOV: ON</button>
    <button data-act="offlineBtn">Ghost Plan: OFF</button>
    <button data-act="cancelGhostBtn">Cancel plan</button>
    <select data-act="folderSelect" style="background:#3a3228;color:#e8dcc8;border:1px solid #5a4e40;border-radius:4px;padding:2px 4px;">
      <option value="town">Town</option>
      <option value="all">All</option>
    </select>
    <select data-act="sceneSelect" style="background:#3a3228;color:#e8dcc8;border:1px solid #5a4e40;border-radius:4px;padding:2px 4px;"></select>
    <button data-act="myViewBtn">My view</button>
    <button data-act="setFloorBtn">Set floor</button>
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
on(document, 'keydown', e => {
  if (role === 'dm' && e.key === 'Escape' && state.pendingTarget) {
    e.preventDefault();
    state.pendingTarget = null;
    renderDrawer();
    return;
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
  if (e.key === 'Shift' && state.drag && state.drag.token) { dropPin(); return; }
  if (e.key === 'Backspace' && state.drag && state.drag.pins) { e.preventDefault(); popPin(); return; }
  if (e.key.toLowerCase() === 'x' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); recallPath(); }
});
const chatdock = document.createElement('div');
chatdock.className = 'ssdns-chatdock';
chatdock.innerHTML = `<div class="ssdns-chathead"><button type="button" data-act="chatToggle" aria-expanded="true" title="Minimize chat">Chat <span data-act="chatCaret" aria-hidden="true">▾</span> <span data-act="chatBadge" class="ssm-chatbadge" hidden>0</span></button><span data-act="chatFilters"><button type="button" data-chat-filter="all" class="on">All</button><button type="button" data-chat-filter="rolls">Rolls</button><button type="button" data-chat-filter="talk">Talk</button></span><span class="name-mode" role="group" aria-label="Show names as"><button type="button" data-name-mode="character">Character</button><button type="button" data-name-mode="player">Player</button></span><button type="button" data-act="chatPop">Pop out</button><button type="button" data-act="chatWindow" class="ssm-chat-tab">Open in new tab</button><button type="button" data-act="chatDock" hidden>Dock</button></div><p class="ssdns-chatnote" data-act="chatPopNote" hidden></p><div data-act="chatlog"></div><div data-act="chatrow"><input data-act="chatInput" placeholder="Chat or /roll"><button type="button" data-act="chatSend">Send</button></div>`;
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
} catch (e) {}
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
  const unread = state.chatOpen ? 0 : Math.max(0, (state.chat || []).filter(chatBucket).length - state.chatSeen);
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
  if (!row || row.kind === 'sfx') { if (row && host.sfx) host.sfx(row); return; }
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
  state.chat = (rows || []).filter(row => row && row.kind !== 'sfx');
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
function setChatOpen(open) {
  state.chatOpen = !!open;
  if (state.chatOpen) state.chatSeen = (state.chat || []).filter(chatBucket).length;
  try {
    const Equip = window.SSDNSEquip;
    if (Equip && Equip.writeChatOpen) Equip.writeChatOpen(localStorage, role, state.chatOpen);
    else localStorage.setItem(role === 'dm' ? 'ssdns.map.chatOpen.dm' : 'ssdns.map.chatOpen.player', state.chatOpen ? '1' : '0');
  } catch (e) {}
  renderChat();
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
  return (state.chat || []).filter(row => row && row.kind !== 'sfx').map(row => {
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
    send: function (text) {
      const input = q('chatInput');
      if (!input) return;
      input.value = text;
      sendChat();
    },
    onMode: function (open, mode, extra) {
      el.classList.toggle('ssdns-chat-popped', !!open);
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
    <button data-act="dmTorchBtn">Torch</button>
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
  `;
  el.appendChild(rightbar);
} else {
  const card = document.createElement('div');
  card.className = 'ssdns-playercard';
  card.setAttribute('data-act', 'playerCard');
  card.innerHTML = `
    <div class="ssm-card-head" data-act="playerCardHead">
      <b data-act="playerName">My token</b>
      <button type="button" data-act="playerCardMin" aria-label="Minimize">–</button>
    </div>
    <div class="ssm-card-body">
      <div class="ssm-tools">
        <button type="button" data-act="playerPingBtn">Ping</button>
        <button type="button" data-act="playerRulerBtn">Ruler</button>
        <button type="button" data-act="playerGhostBtn">Ghost Plan: OFF</button>
        <button type="button" data-act="playerCancelBtn">Cancel plan</button>
        <button type="button" data-act="playerTorchBtn">Torch: OFF</button>
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
  draw();
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
  const size = token.size || 1;
  const center = worldToScreen((token.pos.x + size / 2) * px, (token.pos.y + size / 2) * px);
  ctx.save();
  (pack.rings || []).forEach(ring => {
    const radius = (ring.feet / 5) * px * state.view.zoom;
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
    const y = center.y - ((token.size || 1) * px * state.view.zoom) / 2 - 8;
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
    const label = loaded + '/' + cap;
    const tw = (ctx.measureText && ctx.measureText(label).width) || 22;
    ctx.fillStyle = 'rgba(20,16,12,0.9)';
    ctx.fillRect(colX - 2, y - 7, 16 + tw + 6, 14);
    paintWeaponIcon(ctx, (row && row.icon) || 'pistol', colX, y - 5, 11);
    ctx.fillStyle = '#e2c56a';
    ctx.font = '11px system-ui';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, colX + 14, y);
    y += rowH;
  });
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
  } else {
    ctx.fillRect(0, size * 0.2, size * 0.7, size * 0.2);
    ctx.fillRect(size * 0.28, size * 0.4, size * 0.16, size * 0.45);
  }
  ctx.restore();
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

  // collect light sources (tokens with torch)
  const lightSources = [];
  for (const t of state.tokens) {
    if (t.torch) {
      lightSources.push({
        x: (t.pos.x + (t.size || 1) / 2) * px,
        y: (t.pos.y + (t.size || 1) / 2) * px,
        radius: 8 // 40 ft
      });
    }
  }

  // player vision: own token + any light sources that reach them
  let visionCenter = null;
  let visionRadiusSq = 2;
  if (role === 'player' && sceneData().fogRevealed === false) {
    const myToken = state.tokens.find(t => t.ownerUid === uid);
    if (myToken) {
      visionCenter = {
        x: (myToken.pos.x + (myToken.size || 1) / 2) * px,
        y: (myToken.pos.y + (myToken.size || 1) / 2) * px
      };
      if (myToken.torch) visionRadiusSq = 8;
    }
  }

  // map image — for players with fog on, only draw inside vision/revealed areas
  if (img) {
    if (role === 'player' && sceneData().fogRevealed === false) {
      // dark base for players
      ctx.fillStyle = '#0a0806';
      ctx.fillRect(0, 0, box.w, box.h);

      if (visionCenter) {
        drawVisible(visionCenter.x, visionCenter.y, visionRadiusSq * px);
      }
      for (const ls of lightSources) {
        drawVisible(ls.x, ls.y, ls.radius * px);
      }

      paintPlayerFog(img, cols, rows, px, box);
    } else if (role === 'player') {
      const topLeft = worldToScreen(0, 0);
      ctx.drawImage(img, topLeft.x, topLeft.y, cols * px * state.view.zoom, rows * px * state.view.zoom);
      paintPlayerFog(img, cols, rows, px, box);
    } else {
      // DM always sees the full map
      const topLeft = worldToScreen(0, 0);
      ctx.drawImage(img, topLeft.x, topLeft.y, cols * px * state.view.zoom, rows * px * state.view.zoom);

      // DM: grey everywhere, then redraw bright map inside each FOV circle
      if (role === 'dm' && state.showPlayerFov && img) {
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(0, 0, box.w, box.h);

        for (const ls of lightSources) {
          drawVisible(ls.x, ls.y, ls.radius * px);
        }
        for (const t of state.tokens) {
          if (t.kind === 'player' && !t.torch) {
            drawVisible((t.pos.x + 0.5) * px, (t.pos.y + 0.5) * px, 2 * px);
          }
        }
      }
    }
  }

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
        ctx.strokeStyle = 'rgba(220,60,60,0.95)';
        ctx.lineWidth = 5;
        ctx.setLineDash([6, 4]);
        ctx.stroke();
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

  // tokens
  for (const t of state.tokens) {
    const isHidden = t.hidden;
    if (isHidden && role !== 'dm') continue;
    if (role === 'player') {
      const myScene = getPlayerScene();
      if ((t.sceneId || 'scn_dustyspur01') !== myScene) continue;
    }

    if (role === 'player') {
      const tcx = (t.pos.x + (t.size || 1) / 2) * px;
      const tcy = (t.pos.y + (t.size || 1) / 2) * px;
      let visible = sceneData().fogRevealed === true;
      if (!visible && visionCenter) {
        const dx = tcx - visionCenter.x;
        const dy = tcy - visionCenter.y;
        if (Math.hypot(dx, dy) <= visionRadiusSq * px) visible = true;
      }
      if (!visible) {
        for (const ls of lightSources) {
          const dx = tcx - ls.x;
          const dy = tcy - ls.y;
          if (Math.hypot(dx, dy) <= ls.radius * px) { visible = true; break; }
        }
      }
      const gx = t.pos.x + (t.size || 1) / 2;
      const gy = t.pos.y + (t.size || 1) / 2;
      (sceneData().fogShapes || []).forEach(shape => {
        if (shapeContains(shape, gx, gy)) visible = shape.op !== 'hide';
      });
      if (!visible) continue;
      if (t.veil && t.ownerUid !== uid) continue;
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

    ctx.beginPath();
    ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(30,25,20,0.85)';
    ctx.fill();
    if (t.image && t._img) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(s.x, s.y, r - 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(t._img, s.x - r, s.y - r, r * 2, r * 2);
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

    let hpCur = null;
    let hpMax = null;
    if (role === 'dm') {
      let card = null;
      try {
        if (host.getCard) card = host.getCard(t.id) || (t.combatantId && host.getCard(t.combatantId)) || (t.ownerUid && host.getCard(t.ownerUid)) || null;
      } catch (e) { card = null; }
      if (card && card.hp && card.hp.max != null && card.hp.cur != null && card.hp.max !== '') {
        hpCur = Number(card.hp.cur);
        hpMax = Number(card.hp.max);
      } else if (t.maxHp) {
        hpCur = Number(t.hp);
        hpMax = Number(t.maxHp);
      }
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

    // condition badges stay inside the token's alpha, so a hidden token stays dim
    if (t.conditions && t.conditions.length) {
      const icons = { unconscious: '💤', paralyzed: '⚡', poisoned: '☠️', stunned: '💫', prone: '⬇' };
      const size = Math.max(28, r * 1.15);
      ctx.font = `${size}px system-ui`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      let badgeX = s.x - ((t.conditions.length - 1) * size * 0.55);
      t.conditions.forEach((c) => {
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.beginPath();
        ctx.arc(badgeX, s.y - r - 6, size * 0.55, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.fillText(icons[c] || '●', badgeX, s.y - r - 6);
        badgeX += size * 1.1;
      });
    }
    ctx.fillStyle = '#e8dcc8';
    ctx.font = `${Math.max(11, r * 0.4)}px system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const nameY = s.y + r + 4;
    ctx.fillText(t.label || t.name.slice(0, 8), s.x, nameY);
    if (state.selected && state.selected.id === t.id && host.rounds) {
      let rows = [];
      try {
        const raw = host.rounds(t);
        if (Array.isArray(raw)) rows = raw;
      } catch (e) { rows = []; }
      if (rows.length) paintAmmoColumn(ctx, s, r, rows);
    }
    ctx.restore();

    // HP bar under the name. DM only — the public token has no HP, and players never see an enemy bar.
    if (role === 'dm' && hpMax) {
      const pct = Math.max(0, Math.min(1, (Number(hpCur) || 0) / hpMax));
      const bw = r * 1.8, bh = 5;
      const barY = nameY + 14;
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
      const s = worldToScreen((m.x + 0.5) * px, (m.y + 0.5) * px);
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
  if (state.fogKind !== 'poly') { state.polyPoints = []; state.polyHover = null; }
  clearToolButtons();
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
  if (wallTool) revealWallLines();
  clearToolButtons();
  ['rulerBtn','pingBtn','wallBtn','delWallBtn','roomBtn','doorBtn','windowBtn'].forEach(id => {
    const b = q(id);
    const toolMap = { rulerBtn: 'ruler', pingBtn: 'ping', wallBtn: 'wall', delWallBtn: 'delwall', roomBtn: 'room', doorBtn: 'door', windowBtn: 'window' };
    if (b && state.tool === toolMap[id]) b.classList.add('active');
  });
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
function isPlain(w) { return !w.open && !w.window && !w.door && !w.shut; }
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
  clean.pos = {
    x: Math.max(0, Math.min(state.scene.grid.cols - 1, src.pos.x + dx)),
    y: Math.max(0, Math.min(state.scene.grid.rows - 1, src.pos.y + dy))
  };
  delete clean._img;
  if (cellTaken(clean.pos.x, clean.pos.y)) {
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
function feetBetween(a, b) {
  if (!a || !b || !a.pos || !b.pos) return null;
  const dx = (a.pos.x + (a.size || 1) / 2) - (b.pos.x + (b.size || 1) / 2);
  const dy = (a.pos.y + (a.size || 1) / 2) - (b.pos.y + (b.size || 1) / 2);
  return Math.round(Math.hypot(dx, dy) * 5);
}
function tokenByRef(id) {
  if (!id) return null;
  return (state.tokens || []).find(t => t && (t.id === id || t.combatantId === id || t.ownerUid === id)) || null;
}
function nearestHostileFeet(shooter) {
  if (!shooter) return null;
  let hostile = null;
  (state.tokens || []).forEach(t => {
    if (!t || t.id === shooter.id || !t.pos) return;
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
    id = state.rangeTargetId || (sel && sel.value) || "";
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
  return window.SSDNSRangeRings.resolve(Object.assign({}, attack, { spell: spell, kind: spell ? 'spell' : (attack.kind || '') }), feetBetween(shooter, tgt), {
    hasTarget: true,
    hostileFeet: nearestHostileFeet(shooter),
    override: role === 'dm' ? (state.rangeOverride || 'auto') : 'auto'
  });
}
function armRange(attack, targetId, shooterId) {
  const verdict = rangeButtonNote(attack, targetId, shooterId);
  if (!verdict || !verdict.apply || !window.SSDNSRangeRings.arm) return verdict;
  window.SSDNSRangeRings.arm(verdict);
  return verdict;
}
function noteOverride(verdict) {
  if (verdict && verdict.log && role === 'dm') emit('chat:send', { text: verdict.log });
}
function disMark(verdict) {
  if (!verdict || verdict.blocked || !verdict.disadvantage) return '';
  return ' <span class="ssm-dis">Disadvantage</span>';
}
function armAttack(attack, targetId, shooterId) {
  const sid = shooterId || (role === 'player' ? uid : '');
  return armRange(attack || {}, targetId, sid);
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
    if (verdict && verdict.blocked) {
      noteOverride(verdict);
      if (window.SSDNSRangeRings && window.SSDNSRangeRings.clear) window.SSDNSRangeRings.clear();
      toast(verdict.button || 'Out of range');
      state.pendingTarget = null;
      renderDrawer();
      return;
    }
    emit('drawer:target', { tokenId: state.pendingTarget.tokenId, weaponId: state.pendingTarget.weaponId || '', spellId: state.pendingTarget.spellId || '', targetTokenId: token.id, combatantId: tokenCombatant(state.pendingTarget.tokenId), targetCombatantId: tokenCombatant(token.id) });
    state.rangeTargetId = token.id;
    state.pendingTarget = null;
    toast('Target set');
    renderDrawer();
    return;
  }
  state.selected = token;
  state.selectedIds = [token.id];
  refreshSelectedPanel();
  if (role === 'dm') openDrawer(token.id);
  draw();
}
function playerTokenId(pid) {
  return 'ply_' + String(pid || '').replace(/[^A-Za-z0-9_-]/g, '_');
}
let tokensReady = false;
let viewReady = false;
let partySynced = false;
function adoptSharedTokens() {
  Object.keys(shared.tokens || {}).forEach(id => {
    const src = shared.tokens[id];
    if (!src || state.tokens.some(t => t && t.id === id)) return;
    state.tokens.push(JSON.parse(JSON.stringify(src)));
  });
  applySharedToTokens();
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
  const token = {
    id: id,
    kind: spec.kind || 'npc',
    name: spec.name || 'Token',
    label: String(spec.label || spec.name || 'Tok').slice(0, 16),
    ownerUid: spec.ownerUid || '',
    controlledBy: spec.controlledBy ? spec.controlledBy.slice() : [],
    ownerCanMove: spec.ownerCanMove !== false,
    size: 1,
    color: spec.color || '',
    status: '',
    conditions: [],
    locked: false,
    hidden: false,
    pos: {
      x: Math.max(0, Math.min((grid.cols || 30) - 1, spot.x)),
      y: Math.max(0, Math.min((grid.rows || 20) - 1, spot.y))
    },
    sceneId: (state.scene && state.scene.id) || 'scn_dustyspur01',
    image: spec.image || '',
    sheetId: spec.sheetId || (spec.kind === 'player' ? owner : ''),
    combatantId: spec.combatantId || (spec.kind === 'player' ? owner : '')
  };
  state.tokens.push(token);
  shared.tokens[id] = JSON.parse(JSON.stringify(token));
  emit('combatant:add', { tokenId: id });
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
function addPlayerToken() {
  const who = q('grantUid') && q('grantUid').value;
  if (!who) { toast('No player to add'); return; }
  delete dismissedMap()[who];
  if (adapter && adapter.remove) adapter.remove('map/dm/dismissed/' + who);
  if (canonicalPlayerToken(who) || tokenForOwner(who)) { toast('That player already has a token'); return; }
  const p = partyList().find(x => (x.uid || x.id) === who) || {};
  const name = p.name || p.label || who;
  const cell = viewCenterCell();
  const token = makeToken({
    id: playerTokenId(who),
    kind: 'player',
    name: name,
    label: name,
    ownerUid: who,
    ownerCanMove: true,
    combatantId: who,
    sheetId: who,
    color: '#4a90d9',
    pos: cell
  });
  if (!token) return;
  emit('party:sync', { playerId: who, tokenId: token.id });
  selectToken(token);
  toast('Player token added');
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
function commitGhost() {
  state.pendingMoves.forEach(m => {
    const t = state.tokens.find(tok => tok.id === m.id);
    if (!t) return;
    const pts = m.path && m.path.length > 1 ? m.path : [{ x: m.fromX, y: m.fromY }, { x: m.x, y: m.y }];
    startSlide(t.id, pts);
    postSlide(t.id, pts);
  });
  state.pendingMoves = [];
  toast('Moves committed');
}
function cancelGhost() {
  state.pendingMoves = [];
  if (state.drag) state.drag.pins = null;
  toast('Plan cleared');
  draw();
}
function toggleGhost(btn) {
  state.offline = !state.offline;
  if (btn) {
    btn.textContent = state.offline ? 'Ghost Plan: ON' : 'Ghost Plan: OFF';
    btn.classList.toggle('active', state.offline);
  }
  applyCursor();
  if (!state.offline && state.pendingMoves.length) {
    state.pendingMoves.forEach(m => {
      const t = state.tokens.find(tok => tok.id === m.id);
      if (!t) return;
      const pts = m.path && m.path.length > 1 ? m.path : [{ x: m.fromX, y: m.fromY }, { x: m.x, y: m.y }];
      startSlide(t.id, pts);
      postSlide(t.id, pts);
    });
    state.pendingMoves = [];
    toast('Moves committed');
  }
  draw();
}

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
function canDrag(token) {
  if (!token) return false;
  if (token.locked) return false;
  if (!canControl(token)) return false;
  return true;
}
function onPointerDown(e) {
  pointers.set(e.pointerId, Object.assign({ t: Date.now() }, localXY(e)));
  if (pointers.size === 1) {
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
      if (e.button === 2) {
        if (wall.door || wall.window || len <= 1.5) {
          wall.open = false; wall.window = false; wall.shut = false; wall.door = false;
          mergePlainWalls();
          toast('Door removed, wall restored');
        }
      } else if (wall.door || (len <= 1.5 && wall.open)) {
        wall.open = !wall.open;
        wall.door = true;
        toast(wall.open ? 'Door opened' : 'Door closed');
      } else if (len > 1.5) {
        const segs = cutFeature(wall, w.x / px, w.y / px, { open: false, door: true });
        sceneData().walls.splice(best, 1, ...segs);
        toast('Door cut (1 square)');
      }
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
    const w = pointerWorld(e);
    const hit = hitTest(w.x, w.y);
    if (hit && state.pendingTarget && role === 'dm') {
      selectToken(hit);
      return;
    }
    if (hit && (canDrag(hit) || (role === 'dm' && hit.locked))) {
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
      state.drag = { token: hit, ox: hit.pos.x, oy: hit.pos.y, sx: e.clientX, sy: e.clientY, starts: {} };
      state.selectedIds.forEach(id => {
        const t = state.tokens.find(tok => tok.id === id);
        if (t) state.drag.starts[id] = { x: t.pos.x, y: t.pos.y };
      });
      if (role === 'dm') openDrawer(hit.id);
    } else if (hit && role === 'player') {
      if (hit.locked) toast('That token is locked');
      else toast('No permission to move that token');
    } else {
      if (e.button === 1 || e.altKey) {
        state.drag = { pan: true, sx: e.clientX, sy: e.clientY, vx: state.view.x, vy: state.view.y };
      } else if (role === 'dm' && !state.tool) {
        const selPt = localXY(e);
        state.drag = { select: true, sx: selPt.x, sy: selPt.y };
      } else {
        state.drag = { pan: true, sx: e.clientX, sy: e.clientY, vx: state.view.x, vy: state.view.y };
      }
    }
  }
  e.preventDefault();
}
function onPointerMove(e) {
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
      ids.forEach(id => {
        const t = state.tokens.find(tok => tok.id === id);
        if (!t) return;
        const start = state.drag.starts ? state.drag.starts[id] : { x: t.pos.x, y: t.pos.y };
        if (!state.drag.starts) state.drag.starts = {};
        if (!state.drag.starts[id]) state.drag.starts[id] = { x: t.pos.x - dx, y: t.pos.y - dy };
        const newX = Math.max(0, Math.min(state.scene.grid.cols - 1, state.drag.starts[id].x + dx));
        const newY = Math.max(0, Math.min(state.scene.grid.rows - 1, state.drag.starts[id].y + dy));
        const allowStack = role === 'dm' && e.shiftKey;
        if (!allowStack && cellTaken(newX, newY, state.drag.starts)) {
          state.drag.blocked = true;
        } else if (!crossesWall(t.pos.x + 0.5, t.pos.y + 0.5, newX + 0.5, newY + 0.5)) {
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
  const wasTokenDrag = !!(state.drag && state.drag.token);
  if (wasTokenDrag) clearStreamTimer();
  if (state.drag && state.drag.token && state.drag.blocked && !(role === 'dm' && e.shiftKey)) {
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
    ids.forEach(id => saveToken(id));
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
function drawVisible(cx, cy, radius) {
  const pts = raycastVisible(cx, cy, radius);
  if (!pts.length) return;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.clip();
  const topLeft = worldToScreen(0, 0);
  const { cols, rows, px } = state.scene.grid;
  ctx.drawImage(state.scene._img, topLeft.x, topLeft.y, cols * px * state.view.zoom, rows * px * state.view.zoom);
  ctx.restore();
}
function crossesWall(x1, y1, x2, y2) {
  const walls = sceneData().walls;
  if (!walls.length) return false;
  for (const w of walls) {
    if (w.open) continue;
    // simple segment intersection
    const d = (x2 - x1) * (w.y2 - w.y1) - (y2 - y1) * (w.x2 - w.x1);
    if (Math.abs(d) < 0.0001) continue;
    const t = ((w.x1 - x1) * (w.y2 - w.y1) - (w.y1 - y1) * (w.x2 - w.x1)) / d;
    const u = ((w.x1 - x1) * (y2 - y1) - (w.y1 - y1) * (x2 - x1)) / d;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return true;
  }
  return false;
}
function tokenCombatant(tokenId) {
  const token = state.tokens.find(t => t.id === tokenId);
  return (token && (token.combatantId || token.sheetId)) || tokenId;
}
function cellTaken(x, y, ignore) {
  const skip = ignore || {};
  return state.tokens.some(t => {
    if (!t || skip[t.id]) return false;
    if (role !== 'dm' && t.hidden) return false;
    const size = t.size || 1;
    return x >= t.pos.x && x < t.pos.x + size && y >= t.pos.y && y < t.pos.y + size;
  });
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
function placeLinkedToken(spec) {
  if (role !== 'dm' || !state.scene) return null;
  spec = spec || {};
  const spot = nextFreeCell();
  if (!spot) { toast('No open square'); return null; }
  return makeToken(Object.assign({}, spec, { pos: spot, kind: spec.kind || 'npc' }));
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
    t.ownerUid = patch.ownerUid;
    const pre = shared.tokens[t.id];
    if (pre) pre.ownerUid = patch.ownerUid;
    const canon = canonicalPlayerToken(patch.ownerUid);
    if (canon) {
      t = canon;
      tokenId = canon.id;
    }
    delete dismissedMap()[patch.ownerUid];
    if (adapter && adapter.remove) adapter.remove('map/dm/dismissed/' + patch.ownerUid);
  }
  if (patch.kind) t.kind = patch.kind;
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
    if (t.hidden && role !== 'dm') continue;
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
on(canvas, 'pointerdown', onPointerDown);
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
<b>Move</b> Drag your token. Walls block the path. Two tokens cannot share a square. The DM holds Shift to stack them.<br>
<b>Middle mouse</b> Pans the map. It does not zoom.<br>
<b>Shift</b> While dragging, drop a pin to turn a corner. Up, Shift, left, Shift, down. Release to slide. Backspace removes the last pin.<br>
<b>X</b> Show the last path for the selected token.<br>
<b>Ghost Plan</b> Plot in private. Turn it off to slide for everyone. Cancel plan drops it.<br>
<b>Ping</b> Click the map. Color matches your token.<br>
<b>Ruler</b> Drag to measure. 1 square = 5 ft.<br>
<b>Torch</b> 40 ft of light. Does not pass walls.<br><br>
${dm ? `<b>DM</b><br>
Ctrl-click or drag a box to select many.<br>
Copy Ctrl+C, Paste Ctrl+V, Delete removes from the turn order.<br>
Door / Window: click a wall. Click again to open or shut. Right-click removes it.<br>
Wall and Room: drag, release to commit.<br>
Walls: OFF hides the lines so you can see the raw map. Walls still block.<br>
Grant / Revoke: pick a player, then a token. Revoke on their own token locks them out. Grant gives it back.<br>
Reveal clears fog. Hide paints fog back. Each has a Box, Square, Poly, or Brush picker, and the button name is the action. Square: click one grid cell, or drag across cells. Each cell erases on its own. A drag is one history step. Poly: click as many corners as you need, then the first point, double-click, or Enter. Erase deletes one shape. Shift-click selects more, then Delete selection removes them together. Undo and Redo walk the fog history.<br>
Show Player FOV greys the rest and brightens their light.<br>
Set floor, then Show to players, to move someone to another map.` : `<b>Player</b><br>
You move your own token, and any the DM has granted you.<br>
My color changes your ring. Ping uses that color. The button stays lit while the tool is on.<br>
Ghost Plan plots in private. Turn it off to slide for everyone.<br>
Fog hides what you cannot see. A torch or your vision opens a circle.`}
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
    const raw = prompt('Paste walls JSON (array of {x1,y1,x2,y2}):');
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
  q('offlineBtn').addEventListener('click', () => toggleGhost(q('offlineBtn')));
  q('cancelGhostBtn').addEventListener('click', cancelGhost);
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
  q('dmTorchBtn').addEventListener('click', () => {
    const targets = state.selectedIds.length ? state.tokens.filter(t => state.selectedIds.includes(t.id)) : (state.selected ? [state.selected] : []);
    if (!targets.length) { toast('Select a token first'); return; }
    targets.forEach(t => {
      t.torch = !t.torch;
      if (shared.tokens[t.id]) shared.tokens[t.id].torch = t.torch;
      saveToken(t.id);
    });
    flashBtn('dmTorchBtn');
    draw();
  });
  q('dmTorchBtn').textContent = 'Torch: OFF';
  q('showFovBtn').addEventListener('click', () => {
    state.showPlayerFov = !state.showPlayerFov;
    q('showFovBtn').textContent = state.showPlayerFov ? 'Show Player FOV: ON' : 'Show Player FOV: OFF';
    q('showFovBtn').classList.toggle('active', state.showPlayerFov);
    draw();
  });
  q('folderSelect').addEventListener('change', fillSceneSelect);
  q('myViewBtn').addEventListener('click', () => {
    const sel = q('sceneSelect');
    state.dmView = sel.value;
    loadSceneImage(state.dmView);
    const sd = sceneData();
    const fogBtn = q('fogBtn');
    if (fogBtn) {
      fogBtn.textContent = sd.fogRevealed ? 'Fog: OFF' : 'Fog: ON';
      fogBtn.classList.toggle('active', !sd.fogRevealed);
    }
    flashBtn('myViewBtn');
    toast('My view: ' + sel.options[sel.selectedIndex].text);
  });
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
  });
  q('showSceneBtn').addEventListener('click', () => {
    postScenes();
    toast('Floors pushed to players');
  });
  q('addTokenBtn').addEventListener('click', () => { addEnemyToken(); flashBtn('addTokenBtn'); });
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
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem('ssdns.playerCard') || 'null'); } catch (e) { saved = null; }
    if (saved && isFinite(saved.x) && isFinite(saved.y)) {
      card.style.left = saved.x + 'px';
      card.style.top = saved.y + 'px';
      card.style.right = 'auto';
    }
    if (saved && saved.min) {
      card.classList.add('min');
      const minBtn = q('playerCardMin');
      if (minBtn) minBtn.textContent = '+';
    }
    function persist() {
      const rect = card.getBoundingClientRect();
      const host = el.getBoundingClientRect();
      try {
        localStorage.setItem('ssdns.playerCard', JSON.stringify({
          x: rect.left - host.left,
          y: rect.top - host.top,
          min: card.classList.contains('min')
        }));
      } catch (e) {}
    }
    const head = q('playerCardHead');
    let drag = null;
    if (head) {
      head.addEventListener('pointerdown', (e) => {
        if (e.target && e.target.closest && e.target.closest('button')) return;
        const rect = card.getBoundingClientRect();
        const hostBox = el.getBoundingClientRect();
        drag = { dx: e.clientX - rect.left, dy: e.clientY - rect.top, host: hostBox };
        card.style.left = (rect.left - hostBox.left) + 'px';
        card.style.top = (rect.top - hostBox.top) + 'px';
        card.style.right = 'auto';
        if (head.setPointerCapture) head.setPointerCapture(e.pointerId);
      });
      head.addEventListener('pointermove', (e) => {
        if (!drag) return;
        card.style.left = Math.max(0, e.clientX - drag.dx - drag.host.left) + 'px';
        card.style.top = Math.max(0, e.clientY - drag.dy - drag.host.top) + 'px';
      });
      const endDrag = () => { if (!drag) return; drag = null; persist(); };
      head.addEventListener('pointerup', endDrag);
      head.addEventListener('pointercancel', endDrag);
    }
    const minBtn = q('playerCardMin');
    if (minBtn) minBtn.addEventListener('click', () => {
      card.classList.toggle('min');
      minBtn.textContent = card.classList.contains('min') ? '+' : '–';
      persist();
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
  q('playerTorchBtn').addEventListener('click', () => {
    const myToken = state.tokens.find(t => t.ownerUid === uid);
    if (!myToken) { toast('No token found'); return; }
    myToken.torch = !myToken.torch;
    if (shared.tokens[myToken.id]) {
      shared.tokens[myToken.id].torch = myToken.torch;
    }
    const b = q('playerTorchBtn');
    b.textContent = myToken.torch ? 'Torch: ON' : 'Torch: OFF';
    b.classList.toggle('active', !!myToken.torch);
    draw();
  });
  q('playerLabel').addEventListener('change', () => {
    const me = state.tokens.find(tok => tok.ownerUid === uid);
    if (!me) return;
    setLabel(me, q('playerLabel').value.trim());
    toast('Label set');
  });
  q('playerGhostBtn').addEventListener('click', () => toggleGhost(q('playerGhostBtn')));
  q('playerCancelBtn').addEventListener('click', () => { cancelGhost(); flashBtn('playerCancelBtn'); });
  q('playerTorchBtn').textContent = 'Torch: OFF';
  renderActions();
  bindRangeUi();
}

// --- scene images ---
const SCENES = [
  { id: 'scn_dustyspur01', name: 'Dusty Spur', folder: 'town', img: 'dusty-spur-saloon_30x20_70px.webp' },
  { id: 'scn_street', name: 'Main Street', folder: 'town', img: 'main-street.webp' },
  { id: 'scn_upstairs', name: 'Upstairs', folder: 'town', img: 'upstairs.webp' }
];
function fillSceneSelect() {
  const folder = q('folderSelect')?.value || 'all';
  const sel = q('sceneSelect');
  if (!sel) return;
  sel.innerHTML = '';
  SCENES.filter(s => folder === 'all' || s.folder === folder).forEach(s => {
    const o = document.createElement('option');
    o.value = s.id;
    o.textContent = s.name;
    sel.appendChild(o);
  });
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
async function loadSceneImage(sceneId) {
  const scene = SCENES.find(s => s.id === sceneId) || SCENES[0];
  const img = new Image();
  img.src = asset(scene.img);
  await img.decode();
  if (state.scene) state.scene._img = img;
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
    state.initiative = initiative || { order: [], turn: 0 };
    const order = state.initiative.order || [];
    const turn = state.initiative.turn || 0;
    state.currentTurnId = order[turn] ? order[turn].id : null;
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
    requestDraw();
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
    strip.hidden = !order.length;
    strip.innerHTML = '';
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
      b.innerHTML = '<span class="chip-face">' + esc(initials) + '</span><span class="chip-name">' + esc(raw) + '</span>';
      if (role === 'dm') {
        b.addEventListener('click', () => {
          const t = state.tokens.find(tok => tok.combatantId === c.id || tok.id === c.id);
          if (t) selectToken(t);
        });
      }
      strip.appendChild(b);
    });
    if (role === 'dm') {
      const next = document.createElement('button');
      next.type = 'button';
      next.className = 'btn btn-primary btn-next';
      next.textContent = 'Next';
      next.addEventListener('click', () => emit('initiative:next', {}));
      strip.appendChild(next);
      const prev = document.createElement('button');
      prev.type = 'button';
      prev.className = 'btn sm';
      prev.textContent = 'Previous';
      prev.addEventListener('click', () => emit('initiative:prev', {}));
      strip.appendChild(prev);
    }
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
        spells.push({ id: a.id, name: name, level: a.level, kind: a.kind || '', damage: a.damage || '', toHit: a.toHit, dc: a.dc });
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
        rows = Array.from(sel.options).map(o => ({ id: o.value, label: o.textContent || o.value }));
      } else {
        rows = (state.tokens || []).filter(t => t && !t.hidden && !(t.ownerUid && t.ownerUid === uid)).map(t => ({ id: t.id, label: t.name || t.label || t.id }));
      }
    }
    const options = [{ id: '', label: 'No target' }];
    rows.forEach(o => {
      if (!o) return;
      const id = o.id != null ? String(o.id) : '';
      if (!id || options.some(x => x.id === id)) return;
      options.push({ id: id, label: o.label || o.name || id });
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
  function runPlayer(id, extra) {
    if (!id) return;
    extra = extra || {};
    const tokenId = state.selected ? state.selected.id : null;
    const targetId = extra.targetId != null ? extra.targetId : ((state.rowTargets && state.rowTargets[id]) || state.playerTarget || '');
    if (String(id).indexOf('gunroll:') === 0 || String(id).indexOf('melee:') === 0 || String(id).indexOf('spell:') === 0 || id === 'pact') {
      const card = playerFightModel();
      const attack = ((card && card.attacks) || []).concat((card && card.spells) || []).find(a => a && a.id === id);
      const verdict = armRange(attack || { id: id }, targetId, uid);
      if (verdict && verdict.blocked) {
        if (window.SSDNSRangeRings && window.SSDNSRangeRings.clear) window.SSDNSRangeRings.clear();
        toast(verdict.button || 'Out of range');
        return;
      }
    }
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
    if (!M.cleanOptions(gun).length) return '';
    let idAttr = '';
    if (act === 'playerClean') {
      const cid = cleanActId(a);
      if (!cid) return '';
      idAttr = ' data-id="' + esc(cid) + '"';
    } else {
      idAttr = ' data-wid="' + esc(a.id || '') + '"';
    }
    return '<button type="button" data-act="' + act + '"' + idAttr + (gun.pendingD4 ? ' disabled' : '') + '>Clean</button>';
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
    const on = !!(a && (a.ruined || a.broken || a.exploded || ammo.ruined || ammo.broken || ammo.exploded));
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
  function reopenControl(a, act) {
    if (!a || !a.muzzleloader || !lockList(a).length) return '';
    const used = !!a.reopenUsed;
    return sideButton(a, act, 'reopen', used ? 'Reopen chamber (used)' : 'Reopen chamber');
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
  function hexCastControl(a, prefix) {
    if (!a || a.calling !== 'hexslinger' || !a.caster) return '';
    const gi = gunIndexOf(a);
    const spells = a.castSpells || [];
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
    return '<span class="ssm-hex" data-gun="' + esc(gi) + '">' +
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
        '<span class="ssm-rounds">' + loaded + '/' + cap + '</span>' + select + lockup + reload + tr + clean + unjam + reopen + extras + '</div>';
    }
    let dots = '';
    const locks = lockList(a);
    for (let k = 0; k < cap; k++) {
      const locked = locks.some(n => Number(n) === k);
      const full = !locked && (flags ? !!flags[k] : k < loaded);
      dots += '<button type="button" class="chamber-dot' + (locked ? ' locked' : (full ? ' full' : '')) + '" data-act="playerChamber" data-wid="' + esc(a.id) + '" data-k="' + k + '" aria-label="' + (locked ? 'Locked chamber ' : 'Chamber ') + (k + 1) + '">' + (locked ? 'X' : '') + '</button>';
    }
    const dotsHtml = cap ? '<span class="chamber-dots">' + dots + '</span>' : '';
    const rounds = cap ? '<span class="ssm-rounds">' + loaded + '/' + cap + '</span>' : '';
    return '<div class="cylinder-row' + crossClass(a) + '"><span class="cyl-name">' + esc(a.name || 'Gun') + '</span>' + dotsHtml + rounds + select + lockup + reload + tr + clean + unjam + reopen + extras + '</div>';
  }
  function paintPlayerFight() {
    const slot = q('actionSlot');
    if (!slot) return;
    const card = playerFightModel();
    const nameEl = q('playerName');
    if (nameEl && card.name) nameEl.textContent = card.name;
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
      return '<option value="' + esc(o.id) + '"' + on + '>' + esc(o.label || 'No target') + '</option>';
    }).join('');
    const attacks = (card.attacks || []).map(a => {
      const rowTarget = (state.rowTargets && state.rowTargets[a.id]) || state.playerTarget || '';
      const verdict = rangeButtonNote(a, rowTarget, uid);
      let text = attackLine(a);
      let off = '';
      if (verdict && verdict.blocked) { text = verdict.button || 'Out of range'; off = ' disabled'; }
      else if (verdict && verdict.button) text = attackLine(a) + ' · ' + verdict.button;
      return '<button type="button" class="ssm-atk" data-act="playerAttack" data-id="' + esc(a.id) + '"' + off + '>' + esc(text) + disMark(verdict) + '</button>';
    }).join('');
    const cylinders = (card.attacks || []).filter(a => (a.ammo && a.ammo.cap) || a.reloadId || a.trId).map(a => {
      const chosen = (state.rowTargets && (state.rowTargets[a.id] || state.rowTargets[a.reloadId])) || state.playerTarget || '';
      const html = playerTargetOptions().map(o => {
        const on = String(o.id) === String(chosen) ? ' selected' : '';
        return '<option value="' + esc(o.id) + '"' + on + '>' + esc(o.label || 'No target') + '</option>';
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
      b.addEventListener('click', () => {
        if (window.SSDNSItems && window.SSDNSItems.useOnSheet) window.SSDNSItems.useOnSheet(b.getAttribute('data-uid'));
      });
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
        const app = appGun();
        if (app && app.loadHexAt) app.loadHexAt(Number(gi), lvl ? lvl.value : 1);
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
  const DM_CARD_KEY = 'ssdns.dmCard';
  let dmCardResize = false;
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
  function readDmCard() {
    try {
      const saved = JSON.parse(localStorage.getItem(DM_CARD_KEY) || 'null');
      if (saved && isFinite(saved.x) && isFinite(saved.y)) return saved;
    } catch (e) {}
    return null;
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
  function saveDmCard(d) {
    const x = parseFloat(d.style.left);
    const y = parseFloat(d.style.top);
    if (!isFinite(x) || !isFinite(y)) return;
    try { localStorage.setItem(DM_CARD_KEY, JSON.stringify({ x: Math.round(x), y: Math.round(y) })); } catch (e) {}
  }
  function placeDmCard(d, pos) {
    if (!d || !pos) return;
    d.classList.add('placed');
    d.style.right = 'auto';
    d.style.bottom = 'auto';
    d.style.left = pos.x + 'px';
    d.style.top = pos.y + 'px';
    clampDmCard(d);
  }
  function resetDmCard(d) {
    if (!d) return;
    d.classList.remove('placed');
    d.style.left = '';
    d.style.top = '';
    d.style.right = '';
    d.style.bottom = '';
    try { localStorage.removeItem(DM_CARD_KEY); } catch (e) {}
  }
  function bindDmCard(d) {
    placeDmCard(d, readDmCard());
    let drag = null;
    on(d, 'pointerdown', (e) => {
      const head = e.target.closest && e.target.closest('.ssm-drawer-head');
      if (!head || !d.contains(head)) return;
      if (e.target.closest && e.target.closest('button, a, input, select, textarea')) return;
      const rect = d.getBoundingClientRect();
      const host = el.getBoundingClientRect();
      const pad = mapPad();
      drag = {
        x0: e.clientX,
        y0: e.clientY,
        left: rect.left - host.left - pad.x,
        top: rect.top - host.top - pad.y,
        host: host,
        pad: pad
      };
      d.classList.add('placed');
      d.style.right = 'auto';
      d.style.bottom = 'auto';
      d.style.left = Math.round(drag.left) + 'px';
      d.style.top = Math.round(drag.top) + 'px';
      if (head.setPointerCapture) head.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    on(d, 'pointermove', (e) => {
      if (!drag) return;
      const limits = cardLimits(d, drag.host, drag.pad);
      const x = Math.min(Math.max(0, drag.left + (e.clientX - drag.x0)), limits.maxX);
      const y = Math.min(Math.max(0, drag.top + (e.clientY - drag.y0)), limits.maxY);
      d.style.left = Math.round(x) + 'px';
      d.style.top = Math.round(y) + 'px';
    });
    const endDrag = () => {
      if (!drag) return;
      drag = null;
      clampDmCard(d);
      saveDmCard(d);
    };
    on(d, 'pointerup', endDrag);
    on(d, 'pointercancel', endDrag);
    on(d, 'click', (e) => {
      const btn = e.target.closest && e.target.closest('[data-act="drawerReset"]');
      if (!btn || !d.contains(btn)) return;
      e.preventDefault();
      resetDmCard(d);
    });
    if (!dmCardResize) {
      dmCardResize = true;
      on(window, 'resize', () => {
        const live = q('drawer');
        if (live && live.classList.contains('placed')) clampDmCard(live);
      });
    }
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
    const card = lookupCard(tokenId);
    if (!card) {
      const choices = (typeof host.linkChoices === 'function' && host.linkChoices()) || {};
      const option = (value, label) => '<option value="' + esc(value) + '">' + esc(label) + '</option>';
      const group = (label, inner) => inner ? '<optgroup label="' + esc(label) + '">' + inner + '</optgroup>' : '';
      const players = (choices.players || []).map(p => option('player:' + (p.id || ''), p.label || p.name || p.id)).join('');
      const enemies = (choices.enemies || []).map(row => option('enemy:' + (row.id || ''), row.label || row.name || row.id)).join('');
      const beasts = (choices.bestiary || []).map(g => group(g.label || 'Bestiary', (g.options || []).map(b => option('beast:' + (b.id || ''), b.name || b.id)).join(''))).join('');
      const custom = choices.customLabel || 'New custom enemy (Bandit)';
      d.innerHTML = '<div class="ssm-drawer-head"><b>No card linked</b><button type="button" data-act="drawerReset" title="Reset card position" aria-label="Reset card position">Reset</button><button type="button" data-act="drawerClose">×</button></div>' +
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
    const aimId = state.rangeTargetId || targetPack.selected || '';
    const targetOptions = (targetPack.options || []).map(o => {
      const id = o && (o.id || '');
      const on = id && id === aimId ? ' selected' : '';
      return '<option value="' + esc(id) + '"' + on + '>' + esc((o && (o.label || o.name)) || id) + '</option>';
    }).join('') || '<option value="">No targets</option>';
    const attacks = (card.attacks || []).map(a => {
      const ammo = a.ammo ? ' [' + (a.ammo.loaded != null ? a.ammo.loaded : '—') + '/' + (a.ammo.cap != null ? a.ammo.cap : '—') + ']' : '';
      const base = (a.name || a.id) + ' +' + (a.toHit != null && a.toHit !== '' ? a.toHit : 0) + ' ' + (a.damage || '') + ammo;
      const verdict = rangeButtonNote(a, aimId, tokenId);
      let text = base;
      let off = canAct ? '' : 'disabled';
      if (verdict && verdict.blocked) { text = verdict.button || 'Out of range'; off = 'disabled'; }
      else if (verdict && verdict.button) text = base + ' · ' + verdict.button;
      return '<button type="button" class="ssm-atk" data-wid="' + esc(a.id) + '" ' + off + '>' + esc(text) + disMark(verdict) + '</button>';
    }).join('');
    const cylinders = (card.attacks || []).filter(a => a && a.ammo && a.ammo.cap).map(a => {
      const cap = Number(a.ammo.cap) || 0;
      const loaded = Number(a.ammo.loaded) || 0;
      const flags = Array.isArray(a.ammo.chambers) ? a.ammo.chambers : null;
      const rowClean = (isPc && canAct) ? cleanControl(a, 'rowClean') : '';
      const rowUnjam = (isPc && canAct) ? unjamControl(a, 'rowUnjam') : '';
      const rowReopen = (isPc && canAct) ? reopenControl(a, 'rowReopen') : '';
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
        const rowExtras = (isPc && canAct) ? gunExtras(a, 'row') : '';
        return '<div class="cylinder-row cylinder-graphic' + crossClass(a) + '"><span class="cyl-name">' + esc(a.name || 'Gun') + '</span>' + picture + '<span class="ssm-rounds">' + loaded + '/' + cap + '</span><select data-act="cylTarget" aria-label="Target">' + targetOptions + '</select>' + lockupMark(a) + rowReload + rowClean + rowUnjam + rowReopen + rowExtras + '</div>';
      }
      let dots = '';
      const locks = lockList(a);
      for (let k = 0; k < cap; k++) {
        const locked = locks.some(n => Number(n) === k);
        const full = !locked && (flags ? !!flags[k] : k < loaded);
        dots += '<button type="button" class="chamber-dot' + (locked ? ' locked' : (full ? ' full' : '')) + '" data-act="chamber" data-wid="' + esc(a.id) + '" data-k="' + k + '" aria-label="' + (locked ? 'Locked chamber ' : 'Chamber ') + (k + 1) + '">' + (locked ? 'X' : '') + '</button>';
      }
      const spareN = a.spare != null && a.spare !== '' ? a.spare : (a.ammo && a.ammo.spare != null ? a.ammo.spare : '');
      const rowReload = '<button type="button" data-act="rowReload" data-wid="' + esc(a.id) + '">Reload' + (spareN !== '' ? ' · ' + esc(spareN) : '') + '</button>';
      const rowExtras = (isPc && canAct) ? gunExtras(a, 'row') : '';
      return '<div class="cylinder-row' + crossClass(a) + '"><span class="cyl-name">' + esc(a.name || 'Gun') + '</span><span class="chamber-dots">' + dots + '</span><span class="ssm-rounds">' + loaded + '/' + cap + '</span><select data-act="cylTarget" aria-label="Target">' + targetOptions + '</select>' + lockupMark(a) + rowReload + rowClean + rowUnjam + rowReopen + rowExtras + '</div>';
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
    const weaponOptions = (card.attacks || []).map(a => '<option value="' + esc(a.id || a.name || '') + '">' + esc(a.name || a.id || 'Weapon') + '</option>').join('') || '<option value="">No weapon</option>';
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
    const maxHp = Number(hp.max);
    const haveCur = hp.cur !== "" && hp.cur != null && isFinite(Number(hp.cur));
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
    const coverKey = (window.SSDNSApplied && window.SSDNSApplied.coverKey)
      ? window.SSDNSApplied.coverKey(card.cover)
      : (card.cover || '');
    const coverTitle = "Half cover +2 to AC and Dexterity saves. Three-quarters +5. Total cover can't be targeted.";
    const coverOpt = (val, label) => '<option value="' + val + '"' + (coverKey === val ? ' selected' : '') + '>' + label + '</option>';
    const coverRow = '<label class="ssm-act" title="' + esc(coverTitle) + '">Cover <select data-act="coverPick" aria-label="Cover" title="' + esc(coverTitle) + '">' +
      coverOpt('', 'None') + coverOpt('half', 'Half +2') + coverOpt('three', '3/4 +5') + coverOpt('full', 'Total') +
      '</select></label>' +
      '<label class="ssm-act" title="Lock cover so the player can\'t change it."><input type="checkbox" data-act="coverLock"' + (card.coverLock ? ' checked' : '') + '> Lock cover</label>';
    d.innerHTML =
      '<div class="ssm-drawer-head"><b>' + esc(card.name || tokenId) + '</b> <span class="ssm-kind">' + esc(card.kind || '') + '</span>' +
      '<button type="button" data-act="drawerReset" title="Reset card position" aria-label="Reset card position">Reset</button>' +
      '<button type="button" data-act="drawerClose">×</button></div>' +
      '<div class="ssm-drawer-body">' +
      '<div>AC ' + esc(card.ac != null ? card.ac : '—') + ' · HP ' + esc(hp.cur != null ? hp.cur : '—') + '/' + esc(hp.max != null ? hp.max : '—') +
      (hp.temp ? ' (+' + esc(hp.temp) + ')' : '') + ' · ' + esc(speedLabel(card.speed)) + '</div>' +
      hpBar +
      deathLine +
      actToggle +
      coverRow +
      '<label class="ssm-act ssm-range"><input type="checkbox" data-act="drawerRange"' + (state.showRange ? ' checked' : '') + '> Show range</label>' +
      '<label class="ssm-act">Range: <select data-act="rangeOverride" aria-label="Range: Auto">' +
        '<option value="auto"' + ((state.rangeOverride || 'auto') === 'auto' ? ' selected' : '') + '>Auto</option>' +
        '<option value="ignore"' + (state.rangeOverride === 'ignore' ? ' selected' : '') + '>Ignore range</option>' +
        '<option value="force"' + (state.rangeOverride === 'force' ? ' selected' : '') + '>Force DIS</option>' +
      '</select></label>' +
      '<select data-act="drawerRangeWeapon" aria-label="Token weapon" hidden></select>' +
      (conds ? '<div class="ssm-conds">' + conds + '</div>' : '') +
      (card.tactics ? '<div class="ssm-tactics">' + esc(card.tactics) + '</div>' : '') +
      '<div class="ssm-section">Attacks</div>' + attacks +
      (cylinders ? '<div class="ssm-section">Cylinder</div>' + cylinders : '') +
      spells +
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
      (state.pendingTarget ? '<div class="ssm-pending">Click a token to target, Esc to cancel</div>' : '') +
      '</div>';
    bindSpellFold(d);
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
    d.querySelectorAll('.ssm-atk').forEach(b => {
      b.addEventListener('click', () => {
        if (b.disabled) return;
        if (b.hasAttribute('data-sid')) {
          const sid = b.getAttribute('data-sid');
          emit('drawer:spell', detail({ spellId: sid }));
          state.pendingTarget = { tokenId, spellId: sid, spellKind: b.getAttribute('data-skind') || '' };
        } else {
          const wid = b.getAttribute('data-wid');
          emit('drawer:attack', detail({ weaponId: wid }));
          state.pendingTarget = { tokenId, weaponId: wid };
        }
        renderDrawer();
      });
    });
    d.querySelectorAll('[data-act="cylTarget"]').forEach(sel => {
      sel.addEventListener('change', () => {
        state.rangeTargetId = sel.value || '';
        renderDrawer();
      });
    });
    d.querySelectorAll('[data-act="chamber"]').forEach(b => {
      b.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (!canAct) { toast('The player acts for themselves'); return; }
        const row = b.closest('.cylinder-row');
        const sel = row && row.querySelector('[data-act="cylTarget"]');
        const targetId = sel && sel.value;
        if (!targetId) { toast('Pick a target'); return; }
        const targetTok = state.tokens.find(tok => tok && (tokenCombatant(tok.id) === targetId || tok.id === targetId));
        const wid = b.getAttribute('data-wid');
        const attack = ((card.attacks || []).find(a => a && (a.id === wid || a.name === wid))) || { id: wid };
        const verdict = armRange(attack, targetTok ? targetTok.id : targetId, tokenId);
        if (verdict && verdict.blocked) {
          noteOverride(verdict);
          if (window.SSDNSRangeRings && window.SSDNSRangeRings.clear) window.SSDNSRangeRings.clear();
          toast(verdict.button || 'Out of range');
          return;
        }
        emit('drawer:target', detail({
          weaponId: wid,
          chamber: Number(b.getAttribute('data-k')),
          targetTokenId: targetTok ? targetTok.id : '',
          targetCombatantId: targetId
        }));
      });
    });
    d.querySelector('[data-act="hpMinus"]').addEventListener('click', () => emit('drawer:hp', detail({ delta: -readHp() })));
    d.querySelector('[data-act="hpPlus"]').addEventListener('click', () => emit('drawer:hp', detail({ delta: readHp() })));
    d.querySelector('[data-act="hpSet"]').addEventListener('click', () => emit('drawer:hp', detail({ set: readHp() })));
    d.querySelector('[data-act="downCard"]').addEventListener('click', () => emit('drawer:down', detail()));
    d.querySelectorAll('[data-act="condX"]').forEach(b => {
      b.addEventListener('click', () => {
        const name = b.getAttribute('data-cond') || '';
        if (!name) return;
        emit('drawer:condition', detail({ condition: name, on: false }));
      });
    });
    const actBox = d.querySelector('[data-act="actFor"]');
    if (actBox) actBox.addEventListener('change', () => emit('drawer:act', detail({ on: !!actBox.checked })));
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
      b.addEventListener('click', () => emit('drawer:reload', detail({ weaponId: b.getAttribute('data-wid') })));
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
    d.querySelectorAll('[data-act="rowReopen"]').forEach(b => {
      b.addEventListener('click', () => {
        if (!canAct) { toast('The player acts for themselves'); return; }
        emit('drawer:reopen', detail({ weaponId: b.getAttribute('data-wid'), gunIndex: b.getAttribute('data-gun') }));
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
        emit('drawer:hex', detail({ weaponId: b.getAttribute('data-wid'), level: lvl ? lvl.value : 1 }));
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
        if (role === 'player' && window.SSDNSItems && window.SSDNSItems.useOnSheet) window.SSDNSItems.useOnSheet(uid);
        else emit('drawer:useitem', detail({ itemUid: uid }));
      });
    });
    d.querySelector('[data-act="deathBtn"]').addEventListener('click', () => emit('drawer:deathsave', detail()));
    d.querySelector('[data-act="undoBtnD"]').addEventListener('click', () => emit('drawer:undo', detail()));
  }
  function refreshCard(tokenId) {
    if (role === 'player') { paintPlayerFight(); return; }
    if (role !== 'dm') return;
    if (state.drawerOpen && (!tokenId || tokenId === state.drawerTokenId)) renderDrawer();
  }

  function destroy() {
    dead = true;
    state.drawerOpen = false;
    state.drawerTokenId = null;
    state.pendingTarget = null;
    if (raf) cancelAnimationFrame(raf);
    if (animRaf) cancelAnimationFrame(animRaf);
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
      Object.assign(t, cosmetic);
      if (role === 'dm') saveToken(id);
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
      shared.tokens[tid] = Object.assign(shared.tokens[tid] || {}, next);
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
        shared.scenes[sid] = next;
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

    const order = data.room.table?.initiative?.order || [];
    const turnIdx = data.room.table?.initiative?.turn ?? 0;
    state.currentTurnId = order[turnIdx]?.id || null;

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
  if (typeof options.onReady === 'function') {
    try { options.onReady(); } catch (e) {}
  }
}

boot().catch(err => { console.error(err); toast('Failed to load map: ' + (err && err.message ? err.message : err)); });

return {
  destroy,
  syncCombatants,
  setChat,
  pushFeed,
  requestDraw,
  refreshCard,
  feetBetween: function (idA, idB) {
    return feetBetween(tokenByRef(idA), tokenByRef(idB));
  },
  refreshPlayers: function () {
    fillGrant();
    ensurePartyTokens();
  },
  ensureDefaultScene: ensureDefaultScene,
  placeLinkedToken,
  setTool,
  removeToken: function (id) { removeMapTokens([id], { silent: true }); },
  applyLink,
  patchToken,
  tokenForPlayer,
  hasToken,
  releaseToken,
  armAttack
};
}
};

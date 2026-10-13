/* SSDNS Map module. One global. No URL, no storage, no channel. */
window.SSDNSMap = { create(opts) {
  const el = opts.el;
  if (!el) throw new Error('SSDNSMap: el required');
  const role = opts.role === 'dm' ? 'dm' : 'player';
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
    write('map/public/tokens/' + token.id + '/patch', Object.assign({ seq: Date.now(), by: uid }, patch));
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
      t.sheetId = s.sheetId || t.sheetId || '';
      if (t.image && !t._img) {
        const im = new Image();
        im.src = asset(t.image);
        im.onload = () => { t._img = im; draw(); };
      }
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
  <span data-act="roleBadge">${role.toUpperCase()}${role === 'player' ? ' · ' + uid : ''}</span>
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
  ` : `
    <button data-act="playerColorBtn">My color</button>
    <input data-act="playerLabel" placeholder="My label" style="width:90px;background:#3a3228;color:#e8dcc8;border:1px solid #5a4e40;border-radius:4px;padding:2px 4px;">
    <button data-act="playerPingBtn">Ping</button>
    <button data-act="playerRulerBtn">Ruler</button>
    <button data-act="playerTorchBtn">Torch: OFF</button>
    <button data-act="playerGhostBtn">Ghost Plan: OFF</button>
    <button data-act="playerCancelBtn">Cancel plan</button>
  `}
`;
el.appendChild(toolbar);
on(document, 'keydown', e => {
  if (role === 'dm' && e.key === 'Escape' && state.pendingTarget) {
    e.preventDefault();
    state.pendingTarget = null;
    renderDrawer();
    return;
  }
  if (!el.matches(':hover') && !el.contains(e.target)) return;
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA')) return;
  if (e.key === 'Shift' && state.drag && state.drag.token) { dropPin(); return; }
  if (e.key === 'Backspace' && state.drag && state.drag.pins) { e.preventDefault(); popPin(); return; }
  if (e.key.toLowerCase() === 'x' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); recallPath(); }
});
const chatdock = document.createElement('div');
chatdock.className = 'ssdns-chatdock';
chatdock.innerHTML = `<div data-act="chatlog"></div><div data-act="chatrow"><input data-act="chatInput" placeholder="Chat or /roll"><button data-act="chatSend">Send</button></div>`;
el.appendChild(chatdock);
function pushFeed(row) {
  if (!row || row.kind === 'sfx') { if (row && host.sfx) host.sfx(row); return; }
  state.chat = state.chat || [];
  state.chat.push(row);
  if (state.chat.length > 100) state.chat.shift();
  const log = q('chatlog');
  if (!log) return;
  const line = document.createElement('div');
  const name = row.fromName || (host.displayName ? host.displayName(row.from) : row.from);
  line.textContent = name + ': ' + row.text;
  log.appendChild(line);
  log.scrollTop = log.scrollHeight;
}
function setChat(rows) {
  state.chat = [];
  const log = q('chatlog');
  if (log) log.innerHTML = '';
  (rows || []).forEach(pushFeed);
}
function pushChat(row) { pushFeed(row); }

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

if (role === 'dm') {
  const leftbar = document.createElement('div');
  leftbar.className = 'ssdns-leftbar';
  leftbar.innerHTML = `
    <button data-act="pingBtn">Ping</button>
    <button data-act="rulerBtn">Ruler</button>
    <button data-act="colorBtn">Color</button>
    <button data-act="fogRectBtn">Fog</button>
    <button data-act="undoFogBtn">Undo Fog</button>
    <button data-act="hideBtn">Hide</button>
    <button data-act="hideAllBtn">Hide All</button>
    <button data-act="revealAllBtn">Reveal All</button>
    <div style="height:12px"></div>
    <button data-act="lockBtn">Lock</button>
    <button data-act="undoBtn">Undo Move</button>
    <button data-act="redoBtn">Redo Move</button>
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
  const rightbar = document.createElement('div');
  rightbar.className = 'ssdns-rightbar';
  rightbar.innerHTML = `
    <div class="panel-title">Sheet</div>
    <div data-act="actionSlot"></div>
  `;
  el.appendChild(rightbar);
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
function paintZoom() {
  const z = q('zoomLabel');
  if (z) z.textContent = (state.view.zoom || 1).toFixed(2) + '×';
}

function draw() {
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

      // revealed rects
      for (const fr of (sceneData().fogRects || [])) {
        ctx.save();
        const a = worldToScreen(fr.x * px, fr.y * px);
        const b = worldToScreen((fr.x + fr.w) * px, (fr.y + fr.h) * px);
        ctx.beginPath();
        ctx.rect(a.x, a.y, b.x - a.x, b.y - a.y);
        ctx.clip();
        const topLeft = worldToScreen(0, 0);
        ctx.drawImage(img, topLeft.x, topLeft.y, cols * px * state.view.zoom, rows * px * state.view.zoom);
        ctx.restore();
      }
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
  if (role === 'dm' && sceneData().fogRects) {
    ctx.strokeStyle = 'rgba(200,180,80,0.6)';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    for (const fr of sceneData().fogRects) {
      const a = worldToScreen(fr.x * px, fr.y * px);
      const b = worldToScreen((fr.x + fr.w) * px, (fr.y + fr.h) * px);
      ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
    }
    ctx.setLineDash([]);
  }

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

  // tokens
  for (const t of state.tokens) {
    const isHidden = t.hidden;
    if (isHidden && role !== 'dm') continue;
    if (role === 'player') {
      const myScene = getPlayerScene();
      if ((t.sceneId || 'scn_dustyspur01') !== myScene) continue;
    }

    // player vision + revealed rects + other light sources
    if (role === 'player' && !sceneData().fogRevealed) {
      const tcx = (t.pos.x + (t.size || 1) / 2) * px;
      const tcy = (t.pos.y + (t.size || 1) / 2) * px;
      let visible = false;
      if (visionCenter) {
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
      if (!visible && sceneData().fogRects) {
        for (const fr of sceneData().fogRects) {
          if (t.pos.x >= fr.x && t.pos.x < fr.x + fr.w &&
              t.pos.y >= fr.y && t.pos.y < fr.y + fr.h) {
            visible = true;
            break;
          }
        }
      }
      if (!visible) continue;
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

    // ghost for DM if hidden
    if (isHidden && role === 'dm') {
      ctx.globalAlpha = 0.4;
    }

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
    ctx.beginPath();
    ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
    ctx.strokeStyle = ring;
    ctx.lineWidth = 3;
    ctx.stroke();

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

    // red X if downed
    if (t.status === 'down' || (t.hp != null && t.hp <= 0)) {
      ctx.strokeStyle = '#e74c3c';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(s.x - r * 0.6, s.y - r * 0.6);
      ctx.lineTo(s.x + r * 0.6, s.y + r * 0.6);
      ctx.moveTo(s.x + r * 0.6, s.y - r * 0.6);
      ctx.lineTo(s.x - r * 0.6, s.y + r * 0.6);
      ctx.stroke();
    }

    // condition badges (simple icons)
    ctx.globalAlpha = 1;
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

    // HP bar under the name
    if (t.hp != null && t.maxHp && (role === 'dm' || canControl(t))) {
      const pct = t.hp / t.maxHp;
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
  if (state.tool === 'rect' || state.tool === 'poly' || state.tool === 'wall' || state.tool === 'room' || state.tool === 'door' || state.tool === 'window') canvas.style.cursor = 'crosshair';
  else if (state.tool === 'ruler') canvas.style.cursor = iconCursor('📏');
  else if (state.tool === 'ping') canvas.style.cursor = iconCursor('📡');
  else if (state.offline) canvas.style.cursor = iconCursor('👻');
  else canvas.style.cursor = 'default';
}
function setTool(tool) {
  const wallTool = tool === 'wall' || tool === 'room' || tool === 'door' || tool === 'window' || tool === 'delwall';
  if (tool === 'fogToggle') {
    if (state.tool === 'poly') tool = 'rect';
    else if (state.tool === 'rect') tool = null;
    else tool = 'poly';
  }
  state.tool = state.tool === tool ? null : tool;
  state.fogMode = state.tool;
  if (wallTool) revealWallLines();
  el.querySelectorAll('.ssdns-leftbar button').forEach(b => {
    if (b.getAttribute('data-act') === 'fogBtn' || b.getAttribute('data-act') === 'showFovBtn' || b.getAttribute('data-act') === 'wallsVisBtn') return;
    b.classList.remove('active');
  });
  const fogBtn = q('fogRectBtn');
  if (fogBtn) {
    if (state.tool === 'poly') { fogBtn.textContent = 'Fog: Poly'; fogBtn.classList.add('active'); }
    else if (state.tool === 'rect') { fogBtn.textContent = 'Fog: Rect'; fogBtn.classList.add('active'); }
    else { fogBtn.textContent = 'Fog'; }
  }
  ['rulerBtn','pingBtn','wallBtn','delWallBtn','roomBtn','doorBtn','windowBtn'].forEach(id => {
    const b = q(id);
    const toolMap = { rulerBtn: 'ruler', pingBtn: 'ping', wallBtn: 'wall', delWallBtn: 'delwall', roomBtn: 'room', doorBtn: 'door', windowBtn: 'window' };
    if (b && state.tool === toolMap[id]) b.classList.add('active');
  });
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
  state.tokens.push(clean);
  shared.tokens[id] = JSON.parse(JSON.stringify(clean));
  emit('combatant:add', { tokenId: id });
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
  const made = state.clipboard.map((src, i) => cloneToken(src, 1, i));
  state.selectedIds = made.map(t => t.id);
  state.selected = made[0];
  made.forEach(t => saveToken(t.id));
  toast('Pasted ' + made.length + ' — own stats, not linked');
  draw();
}
const PC_COLORS = ['#4a90d9', '#2a9d8f', '#9b59b6', '#e67e22', '#d35400', '#c9a227'];
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
function selectToken(token) {
  if (!token) return;
  if (state.pendingTarget && role === 'dm') {
    emit('drawer:target', { tokenId: state.pendingTarget.tokenId, weaponId: state.pendingTarget.weaponId, targetTokenId: token.id });
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
function makeToken(spec) {
  if (!state.scene) return null;
  const grid = state.scene.grid || { cols: 30, rows: 20 };
  const spot = spec.pos || viewCenterCell();
  const id = 'tok_' + Date.now().toString(36) + Math.floor(Math.random() * 1000);
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
    sheetId: spec.sheetId || ''
  };
  state.tokens.push(token);
  shared.tokens[id] = JSON.parse(JSON.stringify(token));
  emit('combatant:add', { tokenId: id });
  saveToken(id);
  return token;
}
function ensurePartyTokens() {
  if (role !== 'dm' || !state.scene) return;
  const list = partyList();
  list.forEach((p, i) => {
    const who = p.uid || p.id;
    if (!who || dismissedMap()[who] || tokenForOwner(who)) return;
    const cell = viewCenterCell();
    const name = p.name || p.label || who;
    makeToken({
      kind: 'player',
      name: name,
      label: name,
      ownerUid: who,
      ownerCanMove: true,
      color: PC_COLORS[i % PC_COLORS.length],
      pos: { x: cell.x + (i % 5) - 2, y: cell.y }
    });
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
  if (tokenForOwner(who)) { toast('That player already has a token'); return; }
  const p = partyList().find(x => (x.uid || x.id) === who) || {};
  const name = p.name || p.label || who;
  const cell = viewCenterCell();
  const token = makeToken({
    kind: 'player',
    name: name,
    label: name,
    ownerUid: who,
    ownerCanMove: true,
    color: '#4a90d9',
    pos: cell
  });
  if (!token) return;
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
    fogRevealed: cur.fogRevealed === true
  };
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
    if (role === 'dm' && (state.tool === 'rect' || state.fogMode === 'rect')) {
      const w = pointerWorld(e);
      state.fogStart = w;
      state.drag = { fog: true, sx: e.clientX, sy: e.clientY };
      return;
    }
    if (role === 'dm' && (state.tool === 'brush' || state.fogMode === 'brush')) {
      const w = pointerWorld(e);
      const px = state.scene.grid.px;
      const rect = { x: Math.floor(w.x / px), y: Math.floor(w.y / px), w: 1, h: 1 };
      sceneData().fogRects.push(rect);
      state.undoStack.push({ type: 'fog', rect });
      saveScene();
      draw();
      return;
    }
    if (role === 'dm' && (state.tool === 'poly' || state.fogMode === 'poly')) {
      const w = pointerWorld(e);
      if (!state.polyPoints) state.polyPoints = [];
      state.polyPoints.push(w);
      if (state.polyPoints.length >= 3 && e.detail === 2) { // double-click to close
        // simple bounding rect for demo
        const xs = state.polyPoints.map(p => p.x), ys = state.polyPoints.map(p => p.y);
        const px = state.scene.grid.px;
        const rect = {
          x: Math.floor(Math.min(...xs) / px),
          y: Math.floor(Math.min(...ys) / px),
          w: Math.max(1, Math.ceil((Math.max(...xs) - Math.min(...xs)) / px)),
          h: Math.max(1, Math.ceil((Math.max(...ys) - Math.min(...ys)) / px))
        };
        sceneData().fogRects.push(rect);
        state.undoStack.push({ type: 'fog', rect });
        state.polyPoints = [];
        state.tool = null;
        const btn = q('fogRectBtn');
        if (btn) btn.textContent = 'Fog: Rect';
        saveScene();
      }
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
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, localXY(e));
  if (state.tool === 'wall' && state.wallStart) draw();
  if (state.tool === 'room' && state.roomStart) draw();
  if (pointers.size === 1 && state.drag) {
    if (state.drag.pan) {
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
      ids.forEach(id => {
        const t = state.tokens.find(tok => tok.id === id);
        if (!t) return;
        const start = state.drag.starts ? state.drag.starts[id] : { x: t.pos.x, y: t.pos.y };
        if (!state.drag.starts) state.drag.starts = {};
        if (!state.drag.starts[id]) state.drag.starts[id] = { x: t.pos.x - dx, y: t.pos.y - dy };
        const newX = Math.max(0, Math.min(state.scene.grid.cols - 1, state.drag.starts[id].x + dx));
        const newY = Math.max(0, Math.min(state.scene.grid.rows - 1, state.drag.starts[id].y + dy));
        if (!crossesWall(t.pos.x + 0.5, t.pos.y + 0.5, newX + 0.5, newY + 0.5)) {
          if (state.offline) {
            state.drag.ghost = { x: newX, y: newY };
            const existing = state.pendingMoves.find(m => m.id === t.id);
            const origin = state.drag.starts[t.id] || { x: t.pos.x, y: t.pos.y };
            const path = state.drag.pins ? state.drag.pins.concat([{ x: newX, y: newY }]) : [{ x: origin.x, y: origin.y }, { x: newX, y: newY }];
            if (existing) { existing.x = newX; existing.y = newY; existing.path = path; }
            else state.pendingMoves.push({ id: t.id, x: newX, y: newY, fromX: origin.x, fromY: origin.y, path });
          } else {
            t.pos.x = newX;
            t.pos.y = newY;
            if (shared.tokens[t.id]) shared.tokens[t.id].pos = { ...t.pos, by: uid, ts: Date.now() };
          }
        }
      });
      if (!state.drag.recorded) {
        state.undoStack.push({ type: 'move', ids: ids.slice(), from: { ...state.drag.starts } });
        state.drag.recorded = true;
        state.redoStack = [];
      }
      // write on pointerup only
    }
    draw();
  }
}
function onPointerUp(e) {
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
    const rect = {
      x: Math.floor(x1 / px),
      y: Math.floor(y1 / px),
      w: Math.max(1, Math.ceil((x2 - x1) / px)),
      h: Math.max(1, Math.ceil((y2 - y1) / px))
    };
    sceneData().fogRects.push(rect);
    saveScene();
    state.fogMode = null;
    const btn = q('fogRectBtn');
    if (btn) btn.textContent = 'Fog Rect';
  }
  pointers.delete(e.pointerId);
  if (pointers.size === 0) state.drag = null;
  state.fogStart = null;
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

on(canvas, 'pointerdown', onPointerDown);
on(canvas, 'contextmenu', e => e.preventDefault());
on(canvas, 'auxclick', e => { if (e.button === 1) e.preventDefault(); });
on(canvas, 'pointermove', onPointerMove);
on(canvas, 'pointerup', onPointerUp);
on(canvas, 'pointercancel', onPointerUp);
on(canvas, 'wheel', e => {
  e.preventDefault();
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

q('helpBtn').addEventListener('click', () => {
  let box = q('helpBox');
  if (box) { box.remove(); return; }
  box = document.createElement('div');
  box.setAttribute('data-act', 'helpBox');
  box.style.cssText = 'position:absolute;top:48px;right:16px;width:320px;max-height:70vh;overflow:auto;background:#1c1814;color:#e8dcc8;border:1px solid #5a4e40;border-radius:8px;padding:12px;z-index:20;font:13px system-ui;';
  const dm = role === 'dm';
  box.innerHTML = `<b>How to use the map</b><br><br>
<b>Move</b> Drag your token. Walls block the path.<br>
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
Fog covers the player map. Show Player FOV greys the rest and brightens their light.<br>
Set floor, then Show to players, to move someone to another map.` : `<b>Player</b><br>
You move your own token, and any the DM has granted you.<br>
My color changes your ring. Ping uses that color. The button stays lit while the tool is on.<br>
Ghost Plan plots in private. Turn it off to slide for everyone.<br>
Fog hides what you cannot see. A torch or your vision opens a circle.`}
<br><br>Click ? again to close.`;
  el.appendChild(box);
});

q('chatInput').addEventListener('keydown', e => { if (e.key === 'Enter') sendChat(); });
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
    flashBtn('hideBtn');
    draw();
  });
  q('colorBtn').addEventListener('click', () => {
    const targets = state.selectedIds.length ? state.tokens.filter(t => state.selectedIds.includes(t.id)) : (state.selected ? [state.selected] : []);
    if (!targets.length) { toast('Select a token first'); return; }
    const colors = ['#4a90d9', '#8b3a3a', '#2a9d8f', '#9b59b6', '#e67e22', '#d35400', '#c9a227', '#e91e63', '#ffeb3b', '#ffffff', '#888'];
    targets.forEach(t => {
      const current = t.color || '';
      const idx = colors.indexOf(current);
      const next = colors[(idx + 1) % colors.length];
      t.color = next;
      if (shared.tokens[t.id]) shared.tokens[t.id].color = next;
    });
    targets.forEach(t => saveToken(t.id));
    flashBtn('colorBtn');
    draw();
  });
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
  q('fogRectBtn').addEventListener('click', () => setTool('fogToggle'));
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
  q('undoFogBtn').addEventListener('click', () => {
    if (sceneData().fogRects.length) {
      sceneData().fogRects.pop();
      saveScene();
      draw();
    }
  });
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
    q('fogBtn').textContent = 'Fog: OFF';
    saveScene();
    draw();
  });
  q('hideAllBtn').addEventListener('click', () => {
    sceneData().fogRevealed = false;
    sceneData().fogRects = [];
    q('fogBtn').textContent = 'Fog: ON';
    saveScene();
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
    state.tokens = state.tokens.filter(t => !ids.includes(t.id));
    ids.forEach(id => {
      const gone = shared.tokens[id];
      if (gone && gone.ownerUid) {
        dismissedMap()[gone.ownerUid] = true;
        write('map/dm/dismissed/' + gone.ownerUid, true);
      }
      delete shared.tokens[id];
      if (adapter && adapter.remove) {
        adapter.remove('map/public/tokens/' + id);
        adapter.remove('map/dm/tokens/' + id);
      }
    });
    ids.forEach(id => emit('combatant:remove', { tokenId: id }));
    if (ids.includes(state.currentTurnId)) state.currentTurnId = null;
    state.selected = null;
    state.selectedIds = [];
    flashBtn('delTokenBtn');
    toast('Removed from map and turn order');
    draw();
  });
  renderActions();
} else {
  // player color cycle (no red)
  q('playerColorBtn').addEventListener('click', () => {
    const myToken = state.tokens.find(t => t.ownerUid === uid);
    if (!myToken) { toast('No token found'); return; }
    const colors = ['#4a90d9', '#2a9d8f', '#9b59b6', '#e67e22', '#d35400', '#c9a227', '#e91e63', '#ffeb3b', '#1abc9c', '#3498db'];
    const current = myToken.color || '';
    const idx = colors.indexOf(current);
    const next = colors[(idx + 1) % colors.length];
    myToken.color = next;
    if (shared.tokens[myToken.id]) {
      shared.tokens[myToken.id].color = next;
    }
    flashBtn('playerColorBtn');
    publishPlayerPatch(myToken, { color: next });
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
      strip.style.cssText = 'position:absolute;bottom:52px;left:50%;transform:translateX(-50%);display:flex;gap:4px;z-index:12;';
      el.appendChild(strip);
    }
    const order = (state.initiative && state.initiative.order) || [];
    const turn = (state.initiative && state.initiative.turn) || 0;
    strip.innerHTML = '';
    order.forEach((c, i) => {
      const b = document.createElement('span');
      b.textContent = c.name || c.id;
      b.style.cssText = 'padding:2px 6px;border-radius:4px;font-size:11px;background:' + (i === turn ? '#8a7040' : '#2a241c') + ';color:#e8dcc8;cursor:pointer;';
      if (role === 'dm') {
        b.addEventListener('click', () => {
          const t = state.tokens.find(tok => tok.combatantId === c.id || tok.id === c.id);
          if (t) selectToken(t);
        });
      }
      strip.appendChild(b);
    });
    if (role === 'dm') {
      ['Prev','Next'].forEach(label => {
        const b = document.createElement('button');
        b.textContent = label;
        b.addEventListener('click', () => emit(label === 'Next' ? 'initiative:next' : 'initiative:prev', {}));
        strip.appendChild(b);
      });
    }
  }
  function renderActions() {
    const slot = q('actionSlot');
    if (!slot || !host.actions || !host.actions.get) return;
    const tokenId = state.selected ? state.selected.id : null;
    const list = host.actions.get({ role, uid, tokenId }) || [];
    slot.innerHTML = '';
    list.forEach(a => {
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
      slot.appendChild(b);
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
  function lookupCard(tokenId) {
    if (role !== 'dm' || typeof host.getCard !== 'function' || !tokenId) return null;
    const direct = host.getCard(tokenId);
    if (direct) return direct;
    const token = state.tokens.find(t => t.id === tokenId);
    const alt = token && (token.combatantId || token.sheetId);
    if (alt && alt !== tokenId) return host.getCard(alt) || null;
    return null;
  }
  function openDrawer(tokenId) {
    if (role !== 'dm') return;
    state.drawerOpen = true;
    state.drawerTokenId = tokenId;
    emit('drawer:open', { tokenId });
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
    }
    const tokenId = state.drawerTokenId;
    const card = lookupCard(tokenId);
    if (!card) {
      d.innerHTML = '<div class="ssm-drawer-head"><b>No card linked</b><button type="button" data-act="drawerClose">×</button></div>';
      const c = d.querySelector('[data-act="drawerClose"]');
      if (c) c.addEventListener('click', closeDrawer);
      return;
    }
    const isPc = card.kind === 'pc';
    const canAct = !isPc || card.dmActsAs === true;
    const hp = card.hp || {};
    const attacks = (card.attacks || []).map(a => {
      const ammo = a.ammo ? ' [' + (a.ammo.loaded != null ? a.ammo.loaded : '—') + '/' + (a.ammo.cap != null ? a.ammo.cap : '—') + ']' : '';
      return '<button type="button" class="ssm-atk" data-wid="' + esc(a.id) + '" ' + (canAct ? '' : 'disabled') + '>' +
        esc(a.name || a.id) + ' +' + esc(a.toHit != null && a.toHit !== '' ? a.toHit : 0) + ' ' + esc(a.damage || '') + esc(ammo) + '</button>';
    }).join('');
    const spells = (card.spells || []).map(s =>
      '<button type="button" class="ssm-atk" data-sid="' + esc(s.id) + '" ' + (canAct ? '' : 'disabled') + '>' +
      esc(s.name || s.id) + (s.level != null ? ' (L' + esc(s.level) + ')' : '') + '</button>'
    ).join('');
    const conds = (card.conditions || []).map(c => '<span class="ssm-cond">' + esc(c) + '</span>').join(' ');
    d.innerHTML =
      '<div class="ssm-drawer-head"><b>' + esc(card.name || tokenId) + '</b> <span class="ssm-kind">' + esc(card.kind || '') + '</span>' +
      '<button type="button" data-act="drawerClose">×</button></div>' +
      '<div class="ssm-drawer-body">' +
      '<div>AC ' + esc(card.ac != null ? card.ac : '—') + ' · HP ' + esc(hp.cur != null ? hp.cur : '—') + '/' + esc(hp.max != null ? hp.max : '—') +
      (hp.temp ? ' (+' + esc(hp.temp) + ')' : '') + ' · ' + esc(speedLabel(card.speed)) + '</div>' +
      (conds ? '<div class="ssm-conds">' + conds + '</div>' : '') +
      (card.tactics ? '<div class="ssm-tactics">' + esc(card.tactics) + '</div>' : '') +
      '<div class="ssm-section">Attacks</div>' + attacks +
      (spells ? '<div class="ssm-section">Spells</div>' + spells : '') +
      '<div class="ssm-row">' +
        '<button type="button" data-act="hpMinus">− HP</button><button type="button" data-act="hpPlus">+ HP</button>' +
        '<button type="button" data-act="condBtn">Condition</button>' +
      '</div>' +
      '<div class="ssm-row">' +
        '<button type="button" data-act="reloadBtn">Reload</button><button type="button" data-act="unloadBtn">Unload</button>' +
        '<button type="button" data-act="deathBtn">Death save</button><button type="button" data-act="undoBtnD">Undo</button>' +
      '</div>' +
      (state.pendingTarget ? '<div class="ssm-pending">Click a token to target, Esc to cancel</div>' : '') +
      '</div>';
    d.querySelector('[data-act="drawerClose"]').addEventListener('click', closeDrawer);
    d.querySelectorAll('.ssm-atk').forEach(b => {
      b.addEventListener('click', () => {
        if (b.disabled) return;
        const wid = b.getAttribute('data-wid') || b.getAttribute('data-sid');
        emit('drawer:attack', { tokenId, weaponId: wid });
        state.pendingTarget = { tokenId, weaponId: wid };
        renderDrawer();
      });
    });
    d.querySelector('[data-act="hpMinus"]').addEventListener('click', () => emit('drawer:hp', { tokenId, delta: -1 }));
    d.querySelector('[data-act="hpPlus"]').addEventListener('click', () => emit('drawer:hp', { tokenId, delta: 1 }));
    d.querySelector('[data-act="condBtn"]').addEventListener('click', () => {
      const raw = prompt('Condition name');
      const name = String(raw || '').trim();
      if (!name) return;
      const already = (card.conditions || []).some(x => String(x).toLowerCase() === name.toLowerCase());
      emit('drawer:condition', { tokenId, condition: name, on: !already });
    });
    d.querySelector('[data-act="reloadBtn"]').addEventListener('click', () => {
      const wid = (card.attacks && card.attacks[0]) ? card.attacks[0].id : null;
      emit('drawer:reload', { tokenId, weaponId: wid });
    });
    d.querySelector('[data-act="unloadBtn"]').addEventListener('click', () => {
      const wid = (card.attacks && card.attacks[0]) ? card.attacks[0].id : null;
      emit('drawer:unload', { tokenId, weaponId: wid });
    });
    d.querySelector('[data-act="deathBtn"]').addEventListener('click', () => emit('drawer:deathsave', { tokenId }));
    d.querySelector('[data-act="undoBtnD"]').addEventListener('click', () => emit('drawer:undo', { tokenId }));
  }
  function refreshCard(tokenId) {
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
    el.innerHTML = '';
  }

  function dropToken(id) {
    delete shared.tokens[id];
    state.tokens = state.tokens.filter(t => t.id !== id);
    if (state.selected && state.selected.id === id) state.selected = null;
    state.selectedIds = (state.selectedIds || []).filter(x => x !== id);
  }
  function handlePublicToken(path, value, meta) {
    const parts = (path || '').split('/');
    // map/public/tokens/<id>[/pos|/patch]
    const id = parts[3];
    if (!id) return;
    const sub = parts[4];
    if (value == null || (meta && meta.removed)) {
      if (!newer(path, meta && meta.seq)) return;
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
    if (sub === 'pos') {
      const t = shared.tokens[id];
      const by = (meta && meta.by) || (value && value.by);
      if (role === 'dm' && t && by && by !== uid) {
        if (!canControlBy(t, by)) return;
        t.pos = { x: value.x, y: value.y, by, seq };
        saveToken(id);
      } else if (shared.tokens[id]) {
        shared.tokens[id].pos = { x: value.x, y: value.y };
      }
    } else if (sub === 'patch') {
      const t = shared.tokens[id];
      if (!t || !value) return;
      const by = (meta && meta.by) || value.by;
      if (!canControlBy(t, by)) return;
      const cosmetic = {};
      if (value.color != null) cosmetic.color = value.color;
      if (value.label != null) cosmetic.label = value.label;
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
    }
    if (role === 'player') state.tokens = Object.values(shared.tokens).filter(t => !t.hidden);
    applySharedToTokens();
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
    state.tokens = (role === 'player' && Object.keys(shared.tokens).length)
      ? Object.values(shared.tokens).filter(t => !t.hidden)
      : data.tokens;
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
      ensurePartyTokens();
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
  refreshPlayers: function () {
    fillGrant();
    ensurePartyTokens();
  },
  ensureDefaultScene: ensureDefaultScene
};
}
};

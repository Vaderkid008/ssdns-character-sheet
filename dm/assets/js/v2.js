/**
 * DMCC v0.2 panels: fight tracker, damage/heal, store stock, bestiary,
 * PHB lookup, music, handout packs, conditions, undo, shortcuts.
 * Loaded after dmcc.js. Demo and live share this code.
 */
const DM = window.DMCC;
const $ = DM.$;
const $$ = DM.$$;
const esc = DM.esc;

const CONDITIONS = ["Poisoned", "Prone", "Bleeding", "Frightened", "Grappled", "Stunned", "Blinded", "Charmed", "Invisible", "Exhaustion"];
const PACK_KEY = "ssdns.dmcc.packs";
const TABLE_KEY = "ssdns.dmcc.table";

const fight = {
  round: 1,
  turn: 0,
  order: [],
  bestiary: [],
  packs: [],
  stock: [],
  tracks: [],
  trackId: "",
  loop: false,
  toTable: false,
  playing: false,
  undo: null
};

function tableKey() {
  return TABLE_KEY + "." + (DM.state.roomCode || "demo");
}
function loadLocalTable() {
  try {
    const raw = JSON.parse(localStorage.getItem(tableKey()) || "null");
    if (!raw) return;
    fight.round = raw.round || 1;
    fight.turn = raw.turn || 0;
    fight.order = raw.order || [];
    fight.stock = raw.stock || [];
    fight.packs = raw.packs || fight.packs;
  } catch (e) {}
  try {
    const packs = JSON.parse(localStorage.getItem(PACK_KEY) || "null");
    if (Array.isArray(packs) && packs.length) fight.packs = packs;
  } catch (e) {}
}
function saveLocalTable() {
  try {
    localStorage.setItem(tableKey(), JSON.stringify({
      round: fight.round, turn: fight.turn, order: fight.order, stock: fight.stock, packs: fight.packs
    }));
    localStorage.setItem(PACK_KEY, JSON.stringify(fight.packs));
  } catch (e) {}
}
async function saveRemoteTable() {
  saveLocalTable();
  if (DM.state.demo || !DM.state.db) return;
  try {
    await DM.state._fb.set(DM.roomRef("table"), {
      initiative: { round: fight.round, turn: fight.turn, order: fight.order },
      store: fight.stock,
      packs: fight.packs,
      updatedAt: new Date().toISOString()
    });
  } catch (e) { console.warn(e); }
}
function applyRemoteTable(v) {
  if (!v) return;
  const init = v.initiative || {};
  if (Array.isArray(init.order)) fight.order = init.order;
  if (init.round) fight.round = init.round;
  if (init.turn != null) fight.turn = init.turn;
  if (Array.isArray(v.store)) fight.stock = v.store;
  if (Array.isArray(v.packs)) fight.packs = v.packs;
  renderFight();
  renderStock();
  renderPacks();
}

function namesFor(pid) {
  const p = pid && DM.state.players[pid];
  const s = (p && p.snapshot) || {};
  return { playerName: s.player || "", characterName: s.name || "" };
}

function rememberUndo(entry) {
  fight.undo = entry;
  const btn = $("#btnUndo");
  if (btn) btn.disabled = !entry;
}

async function undoLast() {
  const u = fight.undo;
  if (!u) { DM.toast("Nothing to undo"); return; }
  fight.undo = null;
  const btn = $("#btnUndo");
  if (btn) btn.disabled = true;
  const names = namesFor(u.playerId);
  await DM.pushLedger(Object.assign({
    who: "DM", type: "undo", flag: false,
    what: "Undo: " + (u.label || u.type),
    oldVal: null, newVal: "undone"
  }, names, { playerId: u.playerId || "all" }));
  if (u.command) await DM.pushCommand(u.command);
  if (DM.state.demo && u.demo) u.demo();
  DM.renderPlayers();
  DM.toast("Undid last push");
}

function playerSelect(sel, includeAll) {
  const el = $(sel);
  if (!el) return;
  const keep = el.value;
  const opts = (includeAll ? '<option value="all">Everyone</option>' : "") +
    Object.keys(DM.state.players).map((id) => {
      const s = DM.state.players[id].snapshot || {};
      const label = [s.player, s.name].filter(Boolean).join(" · ") || id;
      return `<option value="${esc(id)}">${esc(label)}</option>`;
    }).join("");
  el.innerHTML = opts || '<option value="">No players</option>';
  if ([...el.options].some((o) => o.value === keep)) el.value = keep;
}

function renderFight() {
  const list = $("#initList");
  const label = $("#initRound");
  if (label) label.textContent = "Round " + fight.round;
  if (!list) return;
  if (!fight.order.length) {
    list.innerHTML = '<div class="empty"><b>No turn order</b>Add a player or an example creature.</div>';
    return;
  }
  if (fight.turn >= fight.order.length) fight.turn = 0;
  list.innerHTML = fight.order.map((row, i) => `
    <div class="init-row ${i === fight.turn ? "current" : ""}">
      <b>${esc(row.name)}</b>
      <span class="fine">${esc(row.kind || "")}${row.ac ? " · AC " + esc(row.ac) : ""}${row.hp != null ? " · HP " + esc(row.hp) : ""}</span>
      <span class="init-actions">
        <button type="button" class="btn sm" data-init-up="${i}" aria-label="Move up">↑</button>
        <button type="button" class="btn sm" data-init-down="${i}" aria-label="Move down">↓</button>
        <button type="button" class="btn sm" data-init-del="${i}" aria-label="Remove">✕</button>
      </span>
    </div>`).join("");
}

function addCombatant(row) {
  fight.order.push(row);
  saveRemoteTable();
  renderFight();
}
function nextTurn() {
  if (!fight.order.length) { DM.toast("Add someone to the turn order first"); return; }
  fight.turn += 1;
  if (fight.turn >= fight.order.length) { fight.turn = 0; fight.round += 1; }
  saveRemoteTable();
  renderFight();
  const cur = fight.order[fight.turn];
  DM.toast("Round " + fight.round + " · " + (cur ? cur.name : ""));
}

async function pushHp(kind) {
  const pid = $("#dmgTarget") && $("#dmgTarget").value;
  if (!pid) { DM.toast("Pick a player"); return; }
  const formula = ($("#dmgFormula") && $("#dmgFormula").value || "1d8").trim();
  const out = DM.parseDice(formula);
  const amount = Math.max(0, out.total);
  const sign = kind === "heal" ? 1 : -1;
  const names = namesFor(pid);
  const p = DM.state.players[pid];
  const s = (p && p.snapshot) || {};
  const before = Number(s.hpCurrent) || 0;
  if (DM.state.demo && p && p.snapshot) {
    let temp = Number(s.hpTemp) || 0;
    let cur = before;
    if (kind === "damage") {
      const use = Math.min(temp, amount);
      temp -= use;
      cur = Math.max(0, cur - (amount - use));
      s.hpTemp = temp;
    } else {
      const max = Number(s.hpMax) || cur;
      cur = Math.min(max || cur + amount, cur + amount);
    }
    s.hpCurrent = cur;
    DM.renderPlayers();
  }
  await DM.pushLedger(Object.assign({
    who: "DM", playerId: pid, type: kind === "heal" ? "heal" : "damage",
    what: `DM ${kind} ${amount} (${formula}: ${out.detail}) → ${names.characterName || pid}`,
    oldVal: before, newVal: (p && p.snapshot && p.snapshot.hpCurrent) || null, flag: amount >= 20
  }, names));
  const cmd = {
    type: "hp", to: pid,
    payload: { delta: sign * amount, kind: kind, formula: formula, detail: out.detail, amount: amount },
    from: DM.state.uid
  };
  await DM.pushCommand(cmd);
  rememberUndo({
    type: "hp", playerId: pid, label: kind + " " + amount,
    command: { type: "hp", to: pid, payload: { delta: -sign * amount, kind: kind === "heal" ? "damage" : "heal", formula: "undo", detail: "undo", amount: amount }, from: DM.state.uid },
    demo: function () {
      if (!p || !p.snapshot) return;
      const snap = p.snapshot;
      if (kind === "heal") snap.hpCurrent = before;
      else snap.hpCurrent = before;
      DM.renderPlayers();
    }
  });
  if (window.SSDNSAudio) window.SSDNSAudio.play(kind === "heal" ? "reward" : "attack");
  DM.toast(kind + " " + amount + " → " + (names.characterName || "player"));
}

async function rest(kind) {
  const ids = Object.keys(DM.state.players);
  await DM.pushCommand({ type: "rest", to: "all", payload: { kind: kind }, from: DM.state.uid });
  await DM.pushLedger({
    who: "DM", playerId: "all", playerName: "Party", characterName: "Everyone",
    type: "rest", what: (kind === "long" ? "Long" : "Short") + " rest for the table",
    oldVal: null, newVal: kind, flag: false
  });
  if (DM.state.demo) {
    ids.forEach((id) => {
      const s = DM.state.players[id] && DM.state.players[id].snapshot;
      if (!s) return;
      if (kind === "long") {
        s.hpCurrent = s.hpMax;
        s.hpTemp = 0;
        s.deathSaves = { success: [false, false, false], fail: [false, false, false] };
        (s.guns || []).forEach((g) => {
          if (!g) return;
          g.loaded = g.capacity;
          g.jammed = false; g.dirty = false; g.fouled = false;
          if (g.condition === "jammed" || g.condition === "dirty" || g.condition === "fouled") g.condition = "ok";
        });
      } else {
        (s.guns || []).forEach((g) => { if (g) g.dirty = false; });
      }
    });
    DM.renderPlayers();
  }
  DM.toast((kind === "long" ? "Long" : "Short") + " rest sent");
}

function renderStock() {
  const box = $("#storeList");
  if (!box) return;
  if (!fight.stock.length) {
    box.innerHTML = '<p class="lede">No session stock yet.</p>';
    return;
  }
  box.innerHTML = fight.stock.map((item, i) =>
    `<div class="init-row"><b>${esc(item.name)}</b><span>${esc(item.price)} ES</span>
      <button type="button" class="btn sm" data-stock-del="${i}">Remove</button></div>`
  ).join("");
}
async function addStock() {
  const name = ($("#stockName").value || "").trim();
  const price = parseInt($("#stockPrice").value, 10);
  if (!name || !isFinite(price)) { DM.toast("Need a name and an ES price"); return; }
  fight.stock.push({ name: name, price: price });
  $("#stockName").value = "";
  await saveRemoteTable();
  renderStock();
  DM.toast("Stock saved");
}
async function forceStore() {
  await saveRemoteTable();
  await DM.pushCommand({
    type: "open_store", to: "all",
    payload: { stock: fight.stock },
    from: DM.state.uid
  });
  DM.toast("Store opened for the table");
}

function renderPacks() {
  const box = $("#packList");
  if (!box) return;
  if (!fight.packs.length) {
    box.innerHTML = '<p class="lede">No packs saved yet.</p>';
    return;
  }
  box.innerHTML = fight.packs.map((p, i) =>
    `<div class="init-row"><b>${esc(p.name)}</b><span class="fine">${(p.items || []).length} links</span>
      <span class="init-actions">
        <button type="button" class="btn sm" data-pack-send="${i}">Send</button>
        <button type="button" class="btn sm" data-pack-del="${i}">Delete</button>
      </span></div>`
  ).join("");
}
function parsePackLines(text) {
  return String(text || "").split("\n").map((line) => {
    const parts = line.split("|");
    const name = (parts[0] || "").trim();
    const url = (parts[1] || parts[0] || "").trim();
    if (!name || !/^https?:\/\//i.test(url)) return null;
    return { name: name, url: url };
  }).filter(Boolean);
}
async function savePack() {
  const name = ($("#packName").value || "").trim();
  const items = parsePackLines($("#packLines").value);
  if (!name || !items.length) { DM.toast("Name the pack and add lines like Name | https://…"); return; }
  fight.packs.push({ id: DM.uid("pack"), name: name, items: items });
  $("#packName").value = "";
  $("#packLines").value = "";
  await saveRemoteTable();
  renderPacks();
}
async function sendPack(index) {
  const pack = fight.packs[index];
  if (!pack) return;
  const to = ($("#packTarget") && $("#packTarget").value) || "all";
  for (const item of pack.items) {
    await DM.pushHandout({ name: item.name, url: item.url, to: to, sent: true });
    await DM.pushCommand({ type: "handout", to: to, payload: { name: item.name, url: item.url }, from: DM.state.uid });
  }
  DM.toast("Sent " + pack.name);
}

function renderBestiary() {
  const box = $("#bestiaryList");
  if (!box) return;
  box.innerHTML = fight.bestiary.map((b) => `
    <article class="bestiary-card">
      <h3>${esc(b.name)}</h3>
      <p>AC ${esc(b.ac)} · HP ${esc(b.hp)}</p>
      <p>${esc(b.attacks || "")}</p>
      <p class="lede">${esc(b.traits || "")}</p>
      <button type="button" class="btn sm" data-add-beast="${esc(b.id)}">Add to initiative</button>
    </article>`).join("") || '<p class="lede">No bestiary file.</p>';
}

function lookup(q) {
  const box = $("#lookupResults");
  if (!box) return;
  const query = String(q || "").trim().toLowerCase();
  if (query.length < 2) { box.innerHTML = '<p class="lede">Type at least two letters.</p>'; return; }
  const rules = window.SSDNS_RULES || {};
  const hits = [];
  (rules.firearms || []).forEach((g) => {
    if (hits.length >= 12) return;
    if (String(g.name || "").toLowerCase().indexOf(query) < 0) return;
    const tier = g.tiers && (g.tiers.light || g.tiers.standard || Object.values(g.tiers)[0]) || {};
    const line = [tier.damage, tier.range && ("range " + tier.range), g.properties].filter(Boolean).join(" · ");
    hits.push(`<div class="feed-item"><b>${esc(g.name)}</b><div>${esc(line || "Firearm")}</div><div class="fine">${esc(g.src || "No page number in the rules data")}</div></div>`);
  });
  (rules.feats || []).forEach((f) => {
    if (hits.length >= 12) return;
    if (String(f.name || "").toLowerCase().indexOf(query) < 0) return;
    hits.push(`<div class="feed-item"><b>${esc(f.name)}</b><div>${esc(f.gist || "")}</div><div class="fine">${esc(f.src || "No page number in the rules data")}</div></div>`);
  });
  const lists = rules.spellLists || {};
  Object.keys(lists).forEach((key) => {
    const list = lists[key];
    const levels = (list && list.levels) || {};
    Object.keys(levels).forEach((lvl) => {
      (levels[lvl] || []).forEach((spell) => {
        if (hits.length >= 12) return;
        const name = String(spell).replace(/\.$/, "");
        if (name.toLowerCase().indexOf(query) < 0) return;
        hits.push(`<div class="feed-item"><b>${esc(name)}</b><div>${esc((list.title || key) + " · level " + lvl)}</div><div class="fine">spellLists in rules.js — the data has no printed PHB page</div></div>`);
      });
    });
  });
  box.innerHTML = hits.join("") || '<p class="lede">No spell, gun, or feat by that name.</p>';
}

function renderTracks() {
  const sel = $("#musicTrack");
  if (!sel) return;
  const keep = sel.value || fight.trackId;
  sel.innerHTML = fight.tracks.map((t) => `<option value="${esc(t.id)}">${esc(t.title)}</option>`).join("")
    || '<option value="">No tracks in tracks.json</option>';
  if ([...sel.options].some((o) => o.value === keep)) sel.value = keep;
}
function currentTrack() {
  const id = $("#musicTrack") && $("#musicTrack").value;
  return fight.tracks.filter((t) => t.id === id)[0] || null;
}
async function playTrack() {
  const t = currentTrack();
  if (!t) { DM.toast("No track selected"); return; }
  fight.playing = true;
  fight.loop = $("#musicLoop") && $("#musicLoop").checked;
  fight.toTable = $("#musicTable") && $("#musicTable").checked;
  const status = $("#musicStatus");
  if (window.SSDNSAudio) {
    window.SSDNSAudio.playMusic({
      file: t.file,
      loop: fight.loop,
      onmissing: function () { if (status) status.textContent = "No file at assets/music/" + t.file + " yet"; },
      onplay: function () { if (status) status.textContent = "Playing " + t.title; },
      onblocked: function () { if (status) status.textContent = "Browser blocked autoplay — press play again"; }
    });
  }
  if (fight.toTable) {
    await DM.pushCommand({
      type: "music", to: "all",
      payload: { action: "play", file: t.file, title: t.title, loop: fight.loop },
      from: DM.state.uid
    });
  }
  if (status && !status.textContent) status.textContent = "Play requested · " + t.title;
}
async function stopTrack() {
  fight.playing = false;
  if (window.SSDNSAudio) window.SSDNSAudio.stopMusic();
  const status = $("#musicStatus");
  if (status) status.textContent = "Stopped";
  if ($("#musicTable") && $("#musicTable").checked) {
    await DM.pushCommand({ type: "music", to: "all", payload: { action: "stop" }, from: DM.state.uid });
  }
}

function decorateDetail(pid) {
  const p = DM.state.players[pid];
  const s = (p && p.snapshot) || {};
  const body = $("#detailBody");
  if (!body) return;
  const guns = (s.guns || []).filter((g) => g && g.name);
  const conds = String(s.conditions || "").split(",").map((x) => x.trim()).filter(Boolean);
  const box = document.createElement("div");
  box.className = "detail-tools";
  box.innerHTML = `
    <div class="detail-section"><h3>Give equipment</h3>
      <div class="toolbar">
        <input type="text" id="detailItem" placeholder="Item that lands in their equipment">
        <button type="button" class="btn sm" id="btnDetailItem">Add to sheet</button>
      </div>
    </div>
    <div class="detail-section"><h3>Conditions</h3>
      <div class="cond-picks">${CONDITIONS.map((c) =>
        `<label class="toggle"><input type="checkbox" data-cond="${esc(c)}" ${conds.indexOf(c) >= 0 ? "checked" : ""}> ${esc(c)}</label>`
      ).join("")}</div>
      <button type="button" class="btn sm" id="btnSaveConds">Save conditions</button>
    </div>
    <div class="detail-section"><h3>Gun attack</h3>
      <div class="toolbar">
        <select id="detailGun">${guns.map((g, i) => `<option value="${i}">${esc(g.name)} · ${esc(g.loaded ?? "?")}/${esc(g.capacity ?? "?")} rounds${g.atk ? " · " + esc(g.atk) : ""}</option>`).join("") || '<option value="">No guns</option>'}</select>
        <button type="button" class="btn sm" id="btnDetailAttack">Roll to hit</button>
      </div>
    </div>
    <div class="detail-section"><h3>Death saves</h3>
      <div class="toolbar" id="deathTools"></div>
    </div>`;
  body.appendChild(box);
  const ds = s.deathSaves || { success: [false, false, false], fail: [false, false, false] };
  const tools = $("#deathTools");
  ["success", "fail"].forEach((side) => {
    for (let i = 0; i < 3; i++) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "btn sm" + (ds[side] && ds[side][i] ? " btn-primary" : "");
      b.textContent = (side === "success" ? "S" : "F") + (i + 1);
      b.addEventListener("click", async () => {
        const on = !(ds[side] && ds[side][i]);
        if (!ds[side]) ds[side] = [false, false, false];
        ds[side][i] = on;
        s.deathSaves = ds;
        b.classList.toggle("btn-primary", on);
        await DM.pushCommand({
          type: "death_save", to: pid,
          payload: { side: side, index: i, on: on },
          from: DM.state.uid
        });
        await DM.pushLedger(Object.assign({
          who: "DM", playerId: pid, type: "death_save",
          what: "Death save " + side + " " + (i + 1) + (on ? " marked" : " cleared") + " · " + (s.name || pid),
          oldVal: null, newVal: on, flag: side === "fail" && on
        }, namesFor(pid)));
      });
      tools.appendChild(b);
    }
  });
  $("#btnDetailItem").addEventListener("click", async () => {
    const text = ($("#detailItem").value || "").trim();
    if (!text) return;
    const names = namesFor(pid);
    if (DM.state.demo && s) s.equipment = (s.equipment ? s.equipment + "\n" : "") + "• " + text + " (from DM)";
    await DM.pushLedger(Object.assign({
      who: "DM", playerId: pid, type: "dm_push",
      what: "Item: " + text, oldVal: null, newVal: text, flag: false
    }, names));
    const cmd = { type: "reward_item", to: pid, payload: { text: text }, from: DM.state.uid };
    await DM.pushCommand(cmd);
    rememberUndo({
      type: "item", playerId: pid, label: "item " + text,
      command: { type: "undo_item", to: pid, payload: { text: text }, from: DM.state.uid },
      demo: function () {
        if (!s.equipment) return;
        s.equipment = s.equipment.split("\n").filter((line) => line !== "• " + text + " (from DM)").join("\n");
      }
    });
    $("#detailItem").value = "";
    DM.toast("Item sent");
  });
  $("#btnSaveConds").addEventListener("click", async () => {
    const list = $$("[data-cond]", box).filter((el) => el.checked).map((el) => el.getAttribute("data-cond"));
    s.conditions = list.join(", ");
    await DM.pushCommand({ type: "set_conditions", to: pid, payload: { list: list }, from: DM.state.uid });
    await DM.pushLedger(Object.assign({
      who: "DM", playerId: pid, type: "condition",
      what: "Conditions: " + (list.join(", ") || "cleared") + " · " + (s.name || ""),
      oldVal: null, newVal: list.join(", "), flag: false
    }, namesFor(pid)));
    DM.renderPlayers();
    DM.toast(list.length ? "Conditions set" : "Conditions cleared");
  });
  $("#btnDetailAttack").addEventListener("click", () => rollGunAttack(pid));
}

function atkNumber(text) {
  const m = String(text || "").match(/-?\d+/);
  return m ? parseInt(m[0], 10) : 0;
}
async function rollGunAttack(pid) {
  const p = DM.state.players[pid];
  const s = (p && p.snapshot) || {};
  const guns = (s.guns || []).filter((g) => g && g.name);
  const idx = parseInt($("#detailGun") && $("#detailGun").value, 10);
  const g = guns[idx];
  if (!g) { DM.toast("No gun"); return; }
  const bonus = atkNumber(g.atk);
  const nat = 1 + Math.floor(Math.random() * 20);
  const total = nat + bonus;
  if (window.SSDNSAudio) window.SSDNSAudio.play("attack");
  await DM.pushRoll({
    who: (s.player || s.name || "Player"),
    playerId: pid, uid: DM.state.uid,
    label: g.name + " attack",
    formula: "1d20" + (bonus ? (bonus >= 0 ? "+" : "") + bonus : ""),
    result: total, detail: nat + (bonus ? (bonus >= 0 ? "+" : "") + bonus : ""),
    nat1: nat === 1, isFirearm: true, private: false
  });
  const names = namesFor(pid);
  if (nat === 1) {
    g.jammed = true;
    g.condition = "jammed";
    if (window.SSDNSAudio) window.SSDNSAudio.play("jam");
    await DM.pushLedger(Object.assign({
      who: "DM", playerId: pid, type: "jam",
      what: g.name + " jammed (natural 1) · " + (names.characterName || ""),
      oldVal: null, newVal: "jammed", flag: true
    }, names));
    await DM.pushCommand({ type: "gun_event", to: pid, payload: { name: g.name, jammed: true }, from: DM.state.uid });
  }
  if (g.cracked || g.condition === "cracked") {
    const ex = 1 + Math.floor(Math.random() * 20);
    await DM.pushRoll({
      who: "DM", playerId: pid, uid: DM.state.uid,
      label: g.name + " explode check", formula: "1d20", result: ex, detail: String(ex),
      nat1: ex === 1, isFirearm: true, private: false
    });
    if (ex === 1) {
      if (window.SSDNSAudio) window.SSDNSAudio.play("explode");
      await DM.pushLedger(Object.assign({
        who: "DM", playerId: pid, type: "explode",
        what: g.name + " exploded (cracked) · " + (names.characterName || ""),
        oldVal: null, newVal: "exploded", flag: true
      }, names));
      await DM.pushCommand({ type: "gun_event", to: pid, payload: { name: g.name, exploded: true, jammed: true }, from: DM.state.uid });
      DM.toast(g.name + " explodes");
    }
  }
  DM.renderPlayers();
  DM.toast(g.name + " → " + total + (nat === 1 ? " JAM" : ""));
}

function wireClicks() {
  document.addEventListener("click", (e) => {
    const t = e.target.closest && e.target.closest("[data-init-up],[data-init-down],[data-init-del],[data-add-beast],[data-stock-del],[data-pack-send],[data-pack-del],[data-quick-roll]");
    if (!t) return;
    if (t.hasAttribute("data-init-up") || t.hasAttribute("data-init-down") || t.hasAttribute("data-init-del")) {
      const i = parseInt(t.getAttribute("data-init-up") || t.getAttribute("data-init-down") || t.getAttribute("data-init-del"), 10);
      if (t.hasAttribute("data-init-del")) fight.order.splice(i, 1);
      else if (t.hasAttribute("data-init-up") && i > 0) {
        const row = fight.order.splice(i, 1)[0];
        fight.order.splice(i - 1, 0, row);
        if (fight.turn === i) fight.turn = i - 1;
      } else if (t.hasAttribute("data-init-down") && i < fight.order.length - 1) {
        const row = fight.order.splice(i, 1)[0];
        fight.order.splice(i + 1, 0, row);
        if (fight.turn === i) fight.turn = i + 1;
      }
      saveRemoteTable();
      renderFight();
    }
    if (t.hasAttribute("data-add-beast")) {
      const b = fight.bestiary.filter((x) => x.id === t.getAttribute("data-add-beast"))[0];
      if (b) addCombatant({ id: DM.uid("en"), name: b.name, kind: "enemy", ac: b.ac, hp: b.hp, example: true });
    }
    if (t.hasAttribute("data-stock-del")) {
      fight.stock.splice(parseInt(t.getAttribute("data-stock-del"), 10), 1);
      saveRemoteTable();
      renderStock();
    }
    if (t.hasAttribute("data-pack-del")) {
      fight.packs.splice(parseInt(t.getAttribute("data-pack-del"), 10), 1);
      saveRemoteTable();
      renderPacks();
    }
    if (t.hasAttribute("data-pack-send")) sendPack(parseInt(t.getAttribute("data-pack-send"), 10));
    if (t.hasAttribute("data-quick-roll")) {
      $("#rollLabel").value = t.getAttribute("data-quick-label") || "Roll";
      $("#rollFormula").value = t.getAttribute("data-quick-roll");
      $("#btnDmRoll").click();
    }
  });
}

function fillAdds() {
  playerSelect("#dmgTarget", false);
  playerSelect("#packTarget", true);
  playerSelect("#initPlayer", false);
  const beast = $("#initEnemy");
  if (beast) {
    const keep = beast.value;
    beast.innerHTML = fight.bestiary.map((b) => `<option value="${esc(b.id)}">${esc(b.name)}</option>`).join("");
    if ([...beast.options].some((o) => o.value === keep)) beast.value = keep;
  }
}

function shortcuts(e) {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const tag = (e.target && e.target.tagName) || "";
  if (/INPUT|TEXTAREA|SELECT/.test(tag) || (e.target && e.target.isContentEditable)) return;
  const k = String(e.key || "").toLowerCase();
  if (k === "n") { e.preventDefault(); nextTurn(); }
  else if (k === "r") { e.preventDefault(); const b = $("#btnPushReward"); if (b) b.click(); }
  else if (k === "s") {
    e.preventDefault();
    if (window.SSDNSAudio) window.SSDNSAudio.play("attack");
    DM.pushCommand({ type: "sfx", to: "all", payload: { event: "attack" }, from: DM.state.uid });
  } else if (k === "m") {
    e.preventDefault();
    if (fight.playing) stopTrack(); else playTrack();
  }
}

async function bootV2() {
  loadLocalTable();
  try {
    const res = await fetch("assets/data/bestiary.json");
    if (res.ok) fight.bestiary = await res.json();
  } catch (e) {}
  try {
    const res = await fetch("../assets/music/tracks.json");
    if (res.ok) {
      const data = await res.json();
      fight.tracks = data.tracks || [];
    }
  } catch (e) {}
  renderTracks();
  renderBestiary();
  renderFight();
  renderStock();
  renderPacks();
  fillAdds();
  const undo = $("#btnUndo");
  if (undo) undo.disabled = true;
  $("#btnAddPlayer") && $("#btnAddPlayer").addEventListener("click", () => {
    const id = $("#initPlayer").value;
    const s = (DM.state.players[id] && DM.state.players[id].snapshot) || {};
    if (!id) return;
    addCombatant({ id: id, name: s.name || id, kind: "player", ac: s.ac, hp: s.hpCurrent });
  });
  $("#btnAddEnemy") && $("#btnAddEnemy").addEventListener("click", () => {
    const b = fight.bestiary.filter((x) => x.id === $("#initEnemy").value)[0];
    if (b) addCombatant({ id: DM.uid("en"), name: b.name, kind: "enemy", ac: b.ac, hp: b.hp, example: true });
  });
  $("#btnNextTurn") && $("#btnNextTurn").addEventListener("click", nextTurn);
  $("#btnPrevTurn") && $("#btnPrevTurn").addEventListener("click", () => {
    if (!fight.order.length) return;
    fight.turn -= 1;
    if (fight.turn < 0) { fight.turn = fight.order.length - 1; fight.round = Math.max(1, fight.round - 1); }
    saveRemoteTable();
    renderFight();
  });
  $("#btnDmg") && $("#btnDmg").addEventListener("click", () => pushHp("damage"));
  $("#btnHeal") && $("#btnHeal").addEventListener("click", () => pushHp("heal"));
  $("#btnShortRest") && $("#btnShortRest").addEventListener("click", () => rest("short"));
  $("#btnLongRest") && $("#btnLongRest").addEventListener("click", () => rest("long"));
  $("#btnUndo") && $("#btnUndo").addEventListener("click", undoLast);
  $("#btnAddStock") && $("#btnAddStock").addEventListener("click", addStock);
  $("#btnOpenStoreNow") && $("#btnOpenStoreNow").addEventListener("click", forceStore);
  $("#btnSavePack") && $("#btnSavePack").addEventListener("click", savePack);
  $("#btnLookup") && $("#btnLookup").addEventListener("click", () => lookup($("#lookupQ").value));
  $("#lookupQ") && $("#lookupQ").addEventListener("keydown", (e) => { if (e.key === "Enter") lookup($("#lookupQ").value); });
  $("#btnMusicPlay") && $("#btnMusicPlay").addEventListener("click", playTrack);
  $("#btnMusicStop") && $("#btnMusicStop").addEventListener("click", stopTrack);
  wireClicks();
  document.addEventListener("keydown", shortcuts);
  window.DMCCEnhance = {
    decorateDetail: decorateDetail,
    afterRender: fillAdds,
    onTable: applyRemoteTable
  };
  const origReward = document.getElementById("btnPushReward");
  if (origReward && !origReward.dataset.undoHook) {
    origReward.dataset.undoHook = "1";
    origReward.addEventListener("click", () => {
      const target = $("#rewTarget") && $("#rewTarget").value;
      const type = $("#rewType") && $("#rewType").value;
      if (type === "es") {
        const delta = parseInt($("#rewEs").value, 10) || 0;
        if (!delta) return;
        const pid = target === "all" ? Object.keys(DM.state.players)[0] : target;
        rememberUndo({
          type: "es", playerId: target, label: (delta >= 0 ? "+" : "") + delta + " ES",
          command: { type: "reward_es", to: target, payload: { delta: -delta, reason: "Undo DM reward" }, from: DM.state.uid },
          demo: function () {
            const ids = target === "all" ? Object.keys(DM.state.players) : [target];
            ids.forEach((id) => {
              const snap = DM.state.players[id] && DM.state.players[id].snapshot;
              if (snap) snap.es = Math.max(0, (snap.es || 0) - delta);
            });
            DM.renderPlayers();
          }
        });
      } else if (type === "item") {
        const text = ($("#rewText").value || "").trim();
        if (!text) return;
        rememberUndo({
          type: "item", playerId: target, label: "item " + text,
          command: { type: "undo_item", to: target, payload: { text: text }, from: DM.state.uid }
        });
      }
    }, true);
  }
}

bootV2();

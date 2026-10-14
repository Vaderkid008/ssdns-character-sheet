/**
 * Drawer spells and map cylinders share the fight and sheet gun data.
 * Enemy ammo stays off the player map.
 *   node tools/test-map-spells.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
function check(id, cond, detail) {
  if (!cond) failures.push(id + (detail ? " — " + detail : ""));
  console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + detail : ""));
}
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
function flush(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

const mapSrc = read("map/ssdns-map.js");
const hostSrc = read("map/ssdns-map-host.js");
check("src.spellEvent", mapSrc.includes("drawer:spell") && mapSrc.includes("data-sid") && hostSrc.includes('detail.spellId ? "cast"'));
check("src.cylinder", mapSrc.includes('data-act="chamber"') && mapSrc.includes("ssm-cyl-btn") && hostSrc.includes("gunCylinder"));
check("src.publicNoAmmo", !/function publicToken[\s\S]{0,800}\b(loaded|capacity|chambers|ammo)\b/.test(mapSrc));
check("src.playerRounds", /if \(!isDmPage\(\)\) \{[\s\S]{0,180}return "";[\s\S]{0,80}return ownRounds\(\)/.test(hostSrc));

function makeWindow() {
  const dom = new JSDOM("<!doctype html><html><body><div id=\"mapMount\" data-map-role=\"player\"></div><div id=\"initList\"></div></body></html>", {
    url: "http://localhost/", pretendToBeVisual: true, runScripts: "dangerously"
  });
  const w = dom.window;
  const proto = w.HTMLElement.prototype;
  try {
    Object.defineProperty(proto, "clientWidth", { configurable: true, get() { return 800; } });
    Object.defineProperty(proto, "clientHeight", { configurable: true, get() { return 600; } });
  } catch (e) {}
  proto.getBoundingClientRect = function () {
    return { x: 0, y: 0, left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, toJSON() { return {}; } };
  };
  w.__drawn = [];
  w.HTMLCanvasElement.prototype.getContext = function () {
    const bag = {};
    return new Proxy(bag, {
      get(t, p) {
        if (p in t) return t[p];
        if (typeof p !== "string") return undefined;
        if (p === "fillText") return function (text) { w.__drawn.push(String(text)); return bag; };
        if (p === "measureText") return function () { return { width: 24 }; };
        return function () { return bag; };
      },
      set(t, p, v) { t[p] = v; return true; }
    });
  };
  w.HTMLImageElement.prototype.decode = function () { return Promise.resolve(); };
  w.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
  w.confirm = () => true;
  w.prompt = () => { w.__prompted = (w.__prompted || 0) + 1; return ""; };
  w.Math.random = () => 0;
  return w;
}

const hexer = {
  id: "hexer",
  name: "Hexer",
  group: "named",
  ac: 12,
  hp: 30,
  dex: 14,
  attacks: "Stiletto +4 (1d4 piercing)",
  spellcasting: {
    ability: "INT",
    dc: 14,
    attack: 6,
    slots: { "3": 1, "1": 2 },
    spells: [
      { id: "fireball", name: "Fireball", level: 3, kind: "save", save: "DEX", summary: "DC 14 Dex save, 8d6 fire, half on a save." },
      { id: "ray-of-sickness", name: "Ray of Sickness", level: 1, kind: "attack", save: "CON", summary: "2d8 poison, and DC 13 Con save or poisoned until the end of his next turn." },
      { id: "suggestion", name: "Suggestion", level: 2, kind: "save", save: "WIS", summary: "DC 14 Wis save or the target follows a suggestion (concentration, up to 8 hours)." },
      { id: "cure-wounds", name: "Cure Wounds", level: 1, kind: "heal", summary: "Heals 1d8." }
    ]
  }
};

const w = makeWindow();
w.SSDNS_RULES = {
  spellCast: [
    { name: "Fireball", level: 3, kind: "save", save: "DEX", dice: "8d6", type: "fire", half: true },
    { name: "Ray of Sickness", level: 1, kind: "attack", dice: "2d8", type: "poison" },
    { name: "Suggestion", level: 2, kind: "save", save: "WIS" },
    { name: "Cure Wounds", level: 1, kind: "heal", dice: "1d8", healMod: true }
  ]
};
w.SSDNSTestRoll = () => 1;
w.SSDNSDmJoin = { uid() { return "p1"; }, isJoined() { return false; } };
w.SSDNSApp = {
  doc() {
    return { character: { guns: [{ weapon: "revolver", name: "Revolver", capacity: 6, loaded: 4, chambers: ["a", "a", "a", "a", "", ""] }] } };
  }
};
w.fetch = async (url) => {
  if (String(url).includes("bestiary")) return { ok: true, json: async () => [hexer] };
  return { ok: false, json: async () => ({}) };
};
w.DMCC = {
  $: (sel) => w.document.querySelector(sel),
  $$: (sel) => Array.from(w.document.querySelectorAll(sel)),
  esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); },
  state: { players: {}, ledger: [], rolls: [], demo: true, roomCode: "DUST", uid: "dm", db: {}, unsubs: [], meta: { dmUid: "dm" } },
  toast() {},
  uid(p) { w.__seq = (w.__seq || 0) + 1; return (p || "id") + w.__seq; },
  guardFocus(fn) { if (fn) fn(); },
  parseDice() { return { total: 8, detail: "8" }; },
  pushCommand(cmd) { w.__cmds = w.__cmds || []; w.__cmds.push(cmd); return Promise.resolve(); },
  pushRoll(row) { w.__rolls = w.__rolls || []; w.__rolls.push(row); return Promise.resolve(); },
  pushLedger() { return Promise.resolve(); },
  renderPlayers() {},
  roomRef(p) { return { path: "rooms/DUST/" + p }; },
  _fb: null,
  applyDemoGun(pid, payload) {
    const p = w.DMCC.state.players[pid];
    const g = p && p.snapshot && p.snapshot.guns && p.snapshot.guns[payload.index];
    if (!g) return;
    if (payload.op === "set") {
      g.loaded = payload.loaded;
      if (Array.isArray(payload.chambers)) g.chambers = payload.chambers.slice();
    } else if (payload.op === "reload") {
      const cap = Number(g.capacity) || 0;
      const max = payload.max != null ? Number(payload.max) : cap;
      const chambers = Array.isArray(g.chambers) ? g.chambers.slice() : [];
      let left = max;
      for (let k = 0; k < chambers.length && left > 0; k++) if (!chambers[k]) { chambers[k] = "round"; left -= 1; }
      g.chambers = chambers;
      g.loaded = chambers.filter(Boolean).length;
    }
  }
};
w.DMCC.state._fb = {
  ref(db, p) { return { path: p }; },
  update() { return Promise.resolve(); },
  set() { return Promise.resolve(); },
  onValue() { return function () {}; },
  get() { return Promise.resolve({ exists() { return false; }, val() { return null; } }); },
  remove() { return Promise.resolve(); }
};

function addScript(code) {
  const s = w.document.createElement("script");
  s.textContent = code;
  w.document.body.appendChild(s);
}
addScript(read("map/ssdns-map-host.js"));
check("player.enemyAmmoHidden", w.SSDNSMapHost.rounds({ id: "tok_enemy", ownerUid: "enemy", kind: "enemy" }) === "");
check("player.ownRounds", w.SSDNSMapHost.rounds({ id: "tok_me", ownerUid: "p1", kind: "player" }) === "4/6");
w.SSDNSMapCards = { get() { return { attacks: [{ name: "Enemy gun", ammo: { loaded: 2, cap: 6 } }] }; } };
check("player.ignoresEnemyCard", w.SSDNSMapHost.rounds({ id: "tok_enemy", ownerUid: "enemy" }) === "" && w.SSDNSMapHost.rounds({ id: "tok_me", ownerUid: "p1" }) === "4/6");

addScript(read("assets/js/spell-cast.js"));
addScript(read("assets/js/apply-guard.js"));
addScript(read("assets/js/conditions.js"));
addScript(read("assets/js/misfire.js"));
addScript(read("dm/assets/js/v2.js") + "\nwindow.__fightTest = { order: function () { return fight.order; }, secrets: function () { return fight.secrets; }, publicView: function () { return fight.publicView; }, undo: function () { return fight.undo; } };\n");
await flush(50);

addScript(read("map/ssdns-map-firebase.js"));
addScript(read("map/ssdns-map.js"));
const scene = JSON.parse(read("map/scene-dusty-spur.json"));
const mapWrites = [];
const adapter = w.SSDNSMapFirebase.memory({ role: "dm" });
const origWrite = adapter.write.bind(adapter);
adapter.write = (p, value, meta) => {
  mapWrites.push({ path: p, value: value == null ? null : JSON.parse(JSON.stringify(value)) });
  return origWrite(p, value, meta);
};
const el = w.document.createElement("div");
el.id = "map";
w.document.body.appendChild(el);
w.document.getElementById("mapMount").setAttribute("data-map-role", "dm");
const map = w.SSDNSMap.create({
  el, role: "dm", uid: "dm", adapter,
  host: {
    on(name, detail) {
      detail = detail || {};
      const api = w.SSDNSMapFight;
      if (!api) return;
      if (name === "drawer:link" && api.link) {
        Promise.resolve(api.link(detail)).then((patch) => {
          if (patch && map.applyLink) map.applyLink(detail.tokenId, patch);
          if (map.refreshCard) map.refreshCard(detail.tokenId || "");
        });
      } else if (name === "drawer:target") {
        const fn = detail.spellId ? api.cast : api.attack;
        if (fn) Promise.resolve(fn(detail)).then(() => map.refreshCard && map.refreshCard(detail.tokenId || ""));
      } else if (name === "drawer:chamber" && api.chamber) {
        Promise.resolve(api.chamber(detail)).then(() => map.refreshCard && map.refreshCard(detail.tokenId || ""));
      }
    },
    getCard(id) { return w.SSDNSMapCards.get(id); },
    linkChoices() { return w.SSDNSMapCards.choices(); },
    rounds(token) { return w.SSDNSMapHost.rounds(token); },
    players() { return [{ uid: "p1", id: "p1", name: "Jolene" }]; }
  },
  options: { scene, assetBase: "", players: () => [], room: { table: { initiative: { order: [], turn: 0 } } } }
});
await flush(40);
function act(name) { return el.querySelector('[data-act="' + name + '"]'); }
function click(node) { node.dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true })); }
function pick(value) {
  const sel = act("linkPick");
  sel.value = value;
  sel.dispatchEvent(new w.Event("change", { bubbles: true }));
}
click(act("addTokenBtn"));
await flush(20);
pick("beast:hexer");
await flush(40);
const caster = (w.__fightTest.order() || []).find((row) => row && row.name === "Hexer");
check("spell.row", !!(caster && caster.card && caster.card.spellcasting && caster.card.spellcasting.spells.length === 4), caster && caster.name);
const drawer = act("drawer");
check("spell.buttons", !!(drawer && drawer.textContent.includes("Fireball") && drawer.textContent.includes("DC 14") && drawer.textContent.includes("Ray of Sickness") && drawer.querySelector('[data-sid="fireball"]')));
check("spell.noPromptYet", !w.__prompted);

w.DMCC.state.players.p1 = {
  snapshot: {
    name: "Jolene", ac: 14, hpCurrent: 20, hpMax: 20, level: 5, spellDC: 13, spellAtk: 5,
    spells: { prepared: ["Fireball"], cantrips: [], slots: { 3: 1 }, spent: {} },
    guns: [{ name: "Revolver", weapon: "revolver", capacity: 6, loaded: 4, chambers: ["a", "a", "a", "a", "", ""], misfire: 1, atk: 4, damage: "1d8" }]
  }
};
w.__fightTest.order().push({
  id: "p1", playerId: "p1", kind: "player", name: "Jolene", ac: 14, hp: 20, maxHp: 20, dmActsAs: false, card: {}
});
const jolene = w.__fightTest.order().find((row) => row.playerId === "p1");
const quiet = w.SSDNSMapCards.get("p1");
check("pc.spellsListed", !!(quiet && quiet.spells.some((s) => s.name === "Fireball")));
check("pc.spellsLocked", quiet && quiet.dmActsAs === false);
const pcHtml = w.SSDNSMapCards.get(jolene.id);
const spellBtn = drawer.querySelector('[data-sid="fireball"]');
check("enemy.castReady", !!spellBtn && !spellBtn.disabled);
click(spellBtn);
check("spell.targetMode", !!(act("drawer") && act("drawer").textContent.includes("Click a token to target")));
await w.SSDNSMapFight.cast({ tokenId: caster.mapTokenId, combatantId: caster.id, spellId: "fireball", targetTokenId: "p1", targetCombatantId: "p1" });
check("spell.noDialog", !w.__prompted);
check("spell.damage", jolene.hp === 12, "hp " + jolene.hp);
check("spell.slot", caster.card.slots[3].left === 0, JSON.stringify(caster.card.slots));
check("spell.log", (w.__rolls || []).some((row) => row && String(row.detail || "").includes("Fireball")));
check("spell.undoReady", w.__fightTest.undo() && w.__fightTest.undo().restoreHp && w.__fightTest.undo().restoreHp.hp === 20);
await w.SSDNSMapFight.undo();
check("spell.undo", jolene.hp === 20, "hp " + jolene.hp);

let rayRolls = 0;
w.SSDNSTestRoll = () => {
  rayRolls += 1;
  return rayRolls === 1 ? 18 : 1;
};
jolene.hp = 20;
await w.SSDNSMapFight.cast({ tokenId: caster.mapTokenId, spellId: "ray-of-sickness", targetCombatantId: "p1" });
check("spell.attackDamage", jolene.hp === 12, "hp " + jolene.hp);
check("spell.condition", caster.pendingRider && caster.pendingRider.condition === "Poisoned", JSON.stringify(caster.pendingRider));
const rollsBefore = (w.__rolls || []).length;
w.SSDNSTestRoll = () => 1;
await w.SSDNSMapFight.cast({ tokenId: caster.mapTokenId, spellId: "suggestion", targetCombatantId: "p1" });
check("spell.concentration", caster.concentration === "Suggestion", caster.concentration);
check("spell.logged", (w.__rolls || []).length > rollsBefore);

jolene.hp = 10;
await w.SSDNSMapFight.cast({ tokenId: caster.mapTokenId, spellId: "cure-wounds", targetCombatantId: "p1" });
check("spell.heal", jolene.hp === 18, "hp " + jolene.hp);

jolene.dmActsAs = false;
const spentBefore = jolene && w.DMCC.state.players.p1.snapshot.spells.spent[3];
const locked = await w.SSDNSMapFight.cast({ tokenId: "p1", combatantId: "p1", spellId: "Fireball", targetCombatantId: caster.id });
check("pc.blocked", locked === false);
check("pc.slotKept", w.DMCC.state.players.p1.snapshot.spells.spent[3] == null || w.DMCC.state.players.p1.snapshot.spells.spent[3] === spentBefore);
jolene.dmActsAs = true;
w.SSDNSTestRoll = () => 1;
const pcCast = await w.SSDNSMapFight.cast({ tokenId: "p1", combatantId: "p1", spellId: "Fireball", targetCombatantId: caster.id });
check("pc.cast", pcCast === true && caster.hp === 22, "hp " + caster.hp + " cast " + pcCast);
check("pc.slotSpent", w.DMCC.state.players.p1.snapshot.spells.spent[3] === 1);
check("pc.sheetRoll", (w.__cmds || []).some((cmd) => cmd && cmd.type === "hex_spend"));

w.document.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
click(act("addTokenBtn"));
await flush(20);
pick("custom");
await flush(30);
const bandit = (w.__fightTest.order() || []).find((row) => row && row.kind !== "player" && row.name && row.name.indexOf("Bandit") === 0);
check("cyl.row", !!(bandit && bandit.card && bandit.card.attacks && bandit.card.attacks[0] && bandit.card.attacks[0].loaded === 6 && bandit.card.attacks[0].capacity === 6));
const gunDrawer = act("drawer");
const dots = gunDrawer ? gunDrawer.querySelectorAll('[data-act="chamber"]') : [];
check("cyl.dots", dots.length === 6 && gunDrawer.textContent.includes("6/6"), "dots " + dots.length);
const dotWrap = gunDrawer && gunDrawer.querySelector(".cylinder-row .chamber-dots");
check("cyl.oneRow", !!(dotWrap && dotWrap.querySelectorAll('[data-act="chamber"]').length === 6));
check("cyl.wrap", /\.ssm-drawer \.cylinder-row \{[^}]*flex-wrap:\s*wrap/.test(read("map/ssdns-map.css")));
check("cyl.dmBadge", w.SSDNSMapHost.rounds({ id: bandit.mapTokenId, combatantId: bandit.id, ownerUid: "" }) === "6/6", w.SSDNSMapHost.rounds({ id: bandit.mapTokenId, combatantId: bandit.id }));
w.SSDNSTestRoll = () => 15;
const livePc = () => w.__fightTest.order().find((row) => row && row.playerId === "p1");
livePc().hp = 20;
await w.SSDNSMapFight.attack({ tokenId: bandit.mapTokenId, weaponId: bandit.card.attacks[0].id, targetCombatantId: "p1" });
check("cyl.spent", bandit.card.attacks[0].loaded === 5, "loaded " + bandit.card.attacks[0].loaded);
check("cyl.hit", livePc().hp === 12, "hp " + livePc().hp);
await w.SSDNSMapFight.chamber({ tokenId: bandit.mapTokenId, weaponId: bandit.card.attacks[0].id, chamber: 0 });
check("cyl.unload", bandit.card.attacks[0].loaded === 4, "loaded " + bandit.card.attacks[0].loaded);
await w.SSDNSMapFight.chamber({ tokenId: bandit.mapTokenId, weaponId: bandit.card.attacks[0].id, chamber: 5 });
check("cyl.load", bandit.card.attacks[0].loaded === 5, "loaded " + bandit.card.attacks[0].loaded);
w.SSDNSTestRoll = () => 2;
await w.SSDNSMapFight.attack({ tokenId: bandit.mapTokenId, weaponId: bandit.card.attacks[0].id, targetCombatantId: "p1" });
check("cyl.misfire", bandit.card.attacks[0].loaded === 4 && bandit.card.attacks[0].jammed, "loaded " + bandit.card.attacks[0].loaded + " jam " + bandit.card.attacks[0].jammed);
await w.SSDNSMapFight.chamber({ combatantId: "p1", weaponId: "Revolver", chamber: 0 });
const pcGun = w.DMCC.state.players.p1.snapshot.guns[0];
check("cyl.playerSync", pcGun.chambers[0] === "" && pcGun.loaded === 3, JSON.stringify(pcGun.chambers) + " loaded " + pcGun.loaded);

const pub = mapWrites.filter((row) => row.path === "map/public/tokens/" + bandit.mapTokenId).pop();
const pubJson = JSON.stringify(pub && pub.value);
check("ammo.publicToken", !!(pub && pub.value && !("loaded" in pub.value) && !("capacity" in pub.value) && !("chambers" in pub.value) && !("ammo" in pub.value)), pubJson);
check("ammo.publicView", !JSON.stringify(w.__fightTest.publicView() || {}).includes('"loaded"'));
w.document.getElementById("mapMount").setAttribute("data-map-role", "player");
check("ammo.playerStillBlind", w.SSDNSMapHost.rounds({ id: bandit.mapTokenId, combatantId: bandit.id, ownerUid: "" }) === "");
check("ammo.playerOwn", w.SSDNSMapHost.rounds({ id: "tok_me", ownerUid: "p1" }) === "4/6");

const playerEl = w.document.createElement("div");
w.document.body.appendChild(playerEl);
const reloadBtn = w.document.createElement("button");
reloadBtn.setAttribute("data-reload", "0");
reloadBtn.setAttribute("data-gunroll", "0");
w.document.body.appendChild(reloadBtn);
let reloaded = 0;
reloadBtn.addEventListener("click", () => { reloaded += 1; });
const playerMap = w.SSDNSMap.create({
  el: playerEl, role: "player", uid: "p1", adapter: w.SSDNSMapFirebase.memory({ role: "player" }),
  host: {
    actions: {
      get() {
        return [{ id: "gunroll:0", label: "Revolver · Attack", enabled: true, cylinder: { index: 0, loaded: 4, cap: 6, chambers: [1, 1, 1, 1, 0, 0] } }];
      },
      run(id) { if (id === "reload:0") reloadBtn.click(); }
    },
    rounds(token) { return w.SSDNSMapHost.rounds(token); },
    players() { return []; }
  },
  options: { scene, assetBase: "", players: () => [], room: { table: { initiative: { order: [], turn: 0 } } } }
});
await flush(30);
const playerDots = playerEl.querySelectorAll(".cylinder-row .chamber-dot");
const playerFull = playerEl.querySelectorAll(".cylinder-row .chamber-dot.full");
check("player.cylinder", playerDots.length === 6 && playerFull.length === 4, "dots " + playerDots.length + " full " + playerFull.length);
check("player.noEnemySpell", !playerEl.textContent.includes("Fireball") && !playerEl.textContent.includes("6/6"));
const reload = playerEl.querySelector('[data-act="playerReload"]');
click(reload);
check("player.reload", reloaded === 1);
playerMap.destroy();

if (failures.length) {
  console.error(failures.length + " failed");
  process.exit(1);
}
console.log("map spells ok");

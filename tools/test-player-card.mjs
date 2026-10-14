/**
 * Player map card matches the DM token card. Spells fold on both.
 *   node tools/test-player-card.mjs
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

function makeWindow() {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/", pretendToBeVisual: true, runScripts: "dangerously" });
  const w = dom.window;
  const proto = w.HTMLElement.prototype;
  try {
    Object.defineProperty(proto, "clientWidth", { configurable: true, get() { return 800; } });
    Object.defineProperty(proto, "clientHeight", { configurable: true, get() { return 600; } });
  } catch (e) {}
  proto.getBoundingClientRect = function () {
    return { x: 0, y: 0, left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, toJSON() { return {}; } };
  };
  w.HTMLCanvasElement.prototype.getContext = function () {
    const bag = {};
    return new Proxy(bag, {
      get(t, p) {
        if (p in t) return t[p];
        if (typeof p !== "string") return undefined;
        return function () { return bag; };
      },
      set(t, p, v) { t[p] = v; return true; }
    });
  };
  w.HTMLImageElement.prototype.decode = function () { return Promise.resolve(); };
  w.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
  w.fetch = async function (url) {
    const name = String(url).split("/").pop();
    const file = name.endsWith(".json") ? path.join(root, "map", name) : "";
    if (!file || !fs.existsSync(file)) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => JSON.parse(fs.readFileSync(file, "utf8")) };
  };
  return w;
}
function addScript(w, rel) {
  const s = w.document.createElement("script");
  s.textContent = read(rel);
  w.document.body.appendChild(s);
}
function act(el, name) { return el.querySelector('[data-act="' + name + '"]'); }

const mapSrc = read("map/ssdns-map.js");
const hostSrc = read("map/ssdns-map-host.js");
const rules = read("database.rules.json");
const rulesData = read("assets/data/rules.js");
check("src.fold", mapSrc.includes("ssdns.spellFold") && mapSrc.includes("data-act=\"spellFold\""));
check("src.paths", hostSrc.includes("function ownCard") && hostSrc.includes("function setSheetTarget") && hostSrc.includes('data-fire="'));
check("src.tools", mapSrc.includes("Show my range") && mapSrc.includes("playerPingBtn") && mapSrc.includes("playerHiddenBtn"));
check("rules.untouched", !rules.includes("playerCard") && rulesData.indexOf("ssdns.spellFold") < 0);

const scene = JSON.parse(read("map/scene-dusty-spur.json"));
const w = makeWindow();
w.localStorage.removeItem("ssdns.spellFold");
addScript(w, "map/ssdns-map-firebase.js");
addScript(w, "map/ssdns-map.js");

const runs = [];
let sheetTarget = "";
const plEl = w.document.createElement("div");
w.document.body.appendChild(plEl);
const targetSel = w.document.createElement("select");
targetSel.id = "atkTarget";
targetSel.innerHTML = '<option value="">No target</option><option value="rustle">Rustle</option>';
w.document.body.appendChild(targetSel);
const pl = w.SSDNSMap.create({
  el: plEl, role: "player", uid: "p1", adapter: w.SSDNSMapFirebase.memory({ role: "player" }),
  host: {
    setSheetTarget(id) { sheetTarget = id; targetSel.value = id; },
    sheetTargets() { return [{ id: "rustle", label: "Rustle" }]; },
    actions: {
      get() {
        return [
          { id: "gunroll:0", label: "Blacksnake - Not sold · Attack", group: "attack", toHit: 6, damage: "1d6 +3 piercing", cylinder: { index: 0, loaded: 3, cap: 6, chambers: [1, 1, 1, 0, 0, 0] } },
          { id: "gunroll:1", label: "Lancaster Heavy Saddle Carbine - 6,000 ES · Attack", group: "attack", toHit: 4, damage: "1d6 +1 piercing", cylinder: { index: 1, loaded: 0, cap: 8 } },
          { id: "melee:0", label: "Melee 1 · Attack", group: "attack" },
          { id: "melee:1", label: "Bowie knife · Attack", group: "attack", toHit: 5, damage: "1d4 +3 slashing" },
          { id: "cast:0", label: "Blacksnake - Not sold · Cast", group: "spell" },
          { id: "spell:0:Fire Bolt", label: "Cast Fire Bolt", group: "spell", level: 0, kind: "attack", damage: "1d10" },
          { id: "spell:1:Magic Missile", label: "Cast Magic Missile", group: "spell", level: 1, kind: "auto", damage: "1d4" },
          { id: "pact", label: "Pact Shot", group: "spell" },
          { id: "reload:0", label: "Blacksnake · Reload", group: "gear" }
        ];
      },
      run(id, ctx) { runs.push({ id: id, chamber: ctx && ctx.chamber, targetId: ctx && ctx.targetId }); }
    },
    players() { return []; }
  },
  options: { scene, assetBase: "", players: () => [], room: { table: { initiative: { order: [], turn: 0 } } } }
});
await flush(40);
const text = plEl.textContent;
check("card.tools", !!act(plEl, "playerPingBtn") && !!act(plEl, "playerGhostBtn") && !!act(plEl, "playerCancelBtn") && !!act(plEl, "showRange"));
check("card.settings", !!act(plEl, "playerSettings") && !act(plEl, "playerSettings").open && !!act(plEl, "playerLabel") && !!act(plEl, "playerColorBtn") && !!act(plEl, "playerHiddenBtn"));
check("card.clean", text.includes("Blacksnake +6 1d6 +3 piercing [3/6]") && text.includes("Lancaster Heavy Saddle Carbine +4 1d6 +1 piercing [0/8]") && text.includes("Bowie knife +5 1d4 +3 slashing") && !text.includes("Not sold") && !text.includes("6,000") && !text.includes("Melee 1") && !/· Cast/.test(text), text.replace(/\s+/g, " ").slice(0, 400));
const first = act(plEl, "actionSlot").querySelector("button");
check("card.firstAttack", first && first.getAttribute("data-id") === "gunroll:0");
const row = plEl.querySelector(".cylinder-row");
const dots = row.querySelectorAll(".chamber-dot");
check("card.dots", dots.length === 6 && row.querySelectorAll(".chamber-dot.full").length === 3, "dots " + dots.length);
const pick = plEl.querySelector('[data-act="cylTarget"]');
pick.value = "rustle";
pick.dispatchEvent(new w.Event("change", { bubbles: true }));
check("card.target", sheetTarget === "rustle" && targetSel.value === "rustle");
dots[0].click();
check("card.chamber", runs.some((r) => r.id === "gunroll:0" && String(r.chamber) === "0" && r.targetId === "rustle"), JSON.stringify(runs));
const reload = plEl.querySelector('[data-act="playerReload"]');
reload.click();
check("card.reload", runs.some((r) => r.id === "reload:0"));
const spells = plEl.querySelector("details.ssm-spells");
check("card.spellsClosed", !!(spells && !spells.open && spells.querySelector("summary").textContent.indexOf("Spells") === 0));
check("card.spellGroups", !!plEl.querySelector(".ssm-spell-lv") && text.includes("Cantrip") && text.includes("1st") && text.includes("Fire Bolt (L0)") && text.includes("Pact Shot"));
spells.open = true;
spells.dispatchEvent(new w.Event("toggle"));
check("card.spellMemory", JSON.parse(w.localStorage.getItem("ssdns.spellFold") || "{}").player === true);
pl.refreshCard();
await flush(10);
check("card.spellStays", plEl.querySelector("details.ssm-spells").open === true);
pl.destroy();

const dmEl = w.document.createElement("div");
w.document.body.appendChild(dmEl);
let cardReads = 0;
const dm = w.SSDNSMap.create({
  el: dmEl, role: "dm", uid: "dm", adapter: w.SSDNSMapFirebase.memory({ role: "dm" }),
  host: {
    getCard(id) {
      cardReads += 1;
      if (id !== "rustle") return null;
      return {
        name: "Rustle", kind: "enemy", ac: 12, hp: { cur: 9, max: 11 }, speed: 30,
        attacks: [{ id: "cap", name: "Caplock", toHit: 4, damage: "1d10 piercing", ammo: { loaded: 1, cap: 1 } }],
        spells: [
          { id: "fb", name: "Fire Bolt", level: 0, kind: "attack", damage: "1d10" },
          { id: "mm", name: "Magic Missile", level: 1, kind: "auto", damage: "1d4" }
        ]
      };
    },
    players() { return []; }
  },
  options: {
    scene,
    tokens: { tokens: { rustle: { id: "rustle", name: "Rustle", pos: { x: 2, y: 2 }, color: "#933" } } },
    assetBase: "",
    players: () => [],
    room: { table: { initiative: { order: [], turn: 0 } } }
  }
});
await flush(40);
dm.syncCombatants({ order: [{ id: "rustle", name: "Rustle" }], turn: 0 });
const chip = act(dmEl, "turnStrip").querySelector("span");
chip.click();
await flush(20);
const drawer = act(dmEl, "drawer");
const dmSpells = drawer && drawer.querySelector("details.ssm-spells");
check("dm.spellsClosed", !!(dmSpells && !dmSpells.open && drawer.textContent.includes("Fire Bolt (L0)") && drawer.textContent.includes("Cantrip")));
check("dm.attack", drawer.textContent.includes("Caplock +4 1d10 piercing [1/1]"));
dmSpells.open = true;
dmSpells.dispatchEvent(new w.Event("toggle"));
check("dm.spellMemory", JSON.parse(w.localStorage.getItem("ssdns.spellFold") || "{}").dm === true && JSON.parse(w.localStorage.getItem("ssdns.spellFold")).player === true);
dm.refreshCard("rustle");
check("dm.spellStays", act(dmEl, "drawer").querySelector("details.ssm-spells").open === true);
dm.destroy();

w.document.body.innerHTML = `
  <p id="mapIdle"></p>
  <div id="mapMount" data-map-role="player" data-asset-base="" data-scene="scene-dusty-spur.json"></div>
  <input id="charName" value="Jolene Pike">
  <select id="atkTarget"><option value="">No target</option><option value="bandit">Bandit</option></select>
  <button type="button" data-gunroll="0">Roll</button>
  <button type="button" data-gunroll="0" data-k="2">Chamber</button>
  <button type="button" data-fire="0" data-k="2">Fire</button>
  <button type="button" data-spell-cast="0:Fire Bolt">Cast Fire Bolt</button>
  <button type="button" data-melee-roll="0">Melee</button>
  <button type="button" data-cast="0">Cast gun</button>
`;
const clicks = [];
w.document.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
  if (b.hasAttribute("data-fire")) clicks.push("fire:" + b.getAttribute("data-k"));
  else if (b.hasAttribute("data-k")) clicks.push("chamber:" + b.getAttribute("data-k"));
  else if (b.hasAttribute("data-gunroll")) clicks.push("gun");
  else if (b.hasAttribute("data-spell-cast")) clicks.push("spell:" + b.getAttribute("data-spell-cast"));
  else if (b.hasAttribute("data-cast")) clicks.push("cast");
  else clicks.push("other");
}));
w.SSDNSApp = {
  doc() {
    return { character: { name: "Jolene Pike", hpCurrent: 23, hpMax: 27, hpTemp: 0, speed: 30, guns: [{ weapon: "blacksnake", capacity: 6, chambers: [1, 1, 1, 0, 0, 0] }], melee: [{ weapon: "" }, { weapon: "bowie" }], cantrips: ["Fire Bolt"], spells: { 1: [{ name: "Magic Missile", prepared: true }, { name: "Shield", prepared: false }] } } };
  },
  compute() {
    return { ac: 14, guns: [{ w: { id: "blacksnake", name: "Blacksnake - Not sold", action: "revolver" }, atk: "+6", dmg: "1d6 +3 piercing" }] };
  }
};
w.SSDNSRules = { melee: [{ id: "bowie", name: "Bowie knife", damage: "1d4" }] };
w.SSDNSSpellCast = { lookup(name) { return name === "Fire Bolt" ? { name: name, level: 0, kind: "attack", damage: "1d10" } : { name: name, level: 1, kind: "auto", damage: "1d4" }; } };
w.SSDNSDmJoin = {
  isJoined: () => true,
  uid: () => "p_jolene",
  live: () => ({ db: {}, fb: {}, uid: "p_jolene", roomCode: "DUST", joined: true, dmUid: "dm" })
};
addScript(w, "map/ssdns-map-host.js");
w.SSDNSMapHost.syncRoom();
await flush(80);
const mount = w.document.getElementById("mapMount");
const live = mount.textContent;
check("host.header", live.includes("Jolene Pike") && live.includes("AC 14") && live.includes("HP 23/27") && live.includes("30 ft") && !!mount.querySelector(".ssm-hpbar"));
check("host.clean", live.includes("Blacksnake +6 1d6 +3 piercing [3/6]") && live.includes("Bowie knife") && !live.includes("Not sold") && !live.includes("Melee 1") && !live.includes("Shield") && !/· Cast/.test(live), live.replace(/\s+/g, " ").slice(0, 500));
const meleeAtk = w.document.createElement("span");
meleeAtk.setAttribute("data-melee-atk", "1");
meleeAtk.textContent = "+5";
const meleeDmg = w.document.createElement("span");
meleeDmg.setAttribute("data-melee-dmg", "1");
meleeDmg.textContent = "1d4 +3";
w.document.body.appendChild(meleeAtk);
w.document.body.appendChild(meleeDmg);
mount.querySelector("[data-act=playerCard]") && w.SSDNSMapHost.syncRoom();
await flush(30);
const liveAgain = w.document.getElementById("mapMount");
const chamber = liveAgain.querySelector('[data-act="playerChamber"][data-k="2"]');
const cyl = chamber && chamber.closest(".cylinder-row").querySelector("[data-act=cylTarget]");
if (cyl) {
  cyl.value = "bandit";
  cyl.dispatchEvent(new w.Event("change", { bubbles: true }));
}
if (chamber) chamber.click();
check("host.chamberPath", clicks.indexOf("fire:2") >= 0 && clicks.indexOf("gun") < 0 && w.document.getElementById("atkTarget").value === "bandit", clicks.join(","));
const spellBtn = liveAgain.querySelector('[data-act="playerSpell"]');
if (spellBtn) spellBtn.click();
check("host.spellPath", clicks.some((c) => c.indexOf("spell:0:Fire Bolt") === 0), clicks.join(","));
check("host.noCast", clicks.indexOf("cast") < 0, clicks.join(","));

if (failures.length) {
  console.error(failures.length + " failed");
  process.exit(1);
}
console.log("player card ok");

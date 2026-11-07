/**
 * Enemy drawer: HP bar in the AC / HP / Speed row, no sheet-link warning on
 * enemies, bomb / timer in the lower DM tools section.
 * Sheet 0.3.224 / DMCC 0.2.237. Map-token HP bar stays. rules.js is not edited.
 *   node tools/test-enemy-drawer-hp.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
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

const version = JSON.parse(read("version.json"));
check("ver.sheet", version.sheet === "0.3.234" && version.sheetBuild === "sheet-playtest-v03234");
check("ver.dmcc", version.dmcc === "0.2.247" && version.dmccBuild === "dmcc-playtest-v02247");
check("ver.app", read("assets/js/app.js").includes('APP_VERSION = "0.3.234"') && read("assets/js/app.js").includes("sheet-playtest-v03234"));
check("ver.dmjs", read("dm/assets/js/dmcc.js").includes('VERSION = "0.2.247"') && read("dm/assets/js/dmcc.js").includes("dmcc-playtest-v02247"));
const rulesDiff = execSync("git diff --name-only -- assets/data/rules.js database.rules.json", { cwd: root }).toString().trim();
check("rules.untouched", rulesDiff === "", rulesDiff);

const map = read("map/ssdns-map.js");
check("mapbar.kept", map.includes("function paintDmTokenHpBar") && map.includes("role === 'dm' && barHp && !t.spellPiece && t.kind !== 'asset' && t.kind !== 'chest'"));
check("src.gate", map.includes("function tokenWantsSheetLink") && map.includes("Enemies, bestiary, NPCs, and friendlies do not"));
check("src.row", map.includes('class="ssm-hpbar ssm-hpbar-row ') && map.includes('data-act="vitals"'));
check("src.tools", map.includes('data-act="dmTools"') && map.includes("function bombToolsHtml"));
const css = read("map/ssdns-map.css");
check("css.bar", css.includes(".ssm-hpbar-row") && css.includes(".ssm-hpbar-row.is-mid > span { background: #ff9800; }") && css.includes(".ssm-hpbar-row.is-low > span { background: #f44336; }") && css.includes(".ssm-dmtools"));

function makeWindow() {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost/",
    pretendToBeVisual: true,
    runScripts: "dangerously"
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
  return w;
}
function addScript(w, rel) {
  const s = w.document.createElement("script");
  s.textContent = read(rel);
  w.document.body.appendChild(s);
}
function act(el, name) {
  return el.querySelector('[data-act="' + name + '"]');
}
function follows(earlier, later) {
  if (!earlier || !later || !earlier.compareDocumentPosition) return false;
  return (earlier.compareDocumentPosition(later) & 4) !== 0;
}

const cards = {
  tok_rival: { kind: "enemy", name: "Rival Adventurer", ac: 13, hp: { cur: 16, max: 16, temp: 0 }, speed: 30, attacks: [{ id: "saber", name: "Saber", toHit: 5, damage: "1d8" }], spells: [], conditions: [] },
  tok_wolf: { kind: "enemy", name: "Wolf", ac: 13, hp: { cur: 11, max: 11 }, speed: 40, attacks: [], spells: [], conditions: [] },
  tok_stray: { kind: "pc", name: "Stray", ac: 12, hp: { cur: 8, max: 20 }, speed: 30, attacks: [], spells: [], conditions: [] },
  tok_wade: { kind: "pc", name: "Wade", ac: 15, hp: { cur: 20, max: 20 }, speed: 30, attacks: [], spells: [], conditions: [] },
  tok_horse: { kind: "enemy", name: "Spectral Horse", ac: 10, hp: { cur: 0, max: 1 }, speed: 60, noHpPool: true, attacks: [], spells: [], conditions: [] }
};

const w = makeWindow();
addScript(w, "map/interact-timers.js");
addScript(w, "map/ssdns-map-firebase.js");
addScript(w, "map/ssdns-map.js");
const scene = JSON.parse(read("map/scene-dusty-spur.json"));
const el = w.document.createElement("div");
el.id = "dm";
w.document.body.appendChild(el);
const api = w.SSDNSMap.create({
  el,
  role: "dm",
  uid: "dm",
  adapter: w.SSDNSMapFirebase.memory({ role: "dm" }),
  host: {
    getCard(id) {
      if (id === "ply_wade" || id === "wade") return cards.tok_wade;
      return cards[id] || null;
    },
    players() { return [{ uid: "wade", name: "Wade" }]; }
  },
  options: {
    scene,
    tokens: { tokens: {} },
    assetBase: "",
    players: () => [{ uid: "wade", name: "Wade" }],
    room: { table: { initiative: { order: [], turn: 0 } } }
  }
});
await flush(40);

function place(spec) {
  return api.placeLinkedToken(spec);
}
place({ id: "tok_rival", kind: "enemy", name: "Rival Adventurer", label: "Rival", combatantId: "en_rival", ownerUid: "", sheetId: "" });
place({ id: "tok_wolf", kind: "npc", name: "Wolf", label: "Wolf", combatantId: "en_wolf", ownerUid: "", sheetId: "" });
place({ id: "tok_stray", kind: "player", name: "Stray", label: "Stray", combatantId: "stray", ownerUid: "", sheetId: "missing-sheet" });
place({ id: "tok_wade", kind: "player", name: "Wade", label: "Wade", combatantId: "wade", ownerUid: "wade", sheetId: "wade" });
place({ id: "tok_horse", kind: "enemy", name: "Spectral Horse", label: "Horse", combatantId: "en_horse", ownerUid: "", sheetId: "" });
api.syncCombatants({
  round: 1, turn: 0, started: true,
  order: [
    { id: "en_rival", name: "Rival Adventurer", kind: "enemy" },
    { id: "en_wolf", name: "Wolf", kind: "enemy" },
    { id: "stray", name: "Stray", kind: "player" },
    { id: "wade", name: "Wade", kind: "player" },
    { id: "en_horse", name: "Spectral Horse", kind: "enemy" }
  ]
});
await flush(20);

function openChip(label) {
  const strip = act(el, "turnStrip");
  const chip = strip && [...strip.querySelectorAll("span")].find((s) => s.textContent.includes(label));
  if (chip) chip.click();
  return chip;
}

openChip("Rival");
await flush(20);
let drawer = act(el, "drawer");
const vitals = drawer && act(drawer, "vitals");
const bar = vitals && vitals.querySelector(".ssm-hpbar-row");
const fill = bar && bar.querySelector("span");
const bomb = drawer && act(drawer, "bombPanel");
const nudge = drawer && act(drawer, "nudgeOpen");
const atk = drawer && drawer.querySelector(".ssm-atk");
check("enemy.open", !!(drawer && drawer.textContent.includes("Rival Adventurer") && drawer.textContent.includes("enemy")), drawer && drawer.textContent.slice(0, 160));
check("enemy.noBanner", !!(drawer && !drawer.textContent.includes("Not linked to a sheet") && !act(drawer, "linkStatus")), drawer && (act(drawer, "linkStatus") && act(drawer, "linkStatus").textContent));
check("enemy.numbers", !!(vitals && vitals.textContent.includes("AC 13") && vitals.textContent.includes("HP 16/16") && act(vitals, "enemySpeed")));
check("enemy.bar", !!(bar && bar.classList.contains("is-high") && bar.getAttribute("aria-valuenow") === "16" && bar.getAttribute("aria-valuemax") === "16" && fill && fill.getAttribute("style").includes("width:100%")), fill && fill.getAttribute("style"));
check("enemy.bombBelow", !!(bomb && follows(vitals, bomb) && follows(nudge, bomb) && follows(atk, bomb) && act(drawer, "dmTools") && drawer.textContent.includes("DM tools") && drawer.textContent.includes("Bomb / timer")));
check("enemy.bombActs", !!(bomb && bomb.querySelector('[data-act="bombMode"]') && bomb.querySelector('[data-act="bombArm"]') && bomb.querySelector('[data-act="bombDefuse"]') && bomb.querySelector('[data-act="bombNow"]')));
check("enemy.lightsStay", !!(act(drawer, "dmDarkvision") && act(drawer, "dmTorch") && nudge));

cards.tok_rival.hp = { cur: 8, max: 16 };
api.refreshCard("tok_rival");
await flush(10);
drawer = act(el, "drawer");
let mid = drawer && drawer.querySelector(".ssm-hpbar-row");
check("enemy.mid", !!(mid && mid.classList.contains("is-mid") && !mid.classList.contains("is-high") && mid.querySelector("span").getAttribute("style").includes("width:50%")), mid && mid.className + " " + (mid && mid.querySelector("span").getAttribute("style")));

cards.tok_rival.hp = { cur: 2, max: 16 };
api.refreshCard("tok_rival");
await flush(10);
let low = act(el, "drawer").querySelector(".ssm-hpbar-row");
check("enemy.low", !!(low && low.classList.contains("is-low") && low.querySelector("span").getAttribute("style").includes("width:12.5%")), low && low.querySelector("span").getAttribute("style"));

cards.tok_rival.hp = { cur: 0, max: 16 };
api.refreshCard("tok_rival");
await flush(10);
drawer = act(el, "drawer");
let dead = drawer.querySelector(".ssm-hpbar-row");
check("enemy.dead", !!(dead && dead.classList.contains("is-dead") && dead.querySelector("span").getAttribute("style").includes("width:0%") && drawer.textContent.includes("Death saves") && drawer.textContent.includes("HP 0/16")));

cards.tok_rival.hp = { cur: 4, max: "" };
api.refreshCard("tok_rival");
await flush(10);
drawer = act(el, "drawer");
check("enemy.unknown", !!(act(drawer, "vitals") && act(drawer, "vitals").textContent.includes("HP 4/—") && !drawer.querySelector(".ssm-hpbar-row")));
cards.tok_rival.hp = { cur: 16, max: 16 };

openChip("Wolf");
await flush(10);
drawer = act(el, "drawer");
check("beast.noBanner", !!(drawer && drawer.textContent.includes("Wolf") && !drawer.textContent.includes("Not linked to a sheet") && act(drawer, "vitals") && act(drawer, "vitals").querySelector(".ssm-hpbar-row")));

openChip("Horse");
await flush(10);
drawer = act(el, "drawer");
check("pool.none", !!(drawer && drawer.textContent.includes("No HP pool") && !drawer.textContent.includes("Not linked") && !drawer.querySelector(".ssm-hpbar-row")));

openChip("Stray");
await flush(10);
drawer = act(el, "drawer");
const strayStatus = drawer && act(drawer, "linkStatus");
check("pc.unlinked", !!(strayStatus && strayStatus.classList.contains("is-warn") && strayStatus.textContent.includes("Not linked to a sheet")), strayStatus && strayStatus.textContent);

openChip("Wade");
await flush(10);
drawer = act(el, "drawer");
const wadeStatus = drawer && act(drawer, "linkStatus");
check("pc.linked", !!(wadeStatus && !wadeStatus.classList.contains("is-warn") && wadeStatus.textContent.includes("Linked: Wade") && !drawer.textContent.includes("Not linked to a sheet")), wadeStatus && wadeStatus.textContent);
const wadeBomb = drawer && act(drawer, "bombPanel");
const wadeIdent = drawer && drawer.querySelector(".n62-identrow");
check("pc.bombBelow", !!(wadeBomb && wadeIdent && follows(wadeIdent, wadeBomb) && act(drawer, "dmTools")));

act(el, "drawerClose").click();
act(el, "addTokenBtn").click();
await flush(20);
drawer = act(el, "drawer");
const link = drawer && act(drawer, "linkPick");
const bareBomb = drawer && act(drawer, "bombPanel");
check("bare.enemy", !!(drawer && drawer.textContent.includes("No fight card linked") && !drawer.textContent.includes("Not linked to a sheet") && follows(link, bareBomb) && act(drawer, "dmTorch")));

api.destroy();

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\nenemy drawer hp ok");

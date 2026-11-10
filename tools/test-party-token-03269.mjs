/**
 * Party token: one story marker on a big map.
 * The DM places, moves, renames, and removes it. Players see the same square and cannot drag it.
 * It is not a combatant. Sheet 0.3.280 / DMCC 0.2.293.
 *   node tools/test-party-token-03269.mjs
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

const ver = JSON.parse(read("version.json"));
check("ver", ver.sheet === "0.3.280" && ver.dmcc === "0.2.293" && ver.sheetBuild === "sheet-playtest-v03280" && ver.dmccBuild === "dmcc-playtest-v02293");
check("rules.clean", !read("assets/data/rules.js").includes("0.3.280") && !read("database.rules.json").includes("0.3.280"));
const sheet = read("index.html");
const dmHtml = read("dm/index.html");
check("cache.sheet", sheet.includes('data-act="partyTokenBtn"') === false && sheet.includes("map/ssdns-map.js?v=0.3.280-lockdc"));
check("cache.dm", dmHtml.includes("Party token") === false && dmHtml.includes("../map/ssdns-map.js?v=0.2.293-lockdc"));
check("src.button", read("map/ssdns-map.js").includes('data-act="partyTokenBtn"') && read("map/ssdns-map.js").includes(">Party token</button>"));
const gun = fs.readFileSync(path.join(root, "assets/images/party-hell-maker.webp"));
check("src.art", read("map/ssdns-map.js").includes("party-hell-maker.webp") && read("map/ssdns-map.js").includes("dm-only/hell-maker.webp") && read("map/ssdns-map.js").includes("party-six-shooter.svg") && read("map/ssdns-map.js").includes("asset-baggage-cart"));
check("art.file", gun.length > 5000 && gun.slice(0, 4).toString() === "RIFF" && !fs.existsSync(path.join(root, "assets/images/party-six-shooter.svg")));

function fakeFirebase() {
  const tree = {};
  const listeners = [];
  function clone(v) {
    if (v == null || typeof v !== "object") return v;
    return JSON.parse(JSON.stringify(v));
  }
  function get(p) {
    const parts = String(p).split("/").filter(Boolean);
    let cur = tree;
    for (const part of parts) {
      if (!cur || typeof cur !== "object" || !(part in cur)) return null;
      cur = cur[part];
    }
    return cur;
  }
  function setPath(p, value) {
    const parts = String(p).split("/").filter(Boolean);
    let cur = tree;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!cur[parts[i]] || typeof cur[parts[i]] !== "object") cur[parts[i]] = {};
      cur = cur[parts[i]];
    }
    const leaf = parts[parts.length - 1];
    if (value == null) delete cur[leaf];
    else cur[leaf] = clone(value);
  }
  function notify(p) {
    listeners.forEach((l) => {
      if (p === l.path || p.startsWith(l.path + "/") || l.path.startsWith(p + "/")) l.cb({ val: () => clone(get(l.path)) });
    });
  }
  const fb = {
    ref(_db, p) { return { path: p }; },
    onValue(r, cb) {
      const entry = { path: r.path, cb };
      listeners.push(entry);
      cb({ val: () => clone(get(r.path)) });
      return () => {
        const i = listeners.indexOf(entry);
        if (i >= 0) listeners.splice(i, 1);
      };
    },
    set(r, value) { setPath(r.path, value); notify(r.path); return Promise.resolve(); },
    update(r, value) {
      const cur = get(r.path);
      setPath(r.path, Object.assign({}, cur && typeof cur === "object" ? cur : {}, value));
      notify(r.path);
      return Promise.resolve();
    },
    remove(r) { setPath(r.path, null); notify(r.path); return Promise.resolve(); },
    get(r) {
      const val = clone(get(r.path));
      return Promise.resolve({ exists: () => val != null, val: () => val });
    }
  };
  return { fb, get };
}

function makeWindow() {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/", pretendToBeVisual: true, runScripts: "dangerously" });
  const w = dom.window;
  const proto = w.HTMLElement.prototype;
  try {
    Object.defineProperty(proto, "clientWidth", { configurable: true, get() { return 1200; } });
    Object.defineProperty(proto, "clientHeight", { configurable: true, get() { return 800; } });
  } catch (e) {}
  proto.getBoundingClientRect = function () {
    return { x: 0, y: 0, left: 0, top: 0, right: 1200, bottom: 800, width: 1200, height: 800, toJSON() { return {}; } };
  };
  w.HTMLCanvasElement.prototype.getContext = function () {
    const texts = [];
    this.__texts = texts;
    const bag = {};
    return new Proxy(bag, {
      get(t, p) {
        if (p === "fillText") return (text) => { texts.push(String(text)); };
        if (p in t) return t[p];
        if (typeof p !== "string") return undefined;
        return function () {
          if (p === "createRadialGradient" || p === "createLinearGradient") return { addColorStop() {} };
          return bag;
        };
      },
      set(t, p, v) { t[p] = v; return true; }
    });
  };
  w.HTMLImageElement.prototype.decode = function () { return Promise.resolve(); };
  w.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
  let rafN = 0;
  w.requestAnimationFrame = (fn) => { rafN += 1; const id = rafN; queueMicrotask(() => fn(id)); return id; };
  w.cancelAnimationFrame = () => {};
  w.confirm = () => true;
  w.SSDNSSpellArea = { hits: () => true };
  return w;
}
function addScript(w, rel) {
  const s = w.document.createElement("script");
  s.textContent = read(rel);
  w.document.body.appendChild(s);
}
function box(map, pred) {
  return (map.tokenBoxes() || []).find(pred) || null;
}

const scene = {
  id: "scn_trail",
  name: "Long Trail",
  grid: { cols: 80, rows: 60, px: 70 },
  walls: [],
  ambient: "bright",
  fogRevealed: true
};
const players = [{ uid: "wade", name: "Wade" }];
const order = [
  { id: "wade", playerId: "wade", name: "Wade", kind: "player", speed: 30 },
  { id: "en_bandit", name: "Bandit", kind: "enemy", speed: 30, mapTokenId: "tok_bandit" }
];
const w = makeWindow();
addScript(w, "map/ssdns-map-firebase.js");
addScript(w, "map/ssdns-map.js");
const live = fakeFirebase();
const added = [];
const dmEl = w.document.createElement("div");
dmEl.id = "dmMap";
dmEl.addEventListener("combatant:add", (e) => added.push((e.detail && e.detail.tokenId) || "add"));
w.document.body.appendChild(dmEl);
const dm = w.SSDNSMap.create({
  el: dmEl,
  role: "dm",
  uid: "dm",
  adapter: w.SSDNSMapFirebase.create({ db: {}, fb: live.fb, roomCode: "TRAIL", role: "dm" }),
  host: { players: () => players },
  options: {
    scene,
    tokens: { tokens: {} },
    assetBase: "map/",
    players: () => players,
    room: { table: { initiative: { order: order.slice(), turn: 0, started: false } } }
  }
});
await flush(40);
dm.addPlayerTokenFor("wade", { name: "Wade", quiet: true, pos: { x: 4, y: 4 } });
const pcBefore = box(dm, (t) => t.ownerUid === "wade");
const enemy = dmEl.querySelector('[data-act="addTokenBtn"]');
if (enemy) enemy.click();
await flush(20);
const enemyBefore = box(dm, (t) => t.label === "Enemy" || t.kind === "npc");
const btn = dmEl.querySelector('[data-act="partyTokenBtn"]');
check("ui.button", !!btn && btn.textContent === "Party token");
btn.click();
await flush(30);
const party = box(dm, (t) => t.story);
check("place.one", !!party && party.kind === "party" && party.label === "Party" && party.noInit && party.notTargetable && party.noHpPool && !party.ownerUid, JSON.stringify(party));
check("place.art", !!party && String(party.image || "").indexOf("party-hell-maker.webp") >= 0 && String(party.image || "").indexOf("baggage") < 0);
const again = dm.placePartyToken();
check("place.noDup", again && again.id === party.id && dm.tokenBoxes().filter((t) => t.story).length === 1);
const named = dm.renamePartyToken("The Posse");
check("rename", named === "The Posse" && box(dm, (t) => t.story).label === "The Posse");
const moved = dm.movePartyToken(30, 22);
const pcAfter = box(dm, (t) => t.id === pcBefore.id);
const enemyAfter = box(dm, (t) => t.id === enemyBefore.id);
check("move.party", moved && moved.x === 30 && moved.y === 22 && moved.othersMoved === false, JSON.stringify(moved));
check("move.pcsStay", pcAfter.x === pcBefore.x && pcAfter.y === pcBefore.y && enemyAfter.x === enemyBefore.x && enemyAfter.y === enemyBefore.y);
check("fight.noAdd", !added.some((id) => String(id).indexOf("pty_") === 0), added.join(","));
const blast = dm.tokensInBlast({ shape: "sphere", radius: 400 }, [{ x: 30, y: 22, casterSize: 1 }], 0, "");
check("blast.skips", blast.some((t) => t.id === pcBefore.id) && !blast.some((t) => t.kind === "party" || t.id === party.id), blast.map((t) => t.kind + ":" + t.id).join(","));
const texts = (dmEl.querySelector("canvas").__texts || []).join(" | ");
check("badge.none", texts.indexOf("The Posse") >= 0 && texts.indexOf("⚠") < 0 || (texts.split("The Posse").pop() || "").indexOf("⚠") !== 0);
const afterName = texts.split("The Posse");
const mark = afterName.length > 1 ? afterName[afterName.length - 1].trim().slice(0, 1) : "";
check("badge.notWarn", mark !== "⚠" && mark !== "⛓", texts.slice(texts.lastIndexOf("The Posse"), texts.lastIndexOf("The Posse") + 40));

const saved = live.get("rooms/TRAIL/map/public/tokens/" + party.id) || live.get("map/public/tokens/" + party.id);
const pub = saved || null;
check("save.public", !!pub && pub.kind === "party" && pub.pos && pub.pos.x === 30 && pub.pos.y === 22 && pub.label === "The Posse" && pub.noInit === true, JSON.stringify(pub && { kind: pub.kind, pos: pub.pos, label: pub.label, noInit: pub.noInit }));

const plEl = w.document.createElement("div");
plEl.id = "plMap";
w.document.body.appendChild(plEl);
const player = w.SSDNSMap.create({
  el: plEl,
  role: "player",
  uid: "wade",
  adapter: w.SSDNSMapFirebase.create({ db: {}, fb: live.fb, roomCode: "TRAIL", role: "player" }),
  host: { players: () => players },
  options: { scene, tokens: { tokens: {} }, assetBase: "map/", players: () => players, room: { table: { initiative: { order: order.slice(), turn: 0, started: false } } } }
});
await flush(40);
const seen = box(player, (t) => t.story);
check("player.sees", !!seen && seen.x === 30 && seen.y === 22 && seen.label === "The Posse", JSON.stringify(seen));
check("player.readonly", player.mayDrag(seen && seen.id) === false);
check("player.noButton", !plEl.querySelector('[data-act="partyTokenBtn"]'));
const zoomBefore = seen.screen;
const canvas = plEl.querySelector("canvas");
canvas.dispatchEvent(new w.WheelEvent("wheel", { deltaY: -100, clientX: 400, clientY: 300, bubbles: true }));
await flush(20);
const zoomAfter = box(player, (t) => t.story).screen;
check("zoom.changes", zoomBefore && zoomAfter && (zoomAfter.x2 - zoomAfter.x1) !== (zoomBefore.x2 - zoomBefore.x1), JSON.stringify({ before: zoomBefore, after: zoomAfter }));
check("zoom.sameSquare", box(player, (t) => t.story).x === 30 && box(player, (t) => t.story).y === 22);

const darkScene = {
  id: "scn_dark",
  name: "Night",
  grid: { cols: 40, rows: 30, px: 70 },
  walls: [],
  ambient: "dark",
  fogRevealed: false
};
const darkEl = w.document.createElement("div");
w.document.body.appendChild(darkEl);
const dark = w.SSDNSMap.create({
  el: darkEl,
  role: "player",
  uid: "loner",
  adapter: w.SSDNSMapFirebase.create({ db: {}, fb: fakeFirebase().fb, roomCode: "NIGHT", role: "player" }),
  host: { players: () => [] },
  options: { scene: darkScene, tokens: { tokens: {} }, assetBase: "map/", players: () => [], room: { table: { initiative: { order: [], turn: 0 } } } }
});
await flush(20);
check("fog.noBypass", dark.canPlayerSee("loner", "nobody") === null);

const nightLive = fakeFirebase();
const nightScene = {
  id: "scn_night",
  name: "Night trail",
  grid: { cols: 40, rows: 30, px: 70 },
  walls: [],
  ambient: "dark",
  fogRevealed: false
};
const nightDmEl = w.document.createElement("div");
w.document.body.appendChild(nightDmEl);
const nightDm = w.SSDNSMap.create({
  el: nightDmEl,
  role: "dm",
  uid: "dm",
  adapter: w.SSDNSMapFirebase.create({ db: {}, fb: nightLive.fb, roomCode: "NIGHT", role: "dm" }),
  host: { players: () => [] },
  options: { scene: nightScene, tokens: { tokens: {} }, assetBase: "map/", players: () => [], room: { table: { initiative: { order: [], turn: 0 } } } }
});
await flush(30);
nightDm.placePartyToken({ pos: { x: 12, y: 12 }, label: "Camp" });
await flush(20);
const nightPlEl = w.document.createElement("div");
w.document.body.appendChild(nightPlEl);
const nightPl = w.SSDNSMap.create({
  el: nightPlEl,
  role: "player",
  uid: "scout",
  adapter: w.SSDNSMapFirebase.create({ db: {}, fb: nightLive.fb, roomCode: "NIGHT", role: "player" }),
  host: { players: () => [] },
  options: { scene: nightScene, tokens: { tokens: {} }, assetBase: "map/", players: () => [], room: { table: { initiative: { order: [], turn: 0 } } } }
});
await flush(30);
const nightParty = box(nightPl, (t) => t.story);
check("fog.loaded", !!nightParty && nightParty.x === 12 && nightParty.y === 12);
check("fog.art", !!nightParty && String(nightParty.image).indexOf("party-hell-maker.webp") >= 0);
check("fog.hidden", nightPl.canPlayerSee("scout", nightParty && nightParty.id) === false);
const nightTexts = ((nightPlEl.querySelector("canvas") || {}).__texts || []).join(" ");
check("fog.notPainted", nightTexts.indexOf("Camp") < 0, nightTexts);

dm.removePartyToken();
await flush(30);
check("remove.dm", !box(dm, (t) => t.story));
check("remove.player", !box(player, (t) => t.story));
check("remove.pcsStay", !!box(dm, (t) => t.id === pcBefore.id) && box(dm, (t) => t.id === pcBefore.id).x === pcBefore.x);

const cartLive = fakeFirebase();
const cartEl = w.document.createElement("div");
w.document.body.appendChild(cartEl);
const cartMap = w.SSDNSMap.create({
  el: cartEl,
  role: "dm",
  uid: "dm",
  adapter: w.SSDNSMapFirebase.create({ db: {}, fb: cartLive.fb, roomCode: "CART", role: "dm" }),
  host: { players: () => [] },
  options: {
    scene,
    tokens: { tokens: {
      pty_old: { id: "pty_old", kind: "party", storyMarker: "party", name: "Party", label: "Party", image: "../assets/map-props/asset-baggage-cart.webp", pos: { x: 2, y: 2 }, sceneId: "scn_dustyspur01", noInit: true, notTargetable: true, noHpPool: true, ownerCanMove: false },
      pty_svg: { id: "pty_svg", kind: "party", storyMarker: "party", name: "Party", label: "Icon", image: "../assets/images/party-six-shooter.svg", pos: { x: 4, y: 4 }, sceneId: "scn_dustyspur01", noInit: true, notTargetable: true, noHpPool: true, ownerCanMove: false }
    } },
    assetBase: "map/",
    players: () => [],
    room: { table: { initiative: { order: [], turn: 0 } } }
  }
});
await flush(40);
const swapped = box(cartMap, (t) => t.id === "pty_old");
check("cart.replaced", !!swapped && String(swapped.image).indexOf("party-hell-maker.webp") >= 0 && String(swapped.image).indexOf("baggage") < 0, JSON.stringify(swapped && swapped.image));
const svgSwapped = box(cartMap, (t) => t.id === "pty_svg");
check("svg.replaced", !!svgSwapped && String(svgSwapped.image).indexOf("party-hell-maker.webp") >= 0, JSON.stringify(svgSwapped && svgSwapped.image));

if (failures.length) {
  console.log(failures.length + " failed");
  process.exit(1);
}
console.log("party token ok");
process.exit(0);

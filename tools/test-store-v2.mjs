/**
 * Store v2 acceptance tests from STORE-SPEC.
 */
import fs from "fs";
import path from "path";
import vm from "vm";
import { spawn } from "child_process";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
function check(cond, msg) {
  if (!cond) failures.push(msg);
}
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
function load(names) {
  const sandbox = { window: {}, console, Math, Date, JSON, parseInt, isFinite, Number, String, Object, Array };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  names.forEach((rel) => vm.runInNewContext(read(rel), sandbox, { filename: rel }));
  return sandbox;
}
function grab(src, name) {
  const start = src.indexOf("function " + name + "(");
  if (start < 0) return "";
  let i = src.indexOf("{", start);
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === "{") depth++;
    else if (src[j] === "}") {
      depth--;
      if (!depth) return src.slice(start, j + 1);
    }
  }
  return "";
}
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function ids(rows) { return (rows || []).map((row) => row.id).join("|"); }

const items = JSON.parse(read("dm/assets/data/store-items.json"));
const idsSeen = {};
check(items.length >= 200, "at least 200 items, got " + items.length);
const enums = { rarity: ["common", "uncommon", "rare"], minTown: ["camp", "boomtown", "city"], stores: ["general", "gun", "music", "traveling"] };
items.forEach((it) => {
  ["id", "name", "category", "price_es", "stores", "rarity", "minTown", "notes", "bookLine"].forEach((key) => {
    if (it[key] === undefined) failures.push(it.id + " missing " + key);
  });
  if (!it.id || idsSeen[it.id]) failures.push("duplicate or blank id " + it.id);
  idsSeen[it.id] = 1;
  if (!Array.isArray(it.stores) || !it.stores.length) failures.push(it.id + " needs stores");
  (it.stores || []).forEach((s) => { if (enums.stores.indexOf(s) < 0) failures.push(it.id + " bad store " + s); });
  if (enums.rarity.indexOf(it.rarity) < 0) failures.push(it.id + " bad rarity");
  if (enums.minTown.indexOf(it.minTown) < 0) failures.push(it.id + " bad town");
  if (it.price_es != null && (!Number.isInteger(it.price_es) || it.price_es < 0)) failures.push(it.id + " bad price");
});
["Blacksnake", "Hognose", "Borrowed Iron", "Piano", "Caster cylinder", "Caster tuning"].forEach((name) => {
  check(!items.some((it) => String(it.name).toLowerCase().indexOf(name.toLowerCase()) >= 0), name + " is not sold");
});
items.filter((it) => it.category === "gun").forEach((it) => {
  check(it.stores.indexOf("gun") >= 0 && it.stores.indexOf("general") < 0, it.name + " is gun-store only among the shops");
});
items.filter((it) => it.category === "gunsmithing").forEach((it) => {
  check(JSON.stringify(it.stores) === '["gun"]', it.name + " is gunsmithing at the gun store only");
});
function priceNamed(part) {
  const hit = items.filter((it) => it.name.toLowerCase().indexOf(part.toLowerCase()) >= 0)[0];
  return hit && hit.price_es;
}
check(priceNamed("Tuning fork") === 200, "Tuning fork 200");
check(priceNamed("Rechamber") === 500, "Rechamber 500");
check(priceNamed("Unfoul") === 500, "Unfoul 500");
check(priceNamed("ChaosMaker, Heavy") === 3000, "ChaosMaker Heavy 3000");
check(priceNamed("Big Fifty Buffalo") === 11000, "Big Fifty 11000");
check(priceNamed("Iron Suit") === 150000, "Iron Suit 150000");
check(priceNamed("Cartridges, Light (20)") === 50, "Light cartridges 50");
items.forEach((it) => {
  const shops = (it.stores || []).filter((s) => s !== "traveling");
  if (it.minTown === "camp" && shops.length && shops.every((s) => s === "gun" || s === "music")) {
    failures.push(it.name + " is camp stock for a gun or music shop");
  }
});

const box = load(["dm/assets/js/store-stock.js"]);
const Store = box.SSDNSStore;
const camp = Store.defaultStock(items, "general", "camp");
check(camp.every((it) => it.rarity === "common" && it.minTown === "camp"), "camp general default is camp commons");
check(camp.some((it) => it.name === "Trail pack") && camp.some((it) => it.name === "Cartridges, Light (20)"), "camp general includes the trail pack and light cartridges");
const boomGuns = Store.eligible(items, "gun", "boomtown").map((it) => it.name);
const cityGuns = Store.eligible(items, "gun", "city").map((it) => it.name);
["Lancaster Lever Shotgun", "Lancaster Heavy Saddle Carbine", "Lancaster Repeating Rifle", "Bison Big Fifty Buffalo Rifle"].forEach((name) => {
  check(boomGuns.indexOf(name) < 0 && cityGuns.indexOf(name) >= 0, name + " waits for a city");
});
const flat = Store.randomStock(items, "general", "city", mulberry32(42), { common: 1, uncommon: 0, rare: 0 });
check(ids(flat) === ids(Store.defaultStock(items, "general", "city")), "weight 1/0/0 matches default stock");
let uncommonHits = 0;
let uncommonTotal = 0;
const uncommonPool = Store.eligible(items, "general", "city").filter((it) => it.rarity === "uncommon");
for (let seed = 1; seed <= 2000; seed++) {
  const rolled = {};
  Store.randomStock(items, "general", "city", mulberry32(seed)).forEach((it) => { rolled[it.id] = 1; });
  uncommonPool.forEach((it) => {
    uncommonTotal += 1;
    if (rolled[it.id]) uncommonHits += 1;
  });
}
const rate = uncommonHits / uncommonTotal;
check(Math.abs(rate - 0.4) <= 0.05, "uncommon rate " + rate.toFixed(3));
for (let seed = 1; seed <= 1000; seed++) {
  const drawn = Store.merchantStock(items, mulberry32(seed));
  if (drawn.length < 6 || drawn.length > 10) failures.push("merchant size " + drawn.length + " at seed " + seed);
  if (drawn.filter((it) => it.rarity === "rare").length > 1) failures.push("merchant rare cap at seed " + seed);
  const seen = {};
  drawn.forEach((it) => {
    if (seen[it.id]) failures.push("merchant duplicate " + it.id);
    seen[it.id] = 1;
    if (it.category === "gunsmithing" || /repair/i.test(it.name)) failures.push("merchant sold a service " + it.name);
    if (it.price !== Math.ceil(it.price_es * 1.25) || !Number.isInteger(it.price)) failures.push("merchant price " + it.name);
  });
}
const big = Store.grantPlan({ id: "big-fifty-cartridges-50-90-10", name: "Big Fifty cartridges, .50-90 (10)" });
check(big.kind === "cartridge" && big.qty === 10 && big.caliber === ".50-90", "Big Fifty grants 10 of .50-90, not 50");
const named = Store.grantPlan({ name: "Big Fifty cartridges, .50-90 (10)" });
check(named.qty === 10 && named.caliber === ".50-90", "a trailing count beats the caliber number");
check(!Store.stockableCommons(items, "music", "boomtown").some((it) => /^(Drum|Bugle|Tin whistle)$/.test(it.name)), "unpriced instruments stay off default stock");

const html = read("dm/index.html");
check(!/value="eldorite"|value="apothecary"/.test(html), "eldorite dealer and apothecary are gone");
check(/name="townSize" value="camp"/.test(html) && /value="boomtown"/.test(html) && /value="city"/.test(html), "town sizes");
check(/data-store-pick="general"/.test(html) && /data-store-pick="gun"/.test(html) && /data-store-pick="music"/.test(html) && /data-store-pick="traveling"/.test(html), "four stores");

const v2 = read("dm/assets/js/v2.js");
const previewFn = grab(v2, "previewStore");
const openFn = grab(v2, "openStoreCard");
const soldFn = grab(v2, "toggleSoldOut");
check(previewFn && previewFn.indexOf("saveRemoteTable") < 0, "default and random stock stay off table/store");
check(openFn.indexOf("pricedLines") >= 0 && openFn.indexOf("saveRemoteTable") >= 0, "open writes priced lines");
const sample = Store.pricedLines([
  { id: "a", name: "A", price: 10.2, checked: true, ref: true },
  { id: "b", name: "B", price: "", checked: true },
  { id: "c", name: "C", price: 5, checked: false }
], "gun");
check(sample.length === 1 && sample[0].price === 10 && sample[0].store === "gun" && sample[0].soldOut === false, "open keeps checked whole-ES lines");
check(soldFn.indexOf("soldOut") >= 0 && soldFn.indexOf("saveRemoteTable") >= 0, "sold out writes the live row");

const sheet = read("assets/js/sheet-extras.js");
const buyFn = grab(sheet, "buy");
check(sheet.indexOf("Sold out") >= 0 && /sold \? " disabled"/.test(sheet) === false && sheet.indexOf("disabled") >= 0, "sold out row disables Buy");
check(buyFn.indexOf("soldOut") >= 0 && buyFn.indexOf("soldOut") < buyFn.indexOf("finishBuy"), "buying a sold-out line spends nothing");
check(Store.playerTabs([{ store: "gun" }, { store: "general" }, { store: "gun" }], true).join() === "general,gun", "one tab per open store, in shop order");
check(Store.playerTabs([{ store: "general" }], false).length === 0, "a closed store shows no tabs");

check(read("version.json").indexOf('"sheet": "0.3.16"') >= 0 && read("version.json").indexOf('"dmcc": "0.2.29"') >= 0, "versions");

function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
async function viewport() {
  const port = 8765;
  const server = spawn("python3", ["-m", "http.server", String(port), "--bind", "127.0.0.1"], { cwd: root, stdio: "ignore" });
  const chrome = spawn("google-chrome", [
    "--headless=new", "--disable-gpu", "--no-sandbox", "--remote-debugging-port=9222",
    "--window-size=375,667", "--user-data-dir=/tmp/chrome-store-v2"
  ], { stdio: "ignore" });
  try {
    let ver = null;
    for (let i = 0; i < 40 && !ver; i++) {
      await wait(250);
      try { ver = await fetch("http://127.0.0.1:9222/json/version").then((r) => r.json()); } catch (e) {}
    }
    if (!ver) throw new Error("chrome did not open a debug port");
    const ws = new WebSocket(ver.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
    let seq = 0;
    const pending = {};
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending[msg.id]) pending[msg.id](msg.result);
    };
    function send(method, params) {
      const id = ++seq;
      return new Promise((resolve) => {
        pending[id] = resolve;
        ws.send(JSON.stringify({ id, method, params: params || {} }));
      });
    }
    const target = await send("Target.createTarget", { url: "http://127.0.0.1:" + port + "/dm/index.html?demo=1" });
    const session = await send("Target.attachToTarget", { targetId: target.targetId, flatten: true });
    const sid = session.sessionId;
    function sessionSend(method, params) {
      const id = ++seq;
      return new Promise((resolve) => {
        pending[id] = resolve;
        ws.send(JSON.stringify({ id, method, params: params || {}, sessionId: sid }));
      });
    }
    await sessionSend("Emulation.setDeviceMetricsOverride", { width: 375, height: 667, deviceScaleFactor: 1, mobile: true });
    await sessionSend("Runtime.enable");
    await wait(1200);
    await sessionSend("Runtime.evaluate", { expression: "document.getElementById('btnLoadDemo') && document.getElementById('btnLoadDemo').click()", awaitPromise: true });
    await wait(400);
    await sessionSend("Runtime.evaluate", { expression: "document.getElementById('tab-store').click()", awaitPromise: true });
    await wait(500);
    await sessionSend("Runtime.evaluate", {
      expression: "(() => { const open = document.querySelector('[data-store-open]'); if (open) open.scrollIntoView({ block: 'end', inline: 'nearest' }); })()",
      returnByValue: true
    });
    await wait(200);
    const measured = await sessionSend("Runtime.evaluate", {
      expression: `(() => {
        const open = document.querySelector('[data-store-open]');
        const fab = document.querySelector('.dock-fab');
        const buttons = Array.from(document.querySelectorAll('.store-actions .btn, .town-opt, .store-opt'));
        const box = (el) => {
          if (!el) return null;
          const r = el.getBoundingClientRect();
          const s = getComputedStyle(el);
          return { top: r.top, left: r.left, right: r.right, bottom: r.bottom, width: r.width, height: r.height, display: s.display };
        };
        const a = box(open), b = box(fab);
        const overlap = a && b && a.display !== 'none' && b.display !== 'none' && a.right > b.left + 0.5 && a.left < b.right - 0.5 && a.bottom > b.top + 0.5 && a.top < b.bottom - 0.5;
        const short = buttons.filter((el) => el.getBoundingClientRect().height < 44).map((el) => el.textContent.trim());
        const overflow = document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
        return JSON.stringify({ overlap: !!overlap, overflow: overflow, open: a, fab: b, short: short, buttons: buttons.length });
      })()`,
      returnByValue: true
    });
    const inner = measured && (measured.result || measured);
    const raw = inner && (inner.value || (inner.result && inner.result.value));
    if (!raw) throw new Error("no viewport measurement " + JSON.stringify(measured));
    const data = JSON.parse(raw);
    check(!data.overlap, "Open Store misses the Feed button at 375px " + raw);
    check(!data.overflow, "store page does not scroll sideways at 375px " + raw);
    check(!data.short.length, "store buttons are at least 44px, short: " + data.short.join(", "));
    check(data.buttons > 0, "store buttons rendered");
    ws.close();
  } finally {
    chrome.kill("SIGKILL");
    server.kill("SIGKILL");
  }
}

const logicFails = failures.length;
await viewport().catch((err) => failures.push("viewport: " + err.message));

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("ok store v2 (" + logicFails + " logic failures before viewport)");

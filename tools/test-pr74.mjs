/**
 * PR74: reload gaps. Gunsmith rechamber (500 ES per tier step, Plinker .22 -> .32 only, DM free),
 * Gunslinger Quick Reload (bonus action), per-turn action pips (warn, never block, reset on turn),
 * Unload cost shown, DMCC demo reload uses the chosen ammo pile.
 *   node tools/test-pr74.mjs
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
function check(id, cond, detail) {
  if (!cond) failures.push(id);
  console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + detail : ""));
}
const read = (r) => fs.readFileSync(path.join(root, r), "utf8");

const html = read("index.html").replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
const dom = new JSDOM(html, { url: "http://127.0.0.1:8765/index.html", pretendToBeVisual: true, runScripts: "dangerously" });
const window = dom.window;
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
window.HTMLCanvasElement.prototype.getContext = function () { const bag = {}; return new Proxy(bag, { get(t, p) { return p in t ? t[p] : () => bag; }, set(t, p, v) { t[p] = v; return true; } }); };
window.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
const toasts = [];
window.SSDNSToast = (m) => { toasts.push(String(m)); };
const run = (rel) => vm.runInContext(read(rel), dom.getInternalVMContext(), { filename: rel });
["assets/data/rules.js", "assets/js/ssdns-bridge.js", "assets/js/storage.js", "assets/js/misfire.js", "assets/js/action-pips.js", "assets/js/app.js"].forEach(run);
window.SSDNSToast = (m) => { toasts.push(String(m)); };
const app = window.SSDNSApp, P = window.SSDNSActionPips, doc = window.document;
const c = app.doc().character;
const g = c.guns[0];
c.es = 2000;
c.ammo = [{ type: "cartridge", caliber: "Light", count: 12 }, { type: "cartridge", caliber: "Heavy", count: 6 }];
function arm(id, chamber) {
  g.weapon = id; g.chamber = chamber; g.tier = chamber.split("|")[0]; g.chamberSet = true; g.equipped = true;
  g.loaded = 0; g.chambers = []; g.jammed = false; g.ammoPool = "";
}

/* 1. rechamber */
arm("dulls-rolling-block-rifle", "light|.22 LR");
const opts = app.rechamberOptions(0);
const heavy = opts.find((o) => o.value === "heavy|.45-70");
const same = opts.find((o) => o.value === "light|.44 rimfire");
check("rc.cost.steps", heavy && heavy.cost === 1000 && heavy.steps === 2, JSON.stringify(heavy));
check("rc.cost.sameTier", same && same.cost === 500);
app.reloadGun(0);
check("rc.preloaded", g.loaded === 1, toasts.slice(-3).join(" | ") + " pools=" + JSON.stringify(app.ammoChoices(0)) + " same=" + (app.doc().character === c) + JSON.stringify(app.doc().character.ammo) + JSON.stringify(app.doc().character.guns[0]));
let r = app.rechamberGun(0, "heavy|.45-70");
check("rc.paid", r.ok && r.paid === 1000 && c.es === 1000, JSON.stringify(r) + " es=" + c.es);
check("rc.applied", g.chamber === "heavy|.45-70" && g.tier === "heavy" && g.loaded === 0);
check("rc.roundsBack", c.ammo[0].count === 12, String(c.ammo[0].count));
c.es = 100;
r = app.rechamberGun(0, "medium|.44-40");
check("rc.noMoney", !r.ok && g.chamber === "heavy|.45-70" && c.es === 100);
r = app.rechamberGun(0, "medium|.44-40", { free: true });
check("rc.dmFree", r.ok && r.paid === 0 && g.chamber === "medium|.44-40" && c.es === 100);
arm("dullards-plinker-revolver", "light|.22 LR");
const pl = app.rechamberOptions(0);
check("rc.plinker", pl.length === 1 && pl[0].value === "light|.32 rimfire" && pl[0].allowed && pl[0].cost === 500);
arm("dullards-plinker-revolver", "light|.32 rimfire");
const pl2 = app.rechamberOptions(0);
check("rc.plinkerBack", pl2.length === 1 && !pl2[0].allowed && /only goes from \.22/.test(pl2[0].why));
c.es = 5000;
check("rc.plinkerBlocked", !app.rechamberGun(0, "light|.22 LR").ok && g.chamber === "light|.32 rimfire");
arm("dulls-rolling-block-rifle", "light|.22 LR");
app.openRechamber(0);
const modal = doc.querySelector(".rc-modal");
check("rc.modal", !!modal && modal.querySelectorAll(".rc-row").length === 3 && /500 ES per tier step/.test(modal.textContent));
modal.querySelector('input[value="medium|.44-40"]').checked = true;
modal.dispatchEvent(new window.Event("change", { bubbles: true }));
modal.querySelector(".rc-btns .btn:last-child").click();
check("rc.modalPays", g.chamber === "medium|.44-40" && c.es === 4500 && !doc.querySelector(".rc-modal"));

/* 2. Quick Reload */
arm("henrietta-repeating-rifle", "medium|.44-40");
c.calling = "gunslinger"; c.level = 2;
check("qr.lvl2", app.reloadCost(0) === "action");
c.level = 3;
check("qr.lvl3", app.reloadCost(0) === "bonus");
arm("navy-army-ball-n-cap-revolver", "medium|");
check("qr.slowFull", app.reloadCost(0) === "full");
arm("dulls-rolling-block-rifle", "heavy|.45-70");
check("qr.rbHeavy", app.reloadCost(0) === "action");
arm("dulls-rolling-block-rifle", "light|.22 LR");
check("qr.rbLight", app.reloadCost(0) === "bonus");
c.calling = "lawman";
check("qr.otherCalling", app.reloadCost(0) === "action");

/* 3. pips */
P.reset(true);
c.calling = "gunslinger"; c.level = 3;
arm("dulls-rolling-block-rifle", "light|.22 LR");
c.ammo[0].count = 12;
app.renderAll ? app.renderAll() : null;
const btn = (sel) => { const b = doc.createElement("button"); Object.entries(sel).forEach(([k, v]) => b.setAttribute(k, v)); doc.body.appendChild(b); b.click(); b.remove(); };
btn({ "data-reload": "0" });
check("pips.bonusSpent", P.state().bonus && !P.state().action && g.loaded === 1, JSON.stringify(P.state()) + " loaded " + g.loaded);
toasts.length = 0;
btn({ "data-unload": "0" });
check("pips.unloadAction", P.state().action && g.loaded === 0);
btn({ "data-reload": "0" });
check("pips.warnNotBlock", g.loaded === 1 && toasts.some((t) => /already used your bonus action/.test(t) && /DM can allow/.test(t)), toasts.join(" | "));
btn({ "data-unload": "0" });
P.onTurn({ round: 2, turn: 0, order: [{ name: "A" }] });
check("pips.resetOnTurn", !P.state().action && !P.state().bonus);
P.spend("action", "x"); P.onTurn({ round: 2, turn: 0, order: [{ name: "A" }] });
check("pips.sameTurnKeeps", P.state().action);
P.reset(true);
const before = g.loaded;
btn({ "data-unload": "0" });
check("pips.noChangeNoSpend", !P.state().action && g.loaded === before);
check("pips.fullTurn", P.needs("full").join(",") === "action,bonus" && P.needs("free").length === 0);
P.paint();
check("pips.ui", !!doc.querySelector(".firearms [data-act-pips] .pip-action") && !!doc.querySelector("[data-pips-reset]"));

/* cost tags + unload shown */
const appSrc = read("assets/js/app.js"), css = read("assets/css/sheet.css");
check("tags.unload", appSrc.includes('unloadBtn.setAttribute("data-cost", "Action")') && /button\[data-cost\]::after/.test(css));
check("tags.reload", appSrc.includes("Quick Reload") && appSrc.includes('"data-rechamber": i'));

/* 4. DMCC demo reload uses the chosen pile */
const dmcc = read("dm/assets/js/dmcc.js");
const m = dmcc.match(/function demoReloadPool[\s\S]*?\n}\n/);
const sb = {}; vm.createContext(sb); vm.runInContext(m[0] + ";this.f=demoReloadPool;", sb);
const pools = [{ idx: 0, type: "cartridge", caliber: "Medium", count: 5 }, { idx: 2, type: "cartridge", caliber: ".44-40", count: 9 }];
check("demo.chosen", sb.f({}, { ammoPool: "2", pools }).caliber === ".44-40");
check("demo.fallback", sb.f({}, { ammoPool: "", pools }).idx === 0);
check("demo.none", sb.f({}, { pools: [] }) === null);
check("demo.wired", dmcc.includes("const pick = demoReloadPool(p.snapshot, g);") && dmcc.includes('"k:" + (pick.type'));
check("dm.rechamber", dmcc.includes('data-gun-op="rechamber"') && read("assets/js/dm-join.js").includes('payload.op === "rechamber"') && read("assets/js/dm-join.js").includes("{ free: true }"));
check("rules.untouched", !read("database.rules.json").includes("rechamber"));
if (failures.length) { console.error("pr74 FAIL: " + failures.join(", ")); process.exit(1); }
console.log("pr74 ok");
process.exit(0);

/**
 * Saloon wallet v0.3.0: bank requests, unlink confirmation, stale link, tap targets.
 *   node tools/test-saloon.mjs
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

const walletSrc = read("games/ssdns-wallet.js");
const theme = read("games/saloon-theme.css");
const v2 = read("dm/assets/js/v2.js");
const dmcc = read("dm/assets/js/dmcc.js");
const join = read("assets/js/dm-join.js");
const rules = read("database.rules.json");

check("src.noPrompt", !/prompt\s*\(/.test(walletSrc));
check("src.version", walletSrc.includes("v0.3.0"));
check("src.artUrls", theme.includes('url("_art/') && !theme.includes("../_art/"));
check("src.artWired", ["--art-wall", "--art-wood", "--art-felt-green", "--art-felt-red", "--art-card-back", "--art-parchment", "--art-brass", "--art-slot-cabinet", "--art-wheel-rim"].every((name) => {
  const uses = theme.split(name).length - 1;
  return uses >= 2;
}));
check("src.noChipVar", !theme.includes("--chip-"));
check("src.tap", theme.includes("min-height: 44px") && theme.includes(".bet-btn") && theme.includes(".num-btn") && theme.includes(".stake-btn"));
check("src.bankSkip", v2.includes('req.type === "bank"') && /function applyRequest[\s\S]{0,120}req\.type === "bank"/.test(v2));
check("src.approvePath", dmcc.includes('type: "reward_es"') && dmcc.includes('grantId: "bank:"'));
check("src.noDirectGameWrite", !/function onSaloonMessage[\s\S]{0,1200}applyDelta/.test(join));
check("src.bankRow", join.includes('type: "bank"') && join.includes("encounter/requests/"));
check("src.rulesUntouched", rules.includes('"encounter"') && rules.includes('"requests"'));
check("src.linkedCopy", /summary\.textContent = "Linked to " \+ name \+ " · " \+ last \+ " ES"/.test(walletSrc));

function boot(opts) {
  const dom = new JSDOM("<!doctype html><html><body><p id=\"status\">Set chips, then play.</p><div class=\"buyin\"><button id=\"setChipsBtn\">Set</button><button id=\"addChipsBtn\">Add</button><input id=\"chipInput\"></div></body></html>", {
    url: "http://localhost/games/slot-machine/index.html",
    runScripts: "dangerously"
  });
  const w = dom.window;
  const hub = [];
  w.BroadcastChannel = function () {
    this.handlers = [];
    hub.push(this);
  };
  w.BroadcastChannel.prototype.postMessage = function (data) {
    hub.forEach((b) => {
      if (b === this) return;
      b.handlers.forEach((fn) => fn({ data: data }));
    });
  };
  w.BroadcastChannel.prototype.addEventListener = function (type, fn) { this.handlers.push(fn); };
  const deltas = [];
  let wallet = opts.wallet || null;
  let balance = 0;
  w.SSDNSBridge = {
    cpValue: (s) => (s && (Number(s.white) || 0) + (Number(s.blue) || 0) * 10) || 0,
    applyDelta: (n, by) => { deltas.push([n, by]); return null; },
    readWallet: () => wallet,
    onChange: () => {}
  };
  w.SSDNSGame = {
    id: "slot-machine",
    get: () => balance,
    set: (n) => { balance = n; },
    busy: () => false
  };
  if (opts.alive) w.localStorage.setItem("ssdns.sheet.alive", JSON.stringify(opts.alive));
  w.eval(walletSrc);
  return { w, hub, deltas, balance: () => balance, setWallet: (next) => { wallet = next; } };
}

const stale = boot({
  wallet: { characterId: "c_test", characterName: "Jolene Pike", shards: { white: 3, blue: 2 }, updatedAt: "2020-01-01T00:00:00.000Z" }
});
check("stale.unlinked", stale.w.SSDNSWallet.isLinked() === false);
check("stale.noDelta", stale.deltas.length === 0);
check("stale.banner", stale.w.document.querySelector(".link-summary").textContent.indexOf("Not linked") === 0);

const fresh = boot({
  wallet: { characterId: "c_test", characterName: "Jolene Pike", shards: { white: 3, blue: 2 } },
  alive: { characterId: "c_test", at: Date.now() }
});
check("fresh.linked", fresh.w.SSDNSWallet.isLinked() === true);
check("fresh.balance", fresh.balance() === 23, String(fresh.balance()));
check("fresh.copy", fresh.w.document.querySelector(".link-summary").textContent === "Linked to Jolene Pike · 23 ES");
check("fresh.noSetChips", fresh.w.document.querySelector(".ssdns-link").textContent.indexOf("Set chips") < 0);
check("fresh.status", fresh.w.document.getElementById("status").textContent.indexOf("Set chips") < 0);
check("fresh.buyinHidden", fresh.w.document.querySelector(".buyin").style.display === "none");

const heard = [];
const sheet = new fresh.w.BroadcastChannel("ssdns-saloon");
sheet.addEventListener("message", (ev) => heard.push(ev.data));
fresh.w.document.querySelector(".buy-chips").click();
fresh.w.document.querySelector(".buy-amt").value = "25";
fresh.w.document.querySelector(".buy-send").click();
check("buy.asked", heard.some((m) => m.type === "requestCredits" && m.amount === 25));
check("buy.noDelta", fresh.deltas.length === 0);
check("buy.pending", fresh.w.SSDNSWallet.isLinked() === true);
sheet.postMessage({ type: "credits", id: heard[0].id, ok: true, amount: 25 });
await new Promise((r) => setTimeout(r, 20));
check("buy.approvedCopy", fresh.w.document.querySelector(".link-detail").textContent.indexOf("Approved") === 0);
check("buy.stillNoDelta", fresh.deltas.length === 0, "game must not write the credit");

let saw = null;
fresh.w.saloonHost.onWallet((w) => { saw = w; });
check("onWallet", saw && saw.characterId === "c_test");

const before = fresh.w.SSDNSWallet.isLinked();
fresh.w.document.querySelector(".link-unlink").click();
check("unlink.waits", before === true && fresh.w.SSDNSWallet.isLinked() === true);
const unlinkMsg = heard.filter((m) => m.type === "unlink").pop();
check("unlink.asked", !!unlinkMsg);
sheet.postMessage({ type: "unlinked", id: unlinkMsg.id, ok: true });
await new Promise((r) => setTimeout(r, 20));
check("unlink.confirmed", fresh.w.SSDNSWallet.isLinked() === false);

const old = boot({
  wallet: { characterId: "c_test", characterName: "Jolene Pike", shards: { white: 1 } },
  alive: { characterId: "c_test", at: Date.now() - 10 * 60 * 1000 }
});
check("timeout.stale", old.w.SSDNSWallet.isLinked() === false);

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\nall saloon checks passed");
process.exit(0);

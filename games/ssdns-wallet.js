/*
 * SSDNS Saloon wallet adapter (v0.3.0). Loaded after ssdns-bridge.js and the game's game.js.
 * Contract: the game exposes window.SSDNSGame = { id, get(), set(n), busy() } and calls
 * window.SSDNSWallet.seen(balance) whenever its chip balance changes. 1 chip = 1 ES.
 *
 * Linked: chips = the character's shards. Set/Add are hidden. Buy chips calls
 * host.requestCredits and does not write the wallet. Unlink calls host.unlink and
 * waits for the sheet to confirm.
 * Not linked: Set/Add work exactly as before (pretend chips).
 *
 * host (this file talks to the open character sheet):
 *   host.requestCredits({amount, reason}) -> Promise<{ok, amount}>
 *   host.unlink() -> Promise<{ok}>
 *   host.onWallet(cb)
 */
(function () {
  "use strict";
  var CHEAT_KEY = "ssdns.saloon.cheat";
  var BAN_KEY = "ssdns.saloon.banned";
  function storageGet(store, key) {
    try { return store.getItem(key); } catch (e) { return null; }
  }
  function storageSet(store, key, val) {
    try { store.setItem(key, val); } catch (e) {}
  }
  function insightDC(high) { return high ? 16 : 13; }
  function sleightMod(wallet) {
    var n = wallet && wallet.sleight != null ? Math.floor(Number(wallet.sleight)) : 0;
    return isFinite(n) ? n : 0;
  }
  function rollD20(rng) {
    var n = typeof rng === "function" ? Number(rng()) : (Math.floor(Math.random() * 20) + 1);
    if (!isFinite(n)) n = 1;
    n = Math.floor(n);
    if (n < 1) n = 1;
    if (n > 20) n = 20;
    return n;
  }
  function attempt(opts) {
    opts = opts || {};
    var high = !!opts.high;
    var dc = insightDC(high);
    var mod = opts.mod != null ? Math.floor(Number(opts.mod)) : sleightMod(opts.wallet);
    if (!isFinite(mod)) mod = 0;
    var used = storageGet(sessionStorage, CHEAT_KEY) === "1";
    var banned = storageGet(sessionStorage, BAN_KEY) === "1";
    if (used || banned) return { ok: false, blocked: true, banned: banned, used: true, dc: dc, mod: mod };
    var natural = rollD20(opts.roll);
    var total = natural + mod;
    var success = total >= dc;
    var caught = !success && total <= dc - 5;
    storageSet(sessionStorage, CHEAT_KEY, "1");
    if (caught) storageSet(sessionStorage, BAN_KEY, "1");
    return { ok: true, natural: natural, mod: mod, total: total, dc: dc, success: success, caught: caught, high: high, used: true };
  }
  function report(opts) {
    opts = opts || {};
    var id = "saloon_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    var msg = {
      type: "tableLine",
      id: id,
      text: String(opts.text || ""),
      name: String(opts.name || ""),
      color: String(opts.color || ""),
      notice: opts.notice ? String(opts.notice) : ""
    };
    var bus = null;
    try { bus = new BroadcastChannel("ssdns-saloon"); } catch (e) {}
    if (bus) { try { bus.postMessage(msg); } catch (e2) {} }
    if (window.opener && !window.opener.closed) {
      try { window.opener.postMessage(msg, window.location.origin); } catch (e3) {}
    }
    return msg;
  }
  function line(name, verb, amount, game) {
    var who = String(name || "Someone");
    var n = Math.abs(Math.floor(Number(amount) || 0));
    if (verb === "push") return who + " pushes at " + game;
    if (verb === "win") return who + " wins " + n + " at " + game;
    return who + " loses " + n + " at " + game;
  }
  function post(verb, amount, game, extra) {
    extra = extra || {};
    var w = window.SSDNSBridge && window.SSDNSBridge.readWallet && window.SSDNSBridge.readWallet();
    var name = extra.name || (w && w.characterName) || "You";
    var color = extra.color || (w && w.tokenColor) || "";
    var text = extra.text || line(name, verb, amount, game);
    return report({ text: text, name: name, color: color, notice: extra.notice || "" });
  }
  window.SSDNSSaloon = {
    insightDC: insightDC,
    sleightMod: sleightMod,
    attempt: attempt,
    report: report,
    line: line,
    post: post,
    banned: function () { return storageGet(sessionStorage, BAN_KEY) === "1"; },
    used: function () { return storageGet(sessionStorage, CHEAT_KEY) === "1"; }
  };
  if (typeof window.SSDNSSaloonReady === "function") {
    try { window.SSDNSSaloonReady(); } catch (e) {}
  }

  var B = window.SSDNSBridge, G = window.SSDNSGame;
  if (!B || !G) return;
  var STALE_MS = 3 * 60 * 1000;
  var ALIVE_KEY = "ssdns.sheet.alive";
  var OPT_KEY = "ssdns.saloon.unlinked";
  var linked = false, last = null, name = "", charId = "";
  var waiters = {};
  var walletCbs = [];
  var bus = null;
  try { bus = new BroadcastChannel("ssdns-saloon"); } catch (e) {}

  function aliveRec() {
    try {
      var a = JSON.parse(localStorage.getItem(ALIVE_KEY) || "null");
      if (!a || !a.characterId) return null;
      if (Date.now() - Number(a.at) > STALE_MS) return null;
      return a;
    } catch (err) { return null; }
  }
  function optedOut(id) {
    try { return sessionStorage.getItem(OPT_KEY) === id; } catch (err) { return false; }
  }
  function fresh(w) {
    if (!w || !w.characterId) return null;
    var a = aliveRec();
    if (!a || a.characterId !== w.characterId) return null;
    if (optedOut(w.characterId)) return null;
    return w;
  }
  function ask(type, extra, ms) {
    return new Promise(function (resolve) {
      var id = type + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      var timer = setTimeout(function () {
        delete waiters[id];
        resolve({ ok: false, reason: "timeout" });
      }, ms);
      waiters[id] = function (msg) {
        clearTimeout(timer);
        delete waiters[id];
        resolve(msg || { ok: false });
      };
      var msg = { type: type, id: id };
      if (extra) Object.keys(extra).forEach(function (k) { msg[k] = extra[k]; });
      var sent = false;
      if (bus) { try { bus.postMessage(msg); sent = true; } catch (err) {} }
      if (window.opener && !window.opener.closed) {
        try { window.opener.postMessage(msg, window.location.origin); sent = true; } catch (err) {}
      }
      if (!sent) {
        clearTimeout(timer);
        delete waiters[id];
        resolve({ ok: false, reason: "no host" });
      }
    });
  }
  function onHost(ev) {
    var msg = ev && ev.data;
    if (!msg || !msg.id || !waiters[msg.id]) return;
    if (msg.type !== "credits" && msg.type !== "unlinked") return;
    waiters[msg.id](msg);
  }
  if (bus) bus.addEventListener("message", onHost);
  window.addEventListener("message", onHost);

  var host = {
    requestCredits: function (opts) {
      opts = opts || {};
      return ask("requestCredits", {
        amount: Math.floor(Number(opts.amount) || 0),
        reason: opts.reason || ("saloon:" + G.id)
      }, 120000);
    },
    unlink: function () { return ask("unlink", {}, 8000); },
    onWallet: function (cb) {
      if (typeof cb !== "function") return;
      walletCbs.push(cb);
      try { cb(fresh(B.readWallet())); } catch (err) {}
    }
  };
  window.saloonHost = host;
  window.host = host;

  var bar = document.createElement("div");
  bar.className = "ssdns-link";
  bar.setAttribute("role", "status");
  bar.innerHTML =
    '<div class="link-row">' +
      '<span class="link-summary"></span>' +
      '<button type="button" class="link-toggle" aria-expanded="false" title="More">ⓘ</button>' +
      '<button type="button" class="buy-chips" hidden>Buy chips</button>' +
      '<button type="button" class="link-unlink" hidden>Not you? Unlink</button>' +
    '</div>' +
    '<div class="buy-pick">' +
      '<button type="button" data-amt="5">5</button>' +
      '<button type="button" data-amt="10">10</button>' +
      '<button type="button" data-amt="25">25</button>' +
      '<button type="button" data-amt="50">50</button>' +
      '<input type="number" class="buy-amt" min="1" step="1" inputmode="numeric" value="10" aria-label="Chip amount">' +
      '<button type="button" class="buy-send">Ask the DM</button>' +
      '<button type="button" class="buy-cancel">Cancel</button>' +
    '</div>' +
    '<div class="link-detail"></div>';
  document.body.insertBefore(bar, document.body.firstChild);

  var summary = bar.querySelector(".link-summary");
  var detail = bar.querySelector(".link-detail");
  var toggle = bar.querySelector(".link-toggle");
  var buyBtn = bar.querySelector(".buy-chips");
  var unlinkBtn = bar.querySelector(".link-unlink");
  var pick = bar.querySelector(".buy-pick");
  var amtInput = bar.querySelector(".buy-amt");

  toggle.addEventListener("click", function () {
    var open = bar.classList.toggle("open");
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
  });

  function showPick(on) {
    pick.classList.toggle("show", !!on);
    if (on) bar.classList.add("open");
  }
  buyBtn.addEventListener("click", function () { showPick(true); });
  pick.querySelector(".buy-cancel").addEventListener("click", function () { showPick(false); });
  Array.prototype.forEach.call(pick.querySelectorAll("[data-amt]"), function (btn) {
    btn.addEventListener("click", function () {
      amtInput.value = btn.getAttribute("data-amt");
    });
  });
  pick.querySelector(".buy-send").addEventListener("click", function () {
    var n = parseInt(amtInput.value, 10);
    if (!n || n < 1) return;
    buyBtn.disabled = true;
    buyBtn.textContent = "Pending…";
    showPick(false);
    host.requestCredits({ amount: n, reason: "saloon:" + G.id }).then(function (r) {
      buyBtn.disabled = false;
      buyBtn.textContent = "Buy chips";
      if (r && r.ok) detail.textContent = "Approved: +" + (r.amount || n) + " ES. The sheet will add it to your shards.";
      else if (r && r.reason === "no room") detail.textContent = "Join a table first. The DM approves bank chips.";
      else detail.textContent = "Declined or no host.";
      bar.classList.add("open");
    });
  });

  unlinkBtn.addEventListener("click", function () {
    unlinkBtn.disabled = true;
    detail.textContent = "Asking the sheet to unlink…";
    bar.classList.add("open");
    host.unlink().then(function (r) {
      unlinkBtn.disabled = false;
      if (r && r.ok) {
        try { if (charId) sessionStorage.setItem(OPT_KEY, charId); } catch (err) {}
        linked = false;
        lockChips(false);
        paint();
        detail.textContent = "Unlinked for this tab. Set and Add use pretend chips.";
        bar.classList.add("open");
      } else {
        detail.textContent = "Still linked. The sheet did not confirm.";
        bar.classList.add("open");
      }
    });
  });

  function emit(w) {
    walletCbs.forEach(function (cb) { try { cb(w); } catch (err) {} });
  }
  function paint() {
    if (linked) {
      bar.classList.add("linked");
      summary.textContent = "Linked to " + name + " · " + last + " ES";
      if (!detail.textContent || detail.textContent.indexOf("Set chips") >= 0) {
        detail.textContent = "Breaking a bill for a bet costs 10%. Wins pay in full. Chips come from your character's shards.";
      }
      buyBtn.hidden = false;
      unlinkBtn.hidden = false;
      var status = document.getElementById("status");
      if (status && /set chips/i.test(status.textContent)) {
        status.textContent = "Linked to your shards. Pick a bet, then play.";
      }
    } else {
      bar.classList.remove("linked");
      summary.textContent = "Not linked · pretend chips";
      if (!detail.textContent || detail.textContent.indexOf("Approved") < 0) {
        detail.textContent = "Open a character in the SSDNS Character Sheet (same browser) to play with real shards. These chips are pretend.";
      }
      buyBtn.hidden = true;
      unlinkBtn.hidden = true;
      showPick(false);
    }
  }
  function lockChips(on) {
    ["setChipsBtn", "addChipsBtn", "chipInput"].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.disabled = on;
      el.title = on ? "Chips come from your character's shards while linked." : "";
    });
    var box = document.querySelector(".buyin");
    if (box) box.style.display = on ? "none" : "";
  }
  function link(w) {
    var live = fresh(w);
    if (!live) {
      linked = false;
      charId = (w && w.characterId) || charId;
      lockChips(false);
      paint();
      emit(w || null);
      return;
    }
    linked = true;
    charId = live.characterId;
    name = live.characterName || "your character";
    last = B.cpValue(live.shards);
    G.set(last);
    lockChips(true);
    paint();
    emit(live);
  }

  window.SSDNSWallet = {
    seen: function (bal) {
      if (!linked || last === null || bal === last) return;
      var r = B.applyDelta(bal - last, "saloon:" + G.id);
      if (r) { last = bal; paint(); }
      else { var v = B.readWallet(); link(v); }
    },
    isLinked: function () { return linked; }
  };

  B.onChange(function (w) {
    if (!w || w.updatedBy === "saloon:" + G.id) return;
    if (G.busy && G.busy()) return;
    link(w);
  });
  link(B.readWallet());
  setInterval(function () { link(B.readWallet()); }, 15000);
})();

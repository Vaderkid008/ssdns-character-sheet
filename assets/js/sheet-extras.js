/**
 * Sheet extras that work offline: HP stepper, conditions banner,
 * gun attack rolls, store/log shells. Live pushes call SSDNSSheet.
 */
(function (root) {
  "use strict";
  var log = [];
  var filter = "all";
  var stock = [];
  var storeOpen = false;

  function $(s, r) { return (r || document).querySelector(s); }
  function doc() { return root.SSDNSApp && root.SSDNSApp.doc ? root.SSDNSApp.doc() : null; }
  function ch() { var d = doc(); return d && d.character; }
  function toast(msg, actLabel, actFn, ms, opts) {
    if (root.SSDNSToast) return root.SSDNSToast(msg, actLabel, actFn, ms, opts);
    var t = $("#toastText"), box = $("#toast"), act = $("#toastAction");
    if (act) act.hidden = true;
    if (t && box) {
      t.textContent = msg;
      box.hidden = false;
      clearTimeout(toast._t);
      toast._t = setTimeout(function () { box.hidden = true; }, 3600);
    }
  }
  function pulseHp(kind) {
    var cls = kind === "heal" ? "hp-heal" : "hp-flash";
    function go() {
      var box = document.querySelector(".hp");
      if (!box) return;
      box.classList.remove("hp-flash");
      box.classList.remove("hp-heal");
      void box.offsetWidth;
      box.classList.add(cls);
    }
    go();
    if (root.requestAnimationFrame) root.requestAnimationFrame(go);
    clearTimeout(pulseHp._t);
    pulseHp._t = setTimeout(function () {
      go();
      setTimeout(function () {
        var box = document.querySelector(".hp");
        if (box) { box.classList.remove("hp-flash"); box.classList.remove("hp-heal"); }
      }, 2600);
    }, 60);
  }
  function flashHp(notice) {
    if (notice) toast(notice);
    pulseHp();
  }
  function num(v) { var n = parseInt(v, 10); return isFinite(n) ? n : 0; }
  function dispatch(el) {
    if (el) el.dispatchEvent(new Event("change", { bubbles: true }));
  }
  function joined() {
    return root.SSDNSDmJoin && root.SSDNSDmJoin.isJoined && root.SSDNSDmJoin.isJoined();
  }
  function attackCue(name) {
    if (!name) return;
    if (root.SSDNSAudio) root.SSDNSAudio.play(name);
    if (whisperOn()) return;
    if (joined() && root.SSDNSDmJoin && root.SSDNSDmJoin.postSfx) root.SSDNSDmJoin.postSfx(name);
  }
  function spellCueName() {
    var c = ch();
    return (c && c.calling === "pact-seeker") ? "pactshot" : "spellshot";
  }

  function setHp(current, temp, max) {
    var cur = $("#inHPCur"), tmp = $("#inHPTemp"), maxEl = $("#inHPMax");
    if (cur) cur.value = String(current);
    if (tmp && temp != null) tmp.value = String(temp);
    if (maxEl) {
      var nextMax = max != null && max !== "" ? max : maxEl.value;
      if (root.SSDNSApplied && root.SSDNSApplied.followMaxHp) nextMax = root.SSDNSApplied.followMaxHp(current, nextMax);
      if (nextMax != null && nextMax !== "") maxEl.value = String(nextMax);
      dispatch(maxEl);
    }
    dispatch(tmp);
    dispatch(cur);
  }

  function applyDelta(delta, notice) {
    var curEl = $("#inHPCur"), tmpEl = $("#inHPTemp"), maxEl = $("#inHPMax");
    if (!curEl) return;
    var cur = num(curEl.value), temp = num(tmpEl && tmpEl.value), max = num(maxEl && maxEl.value);
    if (delta < 0) {
      var dmg = -delta;
      var use = Math.min(temp, dmg);
      temp -= use;
      dmg -= use;
      cur = Math.max(0, cur - dmg);
    } else {
      cur = max > 0 ? Math.min(max, cur + delta) : cur + delta;
    }
    setHp(cur, temp);
    if (notice) showNotice(notice);
    var box = $(".hp");
    if (box) box.classList.toggle("hp-down", cur <= 0);
    if (delta) pulseHp(delta > 0 ? "heal" : "hurt");
    if (cur <= 0 && root.SSDNSConditions && ch()) {
      var next = root.SSDNSConditions.ensureUnconscious(ch().activeConditions || [], cur, "self");
      ch().activeConditions = next;
      ch().tableConditions = root.SSDNSConditions.listText(next);
    } else if (cur > 0 && root.SSDNSConditions && ch() && (ch().activeConditions || []).some(function (row) { return /^unconscious$/i.test(row.name || ""); })) {
      var up = root.SSDNSConditions.ensureUnconscious(ch().activeConditions || [], cur, "self");
      ch().activeConditions = up;
      ch().tableConditions = root.SSDNSConditions.listText(up);
    }
    renderConds();
    if (root.SSDNSConditionsUi && root.SSDNSConditionsUi.paint) root.SSDNSConditionsUi.paint();
  }

  function showNotice(text) {
    toast(text);
    var n = $("#hpNotice");
    if (!n) return;
    n.textContent = text;
    n.hidden = false;
    clearTimeout(showNotice._t);
    showNotice._t = setTimeout(function () { n.hidden = true; }, 6000);
  }

  function bump(sign) {
    applyDelta(sign);
  }

  function renderConds() {
    var c = ch();
    var raw = (c && c.tableConditions) || "";
    var list = String(raw).split(",").map(function (s) { return s.trim(); }).filter(Boolean);
    var html = list.map(function (name) {
      return '<span class="cond-chip">' + name.replace(/[&<>]/g, function (ch) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[ch];
      }) + "</span>";
    }).join("");
    ["#condBanner", "#condHeader"].forEach(function (sel) {
      var box = $(sel);
      if (!box) return;
      if (!list.length) { box.hidden = true; box.innerHTML = ""; return; }
      box.hidden = false;
      box.innerHTML = html;
    });
    var cur = num($("#inHPCur") && $("#inHPCur").value);
    var hp = $(".hp");
    if (hp) hp.classList.toggle("hp-down", cur <= 0);
  }

  function setConditions(list, extra) {
    extra = extra || {};
    var c = ch();
    var text = "";
    if (c && extra.merge && extra.entries && root.SSDNSConditions) {
      c.activeConditions = root.SSDNSConditions.mergeById(c.activeConditions || [], extra.entries, extra.removeIds || []);
      text = root.SSDNSConditions.listText(c.activeConditions);
      c.tableConditions = text;
    } else if (c && extra.entries && root.SSDNSConditions) {
      c.activeConditions = extra.entries.map(root.SSDNSConditions.normalize).filter(Boolean);
      text = root.SSDNSConditions.listText(c.activeConditions);
      c.tableConditions = text;
    } else {
      text = (list || []).filter(Boolean).join(", ");
      if (c) c.tableConditions = text;
    }
    var el = $("#inTableConditions");
    if (el) { el.value = text; dispatch(el); }
    renderConds();
    if (root.SSDNSConditionsUi && root.SSDNSConditionsUi.paint) root.SSDNSConditionsUi.paint();
    if (extra.quiet) return;
    if (list && list.length) showNotice("Conditions: " + text);
    else showNotice("Conditions cleared");
  }

  function addLog(entry) {
    entry.ts = entry.ts || new Date().toISOString();
    try {
      var cid = root.SSDNSApp && root.SSDNSApp.doc && root.SSDNSApp.doc() && root.SSDNSApp.doc().id;
      if (cid && !entry.characterId) entry.characterId = cid;
    } catch (e) {}
    if (!entry.id) entry.id = "log_" + entry.ts + "_" + String(entry.kind || "") + "_" + String(entry.text || "").slice(0, 80);
    var prev = entry.id && log.filter(function (e) { return e && e.id === entry.id; })[0];
    if (prev) {
      if (entry.replace) {
        prev.text = entry.text;
        prev.crit = !!entry.crit;
        prev.nat = entry.nat;
        prev.attack = entry.attack != null ? entry.attack : prev.attack;
        prev.ts = entry.ts || prev.ts;
        renderLog();
      }
      return;
    }
    log.unshift(entry);
    if (log.length > 200) log.length = 200;
    sortLog();
    renderLog();
  }
  function sortLog() {
    log.sort(function (a, b) { return String(b && b.ts || "").localeCompare(String(a && a.ts || "")); });
  }
  function clearLog() {
    log.length = 0;
    renderLog();
    if (clearLog._busy) return;
    clearLog._busy = true;
    try {
      if (root.SSDNSPlaytest && root.SSDNSPlaytest.dropLogStore) root.SSDNSPlaytest.dropLogStore(true);
    } finally { clearLog._busy = false; }
  }
  function mergeLog(entries) {
    (entries || []).forEach(function (entry) { if (entry) addLog(entry); });
    sortLog();
    renderLog();
  }

  var dockFilter = "all";
  function dockBucket(e) {
    if (e.kind === "chat") return "chat";
    if (e.kind === "es") return "money";
    if (e.kind === "roll") return "rolls";
    if (e.kind === "alert" || e.kind === "dm" || e.kind === "hp") return "alerts";
    return "other";
  }
  function rollFace(e) {
    var nat = Number(e.nat);
    var crit = !!e.crit || nat === 20;
    var attack = !!e.attack;
    if (!attack && !crit) {
      var label = String(e.label || "");
      var formula = String(e.formula || "");
      if (/attack/i.test(label) && /1d20|2d20/.test(formula)) attack = true;
    }
    if (crit) return { cls: "roll-crit", tag: "CRITICAL" };
    if (attack) return { cls: "roll-attack", tag: "ATTACK" };
    return { cls: "", tag: "" };
  }
  function renderDock() {
    var feed = $("#sheetDockFeed");
    if (!feed) return;
    var rows = log.filter(function (e) {
      if (dockFilter === "all") return true;
      return dockBucket(e) === dockFilter;
    });
    var stick = feed.dataset.stick !== "0";
    var slice = rows.slice().reverse().slice(-80);
    feed.innerHTML = slice.map(function (e) {
      var when = "";
      try { when = root.SSDNSClock ? root.SSDNSClock.format(e.ts, false) : new Date(e.ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); } catch (err) {}
      var face = rollFace(e);
      var hand = e.kind === "handout";
      return '<div class="dock-item ' + face.cls + '"' + handoutAttrs(e) + '><div class="dock-meta">' + when + " · " + esc(dockBucket(e)) +
        (face.tag ? ' · <span class="roll-tag">' + face.tag + "</span>" : "") +
        '</div><div>' + esc(e.text || "") + (hand ? handoutBits(e) : "") + "</div></div>";
    }).join("") || '<p class="fine">Nothing in this filter yet. Rolls, shards, and chat land here.</p>';
    if (stick) feed.scrollTop = feed.scrollHeight;
    var badge = $("#sheetDockBadge");
    var closed = document.body.classList.contains("sheet-dock-collapsed") || (window.matchMedia("(max-width: 800px)").matches && !document.body.classList.contains("dock-open"));
    if (!closed) sheetDockSeen = log.length;
    var unread = Math.max(0, log.length - sheetDockSeen);
    if (badge) {
      badge.hidden = unread < 1;
      badge.textContent = String(unread);
    }
  }
  var sheetDockSeen = 0;

  function renderLog() {
    renderDock();
    var feed = $("#logFeed");
    if (!feed) return;
    if (!joined() && !log.length) {
      feed.innerHTML = '<p class="fine">Join a table to see your ES, HP, items, DM messages, and chat in one list. The sheet still works fully offline.</p>';
      return;
    }
    var rows = log.filter(function (e) {
      if (filter === "all") return true;
      return e.kind === filter;
    });
    if (!rows.length) {
      feed.innerHTML = '<p class="fine">Nothing in this filter yet.</p>';
      return;
    }
    feed.innerHTML = rows.map(function (e) {
      var when = "";
      try { when = root.SSDNSClock ? root.SSDNSClock.format(e.ts, false) : new Date(e.ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); } catch (err) {}
      var face = rollFace(e);
      var hand = e.kind === "handout";
      return '<div class="log-item log-' + (e.kind || "all") + " " + face.cls + '"' + handoutAttrs(e) + '><div class="log-meta">' + when + " · " + (e.kind || "") +
        (face.tag ? ' · <span class="roll-tag">' + face.tag + "</span>" : "") + '</div><div>' +
        String(e.text || "").replace(/[&<>]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]; }) +
        handoutBits(e) +
        "</div></div>";
    }).join("");
  }

  function handoutAttrs(e) {
    if (!e || e.kind !== "handout") return "";
    function enc(v) { return encodeURIComponent(String(v || "")); }
    return " data-reopen-handout='1' data-url='" + enc(e.url) + "' data-title='" + enc(e.title || "Handout") + "' data-body='" + enc(e.body) + "'";
  }
  function handoutBits(e) {
    if (!e || e.kind !== "handout" || !e.url) return (e && e.kind === "handout") ? ' <button type="button" class="btn sm" data-reopen-handout="1">Reopen</button>' : "";
    var url = String(e.url);
    var safe = url.replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
    var title = String(e.title || "Handout").replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
    var img = /\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(url) || !e.body
      ? '<img class="handout-thumb" referrerpolicy="no-referrer" data-handout-zoom="1" data-url="' + safe + '" data-title="' + title + '" src="' + safe + '" alt="" style="display:block;max-width:160px;max-height:120px;margin-top:6px;cursor:zoom-in" onerror="this.style.display=\'none\';if(!this.dataset.fell){this.dataset.fell=\'1\';this.insertAdjacentHTML(\'afterend\',\'<span class=&quot;fine&quot;>Image couldn\\\'t load — open link</span>\');}">'
      : "";
    return img + ' <a href="' + safe + '" target="_blank" rel="noopener noreferrer">Open</a> <button type="button" class="btn sm" data-reopen-handout="1" data-url="' + safe + '" data-title="' + title + '">Reopen</button>';
  }
  function zoomHandout(url, title) {
    if (!url) return;
    var dlg = document.createElement("dialog");
    dlg.className = "dlg";
    dlg.innerHTML = "<form method='dialog'><h2></h2><p style='text-align:center'></p><div class='dlg-foot'><a class='btn' target='_blank' rel='noopener'>Open</a> <button class='btn' value='close'>Close</button></div></form>";
    dlg.querySelector("h2").textContent = title || "Handout";
    var img = document.createElement("img");
    img.alt = title || "";
    img.referrerPolicy = "no-referrer";
    img.style.maxWidth = "100%";
    img.style.maxHeight = "70vh";
    img.addEventListener("error", function () {
      var note = document.createElement("span");
      note.className = "fine";
      note.textContent = "Image couldn't load — open link";
      if (img.parentNode) img.parentNode.replaceChild(note, img);
    });
    img.src = url;
    dlg.querySelector("p").appendChild(img);
    var a = dlg.querySelector("a");
    a.href = url;
    dlg.addEventListener("close", function () { if (dlg.parentNode) dlg.parentNode.removeChild(dlg); });
    document.body.appendChild(dlg);
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", "");
  }
  function walletLine() {
    var d = doc();
    var Bridge = root.SSDNSBridge;
    if (!d || !Bridge) return "Shards are not loaded yet.";
    var shards = Bridge.cleanShards ? Bridge.cleanShards(d.shards) : (d.shards || {});
    var labels = [
      ["white", "White ×", 1],
      ["blue", "Blue ×", 10],
      ["green", "Green ×", 50],
      ["yellow", "Yellow ×", 100],
      ["purple", "Purple ×", 500]
    ];
    var bits = labels.map(function (row) {
      return row[1] + (shards[row[0]] || 0) + " (" + row[2] + " ES)";
    });
    var es = Bridge.cpValue(shards);
    var treasure = d.character && String(d.character.treasure || "").trim();
    var extra = treasure ? " Other: " + treasure.replace(/\s+/g, " ").slice(0, 160) : "";
    return es.toLocaleString() + " ES on hand. " + bits.join(" · ") + "." + extra;
  }

  var storeTab = "";
  function storeLabel(id) {
    var labels = root.SSDNSStore && root.SSDNSStore.STORE_LABEL;
    return (labels && labels[id]) || ({ general: "General Store", gun: "Gun Store", music: "Music Store", traveling: "Traveling Merchant" }[id] || "Store");
  }
  function storeTabs(lines, open) {
    if (root.SSDNSStore && root.SSDNSStore.playerTabs) return root.SSDNSStore.playerTabs(lines, open);
    if (!open) return [];
    var order = ["general", "gun", "music", "traveling"];
    var seen = {};
    (lines || []).forEach(function (row) { if (row && row.store) seen[row.store] = 1; });
    return order.filter(function (id) { return seen[id]; });
  }
  function renderStore() {
    var box = $("#storeStock");
    var lede = $("#storeLede");
    if (!box) return;
    var es = 0;
    try {
      var d = doc();
      if (d && root.SSDNSBridge) es = root.SSDNSBridge.cpValue(d.shards);
    } catch (e) {}
    var esEl = $("#storeEs");
    if (esEl) esEl.textContent = walletLine();
    if (!joined()) {
      if (lede) lede.textContent = "Join a table with the room code. The DM sets tonight's stock and can open this tab for you. Nothing here changes your sheet until then.";
      box.innerHTML = "";
      return;
    }
    var tabs = storeTabs(stock, storeOpen);
    if (!storeOpen || !tabs.length) {
      if (lede) lede.textContent = storeOpen ? "The store is open, but the DM has not listed any stock yet." : "The DM has not opened a store this session.";
      box.innerHTML = "";
      return;
    }
    if (tabs.indexOf(storeTab) < 0) storeTab = tabs[0];
    if (lede) lede.textContent = storeLabel(storeTab) + ". Buying spends ES and writes a ledger line.";
    var tabHtml = '<div class="store-tabs">' + tabs.map(function (id) {
      return '<button type="button" class="btn sm store-tab' + (id === storeTab ? " on" : "") + '" data-store-tab="' + esc(id) + '">' + esc(storeLabel(id)) + "</button>";
    }).join("") + "</div>";
    var rows = stock.map(function (item, i) { return { item: item, i: i }; }).filter(function (row) {
      return (row.item.store || "general") === storeTab;
    });
    box.innerHTML = tabHtml + rows.map(function (row) {
      var item = row.item;
      var price = num(item.price);
      var sold = !!item.soldOut;
      var broke = es < price;
      var ref = item.ref ? ' <span class="ref-tag">ref</span>' : "";
      return '<div class="store-row' + (sold ? " sold" : "") + '"><div><b>' + esc(item.name) + "</b>" + ref +
        '<div class="fine">' + price.toLocaleString() + " ES" + (sold ? " · Sold out" : "") + "</div></div>" +
        '<button type="button" class="btn" data-buy="' + row.i + '" aria-label="Buy ' + esc(item.name) + '"' +
        (sold || broke ? " disabled" : "") + ">" + (sold ? "Sold out" : "Buy") + "</button></div>";
    }).join("");
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function tender(shards, owe) {
    var Bridge = root.SSDNSBridge;
    var paid = 0;
    (Bridge.COLORS || []).forEach(function (c) {
      var n = (shards && shards[c]) || 0;
      while (paid < owe && n > 0) { n -= 1; paid += Bridge.CP[c]; }
    });
    return paid - owe;
  }
  function grantBought(item) {
    var d = doc();
    if (!d || !d.character || !item) return;
    var name = String(item.name || "Item");
    var plan = root.SSDNSStore && root.SSDNSStore.grantPlan ? root.SSDNSStore.grantPlan(item) : { kind: "gear", qty: 1 };
    if (plan.kind === "cartridge") {
      d.character.ammo = d.character.ammo || [];
      var pool = null;
      d.character.ammo.forEach(function (a) {
        if (!pool && a.type === "cartridge" && String(a.caliber || "") === String(plan.caliber || "")) pool = a;
      });
      if (!pool) { pool = { type: "cartridge", caliber: plan.caliber, count: 0 }; d.character.ammo.push(pool); }
      pool.count = (parseInt(pool.count, 10) || 0) + (plan.qty || 1);
    } else {
      var line = "• " + name;
      var cur = d.character.equipment || "";
      if (cur.indexOf(line) < 0) d.character.equipment = (cur ? cur.replace(/\s+$/, "") + "\n" : "") + line;
      var ta = document.querySelector('[data-f="character.equipment"]');
      if (ta) ta.value = d.character.equipment;
    }
    addLog({ kind: "item", text: "Gear: " + name });
  }
  function finishBuy(item, price, old) {
    var Bridge = root.SSDNSBridge;
    var d = doc();
    var w = Bridge.applyDelta(-price, "store");
    if (!w) { toast("Could not spend ES"); return; }
    d.shards = w.shards;
    ["white", "blue", "green", "yellow", "purple"].forEach(function (c) {
      var nodes = document.querySelectorAll('[data-f="shards.' + c + '"]');
      var n = (w.shards && w.shards[c]) || 0;
      for (var i = 0; i < nodes.length; i++) nodes[i].value = String(n);
      if (nodes[0]) dispatch(nodes[0]);
    });
    addLog({ kind: "es", text: "Bought " + item.name + " for " + price + " ES" });
    if (root.SSDNSDmJoin && root.SSDNSDmJoin.postLedger) {
      root.SSDNSDmJoin.postLedger({
        type: "store_buy",
        what: "Store: " + item.name + " (" + price + " ES)",
        oldVal: old,
        newVal: Bridge.cpValue(d.shards),
        flag: false,
        who: (d.character && d.character.player) || "Player",
        playerName: (d.character && d.character.player) || "",
        characterName: (d.character && d.character.name) || ""
      });
    }
    if (root.SSDNSDmJoin && root.SSDNSDmJoin.publishSnapshot) root.SSDNSDmJoin.publishSnapshot();
    grantBought(item);
    toast("Bought " + item.name + (old - Bridge.cpValue(d.shards) > price ? " (the shop kept the extra)" : ""));
    renderStore();
  }
  function buy(index) {
    if (!joined()) { toast("Join a table before buying"); return; }
    var item = stock[index];
    if (!item) return;
    if (item.soldOut) { toast("Sold out"); return; }
    var price = num(item.price);
    var Bridge = root.SSDNSBridge;
    var d = doc();
    if (!Bridge || !d) return;
    var old = Bridge.cpValue(d.shards);
    if (old < price) { toast("Not enough ES"); return; }
    var over = tender(d.shards, price);
    if (over > 0) {
      var box = $("#toast"), act = $("#toastAction"), text = $("#toastText");
      if (text) text.textContent = "That pays " + (price + over) + " ES for a " + price + " ES item. Shops don't make change.";
      if (act && box) {
        act.hidden = false;
        act.textContent = "Pay anyway";
        act.onclick = function () { act.hidden = true; box.hidden = true; finishBuy(item, price, old); };
        box.hidden = false;
        return;
      }
    }
    finishBuy(item, price, old);
  }

  function openStore(list) {
    storeOpen = true;
    if (Array.isArray(list)) stock = list;
    renderStore();
    var tabs = storeTabs(stock, true);
    var label = tabs.length ? storeLabel(tabs[0]) : "Store";
    var text = tabs.length > 1 ? tabs.map(storeLabel).join(", ") + " are open" : label + " is open";
    toast(text, "Go", function () {
      var tab = $("#tab-store");
      if (tab) tab.click();
    });
  }

  function setStock(list, open) {
    stock = Array.isArray(list) ? list : [];
    if (open === true || open === false) storeOpen = open;
    renderStore();
  }

  function gunName(i) {
    var sel = document.querySelector('[data-f="character.guns.' + i + '.weapon"]');
    if (!sel || sel.selectedIndex < 0) return "Gun";
    var t = sel.options[sel.selectedIndex].text || "Gun";
    return t.replace(/\s+·.*$/, "").trim() || "Gun";
  }

  function signMod(n) { return n >= 0 ? "+" + n : String(n); }
  function rollDiceExpr(expr) {
    var f = String(expr || "").toLowerCase();
    var m = f.match(/(\d*)d(\d+)\s*([+-]\s*\d+)?/);
    if (!m) return null;
    var n = Math.max(1, parseInt(m[1] || "1", 10));
    var sides = parseInt(m[2], 10);
    var mod = m[3] ? parseInt(m[3].replace(/\s/g, ""), 10) : 0;
    if (!sides) return null;
    var rolls = [];
    for (var i = 0; i < n; i++) rolls.push(1 + Math.floor(Math.random() * sides));
    var sum = rolls.reduce(function (a, b) { return a + b; }, 0) + mod;
    return {
      total: sum,
      detail: rolls.join("+") + (mod ? signMod(mod) : ""),
      formula: n + "d" + sides + (mod ? signMod(mod) : "")
    };
  }
  function postCheck(label, formula, total, detail, nat1, firearm) {
    toast(label + " " + total + " (" + detail + ")");
    addLog({ kind: "roll", text: label + " · " + formula + " = " + total + " (" + detail + ")" });
    if (joined() && root.SSDNSDmJoin && root.SSDNSDmJoin.postRoll) {
      root.SSDNSDmJoin.postRoll({
        label: label, formula: formula, result: total, detail: detail,
        nat1: !!nat1, isFirearm: !!firearm, private: whisperOn(), whisper: whisperOn()
      });
    }
  }
  function rollCheck(key) {
    var v = root.SSDNSApp && root.SSDNSApp.compute ? root.SSDNSApp.compute() : {};
    var parts = String(key || "").split(".");
    var kind = parts[0], rest = parts.slice(1).join(".");
    var mod = 0, label = rest || "Check";
    if (kind === "abil") {
      var shown = document.querySelector('[data-out="mod.' + rest + '"]');
      mod = parseInt(shown && shown.textContent, 10);
      if (!isFinite(mod)) mod = (v.mods && v.mods[rest]) || 0;
      label = rest + " check";
    } else if (kind === "save") {
      var sv = document.querySelector('[data-calc="save.' + rest + '"]');
      mod = parseInt(sv && sv.value, 10);
      if (!isFinite(mod)) mod = (v.saves && v.saves[rest]) || 0;
      label = rest + " save";
    } else {
      var sk = document.querySelector('[data-calc="skill.' + rest + '"]');
      mod = parseInt(sk && sk.value, 10);
      if (!isFinite(mod)) mod = (v.skills && v.skills[rest]) || 0;
      label = rest;
    }
    var rolled = rollAdv(mod);
    postCheck(label, rolled.formula, rolled.total, rolled.detail, rolled.nat === 1, false);
  }
  function attackReport(opts) {
    opts = opts || {};
    var who = opts.who || "You";
    var target = opts.target || "";
    var nat = Number(opts.nat) || 0;
    var atk = Number(opts.atk) || 0;
    var bonus = atk ? ((atk >= 0 ? "+" : "") + atk) : "";
    var total = nat + atk;
    var miss = !!opts.miss || !!opts.misfire;
    var ac = opts.ac;
    var haveAc = ac != null && ac !== "" && isFinite(Number(ac));
    if (haveAc && !miss && total < Number(ac)) miss = true;
    var verdict = (miss || haveAc) ? (miss ? "MISS" : "HIT") : "";
    var dmg = (!miss && opts.dmg) ? (" · " + opts.dmg.formula + " = " + opts.dmg.total) : "";
    var face = opts.dice || String(nat);
    var head = (target ? (who + " → " + target) : who) + ": " + face + bonus + " = " + total;
    return {
      player: head + (verdict ? (" → " + verdict) : "") + dmg,
      ac: haveAc ? Number(ac) : null,
      miss: miss,
      total: total
    };
  }
  function acHidden(tgt) {
    return !!(tgt && tgt.id && tgt.kind !== "player" && (tgt.ac == null || tgt.ac === "" || !isFinite(Number(tgt.ac))));
  }
  function waitingText(who, target) {
    return (who || "You") + " → " + (target || "enemy") + ": Waiting on DM…";
  }
  function sendPendingAttack(info) {
    info = info || {};
    var line = waitingText(info.who, info.targetName);
    toast(line);
    addLog({
      id: "roll:" + info.rollId,
      kind: "roll",
      text: line,
      attack: true,
      nat: info.nat,
      crit: false,
      label: info.label,
      replace: true
    });
    if (!(joined() && root.SSDNSDmJoin && root.SSDNSDmJoin.postRoll)) return line;
    root.SSDNSDmJoin.postRoll({
      id: info.rollId,
      label: info.label,
      formula: info.formula,
      result: info.hitTotal,
      detail: line,
      attack: true,
      nat: info.nat,
      crit: false,
      awaitDm: true,
      damage: null,
      ac: null,
      targetId: info.targetId,
      targetName: info.targetName,
      weapon: info.weapon || "",
      private: !!info.quiet,
      whisper: !!info.quiet
    });
    if (!info.quiet && root.SSDNSDmJoin.postAttack) {
      root.SSDNSDmJoin.postAttack({
        rollId: info.rollId,
        targetId: info.targetId,
        targetName: info.targetName,
        amount: Number(info.damage) || 0,
        hitTotal: info.hitTotal,
        nat: info.nat,
        crit: Number(info.nat) === 20,
        nat1: Number(info.nat) === 1,
        label: info.label || "",
        weapon: info.weapon || "",
        type: "attack",
        dice: info.dice || "",
        formula: info.formula || "",
        sfx: info.sfx || "attack",
        shots: info.shots || null
      });
    }
    return line;
  }
  function currentTarget() {
    if (pendingBlind) return null;
    if (root.SSDNSPlaytest && root.SSDNSPlaytest.targetInfo) return root.SSDNSPlaytest.targetInfo();
    var sel = document.querySelector("#atkTarget");
    if (!sel || !sel.value) return null;
    var opt = sel.selectedOptions && sel.selectedOptions[0];
    return { id: sel.value, name: (opt && (opt.getAttribute("data-name") || opt.textContent)) || "", ac: null };
  }
  function attackRoll(mod, conditions, chosen) {
    var mode = root.SSDNSConditions && root.SSDNSConditions.attackMode
      ? root.SSDNSConditions.attackMode(conditions || [], chosen || "")
      : (chosen === "adv" || chosen === "dis" ? chosen : "");
    var n1 = d20();
    var n2 = null;
    var nat = n1;
    if (mode === "adv" || mode === "dis") {
      n2 = d20();
      nat = mode === "adv" ? Math.max(n1, n2) : Math.min(n1, n2);
    }
    var notes = [];
    if (root.SSDNSConditions) {
      var dis = root.SSDNSConditions.disadvantageNote(conditions || []);
      var adv = root.SSDNSConditions.advantageNote(conditions || []);
      if (dis) notes.push(dis);
      if (adv) notes.push(adv);
    }
    return {
      nat: nat,
      n1: n1,
      n2: n2,
      mode: mode,
      shown: n2 == null ? String(nat) : (n1 + "/" + n2 + " → " + nat),
      note: notes.join(" · "),
      mod: mod || 0
    };
  }
  function blankTarget(tgt) {
    if (!tgt || !tgt.id) return true;
    var n = String(tgt.name || "").trim();
    return !n || /^no target$/i.test(n) || /^target$/i.test(n);
  }
  function downed() {
    var c = ch();
    if (!c) return false;
    var hp = c.hpCurrent;
    if (hp !== "" && hp != null && isFinite(Number(hp)) && Number(hp) <= 0) return true;
    return (c.activeConditions || []).some(function (row) {
      var name = typeof row === "string" ? row : (row && row.name);
      return name === "Unconscious";
    });
  }
  function attackGate(tgt, opts) {
    opts = opts || {};
    if (opts.heal || opts.death) return "";
    if (downed()) return "You're at 0 HP. Death saves only.";
    if (tgt && tgt.kind === "player") {
      var uid = root.SSDNSDmJoin && root.SSDNSDmJoin.uid && root.SSDNSDmJoin.uid();
      if (uid && tgt.id === uid) return "You can't attack yourself.";
      return "You can't attack another player.";
    }
    return "";
  }
  function consumeRollMode() {
    var sel = document.querySelector("#globalAdv");
    var pin = document.querySelector("#advPin");
    if (!sel || (pin && pin.checked)) return;
    if (sel.value) sel.value = "";
  }
  function modeWord(mode) {
    if (mode === "dis") return " disadvantage";
    if (mode === "adv") return " advantage";
    return "";
  }
  function rememberEnemy(tgt) {
    var sel = document.querySelector("#atkTarget");
    if (!sel || !tgt || !tgt.id || tgt.kind === "player") return;
    sel.setAttribute("data-last-enemy", tgt.id);
  }
  function releaseHealTarget() {
    var sel = document.querySelector("#atkTarget");
    if (!sel) return;
    var last = sel.getAttribute("data-last-enemy") || "";
    sel.value = last;
  }
  function rollAdv(mod) {
    var globalAdv = document.querySelector("#globalAdv");
    var mode = (globalAdv && globalAdv.value) || "";
    var n1 = 1 + Math.floor(Math.random() * 20);
    var n2 = null;
    var nat = n1;
    if (mode === "adv" || mode === "dis") {
      n2 = 1 + Math.floor(Math.random() * 20);
      nat = mode === "adv" ? Math.max(n1, n2) : Math.min(n1, n2);
    }
    var formula = (n2 == null ? "1d20" : "2d20") + (mod ? signMod(mod) : "");
    var dice = n2 == null ? String(nat) : (n1 + "/" + n2 + " → " + nat);
    var detail = dice + (mod ? signMod(mod) : "") + modeWord(mode);
    consumeRollMode();
    return { nat: nat, total: nat + (mod || 0), formula: formula, detail: detail };
  }
  function rollInitiative() {
    var inp = document.querySelector('[data-calc="initiative"]');
    var bonus = parseInt(String(inp && inp.value).replace(/[^\d-]/g, ""), 10);
    if (!isFinite(bonus)) {
      var v = root.SSDNSApp && root.SSDNSApp.compute ? root.SSDNSApp.compute() : {};
      bonus = v.initiative || 0;
    }
    var rolled = rollAdv(bonus || 0);
    postCheck("Initiative", rolled.formula, rolled.total, rolled.detail, rolled.nat === 1, false);
  }
  function wildSparkLine(nat) {
    if (nat !== 1) return "";
    var table = (root.SSDNS_RULES && root.SSDNS_RULES.wildSpark) || [];
    var spark = 1 + Math.floor(Math.random() * 6);
    var row = table[spark - 1];
    return "Wild spark " + spark + (row && row.text ? ": " + row.text : ".");
  }
  var castSource = null;
  var castChoice = null;
  var pendingDarts = null;
  var pendingBlind = false;
  function spellNeedsTarget(row) {
    return !!(row && (row.kind === "attack" || row.kind === "weapon" || row.kind === "auto" || row.kind === "save"));
  }
  function autoDartCount(row, slot) {
    if (!row || row.kind !== "auto") return 0;
    var base = row.level || 0;
    var sl = slot == null || slot === "" ? base : Number(slot);
    if (!isFinite(sl)) sl = base;
    var up = Math.max(0, sl - base);
    if (row.upEvery) up = Math.floor(up / row.upEvery);
    return Math.max(1, (row.rays || 1) + (row.rayUp ? up * row.rayUp : 0));
  }
  function targetById(id) {
    var main = document.querySelector("#atkTarget");
    if (!main || !id) return null;
    var op = null;
    Array.prototype.forEach.call(main.options, function (o) { if (o.value === id) op = o; });
    if (!op || !op.value) return null;
    var acRaw = op.getAttribute("data-ac");
    var ac = acRaw == null || acRaw === "" ? null : Number(acRaw);
    return {
      id: op.value,
      name: op.getAttribute("data-name") || op.textContent || "",
      ac: isFinite(ac) ? ac : null,
      kind: op.getAttribute("data-kind") || ""
    };
  }
  function fillCastTarget(sel) {
    if (!sel) return;
    var main = document.querySelector("#atkTarget");
    var keep = sel.value;
    sel.innerHTML = "";
    var blank = document.createElement("option");
    blank.value = "";
    blank.textContent = "No target";
    sel.appendChild(blank);
    if (main) {
      Array.prototype.forEach.call(main.options, function (op) {
        if (!op.value) return;
        var next = document.createElement("option");
        next.value = op.value;
        next.textContent = op.textContent || op.value;
        sel.appendChild(next);
      });
    }
    var narrative = document.createElement("option");
    narrative.value = "narrative";
    narrative.textContent = "No target / narrative";
    sel.appendChild(narrative);
    var prefer = keep || (main && main.value) || "";
    if (prefer && Array.prototype.some.call(sel.options, function (o) { return o.value === prefer; })) sel.value = prefer;
  }
  function mountCastTarget(btn) {
    if (!btn || !btn.parentNode) return null;
    var prev = btn.previousElementSibling;
    if (prev && prev.classList && prev.classList.contains("cast-target")) {
      fillCastTarget(prev);
      return prev;
    }
    var sel = document.createElement("select");
    sel.className = "cast-target";
    sel.setAttribute("aria-label", "Spell target");
    fillCastTarget(sel);
    sel.addEventListener("change", function () {
      var main = document.querySelector("#atkTarget");
      if (sel.value && sel.value !== "narrative" && main) main.value = sel.value;
      document.querySelectorAll("select.cast-target").forEach(function (other) {
        if (other !== sel) other.value = sel.value;
      });
    });
    btn.parentNode.insertBefore(sel, btn);
    return sel;
  }
  function syncCastTargets() {
    var pact = document.querySelector("#btnPactShot");
    if (pact) mountCastTarget(pact);
    document.querySelectorAll("[data-spell-cast], [data-cast]").forEach(function (btn) { mountCastTarget(btn); });
  }
  function sourceSelect() {
    var btn = castSource;
    if (btn && btn.previousElementSibling && btn.previousElementSibling.classList && btn.previousElementSibling.classList.contains("cast-target")) {
      return btn.previousElementSibling;
    }
    return null;
  }
  function chosenTargetValue() {
    var sel = sourceSelect();
    if (sel) return sel.value || "";
    var main = document.querySelector("#atkTarget");
    return (main && main.value) || "";
  }
  function applyCastChoice(choice) {
    pendingDarts = (choice && choice.darts) || null;
    pendingBlind = !!(choice && choice.narrative && !(choice.darts && choice.darts.some(function (d) { return d && d.id; })));
    var id = choice && choice.id;
    if (!id) return;
    var main = document.querySelector("#atkTarget");
    if (main) main.value = id;
    document.querySelectorAll("select.cast-target").forEach(function (s) {
      if (Array.prototype.some.call(s.options, function (o) { return o.value === id; })) s.value = id;
    });
  }
  function optionList(sel, includeNarrative) {
    var main = document.querySelector("#atkTarget");
    if (main) {
      Array.prototype.forEach.call(main.options, function (op) {
        if (!op.value) return;
        var next = document.createElement("option");
        next.value = op.value;
        next.textContent = op.textContent || op.value;
        sel.appendChild(next);
      });
    }
    if (includeNarrative) {
      var narrative = document.createElement("option");
      narrative.value = "narrative";
      narrative.textContent = "No target / narrative";
      sel.appendChild(narrative);
    }
  }
  function askOneTarget(name) {
    return new Promise(function (resolve) {
      var dlg = document.createElement("dialog");
      dlg.className = "dlg";
      dlg.innerHTML = "<form method='dialog'><h2>Pick a target</h2><p class='fine'></p><label>Target <select id='spellPick'></select></label><div class='dlg-foot'><button class='btn' type='button' value='no'>Cancel</button><button class='btn' type='button' id='spellNarrative'>No target / narrative</button><button class='btn btn-primary' type='submit' value='yes'>Cast</button></div></form>";
      dlg.querySelector("p").textContent = name || "Spell";
      optionList(dlg.querySelector("#spellPick"), false);
      var done = false;
      function finish(choice) {
        if (done) return;
        done = true;
        if (dlg.close) dlg.close();
        if (dlg.parentNode) dlg.parentNode.removeChild(dlg);
        resolve(choice);
      }
      dlg.querySelector("[value=no]").addEventListener("click", function () { finish(null); });
      dlg.querySelector("#spellNarrative").addEventListener("click", function () { finish({ narrative: true }); });
      dlg.querySelector("form").addEventListener("submit", function (e) {
        e.preventDefault();
        var id = (dlg.querySelector("#spellPick") || {}).value || "";
        if (!id) { toast("Pick a target"); return; }
        finish({ id: id });
      });
      dlg.addEventListener("cancel", function (e) { e.preventDefault(); finish(null); });
      document.body.appendChild(dlg);
      try { if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", ""); }
      catch (err) { dlg.setAttribute("open", ""); }
    });
  }
  function askDartTargets(name, count, preset) {
    return new Promise(function (resolve) {
      var dlg = document.createElement("dialog");
      dlg.className = "dlg";
      var form = document.createElement("form");
      form.method = "dialog";
      var h = document.createElement("h2");
      h.textContent = "Pick a target";
      var note = document.createElement("p");
      note.className = "fine";
      note.textContent = (name || "Spell") + " · one target per dart";
      form.appendChild(h);
      form.appendChild(note);
      var picks = [];
      var n;
      for (n = 0; n < count; n++) {
        var label = document.createElement("label");
        label.appendChild(document.createTextNode("Dart " + (n + 1) + " "));
        var sel = document.createElement("select");
        var blank = document.createElement("option");
        blank.value = "";
        blank.textContent = "Pick a target";
        sel.appendChild(blank);
        optionList(sel, true);
        if (preset && preset !== "narrative") sel.value = preset;
        label.appendChild(sel);
        form.appendChild(label);
        picks.push(sel);
      }
      var foot = document.createElement("div");
      foot.className = "dlg-foot";
      var cancel = document.createElement("button");
      cancel.className = "btn";
      cancel.type = "button";
      cancel.textContent = "Cancel";
      var go = document.createElement("button");
      go.className = "btn btn-primary";
      go.type = "submit";
      go.textContent = "Cast";
      foot.appendChild(cancel);
      foot.appendChild(go);
      form.appendChild(foot);
      dlg.appendChild(form);
      var done = false;
      function finish(choice) {
        if (done) return;
        done = true;
        if (dlg.close) dlg.close();
        if (dlg.parentNode) dlg.parentNode.removeChild(dlg);
        resolve(choice);
      }
      cancel.addEventListener("click", function () { finish(null); });
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var darts = [];
        var i;
        for (i = 0; i < picks.length; i++) {
          var val = picks[i].value;
          if (!val) { toast("Pick a target"); return; }
          if (val === "narrative") darts.push({ narrative: true });
          else darts.push(targetById(val) || { id: val, name: val });
        }
        var first = null;
        darts.forEach(function (d) { if (!first && d && d.id) first = d; });
        finish({ id: first ? first.id : "", narrative: !first, darts: darts });
      });
      dlg.addEventListener("cancel", function (e) { e.preventDefault(); finish(null); });
      document.body.appendChild(dlg);
      try { if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", ""); }
      catch (err) { dlg.setAttribute("open", ""); }
    });
  }
  function chooseCastTarget(name, row, slot) {
    if (!spellNeedsTarget(row)) return Promise.resolve({ skip: true });
    var darts = autoDartCount(row, slot);
    var current = chosenTargetValue();
    if (darts > 1 || (darts === 1 && row && row.rays)) return askDartTargets(name, darts, current && current !== "narrative" ? current : "");
    if (current === "narrative") return Promise.resolve({ narrative: true });
    if (current) return Promise.resolve({ id: current });
    return askOneTarget(name);
  }
  function castSpellAttack(i, spellName, slot, fromChamber) {
    var Cast = root.SSDNSSpellCast;
    var looked = Cast && Cast.lookup && Cast.lookup(spellName);
    var start = castChoice ? Promise.resolve(castChoice) : chooseCastTarget(spellName, looked, slot);
    castChoice = null;
    start.then(function (choice) {
      if (!choice) return;
      if (!choice.skip) applyCastChoice(choice);
      var blocked = attackGate(pendingBlind ? null : currentTarget(), { heal: looked && looked.kind === "heal" });
      if (blocked) { toast(blocked); addLog({ kind: "alert", text: blocked }); pendingDarts = null; pendingBlind = false; return; }
      if (Cast && Cast.needsType && Cast.needsType(spellName)) {
        Cast.pickType(spellName).then(function (type) {
          if (!type) { pendingDarts = null; pendingBlind = false; return; }
          castSpellAttackNow(i, spellName, slot, fromChamber, type);
        });
        return;
      }
      castSpellAttackNow(i, spellName, slot, fromChamber, "");
    });
  }
  function castSpellAttackNow(i, spellName, slot, fromChamber, damageType) {
    var v = root.SSDNSApp && root.SSDNSApp.compute ? root.SSDNSApp.compute() : {};
    var c = ch();
    var Cast = root.SSDNSSpellCast;
    if (!Cast || !Cast.rollCast) { toast("Spell roller isn't loaded."); return; }
    if ((v.spellAtk == null || v.spellAtk === "") && (v.spellDC == null || v.spellDC === "")) {
      toast("This Calling has no spell attack.");
      return;
    }
    var atk = parseInt(String(v.spellAtk == null ? "" : v.spellAtk).replace(/[^\d-]/g, ""), 10);
    if (!isFinite(atk)) atk = 0;
    var gunAtkEl = document.querySelector('[data-calc="gunAtk.' + i + '"]');
    var gunDmgEl = document.querySelector('[data-calc="gunDmg.' + i + '"]');
    var gunAtk = parseInt(gunAtkEl && String(gunAtkEl.value).replace(/[^\d-]/g, ""), 10);
    if (!isFinite(gunAtk)) gunAtk = 0;
    var hexslinger = !!(c && c.calling === "hexslinger");
    var row = Cast.lookup(spellName);
    var rollId = "r_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    var throughGun = !!((hexslinger && fromChamber) || (row && row.weapon));
    var conds = (c && c.activeConditions) || [];
    var chosenMode = (document.querySelector("#globalAdv") && document.querySelector("#globalAdv").value) || "";
    var atkMode = root.SSDNSConditions && root.SSDNSConditions.attackMode
      ? root.SSDNSConditions.attackMode(conds, chosenMode)
      : chosenMode;
    var rolled = Cast.rollCast({
      spellName: spellName,
      slotLevel: slot,
      characterLevel: c && c.level,
      attackBonus: atk,
      spellMod: v.spellMod,
      dc: v.spellDC,
      weaponDamage: row && row.weapon && gunDmgEl ? gunDmgEl.value : "",
      weaponAtk: gunAtk,
      gunName: throughGun && i >= 0 ? gunName(i) : "",
      wildSpark: hexslinger && slot > 0,
      damageType: damageType || "",
      mode: atkMode
    });
    var tgt = currentTarget();
    if (tgt) rememberEnemy(tgt);
    var acForRoll = null;
    var hiddenSpell = rolled.attack && acHidden(tgt) && joined() && !whisperOn();
    if (rolled.attack) attackCue(spellCueName());
    else if (root.SSDNSAudio) root.SSDNSAudio.play(spellCueName());
    if (hiddenSpell) {
      var spellDmgNow = rolled.damageTotal != null ? Number(rolled.damageTotal) : 0;
      if (!isFinite(spellDmgNow)) spellDmgNow = 0;
      sendPendingAttack({
        who: (c && c.name) || "You",
        targetName: tgt.name,
        targetId: tgt.id,
        nat: rolled.nat,
        hitTotal: rolled.result,
        damage: spellDmgNow,
        dice: rolled.damageDetail || "",
        formula: rolled.formula,
        rollId: rollId,
        label: rolled.label,
        weapon: throughGun && i >= 0 ? gunName(i) : "",
        sfx: spellCueName(),
        shots: rolled.shots || null,
        quiet: false
      });
      consumeRollMode();
      pendingDarts = null;
      pendingBlind = false;
      return;
    }
    if (rolled.attack && rolled.multi && tgt && tgt.name) {
      rolled.text += " → " + tgt.name;
      rolled.detail = rolled.text;
    } else if (rolled.attack && tgt && tgt.name && rolled.nat != null) {
      var report = attackReport({
        who: (c && c.name) || "You",
        target: tgt.name,
        nat: rolled.nat,
        atk: atk,
        ac: tgt.ac,
        miss: rolled.nat === 1,
        dice: rolled.diceShown || ""
      });
      var dmgTail = String(rolled.text || "").match(/on hit (.+)$/);
      rolled.text = report.player + (dmgTail && !report.miss ? " · " + dmgTail[1] : "");
      rolled.detail = rolled.text;
      acForRoll = report.ac;
    } else if (row && row.kind === "auto" && rolled.darts && pendingDarts && pendingDarts.length) {
      var dartNotes = [];
      rolled.darts.forEach(function (d, idx) {
        var pick = pendingDarts[idx] || {};
        dartNotes.push("dart " + d.n + " → " + (pick.name || "narrative"));
      });
      rolled.text += " · " + dartNotes.join("; ");
      rolled.detail = rolled.text;
      rolled.autoDarts = true;
    } else if (row && row.kind === "heal") {
      var whoHeal = (c && c.name) || "You";
      var selfHeal = blankTarget(tgt) || (root.SSDNSDmJoin && root.SSDNSDmJoin.uid && tgt && tgt.id === root.SSDNSDmJoin.uid());
      var tgtHeal = selfHeal ? whoHeal : (tgt && tgt.name);
      var dicePretty = root.SSDNSApplied && root.SSDNSApplied.healDice
        ? root.SSDNSApplied.healDice(String(rolled.detail || "").replace(/^[\s\S]*heals\s+/, ""))
        : "";
      var sentence = root.SSDNSApplied && root.SSDNSApplied.healLine
        ? root.SSDNSApplied.healLine(whoHeal, tgtHeal, rolled.result, dicePretty)
        : (whoHeal + " heals " + (tgtHeal || whoHeal) + " " + rolled.result);
      rolled.text = sentence;
      rolled.detail = sentence;
      rolled.attack = false;
      rolled.heal = true;
      rolled.selfHeal = !!selfHeal;
    } else if (tgt && tgt.name && row && row.kind !== "heal") {
      rolled.text += " · vs " + tgt.name;
      rolled.detail = rolled.text;
    }
    var condBits = [];
    if (root.SSDNSConditions) {
      var disNote = root.SSDNSConditions.disadvantageNote(conds);
      var advNote = root.SSDNSConditions.advantageNote(conds);
      if (disNote) condBits.push(disNote);
      if (advNote) condBits.push(advNote);
    }
    var condNote = condBits.join(" · ");
    if (condNote && rolled.attack) {
      rolled.text += " · " + condNote;
      rolled.detail = rolled.text;
    }
    toast(rolled.text);
    var spellDmg = null;
    var hitTail = String(rolled.text || "").split("→ HIT")[1] || "";
    var dmgMatch = hitTail.match(/=\s*(\d+)\s*$/);
    if (rolled.attack && dmgMatch) spellDmg = Number(dmgMatch[1]);
    addLog({
      id: "roll:" + rollId,
      kind: "roll", text: rolled.text, label: rolled.label, formula: rolled.formula,
      attack: rolled.attack, nat: rolled.nat, crit: rolled.crit
    });
    if (joined() && root.SSDNSDmJoin && root.SSDNSDmJoin.postRoll) {
      root.SSDNSDmJoin.postRoll({
        id: rollId,
        label: rolled.label,
        formula: rolled.formula,
        result: rolled.result,
        detail: rolled.detail,
        ac: rolled.heal ? null : acForRoll,
        nat1: false,
        isFirearm: !!fromChamber,
        attack: rolled.attack,
        heal: !!rolled.heal,
        nat: rolled.nat,
        crit: rolled.crit,
        private: whisperOn(),
        whisper: whisperOn(),
        targetId: rolled.selfHeal ? (root.SSDNSDmJoin.uid && root.SSDNSDmJoin.uid()) : (tgt && tgt.id),
        targetName: rolled.selfHeal ? ((c && c.name) || "You") : (tgt && tgt.name),
        damage: rolled.selfHeal ? null : (rolled.heal ? Number(rolled.result) || 0 : spellDmg),
        selfApplied: !!rolled.selfHeal,
        weapon: throughGun && i >= 0 ? gunName(i) : ""
      });
      if (rolled.heal && rolled.selfHeal) {
        if (root.SSDNSDmJoin.claimGrant) root.SSDNSDmJoin.claimGrant("hp:" + rollId);
        applyDelta(Number(rolled.result) || 0, rolled.text);
        releaseHealTarget();
      } else if (rolled.heal && !whisperOn() && root.SSDNSDmJoin.postDamage) {
        var healTarget = tgt && tgt.id;
        var healName = tgt && tgt.name;
        if (healTarget) {
          root.SSDNSDmJoin.postDamage({
            amount: Number(rolled.result) || 0,
            label: spellName,
            dice: dicePretty || "",
            type: "heal",
            targetId: healTarget,
            targetName: healName,
            rollId: rollId
          });
          releaseHealTarget();
        } else {
          if (root.SSDNSDmJoin.claimGrant) root.SSDNSDmJoin.claimGrant("hp:" + rollId);
          applyDelta(Number(rolled.result) || 0, rolled.text);
          releaseHealTarget();
        }
      } else if (rolled.autoDarts && pendingDarts) {
        var dartGroups = {};
        var dartOrder = [];
        rolled.darts.forEach(function (d, idx) {
          var pick = pendingDarts[idx];
          if (!pick || !pick.id) return;
          if (!dartGroups[pick.id]) {
            dartGroups[pick.id] = { tgt: pick, total: 0, bits: [] };
            dartOrder.push(pick.id);
          }
          dartGroups[pick.id].total += Number(d.total) || 0;
          dartGroups[pick.id].bits.push(d.text || String(d.total));
        });
        dartOrder.forEach(function (gid) {
          var g = dartGroups[gid];
          var partId = rollId + "_" + gid;
          var whoDart = (c && c.name) || "You";
          var dartLine = whoDart + " → " + (g.tgt.name || "target") + ": " + spellName + " " + g.bits.join(" + ") + " = " + g.total;
          root.SSDNSDmJoin.postRoll({
            id: partId,
            label: spellName,
            formula: spellName,
            result: g.total,
            detail: dartLine,
            attack: false,
            damage: g.total,
            targetId: g.tgt.id,
            targetName: g.tgt.name,
            private: whisperOn(),
            whisper: whisperOn()
          });
          if (!whisperOn() && root.SSDNSDmJoin.postDamage) {
            root.SSDNSDmJoin.postDamage({
              amount: g.total, label: spellName, type: "spell",
              targetId: g.tgt.id, targetName: g.tgt.name, rollId: partId
            });
          }
        });
      } else if (!rolled.heal && rolled.attack && spellDmg && tgt && tgt.id && !whisperOn() && root.SSDNSDmJoin.postDamage) {
        root.SSDNSDmJoin.postDamage({
          amount: spellDmg, label: spellName, type: "spell", weapon: throughGun && i >= 0 ? gunName(i) : "",
          targetId: tgt.id, targetName: tgt.name, rollId: rollId
        });
      } else if (rolled.heal && !joined()) {
        applyDelta(Number(rolled.result) || 0, rolled.text);
      }
    } else if (rolled.heal) {
      applyDelta(Number(rolled.result) || 0, rolled.text);
    }
    consumeRollMode();
    pendingDarts = null;
    pendingBlind = false;
  }
  function selectedCast(i) {
    var spellSel = document.querySelector('[data-castspell="' + i + '"]');
    var slotSel = document.querySelector('[data-castslot="' + i + '"]');
    var raw = spellSel && spellSel.value || "";
    var cut = raw.indexOf(":");
    if (cut < 0) return null;
    var level = num(raw.slice(0, cut), 0);
    var name = raw.slice(cut + 1);
    if (!name) return null;
    var slot = level === 0 ? 0 : num(slotSel && slotSel.value, level);
    return { level: level, name: name, slot: slot };
  }
  function castThroughGun(i) {
    var c = ch();
    if (!c || !c.guns || !c.guns[i] || !c.guns[i].weapon) { toast("Pick a gun first"); return; }
    var pick = selectedCast(i);
    if (!pick) { toast("Pick a spell from your list."); return; }
    var looked = root.SSDNSSpellCast && root.SSDNSSpellCast.lookup && root.SSDNSSpellCast.lookup(pick.name);
    chooseCastTarget(pick.name, looked, pick.slot).then(function (choice) {
      if (!choice) return;
      castChoice = choice;
      castThroughGunNow(i, pick);
    });
  }
  function castThroughGunNow(i, pick) {
    if (pick.slot > 0) {
      if (!root.SSDNSApp.spendHexChamber) { toast("Cast through gun isn't ready."); return; }
      var held = root.SSDNSApp.spendHexChamber(i, pick.slot);
      if (!held.ok) { toast(held.reason); return; }
      if (!held.alreadySpent && root.SSDNSApp.spendHexSlot && !root.SSDNSApp.spendHexSlot(pick.slot)) {
        toast("No level-" + pick.slot + " slot left.");
        return;
      }
      castSpellAttack(i, pick.name, pick.slot, true);
      return;
    }
    castSpellAttack(i, pick.name, 0, false);
  }
  function castLoadedHex(i, k) {
    var c = ch();
    var g = c && c.guns && c.guns[i];
    var token = g && g.chambers ? g.chambers[k] : "";
    var m = String(token || "").match(/^k:hex:(\d+):/);
    var legacy = /^[1-9]$/.test(String(token || ""));
    var level = m ? num(m[1]) : (legacy ? num(token) : 0);
    if (!level) { toast("That chamber isn't a hex shell."); return; }
    var spellSel = document.querySelector('[data-castspell="' + i + '"]');
    var slotSel = document.querySelector('[data-castslot="' + i + '"]');
    if (!spellSel) { toast("Pick a level-" + level + " spell, then Cast through gun."); return; }
    var cur = spellSel.value || "";
    var curLv = num(String(cur).split(":")[0], -1);
    if (curLv !== level) {
      var found = "";
      Array.prototype.forEach.call(spellSel.options, function (op) {
        if (found) return;
        if (num(String(op.value).split(":")[0], -1) === level && op.value.indexOf(":") > 0) found = op.value;
      });
      if (!found) { toast("That shell is level " + level + ". Add that spell on your list, then cast it."); return; }
      spellSel.value = found;
      spellSel.dispatchEvent(new Event("change", { bubbles: true }));
    }
    if (slotSel) slotSel.value = String(level);
    castThroughGun(i);
  }
  function showInspiration(count, on) {
    var box = $("#sharedInsp");
    if (!box) return;
    box.hidden = !on;
    var n = $("#sharedInspCount");
    if (n) n.textContent = String(count || 0);
    var btn = $("#btnSpendInsp");
    if (btn) btn.disabled = !on || !(count > 0);
  }
  function d20() {
    if (root.SSDNSTestRoll) {
      var forced = root.SSDNSTestRoll();
      if (forced) return forced;
    }
    return 1 + Math.floor(Math.random() * 20);
  }
  function rollDamageExpr(expr, crit) {
    var s = String(expr || "");
    var m = s.match(/(\d*)d(\d+)/i);
    if (!m) return null;
    var n = Math.max(1, parseInt(m[1] || "1", 10));
    var sides = parseInt(m[2], 10);
    var flatM = s.replace(/(\d*)d(\d+)/i, " ").match(/([+-]\s*\d+)/);
    var flat = flatM ? parseInt(flatM[1].replace(/\s/g, ""), 10) : 0;
    if (crit) n = n * 2;
    var rolls = [];
    for (var k = 0; k < Math.abs(n); k++) rolls.push(1 + Math.floor(Math.random() * sides));
    var sum = rolls.reduce(function (a, b) { return a + b; }, 0) + (flat || 0);
    var detail = rolls.join("+") + (flat ? ((flat >= 0 ? "+" : "") + flat) : "");
    return { total: sum, detail: detail, formula: n + "d" + sides + (flat ? ((flat >= 0 ? "+" : "") + flat) : "") };
  }
  function whisperOn() {
    var box = document.querySelector("#chkWhisper");
    return !!(box && box.checked);
  }
  function rollGun(i) {
    var c = ch();
    if (!c || !c.guns || !c.guns[i] || !c.guns[i].weapon) { toast("Pick a gun first"); return; }
    var g = c.guns[i];
    var name0 = gunName(i);
    if (/borrowed iron/i.test(name0) || g.weapon === "borrowed-iron") {
      var msg = "Borrowed Iron has no weapon stats. Use Pact Shot.";
      toast(msg);
      addLog({ kind: "alert", text: msg });
      return;
    }
    var empty = root.SSDNSApplied && root.SSDNSApplied.gunEmpty ? root.SSDNSApplied.gunEmpty(g) : !num(g.loaded);
    if (empty) {
      g.loaded = 0;
      toast("Empty: reload", "Reload", function () {
        var reloadBtn = document.querySelector('[data-reload="' + i + '"]');
        if (reloadBtn && !reloadBtn.hidden) reloadBtn.click();
      });
      addLog({ kind: "alert", text: name0 + ": Empty: reload" });
      return;
    }
    var gate = attackGate(currentTarget());
    if (gate) { toast(gate); addLog({ kind: "alert", text: gate }); return; }
    var spent = root.SSDNSApp && root.SSDNSApp.spendRound ? root.SSDNSApp.spendRound(i) : null;
    if (!spent || !spent.ok) {
      var reason = (spent && spent.reason) || "That gun can't fire.";
      toast(reason);
      addLog({ kind: "alert", text: name0 + ": " + reason });
      return;
    }
    var atkEl = document.querySelector('[data-calc="gunAtk.' + i + '"]');
    var atk = parseInt(atkEl && String(atkEl.value).replace(/[^\d-]/g, ""), 10);
    if (!isFinite(atk)) atk = 0;
    var misEl = document.querySelector('[data-out="mis.' + i + '"]');
    var ceiling = root.SSDNSApp.misfireCeiling
      ? root.SSDNSApp.misfireCeiling(misEl && misEl.textContent, !!g.dirty)
      : 1;
    var modeSel = document.querySelector('[data-adv="' + i + '"]');
    var globalAdv = document.querySelector("#globalAdv");
    var chosen = (modeSel && modeSel.value) || (globalAdv && globalAdv.value) || "";
    var gunRollId = "r_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    var gunDice = attackRoll(atk, (ch() && ch().activeConditions) || [], chosen);
    var n1 = gunDice.n1, n2 = gunDice.n2, nat = gunDice.nat;
    var bad = function (n) { return n >= 1 && n <= ceiling; };
    var both = n2 != null && bad(n1) && bad(n2);
    var lists = [].concat((root.SSDNS_RULES && root.SSDNS_RULES.firearms) || [], (root.SSDNS_RULES && root.SSDNS_RULES.casterGuns) || []);
    var wpn = lists.filter(function (x) { return x.id === g.weapon; })[0];
    var rugged = !!(wpn && /rugged/i.test(wpn.properties || ""));
    var name = gunName(i);
    var who = (ch() && ch().name) || name;
    var dice = gunDice.shown || String(nat);
    var total = nat + atk;
    var misfired = false;
    if (both && !rugged) {
      g.fouled = true;
      var foul = document.querySelector('[data-f="character.guns.' + i + '.fouled"]');
      if (foul) { foul.checked = true; dispatch(foul); }
      postGunLedger(name + " fouled (double misfire)", "foul");
      misfired = true;
    } else if (bad(nat)) {
      g.jammed = true;
      var jam = document.querySelector('[data-f="character.guns.' + i + '.jammed"]');
      if (jam) { jam.checked = true; dispatch(jam); }
      attackCue("jam");
      postGunLedger(name + " jammed (misfire)", "jam");
      misfired = true;
    }
    var quiet = whisperOn();
    var tgt = currentTarget();
    if (tgt) rememberEnemy(tgt);
    var haveAc = tgt && tgt.ac != null && isFinite(Number(tgt.ac));
    var dmgEl = document.querySelector('[data-calc="gunDmg.' + i + '"]');
    if (!misfired) attackCue("attack");
    if (!misfired && acHidden(tgt) && joined() && !quiet) {
      var pendingDmg = rollDamageExpr(dmgEl && dmgEl.value, nat === 20);
      sendPendingAttack({
        who: who,
        targetName: tgt.name,
        targetId: tgt.id,
        nat: nat,
        hitTotal: total,
        damage: pendingDmg ? pendingDmg.total : 0,
        dice: pendingDmg ? pendingDmg.detail : "",
        formula: (n2 == null ? "1d20" : "2d20") + (atk ? (atk >= 0 ? "+" : "") + atk : ""),
        rollId: gunRollId,
        label: who + (tgt.name ? " → " + tgt.name : ""),
        weapon: name,
        sfx: "attack",
        quiet: false
      });
      consumeRollMode();
      return;
    }
    var miss = nat === 1 || misfired || (haveAc && total < Number(tgt.ac));
    var dmg = null;
    if (!miss) dmg = rollDamageExpr(dmgEl && dmgEl.value, nat === 20);
    var report = attackReport({
      who: who, target: tgt && tgt.name, nat: nat, atk: atk,
      ac: tgt && tgt.ac, miss: miss, misfire: misfired, dmg: dmg,
      dice: dice
    });
    var ammoTxt = spent.left == null ? "" : (spent.left === 0 ? " · ammo" : (" · " + spent.left + " rounds left."));
    var line = report.player + (misfired ? " · misfire" : "") + (gunDice.note ? " · " + gunDice.note : "") + modeWord(chosen) + ammoTxt;
    consumeRollMode();
    toast(line);
    addLog({
      id: "roll:" + gunRollId,
      kind: "roll", text: line,
      label: who + (tgt && tgt.name ? " → " + tgt.name : " attack"),
      formula: (n2 == null ? "1d20" : "2d20") + (atk ? (atk >= 0 ? "+" : "") + atk : "") + (dmg && !report.miss ? " · " + dmg.formula : ""),
      attack: true, nat: nat, crit: nat === 20 && !misfired
    });
    if (joined() && root.SSDNSDmJoin.postRoll) {
      root.SSDNSDmJoin.postRoll({
        id: gunRollId,
        label: who + (tgt && tgt.name ? " → " + tgt.name : ""),
        formula: (n2 == null ? "1d20" : "2d20") + (atk ? (atk >= 0 ? "+" : "") + atk : ""),
        result: total,
        detail: line,
        ac: report.ac,
        nat1: false,
        isFirearm: true,
        attack: true,
        nat: nat,
        crit: nat === 20 && !report.miss,
        private: quiet,
        whisper: quiet,
        damage: (!report.miss && dmg) ? dmg.total : null,
        weapon: name,
        targetId: tgt && tgt.id,
        targetName: tgt && tgt.name
      });
    }
    if (!report.miss && dmg && root.SSDNSDmJoin && root.SSDNSDmJoin.postDamage && !quiet) {
      root.SSDNSDmJoin.postDamage({ amount: dmg.total, label: name, weapon: name, type: "weapon", targetId: tgt && tgt.id, targetName: tgt && tgt.name, rollId: gunRollId });
    }
  }

  function postGunLedger(what, type) {
    var c = ch();
    addLog({ kind: "dm", text: what });
    if (joined() && root.SSDNSDmJoin.postLedger) {
      root.SSDNSDmJoin.postLedger({
        type: type,
        what: what,
        oldVal: null,
        newVal: what,
        flag: false,
        who: (c && c.player) || "Player",
        playerName: (c && c.player) || "",
        characterName: (c && c.name) || ""
      });
    }
  }

  function findGun(name) {
    var c = ch();
    if (!c) return -1;
    var want = String(name || "").toLowerCase();
    for (var i = 0; i < (c.guns || []).length; i++) {
      if (!c.guns[i] || !c.guns[i].weapon) continue;
      if (gunName(i).toLowerCase().indexOf(want) >= 0 || want.indexOf(gunName(i).toLowerCase()) >= 0) return i;
    }
    return -1;
  }

  function applyGunEvent(payload) {
    payload = payload || {};
    var i = findGun(payload.name);
    if (i < 0) return;
    if (payload.spend && root.SSDNSApp && root.SSDNSApp.spendRound) {
      var spent = root.SSDNSApp.spendRound(i);
      if (!spent.ok) showNotice((payload.name || "Gun") + ": " + (spent.reason || "could not spend a round"));
    }
    ["jammed", "fouled", "dirty"].forEach(function (k) {
      if (payload[k] == null) return;
      var box = document.querySelector('[data-f="character.guns.' + i + '.' + k + '"]');
      if (box) { box.checked = !!payload[k]; dispatch(box); }
    });
    if (payload.jammed) showNotice((payload.name || "Gun") + " jammed (misfire)");
    else if (payload.fouled) showNotice((payload.name || "Gun") + " fouled");
  }

  function setDeath(side, index, on) {
    var path = side === "fail" ? "fail" : "success";
    var box = document.querySelector('[data-f="character.deathSaves.' + path + '.' + index + '"]');
    if (!box) return;
    box.checked = !!on;
    dispatch(box);
  }

  function applyRest(kind) {
    var c = ch();
    if (!c) return;
    if (kind === "long") {
      var max = num(c.hpMax);
      if (max > 0) c.hpCurrent = max;
      c.hpTemp = 0;
      if (c.deathSaves) {
        c.deathSaves.success = [false, false, false];
        c.deathSaves.fail = [false, false, false];
      }
      if (c.hexLead) {
        Object.keys(c.hexLead).forEach(function (lvl) {
          c.hexLead[lvl] = (c.hexLead[lvl] || []).map(function () { return false; });
        });
      }
      syncRestFields(c);
      showNotice("Long rest — HP full and slots refreshed. Guns stay as they are. Dirty and fouled need a Clean.");
    } else {
      var ci = root.SSDNSApp && root.SSDNSApp.casterInfo ? root.SSDNSApp.casterInfo() : null;
      var shortHex = (c.hexRest || (ci && ci.rest) || "") === "short";
      if (shortHex && c.hexLead) {
        Object.keys(c.hexLead).forEach(function (lvl) {
          c.hexLead[lvl] = (c.hexLead[lvl] || []).map(function () { return false; });
        });
      }
      syncRestFields(c);
      var word = "spell slots";
      if (c.calling === "hexslinger") word = "Hex Lead";
      else if (c.calling === "pact-seeker") word = "Pact slots";
      showNotice(shortHex ? "Short rest — pact slots refreshed. Guns, dirt, and fouling stay." : "Short rest. Your " + word + " comes back on a long rest. Guns, dirt, and fouling stay.");
    }
  }

  function syncRestFields(c) {
    var cur = $("#inHPCur"), tmp = $("#inHPTemp");
    if (cur) cur.value = c.hpCurrent === "" || c.hpCurrent == null ? "" : String(c.hpCurrent);
    if (tmp) tmp.value = String(c.hpTemp || 0);
    (c.guns || []).forEach(function (g, i) {
      ["jammed", "dirty", "fouled"].forEach(function (k) {
        var box = document.querySelector('[data-f="character.guns.' + i + '.' + k + '"]');
        if (box) box.checked = !!g[k];
      });
    });
    if (c.deathSaves) {
      ["success", "fail"].forEach(function (side) {
        (c.deathSaves[side] || []).forEach(function (on, i) {
          var box = document.querySelector('[data-f="character.deathSaves.' + side + '.' + i + '"]');
          if (box) box.checked = !!on;
        });
      });
    }
    dispatch(document.querySelector('[data-f="character.deathSaves.success.0"]') || cur);
  }

  function undoItem(text) {
    var c = ch();
    var ta = document.querySelector('[data-f="character.equipment"]');
    if (!c || !ta) return;
    var lines = String(c.equipment || "").split("\n");
    var needle = text ? ("• " + text + " (from DM)") : null;
    var idx = -1;
    if (needle) idx = lines.lastIndexOf(needle);
    if (idx < 0) {
      for (var i = lines.length - 1; i >= 0; i--) {
        if (/\(from DM\)/.test(lines[i])) { idx = i; break; }
      }
    }
    if (idx >= 0) lines.splice(idx, 1);
    c.equipment = lines.join("\n").replace(/^\n+|\n+$/g, "");
    ta.value = c.equipment;
    dispatch(ta);
    showNotice("DM undid an item");
  }

  function whisper() {
    var formula = ($("#whisperFormula") && $("#whisperFormula").value) || "1d20";
    var f = String(formula).replace(/\s/g, "").toLowerCase();
    var m = f.match(/^(\d*)d(\d+)([+-]\d+)?$/);
    var total = 0, detail = "?", nat1 = false;
    if (!m) {
      total = parseInt(f, 10) || 0;
      detail = String(total);
    } else {
      var n = Math.max(1, parseInt(m[1] || "1", 10));
      var sides = parseInt(m[2], 10);
      var mod = m[3] ? parseInt(m[3], 10) : 0;
      var rolls = [];
      for (var i = 0; i < n; i++) rolls.push(1 + Math.floor(Math.random() * sides));
      total = rolls.reduce(function (a, b) { return a + b; }, 0) + mod;
      detail = rolls.join("+") + (mod ? (mod >= 0 ? "+" : "") + mod : "");
      nat1 = n === 1 && sides === 20 && rolls[0] === 1;
    }
    var c = ch();
    var text = "Whisper " + formula + " = " + total + " (" + detail + ")";
    addLog({ kind: "dm", text: text + " (only the DM sees the roll)" });
    toast(text);
    if (joined() && root.SSDNSDmJoin.postRoll) {
      root.SSDNSDmJoin.postRoll({
        label: "Whisper to DM",
        formula: formula,
        result: total,
        detail: detail,
        nat1: nat1,
        isFirearm: false,
        private: true,
        whisper: true
      });
    } else if (!joined()) {
      toast("Offline — the DM only sees whisper rolls after you Join");
    }
    if (c) { /* names go with the roll */ }
  }

  function spellsForSlot(level) {
    var c = ch();
    if (!c) return [];
    var preparedIds = { "frontier-preacher": 1, "nature-guide": 1, "lawman": 1, "scholar": 1 };
    var prepared = !!preparedIds[c.calling];
    var out = [];
    if (num(level) <= 0) {
      (c.cantrips || []).forEach(function (n) { if (n) out.push({ name: n, level: 0, slot: 0 }); });
      if (c.calling === "pact-seeker" && !out.some(function (s) { return /pact shot|eldritch blast/i.test(s.name); })) {
        out.unshift({ name: "Pact Shot", level: 0, slot: 0 });
      }
      return out;
    }
    var slot = num(level);
    var lv;
    for (lv = 1; lv <= slot; lv++) {
      (c.spells[lv] || []).forEach(function (s) {
        if (!s || !s.name) return;
        if (prepared && !s.prepared) return;
        out.push({ name: s.name, level: lv, slot: slot });
      });
    }
    return out;
  }
  function castPicked(i, sp) {
    var c = ch();
    if (!sp) return;
    var looked = root.SSDNSSpellCast && root.SSDNSSpellCast.lookup && root.SSDNSSpellCast.lookup(sp.name);
    chooseCastTarget(sp.name, looked, sp.slot || 0).then(function (choice) {
      if (!choice) return;
      castChoice = choice;
      castPickedNow(i, sp);
    });
  }
  function castPickedNow(i, sp) {
    var c = ch();
    var slot = sp.slot || 0;
    if (slot > 0 && c && c.calling === "hexslinger") {
      var held = root.SSDNSApp && root.SSDNSApp.spendHexChamber ? root.SSDNSApp.spendHexChamber(i, slot) : { ok: false };
      if (!held.ok) {
        if (!root.SSDNSApp || !root.SSDNSApp.spendHexSlot || !root.SSDNSApp.spendHexSlot(slot)) {
          toast(held.reason || "No level-" + slot + " hex lead left.");
          return;
        }
      }
      castSpellAttack(i, sp.name, slot, true);
      return;
    }
    if (slot > 0 && root.SSDNSApp && root.SSDNSApp.spendHexSlot && !root.SSDNSApp.spendHexSlot(slot)) {
      toast("No level-" + slot + " slot left.");
      return;
    }
    castSpellAttack(i, sp.name, slot, !!(c && c.calling === "hexslinger" && slot > 0));
  }
  function openCastPrompt(level, onPick) {
    var c = ch();
    var v = root.SSDNSApp && root.SSDNSApp.compute ? root.SSDNSApp.compute() : {};
    if (!v.caster && !(c && (c.calling === "hexslinger" || c.calling === "pact-seeker"))) {
      toast("This Calling has no spells at this level.");
      return;
    }
    var list = spellsForSlot(level);
    var dlg = document.getElementById("dlgCast");
    if (!dlg) {
      dlg = document.createElement("dialog");
      dlg.id = "dlgCast";
      dlg.className = "dlg";
      document.body.appendChild(dlg);
    }
    dlg.innerHTML = "<form method='dialog'><h2></h2><div id='castList'></div><div class='dlg-foot'><button type='button' class='btn' id='castCancel'>Cancel</button></div></form>";
    dlg.querySelector("h2").textContent = num(level) ? ("Level " + level + " spells") : "Cantrips";
    var box = dlg.querySelector("#castList");
    if (!list.length) box.appendChild(document.createTextNode("No spells of that level on this sheet yet. Add them on the Spells page."));
    list.forEach(function (sp) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "btn";
      b.style.display = "block";
      b.style.margin = "6px 0";
      b.textContent = (sp.level ? ("L" + sp.level + " · ") : "Cantrip · ") + sp.name;
      b.addEventListener("click", function () {
        if (dlg.close) dlg.close();
        onPick(sp);
      });
      box.appendChild(b);
    });
    dlg.querySelector("#castCancel").onclick = function () { if (dlg.close) dlg.close(); };
    if (dlg.showModal) dlg.showModal();
  }
  function gunIndexForCast() {
    var c = ch();
    var hit = -1;
    (c && c.guns || []).forEach(function (g, i) {
      if (g && g.weapon) hit = i;
    });
    return hit;
  }
  function rollHex() {
    var level = num($("#hexRollLevel") && $("#hexRollLevel").value);
    openCastPrompt(level, function (sp) { castPicked(gunIndexForCast(), sp); });
  }

  function sendChat(input) {
    input = input || $("#logChatText");
    var text = (input && input.value || "").trim();
    if (!text) return;
    var c = ch();
    var stateEl = $("#chatSendState");
    if (!joined() || !root.SSDNSDmJoin || !root.SSDNSDmJoin.postChat) {
      toast("Not sent. Join the table, then send again.");
      addLog({ kind: "alert", text: "Not sent (offline): " + text });
      return;
    }
    if (stateEl) stateEl.textContent = "Sending…";
    addLog({ kind: "chat", text: ((c && c.player) || "You") + ": " + text });
    var pending = root.SSDNSDmJoin.postChat({
      text: text,
      fromName: (c && (c.player || c.name)) || "Player"
    });
    Promise.resolve(pending).then(function (res) {
      var ok = !res || res.ok !== false;
      if (stateEl) stateEl.textContent = ok ? "Sent" : "Failed — queued";
      if (ok && input) input.value = "";
      else toast("Message queued. It sends when the room reconnects.");
    });
  }

  function watchKeyboard() {
    var rootEl = document.documentElement;
    function apply() {
      var vv = window.visualViewport;
      var inset = 0;
      if (vv) inset = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
      rootEl.style.setProperty("--vv-bottom", inset + "px");
    }
    apply();
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", apply);
      window.visualViewport.addEventListener("scroll", apply);
    }
    window.addEventListener("resize", apply);
    function chatting(node) {
      return !!(node && node.closest && node.closest("#sheetDockChat, #logChat, .log-chat, .dock-compose"));
    }
    document.addEventListener("focusin", function (e) {
      if (chatting(e.target)) document.body.classList.add("chat-focus");
    });
    document.addEventListener("focusout", function () {
      setTimeout(function () {
        if (!chatting(document.activeElement)) document.body.classList.remove("chat-focus");
      }, 0);
    });
  }
  function wire() {
    var minus = $("#btnHpMinus"), plus = $("#btnHpPlus");
    if (minus) minus.addEventListener("click", function () { bump(-1); });
    if (plus) plus.addEventListener("click", function () { bump(1); });
    var hurt = $("#btnHpHurt"), heal = $("#btnHpHeal");
    if (hurt) hurt.addEventListener("click", function () {
      var amt = Math.abs(num($("#inHpAdjust") && $("#inHpAdjust").value));
      if (!amt) { toast("Enter an amount"); return; }
      applyDelta(-amt);
    });
    if (heal) heal.addEventListener("click", function () {
      var amt = Math.abs(num($("#inHpAdjust") && $("#inHpAdjust").value));
      if (!amt) { toast("Enter an amount"); return; }
      var selfName = (ch() && ch().name) || "You";
      var line = root.SSDNSApplied ? root.SSDNSApplied.healLine(selfName, selfName, amt, "") : (selfName + " heals " + selfName + " " + amt);
      var hid = "r_" + Date.now().toString(36);
      if (joined() && root.SSDNSDmJoin && root.SSDNSDmJoin.claimGrant) root.SSDNSDmJoin.claimGrant("hp:" + hid);
      applyDelta(amt, line);
      if (joined() && root.SSDNSDmJoin && root.SSDNSDmJoin.postRoll && root.SSDNSDmJoin.uid) {
        var selfId = root.SSDNSDmJoin.uid();
        root.SSDNSDmJoin.postRoll({ id: hid, label: "Heal", formula: String(amt), result: amt, detail: line, heal: true, attack: false, damage: null, selfApplied: true, targetId: selfId, targetName: selfName });
      }
    });
    document.addEventListener("click", function (e) {
      var buyBtn = e.target.closest && e.target.closest("[data-buy]");
      if (buyBtn) buy(num(buyBtn.getAttribute("data-buy")));
      var storePick = e.target.closest && e.target.closest("[data-store-tab]");
      if (storePick) { storeTab = storePick.getAttribute("data-store-tab") || ""; renderStore(); }
      var reopen = e.target.closest && e.target.closest("[data-reopen-handout]");
      if (reopen && !(e.target.closest && e.target.closest("a")) && !(e.target.closest && e.target.closest("[data-handout-zoom]"))) {
        var item = reopen.closest("[data-reopen-handout]") || reopen;
        var idx = item && item.parentNode ? Array.prototype.indexOf.call(item.parentNode.children, item) : -1;
        var rows = log.filter(function (row) { return filter === "all" || row.kind === filter; });
        var entry = item && item.classList && item.classList.contains("log-item") ? rows[idx] : null;
        function dec(v) { try { return decodeURIComponent(v || ""); } catch (err) { return v || ""; } }
        var title = dec(item && item.getAttribute("data-title")) || (entry && entry.title) || "Handout";
        var url = dec(item && item.getAttribute("data-url")) || (entry && entry.url) || "";
        var body = dec(item && item.getAttribute("data-body")) || (entry && entry.body) || "";
        if (root.SSDNSDmJoin && root.SSDNSDmJoin.showHandout) root.SSDNSDmJoin.showHandout(title, url, body, true);
      }
      var f = e.target.closest && e.target.closest("[data-log-filter]");
      if (f) {
        filter = f.getAttribute("data-log-filter");
        document.querySelectorAll("[data-log-filter]").forEach(function (b) {
          b.classList.toggle("on", b === f);
        });
        renderLog();
      }
    });
    document.addEventListener("click", function (e) {
      var d20 = e.target.closest && e.target.closest("[data-d20]");
      if (d20) { rollCheck(d20.getAttribute("data-d20")); return; }
      var cast = e.target.closest && e.target.closest("[data-cast]");
      if (cast) {
        var gi = num(cast.getAttribute("data-cast"));
        var slotSel = document.querySelector('[data-castslot="' + gi + '"]');
        var lvl = slotSel && !slotSel.hidden ? num(slotSel.value, 0) : num($("#hexRollLevel") && $("#hexRollLevel").value, 0);
        openCastPrompt(lvl, function (sp) { castPicked(gi, sp); });
        return;
      }
      var spellCast = e.target.closest && e.target.closest("[data-spell-cast]");
      if (spellCast) {
        var raw = spellCast.getAttribute("data-spell-cast") || "";
        var cut = raw.indexOf(":");
        var sl = num(raw.slice(0, cut), 0);
        var sname = raw.slice(cut + 1);
        castPicked(gunIndexForCast(), { name: sname, level: sl, slot: sl });
        return;
      }
    }, true);
    document.addEventListener("change", function () { renderConds(); renderStore(); });
    var chat = $("#logChat");
    if (chat) chat.addEventListener("submit", function (e) { e.preventDefault(); sendChat($("#logChatText")); });
    var dockChat = $("#sheetDockChat");
    if (dockChat) dockChat.addEventListener("submit", function (e) { e.preventDefault(); sendChat($("#sheetDockText")); });
    var hexBtn = $("#btnHexRoll");
    if (hexBtn) hexBtn.addEventListener("click", rollHex);
    var hexLv = $("#hexRollLevel");
    if (hexLv) hexLv.addEventListener("change", rollHex);
    var initBtn = $("#btnInit");
    if (initBtn) initBtn.addEventListener("click", rollInitiative);
    var spendInsp = $("#btnSpendInsp");
    if (spendInsp) spendInsp.addEventListener("click", function () {
      if (!joined() || !root.SSDNSDmJoin || !root.SSDNSDmJoin.spendInspiration) {
        toast("Join a table to spend the shared Inspiration pool.");
        return;
      }
      root.SSDNSDmJoin.spendInspiration();
    });
    document.querySelectorAll("[data-sheet-filter]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        dockFilter = btn.getAttribute("data-sheet-filter") || "all";
        document.querySelectorAll("[data-sheet-filter]").forEach(function (b) { b.classList.toggle("on", b === btn); });
        renderDock();
      });
    });
    var dockFeed = $("#sheetDockFeed");
    if (dockFeed) dockFeed.addEventListener("scroll", function () {
      var gap = dockFeed.scrollHeight - dockFeed.scrollTop - dockFeed.clientHeight;
      dockFeed.dataset.stick = gap < 64 ? "1" : "0";
    });
    var collapse = $("#btnSheetDockCollapse");
    if (collapse) collapse.addEventListener("click", function () {
      if (window.matchMedia("(max-width: 800px)").matches) {
        document.body.classList.remove("dock-open");
        renderDock();
        return;
      }
      document.body.classList.toggle("sheet-dock-collapsed");
      collapse.textContent = document.body.classList.contains("sheet-dock-collapsed") ? "Show" : "Hide";
      try { localStorage.setItem("ssdns.sheet.dock", document.body.classList.contains("sheet-dock-collapsed") ? "closed" : "open"); } catch (err) {}
      renderDock();
    });
    var fab = $("#btnSheetDockFab");
    if (fab) fab.addEventListener("click", function () {
      document.body.classList.toggle("dock-open");
      if (document.body.classList.contains("dock-open")) sheetDockSeen = log.length;
      renderDock();
    });
    watchKeyboard();
    try {
      if (localStorage.getItem("ssdns.sheet.dock") === "closed") {
        document.body.classList.add("sheet-dock-collapsed");
        if (collapse) collapse.textContent = "Show";
      }
    } catch (err) {}
    var wh = $("#btnWhisper");
    if (wh) wh.addEventListener("click", whisper);
    var hear = $("#btnTapHear");
    if (hear) hear.addEventListener("click", function () {
      if (root.SSDNSAudio) root.SSDNSAudio.resumeMusic();
      hear.hidden = true;
    });
    renderLog();
    renderStore();
    setTimeout(renderConds, 400);
    document.addEventListener("click", function (e) {
      var t = e.target && e.target.closest ? e.target.closest("[data-handout-zoom]") : null;
      if (!t) return;
      zoomHandout(t.getAttribute("data-url") || t.getAttribute("src") || "", t.getAttribute("data-title") || "Handout");
    });
  }

  root.SSDNSGunRoll = rollGun;
  root.SSDNSGunCastHex = castLoadedHex;
  root.SSDNSSheet = {
    applyDelta: applyDelta,
    setHp: setHp,
    flashHp: flashHp,
    logRows: function () { return log.slice(); },
    showNotice: showNotice,
    setConditions: setConditions,
    addLog: addLog,
    clearLog: clearLog,
    mergeLog: mergeLog,
    rollDamageExpr: rollDamageExpr,
    openStore: openStore,
    setStock: setStock,
    applyGunEvent: applyGunEvent,
    setDeath: setDeath,
    applyRest: applyRest,
    undoItem: undoItem,
    renderStore: renderStore,
    renderLog: renderLog,
    showInspiration: showInspiration,
    castNamed: function (name) { castSpellAttack(-1, name, 0, false); },
    attackRoll: attackRoll,
    attackGate: attackGate,
    acHidden: acHidden,
    sendPendingAttack: sendPendingAttack,
    consumeRollMode: consumeRollMode,
    attackCue: attackCue,
    showTapHear: function () {
      var b = $("#btnTapHear");
      if (b) b.hidden = false;
    }
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire);
  else wire();
})(window);

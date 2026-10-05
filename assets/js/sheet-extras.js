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
  function toast(msg) {
    var t = $("#toastText"), box = $("#toast");
    if (t && box) {
      t.textContent = msg;
      box.hidden = false;
      clearTimeout(toast._t);
      toast._t = setTimeout(function () { box.hidden = true; }, 3600);
    }
  }
  function num(v) { var n = parseInt(v, 10); return isFinite(n) ? n : 0; }
  function dispatch(el) {
    if (el) el.dispatchEvent(new Event("change", { bubbles: true }));
  }
  function joined() {
    return root.SSDNSDmJoin && root.SSDNSDmJoin.isJoined && root.SSDNSDmJoin.isJoined();
  }

  function setHp(current, temp) {
    var cur = $("#inHPCur"), tmp = $("#inHPTemp");
    if (cur) cur.value = String(current);
    if (tmp && temp != null) tmp.value = String(temp);
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
    renderConds();
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
    var box = $("#condBanner");
    if (!box) return;
    if (!list.length) { box.hidden = true; box.innerHTML = ""; return; }
    box.hidden = false;
    box.innerHTML = list.map(function (name) {
      return '<span class="cond-chip">' + name.replace(/[&<>]/g, function (ch) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[ch];
      }) + "</span>";
    }).join("");
    var cur = num($("#inHPCur") && $("#inHPCur").value);
    var hp = $(".hp");
    if (hp) hp.classList.toggle("hp-down", cur <= 0);
  }

  function setConditions(list) {
    var text = (list || []).filter(Boolean).join(", ");
    var c = ch();
    if (c) c.tableConditions = text;
    var el = $("#inTableConditions");
    if (el) { el.value = text; dispatch(el); }
    renderConds();
    if (list && list.length) showNotice("Conditions: " + text);
    else showNotice("Conditions cleared");
  }

  function addLog(entry) {
    entry.ts = entry.ts || new Date().toISOString();
    log.unshift(entry);
    if (log.length > 200) log.length = 200;
    renderLog();
  }

  function renderLog() {
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
      try { when = new Date(e.ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); } catch (err) {}
      return '<div class="log-item log-' + (e.kind || "all") + '"><div class="log-meta">' + when + " · " + (e.kind || "") + '</div><div>' +
        String(e.text || "").replace(/[&<>]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]; }) +
        "</div></div>";
    }).join("");
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
    if (esEl) esEl.textContent = joined() ? ("Your shards: " + es + " ES") : "Not joined — buying stays off.";
    if (!joined()) {
      if (lede) lede.textContent = "Join a table with the room code. The DM sets tonight's stock and can open this tab for you. Nothing here changes your sheet until then.";
      box.innerHTML = "";
      return;
    }
    if (!storeOpen || !stock.length) {
      if (lede) lede.textContent = storeOpen ? "The store is open, but the DM has not listed any stock yet." : "The DM has not opened the store this session.";
      box.innerHTML = "";
      return;
    }
    if (lede) lede.textContent = "Session stock. Buying spends ES and writes a ledger line.";
    box.innerHTML = stock.map(function (item, i) {
      var price = num(item.price);
      return '<div class="store-row"><div><b>' + esc(item.name) + '</b><div class="fine">' + price + ' ES</div></div>' +
        '<button type="button" class="btn" data-buy="' + i + '"' + (es < price ? " disabled" : "") + ">Buy</button></div>";
    }).join("");
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function buy(index) {
    if (!joined()) { toast("Join a table before buying"); return; }
    var item = stock[index];
    if (!item) return;
    var price = num(item.price);
    var Bridge = root.SSDNSBridge;
    var d = doc();
    if (!Bridge || !d) return;
    var old = Bridge.cpValue(d.shards);
    if (old < price) { toast("Not enough ES"); return; }
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
    toast("Bought " + item.name);
    renderStore();
  }

  function openStore(list) {
    storeOpen = true;
    if (Array.isArray(list)) stock = list;
    var tab = $("#tab-store");
    if (tab) tab.click();
    renderStore();
    toast("The Eldorite Store is open");
  }

  function setStock(list) {
    stock = Array.isArray(list) ? list : [];
    renderStore();
  }

  function gunName(i) {
    var sel = document.querySelector('[data-f="character.guns.' + i + '.weapon"]');
    if (!sel || sel.selectedIndex < 0) return "Gun";
    var t = sel.options[sel.selectedIndex].text || "Gun";
    return t.replace(/\s+·.*$/, "").trim() || "Gun";
  }

  function rollGun(i) {
    var c = ch();
    if (!c || !c.guns || !c.guns[i] || !c.guns[i].weapon) { toast("Pick a gun first"); return; }
    var g = c.guns[i];
    var atkEl = document.querySelector('[data-calc="gunAtk.' + i + '"]');
    var atk = parseInt(atkEl && String(atkEl.value).replace(/[^\d-]/g, ""), 10);
    if (!isFinite(atk)) atk = 0;
    var nat = 1 + Math.floor(Math.random() * 20);
    var total = nat + atk;
    var name = gunName(i);
    if (root.SSDNSAudio) root.SSDNSAudio.play("attack");
    var bits = [name + " attack " + (atk >= 0 ? "+" : "") + atk + ": " + nat + (atk ? (atk >= 0 ? "+" : "") + atk : "") + " = " + total];
    if (nat === 1) {
      g.jammed = true;
      var jam = document.querySelector('[data-f="character.guns.' + i + '.jammed"]');
      if (jam) { jam.checked = true; dispatch(jam); }
      if (root.SSDNSAudio) root.SSDNSAudio.play("jam");
      bits.push("Natural 1 — jammed.");
      postGunLedger(name + " jammed (natural 1)", "jam");
    }
    if (g.cracked) {
      var ex = 1 + Math.floor(Math.random() * 20);
      bits.push("Cracked explode check: " + ex);
      if (ex === 1) {
        if (root.SSDNSAudio) root.SSDNSAudio.play("explode");
        bits.push("The gun explodes.");
        postGunLedger(name + " exploded (cracked gun, explode check 1)", "explode");
      }
    }
    toast(bits.join(" "));
    addLog({ kind: "dm", text: bits.join(" ") });
    if (joined() && root.SSDNSDmJoin.postRoll) {
      root.SSDNSDmJoin.postRoll({
        label: name + " attack",
        formula: "1d20" + (atk ? (atk >= 0 ? "+" : "") + atk : ""),
        result: total,
        detail: String(nat) + (atk ? (atk >= 0 ? "+" : "") + atk : ""),
        nat1: nat === 1,
        isFirearm: true,
        private: false,
        whisper: false
      });
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
        flag: true,
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
    ["jammed", "cracked", "fouled", "dirty"].forEach(function (k) {
      if (payload[k] == null) return;
      var box = document.querySelector('[data-f="character.guns.' + i + '.' + k + '"]');
      if (box) { box.checked = !!payload[k]; dispatch(box); }
    });
    if (payload.exploded) showNotice((payload.name || "Gun") + " exploded");
    else if (payload.jammed) showNotice((payload.name || "Gun") + " jammed");
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
      (c.guns || []).forEach(function (g, gi) {
        if (!g || !g.weapon) return;
        var capEl = document.querySelector('[data-out="cap.' + gi + '"]');
        var use = num(capEl && capEl.textContent) || num(g.capacity);
        if (use > 0) {
          g.loaded = use;
          if (Array.isArray(g.chambers)) {
            for (var k = 0; k < g.chambers.length; k++) g.chambers[k] = k < use ? (g.chambers[k] || "c") : "";
          }
        }
        g.jammed = false;
        g.dirty = false;
        g.fouled = false;
      });
      syncRestFields(c);
      showNotice("Long rest — HP full, slots and guns reset. Cracked stays until you fix it.");
    } else {
      (c.guns || []).forEach(function (g) { if (g) g.dirty = false; });
      var shortHex = (c.hexRest === "short");
      if (shortHex && c.hexLead) {
        Object.keys(c.hexLead).forEach(function (lvl) {
          c.hexLead[lvl] = (c.hexLead[lvl] || []).map(function () { return false; });
        });
      }
      syncRestFields(c);
      showNotice(shortHex ? "Short rest — dirt cleared and hex lead refreshed." : "Short rest — dirt cleared. Hex lead waits for a long rest. Spend hit dice yourself if you heal.");
    }
  }

  function syncRestFields(c) {
    var cur = $("#inHPCur"), tmp = $("#inHPTemp");
    if (cur) cur.value = c.hpCurrent === "" || c.hpCurrent == null ? "" : String(c.hpCurrent);
    if (tmp) tmp.value = String(c.hpTemp || 0);
    (c.guns || []).forEach(function (g, i) {
      ["jammed", "dirty", "fouled", "cracked"].forEach(function (k) {
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

  function sendChat() {
    var input = $("#logChatText");
    var text = (input && input.value || "").trim();
    if (!text) return;
    if (!joined()) { toast("Join a table to chat"); return; }
    input.value = "";
    var c = ch();
    addLog({ kind: "chat", text: ((c && c.player) || "You") + ": " + text });
    if (root.SSDNSDmJoin.postChat) {
      root.SSDNSDmJoin.postChat({
        text: text,
        fromName: (c && (c.player || c.name)) || "Player"
      });
    }
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
      applyDelta(amt);
    });
    document.addEventListener("click", function (e) {
      var buyBtn = e.target.closest && e.target.closest("[data-buy]");
      if (buyBtn) buy(num(buyBtn.getAttribute("data-buy")));
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
      var b = e.target.closest && e.target.closest("[data-fire],[data-reload],[data-hexload]");
      if (!b || !root.SSDNSAudio) return;
      if (b.hasAttribute("data-reload")) root.SSDNSAudio.play("reload");
      else if (b.hasAttribute("data-hexload") || b.classList.contains("hex")) root.SSDNSAudio.play("spellcast");
      else if (b.hasAttribute("data-fire")) root.SSDNSAudio.play("attack");
    }, true);
    document.addEventListener("change", function () { renderConds(); });
    var chat = $("#logChat");
    if (chat) chat.addEventListener("submit", function (e) { e.preventDefault(); sendChat(); });
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
  }

  root.SSDNSGunRoll = rollGun;
  root.SSDNSSheet = {
    applyDelta: applyDelta,
    showNotice: showNotice,
    setConditions: setConditions,
    addLog: addLog,
    openStore: openStore,
    setStock: setStock,
    applyGunEvent: applyGunEvent,
    setDeath: setDeath,
    applyRest: applyRest,
    undoItem: undoItem,
    renderStore: renderStore,
    renderLog: renderLog,
    showTapHear: function () {
      var b = $("#btnTapHear");
      if (b) b.hidden = false;
    }
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire);
  else wire();
})(window);

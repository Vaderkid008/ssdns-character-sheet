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
    var t = $("#toastText"), box = $("#toast"), act = $("#toastAction");
    if (act) act.hidden = true;
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
      try { when = new Date(e.ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); } catch (err) {}
      var face = rollFace(e);
      return '<div class="dock-item ' + face.cls + '"><div class="dock-meta">' + when + " · " + esc(dockBucket(e)) +
        (face.tag ? ' · <span class="roll-tag">' + face.tag + "</span>" : "") +
        '</div><div>' + esc(e.text || "") + "</div></div>";
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
      try { when = new Date(e.ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); } catch (err) {}
      var face = rollFace(e);
      return '<div class="log-item log-' + (e.kind || "all") + " " + face.cls + '"><div class="log-meta">' + when + " · " + (e.kind || "") +
        (face.tag ? ' · <span class="roll-tag">' + face.tag + "</span>" : "") + '</div><div>' +
        String(e.text || "").replace(/[&<>]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]; }) +
        (e.kind === "handout" ? ' <button type="button" class="btn sm" data-reopen-handout="1">Reopen</button>' : "") +
        "</div></div>";
    }).join("");
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
    if (!storeOpen || !stock.length) {
      if (lede) lede.textContent = storeOpen ? "The store is open, but the DM has not listed any stock yet." : "The DM has not opened the store this session.";
      box.innerHTML = "";
      return;
    }
    if (lede) lede.textContent = "Session stock. Buying spends ES and writes a ledger line.";
    box.innerHTML = stock.map(function (item, i) {
      var price = num(item.price);
      return '<div class="store-row"><div><b>' + esc(item.name) + '</b><div class="fine">' + price.toLocaleString() + ' ES</div></div>' +
        '<button type="button" class="btn" data-buy="' + i + '" aria-label="Buy ' + esc(item.name) + '"' + (es < price ? " disabled title=\"Need " + price.toLocaleString() + " ES (you have " + es.toLocaleString() + ")\"" : "") + ">Buy</button>" +
        (es < price ? "<div class=\"fine\">Need " + price.toLocaleString() + " ES (you have " + es.toLocaleString() + ")</div>" : "") + "</div>";
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
    var count = 1;
    var cm = name.match(/(\d+)/);
    if (cm) count = parseInt(cm[1], 10) || 1;
    if (/cartridge/i.test(name)) {
      var tier = /heavy/i.test(name) ? "Heavy" : (/medium/i.test(name) ? "Medium" : "Light");
      d.character.ammo = d.character.ammo || [];
      var pool = null;
      d.character.ammo.forEach(function (a) {
        if (!pool && a.type === "cartridge" && String(a.caliber || "").toLowerCase() === tier.toLowerCase()) pool = a;
      });
      if (!pool) { pool = { type: "cartridge", caliber: tier, count: 0 }; d.character.ammo.push(pool); }
      pool.count = (parseInt(pool.count, 10) || 0) + count;
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
    return { nat: nat, total: nat + (mod || 0), formula: formula, detail: dice + (mod ? signMod(mod) : "") };
  }
  function rollInitiative() {
    if (root.SSDNSAudio) root.SSDNSAudio.play("holster");
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
  function castSpellAttack(i, spellName, slot, fromChamber) {
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
    var rolled = Cast.rollCast({
      spellName: spellName,
      slotLevel: slot,
      characterLevel: c && c.level,
      attackBonus: atk,
      spellMod: v.spellMod,
      dc: v.spellDC,
      weaponDamage: row && row.weapon && gunDmgEl ? gunDmgEl.value : "",
      weaponAtk: gunAtk,
      gunName: i >= 0 ? gunName(i) : "",
      wildSpark: hexslinger && slot > 0
    });
    if (root.SSDNSAudio) {
      var cue = "spellshot";
      if (c && c.calling === "pact-seeker") cue = "pactshot";
      else if (!(hexslinger || fromChamber)) cue = "spellshot";
      root.SSDNSAudio.play(cue);
    }
    toast(rolled.text);
    addLog({
      kind: "roll", text: rolled.text, label: rolled.label, formula: rolled.formula,
      attack: rolled.attack, nat: rolled.nat, crit: rolled.crit
    });
    if (joined() && root.SSDNSDmJoin && root.SSDNSDmJoin.postRoll) {
      root.SSDNSDmJoin.postRoll({
        label: rolled.label,
        formula: rolled.formula,
        result: rolled.result,
        detail: rolled.detail,
        nat1: false,
        isFirearm: !!fromChamber,
        attack: rolled.attack,
        nat: rolled.nat,
        crit: rolled.crit,
        private: whisperOn(),
        whisper: whisperOn()
      });
    }
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
  function d20() { return 1 + Math.floor(Math.random() * 20); }
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
    var mode = (modeSel && modeSel.value) || (globalAdv && globalAdv.value) || "";
    var n1 = d20(), n2 = null, nat = n1;
    if (mode === "adv" || mode === "dis") {
      n2 = d20();
      nat = mode === "adv" ? Math.max(n1, n2) : Math.min(n1, n2);
    }
    var bad = function (n) { return n >= 1 && n <= ceiling; };
    var both = n2 != null && bad(n1) && bad(n2);
    var lists = [].concat((root.SSDNS_RULES && root.SSDNS_RULES.firearms) || [], (root.SSDNS_RULES && root.SSDNS_RULES.casterGuns) || []);
    var wpn = lists.filter(function (x) { return x.id === g.weapon; })[0];
    var rugged = !!(wpn && /rugged/i.test(wpn.properties || ""));
    var name = gunName(i);
    if (root.SSDNSAudio) root.SSDNSAudio.play("attack");
    var dice = n2 == null ? String(nat) : (n1 + "/" + n2 + " → " + nat);
    var total = nat + atk;
    var bits = [name + " attack " + (atk >= 0 ? "+" : "") + atk + ": " + dice + (atk ? (atk >= 0 ? "+" : "") + atk : "") + " = " + total];
    var misfired = false;
    if (both && !rugged) {
      g.fouled = true;
      var foul = document.querySelector('[data-f="character.guns.' + i + '.fouled"]');
      if (foul) { foul.checked = true; dispatch(foul); }
      bits.push("Both dice misfire — fouled. The attack misses.");
      postGunLedger(name + " fouled (double misfire)", "foul");
      misfired = true;
    } else if (bad(nat)) {
      g.jammed = true;
      var jam = document.querySelector('[data-f="character.guns.' + i + '.jammed"]');
      if (jam) { jam.checked = true; dispatch(jam); }
      if (root.SSDNSAudio) root.SSDNSAudio.play("jam");
      bits.push("Misfire — jammed. The attack misses.");
      postGunLedger(name + " jammed (misfire)", "jam");
      misfired = true;
    }
    if (spent.left != null) bits.push(spent.left + " rounds left.");
    var dmgEl = document.querySelector('[data-calc="gunDmg.' + i + '"]');
    var dmg = null;
    if (!misfired) dmg = rollDamageExpr(dmgEl && dmgEl.value, nat === 20);
    if (dmg) bits.push((nat === 20 ? "critical " : "") + "damage " + dmg.detail + " = " + dmg.total);
    var line = bits.join(" · ");
    toast(line);
    addLog({
      kind: "roll", text: line,
      label: name + " attack",
      formula: (n2 == null ? "1d20" : "2d20") + (atk ? (atk >= 0 ? "+" : "") + atk : "") + (dmg ? " · " + dmg.formula : ""),
      attack: true, nat: nat, crit: nat === 20
    });
    var quiet = whisperOn();
    if (joined() && root.SSDNSDmJoin.postRoll) {
      root.SSDNSDmJoin.postRoll({
        label: name + (misfired ? " misfire" : " attack"),
        formula: (n2 == null ? "1d20" : "2d20") + (atk ? (atk >= 0 ? "+" : "") + atk : ""),
        result: total,
        detail: dice + (atk ? (atk >= 0 ? "+" : "") + atk : "") + (dmg ? " · dmg " + dmg.total : "") + (misfired ? " misfire" : ""),
        nat1: false,
        isFirearm: true,
        attack: true,
        nat: nat,
        crit: nat === 20,
        private: quiet,
        whisper: quiet,
        damage: dmg ? dmg.total : null
      });
    }
    if (dmg && root.SSDNSDmJoin && root.SSDNSDmJoin.postDamage && !quiet) {
      root.SSDNSDmJoin.postDamage({ amount: dmg.total, label: name, type: "weapon" });
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
    var slot = sp.slot || 0;
    if (slot > 0 && c && c.calling === "hexslinger") {
      if (!root.SSDNSApp || !root.SSDNSApp.spendHexChamber) { toast("Load that shell on the gun first."); return; }
      var held = root.SSDNSApp.spendHexChamber(i, slot);
      if (!held.ok) { toast(held.reason || "Load a level-" + slot + " shell first."); return; }
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
      var reopen = e.target.closest && e.target.closest("[data-reopen-handout]");
      if (reopen) {
        var item = reopen.closest(".log-item");
        var idx = item ? Array.prototype.indexOf.call(item.parentNode.children, item) : -1;
        var rows = log.filter(function (row) { return filter === "all" || row.kind === filter; });
        var entry = rows[idx];
        if (entry && root.SSDNSDmJoin && root.SSDNSDmJoin.showHandout) root.SSDNSDmJoin.showHandout(entry.title || "Handout", entry.url || "", entry.body || "");
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
  }

  root.SSDNSGunRoll = rollGun;
  root.SSDNSGunCastHex = castLoadedHex;
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
    showInspiration: showInspiration,
    showTapHear: function () {
      var b = $("#btnTapHear");
      if (b) b.hidden = false;
    }
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire);
  else wire();
})(window);

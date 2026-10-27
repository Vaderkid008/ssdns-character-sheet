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
  /** L0186 arrows: the shot's sfx key by arrow type (sfx.json "arrows"); a key with no file keeps the bow's cue. */
  function arrowShotCue(cue, spent) {
    var a = spent && spent.arrow;
    if (!a || !root.SSDNSAudio || !root.SSDNSAudio.arrowCue) return cue;
    return root.SSDNSAudio.arrowCue(a, cue);
  }
  function attackCue(name) {
    if (!name) return;
    if (root.SSDNSAudio) root.SSDNSAudio.play(name);
    if (whisperOn()) return;
    if (joined() && root.SSDNSDmJoin && root.SSDNSDmJoin.postSfx) root.SSDNSDmJoin.postSfx(name);
  }
  var spellCueRow = null;
  var spellCueAttack = false;
  function spellCueName() {
    var c = ch();
    var row = spellCueRow;
    if (root.SSDNSAudio && root.SSDNSAudio.spellCue) {
      return root.SSDNSAudio.spellCue({
        name: row && (row.name || row.spellName),
        kind: row && row.kind,
        attack: spellCueAttack,
        calling: c && c.calling
      });
    }
    return (c && c.calling === "pact-seeker") ? "pactshot" : "spellshot";
  }

  function setHp(current, temp, max) {
    var cur = $("#inHPCur"), tmp = $("#inHPTemp"), maxEl = $("#inHPMax");
    var sameCur = cur && String(cur.value) === String(current);
    var sameTmp = !tmp || temp == null || String(tmp.value) === String(temp);
    if (cur) cur.value = String(current);
    if (tmp && temp != null) tmp.value = String(temp);
    if (maxEl) {
      var nextMax = max != null && max !== "" ? max : maxEl.value;
      if (root.SSDNSApplied && root.SSDNSApplied.followMaxHp) nextMax = root.SSDNSApplied.followMaxHp(current, nextMax);
      if (nextMax != null && nextMax !== "") maxEl.value = String(nextMax);
      dispatch(maxEl);
    }
    if (!sameTmp) dispatch(tmp);
    if (!sameCur) dispatch(cur);
    syncDown(current);
  }
  function syncDown(hp) {
    var c = ch();
    if (!c) return;
    if (hp == null || (typeof hp === "string" && String(hp).trim() === "")) return;
    var n = Number(hp);
    if (!isFinite(n)) return;
    if (n > 0) {
      clearDowned(true);
      return;
    }
    if (root.SSDNSConditions && root.SSDNSConditions.ensureUnconscious) {
      c.activeConditions = root.SSDNSConditions.ensureUnconscious(c.activeConditions || [], n, "self");
      if (root.SSDNSConditions.listText) c.tableConditions = root.SSDNSConditions.listText(c.activeConditions);
    }
    if (typeof renderConds === "function") renderConds();
  }
  function clearDowned(force) {
    var c = ch();
    if (!c) return;
    var list = c.activeConditions || [];
    var already = list.some(function (row) {
      var name = typeof row === "string" ? row : (row && row.name);
      return name === "Unconscious";
    });
    var saves = c.deathSaves;
    var marked = saves && ((saves.success || []).some(Boolean) || (saves.fail || []).some(Boolean));
    if (!force && !already && !marked) return;
    if (root.SSDNSConditions && root.SSDNSConditions.ensureUnconscious) {
      c.activeConditions = root.SSDNSConditions.ensureUnconscious(c.activeConditions || [], 1, "self");
      c.tableConditions = root.SSDNSConditions.listText ? root.SSDNSConditions.listText(c.activeConditions) : (c.tableConditions || "");
    }
    if (!c.deathSaves) c.deathSaves = { success: [false, false, false], fail: [false, false, false] };
    c.deathSaves.success = [false, false, false];
    c.deathSaves.fail = [false, false, false];
    ["success", "fail"].forEach(function (side) {
      [0, 1, 2].forEach(function (i) {
        var box = document.querySelector('[data-f="character.deathSaves.' + side + '.' + i + '"]');
        if (box) { box.checked = false; dispatch(box); }
      });
    });
  }

  function applyDelta(delta, notice) {
    var curEl = $("#inHPCur"), tmpEl = $("#inHPTemp"), maxEl = $("#inHPMax");
    if (!curEl) return;
    var cur = num(curEl.value), temp = num(tmpEl && tmpEl.value), max = num(maxEl && maxEl.value);
    /* L0188: exhaustion 4+ halves HP max; heals stop at the halved max */
    max = effHpMax(max);
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
    } else if (cur > 0) {
      clearDowned();
    }
    renderConds();
    if (root.SSDNSConditionsUi && root.SSDNSConditionsUi.paint) root.SSDNSConditionsUi.paint();
  }

  function exhLevel() {
    var c = ch();
    var Cond = root.SSDNSConditions;
    if (!c || !Cond || !Cond.exhaustionLevel) return 0;
    var list = (c.activeConditions && c.activeConditions.length) ? c.activeConditions : String(c.tableConditions || "").split(",");
    return Cond.exhaustionLevel(list);
  }
  function effHpMax(max) {
    var Cond = root.SSDNSConditions;
    if (!Cond || !Cond.exhaustedHpMax) return max;
    var out = Cond.exhaustedHpMax(max, exhLevel());
    return out === "" || out == null ? max : num(out);
  }
  /** L0188: roll mode for checks and saves with exhaustion (1+: checks, 3+: saves). */
  function condRollMode(kind) {
    var Cond = root.SSDNSConditions;
    var c = ch();
    if (!Cond || !Cond.rollMode || !c) return "";
    var list = (c.activeConditions && c.activeConditions.length) ? c.activeConditions : String(c.tableConditions || "").split(",");
    return Cond.rollMode(list, kind, "") === "dis" ? "dis" : "";
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
    /* L0188: exhaustion math on the sheet + a toast saying what a new condition does */
    if (root.SSDNSCondFx && root.SSDNSCondFx.after) {
      try { root.SSDNSCondFx.after(c); } catch (e) { console.warn("[conditions] fx", e); }
    }
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
    entry = entry || {};
    var mine = ch();
    if (mine && !entry.characterName && !entry.playerName) {
      var spoken = String(entry.text || "");
      var character = String(mine.name || "").trim();
      var player = String(mine.player || "").trim();
      if ((character && spoken.indexOf(character) === 0) || (player && spoken.indexOf(player) === 0)) {
        entry.characterName = character;
        entry.playerName = player;
      }
    }
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
    if (entry.kind === "roll" && !entry.replace && root.SSDNSDice && root.SSDNSDice.showRoll) {
      try { root.SSDNSDice.showRoll(entry); } catch (err) {}
    }
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
  function chatPopItems() {
    var me = "";
    try { me = (root.SSDNSDmJoin && root.SSDNSDmJoin.uid && root.SSDNSDmJoin.uid()) || ""; } catch (err) {}
    return log.filter(function (e) {
      if (!e || (e.kind !== "chat" && e.kind !== "roll")) return false;
      /* Private DM lines (dockTo / to other than the whole table, and not this player) stay out of the popup. */
      var to = e.to || e.dockTo;
      if (to && to !== "all" && to !== me) return false;
      return true;
    }).map(function (e) {
      var face = rollFace(e);
      var text = String(e.text || "");
      var who = "";
      if (e.kind === "chat") {
        var cut = text.indexOf(":");
        if (cut > 0) who = text.slice(0, cut);
      }
      return { id: e.id, kind: e.kind, who: who, text: text, characterName: e.characterName || "", playerName: e.playerName || "", formula: e.formula || "", detail: e.detail || "", rolls: e.rolls || null, faces: e.faces || null, attack: !!e.attack, nat: e.nat, result: e.result, face: e.face, ts: e.ts, tag: face.tag, cls: face.cls };
    });
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
      var whoName = String(e.text || "").split(/→|:/)[0].trim();
      var tokenC = root.SSDNSApplied && root.SSDNSApplied.tokenColorFor && root.SSDNSApplied.tokenColorFor(whoName);
      var chatColor = tokenC || (e.kind === "chat" ? speakerColor(whoName) : "");
      var spoken = root.SSDNSApplied && root.SSDNSApplied.rewriteSpeaker ? root.SSDNSApplied.rewriteSpeaker(e.text || "", e) : (e.text || "");
      var body = root.SSDNSApplied && root.SSDNSApplied.leadNameHtml ? root.SSDNSApplied.leadNameHtml(spoken) : esc(spoken);
      if (root.SSDNSDice && root.SSDNSDice.lead) body = root.SSDNSDice.lead(e, body);
      return '<div class="dock-item ' + face.cls + '"' + (chatColor ? ' style="border-left:4px solid ' + chatColor + '"' : "") + handoutAttrs(e) + '><div class="dock-meta">' + when + " · " + esc(dockBucket(e)) +
        (face.tag ? ' · <span class="roll-tag">' + face.tag + "</span>" : "") +
        '</div><div>' + body + (hand ? handoutBits(e) : "") + "</div></div>";
    }).join("") || '<p class="fine">Nothing in this filter yet. Rolls, shards, and chat land here.</p>';
    if (stick) feed.scrollTop = feed.scrollHeight;
    var popped = chatPopItems();
    root.SSDNSChatDockItems = popped;
    if (root.SSDNSMapChat) root.SSDNSMapChat.publish(popped);
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
      var spoken = root.SSDNSApplied && root.SSDNSApplied.rewriteSpeaker ? root.SSDNSApplied.rewriteSpeaker(e.text || "", e) : (e.text || "");
      var body = root.SSDNSApplied && root.SSDNSApplied.leadNameHtml
        ? root.SSDNSApplied.leadNameHtml(spoken)
        : String(spoken || "").replace(/[&<>]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]; });
      if (root.SSDNSDice && root.SSDNSDice.lead) body = root.SSDNSDice.lead(e, body);
      return '<div class="log-item log-' + (e.kind || "all") + " " + face.cls + '"' + handoutAttrs(e) + '><div class="log-meta">' + when + " · " + (e.kind || "") +
        (face.tag ? ' · <span class="roll-tag">' + face.tag + "</span>" : "") + '</div><div>' +
        body +
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
      var thumb = root.SSDNSItemArt && root.SSDNSItemArt.thumbHtml ? root.SSDNSItemArt.thumbHtml(item) : "";
      return '<div class="store-row' + (sold ? " sold" : "") + '"><div>' + thumb + '<b>' + esc(item.name) + "</b>" + ref +
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
  function boughtItem(c, item, plan) {
    var I = root.SSDNSItems;
    if (!I || !I.byId || !I.add || !item || !item.id) return false;
    var row = I.byId(item.id);
    if (!row || row.type === "quest" || row.type === "weapon") return false;
    var qty = Math.max(1, parseInt(plan && plan.qty, 10) || 1);
    if (/\(\d+\b/.test(String(row.name || ""))) qty = 1; /* "(bag of 20)", "(50 ft)": the item already is the pack */
    var res = I.add(c, { catalogId: row.id, count: qty }, { dm: true });
    if (res && res.ok && root.SSDNSItems.paintSheet) root.SSDNSItems.paintSheet();
    return !!(res && res.ok);
  }
  function grantBought(item) {
    var d = doc();
    if (!d || !d.character || !item) return;
    var name = String(item.name || "Item");
    var plan = root.SSDNSStore && root.SSDNSStore.grantPlan ? root.SSDNSStore.grantPlan(item) : { kind: "gear", qty: 1 };
    if (plan.kind === "cartridge" || plan.kind === "ammo") {
      /* inv2 (0.3.108): arrows, bolts, sling stones, needles, powder & caps and shells fill their Ammo pool too */
      var ptype = plan.kind === "ammo" ? String(plan.type || "") : "cartridge";
      d.character.ammo = d.character.ammo || [];
      var pool = null;
      d.character.ammo.forEach(function (a) {
        if (!pool && a && a.type === ptype && String(a.caliber || "").toLowerCase() === String(plan.caliber || "").toLowerCase()) pool = a;
      });
      if (!pool) { pool = { type: ptype, caliber: plan.caliber || "", count: 0 }; d.character.ammo.push(pool); }
      pool.count = (parseInt(pool.count, 10) || 0) + (plan.qty || 1);
      if (plan.kind === "ammo" && root.SSDNSApp && root.SSDNSApp.applyPatch) root.SSDNSApp.applyPatch(function () {}); /* repaint Ammo + quiver */
    } else if (boughtItem(d.character, item, plan)) {
      /* 0.3.80 inventory build: a store line that matches a catalog item lands as a real item (weight, stacking) */
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
    if (window.SSDNSRenames) window.SSDNSRenames.lines(stock); /* L0165/L0184: old stock names show the PHB names */
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
    var rollId = "r_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    var who = sheetSpeaker();
    var text = (who ? who + " · " : "") + label + " · " + formula + " = " + total + " (" + detail + ")";
    toast(label + " " + total + " (" + String(detail).replace(/[«»]/g, "") + ")");
    addLog({ id: "roll:" + rollId, kind: "roll", text: text, label: label, formula: formula, result: total, detail: detail });
    if (joined() && root.SSDNSDmJoin && root.SSDNSDmJoin.postRoll) {
      root.SSDNSDmJoin.postRoll({
        id: rollId,
        label: label, formula: formula, result: total, detail: detail,
        nat1: !!nat1, isFirearm: !!firearm, private: whisperOn(), whisper: whisperOn()
      });
    }
  }
  function chatVoice() {
    try { return localStorage.getItem("ssdns.chatVoice") === "player" ? "player" : "character"; } catch (e) { return "character"; }
  }
  function sheetSpeaker() {
    var c = ch();
    if (chatVoice() === "player") return (c && (c.player || c.name)) || "You";
    var Applied = root.SSDNSApplied;
    if (Applied && Applied.speakerName) return Applied.speakerName(c && c.name, c && c.player) || "You";
    return (c && (c.name || c.player)) || "You";
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
    if (root.SSDNSAudio) root.SSDNSAudio.play("roll");
    var cm = condRollMode(kind === "save" ? "save" : "check");
    var handling = "";
    if (/animal handling/i.test(label) && root.SSDNSSupplies && root.SSDNSSupplies.handlingNote) handling = root.SSDNSSupplies.handlingNote(ch()) || "";
    if (handling && cm !== "dis") cm = "dis";
    var rolled = rollAdv(mod, cm);
    if (handling) rolled.detail += " · " + handling;
    else if (cm) rolled.detail += " · Exhaustion " + exhLevel();
    postCheck(label, rolled.formula, rolled.total, rolled.detail, rolled.nat === 1, false);
  }
  function attackReport(opts) {
    opts = opts || {};
    var who = opts.who || "You";
    var target = opts.target || "";
    var nat = Number(opts.nat) || 0;
    var atk = Number(opts.atk);
    if (!isFinite(atk)) atk = 0;
    var bonus = (atk >= 0 ? "+" : "") + atk;
    var total = nat + atk;
    var miss = !!opts.miss || !!opts.misfire;
    var ac = opts.ac;
    var haveAc = ac != null && ac !== "" && isFinite(Number(ac));
    if (haveAc && !miss && !opts.crit && total < Number(ac)) miss = true;
    var verdict = (miss || haveAc) ? (miss ? "MISS" : "HIT") : "";
    var dmg = (!miss && opts.dmg) ? (" · " + opts.dmg.formula + (opts.dmg.riderText ? " " + opts.dmg.riderText : "") + " = " + opts.dmg.total) : "";
    var face = opts.dice || String(nat);
    var weapon = opts.weapon ? (opts.weapon + (opts.caliber ? " (" + opts.caliber + ")" : "") + " · ") : "";
    var head = (target ? (who + " → " + target) : who) + ": " + weapon + face + bonus + " = " + total;
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
  function pendingBreakdown(info) {
    var Applied = root.SSDNSApplied;
    if (!Applied || !Applied.attackBreakdown) return "";
    var parts = info.parts;
    if ((!parts || !parts.length) && info.nat != null && info.hitTotal != null && isFinite(Number(info.hitTotal))) {
      parts = [{ label: "bonus", value: Number(info.hitTotal) - (Number(info.nat) || 0) }];
    }
    var hasDmg = (info.dice && String(info.dice).trim()) || (info.dmgFaces && info.dmgFaces.length) || (isFinite(Number(info.damage)) && Number(info.damage) > 0);
    var card = Applied.attackBreakdown({
      who: info.who,
      target: info.targetName,
      weapon: info.weapon || "",
      spell: info.spellName || "",
      nat: info.nat,
      n1: info.n1 != null ? info.n1 : info.nat,
      n2: info.n2,
      parts: parts,
      total: info.hitTotal,
      revealAc: false,
      hideVerdict: true,
      damage: hasDmg ? {
        faces: info.dmgFaces || null,
        formula: info.dmgFormula || "",
        parts: info.dmgParts || null,
        total: info.damage,
        type: info.dmgType || "",
        dice: info.dice || ""
      } : null
    });
    return (card && (card.publicText || card.text)) || "";
  }
  function sendPendingAttack(info) {
    info = info || {};
    var line = pendingBreakdown(info) || waitingText(info.who, info.targetName);
    if (info.tail) {
      if (/\bd20\b/.test(line) && line.indexOf(info.tail) < 0) {
        line = line.replace(/([^\n]*\bd20\b[^\n]*)/, function (row) { return row + " · " + info.tail; });
      } else if (line.indexOf(info.tail) < 0) {
        line += ((/\n/.test(line) ? "\n" : " · ") + info.tail);
      }
    }
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
        spellName: info.spellName || "",
        private: !!info.quiet,
      whisper: !!info.quiet
    });
    if (!info.quiet && root.SSDNSDmJoin.postAttack) {
      var tgtCover = currentTarget();
      var coverRaw = info.cover != null ? info.cover : (tgtCover && tgtCover.id === info.targetId ? (tgtCover.cover || "") : "");
      root.SSDNSDmJoin.postAttack({
        rollId: info.rollId,
        targetId: info.targetId,
        targetName: info.targetName,
        amount: Number(info.damage) || 0,
        hitTotal: info.hitTotal,
        nat: info.nat,
        n1: info.n1,
        n2: info.n2,
        parts: info.parts || null,
        dmgFaces: info.dmgFaces || null,
        dmgFormula: info.dmgFormula || "",
        dmgParts: info.dmgParts || null,
        dmgType: info.dmgType || "",
        crit: Number(info.nat) >= (Number(info.critMin) || 20),
        critMin: Number(info.critMin) || 20,
        nat1: Number(info.nat) === 1,
        label: info.label || "",
        weapon: info.weapon || "",
        weaponId: info.weaponId || "",
        gun: !!info.gun,
        spell: !!info.spell,
        cover: coverRaw || "",
        coverSet: true,
        type: "attack",
        dice: info.dice || "",
        formula: info.formula || "",
        sfx: info.sfx || "attack",
        shots: info.shots || null,
        arrow: info.arrow || "" /* attack-fx: the map draws the arrow type (Whistler trail) */
      });
    }
    return line;
  }
  /* 0.3.67: 'Free shot' in the target picker: the gun fires with no target. */
  var FREE_SHOT = "__free";
  function freeShotChosen() {
    var sel = document.querySelector("#atkTarget");
    return !!(sel && sel.value === FREE_SHOT);
  }
  function currentTarget() {
    if (pendingBlind) return null;
    if (root.SSDNSPlaytest && root.SSDNSPlaytest.targetInfo) return root.SSDNSPlaytest.targetInfo();
    var sel = document.querySelector("#atkTarget");
    if (!sel || !sel.value || sel.value === FREE_SHOT) return null;
    var opt = sel.selectedOptions && sel.selectedOptions[0];
    var coverRaw = opt && opt.getAttribute("data-cover");
    return { id: sel.value, name: (opt && (opt.getAttribute("data-name") || opt.textContent)) || "", ac: null, cover: coverRaw || "" };
  }
  /* 0.3.68: DM "Force ADV" range override turns the roll into advantage (or cancels a DIS pick) */
  function rangeMode(chosen, verdict) {
    var R = root.SSDNSRangeRings;
    return R && R.modeWith ? R.modeWith(chosen, verdict) : (chosen || "");
  }
  function mountAttackExtra(extraDis) {
    var note = root.SSDNSSupplies && root.SSDNSSupplies.mountedAttackNote ? (root.SSDNSSupplies.mountedAttackNote(ch()) || "") : "";
    if (!note) return extraDis || "";
    return extraDis ? (extraDis + " · " + note) : note;
  }
  function attackRoll(mod, conditions, chosen, extraDis) {
    extraDis = mountAttackExtra(extraDis);
    var mode = root.SSDNSConditions && root.SSDNSConditions.attackMode
      ? root.SSDNSConditions.attackMode(conditions || [], chosen || "", extraDis)
      : ((chosen === "adv" || chosen === "dis") ? chosen : (extraDis ? "dis" : ""));
    if (!root.SSDNSConditions && chosen === "adv" && extraDis) mode = "";
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
    if (mode === "dis" && extraDis) notes.push(typeof extraDis === "string" ? extraDis : "disadvantage: range");
    return {
      nat: nat,
      n1: n1,
      n2: n2,
      mode: mode,
      shown: n2 == null ? String(nat) : advRunText([n1, n2], nat),
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
  function coverOptsFor(kind, extra) {
    extra = extra || {};
    var feats = (ch() && ch().feats) || [];
    var ranged = kind === "gun" || kind === "ranged" || (kind === "spell" && extra.ranged !== false);
    if (kind === "melee") ranged = false;
    return {
      ranged: !!ranged,
      spell: kind === "spell",
      sharpshooter: feats.indexOf("sharpshooter") >= 0,
      spellSniper: feats.indexOf("long-range-hex") >= 0,
      noCover: !!extra.noCover
    };
  }
  function coverFor(tgt, opts) {
    var Applied = root.SSDNSApplied;
    if (!Applied || !Applied.coverAdjust) {
      var ac = tgt && tgt.ac;
      var have = ac != null && ac !== "" && isFinite(Number(ac));
      return { ac: have ? Number(ac) : null, have: have, blocked: false, note: "", key: "", title: "", bonus: 0 };
    }
    return Applied.coverAdjust(tgt && tgt.ac, tgt && tgt.cover, opts || {});
  }
  function attackGate(tgt, opts) {
    opts = opts || {};
    if (opts.heal || opts.death) return "";
    if (opts.area) {
      if (downed()) return "You're at 0 HP. Death saves only.";
      return "";
    }
    if (downed()) return "You're at 0 HP. Death saves only.";
    if (tgt && tgt.cover && root.SSDNSApplied && root.SSDNSApplied.coverAdjust && root.SSDNSApplied.coverAdjust(null, tgt.cover, {}).blocked) {
      return "Total cover. You can't target " + (tgt.name || "them") + ".";
    }
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
  function advRunText(faces, kept) {
    if (root.SSDNSDice && root.SSDNSDice.advRun) return root.SSDNSDice.advRun(faces, kept);
    var marked = false;
    return "d20 " + faces.map(function (n) { if (!marked && n === kept) { marked = true; return "«" + n + "»"; } return String(n); }).join(" / ");
  }
  function modeWord(mode) {
    if (mode === "dis") return " · disadvantage";
    if (mode === "adv") return " · advantage";
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
  function rollAdv(mod, condMode) {
    var globalAdv = document.querySelector("#globalAdv");
    var mode = (globalAdv && globalAdv.value) || "";
    /* L0188: a condition's disadvantage (exhaustion) cancels a chosen advantage, like attacks do */
    if (condMode === "dis") mode = mode === "adv" ? "" : "dis";
    var n1 = 1 + Math.floor(Math.random() * 20);
    var n2 = null;
    var nat = n1;
    if (mode === "adv" || mode === "dis") {
      n2 = 1 + Math.floor(Math.random() * 20);
      nat = mode === "adv" ? Math.max(n1, n2) : Math.min(n1, n2);
    }
    var formula = (n2 == null ? "1d20" : "2d20") + (mod ? signMod(mod) : "");
    /* 0.3.63: "d20 5 / «14»" like the attack card, so chat shows both dice with the kept one ringed */
    var dice = n2 == null ? String(nat) : advRunText([n1, n2], nat);
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
    if (root.SSDNSAudio) root.SSDNSAudio.play("roll");
    var im = condRollMode("check");
    var rolled = rollAdv(bonus || 0, im);
    if (im) rolled.detail += " · Exhaustion " + exhLevel();
    /* 0.3.69: a new combat: the rig's first-shot bonus is ready again */
    if (ch() && ch().firstShotSpent) { ch().firstShotSpent = false; if (root.SSDNSApp && root.SSDNSApp.refreshGunFace) root.SSDNSApp.refreshGunFace(); }
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
  var castRefund = null;
  function armCastRefund(fn) { castRefund = fn; }
  function commitCast() {
    castRefund = null;
    castSpellAttackNow._reactGo = false;
    castSpellAttackNow._paid = false;
  }
  function abortCast(msg) {
    castSpellAttackNow._reactGo = false;
    castSpellAttackNow._paid = false;
    castSpellAttackNow._blasted = null;
    var fn = castRefund;
    castRefund = null;
    if (fn) { try { fn(); } catch (err) {} }
    if (msg) toast(msg);
  }
  function spellAreaFor(spellName, row) {
    var Area = root.SSDNSSpellArea;
    if (!Area || !Area.areaOf || !row) return null;
    var kind = row.kind || "none";
    if (kind === "attack" || kind === "weapon") return null;
    if (kind === "auto" && row.rays) return null;
    return Area.areaOf(spellName);
  }
  function blastTargetId(tok) {
    var Area = root.SSDNSSpellArea;
    if (Area && Area.strikeTargetId) return Area.strikeTargetId(tok, []) || "";
    return (tok && (tok.combatantId || tok.ownerUid || tok.id)) || "";
  }
  function feetTo(targetId) {
    var host = root.SSDNSMapHost;
    if (!host || typeof host.feetBetween !== "function" || !targetId) return null;
    var uid = root.SSDNSDmJoin && root.SSDNSDmJoin.uid && root.SSDNSDmJoin.uid();
    var mine = "";
    try { mine = host.tokenForPlayer && uid ? host.tokenForPlayer(uid) : ""; } catch (e) { mine = ""; }
    var a = (mine && mine.id) || mine || uid || "";
    if (!a) return null;
    try { return host.feetBetween(a, targetId); } catch (e2) { return null; }
  }
  function spellRangeText(spellName, row) {
    var Cast = root.SSDNSSpellCast;
    return (row && row.range) || (Cast && Cast.rangeOf && Cast.rangeOf(spellName)) || "";
  }
  function spellReachMessage(spellName, row) {
    var Area = root.SSDNSSpellArea;
    if (!Area || !Area.rangeBlock) return "";
    var range = spellRangeText(spellName, row);
    var kind = (row && row.kind) || "";
    var allow = kind === "heal" || kind === "none" || kind === "utility" || kind === "rider";
    var picks = pendingDarts && pendingDarts.length ? pendingDarts : [currentTarget()];
    var msg = "";
    picks.forEach(function (p) {
      if (msg) return;
      if (!p || !p.id) {
        if (/touch/i.test(range) && !allow) msg = Area.touchBlock(null, range, { allowUnmeasured: false });
        return;
      }
      msg = Area.rangeBlock(feetTo(p.id), range, { allowUnmeasured: allow });
    });
    return msg;
  }
  function applySpellBuff(spellName) {
    var Area = root.SSDNSSpellArea;
    var buff = Area && Area.buffOf ? Area.buffOf(spellName) : null;
    var c = ch();
    if (!buff || !c) {
      var fx = null;
      var book = root.SSDNS_SPELL_FX || {};
      var key = String(spellName || "").toLowerCase();
      if (book[key]) fx = book[key];
      return (fx && fx.does) || "";
    }
    var note = buff.label || "";
    if (buff.ac || buff.acFloor || buff.mageArmor) {
      c.buffs = (Array.isArray(c.buffs) ? c.buffs : []).filter(function (b) {
        return b && b.id !== "spell:" + keyOf(spellName);
      });
      c.buffs.push({
        id: "spell:" + keyOf(spellName),
        name: spellName,
        ac: buff.ac || 0,
        acFloor: buff.acFloor || 0,
        mageArmor: !!buff.mageArmor,
        until: buff.ms ? Date.now() + buff.ms : 0
      });
      if (root.SSDNSApp && root.SSDNSApp.applyPatch) root.SSDNSApp.applyPatch(function () {});
    }
    if (buff.temp && Area.rollFormula) {
      var temp = Area.rollFormula(buff.temp);
      c.hpTemp = Math.max(Number(c.hpTemp) || 0, temp);
      note += " (" + temp + " temporary)";
      var tmp = document.querySelector('[data-f="character.hpTemp"]');
      if (tmp) tmp.value = String(c.hpTemp);
      if (root.SSDNSApp && root.SSDNSApp.applyPatch) root.SSDNSApp.applyPatch(function () {});
    }
    if (buff.tempFromMod) {
      var vv = root.SSDNSApp && root.SSDNSApp.compute ? root.SSDNSApp.compute() : {};
      var modN = Math.max(0, Number(vv.spellMod) || 0);
      c.hpTemp = Math.max(Number(c.hpTemp) || 0, modN);
      note += " (" + modN + " temporary)";
    }
    if (buff.maxHp) {
      var maxN = Number(c.hpMax);
      var curN = Number(c.hpCurrent);
      if (isFinite(maxN)) c.hpMax = maxN + buff.maxHp;
      if (isFinite(curN)) c.hpCurrent = curN + (buff.heal || buff.maxHp);
      if (root.SSDNSApp && root.SSDNSApp.applyPatch) root.SSDNSApp.applyPatch(function () {});
    } else if (buff.heal) {
      applyDelta(buff.heal, note || spellName);
    }
    return note;
  }
  function keyOf(spellName) {
    return String(spellName || "").toLowerCase();
  }
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
    if (!op || !op.value || op.value === FREE_SHOT) return null;
    var acRaw = op.getAttribute("data-ac");
    var ac = acRaw == null || acRaw === "" ? null : Number(acRaw);
    return {
      id: op.value,
      name: op.getAttribute("data-name") || op.textContent || "",
      ac: isFinite(ac) ? ac : null,
      kind: op.getAttribute("data-kind") || "",
      cover: op.getAttribute("data-cover") || ""
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
        if (!op.value || op.value === FREE_SHOT) return;
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
    /* 0.3.100: the Borrowed Iron card's quick spell buttons share the Pact Shot button's target picker */
    document.querySelectorAll("[data-spell-cast], [data-cast]").forEach(function (btn) { if (!btn.classList.contains("iron-spell")) mountCastTarget(btn); });
  }
  function sourceSelect() {
    var btn = castSource;
    if (btn && btn.previousElementSibling && btn.previousElementSibling.classList && btn.previousElementSibling.classList.contains("cast-target")) {
      return btn.previousElementSibling;
    }
    return null;
  }
  function targetMeta(opt) {
    if (!opt || !opt.value || opt.value === FREE_SHOT) return null;
    var hp = opt.getAttribute("data-hp");
    return {
      id: opt.value,
      name: opt.getAttribute("data-name") || opt.textContent || "",
      kind: opt.getAttribute("data-kind") || "",
      status: opt.getAttribute("data-status") || "",
      side: opt.getAttribute("data-side") || "",
      hp: hp == null || hp === "" ? "" : hp,
      fled: opt.getAttribute("data-fled") === "1",
      conditions: String(opt.getAttribute("data-conds") || "").split(",").filter(Boolean)
    };
  }
  function listedTargets() {
    var main = document.querySelector("#atkTarget");
    if (!main) return [];
    return Array.prototype.map.call(main.options, targetMeta).filter(Boolean);
  }
  function targetUnusable(row) {
    var Applied = root.SSDNSApplied;
    if (Applied && Applied.isUnusableTarget) return Applied.isUnusableTarget(row);
    return !row;
  }
  function chosenTargetValue() {
    var sel = sourceSelect();
    var value = sel ? (sel.value || "") : ((document.querySelector("#atkTarget") || {}).value || "");
    if (!value) return "";
    var row = listedTargets().filter(function (r) { return r.id === value; })[0];
    if (row && targetUnusable(row)) return "";
    return value;
  }
  function ensureAttackTarget() {
    var rows = listedTargets();
    if (!rows.length) return Promise.resolve(true);
    var current = chosenTargetValue();
    var currentRow = current && rows.filter(function (r) { return r.id === current; })[0];
    if (currentRow && !targetUnusable(currentRow)) return Promise.resolve(true);
    return askAttackTarget(rows);
  }
  function askAttackTarget(rows) {
    var Applied = root.SSDNSApplied;
    var living = (rows || []).filter(function (row) { return !targetUnusable(row); });
    var hostiles = living.filter(function (row) {
      return Applied && Applied.isLivingHostile ? Applied.isLivingHostile(row) : row.kind !== "player";
    });
    return new Promise(function (resolve) {
      var dlg = document.createElement("dialog");
      dlg.className = "dlg";
      dlg.innerHTML = "<form method='dialog'><h2>Pick a target</h2><p class='fine'></p><label>Target <select id='attackPick'></select></label><div class='dlg-foot'><button class='btn' type='button' value='no'>Cancel</button><button class='btn btn-primary' type='submit' value='yes'>Attack</button></div></form>";
      dlg.querySelector("p").textContent = hostiles.length ? "Choose who this attack hits." : "No living hostile target. Cancel, or pick someone still standing.";
      var sel = dlg.querySelector("#attackPick");
      var blank = document.createElement("option");
      blank.value = "";
      blank.textContent = living.length ? "Pick a target" : "No living target";
      sel.appendChild(blank);
      var preferred = hostiles[0] || null;
      living.forEach(function (row) {
        var opt = document.createElement("option");
        opt.value = row.id;
        opt.textContent = row.name || row.id;
        sel.appendChild(opt);
      });
      if (preferred) sel.value = preferred.id;
      else sel.value = "";
      var attackBtn = dlg.querySelector("[value=yes]");
      if (!living.length && attackBtn) attackBtn.hidden = true;
      var done = false;
      function finish(choice) {
        if (done) return;
        done = true;
        if (dlg.close) dlg.close();
        if (dlg.parentNode) dlg.parentNode.removeChild(dlg);
        resolve(choice);
      }
      dlg.querySelector("[value=no]").addEventListener("click", function () { finish(false); });
      dlg.querySelector("form").addEventListener("submit", function (e) {
        e.preventDefault();
        var id = sel.value || "";
        if (!id) { toast("Pick a target"); return; }
        var main = document.querySelector("#atkTarget");
        if (main) main.value = id;
        finish(true);
      });
      dlg.addEventListener("cancel", function (e) { e.preventDefault(); finish(false); });
      document.body.appendChild(dlg);
      try { if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", ""); }
      catch (err) { dlg.setAttribute("open", ""); }
    });
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
        if (!op.value || op.value === FREE_SHOT) return;
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
  /* L0197: a Pact Seeker casts only with the Borrowed Iron in hand; a Hexslinger only through an equipped Caster Gun */
  function focusBlocked() { return !!(root.SSDNSFocus && root.SSDNSFocus.gate && root.SSDNSFocus.gate()); }
  function castSpellAttack(i, spellName, slot, fromChamber) {
    if (focusBlocked()) { abortCast(); return; }
    var spellKind = root.SSDNSActionPips && root.SSDNSActionPips.spellCost && root.SSDNSActionPips.spellCost(spellName) === "reaction" ? "reaction" : "action";
    if (root.SSDNSTurnLock && root.SSDNSTurnLock.offTurnBlock && root.SSDNSTurnLock.offTurnBlock(spellKind)) { abortCast(); return; }
    /* A spent Reaction does not roll. Action and bonus spells still warn and roll from the sheet. */
    if (root.SSDNSActionPips && root.SSDNSActionPips.spellCost && root.SSDNSActionPips.blockMap && root.SSDNSActionPips.spellCost(spellName) === "reaction") {
      if (root.SSDNSActionPips.blockMap("reaction", "Casting " + (spellName || "a spell"))) { abortCast(); return; }
    }
    /* Pallbearer Load is a Dexterity save, not a spell attack. The iron still has to be in hand. */
    if (root.SSDNSPactShot && root.SSDNSPactShot.isPactShot(spellName)) {
      var coneShot = root.SSDNSPactShot.variant(ch());
      if (coneShot && coneShot.cone) { commitCast(); root.SSDNSPactShot.rollCone(ch()); return; }
    }
    var Cast = root.SSDNSSpellCast;
    var looked = Cast && Cast.lookup && Cast.lookup(spellName);
    var areaPick = spellAreaFor(spellName, looked);
    var start = castChoice ? Promise.resolve(castChoice) : (areaPick ? Promise.resolve({ skip: true }) : chooseCastTarget(spellName, looked, slot));
    castChoice = null;
    start.then(function (choice) {
      if (!choice) { abortCast(); return; }
      if (!choice.skip) applyCastChoice(choice);
      var blocked = attackGate(pendingBlind ? null : currentTarget(), { heal: looked && looked.kind === "heal", area: !!areaPick });
      if (blocked) { toast(blocked); addLog({ kind: "alert", text: blocked }); pendingDarts = null; pendingBlind = false; abortCast(); return; }
      if (Cast && Cast.needsType && Cast.needsType(spellName)) {
        Cast.pickType(spellName).then(function (type) {
          if (!type) { pendingDarts = null; pendingBlind = false; abortCast(); return; }
          castSpellAttackNow(i, spellName, slot, fromChamber, type);
        });
        return;
      }
      castSpellAttackNow(i, spellName, slot, fromChamber, "");
    });
  }
  function castSpellAttackNow(i, spellName, slot, fromChamber, damageType) {
    if (!castSpellAttackNow._reactGo && !(root.SSDNSReact && root.SSDNSReact.castingReaction) && root.SSDNSReact && root.SSDNSReact.gateSpell) {
      var held = root.SSDNSReact.gateSpell({
        spellName: spellName,
        casterName: (ch() && ch().name) || "",
        casterId: (root.SSDNSDmJoin && root.SSDNSDmJoin.uid && root.SSDNSDmJoin.uid()) || ""
      }, function () {
        /* Stay set through the map click. Clearing it here made the confirm re-enter the gate and drop the blast. */
        castSpellAttackNow._reactGo = true;
        castSpellAttackNow(i, spellName, slot, fromChamber, damageType);
      });
      if (held) return;
    }
    var v = root.SSDNSApp && root.SSDNSApp.compute ? root.SSDNSApp.compute() : {};
    var c = ch();
    var Cast = root.SSDNSSpellCast;
    if (!Cast || !Cast.rollCast) { abortCast("Spell roller isn't loaded."); return; }
    if ((v.spellAtk == null || v.spellAtk === "") && (v.spellDC == null || v.spellDC === "")) {
      abortCast("This Calling has no spell attack.");
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
    /* L0223: a Scholar without the Chemical Field Ledger still casts. Prepared spell attacks take disadvantage. */
    var ledger = root.SSDNSFocus && root.SSDNSFocus.ledgerCast ? root.SSDNSFocus.ledgerCast(c, spellName, row, slot) : null;
    var ledgerAtk = ledger && ledger.attackDis ? (ledger.attackNote || "Lost Ledger: disadvantage") : "";
    function withLedger(extra) {
      if (!ledgerAtk) return extra || "";
      return extra ? (extra + " · " + ledgerAtk) : ledgerAtk;
    }
    var rollId = "r_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    var throughGun = !!((hexslinger && fromChamber) || (row && row.weapon));
    var conds = (c && c.activeConditions) || [];
    var chosenMode = (document.querySelector("#globalAdv") && document.querySelector("#globalAdv").value) || "";
    if (!castSpellAttackNow._ready && !spellAreaFor(spellName, row)) {
      var rings0 = root.SSDNSRangeRings;
      var host0 = root.SSDNSMapHost;
      var tgt0 = currentTarget();
      if (host0 && typeof host0.armAttack === "function" && !(rings0 && freshVerdict(rings0, tgt0))) {
        host0.armAttack({ id: "spell:" + (spellName || ""), name: spellName || "", spell: true, kind: "spell", spellKind: (row && row.kind) || "attack" }, tgt0 && tgt0.id);
      }
      var peekedSpell = rings0 && rings0.peek ? rings0.peek() : null;
      if (peekedSpell && peekedSpell.apply && peekedSpell.blocked) {
        if (rings0.take) rings0.take();
        addLog({ kind: "alert", text: (spellName || "Spell") + ": " + (peekedSpell.button || "out of range") });
        abortCast(peekedSpell.button || "out of range");
        return;
      }
      var peekNote = peekedSpell && peekedSpell.apply && peekedSpell.disadvantage ? (peekedSpell.note || "disadvantage: range") : "";
      if (attackWouldDis(conds, rangeMode(chosenMode, peekedSpell), withLedger(peekNote))) {
        confirmIfDis(true).then(function (ok) {
          if (!ok) { if (rings0 && rings0.clear) rings0.clear(); abortCast("Cast cancelled."); return; }
          castSpellAttackNow._ready = true;
          try { castSpellAttackNow(i, spellName, slot, fromChamber, damageType); }
          finally { castSpellAttackNow._ready = false; }
        });
        return;
      }
    }
    var areaEarly = spellAreaFor(spellName, row);
    var rangeShot = null;
    if (areaEarly) {
      if (root.SSDNSRangeRings && root.SSDNSRangeRings.clear) root.SSDNSRangeRings.clear();
    } else {
      rangeShot = root.SSDNSRangeRings && root.SSDNSRangeRings.take ? root.SSDNSRangeRings.take() : null;
      if (rangeShot && rangeShot.apply && rangeShot.blocked) {
        addLog({ kind: "alert", text: (spellName || "Spell") + ": " + (rangeShot.button || "out of range") });
        abortCast(rangeShot.button || "out of range");
        return;
      }
    }
    var areaNow = areaEarly;
    if (areaNow && !castSpellAttackNow._blasted) {
      var hostB = root.SSDNSMapHost;
      if (!hostB || typeof hostB.placeBlast !== "function") {
        abortCast("Open the map to place " + (spellName || "that spell") + ".");
        return;
      }
      var uidB = root.SSDNSDmJoin && root.SSDNSDmJoin.uid && root.SSDNSDmJoin.uid();
      var tokB = hostB.tokenForPlayer && uidB ? (hostB.tokenForPlayer(uidB) || "") : "";
      hostB.placeBlast({ name: spellName, area: areaNow, casterId: tokB || uidB || "" }).then(function (placed) {
        if (!placed) { abortCast("Cast cancelled."); return; }
        castSpellAttackNow._blasted = placed;
        try { castSpellAttackNow(i, spellName, slot, fromChamber, damageType); }
        finally { castSpellAttackNow._blasted = null; }
      });
      return;
    }
    var placedBlast = castSpellAttackNow._blasted || null;
    if (!areaNow) {
      var reachMsg = spellReachMessage(spellName, row);
      if (reachMsg) {
        addLog({ kind: "alert", text: (spellName || "Spell") + ": " + reachMsg });
        abortCast(reachMsg);
        return;
      }
    }
    if (!spendForCast(i, slot, fromChamber)) { abortCast(); return; }
    var rangeNote = rangeShot && rangeShot.apply && rangeShot.disadvantage ? (rangeShot.note || "disadvantage: range") : "";
    chosenMode = rangeMode(chosenMode, rangeShot);
    var atkMode = root.SSDNSConditions && root.SSDNSConditions.attackMode
      ? root.SSDNSConditions.attackMode(conds, chosenMode, mountAttackExtra(withLedger(rangeNote)))
      : (chosenMode === "adv" && withLedger(rangeNote) ? "" : (mountAttackExtra(withLedger(rangeNote)) ? "dis" : chosenMode));
    var ledgerBits = [];
    if (ledger && ledger.attackDis && atkMode === "dis") ledgerBits.push(ledger.attackNote || "Lost Ledger: disadvantage");
    if (ledger && ledger.saveAdv) ledgerBits.push(ledger.saveNote || "Lost Ledger: advantage on the save");
    var ledgerTail = ledgerBits.join(" · ");
    var rolled;
    try {
      rolled = Cast.rollCast({
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
    } catch (err) {
      abortCast("That spell didn't resolve.");
      return;
    }
    var tgt = currentTarget();
    if (tgt) rememberEnemy(tgt);
    var spellTouch = /touch/i.test(spellRangeText(spellName, row));
    var spellCover = coverFor(tgt, coverOptsFor("spell", { ranged: !spellTouch, noCover: /sacred flame/i.test(spellName || "") }));
    var acForRoll = null;
    var hiddenSpell = rolled.attack && acHidden(tgt) && joined() && !whisperOn();
    spellCueRow = row;
    spellCueAttack = !!rolled.attack;
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
        n1: rolled.n1,
        n2: rolled.n2,
        tail: ledgerTail,
        weapon: throughGun && i >= 0 ? gunName(i) : "",
        spellName: spellName || "",
        sfx: spellCueName(),
        shots: rolled.shots || null,
        spell: true,
        quiet: false
      });
      /* Hidden AC returns before the resolved cast. Spend here or the pip never reaches turnMarkers. */
      if (root.SSDNSActionPips && root.SSDNSActionPips.spell) root.SSDNSActionPips.spell(spellName);
      consumeRollMode();
      pendingDarts = null;
      pendingBlind = false;
      commitCast();
      return;
    }
    if (rolled.attack && rolled.multi && tgt && tgt.name) {
      rolled.text += " → " + tgt.name;
      rolled.detail = rolled.text;
    } else if (rolled.attack && tgt && tgt.name && rolled.nat != null) {
      var spellParts = [];
      if (v.spellMod != null && isFinite(Number(v.spellMod))) spellParts.push({ label: "spellcasting", value: Number(v.spellMod) });
      if (isFinite(Number(v.prof))) spellParts.push({ label: "proficiency", value: Number(v.prof) || 0 });
      if (!spellParts.length) spellParts.push({ label: "spell attack", value: atk });
      var dmgTail = String(rolled.text || "").match(/on hit (.+)$/);
        var spellCard = root.SSDNSApplied && root.SSDNSApplied.attackBreakdown
        ? root.SSDNSApplied.attackBreakdown({
          who: (c && c.name) || "You",
          target: tgt.name,
          spell: spellName || "",
          weapon: throughGun && i >= 0 ? gunName(i) : "",
          nat: rolled.nat,
          n1: rolled.n1,
          n2: rolled.n2,
          parts: spellParts,
          total: Number(rolled.nat) + atk,
          ac: spellCover.have ? spellCover.ac : tgt.ac,
          revealAc: !acHidden(tgt),
          coverNote: spellCover.note,
          miss: rolled.nat === 1,
          damage: dmgTail ? { dice: dmgTail[1], total: (String(dmgTail[1]).match(/=\s*(\d+)/) || [])[1] || "", type: damageType || "" } : null
        })
        : null;
      rolled.text = spellCard ? spellCard.text : attackReport({
        who: (c && c.name) || "You", target: tgt.name, nat: rolled.nat, atk: atk, ac: spellCover.have ? spellCover.ac : tgt.ac, miss: rolled.nat === 1, dice: rolled.diceShown || ""
      }).player;
      if (rangeNote && spellCard) rolled.text += "\n" + rangeNote;
      rolled.detail = rolled.text;
      acForRoll = spellCover.have ? spellCover.ac : null;
      if (root.SSDNSAudio && root.SSDNSAudio.playOutcome) {
        var spellMiss = rolled.nat === 1 || (acForRoll != null && (Number(rolled.nat) + atk) < acForRoll);
        root.SSDNSAudio.playOutcome({ spell: true, name: spellName, kind: "spell", nat: Number(rolled.nat) }, spellMiss ? "miss" : (Number(rolled.nat) === 20 ? "crit" : "hit"));
      }
    } else if (row && row.kind === "auto" && rolled.darts && pendingDarts && pendingDarts.length) {
      var dartNotes = [];
      rolled.darts.forEach(function (d, idx) {
        var pick = pendingDarts[idx] || {};
        dartNotes.push("dart " + d.n + " → " + (pick.name || "narrative"));
      });
      rolled.text += " · " + dartNotes.join("; ");
      rolled.detail = rolled.text;
      rolled.autoDarts = true;
    } else if (row && row.kind === "heal" && !placedBlast) {
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
    if (ledger && root.SSDNSFocus && root.SSDNSFocus.applyLedgerNotes) root.SSDNSFocus.applyLedgerNotes(rolled, ledger, atkMode);
    if (placedBlast) {
      var crowd0 = placedBlast.tokens || [];
      var where0 = crowd0.length ? crowd0.map(function (t) { return t.name || "token"; }).join(", ") : "nobody in the area";
      rolled.text += " · " + ((placedBlast.area && placedBlast.area.label) || "area") + ": " + where0;
      rolled.detail = rolled.text;
    } else if (row && (row.kind === "none" || row.kind === "rider" || row.kind === "utility")) {
      var buffLine = applySpellBuff(spellName);
      if (buffLine) {
        rolled.text += " · " + buffLine;
        rolled.detail = rolled.text;
      }
    }
    if (root.SSDNSActionPips && root.SSDNSActionPips.spell) root.SSDNSActionPips.spell(spellName);
    toast(rolled.text);
    var spellDmg = null;
    if (rolled.attack) {
      if (rolled.multi || (rolled.shots && rolled.shots.length)) spellDmg = Number(rolled.damageTotal) || 0;
      else {
        var atkTotal = Number(rolled.nat) + atk;
        var missed = rolled.nat === 1 || (acForRoll != null && atkTotal < acForRoll);
        if (!missed && rolled.nat != null) {
          spellDmg = Number(rolled.damageTotal);
          if (!isFinite(spellDmg)) spellDmg = 0;
        }
      }
    }
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
        weapon: throughGun && i >= 0 ? gunName(i) : "",
        /* attack-fx: spell line on the map when the sheet resolved the attack itself */
        fxReq: (rolled.attack && !rolled.multi && tgt && tgt.id && !blankTarget(tgt) && rolled.nat != null) ? {
          type: "spell", target: tgt.id, weapon: spellName || "", sfx: spellCueName(), nat: rolled.nat,
          result: (rolled.nat === 1 || (acForRoll != null && (Number(rolled.nat) + atk) < acForRoll)) ? "miss" : (Number(rolled.nat) === 20 ? "crit" : "hit"),
          crit: Number(rolled.nat) === 20
        } : null
      });
      if (placedBlast && !whisperOn() && root.SSDNSDmJoin.postDamage) {
        var AreaP = root.SSDNSSpellArea;
        var crowd = placedBlast.tokens || [];
        var full = Number(rolled.damageTotal != null ? rolled.damageTotal : rolled.result) || 0;
        var kindNow = (row && row.kind) || rolled.kind || "";
        var condP = AreaP && AreaP.onFail ? AreaP.onFail(spellName) : "";
        if (kindNow === "heal" || kindNow === "save" || kindNow === "auto") {
          crowd.forEach(function (t, idx) {
            if (kindNow === "heal" && !(full > 0)) return;
            if (kindNow !== "heal" && !(full > 0 || condP)) return;
            var hitRow = {
              amount: full,
              label: spellName,
              type: kindNow === "heal" ? "heal" : "spell",
              dice: rolled.damageDetail || "",
              targetId: blastTargetId(t),
              targetName: t.name || "",
              rollId: rollId + "_" + idx,
              weapon: throughGun && i >= 0 ? gunName(i) : ""
            };
            if (kindNow === "save") {
              hitRow.save = (row && row.save) || rolled.save || "DEX";
              hitRow.dc = v.spellDC;
              hitRow.half = !!(row && row.half);
              if (condP) hitRow.condition = condP;
            }
            if (hitRow.targetId) root.SSDNSDmJoin.postDamage(hitRow);
          });
        }
      } else if (rolled.heal && rolled.selfHeal) {
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
      } else if (rolled.autoDarts && pendingDarts && root.SSDNSSpellArea && root.SSDNSSpellArea.assignDarts) {
        root.SSDNSSpellArea.assignDarts(rolled.darts, pendingDarts).forEach(function (g) {
          if (!(g.total > 0) || !g.id) return;
          if (!whisperOn() && root.SSDNSDmJoin.postDamage) {
            root.SSDNSDmJoin.postDamage({
              amount: g.total, label: spellName, type: "spell",
              targetId: g.id, targetName: g.name, rollId: rollId + "_" + g.id
            });
          }
        });
      } else if (!rolled.heal && rolled.attack && spellDmg && tgt && tgt.id && !whisperOn() && root.SSDNSDmJoin.postDamage) {
        root.SSDNSDmJoin.postDamage({
          amount: spellDmg, label: spellName, type: "spell", weapon: throughGun && i >= 0 ? gunName(i) : "",
          targetId: tgt.id, targetName: tgt.name, rollId: rollId
        });
      } else if (!rolled.heal && row && row.kind === "save" && tgt && tgt.id && !whisperOn() && root.SSDNSDmJoin.postDamage) {
        var saveAmt = Number(rolled.damageTotal != null ? rolled.damageTotal : rolled.result) || 0;
        var condS = root.SSDNSSpellArea && root.SSDNSSpellArea.onFail ? root.SSDNSSpellArea.onFail(spellName) : "";
        if (saveAmt > 0 || condS) {
          root.SSDNSDmJoin.postDamage({
            amount: saveAmt, label: spellName, type: "spell",
            save: row.save || rolled.save || "DEX", dc: v.spellDC, half: !!row.half,
            condition: condS, dice: rolled.damageDetail || "",
            targetId: tgt.id, targetName: tgt.name, rollId: rollId
          });
        }
      } else if (!rolled.heal && row && row.kind === "auto" && !rolled.autoDarts && tgt && tgt.id && !whisperOn() && root.SSDNSDmJoin.postDamage) {
        var autoAmt = Number(rolled.damageTotal != null ? rolled.damageTotal : rolled.result) || 0;
        if (autoAmt > 0) {
          root.SSDNSDmJoin.postDamage({
            amount: autoAmt, label: spellName, type: "spell", dice: rolled.damageDetail || "",
            targetId: tgt.id, targetName: tgt.name, rollId: rollId
          });
        }
      } else if (rolled.heal && !joined()) {
        applyDelta(Number(rolled.result) || 0, rolled.text);
      }
    } else if (rolled.heal) {
      applyDelta(Number(rolled.result) || 0, rolled.text);
    }
    if (placedBlast && !joined()) addLog({ kind: "alert", text: (spellName || "Spell") + " is placed. Join a table to mark hit points." });
    commitCast();
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
    if (root.SSDNSTurnLock && root.SSDNSTurnLock.offTurnBlock && root.SSDNSTurnLock.offTurnBlock("gear")) return;
    if (focusBlocked()) return;
    var c = ch();
    if (!c || !c.guns || !c.guns[i] || !c.guns[i].weapon) { toast("Pick a gun first"); return; }
    /* L0200: a Wrecked Caster Gun can't be cast through */
    if (c.guns[i].wrecked && root.SSDNSCasterRules) { toast(root.SSDNSCasterRules.CANT_CAST); addLog({ kind: "alert", text: root.SSDNSCasterRules.CANT_CAST }); return; }
    var pick = selectedCast(i);
    if (!pick) { toast("Pick a spell from your list."); return; }
    var looked = root.SSDNSSpellCast && root.SSDNSSpellCast.lookup && root.SSDNSSpellCast.lookup(pick.name);
    var areaPick = spellAreaFor(pick.name, looked);
    var start = areaPick ? Promise.resolve({ skip: true }) : chooseCastTarget(pick.name, looked, pick.slot);
    start.then(function (choice) {
      if (!choice) return;
      castChoice = choice;
      castThroughGunNow(i, pick);
    });
  }
  /* The shell and the slot wait until the blast is placed (or the attack is about to roll). Cancel gives them back. */
  function spendForCast(i, slot, fromChamber) {
    if (castSpellAttackNow._paid) return true;
    if (!(slot > 0)) { castSpellAttackNow._paid = true; return true; }
    var app = root.SSDNSApp;
    var c = ch();
    var useChamber = !!(fromChamber && c && c.calling === "hexslinger" && i >= 0 && app && app.spendHexChamber);
    if (useChamber) {
      var held = app.spendHexChamber(i, slot);
      if (!held || !held.ok) {
        if (!app.spendHexSlot || !app.spendHexSlot(slot)) {
          toast((held && held.reason) || ("No level-" + slot + " hex lead left."));
          return false;
        }
        armCastRefund(function () { if (app.refundHexSlot) app.refundHexSlot(slot); });
        castSpellAttackNow._paid = true;
        return true;
      }
      if (!held.alreadySpent && app.spendHexSlot && !app.spendHexSlot(slot)) {
        if (app.restoreHexChamber) app.restoreHexChamber(i, held);
        toast("No level-" + slot + " slot left.");
        return false;
      }
      armCastRefund(function () {
        if (!held.alreadySpent && app.refundHexSlot) app.refundHexSlot(slot);
        if (app.restoreHexChamber) app.restoreHexChamber(i, held);
      });
      castSpellAttackNow._paid = true;
      return true;
    }
    if (app && app.spendHexSlot && !app.spendHexSlot(slot)) {
      toast("No level-" + slot + " slot left.");
      return false;
    }
    armCastRefund(function () { if (app && app.refundHexSlot) app.refundHexSlot(slot); });
    castSpellAttackNow._paid = true;
    return true;
  }
  function castThroughGunNow(i, pick) {
    castSpellAttack(i, pick.name, pick.slot, pick.slot > 0);
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
  /* 0.3.69: every dice term and every flat counts ("1d6+1 +3", "1d8 +3 +1d4 piercing"). One-term strings roll
     exactly as before. A crit doubles every die. */
  function parseDamage(expr) {
    var s = String(expr || "").replace(/\([^)]*\)/g, " ");
    var terms = [];
    var rest = s.replace(/([+-]?)\s*(\d*)d(\d+)/gi, function (all, sg, n, d) {
      terms.push({ n: Math.max(1, parseInt(n || "1", 10)), sides: parseInt(d, 10), neg: sg === "-" });
      return " ";
    });
    var flat = 0;
    var flatHit = false;
    rest.replace(/([+-])\s*(\d+)/g, function (all, sg, n) { flat += (sg === "-" ? -1 : 1) * parseInt(n, 10); flatHit = true; return " "; });
    return { terms: terms, flat: flatHit ? flat : 0 };
  }
  /* SAMPLE trackers: Sneak Attack / Smite Lead are armed BEFORE the attack; SSDNSTrackers.rider() resolves them once per attack. */
  function takeRiders(ctx) {
    var T = root.SSDNSTrackers;
    return T && T.rider ? T.rider(ctx) : null;
  }
  function addRiders(dmg, r) {
    if (!dmg || !r || !r.riders || !r.riders.length) return dmg;
    dmg.total += r.total;
    dmg.riders = r.riders;
    dmg.riderText = r.text;
    return dmg;
  }
  /** L0186 special arrows (2026-10-20): the arrow that just flew can change the base damage (trackers.js arrowAdjust). */
  function arrowFx(dmg, spent) {
    var T = root.SSDNSTrackers;
    return spent && spent.arrow && T && T.arrowAdjust ? T.arrowAdjust(dmg, spent.arrow) : null;
  }
  function riderParts(r) {
    return (r && r.riders || []).map(function (x) { return { label: x.formula + " " + x.label, value: x.total }; });
  }
  function rollDamageExpr(expr, crit) {
    var p = parseDamage(expr);
    if (!p.terms.length) return null;
    var rolls = [];
    var sum = 0;
    var formula = [];
    p.terms.forEach(function (t) {
      var n = crit ? t.n * 2 : t.n;
      for (var k = 0; k < n; k++) { var r = 1 + Math.floor(Math.random() * t.sides); rolls.push(r); sum += t.neg ? -r : r; }
      formula.push((t.neg ? "-" : (formula.length ? "+" : "")) + n + "d" + t.sides);
    });
    var flat = p.flat || 0;
    sum += flat;
    var detail = rolls.join("+") + (flat ? ((flat >= 0 ? "+" : "") + flat) : "");
    return { total: sum, detail: detail, faces: rolls, flat: flat, formula: formula.join("") + (flat ? ((flat >= 0 ? "+" : "") + flat) : "") };
  }
  function whisperOn() {
    var box = document.querySelector("#chkWhisper");
    return !!(box && box.checked);
  }
  function attackWouldDis(conditions, chosen, extraDis) {
    extraDis = mountAttackExtra(extraDis);
    if (root.SSDNSConditions && root.SSDNSConditions.attackMode) {
      return root.SSDNSConditions.attackMode(conditions || [], chosen || "", extraDis || "") === "dis";
    }
    if ((chosen || "") === "adv" && extraDis) return false;
    return (chosen || "") === "dis" || !!extraDis;
  }
  function confirmIfDis(willDis) {
    if (!willDis) return Promise.resolve(true);
    var ask = root.SSDNSRangeRings && root.SSDNSRangeRings.confirmDisadvantage;
    if (!ask) return Promise.resolve(true);
    return ask().then(function (ok) { return !!ok; });
  }
  function catalogWeapon(id) {
    var lists = [].concat((root.SSDNS_RULES && root.SSDNS_RULES.firearms) || [], (root.SSDNS_RULES && root.SSDNS_RULES.casterGuns) || []);
    var wpn = lists.filter(function (x) { return x && x.id === id; })[0];
    if (wpn) return wpn;
    var peace = root.SSDNSPeaceMaker && root.SSDNSPeaceMaker.lookup && root.SSDNSPeaceMaker.lookup(id);
    if (peace) return peace;
    return (root.SSDNSTestJammer && root.SSDNSTestJammer.lookup && root.SSDNSTestJammer.lookup(id)) || null;
  }
  function gunAttackSpec(i) {
    var c = ch();
    var g = c && c.guns && c.guns[i];
    if (!g) return { id: "gunroll:" + i };
    var wpn = catalogWeapon(g.weapon) || {};
    var rngEl = document.querySelector('[data-out="rng.' + i + '"]');
    return {
      id: "gunroll:" + i,
      weapon: g.weapon,
      name: wpn.name || gunName(i),
      group: wpn.group || "",
      action: wpn.action || "",
      tier: g.tier || "",
      scatter: !!wpn.scatter,
      load: g.load || "",
      range: rngEl ? String(rngEl.textContent || "") : "",
      properties: wpn.properties || "",
      mod: g.mod || "",
      scope: /scope/i.test(g.mod || "")
    };
  }
  /* 0.3.67: reuse an armed range verdict only when it was measured against this target. */
  function freshVerdict(rings, tgt) {
    if (!rings) return null;
    if (rings.peekFor) return rings.peekFor(tgt && tgt.id);
    return rings.peek ? rings.peek() : null;
  }
  function ensureGunRange(i) {
    var rings = root.SSDNSRangeRings;
    var tgt = currentTarget();
    var kept = rings ? freshVerdict(rings, tgt) : null;
    if (kept) return kept;
    var host = root.SSDNSMapHost;
    if (!host || typeof host.armAttack !== "function") return null;
    return host.armAttack(gunAttackSpec(i), tgt && tgt.id);
  }
  function gunChosen(i) {
    if (root.SSDNSApp && root.SSDNSApp.gunAttackMode) return root.SSDNSApp.gunAttackMode(i);
    var modeSel = document.querySelector('[data-adv="' + i + '"]');
    var globalAdv = document.querySelector("#globalAdv");
    return (modeSel && modeSel.value) || (globalAdv && globalAdv.value) || "";
  }
  function prepareGun(i) {
    var gate = attackGate(currentTarget());
    if (gate) {
      if (root.SSDNSRangeRings && root.SSDNSRangeRings.clear) root.SSDNSRangeRings.clear();
      toast(gate);
      addLog({ kind: "alert", text: gate });
      return Promise.resolve(false);
    }
    ensureGunRange(i);
    var rings = root.SSDNSRangeRings;
    var peeked = rings && rings.peek ? rings.peek() : null;
    var name0 = gunName(i);
    if (peeked && peeked.apply && peeked.blocked) {
      if (rings.take) rings.take();
      toast(peeked.button || "Out of range");
      addLog({ kind: "alert", text: name0 + ": " + (peeked.button || "Out of range") });
      return Promise.resolve(false);
    }
    var rangeNote = peeked && peeked.apply && peeked.disadvantage ? (peeked.note || "disadvantage: range") : "";
    var willDis = attackWouldDis((ch() && ch().activeConditions) || [], rangeMode(gunChosen(i), peeked), rangeNote);
    if (!willDis) return Promise.resolve(true);
    return confirmIfDis(true).then(function (ok) {
      if (!ok && rings && rings.clear) rings.clear();
      return !!ok;
    });
  }
  /* L/R holsters: the Shoulder Rig surprise draw counts only for the pistol drawn from that side. */
  function shoulderRigFor(c, i) {
    var E = root.SSDNSEquip, side = E && E.pistolSide ? E.pistolSide(c, i) : "";
    if (side === "R") return c.holsterR === "shoulder-rig";
    if (side === "L") return c.holster === "shoulder-rig";
    return c.holster === "shoulder-rig" || c.holsterR === "shoulder-rig";
  }
  function pistolDraw(i) {
    var Equip = root.SSDNSEquip;
    var c = ch();
    var g = c && c.guns && c.guns[i];
    if (!Equip || !g || g.equipped !== true || g.drawn) return "";
    var info = Equip.drawCheck(c, i);
    if (!info || !info.needed) return "";
    var v = root.SSDNSApp && root.SSDNSApp.compute ? root.SSDNSApp.compute() : {};
    var mod = v && v.mods ? (Number(v.mods.DEX) || 0) : 0;
    var nat = 1 + Math.floor(Math.random() * 20);
    /* L0188: exhaustion 1+ gives disadvantage on ability checks (this is a Dex check) */
    if (condRollMode("check") === "dis") nat = Math.min(nat, 1 + Math.floor(Math.random() * 20));
    var total = nat + mod;
    var ok = total >= (info.dc || 12);
    var line = ((c && c.name) || "You") + " draws a second pistol: d20 " + nat + (mod ? ((mod > 0 ? "+" : "") + mod) : "") + " = " + total + " vs DC 12 " + (ok ? "success" : "fail");
    addLog({ kind: "roll", text: line });
    if (root.SSDNSDmJoin && root.SSDNSDmJoin.postChat) root.SSDNSDmJoin.postChat({ text: line });
    if (!ok) return "DC 12 Dex draw failed (" + total + ")";
    g.drawn = true;
    return "";
  }
  /* M1 (Mech PR A): the misfire text for the round that actually fired. The card re-renders right after spendRound,
     so it already shows the NEXT round; read the spent round's own value (same rule the card badge uses). */
  function spentMisfireText(i, spent, misEl) {
    var A = root.SSDNSApp;
    if (spent && spent.was && A && A.misfireTextFor) { var t = A.misfireTextFor(i, spent.was); if (t) return t; }
    return misEl && misEl.textContent;
  }
  function dryFire(i, name, offhand, fan) {
    if (root.SSDNSAudio) root.SSDNSAudio.play("empty-click");
    toast("Click.");
    addLog({ kind: "alert", text: (name || "Gun") + ": Click." });
    if (offhand && root.SSDNSOffhand && root.SSDNSOffhand.spendPip) root.SSDNSOffhand.spendPip(name);
    else if (fan && root.SSDNSFan && root.SSDNSFan.spend) root.SSDNSFan.spend(name);
    else if (root.SSDNSActionPips && root.SSDNSActionPips.attack) root.SSDNSActionPips.attack((name || "Gun") + " dry click");
  }
  function rollGun(i, chamber) {
    /* L0217: chambers 2–N spin for free, including off your turn. A tube or dots click falls through. */
    if (chamber != null && Number(chamber) > 0 && root.SSDNSApp && root.SSDNSApp.spinCylinder && root.SSDNSApp.spinCylinder(i, chamber)) {
      rollGun._chamber = null;
      return;
    }
    if (root.SSDNSTurnLock && root.SSDNSTurnLock.offTurnBlock && root.SSDNSTurnLock.offTurnBlock("attack")) return;
    if (chamber != null) rollGun._chamber = chamber;
    /* 0.3.61: a shot the DM sent while acting for this player. The DM already picked the target and the
       Adv/Dis mode and answered the disadvantage confirm, so this sheet never prompts for it. */
    var dmNow = rollGun._dm || null;
    rollGun._dm = null;
    /* 0.3.72: off-hand attack (bonus action, no positive ability mod to damage). Kept through the target/range asks. */
    var offNow = !!rollGun._offhand;
    rollGun._offhand = null;
    var OH = offNow ? root.SSDNSOffhand : null;
    /* 0.3.73: Pistolero Fan the Hammer (bonus action, ability mod kept). Kept through the target/range asks. */
    var fanNow = !!rollGun._fan;
    rollGun._fan = null;
    var FAN = fanNow && !OH ? root.SSDNSFan : null;
    var c = ch();
    if (!c || !c.guns || !c.guns[i] || !c.guns[i].weapon) { toast("Pick a gun first"); return; }
    var g = c.guns[i];
    if (g.equipped === false) { toast("Equip this weapon first."); return; }
    /* L0186: a nocked dynamite arrow has no attack roll; it lands at a point like a thrown stick */
    var TD = root.SSDNSTrackers;
    if (TD && TD.shootDynamite && TD.nocked && TD.kindOf && TD.kindOf(TD.weapon(g.weapon)) === "quiver" && TD.nocked(c, g) === "dynamite") {
      var dyn = TD.shootDynamite(i, { dm: !!dmNow });
      if (dyn && !dyn.ok) { toast(dyn.reason); addLog({ kind: "alert", text: gunName(i) + ": " + dyn.reason }); }
      rollGun._chamber = null; rollGun._aimed = false;
      return;
    }
    var name0 = gunName(i);
    /* 0.3.80 (Jessey): the off-hand attack needs the Attack action first; a DM-sent shot overrides. Checked once,
       on the first pass (the target/range asks re-enter rollGun with _aimed set). */
    if (OH && OH.gate && !rollGun._aimed && !rollGun._wild && !OH.gate(name0, { dm: !!dmNow }).ok) { rollGun._chamber = null; return; }
    if (FAN && FAN.gate && !rollGun._aimed && !rollGun._wild && !FAN.gate(i, name0, { dm: !!dmNow }).ok) { rollGun._chamber = null; return; }
    /* L0200: a Wrecked gun can't fire (no target ask, no round spent) */
    if (g.wrecked && root.SSDNSCasterRules) {
      toast(root.SSDNSCasterRules.CANT_FIRE);
      addLog({ kind: "alert", text: name0 + ": " + root.SSDNSCasterRules.CANT_FIRE });
      rollGun._chamber = null; rollGun._aimed = false;
      return;
    }
    if (/borrowed iron/i.test(name0) || g.weapon === "borrowed-iron") {
      var msg = "Borrowed Iron has no weapon stats. Use Pact Shot.";
      toast(msg);
      addLog({ kind: "alert", text: msg });
      return;
    }
    var empty = root.SSDNSApplied && root.SSDNSApplied.gunEmpty ? root.SSDNSApplied.gunEmpty(g) : !num(g.loaded);
    /* SAMPLE trackers: bows, slings, crossbows, the blowpipe and thrown weapons have no chambers. Before this they always
       answered "Empty: reload" and could never fire. spendRound asks the tracker (quiver / loaded marker / count). */
    var trkW = root.SSDNSTrackers && root.SSDNSTrackers.weapon ? root.SSDNSTrackers.weapon(g.weapon) : null;
    if (trkW && /^(quiver|loaded|thrown)$/.test(root.SSDNSTrackers.kindOf(trkW))) empty = false;
    var wpnSpin = catalogWeapon(g.weapon);
    var spins = !!(root.SSDNSAmmoDisplay && root.SSDNSAmmoDisplay.spins && root.SSDNSAmmoDisplay.spins({
      action: wpnSpin && wpnSpin.action, name: (wpnSpin && wpnSpin.name) || "", weapon: g.weapon,
      ammoDisplay: g.ammoDisplay, group: wpnSpin && wpnSpin.group, ammo: wpnSpin && wpnSpin.ammo
    }));
    /* L0218: an empty hammer spends the Attack and does not offer a cantrip. A hex under the hammer is Cast, not Roll. */
    if (spins && !rollGun._wild && root.SSDNSApp && root.SSDNSApp.cylinderPlan) {
      var plan = root.SSDNSApp.cylinderPlan(i, null);
      if (plan && plan.dry) { dryFire(i, name0, offNow, !!FAN); rollGun._chamber = null; return; }
      if (plan && plan.hex) {
        toast(plan.reason);
        addLog({ kind: "alert", text: name0 + ": " + plan.reason });
        rollGun._chamber = null;
        return;
      }
    }
    if (empty && !rollGun._wild && !spins) {
      g.loaded = 0;
      if (root.SSDNSAudio) root.SSDNSAudio.play("empty-click");
      toast("Empty: reload", "Reload", function () {
        var reloadBtn = document.querySelector('[data-reload="' + i + '"]');
        if (reloadBtn && !reloadBtn.hidden) reloadBtn.click();
      });
      addLog({ kind: "alert", text: name0 + ": Empty: reload" });
      return;
    }
    var freeNow = !!rollGun._free;
    rollGun._free = null;
    if (!rollGun._wild && !rollGun._aimed && (freeNow || freeShotChosen())) {
      var freeChamber = rollGun._chamber;
      rollGun._chamber = null;
      fireFreeShot(i, freeChamber, offNow, !!FAN);
      return;
    }
    if (!rollGun._aimed) {
      var keepChamber = rollGun._chamber;
      if (dmNow) {
        rollGun._aimed = true;
        rollGun._dmShot = { mode: dmNow.mode || "" };
        rollGun._offhand = offNow;
        rollGun._fan = fanNow;
        try { rollGun(i, keepChamber); }
        finally { rollGun._aimed = false; rollGun._chamber = null; rollGun._dmShot = null; }
        return;
      }
      ensureAttackTarget().then(function (ok) {
        if (!ok) { rollGun._chamber = null; return; }
        rollGun._chamber = keepChamber;
        prepareGun(i).then(function (go) {
          if (!go) { rollGun._chamber = null; return; }
          rollGun._aimed = true;
          rollGun._chamber = keepChamber;
          rollGun._offhand = offNow;
          rollGun._fan = fanNow;
          try { rollGun(i, keepChamber); }
          finally { rollGun._aimed = false; rollGun._chamber = null; }
        });
      });
      return;
    }
    var gate = attackGate(currentTarget());
    if (gate) {
      if (root.SSDNSRangeRings && root.SSDNSRangeRings.clear) root.SSDNSRangeRings.clear();
      toast(gate); addLog({ kind: "alert", text: gate }); return;
    }
    if (OH && OH.qualifies) {
      var ohq = OH.qualifies(ch(), "gun", i);
      if (!ohq.ok) addLog({ kind: "alert", text: "Off-hand: " + (ohq.reason || "not a qualifying pair") + " Rolled anyway; the DM can allow it." });
    }
    var drawFail = pistolDraw(i);
    if (drawFail) { toast(drawFail); addLog({ kind: "alert", text: drawFail }); return; }
    var rangeShot = root.SSDNSRangeRings && root.SSDNSRangeRings.take ? root.SSDNSRangeRings.take() : null;
    if (rangeShot && rangeShot.apply && rangeShot.blocked) {
      toast(rangeShot.button || "Out of range");
      addLog({ kind: "alert", text: name0 + ": " + (rangeShot.button || "Out of range") });
      return;
    }
    var spent = rollGun._wild
      ? { ok: true, left: num(g.loaded), chamber: null }
      : (root.SSDNSApp && root.SSDNSApp.spendRound ? root.SSDNSApp.spendRound(i, rollGun._chamber) : null);
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
    /* SAMPLE trackers: misfire is firearms only (a bow, crossbow, sling or thrown weapon never misfires) */
    var mfW = root.SSDNSApp.isFirearm ? (catalogWeapon(g.weapon) || (root.SSDNSTrackers && root.SSDNSTrackers.weapon ? root.SSDNSTrackers.weapon(g.weapon) : null)) : null;
    var ceiling = (root.SSDNSApp.isFirearm && mfW && !root.SSDNSApp.isFirearm(mfW)) ? 0 : (root.SSDNSApp.misfireCeiling
      ? root.SSDNSApp.misfireCeiling(spentMisfireText(i, spent, misEl), !!g.dirty)
      : 1);
    /* L0200: a Big Fifty .50-90 round fired from a Caster Gun misfires on 1-5 */
    if (ceiling > 0 && root.SSDNSCasterRules) ceiling = root.SSDNSCasterRules.misfireCeiling(mfW || catalogWeapon(g.weapon), g, spent && spent.was, ceiling);
    var chosen = rollGun._dmShot ? gunChosen(i) : rangeMode(gunChosen(i), rangeShot);
    var gunRollId = "r_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    var rangeNote = rangeShot && rangeShot.apply && rangeShot.disadvantage ? (rangeShot.note || "disadvantage: range") : "";
    var gunDice = rollGun._dmShot
      ? attackRoll(atk, [], rollGun._dmShot.mode, "")
      : attackRoll(atk, (ch() && ch().activeConditions) || [], chosen, rangeNote);
    if (rollGun._dmShot) chosen = rollGun._dmShot.mode;
    var n1 = gunDice.n1, n2 = gunDice.n2, nat = gunDice.nat;
    var bad = function (n) { return n >= 1 && n <= ceiling; };
    var both = n2 != null && bad(n1) && bad(n2);
    var wpn = catalogWeapon(g.weapon);
    var cue = root.SSDNSAudio && root.SSDNSAudio.weaponCue
      ? root.SSDNSAudio.weaponCue(Object.assign({ gun: true }, wpn || {}, { id: g.weapon, sfx: g.sfx || (wpn && wpn.sfx) || "" }))
      : "attack"
    cue = arrowShotCue(cue, spent); /* per-arrow-type sfx key, else the bow's own shot sound */
    var rugged = !!(wpn && /rugged/i.test(wpn.properties || ""));
    var name = gunName(i);
    var who = ((ch() && ch().name) || name) + (FAN ? " fans the hammer" : "");
    var dice = gunDice.shown || String(nat);
    var rolledView = root.SSDNSApp && root.SSDNSApp.compute ? root.SSDNSApp.compute() : {};
    var gunStat = rolledView.guns && rolledView.guns[i];
    var parts = gunStat && gunStat.parts ? gunStat.parts.map(function (p) { return { label: p.label, value: Number(p.value) || 0 }; }) : [{ label: "bonus", value: atk }];
    if (ch() && ch().surpriseDraw && shoulderRigFor(ch(), i)) {
      parts.push({ label: "Surprise draw", value: 2 });
      ch().surpriseDraw = false;
      addLog({ kind: "alert", text: "Surprise draw +2 (Shoulder Rig)" });
    }
    /* 0.3.69: the rig / Hair trigger first-shot bonus is spent by the first pistol attack of a combat
       (reset when you roll initiative or rest) */
    if (!rollGun._free && gunStat && gunStat.first && ch() && !ch().firstShotSpent && parts.some(function (p) { return p.label === "first shot"; })) {
      ch().firstShotSpent = true;
    }
    var featList = (ch() && ch().feats) || [];
    if (wpn && wpn.group === "pistol" && featList.indexOf("pistolero") >= 0 && rangeShot && rangeShot.apply && rangeShot.band !== "long" && rangeShot.band !== "blocked") {
      parts.push({ label: "Pistolero", value: 1 });
    }
    var bonus = atk;
    if (gunStat && gunStat.parts) {
      bonus = 0;
      parts.forEach(function (p) { bonus += Number(p.value) || 0; });
    }
    var total = nat + bonus;
    // Crit range (Champion 19-20 / 18-20, Pistolero Dead Eye inside normal range).
    var critAt = root.SSDNSApp && root.SSDNSApp.critMin
      ? root.SSDNSApp.critMin({ weapon: wpn, band: rangeShot && rangeShot.band, rangeApply: !!(rangeShot && rangeShot.apply) })
      : 20;
    var capNow = (gunStat && gunStat.capacity) || (wpn && wpn.capacity) || (g.chambers && g.chambers.length) || 0;
    /* SAMPLE trackers: ceiling 0 = not a firearm; resolveShot floors the ceiling at 1, so skip it (fallback never misfires) */
    var resolved = ceiling > 0 && root.SSDNSMisfire && root.SSDNSMisfire.resolveShot
      ? root.SSDNSMisfire.resolveShot({
        dirty: g.dirty, fouled: g.fouled, ruined: g.ruined || g.broken, jammed: g.jammed,
        misStreak: g.misStreak, weapon: g.weapon, rugged: rugged, properties: wpn && wpn.properties,
        lockedChambers: g.lockedChambers, capacity: capNow, mod: g.mod, name: name,
        feats: (ch() && ch().feats) || []
      }, { n1: n1, n2: n2, nat: nat, ceiling: ceiling, spark: false, chamber: spent.chamber, capacity: capNow, melee: false, wildAttack: !!rollGun._wild })
      : { misfire: bad(nat), both: false, fouled: false, jammed: bad(nat) && !rollGun._wild, armD4: false, misStreak: rollGun._wild ? g.misStreak : (bad(nat) ? (Number(g.misStreak) || 0) + 1 : 0), reset: !bad(nat) && !rollGun._wild, lockedChambers: g.lockedChambers || [], streakIgnored: !!rollGun._wild };
    if (!rollGun._wild) {
      g.misStreak = resolved.misStreak;
      g.fouled = !!resolved.fouled;
      g.jammed = !!resolved.jammed;
      if (resolved.lockedChambers) g.lockedChambers = resolved.lockedChambers.slice();
      if (resolved.lockIndex != null && Array.isArray(g.chambers)) {
        g.chambers[resolved.lockIndex] = "";
        g.loaded = g.chambers.filter(Boolean).length;
      }
      if (resolved.ruined || resolved.fouled) { g.ruined = true; g.broken = true; g.fouled = true; }
      /* L0200: each Big Fifty misfire in a Caster Gun rolls 1d6; a 1 explodes it (2d6 fire to the shooter, Wrecked) */
      var boom = root.SSDNSCasterRules ? root.SSDNSCasterRules.afterMisfire(g, spent.was, !!resolved.misfire, { w: wpn, who: (ch() && ch().name) || "You", gunName: name }) : null;
      if (boom && boom.exploded) { resolved.armD4 = false; resolved.jammed = false; resolved.lock = false; }
      if (root.SSDNSApp && root.SSDNSApp.refreshGunFace) root.SSDNSApp.refreshGunFace();
    }
    var misfired = !!resolved.misfire;
    var isCrit = !misfired && nat >= critAt;
    function syncFlag(flag) {
      var box = document.querySelector('[data-f="character.guns.' + i + '.' + flag + '"]');
      if (box) { box.checked = !!g[flag]; dispatch(box); }
    }
    if (resolved.fouled || resolved.ruined) {
      syncFlag("fouled");
      postGunLedger(name + " fouled", "foul");
    } else if (resolved.lock) {
      postGunLedger(name + " locked a chamber", "jam");
    } else if (resolved.jammed) {
      syncFlag("jammed");
      postGunLedger(name + " jammed (misfire)", "jam");
      var freeUnjam = root.SSDNSMisfire && root.SSDNSMisfire.unjamIsFree && root.SSDNSMisfire.unjamIsFree({
        weapon: g.weapon, rugged: rugged, properties: wpn && wpn.properties, mod: g.mod, feats: (ch() && ch().feats) || [], name: name
      });
      toast(name + " jammed. " + (freeUnjam ? "Unjam is a free action." : "Unjam is a bonus action."), "Unjam", function () {
        if (root.SSDNSApp && root.SSDNSApp.unjamGun) root.SSDNSApp.unjamGun(i);
      });
    }
    var quiet = whisperOn();
    var tgt = currentTarget();
    if (tgt) rememberEnemy(tgt);
    var gunCover = coverFor(tgt, coverOptsFor("gun"));
    var haveAc = !!(gunCover && gunCover.have);
    var dmgEl = document.querySelector('[data-calc="gunDmg.' + i + '"]');
    var dmgExpr = dmgEl && dmgEl.value;
    /* M1: a Caster Gun's damage follows the round that just fired (the card already shows the next one) */
    var spentStat = spent && spent.was && root.SSDNSApp && root.SSDNSApp.gunStatsFor ? root.SSDNSApp.gunStatsFor(i, spent.was) : null;
    if (spentStat && spentStat.loadedRound && spentStat.dmg) dmgExpr = spentStat.dmg;
    if (OH && OH.stripMod) dmgExpr = OH.stripMod(dmgExpr, OH.abilityMod(ch(), "gun", i));
    /* L0196: the arrow that flew decides the base die (Whistler 1d4), even if the card re-rendered after the last one left */
    if (spent && spent.arrow && root.SSDNSTrackers && root.SSDNSTrackers.arrowDieExpr) dmgExpr = root.SSDNSTrackers.arrowDieExpr(dmgExpr, spent.arrow);
    var ohTag = OH ? " · " + OH.TAG : (FAN ? " · " + FAN.TAG : "");
    var ohWord = OH ? " (" + OH.TAG + ")" : "";
    if (!misfired && FAN && FAN.cue) FAN.cue(cue, attackCue);
    else if (!misfired) attackCue(cue);
    else attackCue("misfire"); /* 0.3.56: misfire (jam, foul, lock, dud) has its own sound; no shot, no ricochet */
    if (!rollGun._wild && !misfired && acHidden(tgt) && joined() && !quiet) {
      var pendingDmg = rollDamageExpr(dmgExpr, isCrit);
      var pendArrow = arrowFx(pendingDmg, spent); /* L0186 special arrows: whistler / blunt / broadhead change the base damage */
      if (pendArrow && pendArrow.none) pendingDmg = null;
      var pendRide = takeRiders({ pending: true, crit: isCrit, melee: false, dm: !!rollGun._dmShot, weapon: g.weapon, arrow: spent && spent.arrow });
      var pendParts = gunStat && gunStat.dmgParts && OH ? OH.stripParts(gunStat.dmgParts) : (gunStat && gunStat.dmgParts);
      if (pendRide && pendRide.riders.length && pendingDmg) {
        pendParts = (pendParts && pendParts.length ? pendParts.slice() : (pendingDmg.flat ? [{ label: "mod", value: pendingDmg.flat }] : [])).concat(riderParts(pendRide));
        addRiders(pendingDmg, pendRide);
      }
      sendPendingAttack({
        who: who,
        targetName: tgt.name,
        targetId: tgt.id,
        nat: nat,
        n1: n1,
        n2: n2,
        parts: parts,
        hitTotal: total,
        critMin: critAt,
        damage: pendingDmg ? pendingDmg.total : 0,
        dice: pendingDmg ? pendingDmg.detail : "",
        dmgFaces: pendingDmg ? pendingDmg.faces : null,
        dmgFormula: pendingDmg ? pendingDmg.formula : "",
        dmgParts: pendParts,
        riders: pendRide && pendRide.riders,
        dmgType: (pendArrow && pendArrow.type) || (gunStat && gunStat.dmgType),
        arrow: pendArrow ? pendArrow.note : "",
        formula: (n2 == null ? "1d20" : "2d20") + ((bonus >= 0 ? "+" : "") + bonus),
        rollId: gunRollId,
        label: who + (tgt.name ? " → " + tgt.name : "") + ohTag,
        offhand: !!OH,
        fan: !!FAN,
        weapon: name,
        weaponId: g.weapon,
        gun: true,
        sfx: cue,
        quiet: false
      });
      /* Hidden AC returns before the resolved attack. Spend the same way that path does, or Action never hits turnMarkers. Off-hand and Fan still take the bonus instead. */
      if (OH && OH.spendPip) OH.spendPip(name);
      else if (FAN && FAN.spend) FAN.spend(name);
      else if (root.SSDNSActionPips && root.SSDNSActionPips.attack) {
        root.SSDNSActionPips.attack(name + " attack");
        if (wpn && wpn.group === "pistol" && root.SSDNSFan && root.SSDNSFan.notePistolAttack) root.SSDNSFan.notePistolAttack();
      } else if (wpn && wpn.group === "pistol" && root.SSDNSFan && root.SSDNSFan.notePistolAttack) root.SSDNSFan.notePistolAttack();
      consumeRollMode();
      return;
    }
    var miss = nat === 1 || misfired || (!isCrit && haveAc && total < Number(gunCover.ac));
    var dmg = null;
    if (!miss) dmg = rollDamageExpr(dmgExpr, isCrit);
    var arrowNow = miss ? null : arrowFx(dmg, spent); /* L0186 special arrows */
    if (arrowNow && arrowNow.none) dmg = null;
    var gunRide = takeRiders({ hit: !miss && !!dmg, crit: isCrit && !miss, melee: false, dm: !!rollGun._dmShot, weapon: g.weapon, arrow: spent && spent.arrow });
    var dmgParts = [];
    if (dmg && gunStat && gunStat.dmgParts) {
      var partSum = 0;
      var shownParts = OH ? OH.stripParts(gunStat.dmgParts) : gunStat.dmgParts;
      shownParts.forEach(function (p) { partSum += Number(p.value) || 0; });
      var arrowPart = arrowNow && arrowNow.part ? arrowNow.part.value : 0;
      dmgParts = partSum === ((dmg.flat || 0) - arrowPart) ? shownParts.concat(arrowPart ? [arrowNow.part] : []) : (dmg.flat ? [{ label: "mod", value: dmg.flat }] : []);
    } else if (dmg && dmg.flat) dmgParts = [{ label: "mod", value: dmg.flat }];
    var caliber = (g.chamber && String(g.chamber).split("|")[1]) || (wpn && wpn.ammo) || "";
    var card = root.SSDNSApplied && root.SSDNSApplied.attackBreakdown
      ? root.SSDNSApplied.attackBreakdown({
        who: who, target: tgt && tgt.name, weapon: name, tag: OH ? OH.TAG : "", nat: nat, n1: n1, n2: n2, parts: parts, total: total,
        ac: haveAc ? gunCover.ac : (tgt && tgt.ac), revealAc: !acHidden(tgt), misfire: misfired, miss: miss, coverNote: gunCover.note,
        crit: isCrit && !miss, critMin: critAt,
        damage: dmg ? { faces: dmg.faces, formula: dmg.formula, parts: dmgParts, riders: gunRide && gunRide.riders, total: dmg.total + (gunRide ? gunRide.total : 0), type: (arrowNow && arrowNow.type) || (gunStat && gunStat.dmgType) || "piercing" } : null
      })
      : null;
    addRiders(dmg, gunRide);
    var report = attackReport({
      who: who, target: tgt && tgt.name, nat: nat, atk: bonus,
      ac: haveAc ? gunCover.ac : (tgt && tgt.ac), miss: miss, misfire: misfired, dmg: dmg, crit: isCrit,
      dice: dice, weapon: name + ohWord, caliber: caliber
    });
    if (ch()) ch().takingCover = false;
    if (OH && OH.spendPip) OH.spendPip(name);
    else if (FAN && FAN.spend) FAN.spend(name);
    else if (root.SSDNSActionPips && root.SSDNSActionPips.attack) {
      root.SSDNSActionPips.attack(name + " attack");
      if (wpn && wpn.group === "pistol" && root.SSDNSFan && root.SSDNSFan.notePistolAttack) root.SSDNSFan.notePistolAttack();
    }
    if (resolved.armD4 && window.SSDNSD4 && window.SSDNSD4.arm) window.SSDNSD4.arm(i);
    var ammoTxt = spent.left == null ? "" : (spent.unit /* SAMPLE trackers: bows, crossbows, thrown */ ? (" · " + (/^empty/.test(spent.unit) ? "" : spent.left + " ") + spent.unit + ".") : (spent.left === 0 ? " · ammo" : (" · " + spent.left + " rounds left.")));
    var shownCard = card ? (acHidden(tgt) ? card.publicText : card.dmText) : report.player;
    var line = shownCard + (gunDice.note ? " · " + gunDice.note : "") + (chosen && gunDice.mode ? modeWord(chosen) : "") + ammoTxt;
    if (arrowNow && arrowNow.note) line += " · " + arrowNow.note;
    if (rollGun._wild) line += " · wild-shot attack (not on the streak)";
    if (root.SSDNSAudio && root.SSDNSAudio.playOutcome && !misfired) {
      root.SSDNSAudio.playOutcome({ gun: true, id: g.weapon, name: name, group: wpn && wpn.group, nat: nat }, miss ? "miss" : (isCrit ? "crit" : "hit"));
    }
    consumeRollMode();
    toast(line);
    addLog({
      id: "roll:" + gunRollId,
      kind: "roll", text: line,
      label: who + (tgt && tgt.name ? " → " + tgt.name : " attack") + ohTag,
      formula: (n2 == null ? "1d20" : "2d20") + ((atk >= 0 ? "+" : "") + atk) + (dmg && !report.miss ? " · " + dmg.formula : ""),
      attack: true, nat: nat, crit: isCrit && !miss, offhand: !!OH, fan: !!FAN
    });
    if (joined() && root.SSDNSDmJoin.postRoll) {
      root.SSDNSDmJoin.postRoll({
        id: gunRollId,
        label: who + (tgt && tgt.name ? " → " + tgt.name : "") + ohTag,
        offhand: !!OH,
        fan: !!FAN,
        formula: (n2 == null ? "1d20" : "2d20") + ((atk >= 0 ? "+" : "") + atk),
        result: total,
        detail: line,
        ac: report.ac,
        nat1: false,
        isFirearm: true,
        attack: true,
        nat: nat,
        crit: isCrit && !report.miss,
        private: quiet,
        whisper: quiet,
        damage: (!report.miss && dmg) ? dmg.total : null,
        weapon: name,
        targetId: tgt && tgt.id,
        targetName: tgt && tgt.name,
        /* attack-fx: the DM's map turns this into the firing line everyone sees (visual only) */
        fxReq: misfired || !tgt ? null : {
          target: tgt.id, result: report.miss ? "miss" : (isCrit ? "crit" : "hit"), sfx: cue, weapon: name, weaponId: g.weapon,
          group: wpn && wpn.group, scatter: !!(wpn && wpn.scatter), gun: true, arrow: spent && spent.arrow, nat: nat, crit: isCrit && !report.miss
        }
      });
    }
    if (!rollGun._wild && !report.miss && dmg && root.SSDNSDmJoin && root.SSDNSDmJoin.postDamage && !quiet) {
      root.SSDNSDmJoin.postDamage({ amount: dmg.total, label: name, weapon: name, type: "weapon", targetId: tgt && tgt.id, targetName: tgt && tgt.name, rollId: gunRollId });
    }
  }

  /* 0.3.67: Free shot. The gun fires at nothing in particular: the round is spent, misfire rules apply,
     the sound plays, the Action pip is spent. No target, range, Adv/Dis ask, AC, hit/miss or damage.
     Chat: "<Name> shoots freely · 1d20+B = T". The DM decides what it does. */
  function fireFreeShot(i, chamber, offhand, fan) {
    var c = ch();
    var g = c && c.guns && c.guns[i];
    if (!g) return null;
    if (root.SSDNSRangeRings && root.SSDNSRangeRings.clear) root.SSDNSRangeRings.clear();
    var drawFail = pistolDraw(i);
    if (drawFail) { toast(drawFail); addLog({ kind: "alert", text: drawFail }); return null; }
    var spent = root.SSDNSApp && root.SSDNSApp.spendRound ? root.SSDNSApp.spendRound(i, chamber) : null;
    var name = gunName(i);
    if (spent && spent.dry) { dryFire(i, name, offhand, fan); return null; }
    if (!spent || !spent.ok) {
      var reason = (spent && spent.reason) || "That gun can't fire.";
      toast(reason);
      addLog({ kind: "alert", text: name + ": " + reason });
      return null;
    }
    takeRiders({ hit: false }); /* SAMPLE trackers: a free shot has no target, so an armed Sneak Attack / Smite clears unspent */
    var atkEl = document.querySelector('[data-calc="gunAtk.' + i + '"]');
    var bonus = parseInt(atkEl && String(atkEl.value).replace(/[^\d-]/g, ""), 10);
    if (!isFinite(bonus)) bonus = 0;
    var rolledView = root.SSDNSApp && root.SSDNSApp.compute ? root.SSDNSApp.compute() : {};
    var gunStat = rolledView.guns && rolledView.guns[i];
    // Jessey 2026-10-19: a Free shot ignores the Sharpshooter/GWM -5/+10 toggle.
    var powerOff = gunStat && gunStat.power;
    if (gunStat && gunStat.parts) {
      bonus = 0;
      gunStat.parts.forEach(function (p) {
        if (p.label === "first shot") return;
        if (powerOff && p.label === powerOff.label) return;
        bonus += Number(p.value) || 0;
      });
    } else if (powerOff) bonus -= Number(powerOff.atk) || 0;
    var misEl = document.querySelector('[data-out="mis.' + i + '"]');
    /* SAMPLE trackers: misfire is firearms only (a bow, crossbow, sling or thrown weapon never misfires) */
    var mfW = root.SSDNSApp.isFirearm ? (catalogWeapon(g.weapon) || (root.SSDNSTrackers && root.SSDNSTrackers.weapon ? root.SSDNSTrackers.weapon(g.weapon) : null)) : null;
    var ceiling = (root.SSDNSApp.isFirearm && mfW && !root.SSDNSApp.isFirearm(mfW)) ? 0 : (root.SSDNSApp.misfireCeiling
      ? root.SSDNSApp.misfireCeiling(spentMisfireText(i, spent, misEl), !!g.dirty)
      : 1);
    /* L0200: a Big Fifty .50-90 round fired from a Caster Gun misfires on 1-5 */
    if (ceiling > 0 && root.SSDNSCasterRules) ceiling = root.SSDNSCasterRules.misfireCeiling(mfW || catalogWeapon(g.weapon), g, spent && spent.was, ceiling);
    var nat = d20();
    var total = nat + bonus;
    var wpn = catalogWeapon(g.weapon);
    var rugged = !!(wpn && /rugged/i.test(wpn.properties || ""));
    var capNow = (gunStat && gunStat.capacity) || (wpn && wpn.capacity) || (g.chambers && g.chambers.length) || 0;
    var bad = function (n) { return n >= 1 && n <= ceiling; };
    /* SAMPLE trackers: ceiling 0 = not a firearm; resolveShot floors the ceiling at 1, so skip it (fallback never misfires) */
    var resolved = ceiling > 0 && root.SSDNSMisfire && root.SSDNSMisfire.resolveShot
      ? root.SSDNSMisfire.resolveShot({
        dirty: g.dirty, fouled: g.fouled, ruined: g.ruined || g.broken, jammed: g.jammed,
        misStreak: g.misStreak, weapon: g.weapon, rugged: rugged, properties: wpn && wpn.properties,
        lockedChambers: g.lockedChambers, capacity: capNow, mod: g.mod, name: name,
        feats: (c && c.feats) || []
      }, { n1: nat, n2: null, nat: nat, ceiling: ceiling, spark: false, chamber: spent.chamber, capacity: capNow, melee: false, wildAttack: false })
      : { misfire: bad(nat), fouled: false, jammed: bad(nat), armD4: false, misStreak: bad(nat) ? (Number(g.misStreak) || 0) + 1 : 0, lockedChambers: g.lockedChambers || [] };
    g.misStreak = resolved.misStreak;
    g.fouled = !!resolved.fouled;
    g.jammed = !!resolved.jammed;
    if (resolved.lockedChambers) g.lockedChambers = resolved.lockedChambers.slice();
    if (resolved.lockIndex != null && Array.isArray(g.chambers)) {
      g.chambers[resolved.lockIndex] = "";
      g.loaded = g.chambers.filter(Boolean).length;
    }
    if (resolved.ruined || resolved.fouled) { g.ruined = true; g.broken = true; g.fouled = true; }
    /* L0200: Big Fifty misfire in a Caster Gun -> 1d6; a 1 explodes it */
    var boomF = root.SSDNSCasterRules ? root.SSDNSCasterRules.afterMisfire(g, spent.was, !!resolved.misfire, { w: wpn, who: (c && c.name) || "You", gunName: name }) : null;
    if (boomF && boomF.exploded) { resolved.armD4 = false; resolved.jammed = false; resolved.lock = false; }
    if (root.SSDNSApp && root.SSDNSApp.refreshGunFace) root.SSDNSApp.refreshGunFace();
    var misfired = !!resolved.misfire;
    function syncFlag(flag) {
      var box = document.querySelector('[data-f="character.guns.' + i + '.' + flag + '"]');
      if (box) { box.checked = !!g[flag]; dispatch(box); }
    }
    if (resolved.fouled || resolved.ruined) {
      syncFlag("fouled");
      postGunLedger(name + " fouled", "foul");
    } else if (resolved.lock) {
      postGunLedger(name + " locked a chamber", "jam");
    } else if (resolved.jammed) {
      syncFlag("jammed");
      postGunLedger(name + " jammed (misfire)", "jam");
    }
    var cue = root.SSDNSAudio && root.SSDNSAudio.weaponCue
      ? root.SSDNSAudio.weaponCue(Object.assign({ gun: true }, wpn || {}, { id: g.weapon, sfx: g.sfx || (wpn && wpn.sfx) || "" }))
      : "attack"
    cue = arrowShotCue(cue, spent); /* per-arrow-type sfx key, else the bow's own shot sound */
    var FANF = fan && !offhand ? root.SSDNSFan : null;
    if (!misfired && FANF && FANF.cue) FANF.cue(cue, attackCue);
    else attackCue(misfired ? "misfire" : cue);
    var OHF = offhand ? root.SSDNSOffhand : null;
    if (OHF && OHF.spendPip) OHF.spendPip(name);
    else if (FANF && FANF.spend) FANF.spend(name);
    else if (root.SSDNSActionPips && root.SSDNSActionPips.attack) {
      root.SSDNSActionPips.attack(name + " free shot");
      if (wpn && wpn.group === "pistol" && root.SSDNSFan && root.SSDNSFan.notePistolAttack) root.SSDNSFan.notePistolAttack();
    }
    if (resolved.armD4 && window.SSDNSD4 && window.SSDNSD4.arm) window.SSDNSD4.arm(i);
    var who = (c && c.name) || name;
    var formula = "1d20" + signMod(bonus);
    var line = who + (FANF ? " fans the hammer and" : "") + " shoots freely" + (OHF ? " (" + OHF.TAG + ")" : "") + " · " + formula + " = " + total;
    if (misfired) line += " · natural " + nat + " misfire, the round is spent";
    var ammoTxt = spent.left == null ? "" : (spent.unit /* SAMPLE trackers: bows, crossbows, thrown */ ? (" · " + (/^empty/.test(spent.unit) ? "" : spent.left + " ") + spent.unit + ".") : (spent.left === 0 ? " · ammo" : (" · " + spent.left + " rounds left.")));
    line += ammoTxt;
    var quiet = whisperOn();
    var rollId = "r_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    toast(line);
    addLog({ id: "roll:" + rollId, kind: "roll", text: line, label: who + " · free shot", formula: formula, attack: false, freeShot: true, nat: nat });
    if (joined() && root.SSDNSDmJoin.postRoll) {
      root.SSDNSDmJoin.postRoll({
        id: rollId,
        label: who + " · free shot",
        formula: formula,
        result: total,
        detail: line,
        nat1: false,
        isFirearm: true,
        attack: false,
        freeShot: true,
        nat: nat,
        private: quiet,
        whisper: quiet,
        weapon: name,
        fxReq: misfired ? null : { type: "free", sfx: cue, weapon: name, weaponId: g.weapon, nat: nat } /* attack-fx: short line where you face */
      });
    }
    return { line: line, total: total, nat: nat, misfire: misfired };
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
      if (payload[k] == null || payload[k] === false) return;
      var box = document.querySelector('[data-f="character.guns.' + i + '.' + k + '"]');
      if (box) { box.checked = true; dispatch(box); }
    });
    if (payload.misStreak != null && root.SSDNSApp && root.SSDNSApp.applyPatch) {
      root.SSDNSApp.applyPatch(function (doc) {
        var gun = doc.character && doc.character.guns && doc.character.guns[i];
        if (gun) gun.misStreak = Number(payload.misStreak) || 0;
      });
    }
    if (payload.ruined && root.SSDNSApp && root.SSDNSApp.applyPatch) {
      root.SSDNSApp.applyPatch(function (doc) {
        var gun = doc.character && doc.character.guns && doc.character.guns[i];
        if (!gun) return;
        gun.ruined = true;
        gun.broken = true;
      });
    }
    if (payload.armD4 && root.SSDNSD4 && root.SSDNSD4.arm) root.SSDNSD4.arm(i);
    if (payload.jammed) showNotice((payload.name || "Gun") + " jammed (misfire)");
    else if (payload.fouled) showNotice((payload.name || "Gun") + " fouled");
  }

  function setDeath(side, index, on) {
    var path = side === "fail" ? "fail" : "success";
    var c = ch();
    if (c) {
      if (!c.deathSaves) c.deathSaves = { success: [false, false, false], fail: [false, false, false] };
      if (!Array.isArray(c.deathSaves[path])) c.deathSaves[path] = [false, false, false];
      if (index >= 0 && index < 3) c.deathSaves[path][index] = !!on;
    }
    var box = document.querySelector('[data-f="character.deathSaves.' + path + '.' + index + '"]');
    if (!box) return;
    box.checked = !!on;
    dispatch(box);
  }

  function applyRest(kind, opts) {
    opts = opts || {};
    var c = ch();
    if (!c) return;
    if (kind === "short" && !opts.prompted && root.SSDNSApp && root.SSDNSApp.promptShortRestTools) {
      root.SSDNSApp.promptShortRestTools().then(function () { applyRest(kind, { prompted: true }); });
      return;
    }
    if (kind === "long") {
      c.muzzleReopenUsed = false;
      var max = effHpMax(num(c.hpMax));
      if (max > 0) c.hpCurrent = max;
      c.hpTemp = 0;
      if (max > 0) syncDown(max);
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
      c.muzzleReopenUsed = false;
      var word = "spell slots";
      if (c.calling === "hexslinger") word = "Hex Lead";
      else if (c.calling === "pact-seeker") word = "Pact slots";
      showNotice(shortHex ? "Short rest — pact slots refreshed. The misfire streak resets. Dirt and fouling stay." : "Short rest. Your " + word + " comes back on a long rest. The misfire streak resets. Dirt and fouling stay.");
    }
    if (root.SSDNSItems && root.SSDNSItems.recharge) root.SSDNSItems.recharge(c, kind);
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
    if (focusBlocked()) return;
    var held = c && c.guns && c.guns[i];
    if (held && held.weapon && held.equipped === false) { toast("Equip this weapon first."); return; }
    var looked = root.SSDNSSpellCast && root.SSDNSSpellCast.lookup && root.SSDNSSpellCast.lookup(sp.name);
    var areaPick = spellAreaFor(sp.name, looked);
    var start = areaPick ? Promise.resolve({ skip: true }) : chooseCastTarget(sp.name, looked, sp.slot || 0);
    start.then(function (choice) {
      if (!choice) return;
      castChoice = choice;
      castPickedNow(i, sp);
    });
  }
  function castPickedNow(i, sp) {
    var c = ch();
    var slot = sp.slot || 0;
    castSpellAttack(i, sp.name, slot, !!(slot > 0 && c && c.calling === "hexslinger"));
  }
  function openCastPrompt(level, onPick) {
    if (focusBlocked()) return;
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
      var blurb = root.SSDNSSpellCast && root.SSDNSSpellCast.blurb ? root.SSDNSSpellCast.blurb(sp.name) : "";
      b.textContent = (sp.level ? ("L" + sp.level + " · ") : "Cantrip · ") + sp.name + (blurb ? " — " + blurb : "");
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
    /* L0197: a Hexslinger casts through the Caster Gun equipped in Pistol L / R (the Focus slot mirror) */
    var cgI = root.SSDNSFocus && root.SSDNSFocus.castGunIndex ? root.SSDNSFocus.castGunIndex(c) : -1;
    if (cgI >= 0) return cgI;
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
    var chatId = "chat_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    var speaker = sheetSpeaker();
    addLog({ id: "chat:" + chatId, kind: "chat", text: speaker + ": " + text });
    var pending = root.SSDNSDmJoin.postChat({
      id: chatId,
      text: text,
      fromName: speaker
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
        if (selectedCast(gi)) { castThroughGun(gi); return; }
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
    // Table music (0.3.54): my own volume per layer + mute. Never synced.
    if (root.SSDNSMusic) {
      /* 0.3.55 Now playing: whatever the DM pushed. The sheet never starts a track itself. */
      var nowEl = $("#mxNowPlaying");
      var paintNow = function (s) {
        if (!nowEl) return;
        var parts = [];
        ["music", "ambient"].forEach(function (k) { var L = s[k]; if (L && L.track && (L.playing || L.paused || s.blocked)) parts.push((k === "ambient" ? "Ambient: " : "") + (L.track.title || "Untitled") + (L.paused ? " (paused)" : "")); });
        nowEl.textContent = "♪ " + (parts.length ? parts.join(" · ") : "Nothing playing");
        nowEl.classList.toggle("on", parts.length > 0);
      };
      root.SSDNSMusic.onChange(paintNow);
      paintNow(root.SSDNSMusic.snapshot());
      var mp = root.SSDNSMusic.prefs();
      Array.prototype.forEach.call(document.querySelectorAll("[data-mx-pref]"), function (el) { el.value = String(Math.round((mp[el.getAttribute("data-mx-pref")] || 0) * 100)); });
      Array.prototype.forEach.call(document.querySelectorAll("[data-mx-mute]"), function (el) { el.checked = !mp.muted; });
      document.addEventListener("input", function (e) {
        var t = e.target; if (!t || !t.hasAttribute) return;
        if (t.hasAttribute("data-mx-pref")) root.SSDNSMusic.setPref(t.getAttribute("data-mx-pref"), Number(t.value) / 100);
      });
      document.addEventListener("change", function (e) {
        var t = e.target; if (t && t.hasAttribute && t.hasAttribute("data-mx-mute")) root.SSDNSMusic.setMuted(!t.checked);
      });
    }
    var wh = $("#btnWhisper");
    if (wh) wh.addEventListener("click", whisper);
    var hear = $("#btnTapHear");
    if (hear) hear.addEventListener("click", function () {
      if (root.SSDNSAudio) root.SSDNSAudio.resumeMusic();
      if (root.SSDNSMusic) root.SSDNSMusic.resumeBlocked();
      hear.hidden = true;
    });
    renderLog();
    window.addEventListener("ssdns-name-mode", function () { renderLog(); });
    renderStore();
    setTimeout(renderConds, 400);
    document.addEventListener("click", function (e) {
      var t = e.target && e.target.closest ? e.target.closest("[data-handout-zoom]") : null;
      if (!t) return;
      zoomHandout(t.getAttribute("data-url") || t.getAttribute("src") || "", t.getAttribute("data-title") || "Handout");
    });
  }

  function offerWildShot(gunIndex, roll) {
    var wildLine = (root.SSDNSMisfire && root.SSDNSMisfire.WILD_TEXT) || "Wild shot! DM picks a random creature in normal range (allies included); roll a new attack";
    if (root.SSDNSDmJoin && root.SSDNSDmJoin.postFeed) root.SSDNSDmJoin.postFeed({ kind: "roll", text: wildLine });
    addLog({ kind: "alert", text: wildLine });
    toast(wildLine, "Roll wild-shot attack", function () {
      rollGun._wild = true;
      rollGun._aimed = true;
      try { rollGun(gunIndex, null, roll); }
      finally { rollGun._wild = false; rollGun._aimed = false; }
    }, 0);
  }

  root.SSDNSGunRoll = rollGun;
  root.SSDNSFreeShot = fireFreeShot;
  root.SSDNSOfferWildShot = offerWildShot;
  root.SSDNSGunCast = castThroughGun;
  root.SSDNSGunCastHex = castLoadedHex;
  function speakerColor(name) {
    var palette = ["#2f6f8f", "#3d6b4f", "#6b4c2a", "#5a3d6b", "#8a4b2f", "#1f5c6b", "#4a6741", "#7a3e55"];
    var s = String(name || "You");
    var h = 0;
    for (var i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) >>> 0;
    return palette[h % palette.length];
  }
  function rollDeathSave() {
    var c = ch();
    if (!c) return;
    var hp = num($("#inHPCur") && $("#inHPCur").value);
    if (hp > 0) { toast("You're on your feet."); return; }
    if (root.SSDNSAudio) root.SSDNSAudio.play("roll");
    var nat = 1 + Math.floor(Math.random() * 20);
    if (root.SSDNSTestRoll) {
      var forced = root.SSDNSTestRoll();
      if (forced) nat = forced;
    }
    if (!c.deathSaves) c.deathSaves = { success: [false, false, false], fail: [false, false, false] };
    var line = "Death save: " + nat;
    if (nat === 20) {
      setHp(1);
      line += " — natural 20, back to 1 HP";
      addLog({ kind: "roll", text: line, nat: nat });
      toast(line);
      return;
    }
    if (nat >= 10) {
      var si = (c.deathSaves.success || []).indexOf(false);
      if (si >= 0) setDeath("success", si, true);
      line += " — success";
    } else {
      var marks = nat === 1 ? 2 : 1;
      if (nat === 1) line += " — two failures";
      else line += " — failure";
      while (marks > 0) {
        var fi = (c.deathSaves.fail || []).indexOf(false);
        if (fi < 0) break;
        setDeath("fail", fi, true);
        marks--;
      }
    }
    var sCount = (c.deathSaves.success || []).filter(Boolean).length;
    var fCount = (c.deathSaves.fail || []).filter(Boolean).length;
    if (fCount >= 3) line += " · dead";
    else if (sCount >= 3) line += " · stable";
    addLog({ kind: "roll", text: line, nat: nat });
    toast(line);
  }
  function gunMeleeProfile(w) {
    if (!w) return null;
    var g = String(w.group || "");
    if (g === "pistol" || g === "caster") return { name: "Pistol Whip", expr: "1", twoHand: false };
    if (g === "rifle" || g === "carbine" || g === "shotgun" || g === "bigbore") return { name: "Rifle Butt", expr: "1d4", twoHand: true };
    return null;
  }
  function rollGunMelee(i) {
    if (root.SSDNSTurnLock && root.SSDNSTurnLock.offTurnBlock && root.SSDNSTurnLock.offTurnBlock("attack")) return;
    var c = ch();
    var g = c && c.guns && c.guns[i];
    if (!g || !g.weapon) { toast("Pick a gun first"); return; }
    if (g.equipped === false) { toast("Equip this weapon first."); return; }
    var wpn = catalogWeapon(g.weapon);
    var profile = gunMeleeProfile(wpn);
    if (!profile) { toast("That gun has no melee strike."); return; }
    var ready = ensureAttackTarget;
    if (!rollGunMelee._aimed) {
      ready().then(function (ok) {
        if (!ok) return;
        rollGunMelee._aimed = true;
        try { rollGunMelee(i); }
        finally { rollGunMelee._aimed = false; }
      });
      return;
    }
    var gate = attackGate(currentTarget());
    if (gate) { toast(gate); addLog({ kind: "alert", text: gate }); return; }
    var drawFail = pistolDraw(i);
    if (drawFail) { toast(drawFail); addLog({ kind: "alert", text: drawFail }); return; }
    var host = root.SSDNSMapHost;
    var rings = root.SSDNSRangeRings;
    var tgt0 = currentTarget();
    if (host && typeof host.armAttack === "function" && !(rings && freshVerdict(rings, tgt0))) {
      host.armAttack({
        id: "gunmelee:" + i,
        weapon: g.weapon,
        name: profile.name,
        kind: "melee",
        group: "melee",
        range: "5 ft",
        properties: profile.twoHand ? "Two-handed" : ""
      }, tgt0 && tgt0.id);
    }
    var peeked = rings && rings.peek ? rings.peek() : null;
    if (peeked && peeked.apply && peeked.blocked) {
      if (rings.take) rings.take();
      toast(peeked.button || "Out of range");
      return;
    }
    var rangeShot = rings && rings.take ? rings.take() : null;
    if (rangeShot && rangeShot.apply && rangeShot.blocked) { toast(rangeShot.button || "Out of range"); return; }
    var v = root.SSDNSApp && root.SSDNSApp.compute ? root.SSDNSApp.compute() : { mods: {}, prof: 0 };
    var str = (v.mods && v.mods.STR) || 0;
    var prof = v.prof || 0;
    var fake = { group: "melee", category: "simple", properties: profile.twoHand ? "Two-handed" : "", ability: "STR" };
    var style = root.SSDNSApp && root.SSDNSApp.styleAttackBonus ? (root.SSDNSApp.styleAttackBonus(fake) || 0) : 0;
    var dmgStyle = root.SSDNSApp && root.SSDNSApp.styleDamageBonus ? (root.SSDNSApp.styleDamageBonus(fake) || 0) : 0;
    var atk = str + prof + style;
    var rage = root.SSDNSApp && root.SSDNSApp.rageDamageBonus ? (root.SSDNSApp.rageDamageBonus(ch()) || 0) : 0;
    var flat = str + dmgStyle + rage + (profile.expr === "1" ? 1 : 0);
    var expr = profile.expr === "1" ? ((flat >= 0 ? "+" : "") + flat).replace(/^\+/, "") : (profile.expr + (flat ? ((flat >= 0 ? "+" : "") + flat) : ""));
    if (profile.expr === "1") expr = String(flat);
    var chosen = rangeMode(gunChosen(i), rangeShot);
    var rangeNote = rangeShot && rangeShot.apply && rangeShot.disadvantage ? (rangeShot.note || "disadvantage: range") : "";
    var faced = attackRoll(atk, (c.activeConditions) || [], chosen, rangeNote);
    var nat = faced.nat;
    var tgt = currentTarget();
    if (tgt) rememberEnemy(tgt);
    var cover = coverFor(tgt, coverOptsFor("melee"));
    var haveAc = !!(cover && cover.have);
    var total = nat + atk;
    var miss = nat === 1 || (haveAc && total < Number(cover.ac));
    var dmg = null;
    if (!miss) {
      if (profile.expr === "1") dmg = { total: Math.max(0, flat), detail: String(flat), faces: [], flat: flat, formula: String(flat) };
      else dmg = rollDamageExpr(profile.expr + (flat ? ((flat >= 0 ? "+" : "") + flat) : ""), nat === 20);
    }
    addRiders(dmg, takeRiders({ hit: !miss && !!dmg, crit: !miss && nat === 20, melee: true, finesse: false }));
    if (c) c.takingCover = false;
    if (root.SSDNSActionPips && root.SSDNSActionPips.attack) root.SSDNSActionPips.attack(profile.name);
    attackCue("whoosh");
    var who = (c && c.name) || "You";
    var report = attackReport({
      who: who, target: tgt && tgt.name, nat: nat, atk: atk,
      ac: haveAc ? cover.ac : (tgt && tgt.ac), miss: miss, dmg: dmg,
      dice: faced.shown || String(nat), weapon: profile.name
    });
    addLog({ kind: "roll", text: report.player, nat: nat });
    toast(report.player);
    if (root.SSDNSSheet && root.SSDNSSheet.consumeRollMode) consumeRollMode();
  }
  function applyRolledSpell(opts) {
    opts = opts || {};
    var spellName = opts.spellName || "";
    var rolled = opts.rolled;
    if (!rolled) return Promise.resolve(false);
    var Cast = root.SSDNSSpellCast;
    var row = (Cast && Cast.lookup && Cast.lookup(spellName)) || { kind: rolled.kind || "none", name: spellName };
    var area = spellAreaFor(spellName, row);
    function settle(placed) {
      var c = ch();
      var v = root.SSDNSApp && root.SSDNSApp.compute ? root.SSDNSApp.compute() : {};
      var tgt = currentTarget();
      var rollId = "r_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      var text = rolled.text || (spellName + " cast");
      if (placed) {
        var crowd = placed.tokens || [];
        text += " · " + ((placed.area && placed.area.label) || "area") + ": " + (crowd.length ? crowd.map(function (t) { return t.name || "token"; }).join(", ") : "nobody in the area");
      }
      addLog({ id: "roll:" + rollId, kind: "roll", text: text, label: rolled.label || spellName, formula: rolled.formula, attack: !!rolled.attack, nat: rolled.nat, crit: !!rolled.crit });
      toast(text);
      if (placed && joined() && !whisperOn() && root.SSDNSDmJoin && root.SSDNSDmJoin.postDamage) {
        var full = Number(rolled.damageTotal != null ? rolled.damageTotal : rolled.result) || 0;
        var kindNow = row.kind || rolled.kind || "";
        var condP = root.SSDNSSpellArea && root.SSDNSSpellArea.onFail ? root.SSDNSSpellArea.onFail(spellName) : "";
        (placed.tokens || []).forEach(function (t, idx) {
          if (kindNow === "heal" && !(full > 0)) return;
          if (kindNow !== "heal" && kindNow !== "save" && kindNow !== "auto") return;
          if (kindNow !== "heal" && !(full > 0 || condP)) return;
          var hitRow = {
            amount: full, label: spellName, type: kindNow === "heal" ? "heal" : "spell",
            dice: rolled.damageDetail || "", targetId: blastTargetId(t), targetName: t.name || "", rollId: rollId + "_" + idx
          };
          if (kindNow === "save") {
            hitRow.save = row.save || rolled.save || "DEX";
            hitRow.dc = opts.dc != null ? opts.dc : v.spellDC;
            hitRow.half = !!(row.half || rolled.half);
            if (condP) hitRow.condition = condP;
          }
          if (hitRow.targetId) root.SSDNSDmJoin.postDamage(hitRow);
        });
      } else if (!placed && rolled.attack && tgt && tgt.id && joined() && !whisperOn()) {
        var dmg = Number(rolled.damageTotal);
        if (!isFinite(dmg)) dmg = 0;
        if (rolled.nat !== 1) {
          sendPendingAttack({
            who: (c && c.name) || "You", targetName: tgt.name, targetId: tgt.id,
            nat: rolled.nat, hitTotal: rolled.result, damage: dmg, dice: rolled.damageDetail || "",
            formula: rolled.formula, rollId: rollId, label: rolled.label || spellName,
            spellName: spellName, spell: true, quiet: false
          });
        }
      } else if (!placed && row.kind === "save" && tgt && tgt.id && joined() && !whisperOn() && root.SSDNSDmJoin && root.SSDNSDmJoin.postDamage) {
        var saveAmt = Number(rolled.damageTotal != null ? rolled.damageTotal : rolled.result) || 0;
        var condS = root.SSDNSSpellArea && root.SSDNSSpellArea.onFail ? root.SSDNSSpellArea.onFail(spellName) : "";
        if (saveAmt > 0 || condS) {
          root.SSDNSDmJoin.postDamage({
            amount: saveAmt, label: spellName, type: "spell",
            save: row.save || rolled.save || "DEX", dc: opts.dc != null ? opts.dc : v.spellDC, half: !!(row.half || rolled.half),
            condition: condS, dice: rolled.damageDetail || "", targetId: tgt.id, targetName: tgt.name, rollId: rollId
          });
        }
      } else if (!placed && (row.kind === "none" || row.kind === "rider")) {
        var note = applySpellBuff(spellName);
        if (note) addLog({ kind: "roll", text: note });
      } else if (!placed && row.kind === "auto" && rolled.darts && rolled.darts.length && tgt && tgt.id && joined() && root.SSDNSDmJoin && root.SSDNSDmJoin.postDamage && root.SSDNSSpellArea && root.SSDNSSpellArea.assignDarts) {
        root.SSDNSSpellArea.assignDarts(rolled.darts, rolled.darts.map(function () { return tgt; })).forEach(function (g) {
          if (!(g.total > 0)) return;
          root.SSDNSDmJoin.postDamage({ amount: g.total, label: spellName, type: "spell", dice: (g.bits || []).join("; "), targetId: g.id, targetName: g.name, rollId: rollId + "_" + g.id });
        });
      } else if (!placed && row.kind === "auto" && !rolled.darts && tgt && tgt.id && joined() && root.SSDNSDmJoin && root.SSDNSDmJoin.postDamage) {
        var autoAmt = Number(rolled.damageTotal != null ? rolled.damageTotal : rolled.result) || 0;
        if (autoAmt > 0) root.SSDNSDmJoin.postDamage({ amount: autoAmt, label: spellName, type: "spell", dice: rolled.damageDetail || "", targetId: tgt.id, targetName: tgt.name, rollId: rollId });
      }
      if (placed && !joined()) addLog({ kind: "alert", text: spellName + " is placed. Join a table to mark hit points." });
      return true;
    }
    if (opts.placed) return Promise.resolve(settle(opts.placed));
    if (!area) return Promise.resolve(settle(null));
    var host = root.SSDNSMapHost;
    if (!host || typeof host.placeBlast !== "function") {
      toast("Open the map to place " + spellName + ".");
      return Promise.resolve(false);
    }
    var uid = root.SSDNSDmJoin && root.SSDNSDmJoin.uid && root.SSDNSDmJoin.uid();
    var tok = host.tokenForPlayer && uid ? (host.tokenForPlayer(uid) || "") : "";
    return host.placeBlast({ name: spellName, area: area, casterId: tok || uid || "" }).then(function (placed) {
      if (!placed) { toast("Cast cancelled."); return false; }
      return settle(placed);
    });
  }
  root.SSDNSGunMelee = rollGunMelee;
  root.SSDNSSheet = {
    grantBought: grantBought,
    rollInitiative: rollInitiative,
    applyDelta: applyDelta,
    setHp: setHp,
    postCheck: postCheck,
    rollAdv: rollAdv,
    condRollMode: condRollMode,
    rollCheck: rollCheck,
    effHpMax: effHpMax,
    exhaustionLevel: exhLevel,
    renderConds: renderConds,
    flashHp: flashHp,
    logRows: function () { return log.slice(); },
    showNotice: showNotice,
    setConditions: setConditions,
    addLog: addLog,
    ensureAttackTarget: ensureAttackTarget,
    clearLog: clearLog,
    mergeLog: mergeLog,
    rollDamageExpr: rollDamageExpr,
    parseDamage: parseDamage,
    openStore: openStore,
    setStock: setStock,
    applyGunEvent: applyGunEvent,
    setDeath: setDeath,
    rollDeathSave: rollDeathSave,
    syncDown: syncDown,
    rollGunMelee: rollGunMelee,
    clearDowned: clearDowned,
    applyRest: applyRest,
    undoItem: undoItem,
    renderStore: renderStore,
    renderLog: renderLog,
    showInspiration: showInspiration,
    castNamed: function (name) { castSpellAttack(-1, name, 0, false); },
    applyRolledSpell: applyRolledSpell,
    abortCast: abortCast,
    castAt: function (name, slot) { castSpellAttack(-1, name, parseInt(slot, 10) || 0, false); },
    attackRoll: attackRoll,
    attackGate: attackGate,
    coverFor: coverFor,
    coverOptsFor: coverOptsFor,
    acHidden: acHidden,
    sendPendingAttack: sendPendingAttack,
    consumeRollMode: consumeRollMode,
    attackCue: attackCue,
    showTapHear: function () {
      var b = $("#btnTapHear");
      if (b) b.hidden = false;
    }
  };

  if (root.SSDNSDice) {
    root.SSDNSDice.onBarRoll = function (rolled) {
      var who = sheetSpeaker();
      var text = (who ? who + " · " : "") + rolled.formula + " = " + rolled.result;
      var many = !!(rolled.pool && rolled.faces && (rolled.faces.length > 1 || rolled.mod));
      var label = many ? "Roll" : "d" + rolled.sides;
      var natOne = rolled.sides === 20 && (!rolled.faces || rolled.faces.length === 1) ? rolled.face : undefined;
      addLog({
        kind: "roll",
        text: text,
        label: label,
        formula: rolled.formula,
        result: rolled.result,
        face: rolled.face,
        rolls: rolled.faces || [rolled.face],
        dice: rolled.dice || undefined,
        detail: many ? rolled.detail : undefined,
        nat: natOne
      });
      if (joined() && root.SSDNSDmJoin && root.SSDNSDmJoin.postRoll) {
        root.SSDNSDmJoin.postRoll({
          label: label,
          formula: rolled.formula,
          result: rolled.result,
          detail: many ? rolled.detail : String(rolled.face),
          rolls: rolled.faces || [rolled.face],
          dice: rolled.dice || null,
          face: rolled.face,
          nat: natOne,
          private: whisperOn(),
          whisper: whisperOn()
        });
      }
    };
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire);
  else wire();
})(window);

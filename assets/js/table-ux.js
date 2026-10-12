/**
 * Sheet controls for this batch: death saves, Take Cover, Mercy Hands,
 * chat voice, and a Gear-page copy of the attack target picker.
 */
(function (root) {
  "use strict";
  function $(id) { return root.document && root.document.getElementById(id); }
  function ch() {
    var doc = root.SSDNSApp && root.SSDNSApp.doc && root.SSDNSApp.doc();
    return doc && doc.character;
  }
  function boot() {
    if (!root.document || !root.document.body) return;
    var ds = root.document.querySelector(".ds");
    if (ds && !$("btnDeathSave")) {
      var death = root.document.createElement("button");
      death.type = "button";
      death.className = "btn sm";
      death.id = "btnDeathSave";
      death.textContent = "Death save";
      death.addEventListener("click", function () {
        if (root.SSDNSSheet && root.SSDNSSheet.rollDeathSave) root.SSDNSSheet.rollDeathSave();
      });
      ds.appendChild(death);
    }
    var reminder = root.document.querySelector(".reminder");
    if (reminder && !$("btnTakeCover")) {
      var cover = root.document.createElement("button");
      cover.type = "button";
      cover.className = "btn sm";
      cover.id = "btnTakeCover";
      cover.textContent = "Take Cover";
      cover.addEventListener("click", function () {
        var c = ch();
        if (!c) return;
        c.takingCover = true;
        paintCover();
        if (root.SSDNSSheet && root.SSDNSSheet.addLog) root.SSDNSSheet.addLog({ kind: "alert", text: "Taking cover. Incoming ranged attacks have disadvantage until your next attack." });
      });
      reminder.parentNode.insertBefore(cover, reminder.nextSibling);
    }
    var chat = $("logChat");
    if (chat && !$("chatVoice")) {
      var voice = root.document.createElement("label");
      voice.className = "fine";
      voice.innerHTML = "Voice <select id='chatVoice' aria-label='Chat voice'><option value='character'>Character</option><option value='player'>Player</option></select>";
      chat.appendChild(voice);
      var sel = $("chatVoice");
      try { sel.value = localStorage.getItem("ssdns.chatVoice") === "player" ? "player" : "character"; } catch (e) {}
      sel.addEventListener("change", function () {
        try { localStorage.setItem("ssdns.chatVoice", sel.value); } catch (err) {}
      });
    }
    var hp = root.document.querySelector(".hp-quick");
    if (hp && !$("btnMercy")) {
      var mercy = root.document.createElement("button");
      mercy.type = "button";
      mercy.className = "btn sm";
      mercy.id = "btnMercy";
      mercy.textContent = "Mercy Hands";
      mercy.addEventListener("click", castMercy);
      hp.appendChild(mercy);
    }
    if (hp && !$("btnRage")) {
      var rage = root.document.createElement("button");
      rage.type = "button";
      rage.className = "btn sm";
      rage.id = "btnRage";
      rage.textContent = "Dust Fury";
      rage.addEventListener("click", toggleRage);
      hp.appendChild(rage);
    }
    syncGearTarget();
    paintCover();
    paintCallingChips();
    var guns = ch() && ch().guns;
    (guns || []).forEach(function (g, i) {
      if (g && g.pendingD4 && root.SSDNSD4 && root.SSDNSD4.arm) root.SSDNSD4.arm(i);
    });
    root.document.addEventListener("change", function () { paintCallingChips(); paintCover(); });
  }
  function paintCover() {
    var c = ch();
    var btn = $("btnTakeCover");
    if (btn) btn.classList.toggle("is-on", !!(c && c.takingCover));
  }
  function paintCallingChips() {
    var c = ch();
    var host = $("callingChips");
    if (!host) {
      var name = $("charName");
      if (!name || !name.parentNode) return;
      host = root.document.createElement("div");
      host.id = "callingChips";
      host.className = "status-chips";
      name.parentNode.appendChild(host);
    }
    if (!c) { host.innerHTML = ""; return; }
    var bits = [];
    if (c.lineage) bits.push("<span class='chip faction'>" + c.lineage + "</span>");
    if (c.calling) bits.push("<span class='chip calling'>" + c.calling + "</span>");
    if (c.takingCover) bits.push("<span class='chip cover'>Cover</span>");
    if (c.raging) bits.push("<span class='chip rage'>Dust Fury</span>");
    if (c.calling === "lawman") bits.push("<label class='chip badge'>Badge <select id='badgeState' aria-label='Lawman badge'></select></label>");
    else if (c.badgeState) bits.push("<span class='chip badge'>" + c.badgeState + " badge</span>");
    (c.activeConditions || []).forEach(function (row) {
      if (row && row.name) bits.push("<span class='chip cond'>" + row.name + "</span>");
    });
    host.innerHTML = bits.join("");
    var badgeSel = $("badgeState");
    if (badgeSel && c.calling === "lawman") {
      ["bright", "dull", "tarnished"].forEach(function (state) {
        var o = root.document.createElement("option");
        o.value = state;
        o.textContent = state === "bright" ? "Bright (sworn in)" : (state === "dull" ? "Dull" : "Tarnished");
        if ((c.badgeState || "bright") === state) o.selected = true;
        badgeSel.appendChild(o);
      });
      badgeSel.addEventListener("change", function () {
        c.badgeState = badgeSel.value;
        if (root.SSDNSApp && root.SSDNSApp.applyPatch) root.SSDNSApp.applyPatch(function () {});
        paintCallingChips();
      });
    }
    var mercy = $("btnMercy");
    if (mercy) {
      mercy.hidden = c.calling !== "lawman";
      mercy.disabled = c.badgeState === "dull";
    }
    var rage = $("btnRage");
    if (rage) rage.hidden = c.calling !== "tribal-warrior";
  }
  function syncGearTarget() {
    var gear = $("page-equip");
    var src = $("atkTarget");
    if (!gear || $("gearTarget")) return;
    if (!src) { setTimeout(syncGearTarget, 400); return; }
    var label = root.document.createElement("label");
    label.className = "fine";
    label.innerHTML = "Target <select id='gearTarget' aria-label='Gear attack target'></select>";
    var guns = $("guns");
    if (guns) guns.parentNode.insertBefore(label, guns);
    var copy = $("gearTarget");
    function mirror() {
      copy.innerHTML = src.innerHTML;
      copy.value = src.value;
    }
    mirror();
    src.addEventListener("change", mirror);
    copy.addEventListener("change", function () { src.value = copy.value; src.dispatchEvent(new Event("change", { bubbles: true })); });
    var obs = new MutationObserver(mirror);
    obs.observe(src, { childList: true, subtree: true });
  }
  function mercyPool(c) {
    var level = Math.max(1, Number(c.level) || 1);
    return Math.max(0, level * 5 - (Number(c.mercySpent) || 0));
  }
  function castMercy() {
    var c = ch();
    if (!c || c.calling !== "lawman") return;
    if (c.badgeState === "dull") return;
    var pool = mercyPool(c);
    if (pool <= 0) return;
    var amount = Math.min(pool, Math.max(1, Number(window.prompt("Mercy Hands. Pool " + pool + ". How many?", "1")) || 0));
    if (!amount) return;
    var sel = $("atkTarget");
    var target = sel && sel.value;
    var joined = root.SSDNSDmJoin && root.SSDNSDmJoin.isJoined && root.SSDNSDmJoin.isJoined();
    var mine = root.SSDNSDmJoin && root.SSDNSDmJoin.uid && root.SSDNSDmJoin.uid();
    c.mercySpent = (Number(c.mercySpent) || 0) + amount;
    if (joined && target && target !== mine && root.SSDNSDmJoin.postMercy) {
      root.SSDNSDmJoin.postMercy({ targetId: target, amount: amount });
    } else if (root.SSDNSSheet && root.SSDNSSheet.applyDelta) {
      root.SSDNSSheet.applyDelta(amount, "Mercy Hands " + amount);
    }
    if (root.SSDNSApp && root.SSDNSApp.applyPatch) root.SSDNSApp.applyPatch(function () {});
  }
  function toggleRage() {
    var c = ch();
    if (!c || c.calling !== "tribal-warrior") return;
    if (!c.raging) {
      var used = Number(c.rageUsed) || 0;
      if (used >= 2) return;
      c.raging = true;
      c.rageUsed = used + 1;
    } else c.raging = false;
    paintCallingChips();
    if (root.SSDNSPlaytest && root.SSDNSPlaytest.syncSheet) root.SSDNSPlaytest.syncSheet();
  }
  if (root.document && root.document.readyState === "loading") root.document.addEventListener("DOMContentLoaded", boot);
  else boot();
})(window);

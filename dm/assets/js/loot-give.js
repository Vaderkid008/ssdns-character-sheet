/* Give-tab Loot section (Act I DRAFT v1.4). Not a top-level tab.
   Place a box on the map, select it, then Lockpick / Force / Key / Pry / Search.
   Yes, Force, and Search use the sheet check (SSDNSSheet.rollAdv + postCheck) when the sheet is open.
   DM can pre-unlock, clear a jam, or open without a check. Weight over cap warns and still sends. */
(function (root) {
  "use strict";
  var ui = { boxes: [], current: "", view: "opener", ready: null };
  function $(id) { return document.getElementById(id); }
  function L() { return root.SSDNSLoot; }
  function DM() { return root.DMCC; }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function players() { return (DM() && DM().state && DM().state.players) || {}; }
  function openerId() {
    var sel = $("rewTarget");
    return sel ? sel.value : "";
  }
  function shortName(pid) {
    var p = players()[pid];
    var n = (p && p.snapshot && p.snapshot.name) || pid || "them";
    return String(n).replace(/["“”].*?["“”]/g, " ").trim().split(/\s+/)[0] || n;
  }
  function otherId(opener) {
    var ids = Object.keys(players());
    var i;
    for (i = 0; i < ids.length; i++) if (ids[i] && ids[i] !== opener && ids[i] !== "all") return ids[i];
    return "";
  }
  function ctx() {
    return {
      act: Math.max(1, parseInt(($("lootAct") && $("lootAct").value) || "1", 10) || 1),
      partyLevel: Math.max(1, parseInt(($("lootLevel") && $("lootLevel").value) || "1", 10) || 1),
      chapter: Math.max(1, parseInt(($("lootChapter") && $("lootChapter").value) || "1", 10) || 1),
      overrideRare: !!($("lootRareOverride") && $("lootRareOverride").checked),
      rollMode: ($("lootRollMode") && $("lootRollMode").value) || "preroll",
      opener: openerId(),
      openerName: shortName(openerId())
    };
  }
  function current() {
    var i;
    for (i = 0; i < ui.boxes.length; i++) if (ui.boxes[i].id === ui.current) return ui.boxes[i];
    return ui.boxes[0] || null;
  }
  function toast(msg) { if (DM() && DM().toast) DM().toast(msg); }
  function paintBudget() {
    var el = $("lootBudget");
    if (!el || !L()) return;
    var c = ctx();
    var b = L().budget(ui.boxes.filter(function (x) { return x.boxType !== "sealed-crate"; }), c.chapter);
    el.textContent = b.text;
  }
  function paintCard() {
    var host = $("lootCard");
    if (!host || !L()) return;
    var box = current();
    paintBudget();
    if (!box) { host.innerHTML = "<p class=\"fine\">No box yet. Pick a type and place one.</p>"; return; }
    var c = ctx();
    var other = otherId(box.opener);
    var openerSees = L().visibleTo(box, box.opener, "player");
    var otherSees = other ? L().visibleTo(box, other, "player") : false;
    var dmLines = (box.contents || []).map(function (row, i) {
      return "<li><span>" + esc(row.qty) + " × " + esc(row.name || row.id) + (row.dirty ? " · Dirty" : "") + (row.hand ? " · DM placed" : "") + (row.taken ? " · taken" : "") + "</span> " +
        (row.taken ? "" : "<button type=\"button\" class=\"btn xs\" data-loot-take=\"" + i + "\">Take</button>") + "</li>";
    }).join("");
    var cash = "";
    if (box.cash && box.cash.branch === "black") cash = "<p><b>" + esc(box.cash.black) + " × Black shard (drained)</b> instead of ES. Junk, not the quest shard.</p>";
    else if (box.cash && box.cash.es) cash = "<p><b>" + esc(box.cash.es) + " ES</b> → wallet" + (box.cash.takenEs ? " · taken" : "") + "</p>";
    else if (box.rolled && box.boxType === "supply-crate") cash = "<p class=\"fine\">No cash line on a Supply Crate.</p>";
    var sealed = box.actMin && c.act < box.actMin;
    var gate = L().blocked(box);
    var sheet = sheetOf(box);
    var opts = L().menu(box, sheet);
    var menu = "<div class=\"loot-menu\" data-loot-menu=\"1\"><p><b>Select " + esc(box.name) + "</b></p>" +
      opts.map(function (o) {
        if (o.disabled) return "<p class=\"loot-stop\">" + esc(o.label) + "</p>";
        return "<button type=\"button\" class=\"btn sm\" data-loot-act=\"" + esc(o.id) + "\">" + esc(o.label) + "</button> ";
      }).join("") +
      (ui.view === "dm" ? "<p class=\"fine\">DM <button type=\"button\" class=\"btn xs\" data-loot-act=\"dm-unlock\">Pre-unlock</button> <button type=\"button\" class=\"btn xs\" data-loot-act=\"dm-clear-jam\">Clear jam</button> <button type=\"button\" class=\"btn xs\" data-loot-act=\"dm-open\">Open without a check</button></p>" : "") +
      "</div>";
    var rows = "<ul class=\"loot-rows\">" + (dmLines || "<li class=\"fine\">No item rows.</li>") + "</ul>" + cash;
    var body;
    if (sealed) {
      body = "<p class=\"loot-stop\"><b>Won't open.</b> Room Act " + c.act + " is under Act " + box.actMin + ". " + esc(box.label || "DO NOT OPEN, Act I") + "</p>";
    } else if (ui.view === "other") {
      body = otherSees ? rows : "<p class=\"loot-stop\"><b>" + esc(shortName(other) || "The other player") + "</b> does not see what is inside.</p>";
    } else if (gate && ui.view !== "dm") {
      body = menu + "<p class=\"fine\">Contents stay sealed until the check clears.</p>";
    } else if (gate && ui.view === "dm") {
      body = menu + (box.rolled ? rows : "<p class=\"fine\">Contents roll when it opens. The DM can open without a check.</p>");
    } else {
      body = (box.rolled ? rows : "<p class=\"fine\">Contents roll when someone opens it.</p>") + (opts.length ? menu : "");
    }
    var access = gate === "locked" ? ("Locked DC " + (box.lock && box.lock.dc)) : gate === "nailed" ? "Nailed" : gate === "hidden" ? ("Hidden DC " + (box.hideDc || 13)) : "Clear to open";
    var seen = gate
      ? (shortName(box.opener) + " is at the chest. The haul stays sealed until it opens.")
      : openerSees
      ? (shortName(box.opener) + " (opener) sees this haul." + (other ? " " + shortName(other) + (otherSees ? " sees it too." : " does not, until Share.") : ""))
      : "Nobody but the DM sees the rows yet.";
    host.innerHTML =
      "<article class=\"loot-card\">" +
      "<h3>" + esc(box.name) + (box.draft ? " · DRAFT" : "") + "</h3>" +
      "<p class=\"fine\">Opener: " + esc(shortName(box.opener) || "nobody") + " · " + esc(box.rollMode === "onOpen" ? "Roll on open" : "Pre-rolled") +
      " · " + esc(access) + " · reveal " + (box.shared ? "party" : "opener") + (box.xferId ? " · ledger " + esc(box.xferId) + " done" : "") + "</p>" +
      body +
      ((!sealed && box.rolled && !gate && ui.view !== "other")
        ? "<p class=\"loot-actions\"><button type=\"button\" class=\"btn sm\" id=\"btnLootTakeAll\">Take all</button> <button type=\"button\" class=\"btn sm\" id=\"btnLootShare\">Share with party</button></p>"
        : "") +
      "<label class=\"fine\">View as <select id=\"lootView\"><option value=\"opener\"" + (ui.view === "opener" ? " selected" : "") + ">Opener</option><option value=\"other\"" + (ui.view === "other" ? " selected" : "") + ">Other player</option><option value=\"dm\"" + (ui.view === "dm" ? " selected" : "") + ">DM</option></select></label>" +
      "<p class=\"fine\" id=\"lootSeen\">" + esc(seen) + "</p>" +
      (ui.view === "dm" ? "<p class=\"fine loot-log\">" + esc((box.log || []).join(" · ")) + "</p>" : "") +
      "</article>";
  }
  function ensureTables() {
    if (ui.ready) return ui.ready;
    var Loot = L();
    if (!Loot) return Promise.reject(new Error("Loot roller missing"));
    if (Loot.tableFor("saddlebag") && Loot.tableFor("saddlebag").rows) { ui.ready = Promise.resolve(); return ui.ready; }
    ui.ready = Loot.load("../assets/data/loot/");
    return ui.ready;
  }
  async function placeBox() {
    var Loot = L();
    if (!Loot) return;
    var who = openerId();
    if (!who || who === "all") { toast("Pick who opens it"); if (root.SSDNSGiveTab && root.SSDNSGiveTab.flashWho) root.SSDNSGiveTab.flashWho(); return; }
    await ensureTables();
    var type = ($("lootBoxType") && $("lootBoxType").value) || "saddlebag";
    var table = Loot.tableFor(type);
    if (!table) { toast("That box table isn't loaded"); return; }
    var c = ctx();
    var lf = $("lootLetterForce");
    if (lf && lf.value !== "" && lf.value !== "table") c.letterForce = Number(lf.value);
    var box = Loot.place(table, c);
    ui.boxes.unshift(box);
    if (root.SSDNSMapHost && root.SSDNSMapHost.pinLootChest) {
      try { root.SSDNSMapHost.pinLootChest(box); } catch (e) {}
    }
    ui.current = box.id;
    ui.view = "dm";
    paintCard();
    toast(box.rolled ? "Placed " + box.name : "Placed " + box.name + " (rolls on open)");
  }
  function sheetOf(box) {
    var pid = (box && box.opener) || openerId();
    var p = players()[pid];
    return (p && p.snapshot) || {};
  }
  function findBox(id) {
    var i;
    for (i = 0; i < ui.boxes.length; i++) if (ui.boxes[i].id === id) return ui.boxes[i];
    return null;
  }
  function liveRoll(label, mod) {
    var Sheet = root.SSDNSSheet;
    if (!Sheet || !Sheet.rollAdv || !Sheet.postCheck) return null;
    var rolled = Sheet.rollAdv(mod);
    Sheet.postCheck(label, rolled.formula, rolled.total, rolled.detail, rolled.nat === 1, false);
    return { nat: rolled.nat, total: rolled.total };
  }
  async function finishOpen(box, bypass) {
    await ensureTables();
    var Loot = L();
    var table = Loot.tableFor(box.boxType) || Loot.tableFor(box.tableId);
    var c = ctx();
    if (box.letterForce != null && box.letterForce !== "") c.letterForce = box.letterForce;
    if (bypass) c.bypass = true;
    var res = Loot.openBox(box, table, c);
    paintCard();
    refreshMapMenu(box);
    if (!res.ok) toast(res.reason);
    else if (bypass) toast("Opened without a check");
    return res;
  }
  function refreshMapMenu(box) {
    var mount = document.getElementById("mapMount");
    if (!mount || !box) return;
    var menu = mount.querySelector('[data-act="chestMenu"]');
    if (!menu || menu.hidden || menu.getAttribute("data-box") !== box.id) return;
    menu.innerHTML = menuHtml(box.id);
  }
  function menuHtml(boxId) {
    var box = findBox(boxId) || current();
    if (!box || !L()) return "";
    var opts = L().menu(box, sheetOf(box));
    var take = box.boxType === "enemy-drop" && !L().blocked(box)
      ? "<button type=\"button\" data-chest=\"take-all\">Take all</button> "
      : "";
    return "<p><b>" + esc(box.name) + "</b></p>" + take + opts.map(function (o) {
      if (o.disabled) return "<p>" + esc(o.label) + "</p>";
      return "<button type=\"button\" data-chest=\"" + esc(o.id) + "\">" + esc(o.label) + "</button> ";
    }).join("");
  }
  async function chestAct(boxId, action) {
    if (boxId) ui.current = boxId;
    var box = current();
    var Loot = L();
    if (!box || !Loot) return null;
    if (action === "dm-unlock") {
      Loot.preUnlock(box);
      paintCard();
      refreshMapMenu(box);
      toast("DM pre-unlocked");
      return null;
    }
    if (action === "dm-clear-jam") {
      Loot.clearJam(box);
      paintCard();
      refreshMapMenu(box);
      toast("Jam cleared");
      return null;
    }
    if (action === "dm-open") return finishOpen(box, true);
    if (action === "take-all") {
      if (box.boxType === "enemy-drop") {
        var who = openerId();
        if (who && who !== "all") box.opener = who;
        box.shared = true;
        box.reveal = "everyone";
      }
      await takeAll();
      refreshMapMenu(box);
      return null;
    }
    if (action === "open") {
      if (Loot.blocked(box)) { paintCard(); toast(Loot.blocked(box) === "locked" ? "Still locked." : "Still shut."); return null; }
      return finishOpen(box, false);
    }
    var sheet = sheetOf(box);
    var forced = null;
    var ask = action === "lockpick-yes" || action === "force" || action === "search" || (action === "pry" && !Loot.hasPry(sheet));
    if (ask) {
      var label = action === "lockpick-yes" ? "Lockpick" : (action === "search" ? "Perception" : "Strength");
      forced = liveRoll(label, Loot.checkMod(sheet, action));
    }
    var res = Loot.resolve(box, action, sheet, Math.random, forced || undefined);
    if (res.notice) toast(res.notice);
    if (res.reason && !res.ok) toast(res.reason);
    if (res.success && !Loot.blocked(box) && action !== "leave" && action !== "lockpick-no") await finishOpen(box, false);
    else { paintCard(); refreshMapMenu(box); }
    return res;
  }
  function applyRemote(msg) {
    if (!msg || !msg.boxId || msg.seq && ui.lastLootSeq === msg.seq) return;
    if (msg.seq) ui.lastLootSeq = msg.seq;
    var box = findBox(msg.boxId);
    if (!box || !L()) return;
    if (msg.action === "take-all") {
      if (msg.from) box.opener = msg.from;
      box.shared = true;
      box.reveal = "everyone";
      ui.current = box.id;
      takeAll();
      return;
    }
    L().resolve(box, msg.action, sheetOf(box), Math.random, { nat: msg.nat, total: msg.total });
    if (msg.success && !L().blocked(box)) finishOpen(box, false);
    else { paintCard(); refreshMapMenu(box); }
  }
  async function openCurrent() {
    var box = current();
    if (!box || !L()) return;
    if (L().blocked(box)) {
      paintCard();
      toast(ui.view === "dm" ? "Use the chest menu, or Open without a check." : "Select the chest. Lockpick? Yes or No.");
      return;
    }
    await finishOpen(box, false);
  }
  async function reroll() {
    var Loot = L();
    var box = current();
    if (!box || !Loot) return;
    if (box.actMin) { toast("A sealed crate has no roll"); return; }
    await ensureTables();
    var table = Loot.tableFor(box.boxType);
    var rolled = Loot.rollBox(table, ctx());
    box.contents = rolled.picks;
    box.cash = rolled.cash;
    box.log = ["DM reroll"].concat(rolled.log);
    box.rolled = true;
    box.taken = false;
    paintCard();
  }
  function hand() {
    var Loot = L();
    var box = current();
    var id = ($("lootHandId") && $("lootHandId").value || "").trim();
    if (!box) { toast("Place a box first"); return; }
    if (!id || !Loot) { toast("Type an item id"); return; }
    var res = Loot.handPlace(box, id, 1);
    paintCard();
    toast(res.row ? "DM placed " + res.row.name : "Placed");
  }
  async function send(result, box) {
    var dm = DM();
    if (!result.ok) { toast(result.reason || "Can't take that"); return; }
    box.xferId = result.ledger.id;
    if (dm && dm.pushLedger) await dm.pushLedger(result.ledger);
    var legs = result.xfer.legs || [];
    var i;
    for (i = 0; i < legs.length; i++) {
      var leg = legs[i];
      if (dm && dm.pushCommand) {
        await dm.pushCommand({
          id: leg.payload.grantId,
          type: leg.kind,
          to: box.opener,
          payload: leg.payload,
          from: dm.state && dm.state.uid,
          quiet: true
        });
      }
      if (dm && dm.state && dm.state.demo && leg.kind === "reward_es" && dm.applyEsToDemoPlayer) {
        await dm.applyEsToDemoPlayer(box.opener, leg.payload.delta);
      }
      if (dm && dm.state && dm.state.demo && leg.payload && leg.payload.ammo && root.SSDNSGiveTab && root.SSDNSGiveTab.demoAmmo) {
        var snap = players()[box.opener] && players()[box.opener].snapshot;
        root.SSDNSGiveTab.demoAmmo(snap, leg.payload.ammo, leg.payload.ammo.qty);
      }
    }
    if (result.warning) toast(result.warning);
    else toast("Take sent · " + result.ledger.id + " done");
    paintCard();
    if (dm && dm.renderPlayers) dm.renderPlayers();
  }
  async function takeAll() {
    var box = current();
    if (!box || !L()) return;
    var snap = players()[box.opener] && players()[box.opener].snapshot;
    await send(L().takeAll(box, box.opener, snap), box);
  }
  async function takeOne(index) {
    var box = current();
    if (!box || !L()) return;
    var row = (box.contents || [])[index];
    if (!row) return;
    var snap = players()[box.opener] && players()[box.opener].snapshot;
    await send(L().takeRows(box, box.opener, [row], snap), box);
  }
  function share() {
    var box = current();
    if (!box) return;
    box.shared = true;
    box.reveal = "everyone";
    box.log = (box.log || []).concat(["Shared with the party"]);
    var dm = DM();
    if (dm && dm.pushCommand) {
      dm.pushCommand({
        type: "loot_share",
        to: "all",
        quiet: true,
        payload: { boxId: box.id, name: box.name, opener: box.opener }
      });
    }
    paintCard();
    toast("Shared with the party");
  }
  function wire() {
    var panel = $("panel-rewards");
    if (!panel || panel.getAttribute("data-loot-give")) return;
    panel.setAttribute("data-loot-give", "1");
    panel.addEventListener("click", function (e) {
      var t = e.target;
      if (!t) return;
      if (t.id === "btnLootPlace") placeBox();
      else if (t.id === "btnLootOpen") openCurrent();
      else if (t.id === "btnLootReroll") reroll();
      else if (t.id === "btnLootHand") hand();
      else if (t.id === "btnLootTakeAll") takeAll();
      else if (t.id === "btnLootShare") share();
      else if (t.id === "btnLootLeave") chestAct(ui.current, "leave");
      else if (t.getAttribute && t.getAttribute("data-loot-act")) chestAct(ui.current, t.getAttribute("data-loot-act"));
      else if (t.getAttribute && t.getAttribute("data-loot-take") != null) takeOne(parseInt(t.getAttribute("data-loot-take"), 10));
    });
    panel.addEventListener("change", function (e) {
      if (!e.target) return;
      if (e.target.id === "lootView") { ui.view = e.target.value; paintCard(); }
      if (e.target.id === "lootChapter" || e.target.id === "lootAct") paintBudget();
      if (e.target.id === "lootRareOverride") {
        var box = current();
        if (box && e.target.checked) box.log = (box.log || []).concat(["DM Rare-limit override"]);
        paintCard();
      }
    });
    ensureTables().then(paintCard).catch(function (err) {
      var host = $("lootCard");
      if (host) host.textContent = err.message || "Loot tables failed to load";
    });
  }
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire);
    else wire();
  }
  function adopt(box) {
    if (!box || !box.id) return null;
    if (!findBox(box.id)) ui.boxes.unshift(box);
    ui.current = box.id;
    ui.view = "dm";
    paintCard();
    return box;
  }
  root.SSDNSLootGive = {
    paint: paintCard,
    adopt: adopt,
    boxes: function () { return ui.boxes.slice(); },
    box: findBox,
    current: current,
    chestAct: chestAct,
    menuHtml: menuHtml,
    applyRemote: applyRemote,
    selectBox: function (id) { ui.current = id; paintCard(); }
  };
})(typeof window !== "undefined" ? window : globalThis);

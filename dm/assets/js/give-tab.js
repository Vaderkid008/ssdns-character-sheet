/* DMCC Give tab (0.2.121, Jessey 2026-10-22: the 13 Give fixes + a Loot placeholder).
   1 Who: player cards (calling, ES, online) drive the hidden #rewTarget, so handouts, packs, private messages,
     the custom item form and the inventory panel all give to the same person. Nobody is picked at the start.
   2 What: one row (Money / Ammo / Item / Weapon / Starting kit / Note / Loot) drives the hidden #rewType.
   3 How many + the preview line ("Jolene gets 20 Light cartridges, Light cartridges pool 20 to 40, fits Jolene's
     Blacksnake") and a button that says what it does ("Give 20 Light cartridges to Jolene").
   4 Recent gives: each with its own Undo and a check mark once the sheet writes players/<uid>/grantAcks/<id>
     (the same player-owned node as handoutAck / turnAck, so no rules change).
   The send itself is dmcc.js doPushReward. Pure helpers are at the top (node-testable: SSDNSGiveTab.pure). */
(function (root) {
  "use strict";

  /* ---------------- pure ---------------- */
  var CART = {
    Light: [".22 LR", ".32 Long", ".32 rimfire", ".44 rimfire"],
    Medium: [".357", ".44-40"],
    Heavy: [".45 Long", ".45-70"]
  };
  var GAUGES = [".410", "12 ga", "10 ga"];
  function arrowTypes() {
    var T = root.SSDNSTrackers && root.SSDNSTrackers.ARROW_TYPES;
    return T && T.length ? T : [{ id: "standard", name: "Standard" }];
  }
  function extraTypes() {
    var X = root.SSDNSTrackers && root.SSDNSTrackers.AMMO_EXTRA;
    return X && X.length ? X : [{ id: "bolts", label: "Crossbow bolts" }, { id: "stones", label: "Sling stones / bullets" }, { id: "needles", label: "Blowpipe needles" }];
  }
  /** Every ammo the guns in the catalog use, keyed type|caliber (the sheet's Ammo pool keys). */
  function ammoCatalog() {
    var out = [];
    ["Light", "Medium", "Heavy"].forEach(function (t) {
      out.push({ key: "cartridge|" + t, type: "cartridge", caliber: t, label: t + " cartridges", hint: CART[t].join(", "), group: "Cartridges" });
    });
    out.push({ key: "bigfifty|.50-90", type: "bigfifty", caliber: ".50-90", label: "Big Fifty rounds (.50-90)", hint: "Big Fifty, Caster Guns", group: "Cartridges" });
    GAUGES.forEach(function (g) { out.push({ key: "buck|" + g, type: "buck", caliber: g, label: g + " buckshot shells", hint: "shotguns", group: "Shells" }); });
    GAUGES.forEach(function (g) { out.push({ key: "slug|" + g, type: "slug", caliber: g, label: g + " slug shells", hint: "shotguns", group: "Shells" }); });
    out.push({ key: "percussion|", type: "percussion", caliber: "", label: "Powder, ball & caps (shots)", hint: "cap & ball guns", group: "Cap & ball" });
    arrowTypes().forEach(function (a) {
      var cal = a.id === "standard" ? "" : a.id;
      out.push({ key: "arrows|" + cal, type: "arrows", caliber: cal, label: a.id === "standard" ? "Arrows" : a.name + " arrows", hint: a.made ? "made, not sold" : "bows", group: "Bows" });
    });
    extraTypes().forEach(function (x) { out.push({ key: x.id + "|", type: x.id, caliber: "", label: x.label, hint: "", group: "Other" }); });
    return out;
  }
  function norm(s) { return String(s == null ? "" : s).trim().toLowerCase(); }
  function words(t) { return norm(t).replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean); }
  function rulesRow(g) {
    var R = root.SSDNS_RULES || {};
    var lists = [].concat(R.casterGuns || [], R.firearms || [], R.otherRanged || []);
    var id = norm(g.weapon || g.weaponId), name = norm(g.name);
    var hit = lists.filter(function (r) { return r && ((id && norm(r.id) === id) || (name && norm(r.name) === name)); })[0];
    if (hit) return hit;
    var have = {}; words((g.weapon || "") + " " + (g.name || "")).forEach(function (w) { have[w] = 1; });
    var best = null, n = 0;
    lists.forEach(function (r) {
      if (!r || !r.name) return;
      var need = words(r.name);
      if (need.length < 2 && !(need.length === 1 && have[need[0]])) return;
      if (need.every(function (w) { return have[w]; }) && need.length > n) { best = r; n = need.length; }
    });
    return best;
  }
  function isCaster(g, row) {
    var R = root.SSDNS_RULES || {};
    if (g && g.caster) return true;
    return !!(row && (R.casterGuns || []).some(function (c) { return c && c.id === row.id; })) || !!(row && row.hexShells);
  }
  /** The pool keys one snapshot gun takes. */
  function gunKeys(g) {
    g = g || {};
    var row = rulesRow(g);
    var ammo = norm(g.ammo || (row && row.ammo) || g.load);
    var rounds = (row && row.rounds) || {};
    var tier = norm(g.tier);
    var keys = [];
    if (isCaster(g, row)) return ["cartridge|Light", "cartridge|Medium", "cartridge|Heavy", "bigfifty|.50-90"];
    if (ammo === "cartridge") {
      var tiers = tier ? [tier] : Object.keys(rounds);
      if (!tiers.length) tiers = ["light", "medium", "heavy"];
      tiers.forEach(function (t) { var T = t.charAt(0).toUpperCase() + t.slice(1); if (CART[T]) keys.push("cartridge|" + T); });
      return keys;
    }
    if (ammo === "bigfifty") return ["bigfifty|.50-90"];
    if (ammo === "percussion" || ammo === "cap" || ammo === "cap & ball") return ["percussion|"];
    if (ammo === "shell" || ammo === "buck" || ammo === "slug" || g.scatter || (row && row.scatter)) {
      var gs = [];
      Object.keys(rounds).forEach(function (t) { if (!tier || t === tier) (rounds[t] || []).forEach(function (c) { if (GAUGES.indexOf(c) >= 0) gs.push(c); }); });
      if (!gs.length) gs = GAUGES.slice();
      gs.forEach(function (c) { keys.push("buck|" + c); });
      gs.forEach(function (c) { keys.push("slug|" + c); });
      return keys;
    }
    if (ammo === "arrows") return arrowTypes().map(function (a) { return "arrows|" + (a.id === "standard" ? "" : a.id); });
    if (ammo === "sling stones" || ammo === "stones") return ["stones|"];
    if (ammo === "bolts" || ammo === "crossbow bolts") return ["bolts|"];
    if (ammo === "needles") return ["needles|"];
    return keys;
  }
  function gunShort(g) {
    var n = String((g && g.name) || "gun").replace(/^Pony Arms\s+/i, "").replace(/\s*\((Light|Medium|Heavy)\)$/i, "");
    return n;
  }
  /** {fits: [opt + guns[]], rest: [opt]} for one snapshot. showAll keeps every catalog ammo in the list. */
  function ammoOptions(snap, showAll) {
    var cat = ammoCatalog();
    var by = {};
    ((snap && snap.guns) || []).forEach(function (g) {
      if (!g || !g.name) return;
      gunKeys(g).forEach(function (k) { (by[k] = by[k] || []).push(gunShort(g)); });
    });
    var fits = [], rest = [];
    cat.forEach(function (o) {
      var row = Object.assign({}, o, { guns: by[o.key] || [], have: poolCount(snap, o) });
      if (row.guns.length) fits.push(row); else rest.push(row);
    });
    return { fits: fits, rest: showAll ? rest : rest.filter(function (o) { return o.have > 0; }), all: cat };
  }
  function samePool(a, o) {
    if (!a || a.type !== o.type) return false;
    if (o.type === "arrows") {
      var ac = norm(a.caliber); if (ac === "standard") ac = "";
      return ac === norm(o.caliber);
    }
    return norm(a.caliber) === norm(o.caliber);
  }
  function poolCount(snap, o) {
    var n = 0;
    ((snap && snap.ammo) || []).forEach(function (a) { if (samePool(a, o)) n += Number(a.count) || 0; });
    return n;
  }
  function byKey(key) { return ammoCatalog().filter(function (o) { return o.key === key; })[0] || null; }
  function shortName(snap, pid) {
    var n = String((snap && (snap.name || snap.player)) || pid || "them").replace(/["“”].*?["“”]/g, " ").trim();
    return n.split(/\s+/)[0] || n;
  }
  function num(n) { var v = Number(n) || 0; try { return v.toLocaleString("en-US"); } catch (e) { return String(v); } }
  function list(names) {
    if (names.length <= 1) return names.join("");
    return names.slice(0, -1).join(", ") + " and " + names[names.length - 1];
  }
  /* "Light cartridges" for a count: 1 Light cartridge, 20 Light cartridges */
  function ammoWhat(o, qty) {
    var label = o.label;
    if (Number(qty) === 1) label = label.replace(/cartridges\b/, "cartridge").replace(/shells\b/, "shell").replace(/rounds\b/, "round").replace(/^Arrows$/, "Arrow").replace(/ arrows$/, " arrow");
    return qty + " " + label;
  }
  /**
   * The plan for one give: what the line, the button and the confirm say, and the numbers to send.
   * ctx = { mode, target, players, es, reason, ammoKey, ammoQty, text, qty, match, weapon, weaponDirty }
   */
  function describe(ctx) {
    var players = ctx.players || {};
    var all = ctx.target === "all";
    var pids = all ? Object.keys(players) : (ctx.target && players[ctx.target] ? [ctx.target] : []);
    var snapOf = function (pid) { return (players[pid] && players[pid].snapshot) || {}; };
    var whoShort = all ? "everyone" : (pids[0] ? shortName(snapOf(pids[0]), pids[0]) : "");
    var out = { pids: pids, error: "", line: "", button: "", confirm: "", what: "", done: "" };
    if (!ctx.target) { out.error = "Pick who gets it first"; out.button = "Pick who gets it"; return out; }
    if (!pids.length) { out.error = all ? "Nobody is at the table yet" : "Pick who gets it first"; out.button = "Pick who gets it"; return out; }
    var mode = ctx.mode || "";
    if (!mode) { out.error = "Pick what to give"; out.button = "Pick what to give"; return out; }
    var each = all ? " each" : "";
    var reason = String(ctx.reason || "").trim();
    if (mode === "es") {
      var d = parseInt(ctx.es, 10) || 0;
      if (!d) { out.error = "Enter how much ES"; out.button = "Enter how much ES"; return out; }
      var r = reason || "DM reward";
      out.what = (d > 0 ? "+" : "−") + num(Math.abs(d)) + " ES";
      var parts = pids.map(function (pid) {
        var s = snapOf(pid), b = Number(s.es) || 0;
        return (all ? shortName(s, pid) + " " : "ES ") + num(b) + " to " + num(Math.max(0, b + d));
      });
      out.line = (d > 0 ? (all ? "Everyone gets " : whoShort + " gets ") + num(d) + " ES" + each : "The DM takes " + num(-d) + " ES from " + (all ? "everyone" : whoShort)) +
        " (" + r + "). " + parts.join(" · ") + ".";
      out.button = d > 0 ? "Give " + num(d) + " ES to " + (all ? "everyone" : whoShort) : "Take " + num(-d) + " ES from " + (all ? "everyone" : whoShort);
      out.confirm = (d > 0 ? "Gives " + num(d) + " ES to each of " : "Takes " + num(-d) + " ES from each of ") + "the " + pids.length + " players (" + r + ").";
      out.done = out.what + " \u201c" + r + "\u201d";
      out.es = d; out.reason = r;
      return out;
    }
    if (mode === "ammo") {
      var o = byKey(ctx.ammoKey);
      var q = Math.floor(Number(ctx.ammoQty) || 0);
      if (!o) { out.error = "Pick the ammo"; out.button = "Pick the ammo"; return out; }
      if (!(q > 0)) { out.error = "Enter how many"; out.button = "Enter how many"; return out; }
      out.ammo = { type: o.type, caliber: o.caliber, qty: q, label: o.label, key: o.key };
      out.what = ammoWhat(o, q);
      var bits = pids.map(function (pid) {
        var s = snapOf(pid), b = poolCount(s, o);
        var fit = [];
        ((s.guns) || []).forEach(function (g) { if (g && g.name && gunKeys(g).indexOf(o.key) >= 0) fit.push(gunShort(g)); });
        var nm = shortName(s, pid);
        return { name: nm, before: b, after: b + q, fit: fit };
      });
      if (all) {
        out.line = "Everyone gets " + out.what + each + ". " + bits.map(function (x) { return x.name + " " + x.before + " to " + x.after + (x.fit.length ? "" : " (no gun for it)"); }).join(" · ") + ".";
      } else {
        var x = bits[0];
        out.line = x.name + " gets " + out.what + ", " + o.label + " pool " + x.before + " to " + x.after + ", " +
          (x.fit.length ? "fits " + x.name + "'s " + list(x.fit) + "." : "none of " + x.name + "'s guns take it.");
      }
      out.button = "Give " + out.what + " to " + (all ? "everyone" : whoShort);
      out.confirm = "Gives " + out.what + " to each of the " + pids.length + " players.";
      out.done = out.what + (reason ? " \u201c" + reason + "\u201d" : "");
      return out;
    }
    if (mode === "item") {
      var t = String(ctx.text || "").trim();
      var n = Math.max(1, Math.floor(Number(ctx.qty) || 1));
      if (!t) { out.error = "Name the item"; out.button = "Name the item"; return out; }
      var m = ctx.match || {};
      var lands = m.kind === "ammo" ? "it fills the Ammo pool" : (m.kind === "weapon" ? "it lands in a weapon slot" : (m.kind ? "catalog item" : "new item (pick its type and weight below)"));
      var count = m.kind === "ammo" && m.ammo ? (m.ammo.qty || 1) * n : n;
      out.what = (count > 1 ? count + " × " : "") + t.replace(/^\s*\d+\s*x\s+/i, "");
      out.line = (all ? "Everyone gets " : whoShort + " gets ") + out.what + each + " (" + lands + ").";
      out.button = "Give " + out.what + " to " + (all ? "everyone" : whoShort);
      out.confirm = "Gives " + out.what + " to each of the " + pids.length + " players.";
      out.done = out.what + (reason ? " \u201c" + reason + "\u201d" : "");
      return out;
    }
    if (mode === "weapon") {
      var w = ctx.weapon;
      if (!String(ctx.text || "").trim()) { out.error = "Name the weapon"; out.button = "Name the weapon"; return out; }
      if (!w) { out.error = "No weapon by that name. Pick one from the list, or use Custom weapon…"; out.button = "Pick a weapon from the list"; return out; }
      out.weapon = { id: w.id, name: w.name, dirty: !!ctx.weaponDirty };
      out.what = w.name + (ctx.weaponDirty ? " (Dirty)" : "");
      out.line = (all ? "Everyone gets " : whoShort + " gets ") + out.what + each + " in a free " + (w.melee ? "melee" : "weapon") + " slot.";
      out.button = "Give " + w.name + " to " + (all ? "everyone" : whoShort);
      out.confirm = "Gives " + out.what + " to each of the " + pids.length + " players.";
      out.done = out.what;
      return out;
    }
    if (mode === "kit") {
      var no = pids.filter(function (pid) { var s = snapOf(pid); return !(s.callingId || s.calling); });
      if (no.length === pids.length) { out.error = (all ? "Nobody" : whoShort) + " has a calling yet, so there's no kit to give"; out.button = "No calling yet"; return out; }
      var had = pids.filter(function (pid) { var s = snapOf(pid); return s.kitMode === "full" || s.kitFull; });
      out.what = "the Full kit";
      out.line = (all ? "Everyone gets the Full kit for their calling" : whoShort + " gets the Full kit for " + (snapOf(pids[0]).calling || "their calling")) +
        ". Anything they already have isn't given twice." + (had.length ? " " + list(had.map(function (pid) { return shortName(snapOf(pid), pid); })) + " already show the Full kit, so this may add nothing." : "");
      out.button = "Give the Full kit to " + (all ? "everyone" : whoShort);
      out.confirm = "Gives each of the " + pids.length + " players the Full kit for their calling. Nothing they already have is given twice.";
      out.done = "the Full kit";
      return out;
    }
    if (mode === "note") {
      var nt = String(ctx.text || "").trim();
      if (!nt) { out.error = "Write the note"; out.button = "Write the note"; return out; }
      out.what = "a note";
      out.line = (all ? "Everyone gets" : whoShort + " gets") + " a note: \u201c" + (nt.length > 80 ? nt.slice(0, 77) + "…" : nt) + "\u201d";
      out.button = "Send the note to " + (all ? "everyone" : whoShort);
      out.confirm = "Sends the note to all " + pids.length + " players.";
      out.done = "a note";
      return out;
    }
    if (mode === "loot") { out.error = "Loot is coming later"; out.button = "Loot is coming later"; out.line = ""; return out; }
    out.error = "Pick what to give"; out.button = "Pick what to give";
    return out;
  }
  function ackKey(id) { return String(id || "").replace(/[.#$\[\]\/]/g, "_"); }
  /** {seen, of} for one recent give: how many sheets wrote their grantAck. */
  function ackCount(rec, players, undo) {
    var seen = 0, of = 0;
    (undo ? rec.undoGrants || [] : rec.grants || []).forEach(function (g) {
      of++;
      var p = players && players[g.pid];
      var acks = p && p.grantAcks;
      if (acks && acks[ackKey(g.gid)]) seen++;
    });
    return { seen: seen, of: of };
  }
  /* demo: the DMCC's copy of the sheet's Ammo pool (the real sheet sends its own snapshot) */
  function demoAmmo(snap, o, delta) {
    if (!snap) return;
    snap.ammo = Array.isArray(snap.ammo) ? snap.ammo : [];
    var p = snap.ammo.filter(function (a) { return samePool(a, o); })[0];
    if (!p) { p = { type: o.type, caliber: o.caliber || "", count: 0 }; snap.ammo.push(p); }
    p.count = Math.max(0, (Number(p.count) || 0) + Number(delta || 0));
  }
  /** Weapons the DM can give by name (rules lists), for the Weapon mode list. */
  function weaponList() {
    var R = root.SSDNS_RULES || {};
    var out = [];
    [["firearms", false], ["casterGuns", false], ["otherRanged", false], ["melee", true]].forEach(function (pair) {
      (R[pair[0]] || []).forEach(function (w) { if (w && w.id && w.name) out.push({ id: w.id, name: w.name, melee: pair[1] }); });
    });
    return out;
  }
  function findWeapon(text) {
    var t = norm(text);
    if (!t) return null;
    var W = weaponList();
    var hit = W.filter(function (w) { return norm(w.name) === t || norm(w.id) === t; })[0];
    if (hit) return hit;
    var I = root.SSDNSItems;
    var m = I && I.rewardMatch ? I.rewardMatch(text) : null;
    if (m && m.kind === "weapon" && m.id) return W.filter(function (w) { return w.id === m.id; })[0] || null;
    return null;
  }

  var pure = { ammoCatalog: ammoCatalog, ammoOptions: ammoOptions, gunKeys: gunKeys, poolCount: poolCount, samePool: samePool, byKey: byKey,
    describe: describe, shortName: shortName, ackKey: ackKey, ackCount: ackCount, demoAmmo: demoAmmo, weaponList: weaponList, findWeapon: findWeapon, ammoWhat: ammoWhat };

  /* ---------------- DOM ---------------- */
  var ui = { mode: "", custom: false, showAll: false, recent: [], loadedFor: "" };
  function D() { return root.DMCC; }
  function st() { return (D() && D().state) || {}; }
  function $(id) { return typeof document !== "undefined" ? document.getElementById(id) : null; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function players() { return st().players || {}; }
  function target() { var el = $("rewTarget"); return el ? el.value : ""; }
  function snapOf(pid) { var p = players()[pid]; return (p && p.snapshot) || {}; }
  function online(pid) { var p = players()[pid]; var on = D() && D().playerOnline ? D().playerOnline(p) : !!(p && p.presence && p.presence.online); return on; }
  function storeKey() { return "ssdns.dm.recentGives." + (st().roomCode || "none"); }
  function loadRecent() {
    var k = storeKey();
    if (ui.loadedFor === k) return;
    ui.loadedFor = k;
    try { ui.recent = JSON.parse(sessionStorage.getItem(k) || "[]") || []; } catch (e) { ui.recent = []; }
  }
  function saveRecent() { try { sessionStorage.setItem(storeKey(), JSON.stringify(ui.recent.slice(0, 12))); } catch (e) {} }

  function ctx() {
    var I = root.SSDNSItems;
    var text = ui.mode === "weapon" ? ($("giveWeapon") || {}).value : ($("rewText") || {}).value;
    return {
      mode: ui.mode, target: target(), players: players(),
      es: ($("rewEs") || {}).value, reason: ($("rewReason") || {}).value,
      ammoKey: ($("giveAmmo") || {}).value, ammoQty: ($("giveAmmoQty") || {}).value,
      text: text || "", qty: ($("rewQty") || {}).value,
      match: ui.mode === "item" && I && I.rewardMatch ? I.rewardMatch(text || "") : null,
      weapon: ui.mode === "weapon" ? findWeapon(text || "") : null,
      weaponDirty: !!($("giveWeaponDirty") || {}).checked
    };
  }
  function plan() { return describe(ctx()); }

  function whoCards() {
    var box = $("giveWho");
    if (!box) return;
    var P = players(), ids = Object.keys(P), t = target();
    var cards = ids.map(function (pid) {
      var s = snapOf(pid), on = online(pid);
      var sub = [s.calling ? s.calling + (s.level ? " " + s.level : "") : "", num(s.es) + " ES", on ? "online" : "offline"].filter(Boolean).join(" · ");
      return '<button type="button" class="give-who-card' + (t === pid ? " on" : "") + (on ? "" : " off") + '" role="radio" aria-checked="' + (t === pid) + '" data-give-who="' + esc(pid) + '">' +
        '<b>' + esc(s.name || s.player || pid) + "</b><span>" + esc(sub) + "</span></button>";
    });
    if (ids.length) cards.push('<button type="button" class="give-who-card all' + (t === "all" ? " on" : "") + '" role="radio" aria-checked="' + (t === "all") + '" data-give-who="all"><b>Everyone</b><span>' + ids.length + " player" + (ids.length === 1 ? "" : "s") + " · asks first</span></button>");
    var html = cards.join("") || '<p class="fine">No players at the table yet.</p>';
    if (box.getAttribute("data-html") !== html) { box.innerHTML = html; box.setAttribute("data-html", html); }
    var carry = $("giveWhoCarry");
    if (carry) carry.textContent = carryLine(t);
  }
  function carryLine(t) {
    if (!t) return "Pick who gets it. Nobody is picked until you tap one.";
    if (t === "all") return "Everyone: " + Object.keys(players()).map(function (pid) { return shortName(snapOf(pid), pid); }).join(", ") + ". You confirm before it goes out.";
    var s = snapOf(t), nm = shortName(s, t);
    var guns = (s.guns || []).filter(function (g) { return g && g.name; }).map(function (g) { return gunShort(g) + (g.capacity ? " (" + (Number(g.loaded) || 0) + "/" + g.capacity + ")" : ""); });
    var am = (s.ammo || []).filter(function (a) { return a && Number(a.count) > 0; }).map(function (a) {
      var o = ammoCatalog().filter(function (x) { return samePool(a, x); })[0];
      return (o ? o.label : a.type + (a.caliber ? " " + a.caliber : "")) + " " + a.count;
    });
    var bits = [];
    if (guns.length) bits.push(guns.join(", "));
    bits.push(am.length ? "Ammo: " + am.join(", ") : "No ammo");
    if (s.carry && s.carry.capacity) bits.push(Math.max(0, Math.round((Number(s.carry.capacity) - Number(s.carry.carried || 0)) * 10) / 10) + " lb free");
    return nm + " carries " + bits.join(" · ");
  }
  function fillAmmo() {
    var sel = $("giveAmmo");
    if (!sel) return;
    var t = target();
    var snap = t && t !== "all" ? snapOf(t) : null;
    var opts;
    if (!snap) {
      var cat = ammoCatalog();
      if (t === "all" && !ui.showAll) {
        var keys = {};
        Object.keys(players()).forEach(function (pid) { (snapOf(pid).guns || []).forEach(function (g) { gunKeys(g).forEach(function (k) { keys[k] = 1; }); }); });
        var fit = cat.filter(function (o) { return keys[o.key]; });
        opts = { fits: fit, rest: [] };
      } else opts = { fits: [], rest: cat };
    } else opts = ammoOptions(snap, ui.showAll);
    var keep = sel.value;
    var optHtml = function (o) {
      var bits = [];
      if (o.hint && o.type === "cartridge") bits.push(o.hint);
      if (o.guns && o.guns.length) bits.push("fits " + o.guns.join(", "));
      if (o.have) bits.push("has " + o.have);
      return '<option value="' + esc(o.key) + '">' + esc(o.label + (bits.length ? " (" + bits.join(" · ") + ")" : "")) + "</option>";
    };
    var html = "";
    if (opts.fits.length) html += '<optgroup label="' + esc(snap ? "Fits " + shortName(snap, t) + "'s guns" : "Fits their guns") + '">' + opts.fits.map(optHtml).join("") + "</optgroup>";
    if (opts.rest.length) html += '<optgroup label="' + esc(snap ? (ui.showAll ? "All other ammo" : "Already carried") : "All ammo") + '">' + opts.rest.map(optHtml).join("") + "</optgroup>";
    if (!html) html = '<option value="">No gun takes ammo. Tick Show all ammo.</option>';
    if (sel.getAttribute("data-html") !== html) { sel.innerHTML = html; sel.setAttribute("data-html", html); }
    if (keep && [].some.call(sel.options, function (o) { return o.value === keep; })) sel.value = keep;
  }
  function fillWeapons() {
    var dl = $("giveWeaponList");
    if (!dl || dl.getAttribute("data-filled")) return;
    var W = weaponList();
    if (!W.length) return;
    dl.innerHTML = W.map(function (w) { return '<option value="' + esc(w.name) + '"></option>'; }).join("");
    dl.setAttribute("data-filled", "1");
  }
  function showFor(mode) {
    if (typeof document === "undefined") return;
    document.querySelectorAll("#panel-rewards [data-give-show]").forEach(function (el) {
      var on = (" " + el.getAttribute("data-give-show") + " ").indexOf(" " + mode + " ") >= 0;
      el.hidden = !on;
    });
    document.querySelectorAll("#panel-rewards [data-give-mode]").forEach(function (b) {
      var on = b.getAttribute("data-give-mode") === mode;
      b.classList.toggle("btn-primary", on);
      b.setAttribute("aria-checked", on ? "true" : "false");
    });
    var lbl = $("rewTextLabel");
    if (lbl) lbl.textContent = mode === "note" ? "Note (they see it as a pop-up)" : "Item";
    var tx = $("rewText");
    if (tx) tx.placeholder = mode === "note" ? "You find a letter tucked in the saddlebag…" : "Gun cleaning kit, Bowie knife, Hardtack…";
    paintSupply();
    var wrap = $("dmItemFormWrap");
    if (wrap) wrap.hidden = !(ui.custom && (mode === "item" || mode === "weapon"));
    var cb = $("btnCustomItem");
    if (cb) { cb.setAttribute("aria-expanded", ui.custom && mode === "item" ? "true" : "false"); cb.textContent = ui.custom && mode === "item" ? "Hide custom item" : "Custom item…"; }
    var cw = $("btnCustomWeapon");
    if (cw) cw.textContent = ui.custom && mode === "weapon" ? "Hide custom weapon" : "Custom weapon…";
  }
  /* fix 12: Food & water only for supplies (the box is ticked, or the item is food / water) */
  function paintSupply() {
    var wrap = $("rewSupplyWrap");
    if (!wrap) return;
    var on = ui.mode === "item" && !!($("giveSupplyOn") || {}).checked;
    if (!on && ui.mode === "item") {
      var I = root.SSDNSItems, m = I && I.rewardMatch ? I.rewardMatch(($("rewText") || {}).value || "") : null;
      var row = m && m.id && I.byId ? I.byId(m.id) : null;
      var tags = (row && row.tags) || [];
      if (tags.indexOf("food") >= 0 || tags.indexOf("water") >= 0 || (row && (row.meals || row.water || row.capacity))) { on = true; var box = $("giveSupplyOn"); if (box) box.checked = true; }
    }
    if (wrap.hidden === !on) return;
    wrap.hidden = !on;
    if (!on) ["rewTags", "rewMeals", "rewWater", "rewCapacity", "rewWeight"].forEach(function (id) { var el = $(id); if (el) el.value = ""; });
  }
  function setMode(m, fromSelect) {
    ui.mode = m || "";
    var sel = $("rewType");
    if (sel && !fromSelect && sel.value !== ui.mode) { sel.value = ui.mode; sel.dispatchEvent(new Event("change", { bubbles: true })); return; }
    showFor(ui.mode);
    if (ui.mode === "ammo") fillAmmo();
    if (ui.mode === "weapon") fillWeapons();
    paintPreview();
  }
  function paintPreview() {
    var p = plan();
    var box = $("givePreview");
    if (box) {
      var line = p.line || (p.error && ui.mode && target() ? p.error + "." : "");
      box.hidden = !line;
      box.textContent = line;
      box.classList.toggle("warn", !p.line);
    }
    paintButton(p);
    var wm = $("giveWeaponMatch");
    if (wm && ui.mode === "weapon") {
      var c = ctx();
      wm.textContent = !c.text ? "" : (c.weapon ? "Lands as: " + c.weapon.name + (c.weapon.melee ? " (melee slot)" : " (gun card)") : "No weapon by that name. Pick one from the list, or use Custom weapon…");
    }
    var dirty = $("giveWeaponDirty");
    if (dirty && dirty.parentNode && ui.mode === "weapon") { var cw = ctx().weapon; dirty.parentNode.hidden = !!(cw && cw.melee); }
  }
  function paintButton(p) {
    p = p || plan();
    var btn = $("btnPushReward");
    if (!btn) return;
    btn.textContent = p.button || "Give";
    btn.disabled = !!p.error;
    btn.setAttribute("data-give-ready", p.error ? "0" : "1");
  }
  function paintMore() {
    var t = target();
    var nm = !t ? "" : (t === "all" ? "everyone" : shortName(snapOf(t), t));
    var line = $("giveMoreTo");
    if (line) line.textContent = !t ? "Pick who gets it at the top first. Handouts, packs and messages go to the player picked in Who." : "These go to " + (t === "all" ? "everyone at the table" : nm) + " (picked in Who at the top).";
    ["hoTarget", "packTarget", "msgTarget"].forEach(function (id) {
      var el = $(id);
      if (!el) return;
      var host = el.closest ? el.closest("div") : null;
      if (host && host.parentNode && host.parentNode.classList && host.parentNode.classList.contains("form-grid")) host.hidden = true;
      var want = t === "all" && id === "msgTarget" ? "" : t;
      if ([].some.call(el.options, function (o) { return o.value === want; })) el.value = want;
    });
    var ho = $("btnSendHandout");
    if (ho) { ho.textContent = t ? "Send handout to " + nm : "Send handout (pick who first)"; ho.disabled = !t; }
    var msg = $("btnSendMsg");
    if (msg) { msg.textContent = t && t !== "all" ? "Send private message to " + nm : (t === "all" ? "Private messages go to one player" : "Send private message (pick who first)"); msg.disabled = !t || t === "all"; }
  }
  function timeOf(iso) { try { return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); } catch (e) { return ""; } }
  function paintRecent() {
    var box = $("giveRecent");
    if (!box) return;
    loadRecent();
    if (!ui.recent.length) { box.innerHTML = '<p class="fine">Recent gives show here, each with its own Undo. A check mark means their sheet got it.</p>'; return; }
    var P = players(), demo = !!st().demo;
    box.innerHTML = '<h3 class="give-step">Recent gives</h3><ul class="give-recent-list">' + ui.recent.map(function (r) {
      var a = ackCount(r, P, false), u = r.undone ? ackCount(r, P, true) : null;
      var ok = a.of && a.seen === a.of;
      var state = r.undone ? ("undone" + (u && u.of ? (u.seen === u.of ? " · ✓ off their sheet" : " · undo sent") : "")) :
        (demo ? "sent (demo: no sheet to confirm)" : (ok ? "✓ on " + (a.of > 1 ? "all " + a.of + " sheets" : "their sheet") : (a.seen ? "✓ " + a.seen + " of " + a.of + " sheets" : "sent, waiting for their sheet")));
      var undo = r.undone ? "" : (r.undo ? '<button type="button" class="btn xs" data-give-undo="' + esc(r.id) + '">Undo</button>' : '<span class="fine">' + esc(r.noUndo || "no undo") + "</span>");
      return '<li class="give-row' + (ok && !r.undone ? " ok" : "") + (r.undone ? " undone" : "") + '" data-give-row="' + esc(r.id) + '"><span class="give-tick" aria-hidden="true">' + (ok && !r.undone ? "✓" : "·") + "</span> " +
        "<span>" + esc(timeOf(r.ts)) + " · " + esc(r.text) + ' · <span class="give-state">' + esc(state) + "</span></span> " + undo + "</li>";
    }).join("") + "</ul>";
  }
  function recLine(rec) {
    var P = players();
    var who = rec.to === "all" ? "Everyone" : shortName(((P[rec.to] || {}).snapshot) || {}, rec.to);
    var verb = rec.mode === "es" && rec.undo && rec.undo.delta < 0 ? " lost " : " got ";
    var what = rec.label || rec.mode;
    if (rec.mode === "es" && rec.undo && rec.undo.delta < 0) what = what.replace(/^−/, "");
    var extra = "";
    if (rec.to !== "all" && rec.grants[0] && rec.grants[0].before != null && rec.grants[0].after != null) {
      extra = rec.mode === "es" ? " (ES " + num(rec.grants[0].before) + " to " + num(rec.grants[0].after) + ")" : (rec.mode === "ammo" ? " (pool " + rec.grants[0].before + " to " + rec.grants[0].after + ")" : "");
    }
    var reason = rec.mode === "es" && rec.undo ? " \u201c" + rec.undo.reason + "\u201d" : "";
    return who + verb + what.replace(/\s\u201c.*\u201d$/, "") + reason + extra;
  }
  function record(rec) {
    loadRecent();
    rec.id = rec.id || (rec.grants[0] && rec.grants[0].gid) || ("give" + Date.now());
    rec.ts = new Date().toISOString();
    rec.text = recLine(rec);
    if (!rec.undo) rec.noUndo = rec.mode === "kit" ? "no undo (a kit unpacks into many items)" : (rec.mode === "note" ? "no undo (a note is already read)" : "no undo");
    ui.recent.unshift(rec);
    ui.recent = ui.recent.slice(0, 12);
    saveRecent();
    if (rec.undo && root.DMCCEnhance && root.DMCCEnhance.rememberGiveUndo) root.DMCCEnhance.rememberGiveUndo(rec.id, rec.text);
    paintRecent();
    paintWho();
  }
  async function undo(id) {
    loadRecent();
    var rec = ui.recent.filter(function (r) { return r.id === id; })[0];
    var DM = D();
    if (!rec || !DM) { if (DM) DM.toast("Nothing to undo"); return false; }
    if (rec.undone) { DM.toast("Already undone"); return false; }
    if (!rec.undo) { DM.toast("That give can't be undone here"); return false; }
    rec.undone = true;
    rec.undoGrants = [];
    var u = rec.undo, S = st();
    var seen = {};
    for (var i = 0; i < rec.grants.length; i++) {
      var g = rec.grants[i];
      var ugid = "undo_" + g.gid;
      var snap = snapOf(g.pid);
      if (u.kind === "es") {
        await DM.pushLedger({ who: "DM", type: "undo", flag: false, playerId: g.pid, characterName: snap.name || g.pid, what: "Undo: " + rec.text, oldVal: null, newVal: "undone" });
        await DM.pushCommand({ id: ugid, type: "reward_es", to: g.pid, payload: { delta: -u.delta, reason: "Undo: " + u.reason, grantId: ugid }, from: S.uid, quiet: !!S.demo });
        if (S.demo && DM.applyEsToDemoPlayer) await DM.applyEsToDemoPlayer(g.pid, -u.delta);
        rec.undoGrants.push({ pid: g.pid, gid: ugid });
        continue;
      }
      /* one undo command per grant id (an Everyone item went out once, to "all") */
      var to = rec.to === "all" && u.kind !== "ammo" ? "all" : g.pid;
      if (!seen[g.gid + to]) {
        seen[g.gid + to] = 1;
        await DM.pushLedger({ who: "DM", type: "undo", flag: false, playerId: to, characterName: to === "all" ? "everyone" : (snap.name || g.pid), what: "Undo: " + rec.text, oldVal: null, newVal: "undone" });
        await DM.pushCommand({ id: ugid + (to === "all" ? "" : ""), type: "undo_item", to: to, payload: { grantId: g.gid, undoId: ugid, text: u.text || "", ammo: u.ammo || null, weaponId: u.weaponId || "" }, from: S.uid, quiet: !!S.demo });
      }
      if (S.demo && u.ammo) demoAmmo(snap, u.ammo, -(Number(u.ammo.qty) || 0));
      rec.undoGrants.push({ pid: g.pid, gid: ugid });
    }
    saveRecent();
    if (S.demo && DM.renderPlayers) DM.renderPlayers();
    DM.toast("Undid: " + rec.text);
    paintRecent();
    paintWho();
    return true;
  }
  function paintWho() { whoCards(); paintMore(); if (ui.mode === "ammo") fillAmmo(); paintPreview(); }
  function paint() {
    if (typeof document === "undefined" || !$("giveWho")) return;
    paintWho();
    paintRecent();
  }
  function pickWho(pid) {
    var sel = $("rewTarget");
    if (!sel) return;
    if (![].some.call(sel.options, function (o) { return o.value === pid; })) return;
    sel.value = pid;
    sel.dispatchEvent(new Event("change", { bubbles: true }));
  }
  function flashWho() {
    var b = $("giveWhoBox");
    if (!b) return;
    b.classList.add("give-need");
    setTimeout(function () { b.classList.remove("give-need"); }, 1200);
    try { b.scrollIntoView({ block: "nearest", behavior: "smooth" }); } catch (e) {}
  }
  function wire() {
    var panel = $("panel-rewards");
    if (!panel || panel.getAttribute("data-give-tab")) return;
    panel.setAttribute("data-give-tab", "1");
    panel.addEventListener("click", function (e) {
      var t = e.target && e.target.closest ? e.target.closest("[data-give-who],[data-give-mode],[data-give-undo],#btnCustomItem,#btnCustomWeapon") : null;
      if (!t) return;
      if (t.hasAttribute("data-give-who")) { pickWho(t.getAttribute("data-give-who")); return; }
      if (t.hasAttribute("data-give-mode")) { setMode(t.getAttribute("data-give-mode")); return; }
      if (t.hasAttribute("data-give-undo")) { t.disabled = true; undo(t.getAttribute("data-give-undo")); return; }
      if (t.id === "btnCustomItem" || t.id === "btnCustomWeapon") {
        var forMode = t.id === "btnCustomItem" ? "item" : "weapon";
        ui.custom = !(ui.custom && ui.mode === forMode);
        showFor(ui.mode);
        if (ui.custom && forMode === "weapon") {
          var form = $("dmItemForm"), ty = form && form.querySelector("[data-item-type]");
          if (ty) { ty.value = "weapon"; ty.dispatchEvent(new Event("change", { bubbles: true })); }
        }
        var w = $("dmItemFormWrap");
        if (ui.custom && w) { try { w.scrollIntoView({ block: "start", behavior: "smooth" }); } catch (err) {} }
      }
    });
    panel.addEventListener("input", function () { paintSupplyLater(); paintPreview(); });
    panel.addEventListener("change", function (e) {
      var id = e.target && e.target.id;
      if (id === "rewTarget") { paintWho(); return; }
      if (id === "giveAmmoAll") { ui.showAll = !!e.target.checked; fillAmmo(); }
      if (id === "giveSupplyOn") paintSupply();
      paintPreview();
    });
    /* the custom builder's own Give item button (items.js) is a give too: list it (its undo is on the sheet) */
    panel.addEventListener("click", function (e) {
      var t = e.target && e.target.closest ? e.target.closest("#dmItemForm [data-item-add]") : null;
      if (!t || !target()) return;
      var form = t.closest("[data-item-form]"), nm = form && form.querySelector("[data-item-name]");
      setTimeout(function () {
        loadRecent();
        var rec = { mode: "custom", to: target(), pids: [], label: (nm && nm.value) || "a custom item", grants: [], undo: null };
        rec.id = "custom" + Date.now(); rec.ts = new Date().toISOString(); rec.text = recLine(rec); rec.noUndo = "no undo here (remove it from their inventory)";
        ui.recent.unshift(rec); ui.recent = ui.recent.slice(0, 12); saveRecent(); paintRecent();
      }, 0);
    });
    showFor("");
    paint();
    setInterval(function () { if (!panel.hidden) paintRecent(); }, 2500);
  }
  var supT = null;
  function paintSupplyLater() { if (supT) clearTimeout(supT); supT = setTimeout(paintSupply, 120); }
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire); else wire();
  }
  root.SSDNSGiveTab = { pure: pure, plan: plan, setMode: setMode, paint: paint, paintButton: paintButton, paintPreview: paintPreview, record: record, undo: undo,
    poolCount: poolCount, demoAmmo: demoAmmo, flashWho: flashWho, pickWho: pickWho, recent: function () { loadRecent(); return ui.recent.slice(); }, _ui: ui };
})(typeof window !== "undefined" ? window : globalThis);

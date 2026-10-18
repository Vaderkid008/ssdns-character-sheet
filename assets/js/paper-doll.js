/* SSDNS paper doll (sheet 0.3.52). Art Bot take B6: frame + silhouette + 25 slot boxes.
   Worn slots hold Items (item.equipSlot). Weapon slots mirror the Gear tab.
   Only slotted (and, if needed, attuned) items give bonuses. Holster rigs don't stack. Dex caps at 20. */
(function (root) {
  "use strict";
  var W = 1080, H = 1350;
  var BOX = {
    hat: [485, 125, 120, 120], neck: [485, 255, 120, 120], coat: [410, 380, 120, 120], vest: [560, 380, 120, 120],
    gunbelt: [485, 505, 120, 120], holster_l: [340, 530, 120, 120], holster_r: [630, 530, 120, 120], gloves: [282, 660, 120, 120],
    chaps: [485, 800, 120, 120], boots: [485, 1070, 120, 120],
    accessory_1: [74, 110, 130, 130], accessory_2: [74, 270, 130, 130], accessory_3: [214, 110, 130, 130], accessory_4: [214, 270, 130, 130],
    accessory_5: [876, 110, 130, 130], accessory_6: [876, 270, 130, 130], accessory_7: [736, 110, 130, 130], accessory_8: [736, 270, 130, 130],
    ring_1: [74, 430, 130, 130], ring_2: [876, 430, 130, 130],
    revolver_1: [74, 690, 130, 130], revolver_2: [876, 690, 130, 130], long_gun: [74, 850, 130, 300], melee: [214, 850, 130, 300],
    focus_borrowed_iron: [736, 850, 270, 300]
  };
  var COUNTER = [240, 1158, 235, 174];
  var SIL = [310, 118, 460, 1080];
  /* label, accepted item.wear values, kind */
  var SLOTS = {
    hat: ["Head", ["head", "hat", "helm"]], neck: ["Neck", ["neck", "amulet"]], coat: ["Cloak", ["cloak", "coat"]],
    vest: ["Armor", ["armor", "body", "vest"]], gunbelt: ["Belt", ["belt", "gunbelt", "bandolier"]],
    holster_l: ["Holster rig 1", ["holster", "rig"]], holster_r: ["Holster rig 2", ["holster", "rig"]],
    gloves: ["Gloves", ["gloves", "hands"]], chaps: ["Legs", ["legs", "chaps"]], boots: ["Boots", ["boots", "feet"]],
    ring_1: ["Ring", ["ring"]], ring_2: ["Ring", ["ring"]], accessory_8: ["Shield", ["shield"]]
  };
  for (var a = 1; a <= 7; a++) SLOTS["accessory_" + a] = ["Trinket", ["trinket", "accessory", ""]];
  var WEAPON_SLOTS = { revolver_1: "Pistol 1", revolver_2: "Pistol 2", long_gun: "Long gun", melee: "Melee", focus_borrowed_iron: "Focus" };
  var AB = ["STR", "DEX", "CON", "INT", "WIS", "CHA"];

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (ch) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]; }); }
  function R() { return root.SSDNS_RULES || {}; }
  function byId(list, id) { return (list || []).filter(function (x) { return x && x.id === id; })[0] || null; }
  function items(c) { return (c && Array.isArray(c.items)) ? c.items : []; }
  function inSlot(c, key) { return items(c).filter(function (it) { return it && it.equipSlot === key; })[0] || null; }
  function base() {
    try { if ((root.location && root.location.pathname || "").indexOf("/dm/") >= 0) return "../"; } catch (e) {}
    return "";
  }
  function img(name) { return base() + "assets/images/doll/" + name; }
  function wearOf(it) { return String((it && it.wear) || "").toLowerCase(); }
  function fits(it, key) {
    var s = SLOTS[key]; if (!s || !it) return false;
    if (it.type === "consumable" || it.type === "scroll" || it.type === "explosive" || it.type === "weapon" && key !== "accessory_8") return false;
    return s[1].indexOf(wearOf(it)) >= 0;
  }
  function active(it) { return !!it && !!it.equipSlot && (!it.attune || !!it.attuned); }

  /* Put item uid into slot key (or clear with uid ""). One item per slot. */
  function equip(c, key, uid) {
    if (!SLOTS[key]) return { ok: false, reason: "Not a worn slot." };
    var cur = inSlot(c, key);
    if (!uid) { if (cur) { if (cur.cursed) return { ok: false, reason: "Cursed. It won't come off." }; cur.equipSlot = ""; } return { ok: true }; }
    var it = items(c).filter(function (x) { return x && x.uid === uid; })[0];
    if (!it) return { ok: false, reason: "No item." };
    if (!fits(it, key)) return { ok: false, reason: it.name + " doesn't go in the " + SLOTS[key][0] + " slot." };
    if (cur && cur !== it) { if (cur.cursed) return { ok: false, reason: "Cursed. It won't come off." }; cur.equipSlot = ""; }
    it.equipSlot = key;
    return { ok: true, item: it };
  }

  /* 0.3.52: weapon slots are pickers. c.dollWeapons maps slot -> gun/melee index. */
  function gunRows(c) {
    var rr = R();
    return ((c && c.guns) || []).map(function (g, i) {
      var w = g && g.weapon && (byId(rr.firearms, g.weapon) || byId(rr.otherRanged, g.weapon));
      return w ? { kind: "gun", i: i, w: w, g: g, id: g.weapon, name: w.name, pistol: w.group === "pistol", equipped: g.equipped !== false } : null;
    }).filter(Boolean);
  }
  function meleeRows(c) {
    var rr = R();
    return ((c && c.melee) || []).map(function (m, i) {
      if (!m || !m.weapon) return null;
      var w = byId(rr.melee, m.weapon);
      return { kind: "melee", i: i, w: w, g: m, id: m.weapon, name: w ? w.name : m.weapon, equipped: m.equipped !== false };
    }).filter(Boolean);
  }
  function weaponOptions(c, key) {
    if (key === "melee") return meleeRows(c);
    var guns = gunRows(c);
    if (key === "revolver_1" || key === "revolver_2") return guns.filter(function (x) { return x.pistol; });
    if (key === "long_gun") return guns.filter(function (x) { return !x.pistol && x.id !== "borrowed-iron"; });
    return [];
  }
  function weaponRow(c, key) {
    var map = (c && c.dollWeapons) || {};
    var opts = weaponOptions(c, key);
    if (map[key] != null && map[key] !== "") {
      var hit = opts.filter(function (x) { return String(x.i) === String(map[key]); })[0];
      if (hit) return hit.equipped ? hit : null;
    }
    var taken = {};
    Object.keys(map).forEach(function (k) { if (k !== key && k !== "melee" && map[k] != null && map[k] !== "") taken[String(map[k])] = 1; });
    if (key === "melee") return opts.filter(function (x) { return x.equipped && !taken[String(x.i)]; })[0] || null;
    var free = opts.filter(function (x) { return x.equipped && !taken[String(x.i)]; });
    if (key === "revolver_2") {
      var first = weaponRow(c, "revolver_1");
      free = free.filter(function (x) { return !first || x.i !== first.i; });
    }
    return free[0] || null;
  }
  /* Instruments you own: the focus one plus Items tagged instrument:<id>. */
  function instrumentId(it) {
    var tags = (it && Array.isArray(it.tags)) ? it.tags : [];
    for (var i = 0; i < tags.length; i++) { var m = /^instrument:(.+)$/.exec(String(tags[i])); if (m) return m[1]; }
    var cid = String((it && it.catalogId) || "");
    return /^instrument-/.test(cid) ? cid.slice(11) : "";
  }
  function instruments(c) {
    var rr = R(), list = (rr.storytellerGear && rr.storytellerGear.instruments) || [];
    var out = [];
    if (c && c.instrument) { var f = byId(list, c.instrument); out.push({ id: c.instrument, name: f ? f.name : c.instrument, quality: c.instrumentQuality || "cheap", focus: true, uid: "" }); }
    items(c).forEach(function (it) {
      var id = instrumentId(it); if (!id) return;
      var r = byId(list, id);
      out.push({ id: id, name: r ? r.name : it.name, quality: it.quality || "cheap", focus: false, uid: it.uid });
    });
    return out;
  }
  /* Swap an owned instrument item into the focus slot; the old focus becomes an item. */
  function makeFocus(c, uid) {
    if (!c) return { ok: false, reason: "No character." };
    var list = items(c), idx = -1;
    for (var i = 0; i < list.length; i++) if (list[i] && list[i].uid === uid) idx = i;
    if (idx < 0) return { ok: false, reason: "No instrument." };
    var it = list[idx], id = instrumentId(it);
    if (!id) return { ok: false, reason: it.name + " isn't an instrument." };
    var oldId = c.instrument, oldQ = c.instrumentQuality || "cheap";
    list.splice(idx, 1);
    if (oldId) {
      var rr = R(), r = byId(rr.storytellerGear && rr.storytellerGear.instruments, oldId);
      var row = { id: "instrument-" + oldId, name: r ? r.name : oldId, type: "gear", tags: ["instrument:" + oldId], quality: oldQ, description: "Instrument (focus). Swap it into the focus slot on Gear.", effect: { kind: "text", text: "Spellcasting focus (Storyteller)." } };
      if (root.SSDNSItems && root.SSDNSItems.add) root.SSDNSItems.add(c, row, { dm: true });
      else { row.uid = "i" + Date.now().toString(36); list.push(row); }
    }
    c.instrument = id; c.instrumentQuality = it.quality || "cheap";
    c.instrumentWear = "ok";
    return { ok: true, id: id };
  }
  /* Point a weapon slot at gun/melee index (or "" to clear). Sets Equipped to match. */
  function setWeapon(c, key, ref) {
    if (!WEAPON_SLOTS[key] || key === "focus_borrowed_iron") return { ok: false, reason: "Not a weapon slot." };
    c.dollWeapons = c.dollWeapons || {};
    var Equip = root.SSDNSEquip;
    if (ref === "" || ref == null) {
      var cur = weaponRow(c, key);
      c.dollWeapons[key] = "";
      if (cur) {
        var r0 = Equip && Equip.setEquipped ? Equip.setEquipped(c, { kind: cur.kind, index: cur.i, equipped: false }) : (cur.g.equipped = false, { ok: true });
        if (r0 && !r0.ok) return r0;
      }
      return { ok: true };
    }
    var pick = weaponOptions(c, key).filter(function (x) { return String(x.i) === String(ref); })[0];
    if (!pick) return { ok: false, reason: "That weapon doesn't go in the " + WEAPON_SLOTS[key] + " slot." };
    var prev = weaponRow(c, key);
    if (prev && prev.i !== pick.i && prev.kind === pick.kind && pick.g.equipped === false) {
      if (Equip && Equip.setEquipped) Equip.setEquipped(c, { kind: prev.kind, index: prev.i, equipped: false }); else prev.g.equipped = false;
    }
    if (Equip && Equip.setEquipped) { var r1 = Equip.setEquipped(c, { kind: pick.kind, index: pick.i, equipped: true }); if (r1 && !r1.ok) return r1; }
    else pick.g.equipped = true;
    Object.keys(c.dollWeapons).forEach(function (k) { if (k !== key && String(c.dollWeapons[k]) === String(pick.i) && (k === "melee") === (pick.kind === "melee")) c.dollWeapons[k] = ""; });
    c.dollWeapons[key] = pick.i;
    return { ok: true, row: pick };
  }
  function weaponName(c, key) {
    var guns = (c && c.guns) || [];
    if (key === "focus_borrowed_iron") {
      if (guns.some(function (g) { return g && g.weapon === "borrowed-iron"; })) return "Borrowed Iron";
      var ins = c && c.instrument && byId(R().storytellerGear && R().storytellerGear.instruments, c.instrument);
      return ins ? ins.name : "";
    }
    var row = weaponRow(c, key);
    return row ? row.name : "";
  }
  function weaponArt(c, key) {
    var A = root.SSDNSWeaponArt;
    if (key === "focus_borrowed_iron") {
      var guns = (c && c.guns) || [];
      if (guns.some(function (g) { return g && g.weapon === "borrowed-iron"; })) return A && A.srcFor ? (A.srcFor({ id: "borrowed-iron", name: "Borrowed Iron" }) || "") : "";
      var IA = root.SSDNSInstrumentArt;
      if (c && c.instrument && IA && IA.srcFor) { try { return IA.srcFor({ id: c.instrument, quality: c.instrumentQuality, name: weaponName(c, key) }) || ""; } catch (e) { return ""; } }
      return "";
    }
    var row = weaponRow(c, key);
    if (!row || !A || !A.srcFor) return "";
    try { return A.srcFor({ id: row.id, name: row.name }) || ""; } catch (e) { return ""; }
  }

  function num(x) { var n = Number(x); return isFinite(n) ? n : 0; }
  /* Bonus math from slotted gear. Returned to compute() in app.js. */
  function bonuses(c) {
    var out = { abilities: {}, ac: 0, init: 0, speed: 0, holsterDex: 0, holsterInit: 0, shieldOff: false, sources: [] };
    var twoHanded = false;
    items(c).forEach(function (it) {
      if (!active(it)) return;
      var b = it.bonuses || {};
      var rig = /^holster_/.test(it.equipSlot);
      if (rig) {
        out.holsterDex = Math.max(out.holsterDex, num(b.dex || b.DEX));
        out.holsterInit = Math.max(out.holsterInit, num(b.init || b.initiative));
      } else {
        AB.forEach(function (k) { var n = num(b[k] || b[k.toLowerCase()]); if (n) out.abilities[k] = (out.abilities[k] || 0) + n; });
        out.ac += num(b.ac || b.AC); out.init += num(b.init || b.initiative); out.speed += num(b.speed);
      }
      if (it.weapon && /two-handed/i.test(String(it.weapon.properties || ""))) twoHanded = true;
      out.sources.push(it.name);
    });
    ((c && c.melee) || []).forEach(function (m) {
      if (!m || !m.weapon || m.equipped === false) return;
      var w = byId(R().melee, m.weapon);
      if (w && /two-handed/i.test(String(w.properties || ""))) twoHanded = true;
    });
    out.twoHanded = twoHanded;
    out.shieldOff = twoHanded && (!!(c && c.shield) || !!inSlot(c, "accessory_8"));
    var sh = inSlot(c, "accessory_8");
    if (sh && active(sh) && twoHanded) out.ac -= num((sh.bonuses || {}).ac || (sh.bonuses || {}).AC);
    return out;
  }
  /* Raise a score by a bonus, capped at 20 (never lowers a score already above 20). */
  function capped(score, bonus) { if (!bonus) return score; var n = score + bonus; return bonus > 0 ? Math.max(score, Math.min(20, n)) : n; }

  function pct(b) { return "left:" + (b[0] / W * 100) + "%;top:" + (b[1] / H * 100) + "%;width:" + (b[2] / W * 100) + "%;height:" + (b[3] / H * 100) + "%"; }
  function artFor(it) {
    if (root.SSDNSItems && root.SSDNSItems.artSrc) { var s = root.SSDNSItems.artSrc(it); if (s) return s; }
    return "";
  }
  function html(c, opts) {
    opts = opts || {};
    var ro = !!opts.readOnly;
    var parts = ['<div class="doll' + (ro ? " doll-ro" : "") + '" style="background-image:url(' + img("frame-B6-1080x1350.webp") + ')">',
      '<img class="doll-sil" alt="" src="' + img("silhouette-600x1100.webp") + '" style="' + pct(SIL) + '">'];
    Object.keys(BOX).forEach(function (key) {
      var b = BOX[key], tall = b[3] > 200, label, name = "", art = "", filled = false, cls = "";
      if (WEAPON_SLOTS[key]) {
        label = WEAPON_SLOTS[key]; name = weaponName(c, key); filled = !!name; cls = " doll-weapon"; art = filled ? weaponArt(c, key) : "";
      } else {
        label = SLOTS[key][0];
        var it = inSlot(c, key);
        if (key === "vest" && !it && c && c.armor) { var ar = byId(R().armor, c.armor); if (ar && ar.category !== "shield") name = ar.name; }
        if (key === "accessory_8" && !it && c && c.shield) name = "Shield";
        if (key === "holster_l" && !it && c && c.holster) { var h = byId(R().holsters, c.holster); if (h) name = h.name; }
        if (it) { name = it.name; art = artFor(it); if (it.attune && !it.attuned) cls += " doll-unattuned"; }
        filled = !!name;
        if (key === "accessory_8" && filled && bonuses(c).shieldOff) cls += " doll-off";
      }
      /* 0.3.52: 9-slice the square tile so tall/wide slots keep true corners. */
      var tile = filled ? "slot-256-filled.webp" : "slot-256.webp";
      if (tall) cls += b[2] > 200 ? " doll-wide" : " doll-tall";
      parts.push('<' + (ro ? "div" : "button type=\"button\"") + ' class="doll-slot doll-9' + (filled ? " filled" : "") + cls + '" data-doll-slot="' + key + '" style="' + pct(b) + ';border-image-source:url(' + img(tile) + ')" title="' + esc(label + (name ? ": " + name : " (empty)")) + '" aria-label="' + esc(label + (name ? ": " + name : " empty")) + '">' +
        (art ? '<img class="doll-art" alt="" src="' + esc(art) + '">' : "") +
        (filled ? '<span class="doll-name">' + esc(name) + "</span>" : "") +
        (ro ? "" : '<span class="doll-label">' + esc(label) + "</span>") +
        "</" + (ro ? "div" : "button") + ">");
    });
    var es = opts.es != null ? opts.es : "";
    parts.push('<div class="doll-counter" style="' + pct(COUNTER) + '"><span class="doll-es">' + esc(es) + '</span><span class="doll-es-unit">ES</span></div>');
    parts.push("</div>");
    return parts.join("");
  }

  function opt(v, label, cur) { return '<option value="' + esc(v) + '"' + (String(v) === String(cur || "") ? " selected" : "") + ">" + esc(label) + "</option>"; }
  function weaponPicker(c, key) {
    var label = WEAPON_SLOTS[key], btn = function (attr, text, on) { return '<button type="button" class="btn sm' + (on ? " btn-primary" : "") + '" ' + attr + ">" + esc(text) + "</button>"; };
    var rows = "", hint = "";
    if (key === "focus_borrowed_iron") {
      var ins = instruments(c);
      rows = ins.map(function (x) {
        return x.focus ? btn("data-doll-noop", x.name + " · focus", true) : btn('data-doll-focus="' + esc(x.uid) + '"', "Make focus: " + x.name + (x.quality === "quality" ? " (quality)" : ""), false);
      }).join(" ");
      if (((c && c.guns) || []).some(function (g) { return g && g.weapon === "borrowed-iron"; })) rows = btn("data-doll-noop", "Borrowed Iron", true) + " " + rows;
      hint = "Your focus is your Calling instrument (or Borrowed Iron). Extra instruments wait in Items.";
    } else {
      var cur = weaponRow(c, key);
      rows = weaponOptions(c, key).map(function (x) {
        return btn('data-doll-weapon="' + x.i + '"', x.name + (x.equipped ? "" : " · packed"), !!cur && cur.i === x.i);
      }).join(" ");
      if (cur) rows += " " + btn('data-doll-weapon=""', "Unequip", false);
      hint = "Picking a weapon here sets it Equipped on Gear.";
    }
    return '<div class="doll-pick" data-doll-pick="' + key + '"><b>' + esc(label) + "</b> " + (rows || '<span class="fine">Nothing you carry fits here.</span>') +
      ' <button type="button" class="btn sm" data-doll-close>Close</button><p class="fine">' + esc(hint) + "</p></div>";
  }
  function pickerHtml(c, key) {
    if (WEAPON_SLOTS[key]) return weaponPicker(c, key);
    var label = SLOTS[key][0];
    var cur = inSlot(c, key);
    var list = items(c).filter(function (it) { return fits(it, key) && (!it.equipSlot || it.equipSlot === key); });
    var att = root.SSDNSItems && root.SSDNSItems.attunedCount ? root.SSDNSItems.attunedCount(c) + " / " + root.SSDNSItems.attuneCap(c) : "";
    var rows = list.map(function (it) {
      return '<button type="button" class="btn sm' + (cur === it ? " btn-primary" : "") + '" data-doll-put="' + esc(it.uid) + '">' + esc(it.name) + (it.attune ? (it.attuned ? " · attuned" : " · needs attunement") : "") + "</button>";
    }).join(" ");
    var rr = R(), extra = "";
    if (key === "vest") {
      extra = '<label class="tiny">PHB armor <select data-doll-armor>' + opt("", "None", c.armor) + (rr.armor || []).filter(function (a) { return a && a.category !== "shield"; }).map(function (a) { return opt(a.id, a.name, c.armor); }).join("") + "</select></label>";
    } else if (key === "accessory_8") {
      extra = '<button type="button" class="btn sm' + (c.shield ? " btn-primary" : "") + '" data-doll-shield>' + (c.shield ? "PHB shield: on" : "PHB shield: off") + "</button>";
    } else if (key === "holster_l") {
      extra = '<label class="tiny">PHB holster <select data-doll-holster>' + opt("", "None", c.holster) + (rr.holsters || []).map(function (h) { return opt(h.id, h.name, c.holster); }).join("") + "</select></label>";
    }
    var hint = key === "vest" ? "Same as Armor on Gear; either one updates the other." : key === "accessory_8" ? "Same as the Shield box on Gear. A two-handed weapon turns a shield off." : key === "holster_l" ? "Same as Holster on Gear. Rig bonuses don't stack: best Dex and best Init count." : "";
    return '<div class="doll-pick" data-doll-pick="' + key + '"><b>' + esc(label) + "</b> " + (extra ? extra + " " : "") + (rows || (extra ? "" : '<span class="fine">Nothing you carry fits here.</span>')) +
      (cur ? ' <button type="button" class="btn sm" data-doll-put="">Take off</button>' : "") +
      ' <button type="button" class="btn sm" data-doll-close>Close</button>' +
      (hint ? '<p class="fine">' + esc(hint) + "</p>" : "") + (att ? '<p class="fine">Attuned ' + esc(att) + "</p>" : "") + "</div>";
  }

  var openKey = "";
  function character() { var d = root.SSDNSApp && root.SSDNSApp.doc && root.SSDNSApp.doc(); return d && d.character; }
  function esTotal() { try { var d = root.SSDNSApp.doc(); return root.SSDNSBridge && root.SSDNSBridge.cpValue ? root.SSDNSBridge.cpValue(d.shards) : ""; } catch (e) { return ""; } }
  function paint() {
    if (typeof document === "undefined") return;
    var c = character(); if (!c) return;
    var es = esTotal();
    var host = document.getElementById("dollHost");
    if (host) host.innerHTML = html(c, { es: es }) + (openKey && (SLOTS[openKey] || WEAPON_SLOTS[openKey]) ? pickerHtml(c, openKey) : "") + '<p class="fine doll-msg" id="dollMsg"></p>';
  }
  function msg(t) { var m = document.getElementById("dollMsg"); if (m) m.textContent = t || ""; }
  function commit(fn) {
    if (root.SSDNSApp && root.SSDNSApp.applyPatch) root.SSDNSApp.applyPatch(fn);
    else fn();
  }
  function wire() {
    if (typeof document === "undefined") return;
    document.addEventListener("click", function (e) {
      var mf = e.target.closest && e.target.closest("[data-make-focus]");
      if (mf) {
        var mu = mf.getAttribute("data-make-focus"), mr;
        commit(function () { mr = makeFocus(character(), mu); });
        if (mr && !mr.ok && root.SSDNSApp && root.SSDNSApp.toast) root.SSDNSApp.toast(mr.reason);
        return;
      }
      var host = document.getElementById("dollHost");
      if (!host || !host.contains(e.target)) return;
      var t = e.target.closest("[data-doll-slot],[data-doll-put],[data-doll-close],[data-doll-weapon],[data-doll-focus],[data-doll-shield]");
      if (!t) return;
      if (t.hasAttribute("data-doll-close")) { openKey = ""; paint(); return; }
      var res, key = openKey;
      if (t.hasAttribute("data-doll-put")) {
        var uid = t.getAttribute("data-doll-put");
        commit(function () { res = equip(character(), key, uid); });
      } else if (t.hasAttribute("data-doll-weapon")) {
        var ref = t.getAttribute("data-doll-weapon");
        commit(function () { res = setWeapon(character(), key, ref); });
      } else if (t.hasAttribute("data-doll-focus")) {
        var fu = t.getAttribute("data-doll-focus");
        commit(function () { res = makeFocus(character(), fu); });
      } else if (t.hasAttribute("data-doll-shield")) {
        commit(function () { var ch = character(); ch.shield = !ch.shield; res = { ok: true }; });
      }
      if (res) { if (res.ok) openKey = ""; paint(); if (!res.ok) msg(res.reason); return; }
      var k = t.getAttribute("data-doll-slot");
      if (!k) return;
      openKey = openKey === k ? "" : k; paint();
    });
  }
  function wireChange() {
    document.addEventListener("change", function (e) {
      var host = document.getElementById("dollHost");
      if (!host || !host.contains(e.target)) return;
      var t = e.target, f = t.hasAttribute("data-doll-armor") ? "armor" : t.hasAttribute("data-doll-holster") ? "holster" : "";
      if (!f) return;
      commit(function () { character()[f] = t.value; });
      openKey = ""; paint();
    });
  }
  if (typeof document !== "undefined") { if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wireChange); else wireChange(); }
  if (typeof document !== "undefined") { if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire); else wire(); }

  root.SSDNSDoll = { BOX: BOX, SLOTS: SLOTS, WEAPON_SLOTS: WEAPON_SLOTS, equip: equip, fits: fits, inSlot: inSlot, bonuses: bonuses, capped: capped, html: html, pickerHtml: pickerHtml, paint: paint, weaponName: weaponName, weaponArt: weaponArt, weaponOptions: weaponOptions, setWeapon: setWeapon, instruments: instruments, instrumentId: instrumentId, makeFocus: makeFocus };
})(typeof window !== "undefined" ? window : globalThis);

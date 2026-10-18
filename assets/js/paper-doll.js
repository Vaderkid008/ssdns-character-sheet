/* SSDNS paper doll (sheet 0.3.50). Art Bot take B6: frame + silhouette + 25 slot boxes.
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

  function weaponName(c, key) {
    var rr = R(), guns = (c && c.guns) || [];
    var named = guns.map(function (g) { var w = g && g.weapon && (byId(rr.firearms, g.weapon) || byId(rr.otherRanged, g.weapon)); return w ? { w: w, g: g } : null; }).filter(Boolean);
    var pistols = named.filter(function (x) { return x.w.group === "pistol"; });
    var longs = named.filter(function (x) { return x.w.group !== "pistol"; });
    if (key === "revolver_1") return pistols[0] ? pistols[0].w.name : "";
    if (key === "revolver_2") return pistols[1] ? pistols[1].w.name : "";
    if (key === "long_gun") return longs[0] ? longs[0].w.name : "";
    if (key === "melee") {
      var m = ((c && c.melee) || []).filter(function (x) { return x && x.weapon && x.equipped !== false; })[0];
      var mw = m && byId(rr.melee, m.weapon);
      return mw ? mw.name : (m ? m.weapon : "");
    }
    if (key === "focus_borrowed_iron") {
      if (guns.some(function (g) { return g && g.weapon === "borrowed-iron"; })) return "Borrowed Iron";
      var ins = c && c.instrument && byId(rr.storytellerGear && rr.storytellerGear.instruments, c.instrument);
      return ins ? ins.name : "";
    }
    return "";
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
        label = WEAPON_SLOTS[key]; name = weaponName(c, key); filled = !!name; cls = " doll-weapon";
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
      var tile = filled ? (tall ? "slot-256x512-filled.webp" : "slot-256-filled.webp") : (tall ? "slot-256x512.webp" : "slot-256.webp");
      parts.push('<' + (ro ? "div" : "button type=\"button\"") + ' class="doll-slot' + (filled ? " filled" : "") + cls + '" data-doll-slot="' + key + '" style="' + pct(b) + ';background-image:url(' + img(tile) + ')" title="' + esc(label + (name ? ": " + name : " (empty)")) + '" aria-label="' + esc(label + (name ? ": " + name : " empty")) + '">' +
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

  function pickerHtml(c, key) {
    var label = SLOTS[key][0];
    var cur = inSlot(c, key);
    var list = items(c).filter(function (it) { return fits(it, key) && (!it.equipSlot || it.equipSlot === key); });
    var att = root.SSDNSItems && root.SSDNSItems.attunedCount ? root.SSDNSItems.attunedCount(c) + " / " + root.SSDNSItems.attuneCap(c) : "";
    var rows = list.map(function (it) {
      return '<button type="button" class="btn sm' + (cur === it ? " btn-primary" : "") + '" data-doll-put="' + esc(it.uid) + '">' + esc(it.name) + (it.attune ? (it.attuned ? " · attuned" : " · needs attunement") : "") + "</button>";
    }).join(" ");
    var hint = key === "vest" ? "PHB armor is picked under Armor below." : key === "accessory_8" ? "The PHB shield is the Shield box below. A two-handed weapon turns a shield off." : key === "holster_l" ? "PHB holster is picked under Holster below. Rig bonuses don't stack: best Dex and best Init count." : "";
    return '<div class="doll-pick" data-doll-pick="' + key + '"><b>' + esc(label) + "</b> " + (rows || '<span class="fine">Nothing you carry fits here.</span>') +
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
    if (host) host.innerHTML = html(c, { es: es }) + (openKey && SLOTS[openKey] ? pickerHtml(c, openKey) : "") + '<p class="fine doll-msg" id="dollMsg"></p>';
    var mini = document.getElementById("dollMini");
    if (mini) mini.innerHTML = html(c, { readOnly: true, es: es });
  }
  function msg(t) { var m = document.getElementById("dollMsg"); if (m) m.textContent = t || ""; }
  function commit(fn) {
    if (root.SSDNSApp && root.SSDNSApp.applyPatch) root.SSDNSApp.applyPatch(fn);
    else fn();
  }
  function wire() {
    if (typeof document === "undefined") return;
    document.addEventListener("click", function (e) {
      var host = document.getElementById("dollHost");
      if (!host || !host.contains(e.target)) return;
      var t = e.target.closest("[data-doll-slot],[data-doll-put],[data-doll-close]");
      if (!t) return;
      if (t.hasAttribute("data-doll-close")) { openKey = ""; paint(); return; }
      if (t.hasAttribute("data-doll-put")) {
        var uid = t.getAttribute("data-doll-put"), key = openKey, res;
        commit(function () { res = equip(character(), key, uid); });
        if (res && res.ok) openKey = "";
        paint(); if (res && !res.ok) msg(res.reason);
        return;
      }
      var k = t.getAttribute("data-doll-slot");
      if (WEAPON_SLOTS[k]) { var g = document.getElementById(k === "melee" ? "meleeList" : "guns") || document.getElementById("guns"); if (g && g.scrollIntoView) g.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
      openKey = openKey === k ? "" : k; paint();
    });
  }
  if (typeof document !== "undefined") { if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire); else wire(); }

  root.SSDNSDoll = { BOX: BOX, SLOTS: SLOTS, WEAPON_SLOTS: WEAPON_SLOTS, equip: equip, fits: fits, inSlot: inSlot, bonuses: bonuses, capped: capped, html: html, pickerHtml: pickerHtml, paint: paint, weaponName: weaponName };
})(typeof window !== "undefined" ? window : globalThis);

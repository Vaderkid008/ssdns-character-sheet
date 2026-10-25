/* L0224 / B10: Calling signature cards on the Gear tab.
   Same shape as the Borrowed Iron card (art + quick buttons). Buttons call the sheet's
   existing cast, attack, check, and class-resource paths. No second roller.
   Pact Seeker stays on #pactFocus. Gambler and Tribal Warrior get no card.
   Lost Ledger attack disadvantage (L0223 / B11) is not in this file. */
(function (root) {
  "use strict";
  var FISTS = "unarmed";
  var PREPARED = { "frontier-preacher": 1, "nature-guide": 1, lawman: 1, scholar: 1 };
  var HOLY = "badge-saint-medal-carved-eldorite-hymn-book-holy-symbol";
  var CARDS = {
    hexslinger: { title: "Caster Gun" },
    scholar: { title: "Chemical Field Ledger" },
    storyteller: { title: "Instrument" },
    "frontier-preacher": { title: "Holy symbol" },
    "nature-guide": { title: "Land focus" },
    "frontier-scout": { title: "Keepsake" },
    lawman: { title: "Tin star" },
    "martial-artist": { title: "Ki" },
    gunslinger: { title: "Grit" }
  };
  /* Same stand-in art the Focus slot already uses (paper-doll.js FOCUS_DOLL_ART). */
  var ART = {
    "chemical-field-ledger": "assets/img/items/gear/brass-bound-hymn-book.webp",
    "frontier-keepsake": "assets/img/items/gear/trinket-eldorite-locket.webp",
    "carved-walking-stick": "assets/img/weapons/cottonwood-walking-stick.webp",
    "medicine-pouch": "assets/img/items/gear/trinket-generic.webp",
    "home-spring-soil-pouch": "assets/img/items/gear/trinket-generic.webp",
    "tin-star-badge": "assets/img/items/gear/tin-star-board.webp"
  };
  ART[HOLY] = "assets/img/items/gear/neck-amulet.webp";
  var FEATS = {
    storyteller: [
      ["rally", "Rally Word", "Bonus action. Spends one Rally Word use (the class resource pip)."],
      ["instrumentDc", "Instrument save", "Once per short rest. Spends that use (the class resource pip)."],
      ["instrumentPerk", "Instrument perk", "Once per short rest. Spends that use (the class resource pip)."]
    ],
    "frontier-preacher": [
      ["creed", "Channel the Creed", "Spends one Channel the Creed use (the class resource pip)."],
      ["warPriest", "War Priest", "Spends one War Priest use (the class resource pip)."],
      ["intervene", "Divine Intervention", "Spends Divine Intervention (the class resource pip)."]
    ],
    "nature-guide": [
      ["wildShape", "Beast Mantle", "Spends one Beast Mantle use (the class resource pip)."],
      ["natRecovery", "Natural Recovery", "Once per day. Spends that use (the class resource pip)."]
    ],
    lawman: [
      ["oathSense", "Oath Sense", "Spends one Oath Sense use (the class resource pip)."],
      ["oathCreed", "Channel Creed", "Spends one Channel Creed use. Blocked while the badge is Dull or Tarnished."],
      ["deputize", "Deputize", "Spends one Deputize use (the class resource pip)."]
    ],
    scholar: [
      ["dustLamp", "Dust-Lamp Recovery", "Once per day, during a short rest. Spends that use (the class resource pip)."],
      ["signature", "Signature Spells", "Spends one Signature Spell use (the class resource pip)."]
    ],
    gunslinger: [
      ["secondWind", "Dust Breath", "Bonus action. Spends Dust Breath (the class resource pip)."],
      ["actionSurge", "Second Cylinder", "Spends Second Cylinder (the class resource pip)."],
      ["indomitable", "Iron Nerve", "Spends Iron Nerve (the class resource pip)."]
    ]
  };

  function doc() { return root.SSDNSApp && root.SSDNSApp.doc ? root.SSDNSApp.doc() : null; }
  function ch() { var d = doc(); return d && d.character; }
  function applies(c) { return !!(c && CARDS[c.calling]); }
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;"); }
  function lv(c) { return Math.max(1, Math.min(20, Number(c && c.level) || 1)); }
  function resOf(c, id) {
    var T = root.SSDNSTrackers;
    if (!T || !T.resourcesFor) return null;
    var list = T.resourcesFor(c) || [];
    for (var i = 0; i < list.length; i++) if (list[i] && list[i].id === id) return list[i];
    return null;
  }
  function leftOf(c, r) {
    if (!r) return 0;
    if (r.kind === "unlimited") return Infinity;
    var used = r.id === "rage" ? Number(c.rageUsed) || 0 : Number((c.res || {})[r.id]) || 0;
    return Math.max(0, (r.max || 0) - used);
  }
  function fistsDie(c) {
    var n = lv(c);
    if (n >= 17) return "1d10";
    if (n >= 11) return "1d8";
    if (n >= 5) return "1d6";
    return "1d4";
  }
  function fistsWeapon(c) {
    if (!c || c.calling !== "martial-artist") return null;
    return { id: FISTS, name: "Fists", damage: fistsDie(c), properties: "finesse", range: "5 ft" };
  }
  function fistsIndex(c) {
    var list = (c && c.melee) || [];
    for (var i = 0; i < list.length; i++) if (list[i] && list[i].weapon === FISTS) return i;
    return -1;
  }
  function fistsNeed(c) {
    if (!c || !c.melee) return false;
    var rows = c.melee;
    if (c.calling !== "martial-artist") {
      return rows.some(function (row) { return row && row.sigFists && (!row.weapon || row.weapon === FISTS); });
    }
    if (rows.some(function (row) { return row && row.weapon === FISTS; })) return false;
    if (rows.length < 4) return true;
    return rows.slice(0, 4).some(function (row) { return !row || !row.weapon; });
  }
  function applyFists(c) {
    if (!c) return false;
    c.melee = Array.isArray(c.melee) ? c.melee : [{}, {}, {}, {}];
    var changed = false;
    if (c.calling !== "martial-artist") {
      c.melee.forEach(function (row, i) {
        if (!row || !row.sigFists) return;
        if (!row.weapon || row.weapon === FISTS) { c.melee[i] = { weapon: "" }; changed = true; }
        else { delete row.sigFists; changed = true; }
      });
      return changed;
    }
    if (c.melee.some(function (row) { return row && row.weapon === FISTS; })) return false;
    while (c.melee.length < 4) { c.melee.push({}); changed = true; }
    for (var i = 0; i < 4; i++) {
      if (!c.melee[i] || !c.melee[i].weapon) {
        c.melee[i] = { weapon: FISTS, proficient: true, equipped: true, sigFists: true };
        return true;
      }
    }
    return changed;
  }
  var fistsLock = false;
  /* True when the melee list changed and the melee cards need a rebuild. */
  function prepare() {
    if (fistsLock) return false;
    var c = ch();
    if (!fistsNeed(c)) return false;
    fistsLock = true;
    try {
      var app = root.SSDNSApp;
      if (app && app.applyPatch) app.applyPatch(function (d) { if (d && d.character) applyFists(d.character); });
      if (fistsNeed(ch())) applyFists(ch());
    } finally { fistsLock = false; }
    return !fistsNeed(ch());
  }

  function gunName(c, i) {
    var g = c && c.guns && c.guns[i];
    var id = g && g.weapon;
    if (!id) return "";
    var lists = [].concat((root.SSDNS_RULES && root.SSDNS_RULES.firearms) || [], (root.SSDNS_RULES && root.SSDNS_RULES.casterGuns) || [], (root.SSDNS_RULES && root.SSDNS_RULES.otherRanged) || []);
    for (var k = 0; k < lists.length; k++) if (lists[k] && lists[k].id === id) return lists[k].name || id;
    return id;
  }
  function equippedGun(c, pred) {
    var guns = (c && c.guns) || [];
    for (var i = 0; i < guns.length; i++) {
      var g = guns[i];
      if (!g || !g.weapon || g.equipped === false) continue;
      if (!pred || pred(g, i)) return i;
    }
    return -1;
  }
  function casterIndex(c) {
    var D = root.SSDNSDoll;
    if (D && D.casterInHand) {
      var hit = D.casterInHand(c);
      if (hit && hit.i != null && !hit.wrecked) return hit.i;
      if (hit && hit.wrecked) return -1;
    }
    return equippedGun(c, function (g) { return g.weapon === "blacksnake" || g.weapon === "hognose"; });
  }
  function instrumentName(c) {
    var id = c && c.instrument;
    if (!id) return "";
    if (id === "voice") return "Voice";
    var list = (root.SSDNS_RULES && root.SSDNS_RULES.storytellerGear && root.SSDNS_RULES.storytellerGear.instruments) || [];
    for (var i = 0; i < list.length; i++) if (list[i] && list[i].id === id) return list[i].name || id;
    return id.charAt(0).toUpperCase() + id.slice(1);
  }
  function artOf(c) {
    var empty = { src: "", fallback: "", wide: false };
    if (!c) return empty;
    if (c.calling === "martial-artist") return { src: "assets/img/weapons/baton-belaying-pin-club.webp", fallback: "assets/img/items/default/weapon.webp", wide: true };
    if (c.calling === "gunslinger" || c.calling === "hexslinger") {
      var i = c.calling === "hexslinger" ? casterIndex(c) : equippedGun(c);
      var g = i >= 0 && c.guns ? c.guns[i] : null;
      var src = "";
      try {
        var A = root.SSDNSWeaponArt;
        if (g && A && A.srcFor) src = A.srcFor({ id: g.weapon, name: gunName(c, i) }) || "";
      } catch (e) { src = ""; }
      if (!src && c.calling === "hexslinger") src = "assets/img/weapons/blacksnake.webp";
      return { src: src || "assets/img/items/default/weapon.webp", fallback: "assets/img/items/default/weapon.webp", wide: !!src && src.indexOf("/weapons/") >= 0 };
    }
    if (c.calling === "storyteller") {
      var srcI = "";
      try {
        var IA = root.SSDNSInstrumentArt;
        if (c.instrument && c.instrument !== "voice" && IA && IA.srcFor) srcI = IA.srcFor({ id: c.instrument, quality: c.instrumentQuality || "cheap", name: instrumentName(c) }) || "";
      } catch (e2) { srcI = ""; }
      return { src: srcI || "assets/img/items/default/instrument.webp", fallback: "assets/img/items/default/instrument.webp", wide: false };
    }
    var D = root.SSDNSDoll, fs = D && D.focusState ? D.focusState(c) : null;
    if (fs && fs.lost) return { src: ART["frontier-keepsake"], fallback: "assets/img/items/default/focus.webp", wide: false, lost: true };
    if (fs && fs.art) return { src: fs.art, fallback: fs.fallback || "assets/img/items/default/focus.webp", wide: String(fs.art).indexOf("/weapons/") >= 0 };
    var id = fs && fs.itemId;
    if (id && ART[id]) return { src: ART[id], fallback: "assets/img/items/default/focus.webp", wide: ART[id].indexOf("/weapons/") >= 0 };
    return { src: "assets/img/items/default/focus.webp", fallback: "assets/img/items/default/focus.webp", wide: false };
  }
  function heading(c) {
    var D = root.SSDNSDoll;
    var fs = D && D.focusState ? D.focusState(c) : null;
    if (c.calling === "martial-artist") return { title: "Ki", note: "Fists use the melee card's Roll. Breath Coin buttons spend the Ki pips." };
    if (c.calling === "gunslinger") {
      var gi = equippedGun(c);
      var name = gi >= 0 ? gunName(c, gi) : "";
      return { title: "Grit", note: name ? (name + " · signature gun") : "Equip a gun. Attack uses that gun card's Roll." };
    }
    if (c.calling === "hexslinger") {
      var cg = D && D.casterInHand ? D.casterInHand(c) : null;
      if (cg && cg.wrecked) return { title: cg.name || "Caster Gun", note: "Wrecked · repair: traveling merchant only" };
      if (cg) return { title: cg.name || "Caster Gun", note: "Your focus · mirrors " + (cg.side || "a pistol slot") };
      var msg = (D && D.NO_CASTER) || "No Caster Gun equipped, can't cast.";
      return { title: "Caster Gun", note: msg };
    }
    if (c.calling === "storyteller") return { title: instrumentName(c) || "Instrument", note: "Your focus · performance and spells" };
    if (c.calling === "scholar" && root.SSDNSFocus && root.SSDNSFocus.ledgerMissing && root.SSDNSFocus.ledgerMissing(c)) {
      return { title: (fs && fs.name) || "Chemical Field Ledger", note: root.SSDNSFocus.PREP_WHY || "Lost Ledger. Recover your focus." };
    }
    if (fs && fs.lost) return { title: "Keepsake", note: fs.note || "Lost · make a new one at a long rest" };
    if (fs && fs.name) return { title: fs.name, note: fs.note || "Your focus" };
    var spec = CARDS[c.calling] || { title: "Focus" };
    return { title: spec.title, note: "Your focus" };
  }
  function shortSpell(n) {
    var m = String(n || "").match(/\(([^)]+)\)\s*$/);
    return m ? m[1] : String(n || "");
  }
  function spellBook(c) {
    if (c && c.calling === "lawman" && String(c.badgeState || "") === "tarnished" && c.lawlessSpells) return c.lawlessSpells;
    return (c && c.spells) || {};
  }
  function spellActions(c) {
    var mode = PREPARED[c.calling] ? "prepared" : "known";
    var out = [], seen = {};
    function add(level, name) {
      if (!name || seen[String(name).toLowerCase()]) return;
      if (root.SSDNSPactShot && root.SSDNSPactShot.isPactShot && root.SSDNSPactShot.isPactShot(name)) return;
      seen[String(name).toLowerCase()] = 1;
      out.push({
        id: "spell:" + level + ":" + name,
        label: shortSpell(name) + (level ? " · L" + level : ""),
        attrs: { "data-spell-cast": level + ":" + name, title: "Cast " + name + ". Same button as the spell list." }
      });
    }
    (c.cantrips || []).forEach(function (n) { add(0, n); });
    var book = spellBook(c);
    for (var lv = 1; lv <= 9 && out.length < 8; lv++) {
      (book[lv] || book[String(lv)] || []).forEach(function (s) {
        if (out.length >= 8) return;
        if (!s || !s.name) return;
        if (mode === "prepared" && !s.prepared) return;
        add(lv, s.name);
      });
    }
    return out.slice(0, 8);
  }
  function spendAction(c, id, label, title, group) {
    var r = resOf(c, id);
    if (!r) return null;
    var left = leftOf(c, r);
    var why = "";
    if (id === "oathCreed" && root.SSDNSFocus && root.SSDNSFocus.badgeBlock) why = root.SSDNSFocus.badgeBlock(c, "creed") || "";
    var ok = !why && left > 0;
    var map = "sig-" + id;
    if (r.roll) {
      return {
        id: map, label: label, map: true, group: group || "gear",
        attrs: { "data-trk-spend-roll": id, "data-sig-map": map, "data-sig-label": label, "data-sig-group": group || "gear", title: why || title, disabled: ok ? null : "disabled" }
      };
    }
    return {
      id: map, label: label + (r.max ? " (" + (left === Infinity ? "ready" : left) + ")" : ""), map: true, group: group || "gear",
      attrs: {
        "data-trk-res": id, "data-trk-on": ok ? "1" : "0", "data-sig-feat": label,
        "data-sig-map": map, "data-sig-label": label, "data-sig-group": group || "gear",
        title: why || title, disabled: ok ? null : "disabled"
      }
    };
  }
  function actions(c) {
    if (!applies(c)) return [];
    var list = [];
    function push(a) { if (a) list.push(a); }
    if (c.calling === "martial-artist") {
      var fi = fistsIndex(c);
      if (fi >= 0) {
        push({ id: "fists", label: "Fists", attrs: { "data-sig-proxy": "melee:" + fi, title: "Unarmed strike. Presses the Fists melee card's Roll (same attack, same Action)." } });
      } else {
        push({ id: "fists-full", label: "Fists need a free melee slot", attrs: { disabled: "disabled", title: "All four melee cards are full, so Fists has no Roll button to press." } });
      }
      var ki = resOf(c, "ki");
      if (ki) {
        var left = leftOf(c, ki);
        [["flurry", "Flurry of Blows", "Spend 1 Breath Coin (bonus action: two more unarmed strikes). Same Ki pip as the class resource row.", "attack"],
          ["patient", "Patient Defense", "Spend 1 Breath Coin (bonus action: Dodge). Same Ki pip as the class resource row.", "gear"],
          ["step", "Step of the Wind", "Spend 1 Breath Coin (bonus action: Disengage or Dash). Same Ki pip as the class resource row.", "gear"]
        ].forEach(function (row) {
          push({
            id: row[0], label: row[1], map: true, group: row[3],
            attrs: {
              "data-trk-res": "ki", "data-trk-on": left > 0 ? "1" : "0", "data-sig-feat": row[1],
              "data-sig-map": row[0], "data-sig-label": row[1], "data-sig-group": row[3],
              title: row[2], disabled: left > 0 ? null : "disabled"
            }
          });
        });
        if (lv(c) >= 5) {
          push({
            id: "stun", label: "Stunning Strike", map: true, group: "attack",
            attrs: {
              "data-trk-res": "ki", "data-trk-on": left > 0 ? "1" : "0", "data-sig-feat": "Stunning Strike",
              "data-sig-map": "stun", "data-sig-label": "Stunning Strike", "data-sig-group": "attack",
              title: "Spend 1 Breath Coin after a hit. The target makes a Constitution save. Same Ki pip as the class resource row.",
              disabled: left > 0 ? null : "disabled"
            }
          });
        }
      }
      push(spendAction(c, "whistle", "Whistle Recovery", "Spends Whistle Recovery (the class resource pip).", "gear"));
    } else if (c.calling === "gunslinger") {
      var gi = equippedGun(c);
      if (gi >= 0) {
        push({ id: "attack", label: "Attack", attrs: { "data-sig-proxy": "gunroll:" + gi, title: "Presses this gun card's Roll." } });
        push({ id: "gunmelee", label: "Gun melee", attrs: { "data-sig-proxy": "gunmelee:" + gi, title: "Presses this gun card's Melee." } });
      }
      (FEATS.gunslinger || []).forEach(function (row) { push(spendAction(c, row[0], row[1], row[2], "gear")); });
      var sup = resOf(c, "sup");
      if (sup) push(spendAction(c, "sup", "Trick Shot", "Spend one superiority die and roll it. Same button as the class resource row.", "attack"));
    } else if (c.calling === "hexslinger") {
      var ci = casterIndex(c);
      if (ci >= 0) push({ id: "attack", label: "Attack", attrs: { "data-sig-proxy": "gunroll:" + ci, title: "Presses the Caster Gun card's Roll. Casting stays on the cast buttons." } });
      spellActions(c).forEach(push);
    } else {
      if (c.calling === "storyteller") {
        push({
          id: "perform", label: "Perform", map: true, group: "gear",
          attrs: { "data-d20": "skill.Performance", "data-sig-map": "perform", "data-sig-label": "Perform", "data-sig-group": "gear", title: "Performance check. Same die as the skill button." }
        });
      }
      if (c.calling === "lawman" && resOf(c, "smite")) {
        var armed = !!(c.res && Number(c.res.smiteArmed));
        var why = root.SSDNSTrackers && root.SSDNSTrackers.canArm ? (root.SSDNSTrackers.canArm(c, "smite") || "") : "";
        push({
          id: "smite", label: armed ? "Smite armed" : "Smite next attack",
          attrs: { "data-trk-arm": "smite", title: why || "Arms Smite Lead. Same arm as the class resource row.", disabled: (why && !armed) ? "disabled" : null }
        });
      }
      (FEATS[c.calling] || []).forEach(function (row) { push(spendAction(c, row[0], row[1], row[2], row[0] === "wildShape" ? "attack" : "gear")); });
      spellActions(c).forEach(push);
    }
    return list;
  }
  function btnHtml(a) {
    var attrs = a.attrs || {};
    var parts = ['type="button"', 'class="btn sm calling-sig-btn"'];
    Object.keys(attrs).forEach(function (k) {
      if (attrs[k] == null || attrs[k] === false || attrs[k] === "") return;
      if (attrs[k] === true) parts.push(k);
      else parts.push(k + '="' + esc(attrs[k]) + '"');
    });
    return "<button " + parts.join(" ") + ">" + esc(a.label) + "</button>";
  }
  function model(c) {
    if (!applies(c)) return { show: false, calling: (c && c.calling) || "", title: "", note: "", art: "", actions: [] };
    var head = heading(c);
    var art = artOf(c);
    return { show: true, calling: c.calling, title: head.title, note: head.note, art: art.src, lost: !!art.lost, actions: actions(c) };
  }

  function ensureBox() {
    var box = document.getElementById("callingSig");
    if (box) return box;
    var guns = document.getElementById("guns");
    if (!guns || !guns.parentNode) return null;
    box = document.createElement("div");
    box.id = "callingSig";
    box.className = "pact-focus calling-sig";
    box.hidden = true;
    box.innerHTML = '<div class="pact-iron-art" id="callingSigArt" hidden></div><b id="callingSigTitle"></b> <span class="fine" id="callingSigNote"></span><div class="pact-iron-spells" id="callingSigActs"></div>';
    var pact = document.getElementById("pactFocus");
    if (pact && pact.nextSibling) guns.parentNode.insertBefore(box, pact.nextSibling);
    else guns.parentNode.insertBefore(box, guns);
    return box;
  }
  var mapSig = "";
  function refreshMap(sig) {
    if (sig === mapSig) return;
    mapSig = sig;
    if (root.SSDNSMapHost && root.SSDNSMapHost.refreshCard) {
      try { root.SSDNSMapHost.refreshCard(); } catch (e) {}
    }
  }
  function paintArt(box, art, title) {
    var el = document.getElementById("callingSigArt");
    if (!el) return;
    el.hidden = false;
    el.classList.toggle("pact-iron-generic", !art.wide);
    el.classList.toggle("calling-sig-wide", !!art.wide);
    var img = el.querySelector("img");
    if (!img) { img = document.createElement("img"); img.alt = ""; img.decoding = "async"; el.appendChild(img); }
    var src = art.src || art.fallback || "";
    if (img.getAttribute("src") !== src) img.setAttribute("src", src);
    if (art.fallback) img.setAttribute("data-fallback", art.fallback); else img.removeAttribute("data-fallback");
    img.onerror = function () {
      var fb = img.getAttribute("data-fallback");
      if (fb && img.getAttribute("src") !== fb) img.setAttribute("src", fb);
    };
    img.alt = title || "";
    el.title = title || "";
    box.classList.toggle("calling-sig-lost", !!art.lost);
  }
  function paint() {
    if (typeof document === "undefined") return;
    var box = ensureBox();
    if (!box) return;
    var c = ch();
    var view = model(c);
    if (!view.show) {
      box.hidden = true;
      box.removeAttribute("data-calling");
      var clear = document.getElementById("callingSigActs");
      if (clear && clear.getAttribute("data-html")) { clear.innerHTML = ""; clear.removeAttribute("data-html"); }
      refreshMap("0");
      return;
    }
    box.hidden = false;
    box.setAttribute("data-calling", view.calling);
    var title = document.getElementById("callingSigTitle");
    var note = document.getElementById("callingSigNote");
    if (title && title.textContent !== view.title) title.textContent = view.title;
    if (note && note.textContent !== view.note) note.textContent = view.note;
    paintArt(box, artOf(c), view.title);
    var html = view.actions.map(btnHtml).join(" ");
    var acts = document.getElementById("callingSigActs");
    if (acts && acts.getAttribute("data-html") !== html) { acts.innerHTML = html; acts.setAttribute("data-html", html); }
    if (root.SSDNSFocus && root.SSDNSFocus.paintCastBlock) { try { root.SSDNSFocus.paintCastBlock(); } catch (e) {} }
    refreshMap((view.calling || "") + "|" + view.title + "|" + html);
  }

  function onProxy(e) {
    var b = e.target && e.target.closest ? e.target.closest("[data-sig-proxy]") : null;
    if (!b || b.disabled) return;
    var spec = b.getAttribute("data-sig-proxy") || "";
    var cut = spec.indexOf(":");
    if (cut < 0) return;
    var kind = spec.slice(0, cut), i = spec.slice(cut + 1);
    var sel = kind === "melee" ? '[data-melee-roll="' + i + '"]'
      : kind === "gunroll" ? '[data-gunroll="' + i + '"]:not([data-k])'
      : kind === "gunmelee" ? '[data-gunmelee="' + i + '"]' : "";
    var real = sel ? document.querySelector(sel) : null;
    if (!real || real === b) return;
    e.preventDefault();
    e.stopPropagation();
    real.click();
  }
  if (typeof document !== "undefined" && document.addEventListener) {
    document.addEventListener("click", onProxy, true);
  }

  root.SSDNSSignature = {
    applies: applies, model: model, actions: actions, prepare: prepare, paint: paint,
    fistsWeapon: fistsWeapon, fistsIndex: fistsIndex, fistsNeed: fistsNeed, applyFists: applyFists,
    ART: ART, CARDS: CARDS, FISTS: FISTS
  };
})(typeof window !== "undefined" ? window : globalThis);

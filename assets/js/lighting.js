/* Item-driven light (sheet 0.3.115). Bright and dim rings, lineage darkvision, DM douse.
   No burn-time clock: a light stays on until someone stows it or the DM puts it out.
   rules.js is not touched. database.rules.json is not touched.
   Belt lantern price/weight are placeholders until Encounter Bot locks them. */
(function (root) {
  "use strict";
  var FT = 5; /* one map square */
  /* bright / dim are extra feet of dim beyond the bright radius (5e "dim light for another N ft"). */
  var TABLE = {
    "torch-pitch-stick": { name: "Torch / pitch stick", bright: 20, dim: 20, slot: "hand" },
    "candle": { name: "Candle", bright: 5, dim: 5, slot: "hand" },
    "lamp": { name: "Lamp", bright: 15, dim: 30, slot: "hand" },
    "hooded-lamp": { name: "Hooded lamp", bright: 30, dim: 30, slot: "hand", hood: true, hoodDown: { bright: 0, dim: 5 } },
    "bullseye-lantern": { name: "Bullseye lantern", bright: 60, dim: 60, slot: "hand", cone: true },
    "belt-lantern": { name: "Belt lantern", bright: 15, dim: 15, slot: "trinket", handsFree: true, placeholder: true },
    "spell:light": { name: "Light", bright: 20, dim: 20, spell: true },
    "spell:continual-flame": { name: "Gas Lamp", bright: 20, dim: 20, spell: true },
    "spell:dancing-lights": { name: "Dancing Lights", bright: 0, dim: 10, spell: true, each: 4 },
    "spell:sacred-weapon": { name: "Sacred Weapon", bright: 20, dim: 20, feature: true }
  };
  var SPELL_KEYS = {
    "light": "spell:light",
    "continual flame": "spell:continual-flame",
    "gas lamp": "spell:continual-flame",
    "dancing lights": "spell:dancing-lights",
    "darkvision": "spell:darkvision",
    "darkvision (owl eyes)": "spell:darkvision",
    "owl eyes": "spell:darkvision"
  };

  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  function idOf(item) { return String((item && (item.catalogId || item.id)) || ""); }
  function specFor(item) {
    if (!item) return null;
    var id = idOf(item);
    if (TABLE[id]) return TABLE[id];
    var name = String(item.name || "").toLowerCase();
    if (/belt lantern/.test(name)) return TABLE["belt-lantern"];
    if (/bullseye/.test(name)) return TABLE["bullseye-lantern"];
    if (/hooded (lamp|lantern)/.test(name)) return TABLE["hooded-lamp"];
    if (/\blamp\b|\blantern\b/.test(name) && !/oil\b/.test(name)) return TABLE.lamp;
    if (/torch|pitch stick/.test(name)) return TABLE["torch-pitch-stick"];
    if (/\bcandle\b/.test(name)) return TABLE.candle;
    return null;
  }
  function rules() { return root.SSDNS_RULES || {}; }
  function weaponRow(id) {
    var R = rules();
    var lists = [].concat(R.firearms || [], R.casterGuns || [], R.otherRanged || [], R.melee || []);
    for (var i = 0; i < lists.length; i++) if (lists[i] && lists[i].id === id) return lists[i];
    return null;
  }
  function twoHanded(w) { return /two-handed/i.test(String((w && w.properties) || "")); }
  function items(c) { return (c && Array.isArray(c.items)) ? c.items : []; }

  /* Hands a torch has to compete with: a shield, each equipped weapon, other held lights. */
  function handsUsed(c, ignoreUid) {
    if (!c) return 0;
    var n = c.shield ? 1 : 0;
    (c.guns || []).forEach(function (g) {
      if (!g || !g.weapon || g.equipped === false) return;
      var w = weaponRow(g.weapon);
      n += w && twoHanded(w) ? 2 : 1;
    });
    (c.melee || []).forEach(function (m) {
      if (!m || !m.weapon || m.equipped === false) return;
      var w = weaponRow(m.weapon);
      var two = w && (twoHanded(w) || (m.twoHand && /versatile/i.test(String(w.properties || ""))));
      n += two ? 2 : 1;
    });
    items(c).forEach(function (it) {
      if (!it || it.uid === ignoreUid || !it.lightHeld) return;
      var spec = specFor(it);
      if (spec && spec.slot === "hand") n += 1;
    });
    return n;
  }
  function radii(item) {
    var spec = specFor(item);
    if (!spec) return null;
    if (spec.hood && item && item.hoodDown && spec.hoodDown) return { bright: spec.hoodDown.bright, dim: spec.hoodDown.dim, cone: false };
    return { bright: spec.bright, dim: spec.dim, cone: !!spec.cone };
  }
  function litItem(item) {
    if (!item || item.lightOut) return null;
    var spec = specFor(item);
    if (!spec) return null;
    if (spec.slot === "trinket") {
      if (!item.equipSlot || !/^accessory_[1-7]$/.test(String(item.equipSlot))) return null;
    } else if (spec.slot === "hand") {
      if (!item.lightHeld) return null;
    } else return null;
    var r = radii(item);
    if (!r) return null;
    return {
      id: item.uid || idOf(item),
      catalogId: idOf(item),
      name: item.name || spec.name,
      bright: r.bright,
      dim: r.dim,
      cone: !!r.cone,
      hood: !!spec.hood,
      hoodDown: !!item.hoodDown,
      handsFree: !!spec.handsFree,
      placeholder: !!spec.placeholder,
      out: false
    };
  }
  function knownNames(c) {
    var out = [];
    (c && c.cantrips || []).forEach(function (n) { if (n) out.push(String(n)); });
    var spells = (c && c.spells) || {};
    Object.keys(spells).forEach(function (lv) {
      (spells[lv] || []).forEach(function (sp) {
        if (!sp || !sp.name) return;
        if (sp.prepared === false) return;
        out.push(String(sp.name));
      });
    });
    return out;
  }
  function spellKey(name) { return SPELL_KEYS[String(name || "").toLowerCase().replace(/\s+/g, " ").trim()] || ""; }
  function lightOn(c) {
    if (!c.lightOn || typeof c.lightOn !== "object") c.lightOn = {};
    return c.lightOn;
  }
  function spellLights(c) {
    var on = c && c.lightOn || {};
    var have = {};
    knownNames(c).forEach(function (n) { var k = spellKey(n); if (k && k !== "spell:darkvision") have[k] = n; });
    if (c && (c.calling === "lawman" || c.callingId === "lawman")) have["spell:sacred-weapon"] = "Sacred Weapon";
    var list = [];
    Object.keys(have).forEach(function (k) {
      if (!on[k]) return;
      var spec = TABLE[k];
      if (!spec) return;
      var n = spec.each ? Math.max(1, Math.min(spec.each, num(on[k + ":n"]) || spec.each)) : 1;
      for (var i = 0; i < n; i++) {
        list.push({
          id: k + (spec.each ? ":" + (i + 1) : ""),
          catalogId: k,
          name: spec.each ? spec.name + " " + (i + 1) : spec.name,
          bright: spec.bright,
          dim: spec.dim,
          cone: false,
          spell: true,
          out: false
        });
      }
    });
    return list;
  }
  function activeLights(c) {
    var list = [];
    items(c).forEach(function (it) { var row = litItem(it); if (row) list.push(row); });
    return list.concat(spellLights(c));
  }
  function traitTexts(c) {
    var R = rules();
    var texts = [];
    var lin = (R.lineages || []).filter(function (x) { return x && x.id === (c && c.lineage); })[0];
    if (lin) {
      (lin.traits || []).forEach(function (t) { if (t) texts.push((t.name || "") + " " + (t.text || "")); });
      var sub = (lin.sublineages || []).filter(function (x) { return x && x.id === c.sublineage; })[0];
      if (sub) (sub.traits || []).forEach(function (t) { if (t) texts.push((t.name || "") + " " + (t.text || "")); });
    }
    (c && c.feats || []).forEach(function (id) {
      var f = (R.feats || []).filter(function (x) { return x && x.id === id; })[0];
      if (f) texts.push((f.name || id) + " " + (f.text || f.description || ""));
    });
    return texts;
  }
  function darkvisionFeet(c) {
    var feet = 0;
    traitTexts(c).forEach(function (t) {
      if (/superior darkvision/i.test(t)) feet = Math.max(feet, 120);
      else if (/darkvision/i.test(t)) {
        var m = t.match(/(\d+)\s*feet/i);
        feet = Math.max(feet, m ? num(m[1]) : 60);
      }
    });
    if (c && c.lightOn && c.lightOn["spell:darkvision"]) feet = Math.max(feet, 60);
    return feet;
  }
  function hasSkulker(c) {
    if (c && (c.feats || []).indexOf("skulker") >= 0) return true;
    return traitTexts(c).some(function (t) { return /\bskulker\b/i.test(t); });
  }
  function knowsOwlEyes(c) {
    return knownNames(c).some(function (n) { return spellKey(n) === "spell:darkvision"; });
  }
  /* What the map token should carry. DM douse is applied by the map, not here. */
  function tokenProfile(c) {
    return {
      lights: activeLights(c).map(function (l) {
        return { id: l.id, name: l.name, bright: l.bright, dim: l.dim, cone: !!l.cone, out: false };
      }),
      darkvision: darkvisionFeet(c),
      skulker: hasSkulker(c)
    };
  }
  function squares(feet) { return num(feet) / FT; }
  /* Light level at a grid point before darkvision. ambient: bright | dim | dark. */
  function rawLevel(gx, gy, lights, ambient) {
    var amb = ambient === "bright" || ambient === "dim" ? ambient : "dark";
    var best = amb === "bright" ? "bright" : amb === "dim" ? "dim" : "dark";
    (lights || []).forEach(function (ls) {
      if (!ls || ls.out) return;
      var dx = gx - ls.x, dy = gy - ls.y;
      var d = Math.hypot(dx, dy);
      var bright = squares(ls.bright), dim = squares(ls.dim);
      var outer = bright + dim;
      if (ls.cone) {
        if (d > outer) return;
        var ang = Math.atan2(dy, dx);
        var face = num(ls.facing);
        var diff = Math.abs(ang - face);
        if (diff > Math.PI) diff = Math.abs(diff - 2 * Math.PI);
        if (diff > Math.atan(0.5) + 0.001) return;
      }
      if (d <= bright && ls.bright > 0) best = "bright";
      else if (d <= outer && best === "dark") best = "dim";
    });
    return best;
  }
  /* Darkvision: dim counts as bright, darkness as dim, inside the radius. Grayscale is a note, not a second mechanic. */
  function seenLevel(gx, gy, lights, ambient, darkvisionFt) {
    var raw = rawLevel(gx, gy, lights, ambient);
    var r = squares(darkvisionFt);
    if (!(r > 0)) return raw;
    /* caller passes distance from the creature; when gx/gy are absolute, pass origin on the light list via opts.
       This helper treats darkvision as already "in range" when darkvisionFt > 0 and the caller checked range.
       Use applyDarkvision(raw) when the range test is separate. */
    return applyDarkvision(raw, true);
  }
  function applyDarkvision(raw, inRange) {
    if (!inRange) return raw;
    if (raw === "dim") return "bright";
    if (raw === "dark") return "dim";
    return raw;
  }
  function perceptionNote(level, skulker) {
    if (level === "bright") return "Bright light. Sight is normal.";
    if (level === "dim") return skulker ? "Dim light. Skulker: no disadvantage on sight Perception." : "Dim light. Disadvantage on Wisdom (Perception) checks that rely on sight.";
    return "Darkness. Heavily obscured: you are effectively blinded.";
  }
  function hold(c, uid, on) {
    var it = items(c).filter(function (x) { return x && x.uid === uid; })[0];
    if (!it) return { ok: false, reason: "No item." };
    var spec = specFor(it);
    if (!spec || spec.slot !== "hand") return { ok: false, reason: "That light isn't held in a hand." };
    if (!on) { it.lightHeld = false; return { ok: true, item: it, held: false }; }
    if (handsUsed(c, uid) + 1 > 2) {
      return { ok: false, reason: "No free hand. A torch takes a hand, and a two-handed gun or a shield plus a weapon can fill both." };
    }
    it.lightHeld = true;
    it.lightOut = false;
    return { ok: true, item: it, held: true };
  }
  function setHood(c, uid, down) {
    var it = items(c).filter(function (x) { return x && x.uid === uid; })[0];
    if (!it) return { ok: false, reason: "No item." };
    var spec = specFor(it);
    if (!spec || !spec.hood) return { ok: false, reason: "Only a hooded lamp has a hood." };
    it.hoodDown = !!down;
    return { ok: true, item: it, hoodDown: !!down };
  }
  function setSpell(c, key, on) {
    var bag = lightOn(c);
    if (key === "spell:dancing-lights") bag[key] = on ? (num(bag[key + ":n"]) || 4) : 0;
    else bag[key] = !!on;
    return bag;
  }
  function douseItem(c, uid, out) {
    var it = items(c).filter(function (x) { return x && x.uid === uid; })[0];
    if (!it) return { ok: false, reason: "No item." };
    it.lightOut = !!out;
    return { ok: true, item: it, out: !!out };
  }

  function esc(t) { return String(t == null ? "" : t).replace(/[&<>"]/g, function (x) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[x]; }); }
  function ch() {
    try { var d = root.SSDNSApp && root.SSDNSApp.doc && root.SSDNSApp.doc(); return d && d.character; } catch (e) { return null; }
  }
  function paintBox() {
    if (!root.document) return;
    var c = ch();
    var anchor = document.getElementById("suppliesBox") || document.getElementById("exhNote") || document.getElementById("condBanner");
    var box = document.getElementById("lightBox");
    if (!box && anchor && anchor.parentNode) {
      box = document.createElement("section");
      box.id = "lightBox";
      box.className = "light-box";
      box.setAttribute("aria-label", "Light");
      anchor.parentNode.insertBefore(box, anchor.nextSibling);
      box.addEventListener("click", function (e) {
        var b = e.target.closest ? e.target.closest("[data-light-spell]") : null;
        if (!b) return;
        var key = b.getAttribute("data-light-spell");
        var cur = ch();
        if (!cur) return;
        var next = key === "spell:dancing-lights" ? !lightOn(cur)[key] : !lightOn(cur)[key];
        if (root.SSDNSApp && root.SSDNSApp.applyPatch) root.SSDNSApp.applyPatch(function (d) { if (d && d.character) setSpell(d.character, key, next); });
        else setSpell(cur, key, next);
        paintBox();
        if (root.SSDNSItems && root.SSDNSItems.paintSheet) root.SSDNSItems.paintSheet();
      });
    }
    if (!box) return;
    if (!c) { box.hidden = true; return; }
    var lights = activeLights(c);
    var dv = darkvisionFeet(c);
    var sk = hasSkulker(c);
    var known = {};
    knownNames(c).forEach(function (n) { var k = spellKey(n); if (k) known[k] = n; });
    if (c.calling === "lawman" || c.callingId === "lawman") known["spell:sacred-weapon"] = "Sacred Weapon";
    var on = c.lightOn || {};
    var spells = Object.keys(known).map(function (k) {
      var label = k === "spell:sacred-weapon" ? "Sacred Weapon" : (k === "spell:darkvision" ? "Owl Eyes" : (TABLE[k] ? TABLE[k].name : known[k]));
      var lit = k === "spell:dancing-lights" ? !!on[k] : !!on[k];
      return '<button type="button" class="btn xs light-spell' + (lit ? " btn-primary" : "") + '" data-light-spell="' + esc(k) + '">' + esc(label) + (lit ? " · on" : " · off") + "</button>";
    }).join(" ");
    var line = lights.length ? lights.map(function (l) {
      return esc(l.name) + " " + (l.bright ? l.bright + "/" + l.dim : "dim " + l.dim) + (l.cone ? " cone" : "");
    }).join(" · ") : "No light in hand or on a trinket.";
    box.hidden = false;
    box.innerHTML = '<div class="light-head"><h3>Light</h3><span class="fine">No burn timer. The DM can put a light out.</span></div>' +
      '<p class="light-now" data-light-now>' + line + "</p>" +
      '<p class="fine">Darkvision ' + (dv ? dv + " ft (dim counts as bright, dark as dim" + (sk ? ", Skulker ignores dim disadvantage" : "") + ")" : "none") +
      ". Hands in use " + Math.min(2, handsUsed(c)) + " / 2.</p>" +
      (spells ? '<div class="light-spells">' + spells + "</div>" : "");
  }

  root.SSDNSLighting = {
    FT: FT, TABLE: TABLE, specFor: specFor, radii: radii, handsUsed: handsUsed, hold: hold, setHood: setHood,
    setSpell: setSpell, douseItem: douseItem, litItem: litItem, activeLights: activeLights, spellLights: spellLights,
    knownNames: knownNames, spellKey: spellKey, knowsOwlEyes: knowsOwlEyes, darkvisionFeet: darkvisionFeet,
    hasSkulker: hasSkulker, tokenProfile: tokenProfile, squares: squares, rawLevel: rawLevel, seenLevel: seenLevel,
    applyDarkvision: applyDarkvision, perceptionNote: perceptionNote, paintBox: paintBox
  };
})(typeof window !== "undefined" ? window : globalThis);

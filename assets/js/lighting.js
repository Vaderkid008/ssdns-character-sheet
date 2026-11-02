/* Item-driven light plus placed spell emitters (sheet 0.3.214).
   Held lights stay on the token. A spell that shines somewhere else is a map emitter,
   not a glow stuck on the caster. No burn-time clock. rules.js is not touched.
   L0226 stack: ambient, painted regions, emitters (brightest wins),
   magical darkness (L0227–L0230), then this viewer's darkvision.
   Magical darkness is heavily obscured. Darkvision does not pierce it.
   Nonmagical light, Light, and Gas Lamp do not pierce it.
   A 3rd-level-or-higher light spell that overlaps it dispels it.
   Devil's Sight sees through it, out to 120 ft, unless the viewer is blinded inside.
   L0215: belt lantern is locked at bright 15 / dim 15, trinket, hands-free. Oil is fictional.
   Held torch, lamp, candle, hooded lamp, and bullseye take Pistol L, Pistol R, or Melee. */
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
    "belt-lantern": { name: "Belt lantern", bright: 15, dim: 15, slot: "trinket", handsFree: true },
    "spell:light": { name: "Light", bright: 20, dim: 20, spell: true },
    "spell:continual-flame": { name: "Gas Lamp", bright: 20, dim: 20, spell: true },
    "spell:dancing-lights": { name: "Dancing Lights", bright: 0, dim: 10, spell: true, each: 4 },
    "spell:produce-flame": { name: "Produce Flame", bright: 10, dim: 10, spell: true },
    "spell:flame-blade": { name: "Flame Blade", bright: 10, dim: 10, spell: true },
    "spell:sunbeam": { name: "Sunbeam", bright: 30, dim: 30, spell: true },
    "spell:fire-shield": { name: "Fire Shield", bright: 10, dim: 10, spell: true },
    "spell:sacred-weapon": { name: "Sacred Weapon", bright: 20, dim: 20, feature: true }
  };
  /* Real light-givers only. Radii are PHB where the book states them.
     Wall of Fire has no PHB number: 20/+20 is the house reading for a wall of fire (houseRadius).
     Moonbeam's pale beam fills its 5-ft cylinder; dim 5 is the pale edge.
     Left out on purpose: Faerie Fire (outline, no shed radius), Spirit Guardians (no light),
     Guiding Bolt (glitter, no radius), Prayer of Healing, Sacred Flame (instant). */
  var EMITTERS = {
    "light": { name: "Light", bright: 20, dim: 20, range: 5, dur: "1 hour", rounds: 600, conc: false, place: "point-or-token", unwilling: "DEX", spellLevel: 0, magical: true },
    "continual-flame": { name: "Gas Lamp", bright: 20, dim: 20, range: 5, dur: "until dispelled", rounds: 0, conc: false, place: "point-or-token", unwilling: "DEX", spellLevel: 2, magical: true },
    "dancing-lights": { name: "Dancing Lights", bright: 0, dim: 10, range: 120, dur: "1 minute", rounds: 10, conc: true, place: "orbs", max: 4, cluster: 20, move: 60, spellLevel: 0, magical: true },
    "produce-flame": { name: "Produce Flame", bright: 10, dim: 10, range: 0, dur: "10 minutes", rounds: 100, conc: false, place: "caster", spellLevel: 0, magical: true },
    "daylight": { name: "Daylight", bright: 60, dim: 60, range: 60, dur: "1 hour", rounds: 600, conc: false, place: "point-or-token", spellLevel: 3, magical: true },
    "moonbeam": { name: "Moonbeam", bright: 5, dim: 5, range: 120, dur: "1 minute", rounds: 10, conc: true, place: "point", spellLevel: 2, magical: true },
    "flame-blade": { name: "Flame Blade", bright: 10, dim: 10, range: 0, dur: "10 minutes", rounds: 100, conc: true, place: "caster", spellLevel: 2, magical: true },
    "flaming-sphere": { name: "Flaming Sphere", bright: 20, dim: 20, range: 60, dur: "1 minute", rounds: 10, conc: true, place: "point", spellLevel: 2, magical: true },
    "wall-of-fire": { name: "Wall of Fire", bright: 20, dim: 20, range: 120, dur: "1 minute", rounds: 10, conc: true, place: "wall", spellLevel: 4, magical: true, houseRadius: true },
    "sunbeam": { name: "Sunbeam", bright: 30, dim: 30, range: 0, dur: "1 minute", rounds: 10, conc: true, place: "caster", spellLevel: 6, magical: true },
    "fire-shield": { name: "Fire Shield", bright: 10, dim: 10, range: 0, dur: "10 minutes", rounds: 100, conc: false, place: "caster", spellLevel: 4, magical: true },
    "sacred-weapon": { name: "Sacred Weapon", bright: 20, dim: 20, range: 0, dur: "", rounds: 0, conc: false, place: "caster", feature: true },
    "branding-smite": { name: "Branding Smite", bright: 0, dim: 5, range: 5, dur: "1 minute", rounds: 10, conc: true, place: "target", spellLevel: 2, magical: true, hpAtMost: 50 }
  };
  var NOT_EMITTERS = ["faerie fire", "spirit guardians", "guiding bolt", "prayer of healing", "sacred flame"];
  var SPELL_KEYS = {
    "light": "spell:light",
    "continual flame": "spell:continual-flame",
    "gas lamp": "spell:continual-flame",
    "dancing lights": "spell:dancing-lights",
    "produce flame": "spell:produce-flame",
    "flame blade": "spell:flame-blade",
    "sunbeam": "spell:sunbeam",
    "fire shield": "spell:fire-shield",
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
  /* "Light Shell" and "Light (Lantern)" are the cantrip. The shell suffix must not miss the table. */
  function spellKey(name) {
    var s = String(name || "").toLowerCase().replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+shell$/i, "").replace(/\s+/g, " ").trim();
    return SPELL_KEYS[s] || "";
  }
  /* Turning Light off drops the placed zone so the bright/dim rings leave with it. */
  function dropCarriedLightZone(c) {
    if (!c || !c.spellMarks || !Array.isArray(c.spellMarks.zones)) return false;
    var before = c.spellMarks.zones.length;
    c.spellMarks.zones = c.spellMarks.zones.filter(function (z) {
      if (!z) return false;
      var key = String(z.key || "").toLowerCase();
      var spell = String(z.spell || "").toLowerCase().replace(/\s+shell$/i, "").trim();
      return key !== "light" && spell !== "light";
    });
    return c.spellMarks.zones.length !== before;
  }
  function lightOn(c) {
    if (!c.lightOn || typeof c.lightOn !== "object") c.lightOn = {};
    return c.lightOn;
  }
  /* Hand and self lights stay on the caster token. Placed spells do not. */
  function spellLights(c) {
    var on = c && c.lightOn || {};
    var have = {};
    knownNames(c).forEach(function (n) { var k = spellKey(n); if (k && k !== "spell:darkvision") have[k] = n; });
    if (c && (c.calling === "lawman" || c.callingId === "lawman")) have["spell:sacred-weapon"] = "Sacred Weapon";
    var list = [];
    Object.keys(have).forEach(function (k) {
      if (!on[k]) return;
      var placed = emitter(String(k).replace(/^spell:/, ""));
      if (placed && placed.place !== "caster") return;
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
          spellLevel: placed && placed.spellLevel != null ? placed.spellLevel : null,
          magical: true,
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
  function hasDevilsSight(c) {
    var inv = [].concat((c && c.invocations) || [], (c && c.invocation) || []);
    var hit = false;
    inv.forEach(function (row) {
      var name = typeof row === "string" ? row : ((row && (row.name || row.id)) || "");
      if (/devil/i.test(name) && /sight/i.test(name)) hit = true;
    });
    return hit;
  }
  /* What the map token should carry. DM douse is applied by the map, not here. */
  function tokenProfile(c) {
    return {
      lights: activeLights(c).map(function (l) {
        return { id: l.id, name: l.name, bright: l.bright, dim: l.dim, cone: !!l.cone, out: false };
      }),
      darkvision: darkvisionFeet(c),
      skulker: hasSkulker(c),
      devilsSight: hasDevilsSight(c)
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
  function normLevel(v) {
    return v === "bright" || v === "dim" ? v : "dark";
  }
  /* A painted region replaces the map ambient inside its box. Later paint wins. */
  function regionContains(region, gx, gy) {
    if (!region) return false;
    var x = num(region.x), y = num(region.y);
    var w = num(region.w), h = num(region.h);
    if (!(w > 0) || !(h > 0)) return false;
    return gx >= x && gy >= y && gx < x + w && gy < y + h;
  }
  function regionBase(gx, gy, regions, ambient) {
    var level = normLevel(ambient);
    (regions || []).forEach(function (r) {
      if (regionContains(r, gx, gy)) level = normLevel(r.level);
    });
    return level;
  }
  /* A DM box or a spell sphere. Doused zones stay in the list and do not cover. */
  function darknessContains(zone, gx, gy) {
    if (!zone || !zone.magicalDark || zone.doused || zone.darkOut) return false;
    if (zone.kind === "box" || (!zone.origin && num(zone.w) > 0 && num(zone.h) > 0)) return regionContains(zone, gx, gy);
    var origin = zone.origin;
    if (!origin || origin.x == null) return false;
    var reach = num(zone.radius) / FT;
    if (!(reach > 0)) return false;
    return Math.hypot(gx - num(origin.x), gy - num(origin.y)) <= reach + 0.001;
  }
  function darknessCovering(gx, gy, zones) {
    var cover = [];
    (zones || []).forEach(function (z) { if (darknessContains(z, gx, gy)) cover.push(z); });
    return cover;
  }
  /* Devil's Sight, 120 ft. Hunger of Hadar still blinds a viewer who is standing inside. */
  function devilSees(zone, viewer, gx, gy) {
    if (!zone || !viewer || !viewer.devilsSight || zone.devilsSightSees === false) return false;
    if (zone.blindedInside && darknessContains(zone, num(viewer.x), num(viewer.y))) return false;
    return Math.hypot(gx - num(viewer.x), gy - num(viewer.y)) * FT <= 120 + 0.05;
  }
  function magicalDarkBlocks(gx, gy, zones, viewers) {
    var cover = darknessCovering(gx, gy, zones);
    if (!cover.length) return false;
    var list = viewers || [];
    var i, j, open;
    for (i = 0; i < cover.length; i++) {
      open = false;
      for (j = 0; j < list.length; j++) {
        if (devilSees(cover[i], list[j], gx, gy)) { open = true; break; }
      }
      if (!open) return true;
    }
    return false;
  }
  /* L0227–L0230. A covered square is dark for everyone. Devil's Sight does not
     turn the light back on; the map's sight test lets that viewer see in the dark. */
  function applyMagicalDarkness(level, gx, gy, zones) {
    if (darknessCovering(gx, gy, zones).length) return "dark";
    return normLevel(level);
  }
  function lightSpellLevel(light) {
    if (!light || light.out || light.doused) return null;
    if (light.spellLevel != null && light.spellLevel !== "" && isFinite(num(light.spellLevel))) return num(light.spellLevel);
    var id = String(light.id || light.catalogId || light.key || light.name || "").toLowerCase();
    if (/daylight/.test(id)) return 3;
    if (/sunbeam|sunburst/.test(id)) return 6;
    if (/wall of fire|wall-of-fire/.test(id)) return 4;
    if (/fire shield|fire-shield/.test(id)) return 4;
    if (/continual|gas lamp|gas-lamp/.test(id)) return 2;
    if (/moonbeam|flame blade|flame-blade|flaming sphere|flaming-sphere|branding/.test(id)) return 2;
    if (/dancing|produce flame|produce-flame/.test(id)) return 0;
    if (/(^|:)light$/.test(id) || id === "light" || /spell:light/.test(id)) return 0;
    if (light.feature) return null;
    if (light.magical || light.spell) return 0;
    return null;
  }
  function lightReachesZone(light, zone) {
    if (!light || !zone || light.out || light.doused) return false;
    var reach = (num(light.bright) + num(light.dim)) / FT;
    if (!(reach > 0) || light.x == null) return false;
    var lx = num(light.x), ly = num(light.y);
    if (zone.kind === "box" || (!zone.origin && num(zone.w) > 0 && num(zone.h) > 0)) {
      var x = num(zone.x), y = num(zone.y), w = num(zone.w), h = num(zone.h);
      var cx = Math.max(x, Math.min(lx, x + w));
      var cy = Math.max(y, Math.min(ly, y + h));
      return Math.hypot(lx - cx, ly - cy) <= reach + 0.05;
    }
    var origin = zone.origin || { x: zone.x, y: zone.y };
    if (!origin || origin.x == null) return false;
    var zoneReach = num(zone.radius) / FT;
    return Math.hypot(lx - num(origin.x), ly - num(origin.y)) <= zoneReach + reach + 0.05;
  }
  /* A 3rd-level or higher light spell whose area overlaps the darkness dispels it.
     Light (0) and Gas Lamp (2) do not. A torch has no spell level. */
  function lightDispelsZone(zone, light) {
    if (!zone || !zone.magicalDark || zone.doused || zone.darkOut) return false;
    var cap = zone.dispelledByLightAtOrAbove != null ? num(zone.dispelledByLightAtOrAbove) : 3;
    var lv = lightSpellLevel(light);
    if (lv == null || lv < cap) return false;
    if (zone.level != null && zone.level !== "" && num(zone.level) > cap) return false;
    return lightReachesZone(light, zone);
  }
  function lightsDispelDark(zone, lights) {
    var i;
    for (i = 0; i < (lights || []).length; i++) if (lightDispelsZone(zone, lights[i])) return true;
    return false;
  }
  function viewerInDarkvision(gx, gy, viewer) {
    if (!viewer) return false;
    var r = squares(viewer.darkvision);
    if (!(r > 0)) return false;
    return Math.hypot(gx - num(viewer.x), gy - num(viewer.y)) <= r + 0.001;
  }
  function stackViewers(opts) {
    var viewers = [];
    if (opts && opts.viewer) viewers.push(opts.viewer);
    if (opts && opts.viewers && opts.viewers.length) viewers = viewers.concat(opts.viewers);
    return viewers;
  }
  /* L0226. ambient → regions → emitters (brightest wins) → magical darkness → one viewer's darkvision.
     Darkvision does not upgrade a square magical darkness still blocks. */
  function stackLevel(gx, gy, opts) {
    opts = opts || {};
    var base = regionBase(gx, gy, opts.regions, opts.ambient);
    var level = rawLevel(gx, gy, opts.emitters || opts.lights, base);
    var viewers = stackViewers(opts);
    if (darknessCovering(gx, gy, opts.darkness).length) return "dark";
    for (var i = 0; i < viewers.length; i++) {
      if (viewerInDarkvision(gx, gy, viewers[i])) return applyDarkvision(level, true);
    }
    return level;
  }
  /* Concentration end drops spell darkness the same way it drops a concentration light. */
  function dropConcDarkness(list, casterId, spellName) {
    var want = bareSpell(spellName);
    var wantKey = want.replace(/\s+/g, "-");
    var kept = [], removed = [];
    (list || []).forEach(function (z) {
      if (!z || !z.magicalDark || !z.conc) { kept.push(z); return; }
      if (!sameCaster(z, casterId)) { kept.push(z); return; }
      if (want && bareSpell(z.spell || z.name) !== want && bareSpell(z.key) !== wantKey && String(z.key || "") !== wantKey) { kept.push(z); return; }
      removed.push(z);
    });
    return { zones: kept, removed: removed };
  }
  function perceptionNote(level, skulker) {
    if (level === "bright") return "Bright light. Sight is normal.";
    if (level === "dim") return skulker ? "Dim light. Skulker: no disadvantage on sight Perception." : "Dim light. Disadvantage on Wisdom (Perception) checks that rely on sight.";
    return "Darkness. Heavily obscured: you are effectively blinded.";
  }
  /* Paper-doll weapon slots a held light may occupy. Long gun stays a two-handed weapon slot. */
  var LIGHT_SLOTS = ["revolver_1", "revolver_2", "melee"];
  var LIGHT_SLOT_NAME = { revolver_1: "Pistol L", revolver_2: "Pistol R", melee: "Melee" };
  function lightSlotOf(item) {
    var s = item && item.lightSlot;
    return LIGHT_SLOTS.indexOf(s) >= 0 ? s : "";
  }
  function slotName(key) { return LIGHT_SLOT_NAME[key] || ""; }
  function handLights(c) {
    return items(c).filter(function (it) {
      var spec = specFor(it);
      return !!(spec && spec.slot === "hand");
    });
  }
  function lightInSlot(c, key) {
    if (LIGHT_SLOTS.indexOf(key) < 0) return null;
    return items(c).filter(function (it) {
      if (!it || !it.lightHeld || lightSlotOf(it) !== key) return false;
      var spec = specFor(it);
      return !!(spec && spec.slot === "hand");
    })[0] || null;
  }
  function weaponHandsInSlot(c, key) {
    var D = root.SSDNSDoll;
    if (!D || !D.weaponRow) return 0;
    var row = D.weaponRow(c, key);
    if (!row || row.equipped === false) return 0;
    var w = row.w;
    var props = String((w && w.properties) || "");
    if (row.kind === "gun" && twoHanded(w)) return 2;
    if (row.kind === "melee" && w && (twoHanded(w) || (row.g && row.g.twoHand && /versatile/i.test(props)))) return 2;
    return 1;
  }
  /* Prefer an empty hand slot. Fall back to one a weapon can be lifted out of. */
  function pickLightSlot(c, uid, prefer) {
    if (prefer && LIGHT_SLOTS.indexOf(prefer) >= 0) return prefer;
    var i, key, busy = "";
    for (i = 0; i < LIGHT_SLOTS.length; i++) {
      key = LIGHT_SLOTS[i];
      if (lightInSlot(c, key) && lightInSlot(c, key).uid !== uid) continue;
      if (!weaponHandsInSlot(c, key)) return key;
      if (!busy) busy = key;
    }
    return busy;
  }
  /* Fill lightSlot for a light that is already in hand, without stealing a weapon. */
  function ensureSlots(c) {
    if (!c) return;
    handLights(c).forEach(function (it) {
      if (!it.lightHeld || lightSlotOf(it)) return;
      var slot = pickLightSlot(c, it.uid);
      if (!slot || weaponHandsInSlot(c, slot)) return;
      if (lightInSlot(c, slot)) return;
      it.lightSlot = slot;
    });
  }
  function hold(c, uid, on, slot) {
    var it = items(c).filter(function (x) { return x && x.uid === uid; })[0];
    if (!it) return { ok: false, reason: "No item." };
    var spec = specFor(it);
    if (!spec || spec.slot !== "hand") return { ok: false, reason: "That light isn't held in a hand." };
    if (!on) {
      it.lightHeld = false;
      it.lightSlot = "";
      return { ok: true, item: it, held: false, slot: "" };
    }
    if (slot && LIGHT_SLOTS.indexOf(slot) < 0) return { ok: false, reason: "A held light goes in Pistol L, Pistol R, or Melee." };
    var want = pickLightSlot(c, uid, slot);
    if (!want) return { ok: false, reason: "No free hand. A torch takes a hand, and a two-handed gun or a shield plus a weapon can fill both." };
    var cost = weaponHandsInSlot(c, want);
    if (handsUsed(c, uid) - cost + 1 > 2) {
      return { ok: false, reason: "No free hand. A torch takes a hand, and a two-handed gun or a shield plus a weapon can fill both." };
    }
    var D = root.SSDNSDoll;
    if (cost && D && D.setWeapon) {
      var freed = D.setWeapon(c, want, "");
      if (freed && freed.ok === false) return freed;
    }
    items(c).forEach(function (other) {
      if (!other || other === it) return;
      if (other.lightSlot === want) { other.lightHeld = false; other.lightSlot = ""; }
    });
    it.lightHeld = true;
    it.lightOut = false;
    it.lightSlot = want;
    return { ok: true, item: it, held: true, slot: want, slotName: slotName(want) };
  }
  function setHood(c, uid, down) {
    var it = items(c).filter(function (x) { return x && x.uid === uid; })[0];
    if (!it) return { ok: false, reason: "No item." };
    var spec = specFor(it);
    if (!spec || !spec.hood) return { ok: false, reason: "Only a hooded lamp has a hood." };
    it.hoodDown = !!down;
    return { ok: true, item: it, hoodDown: !!down };
  }
  function bareSpell(name) {
    return String(name || "").toLowerCase().replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+shell$/i, "").replace(/\s+/g, " ").trim();
  }
  function emitter(name) {
    var s = bareSpell(name).replace(/^spell:/, "");
    if (s === "gas lamp") s = "continual flame";
    var key = s.replace(/\s+/g, "-");
    if (!EMITTERS[key]) return null;
    var row = EMITTERS[key];
    return {
      key: key, id: "spell:" + key, name: row.name, bright: row.bright, dim: row.dim,
      range: row.range || 0, dur: row.dur || "", rounds: row.rounds || 0, conc: !!row.conc,
      place: row.place || "point", unwilling: row.unwilling || "", spellLevel: row.spellLevel != null ? row.spellLevel : null,
      magical: row.magical !== false, max: row.max || 0, cluster: row.cluster || 0, move: row.move || 0,
      feature: !!row.feature, houseRadius: !!row.houseRadius, hpAtMost: row.hpAtMost || 0
    };
  }
  function gridFeet(a, b) {
    if (!a || !b || a.x == null || b.x == null) return Infinity;
    return Math.hypot(num(a.x) - num(b.x), num(a.y) - num(b.y)) * FT;
  }
  function inRangeOf(caster, point, rangeFt) {
    if (!(rangeFt > 0)) return true;
    if (!caster) return false;
    return gridFeet(caster, point) <= rangeFt + 0.05;
  }
  /* Each orb must sit within `feet` of at least one other. One orb is always fine. */
  function clusterOk(points, feet) {
    var list = points || [];
    if (list.length <= 1) return true;
    var i, j, ok;
    for (i = 0; i < list.length; i++) {
      ok = false;
      for (j = 0; j < list.length; j++) {
        if (i === j) continue;
        if (gridFeet(list[i], list[j]) <= feet + 0.05) { ok = true; break; }
      }
      if (!ok) return false;
    }
    return true;
  }
  function canAddOrb(orbs, point, caster, spec) {
    spec = spec || emitter("dancing-lights");
    if (!spec || spec.place !== "orbs") return { ok: false, reason: "Not a cluster of lights." };
    if (!point || point.x == null) return { ok: false, reason: "Pick a square." };
    var next = (orbs || []).concat([point]);
    if (next.length > (spec.max || 4)) return { ok: false, reason: "Dancing Lights is four orbs." };
    if (!inRangeOf(caster, point, spec.range)) return { ok: false, reason: "Out of range (120 ft)." };
    if (!clusterOk(next, spec.cluster || 20)) return { ok: false, reason: "Each light must be within 20 ft of another." };
    return { ok: true, orbs: next };
  }
  function canDragOrb(orbs, index, to, caster, spec, from) {
    spec = spec || emitter("dancing-lights");
    if (!spec || index < 0 || !to) return { ok: false, reason: "That light can't move." };
    if (gridFeet(from, to) > (spec.move || 60) + 0.05) return { ok: false, reason: "A bonus action moves the lights up to 60 ft." };
    if (!inRangeOf(caster, to, spec.range)) return { ok: false, reason: "That spot is out of range." };
    var next = (orbs || []).map(function (p, i) { return i === index ? to : p; });
    if (!clusterOk(next, spec.cluster || 20)) return { ok: false, reason: "Each light must stay within 20 ft of another." };
    return { ok: true, orbs: next };
  }
  function hostileTarget(target, caster) {
    if (!target) return false;
    if (target.spellPiece) return false;
    if (caster && target.id && caster.id && target.id === caster.id) return false;
    if (target.ownerUid && caster && caster.ownerUid && target.ownerUid === caster.ownerUid) return false;
    if (target.ownerUid || target.kind === "player" || target.kind === "friendly") return false;
    return true;
  }
  function needsUnwillingSave(spec, target, caster) {
    if (!spec || spec.unwilling !== "DEX" || !target) return false;
    return hostileTarget(target, caster);
  }
  function dexSave(roll, mod, dc) {
    var face = num(roll), bonus = num(mod), need = num(dc);
    var total = face + bonus;
    return { roll: face, mod: bonus, total: total, dc: need, passed: total >= need };
  }
  function shortDur(dur) {
    var s = String(dur || "").toLowerCase();
    if (!s) return "";
    if (s.indexOf("dispel") >= 0) return "until dispelled";
    var hrs = s.match(/(\d+)\s*hour/);
    if (hrs) return hrs[1] + " hr";
    var mins = s.match(/(\d+)\s*min/);
    if (mins) return mins[1] + " min";
    return String(dur);
  }
  function borrowedText(row) {
    if (!row) return "";
    var who = row.casterName || "someone";
    var dur = shortDur(row.dur || row.durLabel || "");
    return (row.name || "Light") + " from " + who + (dur ? ", " + dur : "");
  }
  function borrowedRow(em) {
    var text = borrowedText(em);
    return {
      id: em.id || "", spell: em.name || "Light", key: em.key || "", name: em.name || "Light",
      bright: num(em.bright), dim: num(em.dim), casterName: em.casterName || "", casterId: em.casterId || "",
      dur: em.dur || "", text: text
    };
  }
  function tickEmitters(list, steps) {
    var n = steps == null ? 1 : num(steps);
    var kept = [], removed = [];
    (list || []).forEach(function (em) {
      if (!em) return;
      var copy = Object.assign({}, em);
      var total = copy.rounds > 0 ? num(copy.rounds) : 0;
      if (!(total > 0) || !(n > 0)) { kept.push(copy); return; }
      var left = copy.roundsLeft != null && isFinite(num(copy.roundsLeft)) ? num(copy.roundsLeft) : total;
      copy.roundsLeft = left - n;
      if (copy.roundsLeft <= 0) removed.push(copy);
      else kept.push(copy);
    });
    return { emitters: kept, removed: removed };
  }
  function sameCaster(em, casterId) {
    if (!casterId || !em) return true;
    if (!em.casterId && !em.casterUid) return true;
    var want = String(casterId);
    return String(em.casterId || "") === want || String(em.casterUid || "") === want;
  }
  function dropConcEmitters(list, casterId, spellName) {
    var want = bareSpell(spellName);
    var wantKey = want.replace(/\s+/g, "-");
    var kept = [], removed = [];
    (list || []).forEach(function (em) {
      if (!em || !em.conc) { kept.push(em); return; }
      if (!sameCaster(em, casterId)) { kept.push(em); return; }
      if (want && bareSpell(em.name) !== want && bareSpell(em.key) !== wantKey && String(em.key || "") !== wantKey) { kept.push(em); return; }
      removed.push(em);
    });
    return { emitters: kept, removed: removed };
  }
  function dropHandForSpell(c, spellName) {
    var spec = emitter(spellName);
    if (!spec || spec.place !== "caster" || !spec.conc) return false;
    setSpell(c, spec.id, false);
    return true;
  }
  /* Points every 10 ft along a wall, in the same grid units as zone.origin. */
  function wallLightPoints(zone) {
    if (!zone || !zone.origin || zone.origin.x == null) return [];
    var length = num(zone.length) || 60;
    var face = num(zone.facing);
    var dx = Math.cos(face), dy = Math.sin(face);
    var half = (length / FT) / 2;
    var pts = [], d;
    for (d = -half; d <= half + 0.01; d += 2) {
      pts.push({ x: num(zone.origin.x) + dx * d, y: num(zone.origin.y) + dy * d });
    }
    return pts;
  }
  function dismissSpell(key) {
    try {
      if (typeof root.dispatchEvent === "function" && typeof root.CustomEvent === "function") {
        root.dispatchEvent(new root.CustomEvent("ssdns-light-dismiss", { detail: { key: key } }));
      }
    } catch (e) {}
  }
  function setSpell(c, key, on) {
    var bag = lightOn(c);
    var spec = emitter(String(key).replace(/^spell:/, ""));
    if (key === "spell:dancing-lights") bag[key] = on ? (num(bag[key + ":n"]) || 4) : 0;
    else bag[key] = !!on;
    if (on && spec && spec.place === "caster" && spec.rounds > 0) bag[key + ":left"] = spec.rounds;
    if (!on) {
      delete bag[key + ":left"];
      if (key === "spell:light") dropCarriedLightZone(c);
      if (key === "spell:light" || (spec && spec.place !== "caster")) dismissSpell(key);
    }
    return bag;
  }
  /* Hand lights (Produce Flame, Flame Blade, Sunbeam, Fire Shield) ride the token.
     The fight clock spends their rounds. Placed emitters tick on the map. */
  function tickHandLights(c, steps) {
    if (!c) return false;
    var n = num(steps);
    if (!(n > 0)) return false;
    var bag = lightOn(c);
    var changed = false;
    Object.keys(EMITTERS).forEach(function (key) {
      var spec = EMITTERS[key];
      var id = "spell:" + key;
      if (!spec || spec.place !== "caster" || !(spec.rounds > 0) || !bag[id]) return;
      var left = bag[id + ":left"];
      if (left == null) left = spec.rounds;
      left = num(left) - n;
      if (left <= 0) { setSpell(c, id, false); changed = true; }
      else { bag[id + ":left"] = left; changed = true; }
    });
    return changed;
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
        var spec = emitter(String(key).replace(/^spell:/, ""));
        var placed = spec && spec.place && spec.place !== "caster" && spec.place !== "target";
        var lit = !!lightOn(cur)[key];
        if (placed && !lit) {
          try {
            root.dispatchEvent(new root.CustomEvent("ssdns-aim-light", { detail: { key: spec.key, name: spec.name } }));
          } catch (err) {}
          return;
        }
        var next = !lit;
        if (root.SSDNSApp && root.SSDNSApp.applyPatch) root.SSDNSApp.applyPatch(function (d) { if (d && d.character) setSpell(d.character, key, next); });
        else setSpell(cur, key, next);
        paintBox();
        if (root.SSDNSItems && root.SSDNSItems.paintSheet) root.SSDNSItems.paintSheet();
      });
    }
    if (!box) return;
    if (!c) { box.hidden = true; return; }
    ensureSlots(c);
    var lights = activeLights(c);
    var dv = darkvisionFeet(c);
    var sk = hasSkulker(c);
    var known = {};
    knownNames(c).forEach(function (n) { var k = spellKey(n); if (k) known[k] = n; });
    if (c.calling === "lawman" || c.callingId === "lawman") known["spell:sacred-weapon"] = "Sacred Weapon";
    var on = c.lightOn || {};
    var spells = Object.keys(known).map(function (k) {
      var label = k === "spell:sacred-weapon" ? "Sacred Weapon" : (k === "spell:darkvision" ? "Owl Eyes" : (TABLE[k] ? TABLE[k].name : known[k]));
      var spec = emitter(String(k).replace(/^spell:/, ""));
      var placed = spec && spec.place && spec.place !== "caster" && spec.place !== "target";
      var lit = !!on[k];
      var verb = placed ? (lit ? " · drop" : " · place") : (lit ? " · on" : " · off");
      return '<button type="button" class="btn xs light-spell' + (lit ? " btn-primary" : "") + '" data-light-spell="' + esc(k) + '">' + esc(label) + verb + "</button>";
    }).join(" ");
    var line = lights.length ? lights.map(function (l) {
      return esc(l.name) + " " + (l.bright ? l.bright + "/" + l.dim : "dim " + l.dim) + (l.cone ? " cone" : "");
    }).join(" · ") : "No light in hand or on a trinket.";
    var borrowed = (c.borrowedLights || []).map(function (row) { return esc((row && (row.text || borrowedText(row))) || ""); }).filter(Boolean).join(" · ");
    box.hidden = false;
    box.innerHTML = '<div class="light-head"><h3>Light</h3><span class="fine">No burn timer. The DM can put a light out.</span></div>' +
      '<p class="light-now" data-light-now>' + line + "</p>" +
      (borrowed ? '<p class="light-borrowed" data-light-borrowed>' + borrowed + "</p>" : "") +
      '<p class="fine">Darkvision ' + (dv ? dv + " ft (dim counts as bright, dark as dim" + (sk ? ", Skulker ignores dim disadvantage" : "") + ")" : "none") +
      ". Hands in use " + Math.min(2, handsUsed(c)) + " / 2.</p>" +
      (spells ? '<div class="light-spells">' + spells + "</div>" : "");
  }

  root.SSDNSLighting = {
    FT: FT, TABLE: TABLE, specFor: specFor, radii: radii, handsUsed: handsUsed, hold: hold, setHood: setHood,
    LIGHT_SLOTS: LIGHT_SLOTS, lightSlotOf: lightSlotOf, slotName: slotName, handLights: handLights,
    lightInSlot: lightInSlot, ensureSlots: ensureSlots, pickLightSlot: pickLightSlot,
    setSpell: setSpell, douseItem: douseItem, litItem: litItem, activeLights: activeLights, spellLights: spellLights,
    EMITTERS: EMITTERS, NOT_EMITTERS: NOT_EMITTERS, emitter: emitter, gridFeet: gridFeet, inRangeOf: inRangeOf,
    clusterOk: clusterOk, canAddOrb: canAddOrb, canDragOrb: canDragOrb, hostileTarget: hostileTarget,
    needsUnwillingSave: needsUnwillingSave, dexSave: dexSave, borrowedText: borrowedText, borrowedRow: borrowedRow,
    shortDur: shortDur, tickEmitters: tickEmitters, tickHandLights: tickHandLights, dropConcEmitters: dropConcEmitters, dropHandForSpell: dropHandForSpell,
    wallLightPoints: wallLightPoints,
    knownNames: knownNames, spellKey: spellKey, knowsOwlEyes: knowsOwlEyes, darkvisionFeet: darkvisionFeet,
    hasSkulker: hasSkulker, hasDevilsSight: hasDevilsSight, tokenProfile: tokenProfile, squares: squares, rawLevel: rawLevel, seenLevel: seenLevel,
    applyDarkvision: applyDarkvision, perceptionNote: perceptionNote, paintBox: paintBox,
    normLevel: normLevel, regionContains: regionContains, regionBase: regionBase,
    applyMagicalDarkness: applyMagicalDarkness, stackLevel: stackLevel,
    darknessContains: darknessContains, magicalDarkBlocks: magicalDarkBlocks, devilSees: devilSees,
    lightSpellLevel: lightSpellLevel, lightDispelsZone: lightDispelsZone, lightsDispelDark: lightsDispelDark,
    dropConcDarkness: dropConcDarkness
  };
})(typeof window !== "undefined" ? window : globalThis);

/* Act I chest roller (DRAFT v1.4 tables).
   Order: gate lock/nails/hide → picks → band % → row % → qty → caps → band fallback → ES/Black → Letter scroll-chance.
   Locked: #gun-act1 is 20% each of five guns. Outlaw Stash Black is blackOn [1] on 1d6×50 → 1d4 black-shard-junk.
   Glowing Letters are a d100 scroll-chance after the picks (they do not take a loot pick or a Rare-magic slot).
   Letter mix is locked Friendlier: sealed 35, Cure 24, Shield 24, Fireball 12, Revivify 5.
   Other Story Finds stay never-roll. RNG percentages are the balance floor.
   The chapter budget warns only. DM hand-pick and Rare override always win.
   d100 is 1–100 (die). A chance of 70 hits on 1–70. */
(function (root) {
  "use strict";
  var BANDS = ["rare", "uncommon", "common"];
  var GUNS = {
    "herringer-light-pocket-pistol": "Herringer Light Pocket Pistol",
    "single-barrel-farm-shotgun": "Single-Barrel Farm Shotgun",
    "dulls-rolling-block-rifle": "Dulls Rolling-Block Rifle",
    "dullards-light-carbine": "Dullards Light Carbine",
    "navy-army-ball-n-cap-revolver": "Navy / Army Ball n Cap Revolver"
  };
  var AMMO = {
    "cartridges-light-20": { type: "cartridge", caliber: "Light", each: 20, name: "Light cartridges" },
    "cartridges-medium-20": { type: "cartridge", caliber: "Medium", each: 20, name: "Medium cartridges" },
    "cartridges-heavy-20": { type: "cartridge", caliber: "Heavy", each: 20, name: "Heavy cartridges" },
    "shells-12-ga-10": { type: "buck", caliber: "12 ga", each: 10, name: "12 ga buckshot" },
    "slugs-12-ga-10": { type: "slug", caliber: "12 ga", each: 10, name: "Slugs, 12 ga" },
    "slugs-410-10": { type: "slug", caliber: ".410", each: 10, name: "Slugs, .410" },
    "slugs-10-ga-10": { type: "slug", caliber: "10 ga", each: 10, name: "Slugs, 10 ga" },
    "arrows-dynamite-1": { type: "arrows", caliber: "dynamite", each: 1, name: "Dynamite arrow", lb: 1.05 },
    "powder-ball-and-caps-20-shots": { type: "percussion", caliber: "", each: 20, name: "powder, ball and caps" },
    "arrows-20": { type: "arrows", caliber: "", each: 20, name: "arrows" },
    "crossbow-bolts-20": { type: "bolts", caliber: "", each: 20, name: "crossbow bolts" },
    "arrows-fire-5": { type: "arrows", caliber: "fire", each: 5, name: "fire arrows" },
    "arrows-poison-3": { type: "arrows", caliber: "poison", each: 3, name: "poison arrows" }
  };
  var LETTERS = {
    "glowing-letter": "Glowing Letter (sealed)",
    "glowing-letter-cure-wounds": "Glowing Letter: Cure Wounds",
    "glowing-letter-shield": "Glowing Letter: Shield",
    "glowing-letter-fireball": "Glowing Letter: Fireball",
    "glowing-letter-revivify": "Glowing Letter: Revivify"
  };
  var BUDGET = { saddlebag: 450, "supply-crate": 465, "outlaw-stash": 1125, strongbox: 2115, "sealed-crate": 0 };
  var CHAPTER = { 1: 465, 2: 2490, 3: 2490, 4: 4140, 5: 0 };
  var TABLES = {};
  var SEALED = {
    id: "act1-sealed-crate", name: "Sealed Crate", boxType: "sealed-crate", act: 1, actMin: 2, draft: false,
    picks: "0", bands: {}, rows: {}, subTables: {}, cash: null,
    label: "DO NOT OPEN, Act I", caps: {}, rareLimit: "room", fallback: "dropBand"
  };

  function rngOf(rng) { return typeof rng === "function" ? rng : Math.random; }
  function die(sides, rng) { return 1 + Math.floor(rngOf(rng)() * sides); }
  function rollQty(expr, rng) {
    var s = String(expr == null || expr === "" ? "1" : expr).trim();
    var m = s.match(/^(\d+)d(\d+)(?:x(\d+))?$/i);
    if (!m) {
      var n = parseInt(s, 10);
      return { total: isFinite(n) ? n : 1, faces: [], sum: isFinite(n) ? n : 1, mult: 1 };
    }
    var count = parseInt(m[1], 10), sides = parseInt(m[2], 10), mult = m[3] ? parseInt(m[3], 10) : 1;
    var faces = [], sum = 0, i;
    for (i = 0; i < count; i++) { var f = die(sides, rng); faces.push(f); sum += f; }
    return { total: sum * mult, faces: faces, sum: sum, mult: mult };
  }
  function pickWeighted(rows, rng) {
    var total = 0, i, acc = 0, roll;
    for (i = 0; i < rows.length; i++) total += Number(rows[i].w) || 0;
    if (!total || !rows.length) return null;
    roll = rngOf(rng)() * total;
    for (i = 0; i < rows.length; i++) {
      acc += Number(rows[i].w) || 0;
      if (roll < acc) return rows[i];
    }
    return rows[rows.length - 1];
  }
  function tagOf(id) {
    var src = (root.SSDNS_LOOT_TAGS || {})[id] || {};
    var o = {};
    Object.keys(src).forEach(function (k) { o[k] = src[k]; });
    var cat = null;
    try { cat = root.SSDNSItems && root.SSDNSItems.byId ? root.SSDNSItems.byId(id) : null; } catch (e) { cat = null; }
    if (cat) {
      if (o.storyOnly == null && (cat.story || cat.dmOnly || cat.dmPlace || cat.type === "quest")) o.storyOnly = true;
      if (o.lootable == null && cat.forSale && cat.price != null) o.lootable = true;
      if (o.rarity == null && cat.rarity) o.rarity = String(cat.rarity).toLowerCase();
      if (o.requiresAttunement == null && cat.attune) o.requiresAttunement = true;
    }
    if (/legloss/i.test(id)) o.storyOnly = true;
    if (o.storyOnly) o.lootable = false;
    if (o.lootable == null) o.lootable = !o.storyOnly;
    o.tags = [].concat(o.tags || []);
    return o;
  }
  function isGun(id) { return !!GUNS[id] || /^pony-arms-chaosmaker|^lancaster-|^bison-big-fifty/.test(id); }
  function isLetter(id) { return /^glowing-letter/.test(id); }
  function isExplosive(id) {
    var t = tagOf(id);
    return id === "arrows-dynamite-1" || t.tags.indexOf("explosive") >= 0 || /^dynamite-|^blasting-keg$/.test(id);
  }
  function isConsumable(id) {
    var t = tagOf(id);
    if (t.stack) return true;
    if (AMMO[id]) return true;
    return t.tags.some(function (x) { return x === "food" || x === "drink" || x === "ammo" || x === "junk" || x === "explosive"; });
  }
  function magicRare(id) {
    var t = tagOf(id);
    if (t.magic === false || t.mundane) return false;
    var rare = String(t.rarity || "").toLowerCase() === "rare";
    return rare && (t.magic === true || t.requiresAttunement === true);
  }
  function rareCap(ctx) {
    ctx = ctx || {};
    if (ctx.overrideRare) return Infinity;
    if (ctx.rareLimit != null && ctx.rareLimit !== "room" && isFinite(Number(ctx.rareLimit))) return Number(ctx.rareLimit);
    return (Number(ctx.partyLevel) || 1) >= 4 ? 1 : 0;
  }
  function illegalReason(id, state, ctx) {
    if (!id || id.charAt(0) === "#") return "";
    var t = tagOf(id);
    var act = Number(ctx.act) || 1;
    if (t.storyOnly) return "storyOnly";
    if (t.noBand) return "noBand";
    if (t.lootable === false && t.actMin == null) return "not lootable";
    if (t.actMin != null && act < Number(t.actMin)) return "actMin";
    if (t.actMax != null && act > Number(t.actMax)) return "actMax";
    if (t.lootable === false) return "not lootable";
    if (magicRare(id) && ((ctx.rareMagicHeld || 0) + (state.magicRare || 0)) >= rareCap(ctx)) return "rare limit";
    if ((isGun(id)) && state.guns >= ((state.caps && state.caps.gun) || 1)) return "gun cap";
    if (isExplosive(id) && state.explosives >= ((state.caps && state.caps.explosive) || 1)) return "explosive cap";
    if (isLetter(id) && state.letters >= ((state.caps && state.caps.glowingLetter) || 1)) return "letter cap";
    if (!isConsumable(id) && state.seen[id]) return "duplicate permanent";
    if (t.maxPerBox != null && (state.counts[id] || 0) >= Number(t.maxPerBox)) return "maxPerBox";
    return "";
  }
  function legalRows(rows, state, ctx) {
    return (rows || []).filter(function (row) {
      if (!row || !row.id) return false;
      if (row.id === "#gun-act1") return state.guns < ((state.caps && state.caps.gun) || 1);
      if (row.id === "#glowing-letter-act1") return state.letters < ((state.caps && state.caps.glowingLetter) || 1);
      if (row.id.charAt(0) === "#") return true;
      return !illegalReason(row.id, state, ctx);
    });
  }
  function dropBand(band) {
    var i = BANDS.indexOf(band);
    if (i < 0) return "common";
    return BANDS[i + 1] || null;
  }
  function blankState(table) {
    var caps = { gun: 1, explosive: 1, glowingLetter: 1, noDupePermanent: true };
    var src = (table && table.caps) || {};
    Object.keys(src).forEach(function (k) { caps[k] = src[k]; });
    if (table && table.letterChance && table.letterChance.max) caps.glowingLetter = table.letterChance.max;
    return { guns: 0, explosives: 0, letters: 0, magicRare: 0, seen: {}, counts: {}, caps: caps, picks: [] };
  }
  function notePick(state, id) {
    state.counts[id] = (state.counts[id] || 0) + 1;
    if (!isConsumable(id)) state.seen[id] = 1;
    if (isGun(id)) state.guns += 1;
    if (isExplosive(id)) state.explosives += 1;
    if (isLetter(id)) state.letters += 1;
    if (magicRare(id)) state.magicRare += 1;
  }
  function onePick(table, state, ctx, rng) {
    var bands = table.bands || {};
    var choices = Object.keys(bands).map(function (k) { return { id: k, w: Number(bands[k]) || 0 }; }).filter(function (r) { return r.w > 0; });
    var first = pickWeighted(choices, rng);
    var band = first && first.id;
    var guard = 0;
    while (band && guard++ < 8) {
      var pool = legalRows((table.rows || {})[band], state, ctx);
      if (!pool.length) { band = dropBand(band); continue; }
      var row = pickWeighted(pool, rng);
      if (!row) { band = dropBand(band); continue; }
      var id = row.id;
      var dirty = !!row.dirty;
      var fromGun = id === "#gun-act1";
      if (id.charAt(0) === "#") {
        var sub = (table.subTables || {})[id];
        var grown = legalRows(sub && sub.rows, state, ctx);
        if (!grown.length) { band = dropBand(band); continue; }
        var g = pickWeighted(grown, rng);
        if (!g) { band = dropBand(band); continue; }
        id = g.id;
        if (fromGun) dirty = true;
      }
      if (illegalReason(id, state, ctx)) { band = dropBand(band); continue; }
      var qty = rollQty(row.qty || "1", rng).total;
      var pick = { id: id, qty: qty, dirty: !!dirty && isGun(id), band: band, hand: false, name: nameOf(id) };
      if (isGun(id)) pick.dirty = true;
      notePick(state, id);
      return pick;
    }
    return null;
  }
  function rollCash(table, rng) {
    var cash = table.cash;
    if (!cash || !cash.dice) return { es: 0, black: 0, blackId: "", faces: [], branch: "none" };
    var rolled = rollQty(cash.dice, rng);
    var face = rolled.faces[0];
    var on = cash.blackOn || [];
    if (on.length && on.indexOf(face) >= 0) {
      var shards = rollQty(cash.blackDice || "1d4", rng);
      return { es: 0, black: shards.total, blackId: cash.blackId || "black-shard-junk", faces: rolled.faces, blackFaces: shards.faces, branch: "black" };
    }
    return { es: rolled.total, black: 0, blackId: "", faces: rolled.faces, branch: "es" };
  }
  function nameOf(id) {
    if (GUNS[id]) return GUNS[id];
    if (AMMO[id]) return AMMO[id].each > 1 ? AMMO[id].name + " (" + AMMO[id].each + ")" : AMMO[id].name;
    if (LETTERS[id]) return LETTERS[id];
    if (id === "black-shard-junk") return "Black shard (drained)";
    if (id === "assay-tonic-trail-draught") return "Healing Libation";
    try {
      var row = root.SSDNSItems && root.SSDNSItems.byId && root.SSDNSItems.byId(id);
      if (row && row.name) return row.name;
    } catch (e) {}
    return id;
  }
  function rollLetters(table, state, ctx, rng, log) {
    var chance = table.letterChance || null;
    var max = (chance && chance.max) || (state.caps && state.caps.glowingLetter) || 0;
    var sub = (table.subTables || {})["#glowing-letter-act1"];
    function addOne() {
      var rows = legalRows(sub && sub.rows, state, ctx);
      var g = pickWeighted(rows, rng);
      if (!g || illegalReason(g.id, state, ctx)) return false;
      var pick = { id: g.id, qty: 1, dirty: false, band: "letter", hand: false, name: nameOf(g.id) };
      notePick(state, g.id);
      state.picks.push(pick);
      log.push("letter: 1 × " + pick.name);
      return true;
    }
    if (ctx.letterForce === 0 || ctx.letterForce === "0") {
      log.push("DM letters 0");
      return;
    }
    if (ctx.letterForce != null && ctx.letterForce !== "" && isFinite(Number(ctx.letterForce))) {
      var want = Math.max(0, Math.min(max, Number(ctx.letterForce)));
      var n = 0, i;
      for (i = 0; i < want; i++) if (addOne()) n += 1;
      log.push("DM letters " + n);
      return;
    }
    if (!chance || !max || !chance.first || !sub) return;
    var first = die(100, rng);
    if (first > Number(chance.first)) return;
    addOne();
    if (chance.second && state.letters < max) {
      var second = die(100, rng);
      if (second <= Number(chance.second)) addOne();
    }
  }
  function rollBox(table, ctx, rng) {
    ctx = ctx || {};
    rng = rngOf(rng);
    var state = blankState(table);
    var n = rollQty(table.picks || "1", rng).total;
    var i, log = [];
    if (ctx.overrideRare) log.push("DM Rare-limit override");
    for (i = 0; i < n; i++) {
      var pick = onePick(table, state, ctx, rng);
      if (pick) {
        state.picks.push(pick);
        log.push(pick.band + ": " + pick.qty + " × " + pick.name + (pick.dirty ? " (Dirty)" : ""));
      }
    }
    var cash = rollCash(table, rng);
    if (cash.branch === "black") log.push("Black: " + cash.black + " × " + nameOf(cash.blackId) + " (d6 " + cash.faces.join(",") + ")");
    else if (cash.branch === "es") log.push("ES " + cash.es);
    rollLetters(table, state, ctx, rng, log);
    return {
      tableId: table.id, name: table.name, boxType: table.boxType, draft: table.draft !== false,
      picks: state.picks, cash: cash, log: log, actMin: table.actMin || null
    };
  }
  function clampDc(n) {
    n = Math.round(Number(n) || 0);
    if (n <= 0) return 0;
    if (n < 10) return 10;
    if (n > 15) return 15;
    return n;
  }
  function dcIn(range, rng) {
    var lo = Array.isArray(range) ? Number(range[0]) : Number(range);
    var hi = Array.isArray(range) ? Number(range[1]) : lo;
    lo = clampDc(lo);
    hi = clampDc(hi);
    if (hi < lo) hi = lo;
    return lo + Math.floor(rngOf(rng)() * (hi - lo + 1));
  }
  function freshLock(dc, method, keyItem, jamOnFail) {
    return {
      dc: dc,
      method: method || [],
      keyItem: keyItem || "",
      forceDc: dc,
      jamOnFail: !!jamOnFail,
      jammed: false,
      unlocked: !(dc > 0)
    };
  }
  function seedAccess(table, rng, ctx) {
    rng = rngOf(rng);
    ctx = ctx || {};
    table = table || {};
    var d = table.defaults || {};
    var type = table.boxType || "";
    var jam = !!d.jamOnFail;
    var access = {
      lock: freshLock(0, [], "", jam),
      barrier: null,
      hidden: false,
      hideDc: 0,
      found: true,
      trap: null
    };
    if (type === "supply-crate") {
      access.barrier = { type: "nailed", strDc: d.strDc || 10, pryBarAuto: d.pryBarAuto !== false, cleared: false };
      if (rng() < (d.lockRate != null ? Number(d.lockRate) : 0.2)) {
        access.lock = freshLock(dcIn(d.lockDc || [10, 12], rng), d.lockMethod || ["tools"], "", jam);
      }
    } else if (type === "outlaw-stash") {
      access.hidden = d.hidden !== false;
      access.hideDc = d.hideDc || 13;
      access.found = !access.hidden;
      if (rng() < (d.lockRate != null ? Number(d.lockRate) : 0.7)) {
        access.lock = freshLock(dcIn(d.lockDc || [12, 14], rng), d.lockMethod || ["tools", "force"], d.keyItem || "", jam);
      }
    } else if (type === "strongbox") {
      var dc = clampDc(d.lockDc || 15);
      access.lock = freshLock(dc, d.lockMethod || ["tools", "force"], d.keyItem || "strongbox-key", jam);
    }
    return access;
  }
  function blocked(box) {
    if (!box) return "";
    if (box.hidden && !box.found) return "hidden";
    if (box.barrier && box.barrier.type === "nailed" && !box.barrier.cleared) return "nailed";
    if (box.lock && box.lock.dc > 0 && !box.lock.unlocked) return "locked";
    return "";
  }
  function gateReason(box, gate) {
    if (gate === "hidden") return "Still hidden. Search it first.";
    if (gate === "nailed") return "Still nailed shut.";
    if (gate === "locked") return "Still locked.";
    return "Still shut.";
  }
  function sheetBlob(sheet) {
    sheet = sheet || {};
    return [sheet.equipment, sheet.features, sheet.proficienciesLanguages, sheet.proficiencies, sheet.tools].join("\n");
  }
  function hasItem(sheet, id) {
    if (!sheet || !id) return false;
    var items = sheet.items || [];
    var i;
    for (i = 0; i < items.length; i++) {
      var it = items[i];
      if (!it) continue;
      if ((it.catalogId || it.id) === id && (it.count == null || Number(it.count) > 0)) return true;
    }
    var text = sheetBlob(sheet);
    if (id === "claim-pry-bar" && /pry-bar|pry bar|crowbar/i.test(text)) return true;
    if (id === "strongbox-key" && /strongbox key/i.test(text)) return true;
    return false;
  }
  function hasPry(sheet) {
    return hasItem(sheet, "claim-pry-bar") || hasItem(sheet, "pry-bar");
  }
  function abilityModFrom(sheet, key) {
    sheet = sheet || {};
    var mods = sheet.mods || {};
    if (isFinite(Number(mods[key]))) return Number(mods[key]);
    var ab = sheet.abilities || {};
    if (isFinite(Number(ab[key]))) return Math.floor((Number(ab[key]) - 10) / 2);
    return 0;
  }
  function toolMod(sheet) {
    sheet = sheet || {};
    if (isFinite(Number(sheet.toolBonus))) return Number(sheet.toolBonus);
    var prof = isFinite(Number(sheet.prof)) ? Number(sheet.prof) : 0;
    if (sheet.thievesTools) return prof;
    if (/thieves' tools|thieves tools|lockpick/i.test(sheetBlob(sheet))) return prof;
    return 0;
  }
  function perceptionMod(sheet) {
    sheet = sheet || {};
    var skills = sheet.skills || {};
    if (isFinite(Number(skills.Perception))) return Number(skills.Perception);
    return abilityModFrom(sheet, "WIS");
  }
  function checkMod(sheet, action) {
    if (action === "lockpick-yes") return abilityModFrom(sheet, "DEX") + toolMod(sheet);
    if (action === "force" || action === "pry") return abilityModFrom(sheet, "STR");
    if (action === "search") return perceptionMod(sheet);
    return 0;
  }
  function signNum(n) {
    n = Number(n) || 0;
    return (n >= 0 ? "+" : "") + n;
  }
  function menu(box, sheet) {
    var opts = [];
    if (!box) return opts;
    if (box.hidden && !box.found) {
      opts.push({ id: "search", label: "Search / reveal", detail: "Perception vs DC " + (box.hideDc || 13) });
      opts.push({ id: "leave", label: "Leave" });
      return opts;
    }
    var lock = box.lock || {};
    var methods = lock.method || [];
    if (lock.dc > 0 && !lock.unlocked && methods.indexOf("tools") >= 0 && !lock.jammed) {
      opts.push({ id: "lockpick-yes", label: "Lockpick? Yes", detail: "Dex + thieves' tools vs DC " + lock.dc });
      opts.push({ id: "lockpick-no", label: "Lockpick? No" });
    } else if (lock.jammed) {
      opts.push({ id: "jammed", label: "Lock is jammed", disabled: true });
    }
    if (lock.dc > 0 && !lock.unlocked && methods.indexOf("force") >= 0) {
      opts.push({ id: "force", label: "Force it (Strength)", detail: "Strength vs DC " + (lock.forceDc || lock.dc) });
    }
    if (lock.keyItem && lock.dc > 0 && !lock.unlocked && hasItem(sheet, lock.keyItem)) {
      opts.push({ id: "key", label: "Use key (Strongbox Key)", detail: "No roll. Key stays." });
    }
    if (box.barrier && box.barrier.type === "nailed" && !box.barrier.cleared) {
      opts.push({ id: "pry", label: "Pry nails", detail: hasPry(sheet) ? "Pry bar. Nails come free." : "Strength vs DC " + (box.barrier.strDc || 10) });
    }
    if (!blocked(box)) opts.push({ id: "open", label: "Open" });
    opts.push({ id: "leave", label: "Leave" });
    return opts;
  }
  function resolve(box, action, sheet, rng, forced) {
    forced = forced || {};
    rng = rngOf(rng);
    sheet = sheet || {};
    box.log = box.log || [];
    if (!box.lock) box.lock = freshLock(0, [], "", false);
    if (action === "leave" || action === "lockpick-no") {
      box.log.push(action === "leave" ? "Left closed" : "Lockpick? No");
      return { ok: true, success: false, declined: true, box: box };
    }
    if (action === "search") {
      var pdc = box.hideDc || 13;
      var pmod = perceptionMod(sheet);
      var pnat = forced.nat != null ? Number(forced.nat) : die(20, rng);
      var ptotal = forced.total != null ? Number(forced.total) : pnat + pmod;
      var pok = ptotal >= pdc;
      box.log.push("Search — Perception: " + pnat + signNum(pmod) + " = " + ptotal + " vs DC " + pdc + (pok ? ". Found." : ". Still hidden."));
      if (pok) box.found = true;
      return { ok: true, success: pok, box: box, nat: pnat, total: ptotal, dc: pdc };
    }
    if (action === "pry") {
      if (!box.barrier || box.barrier.cleared) return { ok: true, success: true, box: box };
      if (box.barrier.pryBarAuto !== false && hasPry(sheet)) {
        box.barrier.cleared = true;
        box.log.push("Pry nails — pry bar. Nails come free.");
        return { ok: true, success: true, auto: true, box: box };
      }
      var sdc = box.barrier.strDc || 10;
      var smod = abilityModFrom(sheet, "STR");
      var snat = forced.nat != null ? Number(forced.nat) : die(20, rng);
      var stotal = forced.total != null ? Number(forced.total) : snat + smod;
      var sok = stotal >= sdc;
      box.log.push("Pry nails — Strength: " + snat + signNum(smod) + " = " + stotal + " vs DC " + sdc + (sok ? ". Nails come free." : ". Still nailed."));
      if (sok) box.barrier.cleared = true;
      return { ok: true, success: sok, box: box, nat: snat, total: stotal, dc: sdc };
    }
    if (action === "key") {
      var keyId = box.lock.keyItem || "strongbox-key";
      if (!hasItem(sheet, keyId)) return { ok: false, success: false, reason: "No Strongbox Key.", box: box };
      box.lock.unlocked = true;
      box.lock.jammed = false;
      box.log.push("Use key — Strongbox Key. Unlocked. Key kept.");
      return { ok: true, success: true, keptKey: true, box: box };
    }
    if (action === "lockpick-yes") {
      if (box.lock.jammed) return { ok: false, success: false, reason: "Lock is jammed.", box: box };
      if (!(box.lock.dc > 0) || box.lock.unlocked) return { ok: true, success: true, box: box };
      var dex = abilityModFrom(sheet, "DEX");
      var tools = toolMod(sheet);
      var dnat = forced.nat != null ? Number(forced.nat) : die(20, rng);
      var dtotal = forced.total != null ? Number(forced.total) : dnat + dex + tools;
      var dok = dtotal >= box.lock.dc;
      var detail = "Lockpick — Dex + thieves' tools: " + dnat + signNum(dex) + (tools ? signNum(tools) + " tools" : "") + " = " + dtotal + " vs DC " + box.lock.dc;
      if (dok) {
        box.lock.unlocked = true;
        box.log.push(detail + ". Unlocked.");
      } else if (box.lock.jamOnFail) {
        box.lock.jammed = true;
        box.log.push(detail + ". Failed. Lock jammed.");
      } else {
        box.log.push(detail + ". Failed. Still locked.");
      }
      return { ok: true, success: dok, jammed: !!box.lock.jammed, box: box, nat: dnat, total: dtotal, dc: box.lock.dc };
    }
    if (action === "force") {
      var fdc = box.lock.forceDc || box.lock.dc;
      var fmod = abilityModFrom(sheet, "STR");
      var fnat = forced.nat != null ? Number(forced.nat) : die(20, rng);
      var ftotal = forced.total != null ? Number(forced.total) : fnat + fmod;
      var fok = ftotal >= fdc;
      var tripped = false;
      if (fok) {
        box.lock.unlocked = true;
        box.log.push("Force — Strength: " + fnat + signNum(fmod) + " = " + ftotal + " vs DC " + fdc + ". Unlocked. Noisy.");
      } else {
        var line = "Force — Strength: " + fnat + signNum(fmod) + " = " + ftotal + " vs DC " + fdc + ". Still locked.";
        if ((fdc - ftotal) >= 5 && box.trap && !box.trap.tripped) {
          box.trap.tripped = true;
          tripped = true;
          line += " Trap trips (" + (box.trap.name || "trap") + ").";
        }
        box.log.push(line);
      }
      return {
        ok: true, success: fok, noisy: !!fok, tripped: tripped,
        notice: fok ? "Noisy: the lock gives." : (tripped ? "The trap trips." : ""),
        box: box, nat: fnat, total: ftotal, dc: fdc
      };
    }
    if (action === "open") {
      var gate = blocked(box);
      return { ok: !gate, success: !gate, reason: gate ? gateReason(box, gate) : "", box: box };
    }
    return { ok: false, success: false, reason: "No such option.", box: box };
  }
  function playCheck(box, action, sheet, rng) {
    var forced = null;
    var Sheet = root.SSDNSSheet;
    var ask = action === "lockpick-yes" || action === "force" || action === "search" || (action === "pry" && !hasPry(sheet));
    if (ask && Sheet && Sheet.rollAdv && Sheet.postCheck) {
      var mod = checkMod(sheet, action);
      var label = action === "lockpick-yes" ? "Lockpick" : (action === "search" ? "Perception" : "Strength");
      var rolled = Sheet.rollAdv(mod);
      Sheet.postCheck(label, rolled.formula, rolled.total, rolled.detail, rolled.nat === 1, false);
      forced = { nat: rolled.nat, total: rolled.total };
    }
    return resolve(box, action, sheet, rng, forced);
  }
  function preUnlock(box) {
    if (!box) return box;
    if (box.lock) { box.lock.unlocked = true; box.lock.jammed = false; }
    if (box.barrier) box.barrier.cleared = true;
    box.found = true;
    box.hidden = false;
    box.log = (box.log || []).concat(["DM pre-unlocked"]);
    return box;
  }
  function clearJam(box) {
    if (box && box.lock) box.lock.jammed = false;
    if (box) box.log = (box.log || []).concat(["DM cleared the jam"]);
    return box;
  }
  function applyRoll(box, rolled) {
    box.contents = rolled.picks;
    box.cash = rolled.cash;
    box.log = (box.log || []).concat(rolled.log);
    box.rolled = true;
  }
  function newId(prefix) {
    return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }
  function place(table, ctx, rng) {
    ctx = ctx || {};
    rng = rngOf(rng);
    var mode = ctx.rollMode === "onOpen" ? "onOpen" : "preroll";
    var access = seedAccess(table, rng, ctx);
    var box = {
      id: ctx.id || newId("box_"),
      tableId: table.id,
      name: table.name,
      boxType: table.boxType,
      actMin: table.actMin || null,
      label: table.label || "",
      opener: ctx.opener || "",
      openerName: ctx.openerName || "",
      reveal: ctx.reveal || "opener",
      shared: false,
      rollMode: mode,
      rolled: false,
      contents: [],
      cash: { es: 0, black: 0, blackId: "", branch: "none" },
      log: [],
      taken: false,
      draft: table.draft !== false,
      lock: access.lock,
      barrier: access.barrier,
      hidden: access.hidden,
      hideDc: access.hideDc,
      found: access.found,
      trap: access.trap,
      letterForce: ctx.letterForce
    };
    var gate = blocked(box);
    if (gate) box.log.push("Held until the " + gate + " check clears");
    if (mode === "preroll" && !table.actMin && !gate) applyRoll(box, rollBox(table, ctx, rng));
    return box;
  }
  function openBox(box, table, ctx, rng) {
    ctx = ctx || {};
    var act = Number(ctx.act) || 1;
    var min = box.actMin || (table && table.actMin) || 0;
    if (min && act < min) {
      return { ok: false, reason: "Sealed until Act " + min + ". " + (box.label || "DO NOT OPEN, Act I") };
    }
    if (ctx.bypass) preUnlock(box);
    var gate = blocked(box);
    if (gate && !ctx.bypass) return { ok: false, reason: gateReason(box, gate), gate: gate, box: box };
    if (!box.rolled) {
      var rollCtx = {};
      Object.keys(ctx).forEach(function (k) { rollCtx[k] = ctx[k]; });
      if (box.letterForce != null && box.letterForce !== "") rollCtx.letterForce = box.letterForce;
      applyRoll(box, rollBox(table, rollCtx, rng));
    }
    box.opened = true;
    return { ok: true, box: box };
  }
  function handPlace(box, id, qty) {
    var n = Math.max(1, parseInt(qty, 10) || 1);
    var row = { id: id, qty: n, dirty: isGun(id), band: "hand", hand: true, name: nameOf(id) };
    box.contents = box.contents || [];
    box.contents.push(row);
    box.log = box.log || [];
    box.log.push("DM placed " + n + " × " + row.name);
    box.rolled = true;
    return { ok: true, row: row, box: box };
  }
  function visibleTo(box, uid, role) {
    if (role === "dm") return true;
    if (!box) return false;
    if (box.reveal === "everyone" || box.shared) return true;
    return !!(uid && uid === box.opener);
  }
  function legFor(row) {
    var id = row.id, qty = row.qty || 1;
    if (AMMO[id]) {
      var spec = AMMO[id];
      var rounds = spec.each * qty;
      return {
        kind: "reward_item",
        sort: "ammo",
        payload: {
          text: rounds + " " + spec.name,
          itemId: id,
          qty: qty,
          ammo: { type: spec.type, caliber: spec.caliber, qty: rounds },
          reason: "Loot"
        }
      };
    }
    if (isGun(id) || GUNS[id]) {
      return {
        kind: "reward_item",
        sort: "weapon",
        payload: { id: id, text: nameOf(id), dirty: true, qty: 1, reason: "Loot" }
      };
    }
    return {
      kind: "reward_item",
      sort: "item",
      payload: { text: nameOf(id), itemId: id, qty: qty, kind: "item", reason: "Loot" }
    };
  }
  function takeRows(box, uid, rows, character) {
    if (!visibleTo(box, uid, "player") && uid !== box.opener) return { ok: false, reason: "You can't see this box." };
    if (box.taken && (!rows || rows === box.contents)) return { ok: false, reason: "Already taken." };
    var list = rows || box.contents || [];
    var fresh = list.filter(function (r) { return r && !r.taken; });
    if (!fresh.length && !(box.cash && (box.cash.es || box.cash.black)) ) return { ok: false, reason: "Nothing left to take." };
    var xferId = newId("xfer_");
    var legs = [];
    fresh.forEach(function (row, i) {
      var leg = legFor(row);
      leg.apply = "xfer:" + xferId + ":leg" + i;
      leg.payload.grantId = leg.apply;
      legs.push(leg);
      row.taken = true;
    });
    if (!rows && box.cash && box.cash.es) {
      legs.push({
        kind: "reward_es", sort: "es", apply: "xfer:" + xferId + ":es",
        payload: { delta: box.cash.es, reason: "Loot: " + (box.name || "box"), grantId: "xfer:" + xferId + ":es" }
      });
      box.cash.takenEs = true;
    }
    if (!rows && box.cash && box.cash.black) {
      var junk = legFor({ id: box.cash.blackId || "black-shard-junk", qty: box.cash.black });
      junk.apply = "xfer:" + xferId + ":black";
      junk.payload.grantId = junk.apply;
      legs.push(junk);
      box.cash.takenBlack = true;
    }
    if (!rows) box.taken = true;
    var ledger = {
      id: xferId, xferId: xferId, state: "done", kind: "loot_take", type: "loot_take",
      who: "DM", playerId: box.opener || uid || "",
      what: "Loot take " + (box.name || box.id) + " (" + legs.length + " legs)",
      ts: new Date().toISOString()
    };
    var warning = weightWarning(character, legs);
    if (warning) ledger.what += " · " + warning;
    return {
      ok: true,
      warning: warning,
      request: { kind: "loot_take", targetId: box.id, from: uid || box.opener || "", take: fresh.map(function (r) { return r.id; }), xferId: xferId },
      ledger: ledger,
      xfer: { id: xferId, state: "done", legs: legs }
    };
  }
  function weightWarning(character, legs) {
    var Items = root.SSDNSItems;
    if (!character || !Items || !Items.weightReport) return "";
    var before = Items.weightReport(character);
    if (!before || !before.capacity) return "";
    var extra = 0;
    legs.forEach(function (leg) {
      var p = leg.payload || {};
      if (p.ammo) {
        var each = 0.05;
        if (p.ammo.type === "buck" || p.ammo.type === "slug") each = 0.1;
        if (p.ammo.type === "arrows" && p.ammo.caliber === "dynamite") each = 1.05;
        extra += (Number(p.ammo.qty) || 0) * each;
      } else if (p.id && GUNS[p.id]) extra += 3;
      else if (p.itemId && Items.byId) {
        var row = Items.byId(p.itemId);
        if (row && row.weight) extra += Number(row.weight) * (Number(p.qty) || 1);
      }
    });
    if (before.carried + extra > before.capacity) {
      return "Over carry weight (" + Math.round((before.carried + extra) * 10) / 10 + " / " + before.capacity + " lb). The take still lands.";
    }
    return "";
  }
  function applyTake(character, result) {
    if (!character || !result || !result.ok) return character;
    var legs = (result.xfer && result.xfer.legs) || [];
    character.ammo = Array.isArray(character.ammo) ? character.ammo : [];
    character.items = Array.isArray(character.items) ? character.items : [];
    character.guns = Array.isArray(character.guns) ? character.guns : [];
    legs.forEach(function (leg) {
      var p = leg.payload || {};
      if (leg.kind === "reward_es") character.es = (Number(character.es) || 0) + (Number(p.delta) || 0);
      else if (p.ammo) {
        var pool = character.ammo.filter(function (a) {
          return a && a.type === p.ammo.type && String(a.caliber || "") === String(p.ammo.caliber || "");
        })[0];
        if (!pool) { pool = { type: p.ammo.type, caliber: p.ammo.caliber || "", count: 0 }; character.ammo.push(pool); }
        pool.count += Number(p.ammo.qty) || 0;
      } else if (p.dirty || (p.id && GUNS[p.id])) {
        character.guns.push({ weapon: p.id, name: p.text || nameOf(p.id), dirty: true });
      } else if (p.itemId) {
        character.items.push({ catalogId: p.itemId, name: p.text || nameOf(p.itemId), count: p.qty || 1, weight: 0 });
      }
    });
    return character;
  }
  function budget(boxes, chapter) {
    var placed = 0;
    (boxes || []).forEach(function (b) { placed += BUDGET[b.boxType] || 0; });
    var cap = CHAPTER[chapter] != null ? CHAPTER[chapter] : CHAPTER[1];
    return {
      placed: placed,
      suggested: cap,
      over: placed > cap,
      text: "Chapter " + chapter + ": placed ~" + placed.toLocaleString("en-US") + " ES vs suggested ~" + cap.toLocaleString("en-US") + " ES." + (placed > cap ? " Over the suggestion. This does not block a box." : "")
    };
  }
  function register(table) {
    if (!table || !table.id) return;
    TABLES[table.id] = table;
    if (table.boxType) TABLES[table.boxType] = table;
  }
  function load(base) {
    var files = ["act1-saddlebag", "act1-supply-crate", "act1-outlaw-stash", "act1-strongbox"];
    base = base || "../assets/data/loot/";
    return Promise.all(files.map(function (f) {
      return fetch(base + f + ".json").then(function (r) {
        if (!r.ok) throw new Error("Loot table " + f + " failed (" + r.status + ")");
        return r.json();
      }).then(register);
    }));
  }
  function tableFor(key) { return TABLES[key] || null; }
  function allTables() { return TABLES; }
  register(SEALED);

  root.SSDNSLoot = {
    GUNS: GUNS, AMMO: AMMO, BUDGET: BUDGET, CHAPTER: CHAPTER, SEALED: SEALED,
    rollQty: rollQty, rollBox: rollBox, rollCash: rollCash, place: place, openBox: openBox, handPlace: handPlace,
    visibleTo: visibleTo, takeRows: takeRows, takeAll: function (box, uid, character) { return takeRows(box, uid, null, character); },
    applyTake: applyTake, budget: budget, tagOf: tagOf, illegalReason: illegalReason, nameOf: nameOf,
    register: register, tableFor: tableFor, tables: allTables, load: load, magicRare: magicRare, isGun: isGun,
    seedAccess: seedAccess, blocked: blocked, menu: menu, resolve: resolve, playCheck: playCheck,
    preUnlock: preUnlock, clearJam: clearJam, hasItem: hasItem, hasPry: hasPry, checkMod: checkMod
  };
})(typeof window !== "undefined" ? window : globalThis);

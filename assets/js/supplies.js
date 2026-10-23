/**
 * L0188 food & water (5e PHB "Food and Water"), run by the DM.
 * Pure rules shared by the player sheet, the DM Command Center and the tests.
 *
 * Where the counts live (on the character, so old saves just get defaults):
 *   rations  = meals in every food item (tag "food" + meals: hardtack 1, bread/cheese/meat ½,
 *              DM-set big game), plus the meals still in a pack (derived from what it unpacks
 *              into) and a half left open (supplies.halfOpen).
 *   water    = container fill (capacity at 5e full) + drink items tagged water + loose
 *              supplies.water gallons. 8 lb a gallon in carried weight.
 *   supplies = { mode, water, daysHungry, halfOpen, pendingSave, last, day }
 * The DM owns the counts. The sheet shows them read-only.
 */
(function (root) {
  "use strict";

  var RATION_ID = "hardtack-jerky-1-day";
  var MODES = { off: 1, loose: 1, strict: 1 };
  var SAVE_DC = 15;

  function num(v, d) { var n = Number(v); return isFinite(n) ? n : (d == null ? 0 : d); }
  function half(n) { return Math.round(num(n) * 2) / 2; }

  function defaults() {
    return { mode: "off", water: 0, daysHungry: 0, halfOpen: false, pendingSave: null, last: null, day: 0, share: true, prepaid: { food: 0, water: 0 } };
  }
  /** Fill missing fields; never throws on old saves. */
  function ensure(c) {
    if (!c) return defaults();
    var s = c.supplies && typeof c.supplies === "object" ? c.supplies : {};
    var d = defaults();
    Object.keys(d).forEach(function (k) { if (s[k] === undefined) s[k] = d[k]; });
    if (!MODES[s.mode]) s.mode = "off";
    s.water = Math.max(0, Math.round(num(s.water) * 1000) / 1000);
    s.daysHungry = Math.max(0, half(s.daysHungry));
    s.halfOpen = !!s.halfOpen;
    s.share = s.share !== false; /* Jessey 2026-10-20: sharing is on unless the player turns it off */
    if (!s.prepaid || typeof s.prepaid !== "object") s.prepaid = { food: 0, water: 0 };
    s.prepaid.food = Math.max(0, half(s.prepaid.food));
    s.prepaid.water = Math.max(0, Math.round(num(s.prepaid.water) * 1000) / 1000);
    c.supplies = s;
    return s;
  }

  /* L0188-L0190: food and water are whatever the inventory tags say (store, loot or DM-made):
     tags "food" + meals (days of food per item), containers (capacity + fill, gallons) and
     drinks (tag "water" + water gallons per item). Old rows get their tags from items.js inferSupply. */
  function itemsOf(c) {
    var list = c && Array.isArray(c.items) ? c.items : [];
    var I = root.SSDNSItems;
    if (I && I.inferSupply) list.forEach(I.inferSupply);
    return list;
  }
  function tagged(item, tag) { return !!(item && Array.isArray(item.tags) && item.tags.indexOf(tag) >= 0); }
  function isFood(item) {
    if (!item) return false;
    if (tagged(item, "feed")) return false; /* mount feed (animal-days) never feeds a PC */
    if (tagged(item, "food")) return true;
    if (num(item.meals, 0) > 0) return true; /* a pack: meals come from what it unpacks into (no tag of its own) */
    if (item.catalogId === RATION_ID) return true;
    return !(item.tags && item.tags.length) && /^(rations?\b|hardtack)/i.test(String(item.name || ""));
  }
  var isRation = isFood;
  function foodItems(c) {
    /* loose food first (1-meal items), packs last */
    return itemsOf(c).filter(isFood).sort(function (a, b) { return mealsEach(a) - mealsEach(b); });
  }
  function mealsEach(it) { var m = num(it && it.meals, 0); return m > 0 ? m : 1; }
  function mealsIn(it) { return Math.max(0, Math.round((mealsEach(it) * Math.max(1, num(it.count, 1)) - num(it.mealsUsed, 0)) * 2) / 2); }
  /** Days of food in the bags (every food-tagged item) plus an open half. */
  function rations(c) {
    var n = 0;
    foodItems(c).forEach(function (it) { n += mealsIn(it); });
    if (c && c.supplies && c.supplies.halfOpen) n += 0.5;
    return n;
  }
  function rationRow(count) {
    var Items = root.SSDNSItems;
    var base = Items && Items.byId ? Items.byId(RATION_ID) : null;
    if (Items && Items.instanceFrom && base) return Items.instanceFrom(Object.assign({}, base, { count: count }), {});
    return { uid: "it_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), catalogId: RATION_ID, name: "Hardtack and Jerky",
      type: "consumable", description: "One day of trail food.", effect: { kind: "text", text: "Food for 1 day." },
      uses: { max: 1 }, chargesLeft: 1, weight: 2, price: 50, count: count, approved: true, tags: ["food"], meals: 1 };
  }
  /** Eat `amt` meals (half steps) out of the food items: an open half first, then the smallest items
      (bread, cheese and meat are ½ meal each, hardtack 1), then multi-meal items (a DM-set deer, a pack's hardtack).
      Breaking into a whole meal for half a meal leaves the other half open (supplies.halfOpen). Returns meals eaten. */
  function eatMeals(c, amt) {
    var s = ensure(c);
    var left = half(amt);
    if (left <= 0) return 0;
    if (s.halfOpen) { s.halfOpen = false; left -= 0.5; }
    var list = foodItems(c);
    for (var i = 0; i < list.length && left > 0; i++) {
      var it = list[i];
      while (left > 0 && c.items.indexOf(it) >= 0) {
        var m = mealsEach(it);
        if (m <= 1) {
          var have = Math.max(1, num(it.count, 1));
          if (have > 1) it.count = have - 1; else c.items.splice(c.items.indexOf(it), 1);
          left = half(left - m);
        } else {
          /* a multi-meal item: count meals eaten out of the whole stack; the item itself stays
             (a pack keeps its rope and bedroll). Its weight drops by mealWeight per meal. */
          var all = m * Math.max(1, num(it.count, 1));
          if (num(it.mealsUsed, 0) >= all) break;
          it.mealsUsed = num(it.mealsUsed, 0) + 1;
          left = half(left - 1);
        }
      }
    }
    if (left < 0) { s.halfOpen = true; left = 0; }
    return half(amt) - left;
  }
  /** Add (n > 0) or take away (n < 0) rations, in half steps. Returns the new count. */
  function giveRations(c, n) {
    if (!c) return 0;
    var s = ensure(c);
    n = half(n);
    if (!Array.isArray(c.items)) c.items = [];
    if (n > 0) {
      if (s.halfOpen && n % 1) { s.halfOpen = false; addWhole(c, Math.floor(n) + 1); return rations(c); }
      var whole = Math.floor(n);
      if (whole > 0) addWhole(c, whole);
      if (n - whole) s.halfOpen = true;
    } else if (n < 0) {
      eatMeals(c, -n);
    }
    return rations(c);
  }
  function addWhole(c, n) {
    var same = itemsOf(c).filter(function (it) { return it.catalogId === RATION_ID && !it.addressedTo; })[0];
    if (same) same.count = Math.max(1, num(same.count, 1)) + n;
    else c.items.push(rationRow(n));
  }

  /* ---- water: loose gallons (supplies.water) + container fill + drink items */
  function containers(c) {
    return itemsOf(c).filter(function (it) { return it && num(it.capacity, 0) > 0; });
  }
  function drinks(c) {
    return itemsOf(c).filter(function (it) { return it && !(num(it.capacity, 0) > 0) && tagged(it, "water") && num(it.water, 0) > 0; });
  }
  function capOf(it) { return num(it.capacity, 0) * Math.max(1, num(it.count, 1)); }
  function waterTotal(c) {
    var s = c && c.supplies ? c.supplies : {};
    var n = Math.max(0, num(s.water, 0));
    containers(c).forEach(function (it) { n += Math.max(0, num(it.fill, 0)); });
    drinks(c).forEach(function (it) { n += num(it.water, 0) * Math.max(1, num(it.count, 1)); });
    return Math.round(n * 1000) / 1000;
  }
  /** Drink / take gal: containers first, then loose water, then drink items (a part-used drink's rest goes loose). */
  function spendWater(c, gal) {
    var s = ensure(c);
    var left = num(gal, 0);
    containers(c).sort(function (a, b) { return num(a.fill, 0) - num(b.fill, 0); }).forEach(function (it) {
      if (left <= 0) return;
      var f = Math.max(0, num(it.fill, 0));
      var take = Math.min(f, left);
      it.fill = Math.round((f - take) * 1000) / 1000;
      left = Math.round((left - take) * 1000) / 1000;
    });
    if (left > 0) {
      var take2 = Math.min(s.water, left);
      s.water = Math.round((s.water - take2) * 1000) / 1000;
      left = Math.round((left - take2) * 1000) / 1000;
    }
    drinks(c).forEach(function (it) {
      while (left > 0 && c.items.indexOf(it) >= 0) {
        var each = num(it.water, 0);
        var cnt = Math.max(1, num(it.count, 1));
        if (cnt > 1) it.count = cnt - 1; else c.items.splice(c.items.indexOf(it), 1);
        if (each > left) { s.water = Math.round((s.water + each - left) * 1000) / 1000; left = 0; }
        else left = Math.round((left - each) * 1000) / 1000;
      }
    });
    return num(gal, 0) - left;
  }
  /** Add water (fills containers, the rest is loose) or take it away (gal < 0). Returns the new total. */
  function giveWater(c, gal) {
    var s = ensure(c);
    gal = num(gal, 0);
    if (gal < 0) { spendWater(c, -gal); return waterTotal(c); }
    var left = gal;
    containers(c).forEach(function (it) {
      if (left <= 0) return;
      var room = Math.max(0, capOf(it) - num(it.fill, 0));
      var put = Math.min(room, left);
      it.fill = Math.round((num(it.fill, 0) + put) * 1000) / 1000;
      left = Math.round((left - put) * 1000) / 1000;
    });
    s.water = Math.round((s.water + left) * 1000) / 1000;
    return waterTotal(c);
  }
  /** Days a creature can go without food before exhaustion: 3 + Con mod, at least 1. */
  function foodLimit(conMod) { return Math.max(1, 3 + Math.floor(num(conMod))); }
  function waterNeed(hot) { return hot ? 2 : 1; }
  /**
   * Eat and drink now (ASSUMED: 1 meal and up to 1 gal). Counts as prepaid so the end-of-day
   * tick does not spend that food and water a second time. Mode off does nothing.
   */
  function eatNow(c) {
    var s = ensure(c);
    if (s.mode === "off") return { ok: false, reason: "Food and water tracking is off." };
    var ate = eatMeals(c, 1);
    var drank = 0;
    if (waterTotal(c) > 0) drank = spendWater(c, Math.min(1, waterTotal(c)));
    if (ate <= 0 && drank <= 0) return { ok: false, reason: "Nothing to eat or drink." };
    s.prepaid.food = half(s.prepaid.food + ate);
    s.prepaid.water = Math.round((s.prepaid.water + drank) * 1000) / 1000;
    if (ate >= 1) s.daysHungry = 0;
    return { ok: true, ate: ate, drank: drank };
  }

  /**
   * One day passes for one character. Spends food and water and says what 5e does about it.
   * opts: { hot, half (half rations), conMod, exhaustion (level now), longRest }
   * Returns { food, ate, daysHungry, limit, foodGain, need, drank, water ("ok"|"save"|"short"),
   *           waterGain, save ({ dc, gain }) or null, restDrop, gain (automatic total), lines[] }
   * The caller decides whether to apply the gain (Strict) or only show it (Loose).
   */
  function tick(c, opts) {
    opts = opts || {};
    var s = ensure(c);
    var lv = Math.max(0, Math.min(6, Math.floor(num(opts.exhaustion))));
    var exhaustedBefore = lv > 0;
    var limit = foodLimit(opts.conMod);
    var want = opts.half ? 0.5 : 1;
    var fromPre = Math.min(want, s.prepaid.food);
    var still = half(want - fromPre);
    var have = rations(c);
    var eat = Math.min(still, have);
    if (eat > 0) giveRations(c, -eat);
    var ateToday = half(fromPre + eat);
    s.prepaid.food = 0;
    var food = ateToday >= 1 ? "full" : (ateToday > 0 ? "half" : "none");
    if (food === "full") s.daysHungry = 0;
    else s.daysHungry = half(s.daysHungry + (food === "half" ? 0.5 : 1));
    var foodGain = s.daysHungry > limit ? 1 : 0;

    var need = waterNeed(opts.hot);
    var fromPreW = Math.min(need, s.prepaid.water);
    var stillW = Math.round((need - fromPreW) * 1000) / 1000;
    var drankNow = Math.min(stillW, waterTotal(c));
    if (drankNow > 0) spendWater(c, drankNow);
    var drank = Math.round((fromPreW + drankNow) * 1000) / 1000;
    s.prepaid.water = 0;
    var water = drank >= need ? "ok" : (drank >= need / 2 ? "save" : "short");
    var stepGain = exhaustedBefore ? 2 : 1;
    var waterGain = water === "short" ? stepGain : 0;
    var save = water === "save" ? { dc: SAVE_DC, gain: stepGain } : null;

    /* 5e: a long rest takes off one level if you ate and drank something. */
    var restDrop = opts.longRest && ateToday > 0 && drank > 0 ? 1 : 0;
    var gain = foodGain + waterGain;

    var lines = [];
    lines.push(food === "full" ? "Ate a full day of food." : food === "half" ? "Ate half rations (half a day without food)." : "No food today.");
    if (food !== "full") lines.push("Days without food: " + s.daysHungry + " of " + limit + " safe.");
    if (foodGain) lines.push("Past the safe days: +1 exhaustion.");
    lines.push("Drank " + drank + " of " + need + " gal" + (opts.hot ? " (hot day)" : "") + ".");
    if (save) lines.push("Half the water: DC " + SAVE_DC + " Con save or +" + stepGain + " exhaustion.");
    if (waterGain) lines.push("Less than half the water: +" + waterGain + " exhaustion.");
    if (restDrop) lines.push("Long rest with food and water: -1 exhaustion.");

    s.day = num(s.day) + 1;
    s.last = { day: s.day, food: food, drank: drank, need: need, hot: !!opts.hot, gain: gain, restDrop: restDrop, save: save ? "pending" : "", at: new Date().toISOString() };
    return { food: food, ate: ateToday, daysHungry: s.daysHungry, limit: limit, foodGain: foodGain, need: need, drank: drank,
      water: water, waterGain: waterGain, save: save, restDrop: restDrop, gain: gain, exhaustedBefore: exhaustedBefore, lines: lines };
  }
  /** New exhaustion level after a gain and a rest drop, kept to 0..6. */
  function nextLevel(level, gain, drop) {
    return Math.max(0, Math.min(6, Math.floor(num(level)) + num(gain) - num(drop)));
  }
  /** Water save: d20 + Con save vs DC 15. Returns { pass, total, gain } (gain 0 on a pass). */
  function resolveSave(nat, saveMod, pending) {
    var dc = (pending && pending.dc) || SAVE_DC;
    var total = num(nat) + num(saveMod);
    var pass = total >= dc;
    return { pass: pass, total: total, dc: dc, gain: pass ? 0 : ((pending && pending.gain) || 1) };
  }
  /** Small read-only view for the DM card and the sheet. */
  function view(c) {
    var s = ensure(c);
    return { mode: s.mode, rations: rations(c), water: waterTotal(c), daysHungry: s.daysHungry, pendingSave: !!s.pendingSave, last: s.last, day: s.day, share: s.share, prepaid: { food: s.prepaid.food, water: s.prepaid.water } };
  }

  /**
   * Party sharing at the end of a day (Jessey 2026-10-20). Players who share hand their leftover
   * food and water to anyone who is short; players who don't share keep theirs, but can still be covered.
   * rows: [{ id, name, rations, water, share, half }]; opts: { hot }.
   * Returns { adjust: { id: { rations, water } }, moves: [{ from, to, what, amount }], notSharing: [id] }.
   */
  function planShare(rows, opts) {
    opts = opts || {};
    var adjust = {}, moves = [];
    function r3(n) { return Math.round(num(n) * 1000) / 1000; }
    rows = (rows || []).filter(Boolean);
    rows.forEach(function (r) { adjust[r.id] = { rations: 0, water: 0 }; });
    function pass(key, needOf) {
      var short = [], spare = [];
      rows.forEach(function (r) {
        var have = r3(r[key]);
        var need = needOf(r);
        if (have < need) short.push({ r: r, gap: r3(need - have) });
        else if (r.share !== false && have > need) spare.push({ r: r, left: r3(have - need) });
      });
      spare.sort(function (a, b) { return b.left - a.left; });
      short.forEach(function (s) {
        spare.forEach(function (d) {
          if (s.gap <= 0 || d.left <= 0 || d.r.id === s.r.id) return;
          var amt = Math.min(s.gap, d.left);
          s.gap = r3(s.gap - amt); d.left = r3(d.left - amt);
          adjust[d.r.id][key] = r3(adjust[d.r.id][key] - amt);
          adjust[s.r.id][key] = r3(adjust[s.r.id][key] + amt);
          moves.push({ from: d.r.id, to: s.r.id, fromName: d.r.name || d.r.id, toName: s.r.name || s.r.id, what: key, amount: amt });
        });
      });
    }
    pass("rations", function (r) { return r.half ? 0.5 : 1; });
    pass("water", function () { return waterNeed(opts.hot); });
    return { adjust: adjust, moves: moves, notSharing: rows.filter(function (r) { return r.share === false; }).map(function (r) { return r.id; }) };
  }
  function moveText(m) {
    return m.fromName + " shared " + m.amount + (m.what === "water" ? " gal water" : (m.amount === 1 ? " ration" : " rations")) + " with " + m.toName;
  }

  root.SSDNSSupplies = {
    RATION_ID: RATION_ID,
    SAVE_DC: SAVE_DC,
    defaults: defaults,
    ensure: ensure,
    rations: rations,
    isRation: isRation,
    isFood: isFood,
    waterTotal: waterTotal,
    spendWater: spendWater,
    giveRations: giveRations,
    eatMeals: eatMeals,
    eatNow: eatNow,
    giveWater: giveWater,
    foodLimit: foodLimit,
    waterNeed: waterNeed,
    tick: tick,
    nextLevel: nextLevel,
    resolveSave: resolveSave,
    view: view,
    planShare: planShare,
    moveText: moveText
  };
})(typeof window !== "undefined" ? window : globalThis);

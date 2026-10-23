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
 *   supplies = { mode, water, daysHungry, halfOpen, pendingSave, last, day, mounts }
 * The DM owns the counts. The sheet shows them read-only.
 *
 * L0216 horse feed uses this same Off / Loose / Strict dial and the same end-of-day tick.
 * One Horse feed portion feeds one horse or pack mule for one campaign day. No spoilage.
 * Grazing (a DM mark) skips that portion. Loose can skip a day with no portion (not Hungry).
 * Strict needs a portion unless Grazing is marked, and a miss sets Hungry. Hungry never
 * happens while the dial is Off.
 * Hungry is disadvantage on Wisdom (Animal Handling) for that mount, and, while mounted,
 * disadvantage on attack rolls and −10 ft of mount speed. It does not add exhaustion.
 */
(function (root) {
  "use strict";

  var RATION_ID = "hardtack-jerky-1-day";
  var FEED_ID = "feed-1-day";
  var MODES = { off: 1, loose: 1, strict: 1 };
  var SAVE_DC = 15;
  /* Living horses and pack mules only. Carts, wagons, boats, and tack do not eat. */
  var MOUNTS = {
    "riding-horse-cow-pony": { name: "Riding horse", speed: 60 },
    "draft-freight-horse": { name: "Draft horse", speed: 40 },
    "cavalry-horse": { name: "Cavalry horse", speed: 60 },
    "mule": { name: "Mule", speed: 40 }
  };

  function num(v, d) { var n = Number(v); return isFinite(n) ? n : (d == null ? 0 : d); }
  function half(n) { return Math.round(num(n) * 2) / 2; }

  function defaults() {
    return { mode: "off", water: 0, daysHungry: 0, halfOpen: false, pendingSave: null, last: null, day: 0, share: true, prepaid: { food: 0, water: 0 }, mounts: {} };
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
    if (!s.mounts || typeof s.mounts !== "object" || Array.isArray(s.mounts)) s.mounts = {};
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
    tickMounts(c).forEach(function (row) { lines.push(row.line); });

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
    return { mode: s.mode, rations: rations(c), water: waterTotal(c), daysHungry: s.daysHungry, pendingSave: !!s.pendingSave, last: s.last, day: s.day, share: s.share, prepaid: { food: s.prepaid.food, water: s.prepaid.water }, feed: feedPortions(c), mounts: mountView(c) };
  }

  /* ---- L0216 horse feed: oats / hay / grain, one portion per horse or pack mule ---- */
  function isMountItem(it) {
    return !!(it && MOUNTS[it.catalogId || it.id || ""]);
  }
  function mountKey(it, i) {
    return (it && it.uid) || ((it && (it.catalogId || it.id)) + "#" + i);
  }
  function mountState(c, key) {
    var bag = ensure(c).mounts;
    var st = bag[key];
    if (!st || typeof st !== "object") st = { hungry: false, grazing: false, prepaid: false };
    st.hungry = !!st.hungry;
    st.grazing = !!st.grazing;
    st.prepaid = !!st.prepaid;
    bag[key] = st;
    return st;
  }
  function mountView(c) {
    var s = ensure(c);
    return itemsOf(c).map(function (it, i) {
      if (!isMountItem(it)) return null;
      var id = it.catalogId || it.id;
      var spec = MOUNTS[id];
      var key = mountKey(it, i);
      var st = mountState(c, key);
      var hungry = s.mode !== "off" && !!st.hungry;
      return {
        key: key,
        name: it.name || spec.name,
        catalogId: id,
        baseSpeed: spec.speed,
        speed: hungry ? spec.speed - 10 : spec.speed,
        hungry: hungry,
        grazing: !!st.grazing
      };
    }).filter(Boolean);
  }
  function feedLeft(it) {
    if (!it || isFood(it)) return 0;
    var days = num(it.feedDays, 0);
    if (!(days > 0) && tagged(it, "feed")) days = 1;
    if (!(days > 0)) return 0;
    return Math.max(0, days * Math.max(1, num(it.count, 1)) - num(it.feedUsed, 0));
  }
  function feedPortions(c) {
    var n = 0;
    itemsOf(c).forEach(function (it) { n += feedLeft(it); });
    return n;
  }
  function feedRow(count) {
    var Items = root.SSDNSItems;
    var base = Items && Items.byId ? Items.byId(FEED_ID) : null;
    if (Items && Items.instanceFrom && base) return Items.instanceFrom(Object.assign({}, base, { count: count }), {});
    return { uid: "it_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), catalogId: FEED_ID, name: "Horse feed (oats/hay/grain)",
      type: "gear", description: "Oats, hay, or grain. One portion feeds one horse or pack mule for one campaign day.", weight: 10, price: 5, count: count,
      stack: true, tags: ["feed"], feedDays: 1, approved: true };
  }
  function giveFeed(c, n) {
    if (!c) return 0;
    ensure(c);
    if (!Array.isArray(c.items)) c.items = [];
    n = Math.trunc(num(n));
    if (n > 0) {
      var same = itemsOf(c).filter(function (it) { return (it.catalogId || it.id) === FEED_ID && !it.addressedTo; })[0];
      if (same) same.count = Math.max(1, num(same.count, 1)) + n;
      else c.items.push(feedRow(n));
    } else if (n < 0) spendFeed(c, -n);
    return feedPortions(c);
  }
  function spendFeed(c, n) {
    var left = Math.trunc(num(n));
    var spent = 0;
    if (left <= 0 || !c) return 0;
    itemsOf(c).filter(function (it) { return feedLeft(it) > 0; }).forEach(function (it) {
      while (left > 0 && c.items.indexOf(it) >= 0 && feedLeft(it) > 0) {
        var each = num(it.feedDays, 1) || 1;
        var count = Math.max(1, num(it.count, 1));
        if (each <= 1) {
          if (count > 1) it.count = count - 1;
          else c.items.splice(c.items.indexOf(it), 1);
        } else {
          it.feedUsed = num(it.feedUsed, 0) + 1;
          if (feedLeft(it) <= 0) c.items.splice(c.items.indexOf(it), 1);
        }
        left -= 1;
        spent += 1;
      }
    });
    return spent;
  }
  function mountByKey(c, key) {
    return mountView(c).filter(function (m) { return m.key === key; })[0] || null;
  }
  /** Spend one portion on a mount the player owns. Clears Hungry. Mode off does nothing. */
  function feedMount(c, key) {
    var s = ensure(c);
    if (s.mode === "off") return { ok: false, reason: "Food and water tracking is off." };
    var row = mountByKey(c, key);
    if (!row) return { ok: false, reason: "That mount isn't yours." };
    if (spendFeed(c, 1) < 1) return { ok: false, reason: "No horse feed." };
    var st = mountState(c, key);
    st.hungry = false;
    st.prepaid = true;
    return { ok: true, name: row.name };
  }
  function clearHungry(c, key) {
    var row = mountByKey(c, key);
    if (!row) return { ok: false, reason: "That mount isn't yours." };
    mountState(c, key).hungry = false;
    return { ok: true, name: row.name };
  }
  function setGrazing(c, key, on) {
    var row = mountByKey(c, key);
    if (!row) return { ok: false, reason: "That mount isn't yours." };
    mountState(c, key).grazing = !!on;
    return { ok: true, name: row.name, grazing: !!on };
  }
  /**
   * End of the campaign day for each horse and pack mule.
   * Off: nothing. Grazing, or a portion already fed today: not a miss.
   * Otherwise spend one portion. No portion: Loose skips (not Hungry). Strict sets Hungry
   * unless Grazing is marked. Never adds exhaustion.
   */
  function tickMounts(c) {
    var s = ensure(c);
    var out = [];
    if (s.mode === "off") return out;
    mountView(c).forEach(function (m) {
      var st = mountState(c, m.key);
      if (st.grazing) {
        st.prepaid = false;
        out.push({ key: m.key, name: m.name, result: "grazing", hungry: !!st.hungry, line: m.name + " grazes (DM). No portion spent." });
        return;
      }
      if (st.prepaid) {
        st.prepaid = false;
        st.hungry = false;
        out.push({ key: m.key, name: m.name, result: "fed", hungry: false, line: m.name + " already ate a portion today." });
        return;
      }
      if (spendFeed(c, 1) >= 1) {
        st.hungry = false;
        out.push({ key: m.key, name: m.name, result: "fed", hungry: false, line: m.name + " ate one portion of horse feed." });
        return;
      }
      if (s.mode === "loose") {
        out.push({ key: m.key, name: m.name, result: "skip", hungry: !!st.hungry, line: m.name + " has no feed. Loose: skipped, not Hungry." });
        return;
      }
      st.hungry = true;
      out.push({ key: m.key, name: m.name, result: "hungry", hungry: true, line: m.name + " missed feed. Hungry (no exhaustion)." });
    });
    return out;
  }
  function hungryMounts(c) {
    if (ensure(c).mode === "off") return [];
    return mountView(c).filter(function (m) { return m.hungry; });
  }
  /** Wisdom (Animal Handling) involving a hungry mount. Names the hungry mounts. */
  function handlingNote(c) {
    var rows = hungryMounts(c);
    if (!rows.length) return "";
    return "disadvantage: hungry " + rows.map(function (m) { return m.name; }).join(", ");
  }
  /** While mounted on a hungry horse or mule: attack rolls, and the mount's speed is already −10 on the card. */
  function mountedAttackNote(c) {
    if (!c || !c.mounted) return "";
    return hungryMounts(c).length ? "disadvantage: hungry mount" : "";
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
    FEED_ID: FEED_ID,
    MOUNTS: MOUNTS,
    rations: rations,
    isRation: isRation,
    isFood: isFood,
    isMountItem: isMountItem,
    feedPortions: feedPortions,
    giveFeed: giveFeed,
    spendFeed: spendFeed,
    mounts: mountView,
    feedMount: feedMount,
    clearHungry: clearHungry,
    setGrazing: setGrazing,
    tickMounts: tickMounts,
    handlingNote: handlingNote,
    mountedAttackNote: mountedAttackNote,
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

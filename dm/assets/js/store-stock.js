/**
 * Pure store stock for the four SSDNS shops.
 * Preview stays local; only pricedLines() is written to table/store.
 */
(function (root) {
  var TOWN_RANK = { camp: 0, boomtown: 1, city: 2 };
  var STORE_ORDER = ["general", "gun", "music", "traveling"];
  var STORE_LABEL = {
    general: "General Store",
    gun: "Gun Store",
    music: "Music Store",
    traveling: "Traveling Merchant"
  };
  var AMMO_BY_ID = {
    "cartridges-light-20": { kind: "cartridge", caliber: "Light", qty: 20 },
    "cartridges-medium-20": { kind: "cartridge", caliber: "Medium", qty: 20 },
    "cartridges-heavy-20": { kind: "cartridge", caliber: "Heavy", qty: 20 },
    "big-fifty-cartridges-50-90-10": { kind: "cartridge", caliber: ".50-90", qty: 10 }
  };

  function eligible(items, store, town) {
    var rank = TOWN_RANK[town];
    if (rank == null) rank = 0;
    return (items || []).filter(function (it) {
      if (!it || (it.stores || []).indexOf(store) < 0) return false;
      var need = TOWN_RANK[it.minTown];
      if (need == null) need = 0;
      return need <= rank;
    });
  }

  function defaultStock(items, store, town) {
    return eligible(items, store, town).filter(function (it) { return it && it.rarity === "common"; });
  }

  function randomStock(items, store, town, rng, w) {
    var weights = w || { common: 1, uncommon: 0.4, rare: 0.1 };
    var roll = rng || Math.random;
    return eligible(items, store, town).filter(function (it) {
      var p = weights[it.rarity];
      if (p == null) p = 0;
      return roll() < p;
    });
  }

  function markup(price) {
    return Math.ceil(Number(price) * 1.25);
  }

  function merchantPool(items) {
    return (items || []).filter(function (it) {
      if (!it || (it.stores || []).indexOf("traveling") < 0) return false;
      if (it.category === "gunsmithing") return false;
      if (/repair/i.test(String(it.name || ""))) return false;
      if (it.price_es == null || it.price_es === "") return false;
      return true;
    });
  }

  function merchantStock(items, rng, opts) {
    opts = opts || {};
    var min = opts.min == null ? 6 : opts.min;
    var max = opts.max == null ? 10 : opts.max;
    var maxRare = opts.maxRare == null ? 1 : opts.maxRare;
    var weights = opts.w || { common: 1, uncommon: 0.4, rare: 0.1 };
    var roll = rng || Math.random;
    var bag = merchantPool(items).slice();
    var n = min + Math.floor(roll() * (max - min + 1));
    if (n > bag.length) n = bag.length;
    var picked = [];
    var rares = 0;
    while (picked.length < n && bag.length) {
      var weightsNow = bag.map(function (it) {
        if (it.rarity === "rare" && rares >= maxRare) return 0;
        var p = weights[it.rarity];
        return p == null ? 0 : p;
      });
      var sum = weightsNow.reduce(function (a, b) { return a + b; }, 0);
      var idx = -1;
      if (sum > 0) {
        var shot = roll() * sum;
        var acc = 0;
        for (var i = 0; i < weightsNow.length; i++) {
          acc += weightsNow[i];
          if (shot < acc) { idx = i; break; }
        }
        if (idx < 0) idx = weightsNow.length - 1;
      } else {
        for (var j = 0; j < bag.length; j++) {
          if (!(bag[j].rarity === "rare" && rares >= maxRare)) { idx = j; break; }
        }
      }
      if (idx < 0) break;
      var item = bag.splice(idx, 1)[0];
      if (item.rarity === "rare") rares += 1;
      picked.push(Object.assign({}, item, { price: markup(item.price_es) }));
    }
    return picked;
  }

  function hasPrice(it) {
    return !!(it && (it.price_es != null && it.price_es !== "" || it.ref_price_es != null && it.ref_price_es !== ""));
  }

  /** Commons the counter can price. Drum, bugle and tin whistle stay off. */
  function stockableCommons(items, store, town) {
    return defaultStock(items, store, town).filter(hasPrice);
  }

  function trailingQty(name) {
    var m = String(name || "").match(/\((\d+)\b[^)]*\)\s*$/);
    return m ? parseInt(m[1], 10) : null;
  }

  function lineFromItem(it, store, merchant) {
    var ref = false;
    var price = it.price_es;
    if ((price == null || price === "") && it.ref_price_es != null && it.ref_price_es !== "") {
      price = it.ref_price_es;
      ref = true;
    }
    if (merchant && price != null && price !== "") price = markup(price);
    var priced = price != null && price !== "" && isFinite(Number(price));
    return {
      id: it.id || "",
      name: it.name || "",
      category: it.category || "",
      rarity: it.rarity || "",
      notes: it.notes || "",
      bookLine: it.bookLine || "",
      price: priced ? Math.round(Number(price)) : "",
      checked: priced,
      ref: ref && priced,
      qty: trailingQty(it.name),
      store: store
    };
  }

  function slipRare(lines, items, rng) {
    var roll = rng || Math.random;
    var have = {};
    (lines || []).forEach(function (row) { if (row && row.id) have[row.id] = 1; });
    var pool = merchantPool(items).filter(function (it) { return it.rarity === "rare" && !have[it.id]; });
    if (!pool.length) return (lines || []).slice();
    var pick = pool[Math.floor(roll() * pool.length)];
    var line = lineFromItem(pick, "traveling", true);
    line.checked = true;
    var next = (lines || []).slice();
    var idx = -1;
    for (var i = 0; i < next.length; i++) {
      if (next[i] && next[i].rarity !== "rare") { idx = i; break; }
    }
    if (idx >= 0) next[idx] = line;
    else next.push(line);
    return next;
  }

  function pricedLines(lines, store) {
    return (lines || []).filter(function (row) {
      if (!row || row.checked === false) return false;
      if (row.price === "" || row.price == null) return false;
      var n = Math.round(Number(row.price));
      return isFinite(n) && n >= 0;
    }).map(function (row) {
      return {
        id: row.id || "",
        name: row.name || "",
        price: Math.round(Number(row.price)),
        store: store || row.store || "general",
        soldOut: false,
        ref: !!row.ref,
        qty: row.qty || trailingQty(row.name)
      };
    });
  }

  function townStores(town) {
    if (town === "boomtown" || town === "city") return { general: true, gun: true, music: true, traveling: false };
    return { general: true, gun: false, music: false, traveling: false };
  }

  function playerTabs(lines, open) {
    if (!open) return [];
    var seen = {};
    (lines || []).forEach(function (row) {
      if (row && row.store) seen[row.store] = 1;
    });
    return STORE_ORDER.filter(function (id) { return seen[id]; });
  }

  function grantPlan(item) {
    item = item || {};
    if (item.id && AMMO_BY_ID[item.id]) return Object.assign({}, AMMO_BY_ID[item.id]);
    var name = String(item.name || "");
    if (/cartridge/i.test(name) && !/belt|strap|loop/i.test(name)) {
      var qty = item.qty || trailingQty(name) || 1;
      var caliber = "Light";
      if (/\.50-90/i.test(name)) caliber = ".50-90";
      else if (/heavy/i.test(name)) caliber = "Heavy";
      else if (/medium/i.test(name)) caliber = "Medium";
      return { kind: "cartridge", caliber: caliber, qty: qty };
    }
    return { kind: "gear", qty: item.qty || 1 };
  }

  root.SSDNSStore = {
    TOWN_RANK: TOWN_RANK,
    STORE_ORDER: STORE_ORDER,
    STORE_LABEL: STORE_LABEL,
    eligible: eligible,
    defaultStock: defaultStock,
    randomStock: randomStock,
    merchantStock: merchantStock,
    merchantPool: merchantPool,
    markup: markup,
    hasPrice: hasPrice,
    stockableCommons: stockableCommons,
    trailingQty: trailingQty,
    lineFromItem: lineFromItem,
    slipRare: slipRare,
    pricedLines: pricedLines,
    townStores: townStores,
    playerTabs: playerTabs,
    grantPlan: grantPlan
  };
})(typeof window !== "undefined" ? window : globalThis);

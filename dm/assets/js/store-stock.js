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
    /* C1 (item template review, 2026-10-20): the Big Fifty reads ammo "bigfifty", so its rounds get their own pool
       (0.15 lb each in SSDNS_CARRY_WEIGHTS.ammoEach), not a regular cartridge pool at 0.05 lb */
    "big-fifty-cartridges-50-90-10": { kind: "ammo", type: "bigfifty", caliber: ".50-90", qty: 10 },
    /* inv2 (0.2.121): every other store ammo pack fills its sheet Ammo pool (the #100 quiver / bolt / pouch pools)
       instead of writing a gear note line */
    "arrows-20": { kind: "ammo", type: "arrows", caliber: "", qty: 20 },
    "crossbow-bolts-20": { kind: "ammo", type: "bolts", caliber: "", qty: 20 },
    "sling-stones-20": { kind: "ammo", type: "stones", caliber: "", qty: 20 },
    "blowpipe-needles-50": { kind: "ammo", type: "needles", caliber: "", qty: 50 },
    "powder-ball-and-caps-20-shots": { kind: "ammo", type: "percussion", caliber: "", qty: 20 },
    "shells-410-10": { kind: "ammo", type: "buck", caliber: ".410", qty: 10 },
    "shells-12-ga-10": { kind: "ammo", type: "buck", caliber: "12 ga", qty: 10 },
    "shells-10-ga-10": { kind: "ammo", type: "buck", caliber: "10 ga", qty: 10 },
    /* Jessey 2026-10-20 (9:17 AM): slugs are bought as their own rows at the buckshot price (BOOK1 L4212:
       "Shells come as buckshot or slugs at the same price") and fill the slug pool */
    "slug-shells-410-10": { kind: "ammo", type: "slug", caliber: ".410", qty: 10 },
    "slug-shells-12-ga-10": { kind: "ammo", type: "slug", caliber: "12 ga", qty: 10 },
    "slug-shells-10-ga-10": { kind: "ammo", type: "slug", caliber: "10 ga", qty: 10 },
    /* L0186 special arrows (2026-10-20): each type is its own arrows pool (caliber = type id); dynamite arrows are made, not sold */
    "arrows-broadhead-5": { kind: "ammo", type: "arrows", caliber: "broadhead", qty: 5 },
    "arrows-blunt-5": { kind: "ammo", type: "arrows", caliber: "blunt", qty: 5 },
    "arrows-fire-5": { kind: "ammo", type: "arrows", caliber: "fire", qty: 5 },
    "arrows-whistler-5": { kind: "ammo", type: "arrows", caliber: "whistler", qty: 5 },
    "arrows-poison-3": { kind: "ammo", type: "arrows", caliber: "poison", qty: 3 }
  };
  var AMMO_BY_NAME = [
    [/^broadhead( arrows)?\b/i, "arrows", "broadhead"], [/^blunt( arrows)?\b/i, "arrows", "blunt"], [/^fire arrows?\b/i, "arrows", "fire"],
    [/^whistler( arrows)?\b/i, "arrows", "whistler"], [/^poison arrows?\b/i, "arrows", "poison"],
    [/^arrows\b/i, "arrows", ""], [/^crossbow bolts\b/i, "bolts", ""], [/^sling (stones|bullets)\b/i, "stones", ""],
    [/^blowpipe needles\b/i, "needles", ""], [/^powder, ball,? and caps\b/i, "percussion", ""]
  ];

  /* L0193 (Jessey 2026-10-20, 10:23 AM): Act I stores sell only the Light ChaosMaker, at 4,000 ES. That is a store
     markup; the PHB list price (price_es 2,000 in store-items.json, rules.js) stays. Medium and Heavy stay out of
     Act I stores. Later acts are unchanged.
     Data-driven, on the store rows (optional fields; a row without them sells in every act at price_es):
       minAct: 2         -> not stocked before Act II
       acts: [2, 3]      -> stocked only in those acts
       actPrices: {"1": 4000} -> store price in that act (no traveling-merchant markup on top)
     The act is the room setting meta.act (DMCC Stores tab "Campaign act"; missing = Act I). */
  var ACT_MAX = 3;
  function normAct(act) {
    var n = parseInt(act, 10);
    if (!isFinite(n) || n < 1) return 1;
    return Math.min(ACT_MAX, n);
  }
  function inAct(it, act) {
    if (!it) return false;
    var n = normAct(act);
    if (it.minAct != null && n < Number(it.minAct)) return false;
    if (Array.isArray(it.acts) && it.acts.length && it.acts.map(Number).indexOf(n) < 0) return false;
    return true;
  }
  function actPriceOf(it, act) {
    var p = it && it.actPrices ? it.actPrices[String(normAct(act))] : null;
    return p == null || p === "" || !isFinite(Number(p)) ? null : Number(p);
  }
  /** Store rows as this act's stores sell them: rows outside the act dropped, act prices set (actPriced: no merchant markup). */
  function forAct(items, act) {
    return (items || []).filter(function (it) { return inAct(it, act); }).map(function (it) {
      var p = actPriceOf(it, act);
      if (p == null) return it;
      return Object.assign({}, it, { price_es: p, list_price_es: it.price_es, actPriced: true });
    });
  }
  /** Draft or live store lines under this act, checked against the store rows by id: lines outside the act dropped,
      act prices enforced. Lines with no matching row (ad-hoc DM lines) pass through. */
  function gateLines(lines, act, items) {
    var byId = {};
    (items || []).forEach(function (it) { if (it && it.id) byId[it.id] = it; });
    return (lines || []).filter(function (row) { return row && (!row.id || !byId[row.id] || inAct(byId[row.id], act)); }).map(function (row) {
      var p = row.id && byId[row.id] ? actPriceOf(byId[row.id], act) : null;
      if (p == null || Number(row.price) === p) return row;
      return Object.assign({}, row, { price: p, ref: false });
    });
  }
  function actLabel(act) { return "Act " + ["I", "II", "III"][normAct(act) - 1]; }

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
      picked.push(Object.assign({}, item, { price: item.actPriced ? Number(item.price_es) : markup(item.price_es) }));
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
    if (merchant && price != null && price !== "" && !it.actPriced) price = markup(price);
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
      if (/\.50-90|big fifty/i.test(name)) return { kind: "ammo", type: "bigfifty", caliber: ".50-90", qty: qty };
      var caliber = "Light";
      if (/heavy/i.test(name)) caliber = "Heavy";
      else if (/medium/i.test(name)) caliber = "Medium";
      return { kind: "cartridge", caliber: caliber, qty: qty };
    }
    /* shells by name: "slug" in the name fills the slug pool, other shells the buckshot pool */
    var ga = /\.410|12\s*ga|10\s*ga/i.exec(name);
    if (/shell|slug|buckshot/i.test(name) && ga) {
      var gauge = /410/.test(ga[0]) ? ".410" : (/12/.test(ga[0]) ? "12 ga" : "10 ga");
      return { kind: "ammo", type: /slug/i.test(name) ? "slug" : "buck", caliber: gauge, qty: item.qty || trailingQty(name) || 1 };
    }
    for (var k = 0; k < AMMO_BY_NAME.length; k++) {
      if (AMMO_BY_NAME[k][0].test(name)) return { kind: "ammo", type: AMMO_BY_NAME[k][1], caliber: AMMO_BY_NAME[k][2], qty: item.qty || trailingQty(name) || 1 };
    }
    return { kind: "gear", qty: item.qty || 1 };
  }

  root.SSDNSStore = {
    TOWN_RANK: TOWN_RANK,
    STORE_ORDER: STORE_ORDER,
    STORE_LABEL: STORE_LABEL,
    normAct: normAct,
    inAct: inAct,
    actPriceOf: actPriceOf,
    forAct: forAct,
    gateLines: gateLines,
    actLabel: actLabel,
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

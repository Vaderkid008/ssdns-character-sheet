/* N86 Asset Library (sheet 0.3.173 / DMCC 0.2.186).
   DM-only definitions at map/dm/assetLibrary/<id>, per room, plus an ssdns-asset-pack.
   Placed instances are map tokens (kind "asset"). Live actions: toggle, open/close, light.
   Health, trap, range, links, and immunities save their fields and stay stubs.
   Door Interact and Turn# fuse UI are N87. interact.dmApprove is stored and not enforced. */
(function (root) {
  "use strict";
  var PACK_FORMAT = "ssdns-asset-pack";
  var ACTION_IDS = ["toggle", "open", "light", "health", "trap", "range", "links", "immunities"];
  var LIVE = { toggle: 1, open: 1, light: 1 };
  var SFX_KEYS = ["interact", "on", "off", "open", "close"];
  var SFX_FILES = [
    "explode.mp3", "fuse.mp3", "thud.wav", "holster.mp3", "ui-tick.mp3", "ui-back.mp3",
    "spellcast.mp3", "heal.mp3", "electric.mp3", "teleport.mp3", "magic-whoosh-soft.mp3",
    "door" /* placeholder filtered below */
  ].filter(function (f) { return f.indexOf(".") > 0; });
  var GRANTABLES = [
    ["light", "Produce Light", "light"],
    ["toggle", "On/off switch", "toggle"],
    ["gate", "Gate open/close", "open"],
    ["health", "Health bar (cover)", "health"],
    ["trap", "Attack rolls / trigger DC", "trap"],
    ["range", "Range that causes effects", "range"],
    ["links", "Linkable switches", "links"],
    ["immunities", "Immunities", "immunities"]
  ];

  function slug(s) {
    return String(s || "asset").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32) || "asset";
  }
  function makeId(name, taken) {
    taken = taken || {};
    var base = "ast_" + slug(name), id = base, n = 2;
    while (taken[id]) id = base + "-" + (n++);
    return id;
  }
  function clampInt(v, lo, hi, dflt) {
    v = Math.round(Number(v));
    if (!isFinite(v)) v = dflt;
    return Math.max(lo, Math.min(hi, v));
  }
  function clone(v) {
    return JSON.parse(JSON.stringify(v == null ? null : v));
  }
  function blankProps() {
    return {
      light: { on: false, bright: 0, dim: 0, color: "" },
      toggle: { on: false, labelOn: "On", labelOff: "Off" },
      gate: { open: false, blocksMove: true, blocksSight: false },
      health: { max: 0, cover: "" },
      trap: { attack: 0, dc: 0, save: "", damage: "", onFail: "" },
      range: { feet: 0, condition: "", effect: "" },
      links: [],
      immunities: [],
      timer: { mode: "", fuseRounds: 0 }
    };
  }
  function normalizeSfx(sfx) {
    sfx = sfx || {};
    var out = {};
    SFX_KEYS.forEach(function (k) { out[k] = String(sfx[k] || "").slice(0, 400); });
    return out;
  }
  function normalizeImages(images, image) {
    var list = Array.isArray(images) ? images.map(function (s) { return String(s || "").slice(0, 800); }) : [];
    if (!list[0] && image) list[0] = String(image);
    return [String(list[0] || ""), String(list[1] || "")].filter(function (s, i) { return i === 0 || s; }).concat(list.slice(2, 4));
  }
  function normalizeActions(list) {
    var seen = {}, out = [];
    (list || []).forEach(function (id) {
      id = String(id || "");
      if (ACTION_IDS.indexOf(id) < 0 || seen[id]) return;
      seen[id] = 1;
      out.push(id);
    });
    return out;
  }
  function coverOf(v) {
    v = String(v || "");
    return v === "half" || v === "three-quarters" || v === "full" ? v : "";
  }
  function strList(v) {
    if (Array.isArray(v)) return v.map(function (s) { return String(s || "").trim(); }).filter(Boolean).slice(0, 24);
    return String(v || "").split(",").map(function (s) { return s.trim(); }).filter(Boolean).slice(0, 24);
  }
  function mergeProps(props) {
    var base = blankProps();
    props = props || {};
    var light = props.light || {};
    var toggle = props.toggle || {};
    var gate = props.gate || {};
    var health = props.health || {};
    var trap = props.trap || {};
    var range = props.range || {};
    var timer = props.timer || {};
    base.light = {
      on: !!light.on,
      bright: clampInt(light.bright, 0, 300, 0),
      dim: clampInt(light.dim, 0, 300, 0),
      color: String(light.color || "").slice(0, 40)
    };
    base.toggle = {
      on: !!toggle.on,
      labelOn: String(toggle.labelOn || "On").slice(0, 24) || "On",
      labelOff: String(toggle.labelOff || "Off").slice(0, 24) || "Off"
    };
    base.gate = { open: !!gate.open, blocksMove: gate.blocksMove !== false, blocksSight: !!gate.blocksSight };
    base.health = { max: clampInt(health.max, 0, 9999, 0), cover: coverOf(health.cover) };
    base.trap = {
      attack: clampInt(trap.attack, 0, 99, 0),
      dc: clampInt(trap.dc, 0, 40, 0),
      save: String(trap.save || "").slice(0, 16),
      damage: String(trap.damage || "").slice(0, 40),
      onFail: String(trap.onFail || "").slice(0, 80)
    };
    base.range = {
      feet: clampInt(range.feet, 0, 1000, 0),
      condition: String(range.condition || "").slice(0, 40),
      effect: String(range.effect || "").slice(0, 80)
    };
    base.links = strList(props.links);
    base.immunities = strList(props.immunities);
    base.timer = {
      mode: ["", "instant", "fuse", "plunger", "timer"].indexOf(String(timer.mode || "")) >= 0 ? String(timer.mode || "") : "",
      fuseRounds: clampInt(timer.fuseRounds, 0, 99, 0)
    };
    return base;
  }
  function newDef(opts, taken) {
    opts = opts || {};
    var now = Date.now();
    var actions = normalizeActions(opts.interact && opts.interact.actions);
    var images = normalizeImages(opts.images, opts.image);
    return {
      id: opts.id || makeId(opts.name, taken),
      name: String(opts.name || "New asset").slice(0, 80),
      size: clampInt(opts.size, 1, 4, 1),
      image: String(images[0] || opts.image || ""),
      images: images,
      sfx: normalizeSfx(opts.sfx),
      props: mergeProps(opts.props),
      interact: {
        reachFt: clampInt(opts.interact && opts.interact.reachFt, 0, 300, 5),
        actions: actions,
        dmApprove: !!(opts.interact && opts.interact.dmApprove)
      },
      targetable: !!opts.targetable,
      hiddenFromPlayers: !!opts.hiddenFromPlayers,
      notes: String(opts.notes || "").slice(0, 500),
      createdAt: opts.createdAt || now,
      updatedAt: now,
      v: 1
    };
  }
  function duplicate(entry, taken) {
    var copy = clone(entry || {});
    copy.id = "";
    copy.name = (copy.name || "Asset") + " (copy)";
    copy.createdAt = 0;
    return newDef(copy, taken);
  }
  function filter(list, query) {
    var qy = String(query || "").trim().toLowerCase();
    return (list || []).filter(function (a) {
      if (!a) return false;
      if (!qy) return true;
      return (String(a.name || "") + " " + String(a.notes || "")).toLowerCase().indexOf(qy) >= 0;
    });
  }
  function upsert(library, def) {
    var next = Object.assign({}, library || {});
    if (def && def.id) next[def.id] = clone(def);
    return next;
  }
  function removeDef(library, id) {
    var next = Object.assign({}, library || {});
    delete next[id];
    return next;
  }
  function exportPack(library, ids) {
    var assets = Object.keys(library || {}).filter(function (id) {
      return !ids || ids.indexOf(id) >= 0;
    }).map(function (id) { return clone(library[id]); }).filter(function (e) { return e && e.id && e.name; });
    return { format: PACK_FORMAT, version: 1, exportedAt: new Date().toISOString(), assets: assets };
  }
  function importPack(obj, existing) {
    if (typeof obj === "string") {
      try { obj = JSON.parse(obj); } catch (e) { return { entries: [], skipped: 0, warn: "That file isn't valid JSON." }; }
    }
    if (!obj || obj.format !== PACK_FORMAT || !Array.isArray(obj.assets)) {
      return { entries: [], skipped: 0, warn: "That isn't an SSDNS asset pack." };
    }
    var taken = Object.assign({}, existing || {}), out = [], skipped = 0;
    obj.assets.forEach(function (m) {
      if (!m || !m.name) { skipped++; return; }
      var images = normalizeImages(m.images, m.image).map(function (src) {
        return /^(data:|blob:)/.test(src) ? "" : src;
      });
      var keepId = m.id && !taken[m.id] ? m.id : "";
      var e = newDef(Object.assign({}, m, { id: keepId, image: images[0] || "", images: images }), taken);
      taken[e.id] = 1;
      out.push(e);
    });
    return { entries: out, skipped: skipped, warn: skipped ? skipped + " asset(s) skipped (each needs a name)." : "" };
  }

  function axisGap(origin, span, other, otherSpan) {
    var a0 = Number(origin) || 0, b0 = Number(other) || 0;
    var a1 = a0 + span - 1, b1 = b0 + otherSpan - 1;
    if (a1 < b0) return b0 - a1;
    if (b1 < a0) return a0 - b1;
    return 0;
  }
  function squaresOf(size) { return clampInt(size, 1, 4, 1); }
  /* Same Chebyshev footprint gap as the map's feetBetween (N64). */
  function feetBetween(a, b) {
    if (!a || !b || !a.pos || !b.pos) return null;
    var sa = squaresOf(a.size), sb = squaresOf(b.size);
    var gap = Math.max(axisGap(a.pos.x, sa, b.pos.x, sb), axisGap(a.pos.y, sa, b.pos.y, sb));
    return gap * 5;
  }
  function reachText(feet, need) {
    return "Out of reach (" + feet + " ft). Interact needs to be within " + need + " ft.";
  }
  function reachGate(actor, assetToken, reachFt) {
    var need = clampInt(reachFt, 0, 300, 5);
    var ft = feetBetween(actor, assetToken);
    if (ft == null) return { ok: false, feet: null, need: need, text: reachText("?", need) };
    if (ft <= need) return { ok: true, feet: ft, need: need, text: "" };
    return { ok: false, feet: ft, need: need, text: reachText(ft, need) };
  }

  function hasAction(asset, id) {
    var list = asset && asset.interact && asset.interact.actions;
    return !!(list && list.indexOf(id) >= 0);
  }
  function imageFor(asset) {
    if (!asset) return "";
    var imgs = asset.images || [];
    var st = asset.state || {};
    if ((st.on || st.open || st.lit) && imgs[1]) return String(imgs[1]);
    if (imgs[0]) return String(imgs[0]);
    return String(asset.image || "");
  }
  function lightsFor(asset) {
    if (!asset || !hasAction(asset, "light")) return [];
    if (!(asset.state && asset.state.lit)) return [];
    var L = (asset.props && asset.props.light) || {};
    var bright = Math.max(0, Number(L.bright) || 0);
    var dim = Math.max(0, Number(L.dim) || 0);
    if (bright <= 0 && dim <= 0) return [];
    return [{ id: "asset", name: asset.name || "Light", bright: bright, dim: dim, color: String(L.color || "") }];
  }
  function actionSpec(asset, id) {
    var st = (asset && asset.state) || {};
    var props = (asset && asset.props) || {};
    if (id === "toggle") {
      var t = props.toggle || {};
      var label = st.on ? (t.labelOff || "Off") : (t.labelOn || "On");
      return { id: "toggle", label: label, stub: false };
    }
    if (id === "open") return { id: "open", label: st.open ? "Close" : "Open", stub: false };
    if (id === "light") return { id: "light", label: st.lit ? "Light off" : "Light on", stub: false };
    if (id === "health") return { id: "health", label: "Health bar (coming soon)", stub: true };
    if (id === "trap") return { id: "trap", label: "Attack / DC (coming soon)", stub: true };
    if (id === "range") return { id: "range", label: "Range effect (coming soon)", stub: true };
    if (id === "links") return { id: "links", label: "Linked switches (coming soon)", stub: true };
    if (id === "immunities") return { id: "immunities", label: "Immunities (coming soon)", stub: true };
    if (id === "light-fuse") return { id: id, label: "Light fuse", stub: false };
    if (id === "start-timer") return { id: id, label: "Start timer", stub: false };
    if (id === "push-plunger") return { id: id, label: "Push plunger", stub: false };
    if (id === "trigger") return { id: id, label: "Trigger", stub: false };
    if (id === "defuse" || id === "clear-timer") return { id: id, label: "Defuse", stub: false };
    return null;
  }
  function timerMenuIds(asset) {
    var timer = asset && asset.props && asset.props.timer;
    var mode = timer && timer.mode;
    var ids = [];
    if (mode === "fuse") ids.push("light-fuse");
    else if (mode === "timer") ids.push("start-timer");
    else if (mode === "plunger") ids.push("push-plunger");
    else if (mode === "instant") ids.push("trigger");
    var st = (asset && asset.state) || {};
    if (st.firesAtRound != null || st.waiting) ids.push("defuse");
    return ids;
  }
  function menuActions(asset) {
    if (!asset) return [];
    if (Array.isArray(asset.actions) && (!asset.interact || !asset.props)) {
      return asset.actions.map(function (a) {
        return { id: a.id, label: a.label, stub: !!a.stub };
      }).filter(function (a) { return a.id; });
    }
    var list = ((asset.interact && asset.interact.actions) || []).map(function (id) {
      return actionSpec(asset, id);
    }).filter(Boolean);
    timerMenuIds(asset).forEach(function (id) {
      if (list.some(function (a) { return a.id === id; })) return;
      var spec = actionSpec(asset, id);
      if (spec) list.push(spec);
    });
    return list;
  }
  function instanceFromDef(def) {
    var d = clone(def || {});
    var props = mergeProps(d.props);
    var actions = normalizeActions(d.interact && d.interact.actions);
    var images = normalizeImages(d.images, d.image);
    return {
      defId: d.id || "",
      name: String(d.name || "Asset").slice(0, 80),
      size: clampInt(d.size, 1, 4, 1),
      image: String(images[0] || ""),
      images: images,
      sfx: normalizeSfx(d.sfx),
      props: props,
      interact: {
        reachFt: clampInt(d.interact && d.interact.reachFt, 0, 300, 5),
        actions: actions,
        dmApprove: !!(d.interact && d.interact.dmApprove)
      },
      targetable: !!d.targetable,
      notes: String(d.notes || "").slice(0, 500),
      state: {
        on: !!props.toggle.on,
        open: !!props.gate.open,
        lit: !!props.light.on,
        hp: props.health.max || 0,
        armedAtRound: null,
        firesAtRound: null
      },
      v: 1
    };
  }
  function blankState(asset) {
    var st = Object.assign({ on: false, open: false, lit: false, hp: 0, armedAtRound: null, firesAtRound: null }, (asset && asset.state) || {});
    return st;
  }
  function applyAction(asset, action) {
    if (!asset) return { ok: false, reason: "no-asset" };
    var id = String(action || "");
    var next = clone(asset);
    next.state = blankState(next);
    next.props = mergeProps(next.props);
    if (!hasAction(next, id)) return { ok: false, reason: "unavailable", stub: !LIVE[id] };
    if (!LIVE[id]) return { ok: false, reason: "coming-soon", stub: true };
    /* dmApprove is stored for traps and locks later. Open / On-off / Light apply immediately. */
    var name = next.name || "Asset";
    var sfx = next.sfx || {};
    if (id === "toggle") {
      next.state.on = !next.state.on;
      next.props.toggle.on = next.state.on;
      return done(next, next.state.on ? (sfx.on || sfx.interact) : (sfx.off || sfx.interact), name + (next.state.on ? " turned on" : " turned off"), id);
    }
    if (id === "open") {
      next.state.open = !next.state.open;
      next.props.gate.open = next.state.open;
      return done(next, next.state.open ? (sfx.open || sfx.interact) : (sfx.close || sfx.interact), name + (next.state.open ? " opened" : " closed"), id);
    }
    next.state.lit = !next.state.lit;
    next.props.light.on = next.state.lit;
    return done(next, sfx.interact || (next.state.lit ? sfx.on : sfx.off), name + (next.state.lit ? " lit" : " light off"), id);
  }
  function done(asset, sfx, log, action) {
    asset.image = imageFor(asset);
    return { ok: true, asset: asset, image: asset.image, lights: lightsFor(asset), sfx: sfx || "", log: log, action: action };
  }
  function publicAsset(token) {
    if (!token || token.kind !== "asset" || token.hidden) return null;
    var a = token.asset;
    if (!a || a.hiddenFromPlayers) return null;
    var st = a.state || {};
    var actions = menuActions(a).map(function (act) {
      return { id: act.id, label: act.label, stub: !!act.stub };
    });
    var max = Number(a.props && a.props.health && a.props.health.max) || 0;
    var hp = Number(st.hp);
    var hpPct = null;
    if (max > 0 && isFinite(hp)) hpPct = Math.max(0, Math.min(100, Math.round((hp / max) * 100)));
    var gateOn = hasAction(a, "open");
    var blocks = gateOn && a.props && a.props.gate && a.props.gate.blocksMove !== false;
    return {
      name: String(a.name || token.name || ""),
      size: squaresOf(a.size || token.size),
      image: imageFor(a),
      on: !!st.on,
      open: !!st.open,
      lit: !!st.lit,
      actions: actions,
      hpPct: hpPct,
      blocksMove: !!blocks,
      reachFt: clampInt(a.interact && a.interact.reachFt, 0, 300, 5)
    };
  }
  function feedRow(req) {
    req = req || {};
    var id = req.id || ("asset_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6));
    var by = String(req.by || req.from || "");
    return {
      id: id,
      ts: req.ts || new Date().toISOString(),
      from: by,
      fromName: String(req.fromName || ""),
      text: "asset",
      kind: "sfx",
      event: "asset",
      assetReq: { tokenId: String(req.tokenId || ""), action: String(req.action || ""), by: by }
    };
  }
  function applyFeed(token, row) {
    if (!token || !row || row.event !== "asset" || !row.assetReq) return { ok: false, reason: "bad-row" };
    if (String(token.kind || "asset") !== "asset") return { ok: false, reason: "not-asset" };
    if (row.assetReq.tokenId && token.id && row.assetReq.tokenId !== token.id) return { ok: false, reason: "mismatch" };
    var res = applyAction(token.asset, row.assetReq.action);
    if (!res.ok) return res;
    token.asset = res.asset;
    token.image = res.image;
    token.lights = res.lights;
    return res;
  }
  function isFullGate(token) {
    var a = token && token.asset;
    return !!(a && a.props && a.interact && hasAction(a, "open"));
  }
  function gateBlocks(token) {
    if (!token || (token.kind && token.kind !== "asset")) return false;
    var a = token.asset;
    if (!a) return false;
    if (isFullGate(token)) {
      if (a.props.gate && a.props.gate.blocksMove === false) return false;
      return !(a.state && a.state.open);
    }
    if (!a.blocksMove) return false;
    var openAct = (a.actions || []).some(function (x) { return x && x.id === "open"; });
    if (!openAct) return false;
    return !a.open;
  }
  function gatePassable(token) {
    if (!token || (token.kind && token.kind !== "asset")) return false;
    var a = token.asset;
    if (!a) return false;
    if (isFullGate(token)) {
      if (a.props.gate && a.props.gate.blocksMove === false) return true;
      return !!(a.state && a.state.open);
    }
    var openAct = (a.actions || []).some(function (x) { return x && x.id === "open"; });
    if (!openAct) return false;
    if (!a.blocksMove) return true;
    return !!a.open;
  }
  function cellBlockedByGate(tokens, x, y) {
    return (tokens || []).some(function (t) {
      if (!gateBlocks(t) || !t.pos) return false;
      var s = squaresOf(t.size || (t.asset && t.asset.size));
      return x >= t.pos.x && x < t.pos.x + s && y >= t.pos.y && y < t.pos.y + s;
    });
  }
  function noteRound(round, tokens) {
    var due = [];
    (tokens || []).forEach(function (t) {
      var st = t && t.asset && t.asset.state;
      if (!st || st.firesAtRound == null || st.firesAtRound === "") return;
      due.push({ tokenId: t.id || "", firesAtRound: st.firesAtRound, round: round, armedAtRound: st.armedAtRound });
    });
    return { round: round, due: due };
  }
  function sfxUrl(ref) {
    var s = String(ref || "").trim();
    if (!s) return "";
    if (/^(https?:|data:|blob:)/.test(s)) return s;
    if (root.SSDNSAudio && root.SSDNSAudio.fileUrl && s.indexOf("/") < 0) return root.SSDNSAudio.fileUrl("sfx", s);
    var path = s.replace(/^\.\//, "");
    var loc = root.location && root.location.pathname || "";
    if (/\/dm(\/|$)/.test(loc) && path.indexOf("../") !== 0) return "../" + path.replace(/^\//, "");
    return path;
  }

  var host = null;
  var handlers = {};
  function onInteract(tokenId, action, by) {
    if (tokenId && typeof tokenId === "object" && tokenId.door) {
      var doorAct = String(tokenId.action || action || "");
      var doorFn = handlers["door:" + doorAct];
      if (doorFn) return doorFn(tokenId, doorAct, by);
      return { ok: false, door: true, stub: true, wall: tokenId.wall || null, action: doorAct };
    }
    var id = tokenId, act = action, who = by;
    if (handlers[act]) return handlers[act](id, act, who);
    if (host && typeof host.apply === "function") return host.apply(id, act, who);
    return { ok: false, reason: "no-host" };
  }
  function doorInteract(wallRef, action) {
    return onInteract({ door: true, wall: wallRef || null, action: action || "" }, action, "");
  }
  var assetsApi = {
    onInteract: onInteract,
    onRound: function (round) {
      var tokens = host && typeof host.tokens === "function" ? host.tokens() : [];
      var note = noteRound(round, tokens);
      assetsApi._rounds.push(note);
      if (note.due.length) {
        try {
          console.info("SSDNSAssets.onRound", round, note.due.map(function (d) {
            return d.tokenId + "@" + d.firesAtRound;
          }).join(", "));
        } catch (e) {}
      }
      return note;
    },
    onTarget: function (tokenId, attack) {
      if (handlers.target) return handlers.target(tokenId, attack);
      if (host && typeof host.onTarget === "function") return host.onTarget(tokenId, attack);
      return { ok: false, stub: true, tokenId: tokenId || "" };
    },
    registerAction: function (id, handler) {
      if (!id || typeof handler !== "function") return false;
      handlers[String(id)] = handler;
      return true;
    },
    doorInteract: doorInteract,
    _rounds: []
  };
  root.SSDNSAssets = assetsApi;

  function bind(next) { host = next || null; return assetsApi; }

  /* ---------- panel ---------- */
  var ui = { dlg: null, api: null, query: "", editing: null };
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function takenIds() {
    var t = {}, lib = ui.api ? ui.api.library() : {};
    Object.keys(lib || {}).forEach(function (k) { t[k] = 1; });
    return t;
  }
  function field(name) {
    var f = ui.dlg && ui.dlg.querySelector('[data-al-f="' + name + '"]');
    return f ? f.value : null;
  }
  function checked(name) {
    var f = ui.dlg && ui.dlg.querySelector('[data-al-on="' + name + '"]');
    return f ? !!f.checked : null;
  }
  function readForm() {
    var d = ui.editing;
    if (!d || !ui.dlg) return d;
    var name = field("name");
    if (name != null) d.name = name;
    var size = field("size");
    if (size != null) d.size = size;
    var image = field("image");
    if (image != null && !/^blob:/.test(image)) d.image = image.trim();
    var imageOn = field("imageOn");
    if (imageOn != null && !/^blob:/.test(imageOn)) d.imageOn = imageOn.trim();
    var notes = field("notes");
    if (notes != null) d.notes = notes;
    var reach = field("reachFt");
    if (reach != null) d.reachFt = reach;
    var approve = checked("dmApprove");
    if (approve != null) d.dmApprove = approve;
    var targetable = checked("targetable");
    if (targetable != null) d.targetable = targetable;
    var hidden = checked("hiddenFromPlayers");
    if (hidden != null) d.hiddenFromPlayers = hidden;
    SFX_KEYS.forEach(function (k) {
      var v = field("sfx-" + k);
      if (v != null) d.sfx[k] = v.trim();
    });
    d.actions = [];
    GRANTABLES.forEach(function (g) {
      var on = checked(g[0]);
      if (on == null) {
        if ((d.actionsHeld || []).indexOf(g[2]) >= 0) d.actions.push(g[2]);
        return;
      }
      if (on) d.actions.push(g[2]);
    });
    d.actionsHeld = d.actions.slice();
    function put(key, dest) {
      var v = field(key);
      if (v != null) dest(v);
    }
    put("lightBright", function (v) { d.props.light.bright = v; });
    put("lightDim", function (v) { d.props.light.dim = v; });
    put("lightColor", function (v) { d.props.light.color = v; });
    var lightOn = checked("lightOn");
    if (lightOn != null) d.props.light.on = lightOn;
    put("labelOn", function (v) { d.props.toggle.labelOn = v; });
    put("labelOff", function (v) { d.props.toggle.labelOff = v; });
    var togOn = checked("toggleOn");
    if (togOn != null) d.props.toggle.on = togOn;
    var blocks = checked("blocksMove");
    if (blocks != null) d.props.gate.blocksMove = blocks;
    var sight = checked("blocksSight");
    if (sight != null) d.props.gate.blocksSight = sight;
    var gateOpen = checked("gateOpen");
    if (gateOpen != null) d.props.gate.open = gateOpen;
    put("hpMax", function (v) { d.props.health.max = v; });
    put("cover", function (v) { d.props.health.cover = v; });
    put("trapAtk", function (v) { d.props.trap.attack = v; });
    put("trapDc", function (v) { d.props.trap.dc = v; });
    put("trapSave", function (v) { d.props.trap.save = v; });
    put("trapDmg", function (v) { d.props.trap.damage = v; });
    put("trapFail", function (v) { d.props.trap.onFail = v; });
    put("rangeFt", function (v) { d.props.range.feet = v; });
    put("rangeCond", function (v) { d.props.range.condition = v; });
    put("rangeEffect", function (v) { d.props.range.effect = v; });
    put("links", function (v) { d.props.links = v; });
    put("immunities", function (v) { d.props.immunities = v; });
    return d;
  }
  function draftFromDef(def) {
    var d = def ? clone(def) : newDef({ name: "New asset" }, {});
    d.imageOn = (d.images && d.images[1]) || "";
    d.reachFt = d.interact && d.interact.reachFt != null ? d.interact.reachFt : 5;
    d.dmApprove = !!(d.interact && d.interact.dmApprove);
    d.actionsHeld = (d.interact && d.interact.actions) ? d.interact.actions.slice() : [];
    d.props = mergeProps(d.props);
    d.sfx = normalizeSfx(d.sfx);
    return d;
  }
  function defFromDraft(d, taken, keepId) {
    var actions = normalizeActions(d.actionsHeld || d.actions || []);
    return newDef({
      id: keepId || "",
      name: d.name,
      size: d.size,
      image: d.image,
      images: [d.image || "", d.imageOn || ""],
      sfx: d.sfx,
      props: d.props,
      interact: { reachFt: d.reachFt, actions: actions, dmApprove: !!d.dmApprove },
      targetable: !!d.targetable,
      hiddenFromPlayers: !!d.hiddenFromPlayers,
      notes: d.notes,
      createdAt: d.createdAt
    }, taken);
  }
  function sfxSelect(key, value) {
    var opts = '<option value="">(none)</option>' + SFX_FILES.map(function (f) {
      return '<option value="' + esc(f) + '"' + (value === f ? " selected" : "") + ">" + esc(f) + "</option>";
    }).join("");
    return '<label>' + esc(key) + ' <select data-al-sfx="' + key + '">' + opts + '</select></label>' +
      '<label>or URL / path <input data-al-f="sfx-' + key + '" value="' + esc(value || "") + '" placeholder="assets/sfx/… or https://"></label>' +
      '<button type="button" class="btn sm" data-al-preview="' + key + '">▶</button>';
  }
  function propBox(g, d) {
    var on = (d.actionsHeld || []).indexOf(g[2]) >= 0;
    var soon = LIVE[g[2]] ? "" : ' <span class="al-soon">(coming soon)</span>';
    var body = "";
    if (on && g[0] === "light") {
      var L = d.props.light;
      body = '<label>Bright ft <input type="number" min="0" max="300" data-al-f="lightBright" value="' + esc(L.bright) + '"></label>' +
        '<label>Dim ft <input type="number" min="0" max="300" data-al-f="lightDim" value="' + esc(L.dim) + '"></label>' +
        '<label>Color <input data-al-f="lightColor" value="' + esc(L.color) + '" placeholder="#ffcc66"></label>' +
        '<label><input type="checkbox" data-al-on="lightOn"' + (L.on ? " checked" : "") + '> Starts lit</label>';
    } else if (on && g[0] === "toggle") {
      var T = d.props.toggle;
      body = '<label>On label <input data-al-f="labelOn" value="' + esc(T.labelOn) + '"></label>' +
        '<label>Off label <input data-al-f="labelOff" value="' + esc(T.labelOff) + '"></label>' +
        '<label><input type="checkbox" data-al-on="toggleOn"' + (T.on ? " checked" : "") + '> Starts on</label>';
    } else if (on && g[0] === "gate") {
      var G = d.props.gate;
      body = '<label><input type="checkbox" data-al-on="blocksMove"' + (G.blocksMove !== false ? " checked" : "") + '> Blocks movement when closed</label>' +
        '<label><input type="checkbox" data-al-on="blocksSight"' + (G.blocksSight ? " checked" : "") + '> Blocks sight when closed</label>' +
        '<label><input type="checkbox" data-al-on="gateOpen"' + (G.open ? " checked" : "") + '> Starts open</label>';
    } else if (on && g[0] === "health") {
      var H = d.props.health;
      body = '<label>Max HP <input type="number" min="0" max="9999" data-al-f="hpMax" value="' + esc(H.max) + '"></label>' +
        '<label>Cover <select data-al-f="cover"><option value="">none</option>' +
        ["half", "three-quarters", "full"].map(function (c) {
          return '<option value="' + c + '"' + (H.cover === c ? " selected" : "") + ">" + c + "</option>";
        }).join("") + "</select></label>";
    } else if (on && g[0] === "trap") {
      var P = d.props.trap;
      body = '<label>Attack bonus <input type="number" min="0" max="99" data-al-f="trapAtk" value="' + esc(P.attack) + '"></label>' +
        '<label>DC <input type="number" min="0" max="40" data-al-f="trapDc" value="' + esc(P.dc) + '"></label>' +
        '<label>Save <input data-al-f="trapSave" value="' + esc(P.save) + '" placeholder="DEX"></label>' +
        '<label>Damage <input data-al-f="trapDmg" value="' + esc(P.damage) + '"></label>' +
        '<label>On fail <input data-al-f="trapFail" value="' + esc(P.onFail) + '"></label>';
    } else if (on && g[0] === "range") {
      var R = d.props.range;
      body = '<label>Feet <input type="number" min="0" max="1000" data-al-f="rangeFt" value="' + esc(R.feet) + '"></label>' +
        '<label>Condition <input data-al-f="rangeCond" value="' + esc(R.condition) + '"></label>' +
        '<label>Effect <input data-al-f="rangeEffect" value="' + esc(R.effect) + '"></label>';
    } else if (on && g[0] === "links") {
      body = '<label>Instance ids <input data-al-f="links" value="' + esc((d.props.links || []).join(", ")) + '" placeholder="tok_a, tok_b"></label>';
    } else if (on && g[0] === "immunities") {
      body = '<label>Immunities <input data-al-f="immunities" value="' + esc((d.props.immunities || []).join(", ")) + '" placeholder="fire, poison"></label>';
    }
    return '<fieldset class="al-prop"><legend><label><input type="checkbox" data-al-on="' + g[0] + '"' + (on ? " checked" : "") + "> " + esc(g[1]) + soon + "</label></legend>" + body + "</fieldset>";
  }
  function formHtml(d) {
    var hint = root.SSDNSMedia && root.SSDNSMedia.storageHint ? root.SSDNSMedia.storageHint() : "Uploads are optional. Paste a link instead.";
    return '<form class="ml-add al-form" data-al-form>' +
      '<div class="ml-add-fields">' +
      "<h3>" + (d.id ? "Edit asset" : "Create your own asset") + "</h3>" +
      '<label>Name <input data-al-f="name" value="' + esc(d.name || "") + '" required></label>' +
      '<label>Size (squares) <input type="number" min="1" max="4" data-al-f="size" value="' + esc(d.size || 1) + '"></label>' +
      '<label>Image link <input data-al-f="image" placeholder="https://… or assets/…" value="' + esc(d.image || "") + '"></label>' +
      '<label class="ml-upload">or upload <input type="file" accept="image/*" data-al-file="image"></label>' +
      '<label>On / open image <input data-al-f="imageOn" placeholder="optional second image" value="' + esc(d.imageOn || "") + '"></label>' +
      '<label class="ml-upload">or upload <input type="file" accept="image/*" data-al-file="imageOn"></label>' +
      (hint ? '<p class="fine">' + esc(hint) + "</p>" : "") +
      '<div class="al-sfx"><b>SFX</b>' + SFX_KEYS.map(function (k) { return '<div class="al-sfx-row">' + sfxSelect(k, d.sfx[k]) + "</div>"; }).join("") + "</div>" +
      '<div class="al-props">' + GRANTABLES.map(function (g) { return propBox(g, d); }).join("") + "</div>" +
      '<label>Interact within <input type="number" min="0" max="300" data-al-f="reachFt" value="' + esc(d.reachFt != null ? d.reachFt : 5) + '"> ft</label>' +
      '<label><input type="checkbox" data-al-on="targetable"' + (d.targetable ? " checked" : "") + "> Targetable</label>" +
      '<label><input type="checkbox" data-al-on="hiddenFromPlayers"' + (d.hiddenFromPlayers ? " checked" : "") + "> Hidden from players</label>" +
      '<label><input type="checkbox" data-al-on="dmApprove"' + (d.dmApprove ? " checked" : "") + "> DM must allow (stored, not enforced yet)</label>" +
      '<label>Notes (DM only) <textarea data-al-f="notes" rows="2">' + esc(d.notes || "") + "</textarea></label>" +
      '<p class="al-warn" data-al-warn>' + esc(d.warn || "") + "</p>" +
      '<div class="ml-add-acts"><button type="button" class="btn sm btn-primary" data-al-save>Save asset</button><button type="button" class="btn sm" data-al-cancel>Cancel</button></div>' +
      "</div></form>";
  }
  function card(def) {
    var img = def.image || (def.images && def.images[0]) || "";
    var tags = (def.interact && def.interact.actions || []).map(function (id) {
      return LIVE[id] ? id : id + " · soon";
    }).join(", ");
    return '<div class="ml-card" data-al-card="' + esc(def.id) + '" role="listitem">' +
      '<div class="ml-thumb" aria-hidden="true">' + (img ? '<img alt="" loading="lazy" src="' + esc(img) + '">' : '<span class="ml-noimg">No image</span>') + "</div>" +
      '<div class="ml-meta"><b class="ml-name">' + esc(def.name) + '</b><span class="ml-tag">' + esc((def.size || 1) + " sq") + (tags ? " · " + esc(tags) : "") + "</span></div>" +
      '<div class="ml-acts">' +
      '<button type="button" class="btn sm btn-primary" data-al-place="' + esc(def.id) + '">Place</button>' +
      '<button type="button" class="btn sm" data-al-edit="' + esc(def.id) + '">Edit</button>' +
      '<button type="button" class="btn sm" data-al-dup="' + esc(def.id) + '">Duplicate</button>' +
      '<button type="button" class="btn sm ml-danger" data-al-del="' + esc(def.id) + '">Delete</button>' +
      "</div></div>";
  }
  function render() {
    if (!ui.dlg || !ui.api) return;
    if (ui.editing) readForm();
    var lib = ui.api.library() || {};
    var list = filter(Object.keys(lib).map(function (id) { return lib[id]; }), ui.query);
    var body = ui.dlg.querySelector(".ml-body");
    body.innerHTML =
      '<div class="ml-head"><h2>Assets</h2><input type="search" class="ml-search" placeholder="Search assets" aria-label="Search assets" value="' + esc(ui.query) + '">' +
      '<div class="ml-tools"><button type="button" class="btn sm btn-primary" data-al-add>Add</button><button type="button" class="btn sm" data-al-export>Export pack</button><label class="btn sm ml-import">Import pack<input type="file" accept="application/json,.json" data-al-import hidden></label><button type="button" class="btn sm" data-al-close>Close</button></div></div>' +
      (ui.editing ? formHtml(ui.editing) : "") +
      '<div class="ml-grid" role="list">' + (list.map(card).join("") || '<p class="fine">No assets yet. Add one, or import a pack.</p>') + "</div>" +
      '<p class="fine ml-foot">Assets save in this room. Export a pack to move them to another campaign. Place, then click a square. On/off, Open/close, and Light work now. The other properties are saved for later.</p>';
    var s = body.querySelector(".ml-search");
    if (s && ui.focusSearch) { s.focus(); var n = s.value.length; if (s.setSelectionRange) s.setSelectionRange(n, n); ui.focusSearch = false; }
  }
  function toast(msg) { if (ui.api && ui.api.toast) ui.api.toast(msg); }
  function previewSfx(key) {
    readForm();
    var ref = ui.editing && ui.editing.sfx && ui.editing.sfx[key];
    var url = sfxUrl(ref);
    if (!url) { toast("No sound on " + key); return; }
    if (root.SSDNSAudio && root.SSDNSAudio.playUrl) root.SSDNSAudio.playUrl(url);
    else toast(url);
  }
  function uploadFile(file, which) {
    readForm();
    var d = ui.editing;
    if (!d || !file) return;
    var M = root.SSDNSMedia;
    if (!M || !M.upload) { d.warn = "Preview only: uploads need Firebase Storage. Paste a link to save."; render(); return; }
    d.warn = "Uploading…";
    render();
    M.upload(file, "images", file.name || "asset", null).then(function (res) {
      if (ui.editing !== d) return;
      if (which === "imageOn") d.imageOn = res.url; else d.image = res.url;
      d.warn = "Uploaded.";
      render();
    }, function (err) {
      if (ui.editing !== d) return;
      d.warn = (err && err.message ? err.message : "Upload failed.") + " Paste a link to save.";
      render();
    });
  }
  function onClick(e) {
    var t = e.target.closest ? e.target.closest("button") : null;
    if (!t || !ui.api) return;
    var lib = ui.api.library() || {};
    var id;
    if (t.hasAttribute("data-al-close")) { close(); return; }
    if (t.hasAttribute("data-al-add")) { ui.editing = draftFromDef(null); render(); return; }
    if (t.hasAttribute("data-al-cancel")) { ui.editing = null; render(); return; }
    if (t.hasAttribute("data-al-save")) {
      readForm();
      var d = ui.editing;
      if (!d || !String(d.name || "").trim()) { d.warn = "Name the asset first."; render(); return; }
      if (/^(data:|blob:)/.test(String(d.image || "")) || /^(data:|blob:)/.test(String(d.imageOn || ""))) {
        d.warn = "Paste an https link or a repo path. Local preview files are not saved.";
        render();
        return;
      }
      var keep = d._keepId || "";
      var def = defFromDraft(d, takenIds(), keep);
      if (keep) def.id = keep;
      ui.api.save(def);
      ui.editing = null;
      toast("Saved " + def.name);
      render();
      return;
    }
    if ((id = t.getAttribute("data-al-edit"))) {
      ui.editing = draftFromDef(lib[id]);
      ui.editing._keepId = id;
      render();
      return;
    }
    if ((id = t.getAttribute("data-al-dup"))) {
      var copy = duplicate(lib[id], takenIds());
      ui.api.save(copy);
      toast("Duplicated " + copy.name);
      render();
      return;
    }
    if ((id = t.getAttribute("data-al-del"))) {
      var gone = lib[id];
      if (!gone) return;
      if (root.confirm && !root.confirm('Delete "' + gone.name + '" from the library? Placed copies stay on the map until you delete them.')) return;
      ui.api.remove(id);
      toast("Deleted " + gone.name);
      render();
      return;
    }
    if ((id = t.getAttribute("data-al-place"))) {
      var def = lib[id];
      if (!def || !ui.api.place) return;
      close();
      ui.api.place(def);
      return;
    }
    if (t.hasAttribute("data-al-preview")) { previewSfx(t.getAttribute("data-al-preview")); return; }
    if (t.hasAttribute("data-al-export")) {
      var pack = exportPack(lib);
      var blob = new root.Blob([JSON.stringify(pack, null, 1)], { type: "application/json" });
      var a = root.document.createElement("a");
      a.href = root.URL.createObjectURL(blob);
      a.download = "ssdns-asset-pack.json";
      root.document.body.appendChild(a);
      a.click();
      a.remove();
      toast("Exported " + pack.assets.length + " asset(s)");
    }
  }
  function onInput(e) {
    var t = e.target;
    if (t.classList && t.classList.contains("ml-search")) {
      ui.query = t.value;
      ui.focusSearch = true;
      render();
    }
  }
  function onChange(e) {
    var t = e.target;
    if (!t) return;
    if (t.hasAttribute && t.hasAttribute("data-al-import")) {
      var file = t.files && t.files[0];
      if (!file) return;
      file.text().then(function (txt) {
        var res = importPack(txt, ui.api.library());
        res.entries.forEach(function (en) { ui.api.save(en); });
        toast("Imported " + res.entries.length + " asset(s)" + (res.warn ? ". " + res.warn : ""));
        render();
      });
      return;
    }
    if (t.hasAttribute && t.hasAttribute("data-al-file")) { uploadFile(t.files && t.files[0], t.getAttribute("data-al-file")); return; }
    if (t.hasAttribute && t.hasAttribute("data-al-sfx")) {
      readForm();
      var key = t.getAttribute("data-al-sfx");
      if (ui.editing && t.value) ui.editing.sfx[key] = t.value;
      render();
      return;
    }
    if (t.hasAttribute && t.hasAttribute("data-al-on")) {
      readForm();
      render();
    }
  }
  function open(api) {
    ui.api = api || ui.api;
    if (!ui.api || !root.document) return;
    if (!ui.dlg) {
      var d = root.document.createElement("dialog");
      d.className = "dlg ml-dialog al-dialog";
      d.innerHTML = '<div class="ml-body"></div>';
      d.addEventListener("click", onClick);
      d.addEventListener("input", onInput);
      d.addEventListener("change", onChange);
      d.addEventListener("cancel", function () { ui.editing = null; });
      root.document.body.appendChild(d);
      ui.dlg = d;
    }
    render();
    if (!ui.dlg.open) { try { ui.dlg.showModal(); } catch (e) { ui.dlg.setAttribute("open", ""); } }
  }
  function close() {
    if (!ui.dlg) return;
    ui.editing = null;
    try { ui.dlg.close(); } catch (e) { ui.dlg.removeAttribute("open"); }
  }
  function refresh() { if (ui.dlg && (ui.dlg.open || ui.dlg.hasAttribute("open"))) render(); }

  root.SSDNSAssetLibrary = {
    PACK_FORMAT: PACK_FORMAT,
    ACTION_IDS: ACTION_IDS,
    SFX_FILES: SFX_FILES,
    makeId: makeId,
    newDef: newDef,
    duplicate: duplicate,
    filter: filter,
    upsert: upsert,
    removeDef: removeDef,
    exportPack: exportPack,
    importPack: importPack,
    feetBetween: feetBetween,
    reachGate: reachGate,
    reachText: reachText,
    instanceFromDef: instanceFromDef,
    imageFor: imageFor,
    lightsFor: lightsFor,
    menuActions: menuActions,
    applyAction: applyAction,
    publicAsset: publicAsset,
    feedRow: feedRow,
    applyFeed: applyFeed,
    gateBlocks: gateBlocks,
    gatePassable: gatePassable,
    cellBlockedByGate: cellBlockedByGate,
    noteRound: noteRound,
    sfxUrl: sfxUrl,
    doorInteract: doorInteract,
    bind: bind,
    open: open,
    close: close,
    refresh: refresh
  };
})(typeof window !== "undefined" ? window : globalThis);

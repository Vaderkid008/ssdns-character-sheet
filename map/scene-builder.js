/* DM Scene Builder. A scene is a named stack of floors the DM saves on this device
   and can load into any room. Pack files and room maps are never rewritten.
   Each floor.stairs entry is a link (stairs, ladder, or door) plus its landing.
   Encounter pieces stay null. Players do not walk links yet. */
(function (root) {
  "use strict";
  var KEY = "ssdns.sceneLibrary.v1";

  function clone(v) {
    return JSON.parse(JSON.stringify(v == null ? null : v));
  }
  function nid(prefix) {
    return prefix + "_" + Math.random().toString(36).slice(2, 8);
  }
  function num(v) {
    var n = Math.round(Number(v));
    return isFinite(n) ? n : 0;
  }
  function storeOf(store) {
    if (store && store.getItem && store.setItem) return store;
    try { if (root.localStorage) return root.localStorage; } catch (e) {}
    return { getItem: function () { return null; }, setItem: function () {} };
  }
  function readLibrary(store) {
    try {
      var raw = storeOf(store).getItem(KEY);
      var parsed = raw ? JSON.parse(raw) : {};
      var scenes = parsed && parsed.scenes && typeof parsed.scenes === "object" ? parsed.scenes : {};
      return { scenes: scenes };
    } catch (e) { return { scenes: {} }; }
  }
  function writeLibrary(store, lib) {
    storeOf(store).setItem(KEY, JSON.stringify({ scenes: lib.scenes || {} }));
    return lib;
  }
  function blank(name) {
    return {
      id: nid("scene"),
      name: name || "New scene",
      startFloorId: "",
      floors: [],
      stairs: [],
      encounters: null
    };
  }
  function floorOf(scene, id) {
    return (scene.floors || []).filter(function (f) { return f && (f.id === id || f.mapId === id); })[0] || null;
  }
  var COLORS = ["#c9a227", "#6aa8e8", "#e07a4a", "#7dba6a", "#c46b8a"];
  function freshGroup(name, i, isDefault) {
    return { id: nid("grp"), name: String(name || "Party").slice(0, 40), color: COLORS[(i || 0) % COLORS.length], isDefault: !!isDefault };
  }
  function groupsOf(f) {
    var groups = (f.groups || []).filter(Boolean).map(function (g, i) {
      return {
        id: g.id || nid("grp"),
        name: String(g.name || "Party").slice(0, 40),
        color: g.color || COLORS[i % COLORS.length],
        isDefault: !!g.isDefault
      };
    });
    if (!groups.length) groups.push(freshGroup("Party", 0, true));
    if (!groups.some(function (g) { return g.isDefault; })) groups[0].isDefault = true;
    var fallback = groups.filter(function (g) { return g.isDefault; })[0].id;
    var buckets = {};
    groups.forEach(function (g) { buckets[g.id] = []; });
    (f.spawns || []).filter(Boolean).forEach(function (sp, i) {
      var gid = sp.groupId && buckets[sp.groupId] ? sp.groupId : fallback;
      buckets[gid].push({
        id: sp.id || nid("spawn"),
        groupId: gid,
        n: sp.n != null ? num(sp.n) : (i + 1),
        x: num(sp.x),
        y: num(sp.y)
      });
    });
    var spawns = [];
    groups.forEach(function (g) {
      buckets[g.id].sort(function (a, b) { return a.n - b.n || String(a.id).localeCompare(String(b.id)); });
      buckets[g.id].forEach(function (sp, i) { sp.n = i + 1; sp.name = g.name; spawns.push(sp); });
    });
    return { groups: groups, spawns: spawns };
  }
  function tidy(scene) {
    scene = clone(scene) || blank();
    if (!scene.id) scene.id = nid("scene");
    scene.name = String(scene.name || "New scene").slice(0, 80);
    if (scene.encounters && Array.isArray(scene.encounters.floors)) {
      scene.encounters.floors.forEach(function (row) {
        if (!row) return;
        var floor = (scene.floors || []).filter(function (f) {
          return f && (f.id === row.floorId || f.mapId === row.mapId || f.id === row.id || f.mapId === row.floorId);
        })[0];
        if (!floor) return;
        floor.encounters = floor.encounters || { containers: [], enemies: [] };
        (row.containers || []).forEach(function (c) { floor.encounters.containers.push(c); });
        (row.enemies || []).forEach(function (e) { floor.encounters.enemies.push(e); });
      });
    }
    scene.floors = (scene.floors || []).filter(function (f) { return f && f.mapId; }).map(function (f, i) {
      var packed = groupsOf(f);
      return {
        id: f.id || f.mapId,
        mapId: String(f.mapId),
        name: String(f.name || f.mapId).slice(0, 80),
        order: i,
        source: f.source || "pack",
        groups: packed.groups,
        spawns: packed.spawns,
        stairs: Array.isArray(f.stairs) ? f.stairs : [],
        encounters: tidyFloorEnc(f.encounters)
      };
    });
    if (!floorOf(scene, scene.startFloorId)) scene.startFloorId = (scene.floors[0] && scene.floors[0].id) || "";
    tidyStairs(scene);
    scene.encounters = encounterSummary(scene);
    return scene;
  }
  function tidyItems(items) {
    if (typeof items === "string") items = items.split(/\n+/);
    return (items || []).map(function (it, i) {
      if (it == null || it === "") return null;
      if (typeof it === "string") {
        var text = it.trim();
        var qty = 1;
        var named = text.replace(/\s+x\s*(\d+)\s*$/i, function (_, n) { qty = num(n) || 1; return ""; }).trim();
        return { id: "item_" + i, name: named.slice(0, 80), qty: qty || 1, catalogId: "" };
      }
      return {
        id: it.id || ("item_" + i),
        name: String(it.name || it.catalogId || "Item").slice(0, 80),
        qty: num(it.qty) || 1,
        catalogId: String(it.catalogId || "")
      };
    }).filter(function (it) { return it && it.name; });
  }
  function tidyFloorEnc(raw) {
    raw = raw || {};
    return {
      containers: (raw.containers || []).filter(Boolean).map(function (c) {
        var kind = c.kind === "strongbox" ? "strongbox" : "chest";
        return {
          id: c.id || nid("box"),
          kind: kind,
          name: String(c.name || (kind === "strongbox" ? "Strongbox" : "Chest")).slice(0, 80),
          x: num(c.x),
          y: num(c.y),
          items: tidyItems(c.items),
          lockDc: Math.max(0, num(c.lockDc)),
          forceDc: c.forceDc == null || c.forceDc === "" ? (kind === "strongbox" ? 25 : 15) : Math.max(0, num(c.forceDc)),
          unlocked: !!c.unlocked,
          allowRetries: !!c.allowRetries,
          improvise: !!c.improvise,
          keyItem: String(c.keyItem || "").slice(0, 80),
          cashEs: Math.max(0, num(c.cashEs)),
          hidden: !!c.hidden,
          hideDc: Math.max(0, num(c.hideDc))
        };
      }),
      enemies: (raw.enemies || []).filter(Boolean).map(function (e) {
        return {
          id: e.id || nid("foe"),
          bestiaryId: String(e.bestiaryId || ""),
          name: String(e.name || e.bestiaryId || "Enemy").slice(0, 80),
          x: num(e.x),
          y: num(e.y),
          hidden: e.hidden !== false,
          initGroup: String(e.initGroup || "").slice(0, 40),
          xp: Math.max(0, num(e.xp)),
          hp: e.hp == null || e.hp === "" ? null : Math.max(0, num(e.hp))
        };
      })
    };
  }
  function encounterSummary(scene) {
    var xp = 0, containers = 0, enemies = 0, hidden = 0, loot = [];
    (scene.floors || []).forEach(function (f) {
      var enc = f.encounters || { containers: [], enemies: [] };
      containers += enc.containers.length;
      enc.enemies.forEach(function (e) { enemies += 1; xp += e.xp || 0; if (e.hidden) hidden += 1; });
      enc.containers.forEach(function (c) {
        loot.push({ floor: f.name, name: c.name, kind: c.kind, items: (c.items || []).map(function (it) { return it.qty > 1 ? it.name + " x" + it.qty : it.name; }) });
      });
    });
    if (!containers && !enemies) return null;
    return { xp: xp, containers: containers, enemies: enemies, hidden: hidden, loot: loot };
  }
  function lootFromContainer(c) {
    var enc = tidyFloorEnc({ containers: [c] }).containers[0];
    var dc = enc.lockDc;
    return {
      id: "enc_" + enc.id,
      name: enc.name,
      boxType: enc.kind,
      container: enc.kind,
      rolled: true,
      opened: false,
      taken: false,
      improvise: !!enc.improvise,
      contents: enc.items.map(function (it) {
        return { id: it.catalogId || it.id, catalogId: it.catalogId || "", name: it.name, qty: it.qty, taken: false };
      }),
      hidden: !!enc.hidden,
      hideDc: enc.hideDc || 0,
      found: !enc.hidden,
      cash: { es: enc.cashEs || 0, black: 0, blackId: "", branch: "none" },
      lock: {
        dc: dc,
        difficulty: dc >= 20 ? "Hard" : (dc >= 15 ? "Medium" : (dc > 0 ? "Easy" : "")),
        unlocked: !!enc.unlocked || !(dc > 0),
        method: dc > 0 ? ["tools", "force"].concat(enc.keyItem ? ["key"] : []) : [],
        keyItem: enc.keyItem || "",
        jammed: false,
        jamOnFail: false,
        allowRetries: !!enc.allowRetries,
        attempts: {},
        forceDc: enc.forceDc,
        forceAttempts: {}
      },
      log: ["From the encounter pack"]
    };
  }
  function linkKind(kind) {
    return kind === "down" || kind === "ladder" || kind === "door" || kind === "up" ? kind : "up";
  }
  function optNum(v) {
    if (v == null || v === "") return null;
    return num(v);
  }
  function oppositeKind(kind) {
    if (kind === "up") return "down";
    if (kind === "down") return "up";
    return linkKind(kind);
  }
  function findLink(scene, linkId) {
    var found = null;
    (scene.floors || []).forEach(function (f) {
      (f.stairs || []).forEach(function (s) { if (s && s.id === linkId) found = { floor: f, link: s }; });
    });
    return found;
  }
  function tidyStairs(scene) {
    var floors = scene.floors || [];
    var byId = {};
    floors.forEach(function (f) {
      f.stairs = (f.stairs || []).filter(Boolean).map(function (link) {
        var dest = floors.filter(function (d) {
          return d !== f && (d.id === link.destFloorId || d.mapId === link.destFloorId || d.id === link.destMapId || d.mapId === link.destMapId);
        })[0] || null;
        var row = {
          id: link.id || nid("link"),
          kind: linkKind(link.kind),
          x: num(link.x),
          y: num(link.y),
          destFloorId: dest ? dest.id : "",
          destMapId: dest ? dest.mapId : "",
          landX: dest ? optNum(link.landX) : null,
          landY: dest ? optNum(link.landY) : null,
          twoWay: !!link.twoWay,
          pairId: link.pairId || "",
          visible: !!link.visible
        };
        if (!dest) { row.twoWay = false; row.pairId = ""; }
        byId[row.id] = row;
        return row;
      });
    });
    floors.forEach(function (f) {
      f.stairs.forEach(function (link) {
        if (link.pairId && !byId[link.pairId]) link.pairId = "";
      });
    });
    scene.stairs = [];
  }
  function syncPair(scene, floor, link) {
    var ready = !!(link.twoWay && link.destFloorId && link.landX != null && link.landY != null);
    if (!ready) {
      if (link.pairId) {
        var old = findLink(scene, link.pairId);
        if (old) old.floor.stairs = old.floor.stairs.filter(function (s) { return s.id !== link.pairId; });
        link.pairId = "";
      }
      return;
    }
    var dest = floorOf(scene, link.destFloorId);
    if (!dest || dest.id === floor.id) { link.twoWay = false; return; }
    var back = link.pairId ? findLink(scene, link.pairId) : null;
    if (back && back.floor.id !== dest.id) {
      back.floor.stairs = back.floor.stairs.filter(function (s) { return s.id !== back.link.id; });
      link.pairId = "";
      back = null;
    }
    if (!back) {
      var made = {
        id: nid("link"),
        kind: oppositeKind(link.kind),
        x: link.landX,
        y: link.landY,
        destFloorId: floor.id,
        destMapId: floor.mapId,
        landX: link.x,
        landY: link.y,
        twoWay: true,
        pairId: link.id,
        visible: false
      };
      dest.stairs.push(made);
      link.pairId = made.id;
      return;
    }
    back.link.kind = oppositeKind(link.kind);
    back.link.x = link.landX;
    back.link.y = link.landY;
    back.link.destFloorId = floor.id;
    back.link.destMapId = floor.mapId;
    back.link.landX = link.x;
    back.link.landY = link.y;
    back.link.twoWay = true;
    back.link.pairId = link.id;
  }
  function addFloor(scene, map) {
    scene = tidy(scene);
    if (!map || !map.id) return scene;
    if (scene.floors.some(function (f) { return f.mapId === map.id; })) return scene;
    scene.floors.push({
      id: nid("floor"),
      mapId: String(map.id),
      name: String(map.name || map.id).slice(0, 80),
      order: scene.floors.length,
      source: map.source || "pack",
      groups: [freshGroup("Party", 0, true)],
      spawns: [],
      stairs: []
    });
    if (!scene.startFloorId) scene.startFloorId = scene.floors[scene.floors.length - 1].id;
    return tidy(scene);
  }
  function renameFloor(scene, floorId, name) {
    scene = tidy(scene);
    var floor = floorOf(scene, floorId);
    if (floor) floor.name = String(name || floor.mapId).slice(0, 80);
    return scene;
  }
  function removeFloor(scene, floorId) {
    scene = tidy(scene);
    scene.floors = scene.floors.filter(function (f) { return f.id !== floorId && f.mapId !== floorId; });
    return tidy(scene);
  }
  function moveFloor(scene, floorId, dir) {
    scene = tidy(scene);
    var i = -1;
    scene.floors.forEach(function (f, n) { if (f.id === floorId) i = n; });
    var j = i + (dir < 0 ? -1 : 1);
    if (i < 0 || j < 0 || j >= scene.floors.length) return scene;
    var row = scene.floors.splice(i, 1)[0];
    scene.floors.splice(j, 0, row);
    return tidy(scene);
  }
  function reorder(scene, ids) {
    scene = tidy(scene);
    var bag = {};
    scene.floors.forEach(function (f) { bag[f.id] = f; });
    var next = [];
    (ids || []).forEach(function (id) { if (bag[id]) { next.push(bag[id]); delete bag[id]; } });
    Object.keys(bag).forEach(function (id) { next.push(bag[id]); });
    scene.floors = next;
    return tidy(scene);
  }
  function setStart(scene, floorId) {
    scene = tidy(scene);
    if (floorOf(scene, floorId)) scene.startFloorId = floorOf(scene, floorId).id;
    return scene;
  }
  function defaultGroup(floor) {
    return (floor.groups || []).filter(function (g) { return g.isDefault; })[0] || (floor.groups || [])[0] || null;
  }
  function addGroup(scene, floorId, name) {
    scene = tidy(scene);
    var floor = floorOf(scene, floorId);
    if (!floor) return scene;
    floor.groups.push(freshGroup(name || ("Group " + (floor.groups.length + 1)), floor.groups.length, floor.groups.length === 0));
    return tidy(scene);
  }
  function renameGroup(scene, floorId, groupId, name) {
    scene = tidy(scene);
    var floor = floorOf(scene, floorId);
    if (!floor) return scene;
    floor.groups.forEach(function (g) { if (g.id === groupId) g.name = String(name || g.name).slice(0, 40); });
    return scene;
  }
  function setDefaultGroup(scene, floorId, groupId) {
    scene = tidy(scene);
    var floor = floorOf(scene, floorId);
    if (!floor || !floor.groups.some(function (g) { return g.id === groupId; })) return scene;
    floor.groups.forEach(function (g) { g.isDefault = g.id === groupId; });
    return scene;
  }
  function addSpawn(scene, floorId, spawn) {
    scene = tidy(scene);
    var floor = floorOf(scene, floorId);
    if (!floor) return scene;
    spawn = spawn || {};
    var group = floor.groups.filter(function (g) { return g.id === spawn.groupId; })[0] || defaultGroup(floor);
    var n = 1 + floor.spawns.filter(function (sp) { return sp.groupId === group.id; }).length;
    floor.spawns.push({ id: spawn.id || nid("spawn"), groupId: group.id, n: spawn.n != null ? num(spawn.n) : n, x: num(spawn.x), y: num(spawn.y) });
    return tidy(scene);
  }
  function setSpawn(scene, floorId, spawnId, patch) {
    scene = tidy(scene);
    var floor = floorOf(scene, floorId);
    if (!floor) return scene;
    floor.spawns.forEach(function (sp) {
      if (sp.id !== spawnId) return;
      if (patch.x != null) sp.x = num(patch.x);
      if (patch.y != null) sp.y = num(patch.y);
      if (patch.groupId) sp.groupId = patch.groupId;
    });
    return tidy(scene);
  }
  function removeSpawn(scene, floorId, spawnId) {
    scene = tidy(scene);
    var floor = floorOf(scene, floorId);
    if (floor) floor.spawns = floor.spawns.filter(function (sp) { return sp.id !== spawnId; });
    return tidy(scene);
  }
  function addLink(scene, floorId, link) {
    scene = tidy(scene);
    var floor = floorOf(scene, floorId);
    if (!floor) return scene;
    link = link || {};
    floor.stairs.push({
      id: link.id || nid("link"),
      kind: linkKind(link.kind),
      x: num(link.x),
      y: num(link.y),
      destFloorId: link.destFloorId || "",
      destMapId: link.destMapId || "",
      landX: optNum(link.landX),
      landY: optNum(link.landY),
      twoWay: !!link.twoWay,
      pairId: link.pairId || "",
      visible: !!link.visible
    });
    return tidy(scene);
  }
  function setLink(scene, floorId, linkId, patch) {
    scene = tidy(scene);
    var hit = findLink(scene, linkId);
    if (!hit) return scene;
    if (floorId && hit.floor.id !== floorId && hit.floor.mapId !== floorId) return scene;
    var link = hit.link;
    patch = patch || {};
    if (patch.kind) link.kind = linkKind(patch.kind);
    if (patch.x != null) link.x = num(patch.x);
    if (patch.y != null) link.y = num(patch.y);
    if (patch.destFloorId != null) {
      var dest = floorOf(scene, patch.destFloorId);
      link.destFloorId = dest && dest.id !== hit.floor.id ? dest.id : "";
      link.destMapId = dest && dest.id !== hit.floor.id ? dest.mapId : "";
      if (!link.destFloorId) { link.landX = null; link.landY = null; }
    }
    if (patch.landX != null) link.landX = num(patch.landX);
    if (patch.landY != null) link.landY = num(patch.landY);
    if (patch.twoWay != null) link.twoWay = !!patch.twoWay;
    if (patch.visible != null) link.visible = !!patch.visible;
    syncPair(scene, hit.floor, link);
    return tidy(scene);
  }
  function removeLink(scene, floorId, linkId) {
    scene = tidy(scene);
    var hit = findLink(scene, linkId);
    if (!hit) return scene;
    if (floorId && hit.floor.id !== floorId && hit.floor.mapId !== floorId) return scene;
    var pairId = hit.link.pairId;
    hit.floor.stairs = hit.floor.stairs.filter(function (s) { return s.id !== linkId; });
    if (pairId) {
      var pair = findLink(scene, pairId);
      if (pair) { pair.link.pairId = ""; pair.link.twoWay = false; }
    }
    return tidy(scene);
  }
  function findPiece(scene, id) {
    var hit = null;
    (scene.floors || []).forEach(function (floor) {
      var enc = floor.encounters || { containers: [], enemies: [] };
      (enc.containers || []).forEach(function (c) { if (c.id === id) hit = { floor: floor, container: c }; });
      (enc.enemies || []).forEach(function (e) { if (e.id === id) hit = { floor: floor, enemy: e }; });
    });
    return hit;
  }
  function addContainer(scene, floorId, spec) {
    scene = tidy(scene);
    var floor = floorOf(scene, floorId) || scene.floors[0];
    if (!floor) return scene;
    spec = spec || {};
    var kind = spec.kind === "strongbox" ? "strongbox" : "chest";
    floor.encounters.containers.push({
      id: nid("box"),
      kind: kind,
      name: spec.name || (kind === "strongbox" ? "Strongbox" : "Chest"),
      x: num(spec.x),
      y: num(spec.y),
      items: spec.items || [],
      lockDc: spec.lockDc == null ? 15 : spec.lockDc,
      forceDc: spec.forceDc,
      unlocked: !!spec.unlocked,
      allowRetries: !!spec.allowRetries,
      improvise: !!spec.improvise
    });
    return tidy(scene);
  }
  function setContainer(scene, floorId, boxId, patch) {
    scene = tidy(scene);
    var hit = findPiece(scene, boxId);
    if (!hit || !hit.container) return scene;
    if (floorId && hit.floor.id !== floorId && hit.floor.mapId !== floorId) return scene;
    patch = patch || {};
    if (patch.kind) hit.container.kind = patch.kind === "strongbox" ? "strongbox" : "chest";
    if (patch.name != null) hit.container.name = String(patch.name);
    if (patch.x != null) hit.container.x = num(patch.x);
    if (patch.y != null) hit.container.y = num(patch.y);
    if (patch.items != null) hit.container.items = patch.items;
    if (patch.lockDc != null) hit.container.lockDc = patch.lockDc;
    if (patch.forceDc != null) hit.container.forceDc = patch.forceDc;
    if (patch.unlocked != null) hit.container.unlocked = !!patch.unlocked;
    if (patch.allowRetries != null) hit.container.allowRetries = !!patch.allowRetries;
    if (patch.improvise != null) hit.container.improvise = !!patch.improvise;
    return tidy(scene);
  }
  function removeContainer(scene, floorId, boxId) {
    scene = tidy(scene);
    var hit = findPiece(scene, boxId);
    if (!hit || !hit.container) return scene;
    if (floorId && hit.floor.id !== floorId && hit.floor.mapId !== floorId) return scene;
    hit.floor.encounters.containers = hit.floor.encounters.containers.filter(function (c) { return c.id !== boxId; });
    return tidy(scene);
  }
  function addEnemy(scene, floorId, spec) {
    scene = tidy(scene);
    var floor = floorOf(scene, floorId) || scene.floors[0];
    if (!floor) return scene;
    spec = spec || {};
    floor.encounters.enemies.push({
      id: nid("foe"),
      bestiaryId: spec.bestiaryId || "",
      name: spec.name || spec.bestiaryId || "Enemy",
      x: num(spec.x),
      y: num(spec.y),
      hidden: spec.hidden !== false,
      initGroup: spec.initGroup || "",
      xp: spec.xp || 0,
      hp: spec.hp == null ? null : spec.hp
    });
    return tidy(scene);
  }
  function setEnemy(scene, floorId, foeId, patch) {
    scene = tidy(scene);
    var hit = findPiece(scene, foeId);
    if (!hit || !hit.enemy) return scene;
    if (floorId && hit.floor.id !== floorId && hit.floor.mapId !== floorId) return scene;
    patch = patch || {};
    ["bestiaryId", "name", "initGroup"].forEach(function (k) { if (patch[k] != null) hit.enemy[k] = patch[k]; });
    if (patch.x != null) hit.enemy.x = num(patch.x);
    if (patch.y != null) hit.enemy.y = num(patch.y);
    if (patch.hidden != null) hit.enemy.hidden = !!patch.hidden;
    if (patch.xp != null) hit.enemy.xp = patch.xp;
    if (patch.hp != null) hit.enemy.hp = patch.hp;
    return tidy(scene);
  }
  function removeEnemy(scene, floorId, foeId) {
    scene = tidy(scene);
    var hit = findPiece(scene, foeId);
    if (!hit || !hit.enemy) return scene;
    if (floorId && hit.floor.id !== floorId && hit.floor.mapId !== floorId) return scene;
    hit.floor.encounters.enemies = hit.floor.encounters.enemies.filter(function (e) { return e.id !== foeId; });
    return tidy(scene);
  }
  function revealEnemies(scene, floorId, foeId) {
    scene = tidy(scene);
    (scene.floors || []).forEach(function (floor) {
      if (floorId && floor.id !== floorId && floor.mapId !== floorId) return;
      (floor.encounters.enemies || []).forEach(function (e) {
        if (!foeId || e.id === foeId) e.hidden = false;
      });
    });
    return tidy(scene);
  }
  function stairsForRoom(scene, floor) {
    return (floor.stairs || []).map(function (link) {
      var dest = (scene.floors || []).filter(function (d) {
        return d.id === link.destFloorId || d.mapId === link.destMapId || d.mapId === link.destFloorId;
      })[0];
      return {
        id: link.id,
        kind: link.kind,
        x: link.x,
        y: link.y,
        destFloorId: dest ? dest.mapId : (link.destMapId || ""),
        destMapId: dest ? dest.mapId : (link.destMapId || ""),
        landX: link.landX,
        landY: link.landY,
        twoWay: !!link.twoWay,
        pairId: link.pairId || "",
        visible: !!link.visible
      };
    });
  }
  function groupSpots(floor, groupId) {
    var group = (floor.groups || []).filter(function (g) { return g.id === groupId; })[0] || defaultGroup(floor);
    if (!group) return [];
    return (floor.spawns || []).filter(function (sp) { return sp.groupId === group.id; }).slice().sort(function (a, b) { return a.n - b.n; });
  }
  /* Player 1 takes spot 1. People past the last spot take the nearest open square. */
  function assignLandings(spots, count, grid) {
    spots = (spots || []).slice().sort(function (a, b) { return (a.n || 0) - (b.n || 0); });
    var cols = Math.max(1, (grid && grid.cols) || 30);
    var rows = Math.max(1, (grid && grid.rows) || 20);
    var used = {};
    function key(x, y) { return x + "," + y; }
    var out = [];
    var origin = spots.length ? spots[spots.length - 1] : { x: Math.floor(cols / 2), y: Math.floor(rows / 2) };
    for (var i = 0; i < count; i++) {
      if (i < spots.length) {
        out.push({ n: spots[i].n, x: spots[i].x, y: spots[i].y, overflow: false });
        used[key(spots[i].x, spots[i].y)] = 1;
      } else {
        var best = null;
        var bestD = 1e9;
        for (var y = 0; y < rows; y++) {
          for (var x = 0; x < cols; x++) {
            if (used[key(x, y)]) continue;
            var d = Math.max(Math.abs(x - origin.x), Math.abs(y - origin.y));
            if (d < bestD) { bestD = d; best = { x: x, y: y }; }
          }
        }
        if (!best) best = { x: (origin.x + i) % cols, y: origin.y };
        used[key(best.x, best.y)] = 1;
        out.push({ n: 0, x: best.x, y: best.y, overflow: true });
      }
    }
    return out;
  }
  var PACK_FORMAT = "ssdns-map-pack";
  var PACK_MAX = 2 * 1024 * 1024;
  var PACK_WARN = 400 * 1024;
  function sceneSig(scene) {
    var t = tidy(scene);
    return JSON.stringify({
      name: t.name,
      floors: (t.floors || []).map(function (f) {
        return { mapId: f.mapId, name: f.name, groups: f.groups, spawns: f.spawns, stairs: f.stairs, encounters: f.encounters };
      })
    });
  }
  function mapSig(m) {
    var grid = (m && m.grid) || {};
    return JSON.stringify({ name: m && m.name, src: (m && (m.src || m.img)) || "", cols: grid.cols || 0, rows: grid.rows || 0 });
  }
  function importedName(name) {
    var base = String(name || "Scene").replace(/\s+\(imported\)$/, "");
    return (base + " (imported)").slice(0, 80);
  }
  function freshId(prefix, used) {
    var id = nid(prefix);
    while (used[id]) id = nid(prefix);
    return id;
  }
  function kb(n) { return Math.max(1, Math.round(n / 1024)); }
  /* A pack is the same family as a map pack: picture maps, plus the scenes that
     stack those maps into floors. Encounter pieces ride on each floor. */
  function exportScenePack(scenes, lookup) {
    lookup = lookup || function () { return null; };
    var maps = [];
    var seen = {};
    var missing = [];
    var list = (scenes || []).filter(Boolean).map(function (scene) {
      return tidy(scene);
    });
    list.forEach(function (scene) {
      (scene.floors || []).forEach(function (floor) {
        if (!floor.mapId || seen[floor.mapId]) return;
        seen[floor.mapId] = 1;
        var row = null;
        try { row = lookup(floor.mapId); } catch (e) { row = null; }
        if (row && row.id) maps.push(JSON.parse(JSON.stringify(row)));
        else missing.push(floor.name || floor.mapId);
      });
    });
    var pack = {
      format: PACK_FORMAT,
      version: 2,
      exportedAt: new Date().toISOString(),
      maps: maps,
      scenes: list,
      encounters: null
    };
    var text = JSON.stringify(pack, null, 2);
    return { pack: pack, text: text, missing: missing, large: text.length > PACK_WARN, bytes: text.length };
  }
  function oneFloorScene(map) {
    var scene = addFloor(blank(map.name || "Imported map"), {
      id: map.id,
      name: map.name || map.id,
      source: map.pack ? "pack" : "library"
    });
    scene.encounters = null;
    return scene;
  }
  function importScenePack(raw, ctx) {
    ctx = ctx || {};
    var maxBytes = ctx.maxBytes || PACK_MAX;
    var warnBytes = ctx.warnBytes || PACK_WARN;
    try {
      if (raw == null || raw === "") return { ok: false, error: "That file is empty." };
      if (typeof raw === "string" && raw.length > maxBytes) return { ok: false, error: "This pack is too big (" + kb(raw.length) + " KB). Packs should point at pictures, not store them in the file." };
      var obj = raw;
      if (typeof raw === "string") obj = JSON.parse(raw);
      if (!obj || typeof obj !== "object" || Array.isArray(obj)) return { ok: false, error: "That isn't an SSDNS map pack." };
      if (obj.format === KEY) return { ok: false, error: "That's a scene library file. Use Import library for that one." };
      var mapRows = Array.isArray(obj.maps) ? obj.maps : [];
      var sceneRows = Array.isArray(obj.scenes) ? obj.scenes : [];
      var pictureRows = sceneRows.filter(function (row) { return row && (row.img || row.src) && !Array.isArray(row.floors); });
      var realScenes = sceneRows.filter(function (row) { return row && Array.isArray(row.floors); });
      if (!realScenes.length && !mapRows.length && pictureRows.length) mapRows = pictureRows.concat(mapRows);
      var knownFormat = obj.format === PACK_FORMAT || mapRows.length || realScenes.length || pictureRows.length;
      if (!knownFormat) return { ok: false, error: "That isn't an SSDNS map pack." };
      if (!realScenes.length && !mapRows.length) return { ok: false, error: "This pack has no scenes or maps." };
      if (realScenes.length > 200 || mapRows.length > 400) return { ok: false, error: "This pack has too many pieces to import at once." };
      var lib = ctx.store ? readLibrary(ctx.store) : { scenes: clone(ctx.scenes || {}) || {} };
      var scenes = lib.scenes || {};
      var used = {};
      Object.keys(scenes).forEach(function (id) { used[id] = 1; });
      var known = ctx.knownMaps || {};
      var haveMaps = ctx.maps || {};
      var packMaps = {};
      mapRows.forEach(function (m) { if (m && m.id) packMaps[m.id] = m; });
      var warnings = [];
      var mapsOut = [];
      var idRewrite = {};
      if (!ctx.skipMapWrite) {
        mapRows.forEach(function (m) {
          if (!m || !m.id) return;
          if (m.pack || known[m.id]) return;
          var src = String(m.src || "");
          if (!src || /^(data:|blob:)/.test(src)) {
            warnings.push("Skipped the picture for " + (m.name || m.id) + ". Packs link to pictures, they don't store them.");
            return;
          }
          var prev = haveMaps[m.id];
          if (prev && mapSig(prev) === mapSig(m)) return;
          var entry = {
            id: m.id,
            name: String(m.name || m.id).slice(0, 80),
            src: src,
            thumb: m.thumb || src,
            grid: m.grid || { cols: 30, rows: 20, px: 70 },
            notes: m.notes || "",
            walls: Array.isArray(m.walls) ? JSON.parse(JSON.stringify(m.walls)) : []
          };
          if (prev) {
            entry.id = freshId("my", haveMaps);
            entry.name = importedName(entry.name);
            idRewrite[m.id] = entry.id;
          }
          haveMaps[entry.id] = entry;
          mapsOut.push(entry);
        });
      }
      var added = 0;
      var copied = 0;
      var kept = 0;
      function remember(scene) {
        scene = tidy(scene);
        if (Object.keys(idRewrite).length) {
          scene.floors.forEach(function (floor) {
            if (idRewrite[floor.mapId]) floor.mapId = idRewrite[floor.mapId];
          });
          scene = tidy(scene);
        }
        var sig = sceneSig(scene);
        var prev = scenes[scene.id];
        if (prev && sceneSig(prev) === sig) { kept += 1; return; }
        if (prev) {
          scene.id = freshId("scene", used);
          scene.name = importedName(scene.name);
          copied += 1;
        } else added += 1;
        used[scene.id] = 1;
        scenes[scene.id] = scene;
        (scene.floors || []).forEach(function (floor) {
          if (known[floor.mapId] || haveMaps[floor.mapId] || packMaps[floor.mapId] || (ctx.savedMaps || []).some(function (m) { return m && m.id === floor.mapId; })) return;
          warnings.push("Missing map \"" + (floor.name || floor.mapId) + "\".");
        });
      }
      realScenes.forEach(remember);
      if (!realScenes.length) {
        var seeds = (ctx.savedMaps && ctx.savedMaps.length) ? ctx.savedMaps : mapRows.filter(function (m) { return m && m.id && !m.pack; });
        seeds.forEach(function (m) {
          var mapId = idRewrite[m.id] || m.id;
          var named = haveMaps[mapId] || m;
          remember(oneFloorScene({ id: mapId, name: named.name || mapId, pack: !!(m.pack || known[mapId]) }));
        });
      }
      if (ctx.store) writeLibrary(ctx.store, { scenes: scenes });
      var large = typeof raw === "string" && raw.length > warnBytes;
      var message = "Imported " + added + (added === 1 ? " scene." : " scenes.");
      if (copied) message += " " + copied + (copied === 1 ? " scene was already here with different contents, so the new copy is marked (imported)." : " scenes were already here with different contents, so the new copies are marked (imported).");
      if (kept && !added && !copied) message = "Already in the library. Nothing was replaced.";
      else if (kept) message += " " + kept + " already matched and stayed as they are.";
      if (mapsOut.length) message += " Added " + mapsOut.length + (mapsOut.length === 1 ? " map." : " maps.");
      if (large) message += " This pack is large (" + kb(raw.length) + " KB).";
      if (warnings.length) message += " " + warnings[0];
      return { ok: true, scenes: scenes, maps: mapsOut, added: added, copied: copied, kept: kept, warnings: warnings, message: message, large: large };
    } catch (e) {
      return { ok: false, error: "That file isn't valid JSON." };
    }
  }
  function exportLibrary(store) {
    var lib = readLibrary(store);
    return JSON.stringify({ format: KEY, scenes: lib.scenes }, null, 2);
  }
  function importLibrary(store, raw) {
    var incoming = typeof raw === "string" ? JSON.parse(raw) : (raw || {});
    var scenes = incoming.scenes && typeof incoming.scenes === "object" ? incoming.scenes : {};
    var lib = readLibrary(store);
    var added = 0;
    var updated = 0;
    Object.keys(scenes).forEach(function (id) {
      var scene = tidy(Object.assign({ id: id }, scenes[id] || {}));
      if (!scene.id) return;
      if (lib.scenes[scene.id]) updated += 1;
      else added += 1;
      lib.scenes[scene.id] = scene;
    });
    writeLibrary(store, lib);
    return { added: added, updated: updated, total: Object.keys(lib.scenes).length };
  }
  function saveScene(store, scene) {
    var lib = readLibrary(store);
    scene = tidy(scene);
    lib.scenes[scene.id] = scene;
    writeLibrary(store, lib);
    return scene;
  }
  function renameScene(store, id, name) {
    var lib = readLibrary(store);
    if (!lib.scenes[id]) return null;
    lib.scenes[id].name = String(name || lib.scenes[id].name).slice(0, 80);
    writeLibrary(store, lib);
    return tidy(lib.scenes[id]);
  }
  function duplicateScene(store, id) {
    var lib = readLibrary(store);
    if (!lib.scenes[id]) return null;
    var copy = tidy(lib.scenes[id]);
    copy.id = nid("scene");
    copy.name = copy.name + " copy";
    lib.scenes[copy.id] = copy;
    writeLibrary(store, lib);
    return copy;
  }
  function deleteScene(store, id, confirm) {
    if (confirm !== true) return { ok: false, needConfirm: true };
    var lib = readLibrary(store);
    var existed = !!lib.scenes[id];
    delete lib.scenes[id];
    writeLibrary(store, lib);
    return { ok: existed, id: id };
  }
  /* Merge a saved scene beside what the room already has. Tokens, pack ids, and
     existing scene records are copied through unchanged. A floor already claimed
     by another place stays there. Spawns are added and do not replace a prep. */
  function loadIntoRoom(scene, room) {
    room = room || {};
    var places = clone(room.places || {}) || {};
    var tokens = clone(room.tokens || []) || [];
    var scenes = clone(room.scenes || {}) || {};
    var preps = clone(room.preps || {}) || {};
    var packIds = (room.packIds || []).slice();
    scene = tidy(scene);
    var claimed = {};
    Object.keys(places).forEach(function (pid) {
      ((places[pid] && places[pid].floors) || []).forEach(function (f) {
        if (f && f.mapId) claimed[f.mapId] = pid;
      });
    });
    var floors = [];
    var kept = [];
    scene.floors.forEach(function (f) {
      var stairs = stairsForRoom(scene, f);
      if (claimed[f.mapId] && claimed[f.mapId] !== scene.id) {
        kept.push(f.mapId);
        var owner = places[claimed[f.mapId]];
        var row = owner && (owner.floors || []).filter(function (fl) { return fl && fl.mapId === f.mapId; })[0];
        if (row && stairs.length) row.stairs = stairs;
      } else floors.push({
        id: f.mapId,
        mapId: f.mapId,
        name: f.name,
        order: floors.length,
        stairs: stairs
      });
    });
    if (floors.length) {
      var start = scene.floors.filter(function (f) { return f.id === scene.startFloorId; })[0];
      places[scene.id] = {
        id: scene.id,
        name: scene.name,
        startFloorId: start && floors.some(function (f) { return f.mapId === start.mapId; }) ? start.mapId : floors[0].mapId,
        floors: floors,
        stairs: scene.stairs || [],
        encounters: scene.encounters == null ? null : clone(scene.encounters)
      };
    }
    var sceneSpawns = {};
    scene.floors.forEach(function (f) {
      var groups = (f.groups || []).map(function (g) {
        return {
          id: g.id, name: g.name, color: g.color, isDefault: !!g.isDefault,
          spots: (f.spawns || []).filter(function (sp) { return sp.groupId === g.id; }).map(function (sp) {
            return { id: sp.id, n: sp.n, x: sp.x, y: sp.y };
          })
        };
      });
      sceneSpawns[f.mapId] = { groups: groups };
      (f.spawns || []).forEach(function (sp) {
        if (!preps[f.mapId]) preps[f.mapId] = {};
        var key = "spawn_" + sp.id;
        var group = (f.groups || []).filter(function (g) { return g.id === sp.groupId; })[0];
        if (!preps[f.mapId][key]) preps[f.mapId][key] = { x: sp.x, y: sp.y, n: sp.n, name: (group && group.name) || "Party", color: group && group.color, prep: true };
      });
    });
    return {
      places: places,
      tokens: tokens,
      scenes: scenes,
      preps: preps,
      packIds: packIds,
      addedPlace: floors.length ? scene.id : "",
      keptFloors: kept,
      tokensSame: JSON.stringify(tokens) === JSON.stringify(room.tokens || []),
      scenesSame: JSON.stringify(scenes) === JSON.stringify(room.scenes || {}),
      packSame: packIds.join(",") === (room.packIds || []).join(","),
      sceneSpawns: sceneSpawns,
      encounterPieces: scene.floors.map(function (f) {
        var enc = f.encounters || { containers: [], enemies: [] };
        return { mapId: f.mapId, floorName: f.name, containers: enc.containers, enemies: enc.enemies };
      }).filter(function (f) { return f.containers.length || f.enemies.length; })
    };
  }

  var live = null;
  function el(tag, attrs, text) {
    var node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === "class") node.className = attrs[k];
      else node.setAttribute(k, attrs[k]);
    });
    if (text != null) node.textContent = text;
    return node;
  }
  function field(label, input) {
    var wrap = el("label", { class: "ssm-scene-field" });
    wrap.appendChild(document.createTextNode(label));
    wrap.appendChild(input);
    return wrap;
  }
  function checkLabel(act, floorId, id, key, on, text) {
    var box = el("input", { type: "checkbox", "data-act": act, "data-floor": floorId, "data-id": id });
    if (on) box.checked = true;
    var lab = el("label");
    lab.appendChild(box);
    lab.appendChild(document.createTextNode(text));
    return lab;
  }
  function encounterBlock(panel, draft, floor) {
    var enc = floor.encounters || { containers: [], enemies: [] };
    var block = el("div", { class: "ssm-scene-encounter", "data-act": "encounterFloor" });
    block.appendChild(el("div", { class: "ssm-scene-k" }, "Encounter"));
    var tools = el("div", { class: "ssm-scene-tools" });
    var chest = el("button", { type: "button", "data-act": "boxPlace", "data-kind": "chest", "data-floor": floor.id }, "Place chest");
    var strong = el("button", { type: "button", "data-act": "boxPlace", "data-kind": "strongbox", "data-floor": floor.id }, "Place strongbox");
    if (panel._encArm && panel._encArm.floorId === floor.id && panel._encArm.kind === "chest") chest.className = "is-on";
    if (panel._encArm && panel._encArm.floorId === floor.id && panel._encArm.kind === "strongbox") strong.className = "is-on";
    tools.appendChild(chest);
    tools.appendChild(strong);
    var beasts = [];
    try { beasts = (panel._opts && panel._opts.bestiary && panel._opts.bestiary()) || []; } catch (e) { beasts = []; }
    var pick = el("select", { "data-act": "foePick", "data-floor": floor.id, "aria-label": "Creature" });
    if (!beasts.length) pick.appendChild(el("option", { value: "" }, "Enemy"));
    beasts.forEach(function (b) { pick.appendChild(el("option", { value: b.id }, b.name)); });
    tools.appendChild(pick);
    var foe = el("button", { type: "button", "data-act": "foePlace", "data-floor": floor.id }, "Place enemy");
    if (panel._encArm && panel._encArm.floorId === floor.id && panel._encArm.kind === "enemy") foe.className = "is-on";
    tools.appendChild(foe);
    tools.appendChild(el("button", { type: "button", "data-act": "foeRevealAll", "data-floor": floor.id }, "Reveal all"));
    block.appendChild(tools);
    enc.containers.forEach(function (box) {
      var line = el("div", { class: "ssm-scene-piece", "data-box": box.id });
      var name = el("input", { type: "text", "data-act": "boxName", "data-floor": floor.id, "data-id": box.id, "aria-label": "Container name" });
      name.value = box.name;
      line.appendChild(name);
      line.appendChild(el("button", { type: "button", "data-act": "boxRemove", "data-floor": floor.id, "data-id": box.id, "aria-label": "Remove container" }, "×"));
      var items = el("textarea", { "data-act": "boxItems", "data-floor": floor.id, "data-id": box.id, "aria-label": "Items, one per line", rows: "2" });
      items.value = (box.items || []).map(function (it) { return it.qty > 1 ? it.name + " x" + it.qty : it.name; }).join("\n");
      line.appendChild(items);
      var nums = el("div", { class: "ssm-scene-linkbar" });
      nums.appendChild(document.createTextNode("Lock DC"));
      var lock = el("input", { type: "number", min: "0", "data-act": "boxLock", "data-floor": floor.id, "data-id": box.id, "aria-label": "Lock DC" });
      lock.value = String(box.lockDc);
      nums.appendChild(lock);
      nums.appendChild(document.createTextNode("Force DC"));
      var force = el("input", { type: "number", min: "0", "data-act": "boxForce", "data-floor": floor.id, "data-id": box.id, "aria-label": "Force DC" });
      force.value = String(box.forceDc);
      nums.appendChild(force);
      line.appendChild(nums);
      var flags = el("div", { class: "ssm-scene-linkbar" });
      flags.appendChild(checkLabel("boxUnlocked", floor.id, box.id, "unlocked", box.unlocked, "Unlocked"));
      flags.appendChild(checkLabel("boxRetries", floor.id, box.id, "retries", box.allowRetries, "Retries"));
      flags.appendChild(checkLabel("boxImprovise", floor.id, box.id, "improvise", box.improvise, "Improvise"));
      line.appendChild(flags);
      line.appendChild(el("p", { class: "ssm-scene-stairs" }, (box.kind === "strongbox" ? "Strongbox" : "Chest") + " at " + box.x + "," + box.y));
      block.appendChild(line);
    });
    enc.enemies.forEach(function (foe) {
      var line = el("div", { class: "ssm-scene-piece", "data-foe": foe.id });
      var name = el("input", { type: "text", "data-act": "foeName", "data-floor": floor.id, "data-id": foe.id, "aria-label": "Enemy name" });
      name.value = foe.name;
      line.appendChild(name);
      line.appendChild(el("button", { type: "button", "data-act": "foeRemove", "data-floor": floor.id, "data-id": foe.id, "aria-label": "Remove enemy" }, "×"));
      var bar = el("div", { class: "ssm-scene-linkbar" });
      bar.appendChild(checkLabel("foeHidden", floor.id, foe.id, "hidden", foe.hidden, "Starts hidden"));
      var group = el("input", { type: "text", "data-act": "foeGroup", "data-floor": floor.id, "data-id": foe.id, "aria-label": "Initiative group", placeholder: "Initiative group" });
      group.value = foe.initGroup || "";
      bar.appendChild(group);
      var xp = el("input", { type: "number", min: "0", "data-act": "foeXp", "data-floor": floor.id, "data-id": foe.id, "aria-label": "XP" });
      xp.value = String(foe.xp || 0);
      bar.appendChild(xp);
      bar.appendChild(el("button", { type: "button", "data-act": "foeReveal", "data-floor": floor.id, "data-id": foe.id }, foe.hidden ? "Reveal" : "Shown"));
      line.appendChild(bar);
      line.appendChild(el("p", { class: "ssm-scene-stairs" }, (foe.bestiaryId || "Custom") + " at " + foe.x + "," + foe.y));
      block.appendChild(line);
    });
    return block;
  }
  function paint(panel, draft, lib, maps) {
    var focus = document.activeElement;
    var focusKey = focus && panel.contains(focus) ? (focus.getAttribute("data-act") || "") + ":" + (focus.getAttribute("data-floor") || "") + ":" + (focus.getAttribute("data-spawn") || "") + ":" + (focus.getAttribute("data-link") || "") : "";
    var focusVal = focus && panel.contains(focus) && "value" in focus ? focus.value : null;
    panel.innerHTML = "";
    var head = el("div", { class: "ssm-scene-head" });
    head.appendChild(el("b", null, "Scene builder"));
    head.appendChild(el("button", { type: "button", "data-act": "sceneClose", "aria-label": "Close" }, "×"));
    panel.appendChild(head);
    var name = el("input", { type: "text", "data-act": "sceneName", value: draft.name, maxlength: "80", "aria-label": "Scene name" });
    name.value = draft.name;
    panel.appendChild(field("Scene name", name));
    var tools = el("div", { class: "ssm-scene-tools" });
    [["sceneNew", "New"], ["sceneSave", "Save"], ["sceneDuplicate", "Duplicate"]].forEach(function (pair) {
      tools.appendChild(el("button", { type: "button", "data-act": pair[0] }, pair[1]));
    });
    panel.appendChild(tools);
    panel.appendChild(el("p", { class: "ssm-scene-note" }, "Floors use maps you already have. Removing one here does not delete the map."));
    var addRow = el("div", { class: "ssm-scene-add" });
    var pick = el("select", { "data-act": "floorPick", "aria-label": "Map to add" });
    pick.appendChild(el("option", { value: "" }, "Add a floor…"));
    (maps || []).forEach(function (m) {
      if (!m || !m.id) return;
      var opt = el("option", { value: m.id }, (m.group ? m.group + " — " : "") + (m.name || m.id));
      opt.setAttribute("data-source", m.source || "pack");
      pick.appendChild(opt);
    });
    addRow.appendChild(pick);
    addRow.appendChild(el("button", { type: "button", "data-act": "floorAdd" }, "Add floor"));
    panel.appendChild(addRow);
    var list = el("ol", { class: "ssm-scene-floors", "data-act": "floorList" });
    draft.floors.forEach(function (floor, index) {
      var row = el("li", { class: "ssm-scene-card", "data-floor": floor.id, draggable: "true" });
      var title = el("div", { class: "ssm-scene-title" });
      title.appendChild(el("span", { class: "ssm-scene-handle", "data-act": "floorDrag", title: "Drag to reorder" }, "⋮⋮"));
      var fname = el("input", { type: "text", "data-act": "floorName", "data-floor": floor.id, "aria-label": "Floor name", maxlength: "80" });
      fname.value = floor.name;
      title.appendChild(fname);
      row.appendChild(title);
      var actions = el("div", { class: "ssm-scene-actions" });
      if (draft.startFloorId === floor.id) actions.appendChild(el("span", { class: "ssm-scene-start" }, "Start"));
      else actions.appendChild(el("button", { type: "button", "data-act": "floorStart", "data-floor": floor.id }, "Set start"));
      actions.appendChild(el("button", { type: "button", "data-act": "floorUp", "data-floor": floor.id, "aria-label": "Move floor up" }, "Up"));
      actions.appendChild(el("button", { type: "button", "data-act": "floorDown", "data-floor": floor.id, "aria-label": "Move floor down" }, "Down"));
      actions.appendChild(el("button", { type: "button", "data-act": "floorRemove", "data-floor": floor.id }, "Remove"));
      row.appendChild(actions);
      var spawns = el("div", { class: "ssm-scene-spawns" });
      spawns.appendChild(el("div", { class: "ssm-scene-k" }, "Spawn groups"));
      (floor.groups || []).forEach(function (group) {
        var block = el("div", { class: "ssm-scene-group", "data-group": group.id });
        var head = el("div", { class: "ssm-scene-grouphead" });
        head.appendChild(el("i", { class: "ssm-scene-swatch", style: "background:" + group.color }));
        var gname = el("input", { type: "text", "data-act": "groupName", "data-floor": floor.id, "data-group": group.id, "aria-label": "Spawn group name" });
        gname.value = group.name;
        head.appendChild(gname);
        if (group.isDefault) head.appendChild(el("span", { class: "ssm-scene-start" }, "Default"));
        else head.appendChild(el("button", { type: "button", "data-act": "groupDefault", "data-floor": floor.id, "data-group": group.id }, "Make default"));
        var place = el("button", { type: "button", "data-act": "spawnPlace", "data-floor": floor.id, "data-group": group.id }, "Place spawn");
        if (panel._arm && panel._arm.floorId === floor.id && panel._arm.groupId === group.id) place.className = "is-on";
        head.appendChild(place);
        block.appendChild(head);
        (floor.spawns || []).filter(function (sp) { return sp.groupId === group.id; }).forEach(function (sp) {
          var line = el("div", { class: "ssm-scene-spawn" });
          line.appendChild(el("b", null, String(sp.n)));
          line.appendChild(el("span", null, group.name));
          var hx = el("input", { type: "hidden", "data-act": "spawnX", "data-floor": floor.id, "data-spawn": sp.id });
          hx.value = String(sp.x);
          var hy = el("input", { type: "hidden", "data-act": "spawnY", "data-floor": floor.id, "data-spawn": sp.id });
          hy.value = String(sp.y);
          line.appendChild(hx);
          line.appendChild(hy);
          line.appendChild(el("button", { type: "button", "data-act": "spawnRemove", "data-floor": floor.id, "data-spawn": sp.id, "aria-label": "Remove spawn" }, "×"));
          block.appendChild(line);
        });
        spawns.appendChild(block);
      });
      spawns.appendChild(el("button", { type: "button", "data-act": "groupAdd", "data-floor": floor.id }, "New group"));
      row.appendChild(spawns);
      var links = el("div", { class: "ssm-scene-links" });
      links.appendChild(el("div", { class: "ssm-scene-k" }, "Links"));
      var placeLink = el("button", { type: "button", "data-act": "linkPlace", "data-floor": floor.id }, "Place link");
      if (panel._linkArm && panel._linkArm.mode === "marker" && panel._linkArm.floorId === floor.id) placeLink.className = "is-on";
      links.appendChild(placeLink);
      (floor.stairs || []).forEach(function (link) {
        var line = el("div", { class: "ssm-scene-link", "data-link": link.id });
        var kind = el("select", { "data-act": "linkKind", "data-floor": floor.id, "data-link": link.id, "aria-label": "Link kind" });
        [["up", "Stairs up"], ["down", "Stairs down"], ["ladder", "Ladder"], ["door", "Door/Passage"]].forEach(function (pair) {
          kind.appendChild(el("option", { value: pair[0] }, pair[1]));
        });
        kind.value = link.kind || "up";
        var destPick = el("select", { "data-act": "linkDest", "data-floor": floor.id, "data-link": link.id, "aria-label": "Destination floor" });
        destPick.appendChild(el("option", { value: "" }, "Destination floor…"));
        draft.floors.forEach(function (other) {
          if (!other || other.id === floor.id) return;
          destPick.appendChild(el("option", { value: other.id }, other.name || other.mapId));
        });
        destPick.value = link.destFloorId || "";
        var landLabel = link.landX == null ? "Place landing" : ("Landing " + link.landX + "," + link.landY);
        var land = el("button", { type: "button", "data-act": "linkLand", "data-floor": floor.id, "data-link": link.id }, landLabel);
        if (!link.destFloorId) land.disabled = true;
        if (panel._linkArm && panel._linkArm.mode === "landing" && panel._linkArm.linkId === link.id) land.className = "is-on";
        var two = el("input", { type: "checkbox", "data-act": "linkTwoWay", "data-floor": floor.id, "data-link": link.id });
        if (link.twoWay) two.checked = true;
        var twoLab = el("label");
        twoLab.appendChild(two);
        twoLab.appendChild(document.createTextNode("Two-way"));
        var vis = el("input", { type: "checkbox", "data-act": "linkVisible", "data-floor": floor.id, "data-link": link.id });
        if (link.visible) vis.checked = true;
        var visLab = el("label");
        visLab.appendChild(vis);
        visLab.appendChild(document.createTextNode("Players see this"));
        var bar = el("div", { class: "ssm-scene-linkbar" });
        bar.appendChild(land);
        bar.appendChild(twoLab);
        bar.appendChild(visLab);
        bar.appendChild(el("button", { type: "button", "data-act": "linkTake", "data-floor": floor.id, "data-link": link.id }, "Take link"));
        line.appendChild(kind);
        line.appendChild(el("button", { type: "button", "data-act": "linkRemove", "data-floor": floor.id, "data-link": link.id, "aria-label": "Remove link" }, "×"));
        line.appendChild(destPick);
        line.appendChild(bar);
        links.appendChild(line);
      });
      links.appendChild(el("p", { class: "ssm-scene-stairs" }, "Players stepping onto a link comes in a later update. Take link moves the tokens you selected."));
      row.appendChild(links);
      row.appendChild(encounterBlock(panel, draft, floor));
      if (index === draft.floors.length - 1) row.setAttribute("data-last", "1");
      list.appendChild(row);
    });
    if (!draft.floors.length) list.appendChild(el("li", { class: "ssm-scene-empty" }, "No floors yet."));
    panel.appendChild(list);
    if (draft.encounters) {
      var sum = draft.encounters;
      var lootLine = (sum.loot || []).map(function (row) { return row.name + (row.items && row.items.length ? " (" + row.items.join(", ") + ")" : ""); }).join("; ");
      panel.appendChild(el("p", { class: "ssm-scene-stairs", "data-act": "encounterSummary" }, "Encounter: " + sum.xp + " XP · " + sum.enemies + " enemies (" + sum.hidden + " start hidden) · " + sum.containers + " containers" + (lootLine ? " · " + lootLine : "")));
    }
    var port = el("div", { class: "ssm-scene-tools", "data-act": "scenePackTools" });
    port.appendChild(el("button", { type: "button", "data-act": "sceneExport" }, "Export library"));
    port.appendChild(el("button", { type: "button", "data-act": "sceneImport" }, "Import library"));
    port.appendChild(el("button", { type: "button", "data-act": "sceneExportPack" }, "Export pack"));
    port.appendChild(el("button", { type: "button", "data-act": "sceneImportPack" }, "Import pack"));
    var file = el("input", { type: "file", accept: "application/json,.json", "data-act": "sceneImportFile", hidden: "hidden" });
    var packFile = el("input", { type: "file", accept: "application/json,.json", "data-act": "scenePackFile", hidden: "hidden" });
    port.appendChild(file);
    port.appendChild(packFile);
    panel.appendChild(port);
    if (panel._notice && panel._notice.text) {
      panel.appendChild(el("p", { class: "ssm-scene-notice" + (panel._notice.err ? " is-err" : ""), "data-act": "scenePackNotice", role: "status" }, panel._notice.text));
    }
    panel.appendChild(el("h3", null, "Scene library"));
    var saved = Object.keys(lib.scenes || {}).map(function (id) { return lib.scenes[id]; });
    saved.sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
    var libList = el("ul", { class: "ssm-scene-library", "data-act": "sceneLibrary" });
    if (!saved.length) libList.appendChild(el("li", { class: "ssm-scene-empty" }, "Nothing saved yet."));
    saved.forEach(function (scene) {
      var item = el("li", null);
      var tick = el("input", { type: "checkbox", "data-act": "scenePackPick", "data-id": scene.id, "aria-label": "Include " + scene.name + " in a pack" });
      if (panel._packPick && panel._packPick[scene.id]) tick.checked = true;
      item.appendChild(tick);
      item.appendChild(el("b", null, scene.name));
      item.appendChild(document.createTextNode(" · " + (scene.floors || []).length + " floors"));
      var acts = el("div", { class: "ssm-scene-tools" });
      acts.appendChild(el("button", { type: "button", "data-act": "sceneExportOne", "data-id": scene.id }, "Export scene"));
      acts.appendChild(el("button", { type: "button", "data-act": "sceneOpen", "data-id": scene.id }, "Edit"));
      acts.appendChild(el("button", { type: "button", "data-act": "sceneLoad", "data-id": scene.id }, "Load into room"));
      acts.appendChild(el("button", { type: "button", "data-act": "sceneDelete", "data-id": scene.id }, "Delete"));
      item.appendChild(acts);
      if (panel._confirmDelete === scene.id) {
        var ask = el("p", { class: "ssm-scene-confirm" });
        ask.appendChild(document.createTextNode("Delete “" + scene.name + "” from the library? The maps stay."));
        ask.appendChild(el("button", { type: "button", "data-act": "sceneDeleteYes", "data-id": scene.id }, "Delete"));
        ask.appendChild(el("button", { type: "button", "data-act": "sceneDeleteNo" }, "Cancel"));
        item.appendChild(ask);
      }
      libList.appendChild(item);
    });
    panel.appendChild(libList);
    if (focusKey) {
      var focusParts = focusKey.split(":");
      var again = panel.querySelector('[data-act="' + focusParts[0] + '"]' + (focusParts[1] ? '[data-floor="' + focusParts[1] + '"]' : "") + (focusParts[2] ? '[data-spawn="' + focusParts[2] + '"]' : "") + (focusParts[3] ? '[data-link="' + focusParts[3] + '"]' : ""));
      if (again && again.focus) {
        try { again.focus(); if (focusVal != null && "value" in again) again.value = focusVal; } catch (e) {}
      }
    }
  }

  function open(parent, opts) {
    if (!parent || (opts && opts.role === "player")) return null;
    close();
    opts = opts || {};
    var store = storeOf(opts.store);
    var draft = tidy(opts.scene || blank(opts.name));
    var panel = el("section", { class: "ssm-scene-builder ssm-map-ui", "data-act": "sceneBuilder", role: "dialog", "aria-label": "Scene builder" });
    panel._opts = opts || {};
    parent.appendChild(panel);
    function maps() {
      var list = [];
      try { list = (opts.maps && opts.maps()) || []; } catch (e) { list = []; }
      return list;
    }
    function draw() { paint(panel, draft, readLibrary(store), maps()); }
    function stopKey(ev) {
      var tag = ev.target && ev.target.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") ev.stopPropagation();
      if (ev.key === "Escape") {
        ev.preventDefault();
        ev.stopPropagation();
        if (panel._arm || panel._linkArm || panel._encArm) { panel._arm = null; panel._linkArm = null; panel._encArm = null; if (opts.onDisarm) opts.onDisarm(); draw(); return; }
        if (panel._confirmDelete) { panel._confirmDelete = ""; draw(); return; }
        close();
      }
    }
    panel.addEventListener("keydown", stopKey);
    panel.addEventListener("click", function (ev) {
      var btn = ev.target && ev.target.closest && ev.target.closest("[data-act]");
      if (!btn || !panel.contains(btn)) return;
      var tag = btn.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      var act = btn.getAttribute("data-act");
      var floorId = btn.getAttribute("data-floor");
      var sceneId = btn.getAttribute("data-id");
      if (act === "sceneClose") close();
      else if (act === "sceneNew") { draft = blank("New scene"); panel._confirmDelete = ""; panel._arm = null; panel._linkArm = null; panel._encArm = null; }
      else if (act === "sceneSave") { draft = saveScene(store, draft); }
      else if (act === "sceneDuplicate") {
        draft = saveScene(store, draft);
        draft = duplicateScene(store, draft.id) || draft;
      }
      else if (act === "floorAdd") {
        var sel = panel.querySelector("[data-act='floorPick']");
        var id = sel && sel.value;
        var chosen = maps().filter(function (m) { return m && m.id === id; })[0];
        if (chosen) draft = addFloor(draft, chosen);
      }
      else if (act === "floorUp") draft = moveFloor(draft, floorId, -1);
      else if (act === "floorDown") draft = moveFloor(draft, floorId, 1);
      else if (act === "floorRemove") draft = removeFloor(draft, floorId);
      else if (act === "floorStart") draft = setStart(draft, floorId);
      else if (act === "groupAdd") draft = addGroup(draft, floorId, "Group " + ((floorOf(draft, floorId).groups || []).length + 1));
      else if (act === "groupDefault") draft = setDefaultGroup(draft, floorId, btn.getAttribute("data-group"));
      else if (act === "spawnPlace") {
        var gid = btn.getAttribute("data-group");
        panel._linkArm = null;
        panel._arm = { floorId: floorId, groupId: gid };
        if (opts.onArm) opts.onArm({ kind: "spawn", floorId: floorId, groupId: gid, mapId: (floorOf(draft, floorId) || {}).mapId, groupName: ((floorOf(draft, floorId).groups || []).filter(function (g) { return g.id === gid; })[0] || {}).name });
      }
      else if (act === "spawnRemove") draft = removeSpawn(draft, floorId, btn.getAttribute("data-spawn"));
      else if (act === "linkPlace") {
        panel._arm = null;
        panel._linkArm = { mode: "marker", floorId: floorId };
        var armedFloor = floorOf(draft, floorId) || {};
        if (opts.onArm) opts.onArm({ kind: "link", mode: "marker", floorId: floorId, mapId: armedFloor.mapId });
      }
      else if (act === "linkLand") {
        var landLink = findLink(draft, btn.getAttribute("data-link"));
        if (!landLink || !landLink.link.destFloorId) return;
        var destFloor = floorOf(draft, landLink.link.destFloorId);
        panel._arm = null;
        panel._linkArm = { mode: "landing", floorId: landLink.floor.id, linkId: landLink.link.id, mapId: destFloor && destFloor.mapId };
        if (opts.onArm) opts.onArm({ kind: "link", mode: "landing", floorId: landLink.floor.id, linkId: landLink.link.id, mapId: destFloor && destFloor.mapId });
      }
      else if (act === "linkRemove") draft = removeLink(draft, floorId, btn.getAttribute("data-link"));
      else if (act === "linkTake") {
        var takeHit = findLink(draft, btn.getAttribute("data-link"));
        if (takeHit && opts.onTake) opts.onTake(takeHit.link, takeHit.floor);
      }
      else if (act === "boxPlace" || act === "foePlace") {
        panel._arm = null;
        panel._linkArm = null;
        var armed = floorOf(draft, floorId) || {};
        var kind = act === "foePlace" ? "enemy" : (btn.getAttribute("data-kind") || "chest");
        var spec = { kind: kind, mode: "marker", floorId: floorId, mapId: armed.mapId, name: kind === "strongbox" ? "Strongbox" : "Chest" };
        if (kind === "enemy") {
          var pick = panel.querySelector("[data-act='foePick'][data-floor='" + floorId + "']");
          var beasts = [];
          try { beasts = (opts.bestiary && opts.bestiary()) || []; } catch (e2) { beasts = []; }
          var beast = beasts.filter(function (b) { return pick && b.id === pick.value; })[0];
          spec.name = beast ? beast.name : ((pick && pick.selectedOptions && pick.selectedOptions[0] && pick.selectedOptions[0].text) || "Enemy");
          spec.bestiaryId = beast ? beast.id : (pick && pick.value) || "";
          spec.xp = beast ? (beast.xp || 0) : 0;
          spec.hp = beast && beast.hp != null ? beast.hp : null;
        }
        panel._encArm = spec;
        if (opts.onArm) opts.onArm(spec);
      }
      else if (act === "boxRemove") draft = removeContainer(draft, floorId, btn.getAttribute("data-id"));
      else if (act === "foeRemove") draft = removeEnemy(draft, floorId, btn.getAttribute("data-id"));
      else if (act === "foeReveal") {
        draft = revealEnemies(draft, floorId, btn.getAttribute("data-id"));
        if (opts.onReveal) opts.onReveal(btn.getAttribute("data-id"), (floorOf(draft, floorId) || {}).mapId);
      }
      else if (act === "foeRevealAll") {
        draft = revealEnemies(draft, floorId);
        if (opts.onRevealAll) opts.onRevealAll((floorOf(draft, floorId) || {}).mapId);
      }
      else if (act === "sceneExport") {
        if (opts.onExport) opts.onExport(exportLibrary(store));
      }
      else if (act === "sceneExportOne" || act === "sceneExportPack") {
        var chosen = [];
        if (act === "sceneExportOne") {
          var one = readLibrary(store).scenes[sceneId];
          if (one) chosen.push(one);
        } else {
          var picks = panel._packPick || {};
          Object.keys(readLibrary(store).scenes).forEach(function (id) {
            if (picks[id]) chosen.push(readLibrary(store).scenes[id]);
          });
        }
        if (!chosen.length) {
          panel._notice = { err: true, text: act === "sceneExportOne" ? "That scene isn't in the library yet. Save it first." : "Tick the scenes to put in the pack." };
        } else {
          var packed = exportScenePack(chosen, opts.mapRow);
          var note = chosen.length === 1 ? "Exported " + chosen[0].name + "." : "Exported " + chosen.length + " scenes.";
          if (packed.missing.length) note += " Missing map \"" + packed.missing[0] + "\".";
          if (packed.large) note += " This pack is large (" + kb(packed.bytes) + " KB).";
          panel._notice = { err: !!packed.missing.length, text: note };
          if (opts.onExport) opts.onExport(packed.text, chosen.length === 1 ? "ssdns-scene.json" : "ssdns-scene-pack.json");
        }
      }
      else if (act === "sceneImportPack") {
        var packPicker = panel.querySelector("[data-act='scenePackFile']");
        if (packPicker) packPicker.click();
        return;
      }
      else if (act === "sceneImport") {
        var picker = panel.querySelector("[data-act='sceneImportFile']");
        if (picker) picker.click();
        return;
      }
      else if (act === "sceneOpen") { draft = tidy(readLibrary(store).scenes[sceneId] || draft); panel._confirmDelete = ""; }
      else if (act === "sceneLoad") {
        var saved = readLibrary(store).scenes[sceneId];
        if (saved && opts.onLoad) opts.onLoad(tidy(saved));
      }
      else if (act === "sceneDelete") { panel._confirmDelete = sceneId; }
      else if (act === "sceneDeleteYes") { deleteScene(store, sceneId, true); panel._confirmDelete = ""; if (draft.id === sceneId) draft = blank("New scene"); }
      else if (act === "sceneDeleteNo") panel._confirmDelete = "";
      else return;
      draw();
    });
    panel.addEventListener("input", function (ev) {
      var node = ev.target;
      if (!node || !panel.contains(node)) return;
      var act = node.getAttribute("data-act");
      if (act === "sceneName") draft.name = node.value;
      else if (act === "floorName") draft = renameFloor(draft, node.getAttribute("data-floor"), node.value);
      else if (act === "groupName") draft = renameGroup(draft, node.getAttribute("data-floor"), node.getAttribute("data-group"), node.value);
      else if (act === "boxName") draft = setContainer(draft, node.getAttribute("data-floor"), node.getAttribute("data-id"), { name: node.value });
      else if (act === "boxItems") draft = setContainer(draft, node.getAttribute("data-floor"), node.getAttribute("data-id"), { items: node.value });
      else if (act === "boxLock") draft = setContainer(draft, node.getAttribute("data-floor"), node.getAttribute("data-id"), { lockDc: node.value });
      else if (act === "boxForce") draft = setContainer(draft, node.getAttribute("data-floor"), node.getAttribute("data-id"), { forceDc: node.value });
      else if (act === "foeName") draft = setEnemy(draft, node.getAttribute("data-floor"), node.getAttribute("data-id"), { name: node.value });
      else if (act === "foeGroup") draft = setEnemy(draft, node.getAttribute("data-floor"), node.getAttribute("data-id"), { initGroup: node.value });
      else if (act === "foeXp") draft = setEnemy(draft, node.getAttribute("data-floor"), node.getAttribute("data-id"), { xp: node.value });
      else if (act === "spawnX" || act === "spawnY") {
        var patch = {};
        if (act === "spawnX") patch.x = node.value;
        if (act === "spawnY") patch.y = node.value;
        draft = setSpawn(draft, node.getAttribute("data-floor"), node.getAttribute("data-spawn"), patch);
      }
    });
    panel.addEventListener("change", function (ev) {
      var node = ev.target;
      if (!node || !panel.contains(node)) return;
      var act = node.getAttribute("data-act");
      if (act === "scenePackPick") {
        panel._packPick = panel._packPick || {};
        if (node.checked) panel._packPick[node.getAttribute("data-id")] = 1;
        else delete panel._packPick[node.getAttribute("data-id")];
        return;
      }
      if (act === "scenePackFile") {
        var packFile = node.files && node.files[0];
        node.value = "";
        if (!packFile) return;
        if (packFile.size > PACK_MAX) {
          panel._notice = { err: true, text: "This pack is too big (" + kb(packFile.size) + " KB). Packs should point at pictures, not store them in the file." };
          draw();
          return;
        }
        var packReader = new FileReader();
        packReader.onerror = function () {
          panel._notice = { err: true, text: "That file couldn't be read." };
          draw();
        };
        packReader.onload = function () {
          var imported = importScenePack(String(packReader.result || ""), {
            store: store,
            maps: (opts.mapLibrary && opts.mapLibrary()) || {},
            knownMaps: (opts.knownMaps && opts.knownMaps()) || {}
          });
          if (!imported.ok) panel._notice = { err: true, text: imported.error };
          else {
            panel._notice = { err: false, text: imported.message };
            if (opts.onMaps && imported.maps && imported.maps.length) opts.onMaps(imported.maps);
          }
          draw();
        };
        packReader.readAsText(packFile);
        return;
      }
      if (act === "boxUnlocked" || act === "boxRetries" || act === "boxImprovise") {
        var boxPatch = {};
        if (act === "boxUnlocked") boxPatch.unlocked = !!node.checked;
        if (act === "boxRetries") boxPatch.allowRetries = !!node.checked;
        if (act === "boxImprovise") boxPatch.improvise = !!node.checked;
        draft = setContainer(draft, node.getAttribute("data-floor"), node.getAttribute("data-id"), boxPatch);
        if (opts.onChange) opts.onChange(tidy(draft));
        draw();
        return;
      }
      if (act === "foeHidden") {
        draft = setEnemy(draft, node.getAttribute("data-floor"), node.getAttribute("data-id"), { hidden: !!node.checked });
        if (opts.onChange) opts.onChange(tidy(draft));
        draw();
        return;
      }
      if (act === "linkKind" || act === "linkDest" || act === "linkTwoWay" || act === "linkVisible") {
        var patch = {};
        if (act === "linkKind") patch.kind = node.value;
        if (act === "linkDest") patch.destFloorId = node.value;
        if (act === "linkTwoWay") patch.twoWay = !!node.checked;
        if (act === "linkVisible") patch.visible = !!node.checked;
        draft = setLink(draft, node.getAttribute("data-floor"), node.getAttribute("data-link"), patch);
        if (opts.onChange) opts.onChange(tidy(draft));
        draw();
        return;
      }
      if (act !== "sceneImportFile" || !node.files || !node.files[0]) return;
      var reader = new FileReader();
      reader.onload = function () {
        try { importLibrary(store, String(reader.result || "")); } catch (e) { return; }
        draw();
      };
      reader.readAsText(node.files[0]);
    });
    panel.addEventListener("dragstart", function (ev) {
      var row = ev.target && ev.target.closest && ev.target.closest("[data-floor]");
      if (!row || (ev.target.closest && ev.target.closest("input, select, textarea, button"))) { ev.preventDefault(); return; }
      ev.dataTransfer.setData("text/plain", row.getAttribute("data-floor"));
      panel._dragFloor = row.getAttribute("data-floor");
    });
    panel.addEventListener("dragover", function (ev) {
      if (panel._dragFloor) ev.preventDefault();
    });
    panel.addEventListener("drop", function (ev) {
      var row = ev.target && ev.target.closest && ev.target.closest("[data-floor]");
      var from = panel._dragFloor;
      panel._dragFloor = "";
      if (!row || !from) return;
      ev.preventDefault();
      var ids = draft.floors.map(function (f) { return f.id; });
      var a = ids.indexOf(from);
      var b = ids.indexOf(row.getAttribute("data-floor"));
      if (a < 0 || b < 0 || a === b) return;
      ids.splice(a, 1);
      ids.splice(b, 0, from);
      draft = reorder(draft, ids);
      draw();
    });
    draw();
    function commit(next) { draft = tidy(next); if (opts.onChange) opts.onChange(draft); draw(); return draft; }
    live = {
      el: panel,
      onClose: opts.onClose || null,
      store: store,
      draft: function () { return tidy(draft); },
      arm: function () { return panel._encArm || panel._linkArm || panel._arm || null; },
      disarm: function () { panel._arm = null; panel._linkArm = null; panel._encArm = null; draw(); },
      dropAt: function (x, y) {
        if (!panel._arm) return null;
        draft = addSpawn(draft, panel._arm.floorId, { groupId: panel._arm.groupId, x: x, y: y });
        if (opts.onChange) opts.onChange(tidy(draft));
        draw();
        var floor = floorOf(draft, panel._arm.floorId);
        var list = floor ? floor.spawns.filter(function (sp) { return sp.groupId === panel._arm.groupId; }) : [];
        return list[list.length - 1] || null;
      },
      moveGhost: function (spawnId, x, y) {
        draft.floors.forEach(function (f) {
          if (f.spawns.some(function (sp) { return sp.id === spawnId; })) draft = setSpawn(draft, f.id, spawnId, { x: x, y: y });
        });
        if (opts.onChange) opts.onChange(tidy(draft));
        return tidy(draft);
      },
      removeGhost: function (spawnId) {
        draft.floors.forEach(function (f) {
          if (f.spawns.some(function (sp) { return sp.id === spawnId; })) draft = removeSpawn(draft, f.id, spawnId);
        });
        if (opts.onChange) opts.onChange(tidy(draft));
        draw();
        return tidy(draft);
      },
      dropLink: function (x, y) {
        if (!panel._linkArm) return null;
        var made = null;
        if (panel._linkArm.mode === "landing") {
          draft = setLink(draft, panel._linkArm.floorId, panel._linkArm.linkId, { landX: x, landY: y });
          var hit = findLink(draft, panel._linkArm.linkId);
          made = hit ? hit.link : null;
        } else {
          draft = addLink(draft, panel._linkArm.floorId, { x: x, y: y, kind: "up" });
          var floor = floorOf(draft, panel._linkArm.floorId);
          made = floor && floor.stairs.length ? floor.stairs[floor.stairs.length - 1] : null;
        }
        panel._linkArm = null;
        if (opts.onChange) opts.onChange(tidy(draft));
        if (opts.onDisarm) opts.onDisarm();
        draw();
        return made;
      },
      moveLink: function (linkId, x, y) {
        var hit = findLink(draft, linkId);
        if (!hit) return tidy(draft);
        draft = setLink(draft, hit.floor.id, linkId, { x: x, y: y });
        if (opts.onChange) opts.onChange(tidy(draft));
        draw();
        return tidy(draft);
      },
      removeLink: function (linkId) {
        var hit = findLink(draft, linkId);
        if (!hit) return tidy(draft);
        draft = removeLink(draft, hit.floor.id, linkId);
        if (opts.onChange) opts.onChange(tidy(draft));
        draw();
        return tidy(draft);
      },
      setLink: function (linkId, patch) {
        var hit = findLink(draft, linkId);
        if (!hit) return tidy(draft);
        draft = setLink(draft, hit.floor.id, linkId, patch || {});
        if (opts.onChange) opts.onChange(tidy(draft));
        draw();
        return tidy(draft);
      },
      dropEncounter: function (x, y) {
        if (!panel._encArm) return null;
        var arm = panel._encArm;
        var made = null;
        if (arm.kind === "enemy") {
          draft = addEnemy(draft, arm.floorId, { x: x, y: y, name: arm.name, bestiaryId: arm.bestiaryId, xp: arm.xp, hp: arm.hp, hidden: true });
          var floor = floorOf(draft, arm.floorId);
          made = floor && floor.encounters.enemies[floor.encounters.enemies.length - 1];
        } else {
          draft = addContainer(draft, arm.floorId, { kind: arm.kind, x: x, y: y });
          var boxFloor = floorOf(draft, arm.floorId);
          made = boxFloor && boxFloor.encounters.containers[boxFloor.encounters.containers.length - 1];
        }
        panel._encArm = null;
        if (opts.onChange) opts.onChange(tidy(draft));
        if (opts.onDisarm) opts.onDisarm();
        draw();
        return made;
      },
      moveEncounter: function (id, x, y) {
        var hit = findPiece(draft, id);
        if (!hit) return tidy(draft);
        if (hit.container) draft = setContainer(draft, hit.floor.id, id, { x: x, y: y });
        else draft = setEnemy(draft, hit.floor.id, id, { x: x, y: y });
        if (opts.onChange) opts.onChange(tidy(draft));
        draw();
        return tidy(draft);
      },
      removeEncounter: function (id) {
        var hit = findPiece(draft, id);
        if (!hit) return tidy(draft);
        if (hit.container) draft = removeContainer(draft, hit.floor.id, id);
        else draft = removeEnemy(draft, hit.floor.id, id);
        if (opts.onChange) opts.onChange(tidy(draft));
        draw();
        return tidy(draft);
      }
    };
    void commit;
    var first = panel.querySelector("[data-act='sceneName']");
    if (first && first.focus) { try { first.focus(); } catch (e) {} }
    return live;
  }
  function close() {
    var hook = live && live.onClose;
    if (live && live.el && live.el.parentNode) live.el.parentNode.removeChild(live.el);
    live = null;
    if (hook) hook();
  }
  function isOpen() { return !!(live && live.el && live.el.parentNode); }

  root.SSDNSSceneBuilder = {
    KEY: KEY,
    blank: blank,
    tidy: tidy,
    addFloor: addFloor,
    renameFloor: renameFloor,
    removeFloor: removeFloor,
    moveFloor: moveFloor,
    reorder: reorder,
    setStart: setStart,
    addGroup: addGroup,
    renameGroup: renameGroup,
    setDefaultGroup: setDefaultGroup,
    addSpawn: addSpawn,
    setSpawn: setSpawn,
    removeSpawn: removeSpawn,
    addLink: addLink,
    setLink: setLink,
    removeLink: removeLink,
    addContainer: addContainer,
    setContainer: setContainer,
    removeContainer: removeContainer,
    addEnemy: addEnemy,
    setEnemy: setEnemy,
    removeEnemy: removeEnemy,
    revealEnemies: revealEnemies,
    lootFromContainer: lootFromContainer,
    encounterSummary: encounterSummary,
    groupSpots: groupSpots,
    assignLandings: assignLandings,
    PACK_FORMAT: PACK_FORMAT,
    exportScenePack: exportScenePack,
    importScenePack: importScenePack,
    exportLibrary: exportLibrary,
    importLibrary: importLibrary,
    readLibrary: readLibrary,
    saveScene: saveScene,
    renameScene: renameScene,
    duplicateScene: duplicateScene,
    deleteScene: deleteScene,
    loadIntoRoom: loadIntoRoom,
    open: open,
    close: close,
    isOpen: isOpen,
    draft: function () { return live && live.draft ? live.draft() : null; },
    arming: function () { return live && live.arm ? live.arm() : null; },
    disarm: function () { if (live && live.disarm) live.disarm(); },
    dropAt: function (x, y) { return live && live.dropAt ? live.dropAt(x, y) : null; },
    moveGhost: function (id, x, y) { return live && live.moveGhost ? live.moveGhost(id, x, y) : null; },
    removeGhost: function (id) { return live && live.removeGhost ? live.removeGhost(id) : null; },
    dropLink: function (x, y) { return live && live.dropLink ? live.dropLink(x, y) : null; },
    dropEncounter: function (x, y) { return live && live.dropEncounter ? live.dropEncounter(x, y) : null; },
    moveEncounter: function (id, x, y) { return live && live.moveEncounter ? live.moveEncounter(id, x, y) : null; },
    removeEncounter: function (id) { return live && live.removeEncounter ? live.removeEncounter(id) : null; },
    moveLink: function (id, x, y) { return live && live.moveLink ? live.moveLink(id, x, y) : null; },
    removeLinkMark: function (id) { return live && live.removeLink ? live.removeLink(id) : null; },
    setLinkMark: function (id, patch) { return live && live.setLink ? live.setLink(id, patch) : null; },
    linksOnMap: function (mapId) {
      var scene = live && live.draft ? live.draft() : null;
      var markers = [];
      var landings = [];
      if (!scene) return { markers: markers, landings: landings };
      (scene.floors || []).forEach(function (f) {
        (f.stairs || []).forEach(function (link) {
          var row = {
            id: link.id, kind: link.kind, x: link.x, y: link.y,
            destFloorId: link.destFloorId, destMapId: link.destMapId,
            landX: link.landX, landY: link.landY, twoWay: !!link.twoWay,
            pairId: link.pairId || "", visible: !!link.visible,
            mapId: f.mapId, floorId: f.id, floorName: f.name
          };
          if (!mapId || f.mapId === mapId) markers.push(row);
          if (link.landX != null && link.landY != null && link.destMapId && (!mapId || link.destMapId === mapId) && f.mapId !== link.destMapId) {
            landings.push({ id: link.id, kind: link.kind, x: link.landX, y: link.landY, mapId: link.destMapId, visible: !!link.visible, from: f.mapId });
          }
        });
      });
      return { markers: markers, landings: landings };
    },
    spotsOnMap: function (mapId) {
      var scene = live && live.draft ? live.draft() : null;
      var out = [];
      if (!scene) return out;
      (scene.floors || []).forEach(function (f) {
        if (f.mapId !== mapId) return;
        (f.spawns || []).forEach(function (sp) {
          var g = (f.groups || []).filter(function (gr) { return gr.id === sp.groupId; })[0];
          out.push({ id: sp.id, n: sp.n, x: sp.x, y: sp.y, groupId: sp.groupId, name: g ? g.name : "Party", color: g ? g.color : COLORS[0] });
        });
      });
      return out;
    },
    piecesOnMap: function (mapId) {
      var scene = live && live.draft ? live.draft() : null;
      var out = [];
      if (!scene) return out;
      (scene.floors || []).forEach(function (f) {
        if (mapId && f.mapId !== mapId) return;
        var enc = f.encounters || { containers: [], enemies: [] };
        (enc.containers || []).forEach(function (c) {
          out.push({ id: c.id, kind: c.kind, name: c.name, x: c.x, y: c.y, mapId: f.mapId });
        });
        (enc.enemies || []).forEach(function (e) {
          out.push({ id: e.id, kind: "enemy", name: e.name, x: e.x, y: e.y, hidden: !!e.hidden, mapId: f.mapId });
        });
      });
      return out;
    }
  };
})(typeof window !== "undefined" ? window : globalThis);

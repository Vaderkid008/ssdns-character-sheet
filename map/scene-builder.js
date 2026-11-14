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
        stairs: Array.isArray(f.stairs) ? f.stairs : []
      };
    });
    if (!floorOf(scene, scene.startFloorId)) scene.startFloorId = (scene.floors[0] && scene.floors[0].id) || "";
    tidyStairs(scene);
    if (!Object.prototype.hasOwnProperty.call(scene, "encounters")) scene.encounters = null;
    return scene;
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
      sceneSpawns: sceneSpawns
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
      if (index === draft.floors.length - 1) row.setAttribute("data-last", "1");
      list.appendChild(row);
    });
    if (!draft.floors.length) list.appendChild(el("li", { class: "ssm-scene-empty" }, "No floors yet."));
    panel.appendChild(list);
    var port = el("div", { class: "ssm-scene-tools" });
    port.appendChild(el("button", { type: "button", "data-act": "sceneExport" }, "Export library"));
    port.appendChild(el("button", { type: "button", "data-act": "sceneImport" }, "Import library"));
    var file = el("input", { type: "file", accept: "application/json", "data-act": "sceneImportFile", hidden: "hidden" });
    port.appendChild(file);
    panel.appendChild(port);
    panel.appendChild(el("h3", null, "Scene library"));
    var saved = Object.keys(lib.scenes || {}).map(function (id) { return lib.scenes[id]; });
    saved.sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
    var libList = el("ul", { class: "ssm-scene-library", "data-act": "sceneLibrary" });
    if (!saved.length) libList.appendChild(el("li", { class: "ssm-scene-empty" }, "Nothing saved yet."));
    saved.forEach(function (scene) {
      var item = el("li", null);
      item.appendChild(el("b", null, scene.name));
      item.appendChild(document.createTextNode(" · " + (scene.floors || []).length + " floors"));
      var acts = el("div", { class: "ssm-scene-tools" });
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
        if (panel._arm || panel._linkArm) { panel._arm = null; panel._linkArm = null; if (opts.onDisarm) opts.onDisarm(); draw(); return; }
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
      else if (act === "sceneNew") { draft = blank("New scene"); panel._confirmDelete = ""; panel._arm = null; panel._linkArm = null; }
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
      else if (act === "sceneExport") {
        if (opts.onExport) opts.onExport(exportLibrary(store));
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
      store: store,
      draft: function () { return tidy(draft); },
      arm: function () { return panel._linkArm || panel._arm || null; },
      disarm: function () { panel._arm = null; panel._linkArm = null; draw(); },
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
      }
    };
    void commit;
    var first = panel.querySelector("[data-act='sceneName']");
    if (first && first.focus) { try { first.focus(); } catch (e) {} }
    return live;
  }
  function close() {
    if (live && live.el && live.el.parentNode) live.el.parentNode.removeChild(live.el);
    live = null;
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
    groupSpots: groupSpots,
    assignLandings: assignLandings,
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
    }
  };
})(typeof window !== "undefined" ? window : globalThis);

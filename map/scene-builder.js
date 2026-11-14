/* DM Scene Builder. A scene is a named stack of floors the DM saves on this device
   and can load into any room. Pack files and room maps are never rewritten.
   Stairs are stored and left empty until the next slice. Encounter pieces stay null. */
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
  function tidy(scene) {
    scene = clone(scene) || blank();
    if (!scene.id) scene.id = nid("scene");
    scene.name = String(scene.name || "New scene").slice(0, 80);
    scene.floors = (scene.floors || []).filter(function (f) { return f && f.mapId; }).map(function (f, i) {
      return {
        id: f.id || f.mapId,
        mapId: String(f.mapId),
        name: String(f.name || f.mapId).slice(0, 80),
        order: i,
        source: f.source || "pack",
        spawns: (f.spawns || []).filter(Boolean).map(function (sp) {
          return {
            id: sp.id || nid("spawn"),
            name: String(sp.name || "Party").slice(0, 40),
            x: num(sp.x),
            y: num(sp.y)
          };
        }),
        stairs: Array.isArray(f.stairs) ? f.stairs : []
      };
    });
    if (!floorOf(scene, scene.startFloorId)) scene.startFloorId = (scene.floors[0] && scene.floors[0].id) || "";
    scene.stairs = Array.isArray(scene.stairs) ? scene.stairs : [];
    if (!Object.prototype.hasOwnProperty.call(scene, "encounters")) scene.encounters = null;
    return scene;
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
  function addSpawn(scene, floorId, spawn) {
    scene = tidy(scene);
    var floor = floorOf(scene, floorId);
    if (!floor) return scene;
    spawn = spawn || {};
    floor.spawns.push({
      id: spawn.id || nid("spawn"),
      name: String(spawn.name || "Party").slice(0, 40),
      x: num(spawn.x),
      y: num(spawn.y)
    });
    return scene;
  }
  function setSpawn(scene, floorId, spawnId, patch) {
    scene = tidy(scene);
    var floor = floorOf(scene, floorId);
    if (!floor) return scene;
    floor.spawns.forEach(function (sp) {
      if (sp.id !== spawnId) return;
      if (patch.name != null) sp.name = String(patch.name).slice(0, 40);
      if (patch.x != null) sp.x = num(patch.x);
      if (patch.y != null) sp.y = num(patch.y);
    });
    return scene;
  }
  function removeSpawn(scene, floorId, spawnId) {
    scene = tidy(scene);
    var floor = floorOf(scene, floorId);
    if (floor) floor.spawns = floor.spawns.filter(function (sp) { return sp.id !== spawnId; });
    return scene;
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
      if (claimed[f.mapId] && claimed[f.mapId] !== scene.id) kept.push(f.mapId);
      else floors.push({
        id: f.mapId,
        mapId: f.mapId,
        name: f.name,
        order: floors.length,
        stairs: f.stairs || []
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
    scene.floors.forEach(function (f) {
      (f.spawns || []).forEach(function (sp) {
        if (!preps[f.mapId]) preps[f.mapId] = {};
        var key = "spawn_" + sp.id;
        if (!preps[f.mapId][key]) preps[f.mapId][key] = { x: sp.x, y: sp.y, name: sp.name, prep: true };
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
      packSame: packIds.join(",") === (room.packIds || []).join(",")
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
    var focusKey = focus && panel.contains(focus) ? (focus.getAttribute("data-act") || "") + ":" + (focus.getAttribute("data-floor") || "") + ":" + (focus.getAttribute("data-spawn") || "") : "";
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
      var row = el("li", { "data-floor": floor.id, draggable: "true" });
      var bar = el("div", { class: "ssm-scene-floorbar" });
      bar.appendChild(el("span", { class: "ssm-scene-handle", "data-act": "floorDrag", title: "Drag to reorder" }, "⋮⋮"));
      var fname = el("input", { type: "text", "data-act": "floorName", "data-floor": floor.id, "aria-label": "Floor name", maxlength: "80" });
      fname.value = floor.name;
      bar.appendChild(fname);
      if (draft.startFloorId === floor.id) bar.appendChild(el("span", { class: "ssm-scene-start" }, "Start"));
      else bar.appendChild(el("button", { type: "button", "data-act": "floorStart", "data-floor": floor.id }, "Set start"));
      bar.appendChild(el("button", { type: "button", "data-act": "floorUp", "data-floor": floor.id, "aria-label": "Move floor up" }, "Up"));
      bar.appendChild(el("button", { type: "button", "data-act": "floorDown", "data-floor": floor.id, "aria-label": "Move floor down" }, "Down"));
      bar.appendChild(el("button", { type: "button", "data-act": "floorRemove", "data-floor": floor.id }, "Remove"));
      row.appendChild(bar);
      var spawns = el("div", { class: "ssm-scene-spawns" });
      spawns.appendChild(el("span", { class: "ssm-scene-k" }, "Party spawns"));
      floor.spawns.forEach(function (sp) {
        var line = el("div", { class: "ssm-scene-spawn" });
        var sn = el("input", { type: "text", "data-act": "spawnName", "data-floor": floor.id, "data-spawn": sp.id, "aria-label": "Spawn name" });
        sn.value = sp.name;
        var sx = el("input", { type: "text", inputmode: "numeric", "data-act": "spawnX", "data-floor": floor.id, "data-spawn": sp.id, "aria-label": "Spawn column" });
        sx.value = String(sp.x);
        var sy = el("input", { type: "text", inputmode: "numeric", "data-act": "spawnY", "data-floor": floor.id, "data-spawn": sp.id, "aria-label": "Spawn row" });
        sy.value = String(sp.y);
        line.appendChild(sn); line.appendChild(sx); line.appendChild(sy);
        line.appendChild(el("button", { type: "button", "data-act": "spawnRemove", "data-floor": floor.id, "data-spawn": sp.id }, "Remove"));
        spawns.appendChild(line);
      });
      spawns.appendChild(el("button", { type: "button", "data-act": "spawnAdd", "data-floor": floor.id }, "Add spawn"));
      row.appendChild(spawns);
      row.appendChild(el("p", { class: "ssm-scene-stairs", "data-act": "stairsHook" }, "Stairs and ladders: next update. This floor keeps an empty link list."));
      if (index === draft.floors.length - 1) row.setAttribute("data-last", "1");
      list.appendChild(row);
    });
    if (!draft.floors.length) list.appendChild(el("li", { class: "ssm-scene-empty" }, "No floors yet."));
    panel.appendChild(list);
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
      var again = panel.querySelector('[data-act="' + focusKey.split(":")[0] + '"]' + (focusKey.split(":")[1] ? '[data-floor="' + focusKey.split(":")[1] + '"]' : "") + (focusKey.split(":")[2] ? '[data-spawn="' + focusKey.split(":")[2] + '"]' : ""));
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
        if (panel._confirmDelete) { panel._confirmDelete = ""; draw(); return; }
        close();
      }
    }
    panel.addEventListener("keydown", stopKey);
    panel.addEventListener("click", function (ev) {
      var btn = ev.target && ev.target.closest && ev.target.closest("[data-act]");
      if (!btn || !panel.contains(btn)) return;
      var act = btn.getAttribute("data-act");
      var floorId = btn.getAttribute("data-floor");
      var sceneId = btn.getAttribute("data-id");
      if (act === "sceneClose") close();
      else if (act === "sceneNew") { draft = blank("New scene"); panel._confirmDelete = ""; }
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
      else if (act === "spawnAdd") draft = addSpawn(draft, floorId, { name: "Party", x: 1, y: 1 });
      else if (act === "spawnRemove") draft = removeSpawn(draft, floorId, btn.getAttribute("data-spawn"));
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
      else if (act === "spawnName" || act === "spawnX" || act === "spawnY") {
        var patch = {};
        if (act === "spawnName") patch.name = node.value;
        if (act === "spawnX") patch.x = node.value;
        if (act === "spawnY") patch.y = node.value;
        draft = setSpawn(draft, node.getAttribute("data-floor"), node.getAttribute("data-spawn"), patch);
      }
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
    live = { el: panel, draft: function () { return tidy(draft); }, store: store };
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
    addSpawn: addSpawn,
    setSpawn: setSpawn,
    removeSpawn: removeSpawn,
    readLibrary: readLibrary,
    saveScene: saveScene,
    renameScene: renameScene,
    duplicateScene: duplicateScene,
    deleteScene: deleteScene,
    loadIntoRoom: loadIntoRoom,
    open: open,
    close: close,
    isOpen: isOpen
  };
})(typeof window !== "undefined" ? window : globalThis);

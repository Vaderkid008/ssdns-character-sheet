/* Scene > Floor index. Old map ids stay the floor ids.
   Conversion only adds this index. It does not rewrite walls, fog, tokens, or pack files. */
(function (root) {
  "use strict";
  var GROUPS = [
    {
      id: "place_dusty_spur",
      name: "Dusty Spur",
      floors: [
        { mapId: "scn_dustyspur01", name: "Saloon" },
        { mapId: "scn_upstairs", name: "Upstairs" }
      ]
    },
    {
      id: "place_ellen",
      name: "Ellen Manor",
      floors: [
        { mapId: "scn_ellen_cellar", name: "Cellar" },
        { mapId: "scn_ellen_grounds", name: "Grounds" },
        { mapId: "scn_ellen_2f", name: "2nd floor" },
        { mapId: "scn_ellen_3f", name: "3rd floor" }
      ]
    }
  ];

  function clone(v) {
    return JSON.parse(JSON.stringify(v == null ? null : v));
  }
  function rowsFrom(input) {
    var out = [];
    var push = function (row) {
      if (!row) return;
      var id = row.id || row.mapId;
      if (!id || row.deleted) return;
      out.push({ id: String(id), name: row.name || String(id) });
    };
    var scenes = input.scenes;
    if (Array.isArray(scenes)) scenes.forEach(push);
    else if (scenes && typeof scenes === "object") {
      Object.keys(scenes).forEach(function (id) {
        var row = scenes[id];
        if (row && typeof row === "object") push(Object.assign({ id: row.id || id }, row));
        else push({ id: id, name: id });
      });
    }
    (input.world || []).forEach(push);
    (input.library || []).forEach(push);
    (input.ids || []).forEach(function (id) { push({ id: id, name: id }); });
    return out;
  }
  function savedPlaces(input) {
    var raw = input.places;
    if (!raw || typeof raw !== "object") return {};
    if (raw.places && typeof raw.places === "object" && !raw.id && !raw.floors) raw = raw.places;
    return clone(raw) || {};
  }
  function floorRow(f, i) {
    var mapId = f.mapId || f.id;
    var row = {
      id: f.id || mapId,
      mapId: mapId,
      name: f.name || mapId,
      order: f.order != null ? f.order : i
    };
    if (Array.isArray(f.stairs) && f.stairs.length) row.stairs = clone(f.stairs);
    return row;
  }
  function migrate(input) {
    input = input || {};
    var places = {};
    var byFloor = {};
    var saved = savedPlaces(input);
    Object.keys(saved).forEach(function (pid) {
      var p = saved[pid];
      if (!p || typeof p !== "object" || (!p.id && !p.floors)) return;
      var id = p.id || pid;
      var floors = (p.floors || []).map(floorRow).filter(function (f) { return f.mapId; });
      floors.sort(function (a, b) { return a.order - b.order; });
      places[id] = { id: id, name: p.name || id, floors: floors };
      floors.forEach(function (f) { byFloor[f.mapId] = id; });
    });
    GROUPS.forEach(function (g) {
      var place = places[g.id];
      if (!place) {
        place = { id: g.id, name: g.name, floors: [] };
        places[g.id] = place;
      }
      if (!place.name) place.name = g.name;
      g.floors.forEach(function (f, i) {
        if (byFloor[f.mapId] && byFloor[f.mapId] !== g.id) return;
        if (!place.floors.some(function (x) { return x.mapId === f.mapId; })) {
          place.floors.push({ id: f.mapId, mapId: f.mapId, name: f.name, order: i });
        }
        byFloor[f.mapId] = g.id;
      });
      place.floors.sort(function (a, b) { return a.order - b.order; });
    });
    rowsFrom(input).forEach(function (row) {
      if (byFloor[row.id]) return;
      var pid = "place_" + row.id;
      if (!places[pid]) {
        places[pid] = {
          id: pid,
          name: row.name || row.id,
          floors: [{ id: row.id, mapId: row.id, name: row.name || row.id, order: 0 }]
        };
      } else if (!places[pid].floors.some(function (f) { return f.mapId === row.id; })) {
        places[pid].floors.push({ id: row.id, mapId: row.id, name: row.name || row.id, order: places[pid].floors.length });
      }
      byFloor[row.id] = pid;
    });
    return { places: places, byFloor: byFloor };
  }
  function resolve(places, id) {
    if (!places || !id) return null;
    var found = null;
    Object.keys(places).forEach(function (pid) {
      if (found) return;
      var place = places[pid];
      var floors = (place && place.floors) || [];
      var floor = floors.filter(function (f) { return f && (f.mapId === id || f.id === id); })[0];
      if (floor) found = { place: place, floor: floor, mapId: floor.mapId || floor.id };
    });
    if (found) return found;
    var place = places[id];
    if (place && place.floors && place.floors.length) {
      var floors = place.floors.slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
      return { place: place, floor: floors[0], mapId: floors[0].mapId || floors[0].id };
    }
    return null;
  }

  root.SSDNSPlaces = { migrate: migrate, resolve: resolve, groups: GROUPS };
})(typeof window !== "undefined" ? window : globalThis);

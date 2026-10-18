/* Storyteller focus-card art and music-store instrument art.
   parlor-guitar files are the Guitar. snare-drum is the Drum.
   cavalry-bugle is the Bugle. Harmonica uses the tin, and the rack
   image when the sheet is carrying a harmonica rack. */
(function (root) {
  "use strict";

  var FILES = {
    "fiddle-quality": "fiddle-quality.webp",
    "fiddle-cheap": "fiddle-cheap.webp",
    "banjo-quality": "banjo-quality.webp",
    "banjo-cheap": "banjo-cheap.webp",
    "guitar-quality": "parlor-guitar-quality.webp",
    "guitar-cheap": "parlor-guitar-cheap.webp",
    "accordion-quality": "accordion-quality.webp",
    "accordion-cheap": "accordion-cheap.webp",
    "harmonica-cheap": "harmonica-tin.webp",
    "harmonica-quality": "harmonica-tin.webp",
    "harmonica-tin": "harmonica-tin.webp",
    "harmonica-rack": "harmonica-rack.webp",
    "jaw-harp": "jaw-harp.webp",
    "drum": "snare-drum.webp",
    "snare-drum": "snare-drum.webp",
    "bugle": "cavalry-bugle.webp",
    "cavalry-bugle": "cavalry-bugle.webp",
    "tin-whistle": "tin-whistle.webp"
  };
  var NAMES = {
    "fiddle-quality": "Fiddle (quality)",
    "fiddle-cheap": "Fiddle (cheap)",
    "banjo-quality": "Banjo (quality)",
    "banjo-cheap": "Banjo (cheap)",
    "guitar-quality": "Guitar (quality)",
    "guitar-cheap": "Guitar (cheap)",
    "accordion-quality": "Accordion (quality)",
    "accordion-cheap": "Accordion (cheap)",
    "harmonica-cheap": "Harmonica (cheap)",
    "harmonica-quality": "Harmonica (quality)",
    "harmonica-rack": "Harmonica rack",
    "jaw-harp": "Jaw harp",
    "drum": "Drum",
    "bugle": "Bugle",
    "tin-whistle": "Tin whistle"
  };

  function norm(s) {
    return String(s || "").toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  }
  function prefix() {
    try {
      var path = (root.location && root.location.pathname) || "";
      if (path.indexOf("/dm/") >= 0) return "../";
    } catch (e) {}
    return "";
  }
  function fileFor(id) {
    return FILES[id] || "";
  }
  function slugFor(item) {
    if (!item) return "";
    var id = typeof item === "string" ? item : (item.id || "");
    var name = typeof item === "string" ? item : (item.name || "");
    var quality = typeof item === "string" ? "" : (item.quality || item.instrumentQuality || "");
    var gear = typeof item === "string" ? "" : String(item.equipment || "");
    if (FILES[id]) return id;
    var key = norm(name);
    if (key === "fiddle") return quality === "quality" ? "fiddle-quality" : "fiddle-cheap";
    if (key === "banjo") return quality === "quality" ? "banjo-quality" : "banjo-cheap";
    if (key === "guitar" || key === "parlor guitar") return quality === "quality" ? "guitar-quality" : "guitar-cheap";
    if (key === "accordion") return quality === "quality" ? "accordion-quality" : "accordion-cheap";
    if (key === "harmonica") {
      if (/harmonica rack/i.test(gear)) return "harmonica-rack";
      return quality === "quality" ? "harmonica-quality" : "harmonica-cheap";
    }
    if (key === "jaw harp") return "jaw-harp";
    if (key === "drum" || key === "snare drum") return "drum";
    if (key === "bugle" || key === "cavalry bugle") return "bugle";
    if (key === "tin whistle") return "tin-whistle";
    if (key === "harmonica rack") return "harmonica-rack";
    if (key === "fiddle quality") return "fiddle-quality";
    if (key === "fiddle cheap") return "fiddle-cheap";
    if (key === "banjo quality") return "banjo-quality";
    if (key === "banjo cheap") return "banjo-cheap";
    if (key === "guitar quality") return "guitar-quality";
    if (key === "guitar cheap") return "guitar-cheap";
    if (key === "accordion quality") return "accordion-quality";
    if (key === "accordion cheap") return "accordion-cheap";
    if (key === "harmonica quality") return "harmonica-quality";
    if (key === "harmonica cheap") return "harmonica-cheap";
    return "";
  }
  function srcFor(item) {
    var slug = slugFor(item);
    var file = fileFor(slug);
    return file ? prefix() + "assets/img/instruments/" + file : "";
  }
  function list() {
    return Object.keys(NAMES).map(function (id) {
      return { id: id, name: NAMES[id], src: prefix() + "assets/img/instruments/" + FILES[id] };
    });
  }
  function clearPhoto(box) {
    box.classList.remove("has-art");
    box.removeAttribute("data-art");
    box.textContent = "Focus";
  }
  function paint(box, item) {
    if (!box) return "";
    var slug = slugFor(item);
    var src = srcFor(item);
    if (!src) {
      clearPhoto(box);
      return "";
    }
    if (box.getAttribute("data-art") === slug && box.querySelector("img")) return slug;
    var alt = (item && (item.name || item.id)) || slug;
    box.classList.add("has-art");
    box.title = alt;
    box.setAttribute("data-art", slug);
    box.textContent = "";
    var img = document.createElement("img");
    img.alt = alt;
    img.setAttribute("loading", "lazy");
    img.setAttribute("decoding", "async");
    box.appendChild(img);
    img.src = src;
    return slug;
  }

  root.SSDNSInstrumentArt = {
    slugFor: slugFor,
    srcFor: srcFor,
    list: list,
    paint: paint
  };
})(typeof window !== "undefined" ? window : globalThis);

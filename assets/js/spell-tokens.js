/**
 * N85 create-tokens. Spiritual Weapon, Flaming Sphere, and Guardian of Faith
 * are map pieces (no HP, not in initiative, not a creature target).
 * Flame Blade stays a held FX on the caster and never becomes a token.
 * rules.js is not edited.
 */
(function (root) {
  "use strict";

  var BOOK = {
    "spiritual weapon": {
      kind: "token",
      name: "Spiritual Weapon",
      label: "Spirit",
      squares: 1,
      moveFeet: 20,
      attack: "melee",
      action: "bonus",
      conc: false,
      noHp: true,
      noInit: true,
      notTargetable: true,
      image: "spell-tokens/spiritual-weapon-token-140.png",
      color: "#7ec8c3",
      aura: 0
    },
    "flaming sphere": {
      kind: "token",
      name: "Flaming Sphere",
      label: "Sphere",
      squares: 1,
      moveFeet: 30,
      action: "bonus",
      ram: true,
      conc: true,
      noHp: true,
      noInit: true,
      notTargetable: true,
      image: "spell-tokens/flaming-sphere-token-140.png",
      color: "#e25822",
      aura: 5
    },
    "guardian of faith": {
      kind: "token",
      name: "Guardian of Faith",
      label: "Guardian",
      squares: 2,
      moveFeet: 0,
      conc: false,
      noHp: true,
      noInit: true,
      notTargetable: true,
      image: "spell-tokens/guardian-of-faith-token-280.png",
      color: "#e6c36a",
      aura: 10,
      budget: 60
    },
    "flame blade": {
      kind: "held",
      name: "Flame Blade",
      createToken: false,
      follows: "caster"
    }
  };

  function norm(s) {
    return String(s || "").toLowerCase().replace(/\./g, "").replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();
  }
  function spec(name) {
    var key = norm(name);
    var row = BOOK[key];
    return row ? Object.assign({ key: key }, row) : null;
  }
  function isToken(name) {
    var row = spec(name);
    return !!(row && row.kind === "token");
  }
  function isHeld(name) {
    var row = spec(name);
    return !!(row && row.kind === "held");
  }
  /* Chebyshev squares, 5 ft each. feet 0 locks the piece on its square. */
  function clampStep(from, to, feet) {
    from = from || { x: 0, y: 0 };
    to = to || { x: from.x, y: from.y };
    var cap = Number(feet);
    if (!isFinite(cap) || cap < 0) return { x: Math.round(to.x), y: Math.round(to.y) };
    var squares = cap / 5;
    var dx = Math.round(to.x) - Math.round(from.x);
    var dy = Math.round(to.y) - Math.round(from.y);
    var guard = 0;
    while (Math.max(Math.abs(dx), Math.abs(dy)) > squares && guard < 80) {
      if (Math.abs(dx) >= Math.abs(dy) && dx !== 0) dx -= Math.sign(dx);
      else if (dy !== 0) dy -= Math.sign(dy);
      else break;
      guard += 1;
    }
    return { x: Math.round(from.x) + dx, y: Math.round(from.y) + dy };
  }

  root.SSDNSSpellTokens = {
    spec: spec,
    isToken: isToken,
    isHeld: isHeld,
    clampStep: clampStep,
    norm: norm
  };
})(typeof window !== "undefined" ? window : globalThis);

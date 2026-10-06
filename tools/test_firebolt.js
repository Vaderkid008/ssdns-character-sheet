/* Fire Bolt and Pact Shot stay on spell dice. Crit doubles the dice after cantrip scaling. */
var fs = require("fs");
global.window = global;
eval(fs.readFileSync("assets/data/rules.js", "utf8"));
eval(fs.readFileSync("assets/js/spell-cast.js", "utf8"));

var Cast = global.SSDNSSpellCast;
var fails = [];
function check(name, ok) { if (!ok) fails.push(name); else console.log("ok", name); }

var real = Math.random;
function withRoll(n, fn) {
  Math.random = function () { return n; };
  try { return fn(); } finally { Math.random = real; }
}

var l1 = withRoll(0.5, function () {
  return Cast.rollCast({ spellName: "Fire Bolt", slotLevel: 0, characterLevel: 1, attackBonus: 5, weaponDamage: "1d8", gunName: "Dullards Tube Rifle" });
});
check("L1 has 1d10", /1d10/.test(l1.text));
check("L1 is fire", /fire/i.test(l1.text));
check("L1 ignores gun damage", !/weapon/i.test(l1.text) && !/1d8/.test(l1.text));

var l5 = withRoll(0.99, function () {
  return Cast.rollCast({ spellName: "Fire Bolt", slotLevel: 0, characterLevel: 5, attackBonus: 5, weaponDamage: "1d8" });
});
check("L5 crit is 4d10", /4d10/.test(l5.text));
check("L5 crit ignores 1d8", !/1d8/.test(l5.text));
check("L5 is a critical", !!l5.crit);

var pact = Cast.lookup("Pact Shot");
check("Pact Shot name", pact && pact.name === "Pact Shot");
var shot = withRoll(0.4, function () {
  return Cast.rollCast({ spellName: "Pact Shot", slotLevel: 0, characterLevel: 1, attackBonus: 5, weaponDamage: "1d8" });
});
check("Pact Shot is force", /force/i.test(shot.text) && /1d10/.test(shot.text));
check("Pact Shot ignores gun damage", !/weapon/i.test(shot.text));

if (fails.length) {
  console.error("FAILED", fails);
  process.exit(1);
}
console.log("firebolt checks passed");

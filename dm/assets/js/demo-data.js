/**
 * DMCC Demo mode — fully offline fake room with 3 players + sample events.
 * Loaded before dmcc.js. Toggle via ?demo=1 or the Demo switch (default ON until Firebase is live).
 */
(function (root) {
  "use strict";
  var NOW = Date.now();
  function ago(ms) { return new Date(NOW - ms).toISOString(); }
  function portrait(letter, color) {
    var svg = "<svg xmlns='http://www.w3.org/2000/svg' width='96' height='96'><rect fill='" + color + "' width='96' height='96'/><text x='48' y='62' text-anchor='middle' font-size='42' fill='#efe2c2' font-family='serif'>" + letter + "</text></svg>";
    return "data:image/svg+xml," + encodeURIComponent(svg);
  }
  function id(p) { return p + "_" + Math.random().toString(36).slice(2, 8); }

  var players = {
    p_jolene: {
      id: "p_jolene",
      uid: "demo_jolene",
      presence: { online: true, lastSeen: ago(5000) },
      snapshot: {
        name: "Jolene \"Dusty\" Pike",
        player: "Alex",
        calling: "Hexslinger",
        callingId: "hexslinger",
        level: 3,
        subclass: "Chaos (Wild Magic)",
        background: "Gunslinger / Drifter",
        lineage: "Nomads · Variant Human",
        hpCurrent: 17,
        hpMax: 20,
        hpTemp: 0,
        portrait: portrait("J", "#3a2a22"),
        conditions: "Bleeding",
        deathSaves: { success: [false, false, false], fail: [false, false, false] },
        ac: 13,
        es: 3453,
        shards: { white: 23, blue: 14, green: 2, yellow: 31, purple: 0 },
        abilities: { STR: 10, DEX: 14, CON: 14, INT: 10, WIS: 12, CHA: 16 },
        mods: { STR: 0, DEX: 2, CON: 2, INT: 0, WIS: 1, CHA: 3 },
        skills: { Intimidation: 5, Perception: 3, Arcana: 2, Deception: 5 },
        saves: { CON: 4, CHA: 5 },
        equipment: "Trail pack · Bedroll · Tinderbox · Canteen, 10 days of jerky · Bowie knife",
        features: "Hexslinger: spells channel through iron.\nChaos: sparks fly when the hex goes wrong.",
        personality: "Talks to her guns like old friends.",
        guns: [
          { name: "Blacksnake", loaded: 6, capacity: 6, atk: "+5", condition: "ok", load: "buck", jammed: false, cracked: false, fouled: false, dirty: false, note: "Caster gun" },
          { name: "Pony Arms Chaosmaker", loaded: 6, capacity: 6, condition: "ok", load: "buck", jammed: false },
          { name: "Double-Barrel Coach Gun", loaded: 2, capacity: 2, condition: "ok", load: "buck", jammed: false }
        ],
        spells: { cantrips: ["Powder Spark", "Alkali Bite", "Dust Mirage"], prepared: ["Powder Fan", "Iron Guard", "Dust Run"] },
        updatedAt: ago(8000)
      }
    },
    p_caleb: {
      id: "p_caleb",
      uid: "demo_caleb",
      presence: { online: true, lastSeen: ago(12000) },
      snapshot: {
        name: "Caleb \"Iron\" Marsh",
        player: "Sam",
        calling: "Gunfighter",
        callingId: "gunfighter",
        level: 4,
        subclass: "Deadeye",
        background: "Lawman",
        lineage: "Settler · Human",
        hpCurrent: 32,
        hpMax: 36,
        hpTemp: 0,
        portrait: portrait("C", "#243038"),
        conditions: "",
        deathSaves: { success: [false, false, false], fail: [false, false, false] },
        ac: 15,
        es: 890,
        shards: { white: 0, blue: 4, green: 1, yellow: 8, purple: 0 },
        abilities: { STR: 14, DEX: 16, CON: 14, INT: 10, WIS: 12, CHA: 8 },
        mods: { STR: 2, DEX: 3, CON: 2, INT: 0, WIS: 1, CHA: -1 },
        skills: { Athletics: 4, Perception: 3, Insight: 3, Survival: 3 },
        saves: { STR: 4, DEX: 5 },
        equipment: "Duster · Badge · Manacles · Spyglass · 40 cartridges",
        features: "Deadeye: bonus to ranged attacks after Aim.\nExtra Attack.",
        personality: "Quiet until the shooting starts.",
        guns: [
          { name: "Peacemaker", loaded: 6, capacity: 6, condition: "ok", load: "cartridge", jammed: false },
          { name: "Lever Rifle", loaded: 8, capacity: 10, atk: "+6", condition: "dirty", load: "cartridge", jammed: false, cracked: false, fouled: false, dirty: true, note: "Wear +1" }
        ],
        spells: { cantrips: [], prepared: [] },
        updatedAt: ago(15000)
      }
    },
    p_mira: {
      id: "p_mira",
      uid: "demo_mira",
      presence: { online: false, lastSeen: ago(180000) },
      snapshot: {
        name: "Mira Quill",
        player: "Jordan",
        calling: "Storyteller",
        callingId: "storyteller",
        level: 3,
        subclass: "Balladeer",
        background: "Entertainer",
        lineage: "Riverfolk · Half-Elf",
        hpCurrent: 0,
        hpMax: 21,
        hpTemp: 0,
        portrait: portrait("M", "#3a2430"),
        conditions: "Prone",
        deathSaves: { success: [true, false, false], fail: [true, false, false] },
        ac: 12,
        es: 210,
        shards: { white: 10, blue: 5, green: 3, yellow: 0, purple: 0 },
        abilities: { STR: 8, DEX: 14, CON: 12, INT: 12, WIS: 10, CHA: 16 },
        mods: { STR: -1, DEX: 2, CON: 1, INT: 1, WIS: 0, CHA: 3 },
        skills: { Performance: 5, Persuasion: 5, History: 3, Deception: 5 },
        saves: { DEX: 4, CHA: 5 },
        equipment: "Travel fiddle (Played in) · Fancy hat · Ink & journal · Rope 50ft",
        features: "Balladeer: inspire allies with a verse.\nInstrument as focus.",
        personality: "Never met a stage she didn't like.",
        guns: [
          { name: "Pocket Derringer", loaded: 2, capacity: 2, condition: "ok", load: "cartridge", jammed: false }
        ],
        spells: { cantrips: ["Wire Whisper", "Dust Mirage"], prepared: ["Trail Hymn", "Crowd Charm"] },
        updatedAt: ago(200000)
      }
    }
  };

  var ledger = [
    { id: "led1", ts: ago(600000), who: "Alex", playerName: "Alex", characterName: "Jolene \"Dusty\" Pike", playerId: "p_jolene", type: "es_gain", what: "Saloon · Whiskey Bend Blackjack win", oldVal: 3200, newVal: 3453, flag: false },
    { id: "led2", ts: ago(480000), who: "Sam", playerName: "Sam", characterName: "Caleb \"Iron\" Marsh", playerId: "p_caleb", type: "es_spend", what: "Bought leather jacket + ammo", oldVal: 1100, newVal: 890, flag: false },
    { id: "led3", ts: ago(360000), who: "DM", playerName: "Jordan", characterName: "Mira Quill", playerId: "p_mira", type: "dm_push", what: "Reward: +4 temp HP after the dust devil fight", oldVal: null, newVal: "+4 temp HP", flag: false },
    { id: "led4", ts: ago(240000), who: "Jordan", playerName: "Jordan", characterName: "Mira Quill", playerId: "p_mira", type: "manual", what: "Manual ES edit (found purse)", oldVal: 50, newVal: 210, flag: true },
    { id: "led5", ts: ago(120000), who: "DM", playerName: "Party", characterName: "Everyone", playerId: "all", type: "dm_push", what: "Session reward note: Magistrate's warrant posted", oldVal: null, newVal: "note", flag: false },
    { id: "led6", ts: ago(60000), who: "Alex", playerName: "Alex", characterName: "Jolene \"Dusty\" Pike", playerId: "p_jolene", type: "es_spend", what: "Saloon · Slot machine", oldVal: 3503, newVal: 3453, flag: false }
  ];

  var rolls = [
    { id: "r1", ts: ago(300000), who: "Alex", playerId: "p_jolene", uid: "demo_jolene", label: "Blacksnake attack", formula: "1d20+5", result: 18, detail: "13+5", nat1: false, isFirearm: true, private: false },
    { id: "r2", ts: ago(290000), who: "Alex", playerId: "p_jolene", uid: "demo_jolene", label: "Damage", formula: "2d6+3", result: 11, detail: "4+4+3", nat1: false, isFirearm: false, private: false },
    { id: "r3", ts: ago(200000), who: "Sam", playerId: "p_caleb", uid: "demo_caleb", label: "Peacemaker attack", formula: "1d20+7", result: 8, detail: "1+7", nat1: true, isFirearm: true, private: false },
    { id: "r4", ts: ago(90000), who: "DM", playerId: null, uid: "demo_dm", label: "Dust Devil Stealth", formula: "1d20+4", result: 15, detail: "11+4", nat1: false, isFirearm: false, private: true },
    { id: "r5", ts: ago(45000), who: "Jordan", playerId: "p_mira", uid: "demo_mira", label: "Persuasion (crowd)", formula: "1d20+5", result: 22, detail: "17+5", nat1: false, isFirearm: false, private: false }
  ];

  var messages = [
    { id: "m1", ts: ago(150000), from: "demo_dm", fromName: "DM", to: "p_jolene", toName: "Jolene", text: "You notice a green glint under the bar — Eldorite, maybe stolen.", read: true },
    { id: "m2", ts: ago(40000), from: "demo_dm", fromName: "DM", to: "p_caleb", toName: "Caleb", text: "The badge in your pocket feels warm. Someone's watching.", read: false }
  ];

  var handouts = [
    { id: "h1", ts: ago(500000), name: "Wanted poster — Dust Devil Gang", url: "https://placehold.co/600x800/1a1f22/3fbf9a?text=WANTED", to: "all", sent: true },
    { id: "h2", ts: ago(100000), name: "Map of Whiskey Bend", url: "https://placehold.co/800x500/1a1f22/b8862f?text=Whiskey+Bend+Map", to: "all", sent: true }
  ];

  var commands = [];

  root.DMCC_DEMO = {
    roomCode: "DUST-4821",
    meta: {
      code: "DUST-4821",
      name: "Whiskey Bend One-Shot",
      dmUid: "demo_dm",
      dmName: "Jessey",
      createdAt: ago(7200000),
      status: "live"
    },
    players: players,
    ledger: ledger,
    rolls: rolls,
    messages: messages,
    handouts: handouts,
    commands: commands,
    freshId: id
  };
})(typeof window !== "undefined" ? window : globalThis);

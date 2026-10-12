/* SSDNS rules data. GENERATED from BOOK1.md (sha1 5abfec3369bc) on 2026-10-05 21:57 CT by tools/build_rules.py. Do not hand-edit. */
window.SSDNS_RULES = {
 "meta": {
  "title": "Six-Shooters & Sorcery: Dust and Shadows",
  "short": "SSDNS",
  "source": "BOOK1.md",
  "sourceSha1": "5abfec3369bc",
  "builtAt": "2026-10-05 21:57 CT",
  "rulesVersion": 3,
  "currencyUnit": "ES",
  "note": "Generated from the live PHB markdown by tools/build_rules.py. Do not hand-edit; re-run the script."
 },
 "abilities": [
  {
   "id": "STR",
   "name": "Strength",
   "frontier": "Muscle & Haul"
  },
  {
   "id": "DEX",
   "name": "Dexterity",
   "frontier": "Quick Iron & Balance"
  },
  {
   "id": "CON",
   "name": "Constitution",
   "frontier": "Dust Lung & Grit"
  },
  {
   "id": "INT",
   "name": "Intelligence",
   "frontier": "Book, Cipher & Claim Map"
  },
  {
   "id": "WIS",
   "name": "Wisdom",
   "frontier": "Trail Eye & Nerve"
  },
  {
   "id": "CHA",
   "name": "Charisma",
   "frontier": "Presence & Pay Tongue"
  }
 ],
 "skills": [
  {
   "name": "Acrobatics",
   "ability": "DEX"
  },
  {
   "name": "Animal Handling",
   "ability": "WIS"
  },
  {
   "name": "Arcana",
   "ability": "INT"
  },
  {
   "name": "Athletics",
   "ability": "STR"
  },
  {
   "name": "Deception",
   "ability": "CHA"
  },
  {
   "name": "History",
   "ability": "INT"
  },
  {
   "name": "Insight",
   "ability": "WIS"
  },
  {
   "name": "Intimidation",
   "ability": "CHA"
  },
  {
   "name": "Investigation",
   "ability": "INT"
  },
  {
   "name": "Medicine",
   "ability": "WIS"
  },
  {
   "name": "Nature",
   "ability": "INT"
  },
  {
   "name": "Perception",
   "ability": "WIS"
  },
  {
   "name": "Performance",
   "ability": "CHA"
  },
  {
   "name": "Persuasion",
   "ability": "CHA"
  },
  {
   "name": "Religion",
   "ability": "INT"
  },
  {
   "name": "Sleight of Hand",
   "ability": "DEX"
  },
  {
   "name": "Stealth",
   "ability": "DEX"
  },
  {
   "name": "Survival",
   "ability": "WIS"
  }
 ],
 "lineages": [
  {
   "id": "mountain-folk",
   "name": "Mountain Folk",
   "race5e": "Dwarf",
   "src": "BOOK1.md line 329",
   "asi": "Your Constitution score increases by 2.",
   "speed": 25,
   "speedText": "Your base walking speed is 25 feet. Your speed is not reduced by wearing heavy armor (reinforced leathers / plated dusters count).",
   "size": "Medium. Stockier than average; still human-scale.",
   "traits": [
    {
     "name": "Darkvision (Lamp-Eye)",
     "text": "Years in bad light taught your eyes. You can see in dim light within 60 feet as if it were bright light, and in darkness as if it were dim light. You can’t discern color in darkness, only shades of gray."
    },
    {
     "name": "Stone Sense (Stonecunning)",
     "text": "Whenever you make an Intelligence (History) check related to the origin of stonework — mines, tunnels, shaft walls, cut rock — you are considered proficient and add double your proficiency bonus."
    },
    {
     "name": "Hard Liver",
     "text": "You have advantage on saving throws against poison, and you have resistance against poison damage."
    },
    {
     "name": "Clan Weapons (Dwarven Combat Training)",
     "text": "You have proficiency with the battleaxe, handaxe, light hammer, and warhammer, and with the shotgun."
    },
    {
     "name": "Miner’s Tools (Tool Proficiency)",
     "text": "You gain proficiency with one of the following of your choice: smith’s tools, brewer’s supplies, or mason’s tools."
    }
   ],
   "languages": "You can speak, read, and write Common and one settler language from your lineage's row on the Accents & Languages table (German or Welsh).",
   "sublineages": [
    {
     "id": "gold-miner",
     "name": "Gold Miner",
     "phb5e": "Hill Dwarf",
     "asi": "Your Wisdom score increases by 1.",
     "traits": [
      {
       "name": "Tough as Ore",
       "text": "Your hit point maximum increases by 1, and it increases by 1 every time you gain a level."
      }
     ],
     "src": "BOOK1.md line 379"
    },
    {
     "id": "coal-miner",
     "name": "Coal Miner",
     "phb5e": "Mountain Dwarf",
     "asi": "Your Strength score increases by 2.",
     "traits": [
      {
       "name": "Reinforced Kit",
       "text": "You have proficiency with light and medium armor (reinforced leathers / plated dusters)."
      }
     ],
     "src": "BOOK1.md line 387"
    }
   ],
   "age": "Mountain Folk mature in their late teens like other folk. Hardy stock often carries them into their eighties or nineties — a little longer than most frontier folk, if the rock doesn’t take them first."
  },
  {
   "id": "aristocrats",
   "name": "Aristocrats",
   "race5e": "Elf",
   "src": "BOOK1.md line 397",
   "asi": "Your Dexterity score increases by 2.",
   "speed": 30,
   "speedText": "Your base walking speed is 30 feet.",
   "size": "Medium. Tall and slim by frontier standards, but still human-sized.",
   "traits": [
    {
     "name": "Darkvision (Night-Court Eyes)",
     "text": "Accustomed to dim parlours and under-city light, you can see in dim light within 60 feet as if it were bright light, and in darkness as if it were dim light. You can’t discern color in darkness, only shades of gray."
    },
    {
     "name": "Keen Eye (Keen Senses)",
     "text": "You have proficiency in the Perception skill."
    },
    {
     "name": "Cold Blood (Fey Ancestry)",
     "text": "You have advantage on saving throws against being charmed, and magic can’t put you to sleep. Court nerves — not fairy blood."
    },
    {
     "name": "Light Sleeper (Trance)",
     "text": "Aristocrats don’t need a full night the way Nomads do. You can finish a long rest in 4 hours of light sleep / watch-rest (as PHB Trance). After resting this way, you gain the same benefit a Nomad does from 8 hours of sleep."
    }
   ],
   "languages": "You can speak, read, and write Common and one settler language from your lineage's row on the Accents & Languages table (French or Latin).",
   "sublineages": [
    {
     "id": "high-house",
     "name": "High House",
     "phb5e": "High Elf",
     "asi": "Your Intelligence score increases by 1.",
     "traits": [
      {
       "name": "House Arms",
       "text": "You have proficiency with the longsword, shortsword, shortbow, and longbow (saber, slim iron, light rifle / hunting bow per table)."
      },
      {
       "name": "Parlour Cantrip",
       "text": "You know one cantrip of your choice from the wizard spell list. Intelligence is your spellcasting ability for it. Dying magic — still works for you… for now."
      },
      {
       "name": "Extra Language",
       "text": "You can speak, read, and write one extra language of your choice."
      }
     ],
     "src": "BOOK1.md line 446"
    },
    {
     "id": "greenwood-kin",
     "name": "Greenwood Kin",
     "phb5e": "Wood Elf",
     "asi": "Your Wisdom score increases by 1.",
     "traits": [
      {
       "name": "Fleet Feet",
       "text": "Your base walking speed increases to 35 feet."
      },
      {
       "name": "House Arms",
       "text": "You have proficiency with the longsword, shortsword, shortbow, and longbow."
      },
      {
       "name": "Mask of the Wild",
       "text": "You can attempt to hide even when you are only lightly obscured by foliage, heavy rain, falling snow, mist, and other natural phenomena (scrub, dust-haze, and bosque count)."
      }
     ],
     "src": "BOOK1.md line 462",
     "speed": 35
    },
    {
     "id": "night-house",
     "name": "Night House",
     "phb5e": "Drow",
     "asi": "Your Charisma score increases by 1.",
     "traits": [
      {
       "name": "Superior Darkvision",
       "text": "Your darkvision has a radius of 120 feet."
      },
      {
       "name": "Sunlight Sensitivity",
       "text": "You have disadvantage on attack rolls and on Wisdom (Perception) checks that rely on sight when you, the target of your attack, or whatever you are trying to perceive is in direct sunlight."
      },
      {
       "name": "Night House Magic (Drow Magic)",
       "text": "You know the thaumaturgy cantrip. When you reach 3rd level, you can cast faerie fire once per long rest; at 5th level, darkness once per long rest. Charisma is your spellcasting ability for these spells."
      }
     ],
     "src": "BOOK1.md line 478"
    }
   ],
   "age": "Aristocrats mature in their late teens like other folk. Careful living and old-house habits may carry some into their eighties or nineties — if dust and lead don’t decide first."
  },
  {
   "id": "farmers",
   "name": "Farmers",
   "race5e": "Halfling",
   "src": "BOOK1.md line 498",
   "asi": "Your Dexterity score increases by 2.",
   "speed": 25,
   "speedText": "Your base walking speed is 25 feet.",
   "size": "Small. Between 3 and 4 feet tall on average; still human, just short by frontier standards.",
   "traits": [
    {
     "name": "Lucky",
     "text": "When you roll a 1 on an attack roll, ability check, or saving throw, you can reroll the die and must use the new roll."
    },
    {
     "name": "Brave",
     "text": "You have advantage on saving throws against being frightened."
    },
    {
     "name": "Nimble Step (Halfling Nimbleness)",
     "text": "You can move through the space of any creature that is of a size larger than yours."
    }
   ],
   "languages": "You can speak, read, and write Common and one settler language from your lineage's row on the Accents & Languages table (Irish Gaelic or Spanish).",
   "sublineages": [
    {
     "id": "hetfield",
     "name": "Hetfield",
     "phb5e": "Lightfoot",
     "asi": "Your Charisma score increases by 1.",
     "traits": [
      {
       "name": "Naturally Stealthy",
       "text": "You can attempt to hide even when you are obscured only by a creature that is at least one size larger than you."
      }
     ],
     "src": "BOOK1.md line 540"
    },
    {
     "id": "maccoy",
     "name": "MacCoy",
     "phb5e": "Stout",
     "asi": "Your Constitution score increases by 1.",
     "traits": [
      {
       "name": "Stout Resilience",
       "text": "You have advantage on saving throws against poison, and you have resistance against poison damage."
      }
     ],
     "src": "BOOK1.md line 552"
    }
   ],
   "age": "Farmers reach adulthood around 20 and often live into their seventies or eighties on hard seasons — if famine and lead don’t shorten the tally."
  },
  {
   "id": "nomads",
   "name": "Nomads",
   "race5e": "Human",
   "src": "BOOK1.md line 570",
   "asi": "Your ability scores each increase by 1.",
   "speed": 30,
   "speedText": "Your base walking speed is 30 feet.",
   "size": "Medium. Varies widely; still human-scale.",
   "traits": [
    {
     "name": "Extra Language",
     "text": "You can speak, read, and write one extra language of your choice."
    }
   ],
   "languages": "You can speak, read, and write Common and Trail Tongue (see the Accents & Languages table).",
   "sublineages": [
    {
     "id": "variant-human",
     "name": "Variant Human",
     "phb5e": "optional",
     "asi": "Two different ability scores of your choice increase by 1.",
     "traits": [
      {
       "name": "Skills",
       "text": "You gain proficiency in one skill of your choice."
      },
      {
       "name": "Feat",
       "text": "You gain one feat of your choice."
      }
     ],
     "src": "BOOK1.md line 608"
    }
   ],
   "age": "Nomads reach adulthood in their late teens and live less than a century — same as any hard-lived frontier human."
  },
  {
   "id": "camp-kin",
   "name": "Camp Kin",
   "race5e": "Dragonborn",
   "src": "BOOK1.md line 625",
   "asi": "Your Strength score increases by 2, and your Charisma score increases by 1.",
   "speed": 30,
   "speedText": "Your base walking speed is 30 feet.",
   "size": "Medium. Often broad-shouldered from kit and drill; still human-scale.",
   "traits": [
    {
     "name": "Ancestral Affinity (Draconic Ancestry)",
     "text": "Your family’s regiment taught one trick, and it has been handed down ever since. Pick one damage type from the PHB Dragonborn ancestry table. It sets your trick’s shape, its saving throw, and the damage you resist. Fire comes from rotgut or lamp oil lit by the spark in your blood. Acid comes from a lye mix that the spark turns caustic. Poison is a mist of chewing tobacco and snake venom. Cold comes from a pinch of frost salt that the spark freezes in a flash. Lightning comes from a copper coin on your tongue that the spark arcs through."
    },
    {
     "name": "Breath Weapon (Fire-Eater’s Trick)",
     "text": "Every Camp Kin family keeps a secret, which is a mix, a word, and a way of breathing that wakes the last spark of the old blood. Most people think it’s a sideshow act, and partly it is. The mix and the practice are real, but what comes out burns hotter than lamp oil ever should. You can use your action to breathe it out. Your Ancestral Affinity determines the size, shape, and damage type (as PHB Dragonborn). When you use your breath weapon, each creature in the area must make a saving throw (DC = 8 + your Constitution modifier + your proficiency bonus). A creature takes 2d6 damage on a failed save, and half as much on a successful one. The damage increases to 3d6 at 6th level, 4d6 at 11th, and 5d6 at 16th. The spark costs something. Once you use it, you can’t do it again until you finish a long rest."
    },
    {
     "name": "Ward Skin (Damage Resistance)",
     "text": "You have resistance to the damage type associated with your Ancestral Affinity."
    }
   ],
   "languages": "You can speak, read, and write Common and one settler language from your lineage's row on the Accents & Languages table (German or Russian).",
   "sublineages": [],
   "age": "Camp Kin mature by twenty and live about as long as other hard humans — drill shortens some lives; stubbornness lengthens others."
  },
  {
   "id": "merchants",
   "name": "Merchants",
   "race5e": "Gnome",
   "src": "BOOK1.md line 673",
   "asi": "Your Intelligence score increases by 2.",
   "speed": 25,
   "speedText": "Your base walking speed is 25 feet.",
   "size": "Small. Between 3 and 4 feet tall on average; still human, just short by frontier standards.",
   "traits": [
    {
     "name": "Darkvision (Spark-Light Eyes)",
     "text": "Accustomed to forge-glow and lamp work, you can see in dim light within 60 feet as if it were bright light, and in darkness as if it were dim light. You can’t discern color in darkness, only shades of gray."
    },
    {
     "name": "Cunning (Gnome Cunning)",
     "text": "You have advantage on all Intelligence, Wisdom, and Charisma saving throws against magic."
    }
   ],
   "languages": "You can speak, read, and write Common and one settler language from your lineage's row on the Accents & Languages table (Cantonese, German, or Italian).",
   "sublineages": [
    {
     "id": "clockmaker",
     "name": "Clockmaker",
     "phb5e": "Rock Gnome",
     "asi": "Your Constitution score increases by 1.",
     "traits": [
      {
       "name": "Artificer’s Lore",
       "text": "Whenever you make an Intelligence (History) check related to magic items, alchemical objects, or technological devices, you can add twice your proficiency bonus instead of any proficiency bonus you normally apply."
      },
      {
       "name": "Tinker",
       "text": "You have proficiency with artisan’s tools (tinker’s tools). Using those tools, you can spend 1 hour and 1,000 ES worth of materials to construct a Tiny clockwork device (as PHB Rock Gnome Tinker: clockwork toy, fire starter, or music box, or any small frontier gadget you can describe). The device functions for 24 hours unless you spend 1 hour repairing it to keep it working. You can have up to three such devices active at a time."
      }
     ],
     "src": "BOOK1.md line 712"
    },
    {
     "id": "toymaker",
     "name": "Toymaker",
     "phb5e": "Forest Gnome",
     "asi": "Your Dexterity score increases by 1.",
     "traits": [
      {
       "name": "Natural Illusionist",
       "text": "You know the minor illusion cantrip. Intelligence is your spellcasting ability for it."
      },
      {
       "name": "Varmint-Whisper (Speak with Small Beasts)",
       "text": "Through sounds and gestures, you can communicate simple ideas with Small or smaller beasts."
      }
     ],
     "src": "BOOK1.md line 726"
    }
   ],
   "age": "Merchants mature at a similar pace to Nomads. Careful indoor work may carry some into their eighties — if the road and the ledger don’t settle it sooner."
  },
  {
   "id": "diplomats",
   "name": "Diplomats",
   "race5e": "Half-Elf",
   "src": "BOOK1.md line 745",
   "asi": "Your Charisma score increases by 2, and two other ability scores of your choice increase by 1.",
   "speed": 30,
   "speedText": "Your base walking speed is 30 feet.",
   "size": "Medium. Varies; still human-scale.",
   "traits": [
    {
     "name": "Darkvision",
     "text": "Thanks to mixed Neverwinter ward blood, you can see in dim light within 60 feet as if it were bright light, and in darkness as if it were dim light. You can’t discern color in darkness, only shades of gray."
    },
    {
     "name": "Fey-Blood Calm (Fey Ancestry)",
     "text": "You have advantage on saving throws against being charmed, and magic can’t put you to sleep."
    },
    {
     "name": "Versatile (Skill Versatility)",
     "text": "You gain proficiency in two skills of your choice."
    }
   ],
   "languages": "You can speak, read, and write Common, one settler language from your lineage's row on the Accents & Languages table (Spanish or French), and one extra language of your choice.",
   "sublineages": [],
   "age": "Diplomats mature at about the same rate as Nomads and often reach their seventies or eighties — if politics don’t cut that short."
  },
  {
   "id": "pioneers",
   "name": "Pioneers",
   "race5e": "Half-Orc",
   "src": "BOOK1.md line 792",
   "asi": "Your Strength score increases by 2, and your Constitution score increases by 1.",
   "speed": 30,
   "speedText": "Your base walking speed is 30 feet.",
   "size": "Medium. Often larger and heavier than average; still human-scale.",
   "traits": [
    {
     "name": "Darkvision",
     "text": "You can see in dim light within 60 feet as if it were bright light, and in darkness as if it were dim light. You can’t discern color in darkness, only shades of gray."
    },
    {
     "name": "Menacing",
     "text": "You gain proficiency in the Intimidation skill."
    },
    {
     "name": "Relentless (Relentless Endurance)",
     "text": "When you are reduced to 0 hit points but not killed outright, you can drop to 1 hit point instead. You can’t use this feature again until you finish a long rest."
    },
    {
     "name": "Savage Hits (Savage Attacks)",
     "text": "When you score a critical hit with a melee weapon attack, you can roll one of the weapon’s damage dice one additional time and add it to the extra damage of the critical hit."
    }
   ],
   "languages": "You can speak, read, and write Common and one settler language from your lineage's row on the Accents & Languages table (Swedish, Norwegian, or Dutch).",
   "sublineages": [],
   "age": "Pioneers mature a little faster than soft-city folk and rarely see a quiet old age — but some outlast every range war they walk into."
  },
  {
   "id": "street-folk",
   "name": "Street Folk",
   "race5e": "Tiefling",
   "src": "BOOK1.md line 843",
   "asi": "Your Intelligence score increases by 1, and your Charisma score increases by 2.",
   "speed": 30,
   "speedText": "Your base walking speed is 30 feet.",
   "size": "Medium. Varies; still human-scale.",
   "traits": [
    {
     "name": "Darkvision",
     "text": "You can see in dim light within 60 feet as if it were bright light, and in darkness as if it were dim light. You can’t discern color in darkness, only shades of gray."
    },
    {
     "name": "Hellish Resistance",
     "text": "You have resistance to fire damage."
    },
    {
     "name": "Infernal Legacy",
     "text": "You know the thaumaturgy cantrip. When you reach 3rd level, you can cast hellish rebuke as a 2nd-level spell once with this trait and regain the ability to do so when you finish a long rest. When you reach 5th level, you can cast darkness once with this trait and regain the ability to do so when you finish a long rest. Charisma is your spellcasting ability for these spells. Flavour as curse-blood, powder-hex, or dying hell-pact scrap that still sparks."
    }
   ],
   "languages": "You can speak, read, and write Common and one settler language from your lineage's row on the Accents & Languages table (Italian or Polish).",
   "sublineages": [],
   "age": "Street Folk mature at the same rate as other humans and live about as long — if rope, lead, or Blackwood heat don’t settle the account early."
  }
 ],
 "callings": [
  {
   "id": "tribal-warrior",
   "name": "Tribal Warrior",
   "class5e": "Barbarian",
   "src": "BOOK1.md line 923",
   "hitDie": "d12",
   "primary": "Str",
   "saves": [
    "STR",
    "CON"
   ],
   "spellAbility": null,
   "caster": null,
   "proficiencies": "Hit Die: 1d12 per level · HP at 1st Level: 12 + Con mod · Proficiencies & Kit: Light & medium armor, shields (no heavy) · Simple & martial weapons (guns included), throwing hatchets · Greataxe (buffalo axe), 2 handaxes, explorer pack, 4 javelins.",
   "armorProf": "Light & medium armor, shields (no heavy)",
   "weaponProf": "Simple & martial weapons (guns included), throwing hatchets",
   "kit": "Greataxe (buffalo axe), 2 handaxes, explorer pack, 4 javelins.",
   "features": [
    {
     "name": "Dust Fury (Rage - 1st lvl)",
     "text": "Bonus action to enter fury. Gain advantage on Str checks/saves, bonus damage on Strength melee attacks only (+2 to +4; never on gun, bow, or thrown attacks), and resistance to bludgeoning, piercing, and slashing. Heavy armor prevents fury."
    },
    {
     "name": "Hard Hide (Unarmored Defense - 1st lvl)",
     "text": "Unarmored AC = 10 + Dex mod + Con mod (shields allowed)."
    },
    {
     "name": "All-In Swing (Reckless Attack - 2nd lvl)",
     "text": "Advantage on melee Str attacks; attacks against you gain advantage until next turn."
    },
    {
     "name": "Trail Instinct (Danger Sense - 2nd lvl)",
     "text": "Advantage on Dex saves vs visible hazards (dynamite blasts, pit traps, sudden ambushes)."
    },
    {
     "name": "Extra Attack & Fast Movement (5th lvl)",
     "text": "Attack twice per Attack action. Speed increases by +10 ft while not wearing heavy armor."
    },
    {
     "name": "Feral Instinct (7th lvl)",
     "text": "Advantage on initiative. If surprised, you can act normally on your first turn if you enter Dust Fury first."
    },
    {
     "name": "Lead & Levers: Firearms, Reloads & Cover",
     "text": "Take Cover: anyone can, as a bonus action (see Take Cover in Equipment); stacks on half / three-quarters cover. Six-Shooters & Reloads: 6-shot capacity. Reloading takes an action. Extra Attack allows an extra trigger pull. Fury vs. Firearm: You can shoot any gun you're proficient with, but Dust Fury damage, All-In Swing, and Frenzy only work in melee. When cartridges click empty, closing with a buffalo axe ends shootouts immediately."
    }
   ],
   "subclasses": [
    {
     "id": "path-of-the-war-chief-berserker",
     "name": "Path of the War Chief",
     "phb5e": "Berserker",
     "features": [
      {
       "name": "Frenzy (3rd level)",
       "text": "In Dust Fury, make a bonus action melee attack each turn. Suffer 1 exhaustion level when fury ends."
      },
      {
       "name": "Iron Nerve (6th level)",
       "text": "Immune to charm and fright while in fury; active conditions suspended."
      },
      {
       "name": "Gallows Glare (10th level)",
       "text": "Action to terrify a creature within 30 ft (Wis save vs 8 + prof + Cha mod)."
      },
      {
       "name": "Hair Trigger (14th level)",
       "text": "Reaction to strike back immediately when damaged by a foe within 5 ft."
      }
     ],
     "src": "BOOK1.md line 997"
    },
    {
     "id": "totem-warrior",
     "name": "Totem Warrior",
     "phb5e": "",
     "features": [
      {
       "name": "Spirit Seeker (3rd level)",
       "text": "Cast Beast Sense and Speak with Animals as rituals."
      },
      {
       "name": "Totem Spirit (3rd level)",
       "text": "Iron Buffalo (Bear): Damage resistance except psychic. Ridge Hawk (Eagle): Dash as bonus action; disadv on opportunity attacks. Prairie Wolf (Wolf): Allies gain adv on melee attacks vs foes within 5 ft."
      },
      {
       "name": "Aspect of the Beast (6th level)",
       "text": "Buffalo (double carry capacity), Hawk (mile-long vision), Wolf (fast tracking)."
      },
      {
       "name": "Spirit Walker (10th level)",
       "text": "Cast Commune with Nature (Read the Land) as a ritual."
      },
      {
       "name": "Totemic Attunement (14th level)",
       "text": "Buffalo (while in fury, foes within 5 ft have disadvantage attacking anyone but you), Hawk (fly speed in fury), Wolf (bonus-action knockdown on a melee hit)."
      }
     ],
     "src": "BOOK1.md line 1006"
    }
   ],
   "progression": {
    "columns": [
     "Level",
     "Prof.",
     "Features",
     "Rages",
     "Rage Dmg"
    ],
    "rows": [
     [
      "1st",
      "+2",
      "Dust Fury, Hard Hide",
      "2",
      "+2"
     ],
     [
      "2nd",
      "+2",
      "All-In Swing, Trail Instinct",
      "2",
      "+2"
     ],
     [
      "3rd",
      "+2",
      "Primal Path",
      "3",
      "+2"
     ],
     [
      "4th",
      "+2",
      "Ability Score Improvement",
      "3",
      "+2"
     ],
     [
      "5th",
      "+3",
      "Extra Attack, Fast Movement",
      "3",
      "+2"
     ],
     [
      "6th",
      "+3",
      "Path feature",
      "4",
      "+2"
     ],
     [
      "7th",
      "+3",
      "Feral Instinct",
      "4",
      "+2"
     ],
     [
      "8th",
      "+3",
      "Ability Score Improvement",
      "4",
      "+2"
     ],
     [
      "9th",
      "+4",
      "Brutal Critical (1 die)",
      "4",
      "+3"
     ],
     [
      "10th",
      "+4",
      "Path feature",
      "4",
      "+3"
     ],
     [
      "11th",
      "+4",
      "Relentless Rage",
      "4",
      "+3"
     ],
     [
      "12th",
      "+4",
      "Ability Score Improvement",
      "5",
      "+3"
     ],
     [
      "13th",
      "+5",
      "Brutal Critical (2 dice)",
      "5",
      "+3"
     ],
     [
      "14th",
      "+5",
      "Path feature",
      "5",
      "+3"
     ],
     [
      "15th",
      "+5",
      "Persistent Rage",
      "5",
      "+3"
     ],
     [
      "16th",
      "+5",
      "Ability Score Improvement",
      "5",
      "+4"
     ],
     [
      "17th",
      "+6",
      "Brutal Critical (3 dice)",
      "6",
      "+4"
     ],
     [
      "18th",
      "+6",
      "Indomitable Might",
      "6",
      "+4"
     ],
     [
      "19th",
      "+6",
      "Ability Score Improvement",
      "6",
      "+4"
     ],
     [
      "20th",
      "+6",
      "Primal Champion",
      "Unlimited",
      "+4"
     ]
    ]
   },
   "multiclass": "Prerequisite: Strength 13. Western archetypes and frontier flavor apply directly.",
   "hexLeadRest": null
  },
  {
   "id": "storyteller",
   "name": "Storyteller",
   "class5e": "Bard",
   "src": "BOOK1.md line 1025",
   "hitDie": "d8",
   "primary": "Cha",
   "saves": [
    "DEX",
    "CHA"
   ],
   "spellAbility": "CHA",
   "caster": "full",
   "proficiencies": "Hit Die: 1d8 per level · HP at 1st Level: 8 + Con mod · Proficiencies & Kit: Light armor · Simple weapons, Herringer pistols, cavalry sabers, fencing irons, Bowie knives · Three musical instruments (your voice can be one) · Fiddle/banjo/guitar with a strap and one spare set of strings, diplomat trunk or saloon kit, duster, boot knife.",
   "armorProf": "Light armor",
   "weaponProf": "Simple weapons, Herringer pistols, cavalry sabers, fencing irons, Bowie knives",
   "kit": "Three musical instruments (your voice can be one) · Fiddle/banjo/guitar with a strap and one spare set of strings, diplomat trunk or saloon kit, duster, boot knife.",
   "features": [
    {
     "name": "Rally Word / Saloon Courage (1st lvl)",
     "text": "Bonus action to stir grit in an ally within 60 ft. They add your Inspiration die (d6, scales to d8, d10, d12) to an ability check, attack roll, or save within 10 minutes."
    },
    {
     "name": "Jack of All Trails (2nd lvl)",
     "text": "Add half proficiency bonus (rounded down) to any ability check that doesn't already include it."
    },
    {
     "name": "Campfire Measure (2nd lvl)",
     "text": "During short rests, soothing tunes and trail stories help wounded comrades recover an extra 1d6 HP (scales at higher levels)."
    },
    {
     "name": "Counter-Tune (6th lvl)",
     "text": "Action to start a commanding shout or melody, granting allies within 30 ft advantage on saves vs charm and fright."
    },
    {
     "name": "Stolen Sparks (10th lvl)",
     "text": "Learn two spells from any class list (at 10th, 14th, and 18th level). The Weave does not care who wrote the sheet music."
    },
    {
     "name": "Dying Weave Spellcasting",
     "text": "Charisma spellcasting channeled through ballads, harmonic riffs, and rhythmic tall tales. Focus: your Calling instrument. At character creation, pick ONE of your instruments (guitar, harmonica, fiddle, banjo, accordion, or your voice). Playing it is the somatic component. A Storyteller can also play any piano they find. To make a different instrument your Calling instrument, spend a long rest playing it. No outlet, no power: gagged, with a broken or lost instrument, you can't cast. See Storyteller Gear (Equipment) for straps, cases, strings and Wear & Tear. - Instrument: spells use their full range. Playing takes both hands, so you can't play and fire a weapon on the same turn. Once per short rest, add your Rally Word die to one target's save DC. - Voice: your hands stay free, but everyone knows you're the caster. A gag or Silence shuts you down, and spells that target a creature reach only 30 ft (area spells use their normal range). - Rally Word and Cutting Words always work by spoken word. If you aren't proficient with voice, roll the Inspiration die twice and use the lower result."
    },
    {
     "name": "The Whisper Network & The Circuit",
     "text": "On the frontier, Storytellers are the living press. While Blackwood company magistrates control telegraph lines and government officials publish sanitized notices, traveling saloon singers and rail fiddlers transmit the real truth—claim disputes, union strikes, outlaw movements, and vanishing settlements—long before ink dries on broadsheets."
    }
   ],
   "subclasses": [
    {
     "id": "college-of-campfire-lore-lore",
     "name": "College of Campfire Lore",
     "phb5e": "Lore",
     "features": [
      {
       "name": "Bonus Proficiencies (3rd level)",
       "text": "Gain proficiency in three skills of your choice."
      },
      {
       "name": "Cutting Words / Heckle (3rd level)",
       "text": "Reaction to expend an Inspiration die and subtract it from an enemy's attack roll, ability check, or damage roll within 60 ft."
      },
      {
       "name": "Additional Stolen Sparks (6th level)",
       "text": "Learn two spells from any class list (3rd level or lower)."
      },
      {
       "name": "Peerless Skill (14th level)",
       "text": "When making an ability check, expend an Inspiration die and add it to your d20 roll after seeing the number."
      }
     ],
     "src": "BOOK1.md line 1106"
    },
    {
     "id": "college-of-the-rag-time-valor",
     "name": "College of the Rag Time",
     "phb5e": "Valor",
     "features": [
      {
       "name": "Frontier Combat Training (3rd level)",
       "text": "Gain proficiency with medium armor, shields, and martial weapons (shotguns, carbines, sabers)."
      },
      {
       "name": "Combat Inspiration (3rd level)",
       "text": "Allies can add your Rally Word die to weapon damage rolls, or use a reaction to add it to their AC against an attack."
      },
      {
       "name": "Extra Attack (Double Action - 6th level)",
       "text": "Attack twice whenever taking the Attack action on your turn."
      },
      {
       "name": "Rag Time Battle Magic (14th level)",
       "text": "When you cast a bard spell as an action, make one weapon attack as a bonus action."
      }
     ],
     "src": "BOOK1.md line 1115"
    }
   ],
   "progression": {
    "columns": [
     "Level",
     "Prof.",
     "Features",
     "Insp. Die",
     "Cantrips",
     "Spells Known",
     "Slots (1st–5th · 6th–9th)"
    ],
    "rows": [
     [
      "1st",
      "+2",
      "Spellcasting, Rally Word (d6)",
      "d6",
      "2",
      "4",
      "2 — — — —"
     ],
     [
      "2nd",
      "+2",
      "Jack of All Trails, Campfire Measure",
      "d6",
      "2",
      "5",
      "3 — — — —"
     ],
     [
      "3rd",
      "+2",
      "Bard College, Expertise",
      "d6",
      "2",
      "6",
      "4 2 — — —"
     ],
     [
      "4th",
      "+2",
      "Ability Score Improvement",
      "d6",
      "3",
      "7",
      "4 3 — — —"
     ],
     [
      "5th",
      "+3",
      "Rally Word (d8), Font of Inspiration",
      "d8",
      "3",
      "8",
      "4 3 2 — —"
     ],
     [
      "6th",
      "+3",
      "Counter-Tune, College Feature",
      "d8",
      "3",
      "9",
      "4 3 3 — —"
     ],
     [
      "7th",
      "+3",
      "—",
      "d8",
      "3",
      "10",
      "4 3 3 1 —"
     ],
     [
      "8th",
      "+3",
      "Ability Score Improvement",
      "d8",
      "3",
      "11",
      "4 3 3 2 —"
     ],
     [
      "9th",
      "+4",
      "Campfire Measure (d8)",
      "d8",
      "3",
      "12",
      "4 3 3 3 1"
     ],
     [
      "10th",
      "+4",
      "Rally Word (d10), Expertise, Stolen Sparks",
      "d10",
      "4",
      "14",
      "4 3 3 3 2"
     ],
     [
      "11th",
      "+4",
      "—",
      "d10",
      "4",
      "15",
      "4 3 3 3 2 · 1 — — —"
     ],
     [
      "12th",
      "+4",
      "Ability Score Improvement",
      "d10",
      "4",
      "15",
      "4 3 3 3 2 · 1 — — —"
     ],
     [
      "13th",
      "+5",
      "Campfire Measure (d10)",
      "d10",
      "4",
      "16",
      "4 3 3 3 2 · 1 1 — —"
     ],
     [
      "14th",
      "+5",
      "College Feature, Stolen Sparks",
      "d10",
      "4",
      "18",
      "4 3 3 3 2 · 1 1 — —"
     ],
     [
      "15th",
      "+5",
      "Rally Word (d12)",
      "d12",
      "4",
      "19",
      "4 3 3 3 2 · 1 1 1 —"
     ],
     [
      "16th",
      "+5",
      "Ability Score Improvement",
      "d12",
      "4",
      "19",
      "4 3 3 3 2 · 1 1 1 —"
     ],
     [
      "17th",
      "+6",
      "Campfire Measure (d12)",
      "d12",
      "4",
      "20",
      "4 3 3 3 2 · 1 1 1 1"
     ],
     [
      "18th",
      "+6",
      "Stolen Sparks",
      "d12",
      "4",
      "22",
      "4 3 3 3 3 · 1 1 1 1"
     ],
     [
      "19th",
      "+6",
      "Ability Score Improvement",
      "d12",
      "4",
      "22",
      "4 3 3 3 3 · 2 1 1 1"
     ],
     [
      "20th",
      "+6",
      "Superior Inspiration",
      "d12",
      "4",
      "22",
      "4 3 3 3 3 · 2 2 1 1"
     ]
    ]
   },
   "multiclass": "Prerequisite: Charisma 13. Western archetypes and frontier flavor apply directly.",
   "hexLeadRest": "long"
  },
  {
   "id": "frontier-preacher",
   "name": "Frontier Preacher",
   "class5e": "Cleric",
   "src": "BOOK1.md line 1130",
   "hitDie": "d8",
   "primary": "Wis",
   "saves": [
    "WIS",
    "CHA"
   ],
   "spellAbility": "WIS",
   "caster": "full",
   "proficiencies": "Hit Die: 1d8 per level · Proficiencies & Kit: Light, medium armor, shields (chain mail if proficient) · Simple weapons · Mace or chapel hammer, plated duster or scale mail, light rifle or Single-Barrel Farm Shotgun (chambered .410), priest kit, carved holy symbol.",
   "armorProf": "Light, medium armor, shields (chain mail if proficient)",
   "weaponProf": "Simple weapons",
   "kit": "Mace or chapel hammer, plated duster or scale mail, light rifle or Single-Barrel Farm Shotgun (chambered .410), priest kit, carved holy symbol.",
   "features": [
    {
     "name": "Circuit Magic (1st level)",
     "text": "Wisdom spellcasting; ritual casting. Your power is faith in your god: miracles answered through prayer. It's the one Calling where an outside power can give it, or take it away. Focus: a holy symbol to fit your faith (trail Bible, rosary, cross, or medicine bundle)."
    },
    {
     "name": "Crisis of Faith",
     "text": "Break your creed, and you can't cast spells above 1st level until you atone. Your DM decides what atonement takes."
    },
    {
     "name": "Channel the Creed (2nd level)",
     "text": "Channel Divinity once per short/long rest: Turn the Unquiet (turn undead/dust-wights) plus Domain feature."
    },
    {
     "name": "Divine Strike / Potent Spellcasting (8th level)",
     "text": "Empower your weapons with radiant fire or add Wisdom modifier to cantrip damage."
    },
    {
     "name": "Divine Intervention (10th level)",
     "text": "Implore your patron deity or saint to intercede directly on the frontier."
    },
    {
     "name": "The Circuit Rider's Code",
     "text": "Frontier Preachers are rarely attached to a single chapel. They ride between remote mining camps and rail towns carrying sacramental whiskey, quinine, and a loaded farm shotgun to protect their flock from rustlers and dust-wights alike."
    }
   ],
   "subclasses": [
    {
     "id": "domain-of-the-faithful-sawbones-life",
     "name": "Domain of the Faithful Sawbones",
     "phb5e": "Life",
     "features": [
      {
       "name": "Disciple of Life (1st level)",
       "text": "Healing spells restore an additional 2 + spell level HP."
      },
      {
       "name": "Preserve Life (2nd level)",
       "text": "Channel Creed to restore 5 × cleric level HP to creatures within 30 ft."
      },
      {
       "name": "Blessed Healer (6th level)",
       "text": "Healing another creature restores HP to yourself as well."
      },
      {
       "name": "Divine Strike (8th level)",
       "text": "Melee attacks deal +1d8 radiant damage (2d8 at 14th)."
      }
     ],
     "src": "BOOK1.md line 1201"
    },
    {
     "id": "shotgun-preacher-war",
     "name": "Shotgun Preacher",
     "phb5e": "War",
     "features": [
      {
       "name": "War Priest (1st level)",
       "text": "Make a bonus action weapon attack (Wis mod times per long rest)."
      },
      {
       "name": "Guided Strike (2nd level)",
       "text": "Channel Creed to gain +10 to an attack roll."
      },
      {
       "name": "War God's Blessing (6th level)",
       "text": "Grant +10 attack roll bonus to an ally within 30 ft."
      },
      {
       "name": "Avatar of Battle (17th level)",
       "text": "Gain resistance to non-magical bludgeoning, piercing, and slashing damage."
      }
     ],
     "src": "BOOK1.md line 1210"
    }
   ],
   "progression": {
    "columns": [
     "Level",
     "Prof.",
     "Features",
     "Cantrips",
     "Slots (1st–5th · 6th–9th)"
    ],
    "rows": [
     [
      "1st",
      "+2",
      "Circuit Magic, Divine Domain",
      "3",
      "2 — — — —"
     ],
     [
      "2nd",
      "+2",
      "Channel the Creed (1/rest), Turn Unquiet",
      "3",
      "3 — — — —"
     ],
     [
      "3rd",
      "+2",
      "—",
      "3",
      "4 2 — — —"
     ],
     [
      "4th",
      "+2",
      "Ability Score Improvement",
      "4",
      "4 3 — — —"
     ],
     [
      "5th",
      "+3",
      "Destroy Unquiet (CR 1/2)",
      "4",
      "4 3 2 — —"
     ],
     [
      "6th",
      "+3",
      "Channel the Creed (2/rest), Domain Feature",
      "4",
      "4 3 3 — —"
     ],
     [
      "7th",
      "+3",
      "—",
      "4",
      "4 3 3 1 —"
     ],
     [
      "8th",
      "+3",
      "ASI, Destroy Unquiet (CR 1), Potent/Strike",
      "4",
      "4 3 3 2 —"
     ],
     [
      "9th",
      "+4",
      "—",
      "4",
      "4 3 3 3 1"
     ],
     [
      "10th",
      "+4",
      "Divine Intervention",
      "5",
      "4 3 3 3 2"
     ],
     [
      "11th",
      "+4",
      "Destroy Unquiet (CR 2)",
      "5",
      "4 3 3 3 2 · 1 — — —"
     ],
     [
      "12th",
      "+4",
      "Ability Score Improvement",
      "5",
      "4 3 3 3 2 · 1 — — —"
     ],
     [
      "13th",
      "+5",
      "—",
      "5",
      "4 3 3 3 2 · 1 1 — —"
     ],
     [
      "14th",
      "+5",
      "Destroy Unquiet (CR 3)",
      "5",
      "4 3 3 3 2 · 1 1 — —"
     ],
     [
      "15th",
      "+5",
      "—",
      "5",
      "4 3 3 3 2 · 1 1 1 —"
     ],
     [
      "16th",
      "+5",
      "Ability Score Improvement",
      "5",
      "4 3 3 3 2 · 1 1 1 —"
     ],
     [
      "17th",
      "+6",
      "Destroy Unquiet (CR 4), Domain Feature",
      "5",
      "4 3 3 3 2 · 1 1 1 1"
     ],
     [
      "18th",
      "+6",
      "Channel the Creed (3/rest)",
      "5",
      "4 3 3 3 3 · 1 1 1 1"
     ],
     [
      "19th",
      "+6",
      "Ability Score Improvement",
      "5",
      "4 3 3 3 3 · 2 1 1 1"
     ],
     [
      "20th",
      "+6",
      "Divine Intervention Improvement",
      "5",
      "4 3 3 3 3 · 2 2 1 1"
     ]
    ]
   },
   "multiclass": "Prerequisite: Wisdom 13. Western archetypes and frontier flavor apply directly.",
   "hexLeadRest": "long"
  },
  {
   "id": "nature-guide",
   "name": "Nature Guide",
   "class5e": "Druid",
   "src": "BOOK1.md line 1229",
   "hitDie": "d8",
   "primary": "Wis",
   "saves": [
    "INT",
    "WIS"
   ],
   "spellAbility": "WIS",
   "caster": "full",
   "proficiencies": "Hit Die: 1d8 per level · Proficiencies & Kit: Non-metal armor and shields · Simple weapons, scimitars (machetes / heavy Bowies) · Wooden shield, machete, explorer pack, herbalism kit, a focus taken from the land (carved walking stick, medicine pouch, or a pouch of home-spring soil).",
   "armorProf": "Non-metal armor and shields",
   "weaponProf": "Simple weapons, scimitars (machetes / heavy Bowies)",
   "kit": "Wooden shield, machete, explorer pack, herbalism kit, a focus taken from the land (carved walking stick, medicine pouch, or a pouch of home-spring soil).",
   "features": [
    {
     "name": "Pathfinder's Code (1st lvl)",
     "text": "Secret signs carved into canyon rocks and telegraph poles denoting water, hazards, and safe trails."
    },
    {
     "name": "Spellcasting (1st lvl)",
     "text": "Wisdom spellcasting; prepared spells drawn from the land itself, strongest in wild country. Focus: something taken from the land (a walking stick, a pouch of home-spring soil, a medicine pouch). Never subtle: a Nature Guide's magic is openly fantastical. Nature Guides are exempt from Subtle Magic (with Hexslingers and Pact Seekers)."
    },
    {
     "name": "Beast Mantle (Wild Shape - 2nd lvl)",
     "text": "Assume the shape of a frontier beast twice per short/long rest (coyote, ridge hawk, cougar, iron bear)."
    },
    {
     "name": "Blighted Ground (optional rule)",
     "text": "In mine pits, rail yards, and company towns, your spell save DC drops by 2 and Natural Recovery doesn't work."
    },
    {
     "name": "Skinwalkers",
     "text": "Folks tell stories of beast men roaming the frontier. They blame the pioneers, but it's the Guides. If you're seen changing, expect a mob, a bounty on \"the beast,\" and rope or fire (it works like the Lawless wanted posters)."
    },
    {
     "name": "Timeless Body & Beast Spells (18th lvl)",
     "text": "Cast spells while inhabiting beast shape; age at 1/10th normal speed."
    },
    {
     "name": "Archdruid (20th lvl)",
     "text": "Unlimited uses of Beast Mantle; ignore verbal, somatic, and material components without cost."
    },
    {
     "name": "The Vanishing Herds",
     "text": "As company rail lines push into virgin valleys, Nature Guides serve as the last line of defense between industrial devastation and the primeval spirits of the untamed frontier."
    }
   ],
   "subclasses": [
    {
     "id": "circle-of-the-open-range-land",
     "name": "Circle of the Open Range",
     "phb5e": "Land",
     "features": [
      {
       "name": "Bonus Cantrip & Natural Recovery (2nd level)",
       "text": "Recover expended spell slots equal to half level on short rest."
      },
      {
       "name": "Circle Spells (3rd, 5th, 7th, 9th level)",
       "text": "Domain spells tied to badlands (spike growth, stone shape), prairie, or sierra."
      },
      {
       "name": "Land's Stride (6th level)",
       "text": "Nonmagical difficult terrain costs no extra movement."
      },
      {
       "name": "Nature's Sanctuary (14th level)",
       "text": "Beasts and plant creatures hesitate to attack you."
      }
     ],
     "src": "BOOK1.md line 1306"
    },
    {
     "id": "circle-of-the-skinwalker-moon",
     "name": "Circle of the Skinwalker",
     "phb5e": "Moon",
     "features": [
      {
       "name": "Combat Wild Shape (2nd level)",
       "text": "Shift into beast form as a bonus action; expend spell slots to heal HP."
      },
      {
       "name": "Circle Forms (2nd level)",
       "text": "Transform into beasts with CR up to 1 (scales to CR = level / 3)."
      },
      {
       "name": "Primal Strike (6th level)",
       "text": "Beast attacks count as magical for overcoming resistance."
      },
      {
       "name": "Elemental Wild Shape (10th level)",
       "text": "Expend two uses to transform into dust or fire elementals."
      }
     ],
     "src": "BOOK1.md line 1315"
    }
   ],
   "progression": {
    "columns": [
     "Level",
     "Prof.",
     "Features",
     "Cantrips",
     "Slots (1st–5th · 6th–9th)"
    ],
    "rows": [
     [
      "1st",
      "+2",
      "Pathfinder's Code, Spellcasting",
      "2",
      "2 — — — —"
     ],
     [
      "2nd",
      "+2",
      "Wild Shape (Beast Mantle), Druid Circle",
      "2",
      "3 — — — —"
     ],
     [
      "3rd",
      "+2",
      "—",
      "2",
      "4 2 — — —"
     ],
     [
      "4th",
      "+2",
      "Wild Shape improvement, ASI",
      "3",
      "4 3 — — —"
     ],
     [
      "5th",
      "+3",
      "—",
      "3",
      "4 3 2 — —"
     ],
     [
      "6th",
      "+3",
      "Druid Circle feature",
      "3",
      "4 3 3 — —"
     ],
     [
      "7th",
      "+3",
      "—",
      "3",
      "4 3 3 1 —"
     ],
     [
      "8th",
      "+3",
      "Wild Shape improvement, ASI",
      "3",
      "4 3 3 2 —"
     ],
     [
      "9th",
      "+4",
      "—",
      "3",
      "4 3 3 3 1"
     ],
     [
      "10th",
      "+4",
      "Druid Circle feature",
      "4",
      "4 3 3 3 2"
     ],
     [
      "11th",
      "+4",
      "—",
      "4",
      "4 3 3 3 2 · 1 — — —"
     ],
     [
      "12th",
      "+4",
      "Ability Score Improvement",
      "4",
      "4 3 3 3 2 · 1 — — —"
     ],
     [
      "13th",
      "+5",
      "—",
      "4",
      "4 3 3 3 2 · 1 1 — —"
     ],
     [
      "14th",
      "+5",
      "Druid Circle feature",
      "4",
      "4 3 3 3 2 · 1 1 — —"
     ],
     [
      "15th",
      "+5",
      "—",
      "4",
      "4 3 3 3 2 · 1 1 1 —"
     ],
     [
      "16th",
      "+5",
      "Ability Score Improvement",
      "4",
      "4 3 3 3 2 · 1 1 1 —"
     ],
     [
      "17th",
      "+6",
      "—",
      "4",
      "4 3 3 3 2 · 1 1 1 1"
     ],
     [
      "18th",
      "+6",
      "Timeless Body, Beast Spells",
      "4",
      "4 3 3 3 3 · 1 1 1 1"
     ],
     [
      "19th",
      "+6",
      "Ability Score Improvement",
      "4",
      "4 3 3 3 3 · 2 1 1 1"
     ],
     [
      "20th",
      "+6",
      "Archdruid",
      "4",
      "4 3 3 3 3 · 2 2 1 1"
     ]
    ]
   },
   "multiclass": "Prerequisite: Wisdom 13. Western archetypes and frontier flavor apply directly.",
   "hexLeadRest": "long"
  },
  {
   "id": "gunslinger",
   "name": "Gunslinger",
   "class5e": "Fighter",
   "src": "BOOK1.md line 1332",
   "hitDie": "d10",
   "primary": "Str/Dex",
   "saves": [
    "STR",
    "CON"
   ],
   "spellAbility": null,
   "caster": null,
   "proficiencies": "Hit Die: 1d10 per level · Proficiencies & Kit: All armor, shields · Simple and martial weapons (six-shooters, shotguns, repeaters, cavalry sabers, Bowies) · Duster, repeater & cartridges, cavalry saber or twin revolvers, gun belt and Mexican Loop, dungeoneer company kit.",
   "armorProf": "All armor, shields",
   "weaponProf": "Simple and martial weapons (six-shooters, shotguns, repeaters, cavalry sabers, Bowies)",
   "kit": "Duster, repeater & cartridges, cavalry saber or twin revolvers, gun belt and Mexican Loop, dungeoneer company kit.",
   "features": [
    {
     "name": "Gunfighter's Style (1st lvl)",
     "text": "Choose: Long-Gun Marksmanship (+2 to hit with rifles and carbines, including Big Bore rifles; not shotguns), Sidearm Duelling (+2 damage single iron), or Point-Blank Defense (+1 AC)."
    },
    {
     "name": "Dust Breath (Second Wind - 1st lvl)",
     "text": "Bonus action to regain 1d10 + fighter level HP once per short/long rest."
    },
    {
     "name": "Second Cylinder (Action Surge - 2nd lvl)",
     "text": "Take one additional action on your turn (once per short rest; twice at 17th level)."
    },
    {
     "name": "Quick Reload (3rd lvl)",
     "text": "Reload a firearm as a bonus action instead of an action, except slow-load guns (percussion revolvers, muzzleloaders, the Big Fifty) and a Dulls Rolling-Block chambered for a Heavy round. This Calling feature overrides the standard Reloading rule in Equipment for you."
    },
    {
     "name": "Extra Attack (5th, 11th, 20th lvl)",
     "text": "Attack twice per Attack action (3 times at 11th, 4 times at 20th). Allows multiple shots."
    },
    {
     "name": "Iron Nerve (Indomitable - 9th lvl)",
     "text": "Reroll a failed saving throw (up to 3 times per long rest at 17th)."
    },
    {
     "name": "Fast-Draw & Reload Mechanics",
     "text": "Reloading: A standard six-shooter holds 6 rounds. Reloading takes an action for most characters, but Gunslingers can reload as a bonus action starting at 3rd level (see Quick Reload). Take Cover: anyone can, as a bonus action (see Take Cover in Equipment); stacks on half / three-quarters cover."
    }
   ],
   "subclasses": [
    {
     "id": "deadeye-champion-champion",
     "name": "Deadeye Champion",
     "phb5e": "Champion",
     "features": [
      {
       "name": "Improved Critical (3rd level)",
       "text": "Your weapon attacks score a critical hit on a roll of 19 or 20."
      },
      {
       "name": "Remarkable Athlete (7th level)",
       "text": "Add half your proficiency bonus (round up) to any Str, Dex, or Con check that doesn't already use it. Your running long jump grows by a number of feet equal to your Str modifier."
      },
      {
       "name": "Additional Gun Style (10th level)",
       "text": "Choose a second Gunfighter's Style."
      },
      {
       "name": "Superior Critical (15th level)",
       "text": "Your weapon attacks score a critical hit on a roll of 18–20."
      },
      {
       "name": "Survivor (18th level)",
       "text": "At the start of each of your turns, regain 5 + your Con modifier in hit points if you have no more than half your hit points left (and at least 1)."
      }
     ],
     "src": "BOOK1.md line 1405"
    },
    {
     "id": "gun-whisperer-battle-master",
     "name": "Gun Whisperer",
     "phb5e": "Battle Master",
     "features": [
      {
       "name": "Combat Superiority (3rd level)",
       "text": "You learn three Trick Shots (below) and have four d8 superiority dice. Spend one die to use a Trick Shot, no more than one per attack. You regain all spent dice on a short or long rest. You gain a fifth die at 7th level and a sixth at 15th. You learn two more Trick Shots at 7th, 10th, and 15th, and each time you can swap one you know for another. Save DC = 8 + your proficiency bonus + your Str or Dex modifier (your choice)."
      },
      {
       "name": "Student of War (3rd level)",
       "text": "Proficiency with one type of artisan's tools. Most take gunsmith's tools."
      },
      {
       "name": "Know Your Enemy (7th level)",
       "text": "Spend 1 minute watching or dealing with a creature outside combat. The DM tells you if it's your equal, superior, or inferior in two of these (your pick): Str, Dex, Con, AC, current hit points, total class levels, or Gunslinger levels."
      },
      {
       "name": "Improved Combat Superiority (10th level)",
       "text": "Your superiority dice become d10s (d12s at 18th level)."
      },
      {
       "name": "Relentless (15th level)",
       "text": "When you roll initiative with no superiority dice left, you regain one."
      },
      {
       "name": "Trick Shots",
       "text": "Trick Shots (PHB maneuvers, rules as the PHB): Call the Shot (Commander's Strike), Disarming Shot (Disarming), Winging Shot (Distracting Strike), Hot Foot (Evasive Footwork), Fake Draw (Feinting), Calling Out (Goading), Long Reach (Lunging), Covering Fire (Maneuvering), Shoot the Hat (Menacing), Turn the Blade (Parry), Draw a Bead (Precision), Pushing Shot (Pushing), Buck Up (Rally), Pistol-Whip (Riposte), Backhand Sweep (Sweeping), Trip Shot (Trip). \"Melee\" ones need a melee weapon: a rifle butt, a pistol-whip, a Bowie."
      }
     ],
     "src": "BOOK1.md line 1415"
    }
   ],
   "progression": {
    "columns": [
     "Level",
     "Prof.",
     "Features"
    ],
    "rows": [
     [
      "1st",
      "+2",
      "Fighting Style, Second Wind"
     ],
     [
      "2nd",
      "+2",
      "Action Surge (one use)"
     ],
     [
      "3rd",
      "+2",
      "Martial Archetype, Quick Reload"
     ],
     [
      "4th",
      "+2",
      "Ability Score Improvement"
     ],
     [
      "5th",
      "+3",
      "Extra Attack (1 extra)"
     ],
     [
      "6th",
      "+3",
      "Ability Score Improvement"
     ],
     [
      "7th",
      "+3",
      "Archetype feature"
     ],
     [
      "8th",
      "+3",
      "Ability Score Improvement"
     ],
     [
      "9th",
      "+4",
      "Indomitable (1 use)"
     ],
     [
      "10th",
      "+4",
      "Archetype feature"
     ],
     [
      "11th",
      "+4",
      "Extra Attack (2 extra)"
     ],
     [
      "12th",
      "+4",
      "Ability Score Improvement"
     ],
     [
      "13th",
      "+5",
      "Indomitable (2 uses)"
     ],
     [
      "14th",
      "+5",
      "Ability Score Improvement"
     ],
     [
      "15th",
      "+5",
      "Archetype feature"
     ],
     [
      "16th",
      "+5",
      "Ability Score Improvement"
     ],
     [
      "17th",
      "+6",
      "Action Surge (2 uses), Indomitable (3)"
     ],
     [
      "18th",
      "+6",
      "Archetype feature"
     ],
     [
      "19th",
      "+6",
      "Ability Score Improvement"
     ],
     [
      "20th",
      "+6",
      "Extra Attack (3 extra)"
     ]
    ]
   },
   "multiclass": "Prerequisite: Strength or Dexterity 13. Western archetypes and frontier flavor apply directly.",
   "hexLeadRest": null
  },
  {
   "id": "martial-artist",
   "name": "Martial Artist",
   "class5e": "Monk",
   "src": "BOOK1.md line 1435",
   "hitDie": "d8",
   "primary": "Dex & Wis",
   "saves": [
    "STR",
    "DEX"
   ],
   "spellAbility": null,
   "caster": null,
   "proficiencies": "Hit Die: 1d8 per level · Proficiencies & Kit: Armor: None · Simple weapons, shortswords (Bowies, batons, canes) · Bowie knife, 10 throwing darts/knives, dungeoneer pack, rough canvas shirt and heavy boots.",
   "armorProf": "None",
   "weaponProf": "Simple weapons, shortswords (Bowies, batons, canes)",
   "kit": "Bowie knife, 10 throwing darts/knives, dungeoneer pack, rough canvas shirt and heavy boots.",
   "features": [
    {
     "name": "Bare-Iron Arts (1st lvl)",
     "text": "Use Dex for monk weapons/unarmed strikes; damage scales (d4 to d10); make a bonus action unarmed strike."
    },
    {
     "name": "Loose Coat Guard (Unarmored Defense - 1st lvl)",
     "text": "Unarmored AC equals 10 + Dexterity modifier + Wisdom modifier."
    },
    {
     "name": "Breath Coin (Ki - 2nd lvl)",
     "text": "Ki points equal to level: Flurry of Blows (2 bonus strikes), Patient Defense (Dodge bonus action), Step of the Wind (Disengage/Dash bonus action)."
    },
    {
     "name": "Dust Runner (2nd lvl)",
     "text": "Speed increases by +10 ft (scaling to +30 ft at 18th level)."
    },
    {
     "name": "Deflect Lead (3rd lvl)",
     "text": "Reaction to reduce incoming ranged/bullet damage by 1d10 + Dex mod + level; catch and return bullets if reduced to 0."
    },
    {
     "name": "Stunning Strike (5th lvl)",
     "text": "Spend 1 Breath Coin on hit to stun a target until end of next turn (Con save)."
    },
    {
     "name": "The Deflect Lead Discipline",
     "text": "While outlaws trust revolvers, a master of Bare-Iron Arts catches bullets out of midair. When an opponent's shot misses the mark or is snatched by Deflect Lead, closing distance with a stunning hook ends the gunfight before another cartridge can be chambered."
    }
   ],
   "subclasses": [
    {
     "id": "rough-and-tumble-brawler-open-hand",
     "name": "Rough-and-Tumble Brawler",
     "phb5e": "Open Hand",
     "features": [
      {
       "name": "Open Hand Technique (3rd level)",
       "text": "Flurry of Blows knocks targets prone, pushes them 15 ft, or prevents reactions until next turn."
      },
      {
       "name": "Whistle Recovery (6th level)",
       "text": "Action to heal HP equal to 3 × monk level once per long rest."
      },
      {
       "name": "Tranquility (11th level)",
       "text": "Gain the effects of a Sanctuary spell after finishing a long rest."
      },
      {
       "name": "Quivering Palm (17th level)",
       "text": "Spend 3 Ki on hit to transmit lethal vibrations; trigger to drop foe to 0 HP (Con save for 10d10)."
      }
     ],
     "src": "BOOK1.md line 1510"
    },
    {
     "id": "tong-hatchet-man-shadow",
     "name": "Tong Hatchet Man",
     "phb5e": "Shadow",
     "features": [
      {
       "name": "Shadow Arts (3rd level)",
       "text": "Spend 2 Ki to cast Darkness, Darkvision, Pass without Trace, or Silence."
      },
      {
       "name": "Shadow Step (6th level)",
       "text": "Bonus action to teleport 60 ft between dim light or darkness; gain advantage on your next attack."
      }
     ],
     "src": "BOOK1.md line 1519"
    },
    {
     "id": "way-of-kung-fu-four-elements",
     "name": "Way of Kung Fu",
     "phb5e": "Four Elements",
     "features": [
      {
       "name": "Disciple of the Elements (3rd level)",
       "text": "You learn Small Weather and one other discipline, plus one more at 6th, 11th, and 17th. When you learn a new one, you can swap one you know. A discipline that casts a spell uses your ki save DC and needs no material components. You can spend extra Breath Coins to cast it at a higher level (1 per level), up to a total of 3 Breath Coins per cast at 5th level, 4 at 9th, 5 at 13th, and 6 at 17th."
      },
      {
       "name": "Disciplines (any level)",
       "text": "Small Weather (Elemental Attunement): tiny tricks of fire, water, earth, and air. Fire Snake (Fangs of the Fire Snake, 1): 10-ft reach and fire damage on your strikes this turn (heat and friction, not magical flame). Thunder Palm (Fist of Four Thunders, 2): casts Thunderwave (Porch Boom). Mule Kick (Fist of Unbroken Air, 2): a blow at 30 ft; Str save or 3d10 bludgeoning, pushed 20 ft and knocked prone. Gale Breath (Rush of the Gale Spirits, 2): casts Gust of Wind (Dust Devil). Shape the River (Shape the Flowing River, 1): move, freeze, or thaw water and ice. Cinder Sweep (Sweeping Cinder Strike, 2): casts Burning Hands (Powder Fan). Water Whip (2): a creature within 30 ft makes a Dex save or takes 3d10 bludgeoning and is pulled 25 ft toward you or knocked prone."
      },
      {
       "name": "Disciplines (6th level+)",
       "text": "North Wind Grip (Clench of the North Wind, 3): casts Hold Person (Lasso). Gong of the Summit (3): casts Shatter (Resonance)."
      },
      {
       "name": "Disciplines (11th level+)",
       "text": "Mountain Stance (Eternal Mountain Defense, 5): casts Stoneskin on yourself. Phoenix Fire (Flames of the Phoenix, 4): casts Fireball (Nitro Charge). Mist Stance (4): casts Gaseous Form (Sublimation) on yourself. Ride the Wind (4): casts Fly (Aeronaut) on yourself."
      },
      {
       "name": "Disciplines (17th level+)",
       "text": "Breath of Winter (6): casts Cone of Cold (Liquid Air). River of Fire (River of Hungry Flame, 5): casts Wall of Fire (Prairie Fire). Rolling Earth (Wave of Rolling Earth, 6): casts Wall of Stone (Rimrock)."
      }
     ],
     "src": "BOOK1.md line 1526"
    }
   ],
   "progression": {
    "columns": [
     "Level",
     "Prof.",
     "Features",
     "Martial Arts",
     "Ki",
     "Speed"
    ],
    "rows": [
     [
      "1st",
      "+2",
      "Bare-Iron Arts, Loose Coat Guard",
      "1d4",
      "—",
      "—"
     ],
     [
      "2nd",
      "+2",
      "Breath Coin (Ki), Dust Runner (+10ft)",
      "1d4",
      "2",
      "+10 ft"
     ],
     [
      "3rd",
      "+2",
      "Monastic Tradition, Deflect Lead",
      "1d4",
      "3",
      "+10 ft"
     ],
     [
      "4th",
      "+2",
      "Ability Score Improvement, Slow Fall",
      "1d4",
      "4",
      "+10 ft"
     ],
     [
      "5th",
      "+3",
      "Extra Attack, Stunning Strike",
      "1d6",
      "5",
      "+10 ft"
     ],
     [
      "6th",
      "+3",
      "Ki-Empowered Strikes, Tradition feature",
      "1d6",
      "6",
      "+15 ft"
     ],
     [
      "7th",
      "+3",
      "Evasion, Stillness of Mind",
      "1d6",
      "7",
      "+15 ft"
     ],
     [
      "8th",
      "+3",
      "Ability Score Improvement",
      "1d6",
      "8",
      "+15 ft"
     ],
     [
      "9th",
      "+4",
      "Unarmored Movement vertical improvement",
      "1d6",
      "9",
      "+15 ft"
     ],
     [
      "10th",
      "+4",
      "Purity of Body",
      "1d6",
      "10",
      "+20 ft"
     ],
     [
      "11th",
      "+4",
      "Monastic Tradition feature",
      "1d8",
      "11",
      "+20 ft"
     ],
     [
      "12th",
      "+4",
      "Ability Score Improvement",
      "1d8",
      "12",
      "+20 ft"
     ],
     [
      "13th",
      "+5",
      "Tongue of the Sun and Moon",
      "1d8",
      "13",
      "+20 ft"
     ],
     [
      "14th",
      "+5",
      "Diamond Soul (prof in all saves)",
      "1d8",
      "14",
      "+25 ft"
     ],
     [
      "15th",
      "+5",
      "Timeless Body",
      "1d8",
      "15",
      "+25 ft"
     ],
     [
      "16th",
      "+5",
      "Ability Score Improvement",
      "1d8",
      "16",
      "+25 ft"
     ],
     [
      "17th",
      "+6",
      "Monastic Tradition feature",
      "1d10",
      "17",
      "+25 ft"
     ],
     [
      "18th",
      "+6",
      "Empty Body",
      "1d10",
      "18",
      "+30 ft"
     ],
     [
      "19th",
      "+6",
      "Ability Score Improvement",
      "1d10",
      "19",
      "+30 ft"
     ],
     [
      "20th",
      "+6",
      "Perfect Self",
      "1d10",
      "20",
      "+30 ft"
     ]
    ]
   },
   "multiclass": "Prerequisite: Dexterity & Wisdom 13. Western archetypes and frontier flavor apply directly.",
   "hexLeadRest": null
  },
  {
   "id": "lawman",
   "name": "Lawman",
   "class5e": "Paladin",
   "src": "BOOK1.md line 1546",
   "hitDie": "d10",
   "primary": "Str & Cha",
   "saves": [
    "WIS",
    "CHA"
   ],
   "spellAbility": "CHA",
   "caster": "half",
   "proficiencies": "Hit Die: 1d10 per level · Proficiencies & Kit: All armor, shields · Simple and martial weapons · Cavalry saber, tin star (focus), shield, mail duster, Ball n Cap + 20 loads.",
   "armorProf": "All armor, shields",
   "weaponProf": "Simple and martial weapons",
   "kit": "Cavalry saber, tin star, shield, mail duster, Ball n Cap + 20 loads.",
   "features": [
    {
     "name": "Oath Sense (Divine Sense - 1st lvl)",
     "text": "Detect unquiet dead, hell-branded fiends, or sacred presence within 60 ft (1 + Cha mod times/day)."
    },
    {
     "name": "Mercy Hands (Lay on Hands - 1st lvl)",
     "text": "Pool of healing HP equal to 5 × paladin level; cure poisons or diseases by expending 5 HP."
    },
    {
     "name": "Spellcasting (2nd lvl)",
     "text": "Charisma spellcasting. Focus: your badge. See Badge Bound."
    },
    {
     "name": "Badge Bound",
     "text": "Your power is conviction in the law: authority, discipline, and an oath kept. No god grants it. The badge is the anchor. - Bright: full power. - Dull: no spells, Smite Lead, Mercy Hands, or Channel Creed until you're sworn in again or your authority is restored. A lost badge counts as Dull. - Tarnished: you fall to the Oath of the Lawless."
    },
    {
     "name": "Oath Strike / Smite Lead (2nd lvl)",
     "text": "When hitting with a weapon (including firearms), expend a spell slot to deal 2d8 radiant damage (+1d8 per slot level above 1st, max 5d8; +1d8 vs unquiet/fiends)."
    },
    {
     "name": "Aura of Protection (6th lvl)",
     "text": "Allies within 10 ft gain bonus to all saving throws equal to your Charisma modifier."
    },
    {
     "name": "Aura of Courage (10th lvl)",
     "text": "Allies within 10 ft cannot be frightened."
    },
    {
     "name": "The Weight of the Tin Star",
     "text": "Out west, carrying a badge means standing between ruthless mining conglomerates and vulnerable homesteaders. An Oath Strike channeled through a custom Heavy ChaosMaker speaks louder than any judge's gavel."
    }
   ],
   "subclasses": [
    {
     "id": "oath-of-the-badge-devotion",
     "name": "Oath of the Badge",
     "phb5e": "Devotion",
     "features": [
      {
       "name": "Channel Creed - Sacred Weapon",
       "text": "Imbue your sidearm or blade with bright light; add Cha mod to attack rolls for 1 minute."
      },
      {
       "name": "Turn the Corrupt",
       "text": "Turn fiends and undead within 30 ft."
      },
      {
       "name": "Aura of Devotion (7th level)",
       "text": "You and nearby allies cannot be charmed."
      }
     ],
     "src": "BOOK1.md line 1630"
    },
    {
     "id": "oath-of-the-bounty-hunter-vengeance",
     "name": "Oath of the Bounty Hunter",
     "phb5e": "Vengeance",
     "features": [
      {
       "name": "Vow of Enmity",
       "text": "Bonus action to gain advantage on all attack rolls against one chosen quarry for 1 minute."
      },
      {
       "name": "Relentless Avenger (7th level)",
       "text": "Opportunity attack hits allow moving up to half speed without provoking attacks."
      }
     ],
     "src": "BOOK1.md line 1638"
    },
    {
     "id": "oath-of-the-lawless-oathbreaker",
     "name": "Oath of the Lawless",
     "phb5e": "Oathbreaker",
     "features": [
      {
       "name": "DM assigned",
       "text": "You can't choose this oath at character creation. You fall into it when your badge tarnishes (see Badge Bound)."
      },
      {
       "name": "Channel Creed (3rd level)",
       "text": "Control Undead: as an action, one undead you can see within 30 ft makes a Wis save or obeys you for 24 hours (or until you use this again). Undead with a CR equal to or higher than your Lawman level are immune. Dreadful Aspect: as an action, each creature of your choice within 30 ft that can see you makes a Wis save or is frightened of you for 1 minute. It repeats the save if it ends its turn more than 30 ft from you."
      },
      {
       "name": "Aura of Hate (7th level)",
       "text": "You, and any fiends and undead within 10 ft of you, add your Cha modifier to melee weapon damage rolls (30 ft at 18th level). A creature gets this bonus from only one Aura of Hate at a time."
      },
      {
       "name": "Supernatural Resistance (15th level)",
       "text": "Resistance to bludgeoning, piercing, and slashing damage from nonmagical weapons."
      },
      {
       "name": "Dread Lord (20th level)",
       "text": "As an action, for 1 minute, gloom fills 30 ft around you and bright light there drops to dim. A creature frightened of you that starts its turn in the gloom takes 4d10 psychic damage. Creatures that rely on sight have disadvantage on attacks against you and the allies you choose in it. As a bonus action on your turns, you can make a melee spell attack against a creature in the gloom for 3d10 + your Cha modifier necrotic damage. Once per long rest."
      }
     ],
     "src": "BOOK1.md line 1645",
     "dmOnly": true,
     "restriction": "You can't choose this oath at character creation. You fall into it when your badge tarnishes (see Badge Bound)."
    }
   ],
   "progression": {
    "columns": [
     "Level",
     "Prof.",
     "Features",
     "Slots (1st–5th)"
    ],
    "rows": [
     [
      "1st",
      "+2",
      "Oath Sense, Mercy Hands",
      "—"
     ],
     [
      "2nd",
      "+2",
      "Fighting Style, Spellcasting, Smite Lead",
      "2 — — — —"
     ],
     [
      "3rd",
      "+2",
      "Hard Blessing, Sacred Oath, Deputize",
      "3 — — — —"
     ],
     [
      "4th",
      "+2",
      "Ability Score Improvement",
      "3 — — — —"
     ],
     [
      "5th",
      "+3",
      "Extra Attack",
      "4 2 — — —"
     ],
     [
      "6th",
      "+3",
      "Aura of Protection",
      "4 2 — — —"
     ],
     [
      "7th",
      "+3",
      "Sacred Oath feature",
      "4 3 — — —"
     ],
     [
      "8th",
      "+3",
      "Ability Score Improvement",
      "4 3 — — —"
     ],
     [
      "9th",
      "+4",
      "—",
      "4 3 2 — —"
     ],
     [
      "10th",
      "+4",
      "Aura of Courage",
      "4 3 2 — —"
     ],
     [
      "11th",
      "+4",
      "Improved Smite Lead (+1d8 on hit), Deputize (2 deputies)",
      "4 3 3 — —"
     ],
     [
      "12th",
      "+4",
      "Ability Score Improvement",
      "4 3 3 — —"
     ],
     [
      "13th",
      "+5",
      "—",
      "4 3 3 1 —"
     ],
     [
      "14th",
      "+5",
      "Cleansing Touch",
      "4 3 3 1 —"
     ],
     [
      "15th",
      "+5",
      "Sacred Oath feature",
      "4 3 3 2 —"
     ],
     [
      "16th",
      "+5",
      "Ability Score Improvement",
      "4 3 3 2 —"
     ],
     [
      "17th",
      "+6",
      "—",
      "4 3 3 3 1"
     ],
     [
      "18th",
      "+6",
      "Aura improvements (30 ft)",
      "4 3 3 3 1"
     ],
     [
      "19th",
      "+6",
      "Ability Score Improvement",
      "4 3 3 3 2"
     ],
     [
      "20th",
      "+6",
      "Sacred Oath capstone",
      "4 3 3 3 2"
     ]
    ]
   },
   "multiclass": "Prerequisite: Strength & Charisma 13. Western archetypes and frontier flavor apply directly.",
   "hexLeadRest": "long"
  },
  {
   "id": "frontier-scout",
   "name": "Frontier Scout",
   "class5e": "Ranger",
   "src": "BOOK1.md line 1668",
   "hitDie": "d10",
   "primary": "Dex & Wis",
   "saves": [
    "STR",
    "DEX"
   ],
   "spellAbility": "WIS",
   "caster": "half",
   "proficiencies": "Hit Die: 1d10 per level · Proficiencies & Kit: Light/medium armor, shields · Simple and martial weapons · Hunting rifle (longbow) & cartridges, gun belt, 2 Bowies, scale/leather coat, explorer trail pack, compass.",
   "armorProf": "Light/medium armor, shields",
   "weaponProf": "Simple and martial weapons",
   "kit": "Hunting rifle (longbow) & cartridges, gun belt, 2 Bowies, scale/leather coat, explorer trail pack, compass.",
   "features": [
    {
     "name": "Marked Quarry (Favored Enemy - 1st lvl)",
     "text": "Advantage on Survival checks to track quarry; advantage on Intelligence checks to recall information about them; learn their languages."
    },
    {
     "name": "Known Ground (Natural Explorer - 1st lvl)",
     "text": "Difficult terrain doesn't slow group travel; cannot become lost except by magical means; remain alert while foraging."
    },
    {
     "name": "Fighting Style & Wild Ticker (2nd, 3rd lvl)",
     "text": "Archery (+2 ranged hit); Primeval Awareness allows detecting supernatural creatures within 1 mile."
    },
    {
     "name": "Spellcasting (2nd lvl)",
     "text": "Wisdom spellcasting. Quiet, practical trail sense, the last threads of the Weave in open country. Focus: a keepsake that reminds you of home, the wilderness, or your country. If it's lost, you can't cast until you make a new one at a long rest in that kind of country. \"Arrow\" spells work through any ranged weapon, guns included."
    },
    {
     "name": "Extra Attack & Land's Stride (5th, 8th lvl)",
     "text": "Attack twice per Attack action; move freely through nonmagical briars, thorns, and hazards."
    },
    {
     "name": "Vanish & Feral Senses (14th, 18th lvl)",
     "text": "Hide as a bonus action; cannot be tracked by nonmagical means; fight unseen foes without disadvantage."
    },
    {
     "name": "The Long Trail Ahead",
     "text": "While travelers cling to rail corridors, Frontier Scouts cut directly through uncharted canyons. With a long rifle, a steady eye, and an acute sense for ambushes, a Scout ensures the party reaches civilization in one piece."
    }
   ],
   "subclasses": [
    {
     "id": "trophy-hunter-hunter",
     "name": "Trophy Hunter",
     "phb5e": "Hunter",
     "features": [
      {
       "name": "Hunter's Prey (3rd level)",
       "text": "Colossus Slayer (+1d8 damage to wounded target), Giant Killer (reaction to strike large foes), or Horde Breaker."
      },
      {
       "name": "Defensive Tactics (7th level)",
       "text": "Escape the Horde, Multiattack Defense (+4 AC after hit), or Steel Will."
      },
      {
       "name": "Multiattack (11th level)",
       "text": "Volley (ranged barrage in 10-ft radius) or Whirlwind Attack."
      },
      {
       "name": "Superior Hunter's Defense (15th level)",
       "text": "Evasion, Stand Against the Tide, or Uncanny Dodge."
      }
     ],
     "src": "BOOK1.md line 1742"
    },
    {
     "id": "beast-wrangler-beast-master",
     "name": "Beast Wrangler",
     "phb5e": "Beast Master",
     "features": [
      {
       "name": "Ranger's Companion (3rd level)",
       "text": "Bond with a beast up to CR 1/4; adds proficiency bonus to AC, attacks, and damage."
      },
      {
       "name": "Exceptional Training (7th level)",
       "text": "Companion Dash, Disengage, or Help as bonus action."
      },
      {
       "name": "Bestial Fury (11th level)",
       "text": "Companion makes two attacks per Attack command."
      },
      {
       "name": "Share Spells (15th level)",
       "text": "Spells targeting yourself also affect your companion."
      }
     ],
     "src": "BOOK1.md line 1751"
    }
   ],
   "progression": {
    "columns": [
     "Level",
     "Prof.",
     "Features",
     "Spells Known",
     "Slots (1st–5th)"
    ],
    "rows": [
     [
      "1st",
      "+2",
      "Marked Quarry, Known Ground",
      "—",
      "—"
     ],
     [
      "2nd",
      "+2",
      "Fighting Style, Spellcasting",
      "2",
      "2 — — — —"
     ],
     [
      "3rd",
      "+2",
      "Ranger Conclave, Wild Ticker",
      "3",
      "3 — — — —"
     ],
     [
      "4th",
      "+2",
      "Ability Score Improvement",
      "3",
      "3 — — — —"
     ],
     [
      "5th",
      "+3",
      "Extra Attack",
      "4",
      "4 2 — — —"
     ],
     [
      "6th",
      "+3",
      "Favored Enemy & Natural Explorer improvements",
      "4",
      "4 2 — — —"
     ],
     [
      "7th",
      "+3",
      "Conclave feature",
      "5",
      "4 3 — — —"
     ],
     [
      "8th",
      "+3",
      "Land's Stride, ASI",
      "5",
      "4 3 — — —"
     ],
     [
      "9th",
      "+4",
      "—",
      "6",
      "4 3 2 — —"
     ],
     [
      "10th",
      "+4",
      "Natural Explorer improvement, Hide in Plain Sight",
      "6",
      "4 3 2 — —"
     ],
     [
      "11th",
      "+4",
      "Conclave feature",
      "7",
      "4 3 3 — —"
     ],
     [
      "12th",
      "+4",
      "Ability Score Improvement",
      "7",
      "4 3 3 — —"
     ],
     [
      "13th",
      "+5",
      "—",
      "8",
      "4 3 3 1 —"
     ],
     [
      "14th",
      "+5",
      "Favored Enemy improvement, Vanish",
      "8",
      "4 3 3 1 —"
     ],
     [
      "15th",
      "+5",
      "Conclave feature",
      "9",
      "4 3 3 2 —"
     ],
     [
      "16th",
      "+5",
      "Ability Score Improvement",
      "9",
      "4 3 3 2 —"
     ],
     [
      "17th",
      "+6",
      "—",
      "10",
      "4 3 3 3 1"
     ],
     [
      "18th",
      "+6",
      "Feral Senses",
      "10",
      "4 3 3 3 1"
     ],
     [
      "19th",
      "+6",
      "Ability Score Improvement",
      "11",
      "4 3 3 3 2"
     ],
     [
      "20th",
      "+6",
      "Foe Slayer",
      "11",
      "4 3 3 3 2"
     ]
    ]
   },
   "multiclass": "Prerequisite: Dexterity & Wisdom 13. Western archetypes and frontier flavor apply directly.",
   "hexLeadRest": "long"
  },
  {
   "id": "gambler",
   "name": "Gambler",
   "class5e": "Rogue",
   "src": "BOOK1.md line 1768",
   "hitDie": "d8",
   "primary": "Dex",
   "saves": [
    "DEX",
    "INT"
   ],
   "spellAbility": null,
   "caster": null,
   "proficiencies": "Hit Die: 1d8 per level · Proficiencies & Kit: Light armor · Simple weapons, Herringer pistols, longswords, rapiers, shortswords · Fencing iron or Bowie knife, shortbow/pocket pistol, thieves' tools, 2 daggers, duster, satchel.",
   "armorProf": "Light armor",
   "weaponProf": "Simple weapons, Herringer pistols, longswords, rapiers, shortswords",
   "kit": "Fencing iron or Bowie knife, shortbow/pocket pistol, thieves' tools, 2 daggers, duster, satchel.",
   "features": [
    {
     "name": "Sharp Practice (Expertise - 1st lvl)",
     "text": "Double proficiency bonus for two chosen skill proficiencies or thieves' tools (two more at 6th level)."
    },
    {
     "name": "Card Sharp's Tells (1st lvl)",
     "text": "You know the signals, card tells, and code words hustlers use. You can hide a short message in ordinary talk or leave a mark that only another hustler will read."
    },
    {
     "name": "Suckerpunch / Dead Angle (Sneak Attack - 1st lvl)",
     "text": "Deal extra 1d6 damage (scaling to 10d6) to one creature you hit with advantage (or if an ally is within 5 ft and you lack disadvantage)."
    },
    {
     "name": "Quick Hands (Cunning Action - 2nd lvl)",
     "text": "Bonus action on each turn to Dash, Disengage, or Hide."
    },
    {
     "name": "Uncanny Dodge & Evasion (5th, 7th lvl)",
     "text": "Reaction to halve incoming damage from an attacker you see; take 0 damage on successful Dex saves, half on failure."
    },
    {
     "name": "Reliable Talent & Stroke of Luck (11th, 20th lvl)",
     "text": "Treat any d20 roll of 9 or lower as a 10 for proficient checks; turn one missed attack into a hit once per rest."
    },
    {
     "name": "The Quick Grift & The Double Cross",
     "text": "In towns run by company scrip, Gamblers thrive on friction. Whether palming aces at the poker table or cracking an Eldorite ore safe at midnight, a quick gun and quicker hands keep you one step ahead of the hangman."
    }
   ],
   "subclasses": [
    {
     "id": "the-burglar-thief",
     "name": "The Burglar",
     "phb5e": "Thief",
     "features": [
      {
       "name": "Quick Grift (3rd level)",
       "text": "Your Quick Hands bonus action can also be a Sleight of Hand check, a use of thieves' tools to disarm a trap or open a lock, or the Use an Object action. Reloading a gun and lighting and throwing dynamite are their own actions, not Use an Object."
      },
      {
       "name": "Second-Story Claim (3rd level)",
       "text": "Climbing costs you no extra movement. Your running jump grows by a number of feet equal to your Dex modifier."
      },
      {
       "name": "Supreme Sneak (9th level)",
       "text": "Advantage on Stealth checks if you move no more than half your speed on the same turn."
      },
      {
       "name": "Use Magic Device (13th level)",
       "text": "You ignore all class, lineage, and level requirements on magic items and Eldorite curios. A Caster Gun still needs a born Hexslinger's spark, and Borrowed Iron answers only to its Pact Seeker."
      },
      {
       "name": "Thief's Reflexes (17th level)",
       "text": "You take two turns in the first round of combat: one at your initiative and one at your initiative minus 10. You can't do this when you're surprised."
      }
     ],
     "src": "BOOK1.md line 1837"
    },
    {
     "id": "hitman-assassin",
     "name": "Hitman",
     "phb5e": "Assassin",
     "features": [
      {
       "name": "Tools of the Trade (3rd level)",
       "text": "Proficiency with the disguise kit (stage paint and false claim papers) and the poisoner's kit (illegal in most towns)."
      },
      {
       "name": "Cold Ambush (3rd level)",
       "text": "Advantage on attack rolls against any creature that hasn't taken a turn in the combat yet. Any hit you score against a surprised creature is a critical hit."
      },
      {
       "name": "Infiltration Expertise (9th level)",
       "text": "Spend 7 days and 2,500 ES to build a false identity: a history, a trade, papers, and people who'll vouch for you. You can't take over an identity that belongs to someone else."
      },
      {
       "name": "Impostor (13th level)",
       "text": "After 3 hours studying a person's speech, handwriting, and manner, you can copy them without a slip. Casual observers can't tell. A wary creature that suspects something gives you advantage on your Deception checks to stay hidden in the role."
      },
      {
       "name": "Death Strike (17th level)",
       "text": "When you hit a surprised creature, it makes a Con save (DC 8 + your Dex modifier + your proficiency bonus). On a failure, the attack's damage is doubled."
      }
     ],
     "src": "BOOK1.md line 1847"
    }
   ],
   "progression": {
    "columns": [
     "Level",
     "Prof.",
     "Features",
     "Sneak Attack"
    ],
    "rows": [
     [
      "1st",
      "+2",
      "Sneak Attack (1d6), Sharp Practice, Card Sharp's Tells",
      "1d6"
     ],
     [
      "2nd",
      "+2",
      "Quick Hands (Cunning Action)",
      "1d6"
     ],
     [
      "3rd",
      "+2",
      "Roguish Archetype",
      "2d6"
     ],
     [
      "4th",
      "+2",
      "Ability Score Improvement",
      "2d6"
     ],
     [
      "5th",
      "+3",
      "Uncanny Dodge",
      "3d6"
     ],
     [
      "6th",
      "+3",
      "Sharp Practice (Expertise)",
      "3d6"
     ],
     [
      "7th",
      "+3",
      "Evasion",
      "4d6"
     ],
     [
      "8th",
      "+3",
      "Ability Score Improvement",
      "4d6"
     ],
     [
      "9th",
      "+4",
      "Archetype feature",
      "5d6"
     ],
     [
      "10th",
      "+4",
      "Ability Score Improvement",
      "5d6"
     ],
     [
      "11th",
      "+4",
      "Reliable Talent",
      "6d6"
     ],
     [
      "12th",
      "+4",
      "Ability Score Improvement",
      "6d6"
     ],
     [
      "13th",
      "+5",
      "Archetype feature",
      "7d6"
     ],
     [
      "14th",
      "+5",
      "Blindsense",
      "7d6"
     ],
     [
      "15th",
      "+5",
      "Slippery Mind (Wis saves)",
      "8d6"
     ],
     [
      "16th",
      "+5",
      "Ability Score Improvement",
      "8d6"
     ],
     [
      "17th",
      "+6",
      "Archetype feature",
      "9d6"
     ],
     [
      "18th",
      "+6",
      "Elusive",
      "9d6"
     ],
     [
      "19th",
      "+6",
      "Ability Score Improvement",
      "10d6"
     ],
     [
      "20th",
      "+6",
      "Stroke of Luck",
      "10d6"
     ]
    ]
   },
   "multiclass": "Prerequisite: Dexterity 13. Western archetypes and frontier flavor apply directly.",
   "hexLeadRest": null
  },
  {
   "id": "hexslinger",
   "name": "Hexslinger",
   "class5e": "Sorcerer",
   "src": "BOOK1.md line 1865",
   "hitDie": "d6",
   "primary": "Cha",
   "saves": [
    "CON",
    "CHA"
   ],
   "spellAbility": "CHA",
   "caster": "full",
   "proficiencies": "Hit Die: 1d6 per level · Saves: Con, Cha · Skills: choose two from Arcana, Deception, Insight, Intimidation, Persuasion, and Religion · Proficiencies & Kit: Armor: None · Daggers, darts, slings, quarterstaffs, Herringer pistols, the Ball n Cap, and Caster Guns · a Blacksnake Caster Gun (plain, often rusty, still rare) or a Hognose (Equipment p.64), gun belt, Bowie knife, explorer pack, 2 daggers.",
   "armorProf": "None",
   "weaponProf": "Daggers, darts, slings, quarterstaffs, Herringer pistols, the Ball n Cap, and Caster Guns",
   "kit": "a Blacksnake Caster Gun (plain, often rusty, still rare) or a Hognose (Equipment p.64), gun belt, Bowie knife, explorer pack, 2 daggers.",
   "features": [
    {
     "name": "Caster Gun Spellcasting (1st lvl)",
     "text": "Charisma is your spellcasting ability. Spell save DC = 8 + your proficiency bonus + your Charisma modifier. Spell attack modifier = your proficiency bonus + your Charisma modifier. You know your spells as a 5e sorcerer does (see the Spells Known column). When you gain a Hexslinger level, you can replace one Hexslinger spell you know with another of a level you have shells for. Your Caster Gun is your focus, and you must cast through it. Your magic comes from within and is channeled through iron. Most folks will tell you the Weave is dying, and in a dying Weave nobody throws fire from bare hands."
    },
    {
     "name": "Hex Well (Font of Magic - 2nd lvl)",
     "text": "You have sorcery points equal to your Hexslinger level (2 at 2nd). You regain them all when you finish a long rest. - Etch a shell (create a spell slot): as a bonus action, spend points to make one hex lead shell. Cost: 1st 2 · 2nd 3 · 3rd 5 · 4th 6 · 5th 7. You can't etch a shell above 5th level. Etched shells go dull and vanish when you finish a long rest. - Melt a shell (slot to points): as a bonus action, break down one unspent shell and gain sorcery points equal to its level. - Where etched and melted shells go. An etched shell appears loaded in an empty chamber of your choice, or on your gun belt if every chamber is full. A melted shell can come from a chamber or your belt."
    },
    {
     "name": "Hex Tricks (Metamagic - 3rd lvl)",
     "text": "Choose two Hex Tricks at 3rd level, one more at 10th, and one more at 17th. You can use only one Hex Trick per spell unless a trick says otherwise. Costs are in sorcery points. - Quick-Draw Hex (Quickened Spell) · 2 points. A spell with a casting time of 1 action is cast as a bonus action instead. - Smokeless Hex (Subtle Spell; renamed from Subtle Hex) · 1 point. Cast the spell with no verbal or somatic components: no crack, no muzzle flash, and nothing that shows it was you. - Twinned Hex (Twinned Spell) · points equal to the spell's level (1 for a cantrip). A spell that targets only one creature and doesn't have a range of self also hits a second creature in range, like a split-shot ricochet. One shell. - Empowered Hex (Empowered Spell) · 1 point. When you roll damage for a spell, reroll up to your Charisma modifier in damage dice (minimum 1). You must use the new rolls. You can use this even if you've already used a different Hex Trick on the spell. - Steady-Hand Hex (Careful Spell) · 1 point. When a spell forces other creatures to make a saving throw, choose up to your Charisma modifier of them (minimum 1). They automatically succeed, as the shell bends around your own posse. - Long-Barrel Hex (Distant Spell) · 1 point. A spell with a range of 5 feet or more has its range doubled, and a touch spell reaches 30 feet. - Slow-Burn Hex (Extended Spell) · 1 point. A spell with a duration of 1 minute or longer lasts twice as long, up to 24 hours. The shell keeps burning. - Hot-Load Hex (Heightened Spell) · 3 points. An overcharged shell: one target has disadvantage on its first saving throw against the spell."
    },
    {
     "name": "Sorcerous Restoration (20th lvl)",
     "text": "Regain 4 expended sorcery points whenever you finish a short rest."
    },
    {
     "name": "One of a kind Iron...",
     "text": "All hope is not lost: only rare specialist caster gunsmiths can make or replace a Caster Gun... for the right price. They are exceptionally hard to find across the frontier. Two irons, a full cylinder each: Carrying a pair of Caster Guns is a real Hexslinger build: two cylinders ready to go, so you can keep more shells loaded and spin either gun. Each gun needs its own attunement. Two guns don't give you more shells (your slots set those) or more spells per turn. The normal casting rules still apply."
    }
   ],
   "subclasses": [
    {
     "id": "demon-blood-draconic",
     "name": "Demon Blood",
     "phb5e": "Draconic",
     "features": [
      {
       "name": "Infernal Ancestor (1st level)",
       "text": "Choose the kind of demon in your blood. It sets your element: Ember (fire), Venom (poison), Bile (acid), Storm (lightning), or Rime (cold, from the frozen pit). You can speak, read, and write one extra language of your choice. When you make a Charisma check to deal with fiends, your proficiency bonus is doubled if it applies."
      },
      {
       "name": "Demon Hide (1st level)",
       "text": "While you aren't wearing armor, your AC equals 13 + your Dex modifier. Your hit point maximum increases by 1 per Hexslinger level."
      },
      {
       "name": "Fiendish Affinity (6th level)",
       "text": "When you cast a spell that deals damage of your ancestry's element, add your Cha modifier to one damage roll of that spell. When you cast it, you can also spend 1 sorcery point to gain resistance to that damage type for 1 hour."
      },
      {
       "name": "Demon Wings (14th level)",
       "text": "As a bonus action, sprout leathery demon wings, gaining a flying speed equal to your current speed. They last until you dismiss them as a bonus action. You can't manifest them while wearing armor unless the armor is made for them, and clothing not made for them may be ruined."
      },
      {
       "name": "Demon Glare (18th level)",
       "text": "As an action, spend 5 sorcery points to radiate a 60-foot aura of awe or fear (your choice) for 1 minute or until you lose concentration (as if concentrating on a spell). Each hostile creature that starts its turn in the aura must succeed on a Wisdom save against your spell save DC or be charmed (awe) or frightened (fear) until the aura ends. A creature that succeeds is immune to your aura for 24 hours."
      }
     ],
     "src": "BOOK1.md line 1957"
    },
    {
     "id": "chaos-wild-magic",
     "name": "Chaos",
     "phb5e": "Wild Magic",
     "features": [
      {
       "name": "Chaos Surge (1st level)",
       "text": "Immediately after you cast a Hexslinger spell of 1st level or higher, the DM can have you roll a d20. On a 1, roll on the Frontier Chaos table (p.87)."
      },
      {
       "name": "Tides of Chaos (1st level)",
       "text": "Gain advantage on one attack roll, ability check, or saving throw. Once you use this, you can't use it again until you finish a long rest. Before then, the DM can have you roll on the Frontier Chaos table immediately after you cast a Hexslinger spell of 1st level or higher; you then regain the use."
      },
      {
       "name": "Bend Luck (6th level)",
       "text": "When another creature you can see makes an attack roll, ability check, or saving throw, you can use your reaction and spend 2 sorcery points to roll 1d4 and add it to or subtract it from that roll (your choice). You can do this after the creature rolls but before any effects of the roll occur."
      },
      {
       "name": "Controlled Surge (14th level)",
       "text": "Whenever you roll on the Frontier Chaos table, roll twice and use either result."
      },
      {
       "name": "Powder Keg (Spell Bombardment - 18th level)",
       "text": "When you roll damage for a spell and roll the highest number possible on any of the dice, choose one of those dice, roll it again, and add that roll to the damage. Once per turn."
      }
     ],
     "src": "BOOK1.md line 1967"
    }
   ],
   "progression": {
    "columns": [
     "Level",
     "Prof.",
     "Features",
     "Cantrips",
     "Spells Known",
     "Sorcery Pts",
     "Hex Lead Shells 1st–5th",
     "Hex Lead Shells 6th–9th"
    ],
    "rows": [
     [
      "1st",
      "+2",
      "Caster Gun Spellcasting, Sorcerous Origin",
      "4",
      "2",
      "—",
      "2 — — — —",
      "— — — —"
     ],
     [
      "2nd",
      "+2",
      "Hex Well (Font of Magic)",
      "4",
      "3",
      "2",
      "3 — — — —",
      "— — — —"
     ],
     [
      "3rd",
      "+2",
      "Hex Tricks (2 known)",
      "4",
      "4",
      "3",
      "4 2 — — —",
      "— — — —"
     ],
     [
      "4th",
      "+2",
      "Ability Score Improvement",
      "5",
      "5",
      "4",
      "4 3 — — —",
      "— — — —"
     ],
     [
      "5th",
      "+3",
      "—",
      "5",
      "6",
      "5",
      "4 3 2 — —",
      "— — — —"
     ],
     [
      "6th",
      "+3",
      "Origin feature",
      "5",
      "7",
      "6",
      "4 3 3 — —",
      "— — — —"
     ],
     [
      "7th",
      "+3",
      "—",
      "5",
      "8",
      "7",
      "4 3 3 1 —",
      "— — — —"
     ],
     [
      "8th",
      "+3",
      "Ability Score Improvement",
      "5",
      "9",
      "8",
      "4 3 3 2 —",
      "— — — —"
     ],
     [
      "9th",
      "+4",
      "—",
      "5",
      "10",
      "9",
      "4 3 3 3 1",
      "— — — —"
     ],
     [
      "10th",
      "+4",
      "Hex Tricks (3 known)",
      "6",
      "11",
      "10",
      "4 3 3 3 2",
      "— — — —"
     ],
     [
      "11th",
      "+4",
      "—",
      "6",
      "12",
      "11",
      "4 3 3 3 2",
      "1 — — —"
     ],
     [
      "12th",
      "+4",
      "Ability Score Improvement",
      "6",
      "12",
      "12",
      "4 3 3 3 2",
      "1 — — —"
     ],
     [
      "13th",
      "+5",
      "—",
      "6",
      "13",
      "13",
      "4 3 3 3 2",
      "1 1 — —"
     ],
     [
      "14th",
      "+5",
      "Origin feature",
      "6",
      "13",
      "14",
      "4 3 3 3 2",
      "1 1 — —"
     ],
     [
      "15th",
      "+5",
      "—",
      "6",
      "14",
      "15",
      "4 3 3 3 2",
      "1 1 1 —"
     ],
     [
      "16th",
      "+5",
      "Ability Score Improvement",
      "6",
      "14",
      "16",
      "4 3 3 3 2",
      "1 1 1 —"
     ],
     [
      "17th",
      "+6",
      "Hex Tricks (4 known)",
      "6",
      "15",
      "17",
      "4 3 3 3 2",
      "1 1 1 1"
     ],
     [
      "18th",
      "+6",
      "Origin feature",
      "6",
      "15",
      "18",
      "4 3 3 3 3",
      "1 1 1 1"
     ],
     [
      "19th",
      "+6",
      "Ability Score Improvement",
      "6",
      "15",
      "19",
      "4 3 3 3 3",
      "2 1 1 1"
     ],
     [
      "20th",
      "+6",
      "Sorcerous Restoration",
      "6",
      "15",
      "20",
      "4 3 3 3 3",
      "2 2 1 1"
     ]
    ]
   },
   "multiclass": "Prerequisite: Charisma 13. Western archetypes and frontier flavor apply directly.",
   "hexLeadRest": "long"
  },
  {
   "id": "pact-seeker",
   "name": "Pact Seeker",
   "class5e": "Warlock",
   "src": "BOOK1.md line 1985",
   "hitDie": "d8",
   "primary": "Cha",
   "saves": [
    "WIS",
    "CHA"
   ],
   "spellAbility": "CHA",
   "caster": "pact",
   "proficiencies": "Hit Die: 1d8 per level · Proficiencies & Kit: Light armor · Simple weapons, Herringer pistols · Borrowed Iron (pact focus, granted by your patron), dungeoneer pack, duster.",
   "armorProf": "Light armor",
   "weaponProf": "Simple weapons, Herringer pistols",
   "kit": "Borrowed Iron (pact focus, granted by your patron), dungeoneer pack, duster.",
   "features": [
    {
     "name": "The Borrowed Iron (1st lvl)",
     "text": "Manifests as the weapon your patron grants. You won't know its true shape until the pact is sealed. Your magic comes from it: you can't cast your Pact Seeker spells (cantrips and Mystic Arcanum included) unless the Borrowed Iron is in your hand. Soul-bound: it can't be lost or sold. If you're disarmed or separated from it, it dissolves to ash and returns to your hand at the start of your next turn (out of combat, a heartbeat later). It has no weapon stats, ammo, or reload, and fires only spells, like Eldritch Blast (Pact Shot). It's your pact focus, not a Caster Gun. The hand holding it can perform your Pact Seeker spells' somatic components, so one or two hands is just looks."
    },
    {
     "name": "Pact Magic (1st lvl)",
     "text": "Charisma spellcasting. All spell slots are maximum spell level and recover on a short rest. Focus: the Borrowed Iron, and nothing else. You cast only with it in your hand (see The Borrowed Iron)."
    },
    {
     "name": "Signed Invocations (2nd lvl)",
     "text": "Contract clauses: Agonizing Blast (add Cha mod to damage), Devil's Sight (see in magical dark), Repelling Blast (push 10 ft)."
    },
    {
     "name": "Pact Boon (3rd lvl)",
     "text": "Choose: The Fixed Bayonet (Blade), The Black Ledger (Tome), or The Familiar Spy (Chain). Fixed Bayonet: your Borrowed Iron can take a melee form (bayonet, stock-spike, pistol-butt club, or any PHB melee weapon) under the PHB Pact of the Blade rules. It still fires only spells."
    },
    {
     "name": "Mystic Arcanum & Eldritch Master (11th, 20th lvl)",
     "text": "Cast 6th, 7th, 8th, and 9th level spells once per long rest; spend 1 minute to regain all pact slots."
    },
    {
     "name": "The Soul-Bound Ledger",
     "text": "No gunsmith made the Borrowed Iron; it's soul-bound. Knock it from the seeker's hand and it dissolves into ash, only to rematerialize in their palm at the start of their next turn. Until then, their magic is silent. Holsters are strictly for show."
    }
   ],
   "subclasses": [
    {
     "id": "the-crossroads-note",
     "name": "The Crossroads Note",
     "phb5e": "",
     "features": [
      {
       "name": "Pact",
       "text": "Signed at midnight where two roads cross. The terms were generous. The interest is something else."
      }
     ],
     "src": "BOOK1.md line 2060",
     "group": "Choose a Pact",
     "intro": "You don't choose your patron. You choose the deal you remember making: the name you'd give it if anyone ever asked. Pick a pact name and tell your DM. Your DM reveals who's on the other side of it, and what your Borrowed Iron really is. Don't expect the whole truth on day one."
    },
    {
     "id": "the-sealed-orders",
     "name": "The Sealed Orders",
     "phb5e": "",
     "features": [
      {
       "name": "Pact",
       "text": "Someone very high up has work for you. He doesn't explain, and he doesn't take no."
      }
     ],
     "src": "BOOK1.md line 2060",
     "group": "Choose a Pact",
     "intro": "You don't choose your patron. You choose the deal you remember making: the name you'd give it if anyone ever asked. Pick a pact name and tell your DM. Your DM reveals who's on the other side of it, and what your Borrowed Iron really is. Don't expect the whole truth on day one."
    },
    {
     "id": "lass-o-lakes",
     "name": "Lass O' Lakes",
     "phb5e": "",
     "features": [
      {
       "name": "Pact",
       "text": "The lake remembers your name, though you don't remember giving it. Something beautiful is waiting beneath the surface, and it has a favor to ask."
      }
     ],
     "src": "BOOK1.md line 2060",
     "group": "Choose a Pact",
     "intro": "You don't choose your patron. You choose the deal you remember making: the name you'd give it if anyone ever asked. Pick a pact name and tell your DM. Your DM reveals who's on the other side of it, and what your Borrowed Iron really is. Don't expect the whole truth on day one."
    },
    {
     "id": "the-last-round",
     "name": "The Last Round",
     "phb5e": "",
     "features": [
      {
       "name": "Pact",
       "text": "You didn't find the gun. The gun found you, and it's been talking ever since."
      }
     ],
     "src": "BOOK1.md line 2060",
     "group": "Choose a Pact",
     "intro": "You don't choose your patron. You choose the deal you remember making: the name you'd give it if anyone ever asked. Pick a pact name and tell your DM. Your DM reveals who's on the other side of it, and what your Borrowed Iron really is. Don't expect the whole truth on day one."
    },
    {
     "id": "the-sand-oath",
     "name": "The Sand Oath",
     "phb5e": "",
     "features": [
      {
       "name": "Pact",
       "text": "Sworn on a hot wind that smelled of spice and lightning. He wants a gift, and it'd better be one of a kind."
      }
     ],
     "src": "BOOK1.md line 2060",
     "group": "Choose a Pact",
     "intro": "You don't choose your patron. You choose the deal you remember making: the name you'd give it if anyone ever asked. Pick a pact name and tell your DM. Your DM reveals who's on the other side of it, and what your Borrowed Iron really is. Don't expect the whole truth on day one."
    },
    {
     "id": "the-pine-box-contract",
     "name": "The Pine Box Contract",
     "phb5e": "",
     "features": [
      {
       "name": "Pact",
       "text": "Every grave you fill pays down the debt. Somebody tall is keeping count."
      }
     ],
     "src": "BOOK1.md line 2060",
     "group": "Choose a Pact",
     "intro": "You don't choose your patron. You choose the deal you remember making: the name you'd give it if anyone ever asked. Pick a pact name and tell your DM. Your DM reveals who's on the other side of it, and what your Borrowed Iron really is. Don't expect the whole truth on day one."
    },
    {
     "id": "the-drowned-breath",
     "name": "The Drowned Breath",
     "phb5e": "",
     "features": [
      {
       "name": "Pact",
       "text": "You owe your last breath to something that doesn't breathe air. It'll want that breath back, one favor at a time."
      }
     ],
     "src": "BOOK1.md line 2060",
     "group": "Choose a Pact",
     "intro": "You don't choose your patron. You choose the deal you remember making: the name you'd give it if anyone ever asked. Pick a pact name and tell your DM. Your DM reveals who's on the other side of it, and what your Borrowed Iron really is. Don't expect the whole truth on day one."
    }
   ],
   "progression": {
    "columns": [
     "Level",
     "Prof.",
     "Features",
     "Cantrips",
     "Spells Known",
     "Slots",
     "Slot Level"
    ],
    "rows": [
     [
      "1st",
      "+2",
      "Borrowed Iron, Pact Name (DM reveals patron), Pact Magic",
      "2",
      "2",
      "1",
      "1st"
     ],
     [
      "2nd",
      "+2",
      "Signed Invocations (2 known)",
      "2",
      "3",
      "2",
      "1st"
     ],
     [
      "3rd",
      "+2",
      "Pact Boon",
      "2",
      "4",
      "2",
      "2nd"
     ],
     [
      "4th",
      "+2",
      "Ability Score Improvement",
      "3",
      "5",
      "2",
      "2nd"
     ],
     [
      "5th",
      "+3",
      "Invocations (3 known)",
      "3",
      "6",
      "2",
      "3rd"
     ],
     [
      "6th",
      "+3",
      "Patron feature",
      "3",
      "7",
      "2",
      "3rd"
     ],
     [
      "7th",
      "+3",
      "Invocations (4 known)",
      "3",
      "8",
      "2",
      "4th"
     ],
     [
      "8th",
      "+3",
      "Ability Score Improvement",
      "3",
      "9",
      "2",
      "4th"
     ],
     [
      "9th",
      "+4",
      "Invocations (5 known)",
      "3",
      "10",
      "2",
      "5th"
     ],
     [
      "10th",
      "+4",
      "Patron feature",
      "4",
      "10",
      "2",
      "5th"
     ],
     [
      "11th",
      "+4",
      "Mystic Arcanum (6th level)",
      "4",
      "11",
      "3",
      "5th"
     ],
     [
      "12th",
      "+4",
      "Ability Score Improvement, Invocations (6)",
      "4",
      "11",
      "3",
      "5th"
     ],
     [
      "13th",
      "+5",
      "Mystic Arcanum (7th level)",
      "4",
      "12",
      "3",
      "5th"
     ],
     [
      "14th",
      "+5",
      "Patron feature",
      "4",
      "12",
      "3",
      "5th"
     ],
     [
      "15th",
      "+5",
      "Mystic Arcanum (8th level), Invocations (7)",
      "4",
      "13",
      "3",
      "5th"
     ],
     [
      "16th",
      "+5",
      "Ability Score Improvement",
      "4",
      "13",
      "3",
      "5th"
     ],
     [
      "17th",
      "+6",
      "Mystic Arcanum (9th level)",
      "4",
      "14",
      "4",
      "5th"
     ],
     [
      "18th",
      "+6",
      "Invocations (8 known)",
      "4",
      "14",
      "4",
      "5th"
     ],
     [
      "19th",
      "+6",
      "Ability Score Improvement",
      "4",
      "15",
      "4",
      "5th"
     ],
     [
      "20th",
      "+6",
      "Eldritch Master",
      "4",
      "15",
      "4",
      "5th"
     ]
    ]
   },
   "multiclass": "Prerequisite: Charisma 13. Western archetypes and frontier flavor apply directly.",
   "hexLeadRest": "short"
  },
  {
   "id": "scholar",
   "name": "Scholar",
   "class5e": "Wizard",
   "src": "BOOK1.md line 2080",
   "hitDie": "d6",
   "primary": "Int",
   "saves": [
    "INT",
    "WIS"
   ],
   "spellAbility": "INT",
   "caster": "full",
   "proficiencies": "Hit Die: 1d6 per level · Proficiencies & Kit: Armor: None · Daggers, quarterstaffs (weighted walking canes), darts, slings, Herringer pistols, the Dullards Plinker · Chemical Field Ledger, prism, galvanic reagents, scholar pack, duster.",
   "armorProf": "None",
   "weaponProf": "Daggers, quarterstaffs (weighted walking canes), darts, slings, Herringer pistols, the Dullards Plinker",
   "kit": "Chemical Field Ledger, prism, galvanic reagents, scholar pack, duster.",
   "features": [
    {
     "name": "Empirical Spellcasting (1st lvl)",
     "text": "Intelligence spellcasting. Spells prepared from your Chemical Field Ledger. Focus: any scientific instrument or medium you devise (for example a journal or ledger, compass, tuning fork, or lens). Spells manifest as empirical reactions: Shield pops magnesium flash; Fireball launches pressurized nitroglycerin. Scholars don't cast magic. They use science: how yours pulls off each spell is up to you and your DM."
    },
    {
     "name": "Lost Ledger",
     "text": "If your ledger is lost, burned, or soaked, you can cast only the spells you have prepared. Re-copying a spell you still have prepared costs 1 hour and 1,000 ES per spell level. Any other spell costs 2 hours and 5,000 ES per level."
    },
    {
     "name": "Bad Data",
     "text": "When a creature succeeds on a saving throw against a spell you cast, you have disadvantage on the next Intelligence check you make before you finish a short rest. This happens only once per casting."
    },
    {
     "name": "Dust-Lamp Recovery (Arcane Recovery - 1st lvl)",
     "text": "Study your ledger during a short rest to recover expended spell slots equal to half wizard level (rounded up) once per day."
    },
    {
     "name": "Spell Mastery & Signature Spells (18th, 20th lvl)",
     "text": "Spell Mastery (18th): choose one 1st-level and one 2nd-level spell in your ledger. While they're prepared, you can cast each at its lowest level without expending a slot. Signature Spells (20th): choose two 3rd-level spells in your ledger. They're always prepared and don't count against your prepared spells, and you can cast each once at 3rd level without a slot. You regain that use when you finish a short or long rest."
    },
    {
     "name": "Scientific Reason",
     "text": "They believe in ghosts; they just have a scientific explanation for it! In the new world, magic is treated not as divine mystery, but as quantifiable laws of physics and biology awaiting proper field equations."
    }
   ],
   "subclasses": [
    {
     "id": "law-of-statistical-probability-divination",
     "name": "Law of Statistical Probability",
     "phb5e": "Divination",
     "features": [
      {
       "name": "Discipline",
       "text": "\"The Sight\" or \"True Grit.\" Calculates vectors and psychological tells to predict enemy moves or time lethal trick shots."
      }
     ],
     "src": "BOOK1.md line 2155"
    },
    {
     "id": "law-of-neurological-suggestion-enchantment",
     "name": "Law of Neurological Suggestion",
     "phb5e": "Enchantment",
     "features": [
      {
       "name": "Discipline",
       "text": "Exploits biological frequencies through hypnotic cadence and sonic vibrations to pacify saloons or freeze bounties."
      }
     ],
     "src": "BOOK1.md line 2156"
    },
    {
     "id": "law-of-thermodynamic-transfer-evocation",
     "name": "Law of Thermodynamic Transfer",
     "phb5e": "Evocation",
     "features": [
      {
       "name": "Discipline",
       "text": "Focuses on violent releases of stored energy: sparks brushfires, arcs lightning, or drains heat to freeze locks."
      }
     ],
     "src": "BOOK1.md line 2157"
    },
    {
     "id": "law-of-refractive-photon-manipulation-illusion",
     "name": "Law of Refractive Photon Manipulation",
     "phb5e": "Illusion",
     "features": [
      {
       "name": "Discipline",
       "text": "Physically bends light waves to create mirages, duplicate silhouettes in duels, or mask break-outs."
      }
     ],
     "src": "BOOK1.md line 2158"
    },
    {
     "id": "law-of-cellular-degradation-animation-necromancy",
     "name": "Law of Cellular Degradation & Animation",
     "phb5e": "Necromancy",
     "features": [
      {
       "name": "Discipline",
       "text": "Deals with biological decay; saps caloric energy or channels currents to animate dead tissue."
      }
     ],
     "src": "BOOK1.md line 2159"
    },
    {
     "id": "law-of-molecular-realignment-transmutation",
     "name": "Law of Molecular Realignment",
     "phb5e": "Transmutation",
     "features": [
      {
       "name": "Discipline",
       "text": "Alters atomic structures: turns lead to gold, hardens leather to bulletproof hide, or softens vault iron."
      }
     ],
     "src": "BOOK1.md line 2160"
    },
    {
     "id": "law-of-kinetic-thaumaturgical-dampening-abjuration",
     "name": "Law of Kinetic & Thaumaturgical Dampening",
     "phb5e": "Abjuration",
     "features": [
      {
       "name": "Discipline",
       "text": "Wardwright barriers that absorb explosive shockwaves and dissipate arcane backlashes."
      }
     ],
     "src": "BOOK1.md line 2161"
    },
    {
     "id": "law-of-spatial-displacement-manifestation-conjuration",
     "name": "Law of Spatial Displacement & Manifestation",
     "phb5e": "Conjuration",
     "features": [
      {
       "name": "Discipline",
       "text": "Spatial clerks calculating folded coordinates to draw ammo, mounts, and gear instantly."
      }
     ],
     "src": "BOOK1.md line 2162"
    }
   ],
   "progression": {
    "columns": [
     "Level",
     "Prof.",
     "Features",
     "Cantrips",
     "Slots (1st–5th · 6th–9th)"
    ],
    "rows": [
     [
      "1st",
      "+2",
      "Empirical Spellcasting, Dust-Lamp Recovery",
      "3",
      "2 — — — —"
     ],
     [
      "2nd",
      "+2",
      "Scholarly Discipline (Arcane Tradition)",
      "3",
      "3 — — — —"
     ],
     [
      "3rd",
      "+2",
      "—",
      "3",
      "4 2 — — —"
     ],
     [
      "4th",
      "+2",
      "Ability Score Improvement",
      "4",
      "4 3 — — —"
     ],
     [
      "5th",
      "+3",
      "—",
      "4",
      "4 3 2 — —"
     ],
     [
      "6th",
      "+3",
      "Discipline feature",
      "4",
      "4 3 3 — —"
     ],
     [
      "7th",
      "+3",
      "—",
      "4",
      "4 3 3 1 —"
     ],
     [
      "8th",
      "+3",
      "Ability Score Improvement",
      "4",
      "4 3 3 2 —"
     ],
     [
      "9th",
      "+4",
      "—",
      "4",
      "4 3 3 3 1"
     ],
     [
      "10th",
      "+4",
      "Discipline feature",
      "5",
      "4 3 3 3 2"
     ],
     [
      "11th",
      "+4",
      "—",
      "5",
      "4 3 3 3 2 · 1 — — —"
     ],
     [
      "12th",
      "+4",
      "Ability Score Improvement",
      "5",
      "4 3 3 3 2 · 1 — — —"
     ],
     [
      "13th",
      "+5",
      "—",
      "5",
      "4 3 3 3 2 · 1 1 — —"
     ],
     [
      "14th",
      "+5",
      "Discipline feature",
      "5",
      "4 3 3 3 2 · 1 1 — —"
     ],
     [
      "15th",
      "+5",
      "—",
      "5",
      "4 3 3 3 2 · 1 1 1 —"
     ],
     [
      "16th",
      "+5",
      "Ability Score Improvement",
      "5",
      "4 3 3 3 2 · 1 1 1 —"
     ],
     [
      "17th",
      "+6",
      "—",
      "5",
      "4 3 3 3 2 · 1 1 1 1"
     ],
     [
      "18th",
      "+6",
      "Spell Mastery",
      "5",
      "4 3 3 3 3 · 1 1 1 1"
     ],
     [
      "19th",
      "+6",
      "Ability Score Improvement",
      "5",
      "4 3 3 3 3 · 2 1 1 1"
     ],
     [
      "20th",
      "+6",
      "Signature Spells",
      "5",
      "4 3 3 3 3 · 2 2 1 1"
     ]
    ]
   },
   "multiclass": "Prerequisite: Intelligence 13. Western archetypes and frontier flavor apply directly.",
   "hexLeadRest": "long"
  }
 ],
 "backgrounds": [
  {
   "id": "chapel-hand",
   "name": "Chapel Hand",
   "twin5e": "Acolyte",
   "src": "BOOK1.md line 2389",
   "skills": "Insight, Religion",
   "tools": "",
   "languages": "Two of your choice",
   "equipment": "Holy symbol (saint-medal / Eldorite seal), prayer book or hymn folio, 5 incense sticks (or candle stubs), vestments (circuit coat), common clothes, pouch with 1,500 ES",
   "feature": {
    "name": "Circuit Welcome",
    "twin5e": "Shelter of the Faithful",
    "text": "Free modest lodging and meals at chapels, circuit camps, and friendly creed-houses. Priests aid with information and healing within reason — they won’t fight your battles unless their creed is on the line."
   },
   "traits": {
    "personality": [
     "Quotes scripture when nervous; can’t ride past a grave without a word.",
     "I see omens in dust, crow-flight, and the way a candle gutters.",
     "I treat every stranger like a soul that might still be saved — until they prove otherwise.",
     "I keep a quiet humor; the dying don’t need another sermon — they need a hand and water.",
     "I polish my saint-medal until the brass shows through — habit from Neverwinter’s last chapels.",
     "I interrupt blasphemy soft, then offer to share water like it’s the real rite.",
     "I remember every name I’ve buried. I say them when the trail goes quiet.",
     "I’m gentler with animals and children than with adults who should know better."
    ],
    "ideals": [
     "Mercy. Even outlaws get water and a last rite.",
     "Tradition. The old rites still matter when the Weave goes dark.",
     "Charity. What little I have is meant to be spent on the hungry.",
     "Faith. Gods or ground-spirits — neither’s done with us yet.",
     "Aspiration. I’ll raise a chapel worth the crossing, even if I raise the beams alone.",
     "Power. A collar opens doors a badge can’t — and I know how to knock."
    ],
    "bonds": [
     "The hymn-book from the crossing must reach a proper chapel on the far shore.",
     "I owe my life to a circuit preacher who stayed behind so others could board.",
     "A congregation that scattered on the docks still expects me to find them.",
     "I carry ashes of a friend who never got a proper grave — America’s dirt will have to do.",
     "My order’s seal still opens doors; I won’t shame the collar that trusts me.",
     "I promised a dying sailor I’d look after their child on the far shore."
    ],
    "flaws": [
     "Trusts a collar faster than any badge.",
     "I judge folk by how they talk about the dead — and I show it.",
     "I can’t refuse a last confession, even when the posse is closing in.",
     "I hide doubt behind doctrine; questions feel like a crack in the levee.",
     "I forgive too easily — some debts should stay unpaid.",
     "I preach when a whisper would do, and it draws the wrong kind of attention."
    ]
   },
   "skillList": [
    "Insight",
    "Religion"
   ]
  },
  {
   "id": "snake-oil-cardsharp",
   "name": "Snake-Oil / Cardsharp",
   "twin5e": "Charlatan",
   "src": "BOOK1.md line 2461",
   "skills": "Deception, Sleight of Hand",
   "tools": "Disguise kit, forgery kit",
   "languages": "",
   "equipment": "Fine clothes (threadbare flash), disguise kit, tools of the con (weighted dice, marked deck, fake assay papers), pouch with 1,500 ES",
   "feature": {
    "name": "Alias on the Felt",
    "twin5e": "False Identity",
    "text": "You have a second identity with papers good enough for hotels, stages, and low law. You can forge documents well enough to fool a casual check."
   },
   "traits": {
    "personality": [
     "Always smiling; never drinks what they pour first — or last.",
     "I invent a new past every time someone asks where I’m from.",
     "I tip well with other people’s coin and vanish before the bottle runs dry.",
     "I read a room like a marked deck — who wants hope, who wants a fight.",
     "I collect accents the way other folk collect scars.",
     "I’d rather talk my way out of a noose than cut the rope.",
     "I keep three stories ready: one true, one kind, one useful.",
     "I compliment the iron before I compliment the hand that wears it."
    ],
    "ideals": [
     "Reinvention. Every town is a new birth certificate.",
     "Independence. Nobody owns my name but me — and I sell that cheap.",
     "Fairness. A mark who can afford it deserves a gentle fleecing — not a skinning.",
     "Creativity. The best lie is almost true.",
     "Greed. Hope is the only currency that never empties.",
     "People. I’ll cheat a magistrate before I cheat a hungry greenhorn — usually."
    ],
    "bonds": [
     "One mark from Neverwinter still rides my trail.",
     "My best alias has a family somewhere who still write letters home.",
     "I owe a fence who booked my berth — and they keep receipts.",
     "There’s a deck of cards that got me off the last ship; I won’t play without it.",
     "A partner in the old con took a brand meant for me.",
     "I promised myself one clean score out west — then I’m done. (I’m never done.)"
    ],
    "flaws": [
     "Can’t resist a greenhorn with a heavy purse and soft eyes.",
     "I talk too much when the bluff should stay quiet.",
     "I believe my own stories just long enough to get caught.",
     "I keep a trophy from every big mark — vanity that’ll hang me.",
     "I’d rather run than face a truth that doesn’t pay.",
     "I assume everyone’s running a game; trust feels like a sucker’s bet."
    ]
   },
   "skillList": [
    "Deception",
    "Sleight of Hand"
   ]
  },
  {
   "id": "outlaw",
   "name": "Outlaw",
   "twin5e": "Criminal",
   "src": "BOOK1.md line 2533",
   "skills": "Deception, Stealth",
   "tools": "One gaming set, thieves’ tools",
   "languages": "",
   "equipment": "Crowbar (or claim pry-bar), dark common clothes with a hood/duster, pouch with 1,500 ES",
   "feature": {
    "name": "Fence Wire",
    "twin5e": "Criminal Contact",
    "text": "You have a reliable contact in the outlaw network (smuggler, fence, dock rat). They can get messages to other criminals; expect favors to be called in."
   },
   "traits": {
    "personality": [
     "Counts exits before chairs — and chairs before friends.",
     "I sleep with my boots toward the door and my iron under the pillow.",
     "I tip bartenders; deputies can tip themselves.",
     "I speak soft around lawmen and loud around fools.",
     "I keep my word to partners; everyone else gets whatever weather I bring.",
     "I notice brands, scars, and who watches the alley.",
     "I’d rather steal a key than pick a lock in front of witnesses.",
     "I laugh at hanging jokes — somebody’s got to."
    ],
    "ideals": [
     "Freedom. No magistrate owns my breath.",
     "Honor. There’s a code even among thieves — break it and you’re meat.",
     "Greed. Take what the dying Weave left sitting on the table.",
     "People. My crew eats before I do.",
     "Redemption. One clean life out west, if the past will let me.",
     "Might. The strong take; the weak write warrants and cry for badges."
    ],
    "bonds": [
     "The partner who took the fall so I could board.",
     "There’s a cache buried under an old Neverwinter pier — if the tide left it.",
     "I still owe a dock boss who can ruin me with one letter.",
     "Someone I love wears a brand that should have been mine.",
     "I won’t let the outfit that raised me starve, even if they’ve gone mean.",
     "A judge signed my death warrant; I mean to outlive the paper."
    ],
    "flaws": [
     "A bounty poster with my jawline hangs somewhere I’ve already been.",
     "I can’t walk past an unlocked till without my fingers itching.",
     "I answer insults with iron faster than sense.",
     "I trust the wrong smiles if they sound like home.",
     "I keep proof of old jobs — souvenirs that hang me.",
     "I’d rather burn a bridge than admit I need help crossing it."
    ]
   },
   "skillList": [
    "Deception",
    "Stealth"
   ]
  },
  {
   "id": "saloon-act",
   "name": "Saloon Act",
   "twin5e": "Entertainer",
   "src": "BOOK1.md line 2605",
   "skills": "Acrobatics, Performance",
   "tools": "Disguise kit, one musical instrument",
   "languages": "",
   "equipment": "Instrument, favor of an admirer (letter, lock of hair, cheap cameo), costume (stage coat), pouch with 1,500 ES",
   "feature": {
    "name": "Always a Stage",
    "twin5e": "By Popular Demand",
    "text": "You can always find a place to perform (saloon, camp, stage stop). Modest lodging and food follow; your act makes you a local curiosity — for good or ill."
   },
   "traits": {
    "personality": [
     "Turns pain into a punchline before the bruise shows.",
     "I hum when I’m nervous and whistle when I’m lying.",
     "I remember every face that threw a coin — and every face that threw a bottle.",
     "I dress like the saloon owes me a spotlight.",
     "I collect stories the way other folk collect scars.",
     "I bow too deep and tip my hat too often — old stage manners that won’t die.",
     "I can’t pass a piano without finding out if it’s in tune.",
     "I flatter the dangerous and tease the safe."
    ],
    "ideals": [
     "Beauty. One true song in a dirty room.",
     "Creativity. If it isn’t worth performing, it isn’t worth living.",
     "People. A room that laughs together won’t hang each other.",
     "Honesty. The act is the mask; the song is the truth.",
     "Greed. Applause is nice; coin buys the next stage.",
     "Freedom. No company owns my voice."
    ],
    "bonds": [
     "The partner who vanished after the last Neverwinter show.",
     "My instrument survived the crossing; it’s worth more than my life.",
     "A patron in Neverwinter still holds my debt — and my best songs.",
     "I swore I’d play the first real stage out west with my own name on the bill.",
     "The troupe that raised me scattered; I mean to find who’s left.",
     "Someone in the crowd once saved me from a knife; I still look for that face."
    ],
    "flaws": [
     "Needs an audience worse than water on a dry trail.",
     "I can’t resist one more encore when the smart play is to leave.",
     "I steal scenes — and credit — from friends.",
     "I drink the tip jar when the night goes cold and the crowd thins.",
     "I’d rather be loved by strangers than trusted by companions.",
     "I mock danger until danger answers back."
    ]
   },
   "skillList": [
    "Acrobatics",
    "Performance"
   ]
  },
  {
   "id": "honorable-figure",
   "name": "Honorable Figure",
   "twin5e": "Folk Hero",
   "src": "BOOK1.md line 2677",
   "skills": "Animal Handling, Survival",
   "tools": "One type of artisan’s tools, vehicles (land)",
   "languages": "",
   "equipment": "Artisan’s tools, shovel or similar, iron pot, common clothes, pouch with 1,000 ES",
   "feature": {
    "name": "Homestead Welcome",
    "twin5e": "Rustic Hospitality",
    "text": "Common folk (settlers, ranch hands, miners) will hide you from soft-handed law and provide a meal and a loft. They won’t hang for you, but they’ll warn you when riders come."
   },
   "traits": {
    "personality": [
     "Uncomfortable in silk; easy in a barn or a claim shack.",
     "I judge a person by how they treat a tired horse.",
     "I tell the truth even when a soft lie would save trouble.",
     "I keep my hands busy — idle fingers make me mean.",
     "I tip my hat to workers and forget soft titles.",
     "I remember every bully who ever wore a badge or a crest.",
     "I’m slow to anger and slower to forget.",
     "I share tobacco and water before I share my family name."
    ],
    "ideals": [
     "Fairness. The claim shouldn’t belong only to magistrates and soft hands.",
     "Freedom. No soft-handed law gets to fence free folk.",
     "Respect. Everyone who works the dirt earns a voice.",
     "Might. Stand tall or get stepped into the dirt.",
     "Sincerity. If I say I’ll stand with you, I stand.",
     "Destiny. Somebody’s got to be the story common folk tell by the fire."
    ],
    "bonds": [
     "The homestead that still flies my favor-cloth.",
     "I won’t let the valley that raised me get sold out from under it.",
     "A child I saved still writes — I keep every letter.",
     "The tool that built my name — shovel, hammer, or plow — rides with me.",
     "I owe the neighbors who lied to the riders for me.",
     "Someone powerful wants my story buried; I won’t oblige."
    ],
    "flaws": [
     "Can’t walk away from a bully wearing a badge.",
     "I distrust anyone who never got dirt under their nails.",
     "I’d rather fight than negotiate with soft hands.",
     "I take every slight against common folk as personal.",
     "I hide my fear of failing the folk who believe the stories about me.",
     "I’m stubborn past sense when my pride’s in it."
    ]
   },
   "skillList": [
    "Animal Handling",
    "Survival"
   ]
  },
  {
   "id": "craft-guild-exile",
   "name": "Craft Guild Exile",
   "twin5e": "Guild Artisan",
   "src": "BOOK1.md line 2749",
   "skills": "Insight, Persuasion",
   "tools": "One type of artisan’s tools",
   "languages": "One of your choice",
   "equipment": "Artisan’s tools, guild letter of introduction, traveler’s clothes, pouch with 1,500 ES",
   "feature": {
    "name": "Maker’s Mark",
    "twin5e": "Guild Membership",
    "text": "Fellow craft-folk offer lodging and work leads. You can get an audience with guild officers; unpaid dues and rival guilds may complicate things."
   },
   "traits": {
    "personality": [
     "Judges people by the stitching on their clothes, the solder on their tools, and the wear on their boots.",
     "I correct bad craft out loud — manners be damned.",
     "I keep my tools cleaner than my boots.",
     "I talk shop until eyes glaze; then I talk louder.",
     "I tip well for good work and stiff the cheap hands.",
     "I sketch inventions in the margins of every scrap of paper.",
     "I respect a fair price and hate a gouge.",
     "I introduce myself by trade before I offer a name."
    ],
    "ideals": [
     "Aspiration. Build something that outlasts the Weave going quiet.",
     "Community. Makers look after makers.",
     "People. Honest work deserves honest pay.",
     "Greed. My mark on a thing means my cut when it sells.",
     "Freedom. No guild master owns my hands anymore.",
     "Logic. Measure twice; pray once — if at all."
    ],
    "bonds": [
     "The master who paid my berth and expects repayment in labor.",
     "My guild letter is the last proof I belonged somewhere.",
     "I left unfinished work in Neverwinter that haunts me.",
     "An apprentice I couldn’t take still waits for word.",
     "I’ll prove honest craft matters more than magistrate spark.",
     "A rival guild ruined my name; out west is where I rebuild it."
    ],
    "flaws": [
     "Contempt for “unskilled” dust-eaters who never held a proper tool.",
     "I overpromise on deadlines when pride’s involved.",
     "I can’t leave a broken thing alone — even when it’s not mine.",
     "I assume coin solves every quarrel between makers.",
     "I hoard techniques the way misers hoard Eldorite.",
     "I’d rather lose a friend than admit a botched join."
    ]
   },
   "skillList": [
    "Insight",
    "Persuasion"
   ]
  },
  {
   "id": "desert-hermit",
   "name": "Desert Hermit",
   "twin5e": "Hermit",
   "src": "BOOK1.md line 2824",
   "skills": "Medicine, Religion",
   "tools": "Herbalism kit",
   "languages": "One of your choice",
   "equipment": "Scroll case of notes (the vision), winter blanket, common clothes, herbalism kit, pouch with 500 ES",
   "feature": {
    "name": "Vision of Dying Magic",
    "twin5e": "Discovery",
    "text": "You carry a true vision of magic failing somewhere else — not Neverwinter’s collapse, but a second dying. Work with the DM on what you saw (sky color, a mineral glow, voices, a green land going wrong). It does not hand you a place-name; at most you have a feeling that the advertised America is not the whole truth. The vision drives you, unsettles casters who hear it, and draws heat from people who want such talk buried."
   },
   "traits": {
    "personality": [
     "Speaks little; stares like open range after rain.",
     "I answer questions with questions, or with silence.",
     "I prefer the company of wind and stone to chatter.",
     "I keep rituals that look like madness to town folk and soft priests.",
     "I notice what others ignore — cracks in plaster, wrong birds.",
     "I offer tea and hard truths in the same breath.",
     "I flinch at bells, crowds, and sudden kindness.",
     "I name things by what they do, not what the maps claim."
    ],
    "ideals": [
     "Knowledge. Better a hard truth than a soft hymn from a full belly.",
     "Live and Let Live. Leave me the waste; keep your noisy towns.",
     "Free Thinking. Dogma died with the Weave — think for yourself.",
     "Power. What I saw could unmake men who bury truth under paper.",
     "Self-Knowledge. Understand the vision or be eaten by it.",
     "Greater Good. If magic is dying twice, somebody must warn the living."
    ],
    "bonds": [
     "The waste place where the vision struck — I still dream of returning to understand it.",
     "My notes are incomplete; I need one more sign to finish them.",
     "A teacher who drove me out still holds the other half of the secret.",
     "I crossed because the vision pointed west — not for comfort or coin.",
     "Someone laughed at the vision; I mean to make them see.",
     "I protect the quiet places; noise feels like blasphemy."
    ],
    "flaws": [
     "Social rooms feel like traps; I trust the vision more than any map.",
     "I speak in riddles when plain talk would save lives.",
     "I abandon companions when the trail of meaning pulls harder.",
     "I distrust healers who never spent a night under open sky.",
     "I hoard the vision like treasure and share it too late.",
     "I forget to eat, sleep, or wash when the seeing comes on hard."
    ]
   },
   "skillList": [
    "Medicine",
    "Religion"
   ]
  },
  {
   "id": "fallen-aristocrat",
   "name": "Fallen Aristocrat",
   "twin5e": "Noble",
   "src": "BOOK1.md line 2899",
   "skills": "History, Persuasion",
   "tools": "One gaming set",
   "languages": "One of your choice",
   "equipment": "Fine clothes (mended), scroll of pedigree (or forged), signet ring or house pin, pouch with 2,500 ES",
   "feature": {
    "name": "Old-House Name",
    "twin5e": "Position of Privilege",
    "text": "People defer if they recognize the house — or the accent. You can get audiences with local gentry, magistrates’ clerks, and officers where common folk wait."
   },
   "traits": {
    "personality": [
     "Correct posture even when broke and dust-bitten.",
     "I expect doors to open — and I’m surprised when they don’t.",
     "I compliment silverware and insult manners with the same soft voice.",
     "I keep my gloves clean longer than the dust allows.",
     "I remember every slight from the crossing queues.",
     "I tip as if I still kept a steward on payroll.",
     "I default to titles until someone corrects me twice.",
     "I hide fear behind etiquette and a clean cuff."
    ],
    "ideals": [
     "Responsibility. Power owes the folk it failed.",
     "Nobility. Birth still means something — or it should.",
     "Power. Influence is the only inheritance worth the dust.",
     "Family. The house name outlives any one of us.",
     "Respect. Courtesy is the last law when the Weave fails.",
     "Independence. I will not be anyone’s ornamental exile."
    ],
    "bonds": [
     "Restore the house name out west — or bury it clean.",
     "A sibling or cousin still holds the real deed — or the forgery.",
     "I swore on my mother’s ring I’d never beg; I may have to break that.",
     "Servants who stayed loyal deserve better than empty promises.",
     "A rival house engineered our fall; debt is not forgotten.",
     "My pedigree scroll is stained but true — I’ll prove it."
    ],
    "flaws": [
     "Still flinches at dirt under nails — others’ or my own.",
     "I talk down without noticing until fists rise.",
     "I’d rather starve stylish than take common charity.",
     "I trust accents and crests more than character.",
     "I keep secrets that would save allies if spoken.",
     "I gamble like the old house still covers my losses."
    ]
   },
   "skillList": [
    "History",
    "Persuasion"
   ]
  },
  {
   "id": "trail-born",
   "name": "Trail-Born",
   "twin5e": "Outlander",
   "src": "BOOK1.md line 2974",
   "skills": "Athletics, Survival",
   "tools": "One musical instrument",
   "languages": "One of your choice",
   "equipment": "Staff, hunting trap, animal trophy (tooth, hide scrap), traveler’s clothes, pouch with 1,000 ES",
   "feature": {
    "name": "Open-Ground Memory",
    "twin5e": "Wanderer",
    "text": "You can find food and water for yourself and up to five others in the wild, given time. You also remember maps and landmarks unusually well."
   },
   "traits": {
    "personality": [
     "Sleeps light; trusts dogs more than deputies or clerks.",
     "I read weather better than people.",
     "I keep quiet until the land tells me it’s safe to speak.",
     "I mark trails with habits no company mapmaker knows.",
     "I share meat and water; I don’t share my routes easy.",
     "I flinch at closed doors and love open sky.",
     "I name stars the way town folk name streets.",
     "I’d rather sleep cold than soft — if soft means owned."
    ],
    "ideals": [
     "Change. Keep moving or turn to stone.",
     "Honor. A promise under open sky binds tighter than paper.",
     "Might. The wild doesn’t care about titles or crests.",
     "Nature. If the land sickens, everything after is a lie.",
     "Glory. Let the open ground remember I passed through.",
     "Greater Good. Guide the lost — even the soft ones."
    ],
    "bonds": [
     "A stretch of open ground I mean to keep free of company fences.",
     "My pack-animal (or its memory) matters more than most people.",
     "I owe a debt to a guide who died so the caravan could move.",
     "There’s a trail-marker only my bloodline can read — I’ll find it out west.",
     "I won’t let town law erase the routes my people walked.",
     "Someone I loved chose the city; I still leave signs for them."
    ],
    "flaws": [
     "Town law feels like a gag across the mouth.",
     "I vanish when arguments get civic instead of honest.",
     "I distrust baths, badges, and anyone who smells like perfume.",
     "I’d rather fight a beast than fill out company paper.",
     "I hide injury until I drop — pride of the trail.",
     "I assume every new fence is a declaration of war."
    ]
   },
   "skillList": [
    "Athletics",
    "Survival"
   ]
  },
  {
   "id": "scholar-of-the-dying-weave",
   "name": "Scholar of the Dying Weave",
   "twin5e": "Sage",
   "src": "BOOK1.md line 3049",
   "skills": "Arcana, History",
   "tools": "",
   "languages": "Two of your choice",
   "equipment": "Bottle of ink, quill, small knife, letters from a dead colleague, common clothes, pouch with 1,000 ES",
   "feature": {
    "name": "Stack & Rumor Rights",
    "twin5e": "Researcher",
    "text": "When you don’t know something, you usually know where it might be written or who still remembers — Neverwinter exiles, chapel archives, magistrate ledgers, or claim survey notes. Access still costs charm, coin, or risk."
   },
   "traits": {
    "personality": [
     "Corrects folk mid-sentence and swears he means well.",
     "I quote dead authors in living arguments.",
     "I get excited about footnotes and bored by gunfights — until the gunfight has a theory behind it.",
     "I keep ink on my fingers and opinions on everything.",
     "I ask “why” until someone threatens me.",
     "I catalog strangers the way ranch hands catalog cattle.",
     "I apologize for lectures after the third yawn — sometimes.",
     "I trust a well-kept ledger more than a smiling stranger."
    ],
    "ideals": [
     "Knowledge. Catalog the Weave’s death before campfire myths eat it.",
     "Beauty. There’s elegance even in collapse — record it.",
     "Logic. Superstition killed as many as the dying Weave.",
     "No Limits. Some doors should be opened even if they scream.",
     "Power. What I learn can buy a seat among magistrates — or bury them.",
     "Self-Improvement. Know more tomorrow than today."
    ],
    "bonds": [
     "A missing volume that must not reach the wrong hands.",
     "My mentor’s last letter names a question I haven’t answered.",
     "I smuggled folios off the ship; they’re incomplete without one rival’s notes.",
     "A library that burned still lives in my head — I’ll rebuild it out west.",
     "I owe a debt to the clerk who stamped my berth papers false.",
     "Someone is erasing the record of why the Weave failed; I won’t let the ink dry that way."
    ],
    "flaws": [
     "Curiosity over caution at the worst damn times.",
     "I share discoveries with the wrong ears when flattered.",
     "I dismiss “superstition” that later proves true.",
     "I’d risk the party for one more page of truth.",
     "I can’t admit ignorance without dressing it as a research plan.",
     "I hoard knowledge and call the greed prudence."
    ]
   },
   "skillList": [
    "Arcana",
    "History"
   ]
  },
  {
   "id": "last-ship-hand",
   "name": "Last-Ship Hand",
   "twin5e": "Sailor",
   "src": "BOOK1.md line 3121",
   "skills": "Athletics, Perception",
   "tools": "Navigator’s tools, vehicles (water)",
   "languages": "",
   "equipment": "Belaying pin (club) or similar, silk rope (50 feet) or good hemp, lucky charm (carved tooth / captain’s button), common clothes, pouch with 1,000 ES",
   "feature": {
    "name": "Crew Courtesy",
    "twin5e": "Ship’s Passage",
    "text": "You can secure free passage on a ship (or river barge / coastal runner) for yourself and friends — in exchange for labor. Captains help their own; they won’t sink for your land feuds."
   },
   "traits": {
    "personality": [
     "Swears by wind and hates still rooms.",
     "I brace for roll even on solid ground.",
     "I sing work-chants when the labor gets heavy.",
     "I trust a rope more than a promise.",
     "I tip my cup to absent captains before the first swallow.",
     "I sleep best when I can hear water — or pretend I do.",
     "I call land-folk “passengers” until they earn a better name.",
     "I keep my gear lashed and my stories longer than the watch."
    ],
    "ideals": [
     "Fairness. Share water when the barrel’s low and tempers high.",
     "Freedom. No berth owns you once the gangplank’s up.",
     "Respect. Crew looks after crew — land rules be damned.",
     "Mastery. Know your knots, your weather, and your worth.",
     "People. Get the soft ones ashore alive.",
     "Aspiration. One day I’ll own the deck instead of scrubbing it."
    ],
    "bonds": [
     "The ship that got you out — or the one that didn’t.",
     "My lucky charm belonged to a sailor who never made the far shore.",
     "I still send wages (when I have them) to someone who waited on the docks.",
     "A captain’s word got me aboard; I owe that name.",
     "I’ll find out who sold berths that never existed.",
     "The sea took something of mine; the land won’t take the rest."
    ],
    "flaws": [
     "Settles arguments like dock fights — fast and dirty.",
     "I drink like the next storm is personal.",
     "I can’t sit a quiet meeting without picking a fight or a song.",
     "I abandon plans the moment the weather (or rumor) shifts.",
     "I trust a crew tattoo more than a badge.",
     "I’d rather mutiny than take a bad order with a smile."
    ]
   },
   "skillList": [
    "Athletics",
    "Perception"
   ]
  },
  {
   "id": "company-veteran",
   "name": "Company Veteran",
   "twin5e": "Soldier",
   "src": "BOOK1.md line 3193",
   "skills": "Athletics, Intimidation",
   "tools": "One gaming set, vehicles (land)",
   "languages": "",
   "equipment": "Insignia of rank (company patch / watch brass), trophy from a fall (broken blade, rival’s buckle), bone dice or cards, common clothes, pouch with 1,000 ES",
   "feature": {
    "name": "Company Papers",
    "twin5e": "Military Rank",
    "text": "Soldiers and company officers recognize your rank and extend deference within reason. You can requisition simple aid from friendly companies (lodging, mounts if available, information)."
   },
   "traits": {
    "personality": [
     "Still makes bunk corners tight enough to bounce a coin.",
     "I wake at the old watch bells even when there’s no bell.",
     "I check exits, powder, and faces — in that order.",
     "I speak in brief reports when stressed.",
     "I salute out of habit and hate myself for it.",
     "I share tobacco with anyone who ever stood a wall.",
     "I keep my boots polished and my opinions filed.",
     "I laugh at hanging jokes only with other wall-rats."
    ],
    "ideals": [
     "Greater Good. Hold the line so civilians make the berth.",
     "Responsibility. Rank means you eat last and bleed first.",
     "Independence. I’m done taking orders from soft-handed brass.",
     "Might. Victory is the only sermon that sticks.",
     "Honor. A company that breaks faith deserves the desert.",
     "Nation. Neverwinter fell; what we raise next won’t — if I can help it."
    ],
    "bonds": [
     "The squad that didn’t make the last ship.",
     "My insignia still opens doors — and sometimes graves.",
     "I carry a letter I was supposed to deliver to a dead soldier’s kin.",
     "A commander sold berths while we held the gate; I mean to settle that debt.",
     "I’ll see my unit’s survivors eat before I do.",
     "The trophy I took in the fall reminds me what we paid."
    ],
    "flaws": [
     "Orders are easier than choices — always were.",
     "I freeze when there’s no clear chain of command.",
     "I solve politics with volume, posture, and a hard stare.",
     "I drink to quiet the names of the ones who didn’t board.",
     "I’d rather follow a bad plan than admit I’m lost.",
     "I distrust anyone who never stood a wall."
    ]
   },
   "skillList": [
    "Athletics",
    "Intimidation"
   ]
  },
  {
   "id": "street-rat-of-neverwinter-docks",
   "name": "Street Rat of Neverwinter Docks",
   "twin5e": "Urchin",
   "src": "BOOK1.md line 3265",
   "skills": "Sleight of Hand, Stealth",
   "tools": "Disguise kit, thieves’ tools",
   "languages": "",
   "equipment": "Small knife, map of Neverwinter’s last docks (annotated), pet mouse or similar, common clothes, pouch with 1,000 ES",
   "feature": {
    "name": "Alley Memory",
    "twin5e": "City Secrets",
    "text": "In cities and large towns you know shortcuts, climbs, and crawlspaces. You move between districts faster than most locals — and vanish into crowds when heat rises."
   },
   "traits": {
    "personality": [
     "Pockets everything “just in case” the next meal fails.",
     "I sleep in corners with a knife under the blanket.",
     "I tip for gossip and pay for silence.",
     "I smile with my mouth and watch with my eyes.",
     "I name alleys better than I name months or saints.",
     "I share food with kids first — always.",
     "I flinch when someone raises a hand too fast.",
     "I keep three exits and one good lie ready."
    ],
    "ideals": [
     "Community. Dock kids eat if they share.",
     "Change. Climb or get stepped into the gutter.",
     "People. The small ones matter more than the banners.",
     "Aspiration. One day I’ll own the roof I used to sleep under cold.",
     "Retribution. Soft hands who starve kids deserve empty pockets and worse.",
     "Freedom. No orphanage, no watch, no master."
    ],
    "bonds": [
     "The younger rat still stuck in Neverwinter’s rumor-grave of a dock.",
     "My annotated dock map is the only inheritance I trust.",
     "A fence who fed me still owns a piece of my luck.",
     "I swore I’d bring someone across; I failed — so far. Debt’s still open.",
     "The pet that kept me warm on the docks comes everywhere.",
     "I’ll ruin the clerk who sold fake berths to alley kids."
    ],
    "flaws": [
     "Can’t trust a full pantry; waits for the steal that always comes.",
     "I lie when the truth would do — habit.",
     "I take risks to impress people who already like me.",
     "I can’t ask for help without making it a joke.",
     "I’d rather pick a pocket than admit I’m starving.",
     "I abandon plans the moment a better angle shows itself."
    ]
   },
   "skillList": [
    "Sleight of Hand",
    "Stealth"
   ]
  },
  {
   "id": "settler",
   "name": "Settler",
   "twin5e": "Folk Hero / custom",
   "src": "BOOK1.md line 3337",
   "skills": "Animal Handling, Survival",
   "tools": "One artisan’s tools (carpenter’s, smith’s, or weaver’s), vehicles (land)",
   "languages": "",
   "equipment": "Artisan’s tools, shovel, iron pot, weathered claim stub (disputed), common clothes, pouch with 1,000 ES",
   "feature": {
    "name": "Homestead Welcome",
    "twin5e": "Rustic Hospitality",
    "text": "Common folk feed and hide you from soft-handed law. They’ll tip you off when surveyors ride."
   },
   "traits": {
    "personality": [
     "Measures wealth in fence-posts, seed, and full bellies.",
     "I talk crops and weather before politics.",
     "I mend things whether they’re mine or not.",
     "I keep seed stock like other folk keep loaded irons.",
     "I’m early to work and late to trust.",
     "I tip my hat to anyone who dug their own well.",
     "I talk about land like it’s kin, not inventory.",
     "I’d rather build than argue — until the arguing reaches my fence line."
    ],
    "ideals": [
     "Independence. No Magistrate owns the water under my claim.",
     "Community. Neighbors raise barns and bury their own.",
     "Fairness. A claim worked is a claim kept.",
     "Tradition. Plant, harvest, hold — the old way still works.",
     "Live and Let Live. Stay off my porch and I’ll stay clear of yours.",
     "Destiny. This dirt will carry my name longer than my bones will."
    ],
    "bonds": [
     "The homestead I mean to raise — or the kin still waiting — must not fall.",
     "My claim stub is disputed paper — I’ll make it true with work.",
     "I promised kin across the water a place at my table.",
     "The well I dig first will be named for someone I lost.",
     "I’ll see soft-handed surveyors eat dust before they fence my line for free.",
     "A neighbor stood with me once; I owe them a harvest."
    ],
    "flaws": [
     "Pride won’t let me take charity — even when I should.",
     "I turn every slight into a property dispute.",
     "I work past sense and call the collapse “weather.”",
     "I distrust town coin and town smiles the same.",
     "I’d rather lose a friend than move a fence-post.",
     "I hide fear of failing the claim behind stubborn silence."
    ]
   },
   "skillList": [
    "Animal Handling",
    "Survival"
   ]
  },
  {
   "id": "tracker",
   "name": "Tracker",
   "twin5e": "Outlander / custom",
   "src": "BOOK1.md line 3409",
   "skills": "Perception, Survival",
   "tools": "Herbalism kit or one gaming set (DM choice); vehicles (land) optional swap",
   "languages": "One of your choice",
   "equipment": "Hunting trap, spyglass or cheap field glass (if DM allows; else trophy + 500 ES), hardtack box, traveler’s clothes, pouch with 1,000 ES",
   "feature": {
    "name": "Open-Ground Memory",
    "twin5e": "Wanderer",
    "text": "You find food and water for a small group in wild country and remember trails like scripture. Local hunters tip you off when Eldorite-strange kills show up."
   },
   "traits": {
    "personality": [
     "Speaks in tracks, weather, and short words.",
     "I crouch to read dirt before I look a person in the eye.",
     "I keep quiet on the trail and talk too much by the fire.",
     "I notice when a print is wrong — man, mule, or something worse.",
     "I share tobacco with anyone who respects sign.",
     "I name directions by wind and ridge, not street.",
     "I’d rather sleep cold on good ground than soft on bad sign.",
     "I tip my hat to hunters and ignore loud mouths."
    ],
    "ideals": [
     "Balance. If the land is sick, name the sickness out loud.",
     "Nature. What’s hunted has rules; break them and you starve.",
     "Freedom. No company owns the open ground.",
     "Greater Good. Find the lost before the land keeps them forever.",
     "Mastery. Read sign better tomorrow than today.",
     "Live and Let Live. Leave quiet places quiet."
    ],
    "bonds": [
     "A missing person — or beast — whose trail went cold near Eldorite workings.",
     "My first mentor’s last unfinished hunt still pulls me west.",
     "I won’t let company riders erase the trails common folk still need.",
     "A map of strange kills is incomplete without one more print.",
     "Someone I failed to find still visits my sleep.",
     "I’ll prove the “quiet places” on magistrate maps are lying paper."
    ],
    "flaws": [
     "Follows a mystery past the edge of good sense.",
     "I abandon plans when a fresher trail appears.",
     "I trust animals’ judgment over people’s.",
     "I go silent for days and call it focus.",
     "I’d rather face a beast alone than admit I need a posse behind me.",
     "I collect trophies that worry civilized company and soft town folk."
    ]
   },
   "skillList": [
    "Perception",
    "Survival"
   ]
  },
  {
   "id": "gunslinger-drifter",
   "name": "Gunslinger Drifter",
   "twin5e": "Soldier / custom",
   "src": "BOOK1.md line 3484",
   "skills": "Intimidation, Perception",
   "tools": "One gaming set, vehicles (land)",
   "languages": "",
   "equipment": "Insignia or notched token from an old company/outfit, cartridge trophy or rival’s spent casing, dice or cards, traveler’s clothes / duster, pouch with 1,000 ES",
   "feature": {
    "name": "Road Respect",
    "twin5e": "Military Rank",
    "text": "Gun hands, company riders, and trail law recognize a professional. You can get a free meal, a warning, or a quiet sit-down with local shootists. Somewhere west, your name opens a door — or a crossfire."
   },
   "traits": {
    "personality": [
     "Slow talk; faster hands.",
     "I keep my back to walls and my eyes on doors.",
     "I measure distance in paces and heartbeats.",
     "I tip my hat low and speak softer than my reputation.",
     "I clean iron like a prayer and hate empty saloon talk.",
     "I remember every name that ever beat me to the draw — and didn’t.",
     "I buy the first round for anyone who doesn’t ask for my story.",
     "I sleep light and wake reaching."
    ],
    "ideals": [
     "Redemption. One clean stand against a ledger full of sins.",
     "Honor. Face what you drew for — don’t shoot a back.",
     "Freedom. The road answers to no badge.",
     "Might. Speed and nerve settle what talk can’t.",
     "People. Protect the soft ones when the shooting starts.",
     "Retribution. Debts paid in lead stay paid — no receipts."
    ],
    "bonds": [
     "The ridge-town rumor — debt, grave, or someone waiting — that pulled me west.",
     "A notched token from an old outfit still opens mouths — and crossfire.",
     "I carry a letter I haven’t opened; it might end the drifting for good.",
     "Someone I winged deserved better; I’ll make that right or die trying.",
     "I won’t let company riders write my ending for me.",
     "A kid once asked if I was a hero; I still owe a better answer than silence."
    ],
    "flaws": [
     "Draws when talking would do; talks when drawing would settle it.",
     "I drink to steady hands that don’t need steadying.",
     "I can’t refuse a challenge without tasting shame.",
     "I keep riding when staying would heal something that needs healing.",
     "I assume every friendly table has a shooter under it.",
     "I’d rather be feared accurate than loved and uncertain."
    ]
   },
   "skillList": [
    "Intimidation",
    "Perception"
   ]
  },
  {
   "id": "tinker",
   "name": "Tinker",
   "twin5e": "Guild Artisan / custom",
   "src": "BOOK1.md line 3556",
   "skills": "Insight, Investigation",
   "tools": "Tinker’s tools or one artisan’s tools (smith’s / carpenter’s); forgery kit optional swap with DM",
   "languages": "One of your choice",
   "equipment": "Tinker’s tools (or chosen artisan’s tools), guild letter or assay scrap, traveler’s clothes with burn holes, pouch with 1,500 ES, tiny prototype (nonmagical gadget — DM defines)",
   "feature": {
    "name": "Maker’s Mark",
    "twin5e": "Guild Membership",
    "text": "Craft-folk and claim engineers offer bench space, parts leads, and introductions. Fancy spark-device work draws investors — and the wrong kind of interest. Unpaid “partners” may appear."
   },
   "traits": {
    "personality": [
     "Talks to machines and forgets to talk to people.",
     "I smell of oil, solder, and stubborn hope.",
     "I take things apart “just to see” and sometimes remember to rebuild them.",
     "I sketch on receipts, walls, and other people’s hat brims.",
     "I get cheerful around rare parts and gloomy around committees.",
     "I name prototypes like pets and mourn them when they blow.",
     "I’d rather fix a lock than pick it — usually.",
     "I explain mechanisms until eyes glaze, then explain louder."
    ],
    "ideals": [
     "Invention. Replace lost miracles with honest mechanisms that don’t pray.",
     "Logic. If it can’t be measured, it can’t be trusted.",
     "Freedom. No magistrate patent owns what I can build.",
     "Aspiration. One working prototype can change a whole stretch of shore.",
     "Greed. Spark-devices pay when hymns and soft talk don’t.",
     "People. Build tools that keep common folk alive."
    ],
    "bonds": [
     "A blueprint — or stolen magistrate patent — that could change the far shore if it ever gets built.",
     "My tiny prototype is proof I belong among makers — or a bomb in waiting.",
     "A guild letter got me aboard; I still owe labor once we hit the far side.",
     "I’ll finish what my master started before the Weave went quiet.",
     "Someone financed my berth for a cut of whatever I invent — and they will collect.",
     "I left a half-built device in Neverwinter that could hurt people if found."
    ],
    "flaws": [
     "Will risk the party’s cover for a rare part and call it necessary.",
     "I test prototypes near friends and call the blast radius “a learning opportunity.”",
     "I ignore warnings from people who don’t speak shop.",
     "I’d rather be right about a mechanism than kind about a feeling.",
     "I hoard scrap until it becomes a fire hazard.",
     "I promise miracles on deadlines only stubborn hope could meet."
    ]
   },
   "skillList": [
    "Insight",
    "Investigation"
   ]
  }
 ],
 "armor": [
  {
   "id": "thick-coat",
   "name": "Thick Coat",
   "phb5e": "Padded",
   "category": "light",
   "cost": "500",
   "ac": "11 + Dex",
   "base": 11,
   "bonus": null,
   "dexCap": 99,
   "strength": "—",
   "stealth": "Disadvantage",
   "weight": "8 lb.",
   "src": "BOOK1.md line 3840"
  },
  {
   "id": "leather-jacket",
   "name": "Leather Jacket",
   "phb5e": "Leather",
   "category": "light",
   "cost": "1,000",
   "ac": "11 + Dex",
   "base": 11,
   "bonus": null,
   "dexCap": 99,
   "strength": "—",
   "stealth": "—",
   "weight": "10 lb.",
   "src": "BOOK1.md line 3841"
  },
  {
   "id": "studded-vest",
   "name": "Studded Vest",
   "phb5e": "Studded leather",
   "category": "light",
   "cost": "4,500",
   "ac": "12 + Dex",
   "base": 12,
   "bonus": null,
   "dexCap": 99,
   "strength": "—",
   "stealth": "—",
   "weight": "13 lb.",
   "src": "BOOK1.md line 3842"
  },
  {
   "id": "hide-wrap",
   "name": "Hide Wrap",
   "phb5e": "Hide",
   "category": "medium",
   "cost": "1,000",
   "ac": "12 + Dex (max 2)",
   "base": 12,
   "bonus": null,
   "dexCap": 2,
   "strength": "—",
   "stealth": "—",
   "weight": "12 lb.",
   "src": "BOOK1.md line 3848"
  },
  {
   "id": "mail-undershirt",
   "name": "Mail Undershirt",
   "phb5e": "Chain shirt",
   "category": "medium",
   "cost": "5,000",
   "ac": "13 + Dex (max 2)",
   "base": 13,
   "bonus": null,
   "dexCap": 2,
   "strength": "—",
   "stealth": "—",
   "weight": "20 lb.",
   "src": "BOOK1.md line 3849"
  },
  {
   "id": "scale-coat",
   "name": "Scale Coat",
   "phb5e": "Scale mail",
   "category": "medium",
   "cost": "5,000",
   "ac": "14 + Dex (max 2)",
   "base": 14,
   "bonus": null,
   "dexCap": 2,
   "strength": "—",
   "stealth": "Disadvantage",
   "weight": "45 lb.",
   "src": "BOOK1.md line 3850"
  },
  {
   "id": "steel-vest",
   "name": "Steel Vest",
   "phb5e": "Breastplate",
   "category": "medium",
   "cost": "40,000",
   "ac": "14 + Dex (max 2)",
   "base": 14,
   "bonus": null,
   "dexCap": 2,
   "strength": "—",
   "stealth": "—",
   "weight": "20 lb.",
   "src": "BOOK1.md line 3851"
  },
  {
   "id": "heavy-leather-duster",
   "name": "Heavy Leather Duster",
   "phb5e": "Half plate",
   "category": "medium",
   "cost": "75,000",
   "ac": "15 + Dex (max 2)",
   "base": 15,
   "bonus": null,
   "dexCap": 2,
   "strength": "—",
   "stealth": "Disadvantage",
   "weight": "40 lb.",
   "src": "BOOK1.md line 3852"
  },
  {
   "id": "ring-coat",
   "name": "Ring Coat",
   "phb5e": "Ring mail",
   "category": "heavy",
   "cost": "3,000",
   "ac": "14",
   "base": 14,
   "bonus": null,
   "dexCap": 0,
   "strength": "—",
   "stealth": "Disadvantage",
   "weight": "40 lb.",
   "src": "BOOK1.md line 3862"
  },
  {
   "id": "mail-duster",
   "name": "Mail Duster",
   "phb5e": "Chain mail",
   "category": "heavy",
   "cost": "7,500",
   "ac": "16",
   "base": 16,
   "bonus": null,
   "dexCap": 0,
   "strength": "Str 13",
   "stealth": "Disadvantage",
   "weight": "55 lb.",
   "src": "BOOK1.md line 3863"
  },
  {
   "id": "splint-harness",
   "name": "Splint Harness",
   "phb5e": "Splint",
   "category": "heavy",
   "cost": "20,000",
   "ac": "17",
   "base": 17,
   "bonus": null,
   "dexCap": 0,
   "strength": "Str 15",
   "stealth": "Disadvantage",
   "weight": "60 lb.",
   "src": "BOOK1.md line 3864"
  },
  {
   "id": "iron-suit",
   "name": "Iron Suit",
   "phb5e": "Plate",
   "category": "heavy",
   "cost": "150,000",
   "ac": "18",
   "base": 18,
   "bonus": null,
   "dexCap": 0,
   "strength": "Str 15",
   "stealth": "Disadvantage",
   "weight": "65 lb.",
   "src": "BOOK1.md line 3865"
  },
  {
   "id": "shield-badge-board-cavalry-shield-rifle-plate",
   "name": "Shield (badge board / cavalry shield / rifle plate)",
   "phb5e": "Shield",
   "category": "shield",
   "cost": "1,000",
   "ac": "+2",
   "base": null,
   "bonus": 2,
   "dexCap": 0,
   "strength": "",
   "stealth": "",
   "weight": "6 lb.",
   "src": "BOOK1.md line 3871"
  }
 ],
 "firearms": [
  {
   "id": "herringer-light-pocket-pistol",
   "name": "Herringer Light Pocket Pistol",
   "model": "Herringer Light Pocket Pistol",
   "group": "pistol",
   "cost": "900",
   "action": "Derringer",
   "tr": false,
   "load": "Cartridge",
   "capacity": 1,
   "tiers": {
    "light": {
     "damage": "1d6",
     "range": "10/30",
     "misfire": "1–3"
    }
   },
   "weight": "½ lb.",
   "properties": "Light, concealable, close quarters, simple",
   "src": "BOOK1.md line 3977",
   "slow": false,
   "ability": "DEX",
   "category": "simple",
   "rounds": {
    "light": [
     ".32 Long"
    ]
   },
   "ammo": "cartridge"
  },
  {
   "id": "herringer-light-double-derringer",
   "name": "Herringer Light Double Derringer",
   "model": "Herringer Light Double Derringer",
   "group": "pistol",
   "cost": "1,500",
   "action": "Derringer",
   "tr": false,
   "load": "Cartridge",
   "capacity": 2,
   "tiers": {
    "light": {
     "damage": "1d6",
     "range": "10/30",
     "misfire": "1–3"
    }
   },
   "weight": "1 lb.",
   "properties": "Light, concealable, close quarters, simple",
   "src": "BOOK1.md line 3978",
   "slow": false,
   "ability": "DEX",
   "category": "simple",
   "rounds": {
    "light": [
     ".32 Long"
    ]
   },
   "ammo": "cartridge"
  },
  {
   "id": "herringer-light-pepperbox",
   "name": "Herringer Light Pepperbox",
   "model": "Herringer Light Pepperbox",
   "group": "pistol",
   "cost": "1,500",
   "action": "Pepperbox",
   "tr": false,
   "load": "Cartridge",
   "capacity": 4,
   "tiers": {
    "light": {
     "damage": "1d4",
     "range": "10/30",
     "misfire": "1–4"
    }
   },
   "weight": "½ lb.",
   "properties": "Light, concealable, close quarters, simple",
   "src": "BOOK1.md line 3979",
   "slow": false,
   "ability": "DEX",
   "category": "simple",
   "rounds": {
    "light": [
     ".32 Long"
    ]
   },
   "ammo": "cartridge"
  },
  {
   "id": "navy-army-ball-n-cap-revolver",
   "name": "Navy / Army Ball n Cap Revolver",
   "model": "Navy / Army Ball n Cap Revolver",
   "group": "pistol",
   "cost": "2,000",
   "action": "Percussion revolver (slow)",
   "tr": false,
   "load": "Ball & Cap",
   "capacity": 6,
   "tiers": {
    "medium": {
     "damage": "1d8",
     "range": "20/60",
     "misfire": "1–4"
    }
   },
   "weight": "3 lb.",
   "properties": "Close quarters, slow load, simple",
   "src": "BOOK1.md line 3980",
   "slow": true,
   "ability": "DEX",
   "category": "simple",
   "rounds": {},
   "ammo": "percussion"
  },
  {
   "id": "dullards-plinker-revolver",
   "name": "Dullards Plinker Revolver",
   "model": "Dullards Plinker Revolver",
   "group": "pistol",
   "cost": "1,000",
   "action": "Revolver",
   "tr": true,
   "load": "Cartridge",
   "capacity": 7,
   "tiers": {
    "light": {
     "damage": "1d4",
     "range": "10/30",
     "misfire": "1–2"
    }
   },
   "weight": "1 lb.",
   "properties": "Close quarters, simple, chambered .22 LR or .32 rimfire",
   "src": "sheet lock 2026-10-09",
   "slow": false,
   "ability": "DEX",
   "category": "simple",
   "dirtyMisfire": "1–4",
   "rounds": {
    "light": [
     ".22 LR",
     ".32 rimfire"
    ]
   },
   "rifleRounds": {
    ".32 rimfire": {
     "damage": "1d6"
    }
   },
   "ammo": "cartridge"
  },

  {
   "id": "pony-arms-chaosmaker-light",
   "name": "Pony Arms ChaosMaker (Light)",
   "model": "Pony Arms ChaosMaker",
   "group": "pistol",
   "cost": "2,000",
   "action": "Revolver",
   "tr": true,
   "load": "Cartridge",
   "capacity": 6,
   "tiers": {
    "light": {
     "damage": "1d6",
     "range": "10/30",
     "misfire": "1"
    }
   },
   "weight": "2½ lb.",
   "properties": "chambered .32 Long, close quarters, martial",
   "src": "BOOK1.md line 3982",
   "slow": false,
   "ability": "DEX",
   "category": "martial",
   "rounds": {
    "light": [
     ".32 Long"
    ]
   },
   "ammo": "cartridge"
  },
  {
   "id": "pony-arms-chaosmaker-medium",
   "name": "Pony Arms ChaosMaker (Medium)",
   "model": "Pony Arms ChaosMaker",
   "group": "pistol",
   "cost": "2,500",
   "action": "Revolver",
   "tr": true,
   "load": "Cartridge",
   "capacity": 6,
   "tiers": {
    "medium": {
     "damage": "1d8",
     "range": "20/60",
     "misfire": "1"
    }
   },
   "weight": "2½ lb.",
   "properties": "chambered .357 or .44-40, close quarters, martial",
   "src": "BOOK1.md line 3983",
   "slow": false,
   "ability": "DEX",
   "category": "martial",
   "rounds": {
    "medium": [
     ".357",
     ".44-40"
    ]
   },
   "ammo": "cartridge"
  },
  {
   "id": "pony-arms-chaosmaker-heavy",
   "name": "Pony Arms ChaosMaker (Heavy)",
   "model": "Pony Arms ChaosMaker",
   "group": "pistol",
   "cost": "3,000",
   "action": "Revolver",
   "tr": true,
   "load": "Cartridge",
   "capacity": 6,
   "tiers": {
    "heavy": {
     "damage": "1d10",
     "range": "30/90",
     "misfire": "1–2"
    }
   },
   "weight": "2½ lb.",
   "properties": "chambered .45 Long, close quarters, martial",
   "src": "BOOK1.md line 3984",
   "slow": false,
   "ability": "STR/DEX",
   "category": "martial",
   "rounds": {
    "heavy": [
     ".45 Long"
    ]
   },
   "ammo": "cartridge"
  },
  {
   "id": "single-barrel-farm-shotgun",
   "name": "Single-Barrel Farm Shotgun",
   "model": "Single-Barrel Farm Shotgun",
   "group": "shotgun",
   "cost": "1,000",
   "action": "Break-action",
   "tr": false,
   "load": "Shell",
   "capacity": 1,
   "tiers": {
    "light": {
     "buck": {
      "damage": "2d4",
      "range": "15 ft cone"
     },
     "slug": {
      "damage": "1d8",
      "range": "10/30",
      "misfire": "1–2"
     }
    },
    "medium": {
     "buck": {
      "damage": "2d6",
      "range": "15 ft cone"
     },
     "slug": {
      "damage": "1d10",
      "range": "20/60",
      "misfire": "1–3"
     }
    },
    "heavy": {
     "buck": {
      "damage": "2d8",
      "range": "15 ft cone"
     },
     "slug": {
      "damage": "1d12",
      "range": "30/90",
      "misfire": "1–4"
     }
    }
   },
   "weight": "6 lb.",
   "properties": "Two-handed, scatter, close quarters, simple",
   "src": "BOOK1.md line 3994",
   "slow": false,
   "ability": "STR",
   "category": "simple",
   "rounds": {
    "light": [
     ".410"
    ],
    "medium": [
     "12 ga"
    ],
    "heavy": [
     "10 ga"
    ]
   },
   "ammo": "shell",
   "scatter": true
  },
  {
   "id": "double-barrel-coach-gun",
   "name": "Double-Barrel Coach Gun",
   "model": "Double-Barrel Coach Gun",
   "group": "shotgun",
   "cost": "3,000",
   "action": "Break-action",
   "tr": false,
   "load": "Shell",
   "capacity": 2,
   "tiers": {
    "medium": {
     "buck": {
      "damage": "2d6",
      "range": "15 ft cone"
     },
     "slug": {
      "damage": "1d10",
      "range": "20/60",
      "misfire": "1–2"
     }
    },
    "heavy": {
     "buck": {
      "damage": "2d8",
      "range": "15 ft cone"
     },
     "slug": {
      "damage": "1d12",
      "range": "30/90",
      "misfire": "1–3"
     }
    }
   },
   "weight": "8 lb.",
   "properties": "Two-handed, scatter, both barrels, close quarters, martial",
   "src": "BOOK1.md line 3995",
   "slow": false,
   "ability": "STR",
   "category": "martial",
   "rounds": {
    "medium": [
     "12 ga"
    ],
    "heavy": [
     "10 ga"
    ]
   },
   "ammo": "shell",
   "scatter": true
  },
  {
   "id": "lancaster-lever-shotgun",
   "name": "Lancaster Lever Shotgun",
   "model": "Lancaster Lever Shotgun",
   "group": "shotgun",
   "cost": "4,500",
   "action": "Lever (tube)",
   "tr": true,
   "load": "Shell",
   "capacity": 4,
   "tiers": {
    "light": {
     "buck": {
      "damage": "2d4",
      "range": "15 ft cone"
     },
     "slug": {
      "damage": "1d8",
      "range": "10/30",
      "misfire": "1"
     }
    },
    "medium": {
     "buck": {
      "damage": "2d6",
      "range": "15 ft cone"
     },
     "slug": {
      "damage": "1d10",
      "range": "20/60",
      "misfire": "1"
     }
    }
   },
   "weight": "8 lb.",
   "properties": "Two-handed, scatter, close quarters, martial",
   "src": "BOOK1.md line 3996",
   "slow": false,
   "ability": "STR",
   "category": "martial",
   "rounds": {
    "light": [
     ".410"
    ],
    "medium": [
     "12 ga"
    ]
   },
   "ammo": "shell",
   "scatter": true
  },
  {
   "id": "lancaster-heavy-saddle-carbine",
   "heavyChambered": "STR/DEX",
   "name": "Lancaster Heavy Saddle Carbine",
   "model": "Lancaster Heavy Saddle Carbine",
   "group": "carbine",
   "cost": "6,000",
   "action": "Lever (tube)",
   "tr": true,
   "load": "Cartridge",
   "capacity": 6,
   "tiers": {
    "light": {
     "damage": "1d6",
     "range": "10/30",
     "misfire": "1"
    },
    "medium": {
     "damage": "1d8",
     "range": "20/60",
     "misfire": "1"
    },
    "heavy": {
     "damage": "1d10",
     "range": "30/90",
     "misfire": "1–2"
    }
   },
   "weight": "7 lb.",
   "properties": "Two-handed, saddle, rugged, close quarters, martial",
   "src": "BOOK1.md line 4006",
   "slow": false,
   "ability": "DEX",
   "category": "martial",
   "rounds": {
    "light": [
     ".22 LR",
     ".44 rimfire"
    ],
    "medium": [
     ".44-40"
    ],
    "heavy": [
     ".45-70"
    ]
   },
   "ammo": "cartridge"
  },
  {
   "id": "henrietta-saddle-carbine",
   "name": "Henrietta Saddle Carbine",
   "model": "Henrietta Saddle Carbine",
   "group": "carbine",
   "cost": "4,500",
   "action": "Lever (tube)",
   "tr": true,
   "load": "Cartridge",
   "capacity": 6,
   "tiers": {
    "light": {
     "damage": "1d6",
     "range": "10/30",
     "misfire": "1"
    },
    "medium": {
     "damage": "1d8",
     "range": "20/60",
     "misfire": "1–2"
    }
   },
   "weight": "7 lb.",
   "properties": "Two-handed, saddle, close quarters, martial",
   "src": "BOOK1.md line 4007",
   "slow": false,
   "ability": "DEX",
   "category": "martial",
   "rounds": {
    "light": [
     ".22 LR",
     ".44 rimfire"
    ],
    "medium": [
     ".44-40"
    ]
   },
   "ammo": "cartridge"
  },
  {
   "id": "dullards-light-carbine",
   "name": "Dullards Light Carbine",
   "model": "Dullards Light Carbine",
   "group": "carbine",
   "cost": "1,500",
   "action": "Lever (tube)",
   "tr": true,
   "load": "Cartridge",
   "capacity": 6,
   "tiers": {
    "light": {
     "damage": "1d6",
     "range": "10/30",
     "misfire": "1–4"
    }
   },
   "weight": "6 lb.",
   "properties": "Two-handed, saddle, close quarters, simple",
   "src": "BOOK1.md line 4008",
   "slow": false,
   "ability": "DEX",
   "category": "simple",
   "rounds": {
    "light": [
     ".22 LR",
     ".44 rimfire"
    ]
   },
   "ammo": "cartridge"
  },
  {
   "id": "dulls-rolling-block-rifle",
   "name": "Dulls Rolling-Block Rifle",
   "model": "Dulls Rolling-Block Rifle",
   "group": "rifle",
   "cost": "1,200",
   "action": "Breechloader",
   "tr": false,
   "load": "Cartridge",
   "capacity": 1,
   "tiers": {
    "light": {
     "damage": "2d6",
     "range": "50/200",
     "misfire": "1–3"
    },
    "medium": {
     "damage": "2d8",
     "range": "60/240",
     "misfire": "1–4"
    },
    "heavy": {
     "damage": "2d10",
     "range": "70/280",
     "misfire": "1–5"
    }
   },
   "weight": "8 lb.",
   "properties": "Two-handed, simple",
   "src": "BOOK1.md line 4018",
   "slow": false,
   "ability": "DEX",
   "heavyChambered": "STR/DEX",
   "category": "simple",
   "rounds": {
    "light": [
     ".22 LR",
     ".44 rimfire"
    ],
    "medium": [
     ".44-40"
    ],
    "heavy": [
     ".45-70"
    ]
   },
   "ammo": "cartridge"
  },
  {
   "id": "dullards-tube-rifle",
   "name": "Dullards Tube Rifle",
   "model": "Dullards Tube Rifle",
   "group": "rifle",
   "cost": "2,000",
   "action": "Lever (tube)",
   "tr": true,
   "load": "Cartridge",
   "capacity": 6,
   "tiers": {
    "light": {
     "damage": "1d6",
     "range": "10/40",
     "misfire": "1–3"
    },
    "medium": {
     "damage": "1d8",
     "range": "20/80",
     "misfire": "1–4"
    }
   },
   "weight": "9 lb.",
   "properties": "Two-handed, simple",
   "src": "BOOK1.md line 4019",
   "slow": false,
   "ability": "DEX",
   "category": "simple",
   "rounds": {
    "light": [
     ".22 LR",
     ".44 rimfire"
    ],
    "medium": [
     ".44-40"
    ]
   },
   "ammo": "cartridge"
  },
  {
   "id": "henrietta-repeating-rifle",
   "name": "Henrietta Repeating Rifle",
   "model": "Henrietta Repeating Rifle",
   "group": "rifle",
   "cost": "6,500",
   "action": "Lever (tube)",
   "tr": true,
   "load": "Cartridge",
   "capacity": 6,
   "tiers": {
    "light": {
     "damage": "1d6",
     "range": "20/80",
     "misfire": "1"
    },
    "medium": {
     "damage": "1d8",
     "range": "30/120",
     "misfire": "1–2"
    },
    "heavy": {
     "damage": "1d10",
     "range": "40/160",
     "misfire": "1–3"
    }
   },
   "weight": "9 lb.",
   "properties": "Two-handed, martial",
   "src": "BOOK1.md line 4020",
   "slow": false,
   "ability": "DEX",
   "heavyChambered": "STR/DEX",
   "category": "martial",
   "rounds": {
    "light": [
     ".22 LR",
     ".44 rimfire"
    ],
    "medium": [
     ".44-40"
    ],
    "heavy": [
     ".45-70"
    ]
   },
   "ammo": "cartridge"
  },
  {
   "id": "lancaster-repeating-rifle",
   "name": "Lancaster Repeating Rifle",
   "model": "Lancaster Repeating Rifle",
   "group": "rifle",
   "cost": "8,000",
   "action": "Lever (tube)",
   "tr": true,
   "load": "Cartridge",
   "capacity": 6,
   "tiers": {
    "light": {
     "damage": "1d8",
     "range": "20/80",
     "misfire": "1"
    },
    "medium": {
     "damage": "1d10",
     "range": "30/120",
     "misfire": "1"
    },
    "heavy": {
     "damage": "1d12",
     "range": "40/160",
     "misfire": "1–2"
    }
   },
   "weight": "9 lb.",
   "properties": "Two-handed, martial",
   "src": "BOOK1.md line 4021",
   "slow": false,
   "ability": "DEX",
   "heavyChambered": "STR/DEX",
   "category": "martial",
   "rounds": {
    "light": [
     ".22 LR",
     ".44 rimfire"
    ],
    "medium": [
     ".44-40"
    ],
    "heavy": [
     ".45-70"
    ]
   },
   "ammo": "cartridge"
  },
  {
   "id": "dull-co-rifle-musket",
   "name": "Dull Co. Rifle-Musket",
   "model": "Dull Co. Rifle-Musket",
   "group": "rifle",
   "cost": "1,000",
   "action": "Muzzleloader (slow)",
   "tr": false,
   "load": "Powder & Ball",
   "capacity": 1,
   "tiers": {
    "medium": {
     "damage": "2d12",
     "range": "40/120",
     "misfire": "1–5"
    }
   },
   "weight": "9 lb.",
   "properties": "Two-handed, heavy, slow load, simple",
   "src": "BOOK1.md line 4022",
   "slow": true,
   "ability": "STR/DEX",
   "category": "simple",
   "rounds": {},
   "ammo": "percussion"
  },
  {
   "id": "bison-big-fifty-buffalo-rifle",
   "name": "Bison Big Fifty Buffalo Rifle",
   "model": "Bison Big Fifty Buffalo Rifle",
   "group": "bigbore",
   "cost": "11,000",
   "action": "Breechloader (slow)",
   "tr": false,
   "load": "Cartridge",
   "capacity": 1,
   "tiers": {
    "medium": {
     "damage": "3d10",
     "range": "150/600",
     "misfire": "1–5"
    }
   },
   "weight": "13 lb.",
   "properties": "Two-handed, heavy, unwieldy, slow load, martial",
   "src": "BOOK1.md line 4032",
   "slow": true,
   "ability": "STR",
   "category": "martial",
   "rounds": {
    "medium": [
     ".50-90"
    ]
   },
   "ammo": "bigfifty"
  }
 ],
 "casterGuns": [
  {
   "id": "blacksnake",
   "name": "Blacksnake",
   "model": "Blacksnake",
   "group": "caster",
   "cost": "Not sold",
   "action": "Caster cylinder",
   "tr": true,
   "load": "Cartridge",
   "capacity": 6,
   "tiers": {
    "light": {
     "damage": "1d6",
     "range": "10/30",
     "misfire": "1"
    },
    "medium": {
     "damage": "1d8",
     "range": "10/30",
     "misfire": "1"
    },
    "heavy": {
     "damage": "1d10",
     "range": "20/60",
     "misfire": "1–2"
    }
   },
   "weight": "2½ lb.",
   "properties": "Hex, focus, attunement, close quarters",
   "src": "BOOK1.md line 4128",
   "slow": false,
   "ability": "SPELL",
   "category": "caster",
   "rounds": {
    "light": [
     ".32 Long",
     ".22 LR",
     ".44 rimfire"
    ],
    "medium": [
     ".357",
     ".44-40"
    ],
    "heavy": [
     ".45 Long",
     ".45-70",
     ".50-90"
    ]
   },
   "ammo": "cartridge",
   "hexShells": true,
   "rifleRounds": {
    ".45-70": {
     "damage": "2d8",
     "range": "30/120",
     "misfire": "1–3"
    },
    ".50-90": {
     "damage": "2d12",
     "range": "150/600",
     "misfire": "1–5",
     "unwieldy": true
    }
   },
   "notes": [
    "The plain honest six. No perk and no pedigree, and nobody sells one. Every Hexslinger's first iron."
   ]
  },
  {
   "id": "hognose",
   "name": "Hognose",
   "model": "Hognose",
   "group": "caster",
   "cost": "Not sold",
   "action": "Caster cylinder",
   "tr": true,
   "load": "Cartridge",
   "capacity": 4,
   "tiers": {
    "light": {
     "damage": "1d6",
     "range": "10/30",
     "misfire": "1"
    },
    "medium": {
     "damage": "1d8",
     "range": "10/30",
     "misfire": "1"
    },
    "heavy": {
     "damage": "1d10",
     "range": "10/30",
     "misfire": "1–2"
    }
   },
   "weight": "1½ lb.",
   "properties": "Hex, focus, attunement, concealable, close quarters, simple",
   "src": "BOOK1.md line 4129",
   "slow": false,
   "ability": "SPELL",
   "category": "caster",
   "rounds": {
    "light": [
     ".32 Long",
     ".22 LR",
     ".44 rimfire"
    ],
    "medium": [
     ".357",
     ".44-40"
    ],
    "heavy": [
     ".45 Long",
     ".45-70",
     ".50-90"
    ]
   },
   "ammo": "cartridge",
   "hexShells": true,
   "rifleRounds": {
    ".45-70": {
     "damage": "2d8",
     "range": "30/120",
     "misfire": "1–3"
    },
    ".50-90": {
     "damage": "2d12",
     "range": "150/600",
     "misfire": "1–5",
     "unwieldy": true
    }
   },
   "notes": [
    "A snub-nosed belly gun that rides where nobody looks. Concealable (advantage on Dexterity (Sleight of Hand) checks to hide it), 4 chambers that a Caster specialist can stretch to 6, and 10/30 range on every round.",
    "Once per long rest, when you fail a saving throw against a spell or a curse, you can use your reaction to reroll it."
   ]
  }
 ],
 "melee": [
  {
   "id": "baton-belaying-pin-club",
   "name": "Baton / belaying pin (club)",
   "model": "Baton / belaying pin (club)",
   "group": "simple-melee",
   "cost": "10",
   "damage": "1d4",
   "dmgType": "Bludgeoning",
   "range": "—",
   "capacity": null,
   "misfire": "—",
   "weight": "2 lb.",
   "properties": "Light",
   "src": "BOOK1.md line 3913",
   "category": "simple",
   "ability": "STR"
  },
  {
   "id": "brush-hook-sickle",
   "name": "Brush hook (sickle)",
   "model": "Brush hook (sickle)",
   "group": "simple-melee",
   "cost": "100",
   "damage": "1d4",
   "dmgType": "Slashing",
   "range": "—",
   "capacity": null,
   "misfire": "—",
   "weight": "2 lb.",
   "properties": "Light",
   "src": "BOOK1.md line 3914",
   "category": "simple",
   "ability": "STR"
  },
  {
   "id": "claim-hammer-light-hammer",
   "name": "Claim hammer (light hammer)",
   "model": "Claim hammer (light hammer)",
   "group": "simple-melee",
   "cost": "200",
   "damage": "1d4",
   "dmgType": "Bludgeoning",
   "range": "20/60 (thrown)",
   "capacity": null,
   "misfire": "—",
   "weight": "2 lb.",
   "properties": "Light, thrown",
   "src": "BOOK1.md line 3915",
   "category": "simple",
   "ability": "STR"
  },
  {
   "id": "fence-post-mining-timber-greatclub",
   "name": "Fence post / mining timber (greatclub)",
   "model": "Fence post / mining timber (greatclub)",
   "group": "simple-melee",
   "cost": "20",
   "damage": "1d8",
   "dmgType": "Bludgeoning",
   "range": "—",
   "capacity": null,
   "misfire": "—",
   "weight": "10 lb.",
   "properties": "Two-handed",
   "src": "BOOK1.md line 3916",
   "category": "simple",
   "ability": "STR"
  },
  {
   "id": "hatchet-handaxe",
   "name": "Hatchet (handaxe)",
   "model": "Hatchet (handaxe)",
   "group": "simple-melee",
   "cost": "500",
   "damage": "1d6",
   "dmgType": "Slashing",
   "range": "20/60 (thrown)",
   "capacity": null,
   "misfire": "—",
   "weight": "2 lb.",
   "properties": "Light, thrown",
   "src": "BOOK1.md line 3917",
   "category": "simple",
   "ability": "STR"
  },
  {
   "id": "stiletto-dagger",
   "name": "Stiletto (dagger)",
   "model": "Stiletto (dagger)",
   "group": "simple-melee",
   "cost": "200",
   "damage": "1d4",
   "dmgType": "Piercing",
   "range": "20/60 (thrown)",
   "capacity": null,
   "misfire": "—",
   "weight": "1 lb.",
   "properties": "Finesse, light, thrown",
   "src": "BOOK1.md line 3918",
   "category": "simple",
   "ability": "STR/DEX"
  },
  {
   "id": "throwing-spear-javelin",
   "name": "Throwing spear (javelin)",
   "model": "Throwing spear (javelin)",
   "group": "simple-melee",
   "cost": "50",
   "damage": "1d6",
   "dmgType": "Piercing",
   "range": "30/120 (thrown)",
   "capacity": null,
   "misfire": "—",
   "weight": "2 lb.",
   "properties": "Thrown",
   "src": "BOOK1.md line 3919",
   "category": "simple",
   "ability": "STR"
  },
  {
   "id": "trail-mace-chapel-mace-mace",
   "name": "Trail mace / chapel mace (mace)",
   "model": "Trail mace / chapel mace (mace)",
   "group": "simple-melee",
   "cost": "500",
   "damage": "1d6",
   "dmgType": "Bludgeoning",
   "range": "—",
   "capacity": null,
   "misfire": "—",
   "weight": "4 lb.",
   "properties": "—",
   "src": "BOOK1.md line 3920",
   "category": "simple",
   "ability": "STR"
  },
  {
   "id": "trail-spear-spear",
   "name": "Trail spear (spear)",
   "model": "Trail spear (spear)",
   "group": "simple-melee",
   "cost": "100",
   "damage": "1d6",
   "dmgType": "Piercing",
   "range": "20/60 (thrown)",
   "capacity": null,
   "misfire": "—",
   "weight": "3 lb.",
   "properties": "Thrown, versatile (1d8)",
   "src": "BOOK1.md line 3921",
   "category": "simple",
   "ability": "STR"
  },
  {
   "id": "trail-staff-drover-s-staff-quarterstaff",
   "name": "Trail staff / drover's staff (quarterstaff)",
   "model": "Trail staff / drover's staff (quarterstaff)",
   "group": "simple-melee",
   "cost": "20",
   "damage": "1d6",
   "dmgType": "Bludgeoning",
   "range": "—",
   "capacity": null,
   "misfire": "—",
   "weight": "4 lb.",
   "properties": "Versatile (1d8)",
   "src": "BOOK1.md line 3922",
   "category": "simple",
   "ability": "STR"
  },
  {
   "id": "boarding-hook-poleaxe-halberd",
   "name": "Boarding hook / poleaxe (halberd)",
   "model": "Boarding hook / poleaxe (halberd)",
   "group": "martial-melee",
   "cost": "2,000",
   "damage": "1d10",
   "dmgType": "Slashing",
   "range": "—",
   "capacity": null,
   "misfire": "—",
   "weight": "6 lb.",
   "properties": "Heavy, reach, two-handed",
   "src": "BOOK1.md line 3938",
   "category": "martial",
   "ability": "STR"
  },
  {
   "id": "bowie-shortsword",
   "name": "Bowie (shortsword)",
   "model": "Bowie (shortsword)",
   "group": "martial-melee",
   "cost": "1,000",
   "damage": "1d6",
   "dmgType": "Piercing",
   "range": "—",
   "capacity": null,
   "misfire": "—",
   "weight": "2 lb.",
   "properties": "Finesse, light",
   "src": "BOOK1.md line 3939",
   "category": "martial",
   "ability": "STR/DEX"
  },
  {
   "id": "branding-fork-trident-rare",
   "name": "Branding fork (trident) — rare",
   "model": "Branding fork (trident) — rare",
   "group": "martial-melee",
   "cost": "500",
   "damage": "1d6",
   "dmgType": "Piercing",
   "range": "20/60 (thrown)",
   "capacity": null,
   "misfire": "—",
   "weight": "4 lb.",
   "properties": "Thrown, versatile (1d8)",
   "src": "BOOK1.md line 3940",
   "category": "martial",
   "ability": "STR"
  },
  {
   "id": "buffalo-axe-greataxe",
   "name": "Buffalo axe (greataxe)",
   "model": "Buffalo axe (greataxe)",
   "group": "martial-melee",
   "cost": "3,000",
   "damage": "1d12",
   "dmgType": "Slashing",
   "range": "—",
   "capacity": null,
   "misfire": "—",
   "weight": "7 lb.",
   "properties": "Heavy, two-handed",
   "src": "BOOK1.md line 3941",
   "category": "martial",
   "ability": "STR"
  },
  {
   "id": "bullwhip-whip",
   "name": "Bullwhip (whip)",
   "model": "Bullwhip (whip)",
   "group": "martial-melee",
   "cost": "200",
   "damage": "1d4",
   "dmgType": "Slashing",
   "range": "—",
   "capacity": null,
   "misfire": "—",
   "weight": "3 lb.",
   "properties": "Finesse, reach",
   "src": "BOOK1.md line 3942",
   "category": "martial",
   "ability": "STR/DEX"
  },
  {
   "id": "cavalry-lance-lance",
   "name": "Cavalry lance (lance)",
   "model": "Cavalry lance (lance)",
   "group": "martial-melee",
   "cost": "1,000",
   "damage": "1d12",
   "dmgType": "Piercing",
   "range": "—",
   "capacity": null,
   "misfire": "—",
   "weight": "6 lb.",
   "properties": "Reach, special (PHB lance)",
   "src": "BOOK1.md line 3943",
   "category": "martial",
   "ability": "STR"
  },
  {
   "id": "cavalry-saber-longsword",
   "name": "Cavalry Saber (longsword)",
   "model": "Cavalry Saber (longsword)",
   "group": "martial-melee",
   "cost": "1,500",
   "damage": "1d8",
   "dmgType": "Slashing",
   "range": "—",
   "capacity": null,
   "misfire": "—",
   "weight": "3 lb.",
   "properties": "Versatile (1d10)",
   "src": "BOOK1.md line 3944",
   "category": "martial",
   "ability": "STR"
  },
  {
   "id": "chain-flail-weighted-rein-flail",
   "name": "Chain flail / weighted rein (flail)",
   "model": "Chain flail / weighted rein (flail)",
   "group": "martial-melee",
   "cost": "1,000",
   "damage": "1d8",
   "dmgType": "Bludgeoning",
   "range": "—",
   "capacity": null,
   "misfire": "—",
   "weight": "2 lb.",
   "properties": "—",
   "src": "BOOK1.md line 3945",
   "category": "martial",
   "ability": "STR"
  },
  {
   "id": "cutlass",
   "name": "Cutlass",
   "model": "Cutlass",
   "group": "martial-melee",
   "cost": "2,000",
   "damage": "1d6",
   "dmgType": "Slashing",
   "range": "—",
   "capacity": null,
   "misfire": "—",
   "weight": "3 lb.",
   "properties": "Finesse, light (scimitar-class; own line, distinct from the Machete)",
   "src": "BOOK1.md line 3946",
   "category": "martial",
   "ability": "STR/DEX"
  },
  {
   "id": "heavy-sledge-maul",
   "name": "Heavy sledge (maul)",
   "model": "Heavy sledge (maul)",
   "group": "martial-melee",
   "cost": "1,000",
   "damage": "2d6",
   "dmgType": "Bludgeoning",
   "range": "—",
   "capacity": null,
   "misfire": "—",
   "weight": "10 lb.",
   "properties": "Heavy, two-handed",
   "src": "BOOK1.md line 3947",
   "category": "martial",
   "ability": "STR"
  },
  {
   "id": "machete-scimitar",
   "name": "Machete (scimitar)",
   "model": "Machete (scimitar)",
   "group": "martial-melee",
   "cost": "2,000",
   "damage": "1d6",
   "dmgType": "Slashing",
   "range": "—",
   "capacity": null,
   "misfire": "—",
   "weight": "3 lb.",
   "properties": "Finesse, light",
   "src": "BOOK1.md line 3948",
   "category": "martial",
   "ability": "STR/DEX"
  },
  {
   "id": "miner-s-pick-war-pick",
   "name": "Miner’s pick (war pick)",
   "model": "Miner’s pick (war pick)",
   "group": "martial-melee",
   "cost": "500",
   "damage": "1d8",
   "dmgType": "Piercing",
   "range": "—",
   "capacity": null,
   "misfire": "—",
   "weight": "2 lb.",
   "properties": "—",
   "src": "BOOK1.md line 3949",
   "category": "martial",
   "ability": "STR"
  },
  {
   "id": "pike",
   "name": "Pike",
   "model": "Pike",
   "group": "martial-melee",
   "cost": "500",
   "damage": "1d10",
   "dmgType": "Piercing",
   "range": "—",
   "capacity": null,
   "misfire": "—",
   "weight": "18 lb.",
   "properties": "Heavy, reach, two-handed",
   "src": "BOOK1.md line 3950",
   "category": "martial",
   "ability": "STR"
  },
  {
   "id": "pole-iron-glaive",
   "name": "Pole iron (glaive)",
   "model": "Pole iron (glaive)",
   "group": "martial-melee",
   "cost": "2,000",
   "damage": "1d10",
   "dmgType": "Slashing",
   "range": "—",
   "capacity": null,
   "misfire": "—",
   "weight": "6 lb.",
   "properties": "Heavy, reach, two-handed",
   "src": "BOOK1.md line 3951",
   "category": "martial",
   "ability": "STR"
  },
  {
   "id": "sledgehammer-warhammer",
   "name": "Sledgehammer (warhammer)",
   "model": "Sledgehammer (warhammer)",
   "group": "martial-melee",
   "cost": "1,500",
   "damage": "1d8",
   "dmgType": "Bludgeoning",
   "range": "—",
   "capacity": null,
   "misfire": "—",
   "weight": "2 lb.",
   "properties": "Versatile (1d10)",
   "src": "BOOK1.md line 3952",
   "category": "martial",
   "ability": "STR"
  },
  {
   "id": "spiked-maul-morningstar",
   "name": "Spiked maul (morningstar)",
   "model": "Spiked maul (morningstar)",
   "group": "martial-melee",
   "cost": "1,500",
   "damage": "1d8",
   "dmgType": "Piercing",
   "range": "—",
   "capacity": null,
   "misfire": "—",
   "weight": "4 lb.",
   "properties": "—",
   "src": "BOOK1.md line 3953",
   "category": "martial",
   "ability": "STR"
  },
  {
   "id": "sword-cane-rapier",
   "name": "Sword Cane (rapier)",
   "model": "Sword Cane (rapier)",
   "group": "martial-melee",
   "cost": "2,500",
   "damage": "1d8",
   "dmgType": "Piercing",
   "range": "—",
   "capacity": null,
   "misfire": "—",
   "weight": "2 lb.",
   "properties": "Finesse",
   "src": "BOOK1.md line 3954",
   "category": "martial",
   "ability": "STR/DEX"
  },
  {
   "id": "tomahawk-battleaxe",
   "name": "Tomahawk (battleaxe)",
   "model": "Tomahawk (battleaxe)",
   "group": "martial-melee",
   "cost": "1,000",
   "damage": "1d8",
   "dmgType": "Slashing",
   "range": "—",
   "capacity": null,
   "misfire": "—",
   "weight": "4 lb.",
   "properties": "Versatile (1d10)",
   "src": "BOOK1.md line 3955",
   "category": "martial",
   "ability": "STR"
  }
 ],
 "otherRanged": [
  {
   "id": "shortbow",
   "name": "Shortbow",
   "model": "Shortbow",
   "group": "simple-ranged",
   "cost": "2,500",
   "damage": "1d6",
   "dmgType": "Piercing",
   "range": "80/320",
   "capacity": null,
   "misfire": "—",
   "weight": "2 lb.",
   "properties": "Ammunition (arrows), two-handed",
   "src": "BOOK1.md line 3928",
   "category": "simple",
   "ability": "DEX",
   "ammo": "arrows"
  },
  {
   "id": "sling",
   "name": "Sling",
   "model": "Sling",
   "group": "simple-ranged",
   "cost": "10",
   "damage": "1d4",
   "dmgType": "Bludgeoning",
   "range": "30/120",
   "capacity": null,
   "misfire": "—",
   "weight": "—",
   "properties": "Ammunition (sling stones)",
   "src": "BOOK1.md line 3929",
   "category": "simple",
   "ability": "DEX",
   "ammo": "sling stones"
  },
  {
   "id": "throwing-knife-dart",
   "name": "Throwing knife (dart)",
   "model": "Throwing knife (dart)",
   "group": "simple-ranged",
   "cost": "5",
   "damage": "1d4",
   "dmgType": "Piercing",
   "range": "20/60 (thrown)",
   "capacity": null,
   "misfire": "—",
   "weight": "¼ lb.",
   "properties": "Finesse, thrown",
   "src": "BOOK1.md line 3930",
   "category": "simple",
   "ability": "STR/DEX"
  },
  {
   "id": "blowpipe-blowgun",
   "name": "Blowpipe (blowgun)",
   "model": "Blowpipe (blowgun)",
   "group": "martial-ranged",
   "cost": "1,000",
   "damage": "1",
   "dmgType": "Piercing",
   "range": "25/100",
   "capacity": null,
   "misfire": "—",
   "weight": "1 lb.",
   "properties": "Ammunition (needles), loading",
   "src": "BOOK1.md line 3961",
   "category": "martial",
   "ability": "DEX",
   "ammo": "needles"
  },
  {
   "id": "catch-net-net",
   "name": "Catch net (net)",
   "model": "Catch net (net)",
   "group": "martial-ranged",
   "cost": "100",
   "damage": "—",
   "dmgType": "—",
   "range": "5/15 (thrown)",
   "capacity": null,
   "misfire": "—",
   "weight": "3 lb.",
   "properties": "Special (PHB net), thrown",
   "src": "BOOK1.md line 3962",
   "category": "martial",
   "ability": "STR"
  },
  {
   "id": "longbow",
   "name": "Longbow",
   "model": "Longbow",
   "group": "martial-ranged",
   "cost": "5,000",
   "damage": "1d8",
   "dmgType": "Piercing",
   "range": "150/600",
   "capacity": null,
   "misfire": "—",
   "weight": "2 lb.",
   "properties": "Ammunition (arrows), heavy, two-handed",
   "src": "BOOK1.md line 3963",
   "category": "martial",
   "ability": "DEX",
   "ammo": "arrows"
  }
 ],
 "ammo": [
  {
   "id": "cartridges-light-20",
   "name": "Cartridges, Light (20)",
   "cost": "50",
   "weight": "1 lb.",
   "src": "BOOK1.md line 4197",
   "pack": 20,
   "type": "cartridge",
   "tier": "light"
  },
  {
   "id": "cartridges-medium-20",
   "name": "Cartridges, Medium (20)",
   "cost": "100",
   "weight": "1 lb.",
   "src": "BOOK1.md line 4198",
   "pack": 20,
   "type": "cartridge",
   "tier": "medium"
  },
  {
   "id": "cartridges-heavy-20",
   "name": "Cartridges, Heavy (20)",
   "cost": "200",
   "weight": "1 lb.",
   "src": "BOOK1.md line 4199",
   "pack": 20,
   "type": "cartridge",
   "tier": "heavy"
  },
  {
   "id": "shells-410-10",
   "name": "Shells, .410 (10)",
   "cost": "50",
   "weight": "1 lb.",
   "src": "BOOK1.md line 4200",
   "pack": 10,
   "type": "shell",
   "caliber": ".410"
  },
  {
   "id": "shells-12-ga-10",
   "name": "Shells, 12 ga (10)",
   "cost": "100",
   "weight": "1 lb.",
   "src": "BOOK1.md line 4201",
   "pack": 10,
   "type": "shell",
   "caliber": "12 ga"
  },
  {
   "id": "shells-10-ga-10",
   "name": "Shells, 10 ga (10)",
   "cost": "200",
   "weight": "1 lb.",
   "src": "BOOK1.md line 4202",
   "pack": 10,
   "type": "shell",
   "caliber": "10 ga"
  },
  {
   "id": "big-fifty-cartridges-50-90-10",
   "name": "Big Fifty cartridges, .50-90 (10)",
   "cost": "200",
   "weight": "1½ lb.",
   "src": "BOOK1.md line 4203",
   "pack": 10,
   "type": "bigfifty",
   "caliber": ".50-90"
  },
  {
   "id": "powder-ball-and-caps-20-shots",
   "name": "Powder, ball, and caps (20 shots)",
   "cost": "100",
   "weight": "1 lb.",
   "src": "BOOK1.md line 4204",
   "pack": 20,
   "type": "percussion"
  },
  {
   "id": "arrows-20",
   "name": "Arrows (20)",
   "cost": "100",
   "weight": "1 lb.",
   "src": "BOOK1.md line 4205",
   "pack": 20,
   "type": "arrows"
  },
  {
   "id": "rechambering-gunsmith-per-tier-step",
   "name": "Rechambering (gunsmith), per tier step",
   "cost": "500",
   "weight": "—",
   "src": "BOOK1.md line 4206",
   "pack": null,
   "type": "service"
  }
 ],
 "roundTiers": {
  "pistol": {
   "light": [
    ".32 Long"
   ],
   "medium": [
    ".357",
    ".44-40"
   ],
   "heavy": [
    ".45 Long"
   ]
  },
  "rifle carbine": {
   "light": [
    ".22 LR",
    ".44 rimfire"
   ],
   "medium": [
    ".44-40"
   ],
   "heavy": [
    ".45-70"
   ]
  },
  "shotgun": {
   "light": [
    ".410"
   ],
   "medium": [
    "12 gauge"
   ],
   "heavy": [
    "10 gauge"
   ]
  },
  "big bore": {
   "light": [],
   "medium": [
    ".50-90"
   ],
   "heavy": []
  }
 },
 "roundTierRules": [
  {
   "tier": "Light",
   "damage": "One die smaller",
   "range": "Shorter",
   "misfire": "One step better (min 1)",
   "also": "Quiet"
  },
  {
   "tier": "Medium",
   "damage": "As listed",
   "range": "As listed",
   "misfire": "As listed",
   "also": "—"
  },
  {
   "tier": "Heavy",
   "damage": "One die bigger",
   "range": "A bit longer",
   "misfire": "One step worse (max 1–5)",
   "also": "Loud"
  }
 ],
 "holsters": [
  {
   "id": "slim-jim",
   "name": "Slim Jim",
   "cost": "200",
   "holds": "1 pistol",
   "initBonus": 1,
   "firstShot": 0,
   "initText": "+1",
   "firstShotText": "—",
   "perk": "Belt rig.",
   "notes": "Plain slim leather pouch on a belt loop. Every drover's first holster.",
   "src": "BOOK1.md line 4316",
   "isRig": true,
   "feedsTR": false,
   "dexBonus": 0
  },
  {
   "id": "mexican-loop",
   "name": "Mexican Loop",
   "cost": "500",
   "holds": "1 pistol",
   "initBonus": 1,
   "firstShot": 1,
   "initText": "+1",
   "firstShotText": "+1",
   "perk": "Belt rig.",
   "notes": "A single folded piece of leather. The gun rides high and steady.",
   "src": "BOOK1.md line 4317",
   "isRig": true,
   "feedsTR": false,
   "dexBonus": 0
  },
  {
   "id": "skeleton-rig",
   "name": "Skeleton Rig",
   "cost": "1,000",
   "holds": "1 pistol",
   "initBonus": 2,
   "firstShot": 1,
   "initText": "+2",
   "firstShotText": "+1",
   "perk": "Belt rig.",
   "notes": "Cut-away leather with almost no drag on the draw. Favored by men who get paid to be fast.",
   "src": "BOOK1.md line 4318",
   "isRig": true,
   "feedsTR": false,
   "dexBonus": 0
  },
  {
   "id": "bridgeport-rig-swivel",
   "name": "Bridgeport Rig (swivel)",
   "cost": "2,500",
   "holds": "1 revolver",
   "initBonus": 2,
   "firstShot": 2,
   "initText": "+2",
   "firstShotText": "+2",
   "perk": "Belt rig. Fast swap.",
   "notes": "A steel clip on a stud in the hammer screw. It pivots, so you can fire it before it's fully drawn.",
   "src": "BOOK1.md line 4319",
   "isRig": true,
   "feedsTR": false,
   "dexBonus": 0
  },
  {
   "id": "concealed-vest-sleeve",
   "name": "Concealed (vest / sleeve)",
   "cost": "1,000",
   "holds": "1 derringer or short revolver",
   "initBonus": 0,
   "firstShot": 0,
   "initText": "—",
   "firstShotText": "—",
   "perk": "Hidden: advantage on checks to keep the gun hidden. Works seated.",
   "notes": "A spring sleeve or a sewn vest pocket, the gambler's insurance at the card table.",
   "src": "BOOK1.md line 4320",
   "isRig": true,
   "feedsTR": false,
   "dexBonus": 0
  },
  {
   "id": "shoulder-rig",
   "name": "Shoulder Rig",
   "cost": "800",
   "holds": "1 pistol",
   "initBonus": 0,
   "firstShot": 0,
   "initText": "—",
   "firstShotText": "—",
   "perk": "Hidden under a coat. Slow draw: no free quick-draw; drawing uses your object interaction, and you can't start combat with it in hand.",
   "notes": "Leather straps under the arm and a long coat over it. Lawyers and bank detectives swear by it.",
   "src": "BOOK1.md line 4321",
   "isRig": true,
   "feedsTR": false,
   "dexBonus": 0
  },
  {
   "id": "cross-draw-holster",
   "name": "Cross-Draw Holster",
   "cost": "700",
   "holds": "1 pistol",
   "initBonus": 1,
   "firstShot": 1,
   "initText": "+1",
   "firstShotText": "+1",
   "perk": "No penalty while seated, mounted, or driving. First-shot bonus only then.",
   "notes": "Butt forward on the off hip, so the gun comes clear while you sit a horse or a wagon box.",
   "src": "BOOK1.md line 4322",
   "isRig": true,
   "feedsTR": false,
   "dexBonus": 0,
   "conditional": true
  },
  {
   "id": "pocket-holster",
   "name": "Pocket Holster",
   "cost": "200",
   "holds": "1 derringer",
   "initBonus": 0,
   "firstShot": 0,
   "initText": "—",
   "firstShotText": "—",
   "perk": "Hidden. Quick-draw works as normal.",
   "notes": "A scrap of leather that keeps a Herringer upright in a trouser or vest pocket.",
   "src": "BOOK1.md line 4323",
   "isRig": true,
   "feedsTR": false,
   "dexBonus": 0
  },
  {
   "id": "boot-holster",
   "name": "Boot Holster",
   "cost": "200",
   "holds": "1 derringer",
   "initBonus": 0,
   "firstShot": 0,
   "initText": "—",
   "firstShotText": "—",
   "perk": "Hidden; searches to find it have disadvantage. Drawing takes a bonus action (never free).",
   "notes": "A sleeve stitched inside the boot. It's the last gun they'll find, and the last you'll reach.",
   "src": "BOOK1.md line 4324",
   "isRig": true,
   "feedsTR": false,
   "dexBonus": 0
  },
  {
   "id": "gun-belt-cartridge-loops",
   "name": "Gun Belt, cartridge loops",
   "cost": "200",
   "holds": "Your hip holster and your ammo (no count)",
   "initBonus": 0,
   "firstShot": 0,
   "initText": "—",
   "firstShotText": "—",
   "perk": "Not a rig. Carries your hip holster (pairs with any belt rig). Feeds Tactical Reload (see below).",
   "notes": "Wide cowhide with a loop for every round.",
   "src": "BOOK1.md line 4325",
   "isRig": false,
   "feedsTR": true,
   "dexBonus": 0
  },
  {
   "id": "bandolier",
   "name": "Bandolier",
   "cost": "200",
   "holds": "Your ammo (no count)",
   "initBonus": 0,
   "firstShot": 0,
   "initText": "—",
   "firstShotText": "—",
   "perk": "Not a rig. Suits shoulder rigs and long guns. Feeds Tactical Reload (see below).",
   "notes": "Loops of cartridges slung across the chest, cavalry fashion.",
   "src": "BOOK1.md line 4326",
   "isRig": false,
   "feedsTR": true,
   "dexBonus": 0
  },
  {
   "id": "saddle-scabbard",
   "name": "Saddle Scabbard",
   "cost": "500",
   "holds": "1 carbine or rifle",
   "initBonus": 0,
   "firstShot": 0,
   "initText": "—",
   "firstShotText": "—",
   "perk": "Long guns only. Enables the Saddle property; other long guns ride here but draw normally.",
   "notes": "A boot of stiff leather slung under the stirrup leather. The carbine rides butt-up by your knee.",
   "src": "BOOK1.md line 4327",
   "isRig": true,
   "feedsTR": false,
   "dexBonus": 0
  },
  {
   "id": "pommel-holsters-pair",
   "name": "Pommel Holsters (pair)",
   "cost": "1,500",
   "holds": "2 pistols",
   "initBonus": 1,
   "firstShot": 0,
   "initText": "+1†",
   "firstShotText": "—",
   "perk": "Saddle only. No mounted penalty. Fast swap while mounted. †Mounted only.",
   "notes": "Twin horse-pistol holsters over the saddle horn, cavalry fashion. Three loaded Ball n Caps beat one reload.",
   "src": "BOOK1.md line 4328",
   "isRig": true,
   "feedsTR": false,
   "dexBonus": 0,
   "conditional": true
  }
 ],
 "gunsmithing": {
  "capacity": [
   {
    "upgrade": "Cylinder machining",
    "guns": "Ball n Cap; ChaosMaker (Light, Medium, Heavy)",
    "base": "6",
    "steps": "7, 8",
    "max": "8",
    "cost_per_step": "1,000 / 1,500",
    "name": "Cylinder machining"
   },
   {
    "upgrade": "Tube extension, rifle",
    "guns": "Dullards Tube Rifle; Henrietta and Lancaster Repeating Rifles",
    "base": "6",
    "steps": "8, 10, 12",
    "max": "12",
    "cost_per_step": "1,000 / 1,500 / 2,500",
    "name": "Tube extension, rifle"
   },
   {
    "upgrade": "Tube extension, carbine",
    "guns": "Lancaster Heavy Saddle, Henrietta Saddle, and Dullards Light Carbines",
    "base": "6",
    "steps": "8",
    "max": "8",
    "cost_per_step": "1,000",
    "name": "Tube extension, carbine"
   },
   {
    "upgrade": "Tube extension, shotgun",
    "guns": "Lancaster Lever Shotgun",
    "base": "4",
    "steps": "6",
    "max": "6",
    "cost_per_step": "1,500",
    "name": "Tube extension, shotgun"
   },
   {
    "upgrade": "Caster cylinder (Caster specialist only)",
    "guns": "Blacksnake",
    "base": "6",
    "steps": "7, 8",
    "max": "8",
    "cost_per_step": "2,500 / 5,000",
    "name": "Caster cylinder (Caster specialist only)"
   },
   {
    "upgrade": "Caster cylinder (Caster specialist only)",
    "guns": "Hognose",
    "base": "4",
    "steps": "5, 6",
    "max": "6",
    "cost_per_step": "2,500 / 5,000",
    "name": "Caster cylinder (Caster specialist only)"
   },
   {
    "upgrade": "Can't be extended (single shot)",
    "guns": "Pocket Pistol, Farm Shotgun, Rolling-Block, Rifle-Musket, Big Fifty",
    "base": "1",
    "steps": "—",
    "max": "1",
    "cost_per_step": "—",
    "name": "Can't be extended (single shot)"
   },
   {
    "upgrade": "Can't be extended (fixed barrels)",
    "guns": "Double Derringer 2, Pepperbox 4, Coach Gun 2",
    "base": "as printed",
    "steps": "—",
    "max": "as printed",
    "cost_per_step": "—",
    "name": "Can't be extended (fixed barrels)"
   }
  ],
  "mods": [
   {
    "modification": "Scope",
    "fits": "Rifles, carbines, Big Fifty",
    "cost": "1,000",
    "effect": "No disadvantage at long range if you haven't moved this turn. A scoped carbine loses close quarters.",
    "name": "Scope"
   },
   {
    "modification": "Hair trigger",
    "fits": "Pistols, revolvers",
    "cost": "300",
    "effect": "+1 to your first pistol attack of a combat with this gun. Counts toward the rig's +2 first-shot cap. If you fail a quick-draw (no holster) or fall prone with it in hand, it fires a round at a spot the DM picks.",
    "name": "Hair trigger"
   },
   {
    "modification": "Smoothed action",
    "fits": "Any gun except the Big Fifty and Rugged guns",
    "cost": "400",
    "effect": "Clear a jam as a bonus action with no check. A double misfire still fouls it.",
    "name": "Smoothed action"
   },
   {
    "modification": "Rifled slug barrel",
    "fits": "Shotguns",
    "cost": "400",
    "effect": "Slug ranges are doubled. Buckshot fired through it doesn't spread: it hits the main target only.",
    "name": "Rifled slug barrel"
   },
   {
    "modification": "Engraving and grips",
    "fits": "Any gun",
    "cost": "200",
    "effect": "For show, not stats, and it doesn't use the modification slot. Advantage on checks to recognize or reclaim it, and a story when it's stolen.",
    "name": "Engraving and grips"
   }
  ],
  "caster": [],
  "rules": [
   "One modification slot. Every gun has 1 modification slot. Some rare guns hold more than one modification. Taking one off costs the same as fitting it.",
   "Capacity upgrades are separate. Cylinder machining and tube extensions don't use the slot. Single-shot and double-barrel guns can't be extended.",
   "One step at a time. Buy each capacity step on its own and in order, a day each. You can't skip a step.",
   "Capacity is one number. It's the same whatever round you chamber, and rechambering keeps it.",
   "Slug ranges are halved. Buckshot is unchanged: it keeps the 15-ft cone, spread, and Point Blank rules. Capacity doesn't change.",
   "Machined cylinder. A Blacksnake goes from 6 chambers to 7, then 8, and a Hognose from 4 to 5, then 6, one step at a time (see Capacity Upgrades). Nobody can machine one in the field. It doesn't use the gun's modification slot.",
   "Tunings. A tuning is a Caster-only modification, so it takes the gun's one modification slot. A Caster specialist fits one for 2,500 ES and a favor."
  ]
 },
 "reloadTable": [
  {
   "action": "Revolver, lever (tube), Caster cylinder",
   "reload": "Action",
   "tr": "✓",
   "quick": "Bonus action"
  },
  {
   "action": "Derringer, pepperbox, break-action, breechloader",
   "reload": "Action",
   "tr": "—",
   "quick": "Bonus action (not a Heavy Dulls)"
  },
  {
   "action": "Percussion revolver, muzzleloader (slow)",
   "reload": "Full turn",
   "tr": "ML",
   "quick": "No"
  },
  {
   "action": "Big Fifty breechloader (slow)",
   "reload": "Full turn",
   "tr": "Never",
   "quick": "No"
  }
 ],
 "packs": [
  {
   "phb5e": "Burglar’s pack",
   "name": "Alley kit",
   "use": "Soft entry, dark work"
  },
  {
   "phb5e": "Diplomat’s pack",
   "name": "Circuit trunk",
   "use": "Talkers, Magistrate guests"
  },
  {
   "phb5e": "Dungeoneer’s pack",
   "name": "Claim pack",
   "use": "Mines, cellars, ruins"
  },
  {
   "phb5e": "Entertainer’s pack",
   "name": "Saloon kit",
   "use": "Stage and trail shows"
  },
  {
   "phb5e": "Explorer’s pack",
   "name": "Trail kit",
   "use": "Default dust living"
  },
  {
   "phb5e": "Priest’s pack",
   "name": "Circuit kit",
   "use": "Preachers, oath-bearers"
  },
  {
   "phb5e": "Scholar’s pack",
   "name": "Book trunk",
   "use": "Scholars, assay notes"
  }
 ],
 "gear": [
  {
   "phb5e": "Backpack",
   "name": "Trail pack"
  },
  {
   "phb5e": "Bedroll",
   "name": "Bedroll / trail blankets"
  },
  {
   "phb5e": "Crowbar",
   "name": "Claim pry-bar"
  },
  {
   "phb5e": "Hooded lantern",
   "name": "Hooded lamp"
  },
  {
   "phb5e": "Oil (flask)",
   "name": "Lamp oil"
  },
  {
   "phb5e": "Rope (hemp / silk)",
   "name": "Hemp rope / good silk"
  },
  {
   "phb5e": "Tinderbox",
   "name": "Tinderbox / lucifers"
  },
  {
   "phb5e": "Torch",
   "name": "Torch / pitch stick"
  },
  {
   "phb5e": "Manacles",
   "name": "Iron cuffs"
  },
  {
   "phb5e": "Spyglass",
   "name": "Field glass"
  },
  {
   "phb5e": "Healer’s kit",
   "name": "Field medic kit"
  },
  {
   "phb5e": "Holy water",
   "name": "Blessed water / saint’s wash"
  },
  {
   "phb5e": "Component pouch",
   "name": "Hex pouch / dust pouch"
  },
  {
   "phb5e": "Arcane focus",
   "name": "Eldorite charm, branded cartridge, bone fetish, quill-case lens"
  },
  {
   "phb5e": "Druidic focus",
   "name": "Antler, Eldorite nodule, beast charm"
  },
  {
   "phb5e": "Holy symbol",
   "name": "Badge, saint-medal, carved Eldorite, hymn-book"
  },
  {
   "phb5e": "Chain (10 ft)",
   "name": "Chain"
  },
  {
   "phb5e": "Grappling hook",
   "name": "Grapnel"
  },
  {
   "phb5e": "Hammer",
   "name": "Claim hammer"
  },
  {
   "phb5e": "Piton",
   "name": "Spike"
  },
  {
   "phb5e": "Pole (10 ft)",
   "name": "Trail pole"
  },
  {
   "phb5e": "Pot, iron",
   "name": "Cook pot"
  },
  {
   "phb5e": "Shovel",
   "name": "Spade"
  },
  {
   "phb5e": "Signal whistle",
   "name": "Whistle"
  },
  {
   "phb5e": "Whetstone",
   "name": "Whetstone"
  },
  {
   "phb5e": "Waterskin",
   "name": "Waterskin / canteen"
  },
  {
   "phb5e": "Rations (1 day)",
   "name": "Hardtack / jerky"
  },
  {
   "phb5e": "Mess kit",
   "name": "Mess kit"
  },
  {
   "phb5e": "Climber’s kit",
   "name": "Cliff kit"
  },
  {
   "phb5e": "Fishing tackle",
   "name": "River kit"
  },
  {
   "phb5e": "Hunting trap",
   "name": "Leg-hold / snare"
  },
  {
   "phb5e": "Magnifying glass",
   "name": "Assay glass"
  },
  {
   "phb5e": "Scale, merchant’s",
   "name": "Assay scale"
  },
  {
   "phb5e": "Ink + quill",
   "name": "Ink + pen"
  },
  {
   "phb5e": "Paper / parchment",
   "name": "Claim paper / ledger sheet"
  },
  {
   "phb5e": "Sealing wax",
   "name": "Sealing wax"
  },
  {
   "phb5e": "Soap",
   "name": "Soap"
  },
  {
   "phb5e": "Mirror, steel",
   "name": "Shaving mirror"
  },
  {
   "phb5e": "Bell",
   "name": "Bell"
  },
  {
   "phb5e": "Candle",
   "name": "Candle"
  },
  {
   "phb5e": "Flask / tankard",
   "name": "Flask / tin cup"
  },
  {
   "phb5e": "Jug / pitcher",
   "name": "Jug"
  },
  {
   "phb5e": "Basket",
   "name": "Basket"
  },
  {
   "phb5e": "Barrel",
   "name": "Barrel"
  },
  {
   "phb5e": "Bucket",
   "name": "Bucket"
  },
  {
   "phb5e": "Chest",
   "name": "Strongbox / chest"
  },
  {
   "phb5e": "Bottle, glass",
   "name": "Bottle"
  },
  {
   "phb5e": "Vial",
   "name": "Vial"
  },
  {
   "phb5e": "Block and tackle",
   "name": "Block and tackle"
  },
  {
   "phb5e": "Portable ram",
   "name": "Door ram"
  },
  {
   "phb5e": "Ball bearings",
   "name": "Scatter shot (nonweapon)"
  },
  {
   "phb5e": "Caltrops",
   "name": "Caltrops / jack-nails"
  },
  {
   "phb5e": "Ladder",
   "name": "Ladder"
  },
  {
   "phb5e": "Lock",
   "name": "Padlock"
  },
  {
   "phb5e": "Perfume",
   "name": "Bay rum / scent"
  },
  {
   "phb5e": "Poison (basic)",
   "name": "Trail poison (illegal in most towns)"
  },
  {
   "phb5e": "Potion of healing",
   "name": "Assay tonic / trail draught (consumable; handbook rules)"
  },
  {
   "phb5e": "Robe",
   "name": "Circuit robe / coat"
  },
  {
   "phb5e": "Sack",
   "name": "Sack / gunny"
  },
  {
   "phb5e": "Two-person tent",
   "name": "Trail tent"
  }
 ],
 "frontierGear": [
  {
   "name": "Gunsmith's tools",
   "cost": "2,500",
   "notes": "",
   "src": "BOOK1.md line 4648"
  },
  {
   "name": "Gun cleaning kit (cleans a Dirty gun; see Misfires)",
   "cost": "100",
   "notes": "",
   "src": "BOOK1.md line 4649"
  },
  {
   "name": "Bandolier (see Holsters)",
   "cost": "200",
   "notes": "",
   "src": "BOOK1.md line 4650"
  },
  {
   "name": "Canvas tent (wall tent; sleeps 4; 40 lb., needs a pack animal)",
   "cost": "1,000",
   "notes": "",
   "src": "BOOK1.md line 4651"
  },
  {
   "name": "Lariat (50 ft; hempen rope rules)",
   "cost": "200",
   "notes": "",
   "src": "BOOK1.md line 4652"
  },
  {
   "name": "Spurs",
   "cost": "100",
   "notes": "",
   "src": "BOOK1.md line 4653"
  },
  {
   "name": "Assayer's lead tin (hides a live shard's glow)",
   "cost": "200",
   "notes": "",
   "src": "BOOK1.md line 4654"
  },
  {
   "name": "Harmonica",
   "cost": "100",
   "notes": "",
   "src": "BOOK1.md line 4655"
  },
  {
   "name": "Jaw harp",
   "cost": "50",
   "notes": "",
   "src": "BOOK1.md line 4656"
  },
  {
   "name": "Rotgut whiskey (glass)",
   "cost": "10",
   "notes": "",
   "src": "BOOK1.md line 4657"
  },
  {
   "name": "Whiskey (bottle)",
   "cost": "100",
   "notes": "",
   "src": "BOOK1.md line 4658"
  },
  {
   "name": "Rail ticket (per mile)",
   "cost": "2",
   "notes": "",
   "src": "BOOK1.md line 4659"
  },
  {
   "name": "Telegram (10 words; +10 per extra word)",
   "cost": "100",
   "notes": "",
   "src": "BOOK1.md line 4660"
  },
  {
   "name": "Bath, shave, or haircut",
   "cost": "10 each",
   "notes": "",
   "src": "BOOK1.md line 4661"
  },
  {
   "name": "Breaking a bill: bank",
   "cost": "Free",
   "notes": "",
   "src": "BOOK1.md line 4662"
  },
  {
   "name": "Breaking a bill: assayer or saloon",
   "cost": "10%",
   "notes": "",
   "src": "BOOK1.md line 4663"
  },
  {
   "name": "Field glass (spyglass)",
   "cost": "5,000",
   "notes": "Price isn't PHB ×100",
   "exception": true,
   "src": "BOOK1.md line 4637"
  },
  {
   "name": "Assay glass (magnifying glass)",
   "cost": "1,000",
   "notes": "Price isn't PHB ×100",
   "exception": true,
   "src": "BOOK1.md line 4638"
  },
  {
   "name": "Snakebite antivenin (antitoxin)",
   "cost": "2,500",
   "notes": "Price isn't PHB ×100",
   "exception": true,
   "src": "BOOK1.md line 4639"
  },
  {
   "name": "Bottle, empty",
   "cost": "10",
   "notes": "Price isn't PHB ×100",
   "exception": true,
   "src": "BOOK1.md line 4640"
  },
  {
   "name": "Room, squalid (per night)",
   "cost": "10",
   "notes": "Price isn't PHB ×100",
   "exception": true,
   "src": "BOOK1.md line 4641"
  },
  {
   "name": "Spellcasting, cantrip to 2nd level (if you can find a caster)",
   "cost": "5,000–10,000",
   "notes": "Price isn't PHB ×100",
   "exception": true,
   "src": "BOOK1.md line 4642"
  },
  {
   "name": "Spellcasting, 3rd level and up",
   "cost": "Not for sale",
   "notes": "Price isn't PHB ×100",
   "exception": true,
   "src": "BOOK1.md line 4643"
  }
 ],
 "tools": [
  {
   "phb5e": "Artisan’s tools",
   "note": "Claim craft, gunsmith (gunsmith's tools 2,500 ES), leatherwork, cookware, etc."
  },
  {
   "phb5e": "Disguise kit",
   "note": "Stage paint / false claim papers"
  },
  {
   "phb5e": "Forgery kit",
   "note": "Assay forgeries — magistrates hang people for this"
  },
  {
   "phb5e": "Gaming set",
   "note": "Cards, dice, roulette markers"
  },
  {
   "phb5e": "Herbalism kit",
   "note": "Herb doctoring"
  },
  {
   "phb5e": "Musical instrument",
   "note": "Fiddle, banjo, drum, bugle, tin whistle, harmonica, jaw harp"
  },
  {
   "phb5e": "Navigator’s tools",
   "note": "River and desert navigation"
  },
  {
   "phb5e": "Poisoner’s kit",
   "note": "Illegal in most towns; common in Blackwood whispers"
  },
  {
   "phb5e": "Thieves’ tools",
   "note": "Lock picks / soft entry set"
  },
  {
   "phb5e": "Vehicles (land/water)",
   "note": "Wagon, coach, river craft proficiency"
  }
 ],
 "mounts": [
  {
   "phb5e": "Riding horse",
   "name": "Riding horse / cow pony"
  },
  {
   "phb5e": "Draft horse",
   "name": "Draft / freight horse"
  },
  {
   "phb5e": "Warhorse",
   "name": "Cavalry horse"
  },
  {
   "phb5e": "Mule",
   "name": "Mule"
  },
  {
   "phb5e": "Cart / wagon",
   "name": "Cart / freight wagon"
  },
  {
   "phb5e": "Carriage",
   "name": "Coach"
  },
  {
   "phb5e": "Rowboat / keelboat",
   "name": "Skiff / river boat"
  },
  {
   "phb5e": "Sailing ship",
   "name": "Coastal schooner"
  }
 ],
 "explosives": {
  "items": [
   {
    "id": "dynamite-stick-standard-fuse",
    "name": "Dynamite stick (standard fuse)",
    "cost": "500",
    "weight": "1 lb.",
    "notes": "3d6 bludgeoning, 5-ft radius, DC 12 Dex",
    "src": "BOOK1.md line 4254",
    "trackable": true
   },
   {
    "id": "dynamite-stick-sweating-sold-cheap",
    "name": "Dynamite stick, sweating (sold cheap)",
    "cost": "250",
    "weight": "1 lb.",
    "notes": "As above; misfires on 1–3",
    "src": "BOOK1.md line 4255",
    "trackable": true
   },
   {
    "id": "long-fuse-per-stick",
    "name": "Long fuse (per stick)",
    "cost": "50",
    "weight": "—",
    "notes": "Goes off at the start of your next turn",
    "src": "BOOK1.md line 4256",
    "trackable": true
   },
   {
    "id": "blasting-caps-box-of-5",
    "name": "Blasting caps (box of 5)",
    "cost": "250",
    "weight": "—",
    "notes": "Impact fuse; Powder Man only",
    "src": "BOOK1.md line 4257",
    "trackable": true
   },
   {
    "id": "fuse-cord-50-ft",
    "name": "Fuse cord (50 ft)",
    "cost": "100",
    "weight": "1 lb.",
    "notes": "For placed charges; burns 10 ft per round",
    "src": "BOOK1.md line 4258",
    "trackable": true
   },
   {
    "id": "blasting-powder-1-lb",
    "name": "Blasting powder (1 lb)",
    "cost": "400",
    "weight": "1 lb.",
    "notes": "Powder Man makes charges from it",
    "src": "BOOK1.md line 4259",
    "trackable": true
   },
   {
    "id": "blasting-keg",
    "name": "Blasting keg",
    "cost": "2,000",
    "weight": "20 lb.",
    "notes": "Placed only; 6d6, 20-ft radius, DC 13 Dex",
    "src": "BOOK1.md line 4260",
    "trackable": true
   },
   {
    "id": "padded-powder-crate-holds-12-sticks",
    "name": "Padded powder crate (holds 12 sticks)",
    "cost": "200",
    "weight": "5 lb.",
    "notes": "Safe carry (see below)",
    "src": "BOOK1.md line 4261",
    "trackable": true
   }
  ],
  "bundles": [
   {
    "charge": "1 stick",
    "damage": "3d6",
    "radius": "5 ft",
    "save": "DC 12"
   },
   {
    "charge": "2-stick bundle",
    "damage": "4d6",
    "radius": "10 ft",
    "save": "DC 12"
   },
   {
    "charge": "3-stick bundle",
    "damage": "5d6",
    "radius": "15 ft",
    "save": "DC 13"
   },
   {
    "charge": "4-stick bundle (max)",
    "damage": "6d6",
    "radius": "20 ft",
    "save": "DC 13"
   }
  ],
  "misfire": [
   {
    "roll": "1–3",
    "result": "Dud. No blast. You can relight it (an action) if you can reach it."
   },
   {
    "roll": "4–5",
    "result": "Fast fuse. It goes off halfway to your target point (the DM places it)."
   },
   {
    "roll": "6",
    "result": "Slow burn. It goes off at the start of your next turn instead."
   }
  ],
  "rules": [
   "Light and throw is one action, if you have a flame to hand (a lit cigar or pipe, a lamp, a torch, a campfire in reach, or a match). With a tinderbox, lighting takes an action first. It's never Use an Object, so Quick Grift can't do it, and Extra Attack doesn't add throws.",
   "Range 30/60 ft. Pick a point you can see. Past 30 ft, the stick lands 10 ft off in a random direction (d8). There's no attack roll.",
   "Standard fuse: it goes off at the end of your turn, where it lands. Long fuse: it goes off at the start of your next turn, so folks can run, or throw it back (an action, using the same range).",
   "Blast: each creature in the radius makes a Dex save: full damage on a failure, half on a success. Objects and structures take double damage. Flammable things in the blast catch fire."
  ],
  "carrying": [
   "In a padded crate: safe.",
   "Loose (pocket, saddlebag, bandolier, coat lining): when you take fire damage, or fail a save against an explosion, the DM can have you roll a d20 for your loose sticks. On a 1, one goes off on you.",
   "Sweating: sticks left in sun, heat, or damp for weeks start to weep. They misfire on 1–3. A gunsmith or a Powder Man can tell at a glance; you can't."
  ],
  "note": "Anyone can buy dynamite and anyone can throw it. The Powder Man feat makes you good at explosives."
 },
 "storytellerGear": {
  "accessories": [
   {
    "id": "standard-strap-guitar-banjo",
    "name": "Standard strap (guitar, banjo)",
    "cost": "100",
    "effect": "Swing the instrument to your back or front as part of your movement.",
    "storyteller": true,
    "src": "BOOK1.md line 4688"
   },
   {
    "id": "violin-strap",
    "name": "Violin strap",
    "cost": "100",
    "effect": "Holds fiddle and bow at your shoulder between songs without a hand, so you can hold a weapon. Taking them up or slinging them is your free object interaction.",
    "storyteller": true,
    "src": "BOOK1.md line 4689"
   },
   {
    "id": "cartridge-strap-guitar-banjo",
    "name": "Cartridge strap (guitar, banjo)",
    "cost": "1,500 WB",
    "effect": "A standard strap with 6 cartridge loops. Reload a revolver or lever-action (TR ✓) from it as a bonus action. Not for single-shot or slow-load guns. Empty loops refill only on a short rest, from ammo you carry.",
    "storyteller": true,
    "src": "BOOK1.md line 4690"
   },
   {
    "id": "soft-travel-case",
    "name": "Soft travel case",
    "cost": "200",
    "effect": "+1 to Wear rolls from rain, dust, heat, or falls while the instrument is inside. Unpacking takes an action.",
    "storyteller": true,
    "src": "BOOK1.md line 4691"
   },
   {
    "id": "hard-travel-case",
    "name": "Hard travel case",
    "cost": "1,000 WB",
    "effect": "+2 to Wear rolls while the instrument is inside, and no Wear roll at all from gunshots or explosions. Unpacking takes an action. Heavy gear: −5 ft speed while you carry it.",
    "storyteller": true,
    "src": "BOOK1.md line 4692"
   },
   {
    "id": "plain-strings-set",
    "name": "Plain strings (set)",
    "cost": "25",
    "effect": "+0 to Wear rolls. Sold at any store. Every instrument comes with plain strings (a fiddle, with a plain bow).",
    "storyteller": true,
    "src": "BOOK1.md line 4693"
   },
   {
    "id": "quality-strings-bow",
    "name": "Quality strings / bow",
    "cost": "50 / 300 WB",
    "effect": "+1 to Wear rolls.",
    "storyteller": true,
    "src": "BOOK1.md line 4694"
   },
   {
    "id": "cheap-strings-bow",
    "name": "Cheap strings / bow",
    "cost": "10 / 50 SS",
    "effect": "−1 to Wear rolls. They snap when the Wear d8 shows 1–2.",
    "storyteller": true,
    "src": "BOOK1.md line 4695"
   },
   {
    "id": "glass-slide",
    "name": "Glass slide",
    "cost": "500 WB",
    "effect": "Guitar, banjo, or fiddle. Once per short rest, add 30 ft to the range of one ranged spell you cast through it (never touch or self).",
    "storyteller": true,
    "src": "BOOK1.md line 4696"
   },
   {
    "id": "fingerpicks",
    "name": "Fingerpicks",
    "cost": "2,000 WB",
    "effect": "On a turn you play a string instrument (cast through it, or spend your action playing), you gain +2 to Constitution saves to keep concentration until the start of your next turn.",
    "storyteller": true,
    "src": "BOOK1.md line 4697"
   },
   {
    "id": "tuning-fork",
    "name": "Tuning fork",
    "cost": "200",
    "effect": "Strike it as a bonus action: 1 minute later the instrument is no longer Out of tune, with no short rest needed. It can't mend snapped strings.",
    "storyteller": true,
    "src": "BOOK1.md line 4698"
   },
   {
    "id": "harmonica-rack",
    "name": "Harmonica rack",
    "cost": "300",
    "effect": "Play a harmonica hands-free, so you can cast through it and use a weapon on the same turn. Spells through it have voice range (30 ft to target a creature) and can't take your Rally Word die on a save DC.",
    "storyteller": true,
    "src": "BOOK1.md line 4699"
   },
   {
    "id": "capo",
    "name": "Capo",
    "cost": "200",
    "effect": "Advantage on Performance checks for a gig or a crowd, busking included.",
    "storyteller": true,
    "src": "BOOK1.md line 4700"
   },
   {
    "id": "songbook-blank",
    "name": "Songbook (blank)",
    "cost": "2,500 WB",
    "effect": "A ritual book. When you find a Storyteller ritual of a level you can cast written down, copy it in: 2 hours and 5,000 ES per spell level (as Prayer Book, Feats). You can cast its songs only as rituals, even ones you don't know.",
    "storyteller": true,
    "src": "BOOK1.md line 4701"
   },
   {
    "id": "busking-hat",
    "name": "Busking hat",
    "cost": "100",
    "effect": "Busk in downtime with a Performance check: about 160 ES a day (the DM may adjust), at most 3 days a week in one town.",
    "storyteller": true,
    "src": "BOOK1.md line 4702"
   },
   {
    "id": "luthier-repair-service",
    "name": "Luthier repair (service)",
    "cost": "500 / 250",
    "effect": "Fixes Broken (quality / cheap instrument). Whiskey Bend fixes any; Silver Springs, cheap ones only.",
    "storyteller": true,
    "src": "BOOK1.md line 4703"
   }
  ],
  "instruments": [
   {
    "id": "fiddle",
    "name": "Fiddle",
    "costQuality": "4,000",
    "costCheap": "2,000",
    "cost": "4,000 / 2,000",
    "perk": "+1 to each roll of your Rally Word die.",
    "storyteller": true,
    "src": "BOOK1.md line 4712"
   },
   {
    "id": "banjo",
    "name": "Banjo",
    "costQuality": "3,000",
    "costCheap": "1,500",
    "cost": "3,000 / 1,500",
    "perk": "Once per short rest, add 1d4 to one roll of your Rally Word die.",
    "storyteller": true,
    "src": "BOOK1.md line 4713"
   },
   {
    "id": "guitar",
    "name": "Guitar",
    "costQuality": "7,000",
    "costCheap": "3,500",
    "cost": "7,000 / 3,500",
    "perk": "Once per short rest, +1 to the save DC of one spell you cast through it.",
    "storyteller": true,
    "src": "BOOK1.md line 4714"
   },
   {
    "id": "accordion",
    "name": "Accordion",
    "costQuality": "3,000",
    "costCheap": "1,500",
    "cost": "3,000 / 1,500",
    "perk": "Loud. Once per short rest, one target within 30 ft has disadvantage on its first save against one of your enchantment spells.",
    "storyteller": true,
    "src": "BOOK1.md line 4715"
   },
   {
    "id": "harmonica",
    "name": "Harmonica",
    "costQuality": "200",
    "costCheap": "100",
    "cost": "200 / 100",
    "perk": "Rides in a pocket: it can't be disarmed or lost in a fall, and it works as your focus while you're grappled or restrained.",
    "storyteller": true,
    "src": "BOOK1.md line 4716"
   },
   {
    "id": "piano",
    "name": "Piano",
    "costQuality": "Not for sale",
    "costCheap": "",
    "cost": "Not for sale",
    "perk": "Play one wherever you find it (a saloon, a church, a parlor): +1 to your spell save DC for spells cast through it.",
    "storyteller": true,
    "src": "BOOK1.md line 4717"
   },
   {
    "id": "voice",
    "name": "Voice",
    "costQuality": "—",
    "costCheap": "—",
    "cost": "—",
    "perk": "Hands free; everyone knows you are the caster. Gag or Silence shuts you down; creature-target spells reach 30 ft.",
    "storyteller": true,
    "src": "Calling feature (Storyteller)"
   }
  ],
  "wearTable": [
   {
    "roll": "1 or less",
    "result": "Broken. You can't cast through it until a luthier repairs it, or you spend 1 hour and pass a DC 15 check with woodcarver's tools (or with the instrument itself, if you have no tools)."
   },
   {
    "roll": "2–3",
    "result": "Out of tune. Disadvantage on concentration saves until you retune it on a short rest."
   },
   {
    "roll": "4–7",
    "result": "Holding up. No effect."
   },
   {
    "roll": "8 or more",
    "result": "Played in. +1 to spell attack rolls through it until your next Wear roll."
   }
  ],
  "wearRules": [
   "Strings: plain +0, quality +1, cheap −1. A fiddle uses the lower of its strings and its bow.",
   "Case (only if the instrument was inside): none +0, soft +1 (rain, dust, heat, falls), hard +2 (anything). A hard case also means no roll for gunshots or explosions.",
   "Instrument: quality +0, cheap −2. All modifiers stack.",
   "A natural 1 on the Wear roll always counts as at least Out of tune, whatever your modifiers.",
   "Snapped strings or bow: a snap is read on the d8 alone, before modifiers. A snapped set leaves the instrument Out of tune until you fit a new set on a short rest."
  ],
  "note": "WB = Whiskey Bend Music Store only; SS = Silver Springs only. Starting-kit instrument is cheap unless Background says otherwise."
 },
 "kitCrosswalk": {
  "crosswalk": [
   {
    "old": "Hand crossbow (+ bolts)",
    "frontier": "Herringer Light Double Derringer, Pocket Pistol, or Pepperbox + 20 Light cartridges"
   },
   {
    "old": "Light crossbow (+ 20 bolts)",
    "frontier": "Dullards Light Carbine + 20 Light cartridges, or a Dullards Tube Rifle chambered Light + 20 Light cartridges"
   },
   {
    "old": "Shortbow (+ 20 arrows); \"pocket pistol\" (Gambler kit)",
    "frontier": "Player's choice: keep the Shortbow + 20 arrows, or a Herringer Light Pepperbox (Gambler: or the Pocket Pistol) + 20 Light cartridges"
   },
   {
    "old": "Longbow (+ 20 arrows); \"hunting rifle\" (Frontier Scout kit)",
    "frontier": "Player's choice: keep the Longbow + 20 arrows, or a Dullards Light Carbine + 20 Light cartridges"
   },
   {
    "old": "Heavy crossbow (+ bolts)",
    "frontier": "Dulls Rolling-Block Rifle chambered Light + 20 Light cartridges"
   },
   {
    "old": "Greatsword / “scatter” / shotgun",
    "frontier": "Single-Barrel Farm Shotgun chambered .410 + 10 .410 shells (buckshot or slugs), or a Heavy sledge if the kit meant the greatsword"
   },
   {
    "old": "Frontier Preacher's Single-Barrel Farm Shotgun",
    "frontier": "Chambered .410 + 10 .410 shells. A gunsmith can rechamber it later (500 ES per tier step)."
   },
   {
    "old": "“Repeater” (Gunslinger kit)",
    "frontier": "Dullards Tube Rifle chambered Light + 20 Light cartridges"
   },
   {
    "old": "“Twin pistols” / “twin revolvers” (Gunslinger kit)",
    "frontier": "Two Herringer Light Pepperboxes + 20 Light cartridges, or one Navy / Army Ball n Cap + 20 loads"
   },
   {
    "old": "“Light rifle”",
    "frontier": "Dullards Tube Rifle chambered Light, or a Dullards Light Carbine"
   },
   {
    "old": "Arrows (any count)",
    "frontier": "Arrows if you keep the bow; otherwise the same count of Light cartridges (or .410 shells) for the swapped gun"
   },
   {
    "old": "Bolts (any count)",
    "frontier": "The same count of Light cartridges or .410 shells"
   },
   {
    "old": "Proficiency: hand crossbows",
    "frontier": "Herringers"
   },
   {
    "old": "Proficiency: light crossbows",
    "frontier": "Herringers and the Ball n Cap, or the ChaosMaker if proficient with martial weapons"
   },
   {
    "old": "Proficiency: shortbow / longbow",
    "frontier": "The Shortbow / Longbow themselves, plus revolvers / Henrietta and Lancaster rifles if the table allows (the ChaosMaker still needs martial proficiency)"
   },
   {
    "old": "High House “hunting bow” (House Arms)",
    "frontier": "Shortbow or Longbow"
   },
   {
    "old": "Proficiency: “shotgun” (Mountain Folk)",
    "frontier": "All three shotguns"
   }
  ],
  "streetNames": [
   {
    "hear": "Revolver, six-shooter, iron",
    "means": "ChaosMaker or Navy / Army Ball n Cap"
   },
   {
    "hear": "Light pistol, pocket pistol, Single-Shot Pistol",
    "means": "A Herringer (Pocket Pistol, Double Derringer, or Pepperbox)"
   },
   {
    "hear": "Lever-Action Rifle, Repeater",
    "means": "Henrietta or Lancaster Repeating Rifle (in a starting kit, a \"repeater\" is the Dullards Tube Rifle; see the Crosswalk)"
   },
   {
    "hear": "Carbine, saddle gun, saddle-ring carbine",
    "means": "Lancaster Heavy Saddle Carbine, Henrietta Saddle Carbine, or Dullards Light Carbine"
   },
   {
    "hear": "Light rifle",
    "means": "Dullards Tube Rifle or Dulls Rolling-Block Rifle"
   },
   {
    "hear": "Blunderbuss, Scatter Gun, Double-Barreled Shotgun",
    "means": "Double-Barrel Coach Gun"
   },
   {
    "hear": "Heavy rifle, buffalo gun",
    "means": "Bison Big Fifty Buffalo Rifle"
   }
  ]
 },
 "currency": [
  {
   "id": "white",
   "color": "White",
   "equals": "1 ES",
   "es": 1,
   "cp": 1,
   "src": "BOOK1.md line 3818"
  },
  {
   "id": "blue",
   "color": "Blue",
   "equals": "10 ES",
   "es": 10,
   "cp": 10,
   "src": "BOOK1.md line 3819"
  },
  {
   "id": "green",
   "color": "Green",
   "equals": "50 ES",
   "es": 50,
   "cp": 50,
   "src": "BOOK1.md line 3820"
  },
  {
   "id": "yellow",
   "color": "Yellow",
   "equals": "100 ES",
   "es": 100,
   "cp": 100,
   "src": "BOOK1.md line 3821"
  },
  {
   "id": "purple",
   "color": "Purple",
   "equals": "500 ES",
   "es": 500,
   "cp": 500,
   "src": "BOOK1.md line 3822"
  }
 ],
 "wildSpark": [
  {
   "roll": "1",
   "text": "Backlash: you take 1d6 force damage and the spell fails (slot spent)."
  },
  {
   "roll": "2",
   "text": "Fizzle: the spell fails; the slot is spent."
  },
  {
   "roll": "3",
   "text": "Stray: the spell hits a random creature within 30 feet of the target (DM picks)."
  },
  {
   "roll": "4",
   "text": "Stutter: the spell works. You can't Spin the Cylinder until the end of your next turn."
  },
  {
   "roll": "5",
   "text": "Flash: a crack of green light; the spell works, and everyone within 30 feet knows exactly what you are."
  },
  {
   "roll": "6",
   "text": "Lucky dust: the spell works. The spell doesn't use up its hex lead (a free cast). If it was a cantrip, you regain one expended hex lead instead."
  }
 ],
 "feats": [
  {
   "id": "actor",
   "name": "Actor",
   "phb5e": "Actor",
   "gist": "+1 Cha; impersonate people and mimic voices",
   "prereq": "",
   "bullets": [
    "Increase your Charisma by 1 (max 20).",
    "Advantage on Charisma (Deception) and (Performance) checks when you're trying to pass as someone else.",
    "You can copy the voice of a person or the sounds of a creature after hearing it for at least 1 minute. A listener sees through it only with a Wisdom (Insight) check against DC 8 + your proficiency bonus + your Charisma modifier."
   ],
   "src": "BOOK1.md line 4810"
  },
  {
   "id": "alert",
   "name": "Alert",
   "phb5e": "Alert",
   "gist": "+5 initiative; can't be surprised",
   "prereq": "",
   "bullets": [
    "+5 bonus to initiative.",
    "You can't be surprised while you're conscious.",
    "Creatures you can't see don't gain advantage on attacks against you just for being hidden."
   ],
   "src": "BOOK1.md line 4818"
  },
  {
   "id": "athlete",
   "name": "Athlete",
   "phb5e": "Athlete",
   "gist": "+1 Str/Dex; climb, jump, and stand with ease",
   "prereq": "",
   "bullets": [
    "Increase your Strength or Dexterity by 1 (max 20).",
    "Standing up from prone costs only 5 feet of movement.",
    "Climbing doesn't cost you extra movement.",
    "A running long jump or high jump needs only a 5-foot run-up."
   ],
   "src": "BOOK1.md line 4826"
  },
  {
   "id": "charger",
   "name": "Charger",
   "phb5e": "Charger",
   "gist": "Dash, then a bonus-action strike or shove",
   "prereq": "",
   "bullets": [
    "When you take the Dash action, you can use a bonus action to make one melee weapon attack or shove a creature.",
    "If you moved at least 10 feet in a straight line right before that bonus action, the attack deals +5 damage, or the shove pushes the target up to 10 feet away (your choice)."
   ],
   "src": "BOOK1.md line 4835"
  },
  {
   "id": "defensive-duelist",
   "name": "Defensive Duelist",
   "phb5e": "Defensive Duelist",
   "gist": "Reaction: add proficiency to AC with a finesse blade",
   "prereq": "Dexterity 13 or higher",
   "bullets": [
    "While wielding a finesse weapon you're proficient with (Sword Cane, Bowie, Stiletto), when a melee attack hits you, you can use your reaction to add your proficiency bonus to your AC against that attack, possibly turning the hit into a miss."
   ],
   "src": "BOOK1.md line 4842"
  },
  {
   "id": "dual-wielder",
   "name": "Dual Wielder",
   "phb5e": "Dual Wielder (house rule)",
   "gist": "+1 AC; twin pistols or Caster Guns, twin blades, or pistol + blade",
   "prereq": "",
   "bullets": [
    "+1 AC while you hold a qualifying weapon (pistol, one-handed Caster Gun, or one-handed blade) in each hand.",
    "You can use two-weapon fighting with any pair of qualifying weapons, even ones that aren't light.",
    "You can draw or stow two qualifying weapons when you'd normally draw or stow just one."
   ],
   "src": "BOOK1.md line 4852"
  },
  {
   "id": "durable",
   "name": "Durable",
   "phb5e": "Durable",
   "gist": "+1 Con; better healing from Hit Dice",
   "prereq": "",
   "bullets": [
    "Increase your Constitution by 1 (max 20).",
    "When you roll a Hit Die to regain hit points, the minimum you regain equals twice your Constitution modifier (minimum 2)."
   ],
   "src": "BOOK1.md line 4865"
  },
  {
   "id": "element-tamer",
   "name": "Element Tamer",
   "phb5e": "Elemental Adept",
   "gist": "Your chosen element ignores resistance",
   "prereq": "The ability to cast at least one spell",
   "bullets": [
    "Pick acid, cold, fire, lightning, or thunder.",
    "Your spells ignore resistance to that damage type.",
    "When you roll damage for a spell of that type, treat any 1 on a damage die as a 2.",
    "You can take this feat more than once, choosing a new damage type each time.",
    "Weave note: the Weave is dying; the DM may gate this feat."
   ],
   "src": "BOOK1.md line 4872"
  },
  {
   "id": "grappler",
   "name": "Grappler",
   "phb5e": "Grappler",
   "gist": "Advantage on grappled foes; pin them",
   "prereq": "Strength 13 or higher",
   "bullets": [
    "Advantage on attack rolls against a creature you're grappling.",
    "You can use your action to try to pin a creature you're grappling with another grapple check. On a success, you and it are both restrained until the grapple ends."
   ],
   "src": "BOOK1.md line 4884"
  },
  {
   "id": "great-weapon-master",
   "name": "Great Weapon Master",
   "phb5e": "Great Weapon Master",
   "gist": "Heavy melee steel: −5 to hit for +10 damage",
   "prereq": "",
   "bullets": [
    "When you score a critical hit with a melee weapon, or drop a creature to 0 hit points with one, you can make one melee weapon attack as a bonus action.",
    "Before you attack with a heavy melee weapon you're proficient with, you can take −5 to the attack roll. If it hits, add +10 to the damage.",
    "Melee weapons only. No gun, bow, or Caster Gun qualifies, heavy or not; shotguns and long guns use Sharpshooter. Qualifying heavy melee weapons include the buffalo axe, heavy sledge, pole iron, boarding hook, and pike."
   ],
   "src": "BOOK1.md line 4893"
  },
  {
   "id": "gunsmoke-caster",
   "name": "Gunsmoke Caster",
   "phb5e": "War Caster",
   "gist": "Hold concentration; cast with hands full",
   "prereq": "The ability to cast at least one spell",
   "bullets": [
    "Advantage on Constitution saves to keep concentration on a spell when you take damage.",
    "You can perform somatic components even with weapons or a shield in both hands.",
    "When a creature provokes an opportunity attack from you, you can use your reaction to cast a spell at it instead of attacking. The spell must take 1 action to cast and must target only that creature.",
    "Weave note: the Weave is dying; the DM may gate this feat."
   ],
   "src": "BOOK1.md line 4903"
  },
  {
   "id": "healer",
   "name": "Healer",
   "phb5e": "Healer",
   "gist": "Healer's kit patches real wounds",
   "prereq": "",
   "bullets": [
    "When you stabilize a dying creature with a healer's kit, it also regains 1 hit point.",
    "As an action, you can spend one use of a healer's kit to restore 1d6 + 4 hit points to a creature, plus hit points equal to its maximum number of Hit Dice. A creature can't benefit from this again until it finishes a short or long rest."
   ],
   "src": "BOOK1.md line 4914"
  },
  {
   "id": "heavily-armored",
   "name": "Heavily Armored",
   "phb5e": "Heavily Armored",
   "gist": "+1 Str; heavy armor proficiency",
   "prereq": "Proficiency with medium armor",
   "bullets": [
    "Increase your Strength by 1 (max 20).",
    "You gain proficiency with heavy armor (Ring Coat, Mail Duster, Splint Harness, Iron Suit)."
   ],
   "src": "BOOK1.md line 4921"
  },
  {
   "id": "heavy-armor-master",
   "name": "Heavy Armor Master",
   "phb5e": "Heavy Armor Master",
   "gist": "+1 Str; shrug off 3 from mundane hits",
   "prereq": "Proficiency with heavy armor",
   "bullets": [
    "Increase your Strength by 1 (max 20).",
    "While wearing heavy armor, bludgeoning, piercing, and slashing damage you take from nonmagical weapons is reduced by 3. Ordinary bullets and shot count."
   ],
   "src": "BOOK1.md line 4930"
  },
  {
   "id": "hex-breaker",
   "name": "Hex Breaker",
   "phb5e": "Mage Slayer",
   "gist": "Punish casters who work close to you",
   "prereq": "",
   "bullets": [
    "When a creature within 5 feet of you casts a spell, you can use your reaction to make a melee weapon attack against it.",
    "When you damage a creature that is concentrating on a spell, it has disadvantage on its saving throw to keep concentration.",
    "Advantage on saving throws against spells cast by creatures within 5 feet of you.",
    "Weave note: casters are scarce as the Weave dies; the DM may gate this feat."
   ],
   "src": "BOOK1.md line 4939"
  },
  {
   "id": "horse-soldier",
   "name": "Horse Soldier",
   "phb5e": "Mounted Combatant",
   "gist": "Fight from the saddle; guard your horse",
   "prereq": "",
   "bullets": [
    "While mounted and not incapacitated, you have advantage on melee attacks against any unmounted creature smaller than your mount.",
    "You can force an attack aimed at your mount to target you instead.",
    "If your mount must make a Dexterity save to take half damage, it takes no damage on a success and only half on a failure."
   ],
   "src": "BOOK1.md line 4950"
  },
  {
   "id": "inspiring-leader",
   "name": "Inspiring Leader",
   "phb5e": "Inspiring Leader",
   "gist": "A speech grants temporary hit points",
   "prereq": "Charisma 13 or higher",
   "bullets": [
    "Spend 10 minutes rallying your companions. Up to six friendly creatures (you can include yourself) within 30 feet who can see or hear you and understand you gain temporary hit points equal to your level + your Charisma modifier.",
    "A creature can't gain these temporary hit points again until it finishes a short or long rest."
   ],
   "src": "BOOK1.md line 4958"
  },
  {
   "id": "keen-mind",
   "name": "Keen Mind",
   "phb5e": "Keen Mind",
   "gist": "+1 Int; perfect recall, north, and time",
   "prereq": "",
   "bullets": [
    "Increase your Intelligence by 1 (max 20).",
    "You always know which way is north.",
    "You always know how many hours remain until the next sunrise or sunset.",
    "You can accurately recall anything you've seen or heard within the past month."
   ],
   "src": "BOOK1.md line 4967"
  },
  {
   "id": "lightly-armored",
   "name": "Lightly Armored",
   "phb5e": "Lightly Armored",
   "gist": "+1 Str/Dex; light armor proficiency",
   "prereq": "",
   "bullets": [
    "Increase your Strength or Dexterity by 1 (max 20).",
    "You gain proficiency with light armor (Thick Coat, Leather Jacket, Studded Vest)."
   ],
   "src": "BOOK1.md line 4976"
  },
  {
   "id": "linguist",
   "name": "Linguist",
   "phb5e": "Linguist",
   "gist": "+1 Int; three languages and ciphers",
   "prereq": "",
   "bullets": [
    "Increase your Intelligence by 1 (max 20).",
    "You learn three languages of your choice.",
    "You can write ciphers. Others can't decode them unless you teach them, succeed on an Intelligence check (DC = your Intelligence score + your proficiency bonus), or use magic."
   ],
   "src": "BOOK1.md line 4983"
  },
  {
   "id": "long-range-hex",
   "name": "Long-Range Hex",
   "phb5e": "Spell Sniper",
   "gist": "Double range on attack spells; ignore cover",
   "prereq": "The ability to cast at least one spell",
   "bullets": [
    "Spells that require an attack roll have their range doubled.",
    "Your ranged spell attacks ignore half cover and three-quarters cover.",
    "You learn one cantrip that requires an attack roll, chosen from the Storyteller (bard), Frontier Preacher (cleric), Nature Guide (druid), Hexslinger (sorcerer), Pact Seeker (warlock), or Scholar (wizard) list. Its spellcasting ability matches that list.",
    "Weave note: the Weave is dying; the DM may gate this feat."
   ],
   "src": "BOOK1.md line 4993"
  },
  {
   "id": "lucky",
   "name": "Lucky",
   "phb5e": "Lucky",
   "gist": "Three rerolls per long rest",
   "prereq": "",
   "bullets": [
    "You have 3 luck points, regained on a long rest.",
    "When you make an attack roll, ability check, or saving throw, you can spend a point to roll another d20 (after the roll, before the result is known) and choose which die to use.",
    "When a creature attacks you, you can spend a point to roll a d20 and choose whether the attacker uses its roll or yours.",
    "Separate from the Farmers' (Halfling) Lucky trait."
   ],
   "src": "BOOK1.md line 5004"
  },
  {
   "id": "martial-adept",
   "name": "Martial Adept",
   "phb5e": "Martial Adept",
   "gist": "Two maneuvers and a superiority die",
   "prereq": "",
   "bullets": [
    "You learn two maneuvers of your choice from the Battle Master (Gun Whisperer) list of Trick Shots. If a maneuver calls for a save, the DC is 8 + your proficiency bonus + your Strength or Dexterity modifier (your choice).",
    "You gain one d6 superiority die (added to any you already have), regained on a short or long rest."
   ],
   "src": "BOOK1.md line 5013"
  },
  {
   "id": "medium-armor-master",
   "name": "Medium Armor Master",
   "phb5e": "Medium Armor Master",
   "gist": "Quiet medium armor; Dex cap 3",
   "prereq": "Proficiency with medium armor",
   "bullets": [
    "Medium armor doesn't give you disadvantage on Dexterity (Stealth) checks.",
    "In medium armor, you can add up to 3 from Dexterity to your AC instead of 2."
   ],
   "src": "BOOK1.md line 5020"
  },
  {
   "id": "mobile",
   "name": "Mobile",
   "phb5e": "Mobile",
   "gist": "+10 speed; hit and move free",
   "prereq": "",
   "bullets": [
    "Your speed increases by 10 feet.",
    "When you Dash, difficult terrain costs no extra movement that turn.",
    "When you make a melee attack against a creature, you don't provoke opportunity attacks from that creature for the rest of your turn, whether you hit or miss."
   ],
   "src": "BOOK1.md line 5031"
  },
  {
   "id": "moderately-armored",
   "name": "Moderately Armored",
   "phb5e": "Moderately Armored",
   "gist": "+1 Str/Dex; medium armor and shields",
   "prereq": "Proficiency with light armor",
   "bullets": [
    "Increase your Strength or Dexterity by 1 (max 20).",
    "You gain proficiency with medium armor and shields (badge board, cavalry shield, rifle plate)."
   ],
   "src": "BOOK1.md line 5039"
  },
  {
   "id": "muzzleloader",
   "name": "Muzzleloader",
   "phb5e": "— (new, house rule)",
   "gist": "+1 Dex/Str; Tactical Reload for percussion and muzzleloaders; bonus-action jam clear",
   "prereq": "",
   "bullets": [
    "Increase your Dexterity or Strength by 1 (max 20).",
    "Powder Hands. You can use Tactical Reload (bonus action: load 1 round) with your percussion revolvers and muzzleloaders (Ball n Cap, Rifle-Musket), even though the Rifle-Musket is single-shot. Never the Big Fifty.",
    "Clear the Jam. When one of your guns misfires, you can clear it as a bonus action, with no check."
   ],
   "src": "BOOK1.md line 5048"
  },
  {
   "id": "observant",
   "name": "Observant",
   "phb5e": "Observant",
   "gist": "+1 Int/Wis; lip-reading; +5 passives",
   "prereq": "",
   "bullets": [
    "Increase your Intelligence or Wisdom by 1 (max 20).",
    "If you can see a creature's mouth while it speaks a language you understand, you can read its lips.",
    "+5 bonus to your passive Wisdom (Perception) and passive Intelligence (Investigation) scores."
   ],
   "src": "BOOK1.md line 5056"
  },
  {
   "id": "pistolero",
   "name": "Pistolero",
   "phb5e": "Crossbow Expert (house rule)",
   "gist": "Fan the Hammer; +1 and crit 19–20 with pistols in normal range",
   "prereq": "",
   "bullets": [
    "Fan the Hammer. When you take the Attack action and attack with a pistol, you can use a bonus action to make one more attack, either with that pistol (if it has a round left) or with a second pistol you're holding.",
    "Steady Grip. You gain a +1 bonus to attack rolls with pistols against targets within the pistol's normal range.",
    "Dead Eye. Your attacks with pistols score a critical hit on a roll of 19 or 20 against targets within the pistol's normal range.",
    "Fan the Hammer uses your bonus action, so you can't use Tactical Reload on a turn you fan the hammer."
   ],
   "src": "BOOK1.md line 5064"
  },
  {
   "id": "powder-man",
   "name": "Powder Man",
   "phb5e": "— (new, house rule)",
   "gist": "Charges, fuses, and dynamite",
   "prereq": "",
   "bullets": [
    "Charges and Fuses. During a short rest, with tinker's or gunsmith's tools, you can turn blasting powder into up to 3 charges (1 lb of powder each). A charge works as a fresh dynamite stick.",
    "Master of Fuses. When you light an explosive, choose its fuse: standard, long, timed (it goes off at the start of your turn 1 to 10 rounds later), or impact (it goes off where it lands; needs a blasting cap). Your fresh sticks and charges never misfire. Sweating sticks misfire for you only on a 1.",
    "Long Arm. Your throwing range for explosives is 50/100 ft.",
    "Blast-Wise. You have advantage on Dexterity saves against explosives (not spells). Your bundles and placed charges deal maximum damage to objects and structures."
   ],
   "src": "BOOK1.md line 5077"
  },
  {
   "id": "prayer-book",
   "name": "Prayer Book",
   "phb5e": "Ritual Caster",
   "gist": "Keep a book of ritual spells",
   "prereq": "Intelligence or Wisdom 13 or higher",
   "bullets": [
    "Choose one list: Storyteller (bard), Frontier Preacher (cleric), Nature Guide (druid), Hexslinger (sorcerer), Pact Seeker (warlock), or Scholar (wizard). You get a ritual book holding two 1st-level ritual spells from that list. That list's ability is your spellcasting ability for them.",
    "You can cast spells from the book only as rituals.",
    "When you find a ritual spell from your chosen list written down (a Glowing Letter you opened, another book), you can copy it in if its level is no higher than half your level (round up). Copying takes 2 hours and 5,000 ES per spell level.",
    "Weave note: the Weave is dying; the DM may gate this feat."
   ],
   "src": "BOOK1.md line 5086"
  },
  {
   "id": "resilient",
   "name": "Resilient",
   "phb5e": "Resilient",
   "gist": "+1 to one ability and its saving throw",
   "prereq": "",
   "bullets": [
    "Pick one ability score. Increase it by 1 (max 20).",
    "You gain proficiency in saving throws using that ability."
   ],
   "src": "BOOK1.md line 5099"
  },
  {
   "id": "rifleman",
   "name": "Rifleman",
   "phb5e": "Polearm Master (house rule)",
   "gist": "Rifles, carbines, and shotguns (not the Big Fifty): rifle-butt bonus strike and opportunity attacks",
   "prereq": "",
   "bullets": [
    "Long guns only: any rifle (Dulls Rolling-Block, Dullards Tube, Henrietta, Lancaster, Rifle-Musket), any carbine, or shotgun. Not the Bison Big Fifty.",
    "When you take the Attack action with a long gun, you can use a bonus action to hit someone with the rifle butt: a melee attack dealing 1d4 bludgeoning + your Strength modifier.",
    "While holding a long gun, you can make an opportunity attack with the rifle butt when a creature enters your reach (5 feet)."
   ],
   "src": "BOOK1.md line 5106"
  },
  {
   "id": "saloon-brawler",
   "name": "Saloon Brawler",
   "phb5e": "Tavern Brawler",
   "gist": "Fists, chairs, and bottles; grab after a hit",
   "prereq": "",
   "bullets": [
    "Increase your Strength or Constitution by 1 (max 20).",
    "You're proficient with improvised weapons.",
    "Your unarmed strike deals 1d4 damage.",
    "When you hit a creature on your turn with an unarmed strike or an improvised weapon, you can use a bonus action to try to grapple it."
   ],
   "src": "BOOK1.md line 5118"
  },
  {
   "id": "savage-attacker",
   "name": "Savage Attacker",
   "phb5e": "Savage Attacker",
   "gist": "Reroll melee damage once per turn",
   "prereq": "",
   "bullets": [
    "Once per turn, when you roll damage for a melee weapon attack, you can reroll the weapon's damage dice and use either total."
   ],
   "src": "BOOK1.md line 5127"
  },
  {
   "id": "sentinel",
   "name": "Sentinel",
   "phb5e": "Sentinel",
   "gist": "Lock down foes who move or strike allies",
   "prereq": "",
   "bullets": [
    "When you hit a creature with an opportunity attack, its speed drops to 0 for the rest of the turn.",
    "Creatures provoke opportunity attacks from you even if they take the Disengage action.",
    "When a creature within 5 feet of you attacks someone other than you (who doesn't also have this feat), you can use your reaction to make a melee weapon attack against it."
   ],
   "src": "BOOK1.md line 5135"
  },
  {
   "id": "sharpshooter",
   "name": "Sharpshooter",
   "phb5e": "Sharpshooter",
   "gist": "Long shots through cover; −5 for +10",
   "prereq": "",
   "bullets": [
    "Attacking at long range doesn't give you disadvantage on ranged weapon attack rolls.",
    "Your ranged weapon attacks ignore half cover and three-quarters cover.",
    "Before you attack with a ranged weapon you're proficient with, you can take −5 to the attack roll. If it hits, add +10 to the damage.",
    "Applies to every gun and bow in the Weapons chapter, shotguns included, but it doesn't remove Unwieldy."
   ],
   "src": "BOOK1.md line 5143"
  },
  {
   "id": "shield-master",
   "name": "Shield Master",
   "phb5e": "Shield Master",
   "gist": "Shove with a shield; shield helps Dex saves",
   "prereq": "",
   "bullets": [
    "When you take the Attack action, you can use a bonus action to try to shove a creature within 5 feet with your shield.",
    "If you aren't incapacitated, add your shield's AC bonus to Dexterity saves against spells or harmful effects that target only you.",
    "When an effect lets you make a Dexterity save for half damage, you can use your reaction to take no damage on a success by bracing behind your shield."
   ],
   "src": "BOOK1.md line 5152"
  },
  {
   "id": "skilled",
   "name": "Skilled",
   "phb5e": "Skilled",
   "gist": "Three skills or tools",
   "prereq": "",
   "bullets": [
    "Gain proficiency in any combination of three skills or tools."
   ],
   "src": "BOOK1.md line 5160"
  },
  {
   "id": "skulker",
   "name": "Skulker",
   "phb5e": "Skulker",
   "gist": "Hide in light cover; misses don't give you away",
   "prereq": "Dexterity 13 or higher",
   "bullets": [
    "You can try to hide when you're only lightly obscured.",
    "When you're hidden and miss with a ranged weapon attack, the attack doesn't reveal where you are.",
    "Dim light doesn't give you disadvantage on Wisdom (Perception) checks that rely on sight."
   ],
   "src": "BOOK1.md line 5168"
  },
  {
   "id": "tough",
   "name": "Tough",
   "phb5e": "Tough",
   "gist": "+2 hit points per level",
   "prereq": "",
   "bullets": [
    "Your hit point maximum increases by 2 × your level when you take this feat.",
    "It increases by 2 more every time you gain a level after that."
   ],
   "src": "BOOK1.md line 5178"
  },
  {
   "id": "tunnel-rat",
   "name": "Tunnel Rat",
   "phb5e": "Dungeon Delver",
   "gist": "Find secret doors; resist traps",
   "prereq": "",
   "bullets": [
    "Advantage on Wisdom (Perception) and Intelligence (Investigation) checks made to find secret doors.",
    "Advantage on saving throws against traps.",
    "Resistance to damage from traps.",
    "You can search for traps while traveling at a normal pace instead of only at a slow pace."
   ],
   "src": "BOOK1.md line 5185"
  },
  {
   "id": "weapon-master",
   "name": "Weapon Master",
   "phb5e": "Weapon Master",
   "gist": "+1 Str/Dex; four weapon proficiencies",
   "prereq": "",
   "bullets": [
    "Increase your Strength or Dexterity by 1 (max 20).",
    "You gain proficiency with four weapons of your choice (any weapon in the Weapons chapter; Caster Guns still need a Hexslinger)."
   ],
   "src": "BOOK1.md line 5194"
  },
  {
   "id": "weave-touched",
   "name": "Weave-Touched",
   "phb5e": "Magic Initiate",
   "gist": "Two cantrips and a 1st-level spell",
   "prereq": "",
   "bullets": [
    "Choose one list: Storyteller (bard), Frontier Preacher (cleric), Nature Guide (druid), Hexslinger (sorcerer), Pact Seeker (warlock), or Scholar (wizard).",
    "You learn two cantrips from that list.",
    "You also learn one 1st-level spell from that list. You can cast it once at its lowest level, then must finish a long rest to cast it this way again.",
    "Your spellcasting ability for these spells is the chosen list's (Cha for Storyteller, Hexslinger, and Pact Seeker; Wis for Frontier Preacher and Nature Guide; Int for Scholar).",
    "Weave note: the Weave is dying; the DM may gate this feat."
   ],
   "src": "BOOK1.md line 5201"
  }
 ],
 "spellAliases": [
  {
   "phb": "Acid Splash",
   "alias": "Vitriol",
   "sketch": "A drop of vitriol that eats cloth and skin",
   "level": 0
  },
  {
   "phb": "Blade Ward",
   "alias": "Galvanized",
   "sketch": "Brief hardness vs weapons",
   "level": 0
  },
  {
   "phb": "Chill Touch",
   "alias": "Cold Hand",
   "sketch": "Dead hand on living flesh",
   "level": 0
  },
  {
   "phb": "Dancing Lights",
   "alias": "Will-o' Claim",
   "sketch": "Floating assay sparks",
   "level": 0
  },
  {
   "phb": "Druidcraft",
   "alias": "Land Tell",
   "sketch": "Weather and bloom tells",
   "level": 0
  },
  {
   "phb": "Eldritch Blast",
   "alias": "Pact Shot",
   "sketch": "Force like a bullet from nowhere",
   "level": 0
  },
  {
   "phb": "Fire Bolt",
   "alias": "Powder Spark",
   "sketch": "Flash like a primer without a gun",
   "level": 0
  },
  {
   "phb": "Friends",
   "alias": "Snake Oil",
   "sketch": "Patter and a smile that sour when they wear off",
   "level": 0
  },
  {
   "phb": "Guidance",
   "alias": "— (prints as 5e name)",
   "sketch": "A nudge on the right check",
   "level": 0
  },
  {
   "phb": "Light",
   "alias": "— (prints as 5e name)",
   "sketch": "Soft glow without oil",
   "level": 0
  },
  {
   "phb": "Mage Hand",
   "alias": "— (prints as 5e name)",
   "sketch": "Unseen claim-helper",
   "level": 0
  },
  {
   "phb": "Mending",
   "alias": "— (prints as 5e name)",
   "sketch": "Stitch gear the Weave forgot",
   "level": 0
  },
  {
   "phb": "Message",
   "alias": "Wire Whisper",
   "sketch": "Word down the dust",
   "level": 0
  },
  {
   "phb": "Minor Illusion",
   "alias": "Dust Mirage",
   "sketch": "Heat-shimmer lie",
   "level": 0
  },
  {
   "phb": "Poison Spray",
   "alias": "Viper Puff",
   "sketch": "Breath like a snake’s spit",
   "level": 0
  },
  {
   "phb": "Prestidigitation",
   "alias": "Trail Trick",
   "sketch": "Camp comforts and petty hex",
   "level": 0
  },
  {
   "phb": "Produce Flame",
   "alias": "Campfire",
   "sketch": "A campfire in a hard palm",
   "level": 0
  },
  {
   "phb": "Ray of Frost",
   "alias": "Alkali Bite",
   "sketch": "White cold like bad flats",
   "level": 0
  },
  {
   "phb": "Resistance",
   "alias": "— (prints as 5e name)",
   "sketch": "Steady hand before the save",
   "level": 0
  },
  {
   "phb": "Sacred Flame",
   "alias": "Brimstone",
   "sketch": "Judgment fire from above, no heat until it hits",
   "level": 0
  },
  {
   "phb": "Shillelagh",
   "alias": "Walking Stick",
   "sketch": "A walking stick that hits like legacy wood",
   "level": 0
  },
  {
   "phb": "Shocking Grasp",
   "alias": "Wire Kiss",
   "sketch": "Static from a wrong Eldorite",
   "level": 0
  },
  {
   "phb": "Spare the Dying",
   "alias": "Last Rites",
   "sketch": "Last rites that keep a soul in the body",
   "level": 0
  },
  {
   "phb": "Thaumaturgy",
   "alias": "— (prints as 5e name)",
   "sketch": "Voice and doors for the creed",
   "level": 0
  },
  {
   "phb": "Thorn Whip",
   "alias": "Thorn Lash",
   "sketch": "Lash of living brush",
   "level": 0
  },
  {
   "phb": "True Strike",
   "alias": "Dead Reckoning",
   "sketch": "Range, wind, and the man's habits, worked out before the shot",
   "level": 0
  },
  {
   "phb": "Vicious Mockery",
   "alias": "Tongue Lashing",
   "sketch": "A tongue-lashing that draws blood",
   "level": 0
  },
  {
   "phb": "Burning Hands",
   "alias": "Powder Fan",
   "level": 1
  },
  {
   "phb": "Cure Wounds",
   "alias": "Trail Medicine",
   "level": 1
  },
  {
   "phb": "Shield",
   "alias": "Magnesium Flash",
   "level": 1
  },
  {
   "phb": "Magic Missile",
   "alias": "Hex Needles",
   "level": 1
  },
  {
   "phb": "Sleep",
   "alias": "Chloroform",
   "level": 1
  },
  {
   "phb": "Charm Person",
   "alias": "Kindred Spirit",
   "level": 1
  },
  {
   "phb": "Identify",
   "alias": "Field Assay",
   "level": 1
  },
  {
   "phb": "Hunter's Mark",
   "alias": "Marked Man",
   "level": 1
  },
  {
   "phb": "Hex",
   "alias": "Crossed Hex",
   "level": 1
  },
  {
   "phb": "Armor of Agathys",
   "alias": "Cold Iron Hide",
   "level": 1
  },
  {
   "phb": "Faerie Fire",
   "alias": "Foxfire",
   "level": 1
  },
  {
   "phb": "Entangle",
   "alias": "Brush Snare",
   "level": 1
  },
  {
   "phb": "Thunderwave",
   "alias": "Porch Boom",
   "level": 1
  },
  {
   "phb": "Find Familiar",
   "alias": "Dust Familiar",
   "level": 1
  },
  {
   "phb": "Witch Bolt",
   "alias": "Wire Lash",
   "level": 1
  },
  {
   "phb": "Arms of Hadar",
   "alias": "Claim Tendrils",
   "level": 1
  },
  {
   "phb": "Mage Armor",
   "alias": "Dust Skin",
   "level": 1
  },
  {
   "phb": "Disguise Self",
   "alias": "False Face",
   "level": 1
  },
  {
   "phb": "Expeditious Retreat",
   "alias": "Coca Tonic",
   "level": 1
  },
  {
   "phb": "Goodberry",
   "alias": "Trail Rations",
   "level": 1
  },
  {
   "phb": "Divine Favor",
   "alias": "Righteous Aim",
   "level": 1
  },
  {
   "phb": "Hellish Rebuke",
   "alias": "Return Fire",
   "level": 1
  },
  {
   "phb": "Bane",
   "alias": "Jinx",
   "level": 1
  },
  {
   "phb": "Shield of Faith",
   "alias": "Badge of Office",
   "level": 1
  },
  {
   "phb": "Inflict Wounds",
   "alias": "Gut Shot",
   "level": 1
  },
  {
   "phb": "Detect Poison and Disease",
   "alias": "Bad Water",
   "level": 1
  },
  {
   "phb": "Purify Food and Drink",
   "alias": "Cut the Rot",
   "level": 1
  },
  {
   "phb": "Alarm",
   "alias": "Tripwire",
   "level": 1
  },
  {
   "phb": "Hail of Thorns",
   "alias": "Bramble Round",
   "level": 1
  },
  {
   "phb": "Ensnaring Strike",
   "alias": "Bola Shot",
   "level": 1
  },
  {
   "phb": "Dissonant Whispers",
   "alias": "Bad Notes",
   "level": 1
  },
  {
   "phb": "Hideous Laughter (SRD name)",
   "alias": "Belly Laugh",
   "level": 1
  },
  {
   "phb": "Color Spray",
   "alias": "Limelight",
   "level": 1
  },
  {
   "phb": "False Life",
   "alias": "Patent Medicine",
   "level": 1
  },
  {
   "phb": "Feather Fall",
   "alias": "Terminal Velocity",
   "level": 1
  },
  {
   "phb": "Grease",
   "alias": "Axle Grease",
   "level": 1
  }
 ],
 "spellLists": {
  "storyteller": {
   "name": "Storyteller",
   "title": "Storyteller (Bard)",
   "blurb": "Charisma · Focus: your Calling instrument (voice counts) · Spells known as a bard.",
   "levels": {
    "0": [
     "Blade Ward (Galvanized)",
     "Dancing Lights (Will-o' Claim)",
     "Friends (Snake Oil)",
     "Light",
     "Mage Hand",
     "Mending",
     "Message (Wire Whisper)",
     "Minor Illusion (Dust Mirage)",
     "Prestidigitation (Trail Trick)",
     "True Strike (Dead Reckoning)",
     "Vicious Mockery (Tongue Lashing)"
    ],
    "1": [
     "Animal Friendship",
     "Bane (Jinx)",
     "Charm Person (Kindred Spirit)",
     "Comprehend Languages (Rosetta Key)",
     "Cure Wounds (Trail Medicine)",
     "Detect Magic",
     "Disguise Self (False Face)",
     "Dissonant Whispers (Bad Notes)",
     "Faerie Fire (Foxfire)",
     "Feather Fall (Terminal Velocity)",
     "Healing Word",
     "Heroism",
     "Hideous Laughter (Belly Laugh)",
     "Identify (Field Assay)",
     "Illusory Script (Invisible Ink)",
     "Longstrider",
     "Silent Image (Magic Lantern)",
     "Sleep (Chloroform)",
     "Speak with Animals",
     "Thunderwave (Porch Boom)",
     "Unseen Servant (Clockwork Help)"
    ],
    "2": [
     "Animal Messenger",
     "Blindness/Deafness",
     "Calm Emotions",
     "Cloud of Daggers (Shrapnel Cloud)",
     "Crown of Madness",
     "Detect Thoughts (Muscle Reading)",
     "Enhance Ability",
     "Enthrall (Hold the Room)",
     "Heat Metal (Branding Iron)",
     "Hold Person (Lasso)",
     "Invisibility (Vanishing Act)",
     "Knock (Skeleton Key)",
     "Lesser Restoration",
     "Locate Animals or Plants",
     "Locate Object",
     "Magic Mouth (Phonograph)",
     "Phantasmal Force (Belladonna)",
     "See Invisibility (Ghost Lens)",
     "Shatter (Resonance)",
     "Silence",
     "Suggestion (Sweet Talk)",
     "Zone of Truth (Under Oath)"
    ],
    "3": [
     "Bestow Curse",
     "Clairvoyance",
     "Dispel Magic",
     "Fear (Reputation)",
     "Feign Death (Playing Possum)",
     "Glyph of Warding",
     "Hypnotic Pattern (Swinging Watch)",
     "Major Image (Phantasmagoria)",
     "Nondetection",
     "Plant Growth",
     "Sending",
     "Speak with Dead (Graveside Confession)",
     "Speak with Plants",
     "Stinking Cloud (Rotten Eggs)",
     "Tiny Hut (Bedroll Camp)",
     "Tongues"
    ],
    "4": [
     "Compulsion",
     "Confusion",
     "Dimension Door (Misdirection)",
     "Freedom of Movement",
     "Greater Invisibility (Glass Man)",
     "Hallucinatory Terrain (Fata Morgana)",
     "Locate Creature (Wanted)",
     "Polymorph (Beast Within)"
    ],
    "5": [
     "Animate Objects (Poltergeist)",
     "Awaken",
     "Dominate Person (Bought and Paid For)",
     "Dream (Night Letter)",
     "Geas (Sworn Statement)",
     "Greater Restoration",
     "Hold Monster (Hogtie)",
     "Legend Lore",
     "Mass Cure Wounds",
     "Mislead (Decoy)",
     "Modify Memory (Clean Slate)",
     "Planar Binding",
     "Scrying",
     "Seeming (Masquerade)",
     "Teleportation Circle (Surveyed Route)"
    ],
    "6": [
     "Eyebite (Evil Eye)",
     "Find the Path",
     "Guards and Wards (Bank Vault)",
     "Irresistible Dance (Make 'Em Dance)",
     "Mass Suggestion (Medicine Show)",
     "Programmed Illusion (Kinetoscope)",
     "True Seeing"
    ],
    "7": [
     "Arcane Sword (Phantom Saber)",
     "Etherealness",
     "Forcecage (Holding Cell)",
     "Magnificent Mansion (Grand Hotel)",
     "Mirage Arcane (Promised Land)",
     "Project Image (Stand-In)",
     "Regenerate",
     "Symbol",
     "Teleport (Long Gone)"
    ],
    "8": [
     "Dominate Monster (Broke to Saddle)",
     "Feeblemind (Loco Weed)",
     "Glibness (Silver Tongue)",
     "Mind Blank (Poker Face)",
     "Power Word Stun (Hush)"
    ],
    "9": [
     "Foresight",
     "Power Word Kill (Last Word)",
     "True Polymorph"
    ]
   },
   "bonusLists": []
  },
  "frontier-preacher": {
   "name": "Frontier Preacher",
   "title": "Frontier Preacher (Cleric)",
   "blurb": "Wisdom · Focus: a holy symbol that fits your faith · Prepared as a cleric. No Preacher raises the dead except by Revivify.",
   "levels": {
    "0": [
     "Guidance",
     "Light",
     "Mending",
     "Resistance",
     "Sacred Flame (Brimstone)",
     "Spare the Dying (Last Rites)",
     "Thaumaturgy"
    ],
    "1": [
     "Bane (Jinx)",
     "Bless",
     "Command",
     "Create or Destroy Water",
     "Cure Wounds (Trail Medicine)",
     "Detect Evil and Good",
     "Detect Magic",
     "Detect Poison and Disease (Bad Water)",
     "Guiding Bolt",
     "Healing Word",
     "Inflict Wounds (Gut Shot)",
     "Protection from Evil and Good",
     "Sanctuary",
     "Shield of Faith (Badge of Office)"
    ],
    "2": [
     "Aid",
     "Augury",
     "Blindness/Deafness",
     "Calm Emotions",
     "Continual Flame",
     "Enhance Ability",
     "Find Traps",
     "Gentle Repose",
     "Hold Person (Lasso)",
     "Lesser Restoration",
     "Locate Object",
     "Prayer of Healing",
     "Protection from Poison",
     "Silence",
     "Spiritual Weapon",
     "Warding Bond",
     "Zone of Truth (Under Oath)"
    ],
    "3": [
     "Beacon of Hope",
     "Bestow Curse",
     "Clairvoyance",
     "Daylight",
     "Dispel Magic",
     "Glyph of Warding",
     "Mass Healing Word",
     "Meld into Stone",
     "Protection from Energy",
     "Remove Curse",
     "Revivify",
     "Sending",
     "Speak with Dead (Graveside Confession)",
     "Spirit Guardians (Guardian Angels)",
     "Tongues",
     "Water Walk"
    ],
    "4": [
     "Banishment",
     "Control Water",
     "Death Ward",
     "Divination",
     "Freedom of Movement",
     "Guardian of Faith",
     "Locate Creature (Wanted)",
     "Stone Shape"
    ],
    "5": [
     "Commune",
     "Contagion",
     "Dispel Evil and Good",
     "Flame Strike (Fire and Brimstone)",
     "Geas (Sworn Statement)",
     "Greater Restoration",
     "Hallow",
     "Insect Plague (Locust Swarm)",
     "Legend Lore",
     "Mass Cure Wounds",
     "Planar Binding",
     "Scrying"
    ],
    "6": [
     "Blade Barrier",
     "Find the Path",
     "Forbiddance",
     "Harm",
     "Heal",
     "Heroes' Feast",
     "Planar Ally",
     "True Seeing",
     "Word of Recall"
    ],
    "7": [
     "Conjure Celestial",
     "Divine Word",
     "Etherealness",
     "Fire Storm",
     "Plane Shift",
     "Regenerate",
     "Symbol"
    ],
    "8": [
     "Antimagic Field",
     "Control Weather",
     "Earthquake",
     "Holy Aura"
    ],
    "9": [
     "Astral Projection",
     "Gate",
     "Mass Heal"
    ]
   },
   "bonusLists": [
    {
     "name": "Faithful Sawbones",
     "title": "Faithful Sawbones (Life)",
     "dmOnly": false,
     "note": "",
     "entries": [
      {
       "atLevel": 1,
       "spells": [
        "Bless",
        "Cure Wounds (Trail Medicine)"
       ]
      },
      {
       "atLevel": 3,
       "spells": [
        "Lesser Restoration",
        "Spiritual Weapon"
       ]
      },
      {
       "atLevel": 5,
       "spells": [
        "Beacon of Hope",
        "Revivify"
       ]
      },
      {
       "atLevel": 7,
       "spells": [
        "Death Ward",
        "Guardian of Faith"
       ]
      },
      {
       "atLevel": 9,
       "spells": [
        "Mass Cure Wounds",
        "Greater Restoration"
       ]
      }
     ]
    },
    {
     "name": "Shotgun Preacher",
     "title": "Shotgun Preacher (War)",
     "dmOnly": false,
     "note": "",
     "entries": [
      {
       "atLevel": 1,
       "spells": [
        "Divine Favor (Righteous Aim)",
        "Shield of Faith (Badge of Office)"
       ]
      },
      {
       "atLevel": 3,
       "spells": [
        "Magic Weapon",
        "Spiritual Weapon"
       ]
      },
      {
       "atLevel": 5,
       "spells": [
        "Crusader's Mantle (Posse Up)",
        "Spirit Guardians (Guardian Angels)"
       ]
      },
      {
       "atLevel": 7,
       "spells": [
        "Freedom of Movement",
        "Stoneskin"
       ]
      },
      {
       "atLevel": 9,
       "spells": [
        "Flame Strike (Fire and Brimstone)",
        "Hold Monster (Hogtie)"
       ]
      }
     ]
    },
    {
     "name": "Dark Preacher",
     "title": "Dark Preacher (you can't choose this; your DM tells you when you've fallen)",
     "dmOnly": true,
     "note": "",
     "entries": [
      {
       "atLevel": 3,
       "spells": [
        "Animate Dead (Restart)"
       ]
      },
      {
       "atLevel": 6,
       "spells": [
        "Create Undead"
       ]
      }
     ]
    }
   ]
  },
  "nature-guide": {
   "name": "Nature Guide",
   "title": "Nature Guide (Druid)",
   "blurb": "Wisdom · Focus: something taken from the land · Prepared as a druid. Never subtle.",
   "levels": {
    "0": [
     "Druidcraft (Land Tell)",
     "Guidance",
     "Mending",
     "Poison Spray (Viper Puff)",
     "Produce Flame (Campfire)",
     "Resistance",
     "Shillelagh (Walking Stick)",
     "Thorn Whip (Thorn Lash)"
    ],
    "1": [
     "Animal Friendship",
     "Charm Person (Kindred Spirit)",
     "Create or Destroy Water",
     "Cure Wounds (Trail Medicine)",
     "Detect Magic",
     "Detect Poison and Disease (Bad Water)",
     "Entangle (Brush Snare)",
     "Faerie Fire (Foxfire)",
     "Fog Cloud",
     "Goodberry (Trail Rations)",
     "Healing Word",
     "Jump",
     "Longstrider",
     "Purify Food and Drink (Cut the Rot)",
     "Speak with Animals",
     "Thunderwave (Porch Boom)"
    ],
    "2": [
     "Animal Messenger",
     "Barkskin (Rawhide)",
     "Beast Sense",
     "Darkvision (Owl Eyes)",
     "Enhance Ability",
     "Find Traps",
     "Flame Blade",
     "Flaming Sphere (Burning Tumbleweed)",
     "Gust of Wind (Dust Devil)",
     "Heat Metal (Branding Iron)",
     "Hold Person (Lasso)",
     "Lesser Restoration",
     "Locate Animals or Plants",
     "Locate Object",
     "Moonbeam (Hunter's Moon)",
     "Pass without Trace (Cold Trail)",
     "Protection from Poison",
     "Spike Growth (Cholla Patch)"
    ],
    "3": [
     "Call Lightning (Thunderhead)",
     "Conjure Animals (Stampede)",
     "Daylight",
     "Dispel Magic",
     "Feign Death (Playing Possum)",
     "Meld into Stone",
     "Plant Growth",
     "Protection from Energy",
     "Sleet Storm (Blue Norther)",
     "Speak with Plants",
     "Water Breathing",
     "Water Walk",
     "Wind Wall (Dust Wall)"
    ],
    "4": [
     "Blight",
     "Confusion",
     "Conjure Minor Elementals (Mud and Cinder)",
     "Conjure Woodland Beings",
     "Control Water",
     "Dominate Beast",
     "Freedom of Movement",
     "Giant Insect",
     "Grasping Vine (Vine Trap)",
     "Hallucinatory Terrain (Fata Morgana)",
     "Ice Storm (Hailstorm)",
     "Locate Creature (Wanted)",
     "Polymorph (Beast Within)",
     "Stone Shape",
     "Stoneskin",
     "Wall of Fire (Prairie Fire)"
    ],
    "5": [
     "Antilife Shell",
     "Awaken",
     "Commune with Nature (Read the Land)",
     "Conjure Elemental (Force of Nature)",
     "Contagion",
     "Geas (Sworn Statement)",
     "Greater Restoration",
     "Insect Plague (Locust Swarm)",
     "Mass Cure Wounds",
     "Planar Binding",
     "Reincarnate",
     "Scrying",
     "Tree Stride (Cottonwood Walk)",
     "Wall of Stone (Rimrock)"
    ],
    "6": [
     "Find the Path",
     "Heal",
     "Heroes' Feast",
     "Move Earth (Washout)",
     "Sunbeam (Desert Glare)",
     "Transport via Plants",
     "Wall of Thorns",
     "Wind Walk (Dust Riders)"
    ],
    "7": [
     "Fire Storm",
     "Mirage Arcane (Promised Land)",
     "Plane Shift",
     "Regenerate",
     "Reverse Gravity (Head Over Heels)"
    ],
    "8": [
     "Animal Shapes",
     "Antipathy/Sympathy (Draw and Drive)",
     "Control Weather",
     "Earthquake",
     "Feeblemind (Loco Weed)",
     "Sunburst (High Noon)",
     "Tsunami"
    ],
    "9": [
     "Foresight",
     "Shapechange (Proteus)",
     "Storm of Vengeance",
     "True Resurrection"
    ]
   },
   "bonusLists": []
  },
  "lawman": {
   "name": "Lawman",
   "title": "Lawman (Paladin)",
   "blurb": "Charisma · Focus: your badge (Badge Bound) · Prepared as a paladin, spells to 5th.",
   "levels": {
    "1": [
     "Bless",
     "Command",
     "Compelled Duel",
     "Cure Wounds (Trail Medicine)",
     "Detect Evil and Good",
     "Detect Poison and Disease (Bad Water)",
     "Divine Favor (Righteous Aim)",
     "Heroism",
     "Protection from Evil and Good",
     "Searing Smite",
     "Shield of Faith (Badge of Office)",
     "Thunderous Smite",
     "Wrathful Smite"
    ],
    "2": [
     "Aid",
     "Branding Smite",
     "Find Steed",
     "Lesser Restoration",
     "Locate Object",
     "Magic Weapon",
     "Protection from Poison",
     "Zone of Truth (Under Oath)"
    ],
    "3": [
     "Blinding Smite",
     "Crusader's Mantle (Posse Up)",
     "Daylight",
     "Dispel Magic",
     "Remove Curse"
    ],
    "4": [
     "Aura of Life",
     "Aura of Purity",
     "Banishment",
     "Death Ward",
     "Locate Creature (Wanted)",
     "Staggering Smite"
    ],
    "5": [
     "Banishing Smite",
     "Circle of Power",
     "Destructive Wave (Judgment Day)",
     "Dispel Evil and Good",
     "Geas (Sworn Statement)"
    ]
   },
   "bonusLists": [
    {
     "name": "Oath of the Lawless",
     "title": "Oath of the Lawless (you can't choose this; you fall into it when your badge tarnishes). Oath spells",
     "dmOnly": true,
     "note": "Your DM has the rest of the Lawless list",
     "entries": [
      {
       "atLevel": 3,
       "spells": [
        "Hellish Rebuke (Return Fire)",
        "Inflict Wounds (Gut Shot)"
       ]
      },
      {
       "atLevel": 5,
       "spells": [
        "Crown of Madness",
        "Darkness (Black Hat)"
       ]
      },
      {
       "atLevel": 9,
       "spells": [
        "Animate Dead (Restart)",
        "Bestow Curse"
       ]
      },
      {
       "atLevel": 13,
       "spells": [
        "Blight",
        "Confusion"
       ]
      },
      {
       "atLevel": 17,
       "spells": [
        "Contagion",
        "Dominate Person (Bought and Paid For)"
       ]
      }
     ]
    }
   ]
  },
  "frontier-scout": {
   "name": "Frontier Scout",
   "title": "Frontier Scout (Ranger)",
   "blurb": "Wisdom · Focus: a keepsake of home or the wild country · Spells known as a ranger, spells to 5th. \"Arrow\" spells work through any ranged weapon, guns included.",
   "levels": {
    "1": [
     "Alarm (Tripwire)",
     "Animal Friendship",
     "Cure Wounds (Trail Medicine)",
     "Detect Magic",
     "Detect Poison and Disease (Bad Water)",
     "Ensnaring Strike (Bola Shot)",
     "Fog Cloud",
     "Goodberry (Trail Rations)",
     "Hail of Thorns (Bramble Round)",
     "Hunter's Mark (Marked Man)",
     "Jump",
     "Longstrider",
     "Purify Food and Drink (Cut the Rot)",
     "Speak with Animals"
    ],
    "2": [
     "Animal Messenger",
     "Barkskin (Rawhide)",
     "Beast Sense",
     "Cordon of Arrows (Sentry Rounds)",
     "Darkvision (Owl Eyes)",
     "Find Traps",
     "Lesser Restoration",
     "Locate Animals or Plants",
     "Locate Object",
     "Pass without Trace (Cold Trail)",
     "Protection from Poison",
     "Silence",
     "Spike Growth (Cholla Patch)"
    ],
    "3": [
     "Conjure Animals (Stampede)",
     "Conjure Barrage (Lead Storm)",
     "Daylight",
     "Lightning Arrow (Thunder Round)",
     "Nondetection",
     "Plant Growth",
     "Protection from Energy",
     "Speak with Plants",
     "Water Breathing",
     "Water Walk",
     "Wind Wall (Dust Wall)"
    ],
    "4": [
     "Freedom of Movement",
     "Grasping Vine (Vine Trap)",
     "Locate Creature (Wanted)",
     "Stoneskin"
    ],
    "5": [
     "Commune with Nature (Read the Land)",
     "Conjure Volley (Rain of Lead)",
     "Swift Quiver (Fast Hands)",
     "Tree Stride (Cottonwood Walk)"
    ]
   },
   "bonusLists": []
  },
  "hexslinger": {
   "name": "Hexslinger",
   "title": "Hexslinger (Sorcerer)",
   "blurb": "Charisma · Focus: your Caster Gun · Spells known as a sorcerer. Every spell is a Shell fired from the gun (Callings p.30; Equipment p.65–70). Never subtle.",
   "levels": {
    "0": [
     "Acid Splash Shell",
     "Blade Ward Shell",
     "Chill Touch Shell",
     "Dancing Lights Shell",
     "Fire Bolt Shell",
     "Friends Shell",
     "Light Shell",
     "Mage Hand Shell",
     "Mending Shell",
     "Message Shell",
     "Minor Illusion Shell",
     "Poison Spray Shell",
     "Prestidigitation Shell",
     "Ray of Frost Shell",
     "Shocking Grasp Shell",
     "True Strike Shell"
    ],
    "1": [
     "Burning Hands Shell",
     "Charm Person Shell",
     "Chromatic Orb Shell",
     "Color Spray Shell",
     "Comprehend Languages Shell",
     "Detect Magic Shell",
     "Disguise Self Shell",
     "Expeditious Retreat Shell",
     "False Life Shell",
     "Feather Fall Shell",
     "Fog Cloud Shell",
     "Jump Shell",
     "Mage Armor Shell",
     "Magic Missile Shell",
     "Ray of Sickness Shell",
     "Shield Shell",
     "Silent Image Shell",
     "Sleep Shell",
     "Thunderwave Shell",
     "Witch Bolt Shell"
    ],
    "2": [
     "Alter Self Shell",
     "Blindness/Deafness Shell",
     "Blur Shell",
     "Cloud of Daggers Shell",
     "Crown of Madness Shell",
     "Darkness Shell",
     "Darkvision Shell",
     "Detect Thoughts Shell",
     "Enhance Ability Shell",
     "Enlarge/Reduce Shell",
     "Gust of Wind Shell",
     "Hold Person Shell",
     "Invisibility Shell",
     "Knock Shell",
     "Levitate Shell",
     "Mirror Image Shell",
     "Misty Step Shell",
     "Phantasmal Force Shell",
     "Scorching Ray Shell",
     "See Invisibility Shell",
     "Shatter Shell",
     "Spider Climb Shell",
     "Suggestion Shell",
     "Web Shell"
    ],
    "3": [
     "Blink Shell",
     "Clairvoyance Shell",
     "Counterspell Shell",
     "Daylight Shell",
     "Dispel Magic Shell",
     "Fear Shell",
     "Fireball Shell",
     "Fly Shell",
     "Gaseous Form Shell",
     "Haste Shell",
     "Hypnotic Pattern Shell",
     "Lightning Bolt Shell",
     "Major Image Shell",
     "Protection from Energy Shell",
     "Sleet Storm Shell",
     "Slow Shell",
     "Stinking Cloud Shell",
     "Tongues Shell",
     "Water Breathing Shell",
     "Water Walk Shell"
    ],
    "4": [
     "Banishment Shell",
     "Blight Shell",
     "Confusion Shell",
     "Dimension Door Shell",
     "Dominate Beast Shell",
     "Greater Invisibility Shell",
     "Ice Storm Shell",
     "Polymorph Shell",
     "Stoneskin Shell",
     "Wall of Fire Shell"
    ],
    "5": [
     "Animate Objects Shell",
     "Cloudkill Shell",
     "Cone of Cold Shell",
     "Creation Shell",
     "Dominate Person Shell",
     "Hold Monster Shell",
     "Insect Plague Shell",
     "Seeming Shell",
     "Telekinesis Shell",
     "Teleportation Circle Shell",
     "Wall of Stone Shell"
    ],
    "6": [
     "Arcane Gate Shell",
     "Chain Lightning Shell",
     "Circle of Death Shell",
     "Disintegrate Shell",
     "Eyebite Shell",
     "Globe of Invulnerability Shell",
     "Mass Suggestion Shell",
     "Move Earth Shell",
     "Sunbeam Shell",
     "True Seeing Shell"
    ],
    "7": [
     "Delayed Blast Fireball Shell",
     "Etherealness Shell",
     "Finger of Death Shell",
     "Fire Storm Shell",
     "Plane Shift Shell",
     "Prismatic Spray Shell",
     "Reverse Gravity Shell",
     "Teleport Shell"
    ],
    "8": [
     "Dominate Monster Shell",
     "Earthquake Shell",
     "Incendiary Cloud Shell",
     "Power Word Stun Shell",
     "Sunburst Shell"
    ],
    "9": [
     "Gate Shell",
     "Meteor Swarm Shell",
     "Power Word Kill Shell",
     "Time Stop Shell",
     "Wish Shell"
    ]
   },
   "bonusLists": []
  },
  "pact-seeker": {
   "name": "Pact Seeker",
   "title": "Pact Seeker (Warlock)",
   "blurb": "Charisma · Focus: the Borrowed Iron, in hand (no iron, no spells) · Spells known as a warlock; 6th–9th through Mystic Arcanum. Your patron adds more spells, and your DM has that list. Never subtle.",
   "levels": {
    "0": [
     "Blade Ward (Galvanized)",
     "Chill Touch (Cold Hand)",
     "Eldritch Blast (Pact Shot)",
     "Friends (Snake Oil)",
     "Mage Hand",
     "Minor Illusion (Dust Mirage)",
     "Poison Spray (Viper Puff)",
     "Prestidigitation (Trail Trick)",
     "True Strike (Dead Reckoning)"
    ],
    "1": [
     "Armor of Agathys (Cold Iron Hide)",
     "Arms of Hadar (Claim Tendrils)",
     "Charm Person (Kindred Spirit)",
     "Comprehend Languages (Rosetta Key)",
     "Expeditious Retreat (Coca Tonic)",
     "Hellish Rebuke (Return Fire)",
     "Hex (Crossed Hex)",
     "Illusory Script (Invisible Ink)",
     "Protection from Evil and Good",
     "Unseen Servant (Clockwork Help)",
     "Witch Bolt (Wire Lash)"
    ],
    "2": [
     "Cloud of Daggers (Shrapnel Cloud)",
     "Crown of Madness",
     "Darkness (Black Hat)",
     "Enthrall (Hold the Room)",
     "Hold Person (Lasso)",
     "Invisibility (Vanishing Act)",
     "Mirror Image (House of Mirrors)",
     "Misty Step (Puff of Smoke)",
     "Ray of Enfeeblement",
     "Shatter (Resonance)",
     "Spider Climb (Fly on the Wall)",
     "Suggestion (Sweet Talk)"
    ],
    "3": [
     "Counterspell (Interference)",
     "Dispel Magic",
     "Fear (Reputation)",
     "Fly (Aeronaut)",
     "Gaseous Form (Sublimation)",
     "Hunger of Hadar (Outer Dark)",
     "Hypnotic Pattern (Swinging Watch)",
     "Magic Circle (Line in the Sand)",
     "Major Image (Phantasmagoria)",
     "Remove Curse",
     "Tongues",
     "Vampiric Touch (Bleed 'Em Dry)"
    ],
    "4": [
     "Banishment",
     "Blight",
     "Dimension Door (Misdirection)",
     "Hallucinatory Terrain (Fata Morgana)"
    ],
    "5": [
     "Contact Other Plane (Automatic Writing)",
     "Dream (Night Letter)",
     "Hold Monster (Hogtie)",
     "Scrying"
    ],
    "6": [
     "Arcane Gate (Shortcut)",
     "Circle of Death (Ghost Town)",
     "Conjure Fey (Fair Folk)",
     "Create Undead",
     "Eyebite (Evil Eye)",
     "Flesh to Stone (Petrified)",
     "Mass Suggestion (Medicine Show)",
     "True Seeing"
    ],
    "7": [
     "Etherealness",
     "Finger of Death (Dead Man's Hand)",
     "Forcecage (Holding Cell)",
     "Plane Shift"
    ],
    "8": [
     "Demiplane (Back Room)",
     "Dominate Monster (Broke to Saddle)",
     "Feeblemind (Loco Weed)",
     "Glibness (Silver Tongue)",
     "Power Word Stun (Hush)"
    ],
    "9": [
     "Astral Projection",
     "Foresight",
     "Imprisonment (Life Sentence)",
     "Power Word Kill (Last Word)",
     "True Polymorph"
    ]
   },
   "bonusLists": []
  },
  "scholar": {
   "name": "Scholar",
   "title": "Scholar (Wizard)",
   "blurb": "Intelligence · Focus: any scientific instrument or medium you devise · Spells copied into your Chemical Field Ledger, prepared as a wizard.",
   "levels": {
    "0": [
     "Acid Splash (Vitriol)",
     "Blade Ward (Galvanized)",
     "Chill Touch (Cold Hand)",
     "Dancing Lights (Will-o' Claim)",
     "Fire Bolt (Powder Spark)",
     "Friends (Snake Oil)",
     "Light (Lucifer Match)",
     "Mage Hand (Long Arm)",
     "Mending (Solder)",
     "Message (Wire Whisper)",
     "Minor Illusion (Dust Mirage)",
     "Poison Spray (Viper Puff)",
     "Prestidigitation (Trail Trick)",
     "Ray of Frost (Alkali Bite)",
     "Shocking Grasp (Wire Kiss)",
     "True Strike (Dead Reckoning)"
    ],
    "1": [
     "Alarm (Tripwire)",
     "Burning Hands (Powder Fan)",
     "Charm Person (Kindred Spirit)",
     "Chromatic Orb (Prism Charge)",
     "Color Spray (Limelight)",
     "Comprehend Languages (Rosetta Key)",
     "Detect Magic (Galvanometer)",
     "Disguise Self (False Face)",
     "Expeditious Retreat (Coca Tonic)",
     "False Life (Patent Medicine)",
     "Feather Fall (Terminal Velocity)",
     "Find Familiar (Dust Familiar)",
     "Floating Disk (Floating Freight)",
     "Fog Cloud (Steam Valve)",
     "Grease (Axle Grease)",
     "Hideous Laughter (Belly Laugh)",
     "Identify (Field Assay)",
     "Illusory Script (Invisible Ink)",
     "Jump (Spring Heels)",
     "Longstrider (Stride Tonic)",
     "Mage Armor (Dust Skin)",
     "Magic Missile (Hex Needles)",
     "Protection from Evil and Good (Carbolic Wash)",
     "Ray of Sickness (Miasma)",
     "Shield (Magnesium Flash)",
     "Silent Image (Magic Lantern)",
     "Sleep (Chloroform)",
     "Thunderwave (Porch Boom)",
     "Unseen Servant (Clockwork Help)",
     "Witch Bolt (Wire Lash)"
    ],
    "2": [
     "Acid Arrow (Aqua Regia)",
     "Alter Self (Chameleon Serum)",
     "Arcane Lock (Patent Lock)",
     "Arcanist's Magic Aura (False Assay)",
     "Blindness/Deafness (Flashbang)",
     "Blur (Heat Shimmer)",
     "Cloud of Daggers (Shrapnel Cloud)",
     "Continual Flame (Gas Lamp)",
     "Crown of Madness (Mercury Fever)",
     "Darkness (Black Hat)",
     "Darkvision (Owl Eyes)",
     "Detect Thoughts (Muscle Reading)",
     "Enlarge/Reduce (Proportion Serum)",
     "Flaming Sphere (Burning Tumbleweed)",
     "Gentle Repose (Embalming)",
     "Gust of Wind (Dust Devil)",
     "Hold Person (Lasso)",
     "Invisibility (Vanishing Act)",
     "Knock (Skeleton Key)",
     "Levitate (Lighter Than Air)",
     "Locate Object (Dowsing Rod)",
     "Magic Mouth (Phonograph)",
     "Magic Weapon (Rifling)",
     "Mirror Image (House of Mirrors)",
     "Misty Step (Puff of Smoke)",
     "Phantasmal Force (Belladonna)",
     "Ray of Enfeeblement (Lassitude)",
     "Rope Trick (Pocket Room)",
     "Scorching Ray (Burning Glass)",
     "See Invisibility (Ghost Lens)",
     "Shatter (Resonance)",
     "Spider Climb (Fly on the Wall)",
     "Suggestion (Sweet Talk)",
     "Web (Flypaper)"
    ],
    "3": [
     "Animate Dead (Restart)",
     "Bestow Curse (Contagion Theory)",
     "Blink (Now You See Me)",
     "Clairvoyance (Periscope)",
     "Counterspell (Interference)",
     "Dispel Magic (Ground Wire)",
     "Fear (Reputation)",
     "Feign Death (Playing Possum)",
     "Fireball (Nitro Charge)",
     "Fly (Aeronaut)",
     "Gaseous Form (Sublimation)",
     "Glyph of Warding (Booby Trap)",
     "Haste (Quicksilver)",
     "Hypnotic Pattern (Swinging Watch)",
     "Lightning Bolt (Leyden Jar)",
     "Magic Circle (Line in the Sand)",
     "Major Image (Phantasmagoria)",
     "Nondetection (Lead Lining)",
     "Phantom Steed (Iron Horse)",
     "Protection from Energy (Insulation)",
     "Remove Curse (Antidote)",
     "Sending (Telegram)",
     "Sleet Storm (Blue Norther)",
     "Slow (Molasses)",
     "Stinking Cloud (Rotten Eggs)",
     "Tiny Hut (Bedroll Camp)",
     "Tongues (Phrasebook)",
     "Vampiric Touch (Bleed 'Em Dry)",
     "Water Breathing (Diving Bell)"
    ],
    "4": [
     "Arcane Eye (Camera Obscura)",
     "Banishment (Displacement)",
     "Black Tentacles (Tar Pit)",
     "Blight (Desiccation)",
     "Confusion (Laudanum)",
     "Conjure Minor Elementals (Mud and Cinder)",
     "Control Water (Hydraulics)",
     "Dimension Door (Misdirection)",
     "Fabricate (Manufactory)",
     "Faithful Hound (Watchdog)",
     "Fire Shield (Thermal Jacket)",
     "Greater Invisibility (Glass Man)",
     "Hallucinatory Terrain (Fata Morgana)",
     "Ice Storm (Hailstorm)",
     "Locate Creature (Wanted)",
     "Phantasmal Killer (Nightmare Noose)",
     "Polymorph (Beast Within)",
     "Private Sanctum (Faraday Cage)",
     "Resilient Sphere (Bell Jar)",
     "Secret Chest (Safe Deposit)",
     "Stone Shape (Blasting Gelatin)",
     "Stoneskin (Vulcanized)",
     "Wall of Fire (Prairie Fire)"
    ],
    "5": [
     "Animate Objects (Poltergeist)",
     "Arcane Hand (Hydraulic Hand)",
     "Cloudkill (Choke Damp)",
     "Cone of Cold (Liquid Air)",
     "Conjure Elemental (Force of Nature)",
     "Contact Other Plane (Automatic Writing)",
     "Creation (Synthesis)",
     "Dominate Person (Bought and Paid For)",
     "Dream (Night Letter)",
     "Geas (Sworn Statement)",
     "Hold Monster (Hogtie)",
     "Legend Lore (Archives)",
     "Mislead (Decoy)",
     "Modify Memory (Clean Slate)",
     "Passwall (Hole in the Wall)",
     "Planar Binding (Containment Jar)",
     "Scrying (Peep Glass)",
     "Seeming (Masquerade)",
     "Telekinesis (Lodestone)",
     "Telepathic Bond (Party Line)",
     "Teleportation Circle (Surveyed Route)",
     "Wall of Force (Plate Glass)",
     "Wall of Stone (Rimrock)"
    ],
    "6": [
     "Arcane Gate (Shortcut)",
     "Chain Lightning (Telegraph Line)",
     "Circle of Death (Ghost Town)",
     "Contingency (Insurance Policy)",
     "Create Undead (Reanimator)",
     "Disintegrate (Dissolution)",
     "Eyebite (Evil Eye)",
     "Flesh to Stone (Petrified)",
     "Freezing Sphere (Freezing Mixture)",
     "Globe of Invulnerability (Dampening Field)",
     "Guards and Wards (Bank Vault)",
     "Instant Summons (Pneumatic Tube)",
     "Irresistible Dance (Make 'Em Dance)",
     "Magic Jar (Specimen Jar)",
     "Mass Suggestion (Medicine Show)",
     "Move Earth (Washout)",
     "Programmed Illusion (Kinetoscope)",
     "Sunbeam (Desert Glare)",
     "True Seeing (Spectroscope)",
     "Wall of Ice (Ice House)"
    ],
    "7": [
     "Arcane Sword (Phantom Saber)",
     "Delayed Blast Fireball (Slow Fuse)",
     "Etherealness (Out of Phase)",
     "Finger of Death (Dead Man's Hand)",
     "Forcecage (Holding Cell)",
     "Magnificent Mansion (Grand Hotel)",
     "Mirage Arcane (Promised Land)",
     "Plane Shift (Frequency Shift)",
     "Prismatic Spray (Full Spectrum)",
     "Project Image (Stand-In)",
     "Reverse Gravity (Head Over Heels)",
     "Sequester (Cold Storage)",
     "Simulacrum (Spitting Image)",
     "Symbol (Schematic)",
     "Teleport (Long Gone)"
    ],
    "8": [
     "Antimagic Field (Null Field)",
     "Antipathy/Sympathy (Draw and Drive)",
     "Clone (Galvanic Twin)",
     "Control Weather (Meteorologist)",
     "Demiplane (Back Room)",
     "Dominate Monster (Broke to Saddle)",
     "Feeblemind (Loco Weed)",
     "Incendiary Cloud (Firedamp)",
     "Maze (Box Canyon)",
     "Mind Blank (Poker Face)",
     "Power Word Stun (Hush)",
     "Sunburst (High Noon)",
     "Telepathy (Wireless)"
    ],
    "9": [
     "Astral Projection (Out of Body)",
     "Foresight (Probability)",
     "Gate (Aperture)",
     "Imprisonment (Life Sentence)",
     "Meteor Swarm (Skyfall)",
     "Power Word Kill (Last Word)",
     "Prismatic Wall (Stained Glass)",
     "Shapechange (Proteus)",
     "Time Stop (Stopwatch)",
     "True Polymorph (Transmutation)",
     "Weird (Mass Hysteria)",
     "Wish (Eureka)"
    ]
   },
   "bonusLists": []
  }
 },
 "spellCast": [
  {
   "name": "Acid Splash",
   "level": 0,
   "kind": "save",
   "save": "DEX",
   "dice": "1d6",
   "type": "acid",
   "scale": "cantrip"
  },
  {
   "name": "Blade Ward",
   "level": 0,
   "kind": "none"
  },
  {
   "name": "Blade Ward Shell",
   "level": 0,
   "kind": "none"
  },
  {
   "name": "Chill Touch",
   "level": 0,
   "kind": "attack",
   "dice": "1d8",
   "type": "necrotic",
   "scale": "cantrip"
  },
  {
   "name": "Dancing Lights",
   "level": 0,
   "kind": "none"
  },
  {
   "name": "Dancing Lights Shell",
   "level": 0,
   "kind": "none"
  },
  {
   "name": "Druidcraft",
   "level": 0,
   "kind": "none"
  },
  {
   "name": "Eldritch Blast",
   "level": 0,
   "kind": "attack",
   "dice": "1d10",
   "type": "force",
   "scale": "beam"
  },
  {
   "name": "Fire Bolt",
   "level": 0,
   "kind": "attack",
   "dice": "1d10",
   "type": "fire",
   "scale": "cantrip"
  },
  {
   "name": "Friends",
   "level": 0,
   "kind": "none"
  },
  {
   "name": "Friends Shell",
   "level": 0,
   "kind": "none"
  },
  {
   "name": "Guidance",
   "level": 0,
   "kind": "none"
  },
  {
   "name": "Light",
   "level": 0,
   "kind": "none"
  },
  {
   "name": "Light Shell",
   "level": 0,
   "kind": "none"
  },
  {
   "name": "Mage Hand",
   "level": 0,
   "kind": "none"
  },
  {
   "name": "Mage Hand Shell",
   "level": 0,
   "kind": "none"
  },
  {
   "name": "Mending",
   "level": 0,
   "kind": "none"
  },
  {
   "name": "Mending Shell",
   "level": 0,
   "kind": "none"
  },
  {
   "name": "Message",
   "level": 0,
   "kind": "none"
  },
  {
   "name": "Message Shell",
   "level": 0,
   "kind": "none"
  },
  {
   "name": "Minor Illusion",
   "level": 0,
   "kind": "none"
  },
  {
   "name": "Minor Illusion Shell",
   "level": 0,
   "kind": "none"
  },
  {
   "name": "Poison Spray",
   "level": 0,
   "kind": "save",
   "save": "CON",
   "dice": "1d12",
   "type": "poison",
   "scale": "cantrip"
  },
  {
   "name": "Prestidigitation",
   "level": 0,
   "kind": "none"
  },
  {
   "name": "Prestidigitation Shell",
   "level": 0,
   "kind": "none"
  },
  {
   "name": "Produce Flame",
   "level": 0,
   "kind": "attack",
   "dice": "1d8",
   "type": "fire",
   "scale": "cantrip"
  },
  {
   "name": "Ray of Frost",
   "level": 0,
   "kind": "attack",
   "dice": "1d8",
   "type": "cold",
   "scale": "cantrip"
  },
  {
   "name": "Resistance",
   "level": 0,
   "kind": "none"
  },
  {
   "name": "Sacred Flame",
   "level": 0,
   "kind": "save",
   "save": "DEX",
   "dice": "1d8",
   "type": "radiant",
   "scale": "cantrip"
  },
  {
   "name": "Shillelagh",
   "level": 0,
   "kind": "none"
  },
  {
   "name": "Shocking Grasp",
   "level": 0,
   "kind": "attack",
   "dice": "1d8",
   "type": "lightning",
   "scale": "cantrip"
  },
  {
   "name": "Spare the Dying",
   "level": 0,
   "kind": "none"
  },
  {
   "name": "Thaumaturgy",
   "level": 0,
   "kind": "none"
  },
  {
   "name": "Thorn Whip",
   "level": 0,
   "kind": "attack",
   "dice": "1d6",
   "type": "piercing",
   "scale": "cantrip"
  },
  {
   "name": "True Strike",
   "level": 0,
   "kind": "none"
  },
  {
   "name": "True Strike Shell",
   "level": 0,
   "kind": "none"
  },
  {
   "name": "Vicious Mockery",
   "level": 0,
   "kind": "save",
   "save": "WIS",
   "dice": "1d4",
   "type": "psychic",
   "scale": "cantrip"
  },
  {
   "name": "Alarm",
   "level": 1,
   "kind": "none"
  },
  {
   "name": "Animal Friendship",
   "level": 1,
   "kind": "none"
  },
  {
   "name": "Armor of Agathys",
   "level": 1,
   "kind": "none"
  },
  {
   "name": "Arms of Hadar",
   "level": 1,
   "kind": "save",
   "save": "STR",
   "dice": "2d6",
   "type": "necrotic",
   "up": "1d6"
  },
  {
   "name": "Bane",
   "level": 1,
   "kind": "none"
  },
  {
   "name": "Bless",
   "level": 1,
   "kind": "none"
  },
  {
   "name": "Burning Hands",
   "level": 1,
   "kind": "save",
   "save": "DEX",
   "dice": "3d6",
   "type": "fire",
   "up": "1d6",
   "half": true
  },
  {
   "name": "Charm Person",
   "level": 1,
   "kind": "none"
  },
  {
   "name": "Charm Person Shell",
   "level": 1,
   "kind": "none"
  },
  {
   "name": "Chromatic Orb",
   "level": 1,
   "kind": "attack",
   "dice": "3d8",
   "type": "the type you chose",
   "up": "1d8"
  },
  {
   "name": "Color Spray",
   "level": 1,
   "kind": "none"
  },
  {
   "name": "Color Spray Shell",
   "level": 1,
   "kind": "none"
  },
  {
   "name": "Command",
   "level": 1,
   "kind": "none"
  },
  {
   "name": "Compelled Duel",
   "level": 1,
   "kind": "none"
  },
  {
   "name": "Comprehend Languages",
   "level": 1,
   "kind": "none"
  },
  {
   "name": "Comprehend Languages Shell",
   "level": 1,
   "kind": "none"
  },
  {
   "name": "Create or Destroy Water",
   "level": 1,
   "kind": "none"
  },
  {
   "name": "Cure Wounds",
   "level": 1,
   "kind": "heal",
   "dice": "1d8",
   "up": "1d8",
   "healMod": true
  },
  {
   "name": "Detect Evil and Good",
   "level": 1,
   "kind": "none"
  },
  {
   "name": "Detect Magic",
   "level": 1,
   "kind": "none"
  },
  {
   "name": "Detect Magic Shell",
   "level": 1,
   "kind": "none"
  },
  {
   "name": "Detect Poison and Disease",
   "level": 1,
   "kind": "none"
  },
  {
   "name": "Disguise Self",
   "level": 1,
   "kind": "none"
  },
  {
   "name": "Disguise Self Shell",
   "level": 1,
   "kind": "none"
  },
  {
   "name": "Dissonant Whispers",
   "level": 1,
   "kind": "save",
   "save": "WIS",
   "dice": "3d6",
   "type": "psychic",
   "up": "1d6"
  },
  {
   "name": "Ensnaring Strike",
   "level": 1,
   "kind": "weapon",
   "save": "STR",
   "dice": "1d6",
   "type": "piercing",
   "up": "1d6",
   "weapon": true
  },
  {
   "name": "Entangle",
   "level": 1,
   "kind": "none"
  },
  {
   "name": "Expeditious Retreat",
   "level": 1,
   "kind": "none"
  },
  {
   "name": "Expeditious Retreat Shell",
   "level": 1,
   "kind": "none"
  },
  {
   "name": "Faerie Fire",
   "level": 1,
   "kind": "none"
  },
  {
   "name": "False Life",
   "level": 1,
   "kind": "none"
  },
  {
   "name": "False Life Shell",
   "level": 1,
   "kind": "none"
  },
  {
   "name": "Feather Fall",
   "level": 1,
   "kind": "none"
  },
  {
   "name": "Feather Fall Shell",
   "level": 1,
   "kind": "none"
  },
  {
   "name": "Find Familiar",
   "level": 1,
   "kind": "none"
  },
  {
   "name": "Floating Disk",
   "level": 1,
   "kind": "none"
  },
  {
   "name": "Fog Cloud",
   "level": 1,
   "kind": "none"
  },
  {
   "name": "Fog Cloud Shell",
   "level": 1,
   "kind": "none"
  },
  {
   "name": "Goodberry",
   "level": 1,
   "kind": "none"
  },
  {
   "name": "Grease",
   "level": 1,
   "kind": "none"
  },
  {
   "name": "Guiding Bolt",
   "level": 1,
   "kind": "attack",
   "dice": "4d6",
   "type": "radiant",
   "up": "1d6"
  },
  {
   "name": "Hail of Thorns",
   "level": 1,
   "kind": "weapon",
   "save": "DEX",
   "dice": "1d10",
   "type": "piercing",
   "up": "1d10",
   "weapon": true
  },
  {
   "name": "Healing Word",
   "level": 1,
   "kind": "heal",
   "dice": "1d4",
   "up": "1d4",
   "healMod": true
  },
  {
   "name": "Hellish Rebuke",
   "level": 1,
   "kind": "save",
   "save": "DEX",
   "dice": "2d10",
   "type": "fire",
   "up": "1d10",
   "half": true
  },
  {
   "name": "Heroism",
   "level": 1,
   "kind": "none"
  },
  {
   "name": "Hex",
   "level": 1,
   "kind": "rider",
   "dice": "1d6",
   "type": "necrotic"
  },
  {
   "name": "Hideous Laughter",
   "level": 1,
   "kind": "none"
  },
  {
   "name": "Hunter's Mark",
   "level": 1,
   "kind": "rider",
   "dice": "1d6",
   "type": "the weapon's type"
  },
  {
   "name": "Identify",
   "level": 1,
   "kind": "none"
  },
  {
   "name": "Illusory Script",
   "level": 1,
   "kind": "none"
  },
  {
   "name": "Inflict Wounds",
   "level": 1,
   "kind": "attack",
   "dice": "3d10",
   "type": "necrotic",
   "up": "1d10"
  },
  {
   "name": "Jump",
   "level": 1,
   "kind": "none"
  },
  {
   "name": "Jump Shell",
   "level": 1,
   "kind": "none"
  },
  {
   "name": "Longstrider",
   "level": 1,
   "kind": "none"
  },
  {
   "name": "Mage Armor",
   "level": 1,
   "kind": "none"
  },
  {
   "name": "Mage Armor Shell",
   "level": 1,
   "kind": "none"
  },
  {
   "name": "Magic Missile",
   "level": 1,
   "kind": "auto",
   "dice": "1d4",
   "type": "force",
   "rays": 3,
   "rayUp": 1,
   "flat": 1
  },
  {
   "name": "Protection from Evil and Good",
   "level": 1,
   "kind": "none"
  },
  {
   "name": "Purify Food and Drink",
   "level": 1,
   "kind": "none"
  },
  {
   "name": "Ray of Sickness",
   "level": 1,
   "kind": "attack",
   "dice": "2d8",
   "type": "poison",
   "up": "1d8"
  },
  {
   "name": "Sanctuary",
   "level": 1,
   "kind": "none"
  },
  {
   "name": "Searing Smite",
   "level": 1,
   "kind": "weapon",
   "dice": "1d6",
   "type": "fire",
   "up": "1d6",
   "weapon": true
  },
  {
   "name": "Shield",
   "level": 1,
   "kind": "none"
  },
  {
   "name": "Shield Shell",
   "level": 1,
   "kind": "none"
  },
  {
   "name": "Shield of Faith",
   "level": 1,
   "kind": "none"
  },
  {
   "name": "Silent Image",
   "level": 1,
   "kind": "none"
  },
  {
   "name": "Silent Image Shell",
   "level": 1,
   "kind": "none"
  },
  {
   "name": "Sleep",
   "level": 1,
   "kind": "none"
  },
  {
   "name": "Sleep Shell",
   "level": 1,
   "kind": "none"
  },
  {
   "name": "Speak with Animals",
   "level": 1,
   "kind": "none"
  },
  {
   "name": "Thunderous Smite",
   "level": 1,
   "kind": "weapon",
   "dice": "2d6",
   "type": "thunder",
   "up": "1d6",
   "weapon": true
  },
  {
   "name": "Thunderwave",
   "level": 1,
   "kind": "save",
   "save": "CON",
   "dice": "2d8",
   "type": "thunder",
   "up": "1d8",
   "half": true
  },
  {
   "name": "Unseen Servant",
   "level": 1,
   "kind": "none"
  },
  {
   "name": "Witch Bolt",
   "level": 1,
   "kind": "attack",
   "dice": "1d12",
   "type": "lightning",
   "up": "1d12"
  },
  {
   "name": "Wrathful Smite",
   "level": 1,
   "kind": "weapon",
   "dice": "1d6",
   "type": "psychic",
   "weapon": true
  },
  {
   "name": "Acid Arrow",
   "level": 2,
   "kind": "attack",
   "dice": "4d4",
   "type": "acid",
   "up": "1d4",
   "note": "2d4 acid at the end of the target's next turn"
  },
  {
   "name": "Aid",
   "level": 2,
   "kind": "none"
  },
  {
   "name": "Alter Self",
   "level": 2,
   "kind": "none"
  },
  {
   "name": "Alter Self Shell",
   "level": 2,
   "kind": "none"
  },
  {
   "name": "Animal Messenger",
   "level": 2,
   "kind": "none"
  },
  {
   "name": "Arcane Lock",
   "level": 2,
   "kind": "none"
  },
  {
   "name": "Arcanist's Magic Aura",
   "level": 2,
   "kind": "none"
  },
  {
   "name": "Augury",
   "level": 2,
   "kind": "none"
  },
  {
   "name": "Barkskin",
   "level": 2,
   "kind": "none"
  },
  {
   "name": "Beast Sense",
   "level": 2,
   "kind": "none"
  },
  {
   "name": "Blindness/Deafness",
   "level": 2,
   "kind": "none"
  },
  {
   "name": "Blindness/Deafness Shell",
   "level": 2,
   "kind": "none"
  },
  {
   "name": "Blur",
   "level": 2,
   "kind": "none"
  },
  {
   "name": "Blur Shell",
   "level": 2,
   "kind": "none"
  },
  {
   "name": "Branding Smite",
   "level": 2,
   "kind": "weapon",
   "dice": "2d6",
   "type": "radiant",
   "up": "1d6",
   "weapon": true
  },
  {
   "name": "Calm Emotions",
   "level": 2,
   "kind": "none"
  },
  {
   "name": "Cloud of Daggers",
   "level": 2,
   "kind": "auto",
   "dice": "4d4",
   "type": "slashing",
   "up": "2d4"
  },
  {
   "name": "Continual Flame",
   "level": 2,
   "kind": "none"
  },
  {
   "name": "Cordon of Arrows",
   "level": 2,
   "kind": "none"
  },
  {
   "name": "Crown of Madness",
   "level": 2,
   "kind": "none"
  },
  {
   "name": "Crown of Madness Shell",
   "level": 2,
   "kind": "none"
  },
  {
   "name": "Darkness Shell",
   "level": 2,
   "kind": "none"
  },
  {
   "name": "Darkvision",
   "level": 2,
   "kind": "none"
  },
  {
   "name": "Darkvision Shell",
   "level": 2,
   "kind": "none"
  },
  {
   "name": "Detect Thoughts",
   "level": 2,
   "kind": "none"
  },
  {
   "name": "Detect Thoughts Shell",
   "level": 2,
   "kind": "none"
  },
  {
   "name": "Enhance Ability",
   "level": 2,
   "kind": "none"
  },
  {
   "name": "Enhance Ability Shell",
   "level": 2,
   "kind": "none"
  },
  {
   "name": "Enlarge/Reduce",
   "level": 2,
   "kind": "none"
  },
  {
   "name": "Enlarge/Reduce Shell",
   "level": 2,
   "kind": "none"
  },
  {
   "name": "Enthrall",
   "level": 2,
   "kind": "none"
  },
  {
   "name": "Find Steed",
   "level": 2,
   "kind": "none"
  },
  {
   "name": "Find Traps",
   "level": 2,
   "kind": "none"
  },
  {
   "name": "Flame Blade",
   "level": 2,
   "kind": "attack",
   "dice": "3d6",
   "type": "fire",
   "up": "1d6",
   "upEvery": 2
  },
  {
   "name": "Flaming Sphere",
   "level": 2,
   "kind": "save",
   "save": "DEX",
   "dice": "2d6",
   "type": "fire",
   "up": "1d6"
  },
  {
   "name": "Gentle Repose",
   "level": 2,
   "kind": "none"
  },
  {
   "name": "Gust of Wind",
   "level": 2,
   "kind": "none"
  },
  {
   "name": "Gust of Wind Shell",
   "level": 2,
   "kind": "none"
  },
  {
   "name": "Heat Metal",
   "level": 2,
   "kind": "save",
   "save": "CON",
   "dice": "2d8",
   "type": "fire",
   "up": "1d8"
  },
  {
   "name": "Hold Person",
   "level": 2,
   "kind": "none"
  },
  {
   "name": "Hold Person Shell",
   "level": 2,
   "kind": "none"
  },
  {
   "name": "Invisibility",
   "level": 2,
   "kind": "none"
  },
  {
   "name": "Invisibility Shell",
   "level": 2,
   "kind": "none"
  },
  {
   "name": "Knock",
   "level": 2,
   "kind": "none"
  },
  {
   "name": "Knock Shell",
   "level": 2,
   "kind": "none"
  },
  {
   "name": "Lesser Restoration",
   "level": 2,
   "kind": "none"
  },
  {
   "name": "Levitate",
   "level": 2,
   "kind": "none"
  },
  {
   "name": "Levitate Shell",
   "level": 2,
   "kind": "none"
  },
  {
   "name": "Locate Animals or Plants",
   "level": 2,
   "kind": "none"
  },
  {
   "name": "Locate Object",
   "level": 2,
   "kind": "none"
  },
  {
   "name": "Magic Mouth",
   "level": 2,
   "kind": "none"
  },
  {
   "name": "Mirror Image",
   "level": 2,
   "kind": "none"
  },
  {
   "name": "Mirror Image Shell",
   "level": 2,
   "kind": "none"
  },
  {
   "name": "Misty Step",
   "level": 2,
   "kind": "none"
  },
  {
   "name": "Misty Step Shell",
   "level": 2,
   "kind": "none"
  },
  {
   "name": "Moonbeam",
   "level": 2,
   "kind": "save",
   "save": "CON",
   "dice": "2d10",
   "type": "radiant",
   "up": "1d10"
  },
  {
   "name": "Pass without Trace",
   "level": 2,
   "kind": "none"
  },
  {
   "name": "Phantasmal Force",
   "level": 2,
   "kind": "none"
  },
  {
   "name": "Phantasmal Force Shell",
   "level": 2,
   "kind": "none"
  },
  {
   "name": "Prayer of Healing",
   "level": 2,
   "kind": "none"
  },
  {
   "name": "Protection from Poison",
   "level": 2,
   "kind": "none"
  },
  {
   "name": "Ray of Enfeeblement",
   "level": 2,
   "kind": "attack"
  },
  {
   "name": "Rope Trick",
   "level": 2,
   "kind": "none"
  },
  {
   "name": "Scorching Ray",
   "level": 2,
   "kind": "attack",
   "dice": "2d6",
   "type": "fire",
   "rays": 3,
   "rayUp": 1
  },
  {
   "name": "See Invisibility",
   "level": 2,
   "kind": "none"
  },
  {
   "name": "See Invisibility Shell",
   "level": 2,
   "kind": "none"
  },
  {
   "name": "Shatter",
   "level": 2,
   "kind": "save",
   "save": "CON",
   "dice": "3d8",
   "type": "thunder",
   "up": "1d8",
   "half": true
  },
  {
   "name": "Silence",
   "level": 2,
   "kind": "none"
  },
  {
   "name": "Spider Climb",
   "level": 2,
   "kind": "none"
  },
  {
   "name": "Spider Climb Shell",
   "level": 2,
   "kind": "none"
  },
  {
   "name": "Spike Growth",
   "level": 2,
   "kind": "none"
  },
  {
   "name": "Spiritual Weapon",
   "level": 2,
   "kind": "attack",
   "dice": "1d8",
   "type": "force",
   "up": "1d8",
   "upEvery": 2,
   "healMod": true
  },
  {
   "name": "Suggestion",
   "level": 2,
   "kind": "save",
   "save": "WIS"
  },
  {
   "name": "Suggestion Shell",
   "level": 2,
   "kind": "none"
  },
  {
   "name": "Warding Bond",
   "level": 2,
   "kind": "none"
  },
  {
   "name": "Web",
   "level": 2,
   "kind": "none"
  },
  {
   "name": "Web Shell",
   "level": 2,
   "kind": "none"
  },
  {
   "name": "Zone of Truth",
   "level": 2,
   "kind": "none"
  },
  {
   "name": "Beacon of Hope",
   "level": 3,
   "kind": "none"
  },
  {
   "name": "Bestow Curse",
   "level": 3,
   "kind": "none"
  },
  {
   "name": "Blinding Smite",
   "level": 3,
   "kind": "weapon",
   "dice": "3d8",
   "type": "radiant",
   "weapon": true
  },
  {
   "name": "Blink",
   "level": 3,
   "kind": "none"
  },
  {
   "name": "Blink Shell",
   "level": 3,
   "kind": "none"
  },
  {
   "name": "Call Lightning",
   "level": 3,
   "kind": "save",
   "save": "DEX",
   "dice": "3d10",
   "type": "lightning",
   "up": "1d10"
  },
  {
   "name": "Clairvoyance",
   "level": 3,
   "kind": "none"
  },
  {
   "name": "Clairvoyance Shell",
   "level": 3,
   "kind": "none"
  },
  {
   "name": "Conjure Animals",
   "level": 3,
   "kind": "none"
  },
  {
   "name": "Conjure Barrage",
   "level": 3,
   "kind": "save",
   "save": "DEX",
   "dice": "3d8",
   "type": "the ammunition's type"
  },
  {
   "name": "Counterspell",
   "level": 3,
   "kind": "none"
  },
  {
   "name": "Counterspell Shell",
   "level": 3,
   "kind": "none"
  },
  {
   "name": "Daylight",
   "level": 3,
   "kind": "none"
  },
  {
   "name": "Daylight Shell",
   "level": 3,
   "kind": "none"
  },
  {
   "name": "Dispel Magic",
   "level": 3,
   "kind": "none"
  },
  {
   "name": "Dispel Magic Shell",
   "level": 3,
   "kind": "none"
  },
  {
   "name": "Fear",
   "level": 3,
   "kind": "none"
  },
  {
   "name": "Fear Shell",
   "level": 3,
   "kind": "none"
  },
  {
   "name": "Feign Death",
   "level": 3,
   "kind": "none"
  },
  {
   "name": "Fireball",
   "level": 3,
   "kind": "save",
   "save": "DEX",
   "dice": "8d6",
   "type": "fire",
   "up": "1d6",
   "half": true
  },
  {
   "name": "Fly",
   "level": 3,
   "kind": "none"
  },
  {
   "name": "Fly Shell",
   "level": 3,
   "kind": "none"
  },
  {
   "name": "Gaseous Form",
   "level": 3,
   "kind": "none"
  },
  {
   "name": "Gaseous Form Shell",
   "level": 3,
   "kind": "none"
  },
  {
   "name": "Glyph of Warding",
   "level": 3,
   "kind": "none"
  },
  {
   "name": "Haste",
   "level": 3,
   "kind": "none"
  },
  {
   "name": "Haste Shell",
   "level": 3,
   "kind": "none"
  },
  {
   "name": "Hunger of Hadar",
   "level": 3,
   "kind": "auto",
   "dice": "2d6",
   "type": "cold",
   "note": "plus 2d6 acid, DEX save for none of the acid"
  },
  {
   "name": "Hypnotic Pattern",
   "level": 3,
   "kind": "none"
  },
  {
   "name": "Hypnotic Pattern Shell",
   "level": 3,
   "kind": "none"
  },
  {
   "name": "Lightning Arrow",
   "level": 3,
   "kind": "weapon",
   "dice": "4d8",
   "type": "lightning",
   "up": "1d8",
   "note": "the weapon's normal damage is replaced by this lightning"
  },
  {
   "name": "Lightning Bolt",
   "level": 3,
   "kind": "save",
   "save": "DEX",
   "dice": "8d6",
   "type": "lightning",
   "up": "1d6",
   "half": true
  },
  {
   "name": "Magic Circle",
   "level": 3,
   "kind": "none"
  },
  {
   "name": "Major Image",
   "level": 3,
   "kind": "none"
  },
  {
   "name": "Major Image Shell",
   "level": 3,
   "kind": "none"
  },
  {
   "name": "Mass Healing Word",
   "level": 3,
   "kind": "heal",
   "dice": "1d4",
   "up": "1d4",
   "healMod": true
  },
  {
   "name": "Meld into Stone",
   "level": 3,
   "kind": "none"
  },
  {
   "name": "Nondetection",
   "level": 3,
   "kind": "none"
  },
  {
   "name": "Phantom Steed",
   "level": 3,
   "kind": "none"
  },
  {
   "name": "Plant Growth",
   "level": 3,
   "kind": "none"
  },
  {
   "name": "Protection from Energy",
   "level": 3,
   "kind": "none"
  },
  {
   "name": "Protection from Energy Shell",
   "level": 3,
   "kind": "none"
  },
  {
   "name": "Remove Curse",
   "level": 3,
   "kind": "none"
  },
  {
   "name": "Revivify",
   "level": 3,
   "kind": "none"
  },
  {
   "name": "Sending",
   "level": 3,
   "kind": "none"
  },
  {
   "name": "Sleet Storm",
   "level": 3,
   "kind": "none"
  },
  {
   "name": "Sleet Storm Shell",
   "level": 3,
   "kind": "none"
  },
  {
   "name": "Slow",
   "level": 3,
   "kind": "none"
  },
  {
   "name": "Slow Shell",
   "level": 3,
   "kind": "none"
  },
  {
   "name": "Speak with Dead",
   "level": 3,
   "kind": "none"
  },
  {
   "name": "Speak with Plants",
   "level": 3,
   "kind": "none"
  },
  {
   "name": "Spirit Guardians",
   "level": 3,
   "kind": "save",
   "save": "WIS",
   "dice": "3d8",
   "type": "radiant",
   "up": "1d8",
   "half": true
  },
  {
   "name": "Stinking Cloud",
   "level": 3,
   "kind": "none"
  },
  {
   "name": "Stinking Cloud Shell",
   "level": 3,
   "kind": "none"
  },
  {
   "name": "Tiny Hut",
   "level": 3,
   "kind": "none"
  },
  {
   "name": "Tongues",
   "level": 3,
   "kind": "none"
  },
  {
   "name": "Tongues Shell",
   "level": 3,
   "kind": "none"
  },
  {
   "name": "Vampiric Touch",
   "level": 3,
   "kind": "attack",
   "dice": "3d6",
   "type": "necrotic",
   "up": "1d6"
  },
  {
   "name": "Water Breathing",
   "level": 3,
   "kind": "none"
  },
  {
   "name": "Water Breathing Shell",
   "level": 3,
   "kind": "none"
  },
  {
   "name": "Water Walk",
   "level": 3,
   "kind": "none"
  },
  {
   "name": "Water Walk Shell",
   "level": 3,
   "kind": "none"
  },
  {
   "name": "Wind Wall",
   "level": 3,
   "kind": "none"
  },
  {
   "name": "Arcane Eye",
   "level": 4,
   "kind": "none"
  },
  {
   "name": "Aura of Life",
   "level": 4,
   "kind": "none"
  },
  {
   "name": "Aura of Purity",
   "level": 4,
   "kind": "none"
  },
  {
   "name": "Banishment",
   "level": 4,
   "kind": "none"
  },
  {
   "name": "Banishment Shell",
   "level": 4,
   "kind": "none"
  },
  {
   "name": "Black Tentacles",
   "level": 4,
   "kind": "none"
  },
  {
   "name": "Blight",
   "level": 4,
   "kind": "save",
   "save": "CON",
   "dice": "8d8",
   "type": "necrotic",
   "up": "1d8"
  },
  {
   "name": "Compulsion",
   "level": 4,
   "kind": "none"
  },
  {
   "name": "Confusion",
   "level": 4,
   "kind": "none"
  },
  {
   "name": "Confusion Shell",
   "level": 4,
   "kind": "none"
  },
  {
   "name": "Conjure Minor Elementals",
   "level": 4,
   "kind": "none"
  },
  {
   "name": "Conjure Woodland Beings",
   "level": 4,
   "kind": "none"
  },
  {
   "name": "Control Water",
   "level": 4,
   "kind": "none"
  },
  {
   "name": "Death Ward",
   "level": 4,
   "kind": "none"
  },
  {
   "name": "Dimension Door",
   "level": 4,
   "kind": "none"
  },
  {
   "name": "Dimension Door Shell",
   "level": 4,
   "kind": "none"
  },
  {
   "name": "Divination",
   "level": 4,
   "kind": "none"
  },
  {
   "name": "Dominate Beast",
   "level": 4,
   "kind": "none"
  },
  {
   "name": "Dominate Beast Shell",
   "level": 4,
   "kind": "none"
  },
  {
   "name": "Fabricate",
   "level": 4,
   "kind": "none"
  },
  {
   "name": "Faithful Hound",
   "level": 4,
   "kind": "none"
  },
  {
   "name": "Fire Shield",
   "level": 4,
   "kind": "rider",
   "dice": "2d8",
   "type": "fire or cold"
  },
  {
   "name": "Freedom of Movement",
   "level": 4,
   "kind": "none"
  },
  {
   "name": "Giant Insect",
   "level": 4,
   "kind": "none"
  },
  {
   "name": "Grasping Vine",
   "level": 4,
   "kind": "none"
  },
  {
   "name": "Greater Invisibility",
   "level": 4,
   "kind": "none"
  },
  {
   "name": "Greater Invisibility Shell",
   "level": 4,
   "kind": "none"
  },
  {
   "name": "Guardian of Faith",
   "level": 4,
   "kind": "auto",
   "dice": "20",
   "type": "radiant",
   "note": "when a creature the faith can see ends its turn in range, until 20 damage has been dealt"
  },
  {
   "name": "Hallucinatory Terrain",
   "level": 4,
   "kind": "none"
  },
  {
   "name": "Ice Storm",
   "level": 4,
   "kind": "save",
   "save": "DEX",
   "dice": "2d8+4d6",
   "type": "bludgeoning and cold",
   "up": "1d8",
   "half": true
  },
  {
   "name": "Locate Creature",
   "level": 4,
   "kind": "none"
  },
  {
   "name": "Phantasmal Killer",
   "level": 4,
   "kind": "save",
   "save": "WIS",
   "dice": "4d10",
   "type": "psychic",
   "up": "1d10"
  },
  {
   "name": "Polymorph",
   "level": 4,
   "kind": "none"
  },
  {
   "name": "Polymorph Shell",
   "level": 4,
   "kind": "none"
  },
  {
   "name": "Private Sanctum",
   "level": 4,
   "kind": "none"
  },
  {
   "name": "Resilient Sphere",
   "level": 4,
   "kind": "none"
  },
  {
   "name": "Secret Chest",
   "level": 4,
   "kind": "none"
  },
  {
   "name": "Staggering Smite",
   "level": 4,
   "kind": "weapon",
   "dice": "4d6",
   "type": "psychic",
   "weapon": true
  },
  {
   "name": "Stone Shape",
   "level": 4,
   "kind": "none"
  },
  {
   "name": "Stoneskin Shell",
   "level": 4,
   "kind": "none"
  },
  {
   "name": "Wall of Fire",
   "level": 4,
   "kind": "save",
   "save": "DEX",
   "dice": "5d8",
   "type": "fire",
   "up": "1d8",
   "half": true
  },
  {
   "name": "Animate Objects",
   "level": 5,
   "kind": "none"
  },
  {
   "name": "Animate Objects Shell",
   "level": 5,
   "kind": "none"
  },
  {
   "name": "Antilife Shell",
   "level": 5,
   "kind": "none"
  },
  {
   "name": "Arcane Hand",
   "level": 5,
   "kind": "none"
  },
  {
   "name": "Awaken",
   "level": 5,
   "kind": "none"
  },
  {
   "name": "Banishing Smite",
   "level": 5,
   "kind": "weapon",
   "dice": "5d10",
   "type": "force",
   "weapon": true
  },
  {
   "name": "Circle of Power",
   "level": 5,
   "kind": "none"
  },
  {
   "name": "Cloudkill",
   "level": 5,
   "kind": "save",
   "save": "CON",
   "dice": "5d8",
   "type": "poison",
   "up": "1d8",
   "half": true
  },
  {
   "name": "Commune",
   "level": 5,
   "kind": "none"
  },
  {
   "name": "Commune with Nature",
   "level": 5,
   "kind": "none"
  },
  {
   "name": "Cone of Cold",
   "level": 5,
   "kind": "save",
   "save": "CON",
   "dice": "8d8",
   "type": "cold",
   "up": "1d8",
   "half": true
  },
  {
   "name": "Conjure Elemental",
   "level": 5,
   "kind": "none"
  },
  {
   "name": "Conjure Volley",
   "level": 5,
   "kind": "save",
   "save": "DEX",
   "dice": "8d8",
   "type": "the ammunition's type"
  },
  {
   "name": "Contact Other Plane",
   "level": 5,
   "kind": "none"
  },
  {
   "name": "Contagion",
   "level": 5,
   "kind": "attack"
  },
  {
   "name": "Creation",
   "level": 5,
   "kind": "none"
  },
  {
   "name": "Creation Shell",
   "level": 5,
   "kind": "none"
  },
  {
   "name": "Destructive Wave",
   "level": 5,
   "kind": "save",
   "save": "CON",
   "dice": "5d6+5d6",
   "type": "thunder and radiant or necrotic"
  },
  {
   "name": "Dispel Evil and Good",
   "level": 5,
   "kind": "none"
  },
  {
   "name": "Dominate Person",
   "level": 5,
   "kind": "none"
  },
  {
   "name": "Dominate Person Shell",
   "level": 5,
   "kind": "none"
  },
  {
   "name": "Dream",
   "level": 5,
   "kind": "none"
  },
  {
   "name": "Flame Strike",
   "level": 5,
   "kind": "save",
   "save": "DEX",
   "dice": "4d6+4d6",
   "type": "fire and radiant",
   "up": "1d6",
   "half": true
  },
  {
   "name": "Geas",
   "level": 5,
   "kind": "none"
  },
  {
   "name": "Greater Restoration",
   "level": 5,
   "kind": "none"
  },
  {
   "name": "Hallow",
   "level": 5,
   "kind": "none"
  },
  {
   "name": "Hold Monster",
   "level": 5,
   "kind": "none"
  },
  {
   "name": "Hold Monster Shell",
   "level": 5,
   "kind": "none"
  },
  {
   "name": "Insect Plague",
   "level": 5,
   "kind": "save",
   "save": "CON",
   "dice": "4d10",
   "type": "piercing",
   "up": "1d10",
   "half": true
  },
  {
   "name": "Legend Lore",
   "level": 5,
   "kind": "none"
  },
  {
   "name": "Mass Cure Wounds",
   "level": 5,
   "kind": "heal",
   "dice": "3d8",
   "up": "1d8",
   "healMod": true
  },
  {
   "name": "Mislead",
   "level": 5,
   "kind": "none"
  },
  {
   "name": "Modify Memory",
   "level": 5,
   "kind": "none"
  },
  {
   "name": "Passwall",
   "level": 5,
   "kind": "none"
  },
  {
   "name": "Planar Binding",
   "level": 5,
   "kind": "none"
  },
  {
   "name": "Reincarnate",
   "level": 5,
   "kind": "none"
  },
  {
   "name": "Scrying",
   "level": 5,
   "kind": "none"
  },
  {
   "name": "Seeming",
   "level": 5,
   "kind": "none"
  },
  {
   "name": "Seeming Shell",
   "level": 5,
   "kind": "none"
  },
  {
   "name": "Swift Quiver",
   "level": 5,
   "kind": "none"
  },
  {
   "name": "Telekinesis",
   "level": 5,
   "kind": "none"
  },
  {
   "name": "Telekinesis Shell",
   "level": 5,
   "kind": "none"
  },
  {
   "name": "Telepathic Bond",
   "level": 5,
   "kind": "none"
  },
  {
   "name": "Teleportation Circle",
   "level": 5,
   "kind": "none"
  },
  {
   "name": "Teleportation Circle Shell",
   "level": 5,
   "kind": "none"
  },
  {
   "name": "Tree Stride",
   "level": 5,
   "kind": "none"
  },
  {
   "name": "Wall of Force",
   "level": 5,
   "kind": "none"
  },
  {
   "name": "Wall of Stone",
   "level": 5,
   "kind": "none"
  },
  {
   "name": "Wall of Stone Shell",
   "level": 5,
   "kind": "none"
  },
  {
   "name": "Arcane Gate",
   "level": 6,
   "kind": "none"
  },
  {
   "name": "Arcane Gate Shell",
   "level": 6,
   "kind": "none"
  },
  {
   "name": "Blade Barrier",
   "level": 6,
   "kind": "save",
   "save": "DEX",
   "dice": "6d10",
   "type": "slashing",
   "half": true
  },
  {
   "name": "Chain Lightning",
   "level": 6,
   "kind": "save",
   "save": "DEX",
   "dice": "10d8",
   "type": "lightning",
   "up": "1d8",
   "half": true
  },
  {
   "name": "Circle of Death",
   "level": 6,
   "kind": "save",
   "save": "CON",
   "dice": "8d6",
   "type": "necrotic",
   "up": "2d6",
   "half": true
  },
  {
   "name": "Conjure Fey",
   "level": 6,
   "kind": "none"
  },
  {
   "name": "Contingency",
   "level": 6,
   "kind": "none"
  },
  {
   "name": "Disintegrate",
   "level": 6,
   "kind": "save",
   "save": "DEX",
   "dice": "10d6+40",
   "type": "force",
   "up": "3d6",
   "note": "no damage on a successful save"
  },
  {
   "name": "Eyebite",
   "level": 6,
   "kind": "none"
  },
  {
   "name": "Eyebite Shell",
   "level": 6,
   "kind": "none"
  },
  {
   "name": "Find the Path",
   "level": 6,
   "kind": "none"
  },
  {
   "name": "Flesh to Stone",
   "level": 6,
   "kind": "none"
  },
  {
   "name": "Forbiddance",
   "level": 6,
   "kind": "none"
  },
  {
   "name": "Freezing Sphere",
   "level": 6,
   "kind": "save",
   "save": "CON",
   "dice": "10d6",
   "type": "cold",
   "up": "1d6",
   "half": true
  },
  {
   "name": "Globe of Invulnerability",
   "level": 6,
   "kind": "none"
  },
  {
   "name": "Globe of Invulnerability Shell",
   "level": 6,
   "kind": "none"
  },
  {
   "name": "Guards and Wards",
   "level": 6,
   "kind": "none"
  },
  {
   "name": "Harm",
   "level": 6,
   "kind": "save",
   "save": "CON",
   "dice": "14d6",
   "type": "necrotic",
   "half": true
  },
  {
   "name": "Heal",
   "level": 6,
   "kind": "heal",
   "dice": "70",
   "up": "10"
  },
  {
   "name": "Heroes' Feast",
   "level": 6,
   "kind": "none"
  },
  {
   "name": "Instant Summons",
   "level": 6,
   "kind": "none"
  },
  {
   "name": "Irresistible Dance",
   "level": 6,
   "kind": "none"
  },
  {
   "name": "Magic Jar",
   "level": 6,
   "kind": "none"
  },
  {
   "name": "Mass Suggestion",
   "level": 6,
   "kind": "none"
  },
  {
   "name": "Mass Suggestion Shell",
   "level": 6,
   "kind": "none"
  },
  {
   "name": "Move Earth",
   "level": 6,
   "kind": "none"
  },
  {
   "name": "Move Earth Shell",
   "level": 6,
   "kind": "none"
  },
  {
   "name": "Planar Ally",
   "level": 6,
   "kind": "none"
  },
  {
   "name": "Programmed Illusion",
   "level": 6,
   "kind": "none"
  },
  {
   "name": "Sunbeam",
   "level": 6,
   "kind": "save",
   "save": "CON",
   "dice": "6d8",
   "type": "radiant",
   "half": true
  },
  {
   "name": "Transport via Plants",
   "level": 6,
   "kind": "none"
  },
  {
   "name": "True Seeing",
   "level": 6,
   "kind": "none"
  },
  {
   "name": "True Seeing Shell",
   "level": 6,
   "kind": "none"
  },
  {
   "name": "Wall of Ice",
   "level": 6,
   "kind": "save",
   "save": "DEX",
   "dice": "10d6",
   "type": "cold",
   "up": "2d6",
   "half": true
  },
  {
   "name": "Wall of Thorns",
   "level": 6,
   "kind": "save",
   "save": "DEX",
   "dice": "7d8",
   "type": "slashing",
   "up": "1d8",
   "half": true
  },
  {
   "name": "Wind Walk",
   "level": 6,
   "kind": "none"
  },
  {
   "name": "Word of Recall",
   "level": 6,
   "kind": "none"
  },
  {
   "name": "Arcane Sword",
   "level": 7,
   "kind": "none"
  },
  {
   "name": "Conjure Celestial",
   "level": 7,
   "kind": "none"
  },
  {
   "name": "Delayed Blast Fireball",
   "level": 7,
   "kind": "save",
   "save": "DEX",
   "dice": "12d6",
   "type": "fire",
   "up": "1d6",
   "half": true,
   "note": "grows by 1d6 at the end of each of your turns before it goes off"
  },
  {
   "name": "Divine Word",
   "level": 7,
   "kind": "none"
  },
  {
   "name": "Etherealness",
   "level": 7,
   "kind": "none"
  },
  {
   "name": "Etherealness Shell",
   "level": 7,
   "kind": "none"
  },
  {
   "name": "Finger of Death",
   "level": 7,
   "kind": "save",
   "save": "CON",
   "dice": "7d8+30",
   "type": "necrotic",
   "half": true
  },
  {
   "name": "Fire Storm",
   "level": 7,
   "kind": "save",
   "save": "DEX",
   "dice": "7d10",
   "type": "fire",
   "half": true
  },
  {
   "name": "Forcecage",
   "level": 7,
   "kind": "none"
  },
  {
   "name": "Magnificent Mansion",
   "level": 7,
   "kind": "none"
  },
  {
   "name": "Mirage Arcane",
   "level": 7,
   "kind": "none"
  },
  {
   "name": "Plane Shift",
   "level": 7,
   "kind": "none"
  },
  {
   "name": "Plane Shift Shell",
   "level": 7,
   "kind": "none"
  },
  {
   "name": "Prismatic Spray",
   "level": 7,
   "kind": "save",
   "save": "DEX",
   "dice": "10d6",
   "type": "the ray's type"
  },
  {
   "name": "Project Image",
   "level": 7,
   "kind": "none"
  },
  {
   "name": "Regenerate",
   "level": 7,
   "kind": "none"
  },
  {
   "name": "Reverse Gravity",
   "level": 7,
   "kind": "none"
  },
  {
   "name": "Reverse Gravity Shell",
   "level": 7,
   "kind": "none"
  },
  {
   "name": "Sequester",
   "level": 7,
   "kind": "none"
  },
  {
   "name": "Simulacrum",
   "level": 7,
   "kind": "none"
  },
  {
   "name": "Symbol",
   "level": 7,
   "kind": "none"
  },
  {
   "name": "Teleport",
   "level": 7,
   "kind": "none"
  },
  {
   "name": "Teleport Shell",
   "level": 7,
   "kind": "none"
  },
  {
   "name": "Animal Shapes",
   "level": 8,
   "kind": "none"
  },
  {
   "name": "Antimagic Field",
   "level": 8,
   "kind": "none"
  },
  {
   "name": "Antipathy/Sympathy",
   "level": 8,
   "kind": "none"
  },
  {
   "name": "Clone",
   "level": 8,
   "kind": "none"
  },
  {
   "name": "Control Weather",
   "level": 8,
   "kind": "none"
  },
  {
   "name": "Demiplane",
   "level": 8,
   "kind": "none"
  },
  {
   "name": "Dominate Monster",
   "level": 8,
   "kind": "none"
  },
  {
   "name": "Dominate Monster Shell",
   "level": 8,
   "kind": "none"
  },
  {
   "name": "Earthquake",
   "level": 8,
   "kind": "none"
  },
  {
   "name": "Earthquake Shell",
   "level": 8,
   "kind": "none"
  },
  {
   "name": "Feeblemind",
   "level": 8,
   "kind": "none"
  },
  {
   "name": "Glibness",
   "level": 8,
   "kind": "none"
  },
  {
   "name": "Holy Aura",
   "level": 8,
   "kind": "none"
  },
  {
   "name": "Incendiary Cloud",
   "level": 8,
   "kind": "save",
   "save": "DEX",
   "dice": "10d8",
   "type": "fire",
   "half": true
  },
  {
   "name": "Maze",
   "level": 8,
   "kind": "none"
  },
  {
   "name": "Mind Blank",
   "level": 8,
   "kind": "none"
  },
  {
   "name": "Power Word Stun",
   "level": 8,
   "kind": "none"
  },
  {
   "name": "Power Word Stun Shell",
   "level": 8,
   "kind": "none"
  },
  {
   "name": "Sunburst",
   "level": 8,
   "kind": "save",
   "save": "CON",
   "dice": "12d6",
   "type": "radiant",
   "half": true
  },
  {
   "name": "Telepathy",
   "level": 8,
   "kind": "none"
  },
  {
   "name": "Tsunami",
   "level": 8,
   "kind": "none"
  },
  {
   "name": "Astral Projection",
   "level": 9,
   "kind": "none"
  },
  {
   "name": "Foresight",
   "level": 9,
   "kind": "none"
  },
  {
   "name": "Gate",
   "level": 9,
   "kind": "none"
  },
  {
   "name": "Gate Shell",
   "level": 9,
   "kind": "none"
  },
  {
   "name": "Imprisonment",
   "level": 9,
   "kind": "none"
  },
  {
   "name": "Mass Heal",
   "level": 9,
   "kind": "none"
  },
  {
   "name": "Meteor Swarm",
   "level": 9,
   "kind": "save",
   "save": "DEX",
   "dice": "20d6+20d6",
   "type": "fire and bludgeoning",
   "half": true
  },
  {
   "name": "Power Word Kill",
   "level": 9,
   "kind": "none"
  },
  {
   "name": "Power Word Kill Shell",
   "level": 9,
   "kind": "none"
  },
  {
   "name": "Prismatic Wall",
   "level": 9,
   "kind": "none"
  },
  {
   "name": "Shapechange",
   "level": 9,
   "kind": "none"
  },
  {
   "name": "Storm of Vengeance",
   "level": 9,
   "kind": "none"
  },
  {
   "name": "Time Stop",
   "level": 9,
   "kind": "none"
  },
  {
   "name": "Time Stop Shell",
   "level": 9,
   "kind": "none"
  },
  {
   "name": "True Polymorph",
   "level": 9,
   "kind": "none"
  },
  {
   "name": "True Resurrection",
   "level": 9,
   "kind": "none"
  },
  {
   "name": "Weird",
   "level": 9,
   "kind": "none"
  },
  {
   "name": "Wish",
   "level": 9,
   "kind": "none"
  },
  {
   "name": "Wish Shell",
   "level": 9,
   "kind": "none"
  },
  {
   "name": "Animate Dead",
   "level": null,
   "kind": "none"
  },
  {
   "name": "Create Undead",
   "level": null,
   "kind": "none"
  },
  {
   "name": "Crusader's Mantle",
   "level": null,
   "kind": "none"
  },
  {
   "name": "Darkness",
   "level": null,
   "kind": "none"
  },
  {
   "name": "Divine Favor",
   "level": null,
   "kind": "none"
  },
  {
   "name": "Magic Weapon",
   "level": null,
   "kind": "none"
  },
  {
   "name": "Stoneskin",
   "level": null,
   "kind": "none"
  }
 ],
 "inspiration": [
  {
   "name": "Advantage",
   "text": "Before you roll an attack, ability check, or saving throw, spend 1 point to roll it with advantage."
  },
  {
   "name": "Re-roll",
   "text": "After you roll, spend 1 point to re-roll and use the new result."
  },
  {
   "name": "Damage Buff",
   "text": "When you hit, spend 1 point to add 1d12 damage."
  },
  {
   "name": "Check Buff",
   "text": "Before a DC check, spend 1 point to add 1d8 to the roll."
  }
 ],
 "slots5e": {
  "full": [
   [
    2
   ],
   [
    3
   ],
   [
    4,
    2
   ],
   [
    4,
    3
   ],
   [
    4,
    3,
    2
   ],
   [
    4,
    3,
    3
   ],
   [
    4,
    3,
    3,
    1
   ],
   [
    4,
    3,
    3,
    2
   ],
   [
    4,
    3,
    3,
    3,
    1
   ],
   [
    4,
    3,
    3,
    3,
    2
   ],
   [
    4,
    3,
    3,
    3,
    2,
    1
   ],
   [
    4,
    3,
    3,
    3,
    2,
    1
   ],
   [
    4,
    3,
    3,
    3,
    2,
    1,
    1
   ],
   [
    4,
    3,
    3,
    3,
    2,
    1,
    1
   ],
   [
    4,
    3,
    3,
    3,
    2,
    1,
    1,
    1
   ],
   [
    4,
    3,
    3,
    3,
    2,
    1,
    1,
    1
   ],
   [
    4,
    3,
    3,
    3,
    2,
    1,
    1,
    1,
    1
   ],
   [
    4,
    3,
    3,
    3,
    3,
    1,
    1,
    1,
    1
   ],
   [
    4,
    3,
    3,
    3,
    3,
    2,
    1,
    1,
    1
   ],
   [
    4,
    3,
    3,
    3,
    3,
    2,
    2,
    1,
    1
   ]
  ],
  "half": [
   [],
   [
    2
   ],
   [
    3
   ],
   [
    3
   ],
   [
    4,
    2
   ],
   [
    4,
    2
   ],
   [
    4,
    3
   ],
   [
    4,
    3
   ],
   [
    4,
    3,
    2
   ],
   [
    4,
    3,
    2
   ],
   [
    4,
    3,
    3
   ],
   [
    4,
    3,
    3
   ],
   [
    4,
    3,
    3,
    1
   ],
   [
    4,
    3,
    3,
    1
   ],
   [
    4,
    3,
    3,
    2
   ],
   [
    4,
    3,
    3,
    2
   ],
   [
    4,
    3,
    3,
    3,
    1
   ],
   [
    4,
    3,
    3,
    3,
    1
   ],
   [
    4,
    3,
    3,
    3,
    2
   ],
   [
    4,
    3,
    3,
    3,
    2
   ]
  ],
  "third": [
   [],
   [],
   [
    2
   ],
   [
    3
   ],
   [
    3
   ],
   [
    3
   ],
   [
    4,
    2
   ],
   [
    4,
    2
   ],
   [
    4,
    2
   ],
   [
    4,
    3
   ],
   [
    4,
    3
   ],
   [
    4,
    3
   ],
   [
    4,
    3,
    2
   ],
   [
    4,
    3,
    2
   ],
   [
    4,
    3,
    2
   ],
   [
    4,
    3,
    3
   ],
   [
    4,
    3,
    3
   ],
   [
    4,
    3,
    3
   ],
   [
    4,
    3,
    3,
    1
   ],
   [
    4,
    3,
    3,
    1
   ]
  ],
  "pact": [
   [
    1,
    1
   ],
   [
    2,
    1
   ],
   [
    2,
    2
   ],
   [
    2,
    2
   ],
   [
    2,
    3
   ],
   [
    2,
    3
   ],
   [
    2,
    4
   ],
   [
    2,
    4
   ],
   [
    2,
    5
   ],
   [
    2,
    5
   ],
   [
    3,
    5
   ],
   [
    3,
    5
   ],
   [
    3,
    5
   ],
   [
    3,
    5
   ],
   [
    3,
    5
   ],
   [
    3,
    5
   ],
   [
    4,
    5
   ],
   [
    4,
    5
   ],
   [
    4,
    5
   ],
   [
    4,
    5
   ]
  ]
 },
 "rulesText": {
  "takeCover": "Half cover is +2 and three-quarters cover is +5 to AC and Dexterity saves. Take Cover stacks on that: anyone, as a bonus action, ducks behind solid cover. Ranged attacks against you have disadvantage until your next attack, and firing ends it. Kneeling or prone alone is not cover.",
  "reloading": "Reloading takes an action and fills the whole gun. Slow-load guns take a full turn. Tactical Reload (TR ✓): bonus action, load one round from a gun belt or bandolier. Quick Reload (Gunslinger) makes the reload a bonus action (not slow guns).",
  "reloadingFull": "A gun fires until its Capacity is spent. Reloading takes an action and fills the whole gun. You can reload a partly empty gun the same way. One gun per reload. Slow load. Some guns (percussion revolvers, muzzleloaders, the Big Fifty) take a full turn to reload: your action, bonus action, and movement. You can still take reactions, but not with that gun. Nothing shortens a slow load except the Muzzleloader feat, and nothing ever shortens the Big Fifty. Tactical Reload. With a revolver or a lever-action repeater (TR ✓), you can use your bonus action to load one round from a gun belt or bandolier. You can't do this on a turn when you make a bonus-action shot. Single-shot guns can't use it. Quick Reload (Gunslinger) turns the reload action into a bonus action. It doesn't work on slow guns, or on a Dulls Rolling-Block chambered for a Heavy round. Caster cylinder. A reload (or Tactical Reload) can load hex lead shells as well as cartridges, in any mix. Cantrips need neither (Callings p.31). Single-shot guns fire, then spend an action reloading (a full turn for slow guns). That's the price of the damage. Balance note: features that grant an extra action (e.g. Second Cylinder / Action Surge) can spend that action reloading; they don't shorten a slow load.",
  "misfire": "Every gun has a Misfire number. If your attack roll's natural d20 shows that number, the attack misses and the gun jams. That's the raw roll, before any modifiers: Misfire 1–5 means a natural 1 to 5. Base misfire by build quality. Light-only guns roll one step better than their base: Herringers 1–3 (pepperbox 1–4), Dullards carbine 1–4. Clearing a jam: spend your action, or use a bonus action and succeed on a DC 10 Dexterity check (add your proficiency bonus if you're proficient with tinker's tools or gunsmith's tools). A jammed gun can't fire. Dirty: quicksand, a river dunk, a dust storm, or whatever the DM calls for makes a gun Dirty. A Dirty gun misfires on at least 1–2. Cleaning it takes 10 minutes with gunsmith's tools or a gun cleaning kit. Fouled: if a Dirty gun gets dirty again, or you roll with advantage or disadvantage and both d20s show a misfire number, the gun is fouled. It can't be used until someone spends a short rest working on it with tinker's or gunsmith's tools (or pays a gunsmith 500 ES). Forcing a fouled gun to fire is at your own risk.",
  "holster": "Rig bonuses don't stack: use the single best initiative bonus and the single best first-shot bonus. A gun belt isn't a rig and always pairs. Holsters work only for pistols (the saddle scabbard holds long guns).",
  "casterGun": "A Caster Gun is a spellcasting focus for your Hexslinger spells. It requires attunement. Chambers: Capacity (Blacksnake 6, machined to 7 or 8; Hognose 4, up to 6) is the cylinder. Every chamber holds either a hex lead shell or a plain cartridge, in whatever mix you load. Spin the Cylinder: a free action, any time. Turn the chamber you want under the hammer. Cantrips: at will. They use no shell and no chamber; the gun fires them from your own power. Hex lead: your spell slots are your hex lead shells (etched brass), one per slot, restored when you finish a long rest. A spell of 1st level or higher can be fired only from a loaded shell, reactions included. Use your normal spell attack bonus and save DC. Plain rounds: any cartridge. Pistol rounds (.32 Long, .357, .44-40, or .45 Long) use that tier's line in the Caster Guns table. Caster Guns are exempt from the Chambering Lock. Loading: shells and cartridges load the same way. A reload is an action and fills the whole cylinder with your chosen mix, and Tactical Reload (bonus action, 1 shell or cartridge) works. See Reloading. Two guns: a pair of Caster Guns (two attunements) gives you both cylinders, 12 chambers on two Blacksnakes. Light rifle rounds (.22 LR, .44 rimfire) fire as Light, and the .44-40 as Medium. Shotgun shells don't fit. Heavy rifle rounds (.45-70): 2d8 piercing, range 30/120, Misfire 1–3.",
  "borrowedIron": "Not a Caster Gun, not gear, and never sold. The Pact Seeker's soul-bound pact focus looks like the weapon their patron grants, but it has no weapon stats and fires only spells: no Borrowed Iron in hand, no spells. It can't be lost. If it leaves your hand, it returns at the start of your next turn. (Callings p.33)",
  "chambering": "Chambering. A gun is chambered for one round. Choose the round (from the tiers the gun lists) when you buy it and write it on your sheet. From then on, it fires only that round until you buy new hardware: a gunsmith rechambers it (new barrel and cylinder or bolt; cost 500 ES per tier step), or you buy another gun. You can't load a different round in the field, even one of the same class. If you want two rounds, carry two guns. Exception: Caster Guns are exempt and take any cartridge for plain rounds.",
  "hexLeadRest": "- Hex lead shells. Your spell slots are your shells. Each day you have one hex lead shell per spell slot, at that slot's level (see the Hex Lead Shells columns). A shell isn't tied to a spell until you fire it; you pick which known spell it carries when you pull the trigger. Spent shells come back when you finish a long rest, when the empty brass re-etches itself wherever it is.",
  "hexCylinder": "- The cylinder. A Blacksnake has 6 chambers (a Caster specialist can machine it to 7 or 8; a Hognose has 4, up to 6; Equipment p.64). Each chamber holds one hex lead shell or one plain cartridge, and you choose the mix every time you load.",
  "currency": "Reading PHB prices: 1 cp = 1 ES, 1 sp = 10 ES, 1 ep = 50 ES, 1 gp = 100 ES, and 1 pp = 1,000 ES. Multiply any PHB gold price by 100. Black shards are drained and worth nothing. Shops don't make change (a frontier custom). Pay in whole shards; odd amounts are kept. Banks make change for free.",
  "addiction": "",
  "explosives": "Anyone can buy dynamite and anyone can throw it. The Powder Man feat makes you good at explosives. Light and throw is one action, if you have a flame to hand (a lit cigar or pipe, a lamp, a torch, a campfire in reach, or a match). With a tinderbox, lighting takes an action first. It's never Use an Object, so Quick Grift can't do it, and Extra Attack doesn't add throws. Range 30/60 ft. Pick a point you can see. Past 30 ft, the stick lands 10 ft off in a random direction (d8). There's no attack r",
  "storytellerWear": "Strings: plain +0, quality +1, cheap −1. A fiddle uses the lower of its strings and its bow. Case (only if the instrument was inside): none +0, soft +1 (rain, dust, heat, falls), hard +2 (anything). A hard case also means no roll for gunshots or explosions. Instrument: quality +0, cheap −2. All modifiers stack. A natural 1 on the Wear roll always counts as at least Out of tune, whatever your modifiers. Snapped strings or bow: a snap is read on the d8 alone, before modifiers. A snapped set leaves the instrument Out of tune until you fit a new set on a short rest."
 },
 "warnings": [
  "The PHB has no Eldorite addiction rule yet; the DM Command Center keeps the chart (players do not see it)."
 ]
};

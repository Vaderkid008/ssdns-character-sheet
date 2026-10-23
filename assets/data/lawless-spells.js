/* Lawless spell list (L0214, DND Bot, locked 2026-10-22; Jessey approved the badge design 2:48 PM CT). DM-side: not in
   the PHB. A Lawman whose badge is Tarnished loses every other Lawman spell and casts only from this list (app.js
   callingCatalog / spell book swap); Bright or Dull brings the Lawman list back. Entries use the sheet's spell format,
   "5e name (Western name)", so the picker and the spell lines read "Western name · 5e name" like every other spell, and
   the blurbs come from the existing 5e spell data (spell-fx.js / spell-cast.js). Never edits rules.js.
   HOOK: oathFeatures(c) is where the Oath of the Lawless feature swap goes once it's specified. Until then it returns
   null and the Lawman keeps their own oath features (focus-slot.js lawlessOathHook). */
(function (root) {
  "use strict";
  root.SSDNS_LAWLESS = {
    id: "lawless",
    name: "Lawless",
    title: "Lawless (Tarnished badge)",
    blurb: "Charisma · Focus: your tarnished badge · Prepared as a paladin, spells to 5th. Your DM's list, not the PHB's.",
    levels: {
      "1": ["Hellish Rebuke (Hell's Answer)", "Inflict Wounds (Gut Shot)", "Command", "Wrathful Smite", "Searing Smite"],
      "2": ["Crown of Madness (Fever)", "Darkness (Lights Out)", "Branding Smite", "Magic Weapon"],
      "3": ["Animate Dead (Boot Hill)", "Bestow Curse (Hex Mark)", "Blinding Smite", "Dispel Magic"],
      "4": ["Blight (Dry Rot)", "Confusion (Snake Oil Haze)", "Staggering Smite"],
      "5": ["Contagion (Plague Wagon)", "Dominate Person (Bought Man)", "Destructive Wave (Judgment Day)"]
    },
    oathFeatures: function () { return null; }
  };
})(typeof window !== "undefined" ? window : globalThis);

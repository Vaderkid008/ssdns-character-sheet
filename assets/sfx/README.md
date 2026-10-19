# Sound effects

The sheet and the DM Command Center look up sounds in `sfx.json`. A missing file stays silent. `SSDNSAudio.weaponCue` picks a cue in this order: an explicit `sfx` field, then `weapons[id]` in this file, then the weapon kind. `weapons` values are cue names, not filenames.

`sfx.js` fetches this file as `sfx.json?v=0.3.22`, the same sheet version as the rest of the playtest.

| Event | Filename | When it plays |
|-------|----------|----------------|
| attack | `attack.mp3` | Rifles, carbines, muskets, and any gun without a weapon override |
| revolver | `revolver.mp3` | Navy/Army, Herringer, and Chaosmaker |
| lever-fire | `lever-fire.mp3` | Henrietta and Lancaster repeaters, Dullards tube rifle, Lancaster lever shotgun |
| plinker | `plinker.mp3` | Dullards Plinker, when the sheet passes that weapon id |
| shotgun | `shotgun.mp3` | Farm shotgun and coach gun |
| buffalo | `buffalo-rifle.mp3` | Bison Big Fifty |
| bow | `bow.mp3` | Shortbow, longbow, and the two string bows, by id |
| spear | `spear.mp3` | Javelin and trail spear, and a named spear, javelin, or pike |
| axe | `axe-hit.mp3` | Hatchet, buffalo axe, tomahawk, and other named axes |
| slash | `slash.wav` | Blades, such as a machete |
| thud | `thud.wav` | Bludgeons, such as a sledgehammer |
| twang | `twang.wav` | A bow or thrown weapon that has no catalog id |
| whoosh | `whoosh.wav` | Anything else, such as a net |
| holster | `holster.mp3` | Unload, and Roll next to Initiative. `turn` uses the same file |
| reload | `reload.mp3` | A reload that is not a lever or a revolver |
| reload-lever | `reload-lever.mp3` | Reload when the gun's action says lever |
| reload-revolver | `reload-revolver.mp3` | Reload for a pistol, caster, revolver, derringer, pepperbox, plinker, or Chaosmaker |
| empty-click | `empty-click.mp3` | Firing an empty chamber |
| spellcast | `spellcast.mp3` | A cast that is not an attack and has no special tag |
| spellshot | `spellshot.mp3` | A spell attack |
| pactshot | `pactshot.mp3` | A Pact Seeker spell attack |
| lightning | `lightning.mp3` | A spell whose name says lightning or thunder |
| electric | `electric.mp3` | A spell whose name says shock, galvanic, or electric |
| teleport | `teleport.mp3` | A spell whose name says teleport or misty step. Stays on this client |
| heal | `heal.mp3` | A heal or cure spell, and a DM HP heal. Stays on this client |
| jam | `jam.mp3` | Firearm misfire |
| explode | `explode.mp3` | A cracked gun that blows |
| roll | `roll.mp3` | Ability rolls and the wizard's six scores |
| reward | `reward.mp3` | DM ES reward |

These cues are in the map and play when something sets `sfx` to that name. Nothing calls them on its own yet: `fuse`, `cock`, `revolver-spin`, `arrow-impact`, `silenced`.

Gunshots, melee, bows, spears, axes, and the lightning and electric spell tags can be shared at the table. Reloads, the empty click, holster, turn, reward, heal, and teleport stay on the client that played them.

The volume slider and the Sound checkbox scale every cue, including one that is already playing. Mute drops them to silence. A new cue does not cut off the previous one.


## 0.3.56: Jessey's approved set

Pools pick at random among the primary and its `-alt-NN` files and never repeat the last pick. Missing files fall back via `CUE_FALLBACK` in `sfx.js`. The SFX master slider scales every cue.
Outcomes: gun hit `hit-gun`, miss `ricochet`, crit `nat20`. Melee splits by kind: blade (`sword-hit`), blunt (`miss-blunt` on a miss), spear, and axe; crit is `crit-melee`. Arrow hit and miss have their own cues. A nat 1 on a non-gun roll plays `nat1`; a gun's nat 1 plays its misfire.
Ambient beds live in `assets/music/ambient/` and are listed in `tracks.json` (ambient layer, loop).

| Event | Pool |
|---|---|
| attack | `rifle.mp3` |
| rifle | `rifle.mp3` |
| revolver | `revolver.mp3` |
| plinker | `plinker.mp3` |
| lever-fire | `lever-fire.mp3` · `lever-fire-alt-01.mp3` · `lever-fire-alt-02.mp3` · `rifle.mp3` |
| shotgun | `shotgun.mp3` |
| buffalo | `buffalo-rifle.mp3` |
| silenced | `silenced.mp3` |
| gatling | `gatling.mp3` |
| gatling-ellen-manor | `gatling-ellen-manor.mp3` |
| cock | `cock.mp3` |
| revolver-spin | `revolver-spin.mp3` |
| misfire | `misfire.mp3` · `misfire-alt-01.mp3` · `misfire-alt-02.mp3` |
| jam | `misfire.mp3` · `misfire-alt-01.mp3` · `misfire-alt-02.mp3` |
| empty-click | `misfire.mp3` · `misfire-alt-01.mp3` · `misfire-alt-02.mp3` |
| unjam | `unjam.mp3` |
| ricochet | `ricochet.mp3` · `ricochet-alt-01.mp3` · `ricochet-alt-02.mp3` · `ricochet-alt-03.mp3` · `ricochet-alt-04.mp3` |
| hit-gun | `hit-gun.mp3` · `hit-gun-alt-01.mp3` · `hit-gun-alt-02.mp3` |
| reload | `reload.mp3` |
| reload-revolver | `reload-revolver.mp3` |
| reload-lever | `reload-repeater.mp3` · `reload-repeater-alt-01.mp3` · `reload-repeater-alt-02.mp3` |
| rechamber | `rechamber.mp3` |
| clean | `clean.mp3` |
| slash | `roll-blade.mp3` |
| sword-hit | `sword-hit.mp3` |
| thud | `thud.wav` |
| twang | `twang.wav` |
| whoosh | `whoosh.wav` |
| axe | `axe-hit.mp3` |
| spear | `spear-hit.mp3` · `sword-hit.mp3` |
| spear-throw | `spear-throw.mp3` |
| bow | `bow-short-fire.mp3` |
| bow-long | `bow-long-draw.mp3` |
| hit-melee | `hit-melee.mp3` · `hit-melee-alt-01.mp3` · `hit-gun-alt-02.mp3` |
| crit-melee | `crit-melee.mp3` · `crit-melee-alt-01.mp3` |
| miss-melee | `miss-melee.mp3` |
| miss-blunt | `miss-melee-alt-01.mp3` · `miss-melee.mp3` |
| hit-arrow | `hit-arrow.mp3` · `hit-arrow-alt-01.mp3` |
| miss-arrow | `miss-arrow.mp3` · `miss-arrow-alt-01.mp3` |
| spellcast | `spellcast.mp3` · `spellcast-alt-01.mp3` |
| spellshot | `spellshot.mp3` |
| pactshot | `pactshot.mp3` |
| lightning | `lightning.mp3` |
| lightning-ultimate | `lightning-ultimate.mp3` |
| electric | `electric.mp3` |
| ice-storm | `ice-storm.mp3` |
| magic-whoosh | `magic-whoosh-soft.mp3` |
| teleport | `teleport.mp3` · `teleport-alt-01.mp3` |
| heal | `heal.mp3` |
| holster | `holster.mp3` |
| end-turn | `holster.mp3` |
| grapple-fire | `grappling-gun-fire.mp3` |
| grapple-retract | `grappling-gun-retract.mp3` |
| explode | `explode.mp3` · `explode-alt-01.mp3` |
| fuse | `fuse.mp3` |
| roll | `roll-d20.mp3` |
| roll-d20 | `roll-d20.mp3` |
| roll-dice | `roll.mp3` |
| turn | `turn.mp3` |
| ui-back | `ui-back.mp3` |
| ui-tick | `ui-tick.mp3` |
| enemy-downed | `enemy-downed.mp3` |
| nat20 | `nat20.mp3` |
| nat1 | `nat1.mp3` |
| sting-tension | `sting-tension.mp3` |
| sting-reveal | `sting-reveal.mp3` |
| reward | `reward.mp3` |

## 0.3.58 play order

Results follow the shot you actually hear. Every sfx file is preloaded. A result plays 550 ms (0.3.60: 750 ms) after the shot's real start (the `playing` event). If the shot fails or hasn't started after 1 s, the result plays anyway. A result that arrives before its shot waits up to 550 ms for one. A crit plays its sting (nat20) 150 ms before the hit sound. Set `CRIT_BEFORE_SHOT = true` in sfx.js to play the sting right away instead; the shot has already fired by then, so the sting lands together with the shot rather than truly ahead of it. Enemy downed plays 450 ms after the result. Other overlapping cues are spaced 250 ms apart. No cue waits more than 1.5 s.

## 0.3.60 timing

Results play 750 ms after the shot's real start. A crit's sting plays at 600 ms (150 ms before the hit sound). Enemy downed plays 450 ms after the result. The cap is now 1.8 s, so the full chain isn't clipped.

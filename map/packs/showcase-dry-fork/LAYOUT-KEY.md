# Dry Fork Water Stop: showcase battle map (40×30 squares, 5 ft each)
**DRAFT for Jessey morning review (Sun Oct 25 2026).** Fresh set piece, not a Dusty Spur reuse. Spoiler-free, no Act I places.

Final art file (Art Bot): `showcase-dry-fork_40x30_70px.png` = **2800×2100 px**, 70 px per square, straight top-down, no border/margin/title, **no grid lines, tokens or letters baked in**.
Schematic guide: `showcase-dry-fork_40x30_70px_SCHEMATIC.png`. Columns A–Z, AA–AN left to right; rows 1–30 top to bottom; A1 is top-left. Walls sit on square edges.
Walls for DMCC **Import Walls**: `showcase-dry-fork.walls.json` (31 segments, grid-corner coords, WALLS-FOR-BOTS format). Full edge list + zones + spawns: `showcase-dry-fork.map.json` (DRAFT; schema per Ellen Manor, waiting on Coder).
Rebuild: `python3 build.py` (uses `../maplib.py`).

## Zones
- **Rocky rise:** AE1–AL3, +5 ft. Half cover crouched. Lookout spot.
- **Main line (rails):** A7–AN8, full width, east–west.
- **Siding:** J10–AF11. It leaves the main line at the **west switch (I9)** and rejoins at the **east switch (AG9)**.
- **Platform:** K12–AD13, +3 ft plank deck (stepping up costs 5 extra ft from the siding side).
- **Wagon road:** A16–L18, from the west edge to the platform end. The party rides in here.
- **Section house:** M14–V21. **Office / telegraph** M14–Q21, **bunk room** R14–V21.
- **Tool shed:** Y15–AC19. Dark inside.
- **Corral:** AF15–AM23 (rail fence).
- **Cut bank:** row 25 (A25–AN25). Half cover crouched; drop into the wash is 5 ft.
- **Dry wash:** A26–AN30. Difficult terrain (loose sand, rocks).

## Walls, doors and windows
- **Section house outer walls** run on the edges of M14–V21.
  - **Front door:** north wall at O14 (onto the platform). Closed.
  - **Back door:** south wall at T21. Closed.
  - **Windows:** north wall S14 · south wall N21 · west wall M16 · east wall V18. A window blocks movement, not sight. Firing through one gives the shooter half cover; climbing through costs 10 ft.
  - **Inside wall** between office and bunk room on the west edge of column R (rows 14–21). **Inside door** at R17, open.
- **Tool shed:** walls on the edges of Y15–AC19. **Plank door** on the west wall at Y17 (closed, latched from outside). No windows.
- **Outhouse:** G22–H23, total cover. Door on the north side at G22.
- **Corral fence:** edges of AF15–AM23. **Gate** on the west fence at AF18–AF19 (closed). Fence = half cover, 5 ft extra to climb, does **not** block sight (left out of the walls JSON).
- Every outside door can be barred: action + heavy object; breaking through is Str DC 15 (or AC 15, 18 HP).

## Cover (standard 5e + Take Cover)
| Object | Squares | Cover |
|:--|:--|:--|
| Water tower legs | O3–R6 | Half (underneath) |
| Water tower tank top | O3–R6, +20 ft | Three-quarters behind the rim |
| Boulder | Y2–Z3 | Three-quarters |
| Mesquite | D2–E3, AJ27–AK28 | Half |
| Telegraph pole | L5 | Half |
| Switch stands | I9, AG9 | Half |
| Signal post (order board) | AH6 | Half |
| Handcar | AA10–AB11 | Three-quarters |
| Coal bin | F11–H12 | Three-quarters |
| Lantern posts | K12, AD12 | Half |
| Baggage cart | V12–W12 | Half (shove 10 ft along the platform, Str DC 10) |
| Rain barrel | W15 | Half |
| Telegraph desk | N15–O15 | Half |
| Stove | P20 | Three-quarters |
| Bunks | U15–U17, U19–U20 | Half |
| Bunk-room table | S18–T19 | Half (tip it: object interaction, still half) |
| Woodpile | X21–Y21 | Three-quarters |
| Broken wagon | D19–F20 | Three-quarters (bed +4 ft if climbed) |
| Road trough | K19–K20 | Half |
| Horses (4) | AH17–AH18, AJ17–AJ18, AI20–AI21, AK20–AK21 | Half (they spook at gunfire) |
| Corral trough | AL22–AL23 | Half |
| Rocks in the wash | S28–T28 | Half |

## Terrain toys
- **Tower ladder (S5):** climb 20 ft = 40 ft of movement, or Athletics DC 10 to do it in 20 ft. Up top: three-quarters cover, clear shots down the whole yard.
- **Water spout (Q7):** action + Str DC 12 to swing it and pull the chain: 10-ft line of water along the main line, Medium creatures in it make DC 12 Dex or fall prone. Puts out a torch in the line.
- **Handcar (AA10–AB11):** pump it (action) to roll 30 ft along the siding or, through a switch, the main line. A thrown switch stand (action, I9 or AG9) decides which.
- **Signal sign / order board (AH6):** a painted RED / GREEN sign on a post. Not a light. The gang turned it to RED to stop the night freight. One action at the post flips it to GREEN. At night a plain lantern hangs on the post so the board can be read (AC 12, one hit puts it out). If the lantern goes out, the board is still there; its color is what matters to the train.
- **Lantern posts (K12, AD12):** AC 12, one hit puts it out (light drops; see Lighting). A lit lantern thrown = 5-ft burst of burning oil, 1d4 fire, DC 10 Dex.
- **Loose boards (AB18, in shed):** hide the Outlaw Stash (Perception DC 13).

## Start spots
- **PCs (blue):** P1 B16, P2 B17, P3 C16, P4 C17 (P5 B18 if five). Mounted, riding in on the wagon road.
- **Enemies (red):**
  - E1 **Hired Rifle** Q13, on the platform doing the talking. When steel comes out he heads for the tower ladder (S5) and the tank top.
  - E2 **Switch Boss** AA10, on the handcar.
  - E3 Outlaw P13, leaning by the front door.
  - E4 Outlaw N17, inside the office at the west window.
  - E5 Outlaw AE19, at the corral gate.
  - E6 Outlaw X17, by the shed door.
  - E7 Outlaw (lookout) AH2, on the rocky rise.
- **Optional reinforcement (round 3):** R1 Dust Devil U29, R2 Dust Devil W29, up out of the wash.
- **Bystander (gray):** B1 the keeper, Z16, tied and gagged in the shed.

## Lighting
- **Dusk (start):** whole map **Dim**. Sun is down behind the rise.
- **Dark (when the Freight clock hits 4, or the DM says so):** whole map **Dark** except:
  - Lantern posts K12 and AD12: bright 15 ft, dim +15 ft (until shot out).
  - Office lamp: bright 15 / dim +15, inside the office only.
  - Lantern on the signal post AH6: bright 15 ft, dim +15 ft (until shot out). Only there so the RED/GREEN board can be read.
  - Campfire AD23: bright 20 / dim +20.
- **Tool shed** is Dark unless someone brings a torch, a belt lantern, or Light.

## Art notes for Art Bot
- High-desert rail water stop at dusk. Wooden **water tower** on four legs with a ladder (S5) and a swing spout over the main line (Q7). One **main line** and a **siding**, joined by two switch stands (I9, AG9). Plank **platform** with two lantern posts. A **signal post** (AH6) with a painted **RED/GREEN order board** (a sign) and a hook for a plain lantern. Clapboard **section house** (office + bunk room). Small board-and-batten **tool shed**. Rail-fence **corral** with four horses and a trough. Handcar on the siding. Coal bin, broken wagon, woodpile, outhouse, telegraph pole. A **rocky rise** in the NE corner, and a **dry wash** with a cut bank across the south.
- Every object stays inside its listed squares. Walls read as dark lines on square edges. Windows and doors should be legible (Ellen Manor lost them; please keep them clear).
- Show heights (platform, rise, cut bank, tower tank) with edge shadows, not a perspective tilt.
- Paint it at dusk-neutral light (DMCC handles Dark/Dim). Lanterns can be painted unlit.
- No tokens, letters or grid in the final art. The tool draws those.

## Coder alignment stub
If Coder sends a different map-method path or a final `.map.json` schema, re-key this file to it. Open items: (1) fences in the walls JSON or not (left out here because they don't block sight); (2) where elevation (platform +3, tank +20, rise +5) lives in the scene JSON; (3) lantern posts as shootable light sources.

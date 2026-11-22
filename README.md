# WorldSim Ages

A god-simulation sandbox where civilizations don't just grow — they **advance**.
Shape continents, spawn peoples, unleash disasters, and watch kingdoms climb a real
technology tree from campfires and stone huts to factories, jets, nukes, glass
skyscrapers, and colony ships to the stars.

Runs on **Windows** (Electron) and **Android** (APK, Capacitor), from one TypeScript/Canvas codebase.

## Features

**World**
- **Earth map**: real coastlines (Natural Earth, public domain), major mountain ranges, deserts and climate zones
- Procedural worlds: continents, pangaea, archipelago, lakelands, highlands, empty ocean; sizes up to 704×480 tiles
- 21 terrain types and 7 biomes, forests that spread, crops that ripen, deposits of ore, gold, coal, oil and uranium
- Terrain tools: raise/lower land, paint every biome, lava, forests, flowers, clearing

**Life**
- Four original species with their own strengths: Humans, Verdani (forest scholars), Stonekin (mountain builders), Grukh (warrior hordes)
- Individual people with names, ages, traits, jobs, levels, kills and kings
- Wildlife (sheep, deer, chickens, wolves, bears, fish) and monsters (dragons, zombies, krakens, stone golems, alien saucers)

**Civilization**
- Villages gather, farm, chop, mine, build, and grow into towns, cities and metropolises with borders
- Realistic demographics: high mortality and slow growth early, population booms after medicine and sanitation
- Cities lay out street grids and city blocks; nations build intercity roads, railways and paved highways tile by tile
- Settlers found new cities; ships carry colonists and armies across the sea
- Governments evolve with the era: Tribe → Chiefdom → Kingdom → Empire → Republic → Federation → Star Union

**Nations & world politics**
- Every nation has its own flag; zoomed out, the map reads like a political world map
- Trade agreements (with trade roads and gold), non-aggression pacts, alliances, border incidents, rivalries, rebellions
- Wars keep score; named peace treaties make the loser cede cities and pay reparations
- A World Council forms in the Modern Age, admits nations and brokers peace
- Nuclear powers test bombs, build arsenals and are deterred from attacking each other; desperate nations may strike first and be answered in kind
- Nuclear winter after nuclear exchanges; the Council can pass a Nuclear Weapons Ban (signatories disarm, can withdraw) and a Climate Accord
- Doomsday clock, nuclear arsenals, accords and wars on the 🌐 World affairs screen

**Technology — the main event**
- 68 technologies across 10 eras: Stone, Bronze, Iron, Medieval, Renaissance, Industrial, Modern, Atomic, Information, Space
- Paced like history: roughly a thousand-plus simulated years from the first campfire to the space age (adjustable in World laws)
- Each discovery changes the simulation: farms, roads, docks and ships, castles and knights, muskets and cannons,
  factories and smog, electric city lights at night, tanks, air raids, nuclear missiles, labs, renewable/fusion power, mechs, lasers, rockets
- 16 soldier types, 6 ship classes and 4 aircraft classes; armies re-equip as their kingdom advances
- Every building is rebuilt in the architectural style of each new era
- Industry pollutes land and warms the climate (melting ice, rising seas) until clean energy is discovered
- Space-age kingdoms launch rockets; five colony ships let a civilization ascend
- Knowledge diffuses between neighbours; you can inspire, gift technologies, or plunge a kingdom into a dark age

**God powers & disasters**
- Rain, lightning, fire, meteors, meteor showers, earthquakes, tornadoes, volcanoes, blizzards, droughts, acid rain, plague, alien invasions
- Bless, curse, heal, madness, divine smite, nuke, erase, purify, cool the climate
- Force wars and peace, friendship, rebellions, bounties

**Interface**
- Inspector for people, buildings, cities and kingdoms; tech-tree viewer; history log; statistics with charts
- Map modes: normal, political, technology eras, pollution; minimap; day/night cycle
- World laws (toggle wars, nukes, research, disasters, climate, rebellions…, research speed, population cap)
- Save slots + autosave, touch controls (pinch, drag), mouse & keyboard controls

## Controls

| Action | Desktop | Touch |
| --- | --- | --- |
| Move camera | drag with 🔍 Inspect, right/middle drag, WASD/arrows | drag with 🔍 Inspect, two fingers |
| Zoom | mouse wheel, `+` / `-` | pinch |
| Use a power | pick a tool, click/drag on the world | pick a tool, tap/drag |
| Inspect | click with 🔍 Inspect | tap with 🔍 Inspect |
| Speed | `Space` pause, `1`–`5` speeds | top bar |
| Brush size | `[` / `]` | +/− at bottom right |
| Map mode | `M` | 🗺️ |
| Fullscreen (Windows) | `F11` | — |

## Building

```bash
npm install
npm run dev           # play in the browser at http://localhost:5173
npm run build         # production web build in dist/
npm run sim           # headless simulation run (balance / smoke test)
```

**Windows**
```bash
npm run dist:win              # NSIS installer + portable exe (run on Windows)
npm run dist:win-portable     # portable exe + zip (works from Linux with wine64)
```

**Android** (JDK 17 + Android SDK 34)
```bash
npm run build && npx cap sync android
cd android && ./gradlew assembleDebug   # android/app/build/outputs/apk/debug/app-debug.apk
```

GitHub Actions (`.github/workflows/build.yml`) builds the Windows installer, portable exe and the APK on every push
and publishes them as a GitHub Release.

The APK is signed with `android/app/worldsim-sideload.keystore`, a deliberately public debug-style key
(standard `android` passwords) so every local and CI build can update an installed copy in place without
losing saved worlds. It is not meant for store publishing.

## Project layout

```
src/sim/      simulation: world, worldgen, pathfinding, units, cities, kingdoms, tech tree, disasters, save/load
src/render/   canvas renderer, procedural pixel-art sprites, chunked terrain texture
src/ui/       DOM interface, tools (god powers), input
electron/     Windows desktop shell
android/      Capacitor Android project
test/         headless simulation and tool tests
```

All art is generated procedurally at runtime; no external assets.

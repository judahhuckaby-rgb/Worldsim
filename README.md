# WorldSim Ages

A god-simulation sandbox where civilizations don't just grow — they **advance**.
Shape continents, spawn peoples, unleash disasters, and watch kingdoms climb a real
technology tree from campfires and stone huts to factories, jets, nukes, glass
skyscrapers, and colony ships to the stars.

Runs on **Windows** (Electron) and **Android** (APK, Capacitor), from one TypeScript/Canvas codebase.

## Features

**World**
- Procedural worlds: continents, pangaea, archipelago, lakelands, highlands, empty ocean; four sizes
- 21 terrain types and 7 biomes, forests that spread, crops that ripen, deposits of ore, gold, coal, oil and uranium
- Terrain tools: raise/lower land, paint every biome, lava, forests, flowers, clearing

**Life**
- Four original species with their own strengths: Humans, Verdani (forest scholars), Stonekin (mountain builders), Grukh (warrior hordes)
- Individual people with names, ages, traits, jobs, levels, kills and kings
- Wildlife (sheep, deer, chickens, wolves, bears, fish) and monsters (dragons, zombies, krakens, stone golems, alien saucers)

**Civilization**
- Villages gather, farm, chop, mine, build, and grow into towns, cities and metropolises with borders
- Settlers found new cities; ships carry colonists and armies across the sea
- Diplomacy: opinions, alliances, border incidents, rivalries, wars, conquests, peace treaties, rebellions
- Governments evolve with the era: Tribe → Chiefdom → Kingdom → Empire → Republic → Federation → Star Union

**Technology — the main event**
- 68 technologies across 10 eras: Stone, Bronze, Iron, Medieval, Renaissance, Industrial, Modern, Atomic, Information, Space
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
and attaches them to a GitHub Release when a `v*` tag is pushed.

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

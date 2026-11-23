# WorldSim Ages

A god-simulation sandbox where civilizations don't just grow — they **advance**.
Shape continents, spawn peoples, unleash disasters, and watch kingdoms climb a real
technology tree from campfires and stone huts to factories, jets, nukes, glass
skyscrapers, Mars colonies, plasma weapons and galactic crystal spires — or take command of
one nation yourself.

Runs on **Windows** (Electron) and **Android** (APK, Capacitor), from one TypeScript/Canvas codebase.

## Features

**World**
- **Earth map**: real coastlines (Natural Earth, public domain), major mountain ranges, deserts and climate zones
- Procedural worlds: continents, pangaea, archipelago, lakelands, highlands, empty ocean; sizes up to 1280×880 tiles
- Level-of-detail rendering keeps memory bounded on huge worlds; peoples start spread over every landmass
- 21 terrain types and 7 biomes, forests that spread, crops that ripen, deposits of ore, gold, coal, oil and uranium
- Terrain tools: raise/lower land, paint every biome, lava, forests, flowers, clearing

**Life**
- Four original species with their own strengths: Humans, Verdani (forest scholars), Stonekin (mountain builders), Grukh (warrior hordes)
- Individual people with names, ages, traits, jobs, levels, kills and kings
- Wildlife (sheep, deer, chickens, wolves, bears, fish) and monsters (dragons, zombies, krakens, stone golems, alien saucers)

**Civilization**
- Villages gather, farm, chop, mine, build, and grow into towns, cities and metropolises with borders
- Realistic demographics: high mortality and slow growth early, population booms after medicine and sanitation
- Big nations: thousands of people and dozens of cities each; from the Industrial Age villagers move to the capital, which grows into a great city; administration improves with technology so modern states hold together
- Cities lay out street grids and city blocks; nations link every city to its neighbours and the capital with roads, open border crossings to neighbours at peace and capital-to-capital roads (later motorways) to trading partners, then railways and two-lane motorways, tile by tile
- New towns spring up along roads and cities sprawl out along their highways; roads left with no town to serve fade back into the land
- Dense traffic visible from far out: carts, cars, trucks, buses and hovercars (faster on highways); long steam, diesel and maglev trains
- Settlers found new cities; ships carry colonists and armies across the sea
- Governments evolve with the era: Tribe → Chiefdom → Kingdom → Empire → Republic → Federation → Star Union → Solar Commonwealth → Collective → Galactic Republic

**Nations & world politics**
- Every nation has its own flag; zoomed out, the map reads like a political world map
- Trade agreements (with trade roads and gold), non-aggression pacts, alliances, border incidents, rivalries, rebellions
- Overstretched nations split apart — civil wars or peaceful dissolutions (\"North X\" / \"South X\"); seafaring nations colonize other continents
- Unions: close allies federate and small friendly neighbours join a powerful nation, bringing all their cities, people, armies and knowledge; nearby towns of one nation grow together into one great city
- Wars are campaigns: armies of hundreds muster near the front, march together on one city, besiege and take it, then press on to the next; threatened cities call in reinforcements; seaborne invasions cross the water
- Wars last while one side keeps winning and end in collapse or stalemate; named peace treaties hand over up to three cities and reparations
- War map: zoomed out, arrows show every marching army and its strength
- A World Council forms in the Modern Age, admits nations and brokers peace
- Modern wars are fought from the air: bomber raids from every airbase, cruise-missile salvos, and orbital kinetic strikes in the future ages
- Nuclear powers test bombs, build arsenals and use them in wars — first strikes when losing or desperate, multi-warhead salvos, retaliation in kind; deterrence and a Nuclear doctrine law (restrained / realistic / trigger-happy) temper it
- Nukes are devastating: the fireball erases whole cities, firestorms spread, a crater lake forms, radioactive fallout drifts downwind for years; hydrogen and antimatter bombs are far bigger; missile defense and energy shields can intercept
- Nuclear winter after nuclear exchanges; the Council can pass a Nuclear Weapons Ban (signatories disarm, can withdraw) and a Climate Accord
- Doomsday clock, nuclear arsenals, accords and wars on the 🌐 World affairs screen

**Technology — the main event**
- 88 technologies across 13 eras: Stone, Bronze, Iron, Medieval, Renaissance, Industrial, Modern, Atomic, Information, Space, Interplanetary, Singularity, Galactic
- Paced like history: centuries of slow early progress, then accelerating science (adjustable in World laws, or start a world in any era)
- Each discovery changes the simulation: farms, roads, docks and ships, castles and knights, muskets and cannons,
  factories and smog, electric city lights at night, tanks, air raids, nuclear missiles, labs, renewable/fusion power, mechs, lasers, rockets
- 20 soldier types (up to railgunners, cyborgs, plasma troopers and titan walkers), 6 ship classes and 6 aircraft classes (up to stealth bombers and plasma gunships); armies re-equip as their kingdom advances
- Every building is rebuilt in the architectural style of each new era
- Industry pollutes land and warms the climate (melting ice, rising seas) until clean energy is discovered
- Space-age kingdoms launch rockets; in the Galactic Age five colony ships let a civilization ascend
- Knowledge diffuses between neighbours; you can inspire, gift technologies, or plunge a kingdom into a dark age

**Lead a nation**
- Press 🎮 Take command on any nation: a command bar lets you send the army against a city (by sea too), call air raids, cruise missiles, orbital strikes and nukes, claim unsettled land by painting it, take over foreign cities without war (unhappy cities defect, others can be bought), found new cities, mobilize, choose research, and negotiate peace, alliances, trade, pacts, unions (a nation joins yours) and ultimatums (a much weaker nation submits) — the economy runs itself

**God powers & disasters**
- Rain, lightning, fire, meteors, meteor showers, giant asteroids, tsunamis, solar flares, earthquakes, tornadoes, volcanoes, blizzards, droughts, acid rain, plague, pandemics, alien invasions
- Bless, curse, heal, madness, divine smite, nuke, hydrogen bomb, orbital strike, erase, purify, cool the climate
- Paint roads, highways and railways
- Force wars and peace, friendship, rebellions, raise armies, bounties

**Updates**
- The app checks GitHub Releases: Android downloads the new APK and opens the installer; the Windows installer
  version updates itself in the background; the portable exe and browser show a download link

**Interface**
- Inspector for people, buildings, cities and kingdoms; tech-tree viewer; history log; statistics with charts
- Map modes: normal, political, technology eras, pollution; minimap; day/night cycle
- World laws (toggle wars, nukes, research, disasters, climate, rebellions…, research speed, nuclear doctrine, population cap)
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

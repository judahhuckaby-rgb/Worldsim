// The technology tree: Stone Age -> Space Age.

export const ERAS = [
  { name: 'Stone Age', short: 'Stone', color: [150, 130, 110] },
  { name: 'Bronze Age', short: 'Bronze', color: [205, 127, 50] },
  { name: 'Iron Age', short: 'Iron', color: [140, 140, 150] },
  { name: 'Medieval Age', short: 'Medieval', color: [120, 80, 170] },
  { name: 'Renaissance', short: 'Renaiss.', color: [200, 60, 80] },
  { name: 'Industrial Age', short: 'Industrial', color: [90, 70, 60] },
  { name: 'Modern Age', short: 'Modern', color: [60, 130, 210] },
  { name: 'Atomic Age', short: 'Atomic', color: [120, 220, 80] },
  { name: 'Information Age', short: 'Info', color: [40, 210, 220] },
  { name: 'Space Age', short: 'Space', color: [250, 240, 140] },
] as const;
export const NUM_ERAS = ERAS.length;

export interface Caps {
  era: number;
  houseCap: number;
  foodMult: number;
  woodMult: number;
  mineMult: number;
  researchMult: number;
  buildMult: number;
  speedMult: number;
  growthMult: number;
  lifeMult: number;
  plagueResist: number;
  loyalty: number;
  pollution: number;   // multiplier on industrial pollution
  lights: number;      // 0 none, 1 torches, 2 electric
  ship: number;        // -1 none .. 5
  air: number;         // -1 none .. 3
  tower: number;       // -1 none, 0 arrows, 1 cannon, 2 guns, 3 missiles, 4 lasers
  farms: boolean;
  roads: number;       // 0 none, 1 dirt, 2 paved
  buildings: Set<string>;
  extract: Set<number>; // RES indices extractable
  nukes: boolean;
  space: boolean;
  colonize: boolean;
  healRate: number;
  soldierRatio: number;
}

export function baseCaps(): Caps {
  return {
    era: 0, houseCap: 3, foodMult: 1, woodMult: 1, mineMult: 1, researchMult: 1, buildMult: 1,
    speedMult: 1, growthMult: 1, lifeMult: 1, plagueResist: 0, loyalty: 0, pollution: 0, lights: 0,
    ship: -1, air: -1, tower: -1, farms: false, roads: 0, buildings: new Set(['center', 'house']),
    extract: new Set([0, 1]), nukes: false, space: false, colonize: false, healRate: 0.02, soldierRatio: 0.12,
  };
}

export interface TechDef {
  id: string;
  name: string;
  era: number;
  cat: 'eco' | 'mil' | 'sci' | 'civ';
  req: string[];
  desc: string;
  fx: (c: Caps) => void;
  idx: number;
  cost: number;
}

type TD = Omit<TechDef, 'idx' | 'cost'>;
const t = (id: string, name: string, era: number, cat: TD['cat'], req: string[], desc: string, fx: (c: Caps) => void): TD =>
  ({ id, name, era, cat, req, desc, fx });

const RAW: TD[] = [
  // ---- Stone Age
  t('stonetools', 'Stone Tools', 0, 'eco', [], 'Sharpened flint. Gathering and chopping.', c => { c.woodMult *= 1.1; }),
  t('fire', 'Fire', 0, 'civ', [], 'Torches light the night and cook food.', c => { c.lights = Math.max(c.lights, 1); c.foodMult *= 1.05; }),
  t('hunting', 'Hunting', 0, 'mil', ['stonetools'], 'Organized hunts bring more meat.', c => { c.foodMult *= 1.08; }),
  t('archery', 'Archery', 0, 'mil', ['hunting'], 'Bows and arrows. Unlocks Archers.', () => {}),
  t('agriculture', 'Agriculture', 0, 'eco', ['stonetools'], 'Farms! Settled food production.', c => { c.farms = true; c.growthMult *= 1.1; }),
  t('pottery', 'Pottery', 0, 'eco', ['agriculture'], 'Food storage reduces spoilage.', c => { c.foodMult *= 1.08; }),
  t('husbandry', 'Animal Husbandry', 0, 'eco', ['agriculture', 'hunting'], 'Domesticated herds.', c => { c.foodMult *= 1.1; }),
  t('mysticism', 'Mysticism', 0, 'civ', ['fire'], 'Shamans and shrines. Unlocks Temples.', c => { c.buildings.add('temple'); c.loyalty += 5; }),
  t('mining', 'Mining', 0, 'eco', ['stonetools'], 'Quarry stone from hills. Unlocks Mines.', c => { c.buildings.add('mine'); c.mineMult *= 1.1; }),
  // ---- Bronze Age
  t('bronze', 'Bronze Working', 1, 'mil', ['mining'], 'Bronze weapons and tools. Spearmen, Barracks.', c => { c.extract.add(2); c.buildings.add('barracks'); c.woodMult *= 1.1; }),
  t('writing', 'Writing', 1, 'sci', ['pottery'], 'Records and scribes. Unlocks Libraries.', c => { c.buildings.add('library'); c.researchMult *= 1.1; }),
  t('masonry', 'Masonry', 1, 'civ', ['mining'], 'Stone walls and watchtowers.', c => { c.tower = Math.max(c.tower, 0); c.buildings.add('tower'); c.houseCap += 1; }),
  t('wheel', 'The Wheel', 1, 'eco', ['agriculture'], 'Carts and dirt roads.', c => { c.roads = Math.max(c.roads, 1); c.speedMult *= 1.05; }),
  t('sailing', 'Sailing', 1, 'eco', ['pottery'], 'Rafts and fishing boats. Unlocks Docks.', c => { c.ship = Math.max(c.ship, 0); c.buildings.add('docks'); c.foodMult *= 1.05; }),
  t('calendar', 'Calendar', 1, 'sci', ['agriculture', 'mysticism'], 'Seasons tracked; better harvests.', c => { c.foodMult *= 1.12; }),
  // ---- Iron Age
  t('iron', 'Iron Working', 2, 'mil', ['bronze'], 'Iron swords and armor. Swordsmen.', c => { c.mineMult *= 1.15; c.buildings.add('forge'); }),
  t('mathematics', 'Mathematics', 2, 'sci', ['writing'], 'Numbers, geometry, engineering basics.', c => { c.researchMult *= 1.12; c.buildMult *= 1.1; }),
  t('currency', 'Currency', 2, 'eco', ['bronze', 'writing'], 'Coins and trade. Unlocks Markets, gold.', c => { c.extract.add(3); c.buildings.add('market'); }),
  t('philosophy', 'Philosophy', 2, 'sci', ['mysticism', 'writing'], 'Schools of thought.', c => { c.researchMult *= 1.12; c.loyalty += 5; }),
  t('construction', 'Construction', 2, 'civ', ['masonry', 'wheel'], 'Bigger, sturdier homes.', c => { c.houseCap += 1; c.buildMult *= 1.15; }),
  t('horseback', 'Horseback Riding', 2, 'mil', ['husbandry', 'wheel'], 'Mounted messengers and raiders.', c => { c.speedMult *= 1.1; }),
  t('shipbuilding', 'Shipbuilding', 2, 'mil', ['sailing', 'bronze'], 'War galleys patrol the coast.', c => { c.ship = Math.max(c.ship, 1); }),
  // ---- Medieval
  t('feudalism', 'Feudalism', 3, 'mil', ['iron', 'construction'], 'Castles and knights.', c => { c.buildings.add('castle'); c.loyalty += 8; }),
  t('engineering', 'Engineering', 3, 'sci', ['mathematics', 'construction'], 'Crossbows, aqueducts, mills.', c => { c.buildMult *= 1.15; c.foodMult *= 1.08; }),
  t('theology', 'Theology', 3, 'civ', ['philosophy'], 'Organized faith. Temples become cathedrals.', c => { c.loyalty += 10; }),
  t('education', 'Education', 3, 'sci', ['philosophy', 'mathematics'], 'Universities train scholars.', c => { c.buildings.add('university'); c.researchMult *= 1.1; }),
  t('navigation', 'Navigation', 3, 'eco', ['shipbuilding', 'mathematics'], 'Compass and caravels cross oceans.', c => { c.ship = Math.max(c.ship, 2); }),
  t('guilds', 'Guilds', 3, 'eco', ['currency', 'construction'], 'Craftsmen guilds boost output.', c => { c.woodMult *= 1.15; c.mineMult *= 1.15; }),
  // ---- Renaissance
  t('gunpowder', 'Gunpowder', 4, 'mil', ['engineering', 'iron'], 'Muskets change warfare.', c => { c.tower = Math.max(c.tower, 1); }),
  t('printing', 'Printing Press', 4, 'sci', ['education'], 'Books for everyone.', c => { c.researchMult *= 1.2; }),
  t('banking', 'Banking', 4, 'eco', ['currency', 'education'], 'Credit funds great projects.', c => { c.buildMult *= 1.1; }),
  t('astronomy', 'Astronomy', 4, 'sci', ['navigation', 'education'], 'Telescopes reveal the heavens.', c => { c.researchMult *= 1.1; }),
  t('medicine', 'Medicine', 4, 'civ', ['education'], 'Physicians and hospitals.', c => { c.buildings.add('hospital'); c.plagueResist += 0.3; c.lifeMult *= 1.1; c.healRate *= 1.5; }),
  t('metallurgy', 'Metallurgy', 4, 'mil', ['gunpowder'], 'Cast cannons and galleons.', c => { c.ship = Math.max(c.ship, 3); }),
  t('scientific', 'Scientific Method', 4, 'sci', ['astronomy', 'printing'], 'Experiments over dogma.', c => { c.researchMult *= 1.15; }),
  // ---- Industrial
  t('steam', 'Steam Power', 5, 'eco', ['scientific', 'metallurgy'], 'Coal-fired engines and steamships.', c => { c.extract.add(4); c.ship = Math.max(c.ship, 4); c.mineMult *= 1.2; }),
  t('industrialization', 'Industrialization', 5, 'eco', ['steam', 'banking'], 'Factories! Production soars, so does smog.', c => { c.buildings.add('factory'); c.pollution = Math.max(c.pollution, 1); c.woodMult *= 1.3; c.mineMult *= 1.3; c.houseCap += 2; }),
  t('railroad', 'Railroad', 5, 'eco', ['steam'], 'Rail networks move people fast.', c => { c.speedMult *= 1.15; c.buildMult *= 1.1; }),
  t('rifling', 'Rifling', 5, 'mil', ['metallurgy', 'industrialization'], 'Accurate rifles replace muskets.', () => {}),
  t('electricity', 'Electricity', 5, 'sci', ['scientific', 'steam'], 'Electric light. Power plants.', c => { c.lights = 2; c.buildings.add('power'); c.researchMult *= 1.1; }),
  t('sanitation', 'Sanitation', 5, 'civ', ['medicine', 'industrialization'], 'Sewers end the great plagues.', c => { c.plagueResist += 0.3; c.growthMult *= 1.2; c.houseCap += 1; }),
  t('artillery', 'Artillery', 5, 'mil', ['rifling'], 'Long-range field guns.', () => {}),
  // ---- Modern
  t('combustion', 'Combustion Engine', 6, 'eco', ['railroad', 'electricity'], 'Oil, cars and paved roads.', c => { c.extract.add(5); c.roads = 2; c.speedMult *= 1.1; }),
  t('flight', 'Flight', 6, 'mil', ['combustion'], 'Airplanes. Unlocks Airbases.', c => { c.air = Math.max(c.air, 0); c.buildings.add('airbase'); }),
  t('automatic', 'Automatic Weapons', 6, 'mil', ['rifling', 'combustion'], 'Machine guns.', c => { c.tower = Math.max(c.tower, 2); }),
  t('motorized', 'Motorized Warfare', 6, 'mil', ['combustion', 'automatic'], 'Tanks and diesel warships roll out.', c => { c.ship = Math.max(c.ship, 5); }),
  t('radio', 'Radio', 6, 'sci', ['electricity'], 'Instant communication.', c => { c.researchMult *= 1.12; c.loyalty += 5; }),
  t('massprod', 'Mass Production', 6, 'eco', ['industrialization', 'electricity'], 'Assembly lines. Heavy bombers.', c => { c.buildMult *= 1.25; c.houseCap += 2; c.air = Math.max(c.air, c.air >= 0 ? 1 : -1); }),
  t('fertilizer', 'Fertilizers', 6, 'eco', ['sanitation', 'industrialization'], 'Chemical farming feeds billions.', c => { c.foodMult *= 1.4; }),
  // ---- Atomic
  t('fission', 'Nuclear Fission', 7, 'sci', ['radio', 'massprod'], 'Split the atom. Uranium mining.', c => { c.extract.add(6); c.researchMult *= 1.1; }),
  t('rocketry', 'Rocketry', 7, 'mil', ['flight'], 'Guided missiles defend cities.', c => { c.tower = Math.max(c.tower, 3); }),
  t('nukes', 'Nuclear Weapons', 7, 'mil', ['fission', 'rocketry'], 'The power to end worlds. Missile Silos.', c => { c.nukes = true; c.buildings.add('silo'); }),
  t('computers', 'Computers', 7, 'sci', ['radio', 'massprod'], 'Thinking machines. Research Labs.', c => { c.buildings.add('lab'); c.researchMult *= 1.15; }),
  t('jets', 'Jet Engines', 7, 'mil', ['flight', 'rocketry'], 'Supersonic jets.', c => { c.air = Math.max(c.air, 2); }),
  t('antibiotics', 'Antibiotics', 7, 'civ', ['sanitation', 'fertilizer'], 'Disease defeated.', c => { c.plagueResist += 0.3; c.lifeMult *= 1.15; c.healRate *= 1.5; }),
  // ---- Information
  t('internet', 'Internet', 8, 'sci', ['computers'], 'A world connected.', c => { c.researchMult *= 1.2; c.loyalty += 5; }),
  t('robotics', 'Robotics', 8, 'eco', ['computers', 'massprod'], 'Automated factories.', c => { c.buildMult *= 1.3; c.woodMult *= 1.3; c.mineMult *= 1.3; }),
  t('renewables', 'Renewable Energy', 8, 'eco', ['computers', 'fission'], 'Solar and wind clean the skies.', c => { c.pollution = Math.min(c.pollution, 0.3); }),
  t('genetics', 'Genetic Engineering', 8, 'civ', ['antibiotics', 'computers'], 'Engineered crops and long lives.', c => { c.foodMult *= 1.4; c.lifeMult *= 1.25; c.houseCap += 2; }),
  t('satellites', 'Satellites', 8, 'sci', ['rocketry', 'computers'], 'Eyes in orbit.', c => { c.researchMult *= 1.1; }),
  t('drones', 'Drone Warfare', 8, 'mil', ['jets', 'robotics'], 'Unmanned strike craft.', c => { c.air = Math.max(c.air, 3); }),
  t('composites', 'Advanced Composites', 8, 'mil', ['automatic', 'robotics'], 'Body armor and smart rifles.', () => {}),
  // ---- Space
  t('spaceflight', 'Space Flight', 9, 'sci', ['satellites', 'rocketry'], 'Rockets reach orbit. Spaceports.', c => { c.space = true; c.buildings.add('spaceport'); }),
  t('fusion', 'Fusion Power', 9, 'eco', ['renewables', 'fission'], 'Limitless clean energy.', c => { c.pollution = Math.min(c.pollution, 0.05); c.mineMult *= 1.3; c.houseCap += 2; }),
  t('ai', 'Artificial Intelligence', 9, 'sci', ['internet', 'robotics'], 'Minds beyond our own.', c => { c.researchMult *= 1.25; c.buildMult *= 1.3; }),
  t('lasers', 'Laser Weapons', 9, 'mil', ['composites', 'fusion'], 'Directed energy weapons.', c => { c.tower = 4; }),
  t('mechs', 'Mech Suits', 9, 'mil', ['robotics', 'composites'], 'Walking war machines.', () => {}),
  t('colonization', 'Interstellar Colonization', 9, 'sci', ['spaceflight', 'fusion', 'ai'], 'Colony ships to the stars. Launch 5 to ascend.', c => { c.colonize = true; }),
];

export const BASE_COST = 45;
export const ERA_GROWTH = 1.98;

export const TECHS: TechDef[] = RAW.map((r, i) => ({ ...r, idx: i, cost: Math.round(BASE_COST * Math.pow(ERA_GROWTH, r.era) * (r.req.length > 1 ? 1.1 : 1)) }));
export const NUM_TECH = TECHS.length;
export const TECH_BY_ID: Record<string, TechDef> = {};
for (const td of TECHS) TECH_BY_ID[td.id] = td;
export const TECH_REQ_IDX: number[][] = TECHS.map(td => td.req.map(r => {
  if (!TECH_BY_ID[r]) throw new Error('Unknown tech req ' + r);
  return TECH_BY_ID[r].idx;
}));
export const START_TECHS = ['stonetools', 'fire'];

export function techIdx(id: string): number {
  return TECH_BY_ID[id].idx;
}

export function computeCaps(known: Uint8Array): Caps {
  const c = baseCaps();
  let era = 0;
  for (let i = 0; i < NUM_TECH; i++) {
    if (known[i]) {
      TECHS[i].fx(c);
      if (TECHS[i].era > era) era = TECHS[i].era;
    }
  }
  c.era = era;
  // per-era passive improvements
  c.houseCap += Math.floor(era * 0.3);
  c.soldierRatio = 0.12 + era * 0.005;
  return c;
}

export function canResearch(known: Uint8Array, i: number): boolean {
  if (known[i]) return false;
  const r = TECH_REQ_IDX[i];
  for (let k = 0; k < r.length; k++) if (!known[r[k]]) return false;
  return true;
}

export function eraName(e: number): string {
  return ERAS[Math.max(0, Math.min(NUM_ERAS - 1, e))].name;
}

// Unit, soldier, vehicle and building definitions.

export const TPS = 20;          // simulation ticks per second at 1x
export const TPY = 120;         // ticks per year
export const ART = 4;           // art pixels per tile
export const ADULT_AGE = 14;    // years

export const UK = {
  PERSON: 0, SHEEP: 1, DEER: 2, CHICKEN: 3, WOLF: 4, BEAR: 5,
  DRAGON: 6, ZOMBIE: 7, KRAKEN: 8, GOLEM: 9, UFO: 10, BOAT: 11, PLANE: 12, FISH: 13,
} as const;
export const NUM_UK = 14;

export interface UnitDef {
  key: string;
  name: string;
  hp: number;
  atk: number;
  def: number;
  range: number;
  cd: number;
  speed: number;   // tiles / tick
  life: number;    // years
  flying?: boolean;
  aquatic?: boolean;
  herb?: boolean;
  pred?: boolean;
  monster?: boolean;
  food?: number;
  sight: number;
}

export const UDEF: UnitDef[] = [
  { key: 'person', name: 'Person', hp: 30, atk: 2, def: 0, range: 1.2, cd: 20, speed: 0.07, life: 70, sight: 5 },
  { key: 'sheep', name: 'Sheep', hp: 14, atk: 0, def: 0, range: 1, cd: 20, speed: 0.035, life: 12, herb: true, food: 6, sight: 4 },
  { key: 'deer', name: 'Deer', hp: 18, atk: 0, def: 0, range: 1, cd: 20, speed: 0.075, life: 14, herb: true, food: 7, sight: 6 },
  { key: 'chicken', name: 'Chicken', hp: 6, atk: 0, def: 0, range: 1, cd: 20, speed: 0.045, life: 6, herb: true, food: 3, sight: 3 },
  { key: 'wolf', name: 'Wolf', hp: 32, atk: 6, def: 0, range: 1.2, cd: 18, speed: 0.085, life: 14, pred: true, food: 4, sight: 8 },
  { key: 'bear', name: 'Bear', hp: 90, atk: 11, def: 1, range: 1.3, cd: 24, speed: 0.06, life: 26, pred: true, food: 12, sight: 6 },
  { key: 'dragon', name: 'Dragon', hp: 1100, atk: 34, def: 6, range: 6, cd: 36, speed: 0.11, life: 600, flying: true, monster: true, sight: 14 },
  { key: 'zombie', name: 'Zombie', hp: 40, atk: 6, def: 0, range: 1.2, cd: 22, speed: 0.045, life: 30, monster: true, sight: 9 },
  { key: 'kraken', name: 'Kraken', hp: 800, atk: 36, def: 4, range: 2.6, cd: 30, speed: 0.05, life: 400, aquatic: true, monster: true, sight: 10 },
  { key: 'golem', name: 'Stone Golem', hp: 600, atk: 26, def: 9, range: 1.6, cd: 34, speed: 0.032, life: 400, monster: true, sight: 8 },
  { key: 'ufo', name: 'Alien Saucer', hp: 300, atk: 20, def: 4, range: 6, cd: 24, speed: 0.11, life: 80, flying: true, monster: true, sight: 14 },
  { key: 'boat', name: 'Boat', hp: 90, atk: 0, def: 1, range: 0, cd: 40, speed: 0.09, life: 60, aquatic: true, sight: 8 },
  { key: 'plane', name: 'Aircraft', hp: 120, atk: 0, def: 2, range: 0, cd: 20, speed: 0.26, life: 20, flying: true, sight: 10 },
  { key: 'fish', name: 'Fish', hp: 4, atk: 0, def: 0, range: 1, cd: 20, speed: 0.04, life: 8, aquatic: true, herb: true, food: 4, sight: 3 },
];

export const JOB = {
  NONE: 0, GATHER: 1, FARM: 2, WOOD: 3, MINE: 4, BUILD: 5, SOLDIER: 6, SCHOLAR: 7, SETTLER: 8,
} as const;
export const JOB_NAMES = ['Idle', 'Gatherer', 'Farmer', 'Woodcutter', 'Miner', 'Builder', 'Soldier', 'Scholar', 'Settler'];

// ------------------------------------------------------------------ soldiers
export interface SoldierDef {
  id: string;
  name: string;
  tech: string | null;
  role: 'melee' | 'ranged' | 'siege' | 'vehicle';
  hp: number;
  atk: number;
  def: number;
  range: number;
  cd: number;
  speed: number;
  proj: 'none' | 'arrow' | 'bullet' | 'shell' | 'laser';
  aoe: number;
  weapon: string;
  needs?: number; // RES index consumed when recruited
  antiAir?: boolean;
  vehicle?: boolean;
  era: number;
}

export const SOLDIERS: SoldierDef[] = [
  { id: 'warrior', name: 'Warrior', tech: null, role: 'melee', hp: 40, atk: 5, def: 0, range: 1.3, cd: 18, speed: 1, proj: 'none', aoe: 0, weapon: 'club', era: 0 },
  { id: 'archer', name: 'Archer', tech: 'archery', role: 'ranged', hp: 34, atk: 4, def: 0, range: 5.5, cd: 28, speed: 1, proj: 'arrow', aoe: 0, weapon: 'bow', era: 0 },
  { id: 'spearman', name: 'Spearman', tech: 'bronze', role: 'melee', hp: 50, atk: 7, def: 1, range: 1.6, cd: 18, speed: 1, proj: 'none', aoe: 0, weapon: 'spear', era: 1 },
  { id: 'swordsman', name: 'Swordsman', tech: 'iron', role: 'melee', hp: 62, atk: 9, def: 2, range: 1.3, cd: 16, speed: 1, proj: 'none', aoe: 0, weapon: 'sword', era: 2 },
  { id: 'catapult', name: 'Catapult', tech: 'mathematics', role: 'siege', hp: 60, atk: 22, def: 1, range: 9, cd: 90, speed: 0.55, proj: 'shell', aoe: 1.3, weapon: 'catapult', vehicle: true, era: 2 },
  { id: 'crossbow', name: 'Crossbowman', tech: 'engineering', role: 'ranged', hp: 46, atk: 8, def: 1, range: 6.5, cd: 30, speed: 1, proj: 'arrow', aoe: 0, weapon: 'crossbow', era: 3 },
  { id: 'knight', name: 'Knight', tech: 'feudalism', role: 'melee', hp: 100, atk: 13, def: 4, range: 1.5, cd: 16, speed: 1.55, proj: 'none', aoe: 0, weapon: 'lance', era: 3 },
  { id: 'musketeer', name: 'Musketeer', tech: 'gunpowder', role: 'ranged', hp: 58, atk: 15, def: 1, range: 7, cd: 38, speed: 1, proj: 'bullet', aoe: 0, weapon: 'musket', era: 4 },
  { id: 'cannon', name: 'Cannon', tech: 'metallurgy', role: 'siege', hp: 80, atk: 34, def: 2, range: 10, cd: 75, speed: 0.6, proj: 'shell', aoe: 1.6, weapon: 'cannon', vehicle: true, era: 4 },
  { id: 'rifleman', name: 'Rifleman', tech: 'rifling', role: 'ranged', hp: 75, atk: 21, def: 2, range: 9, cd: 30, speed: 1, proj: 'bullet', aoe: 0, weapon: 'rifle', antiAir: true, era: 5 },
  { id: 'artillery', name: 'Field Artillery', tech: 'artillery', role: 'siege', hp: 90, atk: 55, def: 2, range: 14, cd: 80, speed: 0.65, proj: 'shell', aoe: 2.2, weapon: 'artillery', vehicle: true, era: 5 },
  { id: 'gunner', name: 'Machine Gunner', tech: 'automatic', role: 'ranged', hp: 85, atk: 10, def: 3, range: 9, cd: 7, speed: 0.95, proj: 'bullet', aoe: 0, weapon: 'mg', antiAir: true, era: 6 },
  { id: 'tank', name: 'Tank', tech: 'motorized', role: 'vehicle', hp: 460, atk: 48, def: 10, range: 9.5, cd: 48, speed: 1.3, proj: 'shell', aoe: 1.7, weapon: 'tank', needs: 5, vehicle: true, era: 6 },
  { id: 'infantry', name: 'Modern Infantry', tech: 'composites', role: 'ranged', hp: 115, atk: 28, def: 5, range: 10, cd: 20, speed: 1.1, proj: 'bullet', aoe: 0, weapon: 'smartgun', antiAir: true, era: 8 },
  { id: 'laser', name: 'Laser Trooper', tech: 'lasers', role: 'ranged', hp: 140, atk: 46, def: 7, range: 12, cd: 24, speed: 1.15, proj: 'laser', aoe: 0, weapon: 'laser', antiAir: true, era: 9 },
  { id: 'mech', name: 'Battle Mech', tech: 'mechs', role: 'vehicle', hp: 900, atk: 80, def: 16, range: 11, cd: 40, speed: 1.2, proj: 'laser', aoe: 1.3, weapon: 'mech', needs: 2, vehicle: true, antiAir: true, era: 9 },
  { id: 'railgunner', name: 'Railgunner', tech: 'railguns', role: 'ranged', hp: 170, atk: 70, def: 9, range: 14, cd: 28, speed: 1.2, proj: 'laser', aoe: 0, weapon: 'railgun', antiAir: true, era: 10 },
  { id: 'cyborg', name: 'Cyborg', tech: 'cybernetics', role: 'melee', hp: 320, atk: 60, def: 14, range: 1.6, cd: 12, speed: 1.5, proj: 'none', aoe: 0, weapon: 'blade', era: 10 },
  { id: 'plasma', name: 'Plasma Trooper', tech: 'plasma', role: 'ranged', hp: 230, atk: 95, def: 12, range: 13, cd: 26, speed: 1.25, proj: 'laser', aoe: 1, weapon: 'plasma', antiAir: true, era: 11 },
  { id: 'titan', name: 'Titan Walker', tech: 'titans', role: 'vehicle', hp: 3200, atk: 260, def: 30, range: 15, cd: 50, speed: 1, proj: 'laser', aoe: 2.4, weapon: 'titan', needs: 2, vehicle: true, antiAir: true, era: 12 },
];
export const SOLDIER_BY_ID: Record<string, number> = {};
SOLDIERS.forEach((s, i) => (SOLDIER_BY_ID[s.id] = i));

// ------------------------------------------------------------------ ships & aircraft
export interface VehicleDef { name: string; hp: number; atk: number; range: number; cd: number; speed: number; cap: number; proj: 'none' | 'arrow' | 'shell' | 'bullet' | 'laser'; aoe: number; }

export const SHIPS: VehicleDef[] = [
  { name: 'Raft', hp: 60, atk: 0, range: 0, cd: 40, speed: 0.07, cap: 6, proj: 'none', aoe: 0 },
  { name: 'War Galley', hp: 140, atk: 8, range: 5, cd: 40, speed: 0.08, cap: 8, proj: 'arrow', aoe: 0 },
  { name: 'Caravel', hp: 200, atk: 10, range: 6, cd: 40, speed: 0.1, cap: 10, proj: 'arrow', aoe: 0 },
  { name: 'Galleon', hp: 320, atk: 26, range: 8, cd: 60, speed: 0.1, cap: 12, proj: 'shell', aoe: 1.2 },
  { name: 'Ironclad', hp: 520, atk: 42, range: 10, cd: 60, speed: 0.12, cap: 14, proj: 'shell', aoe: 1.5 },
  { name: 'Destroyer', hp: 800, atk: 60, range: 13, cd: 50, speed: 0.15, cap: 16, proj: 'shell', aoe: 1.8 },
];

export const PLANES: VehicleDef[] = [
  { name: 'Biplane', hp: 90, atk: 30, range: 0, cd: 14, speed: 0.22, cap: 4, proj: 'shell', aoe: 1.6 },
  { name: 'Heavy Bomber', hp: 200, atk: 45, range: 0, cd: 10, speed: 0.2, cap: 8, proj: 'shell', aoe: 2.2 },
  { name: 'Jet Fighter', hp: 220, atk: 55, range: 0, cd: 8, speed: 0.38, cap: 6, proj: 'shell', aoe: 2 },
  { name: 'Strike Drone', hp: 160, atk: 70, range: 0, cd: 8, speed: 0.32, cap: 6, proj: 'shell', aoe: 2.2 },
  { name: 'Stealth Bomber', hp: 320, atk: 110, range: 0, cd: 6, speed: 0.4, cap: 12, proj: 'shell', aoe: 3 },
  { name: 'Plasma Gunship', hp: 600, atk: 170, range: 0, cd: 5, speed: 0.42, cap: 14, proj: 'shell', aoe: 3.4 },
];

// ------------------------------------------------------------------ buildings
export interface BldDef {
  key: string;
  name: string;
  w: number;
  h: number;
  hp: number;
  cost: number[];       // per RES index
  req: string | null;
  cap: number;          // housing
  research: number;     // flat research per year
  max: number;          // per city
  minPop: number;
  work: number;         // construction effort
  place: 'center' | 'near' | 'edge' | 'coast' | 'mine';
  pollution: number;
  desc: string;
}

const c = (wood = 0, stone = 0, metal = 0, gold = 0, coal = 0, oil = 0, uranium = 0) => [wood, stone, metal, gold, coal, oil, uranium];

export const BLD: Record<string, BldDef> = {
  center: { key: 'center', name: 'Town Center', w: 3, h: 3, hp: 700, cost: c(), req: null, cap: 6, research: 0.5, max: 1, minPop: 0, work: 60, place: 'center', pollution: 0, desc: 'Heart of the settlement.' },
  house: { key: 'house', name: 'House', w: 2, h: 2, hp: 140, cost: c(6), req: null, cap: 0, research: 0, max: 60, minPop: 0, work: 30, place: 'near', pollution: 0, desc: 'Homes for citizens.' },
  temple: { key: 'temple', name: 'Temple', w: 2, h: 2, hp: 260, cost: c(10, 12), req: 'mysticism', cap: 0, research: 0.3, max: 1, minPop: 9, work: 60, place: 'near', pollution: 0, desc: 'Raises loyalty.' },
  mine: { key: 'mine', name: 'Mine', w: 2, h: 2, hp: 200, cost: c(10), req: 'mining', cap: 0, research: 0, max: 2, minPop: 7, work: 45, place: 'mine', pollution: 0, desc: 'Extracts stone and ores.' },
  barracks: { key: 'barracks', name: 'Barracks', w: 2, h: 2, hp: 320, cost: c(14, 10), req: 'bronze', cap: 0, research: 0, max: 1, minPop: 14, work: 60, place: 'near', pollution: 0, desc: 'Trains more soldiers.' },
  library: { key: 'library', name: 'Library', w: 2, h: 2, hp: 220, cost: c(16, 12), req: 'writing', cap: 0, research: 2, max: 1, minPop: 12, work: 70, place: 'near', pollution: 0, desc: 'Scholars research here.' },
  tower: { key: 'tower', name: 'Watchtower', w: 1, h: 1, hp: 300, cost: c(4, 16), req: 'masonry', cap: 0, research: 0, max: 4, minPop: 16, work: 50, place: 'edge', pollution: 0, desc: 'Defends the borders.' },
  docks: { key: 'docks', name: 'Docks', w: 2, h: 2, hp: 240, cost: c(20, 4), req: 'sailing', cap: 0, research: 0, max: 1, minPop: 10, work: 60, place: 'coast', pollution: 0, desc: 'Builds ships, catches fish.' },
  forge: { key: 'forge', name: 'Forge', w: 2, h: 2, hp: 260, cost: c(10, 16, 4), req: 'iron', cap: 0, research: 0.3, max: 1, minPop: 18, work: 60, place: 'near', pollution: 0, desc: 'Better weapons.' },
  market: { key: 'market', name: 'Market', w: 2, h: 2, hp: 220, cost: c(18, 12), req: 'currency', cap: 0, research: 0.5, max: 1, minPop: 20, work: 60, place: 'near', pollution: 0, desc: 'Trade brings gold.' },
  castle: { key: 'castle', name: 'Castle', w: 3, h: 3, hp: 1600, cost: c(20, 60, 10), req: 'feudalism', cap: 4, research: 0, max: 1, minPop: 30, work: 150, place: 'near', pollution: 0, desc: 'A mighty stronghold.' },
  university: { key: 'university', name: 'University', w: 3, h: 2, hp: 320, cost: c(30, 40, 6, 10), req: 'education', cap: 0, research: 5, max: 1, minPop: 26, work: 110, place: 'near', pollution: 0, desc: 'Big research boost.' },
  hospital: { key: 'hospital', name: 'Hospital', w: 2, h: 2, hp: 300, cost: c(20, 30, 6), req: 'medicine', cap: 0, research: 0.5, max: 1, minPop: 26, work: 90, place: 'near', pollution: 0, desc: 'Heals and fights plague.' },
  factory: { key: 'factory', name: 'Factory', w: 3, h: 2, hp: 500, cost: c(20, 40, 25, 0, 10), req: 'industrialization', cap: 0, research: 1, max: 2, minPop: 28, work: 120, place: 'near', pollution: 3, desc: 'Production. Pollutes.' },
  power: { key: 'power', name: 'Power Plant', w: 2, h: 2, hp: 500, cost: c(10, 40, 30, 0, 20), req: 'electricity', cap: 0, research: 1, max: 1, minPop: 36, work: 120, place: 'near', pollution: 4, desc: 'Electricity. Coal pollutes.' },
  airbase: { key: 'airbase', name: 'Airbase', w: 3, h: 3, hp: 700, cost: c(10, 60, 50, 0, 0, 20), req: 'flight', cap: 0, research: 0, max: 1, minPop: 45, work: 150, place: 'edge', pollution: 1, desc: 'Launches air strikes.' },
  lab: { key: 'lab', name: 'Research Lab', w: 2, h: 2, hp: 400, cost: c(0, 50, 50, 20), req: 'computers', cap: 0, research: 10, max: 1, minPop: 40, work: 140, place: 'near', pollution: 0, desc: 'Modern science.' },
  silo: { key: 'silo', name: 'Missile Silo', w: 2, h: 2, hp: 900, cost: c(0, 80, 80, 20, 0, 20, 10), req: 'nukes', cap: 0, research: 0, max: 1, minPop: 50, work: 180, place: 'edge', pollution: 0, desc: 'Nuclear deterrent.' },
  spaceport: { key: 'spaceport', name: 'Spaceport', w: 3, h: 3, hp: 1000, cost: c(0, 100, 120, 40, 0, 40), req: 'spaceflight', cap: 0, research: 10, max: 1, minPop: 55, work: 220, place: 'edge', pollution: 0, desc: 'Rockets to the stars.' },
};
export const BLD_KEYS = Object.keys(BLD);

export function houseCapacity(style: number, capsHouse: number): number {
  return Math.max(2, Math.min(20, Math.round(capsHouse * (0.6 + style * 0.05))));
}

export function buildingMaxHp(def: BldDef, style: number): number {
  return Math.round(def.hp * (1 + style * 0.35));
}

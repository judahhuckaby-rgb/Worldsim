// Terrain, flora and deposit definitions.

export const T = {
  DEEP: 0, WATER: 1, SHALLOW: 2, SAND: 3,
  GRASS: 4, JUNGLE: 5, SAVANNA: 6, DESERT: 7, SWAMP: 8, TUNDRA: 9, SNOW: 10,
  HILLS: 11, MOUNTAIN: 12, PEAK: 13,
  LAVA: 14, ASH: 15, WASTE: 16, ROAD: 17, FARM: 18, ICE: 19, PAVED: 20,
} as const;
export const NUM_TER = 21;

export interface TerDef {
  key: string;
  name: string;
  color: [number, number, number];
  elev: number;       // 0 deep .. 7 peak
  water: boolean;
  move: number;       // movement multiplier, 0 = impassable for land units
  build: boolean;     // can place buildings
  burn: number;       // flammability of ground cover 0..1
  fert: number;       // farm fertility 0..1
}

const D = (key: string, name: string, color: [number, number, number], elev: number, water: boolean, move: number, build: boolean, burn: number, fert: number): TerDef =>
  ({ key, name, color, elev, water, move, build, burn, fert });

export const TER: TerDef[] = [
  D('deep', 'Deep Ocean', [22, 52, 104], 0, true, 0, false, 0, 0),
  D('water', 'Ocean', [33, 84, 156], 1, true, 0, false, 0, 0),
  D('shallow', 'Shallows', [58, 128, 196], 2, true, 0, false, 0, 0),
  D('sand', 'Beach', [226, 208, 150], 3, false, 0.9, true, 0, 0.2),
  D('grass', 'Grassland', [96, 168, 60], 4, false, 1, true, 0.25, 1),
  D('jungle', 'Jungle', [44, 134, 62], 4, false, 0.75, true, 0.15, 0.9),
  D('savanna', 'Savanna', [170, 174, 76], 4, false, 1, true, 0.45, 0.7),
  D('desert', 'Desert', [224, 184, 108], 4, false, 0.8, true, 0.02, 0.12),
  D('swamp', 'Swamp', [82, 106, 62], 4, false, 0.55, true, 0.05, 0.5),
  D('tundra', 'Tundra', [140, 160, 146], 4, false, 0.85, true, 0.1, 0.3),
  D('snow', 'Snowfield', [236, 242, 247], 4, false, 0.65, true, 0, 0.08),
  D('hills', 'Hills', [128, 136, 82], 5, false, 0.65, true, 0.15, 0.4),
  D('mountain', 'Mountain', [122, 112, 104], 6, false, 0.4, false, 0, 0),
  D('peak', 'Peak', [220, 224, 230], 7, false, 0, false, 0, 0),
  D('lava', 'Lava', [255, 96, 32], 4, false, 0.5, false, 0, 0),
  D('ash', 'Ashland', [74, 70, 68], 4, false, 0.9, true, 0, 0.8),
  D('waste', 'Wasteland', [112, 100, 72], 4, false, 0.9, true, 0, 0),
  D('road', 'Road', [158, 132, 98], 4, false, 1.5, false, 0, 0),
  D('farm', 'Farmland', [140, 104, 56], 4, false, 0.9, true, 0, 1),
  D('ice', 'Ice', [206, 230, 244], 2, false, 0.7, false, 0, 0),
  D('paved', 'Paved Road', [88, 88, 94], 4, false, 1.9, false, 0, 0),
];

/** Biome land types a tile can "remember" (restored when raised above water). */
export const BIOMES = [T.GRASS, T.JUNGLE, T.SAVANNA, T.DESERT, T.SWAMP, T.TUNDRA, T.SNOW];

export function isWaterT(t: number): boolean {
  return t <= 2;
}
export function isFlatLand(t: number): boolean {
  return TER[t].elev === 4;
}

export const F = {
  NONE: 0, OAK: 1, PINE: 2, PALM: 3, JTREE: 4, BUSH: 5, CACTUS: 6, STREE: 7, CROP: 8, DEAD: 9, FLOWER: 10,
} as const;
export const FLORA_NAMES = ['None', 'Oak Tree', 'Pine Tree', 'Palm Tree', 'Jungle Tree', 'Berry Bush', 'Cactus', 'Swamp Tree', 'Crops', 'Dead Tree', 'Flowers'];

export function isTree(f: number): boolean {
  return f === F.OAK || f === F.PINE || f === F.PALM || f === F.JTREE || f === F.STREE || f === F.DEAD;
}

/** Tree type appropriate for a terrain. */
export function treeFor(t: number): number {
  switch (t) {
    case T.GRASS: return F.OAK;
    case T.JUNGLE: return F.JTREE;
    case T.SAVANNA: return F.OAK;
    case T.DESERT: return F.CACTUS;
    case T.SWAMP: return F.STREE;
    case T.TUNDRA: case T.SNOW: return F.PINE;
    case T.HILLS: return F.PINE;
    case T.SAND: return F.PALM;
    case T.ASH: return F.OAK;
    default: return F.NONE;
  }
}

/** Deposits. */
export const R = { NONE: 0, ORE: 1, GOLD: 2, COAL: 3, OIL: 4, URANIUM: 5 } as const;
export const DEPOSIT_NAMES = ['', 'Iron Ore', 'Gold', 'Coal', 'Oil', 'Uranium'];

/** Kingdom resource pool indices. */
export const RES = { WOOD: 0, STONE: 1, METAL: 2, GOLD: 3, COAL: 4, OIL: 5, URANIUM: 6 } as const;
export const RES_NAMES = ['Wood', 'Stone', 'Metal', 'Gold', 'Coal', 'Oil', 'Uranium'];
export const RES_ICONS = ['🪵', '🪨', '⚙️', '🪙', '⚫', '🛢️', '☢️'];
export const NUM_RES = 7;

export function depositToRes(d: number): number {
  switch (d) {
    case R.ORE: return RES.METAL;
    case R.GOLD: return RES.GOLD;
    case R.COAL: return RES.COAL;
    case R.OIL: return RES.OIL;
    case R.URANIUM: return RES.URANIUM;
  }
  return RES.STONE;
}

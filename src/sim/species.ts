// Playable species and name generation.
import { RNG } from '../core/rng';
import { T } from './terrain';

export interface SpeciesDef {
  id: number;
  key: string;
  name: string;
  adj: string;
  desc: string;
  skin: [number, number, number];
  hair: [number, number, number];
  hp: number;
  atk: number;
  speed: number;
  research: number;
  breed: number;
  life: number;       // lifespan in years
  aggression: number;
  mine: number;
  build: number;
  prefers: number[];
  chopsTrees: number; // multiplier on woodcutter allocation
  roof: [number, number, number];
  wall: [number, number, number];
  syl: { a: string[]; b: string[]; c: string[] };
  techBias: Record<string, number>;
}

export const SPECIES: SpeciesDef[] = [
  {
    id: 0, key: 'human', name: 'Humans', adj: 'Human',
    desc: 'Adaptable and ambitious. Balanced at everything, they spread fast across open plains.',
    skin: [232, 186, 150], hair: [92, 60, 36],
    hp: 1, atk: 1, speed: 1, research: 1.05, breed: 1.05, life: 72, aggression: 1.0, mine: 1, build: 1,
    prefers: [T.GRASS, T.SAVANNA], chopsTrees: 1,
    roof: [178, 64, 52], wall: [214, 190, 150],
    syl: { a: ['Al', 'Bran', 'Cor', 'Ed', 'Har', 'Mar', 'Ost', 'Rav', 'Sel', 'Tor', 'Wen', 'Ald', 'Bel', 'Dun', 'Eld', 'Fen', 'Lor'], b: ['a', 'e', 'i', 'o', 'en', 'an', 'ri', 'ar', 'or', 'el'], c: ['ford', 'wick', 'ton', 'mere', 'dale', 'ham', 'bury', 'ric', 'mund', 'win', 'ard', 'gate', 'hold'] },
    techBias: { eco: 1.1, mil: 1, sci: 1, civ: 1.1 },
  },
  {
    id: 1, key: 'verdani', name: 'Verdani', adj: 'Verdani',
    desc: 'Long-lived forest folk. Brilliant scholars who breed slowly and spare the trees.',
    skin: [214, 226, 190], hair: [70, 140, 70],
    hp: 0.85, atk: 0.9, speed: 1.1, research: 1.3, breed: 0.75, life: 160, aggression: 0.45, mine: 0.8, build: 0.95,
    prefers: [T.JUNGLE, T.GRASS], chopsTrees: 0.5,
    roof: [62, 128, 72], wall: [196, 170, 120],
    syl: { a: ['Ae', 'Syl', 'Thal', 'Ili', 'Lae', 'Nym', 'Ely', 'Fae', 'Ith', 'Lu', 'Myr', 'Orl', 'Vael'], b: ['a', 'ae', 'ie', 'ya', 'el', 'il', 'ra', 'li', 'nu'], c: ['wyn', 'thas', 'riel', 'lith', 'dor', 'nara', 'vel', 'sin', 'loth', 'ien', 'mar'] },
    techBias: { eco: 1, mil: 0.7, sci: 1.5, civ: 1.2 },
  },
  {
    id: 2, key: 'stonekin', name: 'Stonekin', adj: 'Stonekin',
    desc: 'Stout mountain clans. Tough, master miners and builders, slow on their feet.',
    skin: [206, 150, 120], hair: [150, 80, 40],
    hp: 1.35, atk: 1.1, speed: 0.85, research: 1.0, breed: 0.9, life: 115, aggression: 0.85, mine: 1.7, build: 1.35,
    prefers: [T.HILLS, T.TUNDRA, T.GRASS], chopsTrees: 1,
    roof: [110, 110, 124], wall: [160, 140, 120],
    syl: { a: ['Dur', 'Bor', 'Thra', 'Grim', 'Kaz', 'Mor', 'Bal', 'Dwa', 'Thor', 'Brom', 'Kil', 'Nor', 'Hal'], b: ['a', 'u', 'o', 'in', 'ur', 'ak', 'im', 'om'], c: ['din', 'grim', 'dur', 'gar', 'mek', 'rak', 'hold', 'deep', 'forge', 'heim', 'bek'] },
    techBias: { eco: 1.3, mil: 1, sci: 0.9, civ: 1 },
  },
  {
    id: 3, key: 'grukh', name: 'Grukh', adj: 'Grukh',
    desc: 'Tusked warrior hordes. Strong and fast-breeding, quick to war, slower to learn.',
    skin: [118, 150, 92], hair: [40, 40, 32],
    hp: 1.2, atk: 1.35, speed: 1.0, research: 0.82, breed: 1.4, life: 52, aggression: 2.0, mine: 1.1, build: 0.9,
    prefers: [T.SAVANNA, T.DESERT, T.GRASS], chopsTrees: 1.3,
    roof: [120, 70, 40], wall: [150, 120, 90],
    syl: { a: ['Gor', 'Zug', 'Mak', 'Thrak', 'Ug', 'Kro', 'Gash', 'Rok', 'Brug', 'Nar', 'Skar', 'Vok', 'Dra'], b: ['a', 'u', 'o', 'ag', 'ug', 'ok', 'ar', 'uz'], c: ['gul', 'nak', 'rok', 'dush', 'gar', 'mog', 'tuk', 'zag', 'grod', 'buk', 'thar'] },
    techBias: { eco: 0.9, mil: 1.6, sci: 0.8, civ: 0.8 },
  },
];

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function personName(rng: RNG, sp: SpeciesDef): string {
  const s = sp.syl;
  let n = rng.pick(s.a);
  if (rng.chance(0.6)) n += rng.pick(s.b);
  n += rng.chance(0.5) ? rng.pick(s.c) : '';
  if (n.length < 3) n += rng.pick(s.b);
  return cap(n.toLowerCase());
}

export function placeName(rng: RNG, sp: SpeciesDef): string {
  const s = sp.syl;
  let n = rng.pick(s.a) + (rng.chance(0.5) ? rng.pick(s.b) : '') + rng.pick(s.c);
  return cap(n.toLowerCase());
}

/** Kingdom colors: distinct, readable on terrain. */
export const KINGDOM_COLORS: [number, number, number][] = [
  [220, 50, 50], [40, 110, 230], [240, 200, 30], [150, 60, 200], [30, 190, 170], [250, 130, 30],
  [230, 80, 170], [120, 220, 60], [255, 255, 255], [20, 20, 30], [140, 90, 50], [100, 200, 255],
  [190, 30, 90], [60, 150, 60], [255, 160, 160], [90, 80, 220], [200, 200, 120], [0, 130, 130],
];

/** Government titles that evolve with technology era. */
export function kingdomTitle(baseName: string, era: number, speciesId: number, ascended: boolean): string {
  if (ascended) return `Stellar Concord of ${baseName}`;
  const grukh = speciesId === 3;
  switch (era) {
    case 0: return grukh ? `${baseName} Horde` : `Tribe of ${baseName}`;
    case 1: return grukh ? `${baseName} Warband` : `Chiefdom of ${baseName}`;
    case 2: return `Kingdom of ${baseName}`;
    case 3: return grukh ? `${baseName} Dominion` : `Kingdom of ${baseName}`;
    case 4: return `${baseName} Empire`;
    case 5: return grukh ? `${baseName} Iron Empire` : `Republic of ${baseName}`;
    case 6: return grukh ? `${baseName} War State` : `${baseName} Republic`;
    case 7: return `${baseName} Federation`;
    case 8: return `United ${baseName}`;
    case 9: return `${baseName} Star Union`;
    case 10: return grukh ? `${baseName} Void Horde` : `${baseName} Solar Commonwealth`;
    case 11: return `${baseName} Collective`;
    default: return grukh ? `${baseName} Star Dominion` : `Galactic Republic of ${baseName}`;
  }
}

/** Traits */
export const TRAITS = [
  { key: 'strong', name: 'Strong', desc: '+30% attack' },
  { key: 'tough', name: 'Tough', desc: '+30% health' },
  { key: 'swift', name: 'Swift', desc: '+25% speed' },
  { key: 'wise', name: 'Wise', desc: '+50% research as scholar' },
  { key: 'brave', name: 'Brave', desc: 'Never flees' },
  { key: 'longlived', name: 'Long-lived', desc: '+40% lifespan' },
  { key: 'frail', name: 'Frail', desc: '-25% health' },
  { key: 'lazy', name: 'Lazy', desc: 'Works slower' },
  { key: 'genius', name: 'Genius', desc: 'Triple research as scholar' },
  { key: 'warlike', name: 'Warlike', desc: '+20% attack, picks fights' },
];
export const TR = {
  STRONG: 1 << 0, TOUGH: 1 << 1, SWIFT: 1 << 2, WISE: 1 << 3, BRAVE: 1 << 4,
  LONGLIVED: 1 << 5, FRAIL: 1 << 6, LAZY: 1 << 7, GENIUS: 1 << 8, WARLIKE: 1 << 9,
};

export function randomTraits(rng: RNG): number {
  let t = 0;
  const n = rng.chance(0.55) ? (rng.chance(0.3) ? 2 : 1) : 0;
  for (let i = 0; i < n; i++) {
    const k = rng.int(TRAITS.length);
    if (k === 8 && !rng.chance(0.15)) continue; // genius is rare
    t |= 1 << k;
  }
  if ((t & TR.TOUGH) && (t & TR.FRAIL)) t &= ~TR.FRAIL;
  return t;
}

export function traitList(t: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < TRAITS.length; i++) if (t & (1 << i)) out.push(TRAITS[i].name);
  return out;
}

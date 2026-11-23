// Core entity classes.
import { BldDef } from './defs';
import { Caps, baseCaps, NUM_TECH } from './tech';
import { NUM_RES } from './terrain';

export class Unit {
  id: number;
  kind: number;
  species = -1;
  x: number;
  y: number;
  hp = 10;
  maxHp = 10;
  atk = 1;
  def = 0;
  range = 1.2;
  cdMax = 20;
  cd = 0;
  speed = 0.07;
  ageT = 0;
  lifeT = 1e9;
  kingdom: Kingdom | null = null;
  city: City | null = null;
  job = 0;
  phase = 0;
  timer = 0;
  thinkT = 0;
  path: number[] | null = null;
  pathI = 0;
  tx = 0;
  ty = 0;
  tUnit: Unit | null = null;
  tBld: Building | null = null;
  tBld0: Building | null = null; // construction site being worked
  tTile = -1;
  carry = -1;       // -1 none, 100 = food, else RES index
  carryAmt = 0;
  name = '';
  traits = 0;
  level = 1;
  xp = 0;
  kills = 0;
  sclass = -1;      // soldier class index
  vclass = 0;       // ship/plane class
  facing = 1;
  anim = 0;
  moving = false;
  blessT = 0;
  curseT = 0;
  madT = 0;
  plague = 0;
  immune = 0;
  order: Order | null = null;
  cargo: Unit[] | null = null;
  inBoat: Unit | null = null;
  dead = false;
  isKing = false;
  hunger = 0;
  homeX = 0;
  homeY = 0;
  mission = 0;      // vehicles: mission type
  mx = 0;           // mission target
  my = 0;
  stuck = 0;
  pathFailT = 0;
  lastX = 0;
  lastY = 0;
  hitFlash = 0;
  bornYear = 0;
  z = 0;            // flight altitude (visual)

  constructor(id: number, kind: number, x: number, y: number) {
    this.id = id;
    this.kind = kind;
    this.x = x;
    this.y = y;
    this.homeX = x;
    this.homeY = y;
    this.thinkT = id % 10;
  }
}

export interface Order {
  type: number;     // 1 attack city, 2 defend, 3 settle, 4 muster at a rally point
  city: City | null;
  x: number;
  y: number;
  since: number;
}
export const ORD = { ATTACK: 1, DEFEND: 2, SETTLE: 3, MUSTER: 4 } as const;

/** A national military campaign: the army gathers near the front, then marches on one city. */
export interface Campaign {
  target: City;
  rx: number;          // rally point
  ry: number;
  phase: number;       // 0 mustering, 1 marching / besieging
  since: number;       // tick the current phase began
  size: number;        // soldiers committed
  taken: number;       // cities captured during this campaign chain
  ax: number;          // army position (centroid), for the war map
  ay: number;
}

export class Building {
  id: number;
  type: string;
  def: BldDef;
  city: City;
  x: number;
  y: number;
  w: number;
  h: number;
  hp: number;
  maxHp: number;
  progress = 0;
  style = 0;
  dead = false;
  timer = 0;
  burning = 0;

  constructor(id: number, def: BldDef, city: City, x: number, y: number, style: number, maxHp: number) {
    this.id = id;
    this.type = def.key;
    this.def = def;
    this.city = city;
    this.x = x;
    this.y = y;
    this.w = def.w;
    this.h = def.h;
    this.style = style;
    this.maxHp = maxHp;
    this.hp = maxHp;
    this.timer = id % 30;
  }
  get cx(): number { return this.x + this.w / 2; }
  get cy(): number { return this.y + this.h / 2; }
}

export class City {
  id: number;
  name: string;
  kingdom: Kingdom;
  x: number;
  y: number;
  center: Building | null = null;
  members: Unit[] = [];
  tiles: number[] = [];
  buildings: Building[] = [];
  farms: number[] = [];
  food = 30;
  loyalty = 60;
  founded = 0;
  revoltT = 0;
  dead = false;
  t = 0;
  starving = false;
  lastAttacked = -9999;
  launchT = 0;
  capacity = 6;
  roadDone = 0;
  t2 = 0;
  emptyT = 0;
  conquered = 0;
  fish = -2;
  fishT = 0;
  skip = new Map<string, number>();

  constructor(id: number, name: string, kingdom: Kingdom, x: number, y: number) {
    this.id = id;
    this.name = name;
    this.kingdom = kingdom;
    this.x = x;
    this.y = y;
    this.t = id % 20;
  }
  get pop(): number { return this.members.length; }
  get level(): number {
    const p = this.members.length;
    return p < 15 ? 0 : p < 40 ? 1 : p < 90 ? 2 : 3;
  }
  get levelName(): string {
    return ['Village', 'Town', 'City', 'Metropolis'][this.level];
  }
  count(type: string): number {
    let n = 0;
    for (const b of this.buildings) if (b.type === type) n++;
    return n;
  }
  has(type: string): boolean {
    for (const b of this.buildings) if (b.type === type && b.progress >= 1) return true;
    return false;
  }
  find(type: string): Building | null {
    for (const b of this.buildings) if (b.type === type && b.progress >= 1) return b;
    return null;
  }
}

export interface Relation {
  opinion: number;
  war: boolean;
  warStart: number;
  ally: boolean;
  truce: number;
  exhaustion: number;
  memory: number;
  trade: boolean;     // trade agreement
  nap: number;        // non-aggression pact valid until tick
  warScore: number;   // our success in the current war
}

export interface InfraProject {
  kind: 'road' | 'rail' | 'highway' | 'pave';
  path: number[];
  i: number;
  key: string;
}

export class Kingdom {
  id: number;
  baseName: string;
  species: number;
  color: [number, number, number];
  css: string;
  cities: City[] = [];
  capital: City | null = null;
  techs = new Uint8Array(NUM_TECH);
  techCount = 0;
  researching = -1;
  progress = 0;
  era = 0;
  caps: Caps = baseCaps();
  res: number[] = new Array(NUM_RES).fill(0);
  rel = new Map<number, Relation>();
  alive = true;
  founded = 0;
  king: Unit | null = null;
  launches = 0;
  ascended = false;
  t = 0;
  pop = 0;
  soldiers = 0;
  strength = 0;
  researchRate = 0;
  nukesLaunched = 0;
  planeT = 0;
  shipT = 0;
  diedYear = -1;
  peakPop = 0;
  eraYears: number[] = [];
  t2 = 0;
  colonyShips = 0;
  warCount = 0;
  warheads = 0;
  nuclearTested = false;
  nukedBy = 0;        // kingdom id that last nuked us (for retaliation)
  nukedAt = 0;
  lastLaunch = -99999;
  splitCD = 0;
  infra: InfraProject | null = null;
  links = new Set<string>();
  blackoutT = 0;          // solar flare: grid down until this tick
  player = false;         // commanded by the player
  mobilizeT = 0;          // general mobilization until this tick
  campaign: Campaign | null = null;
  lastConquest = -99999;  // tick of the last city taken in war

  constructor(id: number, baseName: string, species: number, color: [number, number, number]) {
    this.id = id;
    this.baseName = baseName;
    this.species = species;
    this.color = color;
    this.css = `rgb(${color[0]},${color[1]},${color[2]})`;
    this.t = id % 30;
  }

  relation(other: Kingdom): Relation {
    let r = this.rel.get(other.id);
    if (!r) {
      r = { opinion: 0, war: false, warStart: 0, ally: false, truce: 0, exhaustion: 0, memory: 0, trade: false, nap: 0, warScore: 0 };
      this.rel.set(other.id, r);
    }
    return r;
  }
  atWar(other: Kingdom | null): boolean {
    if (!other || other === this) return false;
    const r = this.rel.get(other.id);
    return !!r && r.war;
  }
  get wars(): number {
    let n = 0;
    for (const r of this.rel.values()) if (r.war) n++;
    return n;
  }
}

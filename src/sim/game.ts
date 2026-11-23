// Game: owns the world and all entities and advances the simulation.
import { RNG, clamp } from '../core/rng';
import { World } from './world';
import { Pathfinder } from './pathfind';
import { Unit, Building, City, Kingdom, ORD } from './entities';
import { UK, UDEF, NUM_UK, TPY, ADULT_AGE, SOLDIERS, BLD, BldDef, buildingMaxHp, houseCapacity, SHIPS, PLANES } from './defs';
import { T, F, TER, RES, isTree } from './terrain';
import { SPECIES, personName, placeName, KINGDOM_COLORS, randomTraits, TR, kingdomTitle } from './species';
import { TECHS, computeCaps, START_TECHS, techIdx, eraName, NUM_TECH, ERAS } from './tech';
import { updateUnit, refreshStats } from './ai_units';
import { updateCity } from './ai_city';
import { updateKingdom } from './ai_kingdom';
import { updateDisasters, Disaster, randomDisaster, startFallout, asteroidImpact } from './disasters';
import { environmentTick } from './environment';
import { updateWorldPolitics, Council, Accord, climateSigned } from './politics';
import { pruneLinks } from './infra';

export interface Laws {
  research: boolean;
  disasters: boolean;
  nukes: boolean;
  climate: boolean;
  dayNight: boolean;
  oldAge: boolean;
  animals: boolean;
  rebellions: boolean;
  plague: boolean;
  war: boolean;
  maxPop: number;
  researchSpeed: number;
  startEra: number;
  nukeDoctrine: number; // 0 restrained, 1 realistic, 2 trigger-happy
}

/** Population limit that suits a world of n tiles. */
export function suggestedMaxPop(n: number, mobile = false): number {
  const v = Math.round((n / 25) * (mobile ? 0.75 : 1) / 250) * 250;
  return Math.max(1750, Math.min(mobile ? 9000 : 16000, v));
}

export function defaultLaws(): Laws {
  return {
    research: true, disasters: true, nukes: true, climate: true, dayNight: true, oldAge: true, animals: true,
    rebellions: true, plague: true, war: true, maxPop: 3000, researchSpeed: 1, startEra: 0, nukeDoctrine: 1,
  };
}

export const P = { ARROW: 0, SHELL: 1, BOMB: 2, MISSILE: 3, FIREBALL: 4, METEOR: 5, CRUISE: 6, ORBITAL: 7 } as const;

export interface Projectile {
  kind: number;
  sx: number; sy: number;
  tx: number; ty: number;
  x: number; y: number;
  t: number;
  dur: number;
  dmg: number;
  aoe: number;
  owner: Kingdom | null;
  src: Unit | null;
  target: Unit | null;
  arc: number;
  z: number;
  dead: boolean;
}

/** Visual events consumed by the renderer. */
export interface Fx {
  kind: string;
  x: number;
  y: number;
  x2?: number;
  y2?: number;
  r?: number;
  color?: string;
  text?: string;
}

export interface HistoryEntry {
  year: number;
  text: string;
  kind: string;
  x: number;
  y: number;
  color: string;
}

class Spatial {
  cs = 8;
  cw: number;
  ch: number;
  cells: Unit[][];
  danger: Uint8Array;
  constructor(w: number, h: number) {
    this.cw = Math.ceil(w / this.cs);
    this.ch = Math.ceil(h / this.cs);
    this.cells = [];
    for (let i = 0; i < this.cw * this.ch; i++) this.cells.push([]);
    this.danger = new Uint8Array(this.cw * this.ch);
  }
  rebuild(units: Unit[]): void {
    const cells = this.cells;
    for (let i = 0; i < cells.length; i++) cells[i].length = 0;
    const danger = this.danger;
    danger.fill(0);
    const cw = this.cw, ch = this.ch, inv = 1 / this.cs;
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      if (u.dead || u.inBoat) continue;
      let cx = (u.x * inv) | 0, cy = (u.y * inv) | 0;
      if (cx < 0) cx = 0; else if (cx >= cw) cx = cw - 1;
      if (cy < 0) cy = 0; else if (cy >= ch) cy = ch - 1;
      const ci = cy * cw + cx;
      cells[ci].push(u);
      if (u.madT > 0) danger[ci] = 1;
      else if (u.kind === 0) { if (u.job === 6 && u.kingdom !== null && u.kingdom.warCount > 0) danger[ci] = 1; }
      else {
        const d = UDEF[u.kind];
        if (d.monster || d.pred || (u.kingdom !== null && u.kingdom.warCount > 0)) danger[ci] = 1;
      }
    }
  }
  /** Is there any potentially hostile unit near (x,y)? */
  anyDanger(x: number, y: number, r: number): boolean {
    const cs = this.cs;
    let x0 = ((x - r) / cs) | 0, x1 = ((x + r) / cs) | 0, y0 = ((y - r) / cs) | 0, y1 = ((y + r) / cs) | 0;
    if (x0 < 0) x0 = 0; if (y0 < 0) y0 = 0;
    if (x1 >= this.cw) x1 = this.cw - 1; if (y1 >= this.ch) y1 = this.ch - 1;
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) if (this.danger[cy * this.cw + cx]) return true;
    return false;
  }
  query(x: number, y: number, r: number, fn: (u: Unit, d2: number) => boolean | void): void {
    const cs = this.cs;
    let x0 = Math.floor((x - r) / cs), x1 = Math.floor((x + r) / cs), y0 = Math.floor((y - r) / cs), y1 = Math.floor((y + r) / cs);
    if (x0 < 0) x0 = 0; if (y0 < 0) y0 = 0;
    if (x1 >= this.cw) x1 = this.cw - 1; if (y1 >= this.ch) y1 = this.ch - 1;
    const r2 = r * r;
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const cell = this.cells[cy * this.cw + cx];
        for (let k = 0; k < cell.length; k++) {
          const u = cell[k];
          if (u.dead) continue;
          const dx = u.x - x, dy = u.y - y;
          const d2 = dx * dx + dy * dy;
          if (d2 <= r2 && fn(u, d2) === true) return;
        }
      }
    }
  }
}

export class Game {
  world: World;
  rng: RNG;
  pf: Pathfinder;
  spatial: Spatial;
  tick = 0;
  nextId = 1;
  units: Unit[] = [];
  unitById = new Map<number, Unit>();
  buildings: Building[] = [];
  bldById = new Map<number, Building>();
  cities: City[] = [];
  cityById = new Map<number, City>();
  kingdoms: Kingdom[] = [];
  allKingdoms: Kingdom[] = [];
  kingdomById = new Map<number, Kingdom>();
  projectiles: Projectile[] = [];
  disasters: Disaster[] = [];
  fx: Fx[] = [];
  history: HistoryEntry[] = [];
  toasts: HistoryEntry[] = [];
  laws: Laws = defaultLaws();
  carbon = 0;
  pathBudget = 0;
  kindCount = new Int32Array(NUM_UK);
  shake = 0;
  flash = 0;
  seed: number;
  mapType = 'continents';
  colorI = 0;
  personPop = 0;
  popHistory: { year: number; pop: number; kingdoms: number; maxEra: number }[] = [];
  headless = false;
  stats = { births: 0, deaths: 0, wars: 0, nukes: 0, citiesFounded: 0 };
  council: Council | null = null;
  accords: Accord[] = [];
  nuclearWinter = 0;
  combatNukes = 0;
  lastNukeYear = -1;
  nukeFreeAnnounced = false;
  treaties = 0;
  lastTopo = -9999;
  worldEra = 0;
  flareT = 0;

  constructor(world: World, seed: number) {
    this.world = world;
    this.seed = seed;
    this.rng = new RNG(seed ^ 0x5bd1e995);
    this.pf = new Pathfinder(world.w, world.h);
    this.spatial = new Spatial(world.w, world.h);
  }

  get year(): number {
    return Math.floor(this.tick / TPY);
  }
  get heat(): number {
    return this.carbon / 4000;
  }

  newId(): number {
    return this.nextId++;
  }

  // ------------------------------------------------------------------ logging
  log(text: string, kind: string, x = -1, y = -1, color = '#ddd', toast = false): void {
    const e: HistoryEntry = { year: this.year, text, kind, x, y, color };
    this.history.push(e);
    if (this.history.length > 400) this.history.splice(0, this.history.length - 400);
    if (toast && !this.headless) {
      this.toasts.push(e);
      if (this.toasts.length > 12) this.toasts.shift();
    }
  }
  emit(f: Fx): void {
    if (this.headless) return;
    if (this.fx.length < 4000) this.fx.push(f);
  }

  // ------------------------------------------------------------------ units
  spawnUnit(kind: number, x: number, y: number): Unit {
    const u = new Unit(this.newId(), kind, x, y);
    const d = UDEF[kind];
    u.hp = u.maxHp = d.hp;
    u.atk = d.atk;
    u.def = d.def;
    u.range = d.range;
    u.cdMax = d.cd;
    u.speed = d.speed * this.rng.range(0.9, 1.1);
    u.lifeT = Math.round(d.life * TPY * this.rng.range(0.8, 1.2));
    if (kind !== UK.PERSON && kind !== UK.BOAT && kind !== UK.PLANE) u.ageT = this.rng.int(Math.floor(u.lifeT * 0.4));
    u.bornYear = this.year;
    if (d.flying) u.z = 1;
    this.units.push(u);
    this.unitById.set(u.id, u);
    this.kindCount[kind]++;
    return u;
  }

  spawnPerson(species: number, x: number, y: number, kingdom: Kingdom | null, city: City | null, ageYears: number): Unit {
    const u = this.spawnUnit(UK.PERSON, x, y);
    const sp = SPECIES[species];
    u.species = species;
    u.name = personName(this.rng, sp);
    u.traits = randomTraits(this.rng);
    u.ageT = Math.round(ageYears * TPY);
    u.bornYear = this.year - ageYears;
    let life = sp.life * TPY * this.rng.range(0.8, 1.15);
    if (u.traits & TR.LONGLIVED) life *= 1.4;
    u.lifeT = Math.round(life);
    u.kingdom = kingdom;
    if (city) this.addToCity(u, city);
    refreshStats(this, u);
    u.hp = u.maxHp;
    return u;
  }

  addToCity(u: Unit, c: City): void {
    if (u.city === c) return;
    if (u.city) this.removeFromCity(u);
    u.city = c;
    u.kingdom = c.kingdom;
    c.members.push(u);
    u.homeX = c.x;
    u.homeY = c.y;
  }

  removeFromCity(u: Unit): void {
    const c = u.city;
    if (!c) return;
    const i = c.members.indexOf(u);
    if (i >= 0) {
      c.members[i] = c.members[c.members.length - 1];
      c.members.pop();
    }
    u.city = null;
  }

  hostile(a: Unit, b: Unit): boolean {
    if (a === b || b.dead || a.dead || b.inBoat || a.inBoat) return false;
    if (a.madT > 0 || b.madT > 0) return b.kind !== UK.FISH && a.kind !== UK.FISH;
    const da = UDEF[a.kind], db = UDEF[b.kind];
    if (da.monster || db.monster) {
      if (a.kind === b.kind) return false;
      if (da.monster && db.monster) return false;
      const m = da.monster ? a : b;
      const o = da.monster ? b : a;
      if (o.kind === UK.FISH) return false;
      if (UDEF[o.kind].herb || UDEF[o.kind].pred) return m.kind === UK.DRAGON || m.kind === UK.KRAKEN;
      return true;
    }
    const ap = a.kind === UK.PERSON || a.kind === UK.BOAT || a.kind === UK.PLANE;
    const bp = b.kind === UK.PERSON || b.kind === UK.BOAT || b.kind === UK.PLANE;
    if (ap && bp) return !!a.kingdom && !!b.kingdom && a.kingdom !== b.kingdom && a.kingdom.atWar(b.kingdom);
    if (da.pred && (db.herb || b.kind === UK.PERSON)) return b.kind !== UK.FISH;
    if (db.pred && (da.herb || a.kind === UK.PERSON)) return a.kind !== UK.FISH;
    return false;
  }

  canHitAir(u: Unit): boolean {
    if (UDEF[u.kind].flying) return true;
    if (u.kind === UK.PERSON && u.sclass >= 0) {
      const s = SOLDIERS[u.sclass];
      return !!s.antiAir || s.proj === 'arrow';
    }
    if (u.kind === UK.BOAT) return u.vclass >= 3;
    return false;
  }

  attack(u: Unit, t: Unit): void {
    let dmg = u.atk * (u.blessT > 0 ? 1.35 : 1) * (u.curseT > 0 ? 0.65 : 1) * this.rng.range(0.85, 1.15);
    let proj = 'none';
    let aoe = 0;
    if (u.kind === UK.PERSON && u.sclass >= 0) {
      const s = SOLDIERS[u.sclass];
      proj = s.proj;
      aoe = s.aoe;
    } else if (u.kind === UK.DRAGON) {
      proj = 'fire';
      aoe = 1.6;
    } else if (u.kind === UK.UFO) {
      proj = 'laser';
    } else if (u.kind === UK.BOAT) {
      const sd = SHIPS[u.vclass];
      proj = sd.proj;
      aoe = sd.aoe;
    }
    u.anim = 6;
    switch (proj) {
      case 'none':
        this.damageUnit(t, dmg, u);
        if (u.kind === UK.ZOMBIE && t.kind === UK.PERSON && this.laws.plague && this.rng.chance(0.15)) t.plague = Math.max(t.plague, 1);
        break;
      case 'arrow':
        this.shoot(P.ARROW, u.x, u.y - 0.5, t.x, t.y - 0.4, dmg, 0, u, t);
        break;
      case 'bullet':
        this.emit({ kind: 'tracer', x: u.x, y: u.y - 0.6, x2: t.x, y2: t.y - 0.5 });
        if (this.rng.chance(0.85)) this.damageUnit(t, dmg, u);
        break;
      case 'laser':
        this.emit({ kind: 'laser', x: u.x, y: u.y - (u.kind === UK.UFO ? 0 : 0.7), x2: t.x, y2: t.y - 0.5, color: u.kind === UK.UFO ? '#7dff7a' : beamColor(u) });
        this.damageUnit(t, dmg, u);
        if (aoe > 0) this.explode(t.x, t.y, aoe, dmg * 0.4, u.kingdom, u, { fire: false });
        break;
      case 'shell':
        this.shoot(P.SHELL, u.x, u.y - 0.5, t.x + this.rng.range(-0.6, 0.6), t.y + this.rng.range(-0.6, 0.6), dmg, aoe, u, null);
        break;
      case 'fire':
        this.shoot(P.FIREBALL, u.x, u.y - 1.5, t.x, t.y, dmg, aoe, u, null);
        break;
    }
  }

  attackBuilding(u: Unit, b: Building): void {
    let dmg = u.atk * (u.blessT > 0 ? 1.35 : 1) * this.rng.range(0.85, 1.15);
    u.anim = 6;
    let siege = 1;
    if (u.kind === UK.PERSON && u.sclass >= 0) {
      const s = SOLDIERS[u.sclass];
      if (s.role === 'siege') siege = 3;
      else if (s.role === 'vehicle') siege = 2;
      if (s.proj === 'shell') {
        this.shoot(P.SHELL, u.x, u.y - 0.5, b.cx + this.rng.range(-1, 1), b.cy + this.rng.range(-1, 1), dmg * siege, s.aoe, u, null);
        return;
      }
      if (s.proj === 'arrow') {
        this.shoot(P.ARROW, u.x, u.y - 0.5, b.cx, b.cy, dmg * 0.5, 0, u, null);
      }
      if (s.proj === 'bullet') this.emit({ kind: 'tracer', x: u.x, y: u.y - 0.6, x2: b.cx, y2: b.cy - 0.5 });
      if (s.proj === 'laser') this.emit({ kind: 'laser', x: u.x, y: u.y - 0.7, x2: b.cx, y2: b.cy - 0.5, color: beamColor(u) });
    } else if (u.kind === UK.DRAGON) {
      this.shoot(P.FIREBALL, u.x, u.y - 1.5, b.cx, b.cy, dmg, 1.6, u, null);
      return;
    } else if (u.kind === UK.UFO) {
      this.emit({ kind: 'laser', x: u.x, y: u.y, x2: b.cx, y2: b.cy - 0.5, color: '#7dff7a' });
      siege = 2;
    } else if (u.kind === UK.GOLEM) siege = 3;
    this.damageBuilding(b, dmg * siege, u.kingdom, u);
  }

  shoot(kind: number, sx: number, sy: number, tx: number, ty: number, dmg: number, aoe: number, src: Unit | null, target: Unit | null, owner: Kingdom | null = null): void {
    const d = Math.hypot(tx - sx, ty - sy);
    let speed = 0.5;
    let arc = 0;
    switch (kind) {
      case P.ARROW: speed = 0.55; arc = d * 0.12; break;
      case P.SHELL: speed = 0.45; arc = d * 0.25; break;
      case P.BOMB: speed = 0.25; arc = 0; break;
      case P.MISSILE: speed = 0.4; arc = Math.min(40, d * 0.35); break;
      case P.FIREBALL: speed = 0.35; arc = d * 0.1; break;
      case P.METEOR: speed = 0.6; arc = 0; break;
      case P.CRUISE: speed = 0.55; arc = Math.min(14, d * 0.12); break;
      case P.ORBITAL: speed = 1.4; arc = 0; break;
    }
    this.projectiles.push({
      kind, sx, sy, tx, ty, x: sx, y: sy, t: 0, dur: Math.max(4, d / speed), dmg, aoe,
      owner: owner ?? (src ? src.kingdom : null), src, target, arc, z: 0, dead: false,
    });
  }

  damageUnit(t: Unit, dmg: number, src: Unit | null, owner: Kingdom | null = null): void {
    if (t.dead) return;
    let d = dmg - t.def * 0.5;
    if (t.blessT > 0) d *= 0.75;
    if (t.curseT > 0) d *= 1.3;
    if (d < 1) d = 1;
    t.hp -= d;
    t.hitFlash = 4;
    if (src && !src.dead && t.kind === UK.PERSON && !t.tUnit && src.kind !== UK.PERSON) {
      // civilians defend themselves against animals
      if (t.ageT > ADULT_AGE * TPY && this.hostile(t, src)) t.tUnit = src;
    }
    if (src && !src.dead && !t.tUnit && t.kind !== UK.PERSON && UDEF[t.kind].pred) t.tUnit = src;
    if (t.kind === UK.PERSON && t.city) t.city.lastAttacked = this.tick;
    if (t.hp <= 0) this.killUnit(t, src, owner);
  }

  killUnit(u: Unit, src: Unit | null, owner: Kingdom | null = null, cause = ''): void {
    if (u.dead) return;
    u.dead = true;
    u.hp = 0;
    this.kindCount[u.kind]--;
    if (u.kind === UK.PERSON) this.stats.deaths++;
    if (src && src.kingdom && u.kingdom && src.kingdom !== u.kingdom && u.kind === UK.PERSON) {
      const r = src.kingdom.rel.get(u.kingdom.id);
      if (r && r.war) r.warScore += u.job === 6 ? 0.6 : 0.25;
    }
    if (src && !src.dead) {
      src.kills++;
      src.xp++;
      if (src.xp >= 3 + src.level * 2 && src.level < 10) {
        src.xp = 0;
        src.level++;
        refreshStats(this, src);
        src.hp = Math.min(src.maxHp, src.hp + src.maxHp * 0.3);
        if (src.level === 5 && src.kind === UK.PERSON) this.log(`${src.name} has become a legendary hero`, 'hero', src.x, src.y, src.kingdom ? src.kingdom.css : '#fff');
      }
      if (UDEF[src.kind].pred) src.hunger = 0;
      if (src.kind === UK.PERSON && UDEF[u.kind].herb && src.city) {
        src.carry = 100;
        src.carryAmt = (UDEF[u.kind].food || 3) * (src.kingdom ? src.kingdom.caps.foodMult : 1);
        src.phase = 3;
        src.path = null;
      }
    }
    if (u.cargo) {
      for (const c of u.cargo) {
        c.inBoat = null;
        if (!c.dead) this.killUnit(c, src, owner, 'drowned');
      }
      u.cargo = null;
    }
    const wasKing = u.isKing && u.kingdom;
    if (u.city) this.removeFromCity(u);
    if (wasKing && u.kingdom && u.kingdom.alive) {
      u.kingdom.king = null;
      this.log(`King ${u.name} of ${this.kName(u.kingdom)} has died${cause ? ' (' + cause + ')' : ''}`, 'king', u.x, u.y, u.kingdom.css);
    }
    if (u.kind === UK.DRAGON || u.kind === UK.KRAKEN || u.kind === UK.GOLEM) {
      this.log(`A ${UDEF[u.kind].name} was slain${src && src.kingdom ? ' by ' + this.kName(src.kingdom) : ''}`, 'monster', u.x, u.y, '#f96');
    }
    // zombie infection: victims rise again
    if (u.kind === UK.PERSON && src && src.kind === UK.ZOMBIE && this.rng.chance(0.6)) {
      const z = this.spawnUnit(UK.ZOMBIE, u.x, u.y);
      z.ageT = 0;
    }
    if (UDEF[u.kind].monster || u.kind === UK.PERSON) this.emit({ kind: 'death', x: u.x, y: u.y, color: u.kind === UK.ZOMBIE ? '#7a9' : '#c33' });
  }

  damageBuilding(b: Building, dmg: number, by: Kingdom | null, src: Unit | null = null): void {
    if (b.dead) return;
    b.hp -= dmg;
    b.city.lastAttacked = this.tick;
    if (b.hp <= 0) this.destroyBuilding(b, by);
  }

  explode(x: number, y: number, r: number, dmg: number, owner: Kingdom | null, src: Unit | null, opts: { fire?: boolean; crater?: boolean; bld?: number; fx?: boolean; air?: boolean } = {}): void {
    const w = this.world;
    this.spatial.query(x, y, r + 0.5, (u, d2) => {
      if (owner && u.kingdom === owner) return;
      if (src && src.kind !== UK.PERSON && u.kind === src.kind) return;
      if (u.kind === UK.PLANE && !opts.crater) return;
      const f = 1 - Math.sqrt(d2) / (r + 0.5);
      this.damageUnit(u, dmg * (0.4 + 0.6 * f), src && !src.dead ? src : null, owner);
    });
    const bmult = opts.bld ?? 1;
    const r0 = Math.ceil(r);
    const seen = new Set<number>();
    for (let dy = -r0; dy <= r0; dy++) {
      for (let dx = -r0; dx <= r0; dx++) {
        if (dx * dx + dy * dy > r * r) continue;
        const tx = Math.floor(x) + dx, ty = Math.floor(y) + dy;
        if (!w.inb(tx, ty)) continue;
        const i = ty * w.w + tx;
        const bid = w.bld[i];
        if (bid && !seen.has(bid)) {
          seen.add(bid);
          const b = this.bldById.get(bid);
          if (b && (!owner || b.city.kingdom !== owner)) {
            // bombs and missiles can level a town hall but only ground troops can take the city
            if (opts.air && b === b.city.center) b.hp = Math.max(1, b.hp - dmg * bmult);
            else this.damageBuilding(b, dmg * bmult, owner, src);
          }
        }
        if (opts.fire && this.rng.chance(0.35)) w.ignite(i, 90);
        if (opts.crater) {
          if (isTree(w.flora[i])) w.setFlora(i, F.NONE);
        }
      }
    }
    if (opts.fx !== false) this.emit({ kind: 'explosion', x, y, r });
  }

  // ------------------------------------------------------------------ kingdoms & cities
  kName(k: Kingdom): string {
    return kingdomTitle(k.baseName, k.era, k.species, k.ascended);
  }

  createKingdom(species: number, parent: Kingdom | null = null): Kingdom {
    const sp = SPECIES[species];
    const used = new Set(this.kingdoms.map(k => k.color.join(',')));
    let color = KINGDOM_COLORS[this.colorI++ % KINGDOM_COLORS.length];
    for (let tries = 0; tries < KINGDOM_COLORS.length && used.has(color.join(',')); tries++) color = KINGDOM_COLORS[this.colorI++ % KINGDOM_COLORS.length];
    if (used.has(color.join(','))) color = [this.rng.int(200) + 40, this.rng.int(200) + 40, this.rng.int(200) + 40];
    const k = new Kingdom(this.newId(), placeName(this.rng, sp), species, color);
    k.founded = this.year;
    if (parent) {
      k.techs.set(parent.techs);
      k.res = parent.res.map(v => Math.floor(v * 0.2));
    } else {
      for (const id of START_TECHS) k.techs[techIdx(id)] = 1;
      if (this.laws.startEra > 0) {
        for (const td of TECHS) if (td.era < this.laws.startEra) k.techs[td.idx] = 1;
        // step into the chosen era with its first available discovery
        const first = TECHS.find(td => td.era === this.laws.startEra && td.req.every(r => k.techs[TECHS.find(x => x.id === r)!.idx]));
        if (first) k.techs[first.idx] = 1;
      }
      k.res[RES.WOOD] = 20;
      k.res[RES.STONE] = 5;
      if (this.laws.startEra > 0) {
        k.res = k.res.map(v => v + this.laws.startEra * 40);
      }
    }
    this.refreshTechs(k);
    k.eraYears[k.era] = this.year;
    this.kingdoms.push(k);
    this.allKingdoms.push(k);
    this.kingdomById.set(k.id, k);
    return k;
  }

  refreshTechs(k: Kingdom): void {
    let n = 0;
    for (let i = 0; i < NUM_TECH; i++) if (k.techs[i]) n++;
    k.techCount = n;
    const oldEra = k.era;
    k.caps = computeCaps(k.techs);
    k.era = k.caps.era;
    if (k.era !== oldEra) {
      for (const c of k.cities) for (const i of c.tiles) this.world.mark(i);
    }
  }

  learnTech(k: Kingdom, idx: number, gift = false): void {
    if (k.techs[idx]) return;
    const oldEra = k.era;
    k.techs[idx] = 1;
    this.refreshTechs(k);
    const td = TECHS[idx];
    const cap = k.capital;
    const x = cap ? cap.x : -1, y = cap ? cap.y : -1;
    if (k.era > oldEra) {
      k.eraYears[k.era] = this.year;
      if (k.era > this.worldEra) {
        this.worldEra = k.era;
        this.log(`🌍 ${this.kName(k)} is the first nation in the world to enter the ${eraName(k.era)}!`, 'eraFirst', x, y, k.css, true);
      } else this.log(`${this.kName(k)} has entered the ${eraName(k.era)}`, 'era', x, y, k.css, true);
      if (cap) this.emit({ kind: 'fireworks', x: cap.x, y: cap.y - 2, color: k.css });
      for (const u of this.units) if (u.kingdom === k && u.kind === UK.PERSON) refreshStats(this, u);
    } else if (gift || td.era >= 5 || ['agriculture', 'writing', 'gunpowder', 'flight', 'nukes', 'computers', 'spaceflight'].includes(td.id)) {
      this.log(`${this.kName(k)} discovered ${td.name}${gift ? ' (divine gift)' : ''}`, 'tech', x, y, k.css, gift);
    }
    if (k.researching === idx) {
      k.researching = -1;
      k.progress = 0;
    }
  }

  foundCity(k: Kingdom, x: number, y: number, founders: Unit[]): City | null {
    const w = this.world;
    const cx = Math.floor(x), cy = Math.floor(y);
    // center footprint (3x3) top-left
    const bx = cx - 1, by = cy - 1;
    for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) {
      const tx = bx + dx, ty = by + dy;
      if (!w.inb(tx, ty)) return null;
      const i = ty * w.w + tx;
      if (w.bld[i] || w.isWater(i) || TER[w.ter[i]].move <= 0) return null;
      const o = w.owner[i];
      if (o && this.cityById.get(o)?.kingdom !== k) return null;
    }
    const c = new City(this.newId(), placeName(this.rng, SPECIES[k.species]), k, cx + 0.5, cy + 0.5);
    c.founded = this.year;
    this.cities.push(c);
    this.cityById.set(c.id, c);
    k.cities.push(c);
    if (!k.capital) k.capital = c;
    for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) {
      const i = (by + dy) * w.w + bx + dx;
      if (!TER[w.ter[i]].build) w.setTer(i, w.landFor(i));
      w.setFlora(i, F.NONE);
    }
    const center = this.placeBuilding(c, BLD.center, bx, by, true);
    c.center = center;
    // initial territory
    const r = 4;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r * r + 1) continue;
      const tx = cx + dx, ty = cy + dy;
      if (!w.inb(tx, ty)) continue;
      const i = ty * w.w + tx;
      if (!w.owner[i]) this.claimTile(c, i);
    }
    for (const f of founders) {
      if (f.dead) continue;
      f.job = 0;
      f.order = null;
      f.phase = 0;
      f.path = null;
      this.addToCity(f, c);
    }
    c.food = 25 + founders.length * 4;
    this.stats.citiesFounded++;
    if (k.cities.length === 1) this.log(`The ${SPECIES[k.species].adj} ${this.kName(k)} was founded at ${c.name}`, 'kingdom', c.x, c.y, k.css, true);
    else this.log(`${this.kName(k)} founded the settlement of ${c.name}`, 'city', c.x, c.y, k.css);
    return c;
  }

  claimTile(c: City, i: number): void {
    const w = this.world;
    const old = w.owner[i];
    if (old === c.id) return;
    if (old) {
      const oc = this.cityById.get(old);
      if (oc) {
        const j = oc.tiles.indexOf(i);
        if (j >= 0) { oc.tiles[j] = oc.tiles[oc.tiles.length - 1]; oc.tiles.pop(); }
      }
    }
    w.owner[i] = c.id;
    c.tiles.push(i);
    w.markN(i);
  }

  placeBuilding(c: City, def: BldDef, x: number, y: number, complete: boolean): Building {
    const w = this.world;
    const style = c.kingdom.era;
    const b = new Building(this.newId(), def, c, x, y, style, buildingMaxHp(def, style));
    b.progress = complete ? 1 : 0;
    if (!complete) b.hp = Math.max(10, b.maxHp * 0.15);
    for (let dy = 0; dy < def.h; dy++) for (let dx = 0; dx < def.w; dx++) {
      const i = (y + dy) * w.w + x + dx;
      w.bld[i] = b.id;
      if (w.ter[i] === T.FARM || w.ter[i] === T.ROAD || w.ter[i] === T.PAVED || w.ter[i] === T.RAIL || w.ter[i] === T.HIGHWAY) {
        w.setTer(i, w.landFor(i));
        const fi = c.farms.indexOf(i);
        if (fi >= 0) c.farms.splice(fi, 1);
      }
      w.setFlora(i, F.NONE);
      w.mark(i);
      if (!w.owner[i]) this.claimTile(c, i);
    }
    this.buildings.push(b);
    this.bldById.set(b.id, b);
    c.buildings.push(b);
    return b;
  }

  finishBuilding(b: Building): void {
    if (b.progress >= 1) return;
    b.progress = 1;
    b.hp = b.maxHp;
    const c = b.city;
    if (b.def.cap || b.type === 'house') c.capacity = this.cityCapacity(c);
    if (['library', 'university', 'castle', 'factory', 'airbase', 'silo', 'spaceport', 'lab'].includes(b.type)) {
      const big = ['silo', 'spaceport'].includes(b.type);
      this.log(`${c.name} (${this.kName(c.kingdom)}) built a ${b.def.name}`, 'building', b.cx, b.cy, c.kingdom.css, big);
    }
  }

  cityCapacity(c: City): number {
    let cap = 0;
    const hc = c.kingdom.caps.houseCap;
    for (const b of c.buildings) {
      if (b.progress < 1) continue;
      if (b.type === 'house') cap += houseCapacity(b.style, hc);
      else cap += b.def.cap;
    }
    return cap;
  }

  destroyBuilding(b: Building, by: Kingdom | null): void {
    if (b.dead) return;
    const w = this.world;
    const c = b.city;
    if (b === c.center && by && by !== c.kingdom && by.alive && c.kingdom.atWar(by)) {
      this.captureCity(c, by);
      b.hp = b.maxHp * 0.35;
      return;
    }
    b.dead = true;
    for (let dy = 0; dy < b.h; dy++) for (let dx = 0; dx < b.w; dx++) {
      const tx = b.x + dx, ty = b.y + dy;
      if (!w.inb(tx, ty)) continue;
      const i = ty * w.w + tx;
      if (w.bld[i] === b.id) w.bld[i] = 0;
      w.mark(i);
    }
    this.bldById.delete(b.id);
    const j = c.buildings.indexOf(b);
    if (j >= 0) c.buildings.splice(j, 1);
    this.emit({ kind: 'collapse', x: b.cx, y: b.cy, r: Math.max(b.w, b.h) / 2 });
    if (b === c.center) c.center = null;
    c.capacity = this.cityCapacity(c);
  }

  captureCity(c: City, k: Kingdom, ceded = false, union = false): void {
    const old = c.kingdom;
    if (old === k) return;
    if (!ceded) { const r = k.relation(old); r.warScore += 30; }
    const oi = old.cities.indexOf(c);
    if (oi >= 0) old.cities.splice(oi, 1);
    k.cities.push(c);
    c.kingdom = k;
    c.loyalty = 10;
    c.revoltT = 0;
    c.conquered = this.year;
    if (old.capital === c) old.capital = old.cities[0] || null;
    // soldiers of the old realm flee to remaining cities, civilians submit
    const members = c.members.slice();
    for (const u of members) {
      if (u.job === 6 && old.cities.length > 0) {
        const dest = old.cities[this.rng.int(old.cities.length)];
        this.addToCity(u, dest);
        u.order = null;
        u.path = null;
      } else {
        u.kingdom = k;
        u.order = null;
        if (u.isKing) u.isKing = false;
        if (u.job === 6) { u.job = 0; u.sclass = -1; refreshStats(this, u); }
      }
    }
    for (const b of c.buildings) b.style = Math.min(b.style, k.era);
    for (const i of c.tiles) this.world.mark(i);
    for (const i of c.tiles) this.world.markN(i);
    if (!ceded) {
      this.log(`${this.kName(k)} conquered ${c.name} from ${this.kName(old)}`, 'conquest', c.x, c.y, k.css, true);
      k.res[RES.GOLD] += Math.floor(old.res[RES.GOLD] * 0.2);
    }
    const r = old.relation(k);
    r.memory += ceded ? 15 : 30;
    pruneLinks(this, old);
    if (old.infra && old.infra.key.includes(String(c.id))) old.infra = null;
    if (old.cities.length === 0) this.destroyKingdom(old, k, union);
  }

  destroyCity(c: City, reason: string): void {
    if (c.dead) return;
    c.dead = true;
    const k = c.kingdom;
    for (const b of c.buildings.slice()) this.destroyBuilding(b, null);
    const w = this.world;
    for (const i of c.tiles) {
      if (w.owner[i] === c.id) {
        w.owner[i] = 0;
        w.markN(i);
        if (w.ter[i] === T.FARM) w.setTer(i, w.landFor(i));
      }
    }
    c.tiles = [];
    for (const u of c.members.slice()) {
      this.removeFromCity(u);
      if (k.cities.length > 1) {
        const other = k.cities.find(o => o !== c);
        if (other) this.addToCity(u, other);
      } else {
        u.kingdom = null;
      }
    }
    const i = k.cities.indexOf(c);
    if (i >= 0) k.cities.splice(i, 1);
    if (k.capital === c) k.capital = k.cities[0] || null;
    this.cityById.delete(c.id);
    const ci = this.cities.indexOf(c);
    if (ci >= 0) this.cities.splice(ci, 1);
    this.log(`${c.name} was ${reason}`, 'ruin', c.x, c.y, '#aaa');
    if (k.cities.length === 0 && k.alive) this.destroyKingdom(k, null);
  }

  destroyKingdom(k: Kingdom, by: Kingdom | null, union = false): void {
    if (!k.alive) return;
    k.alive = false;
    k.diedYear = this.year;
    const i = this.kingdoms.indexOf(k);
    if (i >= 0) this.kingdoms.splice(i, 1);
    for (const o of this.kingdoms) {
      const r = o.rel.get(k.id);
      if (r) { r.war = false; r.ally = false; }
    }
    for (const u of this.units) if (u.kingdom === k) { u.kingdom = by; if (!by) { u.order = null; if (u.job === 6) { u.job = 0; u.sclass = -1; } } }
    if (union && by) this.log(`🤝 ${this.kName(k)} peacefully united with ${this.kName(by)}`, 'treaty', by.capital ? by.capital.x : -1, by.capital ? by.capital.y : -1, by.css, true);
    else this.log(by ? `${this.kName(k)} has fallen to ${this.kName(by)}` : `${this.kName(k)} has collapsed`, 'fall', -1, -1, k.css, true);
  }

  declareWar(a: Kingdom, b: Kingdom, reason = ''): void {
    if (a === b || !a.alive || !b.alive) return;
    const ra = a.relation(b), rb = b.relation(a);
    if (ra.war) return;
    ra.war = rb.war = true;
    ra.ally = rb.ally = false;
    ra.warStart = rb.warStart = this.tick;
    ra.exhaustion = rb.exhaustion = 0;
    ra.opinion = Math.min(ra.opinion, -50);
    rb.opinion = Math.min(rb.opinion, -50);
    this.stats.wars++;
    this.log(`⚔ ${this.kName(a)} declared war on ${this.kName(b)}${reason ? ' — ' + reason : ''}`, 'war', b.capital ? b.capital.x : -1, b.capital ? b.capital.y : -1, a.css, true);
    // allies of the defender may join
    for (const o of this.kingdoms) {
      if (o === a || o === b) continue;
      const ro = o.rel.get(b.id);
      if (ro && ro.ally && !o.atWar(a) && this.rng.chance(0.7)) {
        const r2 = o.relation(a), r3 = a.relation(o);
        r2.war = r3.war = true;
        r2.warStart = r3.warStart = this.tick;
        r2.exhaustion = r3.exhaustion = 0;
        this.log(`${this.kName(o)} joined the war to defend its ally ${this.kName(b)}`, 'war', -1, -1, o.css);
      }
    }
  }

  makePeace(a: Kingdom, b: Kingdom, note = ''): void {
    const ra = a.relation(b), rb = b.relation(a);
    if (!ra.war) return;
    ra.war = rb.war = false;
    ra.truce = rb.truce = this.tick + TPY * 25;
    ra.opinion = Math.max(ra.opinion, -10);
    rb.opinion = Math.max(rb.opinion, -10);
    for (const u of this.units) if (u.order && u.order.city && ((u.kingdom === a && u.order.city.kingdom === b) || (u.kingdom === b && u.order.city.kingdom === a))) u.order = null;
    this.treaties++;
    // peace terms: the clear loser cedes a border city and pays reparations
    const diff = ra.warScore - rb.warScore;
    const winner = diff > 0 ? a : b, loser = diff > 0 ? b : a;
    let terms = '';
    if (Math.abs(diff) > 25 && loser.cities.length > 1 && winner.alive && loser.alive) {
      // the bigger the victory, the more border cities change hands
      const n = Math.min(Math.abs(diff) > 120 ? 3 : Math.abs(diff) > 60 ? 2 : 1, loser.cities.length - 1);
      const names: string[] = [];
      for (let q = 0; q < n; q++) {
        let ceded: City | null = null, bd = 1e9;
        for (const c of loser.cities) {
          if (c === loser.capital) continue;
          for (const wc of winner.cities) {
            const d = Math.abs(c.x - wc.x) + Math.abs(c.y - wc.y);
            if (d < bd) { bd = d; ceded = c; }
          }
        }
        if (!ceded || bd >= 140) break;
        names.push(ceded.name);
        this.captureCity(ceded, winner, true);
      }
      if (names.length) terms = ` — ${this.kName(loser)} cedes ${names.join(', ')}`;
      const rep = Math.floor(loser.res[RES.GOLD] * 0.3);
      if (rep > 0) { loser.res[RES.GOLD] -= rep; winner.res[RES.GOLD] += rep; terms += terms ? ' and pays reparations' : ` — ${this.kName(loser)} pays reparations`; }
    }
    ra.warScore = rb.warScore = 0;
    const place = (loser.capital || winner.capital);
    const name = place ? `Treaty of ${place.name}` : 'a peace treaty';
    this.log(`☮ ${this.kName(a)} and ${this.kName(b)} signed the ${name}${note ? ' ' + note : ''}${terms}`, 'peace', place ? place.x : -1, place ? place.y : -1, '#9f9', true);
  }

  // ------------------------------------------------------------------ setup helpers
  spawnTribe(species: number, x: number, y: number, n = 6): City | null {
    const w = this.world;
    const i = w.nearestLand(x, y, 6);
    if (i < 0) return null;
    const tx = i % w.w, ty = (i / w.w) | 0;
    const k = this.createKingdom(species);
    const founders: Unit[] = [];
    for (let j = 0; j < n; j++) {
      const p = this.spawnPerson(species, tx + 0.5 + this.rng.range(-1.5, 1.5), ty + 0.5 + this.rng.range(-1.5, 1.5), k, null, this.rng.range(16, 30));
      founders.push(p);
    }
    const c = this.foundCity(k, tx, ty, founders);
    if (!c) {
      for (const f of founders) { f.kingdom = null; }
      const idx = this.kingdoms.indexOf(k);
      if (idx >= 0) this.kingdoms.splice(idx, 1);
      const ai = this.allKingdoms.indexOf(k);
      if (ai >= 0) this.allKingdoms.splice(ai, 1);
      this.kingdomById.delete(k.id);
      return null;
    }
    k.king = founders[0];
    founders[0].isKing = true;
    return c;
  }

  findStartSpot(species: number, island = -1, box: number[] | null = null): number {
    const w = this.world;
    const pref = SPECIES[species].prefers;
    let best = -1, bs = -1e9;
    const bx0 = box ? Math.max(6, box[0]) : 6, by0 = box ? Math.max(6, box[1]) : 6;
    const bx1 = box ? Math.min(w.w - 7, box[2]) : w.w - 7, by1 = box ? Math.min(w.h - 7, box[3]) : w.h - 7;
    if (bx1 <= bx0 || by1 <= by0) return -1;
    for (let tries = 0; tries < 500; tries++) {
      const x = bx0 + this.rng.int(bx1 - bx0 + 1), y = by0 + this.rng.int(by1 - by0 + 1);
      const i = y * w.w + x;
      const t = w.ter[i];
      if (island >= 0 && w.island[i] !== island) continue;
      if (!TER[t].build || w.owner[i] || w.isWater(i)) continue;
      let score = pref.includes(t) ? 20 : 0;
      let land = 0;
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
        const j = (y + dy) * w.w + x + dx;
        if (TER[w.ter[j]].build) land++;
        if (w.owner[j]) score -= 50;
      }
      score += land;
      if (w.islandSize[w.island[i]] < 80) score -= 40;
      for (const c of this.cities) {
        const d = Math.hypot(c.x - x, c.y - y);
        if (d < 30) score -= (30 - d) * 3;
      }
      score += this.rng.range(0, 10);
      if (score > bs) { bs = score; best = i; }
    }
    return best;
  }

  populateWorld(numCivs: number, animals: boolean): void {
    const w = this.world;
    if (w.topoDirty) w.computeTopology();
    // spread the first peoples over every sizeable landmass, in proportion to its area
    const boxes = new Map<number, number[]>();
    for (let i = 0; i < w.n; i++) {
      const id = w.island[i];
      if (id < 0 || w.ter[i] <= 2) continue;
      const x = i % w.w, y = (i / w.w) | 0;
      const b = boxes.get(id);
      if (!b) boxes.set(id, [x, y, x, y]);
      else { if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y; if (x > b[2]) b[2] = x; if (y > b[3]) b[3] = y; }
    }
    let land = 0;
    for (const s of w.islandSize) land += s;
    const big = Array.from(boxes.keys()).filter(id => w.islandSize[id] >= Math.max(600, land * 0.03)).sort((a, b) => w.islandSize[b] - w.islandSize[a]);
    const plan: number[] = [];
    if (big.length) {
      for (let i = 0; i < Math.min(numCivs, big.length); i++) plan.push(big[i]);
      while (plan.length < numCivs) {
        // weighted by area among the big landmasses
        let r = this.rng.next() * big.reduce((s, id) => s + w.islandSize[id], 0);
        let pick = big[0];
        for (const id of big) { r -= w.islandSize[id]; if (r <= 0) { pick = id; break; } }
        plan.push(pick);
      }
    }
    for (let i = 0; i < numCivs; i++) {
      const sp = i % SPECIES.length;
      const isl = plan.length ? plan[i] : -1;
      let spot = this.findStartSpot(sp, isl, isl >= 0 ? boxes.get(isl)! : null);
      if (spot < 0) spot = this.findStartSpot(sp);
      // worlds that start in a later age begin with bigger founding populations
      if (spot >= 0) this.spawnTribe(sp, spot % w.w, (spot / w.w) | 0, 7 + Math.min(24, this.laws.startEra * 2));
    }
    if (animals) {
      const count = Math.floor(w.n / 900);
      for (let i = 0; i < count; i++) {
        const x = this.rng.int(w.w), y = this.rng.int(w.h);
        const t = w.ter[y * w.w + x];
        if (!TER[t].build) continue;
        let kind: number = UK.SHEEP;
        const r = this.rng.next();
        if (t === T.JUNGLE || t === T.GRASS) kind = r < 0.4 ? UK.DEER : r < 0.75 ? UK.SHEEP : r < 0.9 ? UK.CHICKEN : UK.WOLF;
        else if (t === T.TUNDRA || t === T.SNOW || t === T.HILLS) kind = r < 0.4 ? UK.DEER : r < 0.7 ? UK.WOLF : UK.BEAR;
        else if (t === T.SAVANNA || t === T.DESERT) kind = r < 0.6 ? UK.DEER : r < 0.85 ? UK.SHEEP : UK.WOLF;
        for (let j = 0; j < 2 + this.rng.int(2); j++) this.spawnUnit(kind, x + 0.5 + this.rng.range(-1, 1), y + 0.5 + this.rng.range(-1, 1));
      }
    }
  }

  // ------------------------------------------------------------------ main step
  step(): void {
    this.tick++;
    const w = this.world;
    if (w.topoDirty && this.tick - this.lastTopo >= (w.n > 150000 ? 80 : 40)) { w.computeTopology(); this.lastTopo = this.tick; }
    this.pathBudget = 24;
    if (this.tick % 2 === 0) {
      for (const k of this.kingdoms) k.warCount = k.wars;
      this.spatial.rebuild(this.units);
    }

    const units = this.units;
    const n = units.length;
    for (let i = 0; i < n; i++) {
      const u = units[i];
      if (!u.dead && !u.inBoat) updateUnit(this, u);
    }

    for (let i = 0; i < this.buildings.length; i++) {
      const b = this.buildings[i];
      if (!b.dead && (this.tick + b.timer) % 10 === 0) this.updateBuilding(b);
    }
    for (let i = 0; i < this.cities.length; i++) {
      const c = this.cities[i];
      if (!c.dead && (this.tick + c.t) % 20 === 0) updateCity(this, c);
    }
    for (let i = 0; i < this.kingdoms.length; i++) {
      const k = this.kingdoms[i];
      if (k.alive && (this.tick + k.t) % 30 === 0) updateKingdom(this, k);
    }
    this.updateProjectiles();
    updateDisasters(this);
    if (this.flareT > 0) this.flareT--;
    environmentTick(this);
    if (this.laws.disasters && this.rng.chance(1 / (TPY * 40))) randomDisaster(this);

    // cleanup
    if (this.tick % 4 === 0) {
      let j = 0;
      for (let i = 0; i < units.length; i++) {
        const u = units[i];
        if (u.dead) { this.unitById.delete(u.id); continue; }
        units[j++] = u;
      }
      units.length = j;
      let k = 0;
      const bs = this.buildings;
      for (let i = 0; i < bs.length; i++) if (!bs[i].dead) bs[k++] = bs[i];
      bs.length = k;
    }
    if (this.tick % TPY === 0) {
      updateWorldPolitics(this);
      let pop = 0;
      for (const k of this.kingdoms) {
        let kp = 0;
        for (const c of k.cities) kp += c.members.length;
        k.pop = kp;
        if (kp > k.peakPop) k.peakPop = kp;
        pop += kp;
      }
      const maxEra = this.kingdoms.reduce((m, k) => Math.max(m, k.era), 0);
      this.popHistory.push({ year: this.year, pop, kingdoms: this.kingdoms.length, maxEra });
      if (this.popHistory.length > 2000) this.popHistory.splice(0, 1000);
      if (this.carbon > 0) this.carbon *= 0.996;
    }
    if (this.shake > 0) this.shake *= 0.9;
    this.personPop = this.kindCount[UK.PERSON];
  }

  updateBuilding(b: Building): void {
    const c = b.city;
    const k = c.kingdom;
    const w = this.world;
    if (b.progress < 1) {
      // slow self-construction so nothing stalls forever
      b.progress += 0.0015 * k.caps.buildMult;
      if (b.progress >= 1) this.finishBuilding(b);
      return;
    }
    if (b.hp < b.maxHp) b.hp = Math.min(b.maxHp, b.hp + b.maxHp * 0.004);
    switch (b.type) {
      case 'tower':
      case 'castle':
      case 'center': {
        let tier = k.caps.tower;
        if (b.type === 'center' && k.era < 4) tier = -1;
        if (tier < 0) break;
        const range = 7 + tier * 1.5;
        let target: Unit | null = null;
        let bd = 1e9;
        if (!this.spatial.anyDanger(b.cx, b.cy, range)) break;
        this.spatial.query(b.cx, b.cy, range, (u, d2) => {
          if (u.inBoat) return;
          const hostileU = (u.kingdom && u.kingdom !== k && k.atWar(u.kingdom)) || UDEF[u.kind].monster || u.madT > 0;
          if (!hostileU) return;
          if (UDEF[u.kind].flying && tier < 2) return;
          if (d2 < bd) { bd = d2; target = u; }
        });
        if (target) {
          const t = target as Unit;
          const dmg = [6, 18, 14, 40, 60, 95, 140][tier] * (b.type === 'castle' ? 1.5 : 1);
          if (tier === 0) this.shoot(P.ARROW, b.cx, b.y, t.x, t.y - 0.4, dmg, 0, null, t, k);
          else if (tier === 1) this.shoot(P.SHELL, b.cx, b.y, t.x, t.y, dmg, 1.2, null, null, k);
          else if (tier === 2) { this.emit({ kind: 'tracer', x: b.cx, y: b.y, x2: t.x, y2: t.y - 0.5 }); this.damageUnit(t, dmg, null, k); }
          else if (tier === 3) { this.shoot(P.SHELL, b.cx, b.y - 1, t.x, t.y, dmg, 1.5, null, null, k); }
          else if (tier === 4) { this.emit({ kind: 'laser', x: b.cx, y: b.y - 1, x2: t.x, y2: t.y - 0.5, color: '#ff3d6e' }); this.damageUnit(t, dmg, null, k); }
          else {
            this.emit({ kind: 'laser', x: b.cx, y: b.y - 1, x2: t.x, y2: t.y - 0.5, color: tier === 5 ? '#8fd8ff' : '#d58bff' });
            this.damageUnit(t, dmg, null, k);
            if (tier >= 6) this.explode(t.x, t.y, 1.2, dmg * 0.3, k, null, { fire: false });
          }
        }
        break;
      }
      case 'factory':
      case 'power':
      case 'airbase': {
        const pm = k.caps.pollution * (b.type === 'power' ? 1.4 : b.type === 'airbase' ? 0.3 : 1) * (climateSigned(this, k) ? 0.45 : 1);
        if (pm > 0.01 && this.laws.climate) {
          this.carbon += 0.008 * pm;
          for (let n = 0; n < 2; n++) {
            const tx = b.x + this.rng.int(b.w + 8) - 4, ty = b.y + this.rng.int(b.h + 8) - 4;
            if (w.inb(tx, ty)) {
              const i = ty * w.w + tx;
              w.poll[i] = Math.min(255, w.poll[i] + Math.round(14 * pm));
            }
          }
        }
        break;
      }
      case 'hospital': {
        for (const u of c.members) {
          if (u.hp < u.maxHp) u.hp = Math.min(u.maxHp, u.hp + 1);
          if (u.plague > 0 && this.rng.chance(0.08)) { u.plague = 0; u.immune = TPY * 10; }
        }
        break;
      }
    }
  }

  updateProjectiles(): void {
    const ps = this.projectiles;
    let j = 0;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      p.t += 1 / p.dur;
      const tt = Math.min(1, p.t);
      p.x = p.sx + (p.tx - p.sx) * tt;
      p.y = p.sy + (p.ty - p.sy) * tt;
      p.z = p.arc * 4 * tt * (1 - tt);
      if (p.t >= 1) {
        this.impact(p);
        continue;
      }
      ps[j++] = p;
    }
    ps.length = j;
  }

  impact(p: Projectile): void {
    const w = this.world;
    switch (p.kind) {
      case P.ARROW: {
        const t = p.target;
        if (t && !t.dead && Math.hypot(t.x - p.tx, t.y - 0.4 - p.ty) < 1.2) this.damageUnit(t, p.dmg, p.src && !p.src.dead ? p.src : null, p.owner);
        else {
          // stray arrows can still hit buildings
          const i = w.tileAt(p.tx, p.ty);
          if (i >= 0 && w.bld[i]) {
            const b = this.bldById.get(w.bld[i]);
            if (b && p.owner && b.city.kingdom !== p.owner && b.city.kingdom.atWar(p.owner)) this.damageBuilding(b, p.dmg * 0.5, p.owner);
          }
        }
        break;
      }
      case P.SHELL:
      case P.BOMB:
        this.explode(p.tx, p.ty, p.aoe || 1, p.dmg, p.owner, p.src && !p.src.dead ? p.src : null, { fire: p.kind === P.BOMB, bld: p.kind === P.BOMB ? 2.5 : 1.2, air: p.kind === P.BOMB });
        break;
      case P.CRUISE:
        if (intercepted(this, p, 1)) break;
        this.shake = Math.max(this.shake, 5);
        this.explode(p.tx, p.ty, p.aoe || 3.2, p.dmg, p.owner, null, { fire: true, bld: 3, air: true });
        this.emit({ kind: 'smoke', x: p.tx, y: p.ty - 1, r: 3, color: '#444' });
        break;
      case P.ORBITAL:
        if (intercepted(this, p, 0.5)) break;
        orbitalImpact(this, p.tx, p.ty, p.owner);
        break;
      case P.FIREBALL:
        this.explode(p.tx, p.ty, p.aoe || 1.5, p.dmg, null, p.src && !p.src.dead ? p.src : null, { fire: true, bld: 1.5 });
        break;
      case P.MISSILE:
        if (intercepted(this, p, 1)) break;
        nukeAt(this, p.tx, p.ty, p.owner);
        break;
      case P.METEOR:
        if (p.aoe > 6) asteroidImpact(this, p.tx, p.ty, p.aoe);
        else meteorImpact(this, p.tx, p.ty);
        break;
    }
  }
}

const BEAM: Record<string, string> = { railgun: '#8fd8ff', plasma: '#d58bff', titan: '#ff8a3d' };
function beamColor(u: Unit): string {
  return (u.sclass >= 0 && BEAM[SOLDIERS[u.sclass].weapon]) || '#ff3d6e';
}

/** Missile defense / energy shields of the kingdom that owns the target tile. */
function intercepted(g: Game, p: Projectile, factor: number): boolean {
  const w = g.world;
  const i = w.tileAt(p.tx, p.ty);
  if (i < 0 || !w.owner[i]) return false;
  const c = g.cityById.get(w.owner[i]);
  if (!c || c.kingdom === p.owner) return false;
  const k = c.kingdom;
  if (k.caps.shield <= 0 || !g.rng.chance(k.caps.shield * factor)) return false;
  g.emit({ kind: 'explosion', x: p.tx, y: p.ty - 6, r: p.kind === P.MISSILE ? 3 : 1.6 });
  g.emit({ kind: 'laser', x: c.x, y: c.y - 1, x2: p.tx, y2: p.ty - 6, color: k.caps.shield >= 0.5 ? '#7ff' : '#fff' });
  if (p.kind === P.MISSILE) g.log(`🛡 ${g.kName(k)} shot down a nuclear missile over ${c.name}!`, 'nuke', p.tx, p.ty, '#7ff', true);
  return true;
}

/** Kinetic bombardment from orbit: a tungsten rod falls at hypersonic speed. */
export function orbitalImpact(g: Game, x: number, y: number, owner: Kingdom | null): void {
  const w = g.world;
  g.shake = Math.max(g.shake, 12);
  g.flash = Math.max(g.flash, 0.35);
  g.explode(x, y, 5, 900, owner, null, { fire: true, crater: true, bld: 5, air: true });
  for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
    const d = Math.hypot(dx, dy);
    const tx = Math.floor(x) + dx, ty = Math.floor(y) + dy;
    if (d > 3.2 || !w.inb(tx, ty)) continue;
    const i = ty * w.w + tx;
    if (d < 1.5 && !w.isWater(i)) w.lower(i);
    else if (!w.isWater(i) && TER[w.ter[i]].elev === 4) w.setTer(i, T.ASH);
  }
  g.emit({ kind: 'explosion', x, y, r: 6 });
  g.emit({ kind: 'smoke', x, y: y - 1, r: 4, color: '#555' });
}

/** Warhead yield (blast radius in tiles) for a kingdom's arsenal. */
export function nukeRadius(owner: Kingdom | null, test = false): number {
  const m = owner ? owner.caps.yieldMult : 1;
  return (test ? 9 : 14) * m;
}

export function nukeAt(g: Game, x: number, y: number, owner: Kingdom | null, test = false, radius = 0): { dead: number; cities: string[] } {
  const w = g.world;
  const R = radius || nukeRadius(owner, test);
  const big = R / 14;
  g.stats.nukes++;
  g.nuclearWinter += (test ? 0.15 : 1) * big;
  if (!test) { g.combatNukes++; g.lastNukeYear = g.year; }
  g.flash = 1;
  g.shake = 18 + R;
  g.emit({ kind: 'nuke', x, y, r: R });
  const deaths0 = g.stats.deaths;
  // cities caught in the fireball
  const hit: City[] = [];
  for (const c of g.cities) if (Math.hypot(c.x - x, c.y - y) < R * 1.1) hit.push(c);
  // the blast: everything inside the fireball is vaporized, the shock wave kills most beyond it
  g.spatial.query(x, y, R * 1.6, (u, d2) => {
    const d = Math.sqrt(d2);
    const dmg = d < R * 0.6 ? 1e6 : d < R ? 3000 * (1 - d / R) + 400 : 350 * (1 - (d - R) / (R * 0.6));
    if (dmg > 0) g.damageUnit(u, dmg, null, null);
  });
  const r0 = Math.ceil(R * 1.8);
  const cx = Math.floor(x), cy = Math.floor(y);
  for (let dy = -r0; dy <= r0; dy++) for (let dx = -r0; dx <= r0; dx++) {
    const d = Math.hypot(dx, dy);
    if (d > r0) continue;
    const tx = cx + dx, ty = cy + dy;
    if (!w.inb(tx, ty)) continue;
    const i = ty * w.w + tx;
    const bid = w.bld[i];
    if (d <= R * 1.5 && bid) {
      const b = g.bldById.get(bid);
      if (b) {
        if (d <= R) { b.hp = 0; g.destroyBuilding(b, null); }
        else g.damageBuilding(b, b.maxHp * (0.9 - (d - R) / (R * 0.5) * 0.6), null);
      }
    }
    const t = w.ter[i];
    if (d <= R) {
      if (d < R * 0.14 && !w.isWater(i)) { w.lower(i); w.lower(i); }                 // crater (fills into a lake)
      else if (t > 2 && t !== T.PEAK && t !== T.MOUNTAIN) {
        if (d < R * 0.55) w.setTer(i, T.ASH);
        else if (TER[t].elev === 4 || t === T.HILLS) w.setTer(i, g.rng.chance(0.6) ? T.WASTE : T.ASH);
      }
      if (w.flora[i]) w.setFlora(i, g.rng.chance(0.25) ? F.DEAD : F.NONE);
      if (g.rng.chance(0.45)) w.ignite(i, 200);                                       // firestorm
    } else if (d <= R * 1.5) {
      if (w.flora[i] && g.rng.chance(0.5)) w.setFlora(i, F.DEAD);
      if (g.rng.chance(0.12)) w.ignite(i, 120);
    }
    w.poll[i] = Math.min(255, w.poll[i] + Math.round(255 * Math.max(0, 1 - d / r0)));
  }
  g.carbon += 200 * big;
  const dead = g.stats.deaths - deaths0;
  const names: string[] = [], hurt: string[] = [];
  for (const c of hit) {
    if (c.dead) continue;
    if (c.members.length === 0) { names.push(c.name); g.destroyCity(c, 'wiped off the map by a nuclear blast'); }
    else hurt.push(c.name);
  }
  if (!test) {
    startFallout(g, x, y, R);
    const parts: string[] = [];
    if (names.length) parts.push(`${names.join(', ')} ${names.length > 1 ? 'were' : 'was'} wiped out`);
    if (hurt.length) parts.push(`${hurt.join(', ')} ${hurt.length > 1 ? 'lie' : 'lies'} in ruins`);
    if (dead > 0 || parts.length) g.log(`☢ ${dead.toLocaleString()} people died in the blast${parts.length ? ' — ' + parts.join('; ') : ''}`, 'nuke', x, y, '#fb4', true);
  }
  if (owner) {
    for (const o of g.kingdoms) if (o !== owner) { const r = o.relation(owner); r.opinion -= 40; r.memory += 40; }
  }
  return { dead, cities: names };
}

export function meteorImpact(g: Game, x: number, y: number): void {
  const w = g.world;
  g.shake = 10;
  g.explode(x, y, 4, 260, null, null, { fire: true, crater: true, bld: 3 });
  for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
    const d = Math.hypot(dx, dy);
    if (d > 4.2) continue;
    const tx = Math.floor(x) + dx, ty = Math.floor(y) + dy;
    if (!w.inb(tx, ty)) continue;
    const i = ty * w.w + tx;
    if (d < 1.6) { w.lower(i); w.lower(i); }
    else if (d < 2.6) w.lower(i);
    else if (!w.isWater(i) && TER[w.ter[i]].elev === 4) w.setTer(i, T.ASH);
  }
  const ci = w.tileAt(x, y);
  if (ci >= 0 && g.rng.chance(0.5)) {
    const nx = Math.floor(x) + 2, ny = Math.floor(y);
    if (w.inb(nx, ny)) {
      const j = ny * w.w + nx;
      if (!w.isWater(j)) { w.setTer(j, T.HILLS); w.res[j] = g.rng.chance(0.5) ? 2 : 5; w.mark(j); }
    }
  }
}

export { ORD };

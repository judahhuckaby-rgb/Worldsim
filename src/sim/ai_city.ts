// City management: food, growth, jobs, construction, territory, loyalty.
import type { Game } from './game';
import { City, Building, Unit } from './entities';
import { UK, JOB, TPY, ADULT_AGE, SOLDIERS, BLD, BldDef, BLD_KEYS, houseCapacity, buildingMaxHp } from './defs';
import { T, F, TER, RES, NUM_RES, isTree, isRoad } from './terrain';
import { SPECIES } from './species';
import { TECH_BY_ID } from './tech';
import { refreshStats } from './ai_units';

const DT = 20;
// per-year rates by era: births per person, child and adult mortality
const BIRTH = [0.04, 0.042, 0.042, 0.043, 0.044, 0.046, 0.044, 0.04, 0.035, 0.032, 0.031, 0.03, 0.03];
const CHILD_MORT = [0.028, 0.025, 0.022, 0.02, 0.015, 0.009, 0.004, 0.002, 0.0012, 0.0008, 0.0006, 0.0005, 0.0004];
const ADULT_MORT = [0.012, 0.011, 0.01, 0.009, 0.007, 0.005, 0.003, 0.002, 0.0015, 0.001, 0.0009, 0.0008, 0.0007];

/** Street grid: every 5th row/column (offset from the town center) is a street. */
export function onGrid(c: City, x: number, y: number): boolean {
  const gx = Math.floor(c.x) + 2, gy = Math.floor(c.y) + 2;
  return (((x - gx) % 5) + 5) % 5 === 0 || (((y - gy) % 5) + 5) % 5 === 0;
}
export function devRadius(c: City): number {
  return Math.max(5, 3 + Math.sqrt(c.buildings.length) * 2.4);
}

export function updateCity(g: Game, c: City): void {
  const k = c.kingdom;
  const caps = k.caps;
  const sp = SPECIES[k.species];
  const pop = c.members.length;
  c.t2++;

  if (pop === 0) {
    c.emptyT += DT;
    if (c.emptyT > TPY * 8) g.destroyCity(c, 'abandoned and fell to ruin');
    return;
  }
  c.emptyT = 0;

  // --- food
  const eat = (pop * DT) / TPY;
  const winter = Math.max(0.35, 1 - g.nuclearWinter * 0.07);
  let passive = ((1.5 + pop * 0.22) * DT / TPY) * caps.foodMult * winter;
  if (c.has('docks')) passive += (4 * DT / TPY) * caps.foodMult;
  c.food += passive - eat;
  const foodCap = 60 + pop * 6;
  if (c.food > foodCap) c.food = foodCap;
  if (c.food < 0) {
    c.food = 0;
    c.starving = true;
    if (g.rng.chance(0.35)) {
      const v = c.members[g.rng.int(pop)];
      g.damageUnit(v, 6, null);
    }
  } else c.starving = false;

  // --- passive production
  const yr = DT / TPY;
  k.res[RES.WOOD] += 0.8 * yr;
  k.res[RES.STONE] += 0.6 * yr;
  for (const b of c.buildings) {
    if (b.progress < 1) continue;
    switch (b.type) {
      case 'mine': k.res[RES.STONE] += 1.2 * yr * caps.mineMult; break;
      case 'market': k.res[RES.GOLD] += (1.5 + k.era * 0.5) * yr; break;
      case 'forge': if (caps.extract.has(RES.METAL)) k.res[RES.METAL] += 1 * yr; break;
      case 'factory': {
        const power = c.has('power') ? 1.5 : 1;
        k.res[RES.WOOD] += 3 * yr * power;
        k.res[RES.STONE] += 3 * yr * power;
        k.res[RES.METAL] += 3 * yr * power * caps.mineMult;
        if (k.res[RES.COAL] > 0.2 && k.caps.pollution > 0.5) k.res[RES.COAL] -= 0.4 * yr;
        break;
      }
    }
  }

  // --- crops ripen in the fields
  const grow = 4 * winter * (c.starving ? 1.2 : 1);
  const W = g.world;
  for (let fi = 0; fi < c.farms.length; fi++) {
    const t = c.farms[fi];
    const old = W.fstate[t];
    if (old >= 255) continue;
    const nv = Math.min(255, old + grow + g.rng.next() * 2);
    W.fstate[t] = nv;
    if ((old >> 6) !== (nv >> 6)) W.mark(t);
  }

  // --- capacity, births and deaths (demographic transition through the eras)
  c.capacity = g.cityCapacity(c);
  let adults = 0;
  const era = k.era;
  const childMort = CHILD_MORT[era] * (1 - caps.plagueResist * 0.4) * (c.starving ? 3 : 1) * yr;
  const adultMort = ADULT_MORT[era] * (c.starving ? 2 : 1) * yr;
  for (let mi = c.members.length - 1; mi >= 0; mi--) {
    const u = c.members[mi];
    const child = u.ageT < ADULT_AGE * TPY;
    if (!child) adults++;
    if (g.laws.oldAge && !u.isKing && g.rng.next() < (child ? childMort : adultMort)) g.killUnit(u, null, null, 'illness');
  }
  const cityCap = 120 + era * 15;
  // near the world population limit, small towns keep growing while big cities level off
  const fill = g.personPop / g.laws.maxPop;
  const roomInWorld = fill < 1 || (fill < 1.06 && pop < 40);
  if (pop < Math.min(c.capacity, cityCap) && c.food > pop * 0.5 + 4 && adults >= 2 && roomInWorld && !c.starving) {
    const rate = (0.25 + pop * BIRTH[era]) * sp.breed * caps.growthMult * yr * (pop < 40 ? 1 : Math.max(0.1, 1 - Math.pow(fill, 6)));
    if (g.rng.chance(Math.min(0.9, rate))) {
      const homes = c.buildings.filter(b => b.type === 'house' && b.progress >= 1);
      const h = homes.length ? homes[g.rng.int(homes.length)] : c.center;
      const x = h ? h.cx : c.x, y = h ? h.y + h.h + 0.2 : c.y;
      g.spawnPerson(k.species, x, y, k, c, 0);
      c.food -= 3;
      g.stats.births++;
    }
  }

  // urbanization: from the Industrial Age, villagers move to the capital, so great cities emerge
  const capC = k.capital;
  if (era >= 5 && fill > 0.85 && capC && capC !== c && !capC.dead && pop > 12 && capC.members.length < Math.min(capC.capacity, cityCap) - 2 && g.rng.chance(0.25)) {
    const u = c.members.find(m => m.ageT >= ADULT_AGE * TPY && m.job !== JOB.SOLDIER && !m.isKing && !m.order && !m.inBoat);
    if (u) {
      g.removeFromCity(u);
      g.addToCity(u, capC);
      u.x = capC.x + g.rng.range(-3, 3);
      u.y = capC.y + g.rng.range(-3, 3);
      u.path = null;
      u.phase = 0;
      u.job = 0;
      u.carry = -1;
    }
  }

  if (c.t2 % 3 === 0) assignJobs(g, c, adults);
  if (c.t2 % 2 === 0) planConstruction(g, c);
  expandTerritory(g, c);
  if (caps.farms && c.t2 % 2 === 1) planFarms(g, c);
  if (c.t2 % 5 === 0) restyle(g, c);
  if (c.t2 % 4 === 2) roads(g, c);
  if (caps.roads >= 1) streets(g, c);
  if (c.t2 % 5 === 1) loyalty(g, c);
  // rebuild a destroyed town center
  if (!c.center && c.t2 % 6 === 0) {
    const bx = Math.floor(c.x) - 1, by = Math.floor(c.y) - 1;
    if (footprintFree(g, c, bx, by, 3, 3, true)) {
      const b = g.placeBuilding(c, BLD.center, bx, by, false);
      c.center = b;
    }
  }
}

// ------------------------------------------------------------------ jobs
function pickSoldierClass(g: Game, c: City): number {
  const k = c.kingdom;
  const best: Record<string, number> = {};
  for (let i = 0; i < SOLDIERS.length; i++) {
    const s = SOLDIERS[i];
    if (s.tech && !k.techs[TECH_BY_ID[s.tech].idx]) continue;
    if (s.needs !== undefined && k.res[s.needs] < 3) continue;
    best[s.role] = i;
  }
  const hasGun = !!k.techs[TECH_BY_ID['gunpowder'].idx];
  const hasRifle = !!k.techs[TECH_BY_ID['rifling'].idx];
  const opts: [number, number][] = [];
  if (best.melee !== undefined) opts.push([best.melee, hasRifle ? 0 : hasGun ? 0.2 : 0.55]);
  if (best.ranged !== undefined) opts.push([best.ranged, hasGun ? 0.65 : 0.4]);
  if (best.siege !== undefined) opts.push([best.siege, 0.1]);
  if (best.vehicle !== undefined) opts.push([best.vehicle, 0.18]);
  let total = 0;
  for (const o of opts) total += o[1];
  let r = g.rng.next() * total;
  for (const o of opts) {
    r -= o[1];
    if (r <= 0) {
      const s = SOLDIERS[o[0]];
      if (s.needs !== undefined) k.res[s.needs] -= 3;
      return o[0];
    }
  }
  return opts.length ? opts[0][0] : 0;
}

function setJob(g: Game, u: Unit, job: number, c: City): void {
  if (u.job === job) return;
  const wasSoldier = u.job === JOB.SOLDIER;
  u.job = job;
  u.phase = 0;
  u.path = null;
  u.tBld0 = null;
  u.order = null;
  if (u.carry >= 0) { if (u.carry === 100) c.food += u.carryAmt; else c.kingdom.res[u.carry] += u.carryAmt; u.carry = -1; u.carryAmt = 0; }
  if (job === JOB.SOLDIER) {
    u.sclass = pickSoldierClass(g, c);
    refreshStats(g, u);
  } else if (wasSoldier) {
    u.sclass = -1;
    refreshStats(g, u);
  }
}

function assignJobs(g: Game, c: City, adults: number): void {
  const k = c.kingdom;
  const caps = k.caps;
  const sp = SPECIES[k.species];
  const workers: Unit[] = [];
  for (const u of c.members) if (u.ageT >= ADULT_AGE * TPY && u.job !== JOB.SETTLER && !u.inBoat && !u.order) workers.push(u);
  const n = workers.length;
  if (n === 0) return;
  const counts = new Array(9).fill(0);
  for (const u of workers) counts[u.job]++;
  // also count soldiers away on orders
  let away = 0;
  for (const u of c.members) if (u.order && u.job === JOB.SOLDIER) away++;

  const want = new Array(9).fill(0);
  const atWar = k.wars > 0;
  let sr = caps.soldierRatio * Math.sqrt(sp.aggression) * (atWar ? 2.2 : 1) + (c.has('barracks') ? 0.05 : 0) + (c.has('castle') ? 0.04 : 0);
  if (n < 5) sr *= 0.5;
  if (k.mobilizeT > g.tick) sr += 0.18; // general mobilization
  want[JOB.SOLDIER] = Math.max(0, Math.round(Math.min(0.45, sr) * (n + away)) - away);
  let sites = 0;
  for (const b of c.buildings) if (b.progress < 1) sites++;
  want[JOB.BUILD] = sites > 0 ? Math.min(sites * 2, 1 + Math.floor(n / 12)) : 0;
  let sch = 0;
  if (c.has('library')) sch += 1;
  if (c.has('university')) sch += 2;
  if (c.has('lab')) sch += 3;
  want[JOB.SCHOLAR] = Math.min(sch, Math.floor(n * 0.2));
  const canMine = c.has('mine') || caps.buildings.has('mine');
  want[JOB.MINE] = canMine ? Math.max(1, Math.round(n * 0.12)) : 0;
  const woodNeed = k.res[RES.WOOD] < 40 + k.era * 15 ? 0.2 : 0.1;
  want[JOB.WOOD] = Math.max(1, Math.round(n * woodNeed * sp.chopsTrees));
  // food workers: whatever remains, at least 30%
  let used = want[JOB.SOLDIER] + want[JOB.BUILD] + want[JOB.SCHOLAR] + want[JOB.MINE] + want[JOB.WOOD];
  const minFood = Math.ceil(n * (c.food < c.members.length * 1.5 ? 0.45 : 0.3));
  if (n - used < minFood) {
    // scale non-food jobs down
    const over = minFood - (n - used);
    for (const j of [JOB.WOOD, JOB.MINE, JOB.SCHOLAR, JOB.BUILD, JOB.SOLDIER]) {
      let cut = Math.min(over, want[j] - (j === JOB.SOLDIER && atWar ? Math.round(want[j] * 0.6) : 0));
      if (cut > 0) { want[j] -= cut; used -= cut; }
      if (n - used >= minFood) break;
    }
  }
  const foodJob = caps.farms && c.farms.length > 0 ? JOB.FARM : JOB.GATHER;
  want[foodJob] += Math.max(0, n - used);
  if (foodJob === JOB.FARM && c.farms.length < want[JOB.FARM] * 1.2) {
    const g2 = Math.max(0, want[JOB.FARM] - Math.ceil(c.farms.length / 1.2));
    want[JOB.FARM] -= g2;
    want[JOB.GATHER] += g2;
  }

  // reassign: release surplus first, then fill deficits
  const pool: Unit[] = [];
  for (let j = 0; j < 9; j++) {
    let surplus = counts[j] - want[j];
    if (surplus <= 0) continue;
    for (let i = workers.length - 1; i >= 0 && surplus > 0; i--) {
      const u = workers[i];
      if (u.job !== j || u.tUnit) continue;
      if (j === JOB.BUILD && u.phase === 2) continue;
      pool.push(u);
      surplus--;
    }
  }
  for (const j of [JOB.SOLDIER, JOB.BUILD, JOB.FARM, JOB.GATHER, JOB.WOOD, JOB.MINE, JOB.SCHOLAR]) {
    let deficit = want[j] - counts[j];
    while (deficit > 0 && pool.length) {
      const u = pool.pop()!;
      setJob(g, u, j, c);
      deficit--;
    }
  }
  for (const u of pool) setJob(g, u, foodJob, c);

  // upgrade soldiers to the newest equipment
  if (k.res[RES.METAL] > 2 || k.era < 2) {
    let upgrades = 0;
    for (const u of c.members) {
      if (u.job !== JOB.SOLDIER || u.sclass < 0 || upgrades > 2) continue;
      const cur = SOLDIERS[u.sclass];
      let better = -1;
      for (let i = SOLDIERS.length - 1; i >= 0; i--) {
        const s = SOLDIERS[i];
        if (s.role !== cur.role || s.era <= cur.era) continue;
        if (s.tech && !k.techs[TECH_BY_ID[s.tech].idx]) continue;
        if (s.needs !== undefined && k.res[s.needs] < 3) continue;
        better = i;
        break;
      }
      if (better < 0 && cur.role === 'melee' && k.techs[TECH_BY_ID['gunpowder'].idx]) {
        for (let i = SOLDIERS.length - 1; i >= 0; i--) {
          const s = SOLDIERS[i];
          if (s.role === 'ranged' && (!s.tech || k.techs[TECH_BY_ID[s.tech].idx])) { better = i; break; }
        }
      }
      if (better >= 0) {
        if (SOLDIERS[better].needs !== undefined) k.res[SOLDIERS[better].needs!] -= 3;
        if (k.era >= 2) k.res[RES.METAL] = Math.max(0, k.res[RES.METAL] - 1);
        u.sclass = better;
        refreshStats(g, u);
        upgrades++;
      }
    }
  }
}

// ------------------------------------------------------------------ construction
function afford(k: City['kingdom'], cost: number[], mult = 1): boolean {
  for (let i = 0; i < NUM_RES; i++) if (cost[i] * mult > k.res[i] + 0.001) return false;
  return true;
}
function pay(k: City['kingdom'], cost: number[], mult = 1): void {
  for (let i = 0; i < NUM_RES; i++) k.res[i] -= cost[i] * mult;
}

function costFor(def: BldDef, era: number): { cost: number[]; mult: number } {
  if (def.key === 'house') {
    const cost = [6 + Math.min(era, 6), era >= 1 ? 2 + Math.min(era, 4) + (era >= 5 ? 2 : 0) : 0, era >= 5 ? Math.min(6, era - 3) : 0, 0, 0, 0, 0];
    return { cost, mult: 1 };
  }
  if (era >= 5 && def.cost[1] > 0) {
    // steel and concrete: industrial nations build with metal instead of quarried stone
    const cost = def.cost.slice();
    cost[2] += Math.round(cost[1] * 0.3);
    cost[1] = Math.round(cost[1] * 0.5);
    return { cost, mult: 1 + era * 0.05 };
  }
  return { cost: def.cost, mult: 1 + era * 0.05 };
}

function footprintFree(g: Game, c: City, x: number, y: number, w: number, h: number, ignoreGap = false, overRoads = false): boolean {
  const W = g.world;
  for (let dy = -1; dy <= h; dy++) {
    for (let dx = -1; dx <= w; dx++) {
      const tx = x + dx, ty = y + dy;
      if (!W.inb(tx, ty)) return false;
      const i = ty * W.w + tx;
      const inside = dx >= 0 && dy >= 0 && dx < w && dy < h;
      if (inside) {
        const t = W.ter[i];
        if (!TER[t].build && t !== T.ROAD && !(overRoads && t === T.PAVED)) return false;
        if (W.bld[i]) return false;
        if (W.owner[i] && W.owner[i] !== c.id) return false;
        if (W.fire[i]) return false;
      } else if (!ignoreGap && W.bld[i]) return false;
    }
  }
  return true;
}

function inBlock(g: Game, c: City, x: number, y: number, w: number, h: number): boolean {
  const W = g.world;
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) {
    if (onGrid(c, x + dx, y + dy)) return false;
    if (W.inb(x + dx, y + dy) && isRoad(W.ter[(y + dy) * W.w + x + dx])) return false;
  }
  return true;
}

export function findSpot(g: Game, c: City, def: BldDef, outskirts = false): { x: number; y: number } | null {
  const W = g.world;
  const R = 4 + Math.sqrt(c.tiles.length / 3.14) + (outskirts ? 6 : 0);
  // big complexes that no longer fit a city block go up on the outskirts instead
  const grid = !outskirts && c.kingdom.caps.roads >= 1 && def.place !== 'coast' && def.place !== 'mine' && def.w <= 4 && def.h <= 4;
  const gx = Math.floor(c.x) + 2, gy = Math.floor(c.y) + 2;
  let best: { x: number; y: number } | null = null;
  let bs = -1e9;
  for (let tries = 0; tries < 90; tries++) {
    const ang = g.rng.next() * Math.PI * 2;
    // outskirts: a ring just inside and beyond the city limits
    const rr = outskirts ? R - 10 + g.rng.next() * 12 : 2.5 + Math.sqrt(g.rng.next()) * R;
    let x = Math.round(c.x + Math.cos(ang) * rr - def.w / 2);
    let y = Math.round(c.y + Math.sin(ang) * rr - def.h / 2);
    if (grid) {
      // snap into a city block, flush against a street
      const bxI = Math.floor((x - gx) / 5), byI = Math.floor((y - gy) / 5);
      const slackX = 4 - def.w, slackY = 4 - def.h;
      x = gx + bxI * 5 + 1 + (g.rng.chance(0.5) ? 0 : slackX);
      y = gy + byI * 5 + 1 + (g.rng.chance(0.5) ? 0 : slackY);
      if (!inBlock(g, c, x, y, def.w, def.h)) continue;
    }
    if (!footprintFree(g, c, x, y, def.w, def.h, grid, outskirts)) continue;
    const cx = x + def.w / 2, cy = y + def.h / 2;
    const d = Math.hypot(cx - c.x, cy - c.y);
    let score = -d;
    let owned = 0;
    for (let dy = 0; dy < def.h; dy++) for (let dx = 0; dx < def.w; dx++) if (W.owner[(y + dy) * W.w + x + dx] === c.id) owned++;
    if (owned < def.w * def.h) score -= 6;
    if (def.place === 'edge') score = d * 1.2 - (owned < def.w * def.h ? 20 : 0);
    if (def.place === 'coast' || def.place === 'mine') {
      let hit = 0;
      for (let dy = -1; dy <= def.h; dy++) for (let dx = -1; dx <= def.w; dx++) {
        const tx = x + dx, ty = y + dy;
        if (!W.inb(tx, ty)) continue;
        const i = ty * W.w + tx;
        if (def.place === 'coast' && W.isWater(i) && W.waterSize[W.water[i]] > 60) hit++;
        if (def.place === 'mine' && (W.ter[i] === T.HILLS || W.ter[i] === T.MOUNTAIN || W.res[i] > 0)) hit++;
      }
      if (hit === 0) continue;
      score += hit * 2;
    }
    // avoid destroying farms
    for (let dy = 0; dy < def.h; dy++) for (let dx = 0; dx < def.w; dx++) if (W.ter[(y + dy) * W.w + x + dx] === T.FARM) score -= 3;
    if (score > bs) { bs = score; best = { x, y }; }
  }
  return best;
}

const NATIONAL = new Set(['silo', 'spaceport', 'airbase', 'lab']);
const SPECIAL_ORDER = ['temple', 'mine', 'library', 'barracks', 'docks', 'tower', 'forge', 'market', 'university', 'hospital', 'castle', 'factory', 'power', 'lab', 'airbase', 'silo', 'spaceport', 'tower'];

function planConstruction(g: Game, c: City): void {
  const k = c.kingdom;
  const caps = k.caps;
  const pop = c.members.length;
  let sites = 0;
  for (const b of c.buildings) if (b.progress < 1) sites++;
  if (sites >= 2 + Math.floor(pop / 40)) return;
  const room = c.capacity - pop;
  const tryBuild = (key: string): boolean => {
    const def = BLD[key];
    let { cost, mult } = costFor(def, k.era);
    if (!afford(k, cost, mult)) {
      // treeless lands build homes from mud brick and stone instead of timber
      if (key !== 'house') return false;
      cost = [0, cost[0] + cost[1], cost[2], 0, 0, 0, 0];
      if (!afford(k, cost, mult)) return false;
    }
    let spot = findSpot(g, c, def);
    if (!spot && (def.w >= 3 || def.h >= 3 || NATIONAL.has(key)) && def.place !== 'coast' && def.place !== 'mine') spot = findSpot(g, c, def, true);
    if (!spot) return false;
    pay(k, cost, mult);
    const b = g.placeBuilding(c, def, spot.x, spot.y, false);
    if (caps.roads >= 1 && (def.place === 'coast' || def.place === 'mine')) buildRoad(g, c, b);
    return true;
  };
  const cityCap = 120 + k.era * 15;
  if (room < 3 + Math.floor(pop / 20) && c.count('house') < BLD.house.max && pop < cityCap) {
    if (tryBuild('house')) return;
  }
  if (g.rng.chance(0.5)) {
    let attempts = 0;
    for (const key of SPECIAL_ORDER) {
      const def = BLD[key];
      if (!caps.buildings.has(key)) continue;
      if (c.count(key) >= def.max) continue;
      const national = NATIONAL.has(key);
      if (national) {
        // national projects are sized by the whole nation and go up in the capital or any big city
        if (k.pop < def.minPop * 2 || (k.capital !== c && pop < 20)) continue;
        let have = 0;
        for (const o of k.cities) have += o.count(key);
        const n = k.cities.length;
        const limit = key === 'airbase' ? 1 + Math.floor(n / 6) : key === 'silo' ? 1 + Math.floor(n / 10) : key === 'lab' ? 1 + Math.floor(n / 5) : 1;
        if (have >= limit) continue;
      } else if (pop < def.minPop * 0.7) continue;
      if (key === 'tower' && c.count('tower') >= Math.min(def.max, 1 + Math.floor(pop / 25))) continue;
      if ((c.skip.get(key) || 0) > g.tick) continue;
      if (tryBuild(key)) return;
      // can't afford or place this one yet: shelve it for a few years and consider the next project
      c.skip.set(key, g.tick + TPY * (3 + g.rng.int(4)));
      if (++attempts >= 3) break;
    }
  }
  if (room < 6 && pop < cityCap && g.rng.chance(0.5)) tryBuild('house');
}

function buildRoad(g: Game, c: City, b: Building): void {
  const W = g.world;
  if (!c.center) return;
  let x = Math.floor(b.cx), y = b.y + b.h;
  const tx = Math.floor(c.center.cx), ty = c.center.y + c.center.h;
  for (let s = 0; s < 60; s++) {
    if (!W.inb(x, y)) return;
    const i = y * W.w + x;
    if (W.isWater(i)) return;
    if (W.bld[i] && W.bld[i] !== b.id) { if (W.bld[i] === c.center.id) return; }
    else if (!W.bld[i]) {
      const t = W.ter[i];
      if (!isRoad(t) && TER[t].build && t !== T.FARM) {
        W.setTer(i, c.kingdom.caps.roads >= 2 ? T.PAVED : T.ROAD);
        W.setFlora(i, F.NONE);
      }
    }
    if (x === tx && y === ty) return;
    const dx = tx - x, dy = ty - y;
    if (Math.abs(dx) > Math.abs(dy)) x += Math.sign(dx);
    else y += Math.sign(dy);
  }
}

function roads(g: Game, c: City): void {
  const k = c.kingdom;
  if (k.caps.roads < 1 || !c.center || c.buildings.length === 0) return;
  if (k.caps.roads >= 2) {
    const W = g.world;
    let n = 0;
    for (let s = 0; s < 20 && n < 4; s++) {
      const i = c.tiles[g.rng.int(c.tiles.length)];
      if (W.ter[i] === T.ROAD) { W.setTer(i, T.PAVED); n++; }
    }
  }
}

/** Lay out the street grid, growing outward from the town center a few tiles at a time. */
function streets(g: Game, c: City): void {
  const W = g.world;
  const k = c.kingdom;
  if (!c.center) return;
  const R = devRadius(c) + 1.5;
  const cand: number[] = [];
  const b = c.center;
  for (let y = b.y - 1; y <= b.y + b.h; y++) for (let x = b.x - 1; x <= b.x + b.w; x++) {
    if (W.inb(x, y) && onGrid(c, x, y)) cand.push(y * W.w + x);
  }
  for (let s = 0; s < 40 && c.tiles.length; s++) {
    const i = c.tiles[g.rng.int(c.tiles.length)];
    if (!isRoad(W.ter[i])) continue;
    const x = i % W.w, y = (i / W.w) | 0;
    if (x > 0 && onGrid(c, x - 1, y)) cand.push(i - 1);
    if (x < W.w - 1 && onGrid(c, x + 1, y)) cand.push(i + 1);
    if (y > 0 && onGrid(c, x, y - 1)) cand.push(i - W.w);
    if (y < W.h - 1 && onGrid(c, x, y + 1)) cand.push(i + W.w);
  }
  const valid = cand.filter(i => {
    if (W.owner[i] !== c.id || W.bld[i]) return false;
    const t = W.ter[i];
    if (isRoad(t) || !(TER[t].build || t === T.FARM)) return false;
    const x = i % W.w, y = (i / W.w) | 0;
    return Math.hypot(x + 0.5 - c.x, y + 0.5 - c.y) <= R;
  });
  valid.sort((a, b2) => {
    const ax = a % W.w, ay = (a / W.w) | 0, bx = b2 % W.w, by = (b2 / W.w) | 0;
    return Math.hypot(ax - c.x, ay - c.y) - Math.hypot(bx - c.x, by - c.y);
  });
  let laid = 0;
  for (const i of valid) {
    if (laid >= 2) break;
    if (isRoad(W.ter[i])) continue;
    if (k.res[RES.WOOD] < 0.3) break;
    k.res[RES.WOOD] -= 0.3;
    W.setTer(i, k.caps.roads >= 2 ? T.PAVED : T.ROAD);
    if (W.flora[i] !== F.NONE) W.setFlora(i, F.NONE);
    laid++;
  }
}

// ------------------------------------------------------------------ farms
function planFarms(g: Game, c: City): void {
  const W = g.world;
  // drop invalid farms
  for (let i = c.farms.length - 1; i >= 0; i--) {
    const t = c.farms[i];
    if (W.ter[t] !== T.FARM || W.owner[t] !== c.id) c.farms.splice(i, 1);
  }
  const target = Math.min(70, Math.ceil(c.members.length * 0.55) + 2);
  if (c.farms.length >= target) return;
  let added = 0;
  for (let tries = 0; tries < 40 && added < 2; tries++) {
    const i = c.tiles[g.rng.int(c.tiles.length)];
    const t = W.ter[i];
    if (W.bld[i] || t === T.FARM || t === T.ROAD || t === T.PAVED || !TER[t].build || TER[t].fert < 0.3 || t === T.HILLS) continue;
    const x = i % W.w, y = (i / W.w) | 0;
    const d = Math.hypot(x + 0.5 - c.x, y + 0.5 - c.y);
    const core = c.kingdom.caps.roads >= 1 ? devRadius(c) + 1 : 3;
    if (d < core) continue;
    let adj = 0, nearB = false;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!W.inb(x + dx, y + dy)) continue;
      const j = (y + dy) * W.w + x + dx;
      if (W.ter[j] === T.FARM) adj++;
      if (W.bld[j]) nearB = true;
    }
    if (nearB) continue;
    if (c.farms.length > 0 && adj === 0 && g.rng.chance(0.75)) continue;
    if (d > core + 2 + Math.sqrt(c.tiles.length) * 0.6) continue;
    W.biome[i] = TER[t].elev === 4 && t !== T.ASH && t !== T.WASTE ? t : W.biome[i];
    W.setTer(i, T.FARM);
    W.fstate[i] = g.rng.int(100);
    c.farms.push(i);
    added++;
  }
}

// ------------------------------------------------------------------ territory
function expandTerritory(g: Game, c: City): void {
  const W = g.world;
  const k = c.kingdom;
  const pop = c.members.length;
  const target = 45 + pop * 4.5 + k.era * 10;
  if (c.tiles.length >= target) return;
  const maxR = 7 + c.level * 3 + k.era * 0.6;
  for (let rep = 0; rep < 2; rep++) {
    let best = -1, bd = 1e9;
    for (let s = 0; s < 14; s++) {
      const i = c.tiles[g.rng.int(c.tiles.length)];
      const x = i % W.w, y = (i / W.w) | 0;
      for (let d = 0; d < 4; d++) {
        const nx = x + (d === 0 ? 1 : d === 1 ? -1 : 0), ny = y + (d === 2 ? 1 : d === 3 ? -1 : 0);
        if (!W.inb(nx, ny)) continue;
        const j = ny * W.w + nx;
        if (W.owner[j]) continue;
        if (W.ter[j] < 2) continue;
        const dist = Math.hypot(nx + 0.5 - c.x, ny + 0.5 - c.y);
        if (dist > maxR) continue;
        const score = dist + (W.isWater(j) ? 3 : 0) + g.rng.next();
        if (score < bd) { bd = score; best = j; }
      }
    }
    if (best >= 0) g.claimTile(c, best);
  }
}

// ------------------------------------------------------------------ restyle with the ages
function restyle(g: Game, c: City): void {
  const k = c.kingdom;
  let n = 0;
  for (const b of c.buildings) {
    if (b.progress < 1 || b.style >= k.era) continue;
    if (n >= 2) break;
    const woodCost = 2 + k.era, stoneCost = k.era;
    if (k.res[RES.WOOD] < woodCost || k.res[RES.STONE] < stoneCost) break;
    k.res[RES.WOOD] -= woodCost;
    k.res[RES.STONE] -= stoneCost;
    const ratio = b.hp / b.maxHp;
    b.style = Math.min(k.era, b.style + 1 + Math.floor((k.era - b.style) / 3));
    b.maxHp = buildingMaxHp(b.def, b.style);
    b.hp = b.maxHp * ratio;
    n++;
  }
  if (n) c.capacity = g.cityCapacity(c);
}

// ------------------------------------------------------------------ loyalty / rebellion
function loyalty(g: Game, c: City): void {
  const k = c.kingdom;
  const cap = k.capital;
  let L = 50 + k.caps.loyalty * 0.6;
  if (cap === c) L += 60;
  else if (cap) L -= Math.hypot(cap.x - c.x, cap.y - c.y) / (3.2 + k.caps.roads * 1.4); // roads and railways knit a nation together
  if (c.conquered > 0) L -= Math.max(0, 40 - (g.year - c.conquered)) * 0.8;
  if (c.has('temple')) L += 12;
  if (c.has('castle')) L += 15;
  let other = 0;
  for (const u of c.members) if (u.species !== k.species) other++;
  if (c.members.length) L -= (other / c.members.length) * 40;
  if (c.starving) L -= 25;
  L -= k.wars * 8;
  L -= Math.max(0, k.cities.length - 5) * 2.5 + Math.max(0, k.cities.length - 14) * 3;
  if (k.ascended) L += 40;
  c.loyalty += (L - c.loyalty) * 0.3;
  if (g.laws.rebellions && c.loyalty < -10 && cap !== c && k.cities.length > 2 && c.members.length >= 12) {
    c.revoltT++;
    if (c.revoltT > 14 && g.rng.chance(0.15)) rebel(g, c);
  } else c.revoltT = Math.max(0, c.revoltT - 1);
}

export function rebel(g: Game, c: City): void {
  const old = c.kingdom;
  // majority species leads the revolt
  const counts = [0, 0, 0, 0];
  for (const u of c.members) counts[u.species]++;
  let sp = 0;
  for (let i = 1; i < counts.length; i++) if (counts[i] > counts[sp]) sp = i;
  const nk = g.createKingdom(sp, old);
  const oi = old.cities.indexOf(c);
  if (oi >= 0) old.cities.splice(oi, 1);
  if (old.capital === c) old.capital = old.cities[0] || null;
  nk.cities.push(c);
  nk.capital = c;
  c.kingdom = nk;
  c.loyalty = 50;
  c.revoltT = 0;
  for (const u of c.members) { u.kingdom = nk; u.order = null; u.isKing = false; }
  const leader = c.members.find(u => u.ageT >= ADULT_AGE * TPY);
  if (leader) { nk.king = leader; leader.isKing = true; refreshStats(g, leader); }
  for (const b of c.buildings) b.style = Math.min(b.style, nk.era);
  for (const i of c.tiles) g.world.markN(i);
  g.log(`${c.name} rebelled against ${g.kName(old)} and declared independence as ${g.kName(nk)}`, 'revolt', c.x, c.y, nk.css, true);
  if (old.alive && old.cities.length) g.declareWar(old, nk, 'to crush the rebellion');
  if (old.cities.length === 0) g.destroyKingdom(old, nk);
}

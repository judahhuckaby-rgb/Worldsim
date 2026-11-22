// Per-unit behaviour: movement, jobs, combat, animals, monsters, vehicles.
import type { Game } from './game';
import { P } from './game';
import { Unit, Building, City, ORD } from './entities';
import { UK, UDEF, JOB, TPY, ADULT_AGE, SOLDIERS, SHIPS, PLANES } from './defs';
import { T, F, TER, R, RES, isTree, depositToRes } from './terrain';
import { SPECIES, TR } from './species';

// ------------------------------------------------------------------ stats
export function refreshStats(g: Game, u: Unit): void {
  const ratio = u.maxHp > 0 ? u.hp / u.maxHp : 1;
  const d = UDEF[u.kind];
  if (u.kind === UK.PERSON) {
    const sp = SPECIES[u.species];
    let hp = 30, atk = 2, def = 0, range = 1.2, cd = 20, speed = 0.07;
    if (u.sclass >= 0) {
      const s = SOLDIERS[u.sclass];
      hp = s.hp; atk = s.atk; def = s.def; range = s.range; cd = s.cd; speed = 0.07 * s.speed;
    } else if (u.kingdom) {
      // civilians get tougher with the ages too
      hp += u.kingdom.era * 3;
      atk += u.kingdom.era * 0.5;
    }
    hp *= sp.hp * (u.traits & TR.TOUGH ? 1.3 : 1) * (u.traits & TR.FRAIL ? 0.75 : 1) * (1 + (u.level - 1) * 0.12);
    atk *= sp.atk * (u.traits & TR.STRONG ? 1.3 : 1) * (u.traits & TR.WARLIKE ? 1.2 : 1) * (1 + (u.level - 1) * 0.1);
    speed *= sp.speed * (u.traits & TR.SWIFT ? 1.25 : 1);
    if (u.ageT < ADULT_AGE * TPY) { hp *= 0.5; atk *= 0.3; speed *= 0.8; }
    if (u.isKing) { hp *= 1.5; atk *= 1.3; }
    u.maxHp = Math.round(hp);
    u.atk = atk;
    u.def = def;
    u.range = range;
    u.cdMax = cd;
    u.speed = speed;
  } else if (u.kind === UK.BOAT) {
    const s = SHIPS[u.vclass];
    u.maxHp = s.hp; u.atk = s.atk; u.range = s.range; u.cdMax = s.cd; u.speed = s.speed;
  } else if (u.kind === UK.PLANE) {
    const s = PLANES[u.vclass];
    u.maxHp = s.hp; u.atk = s.atk; u.cdMax = s.cd; u.speed = s.speed;
  } else {
    u.maxHp = Math.round(d.hp * (1 + (u.level - 1) * 0.15));
    u.atk = d.atk * (1 + (u.level - 1) * 0.1);
  }
  u.hp = Math.max(1, Math.min(u.maxHp, Math.round(u.maxHp * ratio)));
}

// ------------------------------------------------------------------ movement
function lineClear(g: Game, x0: number, y0: number, x1: number, y1: number, aquatic: boolean): boolean {
  const w = g.world;
  const dx = x1 - x0, dy = y1 - y0;
  const d = Math.sqrt(dx * dx + dy * dy);
  const steps = Math.ceil(d * 2);
  for (let s = 1; s <= steps; s++) {
    const i = w.tileAt(x0 + (dx * s) / steps, y0 + (dy * s) / steps);
    if (i < 0) return false;
    if (aquatic ? !w.isWater(i) : !w.walk(i)) return false;
  }
  return true;
}

export function goTo(g: Game, u: Unit, tx: number, ty: number): boolean {
  const w = g.world;
  const d = UDEF[u.kind];
  tx = Math.max(0.1, Math.min(w.w - 0.1, tx));
  ty = Math.max(0.1, Math.min(w.h - 0.1, ty));
  u.tx = tx;
  u.ty = ty;
  const ti = w.tileAt(tx, ty);
  if (d.flying) {
    u.path = [ti];
    u.pathI = 0;
    return true;
  }
  const sx = Math.floor(u.x), sy = Math.floor(u.y), ex = Math.floor(tx), ey = Math.floor(ty);
  const man = Math.abs(ex - sx) + Math.abs(ey - sy);
  const aq = !!d.aquatic;
  if (man <= 1 || (man < 16 && lineClear(g, u.x, u.y, tx, ty, aq))) {
    u.path = [ti];
    u.pathI = 0;
    return true;
  }
  if (u.pathFailT > g.tick) return false;
  // unreachable targets (other island / other sea) fail instantly
  const si = sy * w.w + sx;
  if (aq) {
    const wb = w.water[si];
    if (wb >= 0 && !w.isWater(ti)) {
      const ni = w.nearestWater(tx, ty, 1, wb);
      if (ni < 0) { u.pathFailT = g.tick + 40; return false; }
    } else if (wb >= 0 && w.water[ti] !== wb) { u.pathFailT = g.tick + 40; return false; }
  } else {
    const is = w.island[si], it = w.island[ti];
    if (is >= 0 && it >= 0 && is !== it) { u.pathFailT = g.tick + 40; return false; }
  }
  if (g.pathBudget <= 0) return false;
  g.pathBudget--;
  const p = g.pf.find(w, sx, sy, ex, ey, aq ? 1 : 0, Math.min(4000, 250 + man * 25));
  if (!p || p.length === 0) { u.pathFailT = g.tick + 30 + (u.id % 30); return false; }
  u.path = p;
  u.pathI = 0;
  return true;
}

/** Advance along path. Returns true when arrived (or path invalid). */
export function moveStep(g: Game, u: Unit): boolean {
  const p = u.path;
  if (!p) return true;
  if (u.pathI >= p.length) { u.path = null; return true; }
  const w = g.world;
  const d = UDEF[u.kind];
  const ni = p[u.pathI];
  const last = u.pathI === p.length - 1;
  let nx: number, ny: number;
  if (last && w.tileAt(u.tx, u.ty) === ni) { nx = u.tx; ny = u.ty; }
  else { nx = (ni % w.w) + 0.5; ny = ((ni / w.w) | 0) + 0.5; }
  if (!d.flying) {
    const ok = d.aquatic ? w.isWater(ni) : w.walk(ni);
    if (!ok) {
      u.path = null;
      return true;
    }
  }
  let sp = u.speed;
  if (!d.flying && !d.aquatic) {
    const ti = w.tileAt(u.x, u.y);
    if (ti >= 0) sp *= Math.max(0.3, TER[w.ter[ti]].move || 0.5);
    if (u.kingdom) sp *= u.kingdom.caps.speedMult;
  }
  if (u.blessT > 0) sp *= 1.25;
  if (u.curseT > 0) sp *= 0.7;
  const dx = nx - u.x, dy = ny - u.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (Math.abs(dx) > 0.02) u.facing = dx < 0 ? -1 : 1;
  u.moving = true;
  if (dist <= sp) {
    u.x = nx;
    u.y = ny;
    u.pathI++;
    if (u.pathI >= p.length) { u.path = null; return true; }
  } else {
    u.x += (dx / dist) * sp;
    u.y += (dy / dist) * sp;
  }
  return false;
}

function flyStep(u: Unit, tx: number, ty: number): boolean {
  const dx = tx - u.x, dy = ty - u.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (Math.abs(dx) > 0.02) u.facing = dx < 0 ? -1 : 1;
  u.moving = true;
  if (d <= u.speed) { u.x = tx; u.y = ty; return true; }
  u.x += (dx / d) * u.speed;
  u.y += (dy / d) * u.speed;
  return false;
}

function wander(g: Game, u: Unit, cx: number, cy: number, r: number): void {
  const w = g.world;
  for (let i = 0; i < 6; i++) {
    const tx = cx + g.rng.range(-r, r), ty = cy + g.rng.range(-r, r);
    const ti = w.tileAt(tx, ty);
    if (ti < 0) continue;
    const d = UDEF[u.kind];
    if (d.flying || (d.aquatic ? w.isWater(ti) : w.walk(ti) && w.ter[ti] !== T.LAVA && w.fire[ti] === 0)) {
      if (!d.flying && !d.aquatic && w.island[ti] !== w.island[w.tileAt(u.x, u.y)]) continue;
      goTo(g, u, tx, ty);
      return;
    }
  }
}

function findHostile(g: Game, u: Unit, r: number): Unit | null {
  if (u.madT <= 0 && !UDEF[u.kind].monster && !g.spatial.anyDanger(u.x, u.y, r)) return null;
  let best: Unit | null = null;
  let bd = 1e9;
  const air = g.canHitAir(u);
  g.spatial.query(u.x, u.y, r, (o, d2) => {
    if (o === u || d2 >= bd) return;
    if (!g.hostile(u, o)) return;
    if (UDEF[o.kind].flying && !air) return;
    bd = d2;
    best = o;
  });
  return best;
}

function flee(g: Game, u: Unit, from: Unit): void {
  let dx = u.x - from.x, dy = u.y - from.y;
  const d = Math.hypot(dx, dy) || 1;
  dx /= d; dy /= d;
  let tx = u.x + dx * 6, ty = u.y + dy * 6;
  if (u.city && u.city.center && Math.hypot(from.x - u.city.x, from.y - u.city.y) > 6) { tx = u.city.x; ty = u.city.y; }
  goTo(g, u, tx, ty);
  u.phase = 0;
  u.timer = 0;
}

// ------------------------------------------------------------------ search helpers
function spiral(g: Game, cx: number, cy: number, r: number, pred: (i: number) => boolean, randomize = 0): number {
  const w = g.world;
  const x0 = Math.floor(cx), y0 = Math.floor(cy);
  let found = -1, count = 0;
  for (let rad = 0; rad <= r; rad++) {
    for (let dy = -rad; dy <= rad; dy++) {
      for (let dx = -rad; dx <= rad; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== rad) continue;
        const x = x0 + dx, y = y0 + dy;
        if (x < 0 || y < 0 || x >= w.w || y >= w.h) continue;
        const i = y * w.w + x;
        if (pred(i)) {
          if (randomize <= 0) return i;
          count++;
          if (found < 0 || g.rng.chance(1 / count)) found = i;
          if (count >= randomize) return found;
        }
      }
    }
    if (found >= 0 && rad >= 2) return found;
  }
  return found;
}

function dropPoint(c: City): { x: number; y: number } {
  if (c.center) return { x: c.center.cx, y: c.center.y + c.center.h + 0.3 };
  return { x: c.x, y: c.y };
}

function deposit(g: Game, u: Unit): void {
  const c = u.city;
  if (!c || u.carry < 0) return;
  if (u.carry === 100) c.food += u.carryAmt;
  else c.kingdom.res[u.carry] += u.carryAmt;
  u.carry = -1;
  u.carryAmt = 0;
}

function returnHome(g: Game, u: Unit): void {
  const c = u.city!;
  const dp = dropPoint(c);
  if (!goTo(g, u, dp.x + g.rng.range(-0.8, 0.8), dp.y)) { u.thinkT = 3; return; }
  u.phase = 3;
}

function nearTarget(u: Unit, r = 1.2): boolean {
  return Math.abs(u.x - u.tx) < r && Math.abs(u.y - u.ty) < r;
}

// ------------------------------------------------------------------ main update
export function updateUnit(g: Game, u: Unit): void {
  const w = g.world;
  const d = UDEF[u.kind];
  u.ageT++;
  if (u.cd > 0) u.cd--;
  if (u.anim > 0) u.anim--;
  if (u.hitFlash > 0) u.hitFlash--;
  if (u.blessT > 0) u.blessT--;
  if (u.curseT > 0) u.curseT--;
  if (u.madT > 0) u.madT--;
  if (u.immune > 0) u.immune--;
  u.moving = false;

  const ti = w.tileAt(u.x, u.y);
  if (ti < 0) { u.x = Math.max(0.5, Math.min(w.w - 0.5, u.x)); u.y = Math.max(0.5, Math.min(w.h - 0.5, u.y)); return; }

  // hazards (checked every few ticks)
  if ((g.tick + u.id) % 5 === 0) {
    if (!d.flying) {
      if (w.fire[ti] > 0 && u.kind !== UK.DRAGON) g.damageUnit(u, 6, null);
      if (w.ter[ti] === T.LAVA && u.kind !== UK.GOLEM) g.damageUnit(u, 25, null);
      if (!d.aquatic && w.isWater(ti)) {
        g.damageUnit(u, u.kind === UK.PERSON ? 3 : 5, null);
        if (!u.dead) {
          const li = w.nearestLand(u.x, u.y, 8);
          if (li >= 0) { u.tUnit = null; goTo(g, u, (li % w.w) + 0.5, ((li / w.w) | 0) + 0.5); }
        }
      }
      if (d.aquatic && !w.isWater(ti)) {
        g.damageUnit(u, 8, null);
        if (!u.dead) { const wi = w.nearestWater(u.x, u.y, 6); if (wi >= 0) { u.x = (wi % w.w) + 0.5; u.y = ((wi / w.w) | 0) + 0.5; } }
      }
      if (w.poll[ti] > 170 && u.kind === UK.PERSON) g.damageUnit(u, 1, null);
    }
    if (u.plague > 0) plagueTick(g, u);
    if (u.dead) return;
    // natural healing
    if (u.hp < u.maxHp && !u.tUnit) {
      const heal = u.kingdom ? u.kingdom.caps.healRate : 0.02;
      u.hp = Math.min(u.maxHp, u.hp + u.maxHp * heal * 0.5);
    }
  }

  if (g.laws.oldAge && u.ageT > u.lifeT * (u.kingdom ? u.kingdom.caps.lifeMult : 1) && u.kind !== UK.BOAT && u.kind !== UK.PLANE) {
    g.killUnit(u, null, null, 'old age');
    return;
  }
  // child grows up
  if (u.kind === UK.PERSON && u.ageT === ADULT_AGE * TPY) refreshStats(g, u);

  if (--u.thinkT <= 0) {
    u.thinkT = 8 + (u.id % 7);
    think(g, u);
    if (u.dead) return;
  }
  act(g, u);
}

function plagueTick(g: Game, u: Unit): void {
  u.plague++;
  const resist = u.kingdom ? u.kingdom.caps.plagueResist : 0;
  g.damageUnit(u, Math.max(0.3, 1.4 * (1 - resist)), null);
  if (u.dead) return;
  if (g.laws.plague && g.rng.chance(0.35 * (1 - resist * 0.8))) {
    g.spatial.query(u.x, u.y, 1.8, o => {
      if (o !== u && o.kind === u.kind && o.plague === 0 && o.immune === 0 && g.rng.chance(0.25)) o.plague = 1;
    });
  }
  if (u.plague > 150 && g.rng.chance(0.04 + resist * 0.1)) { u.plague = 0; u.immune = TPY * 15; }
}

function think(g: Game, u: Unit): void {
  switch (u.kind) {
    case UK.PERSON: thinkPerson(g, u); break;
    case UK.SHEEP: case UK.DEER: case UK.CHICKEN: case UK.FISH: thinkHerbivore(g, u); break;
    case UK.WOLF: case UK.BEAR: thinkPredator(g, u); break;
    case UK.DRAGON: case UK.UFO: case UK.GOLEM: case UK.KRAKEN: case UK.ZOMBIE: thinkMonster(g, u); break;
    case UK.BOAT: thinkBoat(g, u); break;
    case UK.PLANE: thinkPlane(g, u); break;
  }
}

function act(g: Game, u: Unit): void {
  if (u.kind === UK.PLANE) { actPlane(g, u); return; }
  if (u.tUnit) { combatAct(g, u); return; }
  if (u.tBld) { buildingAttackAct(g, u); return; }
  if (u.kind === UK.PERSON && u.phase === 2) { workAct(g, u); return; }
  if (u.path) {
    const arrived = moveStep(g, u);
    if (arrived) onArrive(g, u);
  }
}

// ------------------------------------------------------------------ combat
function combatAct(g: Game, u: Unit): void {
  const t = u.tUnit!;
  const hunting = u.kind === UK.PERSON && UDEF[t.kind].herb && u.job === JOB.GATHER;
  if (t.dead || t.inBoat || !(hunting || g.hostile(u, t))) { u.tUnit = null; u.stuck = 0; return; }
  const df = UDEF[u.kind];
  if (UDEF[t.kind].flying && !g.canHitAir(u)) { u.tUnit = null; return; }
  const dx = t.x - u.x, dy = t.y - u.y;
  const d2 = dx * dx + dy * dy;
  const r = u.range + (t.kind === UK.DRAGON || t.kind === UK.KRAKEN ? 1 : 0.2);
  if (d2 <= r * r) {
    u.path = null;
    if (Math.abs(dx) > 0.05) u.facing = dx < 0 ? -1 : 1;
    if (u.cd <= 0) {
      g.attack(u, t);
      u.cd = Math.round(u.cdMax * (u.curseT > 0 ? 1.3 : 1));
    }
  } else {
    if (d2 > 22 * 22) { u.tUnit = null; return; }
    if (df.flying) { flyStep(u, t.x, t.y); return; }
    if (!u.path || (g.tick + u.id) % 14 === 0) {
      if (!goTo(g, u, t.x, t.y)) {
        if (++u.stuck > 6) { u.tUnit = null; u.stuck = 0; }
        return;
      }
    }
    moveStep(g, u);
  }
}

function buildingAttackAct(g: Game, u: Unit): void {
  const b = u.tBld!;
  if (b.dead || (u.kingdom && !u.kingdom.atWar(b.city.kingdom) && u.madT <= 0 && !UDEF[u.kind].monster)) { u.tBld = null; return; }
  const nx = Math.max(b.x, Math.min(b.x + b.w, u.x));
  const ny = Math.max(b.y, Math.min(b.y + b.h, u.y));
  const dx = nx - u.x, dy = ny - u.y;
  const d2 = dx * dx + dy * dy;
  const r = Math.max(1, u.range);
  if (d2 <= r * r) {
    u.path = null;
    if (u.cd <= 0) {
      g.attackBuilding(u, b);
      u.cd = u.cdMax;
    }
  } else {
    if (UDEF[u.kind].flying) { flyStep(u, nx, ny); return; }
    if (!u.path) {
      if (!goTo(g, u, nx, ny + 0.3)) { if (++u.stuck > 8) { u.tBld = null; u.stuck = 0; } return; }
    }
    moveStep(g, u);
  }
}

// ------------------------------------------------------------------ people
function thinkPerson(g: Game, u: Unit): void {
  const adult = u.ageT >= ADULT_AGE * TPY;
  const soldier = u.job === JOB.SOLDIER;
  if (!u.tUnit && !u.inBoat && (soldier || (u.id + g.tick) % 2 === 0 || u.city === null)) {
    const sight = soldier ? 9 : 4;
    const threat = findHostile(g, u, sight);
    if (threat) {
      const td = UDEF[threat.kind];
      const weak = td.herb || (threat.kind === UK.PERSON && threat.job !== JOB.SOLDIER) || threat.kind === UK.WOLF;
      if (soldier || u.madT > 0 || (adult && ((u.traits & TR.BRAVE) || weak))) {
        u.tUnit = threat;
        u.tBld = null;
        return;
      }
      flee(g, u, threat);
      return;
    }
  }
  if (u.tUnit || u.tBld) return;
  if (u.madT > 0) { wander(g, u, u.x, u.y, 8); return; }
  if (!u.city) { thinkHomeless(g, u, adult); return; }
  if (!adult) {
    if (!u.path && g.rng.chance(0.4)) wander(g, u, u.city.x, u.city.y, 5);
    return;
  }
  if (u.phase === 2) return; // working
  if (u.phase === 1 || u.phase === 3) {
    // en route; repath if path lost
    if (!u.path) {
      if (u.phase === 3) { returnHome(g, u); }
      else { u.phase = 0; }
    }
    return;
  }
  switch (u.job) {
    case JOB.GATHER: jobGather(g, u); break;
    case JOB.FARM: jobFarm(g, u); break;
    case JOB.WOOD: jobWood(g, u); break;
    case JOB.MINE: jobMine(g, u); break;
    case JOB.BUILD: jobBuild(g, u); break;
    case JOB.SOLDIER: jobSoldier(g, u); break;
    case JOB.SCHOLAR: jobScholar(g, u); break;
    default:
      if (!u.path && g.rng.chance(0.3)) wander(g, u, u.city.x, u.city.y, 6);
  }
}

function startWork(g: Game, u: Unit, tile: number, x: number, y: number): void {
  if (goTo(g, u, x, y)) {
    u.tTile = tile;
    u.phase = 1;
  } else {
    u.thinkT = 4;
  }
}

function onArrive(g: Game, u: Unit): void {
  if (u.kind !== UK.PERSON) return;
  if (u.phase === 1) {
    if (!nearTarget(u, 1.6)) { u.phase = 0; return; }
    u.phase = 2;
    let t = 40;
    switch (u.job) {
      case JOB.WOOD: t = 60; break;
      case JOB.MINE: t = 70; break;
      case JOB.FARM: t = 35; break;
      case JOB.SCHOLAR: t = 220; break;
      case JOB.BUILD: t = 9999; break;
    }
    if (u.traits & TR.LAZY) t = Math.round(t * 1.5);
    u.timer = t;
  } else if (u.phase === 3) {
    deposit(g, u);
    u.phase = 0;
  } else if (u.order && u.order.type === ORD.SETTLE) {
    settleArrive(g, u);
  }
}

function workAct(g: Game, u: Unit): void {
  const w = g.world;
  const c = u.city;
  if (!c) { u.phase = 0; return; }
  const k = c.kingdom;
  u.anim = (g.tick >> 3) & 1 ? 3 : 0;
  if (u.job === JOB.BUILD) {
    const b = u.tBld0;
    if (!b || b.dead || b.progress >= 1) { u.phase = 0; u.tBld0 = null; return; }
    b.progress += (0.9 * k.caps.buildMult * SPECIES[u.species].build) / b.def.work / (u.traits & TR.LAZY ? 1.5 : 1) / 6;
    if (b.progress >= 1) { g.finishBuilding(b); u.phase = 0; u.tBld0 = null; }
    return;
  }
  if (u.job === JOB.SCHOLAR) {
    let m = (u.traits & TR.GENIUS ? 3 : 1) * (u.traits & TR.WISE ? 1.5 : 1) * SPECIES[u.species].research;
    if (k.researching >= 0 && g.laws.research) k.progress += 0.012 * m * k.caps.researchMult * g.laws.researchSpeed;
  }
  if (--u.timer > 0) return;
  const i = u.tTile;
  const sp = SPECIES[u.species];
  switch (u.job) {
    case JOB.GATHER: {
      let amt = 0;
      if (i >= 0 && w.flora[i] === F.BUSH) {
        amt = 5;
        if (g.rng.chance(0.25)) w.setFlora(i, F.NONE);
      } else if (i >= 0 && w.isWater(i)) amt = 4; // fishing
      else amt = 2.5; // foraging
      u.carry = 100;
      u.carryAmt = amt * k.caps.foodMult;
      break;
    }
    case JOB.FARM: {
      if (i >= 0 && w.ter[i] === T.FARM) {
        if (w.fstate[i] >= 200) {
          u.carry = 100;
          u.carryAmt = 7 * k.caps.foodMult * (0.5 + TER[w.biome[i]].fert * 0.6);
          w.fstate[i] = 0;
          w.mark(i);
        } else {
          w.fstate[i] = Math.min(255, w.fstate[i] + 50);
          w.mark(i);
        }
      }
      break;
    }
    case JOB.WOOD: {
      if (i >= 0 && isTree(w.flora[i])) {
        u.carry = RES.WOOD;
        u.carryAmt = (w.flora[i] === F.DEAD ? 1.5 : 4) * k.caps.woodMult;
        if (!(sp.chopsTrees < 1 && g.rng.chance(0.6))) w.setFlora(i, F.NONE);
      } else if (i >= 0 && w.flora[i] === F.CACTUS) {
        u.carry = RES.WOOD;
        u.carryAmt = 1;
        w.setFlora(i, F.NONE);
      }
      break;
    }
    case JOB.MINE: {
      if (i >= 0) {
        const dep = w.res[i];
        let r: number = RES.STONE;
        let amt = 3;
        if (dep && k.caps.extract.has(depositToRes(dep))) {
          r = depositToRes(dep);
          amt = r === RES.GOLD ? 1.5 : r === RES.URANIUM ? 0.8 : 2.5;
          if (g.rng.chance(0.004)) { w.res[i] = R.NONE; w.mark(i); }
        }
        u.carry = r;
        u.carryAmt = amt * k.caps.mineMult * sp.mine;
      }
      break;
    }
    case JOB.SCHOLAR:
      u.phase = 0;
      if (!u.path) wander(g, u, u.x, u.y, 3);
      return;
  }
  if (u.carry >= 0) returnHome(g, u);
  else u.phase = 0;
}

function jobGather(g: Game, u: Unit): void {
  const c = u.city!;
  const w = g.world;
  // hunt nearby game sometimes
  if (g.rng.chance(0.35)) {
    let prey: Unit | null = null;
    let bd = 1e9;
    g.spatial.query(c.x, c.y, 12, (o, d2) => {
      if (UDEF[o.kind].herb && o.kind !== UK.FISH && d2 < bd) { bd = d2; prey = o; }
    });
    if (prey) { u.tUnit = prey; return; }
  }
  const i = spiral(g, u.x, u.y, 10, j => w.flora[j] === F.BUSH && (w.owner[j] === c.id || w.owner[j] === 0), 3);
  if (i >= 0) { startWork(g, u, i, (i % w.w) + 0.5, ((i / w.w) | 0) + 0.5); return; }
  // fishing from shore
  const wi = spiral(g, c.x, c.y, 9, j => w.ter[j] === T.SHALLOW, 4);
  if (wi >= 0) {
    const wx = wi % w.w, wy = (wi / w.w) | 0;
    const li = w.nearestLand(wx + 0.5, wy + 0.5, 1);
    if (li >= 0) { startWork(g, u, wi, (li % w.w) + 0.5, ((li / w.w) | 0) + 0.5); return; }
  }
  // forage on owned land
  if (c.tiles.length) {
    for (let k = 0; k < 5; k++) {
      const j = c.tiles[g.rng.int(c.tiles.length)];
      if (TER[w.ter[j]].fert > 0.3 && !w.bld[j]) { startWork(g, u, -1, (j % w.w) + 0.5, ((j / w.w) | 0) + 0.5); return; }
    }
  }
  wander(g, u, c.x, c.y, 6);
}

function jobFarm(g: Game, u: Unit): void {
  const c = u.city!;
  const w = g.world;
  if (c.farms.length === 0) { jobGather(g, u); return; }
  let best = -1, bd = 1e9, low = -1, lowV = 999;
  for (let k = 0; k < Math.min(12, c.farms.length); k++) {
    const i = c.farms[g.rng.int(c.farms.length)];
    if (w.ter[i] !== T.FARM) continue;
    const x = i % w.w, y = (i / w.w) | 0;
    const d = Math.abs(x - u.x) + Math.abs(y - u.y);
    if (w.fstate[i] >= 200 && d < bd) { bd = d; best = i; }
    if (w.fstate[i] < lowV) { lowV = w.fstate[i]; low = i; }
  }
  const tgt = best >= 0 ? best : low;
  if (tgt < 0) { jobGather(g, u); return; }
  startWork(g, u, tgt, (tgt % w.w) + 0.5, ((tgt / w.w) | 0) + 0.5);
}

function jobWood(g: Game, u: Unit): void {
  const c = u.city!;
  const w = g.world;
  const i = spiral(g, c.x, c.y, 14, j => (isTree(w.flora[j]) || w.flora[j] === F.CACTUS) && (w.owner[j] === c.id || w.owner[j] === 0) && w.walk(j), 3);
  if (i < 0) { jobGather(g, u); return; }
  startWork(g, u, i, (i % w.w) + 0.5, ((i / w.w) | 0) + 0.5);
}

function jobMine(g: Game, u: Unit): void {
  const c = u.city!;
  const w = g.world;
  const k = c.kingdom;
  const mine = c.find('mine');
  const ox = mine ? mine.cx : c.x, oy = mine ? mine.cy : c.y;
  const want = (j: number) => {
    const t = w.ter[j];
    if (t !== T.HILLS && t !== T.MOUNTAIN && !(w.res[j] && k.caps.extract.has(depositToRes(w.res[j])))) return false;
    return (w.owner[j] === c.id || w.owner[j] === 0) && w.walk(j);
  };
  // prefer useful deposits
  let i = spiral(g, ox, oy, 12, j => w.res[j] > 0 && k.caps.extract.has(depositToRes(w.res[j])) && want(j), 3);
  if (i < 0) i = spiral(g, ox, oy, 12, want, 4);
  if (i < 0) {
    // quarry stone anywhere close
    if (mine) { startWork(g, u, -1, mine.cx, mine.y + mine.h + 0.2); u.tTile = -1; return; }
    jobWood(g, u);
    return;
  }
  startWork(g, u, i, (i % w.w) + 0.5, ((i / w.w) | 0) + 0.5);
}

function jobBuild(g: Game, u: Unit): void {
  const c = u.city!;
  let best: Building | null = null;
  let bd = 1e9;
  for (const b of c.buildings) {
    if (b.progress >= 1) continue;
    const d = Math.abs(b.cx - u.x) + Math.abs(b.cy - u.y);
    if (d < bd) { bd = d; best = b; }
  }
  if (!best) { jobWood(g, u); return; }
  u.tBld0 = best;
  startWork(g, u, -1, best.cx + g.rng.range(-0.8, 0.8), best.y + best.h + 0.3);
}

function jobScholar(g: Game, u: Unit): void {
  const c = u.city!;
  const b = c.find('lab') || c.find('university') || c.find('library');
  if (!b) { u.job = JOB.NONE; return; }
  startWork(g, u, -1, b.cx + g.rng.range(-0.7, 0.7), b.y + b.h + 0.3);
}

function jobSoldier(g: Game, u: Unit): void {
  const c = u.city!;
  const k = c.kingdom;
  const o = u.order;
  if (o && o.type === ORD.ATTACK) {
    const tc = o.city;
    if (!tc || tc.dead || !k.atWar(tc.kingdom) || g.tick - o.since > TPY * 30) { u.order = null; return; }
    const d = Math.hypot(tc.x - u.x, tc.y - u.y);
    if (d < 8) {
      // inside the enemy city: look for defenders first, else hit buildings
      const foe = findHostile(g, u, 12);
      if (foe) { u.tUnit = foe; return; }
      let tgt: Building | null = tc.center;
      if (!tgt || g.rng.chance(0.3)) {
        let bd = 1e9;
        for (const b of tc.buildings) {
          const bd2 = Math.abs(b.cx - u.x) + Math.abs(b.cy - u.y);
          if (bd2 < bd) { bd = bd2; tgt = b; }
        }
      }
      if (tgt) { u.tBld = tgt; return; }
      return;
    }
    if (!u.path) {
      const w = g.world;
      const ui = w.tileAt(u.x, u.y), ci = w.tileAt(tc.x, tc.y);
      if (ui >= 0 && ci >= 0 && w.island[ui] !== w.island[ci]) { u.order = null; return; }
      if (!goTo(g, u, tc.x + g.rng.range(-3, 3), tc.y + g.rng.range(-3, 3))) {
        if (++u.stuck > 12) { u.order = null; u.stuck = 0; }
      }
    }
    return;
  }
  // defend the city: look for enemies inside the territory
  if ((g.tick - c.lastAttacked < 200 || (g.tick + u.id) % 4 === 0) && g.spatial.anyDanger(c.x, c.y, 14)) {
    let foe: Unit | null = null;
    let bd = 1e9;
    g.spatial.query(c.x, c.y, 14, (o2, d2) => {
      if (d2 < bd && g.hostile(u, o2) && (!UDEF[o2.kind].flying || g.canHitAir(u))) { bd = d2; foe = o2; }
    });
    if (foe) { u.tUnit = foe; return; }
  }
  if (!u.path && g.rng.chance(0.25)) {
    if (c.tiles.length && g.rng.chance(0.5)) {
      const w = g.world;
      const j = c.tiles[g.rng.int(c.tiles.length)];
      goTo(g, u, (j % w.w) + 0.5, ((j / w.w) | 0) + 0.5);
    } else wander(g, u, c.x, c.y, 5);
  }
}

function thinkHomeless(g: Game, u: Unit, adult: boolean): void {
  const w = g.world;
  if (u.order && u.order.type === ORD.SETTLE && u.kingdom && u.kingdom.alive) {
    if (!u.path) {
      if (nearTarget(u, 2) || Math.hypot(u.x - u.order.x, u.y - u.order.y) < 2) { settleArrive(g, u); return; }
      if (!goTo(g, u, u.order.x, u.order.y)) {
        if (++u.stuck > 15) { u.order = null; u.stuck = 0; }
      }
    }
    return;
  }
  // kingdom member without a city: rejoin the nearest city of the realm
  if (u.kingdom && u.kingdom.alive && u.kingdom.cities.length) {
    let best: City | null = null, bd = 1e9;
    for (const c of u.kingdom.cities) {
      const d = Math.hypot(c.x - u.x, c.y - u.y);
      if (d < bd) { bd = d; best = c; }
    }
    if (best) {
      const ui = w.tileAt(u.x, u.y), ci = w.tileAt(best.x, best.y);
      if (ui >= 0 && ci >= 0 && w.island[ui] === w.island[ci]) {
        g.addToCity(u, best);
        u.job = JOB.NONE;
        u.order = null;
        u.phase = 0;
        return;
      }
    }
  }
  if (u.kingdom && !u.kingdom.alive) u.kingdom = null;
  // nomads: gather and try to found a new kingdom
  if (adult && g.rng.chance(0.35)) {
    const ti = w.tileAt(u.x, u.y);
    if (ti >= 0 && TER[w.ter[ti]].build && !w.owner[ti]) {
      const group: Unit[] = [u];
      g.spatial.query(u.x, u.y, 8, o => {
        if (o !== u && o.kind === UK.PERSON && !o.city && o.species === u.species && !o.order && o.ageT > 2 * TPY && (!o.kingdom || o.kingdom === u.kingdom)) group.push(o);
      });
      let farOk = true;
      for (const c of g.cities) if (Math.hypot(c.x - u.x, c.y - u.y) < 12) { farOk = false; break; }
      if (group.length >= 2 && farOk) {
        let k = u.kingdom;
        if (!k || !k.alive) k = g.createKingdom(u.species);
        const tx = Math.floor(u.x), ty = Math.floor(u.y);
        const city = g.foundCity(k, tx, ty, group);
        if (city) {
          if (!k.king) { k.king = u; u.isKing = true; refreshStats(g, u); }
          return;
        } else if (k.cities.length === 0) {
          // roll back the empty kingdom
          k.alive = false;
          const idx = g.kingdoms.indexOf(k);
          if (idx >= 0) g.kingdoms.splice(idx, 1);
          const ai = g.allKingdoms.indexOf(k);
          if (ai >= 0) g.allKingdoms.splice(ai, 1);
          g.kingdomById.delete(k.id);
          for (const m of group) m.kingdom = null;
        }
      }
      if (group.length < 2) {
        // look for others of my kind
        let friend: Unit | null = null, bd = 1e9;
        g.spatial.query(u.x, u.y, 30, (o, d2) => {
          if (o !== u && o.kind === UK.PERSON && !o.city && o.species === u.species && d2 < bd) { bd = d2; friend = o; }
        });
        if (friend) { const f = friend as Unit; goTo(g, u, f.x, f.y); return; }
      }
    }
  }
  if (!u.path) wander(g, u, u.x, u.y, 10);
}

function settleArrive(g: Game, u: Unit): void {
  const k = u.kingdom;
  const o = u.order;
  if (!k || !o) { u.order = null; return; }
  const w = g.world;
  // join a city of mine founded at the target
  for (const c of k.cities) {
    if (Math.hypot(c.x - o.x, c.y - o.y) < 5) { g.addToCity(u, c); u.order = null; u.job = JOB.NONE; u.phase = 0; return; }
  }
  const city = g.foundCity(k, Math.floor(o.x), Math.floor(o.y), [u]);
  if (city) { u.order = null; u.job = JOB.NONE; return; }
  // site was blocked: try a spot nearby
  const ti = spiral(g, o.x, o.y, 6, j => TER[w.ter[j]].build && !w.owner[j] && !w.bld[j], 5);
  if (ti >= 0 && u.stuck < 3) {
    u.stuck++;
    o.x = (ti % w.w) + 0.5;
    o.y = ((ti / w.w) | 0) + 0.5;
    goTo(g, u, o.x, o.y);
    return;
  }
  u.order = null;
}

// ------------------------------------------------------------------ animals
function thinkHerbivore(g: Game, u: Unit): void {
  const d = UDEF[u.kind];
  let threat: Unit | null = null;
  if (u.kind !== UK.FISH) {
    g.spatial.query(u.x, u.y, 3.2, o => {
      if (UDEF[o.kind].pred || UDEF[o.kind].monster || (o.kind === UK.PERSON && o.job === JOB.GATHER && o.tUnit === u)) { threat = o; return true; }
    });
  }
  if (threat) { flee(g, u, threat); return; }
  if (!u.path && g.rng.chance(0.35)) wander(g, u, u.x, u.y, 5);
  breed(g, u, 0.012);
  void d;
}

function thinkPredator(g: Game, u: Unit): void {
  u.hunger += 10;
  if (u.hunger > 500) {
    let prey: Unit | null = null, bd = 1e9;
    g.spatial.query(u.x, u.y, UDEF[u.kind].sight, (o, d2) => {
      if (d2 >= bd) return;
      if (UDEF[o.kind].herb && o.kind !== UK.FISH) { bd = d2; prey = o; }
      else if (o.kind === UK.PERSON && (o.ageT < ADULT_AGE * TPY || g.rng.chance(0.3)) && o.job !== JOB.SOLDIER) { bd = d2 * 1.5; prey = o; }
    });
    if (prey) { u.tUnit = prey; return; }
  }
  if (!u.path && g.rng.chance(0.3)) wander(g, u, u.x, u.y, 8);
  breed(g, u, 0.004);
}

function breed(g: Game, u: Unit, p: number): void {
  if (!g.laws.animals) return;
  const cap = Math.floor(g.world.n / (u.kind === UK.WOLF || u.kind === UK.BEAR ? 1800 : 500));
  if (g.kindCount[u.kind] >= cap) return;
  if (u.ageT < TPY * 2) return;
  if (!g.rng.chance(p)) return;
  let near = 0;
  g.spatial.query(u.x, u.y, 4, o => { if (o.kind === u.kind) near++; });
  if (near < 2 || near > 7) return;
  const b = g.spawnUnit(u.kind, u.x + g.rng.range(-0.5, 0.5), u.y + g.rng.range(-0.5, 0.5));
  b.ageT = 0;
}

// ------------------------------------------------------------------ monsters
function thinkMonster(g: Game, u: Unit): void {
  const d = UDEF[u.kind];
  if (u.tUnit || u.tBld) return;
  const foe = findHostile(g, u, d.sight);
  if (foe && (u.kind !== UK.DRAGON || g.rng.chance(0.5))) { u.tUnit = foe; return; }
  if (u.kind === UK.DRAGON || u.kind === UK.GOLEM || u.kind === UK.UFO) {
    // smash buildings
    let best: Building | null = null, bd = 1e9;
    const r = u.kind === UK.GOLEM ? 10 : 16;
    for (const c of g.cities) {
      if (Math.abs(c.x - u.x) > r + 10 || Math.abs(c.y - u.y) > r + 10) continue;
      for (const b of c.buildings) {
        const dd = Math.abs(b.cx - u.x) + Math.abs(b.cy - u.y);
        if (dd < bd && dd < r) { bd = dd; best = b; }
      }
    }
    if (best && g.rng.chance(u.kind === UK.DRAGON ? 0.3 : 0.6)) { u.tBld = best; return; }
  }
  if (u.kind === UK.UFO && !u.path) {
    // head toward the biggest city
    let best: City | null = null, bp = -1;
    for (const c of g.cities) if (c.members.length > bp) { bp = c.members.length; best = c; }
    if (best && g.rng.chance(0.5)) { goTo(g, u, best.x + g.rng.range(-6, 6), best.y + g.rng.range(-6, 6)); return; }
  }
  if (!u.path && g.rng.chance(0.4)) wander(g, u, u.x, u.y, u.kind === UK.DRAGON ? 30 : u.kind === UK.UFO ? 20 : 8);
}

// ------------------------------------------------------------------ vehicles
export const MISSION = { TRANSPORT: 1, WAR: 2, RETURN: 3, BOMB: 4 } as const;

function thinkBoat(g: Game, u: Unit): void {
  const w = g.world;
  if (!u.kingdom || !u.kingdom.alive) {
    if (u.cargo) for (const c of u.cargo) { c.inBoat = null; c.x = u.x; c.y = u.y; }
    u.cargo = null;
    g.killUnit(u, null);
    return;
  }
  if (u.mission === MISSION.WAR && !u.tUnit && !u.tBld && u.atk > 0) {
    const foe = findHostile(g, u, u.range + 1);
    if (foe) { u.tUnit = foe; return; }
    // bombard coastal buildings
    if (u.vclass >= 3) {
      const ti = w.tileAt(u.x, u.y);
      void ti;
      for (const c of g.cities) {
        if (!u.kingdom.atWar(c.kingdom)) continue;
        if (Math.hypot(c.x - u.x, c.y - u.y) > u.range + 8) continue;
        for (const b of c.buildings) {
          if (Math.hypot(b.cx - u.x, b.cy - u.y) <= u.range) { u.tBld = b; return; }
        }
      }
    }
  }
  if (!u.path) {
    const d = Math.hypot(u.mx - u.x, u.my - u.y);
    if (d < 1.6) {
      if (u.mission === MISSION.TRANSPORT) unload(g, u);
      else if (u.mission === MISSION.WAR) {
        u.timer++;
        if (u.timer > 40) { u.mission = MISSION.RETURN; u.mx = u.homeX; u.my = u.homeY; }
        else wander(g, u, u.mx, u.my, 6);
      } else if (u.mission === MISSION.RETURN) {
        g.killUnit(u, null);
      }
    } else if (!goTo(g, u, u.mx, u.my)) {
      if (++u.stuck > 12) {
        if (u.mission === MISSION.TRANSPORT) unload(g, u);
        else g.killUnit(u, null);
      }
    }
  }
  if (u.ageT > TPY * 40) g.killUnit(u, null);
}

function unload(g: Game, u: Unit): void {
  const w = g.world;
  const cargo = u.cargo || [];
  const li = w.nearestLand(u.x, u.y, 4);
  if (li < 0) {
    if (++u.stuck > 20) { u.mission = MISSION.RETURN; u.mx = u.homeX; u.my = u.homeY; }
    return;
  }
  const lx = (li % w.w) + 0.5, ly = ((li / w.w) | 0) + 0.5;
  for (const c of cargo) {
    c.inBoat = null;
    c.x = lx + g.rng.range(-0.4, 0.4);
    c.y = ly + g.rng.range(-0.4, 0.4);
    c.path = null;
    c.phase = 0;
  }
  u.cargo = null;
  u.mission = MISSION.RETURN;
  u.mx = u.homeX;
  u.my = u.homeY;
  u.path = null;
}

function thinkPlane(g: Game, u: Unit): void {
  if (!u.kingdom || !u.kingdom.alive) { g.killUnit(u, null); return; }
}

function actPlane(g: Game, u: Unit): void {
  u.z = 1;
  if (u.mission === MISSION.BOMB) {
    const arrived = flyStep(u, u.mx, u.my);
    if (arrived || Math.hypot(u.mx - u.x, u.my - u.y) < 2.5) {
      u.timer++;
      if (u.cd <= 0) {
        const s = PLANES[u.vclass];
        g.shoot(P.BOMB, u.x, u.y - 2, u.x + g.rng.range(-2.5, 2.5), u.y + g.rng.range(-2.5, 2.5), s.atk, s.aoe, u, null);
        u.cd = s.cd;
        u.carryAmt--;
      }
      if (u.carryAmt <= 0 || u.timer > 120) { u.mission = MISSION.RETURN; }
      else if (arrived) { u.mx += g.rng.range(-3, 3); u.my += g.rng.range(-3, 3); }
    }
  } else {
    if (flyStep(u, u.homeX, u.homeY)) g.killUnit(u, null);
  }
}

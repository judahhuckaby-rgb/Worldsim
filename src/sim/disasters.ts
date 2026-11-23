// Natural and divine disasters.
import type { Game } from './game';
import { P } from './game';
import { UK, UDEF, TPY } from './defs';
import { T, F, TER, isTree, isWaterT } from './terrain';

export interface Disaster {
  kind: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
  life: number;
  r: number;
  a: number;
}

export const DISASTER_NAMES: Record<string, string> = {
  tornado: 'Tornado', volcano: 'Volcano', earthquake: 'Earthquake', rain: 'Rainstorm', blizzard: 'Blizzard',
  meteors: 'Meteor Shower', drought: 'Drought', acid: 'Acid Rain', fallout: 'Radioactive Fallout', tsunami: 'Tsunami',
};

export function startDisaster(g: Game, kind: string, x: number, y: number): void {
  const d: Disaster = { kind, x, y, vx: g.rng.range(-0.05, 0.05), vy: g.rng.range(-0.05, 0.05), t: 0, life: 300, r: 3, a: g.rng.next() * Math.PI };
  const w = g.world;
  switch (kind) {
    case 'tornado': d.life = 420; d.r = 2.4; break;
    case 'volcano': {
      d.life = 700; d.r = 3;
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
        const dd = Math.hypot(dx, dy);
        const tx = Math.floor(x) + dx, ty = Math.floor(y) + dy;
        if (!w.inb(tx, ty) || dd > 4.3) continue;
        const i = ty * w.w + tx;
        if (dd < 1.2) w.addLava(i);
        else if (dd < 2.6) { w.setTer(i, T.MOUNTAIN); }
        else if (TER[w.ter[i]].elev < 5) w.setTer(i, T.HILLS);
        const bid = w.bld[i];
        if (bid) { const b = g.bldById.get(bid); if (b) g.damageBuilding(b, 9999, null); }
      }
      g.shake = 8;
      g.log('🌋 A volcano erupted!', 'disaster', x, y, '#f84', true);
      break;
    }
    case 'earthquake': d.life = 160; d.r = 13; g.log('An earthquake shook the land', 'disaster', x, y, '#c96', true); break;
    case 'rain': d.life = 360; d.r = 7; break;
    case 'acid': d.life = 300; d.r = 7; break;
    case 'blizzard': d.life = 260; d.r = 8; break;
    case 'drought': d.life = 300; d.r = 9; break;
    case 'meteors': d.life = 160; d.r = 18; g.log('☄ A meteor shower lit up the sky', 'disaster', x, y, '#fc6', true); break;
    case 'tsunami': d.life = 170; d.r = 1; d.vx = 0; d.vy = 0; g.shake = 6; g.log('🌊 A tsunami is racing toward the coasts!', 'disaster', x, y, '#6cf', true); break;
  }
  g.disasters.push(d);
}

export function updateDisasters(g: Game): void {
  const w = g.world;
  const ds = g.disasters;
  for (let k = ds.length - 1; k >= 0; k--) {
    const d = ds[k];
    d.t++;
    switch (d.kind) {
      case 'tornado': {
        d.vx += g.rng.range(-0.012, 0.012);
        d.vy += g.rng.range(-0.012, 0.012);
        const sp = Math.hypot(d.vx, d.vy);
        if (sp > 0.12) { d.vx *= 0.12 / sp; d.vy *= 0.12 / sp; }
        d.x += d.vx;
        d.y += d.vy;
        if (d.x < 2 || d.x > w.w - 2) d.vx *= -1;
        if (d.y < 2 || d.y > w.h - 2) d.vy *= -1;
        g.spatial.query(d.x, d.y, d.r, u => {
          if (UDEF[u.kind].flying && u.kind !== UK.PLANE) return;
          u.x += g.rng.range(-0.7, 0.7);
          u.y += g.rng.range(-0.7, 0.7);
          u.x = Math.max(0.5, Math.min(w.w - 0.5, u.x));
          u.y = Math.max(0.5, Math.min(w.h - 0.5, u.y));
          u.path = null;
          if (d.t % 3 === 0) g.damageUnit(u, 3, null);
        });
        if (d.t % 3 === 0) {
          const tx = Math.floor(d.x + g.rng.range(-d.r, d.r)), ty = Math.floor(d.y + g.rng.range(-d.r, d.r));
          if (w.inb(tx, ty)) {
            const i = ty * w.w + tx;
            if (isTree(w.flora[i]) || w.flora[i] === F.CROP) w.setFlora(i, F.NONE);
            const bid = w.bld[i];
            if (bid) { const b = g.bldById.get(bid); if (b) g.damageBuilding(b, 18, null); }
          }
        }
        break;
      }
      case 'volcano': {
        if (d.t % 5 === 0) {
          const tx = Math.floor(d.x + g.rng.range(-1.5, 1.5)), ty = Math.floor(d.y + g.rng.range(-1.5, 1.5));
          if (w.inb(tx, ty)) w.addLava(ty * w.w + tx);
        }
        if (d.t % 24 === 0) {
          const ang = g.rng.next() * Math.PI * 2, r = g.rng.range(3, 11);
          g.shoot(P.FIREBALL, d.x, d.y - 1, d.x + Math.cos(ang) * r, d.y + Math.sin(ang) * r, 40, 1.4, null, null);
        }
        if (d.t % 8 === 0) g.emit({ kind: 'smoke', x: d.x, y: d.y - 1, r: 2 });
        break;
      }
      case 'earthquake': {
        g.shake = Math.max(g.shake, 5);
        const along = g.rng.range(-d.r, d.r);
        const tx = Math.floor(d.x + Math.cos(d.a) * along + g.rng.range(-1, 1)), ty = Math.floor(d.y + Math.sin(d.a) * along + g.rng.range(-1, 1));
        if (w.inb(tx, ty) && g.rng.chance(0.4)) {
          const i = ty * w.w + tx;
          if (!w.isWater(i) && w.ter[i] !== T.PEAK) w.lower(i);
        }
        if (d.t % 6 === 0) {
          for (const b of g.buildings) {
            if (Math.abs(b.cx - d.x) < d.r && Math.abs(b.cy - d.y) < d.r) g.damageBuilding(b, b.maxHp * 0.03, null);
          }
          g.spatial.query(d.x, d.y, d.r, u => { if (!UDEF[u.kind].flying && g.rng.chance(0.2)) g.damageUnit(u, 4, null); });
        }
        break;
      }
      case 'rain':
      case 'acid':
      case 'blizzard':
      case 'drought': {
        d.x += d.vx;
        d.y += d.vy;
        for (let s = 0; s < 10; s++) {
          const tx = Math.floor(d.x + g.rng.range(-d.r, d.r)), ty = Math.floor(d.y + g.rng.range(-d.r, d.r));
          if (!w.inb(tx, ty)) continue;
          if (Math.hypot(tx - d.x, ty - d.y) > d.r) continue;
          const i = ty * w.w + tx;
          if (d.kind === 'rain') {
            if (w.fire[i]) w.fire[i] = 0;
            if (w.ter[i] === T.FARM) w.fstate[i] = Math.min(255, w.fstate[i] + 15);
            if (w.poll[i]) w.poll[i] = Math.max(0, w.poll[i] - 20);
            if (w.flora[i] === F.NONE && !w.bld[i] && TER[w.ter[i]].fert > 0.3 && w.ter[i] !== T.FARM && g.rng.chance(0.02)) w.setFlora(i, g.rng.chance(0.7) ? F.FLOWER : F.BUSH);
            if (w.ter[i] === T.DESERT && g.rng.chance(0.004)) { w.biome[i] = T.SAVANNA; w.setTer(i, T.SAVANNA); }
          } else if (d.kind === 'acid') {
            if (isTree(w.flora[i]) || w.flora[i] === F.CROP) w.setFlora(i, w.flora[i] === F.CROP ? F.NONE : F.DEAD);
            w.poll[i] = Math.min(255, w.poll[i] + 25);
            const bid = w.bld[i];
            if (bid) { const b = g.bldById.get(bid); if (b) g.damageBuilding(b, 3, null); }
          } else if (d.kind === 'blizzard') {
            if (w.fire[i]) w.fire[i] = 0;
            const t = w.ter[i];
            if (t === T.SHALLOW || t === T.WATER) w.setTer(i, T.ICE);
            else if (TER[t].elev === 4 && t !== T.ROAD && t !== T.PAVED && t !== T.RAIL && t !== T.HIGHWAY && t !== T.FARM && t !== T.LAVA) { w.biome[i] = T.SNOW; w.setTer(i, T.SNOW); }
            else if (t === T.LAVA) { w.setTer(i, T.MOUNTAIN); }
            else if (t === T.HILLS || t === T.MOUNTAIN) { w.biome[i] = T.SNOW; w.mark(i); }
          } else if (d.kind === 'drought') {
            const t = w.ter[i];
            if (w.flora[i] === F.CROP) w.fstate[i] = 0;
            if (g.rng.chance(0.15)) {
              if (t === T.GRASS || t === T.JUNGLE) { w.biome[i] = T.SAVANNA; w.setTer(i, T.SAVANNA); }
              else if (t === T.SAVANNA || t === T.SWAMP) { w.biome[i] = T.DESERT; w.setTer(i, T.DESERT); }
              else if (t === T.SHALLOW && g.rng.chance(0.3)) w.setTer(i, T.SAND);
            }
            if (isTree(w.flora[i]) && g.rng.chance(0.1)) w.setFlora(i, F.DEAD);
            if (g.rng.chance(0.01)) w.ignite(i, 80);
          }
        }
        if (d.kind === 'blizzard' && d.t % 10 === 0) g.spatial.query(d.x, d.y, d.r, u => { if (u.kind === UK.PERSON) g.damageUnit(u, 1, null); });
        if (d.kind === 'acid' && d.t % 10 === 0) g.spatial.query(d.x, d.y, d.r, u => { if (!UDEF[u.kind].flying) g.damageUnit(u, 2, null); });
        break;
      }
      case 'fallout': {
        // the radioactive cloud drifts with the wind, sickening everything beneath it
        d.x += d.vx;
        d.y += d.vy;
        if (d.t % 40 === 0) d.r = Math.min(d.a, d.r + 0.4);
        const fade = 1 - d.t / d.life;
        if (d.t % 8 === 0) {
          g.spatial.query(d.x, d.y, d.r, (u, d2) => {
            if (UDEF[u.kind].flying || u.inBoat) return;
            if (u.kind === UK.PERSON || UDEF[u.kind].herb || UDEF[u.kind].pred) g.damageUnit(u, (4 + 10 * fade) * (1 - Math.sqrt(d2) / (d.r + 1)), null);
          });
        }
        for (let s = 0; s < 6; s++) {
          const tx = Math.floor(d.x + g.rng.range(-d.r, d.r)), ty = Math.floor(d.y + g.rng.range(-d.r, d.r));
          if (!w.inb(tx, ty) || Math.hypot(tx - d.x, ty - d.y) > d.r) continue;
          const i = ty * w.w + tx;
          w.poll[i] = Math.min(255, w.poll[i] + Math.round(30 * fade));
          if (w.flora[i] === F.CROP) w.fstate[i] = 0;
          else if (isTree(w.flora[i]) && g.rng.chance(0.06 * fade)) w.setFlora(i, F.DEAD);
        }
        break;
      }
      case 'tsunami': {
        // an expanding ring of water: everything on the coast in its path is swept away
        d.r += 0.28;
        const n = Math.ceil(d.r * 5);
        for (let s = 0; s < n; s++) {
          const ang = (s / n) * Math.PI * 2 + g.rng.next() * 0.05;
          const tx = Math.floor(d.x + Math.cos(ang) * d.r), ty = Math.floor(d.y + Math.sin(ang) * d.r);
          if (!w.inb(tx, ty)) continue;
          const i = ty * w.w + tx;
          if (w.isWater(i)) continue;
          if (!nearWater(w, tx, ty, 3)) continue;
          const t = w.ter[i];
          if (TER[t].elev >= 5) continue; // hills and mountains break the wave
          const bid = w.bld[i];
          if (bid) { const b = g.bldById.get(bid); if (b) g.damageBuilding(b, b.maxHp * 0.45, null); }
          if (w.flora[i] !== F.NONE && g.rng.chance(0.5)) w.setFlora(i, F.NONE);
          if (w.fire[i]) w.fire[i] = 0;
          if (t === T.FARM || t === T.GRASS || t === T.SAVANNA) { if (g.rng.chance(0.25)) w.setTer(i, T.SAND); }
          else if (t === T.SAND && g.rng.chance(0.08)) w.setTer(i, T.SHALLOW);
        }
        if (d.t % 3 === 0) {
          g.spatial.query(d.x, d.y, d.r + 1, (u, d2) => {
            const dd = Math.sqrt(d2);
            if (dd < d.r - 1.5 || UDEF[u.kind].flying || UDEF[u.kind].aquatic) return;
            const i = w.tileAt(u.x, u.y);
            if (i < 0 || !nearWater(w, Math.floor(u.x), Math.floor(u.y), 3)) return;
            g.damageUnit(u, u.kind === UK.BOAT ? 120 : 45, null);
            u.x = Math.max(0.5, Math.min(w.w - 0.5, u.x + (u.x - d.x) / (dd || 1) * 0.6));
            u.y = Math.max(0.5, Math.min(w.h - 0.5, u.y + (u.y - d.y) / (dd || 1) * 0.6));
            u.path = null;
          });
        }
        break;
      }
      case 'meteors': {
        if (d.t % 12 === 0) {
          const tx = d.x + g.rng.range(-d.r, d.r), ty = d.y + g.rng.range(-d.r, d.r);
          spawnMeteor(g, tx, ty);
        }
        break;
      }
    }
    if (d.t >= d.life) ds.splice(k, 1);
  }
}

export function spawnMeteor(g: Game, x: number, y: number): void {
  g.shoot(P.METEOR, x - 18, y - 40, x, y, 0, 4, null, null);
}

function nearWater(w: Game['world'], x: number, y: number, r: number): boolean {
  for (let dy = -r; dy <= r; dy += r) for (let dx = -r; dx <= r; dx += r) {
    if (!w.inb(x + dx, y + dy)) continue;
    if (w.isWater((y + dy) * w.w + x + dx)) return true;
  }
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (w.inb(x + dx, y + dy) && w.isWater((y + dy) * w.w + x + dx)) return true;
  }
  return false;
}

/** Radioactive fallout drifting downwind from a nuclear blast. */
export function startFallout(g: Game, x: number, y: number, R: number): void {
  const ang = g.rng.next() * Math.PI * 2;
  const sp = g.rng.range(0.015, 0.035);
  g.disasters.push({ kind: 'fallout', x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, t: 0, life: TPY * 5, r: R * 0.7, a: R * 1.3 });
}

/** A city-killing asteroid: a huge crater, a firestorm and an impact winter. */
export function spawnAsteroid(g: Game, x: number, y: number): void {
  g.shoot(P.METEOR, x - 40, y - 90, x, y, 0, 16, null, null);
  g.log('☄ A giant asteroid is falling from the sky!', 'disaster', x, y, '#fc6', true);
}

export function asteroidImpact(g: Game, x: number, y: number, R: number): void {
  const w = g.world;
  g.shake = 30;
  g.flash = 0.8;
  g.nuclearWinter += 1.2;
  g.emit({ kind: 'nuke', x, y, r: R * 0.8 });
  g.spatial.query(x, y, R * 1.4, (u, d2) => {
    const d = Math.sqrt(d2);
    g.damageUnit(u, d < R * 0.7 ? 1e6 : 900 * (1 - d / (R * 1.4)), null, null);
  });
  const r0 = Math.ceil(R * 1.4);
  for (let dy = -r0; dy <= r0; dy++) for (let dx = -r0; dx <= r0; dx++) {
    const d = Math.hypot(dx, dy);
    const tx = Math.floor(x) + dx, ty = Math.floor(y) + dy;
    if (d > r0 || !w.inb(tx, ty)) continue;
    const i = ty * w.w + tx;
    const bid = w.bld[i];
    if (bid && d < R * 1.2) { const b = g.bldById.get(bid); if (b) g.damageBuilding(b, d < R ? 1e6 : b.maxHp * 0.6, null); }
    if (d < R * 0.35) { w.lower(i); w.lower(i); if (d < R * 0.2) w.lower(i); }
    else if (d < R * 0.5 && !w.isWater(i)) w.setTer(i, g.rng.chance(0.5) ? T.MOUNTAIN : T.HILLS);
    else if (d < R && !w.isWater(i) && TER[w.ter[i]].elev === 4) w.setTer(i, T.ASH);
    if (d < R && w.flora[i]) w.setFlora(i, F.NONE);
    if (d < R * 1.3 && g.rng.chance(0.3)) w.ignite(i, 160);
  }
  for (const c of g.cities.slice()) if (Math.hypot(c.x - x, c.y - y) < R && c.members.length === 0) g.destroyCity(c, 'obliterated by an asteroid');
  // ocean impacts raise a tsunami
  const ci = w.tileAt(x, y);
  if (ci >= 0 && w.isWater(ci)) startDisaster(g, 'tsunami', x, y);
  else startDisaster(g, 'earthquake', x, y);
}

/** A solar flare: power grids fail, aircraft fall from the sky and research stalls for years. */
export function solarFlare(g: Game): number {
  g.flareT = TPY * 2;
  let n = 0;
  for (const u of g.units) if (u.kind === UK.PLANE && !u.dead) { g.killUnit(u, null); n++; }
  for (const p of g.projectiles) if ((p.kind === P.MISSILE || p.kind === P.CRUISE) && !p.dead) p.t = 1e9, p.dead = true;
  g.projectiles = g.projectiles.filter(p => !p.dead);
  let hit = 0;
  for (const k of g.kingdoms) if (k.caps.lights >= 2) { k.blackoutT = g.tick + TPY * 2; hit++; }
  g.log(`🌞 A massive solar flare knocked out the power grids of ${hit} nation${hit === 1 ? '' : 's'}${n ? ` and downed ${n} aircraft` : ''}`, 'disaster', -1, -1, '#fd6', true);
  return hit;
}

/** A pandemic spreads through several of the largest cities at once. */
export function pandemic(g: Game): number {
  const cities = g.cities.slice().sort((a, b) => b.members.length - a.members.length).slice(0, 6);
  let n = 0;
  for (const c of cities) n += plagueOutbreak(g, c.x, c.y, 9);
  if (n) g.log(`🦠 A global pandemic broke out — ${n} infected across ${cities.length} cities`, 'disaster', cities[0]?.x ?? -1, cities[0]?.y ?? -1, '#9c6', true);
  return n;
}

export function alienInvasion(g: Game, x: number, y: number): void {
  const w = g.world;
  const edgeX = x < w.w / 2 ? 2 : w.w - 2;
  const n = 6 + g.rng.int(4);
  for (let i = 0; i < n; i++) {
    const u = g.spawnUnit(UK.UFO, edgeX + g.rng.range(-2, 2), Math.max(2, Math.min(w.h - 2, y + g.rng.range(-10, 10))));
    u.mx = x;
    u.my = y;
    u.path = [w.tileAt(x + g.rng.range(-5, 5), y + g.rng.range(-5, 5))];
    u.tx = x + g.rng.range(-5, 5);
    u.ty = y + g.rng.range(-5, 5);
    if (u.path[0] < 0) u.path = null;
  }
  g.log('👽 Alien saucers have appeared in the sky!', 'disaster', x, y, '#7f7', true);
}

export function plagueOutbreak(g: Game, x: number, y: number, r: number): number {
  let n = 0;
  g.spatial.query(x, y, r, u => {
    if ((u.kind === UK.PERSON || UDEF[u.kind].herb) && u.plague === 0) { u.plague = 1; n++; }
  });
  return n;
}

export function randomDisaster(g: Game): void {
  const w = g.world;
  // target near a random city most of the time so the world feels alive
  let x = g.rng.int(w.w), y = g.rng.int(w.h);
  if (g.cities.length && g.rng.chance(0.7)) {
    const c = g.rng.pick(g.cities);
    x = c.x + g.rng.range(-10, 10);
    y = c.y + g.rng.range(-10, 10);
  }
  const i = w.tileAt(x, y);
  if (i < 0) return;
  const r = g.rng.next();
  const land = !isWaterT(w.ter[i]);
  if (r < 0.2 && land) startDisaster(g, 'tornado', x, y);
  else if (r < 0.32 && land) startDisaster(g, 'earthquake', x, y);
  else if (r < 0.42) { spawnMeteor(g, x, y); g.log('☄ A meteor struck the world', 'disaster', x, y, '#fc6', true); }
  else if (r < 0.48 && land) startDisaster(g, 'volcano', x, y);
  else if (r < 0.6 && g.laws.plague && g.cities.length) {
    const c = g.rng.pick(g.cities);
    if (plagueOutbreak(g, c.x, c.y, 5) > 0) g.log(`☣ A plague broke out in ${c.name}`, 'disaster', c.x, c.y, '#9c6', true);
  } else if (r < 0.75) startDisaster(g, 'rain', x, y);
  else if (r < 0.82 && land) startDisaster(g, 'drought', x, y);
  else if (r < 0.87 && g.kindCount[UK.DRAGON] < 2) {
    const li = w.nearestLand(x, y, 10);
    if (li >= 0) {
      g.spawnUnit(UK.DRAGON, (li % w.w) + 0.5, ((li / w.w) | 0) + 0.5);
      g.log('🐉 A dragon awakens!', 'monster', x, y, '#f66', true);
    }
  } else if (r < 0.9 && land) startDisaster(g, 'blizzard', x, y);
  void TPY;
}

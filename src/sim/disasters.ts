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
  meteors: 'Meteor Shower', drought: 'Drought', acid: 'Acid Rain',
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
            else if (TER[t].elev === 4 && t !== T.ROAD && t !== T.PAVED && t !== T.FARM && t !== T.LAVA) { w.biome[i] = T.SNOW; w.setTer(i, T.SNOW); }
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

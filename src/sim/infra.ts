// National infrastructure: intercity roads, railways, highways and international trade roads.
// Projects are planned with the pathfinder and laid a few tiles at a time so they visibly grow.
import type { Game } from './game';
import { Kingdom, City, InfraProject } from './entities';
import { T, TER, F, RES } from './terrain';
import { TECH_BY_ID } from './tech';

function has(k: Kingdom, id: string): boolean {
  return !!k.techs[TECH_BY_ID[id].idx];
}

function key(prefix: string, a: City, b: City): string {
  return a.id < b.id ? `${prefix}:${a.id}-${b.id}` : `${prefix}:${b.id}-${a.id}`;
}

function door(c: City): { x: number; y: number } {
  if (c.center) return { x: Math.floor(c.center.cx), y: c.center.y + c.center.h };
  return { x: Math.floor(c.x), y: Math.floor(c.y) + 2 };
}

function sameIsland(g: Game, a: City, b: City): boolean {
  const w = g.world;
  const ia = w.tileAt(a.x, a.y), ib = w.tileAt(b.x, b.y);
  return ia >= 0 && ib >= 0 && w.island[ia] === w.island[ib] && w.island[ia] >= 0;
}

let planCalls = 0;

function plan(g: Game, k: Kingdom, kind: InfraProject['kind'], a: City, b: City, k2: string): boolean {
  const w = g.world;
  if (planCalls++ >= 2) return false; // at most two route surveys per turn
  const da = door(a), db = door(b);
  if (!w.inb(da.x, da.y) || !w.inb(db.x, db.y)) { k.links.add(k2); return false; }
  const mode = kind === 'rail' ? 2 : 3;
  const dist = Math.abs(da.x - db.x) + Math.abs(da.y - db.y);
  const path = g.pf.find(w, da.x, da.y, db.x, db.y, mode, Math.min(14000, 1000 + dist * 70));
  if (!path || path.length < 2) { k.links.add(k2); return false; }
  const last = path[path.length - 1];
  const lx = last % w.w, ly = (last / w.w) | 0;
  if (Math.abs(lx - db.x) + Math.abs(ly - db.y) > 3) { k.links.add(k2); return false; }
  k.infra = { kind, path, i: 0, key: k2 };
  return true;
}

/** Choose the next infrastructure project for a kingdom. */
function chooseRoads(g: Game, k: Kingdom, cities: City[], cap: City | null): boolean {
  // 1. roads: connect every city to its two nearest neighbours and to the capital
  for (const a of cities) {
    const near: [number, City][] = [];
    for (const b of cities) {
      if (a === b || !sameIsland(g, a, b)) continue;
      const d = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
      if (d <= 110) near.push([d, b]);
    }
    near.sort((p, q) => p[0] - q[0]);
    for (let n = 0; n < Math.min(near.length, k.caps.roads >= 2 ? 3 : 2); n++) {
      const b = near[n][1];
      if (k.links.has(key('r', a, b))) continue;
      if (plan(g, k, 'road', a, b, key('r', a, b))) return true;
    }
    if (cap && cap !== a && sameIsland(g, a, cap) && !k.links.has(key('r', a, cap))) {
      const d = Math.abs(a.x - cap.x) + Math.abs(a.y - cap.y);
      if (d < 170 && plan(g, k, 'road', a, cap, key('r', a, cap))) return true;
    }
  }
  return false;
}

function chooseTrade(g: Game, k: Kingdom, cities: City[], cap: City | null): boolean {
  // 2. international trade roads
  for (const o of g.kingdoms) {
    if (o === k) continue;
    const r = k.rel.get(o.id);
    // neighbours at peace are linked by border crossings; trade partners by longer trade roads
    if (!r || r.war || !(r.trade || r.ally || r.opinion > -35)) continue;
    let pa: City | null = null, pb: City | null = null, bd = 1e9;
    for (const a of cities) for (const b of o.cities) {
      if (!b.center || !sameIsland(g, a, b)) continue;
      const d = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
      if (d < bd) { bd = d; pa = a; pb = b; }
    }
    if (pa && pb && bd < (r.trade || r.ally ? 170 : 120)) {
      const kk = key('t', pa, pb);
      if (!k.links.has(kk) && !o.links.has(kk) && plan(g, k, 'road', pa, pb, kk)) return true;
      // capitals of trading nations get a direct road too, later upgraded to a motorway
      const ca = k.capital, cb = o.capital;
      if ((r.trade || r.ally) && ca && cb && ca.center && cb.center && sameIsland(g, ca, cb)) {
        const dk = key('t', ca, cb);
        const d2 = Math.abs(ca.x - cb.x) + Math.abs(ca.y - cb.y);
        if (d2 < 220 && !k.links.has(dk) && !o.links.has(dk) && plan(g, k, 'road', ca, cb, dk)) return true;
        const hk = key('i', ca, cb);
        if (k.caps.roads >= 2 && has(k, 'massprod') && (k.links.has(dk) || o.links.has(dk)) && !k.links.has(hk) && !o.links.has(hk) && plan(g, k, 'highway', ca, cb, hk)) return true;
      }
    }
  }
  return false;
}

function chooseRail(g: Game, k: Kingdom, cities: City[], cap: City | null): boolean {
  // 3. railways (Industrial Age): capital to every sizeable city
  if (has(k, 'railroad') && cap) {
    for (const a of cities) {
      if (a === cap || a.members.length < 20 || !sameIsland(g, a, cap)) continue;
      const kk = key('l', a, cap);
      if (k.links.has(kk)) continue;
      if (k.res[RES.METAL] < 20) return false;
      if (plan(g, k, 'rail', a, cap, kk)) return true;
    }
  }
  return false;
}

function chooseMotorways(g: Game, k: Kingdom, cities: City[], cap: City | null): boolean {
  // 4. motorways (Mass Production): two-lane highways from the capital and along busy road links
  if (k.caps.roads >= 2 && has(k, 'massprod')) {
    if (cap) for (const a of cities) {
      if (a === cap || a.members.length < 22 || !k.links.has(key('r', a, cap))) continue;
      const kk = key('h', a, cap);
      if (k.links.has(kk)) continue;
      if (plan(g, k, 'highway', a, cap, kk)) return true;
    }
    for (const a of cities) for (const b of cities) {
      if (a.id >= b.id || !k.links.has(key('r', a, b))) continue;
      if (a.members.length + b.members.length < 36) continue;
      const kk = key('h', a, b);
      if (k.links.has(kk)) continue;
      if (plan(g, k, 'highway', a, b, kk)) return true;
    }
  }
  return false;
}

function choosePaving(g: Game, k: Kingdom, cities: City[], cap: City | null): boolean {
  // 5. paved roads (Combustion): upgrade the remaining dirt links
  if (k.caps.roads >= 2) {
    for (const a of cities) for (const b of cities) {
      if (a.id >= b.id || !k.links.has(key('r', a, b))) continue;
      const kk = key('p', a, b);
      if (k.links.has(kk)) continue;
      if (plan(g, k, 'pave', a, b, kk)) return true;
    }
  }
  return false;
}

/** Choose the next infrastructure project, rotating priorities so upgrades also get built. */
function choose(g: Game, k: Kingdom): void {
  const cities = k.cities.filter(c => c.center && c.members.length >= 6);
  if (cities.length === 0) return;
  const cap = k.capital;
  const order = [chooseRoads, chooseTrade, chooseRail, chooseMotorways, choosePaving];
  const start = Math.floor(k.t2 / 3) % order.length; // choose() runs every 3rd turn
  for (let n = 0; n < order.length; n++) {
    if (order[(start + n) % order.length](g, k, cities, cap)) return;
  }
}

export function updateInfrastructure(g: Game, k: Kingdom): void {
  if (k.caps.roads < 1) return;
  if (!k.infra) {
    if (k.t2 % 3 === 0 && g.pathBudget > 0) { g.pathBudget -= 4; planCalls = 0; choose(g, k); }
    return;
  }
  const p = k.infra;
  const w = g.world;
  let budget = p.kind === 'rail' ? 4 : p.kind === 'highway' ? 8 : 6;
  budget = Math.ceil(budget * Math.min(2.5, k.caps.buildMult));
  while (budget > 0 && p.i < p.path.length) {
    const i = p.path[p.i++];
    const t = w.ter[i];
    if (t <= 2 || t === T.PEAK || t === T.LAVA || t === T.ICE || t === T.MOUNTAIN || w.bld[i]) continue;
    // don't pave through another nation's cities except along trade roads
    const o = w.owner[i];
    if (o && !p.key.startsWith('t:') && !p.key.startsWith('i:')) {
      const c = g.cityById.get(o);
      if (c && c.kingdom !== k) continue;
    }
    if (p.kind === 'road') {
      if (t === T.ROAD || t === T.PAVED || t === T.RAIL) continue;
      if (k.res[RES.WOOD] < 0.5) { p.i--; return; }
      k.res[RES.WOOD] -= 0.5;
      w.setTer(i, k.caps.roads >= 2 ? T.PAVED : T.ROAD);
    } else if (p.kind === 'rail') {
      if (t === T.ROAD || t === T.PAVED || t === T.RAIL) continue;
      if (k.res[RES.METAL] < 1) { p.i--; return; }
      k.res[RES.METAL] -= 1;
      w.setTer(i, T.RAIL);
    } else if (p.kind === 'pave') {
      if (t !== T.ROAD) continue;
      w.setTer(i, T.PAVED);
    } else {
      // highways follow the existing road and are widened to two carriageways
      if (t !== T.ROAD && t !== T.PAVED) continue;
      w.setTer(i, T.HIGHWAY);
      const prev = p.path[Math.max(0, p.i - 2)], W = w.w;
      const horizontal = Math.abs(prev - i) === 1;
      const side = horizontal ? i + W : i + 1; // second carriageway beside the first
      if (side < w.n && !w.bld[side] && (TER[w.ter[side]].build || w.ter[side] === T.ROAD || w.ter[side] === T.PAVED || w.ter[side] === T.FARM) && w.ter[side] !== T.RAIL) {
        w.setTer(side, T.HIGHWAY);
        if (w.flora[side] !== F.NONE) w.setFlora(side, F.NONE);
      }
    }
    if (w.flora[i] !== F.NONE) w.setFlora(i, F.NONE);
    budget--;
  }
  if (p.i >= p.path.length) {
    k.links.add(p.key);
    if (p.kind === 'rail') {
      const ids = p.key.slice(2).split('-').map(Number);
      const a = g.cityById.get(ids[0]), b = g.cityById.get(ids[1]);
      if (a && b) g.log(`🚂 ${g.kName(k)} opened a railway between ${a.name} and ${b.name}`, 'infra', a.x, a.y, k.css);
    } else if (p.key.startsWith('t:')) {
      g.log(`🛣 A trade road now links ${g.kName(k)} with its neighbour`, 'infra', -1, -1, k.css);
    }
    k.infra = null;
  }
}

/** Forget links that refer to cities that no longer belong to the kingdom. */
export function pruneLinks(g: Game, k: Kingdom): void {
  for (const l of Array.from(k.links)) {
    const ids = l.slice(2).split('-').map(Number);
    if (ids.some(id => !g.cityById.has(id))) k.links.delete(l);
  }
}

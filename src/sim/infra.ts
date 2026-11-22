// National infrastructure: intercity roads, railways, highways and international trade roads.
// Projects are planned with the pathfinder and laid a few tiles at a time so they visibly grow.
import type { Game } from './game';
import { Kingdom, City } from './entities';
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

function plan(g: Game, k: Kingdom, kind: 'road' | 'rail' | 'highway', a: City, b: City, k2: string): boolean {
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
function choose(g: Game, k: Kingdom): void {
  const cities = k.cities.filter(c => c.center && c.members.length >= 6);
  if (cities.length === 0) return;
  const cap = k.capital;
  // 1. roads: connect every city to its nearest neighbour (and to the capital)
  for (const a of cities) {
    let best: City | null = null, bd = 1e9;
    for (const b of cities) {
      if (a === b || !sameIsland(g, a, b)) continue;
      const d = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
      if (d > 75 || k.links.has(key('r', a, b))) continue;
      if (d < bd) { bd = d; best = b; }
    }
    if (best && plan(g, k, 'road', a, best, key('r', a, best))) return;
    if (cap && cap !== a && sameIsland(g, a, cap) && !k.links.has(key('r', a, cap))) {
      const d = Math.abs(a.x - cap.x) + Math.abs(a.y - cap.y);
      if (d < 110 && plan(g, k, 'road', a, cap, key('r', a, cap))) return;
    }
  }
  // 2. international trade roads
  for (const o of g.kingdoms) {
    if (o === k) continue;
    const r = k.rel.get(o.id);
    if (!r || !r.trade || r.war) continue;
    let pa: City | null = null, pb: City | null = null, bd = 1e9;
    for (const a of cities) for (const b of o.cities) {
      if (!b.center || !sameIsland(g, a, b)) continue;
      const d = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
      if (d < bd) { bd = d; pa = a; pb = b; }
    }
    if (pa && pb && bd < 120) {
      const kk = key('t', pa, pb);
      if (!k.links.has(kk) && !o.links.has(kk) && plan(g, k, 'road', pa, pb, kk)) return;
    }
  }
  // 3. railways (Industrial Age): capital to every sizeable city
  if (has(k, 'railroad') && cap) {
    for (const a of cities) {
      if (a === cap || a.members.length < 20 || !sameIsland(g, a, cap)) continue;
      const kk = key('l', a, cap);
      if (k.links.has(kk)) continue;
      if (k.res[RES.METAL] < 20) return;
      if (plan(g, k, 'rail', a, cap, kk)) return;
    }
  }
  // 4. highways (Combustion): pave the road links
  if (k.caps.roads >= 2) {
    for (const a of cities) for (const b of cities) {
      if (a.id >= b.id || !k.links.has(key('r', a, b))) continue;
      const kk = key('h', a, b);
      if (k.links.has(kk)) continue;
      if (plan(g, k, 'highway', a, b, kk)) return;
    }
  }
}

export function updateInfrastructure(g: Game, k: Kingdom): void {
  if (k.caps.roads < 1) return;
  if (!k.infra) {
    if (k.t2 % 5 === 0 && g.pathBudget > 0) { g.pathBudget -= 4; planCalls = 0; choose(g, k); }
    return;
  }
  const p = k.infra;
  const w = g.world;
  let budget = p.kind === 'rail' ? 3 : p.kind === 'highway' ? 6 : 4;
  budget = Math.ceil(budget * Math.min(2.5, k.caps.buildMult));
  while (budget > 0 && p.i < p.path.length) {
    const i = p.path[p.i++];
    const t = w.ter[i];
    if (t <= 2 || t === T.PEAK || t === T.LAVA || t === T.ICE || t === T.MOUNTAIN || w.bld[i]) continue;
    // don't pave through another nation's cities except along trade roads
    const o = w.owner[i];
    if (o && !p.key.startsWith('t:')) {
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
    } else {
      // highways only upgrade existing roads (never lay a parallel route)
      if (t !== T.ROAD) continue;
      w.setTer(i, T.PAVED);
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

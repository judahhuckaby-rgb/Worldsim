// Save / load worlds (IndexedDB with localStorage fallback).
import { Game, Laws, defaultLaws } from './game';
import { World } from './world';
import { Unit, Building, City, Kingdom, ORD } from './entities';
import { BLD, UK } from './defs';
import { T, NUM_RES } from './terrain';
import { NUM_TECH, TECH_BY_ID, canResearch } from './tech';
import { refreshStats } from './ai_units';

function rle8(a: Uint8Array): string {
  const out: number[] = [];
  for (let i = 0; i < a.length;) {
    const v = a[i];
    let n = 1;
    while (i + n < a.length && a[i + n] === v && n < 255) n++;
    out.push(n, v);
    i += n;
  }
  let s = '';
  const u = new Uint8Array(out);
  for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode.apply(null, Array.from(u.subarray(i, i + 8192)));
  return btoa(s);
}
function unrle8(s: string, n: number): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(n);
  let o = 0;
  for (let i = 0; i + 1 < bin.length; i += 2) {
    const c = bin.charCodeAt(i), v = bin.charCodeAt(i + 1);
    out.fill(v, o, Math.min(n, o + c));
    o += c;
  }
  return out;
}
function rle32(a: Int32Array): number[] {
  const out: number[] = [];
  for (let i = 0; i < a.length;) {
    const v = a[i];
    let n = 1;
    while (i + n < a.length && a[i + n] === v) n++;
    out.push(n, v);
    i += n;
  }
  return out;
}
function unrle32(r: number[], n: number): Int32Array {
  const out = new Int32Array(n);
  let o = 0;
  for (let i = 0; i + 1 < r.length; i += 2) { out.fill(r[i + 1], o, Math.min(n, o + r[i])); o += r[i]; }
  return out;
}
const r2 = (v: number) => Math.round(v * 100) / 100;

export function serialize(g: Game): string {
  const w = g.world;
  const data = {
    v: 1,
    seed: g.seed, mapType: g.mapType, tick: g.tick, nextId: g.nextId, carbon: g.carbon, laws: g.laws, colorI: g.colorI, stats: g.stats,
    popHistory: g.popHistory.slice(-600),
    politics: {
      council: g.council ? { name: g.council.name, founded: g.council.founded, members: Array.from(g.council.members), sessions: g.council.sessions } : null,
      accords: g.accords.map(a => ({ kind: a.kind, name: a.name, founded: a.founded, signatories: Array.from(a.signatories), withdrawn: Array.from(a.withdrawn) })),
      winter: r2(g.nuclearWinter), combat: g.combatNukes, lastNuke: g.lastNukeYear, free: g.nukeFreeAnnounced, treaties: g.treaties,
    },
    world: {
      w: w.w, h: w.h,
      ter: rle8(w.ter), biome: rle8(w.biome), flora: rle8(w.flora), fstate: rle8(w.fstate), res: rle8(w.res), poll: rle8(w.poll), heat: rle8(w.heat),
      owner: rle32(w.owner),
    },
    kingdoms: g.allKingdoms.map(k => ({
      id: k.id, n: k.baseName, sp: k.species, c: k.color, t: Array.from(k.techs).map(String).join(''), rs: k.researching, pr: r2(k.progress),
      res: k.res.map(r2), rel: Array.from(k.rel.entries()).map(([id, r]) => [id, r2(r.opinion), r.war ? 1 : 0, r.warStart, r.ally ? 1 : 0, r.truce, r2(r.exhaustion), r2(r.memory), r.trade ? 1 : 0, r.nap, r2(r.warScore)]),
      wh: k.warheads, nt: k.nuclearTested, nb: k.nukedBy, na: k.nukedAt, ln: Array.from(k.links),
      alive: k.alive, f: k.founded, king: k.king ? k.king.id : 0, l: k.launches, asc: k.ascended, nk: k.nukesLaunched, pp: k.peakPop, ey: k.eraYears, cs: k.colonyShips,
      cap: k.capital ? k.capital.id : 0, dy: k.diedYear, pl: k.player ? 1 : 0, mob: k.mobilizeT,
    })),
    cities: g.cities.map(c => ({ id: c.id, n: c.name, k: c.kingdom.id, x: c.x, y: c.y, ctr: c.center ? c.center.id : 0, food: r2(c.food), loy: r2(c.loyalty), f: c.founded, lt: c.launchT, cq: c.conquered })),
    buildings: g.buildings.filter(b => !b.dead).map(b => [b.id, b.type, b.city.id, b.x, b.y, Math.round(b.hp), r2(b.progress), b.style]),
    units: g.units.filter(u => !u.dead).map(u => ({
      id: u.id, k: u.kind, sp: u.species, x: r2(u.x), y: r2(u.y), hp: Math.round(u.hp), a: u.ageT, l: u.lifeT,
      kd: u.kingdom ? u.kingdom.id : 0, c: u.city ? u.city.id : 0, j: u.job, n: u.name, tr: u.traits, lv: u.level, xp: u.xp, ki: u.kills,
      sc: u.sclass, vc: u.vclass, kg: u.isKing ? 1 : 0, pl: u.plague, m: u.mission, mx: r2(u.mx), my: r2(u.my), hx: r2(u.homeX), hy: r2(u.homeY),
      ca: u.carryAmt, ib: u.inBoat ? u.inBoat.id : 0,
      o: u.order ? [u.order.type, u.order.city ? u.order.city.id : 0, r2(u.order.x), r2(u.order.y)] : null,
    })),
    history: g.history.slice(-200),
  };
  return JSON.stringify(data);
}

export function deserialize(json: string): Game {
  const d = JSON.parse(json);
  const W = d.world;
  const n = W.w * W.h;
  const world = new World(W.w, W.h);
  world.ter.set(unrle8(W.ter, n));
  world.biome.set(unrle8(W.biome, n));
  world.flora.set(unrle8(W.flora, n));
  world.fstate.set(unrle8(W.fstate, n));
  world.res.set(unrle8(W.res, n));
  world.poll.set(unrle8(W.poll, n));
  world.heat.set(unrle8(W.heat, n));
  world.owner.set(unrle32(W.owner, n));
  for (let i = 0; i < n; i++) if (world.ter[i] === T.LAVA && world.heat[i] > 0) world.lavaList.push(i);
  world.computeTopology();
  const g = new Game(world, d.seed);
  g.mapType = d.mapType;
  g.tick = d.tick;
  g.nextId = d.nextId;
  g.carbon = d.carbon;
  g.laws = { ...defaultLaws(), ...(d.laws as Partial<Laws>) };
  g.colorI = d.colorI;
  g.stats = d.stats;
  g.popHistory = d.popHistory || [];
  const pol = d.politics;
  if (pol) {
    g.council = pol.council ? { name: pol.council.name, founded: pol.council.founded, members: new Set(pol.council.members), sessions: pol.council.sessions } : null;
    g.accords = (pol.accords || []).map((a: any) => ({ kind: a.kind, name: a.name, founded: a.founded, signatories: new Set(a.signatories), withdrawn: new Set(a.withdrawn) }));
    g.nuclearWinter = pol.winter || 0;
    g.combatNukes = pol.combat || 0;
    g.lastNukeYear = pol.lastNuke ?? -1;
    g.nukeFreeAnnounced = !!pol.free;
    g.treaties = pol.treaties || 0;
  }
  g.history = d.history || [];
  // kingdoms
  for (const kd of d.kingdoms) {
    const k = new Kingdom(kd.id, kd.n, kd.sp, kd.c);
    for (let i = 0; i < Math.min(NUM_TECH, kd.t.length); i++) k.techs[i] = kd.t.charCodeAt(i) === 49 ? 1 : 0;
    // v1.2 saves: colonization was a Space Age tech; it now needs the Galactic Age
    const col = TECH_BY_ID['colonization'].idx;
    if (k.techs[col] && !k.techs[TECH_BY_ID['warpdrive'].idx]) k.techs[col] = 0;
    k.researching = kd.rs;
    if (k.researching >= 0 && !canResearch(k.techs, k.researching)) { k.researching = -1; }
    k.progress = kd.pr;
    for (let i = 0; i < NUM_RES; i++) k.res[i] = kd.res[i] || 0;
    for (const r of kd.rel) k.rel.set(r[0], { opinion: r[1], war: !!r[2], warStart: r[3], ally: !!r[4], truce: r[5], exhaustion: r[6], memory: r[7], trade: !!r[8], nap: r[9] || 0, warScore: r[10] || 0 });
    k.warheads = kd.wh || 0;
    k.nuclearTested = !!kd.nt;
    k.nukedBy = kd.nb || 0;
    k.nukedAt = kd.na || 0;
    k.links = new Set(kd.ln || []);
    k.alive = kd.alive;
    k.founded = kd.f;
    k.launches = kd.l;
    k.ascended = kd.asc;
    k.nukesLaunched = kd.nk;
    k.peakPop = kd.pp;
    k.eraYears = kd.ey || [];
    k.colonyShips = kd.cs || 0;
    k.diedYear = kd.dy;
    k.player = !!kd.pl;
    k.mobilizeT = kd.mob || 0;
    g.refreshTechs(k);
    g.allKingdoms.push(k);
    g.kingdomById.set(k.id, k);
    if (k.alive) g.kingdoms.push(k);
    (k as any)._cap = kd.cap;
    (k as any)._king = kd.king;
  }
  for (const cd of d.cities) {
    const k = g.kingdomById.get(cd.k)!;
    const c = new City(cd.id, cd.n, k, cd.x, cd.y);
    c.food = cd.food;
    c.loyalty = cd.loy;
    c.founded = cd.f;
    c.launchT = cd.lt;
    c.conquered = cd.cq || 0;
    (c as any)._ctr = cd.ctr;
    g.cities.push(c);
    g.cityById.set(c.id, c);
    k.cities.push(c);
  }
  for (const k of g.allKingdoms) {
    k.capital = g.cityById.get((k as any)._cap) || k.cities[0] || null;
    delete (k as any)._cap;
  }
  // territory & farms
  for (let i = 0; i < n; i++) {
    const o = world.owner[i];
    if (!o) continue;
    const c = g.cityById.get(o);
    if (!c) { world.owner[i] = 0; continue; }
    c.tiles.push(i);
    if (world.ter[i] === T.FARM) c.farms.push(i);
  }
  for (const b of d.buildings) {
    const [id, type, cid, x, y, hp, progress, style] = b;
    const c = g.cityById.get(cid);
    const def = BLD[type];
    if (!c || !def) continue;
    const bd = new Building(id, def, c, x, y, style, 1);
    bd.maxHp = Math.round(def.hp * (1 + style * 0.35));
    bd.hp = hp;
    bd.progress = progress;
    for (let dy = 0; dy < def.h; dy++) for (let dx = 0; dx < def.w; dx++) if (world.inb(x + dx, y + dy)) world.bld[(y + dy) * world.w + x + dx] = id;
    g.buildings.push(bd);
    g.bldById.set(id, bd);
    c.buildings.push(bd);
  }
  for (const c of g.cities) {
    c.center = g.bldById.get((c as any)._ctr) || null;
    delete (c as any)._ctr;
  }
  const boats: [Unit, number][] = [];
  for (const ud of d.units) {
    const u = new Unit(ud.id, ud.k, ud.x, ud.y);
    u.species = ud.sp;
    u.ageT = ud.a;
    u.lifeT = ud.l;
    u.kingdom = ud.kd ? g.kingdomById.get(ud.kd) || null : null;
    if (u.kingdom && !u.kingdom.alive) u.kingdom = null;
    u.job = ud.j;
    u.name = ud.n;
    u.traits = ud.tr;
    u.level = ud.lv;
    u.xp = ud.xp;
    u.kills = ud.ki;
    u.sclass = ud.sc;
    u.vclass = ud.vc;
    u.isKing = !!ud.kg;
    u.plague = ud.pl;
    u.mission = ud.m;
    u.mx = ud.mx; u.my = ud.my; u.homeX = ud.hx; u.homeY = ud.hy;
    u.carryAmt = ud.ca || 0;
    if (u.kind === UK.BOAT) u.cargo = [];
    const c = ud.c ? g.cityById.get(ud.c) : null;
    if (c) { u.city = c; c.members.push(u); }
    if (ud.o) {
      const oc = ud.o[1] ? g.cityById.get(ud.o[1]) || null : null;
      if (ud.o[0] !== ORD.ATTACK || oc) u.order = { type: ud.o[0], city: oc, x: ud.o[2], y: ud.o[3], since: g.tick };
    }
    const def = { hp: 1 };
    void def;
    g.units.push(u);
    g.unitById.set(u.id, u);
    g.kindCount[u.kind]++;
    u.maxHp = 1;
    refreshStats(g, u);
    u.hp = Math.min(u.maxHp, ud.hp);
    if (ud.ib) boats.push([u, ud.ib]);
  }
  for (const [u, bid] of boats) {
    const b = g.unitById.get(bid);
    if (b && b.cargo) { u.inBoat = b; b.cargo.push(u); }
  }
  for (const k of g.allKingdoms) {
    const kid = (k as any)._king;
    delete (k as any)._king;
    const ku = kid ? g.unitById.get(kid) : null;
    k.king = ku && !ku.dead ? ku : null;
    let p = 0;
    for (const c of k.cities) p += c.members.length;
    k.pop = p;
  }
  for (const c of g.cities) c.capacity = g.cityCapacity(c);
  g.worldEra = g.allKingdoms.reduce((m, k) => Math.max(m, k.era), 0);
  g.personPop = g.kindCount[UK.PERSON];
  world.allDirty = true;
  return g;
}

// ------------------------------------------------------------------ storage
const DB = 'worldsim-ages';
const STORE = 'saves';

function openDB(): Promise<IDBDatabase | null> {
  return new Promise(resolve => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export interface SlotMeta { slot: string; year: number; kingdoms: number; pop: number; date: number; size: string; }

export async function saveSlot(slot: string, g: Game): Promise<boolean> {
  const json = serialize(g);
  const meta: SlotMeta = { slot, year: g.year, kingdoms: g.kingdoms.length, pop: g.personPop, date: Date.now(), size: `${g.world.w}x${g.world.h}` };
  const db = await openDB();
  if (db) {
    const ok = await new Promise<boolean>(resolve => {
      try {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put({ json, meta }, slot);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch { resolve(false); }
    });
    if (ok) return true;
  }
  try {
    localStorage.setItem('ws.save.' + slot, json);
    localStorage.setItem('ws.meta.' + slot, JSON.stringify(meta));
    return true;
  } catch {
    return false;
  }
}

export async function loadSlot(slot: string): Promise<Game | null> {
  const db = await openDB();
  if (db) {
    const rec = await new Promise<any>(resolve => {
      try {
        const tx = db.transaction(STORE, 'readonly');
        const r = tx.objectStore(STORE).get(slot);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => resolve(null);
      } catch { resolve(null); }
    });
    if (rec && rec.json) return deserialize(rec.json);
  }
  try {
    const s = localStorage.getItem('ws.save.' + slot);
    return s ? deserialize(s) : null;
  } catch {
    return null;
  }
}

export async function listSlots(): Promise<Record<string, SlotMeta>> {
  const out: Record<string, SlotMeta> = {};
  const db = await openDB();
  if (db) {
    await new Promise<void>(resolve => {
      try {
        const tx = db.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).openCursor();
        req.onsuccess = () => {
          const cur = req.result;
          if (cur) { const v = cur.value; if (v && v.meta) out[String(cur.key)] = v.meta; cur.continue(); }
          else resolve();
        };
        req.onerror = () => resolve();
      } catch { resolve(); }
    });
  }
  try {
    for (const s of ['1', '2', '3', 'auto']) {
      if (out[s]) continue;
      const m = localStorage.getItem('ws.meta.' + s);
      if (m) out[s] = JSON.parse(m);
    }
  } catch { /* ignore */ }
  return out;
}

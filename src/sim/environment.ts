// Environment: fire, lava, vegetation growth, crops, pollution, climate.
import type { Game } from './game';
import { T, F, TER, isTree, treeFor } from './terrain';

export function environmentTick(g: Game): void {
  updateFire(g);
  updateLava(g);
  const w = g.world;
  const samples = Math.max(120, (w.n / 110) | 0);
  const rng = g.rng;
  for (let s = 0; s < samples; s++) tileTick(g, (rng.next() * w.n) | 0);
}

function updateFire(g: Game): void {
  const w = g.world;
  const list = w.burning;
  if (!list.length) return;
  let j = 0;
  const W = w.w;
  for (let k = 0; k < list.length; k++) {
    const i = list[k];
    let f = w.fire[i];
    if (f === 0) continue;
    f = Math.max(0, f - 1 - (g.rng.next() < 0.3 ? 1 : 0));
    w.fire[i] = f;
    if ((g.tick + i) % 4 === 0) {
      const x = i % W, y = (i / W) | 0;
      for (let d = 0; d < 4; d++) {
        const nx = x + (d === 0 ? 1 : d === 1 ? -1 : 0), ny = y + (d === 2 ? 1 : d === 3 ? -1 : 0);
        if (!w.inb(nx, ny)) continue;
        const n = ny * W + nx;
        if (w.fire[n] || w.isWater(n)) continue;
        let p = TER[w.ter[n]].burn * 0.05;
        const fl = w.flora[n];
        if (isTree(fl)) p += fl === F.DEAD ? 0.3 : 0.14;
        else if (fl === F.BUSH || fl === F.CROP || fl === F.FLOWER) p += 0.08;
        if (w.bld[n]) p += 0.06;
        if (g.rng.next() < p) w.ignite(n, 80 + g.rng.int(80));
      }
      const bid = w.bld[i];
      if (bid) {
        const b = g.bldById.get(bid);
        if (b) g.damageBuilding(b, 4 + b.maxHp * 0.01, null);
      }
    }
    if (f === 0) {
      const fl = w.flora[i];
      if (isTree(fl)) w.setFlora(i, g.rng.next() < 0.35 ? F.DEAD : F.NONE);
      else if (fl !== F.NONE) w.setFlora(i, F.NONE);
      const t = w.ter[i];
      if (t === T.GRASS || t === T.JUNGLE || t === T.SAVANNA || t === T.SWAMP || t === T.FARM || t === T.TUNDRA) w.setTer(i, T.ASH);
      w.mark(i);
      continue;
    }
    list[j++] = i;
  }
  list.length = j;
}

function updateLava(g: Game): void {
  const w = g.world;
  const list = w.lavaList;
  if (!list.length) return;
  const W = w.w;
  let j = 0;
  for (let k = 0; k < list.length; k++) {
    const i = list[k];
    if (w.ter[i] !== T.LAVA) { w.heat[i] = 0; continue; }
    let h = w.heat[i];
    h = Math.max(0, h - (g.rng.next() < 0.5 ? 1 : 0));
    w.heat[i] = h;
    if (h > 110 && g.rng.next() < 0.03) {
      const x = i % W, y = (i / W) | 0;
      const d = g.rng.int(4);
      const nx = x + (d === 0 ? 1 : d === 1 ? -1 : 0), ny = y + (d === 2 ? 1 : d === 3 ? -1 : 0);
      if (w.inb(nx, ny)) {
        const n = ny * W + nx;
        const t = w.ter[n];
        if (t <= 2) {
          // lava meets the sea: new land forms
          w.setTer(n, t === 0 ? T.WATER : g.rng.next() < 0.5 ? T.SAND : T.HILLS);
          g.emit({ kind: 'steam', x: nx + 0.5, y: ny + 0.5 });
        } else if (t !== T.LAVA && t !== T.PEAK && t !== T.MOUNTAIN) {
          w.addLava(n, h - 25);
          const bid = w.bld[n];
          if (bid) { const b = g.bldById.get(bid); if (b) g.damageBuilding(b, 9999, null); }
        }
      }
    }
    if (g.rng.next() < 0.02) {
      const x = i % W, y = (i / W) | 0;
      const nx = x + g.rng.int(3) - 1, ny = y + g.rng.int(3) - 1;
      if (w.inb(nx, ny)) w.ignite(ny * W + nx, 100);
    }
    if (h === 0) {
      w.setTer(i, g.rng.next() < 0.4 ? T.HILLS : T.ASH);
      continue;
    }
    list[j++] = i;
  }
  list.length = j;
}

function tileTick(g: Game, i: number): void {
  const w = g.world;
  const t = w.ter[i];
  const f = w.flora[i];
  const rng = g.rng;
  if (t === T.FARM) {
    if (f === F.CROP) {
      const old = w.fstate[i];
      const nv = Math.min(255, old + 16 + rng.int(12));
      w.fstate[i] = nv;
      if ((old >> 6) !== (nv >> 6)) w.mark(i);
    } else w.setFlora(i, F.CROP);
    return;
  }
  const p = w.poll[i];
  if (p > 0) {
    const W = w.w;
    const x = i % W, y = (i / W) | 0;
    const d = rng.int(4);
    const nx = x + (d === 0 ? 1 : d === 1 ? -1 : 0), ny = y + (d === 2 ? 1 : d === 3 ? -1 : 0);
    let np = p;
    if (w.inb(nx, ny)) {
      const n = ny * W + nx;
      const tr = p >> 2;
      const before = w.poll[n];
      w.poll[n] = Math.min(255, before + tr);
      if ((before >> 5) !== (w.poll[n] >> 5)) w.mark(n);
      np -= tr;
    }
    np = Math.max(0, np - 3);
    if ((p >> 5) !== (np >> 5)) w.mark(i);
    w.poll[i] = np;
    if (np > 120) {
      if (t === T.GRASS || t === T.JUNGLE || t === T.SAVANNA || t === T.SWAMP || t === T.TUNDRA || t === T.ASH) w.setTer(i, T.WASTE);
      if (isTree(f) && f !== F.DEAD) w.setFlora(i, F.DEAD);
      else if (f === F.BUSH || f === F.FLOWER) w.setFlora(i, F.NONE);
    }
  }
  if (t === T.ASH) {
    if (rng.next() < 0.06 && p < 30) w.setTer(i, w.landFor(i));
    return;
  }
  if (t === T.WASTE) {
    if (p < 8 && rng.next() < 0.015) w.setTer(i, T.ASH);
    return;
  }
  // climate change
  if (g.laws.climate) {
    const heat = g.heat;
    if (heat > 0.5) {
      const q = (heat - 0.5) * 0.03;
      if (t === T.SNOW && rng.next() < q) { w.biome[i] = T.TUNDRA; w.setTer(i, T.TUNDRA); return; }
      if (t === T.ICE && rng.next() < q * 1.5) { w.setTer(i, T.SHALLOW); return; }
      if (t === T.TUNDRA && rng.next() < q * 0.3) { w.biome[i] = T.GRASS; w.setTer(i, T.GRASS); return; }
      if (heat > 1.2 && t === T.SAND && rng.next() < q * 0.05) {
        // rising seas swallow beaches
        const W = w.w, x = i % W, y = (i / W) | 0;
        let wn = 0;
        for (let d = 0; d < 4; d++) {
          const nx = x + (d === 0 ? 1 : d === 1 ? -1 : 0), ny = y + (d === 2 ? 1 : d === 3 ? -1 : 0);
          if (w.inb(nx, ny) && w.ter[ny * W + nx] <= 2) wn++;
        }
        if (wn >= 2 && !w.bld[i]) { w.setTer(i, T.SHALLOW); return; }
      }
      if (heat > 1 && (t === T.SAVANNA || t === T.GRASS) && rng.next() < q * 0.02) w.ignite(i, 60);
    }
  }
  // vegetation
  if (f === F.DEAD) { if (rng.next() < 0.03) w.setFlora(i, F.NONE); return; }
  if (f === F.FLOWER) { if (rng.next() < 0.02) w.setFlora(i, F.NONE); return; }
  if (f === F.NONE) {
    if (w.bld[i] || t === T.ROAD || t === T.PAVED || t === T.LAVA || t === T.WASTE || t === T.ICE || t <= 2 || t === T.MOUNTAIN || t === T.PEAK) return;
    const nt = treeFor(t);
    if (nt === F.NONE) return;
    const W = w.w, x = i % W, y = (i / W) | 0;
    let nb = 0;
    if (x > 0 && isTree(w.flora[i - 1])) nb++;
    if (x < W - 1 && isTree(w.flora[i + 1])) nb++;
    if (y > 0 && isTree(w.flora[i - W])) nb++;
    if (y < w.h - 1 && isTree(w.flora[i + W])) nb++;
    let base = 0;
    switch (t) {
      case T.GRASS: base = 0.004 + nb * 0.025; break;
      case T.JUNGLE: base = 0.01 + nb * 0.05; break;
      case T.SAVANNA: base = 0.001 + nb * 0.006; break;
      case T.SWAMP: base = 0.004 + nb * 0.02; break;
      case T.TUNDRA: base = 0.002 + nb * 0.015; break;
      case T.SNOW: base = 0.0005 + nb * 0.004; break;
      case T.HILLS: base = 0.002 + nb * 0.012; break;
      case T.DESERT: base = 0.0006; break;
      case T.SAND: base = 0.0006 + nb * 0.004; break;
    }
    if (nb >= 3) base *= 0.4;
    if (w.owner[i]) base *= 0.25;
    if (rng.next() < base) w.setFlora(i, rng.next() < 0.12 && t !== T.DESERT ? F.BUSH : nt);
  }
}

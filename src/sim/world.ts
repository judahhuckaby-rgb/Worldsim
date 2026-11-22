// The tile world: terrain layers, topology (islands / water bodies), terrain edits.
import { TER, T, F, BIOMES, isWaterT, treeFor } from './terrain';

export class World {
  w: number;
  h: number;
  n: number;
  ter: Uint8Array;
  biome: Uint8Array;
  flora: Uint8Array;
  fstate: Uint8Array;   // crop growth / misc
  res: Uint8Array;      // deposits
  owner: Int32Array;    // city id
  bld: Int32Array;      // building id
  fire: Uint8Array;
  heat: Uint8Array;     // lava heat
  poll: Uint8Array;     // pollution
  island: Int32Array;   // land component id (-1 for water)
  water: Int32Array;    // water body id (-1 for land)
  islandSize: number[] = [];
  waterSize: number[] = [];
  topoDirty = true;
  dirty: Uint8Array;
  dirtyList: number[] = [];
  allDirty = true;
  burning: number[] = [];
  lavaList: number[] = [];

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    const n = (this.n = w * h);
    this.ter = new Uint8Array(n);
    this.biome = new Uint8Array(n).fill(T.GRASS);
    this.flora = new Uint8Array(n);
    this.fstate = new Uint8Array(n);
    this.res = new Uint8Array(n);
    this.owner = new Int32Array(n);
    this.bld = new Int32Array(n);
    this.fire = new Uint8Array(n);
    this.heat = new Uint8Array(n);
    this.poll = new Uint8Array(n);
    this.island = new Int32Array(n).fill(-1);
    this.water = new Int32Array(n).fill(-1);
    this.dirty = new Uint8Array(n);
  }

  inb(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }
  idx(x: number, y: number): number {
    return y * this.w + x;
  }
  tileAt(x: number, y: number): number {
    const tx = Math.floor(x), ty = Math.floor(y);
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return -1;
    return ty * this.w + tx;
  }

  mark(i: number): void {
    if (!this.dirty[i]) {
      this.dirty[i] = 1;
      this.dirtyList.push(i);
    }
  }
  markN(i: number): void {
    this.mark(i);
    const x = i % this.w, y = (i / this.w) | 0;
    if (x > 0) this.mark(i - 1);
    if (x < this.w - 1) this.mark(i + 1);
    if (y > 0) this.mark(i - this.w);
    if (y < this.h - 1) this.mark(i + this.w);
  }

  isWater(i: number): boolean {
    return this.ter[i] <= 2;
  }
  /** Passable for land walkers. */
  walk(i: number): boolean {
    return TER[this.ter[i]].move > 0;
  }
  moveMult(i: number): number {
    return TER[this.ter[i]].move;
  }

  setTer(i: number, t: number): void {
    const old = this.ter[i];
    if (old === t) return;
    const wasWalk = TER[old].move > 0, wasWater = old <= 2;
    this.ter[i] = t;
    if (t <= 2 || t === T.MOUNTAIN || t === T.PEAK || t === T.LAVA || t === T.ICE) {
      // water/rock kills flora (except kelp-less water)
      if (this.flora[i] !== F.NONE) this.flora[i] = F.NONE;
    }
    if (t !== T.FARM && this.flora[i] === F.CROP) this.flora[i] = F.NONE;
    if (t === T.FARM && this.flora[i] !== F.CROP) { this.flora[i] = F.CROP; this.fstate[i] = 0; }
    if (t !== T.LAVA) this.heat[i] = 0;
    if ((TER[t].move > 0) !== wasWalk || (t <= 2) !== wasWater) this.topoDirty = true;
    this.markN(i);
  }

  setFlora(i: number, f: number): void {
    if (this.flora[i] !== f) {
      this.flora[i] = f;
      this.mark(i);
    }
  }

  /** Land type to use when a tile becomes flat land. */
  landFor(i: number): number {
    const b = this.biome[i];
    return BIOMES.includes(b as any) ? b : T.GRASS;
  }

  raise(i: number): void {
    const t = this.ter[i];
    const e = TER[t].elev;
    if (t === T.LAVA) { this.setTer(i, T.MOUNTAIN); return; }
    if (t === T.ICE) { this.setTer(i, T.SNOW); return; }
    switch (e) {
      case 0: this.setTer(i, T.WATER); break;
      case 1: this.setTer(i, T.SHALLOW); break;
      case 2: this.setTer(i, this.biome[i] === T.SNOW ? T.SNOW : T.SAND); break;
      case 3: this.setTer(i, this.landFor(i)); break;
      case 4: this.setTer(i, T.HILLS); break;
      case 5: this.setTer(i, T.MOUNTAIN); break;
      case 6: this.setTer(i, T.PEAK); break;
    }
  }

  lower(i: number): void {
    const t = this.ter[i];
    const e = TER[t].elev;
    if (t === T.ICE) { this.setTer(i, T.WATER); return; }
    switch (e) {
      case 7: this.setTer(i, T.MOUNTAIN); break;
      case 6: this.setTer(i, T.HILLS); break;
      case 5: this.setTer(i, this.landFor(i)); break;
      case 4: this.setTer(i, T.SAND); break;
      case 3: this.setTer(i, T.SHALLOW); break;
      case 2: this.setTer(i, T.WATER); break;
      case 1: this.setTer(i, T.DEEP); break;
    }
  }

  /** Paint a biome: converts water to land too. */
  paintBiome(i: number, b: number): void {
    this.biome[i] = b;
    const t = this.ter[i];
    const e = TER[t].elev;
    if (e <= 3 || e === 4) {
      if (t !== T.ROAD && t !== T.PAVED && t !== T.RAIL && t !== T.HIGHWAY && t !== T.FARM) this.setTer(i, b);
      else this.mark(i);
    } else this.mark(i); // hills/mountains get tinted by biome
    // swap flora to match
    const f = this.flora[i];
    if (f !== F.NONE && f !== F.CROP && f !== F.BUSH && f !== F.FLOWER) {
      const nt = treeFor(b);
      this.setFlora(i, nt === F.NONE ? F.NONE : nt);
    }
  }

  ignite(i: number, amount = 120): void {
    if (this.isWater(i) || this.ter[i] === T.ICE) return;
    if (this.fire[i] === 0) this.burning.push(i);
    this.fire[i] = Math.max(this.fire[i], amount);
  }

  addLava(i: number, heat = 255): void {
    if (this.ter[i] === T.PEAK) return;
    this.setTer(i, T.LAVA);
    if (this.heat[i] === 0) this.lavaList.push(i);
    this.heat[i] = Math.max(this.heat[i], heat);
  }

  computeTopology(): void {
    const { w, h, n } = this;
    const island = this.island, water = this.water;
    island.fill(-1);
    water.fill(-1);
    this.islandSize = [];
    this.waterSize = [];
    const stack = new Int32Array(n);
    for (let s = 0; s < n; s++) {
      const isW = this.ter[s] <= 2;
      if (isW ? water[s] !== -1 : island[s] !== -1) continue;
      if (!isW && TER[this.ter[s]].move <= 0) continue;
      const id = isW ? this.waterSize.length : this.islandSize.length;
      let sp = 0, count = 0;
      stack[sp++] = s;
      if (isW) water[s] = id; else island[s] = id;
      while (sp > 0) {
        const i = stack[--sp];
        count++;
        const x = i % w, y = (i / w) | 0;
        for (let d = 0; d < 4; d++) {
          let nx = x, ny = y;
          if (d === 0) nx++; else if (d === 1) nx--; else if (d === 2) ny++; else ny--;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const j = ny * w + nx;
          if (isW) {
            if (water[j] === -1 && this.ter[j] <= 2) { water[j] = id; stack[sp++] = j; }
          } else {
            if (island[j] === -1 && this.ter[j] > 2 && TER[this.ter[j]].move > 0) { island[j] = id; stack[sp++] = j; }
          }
        }
      }
      if (isW) this.waterSize.push(count); else this.islandSize.push(count);
    }
    // Impassable land (mountains peaks) adopt neighbouring island id for "same-island" checks
    for (let i = 0; i < n; i++) {
      if (island[i] === -1 && this.ter[i] > 2) {
        const x = i % w, y = (i / w) | 0;
        if (x > 0 && island[i - 1] >= 0) island[i] = island[i - 1];
        else if (y > 0 && island[i - w] >= 0) island[i] = island[i - w];
      }
    }
    this.topoDirty = false;
  }

  /** Nearest walkable land tile to (x,y) within radius. */
  nearestLand(x: number, y: number, r: number): number {
    const cx = Math.floor(x), cy = Math.floor(y);
    let best = -1, bd = 1e9;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const nx = cx + dx, ny = cy + dy;
        if (!this.inb(nx, ny)) continue;
        const i = ny * this.w + nx;
        if (this.ter[i] > 2 && TER[this.ter[i]].move > 0 && this.ter[i] !== T.LAVA) {
          const d = dx * dx + dy * dy;
          if (d < bd) { bd = d; best = i; }
        }
      }
    }
    return best;
  }

  nearestWater(x: number, y: number, r: number, body = -1): number {
    const cx = Math.floor(x), cy = Math.floor(y);
    let best = -1, bd = 1e9;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const nx = cx + dx, ny = cy + dy;
        if (!this.inb(nx, ny)) continue;
        const i = ny * this.w + nx;
        if (isWaterT(this.ter[i]) && (body < 0 || this.water[i] === body)) {
          const d = dx * dx + dy * dy;
          if (d < bd) { bd = d; best = i; }
        }
      }
    }
    return best;
  }
}

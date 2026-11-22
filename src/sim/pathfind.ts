// Weighted A* on the tile grid (land or water mode), allocation-free between calls.
import { World } from './world';
import { TER, T } from './terrain';

export class Pathfinder {
  w: number;
  h: number;
  g: Float32Array;
  from: Int32Array;
  stamp: Uint32Array;
  closed: Uint32Array;
  cur = 1;
  heapI: Int32Array;
  heapF: Float32Array;
  hs = 0;

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    const n = w * h;
    this.g = new Float32Array(n);
    this.from = new Int32Array(n);
    this.stamp = new Uint32Array(n);
    this.closed = new Uint32Array(n);
    this.heapI = new Int32Array(n + 8);
    this.heapF = new Float32Array(n + 8);
  }

  private push(i: number, f: number): void {
    let k = this.hs++;
    const HI = this.heapI, HF = this.heapF;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (HF[p] <= f) break;
      HI[k] = HI[p];
      HF[k] = HF[p];
      k = p;
    }
    HI[k] = i;
    HF[k] = f;
  }

  private pop(): number {
    const HI = this.heapI, HF = this.heapF;
    const top = HI[0];
    const n = --this.hs;
    if (n > 0) {
      const li = HI[n], lf = HF[n];
      let k = 0;
      for (;;) {
        let c = 2 * k + 1;
        if (c >= n) break;
        if (c + 1 < n && HF[c + 1] < HF[c]) c++;
        if (HF[c] >= lf) break;
        HI[k] = HI[c];
        HF[k] = HF[c];
        k = c;
      }
      HI[k] = li;
      HF[k] = lf;
    }
    return top;
  }

  /**
   * Find a path from (sx,sy) to (tx,ty). mode 0 = land, 1 = water, 2 = plan railway, 3 = plan road.
   * Returns list of tile indices (excluding start), or null.
   * If the goal is impassable, a neighbouring passable tile is accepted.
   */
  find(world: World, sx: number, sy: number, tx: number, ty: number, mode: number, maxNodes = 5000): number[] | null {
    const w = this.w, h = this.h;
    if (!world.inb(sx, sy) || !world.inb(tx, ty)) return null;
    const start = sy * w + sx, goal = ty * w + tx;
    if (start === goal) return [goal];
    if (++this.cur >= 0xfffffff0) {
      this.cur = 1;
      this.stamp.fill(0);
      this.closed.fill(0);
    }
    const cur = this.cur;
    const ter = world.ter;
    const G = this.g, FROM = this.from, ST = this.stamp, CL = this.closed;
    this.hs = 0;
    G[start] = 0;
    ST[start] = cur;
    FROM[start] = -1;
    this.push(start, 0);
    let expanded = 0;
    let best = -1, bestH = 1e9;
    const W = 1.35;
    while (this.hs > 0) {
      const i = this.pop();
      if (CL[i] === cur) continue;
      CL[i] = cur;
      const x = i % w, y = (i / w) | 0;
      const ddx = Math.abs(x - tx), ddy = Math.abs(y - ty);
      if (i === goal || (ddx <= 1 && ddy <= 1 && !this.pass(ter[goal], mode))) {
        return this.build(i, goal, start);
      }
      const hh = ddx + ddy;
      if (hh < bestH) { bestH = hh; best = i; }
      if (++expanded > maxNodes) break;
      const gi = G[i];
      for (let d = 0; d < 8; d++) {
        let nx = x, ny = y, diag = false;
        switch (d) {
          case 0: nx++; break;
          case 1: nx--; break;
          case 2: ny++; break;
          case 3: ny--; break;
          case 4: nx++; ny++; diag = true; break;
          case 5: nx--; ny++; diag = true; break;
          case 6: nx++; ny--; diag = true; break;
          case 7: nx--; ny--; diag = true; break;
        }
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (CL[j] === cur) continue;
        const tj = ter[j];
        let mult: number;
        if (mode === 0) {
          mult = TER[tj].move;
          if (mult <= 0) continue;
          if (diag && (TER[ter[y * w + nx]].move <= 0 || TER[ter[ny * w + x]].move <= 0)) continue;
        } else if (mode >= 2) {
          // infrastructure planning: 2 = railway (keeps off roads), 3 = road (reuses roads)
          if (TER[tj].move <= 0 || tj === T.LAVA) continue;
          if (diag) continue;
          if (tj === T.MOUNTAIN) mult = 0.25;
          else if (tj === T.HILLS || tj === T.SWAMP) mult = 0.6;
          else if (tj === T.RAIL) mult = mode === 2 ? 2.5 : 0.5;
          else if (tj === T.ROAD || tj === T.PAVED || tj === T.HIGHWAY) mult = mode === 2 ? 0.3 : 2.5;
          else mult = 1;
          if (world.bld[j]) mult *= 0.1;
        } else {
          if (tj > 2) continue;
          if (diag && (ter[y * w + nx] > 2 || ter[ny * w + x] > 2)) continue;
          mult = tj === 0 ? 1.1 : 1;
        }
        const ng = gi + (diag ? 1.4142 : 1) / mult;
        if (ST[j] !== cur || ng < G[j]) {
          ST[j] = cur;
          G[j] = ng;
          FROM[j] = i;
          const hx = Math.abs(nx - tx), hy = Math.abs(ny - ty);
          const hv = (hx > hy ? hx + 0.4142 * hy : hy + 0.4142 * hx) * W;
          this.push(j, ng + hv);
        }
      }
    }
    // Partial path toward best node if reasonably close
    if (best >= 0 && best !== start && bestH < 6) return this.build(best, best, start);
    return null;
  }

  private pass(t: number, mode: number): boolean {
    return mode === 1 ? t <= 2 : TER[t].move > 0;
  }

  private build(end: number, goal: number, start: number): number[] {
    const out: number[] = [];
    let i = end;
    let guard = 0;
    while (i !== start && i >= 0 && guard++ < 100000) {
      out.push(i);
      i = this.from[i];
    }
    out.reverse();
    if (end !== goal && !out.includes(goal)) {
      // goal itself impassable: stop adjacent
    }
    return out;
  }
}

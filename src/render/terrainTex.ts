// Terrain texture with level of detail: overview + lazily built 4px-per-tile chunks (flora, deposits, roads, farms, borders).
import type { Game } from '../sim/game';
import { TER, T, F, R, isRoad } from '../sim/terrain';
import { ERAS } from '../sim/tech';
import { hash2 } from '../core/rng';

export type MapMode = 'normal' | 'political' | 'eras' | 'pollution';

const CH = 32;     // tiles per chunk side
const S = 4;       // pixels per tile
const MAX_CHUNKS = 280;     // detail chunks kept in memory (LRU)
const DETAIL_ZOOM = 3.2;    // below this many screen px per tile, draw the 1px-per-tile overview

interface Chunk {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  img: ImageData;
  dirty: boolean;
  stale: boolean;
  used: number;
}

/**
 * Level-of-detail terrain: a 1 pixel-per-tile overview of the whole world (cheap, always current)
 * plus 4 pixel-per-tile detail chunks that are only created for the area being looked at and
 * evicted when far away, so even enormous worlds stay within a fixed memory budget.
 */
export class TerrainTex {
  g: Game;
  cw: number;
  ch: number;
  chunks = new Map<number, Chunk>();
  mode: MapMode = 'normal';
  overview: HTMLCanvasElement;
  private octx: CanvasRenderingContext2D;
  private oimg: ImageData;
  private odirty = true;
  private frame = 0;
  private pool: Chunk[] = [];
  private tmp = [0, 0, 0];

  constructor(g: Game) {
    this.g = g;
    const w = g.world;
    this.cw = Math.ceil(w.w / CH);
    this.ch = Math.ceil(w.h / CH);
    this.overview = document.createElement('canvas');
    this.overview.width = w.w;
    this.overview.height = w.h;
    this.octx = this.overview.getContext('2d')!;
    this.oimg = this.octx.createImageData(w.w, w.h);
    this.redrawAll();
  }

  setMode(m: MapMode): void {
    if (this.mode === m) return;
    this.mode = m;
    this.redrawAll();
  }

  redrawAll(): void {
    const w = this.g.world;
    for (let i = 0; i < w.n; i++) this.overviewPixel(i);
    for (const c of this.chunks.values()) c.stale = true;
    w.dirtyList.length = 0;
    w.dirty.fill(0);
    w.allDirty = false;
    this.odirty = true;
    this.flush();
  }

  /** Process pending dirty tiles (budgeted). */
  update(): void {
    const w = this.g.world;
    if (w.allDirty) { this.redrawAll(); return; }
    const list = w.dirtyList;
    const n = Math.min(list.length, 20000);
    const W = w.w;
    for (let k = 0; k < n; k++) {
      const i = list[k];
      w.dirty[i] = 0;
      this.overviewPixel(i);
      const tx = i % W, ty = (i / W) | 0;
      const c = this.chunks.get(((ty / CH) | 0) * this.cw + ((tx / CH) | 0));
      if (c && !c.stale) this.drawTile(i, c);
    }
    if (n) this.odirty = true;
    if (n === list.length) list.length = 0;
    else list.splice(0, n);
    this.flush();
  }

  private flush(): void {
    if (this.odirty) {
      this.octx.putImageData(this.oimg, 0, 0);
      this.odirty = false;
    }
    for (const c of this.chunks.values()) {
      if (c.dirty) {
        c.ctx.putImageData(c.img, 0, 0);
        c.dirty = false;
      }
    }
  }

  private chunk(key: number): Chunk {
    let c = this.chunks.get(key);
    if (c) return c;
    if (this.chunks.size >= MAX_CHUNKS) {
      // evict the least recently drawn chunk
      let oldK = -1, oldU = Infinity;
      for (const [k, v] of this.chunks) if (v.used < oldU) { oldU = v.used; oldK = k; }
      const old = this.chunks.get(oldK)!;
      this.chunks.delete(oldK);
      this.pool.push(old);
    }
    c = this.pool.pop();
    if (!c) {
      const canvas = document.createElement('canvas');
      canvas.width = CH * S;
      canvas.height = CH * S;
      const ctx = canvas.getContext('2d')!;
      c = { canvas, ctx, img: ctx.createImageData(CH * S, CH * S), dirty: false, stale: true, used: 0 };
    }
    c.stale = true;
    this.chunks.set(key, c);
    return c;
  }

  private build(key: number, c: Chunk): void {
    const w = this.g.world;
    const cx = key % this.cw, cy = (key / this.cw) | 0;
    const x1 = Math.min(w.w, (cx + 1) * CH), y1 = Math.min(w.h, (cy + 1) * CH);
    for (let y = cy * CH; y < y1; y++) for (let x = cx * CH; x < x1; x++) this.drawTile(y * w.w + x, c);
    c.stale = false;
    c.ctx.putImageData(c.img, 0, 0);
    c.dirty = false;
  }

  draw(ctx: CanvasRenderingContext2D, camX: number, camY: number, zoom: number, vw: number, vh: number): void {
    const w = this.g.world;
    this.frame++;
    const ox = vw / 2 - camX * zoom, oy = vh / 2 - camY * zoom;
    if (zoom < DETAIL_ZOOM) {
      ctx.drawImage(this.overview, 0, 0, w.w, w.h, Math.floor(ox), Math.floor(oy), Math.ceil(w.w * zoom), Math.ceil(w.h * zoom));
      return;
    }
    const x0 = Math.max(0, Math.floor((camX - vw / 2 / zoom) / CH));
    const x1 = Math.min(this.cw - 1, Math.floor((camX + vw / 2 / zoom) / CH));
    const y0 = Math.max(0, Math.floor((camY - vh / 2 / zoom) / CH));
    const y1 = Math.min(this.ch - 1, Math.floor((camY + vh / 2 / zoom) / CH));
    let built = 0;
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const key = cy * this.cw + cx;
        const tw = Math.min(CH, w.w - cx * CH), th = Math.min(CH, w.h - cy * CH);
        const sx = Math.floor(ox + cx * CH * zoom), sy = Math.floor(oy + cy * CH * zoom);
        const dw = Math.ceil(tw * zoom) + 1, dh = Math.ceil(th * zoom) + 1;
        let c = this.chunks.get(key);
        if (!c || c.stale) {
          // build a few chunks per frame; show the overview in the meantime
          if (built < 10) { c = this.chunk(key); this.build(key, c); built++; }
          else { ctx.drawImage(this.overview, cx * CH, cy * CH, tw, th, sx, sy, dw, dh); continue; }
        }
        c.used = this.frame;
        ctx.drawImage(c.canvas, 0, 0, tw * S, th * S, sx, sy, dw, dh);
      }
    }
  }

  /** One averaged colour per tile for the overview / minimap. */
  private overviewPixel(i: number): void {
    const g = this.g;
    const w = g.world;
    const t = w.ter[i];
    let base = TER[t].color;
    let r = base[0], gg = base[1], b = base[2];
    if (t === T.HILLS || t === T.MOUNTAIN) {
      const bc = TER[w.biome[i]].color;
      const k = t === T.HILLS ? 0.45 : 0.18;
      r = r * (1 - k) + bc[0] * k; gg = gg * (1 - k) + bc[1] * k; b = b * (1 - k) + bc[2] * k;
    }
    const f = w.flora[i];
    if (f === F.CROP) { const fs = w.fstate[i]; r = fs >= 200 ? 200 : 130; gg = fs >= 200 ? 175 : 140; b = 60; }
    else if (f && f !== F.FLOWER) { r *= 0.68; gg *= 0.82; b *= 0.68; }
    if (w.bld[i]) { r = 175; gg = 160; b = 150; }
    const poll = w.poll[i];
    const mode = this.mode;
    const o = w.owner[i];
    const city = o ? g.cityById.get(o) : null;
    if (mode === 'pollution') {
      const k = Math.min(1, poll / 200);
      const gray = (r + gg + b) / 3;
      r = gray * 0.5 + 255 * k * 0.7; gg = gray * 0.5 + 60 * (1 - k); b = gray * 0.5 + 40;
    } else if (mode === 'eras') {
      const gray = ((r + gg + b) / 3) * 0.6;
      if (city) { const ec = ERAS[city.kingdom.era].color; r = gray * 0.4 + ec[0] * 0.75; gg = gray * 0.4 + ec[1] * 0.75; b = gray * 0.4 + ec[2] * 0.75; }
      else if (t <= 2) { r *= 0.55; gg *= 0.6; b *= 0.75; }
      else { r = gray; gg = gray; b = gray; }
    } else {
      if (poll > 40 && t > 2) { const k = Math.min(0.5, (poll - 40) / 400); r = r * (1 - k) + 90 * k; gg = gg * (1 - k) + 80 * k; b = b * (1 - k) + 60 * k; }
      if (city) {
        const kc = city.kingdom.color;
        // kingdom borders show as a solid outline at overview scale
        const W = w.w, x = i % W, y = (i / W) | 0;
        let edge = false;
        if (x > 0 && w.owner[i - 1] !== o && this.otherKingdom(i - 1, city.kingdom)) edge = true;
        else if (x < W - 1 && w.owner[i + 1] !== o && this.otherKingdom(i + 1, city.kingdom)) edge = true;
        else if (y > 0 && w.owner[i - W] !== o && this.otherKingdom(i - W, city.kingdom)) edge = true;
        else if (y < w.h - 1 && w.owner[i + W] !== o && this.otherKingdom(i + W, city.kingdom)) edge = true;
        const a = edge ? 0.9 : mode === 'political' ? 0.55 : 0.2;
        r = r * (1 - a) + kc[0] * a; gg = gg * (1 - a) + kc[1] * a; b = b * (1 - a) + kc[2] * a;
      }
    }
    const d = this.oimg.data;
    const p = i * 4;
    d[p] = r; d[p + 1] = gg; d[p + 2] = b; d[p + 3] = 255;
  }

  private otherKingdom(j: number, k: object): boolean {
    const o = this.g.world.owner[j];
    if (!o) return true;
    const c = this.g.cityById.get(o);
    return !c || c.kingdom !== k;
  }

  private ownerKingdomColor(i: number): [number, number, number] | null {
    const o = this.g.world.owner[i];
    if (!o) return null;
    const c = this.g.cityById.get(o);
    return c ? c.kingdom.color : null;
  }

  drawTile(i: number, ch: Chunk): void {
    const g = this.g;
    const w = g.world;
    const tx = i % w.w, ty = (i / w.w) | 0;
    ch.dirty = true;
    const data = ch.img.data;
    const stride = CH * S * 4;
    const bx = (tx % CH) * S, by = (ty % CH) * S;
    const t = w.ter[i];
    const def = TER[t];
    let base = def.color;
    const tmp = this.tmp;
    // hills & mountains are tinted by their biome
    if (t === T.HILLS || t === T.MOUNTAIN) {
      const bc = TER[w.biome[i]].color;
      const k = t === T.HILLS ? 0.45 : 0.18;
      tmp[0] = base[0] * (1 - k) + bc[0] * k; tmp[1] = base[1] * (1 - k) + bc[1] * k; tmp[2] = base[2] * (1 - k) + bc[2] * k;
      base = [tmp[0], tmp[1], tmp[2]];
    }
    const W = w.w;
    const isW = t <= 2;
    // neighbour info for shores
    const nN = ty > 0 ? w.ter[i - W] : t, nS = ty < w.h - 1 ? w.ter[i + W] : t, nW = tx > 0 ? w.ter[i - 1] : t, nE = tx < W - 1 ? w.ter[i + 1] : t;
    const flora = w.flora[i];
    const fs = w.fstate[i];
    const mode = this.mode;
    const kc = this.ownerKingdomColor(i);
    const poll = w.poll[i];
    let eraC: readonly number[] | null = null;
    if (mode === 'eras' && w.owner[i]) {
      const c = g.cityById.get(w.owner[i]);
      if (c) eraC = ERAS[c.kingdom.era].color;
    }
    for (let py = 0; py < S; py++) {
      for (let px = 0; px < S; px++) {
        const h = hash2(tx * S + px, ty * S + py, 7);
        let r = base[0], gg = base[1], b = base[2];
        let n = (h - 0.5) * 16;
        switch (t) {
          case T.DEEP: n *= 0.4; break;
          case T.WATER: n *= 0.5; if (h > 0.93) { r += 14; gg += 18; b += 20; } break;
          case T.SHALLOW: {
            n *= 0.5;
            const shore = (py === 0 && nN > 2) || (py === S - 1 && nS > 2) || (px === 0 && nW > 2) || (px === S - 1 && nE > 2);
            if (shore) { r = 140; gg = 196; b = 226; }
            break;
          }
          case T.SAND: if (h > 0.85) { r -= 18; gg -= 18; b -= 12; } break;
          case T.GRASS: case T.JUNGLE: case T.SAVANNA: if (h > 0.82) { r -= 12; gg -= 16; b -= 8; } else if (h < 0.1) { r += 10; gg += 14; } break;
          case T.SNOW: n *= 0.4; if (h > 0.9) { r -= 18; gg -= 14; b -= 6; } break;
          case T.HILLS: {
            const lit = px + py < 3;
            const dark = px + py > 4;
            if (lit) { r += 16; gg += 16; b += 12; } else if (dark) { r -= 18; gg -= 18; b -= 14; }
            break;
          }
          case T.MOUNTAIN: {
            const ridge = px === py || px === py + 1;
            if (ridge) { r += 22; gg += 22; b += 22; } else if (px > py) { r -= 22; gg -= 22; b -= 22; }
            if (w.biome[i] === T.SNOW && py === 0) { r = 230; gg = 234; b = 240; }
            break;
          }
          case T.PEAK: {
            if (py >= 2 && px > py - 1) { r = 150; gg = 146; b = 140; }
            else if (px > 1 && py < 2) { r -= 10; gg -= 10; b -= 6; }
            break;
          }
          case T.LAVA: { n = 0; if (h > 0.75) { r = 255; gg = 200; b = 60; } else if (h < 0.2) { r = 200; gg = 40; b = 20; } break; }
          case T.ASH: if (h > 0.9) { r += 30; gg += 20; b += 10; } break;
          case T.WASTE: if (h > 0.8) { r -= 20; gg -= 20; b -= 10; } else if (h < 0.1) { r = 90; gg = 110; b = 60; } break;
          case T.ROAD: case T.PAVED: {
            n *= 0.35;
            // which sides continue the street?
            const rdN = isRoad(nN), rdS = isRoad(nS), rdW = isRoad(nW), rdE = isRoad(nE);
            const curb = (py === 0 && !rdN) || (py === S - 1 && !rdS) || (px === 0 && !rdW) || (px === S - 1 && !rdE);
            if (t === T.PAVED) {
              if (curb) { r = 150; gg = 150; b = 150; }
              else if (rdW && rdE && !rdN && !rdS && (py === 1 || py === 2) && py === 1 && px >= 1 && px <= 2 && ((tx & 1) === 0)) { r = 220; gg = 200; b = 110; }
              else if (rdN && rdS && !rdW && !rdE && px === 1 && py >= 1 && py <= 2 && ((ty & 1) === 0)) { r = 220; gg = 200; b = 110; }
            } else if (curb) { r -= 16; gg -= 16; b -= 12; }
            break;
          }
          case T.HIGHWAY: {
            n *= 0.25;
            const hN = nN === T.HIGHWAY, hS = nS === T.HIGHWAY, hW = nW === T.HIGHWAY, hE = nE === T.HIGHWAY;
            const curb = (py === 0 && !isRoad(nN)) || (py === S - 1 && !isRoad(nS)) || (px === 0 && !isRoad(nW)) || (px === S - 1 && !isRoad(nE));
            const horiz = (hW || hE) && !(hN && hS && !hW);
            if (curb) { r = 214; gg = 196; b = 96; }
            else if (horiz && hN && py === 0 && (px & 1)) { r = 235; gg = 235; b = 235; }
            else if (!horiz && hW && px === 0 && (py & 1)) { r = 235; gg = 235; b = 235; }
            break;
          }
          case T.RAIL: {
            n *= 0.3;
            const hor = nE === T.RAIL || nW === T.RAIL, ver = nN === T.RAIL || nS === T.RAIL;
            const h2 = hor || !ver, v2 = ver;
            const tie = (h2 && (px === 0 || px === 2)) || (v2 && (py === 0 || py === 2));
            const railP = (h2 && (py === 1 || py === 2)) || (v2 && (px === 1 || px === 2));
            if (railP) { r = 70; gg = 72; b = 80; }
            else if (tie) { r = 96; gg = 70; b = 46; }
            break;
          }
          case T.FARM: {
            n *= 0.4;
            if (py % 2 === 1) { r -= 18; gg -= 14; b -= 8; }
            break;
          }
          case T.ICE: if (h > 0.85) { r = 250; gg = 252; b = 255; } break;
        }
        r += n; gg += n; b += n;
        // flora
        if (flora !== F.NONE) {
          const fc = floraPixel(flora, px, py, h, fs, t);
          if (fc) { r = fc[0]; gg = fc[1]; b = fc[2]; }
        }
        // deposits
        const dep = w.res[i];
        if (dep && (px + py * 2 + (tx & 1)) % 5 === 1 && !(flora && isTreeLike(flora))) {
          switch (dep) {
            case R.ORE: r = 170; gg = 100; b = 70; break;
            case R.GOLD: r = 255; gg = 220; b = 70; break;
            case R.COAL: r = 30; gg = 30; b = 34; break;
            case R.OIL: r = 20; gg = 16; b = 24; break;
            case R.URANIUM: r = 120; gg = 255; b = 90; break;
          }
        }
        // pollution haze
        if (poll > 40 && !isW) {
          const k = Math.min(0.5, (poll - 40) / 400);
          r = r * (1 - k) + 90 * k; gg = gg * (1 - k) + 80 * k; b = b * (1 - k) + 60 * k;
        } else if (poll > 60 && isW) {
          const k = Math.min(0.5, (poll - 60) / 400);
          r = r * (1 - k) + 70 * k; gg = gg * (1 - k) + 90 * k; b = b * (1 - k) + 60 * k;
        }
        // map modes and borders
        if (mode === 'pollution') {
          const k = Math.min(1, poll / 200);
          const gray = (r + gg + b) / 3;
          r = gray * 0.5 + 255 * k * 0.7; gg = gray * 0.5 + 60 * (1 - k); b = gray * 0.5 + 40;
        } else if (mode === 'eras') {
          const gray = (r + gg + b) / 3 * 0.6;
          if (eraC) { r = gray * 0.4 + eraC[0] * 0.75; gg = gray * 0.4 + eraC[1] * 0.75; b = gray * 0.4 + eraC[2] * 0.75; }
          else if (isW) { r *= 0.55; gg *= 0.6; b *= 0.75; }
          else { r = gray; gg = gray; b = gray; }
        } else if (kc) {
          const a = mode === 'political' ? 0.55 : 0.16;
          r = r * (1 - a) + kc[0] * a; gg = gg * (1 - a) + kc[1] * a; b = b * (1 - a) + kc[2] * a;
        }
        if (kc && mode !== 'pollution') {
          const e = borderEdge(g, i, tx, ty, px, py);
          if (e === 2) { r = kc[0]; gg = kc[1]; b = kc[2]; }
          else if (e === 1 && mode !== 'eras') { r = r * 0.55 + kc[0] * 0.45; gg = gg * 0.55 + kc[1] * 0.45; b = b * 0.55 + kc[2] * 0.45; }
        }
        const o = (by + py) * stride + (bx + px) * 4;
        data[o] = r;
        data[o + 1] = gg;
        data[o + 2] = b;
        data[o + 3] = 255;
      }
    }
  }
}

function isTreeLike(f: number): boolean {
  return f !== F.CROP && f !== F.FLOWER;
}

/** 0 none, 1 city border (same kingdom), 2 kingdom border */
function borderEdge(g: Game, i: number, tx: number, ty: number, px: number, py: number): number {
  const w = g.world;
  const o = w.owner[i];
  let res = 0;
  const check = (j: number): number => {
    const oj = j < 0 ? 0 : w.owner[j];
    if (oj === o) return 0;
    if (!oj) return 2;
    const a = g.cityById.get(o), b = g.cityById.get(oj);
    if (!a || !b) return 2;
    return a.kingdom === b.kingdom ? 1 : 2;
  };
  if (py === 0) res = Math.max(res, check(ty > 0 ? i - w.w : -1));
  if (py === S - 1) res = Math.max(res, check(ty < w.h - 1 ? i + w.w : -1));
  if (px === 0) res = Math.max(res, check(tx > 0 ? i - 1 : -1));
  if (px === S - 1) res = Math.max(res, check(tx < w.w - 1 ? i + 1 : -1));
  return res;
}

const OAK_A: number[][] = [[0, 1, 1, 0], [1, 1, 1, 1], [1, 1, 1, 1], [0, 2, 2, 0]];
const PINE_A: number[][] = [[0, 1, 1, 0], [0, 1, 1, 0], [1, 1, 1, 1], [0, 2, 2, 0]];
const PALM_A: number[][] = [[1, 1, 1, 1], [1, 2, 2, 1], [0, 2, 0, 0], [0, 2, 0, 0]];
const BUSH_A: number[][] = [[0, 0, 0, 0], [0, 1, 1, 0], [1, 3, 1, 1], [0, 1, 1, 0]];
const CACT_A: number[][] = [[0, 1, 0, 0], [1, 1, 0, 1], [0, 1, 1, 1], [0, 1, 0, 0]];
const DEAD_A: number[][] = [[1, 0, 0, 1], [0, 1, 1, 0], [0, 1, 0, 0], [0, 1, 0, 0]];
const FLOW_A: number[][] = [[0, 0, 3, 0], [3, 0, 0, 0], [0, 0, 0, 3], [0, 3, 0, 0]];

function floraPixel(f: number, px: number, py: number, h: number, fs: number, t: number): number[] | null {
  let a: number[][];
  let leaf: number[];
  switch (f) {
    case F.OAK: a = OAK_A; leaf = t === T.SAVANNA ? [120, 140, 50] : [44, 120, 40]; break;
    case F.PINE: a = PINE_A; leaf = t === T.SNOW ? [40, 90, 70] : [30, 96, 58]; break;
    case F.PALM: a = PALM_A; leaf = [70, 160, 60]; break;
    case F.JTREE: a = OAK_A; leaf = [24, 100, 40]; break;
    case F.STREE: a = OAK_A; leaf = [70, 96, 50]; break;
    case F.BUSH: a = BUSH_A; leaf = [60, 140, 50]; break;
    case F.CACTUS: a = CACT_A; leaf = [70, 150, 70]; break;
    case F.DEAD: a = DEAD_A; leaf = [100, 84, 70]; break;
    case F.FLOWER: a = FLOW_A; leaf = [240, 220, 80]; break;
    case F.CROP: {
      // crop rows: green -> golden as they ripen
      if (py % 2 === 1) return null;
      if (fs < 60) return (px + py) % 3 === 0 ? [90, 150, 60] : null;
      if (fs < 200) return [100 + fs * 0.2, 160, 50];
      return [220, 190, 70];
    }
    default: return null;
  }
  const v = a[py][px];
  if (v === 0) return null;
  if (v === 2) return [96, 64, 40];
  if (v === 3) return f === F.FLOWER ? (h > 0.5 ? [240, 90, 120] : [250, 240, 120]) : [200, 40, 50];
  const k = h > 0.6 ? 1.15 : h < 0.25 ? 0.85 : 1;
  return [leaf[0] * k, leaf[1] * k, leaf[2] * k];
}

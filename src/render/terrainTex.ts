// Chunked terrain texture: 4 art pixels per tile, includes flora, deposits, roads, farms and borders.
import type { Game } from '../sim/game';
import { TER, T, F, R } from '../sim/terrain';
import { ERAS } from '../sim/tech';
import { hash2 } from '../core/rng';

export type MapMode = 'normal' | 'political' | 'eras' | 'pollution';

const CH = 32;     // tiles per chunk side
const S = 4;       // pixels per tile

interface Chunk {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  img: ImageData;
  dirty: boolean;
}

export class TerrainTex {
  g: Game;
  cw: number;
  ch: number;
  chunks: Chunk[] = [];
  mode: MapMode = 'normal';
  private tmp = [0, 0, 0];

  constructor(g: Game) {
    this.g = g;
    const w = g.world;
    this.cw = Math.ceil(w.w / CH);
    this.ch = Math.ceil(w.h / CH);
    for (let i = 0; i < this.cw * this.ch; i++) {
      const canvas = document.createElement('canvas');
      canvas.width = CH * S;
      canvas.height = CH * S;
      const ctx = canvas.getContext('2d')!;
      this.chunks.push({ canvas, ctx, img: ctx.createImageData(CH * S, CH * S), dirty: true });
    }
    this.redrawAll();
  }

  setMode(m: MapMode): void {
    if (this.mode === m) return;
    this.mode = m;
    this.redrawAll();
  }

  redrawAll(): void {
    const w = this.g.world;
    for (let i = 0; i < w.n; i++) this.drawTile(i);
    w.dirtyList.length = 0;
    w.dirty.fill(0);
    w.allDirty = false;
    this.flush();
  }

  /** Process pending dirty tiles (budgeted). */
  update(): void {
    const w = this.g.world;
    if (w.allDirty) { this.redrawAll(); return; }
    const list = w.dirtyList;
    const n = Math.min(list.length, 6000);
    for (let k = 0; k < n; k++) {
      const i = list[k];
      w.dirty[i] = 0;
      this.drawTile(i);
    }
    if (n === list.length) list.length = 0;
    else list.splice(0, n);
    this.flush();
  }

  private flush(): void {
    for (const c of this.chunks) {
      if (c.dirty) {
        c.ctx.putImageData(c.img, 0, 0);
        c.dirty = false;
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D, camX: number, camY: number, zoom: number, vw: number, vh: number): void {
    const w = this.g.world;
    const x0 = Math.max(0, Math.floor((camX - vw / 2 / zoom) / CH));
    const x1 = Math.min(this.cw - 1, Math.floor((camX + vw / 2 / zoom) / CH));
    const y0 = Math.max(0, Math.floor((camY - vh / 2 / zoom) / CH));
    const y1 = Math.min(this.ch - 1, Math.floor((camY + vh / 2 / zoom) / CH));
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const c = this.chunks[cy * this.cw + cx];
        const sx = (cx * CH - camX) * zoom + vw / 2;
        const sy = (cy * CH - camY) * zoom + vh / 2;
        const tw = Math.min(CH, w.w - cx * CH), th = Math.min(CH, w.h - cy * CH);
        // overlap by a hair to avoid seams
        ctx.drawImage(c.canvas, 0, 0, tw * S, th * S, Math.floor(sx), Math.floor(sy), Math.ceil(tw * zoom) + 1, Math.ceil(th * zoom) + 1);
      }
    }
  }

  private ownerKingdomColor(i: number): [number, number, number] | null {
    const o = this.g.world.owner[i];
    if (!o) return null;
    const c = this.g.cityById.get(o);
    return c ? c.kingdom.color : null;
  }

  drawTile(i: number): void {
    const g = this.g;
    const w = g.world;
    const tx = i % w.w, ty = (i / w.w) | 0;
    const ch = this.chunks[((ty / CH) | 0) * this.cw + ((tx / CH) | 0)];
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
          case T.ROAD: { const edge = px === 0 || py === 0 || px === S - 1 || py === S - 1; if (edge) { r -= 14; gg -= 14; b -= 10; } n *= 0.4; break; }
          case T.PAVED: { n *= 0.3; if ((px === 1 || px === 2) && (py === 1 || py === 2) && ((tx + ty) & 1)) { r = 200; gg = 200; b = 170; } break; }
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

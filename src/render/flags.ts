// Procedurally designed national flags (deterministic per kingdom).
import type { Kingdom } from '../sim/entities';
import { hash2 } from '../core/rng';

type RGB = [number, number, number];
const PALETTE: RGB[] = [
  [245, 245, 245], [210, 40, 50], [30, 70, 170], [250, 205, 40], [20, 130, 70], [20, 20, 24], [240, 130, 30], [90, 170, 230], [130, 30, 60],
];

const cache = new Map<string, HTMLCanvasElement>();
const urls = new Map<string, string>();

function css(c: RGB): string {
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
function dist(a: RGB, b: RGB): number {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
}

export function flagCanvas(k: Kingdom, seed = 0): HTMLCanvasElement {
  const key = `${k.id}|${seed}|${k.color.join(',')}`;
  let c = cache.get(key);
  if (c) return c;
  const W = 18, H = 12;
  c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const x = c.getContext('2d')!;
  const r = (n: number) => hash2(k.id * 7 + n, seed, 91);
  const main = k.color;
  const pick = (n: number, avoid: RGB[]): RGB => {
    for (let t = 0; t < 12; t++) {
      const col = PALETTE[Math.floor(r(n + t * 13) * PALETTE.length)];
      if (avoid.every(a => dist(a, col) > 160)) return col;
    }
    return [245, 245, 245];
  };
  const c2 = pick(1, [main]);
  const c3 = pick(2, [main, c2]);
  const pattern = Math.floor(r(3) * 8);
  const fill = (col: RGB, a: number, b: number, w: number, h: number) => { x.fillStyle = css(col); x.fillRect(a, b, w, h); };
  switch (pattern) {
    case 0: fill(main, 0, 0, W, 4); fill(c2, 0, 4, W, 4); fill(c3, 0, 8, W, 4); break;
    case 1: fill(main, 0, 0, 6, H); fill(c2, 6, 0, 6, H); fill(c3, 12, 0, 6, H); break;
    case 2: fill(main, 0, 0, W, H); fill(c2, 5, 0, 3, H); fill(c2, 0, 5, W, 2); break; // nordic cross
    case 3: { // stripes with canton
      for (let i = 0; i < 6; i++) fill(i % 2 ? c2 : main, 0, i * 2, W, 2);
      fill(c3, 0, 0, 8, 6);
      x.fillStyle = css(c2); x.fillRect(3, 2, 2, 2);
      break;
    }
    case 4: { // diagonal
      fill(main, 0, 0, W, H);
      x.fillStyle = css(c2);
      x.beginPath(); x.moveTo(W, 0); x.lineTo(W, H); x.lineTo(0, H); x.closePath(); x.fill();
      break;
    }
    case 5: fill(main, 0, 0, W, 6); fill(c2, 0, 6, W, 6); x.fillStyle = css(c3); x.beginPath(); x.arc(W / 2, H / 2, 3, 0, Math.PI * 2); x.fill(); break;
    case 6: { // field with emblem star
      fill(main, 0, 0, W, H);
      x.fillStyle = css(c2);
      x.beginPath();
      for (let i = 0; i < 10; i++) {
        const ang = -Math.PI / 2 + (i * Math.PI) / 5;
        const rad = i % 2 ? 1.6 : 4;
        const px = 9 + Math.cos(ang) * rad, py = 6.3 + Math.sin(ang) * rad;
        if (i) x.lineTo(px, py); else x.moveTo(px, py);
      }
      x.closePath();
      x.fill();
      break;
    }
    default: fill(c2, 0, 0, 5, H); fill(main, 5, 0, 13, H); fill(c3, 5, 4, 13, 4); break; // hoist band
  }
  x.strokeStyle = 'rgba(0,0,0,0.35)';
  x.lineWidth = 1;
  x.strokeRect(0.5, 0.5, W - 1, H - 1);
  cache.set(key, c);
  return c;
}

/** Data URL of the flag at a crisp scale, for DOM use. */
export function flagURL(k: Kingdom, seed = 0): string {
  const key = `${k.id}|${seed}|${k.color.join(',')}`;
  let u = urls.get(key);
  if (u) return u;
  const src = flagCanvas(k, seed);
  const out = document.createElement('canvas');
  out.width = src.width * 3;
  out.height = src.height * 3;
  const ctx = out.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, 0, 0, out.width, out.height);
  u = out.toDataURL();
  urls.set(key, u);
  return u;
}

export function flagImg(k: Kingdom, seed = 0, h = 14): string {
  return `<img class="flag" src="${flagURL(k, seed)}" style="height:${h}px;width:${Math.round(h * 1.5)}px" alt="">`;
}

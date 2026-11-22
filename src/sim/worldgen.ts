// Procedural world generation.
import { RNG, clamp } from '../core/rng';
import { Noise2D } from '../core/noise';
import { World } from './world';
import { T, F, R, TER } from './terrain';

export type MapType = 'continents' | 'pangaea' | 'archipelago' | 'lakes' | 'ocean' | 'highlands';

export interface GenOptions {
  w: number;
  h: number;
  seed: number;
  type: MapType;
}

export const MAP_TYPES: { key: MapType; name: string }[] = [
  { key: 'continents', name: 'Continents' },
  { key: 'pangaea', name: 'Pangaea' },
  { key: 'archipelago', name: 'Archipelago' },
  { key: 'lakes', name: 'Lakelands' },
  { key: 'highlands', name: 'Highlands' },
  { key: 'ocean', name: 'Empty Ocean' },
];

export function generateWorld(o: GenOptions): World {
  const { w, h } = o;
  const rng = new RNG(o.seed);
  const nE = new Noise2D(rng), nC = new Noise2D(rng), nM = new Noise2D(rng), nT = new Noise2D(rng), nF = new Noise2D(rng), nR = new Noise2D(rng), nD = new Noise2D(rng);
  const world = new World(w, h);
  const n = w * h;
  const elev = new Float32Array(n);
  const scale = 1 / 64 * (240 / Math.max(160, Math.min(w, h * 1.5)));
  let landRatio = 0.42;
  // continent seeds
  const seeds: { x: number; y: number; r: number }[] = [];
  const numSeeds = o.type === 'continents' ? 2 + rng.int(3) : o.type === 'archipelago' ? 14 + rng.int(8) : 1;
  for (let i = 0; i < numSeeds; i++) {
    seeds.push({ x: rng.range(0.15, 0.85) * w, y: rng.range(0.18, 0.82) * h, r: (o.type === 'archipelago' ? rng.range(0.05, 0.11) : rng.range(0.22, 0.34)) * Math.min(w, h * 1.4) });
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const nx = x * scale, ny = y * scale;
      let e = nE.fbm(nx * 1.6, ny * 1.6, 6) * 0.5 + 0.5;
      const edge = Math.min(x, y, w - 1 - x, h - 1 - y) / (Math.min(w, h) * 0.12);
      const edgeF = clamp(edge, 0, 1);
      switch (o.type) {
        case 'continents': {
          let m = 0;
          for (const s of seeds) {
            const d = Math.hypot((x - s.x) / s.r, (y - s.y) / s.r * 1.1);
            m = Math.max(m, 1 - d);
          }
          const warp = nC.fbm(nx * 0.7, ny * 0.7, 3) * 0.35;
          e = e * 0.55 + clamp(m + warp, -0.5, 1) * 0.6;
          landRatio = 0.4;
          break;
        }
        case 'pangaea': {
          const d = Math.hypot((x - w / 2) / (w * 0.42), (y - h / 2) / (h * 0.42));
          e = e * 0.5 + (1 - d) * 0.65 + nC.fbm(nx * 0.6, ny * 0.6, 3) * 0.2;
          landRatio = 0.47;
          break;
        }
        case 'archipelago': {
          let m = 0;
          for (const s of seeds) {
            const d = Math.hypot((x - s.x) / s.r, (y - s.y) / s.r);
            m = Math.max(m, 1 - d);
          }
          e = e * 0.6 + m * 0.55 + nC.fbm(nx * 2.5, ny * 2.5, 3) * 0.15;
          landRatio = 0.27;
          break;
        }
        case 'lakes': {
          e = e * 0.8 + 0.2 + nC.fbm(nx * 2.2, ny * 2.2, 3) * 0.2;
          landRatio = 0.74;
          break;
        }
        case 'highlands': {
          e = e * 0.6 + nR.ridge(nx * 1.2, ny * 1.2) * 0.5;
          landRatio = 0.6;
          break;
        }
        case 'ocean': {
          e = e * 0.2;
          landRatio = 0;
          break;
        }
      }
      e = e * (0.35 + 0.65 * edgeF);
      elev[i] = e;
    }
  }

  // Sea level by percentile
  let sea = 2;
  if (landRatio > 0) {
    const sorted = Array.from(elev).sort((a, b) => a - b);
    sea = sorted[Math.floor((1 - landRatio) * (n - 1))];
  }
  let maxE = 0;
  for (let i = 0; i < n; i++) if (elev[i] > maxE) maxE = elev[i];

  const mountainBoost = o.type === 'highlands' ? 1.25 : 1;
  for (let y = 0; y < h; y++) {
    const lat = Math.abs(y / (h - 1) - 0.5) * 2;
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const nx = x * scale, ny = y * scale;
      const e = elev[i];
      const moist = nM.fbm(nx * 1.3, ny * 1.3, 4) * 0.5 + 0.5;
      let hl = (e - sea) / Math.max(0.0001, maxE - sea);
      if (hl > 0) {
        const r = nR.ridge(nx * 1.4 + 9, ny * 1.4 - 3);
        hl = hl * 0.75 + Math.max(0, r - 0.55) * 0.9 * mountainBoost;
      }
      const temp = 1 - lat * 1.12 + nT.fbm(nx, ny, 3) * 0.25 - Math.max(0, hl) * 0.45;
      // biome
      let b: number = T.GRASS;
      if (temp < 0.1) b = T.SNOW;
      else if (temp < 0.26) b = T.TUNDRA;
      else if (temp > 0.7) b = moist < 0.36 ? T.DESERT : moist > 0.62 ? T.JUNGLE : T.SAVANNA;
      else if (temp > 0.55 && moist < 0.28) b = T.DESERT;
      else if (moist < 0.3) b = T.SAVANNA;
      else if (moist > 0.7 && hl < 0.18) b = T.SWAMP;
      world.biome[i] = b;

      let t: number;
      if (e < sea) {
        const d = sea - e;
        t = d > 0.12 ? T.DEEP : d > 0.035 ? T.WATER : T.SHALLOW;
        if (temp < 0.04 && t !== T.DEEP) t = T.ICE;
      } else if (hl < 0.035) t = b === T.SNOW ? T.SNOW : b === T.SWAMP ? T.SWAMP : T.SAND;
      else if (hl < 0.56) t = b;
      else if (hl < 0.7) t = T.HILLS;
      else if (hl < 0.84) t = T.MOUNTAIN;
      else t = T.PEAK;
      world.ter[i] = t;

      // flora
      const forest = nF.fbm(nx * 2.2, ny * 2.2, 4);
      const rr = rng.next();
      let f: number = F.NONE;
      switch (t) {
        case T.GRASS: f = forest > 0.12 ? (rr < 0.72 ? F.OAK : rr < 0.76 ? F.BUSH : F.NONE) : rr < 0.025 ? F.OAK : rr < 0.045 ? F.BUSH : rr < 0.06 ? F.FLOWER : F.NONE; break;
        case T.JUNGLE: f = forest > -0.2 ? (rr < 0.65 ? F.JTREE : rr < 0.7 ? F.BUSH : F.NONE) : rr < 0.1 ? F.JTREE : F.NONE; break;
        case T.SAVANNA: f = rr < 0.04 ? F.OAK : rr < 0.06 ? F.BUSH : F.NONE; break;
        case T.DESERT: f = rr < 0.015 ? F.CACTUS : F.NONE; break;
        case T.SWAMP: f = rr < 0.3 ? F.STREE : rr < 0.34 ? F.BUSH : F.NONE; break;
        case T.TUNDRA: f = forest > 0.05 ? (rr < 0.5 ? F.PINE : F.NONE) : rr < 0.04 ? F.PINE : F.NONE; break;
        case T.SNOW: f = forest > 0.2 && rr < 0.3 ? F.PINE : F.NONE; break;
        case T.HILLS: f = forest > 0.1 && rr < 0.4 ? (b === T.SNOW || b === T.TUNDRA ? F.PINE : rr < 0.2 ? F.PINE : F.OAK) : rr < 0.04 ? F.PINE : F.NONE; break;
        case T.SAND: f = temp > 0.55 && rr < 0.035 ? F.PALM : F.NONE; break;
      }
      world.flora[i] = f;

      // deposits
      const dn = nD.noise(nx * 6, ny * 6);
      const r2 = rng.next();
      if (t === T.HILLS || t === T.MOUNTAIN) {
        if (dn > 0.45 && r2 < 0.35) world.res[i] = R.ORE;
        else if (dn < -0.55 && r2 < 0.35) world.res[i] = R.COAL;
        else if (t === T.MOUNTAIN && r2 < 0.006) world.res[i] = R.GOLD;
        else if (t === T.MOUNTAIN && r2 > 0.993) world.res[i] = R.URANIUM;
      } else if (t === T.DESERT || t === T.SWAMP || t === T.TUNDRA) {
        if (dn > 0.55 && r2 < 0.3) world.res[i] = R.OIL;
        else if (t === T.DESERT && r2 > 0.996) world.res[i] = R.URANIUM;
      } else if (TER[t].elev === 4 && dn > 0.7 && r2 < 0.12) {
        world.res[i] = R.ORE;
      }
    }
  }
  world.computeTopology();
  world.allDirty = true;
  return world;
}

// Procedural world generation.
import { RNG, clamp } from '../core/rng';
import { Noise2D } from '../core/noise';
import { World } from './world';
import { T, F, R, TER } from './terrain';
import { earthLand, EARTH_W, EARTH_H, EARTH_LAT_N } from './earth';

export type MapType = 'continents' | 'pangaea' | 'archipelago' | 'lakes' | 'ocean' | 'highlands' | 'earth';

export interface GenOptions {
  w: number;
  h: number;
  seed: number;
  type: MapType;
}

export const MAP_TYPES: { key: MapType; name: string }[] = [
  { key: 'earth', name: 'Earth' },
  { key: 'continents', name: 'Continents' },
  { key: 'pangaea', name: 'Pangaea' },
  { key: 'archipelago', name: 'Archipelago' },
  { key: 'lakes', name: 'Lakelands' },
  { key: 'highlands', name: 'Highlands' },
  { key: 'ocean', name: 'Empty Ocean' },
];

// Major mountain ranges of Earth as [lon, lat] polylines (for the Earth map).
const RANGES: [number, number][][] = [
  [[-80, 8], [-78, -5], [-75, -15], [-70, -25], [-71, -40], [-73, -52]],          // Andes
  [[-150, 63], [-130, 58], [-120, 50], [-112, 42], [-106, 35], [-104, 30]],        // Rockies
  [[-100, 25], [-98, 19]],                                                         // Sierra Madre
  [[-84, 34], [-78, 39], [-72, 44]],                                               // Appalachians
  [[-8, 43], [1, 42.5]],                                                           // Pyrenees
  [[6, 45.5], [10, 46.5], [15, 47]],                                               // Alps
  [[20, 48], [25, 46]],                                                            // Carpathians
  [[40, 43], [48, 42]],                                                            // Caucasus
  [[44, 37], [52, 33], [58, 28]],                                                  // Zagros
  [[60, 37], [70, 37], [77, 35], [85, 29], [92, 28], [97, 28]],                   // Himalaya
  [[75, 42], [85, 43], [95, 44]],                                                  // Tian Shan
  [[59, 67], [59, 60], [58, 52]],                                                  // Urals
  [[38, 12], [37, 3], [35, -5], [33, -12]],                                        // East African highlands
  [[-6, 31], [0, 33], [8, 35]],                                                    // Atlas
  [[146, -36], [150, -30], [148, -22]],                                            // Great Dividing Range
  [[100, 60], [115, 57], [130, 60], [150, 64]],                                    // Siberian ranges
];

function rangeBoost(lon: number, lat: number): number {
  let best = 0;
  for (const r of RANGES) {
    for (let i = 0; i < r.length - 1; i++) {
      const [ax, ay] = r[i], [bx, by] = r[i + 1];
      const dx = bx - ax, dy = by - ay;
      const t = Math.max(0, Math.min(1, ((lon - ax) * dx + (lat - ay) * dy) / (dx * dx + dy * dy)));
      const d = Math.hypot(lon - (ax + dx * t), lat - (ay + dy * t));
      if (d < 3.2) best = Math.max(best, 1 - d / 3.2);
    }
  }
  return best;
}

function earthMask(lon: number, lat: number): number {
  // bilinear sample of the 1° land mask
  const fx = lon + 180 - 0.5, fy = EARTH_LAT_N - lat - 0.5;
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const tx = fx - x0, ty = fy - y0;
  const a = earthLand(x0, y0), b = earthLand(x0 + 1, y0), c = earthLand(x0, y0 + 1), d = earthLand(x0 + 1, y0 + 1);
  return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
}

export function generateWorld(o: GenOptions): World {
  const w = o.w;
  // Earth keeps its real proportions (roughly a Miller-style projection)
  const h = o.type === 'earth' ? Math.round(o.w / 2.2) : o.h;
  const earth = o.type === 'earth';
  const lonOf = (x: number) => -180 + ((x + 0.5) / w) * EARTH_W;
  const latOf = (y: number) => EARTH_LAT_N - ((y + 0.5) / h) * EARTH_H;
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
        case 'earth': {
          const m = earthMask(lonOf(x), latOf(y));
          e = m + nC.fbm(nx * 2.4, ny * 2.4, 5) * 0.24 + (e - 0.5) * 0.18;
          landRatio = -1;
          break;
        }
      }
      if (!earth) e = e * (0.35 + 0.65 * edgeF);
      elev[i] = e;
    }
  }

  // Sea level by percentile
  let sea = 2;
  if (earth) sea = 0.5;
  else if (landRatio > 0) {
    const sorted = Array.from(elev).sort((a, b) => a - b);
    sea = sorted[Math.floor((1 - landRatio) * (n - 1))];
  }
  let maxE = 0;
  for (let i = 0; i < n; i++) if (elev[i] > maxE) maxE = elev[i];

  const mountainBoost = o.type === 'highlands' ? 1.25 : 1;
  for (let y = 0; y < h; y++) {
    const realLat = earth ? latOf(y) : 0;
    const lat = earth ? Math.min(1, Math.abs(realLat) / 78) : Math.abs(y / (h - 1) - 0.5) * 2;
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const nx = x * scale, ny = y * scale;
      const e = elev[i];
      let moist = nM.fbm(nx * 1.3, ny * 1.3, 4) * 0.5 + 0.5;
      let hl = (e - sea) / Math.max(0.0001, maxE - sea);
      if (earth) {
        // subtropical desert belts, wet tropics
        const al = Math.abs(realLat);
        if (al > 14 && al < 34) moist -= 0.32 * (1 - Math.abs(al - 24) / 10);
        if (al < 10) moist += 0.18;
        if (hl > 0) {
          // jitter the range lines so mountains look natural, peaks only along the crest
          const jx = nT.noise(nx * 3, ny * 3) * 2.2, jy = nT.noise(nx * 3 + 40, ny * 3 - 17) * 2.2;
          const rb = rangeBoost(lonOf(x) + jx, realLat + jy);
          const rough = nR.ridge(nx * 2.6 + 9, ny * 2.6 - 3);
          hl = Math.min(0.45, hl * 0.6) + rb * (0.25 + rough * 0.3) + Math.max(0, rough - 0.72) * 0.45;
        }
      } else if (hl > 0) {
        const r = nR.ridge(nx * 1.4 + 9, ny * 1.4 - 3);
        hl = hl * 0.75 + Math.max(0, r - 0.55) * 0.9 * mountainBoost;
      }
      const temp = 1 - lat * 1.12 + nT.fbm(nx, ny, 3) * (earth ? 0.15 : 0.25) - (earth ? Math.max(0, hl - 0.45) * 0.7 : Math.max(0, hl) * 0.45);
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

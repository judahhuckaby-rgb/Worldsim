// Visual traffic: carts, cars, trucks, buses and hovercars on roads; steam, diesel and maglev
// trains on railways. Only simulated around the visible area, so it costs nothing elsewhere.
import type { Game } from '../sim/game';
import { T, isRoad } from '../sim/terrain';
import { TECH_BY_ID } from '../sim/tech';

const enum V { CART, CAR, TRUCK, BUS, HOVER, STEAM, DIESEL, MAGLEV }

interface Vehicle {
  kind: V;
  x: number; y: number;      // position (tile coords, tile centers at .5)
  tx: number; ty: number;    // next tile center
  dx: number; dy: number;    // direction (4-way)
  speed: number;             // tiles per second
  life: number;
  color: string;
  wagons: number;
  trail: number[];           // recent positions for train wagons
}

const CAR_COLORS = ['#d33b3b', '#2f6fd6', '#f2f2f2', '#222428', '#e8c43a', '#3aa760', '#8e8e96', '#e07b2e', '#6b4bc8'];
const WAGON_COLORS = ['#7a4a2e', '#5d6168', '#9a2f2f', '#2f5f8a', '#4f7a3a'];

export class Traffic {
  list: Vehicle[] = [];
  private spawnAcc = 0;
  // road tiles inside the view, rescanned now and then so spawning never misses
  private roads = new Int32Array(0);
  private nRoads = 0;
  private nRails = 0;
  private scanT = 0;
  private scanKey = '';

  reset(): void {
    this.list = [];
    this.scanKey = '';
  }

  private scan(g: Game, x0: number, y0: number, x1: number, y1: number): void {
    const w = g.world;
    const ax = Math.max(0, Math.floor(x0)), bx = Math.min(w.w - 1, Math.ceil(x1));
    const ay = Math.max(0, Math.floor(y0)), by = Math.min(w.h - 1, Math.ceil(y1));
    const cap = 60000;
    if (this.roads.length < cap) this.roads = new Int32Array(cap);
    let n = 0, rails = 0;
    // stride so huge views stay cheap; spawning only needs a representative sample
    const area = (bx - ax + 1) * (by - ay + 1);
    const step = area > 400000 ? 2 : 1;
    for (let y = ay; y <= by; y += step) {
      const row = y * w.w;
      for (let x = ax; x <= bx; x += step) {
        const t = w.ter[row + x];
        if (t === T.ROAD || t === T.PAVED || t === T.HIGHWAY || t === T.RAIL) {
          if (n < cap) this.roads[n++] = row + x;
          if (t === T.RAIL) rails++;
        }
      }
    }
    this.nRoads = n;
    this.nRails = rails;
  }

  private isRail(t: number): boolean { return t === T.RAIL; }
  private isStreet(t: number): boolean { return isRoad(t) && t !== T.RAIL; }

  update(g: Game, dt: number, simSpeed: number, x0: number, y0: number, x1: number, y1: number, zoom: number): void {
    const w = g.world;
    const live = this.list;
    if (zoom < 2.6) { if (live.length) live.length = 0; return; }
    const mult = simSpeed <= 0 ? 0 : Math.min(3, 0.7 + Math.sqrt(simSpeed) * 0.5);
    // move
    let j = 0;
    for (let k = 0; k < live.length; k++) {
      const v = live[k];
      v.life -= dt;
      if (v.life <= 0 || v.x < x0 - 12 || v.x > x1 + 12 || v.y < y0 - 12 || v.y > y1 + 12) continue;
      if (mult > 0) this.move(g, v, v.speed * mult * dt * (g.world.ter[Math.floor(v.y) * w.w + Math.floor(v.x)] === T.HIGHWAY ? 1.7 : 1));
      live[j++] = v;
    }
    live.length = j;
    // rescan the visible road network when the view moves or every couple of seconds
    this.scanT -= dt;
    const key = `${Math.round(x0 / 8)},${Math.round(y0 / 8)},${Math.round(x1 / 8)},${Math.round(y1 / 8)}`;
    if (key !== this.scanKey || this.scanT <= 0) { this.scanKey = key; this.scanT = 2; this.scan(g, x0, y0, x1, y1); }
    if (this.nRoads === 0) return;
    // density follows the size of the network in view
    const targetCars = Math.min(700, 10 + this.nRoads / 7);
    const maxTrains = Math.min(24, 2 + Math.floor(this.nRails / 120));
    this.spawnAcc += dt;
    if (this.spawnAcc < 0.04) return;
    this.spawnAcc = 0;
    let trains = 0;
    for (const v of live) if (v.kind >= V.STEAM) trains++;
    const need = targetCars + trains - live.length;
    const tries = Math.min(80, Math.max(6, need));
    for (let n = 0; n < tries && live.length < targetCars + trains; n++) {
      const i = this.roads[Math.floor(Math.random() * this.nRoads)];
      const t = w.ter[i];
      if (!isRoad(t)) continue;
      const tx = i % w.w, ty = (i / w.w) | 0;
      const o = w.owner[i];
      const city = o ? g.cityById.get(o) : null;
      // countryside roads take the traffic of the age
      const era = city ? city.kingdom.era : g.worldEra;
      const roads = city ? city.kingdom.caps.roads : t === T.ROAD ? (g.worldEra >= 6 ? 2 : 1) : 2;
      if (t === T.RAIL) {
        if (trains >= maxTrains || era < 5) continue;
        const kind = era >= 8 ? V.MAGLEV : era >= 6 ? V.DIESEL : V.STEAM;
        if (this.spawn(g, tx, ty, kind)) trains++;
      } else {
        if (roads < 1) continue;
        let kind: V;
        if (era >= 9) { const r = Math.random(); kind = r < 0.7 ? V.HOVER : r < 0.85 ? V.BUS : V.TRUCK; }
        else if (roads >= 2 && era >= 6) { const r = Math.random(); kind = r < 0.7 ? V.CAR : r < 0.9 ? V.TRUCK : V.BUS; }
        else if (roads >= 2) { const r = Math.random(); kind = r < 0.45 ? V.CART : r < 0.85 ? V.CAR : V.TRUCK; }
        else { if (Math.random() < 0.4) continue; kind = V.CART; }
        this.spawn(g, tx, ty, kind);
      }
    }
  }

  private spawn(g: Game, tx: number, ty: number, kind: V): boolean {
    const w = g.world;
    const rail = kind >= V.STEAM;
    const dirs = this.options(g, tx, ty, 0, 0, rail);
    if (!dirs.length) return false;
    const [dx, dy] = dirs[Math.floor(Math.random() * dirs.length)];
    const speed = kind === V.CART ? 0.55 : kind === V.CAR ? 2.1 : kind === V.TRUCK ? 1.5 : kind === V.BUS ? 1.3 : kind === V.HOVER ? 3.4 : kind === V.STEAM ? 1.8 : kind === V.DIESEL ? 2.6 : 4.2;
    const color = kind === V.BUS ? (Math.random() < 0.5 ? '#f2c230' : '#c83232') : kind === V.TRUCK ? (Math.random() < 0.5 ? '#e9e9e9' : CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)])
      : kind === V.HOVER ? '#bff4ff' : kind === V.STEAM ? '#26272b' : kind === V.DIESEL ? (Math.random() < 0.5 ? '#d23a2a' : '#e3b52c') : kind === V.MAGLEV ? '#f4f6fa' : CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)];
    this.list.push({
      kind, x: tx + 0.5, y: ty + 0.5, tx: tx + 0.5 + dx, ty: ty + 0.5 + dy, dx, dy, speed: speed * (0.85 + Math.random() * 0.3),
      life: rail ? 50 + Math.random() * 40 : 30 + Math.random() * 40, color, wagons: rail ? 4 + Math.floor(Math.random() * 7) : 0, trail: [],
    });
    void w;
    return true;
  }

  private options(g: Game, tx: number, ty: number, dx: number, dy: number, rail: boolean): number[][] {
    const w = g.world;
    const out: number[][] = [];
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const d of dirs) {
      if (d[0] === -dx && d[1] === -dy && (dx || dy)) continue;
      const nx = tx + d[0], ny = ty + d[1];
      if (!w.inb(nx, ny)) continue;
      const t = w.ter[ny * w.w + nx];
      if (rail ? this.isRail(t) : this.isStreet(t)) out.push(d);
    }
    return out;
  }

  private move(g: Game, v: Vehicle, step: number): void {
    let guard = 0;
    while (step > 0 && guard++ < 8) {
      const ddx = v.tx - v.x, ddy = v.ty - v.y;
      const d = Math.abs(ddx) + Math.abs(ddy);
      if (d > step) {
        v.x += Math.sign(ddx) * Math.min(step, Math.abs(ddx));
        v.y += Math.sign(ddy) * Math.min(step, Math.abs(ddy));
        step = 0;
      } else {
        v.x = v.tx;
        v.y = v.ty;
        step -= d;
        const cx = Math.floor(v.x), cy = Math.floor(v.y);
        const rail = v.kind >= V.STEAM;
        const opts = this.options(g, cx, cy, v.dx, v.dy, rail);
        let next: number[] | undefined;
        if (!opts.length) next = [-v.dx, -v.dy]; // dead end: turn around
        else {
          const straight = opts.find(o => o[0] === v.dx && o[1] === v.dy);
          next = straight && Math.random() < (rail ? 0.85 : 0.65) ? straight : opts[Math.floor(Math.random() * opts.length)];
        }
        const nx = cx + next[0], ny = cy + next[1];
        const ok = g.world.inb(nx, ny) && (rail ? this.isRail(g.world.ter[ny * g.world.w + nx]) : this.isStreet(g.world.ter[ny * g.world.w + nx]));
        if (!ok) { v.life = 0; return; }
        v.dx = next[0];
        v.dy = next[1];
        v.tx = nx + 0.5;
        v.ty = ny + 0.5;
      }
    }
    if (v.kind >= V.STEAM) {
      const tr = v.trail;
      const n = tr.length;
      if (n < 2 || Math.abs(tr[n - 2] - v.x) + Math.abs(tr[n - 1] - v.y) > 0.08) {
        tr.push(v.x, v.y);
        if (tr.length > 240) tr.splice(0, tr.length - 240);
      }
    }
  }

  /** Point `dist` tiles behind the locomotive along its trail. */
  private behind(v: Vehicle, dist: number): number[] {
    const tr = v.trail;
    let px = v.x, py = v.y, acc = 0;
    for (let k = tr.length - 2; k >= 0; k -= 2) {
      const qx = tr[k], qy = tr[k + 1];
      const seg = Math.abs(qx - px) + Math.abs(qy - py);
      if (acc + seg >= dist) {
        const f = seg > 0 ? (dist - acc) / seg : 0;
        return [px + (qx - px) * f, py + (qy - py) * f, Math.abs(qx - px) > Math.abs(qy - py) ? 1 : 0];
      }
      acc += seg;
      px = qx; py = qy;
    }
    return [px, py, v.dx !== 0 ? 1 : 0];
  }

  draw(ctx: CanvasRenderingContext2D, ox: number, oy: number, z: number): void {
    for (const v of this.list) {
      const horiz = v.dx !== 0;
      if (v.kind >= V.STEAM) {
        // wagons first, then the locomotive
        for (let k = v.wagons; k >= 1; k--) {
          const p = this.behind(v, k * 0.78);
          const h = p[2] === 1;
          const L = 0.72 * z, Wd = 0.34 * z;
          const col = v.kind === V.MAGLEV ? '#e6ebf2' : WAGON_COLORS[(k + v.wagons) % WAGON_COLORS.length];
          ctx.fillStyle = col;
          ctx.fillRect(ox + p[0] * z - (h ? L : Wd) / 2, oy + p[1] * z - (h ? Wd : L) / 2, h ? L : Wd, h ? Wd : L);
          if (v.kind === V.MAGLEV) { ctx.fillStyle = '#3cc7ff'; ctx.fillRect(ox + p[0] * z - (h ? L : 1) / 2, oy + p[1] * z - (h ? 1 : L) / 2, h ? L : Math.max(1, z * 0.06), h ? Math.max(1, z * 0.06) : L); }
        }
        const L = 0.8 * z, Wd = 0.38 * z;
        ctx.fillStyle = v.color;
        ctx.fillRect(ox + v.x * z - (horiz ? L : Wd) / 2, oy + v.y * z - (horiz ? Wd : L) / 2, horiz ? L : Wd, horiz ? Wd : L);
        ctx.fillStyle = v.kind === V.STEAM ? '#c23a2a' : '#1d2a3a';
        const fx = ox + (v.x + v.dx * 0.26) * z, fy = oy + (v.y + v.dy * 0.26) * z;
        ctx.fillRect(fx - Wd * 0.3, fy - Wd * 0.3, Wd * 0.6, Wd * 0.6);
        continue;
      }
      // keep right: offset to the right of travel direction
      const off = 0.22;
      const px = v.x + -v.dy * off, py = v.y + v.dx * off;
      let L = 0.56, Wd = 0.32;
      if (v.kind === V.TRUCK) { L = 0.8; Wd = 0.34; }
      else if (v.kind === V.BUS) { L = 0.9; Wd = 0.34; }
      else if (v.kind === V.CART) { L = 0.46; Wd = 0.3; }
      else if (v.kind === V.HOVER) { L = 0.58; Wd = 0.32; }
      const sw = (horiz ? L : Wd) * z, sh = (horiz ? Wd : L) * z;
      const sx = ox + px * z - sw / 2, sy = oy + py * z - sh / 2;
      if (v.kind === V.CART) {
        ctx.fillStyle = '#8a5a2b';
        ctx.fillRect(sx, sy, sw, sh);
        ctx.fillStyle = '#5a3a22';
        const hx = ox + (px + v.dx * 0.34) * z, hy = oy + (py + v.dy * 0.34) * z;
        ctx.fillRect(hx - z * 0.09, hy - z * 0.09, z * 0.18, z * 0.18);
        continue;
      }
      if (v.kind === V.HOVER) { ctx.fillStyle = 'rgba(80,220,255,0.35)'; ctx.fillRect(sx - z * 0.05, sy - z * 0.05, sw + z * 0.1, sh + z * 0.1); }
      ctx.fillStyle = v.color;
      ctx.fillRect(sx, sy, sw, sh);
      // windshield toward the front
      ctx.fillStyle = 'rgba(30,40,60,0.75)';
      const fx = ox + (px + v.dx * L * 0.22) * z, fy = oy + (py + v.dy * L * 0.22) * z;
      const ww = horiz ? z * 0.07 : sw * 0.8, wh = horiz ? sh * 0.8 : z * 0.07;
      ctx.fillRect(fx - ww / 2, fy - wh / 2, ww, wh);
    }
  }

  /** Headlights at night (drawn with additive blending by the renderer). */
  drawLights(ctx: CanvasRenderingContext2D, ox: number, oy: number, z: number, glow: HTMLCanvasElement): void {
    const s = z * 0.9;
    for (const v of this.list) {
      if (v.kind === V.CART) continue;
      const fx = ox + (v.x + v.dx * 0.45) * z, fy = oy + (v.y + v.dy * 0.45) * z;
      ctx.drawImage(glow, fx - s / 2, fy - s / 2, s, s);
    }
  }
}

// Main renderer: camera, terrain, entities, effects, weather, day/night, labels.
import type { Game, Fx } from '../sim/game';
import { P } from '../sim/game';
import { Unit, Building, City, Kingdom } from '../sim/entities';
import { UK, UDEF, ADULT_AGE, TPY, SOLDIERS, JOB } from '../sim/defs';
import { T } from '../sim/terrain';
import { TerrainTex, MapMode } from './terrainTex';
import { flagCanvas } from './flags';
import { personSprite, creatureSprite, shipSprite, planeSprite, buildingSprite, buildingExtraHeight, glowSprite, RGB } from './sprites';

export interface Camera { x: number; y: number; zoom: number; }

interface VFx {
  kind: string;
  x: number; y: number;
  x2: number; y2: number;
  r: number;
  color: string;
  t: number;
  life: number;
  vx: number; vy: number;
  text?: string;
  seed: number;
}

const ART = 4;
/** People and creatures are drawn smaller than the terrain/building pixel scale so cities read at a human scale. */
function unitScale(kind: number): number {
  switch (kind) {
    case UK.PERSON: case UK.ZOMBIE: return 0.46;
    case UK.BOAT: return 0.7;
    case UK.PLANE: return 0.62;
    case UK.DRAGON: return 0.8;
    case UK.KRAKEN: case UK.UFO: return 0.7;
    case UK.GOLEM: return 0.6;
    default: return 0.48;
  }
}

export class Renderer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  g: Game;
  tex: TerrainTex;
  cam: Camera;
  dpr = 1;
  vw = 0;
  vh = 0;
  fx: VFx[] = [];
  time = 0;
  selUnit: Unit | null = null;
  selCity: City | null = null;
  selKingdom: Kingdom | null = null;
  hover: { x: number; y: number; r: number; show: boolean; square: boolean } = { x: 0, y: 0, r: 1, show: false, square: false };
  showNames = true;
  darkness = 0;
  quality = 1;
  private drawList: (Unit | Building)[] = [];

  constructor(canvas: HTMLCanvasElement, g: Game) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.g = g;
    this.tex = new TerrainTex(g);
    this.cam = { x: g.world.w / 2, y: g.world.h / 2, zoom: 4 };
    this.resize();
    this.fitWorld();
  }

  setGame(g: Game): void {
    const mode = this.tex.mode;
    this.g = g;
    this.tex = new TerrainTex(g);
    this.tex.setMode(mode);
    this.fx = [];
    this.selUnit = null;
    this.selCity = null;
    this.selKingdom = null;
    this.fitWorld();
  }

  fitWorld(): void {
    const w = this.g.world;
    this.cam.x = w.w / 2;
    this.cam.y = w.h / 2;
    this.cam.zoom = Math.max(1, Math.min(this.vw / w.w, this.vh / w.h) * 0.98);
  }

  resize(): void {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    const r = this.canvas.getBoundingClientRect();
    this.vw = Math.max(1, Math.round(r.width * this.dpr));
    this.vh = Math.max(1, Math.round(r.height * this.dpr));
    this.canvas.width = this.vw;
    this.canvas.height = this.vh;
  }

  setMode(m: MapMode): void {
    this.tex.setMode(m);
  }

  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    const c = this.cam;
    return { x: (sx * this.dpr - this.vw / 2) / c.zoom + c.x, y: (sy * this.dpr - this.vh / 2) / c.zoom + c.y };
  }

  clampCam(): void {
    const w = this.g.world;
    const c = this.cam;
    const minZ = Math.min(this.vw / w.w, this.vh / w.h) * 0.5;
    c.zoom = Math.max(minZ, Math.min(80 * this.dpr, c.zoom));
    c.x = Math.max(0, Math.min(w.w, c.x));
    c.y = Math.max(0, Math.min(w.h, c.y));
  }

  zoomAt(sx: number, sy: number, factor: number): void {
    const before = this.screenToWorld(sx, sy);
    this.cam.zoom *= factor;
    this.clampCam();
    const after = this.screenToWorld(sx, sy);
    this.cam.x += before.x - after.x;
    this.cam.y += before.y - after.y;
    this.clampCam();
  }

  centerOn(x: number, y: number, zoom?: number): void {
    this.cam.x = x;
    this.cam.y = y;
    if (zoom) this.cam.zoom = zoom * this.dpr;
    this.clampCam();
  }

  // ------------------------------------------------------------------ effects intake
  private ingest(): void {
    const q = this.g.fx;
    for (const f of q) this.addFx(f);
    q.length = 0;
  }

  private addFx(f: Fx): void {
    const base: VFx = { kind: f.kind, x: f.x, y: f.y, x2: f.x2 ?? f.x, y2: f.y2 ?? f.y, r: f.r ?? 1, color: f.color ?? '#fff', t: 0, life: 0.5, vx: 0, vy: 0, text: f.text, seed: Math.random() };
    switch (f.kind) {
      case 'tracer': base.life = 0.12; break;
      case 'laser': base.life = 0.2; break;
      case 'explosion': base.life = 0.55 + base.r * 0.05; break;
      case 'collapse': base.life = 0.9; break;
      case 'death': base.life = 0.6; break;
      case 'nuke': base.life = 4.5; break;
      case 'fireworks': base.life = 2.5; break;
      case 'rocket': base.life = 5; break;
      case 'smoke': base.life = 2.2; base.vx = (Math.random() - 0.5) * 0.5; base.vy = -0.6; break;
      case 'steam': base.life = 1.2; base.vy = -0.8; break;
      case 'lightning': base.life = 0.35; break;
      case 'sparkle': base.life = 1; break;
      case 'text': base.life = 1.5; break;
    }
    if (this.fx.length < 1500) this.fx.push(base);
  }

  // ------------------------------------------------------------------ main draw
  render(dt: number): void {
    this.time += dt;
    this.ingest();
    this.tex.update();
    const ctx = this.ctx;
    const g = this.g;
    const c = this.cam;
    const vw = this.vw, vh = this.vh;
    let camX = c.x, camY = c.y;
    if (g.shake > 0.3) {
      camX += (Math.random() - 0.5) * g.shake * 0.15;
      camY += (Math.random() - 0.5) * g.shake * 0.15;
    }
    const z = c.zoom;
    const ox = vw / 2 - camX * z, oy = vh / 2 - camY * z;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#10284e';
    ctx.fillRect(0, 0, vw, vh);
    this.tex.draw(ctx, camX, camY, z, vw, vh);

    const vx0 = camX - vw / 2 / z - 2, vx1 = camX + vw / 2 / z + 2;
    const vy0 = camY - vh / 2 / z - 2, vy1 = camY + vh / 2 / z + 6;
    const art = z / ART;

    this.drawTileAnims(ctx, ox, oy, z, vx0, vx1, vy0, vy1);

    // ---- entities (depth sorted)
    const list = this.drawList;
    list.length = 0;
    for (const b of g.buildings) {
      if (b.dead) continue;
      if (b.x + b.w < vx0 || b.x > vx1 || b.y + b.h < vy0 || b.y - 8 > vy1) continue;
      list.push(b);
    }
    const flyers: Unit[] = [];
    for (const u of g.units) {
      if (u.dead || u.inBoat) continue;
      if (u.x < vx0 || u.x > vx1 || u.y < vy0 || u.y > vy1 + 4) continue;
      if (UDEF[u.kind].flying) flyers.push(u);
      else list.push(u);
    }
    list.sort((a, b) => sortY(a) - sortY(b));
    const tiny = z < 4.2 * this.dpr;
    for (const e of list) {
      if (e instanceof Building) this.drawBuilding(ctx, e, ox, oy, z, art);
      else if (tiny) this.drawDot(ctx, e, ox, oy, z);
      else this.drawUnit(ctx, e, ox, oy, z, art);
    }
    // shadows + flyers
    for (const u of flyers) {
      const sx = ox + u.x * z, sy = oy + u.y * z;
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.ellipse(sx, sy, Math.max(2, art * 3), Math.max(1, art * 1.2), 0, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const u of flyers) {
      if (tiny) this.drawDot(ctx, u, ox, oy - 2 * art * 4, z);
      else this.drawUnit(ctx, u, ox, oy - 7 * art, z, art);
    }

    this.drawProjectiles(ctx, ox, oy, z, art);
    this.drawDisasters(ctx, ox, oy, z, art);
    this.drawFx(ctx, ox, oy, z, art, dt);

    // ---- day/night
    const dayLen = 150;
    const phase = (this.time % dayLen) / dayLen;
    const dark = g.laws.dayNight ? Math.max(0, Math.cos(phase * Math.PI * 2) * -1) : 0;
    this.darkness = dark * 0.62;
    if (this.darkness > 0.02) this.drawNight(ctx, ox, oy, z, art, vx0, vx1, vy0, vy1);

    if (this.showNames) this.drawLabels(ctx, ox, oy, z);
    this.drawSelection(ctx, ox, oy, z, art);
    this.drawCursor(ctx, ox, oy, z);

    if (g.flash > 0.01) {
      ctx.fillStyle = `rgba(255,255,240,${Math.min(1, g.flash)})`;
      ctx.fillRect(0, 0, vw, vh);
      g.flash *= Math.pow(0.25, dt);
    }
  }

  private drawTileAnims(ctx: CanvasRenderingContext2D, ox: number, oy: number, z: number, vx0: number, vx1: number, vy0: number, vy1: number): void {
    const w = this.g.world;
    const t = this.time;
    // fire
    for (const i of w.burning) {
      if (!w.fire[i]) continue;
      const x = i % w.w, y = (i / w.w) | 0;
      if (x < vx0 || x > vx1 || y < vy0 || y > vy1) continue;
      const fl = Math.sin(t * 18 + i) * 0.5 + 0.5;
      const sx = ox + x * z, sy = oy + y * z;
      ctx.fillStyle = fl > 0.5 ? '#ffb02e' : '#ff6a1a';
      ctx.fillRect(sx + z * 0.15, sy + z * (0.1 - fl * 0.25), z * 0.7, z * (0.9 + fl * 0.25));
      ctx.fillStyle = '#ffe680';
      ctx.fillRect(sx + z * 0.35, sy + z * 0.45, z * 0.3, z * 0.4);
    }
    // lava shimmer
    if (w.lavaList.length) {
      ctx.globalAlpha = 0.35 + Math.sin(t * 3) * 0.15;
      ctx.fillStyle = '#ffd040';
      for (const i of w.lavaList) {
        const x = i % w.w, y = (i / w.w) | 0;
        if (x < vx0 || x > vx1 || y < vy0 || y > vy1) continue;
        if (((x * 7 + y * 3 + Math.floor(t * 4)) % 5) === 0) ctx.fillRect(ox + x * z, oy + y * z, z, z);
      }
      ctx.globalAlpha = 1;
    }
  }

  private drawDot(ctx: CanvasRenderingContext2D, u: Unit, ox: number, oy: number, z: number): void {
    const s = Math.max(1, z * (u.kind === UK.PERSON ? 0.45 : 0.6));
    ctx.fillStyle = u.kingdom ? u.kingdom.css : UDEF[u.kind].monster ? '#f33' : UDEF[u.kind].pred ? '#777' : '#eee';
    ctx.fillRect(ox + u.x * z - s / 2, oy + u.y * z - s, s, s);
  }

  private drawUnit(ctx: CanvasRenderingContext2D, u: Unit, ox: number, oy: number, z: number, art: number): void {
    const frame = u.moving ? ((this.time * 6 + u.id) | 0) & 1 : 0;
    let img: HTMLCanvasElement;
    const kc: RGB = u.kingdom ? u.kingdom.color : [140, 110, 80];
    let scale = 1;
    switch (u.kind) {
      case UK.PERSON: {
        const child = u.ageT < ADULT_AGE * TPY;
        img = personSprite({ species: u.species, color: kc, sclass: u.sclass, tool: u.phase === 2 ? u.job : 0, frame, king: u.isKing, child, zombie: false });
        if (child) scale = 0.65;
        break;
      }
      case UK.BOAT: img = shipSprite(u.vclass, kc, ((this.time * 2 + u.id) | 0) & 1); break;
      case UK.PLANE: img = planeSprite(u.vclass, kc, ((this.time * 8) | 0) & 1); break;
      case UK.DRAGON: img = creatureSprite(u.kind, ((this.time * 3 + u.id) | 0) & 1); break;
      default: img = creatureSprite(u.kind, frame);
    }
    const us = unitScale(u.kind);
    scale *= us;
    art *= us;
    const w = img.width * art * scale / us, h = img.height * art * scale / us;
    const sx = ox + u.x * z, sy = oy + u.y * z;
    let dx = sx - w / 2, dy = sy - h + art;
    if (u.anim > 3 && u.tUnit) dx += u.facing * art;
    if (u.facing < 0) {
      ctx.save();
      ctx.translate(sx, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(img, -w / 2, dy, w, h);
      ctx.restore();
    } else ctx.drawImage(img, dx, dy, w, h);
    if (u.hitFlash > 0) {
      ctx.fillStyle = 'rgba(255,60,60,0.5)';
      ctx.fillRect(sx - w / 4, dy + h * 0.2, w / 2, h * 0.6);
    }
    if (u.carry >= 0 && u.kind === UK.PERSON) {
      ctx.fillStyle = u.carry === 100 ? '#e9c84a' : ['#8a5a2b', '#9a9a9a', '#b6b6c8', '#ffd84a', '#222', '#111', '#7f7'][u.carry] || '#fff';
      ctx.fillRect(sx - art * 1.5, dy - art * 1.2, art * 3, art * 2);
    }
    if (u.plague > 0) {
      ctx.fillStyle = 'rgba(140,220,90,0.8)';
      ctx.fillRect(sx + art * 2, dy - art, art, art);
    }
    if (u.blessT > 0 || u.curseT > 0 || u.madT > 0) {
      ctx.fillStyle = u.blessT > 0 ? '#ffe680' : u.madT > 0 ? '#ff4040' : '#a050ff';
      ctx.fillRect(sx - art * 0.5, dy - art * 2.5, art, art);
    }
    // health bar for wounded fighters / monsters
    if ((u.hp < u.maxHp && (u.tUnit || u.tBld)) || (UDEF[u.kind].monster && u.hp < u.maxHp)) {
      const bw = Math.max(art * 6, w * 0.6);
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(sx - bw / 2, dy - art * 2, bw, Math.max(1, art * 0.8));
      ctx.fillStyle = u.hp / u.maxHp > 0.5 ? '#6f6' : '#f84';
      ctx.fillRect(sx - bw / 2, dy - art * 2, bw * Math.max(0, u.hp / u.maxHp), Math.max(1, art * 0.8));
    }
  }

  private drawBuilding(ctx: CanvasRenderingContext2D, b: Building, ox: number, oy: number, z: number, art: number): void {
    const k = b.city.kingdom;
    const img = buildingSprite({ type: b.type, style: b.style, color: k.color, species: k.species, w: b.w, h: b.h, progress: b.progress, variant: b.id });
    const w = img.width * art, h = img.height * art;
    const sx = ox + b.x * z, sy = oy + (b.y + b.h) * z;
    ctx.drawImage(img, sx, sy - h, w, h);
    if (b.hp < b.maxHp * 0.98 && b.progress >= 1) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(sx, sy - h - art * 2, w, Math.max(1, art));
      ctx.fillStyle = b.hp / b.maxHp > 0.5 ? '#6f6' : '#f84';
      ctx.fillRect(sx, sy - h - art * 2, w * Math.max(0, b.hp / b.maxHp), Math.max(1, art));
    }
    // ambient smoke from industry and chimneys
    if (this.quality > 0 && b.progress >= 1 && Math.random() < 0.025) {
      if (b.type === 'factory' || (b.type === 'power' && b.style < 8 && k.caps.pollution > 0.2)) this.addFx({ kind: 'smoke', x: b.x + b.w * 0.75, y: b.y + b.h - (img.height - 2) / ART, r: 1.2, color: '#555' });
      else if (b.type === 'forge' || (b.type === 'house' && b.style === 5 && Math.random() < 0.3)) this.addFx({ kind: 'smoke', x: b.x + b.w * 0.8, y: b.y + b.h - (img.height) / ART, r: 0.6, color: '#999' });
      else if (b.type === 'power' && b.style === 7) this.addFx({ kind: 'smoke', x: b.cx, y: b.y + b.h - img.height / ART, r: 1.4, color: '#eee' });
    }
  }

  private drawProjectiles(ctx: CanvasRenderingContext2D, ox: number, oy: number, z: number, art: number): void {
    for (const p of this.g.projectiles) {
      const sx = ox + p.x * z, sy = oy + p.y * z - p.z * z;
      switch (p.kind) {
        case P.ARROW: {
          const dx = (p.tx - p.sx), dy = (p.ty - p.sy);
          const d = Math.sqrt(dx * dx + dy * dy) || 1;
          ctx.strokeStyle = '#e8dcc0';
          ctx.lineWidth = Math.max(1, art * 0.6);
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(sx - (dx / d) * art * 3, sy - (dy / d) * art * 3);
          ctx.stroke();
          break;
        }
        case P.SHELL: case P.BOMB:
          ctx.fillStyle = '#222';
          ctx.fillRect(sx - art, sy - art, art * 2, art * 2);
          break;
        case P.FIREBALL:
          ctx.fillStyle = '#ff7a1a';
          ctx.beginPath(); ctx.arc(sx, sy, Math.max(2, art * 2), 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#ffe080';
          ctx.beginPath(); ctx.arc(sx, sy, Math.max(1, art), 0, Math.PI * 2); ctx.fill();
          break;
        case P.MISSILE: {
          ctx.fillStyle = '#eee';
          ctx.fillRect(sx - art, sy - art * 3, art * 2, art * 6);
          ctx.fillStyle = '#ff5';
          ctx.fillRect(sx - art * 0.5, sy + art * 3, art, art * 3);
          if (Math.random() < 0.6) this.addFx({ kind: 'smoke', x: p.x, y: p.y - p.z, r: 0.8, color: '#ccc' });
          break;
        }
        case P.METEOR: {
          const tail = 6;
          ctx.strokeStyle = 'rgba(255,180,80,0.7)';
          ctx.lineWidth = Math.max(2, art * 3);
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(sx - (p.tx - p.sx) * 0.08 * z * tail / 6, sy - (p.ty - p.sy) * 0.08 * z * tail / 6);
          ctx.stroke();
          ctx.fillStyle = '#ffd';
          ctx.beginPath(); ctx.arc(sx, sy, Math.max(3, art * 3), 0, Math.PI * 2); ctx.fill();
          break;
        }
      }
    }
  }

  private drawDisasters(ctx: CanvasRenderingContext2D, ox: number, oy: number, z: number, art: number): void {
    for (const d of this.g.disasters) {
      const sx = ox + d.x * z, sy = oy + d.y * z;
      switch (d.kind) {
        case 'tornado': {
          const hgt = 14 * z;
          for (let i = 0; i < 16; i++) {
            const f = i / 16;
            const wob = Math.sin(this.time * 9 + i * 0.7) * z * 0.6 * (1 - f);
            const rw = z * (0.4 + f * 2.4);
            ctx.fillStyle = `rgba(${150 + i * 4},${150 + i * 4},${160 + i * 4},${0.55 - f * 0.25})`;
            ctx.fillRect(sx - rw / 2 + wob, sy - f * hgt, rw, hgt / 16 + 1);
          }
          break;
        }
        case 'rain': case 'acid': case 'blizzard': case 'drought': {
          const r = d.r * z;
          if (d.kind !== 'drought') {
            ctx.fillStyle = d.kind === 'blizzard' ? 'rgba(220,230,240,0.35)' : d.kind === 'acid' ? 'rgba(120,160,60,0.35)' : 'rgba(80,90,110,0.35)';
            ctx.beginPath(); ctx.ellipse(sx, sy - z * 6, r, r * 0.35, 0, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = d.kind === 'blizzard' ? 'rgba(255,255,255,0.8)' : d.kind === 'acid' ? 'rgba(170,230,80,0.6)' : 'rgba(170,200,255,0.6)';
            ctx.fillStyle = 'rgba(255,255,255,0.85)';
            ctx.lineWidth = Math.max(1, art * 0.5);
            ctx.beginPath();
            for (let i = 0; i < 40; i++) {
              const rx = (Math.sin(i * 12.9898 + d.a) * 0.5 + 0.5) * 2 - 1;
              const fall = ((this.time * (d.kind === 'blizzard' ? 0.6 : 1.8) + i * 0.137) % 1);
              const px = sx + rx * r;
              const py = sy - z * 6 + fall * z * 8;
              if (d.kind === 'blizzard') ctx.fillRect(px, py, art, art);
              else { ctx.moveTo(px, py); ctx.lineTo(px - art, py + art * 3); }
            }
            ctx.stroke();
          } else {
            ctx.fillStyle = `rgba(255,190,90,${0.12 + Math.sin(this.time * 2) * 0.04})`;
            ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill();
          }
          break;
        }
        case 'earthquake': {
          ctx.strokeStyle = 'rgba(80,50,30,0.5)';
          ctx.lineWidth = Math.max(1, art);
          ctx.beginPath();
          ctx.moveTo(sx - Math.cos(d.a) * d.r * z, sy - Math.sin(d.a) * d.r * z);
          ctx.lineTo(sx + Math.cos(d.a) * d.r * z, sy + Math.sin(d.a) * d.r * z);
          ctx.stroke();
          break;
        }
        case 'volcano': {
          if (Math.random() < 0.3) this.addFx({ kind: 'smoke', x: d.x + (Math.random() - 0.5), y: d.y - 1, r: 2, color: '#444' });
          break;
        }
      }
    }
  }

  private drawFx(ctx: CanvasRenderingContext2D, ox: number, oy: number, z: number, art: number, dt: number): void {
    const fx = this.fx;
    let j = 0;
    for (let i = 0; i < fx.length; i++) {
      const f = fx[i];
      f.t += dt;
      if (f.t >= f.life) continue;
      fx[j++] = f;
      const k = f.t / f.life;
      const sx = ox + f.x * z, sy = oy + f.y * z;
      switch (f.kind) {
        case 'tracer':
          ctx.strokeStyle = `rgba(255,240,170,${1 - k})`;
          ctx.lineWidth = Math.max(1, art * 0.5);
          ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ox + f.x2 * z, oy + f.y2 * z); ctx.stroke();
          break;
        case 'laser':
          ctx.strokeStyle = f.color;
          ctx.globalAlpha = 1 - k;
          ctx.lineWidth = Math.max(1.5, art * 1.2);
          ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ox + f.x2 * z, oy + f.y2 * z); ctx.stroke();
          ctx.globalAlpha = 1;
          break;
        case 'explosion': {
          const r = f.r * z * (0.4 + k * 0.9);
          ctx.fillStyle = `rgba(255,${200 - k * 150},${80 - k * 60},${0.85 * (1 - k)})`;
          ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = `rgba(255,255,220,${0.9 * (1 - k * 2)})`;
          if (k < 0.5) { ctx.beginPath(); ctx.arc(sx, sy, r * 0.5, 0, Math.PI * 2); ctx.fill(); }
          break;
        }
        case 'collapse':
          ctx.fillStyle = `rgba(140,120,100,${0.7 * (1 - k)})`;
          for (let q = 0; q < 6; q++) {
            const a = q + f.seed * 6;
            ctx.fillRect(sx + Math.cos(a) * f.r * z * k * 1.5, sy + Math.sin(a) * f.r * z * k - k * z, art * 3, art * 3);
          }
          break;
        case 'death':
          ctx.fillStyle = f.color;
          ctx.globalAlpha = 1 - k;
          for (let q = 0; q < 4; q++) ctx.fillRect(sx + (q - 1.5) * art * k * 3, sy - art * 3 - k * art * 4 + (q % 2) * art, art, art);
          ctx.globalAlpha = 1;
          break;
        case 'smoke': case 'steam': {
          f.x += f.vx * dt;
          f.y += f.vy * dt;
          const r = f.r * z * (0.4 + k);
          ctx.fillStyle = f.kind === 'steam' ? `rgba(240,240,250,${0.5 * (1 - k)})` : hexA(f.color, 0.45 * (1 - k));
          ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill();
          break;
        }
        case 'nuke': {
          const r = f.r * z;
          const ring = Math.min(1, k * 3);
          ctx.fillStyle = `rgba(255,${230 - k * 150},${120 - k * 100},${0.6 * (1 - k)})`;
          ctx.beginPath(); ctx.arc(sx, sy, r * (0.4 + ring), 0, Math.PI * 2); ctx.fill();
          // mushroom cloud
          const rise = Math.min(1, k * 2);
          const capY = sy - r * 1.6 * rise;
          ctx.fillStyle = `rgba(120,90,70,${0.8 * (1 - k * 0.8)})`;
          ctx.fillRect(sx - r * 0.18, capY, r * 0.36, sy - capY);
          ctx.fillStyle = `rgba(200,120,60,${0.9 * (1 - k * 0.7)})`;
          ctx.beginPath(); ctx.ellipse(sx, capY, r * (0.5 + rise * 0.4), r * (0.3 + rise * 0.2), 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = `rgba(255,220,120,${0.7 * (1 - k)})`;
          ctx.beginPath(); ctx.ellipse(sx, capY + r * 0.05, r * 0.3, r * 0.15, 0, 0, Math.PI * 2); ctx.fill();
          break;
        }
        case 'fireworks': {
          for (let q = 0; q < 5; q++) {
            const kk = (k * 2.5 + q * 0.2) % 1;
            const cx = sx + Math.sin(f.seed * 50 + q * 2.3) * z * 4, cy = sy - z * (2 + q % 3) ;
            const cols = ['#ffd84a', '#ff5d8f', '#6cf', f.color, '#9f6'];
            ctx.fillStyle = cols[q % cols.length];
            for (let s = 0; s < 8; s++) {
              const a = (s / 8) * Math.PI * 2;
              ctx.fillRect(cx + Math.cos(a) * kk * z * 2, cy + Math.sin(a) * kk * z * 2 + kk * kk * z, art, art);
            }
          }
          break;
        }
        case 'rocket': {
          const alt = k * k * 60;
          const ry = sy - alt * z;
          ctx.fillStyle = '#eee';
          ctx.fillRect(sx - art, ry - art * 6, art * 2, art * 6);
          ctx.fillStyle = '#e33';
          ctx.fillRect(sx - art, ry - art * 7, art * 2, art);
          ctx.fillStyle = Math.random() < 0.5 ? '#ffb02e' : '#fff3a0';
          ctx.fillRect(sx - art, ry, art * 2, art * (3 + Math.random() * 3));
          if (Math.random() < 0.8) this.addFx({ kind: 'smoke', x: f.x + (Math.random() - 0.5) * 0.5, y: f.y - alt, r: 1, color: '#ddd' });
          break;
        }
        case 'lightning': {
          ctx.strokeStyle = `rgba(230,240,255,${1 - k})`;
          ctx.lineWidth = Math.max(2, art * 1.2);
          ctx.beginPath();
          let px = sx, py = sy - z * 30;
          ctx.moveTo(px, py);
          for (let s = 0; s < 8; s++) {
            px = sx + Math.sin(f.seed * 99 + s * 3.1) * z * 1.5;
            py += z * 30 / 8;
            ctx.lineTo(px, py);
          }
          ctx.lineTo(sx, sy);
          ctx.stroke();
          if (k < 0.3) { ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(0, 0, this.vw, this.vh); }
          break;
        }
        case 'sparkle': {
          ctx.fillStyle = f.color;
          for (let s = 0; s < 6; s++) {
            const a = s + f.seed * 10;
            ctx.globalAlpha = 1 - k;
            ctx.fillRect(sx + Math.cos(a) * z * f.r * k, sy + Math.sin(a) * z * f.r * k - k * z * 2, art * 1.5, art * 1.5);
          }
          ctx.globalAlpha = 1;
          break;
        }
        case 'text': {
          ctx.font = `bold ${Math.round(12 * this.dpr)}px system-ui, sans-serif`;
          ctx.fillStyle = `rgba(255,255,255,${1 - k})`;
          ctx.textAlign = 'center';
          ctx.fillText(f.text || '', sx, sy - k * z * 3);
          break;
        }
      }
    }
    fx.length = j;
  }

  private drawNight(ctx: CanvasRenderingContext2D, ox: number, oy: number, z: number, art: number, vx0: number, vx1: number, vy0: number, vy1: number): void {
    const d = this.darkness;
    ctx.fillStyle = `rgba(8,12,40,${d})`;
    ctx.fillRect(0, 0, this.vw, this.vh);
    ctx.globalCompositeOperation = 'lighter';
    const warm = glowSprite('rgba(255,190,90,0.9)');
    const cool = glowSprite('rgba(255,236,170,0.9)');
    const neon = glowSprite('rgba(120,230,255,0.9)');
    const fireG = glowSprite('rgba(255,120,40,0.9)');
    ctx.globalAlpha = Math.min(1, d * 1.4);
    for (const b of this.g.buildings) {
      if (b.dead || b.progress < 1) continue;
      if (b.x + b.w < vx0 || b.x > vx1 || b.y + b.h < vy0 || b.y - 6 > vy1) continue;
      const k = b.city.kingdom;
      const lights = k.caps.lights;
      if (lights === 0) continue;
      if (lights === 1 && b.type !== 'center' && b.type !== 'castle' && b.type !== 'temple' && (b.id % 3 !== 0)) continue;
      const img = lights >= 2 ? (b.style >= 9 ? neon : cool) : warm;
      const hgt = (buildingExtraHeight(b.type, b.style, b.type === 'house' && b.style >= 6 ? b.id % 3 : 0) + b.h * 4) / ART;
      const size = (Math.max(b.w, b.h) * 1.6 + (lights >= 2 ? hgt * 0.35 : 0)) * z;
      const flick = lights === 1 ? 0.8 + Math.sin(this.time * 7 + b.id) * 0.2 : 1;
      ctx.globalAlpha = Math.min(1, d * 1.4) * flick * (lights === 1 ? 0.7 : 0.55);
      ctx.drawImage(img, ox + b.cx * z - size / 2, oy + (b.y + b.h - hgt * 0.45) * z - size / 2, size, size);
    }
    const w = this.g.world;
    ctx.globalAlpha = Math.min(1, d * 1.5) * 0.8;
    for (const i of w.burning) {
      if (!w.fire[i]) continue;
      const x = i % w.w, y = (i / w.w) | 0;
      if (x < vx0 || x > vx1 || y < vy0 || y > vy1) continue;
      ctx.drawImage(fireG, ox + (x + 0.5) * z - z * 1.5, oy + (y + 0.5) * z - z * 1.5, z * 3, z * 3);
    }
    for (const i of w.lavaList) {
      const x = i % w.w, y = (i / w.w) | 0;
      if (x < vx0 || x > vx1 || y < vy0 || y > vy1) continue;
      ctx.drawImage(fireG, ox + (x + 0.5) * z - z, oy + (y + 0.5) * z - z, z * 2, z * 2);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    void art;
  }

  private drawLabels(ctx: CanvasRenderingContext2D, ox: number, oy: number, z: number): void {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const seed = this.g.seed;
    if (z < 3.2 * this.dpr) {
      // zoomed out: label nations like a world map
      for (const k of this.g.kingdoms) {
        let sx = 0, sy = 0, wsum = 0;
        for (const c of k.cities) { const wgt = c.members.length + 1; sx += c.x * wgt; sy += c.y * wgt; wsum += wgt; }
        if (!wsum) continue;
        sx = ox + (sx / wsum) * z;
        sy = oy + (sy / wsum) * z;
        if (sx < -200 || sx > this.vw + 200 || sy < -40 || sy > this.vh + 40) continue;
        const fs = Math.round(Math.max(10, Math.min(18, 8 + Math.sqrt(k.pop) * 0.35)) * this.dpr);
        ctx.font = `800 ${fs}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
        const label = this.g.kName(k);
        const fw = fs * 1.35, fh = fs * 0.9;
        const tw = ctx.measureText(label).width;
        ctx.fillStyle = 'rgba(10,14,24,0.55)';
        roundRect(ctx, sx - tw / 2 - fw - fs * 0.6, sy - fs * 0.75, tw + fw + fs * 1.1, fs * 1.5, fs * 0.4);
        ctx.fill();
        ctx.drawImage(flagCanvas(k, seed), sx - tw / 2 - fw - fs * 0.3, sy - fh / 2, fw, fh);
        ctx.fillStyle = '#fff';
        ctx.fillText(label, sx + fs * 0.05, sy + 1);
      }
      return;
    }
    const fs = Math.round(Math.max(10, Math.min(15, z * 1.2)) * this.dpr * 0.9);
    ctx.font = `700 ${fs}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
    for (const c of this.g.cities) {
      const sx = ox + c.x * z;
      const sy = oy + (c.y - 3.2) * z - 26 * this.dpr * Math.min(1, z / 10);
      if (sx < -100 || sx > this.vw + 100 || sy < -40 || sy > this.vh + 40) continue;
      const cap = c.kingdom.capital === c;
      const label = `${cap ? '★ ' : ''}${c.name} ${c.members.length}`;
      const fw = fs * 1.2, fh = fs * 0.8;
      const tw = ctx.measureText(label).width + fw + fs * 0.9;
      ctx.fillStyle = 'rgba(10,14,24,0.72)';
      roundRect(ctx, sx - tw / 2, sy - fs * 0.75, tw, fs * 1.5, fs * 0.4);
      ctx.fill();
      ctx.drawImage(flagCanvas(c.kingdom, seed), sx - tw / 2 + fs * 0.3, sy - fh / 2, fw, fh);
      ctx.fillStyle = '#fff';
      ctx.fillText(label, sx + fw / 2 + fs * 0.05, sy + 1);
    }
  }

  private drawSelection(ctx: CanvasRenderingContext2D, ox: number, oy: number, z: number, art: number): void {
    const u = this.selUnit;
    if (u && !u.dead) {
      const sx = ox + u.x * z, sy = oy + u.y * z - (UDEF[u.kind].flying ? 7 * art : 0);
      const r = Math.max(5, art * 3.5);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = Math.max(1.5, this.dpr * 1.5);
      ctx.beginPath();
      ctx.ellipse(sx, sy, r, r * 0.45, 0, 0, Math.PI * 2);
      ctx.stroke();
      if (u.path && u.path.length && u.pathI < u.path.length) {
        const w = this.g.world;
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.setLineDash([4 * this.dpr, 4 * this.dpr]);
        ctx.beginPath();
        ctx.moveTo(sx, oy + u.y * z);
        for (let i = u.pathI; i < u.path.length; i++) {
          const t = u.path[i];
          ctx.lineTo(ox + ((t % w.w) + 0.5) * z, oy + (((t / w.w) | 0) + 0.5) * z);
        }
        ctx.stroke();
        ctx.setLineDash([]);
      }
    } else if (u && u.dead) this.selUnit = null;
    const c = this.selCity;
    if (c && !c.dead) {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = Math.max(1.5, this.dpr * 1.5);
      ctx.setLineDash([6 * this.dpr, 4 * this.dpr]);
      const r = Math.sqrt(c.tiles.length / Math.PI) * z;
      ctx.beginPath();
      ctx.arc(ox + c.x * z, oy + c.y * z, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  private drawCursor(ctx: CanvasRenderingContext2D, ox: number, oy: number, z: number): void {
    const h = this.hover;
    if (!h.show) return;
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = Math.max(1, this.dpr);
    if (h.square) {
      ctx.strokeRect(ox + Math.floor(h.x) * z, oy + Math.floor(h.y) * z, z, z);
    } else {
      ctx.beginPath();
      ctx.arc(ox + h.x * z, oy + h.y * z, Math.max(3, h.r * z), 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

function sortY(e: Unit | Building): number {
  return e instanceof Building ? e.y + e.h - 0.01 : e.y;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function hexA(c: string, a: number): string {
  if (c.startsWith('#') && c.length === 4) {
    const r = parseInt(c[1] + c[1], 16), g = parseInt(c[2] + c[2], 16), b = parseInt(c[3] + c[3], 16);
    return `rgba(${r},${g},${b},${a})`;
  }
  if (c.startsWith('#') && c.length === 7) {
    const r = parseInt(c.slice(1, 3), 16), g = parseInt(c.slice(3, 5), 16), b = parseInt(c.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${a})`;
  }
  return c;
}

export { T, SOLDIERS, JOB };

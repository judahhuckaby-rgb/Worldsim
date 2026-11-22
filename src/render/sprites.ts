// Procedural pixel-art sprites (all original art, generated at runtime).
import { SPECIES } from '../sim/species';
import { SOLDIERS } from '../sim/defs';

export type RGB = [number, number, number];

export function css(c: RGB, a = 1): string {
  return a >= 1 ? `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})` : `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
}
export function shade(c: RGB, f: number): RGB {
  if (f >= 1) return [Math.min(255, c[0] + (255 - c[0]) * (f - 1)), Math.min(255, c[1] + (255 - c[1]) * (f - 1)), Math.min(255, c[2] + (255 - c[2]) * (f - 1))];
  return [c[0] * f, c[1] * f, c[2] * f];
}
export function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export class Painter {
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
  constructor(ctx: CanvasRenderingContext2D, w: number, h: number) {
    this.ctx = ctx;
    this.w = w;
    this.h = h;
  }
  px(x: number, y: number, c: RGB | string): void {
    this.ctx.fillStyle = typeof c === 'string' ? c : css(c);
    this.ctx.fillRect(x, y, 1, 1);
  }
  rect(x: number, y: number, w: number, h: number, c: RGB | string): void {
    if (w <= 0 || h <= 0) return;
    this.ctx.fillStyle = typeof c === 'string' ? c : css(c);
    this.ctx.fillRect(x, y, w, h);
  }
  /** Box with simple top light / bottom shadow. */
  box(x: number, y: number, w: number, h: number, c: RGB): void {
    this.rect(x, y, w, h, c);
    this.rect(x, y, w, 1, shade(c, 1.15));
    this.rect(x, y + h - 1, w, 1, shade(c, 0.75));
    this.rect(x + w - 1, y, 1, h, shade(c, 0.85));
  }
  line(x0: number, y0: number, x1: number, y1: number, c: RGB | string): void {
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    let x = x0, y = y0;
    for (let i = 0; i < 200; i++) {
      this.px(x, y, c);
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x += sx; }
      if (e2 < dx) { err += dx; y += sy; }
    }
  }
  /** Triangle roof spanning x..x+w, apex height h above baseY. */
  roof(x: number, baseY: number, w: number, h: number, c: RGB): void {
    for (let r = 0; r < h; r++) {
      const inset = Math.round((r / h) * (w / 2));
      const yy = baseY - r;
      this.rect(x + inset, yy, w - inset * 2, 1, r === h - 1 ? shade(c, 1.2) : (r % 2 ? shade(c, 0.9) : c));
    }
  }
  windows(x: number, y: number, w: number, h: number, cols: number, rows: number, c: RGB, gapX = 1, gapY = 1): void {
    for (let r = 0; r < rows; r++) for (let q = 0; q < cols; q++) this.px(x + q * (1 + gapX), y + r * (1 + gapY), c);
    void w; void h;
  }
}

const cache = new Map<string, HTMLCanvasElement>();

export function sprite(key: string, w: number, h: number, draw: (p: Painter) => void): HTMLCanvasElement {
  let c = cache.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = Math.max(1, w);
  c.height = Math.max(1, h);
  const ctx = c.getContext('2d')!;
  draw(new Painter(ctx, w, h));
  cache.set(key, c);
  return c;
}

export function clearSpriteCache(): void {
  cache.clear();
}

// ----------------------------------------------------------------------------- palette
const WOOD: RGB = [120, 80, 46];
const DWOOD: RGB = [84, 56, 34];
const STONE: RGB = [150, 146, 140];
const DSTONE: RGB = [100, 98, 96];
const STEEL: RGB = [180, 186, 196];
const DARK: RGB = [40, 40, 46];
const GLASS: RGB = [120, 190, 230];
const WIN: RGB = [60, 70, 90];
const GOLD: RGB = [240, 200, 60];
const WHITE: RGB = [236, 236, 236];
const BRICK: RGB = [160, 72, 56];
const CONCRETE: RGB = [170, 170, 165];
const THATCH: RGB = [196, 160, 80];

// ----------------------------------------------------------------------------- people
export interface PersonLook {
  species: number;
  color: RGB;      // clothing / kingdom color
  sclass: number;  // soldier class (-1 civilian)
  tool: number;    // job tool for civilians
  frame: number;
  king: boolean;
  child: boolean;
  zombie: boolean;
}

/** Person sprite: 11x11 canvas, anchor bottom-center (5.5, 11). */
export function personSprite(l: PersonLook): HTMLCanvasElement {
  const key = `p${l.species}|${l.color.join(',')}|${l.sclass}|${l.tool}|${l.frame}|${l.king ? 1 : 0}|${l.child ? 1 : 0}|${l.zombie ? 1 : 0}`;
  const s = l.sclass >= 0 ? SOLDIERS[l.sclass] : null;
  if (s && s.vehicle) return vehicleSprite(s.weapon, l.color, l.frame);
  if (s && s.weapon === 'lance') return knightSprite(l);
  return sprite(key, 11, 11, p => {
    const sp = SPECIES[l.species];
    let skin: RGB = sp.skin;
    let hair: RGB = sp.hair;
    if (l.zombie) { skin = [120, 160, 110]; hair = [60, 70, 50]; }
    const cloth: RGB = l.zombie ? [90, 90, 80] : l.color;
    const pants = shade(cloth, 0.55);
    const ox = 3;
    const short = sp.key === 'stonekin' ? 1 : 0;
    const tall = sp.key === 'grukh' ? -1 : 0;
    const top = 2 + short + tall;
    // head
    p.rect(ox + 1, top, 3, 2, skin);
    p.rect(ox + 1, top - 1, 3, 1, hair);
    if (sp.key === 'verdani') { p.px(ox, top, skin); p.px(ox + 4, top, skin); }
    p.px(ox + 3, top + 1, shade(skin, 0.6)); // eye
    if (sp.key === 'grukh') { p.px(ox + 1, top + 2, [240, 240, 220]); p.px(ox + 3, top + 2, [240, 240, 220]); }
    // body
    const by = top + 2;
    p.rect(ox, by, 5, 3 - short, cloth);
    p.rect(ox, by, 1, 2, shade(cloth, 0.85));
    p.rect(ox + 4, by, 1, 2, shade(cloth, 0.85));
    p.px(ox, by + 2, skin);
    p.px(ox + 4, by + 2, skin);
    if (sp.key === 'stonekin') { p.rect(ox + 1, by, 3, 2, hair); }
    // legs
    const ly = by + 3 - short;
    const legH = 11 - ly;
    if (l.frame === 0) { p.rect(ox + 1, ly, 1, legH, pants); p.rect(ox + 3, ly, 1, legH, pants); }
    else { p.rect(ox + 1, ly, 1, legH - 1, pants); p.rect(ox + 2, ly + 1, 1, legH - 1, pants); p.rect(ox + 3, ly, 1, legH - 1, pants); }
    // headgear
    if (l.king) { p.rect(ox + 1, top - 2, 3, 1, GOLD); p.px(ox + 1, top - 3, GOLD); p.px(ox + 3, top - 3, GOLD); }
    else if (s) helmet(p, s.id, ox, top);
    // weapon / tool
    if (s) weapon(p, s.weapon, ox, by);
    else if (!l.child) tool(p, l.tool, ox, by);
  });
}

function helmet(p: Painter, id: string, ox: number, top: number): void {
  switch (id) {
    case 'spearman': p.rect(ox + 1, top - 1, 3, 1, [205, 127, 50]); break;
    case 'swordsman': p.rect(ox + 1, top - 1, 3, 1, STEEL); p.px(ox + 2, top - 2, STEEL); break;
    case 'archer': case 'crossbow': p.rect(ox + 1, top - 1, 3, 1, [70, 110, 60]); break;
    case 'musketeer': p.rect(ox, top - 1, 5, 1, DARK); p.px(ox + 2, top - 2, DARK); break;
    case 'rifleman': p.rect(ox + 1, top - 1, 4, 1, [110, 100, 70]); break;
    case 'gunner': p.rect(ox + 1, top - 1, 3, 1, [80, 100, 60]); p.rect(ox, top - 1, 5, 1, [80, 100, 60]); break;
    case 'infantry': p.rect(ox + 1, top - 1, 3, 1, [60, 64, 70]); p.px(ox + 3, top, [60, 200, 255]); break;
    case 'laser': p.rect(ox + 1, top - 1, 3, 1, WHITE); p.rect(ox + 2, top, 2, 1, [80, 230, 255]); break;
  }
}

function weapon(p: Painter, wpn: string, ox: number, by: number): void {
  const x = ox + 5;
  switch (wpn) {
    case 'club': p.rect(x, by - 1, 1, 3, WOOD); p.px(x, by - 2, DWOOD); break;
    case 'spear': p.rect(x, by - 4, 1, 7, WOOD); p.px(x, by - 5, STEEL); break;
    case 'sword': p.line(x, by + 1, x + 2, by - 2, STEEL); p.px(x, by + 1, GOLD); break;
    case 'bow': p.px(x + 1, by - 2, WOOD); p.rect(x + 2, by - 1, 1, 3, WOOD); p.px(x + 1, by + 2, WOOD); p.rect(x + 1, by - 1, 1, 3, [230, 230, 210]); break;
    case 'crossbow': p.rect(x, by + 1, 3, 1, WOOD); p.rect(x + 2, by, 1, 3, DWOOD); break;
    case 'musket': p.rect(x - 1, by + 1, 4, 1, WOOD); p.px(x + 3, by + 1, DARK); break;
    case 'rifle': p.rect(x - 1, by + 1, 4, 1, DWOOD); p.rect(x + 2, by + 1, 2, 1, DARK); break;
    case 'mg': p.rect(x - 1, by + 1, 5, 1, DARK); p.px(x, by + 2, DARK); break;
    case 'smartgun': p.rect(x - 1, by + 1, 4, 1, [30, 30, 34]); p.px(x + 2, by, [60, 200, 255]); break;
    case 'laser': p.rect(x - 1, by + 1, 4, 1, WHITE); p.px(x + 3, by + 1, [255, 60, 110]); break;
  }
}

function tool(p: Painter, t: number, ox: number, by: number): void {
  const x = ox + 5;
  switch (t) {
    case 3: p.rect(x, by - 1, 1, 4, WOOD); p.rect(x, by - 1, 2, 1, STEEL); break; // axe
    case 4: p.rect(x, by - 1, 1, 4, WOOD); p.rect(x - 1, by - 1, 3, 1, DSTONE); break; // pick
    case 2: p.rect(x, by - 2, 1, 5, WOOD); p.px(x + 1, by - 2, DSTONE); break; // hoe
    case 5: p.rect(x, by, 1, 2, WOOD); p.rect(x, by - 1, 2, 1, DSTONE); break; // hammer
    case 7: p.rect(x - 1, by + 1, 2, 2, [200, 60, 60]); p.px(x - 1, by + 1, WHITE); break; // book
  }
}

function knightSprite(l: PersonLook): HTMLCanvasElement {
  const key = `k${l.species}|${l.color.join(',')}|${l.frame}`;
  return sprite(key, 13, 12, p => {
    const sp = SPECIES[l.species];
    const horse: RGB = [130, 90, 60];
    // horse
    p.rect(2, 6, 8, 3, horse);
    p.rect(9, 4, 2, 3, horse);
    p.px(10, 3, shade(horse, 0.7));
    p.rect(1, 6, 1, 2, shade(horse, 0.6));
    const lf = l.frame;
    p.rect(2 + lf, 9, 1, 3, shade(horse, 0.7)); p.rect(4 - lf, 9, 1, 3, shade(horse, 0.7));
    p.rect(7 + lf, 9, 1, 3, shade(horse, 0.7)); p.rect(9 - lf, 9, 1, 3, shade(horse, 0.7));
    p.rect(2, 7, 8, 1, l.color); // caparison
    // rider
    p.rect(5, 2, 3, 4, l.color);
    p.rect(5, 0, 3, 2, STEEL);
    p.px(7, 1, DARK);
    p.px(6, -1 + 1, [255, 255, 255]);
    p.line(8, 5, 12, 1, WOOD);
    p.px(12, 0, STEEL);
    void sp;
  });
}

export function vehicleSprite(kind: string, color: RGB, frame: number): HTMLCanvasElement {
  const key = `v${kind}|${color.join(',')}|${frame}`;
  switch (kind) {
    case 'catapult':
      return sprite(key, 12, 9, p => {
        p.rect(1, 6, 10, 2, WOOD);
        p.rect(2, 8, 2, 1, DWOOD); p.rect(8, 8, 2, 1, DWOOD);
        p.line(3, 6, 9, 1, DWOOD);
        p.rect(9, 0, 2, 2, DSTONE);
        p.rect(5, 5, 2, 1, color);
      });
    case 'cannon':
      return sprite(key, 12, 8, p => {
        p.rect(2, 3, 8, 2, DARK);
        p.rect(9, 2, 2, 2, DARK);
        p.rect(3, 5, 3, 3, WOOD); p.px(4, 6, DWOOD);
        p.rect(1, 4, 2, 1, color);
      });
    case 'artillery':
      return sprite(key, 13, 8, p => {
        const g: RGB = [90, 100, 70];
        p.rect(1, 4, 9, 2, g);
        p.line(5, 4, 12, 1, DARK); p.line(5, 3, 12, 0, DARK);
        p.rect(2, 6, 3, 2, DARK); p.rect(7, 6, 3, 2, DARK);
        p.rect(1, 3, 2, 1, color);
      });
    case 'tank':
      return sprite(key, 14, 9, p => {
        const body = mix([86, 100, 66], color, 0.3);
        p.rect(1, 5, 12, 3, DARK);
        for (let i = 0; i < 6; i++) p.px(2 + i * 2 + (frame ? 1 : 0), 7, [90, 90, 90]);
        p.box(1, 3, 12, 3, body);
        p.box(4, 1, 6, 3, shade(body, 1.1));
        p.rect(10, 2, 4, 1, DARK);
        p.px(5, 2, color);
      });
    case 'mech':
      return sprite(key, 12, 14, p => {
        const body: RGB = [200, 206, 214];
        p.box(3, 2, 6, 6, body);
        p.rect(4, 3, 4, 1, [60, 220, 255]);
        p.rect(1, 3, 2, 4, shade(body, 0.8)); p.rect(9, 3, 2, 4, shade(body, 0.8));
        p.rect(10, 5, 2, 1, [255, 60, 110]);
        p.rect(4, 8, 1, 6 - frame, DSTONE); p.rect(7, 8, 1, 5 + frame, DSTONE);
        p.rect(3, 13, 3, 1, DARK); p.rect(6, 13, 3, 1, DARK);
        p.rect(5, 6, 2, 1, color);
        p.px(6, 0, color); p.px(6, 1, DARK);
      });
  }
  return sprite(key, 4, 4, p => p.rect(0, 0, 4, 4, color));
}

// ----------------------------------------------------------------------------- animals & monsters
export function creatureSprite(kind: number, frame: number): HTMLCanvasElement {
  const key = `c${kind}|${frame}`;
  switch (kind) {
    case 1: // sheep
      return sprite(key, 8, 6, p => {
        p.rect(1, 1, 5, 3, [240, 240, 232]); p.px(1, 1, [255, 255, 255]); p.rect(2, 0, 3, 1, [230, 230, 222]);
        p.rect(6, 1, 2, 2, [60, 56, 52]);
        p.px(2 + frame, 4, [60, 56, 52]); p.px(5 - frame, 4, [60, 56, 52]); p.px(2 + frame, 5, [60, 56, 52]); p.px(5 - frame, 5, [60, 56, 52]);
      });
    case 2: // deer
      return sprite(key, 8, 8, p => {
        const c: RGB = [170, 110, 60];
        p.rect(1, 3, 5, 2, c); p.rect(5, 1, 2, 3, c); p.px(7, 2, shade(c, 0.7));
        p.px(5, 0, [110, 80, 50]); p.px(7, 0, [110, 80, 50]); p.px(6, 0, [110, 80, 50]);
        p.px(1, 3, [240, 230, 210]);
        p.rect(1 + frame, 5, 1, 3, shade(c, 0.7)); p.rect(5 - frame, 5, 1, 3, shade(c, 0.7));
      });
    case 3: // chicken
      return sprite(key, 5, 5, p => {
        p.rect(0, 1, 3, 2, [250, 250, 245]); p.rect(2, 0, 2, 2, [250, 250, 245]); p.px(4, 1, [240, 160, 40]); p.px(3, 0, [220, 40, 40]);
        p.px(1, 3 + (frame ? 0 : 1), [240, 160, 40]); p.px(2, 3 + frame, [240, 160, 40]);
      });
    case 4: // wolf
      return sprite(key, 9, 6, p => {
        const c: RGB = [120, 120, 126];
        p.rect(1, 2, 6, 2, c); p.rect(6, 1, 2, 2, c); p.px(8, 2, shade(c, 0.6)); p.px(6, 0, c);
        p.px(0, 1, c); p.px(7, 1, [250, 220, 80]);
        p.rect(1 + frame, 4, 1, 2, shade(c, 0.7)); p.rect(6 - frame, 4, 1, 2, shade(c, 0.7));
      });
    case 5: // bear
      return sprite(key, 11, 8, p => {
        const c: RGB = [110, 74, 44];
        p.rect(1, 2, 8, 4, c); p.rect(8, 1, 3, 3, c); p.px(10, 2, DARK); p.px(8, 0, c); p.px(10, 0, c);
        p.rect(1, 2, 8, 1, shade(c, 1.15));
        p.rect(2 + frame, 6, 2, 2, shade(c, 0.7)); p.rect(6 - frame, 6, 2, 2, shade(c, 0.7));
      });
    case 6: // dragon
      return sprite(key, 22, 16, p => {
        const c: RGB = [196, 48, 40];
        const wing: RGB = [150, 30, 40];
        p.rect(5, 8, 10, 4, c);
        p.rect(14, 6, 3, 3, c); p.rect(17, 5, 4, 3, c); p.px(20, 6, GOLD); p.px(21, 7, [255, 200, 100]);
        p.rect(0, 10, 6, 2, c); p.px(0, 9, c);
        p.rect(5, 11, 10, 1, [240, 190, 80]);
        if (frame) { p.rect(6, 1, 7, 7, wing); p.rect(7, 0, 3, 2, wing); p.line(6, 1, 12, 7, shade(wing, 1.3)); }
        else { p.rect(6, 6, 8, 3, wing); p.rect(4, 4, 4, 3, wing); p.line(5, 4, 13, 8, shade(wing, 1.3)); }
        p.rect(7, 12, 2, 3, shade(c, 0.7)); p.rect(12, 12, 2, 3, shade(c, 0.7));
        p.px(16, 4, [240, 230, 200]); p.px(18, 4, [240, 230, 200]);
      });
    case 7: // zombie (person-like)
      return personSprite({ species: 0, color: [90, 90, 80], sclass: -1, tool: 0, frame, king: false, child: false, zombie: true });
    case 8: // kraken
      return sprite(key, 14, 10, p => {
        const c: RGB = [150, 70, 170];
        p.rect(4, 0, 6, 5, c); p.rect(5, 0, 4, 1, shade(c, 1.2)); p.px(5, 2, [255, 240, 100]); p.px(8, 2, [255, 240, 100]);
        for (let i = 0; i < 5; i++) {
          const x = 1 + i * 3;
          const off = (i + frame) % 2;
          p.rect(x, 5 + off, 1, 4 - off, shade(c, 0.85));
          p.px(x + (off ? 1 : -1), 9, shade(c, 0.7));
        }
      });
    case 9: // golem
      return sprite(key, 11, 13, p => {
        const c: RGB = [130, 124, 116];
        p.box(2, 3, 7, 6, c);
        p.rect(3, 0, 5, 3, shade(c, 1.1)); p.px(4, 1, [255, 140, 40]); p.px(6, 1, [255, 140, 40]);
        p.rect(0, 4, 2, 5, shade(c, 0.85)); p.rect(9, 4, 2, 5, shade(c, 0.85));
        p.rect(3, 9, 2, 4 - frame, shade(c, 0.7)); p.rect(6, 9, 2, 3 + frame, shade(c, 0.7));
        p.px(4, 5, [80, 200, 120]);
      });
    case 10: // ufo
      return sprite(key, 16, 8, p => {
        p.rect(5, 0, 6, 3, [150, 230, 180]); p.rect(6, 0, 4, 1, [210, 255, 230]);
        p.rect(1, 3, 14, 2, [170, 176, 190]); p.rect(0, 4, 16, 1, [120, 126, 140]);
        for (let i = 0; i < 5; i++) p.px(2 + i * 3, 4, (i + frame) % 2 ? [255, 255, 120] : [255, 90, 90]);
        p.rect(5, 5, 6, 1, [90, 96, 110]);
      });
    case 13: // fish
      return sprite(key, 5, 3, p => {
        p.rect(1, 1, 3, 1, [230, 160, 70]); p.px(0, frame ? 0 : 2, [230, 160, 70]); p.px(4, 1, DARK);
      });
  }
  return sprite(key, 3, 3, p => p.rect(0, 0, 3, 3, [255, 0, 255]));
}

export function shipSprite(vclass: number, color: RGB, frame: number): HTMLCanvasElement {
  const key = `s${vclass}|${color.join(',')}|${frame}`;
  return sprite(key, 18, 14, p => {
    const hullY = 9;
    switch (vclass) {
      case 0: // raft
        p.rect(3, hullY, 10, 2, WOOD); p.rect(3, hullY + 2, 10, 1, DWOOD);
        p.rect(7, hullY - 5, 1, 5, DWOOD); p.rect(8, hullY - 5, 3, 3, mix(color, WHITE, 0.4));
        break;
      case 1: // galley
        p.rect(2, hullY, 13, 2, WOOD); p.rect(3, hullY + 2, 11, 1, DWOOD); p.rect(14, hullY - 1, 2, 2, WOOD);
        for (let i = 0; i < 5; i++) p.px(4 + i * 2, hullY + 3, frame ? DWOOD : WOOD);
        p.rect(8, hullY - 7, 1, 7, DWOOD); p.rect(5, hullY - 6, 7, 4, color);
        break;
      case 2: // caravel
        p.rect(2, hullY, 14, 3, WOOD); p.rect(2, hullY - 1, 3, 1, WOOD); p.rect(13, hullY - 1, 3, 1, WOOD);
        p.rect(7, hullY - 8, 1, 8, DWOOD); p.rect(11, hullY - 6, 1, 6, DWOOD);
        p.rect(4, hullY - 7, 6, 5, WHITE); p.px(6, hullY - 5, color); p.rect(10, hullY - 5, 3, 4, WHITE);
        p.rect(7, hullY - 9, 2, 1, color);
        break;
      case 3: // galleon
        p.rect(1, hullY, 16, 3, DWOOD); p.rect(1, hullY - 2, 4, 2, WOOD); p.rect(13, hullY - 1, 4, 1, WOOD);
        for (let i = 0; i < 5; i++) p.px(4 + i * 2, hullY + 1, DARK);
        p.rect(6, hullY - 9, 1, 9, DARK); p.rect(11, hullY - 8, 1, 8, DARK);
        p.rect(3, hullY - 8, 6, 5, WHITE); p.rect(9, hullY - 7, 5, 4, WHITE);
        p.rect(4, hullY - 6, 4, 1, color); p.rect(10, hullY - 5, 3, 1, color);
        p.rect(6, hullY - 10, 2, 1, color);
        break;
      case 4: // ironclad
        p.rect(1, hullY, 16, 3, [70, 74, 80]); p.rect(1, hullY + 2, 16, 1, DARK);
        p.box(5, hullY - 3, 7, 3, [110, 112, 118]); p.rect(8, hullY - 7, 2, 4, DARK);
        p.rect(12, hullY - 1, 4, 1, DARK); p.rect(5, hullY - 3, 2, 1, color);
        break;
      default: // destroyer
        p.rect(0, hullY, 18, 3, [110, 118, 128]); p.rect(1, hullY + 2, 16, 1, [70, 76, 84]);
        p.box(6, hullY - 4, 6, 4, [150, 156, 166]); p.rect(9, hullY - 7, 1, 3, DARK); p.rect(8, hullY - 8, 3, 1, DARK);
        p.rect(13, hullY - 1, 4, 1, DARK); p.rect(2, hullY - 1, 3, 1, DARK); p.rect(6, hullY - 4, 2, 1, color);
        break;
    }
    p.rect(1, 13, 16, 1, frame ? [200, 230, 255] : [170, 210, 240]);
  });
}

export function planeSprite(vclass: number, color: RGB, frame: number): HTMLCanvasElement {
  const key = `a${vclass}|${color.join(',')}|${frame}`;
  return sprite(key, 16, 8, p => {
    switch (vclass) {
      case 0: // biplane
        p.rect(2, 3, 10, 2, [170, 150, 90]); p.rect(4, 1, 5, 1, color); p.rect(4, 6, 5, 1, color);
        p.rect(4, 2, 1, 4, DWOOD); p.rect(8, 2, 1, 4, DWOOD);
        p.rect(0, 2, 2, 2, [170, 150, 90]); p.rect(12, 3 - frame, 1, 3, DARK);
        break;
      case 1: // bomber
        p.rect(1, 3, 14, 2, [120, 126, 116]); p.rect(5, 1, 4, 6, shade([120, 126, 116], 0.85));
        p.rect(0, 2, 2, 1, [120, 126, 116]); p.px(14, 3, GLASS); p.rect(6, 1, 2, 1, color);
        break;
      case 2: // jet
        p.rect(1, 3, 13, 2, [160, 168, 178]); p.px(14, 4, GLASS); p.rect(5, 1, 3, 2, [130, 138, 150]); p.rect(5, 5, 3, 2, [130, 138, 150]);
        p.rect(0, 2, 2, 2, [130, 138, 150]); p.rect(0, 4, 1, 1, frame ? [255, 160, 60] : [255, 220, 120]); p.px(6, 2, color);
        break;
      default: // drone
        p.rect(3, 3, 9, 2, [60, 64, 70]); p.rect(1, 2, 13, 1, [80, 84, 90]); p.px(12, 4, [255, 60, 60]); p.px(6, 3, color);
        break;
    }
  });
}

// ----------------------------------------------------------------------------- buildings
export interface BldLook {
  type: string;
  style: number;
  color: RGB;
  species: number;
  w: number;
  h: number;
  progress: number;
  variant?: number;
}

/** Building sprites. Width = w*4, height = footprint + roof; anchored at bottom-left of footprint. */
export function buildingSprite(l: BldLook): HTMLCanvasElement {
  const stage = l.progress >= 1 ? 3 : l.progress > 0.66 ? 2 : l.progress > 0.33 ? 1 : 0;
  const v = l.type === 'house' && l.style >= 6 ? (l.variant || 0) % 3 : 0;
  const key = `b${l.type}|${l.style}|${l.color.join(',')}|${l.species}|${stage}|${v}`;
  const W = l.w * 4;
  const extra = buildingExtraHeight(l.type, l.style, v);
  const H = l.h * 4 + extra;
  return sprite(key, W, H, p => {
    if (stage < 3) { construction(p, W, H, l, stage); return; }
    drawBuilding(p, W, H, l, v);
  });
}

const HOUSE_H: number[][] = [[3], [4], [4], [6], [7], [8], [10, 5, 12], [14, 9, 18], [20, 12, 26], [22, 6, 15]];

export function buildingExtraHeight(type: string, style: number, variant = 0): number {
  switch (type) {
    case 'house': { const hs = HOUSE_H[style] || [6]; return hs[variant % hs.length]; }
    case 'center': return [6, 8, 8, 12, 14, 14, 14, 20, 26, 30][style] ?? 10;
    case 'temple': return style >= 3 ? 14 : 6;
    case 'tower': return style >= 7 ? 10 : 9;
    case 'castle': return 10;
    case 'university': return 8;
    case 'factory': return 10;
    case 'power': return style >= 7 ? 10 : 12;
    case 'lab': return 8;
    case 'silo': return 3;
    case 'spaceport': return 22;
    case 'airbase': return 2;
    case 'docks': return 4;
    case 'mine': return style >= 5 ? 10 : 3;
    default: return 6;
  }
}

function construction(p: Painter, W: number, H: number, l: BldLook, stage: number): void {
  const fy = H - l.h * 4;
  p.rect(0, H - 2, W, 2, [150, 120, 80]);
  const height = Math.round((H - 2) * (0.3 + stage * 0.25));
  const top = H - 2 - height;
  for (let x = 0; x < W; x += 3) p.rect(x, top, 1, height, WOOD);
  for (let y = top; y < H - 2; y += 3) p.rect(0, y, W, 1, DWOOD);
  if (stage >= 1) p.rect(1, Math.max(top + 1, fy), W - 2, Math.max(1, H - 3 - Math.max(top + 1, fy)), l.style >= 5 ? CONCRETE : STONE);
  p.rect(0, top, W, 1, DWOOD);
}

function flag(p: Painter, x: number, y: number, c: RGB): void {
  p.rect(x, y, 1, 4, DARK);
  p.rect(x + 1, y, 3, 2, c);
}

function drawBuilding(p: Painter, W: number, H: number, l: BldLook, v: number): void {
  const sp = SPECIES[l.species];
  const s = l.style;
  const fh = l.h * 4;
  const base = H; // bottom
  const kc = l.color;
  switch (l.type) {
    case 'house': return house(p, W, H, s, sp.roof, sp.wall, kc, v);
    case 'center': return center(p, W, H, s, sp.roof, sp.wall, kc);
    case 'temple':
      if (s < 3) {
        p.rect(1, base - 5, W - 2, 5, STONE); p.rect(0, base - 6, W, 1, DSTONE);
        p.rect(3, base - 9, 2, 3, [200, 180, 120]); p.px(3, base - 10, GOLD); p.rect(3, base - 3, 2, 3, DARK);
      } else {
        p.box(0, base - 9, W, 9, [214, 206, 190]);
        p.rect(3, base - 18, 2, 9, [214, 206, 190]); p.rect(2, base - 14, 4, 1, shade([214, 206, 190], 0.8));
        p.px(3, base - 20, GOLD); p.px(4, base - 19, GOLD); p.px(3, base - 19, GOLD);
        p.rect(3, base - 4, 2, 4, DWOOD); p.px(1, base - 7, [200, 60, 200]); p.px(6, base - 7, [60, 120, 220]);
        p.roof(0, base - 9, W, 3, sp.roof);
      }
      return;
    case 'mine':
      if (s < 5) {
        p.rect(0, base - 5, W, 5, [110, 96, 80]); p.rect(2, base - 4, 4, 4, DARK);
        p.rect(1, base - 5, 6, 1, WOOD); p.rect(1, base - 5, 1, 5, WOOD); p.rect(6, base - 5, 1, 5, WOOD);
        p.rect(6, base - 2, 2, 2, [140, 130, 120]);
      } else {
        p.rect(0, base - 4, W, 4, [90, 84, 78]); p.rect(2, base - 14, 1, 10, DARK); p.rect(5, base - 14, 1, 10, DARK);
        p.line(2, base - 14, 5, base - 8, DARK); p.line(5, base - 14, 2, base - 8, DARK); p.rect(2, base - 15, 4, 2, [180, 60, 40]);
      }
      return;
    case 'barracks': {
      const wall = s >= 6 ? [110, 120, 90] as RGB : s >= 3 ? STONE : WOOD;
      p.box(0, base - 7, W, 7, wall);
      p.rect(3, base - 4, 2, 4, DARK);
      p.roof(0, base - 7, W, 3, s >= 6 ? [80, 90, 66] : sp.roof);
      flag(p, 6, base - 12, kc);
      p.line(1, base - 6, 3, base - 4, STEEL); p.line(3, base - 6, 1, base - 4, STEEL);
      return;
    }
    case 'library': {
      const wall: RGB = s >= 4 ? [226, 222, 210] : [196, 178, 140];
      p.box(0, base - 8, W, 8, wall);
      for (let i = 0; i < 4; i++) p.rect(1 + i * 2, base - 7, 1, 6, shade(wall, 0.85));
      p.roof(0, base - 8, W, 3, s >= 4 ? [150, 150, 160] : sp.roof);
      p.rect(3, base - 3, 2, 3, DWOOD);
      return;
    }
    case 'tower': {
      if (s < 2) { // wooden watchtower
        p.rect(0, base - 12, 1, 12, WOOD); p.rect(3, base - 12, 1, 12, WOOD); p.line(0, base - 1, 3, base - 6, DWOOD);
        p.rect(0, base - 13, 4, 2, WOOD); p.rect(0, base - 14, 4, 1, sp.roof); p.px(1, base - 15, kc);
      } else if (s < 5) { // stone tower
        p.box(0, base - 12, 4, 12, STONE); p.rect(0, base - 13, 1, 1, STONE); p.rect(3, base - 13, 1, 1, STONE);
        p.px(1, base - 9, DARK); p.px(2, base - 6, DARK); flag(p, 1, base - 17, kc);
      } else if (s < 7) { // gun bunker
        p.box(0, base - 6, 4, 6, CONCRETE); p.rect(0, base - 8, 4, 2, [120, 120, 116]); p.rect(2, base - 7, 3, 1, DARK);
        p.px(1, base - 4, DARK);
      } else if (s < 9) { // missile battery
        p.box(0, base - 5, 4, 5, CONCRETE); p.rect(0, base - 9, 1, 4, WHITE); p.rect(2, base - 10, 1, 5, WHITE); p.px(0, base - 10, [220, 40, 40]); p.px(2, base - 11, [220, 40, 40]);
        p.rect(3, base - 12, 1, 3, DARK); p.rect(2, base - 13, 2, 1, STEEL);
      } else { // laser turret
        p.box(0, base - 6, 4, 6, [220, 226, 236]); p.rect(1, base - 10, 2, 4, [200, 206, 216]); p.rect(1, base - 11, 3, 1, [255, 60, 110]); p.px(1, base - 8, [80, 230, 255]);
      }
      return;
    }
    case 'docks':
      p.rect(0, base - 4, W, 2, WOOD); for (let x = 0; x < W; x += 3) p.rect(x, base - 2, 1, 2, DWOOD);
      p.box(1, base - 8, 4, 4, s >= 5 ? BRICK : WOOD); p.roof(1, base - 8, 4, 2, sp.roof);
      if (s >= 5) { p.rect(6, base - 10, 1, 6, [200, 160, 40]); p.rect(4, base - 10, 4, 1, [200, 160, 40]); }
      return;
    case 'forge':
      p.box(0, base - 6, W, 6, STONE); p.roof(0, base - 6, W, 2, sp.roof); p.rect(5, base - 10, 2, 4, DSTONE);
      p.rect(2, base - 3, 3, 3, [255, 140, 40]); p.px(3, base - 2, [255, 230, 120]);
      return;
    case 'market':
      for (let i = 0; i < 2; i++) {
        const c = i ? kc : [220, 200, 80] as RGB;
        p.rect(i * 4, base - 6, 4, 1, c); p.rect(i * 4, base - 5, 4, 1, shade(c, 0.8));
        p.rect(i * 4, base - 4, 1, 4, WOOD); p.rect(i * 4 + 3, base - 4, 1, 4, WOOD); p.rect(i * 4 + 1, base - 2, 2, 1, [200, 120, 60]);
      }
      return;
    case 'castle': {
      const c = STONE;
      p.box(1, base - 10, W - 2, 10, c);
      p.box(0, base - 14, 3, 14, shade(c, 0.95)); p.box(W - 3, base - 14, 3, 14, shade(c, 0.95));
      for (let x = 0; x < W; x += 2) p.px(x, base - 15, c);
      p.box(4, base - 18, 4, 8, shade(c, 1.05));
      p.rect(5, base - 4, 2, 4, DARK);
      flag(p, 6, base - 22, kc);
      p.px(1, base - 11, DARK); p.px(W - 2, base - 11, DARK);
      return;
    }
    case 'university': {
      const wall: RGB = [230, 224, 210];
      p.box(0, base - 9, W, 9, wall);
      for (let i = 0; i < 6; i++) p.rect(1 + i * 2, base - 8, 1, 7, shade(wall, 0.85));
      p.rect(4, base - 13, 4, 4, [200, 200, 210]); p.rect(5, base - 14, 2, 1, [200, 200, 210]); p.px(5, base - 15, GOLD);
      p.rect(5, base - 3, 2, 3, DWOOD);
      return;
    }
    case 'hospital':
      p.box(0, base - 9, W, 9, WHITE);
      p.windows(1, base - 7, W - 2, 6, 3, 2, GLASS, 1, 2);
      p.rect(3, base - 12, 2, 4, [220, 40, 40]); p.rect(2, base - 11, 4, 2, [220, 40, 40]);
      return;
    case 'factory': {
      p.box(0, base - 8, W, 8, BRICK);
      for (let i = 0; i < 3; i++) { p.line(i * 4, base - 8, i * 4 + 3, base - 11, [90, 90, 96]); p.rect(i * 4 + 3, base - 11, 1, 3, [90, 90, 96]); }
      p.rect(9, base - 18, 2, 10, shade(BRICK, 0.8)); p.rect(9, base - 18, 2, 1, DARK);
      p.windows(1, base - 6, W, 4, 5, 1, [240, 200, 110], 1, 1);
      p.rect(5, base - 3, 2, 3, DARK);
      return;
    }
    case 'power':
      if (s < 7) {
        p.box(0, base - 6, W, 6, BRICK); p.rect(1, base - 16, 2, 10, DSTONE); p.rect(5, base - 14, 2, 8, DSTONE);
        p.rect(1, base - 16, 2, 1, DARK); p.rect(5, base - 14, 2, 1, DARK); p.px(3, base - 3, [255, 230, 80]);
      } else if (s < 8) {
        // nuclear cooling tower
        for (let y = 0; y < 13; y++) { const ins = y < 5 ? 1 : y < 9 ? 2 : 1; p.rect(ins, base - 2 - y, W - ins * 2, 1, shade(CONCRETE, 0.9 + (y % 3) * 0.05)); }
        p.rect(0, base - 2, W, 2, DSTONE); p.px(3, base - 6, [120, 255, 120]);
      } else {
        // solar / wind farm
        p.rect(0, base - 3, W, 3, [60, 80, 130]); for (let x = 0; x < W; x += 2) p.px(x, base - 3, [140, 180, 240]);
        p.rect(5, base - 14, 1, 11, WHITE); p.line(2, base - 16, 8, base - 12, WHITE); p.line(5, base - 17, 5, base - 11, WHITE);
      }
      return;
    case 'airbase':
      p.rect(0, base - 3, W, 2, [80, 80, 84]); for (let x = 1; x < W; x += 3) p.px(x, base - 2, [230, 230, 200]);
      p.box(1, base - 10, 6, 7, [150, 156, 150]); p.rect(2, base - 6, 4, 3, DARK); p.roof(1, base - 10, 6, 2, [120, 126, 120]);
      p.rect(9, base - 12, 1, 9, DARK); p.rect(8, base - 13, 3, 1, [220, 40, 40]); p.px(10, base - 8, kc);
      return;
    case 'lab':
      p.box(0, base - 9, W, 9, [226, 232, 240]);
      p.rect(0, base - 6, W, 1, [80, 200, 230]);
      p.rect(5, base - 13, 1, 4, DSTONE); p.rect(3, base - 14, 4, 1, WHITE); p.rect(2, base - 15, 1, 1, WHITE); p.rect(7, base - 15, 1, 1, WHITE);
      p.windows(1, base - 4, W, 3, 3, 1, GLASS, 1, 1);
      return;
    case 'silo':
      p.rect(0, base - 3, W, 3, CONCRETE); p.rect(2, base - 6, 4, 3, [90, 94, 100]); p.rect(3, base - 7, 2, 1, WHITE); p.px(3, base - 8, [220, 40, 40]);
      p.px(0, base - 3, [240, 200, 40]); p.px(W - 1, base - 3, [240, 200, 40]);
      return;
    case 'spaceport':
      p.rect(0, base - 3, W, 3, [110, 110, 116]); p.rect(1, base - 4, W - 2, 1, [150, 150, 156]);
      p.rect(2, base - 28, 1, 25, [220, 120, 40]); p.rect(2, base - 28, 3, 1, [220, 120, 40]);
      for (let y = base - 26; y < base - 4; y += 4) p.rect(2, y, 3, 1, [200, 100, 30]);
      p.box(6, base - 26, 3, 20, WHITE); p.rect(6, base - 28, 3, 2, shade(WHITE, 0.9)); p.px(7, base - 29, [220, 40, 40]);
      p.rect(5, base - 9, 1, 3, WHITE); p.rect(9, base - 9, 1, 3, WHITE); p.rect(7, base - 20, 1, 2, kc);
      return;
  }
  p.box(0, base - fh, W, fh, STONE);
}

function house(p: Painter, W: number, H: number, s: number, roofC: RGB, wallC: RGB, kc: RGB, v: number): void {
  const b = H;
  if (v === 1) {
    switch (s) {
      case 6: // suburban home with garage
        p.box(0, b - 6, 5, 6, [220, 214, 196]); p.roof(0, b - 6, 5, 3, roofC); p.px(1, b - 4, WIN); p.rect(2, b - 2, 1, 2, DWOOD);
        p.box(5, b - 4, 3, 4, [200, 196, 186]); p.rect(5, b - 3, 3, 3, [150, 150, 150]);
        return;
      case 7: // brutalist block
        p.box(0, b - 12, W, 12, [168, 164, 156]); p.rect(0, b - 13, W, 1, DSTONE);
        p.windows(1, b - 11, W, 10, 3, 4, [60, 70, 90], 1, 2); p.rect(3, b - 2, 2, 2, DARK);
        return;
      case 8: { // teal glass mid-rise with roof garden
        const g: RGB = [70, 170, 170];
        p.rect(0, b - 15, W, 15, g); for (let y = b - 14; y < b; y += 2) p.rect(0, y, W, 1, shade(g, 0.8));
        p.rect(0, b - 15, 1, 15, shade(g, 1.25)); p.rect(0, b - 16, W, 1, [70, 140, 60]); p.px(2, b - 17, [90, 170, 70]); p.px(5, b - 17, [90, 170, 70]);
        return;
      }
      default: { // dome habitat
        const c: RGB = [236, 240, 246];
        p.rect(0, b - 3, W, 3, shade(c, 0.9));
        p.rect(1, b - 5, W - 2, 2, c); p.rect(2, b - 7, W - 4, 2, c); p.rect(3, b - 8, 2, 1, c);
        p.rect(0, b - 3, W, 1, [60, 230, 255]); p.px(3, b - 6, [150, 230, 255]); p.px(4, b - 6, [150, 230, 255]); p.px(2, b - 1, kc);
        return;
      }
    }
  }
  if (v === 2) {
    switch (s) {
      case 6: // 4-floor apartments with balconies
        p.box(0, b - 16, W, 16, [214, 200, 170]); p.windows(1, b - 15, W, 14, 3, 5, WIN, 1, 2);
        for (let y = b - 14; y < b - 2; y += 3) p.rect(0, y, W, 1, shade([214, 200, 170], 0.8));
        p.rect(3, b - 2, 2, 2, DARK);
        return;
      case 7: // tall slab
        p.box(0, b - 22, W, 22, [186, 190, 196]); p.windows(1, b - 21, W, 20, 3, 8, [70, 90, 120], 1, 1);
        p.rect(5, b - 24, 1, 2, DARK); p.rect(3, b - 2, 2, 2, DARK);
        return;
      case 8: { // dark glass tower with antenna
        const g: RGB = [50, 70, 110];
        p.rect(0, b - 30, W, 30, g); for (let y = b - 29; y < b; y += 2) p.rect(1, y, W - 2, 1, [90, 130, 180]);
        p.rect(0, b - 30, 1, 30, shade(g, 1.4)); p.rect(3, b - 34, 1, 4, DARK); p.px(3, b - 35, [255, 60, 60]);
        return;
      }
      default: { // terraced arcology with gardens
        const c: RGB = [232, 236, 240];
        p.rect(0, b - 6, W, 6, c); p.rect(1, b - 11, W - 2, 5, c); p.rect(2, b - 16, W - 4, 5, c); p.rect(3, b - 19, 2, 3, c);
        p.rect(0, b - 7, W, 1, [80, 170, 80]); p.rect(1, b - 12, W - 2, 1, [80, 170, 80]); p.rect(2, b - 17, W - 4, 1, [80, 170, 80]);
        p.rect(1, b - 3, W - 2, 1, [60, 230, 255]); p.rect(2, b - 9, W - 4, 1, [60, 230, 255]); p.px(3, b - 20, kc);
        return;
      }
    }
  }
  switch (s) {
    case 0: { // hide tent
      const c: RGB = [170, 130, 90];
      for (let r = 0; r < 8; r++) { const ins = Math.floor(r / 2); p.rect(ins, b - 1 - r, W - ins * 2, 1, r % 3 === 0 ? shade(c, 0.85) : c); }
      p.rect(3, b - 3, 2, 3, DARK); p.px(3, b - 9, DWOOD); p.px(4, b - 10, DWOOD);
      return;
    }
    case 1: { // round mud hut
      const mud: RGB = [168, 128, 88];
      p.rect(1, b - 5, W - 2, 5, mud); p.rect(1, b - 5, 1, 5, shade(mud, 0.85));
      for (let r = 0; r < 5; r++) p.rect(r, b - 6 - r, W - r * 2, 1, r % 2 ? shade(THATCH, 0.9) : THATCH);
      p.rect(3, b - 3, 2, 3, DARK);
      return;
    }
    case 2: { // wood & thatch house
      p.box(0, b - 5, W, 5, WOOD);
      p.roof(0, b - 5, W, 5, THATCH);
      p.rect(3, b - 3, 2, 3, DARK); p.px(1, b - 4, [230, 200, 120]);
      return;
    }
    case 3: { // timber frame
      p.box(0, b - 7, W, 7, [230, 224, 200]);
      p.rect(0, b - 7, W, 1, DWOOD); p.rect(0, b - 4, W, 1, DWOOD); p.rect(0, b - 7, 1, 7, DWOOD); p.rect(W - 1, b - 7, 1, 7, DWOOD); p.line(1, b - 6, 3, b - 5, DWOOD);
      p.roof(0, b - 7, W, 5, roofC);
      p.rect(4, b - 3, 2, 3, DWOOD); p.px(2, b - 2, WIN); p.px(5, b - 6, WIN);
      return;
    }
    case 4: { // stone townhouse
      p.box(0, b - 9, W, 9, mix(wallC, STONE, 0.5));
      p.roof(0, b - 9, W, 4, [180, 80, 60]);
      p.windows(1, b - 8, W, 6, 3, 2, WIN, 1, 2);
      p.rect(3, b - 3, 2, 3, DWOOD);
      return;
    }
    case 5: { // brick row house with chimney
      p.box(0, b - 10, W, 10, BRICK);
      p.roof(0, b - 10, W, 3, [70, 74, 84]);
      p.rect(6, b - 14, 1, 3, shade(BRICK, 0.7));
      p.windows(1, b - 9, W, 7, 3, 2, WIN, 1, 2);
      p.rect(3, b - 3, 2, 3, DARK);
      return;
    }
    case 6: { // concrete apartments
      p.box(0, b - 14, W, 14, CONCRETE);
      p.rect(0, b - 15, W, 1, shade(CONCRETE, 0.8));
      p.windows(1, b - 13, W, 12, 3, 4, WIN, 1, 2);
      p.rect(3, b - 2, 2, 2, DARK); p.px(0, b - 14, kc);
      return;
    }
    case 7: { // tower block
      p.box(0, b - 18, W, 18, [196, 192, 182]);
      p.windows(1, b - 17, W, 16, 3, 6, [70, 90, 120], 1, 2);
      p.rect(0, b - 19, W, 1, DSTONE); p.rect(5, b - 21, 1, 2, DARK);
      p.rect(3, b - 2, 2, 2, DARK);
      return;
    }
    case 8: { // glass skyscraper
      const g: RGB = [90, 150, 200];
      p.rect(0, b - 24, W, 24, g);
      for (let y = b - 23; y < b; y += 2) p.rect(0, y, W, 1, shade(g, 0.8));
      p.rect(0, b - 24, 1, 24, shade(g, 1.25)); p.rect(W - 1, b - 24, 1, 24, shade(g, 0.7));
      p.rect(2, b - 26, 4, 2, [150, 160, 170]); p.rect(4, b - 28, 1, 2, DARK); p.px(4, b - 29, [255, 60, 60]);
      return;
    }
    default: { // space-age spire
      const c: RGB = [236, 240, 246];
      p.rect(1, b - 22, W - 2, 22, c);
      p.rect(0, b - 10, W, 4, c);
      p.rect(2, b - 26, W - 4, 4, shade(c, 0.95)); p.rect(3, b - 30, 2, 4, c);
      p.rect(1, b - 18, W - 2, 1, [60, 230, 255]); p.rect(1, b - 8, W - 2, 1, [60, 230, 255]); p.rect(3, b - 24, 2, 1, [60, 230, 255]);
      p.px(3, b - 31, kc);
      p.rect(3, b - 3, 2, 3, [80, 230, 255]);
    }
  }
}

function center(p: Painter, W: number, H: number, s: number, roofC: RGB, wallC: RGB, kc: RGB): void {
  const b = H;
  switch (s) {
    case 0: { // bonfire camp
      const c: RGB = [160, 120, 84];
      for (let r = 0; r < 9; r++) { const ins = Math.floor(r / 1.6); p.rect(1 + ins, b - 3 - r, W - 2 - ins * 2, 1, r % 3 === 0 ? shade(c, 0.85) : c); }
      p.rect(5, b - 5, 2, 3, DARK);
      p.rect(0, b - 2, W, 2, [120, 110, 100]);
      p.rect(9, b - 4, 2, 2, [255, 140, 40]); p.px(9, b - 5, [255, 220, 80]);
      flag(p, 1, b - 10, kc);
      return;
    }
    case 1:
    case 2: { // longhouse
      p.box(0, b - 7, W, 7, s === 1 ? [168, 128, 88] : WOOD);
      p.roof(0, b - 7, W, 6, THATCH);
      p.rect(5, b - 4, 2, 4, DARK); p.px(2, b - 4, [255, 200, 100]); p.px(9, b - 4, [255, 200, 100]);
      flag(p, 10, b - 16, kc);
      return;
    }
    case 3: { // stone hall
      p.box(0, b - 10, W, 10, STONE);
      p.roof(0, b - 10, W, 4, roofC);
      p.box(4, b - 18, 4, 9, shade(STONE, 1.05)); p.roof(4, b - 18, 4, 2, roofC);
      p.rect(5, b - 4, 2, 4, DWOOD); p.windows(1, b - 8, W, 3, 2, 1, WIN, 7, 1);
      flag(p, 6, b - 23, kc);
      return;
    }
    case 4: { // town hall with clock tower
      p.box(0, b - 11, W, 11, mix(wallC, WHITE, 0.4));
      p.roof(0, b - 11, W, 3, [170, 70, 55]);
      p.box(4, b - 20, 4, 10, mix(wallC, WHITE, 0.3)); p.px(5, b - 17, WHITE); p.px(6, b - 17, DARK); p.roof(4, b - 20, 4, 3, [170, 70, 55]);
      p.windows(1, b - 9, W, 5, 6, 2, WIN, 1, 2); p.rect(5, b - 4, 2, 4, DWOOD);
      flag(p, 6, b - 26, kc);
      return;
    }
    case 5: { // brick hall with dome
      p.box(0, b - 12, W, 12, BRICK);
      p.windows(1, b - 11, W, 8, 6, 3, [240, 220, 160], 1, 2);
      p.rect(3, b - 16, 6, 4, [90, 140, 120]); p.rect(4, b - 18, 4, 2, [90, 140, 120]); p.rect(5, b - 19, 2, 1, [90, 140, 120]);
      p.rect(5, b - 4, 2, 4, DARK); flag(p, 6, b - 25, kc);
      return;
    }
    case 6: { // capitol
      p.box(0, b - 10, W, 10, WHITE);
      for (let i = 0; i < 6; i++) p.rect(1 + i * 2, b - 9, 1, 8, shade(WHITE, 0.85));
      p.rect(2, b - 14, 8, 4, WHITE); p.rect(3, b - 17, 6, 3, shade(WHITE, 0.95)); p.rect(5, b - 19, 2, 2, WHITE); p.px(5, b - 20, GOLD);
      flag(p, 10, b - 16, kc);
      return;
    }
    case 7: { // government tower
      p.box(0, b - 8, W, 8, [200, 200, 196]);
      p.box(3, b - 22, 6, 15, [180, 182, 186]);
      p.windows(4, b - 21, 6, 13, 3, 7, [70, 90, 120], 1, 1);
      p.rect(5, b - 25, 2, 3, DARK); flag(p, 6, b - 29, kc);
      return;
    }
    case 8: { // glass HQ
      const g: RGB = [80, 140, 196];
      p.rect(0, b - 10, W, 10, shade(g, 0.9));
      p.rect(2, b - 30, 8, 22, g);
      for (let y = b - 29; y < b - 8; y += 2) p.rect(2, y, 8, 1, shade(g, 0.8));
      p.rect(2, b - 30, 1, 22, shade(g, 1.3));
      p.rect(5, b - 34, 2, 4, [150, 160, 170]); flag(p, 6, b - 38 + 4, kc);
      return;
    }
    default: { // star spire
      const c: RGB = [238, 242, 248];
      p.rect(0, b - 8, W, 8, c);
      p.rect(3, b - 30, 6, 22, c); p.rect(4, b - 36, 4, 6, c); p.rect(5, b - 40, 2, 4, c);
      p.rect(3, b - 24, 6, 1, [60, 230, 255]); p.rect(3, b - 16, 6, 1, [60, 230, 255]); p.rect(0, b - 5, W, 1, [60, 230, 255]);
      p.rect(4, b - 34, 4, 1, kc); p.px(5, b - 41, [255, 255, 160]); p.px(6, b - 41, [255, 255, 160]);
    }
  }
}

// ----------------------------------------------------------------------------- misc
export function glowSprite(color: string): HTMLCanvasElement {
  const key = `glow|${color}`;
  let c = cache.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  cache.set(key, c);
  return c;
}

/** Small icon canvas → data URL for UI buttons. */
export function iconURL(c: HTMLCanvasElement, scale = 4): string {
  const out = document.createElement('canvas');
  const s = Math.max(c.width, c.height);
  out.width = out.height = s * scale;
  const ctx = out.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(c, ((s - c.width) / 2) * scale, ((s - c.height) / 2) * scale, c.width * scale, c.height * scale);
  return out.toDataURL();
}

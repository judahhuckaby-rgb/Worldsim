// DOM user interface: toolbar, inspector, modals, toasts, minimap.
import type { Game, HistoryEntry } from '../sim/game';
import type { Renderer } from '../render/renderer';
import type { MapMode } from '../render/terrainTex';
import { Unit, City, Kingdom, Building } from '../sim/entities';
import { UK, UDEF, JOB_NAMES, JOB, SOLDIERS, TPY, ADULT_AGE, SHIPS, PLANES, BLD } from '../sim/defs';
import { TER, RES_NAMES, RES_ICONS, DEPOSIT_NAMES, FLORA_NAMES, T } from '../sim/terrain';
import { SPECIES, traitList } from '../sim/species';
import { TECHS, ERAS, NUM_ERAS, canResearch, eraName } from '../sim/tech';
import { TOOLS, CATEGORIES, Tool, ToolCtx } from './tools';
import { personSprite, creatureSprite, buildingSprite, iconURL, css } from '../render/sprites';
import { MAP_TYPES, MapType } from '../sim/worldgen';
import { listSlots, SlotMeta } from '../sim/save';
import { flagImg } from '../render/flags';
import { APP_VERSION } from '../update';
import { doomsday, nuclearPowers, nukeBanned, climateSigned, accord } from '../sim/politics';
import { CommandUI } from './command';
import { cmdResearch } from '../sim/command';

export interface NewWorldOpts { w: number; h: number; type: MapType; seed: number; civs: number; animals: boolean; startEra: number; }

export interface AppLike {
  game: Game;
  renderer: Renderer;
  speed: number;
  paused: boolean;
  tool: Tool | null;
  brush: number;
  showMinimap: boolean;
  setSpeed(s: number): void;
  togglePause(): void;
  selectTool(t: Tool | null): void;
  newWorld(o: NewWorldOpts): void;
  save(slot: string): Promise<void>;
  load(slot: string): Promise<void>;
  toolCtx: ToolCtx;
}

const SPEEDS = [1, 2, 5, 10, 20];
const MAJOR_KINDS = new Set(['nuke', 'ascend', 'space', 'eraFirst', 'treaty', 'disaster', 'update', 'split', 'conquest', 'campaign', 'war', 'peace', 'fall']);
export const WORLD_SIZES = [
  { name: 'Small', w: 256, h: 176 }, { name: 'Medium', w: 384, h: 256 }, { name: 'Large', w: 512, h: 352 }, { name: 'Huge', w: 704, h: 480 },
  { name: 'Giant', w: 960, h: 656 }, { name: 'Colossal', w: 1280, h: 880 },
];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}
function esc(s: string): string {
  return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
}
function fmt(n: number): string {
  if (n >= 10000) return (n / 1000).toFixed(0) + 'k';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return String(Math.floor(n));
}

export class UI {
  app: AppLike;
  root: HTMLElement;
  yearEl!: HTMLElement;
  statsEl!: HTMLElement;
  speedBtns: HTMLButtonElement[] = [];
  pauseBtn!: HTMLButtonElement;
  catBtns: HTMLButtonElement[] = [];
  toolsEl!: HTMLElement;
  hintEl!: HTMLElement;
  brushVal!: HTMLElement;
  inspectBtn!: HTMLButtonElement;
  panel!: HTMLElement;
  panelKind: '' | 'unit' | 'city' | 'kingdom' | 'tile' | 'building' = '';
  panelRef: Unit | City | Kingdom | Building | number | null = null;
  modalBack!: HTMLElement;
  modal!: HTMLElement;
  modalRefresh: (() => void) | null = null;
  toasts!: HTMLElement;
  minimap!: HTMLCanvasElement;
  mmImg: ImageData | null = null;
  mmT = 0;
  cat = 'terrain';
  modeBtn!: HTMLButtonElement;
  lastToast = 0;
  defaultSize = 3;
  iconCache = new Map<string, string>();
  canQuit = false;
  onCheckUpdates: () => void = () => {};
  cmd!: CommandUI;
  onQuit: () => void = () => {};

  constructor(app: AppLike, root: HTMLElement) {
    this.app = app;
    this.root = root;
    this.build();
  }

  // ------------------------------------------------------------------ build
  build(): void {
    const r = this.root;
    r.innerHTML = '';
    // top bar
    const top = el('div');
    top.id = 'topbar';
    const left = el('div', 'pill');
    const menu = el('button', '', '☰');
    menu.title = 'Menu';
    menu.onclick = () => this.openMenu();
    left.append(menu);
    this.yearEl = el('div');
    this.yearEl.id = 'yearbox';
    left.append(this.yearEl);
    top.append(left);

    const speed = el('div', 'pill speed');
    this.pauseBtn = el('button', '', '⏸');
    this.pauseBtn.title = 'Pause (Space)';
    this.pauseBtn.onclick = () => { this.app.togglePause(); this.syncSpeed(); };
    speed.append(this.pauseBtn);
    for (const s of SPEEDS) {
      const b = el('button', '', `${s}×`);
      b.onclick = () => { this.app.setSpeed(s); this.syncSpeed(); };
      this.speedBtns.push(b);
      speed.append(b);
    }
    top.append(speed);
    top.append(el('div', 'spacer'));
    this.statsEl = el('div', 'pill');
    this.statsEl.id = 'stats';
    top.append(this.statsEl);
    const right = el('div', 'pill');
    const mk = (icon: string, title: string, fn: () => void) => { const b = el('button', '', icon); b.title = title; b.onclick = fn; right.append(b); return b; };
    mk('👑', 'Kingdoms', () => this.openKingdoms());
    mk('🧪', 'Technology', () => this.openTechTree(this.bestKingdom()));
    mk('📜', 'History', () => this.openHistory());
    mk('🌐', 'World affairs & diplomacy', () => this.openWorld());
    mk('📊', 'World statistics', () => this.openStats());
    mk('⚖️', 'World laws', () => this.openLaws());
    this.modeBtn = mk('🗺️', 'Map mode', () => this.cycleMode());
    mk('🏷️', 'Toggle city names', () => { this.app.renderer.showNames = !this.app.renderer.showNames; });
    mk('🧭', 'Toggle minimap', () => { this.app.showMinimap = !this.app.showMinimap; this.minimap.classList.toggle('hidden', !this.app.showMinimap); });
    top.append(right);
    r.append(top);

    // toasts
    this.toasts = el('div');
    this.toasts.id = 'toasts';
    r.append(this.toasts);

    // side panel
    this.panel = el('div', 'hidden');
    this.panel.id = 'panel';
    r.append(this.panel);

    // minimap
    this.minimap = el('canvas');
    this.minimap.id = 'minimap';
    r.append(this.minimap);
    this.bindMinimap();

    // bottom bar
    const bottom = el('div');
    bottom.id = 'bottombar';
    this.inspectBtn = el('button', 'on', '🔍<span>Inspect</span>');
    this.inspectBtn.id = 'inspectBtn';
    this.inspectBtn.title = 'Inspect / move (Esc)';
    this.inspectBtn.onclick = () => this.app.selectTool(null);
    bottom.append(this.inspectBtn);

    const wrap = el('div');
    wrap.id = 'toolwrap';
    this.hintEl = el('div');
    this.hintEl.id = 'hint';
    wrap.append(this.hintEl);
    const row = el('div');
    row.id = 'toolrow';
    const cats = el('div');
    cats.id = 'cats';
    for (const c of CATEGORIES) {
      const b = el('button', '', `${c.icon}<span>${c.name.slice(0, 7)}</span>`);
      b.title = c.name;
      b.onclick = () => { this.cat = c.id; this.renderTools(); };
      (b as any).cat = c.id;
      this.catBtns.push(b);
      cats.append(b);
    }
    row.append(cats);
    this.toolsEl = el('div');
    this.toolsEl.id = 'tools';
    row.append(this.toolsEl);
    wrap.append(row);
    bottom.append(wrap);

    const brush = el('div');
    brush.id = 'brush';
    const plus = el('button', '', '+');
    const minus = el('button', '', '−');
    this.brushVal = el('div');
    plus.onclick = () => { this.app.brush = Math.min(16, this.app.brush + 1); this.syncBrush(); };
    minus.onclick = () => { this.app.brush = Math.max(1, this.app.brush - 1); this.syncBrush(); };
    brush.append(plus, this.brushVal, minus);
    bottom.append(brush);
    r.append(bottom);

    // modal
    this.modalBack = el('div', 'hidden');
    this.modalBack.id = 'modalBack';
    this.modalBack.onclick = e => { if (e.target === this.modalBack) this.closeModal(); };
    this.modal = el('div', 'modal');
    this.modalBack.append(this.modal);
    this.cmd = new CommandUI(this, r);
    r.append(this.modalBack);

    this.renderTools();
    this.syncSpeed();
    this.syncBrush();
    this.syncTool();
  }

  iconFor(t: Tool): string {
    const ic = t.icon;
    if (ic.startsWith('color:')) return `<div class="sw" style="background:${ic.slice(6)}"></div>`;
    if (ic.startsWith('sprite:')) {
      let url = this.iconCache.get(ic);
      if (!url) {
        const parts = ic.split(':');
        let c: HTMLCanvasElement;
        if (parts[1] === 'person') c = personSprite({ species: +parts[2], color: [70, 110, 200], sclass: -1, tool: 0, frame: 0, king: false, child: false, zombie: false });
        else if (parts[1] === 'village') c = buildingSprite({ type: 'center', style: 2, color: [220, 60, 60], species: +parts[2], w: 3, h: 3, progress: 1 });
        else c = creatureSprite(+parts[2], 0);
        url = iconURL(c, 3);
        this.iconCache.set(ic, url);
      }
      return `<img src="${url}" alt="">`;
    }
    return ic;
  }

  renderTools(): void {
    for (const b of this.catBtns) b.classList.toggle('on', (b as any).cat === this.cat);
    const host = this.toolsEl;
    host.innerHTML = '';
    for (const t of TOOLS) {
      if (t.cat !== this.cat) continue;
      const b = el('button', 'tool', `${this.iconFor(t)}<label>${esc(t.name)}</label>`);
      b.title = `${t.name} — ${t.desc}`;
      b.onclick = () => this.app.selectTool(this.app.tool === t ? null : t);
      (b as any).tool = t;
      host.append(b);
    }
    this.syncTool();
  }

  syncTool(): void {
    const t = this.app.tool;
    this.inspectBtn.classList.toggle('on', !t);
    for (const b of Array.from(this.toolsEl.children)) b.classList.toggle('on', (b as any).tool === t);
    if (t) this.hintEl.innerHTML = `<b>${esc(t.name)}</b> — ${esc(t.desc)}${t.mode !== 'click' ? ' · drag to apply' : ''}`;
    else this.hintEl.innerHTML = '<b>Inspect</b> — tap anything to see details · drag to move · pinch / wheel to zoom';
    this.app.renderer.canvas.classList.toggle('pan', !t);
  }

  syncSpeed(): void {
    this.pauseBtn.classList.toggle('on', this.app.paused);
    this.pauseBtn.textContent = this.app.paused ? '▶' : '⏸';
    this.speedBtns.forEach((b, i) => b.classList.toggle('on', !this.app.paused && SPEEDS[i] === this.app.speed));
  }

  syncBrush(): void {
    this.brushVal.innerHTML = `<b>${this.app.brush}</b>`;
  }

  cycleMode(): void {
    const modes: MapMode[] = ['normal', 'political', 'eras', 'pollution'];
    const names = ['Normal', 'Political', 'Technology eras', 'Pollution'];
    const r = this.app.renderer;
    const i = (modes.indexOf(r.tex.mode) + 1) % modes.length;
    r.setMode(modes[i]);
    this.toast(`Map mode: ${names[i]}`);
  }

  bestKingdom(): Kingdom | null {
    const g = this.app.game;
    if (this.panelKind === 'kingdom' && this.panelRef instanceof Kingdom) return this.panelRef;
    let best: Kingdom | null = null;
    for (const k of g.kingdoms) if (!best || k.techCount > best.techCount || (k.techCount === best.techCount && k.pop > best.pop)) best = k;
    return best;
  }

  // ------------------------------------------------------------------ periodic update
  update(): void {
    const g = this.app.game;
    let wars = 0;
    for (const k of g.kingdoms) wars += k.wars;
    wars /= 2;
    const maxEra = g.kingdoms.reduce((m, k) => Math.max(m, k.era), -1);
    let warheads = 0;
    for (const k of g.kingdoms) warheads += k.warheads;
    const doom = doomsday(g);
    this.yearEl.innerHTML = `Year ${g.year}<small>${maxEra >= 0 ? eraName(maxEra) : 'Uninhabited'}${wars ? ` · ⚔ ${wars}` : ''}${warheads ? ` · <span style="color:${doom < 5 ? '#ff6a5a' : '#ffcf4a'}">☢ ${warheads}</span>` : ''}</small>`;
    this.statsEl.innerHTML = `👥 <b>${fmt(g.personPop)}</b> &nbsp;👑 <b>${g.kingdoms.length}</b> &nbsp;🏘 <b>${g.cities.length}</b>${g.heat > 0.3 ? ` &nbsp;🌡 <b style="color:${g.heat > 1 ? '#ff6a5a' : '#ffcf4a'}">+${(g.heat * 2).toFixed(1)}°</b>` : ''}`;
    // toasts
    while (g.toasts.length) this.showToast(g.toasts.shift()!);
    this.cmd.update();
    this.refreshPanel();
    if (this.modalRefresh) this.modalRefresh();
  }

  updateMinimap(now: number): void {
    if (!this.app.showMinimap) return;
    if (now - this.mmT < 250) return;
    this.mmT = now;
    const g = this.app.game;
    const w = g.world;
    const mm = this.minimap;
    const maxW = Math.min(220, window.innerWidth * 0.28);
    const scale = maxW / w.w;
    const cw = Math.round(w.w * scale), ch = Math.round(w.h * scale);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (mm.width !== Math.round(cw * dpr) || mm.height !== Math.round(ch * dpr)) {
      mm.width = Math.round(cw * dpr);
      mm.height = Math.round(ch * dpr);
    }
    mm.style.width = cw + 'px';
    mm.style.height = ch + 'px';
    const ctx = mm.getContext('2d')!;
    ctx.imageSmoothingEnabled = true;
    // the terrain overview is kept current by the renderer; just scale it down
    ctx.drawImage(this.app.renderer.tex.overview, 0, 0, mm.width, mm.height);
    const R = this.app.renderer;
    const k = mm.width / w.w;
    const vw = R.vw / R.cam.zoom, vh = R.vh / R.cam.zoom;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = Math.max(1, dpr);
    ctx.strokeRect((R.cam.x - vw / 2) * k, (R.cam.y - vh / 2) * k, vw * k, vh * k);
  }

  bindMinimap(): void {
    const mm = this.minimap;
    let down = false;
    const go = (e: PointerEvent) => {
      const r = mm.getBoundingClientRect();
      const g = this.app.game;
      const x = ((e.clientX - r.left) / r.width) * g.world.w;
      const y = ((e.clientY - r.top) / r.height) * g.world.h;
      this.app.renderer.centerOn(x, y);
    };
    mm.addEventListener('pointerdown', e => { down = true; mm.setPointerCapture(e.pointerId); go(e); e.stopPropagation(); });
    mm.addEventListener('pointermove', e => { if (down) go(e); });
    mm.addEventListener('pointerup', () => { down = false; });
    mm.addEventListener('pointercancel', () => { down = false; });
  }

  // ------------------------------------------------------------------ toasts
  toast(msg: string): void {
    this.showToast({ year: this.app.game.year, text: msg, kind: 'info', x: -1, y: -1, color: '#ffcf4a' });
  }

  /** 'major' = only world-changing events, 'all' = every headline, 'off' = none (history still records everything). */
  get notifyLevel(): string {
    try { return localStorage.getItem('ws.notify') || 'major'; } catch { return 'major'; }
  }
  set notifyLevel(v: string) {
    try { localStorage.setItem('ws.notify', v); } catch { /* ignore */ }
  }

  showToast(e: HistoryEntry): void {
    const level = this.notifyLevel;
    const pk = this.cmd ? this.cmd.k : null;
    const mine = !!pk && pk.alive && e.text.includes(pk.baseName);
    if (e.kind !== 'info' && !mine) {
      if (level === 'off') return;
      if (level === 'major' && !MAJOR_KINDS.has(e.kind)) return;
    }
    const compact = window.innerHeight < 560 || window.innerWidth < 720;
    const t = el('div', 'toast', esc(e.text));
    t.style.borderLeftColor = e.color;
    t.title = 'Tap to dismiss' + (e.x >= 0 ? ' and go there' : '');
    t.onclick = () => {
      if (e.x >= 0) this.app.renderer.centerOn(e.x, e.y, Math.max(8, this.app.renderer.cam.zoom / this.app.renderer.dpr));
      t.remove();
    };
    this.toasts.prepend(t);
    const max = compact ? 2 : 3;
    while (this.toasts.children.length > max) this.toasts.lastElementChild!.remove();
    const life = compact ? 3200 : 4200;
    setTimeout(() => t.classList.add('out'), life);
    setTimeout(() => t.remove(), life + 400);
  }

  // ------------------------------------------------------------------ inspector
  inspect(x: number, y: number): void {
    const g = this.app.game;
    const R = this.app.renderer;
    const pick = Math.max(0.9, 14 / (R.cam.zoom / R.dpr));
    let best: Unit | null = null, bd = pick * pick;
    for (const u of g.units) {
      if (u.dead || u.inBoat) continue;
      const fy = UDEF[u.kind].flying ? 1.8 : 0.35;
      const dx = u.x - x, dy = u.y - fy - y;
      const d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = u; }
    }
    if (best) { R.selUnit = best; R.selCity = null; this.showPanel('unit', best); return; }
    const w = g.world;
    const i = w.tileAt(x, y + 0.3);
    if (i < 0) { this.closePanel(); return; }
    const bid = w.bld[i];
    if (bid) {
      const b = g.bldById.get(bid);
      if (b) { R.selUnit = null; R.selCity = b.city; this.showPanel('building', b); return; }
    }
    const o = w.owner[i];
    if (o) {
      const c = g.cityById.get(o);
      if (c) { R.selUnit = null; R.selCity = c; this.showPanel('city', c); return; }
    }
    R.selUnit = null;
    R.selCity = null;
    this.showPanel('tile', i);
  }

  showPanel(kind: UI['panelKind'], ref: UI['panelRef']): void {
    this.panelKind = kind;
    this.panelRef = ref;
    this.panel.classList.remove('hidden');
    this.refreshPanel(true);
  }

  closePanel(): void {
    this.panelKind = '';
    this.panelRef = null;
    this.panel.classList.add('hidden');
    this.app.renderer.selUnit = null;
    this.app.renderer.selCity = null;
  }

  private panelT = 0;
  refreshPanel(force = false): void {
    if (!this.panelKind) return;
    const now = performance.now();
    if (!force && now - this.panelT < 450) return;
    // don't rebuild while the user is pressing a button inside
    if (!force && this.panel.matches(':active')) return;
    this.panelT = now;
    const scroll = this.panel.scrollTop;
    let html = '';
    switch (this.panelKind) {
      case 'unit': html = this.unitHTML(this.panelRef as Unit); break;
      case 'city': html = this.cityHTML(this.panelRef as City); break;
      case 'building': html = this.buildingHTML(this.panelRef as Building); break;
      case 'kingdom': html = this.kingdomHTML(this.panelRef as Kingdom); break;
      case 'tile': html = this.tileHTML(this.panelRef as number); break;
    }
    if (!html) { this.closePanel(); return; }
    this.panel.innerHTML = `<button class="close" data-a="close">✕</button>` + html;
    this.panel.scrollTop = scroll;
    this.bindPanel();
  }

  bindPanel(): void {
    const g = this.app.game;
    this.panel.querySelectorAll<HTMLElement>('[data-a]').forEach(b => {
      b.onclick = () => {
        const a = b.dataset.a!;
        const id = Number(b.dataset.id || 0);
        switch (a) {
          case 'close': this.closePanel(); break;
          case 'kingdom': { const k = g.kingdomById.get(id); if (k) this.showPanel('kingdom', k); break; }
          case 'city': { const c = g.cityById.get(id); if (c) { this.app.renderer.selCity = c; this.showPanel('city', c); } break; }
          case 'goto': this.app.renderer.centerOn(Number(b.dataset.x), Number(b.dataset.y), 10); break;
          case 'tree': { const k = g.kingdomById.get(id); if (k) this.openTechTree(k); break; }
          case 'command': { const k = g.kingdomById.get(id); if (k && k.alive) { this.cmd.take(k); this.refreshPanel(true); } break; }
          case 'uncommand': { this.cmd.release(); this.refreshPanel(true); break; }
          case 'gift': { const k = g.kingdomById.get(id); if (k) { this.app.toolCtx.pickKingdom.first = null; const t = TOOLS.find(t => t.id === 'gift')!; t.apply(g, k.capital!.x, k.capital!.y, 1, this.app.toolCtx); this.refreshPanel(true); } break; }
          case 'inspire': { const k = g.kingdomById.get(id); if (k && k.capital) { TOOLS.find(t => t.id === 'inspire')!.apply(g, k.capital.x, k.capital.y, 1, this.app.toolCtx); this.refreshPanel(true); } break; }
          case 'peace': { const k = g.kingdomById.get(id); if (k) { for (const o of g.kingdoms) if (k.atWar(o)) g.makePeace(k, o); this.refreshPanel(true); } break; }
          case 'war': {
            const k = g.kingdomById.get(id);
            const sel = this.panel.querySelector<HTMLSelectElement>('#warTarget');
            const o = sel ? g.kingdomById.get(Number(sel.value)) : null;
            if (k && o) { g.declareWar(k, o, 'by divine will'); this.refreshPanel(true); }
            break;
          }
          case 'rebel': {
            const c = g.cityById.get(id);
            if (c && c.kingdom.cities.length > 1) { TOOLS.find(t => t.id === 'rebellion')!.apply(g, c.x, c.y, 1, this.app.toolCtx); this.refreshPanel(true); }
            else this.toast('A kingdom needs at least two cities for a rebellion');
            break;
          }
          case 'follow': { const u = g.unitById.get(id); if (u) this.app.renderer.centerOn(u.x, u.y, 14); break; }
          case 'bless': { const u = g.unitById.get(id); if (u) { u.blessT = TPY * 30; u.hp = u.maxHp; } break; }
          case 'smite': { const u = g.unitById.get(id); if (u) { g.emit({ kind: 'lightning', x: u.x, y: u.y }); g.killUnit(u, null, null, 'divine wrath'); this.closePanel(); } break; }
          case 'crown': {
            const u = g.unitById.get(id);
            if (u && u.kingdom && u.kingdom.king !== u) {
              if (u.kingdom.king) u.kingdom.king.isKing = false;
              u.kingdom.king = u; u.isKing = true;
              g.log(`${u.name} was crowned ruler of ${g.kName(u.kingdom)} by divine decree`, 'king', u.x, u.y, u.kingdom.css, true);
              this.refreshPanel(true);
            }
            break;
          }
        }
      };
    });
  }

  flag(k: Kingdom, h = 13): string {
    return flagImg(k, this.app.game.seed, h);
  }

  private kLink(k: Kingdom | null): string {
    if (!k) return '<span class="sub">None</span>';
    return `<span class="row" data-a="kingdom" data-id="${k.id}" style="display:inline-flex;padding:0 4px">${this.flag(k)}${esc(this.app.game.kName(k))}</span>`;
  }

  unitHTML(u: Unit): string {
    if (!u || u.dead) return '';
    const g = this.app.game;
    const d = UDEF[u.kind];
    const age = Math.floor(u.ageT / TPY);
    let title = d.name;
    let sub = '';
    let rows = '';
    if (u.kind === UK.PERSON) {
      const sp = SPECIES[u.species];
      title = `${u.isKing ? '👑 ' : ''}${esc(u.name)}`;
      const role = u.sclass >= 0 ? SOLDIERS[u.sclass].name : u.ageT < ADULT_AGE * TPY ? 'Child' : JOB_NAMES[u.job];
      sub = `${sp.adj} · ${role}${u.level > 1 ? ` · Level ${u.level}` : ''}`;
      rows += `<div>Kingdom</div><div>${this.kLink(u.kingdom)}</div>`;
      rows += `<div>Home</div><div>${u.city ? `<span class="row" data-a="city" data-id="${u.city.id}" style="display:inline-flex;padding:0 4px">${esc(u.city.name)}</span>` : 'Wanderer'}</div>`;
      rows += `<div>Age</div><div>${age} years</div>`;
      const tl = traitList(u.traits);
      if (tl.length) rows += `<div>Traits</div><div>${tl.join(', ')}</div>`;
      if (u.order) rows += `<div>Orders</div><div>${u.order.type === 1 ? `Attack ${esc(u.order.city ? u.order.city.name : '?')}` : u.order.type === 3 ? 'Found a settlement' : 'Defend'}</div>`;
    } else if (u.kind === UK.BOAT) {
      title = SHIPS[u.vclass].name;
      sub = u.mission === 1 ? `Transport · ${u.cargo ? u.cargo.length : 0} aboard` : u.mission === 2 ? 'Warship' : 'Returning to port';
      rows += `<div>Navy of</div><div>${this.kLink(u.kingdom)}</div>`;
    } else if (u.kind === UK.PLANE) {
      title = PLANES[u.vclass].name;
      sub = u.mission === 4 ? 'Bombing run' : 'Returning to base';
      rows += `<div>Air force</div><div>${this.kLink(u.kingdom)}</div>`;
    } else {
      sub = d.monster ? 'Monster' : d.pred ? 'Predator' : 'Animal';
      rows += `<div>Age</div><div>${age} years</div>`;
    }
    rows += `<div>Health</div><div>${Math.ceil(u.hp)} / ${u.maxHp}</div>`;
    if (u.atk > 0) rows += `<div>Attack</div><div>${u.atk.toFixed(1)}${u.range > 2 ? ` · range ${u.range.toFixed(0)}` : ''}</div>`;
    if (u.kills) rows += `<div>Kills</div><div>${u.kills}</div>`;
    const st: string[] = [];
    if (u.blessT > 0) st.push('😇 Blessed');
    if (u.curseT > 0) st.push('😈 Cursed');
    if (u.madT > 0) st.push('🤪 Mad');
    if (u.plague > 0) st.push('🦠 Plague');
    if (st.length) rows += `<div>Status</div><div>${st.join(' ')}</div>`;
    const hpPct = Math.max(0, (u.hp / u.maxHp) * 100);
    return `<h2>${title}</h2><div class="sub">${sub}</div><div class="bar"><div style="width:${hpPct}%;background:linear-gradient(90deg,#4fd16a,#a6f06a)"></div></div>
      <div class="grid2">${rows}</div>
      <div class="btns"><button class="btn" data-a="follow" data-id="${u.id}">🎯 Focus</button><button class="btn" data-a="bless" data-id="${u.id}">😇 Bless</button>
      ${u.kind === UK.PERSON && u.kingdom && !u.isKing && u.ageT >= ADULT_AGE * TPY ? `<button class="btn" data-a="crown" data-id="${u.id}">👑 Crown</button>` : ''}
      <button class="btn danger" data-a="smite" data-id="${u.id}">⚡ Smite</button></div>`;
    void g;
  }

  cityHTML(c: City): string {
    if (!c || c.dead) return '';
    const g = this.app.game;
    const k = c.kingdom;
    const counts: Record<string, number> = {};
    let construction = 0;
    for (const b of c.buildings) { if (b.progress < 1) construction++; else counts[b.type] = (counts[b.type] || 0) + 1; }
    const jobs: number[] = new Array(9).fill(0);
    let kids = 0;
    for (const u of c.members) { if (u.ageT < ADULT_AGE * TPY) kids++; else jobs[u.job]++; }
    const jobStr = jobs.map((n, i) => (n ? `${JOB_NAMES[i]} ${n}` : '')).filter(Boolean).join(' · ');
    const bstr = Object.entries(counts).map(([t, n]) => `${BLD[t].name}${n > 1 ? ' ×' + n : ''}`).join(', ');
    const loyal = Math.round(c.loyalty);
    return `<h2>${this.flag(k)}${k.capital === c ? '★ ' : ''}${esc(c.name)}</h2>
      <div class="sub">${c.levelName} of ${this.kLink(k)} · founded year ${c.founded}</div>
      <div class="grid2">
        <div>Population</div><div>${c.members.length} / ${c.capacity}${kids ? ` (${kids} children)` : ''}</div>
        <div>Food</div><div>${Math.floor(c.food)}${c.starving ? ' <span class="tag war">Starving</span>' : ''}</div>
        <div>Loyalty</div><div style="color:${loyal < 0 ? 'var(--bad)' : loyal < 30 ? 'var(--accent)' : 'var(--good)'}">${loyal}${c.revoltT > 3 ? ' — unrest!' : ''}</div>
        <div>Territory</div><div>${c.tiles.length} tiles · ${c.farms.length} farms</div>
        <div>Era style</div><div>${eraName(k.era)}</div>
      </div>
      <h3>Work</h3><div class="sub">${jobStr || '—'}</div>
      <h3>Buildings</h3><div class="sub">${bstr || '—'}${construction ? ` · ${construction} under construction` : ''}</div>
      <div class="btns"><button class="btn" data-a="goto" data-x="${c.x}" data-y="${c.y}">🎯 Focus</button><button class="btn" data-a="kingdom" data-id="${k.id}">👑 Kingdom</button><button class="btn danger" data-a="rebel" data-id="${c.id}">🔥 Spark rebellion</button></div>`;
    void g;
  }

  buildingHTML(b: Building): string {
    if (!b || b.dead) return '';
    const c = b.city;
    return `<h2>${esc(b.def.name)}</h2><div class="sub">${esc(c.name)} · ${eraName(b.style)} style</div>
      <div class="bar"><div style="width:${(b.progress < 1 ? b.progress : b.hp / b.maxHp) * 100}%"></div></div>
      <div class="grid2"><div>${b.progress < 1 ? 'Construction' : 'Integrity'}</div><div>${b.progress < 1 ? Math.floor(b.progress * 100) + '%' : Math.ceil(b.hp) + ' / ' + b.maxHp}</div>
      <div>Purpose</div><div>${esc(b.def.desc)}</div></div>
      <div class="btns"><button class="btn" data-a="city" data-id="${c.id}">🏘 City</button><button class="btn" data-a="kingdom" data-id="${c.kingdom.id}">👑 Kingdom</button></div>`;
  }

  kingdomHTML(k: Kingdom): string {
    if (!k) return '';
    const g = this.app.game;
    const sp = SPECIES[k.species];
    if (!k.alive) return `<h2>${this.flag(k)}${esc(g.kName(k))}</h2><div class="sub">Fell in year ${k.diedYear}. Founded year ${k.founded}. Reached the ${eraName(k.era)}.</div>`;
    const cur = k.researching >= 0 ? TECHS[k.researching] : null;
    const pct = cur ? Math.min(100, (k.progress / cur.cost) * 100) : 100;
    const yrs = cur && k.researchRate > 0 ? Math.max(0, (cur.cost - k.progress) / k.researchRate) : 0;
    let rels = '';
    const others = g.kingdoms.filter(o => o !== k).map(o => ({ o, r: k.relation(o) })).sort((a, b) => (b.r.war ? 1 : 0) - (a.r.war ? 1 : 0) || a.r.opinion - b.r.opinion);
    for (const { o, r } of others.slice(0, 12)) {
      rels += `<div class="row" data-a="kingdom" data-id="${o.id}">${this.flag(o)}<span class="grow">${esc(g.kName(o))}</span>${r.war ? '<span class="tag war">War</span>' : r.ally ? '<span class="tag ally">Ally</span>' : ''}<span class="tag">${Math.round(r.opinion)}</span></div>`;
    }
    let cities = '';
    for (const c of k.cities.slice().sort((a, b) => b.members.length - a.members.length).slice(0, 12)) {
      cities += `<div class="row" data-a="city" data-id="${c.id}"><span class="grow">${k.capital === c ? '★ ' : ''}${esc(c.name)}</span><span class="tag">${c.levelName}</span><span class="tag">👥 ${c.members.length}</span></div>`;
    }
    const res = k.res.map((v, i) => (v >= 1 || k.caps.extract.has(i) ? `<span>${RES_ICONS[i]} ${fmt(v)}</span>` : '')).join('');
    const opts = g.kingdoms.filter(o => o !== k && !k.atWar(o)).map(o => `<option value="${o.id}">${esc(g.kName(o))}</option>`).join('');
    return `<h2>${this.flag(k)}${esc(g.kName(k))}</h2>
      <div class="sub">${sp.name} · <span class="tag era">${eraName(k.era)}</span> · ${k.techCount}/${TECHS.length} techs${k.ascended ? ' · 🚀 Ascended' : ''}</div>
      <div class="grid2">
        <div>Ruler</div><div>${k.king ? `<span class="row" data-a="follow" data-id="${k.king.id}" style="display:inline-flex;padding:0 4px">👑 ${esc(k.king.name)}</span>` : '—'}</div>
        <div>Population</div><div>${k.pop} in ${k.cities.length} cities</div>
        <div>Army</div><div>${k.soldiers} soldiers</div>
        <div>Founded</div><div>Year ${k.founded}</div>
      </div>
      <h3>Research</h3>
      <div class="sub">${cur ? `${esc(cur.name)} — ${esc(cur.desc)}` : 'All knowledge attained'}</div>
      <div class="bar"><div style="width:${pct}%"></div></div>
      <div class="sub">${k.researchRate.toFixed(1)} research/year${cur ? ` · ~${Math.ceil(yrs)} years left` : ''}</div>
      <div class="btns">${k.player ? `<button class="btn" data-a="uncommand" data-id="${k.id}">🏳️ Step down</button>` : `<button class="btn primary" data-a="command" data-id="${k.id}">🎮 Take command</button>`}</div>
      <div class="btns"><button class="btn ${k.player ? 'primary' : ''}" data-a="tree" data-id="${k.id}">🧪 Tech tree</button><button class="btn" data-a="gift" data-id="${k.id}">📜 Gift tech</button><button class="btn" data-a="inspire" data-id="${k.id}">💡 Inspire</button></div>
      <h3>Resources</h3><div class="res">${res}</div>
      <h3>Diplomacy</h3><div class="list">${rels || '<div class="sub">No contact with other kingdoms</div>'}</div>
      <div class="btns">${opts ? `<select id="warTarget" class="btn">${opts}</select><button class="btn danger" data-a="war" data-id="${k.id}">⚔ Declare war</button>` : ''}${k.wars ? `<button class="btn" data-a="peace" data-id="${k.id}">🕊 Make peace</button>` : ''}</div>
      <h3>Treaties</h3><div class="sub">${this.treatiesHTML(k)}</div>
      <h3>Cities</h3><div class="list">${cities}</div>
      ${k.capital ? `<div class="btns"><button class="btn" data-a="goto" data-x="${k.capital.x}" data-y="${k.capital.y}">🎯 Go to capital</button></div>` : ''}`;
  }

  treatiesHTML(k: Kingdom): string {
    const g = this.app.game;
    const parts: string[] = [];
    const names = (f: (r: import('../sim/entities').Relation) => boolean) => g.kingdoms.filter(o => o !== k && k.rel.get(o.id) && f(k.rel.get(o.id)!)).map(o => this.flag(o, 11) + ' ' + esc(o.baseName));
    const allies = names(r => r.ally), trade = names(r => r.trade), nap = names(r => r.nap > g.tick), war = names(r => r.war);
    if (war.length) parts.push(`⚔ At war with: ${war.join(', ')}`);
    if (allies.length) parts.push(`🤝 Allies: ${allies.join(', ')}`);
    if (trade.length) parts.push(`📜 Trade: ${trade.join(', ')}`);
    if (nap.length) parts.push(`🕊 Non-aggression: ${nap.join(', ')}`);
    if (g.council && g.council.members.has(k.id)) parts.push(`🌐 Member of the ${esc(g.council.name)}`);
    const ban = accord(g, 'nuclear_ban');
    if (ban && nukeBanned(g, k)) parts.push(`☮ Signed the ${esc(ban.name)}`);
    if (climateSigned(g, k)) parts.push(`🌱 Signed the ${esc(accord(g, 'climate')!.name)}`);
    if (k.warheads > 0 || k.nuclearTested) parts.push(`☢ Nuclear power — ${k.warheads} warhead${k.warheads === 1 ? '' : 's'}`);
    return parts.length ? parts.join('<br>') : 'No treaties';
  }

  openWorld(): void {
    const render = () => {
      const g = this.app.game;
      const doom = doomsday(g);
      const doomCol = doom < 3 ? '#ff4d3d' : doom < 7 ? '#ffb23d' : '#7fdc8a';
      const mins = doom >= 10 ? Math.round(doom) : doom.toFixed(1);
      const C = g.council;
      const council = C ? `<div class="sub"><b>${esc(C.name)}</b> — founded year ${C.founded}, ${C.members.size} member nations, ${C.sessions} sessions held</div>
        <div>${g.kingdoms.filter(k => C.members.has(k.id)).map(k => this.flag(k, 14)).join(' ')}</div>`
        : '<div class="sub">Not yet founded — it forms once two nations have invented the radio.</div>';
      const accords = g.accords.map(a => `<div class="row" style="cursor:default"><span class="grow" style="white-space:normal"><b>${a.kind === 'nuclear_ban' ? '☮' : '🌱'} ${esc(a.name)}</b> <span class="sub">(${a.founded})</span><br>
        ${g.kingdoms.filter(k => a.signatories.has(k.id)).map(k => this.flag(k, 12)).join(' ') || '<span class="sub">no remaining signatories</span>'}
        ${a.withdrawn.size ? `<br><span class="sub">Withdrawn: ${g.kingdoms.filter(k => a.withdrawn.has(k.id)).map(k => esc(k.baseName)).join(', ')}</span>` : ''}</span></div>`).join('') || '<div class="sub">No global accords yet.</div>';
      const powers = nuclearPowers(g).sort((a, b) => b.warheads - a.warheads).map(k => `<div class="row" data-k="${k.id}">${this.flag(k)}<span class="grow">${esc(g.kName(k))}</span>${nukeBanned(g, k) ? '<span class="tag ally">disarming</span>' : ''}<span class="tag war">☢ ${k.warheads}</span></div>`).join('') || '<div class="sub">No nation has nuclear weapons.</div>';
      const wars: string[] = [];
      for (const a of g.kingdoms) for (const b of g.kingdoms) {
        if (a.id >= b.id || !a.atWar(b)) continue;
        const r = a.relation(b), rb = b.relation(a);
        const yrs = Math.floor((g.tick - r.warStart) / TPY);
        const lead = Math.abs(r.warScore - rb.warScore) < 10 ? 'stalemate' : `${esc((r.warScore > rb.warScore ? a : b).baseName)} winning`;
        wars.push(`<div class="row" style="cursor:default">${this.flag(a)}<span class="grow">${esc(a.baseName)} ⚔ ${esc(b.baseName)} <span class="sub">— ${yrs} yr${yrs === 1 ? '' : 's'}, ${lead}</span></span>${this.flag(b)}</div>`);
      }
      let allies = 0, trades = 0;
      for (const a of g.kingdoms) for (const b of g.kingdoms) { if (a.id >= b.id) continue; const r = a.rel.get(b.id); if (r?.ally) allies++; if (r?.trade) trades++; }
      return `<h1>🌐 World affairs</h1>
        <div style="display:flex;align-items:center;gap:14px;margin-bottom:6px">
          <div style="font-size:30px">🕛</div>
          <div><div style="font-size:20px;font-weight:800;color:${doomCol}">${mins} minutes to midnight</div>
          <div class="sub">Doomsday clock — nuclear arsenals, wars between nuclear powers and climate change move it forward</div></div>
        </div>
        <div class="grid2">
          <div>Nations</div><div>${g.kingdoms.length}</div>
          <div>Wars</div><div>${wars.length}</div>
          <div>Alliances / trade pacts</div><div>${allies} / ${trades}</div>
          <div>Treaties signed</div><div>${g.treaties}</div>
          <div>Nuclear detonations</div><div>${g.combatNukes} in war · ${g.stats.nukes - g.combatNukes} tests</div>
          <div>Nuclear winter</div><div>${g.nuclearWinter > 0.3 ? `<span style="color:#9cf">${g.nuclearWinter > 3 ? 'Severe' : g.nuclearWinter > 1.2 ? 'Moderate' : 'Mild'}</span>` : 'None'}</div>
          <div>Global warming</div><div>+${(g.heat * 2).toFixed(1)}°</div>
        </div>
        <h3>World Council</h3>${council}
        <h3>Global accords</h3><div class="list">${accords}</div>
        <h3>Nuclear powers</h3><div class="list">${powers}</div>
        <h3>Wars</h3><div class="list">${wars.join('') || '<div class="sub">The world is at peace.</div>'}</div>`;
    };
    const bind = () => this.modal.querySelectorAll<HTMLElement>('[data-k]').forEach(r => r.onclick = () => {
      const k = this.app.game.kingdomById.get(Number(r.dataset.k));
      if (k) { this.closeModal(); this.showPanel('kingdom', k); }
    });
    this.openModal(render());
    bind();
    let t = 0;
    this.modalRefresh = () => { if (++t % 8 === 0 && !this.modal.matches(':hover')) { const st = this.modal.scrollTop; this.modal.innerHTML = `<button class="close">✕</button>` + render(); (this.modal.querySelector('.close') as HTMLElement).onclick = () => this.closeModal(); bind(); this.modal.scrollTop = st; } };
  }

  tileHTML(i: number): string {
    const g = this.app.game;
    const w = g.world;
    const t = w.ter[i];
    const f = w.flora[i];
    const dep = w.res[i];
    const x = i % w.w, y = (i / w.w) | 0;
    return `<h2>${TER[t].name}</h2><div class="sub">Tile ${x}, ${y}</div>
      <div class="grid2">
        ${f ? `<div>Plant</div><div>${FLORA_NAMES[f]}</div>` : ''}
        ${dep ? `<div>Deposit</div><div>${DEPOSIT_NAMES[dep]}</div>` : ''}
        <div>Fertility</div><div>${Math.round(TER[t].fert * 100)}%</div>
        ${w.poll[i] ? `<div>Pollution</div><div>${w.poll[i]}</div>` : ''}
        ${w.fire[i] ? `<div>Status</div><div>🔥 Burning</div>` : ''}
      </div>`;
  }

  // ------------------------------------------------------------------ modals
  openModal(html: string, refresh: (() => void) | null = null): void {
    this.modal.innerHTML = `<button class="close">✕</button>` + html;
    (this.modal.querySelector('.close') as HTMLElement).onclick = () => this.closeModal();
    this.modalBack.classList.remove('hidden');
    this.modalRefresh = refresh;
  }

  closeModal(): void {
    this.modalBack.classList.add('hidden');
    this.modalRefresh = null;
  }

  get modalOpen(): boolean {
    return !this.modalBack.classList.contains('hidden');
  }

  openMenu(): void {
    this.openModal(`<h1>WorldSim Ages</h1>
      <div class="sub">A god simulation where civilizations climb from the Stone Age to the stars.</div>
      <div class="btns" style="flex-direction:column;align-items:stretch;max-width:360px">
        <button class="btn primary" id="mNew">🌍 New world</button>
        <button class="btn" id="mPlay">🎮 ${this.cmd.k ? 'Your nation' : 'Lead a nation'}</button>
        <button class="btn" id="mSave">💾 Save world</button>
        <button class="btn" id="mLoad">📂 Load world</button>
        <button class="btn" id="mLaws">⚖️ World laws</button>
        <div class="law" style="border:none;padding:4px 0"><div><b>Notifications</b><div class="d">Pop-up headlines (everything is always kept in 📜 History)</div></div>
          <div class="seg" id="mNotify">${[['major', 'Major'], ['all', 'All'], ['off', 'Off']].map(([v, n]) => `<button data-v="${v}" class="${this.notifyLevel === v ? 'on' : ''}">${n}</button>`).join('')}</div></div>
        <button class="btn" id="mHelp">❓ How to play</button>
        <button class="btn" id="mUpd">🔄 Check for updates <span class="sub">· v${APP_VERSION}</span></button>
        <button class="btn" id="mClose">▶ Resume</button>
        ${this.canQuit ? '<button class="btn danger" id="mQuit">⏻ Save & quit</button>' : ''}
      </div>`);
    const q = (id: string) => this.modal.querySelector('#' + id) as HTMLElement;
    q('mNew').onclick = () => this.openNewWorld();
    q('mPlay').onclick = () => {
      const pk = this.cmd.k;
      if (pk && pk.alive) { this.closeModal(); this.showPanel('kingdom', pk); if (pk.capital) this.app.renderer.centerOn(pk.capital.x, pk.capital.y); }
      else { this.openKingdoms(); this.toast('Pick a nation, then press 🎮 Take command'); }
    };
    q('mSave').onclick = () => this.openSlots('save');
    q('mLoad').onclick = () => this.openSlots('load');
    q('mLaws').onclick = () => this.openLaws();
    q('mHelp').onclick = () => this.openHelp();
    q('mUpd').onclick = () => this.onCheckUpdates();
    q('mClose').onclick = () => this.closeModal();
    this.modal.querySelectorAll<HTMLElement>('#mNotify button').forEach(b => b.onclick = () => {
      this.notifyLevel = b.dataset.v!;
      this.modal.querySelectorAll('#mNotify button').forEach(x => x.classList.toggle('on', x === b));
      if (b.dataset.v === 'off') this.toasts.innerHTML = '';
    });
    const quit = this.modal.querySelector('#mQuit') as HTMLElement | null;
    if (quit) quit.onclick = () => this.onQuit();
  }

  offerContinue(m: SlotMeta, load: () => void): void {
    if (this.modalOpen) return;
    this.openModal(`<h1>Welcome back</h1>
      <div class="sub">Your last world was autosaved in year ${m.year} with ${m.kingdoms} kingdoms and ${fmt(m.pop)} people.</div>
      <div class="btns"><button class="btn primary" id="cGo">▶ Continue last world</button><button class="btn" id="cNew">🌍 Keep this new world</button></div>`);
    (this.modal.querySelector('#cGo') as HTMLElement).onclick = () => { this.closeModal(); load(); };
    (this.modal.querySelector('#cNew') as HTMLElement).onclick = () => this.closeModal();
  }

  openNewWorld(): void {
    const sizes = WORLD_SIZES;
    const def = this.defaultSize;
    const o: NewWorldOpts = { w: sizes[def].w, h: sizes[def].h, type: 'continents', seed: Math.floor(Math.random() * 1e9), civs: 8, animals: true, startEra: 0 };
    const seg = (id: string, items: string[], cur: number) => `<div class="seg" id="${id}">${items.map((s, i) => `<button data-i="${i}" class="${i === cur ? 'on' : ''}">${s}</button>`).join('')}</div>`;
    this.openModal(`<h1>🌍 New world</h1>
      <div class="form">
        <div>Size</div>${seg('nwSize', sizes.map(s => `${s.name} <small>${s.w}×${s.h}</small>`), def)}
        <div>Map type</div>${seg('nwType', MAP_TYPES.map(m => m.name), MAP_TYPES.findIndex(m => m.key === 'continents'))}
        <div>Starting civilizations</div>${seg('nwCivs', ['0', '2', '4', '6', '8', '12', '16'], 4)}
        <div>Starting era</div><select id="nwEra">${ERAS.map((e, i) => `<option value="${i}">${e.name}</option>`).join('')}</select>
        <div>Wildlife</div><div><div class="switch on" id="nwAnimals"></div></div>
        <div>Seed</div><input type="number" id="nwSeed" value="${o.seed}">
      </div>
      <div class="btns"><button class="btn primary" id="nwGo">Create world</button><button class="btn" id="nwBack">Cancel</button></div>
      <div class="sub" style="margin-top:8px">🌍 Earth uses real coastlines, mountain ranges and climate zones (Natural Earth data). Bigger worlds hold more nations and people. Giant and Colossal worlds are demanding, especially on phones — the population limit adapts to the size (change it in World laws).</div>`);
    const m = this.modal;
    const bindSeg = (id: string, fn: (i: number) => void) => {
      const host = m.querySelector('#' + id)!;
      host.querySelectorAll('button').forEach(b => (b.onclick = () => {
        host.querySelectorAll('button').forEach(x => x.classList.remove('on'));
        b.classList.add('on');
        fn(Number(b.dataset.i));
      }));
    };
    bindSeg('nwSize', i => { o.w = sizes[i].w; o.h = sizes[i].h; });
    bindSeg('nwType', i => { o.type = MAP_TYPES[i].key; });
    bindSeg('nwCivs', i => { o.civs = [0, 2, 4, 6, 8, 12, 16][i]; });
    const an = m.querySelector('#nwAnimals') as HTMLElement;
    an.onclick = () => { o.animals = !o.animals; an.classList.toggle('on', o.animals); };
    (m.querySelector('#nwGo') as HTMLElement).onclick = () => {
      o.seed = Number((m.querySelector('#nwSeed') as HTMLInputElement).value) || 1;
      o.startEra = Number((m.querySelector('#nwEra') as HTMLSelectElement).value) || 0;
      this.closeModal();
      this.closePanel();
      this.app.newWorld(o);
    };
    (m.querySelector('#nwBack') as HTMLElement).onclick = () => this.openMenu();
  }

  async openSlots(mode: 'save' | 'load'): Promise<void> {
    const metas = await listSlots();
    const slots = mode === 'save' ? ['1', '2', '3'] : ['1', '2', '3', 'auto'];
    const card = (s: string, m: SlotMeta | undefined) => `<div class="slot"><b>${s === 'auto' ? 'Autosave' : 'Slot ' + s}</b>
      <div class="sub">${m ? `Year ${m.year} · ${m.kingdoms} kingdoms · ${fmt(m.pop)} people<br>${m.size} · ${new Date(m.date).toLocaleString()}` : 'Empty'}</div>
      <button class="btn ${mode === 'save' ? 'primary' : ''}" data-slot="${s}" ${mode === 'load' && !m ? 'disabled style="opacity:.4"' : ''}>${mode === 'save' ? (m ? 'Overwrite' : 'Save here') : 'Load'}</button></div>`;
    this.openModal(`<h1>${mode === 'save' ? '💾 Save world' : '📂 Load world'}</h1><div class="slots">${slots.map(s => card(s, metas[s])).join('')}</div>
      <div class="btns"><button class="btn" id="slBack">Back</button></div>`);
    this.modal.querySelectorAll<HTMLElement>('[data-slot]').forEach(b => {
      b.onclick = async () => {
        const s = b.dataset.slot!;
        if (mode === 'load' && !metas[s]) return;
        b.textContent = '…';
        if (mode === 'save') { await this.app.save(s); this.openSlots('save'); }
        else { await this.app.load(s); this.closeModal(); this.closePanel(); }
      };
    });
    (this.modal.querySelector('#slBack') as HTMLElement).onclick = () => this.openMenu();
  }

  openKingdoms(): void {
    const render = () => {
      const g = this.app.game;
      const ks = g.kingdoms.slice().sort((a, b) => b.pop - a.pop);
      let rows = '';
      for (const k of ks) {
        rows += `<div class="row" data-k="${k.id}">${this.flag(k)}<span class="grow"><b>${esc(g.kName(k))}</b><br><span class="sub">${SPECIES[k.species].name} · ${k.cities.length} cities · ${k.soldiers} soldiers</span></span>
          ${k.wars ? `<span class="tag war">⚔ ${k.wars}</span>` : ''}<span class="tag era">${ERAS[k.era].short}</span><span class="tag">👥 ${k.pop}</span></div>`;
      }
      const fallen = g.allKingdoms.filter(k => !k.alive).slice(-8).reverse().map(k => `<div class="row" data-k="${k.id}">${this.flag(k)}<span class="grow sub">${esc(g.kName(k))} — fell ${k.diedYear}</span></div>`).join('');
      return `<h1>👑 Kingdoms (${ks.length})</h1><div class="list">${rows || '<div class="sub">No civilizations yet. Use the Life tab to spawn people or found a village.</div>'}</div>${fallen ? `<h3>Fallen</h3><div class="list">${fallen}</div>` : ''}`;
    };
    const bind = () => this.modal.querySelectorAll<HTMLElement>('[data-k]').forEach(r => r.onclick = () => {
      const k = this.app.game.kingdomById.get(Number(r.dataset.k));
      if (k) { this.closeModal(); this.showPanel('kingdom', k); if (k.capital) this.app.renderer.centerOn(k.capital.x, k.capital.y); }
    });
    this.openModal(render());
    bind();
    let t = 0;
    this.modalRefresh = () => { if (++t % 8 === 0 && !this.modal.matches(':hover')) { this.modal.innerHTML = `<button class="close">✕</button>` + render(); (this.modal.querySelector('.close') as HTMLElement).onclick = () => this.closeModal(); bind(); } };
  }

  openTechTree(k: Kingdom | null): void {
    if (!k) { this.toast('No kingdoms exist yet'); return; }
    const render = () => {
      const g = this.app.game;
      let cols = '';
      for (let e = 0; e < NUM_ERAS; e++) {
        const ec = ERAS[e].color;
        let cards = '';
        for (const t of TECHS) {
          if (t.era !== e) continue;
          const known = !!k.techs[t.idx];
          const cur = k.researching === t.idx;
          const avail = canResearch(k.techs, t.idx);
          const cls = known ? 'known' : cur ? 'cur' : avail ? 'avail' : 'locked';
          const prog = cur ? ` · ${Math.floor((k.progress / t.cost) * 100)}%` : '';
          cards += `<div class="tech ${cls}" data-t="${t.idx}" title="${esc(t.desc)}${t.req.length ? ' — needs ' + t.req.map(r => TECHS.find(x => x.id === r)!.name).join(', ') : ''}">${known ? '✔ ' : ''}${esc(t.name)}<small>${esc(t.desc)}${prog}</small></div>`;
        }
        cols += `<div class="era"><h4 style="background:${css(ec as any, 0.3)}">${ERAS[e].name}</h4>${cards}</div>`;
      }
      const opts = g.kingdoms.map(o => `<option value="${o.id}" ${o === k ? 'selected' : ''}>${esc(g.kName(o))}</option>`).join('');
      return `<h1>🧪 Technology</h1><div class="btns" style="margin:0 0 8px"><select id="ttK" class="btn">${opts}</select></div>
        <div class="sub">${k.player ? 'You lead this nation: tap an available technology to <b>research it next</b>. (The 📜 Gift Technology power still grants techs instantly.)' : 'Green = known · gold = researching / available. Tap an available technology to grant it as a divine gift.'}</div>
        <div class="tree">${cols}</div>`;
    };
    const bind = () => {
      const sel = this.modal.querySelector('#ttK') as HTMLSelectElement | null;
      if (sel) sel.onchange = () => { const nk = this.app.game.kingdomById.get(Number(sel.value)); if (nk) this.openTechTree(nk); };
      this.modal.querySelectorAll<HTMLElement>('[data-t]').forEach(c => c.onclick = () => {
        const idx = Number(c.dataset.t);
        if (k.alive && k.player) { this.toast(cmdResearch(this.app.game, k, idx)); this.openTechTree(k); return; }
        if (k.alive && canResearch(k.techs, idx)) { this.app.game.learnTech(k, idx, true); this.openTechTree(k); }
      });
    };
    this.openModal(render());
    this.modal.style.width = 'min(1100px, 100%)';
    bind();
    const tree = () => this.modal.querySelector('.tree') as HTMLElement | null;
    let t = 0;
    this.modalRefresh = () => {
      if (++t % 8 !== 0 || this.modal.matches(':hover')) return;
      const sl = tree()?.scrollLeft || 0;
      this.modal.innerHTML = `<button class="close">✕</button>` + render();
      (this.modal.querySelector('.close') as HTMLElement).onclick = () => { this.modal.style.width = ''; this.closeModal(); };
      bind();
      const tr = tree();
      if (tr) tr.scrollLeft = sl;
    };
    (this.modal.querySelector('.close') as HTMLElement).onclick = () => { this.modal.style.width = ''; this.closeModal(); };
    // scroll to current era
    const tr = tree();
    if (tr) tr.scrollLeft = Math.max(0, (k.era - 1) * 158);
  }

  openHistory(): void {
    let filter = 'all';
    const groups: Record<string, string[]> = {
      war: ['war', 'peace', 'conquest', 'fall', 'revolt', 'ally', 'nuke', 'treaty', 'split'],
      tech: ['era', 'eraFirst', 'tech', 'space', 'ascend', 'building', 'infra'],
      world: ['disaster', 'monster', 'ruin', 'colony'],
      realm: ['kingdom', 'city', 'king', 'hero'],
    };
    const render = () => {
      const g = this.app.game;
      const items = g.history.slice().reverse().filter(e => filter === 'all' || groups[filter].includes(e.kind)).slice(0, 150);
      const tabs = ['all', 'war', 'tech', 'realm', 'world'].map(f => `<button data-f="${f}" class="${f === filter ? 'on' : ''}">${{ all: 'All', war: 'War & politics', tech: 'Technology', realm: 'Realms', world: 'World' }[f]}</button>`).join('');
      const rows = items.map(e => `<div class="row" ${e.x >= 0 ? `data-x="${e.x}" data-y="${e.y}"` : ''}><span class="swatch" style="background:${e.color}"></span><span class="tag">${e.year}</span><span class="grow" style="white-space:normal">${esc(e.text)}</span></div>`).join('');
      return `<h1>📜 History</h1><div class="tabs">${tabs}</div><div class="list">${rows || '<div class="sub">Nothing has happened yet.</div>'}</div>`;
    };
    const bind = () => {
      this.modal.querySelectorAll<HTMLElement>('[data-f]').forEach(b => b.onclick = () => { filter = b.dataset.f!; redraw(); });
      this.modal.querySelectorAll<HTMLElement>('[data-x]').forEach(r => r.onclick = () => { this.closeModal(); this.app.renderer.centerOn(Number(r.dataset.x), Number(r.dataset.y), 10); });
    };
    const redraw = () => { this.modal.innerHTML = `<button class="close">✕</button>` + render(); (this.modal.querySelector('.close') as HTMLElement).onclick = () => this.closeModal(); bind(); };
    this.openModal(render());
    bind();
  }

  openStats(): void {
    const render = () => {
      const g = this.app.game;
      const kings = g.kingdoms.slice().sort((a, b) => b.pop - a.pop).slice(0, 8);
      const eraRows = kings.map(k => `<div class="row">${this.flag(k)}<span class="grow">${esc(g.kName(k))}</span>${k.eraYears.map((y, i) => (y !== undefined && i > 0 ? `<span class="tag" title="${ERAS[i].name}">${ERAS[i].short} ${y}</span>` : '')).join('')}</div>`).join('');
      return `<h1>📊 World statistics</h1>
        <canvas id="chart" width="700" height="200" style="width:100%;height:200px;background:rgba(0,0,0,.2);border-radius:8px"></canvas>
        <div class="sub"><span style="color:#ffcf4a">■</span> population &nbsp; <span style="color:#6cf">■</span> kingdoms ×20 &nbsp; <span style="color:#9f6">■</span> most advanced era</div>
        <div class="grid2" style="margin-top:10px">
          <div>Year</div><div>${g.year}</div>
          <div>People</div><div>${g.personPop} (max ${g.laws.maxPop})</div>
          <div>Animals & monsters</div><div>${g.units.length - g.personPop}</div>
          <div>Buildings</div><div>${g.buildings.length}</div>
          <div>Births / deaths</div><div>${g.stats.births} / ${g.stats.deaths}</div>
          <div>Cities founded</div><div>${g.stats.citiesFounded}</div>
          <div>Wars declared</div><div>${g.stats.wars}</div>
          <div>Nuclear blasts</div><div>${g.stats.nukes}</div>
          <div>Global warming</div><div>+${(g.heat * 2).toFixed(2)}°</div>
        </div>
        <h3>Era milestones (year reached)</h3><div class="list">${eraRows || '<div class="sub">—</div>'}</div>`;
    };
    const draw = () => {
      const cv = this.modal.querySelector('#chart') as HTMLCanvasElement | null;
      if (!cv) return;
      const ctx = cv.getContext('2d')!;
      const h = this.app.game.popHistory;
      ctx.clearRect(0, 0, cv.width, cv.height);
      if (h.length < 2) return;
      const maxP = Math.max(10, ...h.map(p => p.pop));
      const W = cv.width, H = cv.height;
      const line = (fn: (p: typeof h[0]) => number, max: number, color: string) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        h.forEach((p, i) => { const x = (i / (h.length - 1)) * W, y = H - 6 - (fn(p) / max) * (H - 12); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
        ctx.stroke();
      };
      line(p => p.pop, maxP, '#ffcf4a');
      line(p => p.kingdoms * 20, maxP, '#6cf');
      line(p => p.maxEra, 9, '#9f6');
    };
    this.openModal(render());
    draw();
    let t = 0;
    this.modalRefresh = () => { if (++t % 8 === 0) { this.modal.innerHTML = `<button class="close">✕</button>` + render(); (this.modal.querySelector('.close') as HTMLElement).onclick = () => this.closeModal(); draw(); } };
  }

  openLaws(): void {
    const g = this.app.game;
    const L = g.laws;
    const toggles: [keyof typeof L, string, string][] = [
      ['research', 'Technology research', 'Civilizations discover new technologies'],
      ['war', 'Wars', 'Kingdoms may declare war on each other'],
      ['nukes', 'Nuclear weapons', 'Atomic-age kingdoms may launch nukes'],
      ['rebellions', 'Rebellions', 'Disloyal cities can break away'],
      ['disasters', 'Natural disasters', 'Random disasters strike the world'],
      ['plague', 'Plague spreading', 'Diseases spread between creatures'],
      ['climate', 'Pollution & climate change', 'Industry pollutes and warms the planet'],
      ['oldAge', 'Old age', 'Creatures die of old age'],
      ['animals', 'Animal breeding', 'Wildlife reproduces'],
      ['dayNight', 'Day & night cycle', 'Cosmetic: nights, city lights'],
    ];
    const rows = toggles.map(([k, n, d]) => `<div class="law"><div><b>${n}</b><div class="d">${d}</div></div><div class="switch ${L[k] ? 'on' : ''}" data-law="${String(k)}"></div></div>`).join('');
    this.openModal(`<h1>⚖️ World laws</h1>${rows}
      <div class="law"><div><b>Research speed</b><div class="d">Multiplier on all research</div></div><div class="seg" id="lawRs">${[0.5, 1, 2, 4].map(v => `<button data-v="${v}" class="${L.researchSpeed === v ? 'on' : ''}">${v}×</button>`).join('')}</div></div>
      <div class="law" style="flex-wrap:wrap"><div><b>Nuclear doctrine</b><div class="d">How readily nations at war use nukes, missiles and bombers</div></div><div class="seg" id="lawNd">${['Restrained', 'Realistic', 'Trigger-happy'].map((n, v) => `<button data-v="${v}" class="${(L.nukeDoctrine ?? 1) === v ? 'on' : ''}">${n}</button>`).join('')}</div></div>
      <div class="law" style="flex-wrap:wrap"><div><b>Population limit</b><div class="d">Lower this on slower devices</div></div><div class="seg" id="lawPop">${[1500, 3000, 5000, 7500, 10000, 14000, 20000].map(v => `<button data-v="${v}" class="${L.maxPop === v ? 'on' : ''}">${v}</button>`).join('')}</div></div>`);
    this.modal.querySelectorAll<HTMLElement>('[data-law]').forEach(s => s.onclick = () => {
      const k = s.dataset.law as keyof typeof L;
      (L as any)[k] = !(L as any)[k];
      s.classList.toggle('on', !!L[k]);
    });
    this.modal.querySelectorAll<HTMLElement>('#lawRs button').forEach(b => b.onclick = () => { L.researchSpeed = Number(b.dataset.v); this.openLaws(); });
    this.modal.querySelectorAll<HTMLElement>('#lawPop button').forEach(b => b.onclick = () => { L.maxPop = Number(b.dataset.v); this.openLaws(); });
    this.modal.querySelectorAll<HTMLElement>('#lawNd button').forEach(b => b.onclick = () => { L.nukeDoctrine = Number(b.dataset.v); this.openLaws(); });
  }

  openHelp(): void {
    this.openModal(`<h1>❓ How to play</h1>
      <h3>Controls</h3>
      <div class="grid2">
        <div>Move</div><div>Drag with Inspect selected · right/middle-drag · WASD / arrows · two fingers</div>
        <div>Zoom</div><div>Mouse wheel · pinch · + / −</div>
        <div>Use a power</div><div>Pick a tool at the bottom, then tap or drag on the world</div>
        <div>Inspect</div><div>Tap units, buildings or cities with Inspect (🔍) selected</div>
        <div>Speed</div><div>Space to pause · 1–5 for speeds</div>
      </div>
      <h3>Civilizations</h3>
      <div class="sub">Spawn two or more people of the same species close together and they will found a village — or use a Village tool. Settlements gather food, chop wood, quarry stone, farm, build homes and expand their borders. Kingdoms send settlers, sail to new islands, make alliances and wage war.</div>
      <h3>Technology</h3>
      <div class="sub">Every kingdom researches its own tech tree across thirteen eras — Stone, Bronze, Iron, Medieval, Renaissance, Industrial, Modern, Atomic, Information, Space, Interplanetary, Singularity and Galactic. Each discovery changes the world: farms, roads, ships, castles, muskets, factories, electric city lights at night, tanks, air raids, cruise and nuclear missiles, rockets, railguns, orbital strikes, energy shields, plasma weapons, titan walkers and finally colony ships to the stars. Buildings are rebuilt in the style of each new era. Industry pollutes and warms the climate unless renewable or fusion power is discovered. Use the 🧪 tech tree to watch progress or grant technologies.</div>
      <h3>Nations & diplomacy</h3>
      <div class="sub">Nations sign trade agreements, non-aggression pacts and alliances, and end wars with named peace treaties where the loser can cede cities and pay reparations. Close allies and small friendly neighbours merge into one nation, and towns that grow close together become one great city, so huge countries can form. Once radio is invented they found a World Council that brokers peace. Atomic powers test bombs and build arsenals; deterrence keeps most wars conventional, but a desperate nation may strike first and be answered in kind, causing nuclear winter. The council can pass a nuclear weapons ban that disarms its signatories, and a climate accord that cuts pollution. Open 🌐 World affairs to follow it all, including the doomsday clock.</div>
      <h3>Lead a nation</h3>
      <div class="sub">Open any nation (👑 or tap one of its cities) and press 🎮 Take command. A command bar appears: send your army to attack a city, call in air raids, cruise missiles, orbital strikes or nukes, 🚩 claim unsettled land by dragging over it, 🏴 take over foreign cities without a war (unhappy ones defect, others you can buy), found new cities, mobilize, pick what to research, and in Diplomacy make peace, alliances, trade deals, pacts, ask a nation to unite with yours or demand that a weaker one submits. Everything else — farming, building, roads — runs on its own.</div>
      <h3>Modern war</h3>
      <div class="sub">From the Modern Age nations at war bomb each other's cities, then fire cruise missiles. Nuclear weapons are devastating: the fireball erases cities, firestorms spread, a crater lake forms and radioactive fallout drifts downwind for years. Hydrogen and antimatter bombs are far bigger. Missile defense and energy shields can shoot warheads down. Change how readily nations go nuclear in ⚖️ World laws.</div>
      <h3>Cities & roads</h3>
      <div class="sub">After the Wheel, towns lay out street grids and build in city blocks. Nations connect every city to its neighbours and the capital with roads, link friendly nations with international roads, then build railways in the Industrial Age and two-lane motorways in the Modern Age. Zoom in to watch carts, cars, trucks, buses, trains and hovercars.</div>
      <h3>Map modes</h3>
      <div class="sub">🗺️ cycles normal, political, technology-era and pollution maps.</div>`);
  }
}

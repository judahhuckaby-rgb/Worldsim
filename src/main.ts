// Entry point: app state, game loop, platform glue.
import './ui/style.css';
import { Game, suggestedMaxPop } from './sim/game';
import { generateWorld } from './sim/worldgen';
import { TPS } from './sim/defs';
import { Renderer } from './render/renderer';
import { UI, AppLike, NewWorldOpts, WORLD_SIZES } from './ui/ui';
import { Input } from './ui/input';
import { Tool, ToolCtx } from './ui/tools';
import { saveSlot, loadSlot, listSlots } from './sim/save';
import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

const isMobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && window.innerWidth < 1100);

class App implements AppLike {
  game: Game;
  renderer: Renderer;
  ui: UI;
  input: Input;
  speed = 1;
  paused = false;
  tool: Tool | null = null;
  brush = 2;
  showMinimap = !isMobile;
  toolCtx: ToolCtx;
  acc = 0;
  last = performance.now();
  uiT = 0;
  autosaveT = 0;
  simMs = 0;

  constructor() {
    const canvas = document.getElementById('view') as HTMLCanvasElement;
    const root = document.getElementById('ui')!;
    const size = WORLD_SIZES[isMobile ? 1 : 2];
    this.game = App.makeGame({ w: size.w, h: size.h, type: 'continents', seed: Math.floor(Math.random() * 1e9), civs: 8, animals: true, startEra: 0 });
    this.renderer = new Renderer(canvas, this.game);
    this.toolCtx = { toast: (m: string) => this.ui.toast(m), pickKingdom: { first: null } };
    this.ui = new UI(this, root);
    this.ui.defaultSize = isMobile ? 1 : 2;
    this.input = new Input(this, this.ui, canvas);
    this.ui.minimap.classList.toggle('hidden', !this.showMinimap);
    window.addEventListener('resize', () => { this.renderer.resize(); this.renderer.clampCam(); });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.save('auto').catch(() => {});
      this.last = performance.now();
    });
    this.ui.toast('Welcome! Watch the tribes grow — or pick a power below and play god.');
    this.offerContinue();
    this.bindPlatform();
    requestAnimationFrame(t => this.frame(t));
  }

  /** If an autosave exists, offer to continue it. */
  async offerContinue(): Promise<void> {
    try {
      const slots = await listSlots();
      const auto = slots['auto'];
      if (!auto || auto.year < 3) return;
      this.ui.offerContinue(auto, () => this.load('auto'));
    } catch { /* storage unavailable */ }
  }

  bindPlatform(): void {
    this.ui.canQuit = Capacitor.isNativePlatform();
    this.ui.onQuit = () => { this.save('auto').finally(() => CapApp.exitApp()); };
    if (!Capacitor.isNativePlatform()) return;
    CapApp.addListener('backButton', () => {
      if (this.ui.modalOpen) this.ui.closeModal();
      else if (this.ui.panelKind) this.ui.closePanel();
      else if (this.tool) this.selectTool(null);
      else this.ui.openMenu();
    });
    CapApp.addListener('pause', () => { this.save('auto').catch(() => {}); });
  }

  static makeGame(o: NewWorldOpts): Game {
    const world = generateWorld({ w: o.w, h: o.h, seed: o.seed, type: o.type });
    const g = new Game(world, o.seed);
    g.mapType = o.type;
    g.laws.startEra = o.startEra;
    g.laws.maxPop = suggestedMaxPop(world.n, isMobile);
    g.populateWorld(o.civs, o.animals);
    return g;
  }

  setGame(g: Game): void {
    this.game = g;
    this.renderer.setGame(g);
    this.toolCtx.pickKingdom.first = null;
    this.ui.mmImg = null;
    this.acc = 0;
  }

  newWorld(o: NewWorldOpts): void {
    this.setGame(App.makeGame(o));
    this.ui.toast(`A new world is born (seed ${o.seed})`);
  }

  async save(slot: string): Promise<void> {
    const ok = await saveSlot(slot, this.game);
    if (slot !== 'auto') this.ui.toast(ok ? `World saved to slot ${slot}` : 'Saving failed (storage full?)');
  }

  async load(slot: string): Promise<void> {
    try {
      const g = await loadSlot(slot);
      if (!g) { this.ui.toast('Nothing saved there'); return; }
      this.setGame(g);
      this.ui.toast(`Loaded world — year ${g.year}`);
    } catch (e) {
      console.error(e);
      this.ui.toast('That save could not be loaded');
    }
  }

  setSpeed(s: number): void {
    this.speed = s;
    this.paused = false;
  }

  togglePause(): void {
    this.paused = !this.paused;
  }

  selectTool(t: Tool | null): void {
    this.tool = t;
    this.toolCtx.pickKingdom.first = null;
    if (t && t.mode === 'click') this.renderer.hover.square = true;
    this.ui.syncTool();
  }

  frame(now: number): void {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.input.pan(dt);
    this.input.tick(now);
    // fixed-step simulation, time-budgeted so slow devices degrade gracefully
    if (!this.paused) {
      this.acc += dt * TPS * this.speed;
      const start = performance.now();
      const budget = isMobile ? 18 : 22;
      let n = 0;
      while (this.acc >= 1) {
        this.game.step();
        this.acc -= 1;
        n++;
        if (performance.now() - start > budget) { this.acc = Math.min(this.acc, TPS * this.speed * 0.25); break; }
      }
      this.simMs = this.simMs * 0.9 + (performance.now() - start) * 0.1;
    }
    try {
      this.renderer.render(dt);
    } catch (e) {
      console.error(e);
    }
    if (now - this.uiT > 250) {
      this.uiT = now;
      this.ui.update();
    }
    this.ui.updateMinimap(now);
    if (now - this.autosaveT > 180000) {
      this.autosaveT = now;
      if (this.game.year > 2) this.save('auto').catch(() => {});
    }
    requestAnimationFrame(t => this.frame(t));
  }
}

function boot(): void {
  try {
    (window as any).app = new App();
  } catch (e) {
    console.error(e);
    document.body.innerHTML = `<pre style="color:#f88;padding:20px;white-space:pre-wrap">WorldSim failed to start:\n${(e as Error).stack || e}</pre>`;
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

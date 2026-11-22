// Pointer / touch / keyboard input on the world canvas.
import type { AppLike } from './ui';
import type { UI } from './ui';

interface Ptr { id: number; x: number; y: number; sx: number; sy: number; button: number; type: string; }

export class Input {
  app: AppLike;
  ui: UI;
  canvas: HTMLCanvasElement;
  ptrs = new Map<number, Ptr>();
  mode: '' | 'pan' | 'tool' | 'pinch' | 'tap' = '';
  pinchD = 0;
  pinchCX = 0;
  pinchCY = 0;
  lastApply = 0;
  lastWorld = { x: 0, y: 0 };
  keys = new Set<string>();
  applied = false;

  constructor(app: AppLike, ui: UI, canvas: HTMLCanvasElement) {
    this.app = app;
    this.ui = ui;
    this.canvas = canvas;
    canvas.addEventListener('pointerdown', e => this.down(e));
    canvas.addEventListener('pointermove', e => this.move(e));
    canvas.addEventListener('pointerup', e => this.up(e));
    canvas.addEventListener('pointercancel', e => this.up(e, true));
    canvas.addEventListener('pointerleave', () => { if (!this.ptrs.size) this.app.renderer.hover.show = false; });
    canvas.addEventListener('wheel', e => this.wheel(e), { passive: false });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    window.addEventListener('keydown', e => this.key(e, true));
    window.addEventListener('keyup', e => this.key(e, false));
    window.addEventListener('blur', () => this.keys.clear());
  }

  private world(e: { x: number; y: number }): { x: number; y: number } {
    return this.app.renderer.screenToWorld(e.x, e.y);
  }

  private pos(e: PointerEvent): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  down(e: PointerEvent): void {
    this.canvas.setPointerCapture(e.pointerId);
    const p = this.pos(e);
    this.ptrs.set(e.pointerId, { id: e.pointerId, x: p.x, y: p.y, sx: p.x, sy: p.y, button: e.button, type: e.pointerType });
    if (this.ptrs.size === 2) {
      this.mode = 'pinch';
      const [a, b] = Array.from(this.ptrs.values());
      this.pinchD = Math.hypot(a.x - b.x, a.y - b.y);
      this.pinchCX = (a.x + b.x) / 2;
      this.pinchCY = (a.y + b.y) / 2;
      return;
    }
    if (this.ptrs.size > 2) return;
    if (e.button === 1 || e.button === 2) { this.mode = 'pan'; return; }
    const tool = this.app.tool;
    if (!tool) { this.mode = 'tap'; return; }
    this.mode = 'tool';
    this.applied = false;
    // on touch, wait a moment so a second finger can turn this into a pinch
    if (e.pointerType === 'mouse') this.applyAt(p, true);
    else this.lastApply = performance.now();
  }

  move(e: PointerEvent): void {
    const p = this.pos(e);
    const R = this.app.renderer;
    const wp = this.world(p);
    R.hover.x = wp.x;
    R.hover.y = wp.y;
    R.hover.r = this.app.brush;
    R.hover.show = !!this.app.tool && e.pointerType === 'mouse';
    R.hover.square = !!this.app.tool && this.app.tool.mode === 'click';
    const ptr = this.ptrs.get(e.pointerId);
    if (!ptr) return;
    const dx = p.x - ptr.x, dy = p.y - ptr.y;
    ptr.x = p.x;
    ptr.y = p.y;
    if (this.mode === 'pinch' && this.ptrs.size >= 2) {
      const [a, b] = Array.from(this.ptrs.values());
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      if (this.pinchD > 0) R.zoomAt(cx, cy, d / this.pinchD);
      R.cam.x -= ((cx - this.pinchCX) * R.dpr) / R.cam.zoom;
      R.cam.y -= ((cy - this.pinchCY) * R.dpr) / R.cam.zoom;
      R.clampCam();
      this.pinchD = d;
      this.pinchCX = cx;
      this.pinchCY = cy;
      return;
    }
    if (this.mode === 'tap' && Math.hypot(p.x - ptr.sx, p.y - ptr.sy) > 8) this.mode = 'pan';
    if (this.mode === 'pan') {
      R.cam.x -= (dx * R.dpr) / R.cam.zoom;
      R.cam.y -= (dy * R.dpr) / R.cam.zoom;
      R.clampCam();
      return;
    }
    if (this.mode === 'tool') {
      const tool = this.app.tool;
      if (!tool) return;
      if (tool.mode === 'click') return;
      if (!this.applied && ptr.type !== 'mouse') this.applyAt(p, true);
      else this.applyAt(p, false);
    }
  }

  up(e: PointerEvent, cancel = false): void {
    const ptr = this.ptrs.get(e.pointerId);
    this.ptrs.delete(e.pointerId);
    if (!ptr) return;
    if (this.mode === 'pinch') {
      if (this.ptrs.size === 0) this.mode = '';
      else this.mode = 'pan';
      return;
    }
    if (!cancel) {
      if (this.mode === 'tap') {
        const wp = this.world(ptr);
        this.ui.inspect(wp.x, wp.y);
      } else if (this.mode === 'tool' && !this.applied && ptr.type !== 'mouse') {
        this.applyAt(ptr, true);
      }
    }
    if (this.ptrs.size === 0) this.mode = '';
  }

  /** Called each frame: continuous application while held still. */
  tick(now: number): void {
    if (this.mode !== 'tool' || this.ptrs.size !== 1) return;
    const tool = this.app.tool;
    if (!tool || tool.mode === 'click') return;
    const ptr = Array.from(this.ptrs.values())[0];
    if (!this.applied && ptr.type !== 'mouse') {
      if (now - this.lastApply > 110) this.applyAt(ptr, true);
      return;
    }
    if (now - this.lastApply >= (tool.interval ?? 70)) this.applyAt(ptr, true);
  }

  private applyAt(p: { x: number; y: number }, force: boolean): void {
    const tool = this.app.tool;
    if (!tool) return;
    const now = performance.now();
    if (tool.mode === 'click' && this.applied) return;
    if (!force && now - this.lastApply < (tool.interval ?? 40)) return;
    const wp = this.world(p);
    const g = this.app.game;
    if (wp.x < 0 || wp.y < 0 || wp.x >= g.world.w || wp.y >= g.world.h) return;
    // interpolate brush strokes for smooth painting
    if (tool.mode === 'brush' && this.applied) {
      const dx = wp.x - this.lastWorld.x, dy = wp.y - this.lastWorld.y;
      const d = Math.hypot(dx, dy);
      const step = Math.max(0.5, this.app.brush * 0.6);
      const n = Math.min(30, Math.floor(d / step));
      for (let i = 1; i <= n; i++) tool.apply(g, this.lastWorld.x + (dx * i) / (n + 1), this.lastWorld.y + (dy * i) / (n + 1), this.app.brush, this.app.toolCtx);
    }
    tool.apply(g, wp.x, wp.y, this.app.brush, this.app.toolCtx);
    this.lastWorld = wp;
    this.lastApply = now;
    this.applied = true;
  }

  wheel(e: WheelEvent): void {
    e.preventDefault();
    const p = { x: e.offsetX, y: e.offsetY };
    const f = Math.pow(1.0018, -e.deltaY * (e.deltaMode === 1 ? 30 : 1));
    this.app.renderer.zoomAt(p.x, p.y, f);
  }

  key(e: KeyboardEvent, down: boolean): void {
    const t = e.target as HTMLElement;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
    const k = e.key.toLowerCase();
    if (down) this.keys.add(k); else this.keys.delete(k);
    if (!down) return;
    const R = this.app.renderer;
    switch (k) {
      case ' ': this.app.togglePause(); this.ui.syncSpeed(); e.preventDefault(); break;
      case '1': this.app.setSpeed(1); this.ui.syncSpeed(); break;
      case '2': this.app.setSpeed(2); this.ui.syncSpeed(); break;
      case '3': this.app.setSpeed(5); this.ui.syncSpeed(); break;
      case '4': this.app.setSpeed(10); this.ui.syncSpeed(); break;
      case '5': this.app.setSpeed(20); this.ui.syncSpeed(); break;
      case '+': case '=': R.zoomAt(R.vw / 2 / R.dpr, R.vh / 2 / R.dpr, 1.25); break;
      case '-': case '_': R.zoomAt(R.vw / 2 / R.dpr, R.vh / 2 / R.dpr, 0.8); break;
      case 'escape':
        if (this.ui.modalOpen) this.ui.closeModal();
        else if (this.app.tool) this.app.selectTool(null);
        else this.ui.closePanel();
        break;
      case '[': this.app.brush = Math.max(1, this.app.brush - 1); this.ui.syncBrush(); break;
      case ']': this.app.brush = Math.min(16, this.app.brush + 1); this.ui.syncBrush(); break;
      case 'm': this.ui.cycleMode(); break;
      case 'f11': break;
    }
  }

  /** Keyboard panning, per frame. */
  pan(dt: number): void {
    const R = this.app.renderer;
    const s = (600 * dt * R.dpr) / R.cam.zoom;
    let moved = false;
    if (this.keys.has('w') || this.keys.has('arrowup')) { R.cam.y -= s; moved = true; }
    if (this.keys.has('s') || this.keys.has('arrowdown')) { R.cam.y += s; moved = true; }
    if (this.keys.has('a') || this.keys.has('arrowleft')) { R.cam.x -= s; moved = true; }
    if (this.keys.has('d') || this.keys.has('arrowright')) { R.cam.x += s; moved = true; }
    if (moved) R.clampCam();
  }
}

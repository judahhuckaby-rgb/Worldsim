// "Take command of a nation": a compact command bar with war, diplomacy and expansion orders.
import type { UI, AppLike } from './ui';
import type { Game } from '../sim/game';
import { Kingdom } from '../sim/entities';
import { RES, RES_ICONS } from '../sim/terrain';
import { eraName, TECHS } from '../sim/tech';
import { nukeBanned } from '../sim/politics';
import { cityAt, cmdAttack, cmdAirRaid, cmdMissiles, cmdOrbital, cmdNuke, cmdFoundCity, cmdMobilize, propose, Proposal } from '../sim/command';

function esc(s: string): string {
  return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
}

interface Order { id: string; icon: string; name: string; ok: (k: Kingdom, g: Game) => string | null; run: () => void }

export class CommandUI {
  ui: UI;
  app: AppLike;
  el: HTMLElement;
  collapsed = false;
  private t = 0;
  private sig = '';
  private cooldown = new Map<string, number>();

  constructor(ui: UI, root: HTMLElement) {
    this.ui = ui;
    this.app = ui.app;
    this.el = document.createElement('div');
    this.el.id = 'cmdbar';
    this.el.className = 'hidden';
    root.append(this.el);
  }

  get k(): Kingdom | null {
    for (const k of this.app.game.allKingdoms) if (k.player) return k;
    return null;
  }

  take(k: Kingdom): void {
    const g = this.app.game;
    for (const o of g.allKingdoms) o.player = false;
    k.player = true;
    this.collapsed = false;
    this.sig = '';
    this.ui.toast(`🎮 You now lead ${g.kName(k)}. Use the command bar (bottom left) to give orders.`);
    if (k.capital) this.app.renderer.centerOn(k.capital.x, k.capital.y);
    this.render(true);
  }

  release(): void {
    const k = this.k;
    if (k) k.player = false;
    this.el.classList.add('hidden');
    if (this.app.tool && this.app.tool.cat === 'cmd') this.app.selectTool(null);
    this.ui.toast('You stepped down — the nation governs itself again');
  }

  update(): void {
    if (++this.t % 2 === 0) this.render();
  }

  /** Select a one-shot "tap a target" tool. */
  private pick(name: string, desc: string, fn: (g: Game, x: number, y: number) => string, keep = false): void {
    this.app.selectTool({
      id: 'cmd-' + name, cat: 'cmd', name, icon: '', mode: 'click', desc,
      apply: (g, x, y) => {
        const msg = fn(g, x, y);
        this.ui.toast(msg);
        if (!keep) this.app.selectTool(null);
        this.render(true);
      },
    });
  }

  private orders(): Order[] {
    const g = () => this.app.game;
    const kk = () => this.k!;
    return [
      { id: 'attack', icon: '⚔️', name: 'Attack', ok: () => (g().laws.war ? null : 'Wars are disabled in the world laws'),
        run: () => this.pick('Attack a city', 'Tap a foreign city: your army marches on it (declares war if needed)', (gg, x, y) => cmdAttack(gg, kk(), cityAt(gg, x, y))) },
      { id: 'air', icon: '✈️', name: 'Air raid', ok: k => (k.caps.air < 0 ? 'Needs Flight' : !k.cities.some(c => c.find('airbase')) ? 'Needs an Airbase' : k.wars === 0 ? 'Only at war' : null),
        run: () => this.pick('Air raid', 'Tap an enemy city to bomb it', (gg, x, y) => cmdAirRaid(gg, kk(), cityAt(gg, x, y)), true) },
      { id: 'missile', icon: '🚀', name: 'Missiles', ok: k => (!k.caps.cruise ? 'Needs Rocketry' : k.wars === 0 ? 'Only at war' : null),
        run: () => this.pick('Cruise missiles', 'Tap an enemy city to strike it', (gg, x, y) => cmdMissiles(gg, kk(), cityAt(gg, x, y)), true) },
      { id: 'orbital', icon: '🛰️', name: 'Orbital', ok: k => (!k.caps.orbital ? 'Needs Orbital Weapons' : !k.cities.some(c => c.find('spaceport')) ? 'Needs a Spaceport' : k.wars === 0 ? 'Only at war' : null),
        run: () => this.pick('Orbital strike', 'Tap an enemy city to drop kinetic rods from orbit', (gg, x, y) => cmdOrbital(gg, kk(), cityAt(gg, x, y)), true) },
      { id: 'nuke', icon: '☢️', name: 'Nuke', ok: (k, gg) => (!gg.laws.nukes ? 'Disabled in world laws' : !k.caps.nukes ? 'Needs Nuclear Weapons' : nukeBanned(gg, k) ? 'You signed the ban (tap to withdraw)' : k.warheads <= 0 ? 'No warheads yet' : null),
        run: () => this.pick('Nuclear strike', 'Tap a city to launch a nuclear missile at it. There is no undo.', (gg, x, y) => cmdNuke(gg, kk(), cityAt(gg, x, y))) },
      { id: 'city', icon: '🏙️', name: 'New city', ok: () => null,
        run: () => this.pick('Found a city', 'Tap empty land: settlers walk there and found a new city', (gg, x, y) => cmdFoundCity(gg, kk(), x, y)) },
      { id: 'mobilize', icon: '🎖️', name: 'Mobilize', ok: () => null, run: () => { this.ui.toast(cmdMobilize(g(), kk())); this.render(true); } },
      { id: 'research', icon: '🧪', name: 'Research', ok: () => null, run: () => this.ui.openTechTree(kk()) },
      { id: 'diplo', icon: '🤝', name: 'Diplomacy', ok: () => null, run: () => this.openDiplomacy() },
    ];
  }

  render(force = false): void {
    const k = this.k;
    const g = this.app.game;
    if (!k) { this.el.classList.add('hidden'); return; }
    this.el.classList.remove('hidden');
    const cur = k.researching >= 0 ? TECHS[k.researching] : null;
    const pct = cur ? Math.min(99, Math.floor((k.progress / cur.cost) * 100)) : 100;
    const orders = this.orders();
    const states = orders.map(o => (k.alive ? o.ok(k, g) : 'Fallen'));
    const sig = [k.alive, this.collapsed, g.kName(k), k.pop, k.soldiers, k.cities.length, k.wars, k.warheads, Math.floor(k.res[RES.GOLD]), Math.floor(k.res[RES.METAL]), pct, k.mobilizeT > g.tick, states.join('|')].join(',');
    if (!force && sig === this.sig) return;
    this.sig = sig;
    if (!k.alive) {
      this.el.innerHTML = `<div class="cmdhead">${this.ui.flag(k)}<b>${esc(g.kName(k))}</b> has fallen.</div><div class="btns"><button class="btn" data-c="release">OK</button></div>`;
      this.bind(orders);
      return;
    }
    const head = `<div class="cmdhead" data-c="collapse" title="Collapse / expand">${this.ui.flag(k)}<b>${esc(g.kName(k))}</b><span class="tag era">${eraName(k.era)}</span><span class="grow"></span><span>${this.collapsed ? '▴' : '▾'}</span></div>`;
    if (this.collapsed) { this.el.innerHTML = head; this.bind(orders); return; }
    const wars = g.kingdoms.filter(o => k.atWar(o)).map(o => `${this.ui.flag(o, 10)} ${esc(o.baseName)}`).join(' ');
    this.el.innerHTML = `${head}
      <div class="cmdstats">👥 ${k.pop} · 🏘 ${k.cities.length} · 🪖 ${k.soldiers}${k.mobilizeT > g.tick ? ' (mobilized)' : ''} · ${RES_ICONS[RES.GOLD]} ${Math.floor(k.res[RES.GOLD])} · ${RES_ICONS[RES.METAL]} ${Math.floor(k.res[RES.METAL])}${k.caps.nukes ? ` · ☢ ${k.warheads}` : ''}</div>
      <div class="cmdstats">🧪 ${cur ? `${esc(cur.name)} ${pct}%` : 'All known'}${wars ? ` · ⚔ ${wars}` : ' · at peace'}</div>
      <div class="cmdbtns">${orders.map((o, i) => `<button class="${states[i] ? 'off' : ''}${o.id === 'nuke' ? ' nukebtn' : ''}" data-c="${o.id}" title="${esc(o.name)}${states[i] ? ' — ' + esc(states[i]!) : ''}">${o.icon}<span>${o.name}</span></button>`).join('')}
        <button data-c="release" title="Stop commanding this nation">🏳️<span>Step down</span></button></div>`;
    this.bind(orders);
  }

  private bind(orders: Order[]): void {
    this.el.querySelectorAll<HTMLElement>('[data-c]').forEach(b => b.onclick = () => {
      const id = b.dataset.c!;
      if (id === 'collapse') { this.collapsed = !this.collapsed; this.render(true); return; }
      if (id === 'release') { this.release(); return; }
      const o = orders.find(x => x.id === id);
      const k = this.k;
      if (!o || !k) return;
      const why = o.ok(k, this.app.game);
      if (why && !(o.id === 'nuke' && nukeBanned(this.app.game, k))) { this.ui.toast(`${o.name}: ${why}`); return; }
      o.run();
    });
  }

  openDiplomacy(): void {
    const g = this.app.game;
    const k = this.k;
    if (!k) return;
    const render = () => {
      const rows = g.kingdoms.filter(o => o !== k).map(o => {
        const r = k.relation(o), ro = o.relation(k);
        const st = r.war ? '<span class="tag war">War</span>' : r.ally ? '<span class="tag ally">Ally</span>' : '';
        const tags = `${r.trade ? '📜' : ''}${r.nap > g.tick ? '🕊' : ''}${o.warheads > 0 ? '☢' : ''}`;
        const btn = (p: Proposal, label: string, cls = '') => `<button class="btn ${cls}" data-p="${p}" data-o="${o.id}">${label}</button>`;
        const acts = r.war
          ? btn('peace', '☮ Offer peace', 'primary')
          : [btn('war', '⚔ War', 'danger'), r.ally ? '' : btn('alliance', '🤝 Alliance'), r.trade ? '' : btn('trade', '📜 Trade'), r.nap > g.tick ? '' : btn('nap', '🕊 Pact')].join('');
        return `<div class="drow"><div class="row">${this.ui.flag(o)}<span class="grow"><b>${esc(g.kName(o))}</b><br><span class="sub">${eraName(o.era)} · 👥 ${o.pop} · opinion of you ${Math.round(ro.opinion)}</span></span>${st}${tags}</div>
          <div class="btns">${acts}${btn('gift', '🎁 Gift gold')}</div></div>`;
      }).join('');
      return `<h1>🤝 Diplomacy — ${esc(g.kName(k))}</h1><div class="sub">Proposals succeed more often with nations that like you. Gifts improve opinion; breaking a pact angers everyone.</div><div class="list">${rows || '<div class="sub">No other nations exist</div>'}</div>`;
    };
    const bind = () => this.ui.modal.querySelectorAll<HTMLElement>('[data-p]').forEach(b => b.onclick = () => {
      const o = g.kingdomById.get(Number(b.dataset.o));
      const kk = this.k;
      if (!o || !kk) return;
      const p = b.dataset.p as Proposal;
      const key = `${o.id}:${p}`;
      const last = this.cooldown.get(key) ?? -1e9;
      if (p !== 'gift' && p !== 'war' && g.tick - last < 60) { this.ui.toast('Give them some time before asking again'); return; }
      this.cooldown.set(key, g.tick);
      this.ui.toast(propose(g, kk, o, p));
      this.ui.modal.innerHTML = `<button class="close">✕</button>` + render();
      (this.ui.modal.querySelector('.close') as HTMLElement).onclick = () => this.ui.closeModal();
      bind();
    });
    this.ui.openModal(render());
    bind();
  }
}

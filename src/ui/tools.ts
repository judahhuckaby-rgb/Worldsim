// God powers / tools.
import type { Game } from '../sim/game';
import { nukeAt } from '../sim/game';
import { T, F, TER, treeFor, isTree, isRoad } from '../sim/terrain';
import { UK, UDEF, TPY } from '../sim/defs';
import { SPECIES } from '../sim/species';
import { startDisaster, spawnMeteor, alienInvasion, plagueOutbreak } from '../sim/disasters';
import { canResearch, NUM_TECH, TECHS } from '../sim/tech';
import { rebel } from '../sim/ai_city';
import { refreshStats } from '../sim/ai_units';
import { Kingdom } from '../sim/entities';

export type ToolMode = 'brush' | 'spray' | 'click';

export interface Tool {
  id: string;
  cat: string;
  name: string;
  icon: string;          // emoji or 'sprite:...' / 'color:#hex'
  mode: ToolMode;
  desc: string;
  apply: (g: Game, x: number, y: number, r: number, ctx: ToolCtx) => void;
  interval?: number;     // ms between applications while held
}

export interface ToolCtx {
  toast: (msg: string) => void;
  pickKingdom: { first: Kingdom | null };
}

export const CATEGORIES = [
  { id: 'terrain', name: 'Terrain', icon: '⛰️' },
  { id: 'life', name: 'Life', icon: '🧬' },
  { id: 'nature', name: 'Nature', icon: '🌪️' },
  { id: 'powers', name: 'Powers', icon: '✨' },
  { id: 'civ', name: 'Civilization', icon: '👑' },
];

function forBrush(g: Game, x: number, y: number, r: number, fn: (i: number, d: number) => void): void {
  const w = g.world;
  const r0 = Math.ceil(r);
  const cx = Math.floor(x), cy = Math.floor(y);
  for (let dy = -r0; dy <= r0; dy++) for (let dx = -r0; dx <= r0; dx++) {
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > r - 0.3 && !(dx === 0 && dy === 0)) continue;
    const tx = cx + dx, ty = cy + dy;
    if (!w.inb(tx, ty)) continue;
    fn(ty * w.w + tx, d);
  }
}

function paint(t: number) {
  return (g: Game, x: number, y: number, r: number) => {
    const w = g.world;
    forBrush(g, x, y, r, i => {
      if (w.bld[i] && (TER[t].water || t === T.LAVA || t === T.MOUNTAIN || t === T.PEAK)) {
        const b = g.bldById.get(w.bld[i]);
        if (b) g.damageBuilding(b, 99999, null);
      }
      if ([T.GRASS, T.JUNGLE, T.SAVANNA, T.DESERT, T.SWAMP, T.TUNDRA, T.SNOW].includes(t as any)) w.paintBiome(i, t);
      else if (t === T.LAVA) w.addLava(i, 200);
      else if (t === T.SAND) { if (w.ter[i] !== T.SAND) w.setTer(i, T.SAND); }
      else w.setTer(i, t);
    });
  };
}

function kingdomAt(g: Game, x: number, y: number): Kingdom | null {
  const w = g.world;
  const i = w.tileAt(x, y);
  if (i < 0) return null;
  const o = w.owner[i];
  if (o) { const c = g.cityById.get(o); if (c) return c.kingdom; }
  let best: Kingdom | null = null, bd = 64;
  for (const c of g.cities) {
    const d = (c.x - x) ** 2 + (c.y - y) ** 2;
    if (d < bd) { bd = d; best = c.kingdom; }
  }
  return best;
}

function spawnKind(kind: number) {
  return (g: Game, x: number, y: number) => {
    const w = g.world;
    const i = w.tileAt(x, y);
    if (i < 0) return;
    const d = UDEF[kind];
    if (d.aquatic && !w.isWater(i)) return;
    if (!d.aquatic && !d.flying && !w.walk(i)) return;
    const u = g.spawnUnit(kind, x + (Math.random() - 0.5) * 0.6, y + (Math.random() - 0.5) * 0.6);
    u.ageT = Math.floor(u.lifeT * 0.2);
    if (kind === UK.DRAGON || kind === UK.KRAKEN || kind === UK.GOLEM) g.log(`A ${d.name} was summoned`, 'monster', x, y, '#f96');
  };
}

function spawnPeople(species: number) {
  return (g: Game, x: number, y: number) => {
    const w = g.world;
    const i = w.tileAt(x, y);
    if (i < 0 || !w.walk(i)) return;
    const u = g.spawnPerson(species, x + (Math.random() - 0.5) * 0.6, y + (Math.random() - 0.5) * 0.6, null, null, 16 + Math.random() * 14);
    // join a nearby city of the same species if there is one
    const o = w.owner[i];
    if (o) { const c = g.cityById.get(o); if (c && c.kingdom.species === species) g.addToCity(u, c); }
  };
}

function tribe(species: number) {
  return (g: Game, x: number, y: number, _r: number, ctx: ToolCtx) => {
    const c = g.spawnTribe(species, x, y, 7);
    if (!c) ctx.toast('Cannot found a village here (needs free, dry land)');
  };
}

export const TOOLS: Tool[] = [
  // ---------------- terrain
  { id: 'raise', cat: 'terrain', name: 'Raise Land', icon: '⬆️', mode: 'brush', interval: 90, desc: 'Raise terrain one level', apply: (g, x, y, r) => forBrush(g, x, y, r, i => g.world.raise(i)) },
  { id: 'lower', cat: 'terrain', name: 'Lower Land', icon: '⬇️', mode: 'brush', interval: 90, desc: 'Lower terrain one level', apply: (g, x, y, r) => forBrush(g, x, y, r, i => { const b = g.world.bld[i]; if (b && TER[g.world.ter[i]].elev <= 3) { const bb = g.bldById.get(b); if (bb) g.damageBuilding(bb, 99999, null); } g.world.lower(i); }) },
  { id: 'deep', cat: 'terrain', name: 'Deep Ocean', icon: 'color:#163468', mode: 'brush', desc: 'Paint deep ocean', apply: paint(T.DEEP) },
  { id: 'ocean', cat: 'terrain', name: 'Ocean', icon: 'color:#21549c', mode: 'brush', desc: 'Paint ocean', apply: paint(T.WATER) },
  { id: 'shallow', cat: 'terrain', name: 'Shallows', icon: 'color:#3a80c4', mode: 'brush', desc: 'Paint shallow water', apply: paint(T.SHALLOW) },
  { id: 'sand', cat: 'terrain', name: 'Sand', icon: 'color:#e2d096', mode: 'brush', desc: 'Paint beach sand', apply: paint(T.SAND) },
  { id: 'grass', cat: 'terrain', name: 'Grassland', icon: 'color:#60a83c', mode: 'brush', desc: 'Paint grassland', apply: paint(T.GRASS) },
  { id: 'jungle', cat: 'terrain', name: 'Jungle', icon: 'color:#2c863e', mode: 'brush', desc: 'Paint jungle', apply: paint(T.JUNGLE) },
  { id: 'savanna', cat: 'terrain', name: 'Savanna', icon: 'color:#aaae4c', mode: 'brush', desc: 'Paint savanna', apply: paint(T.SAVANNA) },
  { id: 'desert', cat: 'terrain', name: 'Desert', icon: 'color:#e0b86c', mode: 'brush', desc: 'Paint desert', apply: paint(T.DESERT) },
  { id: 'swamp', cat: 'terrain', name: 'Swamp', icon: 'color:#526a3e', mode: 'brush', desc: 'Paint swamp', apply: paint(T.SWAMP) },
  { id: 'tundra', cat: 'terrain', name: 'Tundra', icon: 'color:#8ca092', mode: 'brush', desc: 'Paint tundra', apply: paint(T.TUNDRA) },
  { id: 'snow', cat: 'terrain', name: 'Snow', icon: 'color:#ecf2f7', mode: 'brush', desc: 'Paint snowfields', apply: paint(T.SNOW) },
  { id: 'hills', cat: 'terrain', name: 'Hills', icon: 'color:#808852', mode: 'brush', desc: 'Paint hills', apply: paint(T.HILLS) },
  { id: 'mountain', cat: 'terrain', name: 'Mountain', icon: 'color:#7a7068', mode: 'brush', desc: 'Paint mountains', apply: paint(T.MOUNTAIN) },
  { id: 'peak', cat: 'terrain', name: 'Peak', icon: 'color:#dce0e6', mode: 'brush', desc: 'Paint impassable peaks', apply: paint(T.PEAK) },
  { id: 'lava', cat: 'terrain', name: 'Lava', icon: 'color:#ff6020', mode: 'brush', desc: 'Pour molten lava', apply: paint(T.LAVA) },
  {
    id: 'trees', cat: 'terrain', name: 'Forest', icon: '🌳', mode: 'spray', interval: 60, desc: 'Plant trees', apply: (g, x, y, r) => forBrush(g, x, y, r, i => {
      const w = g.world;
      if (Math.random() < 0.5 && !w.bld[i] && w.flora[i] === F.NONE && w.ter[i] !== T.FARM && !isRoad(w.ter[i])) { const f = treeFor(w.ter[i]); if (f) w.setFlora(i, f); }
    }),
  },
  { id: 'flowers', cat: 'terrain', name: 'Flowers & Berries', icon: '🌼', mode: 'spray', interval: 60, desc: 'Grow bushes and flowers', apply: (g, x, y, r) => forBrush(g, x, y, r, i => { const w = g.world; if (Math.random() < 0.4 && w.flora[i] === F.NONE && !w.bld[i] && TER[w.ter[i]].fert > 0.2 && w.ter[i] !== T.FARM) w.setFlora(i, Math.random() < 0.5 ? F.BUSH : F.FLOWER); }) },
  { id: 'clear', cat: 'terrain', name: 'Clear Plants', icon: '🪓', mode: 'brush', desc: 'Remove trees and plants', apply: (g, x, y, r) => forBrush(g, x, y, r, i => { if (g.world.flora[i] !== F.CROP) g.world.setFlora(i, F.NONE); }) },

  // ---------------- life
  { id: 'human', cat: 'life', name: 'Humans', icon: 'sprite:person:0', mode: 'spray', interval: 250, desc: 'Spawn humans — two or more nomads will found a kingdom', apply: spawnPeople(0) },
  { id: 'verdani', cat: 'life', name: 'Verdani', icon: 'sprite:person:1', mode: 'spray', interval: 250, desc: 'Spawn Verdani forest folk', apply: spawnPeople(1) },
  { id: 'stonekin', cat: 'life', name: 'Stonekin', icon: 'sprite:person:2', mode: 'spray', interval: 250, desc: 'Spawn Stonekin mountain clans', apply: spawnPeople(2) },
  { id: 'grukh', cat: 'life', name: 'Grukh', icon: 'sprite:person:3', mode: 'spray', interval: 250, desc: 'Spawn Grukh warriors', apply: spawnPeople(3) },
  { id: 'tribe0', cat: 'life', name: 'Human Village', icon: 'sprite:village:0', mode: 'click', desc: 'Found a human village', apply: tribe(0) },
  { id: 'tribe1', cat: 'life', name: 'Verdani Village', icon: 'sprite:village:1', mode: 'click', desc: 'Found a Verdani village', apply: tribe(1) },
  { id: 'tribe2', cat: 'life', name: 'Stonekin Village', icon: 'sprite:village:2', mode: 'click', desc: 'Found a Stonekin village', apply: tribe(2) },
  { id: 'tribe3', cat: 'life', name: 'Grukh Village', icon: 'sprite:village:3', mode: 'click', desc: 'Found a Grukh village', apply: tribe(3) },
  { id: 'sheep', cat: 'life', name: 'Sheep', icon: 'sprite:c:1', mode: 'spray', interval: 200, desc: 'Spawn sheep', apply: spawnKind(UK.SHEEP) },
  { id: 'deer', cat: 'life', name: 'Deer', icon: 'sprite:c:2', mode: 'spray', interval: 200, desc: 'Spawn deer', apply: spawnKind(UK.DEER) },
  { id: 'chicken', cat: 'life', name: 'Chicken', icon: 'sprite:c:3', mode: 'spray', interval: 200, desc: 'Spawn chickens', apply: spawnKind(UK.CHICKEN) },
  { id: 'wolf', cat: 'life', name: 'Wolf', icon: 'sprite:c:4', mode: 'spray', interval: 250, desc: 'Spawn wolves', apply: spawnKind(UK.WOLF) },
  { id: 'bear', cat: 'life', name: 'Bear', icon: 'sprite:c:5', mode: 'spray', interval: 300, desc: 'Spawn bears', apply: spawnKind(UK.BEAR) },
  { id: 'fish', cat: 'life', name: 'Fish', icon: 'sprite:c:13', mode: 'spray', interval: 150, desc: 'Spawn fish in water', apply: spawnKind(UK.FISH) },
  { id: 'dragon', cat: 'life', name: 'Dragon', icon: 'sprite:c:6', mode: 'click', desc: 'Summon a fire-breathing dragon', apply: spawnKind(UK.DRAGON) },
  { id: 'zombie', cat: 'life', name: 'Zombie', icon: 'sprite:c:7', mode: 'spray', interval: 300, desc: 'Raise the undead. Their bite spreads.', apply: spawnKind(UK.ZOMBIE) },
  { id: 'kraken', cat: 'life', name: 'Kraken', icon: 'sprite:c:8', mode: 'click', desc: 'Summon a sea monster (place in water)', apply: spawnKind(UK.KRAKEN) },
  { id: 'golem', cat: 'life', name: 'Stone Golem', icon: 'sprite:c:9', mode: 'click', desc: 'Awaken a building-smashing golem', apply: spawnKind(UK.GOLEM) },

  // ---------------- nature
  { id: 'rain', cat: 'nature', name: 'Rain', icon: '🌧️', mode: 'click', desc: 'Rain puts out fires and grows plants', apply: (g, x, y) => startDisaster(g, 'rain', x, y) },
  {
    id: 'lightning', cat: 'nature', name: 'Lightning', icon: '⚡', mode: 'click', desc: 'Strike with lightning', apply: (g, x, y) => {
      g.emit({ kind: 'lightning', x, y });
      g.explode(x, y, 1.5, 60, null, null, { fire: true, fx: false });
      g.world.ignite(g.world.tileAt(x, y), 150);
    },
  },
  { id: 'fire', cat: 'nature', name: 'Fire', icon: '🔥', mode: 'brush', interval: 100, desc: 'Set things ablaze', apply: (g, x, y, r) => forBrush(g, x, y, r, i => { if (Math.random() < 0.6) g.world.ignite(i, 160); }) },
  { id: 'meteor', cat: 'nature', name: 'Meteor', icon: '☄️', mode: 'click', desc: 'Call down a meteor', apply: (g, x, y) => spawnMeteor(g, x, y) },
  { id: 'meteors', cat: 'nature', name: 'Meteor Shower', icon: '🌠', mode: 'click', desc: 'A rain of meteors', apply: (g, x, y) => startDisaster(g, 'meteors', x, y) },
  { id: 'earthquake', cat: 'nature', name: 'Earthquake', icon: '🫨', mode: 'click', desc: 'Crack the earth', apply: (g, x, y) => startDisaster(g, 'earthquake', x, y) },
  { id: 'tornado', cat: 'nature', name: 'Tornado', icon: '🌪️', mode: 'click', desc: 'Spawn a tornado', apply: (g, x, y) => startDisaster(g, 'tornado', x, y) },
  { id: 'volcano', cat: 'nature', name: 'Volcano', icon: '🌋', mode: 'click', desc: 'Raise an erupting volcano', apply: (g, x, y) => startDisaster(g, 'volcano', x, y) },
  { id: 'blizzard', cat: 'nature', name: 'Blizzard', icon: '❄️', mode: 'click', desc: 'Freeze the land', apply: (g, x, y) => startDisaster(g, 'blizzard', x, y) },
  { id: 'drought', cat: 'nature', name: 'Drought', icon: '🏜️', mode: 'click', desc: 'Dry the land and kill crops', apply: (g, x, y) => startDisaster(g, 'drought', x, y) },
  { id: 'acid', cat: 'nature', name: 'Acid Rain', icon: '☢️', mode: 'click', desc: 'Toxic rain withers everything', apply: (g, x, y) => startDisaster(g, 'acid', x, y) },
  { id: 'plague', cat: 'nature', name: 'Plague', icon: '🦠', mode: 'click', desc: 'Infect creatures with a plague', apply: (g, x, y, r, ctx) => { const n = plagueOutbreak(g, x, y, Math.max(3, r)); ctx.toast(n ? `${n} infected` : 'Nobody to infect here'); } },
  { id: 'aliens', cat: 'nature', name: 'Alien Invasion', icon: '👽', mode: 'click', desc: 'Saucers from beyond the stars attack', apply: (g, x, y) => alienInvasion(g, x, y) },

  // ---------------- powers
  { id: 'bless', cat: 'powers', name: 'Bless', icon: '😇', mode: 'brush', interval: 150, desc: 'Blessed units fight harder and move faster', apply: (g, x, y, r) => g.spatial.query(x, y, r + 0.5, u => { u.blessT = TPY * 20; u.curseT = 0; u.hp = u.maxHp; g.emit({ kind: 'sparkle', x: u.x, y: u.y, r: 1, color: '#ffe680' }); }) },
  { id: 'curse', cat: 'powers', name: 'Curse', icon: '😈', mode: 'brush', interval: 150, desc: 'Cursed units weaken', apply: (g, x, y, r) => g.spatial.query(x, y, r + 0.5, u => { u.curseT = TPY * 20; u.blessT = 0; g.emit({ kind: 'sparkle', x: u.x, y: u.y, r: 1, color: '#a050ff' }); }) },
  { id: 'heal', cat: 'powers', name: 'Heal', icon: '💚', mode: 'brush', interval: 150, desc: 'Heal and cure plague', apply: (g, x, y, r) => g.spatial.query(x, y, r + 0.5, u => { u.hp = u.maxHp; u.plague = 0; u.immune = TPY * 10; g.emit({ kind: 'sparkle', x: u.x, y: u.y, r: 1, color: '#7f7' }); }) },
  { id: 'madness', cat: 'powers', name: 'Madness', icon: '🤪', mode: 'brush', interval: 200, desc: 'Drive units mad — they attack anyone', apply: (g, x, y, r) => g.spatial.query(x, y, r + 0.5, u => { if (u.kind === UK.PERSON || UDEF[u.kind].pred || UDEF[u.kind].herb) u.madT = TPY * 6; }) },
  { id: 'smite', cat: 'powers', name: 'Divine Smite', icon: '🌟', mode: 'click', desc: 'A beam of holy light', apply: (g, x, y) => { g.emit({ kind: 'lightning', x, y }); g.explode(x, y, 2.5, 500, null, null, { fire: false }); } },
  { id: 'nuke', cat: 'powers', name: 'Nuke', icon: '💥', mode: 'click', desc: 'Atomic devastation', apply: (g, x, y) => { nukeAt(g, x, y, null); g.log('☢ A divine nuclear blast scorched the earth', 'nuke', x, y, '#ff0', true); } },
  { id: 'kill', cat: 'powers', name: 'Erase', icon: '🧹', mode: 'brush', interval: 80, desc: 'Remove units', apply: (g, x, y, r) => g.spatial.query(x, y, r + 0.3, u => g.killUnit(u, null)) },
  { id: 'purify', cat: 'powers', name: 'Purify', icon: '💧', mode: 'brush', interval: 120, desc: 'Remove pollution, wasteland, ash and fire', apply: (g, x, y, r) => forBrush(g, x, y, r, i => { const w = g.world; w.poll[i] = 0; w.fire[i] = 0; if (w.ter[i] === T.WASTE || w.ter[i] === T.ASH) w.setTer(i, w.landFor(i)); if (w.flora[i] === F.DEAD) w.setFlora(i, treeFor(w.ter[i])); w.mark(i); }) },
  { id: 'cool', cat: 'powers', name: 'Cool Climate', icon: '🧊', mode: 'click', desc: 'Undo global warming', apply: (g, _x, _y, _r, ctx) => { g.carbon = 0; ctx.toast('The atmosphere has been cleansed'); } },

  // ---------------- civilization
  {
    id: 'inspire', cat: 'civ', name: 'Inspire', icon: '💡', mode: 'click', desc: 'Give a kingdom a burst of research', apply: (g, x, y, _r, ctx) => {
      const k = kingdomAt(g, x, y);
      if (!k) { ctx.toast('Tap inside a kingdom'); return; }
      if (k.researching < 0) { ctx.toast(`${g.kName(k)} knows everything already`); return; }
      k.progress += TECHS[k.researching].cost * 0.6;
      ctx.toast(`${g.kName(k)} is inspired!`);
      if (k.capital) g.emit({ kind: 'sparkle', x: k.capital.x, y: k.capital.y - 2, r: 3, color: '#ffe680' });
    },
  },
  {
    id: 'gift', cat: 'civ', name: 'Gift Technology', icon: '📜', mode: 'click', desc: 'Instantly grant the tech being researched', apply: (g, x, y, _r, ctx) => {
      const k = kingdomAt(g, x, y);
      if (!k) { ctx.toast('Tap inside a kingdom'); return; }
      let idx = k.researching;
      if (idx < 0) for (let i = 0; i < NUM_TECH; i++) if (canResearch(k.techs, i)) { idx = i; break; }
      if (idx < 0) { ctx.toast(`${g.kName(k)} knows everything already`); return; }
      g.learnTech(k, idx, true);
    },
  },
  {
    id: 'darkage', cat: 'civ', name: 'Dark Age', icon: '🕯️', mode: 'click', desc: 'A kingdom forgets its latest discovery', apply: (g, x, y, _r, ctx) => {
      const k = kingdomAt(g, x, y);
      if (!k) { ctx.toast('Tap inside a kingdom'); return; }
      // forget the most advanced tech that nothing else depends on
      let best = -1;
      for (let i = NUM_TECH - 1; i >= 0; i--) {
        if (!k.techs[i]) continue;
        const needed = TECHS.some(t => k.techs[t.idx] && t.req.includes(TECHS[i].id));
        if (!needed && TECHS[i].id !== 'stonetools' && TECHS[i].id !== 'fire') { best = i; break; }
      }
      if (best < 0) { ctx.toast('Nothing left to forget'); return; }
      k.techs[best] = 0;
      g.refreshTechs(k);
      k.researching = -1;
      k.progress = 0;
      for (const u of g.units) if (u.kingdom === k) refreshStats(g, u);
      g.log(`${g.kName(k)} fell into a dark age and forgot ${TECHS[best].name}`, 'tech', k.capital ? k.capital.x : -1, k.capital ? k.capital.y : -1, k.css, true);
    },
  },
  {
    id: 'war', cat: 'civ', name: 'Declare War', icon: '⚔️', mode: 'click', desc: 'Tap one kingdom, then another, to start a war', apply: (g, x, y, _r, ctx) => {
      const k = kingdomAt(g, x, y);
      if (!k) { ctx.toast('Tap inside a kingdom'); return; }
      const first = ctx.pickKingdom.first;
      if (!first || !first.alive) { ctx.pickKingdom.first = k; ctx.toast(`${g.kName(k)} selected — now tap their enemy`); return; }
      if (first === k) { ctx.toast('Pick a different kingdom'); return; }
      g.declareWar(first, k, 'by divine will');
      ctx.pickKingdom.first = null;
    },
  },
  {
    id: 'peace', cat: 'civ', name: 'Force Peace', icon: '🕊️', mode: 'click', desc: 'A kingdom makes peace with everyone', apply: (g, x, y, _r, ctx) => {
      const k = kingdomAt(g, x, y);
      if (!k) { ctx.toast('Tap inside a kingdom'); return; }
      let n = 0;
      for (const o of g.kingdoms) if (k.atWar(o)) { g.makePeace(k, o); n++; }
      if (!n) ctx.toast(`${g.kName(k)} is not at war`);
    },
  },
  {
    id: 'friendship', cat: 'civ', name: 'Friendship', icon: '🤝', mode: 'click', desc: 'Improve relations between a kingdom and its neighbours', apply: (g, x, y, _r, ctx) => {
      const k = kingdomAt(g, x, y);
      if (!k) { ctx.toast('Tap inside a kingdom'); return; }
      for (const o of g.kingdoms) { if (o === k) continue; k.relation(o).opinion += 50; o.relation(k).opinion += 50; k.relation(o).memory = 0; o.relation(k).memory = 0; }
      ctx.toast(`Everyone loves ${g.kName(k)} now`);
    },
  },
  {
    id: 'rebellion', cat: 'civ', name: 'Spark Rebellion', icon: '🔥', mode: 'click', desc: 'A city revolts and declares independence', apply: (g, x, y, _r, ctx) => {
      const w = g.world;
      const i = w.tileAt(x, y);
      const c = i >= 0 && w.owner[i] ? g.cityById.get(w.owner[i]) : null;
      if (!c) { ctx.toast('Tap inside a city'); return; }
      if (c.kingdom.cities.length < 2) { ctx.toast('A kingdom needs at least two cities for a rebellion'); return; }
      rebel(g, c);
    },
  },
  {
    id: 'riches', cat: 'civ', name: 'Bounty', icon: '💰', mode: 'click', desc: 'Shower a kingdom with resources and food', apply: (g, x, y, _r, ctx) => {
      const k = kingdomAt(g, x, y);
      if (!k) { ctx.toast('Tap inside a kingdom'); return; }
      for (let r = 0; r < k.res.length; r++) k.res[r] += 100;
      for (const c of k.cities) c.food += 100;
      ctx.toast(`${g.kName(k)} receives a divine bounty`);
    },
  },
];

export const TOOL_BY_ID: Record<string, Tool> = {};
for (const t of TOOLS) TOOL_BY_ID[t.id] = t;

export { SPECIES, isTree };

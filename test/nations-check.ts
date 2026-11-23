// Headless check of nation sizes, conquest and war dynamics.
declare const process: any;
import { generateWorld } from '../src/sim/worldgen';
import { Game, suggestedMaxPop } from '../src/sim/game';
import { TPY } from '../src/sim/defs';
import { isRoad } from '../src/sim/terrain';

const seed = Number(process.argv[2] || 321);
const years = Number(process.argv[3] || 600);
const w = Number(process.argv[4] || 512), h = Number(process.argv[5] || 352);
const era = Number(process.argv[6] || 0);
const world = generateWorld({ w, h, seed, type: 'continents' });
const g = new Game(world, seed);
g.headless = true;
g.laws.disasters = false;
g.laws.startEra = era;
g.laws.maxPop = suggestedMaxPop(world.n);
g.populateWorld(8, true);
console.log(`world ${w}x${h} maxPop ${g.laws.maxPop}`);
const seen = new Set<any>();
let conquests = 0, ceded = 0, campaigns = 0, bigArmy = 0, rebellions = 0, splits = 0, falls = 0, unions = 0, merges = 0;
const t0 = Date.now();
let msY = 0;
for (let y = 1; y <= years; y++) {
  const ts = Date.now();
  for (let t = 0; t < TPY; t++) g.step();
  msY = msY * 0.8 + (Date.now() - ts) * 0.2;
  for (const e of g.history) {
    if (seen.has(e)) continue;
    seen.add(e);
    if (/ conquered /.test(e.text)) conquests++;
    if (/ cedes /.test(e.text)) ceded++;
    if (/marches on/.test(e.text)) { campaigns++; const m = /army of (\d+)/.exec(e.text); if (m) bigArmy = Math.max(bigArmy, +m[1]); }
    if (/rebelled/.test(e.text)) rebellions++;
    if (/split/.test(e.text)) splits++;
    if (/has fallen|collapsed/.test(e.text)) falls++;
    if (/united with|joined .* — \d+ cities|agreed to unite|surrendered its independence/.test(e.text)) unions++;
    if (/grown together/.test(e.text)) merges++;
  }
  if (y % 50 === 0) {
    const ks = g.kingdoms.slice().sort((a, b) => b.pop - a.pop);
    let roads = 0, unowned = 0;
    for (let i = 0; i < g.world.n; i++) if (isRoad(g.world.ter[i])) { roads++; if (!g.world.owner[i]) unowned++; }
    const wars = g.kingdoms.reduce((s, k) => s + k.wars, 0) / 2;
    console.log(`Y${y} pop=${g.personPop} kingdoms=${g.kingdoms.length} wars=${wars} conquests=${conquests} ceded=${ceded} campaigns=${campaigns} maxArmy=${bigArmy} rebellions=${rebellions} splits=${splits} falls=${falls} unions=${unions} merges=${merges} roads=${roads}(${unowned} rural) ms/yr=${msY.toFixed(0)}`);
    console.log('   top: ' + ks.slice(0, 6).map(k => `${k.baseName} e${k.era} p${k.pop} c${k.cities.length} s${k.soldiers}`).join(' | '));
  }
}
console.log(`total ${(Date.now() - t0) / 1000}s`);
console.log(g.history.filter(e => /conquered|marches on|cedes|fallen|invasion/.test(e.text)).slice(-15).map(e => `[${e.year}] ${e.text}`).join('\n'));

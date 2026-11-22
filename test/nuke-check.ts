declare const process: any;
import { generateWorld } from '../src/sim/worldgen';
import { Game, suggestedMaxPop } from '../src/sim/game';
import { TPY } from '../src/sim/defs';
import { TECHS } from '../src/sim/tech';
import { doomsday } from '../src/sim/politics';
const seed = Number(process.argv[2] || 11);
const world = generateWorld({ w: 300, h: 200, seed, type: 'pangaea' });
const g = new Game(world, seed);
g.headless = true;
g.laws.maxPop = suggestedMaxPop(world.n);
g.laws.startEra = 7;
g.populateWorld(6, false);
for (const k of g.kingdoms) {
  for (const t of TECHS) if (t.id === 'nukes' || t.id === 'fission' || t.id === 'rocketry' || t.era < 7) k.techs[t.idx] = 1;
  g.refreshTechs(k);
  k.res = k.res.map(() => 400);
}
for (let y = 0; y < Number(process.argv[3] || 260); y++) {
  for (let t = 0; t < TPY; t++) g.step();
  if (y % 20 === 0) console.log(`Y${g.year} pop=${g.personPop} nations=${g.kingdoms.length} silos=${g.buildings.filter(b => b.type === 'silo' && b.progress >= 1).length} warheads=${g.kingdoms.map(k => k.warheads).join(',')} wars=${g.kingdoms.reduce((s, k) => s + k.wars, 0) / 2} detonations=${g.combatNukes}/${g.stats.nukes} winter=${g.nuclearWinter.toFixed(2)} doom=${doomsday(g).toFixed(1)} warming=+${(g.heat * 2).toFixed(1)} accords=${g.accords.map(a => a.kind + ':' + a.signatories.size).join(',')}`);
}
console.log(g.history.filter(e => ['nuke', 'treaty', 'peace', 'war'].includes(e.kind)).slice(-30).map(e => `[${e.year}] ${e.text}`).join('\n'));

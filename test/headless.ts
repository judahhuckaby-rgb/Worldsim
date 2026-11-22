// Headless simulation run: catches runtime errors and reports progression stats.
declare const process: any;
import { generateWorld } from '../src/sim/worldgen';
import { Game } from '../src/sim/game';
import { TPY } from '../src/sim/defs';
import { ERAS, TECHS } from '../src/sim/tech';

const seed = Number(process.argv[2] || 12345);
const years = Number(process.argv[3] || 300);
const type = (process.argv[4] || 'continents') as any;
const w = Number(process.argv[5] || 240), h = Number(process.argv[6] || 160);
const world = generateWorld({ w, h, seed, type });
const g = new Game(world, seed);
g.headless = true;
g.laws.disasters = process.argv.includes('--disasters');
const rsi = process.argv.indexOf('--rs'); if (rsi > 0) g.laws.researchSpeed = Number(process.argv[rsi + 1]);
g.populateWorld(6, true);
console.log(`world ${w}x${h} ${type} seed=${seed} islands=${world.islandSize.length} kingdoms=${g.kingdoms.length}`);
const t0 = Date.now();
let lastLog = 0;
for (let y = 0; y < years; y++) {
  const ts = Date.now();
  for (let t = 0; t < TPY; t++) g.step();
  const dt = Date.now() - ts;
  if (y % 25 === 0 || y === years - 1) {
    const ks = g.kingdoms.map(k => `${k.baseName}(${['H','V','S','G'][k.species]}) e${k.era} t${k.techCount} p${k.pop} c${k.cities.length} s${k.soldiers} w${k.wars} r${k.researchRate.toFixed(1)}`).join(' | ');
    console.log(`Y${g.year} units=${g.units.length} people=${g.personPop} blds=${g.buildings.length} cities=${g.cities.length} proj=${g.projectiles.length} ms/yr=${dt} :: ${ks}`);
  }
  lastLog = y;
}
console.log(`total ${(Date.now() - t0) / 1000}s, avg ms/tick ${((Date.now() - t0) / (years * TPY)).toFixed(2)}`);
console.log('stats', JSON.stringify(g.stats));
const maxEra = g.kingdoms.reduce((m, k) => Math.max(m, k.era), 0);
for (const k of g.allKingdoms) console.log(k.baseName, k.alive ? 'alive' : 'dead@' + k.diedYear, 'eras:', k.eraYears.map((y, i) => y === undefined ? '' : i + ':' + y).filter(Boolean).join(' '));
console.log('max era', ERAS[maxEra].name, 'techs total', TECHS.length);
const hist = g.history.slice(-25).map(e => `[${e.year}] ${e.text}`).join('\n');
console.log(hist);
void lastLog;

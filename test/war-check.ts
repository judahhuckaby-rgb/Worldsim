// Headless check of modern warfare: air raids, cruise missiles, orbital strikes and nukes.
declare const process: any;
import { generateWorld } from '../src/sim/worldgen';
import { Game, suggestedMaxPop, P } from '../src/sim/game';
import { TPY, UK } from '../src/sim/defs';
import { ERAS } from '../src/sim/tech';

const seed = Number(process.argv[2] || 777);
const years = Number(process.argv[3] || 80);
const era = Number(process.argv[4] || 7);
const w = Number(process.argv[5] || 512), h = Number(process.argv[6] || 352);
const world = generateWorld({ w, h, seed, type: 'continents' });
const g = new Game(world, seed);
g.headless = true;
g.laws.disasters = false;
g.laws.startEra = era;
const di = process.argv.indexOf('--doctrine'); if (di > 0) g.laws.nukeDoctrine = Number(process.argv[di + 1]);
g.laws.maxPop = suggestedMaxPop(world.n);
g.populateWorld(8, true);
const counts: Record<string, number> = {};
const orig = g.shoot.bind(g);
g.shoot = (kind: number, ...rest: any[]) => { const n = Object.keys(P).find(k => (P as any)[k] === kind)!; counts[n] = (counts[n] || 0) + 1; return (orig as any)(kind, ...rest); };
let planes = 0;
const sp = g.spawnUnit.bind(g);
g.spawnUnit = (kind: number, x: number, y: number) => { if (kind === UK.PLANE) planes++; return sp(kind, x, y); };
const t0 = Date.now();
let maxMs = 0;
for (let y = 0; y < years; y++) {
  const ts = Date.now();
  for (let t = 0; t < TPY; t++) g.step();
  maxMs = Math.max(maxMs, Date.now() - ts);
  if (y % 10 === 9) {
    const wars = g.kingdoms.reduce((s, k) => s + k.wars, 0) / 2;
    const wh = g.kingdoms.reduce((s, k) => s + k.warheads, 0);
    const lead = g.kingdoms.slice().sort((a, b) => b.researchRate - a.researchRate)[0];
    console.log(`  lead ${lead ? lead.baseName + " pop" + lead.pop + " rate" + lead.researchRate.toFixed(0) + " techs" + lead.techCount : ""}`);
    console.log(`Y${g.year} people=${g.personPop} cities=${g.cities.length} kingdoms=${g.kingdoms.length} wars=${wars} warheads=${wh} nukes=${g.stats.nukes} combat=${g.combatNukes} planes=${planes} shots=${JSON.stringify(counts)} eras=${g.kingdoms.map(k => k.era).join(',')} winter=${g.nuclearWinter.toFixed(2)}`);
  }
}
console.log(`total ${(Date.now() - t0) / 1000}s, worst year ${maxMs}ms`);
console.log('max era', ERAS[g.kingdoms.reduce((m, k) => Math.max(m, k.era), 0)].name, 'accords', g.accords.map(a => a.kind + ':' + a.signatories.size).join(','));
console.log(g.history.filter(e => /☢|🛰|✈|🚀|🛡|wiped|🕊|☮|⚔/.test(e.text)).slice(-30).map(e => `[${e.year}] ${e.text}`).join('\n'));

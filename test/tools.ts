// Apply every god power and round-trip a save, to catch runtime errors.
declare const process: any;
import { generateWorld } from '../src/sim/worldgen';
import { Game } from '../src/sim/game';
import { TPY } from '../src/sim/defs';
import { TOOLS } from '../src/ui/tools';
import { serialize, deserialize } from '../src/sim/save';

const world = generateWorld({ w: 200, h: 140, seed: 99, type: 'continents' });
const g = new Game(world, 99);
g.headless = true;
g.populateWorld(6, true);
for (let t = 0; t < TPY * 80; t++) g.step();
const msgs: string[] = [];
const ctx = { toast: (m: string) => msgs.push(m), pickKingdom: { first: null as any } };
let fails = 0;
for (const tool of TOOLS) {
  try {
    const c = g.cities[g.rng.int(g.cities.length)];
    const x = c ? c.x + 2 : 100, y = c ? c.y + 1 : 70;
    tool.apply(g, x, y, 3, ctx);
    if (tool.id === 'war') { const c2 = g.cities.find(o => o.kingdom !== c.kingdom); if (c2) tool.apply(g, c2.x, c2.y, 3, ctx); }
    for (let t = 0; t < 60; t++) g.step();
  } catch (e) {
    fails++;
    console.log('TOOL FAIL', tool.id, (e as Error).stack);
  }
}
for (let t = 0; t < TPY * 20; t++) g.step();
const json = serialize(g);
const g2 = deserialize(json);
g2.headless = true;
for (let t = 0; t < TPY * 30; t++) g2.step();
const json2 = serialize(g2);
console.log(`tools ok: ${TOOLS.length - fails}/${TOOLS.length}; save ${Math.round(json.length / 1024)}KB; reloaded year ${g2.year} pop ${g2.personPop} kingdoms ${g2.kingdoms.length}; resave ${Math.round(json2.length / 1024)}KB`);
console.log('toasts:', msgs.slice(0, 8).join(' | '));
if (fails) process.exit(1);

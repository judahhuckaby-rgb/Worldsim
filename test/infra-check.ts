declare const process: any;
import { generateWorld } from '../src/sim/worldgen';
import { Game, suggestedMaxPop } from '../src/sim/game';
import { TPY } from '../src/sim/defs';
import { T } from '../src/sim/terrain';
const world = generateWorld({ w: 384, h: 256, seed: 7, type: 'pangaea' });
const g = new Game(world, 7);
g.headless = true;
g.laws.maxPop = suggestedMaxPop(world.n);
g.laws.researchSpeed = Number(process.argv[2] || 3);
g.populateWorld(8, true);
for (let y = 0; y < Number(process.argv[3] || 320); y++) {
  for (let t = 0; t < TPY; t++) g.step();
  if (y % 40 === 0) {
    let road = 0, paved = 0, rail = 0, outside = 0;
    for (let i = 0; i < world.n; i++) {
      const t = world.ter[i];
      if (t === T.ROAD) road++; else if (t === T.PAVED) paved++; else if (t === T.RAIL) rail++; else continue;
      if (!world.owner[i]) outside++;
    }
    const links = g.kingdoms.reduce((s, k) => s + k.links.size, 0);
    const proj = g.kingdoms.filter(k => k.infra).map(k => k.infra!.kind).join(',');
    console.log(`Y${g.year} eras ${g.kingdoms.map(k => k.era).join('')} road=${road} paved=${paved} rail=${rail} outsideCities=${outside} links=${links} active=[${proj}] warheads=${g.kingdoms.reduce((s, k) => s + k.warheads, 0)} nukes=${g.combatNukes}/${g.stats.nukes} accords=${g.accords.map(a => a.kind + ':' + a.signatories.size).join(',')} council=${g.council ? g.council.members.size : 0}`);
  }
}
const kinds: Record<string, number> = {};
for (const e of g.history) kinds[e.kind] = (kinds[e.kind] || 0) + 1;
console.log(JSON.stringify(kinds));
console.log(g.history.filter(e => ['nuke', 'treaty', 'peace', 'infra'].includes(e.kind)).slice(-25).map(e => `[${e.year}] ${e.text}`).join('\n'));

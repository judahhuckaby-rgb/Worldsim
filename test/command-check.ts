// Take command of a nation and issue every order; apply the new god powers; save round-trip.
declare const process: any;
import { generateWorld } from '../src/sim/worldgen';
import { Game, P } from '../src/sim/game';
import { TPY, BLD } from '../src/sim/defs';
import { TOOLS } from '../src/ui/tools';
import { serialize, deserialize } from '../src/sim/save';
import { cityAt, cmdAttack, cmdAirRaid, cmdMissiles, cmdOrbital, cmdNuke, cmdFoundCity, cmdMobilize, cmdResearch, propose } from '../src/sim/command';
import { RES } from '../src/sim/terrain';
import { canResearch, NUM_TECH } from '../src/sim/tech';

const world = generateWorld({ w: 320, h: 220, seed: 31, type: 'continents' });
const g = new Game(world, 31);
g.headless = true;
g.laws.startEra = 10;
g.populateWorld(6, true);
for (let t = 0; t < TPY * 40; t++) g.step();
const k = g.kingdoms.slice().sort((a, b) => b.pop - a.pop)[0];
k.player = true;
for (let r = 0; r < k.res.length; r++) k.res[r] += 2000;
// give the capital the strategic buildings
const cap = k.capital!;
for (const key of ['airbase', 'silo', 'spaceport']) {
  for (let tries = 0; tries < 200; tries++) {
    const x = Math.floor(cap.x + g.rng.range(-12, 12)), y = Math.floor(cap.y + g.rng.range(-12, 12));
    const b = (g as any).placeBuilding(cap, BLD[key], x, y, true);
    if (b) { b.progress = 1; break; }
  }
}
k.warheads = 3;
console.log(`player: ${g.kName(k)} era ${k.era} pop ${k.pop} cities ${k.cities.length} airbase ${!!cap.find('airbase')} silo ${!!cap.find('silo')} port ${!!cap.find('spaceport')}`);
const enemy = g.kingdoms.find(o => o !== k)!;
const tgt = enemy.cities[0];
const out: string[] = [];
out.push(cmdResearch(g, k, Array.from({ length: NUM_TECH }, (_, i) => i).find(i => canResearch(k.techs, i)) ?? 0));
out.push(cmdAttack(g, k, tgt));
out.push(cmdAirRaid(g, k, tgt));
out.push(cmdMissiles(g, k, tgt));
out.push(cmdOrbital(g, k, tgt));
out.push(cmdMobilize(g, k));
const deaths0 = g.stats.deaths;
out.push(cmdNuke(g, k, enemy.cities[enemy.cities.length - 1]));
out.push(cmdFoundCity(g, k, cap.x + 20, cap.y + 5));
out.push(cityAt(g, tgt.x, tgt.y)?.name || 'no city');
for (const o of g.kingdoms) if (o !== k) for (const p of ['gift', 'trade', 'nap', 'alliance', 'peace'] as const) out.push(propose(g, k, o, p));
for (let t = 0; t < TPY * 6; t++) g.step();
console.log(out.join('\n'));
console.log(`after 6y: nukes ${g.stats.nukes} deaths +${g.stats.deaths - deaths0} fallout clouds ${g.disasters.filter(d => d.kind === 'fallout').length} enemy cities ${enemy.cities.length} alive ${enemy.alive}`);
console.log(g.history.slice(-14).map(e => `[${e.year}] ${e.text}`).join('\n'));
let fails = 0;
const ctx = { toast: (m: string) => out.push(m), pickKingdom: { first: null as any } };
for (const id of ['road', 'highway', 'railway', 'asteroid', 'tsunami', 'flare', 'pandemic', 'tsar', 'rod', 'army', 'nuke']) {
  const tool = TOOLS.find(t => t.id === id)!;
  try {
    const c = g.cities[g.rng.int(g.cities.length)];
    tool.apply(g, c.x + 3, c.y + 2, 2, ctx);
    for (let t = 0; t < 400; t++) g.step();
  } catch (e) { fails++; console.log('TOOL FAIL', id, (e as Error).stack); }
}
const shots = g.projectiles.length;
console.log(`tools done, projectiles in flight ${shots}, flare ${g.flareT}, P.ORBITAL=${P.ORBITAL}`);
const json = serialize(g);
const g2 = deserialize(json);
g2.headless = true;
for (let t = 0; t < TPY * 3; t++) g2.step();
console.log(`reload ok: player ${g2.allKingdoms.filter(x => x.player).map(x => x.baseName).join(',')} doctrine ${g2.laws.nukeDoctrine} year ${g2.year} pop ${g2.personPop}`);
void RES;
if (fails) process.exit(1);

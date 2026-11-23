// Orders the player can give to the nation they command.
import type { Game } from './game';
import { Kingdom, City, ORD } from './entities';
import { JOB, TPY, SHIPS } from './defs';
import { RES } from './terrain';
import { canResearch, TECHS } from './tech';
import { launchAirRaid, launchCruise, orbitalStrike, spawnBoat, landingSpot } from './ai_kingdom';
import { MISSION } from './ai_units';
import { launchNuke, nukeBanned, accord, hasTech } from './politics';

export function cityAt(g: Game, x: number, y: number): City | null {
  const w = g.world;
  const i = w.tileAt(x, y);
  if (i >= 0 && w.owner[i]) { const c = g.cityById.get(w.owner[i]); if (c) return c; }
  let best: City | null = null, bd = 64;
  for (const c of g.cities) {
    const d = (c.x - x) ** 2 + (c.y - y) ** 2;
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}

function enemyTarget(g: Game, k: Kingdom, tgt: City | null): string | null {
  if (!tgt) return 'Tap on a city';
  if (tgt.kingdom === k) return 'That is one of your own cities';
  if (!k.atWar(tgt.kingdom)) return `You are not at war with ${g.kName(tgt.kingdom)} — declare war first (⚔ Attack does it for you)`;
  return null;
}

export function cmdAttack(g: Game, k: Kingdom, tgt: City | null): string {
  if (!tgt) return 'Tap on an enemy city';
  if (tgt.kingdom === k) return 'That is one of your own cities';
  const o = tgt.kingdom;
  if (!k.atWar(o)) {
    if (!g.laws.war) return 'Wars are disabled in the world laws';
    const r = k.relation(o);
    if (r.nap > g.tick) { r.nap = 0; o.relation(k).nap = 0; for (const x of g.kingdoms) if (x !== k && x !== o) { const rx = x.relation(k); rx.opinion -= 15; rx.memory += 8; } }
    g.declareWar(k, o, 'by order of its leader');
  }
  const w = g.world;
  const ti = w.tileAt(tgt.x, tgt.y);
  const island = ti >= 0 ? w.island[ti] : -1;
  let sent = 0, shipped = 0;
  for (const c of k.cities) {
    const soldiers = c.members.filter(u => u.job === JOB.SOLDIER && !u.inBoat);
    const keep = Math.floor(soldiers.length * 0.15);
    const go = soldiers.slice(keep);
    if (!go.length) continue;
    const ci = w.tileAt(c.x, c.y);
    if (ci >= 0 && w.island[ci] === island) {
      for (const u of go) { u.order = { type: ORD.ATTACK, city: tgt, x: tgt.x, y: tgt.y, since: g.tick }; u.path = null; u.phase = 0; sent++; }
      continue;
    }
    // overseas: troop ships from the docks
    const docks = c.find('docks');
    if (!docks || k.caps.ship < 0) continue;
    const landing = landingSpot(g, docks.cx, docks.cy, tgt);
    if (!landing) continue;
    const ship = Math.max(0, Math.min(k.caps.ship, SHIPS.length - 1));
    let i = 0;
    for (let b = 0; b < 3 && i < go.length; b++) {
      const boat = spawnBoat(g, k, docks.cx, docks.cy, ship, MISSION.TRANSPORT, landing.x, landing.y);
      if (!boat) break;
      for (let n = 0; n < SHIPS[ship].cap && i < go.length; n++, i++) {
        const u = go[i];
        u.order = { type: ORD.ATTACK, city: tgt, x: tgt.x, y: tgt.y, since: g.tick };
        u.inBoat = boat;
        u.path = null;
        u.tUnit = null;
        boat.cargo!.push(u);
        shipped++;
      }
    }
  }
  if (!sent && !shipped) return 'No soldiers can reach that city (build docks to ship troops overseas, or mobilize first)';
  // keep feeding reinforcements to this target until it falls
  k.campaign = { target: tgt, rx: tgt.x, ry: tgt.y, phase: 1, since: g.tick, size: sent + shipped, taken: 0, ax: k.capital ? k.capital.x : tgt.x, ay: k.capital ? k.capital.y : tgt.y };
  return `⚔ ${sent + shipped} soldiers ordered to attack ${tgt.name}${shipped ? ` (${shipped} by sea)` : ''}`;
}

export function cmdAirRaid(g: Game, k: Kingdom, tgt: City | null): string {
  const err = enemyTarget(g, k, tgt); if (err) return err;
  if (k.caps.air < 0) return 'Your nation needs Flight to fly air raids';
  const bases = k.cities.filter(c => c.find('airbase'));
  if (!bases.length) return 'Build an Airbase first (cities of 45+ people build one once Flight is known)';
  let n = 0;
  for (const c of bases) if (n < 3 && launchAirRaid(g, k, c, tgt!)) n++;
  return n ? `✈ ${n} bomber wing${n > 1 ? 's' : ''} on the way to ${tgt!.name}` : 'Not enough oil or gold to fuel the bombers';
}

export function cmdMissiles(g: Game, k: Kingdom, tgt: City | null): string {
  const err = enemyTarget(g, k, tgt); if (err) return err;
  if (!k.caps.cruise) return 'Your nation needs Rocketry for cruise missiles';
  const src = k.cities.find(c => c.find('silo') || c.find('airbase') || c.find('spaceport')) || k.capital;
  if (!src) return 'No launch site';
  const n = launchCruise(g, k, src, tgt!, 2 + Math.floor(k.era / 3));
  return n ? `🚀 ${n} cruise missiles fired at ${tgt!.name}` : 'Not enough metal for missiles (4 each)';
}

export function cmdOrbital(g: Game, k: Kingdom, tgt: City | null): string {
  const err = enemyTarget(g, k, tgt); if (err) return err;
  if (!k.caps.orbital) return 'Your nation needs Orbital Weapons (Interplanetary Age)';
  if (!k.cities.some(c => c.find('spaceport'))) return 'Orbital strikes need a Spaceport';
  const n = orbitalStrike(g, k, tgt!, 3);
  return n ? `🛰 ${n} kinetic rods falling on ${tgt!.name}` : 'Not enough metal (8 per rod)';
}

export function cmdNuke(g: Game, k: Kingdom, tgt: City | null): string {
  if (!tgt) return 'Tap on a city';
  if (tgt.kingdom === k) return 'That is one of your own cities';
  if (!g.laws.nukes) return 'Nuclear weapons are disabled in the world laws';
  if (!k.caps.nukes) return 'Your nation has not developed Nuclear Weapons';
  if (nukeBanned(g, k)) {
    const a = accord(g, 'nuclear_ban')!;
    a.signatories.delete(k.id);
    a.withdrawn.add(k.id);
    g.log(`⚠ ${g.kName(k)} withdrew from the ${a.name}`, 'treaty', -1, -1, '#f96', true);
    for (const o of g.kingdoms) if (o !== k) { const r = o.relation(k); r.opinion -= 25; r.memory += 15; }
    return 'You withdrew from the nuclear ban treaty. Rebuild warheads, then launch again.';
  }
  if (k.warheads <= 0) return 'No warheads ready (a Missile Silo builds them from uranium and metal)';
  const silo = k.cities.map(c => c.find('silo')).find(b => b) || null;
  if (!silo) return 'You need a Missile Silo to launch';
  if (!k.atWar(tgt.kingdom)) g.declareWar(k, tgt.kingdom, 'with a nuclear first strike');
  launchNuke(g, k, silo, tgt, 'launched a nuclear strike');
  return `☢ Missile away — ${k.warheads} warhead${k.warheads === 1 ? '' : 's'} left`;
}

export function cmdFoundCity(g: Game, k: Kingdom, x: number, y: number): string {
  const w = g.world;
  const i = w.tileAt(x, y);
  if (i < 0 || w.isWater(i) || !w.walk(i)) return 'Pick dry, open land';
  if (w.owner[i]) return 'That land already belongs to a city';
  for (const c of g.cities) if (Math.hypot(c.x - x, c.y - y) < 9) return `Too close to ${c.name}`;
  const island = w.island[i];
  let src: City | null = null;
  for (const c of k.cities) {
    const ci = w.tileAt(c.x, c.y);
    if (ci < 0 || w.island[ci] !== island || c.members.length < 14) continue;
    if (!src || c.members.length > src.members.length) src = c;
  }
  if (!src) return 'You need a city of 14+ people on the same landmass';
  const adults = src.members.filter(u => u.ageT >= 16 * TPY && u.ageT < 40 * TPY && u.job !== JOB.SOLDIER && !u.isKing && !u.order).sort((a, b) => a.ageT - b.ageT).slice(0, 8);
  if (adults.length < 4) return 'Not enough free settlers in ' + src.name;
  for (const u of adults) {
    g.removeFromCity(u);
    u.kingdom = k;
    u.job = JOB.SETTLER;
    u.order = { type: ORD.SETTLE, city: null, x: x, y: y, since: g.tick };
    u.path = null;
    u.phase = 0;
    u.carry = -1;
  }
  src.food = Math.max(0, src.food - 10);
  return `🏙 ${adults.length} settlers left ${src.name} to found a new city`;
}

export function cmdMobilize(g: Game, k: Kingdom): string {
  if (k.mobilizeT > g.tick) { k.mobilizeT = 0; return 'Demobilized — soldiers return to their jobs'; }
  k.mobilizeT = g.tick + TPY * 8;
  g.log(`🎖 ${g.kName(k)} declared a general mobilization`, 'war', k.capital ? k.capital.x : -1, k.capital ? k.capital.y : -1, k.css);
  return '🎖 General mobilization: cities will train many more soldiers for 8 years';
}

export function cmdResearch(g: Game, k: Kingdom, idx: number): string {
  if (k.techs[idx]) return `${TECHS[idx].name} is already known`;
  if (!canResearch(k.techs, idx)) return `${TECHS[idx].name} needs ${TECHS[idx].req.map(r => TECHS.find(t => t.id === r)!.name).join(', ')} first`;
  if (k.researching !== idx) { k.researching = idx; k.progress = Math.min(k.progress, TECHS[idx].cost * 0.5); }
  return `🧪 Now researching ${TECHS[idx].name}`;
}

// ------------------------------------------------------------------ diplomacy
export type Proposal = 'peace' | 'alliance' | 'trade' | 'nap' | 'gift' | 'war';

export function propose(g: Game, k: Kingdom, o: Kingdom, what: Proposal): string {
  const r = k.relation(o), ro = o.relation(k);
  const op = ro.opinion;
  const yes = (p: number) => g.rng.chance(Math.max(0, Math.min(0.97, p)));
  switch (what) {
    case 'war':
      if (k.atWar(o)) return 'Already at war';
      if (!g.laws.war) return 'Wars are disabled in the world laws';
      if (r.nap > g.tick) { r.nap = ro.nap = 0; for (const x of g.kingdoms) if (x !== k && x !== o) { const rx = x.relation(k); rx.opinion -= 15; rx.memory += 8; } }
      g.declareWar(k, o, 'by order of its leader');
      return `⚔ War declared on ${g.kName(o)}`;
    case 'peace': {
      if (!k.atWar(o)) return 'You are not at war with them';
      const winning = ro.warScore - r.warScore; // how well they are doing
      const years = (g.tick - r.warStart) / TPY;
      const p = 0.35 - winning * 0.012 + ro.exhaustion * 0.004 + Math.min(0.3, years * 0.02) + (o.pop < o.peakPop * 0.6 ? 0.3 : 0);
      if (yes(p)) { g.makePeace(k, o, 'at the negotiating table'); return `☮ ${g.kName(o)} accepted peace`; }
      ro.memory += 3;
      return `${g.kName(o)} rejected peace${winning > 10 ? ' — they think they are winning' : ''}`;
    }
    case 'alliance':
      if (r.ally) return 'Already allies';
      if (k.atWar(o)) return 'Make peace first';
      if (yes((op - 10) / 50)) { r.ally = ro.ally = true; g.log(`🤝 ${g.kName(k)} and ${g.kName(o)} formed an alliance`, 'ally', -1, -1, '#8cf', true); return `🤝 Alliance with ${g.kName(o)} signed`; }
      return `${g.kName(o)} declined an alliance (they need to like you more — opinion ${Math.round(op)})`;
    case 'trade':
      if (r.trade) return 'Already trading';
      if (k.atWar(o)) return 'Make peace first';
      if (!hasTech(k, 'currency') || !hasTech(o, 'currency')) return 'Both nations need Currency to trade';
      if (yes((op + 25) / 50)) { r.trade = ro.trade = true; g.treaties++; g.log(`📜 ${g.kName(k)} and ${g.kName(o)} signed a trade agreement`, 'treaty', -1, -1, '#fc6', true); return '📜 Trade agreement signed'; }
      return `${g.kName(o)} refused to trade (opinion ${Math.round(op)})`;
    case 'nap':
      if (r.nap > g.tick) return 'A pact is already in force';
      if (k.atWar(o)) return 'Make peace first';
      if (yes((op + 40) / 60)) { r.nap = ro.nap = g.tick + TPY * 30; g.treaties++; g.log(`📜 ${g.kName(k)} and ${g.kName(o)} signed a 30-year non-aggression pact`, 'treaty', -1, -1, '#fc6', true); return '🕊 Non-aggression pact signed'; }
      return `${g.kName(o)} refused a non-aggression pact`;
    case 'gift': {
      const amt = Math.min(80, Math.floor(k.res[RES.GOLD]));
      if (amt < 20) return 'You need at least 20 gold to send a gift';
      k.res[RES.GOLD] -= amt;
      o.res[RES.GOLD] += amt;
      ro.opinion = Math.min(100, ro.opinion + amt / 4);
      ro.memory = Math.max(0, ro.memory - 5);
      return `🎁 Sent ${amt} gold — ${g.kName(o)} likes you more`;
    }
  }
}

// World politics: the World Council, global accords (nuclear ban, climate), nuclear arsenals.
import type { Game } from './game';
import { nukeAt, P } from './game';
import { Kingdom, City } from './entities';
import { TPY } from './defs';
import { TECH_BY_ID } from './tech';
import { SPECIES } from './species';
import { RES } from './terrain';

export interface Council { name: string; founded: number; members: Set<number>; sessions: number; }
export interface Accord { kind: 'nuclear_ban' | 'climate'; name: string; founded: number; signatories: Set<number>; withdrawn: Set<number>; }

export function hasTech(k: Kingdom, id: string): boolean {
  return !!k.techs[TECH_BY_ID[id].idx];
}

export function accord(g: Game, kind: Accord['kind']): Accord | undefined {
  return g.accords.find(a => a.kind === kind);
}

export function nukeBanned(g: Game, k: Kingdom): boolean {
  const a = accord(g, 'nuclear_ban');
  return !!a && a.signatories.has(k.id);
}

export function climateSigned(g: Game, k: Kingdom): boolean {
  const a = accord(g, 'climate');
  return !!a && a.signatories.has(k.id);
}

export function nuclearPowers(g: Game): Kingdom[] {
  return g.kingdoms.filter(k => k.warheads > 0 || (k.nuclearTested && !nukeBanned(g, k)));
}

/** Minutes to midnight on the doomsday clock (lower = more danger). */
export function doomsday(g: Game): number {
  let t = 0;
  for (const k of g.kingdoms) {
    t += k.warheads * 0.25;
    if (k.warheads > 0) for (const o of g.kingdoms) if (o !== k && k.atWar(o)) t += o.warheads > 0 ? 2.5 : 1;
  }
  if (g.lastNukeYear >= 0) t += Math.max(0, 6 - (g.year - g.lastNukeYear) / 5);
  if (g.heat > 0.6) t += (g.heat - 0.6) * 3;
  return Math.max(0.5, Math.min(17, 17 - t));
}

function largestCity(k: Kingdom): City | null {
  let best: City | null = null;
  for (const c of k.cities) if (!best || c.members.length > best.members.length) best = c;
  return best;
}

// ------------------------------------------------------------------ nuclear arsenals
export function nuclearTest(g: Game, k: Kingdom, sx: number, sy: number): void {
  const w = g.world;
  let spot: { x: number; y: number } | null = null, bs = -1e9;
  for (let s = 0; s < 120; s++) {
    const x = Math.floor(sx + g.rng.range(-60, 60)), y = Math.floor(sy + g.rng.range(-60, 60));
    if (!w.inb(x, y)) continue;
    const i = y * w.w + x;
    let near = 1e9;
    for (const c of g.cities) near = Math.min(near, Math.abs(c.x - x) + Math.abs(c.y - y));
    const score = Math.min(near, 40) + (w.ter[i] <= 1 ? 15 : 0) - Math.abs(x - sx) * 0.05;
    if (near > 18 && score > bs) { bs = score; spot = { x: x + 0.5, y: y + 0.5 }; }
  }
  k.nuclearTested = true;
  if (spot) nukeAt(g, spot.x, spot.y, null, true);
  g.log(`☢ ${g.kName(k)} tested its first atomic bomb — the world has a new nuclear power`, 'nuke', spot ? spot.x : sx, spot ? spot.y : sy, '#ff0', true);
  for (const o of g.kingdoms) if (o !== k) { const r = o.relation(k); r.opinion -= 8; r.memory += 4; }
}

export function launchNuke(g: Game, k: Kingdom, from: { cx: number; y: number }, tgt: City, why: string): void {
  k.lastLaunch = g.tick;
  k.warheads--;
  k.nukesLaunched++;
  const victim = tgt.kingdom;
  victim.nukedBy = k.id;
  victim.nukedAt = g.tick;
  g.shoot(P.MISSILE, from.cx, from.y, tgt.x, tgt.y, 0, 10, null, null, k);
  g.log(`☢ ${g.kName(k)} ${why} — a nuclear missile is inbound on ${tgt.name}!`, 'nuke', tgt.x, tgt.y, '#ff0', true);
}

/** Per-kingdom nuclear logic, called from kingdom special operations. */
export function nuclearPolicy(g: Game, k: Kingdom, silo: { cx: number; y: number } | null): void {
  const banned = nukeBanned(g, k);
  // dismantle under the ban
  if (banned && k.warheads > 0 && g.rng.chance(0.4)) {
    k.warheads--;
    if (k.warheads === 0) g.log(`${g.kName(k)} dismantled its last nuclear warhead`, 'treaty', -1, -1, '#9cf');
  }
  if (!k.caps.nukes || !silo) return;
  // build warheads
  const capN = 3 + k.cities.length + (k.wars > 0 ? 4 : 0);
  if (!banned && k.warheads < capN && k.res[RES.URANIUM] >= 3 && k.res[RES.METAL] >= 15 && g.rng.chance(k.wars > 0 ? 0.35 : 0.15)) {
    k.res[RES.URANIUM] -= 3;
    k.res[RES.METAL] -= 15;
    k.warheads++;
    if (!k.nuclearTested) nuclearTest(g, k, silo.cx, silo.y);
  }
  // withdrawing from the ban when facing annihilation
  if (banned && k.wars > 0 && k.pop < k.peakPop * 0.5 && g.rng.chance(0.01)) {
    const a = accord(g, 'nuclear_ban')!;
    a.signatories.delete(k.id);
    a.withdrawn.add(k.id);
    g.log(`⚠ ${g.kName(k)} withdrew from the ${a.name}`, 'treaty', -1, -1, '#f96', true);
    for (const o of g.kingdoms) if (o !== k) { const r = o.relation(k); r.opinion -= 25; r.memory += 15; }
    return;
  }
  if (banned || k.warheads <= 0 || !g.laws.nukes || k.wars === 0) return;
  if (g.tick - k.lastLaunch < TPY * 2) return; // command & control: no rapid-fire launches
  // retaliation: a nuclear power that was struck answers in kind
  if (k.nukedBy && g.tick - k.nukedAt < TPY * 4) {
    const att = g.kingdomById.get(k.nukedBy);
    if (att && att.alive && k.atWar(att) && g.rng.chance(0.3)) {
      const tgt = largestCity(att);
      if (tgt) { launchNuke(g, k, silo, tgt, 'retaliated'); return; }
    }
  }
  // first use: desperation, tempered by deterrence
  const desperate = k.pop < k.peakPop * 0.6 || (k.capital && k.capital.conquered === g.year) ? 5 : 1;
  for (const o of g.kingdoms) {
    if (!k.atWar(o)) continue;
    const deter = o.warheads > 0 ? 0.25 : 1;
    const losing = k.relation(o).warScore < o.relation(k).warScore - 30 ? 2.5 : 1;
    const p = 0.0035 * desperate * deter * losing * SPECIES[k.species].aggression * (g.combatNukes > 0 ? 1.5 : 1);
    if (g.rng.chance(p)) {
      const tgt = largestCity(o);
      if (tgt) { launchNuke(g, k, silo, tgt, desperate > 1 ? 'in desperation launched a first strike' : 'launched a nuclear first strike'); return; }
    }
  }
}

// ------------------------------------------------------------------ the World Council
const COUNCIL_NAMES = ['United Council of Nations', 'World Assembly', 'League of Nations', 'Concord of Peoples', 'Global Parliament'];

export function updateWorldPolitics(g: Game): void {
  // once per year
  g.nuclearWinter *= 0.9;
  if (g.nuclearWinter < 0.01) g.nuclearWinter = 0;
  for (const a of g.accords) for (const id of Array.from(a.signatories)) if (!g.kingdomById.get(id)?.alive) a.signatories.delete(id);
  if (!g.council) {
    const radio = g.kingdoms.filter(k => hasTech(k, 'radio'));
    if (radio.length >= 2) {
      const host = radio.reduce((a, b) => (b.pop > a.pop ? b : a), radio[0]);
      g.council = { name: g.rng.pick(COUNCIL_NAMES), founded: g.year, members: new Set(radio.map(k => k.id)), sessions: 0 };
      g.log(`🌐 The ${g.council.name} was founded in ${host.capital ? host.capital.name : g.kName(host)} — nations gather to keep the peace`, 'treaty', host.capital ? host.capital.x : -1, host.capital ? host.capital.y : -1, '#8cf', true);
    }
    return;
  }
  const C = g.council;
  for (const id of Array.from(C.members)) if (!g.kingdomById.get(id)?.alive) C.members.delete(id);
  for (const k of g.kingdoms) {
    if (!C.members.has(k.id) && hasTech(k, 'radio')) {
      C.members.add(k.id);
      g.log(`${g.kName(k)} joined the ${C.name}`, 'treaty', -1, -1, k.css);
    }
  }
  if (g.year % 5 !== 0) return;
  C.sessions++;
  const members = g.kingdoms.filter(k => C.members.has(k.id));
  // 1. mediate long wars between members
  for (const a of members) for (const b of members) {
    if (a.id >= b.id || !a.atWar(b)) continue;
    const years = (g.tick - a.relation(b).warStart) / TPY;
    if (years > 8 && g.rng.chance(0.3)) g.makePeace(a, b, `brokered by the ${C.name}`);
  }
  // 2. nuclear weapons ban
  const powers = nuclearPowers(g);
  let ban = accord(g, 'nuclear_ban');
  if (!ban && (g.combatNukes > 0 || powers.length >= 3) && members.length >= 2) {
    const signers = members.filter(k => voteBan(g, k));
    if (signers.length >= Math.max(2, Math.ceil(members.length * 0.5))) {
      const host = signers.reduce((a, b) => (b.pop > a.pop ? b : a), signers[0]);
      const place = host.capital ? host.capital.name : host.baseName;
      ban = { kind: 'nuclear_ban', name: `Treaty of ${place} on the Prohibition of Nuclear Weapons`, founded: g.year, signatories: new Set(signers.map(k => k.id)), withdrawn: new Set() };
      g.accords.push(ban);
      const nuc = signers.filter(k => k.warheads > 0 || k.nuclearTested).length;
      g.log(`🕊 ${signers.length} nations signed the ${ban.name}${nuc ? ` — ${nuc} nuclear power${nuc > 1 ? 's' : ''} will disarm` : ''}`, 'treaty', host.capital ? host.capital.x : -1, host.capital ? host.capital.y : -1, '#9f9', true);
    } else if (g.combatNukes > 0) {
      g.log(`The ${C.name} failed to pass a nuclear ban — only ${signers.length} of ${members.length} nations voted yes`, 'treaty', -1, -1, '#aaa');
    }
  } else if (ban) {
    for (const k of members) {
      if (ban.signatories.has(k.id)) continue;
      if (ban.withdrawn.has(k.id) && k.wars > 0) continue;
      if (voteBan(g, k) && g.rng.chance(0.35)) {
        ban.signatories.add(k.id);
        ban.withdrawn.delete(k.id);
        g.log(`🕊 ${g.kName(k)} signed the ${ban.name}`, 'treaty', -1, -1, '#9f9', k.warheads > 0 || k.nuclearTested);
      }
    }
    if (nuclearPowers(g).length === 0 && !g.nukeFreeAnnounced && g.kingdoms.some(k => k.nuclearTested)) {
      g.nukeFreeAnnounced = true;
      g.log('🌍 The last nuclear warhead on Earth has been dismantled. The world is free of nuclear weapons.', 'treaty', -1, -1, '#9f9', true);
    }
  }
  // 3. climate accord
  let climate = accord(g, 'climate');
  if (!climate && g.heat > 0.35 && members.length >= 2) {
    const signers = members.filter(k => g.rng.chance(k.caps.pollution > 0.5 ? 0.45 : 0.85));
    if (signers.length >= 2) {
      const host = signers[0];
      climate = { kind: 'climate', name: `${host.capital ? host.capital.name : host.baseName} Climate Accord`, founded: g.year, signatories: new Set(signers.map(k => k.id)), withdrawn: new Set() };
      g.accords.push(climate);
      g.log(`🌱 ${signers.length} nations signed the ${climate.name} to cut pollution`, 'treaty', -1, -1, '#9f9', true);
    }
  } else if (climate) {
    for (const k of members) if (!climate.signatories.has(k.id) && g.rng.chance(0.2)) {
      climate.signatories.add(k.id);
      g.log(`🌱 ${g.kName(k)} joined the ${climate.name}`, 'treaty', -1, -1, '#9f9');
    }
  }
}

function voteBan(g: Game, k: Kingdom): boolean {
  const nuclear = k.warheads > 0 || k.nuclearTested;
  let p = nuclear ? 0.15 : 0.85;
  if (g.combatNukes > 0) p += nuclear ? 0.25 : 0.1;
  if (g.lastNukeYear >= 0 && g.year - g.lastNukeYear < 20) p += 0.2;
  if (k.nukedBy) p += 0.3; // the victims of nuclear war push hardest
  p /= Math.sqrt(SPECIES[k.species].aggression);
  if (k.wars > 0 && nuclear) p *= 0.5;
  return g.rng.chance(Math.min(0.95, p));
}

// ------------------------------------------------------------------ nations splitting apart
/**
 * Large, strained nations can break in two along geographic lines — by civil war, or (in modern
 * times) by a peaceful dissolution. The breakaway half is named after its direction ("North X").
 */
export function considerSplit(g: Game, k: Kingdom): void {
  if (!g.laws.rebellions || k.cities.length < 9 || g.tick < k.splitCD) return;
  let loyal = 0;
  for (const c of k.cities) loyal += c.loyalty;
  loyal /= k.cities.length;
  const stress = 1 + k.wars * 0.6 + (loyal < 25 ? 1 : 0) + (k.cities.length > 16 ? 1 : 0);
  if (!g.rng.chance(Math.min(0.12, 0.004 * (k.cities.length - 8) * stress))) return;
  splitNation(g, k);
}

export function splitNation(g: Game, k: Kingdom): Kingdom | null {
  const cap = k.capital;
  if (!cap || k.cities.length < 6) return null;
  // the city farthest from the capital becomes the seed of the breakaway state
  let seed: City | null = null, far = 0;
  for (const c of k.cities) {
    const d = Math.hypot(c.x - cap.x, c.y - cap.y);
    if (d > far) { far = d; seed = c; }
  }
  if (!seed || far < 25) return null;
  const group = k.cities.filter(c => c !== cap && Math.hypot(c.x - seed!.x, c.y - seed!.y) < Math.hypot(c.x - cap.x, c.y - cap.y));
  if (group.length < 3 || group.length > k.cities.length - 3) return null;
  const counts = [0, 0, 0, 0];
  for (const c of group) for (const u of c.members) counts[u.species]++;
  let sp = k.species;
  for (let i = 0; i < counts.length; i++) if (counts[i] > counts[sp]) sp = i;
  const nk = g.createKingdom(sp, k);
  const dx = seed.x - cap.x, dy = seed.y - cap.y;
  const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'East' : 'West') : dy > 0 ? 'South' : 'North';
  nk.baseName = /^(North|South|East|West) /.test(k.baseName) ? seed.name : `${dir} ${k.baseName}`;
  const share = group.length / k.cities.length;
  const wh = Math.floor(k.warheads * share);
  k.warheads -= wh;
  nk.warheads = wh;
  nk.nuclearTested = wh > 0 || k.nuclearTested;
  for (const c of group) {
    const oi = k.cities.indexOf(c);
    if (oi >= 0) k.cities.splice(oi, 1);
    nk.cities.push(c);
    c.kingdom = nk;
    c.loyalty = 60;
    c.revoltT = 0;
    for (const u of c.members) { u.kingdom = nk; u.order = null; u.isKing = false; }
    for (const b of c.buildings) b.style = Math.min(b.style, nk.era);
    for (const i of c.tiles) g.world.markN(i);
  }
  nk.capital = group.reduce((a, b) => (b.members.length > a.members.length ? b : a), group[0]);
  k.links.clear();
  k.infra = null;
  k.splitCD = nk.splitCD = g.tick + TPY * 80;
  const leader = nk.capital.members.find(u => u.ageT >= 14 * TPY);
  if (leader) { nk.king = leader; leader.isKing = true; }
  const peaceful = k.era >= 6 ? g.rng.chance(0.55) : g.rng.chance(0.15);
  const oldName = g.kName(k);
  if (peaceful) {
    const r = k.relation(nk), ro = nk.relation(k);
    r.opinion = ro.opinion = 25;
    r.nap = ro.nap = g.tick + TPY * 30;
    g.log(`🗺 ${oldName} peacefully split in two — ${g.kName(nk)} is now independent`, 'split', nk.capital.x, nk.capital.y, nk.css, true);
  } else {
    g.log(`🗺 Civil war! ${oldName} has split and ${g.kName(nk)} fights for independence`, 'split', nk.capital.x, nk.capital.y, nk.css, true);
    g.declareWar(k, nk, 'civil war');
  }
  return nk;
}

// Kingdom-level AI: research, diplomacy, war, expansion, navies, air power, nukes, space.
import type { Game } from './game';
import { P } from './game';
import { Kingdom, City, Unit, ORD } from './entities';
import { UK, JOB, TPY, ADULT_AGE, SOLDIERS, SHIPS, PLANES } from './defs';
import { TECHS, NUM_TECH, canResearch, TECH_BY_ID } from './tech';
import { SPECIES } from './species';
import { T, TER, RES, isRoad } from './terrain';
import { refreshStats, MISSION } from './ai_units';
import { updateInfrastructure } from './infra';
import { nuclearPolicy, hasTech, considerSplit } from './politics';

const DT = 30;

export function updateKingdom(g: Game, k: Kingdom): void {
  if (k.cities.length === 0) {
    g.destroyKingdom(k, null);
    return;
  }
  k.t2++;
  let pop = 0, soldiers = 0, strength = 0;
  for (const c of k.cities) {
    pop += c.members.length;
    for (const u of c.members) if (u.job === JOB.SOLDIER) { soldiers++; strength += u.atk * Math.sqrt(u.maxHp); }
  }
  k.pop = pop;
  k.soldiers = soldiers;
  k.strength = strength + pop * 2;
  const largest = k.cities.reduce((a, b) => (b.members.length > a.members.length ? b : a), k.cities[0]);
  if (!k.capital || k.capital.dead || k.capital.kingdom !== k) k.capital = largest;
  else if (k.t2 % 20 === 0 && largest !== k.capital && k.capital.members.length < largest.members.length * 0.4 && largest.members.length > 30) {
    g.log(`${g.kName(k)} moved its capital from ${k.capital.name} to ${largest.name}`, 'city', largest.x, largest.y, k.css);
    k.capital = largest;
  }
  // royal succession
  if (!k.king || k.king.dead || k.king.kingdom !== k) {
    if (k.king && !k.king.dead) k.king.isKing = false;
    k.king = null;
    const cap = k.capital;
    let best: Unit | null = null;
    if (cap) for (const u of cap.members) if (u.ageT >= ADULT_AGE * TPY && (!best || u.ageT > best.ageT)) best = u;
    if (best) { k.king = best; best.isKing = true; refreshStats(g, best); }
  }
  if (g.laws.research) research(g, k, pop);
  for (const r of k.rel.values()) if (r.trade) k.res[RES.GOLD] += (1 + k.era * 0.3) * DT / TPY;
  diplomacy(g, k);
  if (k.t2 % 2 === 0) wars(g, k);
  if (k.t2 % 6 === 3) expand(g, k);
  if (k.t2 % 2 === 1) specialOps(g, k);
  updateInfrastructure(g, k);
  if (k.t2 % 10 === 7) considerSplit(g, k);
}

// ------------------------------------------------------------------ research
function research(g: Game, k: Kingdom, pop: number): void {
  const sp = SPECIES[k.species];
  let flat = 0;
  let powerBoost = 1;
  for (const c of k.cities) {
    for (const b of c.buildings) if (b.progress >= 1) flat += b.def.research * 0.6;
    if (c.has('power')) powerBoost = 1.1;
  }
  let rate = (0.5 * Math.pow(pop, 0.72) + Math.pow(flat, 0.85)) * sp.research * k.caps.researchMult * powerBoost;
  // sprawling empires lose efficiency to bureaucracy
  rate /= 1 + Math.max(0, k.cities.length - 6) * 0.045;
  if (k.ascended) rate *= 1.5;
  if (k.blackoutT > g.tick) rate *= 0.25; // solar flare: the grid is down
  if (k.researching < 0) pickTech(g, k);
  if (k.researching < 0) { k.researchRate = 0; return; }
  // technology diffuses from known neighbours
  let diff = 1;
  for (const o of g.kingdoms) {
    if (o === k || !o.techs[k.researching]) continue;
    const r = k.rel.get(o.id);
    if (r && !r.war && r.opinion > -40) diff += r.trade ? 0.3 : 0.12;
  }
  rate *= Math.min(2.2, diff) * g.laws.researchSpeed;
  k.researchRate = rate;
  k.progress += (rate * DT) / TPY;
  const td = TECHS[k.researching];
  if (k.progress >= td.cost) {
    k.progress -= td.cost;
    g.learnTech(k, td.idx);
    k.progress = Math.min(k.progress, 5);
    pickTech(g, k);
  }
}

export function pickTech(g: Game, k: Kingdom): void {
  const sp = SPECIES[k.species];
  let minEra = 99;
  const cands: number[] = [];
  for (let i = 0; i < NUM_TECH; i++) {
    if (canResearch(k.techs, i)) {
      cands.push(i);
      if (TECHS[i].era < minEra) minEra = TECHS[i].era;
    }
  }
  if (!cands.length) { k.researching = -1; return; }
  let total = 0;
  const ws = cands.map(i => {
    const t = TECHS[i];
    let w = (sp.techBias[t.cat] || 1) * Math.pow(0.3, t.era - minEra) * (0.5 + g.rng.next());
    if (k.wars > 0 && t.cat === 'mil') w *= 1.6;
    total += w;
    return w;
  });
  let r = g.rng.next() * total;
  for (let j = 0; j < cands.length; j++) {
    r -= ws[j];
    if (r <= 0) { k.researching = cands[j]; return; }
  }
  k.researching = cands[cands.length - 1];
}

// ------------------------------------------------------------------ diplomacy
function minCityDist(a: Kingdom, b: Kingdom): number {
  let best = 1e9;
  for (const c of a.cities) for (const d of b.cities) {
    const dd = Math.abs(c.x - d.x) + Math.abs(c.y - d.y);
    if (dd < best) best = dd;
  }
  return best;
}

function sameIsland(g: Game, a: Kingdom, b: Kingdom): boolean {
  const w = g.world;
  for (const c of a.cities) {
    const ci = w.tileAt(c.x, c.y);
    for (const d of b.cities) if (w.island[w.tileAt(d.x, d.y)] === w.island[ci]) return true;
  }
  return false;
}

function diplomacy(g: Game, k: Kingdom): void {
  const sp = SPECIES[k.species];
  for (const o of g.kingdoms) {
    if (o === k || !o.alive) continue;
    const r = k.relation(o);
    const dist = minCityDist(k, o);
    if (dist > 90 && !r.war && !r.ally) { r.opinion *= 0.98; continue; }
    let target = (o.species === k.species ? 25 : -5) - (sp.aggression - 1) * 18;
    if (dist < 30) target -= 26;
    else if (dist < 50) target -= 10;
    // great powers become rivals
    if (k.pop > 150 && o.pop > 150 && dist < 70) target -= 15;
    if (o.pop > k.pop * 2 && dist < 60) target -= 8;
    if (r.ally) target += 30;
    if (r.trade) target += 12;
    if (r.nap > g.tick) target += 6;
    if (g.council && g.council.members.has(k.id) && g.council.members.has(o.id)) target += 5;
    if (k.techs[TECH_BY_ID['currency'].idx] && o.techs[TECH_BY_ID['currency'].idx]) target += 6;
    if (k.techs[TECH_BY_ID['internet'].idx] && o.techs[TECH_BY_ID['internet'].idx]) target += 10;
    target -= r.memory;
    if (o.nukesLaunched > 0) target -= 20;
    // balance of power: everyone fears a hegemon
    if (o.pop > g.personPop * 0.45 && g.kingdoms.length > 2) target -= 20;
    r.opinion += (target - r.opinion) * 0.06 + g.rng.range(-3, 3);
    // border incidents keep the world from settling into eternal peace
    if (dist < 70 && !r.war && g.rng.chance(0.004)) {
      const hit = g.rng.range(15, 40);
      r.opinion -= hit;
      r.memory += hit * 0.4;
      const ro = o.relation(k);
      ro.opinion -= hit * 0.7;
      if (r.ally && g.rng.chance(0.3)) { r.ally = ro.ally = false; }
    }
    r.opinion = Math.max(-100, Math.min(100, r.opinion));
    r.memory *= 0.99;
    if (r.war) {
      if (r.trade) { r.trade = false; o.relation(k).trade = false; }
      r.exhaustion += 0.6;
      if (k.pop < k.peakPop * 0.6) r.exhaustion += 1.5;
      const ro = o.relation(k);
      const losing = r.warScore < ro.warScore - 20;
      if (losing) r.exhaustion += 1;
      const years = (g.tick - r.warStart) / TPY;
      // a side that is still taking cities presses on; stalemates and collapses end wars
      const oMomentum = g.tick - o.lastConquest < TPY * 5 && ro.warScore > r.warScore + 15;
      const kMomentum = g.tick - k.lastConquest < TPY * 5 && r.warScore > ro.warScore + 15;
      const stalemate = g.tick - Math.max(k.lastConquest, o.lastConquest, r.warStart) > TPY * 12;
      const collapsing = k.cities.length <= 2 || k.pop < k.peakPop * 0.35;
      let p = 0.0008 * r.exhaustion * (losing ? 1.5 : 1) * (stalemate ? 2.5 : 1);
      if (kMomentum) p *= 0.1;
      if (oMomentum && !o.player) p *= collapsing ? 0.5 : 0.08; // the winner refuses to stop
      if (k.player) { /* the player decides when to make peace */ }
      else if (years > 8 && g.rng.chance(p)) {
        if (o.player) g.log(`🏳 ${g.kName(k)} sued for peace with your nation`, 'peace', -1, -1, '#9f9', true);
        g.makePeace(k, o);
      } else if (years > 60 && g.rng.chance(0.03)) g.makePeace(k, o);
    } else if (g.laws.war) {
      const napActive = r.nap > g.tick;
      if (!k.player && g.tick > r.truce && k.wars < 2 && r.opinion < (napActive ? -60 : -18) && !r.ally && k.soldiers >= 3) {
        const reachable = dist < 80 && (sameIsland(g, k, o) || k.caps.ship >= 0);
        // nuclear deterrence: few dare attack a nuclear power
        const deter = o.warheads > 0 ? (k.warheads > 0 ? 0.25 : 0.08) : 1;
        if (reachable && k.strength > o.strength * 0.65 && g.rng.chance(0.012 * sp.aggression * deter)) {
          const reasons = ['over disputed borders', 'seeking glory', 'to claim fertile lands', 'after a border skirmish', 'over ancient grudges', 'for their resources', 'over a trade dispute', 'to liberate their kin'];
          if (napActive) {
            r.nap = 0; o.relation(k).nap = 0;
            for (const x of g.kingdoms) if (x !== k && x !== o) { const rx = x.relation(k); rx.opinion -= 15; rx.memory += 8; }
            g.declareWar(k, o, 'breaking their non-aggression pact');
          } else g.declareWar(k, o, g.rng.pick(reasons));
        }
      }
      // peaceful unification of small kin nations
      if (!o.player && o.species === k.species && r.opinion > 45 && o.cities.length <= 2 && o.pop < k.pop * 0.4 && dist < 70 && o.wars === 0 && g.rng.chance(0.006)) {
        const ro = o.relation(k);
        if (ro.opinion > 30) {
          for (const c of o.cities.slice()) g.captureCity(c, k, true, true);
          continue;
        }
      }
      // trade agreements
      if (!r.trade && r.opinion > 20 && dist < 110 && hasTech(k, 'currency') && hasTech(o, 'currency') && g.rng.chance(0.003)) {
        const ro = o.relation(k);
        if (ro.opinion > 10 && !ro.war) {
          r.trade = ro.trade = true;
          g.treaties++;
          g.log(`📜 ${g.kName(k)} and ${g.kName(o)} signed a trade agreement`, 'treaty', -1, -1, '#fc6');
        }
      }
      if (r.trade && r.opinion < -15) {
        r.trade = false; o.relation(k).trade = false;
        g.log(`${g.kName(k)} cancelled its trade agreement with ${g.kName(o)}`, 'treaty', -1, -1, '#aaa');
      }
      // non-aggression pacts between wary neighbours
      if (!napActive && !r.ally && dist < 70 && r.opinion > -10 && r.opinion < 50 && k.era >= 2 && g.rng.chance(0.0007)) {
        const ro = o.relation(k);
        if (ro.opinion > -10) {
          r.nap = ro.nap = g.tick + TPY * 30;
          g.treaties++;
          g.log(`📜 ${g.kName(k)} and ${g.kName(o)} signed a 30-year non-aggression pact`, 'treaty', -1, -1, '#fc6');
        }
      }
      if (!r.ally && r.opinion > 55 && g.rng.chance(0.01)) {
        const ro = o.relation(k);
        if (ro.opinion > 40) {
          r.ally = ro.ally = true;
          g.log(`🤝 ${g.kName(k)} and ${g.kName(o)} formed an alliance`, 'ally', -1, -1, '#8cf');
        }
      }
      if (r.ally && r.opinion < 15) {
        const ro = o.relation(k);
        r.ally = ro.ally = false;
        g.log(`The alliance between ${g.kName(k)} and ${g.kName(o)} has broken`, 'ally', -1, -1, '#aaa');
      }
    }
  }
}

// ------------------------------------------------------------------ war
function nearestEnemyCity(g: Game, k: Kingdom, from: City, sameIslandOnly: boolean): City | null {
  const w = g.world;
  const fi = w.island[w.tileAt(from.x, from.y)];
  let best: City | null = null, bd = 1e9;
  for (const o of g.kingdoms) {
    if (!k.atWar(o)) continue;
    for (const c of o.cities) {
      const same = w.island[w.tileAt(c.x, c.y)] === fi;
      if (sameIslandOnly && !same) continue;
      const d = Math.hypot(c.x - from.x, c.y - from.y) + (same ? 0 : 40);
      if (d < bd) { bd = d; best = c; }
    }
  }
  return best;
}

function wars(g: Game, k: Kingdom): void {
  if (k.wars === 0) { k.campaign = null; return; }
  defend(g, k);
  campaign(g, k);
  overseas(g, k);
}

function islandOf(g: Game, x: number, y: number): number {
  const i = g.world.tileAt(x, y);
  return i >= 0 ? g.world.island[i] : -1;
}

/** The next enemy city worth taking: close to our lands, weakly held, capitals preferred. */
function pickTarget(g: Game, k: Kingdom): { target: City; staging: City } | null {
  let best: City | null = null, stage: City | null = null, bs = 1e9;
  for (const o of g.kingdoms) {
    if (!k.atWar(o)) continue;
    for (const t of o.cities) {
      if (!t.center) continue;
      const isl = islandOf(g, t.x, t.y);
      let near: City | null = null, nd = 1e9;
      for (const c of k.cities) {
        if (islandOf(g, c.x, c.y) !== isl) continue;
        const d = Math.hypot(c.x - t.x, c.y - t.y);
        if (d < nd) { nd = d; near = c; }
      }
      if (!near || nd > 170) continue;
      let def = 0;
      for (const u of t.members) if (u.job === JOB.SOLDIER) def++;
      const score = nd + def * 0.5 - (t === o.capital ? 12 : 0) - Math.min(15, t.members.length * 0.05);
      if (score < bs) { bs = score; best = t; stage = near; }
    }
  }
  return best && stage ? { target: best, staging: stage } : null;
}

function newCampaign(g: Game, k: Kingdom, p: { target: City; staging: City }, taken: number): void {
  const w = g.world;
  const t = p.target, s = p.staging;
  const dx = t.x - s.x, dy = t.y - s.y, d = Math.hypot(dx, dy) || 1;
  const step = Math.min(12, d * 0.4);
  let rx = s.x + (dx / d) * step, ry = s.y + (dy / d) * step;
  const li = w.nearestLand(rx, ry, 6);
  if (li >= 0) { rx = (li % w.w) + 0.5; ry = ((li / w.w) | 0) + 0.5; }
  // short hops (after taking a neighbouring city) skip the muster
  k.campaign = { target: t, rx, ry, phase: d < 28 ? 1 : 0, since: g.tick, size: 0, taken, ax: rx, ay: ry };
}

/** Massed campaigns: the army musters near the front, marches on one city and presses on after taking it. */
function campaign(g: Game, k: Kingdom): void {
  let cp = k.campaign;
  if (cp) {
    const t = cp.target;
    if (t.kingdom === k) {
      k.lastConquest = g.tick;
      k.campaign = null;
      if (k.player) { g.log(`🏴 Your army took ${t.name} — pick the next target with ⚔ Attack`, 'conquest', t.x, t.y, k.css, true); return; }
      const next = pickTarget(g, k);
      if (next) newCampaign(g, k, next, cp.taken + 1);
      cp = k.campaign;
    } else if (t.dead || !k.atWar(t.kingdom) || g.tick - cp.since > TPY * (cp.phase === 0 ? 3 : 9)) {
      for (const c of k.cities) for (const u of c.members) if (u.order && u.order.city === t) u.order = null;
      k.campaign = null;
      cp = null;
    }
  }
  if (!cp) {
    if (k.player) return; // the player chooses targets
    const next = pickTarget(g, k);
    if (!next) return;
    newCampaign(g, k, next, 0);
    cp = k.campaign!;
  }
  const t = cp.target;
  const isl = islandOf(g, t.x, t.y);
  let committed = 0, gathered = 0, sx = 0, sy = 0, sn = 0;
  for (const c of k.cities) {
    if (islandOf(g, c.x, c.y) !== isl) continue;
    const sol = c.members.filter(u => u.job === JOB.SOLDIER && !u.inBoat);
    // keep a garrison at home, a bigger one where the enemy is near
    const keep = Math.ceil(sol.length * (g.tick - c.lastAttacked < TPY ? 0.5 : 0.2));
    let kept = 0;
    for (const u of sol) {
      if (u.order) {
        if (u.order.city === t) {
          committed++;
          if (Math.hypot(u.x - t.x, u.y - t.y) > 6) { sx += u.x; sy += u.y; sn++; }
          if (cp.phase === 0 && Math.hypot(u.x - cp.rx, u.y - cp.ry) < 10) gathered++;
        }
        continue;
      }
      if (kept < keep) { kept++; continue; }
      u.order = cp.phase === 0
        ? { type: ORD.MUSTER, city: t, x: cp.rx, y: cp.ry, since: g.tick }
        : { type: ORD.ATTACK, city: t, x: t.x, y: t.y, since: g.tick };
      u.path = null;
      u.phase = 0;
      committed++;
    }
  }
  cp.size = committed;
  if (sn) { cp.ax = sx / sn; cp.ay = sy / sn; } else { cp.ax = t.x; cp.ay = t.y; }
  if (cp.phase === 0 && committed > 0 && ((gathered >= committed * 0.7 && gathered >= 4) || g.tick - cp.since > TPY * 1.5)) {
    cp.phase = 1;
    cp.since = g.tick;
    for (const c of k.cities) for (const u of c.members) {
      if (u.order && u.order.type === ORD.MUSTER && u.order.city === t) {
        u.order = { type: ORD.ATTACK, city: t, x: t.x, y: t.y, since: g.tick };
        u.path = null;
      }
    }
    if (committed >= 20) g.log(`⚔ An army of ${committed} from ${g.kName(k)} marches on ${t.name}`, 'campaign', t.x, t.y, k.css, committed >= 50);
  }
}

/** Cities under attack call in reinforcements from nearby cities of the realm. */
function defend(g: Game, k: Kingdom): void {
  let handled = 0;
  for (const c of k.cities) {
    if (handled >= 3) break;
    if (g.tick - c.lastAttacked > 60) continue;
    let foes = 0;
    g.spatial.query(c.x, c.y, 15, o => { if (o.kind === UK.PERSON && o.job === JOB.SOLDIER && o.kingdom && o.kingdom !== k && k.atWar(o.kingdom)) foes++; });
    if (foes < 3) continue;
    handled++;
    let defenders = 0;
    for (const u of c.members) if (u.job === JOB.SOLDIER && !u.order) defenders++;
    let need = Math.ceil(foes * 1.3) - defenders;
    const isl = islandOf(g, c.x, c.y);
    for (const o of k.cities) {
      if (need <= 0) break;
      if (o === c || g.tick - o.lastAttacked < 60 || Math.hypot(o.x - c.x, o.y - c.y) > 80 || islandOf(g, o.x, o.y) !== isl) continue;
      const free = o.members.filter(u => u.job === JOB.SOLDIER && !u.inBoat && (!u.order || u.order.type === ORD.MUSTER));
      const send = Math.min(need, Math.floor(free.length * 0.6));
      for (let i = 0; i < send; i++) {
        free[i].order = { type: ORD.DEFEND, city: c, x: c.x, y: c.y, since: g.tick };
        free[i].path = null;
        free[i].phase = 0;
      }
      need -= send;
    }
  }
}

/** Invasions across the sea when the enemy cannot be reached by land. */
function overseas(g: Game, k: Kingdom): void {
  if (!g.rng.chance(0.5)) return;
  for (const c of k.cities) {
    const docks = c.find('docks');
    if (!docks || k.caps.ship < 0 || k.res[RES.WOOD] < 10) continue;
    const idle = c.members.filter(u => u.job === JOB.SOLDIER && !u.inBoat && !u.order);
    const send = idle.length - Math.ceil(idle.length * 0.3);
    if (send < 3) continue;
    const near = nearestEnemyCity(g, k, c, true);
    if (near && k.campaign && islandOf(g, k.campaign.target.x, k.campaign.target.y) === islandOf(g, c.x, c.y)) continue;
    const far = nearestEnemyCity(g, k, c, false);
    if (!far || islandOf(g, far.x, far.y) === islandOf(g, c.x, c.y)) continue;
    const landing = landingSpot(g, docks.cx, docks.cy, far);
    if (!landing) continue;
    k.res[RES.WOOD] -= 10;
    const ship = Math.max(0, Math.min(k.caps.ship, SHIPS.length - 1));
    let i = 0;
    for (let b = 0; b < 3 && i < send; b++) {
      const boat = spawnBoat(g, k, docks.cx, docks.cy, ship, MISSION.TRANSPORT, landing.x, landing.y);
      if (!boat) break;
      for (let n = 0; n < SHIPS[ship].cap && i < send; n++, i++) {
        const u = idle[i];
        u.order = { type: ORD.ATTACK, city: far, x: far.x, y: far.y, since: g.tick };
        u.inBoat = boat;
        u.path = null;
        u.tUnit = null;
        boat.cargo!.push(u);
      }
    }
    if (i >= 12) g.log(`⛵ ${g.kName(k)} launched a seaborne invasion of ${far.name} with ${i} troops`, 'campaign', far.x, far.y, k.css, i >= 30);
    return;
  }
}

/** Find a water tile in the same water body as (x,y) next to land near target. */
export function landingSpot(g: Game, x: number, y: number, target: { x: number; y: number }): { x: number; y: number } | null {
  const w = g.world;
  const src = w.nearestWater(x, y, 4);
  if (src < 0) return null;
  const body = w.water[src];
  const ti = w.tileAt(target.x, target.y);
  if (ti < 0) return null;
  const island = w.island[ti];
  let best: { x: number; y: number } | null = null, bd = 1e9;
  for (let r = 2; r <= 22 && !best; r += 2) {
    for (let k = 0; k < 40; k++) {
      const ang = g.rng.next() * Math.PI * 2;
      const tx = Math.floor(target.x + Math.cos(ang) * r), ty = Math.floor(target.y + Math.sin(ang) * r);
      if (!w.inb(tx, ty)) continue;
      const i = ty * w.w + tx;
      if (!w.isWater(i) || w.water[i] !== body) continue;
      const li = w.nearestLand(tx + 0.5, ty + 0.5, 1);
      if (li < 0 || w.island[li] !== island) continue;
      const d = Math.hypot(tx - target.x, ty - target.y);
      if (d < bd) { bd = d; best = { x: tx + 0.5, y: ty + 0.5 }; }
    }
  }
  return best;
}

export function spawnBoat(g: Game, k: Kingdom, x: number, y: number, vclass: number, mission: number, mx: number, my: number): Unit | null {
  const w = g.world;
  const wi = w.nearestWater(x, y, 4);
  if (wi < 0) return null;
  const b = g.spawnUnit(UK.BOAT, (wi % w.w) + 0.5, ((wi / w.w) | 0) + 0.5);
  b.kingdom = k;
  b.vclass = vclass;
  b.mission = mission;
  b.mx = mx;
  b.my = my;
  b.cargo = [];
  refreshStats(g, b);
  b.hp = b.maxHp;
  return b;
}

// ------------------------------------------------------------------ expansion
function citySiteScore(g: Game, k: Kingdom, x: number, y: number): number {
  const w = g.world;
  const i = y * w.w + x;
  if (!TER[w.ter[i]].build || w.owner[i] || w.bld[i]) return -1e9;
  for (const c of g.cities) if (Math.hypot(c.x - x, c.y - y) < 14) return -1e9;
  let score = 0;
  const pref = SPECIES[k.species].prefers;
  // towns spring up along roads and highways
  let road = 0;
  for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
    const tx = x + dx, ty = y + dy;
    if (w.inb(tx, ty) && isRoad(w.ter[ty * w.w + tx]) && !w.owner[ty * w.w + tx]) road++;
  }
  if (road) score += Math.min(14, 6 + road);
  for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
    const tx = x + dx, ty = y + dy;
    if (!w.inb(tx, ty)) { score -= 2; continue; }
    const j = ty * w.w + tx;
    if (w.owner[j]) score -= 3;
    const t = w.ter[j];
    if (TER[t].build) score += 1 + TER[t].fert;
    if (pref.includes(t)) score += 0.5;
    if (w.flora[j]) score += 0.3;
    if (w.isWater(j)) score += 0.2;
  }
  return score;
}

function expand(g: Game, k: Kingdom): void {
  const maxCities = 3 + Math.floor(k.era * 2) + Math.floor(k.pop / 30);
  if (k.cities.length >= Math.min(45, maxCities)) return;
  const w = g.world;
  for (const c of k.cities) {
    if (c.members.length < 20 || c.food < 15 || !g.rng.chance(c.members.length > 90 ? 0.7 : 0.35)) continue;
    const ci = w.tileAt(c.x, c.y);
    const island = w.island[ci];
    let best: { x: number; y: number } | null = null, bs = 10;
    for (let s = 0; s < 50; s++) {
      const ang = g.rng.next() * Math.PI * 2;
      const r = 15 + g.rng.next() * 35;
      const x = Math.floor(c.x + Math.cos(ang) * r), y = Math.floor(c.y + Math.sin(ang) * r);
      if (x < 4 || y < 4 || x >= w.w - 4 || y >= w.h - 4) continue;
      const i = y * w.w + x;
      if (w.island[i] !== island) continue;
      const sc = citySiteScore(g, k, x, y) - r * 0.3;
      if (sc > bs) { bs = sc; best = { x: x + 0.5, y: y + 0.5 }; }
    }
    // young families set out to found new towns
    const settlers = c.members.filter(u => u.ageT >= ADULT_AGE * TPY && u.ageT < 40 * TPY && u.job !== JOB.SOLDIER && !u.order && !u.isKing)
      .sort((a, b) => a.ageT - b.ageT).slice(0, c.members.length >= 40 ? 8 : 5);
    if (settlers.length < 3) continue;
    const docks = c.find('docks');
    // seafaring nations also colonize other continents, not only when home is full
    const preferSea = !!docks && k.caps.ship >= 1 && g.rng.chance(0.3);
    if (best && !preferSea) {
      settleOnLand(g, k, c, settlers, best);
      return;
    }
    if (docks && k.caps.ship >= 0 && colonizeOverseas(g, k, c, docks, island, settlers)) return;
    if (best) { settleOnLand(g, k, c, settlers, best); return; }
  }
}

function settleOnLand(g: Game, k: Kingdom, c: City, settlers: Unit[], best: { x: number; y: number }): void {
  for (const u of settlers) {
    g.removeFromCity(u);
    u.kingdom = k;
    u.job = JOB.SETTLER;
    u.order = { type: ORD.SETTLE, city: null, x: best.x, y: best.y, since: g.tick };
    u.path = null;
    u.phase = 0;
    u.carry = -1;
  }
  c.food -= 10;
}

function colonizeOverseas(g: Game, k: Kingdom, c: City, docks: { cx: number; cy: number }, island: number, settlers: Unit[]): boolean {
  const w = g.world;
  let site: { x: number; y: number } | null = null, ss = 12;
  const src = w.nearestWater(docks.cx, docks.cy, 4);
  if (src < 0) return false;
  const body = w.water[src];
  const range = 40 + k.caps.ship * 45;
  for (let s = 0; s < 120; s++) {
    const x = Math.floor(c.x + g.rng.range(-range, range)), y = Math.floor(c.y + g.rng.range(-range, range));
    if (x < 4 || y < 4 || x >= w.w - 4 || y >= w.h - 4) continue;
    const i = y * w.w + x;
    if (w.island[i] === island || w.island[i] < 0) continue;
    const wi = w.nearestWater(x + 0.5, y + 0.5, 6);
    if (wi < 0 || w.water[wi] !== body) continue;
    // empty lands are the most tempting
    const sc = citySiteScore(g, k, x, y) + (w.owner[i] ? 0 : 6);
    if (sc > ss) { ss = sc; site = { x: x + 0.5, y: y + 0.5 }; }
  }
  if (!site) return false;
  const landing = landingSpot(g, docks.cx, docks.cy, site);
  if (!landing) return false;
  const boat = spawnBoat(g, k, docks.cx, docks.cy, Math.max(0, Math.min(k.caps.ship, 5)), MISSION.TRANSPORT, landing.x, landing.y);
  if (!boat) return false;
  for (const u of settlers) {
    g.removeFromCity(u);
    u.kingdom = k;
    u.job = JOB.SETTLER;
    u.order = { type: ORD.SETTLE, city: null, x: site.x, y: site.y, since: g.tick };
    u.inBoat = boat;
    u.path = null;
    u.tUnit = null;
    u.carry = -1;
    boat.cargo!.push(u);
  }
  g.log(`⛵ Colonists from ${c.name} set sail for new lands`, 'colony', c.x, c.y, k.css);
  return true;
}

// ------------------------------------------------------------------ navies, air, nukes, space
function specialOps(g: Game, k: Kingdom): void {
  const w = g.world;
  const atWar = k.wars > 0;
  // warships
  if (atWar && k.caps.ship >= 1 && g.rng.chance(0.18)) {
    for (const c of k.cities) {
      const docks = c.find('docks');
      if (!docks) continue;
      const tgt = nearestEnemyCity(g, k, c, false);
      if (!tgt || Math.hypot(tgt.x - c.x, tgt.y - c.y) > 90) continue;
      const spot = landingSpot(g, docks.cx, docks.cy, tgt);
      if (!spot) continue;
      if (k.res[RES.WOOD] < 15) break;
      k.res[RES.WOOD] -= 15;
      if (k.caps.ship >= 3) k.res[RES.METAL] = Math.max(0, k.res[RES.METAL] - 5);
      const b = spawnBoat(g, k, docks.cx, docks.cy, Math.min(k.caps.ship, 5), MISSION.WAR, spot.x, spot.y);
      if (b) b.cargo = null;
      break;
    }
  }
  if (atWar && !k.player) warStrikes(g, k);
  // world markets: buy strategic resources the homeland lacks
  // (building stone and timber too, so stone-poor nations can still raise modern cities)
  const imports: [number, number, number][] = [[RES.STONE, 60 + k.era * 15, 2], [RES.WOOD, 40 + k.era * 10, 2], [RES.COAL, 40, 5], [RES.OIL, 70 + k.era * 4, 6], [RES.URANIUM, 30, 14], [RES.METAL, 60 + k.era * 25, 3]];
  // export surpluses to pay for it
  for (const [r, price] of [[RES.METAL, 2], [RES.STONE, 1], [RES.OIL, 3], [RES.COAL, 2]] as [number, number][]) {
    const extra = k.res[r] - (r === RES.METAL ? 600 : 400);
    if (extra > 0) { const n = Math.min(40, Math.floor(extra)); k.res[r] -= n; k.res[RES.GOLD] += n * price; }
  }
  for (const [r, want, price] of imports) {
    if ((r > RES.STONE && !k.caps.extract.has(r)) || k.res[r] >= want || !hasTech(k, 'currency')) continue;
    const n = Math.min(r <= RES.METAL ? 25 : 8, Math.floor(want - k.res[r]), Math.floor(k.res[RES.GOLD] * 0.5 / price));
    if (n > 0) { k.res[RES.GOLD] -= n * price; k.res[r] += n; }
  }
  // nuclear arsenal, deterrence, strikes and disarmament
  let silo = null;
  for (const c of k.cities) { silo = c.find('silo'); if (silo) break; }
  nuclearPolicy(g, k, silo);
  // space program
  if (k.caps.space) {
    for (const c of k.cities) {
      const port = c.find('spaceport');
      if (!port) continue;
      c.launchT += 2;
      if (c.launchT < 160) continue;
      if (k.res[RES.METAL] < 20 || k.res[RES.OIL] < 8) continue;
      c.launchT = 0;
      k.res[RES.METAL] -= 20;
      k.res[RES.OIL] -= 8;
      k.launches++;
      g.emit({ kind: 'rocket', x: port.cx, y: port.cy, color: k.css });
      if (k.caps.colonize) {
        k.colonyShips++;
        if (k.colonyShips >= 5 && !k.ascended) {
          k.ascended = true;
          g.log(`🚀 ${g.kName(k)} has colonized the stars! Their civilization ascends.`, 'ascend', port.cx, port.cy, '#ffe680', true);
          g.emit({ kind: 'fireworks', x: port.cx, y: port.cy - 3, color: '#ffe680' });
        } else g.log(`${g.kName(k)} launched colony ship ${k.colonyShips}/5 toward the stars`, 'space', port.cx, port.cy, k.css, k.colonyShips === 1);
      } else if (k.launches === 1) g.log(`🛰 ${g.kName(k)} launched the world's first rocket into orbit!`, 'space', port.cx, port.cy, k.css, true);
      break;
    }
  }
  void w;
}

// ------------------------------------------------------------------ strategic strikes
function enemyCities(g: Game, k: Kingdom): City[] {
  const out: City[] = [];
  for (const o of g.kingdoms) if (k.atWar(o)) for (const c of o.cities) if (c.center) out.push(c);
  return out;
}

function nearestTarget(k: Kingdom, from: { x: number; y: number }, targets: City[], range: number): City | null {
  let best: City | null = null, bd = range;
  for (const c of targets) {
    // prefer big, close cities
    const d = Math.hypot(c.x - from.x, c.y - from.y) - Math.min(30, c.members.length * 0.1);
    if (d < bd) { bd = d; best = c; }
  }
  void k;
  return best;
}

/** Bombers, cruise missiles and orbital strikes: modern wars are fought from the air. */
function warStrikes(g: Game, k: Kingdom): void {
  const targets = enemyCities(g, k);
  if (!targets.length) return;
  const doctrine = [0.4, 1, 1.8][g.laws.nukeDoctrine ?? 1];
  // air raids from every airbase
  if (k.caps.air >= 0) {
    let raids = 0;
    for (const c of k.cities) {
      if (raids >= 2) break;
      const base = c.find('airbase');
      if (!base || !g.rng.chance(0.45 * doctrine)) continue;
      const tgt = nearestTarget(k, base, targets, 140 + k.caps.air * 40);
      if (!tgt) continue;
      if (launchAirRaid(g, k, c, tgt)) raids++;
    }
  }
  // cruise missiles (Atomic Age onwards)
  if (k.caps.cruise && g.rng.chance(0.3 * doctrine)) {
    const src = k.cities.find(c => c.find('silo') || c.find('airbase') || c.find('spaceport'));
    if (src) {
      const tgt = nearestTarget(k, src, targets, 400);
      if (tgt) launchCruise(g, k, src, tgt, 1 + Math.floor(k.era / 4));
    }
  }
  // kinetic rods from orbit
  if (k.caps.orbital && g.rng.chance(0.25 * doctrine)) {
    const port = k.cities.find(c => c.find('spaceport'));
    if (port) {
      const tgt = targets[g.rng.int(targets.length)];
      orbitalStrike(g, k, tgt, 1 + g.rng.int(2));
    }
  }
}

export function launchAirRaid(g: Game, k: Kingdom, from: City, tgt: City): boolean {
  const base = from.find('airbase');
  if (!base || k.caps.air < 0) return false;
  if (k.res[RES.OIL] < 1 && k.caps.air < 3) {
    if (k.res[RES.GOLD] < 8) return false;
    k.res[RES.GOLD] -= 8; // buy fuel on the world market
  } else k.res[RES.OIL] = Math.max(0, k.res[RES.OIL] - 1);
  const vc = Math.min(k.caps.air, PLANES.length - 1);
  const n = 2 + Math.floor(k.caps.air / 2);
  for (let j = 0; j < n; j++) {
    const p = g.spawnUnit(UK.PLANE, base.cx + j * 0.8, base.cy + (j % 2) * 0.8);
    p.kingdom = k;
    p.vclass = vc;
    p.mission = MISSION.BOMB;
    p.mx = tgt.x + g.rng.range(-3, 3);
    p.my = tgt.y + g.rng.range(-3, 3);
    p.homeX = base.cx;
    p.homeY = base.cy;
    p.carryAmt = PLANES[vc].cap;
    refreshStats(g, p);
    p.hp = p.maxHp;
  }
  if (g.rng.chance(0.15)) g.log(`✈ ${g.kName(k)} bombers are striking ${tgt.name}`, 'war', tgt.x, tgt.y, k.css);
  return true;
}

export function launchCruise(g: Game, k: Kingdom, from: City, tgt: City, n: number): number {
  let fired = 0;
  for (let j = 0; j < n; j++) {
    if (k.res[RES.METAL] < 4) break;
    k.res[RES.METAL] -= 4;
    const tx = tgt.x + g.rng.range(-4, 4), ty = tgt.y + g.rng.range(-4, 4);
    g.shoot(P.CRUISE, from.x + g.rng.range(-1, 1), from.y - 1, tx, ty, 260 + k.era * 30, 3 + k.era * 0.12, null, null, k);
    fired++;
  }
  if (fired && g.rng.chance(0.2)) g.log(`🚀 ${g.kName(k)} fired ${fired} cruise missile${fired > 1 ? 's' : ''} at ${tgt.name}`, 'war', tgt.x, tgt.y, k.css);
  return fired;
}

export function orbitalStrike(g: Game, k: Kingdom, tgt: City, n: number): number {
  let fired = 0;
  for (let j = 0; j < n; j++) {
    if (k.res[RES.METAL] < 8) break;
    k.res[RES.METAL] -= 8;
    const tx = tgt.x + g.rng.range(-5, 5), ty = tgt.y + g.rng.range(-5, 5);
    g.shoot(P.ORBITAL, tx + 6, ty - 70, tx, ty, 0, 5, null, null, k);
    fired++;
  }
  if (fired) g.log(`🛰 ${g.kName(k)} called down an orbital strike on ${tgt.name}`, 'war', tgt.x, tgt.y, k.css, g.rng.chance(0.3));
  return fired;
}

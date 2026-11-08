import type { WorldState } from '../types/World';
import type { Country } from '../types/Country';
import type { UnitType, Division } from '../types/Military';
import { UNITS, PERSONALITIES, SHIPS, PLANES } from '../data/defs';
import { TERRAINS } from '../data/terrain';
import { rand, pick } from '../simulation/rng';
import { enemiesOf, isAtWar, atWar, countryNeighbors, getRel, alliesOf, warsOf } from '../simulation/WorldHelpers';
import { recruit, recruitQuote, unitAvailable, orderMove, findPath, buyShip, buyPlanes } from '../simulation/MilitarySimulation';
import { navalPower } from '../simulation/EconomySimulation';

export function targetDivisions(w: WorldState, c: Country) {
  const P = PERSONALITIES[c.personality];
  let t = 2 + c.provinceCount * 0.3 + Math.sqrt(c.gdp) * 0.5;
  t *= P.mil;
  if (isAtWar(w, c.id)) t *= 1.6;
  const threat = [...countryNeighbors(w, c.id)].some(n => getRel(w, c.id, n) < -40 && w.countries[n].militaryPower > c.militaryPower);
  if (threat) t *= 1.3;
  for (const g of c.goals) if (g.type === 'army') t *= 1.4;
  return Math.round(t);
}

/** 병력 생산: 목표 대비 부족분을 훈련 대기열에 넣는다 (전시에는 한 번에 여러 개) */
export function recruitAI(w: WorldState, c: Country) {
  const mine = w.divisions.filter(d => d.owner === c.id);
  const training = c.training?.length || 0;
  const target = targetDivisions(w, c);
  const war = isAtWar(w, c.id);
  const upkeepDay = mine.reduce((a, d) => a + UNITS[d.type].upkeep, 0);
  const maxUpkeep = Math.max(0.02, c.income * (war ? 0.8 : 0.45));
  let deficit = target - mine.length - training;
  let orders = war ? 4 : 2;
  const front = frontProvinces(w, c.id);
  const counts: Record<string, number> = {};
  for (const d of mine) counts[d.type] = (counts[d.type] || 0) + 1;
  while (deficit > 0 && orders > 0 && upkeepDay < maxUpkeep) {
    const mix: [UnitType, number][] = [['infantry', 0.45], ['artillery', 0.14], ['armor', 0.12], ['mechanized', 0.1], ['antitank', 0.06], ['antiair', 0.05], ['engineer', 0.04], ['special', 0.04]];
    let best: UnitType = 'infantry', bd = -Infinity;
    for (const [t, share] of mix) {
      if (!unitAvailable(w, c.id, t)) continue;
      const d = share - (counts[t] || 0) / Math.max(1, mine.length + training);
      if (d > bd) { bd = d; best = t; }
    }
    // 돈이 부족하면 보병
    if (recruitQuote(w, c.id, best).cost > c.treasury * 0.6) best = 'infantry';
    const pid = front.length ? pick(front) : undefined;
    const err = recruit(w, c.id, best, pid);
    if (err) break;
    counts[best] = (counts[best] || 0) + 1;
    deficit--; orders--;
  }
  if (!war && (mine.length > target * 1.6 || (upkeepDay > c.income * 1.1 && c.treasury < 1))) {
    // 평시에만 감축
    const weakest = [...mine].sort((a, b) => a.strength - b.strength)[0];
    if (weakest) { w.divisions = w.divisions.filter(d => d.id !== weakest.id); c.manpower += weakest.strength * 0.8; }
  }
  // 해군/공군
  const coastal = w.provinces[c.capital]?.coastal || w.provinces.some(p => p.owner === c.id && p.buildings.port);
  if (coastal && c.treasury > c.gdp * 0.08 && rand() < 0.3 * PERSONALITIES[c.personality].mil) {
    const types = (Object.keys(SHIPS) as (keyof typeof SHIPS)[]).filter(t => c.tech.naval >= SHIPS[t].req);
    const t = c.ships.transport < 3 ? 'transport' : pick(types);
    buyShip(w, c.id, t);
  }
  if (c.tech.military >= 2 && c.treasury > c.gdp * 0.08 && rand() < 0.3) {
    const types = (Object.keys(PLANES) as (keyof typeof PLANES)[]).filter(t => c.tech.military >= PLANES[t].req || c.tech.industry >= PLANES[t].req);
    if (types.length) buyPlanes(w, c.id, pick(types), 10);
  }
}

/** 적과 맞닿은 아군 통제 프로빈스 */
export function frontProvinces(w: WorldState, cid: number): number[] {
  const enemies = new Set(enemiesOf(w, cid));
  if (!enemies.size) return [];
  const out: number[] = [];
  for (const p of w.provinces) {
    if (!p.active || p.controller !== cid) continue;
    if (p.neighbors.some(n => enemies.has(w.provinces[n].controller))) out.push(p.id);
  }
  return out;
}

function stackPower(divs: Division[], attack: boolean) {
  let s = 0; for (const d of divs) { const u = UNITS[d.type]; s += (attack ? u.atk : u.def) * (d.strength / u.hp) * (0.3 + 0.7 * d.org); }
  return s;
}

/**
 * 작전 AI (전선 체계)
 *  1) 적과 맞닿은 아군 지역 = 전선. 모든 전선 지역에 최소 1개 사단을 두어 전선을 유지한다.
 *  2) 위협(인접 적 병력)에 비례해 병력을 배분하고, 15%는 예비대로 남긴다.
 *  3) 아군 후방에 침투한 적은 예비대가 반격한다.
 *  4) 공세: 승산이 가장 높은 1~N개 지점에 병력을 집중한다 (전선 유지 병력은 남김).
 *  5) 육상 전선이 없으면 해상 상륙.
 */
export function operationsAI(w: WorldState, c: Country) {
  const all = w.divisions.filter(d => d.owner === c.id);
  const mine = all.filter(d => d.aiControlled && d.battle < 0);
  if (!mine.length) return;
  const P = PERSONALITIES[c.personality];
  const enemies = new Set(enemiesOf(w, c.id));
  if (!enemies.size) { peaceDeployment(w, c, mine); return; }
  const hostileAt = (pid: number) => enemies.has(w.provinces[pid].controller);
  // 전선
  const front: number[] = [];
  const threat = new Map<number, number>();
  const enemyPow = new Map<number, number>();
  for (const d of w.divisions) if (enemies.has(d.owner)) enemyPow.set(d.province, (enemyPow.get(d.province) || 0) + stackPower([d], true));
  for (const p of w.provinces) {
    if (!p.active || p.controller !== c.id) continue;
    const adj = p.neighbors.filter(hostileAt);
    if (!adj.length) continue;
    front.push(p.id);
    threat.set(p.id, 0.6 + adj.length * 0.3 + adj.reduce((a, n) => a + (enemyPow.get(n) || 0), 0) / 10 + (p.id === c.capital ? 2 : 0) + p.pop / 3e6);
  }
  const count = new Map<number, number>();
  for (const d of all) count.set(d.province, (count.get(d.province) || 0) + 1);
  const free = new Set(mine.filter(d => !d.path.length).map(d => d.id));
  const byId = new Map(mine.map(d => [d.id, d]));
  const send = (d: Division, to: number) => { if (orderMove(w, [d.id], to)) { free.delete(d.id); count.set(d.province, (count.get(d.province) || 1) - 1); count.set(to, (count.get(to) || 0) + 1); } };

  // 3) 후방 침투 대응: 아군 영토 내부(전선이 아닌 곳)의 적 점령지 탈환
  const intruded = w.provinces.filter(p => p.active && p.owner === c.id && hostileAt(p.id) && !p.neighbors.some(n => w.provinces[n].owner !== c.id && hostileAt(n)));
  for (const t of intruded.slice(0, 3)) {
    const near = mine.filter(d => free.has(d.id) && (count.get(d.province) || 0) > 1).sort((a, b) => dist(w, a.province, t.id) - dist(w, b.province, t.id)).slice(0, 2);
    for (const d of near) send(d, t.id);
  }

  if (front.length) {
    // 2) 위협 비례 배분
    const total = all.length;
    const reserveN = total >= 8 ? Math.floor(total * 0.15) : 0;
    const lineForce = Math.max(1, total - reserveN);
    const tsum = front.reduce((a, p) => a + threat.get(p)!, 0);
    const desired = new Map<number, number>();
    const ranked = [...front].sort((a, b) => threat.get(b)! - threat.get(a)!);
    for (const p of ranked) desired.set(p, Math.max(1, Math.round(lineForce * threat.get(p)! / tsum)));
    if (lineForce < front.length) { for (const p of front) desired.set(p, 0); for (const p of ranked.slice(0, lineForce)) desired.set(p, 1); }

    // 4) 공세 계획
    const offensive = mine.some(d => d.stance === 'attack') || (c.id !== w.player && (P.aggr >= 1 || c.warExhaustion < 25));
    const threshold = offensive ? 1.35 / (0.7 + P.aggr * 0.3) : 2.4;
    const maxOps = 1 + Math.floor(all.length / 10) + (offensive ? 1 : 0);
    const targets: { t: number; odds: number; val: number; from: number[] }[] = [];
    const seenT = new Set<number>();
    for (const f of front) for (const t of w.provinces[f].neighbors) {
      if (seenT.has(t) || !hostileAt(t)) continue; seenT.add(t);
      const T = w.provinces[t];
      const from = T.neighbors.filter(n => w.provinces[n].controller === c.id);
      const atk = from.flatMap(n => mine.filter(d => d.province === n && free.has(d.id) && d.org > 0.55));
      if (!atk.length) continue;
      const defs = w.divisions.filter(d => d.province === t && enemies.has(d.owner));
      const dp = stackPower(defs, false) * TERRAINS[T.terrain].def * (1 + 0.15 * (T.buildings.fort || 0)) * (T.river ? 1.15 : 1) * (1 + 0.3 * (defs.reduce((a, d) => a + (d.entrench || 0), 0) / Math.max(1, defs.length)));
      const ap = stackPower(atk, true) * TERRAINS[T.terrain].atk;
      const odds = dp <= 0.01 ? 99 : ap / dp;
      const val = (T.owner === c.id ? 3 : 1) + (w.countries[T.owner]?.capital === t ? 3 : 0) + T.pop / 1e6 + (T.resource ? 0.5 : 0);
      targets.push({ t, odds, val, from });
    }
    targets.sort((a, b) => b.odds * b.val - a.odds * a.val);
    let ops = 0;
    for (const tg of targets) {
      if (ops >= maxOps) break;
      const undefended = tg.odds >= 99;
      if (!undefended && tg.odds < threshold) continue;
      // 각 출발 지역에서 전선 유지 병력(1)을 남기고 투입
      const go: Division[] = [];
      for (const f of tg.from) {
        const here = mine.filter(d => d.province === f && free.has(d.id) && d.org > 0.55).sort((a, b) => UNITS[b.type].atk - UNITS[a.type].atk);
        const keep = (front.includes(f) && w.provinces[f].neighbors.filter(hostileAt).length > 1) ? 1 : 0;
        const allowHold = mine.some(d => d.stance === 'attack') ? here.filter(d => d.stance === 'attack') : here;
        go.push(...allowHold.slice(0, Math.max(0, here.length - keep)));
      }
      const use = undefended ? go.slice(0, 1) : go;
      if (!use.length) continue;
      for (const d of use) send(d, tg.t);
      ops++;
    }

    // 전선 보강: 남는 지역 → 부족한 전선 지역
    const deficit = () => ranked.filter(p => (count.get(p) || 0) < (desired.get(p) || 0));
    const surplusDivs = mine.filter(d => free.has(d.id) && !(front.includes(d.province) && (count.get(d.province) || 0) <= (desired.get(d.province) || 0)));
    // 예비대: 수도 근처 유지
    const reserve = new Set(surplusDivs.filter(d => d.province === c.capital && !front.includes(c.capital)).slice(0, reserveN).map(d => d.id));
    for (const d of surplusDivs) {
      if (reserve.has(d.id) || !free.has(d.id)) continue;
      const need = deficit(); if (!need.length) break;
      need.sort((a, b) => dist(w, d.province, a) / (1 + (desired.get(a)! - (count.get(a) || 0))) - dist(w, d.province, b) / (1 + (desired.get(b)! - (count.get(b) || 0))));
      send(d, need[0]);
    }
    // 위기 대응: 전선이 뚫린(무방비) 고위협 지역에 예비대 투입
    for (const p of ranked.slice(0, 3)) if (!(count.get(p) || 0)) {
      const r = [...reserve].map(id => byId.get(id)!).filter(d => d && free.has(d.id))[0];
      if (r) send(r, p);
    }
    return;
  }

  // 5) 육상 전선 없음 → 해상 침공
  const rear = mine.filter(d => free.has(d.id));
  if (!rear.length) return;
  const myN = navalPower(c);
  const targets = w.provinces.filter(p => p.active && enemies.has(p.controller) && p.coastal);
  const enemyNavy = Math.max(0, ...[...enemies].map(e => navalPower(w.countries[e])));
  if (targets.length && myN >= enemyNavy * 0.9 && (c.ships.transport > 0 || myN > 5) && rand() < 0.5) {
    const cap = w.provinces[c.capital];
    targets.sort((a, b) => Math.hypot(a.cx - cap.cx, a.cy - cap.cy) - Math.hypot(b.cx - cap.cx, b.cy - cap.cy));
    for (const t of targets.slice(0, 3)) {
      const group = rear.slice(0, Math.max(2, Math.ceil(rear.length * 0.6)));
      const path = findPath(w, c.id, group[0].province, t.id);
      if (path) { orderMove(w, group.map(d => d.id), t.id); break; }
    }
  }
  void warsOf; void alliesOf; void atWar; void pick;
}

const dist = (w: WorldState, a: number, b: number) => Math.hypot(w.provinces[a].cx - w.provinces[b].cx, w.provinces[a].cy - w.provinces[b].cy);

function peaceDeployment(w: WorldState, c: Country, mine: Division[]) {
  if ((w.day + c.id * 7) % 60 > 3) return;
  const nbs = [...countryNeighbors(w, c.id, false)].sort((a, b) => getRel(w, c.id, a) - getRel(w, c.id, b));
  const border: number[] = [];
  for (const n of nbs.slice(0, 2)) {
    if (getRel(w, c.id, n) > 20) continue;
    for (const p of w.provinces) if (p.active && p.controller === c.id && p.dmzUntil <= w.day && p.neighbors.some(q => w.provinces[q].owner === n)) border.push(p.id);
  }
  let i = 0;
  for (const d of mine) {
    if (d.path.length) continue;
    const tgt = border.length && i % 3 !== 0 ? border[i % border.length] : c.capital;
    i++;
    if (d.province !== tgt && w.provinces[tgt]?.controller === c.id) orderMove(w, [d.id], tgt);
  }
}

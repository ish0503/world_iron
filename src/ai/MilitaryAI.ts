import type { WorldState } from '../types/World';
import type { Country } from '../types/Country';
import type { UnitType, Division } from '../types/Military';
import { UNITS, PERSONALITIES, SHIPS, PLANES } from '../data/defs';
import { TERRAINS } from '../data/terrain';
import { rand, pick } from '../simulation/rng';
import { enemiesOf, isAtWar, atWar, countryNeighbors, getRel, alliesOf, warsOf } from '../simulation/WorldHelpers';
import { recruit, unitAvailable, orderMove, findPath, buyShip, buyPlanes } from '../simulation/MilitarySimulation';
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

/** 병력 생산 */
export function recruitAI(w: WorldState, c: Country) {
  const mine = w.divisions.filter(d => d.owner === c.id);
  const target = targetDivisions(w, c);
  // 유지비 상한
  const upkeepDay = mine.reduce((a, d) => a + UNITS[d.type].upkeep, 0);
  const maxUpkeep = c.income * (isAtWar(w, c.id) ? 0.7 : 0.4);
  if (mine.length < target && upkeepDay < maxUpkeep && c.treasury > 1.5) {
    const counts: Record<string, number> = {};
    for (const d of mine) counts[d.type] = (counts[d.type] || 0) + 1;
    const mix: [UnitType, number][] = [['infantry', 0.45], ['artillery', 0.14], ['armor', 0.12], ['mechanized', 0.1], ['antitank', 0.06], ['antiair', 0.05], ['engineer', 0.04], ['special', 0.04]];
    let best: UnitType = 'infantry', bd = -Infinity;
    for (const [t, share] of mix) {
      if (!unitAvailable(w, c.id, t)) continue;
      const deficit = share - (counts[t] || 0) / Math.max(1, mine.length);
      if (deficit > bd) { bd = deficit; best = t; }
    }
    // 전선 근처 배치
    let pid: number | undefined;
    const front = frontProvinces(w, c.id);
    if (front.length) pid = pick(front);
    recruit(w, c.id, best, pid);
  } else if (mine.length > target * 1.6 && !isAtWar(w, c.id) || (upkeepDay > c.income * 1.1 && c.treasury < 1)) {
    // 감축
    const weakest = mine.sort((a, b) => a.strength - b.strength)[0];
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

/** 작전 AI: 전선 유지, 공격, 상륙, 평시 배치 */
export function operationsAI(w: WorldState, c: Country) {
  const mine = w.divisions.filter(d => d.owner === c.id && d.aiControlled && d.battle < 0);
  if (!mine.length) return;
  const P = PERSONALITIES[c.personality];
  const enemies = new Set(enemiesOf(w, c.id));
  if (!enemies.size) {
    peaceDeployment(w, c, mine);
    return;
  }
  const front = frontProvinces(w, c.id);
  const byProv = new Map<number, Division[]>();
  for (const d of mine) { if (!byProv.has(d.province)) byProv.set(d.province, []); byProv.get(d.province)!.push(d); }
  const threshold = 1.35 / (0.6 + P.aggr * 0.4);
  const capital = c.capital;
  // 1) 전선 부대: 공격 판단
  for (const [pid, divs] of byProv) {
    const p = w.provinces[pid];
    const targets = p.neighbors.filter(n => enemies.has(w.provinces[n].controller) || (w.provinces[n].owner === c.id && w.provinces[n].controller !== c.id && atWar(w, c.id, w.provinces[n].controller)));
    if (!targets.length) continue;
    const idle = divs.filter(d => !d.path.length && d.org > 0.45);
    if (!idle.length) continue;
    let best = -1, bestScore = 0;
    for (const t of targets) {
      const T = w.provinces[t];
      const defs = w.divisions.filter(d => d.province === t && enemies.has(d.owner));
      const dp = stackPower(defs, false) * TERRAINS[T.terrain].def * (1 + 0.15 * (T.buildings.fort || 0)) * (T.river ? 1.15 : 1);
      const ap = stackPower(idle, true) * TERRAINS[T.terrain].atk;
      const odds = dp <= 0.01 ? 99 : ap / dp;
      const val = (T.owner === c.id ? 3 : 1) + (w.countries[T.owner]?.capital === t ? 2 : 0) + T.pop / 1e6;
      const score = odds >= threshold ? odds * val : 0;
      if (score > bestScore) { bestScore = score; best = t; }
    }
    if (best >= 0) {
      const undef = !w.divisions.some(d => d.province === best && enemies.has(d.owner));
      // 방어 부대 1개 잔류 (다른 전선 위협 시)
      const keep = idle.length > 1 && !undef && p.neighbors.filter(n => enemies.has(w.provinces[n].controller)).length > 1 ? 1 : 0;
      const go = undef ? idle.slice(0, Math.max(1, Math.ceil(idle.length / 2))) : idle.slice(keep);
      orderMove(w, go.map(d => d.id), best);
    }
  }
  // 2) 후방 부대 → 전선 (또는 상륙)
  const rear = mine.filter(d => !d.path.length && !front.includes(d.province));
  if (front.length) {
    // 전선 프로빈스별 위협도
    const need = front.map(f => {
      const enemyNear = w.provinces[f].neighbors.reduce((a, n) => a + w.divisions.filter(d => d.province === n && enemies.has(d.owner)).length, 0);
      const mineHere = (byProv.get(f) || []).length;
      return { f, score: enemyNear + 1 - mineHere + (f === capital ? 3 : 0) };
    }).sort((a, b) => b.score - a.score);
    let i = 0;
    for (const d of rear) {
      // 수도 방어 최소 1개
      if (d.province === capital && rear.filter(x => x.province === capital).length <= 1 && rear.length > 3) continue;
      const tgt = need[i % Math.min(need.length, 4)].f; i++;
      orderMove(w, [d.id], tgt);
    }
  } else if (rear.length) {
    // 육상 전선이 없음 → 해상 침공 시도
    const myN = navalPower(c);
    const targets = w.provinces.filter(p => p.active && enemies.has(p.controller) && p.coastal);
    const enemyNavy = Math.max(0, ...[...enemies].map(e => navalPower(w.countries[e])));
    if (targets.length && myN >= enemyNavy * 0.9 && (c.ships.transport > 0 || myN > 5)) {
      const cap = w.provinces[capital];
      targets.sort((a, b) => Math.hypot(a.cx - cap.cx, a.cy - cap.cy) - Math.hypot(b.cx - cap.cx, b.cy - cap.cy));
      for (const t of targets.slice(0, 3)) {
        const group = rear.filter(d => !d.path.length).slice(0, Math.max(2, Math.ceil(rear.length * 0.6)));
        if (!group.length) break;
        const path = findPath(w, c.id, group[0].province, t.id);
        if (path) { orderMove(w, group.map(d => d.id), t.id); break; }
      }
    }
  }
  void warsOf; void alliesOf;
}

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

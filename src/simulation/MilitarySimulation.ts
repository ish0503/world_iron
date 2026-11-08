import type { WorldState } from '../types/World';
import type { Division, UnitType, ShipType, PlaneType } from '../types/Military';
import { TERRAINS } from '../data/terrain';
import { UNITS, SHIPS, PLANES } from '../data/defs';
import { canEnter, atWar, enemiesOf, alliesOf, warsOf, bumpControl, getControlVersion } from './WorldHelpers';
import { navalPower } from './EconomySimulation';
import { spawnDivision } from './CountryOps';
import { dateOf, season } from './Calendar';
import { clamp } from './rng';
import { startOrJoinBattle } from './WarSimulation';
import { MinHeap } from './Heap';

/** 국가별 프로빈스 보급 수준 캐시 */
const supplyCache = new Map<number, { day: number; ver: number; v: Float32Array }>();
export function clearSupplyCache() { supplyCache.clear(); }

export function computeSupply(w: WorldState, cid: number): Float32Array {
  const cached = supplyCache.get(cid);
  if (cached && cached.v.length === w.provinces.length && w.day - cached.day < 20 && (cached.ver === getControlVersion() || w.day - cached.day < (enemiesOf(w, cid).length ? 3 : 20))) return cached.v;
  const c = w.countries[cid];
  const n = w.provinces.length;
  const cost = new Float64Array(n).fill(Infinity);
  const sup = new Float32Array(n);
  const range = 55 + 9 * c.tech.transport;
  const fset = new Set<number>([cid, ...alliesOf(w, cid)]);
  for (const war of warsOf(w, cid)) for (const x of (war.attackers.includes(cid) ? war.attackers : war.defenders)) fset.add(x);
  const friendly = (pid: number) => { const p = w.provinces[pid]; return p.active && p.controller >= 0 && fset.has(p.controller); };
  // 보급원: 수도 + 항구(봉쇄되지 않은 경우)
  const sources: number[] = [];
  if (w.provinces[c.capital]?.controller === cid) sources.push(c.capital);
  const myNavy = navalPower(c);
  const blockaded = enemiesOf(w, cid).some(e => navalPower(w.countries[e]) > myNavy * 1.3);
  if (!blockaded) for (const p of w.provinces) if (p.active && p.controller === cid && (p.buildings.port || 0) > 0) sources.push(p.id);
  if (!sources.length) {
    // 수도 상실: 가장 큰 자국 프로빈스
    let best = -1, bp = -1; for (const p of w.provinces) if (p.active && p.controller === cid && p.pop > bp) { bp = p.pop; best = p.id; }
    if (best >= 0) sources.push(best);
  }
  // 다익스트라 (단순 배열 큐; 프로빈스 수 수천 규모까지 충분)
  const open = new MinHeap();
  for (const s of sources) { cost[s] = s === c.capital ? 0 : 12; open.push(s, cost[s]); }
  while (open.size) {
    const k = open.peekKey(); const p = open.pop();
    if (k > cost[p]) continue;
    const P = w.provinces[p];
    if (cost[p] > range) continue;
    for (const q of P.neighbors) {
      if (!friendly(q)) continue;
      const Q = w.provinces[q];
      const rail = (Q.buildings.rail || 0) + (P.buildings.rail || 0);
      const d = Math.hypot(Q.cx - P.cx, Q.cy - P.cy) * TERRAINS[Q.terrain].move / (1 + 0.2 * rail);
      const nc = cost[p] + d;
      if (nc < cost[q]) { cost[q] = nc; open.push(q, nc); }
    }
  }
  const resF = (c.stock.food > 0 || c.prod.food >= c.cons.food ? 1 : 0.6);
  for (let i = 0; i < n; i++) {
    if (cost[i] < Infinity) sup[i] = clamp(1.05 - cost[i] / range, 0.25, 1) * resF;
    else sup[i] = friendly(i) ? 0.12 : 0;
  }
  supplyCache.set(cid, { day: w.day, ver: getControlVersion(), v: sup });
  return sup;
}

/** 이동 가능한 인접 목록 (해상 포함) */
export function edgesOf(w: WorldState, cid: number, pid: number): { to: number; sea: boolean }[] {
  const p = w.provinces[pid];
  const out: { to: number; sea: boolean }[] = p.neighbors.map(n => ({ to: n, sea: false }));
  const c = w.countries[cid];
  if (p.coastal && (c.ships.transport > 0 || navalPower(c) > 5)) for (const n of p.seaNeighbors) out.push({ to: n, sea: true });
  return out;
}

export function findPath(w: WorldState, cid: number, from: number, to: number, maxNodes = 4000): number[] | null {
  if (from === to) return [];
  if (!canEnter(w, cid, to)) return null;
  const n = w.provinces.length;
  const g = new Float64Array(n).fill(Infinity); const prev = new Int32Array(n).fill(-1);
  const T = w.provinces[to];
  const h = (i: number) => Math.hypot(w.provinces[i].cx - T.cx, w.provinces[i].cy - T.cy);
  const open = new MinHeap(); const closed = new Uint8Array(n);
  g[from] = 0; open.push(from, h(from));
  let visited = 0;
  while (open.size && visited < maxNodes) {
    const cur = open.pop();
    if (closed[cur]) continue; closed[cur] = 1;
    visited++;
    if (cur === to) break;
    const C = w.provinces[cur];
    for (const e of edgesOf(w, cid, cur)) {
      if (!canEnter(w, cid, e.to)) continue;
      const Q = w.provinces[e.to];
      // 해상 침공: 적 해군 우세 시 불가
      if (e.sea && atWar(w, cid, Q.controller)) {
        const myN = navalPower(w.countries[cid]);
        if (navalPower(w.countries[Q.controller]) > myN * 1.1) continue;
      }
      const d = Math.hypot(Q.cx - C.cx, Q.cy - C.cy) * (e.sea ? 1.4 : TERRAINS[Q.terrain].move) + (e.sea ? 10 : 0);
      const ng = g[cur] + d;
      if (ng < g[e.to]) { g[e.to] = ng; prev[e.to] = cur; open.push(e.to, ng + h(e.to)); }
    }
  }
  if (prev[to] < 0) return null;
  const path: number[] = []; let c = to;
  while (c !== from && c >= 0) { path.push(c); c = prev[c]; }
  return path.reverse();
}

export function orderMove(w: WorldState, divIds: number[], to: number): boolean {
  let ok = false;
  for (const id of divIds) {
    const d = w.divisions.find(x => x.id === id); if (!d) continue;
    if (d.battle >= 0) { leaveBattle(w, d); }
    const path = findPath(w, d.owner, d.province, to);
    if (path) { d.path = path; d.progress = 0; ok = true; }
  }
  return ok;
}

export function leaveBattle(w: WorldState, d: Division) {
  const b = w.battles.find(x => x.id === d.battle);
  if (b) { b.attackers = b.attackers.filter(x => x !== d.id); b.defenders = b.defenders.filter(x => x !== d.id); }
  d.battle = -1;
}

export function divisionSpeed(w: WorldState, d: Division) {
  const c = w.countries[d.owner];
  const u = UNITS[d.type];
  let sp = u.speed * (1 + 0.05 * c.tech.transport);
  if ((u.oil > 0) && c.stock.oil <= 0 && !w.rules.infiniteResources) sp *= 0.5;
  sp *= 0.5 + 0.5 * d.supply;
  return sp * 0.65;
}

function winterFactor(w: WorldState, pid: number) {
  const m = dateOf(w.startYear, w.day).month;
  if (season(m).id !== 3) return 1;
  const lat = Math.abs(w.provinces[pid].cy / w.height - 0.5) * 2;
  return 1 - Math.max(0, lat - 0.35) * 0.6;
}
export { winterFactor };

/** 일일 군사 처리: 보급, 회복, 이동 */
export function dailyMilitary(w: WorldState) {
  dailyTraining(w);
  const supplies = new Map<number, Float32Array>();
  const sup = (cid: number) => { let s = supplies.get(cid); if (!s) { s = computeSupply(w, cid); supplies.set(cid, s); } return s; };
  const toRemove = new Set<number>();
  for (const d of w.divisions) {
    const c = w.countries[d.owner];
    if (!c || !c.alive) { toRemove.add(d.id); continue; }
    const u = UNITS[d.type];
    d.supply = sup(d.owner)[d.province] ?? 0;
    // 소비
    c.milUse.food += d.strength / 10000 * 0.05;
    if (u.oil) c.milUse.oil += u.oil * 0.01 * (d.path.length || d.battle >= 0 ? 1 : 0.3);
    // 보급 부족
    if (d.supply < 0.2) {
      d.outOfSupplyDays++;
      d.strength *= 0.997; d.org = Math.max(0, d.org - 0.01); d.morale = Math.max(0.1, d.morale - 0.004);
      d.equipment = Math.max(0.2, d.equipment - 0.003);
      if (d.outOfSupplyDays > 75 && d.supply <= 0.05) toRemove.add(d.id);
    } else d.outOfSupplyDays = 0;
    // 참호: 정지해 있으면 점차 구축, 이동하면 초기화
    if (d.path.length) d.entrench = 0; else d.entrench = Math.min(1, (d.entrench || 0) + 0.015);
    if (d.battle < 0) {
      const base = (w.provinces[d.province].buildings.base || 0);
      d.org = Math.min(1, d.org + 0.026 * d.supply * (1 + 0.15 * base));
      d.morale = Math.min(1, d.morale + 0.005 * d.supply + (c.stability - 50) * 0.00005);
      d.equipment = Math.min(1, d.equipment + 0.004 * d.supply);
      // 병력 보충
      if (d.strength < d.maxStrength && d.supply > 0.45 && w.provinces[d.province].controller === d.owner) {
        const need = Math.min(d.maxStrength - d.strength, d.maxStrength * 0.02 * (1 + 0.3 * base) * (0.5 + c.budget.military));
        const got = Math.min(need, c.manpower);
        if (got > 0) { d.strength += got; c.manpower -= got; c.milUse.steel += got / 1000 * u.steel * 0.02; }
      }
    }
    if (d.strength < 200) toRemove.add(d.id);
  }
  if (toRemove.size) {
    for (const id of toRemove) { const d = w.divisions.find(x => x.id === id); if (d) leaveBattle(w, d); }
    w.divisions = w.divisions.filter(d => !toRemove.has(d.id));
  }
  // 이동
  for (const d of w.divisions) {
    if (!d.path.length || d.battle >= 0) continue;
    const next = d.path[0];
    if (!canEnter(w, d.owner, next)) { d.path = []; d.progress = 0; continue; }
    const P = w.provinces[d.province], N = w.provinces[next];
    const sea = !P.neighbors.includes(next);
    const len = Math.hypot(N.cx - P.cx, N.cy - P.cy) * (sea ? 1.4 : TERRAINS[N.terrain].move) + (sea ? 10 : 0);
    d.progress += divisionSpeed(w, d) * winterFactor(w, next) * (1 + 0.15 * Math.min(P.buildings.rail || 0, N.buildings.rail || 0));
    if (d.progress >= len) {
      // 적 방어 부대 확인
      const hostile = w.divisions.some(o => o.province === next && atWar(w, o.owner, d.owner));
      if (hostile) {
        d.progress = len;
        // 조직력이 회복될 때까지 공격 대기 (연속 돌격으로 인한 순식간의 전투 방지)
        if (d.org < 0.45) continue;
        startOrJoinBattle(w, d, next); continue;
      }
      d.province = next; d.path.shift(); d.progress = 0;
      if (N.dmzUntil > w.day && N.owner !== d.owner) N.dmzUntil = 0; // 비무장지대 위반
      occupy(w, d, next);
    }
  }
}

export function occupy(w: WorldState, d: Division, pid: number) {
  const p = w.provinces[pid];
  if (p.controller === d.owner) return;
  if (atWar(w, d.owner, p.controller)) {
    // 동맹의 영토라면 원 소유국에 반환
    const ownerFriendly = p.owner >= 0 && (p.owner === d.owner || alliesOf(w, d.owner).includes(p.owner) || warsOf(w, d.owner).some(war => (war.attackers.includes(d.owner) ? war.attackers : war.defenders).includes(p.owner)));
    p.controller = ownerFriendly ? p.owner : d.owner;
    bumpControl();
    p.devastation = Math.min(1, p.devastation + 0.08);
    p.construction = null;
    onProvinceCaptured(w, pid, d.owner);
  }
}

let captureHook: (w: WorldState, pid: number, by: number) => void = () => {};
export function setCaptureHook(fn: typeof captureHook) { captureHook = fn; }
function onProvinceCaptured(w: WorldState, pid: number, by: number) { captureHook(w, pid, by); }

export function unitAvailable(w: WorldState, cid: number, type: UnitType) {
  const c = w.countries[cid]; const req = UNITS[type].req;
  return Object.entries(req).every(([f, lv]) => (c.tech as any)[f] >= (lv as number));
}

export function recruitCost(w: WorldState, cid: number, type: UnitType) {
  const c = w.countries[cid];
  return UNITS[type].cost * (1 + Math.max(0, c.inflation) * 2) * (c.warEconomy ? 0.85 : 1);
}

export const TRAIN_DAYS: Record<UnitType, number> = { infantry: 45, artillery: 60, antitank: 60, antiair: 60, engineer: 50, special: 90, mechanized: 90, armor: 120 };

/** 모집 비용: 부족한 철강은 국제 시장에서 구매 */
export function recruitQuote(w: WorldState, cid: number, type: UnitType) {
  const c = w.countries[cid]; const u = UNITS[type];
  const steelShort = w.rules.infiniteResources ? 0 : Math.max(0, u.steel - Math.max(0, c.stock.steel));
  return { cost: recruitCost(w, cid, type) + steelShort * w.prices.steel * 1.25, steelShort, days: trainDays(w, cid, type) };
}
export function trainDays(w: WorldState, cid: number, type: UnitType) {
  const c = w.countries[cid];
  return Math.round(TRAIN_DAYS[type] * (c.warEconomy ? 0.8 : 1) / (1 + 0.04 * c.tech.military));
}
export function trainingSlots(w: WorldState, cid: number) {
  const c = w.countries[cid];
  let bases = 0; for (const p of w.provinces) if (p.owner === cid) bases += p.buildings.base || 0;
  return 3 + Math.floor(c.provinceCount / 6) + bases * 2 + (c.warEconomy ? 3 : 0);
}

/** 부대 모집: 비용·인력을 선지불하고 훈련 대기열에 넣는다 */
export function recruit(w: WorldState, cid: number, type: UnitType, province?: number): string | null {
  const c = w.countries[cid]; const u = UNITS[type];
  if (!unitAvailable(w, cid, type)) return '기술이 부족합니다';
  c.training ??= [];
  if (c.training.length >= trainingSlots(w, cid)) return `훈련 시설이 가득 찼습니다 (${trainingSlots(w, cid)}개)`;
  const q = recruitQuote(w, cid, type);
  if (c.treasury < q.cost) return `국고가 부족합니다 (${q.cost.toFixed(1)}B 필요)`;
  if (c.manpower < u.hp * 0.5) return '인력이 부족합니다 (징병률을 높이세요)';
  let pid = province ?? -1;
  if (pid < 0 || w.provinces[pid].controller !== cid) {
    pid = w.provinces[c.capital]?.controller === cid ? c.capital : -1;
    let bb = 0;
    for (const p of w.provinces) if (p.active && p.controller === cid && p.owner === cid && (p.buildings.base || 0) > bb) { bb = p.buildings.base || 0; pid = p.id; }
    if (pid < 0) for (const p of w.provinces) if (p.active && p.controller === cid) { pid = p.id; break; }
  }
  if (pid < 0) return '배치할 영토가 없습니다';
  c.treasury -= q.cost;
  if (!w.rules.infiniteResources) c.stock.steel = Math.max(0, c.stock.steel - (u.steel - q.steelShort));
  const mp = Math.min(u.hp, c.manpower);
  c.manpower -= mp;
  c.training.push({ type, days: q.days, total: q.days, province: pid, manpower: mp });
  return null;
}

/** 훈련 진행 → 완료 시 사단 배치 */
export function dailyTraining(w: WorldState) {
  for (const c of w.countries) {
    if (!c.alive || !c.training?.length) continue;
    for (const t of c.training) t.days--;
    const done = c.training.filter(t => t.days <= 0);
    if (!done.length) continue;
    c.training = c.training.filter(t => t.days > 0);
    for (const t of done) {
      let pid = t.province;
      if (w.provinces[pid]?.controller !== c.id) pid = w.provinces[c.capital]?.controller === c.id ? c.capital : (w.provinces.find(p => p.controller === c.id)?.id ?? -1);
      if (pid < 0) { c.manpower += t.manpower; continue; }
      const d = spawnDivision(w, c.id, t.type, pid, Math.max(0.3, t.manpower / UNITS[t.type].hp));
      d.org = 0.6; d.stance = 'hold';
      d.aiControlled = c.id !== w.player || !!c.autoRecruit || w.mode !== 'ruler';
      if (c.id === w.player && w.mode === 'ruler') d.aiControlled = false;
    }
  }
}

export function disband(w: WorldState, id: number) {
  const d = w.divisions.find(x => x.id === id); if (!d) return;
  leaveBattle(w, d);
  const c = w.countries[d.owner]; if (c) c.manpower += d.strength * 0.8;
  w.divisions = w.divisions.filter(x => x.id !== id);
}

export function buyShip(w: WorldState, cid: number, t: ShipType): string | null {
  const c = w.countries[cid]; const s = SHIPS[t];
  if (c.tech.naval < s.req) return '해양 기술이 부족합니다';
  if (!w.provinces.some(p => p.active && p.owner === cid && (p.buildings.port || 0) > 0)) return '항구가 필요합니다';
  const cost = s.cost * (1 + Math.max(0, c.inflation));
  if (c.treasury < cost) return '국고가 부족합니다';
  c.treasury -= cost; c.ships[t]++; c.stock.steel = Math.max(0, c.stock.steel - s.cost * 20);
  return null;
}
export function buyPlanes(w: WorldState, cid: number, t: PlaneType, n = 10): string | null {
  const c = w.countries[cid]; const s = PLANES[t];
  if (c.tech.military < s.req && c.tech.industry < s.req) return '기술이 부족합니다';
  const cost = s.cost * n * (1 + Math.max(0, c.inflation));
  if (c.treasury < cost) return '국고가 부족합니다';
  c.treasury -= cost; c.planes[t] += n; c.stock.steel = Math.max(0, c.stock.steel - s.cost * n * 15);
  return null;
}

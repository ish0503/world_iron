import type { WorldState } from '../types/World';
import type { ResourceId } from '../types/Province';
import type { GovType, Personality } from '../types/Country';
import { T, isWater } from '../data/terrain';
import { genLeader, genPlace } from '../data/names';
import { rebuildGeometry } from '../simulation/Geometry';
import { emptyProvince } from '../simulation/WorldGen';
import {
  createCountry, transferProvince, checkDeath, mergeCountries, splitCountry, relocateCapital, countryStats, changeGovernment,
} from '../simulation/CountryOps';
import { setRel, chronicle, warsOf, cname, bumpControl, ensureRelSize } from '../simulation/WorldHelpers';
import { declareWar, applyPeace, sideOf, endAllWarsOf } from '../simulation/WarSimulation';
import { triggerDisaster, seaLevelChange, type DisasterType } from '../simulation/EnvironmentSimulation';
import { clearSupplyCache } from '../simulation/MilitarySimulation';
import { rng, rand } from '../simulation/rng';
import { TECH_IDS } from '../data/defs';

export type TerrainBrush = number | 'river' | 'unriver';

/** 셀 단위 지형 브러시. 변경된 셀 수 반환 */
export function paintTerrain(w: WorldState, cx: number, cy: number, radius: number, brush: TerrainBrush, deferGeometry = false): number {
  const W = w.width, H = w.height;
  let changed = 0;
  const orphan: number[] = [];
  for (let y = Math.max(0, Math.floor(cy - radius)); y <= Math.min(H - 1, Math.ceil(cy + radius)); y++) {
    for (let x = Math.max(0, Math.floor(cx - radius)); x <= Math.min(W - 1, Math.ceil(cx + radius)); x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 > radius * radius) continue;
      const i = y * W + x;
      if (brush === 'river' || brush === 'unriver') {
        if (!isWater(w.terrain[i])) { w.river[i] = brush === 'river' ? 1 : 0; changed++; }
        continue;
      }
      const t = brush as number;
      if (w.terrain[i] === t) continue;
      if (isWater(t)) {
        w.terrain[i] = t; w.river[i] = 0; w.cellProv[i] = -1; w.height_[i] = 0; changed++;
      } else {
        if (isWater(w.terrain[i])) {
          w.height_[i] = t === T.MOUNTAIN ? 200 : t === T.HILLS ? 120 : 30;
          w.cellProv[i] = -1;
          orphan.push(i);
        } else if (t === T.MOUNTAIN) w.height_[i] = Math.max(w.height_[i], 180);
        w.terrain[i] = t; changed++;
      }
    }
  }
  // 새 육지: 인접 프로빈스에 편입, 없으면 새 섬 프로빈스
  let guard = 0;
  let pending = orphan.slice();
  while (pending.length && guard++ < 50) {
    const next: number[] = [];
    for (const i of pending) {
      const x = i % W;
      const nb = [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W].filter(j => j >= 0 && j < W * H);
      const p = nb.map(j => w.cellProv[j]).find(q => q >= 0);
      if (p !== undefined) w.cellProv[i] = p; else next.push(i);
    }
    if (next.length === pending.length) {
      // 연결되지 않은 섬 → 새 프로빈스
      const id = w.provinces.length;
      const pr = emptyProvince(id, genPlace(rng)); pr.pop = 5000;
      w.provinces.push(pr);
      w.cellProv[next[0]] = id;
      pending = next.slice(1);
      continue;
    }
    pending = next;
  }
  if (changed && !deferGeometry) afterGeometryChange(w);
  return changed;
}

export function afterGeometryChange(w: WorldState) {
  rebuildGeometry(w);
  for (const p of w.provinces) {
    if (p.active) continue;
    for (const d of w.divisions) if (d.province === p.id) d.province = -1;
    p.pop = 0;
  }
  // 수도 상실 처리 & 부대 정리
  for (const c of w.countries) if (c.alive && !w.provinces[c.capital]?.active) relocateCapital(w, c.id);
  w.divisions = w.divisions.filter(d => d.province >= 0);
  for (const c of w.countries) if (c.alive) checkDeath(w, c.id);
  clearSupplyCache(); bumpControl();
  countryStats(w);
}

// ───────── 프로빈스/국가 편집 ─────────
export function assignProvince(w: WorldState, pid: number, cid: number) {
  const p = w.provinces[pid]; if (!p?.active) return;
  if (cid < 0) {
    const old = p.owner; p.owner = -1; p.controller = -1; p.construction = null;
    w.divisions = w.divisions.filter(d => d.province !== pid);
    if (old >= 0) { if (w.countries[old].capital === pid) relocateCapital(w, old); checkDeath(w, old); }
    bumpControl();
  } else transferProvince(w, pid, cid);
  if (cid >= 0 && !p.cores.includes(cid)) p.cores.push(cid);
  countryStats(w);
}

export function createCountryAt(w: WorldState, pid: number, opts: { gov?: GovType; personality?: Personality; name?: string; size?: number } = {}) {
  const p = w.provinces[pid]; if (!p?.active) return -1;
  const set = [pid];
  const size = opts.size ?? 1;
  const q = [pid];
  while (q.length && set.length < size) {
    const c = q.shift()!;
    for (const n of w.provinces[c].neighbors) if (!set.includes(n) && set.length < size && (w.provinces[n].owner === p.owner)) { set.push(n); q.push(n); }
  }
  const from = p.owner;
  const id = createCountry(w, set, { ...opts, from: from >= 0 ? from : undefined });
  if (id >= 0) chronicle(w, 'nation', `${w.countries[id].name} 건국`, `${p.name}을(를) 중심으로 ${w.countries[id].name}이(가) 건국되었다.`, [id], true, pid);
  countryStats(w);
  return id;
}

export function deleteCountry(w: WorldState, cid: number) {
  const c = w.countries[cid]; if (!c?.alive) return;
  endAllWarsOf(w, cid);
  for (const p of w.provinces) if (p.owner === cid) { p.owner = -1; p.controller = -1; p.construction = null; }
  checkDeath(w, cid);
  bumpControl(); countryStats(w);
}

export function setCapital(w: WorldState, cid: number, pid: number) {
  if (w.provinces[pid]?.owner !== cid) return false;
  w.countries[cid].capital = pid; clearSupplyCache(); return true;
}
export function buildCity(w: WorldState, pid: number) {
  const p = w.provinces[pid]; if (!p?.active) return;
  p.pop = Math.max(p.pop * 1.8, 150_000);
  p.buildings.housing = Math.min(5, (p.buildings.housing || 0) + 1);
  p.buildings.market = Math.min(5, (p.buildings.market || 0) + 1);
}
export function buildPort(w: WorldState, pid: number) { const p = w.provinces[pid]; if (p?.active && p.coastal) { p.buildings.port = Math.max(1, p.buildings.port || 0); return true; } return false; }
export function setResource(w: WorldState, pid: number, r: ResourceId | null, amount = 2) { const p = w.provinces[pid]; if (!p) return; p.resource = r; p.resourceAmount = r ? amount : 0; }
export function changeProvincePop(w: WorldState, pid: number, factor: number) { const p = w.provinces[pid]; if (p?.active) p.pop = Math.max(1000, p.pop * factor); }
export function changeCountryPop(w: WorldState, cid: number, factor: number) { for (const p of w.provinces) if (p.active && p.owner === cid) p.pop = Math.max(1000, p.pop * factor); }

export function forceIndependence(w: WorldState, pid: number) {
  const p = w.provinces[pid]; if (!p?.active || p.owner < 0) return -1;
  const owner = p.owner; const cult = p.culture;
  const group = new Set<number>([pid]); const q = [pid];
  while (q.length && group.size < 12) { const c = q.shift()!; for (const n of w.provinces[c].neighbors) { const P = w.provinces[n]; if (!group.has(n) && P.owner === owner && P.culture === cult && n !== w.countries[owner].capital) { group.add(n); q.push(n); } } }
  if (group.size >= w.countries[owner].provinceCount) group.delete(w.countries[owner].capital);
  if (!group.size) return -1;
  const id = createCountry(w, [...group], { from: owner, personality: 'defensive', name: w.cultures[cult]?.name.replace(/(인|족|계)$/, '') });
  if (id >= 0) chronicle(w, 'nation', `${w.countries[id].name} 독립`, `${w.countries[id].name}이(가) ${cname(w, owner)}로부터 독립했다.`, [id, owner], true, pid);
  return id;
}

// ───────── 신 모드 ─────────
export const god = {
  giveMoney(w: WorldState, cid: number, amt: number) { w.countries[cid].treasury += amt; },
  forceWar(w: WorldState, a: number, b: number) {
    const save = w.rules.noWar; w.rules.noWar = false;
    const r = declareWar(w, a, b, [], '신의 개입으로 전쟁이 시작되었다.');
    w.rules.noWar = save; return r;
  },
  setRelation(w: WorldState, a: number, b: number, v: number) { setRel(w, a, b, v); },
  merge(w: WorldState, a: number, b: number) {
    endAllWarsOf(w, b);
    chronicle(w, 'nation', `${cname(w, a)}-${cname(w, b)} 강제 통합`, `신의 개입으로 ${w.countries[b].name}이(가) ${w.countries[a].name}에 통합되었다.`, [a, b], true);
    mergeCountries(w, a, b); countryStats(w);
  },
  split(w: WorldState, cid: number) {
    const id = splitCountry(w, cid, false);
    if (id >= 0) chronicle(w, 'nation', `${cname(w, cid)} 분열`, `${w.countries[cid].name}이(가) 분열되어 ${w.countries[id].name}이(가) 탄생했다.`, [cid, id], true);
    countryStats(w); return id;
  },
  boostTech(w: WorldState, cid: number) { const c = w.countries[cid]; for (const f of TECH_IDS) c.tech[f] += 1; },
  disaster(w: WorldState, type: DisasterType, pid: number) { triggerDisaster(w, type, pid, true); },
  replaceLeader(w: WorldState, cid: number) { const c = w.countries[cid]; const old = c.leader; c.leader = genLeader(rng); c.leaderSince = w.day; chronicle(w, 'politics', `${c.shortName} 지도자 교체`, `${old}이(가) 물러나고 ${c.leader}이(가) 새 지도자가 되었다.`, [cid]); },
  changeGov(w: WorldState, cid: number, gov: GovType, pers?: Personality) { changeGovernment(w, cid, gov, pers, '신의 개입으로 '); },
  endWar(w: WorldState, warId: number) { const war = w.wars.find(x => x.id === warId && x.active); if (war) applyPeace(w, war, null, null); },
  endAllWars(w: WorldState) { for (const war of w.wars.filter(x => x.active)) applyPeace(w, war, null, null); },
  grantVictory(w: WorldState, cid: number) {
    for (const war of warsOf(w, cid)) {
      const side = sideOf(war, cid)!;
      const losers = side === 'A' ? war.defenders : war.attackers;
      const take = w.provinces.filter(p => p.active && losers.includes(p.owner) && p.neighbors.some(n => w.provinces[n].owner === cid || w.provinces[n].controller === cid)).map(p => p.id);
      applyPeace(w, war, side, { takeProvinces: take, reparations: 20, vassalize: true, annex: false, regimeChange: false, release: false, dmz: false });
    }
  },
  seaLevel(w: WorldState, up: boolean) { const n = seaLevelChange(w, up ? 0.5 : -1); if (n) afterGeometryChange(w); return n; },
  stability(w: WorldState, cid: number, delta: number) { const c = w.countries[cid]; c.stability = Math.max(0, Math.min(100, c.stability + delta)); },
};

export { ensureRelSize, rand };

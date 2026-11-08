import type { WorldState } from '../types/World';
import type { Province, ResourceId } from '../types/Province';
import { T, TERRAINS } from '../data/terrain';
import { dateOf, season } from './Calendar';
import { rand, chance, pick, clamp } from './rng';
import { chronicle, cname, logEvent } from './WorldHelpers';
import { genReligion, hslColor } from '../data/names';
import { rng } from './rng';

export type DisasterType = 'drought' | 'flood' | 'wildfire' | 'earthquake' | 'volcano' | 'plague' | 'famine' | 'storm';
export const DISASTERS: Record<DisasterType, { name: string; icon: string }> = {
  drought: { name: '가뭄', icon: '☀' },
  flood: { name: '홍수', icon: '🌊' },
  wildfire: { name: '산불', icon: '🔥' },
  earthquake: { name: '지진', icon: '⚡' },
  volcano: { name: '화산 폭발', icon: '🌋' },
  plague: { name: '전염병', icon: '☣' },
  famine: { name: '대기근', icon: '🥀' },
  storm: { name: '폭풍', icon: '🌀' },
};

/** 재해 발생 (신 모드에서도 사용) */
export function triggerDisaster(w: WorldState, type: DisasterType, pid: number, forced = false) {
  const p = w.provinces[pid]; if (!p?.active) return;
  const owner = p.owner;
  const where = `${p.name}${owner >= 0 ? `(${cname(w, owner)})` : ''}`;
  const cells = () => { const out: number[] = []; for (let i = 0; i < w.cellProv.length; i++) if (w.cellProv[i] === pid) out.push(i); return out; };
  switch (type) {
    case 'drought':
      p.disaster = { type, until: w.day + 180, food: 0.45 };
      for (const n of p.neighbors) if (chance(0.5)) w.provinces[n].disaster = { type, until: w.day + 150, food: 0.6 };
      chronicle(w, 'nature', `${where} 대가뭄`, `극심한 가뭄으로 ${p.name} 일대의 식량 생산이 급감했다.`, owner >= 0 ? [owner] : [], forced, pid);
      break;
    case 'flood':
      p.disaster = { type, until: w.day + 90, food: 0.6 };
      p.pop *= 0.992; p.devastation = Math.min(1, p.devastation + 0.15);
      if (p.buildings.farm && chance(0.4)) p.buildings.farm--;
      chronicle(w, 'nature', `${where} 대홍수`, `강이 범람하여 ${p.name} 지역이 침수되었다.`, owner >= 0 ? [owner] : [], forced, pid);
      break;
    case 'wildfire':
      p.disaster = { type, until: w.day + 60, food: 0.8 };
      p.devastation = Math.min(1, p.devastation + 0.1);
      logEvent(w, `${where} 산불 발생`, 'nature', owner);
      break;
    case 'earthquake': {
      p.pop *= 0.985; p.devastation = Math.min(1, p.devastation + 0.3);
      for (const k of Object.keys(p.buildings) as (keyof typeof p.buildings)[]) if (chance(0.3) && p.buildings[k]) p.buildings[k]!--;
      for (const n of p.neighbors) { const q = w.provinces[n]; q.devastation = Math.min(1, q.devastation + 0.1); q.pop *= 0.996; }
      chronicle(w, 'nature', `${where} 대지진`, `강진이 ${p.name}을(를) 강타해 많은 건물이 무너지고 사상자가 발생했다.`, owner >= 0 ? [owner] : [], true, pid);
      break;
    }
    case 'volcano': {
      p.pop *= 0.94; p.devastation = 1;
      p.buildings = {};
      const cs = cells();
      if (cs.length) { const c0 = pick(cs); w.terrain[c0] = T.MOUNTAIN; for (const c of cs) if (chance(0.15)) w.terrain[c] = T.HILLS; }
      for (const n of p.neighbors) w.provinces[n].disaster = { type: 'volcano', until: w.day + 365, food: 0.55 };
      p.disaster = { type, until: w.day + 540, food: 0.2 };
      w.globalTemp -= 0.15;
      (w as any)._terrainDirty = true;
      chronicle(w, 'nature', `${where} 화산 폭발`, `거대한 화산 폭발로 ${p.name}이(가) 화산재에 뒤덮였다. 주변 지역은 화산 겨울로 흉작을 겪는다.`, owner >= 0 ? [owner] : [], true, pid);
      break;
    }
    case 'plague':
      p.plague = Math.max(p.plague, 0.6);
      chronicle(w, 'nature', `${where} 전염병 창궐`, `${p.name}에서 정체불명의 전염병이 퍼지기 시작했다.`, owner >= 0 ? [owner] : [], true, pid);
      break;
    case 'famine':
      p.disaster = { type, until: w.day + 240, food: 0.3 };
      for (const n of p.neighbors) w.provinces[n].disaster = { type, until: w.day + 200, food: 0.5 };
      chronicle(w, 'nature', `${where} 대기근`, `연이은 흉작으로 ${p.name} 일대에 대기근이 닥쳤다.`, owner >= 0 ? [owner] : [], true, pid);
      break;
    case 'storm':
      p.devastation = Math.min(1, p.devastation + 0.12); p.pop *= 0.997;
      if (p.buildings.port && chance(0.3)) p.buildings.port--;
      logEvent(w, `${where} 폭풍 피해`, 'nature', owner);
      break;
  }
}

export function monthlyEnvironment(w: WorldState) {
  const m = dateOf(w.startYear, w.day).month;
  const s = season(m).id;
  const rate = w.rules.disasterRate;
  // 기후 변동 (느린 랜덤 워크, 산업화에 따른 온난화)
  let ic = 0; for (const c of w.countries) if (c.alive) ic += c.totalIC;
  w.globalTemp = clamp(w.globalTemp * 0.995 + (rand() - 0.5) * 0.02 + ic * 0.0000025, -1, 1);
  if (rate > 0) {
    for (const p of w.provinces) {
      if (!p.active) continue;
      const t = p.terrain;
      const r = rand() / rate;
      if (r < 0.0012 && (t === T.PLAINS || t === T.DESERT) && s === 1) triggerDisaster(w, 'drought', p.id);
      else if (r < 0.0016 && p.river && s === 0) triggerDisaster(w, 'flood', p.id);
      else if (r < 0.0016 && (t === T.FOREST || t === T.JUNGLE) && s === 1) triggerDisaster(w, 'wildfire', p.id);
      else if (r < 0.00025 && (t === T.MOUNTAIN || t === T.HILLS)) triggerDisaster(w, 'earthquake', p.id);
      else if (r < 0.00003 && t === T.MOUNTAIN) triggerDisaster(w, 'volcano', p.id);
      else if (r < 0.00005 && p.pop > 400_000) triggerDisaster(w, 'plague', p.id);
      else if (r < 0.0008 && p.coastal && s === 2) triggerDisaster(w, 'storm', p.id);
    }
  }
  // 전염병 확산
  const spread: number[] = [];
  for (const p of w.provinces) {
    if (!p.active || p.plague <= 0) continue;
    const med = p.owner >= 0 ? w.countries[p.owner].tech.medicine : 0;
    for (const n of p.neighbors) if (w.provinces[n].plague <= 0.05 && chance(0.25 * p.plague * Math.max(0.15, 1 - med * 0.08))) spread.push(n);
    p.plague = Math.max(0, p.plague - 0.07 - med * 0.012);
  }
  for (const n of spread) w.provinces[n].plague = Math.max(w.provinces[n].plague, 0.45);
  // 재해 만료
  for (const p of w.provinces) if (p.disaster && p.disaster.until <= w.day) p.disaster = null;
  // 종교 확산
  for (const p of w.provinces) {
    if (!p.active || p.owner < 0) continue;
    const c = w.countries[p.owner];
    if (p.religion !== c.religion && chance(0.006 * (1 + c.tech.communication * 0.1) * (c.gov === 'theocracy' ? 2 : 1))) p.religion = c.religion;
    else if (chance(0.002)) {
      const n = pick(p.neighbors.length ? p.neighbors : [p.id]);
      if (w.provinces[n].religion !== p.religion) p.religion = w.provinces[n].religion;
    }
  }
  // 새로운 종교의 탄생 (불만과 혼란 속에서)
  if (chance(0.004)) {
    const cands = w.provinces.filter(p => p.active && p.unrest > 55);
    if (cands.length) {
      const p = pick(cands);
      const id = w.religions.length;
      w.religions.push({ id, name: genReligion(rng), color: hslColor(rand() * 360, 0.65, 0.5), founded: w.day });
      p.religion = id;
      for (const n of p.neighbors) if (chance(0.4)) w.provinces[n].religion = id;
      chronicle(w, 'culture', `${w.religions[id].name} 창시`, `혼란한 ${p.name}에서 새로운 종교 ${w.religions[id].name}이(가) 탄생했다.`, p.owner >= 0 ? [p.owner] : [], false, p.id);
    }
  }
  // 자원 발견
  if (chance(0.06)) {
    const p = pick(w.provinces.filter(x => x.active && !x.resource && x.owner >= 0));
    if (p) {
      const res: ResourceId = TERRAINS[p.terrain].name === '사막' ? 'oil' : pick(['steel', 'coal', 'oil', 'rare'] as ResourceId[]);
      p.resource = res; p.resourceAmount = 1 + Math.floor(rand() * 3);
      const names: Record<ResourceId, string> = { food: '비옥한 토지', steel: '철광', coal: '탄광', oil: '유전', rare: '희귀광물 광맥' };
      chronicle(w, 'economy', `${p.name} ${names[res]} 발견`, `${cname(w, p.owner)}의 ${p.name}에서 대규모 ${names[res]}이(가) 발견되었다.`, [p.owner], false, p.id);
    }
  }
}

export function seaLevelChange(w: WorldState, delta: number): number {
  // delta>0: 해수면 상승 → 저지대 해안 셀 침수
  let changed = 0;
  const W = w.width;
  const thresh = delta > 0 ? Math.round(delta * 40) : 0;
  if (delta > 0) {
    for (let i = 0; i < w.terrain.length; i++) {
      if (w.terrain[i] <= 2) continue;
      if (w.height_[i] > thresh) continue;
      const x = i % W;
      const nb = [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W];
      if (nb.some(j => j >= 0 && j < w.terrain.length && (w.terrain[j] === T.SEA || w.terrain[j] === T.DEEP))) {
        w.terrain[i] = T.SEA; w.cellProv[i] = -1; w.river[i] = 0; changed++;
      }
    }
  } else {
    for (let i = 0; i < w.terrain.length; i++) {
      if (w.terrain[i] !== T.SEA) continue;
      const x = i % W;
      const nb = [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W].filter(j => j >= 0 && j < w.terrain.length);
      const landN = nb.find(j => w.cellProv[j] >= 0);
      if (landN !== undefined && chance(0.5)) { w.terrain[i] = T.PLAINS; w.cellProv[i] = w.cellProv[landN]; w.height_[i] = 1; changed++; }
    }
  }
  return changed;
}

export type { Province };

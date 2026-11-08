import type { WorldState } from '../types/World';
import type { Country, TechField } from '../types/Country';
import type { BuildingId } from '../types/Province';
import { GOVS, BUILDINGS, TECHS, TECH_IDS, ERAS } from '../data/defs';
import { clamp } from './rng';
import { chronicle, isAtWar, countryNeighbors } from './WorldHelpers';

export function techCost(level: number) { return 0.5 * Math.pow(1.3, level); }

export function avgTech(c: Country) { return TECH_IDS.reduce((a, f) => a + c.tech[f], 0) / TECH_IDS.length; }
const ERA_T = [0, 2, 4, 6, 9, 12, 16];
export function eraOf(c: Country) { const a = avgTech(c); let i = 0; while (i + 1 < ERA_T.length && a >= ERA_T[i + 1]) i++; return ERAS[i]; }

export function researchPerDay(w: WorldState, c: Country) {
  let labs = 0;
  for (const p of w.provinces) if (p.active && p.owner === c.id) labs += p.buildings.lab || 0;
  return Math.pow(Math.max(1, c.gdp), 0.75) * c.budget.research * 0.0018 * (1 + 0.6 * (1 - Math.exp(-labs / 8))) * (1 + 0.05 * c.tech.communication) * (0.7 + c.stability / 170) * w.rules.techSpeed;
}

/** 기술 확산: 이웃이 앞서 있으면 비용 절감 */
export function techCostFor(w: WorldState, c: Country, f: TechField) {
  let ahead = 0;
  for (const n of countryNeighbors(w, c.id)) if (w.countries[n].tech[f] > c.tech[f]) ahead++;
  return techCost(c.tech[f]) * (1 - Math.min(0.45, ahead * 0.12));
}

export function dailyResearch(w: WorldState, c: Country) {
  c.techProgress += researchPerDay(w, c);
  const f = c.researchFocus;
  const cost = techCostFor(w, c, f);
  if (c.techProgress >= cost) {
    c.techProgress -= cost;
    c.tech[f]++;
    const key = `${f}-${c.tech[f]}`;
    if (!w.firsts[key] && c.tech[f] >= 4) {
      w.firsts[key] = true;
      const special: Partial<Record<TechField, string[]>> = {
        industry: ['', '', '', '', '산업 혁명', '대량 생산', '자동화 공업', '정밀 산업', '첨단 제조', '나노 산업'],
        military: ['', '', '', '', '기계화 전쟁', '전격전 교리', '유도 무기', '정밀 타격', '스텔스 기술', '자율 무기'],
        medicine: ['', '', '', '', '항생제', '백신 보급', '현대 의학', '유전 의학', '재생 의학'],
        energy: ['', '', '', '', '전력망', '석유 시대', '원자력', '재생 에너지', '핵융합'],
        communication: ['', '', '', '', '라디오', '텔레비전', '인터넷', '위성 통신', '양자 통신'],
      };
      const name = special[f]?.[c.tech[f]];
      if (name) chronicle(w, 'culture', `${name} — ${c.shortName}`, `${c.name}이(가) 세계 최초로 ${name}을(를) 달성했다. (${TECHS[f].name} ${c.tech[f]}단계)`, [c.id], c.tech[f] >= 5);
    }
    if (c.id !== w.player || c.autoResearch) c.researchFocus = chooseResearch(w, c);
  }
}

export function chooseResearch(w: WorldState, c: Country): TechField {
  const pers = c.personality;
  const wts: Record<TechField, number> = {
    agriculture: c.famine > 0 || c.prod.food < c.cons.food ? 3 : 1,
    construction: 1, medicine: 0.9, industry: 1.5, military: isAtWar(w, c.id) ? 2.5 : 1,
    transport: 1, naval: w.provinces[c.capital]?.coastal ? 0.9 : 0.4, communication: 0.9, energy: 1,
  };
  if (pers === 'militarist' || pers === 'expansionist') wts.military *= 1.8;
  if (pers === 'mercantile') { wts.industry *= 1.5; wts.transport *= 1.4; }
  if (pers === 'pacifist') { wts.medicine *= 1.5; wts.agriculture *= 1.3; }
  if (pers === 'hegemonic') wts.naval *= 1.8;
  let best: TechField = 'industry', bs = -1;
  for (const f of TECH_IDS) { const s = wts[f] / (1 + c.tech[f] * 0.35) * (0.7 + Math.random() * 0.6); if (s > bs) { bs = s; best = f; } }
  return best;
}

export function buildCost(w: WorldState, c: Country, b: BuildingId, lvl: number) {
  return BUILDINGS[b].cost * (1 + lvl * 0.35) * (1 - 0.04 * Math.min(10, c.tech.construction)) * (1 + Math.max(0, c.inflation));
}

export function startConstruction(w: WorldState, cid: number, pid: number, b: BuildingId): string | null {
  const p = w.provinces[pid]; const c = w.countries[cid];
  if (p.owner !== cid || p.controller !== cid) return '자국이 통제하는 영토가 아닙니다';
  if (p.construction) return '이미 건설 중입니다';
  const lvl = p.buildings[b] || 0;
  if (lvl >= BUILDINGS[b].max) return '최대 단계입니다';
  if (b === 'port' && !p.coastal) return '해안 지역이 아닙니다';
  if (b === 'mine' && (!p.resource || p.resource === 'food')) return '광물 자원이 없습니다';
  if (b === 'fort' && p.dmzUntil > w.day) return '비무장지대입니다';
  const cost = buildCost(w, c, b, lvl);
  if (c.treasury < cost) return '국고가 부족합니다';
  c.treasury -= cost;
  const days = Math.round(BUILDINGS[b].days * (1 + lvl * 0.2) / (1 + 0.08 * c.tech.construction));
  p.construction = { b, days, total: days };
  return null;
}

export function dailyConstruction(w: WorldState) {
  for (const p of w.provinces) {
    if (!p.construction || !p.active) continue;
    const c = p.owner >= 0 ? w.countries[p.owner] : null;
    const rate = 1 + (c ? c.budget.infrastructure * 20 : 0);
    p.construction.days -= rate;
    if (p.construction.days <= 0) {
      const b = p.construction.b;
      p.buildings[b] = (p.buildings[b] || 0) + 1;
      p.construction = null;
    }
  }
}

/** 월간 정치: 안정도, 정통성, 불만 */
export function monthlyPolitics(w: WorldState) {
  const unrestSum = new Float64Array(w.countries.length), unrestN = new Float64Array(w.countries.length);
  for (const p of w.provinces) {
    if (!p.active || p.owner < 0) continue;
    const c = w.countries[p.owner];
    let target = 5;
    if (p.culture !== c.culture) target += 18;
    if (p.religion !== c.religion) target += c.gov === 'theocracy' ? 18 : 9;
    if (p.controller !== p.owner) target += 25;
    target += (100 - c.stability) * 0.22 + c.famine * 30 + p.devastation * 20 + p.plague * 15;
    target += Math.max(0, c.taxRate - 0.25) * 80;
    target -= c.budget.welfare * 150;
    if (!p.cores.includes(p.owner)) target += 8;
    const cap = w.provinces[c.capital];
    if (cap) target += Math.min(15, Math.hypot(p.cx - cap.cx, p.cy - cap.cy) / 12);
    if (c.overlord >= 0) target += 4;
    p.unrest = clamp(p.unrest + (target - p.unrest) * 0.15, 0, 100);
    unrestSum[p.owner] += p.unrest * p.pop; unrestN[p.owner] += p.pop;
    // 문화 동화
    if (p.culture !== c.culture && Math.random() < 0.004 * (1 + c.stability / 100) * (1 + c.tech.communication * 0.1)) {
      p.culture = c.culture;
    }
  }
  for (const c of w.countries) {
    if (!c.alive) continue;
    const g = GOVS[c.gov];
    const avgUnrest = unrestN[c.id] ? unrestSum[c.id] / unrestN[c.id] : 0;
    c.avgUnrest = avgUnrest;
    const target = 50 + g.stab + (c.legitimacy - 50) * 0.3 + (c.budget.welfare - 0.02) * 250 + clamp(c.gdpGrowth, -0.1, 0.1) * 100
      - c.warExhaustion * 0.35 - c.unemployment * 70 - clamp(c.inflation - 0.03, 0, 1) * 90 - c.famine * 25 - avgUnrest * 0.25
      + Math.min(8, c.tech.communication * 0.8) + (c.overlord >= 0 ? -3 : 0) - Math.max(0, c.provinceCount - 30) * 0.3;
    c.stability = clamp(c.stability + (target - c.stability) * 0.12, 0, 100);
    const lt = 55 + g.legit + (c.stability - 50) * 0.3 - (w.day - c.leaderSince) / 365 * (g.elections ? 1.2 : 0.4);
    c.legitimacy = clamp(c.legitimacy + (lt - c.legitimacy) * 0.05, 0, 100);
    // 이력
    c.history.push({ d: w.day, gdp: c.gdp, pop: c.population, mil: c.militaryPower, prov: c.provinceCount });
    if (c.history.length > 240) c.history.splice(0, c.history.length - 240);
    // 목표 갱신 확인
    c.goals = c.goals.filter(g2 => g2.deadline > w.day);
  }
}

import type { WorldState } from '../types/World';
import type { Province } from '../types/Province';
import { TERRAINS } from '../data/terrain';
import { clamp } from './rng';

export function provinceCapacity(w: WorldState, p: Province) {
  const c = p.owner >= 0 ? w.countries[p.owner] : null;
  const td = TERRAINS[p.terrain];
  const b = p.buildings;
  let cap = p.cellCount * 22000 * td.cap * (1 + 0.25 * (b.housing || 0));
  if (c) cap *= (1 + 0.05 * c.tech.construction) * (1 + 0.06 * c.tech.agriculture);
  if (p.coastal) cap *= 1.2; if (p.river) cap *= 1.3;
  cap += (b.factory || 0) * 150_000 + (b.market || 0) * 100_000;
  if (c && c.capital === p.id) cap *= 2.2;
  return Math.max(2000, cap);
}

/** 월간 인구 변화: 출생, 사망, 기근, 전염병, 이주, 난민 */
export function monthlyPopulation(w: WorldState) {
  const mult = w.rules.popGrowth;
  for (const p of w.provinces) {
    if (!p.active) continue;
    const c = p.owner >= 0 ? w.countries[p.owner] : null;
    const cap = provinceCapacity(w, p);
    let avgTech = 2, med = 1, welfare = 0.035, stab = 50, famine = 0;
    if (c) {
      avgTech = (c.tech.agriculture + c.tech.medicine + c.tech.industry + c.tech.construction) / 4;
      med = c.tech.medicine; welfare = c.budget.welfare; stab = c.stability; famine = c.famine;
    }
    const birth = Math.max(0.012, 0.036 - 0.0018 * avgTech + (welfare - 0.035) * 0.15);
    let death = Math.max(0.006, 0.027 - 0.0022 * med);
    death += famine * 0.06 + p.plague * 0.18 * Math.max(0.2, 1 - 0.08 * med) + p.devastation * 0.03;
    if (stab < 30) death += (30 - stab) * 0.0002;
    let growth = birth - death;
    const fill = p.pop / cap;
    if (growth > 0) growth *= Math.max(-0.5, 1 - fill);
    if (fill > 1) growth -= (fill - 1) * 0.06;
    growth *= growth > 0 ? mult : 1;
    p.pop = Math.max(500, p.pop * (1 + growth / 12));
    // 회복
    if (p.devastation > 0) p.devastation = Math.max(0, p.devastation - 0.02 - (c ? c.budget.infrastructure * 1.5 : 0));
    // 이주: 과밀/피폐 지역 → 여유 있는 인접 지역
    if (fill > 0.95 || p.devastation > 0.2 || p.unrest > 70) {
      let best = -1, room = 0;
      for (const n of p.neighbors) {
        const q = w.provinces[n]; if (!q.active) continue;
        const r = 1 - q.pop / provinceCapacity(w, q) - q.devastation;
        if (r > room) { room = r; best = n; }
      }
      if (best >= 0) {
        const moved = p.pop * (p.devastation > 0.2 ? 0.02 : 0.005);
        p.pop -= moved; w.provinces[best].pop += moved;
      }
    }
  }
}

/** 국가 인력 (징병 가능 인구) */
export function monthlyManpower(w: WorldState) {
  for (const c of w.countries) {
    if (!c.alive) continue;
    const deployed = w.divisions.reduce((a, d) => a + (d.owner === c.id ? d.strength : 0), 0);
    const max = c.population * c.conscription;
    const target = Math.max(0, max - deployed);
    c.manpower = clamp(c.manpower + (target - c.manpower) * 0.12, 0, target);
  }
}

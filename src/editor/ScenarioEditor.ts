import type { WorldState, WorldRules } from '../types/World';
import type { Country } from '../types/Country';
import { GOVS } from '../data/defs';
import { techBaseForYear } from '../simulation/WorldGen';
import { TECH_IDS } from '../data/defs';

/** 시나리오 편집: 시작 연도, 세계 규칙, 국가 속성 */
export function setStartYear(w: WorldState, year: number) {
  if (w.day > 0) return false;
  const diff = techBaseForYear(year) - techBaseForYear(w.startYear);
  w.startYear = year;
  for (const c of w.countries) for (const f of TECH_IDS) c.tech[f] = Math.max(0, Math.round(c.tech[f] + diff));
  return true;
}
export function setRules(w: WorldState, rules: Partial<WorldRules>) { Object.assign(w.rules, rules); }

export function editCountry(w: WorldState, cid: number, patch: Partial<Pick<Country, 'name' | 'shortName' | 'gov' | 'personality' | 'treasury' | 'stability' | 'color' | 'leader'>>) {
  const c = w.countries[cid]; if (!c) return;
  Object.assign(c, patch);
  if (patch.gov && !patch.name) c.name = `${c.shortName} ${GOVS[patch.gov].suffix[0]}`;
}

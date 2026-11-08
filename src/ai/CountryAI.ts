import type { WorldState } from '../types/World';
import type { Country, AIGoal } from '../types/Country';
import { rand, pick } from '../simulation/rng';
import { countryNeighbors, getRel, isAtWar, logEvent } from '../simulation/WorldHelpers';
import { economyAI } from './EconomyAI';
import { recruitAI, operationsAI } from './MilitaryAI';
import { diplomacyAI, peaceAI } from './DiplomacyAI';
import { chooseResearch } from '../simulation/CountrySimulation';
import { navalPower } from '../simulation/EconomySimulation';

/**
 * 국가 AI 진입점. 국가마다 다음 판단 시점(aiNext)을 두어 계산량을 분산한다.
 */
export function runCountryAI(w: WorldState, c: Country, playerControlled: boolean) {
  if (!c.alive) return;
  // 작전 (3일 주기) — 플레이어 국가라도 AI 지휘 부대는 움직임
  if (w.day >= c.aiMilNext) {
    c.aiMilNext = w.day + (isAtWar(w, c.id) ? 2 : 5);
    operationsAI(w, c);
  }
  if (playerControlled) return;
  if (w.day < c.aiNext) return;
  c.aiNext = w.day + 8 + Math.floor(rand() * 6);
  economyAI(w, c);
  recruitAI(w, c);
  diplomacyAI(w, c);
  if ((w.day + c.id) % 30 < 14) peaceAI(w, c);
  if (!c.researchFocus || rand() < 0.05) c.researchFocus = chooseResearch(w, c);
  updateGoals(w, c);
}

const GOAL_LABEL: Record<AIGoal['type'], string> = {
  army: '군사력 강화', alliance: '동맹 체결', economy: '경제 성장', territory: '영토 확보', navy: '해군 증강', tech: '기술 발전', stability: '내부 안정',
};

function updateGoals(w: WorldState, c: Country) {
  // 목표 달성 확인
  for (const g of [...c.goals]) {
    let done = false;
    if (g.type === 'army') done = c.militaryPower >= g.value;
    if (g.type === 'economy') done = c.gdp >= g.value;
    if (g.type === 'navy') done = navalPower(c) >= g.value;
    if (g.type === 'stability') done = c.stability >= g.value;
    if (g.type === 'tech') done = Object.values(c.tech).reduce((a, b) => a + b, 0) >= g.value;
    if (g.type === 'alliance' && g.target !== undefined) done = w.treaties.some(t => t.type === 'alliance' && ((t.a === c.id && t.b === g.target) || (t.b === c.id && t.a === g.target)));
    if (g.type === 'territory' && g.target !== undefined) done = !w.countries[g.target].alive || w.provinces.filter(p => p.owner === c.id).length >= g.value;
    if (done) { c.goals = c.goals.filter(x => x !== g); logEvent(w, `${c.shortName}: 장기 목표 달성 — ${g.label}`, 'politics', c.id); }
  }
  if (c.goals.length >= 2 || rand() > 0.08) return;
  const years = 3 + Math.floor(rand() * 4);
  const deadline = w.day + years * 365;
  const nbs = [...countryNeighbors(w, c.id)];
  const pers = c.personality;
  const opts: AIGoal['type'][] = [];
  if (pers === 'militarist' || pers === 'expansionist' || pers === 'revolutionary') opts.push('army', 'army', 'territory');
  if (pers === 'mercantile' || pers === 'pacifist') opts.push('economy', 'economy', 'tech');
  if (pers === 'hegemonic') opts.push('alliance', 'navy', 'army');
  if (pers === 'defensive') opts.push('army', 'alliance');
  if (pers === 'isolationist') opts.push('economy', 'tech');
  if (c.stability < 40) opts.push('stability', 'stability');
  const type = pick(opts.length ? opts : ['economy']);
  if (c.goals.some(g => g.type === type)) return;
  let goal: AIGoal | null = null;
  switch (type) {
    case 'army': goal = { type, value: Math.max(5, c.militaryPower * 2), start: w.day, deadline, label: `${years}년 내 군사력 2배 강화` }; break;
    case 'economy': goal = { type, value: c.gdp * 1.3, start: w.day, deadline, label: `${years}년 내 GDP 30% 성장` }; break;
    case 'navy': goal = { type, value: Math.max(30, navalPower(c) * 2), start: w.day, deadline, label: `해군력 2배 증강` }; break;
    case 'tech': goal = { type, value: Object.values(c.tech).reduce((a, b) => a + b, 0) + 5, start: w.day, deadline, label: '기술 5단계 발전' }; break;
    case 'stability': goal = { type, value: 60, start: w.day, deadline, label: '국내 안정 회복' }; break;
    case 'alliance': {
      const t = nbs.concat(w.countries.filter(x => x.alive).map(x => x.id)).filter(x => x !== c.id && getRel(w, c.id, x) > 10).sort((a, b) => w.countries[b].militaryPower - w.countries[a].militaryPower)[0];
      if (t !== undefined) goal = { type, target: t, value: 1, start: w.day, deadline, label: `${w.countries[t].shortName}과(와) 동맹 체결` };
      break;
    }
    case 'territory': {
      const t = nbs.filter(n => w.countries[n].militaryPower < c.militaryPower * 0.9).sort((a, b) => getRel(w, c.id, a) - getRel(w, c.id, b))[0];
      if (t !== undefined) goal = { type, target: t, value: c.provinceCount + 3, start: w.day, deadline, label: `${w.countries[t].shortName} 방면 영토 확보` };
      break;
    }
  }
  if (goal) c.goals.push(goal);
  void GOAL_LABEL;
}

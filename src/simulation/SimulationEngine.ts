import type { WorldState } from '../types/World';
import { rng, rand, chance } from './rng';
import { dateOf } from './Calendar';
import { monthlyEconomy, dailyBudget, yearlyEconomy } from './EconomySimulation';
import { monthlyPopulation, monthlyManpower } from './PopulationSimulation';
import { monthlyPolitics, dailyResearch, dailyConstruction } from './CountrySimulation';
import { monthlyPoliticalEvents } from './EventSimulation';
import { monthlyDecisions } from './DecisionEvents';
import { monthlyNuclearAI, monthlyAchievements } from './Extras';
import { monthlyEnvironment } from './EnvironmentSimulation';
import { monthlyDiplomacy } from './DiplomacySimulation';
import { dailyMilitary, setCaptureHook, clearSupplyCache } from './MilitarySimulation';
import { dailyBattles, monthlyWar, onCaptured } from './WarSimulation';
import { countryStats, spawnDivision } from './CountryOps';
import { runCountryAI } from '../ai/CountryAI';
import { setRel, getRel, addTreaty, countryNeighbors, chronicle, ensureRelSize } from './WorldHelpers';
import { UNITS } from '../data/defs';
import { techBaseForYear } from './WorldGen';
import { applyRealDiplomacy } from './RealWorld';

setCaptureHook(onCaptured);
let achievementHook: (id: string) => void = () => {};
export function onAchievement(f: (id: string) => void) { achievementHook = f; }

/** RNG 상태를 월드와 동기화 */
export function bindRng(w: WorldState) { rng.setState(w.rng); }
export function saveRng(w: WorldState) { w.rng = rng.getState(); }

/** 생성 직후 초기화: 관계, 동맹, 군대, 경제 */
export function setupWorld(w: WorldState) {
  bindRng(w);
  ensureRelSize(w);
  const live = w.countries;
  countryStats(w);
  for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
    const a = live[i], b = live[j];
    let r = (rand() - 0.5) * 40;
    if (a.culture === b.culture) r += 15; if (a.religion === b.religion) r += 8; if (a.gov === b.gov) r += 10;
    setRel(w, a.id, b.id, r);
  }
  for (const c of live) {
    const nbs = countryNeighbors(w, c.id);
    for (const n of nbs) setRel(w, c.id, n, getRel(w, c.id, n) - 8);
  }
  // 초기 경제 계산 (3회 반복으로 수렴)
  for (let k = 0; k < 3; k++) monthlyEconomy(w);
  for (const c of live) {
    c.gdpPrev = c.gdp;
    c.treasury = c.gdp * (0.05 + rand() * 0.08);
    c.manpower = c.population * c.conscription * 0.6;
  }
  // 초기 동맹
  for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
    const a = live[i], b = live[j];
    const r = getRel(w, a.id, b.id);
    if (r > 30 && chance(0.35)) addTreaty(w, 'alliance', a.id, b.id);
    else if (r > 10 && chance(0.3)) addTreaty(w, 'trade', a.id, b.id);
    else if (r < -20 && chance(0.25)) addTreaty(w, 'nap', a.id, b.id, 365 * (3 + Math.floor(rand() * 5)));
  }
  // 초기 군대 / 해군 / 공군
  const tb = techBaseForYear(w.startYear);
  for (const c of live) {
    const own = w.provinces.filter(p => p.active && p.owner === c.id);
    const n = Math.max(2, Math.round(1 + own.length * 0.3 + Math.sqrt(c.gdp) * 0.35));
    const border = own.filter(p => p.neighbors.some(q => w.provinces[q].owner !== c.id && w.provinces[q].owner >= 0));
    for (let i = 0; i < n; i++) {
      const type = i % 5 === 3 && c.tech.military >= 1 ? 'artillery' : i % 7 === 5 && c.tech.military >= 4 && c.tech.industry >= 3 ? 'armor' : 'infantry';
      const pid = i % 3 === 0 || !border.length ? c.capital : border[i % border.length].id;
      spawnDivision(w, c.id, type as keyof typeof UNITS, pid, 0.9);
    }
    if (w.provinces[c.capital].coastal || own.some(p => p.buildings.port)) {
      c.ships.destroyer = Math.round(2 + rand() * 6 * (tb / 3));
      c.ships.cruiser = Math.round(rand() * 3 * (tb / 3));
      c.ships.transport = 2 + Math.round(rand() * 3);
      if (c.tech.naval >= 4) c.ships.battleship = Math.round(rand() * 2);
    }
    if (c.tech.military >= 2) { c.planes.fighter = Math.round(20 + rand() * 60); c.planes.bomber = Math.round(rand() * 30); }
    c.history.push({ d: 0, gdp: c.gdp, pop: c.population, mil: 0, prov: own.length });
  }
  if (w.scenario === 'real') { applyRealDiplomacy(w, (o, t, p) => { spawnDivision(w, o, t as keyof typeof UNITS, p, 0.95); }); for (const c of live) { c.history = [{ d: 0, gdp: c.gdp, pop: c.population, mil: 0, prov: c.provinceCount }]; } }
  countryStats(w);
  // 시작 시점에 이미 도달한 기술은 '세계 최초' 기록에서 제외
  for (const c of live) for (const [f, lv] of Object.entries(c.tech)) for (let l = 0; l <= lv; l++) w.firsts[`${f}-${l}`] = true;
  chronicle(w, 'nation', '세계의 시작', `${w.startYear}년, ${live.length}개 국가가 ${w.provinces.filter(p => p.active).length}개 지역에서 역사를 시작한다.`, [], true);
  const top = [...live].sort((a, b) => b.gdp - a.gdp).slice(0, 3);
  chronicle(w, 'nation', '열강의 등장', `세계 3대 경제 대국: ${top.map(c => c.name).join(', ')}.`, top.map(c => c.id), false);
  saveRng(w);
}

/** 하루 진행 */
export function stepDay(w: WorldState) {
  bindRng(w);
  w.day++;
  const d = dateOf(w.startYear, w.day);
  const monthStart = d.day === 1;
  // 일일: 국고, 연구, 건설
  for (const c of w.countries) {
    if (!c.alive) continue;
    dailyBudget(w, c);
    dailyResearch(w, c);
  }
  dailyConstruction(w);
  // 군사
  dailyMilitary(w);
  dailyBattles(w);
  // AI
  for (const c of w.countries) if (c.alive) runCountryAI(w, c, c.id === w.player && w.mode === 'ruler');
  if (monthStart) {
    monthlyEconomy(w);
    monthlyPopulation(w);
    monthlyManpower(w);
    monthlyPolitics(w);
    monthlyWar(w);
    monthlyDiplomacy(w);
    monthlyEnvironment(w);
    monthlyPoliticalEvents(w);
    monthlyNuclearAI(w);
    monthlyDecisions(w);
    monthlyAchievements(w, id => achievementHook(id));
    clearSupplyCache();
    if (d.month === 1) yearlyEconomy(w);
  }
  countryStats(w);
  // 오래된 종료 전쟁 정리
  if (w.wars.length > 200) w.wars = w.wars.filter(x => x.active || w.day - (x.end || 0) < 365 * 30);
  saveRng(w);
}

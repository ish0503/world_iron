import type { WorldState } from '../types/World';
import type { Country } from '../types/Country';
import type { BuildingId } from '../types/Province';
import { GOVS, BUILDINGS, PERSONALITIES } from '../data/defs';
import { clamp, rand } from '../simulation/rng';
import { startConstruction, buildCost } from '../simulation/CountrySimulation';
import { isAtWar, countryNeighbors, getRel } from '../simulation/WorldHelpers';
import { provinceCapacity } from '../simulation/PopulationSimulation';

/** 경제 AI: 세율, 예산, 건설 */
export function economyAI(w: WorldState, c: Country) {
  const g = GOVS[c.gov];
  const P = PERSONALITIES[c.personality];
  const net = c.income - c.expense;
  const war = isAtWar(w, c.id);
  // 세율
  if ((net < 0 && c.treasury < c.gdp * 0.03) || c.debt > c.gdp * 0.5) c.taxRate = clamp(c.taxRate + 0.01, 0.05, g.tax + 0.14);
  else if (c.stability < 35 || (net > 0 && c.treasury > c.gdp * 0.25)) c.taxRate = clamp(c.taxRate - 0.01, 0.08, 0.6);
  // 예산
  const poor = net < 0 && c.treasury < c.gdp * 0.03;
  c.budget.welfare = clamp(c.stability < 40 ? c.budget.welfare + 0.004 : c.budget.welfare - (poor ? 0.004 : 0), 0.01, 0.07);
  c.budget.research = clamp(poor ? c.budget.research - 0.002 : c.budget.research + 0.001 * P.econ, 0.005, 0.04);
  c.budget.infrastructure = clamp(poor ? c.budget.infrastructure - 0.002 : c.budget.infrastructure + 0.001, 0.005, 0.04);
  c.budget.military = clamp(war ? 0.8 : 0.35 * P.mil, 0.1, 1);
  c.warEconomy = war && c.warExhaustion < 70;
  c.conscription = clamp(war ? 0.05 + P.mil * 0.01 : 0.02 + P.mil * 0.008, 0.01, 0.1);
  // 건설
  const spendable = c.treasury - Math.max(2, c.gdp * 0.04);
  if (spendable <= 0) return;
  const own = w.provinces.filter(p => p.active && p.owner === c.id && p.controller === c.id && !p.construction);
  if (!own.length) return;
  const tries = spendable > c.gdp * 0.1 ? 3 : 1;
  for (let k = 0; k < tries; k++) {
    const choice = pickBuilding(w, c, own);
    if (!choice) break;
    const [pid, b] = choice;
    const lvl = w.provinces[pid].buildings[b] || 0;
    if (buildCost(w, c, b, lvl) > c.treasury - Math.max(2, c.gdp * 0.04)) break;
    startConstruction(w, c.id, pid, b);
    const i = own.findIndex(p => p.id === pid); if (i >= 0) own.splice(i, 1);
  }
}

function pickBuilding(w: WorldState, c: Country, own: WorldState['provinces']): [number, BuildingId] | null {
  const P = PERSONALITIES[c.personality];
  const foodShort = c.prod.food < c.cons.food * 1.05;
  const scores: [number, BuildingId, number][] = [];
  let facs = 0, wf = 0;
  for (const p of own) { facs += p.buildings.factory || 0; wf += p.pop * 0.45 * 0.35; }
  const laborRoom = facs * 30000 < wf * 0.95 ? 1 : 0.05;
  const threatened = [...countryNeighbors(w, c.id)].filter(n => getRel(w, c.id, n) < -35);
  for (const p of own) {
    const b = p.buildings;
    const cap = provinceCapacity(w, p);
    const add = (id: BuildingId, s: number) => { if ((b[id] || 0) < BUILDINGS[id].max) scores.push([p.id, id, s * (0.7 + rand() * 0.6) / (1 + (b[id] || 0) * 0.5)]); };
    if (foodShort) add('farm', 3 + (p.terrain === 3 ? 2 : 0));
    add('factory', laborRoom * (c.unemployment > 0.06 ? 3 : 1.2) * P.econ * Math.min(2, p.pop / 300_000) * (c.stock.steel > 0 ? 1 : 0.4));
    if (p.resource && p.resource !== 'food') add('mine', 2.2);
    if (p.pop > cap * 0.85) add('housing', 2);
    add('market', 0.8 * P.econ * Math.min(2, p.pop / 400_000));
    if (c.capital === p.id || p.pop > 500_000) add('lab', 0.6 * P.econ);
    if (p.coastal && !(b.port)) add('port', 0.8);
    add('rail', 0.5 + c.tech.transport * 0.1);
    if ((b.factory || 0) >= 2) add('power', 0.9);
    if (threatened.length && p.neighbors.some(n => threatened.includes(w.provinces[n].owner)) && p.dmzUntil <= w.day) add('fort', 1.6 * P.mil);
    if (c.capital === p.id) add('base', 0.6 * P.mil);
  }
  if (!scores.length) return null;
  scores.sort((a, b) => b[2] - a[2]);
  return [scores[0][0], scores[0][1]];
}

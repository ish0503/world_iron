import type { WorldState } from '../types/World';
import type { Country } from '../types/Country';
import { PERSONALITIES, GOVS } from '../data/defs';
import { rand, chance, clamp } from '../simulation/rng';
import {
  getRel, hasTreaty, atWar, alliesOf, countryNeighbors, warsOf, isAtWar,
} from '../simulation/WorldHelpers';
import { diplomacy, blocPower, powerOf } from '../simulation/DiplomacySimulation';
import { warScore, aiPeaceTerms, applyPeace, sideOf, peaceCost } from '../simulation/WarSimulation';
import { nuclearBloc } from '../simulation/Extras';

/** 외교 AI: 동맹 추진, 관계 관리, 조약, 개전 판단 */
export function diplomacyAI(w: WorldState, c: Country) {
  const P = PERSONALITIES[c.personality];
  const nbs = [...countryNeighbors(w, c.id)].filter(n => w.countries[n].alive);
  const live = w.countries.filter(x => x.alive && x.id !== c.id);
  // 위협 평가
  const threats = nbs.filter(n => getRel(w, c.id, n) < -25 && blocPower(w, n) > blocPower(w, c.id) * 0.9);
  // 1) 위협 → 동맹 추진
  if ((threats.length || c.goals.some(g => g.type === 'alliance')) && alliesOf(w, c.id).length < 3 && chance(0.35 * P.diplo)) {
    const goalT = c.goals.find(g => g.type === 'alliance')?.target;
    const cands = live.filter(x => !hasTreaty(w, 'alliance', c.id, x.id) && !atWar(w, c.id, x.id) && getRel(w, c.id, x.id) > 20 && !threats.includes(x.id))
      .sort((a, b) => (b.id === goalT ? 50 : 0) + getRel(w, c.id, b.id) + b.militaryPower * 0.5 - (a.id === goalT ? 50 : 0) - getRel(w, c.id, a.id) - a.militaryPower * 0.5);
    for (const x of cands.slice(0, 2)) {
      if (getRel(w, c.id, x.id) >= 35) { if (diplomacy(w, c.id, x.id, 'alliance').ok) break; }
      else diplomacy(w, c.id, x.id, 'improve');
    }
  }
  // 2) 관계 개선 (주변국, 강대국)
  if (chance(0.25 * P.diplo) && c.treasury > 2) {
    const t = live.filter(x => getRel(w, c.id, x.id) < 60 && getRel(w, c.id, x.id) > -50 && !atWar(w, c.id, x.id)).sort((a, b) => b.militaryPower - a.militaryPower)[Math.floor(rand() * 3)];
    if (t) diplomacy(w, c.id, t.id, 'improve');
  }
  // 3) 무역/경제/불가침
  if (chance(0.2 * P.econ)) {
    const t = live[Math.floor(rand() * live.length)];
    if (t && !atWar(w, c.id, t.id)) {
      const r = getRel(w, c.id, t.id);
      if (r > 25 && !hasTreaty(w, 'econ', c.id, t.id)) diplomacy(w, c.id, t.id, 'econ');
      else if (r > 5 && !hasTreaty(w, 'trade', c.id, t.id)) diplomacy(w, c.id, t.id, 'trade');
    }
  }
  if (threats.length && chance(0.3)) {
    for (const t of threats) if (!hasTreaty(w, 'nap', c.id, t) && getRel(w, c.id, t) > -40 && P.aggr < 1) diplomacy(w, c.id, t, 'nap');
  }
  // 4) 강대국의 세력권: 약소 이웃 보장/종속 요구
  if ((c.personality === 'hegemonic' || c.personality === 'expansionist') && chance(0.12)) {
    const weak = nbs.filter(n => powerOf(w, n) < c.militaryPower * 0.25 && w.countries[n].overlord < 0 && !atWar(w, c.id, n));
    const t = weak[Math.floor(rand() * weak.length)];
    if (t !== undefined) {
      if (getRel(w, c.id, t) > 20 && c.personality === 'hegemonic') diplomacy(w, c.id, t, 'guarantee');
      else diplomacy(w, c.id, t, 'demandVassal');
    }
  }
  // 5) 적대국 견제
  if (chance(0.06)) {
    const rival = nbs.filter(n => getRel(w, c.id, n) < -60).sort((a, b) => getRel(w, c.id, a) - getRel(w, c.id, b))[0];
    if (rival !== undefined) {
      if (P.econ > 1 && !hasTreaty(w, 'sanction', c.id, rival, true)) diplomacy(w, c.id, rival, 'sanction');
      else if (P.aggr > 1) diplomacy(w, c.id, rival, 'insult');
    }
  }
  // 6) 동맹국 지원
  if (chance(0.15)) for (const a of alliesOf(w, c.id)) if (isAtWar(w, a) && !isAtWar(w, c.id) && c.treasury > c.gdp * 0.1) { diplomacy(w, c.id, a, 'support'); break; }
  // 7) 개전 판단
  considerWar(w, c, nbs);
}

function considerWar(w: WorldState, c: Country, nbs: number[]) {
  if (w.rules.noWar || c.id === w.player && w.mode === 'ruler') return;
  if (c.stability < 25 || c.warExhaustion > 25) return;
  const curWars = warsOf(w, c.id).length;
  if (curWars >= 1 && c.personality !== 'expansionist' && c.personality !== 'revolutionary') return;
  if (curWars >= 2) return;
  if (c.overlord >= 0) return;
  const P = PERSONALITIES[c.personality];
  const aggr = P.aggr * w.rules.aiAggression * GOVS[c.gov].mil * (1 + (c.goals.some(g => g.type === 'territory') ? 0.4 : 0));
  if (aggr <= 0) return;
  let best = -1, bd = 0;
  for (const n of nbs) {
    const T = w.countries[n];
    if (!T.alive || atWar(w, c.id, n)) continue;
    if (alliesOf(w, c.id).includes(n) || T.overlord === c.id) continue;
    if (hasTreaty(w, 'truce', c.id, n)) continue;
    const nap = hasTreaty(w, 'nap', c.id, n);
    if (nap && P.aggr < 1.3) continue;
    const rel = getRel(w, c.id, n);
    const claims = w.provinces.filter(p => p.active && p.owner === n && p.cores.includes(c.id)).length;
    const hawk = c.personality === 'expansionist' || c.personality === 'revolutionary' || c.personality === 'militarist';
    const real = w.scenario === 'real';
    if (rel > (real ? (hawk ? -5 : -25) : (hawk ? 25 : 5)) && !claims) continue;
    const myP = blocPower(w, c.id, 0.4);
    const theirP = blocPower(w, n, 0.75);
    const ratio = myP / Math.max(1, theirP);
    let desire = aggr * (ratio - 1.25) * (rel < -40 ? 1.5 : 1) * (claims ? 1.6 + Math.min(1, claims * 0.15) : 1);
    if (T.stability < 30) desire *= 1.3;
    if (isAtWar(w, n)) desire *= 1.3;
    if (c.treasury < 1 && c.debt > c.gdp * 0.6) desire *= 0.3;
    if (c.goals.some(g => g.type === 'territory' && g.target === n)) desire *= 1.6;
    if (nap) desire *= 0.4;
    // 핵 억제
    if (nuclearBloc(w, n) > 0) desire *= (c.nukes ? 0.3 : 0.12);
    if (desire > bd) { bd = desire; best = n; }
  }
  if (best < 0) return;
  if (!chance(clamp(bd, 0, 1.5) * (w.scenario === 'real' ? 0.012 : 0.025))) return;
  const ratio = blocPower(w, c.id, 0.4) / Math.max(1, blocPower(w, best, 0.75));
  const claims = w.provinces.some(p => p.active && p.owner === best && p.cores.includes(c.id));
  if (ratio > 2.5 && chance(0.6)) diplomacy(w, c.id, best, claims ? 'demandTerritory' : 'ultimatum');
  if (atWar(w, c.id, best)) return;
  if (claims && chance(0.5)) { const r = diplomacy(w, c.id, best, 'demandTerritory'); if (r.ok) return; }
  diplomacy(w, c.id, best, chance(0.5) ? 'ultimatum' : 'declareWar');
}

/** 평화 AI: 전쟁 주도국이 30일마다 판단 */
export function peaceAI(w: WorldState, c: Country) {
  for (const war of warsOf(w, c.id)) {
    const side = sideOf(war, c.id)!;
    const leader = side === 'A' ? war.leaderA : war.leaderD;
    if (leader !== c.id) continue;
    const other = side === 'A' ? war.leaderD : war.leaderA;
    const O = w.countries[other];
    const score = side === 'A' ? warScore(w, war) : -warScore(w, war);
    const age = w.day - war.start;
    const otherIsPlayer = other === w.player && w.mode === 'ruler';
    // 승리 측: 조건 제시
    if (score > 25 && (age > 300 || score > 55)) {
      const terms = aiPeaceTerms(w, war, c.id, false);
      const cost = peaceCost(w, terms);
      if (otherIsPlayer) {
        if (!w.offers.some(o => o.kind === 'peace' && o.warId === war.id)) {
          w.offers.push({ id: w.nextId.offer++, from: c.id, to: other, kind: 'peace', warId: war.id, terms, expires: w.day + 30,
            text: `${c.name}이(가) 평화 조건을 제시했습니다: ${terms.takeProvinces.length}개 지역 할양${terms.reparations ? `, 배상금 ${terms.reparations}B` : ''}. 거부하면 전쟁이 계속됩니다.` });
        }
        continue;
      }
      if (cost <= score * 1.1 + O.warExhaustion * 0.3 || O.warExhaustion > 70) { applyPeace(w, war, side, terms); continue; }
    }
    // 장기전/소모전: 백색 평화
    const exhausted = c.warExhaustion > 55 || (age > 365 * 4 && Math.abs(score) < 20);
    if (exhausted && Math.abs(score) < 25) {
      if (otherIsPlayer) {
        if (!w.offers.some(o => o.kind === 'peace' && o.warId === war.id))
          w.offers.push({ id: w.nextId.offer++, from: c.id, to: other, kind: 'peace', warId: war.id, expires: w.day + 30, text: `${c.name}이(가) 백색 평화(현상 유지)를 제안했습니다.` });
        continue;
      }
      if (O.warExhaustion > 35 || age > 365 * 5) { applyPeace(w, war, null, null); continue; }
    }
    // 패배 측: 양보 제안
    if (score < -40 && (c.warExhaustion > 45 || score < -65) && !otherIsPlayer) {
      const terms = aiPeaceTerms(w, war, other, false);
      applyPeace(w, war, side === 'A' ? 'D' : 'A', terms);
    }
  }
}

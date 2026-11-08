import type { WorldState } from '../types/World';
import type { GovType, Personality } from '../types/Country';
import { GOVS } from '../data/defs';
import { genLeader } from '../data/names';
import { rng, rand, chance, pick, clamp } from './rng';
import { chronicle, getRel, setRel, isAtWar, countryNeighbors, logEvent } from './WorldHelpers';
import { changeGovernment, splitCountry, createCountry, mergeCountries } from './CountryOps';
import { declareWar } from './WarSimulation';

/**
 * 정치 사건: 선거, 쿠데타, 혁명, 내전, 독립운동, 통합.
 * 경제 → 불만 → 정치 불안 → 정권 교체 → 외교 노선 변화 의 연쇄를 만든다.
 */
export function monthlyPoliticalEvents(w: WorldState) {
  for (const c of w.countries) {
    if (!c.alive) continue;
    const g = GOVS[c.gov];
    // 선거
    if (g.elections && w.day - c.lastElection >= 365 * 4) {
      c.lastElection = w.day;
      const incumbentWins = rand() < 0.25 + c.stability / 140;
      if (incumbentWins) {
        c.legitimacy = Math.min(100, c.legitimacy + 10);
        logEvent(w, `${c.shortName} 총선: 집권 세력 재집권 (${c.leader})`, 'politics', c.id);
      } else {
        const old = c.leader; c.leader = genLeader(rng); c.leaderSince = w.day; c.legitimacy = 65;
        // 불안한 시기에는 극단 세력이 승리
        if (c.stability < 30 && rand() < 0.45) {
          const ng: GovType = pick(['oneparty', 'junta', 'absolute'] as GovType[]);
          changeGovernment(w, c.id, ng, pick(['revolutionary', 'expansionist', 'militarist'] as Personality[]), `선거에서 극단주의 세력이 승리하며 `);
        } else {
          const np = shiftPersonality(c.personality, c.stability);
          if (np !== c.personality) c.personality = np;
          chronicle(w, 'politics', `${c.shortName} 정권 교체`, `${c.name} 선거에서 야당이 승리했다. ${old} → ${c.leader}. 새 정부의 노선: ${np}.`, [c.id]);
        }
      }
    }
    // 지도자 사망/교체 (비선거 국가)
    if (!g.elections && rand() < 1 / (12 * 22)) {
      const old = c.leader; c.leader = genLeader(rng); c.leaderSince = w.day;
      c.legitimacy = clamp(c.legitimacy - 10, 0, 100);
      logEvent(w, `${c.shortName}: ${old} 사망, ${c.leader} 승계`, 'politics', c.id);
      if (rand() < 0.3) c.personality = shiftPersonality(c.personality, c.stability);
    }
    const unrest = c.avgUnrest ?? 0;
    // 정권 교체 직후 2년은 체제 변동 없음
    if (w.day - c.leaderSince < 730 && w.day > 730) continue;
    // 쿠데타
    if (c.stability < 32 && c.gov !== 'junta' && rand() < (32 - c.stability) * 0.0018 * (c.warExhaustion > 50 ? 1.5 : 1)) {
      changeGovernment(w, c.id, 'junta', pick(['militarist', 'expansionist', 'defensive'] as Personality[]), '군부 쿠데타로 ');
      c.stability = 40;
      continue;
    }
    // 혁명
    if (c.stability < 18 && rand() < (18 - c.stability) * 0.004) {
      const ng: GovType = c.gov === 'oneparty' || c.gov === 'junta' ? pick(['democracy', 'republic'] as GovType[]) : pick(['oneparty', 'republic', 'democracy'] as GovType[]);
      changeGovernment(w, c.id, ng, 'revolutionary', '혁명으로 ');
      c.stability = 35;
      for (const n of countryNeighbors(w, c.id)) setRel(w, c.id, n, getRel(w, c.id, n) - 20);
      continue;
    }
    // 내전
    if (c.stability < 10 && unrest > 45 && c.provinceCount >= 4 && rand() < 0.04) {
      const rebels = splitCountry(w, c.id, true);
      if (rebels >= 0) {
        const R = w.countries[rebels];
        R.gov = c.gov === 'oneparty' ? 'republic' : 'oneparty';
        R.name = `${R.shortName} ${pick(GOVS[R.gov].suffix)}`;
        chronicle(w, 'politics', `${c.shortName} 내전 발발`, `정부의 붕괴 속에 ${R.name}이(가) 수립되며 ${c.name}이(가) 내전에 돌입했다.`, [c.id, rebels], true);
        R.militaryPower = 0;
        declareWar(w, rebels, c.id, [c.capital], '내전');
        c.stability = 30;
      }
      continue;
    }
    // 독립운동: 문화가 다른 불만 지역
    if (c.provinceCount >= 5 && rand() < 0.1) {
      const cand = w.provinces.filter(p => p.active && p.owner === c.id && p.culture !== c.culture && p.unrest > 56 && p.id !== c.capital);
      if (cand.length) {
        const seed = cand[0]; const cult = seed.culture;
        const group = new Set<number>([seed.id]); const q = [seed.id];
        while (q.length) { const p = q.shift()!; for (const n of w.provinces[p].neighbors) { const P = w.provinces[n]; if (!group.has(n) && P.owner === c.id && P.culture === cult && P.unrest > 45 && n !== c.capital) { group.add(n); q.push(n); } } }
        if (group.size >= 1 && rand() < 0.5 + group.size * 0.05) {
          const nid = createCountry(w, [...group], { from: c.id, personality: 'defensive', gov: pick(['republic', 'democracy', 'constitutional'] as GovType[]), name: w.cultures[cult]?.name.replace(/(인|족|계)$/, '') });
          if (nid >= 0) {
            chronicle(w, 'nation', `${w.countries[nid].name} 독립 선언`, `${w.cultures[cult]?.name ?? ''} 주민들이 ${c.name}의 지배에 반발해 독립을 선언했다.`, [nid, c.id], true);
            if (c.personality !== 'pacifist' && c.militaryPower > w.countries[nid].militaryPower * 1.5 && rand() < 0.6) declareWar(w, c.id, nid, [...group], '독립 진압 전쟁');
          }
        }
      }
    }
  }
  // 통합: 같은 문화의 우호 국가
  if (rand() < 0.08) {
    const live = w.countries.filter(c => c.alive);
    for (const a of live) {
      if (isAtWar(w, a.id)) continue;
      for (const nb of countryNeighbors(w, a.id, false)) {
        const b = w.countries[nb];
        if (!b.alive || b.culture !== a.culture || isAtWar(w, b.id)) continue;
        if (getRel(w, a.id, b.id) > 85 && a.provinceCount > b.provinceCount * 1.5 && a.stability > 55 && b.stability > 40 && chance(0.25)) {
          chronicle(w, 'nation', `${a.shortName}-${b.shortName} 통합`, `같은 ${w.cultures[a.culture]?.name ?? ''} 문화권인 ${b.name}이(가) ${a.name}과(와) 평화적으로 통합되었다.`, [a.id, b.id], true);
          mergeCountries(w, a.id, b.id);
          return;
        }
      }
    }
  }
}

function shiftPersonality(p: Personality, stability: number): Personality {
  const calm: Personality[] = ['pacifist', 'mercantile', 'defensive', 'isolationist'];
  const hard: Personality[] = ['expansionist', 'militarist', 'hegemonic', 'revolutionary'];
  if (stability < 35) return chance(0.6) ? pick(hard) : pick(calm);
  return chance(0.7) ? pick(calm) : pick(hard);
}

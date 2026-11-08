import type { WorldState } from '../types/World';
import type { Country } from '../types/Country';
import { rand, chance, pick, clamp } from './rng';
import { chronicle, countryNeighbors, getRel, addRel, logEvent, isAtWar } from './WorldHelpers';
import { genLeader } from '../data/names';
import { rng } from './rng';
import { techCostFor } from './CountrySimulation';

/**
 * 플레이어 국가에 발생하는 선택형 사건.
 * 각 사건은 조건(when)과 선택지별 효과(apply)를 가진다.
 */
interface EventDef {
  id: string;
  weight: (w: WorldState, c: Country) => number;
  make: (w: WorldState, c: Country) => { title: string; text: string; options: { label: string; desc: string }[]; data?: any };
  apply: (w: WorldState, c: Country, choice: number, data: any) => string;
}

const g = (c: Country) => c.gdp;
const neighborsOf = (w: WorldState, c: Country) => [...countryNeighbors(w, c.id)];

const EVENTS: EventDef[] = [
  {
    id: 'strike', weight: (w, c) => (c.unemployment > 0.07 || c.inflation > 0.06 ? 3 : 0.4),
    make: (w, c) => ({ title: '노동자 총파업', text: `물가와 일자리 문제로 ${c.shortName} 전역의 노동조합이 총파업에 들어갔다. 공장이 멈추고 거리에는 시위대가 가득하다.`,
      options: [{ label: '임금 인상 협상', desc: `국고 -${(g(c) * 0.01).toFixed(1)}B, 안정도 +6` }, { label: '군경 투입 진압', desc: '안정도 -6, 정통성 -6, 불만 증가' }, { label: '방관', desc: 'GDP -3%, 안정도 -3' }] }),
    apply: (w, c, k) => {
      if (k === 0) { c.treasury -= g(c) * 0.01; c.stability += 6; return '협상 타결: 파업 종료'; }
      if (k === 1) { c.stability -= 6; c.legitimacy -= 6; for (const p of w.provinces) if (p.owner === c.id) p.unrest += 8; return '파업 진압: 국민 감정 악화'; }
      c.gdp *= 0.97; c.stability -= 3; return '파업 장기화';
    },
  },
  {
    id: 'scientist', weight: () => 1,
    make: (w, c) => { const others = w.countries.filter(o => o.alive && o.id !== c.id); const o = pick(others); return { title: '천재 과학자의 망명', text: `${o.name}의 저명한 과학자가 ${c.shortName}으로 망명을 요청했다. 그의 연구는 우리 기술을 크게 앞당길 수 있다.`, data: { o: o.id },
      options: [{ label: '망명 수용', desc: `연구 진행도 크게 상승, ${o.shortName}과 관계 -15` }, { label: '정중히 거절', desc: `${o.shortName}과 관계 +5` }] }; },
    apply: (w, c, k, d) => { if (k === 0) { c.techProgress += techCostFor(w, c, c.researchFocus) * 0.7; addRel(w, c.id, d.o, -15); return '과학자 망명 수용: 연구 가속'; } addRel(w, c.id, d.o, 5); return '망명 거절'; },
  },
  {
    id: 'invest', weight: (w, c) => (c.treasury < g(c) * 0.03 ? 2 : 0.7),
    make: (w, c) => ({ title: '해외 자본의 투자 제안', text: '국제 투자 컨소시엄이 대규모 인프라 투자를 제안했다. 다만 조건으로 일정한 채무를 떠안아야 한다.',
      options: [{ label: '투자 유치', desc: `국고 +${(g(c) * 0.04).toFixed(1)}B, 부채 +${(g(c) * 0.03).toFixed(1)}B, 공장 1개 건설` }, { label: '거절', desc: '변화 없음' }] }),
    apply: (w, c, k) => {
      if (k === 1) return '투자 거절';
      c.treasury += g(c) * 0.04; c.debt += g(c) * 0.03;
      const p = w.provinces.filter(x => x.owner === c.id && (x.buildings.factory || 0) < 10).sort((a, b) => b.pop - a.pop)[0];
      if (p) p.buildings.factory = (p.buildings.factory || 0) + 1;
      return '해외 투자 유치';
    },
  },
  {
    id: 'border', weight: (w, c) => neighborsOf(w, c).some(n => getRel(w, c.id, n) < -20) ? 2 : 0,
    make: (w, c) => { const n = neighborsOf(w, c).filter(x => getRel(w, c.id, x) < -20); const o = w.countries[pick(n)]; return { title: '국경 무력 충돌', text: `${o.shortName}과(와)의 국경에서 총격전이 벌어져 병사들이 사망했다. 국민들은 강력한 대응을 요구하고 있다.`, data: { o: o.id },
      options: [{ label: '강경 보복', desc: `관계 -25, 정통성 +6, 안정도 +3` }, { label: '외교적 해결', desc: `국고 -${(g(c) * 0.005).toFixed(1)}B, 관계 +10, 안정도 -2` }] }; },
    apply: (w, c, k, d) => { if (k === 0) { addRel(w, c.id, d.o, -25); c.legitimacy += 6; c.stability += 3; return '보복 조치'; } c.treasury -= g(c) * 0.005; addRel(w, c.id, d.o, 10); c.stability -= 2; return '외교적 해결'; },
  },
  {
    id: 'harvest', weight: (w, c) => (c.prod.food > c.cons.food * 1.2 ? 1.5 : 0),
    make: (w, c) => ({ title: '대풍년', text: '날씨가 좋아 기록적인 풍년이 들었다. 곳간이 넘쳐난다.', options: [{ label: '전략 비축', desc: '식량 비축 대폭 증가' }, { label: '해외 수출', desc: `국고 +${(c.prod.food * w.prices.food * 3).toFixed(1)}B` }, { label: '국민에게 분배', desc: '안정도 +5' }] }),
    apply: (w, c, k) => { if (k === 0) { c.stock.food += c.cons.food * 6; return '식량 비축'; } if (k === 1) { c.treasury += c.prod.food * w.prices.food * 3; return '곡물 수출'; } c.stability += 5; return '풍년 축제'; },
  },
  {
    id: 'scandal', weight: () => 0.8,
    make: (w, c) => ({ title: '정권 비리 스캔들', text: `${c.leader} 측근의 대규모 비리가 언론에 폭로되었다. 야당과 시민단체가 책임을 요구한다.`,
      options: [{ label: '지도자 사퇴', desc: '새 지도자, 정통성 +12, 안정도 -4' }, { label: '사건 은폐 시도', desc: '50%: 무마 / 50%: 정통성 -20, 안정도 -10' }, { label: '측근만 경질', desc: '정통성 -5' }] }),
    apply: (w, c, k) => {
      if (k === 0) { const old = c.leader; c.leader = genLeader(rng); c.leaderSince = w.day; c.legitimacy += 12; c.stability -= 4; chronicle(w, 'politics', `${c.shortName} 지도자 사퇴`, `${old}이(가) 비리 스캔들로 사퇴하고 ${c.leader}이(가) 뒤를 이었다.`, [c.id]); return '지도자 사퇴'; }
      if (k === 1) { if (chance(0.5)) return '은폐 성공'; c.legitimacy -= 20; c.stability -= 10; return '은폐 실패! 여론 폭발'; }
      c.legitimacy -= 5; return '측근 경질';
    },
  },
  {
    id: 'general', weight: (w, c) => (isAtWar(w, c.id) ? 2 : 0.4),
    make: (w, c) => ({ title: '국민 영웅 장군', text: '한 장군이 탁월한 지휘로 국민적 영웅이 되었다. 그를 중용하면 군의 사기가 오르겠지만, 정치적 야심도 우려된다.',
      options: [{ label: '원수로 승진', desc: '전군 사기·조직력 상승, 안정도 -3 (쿠데타 위험)' }, { label: '견제·명예직', desc: '정통성 +3' }] }),
    apply: (w, c, k) => { if (k === 0) { for (const d of w.divisions) if (d.owner === c.id) { d.morale = Math.min(1, d.morale + 0.25); d.org = Math.min(1, d.org + 0.2); } c.stability -= 3; return '영웅 장군 원수 승진'; } c.legitimacy += 3; return '장군 견제'; },
  },
  {
    id: 'olympics', weight: (w, c) => (c.gdp > 300 && !isAtWar(w, c.id) ? 0.5 : 0),
    make: (w, c) => ({ title: '국제 체육대회 유치 신청', text: '세계 체육대회 개최권이 걸렸다. 막대한 비용이 들지만 국위 선양의 기회다.', options: [{ label: '유치 추진', desc: `국고 -${(g(c) * 0.02).toFixed(1)}B, 안정도 +8, 모든 국가와 관계 +5` }, { label: '포기', desc: '변화 없음' }] }),
    apply: (w, c, k) => { if (k === 1) return '유치 포기'; c.treasury -= g(c) * 0.02; c.stability += 8; for (const o of w.countries) if (o.alive && o.id !== c.id) addRel(w, c.id, o.id, 5); chronicle(w, 'culture', `${c.shortName} 국제 체육대회 개최`, `${c.name}이(가) 세계 체육대회를 성공적으로 개최했다.`, [c.id]); return '체육대회 개최'; },
  },
  {
    id: 'immigrants', weight: (w, c) => (c.stability > 55 ? 0.8 : 0),
    make: (w, c) => ({ title: '난민·이민 행렬', text: '분쟁 지역에서 수십만 명의 난민이 국경에 몰려들었다.', options: [{ label: '수용', desc: '인구 +1%, 불만 소폭 증가, 국제적 호평' }, { label: '국경 봉쇄', desc: '안정도 +2, 국제 관계 소폭 악화' }] }),
    apply: (w, c, k) => {
      if (k === 0) { for (const p of w.provinces) if (p.owner === c.id) { p.pop *= 1.01; p.unrest += 3; } for (const o of w.countries) if (o.alive && o.id !== c.id && rand() < 0.3) addRel(w, c.id, o.id, 4); return '난민 수용'; }
      c.stability += 2; for (const o of w.countries) if (o.alive && o.id !== c.id && rand() < 0.3) addRel(w, c.id, o.id, -3); return '국경 봉쇄';
    },
  },
  {
    id: 'separatist', weight: (w, c) => (w.provinces.some(p => p.owner === c.id && p.culture !== c.culture && p.unrest > 40) ? 2 : 0),
    make: (w, c) => ({ title: '분리주의 운동 확산', text: '소수 민족 지역에서 분리주의 지도자가 대중의 지지를 얻고 있다.', options: [{ label: '지도자 체포', desc: '해당 지역 불만 -15, 안정도 -2' }, { label: '자치권 부여', desc: '해당 지역 불만 -30, 정통성 -5' }] }),
    apply: (w, c, k) => { for (const p of w.provinces) if (p.owner === c.id && p.culture !== c.culture) p.unrest = Math.max(0, p.unrest - (k === 0 ? 15 : 30)); if (k === 0) c.stability -= 2; else c.legitimacy -= 5; return k === 0 ? '분리주의 지도자 체포' : '자치권 부여'; },
  },
  {
    id: 'oil', weight: () => 0.4,
    make: (w, c) => ({ title: '대규모 유전 탐사 결과', text: '지질 조사단이 대규모 유전의 가능성을 보고했다. 개발에는 큰 비용이 든다.', options: [{ label: '개발 착수', desc: `국고 -${(g(c) * 0.01).toFixed(1)}B, 70% 확률로 유전 발견` }, { label: '보류', desc: '변화 없음' }] }),
    apply: (w, c, k) => {
      if (k === 1) return '개발 보류';
      c.treasury -= g(c) * 0.01;
      if (!chance(0.7)) return '시추 실패…';
      const p = pick(w.provinces.filter(x => x.owner === c.id));
      if (p) { p.resource = 'oil'; p.resourceAmount = 3; chronicle(w, 'economy', `${p.name} 대유전 발견`, `${c.name}의 ${p.name}에서 대유전이 발견되었다.`, [c.id], false, p.id); }
      return '유전 발견!';
    },
  },
  {
    id: 'military_discontent', weight: (w, c) => (c.stability < 45 && c.gov !== 'junta' ? 1.5 : 0),
    make: (w, c) => ({ title: '군부의 불만', text: '군 지휘부가 예산 삭감과 정치 혼란에 불만을 표출하고 있다. 쿠데타설이 돈다.', options: [{ label: '국방 예산 증액', desc: `국고 -${(g(c) * 0.015).toFixed(1)}B, 안정도 +5` }, { label: '군 숙청', desc: '안정도 -4, 전군 조직력 하락, 쿠데타 위험 제거' }] }),
    apply: (w, c, k) => { if (k === 0) { c.treasury -= g(c) * 0.015; c.stability += 5; c.budget.military = Math.min(1, c.budget.military + 0.15); return '국방 예산 증액'; } c.stability -= 4; c.leaderSince = w.day; for (const d of w.divisions) if (d.owner === c.id) d.org *= 0.6; return '군 숙청'; },
  },
];

export function monthlyDecisions(w: WorldState) {
  if (w.mode !== 'ruler' || w.player < 0) return;
  const c = w.countries[w.player]; if (!c?.alive) return;
  if (w.decision || !chance(0.22)) return;
  const pool = EVENTS.map(e => ({ e, wt: e.weight(w, c) })).filter(x => x.wt > 0);
  const tot = pool.reduce((a, b) => a + b.wt, 0); if (!tot) return;
  let x = rand() * tot; let ev = pool[0].e;
  for (const p of pool) { x -= p.wt; if (x <= 0) { ev = p.e; break; } }
  const m = ev.make(w, c);
  w.decision = { id: ev.id, title: m.title, text: m.text, options: m.options, data: m.data, expires: w.day + 60 };
}

export function resolveDecision(w: WorldState, choice: number): string {
  const d = w.decision; if (!d) return '';
  w.decision = null;
  const c = w.countries[w.player]; if (!c?.alive) return '';
  const ev = EVENTS.find(e => e.id === d.id); if (!ev) return '';
  const msg = ev.apply(w, c, choice, d.data);
  c.stability = clamp(c.stability, 0, 100); c.legitimacy = clamp(c.legitimacy, 0, 100);
  logEvent(w, `${d.title}: ${msg}`, 'politics', c.id);
  return msg;
}

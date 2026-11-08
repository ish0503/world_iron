import type { WorldState, TreatyType, DiplomaticOffer } from '../types/World';
import { PERSONALITIES } from '../data/defs';
import { rand, clamp } from './rng';
import {
  getRel, setRel, addRel, hasTreaty, addTreaty, removeTreaty, atWar, alliesOf, countryNeighbors,
  chronicle, cname, logEvent, isAtWar, guarantorsOf,
} from './WorldHelpers';
import { declareWar, warScore, applyPeace, sideOf, peaceCost, provinceValue } from './WarSimulation';
import { transferProvince } from './CountryOps';
import type { PeaceTerms } from '../types/World';

export type DiploAction =
  | 'improve' | 'insult' | 'nap' | 'alliance' | 'econ' | 'trade' | 'access' | 'support'
  | 'demandVassal' | 'demandTerritory' | 'ultimatum' | 'declareWar' | 'guarantee' | 'sanction'
  | 'breakAlliance' | 'liftSanction' | 'releaseVassal';

export const DIPLO_ACTIONS: { id: DiploAction; name: string; desc: string }[] = [
  { id: 'improve', name: '관계 개선', desc: '외교 사절 파견 (비용 0.5B, +관계)' },
  { id: 'insult', name: '관계 악화', desc: '공개 비난 (-관계)' },
  { id: 'nap', name: '불가침 조약', desc: '10년간 상호 불가침' },
  { id: 'alliance', name: '군사 동맹', desc: '공동 방위 (관계 40 이상)' },
  { id: 'econ', name: '경제 협력', desc: 'GDP 및 연구 협력 (관계 25 이상)' },
  { id: 'trade', name: '무역 협정', desc: '수출 가격 및 GDP 상승' },
  { id: 'access', name: '군사 통행권', desc: '상대 영토 통과 허용 요청' },
  { id: 'support', name: '전쟁 지원', desc: '교전 중인 국가에 국고의 10% 지원' },
  { id: 'guarantee', name: '독립 보장', desc: '상대가 공격받으면 참전' },
  { id: 'sanction', name: '국제 제재', desc: '상대의 무역에 압박 (-관계)' },
  { id: 'demandVassal', name: '종속국 요구', desc: '약소국에 종속 요구' },
  { id: 'demandTerritory', name: '영토 반환 요구', desc: '자국 핵심 영토 반환 요구' },
  { id: 'ultimatum', name: '최후통첩', desc: '접경 영토 할양 요구, 거부시 전쟁' },
  { id: 'declareWar', name: '선전포고', desc: '전쟁을 선포한다' },
  { id: 'breakAlliance', name: '동맹 파기', desc: '동맹/조약 해제' },
  { id: 'liftSanction', name: '제재 해제', desc: '부과한 제재를 해제' },
  { id: 'releaseVassal', name: '종속국 해방', desc: '종속 관계를 해제' },
];

export function powerOf(w: WorldState, c: number) { return w.countries[c]?.militaryPower ?? 0; }
export function blocPower(w: WorldState, c: number, factor = 0.6) {
  let p = powerOf(w, c);
  for (const a of alliesOf(w, c)) p += powerOf(w, a) * factor;
  for (const g of guarantorsOf(w, c)) p += powerOf(w, g) * factor * 0.7;
  return p;
}

/** 월간 관계 변화 */
export function monthlyDiplomacy(w: WorldState) {
  const live = w.countries.filter(c => c.alive);
  const coreClaims = new Map<string, number>();
  for (const p of w.provinces) if (p.active && p.owner >= 0) for (const core of p.cores) if (core !== p.owner && w.countries[core]?.alive) {
    const k = core + ':' + p.owner; coreClaims.set(k, (coreClaims.get(k) || 0) + 1);
  }
  const nbs = new Map<number, Set<number>>();
  for (const c of live) nbs.set(c.id, countryNeighbors(w, c.id));
  for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
    const a = live[i], b = live[j];
    let base = 0;
    if (a.gov === b.gov) base += 15;
    const auth = (g: string) => g === 'junta' || g === 'oneparty' || g === 'absolute';
    if (auth(a.gov) !== auth(b.gov)) base -= 12;
    if (a.culture === b.culture) base += 12;
    if (a.religion === b.religion) base += 8; else if (a.gov === 'theocracy' || b.gov === 'theocracy') base -= 12;
    if (hasTreaty(w, 'alliance', a.id, b.id)) base += 25;
    if (hasTreaty(w, 'trade', a.id, b.id)) base += 10;
    if (hasTreaty(w, 'econ', a.id, b.id)) base += 12;
    if (hasTreaty(w, 'nap', a.id, b.id)) base += 5;
    if (hasTreaty(w, 'guarantee', a.id, b.id)) base += 12;
    if (hasTreaty(w, 'sanction', a.id, b.id)) base -= 35;
    if (a.overlord === b.id || b.overlord === a.id) base += 25;
    const border = nbs.get(a.id)!.has(b.id);
    if (border) base -= 12;
    const claims = (coreClaims.get(a.id + ':' + b.id) || 0) + (coreClaims.get(b.id + ':' + a.id) || 0);
    base -= Math.min(45, claims * 12);
    if (border) {
      const ratio = (a.militaryPower + 1) / (b.militaryPower + 1);
      if (ratio > 2.5 || ratio < 0.4) base -= 8;
    }
    if (atWar(w, a.id, b.id)) base = -80;
    if (a.personality === 'revolutionary' && b.personality !== 'revolutionary') base -= 10;
    if (b.personality === 'revolutionary' && a.personality !== 'revolutionary') base -= 10;
    if (a.personality === 'hegemonic' && b.personality === 'hegemonic' && border) base -= 15;
    if (a.personality === 'isolationist' || b.personality === 'isolationist') base *= 0.6;
    // 공동의 적
    const cur = getRel(w, a.id, b.id);
    setRel(w, a.id, b.id, cur + (base - cur) * 0.06 + (rand() - 0.5) * 3);
  }
  // 국경 분쟁 사건 (연쇄 작용의 씨앗)
  if (rand() < 0.2 && live.length > 1) {
    const a = live[Math.floor(rand() * live.length)];
    const ns = [...(nbs.get(a.id) || [])];
    if (ns.length) {
      const b = ns[Math.floor(rand() * ns.length)];
      if (!atWar(w, a.id, b) && !hasTreaty(w, 'alliance', a.id, b)) {
        addRel(w, a.id, b, -20 - rand() * 15);
        logEvent(w, `${a.shortName}-${cname(w, b)} 국경 분쟁 발생`, 'diplomacy', a.id);
      }
    }
  }
  // 강대국 경쟁
  const top = [...live].sort((x, y) => y.militaryPower - x.militaryPower).slice(0, 4);
  for (let i = 0; i < top.length; i++) for (let j = i + 1; j < top.length; j++) if (!hasTreaty(w, 'alliance', top[i].id, top[j].id)) addRel(w, top[i].id, top[j].id, -1.2);
  // 조약 만료
  const before = w.treaties.length;
  w.treaties = w.treaties.filter(t => t.until < 0 || t.until > w.day);
  if (before !== w.treaties.length) logEvent(w, `${before - w.treaties.length}건의 조약이 만료되었다`, 'diplomacy');
  // 만료된 제안
  w.offers = w.offers.filter(o => o.expires > w.day);
}

export interface DiploResult { ok: boolean; msg: string; pending?: boolean }

/** AI 수락 판단 */
export function aiAccepts(w: WorldState, to: number, from: number, action: DiploAction): { accept: boolean; why: string } {
  const T = w.countries[to], F = w.countries[from];
  const rel = getRel(w, to, from);
  const P = PERSONALITIES[T.personality];
  const fearRatio = blocPower(w, from) / Math.max(1, blocPower(w, to));
  // 위협: 주변의 강한 적대국
  let threatened = false;
  for (const n of countryNeighbors(w, to)) if (getRel(w, to, n) < -30 && powerOf(w, n) > powerOf(w, to) * 1.2) threatened = true;
  const commonEnemy = [...countryNeighbors(w, to)].some(n => getRel(w, to, n) < -30 && getRel(w, from, n) < -30);
  switch (action) {
    case 'nap': return { accept: rel > -10 && (rel + (threatened ? 20 : 0) + P.diplo * 10 > 15), why: '관계가 충분하지 않습니다' };
    case 'alliance': {
      if (alliesOf(w, to).length >= 5 || alliesOf(w, from).length >= 5) return { accept: false, why: '이미 동맹이 너무 많습니다' };
      const sameBloc = (['democracy', 'republic', 'constitutional', 'federation'].includes(T.gov)) === (['democracy', 'republic', 'constitutional', 'federation'].includes(F.gov));
      const score = rel - 35 + (sameBloc ? 10 : -5) + (commonEnemy ? 25 : 0) + (threatened ? 15 : 0) + P.diplo * 8 - (T.personality === 'isolationist' ? 40 : 0) + (F.militaryPower > T.militaryPower ? 10 : 0);
      return { accept: rel >= 35 && score > 0, why: '동맹을 맺을 만큼 신뢰하지 않습니다' };
    }
    case 'econ': return { accept: rel >= 25 && T.personality !== 'isolationist', why: '경제 협력에 관심이 없습니다' };
    case 'trade': if (w.treaties.filter(t => t.type === 'trade' && (t.a === to || t.b === to)).length >= 6) return { accept: false, why: '무역 협정이 포화 상태입니다' };
      return { accept: rel >= 0 && T.personality !== 'isolationist' || (T.personality === 'mercantile' && rel > -20), why: '무역 협정을 거부합니다' };
    case 'access': return { accept: rel >= 30 || T.overlord === from, why: '통행권을 허락하지 않습니다' };
    case 'demandVassal': return { accept: fearRatio > 4 && rel > -40 && !isAtWar(w, to) && T.provinceCount < F.provinceCount * 0.35, why: '종속을 거부합니다' };
    case 'demandTerritory':
    case 'ultimatum': return { accept: fearRatio > 3.2 && T.personality !== 'militarist' && T.personality !== 'revolutionary' && rand() < 0.75, why: '요구를 거부합니다' };
    default: return { accept: true, why: '' };
  }
}

function playerOffer(w: WorldState, from: number, to: number, kind: DiplomaticOffer['kind'], text: string, extra: Partial<DiplomaticOffer> = {}) {
  if (w.offers.some(o => o.from === from && o.to === to && o.kind === kind)) return;
  w.offers.push({ id: w.nextId.offer++, from, to, kind, text, expires: w.day + 30, ...extra });
}

function borderProvincesOf(w: WorldState, victim: number, taker: number, max: number) {
  const cand = w.provinces.filter(p => p.active && p.owner === victim && p.id !== w.countries[victim].capital && p.neighbors.some(n => w.provinces[n].owner === taker));
  cand.sort((a, b) => (b.cores.includes(taker) ? 1 : 0) - (a.cores.includes(taker) ? 1 : 0) || provinceValue(w, a.id) - provinceValue(w, b.id));
  return cand.slice(0, max).map(p => p.id);
}

/** 외교 행동 실행. 플레이어가 수신자이면 제안이 대기열에 등록된다. */
export function diplomacy(w: WorldState, from: number, to: number, action: DiploAction): DiploResult {
  const F = w.countries[from], T = w.countries[to];
  if (!F?.alive || !T?.alive || from === to) return { ok: false, msg: '대상이 올바르지 않습니다' };
  const rel = getRel(w, from, to);
  const toPlayer = to === w.player && w.mode === 'ruler';
  const accept = (a: DiploAction) => toPlayer ? { accept: false, why: '' } : aiAccepts(w, to, from, a);
  const done = (msg: string, major = false) => { if (major) chronicle(w, 'diplomacy', msg, msg, [from, to]); else logEvent(w, msg, 'diplomacy', from); return { ok: true, msg }; };
  switch (action) {
    case 'improve': {
      if (F.treasury < 0.5) return { ok: false, msg: '국고가 부족합니다' };
      F.treasury -= 0.5; addRel(w, from, to, 12 * PERSONALITIES[F.personality].diplo * (1 + F.tech.communication * 0.05));
      return done(`${F.shortName} → ${T.shortName}: 관계 개선`);
    }
    case 'insult': addRel(w, from, to, -25); return done(`${F.shortName}이(가) ${T.shortName}을(를) 공개 비난`);
    case 'nap': case 'alliance': case 'econ': case 'trade': case 'access': {
      if (atWar(w, from, to)) return { ok: false, msg: '교전 중입니다' };
      if (hasTreaty(w, action, from, to)) return { ok: false, msg: '이미 체결되어 있습니다' };
      if (action === 'alliance' && rel < 35) return { ok: false, msg: '관계가 35 이상이어야 합니다' };
      if (action === 'econ' && rel < 25) return { ok: false, msg: '관계가 25 이상이어야 합니다' };
      const names: Record<string, string> = { nap: '불가침 조약', alliance: '군사 동맹', econ: '경제 협력 협정', trade: '무역 협정', access: '군사 통행권' };
      if (toPlayer) { playerOffer(w, from, to, action as DiplomaticOffer['kind'], `${F.name}이(가) ${names[action]} 체결을 제안했습니다.`); return { ok: true, msg: '제안을 보냈습니다', pending: true }; }
      const r = accept(action);
      if (!r.accept) { addRel(w, from, to, -3); return { ok: false, msg: `${T.shortName}: ${r.why}` }; }
      addTreaty(w, action as TreatyType, action === 'access' ? to : from, action === 'access' ? from : to, action === 'nap' ? w.day + 3650 : -1);
      addRel(w, from, to, 10);
      return done(`${F.shortName}-${T.shortName} ${names[action]} 체결`, action === 'alliance');
    }
    case 'support': {
      if (!isAtWar(w, to)) return { ok: false, msg: '상대가 전쟁 중이 아닙니다' };
      const amt = F.treasury * 0.1; if (amt < 0.1) return { ok: false, msg: '국고가 부족합니다' };
      F.treasury -= amt; T.treasury += amt; addRel(w, from, to, 15);
      addTreaty(w, 'support', from, to, w.day + 365);
      return done(`${F.shortName}이(가) ${T.shortName}에 전쟁 자금 ${amt.toFixed(1)}B 지원`);
    }
    case 'guarantee':
      if (hasTreaty(w, 'guarantee', from, to, true)) return { ok: false, msg: '이미 보장 중입니다' };
      addTreaty(w, 'guarantee', from, to); addRel(w, from, to, 15);
      return done(`${F.shortName}이(가) ${T.shortName}의 독립을 보장`);
    case 'sanction':
      if (hasTreaty(w, 'sanction', from, to, true)) return { ok: false, msg: '이미 제재 중입니다' };
      removeTreaty(w, 'trade', from, to); removeTreaty(w, 'econ', from, to);
      addTreaty(w, 'sanction', from, to); addRel(w, from, to, -30);
      return done(`${F.shortName}이(가) ${T.shortName}에 국제 제재 부과`, true);
    case 'liftSanction': removeTreaty(w, 'sanction', from, to); addRel(w, from, to, 10); return done(`${F.shortName}이(가) ${T.shortName} 제재 해제`);
    case 'breakAlliance':
      for (const t of ['alliance', 'nap', 'econ', 'trade', 'access', 'guarantee'] as const) removeTreaty(w, t, from, to);
      addRel(w, from, to, -30);
      return done(`${F.shortName}이(가) ${T.shortName}과(와)의 조약 파기`, true);
    case 'releaseVassal':
      if (T.overlord !== from) return { ok: false, msg: '종속국이 아닙니다' };
      T.overlord = -1; addRel(w, from, to, 30); return done(`${F.shortName}이(가) ${T.shortName}을(를) 해방`, true);
    case 'demandVassal': {
      if (T.overlord >= 0) return { ok: false, msg: '이미 다른 국가의 종속국입니다' };
      if (toPlayer) { playerOffer(w, from, to, 'vassal', `${F.name}이(가) 종속국이 될 것을 요구합니다. 거부하면 관계가 크게 악화됩니다.`); return { ok: true, msg: '요구를 전달했습니다', pending: true }; }
      const r = accept('demandVassal');
      if (!r.accept) { addRel(w, from, to, -30); return { ok: false, msg: `${T.shortName}: ${r.why}` }; }
      T.overlord = from; chronicle(w, 'diplomacy', `${T.shortName}, ${F.shortName}의 종속국이 되다`, `${T.name}이(가) ${F.name}의 요구를 받아들여 종속국이 되었다.`, [from, to], true);
      return { ok: true, msg: '요구가 수락되었습니다' };
    }
    case 'demandTerritory': case 'ultimatum': {
      if (w.rules.noWar && action === 'ultimatum') return { ok: false, msg: '평화 세계 규칙으로 불가' };
      const provs = action === 'demandTerritory'
        ? w.provinces.filter(p => p.active && p.owner === to && p.cores.includes(from)).map(p => p.id)
        : borderProvincesOf(w, to, from, Math.max(1, Math.min(4, Math.ceil(T.provinceCount * 0.2))));
      if (!provs.length) return { ok: false, msg: action === 'demandTerritory' ? '반환을 요구할 핵심 영토가 없습니다' : '요구할 접경 영토가 없습니다' };
      const label = action === 'ultimatum' ? '최후통첩' : '영토 반환 요구';
      if (toPlayer) {
        playerOffer(w, from, to, 'ultimatum', `${F.name}의 ${label}: ${provs.map(p => w.provinces[p].name).join(', ')} 할양을 요구합니다.${action === 'ultimatum' ? ' 거부하면 전쟁입니다.' : ''}`, { provinces: provs });
        (w.offers[w.offers.length - 1] as any).hard = action === 'ultimatum';
        return { ok: true, msg: '요구를 전달했습니다', pending: true };
      }
      const r = accept(action);
      if (r.accept) {
        for (const p of provs) transferProvince(w, p, from);
        chronicle(w, 'diplomacy', `${T.shortName}, ${label} 수락`, `${T.name}이(가) ${F.name}의 ${label}을 받아들여 ${provs.length}개 지역을 할양했다.`, [from, to], true);
        T.stability -= 10;
        return { ok: true, msg: `${T.shortName}이(가) 요구를 수락했습니다` };
      }
      addRel(w, from, to, -30);
      if (action === 'ultimatum') {
        chronicle(w, 'diplomacy', `${T.shortName}, 최후통첩 거부`, `${T.name}이(가) ${F.name}의 최후통첩을 거부했다.`, [from, to]);
        declareWar(w, from, to, provs, '최후통첩 거부에 따른 개전.');
        return { ok: true, msg: `${T.shortName}이(가) 거부하여 전쟁이 시작되었습니다` };
      }
      return { ok: false, msg: `${T.shortName}: 요구를 거부했습니다` };
    }
    case 'declareWar': {
      if (w.rules.noWar) return { ok: false, msg: '평화 세계 규칙으로 전쟁이 금지되어 있습니다' };
      if (hasTreaty(w, 'truce', from, to)) { F.stability -= 10; }
      if (hasTreaty(w, 'nap', from, to)) { F.stability -= 8; F.legitimacy -= 10; }
      const war = declareWar(w, from, to, borderProvincesOf(w, to, from, 6));
      return war ? { ok: true, msg: `${war.name} 발발` } : { ok: false, msg: '선전포고 실패' };
    }
  }
}

/** 플레이어 제안 응답 */
export function respondOffer(w: WorldState, id: number, accept: boolean) {
  const o = w.offers.find(x => x.id === id); if (!o) return;
  w.offers = w.offers.filter(x => x.id !== id);
  const F = w.countries[o.from], T = w.countries[o.to];
  if (!F?.alive || !T?.alive) return;
  if (o.kind === 'peace') {
    const war = w.wars.find(x => x.id === o.warId && x.active);
    if (!war) return;
    if (accept) {
      const side = sideOf(war, o.from);
      applyPeace(w, war, o.terms && side ? (o.terms.takeProvinces.length || o.terms.reparations || o.terms.annex || o.terms.vassalize ? side : null) : null, o.terms ?? null);
    } else addRel(w, o.from, o.to, -5);
    return;
  }
  if (o.kind === 'ultimatum') {
    if (accept) {
      for (const p of o.provinces || []) if (w.provinces[p].owner === o.to) transferProvince(w, p, o.from);
      chronicle(w, 'diplomacy', `${T.shortName}, 요구 수락`, `${T.name}이(가) ${F.name}의 요구를 받아들여 영토를 할양했다.`, [o.from, o.to], true);
      T.stability -= 8;
    } else {
      addRel(w, o.from, o.to, -30);
      if ((o as any).hard) declareWar(w, o.from, o.to, o.provinces || [], '최후통첩 거부에 따른 개전.');
    }
    return;
  }
  if (o.kind === 'vassal') {
    if (accept) { T.overlord = o.from; chronicle(w, 'diplomacy', `${T.shortName}, 종속국화`, `${T.name}이(가) ${F.name}의 종속국이 되었다.`, [o.from, o.to], true); }
    else addRel(w, o.from, o.to, -35);
    return;
  }
  if (!accept) { addRel(w, o.from, o.to, -5); return; }
  const tt = o.kind as TreatyType;
  addTreaty(w, tt, o.kind === 'access' ? o.to : o.from, o.kind === 'access' ? o.from : o.to, o.kind === 'nap' ? w.day + 3650 : -1);
  addRel(w, o.from, o.to, 10);
  logEvent(w, `${F.shortName}-${T.shortName} 조약 체결`, 'diplomacy', o.from);
}

/** 평화 협상 (플레이어 → AI). AI 가 수락하면 즉시 적용 */
export function proposePeace(w: WorldState, from: number, warId: number, terms: PeaceTerms | null): DiploResult {
  const war = w.wars.find(x => x.id === warId && x.active); if (!war) return { ok: false, msg: '전쟁이 없습니다' };
  const side = sideOf(war, from); if (!side) return { ok: false, msg: '참전국이 아닙니다' };
  const myLeader = side === 'A' ? war.leaderA : war.leaderD;
  if (myLeader !== from) return { ok: false, msg: '전쟁 주도국만 협상할 수 있습니다' };
  const other = side === 'A' ? war.leaderD : war.leaderA;
  const O = w.countries[other];
  const score = side === 'A' ? warScore(w, war) : -warScore(w, war);
  const demand = terms ? peaceCost(w, terms) : 0;
  const white = !terms || (!terms.takeProvinces.length && !terms.reparations && !terms.annex && !terms.vassalize && !terms.regimeChange && !terms.release && !terms.dmz);
  let ok: boolean;
  if (white) ok = score > -10 || O.warExhaustion > 45 || (w.day - war.start > 365 * 3 && score > -30);
  else ok = demand <= Math.max(0, score) * 1.1 + O.warExhaustion * 0.25;
  if (!ok) return { ok: false, msg: `${O.shortName}이(가) 협상을 거부했습니다 (전쟁 점수 ${score.toFixed(0)}, 요구 ${demand.toFixed(0)})` };
  applyPeace(w, war, white ? null : side, white ? null : terms);
  return { ok: true, msg: '평화 협정이 체결되었습니다' };
}

export { clamp };

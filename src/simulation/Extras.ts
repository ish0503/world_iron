import type { WorldState } from '../types/World';
import { rand, chance, pick, clamp } from './rng';
import { chronicle, addRel, logEvent, atWar, alliesOf, enemiesOf, warsOf, cname } from './WorldHelpers';
import { techCostFor, avgTech } from './CountrySimulation';
import { controlledShare } from './WarSimulation';

// ───────── 첩보 ─────────
export type SpyKind = 'tech' | 'unrest' | 'sabotage';
export const SPY_ACTIONS: { id: SpyKind; name: string; desc: string }[] = [
  { id: 'tech', name: '🕵 기술 탈취', desc: '상대 기술을 훔쳐 연구를 앞당긴다' },
  { id: 'unrest', name: '🕵 반정부 선동', desc: '상대국 안정도를 떨어뜨린다' },
  { id: 'sabotage', name: '🕵 산업 시설 파괴', desc: '상대국 공장·시설 하나를 파괴한다' },
];
export function spyCost(w: WorldState, from: number) { return Math.max(0.5, w.countries[from].gdp * 0.003); }
export function spy(w: WorldState, from: number, to: number, kind: SpyKind): { ok: boolean; msg: string } {
  const F = w.countries[from], T = w.countries[to];
  const cost = spyCost(w, from);
  if (F.treasury < cost) return { ok: false, msg: '국고가 부족합니다' };
  F.treasury -= cost;
  const p = clamp(0.45 + 0.05 * (F.tech.communication - T.tech.communication), 0.1, 0.85);
  if (!chance(p)) {
    addRel(w, from, to, -30);
    chronicle(w, 'diplomacy', `${F.shortName} 첩보 공작 발각`, `${T.name}이(가) ${F.name}의 첩보원을 체포했다. 양국 관계가 급격히 악화되었다.`, [from, to]);
    return { ok: false, msg: `첩보원이 체포되었습니다! (성공 확률 ${(p * 100).toFixed(0)}%)` };
  }
  switch (kind) {
    case 'tech': {
      const best = (Object.keys(T.tech) as (keyof typeof T.tech)[]).sort((a, b) => (T.tech[b] - F.tech[b]) - (T.tech[a] - F.tech[a]))[0];
      if (T.tech[best] > F.tech[best]) { F.tech[best]++; return { ok: true, msg: `기술 탈취 성공: ${best} ${F.tech[best]}단계` }; }
      F.techProgress += techCostFor(w, F, F.researchFocus) * 0.4; return { ok: true, msg: '기술 자료 확보: 연구 가속' };
    }
    case 'unrest': T.stability = Math.max(0, T.stability - 8); for (const pr of w.provinces) if (pr.owner === to) pr.unrest = Math.min(100, pr.unrest + 10); return { ok: true, msg: `${T.shortName}에서 반정부 시위 확산 (안정도 -8)` };
    case 'sabotage': {
      const cand = w.provinces.filter(pr => pr.owner === to && Object.values(pr.buildings).some(v => v));
      const pr = cand.length ? pick(cand) : null;
      if (!pr) return { ok: true, msg: '파괴할 시설이 없습니다' };
      const keys = (Object.keys(pr.buildings) as (keyof typeof pr.buildings)[]).filter(k => pr.buildings[k]);
      const k = keys.includes('factory') ? 'factory' : pick(keys);
      pr.buildings[k]!--; logEvent(w, `${pr.name}에서 의문의 폭발 사고`, 'war', to);
      return { ok: true, msg: `${pr.name}의 시설 파괴 성공` };
    }
  }
}

// ───────── 핵무기 ─────────
/** 핵 폭발 피해 (사망자 수 반환) */
export function nukeEffect(w: WorldState, pid: number) {
  const p = w.provinces[pid];
  const dead = p.pop * 0.55;
  p.pop *= 0.45; p.devastation = 1; p.buildings = {}; p.construction = null; p.unrest = 100;
  p.disaster = { type: 'nuke', until: w.day + 730, food: 0.2 };
  for (const n of p.neighbors) { const q = w.provinces[n]; q.devastation = Math.min(1, q.devastation + 0.45); q.pop *= 0.88; }
  w.divisions = w.divisions.filter(d => d.province !== pid);
  w.battles = w.battles.filter(b => b.province !== pid);
  w.globalTemp -= 0.08;
  (w as any)._flash = { pid, t: Date.now() };
  return dead;
}
export function nuclearBloc(w: WorldState, c: number) {
  let n = w.countries[c]?.nukes || 0;
  for (const a of alliesOf(w, c)) n += w.countries[a]?.nukes || 0;
  return n;
}
export function launchNuke(w: WorldState, from: number, pid: number, retaliation = false): { ok: boolean; msg: string } {
  const F = w.countries[from]; const p = w.provinces[pid];
  if (!F || !(F.nukes && F.nukes > 0)) return { ok: false, msg: '핵무기가 없습니다' };
  if (!p?.active || p.owner < 0 || !atWar(w, from, p.controller >= 0 ? p.controller : p.owner)) return { ok: false, msg: '교전 중인 국가의 영토에만 사용할 수 있습니다' };
  const target = p.owner;
  F.nukes = Math.max(0, F.nukes - 1);
  const dead = nukeEffect(w, pid);
  for (const o of w.countries) if (o.alive && o.id !== from) addRel(w, from, o.id, -35);
  F.stability -= 10; F.legitimacy -= 5;
  const T = w.countries[target];
  T.stability -= 15; T.warExhaustion = Math.min(100, T.warExhaustion + 25);
  chronicle(w, 'war', retaliation ? `☢ ${F.shortName} 핵 보복` : `☢ ${F.shortName} 핵무기 사용`, `${F.name}이(가) ${T.name}의 ${p.name}에 핵무기를 사용했다. 약 ${Math.round(dead / 1000)}천 명이 희생되었다. 세계가 경악했다.`, [from, target], true, pid);
  // 보복
  if (!retaliation && T.nukes && T.nukes > 0 && target !== w.player && chance(0.75)) {
    const cap = w.provinces[F.capital];
    const tgt = cap && cap.controller === from ? cap.id : w.provinces.find(x => x.owner === from)?.id;
    if (tgt !== undefined) launchNuke(w, target, tgt, true);
  }
  return { ok: true, msg: `${p.name}에 핵 공격` };
}
/** AI: 패전 직전의 핵보유국이 최후 수단으로 사용 */
export function monthlyNuclearAI(w: WorldState) {
  for (const c of w.countries) {
    if (!c.alive || !c.nukes || c.id === w.player && w.mode === 'ruler') continue;
    if (!warsOf(w, c.id).length) continue;
    const share = controlledShare(w, c.id);
    if (share > 0.45 || !chance(0.04 * w.rules.aiAggression)) continue;
    const enemies = new Set(enemiesOf(w, c.id));
    const targets = w.provinces.filter(p => p.active && p.owner === c.id && enemies.has(p.controller));
    const tgt = targets.sort((a, b) => w.divisions.filter(d => d.province === b.id).length - w.divisions.filter(d => d.province === a.id).length)[0]
      ?? w.provinces.find(p => p.active && enemies.has(p.owner));
    if (tgt) {
      // 자국 점령지에는 쓰지 않고 적 본토를 노림
      const enemyLand = w.provinces.filter(p => p.active && enemies.has(p.owner) && p.neighbors.some(n => w.provinces[n].owner === c.id || w.provinces[n].controller === c.id));
      const t2 = enemyLand.length ? pick(enemyLand) : null;
      if (t2) launchNuke(w, c.id, t2.id);
    }
  }
}

// ───────── 업적 & 승리 ─────────
export const ACHIEVEMENTS: Record<string, { name: string; desc: string; icon: string }> = {
  first_victory: { name: '첫 승리', desc: '전쟁에서 승리했다', icon: '🏆' },
  expand2: { name: '영토 확장', desc: '시작 영토의 2배를 차지했다', icon: '🗺' },
  gdp1: { name: '경제 대국', desc: '세계 GDP 1위', icon: '💰' },
  mil1: { name: '세계 최강', desc: '세계 군사력 1위', icon: '⚔' },
  tech: { name: '기술 선도국', desc: '평균 기술 12단계 달성', icon: '🔬' },
  peace20: { name: '평화의 수호자', desc: '20년간 전쟁 없이 번영', icon: '🕊' },
  conqueror: { name: '정복자', desc: '3개국 이상을 멸망시켰다', icon: '👑' },
  stable: { name: '태평성대', desc: '안정도 90 이상', icon: '☮' },
  nuclear: { name: '핵 클럽', desc: '핵무기를 보유했다', icon: '☢' },
  hegemon: { name: '세계 패권', desc: '세계 인구의 40%를 지배 (승리)', icon: '🌐' },
};
export function monthlyAchievements(w: WorldState, notify: (id: string) => void) {
  if (w.mode !== 'ruler' || w.player < 0) return;
  const c = w.countries[w.player]; if (!c?.alive) return;
  w.achievements ??= []; w.stats ??= { startProv: c.provinceCount, lastWarDay: w.day };
  if (warsOf(w, c.id).length) w.stats.lastWarDay = w.day;
  const live = w.countries.filter(x => x.alive);
  const has = (id: string) => w.achievements!.includes(id);
  const give = (id: string) => { if (has(id)) return; w.achievements!.push(id); notify(id); chronicle(w, 'nation', `업적: ${ACHIEVEMENTS[id].name}`, `${c.name} — ${ACHIEVEMENTS[id].desc}`, [c.id], id === 'hegemon'); };
  if (w.wars.some(x => !x.active && (x as any).winner === c.id)) give('first_victory');
  if (c.provinceCount >= w.stats.startProv * 2 && c.provinceCount >= 4) give('expand2');
  if (live.every(x => x.gdp <= c.gdp)) give('gdp1');
  if (live.every(x => x.militaryPower <= c.militaryPower)) give('mil1');
  if (avgTech(c) >= 12) give('tech');
  if (w.day - w.stats.lastWarDay > 365 * 20 && w.day > 365 * 20) give('peace20');
  if (((w.stats as any).kills || 0) >= 3) give('conqueror');
  if (c.stability >= 90) give('stable');
  if ((c.nukes || 0) > 0) give('nuclear');
  const tot = live.reduce((a, x) => a + x.population, 0);
  const mine = c.population + live.filter(x => x.overlord === c.id).reduce((a, x) => a + x.population, 0);
  if (mine >= tot * 0.4) { if (!has('hegemon')) w.victory = true; give('hegemon'); }
}
export { rand, cname };

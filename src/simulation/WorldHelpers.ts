import type { WorldState, TreatyType, HistoryCategory } from '../types/World';
import type { Country } from '../types/Country';
import { clamp } from './rng';
import { fmtDate } from './Calendar';

let controlVersion = 0;
/** 통제권 변경 시 증가 → 보급 캐시 무효화 */
export function bumpControl() { controlVersion++; }
export function getControlVersion() { return controlVersion; }

export function ensureRelSize(w: WorldState) {
  const need = w.countries.length + 1;
  if (need <= w.relSize) return;
  const ns = need + 64; const nr = new Array(ns * ns).fill(0);
  for (let a = 0; a < w.relSize; a++) for (let b = 0; b < w.relSize; b++) nr[a * ns + b] = w.relations[a * w.relSize + b] || 0;
  w.relations = nr; w.relSize = ns;
}
export const getRel = (w: WorldState, a: number, b: number) => (a === b ? 100 : w.relations[a * w.relSize + b] || 0);
export function setRel(w: WorldState, a: number, b: number, v: number) {
  if (a === b) return; ensureRelSize(w);
  v = clamp(v, -100, 100);
  w.relations[a * w.relSize + b] = v; w.relations[b * w.relSize + a] = v;
}
export const addRel = (w: WorldState, a: number, b: number, d: number) => setRel(w, a, b, getRel(w, a, b) + d);

export function hasTreaty(w: WorldState, type: TreatyType, a: number, b: number, directed = false) {
  for (const t of w.treaties) if (t.type === type && ((t.a === a && t.b === b) || (!directed && t.a === b && t.b === a))) return true;
  return false;
}
export function addTreaty(w: WorldState, type: TreatyType, a: number, b: number, until = -1) {
  if (hasTreaty(w, type, a, b, type === 'guarantee' || type === 'sanction' || type === 'support')) return;
  w.treaties.push({ type, a, b, until });
}
export function removeTreaty(w: WorldState, type: TreatyType, a: number, b: number) {
  w.treaties = w.treaties.filter(t => !(t.type === type && ((t.a === a && t.b === b) || (t.a === b && t.b === a))));
}
export function treatiesOf(w: WorldState, c: number) { return w.treaties.filter(t => t.a === c || t.b === c); }
export function alliesOf(w: WorldState, c: number): number[] {
  const s = new Set<number>();
  for (const t of w.treaties) if (t.type === 'alliance') { if (t.a === c) s.add(t.b); else if (t.b === c) s.add(t.a); }
  for (const o of w.countries) if (o.alive && o.overlord === c) s.add(o.id);
  const me = w.countries[c]; if (me && me.overlord >= 0) s.add(me.overlord);
  s.delete(c);
  return [...s].filter(i => w.countries[i]?.alive);
}

export function warBetween(w: WorldState, a: number, b: number) {
  for (const war of w.wars) {
    if (!war.active) continue;
    if ((war.attackers.includes(a) && war.defenders.includes(b)) || (war.attackers.includes(b) && war.defenders.includes(a))) return war;
  }
  return null;
}
export const atWar = (w: WorldState, a: number, b: number) => a >= 0 && b >= 0 && a !== b && !!warBetween(w, a, b);
export function warsOf(w: WorldState, c: number) { return w.wars.filter(x => x.active && (x.attackers.includes(c) || x.defenders.includes(c))); }
export function enemiesOf(w: WorldState, c: number): number[] {
  const s = new Set<number>();
  for (const war of warsOf(w, c)) for (const e of war.attackers.includes(c) ? war.defenders : war.attackers) s.add(e);
  return [...s];
}
export function isAtWar(w: WorldState, c: number) { return w.wars.some(x => x.active && (x.attackers.includes(c) || x.defenders.includes(c))); }

/** 통행 가능 여부: 자국/동맹/통행권/교전국 */
export function canEnter(w: WorldState, c: number, prov: number) {
  const p = w.provinces[prov]; if (!p.active) return false;
  const ctl = p.controller, own = p.owner;
  if (ctl === c || own === c) return true;
  if (ctl < 0) return false;
  if (atWar(w, c, ctl)) return true;
  if (atWar(w, c, own) && own >= 0) return true;
  // 동맹 영토: 같은 편으로 참전 중이거나 동맹/통행권
  if (hasTreaty(w, 'alliance', c, ctl) || hasTreaty(w, 'access', ctl, c) || w.countries[ctl]?.overlord === c || w.countries[c]?.overlord === ctl) return true;
  for (const war of warsOf(w, c)) { const side = war.attackers.includes(c) ? war.attackers : war.defenders; if (side.includes(ctl)) return true; }
  return false;
}

export function cname(w: WorldState, id: number) { return id < 0 ? '미개척지' : w.countries[id]?.shortName ?? '?'; }

export function logEvent(w: WorldState, text: string, type = 'info', c?: number) {
  w.log.push({ d: w.day, text, type, c });
  if (w.log.length > 400) w.log.splice(0, w.log.length - 400);
  listeners.forEach(l => l(text, type, c));
}
const listeners = new Set<(text: string, type: string, c?: number) => void>();
export function onLog(fn: (text: string, type: string, c?: number) => void) { listeners.add(fn); return () => listeners.delete(fn); }

export function chronicle(w: WorldState, cat: HistoryCategory, title: string, text: string, countries: number[] = [], major = false, province?: number) {
  w.chronicle.push({ d: w.day, cat, title, text, major, countries, province });
  // 보관 한도: 사소한 기록부터 정리
  if (w.chronicle.length > 2500) {
    const idx = w.chronicle.findIndex(e => !e.major);
    w.chronicle.splice(idx >= 0 ? idx : 0, 1);
  }
  logEvent(w, `${title}`, major ? 'major' : cat, countries[0]);
}

export function dateStr(w: WorldState) { return fmtDate(w.startYear, w.day, false); }

export function livingCountries(w: WorldState): Country[] { return w.countries.filter(c => c.alive); }

export function ownedProvinces(w: WorldState, c: number) { return w.provinces.filter(p => p.active && p.owner === c); }

export function countryNeighbors(w: WorldState, c: number, includeSea = true): Set<number> {
  const s = new Set<number>();
  for (const p of w.provinces) {
    if (!p.active || p.owner !== c) continue;
    for (const n of p.neighbors) { const o = w.provinces[n].owner; if (o >= 0 && o !== c) s.add(o); }
    if (includeSea) for (const n of p.seaNeighbors) { const o = w.provinces[n].owner; if (o >= 0 && o !== c) s.add(o); }
  }
  return s;
}

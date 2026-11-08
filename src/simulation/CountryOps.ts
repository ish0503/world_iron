import type { WorldState } from '../types/World';
import type { GovType, Personality } from '../types/Country';
import type { Division } from '../types/Military';
import { GOVS, PERSONALITY_IDS, UNITS } from '../data/defs';
import { genLeader, genRoot, genTag, hslColor } from '../data/names';
import { newCountry } from './WorldGen';
import { rng, pick, clamp, rand } from './rng';
import { ensureRelSize, setRel, getRel, chronicle, cname, alliesOf, bumpControl } from './WorldHelpers';
import { airPower, navalPower } from './EconomySimulation';

export function countryStats(w: WorldState) {
  for (const c of w.countries) { c.provinceCount = 0; c.militaryPower = 0; }
  for (const p of w.provinces) if (p.active && p.owner >= 0) w.countries[p.owner].provinceCount++;
  for (const d of w.divisions) {
    const c = w.countries[d.owner]; if (!c) continue;
    const u = UNITS[d.type];
    c.militaryPower += (u.atk + u.def + u.brk * 0.5) * (d.strength / u.hp) * (1 + 0.07 * c.tech.military) / 10;
  }
  for (const c of w.countries) if (c.alive) c.militaryPower += navalPower(c) * 0.08 + airPower(c) * 0.05;
}

export function relocateCapital(w: WorldState, cid: number) {
  const c = w.countries[cid];
  let best = -1, bp = -1;
  for (const p of w.provinces) if (p.active && p.owner === cid && p.controller === cid && p.pop > bp) { bp = p.pop; best = p.id; }
  if (best < 0) for (const p of w.provinces) if (p.active && p.owner === cid && p.pop > bp) { bp = p.pop; best = p.id; }
  if (best >= 0) c.capital = best;
}

export function transferProvince(w: WorldState, pid: number, to: number) {
  const p = w.provinces[pid]; const from = p.owner;
  if (from === to) { p.controller = to; return; }
  p.owner = to; p.controller = to; p.construction = null;
  bumpControl();
  if (to >= 0 && !p.cores.includes(to) && p.culture === w.countries[to].culture) p.cores.push(to);
  // 이전 소유국 부대 퇴거
  for (const d of w.divisions) if (d.province === pid && d.owner !== to && to >= 0 && !alliesOf(w, to).includes(d.owner)) evacuate(w, d.id);
  if (from >= 0 && w.countries[from].capital === pid) relocateCapital(w, from);
  if (from >= 0) checkDeath(w, from, to);
}

function evacuate(w: WorldState, did: number) {
  const d = w.divisions.find(x => x.id === did); if (!d) return;
  // 가장 가까운 자국 프로빈스
  let best = -1, bd = Infinity; const p0 = w.provinces[d.province];
  for (const p of w.provinces) if (p.active && p.controller === d.owner) { const dd = Math.hypot(p.cx - p0.cx, p.cy - p0.cy); if (dd < bd) { bd = dd; best = p.id; } }
  if (best < 0) { w.divisions = w.divisions.filter(x => x.id !== did); return; }
  d.province = best; d.path = []; d.progress = 0; d.battle = -1;
}

export function checkDeath(w: WorldState, cid: number, killer = -1) {
  const c = w.countries[cid]; if (!c.alive) return;
  const has = w.provinces.some(p => p.active && p.owner === cid);
  if (has) return;
  c.alive = false; c.provinceCount = 0;
  if (killer >= 0 && killer === w.player && w.stats) (w.stats as any).kills = ((w.stats as any).kills || 0) + 1;
  w.divisions = w.divisions.filter(d => d.owner !== cid);
  w.treaties = w.treaties.filter(t => t.a !== cid && t.b !== cid);
  for (const o of w.countries) if (o.overlord === cid) o.overlord = -1;
  for (const war of w.wars) if (war.active) {
    war.attackers = war.attackers.filter(x => x !== cid); war.defenders = war.defenders.filter(x => x !== cid);
    if (!war.attackers.length || !war.defenders.length) { war.active = false; war.end = w.day; war.result = `${c.shortName} 멸망으로 종결`; }
    else { if (war.leaderA === cid) war.leaderA = war.attackers[0]; if (war.leaderD === cid) war.leaderD = war.defenders[0]; }
  }
  w.battles = w.battles.filter(b => b.attackerCountry !== cid && b.defenderCountry !== cid);
  c.history = c.history.slice(-24);
  chronicle(w, 'nation', `${c.name} 멸망`, killer >= 0 ? `${c.name}이(가) ${cname(w, killer)}에 의해 역사 속으로 사라졌다. 건국 후 ${Math.floor((w.day - c.founded) / 365)}년 만의 일이다.` : `${c.name}이(가) 소멸했다.`, [cid, killer].filter(x => x >= 0), true);
}

export function distinctColor(w: WorldState) {
  let best = 0, bs = -1;
  for (let t = 0; t < 24; t++) {
    const col = hslColor(rand() * 360, 0.45 + rand() * 0.35, 0.4 + rand() * 0.22);
    let md = Infinity;
    for (const c of w.countries) if (c.alive) {
      const dr = ((col >> 16) & 255) - ((c.color >> 16) & 255), dg = ((col >> 8) & 255) - ((c.color >> 8) & 255), db = (col & 255) - (c.color & 255);
      md = Math.min(md, dr * dr + dg * dg + db * db);
    }
    if (md > bs) { bs = md; best = col; }
  }
  return best;
}

export interface CreateOpts { gov?: GovType; personality?: Personality; name?: string; from?: number; rebel?: boolean; }

export function createCountry(w: WorldState, provs: number[], opts: CreateOpts = {}): number {
  // 다른 나라가 점령 중인 지역은 신생국에 넘기지 않음 (점령 상태 유지)
  const valid = provs.filter(p => w.provinces[p]?.active && (opts.from === undefined || w.provinces[p].controller === w.provinces[p].owner || w.provinces[p].controller < 0));
  if (!valid.length) return -1;
  let cap = valid[0];
  for (const p of valid) if (w.provinces[p].pop > w.provinces[cap].pop) cap = p;
  const id = w.countries.length;
  const used = new Set(w.countries.map(c => c.tag));
  const gov = opts.gov ?? pick(['republic', 'democracy', 'oneparty', 'junta', 'absolute', 'federation', 'theocracy', 'constitutional'] as GovType[]);
  const pers = opts.personality ?? pick(PERSONALITY_IDS);
  const root = opts.name ?? (w.provinces[cap].name.replace(/(시|성|그라드|부르크|하임|빌|항)$/, '') || genRoot(rng));
  const c = newCountry(w, id, root, gov, pers, cap, rng, distinctColor(w), used);
  c.tag = genTag(rng, used);
  c.founded = w.day; c.aiNext = w.day + 5; c.aiMilNext = w.day + 1; c.lastElection = w.day;
  c.isRebel = !!opts.rebel;
  const src = opts.from !== undefined && opts.from >= 0 ? w.countries[opts.from] : null;
  if (src) { c.tech = { ...src.tech }; c.treasury = Math.max(1, src.treasury * 0.15); c.stability = 45; }
  c.culture = w.provinces[cap].culture; c.religion = w.provinces[cap].religion;
  w.countries.push(c);
  ensureRelSize(w);
  for (const o of w.countries) if (o.alive && o.id !== id) setRel(w, id, o.id, src && o.id === src.id ? -60 : (src ? getRel(w, src.id, o.id) * 0.3 : 0) + (rand() * 20 - 10));
  for (const p of valid) {
    const pr = w.provinces[p]; const old = pr.owner;
    pr.owner = id; pr.controller = id; pr.construction = null;
    if (!pr.cores.includes(id)) pr.cores.push(id);
    pr.unrest = 20;
    for (const d of w.divisions) if (d.province === p && d.owner !== id) {
      // 반란: 해당 지역 주둔군 일부가 반란군에 합류
      if (opts.rebel && src && d.owner === src.id && rand() < 0.6) { d.owner = id; d.path = []; d.battle = -1; d.aiControlled = true; continue; }
      evacuate(w, d.id);
    }
    if (old >= 0 && w.countries[old].capital === p) relocateCapital(w, old);
  }
  for (const p of valid) { const pr = w.provinces[p]; void pr; }
  if (src) checkDeath(w, src.id);
  // 초기 부대
  const nd = Math.max(1, Math.round(valid.length * (opts.rebel ? 0.6 : 0.9)));
  for (let i = 0; i < nd; i++) spawnDivision(w, id, 'infantry', valid[i % valid.length]);
  c.manpower = c.population * 0.01;
  return id;
}

export function spawnDivision(w: WorldState, owner: number, type: keyof typeof UNITS, province: number, strengthFrac = 1) {
  const u = UNITS[type];
  const c = w.countries[owner];
  const count = w.divisions.filter(d => d.owner === owner && d.type === type).length + 1;
  const d: Division = {
    id: w.nextId.div++, owner, type, name: `제${count}${u.short}사단`, province, path: [], progress: 0,
    strength: u.hp * strengthFrac, maxStrength: u.hp, org: 0.6, morale: 0.8, equipment: 1, supply: 1, battle: -1,
    aiControlled: owner !== w.player, outOfSupplyDays: 0, entrench: 0, stance: 'hold',
  };
  w.divisions.push(d);
  void c;
  return d;
}

export function changeGovernment(w: WorldState, cid: number, gov: GovType, pers?: Personality, reason = '') {
  const c = w.countries[cid];
  const old = c.gov;
  c.gov = gov;
  if (pers) c.personality = pers;
  const g = GOVS[gov];
  c.name = `${c.shortName} ${pick(g.suffix)}`;
  c.leader = genLeader(rng); c.leaderSince = w.day;
  c.legitimacy = 40 + rand() * 25;
  c.taxRate = clamp((c.taxRate + g.tax) / 2, 0.05, 0.6);
  c.goals = [];
  if (old !== gov) chronicle(w, 'politics', `${c.shortName} 정권 교체`, `${reason}${GOVS[old].name}이 무너지고 ${g.name} 체제가 들어섰다. 새 국호는 ${c.name}, 지도자는 ${c.leader}.`, [cid], true);
}

export function annexCountry(w: WorldState, target: number, by: number) {
  for (const p of w.provinces) if (p.active && p.owner === target) transferProvince(w, p.id, by);
  checkDeath(w, target, by);
}

export function mergeCountries(w: WorldState, a: number, b: number) {
  const A = w.countries[a], B = w.countries[b];
  for (const p of w.provinces) if (p.active && p.owner === b) { p.owner = a; p.controller = a; if (!p.cores.includes(a)) p.cores.push(a); }
  for (const d of w.divisions) if (d.owner === b) d.owner = a;
  A.treasury += B.treasury; A.debt += B.debt; A.manpower += B.manpower;
  for (const k of Object.keys(A.ships) as (keyof typeof A.ships)[]) A.ships[k] += B.ships[k];
  for (const k of Object.keys(A.planes) as (keyof typeof A.planes)[]) A.planes[k] += B.planes[k];
  for (const k of Object.keys(A.tech) as (keyof typeof A.tech)[]) A.tech[k] = Math.max(A.tech[k], B.tech[k]);
  checkDeath(w, b, a);
}

/** 국가 분열: 수도에서 먼 절반(또는 불만 높은 지역)이 독립 */
export function splitCountry(w: WorldState, cid: number, rebel = false, provs?: number[]): number {
  const c = w.countries[cid];
  const own = w.provinces.filter(p => p.active && p.owner === cid);
  if (own.length < 2) return -1;
  let list = provs;
  if (!list) {
    const cap = w.provinces[c.capital];
    // 수도에서 가장 먼 프로빈스를 시드로 BFS 절반
    let far = own[0]; let fd = -1;
    for (const p of own) { const d = Math.hypot(p.cx - cap.cx, p.cy - cap.cy) + p.unrest * 0.3; if (d > fd) { fd = d; far = p; } }
    const target = Math.max(1, Math.floor(own.length * (rebel ? 0.35 + rand() * 0.2 : 0.5)));
    const set = new Set<number>([far.id]); const q = [far.id];
    while (q.length && set.size < target) {
      const p = q.shift()!;
      for (const n of w.provinces[p].neighbors) if (!set.has(n) && w.provinces[n].owner === cid && n !== c.capital && set.size < target) { set.add(n); q.push(n); }
    }
    list = [...set];
  }
  return createCountry(w, list, { from: cid, rebel, personality: rebel ? 'revolutionary' : undefined });
}

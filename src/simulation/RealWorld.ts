import type { WorldState, Culture, Religion } from '../types/World';
import type { GovType, Personality } from '../types/Country';
import { T, TERRAINS, isWater } from '../data/terrain';
import { genPlace } from '../data/names';
import { mulberry } from './rng';
import { rebuildGeometry } from './Geometry';
import { emptyProvince, newCountry, techBaseForYear } from './WorldGen';
import { TECH_IDS } from '../data/defs';
import data from '../data/realworld.json';
import { CAPITALS } from '../data/capitals';
import { SCENARIOS, type Scenario } from '../data/scenarios';
import { provinceCapacity } from './PopulationSimulation';
import { monthlyEconomy } from './EconomySimulation';

/**
 * 실제 세계 시나리오: Natural Earth 국경을 래스터화한 격자(realworld.json)에서
 * 실제 국가·인구·경제 규모·정부·동맹을 반영한 세계를 만든다.
 */
interface RealCountry { en: string; ko: string; pop: number; gdp: number; gov: string; pers: string; tier: number; mil: number; lat: number; lon: number; cells: number; }
const D = data as unknown as {
  width: number; height: number; lat0: number; lat1: number; lon0: number; lon1: number;
  owner: number[]; terrain: number[]; elev: number[]; river: number[];
  countries: RealCountry[]; alliances: number[][]; relations: [number, number, number][];
};

const GOV: Record<string, GovType> = { D: 'democracy', R: 'republic', C: 'constitutional', A: 'absolute', J: 'junta', O: 'oneparty', F: 'federation', T: 'theocracy' };
const PERS: Record<string, Personality> = { p: 'pacifist', e: 'expansionist', m: 'militarist', c: 'mercantile', i: 'isolationist', h: 'hegemonic', r: 'revolutionary', d: 'defensive' };
const COLORS: Record<string, number> = {
  'United States of America': 0x3d6fb6, China: 0xc8392b, Russia: 0x4f7a3c, 'United Kingdom': 0xb03a48, France: 0x3a5fcd, Germany: 0x5c5c5c,
  Japan: 0xe8e0d0, India: 0xe39a2d, Brazil: 0x3aa35a, Canada: 0xd04848, Australia: 0x2f8f8f, 'South Korea': 0x6fa8dc, 'North Korea': 0x8b2e2e,
  Italy: 0x4caf50, Spain: 0xe5c33a, Turkey: 0xa8423a, Iran: 0x2f7d4f, 'Saudi Arabia': 0x5e8f3a, Mexico: 0x8d6e3f, Indonesia: 0xb85c5c,
  Poland: 0xd06070, Ukraine: 0xe0c040, Egypt: 0xc8a96a, Israel: 0x4a7fd0, Pakistan: 0x2e6b3a, Taiwan: 0x2b4fa8, Argentina: 0x8ec5e8,
};
const RELIGION_OF: [string, string[]][] = [
  ['이슬람교', ['Indonesia', 'Pakistan', 'Bangladesh', 'Nigeria', 'Egypt', 'Iran', 'Turkey', 'Algeria', 'Sudan', 'Iraq', 'Afghanistan', 'Morocco', 'Saudi Arabia', 'Uzbekistan', 'Yemen', 'Malaysia', 'Niger', 'Mali', 'Syria', 'Senegal', 'Burkina Faso', 'Chad', 'Somalia', 'Guinea', 'Tunisia', 'Azerbaijan', 'United Arab Emirates', 'Tajikistan', 'Jordan', 'Libya', 'Kyrgyzstan', 'Turkmenistan', 'Palestine', 'Lebanon', 'Oman', 'Kuwait', 'Mauritania', 'Qatar', 'Gambia', 'Bahrain', 'Kosovo', 'Albania', 'Djibouti', 'Comoros', 'Brunei', 'Kazakhstan', 'W. Sahara', 'Somaliland', 'N. Cyprus', 'Sierra Leone', 'Bosnia and Herz.', 'Maldives']],
  ['힌두교', ['India', 'Nepal', 'Mauritius']],
  ['불교', ['Thailand', 'Myanmar', 'Sri Lanka', 'Cambodia', 'Laos', 'Bhutan', 'Mongolia']],
  ['동아시아 민간신앙', ['China', 'Japan', 'Vietnam', 'North Korea', 'Taiwan', 'South Korea']],
  ['정교회', ['Russia', 'Ukraine', 'Belarus', 'Greece', 'Serbia', 'Romania', 'Bulgaria', 'Georgia', 'Armenia', 'Moldova', 'Ethiopia', 'Montenegro', 'Macedonia', 'Eritrea', 'Cyprus']],
  ['유대교', ['Israel']],
];
const NUKES: Record<string, number> = { 'United States of America': 5000, Russia: 5500, China: 500, France: 290, 'United Kingdom': 225, India: 170, Pakistan: 170, Israel: 90, 'North Korea': 50 };

function unrle(rle: number[], n: number, T: new (n: number) => Int16Array | Uint8Array) {
  const out = new T(n); let k = 0;
  for (let i = 0; i < rle.length; i += 2) { out.fill(rle[i] as never, k, k + rle[i + 1]); k += rle[i + 1]; }
  return out;
}

export interface RealOptions { seed: number; density: number; name?: string; scenario?: string; }

interface EntMeta { key: string; ko: string; en?: string; pop: number; gdp: number; gov: string; pers: string; tier: number; mil: number; lat: number; lon: number; capName?: string; color?: number; nukes: number; }

/** 시나리오 → 셀별 국가(엔티티) 배정 */
function resolveEntities(owner: Int16Array, scen: Scenario | null) {
  const W = D.width, H = D.height, N = W * H;
  const dLon = (D.lon1 - D.lon0) / W, dLat = (D.lat0 - D.lat1) / H;
  if (!scen) {
    const ents: EntMeta[] = D.countries.map(m => ({ key: m.en, ko: m.ko, en: m.en, pop: m.pop, gdp: m.gdp, gov: m.gov, pers: m.pers, tier: m.tier, mil: m.mil, lat: m.lat, lon: m.lon, capName: CAPITALS[m.en], color: COLORS[m.en], nukes: NUKES[m.en] || 0 }));
    return { cellEnt: Int16Array.from(owner), ents };
  }
  const ents: EntMeta[] = []; const keyIdx = new Map<string, number>();
  for (const e of scen.entities) { keyIdx.set(e.key, ents.length); ents.push({ key: e.key, ko: e.ko, pop: e.pop ?? 1, gdp: e.gdp ?? 1, gov: e.gov, pers: e.pers, tier: e.tier, mil: e.mil, lat: e.cap[0], lon: e.cap[1], capName: e.capName, color: e.color, nukes: e.nukes || 0 }); }
  const member = new Map<string, number>();
  for (const e of scen.entities) for (const m of e.members || []) if (!member.has(m)) member.set(m, keyIdx.get(e.key)!);
  const tierMul = [0, 0.5, 1, 2, 3];
  const def = (mi: number) => {
    const m = D.countries[mi];
    if (keyIdx.has(m.en)) return keyIdx.get(m.en)!;
    const pop = m.pop * scen.popFactor; const tier = Math.min(m.tier, scen.year < 1950 ? 2 : 3);
    keyIdx.set(m.en, ents.length);
    ents.push({ key: m.en, ko: scen.rename?.[m.en] ?? m.ko, en: m.en, pop, gdp: pop * scen.gdpPerCap * tierMul[tier], gov: m.gov, pers: m.pers, tier, mil: Math.max(0, Math.min(m.mil, 2)), lat: m.lat, lon: m.lon, capName: CAPITALS[m.en], nukes: 0 });
    return ents.length - 1;
  };
  const cellEnt = new Int16Array(N).fill(-1);
  for (let i = 0; i < N; i++) {
    const mi = owner[i]; if (mi < 0) continue;
    const en = D.countries[mi].en;
    const la = D.lat0 - (((i / W) | 0) + 0.5) * dLat, lo = D.lon0 + ((i % W) + 0.5) * dLon;
    let e = -1;
    for (const se of scen.entities) { if (se.regions?.some(r => r.of === en && r.test(la, lo))) { e = keyIdx.get(se.key)!; break; } }
    if (e < 0) e = member.get(en) ?? def(mi);
    cellEnt[i] = e;
  }
  return { cellEnt, ents };
}

export function generateRealWorld(opt: RealOptions, progress?: (p: number, msg: string) => void): WorldState {
  const r = mulberry(opt.seed);
  const scen = opt.scenario ? SCENARIOS.find(s => s.id === opt.scenario) ?? null : null;
  const W = D.width, H = D.height, N = W * H;
  const dLon = (D.lon1 - D.lon0) / W, dLat = (D.lat0 - D.lat1) / H;
  progress?.(0.1, scen ? `${scen.name} 지도 구성 중...` : '실제 세계 지도 불러오는 중...');
  const modern = unrle(D.owner, N, Int16Array) as Int16Array;
  const terrain = unrle(D.terrain, N, Uint8Array) as Uint8Array;
  const hgt = unrle(D.elev, N, Uint8Array) as Uint8Array; for (let i = 0; i < N; i++) hgt[i] = hgt[i] << 3;
  const river = unrle(D.river, N, Uint8Array) as Uint8Array;
  const { cellEnt: owner, ents } = resolveEntities(modern, scen);
  const cellProv = new Int32Array(N).fill(-1);
  progress?.(0.25, '프로빈스 분할 중...');
  const per = Math.max(20, Math.round(60 / opt.density));
  const seen = new Uint8Array(N);
  let P = 0;
  const provOwner: number[] = [];
  const nb = (i: number) => { const x = i % W; return [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i >= W ? i - W : -1, i < N - W ? i + W : -1]; };
  const orphans: number[] = [];
  const entCells = new Int32Array(ents.length); for (let i = 0; i < N; i++) if (owner[i] >= 0) entCells[owner[i]]++;
  // 현대 국가 경계도 프로빈스 경계가 되도록 (식민지 지역 구분)
  const sameRegion = (a: number, b: number) => owner[a] === owner[b] && modern[a] === modern[b];
  for (let s = 0; s < N; s++) {
    if (owner[s] < 0 || seen[s]) continue;
    const o = owner[s];
    const comp: number[] = []; const q = [s]; seen[s] = 1;
    while (q.length) { const c = q.pop()!; comp.push(c); for (const j of nb(c)) if (j >= 0 && !seen[j] && sameRegion(j, s)) { seen[j] = 1; q.push(j); } }
    if (comp.length < 3 && entCells[o] > 12) { orphans.push(...comp); continue; }
    const k = Math.max(1, Math.round(comp.length / per));
    const seeds: number[] = [];
    for (let t = 0; t < k * 8 && seeds.length < k; t++) {
      const c = comp[Math.floor(r() * comp.length)];
      const cx = c % W, cy = (c / W) | 0;
      if (seeds.every(sd => Math.hypot((sd % W) - cx, ((sd / W) | 0) - cy) > Math.sqrt(per) * 0.8)) seeds.push(c);
    }
    if (!seeds.length) seeds.push(comp[0]);
    for (const sd of seeds) { cellProv[sd] = P; provOwner.push(o); P++; }
    const qq = [...seeds]; let qi = 0;
    while (qi < qq.length) {
      const c = qq[qi++];
      for (const j of nb(c)) if (j >= 0 && sameRegion(j, s) && cellProv[j] < 0) { cellProv[j] = cellProv[c]; qq.push(j); }
      if (qi % 7 === 0 && qq.length - qi > 4) { const a = qi + Math.floor(r() * (qq.length - qi)); [qq[qi], qq[a]] = [qq[a], qq[qi]]; }
    }
  }
  for (const c of orphans) {
    const cx = c % W, cy = (c / W) | 0; let best = -1, bd = Infinity;
    for (let rad = 1; rad < 40 && best < 0; rad++) for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
      const x = cx + dx, y = cy + dy; if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const j = y * W + x; if (cellProv[j] >= 0 && owner[j] === owner[c]) { const d = dx * dx + dy * dy; if (d < bd) { bd = d; best = cellProv[j]; } }
    }
    if (best >= 0) cellProv[c] = best; else terrain[c] = T.SEA;
  }
  for (let i = 0; i < N; i++) if (cellProv[i] < 0 && !isWater(terrain[i])) terrain[i] = T.SEA;

  const year = scen?.year ?? 2025;
  const w: WorldState = {
    version: 2, name: opt.name || scen?.name || '실제 세계 2025', seed: opt.seed, rng: opt.seed ^ 0x9e3779b9,
    width: W, height: H, terrain, height_: hgt, river, cellProv,
    provinces: [], countries: [], divisions: [], battles: [], wars: [], treaties: [],
    relations: [], relSize: 0, cultures: [], religions: [], startYear: year, day: 0, chronicle: [], log: [],
    rules: { noWar: false, infiniteResources: false, popGrowth: 1, aiAggression: 0.8, disasterRate: 1, techSpeed: 1, fogOfWar: false },
    prices: { food: 0.004, steel: 0.01, coal: 0.007, oil: 0.016, rare: 0.04 },
    globalTemp: year > 2000 ? 0.25 : 0, nextId: { div: 1, war: 1, battle: 1, offer: 1 }, player: -1, mode: 'observer',
    offers: [], firsts: {}, worldWarCount: year > 1945 ? 2 : year > 1918 ? 1 : 0, scenario: scen ? scen.id : 'real',
  };
  for (let p = 0; p < P; p++) w.provinces.push(emptyProvince(p, genPlace(r)));
  progress?.(0.45, '지리 정보 계산 중...');
  rebuildGeometry(w);

  // 종교 & 문화 (현대 국가 단위 → 식민지 독립운동의 씨앗)
  const relNames = ['기독교', ...RELIGION_OF.map(x => x[0])];
  const relColors = [0x4a78c8, 0x2f9e5a, 0xe8902a, 0xe6c84a, 0xc84a4a, 0x8a5ac8, 0x5ab8c8];
  relNames.forEach((n, i) => w.religions.push({ id: i, name: n, color: relColors[i], founded: -1 } as Religion));
  const religionOf = (en: string) => { const k = RELIGION_OF.findIndex(([, l]) => l.includes(en)); return k < 0 ? 0 : k + 1; };
  const provModern = new Int32Array(P).fill(-1);
  for (let i = 0; i < N; i++) if (cellProv[i] >= 0 && provModern[cellProv[i]] < 0) provModern[cellProv[i]] = modern[i];
  const cultureOfModern = new Map<number, number>();
  for (let p = 0; p < P; p++) {
    const mi = provModern[p]; if (mi < 0) continue;
    if (!cultureOfModern.has(mi)) { const id = w.cultures.length; cultureOfModern.set(mi, id); w.cultures.push({ id, name: D.countries[mi].ko.replace(/ ?(공화국|민주공화국|제도)$/, '') + '인', color: 0 } as Culture); }
    w.provinces[p].culture = cultureOfModern.get(mi)!; w.provinces[p].religion = religionOf(D.countries[mi].en);
  }

  progress?.(0.6, '국가 수립 중...');
  const used = new Set<string>();
  const base = techBaseForYear(year);
  const countryProvs: number[][] = ents.map(() => []);
  for (let p = 0; p < P; p++) if (w.provinces[p].active) countryProvs[provOwner[p]].push(p);
  const idMap = new Map<number, number>();
  const cellOf = (lat: number, lon: number) => ({ x: Math.floor((lon - D.lon0) / dLon), y: Math.floor((D.lat0 - lat) / dLat) });
  ents.forEach((m, ci) => {
    const provs = countryProvs[ci];
    if (!provs.length) return;
    const id = w.countries.length; idMap.set(ci, id);
    const cc = cellOf(m.lat, m.lon);
    let cap = provs[0], bd = Infinity;
    for (const p of provs) { const pr = w.provinces[p]; const d = (pr.cx - cc.x) ** 2 + (pr.cy - cc.y) ** 2; if (d < bd) { bd = d; cap = p; } }
    for (const p of provs) { const pr = w.provinces[p]; pr.owner = id; pr.controller = id; pr.cores = [id]; }
    const c = newCountry(w, id, m.ko, GOV[m.gov] || 'republic', PERS[m.pers] || 'defensive', cap, r, m.color ?? 0, used);
    w.countries.push(c);
    c.name = m.ko; c.shortName = m.ko.replace(/ (공화국|민주공화국)$/, ''); c.realName = m.en ?? m.key;
    if (!m.color) c.color = 0;
    c.culture = w.provinces[cap].culture; c.religion = w.provinces[cap].religion;
    // 본토 이외(다른 문화권) 지역은 핵심 영토가 아님 → 식민지
    for (const p of provs) if (w.provinces[p].culture !== c.culture && scen) w.provinces[p].cores = [];
    const tb = base + (m.tier - 2) * 1.6;
    for (const f of TECH_IDS) c.tech[f] = Math.max(0, Math.round(tb + (r() - 0.5) * 1.6));
    if (m.mil >= 4) c.tech.military += 1;
    c.nukes = m.nukes;
    w.provinces[cap].name = m.capName ?? `${c.shortName} 수도`;
    // 인구: 본토에 가중
    const wts = provs.map(p => { const pr = w.provinces[p]; return pr.cellCount * TERRAINS[pr.terrain].cap * (0.5 + r()) * (pr.coastal ? 1.4 : 1) * (pr.river ? 1.5 : 1) * (p === cap ? 5 : 1) * (pr.culture === c.culture ? 3 : 1); });
    const sw = wts.reduce((a, b) => a + b, 0);
    provs.forEach((p, k) => { w.provinces[p].pop = Math.max(5000, m.pop * 1e6 * wts[k] / sw); });
    let fac = Math.round(m.gdp / 25);
    const byPop = [...provs].sort((a, b) => (w.provinces[b].culture === c.culture ? 2 : 1) * w.provinces[b].pop - (w.provinces[a].culture === c.culture ? 2 : 1) * w.provinces[a].pop);
    for (let round = 0; fac > 0 && round < 12; round++) for (const p of byPop) { if (fac <= 0) break; const b = w.provinces[p].buildings; if ((b.factory || 0) < 10) { b.factory = (b.factory || 0) + 1; fac--; } }
    for (const p of provs) {
      const b = w.provinces[p].buildings; const home = w.provinces[p].culture === c.culture;
      if (m.tier >= 3 && home) { b.rail = Math.min(5, m.tier - 1); b.market = Math.min(5, m.tier - 1); }
      if (m.tier >= 2 && r() < 0.5) b.farm = m.tier - 1;
      if (w.provinces[p].coastal && (r() < 0.3 + m.tier * 0.1 || p === cap)) b.port = 1;
      if (m.tier >= 3 && w.provinces[p].pop > 2e6 && home) b.lab = m.tier - 2;
    }
    c.taxRate = 0.18 + m.tier * 0.02;
  });
  // 지역 이름: 현대 수도 → 수도명, 그 외 '<현대 국가> 방위'
  const capCell = new Map<number, number>();
  for (const [mi, m] of D.countries.entries()) { const cc = cellOf(m.lat, m.lon); if (cc.x >= 0 && cc.y >= 0 && cc.x < W && cc.y < H) { const p = cellProv[cc.y * W + cc.x]; if (p >= 0 && provModern[p] === mi) capCell.set(p, mi); } }
  const byModern = new Map<number, number[]>();
  for (let p = 0; p < P; p++) { const mi = provModern[p]; if (mi < 0 || !w.provinces[p].active) continue; let a = byModern.get(mi); if (!a) byModern.set(mi, a = []); a.push(p); }
  const isCap = new Set(w.countries.map(c => c.capital));
  for (const [mi, provs] of byModern) {
    const m = D.countries[mi]; const label = (scen?.rename?.[m.en] ?? m.ko).replace(/ (공화국|민주공화국)$/, '');
    const cxs = provs.reduce((a, p) => a + w.provinces[p].cx, 0) / provs.length, cys = provs.reduce((a, p) => a + w.provinces[p].cy, 0) / provs.length;
    const used2 = new Map<string, number>();
    for (const p of provs) {
      if (isCap.has(p)) continue;
      const pr = w.provinces[p];
      if (capCell.get(p) === mi && CAPITALS[m.en]) { pr.name = CAPITALS[m.en]; continue; }
      if (provs.length === 1) { pr.name = label; continue; }
      const dx = pr.cx - cxs, dy = pr.cy - cys; const span = Math.sqrt(provs.length) * 3;
      let dir = '중부';
      if (Math.hypot(dx, dy) > span * 0.35) { const a = Math.atan2(-dy, dx) * 180 / Math.PI; dir = ['동부', '북동부', '북부', '북서부', '서부', '남서부', '남부', '남동부'][((Math.round(a / 45) % 8) + 8) % 8]; }
      const base2 = `${label} ${dir}`; const n = (used2.get(base2) || 0) + 1; used2.set(base2, n);
      pr.name = n === 1 ? base2 : `${base2} ${n}`;
    }
  }
  // 색상: 미지정 국가는 이웃과 구분되는 색
  for (const c of w.countries) if (!c.color) {
    const nbs = new Set<number>(); for (const p of w.provinces) if (p.owner === c.id) for (const n of p.neighbors) { const o = w.provinces[n].owner; if (o >= 0 && o !== c.id) nbs.add(o); }
    let best = 0x888888, bs = -1;
    for (let t = 0; t < 30; t++) {
      const h = r() * 360, s = 0.35 + r() * 0.35, l = 0.42 + r() * 0.22;
      const a = s * Math.min(l, 1 - l); const f = (n: number) => { const k = (n + h / 30) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
      const col = (Math.round(f(0) * 255) << 16) | (Math.round(f(8) * 255) << 8) | Math.round(f(4) * 255);
      let md = Infinity; for (const o of nbs) { const oc = w.countries[o].color; if (!oc) continue; md = Math.min(md, ((col >> 16) - (oc >> 16)) ** 2 + (((col >> 8) & 255) - ((oc >> 8) & 255)) ** 2 + ((col & 255) - (oc & 255)) ** 2); }
      if (md > bs) { bs = md; best = col; }
    }
    c.color = best;
  }
  for (const cu of w.cultures) { const c = w.countries.find(x => x.culture === cu.id); cu.color = c ? c.color : (0x404040 + cu.id * 0x3a5f7) & 0xffffff; }
  w.relSize = w.countries.length + 64;
  w.relations = new Array(w.relSize * w.relSize).fill(0);
  const keyToId: [string, number][] = [];
  for (const [ci, id] of idMap) keyToId.push([ents[ci].key, id]);
  (w as any)._real = { idMap: [...idMap.entries()], meta: ents, keys: keyToId, scen: scen?.id ?? null };
  progress?.(0.85, '외교 관계 수립 중...');
  return w;
}

/** setupWorld 이후 실제 동맹·관계·군사력 반영 */
export function applyRealDiplomacy(w: WorldState, spawn: (owner: number, type: string, pid: number) => void) {
  const info = (w as any)._real as { idMap: [number, number][]; meta: EntMeta[]; keys: [string, number][]; scen: string | null } | undefined;
  if (!info) return;
  delete (w as any)._real;
  const idMap = new Map(info.idMap);
  const S = w.relSize;
  // 1인당 생산성 & 인구 수용력
  let tg = 0, tp = 0; for (const m of info.meta) { tg += m.gdp; tp += m.pop; }
  const avg = tg / tp;
  for (const [ci, id] of idMap) { const m = info.meta[ci]; w.countries[id].productivity = Math.max(0.08, Math.min(8, Math.pow((m.gdp / Math.max(0.01, m.pop)) / avg, 0.85))); }
  for (let k = 0; k < 3; k++) monthlyEconomy(w);
  for (const c of w.countries) if (c.alive) { c.gdpPrev = c.gdp; c.treasury = c.gdp * 0.08; }
  for (const p of w.provinces) { if (!p.active) continue; p.capMul = 1; const base = provinceCapacity(w, p); p.capMul = Math.max(1, (p.pop * 1.3) / base); }
  const scen = info.scen ? SCENARIOS.find(x => x.id === info.scen)! : null;
  const K = new Map(info.keys);
  w.rules.aiAggression = scen ? 0.9 : 0.65;
  // 무작위 초기 조약 제거 → 실제 동맹
  w.treaties = [];
  const ally = (ids: number[]) => { for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) { w.treaties.push({ type: 'alliance', a: ids[i], b: ids[j], until: -1 }); w.relations[ids[i] * S + ids[j]] = w.relations[ids[j] * S + ids[i]] = 60; } };
  const setR = (A?: number, B?: number, v = 0) => { if (A === undefined || B === undefined) return; w.relations[A * S + B] = w.relations[B * S + A] = v; };
  if (!scen) {
    const enIdx = new Map(D.countries.map((m, i) => [i, m.en]));
    const toId = (mi: number) => K.get(enIdx.get(mi)!);
    for (const g of D.alliances) ally(g.map(toId).filter((x): x is number => x !== undefined));
    for (const [a, b, v] of D.relations) setR(toId(a), toId(b), v);
  } else {
    for (const g of scen.alliances) ally(g.map(k => K.get(k)).filter((x): x is number => x !== undefined));
    for (const [a, b, v] of scen.relations) setR(K.get(a), K.get(b), v);
    for (const [a, b] of scen.naps) { const A = K.get(a), B = K.get(b); if (A !== undefined && B !== undefined) w.treaties.push({ type: 'nap', a: A, b: B, until: 3650 }); }
    for (const [sub, over] of scen.vassals) { const A = K.get(sub), B = K.get(over); if (A !== undefined && B !== undefined) { w.countries[A].overlord = B; setR(A, B, 70); } }
  }
  // 군사력 재배치
  w.divisions = [];
  for (const [ci, id] of idMap) {
    const m = info.meta[ci]; const c = w.countries[id];
    if (!c.alive) continue;
    const n = Math.max(1, Math.round((Math.pow(m.mil, 1.7) * 2.2 + Math.pow(m.pop, 0.3) * 0.6) * (m.mil >= 3 ? 1.4 : 1)));
    // 요새: 수도와 강대국 국경
    w.provinces[c.capital].buildings.fort = Math.max(w.provinces[c.capital].buildings.fort || 0, m.mil >= 3 ? 3 : 2);
    const own = w.provinces.filter(p => p.active && p.owner === id);
    const border = own.filter(p => p.neighbors.some(q => w.provinces[q].owner >= 0 && w.provinces[q].owner !== id));
    if (m.tier >= 3) for (const p of border) if (p.culture === c.culture) p.buildings.fort = Math.max(p.buildings.fort || 0, m.mil >= 4 ? 2 : 1);
    for (let i = 0; i < n; i++) {
      const t = i % 6 === 2 && c.tech.military >= 4 ? 'armor' : i % 6 === 4 ? 'artillery' : i % 9 === 7 && c.tech.military >= 3 ? 'mechanized' : 'infantry';
      const pid = i % 3 === 0 || !border.length ? c.capital : border[i % border.length].id;
      spawn(id, t, pid);
    }
    const navy = m.mil * m.tier;
    c.ships.destroyer = Math.round(navy * 2.5); c.ships.cruiser = Math.round(navy * 0.8); c.ships.submarine = Math.round(navy * 0.8);
    c.ships.battleship = m.mil >= 4 ? Math.round(navy * 0.2) : 0; c.ships.carrier = m.key === 'United States of America' ? 11 : scen && scen.year < 1930 ? 0 : m.mil >= 4 && m.tier >= 3 ? 2 : 0; c.ships.transport = 2 + m.mil * 2;
    c.planes.fighter = Math.round(m.mil * m.mil * m.tier * 12); c.planes.bomber = Math.round(m.mil * m.mil * m.tier * 3); c.planes.attacker = Math.round(m.mil * m.tier * 8); c.planes.recon = m.mil * 5;
    c.manpower = c.population * c.conscription * 0.5;
  }
  if (!scen) return;
  // 시작 시점의 전쟁 · 점령
  const dLon = (D.lon1 - D.lon0) / D.width, dLat = (D.lat0 - D.lat1) / D.height;
  for (const o of scen.occupied || []) {
    const by = K.get(o.by), own = K.get(o.owner); if (by === undefined || own === undefined) continue;
    for (const p of w.provinces) if (p.active && p.owner === own && p.id !== w.countries[own].capital && o.test(D.lat0 - p.cy * dLat, D.lon0 + p.cx * dLon)) {
      p.controller = by;
      for (const d of w.divisions) if (d.province === p.id && d.owner === own) d.province = w.countries[own].capital;
    }
  }
  for (const war of scen.wars) {
    const att = war.att.map(k => K.get(k)).filter((x): x is number => x !== undefined && w.countries[x].alive);
    const def = war.def.map(k => K.get(k)).filter((x): x is number => x !== undefined && w.countries[x].alive);
    if (!att.length || !def.length) continue;
    w.wars.push({ id: w.nextId.war++, name: war.name, attackers: att, defenders: def, leaderA: att[0], leaderD: def[0], start: scen.startDay, goal: [], casualtiesA: 0, casualtiesD: 0, battles: 0, active: true });
    for (const a of att) for (const d of def) setR(a, d, -85);
    if (/세계대전/.test(war.name)) { (w.wars[w.wars.length - 1] as any).world = true; const m = war.name.match(/제(\d+)차/); if (m) w.worldWarCount = +m[1]; }
  }
  w.day = scen.startDay;
  for (const c of w.countries) { c.lastElection = w.day - Math.floor(Math.random() * 1400); c.leaderSince = w.day - 400; c.aiNext = w.day + (c.id % 10); c.aiMilNext = w.day + (c.id % 3); c.founded = 0; }
}

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

export interface RealOptions { seed: number; density: number; name?: string; }

export function generateRealWorld(opt: RealOptions, progress?: (p: number, msg: string) => void): WorldState {
  const r = mulberry(opt.seed);
  const W = D.width, H = D.height, N = W * H;
  progress?.(0.1, '실제 세계 지도 불러오는 중...');
  const owner = unrle(D.owner, N, Int16Array) as Int16Array;
  const terrain = unrle(D.terrain, N, Uint8Array) as Uint8Array;
  const hgt = unrle(D.elev, N, Uint8Array) as Uint8Array; for (let i = 0; i < N; i++) hgt[i] = hgt[i] << 3;
  const river = unrle(D.river, N, Uint8Array) as Uint8Array;
  const cellProv = new Int32Array(N).fill(-1);
  progress?.(0.25, '프로빈스 분할 중...');
  // 국가별 연결 성분 → 시드 → 국가 내부 범람
  const per = Math.max(20, Math.round(60 / opt.density));
  const seen = new Uint8Array(N);
  let P = 0;
  const provOwner: number[] = [];
  const heapQ: number[] = []; const costs = new Float64Array(N).fill(Infinity);
  const nb = (i: number) => { const x = i % W; return [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i >= W ? i - W : -1, i < N - W ? i + W : -1]; };
  const orphans: number[] = [];
  for (let s = 0; s < N; s++) {
    if (owner[s] < 0 || seen[s]) continue;
    const o = owner[s];
    const comp: number[] = []; const q = [s]; seen[s] = 1;
    while (q.length) { const c = q.pop()!; comp.push(c); for (const j of nb(c)) if (j >= 0 && !seen[j] && owner[j] === o) { seen[j] = 1; q.push(j); } }
    if (comp.length < 3 && D.countries[o].cells > 12) { orphans.push(...comp); continue; }
    const k = Math.max(1, Math.round(comp.length / per));
    const seeds: number[] = [];
    for (let t = 0; t < k * 8 && seeds.length < k; t++) {
      const c = comp[Math.floor(r() * comp.length)];
      const cx = c % W, cy = (c / W) | 0;
      if (seeds.every(sd => Math.hypot((sd % W) - cx, ((sd / W) | 0) - cy) > Math.sqrt(per) * 0.8)) seeds.push(c);
    }
    if (!seeds.length) seeds.push(comp[0]);
    for (const sd of seeds) { cellProv[sd] = P; provOwner.push(o); costs[sd] = 0; heapQ.push(sd); P++; }
    // 단순 BFS(지형 가중 무작위 순서)로 성분 내부 채우기
    const qq = [...seeds]; let qi = 0;
    while (qi < qq.length) {
      const c = qq[qi++];
      for (const j of nb(c)) if (j >= 0 && owner[j] === o && cellProv[j] < 0) { cellProv[j] = cellProv[c]; qq.push(j); }
      if (qi % 7 === 0 && qq.length - qi > 4) { const a = qi + Math.floor(r() * (qq.length - qi)); [qq[qi], qq[a]] = [qq[a], qq[qi]]; }
    }
  }
  // 작은 고립 섬 → 같은 국가의 가장 가까운 프로빈스
  for (const c of orphans) {
    const cx = c % W, cy = (c / W) | 0; let best = -1, bd = Infinity;
    for (let rad = 1; rad < 40 && best < 0; rad++) for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
      const x = cx + dx, y = cy + dy; if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const j = y * W + x; if (cellProv[j] >= 0 && owner[j] === owner[c]) { const d = dx * dx + dy * dy; if (d < bd) { bd = d; best = cellProv[j]; } }
    }
    if (best >= 0) cellProv[c] = best; else { terrain[c] = T.SEA; }
  }
  for (let i = 0; i < N; i++) if (cellProv[i] < 0 && !isWater(terrain[i])) terrain[i] = T.SEA;

  const w: WorldState = {
    version: 2, name: opt.name || '실제 세계 2025', seed: opt.seed, rng: opt.seed ^ 0x9e3779b9,
    width: W, height: H, terrain, height_: hgt, river, cellProv,
    provinces: [], countries: [], divisions: [], battles: [], wars: [], treaties: [],
    relations: [], relSize: 0, cultures: [], religions: [], startYear: 2025, day: 0, chronicle: [], log: [],
    rules: { noWar: false, infiniteResources: false, popGrowth: 1, aiAggression: 0.8, disasterRate: 1, techSpeed: 1, fogOfWar: false },
    prices: { food: 0.004, steel: 0.01, coal: 0.007, oil: 0.016, rare: 0.04 },
    globalTemp: 0.25, nextId: { div: 1, war: 1, battle: 1, offer: 1 }, player: -1, mode: 'observer',
    offers: [], firsts: {}, worldWarCount: 2, scenario: 'real',
  };
  for (let p = 0; p < P; p++) w.provinces.push(emptyProvince(p, genPlace(r)));
  progress?.(0.45, '지리 정보 계산 중...');
  rebuildGeometry(w);

  // 종교 & 문화
  const relNames = ['기독교', ...RELIGION_OF.map(x => x[0])];
  const relColors = [0x4a78c8, 0x2f9e5a, 0xe8902a, 0xe6c84a, 0xc84a4a, 0x8a5ac8, 0x5ab8c8];
  relNames.forEach((n, i) => w.religions.push({ id: i, name: n, color: relColors[i], founded: -1 } as Religion));
  const religionOf = (en: string) => { const k = RELIGION_OF.findIndex(([, l]) => l.includes(en)); return k < 0 ? 0 : k + 1; };

  progress?.(0.6, '국가 수립 중...');
  const used = new Set<string>();
  const base = techBaseForYear(2025);
  const countryProvs: number[][] = D.countries.map(() => []);
  for (let p = 0; p < P; p++) if (w.provinces[p].active) countryProvs[provOwner[p]].push(p);
  const idMap = new Map<number, number>();
  D.countries.forEach((m, ci) => {
    const provs = countryProvs[ci];
    if (!provs.length) return;
    const id = w.countries.length; idMap.set(ci, id);
    // 수도: 실제 수도 좌표 프로빈스
    const cx = Math.floor((m.lon - D.lon0) / ((D.lon1 - D.lon0) / W)), cy = Math.floor((D.lat0 - m.lat) / ((D.lat0 - D.lat1) / H));
    let cap = provs[0], bd = Infinity;
    for (const p of provs) { const pr = w.provinces[p]; const d = (pr.cx - cx) ** 2 + (pr.cy - cy) ** 2; if (d < bd) { bd = d; cap = p; } }
    const culture = w.cultures.length;
    w.cultures.push({ id: culture, name: m.ko.replace(/(공화국|민주공화국|제도)$/, '').trim() + '인', color: 0 } as Culture);
    for (const p of provs) { w.provinces[p].culture = culture; w.provinces[p].religion = religionOf(m.en); w.provinces[p].owner = id; w.provinces[p].controller = id; w.provinces[p].cores = [id]; }
    const c = newCountry(w, id, m.ko, GOV[m.gov] || 'republic', PERS[m.pers] || 'defensive', cap, r, COLORS[m.en] ?? 0, used);
    w.countries.push(c);
    c.name = m.ko; c.shortName = m.ko.replace(/ (공화국|민주공화국)$/, ''); c.realName = m.en;
    if (!COLORS[m.en]) c.color = 0;
    c.culture = culture; c.religion = religionOf(m.en);
    const tb = base + (m.tier - 2) * 1.6;
    for (const f of TECH_IDS) c.tech[f] = Math.max(0, Math.round(tb + (r() - 0.5) * 1.6));
    if (m.mil >= 4) c.tech.military += 1;
    c.nukes = NUKES[m.en] || 0;
    // 지역 이름: 수도 + 방위(북부·남동부 …)
    w.provinces[cap].name = CAPITALS[m.en] ?? `${c.shortName} 수도`;
    if (provs.length > 1) {
      const cxs = provs.reduce((a, p) => a + w.provinces[p].cx, 0) / provs.length, cys = provs.reduce((a, p) => a + w.provinces[p].cy, 0) / provs.length;
      const used2 = new Map<string, number>();
      for (const p of provs) {
        if (p === cap) continue;
        const pr = w.provinces[p]; const dx = pr.cx - cxs, dy = pr.cy - cys;
        const span = Math.sqrt(provs.length) * 3;
        let dir = '중부';
        if (Math.hypot(dx, dy) > span * 0.35) {
          const a = Math.atan2(-dy, dx) * 180 / Math.PI;
          dir = ['동부', '북동부', '북부', '북서부', '서부', '남서부', '남부', '남동부'][((Math.round(a / 45) % 8) + 8) % 8];
        }
        const base2 = `${c.shortName} ${dir}`;
        const n = (used2.get(base2) || 0) + 1; used2.set(base2, n);
        pr.name = n === 1 ? base2 : `${base2} ${n}`;
      }
    }
    // 인구 분배
    const wts = provs.map(p => { const pr = w.provinces[p]; return pr.cellCount * TERRAINS[pr.terrain].cap * (0.5 + r()) * (pr.coastal ? 1.4 : 1) * (pr.river ? 1.5 : 1) * (p === cap ? 5 : 1); });
    const sw = wts.reduce((a, b) => a + b, 0);
    provs.forEach((p, k) => { w.provinces[p].pop = Math.max(5000, m.pop * 1e6 * wts[k] / sw); });
    // 산업: GDP 비례 공장 배분
    let fac = Math.round(m.gdp / 25);
    const byPop = [...provs].sort((a, b) => w.provinces[b].pop - w.provinces[a].pop);
    for (let round = 0; fac > 0 && round < 12; round++) for (const p of byPop) { if (fac <= 0) break; const b = w.provinces[p].buildings; if ((b.factory || 0) < 10) { b.factory = (b.factory || 0) + 1; fac--; } }
    for (const p of provs) {
      const b = w.provinces[p].buildings;
      if (m.tier >= 3) { b.rail = Math.min(5, m.tier - 1); b.market = Math.min(5, m.tier - 1); }
      if (m.tier >= 2 && r() < 0.5) b.farm = m.tier - 1;
      if (w.provinces[p].coastal && (r() < 0.3 + m.tier * 0.1 || p === cap)) b.port = 1;
      if (m.tier >= 3 && w.provinces[p].pop > 2e6) b.lab = m.tier - 2;
    }
    c.taxRate = 0.18 + m.tier * 0.02;
  });
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
  for (const cu of w.cultures) { const c = w.countries.find(x => x.culture === cu.id); cu.color = c ? c.color : 0x888888; }
  w.relSize = w.countries.length + 64;
  w.relations = new Array(w.relSize * w.relSize).fill(0);
  (w as any)._real = { idMap: [...idMap.entries()], meta: D.countries };
  progress?.(0.85, '외교 관계 수립 중...');
  return w;
}

/** setupWorld 이후 실제 동맹·관계·군사력 반영 */
export function applyRealDiplomacy(w: WorldState, spawn: (owner: number, type: string, pid: number) => void) {
  const info = (w as any)._real as { idMap: [number, number][]; meta: RealCountry[] } | undefined;
  if (!info) return;
  delete (w as any)._real;
  const idMap = new Map(info.idMap);
  const S = w.relSize;
  w.rules.aiAggression = 0.45;
  // 1인당 생산성 & 인구 수용력
  let tg = 0, tp = 0; for (const m of info.meta) { tg += m.gdp; tp += m.pop; }
  const avg = tg / tp;
  for (const [ci, id] of idMap) { const m = info.meta[ci]; w.countries[id].productivity = Math.max(0.08, Math.min(8, Math.pow((m.gdp / Math.max(0.01, m.pop)) / avg, 0.85))); }
  for (let k = 0; k < 3; k++) monthlyEconomy(w);
  for (const c of w.countries) if (c.alive) { c.gdpPrev = c.gdp; c.treasury = c.gdp * 0.08; }
  for (const p of w.provinces) { if (!p.active) continue; p.capMul = 1; const base = provinceCapacity(w, p); p.capMul = Math.max(1, (p.pop * 1.3) / base); }
  // 무작위 초기 조약 제거 → 실제 동맹
  w.treaties = [];
  for (const g of D.alliances) {
    const ids = g.map(x => idMap.get(x)).filter((x): x is number => x !== undefined);
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) { w.treaties.push({ type: 'alliance', a: ids[i], b: ids[j], until: -1 }); w.relations[ids[i] * S + ids[j]] = w.relations[ids[j] * S + ids[i]] = 60; }
  }
  for (const [a, b, v] of D.relations) { const A = idMap.get(a), B = idMap.get(b); if (A === undefined || B === undefined) continue; w.relations[A * S + B] = w.relations[B * S + A] = v; }
  // 군사력 재배치
  w.divisions = [];
  for (const [ci, id] of idMap) {
    const m = info.meta[ci]; const c = w.countries[id];
    const n = Math.max(1, Math.round(Math.pow(m.mil, 1.7) * 2.2 + Math.pow(m.pop, 0.3) * 0.6));
    const own = w.provinces.filter(p => p.active && p.owner === id);
    const border = own.filter(p => p.neighbors.some(q => w.provinces[q].owner >= 0 && w.provinces[q].owner !== id));
    for (let i = 0; i < n; i++) {
      const t = i % 6 === 2 && c.tech.military >= 4 ? 'armor' : i % 6 === 4 ? 'artillery' : i % 9 === 7 && c.tech.military >= 3 ? 'mechanized' : 'infantry';
      const pid = i % 3 === 0 || !border.length ? c.capital : border[i % border.length].id;
      spawn(id, t, pid);
    }
    const navy = m.mil * m.tier;
    c.ships.destroyer = Math.round(navy * 2.5); c.ships.cruiser = Math.round(navy * 0.8); c.ships.submarine = Math.round(navy * 0.8);
    c.ships.battleship = m.mil >= 4 ? Math.round(navy * 0.2) : 0; c.ships.carrier = m.en === 'United States of America' ? 11 : m.mil >= 4 && m.tier >= 3 ? 2 : 0; c.ships.transport = 2 + m.mil * 2;
    c.planes.fighter = Math.round(m.mil * m.mil * m.tier * 12); c.planes.bomber = Math.round(m.mil * m.mil * m.tier * 3); c.planes.attacker = Math.round(m.mil * m.tier * 8); c.planes.recon = m.mil * 5;
    c.manpower = c.population * c.conscription * 0.5;
  }
}

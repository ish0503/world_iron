import type { WorldState, Culture, Religion } from '../types/World';
import type { Province, ResourceId } from '../types/Province';
import type { Country, GovType, Personality, TechField } from '../types/Country';
import { T, TERRAINS, isWater } from '../data/terrain';
import { GOVS, GOV_IDS, PERSONALITY_IDS, TECH_IDS } from '../data/defs';
import { genRoot, genLeader, genPlace, genCulture, genReligion, genTag, hslColor } from '../data/names';
import { mulberry, type Rng } from './rng';
import { rebuildGeometry } from './Geometry';

export interface GenOptions {
  seed: number;
  width: number;
  height: number;
  provinces: number;
  countries: number;
  startYear: number;
  landRatio: number;
  name?: string;
}

export const WORLD_PRESETS = {
  small: { width: 240, height: 150, provinces: 220, countries: 16 },
  medium: { width: 320, height: 200, provinces: 500, countries: 30 },
  large: { width: 420, height: 260, provinces: 900, countries: 50 },
};

function makeNoise(r: Rng) {
  const perm = new Uint8Array(512); const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const vals = new Float32Array(256); for (let i = 0; i < 256; i++) vals[i] = r();
  const h = (x: number, y: number) => vals[perm[(x & 255) + perm[y & 255]]];
  const sm = (t: number) => t * t * (3 - 2 * t);
  const noise = (x: number, y: number) => {
    const xi = Math.floor(x), yi = Math.floor(y); const xf = x - xi, yf = y - yi;
    const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
    const u = sm(xf), v = sm(yf);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  return (x: number, y: number, oct = 5) => {
    let s = 0, amp = 1, f = 1, norm = 0;
    for (let o = 0; o < oct; o++) { s += noise(x * f, y * f) * amp; norm += amp; amp *= 0.5; f *= 2; }
    return s / norm;
  };
}

class Heap {
  a: number[] = []; k: number[] = [];
  push(v: number, key: number) {
    const a = this.a, k = this.k; a.push(v); k.push(key);
    let i = a.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (k[p] <= k[i]) break; [a[p], a[i]] = [a[i], a[p]]; [k[p], k[i]] = [k[i], k[p]]; i = p; }
  }
  pop(): [number, number] | null {
    const a = this.a, k = this.k; if (!a.length) return null;
    const top: [number, number] = [a[0], k[0]];
    const lv = a.pop()!, lk = k.pop()!;
    if (a.length) {
      a[0] = lv; k[0] = lk; let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1; let m = i;
        if (l < a.length && k[l] < k[m]) m = l; if (r < a.length && k[r] < k[m]) m = r;
        if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; [k[m], k[i]] = [k[i], k[m]]; i = m;
      }
    }
    return top;
  }
  get size() { return this.a.length; }
}

export function emptyProvince(id: number, name: string): Province {
  return {
    id, name, owner: -1, controller: -1, cores: [], cx: 0, cy: 0, cellCount: 0, terrain: T.PLAINS,
    coastal: false, river: false, neighbors: [], seaNeighbors: [], pop: 0, culture: 0, religion: 0,
    unrest: 0, resource: null, resourceAmount: 0, buildings: {}, construction: null, disaster: null,
    plague: 0, devastation: 0, dmzUntil: 0, food: 0, ic: 0, gdp: 0, active: true,
  };
}

export function techBaseForYear(year: number) { return Math.max(0, Math.min(8, (year - 1780) / 45)); }

export function newCountry(w: WorldState, id: number, root: string, gov: GovType, personality: Personality, capital: number, r: () => number, color: number, used: Set<string>): Country {
  const base = techBaseForYear(w.startYear);
  const tech = {} as Record<TechField, number>;
  const bias = r() * 1.5 - 0.6;
  for (const f of TECH_IDS) tech[f] = Math.max(0, Math.round(base + bias + (r() * 2 - 1)));
  const g = GOVS[gov];
  const suffix = g.suffix[Math.floor(r() * g.suffix.length)];
  const cap = w.provinces[capital];
  return {
    id, tag: genTag(r, used), name: `${root} ${suffix}`, shortName: root, color, alive: true, capital,
    gov, leader: genLeader(r), leaderSince: w.day, personality,
    culture: cap ? cap.culture : 0, religion: cap ? cap.religion : 0, founded: w.day,
    treasury: 5 + r() * 10, debt: 0, taxRate: g.tax,
    budget: { military: 0.4, research: 0.02, welfare: 0.035, infrastructure: 0.02 },
    stability: 55 + r() * 25, legitimacy: 50 + r() * 30, warExhaustion: 0, inflation: 0.02, unemployment: 0.06,
    gdp: 0, gdpPrev: 0, gdpGrowth: 0.02, income: 0, expense: 0, tradeBalance: 0,
    manpower: 0, conscription: 0.025, warEconomy: false,
    stock: { food: 200, steel: 120, coal: 120, oil: 60, rare: 10 },
    prod: { food: 0, steel: 0, coal: 0, oil: 0, rare: 0 },
    cons: { food: 0, steel: 0, coal: 0, oil: 0, rare: 0 },
    milUse: { food: 0, steel: 0, coal: 0, oil: 0, rare: 0 },
    tech, techProgress: 0, researchFocus: 'industry',
    ships: { destroyer: 0, cruiser: 0, battleship: 0, carrier: 0, submarine: 0, transport: 0 },
    planes: { fighter: 0, bomber: 0, attacker: 0, recon: 0, airlift: 0 },
    autoImport: true, aiNext: Math.floor(r() * 10), aiMilNext: Math.floor(r() * 3),
    goals: [], history: [], lastElection: w.day - Math.floor(r() * 1400), famine: 0, overlord: -1,
    provinceCount: 0, population: 0, militaryPower: 0, totalIC: 0,
  };
}

export function generateWorld(opt: GenOptions, progress?: (p: number, msg: string) => void): WorldState {
  const r = mulberry(opt.seed);
  const W = opt.width, H = opt.height, N = W * H;
  progress?.(0.05, '지형 생성 중...');
  const nE = makeNoise(r), nM = makeNoise(r), nC = makeNoise(r);

  // 대륙 중심
  const blobs: { x: number; y: number; r: number }[] = [];
  const nb = 3 + Math.floor(r() * 4);
  for (let i = 0; i < nb; i++) blobs.push({ x: 0.15 + r() * 0.7, y: 0.18 + r() * 0.64, r: 0.18 + r() * 0.2 });

  const elev = new Float32Array(N), moist = new Float32Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = x / W, v = y / H;
    let cont = 0;
    for (const b of blobs) {
      const dx = (u - b.x) * (W / H), dy = v - b.y;
      cont = Math.max(cont, 1 - Math.sqrt(dx * dx + dy * dy) / b.r);
    }
    const e = nE(u * 6, v * 6 * H / W * (W / H)) * 0.65 + Math.max(0, cont) * 0.55 + nC(u * 2.2, v * 2.2) * 0.35;
    const edge = Math.min(u, 1 - u, v, 1 - v);
    elev[y * W + x] = e - (edge < 0.06 ? (0.06 - edge) * 6 : 0);
    moist[y * W + x] = nM(u * 4, v * 4);
  }
  // 해수면 = 육지 비율 백분위
  const sorted = Array.from(elev).sort((a, b) => a - b);
  const sea = sorted[Math.floor(N * (1 - opt.landRatio))];
  const maxE = sorted[N - 1];
  const terrain = new Uint8Array(N), hgt = new Uint8Array(N), river = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const e = elev[i]; const y = (i / W) | 0;
    if (e < sea) { terrain[i] = e < sea - 0.06 ? T.DEEP : T.SEA; hgt[i] = 0; continue; }
    const h = (e - sea) / (maxE - sea);
    hgt[i] = Math.min(255, Math.round(h * 255));
    const lat = Math.abs(y / H - 0.5) * 2; // 0 적도 ~ 1 극
    const temp = 1 - lat * 1.05 - h * 0.45;
    const m = moist[i];
    let t: number = T.PLAINS;
    if (h > 0.6) t = temp < 0.25 ? T.SNOW : T.MOUNTAIN;
    else if (temp < 0.08) t = T.SNOW;
    else if (temp < 0.22) t = T.TUNDRA;
    else if (h > 0.4) t = T.HILLS;
    else if (m < 0.38 && temp > 0.5) t = T.DESERT;
    else if (m > 0.6 && temp > 0.68) t = T.JUNGLE;
    else if (m > 0.62 && h < 0.06) t = T.SWAMP;
    else if (m > 0.53) t = T.FOREST;
    terrain[i] = t;
  }
  // 1셀 섬 제거
  for (let i = 0; i < N; i++) {
    if (isWater(terrain[i])) continue;
    const x = i % W, y = (i / W) | 0;
    let land = 0;
    if (x > 0 && !isWater(terrain[i - 1])) land++; if (x < W - 1 && !isWater(terrain[i + 1])) land++;
    if (y > 0 && !isWater(terrain[i - W])) land++; if (y < H - 1 && !isWater(terrain[i + W])) land++;
    if (land === 0) terrain[i] = T.SEA;
  }
  progress?.(0.2, '강과 호수 생성 중...');
  // 강: 높은 곳에서 낮은 곳으로
  const landIdx: number[] = []; for (let i = 0; i < N; i++) if (!isWater(terrain[i])) landIdx.push(i);
  const nRivers = Math.round(landIdx.length / 650);
  for (let k = 0; k < nRivers; k++) {
    let i = landIdx[Math.floor(r() * landIdx.length)];
    if (elev[i] < sea + (maxE - sea) * 0.3) continue;
    const visited = new Set<number>();
    for (let step = 0; step < 200; step++) {
      visited.add(i);
      if (terrain[i] !== T.SNOW) river[i] = 1;
      const x = i % W, y = (i / W) | 0;
      let best = -1, be = Infinity;
      for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1]) {
        if (j < 0 || visited.has(j)) continue;
        const e = elev[j] + r() * 0.012;
        if (e < be) { be = e; best = j; }
      }
      if (best < 0) break;
      if (isWater(terrain[best])) break;
      if (be > elev[i] + 0.02) { // 웅덩이 → 호수
        terrain[i] = T.LAKE; river[i] = 0;
        const x2 = i % W;
        for (const j of [i - 1, i + 1, i - W, i + W]) if (j >= 0 && j < N && Math.abs((j % W) - x2) <= 1 && !isWater(terrain[j]) && r() < 0.6) { terrain[j] = T.LAKE; river[j] = 0; }
        break;
      }
      i = best;
    }
  }
  // 추가 호수
  const nLakes = Math.round(landIdx.length / 3000) + 2;
  for (let k = 0; k < nLakes; k++) {
    const c = landIdx[Math.floor(r() * landIdx.length)];
    if (terrain[c] === T.MOUNTAIN || terrain[c] === T.SNOW) continue;
    const size = 4 + Math.floor(r() * 14);
    const q = [c]; let made = 0;
    while (q.length && made < size) {
      const i = q.shift()!; if (isWater(terrain[i])) continue;
      const x = i % W, y = (i / W) | 0;
      if (x < 2 || y < 2 || x > W - 3 || y > H - 3) continue;
      // 바다와 붙지 않도록
      let nearSea = false;
      for (const j of [i - 1, i + 1, i - W, i + W]) if (terrain[j] === T.SEA || terrain[j] === T.DEEP) nearSea = true;
      if (nearSea) continue;
      terrain[i] = T.LAKE; river[i] = 0; made++;
      for (const j of [i - 1, i + 1, i - W, i + W]) if (r() < 0.7) q.push(j);
    }
  }

  progress?.(0.35, '프로빈스 분할 중...');
  // 프로빈스 시드
  const cellProv = new Int32Array(N).fill(-1);
  const land2: number[] = []; for (let i = 0; i < N; i++) if (!isWater(terrain[i])) land2.push(i);
  const avg = land2.length / opt.provinces;
  const minD = Math.sqrt(avg) * 0.75;
  const seeds: number[] = [];
  let tries = 0;
  while (seeds.length < opt.provinces && tries < opt.provinces * 60) {
    tries++;
    const c = land2[Math.floor(r() * land2.length)];
    const cx = c % W, cy = (c / W) | 0;
    let ok = true;
    for (const s of seeds) { const dx = (s % W) - cx, dy = ((s / W) | 0) - cy; if (dx * dx + dy * dy < minD * minD) { ok = false; break; } }
    if (ok) seeds.push(c);
  }
  const heap = new Heap(); const cost = new Float64Array(N).fill(Infinity);
  seeds.forEach((s, k) => { cellProv[s] = k; cost[s] = 0; heap.push(s, 0); });
  const flood = () => {
    while (heap.size) {
      const [i, c] = heap.pop()!;
      if (c > cost[i]) continue;
      const x = i % W, y = (i / W) | 0;
      for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1]) {
        if (j < 0 || isWater(terrain[j])) continue;
        const tc = TERRAINS[terrain[j]].move * (river[j] ? 1.6 : 1) * (0.8 + r() * 0.5);
        const nc = c + tc;
        if (nc < cost[j]) { cost[j] = nc; cellProv[j] = cellProv[i]; heap.push(j, nc); }
      }
    }
  };
  flood();
  // 시드 없는 섬
  let nextP = seeds.length;
  for (const i of land2) {
    if (cellProv[i] >= 0) continue;
    // 섬 성분 수집
    const comp: number[] = []; const q = [i]; cellProv[i] = -2;
    while (q.length) {
      const a = q.pop()!; comp.push(a);
      const x = a % W, y = (a / W) | 0;
      for (const j of [x > 0 ? a - 1 : -1, x < W - 1 ? a + 1 : -1, y > 0 ? a - W : -1, y < H - 1 ? a + W : -1]) {
        if (j < 0 || isWater(terrain[j]) || cellProv[j] !== -1) continue;
        cellProv[j] = -2; q.push(j);
      }
    }
    if (comp.length < 14) { for (const a of comp) { cellProv[a] = -1; terrain[a] = T.SEA; river[a] = 0; } continue; }
    const k = Math.max(1, Math.round(comp.length / avg));
    for (const a of comp) cellProv[a] = -1;
    for (let s = 0; s < k; s++) { const c = comp[Math.floor(r() * comp.length)]; if (cellProv[c] >= 0) continue; cellProv[c] = nextP; cost[c] = 0; heap.push(c, 0); nextP++; }
    flood();
  }
  const P = nextP;

  const w: WorldState = {
    version: 1, name: opt.name || '새로운 세계', seed: opt.seed, rng: opt.seed ^ 0x9e3779b9,
    width: W, height: H, terrain, height_: hgt, river, cellProv,
    provinces: [], countries: [], divisions: [], battles: [], wars: [], treaties: [],
    relations: [], relSize: 0, cultures: [], religions: [], startYear: opt.startYear, day: 0,
    chronicle: [], log: [],
    rules: { noWar: false, infiniteResources: false, popGrowth: 1, aiAggression: 1, disasterRate: 1, techSpeed: 1, fogOfWar: false },
    prices: { food: 0.004, steel: 0.01, coal: 0.007, oil: 0.016, rare: 0.04 },
    globalTemp: 0, nextId: { div: 1, war: 1, battle: 1, offer: 1 }, player: -1, mode: 'observer',
    offers: [], firsts: {}, worldWarCount: 0,
  };
  for (let p = 0; p < P; p++) w.provinces.push(emptyProvince(p, genPlace(r)));
  progress?.(0.5, '지리 정보 계산 중...');
  rebuildGeometry(w);

  // 인구 & 자원
  for (const pr of w.provinces) {
    if (!pr.active) continue;
    const td = TERRAINS[pr.terrain];
    let pop = pr.cellCount * 13000 * td.cap * (0.45 + r() * 1.2);
    if (pr.coastal) pop *= 1.25; if (pr.river) pop *= 1.35;
    pr.pop = Math.max(8000, pop);
    if (r() < 0.38) {
      const t = pr.terrain; let res: ResourceId;
      const x = r();
      if (t === T.MOUNTAIN || t === T.HILLS) res = x < 0.45 ? 'steel' : x < 0.75 ? 'coal' : 'rare';
      else if (t === T.DESERT || t === T.SWAMP || t === T.TUNDRA) res = x < 0.7 ? 'oil' : 'coal';
      else if (t === T.JUNGLE) res = x < 0.5 ? 'rare' : 'oil';
      else if (t === T.FOREST) res = x < 0.5 ? 'coal' : 'steel';
      else res = x < 0.45 ? 'food' : x < 0.65 ? 'oil' : x < 0.85 ? 'coal' : 'steel';
      pr.resource = res; pr.resourceAmount = 1 + Math.floor(r() * 3);
    }
    if (r() < 0.25) pr.buildings.farm = 1;
    if (pr.coastal && r() < 0.35) pr.buildings.port = 1;
  }

  progress?.(0.62, '문화와 종교 형성 중...');
  const active = w.provinces.filter(p => p.active);
  const regionFlood = (k: number) => {
    const owner = new Int32Array(P).fill(-1);
    const q: number[] = [];
    const chosen = new Set<number>();
    for (let s = 0; s < k; s++) {
      let best = active[Math.floor(r() * active.length)];
      for (let t = 0; t < 15; t++) {
        const c = active[Math.floor(r() * active.length)];
        let md = Infinity, mdB = Infinity;
        for (const o of chosen) { const op = w.provinces[o]; md = Math.min(md, Math.hypot(op.cx - c.cx, op.cy - c.cy)); mdB = Math.min(mdB, Math.hypot(op.cx - best.cx, op.cy - best.cy)); }
        if (md > mdB) best = c;
      }
      chosen.add(best.id); owner[best.id] = s; q.push(best.id);
    }
    while (q.length) {
      const idx = Math.floor(r() * Math.min(q.length, 8));
      const p = q.splice(idx, 1)[0];
      for (const n of [...w.provinces[p].neighbors, ...w.provinces[p].seaNeighbors]) if (owner[n] < 0) { owner[n] = owner[p]; q.push(n); }
    }
    for (const p of active) if (owner[p.id] < 0) owner[p.id] = Math.floor(r() * k);
    return owner;
  };
  const nCult = Math.max(6, Math.round(opt.countries / 3));
  const cultOwner = regionFlood(nCult);
  const nRel = Math.max(4, Math.round(opt.countries / 6));
  const relOwner = regionFlood(nRel);
  for (let i = 0; i < nCult; i++) { const root = genRoot(r); w.cultures.push({ id: i, name: genCulture(r, root), color: hslColor((i * 137.5) % 360, 0.55, 0.55) } as Culture); }
  for (let i = 0; i < nRel; i++) w.religions.push({ id: i, name: genReligion(r), color: hslColor((i * 97 + 40) % 360, 0.6, 0.5), founded: -1 } as Religion);
  for (const p of active) { p.culture = cultOwner[p.id]; p.religion = relOwner[p.id]; }

  progress?.(0.75, '국가 건국 중...');
  // 수도 배치: 원거리 샘플링 + 인구
  const capitals: number[] = [];
  const nC2 = Math.min(opt.countries, Math.floor(active.length / 3));
  for (let k = 0; k < nC2; k++) {
    let best = -1, bs = -Infinity;
    for (let t = 0; t < 40; t++) {
      const c = active[Math.floor(r() * active.length)];
      if (capitals.includes(c.id)) continue;
      let md = 1e9; for (const o of capitals) { const op = w.provinces[o]; md = Math.min(md, Math.hypot(op.cx - c.cx, op.cy - c.cy)); }
      const s = Math.min(md, 80) + Math.log(c.pop) * 2 + r() * 6;
      if (s > bs) { bs = s; best = c.id; }
    }
    if (best >= 0) capitals.push(best);
  }
  const owner = new Int32Array(P).fill(-1);
  const targetTotal = Math.round(active.length * 0.88);
  const weights = capitals.map(() => 0.3 + r() ** 1.6 * 2.5);
  const ws = weights.reduce((a, b) => a + b, 0);
  const targets = weights.map(x => Math.max(2, Math.round((x / ws) * targetTotal)));
  const sizes = capitals.map(() => 1);
  const frontier: number[][] = capitals.map(c => [c]);
  capitals.forEach((c, k) => { owner[c] = k; });
  let growing = true;
  while (growing) {
    growing = false;
    for (let k = 0; k < capitals.length; k++) {
      if (sizes[k] >= targets[k]) continue;
      const f = frontier[k];
      for (let tries2 = 0; tries2 < 6 && f.length; tries2++) {
        const fi = Math.floor(r() * f.length); const p = f[fi];
        const cands = w.provinces[p].neighbors.filter(n => owner[n] < 0);
        if (!cands.length) { f.splice(fi, 1); continue; }
        const n = cands[Math.floor(r() * cands.length)];
        owner[n] = k; sizes[k]++; f.push(n); growing = true; break;
      }
    }
  }
  const used = new Set<string>();
  const hueOff = r() * 360;
  capitals.forEach((cap, k) => {
    const gov = weightedGov(r);
    const pers = PERSONALITY_IDS[Math.floor(r() * PERSONALITY_IDS.length)];
    const color = hslColor((hueOff + k * 137.508) % 360, 0.45 + r() * 0.35, 0.42 + r() * 0.2);
    const root = genRoot(r);
    const c = newCountry(w, k, root, gov, pers, cap, r, color, used);
    w.countries.push(c);
    w.provinces[cap].name = root + (r() < 0.5 ? '' : ['시', '성', '그라드', '부르크'][Math.floor(r() * 4)]);
    w.provinces[cap].pop *= 2.6;
    w.provinces[cap].buildings.factory = 2; w.provinces[cap].buildings.market = 1;
  });
  for (const p of active) {
    const o = owner[p.id];
    p.owner = o; p.controller = o;
    if (o >= 0) {
      p.cores = [o];
      // 근대 국가: 공장 분포
      const tb = techBaseForYear(opt.startYear);
      if (r() < 0.12 + tb * 0.06) p.buildings.factory = (p.buildings.factory || 0) + 1 + Math.floor(r() * tb * 0.5);
      if (r() < tb * 0.08) p.buildings.rail = 1;
    }
  }
  // 문화적 연고: 이웃 국가 문화권 프로빈스는 그 국가의 핵심 영토가 되기도 함
  for (const p of active) {
    if (p.owner < 0) continue;
    for (const c of w.countries) if (c.id !== p.owner && c.culture === p.culture && r() < 0.35) {
      if (p.neighbors.some(n => w.provinces[n].owner === c.id)) p.cores.push(c.id);
    }
  }
  w.relSize = w.countries.length + 64;
  w.relations = new Array(w.relSize * w.relSize).fill(0);
  progress?.(0.9, '외교 관계 수립 중...');
  return w;
}

function weightedGov(r: () => number): GovType {
  const wts: [GovType, number][] = [['democracy', 3], ['republic', 2], ['constitutional', 2], ['absolute', 2], ['junta', 1], ['oneparty', 1.5], ['federation', 1], ['theocracy', 0.8]];
  const tot = wts.reduce((a, b) => a + b[1], 0); let x = r() * tot;
  for (const [g, wt] of wts) { x -= wt; if (x <= 0) return g; }
  return GOV_IDS[0];
}

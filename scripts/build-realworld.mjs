// Natural Earth 국경(world-atlas) → 게임 격자 래스터화. 결과: src/data/realworld.json
// 실행: node scripts/build-realworld.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { feature } from 'topojson-client';
import { COUNTRIES, TERRITORY, ALLIANCES, RELATIONS } from './realworld-countries.mjs';

const W = 600, LAT0 = 84, LAT1 = -58, LON0 = -180, LON1 = 180;
const H = Math.round(W * (LAT0 - LAT1) / (LON1 - LON0));
const dLon = (LON1 - LON0) / W, dLat = (LAT0 - LAT1) / H;
const topo = JSON.parse(readFileSync(new URL('../node_modules/world-atlas/countries-50m.json', import.meta.url)));
const geo = feature(topo, topo.objects.countries);

const meta = new Map();
for (const line of COUNTRIES.trim().split('\n')) {
  const [en, ko, pop, gdp, gov, pers, tier, mil, lat, lon] = line.split('|');
  meta.set(en, { en, ko, pop: +pop, gdp: +gdp, gov, pers, tier: +tier, mil: +mil, lat: +lat, lon: +lon });
}
const list = []; const idx = new Map();
const idOf = (en) => {
  const target = TERRITORY[en] || en;
  if (!meta.has(target)) return -1;
  if (!idx.has(target)) { idx.set(target, list.length); list.push(meta.get(target)); }
  return idx.get(target);
};
const owner = new Int16Array(W * H).fill(-1);
for (const f of geo.features) {
  const name = f.properties.name;
  if (name === 'Antarctica') continue;
  const id = idOf(name);
  if (id < 0) { console.warn('skip', name); continue; }
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  for (const poly0 of polys) {
    // 날짜변경선을 넘는 고리는 경도를 연속적으로 펼친다 (예: 179 → 181)
    const poly = poly0.map(ring => { let off = 0; let prev = ring[0][0]; return ring.map(([x, y]) => { if (x - prev > 180) off -= 360; else if (prev - x > 180) off += 360; prev = x; return [x + off, y]; }); });
    for (let y = 0; y < H; y++) {
      const lat = LAT0 - (y + 0.5) * dLat;
      const xs = [];
      for (const ring of poly) for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [x1, y1] = ring[i], [x2, y2] = ring[j];
        if ((y1 > lat) !== (y2 > lat)) xs.push(x1 + (lat - y1) / (y2 - y1) * (x2 - x1));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const a = Math.ceil((xs[k] - LON0) / dLon - 0.5), b = Math.floor((xs[k + 1] - LON0) / dLon - 0.5);
        for (let x = a; x <= b; x++) owner[y * W + (((x % W) + W) % W)] = id;
      }
    }
  }
}
// 작은 국가(인구 0.4M 이상) 최소 1~수 셀 보장
for (const [en, m] of meta) {
  if (m.pop < 0.4) continue;
  const id = idOf(en);
  let n = 0; for (let i = 0; i < owner.length; i++) if (owner[i] === id) n++;
  if (n >= 2) continue;
  const cx = Math.floor((m.lon - LON0) / dLon), cy = Math.floor((LAT0 - m.lat) / dLat);
  for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]].slice(0, m.pop > 3 ? 4 : 2)) {
    const x = cx + dx, y = cy + dy; if (x >= 0 && y >= 0 && x < W && y < H) owner[y * W + x] = id;
  }
}

// ── 지형 근사 ──
const T = { DEEP: 0, SEA: 1, LAKE: 2, PLAINS: 3, FOREST: 4, JUNGLE: 5, DESERT: 6, HILLS: 7, MOUNTAIN: 8, TUNDRA: 9, SNOW: 10, SWAMP: 11 };
const box = (la0, la1, lo0, lo1) => (la, lo) => la >= la0 && la <= la1 && lo >= lo0 && lo <= lo1;
function lineDist(la, lo, pts) {
  let best = Infinity;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ay, ax] = pts[i], [by, bx] = pts[i + 1];
    const dx = bx - ax, dy = by - ay; const t = Math.max(0, Math.min(1, ((lo - ax) * dx + (la - ay) * dy) / (dx * dx + dy * dy)));
    best = Math.min(best, Math.hypot(lo - (ax + dx * t), la - (ay + dy * t)));
  }
  return best;
}
const MOUNTAINS = [
  [[36, 70], [35, 75], [30, 81], [28, 86], [27.5, 92], [28, 97]], 3.0,
  [[10, -73], [2, -77.5], [-5, -79], [-15, -72], [-23, -67.5], [-33, -70], [-45, -72], [-54, -71]], 2.4,
  [[62, -140], [55, -125], [49, -115], [42, -110], [36, -107], [31, -106]], 4.0,
  [[44, 5.5], [46, 8], [46.8, 11], [47.2, 14]], 1.3,
  [[43.5, 40], [42.5, 44], [41.3, 48]], 1.2,
  [[68, 65], [62, 60], [56, 59], [51, 58]], 1.2,
  [[37, 45], [33, 48], [30, 52], [27, 57]], 1.8,
  [[30.5, -9], [32.5, -4], [35, 1], [36, 8]], 1.4,
  [[42, 69], [42.5, 76], [43, 82], [48, 88], [50, 90]], 2.4,
  [[36.5, 71], [35.5, 69]], 2.0,
  [[59, 6.5], [62, 9], [65, 14], [68.5, 18], [70, 22]], 1.6,
  [[28, -107], [24, -105], [19, -101], [17, -97]], 2.0,
  [[42.8, -1.5], [42.6, 2]], 0.8,
  [[48, 22], [47.5, 25], [45.5, 25.5], [45, 23]], 1.0,
  [[13, 38], [9, 39], [6, 38]], 2.6,
  [[-1, 29.5], [-6, 29.5], [-9, 33]], 1.4,
  [[36, 138], [35.5, 137], [43, 142.5]], 1.0,
  [[64, -150], [62, -150]], 2.5,
];
const HILLS = [
  [[34, -85], [38, -81], [41, -77], [44.5, -71]], 2.0,
  [[-38, 146], [-33, 150], [-28, 152], [-20, 147], [-16, 145]], 1.6,
  [[33, 100], [32, 104], [27, 102], [24, 101]], 2.5,
  [[32, 52], [34, 58], [33, 62]], 3.0,
  [[42, 21], [41, 24], [43, 26]], 1.2,
  [[-27, -51], [-22, -45], [-19, -42]], 2.0,
  [[16, 47], [14, 45], [16, 43]], 2.0,
  [[63, 110], [66, 125], [64, 140], [62, 155]], 4.0,
  [[52, 92], [50, 100], [52, 108]], 3.0,
];
const DESERTS = [box(15.5, 31, -17, 33), box(15.5, 30.5, 36, 56), box(25, 33, 52, 66), box(24, 29, 69, 74), box(37, 41.5, 76, 90), box(40, 46, 96, 112), box(-31, -19, 117, 142), box(-28, -18, 13, 22.5), box(-27, -17, -71, -68.5), box(31, 37.5, -117, -109), box(43, 47, 54, 64), box(37, 42, 55, 64)];
const JUNGLES = [box(-13, 5, -76, -47), box(-5, 5, 9, 30), box(-10, 20, 95, 152), box(7, 18, -92, -77), box(4, 8, -12, 9), box(-24, -12, 44, 50)];
const SWAMPS = [box(58, 64, 65, 85), box(6, 9.5, 29, 32.5), box(-20, -16, -58, -55), box(28, 31, -92, -89)];
const RIVERS = [
  [[31.5, 31], [26, 32.7], [19, 33], [15.6, 32.5], [9, 31], [4, 31.5], [0, 32.5]],
  [[-4, -50], [-3, -60], [-3.5, -68], [-4, -73], [-8, -75]],
  [[29.5, -89.5], [35, -90], [39, -90.5], [45, -93], [47, -95]],
  [[31, 121.5], [30.5, 114], [30, 106], [28, 100]],
  [[46, 48], [49, 45], [53, 49], [56, 44], [57, 38]],
  [[45, 29.5], [44.5, 25], [45, 20], [47.5, 19], [48.2, 16.5], [48.5, 13]],
  [[22, 89], [25, 85], [26, 82], [29, 78]],
  [[10, 106.5], [13, 105.5], [17.5, 103], [20, 100.5], [22, 100.5]],
  [[-6, 12.5], [-4.3, 15.5], [-1, 17], [2, 21], [1, 25]],
  [[67, 69], [62, 66], [61, 75], [57, 83], [53, 83]],
  [[38, 117.5], [35, 113], [36, 106], [36, 101]],
  [[-34, -58.5], [-30, -59.5], [-25, -57.5], [-22, -55]],
  [[60, -95], [55, -105], [53.5, -113]],
  [[70, 128], [65, 125], [61, 129], [60, 120]],
  [[24, 67.5], [28, 69], [31, 71], [34, 72]],
  [[30.5, 47.8], [33, 44], [36, 43], [37, 42]],
];
function hash(x, y) { let h = (x * 374761393 + y * 668265263) >>> 0; h = ((h ^ (h >>> 13)) * 1274126177) >>> 0; return (h & 0xffff) / 65536; }
function vnoise(x, y) { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi; const s = (t) => t * t * (3 - 2 * t); const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1); const u = s(xf), v = s(yf); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; }
const fbm = (x, y) => (vnoise(x, y) * 0.5 + vnoise(x * 2, y * 2) * 0.3 + vnoise(x * 4, y * 4) * 0.2);

const terrain = new Uint8Array(W * H), height = new Uint8Array(W * H), river = new Uint8Array(W * H);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const i = y * W + x; const la = LAT0 - (y + 0.5) * dLat, lo = LON0 + (x + 0.5) * dLon;
  if (owner[i] < 0) { terrain[i] = T.SEA; continue; }
  const n = fbm(x / 8, y / 8);
  let h = n * 50;
  let t = T.PLAINS;
  for (let k = 0; k < MOUNTAINS.length; k += 2) { const d = lineDist(la, lo, MOUNTAINS[k]); const wdt = MOUNTAINS[k + 1]; if (d < wdt * (0.7 + n * 0.6)) { t = d < wdt * 0.45 ? T.MOUNTAIN : T.HILLS; h = 255 - d / wdt * 120; } }
  if (t === T.PLAINS) for (let k = 0; k < HILLS.length; k += 2) { const d = lineDist(la, lo, HILLS[k]); if (d < HILLS[k + 1] * (0.6 + n * 0.7)) { t = T.HILLS; h = 130 - d * 10; } }
  if (la > 29 && la < 37 && lo > 78 && lo < 100 && t === T.PLAINS) { t = T.MOUNTAIN; h = 220; } // 티베트 고원
  if (t === T.PLAINS) {
    if (DESERTS.some(f => f(la, lo)) && n > 0.25) t = T.DESERT;
    else if (JUNGLES.some(f => f(la, lo)) && n > 0.22) t = T.JUNGLE;
    else if (SWAMPS.some(f => f(la, lo)) && n > 0.35) t = T.SWAMP;
    else if (Math.abs(la) > 66 || (la > 58 && lo > 60 && lo < 180 && n > 0.55)) t = T.TUNDRA;
    else if ((la > 47 && la < 66 && n > 0.42) || (n > 0.62 && Math.abs(la) < 50)) t = T.FOREST;
  }
  if (la > 73 || (la > 62 && lo > -55 && lo < -20 && owner[i] === idx.get('Greenland') && n > 0.15)) t = T.SNOW;
  if (owner[i] === idx.get('Greenland') && la > 60) t = n > 0.75 ? T.TUNDRA : T.SNOW;
  terrain[i] = t; height[i] = Math.max(1, Math.min(255, Math.round(h)));
}
// 심해
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const i = y * W + x; if (terrain[i] !== T.SEA) continue;
  let near = false;
  for (let dy = -3; dy <= 3 && !near; dy++) for (let dx = -3; dx <= 3; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; if (terrain[yy * W + xx] > 2) { near = true; break; } }
  if (!near) terrain[i] = T.DEEP;
}
for (const r of RIVERS) for (let k = 0; k + 1 < r.length; k++) {
  const [a1, o1] = r[k], [a2, o2] = r[k + 1];
  const steps = Math.ceil(Math.hypot(a2 - a1, o2 - o1) / (dLat * 0.5));
  for (let s = 0; s <= steps; s++) {
    const la = a1 + (a2 - a1) * s / steps, lo = o1 + (o2 - o1) * s / steps;
    const x = Math.floor((lo - LON0) / dLon), y = Math.floor((LAT0 - la) / dLat);
    const i = y * W + x; if (owner[i] >= 0) river[i] = 1;
  }
}
// 카스피해·흑해 등 내해는 바다로 남음. 대호수 일부 표현
const LAKES = [box(41.5, 49, -92, -76), box(-3, 0.5, 31.5, 34), box(44, 46.5, 58, 61.5), box(51.5, 55.8, 103.5, 109.5)];
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const i = y * W + x; const la = LAT0 - (y + 0.5) * dLat, lo = LON0 + (x + 0.5) * dLon;
  if (owner[i] < 0) continue;
  const n = fbm(x / 3, y / 3);
  if (box(41.5, 49, -92, -76)(la, lo) && ((la > 46.5 && la < 48.8 && lo > -92 && lo < -84.5) || (la > 43.5 && la < 46 && lo > -87.8 && lo < -86.2) || (la > 43.2 && la < 45.8 && lo > -84 && lo < -80.5 && !(lo > -82.5 && la < 44.2)) || (la > 41.5 && la < 42.8 && lo > -83.3 && lo < -79) || (la > 43.2 && la < 44.2 && lo > -79.8 && lo < -76.2))) { terrain[i] = T.LAKE; owner[i] = -1; }
  else if (LAKES.slice(1).some(f => f(la, lo)) && n > 0.45) { terrain[i] = T.LAKE; owner[i] = -1; }
}

function rle(arr) { const out = []; let v = arr[0], c = 0; for (const a of arr) { if (a === v) c++; else { out.push(v, c); v = a; c = 1; } } out.push(v, c); return out; }
const countries = list.map((m, i) => {
  let n = 0; for (const o of owner) if (o === i) n++;
  return { ...m, cells: n };
});
const out = {
  width: W, height: H, lat0: LAT0, lat1: LAT1, lon0: LON0, lon1: LON1,
  owner: rle(owner), terrain: rle(terrain), elev: rle(Array.from(height, v => v >> 3)), river: rle(river),
  countries, alliances: ALLIANCES.map(g => g.filter(n => idx.has(n)).map(n => idx.get(n))), relations: RELATIONS.filter(([a, b]) => idx.has(a) && idx.has(b)).map(([a, b, v]) => [idx.get(a), idx.get(b), v]),
};
writeFileSync(new URL('../src/data/realworld.json', import.meta.url), JSON.stringify(out));
console.log(`grid ${W}x${H}, countries ${countries.length}, land ${owner.filter(o => o >= 0).length}, zero-cell: ${countries.filter(c => !c.cells).map(c => c.en).join(', ')}`);
console.log('size KB', (JSON.stringify(out).length / 1024).toFixed(0));

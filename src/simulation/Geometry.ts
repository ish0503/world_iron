import type { WorldState } from '../types/World';
import { T, isWater } from '../data/terrain';

/**
 * 셀 데이터로부터 프로빈스 기하 정보(중심, 인접, 해안, 해상 인접)를 다시 계산한다.
 * 세계 생성과 지도 편집 모두에서 사용된다.
 */
export function rebuildGeometry(w: WorldState) {
  const { width: W, height: H, cellProv, terrain, river } = w;
  const n = w.provinces.length;
  const sx = new Float64Array(n), sy = new Float64Array(n), cnt = new Int32Array(n);
  const tcount: Map<number, number>[] = Array.from({ length: n }, () => new Map());
  const nb: Set<number>[] = Array.from({ length: n }, () => new Set());
  const coastal = new Uint8Array(n), riv = new Uint8Array(n);

  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x; const p = cellProv[i];
    if (p < 0) continue;
    sx[p] += x; sy[p] += y; cnt[p]++;
    const tm = tcount[p]; tm.set(terrain[i], (tm.get(terrain[i]) || 0) + 1);
    if (river[i]) riv[p] = 1;
    const check = (j: number) => {
      const q = cellProv[j];
      if (q >= 0 && q !== p) { nb[p].add(q); }
      else if (q < 0 && (terrain[j] === T.SEA || terrain[j] === T.DEEP)) coastal[p] = 1;
    };
    if (x > 0) check(i - 1); if (x < W - 1) check(i + 1);
    if (y > 0) check(i - W); if (y < H - 1) check(i + W);
  }
  // 중심: 무게중심에 가장 가까운 내부 셀
  const best = new Float64Array(n).fill(Infinity);
  const bx = new Int32Array(n), by = new Int32Array(n);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = cellProv[y * W + x]; if (p < 0 || cnt[p] === 0) continue;
    const mx = sx[p] / cnt[p], my = sy[p] / cnt[p];
    // 경계가 아닌 셀에 가중
    let interior = 1;
    const i = y * W + x;
    if ((x > 0 && cellProv[i - 1] !== p) || (x < W - 1 && cellProv[i + 1] !== p) || (y > 0 && cellProv[i - W] !== p) || (y < H - 1 && cellProv[i + W] !== p)) interior = 3;
    const d = ((x - mx) ** 2 + (y - my) ** 2) * interior;
    if (d < best[p]) { best[p] = d; bx[p] = x; by[p] = y; }
  }
  for (let p = 0; p < n; p++) {
    const pr = w.provinces[p];
    pr.cellCount = cnt[p];
    pr.active = cnt[p] > 0;
    if (!pr.active) { pr.neighbors = []; pr.seaNeighbors = []; pr.owner = -1; pr.controller = -1; continue; }
    pr.cx = bx[p] + 0.5; pr.cy = by[p] + 0.5;
    let bt = 3, bc = -1;
    for (const [t, c] of tcount[p]) if (c > bc) { bc = c; bt = t; }
    pr.terrain = bt;
    pr.coastal = !!coastal[p];
    pr.river = !!riv[p];
    pr.neighbors = [...nb[p]];
  }
  computeSeaLinks(w);
}

/** 해안 프로빈스 사이의 해상 연결(항로) 계산 */
export function computeSeaLinks(w: WorldState, range = 22) {
  const { width: W, height: H, cellProv, terrain } = w;
  const n = w.provinces.length;
  const dist = new Int32Array(W * H).fill(-1);
  const queue = new Int32Array(W * H);
  const touched: number[] = [];
  // 해안 셀 목록
  const coastCells: number[][] = Array.from({ length: n }, () => []);
  for (let i = 0; i < W * H; i++) {
    const p = cellProv[i]; if (p < 0) continue;
    const x = i % W, y = (i / W) | 0;
    const isSea = (j: number) => terrain[j] === T.SEA || terrain[j] === T.DEEP;
    if ((x > 0 && isSea(i - 1)) || (x < W - 1 && isSea(i + 1)) || (y > 0 && isSea(i - W)) || (y < H - 1 && isSea(i + W))) coastCells[p].push(i);
  }
  for (let p = 0; p < n; p++) {
    const pr = w.provinces[p];
    pr.seaNeighbors = [];
    if (!pr.active || !pr.coastal) continue;
    let qh = 0, qt = 0;
    for (const c of coastCells[p]) { dist[c] = 0; queue[qt++] = c; touched.push(c); }
    const found = new Map<number, number>();
    while (qh < qt) {
      const i = queue[qh++]; const d = dist[i];
      if (d >= range) continue;
      const x = i % W, y = (i / W) | 0;
      const nbs = [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1];
      for (const j of nbs) {
        if (j < 0 || dist[j] >= 0) continue;
        const q = cellProv[j];
        if (q >= 0) { if (q !== p && d > 0 && !found.has(q)) found.set(q, d); continue; }
        if (terrain[j] !== T.SEA && terrain[j] !== T.DEEP) continue;
        dist[j] = d + 1; queue[qt++] = j; touched.push(j);
      }
    }
    for (const c of touched) dist[c] = -1;
    touched.length = 0;
    const land = new Set(pr.neighbors);
    pr.seaNeighbors = [...found.entries()].filter(([q]) => !land.has(q)).sort((a, b) => a[1] - b[1]).slice(0, 6).map(e => e[0]);
  }
  // 대칭화
  for (const pr of w.provinces) for (const q of pr.seaNeighbors) {
    const o = w.provinces[q]; if (!o.seaNeighbors.includes(pr.id)) o.seaNeighbors.push(pr.id);
  }
}

export function provinceDistance(w: WorldState, a: number, b: number) {
  const A = w.provinces[a], B = w.provinces[b];
  return Math.hypot(A.cx - B.cx, A.cy - B.cy);
}

export { isWater };

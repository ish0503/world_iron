import type { WorldState } from '../types/World';
import { CELL } from './MapRenderer';

/** 프로빈스 외곽선 선분 계산 (선택 강조용) */
export function provinceOutline(w: WorldState, pids: Set<number>): number[] {
  const segs: number[] = [];
  const W = w.width, H = w.height, cp = w.cellProv;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x; const p = cp[i];
    if (p < 0 || !pids.has(p)) continue;
    const X = x * CELL, Y = y * CELL;
    if (x === 0 || !pids.has(cp[i - 1])) segs.push(X, Y, X, Y + CELL);
    if (x === W - 1 || !pids.has(cp[i + 1])) segs.push(X + CELL, Y, X + CELL, Y + CELL);
    if (y === 0 || !pids.has(cp[i - W])) segs.push(X, Y, X + CELL, Y);
    if (y === H - 1 || !pids.has(cp[i + W])) segs.push(X, Y + CELL, X + CELL, Y + CELL);
  }
  return segs;
}

/** 국가 이름 라벨 위치: 가장 큰 연결 영토의 중심과 크기 */
export function countryLabelInfo(w: WorldState) {
  const out: { id: number; x: number; y: number; size: number; angle: number }[] = [];
  const byCountry = new Map<number, number[]>();
  for (const p of w.provinces) if (p.active && p.owner >= 0) { let a = byCountry.get(p.owner); if (!a) byCountry.set(p.owner, a = []); a.push(p.id); }
  for (const [cid, provs] of byCountry) {
    const set = new Set(provs); const seen = new Set<number>();
    let best: number[] = [], bestCells = 0;
    for (const s of provs) {
      if (seen.has(s)) continue;
      const comp: number[] = []; const q = [s]; seen.add(s); let cells = 0;
      while (q.length) { const p = q.pop()!; comp.push(p); cells += w.provinces[p].cellCount; for (const n of w.provinces[p].neighbors) if (set.has(n) && !seen.has(n)) { seen.add(n); q.push(n); } }
      if (cells > bestCells) { bestCells = cells; best = comp; }
    }
    let sx = 0, sy = 0, sw = 0, minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of best) { const P = w.provinces[p]; sx += P.cx * P.cellCount; sy += P.cy * P.cellCount; sw += P.cellCount; minX = Math.min(minX, P.cx); maxX = Math.max(maxX, P.cx); minY = Math.min(minY, P.cy); maxY = Math.max(maxY, P.cy); }
    if (!sw) continue;
    const name = w.countries[cid].shortName;
    const spanX = (maxX - minX + 6) * CELL, spanY = (maxY - minY + 6) * CELL;
    const size = Math.max(8, Math.min(spanX * 0.85 / Math.max(2, name.length), spanY * 0.5, 44, Math.sqrt(bestCells) * CELL * 0.38));
    out.push({ id: cid, x: (sx / sw) * CELL, y: (sy / sw) * CELL, size, angle: 0 });
  }
  return out;
}

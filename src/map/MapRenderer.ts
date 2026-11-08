import type { WorldState } from '../types/World';
import type { MapMode } from '../systems/GameController';
import { TERRAINS, T } from '../data/terrain';
import { GOVS, RESOURCES } from '../data/defs';
import { getRel, atWar, hasTreaty, alliesOf, enemiesOf } from '../simulation/WorldHelpers';
import { computeSupply } from '../simulation/MilitarySimulation';
import { computeBlocs } from '../simulation/Blocs';

export const CELL = 4;

export interface RenderOpts {
  mode: MapMode;
  focus: number;          // 외교/보급 지도 기준 국가
  highlight: number;      // 강조 국가
  provinceBorders: boolean;
}

const rgb = (c: number): [number, number, number] => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
const pack = (r: number, g: number, b: number) => (255 << 24) | (Math.max(0, Math.min(255, b)) << 16) | (Math.max(0, Math.min(255, g)) << 8) | Math.max(0, Math.min(255, r));
function grad(stops: [number, number, number][], t: number): [number, number, number] {
  t = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(t)); const f = t - i;
  const a = stops[i], b = stops[i + 1];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}
const HEAT: [number, number, number][] = [[24, 40, 70], [40, 110, 140], [110, 180, 90], [240, 210, 70], [235, 90, 50], [170, 20, 40]];
const GOODBAD: [number, number, number][] = [[60, 170, 90], [210, 200, 80], [220, 120, 50], [190, 40, 40]];

/** 셀 픽셀 기반 지도 렌더러 (지형 + 데이터 레이어 + 국경) */
export class MapRenderer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  img!: ImageData;
  buf!: Uint32Array;
  /** GPU 업로드용 원시 RGBA 바이트 (캔버스 경유 없이 → ReadPixels 정지 방지) */
  bytes!: Uint8Array;
  /** 2D 캔버스에도 그릴지 (메뉴 배경용) */
  canvasOutput = true;
  W = 0; H = 0;
  terrainCol: Uint32Array = new Uint32Array(0);  // 셀별 음영 지형 색 (RGB packed)
  bbox: Int32Array = new Int32Array(0);          // 프로빈스별 x0,y0,x1,y1
  provCol: Int32Array = new Int32Array(0);       // 프로빈스별 모드 색 (-1 = 지형)
  provMix: Float32Array = new Float32Array(0);
  stripe: Int32Array = new Int32Array(0);        // 점령국 색
  lastOwner: Int32Array = new Int32Array(0);
  lastCtl: Int32Array = new Int32Array(0);

  constructor(w: WorldState, canvasOutput = true) {
    this.canvasOutput = canvasOutput;
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: false })!;
    this.resize(w);
  }

  resize(w: WorldState) {
    this.W = w.width; this.H = w.height;
    const pw = w.width * CELL, ph = w.height * CELL;
    if (this.canvasOutput) { this.canvas.width = pw; this.canvas.height = ph; } else { this.canvas.width = 1; this.canvas.height = 1; }
    this.img = new ImageData(pw, ph);
    this.buf = new Uint32Array(this.img.data.buffer);
    this.bytes = new Uint8Array(this.img.data.buffer);
  }

  /** 지형 음영 & 프로빈스 경계 상자 계산 (지형 변경 시) */
  prepareTerrain(w: WorldState) {
    if (w.width !== this.W || w.height !== this.H) this.resize(w);
    const W = this.W, H = this.H, N = W * H;
    this.terrainCol = new Uint32Array(N);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x; const t = w.terrain[i];
      let [r, g, b] = TERRAINS[t].color;
      const hash = ((x * 73856093) ^ (y * 19349663)) >>> 0;
      const n = ((hash % 1000) / 1000 - 0.5) * 10;
      if (t <= 2) {
        // 해안 근처 얕은 바다 밝게
        let shore = 0;
        for (let dy = -2; dy <= 2 && !shore; dy++) for (let dx = -2; dx <= 2; dx++) {
          const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          if (w.terrain[yy * W + xx] > 2) { shore = 1; break; }
        }
        if (shore && t !== T.LAKE) { r += 14; g += 22; b += 22; }
        r += n * 0.4; g += n * 0.4; b += n * 0.6;
      } else {
        const h = w.height_[i];
        const hl = x > 0 && y > 0 ? w.height_[i - W - 1] : h;
        const shade = (h - hl) * 0.9;
        r += n + shade; g += n + shade; b += n + shade;
      }
      this.terrainCol[i] = pack(r, g, b);
    }
    const P = w.provinces.length;
    this.bbox = new Int32Array(P * 4);
    for (let p = 0; p < P; p++) { this.bbox[p * 4] = W; this.bbox[p * 4 + 1] = H; this.bbox[p * 4 + 2] = -1; this.bbox[p * 4 + 3] = -1; }
    for (let i = 0; i < N; i++) {
      const p = w.cellProv[i]; if (p < 0) continue;
      const x = i % W, y = (i / W) | 0; const o = p * 4;
      if (x < this.bbox[o]) this.bbox[o] = x; if (y < this.bbox[o + 1]) this.bbox[o + 1] = y;
      if (x > this.bbox[o + 2]) this.bbox[o + 2] = x; if (y > this.bbox[o + 3]) this.bbox[o + 3] = y;
    }
    this.lastOwner = new Int32Array(P).fill(-9);
    this.lastCtl = new Int32Array(P).fill(-9);
  }

  /** 소유/점령이 바뀐 프로빈스 목록 */
  changedProvinces(w: WorldState): number[] {
    const out: number[] = [];
    if (this.lastOwner.length !== w.provinces.length) return w.provinces.map(p => p.id);
    for (const p of w.provinces) if (p.owner !== this.lastOwner[p.id] || p.controller !== this.lastCtl[p.id]) out.push(p.id);
    return out;
  }

  private computeProvinceColors(w: WorldState, o: RenderOpts) {
    const P = w.provinces.length;
    if (this.provCol.length !== P) { this.provCol = new Int32Array(P); this.provMix = new Float32Array(P); this.stripe = new Int32Array(P); }
    const mode = o.mode;
    let maxV = 1;
    const vals = new Float64Array(P);
    if (mode === 'population' || mode === 'economy') {
      for (const p of w.provinces) if (p.active) { const v = mode === 'population' ? p.pop / Math.max(1, p.cellCount) : p.gdp / Math.max(1, p.cellCount); vals[p.id] = Math.log10(1 + v); if (vals[p.id] > maxV) maxV = vals[p.id]; }
    }
    let supply: Float32Array | null = null;
    if (mode === 'supply' && o.focus >= 0 && w.countries[o.focus]?.alive) supply = computeSupply(w, o.focus);
    let techMin = Infinity, techMax = -Infinity;
    const avgTech = (cid: number) => { const t = w.countries[cid].tech; return (t.agriculture + t.construction + t.medicine + t.industry + t.military + t.transport + t.naval + t.communication + t.energy) / 9; };
    if (mode === 'tech') for (const c of w.countries) if (c.alive) { const a = avgTech(c.id); techMin = Math.min(techMin, a); techMax = Math.max(techMax, a); }
    const focusAllies = o.focus >= 0 ? new Set(alliesOf(w, o.focus)) : new Set<number>();
    const focusEnemies = o.focus >= 0 ? new Set(enemiesOf(w, o.focus)) : new Set<number>();
    const blocs = mode === 'blocs' ? computeBlocs(w) : null;
    const atWarSet = new Set<number>(); if (mode === 'blocs') for (const war of w.wars) if (war.active) for (const x of [...war.attackers, ...war.defenders]) atWarSet.add(x);
    for (const p of w.provinces) {
      const id = p.id;
      this.stripe[id] = -1;
      if (!p.active) { this.provCol[id] = -1; continue; }
      const own = p.owner;
      const c = own >= 0 ? w.countries[own] : null;
      let col = -1, mix = 0.6;
      switch (mode) {
        case 'political':
          if (c) { col = c.color; mix = 0.62; }
          if (p.controller !== own && p.controller >= 0) this.stripe[id] = w.countries[p.controller].color;
          break;
        case 'terrain': col = -1; break;
        case 'population': case 'economy': { const g = grad(HEAT, vals[id] / maxV); col = (g[0] << 16) | (g[1] << 8) | g[2]; mix = 0.85; break; }
        case 'military':
          if (c) {
            const war = enemiesOf(w, own).length > 0;
            const front = war && p.neighbors.some(n => atWar(w, own, w.provinces[n].controller));
            col = front ? 0xe0603a : war ? 0xa04848 : 0x56606e; mix = 0.7;
            if (p.controller !== own && p.controller >= 0) this.stripe[id] = 0xff2020;
          }
          break;
        case 'diplomacy':
          if (c && o.focus >= 0) {
            if (own === o.focus) col = 0xffd24a;
            else if (focusEnemies.has(own)) col = 0xd8342c;
            else if (focusAllies.has(own)) col = 0x3a8ee8;
            else if (c.overlord === o.focus || w.countries[o.focus].overlord === own) col = 0x9a5ae0;
            else if (hasTreaty(w, 'guarantee', o.focus, own)) col = 0x5ad0e0;
            else { const r = getRel(w, o.focus, own); const g = grad([[200, 70, 60], [150, 150, 150], [90, 200, 110]], (r + 100) / 200); col = (g[0] << 16) | (g[1] << 8) | g[2]; }
            mix = 0.75;
          } else if (c) { col = 0x707070; mix = 0.5; }
          break;
        case 'religion': col = w.religions[p.religion]?.color ?? 0x888888; mix = 0.75; break;
        case 'culture': col = w.cultures[p.culture]?.color ?? 0x888888; mix = 0.75; break;
        case 'climate': col = -2; break;
        case 'tech': if (c) { const g = grad(HEAT, (avgTech(own) - techMin) / Math.max(1, techMax - techMin)); col = (g[0] << 16) | (g[1] << 8) | g[2]; mix = 0.8; } break;
        case 'government': if (c) { col = GOVS[c.gov].color; mix = 0.78; } break;
        case 'resource': col = p.resource ? RESOURCES[p.resource].color : 0x3a3f46; mix = p.resource ? 0.85 : 0.55; if (p.resource === 'food') col = 0xb8d040; break;
        case 'supply': if (supply) { const s = supply[id]; const g = grad(GOODBAD, 1 - s); col = s > 0 ? (g[0] << 16) | (g[1] << 8) | g[2] : 0x303030; mix = 0.8; } break;
        case 'blocs':
          if (c && blocs) { const b = blocs.of[own]; col = b >= 0 ? blocs.blocs[b].color : 0x5a5f66; mix = b >= 0 ? (own === blocs.blocs[b].leader ? 0.85 : 0.68) : 0.55; if (atWarSet.has(own) && p.controller !== own && p.controller >= 0) this.stripe[id] = 0xff2a2a; }
          break;
        case 'unrest': { const g = grad(GOODBAD, p.unrest / 100); col = c ? (g[0] << 16) | (g[1] << 8) | g[2] : -1; mix = 0.8; break; }
      }
      if (o.highlight >= 0 && own === o.highlight && col >= 0) { const [r, g, b] = rgb(col); col = (Math.min(255, r + 40) << 16) | (Math.min(255, g + 40) << 8) | Math.min(255, b + 40); mix = Math.min(0.85, mix + 0.12); }
      this.provCol[id] = col; this.provMix[id] = mix;
    }
  }

  /** 전체 또는 일부 프로빈스 렌더 */
  render(w: WorldState, o: RenderOpts, only?: number[]) {
    this.computeProvinceColors(w, o);
    const W = this.W, H = this.H;
    if (!only) this.renderRect(w, o, 0, 0, W - 1, H - 1);
    else for (const p of only) {
      const b = p * 4; if (this.bbox[b + 2] < 0) continue;
      this.renderRect(w, o, this.bbox[b] - 1, this.bbox[b + 1] - 1, this.bbox[b + 2] + 1, this.bbox[b + 3] + 1);
    }
    for (const p of w.provinces) { this.lastOwner[p.id] = p.owner; this.lastCtl[p.id] = p.controller; }
    if (this.canvasOutput) this.ctx.putImageData(this.img, 0, 0);
  }

  private renderRect(w: WorldState, o: RenderOpts, x0: number, y0: number, x1: number, y1: number) {
    const W = this.W, H = this.H, S = CELL, PW = W * S;
    x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(W - 1, x1); y1 = Math.min(H - 1, y1);
    const buf = this.buf, cp = w.cellProv, terr = w.terrain, riv = w.river;
    const provs = w.provinces;
    const RIVER = pack(70, 130, 190);
    const bcol = new Uint32Array(w.countries.length);
    for (const c of w.countries) bcol[c.id] = pack(((c.color >> 16) & 255) * 0.35, ((c.color >> 8) & 255) * 0.35, (c.color & 255) * 0.35);
    const NOBORDER = pack(40, 40, 40);
    for (let y = y0; y <= y1; y++) {
      const lat = Math.abs(y / H - 0.5) * 2;
      for (let x = x0; x <= x1; x++) {
        const i = y * W + x;
        const p = cp[i];
        let base = this.terrainCol[i];
        let r = base & 255, g = (base >> 8) & 255, b = (base >> 16) & 255;
        let stripeCol = -1;
        if (p >= 0) {
          const col = this.provCol[p];
          if (col === -2) { // 기후
            const temp = 1 - lat * 1.05 + w.globalTemp * 0.3 - w.height_[i] / 600;
            const gg = grad([[90, 120, 230], [110, 200, 210], [120, 200, 90], [230, 200, 70], [220, 80, 50]], temp);
            r = r * 0.25 + gg[0] * 0.75; g = g * 0.25 + gg[1] * 0.75; b = b * 0.25 + gg[2] * 0.75;
          } else if (col >= 0) {
            const m = this.provMix[p];
            const cr = (col >> 16) & 255, cg = (col >> 8) & 255, cb = col & 255;
            r = r * (1 - m) + cr * m; g = g * (1 - m) + cg * m; b = b * (1 - m) + cb * m;
          } else if (o.mode !== 'terrain' && provs[p].owner < 0) {
            const l = (r + g + b) / 3; r = r * 0.55 + l * 0.3; g = g * 0.55 + l * 0.3; b = b * 0.55 + l * 0.3;
          }
          stripeCol = this.stripe[p];
        }
        const own = p >= 0 ? provs[p].owner : -2;
        // 경계 판정
        const pr = x < W - 1 ? cp[i + 1] : p, pb = y < H - 1 ? cp[i + W] : p;
        const pl = x > 0 ? cp[i - 1] : p, pt = y > 0 ? cp[i - W] : p;
        const ownOf = (q: number) => (q >= 0 ? provs[q].owner : -2);
        const landR = pr >= 0, landB = pb >= 0, landL = pl >= 0, landT = pt >= 0;
        const isLand = p >= 0;
        const cbR = isLand && landR && ownOf(pr) !== own, cbB = isLand && landB && ownOf(pb) !== own;
        const cbL = isLand && landL && ownOf(pl) !== own, cbT = isLand && landT && ownOf(pt) !== own;
        const pbR = o.provinceBorders && isLand && pr !== p && landR && !cbR, pbB = o.provinceBorders && isLand && pb !== p && landB && !cbB;
        const coastR = isLand && !landR && x < W - 1, coastB = isLand && !landB && y < H - 1, coastL = isLand && !landL && x > 0, coastT = isLand && !landT && y > 0;
        const ri = isLand && riv[i] === 1;
        const borderCol = own >= 0 ? bcol[own] : NOBORDER;
        const ox = x * S, oy = y * S;
        for (let py = 0; py < S; py++) {
          let row = (oy + py) * PW + ox;
          for (let px = 0; px < S; px++, row++) {
            let R = r, G = g, B = b;
            if (stripeCol >= 0 && ((ox + px + oy + py) % 8) < 3) { R = (stripeCol >> 16) & 255; G = (stripeCol >> 8) & 255; B = stripeCol & 255; R = R * 0.8; G = G * 0.8; B = B * 0.8; }
            if (ri) {
              const cx = px === 1 || px === 2, cy = py === 1 || py === 2;
              const rr = x < W - 1 && (riv[i + 1] || (terr[i + 1] <= 2)), rl = x > 0 && (riv[i - 1] || terr[i - 1] <= 2);
              const rb = y < H - 1 && (riv[i + W] || terr[i + W] <= 2), rt = y > 0 && (riv[i - W] || terr[i - W] <= 2);
              if ((cx && cy) || (cy && ((px >= 2 && rr) || (px <= 1 && rl))) || (cx && ((py >= 2 && rb) || (py <= 1 && rt)))) { buf[row] = RIVER; continue; }
            }
            if ((cbR && px === S - 1) || (cbB && py === S - 1) || (cbL && px === 0) || (cbT && py === 0)) { buf[row] = borderCol; continue; }
            if ((coastR && px === S - 1) || (coastB && py === S - 1) || (coastL && px === 0) || (coastT && py === 0)) { R *= 0.6; G *= 0.6; B *= 0.6; }
            else if ((pbR && px === S - 1) || (pbB && py === S - 1)) { R *= 0.78; G *= 0.78; B *= 0.78; }
            buf[row] = pack(R, G, B);
          }
        }
      }
    }
  }
}

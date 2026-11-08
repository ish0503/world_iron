import { Graphics } from 'pixi.js';
import type { WorldState } from '../types/World';
import type { Division } from '../types/Military';
import type { Selection } from '../systems/GameController';
import { CELL } from './MapRenderer';
import type { MapCamera } from './MapCamera';
import { TERRAINS } from '../data/terrain';
import { cityTier } from '../data/defs';

export const FIGURE_ZOOM = 1.6;

const hash = (a: number, b: number) => { let h = (a * 374761393 + b * 668265263) >>> 0; h = ((h ^ (h >>> 13)) * 1274126177) >>> 0; return (h & 0xffff) / 65536; };
const darken = (c: number, k: number) => (Math.round(((c >> 16) & 255) * k) << 16) | (Math.round(((c >> 8) & 255) * k) << 8) | Math.round((c & 255) * k);

interface Disp { x: number; y: number; face: number; }

/**
 * 월드박스 스타일 유닛 표현: 사단마다 작은 병사/전차/포/수송선이 실제로 걸어서 이동하고,
 * 전투 지역에서는 총구 섬광과 폭발이 일어난다. 확대했을 때만 그린다.
 */
export class UnitSprites {
  g = new Graphics();
  fx = new Graphics();
  people = new Graphics();
  private disp = new Map<number, Disp>();
  private lastT = 0;

  /** 사단의 목표 위치 (월드 좌표) */
  private target(w: WorldState, d: Division): { x: number; y: number; moving: boolean; sea: boolean } {
    const P = w.provinces[d.province];
    const jx = (hash(d.id, 1) - 0.5) * 14, jy = (hash(d.id, 2) - 0.5) * 10;
    let x = P.cx * CELL + jx, y = P.cy * CELL + jy;
    if (d.battle >= 0) {
      const b = w.battles.find(bb => bb.id === d.battle);
      if (b && b.province !== d.province) {
        const B = w.provinces[b.province];
        x += (B.cx - P.cx) * CELL * 0.62; y += (B.cy - P.cy) * CELL * 0.62;
      }
      return { x, y, moving: false, sea: false };
    }
    if (d.path.length) {
      const N = w.provinces[d.path[0]];
      const sea = !P.neighbors.includes(N.id);
      const len = Math.hypot(N.cx - P.cx, N.cy - P.cy) * (sea ? 1.4 : TERRAINS[N.terrain].move) + (sea ? 10 : 0);
      const f = Math.min(1, d.progress / Math.max(0.01, len));
      x += (N.cx - P.cx) * CELL * f; y += (N.cy - P.cy) * CELL * f;
      return { x, y, moving: true, sea };
    }
    return { x, y, moving: false, sea: false };
  }

  update(w: WorldState, cam: MapCamera, t: number, sel: Selection, show: boolean) {
    const g = this.g, fx = this.fx, pg = this.people;
    g.clear(); fx.clear(); pg.clear();
    const dt = Math.min(0.1, Math.max(0, t - this.lastT)); this.lastT = t;
    const fl = (w as any)._flash as { pid: number; t: number } | undefined;
    if (fl) {
      const age = (Date.now() - fl.t) / 1000;
      if (age > 4) delete (w as any)._flash;
      else { const p = w.provinces[fl.pid]; const x = p.cx * CELL, y = p.cy * CELL; const r = 6 + age * 28;
        fx.circle(x, y, r).fill({ color: 0xffffff, alpha: Math.max(0, 0.7 - age * 0.25) });
        fx.circle(x, y, r * 0.6).fill({ color: 0xffb040, alpha: Math.max(0, 0.8 - age * 0.25) });
        fx.circle(x, y - age * 8, 4 + age * 6).fill({ color: 0x777777, alpha: Math.max(0, 0.6 - age * 0.15) }); }
    }
    if (!show || cam.zoom < FIGURE_ZOOM) { this.disp.clear(); return; }
    const vx0 = -cam.x / cam.zoom - 20, vy0 = -cam.y / cam.zoom - 20;
    const vx1 = vx0 + cam.viewW / cam.zoom + 40, vy1 = vy0 + cam.viewH / cam.zoom + 40;
    const selDivs = sel.kind === 'army' ? new Set(sel.divs) : null;
    const alive = new Set<number>();
    const k = Math.min(1, dt * 5);
    for (const d of w.divisions) {
      const tg = this.target(w, d);
      if (tg.x < vx0 || tg.x > vx1 || tg.y < vy0 || tg.y > vy1) { this.disp.delete(d.id); continue; }
      alive.add(d.id);
      let ds = this.disp.get(d.id);
      if (!ds || Math.hypot(ds.x - tg.x, ds.y - tg.y) > 60) { ds = { x: tg.x, y: tg.y, face: 1 }; this.disp.set(d.id, ds); }
      const dx = tg.x - ds.x;
      ds.x += dx * k; ds.y += (tg.y - ds.y) * k;
      if (Math.abs(dx) > 0.05) ds.face = dx > 0 ? 1 : -1;
      const walking = tg.moving || Math.abs(dx) > 0.3;
      const c = w.countries[d.owner]; if (!c) continue;
      const col = c.color, dark = darken(col, 0.55);
      const selected = !!selDivs && selDivs.has(d.id);
      if (selected) g.ellipse(ds.x, ds.y + 2.2, 6, 2.2).fill({ color: 0xffffff, alpha: 0.35 });
      if (tg.sea) { this.boat(g, ds.x, ds.y, ds.face, col, t + d.id); continue; }
      const fighting = d.battle >= 0;
      switch (d.type) {
        case 'armor': this.tank(g, ds.x, ds.y, ds.face, col, dark, walking, t + d.id); break;
        case 'artillery': this.cannon(g, ds.x, ds.y, ds.face, col, dark); if (fighting) this.flash(fx, ds.x + ds.face * 4.5, ds.y - 1.6, t, d.id, 0.9); break;
        case 'mechanized': this.truck(g, ds.x, ds.y, ds.face, col, dark, walking, t + d.id); this.soldier(g, ds.x - ds.face * 4, ds.y, ds.face, col, walking, t + d.id, fighting); break;
        default: {
          const n = d.strength > d.maxStrength * 0.6 ? 3 : d.strength > d.maxStrength * 0.25 ? 2 : 1;
          for (let i = 0; i < n; i++) {
            const ox = (i - (n - 1) / 2) * 2.6 + (i === 1 ? 0 : 0.4), oy = (i % 2) * 1.4 - 0.7;
            this.soldier(g, ds.x + ox, ds.y + oy, ds.face, col, walking, t + d.id * 1.7 + i * 0.33, fighting);
            if (fighting) this.flash(fx, ds.x + ox + ds.face * 2.2, ds.y + oy - 2, t, d.id * 7 + i, 0.5);
          }
        }
      }
    }
    for (const id of this.disp.keys()) if (!alive.has(id)) this.disp.delete(id);
    // 전투 폭발
    for (const b of w.battles) {
      const p = w.provinces[b.province];
      const x = p.cx * CELL, y = p.cy * CELL;
      if (x < vx0 || x > vx1 || y < vy0 || y > vy1) continue;
      for (let i = 0; i < 3; i++) {
        const phase = (t * 1.3 + i / 3 + hash(b.id, i)) % 1;
        const seed = Math.floor(t * 1.3 + i / 3 + hash(b.id, i));
        const ex = x + (hash(seed, b.id * 3 + i) - 0.5) * 22, ey = y + (hash(seed, b.id * 5 + i) - 0.5) * 14;
        const r = 1 + phase * 4.5;
        fx.circle(ex, ey, r).fill({ color: phase < 0.35 ? 0xfff2a0 : 0xff7a20, alpha: (1 - phase) * 0.8 });
        if (phase > 0.4) fx.circle(ex, ey - phase * 3, r * 0.8).fill({ color: 0x555555, alpha: (1 - phase) * 0.45 });
      }
    }
    // 도시 주민 (확대 시)
    if (cam.zoom >= 3) {
      for (const p of w.provinces) {
        if (!p.active || p.owner < 0) continue;
        const x = p.cx * CELL, y = p.cy * CELL;
        if (x < vx0 || x > vx1 || y < vy0 || y > vy1) continue;
        const tier = cityTier(p.pop).tier;
        const n = Math.min(7, tier + (p.buildings.market || 0));
        const col = w.countries[p.owner].color;
        for (let i = 0; i < n; i++) {
          const sp = 0.15 + hash(p.id, i) * 0.25;
          const a = t * sp + hash(i, p.id) * 6.28;
          const rx = 4 + hash(p.id, i + 9) * 8, ry = 2 + hash(p.id, i + 19) * 5;
          const px = x + Math.cos(a) * rx, py = y + Math.sin(a * 1.3) * ry;
          pg.rect(px - 0.35, py - 1.4, 0.7, 1.1).fill({ color: i % 3 ? 0xe8d8c0 : col });
          pg.rect(px - 0.3, py - 2.0, 0.6, 0.6).fill({ color: 0xf0c8a0 });
        }
      }
    }
  }

  private soldier(g: Graphics, x: number, y: number, face: number, col: number, walking: boolean, t: number, fighting: boolean) {
    const step = walking ? Math.sin(t * 12) : 0;
    // 다리
    g.rect(x - 0.6 + step * 0.35, y - 0.9, 0.45, 1.0).fill({ color: 0x2a2a2a });
    g.rect(x + 0.15 - step * 0.35, y - 0.9, 0.45, 1.0).fill({ color: 0x2a2a2a });
    // 몸통
    const bob = walking ? Math.abs(step) * 0.2 : 0;
    g.rect(x - 0.7, y - 2.4 - bob, 1.4, 1.6).fill({ color: col }).stroke({ width: 0.15, color: 0x111111 });
    // 머리 + 헬멧
    g.rect(x - 0.45, y - 3.2 - bob, 0.9, 0.8).fill({ color: 0xf0c8a0 });
    g.rect(x - 0.55, y - 3.45 - bob, 1.1, 0.4).fill({ color: darken(col, 0.6) });
    // 총
    const gx = x + face * 0.6;
    if (fighting) g.rect(face > 0 ? gx : gx - 1.8, y - 2.0 - bob, 1.8, 0.3).fill({ color: 0x3a3a3a });
    else g.rect(gx - 0.15, y - 2.8 - bob, 0.3, 1.6).fill({ color: 0x3a3a3a });
  }
  private tank(g: Graphics, x: number, y: number, face: number, col: number, dark: number, moving: boolean, t: number) {
    const sh = moving ? Math.sin(t * 20) * 0.1 : 0;
    g.roundRect(x - 3.2, y - 1.2 + sh, 6.4, 1.4, 0.6).fill({ color: 0x2b2b2b });
    g.rect(x - 2.8, y - 2.6 + sh, 5.6, 1.6).fill({ color: col }).stroke({ width: 0.2, color: dark });
    g.rect(x - 1.3, y - 3.6 + sh, 2.6, 1.1).fill({ color: dark });
    g.rect(face > 0 ? x + 1.2 : x - 4.6, y - 3.25 + sh, 3.4, 0.45).fill({ color: 0x333333 });
  }
  private truck(g: Graphics, x: number, y: number, face: number, col: number, dark: number, moving: boolean, t: number) {
    const sh = moving ? Math.sin(t * 18) * 0.12 : 0;
    g.rect(x - 2.6, y - 2.6 + sh, 3.8, 2.0).fill({ color: col }).stroke({ width: 0.2, color: dark });
    g.rect(face > 0 ? x + 1.2 : x - 3.8, y - 2.0 + sh, 1.4, 1.4).fill({ color: dark });
    g.circle(x - 1.7, y - 0.4, 0.55).fill({ color: 0x1a1a1a }); g.circle(x + 1.3, y - 0.4, 0.55).fill({ color: 0x1a1a1a });
  }
  private cannon(g: Graphics, x: number, y: number, face: number, col: number, dark: number) {
    g.circle(x - face * 0.8, y - 0.6, 0.8).fill({ color: 0x3b2a18 });
    g.rect(x - 1.8, y - 1.8, 3.0, 1.0).fill({ color: col }).stroke({ width: 0.15, color: dark });
    const bx = face > 0 ? x + 0.6 : x - 4.4;
    g.rect(bx, y - 2.4, 3.8, 0.55).fill({ color: 0x2f2f2f });
  }
  private boat(g: Graphics, x: number, y: number, face: number, col: number, t: number) {
    const bob = Math.sin(t * 3) * 0.3;
    g.poly([x - 4, y - 1.4 + bob, x + 4, y - 1.4 + bob, x + 3 * face, y + 0.6 + bob, x - 3 * face, y + 0.6 + bob]).fill({ color: 0x5a3a20 });
    g.rect(x - 0.2, y - 5 + bob, 0.4, 3.6).fill({ color: 0x3a2a18 });
    g.poly([x + 0.2, y - 5 + bob, x + 0.2 + 2.6 * face, y - 3.2 + bob, x + 0.2, y - 2 + bob]).fill({ color: col });
    g.ellipse(x - 4.5 * face, y + 0.4, 1.6, 0.4).fill({ color: 0xffffff, alpha: 0.4 });
  }
  private flash(fx: Graphics, x: number, y: number, t: number, seed: number, size: number) {
    const ph = (t * 2.2 + hash(seed, 3)) % 1;
    if (ph < 0.18) fx.circle(x, y, size * (1 - ph * 3)).fill({ color: 0xffe066, alpha: 0.95 });
  }
}

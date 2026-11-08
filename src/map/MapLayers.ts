import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import type { WorldState } from '../types/World';
import type { Selection } from '../systems/GameController';
import { CELL } from './MapRenderer';
import { countryLabelInfo, provinceOutline } from './ProvinceRenderer';
import { cityTier } from '../data/defs';
import { atWar } from '../simulation/WorldHelpers';
import type { MapCamera } from './MapCamera';
import { UnitSprites, FIGURE_ZOOM } from './UnitSprites';

const FONT = 'system-ui, "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif';

export interface UnitStack { province: number; owner: number; divs: number[]; strength: number; x: number; y: number; moving: boolean; battle: boolean; }

/** 지도 위 오버레이: 국가 이름, 도시, 부대, 전투, 선택 */
export class MapLayers {
  root = new Container();
  labels = new Container();
  cities = new Container();
  cityG = new Graphics();
  arrows = new Graphics();
  units = new Container();
  unitG = new Graphics();
  battles = new Container();
  battleG = new Graphics();
  select = new Graphics();
  brush = new Graphics();
  private labelPool = new Map<number, Text>();
  private cityPool: Text[] = [];
  private unitTexts: Text[] = [];
  private battleTexts: Text[] = [];
  stacks: UnitStack[] = [];
  sprites = new UnitSprites();

  constructor() {
    this.cities.addChild(this.cityG);
    this.units.addChild(this.unitG);
    this.battles.addChild(this.battleG);
    this.root.addChild(this.select, this.labels, this.sprites.people, this.cities, this.arrows, this.sprites.g, this.sprites.fx, this.units, this.battles, this.brush);
  }

  updateLabels(w: WorldState, show: boolean) {
    this.labels.visible = show;
    const infos = countryLabelInfo(w);
    const seen = new Set<number>();
    for (const inf of infos) {
      seen.add(inf.id);
      const c = w.countries[inf.id];
      let t = this.labelPool.get(inf.id);
      if (!t) {
        t = new Text({ text: c.shortName, style: new TextStyle({ fontFamily: FONT, fontSize: 48, fontWeight: '800', fill: 0xffffff, stroke: { color: 0x10151c, width: 6, join: 'round' }, letterSpacing: 2 }) });
        t.anchor.set(0.5); t.resolution = 2; t.alpha = 0.8;
        this.labels.addChild(t); this.labelPool.set(inf.id, t);
      }
      if (t.text !== c.shortName) t.text = c.shortName;
      t.position.set(inf.x, inf.y);
      t.scale.set(inf.size / 48);
      t.visible = true;
    }
    for (const [id, t] of this.labelPool) if (!seen.has(id)) t.visible = false;
  }

  updateCities(w: WorldState, cam: MapCamera) {
    const g = this.cityG; g.clear();
    const z = cam.zoom; const inv = 1 / z;
    let ti = 0;
    const capitals = new Set(w.countries.filter(c => c.alive && (z > 1.3 || c.provinceCount >= 3 || w.countries.length < 60)).map(c => c.capital));
    for (const p of w.provinces) {
      if (!p.active) continue;
      const tier = cityTier(p.pop).tier;
      const isCap = capitals.has(p.id);
      if (!isCap && (tier < 4 || z < 1.4) && !(tier >= 5 && z > 0.9)) continue;
      const x = p.cx * CELL, y = p.cy * CELL;
      if (isCap) {
        const r = 5.5 * inv * Math.max(1, Math.min(1.6, z / 2));
        const pts: number[] = [];
        for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5; const rr = k % 2 ? r * 0.45 : r; pts.push(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
        g.poly(pts).fill({ color: 0xffd34d }).stroke({ width: 1.2 * inv, color: 0x2a1c00 });
      } else {
        const s = (tier >= 6 ? 4 : tier >= 5 ? 3.2 : 2.4) * inv;
        g.rect(x - s, y - s, s * 2, s * 2).fill({ color: 0xf2f2f2 }).stroke({ width: 1 * inv, color: 0x111111 });
      }
      if (z > 2.2 || (isCap && z > 1.2)) {
        let t = this.cityPool[ti];
        if (!t) { t = new Text({ text: '', style: new TextStyle({ fontFamily: FONT, fontSize: 12, fontWeight: '600', fill: 0xffffff, stroke: { color: 0x000000, width: 3, join: 'round' } }) }); t.resolution = 2; t.anchor.set(0.5, 0); this.cities.addChild(t); this.cityPool.push(t); }
        if (t.text !== p.name) t.text = p.name;
        t.position.set(x, y + 6 * inv); t.scale.set(inv); t.visible = true; ti++;
      }
    }
    for (let i = ti; i < this.cityPool.length; i++) this.cityPool[i].visible = false;
  }

  /** 부대 스택 계산 & 그리기 */
  updateUnits(w: WorldState, cam: MapCamera, sel: Selection, show: boolean) {
    const g = this.unitG; g.clear();
    const ar = this.arrows; ar.clear();
    this.units.visible = show; ar.visible = show;
    const z = cam.zoom, inv = 1 / z;
    const map = new Map<string, UnitStack>();
    for (const d of w.divisions) {
      const k = d.province + ':' + d.owner;
      let s = map.get(k);
      if (!s) {
        const p = w.provinces[d.province]; if (!p) continue;
        s = { province: d.province, owner: d.owner, divs: [], strength: 0, x: p.cx * CELL, y: p.cy * CELL, moving: false, battle: false };
        map.set(k, s);
      }
      s.divs.push(d.id); s.strength += d.strength;
      if (d.path.length) s.moving = true;
      if (d.battle >= 0) s.battle = true;
    }
    const stacks = [...map.values()];
    // 같은 프로빈스에 여러 국가 → 가로 오프셋
    const perProv = new Map<number, number>();
    const W = 30 * inv, H = 14 * inv;
    for (const s of stacks) {
      const n = perProv.get(s.province) || 0; perProv.set(s.province, n + 1);
      s.x += (n * (W + 2 * inv)) - (n > 0 ? 0 : 0);
      s.y -= 10 * inv;
    }
    this.stacks = stacks;
    const selDivs = sel.kind === 'army' ? new Set(sel.divs) : null;
    // 이동 화살표
    for (const d of w.divisions) {
      if (!d.path.length) continue;
      const mine = w.player < 0 || d.owner === w.player || (selDivs && selDivs.has(d.id));
      if (!mine && z < 1.5) continue;
      const p0 = w.provinces[d.province];
      let px = p0.cx * CELL, py = p0.cy * CELL;
      const col = selDivs && selDivs.has(d.id) ? 0xffffff : 0xffd24a;
      ar.moveTo(px, py);
      for (const q of d.path.slice(0, 12)) { const Q = w.provinces[q]; px = Q.cx * CELL; py = Q.cy * CELL; ar.lineTo(px, py); }
      ar.stroke({ width: 2 * inv, color: col, alpha: 0.85 });
      ar.circle(px, py, 3 * inv).fill({ color: col });
    }
    let ti = 0;
    const compact = z < 0.85;
    const figures = z >= FIGURE_ZOOM;
    const showText = !compact;
    for (const s of stacks) {
      if (z < 0.55 && s.owner !== w.player && !s.battle && !(selDivs && s.divs.some(id => selDivs.has(id)))) continue;
      if (compact) {
        // 축소 시: 작은 표식만
        const c = w.countries[s.owner];
        const sz = (s.divs.length > 2 ? 7 : 5) * inv;
        const selected = !!selDivs && s.divs.some(id => selDivs.has(id));
        g.rect(s.x - sz / 2, s.y - sz / 2, sz, sz).fill({ color: c.color }).stroke({ width: (selected ? 2 : 1) * inv, color: selected ? 0xffffff : s.battle ? 0xff3030 : 0x000000 });
        continue;
      }
      if (s.x * z + cam.x < -40 || s.y * z + cam.y < -40 || s.x * z + cam.x > cam.viewW + 40 || s.y * z + cam.y > cam.viewH + 40) continue;
      if (figures) {
        // 확대 시: 병사 그림 위에 작은 병력 표시만
        if (s.battle) continue;
        const c2 = w.countries[s.owner];
        let t2 = this.unitTexts[ti];
        if (!t2) { t2 = new Text({ text: '', style: new TextStyle({ fontFamily: FONT, fontSize: 10, fontWeight: '700', fill: 0xffffff }) }); t2.resolution = 2; t2.anchor.set(0, 0.5); this.units.addChild(t2); this.unitTexts.push(t2); }
        const lb = `${Math.round(s.strength / 1000)}k`;
        if (t2.text !== lb) t2.text = lb;
        const yy = s.y - 6 * inv - 4;
        g.roundRect(s.x - 9 * inv, yy - 5 * inv, 18 * inv, 10 * inv, 2 * inv).fill({ color: 0x141a22, alpha: 0.75 });
        g.rect(s.x - 9 * inv, yy - 5 * inv, 3 * inv, 10 * inv).fill({ color: c2.color });
        t2.position.set(s.x - 5 * inv, yy); t2.scale.set(inv * 0.85); t2.visible = true; ti++;
        continue;
      }
      const c = w.countries[s.owner];
      const selected = !!selDivs && s.divs.some(id => selDivs.has(id));
      const hostile = w.player >= 0 && atWar(w, w.player, s.owner);
      const x = s.x - W / 2, y = s.y - H / 2;
      g.roundRect(x, y, W, H, 2 * inv).fill({ color: 0x141a22, alpha: 0.92 }).stroke({ width: (selected ? 2 : 1) * inv, color: selected ? 0xffffff : hostile ? 0xff4040 : s.owner === w.player ? 0xffd24a : 0x000000 });
      g.rect(x + 1 * inv, y + 1 * inv, 8 * inv, H - 2 * inv).fill({ color: c.color });
      if (s.battle) g.rect(x + W - 4 * inv, y + 1 * inv, 3 * inv, H - 2 * inv).fill({ color: 0xff3030 });
      else if (s.moving) g.rect(x + W - 4 * inv, y + 1 * inv, 3 * inv, H - 2 * inv).fill({ color: 0x40d0ff });
      if (showText) {
        let t = this.unitTexts[ti];
        if (!t) { t = new Text({ text: '', style: new TextStyle({ fontFamily: FONT, fontSize: 10, fontWeight: '700', fill: 0xffffff }) }); t.resolution = 2; t.anchor.set(0, 0.5); this.units.addChild(t); this.unitTexts.push(t); }
        const label = s.divs.length > 1 ? `${s.divs.length}·${Math.round(s.strength / 1000)}k` : `${Math.round(s.strength / 1000)}k`;
        if (t.text !== label) t.text = label;
        t.position.set(x + 10.5 * inv, s.y); t.scale.set(inv * 0.95); t.visible = true; ti++;
      }
    }
    for (let i = ti; i < this.unitTexts.length; i++) this.unitTexts[i].visible = false;
  }

  updateBattles(w: WorldState, cam: MapCamera, t: number) {
    const g = this.battleG; g.clear();
    const inv = 1 / cam.zoom;
    let ti = 0;
    for (const b of w.battles) {
      const p = w.provinces[b.province];
      const x = p.cx * CELL, y = p.cy * CELL + 8 * inv;
      const pulse = 1 + Math.sin(t * 6 + b.id) * 0.15;
      g.circle(x, y, 8 * inv * pulse).fill({ color: 0xb01818, alpha: 0.9 }).stroke({ width: 1.5 * inv, color: 0xffd0a0 });
      let tx = this.battleTexts[ti];
      if (!tx) { tx = new Text({ text: '⚔', style: new TextStyle({ fontFamily: FONT, fontSize: 12, fill: 0xffffff }) }); tx.anchor.set(0.5); tx.resolution = 2; this.battles.addChild(tx); this.battleTexts.push(tx); }
      tx.position.set(x, y); tx.scale.set(inv * pulse); tx.visible = true; ti++;
    }
    for (let i = ti; i < this.battleTexts.length; i++) this.battleTexts[i].visible = false;
  }

  updateSelection(w: WorldState, sel: Selection, cam: MapCamera) {
    const g = this.select; g.clear();
    let pids: Set<number> | null = null; let color = 0xffffff;
    if (sel.kind === 'province') pids = new Set([sel.id]);
    else if (sel.kind === 'army') { pids = new Set([sel.province]); color = 0x9fe0ff; }
    else if (sel.kind === 'battle') { const b = w.battles.find(x => x.id === sel.id); if (b) { pids = new Set([b.province]); color = 0xff6060; } }
    if (!pids) return;
    const segs = provinceOutline(w, pids);
    const inv = 1 / cam.zoom;
    for (let i = 0; i < segs.length; i += 4) g.moveTo(segs[i], segs[i + 1]).lineTo(segs[i + 2], segs[i + 3]);
    g.stroke({ width: 2.5 * inv, color, alpha: 0.95 });
  }

  drawBrush(x: number, y: number, r: number, cam: MapCamera, visible: boolean) {
    const g = this.brush; g.clear();
    if (!visible) return;
    g.circle(x, y, r * CELL).stroke({ width: 1.5 / cam.zoom, color: 0xffffff, alpha: 0.9 });
  }
}

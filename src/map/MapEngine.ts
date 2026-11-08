import { Application, Container, Sprite, Texture } from 'pixi.js';
import { game } from '../systems/GameController';
import { MapRenderer, CELL, type RenderOpts } from './MapRenderer';
import { MapCamera } from './MapCamera';
import { MapLayers, type UnitStack } from './MapLayers';

export interface MapClick { province: number; stack: UnitStack | null; battle: number; button: number; cellX: number; cellY: number; }
export interface MapCallbacks {
  onClick: (c: MapClick) => void;
  onPaint: (cellX: number, cellY: number, first: boolean) => boolean; // true = 브러시 도구 사용 중
  onHover: (province: number, sx: number, sy: number) => void;
}

/** PixiJS 기반 세계 지도 엔진 */
export class MapEngine {
  app = new Application();
  world = new Container();
  sprite: Sprite | null = null;
  tex: Texture | null = null;
  renderer: MapRenderer | null = null;
  cam = new MapCamera();
  layers = new MapLayers();
  private el: HTMLElement;
  private cb: MapCallbacks;
  private ready = false;
  private destroyed = false;
  private seenTerrain = -1; private seenMap = -1;
  private lastOpts = '';
  private lastPixel = 0; private lastLabels = 0; private lastOverlay = 0; private labelsDirty = true;
  private lastMonth = -1;
  private camKey = '';
  private pointers = new Map<number, { x: number; y: number; sx: number; sy: number; button: number }>();
  private dragging = false; private painting = false; private pinchDist = 0;
  private hoverCell = { x: -1, y: -1 };
  private ro: ResizeObserver | null = null;

  constructor(el: HTMLElement, cb: MapCallbacks) { this.el = el; this.cb = cb; }

  async init() {
    await this.app.init({ background: 0x0a1424, resizeTo: this.el, antialias: true, autoDensity: true, resolution: Math.min(2, window.devicePixelRatio || 1), preference: 'webgl' });
    if (this.destroyed) { this.app.destroy(true); return; }
    this.el.appendChild(this.app.canvas);
    this.app.canvas.style.touchAction = 'none';
    this.app.stage.addChild(this.world);
    this.world.addChild(this.layers.root);
    this.bindInput();
    this.ro = new ResizeObserver(() => this.onResize()); this.ro.observe(this.el);
    this.onResize();
    this.ready = true;
    this.app.ticker.add(() => this.update());
  }

  destroy() {
    this.destroyed = true;
    this.ro?.disconnect();
    if (this.ready) this.app.destroy(true, { children: true, texture: true });
  }

  private onResize() {
    const r = this.el.getBoundingClientRect();
    this.cam.setView(r.width, r.height);
  }

  focusProvince(pid: number, zoom?: number) {
    const w = game.world; if (!w) return;
    const p = w.provinces[pid]; if (!p) return;
    this.cam.centerOn(p.cx * CELL, p.cy * CELL, zoom ?? Math.max(this.cam.zoom, 2));
  }
  zoomBy(f: number) { this.cam.zoomAt(this.cam.viewW / 2, this.cam.viewH / 2, f); }
  fit() { this.cam.fit(); }

  private opts(): RenderOpts {
    const w = game.world!; const s = game.selection;
    const selCountry = s.kind === 'country' ? s.id : s.kind === 'province' ? w.provinces[s.id]?.owner ?? -1 : -1;
    return {
      mode: game.mapMode,
      focus: w.player >= 0 ? w.player : selCountry,
      highlight: s.kind === 'country' ? s.id : -1,
      provinceBorders: game.settings.showProvinceBorders,
    };
  }

  private update() {
    const w = game.world;
    if (!w || !this.ready) return;
    const now = performance.now();
    if (game.terrainVersion !== this.seenTerrain) {
      this.seenTerrain = game.terrainVersion;
      const sizeChanged = !this.renderer || this.renderer.W !== w.width || this.renderer.H !== w.height;
      if (sizeChanged) {
        // 새 캔버스와 텍스처 (세계 크기가 바뀐 경우)
        this.renderer = new MapRenderer(w);
        this.renderer.prepareTerrain(w);
        this.renderer.render(w, this.opts());
        const old = this.tex;
        this.tex = Texture.from({ resource: this.renderer.canvas, scaleMode: 'nearest' } as any);
        if (!this.sprite) { this.sprite = new Sprite(this.tex); this.world.addChildAt(this.sprite, 0); }
        else this.sprite.texture = this.tex;
        old?.destroy(false);
        this.cam.worldW = 1;
      } else {
        this.renderer!.prepareTerrain(w);
        this.renderer!.render(w, this.opts());
      }
      this.tex!.source.update();
      const first = this.cam.worldW === 1;
      this.cam.setWorld(w.width * CELL, w.height * CELL);
      if (first) this.cam.fit();
      this.lastOpts = JSON.stringify(this.opts());
      this.labelsDirty = true; this.seenMap = -1;
    }
    const r = this.renderer!;
    const mapChanged = game.mapVersion !== this.seenMap;
    if (mapChanged && now - this.lastPixel > 120) {
      this.seenMap = game.mapVersion;
      this.lastPixel = now;
      const o = this.opts(); const key = JSON.stringify(o);
      const month = Math.floor(w.day / 30);
      const dataMode = o.mode !== 'political' && o.mode !== 'terrain';
      if (key !== this.lastOpts || (dataMode && month !== this.lastMonth)) {
        this.lastOpts = key; this.lastMonth = month;
        r.render(w, o);
        this.tex!.source.update();
        this.labelsDirty = true;
      } else {
        const ch = r.changedProvinces(w);
        if (ch.length) {
          // 국경이 바뀌면 이웃 프로빈스도 다시 그림
          const set = new Set(ch); for (const p of ch) for (const n of w.provinces[p].neighbors) set.add(n);
          if (set.size > 160) r.render(w, o); else r.render(w, o, [...set]);
          this.tex!.source.update();
          this.labelsDirty = true;
        }
      }
      this.overlayDirty = true;
    }
    // 카메라 적용
    this.world.position.set(this.cam.x, this.cam.y);
    this.world.scale.set(this.cam.zoom);
    const ck = `${this.cam.zoom.toFixed(3)}`;
    if (ck !== this.camKey) { this.camKey = ck; this.overlayDirty = true; }
    const camMoved = `${Math.round(this.cam.x)},${Math.round(this.cam.y)}`;
    if (camMoved !== this.camPos) { this.camPos = camMoved; this.overlayDirty = true; }
    if (this.labelsDirty && now - this.lastLabels > 500) {
      this.labelsDirty = false; this.lastLabels = now;
      this.layers.updateLabels(w, game.settings.showLabels);
    }
    if (this.overlayDirty && now - this.lastOverlay > 50) {
      this.overlayDirty = false; this.lastOverlay = now;
      this.layers.updateCities(w, this.cam);
      this.layers.updateUnits(w, this.cam, game.selection, game.settings.showUnits);
      this.layers.updateSelection(w, game.selection, this.cam);
    }
    this.layers.updateBattles(w, this.cam, now / 1000);
    this.layers.sprites.update(w, this.cam, now / 1000, game.selection, game.settings.showUnits);
    const t = game.tool;
    this.layers.drawBrush((this.hoverCell.x + 0.5) * CELL, (this.hoverCell.y + 0.5) * CELL, t.kind === 'terrain' ? t.radius : 0, this.cam, t.kind === 'terrain' && this.hoverCell.x >= 0);
  }
  private overlayDirty = true;
  private camPos = '';

  // ───── 입력 ─────
  private local(e: PointerEvent | WheelEvent | MouseEvent) {
    const r = this.app.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  private cellAt(sx: number, sy: number) {
    const p = this.cam.toWorld(sx, sy);
    return { x: Math.floor(p.x / CELL), y: Math.floor(p.y / CELL) };
  }
  private provinceAt(sx: number, sy: number) {
    const w = game.world!; const c = this.cellAt(sx, sy);
    if (c.x < 0 || c.y < 0 || c.x >= w.width || c.y >= w.height) return -1;
    return w.cellProv[c.y * w.width + c.x];
  }
  private stackAt(sx: number, sy: number): UnitStack | null {
    if (!game.settings.showUnits) return null;
    const z = this.cam.zoom;
    let best: UnitStack | null = null, bd = 18;
    const compact = z < 0.85; const fig = z >= 1.6;
    for (const s of this.layers.stacks) {
      const p = this.cam.toScreen(s.x, s.y);
      const dx = Math.abs(p.x - sx), dy = Math.abs(p.y - sy);
      if (fig ? (dx < 24 && Math.abs(p.y + 10 - sy) < 22) : compact ? (dx < 7 && dy < 7) : (dx < 17 && dy < 10)) { const d = dx + dy; if (d < bd) { bd = d; best = s; } }
    }
    void z;
    return best;
  }
  private battleAt(sx: number, sy: number) {
    const w = game.world!;
    for (const b of w.battles) {
      const p = w.provinces[b.province];
      const s = this.cam.toScreen(p.cx * CELL, p.cy * CELL + 8 / this.cam.zoom);
      if (Math.hypot(s.x - sx, s.y - sy) < 11) return b.id;
    }
    return -1;
  }

  private bindInput() {
    const cv = this.app.canvas;
    cv.addEventListener('contextmenu', e => e.preventDefault());
    cv.addEventListener('pointerdown', e => {
      cv.setPointerCapture(e.pointerId);
      const p = this.local(e);
      this.pointers.set(e.pointerId, { x: p.x, y: p.y, sx: p.x, sy: p.y, button: e.button });
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        this.pinchDist = Math.hypot(a.x - b.x, a.y - b.y); this.dragging = true; this.painting = false;
      } else if (this.pointers.size === 1) {
        this.dragging = false;
        if (e.button === 0) {
          const c = this.cellAt(p.x, p.y);
          this.painting = this.cb.onPaint(c.x, c.y, true);
        }
      }
    });
    cv.addEventListener('pointermove', e => {
      const p = this.local(e);
      const c = this.cellAt(p.x, p.y); this.hoverCell = c;
      const pt = this.pointers.get(e.pointerId);
      if (!pt) { this.cb.onHover(this.provinceAt(p.x, p.y), p.x, p.y); return; }
      if (this.pointers.size === 2) {
        pt.x = p.x; pt.y = p.y;
        const [a, b] = [...this.pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        if (this.pinchDist > 0) this.cam.zoomAt(mx, my, d / this.pinchDist);
        this.pinchDist = d;
        return;
      }
      const dx = p.x - pt.x, dy = p.y - pt.y;
      if (this.painting) { this.cb.onPaint(c.x, c.y, false); pt.x = p.x; pt.y = p.y; return; }
      if (!this.dragging && Math.hypot(p.x - pt.sx, p.y - pt.sy) > 6) this.dragging = true;
      if (this.dragging) this.cam.pan(dx, dy);
      pt.x = p.x; pt.y = p.y;
    });
    const up = (e: PointerEvent) => {
      const pt = this.pointers.get(e.pointerId);
      this.pointers.delete(e.pointerId);
      if (!pt) return;
      if (this.pointers.size > 0) return;
      if (!this.dragging && !this.painting) {
        const p = this.local(e);
        const c = this.cellAt(p.x, p.y);
        this.cb.onClick({ province: this.provinceAt(p.x, p.y), stack: this.stackAt(p.x, p.y), battle: this.battleAt(p.x, p.y), button: pt.button, cellX: c.x, cellY: c.y });
      }
      this.dragging = false; this.painting = false; this.pinchDist = 0;
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', e => { this.pointers.delete(e.pointerId); this.dragging = false; this.painting = false; });
    cv.addEventListener('pointerleave', () => { this.hoverCell = { x: -1, y: -1 }; this.cb.onHover(-1, 0, 0); });
    cv.addEventListener('wheel', e => {
      e.preventDefault();
      const p = this.local(e);
      this.cam.zoomAt(p.x, p.y, Math.exp(-e.deltaY * 0.0015));
    }, { passive: false });
  }
}

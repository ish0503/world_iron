/** 지도 카메라: 이동, 확대/축소, 화면↔월드 좌표 변환 */
export class MapCamera {
  x = 0; y = 0; zoom = 1;
  minZoom = 0.2; maxZoom = 14;
  viewW = 1; viewH = 1;
  worldW = 1; worldH = 1;

  setView(w: number, h: number) { this.viewW = w; this.viewH = h; this.updateMin(); this.clamp(); }
  setWorld(w: number, h: number) { this.worldW = w; this.worldH = h; this.updateMin(); }
  private updateMin() { this.minZoom = Math.min(this.viewW / this.worldW, this.viewH / this.worldH) * 0.9; }
  fit() { this.zoom = Math.min(this.viewW / this.worldW, this.viewH / this.worldH) * 1.0; this.x = (this.viewW - this.worldW * this.zoom) / 2; this.y = (this.viewH - this.worldH * this.zoom) / 2; }
  toWorld(sx: number, sy: number) { return { x: (sx - this.x) / this.zoom, y: (sy - this.y) / this.zoom }; }
  toScreen(wx: number, wy: number) { return { x: wx * this.zoom + this.x, y: wy * this.zoom + this.y }; }
  pan(dx: number, dy: number) { this.x += dx; this.y += dy; this.clamp(); }
  zoomAt(sx: number, sy: number, factor: number) {
    const nz = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom * factor));
    const k = nz / this.zoom;
    this.x = sx - (sx - this.x) * k; this.y = sy - (sy - this.y) * k; this.zoom = nz;
    this.clamp();
  }
  centerOn(wx: number, wy: number, zoom?: number) {
    if (zoom) this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, zoom));
    this.x = this.viewW / 2 - wx * this.zoom; this.y = this.viewH / 2 - wy * this.zoom; this.clamp();
  }
  clamp() {
    const mw = this.worldW * this.zoom, mh = this.worldH * this.zoom;
    const padX = this.viewW * 0.5, padY = this.viewH * 0.5;
    if (mw + padX * 2 <= this.viewW) this.x = (this.viewW - mw) / 2; else this.x = Math.min(padX, Math.max(this.viewW - mw - padX, this.x));
    if (mh + padY * 2 <= this.viewH) this.y = (this.viewH - mh) / 2; else this.y = Math.min(padY, Math.max(this.viewH - mh - padY, this.y));
  }
}

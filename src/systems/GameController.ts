import type { WorldState, GameMode } from '../types/World';
import type { GenOptions } from '../simulation/WorldGen';
import { generateWorld } from '../simulation/WorldGen';
import { setupWorld, stepDay, bindRng } from '../simulation/SimulationEngine';
import { TimeManager } from '../simulation/TimeManager';
import { onLog } from '../simulation/WorldHelpers';
import { clearSupplyCache } from '../simulation/MilitarySimulation';
import { countryStats } from '../simulation/CountryOps';
import { dateOf } from '../simulation/Calendar';
import { autoSave } from './SaveSystem';
import { loadSettings, saveSettings, type Settings } from './DataManager';
import { pushToast } from './EventManager';

export type MapMode =
  | 'political' | 'terrain' | 'population' | 'economy' | 'military' | 'diplomacy'
  | 'religion' | 'culture' | 'climate' | 'tech' | 'government' | 'resource' | 'supply' | 'unrest';

export type Selection =
  | { kind: 'none' }
  | { kind: 'province'; id: number }
  | { kind: 'country'; id: number }
  | { kind: 'army'; province: number; owner: number; divs: number[] }
  | { kind: 'battle'; id: number };

export type Tool =
  | { kind: 'select' }
  | { kind: 'move' }
  | { kind: 'terrain'; brush: number | 'river' | 'unriver'; radius: number }
  | { kind: 'assign'; country: number }
  | { kind: 'god'; action: string; arg?: any }
  | { kind: 'pickCountry' };

type Listener = () => void;

/** 시뮬레이션 루프, 선택 상태, UI 구독을 관리하는 중앙 컨트롤러 */
export class GameController {
  world: WorldState | null = null;
  time = new TimeManager();
  mapMode: MapMode = 'political';
  selection: Selection = { kind: 'none' };
  tool: Tool = { kind: 'select' };
  settings: Settings = loadSettings();
  version = 0;
  mapVersion = 0;          // 지도 전체 재렌더 필요
  terrainVersion = 0;      // 지형 변경
  private listeners = new Set<Listener>();
  private raf = 0;
  private last = 0;
  private uiAcc = 0;
  private lastAutosaveMonth = -1;
  perf = { dayMs: 0, days: 0 };
  busy: { msg: string; p: number } | null = null;

  constructor() {
    onLog((text, type, c) => {
      const w = this.world; if (!w) return;
      const mine = w.player >= 0 && c === w.player;
      if (type === 'major' || mine) pushToast(text, type, c);
    });
  }

  subscribe(l: Listener) { this.listeners.add(l); return () => { this.listeners.delete(l); }; }
  emit() { this.version++; this.listeners.forEach(l => l()); }

  updateSettings(p: Partial<Settings>) { this.settings = { ...this.settings, ...p }; saveSettings(this.settings); this.mapVersion++; this.emit(); }

  // ───── 월드 생성/로드 ─────
  generate(opt: GenOptions): Promise<WorldState> {
    this.busy = { msg: '세계 생성 중...', p: 0 }; this.emit();
    return new Promise((resolve, reject) => {
      let worker: Worker | null = null;
      try { worker = new Worker(new URL('../workers/SimulationWorker.ts', import.meta.url), { type: 'module' }); } catch { worker = null; }
      const finish = (w: WorldState) => { worker?.terminate(); this.busy = null; this.setWorld(w); resolve(w); };
      if (!worker) {
        // 워커 미지원 환경: 메인 스레드에서 생성
        setTimeout(() => { try { const w = generateWorld(opt); setupWorld(w); finish(w); } catch (e) { this.busy = null; this.emit(); reject(e); } }, 30);
        return;
      }
      worker.onmessage = (e) => {
        const m = e.data;
        if (m.type === 'progress') { this.busy = { msg: m.msg, p: m.p }; this.emit(); }
        else if (m.type === 'done') finish(m.world);
        else if (m.type === 'error') { worker?.terminate(); this.busy = null; this.emit(); reject(new Error(m.error)); }
      };
      worker.onerror = () => {
        worker?.terminate(); worker = null;
        try { const w = generateWorld(opt); setupWorld(w); finish(w); } catch (e) { this.busy = null; this.emit(); reject(e); }
      };
      worker.postMessage({ type: 'generate', opt });
    });
  }

  /** 워커에서 세계사 빨리 감기 */
  fastForward(years: number): Promise<void> {
    const w = this.world; if (!w || this.busy) return Promise.resolve();
    this.time.setSpeed(0);
    this.busy = { msg: '역사 진행 중...', p: 0 }; this.emit();
    return new Promise((resolve) => {
      const worker = new Worker(new URL('../workers/SimulationWorker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (e) => {
        const m = e.data;
        if (m.type === 'progress') { this.busy = { msg: m.msg, p: m.p }; this.emit(); }
        else if (m.type === 'done') {
          worker.terminate(); this.busy = null;
          const keepPlayer = w.player, mode = w.mode;
          this.setWorld(m.world);
          this.world!.player = keepPlayer; this.world!.mode = mode;
          if (keepPlayer >= 0 && !this.world!.countries[keepPlayer]?.alive) { this.world!.player = -1; this.world!.mode = 'observer'; }
          pushToast(`${years}년의 역사가 흘렀습니다`, 'major');
          resolve();
        } else if (m.type === 'error') { worker.terminate(); this.busy = null; this.emit(); pushToast('빨리 감기 실패', 'war'); resolve(); }
      };
      worker.postMessage({ type: 'fastforward', world: w, days: years * 365 });
    });
  }

  setWorld(w: WorldState) {
    this.world = w;
    bindRng(w);
    clearSupplyCache();
    countryStats(w);
    this.selection = { kind: 'none' };
    this.tool = { kind: 'select' };
    this.lastAutosaveMonth = Math.floor(w.day / 30.4);
    this.mapVersion++; this.terrainVersion++;
    this.emit();
  }

  setMode(mode: GameMode, player = -1) {
    const w = this.world; if (!w) return;
    w.mode = mode;
    w.player = mode === 'ruler' ? player : -1;
    for (const d of w.divisions) d.aiControlled = d.owner !== w.player;
    if (mode !== 'editor' && this.tool.kind === 'terrain') this.tool = { kind: 'select' };
    this.mapVersion++;
    this.emit();
  }

  select(s: Selection) { this.selection = s; this.mapVersion++; this.emit(); }
  setTool(t: Tool) { this.tool = t; this.emit(); }
  setMapMode(m: MapMode) { this.mapMode = m; this.mapVersion++; this.emit(); }

  // ───── 루프 ─────
  start() {
    if (this.raf) return;
    this.last = performance.now();
    const loop = (t: number) => {
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.25, (t - this.last) / 1000); this.last = t;
      this.tick(dt);
    };
    this.raf = requestAnimationFrame(loop);
  }
  stop() { cancelAnimationFrame(this.raf); this.raf = 0; }

  private tick(dt: number) {
    const w = this.world; if (!w || this.busy) return;
    const editor = w.mode === 'editor';
    const days = editor ? 0 : this.time.advance(dt);
    if (days > 0) {
      const t0 = performance.now();
      for (let i = 0; i < days; i++) {
        stepDay(w);
        this.afterDay(w);
      }
      const el = performance.now() - t0;
      this.perf.dayMs = this.perf.dayMs * 0.9 + (el / days) * 0.1; this.perf.days += days;
      this.mapVersion++;
    }
    this.uiAcc += dt;
    if (this.uiAcc > 0.2 && (days > 0 || this.uiAcc > 1)) { this.uiAcc = 0; this.emit(); }
  }

  private afterDay(w: WorldState) {
    // 선택 유효성
    const s = this.selection;
    if (s.kind === 'army') {
      const divs = s.divs.filter(id => w.divisions.some(d => d.id === id));
      if (!divs.length) this.selection = { kind: 'none' };
      else {
        const first = w.divisions.find(d => d.id === divs[0])!;
        this.selection = { kind: 'army', province: first.province, owner: first.owner, divs };
      }
    } else if (s.kind === 'battle' && !w.battles.some(b => b.id === s.id)) this.selection = { kind: 'none' };
    // 플레이어 국가 멸망
    if (w.mode === 'ruler' && w.player >= 0 && !w.countries[w.player].alive) {
      pushToast(`${w.countries[w.player].name}이(가) 멸망했습니다. 관찰 모드로 전환합니다.`, 'major');
      w.mode = 'observer'; w.player = -1; this.time.setSpeed(0);
    }
    // 플레이어에게 온 제안 → 일시정지
    const fresh = w.mode === 'ruler' ? w.offers.filter(o => o.to === w.player && !(o as any).seen) : [];
    if (fresh.length) {
      for (const o of fresh) (o as any).seen = true;
      if (fresh.some(o => o.kind === 'peace' || o.kind === 'ultimatum' || o.kind === 'vassal' || o.kind === 'alliance')) this.time.setSpeed(0);
      pushToast(`${w.countries[fresh[0].from].shortName}의 외교 제안이 도착했습니다`, 'diplomacy');
    }
    // 자동 저장
    const m = this.settings.autosaveMonths;
    if (m > 0) {
      const d = dateOf(w.startYear, w.day);
      const idx = (d.year - w.startYear) * 12 + d.month - 1;
      if (d.day === 1 && idx - this.lastAutosaveMonth >= m) {
        this.lastAutosaveMonth = idx;
        autoSave(w).then(() => pushToast('자동 저장 완료', 'save')).catch(() => pushToast('자동 저장 실패', 'war'));
      }
    }
  }

  /** 즉시 하루 진행 (디버그/테스트) */
  stepOnce() { if (this.world) { stepDay(this.world); this.afterDay(this.world); this.mapVersion++; this.emit(); } }
}

export const game = new GameController();
(globalThis as any).__game = game;

/// <reference lib="webworker" />
import { generateWorld, type GenOptions } from '../simulation/WorldGen';
import { setupWorld, stepDay } from '../simulation/SimulationEngine';
import type { WorldState } from '../types/World';

/**
 * 무거운 계산을 메인 스레드에서 분리:
 *  - generate: 지형·프로빈스·국가 생성
 *  - fastforward: 세계사 빨리 감기 (수십 년 단위)
 */
type Msg = { type: 'generate'; opt: GenOptions } | { type: 'fastforward'; world: WorldState; days: number };

self.onmessage = (e: MessageEvent<Msg>) => {
  const m = e.data;
  try {
    if (m.type === 'generate') {
      const w = generateWorld(m.opt, (p, msg) => self.postMessage({ type: 'progress', p, msg }));
      self.postMessage({ type: 'progress', p: 0.95, msg: '국가 초기화 중...' });
      setupWorld(w);
      self.postMessage({ type: 'done', world: w });
    } else if (m.type === 'fastforward') {
      const w = m.world;
      for (let d = 0; d < m.days; d++) {
        stepDay(w);
        if (d % 30 === 0) self.postMessage({ type: 'progress', p: d / m.days, msg: `${Math.floor(d / 365)}년 경과...` });
      }
      self.postMessage({ type: 'done', world: w });
    }
  } catch (err) {
    self.postMessage({ type: 'error', error: String((err as Error)?.stack || err) });
  }
};

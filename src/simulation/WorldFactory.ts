import type { WorldState } from '../types/World';
import { generateWorld, type GenOptions } from './WorldGen';
import { generateRealWorld } from './RealWorld';
import { setupWorld } from './SimulationEngine';

export interface CreateOptions extends GenOptions { real?: boolean; density?: number; }

/** 무작위 세계 또는 실제 세계 생성 + 초기화 */
export function createWorld(opt: CreateOptions, progress?: (p: number, msg: string) => void): WorldState {
  const w = opt.real
    ? generateRealWorld({ seed: opt.seed, density: opt.density ?? 1, name: opt.name }, progress)
    : generateWorld(opt, progress);
  progress?.(0.92, '국가 초기화 중...');
  setupWorld(w);
  return w;
}

import { useSyncExternalStore } from 'react';
import { game } from '../systems/GameController';
import { ui } from '../systems/UIStore';

/** 게임 상태 변경 시 리렌더 (약 5Hz) */
export function useGame() {
  useSyncExternalStore(cb => game.subscribe(cb), () => game.version);
  return game;
}
export function useUI() {
  return useSyncExternalStore(cb => ui.subscribe(cb), () => ui.state);
}

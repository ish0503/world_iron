import type { MapEngine } from '../map/MapEngine';

export type PanelId =
  | 'country' | 'politics' | 'economy' | 'diplomacy' | 'military' | 'research' | 'construction' | 'info' | 'history' | 'god' | 'editor' | 'wars';
export type ModalId = null | 'save' | 'settings' | 'help' | 'peace' | 'modeSelect' | 'menu' | 'fastforward';

export interface UIState {
  panel: PanelId | null;
  modal: ModalId;
  peaceWar: number;
  rightOpen: boolean;
  mobileLeft: boolean;
  eventLogOpen: boolean;
}

class UIStore {
  state: UIState = { panel: null, modal: null, peaceWar: -1, rightOpen: true, mobileLeft: false, eventLogOpen: false };
  map: MapEngine | null = null;
  private subs = new Set<() => void>();
  subscribe(f: () => void) { this.subs.add(f); return () => { this.subs.delete(f); }; }
  set(p: Partial<UIState>) { this.state = { ...this.state, ...p }; this.subs.forEach(f => f()); }
  togglePanel(id: PanelId) { this.set({ panel: this.state.panel === id ? null : id, mobileLeft: false }); }
}
export const ui = new UIStore();

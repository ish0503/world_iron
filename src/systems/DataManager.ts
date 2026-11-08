/** 사용자 설정 (브라우저 로컬) */
export interface Settings {
  autosaveMonths: number;   // 0 = 끔
  showProvinceBorders: boolean;
  showLabels: boolean;
  showUnits: boolean;
  notifyMajorOnly: boolean;
  /** 알림 수준: all 전체 · major 주요 · mine 내 국가+세계대전 · off 끔 */
  notify: 'all' | 'major' | 'mine' | 'off';
  uiScale: number;
}
const DEFAULTS: Settings = { autosaveMonths: 6, showProvinceBorders: true, showLabels: true, showUnits: true, notifyMajorOnly: false, uiScale: 1, notify: (typeof window !== 'undefined' && window.innerWidth < 760) ? 'mine' : 'major' };
const KEY = 'world-dominion-settings';

export function loadSettings(): Settings {
  try { const s = localStorage.getItem(KEY); if (s) return { ...DEFAULTS, ...JSON.parse(s) }; } catch { /* 무시 */ }
  return { ...DEFAULTS };
}
export function saveSettings(s: Settings) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* 무시 */ } }

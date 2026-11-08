/** 사용자 설정 (브라우저 로컬) */
export interface Settings {
  autosaveMonths: number;   // 0 = 끔
  showProvinceBorders: boolean;
  showLabels: boolean;
  showUnits: boolean;
  notifyMajorOnly: boolean;
  uiScale: number;
}
const DEFAULTS: Settings = { autosaveMonths: 6, showProvinceBorders: true, showLabels: true, showUnits: true, notifyMajorOnly: false, uiScale: 1 };
const KEY = 'world-dominion-settings';

export function loadSettings(): Settings {
  try { const s = localStorage.getItem(KEY); if (s) return { ...DEFAULTS, ...JSON.parse(s) }; } catch { /* 무시 */ }
  return { ...DEFAULTS };
}
export function saveSettings(s: Settings) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* 무시 */ } }

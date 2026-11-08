import { useGame, useUI } from '../hooks/useGame';
import { ui, type PanelId } from '../systems/UIStore';
import { CountryPanel } from './CountryPanel';
import { PoliticsPanel } from './PoliticsPanel';
import { EconomyPanel } from './EconomyPanel';
import { DiplomacyPanel } from './DiplomacyPanel';
import { MilitaryPanel } from './MilitaryPanel';
import { ResearchPanel } from './ResearchPanel';
import { ConstructionPanel } from './ConstructionPanel';
import { InfoPanel, WarsPanel } from './InfoPanel';
import { HistoryPanel } from './HistoryPanel';
import { GodPanel } from './GodPanel';
import { EditorPanel } from './EditorPanel';

const NAV: { id: PanelId; name: string; icon: string; modes?: string[] }[] = [
  { id: 'country', name: '국가', icon: '🏛' },
  { id: 'politics', name: '정치', icon: '🗳' },
  { id: 'economy', name: '경제', icon: '💰' },
  { id: 'diplomacy', name: '외교', icon: '🤝' },
  { id: 'military', name: '군사', icon: '⚔' },
  { id: 'research', name: '연구', icon: '🔬' },
  { id: 'construction', name: '건설', icon: '🏗' },
  { id: 'wars', name: '전쟁', icon: '🔥' },
  { id: 'info', name: '정보', icon: '📊' },
  { id: 'history', name: '기록', icon: '📜' },
  { id: 'god', name: '신', icon: '⚡', modes: ['god'] },
  { id: 'editor', name: '편집', icon: '✏', modes: ['editor'] },
];

const PANELS: Record<PanelId, () => React.ReactElement> = {
  country: CountryPanel, politics: PoliticsPanel, economy: EconomyPanel, diplomacy: DiplomacyPanel, military: MilitaryPanel,
  research: ResearchPanel, construction: ConstructionPanel, info: InfoPanel, history: HistoryPanel, god: GodPanel, editor: EditorPanel, wars: WarsPanel,
};
const TITLES: Record<PanelId, string> = { country: '국가 개요', politics: '정치', economy: '경제', diplomacy: '외교', military: '군사', research: '기술 연구', construction: '건설', info: '세계 정보', history: '세계 역사 기록', god: '신의 권능', editor: '세계 편집기', wars: '전쟁 현황' };

export function LeftNav() {
  const g = useGame(); const s = useUI();
  const mode = g.world!.mode;
  return (
    <nav className={`leftnav ${s.mobileLeft ? 'open' : ''}`}>
      {NAV.filter(n => !n.modes || n.modes.includes(mode)).map(n => (
        <button key={n.id} className={s.panel === n.id ? 'on' : ''} onClick={() => ui.togglePanel(n.id)} title={n.name}>
          <span className="ic">{n.icon}</span><span className="lb">{n.name}</span>
        </button>
      ))}
    </nav>
  );
}

export function LeftPanel() {
  const s = useUI();
  useGame();
  if (!s.panel) return null;
  const P = PANELS[s.panel];
  return (
    <aside className="leftpanel">
      <header><h3>{TITLES[s.panel]}</h3><button className="x" onClick={() => ui.set({ panel: null })}>✕</button></header>
      <div className="scroll"><P /></div>
    </aside>
  );
}

import { useState } from 'react';
import { useGame } from '../hooks/useGame';
import { fmtDate } from '../simulation/Calendar';
import type { HistoryCategory } from '../types/World';
import { ui } from '../systems/UIStore';

const CATS: [HistoryCategory | 'all', string, string][] = [
  ['all', '전체', '📜'], ['nation', '국가', '🏛'], ['war', '전쟁', '⚔'], ['politics', '정치', '🗳'], ['diplomacy', '외교', '🤝'], ['economy', '경제', '💰'], ['nature', '자연', '🌋'], ['culture', '문명', '🔬'],
];

/** 세계 연대기 — 자동 생성된 역사 */
export function HistoryPanel() {
  const g = useGame(); const w = g.world!;
  const [cat, setCat] = useState<HistoryCategory | 'all'>('all');
  const [major, setMajor] = useState(true);
  const [mine, setMine] = useState(false);
  const focus = w.player >= 0 ? w.player : g.selection.kind === 'country' ? g.selection.id : -1;
  const list = w.chronicle.filter(e => (cat === 'all' || e.cat === cat) && (!major || e.major) && (!mine || (focus >= 0 && e.countries.includes(focus)))).slice(-300).reverse();
  return (
    <div>
      <div className="chips">{CATS.map(([k, n, ic]) => <button key={k} className={cat === k ? 'on' : ''} onClick={() => setCat(k)}>{ic} {n}</button>)}</div>
      <div className="row small">
        <label className="check"><input type="checkbox" checked={major} onChange={e => setMajor(e.target.checked)} /> 주요 사건만</label>
        {focus >= 0 && <label className="check"><input type="checkbox" checked={mine} onChange={e => setMine(e.target.checked)} /> {w.countries[focus].shortName} 관련</label>}
      </div>
      <ol className="chron">
        {list.map((e, i) => (
          <li key={i} className={`c-${e.cat} ${e.major ? 'major' : ''}`} onClick={() => { if (e.province !== undefined && ui.map) ui.map.focusProvince(e.province, 3); }}>
            <div className="when">{fmtDate(w.startYear, e.d, false)}</div>
            <div className="what"><b>{e.title}</b><p>{e.text}</p></div>
          </li>
        ))}
        {!list.length && <li className="muted">아직 기록된 역사가 없습니다.</li>}
      </ol>
    </div>
  );
}

import { useState } from 'react';
import { useGame } from '../hooks/useGame';
import { fmtDate } from '../simulation/Calendar';

const TYPES: [string, string][] = [['all', '전체'], ['major', '주요'], ['war', '전쟁'], ['diplomacy', '외교'], ['politics', '정치'], ['economy', '경제'], ['nature', '자연'], ['nation', '국가']];

/** 이벤트 로그 (최근 400건) */
export function EventPanel({ onClose }: { onClose: () => void }) {
  const g = useGame();
  const [f, setF] = useState('all');
  const w = g.world!;
  const list = w.log.filter(e => f === 'all' || e.type === f).slice(-200).reverse();
  return (
    <div className="eventlog">
      <header><b>이벤트 로그</b>
        <div className="chips">{TYPES.map(([k, n]) => <button key={k} className={f === k ? 'on' : ''} onClick={() => setF(k)}>{n}</button>)}</div>
        <button className="x" onClick={onClose}>✕</button>
      </header>
      <div className="list">
        {list.map((e, i) => <div key={i} className={`le ${e.type}`}><span className="muted">{fmtDate(w.startYear, e.d)}</span> {e.text}</div>)}
        {!list.length && <div className="muted pad">기록 없음</div>}
      </div>
    </div>
  );
}

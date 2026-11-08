import { useGame, useUI } from '../hooks/useGame';
import { ui } from '../systems/UIStore';
import { SPEED_LABELS, SPEEDS } from '../simulation/TimeManager';
import { fmtDate } from '../simulation/Calendar';
import { CountryLink } from './common';
import { EventPanel } from './EventPanel';

export function BottomBar() {
  const g = useGame();
  const s = useUI();
  const w = g.world!;
  const recent = w.log.slice(-3).reverse();
  const top = w.countries.filter(c => c.alive).sort((a, b) => b.militaryPower + b.gdp / 20 - (a.militaryPower + a.gdp / 20)).slice(0, 6);
  const editor = w.mode === 'editor';
  return (
    <footer className="bottombar">
      <div className="timectl">
        {SPEEDS.map((_, i) => (
          <button key={i} className={g.time.speedIndex === i ? 'on' : ''} disabled={editor && i > 0} onClick={() => g.time.setSpeed(i)} title={SPEED_LABELS[i]}>
            {i === 0 ? '❚❚' : SPEED_LABELS[i]}
          </button>
        ))}
      </div>
      <div className="ticker" onClick={() => ui.set({ eventLogOpen: !s.eventLogOpen })} title="이벤트 로그 열기">
        {recent.map((e, i) => <div key={w.log.length - i} className={`tk ${e.type}`}><span className="muted">{fmtDate(w.startYear, e.d, false)}</span> {e.text}</div>)}
        {!recent.length && <div className="muted">세계가 조용합니다...</div>}
      </div>
      <div className="powers">
        <span className="muted small">열강</span>
        {top.map(c => <CountryLink key={c.id} id={c.id} />)}
      </div>
      {s.eventLogOpen && <EventPanel onClose={() => ui.set({ eventLogOpen: false })} />}
    </footer>
  );
}

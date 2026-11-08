import { useState } from 'react';
import { useGame } from '../hooks/useGame';
import { resolveDecision } from '../simulation/DecisionEvents';
import { pushToast } from '../systems/EventManager';

/** 결정 이벤트: 화면을 막지 않는 접이식 카드 (선택할 때까지 유지, 게임은 멈추지 않음) */
export function DecisionCard() {
  const g = useGame(); const w = g.world;
  const [open, setOpen] = useState(() => window.innerWidth > 760);
  const d = w?.decision;
  if (!w || !d || w.mode !== 'ruler') return null;
  if (!open) return <button className="decision-mini" onClick={() => setOpen(true)}>📜 결정 필요: {d.title}</button>;
  return (
    <div className="decision">
      <header><b>📜 {d.title}</b><button className="x" onClick={() => setOpen(false)}>–</button></header>
      <p>{d.text}</p>
      <div className="opts">
        {d.options.map((o, i) => (
          <button key={i} className="btn sm" onClick={() => { const m = resolveDecision(w, i); pushToast(m, 'mine'); g.emit(); }}>
            <b>{o.label}</b><span className="small muted">{o.desc}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

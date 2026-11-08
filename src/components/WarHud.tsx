import { useState } from 'react';
import { useGame } from '../hooks/useGame';
import { ui } from '../systems/UIStore';
import { warScore } from '../simulation/WarSimulation';
import { fmtPop } from '../simulation/format';
import { Flag } from './common';

/** 지도 위 진행 중 전쟁 현황판 (접이식) */
export function WarHud() {
  const g = useGame(); const w = g.world;
  const [open, setOpen] = useState(() => window.innerWidth > 760);
  if (!w) return null;
  const wars = w.wars.filter(x => x.active).sort((a, b) => (b.attackers.length + b.defenders.length) * 1e6 + b.casualtiesA + b.casualtiesD - ((a.attackers.length + a.defenders.length) * 1e6 + a.casualtiesA + a.casualtiesD));
  if (!wars.length) return null;
  if (!open) return <button className="warhud-chip" onClick={() => setOpen(true)}>⚔ 전쟁 {wars.length}</button>;
  const focus = (id: number) => { const war = w.wars.find(x => x.id === id)!; const b = w.battles.find(bb => bb.warId === id); if (ui.map) ui.map.focusProvince(b ? b.province : w.countries[war.leaderD].capital, 2); };
  return (
    <div className="warhud">
      <header><b>⚔ 진행 중인 전쟁 {wars.length}</b><button onClick={() => ui.set({ panel: 'wars' })}>전체</button><button onClick={() => setOpen(false)}>–</button></header>
      {wars.slice(0, 4).map(war => {
        const sc = warScore(w, war);
        const A = w.countries[war.leaderA], D = w.countries[war.leaderD];
        return (
          <div key={war.id} className="wh-row" onClick={() => focus(war.id)}>
            <div className="wh-name">{war.name}<span className="muted"> · {Math.max(0, Math.floor((w.day - war.start) / 30))}개월 · {fmtPop(war.casualtiesA + war.casualtiesD)}</span></div>
            <div className="wh-sides">
              <span className="wh-side"><Flag color={A.color} size={10} /> {A.shortName}{war.attackers.length > 1 && <i>+{war.attackers.length - 1}</i>}</span>
              <span className="wh-bar"><b style={{ width: `${50 + sc / 2}%` }} /></span>
              <span className="wh-side r">{D.shortName}{war.defenders.length > 1 && <i>+{war.defenders.length - 1}</i>} <Flag color={D.color} size={10} /></span>
            </div>
          </div>
        );
      })}
      {wars.length > 4 && <div className="muted small wh-more" onClick={() => ui.set({ panel: 'wars' })}>외 {wars.length - 4}건 …</div>}
    </div>
  );
}

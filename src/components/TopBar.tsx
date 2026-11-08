import { useGame } from '../hooks/useGame';
import { ui } from '../systems/UIStore';
import { fmtDate, dateOf, season } from '../simulation/Calendar';
import { fmtMoney, fmtPop } from '../simulation/format';
import { SPEED_LABELS } from '../simulation/TimeManager';
import { Flag } from './common';
import type { GameMode } from '../types/World';
import { pushToast } from '../systems/EventManager';

const MODES: { id: GameMode; name: string; icon: string }[] = [
  { id: 'ruler', name: '통치', icon: '👑' },
  { id: 'observer', name: '관찰', icon: '👁' },
  { id: 'god', name: '신', icon: '⚡' },
  { id: 'editor', name: '편집', icon: '✏' },
];

export function TopBar() {
  const g = useGame();
  const w = g.world!;
  const d = dateOf(w.startYear, w.day);
  const pc = w.player >= 0 ? w.countries[w.player] : null;
  const switchMode = (m: GameMode) => {
    if (m === 'ruler') {
      const sel = g.selection;
      const cid = sel.kind === 'country' ? sel.id : sel.kind === 'province' ? w.provinces[sel.id].owner : w.player;
      if (cid >= 0 && w.countries[cid]?.alive) { g.setMode('ruler', cid); pushToast(`${w.countries[cid].name}의 통치를 시작합니다`, 'major'); }
      else { ui.set({ modal: 'modeSelect' }); }
      return;
    }
    g.setMode(m);
    if (m === 'god') ui.set({ panel: 'god' });
    if (m === 'editor') { ui.set({ panel: 'editor' }); g.time.setSpeed(0); }
  };
  return (
    <header className="topbar">
      <div className="brand" onClick={() => ui.set({ modal: 'menu' })} title="메뉴">
        <span className="logo">◈</span><span className="title">WORLD DOMINION</span>
      </div>
      <div className="date">
        <b>{fmtDate(w.startYear, w.day)}</b>
        <span className="muted">{season(d.month).name} · {SPEED_LABELS[g.time.speedIndex]}</span>
      </div>
      {pc ? (
        <div className="pstats">
          <button className="pname" onClick={() => { g.select({ kind: 'country', id: pc.id }); ui.set({ rightOpen: true }); }}><Flag color={pc.color} /> <span>{pc.shortName}</span></button>
          <span title="국고"><i>국고</i>{fmtMoney(pc.treasury)}</span>
          <span title="GDP"><i>GDP</i>{fmtMoney(pc.gdp)}</span>
          <span title="인구"><i>인구</i>{fmtPop(pc.population)}</span>
          <span title="군사력"><i>군사력</i>{pc.militaryPower.toFixed(0)}</span>
          <span title="안정도" className={pc.stability < 30 ? 'bad' : pc.stability > 60 ? 'good' : ''}><i>안정도</i>{pc.stability.toFixed(0)}%</span>
          <span title="전쟁 피로도" className={pc.warExhaustion > 40 ? 'bad' : ''}><i>피로도</i>{pc.warExhaustion.toFixed(0)}</span>
        </div>
      ) : (
        <div className="pstats"><span className="observer">{w.mode === 'god' ? '⚡ 신 모드 — 세계에 직접 개입' : w.mode === 'editor' ? '✏ 시나리오 편집 (시간 정지)' : '👁 세계 관찰 모드'}</span>
          <span><i>국가</i>{w.countries.filter(c => c.alive).length}</span>
          <span><i>전쟁</i>{w.wars.filter(x => x.active).length}</span>
        </div>
      )}
      <div className="modes">
        {MODES.map(m => <button key={m.id} className={w.mode === m.id ? 'on' : ''} onClick={() => switchMode(m.id)} title={`${m.name} 모드`}>{m.icon}<span>{m.name}</span></button>)}
      </div>
      <div className="tbtns">
        <button onClick={() => ui.set({ modal: 'save' })} title="저장/불러오기">💾</button>
        <button onClick={() => ui.set({ modal: 'settings' })} title="설정">⚙</button>
        <button onClick={() => ui.set({ modal: 'help' })} title="도움말">?</button>
      </div>
    </header>
  );
}

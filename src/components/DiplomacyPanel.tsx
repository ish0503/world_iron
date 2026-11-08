import { useState } from 'react';
import { useGame } from '../hooks/useGame';
import { DIPLO_ACTIONS, diplomacy, type DiploAction } from '../simulation/DiplomacySimulation';
import { getRel, hasTreaty, atWar, treatiesOf } from '../simulation/WorldHelpers';
import { relationLabel } from '../data/defs';
import { pushToast } from '../systems/EventManager';
import { CountryLink, NoSubjectWrap, Section } from './panelkit';
import { subject } from './CountryPanel';
import { game } from '../systems/GameController';
import { ui } from '../systems/UIStore';
import type { TreatyType } from '../types/World';

const TREATY_NAMES: Record<TreatyType, string> = { alliance: '동맹', nap: '불가침', trade: '무역', access: '통행권', guarantee: '보장', truce: '휴전', sanction: '제재', support: '지원', econ: '경제협력' };

export function DiplomacyActions({ from, to }: { from: number; to: number }) {
  const w = game.world!;
  const run = (a: DiploAction) => {
    const r = diplomacy(w, from, to, a);
    pushToast(r.msg, r.ok ? 'diplomacy' : 'war');
    game.mapVersion++; game.emit();
  };
  const war = atWar(w, from, to);
  const avail = DIPLO_ACTIONS.filter(a => {
    if (war) return a.id === 'insult';
    if (a.id === 'breakAlliance') return ['alliance', 'nap', 'trade', 'econ', 'access', 'guarantee'].some(t => hasTreaty(w, t as TreatyType, from, to));
    if (a.id === 'liftSanction') return hasTreaty(w, 'sanction', from, to, true);
    if (a.id === 'releaseVassal') return w.countries[to].overlord === from;
    if (a.id === 'support') return w.wars.some(x => x.active && (x.attackers.includes(to) || x.defenders.includes(to)));
    return true;
  });
  return (
    <div className="dacts">
      {avail.map(a => <button key={a.id} className={`btn sm ${a.id === 'declareWar' || a.id === 'ultimatum' ? 'danger' : ''}`} title={a.desc} onClick={() => run(a.id)}>{a.name}</button>)}
      {war && <button className="btn sm primary" onClick={() => { const wr = w.wars.find(x => x.active && ((x.attackers.includes(from) && x.defenders.includes(to)) || (x.defenders.includes(from) && x.attackers.includes(to)))); if (wr) ui.set({ modal: 'peace', peaceWar: wr.id }); }}>평화 협상</button>}
    </div>
  );
}

export function DiplomacyPanel() {
  const g = useGame(); const w = g.world!;
  const { cid, canAct } = subject();
  const [target, setTarget] = useState(-1);
  if (cid < 0) return <NoSubjectWrap />;
  const others = w.countries.filter(c => c.alive && c.id !== cid).sort((a, b) => getRel(w, cid, b.id) - getRel(w, cid, a.id));
  const tr = treatiesOf(w, cid);
  return (
    <div>
      <Section title="조약">
        {tr.length ? tr.map((t, i) => (
          <div key={i} className="treaty"><span className="pill">{TREATY_NAMES[t.type]}</span> <CountryLink id={t.a === cid ? t.b : t.a} />{t.until > 0 && <span className="muted small"> ~{w.startYear + Math.floor(t.until / 365)}년</span>}</div>
        )) : <div className="muted">체결된 조약 없음</div>}
      </Section>
      <Section title="국가 관계">
        <div className="rellist">
          {others.map(o => {
            const r = getRel(w, cid, o.id); const l = relationLabel(r);
            return (
              <div key={o.id} className={`relrow ${target === o.id ? 'sel' : ''}`} onClick={() => setTarget(target === o.id ? -1 : o.id)}>
                <CountryLink id={o.id} />
                <span className="relbar"><i style={{ left: '50%', width: Math.abs(r) / 2 + '%', background: l.color, transform: r < 0 ? 'translateX(-100%)' : undefined }} /></span>
                <span style={{ color: l.color }} className="small">{Math.round(r) || 0} {l.label}</span>
                {atWar(w, cid, o.id) && <span className="pill bad">교전</span>}
              </div>
            );
          })}
        </div>
      </Section>
      {canAct && target >= 0 && (
        <Section title={<>외교 행동 → <CountryLink id={target} /></>}>
          <DiplomacyActions from={cid} to={target} />
        </Section>
      )}
      {canAct && target < 0 && <div className="muted small pad">국가를 클릭하면 외교 행동을 선택할 수 있습니다.</div>}
    </div>
  );
}

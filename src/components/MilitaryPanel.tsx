import { useGame } from '../hooks/useGame';
import { UNITS, UNIT_TYPES, SHIPS, PLANES } from '../data/defs';
import { recruit, recruitCost, unitAvailable, buyShip, buyPlanes } from '../simulation/MilitarySimulation';
import { navalPower, airPower } from '../simulation/EconomySimulation';
import { warsOf } from '../simulation/WorldHelpers';
import { warScore, sideOf } from '../simulation/WarSimulation';
import { fmtPop, fmtMoney } from '../simulation/format';
import { pushToast } from '../systems/EventManager';
import { ui } from '../systems/UIStore';
import { Btn, CountryLink, NoSubjectWrap, Section, Stat, Bar } from './panelkit';
import { subject } from './CountryPanel';
import type { ShipType, PlaneType, UnitType } from '../types/Military';

export function WarList({ cid, canAct }: { cid: number; canAct: boolean }) {
  const g = useGame(); const w = g.world!;
  const wars = warsOf(w, cid);
  if (!wars.length) return <div className="muted">평화 상태</div>;
  return <>{wars.map(war => {
    const side = sideOf(war, cid)!;
    const sc = side === 'A' ? warScore(w, war) : -warScore(w, war);
    const leader = side === 'A' ? war.leaderA : war.leaderD;
    return (
      <div key={war.id} className="warcard">
        <b>{war.name}</b> <span className="muted small">{w.startYear + Math.floor(war.start / 365)}년~</span>
        <div className="small">공격: {war.attackers.map(a => <CountryLink key={a} id={a} />)}</div>
        <div className="small">방어: {war.defenders.map(a => <CountryLink key={a} id={a} />)}</div>
        <div className="barrow"><span>전쟁 점수</span><Bar value={sc + 100} max={200} color={sc >= 0 ? '#5fbf6a' : '#e5533d'} /><b>{sc.toFixed(0)}</b></div>
        <div className="small muted">사상자 아군 {fmtPop(side === 'A' ? war.casualtiesA : war.casualtiesD)} / 적군 {fmtPop(side === 'A' ? war.casualtiesD : war.casualtiesA)} · 전투 {war.battles}회</div>
        {canAct && leader === cid && <Btn small kind="primary" onClick={() => ui.set({ modal: 'peace', peaceWar: war.id })}>평화 협상</Btn>}
        {canAct && leader !== cid && <span className="muted small">전쟁 주도국만 협상할 수 있습니다</span>}
      </div>
    );
  })}</>;
}

export function MilitaryPanel() {
  const g = useGame(); const w = g.world!;
  const { cid, canAct } = subject();
  if (cid < 0) return <NoSubjectWrap />;
  const c = w.countries[cid];
  const divs = w.divisions.filter(d => d.owner === cid);
  const byProv = new Map<number, typeof divs>();
  for (const d of divs) { if (!byProv.has(d.province)) byProv.set(d.province, []); byProv.get(d.province)!.push(d); }
  const aiAll = divs.length > 0 && divs.every(d => d.aiControlled);
  const doRecruit = (t: UnitType) => { const e = recruit(w, cid, t); pushToast(e ?? `${UNITS[t].name} 편성 완료`, e ? 'war' : 'info'); g.mapVersion++; g.emit(); };
  return (
    <div>
      <Section title="군사 현황">
        <Stat k="군사력" v={c.militaryPower.toFixed(1)} />
        <Stat k="사단 수" v={`${divs.length}개 (${fmtPop(divs.reduce((a, d) => a + d.strength, 0))}명)`} />
        <Stat k="가용 인력" v={fmtPop(c.manpower)} />
        <Stat k="해군력 / 공군력" v={`${navalPower(c).toFixed(0)} / ${airPower(c).toFixed(0)}`} />
        {canAct && <label className="check"><input type="checkbox" checked={aiAll} onChange={e => { for (const d of divs) d.aiControlled = e.target.checked; g.emit(); }} /> AI 전선 지휘 (모든 사단 자동 작전)</label>}
      </Section>
      <Section title="전쟁"><WarList cid={cid} canAct={canAct} /></Section>
      {canAct && (
        <Section title="육군 편성">
          <div className="unitgrid">
            {UNIT_TYPES.map(t => {
              const u = UNITS[t]; const ok = unitAvailable(w, cid, t);
              return (
                <button key={t} className="unitbtn" disabled={!ok} onClick={() => doRecruit(t)} title={`공격 ${u.atk} 방어 ${u.def} 돌파 ${u.brk} 속도 ${u.speed}${!ok ? ' — 요구 기술: ' + JSON.stringify(u.req) : ''}`}>
                  <b>{u.name}</b><span className="small muted">{fmtMoney(recruitCost(w, cid, t))} · {u.hp / 1000}k명 · 철강 {u.steel}</span>
                  <span className="small">공{u.atk} 방{u.def} 돌{u.brk}</span>
                </button>
              );
            })}
          </div>
        </Section>
      )}
      <Section title="해군">
        <div className="shipgrid">
          {(Object.keys(SHIPS) as ShipType[]).map(t => (
            <div key={t} className="shiprow"><span>{SHIPS[t].name}</span><b>{c.ships[t]}</b>
              {canAct && <Btn small disabled={c.tech.naval < SHIPS[t].req} onClick={() => { const e = buyShip(w, cid, t); pushToast(e ?? `${SHIPS[t].name} 진수`, e ? 'war' : 'info'); g.emit(); }}>+ {fmtMoney(SHIPS[t].cost)}</Btn>}
            </div>
          ))}
        </div>
      </Section>
      <Section title="공군">
        <div className="shipgrid">
          {(Object.keys(PLANES) as PlaneType[]).map(t => (
            <div key={t} className="shiprow"><span>{PLANES[t].name}</span><b>{c.planes[t]}</b>
              {canAct && <Btn small onClick={() => { const e = buyPlanes(w, cid, t, 10); pushToast(e ?? `${PLANES[t].name} 10기 배치`, e ? 'war' : 'info'); g.emit(); }}>+10 ({fmtMoney(PLANES[t].cost * 10)})</Btn>}
            </div>
          ))}
        </div>
      </Section>
      <Section title="부대 배치">
        {[...byProv.entries()].map(([pid, ds]) => (
          <div key={pid} className="deploy" onClick={() => { g.select({ kind: 'army', province: pid, owner: cid, divs: ds.map(d => d.id) }); ui.map?.focusProvince(pid); ui.set({ rightOpen: true }); }}>
            <b>{w.provinces[pid].name}</b> <span className="muted small">{ds.length}개 사단 · {fmtPop(ds.reduce((a, d) => a + d.strength, 0))}</span>
            {ds.some(d => d.battle >= 0) && <span className="pill bad">전투</span>}{ds.some(d => d.path.length) && <span className="pill">이동</span>}
          </div>
        ))}
      </Section>
    </div>
  );
}

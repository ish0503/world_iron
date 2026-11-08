import { useGame } from '../hooks/useGame';
import { UNITS, UNIT_TYPES, SHIPS, PLANES } from '../data/defs';
import { recruit, recruitQuote, unitAvailable, buyShip, buyPlanes, trainingSlots } from '../simulation/MilitarySimulation';
import { useState } from 'react';
import { navalPower, airPower } from '../simulation/EconomySimulation';
import { warsOf, chronicle, addRel } from '../simulation/WorldHelpers';
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

function RecruitSection({ cid }: { cid: number }) {
  const g = useGame(); const w = g.world!; const c = w.countries[cid];
  const [n, setN] = useState(1);
  const sel = g.selection;
  const pid = sel.kind === 'province' && w.provinces[sel.id].controller === cid ? sel.id : undefined;
  const doRecruit = (t: UnitType) => {
    let ok = 0, err: string | null = null;
    for (let i = 0; i < n; i++) { err = recruit(w, cid, t, pid); if (err) break; ok++; }
    pushToast(ok ? `${UNITS[t].name} ${ok}개 훈련 시작${err ? ` (중단: ${err})` : ''}` : (err ?? ''), ok ? 'info' : 'war'); g.emit();
  };
  const q = c.training || [];
  return (
    <Section title={`부대 모집 · 훈련 ${q.length}/${trainingSlots(w, cid)}`} right={<label className="check small"><input type="checkbox" checked={!!c.autoRecruit} onChange={e => { c.autoRecruit = e.target.checked; g.emit(); }} /> 자동 모집</label>}>
      <div className="row small"><span className="muted">배치: {pid !== undefined ? w.provinces[pid].name : '수도/군사기지 (지도에서 자국 지역 선택 시 그곳)'}</span></div>
      <div className="seg3">{[1, 3, 5].map(k => <button key={k} className={n === k ? 'on' : ''} onClick={() => setN(k)}>×{k}</button>)}</div>
      <div className="unitgrid">
        {UNIT_TYPES.map(t => {
          const u = UNITS[t]; const ok = unitAvailable(w, cid, t); const qt = recruitQuote(w, cid, t);
          return (
            <button key={t} className="unitbtn" disabled={!ok} onClick={() => doRecruit(t)} title={`공격 ${u.atk} 방어 ${u.def} 돌파 ${u.brk} 속도 ${u.speed}${!ok ? ' — 요구 기술: ' + JSON.stringify(u.req) : ''}`}>
              <b>{u.name}</b><span className="small muted">{fmtMoney(qt.cost)} · {qt.days}일 · {u.hp / 1000}k명</span>
              <span className="small">공{u.atk} 방{u.def} 돌{u.brk}{qt.steelShort > 0 ? ' · 철강 수입' : ''}</span>
            </button>
          );
        })}
      </div>
      {q.length > 0 && <div className="trainq">{q.map((t, i) => (
        <div key={i} className="barrow"><span>{UNITS[t.type].short}</span><Bar value={t.total - t.days} max={t.total} color="#d4af37" /><b>{t.days}일</b></div>
      ))}</div>}
      <div className="small muted">가용 인력 {fmtPop(c.manpower)} · 인력이 부족하면 정치 탭에서 징병률을 높이세요</div>
    </Section>
  );
}

export function MilitaryPanel() {
  const g = useGame(); const w = g.world!;
  const { cid, canAct } = subject();
  if (cid < 0) return <NoSubjectWrap />;
  const c = w.countries[cid];
  const divs = w.divisions.filter(d => d.owner === cid);
  const byProv = new Map<number, typeof divs>();
  for (const d of divs) { if (!byProv.has(d.province)) byProv.set(d.province, []); byProv.get(d.province)!.push(d); }
  return (
    <div>
      <Section title="군사 현황">
        <Stat k="군사력" v={c.militaryPower.toFixed(1)} />
        <Stat k="사단 수" v={`${divs.length}개 (${fmtPop(divs.reduce((a, d) => a + d.strength, 0))}명)`} />
        <Stat k="가용 인력" v={fmtPop(c.manpower)} />
        <Stat k="해군력 / 공군력" v={`${navalPower(c).toFixed(0)} / ${airPower(c).toFixed(0)}`} />
        {(c.nukes || 0) > 0 && <Stat k="☢ 핵탄두" v={`${c.nukes}기`} tone="warn" />}
        {canAct && (c.nukes || 0) > 0 && warsOf(w, cid).length > 0 && <Btn small kind="danger" onClick={() => { g.setTool({ kind: 'god', action: 'nuke' }); pushToast('핵 공격 목표(교전국 영토)를 지도에서 선택하세요', 'war'); }}>☢ 핵 공격 (국제적 비난, 보복 위험)</Btn>}
        {canAct && (c.nukes || 0) === 0 && c.tech.energy >= 7 && c.tech.military >= 7 && <Btn small disabled={c.treasury < c.gdp * 0.05} onClick={() => { c.treasury -= c.gdp * 0.05; c.nukes = (c.nukes || 0) + 5; chronicle(w, 'war', `☢ ${c.shortName} 핵무장`, `${c.name}이(가) 핵무기 개발에 성공했다.`, [cid], true); for (const o of w.countries) if (o.alive && o.id !== cid) addRel(w, cid, o.id, -15); g.emit(); }}>☢ 핵무기 개발 (GDP 5%, 관계 악화)</Btn>}
      </Section>
      <Section title="전쟁"><WarList cid={cid} canAct={canAct} /></Section>
      {canAct && <RecruitSection cid={cid} />}
      {canAct && divs.length > 0 && (
        <Section title="전군 지휘">
          <div className="stance">
            <button onClick={() => { for (const d of divs) d.aiControlled = false; g.emit(); }}>✋ 전군 직접 지휘</button>
            <button onClick={() => { for (const d of divs) { d.aiControlled = true; d.stance = 'hold'; } g.emit(); }}>🛡 전군 전선 유지</button>
            <button onClick={() => { for (const d of divs) { d.aiControlled = true; d.stance = 'attack'; } g.emit(); }}>⚔ 전군 공세</button>
          </div>
          <div className="small muted">AI 지휘 부대는 적과 맞닿은 모든 지역에 병력을 배치해 전선을 유지하고, 위협이 큰 곳을 보강하며, 승산이 높은 지점에 병력을 집중해 공격합니다. 정지한 부대는 참호를 파 방어력이 오릅니다.</div>
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

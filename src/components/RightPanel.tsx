import { useState } from 'react';
import { useGame, useUI } from '../hooks/useGame';
import { ui } from '../systems/UIStore';
import { TERRAINS } from '../data/terrain';
import { BUILDINGS, cityTier, GOVS, PERSONALITIES, RESOURCES, UNITS, relationLabel } from '../data/defs';
import { fmtMoney, fmtPop, fmtPct } from '../simulation/format';
import { getRel, atWar, hasTreaty, alliesOf } from '../simulation/WorldHelpers';
import { computeSupply, disband } from '../simulation/MilitarySimulation';
import { provinceCapacity } from '../simulation/PopulationSimulation';
import { DISASTERS } from '../simulation/EnvironmentSimulation';
import { Bar, Btn, CountryLink, Flag, Section, Stat, tone } from './common';
import { DiplomacyActions } from './DiplomacyPanel';
import { BuildList } from './ConstructionPanel';
import { eraOf } from '../simulation/CountrySimulation';
import { pushToast } from '../systems/EventManager';

function ProvinceInfo({ id }: { id: number }) {
  const g = useGame(); const w = g.world!;
  const p = w.provinces[id];
  if (!p?.active) return <div className="muted pad">바다에 잠긴 지역</div>;
  const own = p.owner; const c = own >= 0 ? w.countries[own] : null;
  const divs = w.divisions.filter(d => d.province === id);
  const sup = w.player >= 0 ? computeSupply(w, w.player)[id] : own >= 0 ? computeSupply(w, own)[id] : 0;
  const canBuild = w.mode === 'ruler' && own === w.player;
  return (
    <>
      <div className="chead"><div><h3>{p.name}</h3><div className="muted small">{cityTier(p.pop).name} · {TERRAINS[p.terrain].name}{p.coastal ? ' · 해안' : ''}{p.river ? ' · 강' : ''}</div></div></div>
      <Section title="소속">
        <Stat k="소유" v={<CountryLink id={own} />} />
        {p.controller !== own && <Stat k="점령" v={<CountryLink id={p.controller} />} tone="bad" />}
        {p.cores.filter(x => x !== own && w.countries[x]?.alive).length > 0 && <Stat k="영유권 주장" v={<span>{p.cores.filter(x => x !== own && w.countries[x]?.alive).map(x => <CountryLink key={x} id={x} />)}</span>} />}
        {c && c.capital === id && <Stat k="지위" v="★ 수도" tone="good" />}
        {p.dmzUntil > w.day && <Stat k="비무장지대" v={`${w.startYear + Math.floor(p.dmzUntil / 365)}년까지`} />}
      </Section>
      <Section title="지역 정보">
        <Stat k="인구" v={`${fmtPop(p.pop)} / 수용 ${fmtPop(provinceCapacity(w, p))}`} />
        <Stat k="문화 · 종교" v={`${w.cultures[p.culture]?.name ?? '-'} · ${w.religions[p.religion]?.name ?? '-'}`} />
        <div className="barrow"><span>불만</span><Bar value={p.unrest} color={p.unrest > 60 ? '#e5533d' : '#e0b03c'} /><b>{p.unrest.toFixed(0)}</b></div>
        <Stat k="자원" v={p.resource ? `${RESOURCES[p.resource].icon} ${RESOURCES[p.resource].name} ×${p.resourceAmount}` : '없음'} />
        <Stat k="생산 (월)" v={`식량 ${p.food.toFixed(0)} · 공업 ${p.ic.toFixed(1)}`} />
        <Stat k="GDP 기여" v={fmtMoney(p.gdp)} />
        <Stat k="보급" v={fmtPct(sup, 0)} tone={tone(sup, 0.6, 0.25)} />
        {p.devastation > 0.01 && <Stat k="전쟁 피해" v={fmtPct(p.devastation, 0)} tone="bad" />}
        {p.plague > 0.01 && <Stat k="전염병" v={fmtPct(p.plague, 0)} tone="bad" />}
        {p.disaster && p.disaster.until > w.day && <Stat k="재해" v={`${DISASTERS[p.disaster.type as keyof typeof DISASTERS]?.name ?? p.disaster.type} (식량 ×${p.disaster.food})`} tone="bad" />}
      </Section>
      <Section title="시설">
        <div className="tags">{Object.entries(p.buildings).filter(([, v]) => v).map(([b, v]) => <span key={b} className="pill">{BUILDINGS[b as keyof typeof BUILDINGS].icon} {BUILDINGS[b as keyof typeof BUILDINGS].name} {v}</span>)}
          {!Object.values(p.buildings).some(v => v) && <span className="muted">없음</span>}</div>
        {canBuild && <BuildList pid={id} cid={own} />}
      </Section>
      {divs.length > 0 && <Section title="주둔 부대">{groupStacks(divs).map(([o, ds]) => (
        <div key={o} className="deploy" onClick={() => g.select({ kind: 'army', province: id, owner: o, divs: ds.map(d => d.id) })}><CountryLink id={o} /> {ds.length}개 사단 · {fmtPop(ds.reduce((a, d) => a + d.strength, 0))}</div>
      ))}</Section>}
    </>
  );
}
function groupStacks<T extends { owner: number }>(ds: T[]): [number, T[]][] {
  const m = new Map<number, T[]>(); for (const d of ds) { if (!m.has(d.owner)) m.set(d.owner, []); m.get(d.owner)!.push(d); } return [...m.entries()];
}

function CountryInfo({ id }: { id: number }) {
  const g = useGame(); const w = g.world!;
  const c = w.countries[id];
  const me = w.player;
  const rel = me >= 0 && me !== id ? getRel(w, me, id) : null;
  return (
    <>
      <div className="chead"><Flag color={c.color} size={24} /><div><h3>{c.name}</h3><div className="muted small">{GOVS[c.gov].name} · {PERSONALITIES[c.personality].name} · {eraOf(c)}</div></div></div>
      <Section title="개요">
        <Stat k="지도자" v={c.leader} />
        <Stat k="영토 / 인구" v={`${c.provinceCount} / ${fmtPop(c.population)}`} />
        <Stat k="GDP / 국고" v={`${fmtMoney(c.gdp)} / ${fmtMoney(c.treasury)}`} />
        <Stat k="군사력" v={c.militaryPower.toFixed(1)} />
        <Stat k="안정도" v={c.stability.toFixed(0)} tone={tone(c.stability, 60, 30)} />
        {c.overlord >= 0 && <Stat k="종주국" v={<CountryLink id={c.overlord} />} />}
        <Stat k="동맹" v={<span>{alliesOf(w, id).map(a => <CountryLink key={a} id={a} />)}{!alliesOf(w, id).length && '-'}</span>} />
      </Section>
      {rel !== null && (
        <Section title="우리와의 관계">
          <Stat k="관계" v={<span style={{ color: relationLabel(rel).color }}>{Math.round(rel) || 0} ({relationLabel(rel).label})</span>} />
          <div className="tags small">{(['alliance', 'nap', 'trade', 'econ', 'access', 'guarantee', 'truce', 'sanction'] as const).filter(t => hasTreaty(w, t, me, id)).map(t => <span key={t} className="pill">{{ alliance: '동맹', nap: '불가침', trade: '무역', econ: '경제협력', access: '통행권', guarantee: '보장', truce: '휴전', sanction: '제재' }[t]}</span>)}
            {atWar(w, me, id) && <span className="pill bad">교전 중</span>}</div>
          {w.mode === 'ruler' && <DiplomacyActions from={me} to={id} />}
        </Section>
      )}
      <div className="row">
        <Btn small onClick={() => ui.set({ panel: 'country' })}>상세 정보</Btn>
        <Btn small onClick={() => ui.map?.focusProvince(c.capital, 2.5)}>수도로 이동</Btn>
        {w.mode !== 'ruler' && c.alive && <Btn small kind="primary" onClick={() => { g.setMode('ruler', id); pushToast(`${c.name} 통치 시작`, 'major'); }}>👑 이 국가로 통치</Btn>}
      </div>
    </>
  );
}

function ArmyInfo() {
  const g = useGame(); const w = g.world!;
  const s = g.selection;
  const [checked, setChecked] = useState<Set<number>>(new Set());
  if (s.kind !== 'army') return null;
  const divs = w.divisions.filter(d => s.divs.includes(d.id));
  const canCmd = w.mode === 'god' || (w.mode === 'ruler' && s.owner === w.player);
  const here = w.divisions.filter(d => d.province === s.province && d.owner === s.owner);
  const reselect = (ids: number[]) => { if (ids.length) { g.select({ kind: 'army', province: s.province, owner: s.owner, divs: ids }); setChecked(new Set()); } };
  const setStance = (ai: boolean, stance?: 'hold' | 'attack') => { for (const d of divs) { d.aiControlled = ai; if (stance) d.stance = stance; if (ai) { d.path = []; } } pushToast(ai ? (stance === 'attack' ? `${divs.length}개 사단: AI 공세 지휘` : `${divs.length}개 사단: AI 전선 유지`) : '직접 지휘로 전환', 'info'); g.emit(); };
  const mode = divs.every(d => !d.aiControlled) ? 'manual' : divs.every(d => d.aiControlled && d.stance === 'attack') ? 'attack' : divs.every(d => d.aiControlled) ? 'hold' : 'mixed';
  const sumStr = divs.reduce((a, d) => a + d.strength, 0);
  return (
    <>
      <div className="chead"><Flag color={w.countries[s.owner].color} size={20} /><div><h3>{w.countries[s.owner].shortName} 부대</h3><div className="muted small">{w.provinces[s.province].name} · 선택 {divs.length}/{here.length}개 사단 · {fmtPop(sumStr)}명</div></div></div>
      {canCmd && <>
        <div className="row">
          <Btn small kind="primary" onClick={() => g.setTool({ kind: 'move' })}>➜ 이동</Btn>
          <Btn small onClick={() => { for (const d of divs) { d.path = []; d.progress = 0; } g.mapVersion++; g.emit(); }}>■ 정지</Btn>
          <Btn small onClick={() => reselect(divs.slice(0, Math.ceil(divs.length / 2)).map(d => d.id))} disabled={divs.length < 2}>✂ 절반 분할</Btn>
          <Btn small onClick={() => reselect(here.map(d => d.id))} disabled={here.length === divs.length}>⊕ 합류 ({here.length})</Btn>
          {checked.size > 0 && <Btn small onClick={() => reselect([...checked])}>체크한 {checked.size}개만</Btn>}
        </div>
        <div className="stance">
          <span className="muted small">지휘</span>
          <button className={mode === 'manual' ? 'on' : ''} onClick={() => setStance(false)}>✋ 직접</button>
          <button className={mode === 'hold' ? 'on' : ''} onClick={() => setStance(true, 'hold')}>🛡 전선 유지</button>
          <button className={mode === 'attack' ? 'on' : ''} onClick={() => setStance(true, 'attack')}>⚔ 공세</button>
        </div>
        <div className="muted small pad">PC: 우클릭 이동 · 모바일: 이동 버튼 후 지역 탭 · 전선 유지/공세는 AI가 전선을 따라 배치·공격합니다</div>
        <div className="row"><Btn small kind="danger" onClick={() => { for (const d of divs) disband(w, d.id); g.select({ kind: 'none' }); pushToast('부대 해산', 'info'); }}>해산</Btn></div>
      </>}
      {divs.map(d => (
        <div key={d.id} className={`divcard ${checked.has(d.id) ? 'chk' : ''}`}>
          <div>
            {canCmd && <input type="checkbox" checked={checked.has(d.id)} onChange={e => { const n = new Set(checked); if (e.target.checked) n.add(d.id); else n.delete(d.id); setChecked(n); }} />}
            <b> {d.name}</b> <span className="muted small">{UNITS[d.type].name}</span>
            {d.battle >= 0 && <span className="pill bad">전투 중</span>}{d.path.length > 0 && <span className="pill">→ {w.provinces[d.path[d.path.length - 1]].name}</span>}
            {d.aiControlled && <span className="pill">{d.stance === 'attack' ? '⚔ 공세' : '🛡 유지'}</span>}
          </div>
          <div className="barrow"><span>병력</span><Bar value={d.strength} max={d.maxStrength} color="#5fbf6a" /><b>{(d.strength / 1000).toFixed(1)}k</b></div>
          <div className="barrow"><span>조직력</span><Bar value={d.org} max={1} color="#6fa8dc" /><b>{(d.org * 100).toFixed(0)}</b></div>
          <div className="barrow"><span>보급</span><Bar value={d.supply} max={1} color={d.supply < 0.3 ? '#e5533d' : '#d4af37'} /><b>{(d.supply * 100).toFixed(0)}</b></div>
          <div className="barrow"><span>참호</span><Bar value={d.entrench || 0} max={1} color="#a08a5a" /><b>{((d.entrench || 0) * 100).toFixed(0)}</b></div>
          <div className="small muted">사기 {(d.morale * 100).toFixed(0)} · 장비 {(d.equipment * 100).toFixed(0)}%</div>
        </div>
      ))}
    </>
  );
}

function BattleInfo({ id }: { id: number }) {
  const g = useGame(); const w = g.world!;
  const b = w.battles.find(x => x.id === id); if (!b) return <div className="muted pad">전투가 종료되었습니다.</div>;
  const A = w.divisions.filter(d => b.attackers.includes(d.id)), D = w.divisions.filter(d => b.defenders.includes(d.id));
  const side = (ds: typeof A) => <>{ds.map(d => <div key={d.id} className="small">{d.name} — {(d.strength / 1000).toFixed(1)}k · 조직 {(d.org * 100).toFixed(0)}</div>)}</>;
  return (
    <>
      <div className="chead"><div><h3>⚔ {w.provinces[b.province].name} 전투</h3><div className="muted small">{w.day - b.start}일째 · {b.lastResult}</div></div></div>
      <Section title={<>공격: <CountryLink id={b.attackerCountry} /></>}>{side(A)}<Stat k="손실" v={fmtPop(b.attackerLoss)} tone="bad" /></Section>
      <Section title={<>방어: <CountryLink id={b.defenderCountry} /></>}>{side(D)}<Stat k="손실" v={fmtPop(b.defenderLoss)} tone="bad" /></Section>
      <div className="muted small pad">공격력 = 공격 × 사기·조직 × 보급 × 지형·기후 / 방어력 = 방어 × 요새 × 지형 × 지휘·전술</div>
    </>
  );
}

export function RightPanel() {
  const g = useGame(); const s = useUI();
  const sel = g.selection;
  if (sel.kind === 'none' || !s.rightOpen) return null;
  return (
    <aside className="rightpanel">
      <button className="x" onClick={() => { ui.set({ rightOpen: false }); g.select({ kind: 'none' }); }}>✕</button>
      <div className="scroll">
        {sel.kind === 'province' && <ProvinceInfo id={sel.id} />}
        {sel.kind === 'country' && <CountryInfo id={sel.id} />}
        {sel.kind === 'army' && <ArmyInfo />}
        {sel.kind === 'battle' && <BattleInfo id={sel.id} />}
      </div>
    </aside>
  );
}

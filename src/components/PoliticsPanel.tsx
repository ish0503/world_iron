import { useGame } from '../hooks/useGame';
import { GOVS, GOV_IDS, PERSONALITIES } from '../data/defs';
import type { GovType } from '../types/Country';
import { changeGovernment } from '../simulation/CountryOps';
import { genLeader } from '../data/names';
import { rng } from '../simulation/rng';
import { chronicle } from '../simulation/WorldHelpers';
import { pushToast } from '../systems/EventManager';
import { Btn, NoSubjectWrap, Section, Stat } from './panelkit';
import { subject } from './CountryPanel';

export function PoliticsPanel() {
  const g = useGame(); const w = g.world!;
  const { cid, canAct } = subject();
  if (cid < 0) return <NoSubjectWrap />;
  const c = w.countries[cid];
  const gov = GOVS[c.gov];
  const unrest = w.provinces.filter(p => p.active && p.owner === cid).sort((a, b) => b.unrest - a.unrest).slice(0, 6);
  const act = (fn: () => void) => () => { fn(); g.emit(); };
  return (
    <div>
      <Section title="정부">
        <Stat k="정부 형태" v={gov.name} />
        <Stat k="국가 원수" v={c.leader} />
        <Stat k="국가 성향" v={`${PERSONALITIES[c.personality].name} — ${PERSONALITIES[c.personality].desc}`} />
        <Stat k="선거" v={gov.elections ? `${Math.max(0, 4 - Math.floor((w.day - c.lastElection) / 365))}년 내 실시` : '없음'} />
      </Section>
      {canAct && (
        <>
          <Section title="정책">
            <label className="slider">세율 {(c.taxRate * 100).toFixed(0)}%
              <input type="range" min={5} max={60} value={Math.round(c.taxRate * 100)} onChange={e => { c.taxRate = +e.target.value / 100; g.emit(); }} /></label>
            <div className="muted small">높은 세율은 수입을 늘리지만 불만을 키운다 (25% 초과 시 불만 증가)</div>
            <label className="slider">징병률 {(c.conscription * 100).toFixed(1)}%
              <input type="range" min={10} max={100} value={Math.round(c.conscription * 1000)} onChange={e => { c.conscription = +e.target.value / 1000; g.emit(); }} /></label>
            <label className="check"><input type="checkbox" checked={c.warEconomy} onChange={e => { c.warEconomy = e.target.checked; g.emit(); }} /> 전시 경제 (병력 생산비 -15%, 물가 상승)</label>
          </Section>
          <Section title="정치 행동">
            {gov.elections && <Btn onClick={act(() => {
              c.lastElection = w.day; const win = Math.random() < 0.3 + c.stability / 150;
              if (win) { c.legitimacy = Math.min(100, c.legitimacy + 15); pushToast('조기 총선 승리! 정통성 상승', 'politics'); }
              else { c.leader = genLeader(rng); c.leaderSince = w.day; c.legitimacy = 60; pushToast(`조기 총선 패배 — 새 지도자 ${c.leader}`, 'politics'); }
            })}>조기 총선 실시</Btn>}
            <Btn disabled={c.treasury < c.gdp * 0.02} onClick={act(() => {
              c.treasury -= c.gdp * 0.02;
              for (const p of w.provinces) if (p.owner === cid) p.unrest *= 0.7;
              c.stability = Math.min(100, c.stability + 3); c.legitimacy -= 3;
              pushToast('치안 강화: 불만 감소', 'politics');
            })}>치안 강화 ({(c.gdp * 0.02).toFixed(1)}B)</Btn>
            <Btn disabled={c.treasury < c.gdp * 0.03} onClick={act(() => { c.treasury -= c.gdp * 0.03; c.stability = Math.min(100, c.stability + 6); pushToast('국민 통합 캠페인: 안정도 상승', 'politics'); })}>국민 통합 캠페인 ({(c.gdp * 0.03).toFixed(1)}B)</Btn>
          </Section>
          <Section title="체제 변경 (안정도 -25)">
            <div className="grid2">
              {GOV_IDS.filter(x => x !== c.gov).map(x => (
                <Btn key={x} small onClick={act(() => { changeGovernment(w, cid, x as GovType, undefined, '정부 개편으로 '); c.stability = Math.max(0, c.stability - 25); chronicle(w, 'politics', `${c.shortName} 체제 개편`, `${c.name}의 새 체제: ${GOVS[x].name}`, [cid]); })}>{GOVS[x].name}</Btn>
              ))}
            </div>
          </Section>
        </>
      )}
      <Section title="불안 지역">
        {unrest.map(p => <Stat key={p.id} k={p.name} v={`${p.unrest.toFixed(0)}${p.culture !== c.culture ? ' · 이문화' : ''}${p.controller !== cid ? ' · 점령됨' : ''}`} tone={p.unrest > 60 ? 'bad' : p.unrest > 35 ? 'warn' : 'good'} />)}
      </Section>
    </div>
  );
}

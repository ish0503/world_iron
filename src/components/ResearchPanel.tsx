import { useGame } from '../hooks/useGame';
import { TECHS, TECH_IDS, UNITS, UNIT_TYPES } from '../data/defs';
import { researchPerDay, techCostFor, eraOf, avgTech } from '../simulation/CountrySimulation';
import { Bar, NoSubjectWrap, Section, Stat } from './panelkit';
import { subject } from './CountryPanel';

export function ResearchPanel() {
  const g = useGame(); const w = g.world!;
  const { cid, canAct } = subject();
  if (cid < 0) return <NoSubjectWrap />;
  const c = w.countries[cid];
  const rp = researchPerDay(w, c);
  const cost = techCostFor(w, c, c.researchFocus);
  return (
    <div>
      <Section title="연구 현황">
        <Stat k="시대" v={`${eraOf(c)} (평균 ${avgTech(c).toFixed(1)}단계)`} />
        <Stat k="연구력" v={`${(rp * 365).toFixed(2)} / 년`} />
        <Stat k="현재 연구" v={`${TECHS[c.researchFocus].icon} ${TECHS[c.researchFocus].name} ${c.tech[c.researchFocus] + 1}단계`} />
        <div className="barrow"><span>진행</span><Bar value={c.techProgress} max={cost} /><b>{Math.min(100, (c.techProgress / cost) * 100).toFixed(0)}%</b></div>
        <div className="small muted">예상 완료: {rp > 0 ? Math.ceil((cost - c.techProgress) / rp) : '∞'}일 · 주변국이 앞선 분야는 비용이 줄어듭니다</div>
        {canAct && <label className="check"><input type="checkbox" checked={!!c.autoResearch} onChange={e => { c.autoResearch = e.target.checked; g.emit(); }} /> 자동 연구 선택</label>}
      </Section>
      <Section title="기술 분야">
        <div className="techgrid">
          {TECH_IDS.map(f => (
            <button key={f} className={`techcard ${c.researchFocus === f ? 'on' : ''}`} disabled={!canAct} onClick={() => { c.researchFocus = f; g.emit(); }}>
              <span className="ic">{TECHS[f].icon}</span>
              <b>{TECHS[f].name} <span className="lvl">Lv.{c.tech[f]}</span></b>
              <span className="small muted">{TECHS[f].effect}</span>
            </button>
          ))}
        </div>
      </Section>
      <Section title="병종 해금">
        {UNIT_TYPES.map(t => {
          const req = Object.entries(UNITS[t].req);
          const ok = req.every(([f, l]) => (c.tech as any)[f] >= (l as number));
          return <Stat key={t} k={UNITS[t].name} v={ok ? '✓ 사용 가능' : req.map(([f, l]) => `${TECHS[f as keyof typeof TECHS].name} ${l}`).join(', ')} tone={ok ? 'good' : undefined} />;
        })}
      </Section>
    </div>
  );
}

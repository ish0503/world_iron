import { useGame } from '../hooks/useGame';
import { RESOURCES, RES_IDS } from '../data/defs';
import { fmtMoney, fmtPct } from '../simulation/format';
import { Btn, NoSubjectWrap, Section, Stat, tone } from './panelkit';
import { subject } from './CountryPanel';
import { pushToast } from '../systems/EventManager';

export function EconomyPanel() {
  const g = useGame(); const w = g.world!;
  const { cid, canAct } = subject();
  if (cid < 0) return <NoSubjectWrap />;
  const c = w.countries[cid];
  const net = c.income - c.expense;
  const slider = (key: 'research' | 'welfare' | 'infrastructure', label: string, max: number, hint: string) => (
    <label className="slider">{label} {(c.budget[key] * 100).toFixed(1)}% GDP
      <input type="range" min={0} max={max * 1000} value={Math.round(c.budget[key] * 1000)} disabled={!canAct} onChange={e => { c.budget[key] = +e.target.value / 1000; g.emit(); }} />
      <span className="muted small">{hint}</span></label>
  );
  return (
    <div>
      <Section title="경제 지표">
        <Stat k="GDP" v={fmtMoney(c.gdp)} />
        <Stat k="GDP 성장률 (연)" v={fmtPct(c.gdpGrowth)} tone={tone(c.gdpGrowth, 0.02, -0.02)} />
        <Stat k="물가 상승률" v={fmtPct(c.inflation)} tone={tone(c.inflation, 0.03, 0.1)} />
        <Stat k="실업률" v={fmtPct(c.unemployment)} tone={tone(c.unemployment, 0.05, 0.12)} />
        <Stat k="산업 생산력 (IC)" v={c.totalIC.toFixed(1)} />
        <Stat k="무역 수지 (월)" v={fmtMoney(c.tradeBalance)} tone={c.tradeBalance >= 0 ? 'good' : 'bad'} />
      </Section>
      <Section title="재정 (연 환산)">
        <Stat k="세수" v={fmtMoney(c.income * 365)} tone="good" />
        <Stat k="지출" v={fmtMoney(c.expense * 365)} tone="bad" />
        <Stat k="수지" v={fmtMoney(net * 365)} tone={net >= 0 ? 'good' : 'bad'} />
        <Stat k="국고" v={fmtMoney(c.treasury)} />
        <Stat k="국가 부채" v={`${fmtMoney(c.debt)} (${fmtPct(c.debt / Math.max(1, c.gdp), 0)} GDP)`} tone={tone(c.debt / Math.max(1, c.gdp), 0.3, 1)} />
        {canAct && <div className="row">
          <Btn small onClick={() => { const a = c.gdp * 0.05; c.debt += a; c.treasury += a; pushToast(`국채 발행 +${fmtMoney(a)}`, 'economy'); g.emit(); }}>국채 발행 (GDP 5%)</Btn>
          <Btn small disabled={c.debt <= 0 || c.treasury <= 0} onClick={() => { const a = Math.min(c.debt, c.treasury * 0.5); c.debt -= a; c.treasury -= a; g.emit(); }}>부채 상환</Btn>
        </div>}
      </Section>
      <Section title="예산 배분">
        <label className="slider">군비 지출 강도 {(c.budget.military * 100).toFixed(0)}%
          <input type="range" min={10} max={100} value={Math.round(c.budget.military * 100)} disabled={!canAct} onChange={e => { c.budget.military = +e.target.value / 100; g.emit(); }} />
          <span className="muted small">유지비와 병력 보충 속도</span></label>
        {slider('research', '연구', 0.05, '기술 발전 속도')}
        {slider('welfare', '복지', 0.08, '안정도·출생률 상승, 불만 감소')}
        {slider('infrastructure', '인프라', 0.05, '건설 속도, 피해 복구')}
      </Section>
      <Section title="자원 (월간)" right={canAct ? <label className="check small"><input type="checkbox" checked={c.autoImport} onChange={e => { c.autoImport = e.target.checked; g.emit(); }} /> 자동 수입</label> : null}>
        <table className="tbl">
          <thead><tr><th>자원</th><th>생산</th><th>소비</th><th>비축</th><th>국제가</th></tr></thead>
          <tbody>{RES_IDS.map(r => (
            <tr key={r}><td>{RESOURCES[r].icon} {RESOURCES[r].name}</td><td>{c.prod[r].toFixed(0)}</td><td className={c.cons[r] > c.prod[r] ? 'bad' : ''}>{c.cons[r].toFixed(0)}</td><td>{c.stock[r].toFixed(0)}</td><td>{(w.prices[r] * 1000).toFixed(1)}M</td></tr>
          ))}</tbody>
        </table>
        {c.famine > 0 && <div className="bad small">⚠ 식량 부족으로 기근이 발생하고 있습니다</div>}
      </Section>
    </div>
  );
}

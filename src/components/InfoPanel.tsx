import { useState } from 'react';
import { useGame } from '../hooks/useGame';
import { fmtMoney, fmtPop } from '../simulation/format';
import { avgTech } from '../simulation/CountrySimulation';
import { RESOURCES, RES_IDS } from '../data/defs';
import { CountryLink, Section, Stat } from './panelkit';
import { warScore } from '../simulation/WarSimulation';
import { fmtDate } from '../simulation/Calendar';
import { ACHIEVEMENTS } from '../simulation/Extras';

type Key = 'gdp' | 'population' | 'militaryPower' | 'provinceCount' | 'tech' | 'stability';

export function InfoPanel() {
  const g = useGame(); const w = g.world!;
  const [key, setKey] = useState<Key>('gdp');
  const live = w.countries.filter(c => c.alive);
  const val = (c: typeof live[0]) => key === 'tech' ? avgTech(c) : (c as any)[key] as number;
  const rows = [...live].sort((a, b) => val(b) - val(a));
  const totPop = live.reduce((a, c) => a + c.population, 0), totGdp = live.reduce((a, c) => a + c.gdp, 0);
  const cols: [Key, string][] = [['gdp', 'GDP'], ['population', '인구'], ['militaryPower', '군사'], ['provinceCount', '영토'], ['tech', '기술'], ['stability', '안정']];
  return (
    <div>
      <Section title="세계 현황">
        <Stat k="연도" v={`${fmtDate(w.startYear, w.day, false)} (${Math.floor(w.day / 365)}년 경과)`} />
        <Stat k="국가" v={`${live.length}개 존속 / 역대 ${w.countries.length}개`} />
        <Stat k="세계 인구" v={fmtPop(totPop)} />
        <Stat k="세계 GDP" v={fmtMoney(totGdp)} />
        <Stat k="진행 중 전쟁" v={`${w.wars.filter(x => x.active).length}건 (역대 ${w.wars.length}건)`} />
        <Stat k="종교 / 문화" v={`${w.religions.length} / ${w.cultures.length}`} />
        <Stat k="지구 기온 편차" v={`${w.globalTemp >= 0 ? '+' : ''}${(w.globalTemp * 3).toFixed(2)}℃`} />
      </Section>
      {w.player >= 0 && (
        <Section title={`업적 (${w.achievements?.length ?? 0}/${Object.keys(ACHIEVEMENTS).length})`}>
          <div className="achv">{Object.entries(ACHIEVEMENTS).map(([id, a]) => <span key={id} className={`pill ${w.achievements?.includes(id) ? 'got' : ''}`} title={a.desc}>{a.icon} {a.name}</span>)}</div>
        </Section>
      )}
      <Section title="국제 자원 시세 (단위당)">
        <div className="tags">{RES_IDS.map(r => <span key={r} className="pill">{RESOURCES[r].icon} {RESOURCES[r].name} {(w.prices[r] * 1000).toFixed(1)}M</span>)}</div>
      </Section>
      <Section title="국가 순위">
        <div className="chips">{cols.map(([k, n]) => <button key={k} className={key === k ? 'on' : ''} onClick={() => setKey(k)}>{n}</button>)}</div>
        <table className="tbl rank">
          <tbody>{rows.map((c, i) => (
            <tr key={c.id} className={c.id === w.player ? 'me' : ''}><td>{i + 1}</td><td><CountryLink id={c.id} /></td>
              <td>{key === 'gdp' ? fmtMoney(c.gdp) : key === 'population' ? fmtPop(c.population) : key === 'tech' ? avgTech(c).toFixed(1) : val(c).toFixed(0)}</td></tr>
          ))}</tbody>
        </table>
      </Section>
    </div>
  );
}

export function WarsPanel() {
  const g = useGame(); const w = g.world!;
  const active = w.wars.filter(x => x.active);
  const ended = w.wars.filter(x => !x.active).slice(-30).reverse();
  return (
    <div>
      <Section title={`진행 중인 전쟁 (${active.length})`}>
        {active.map(war => {
          const sc = warScore(w, war);
          return (
            <div key={war.id} className="warcard">
              <b>{war.name}</b> <span className="muted small">{fmtDate(w.startYear, war.start, false)}~</span>
              <div className="small">⚔ {war.attackers.map(a => <CountryLink key={a} id={a} />)}</div>
              <div className="small">🛡 {war.defenders.map(a => <CountryLink key={a} id={a} />)}</div>
              <div className="small muted">전쟁 점수(공격측) {sc.toFixed(0)} · 사상자 {fmtPop(war.casualtiesA + war.casualtiesD)} · 전투 {war.battles}회</div>
            </div>
          );
        })}
        {!active.length && <div className="muted">세계는 평화롭다.</div>}
      </Section>
      <Section title="지난 전쟁">
        {ended.map(war => <div key={war.id} className="warcard old"><b>{war.name}</b> <span className="muted small">{w.startYear + Math.floor(war.start / 365)}–{w.startYear + Math.floor((war.end || 0) / 365)}</span><div className="small">{war.result}</div></div>)}
      </Section>
    </div>
  );
}

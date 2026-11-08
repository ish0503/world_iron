import { useGame } from '../hooks/useGame';
import { GOVS, PERSONALITIES } from '../data/defs';
import { fmtDate } from '../simulation/Calendar';
import { fmtMoney, fmtPop, fmtPct } from '../simulation/format';
import { eraOf } from '../simulation/CountrySimulation';
import { alliesOf, enemiesOf } from '../simulation/WorldHelpers';
import { Bar, CountryLink, Flag, Section, Sparkline, Stat, tone } from './common';
import { game } from '../systems/GameController';

/** 현재 패널이 다루는 국가 (통치 모드 = 플레이어, 그 외 = 선택 국가) */
export function subject(): { cid: number; canAct: boolean } {
  const w = game.world!; const s = game.selection;
  if (w.mode === 'ruler' && w.player >= 0) return { cid: w.player, canAct: true };
  let cid = -1;
  if (s.kind === 'country') cid = s.id;
  else if (s.kind === 'province') cid = w.provinces[s.id].owner;
  else if (s.kind === 'army') cid = s.owner;
  return { cid, canAct: w.mode === 'god' || w.mode === 'editor' };
}

export function NoSubject() { return <div className="muted pad">지도에서 국가를 선택하세요.</div>; }

export function CountryPanel() {
  const g = useGame(); const w = g.world!;
  const { cid } = subject();
  if (cid < 0) return <NoSubject />;
  const c = w.countries[cid];
  const hist = c.history;
  return (
    <div>
      <div className="chead"><Flag color={c.color} size={22} /><div><h3>{c.name}</h3><div className="muted small">[{c.tag}] {GOVS[c.gov].name} · {PERSONALITIES[c.personality].name} · {eraOf(c)}</div></div></div>
      {!c.alive && <div className="bad pad">이 국가는 멸망했습니다.</div>}
      <Section title="국가 정보">
        <Stat k="국가 원수" v={c.leader} />
        <Stat k="수도" v={w.provinces[c.capital]?.name ?? '-'} />
        <Stat k="건국" v={c.founded === 0 ? `${w.startYear}년 이전` : fmtDate(w.startYear, c.founded, false)} />
        <Stat k="영토" v={`${c.provinceCount}개 지역`} />
        <Stat k="인구" v={fmtPop(c.population)} />
        <Stat k="GDP" v={fmtMoney(c.gdp)} />
        <Stat k="국고 / 부채" v={`${fmtMoney(c.treasury)} / ${fmtMoney(c.debt)}`} tone={c.debt > c.gdp ? 'bad' : undefined} />
        <Stat k="군사력" v={c.militaryPower.toFixed(1)} />
        <Stat k="문화 / 종교" v={`${w.cultures[c.culture]?.name ?? '-'} / ${w.religions[c.religion]?.name ?? '-'}`} />
        {c.overlord >= 0 && <Stat k="종주국" v={<CountryLink id={c.overlord} />} />}
      </Section>
      <Section title="국내 상황">
        <div className="barrow"><span>안정도</span><Bar value={c.stability} color={c.stability < 30 ? '#e5533d' : '#5fbf6a'} /><b className={tone(c.stability, 60, 30)}>{c.stability.toFixed(0)}</b></div>
        <div className="barrow"><span>정통성</span><Bar value={c.legitimacy} color="#6fa8dc" /><b>{c.legitimacy.toFixed(0)}</b></div>
        <div className="barrow"><span>전쟁 피로</span><Bar value={c.warExhaustion} color="#e08a3c" /><b>{c.warExhaustion.toFixed(0)}</b></div>
        <Stat k="실업률" v={fmtPct(c.unemployment)} tone={tone(c.unemployment, 0.05, 0.12)} />
        <Stat k="물가 상승률" v={fmtPct(c.inflation)} tone={tone(c.inflation, 0.03, 0.1)} />
        <Stat k="평균 불만" v={(c.avgUnrest ?? 0).toFixed(0)} tone={tone(c.avgUnrest ?? 0, 25, 50)} />
        {c.famine > 0 && <Stat k="기근" v={fmtPct(c.famine, 0)} tone="bad" />}
      </Section>
      <Section title="추세 (월별)">
        <div className="small muted">GDP</div><Sparkline data={hist.map(h => h.gdp)} />
        <div className="small muted">인구</div><Sparkline data={hist.map(h => h.pop)} color="#6fa8dc" />
        <div className="small muted">군사력</div><Sparkline data={hist.map(h => h.mil)} color="#e5533d" />
      </Section>
      <Section title="동맹 · 교전">
        <div className="tags">{alliesOf(w, cid).map(a => <CountryLink key={a} id={a} />)}{!alliesOf(w, cid).length && <span className="muted">동맹 없음</span>}</div>
        {enemiesOf(w, cid).length > 0 && <div className="tags bad">교전: {enemiesOf(w, cid).map(a => <CountryLink key={a} id={a} />)}</div>}
      </Section>
      {c.goals.length > 0 && w.player !== cid && (
        <Section title="AI 장기 목표">
          {c.goals.map((gl, i) => <div key={i} className="goal">🎯 {gl.label} <span className="muted small">(~{fmtDate(w.startYear, gl.deadline, false)})</span></div>)}
        </Section>
      )}
    </div>
  );
}

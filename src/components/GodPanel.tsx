import { useGame } from '../hooks/useGame';
import { god } from '../editor/WorldEditor';
import { DISASTERS, type DisasterType } from '../simulation/EnvironmentSimulation';
import { GOVS, GOV_IDS, RESOURCES, RES_IDS } from '../data/defs';
import { pushToast } from '../systems/EventManager';
import { resetGodPick } from '../systems/MapActions';
import { ui } from '../systems/UIStore';
import { Btn, CountryLink, Section } from './panelkit';
import { warsOf } from '../simulation/WorldHelpers';
import type { GovType } from '../types/Country';

export function GodPanel() {
  const g = useGame(); const w = g.world!;
  const sel = g.selection;
  const cid = sel.kind === 'country' ? sel.id : sel.kind === 'province' ? w.provinces[sel.id].owner : -1;
  const c = cid >= 0 ? w.countries[cid] : null;
  const tool = (action: string, arg?: any) => { resetGodPick(); g.setTool({ kind: 'god', action, arg }); };
  const act = (msg: string, fn: () => void) => () => { fn(); pushToast(msg, 'god'); g.mapVersion++; g.emit(); };
  const r = w.rules;
  const t = g.tool.kind === 'god' ? g.tool.action : '';
  return (
    <div>
      <Section title="지도 개입 (클릭 도구)">
        <div className="grid2">
          {[['war', '⚔ 전쟁 강제'], ['merge', '🔗 국가 통합'], ['createCountry', '🏳 국가 건국'], ['independence', '🗽 지역 독립'], ['deleteCountry', '✖ 국가 삭제'], ['unclaim', '◻ 영토 해방'], ['capital', '★ 수도 지정'], ['city', '🏙 도시 건설'], ['pop+', '👥 인구 증가'], ['pop-', '💀 인구 감소']].map(([a, n]) =>
            <button key={a} className={`btn sm ${t === a ? 'primary' : ''}`} onClick={() => tool(a)}>{n}</button>)}
        </div>
        <div className="small muted">자원 생성</div>
        <div className="grid3">{RES_IDS.map(rs => <button key={rs} className="btn sm" onClick={() => tool('resource', rs)}>{RESOURCES[rs].icon} {RESOURCES[rs].name}</button>)}<button className="btn sm" onClick={() => tool('resource', null)}>자원 제거</button></div>
        <div className="small muted">자연재해 발생</div>
        <div className="grid3">{(Object.keys(DISASTERS) as DisasterType[]).map(d => <button key={d} className={`btn sm ${t === 'disaster:' + d ? 'primary' : ''}`} onClick={() => tool('disaster:' + d)}>{DISASTERS[d].icon} {DISASTERS[d].name}</button>)}</div>
      </Section>
      <Section title={c ? <>대상 국가: <CountryLink id={c.id} /></> : '대상 국가 (지도에서 선택)'}>
        {c ? (
          <div className="grid2">
            <Btn small onClick={act('자금 +100B', () => god.giveMoney(w, c.id, 100))}>💰 자금 지급 +100B</Btn>
            <Btn small onClick={act('기술 +1', () => god.boostTech(w, c.id))}>🔬 기술 강제 발전</Btn>
            <Btn small onClick={act('지도자 교체', () => god.replaceLeader(w, c.id))}>👤 지도자 교체</Btn>
            <Btn small onClick={act('안정도 +20', () => god.stability(w, c.id, 20))}>☮ 안정도 +20</Btn>
            <Btn small onClick={act('안정도 -20', () => god.stability(w, c.id, -20))}>🔥 안정도 -20</Btn>
            <Btn small onClick={act('국가 분열', () => god.split(w, c.id))}>✂ 강제 분열</Btn>
            <Btn small onClick={act('인구 +30%', () => { for (const p of w.provinces) if (p.owner === c.id) p.pop *= 1.3; })}>👥 인구 +30%</Btn>
            <Btn small onClick={act('승리 부여', () => god.grantVictory(w, c.id))} disabled={!warsOf(w, c.id).length}>🏆 전쟁 승리 부여</Btn>
            <Btn small onClick={act('관계 +50 (전체)', () => { for (const o of w.countries) if (o.alive && o.id !== c.id) god.setRelation(w, c.id, o.id, 50); })}>🤝 모든 국가와 우호</Btn>
            <Btn small onClick={act('관계 -80 (전체)', () => { for (const o of w.countries) if (o.alive && o.id !== c.id) god.setRelation(w, c.id, o.id, -80); })}>😠 모든 국가와 적대</Btn>
            <Btn small onClick={() => { g.setMode('ruler', c.id); ui.set({ panel: 'country' }); pushToast(`${c.name} 통치 시작`, 'major'); }}>👑 이 국가로 통치</Btn>
          </div>
        ) : <div className="muted small">국가를 선택하면 개입할 수 있습니다.</div>}
        {c && <div className="grid3">{GOV_IDS.map(gv => <button key={gv} className="btn sm" onClick={act(`체제 → ${GOVS[gv].name}`, () => god.changeGov(w, c.id, gv as GovType))}>{GOVS[gv].name}</button>)}</div>}
      </Section>
      <Section title="세계 규칙">
        <label className="check"><input type="checkbox" checked={r.noWar} onChange={e => { r.noWar = e.target.checked; if (e.target.checked) god.endAllWars(w); g.emit(); }} /> 전쟁이 없는 세계</label>
        <label className="check"><input type="checkbox" checked={r.infiniteResources} onChange={e => { r.infiniteResources = e.target.checked; g.emit(); }} /> 무한 자원</label>
        <label className="slider">인구 증가 배율 ×{r.popGrowth.toFixed(1)}<input type="range" min={0} max={50} value={r.popGrowth * 10} onChange={e => { r.popGrowth = +e.target.value / 10; g.emit(); }} /></label>
        <label className="slider">AI 공격성 ×{r.aiAggression.toFixed(1)}<input type="range" min={0} max={30} value={r.aiAggression * 10} onChange={e => { r.aiAggression = +e.target.value / 10; g.emit(); }} /></label>
        <label className="slider">재해 빈도 ×{r.disasterRate.toFixed(1)}<input type="range" min={0} max={50} value={r.disasterRate * 10} onChange={e => { r.disasterRate = +e.target.value / 10; g.emit(); }} /></label>
        <label className="slider">기술 발전 속도 ×{r.techSpeed.toFixed(1)}<input type="range" min={0} max={50} value={r.techSpeed * 10} onChange={e => { r.techSpeed = +e.target.value / 10; g.emit(); }} /></label>
        <div className="row">
          <Btn small onClick={act('모든 전쟁 종결', () => god.endAllWars(w))}>🕊 모든 전쟁 즉시 종료</Btn>
          <Btn small onClick={act('해수면 상승', () => { god.seaLevel(w, true); g.terrainVersion++; })}>🌊 해수면 상승</Btn>
          <Btn small onClick={act('해수면 하강', () => { god.seaLevel(w, false); g.terrainVersion++; })}>🏝 해수면 하강</Btn>
        </div>
      </Section>
      <Section title="역사 빨리 감기 (백그라운드 계산)">
        <div className="row">{[10, 25, 50, 100].map(y => <Btn key={y} small onClick={() => g.fastForward(y)}>⏩ {y}년</Btn>)}</div>
      </Section>
    </div>
  );
}

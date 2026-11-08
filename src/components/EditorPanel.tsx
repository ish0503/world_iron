import { useState } from 'react';
import { useGame } from '../hooks/useGame';
import { TERRAINS, T } from '../data/terrain';
import { GOVS, GOV_IDS, PERSONALITIES, PERSONALITY_IDS } from '../data/defs';
import { setStartYear, editCountry } from '../editor/ScenarioEditor';
import { resetGodPick } from '../systems/MapActions';
import { ui } from '../systems/UIStore';
import { pushToast } from '../systems/EventManager';
import { Btn, CountryLink, Section } from './panelkit';
import { hex } from '../simulation/format';
import type { GovType, Personality } from '../types/Country';

const BRUSHES: (number | 'river' | 'unriver')[] = [T.SEA, T.DEEP, T.LAKE, T.PLAINS, T.FOREST, T.JUNGLE, T.DESERT, T.HILLS, T.MOUNTAIN, T.TUNDRA, T.SNOW, T.SWAMP, 'river', 'unriver'];

export function EditorPanel() {
  const g = useGame(); const w = g.world!;
  const [radius, setRadius] = useState(2);
  const sel = g.selection;
  const cid = sel.kind === 'country' ? sel.id : sel.kind === 'province' ? w.provinces[sel.id].owner : -1;
  const c = cid >= 0 ? w.countries[cid] : null;
  const tool = g.tool;
  const brushName = (b: number | 'river' | 'unriver') => b === 'river' ? '강 그리기' : b === 'unriver' ? '강 지우기' : TERRAINS[b].name;
  const brushColor = (b: number | 'river' | 'unriver') => b === 'river' ? '#4682be' : b === 'unriver' ? '#555' : `rgb(${TERRAINS[b].color.join(',')})`;
  const godTool = (action: string, arg?: any) => { resetGodPick(); g.setTool({ kind: 'god', action, arg }); };
  return (
    <div>
      <Section title="지형 브러시">
        <div className="brushes">
          {BRUSHES.map(b => (
            <button key={String(b)} className={tool.kind === 'terrain' && tool.brush === b ? 'on' : ''} onClick={() => g.setTool({ kind: 'terrain', brush: b, radius })}>
              <i style={{ background: brushColor(b) }} />{brushName(b)}
            </button>
          ))}
        </div>
        <label className="slider">브러시 크기 {radius}<input type="range" min={0} max={8} value={radius} onChange={e => { const r = +e.target.value; setRadius(r); if (tool.kind === 'terrain') g.setTool({ ...tool, radius: r }); }} /></label>
        <div className="small muted">바다로 칠하면 영토가 사라지고, 바다 위에 육지를 칠하면 새 땅(섬)이 생깁니다.</div>
      </Section>
      <Section title="영토 · 국가">
        <div className="grid2">
          <Btn small kind={tool.kind === 'assign' ? 'primary' : undefined} disabled={!c} onClick={() => c && g.setTool({ kind: 'assign', country: c.id })}>🖌 {c ? c.shortName : '국가'} 영토 칠하기</Btn>
          <Btn small onClick={() => godTool('createCountry', 4)}>🏳 새 국가 건국</Btn>
          <Btn small onClick={() => godTool('deleteCountry')}>✖ 국가 삭제</Btn>
          <Btn small onClick={() => godTool('unclaim')}>◻ 미개척지로</Btn>
          <Btn small onClick={() => godTool('capital')}>★ 수도 변경</Btn>
          <Btn small onClick={() => godTool('independence')}>🗽 강제 독립</Btn>
          <Btn small onClick={() => godTool('merge')}>🔗 국가 통합</Btn>
          <Btn small onClick={() => godTool('city')}>🏙 도시 생성</Btn>
          <Btn small onClick={() => godTool('port')}>⚓ 항구 생성</Btn>
          <Btn small onClick={() => godTool('pop+')}>👥 인구 증가</Btn>
          <Btn small onClick={() => godTool('pop-')}>💀 인구 감소</Btn>
          <Btn small onClick={() => godTool('resource', 'oil')}>🛢 유전 생성</Btn>
        </div>
      </Section>
      {c && (
        <Section title={<>국가 속성: <CountryLink id={c.id} /></>}>
          <label className="field">국가명<input value={c.shortName} onChange={e => { const v = e.target.value.slice(0, 12); editCountry(w, c.id, { shortName: v, name: `${v} ${c.name.split(' ').slice(1).join(' ') || GOVS[c.gov].suffix[0]}` }); g.mapVersion++; g.emit(); }} /></label>
          <label className="field">정식 국호<input value={c.name} onChange={e => { editCountry(w, c.id, { name: e.target.value.slice(0, 24) }); g.emit(); }} /></label>
          <label className="field">국가 색상<input type="color" value={hex(c.color)} onChange={e => { editCountry(w, c.id, { color: parseInt(e.target.value.slice(1), 16) }); g.mapVersion++; g.emit(); }} /></label>
          <label className="field">정부 형태<select value={c.gov} onChange={e => { editCountry(w, c.id, { gov: e.target.value as GovType }); g.mapVersion++; g.emit(); }}>{GOV_IDS.map(x => <option key={x} value={x}>{GOVS[x].name}</option>)}</select></label>
          <label className="field">AI 성격<select value={c.personality} onChange={e => { editCountry(w, c.id, { personality: e.target.value as Personality }); g.emit(); }}>{PERSONALITY_IDS.map(x => <option key={x} value={x}>{PERSONALITIES[x].name}</option>)}</select></label>
          <label className="field">국고 (B)<input type="number" value={Math.round(c.treasury)} onChange={e => { editCountry(w, c.id, { treasury: Math.max(0, +e.target.value) }); g.emit(); }} /></label>
        </Section>
      )}
      <Section title="시나리오 설정">
        <label className="field">시작 연도<input type="number" disabled={w.day > 0} value={w.startYear} min={1500} max={2200} onChange={e => { if (setStartYear(w, +e.target.value)) g.emit(); }} /></label>
        <label className="field">세계 이름<input value={w.name} onChange={e => { w.name = e.target.value.slice(0, 30); g.emit(); }} /></label>
        <Btn kind="primary" onClick={() => { g.setTool({ kind: 'select' }); ui.set({ modal: 'modeSelect', panel: null }); pushToast('시나리오 편집 완료', 'major'); }}>▶ 시나리오 시작</Btn>
      </Section>
    </div>
  );
}

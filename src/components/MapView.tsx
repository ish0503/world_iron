import { useEffect, useRef } from 'react';
import { MapEngine } from '../map/MapEngine';
import { game, type MapMode } from '../systems/GameController';
import { ui } from '../systems/UIStore';
import { handleClick, handlePaint } from '../systems/MapActions';
import { useGame } from '../hooks/useGame';
import { TERRAINS } from '../data/terrain';
import { fmtPop } from '../simulation/format';
import { cityTier, RESOURCES } from '../data/defs';
import { DISASTERS, type DisasterType } from '../simulation/EnvironmentSimulation';
import { computeBlocs } from '../simulation/Blocs';
import { WarHud } from './WarHud';

const GOD_LABEL: Record<string, string> = { war: '⚔ 전쟁 강제: 공격국 → 대상국 순서로 클릭', merge: '🔗 통합: 주체 국가 → 흡수될 국가 순서로 클릭', createCountry: '🏳 국가 건국', independence: '🗽 지역 독립', deleteCountry: '✖ 국가 삭제', unclaim: '◻ 영토 해방', capital: '★ 수도 지정', city: '🏙 도시 건설', port: '⚓ 항구 건설', 'pop+': '👥 인구 증가', 'pop-': '💀 인구 감소', nuke: '☢ 핵 공격: 목표 지역 선택', resource: '⛏ 자원 설정', disaster: '🌋 자연재해' };

export const MAP_MODES: { id: MapMode; name: string; icon: string }[] = [
  { id: 'political', name: '정치', icon: '🗺' },
  { id: 'terrain', name: '지형', icon: '⛰' },
  { id: 'population', name: '인구', icon: '👥' },
  { id: 'economy', name: '경제', icon: '💰' },
  { id: 'resource', name: '자원', icon: '⛏' },
  { id: 'military', name: '군사', icon: '⚔' },
  { id: 'supply', name: '보급', icon: '📦' },
  { id: 'blocs', name: '동맹 블록', icon: '🛡' },
  { id: 'diplomacy', name: '외교', icon: '🤝' },
  { id: 'government', name: '정치 성향', icon: '🏛' },
  { id: 'religion', name: '종교', icon: '⛪' },
  { id: 'culture', name: '문화', icon: '🎭' },
  { id: 'climate', name: '기후', icon: '🌡' },
  { id: 'tech', name: '기술', icon: '🔬' },
  { id: 'unrest', name: '불안', icon: '🔥' },
];

export function MapView() {
  const host = useRef<HTMLDivElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const g = useGame();
  useEffect(() => {
    const el = host.current!;
    const eng = new MapEngine(el, {
      onClick: handleClick,
      onPaint: handlePaint,
      onHover: (pid, x, y) => {
        const t = tip.current; const w = game.world;
        if (!t || !w || pid < 0) { if (t) t.style.display = 'none'; return; }
        const p = w.provinces[pid];
        const own = p.owner >= 0 ? w.countries[p.owner] : null;
        const ctl = p.controller !== p.owner && p.controller >= 0 ? w.countries[p.controller] : null;
        t.innerHTML = `<b>${p.name}</b> <span class="muted">${cityTier(p.pop).name}</span><br>${own ? own.name : '미개척지'}${ctl ? ` <span class="bad">(점령: ${ctl.shortName})</span>` : ''}<br><span class="muted">${TERRAINS[p.terrain].name} · 인구 ${fmtPop(p.pop)}${p.resource ? ' · ' + RESOURCES[p.resource].icon + RESOURCES[p.resource].name : ''}</span>`;
        t.style.display = 'block';
        const r = el.getBoundingClientRect();
        t.style.left = Math.min(x + 14, r.width - 230) + 'px'; t.style.top = Math.min(y + 14, r.height - 80) + 'px';
      },
    });
    ui.map = eng; (globalThis as any).__uiMap = eng;
    eng.init();
    return () => { eng.destroy(); if (ui.map === eng) ui.map = null; };
  }, []);
  const w = g.world;
  return (
    <div className="mapwrap">
      <div ref={host} className="map" />
      <div ref={tip} className="maptip" />
      <div className="mapmodes">
        {MAP_MODES.map(m => (
          <button key={m.id} className={g.mapMode === m.id ? 'on' : ''} onClick={() => g.setMapMode(m.id)} title={m.name}>
            <span className="ic">{m.icon}</span><span className="lb">{m.name}</span>
          </button>
        ))}
      </div>
      {w && w.mode === 'ruler' && w.offers.some(o => o.to === w.player) && <button className="inboxbtn" onClick={() => ui.set({ inbox: true })}>📨 {w.offers.filter(o => o.to === w.player).length}</button>}
      <div className="zoomctl">
        <button onClick={() => ui.map?.zoomBy(1.4)} title="확대">＋</button>
        <button onClick={() => ui.map?.zoomBy(1 / 1.4)} title="축소">－</button>
        <button onClick={() => ui.map?.fit()} title="전체 보기">⤢</button>
        {w && w.player >= 0 && <button onClick={() => ui.map?.focusProvince(w.countries[w.player].capital, 3)} title="수도로">★</button>}
      </div>
      {g.tool.kind !== 'select' && (
        <div className="toolhint">
          {g.tool.kind === 'move' && '이동할 지역을 탭/클릭하세요'}
          {g.tool.kind === 'terrain' && '지도를 드래그하여 지형을 칠하세요 (두 손가락/우클릭 드래그로 이동)'}
          {g.tool.kind === 'assign' && `클릭/드래그하여 ${w?.countries[g.tool.country]?.shortName ?? ''} 영토로 지정`}
          {g.tool.kind === 'god' && `${GOD_LABEL[g.tool.action.split(':')[0]] ?? g.tool.action}${g.tool.action.startsWith('disaster:') ? ' (' + (DISASTERS[g.tool.action.split(':')[1] as DisasterType]?.name ?? '') + ')' : ''} — 지도에서 대상 지역을 클릭하세요`}
          {g.tool.kind === 'pickCountry' && '통치할 국가를 지도에서 선택하세요'}
          <button onClick={() => g.setTool({ kind: 'select' })}>취소</button>
        </div>
      )}
      <MapLegend />
      <WarHud />
    </div>
  );
}

function MapLegend() {
  const g = useGame();
  const m = g.mapMode;
  const items: Record<string, [string, string][]> = {
    diplomacy: [['#ffd24a', '기준 국가'], ['#3a8ee8', '동맹'], ['#9a5ae0', '종속'], ['#d8342c', '교전'], ['#5ad0e0', '보장']],
    military: [['#e0603a', '전선'], ['#a04848', '전쟁 중'], ['#56606e', '평화']],
    population: [['#182846', '희박'], ['#f0d246', '보통'], ['#aa1428', '밀집']],
    economy: [['#182846', '낮음'], ['#f0d246', '보통'], ['#aa1428', '높음']],
    supply: [['#3caa5a', '양호'], ['#dc7832', '부족'], ['#303030', '없음']],
    unrest: [['#3caa5a', '안정'], ['#be2828', '불안']],
    resource: Object.values(RESOURCES).map(r => ['#' + r.color.toString(16).padStart(6, '0'), r.name] as [string, string]),
    climate: [['#5a78e6', '한랭'], ['#78c85a', '온화'], ['#dc5032', '고온']],
  };
  if (m === 'blocs' && g.world) {
    const { blocs } = computeBlocs(g.world);
    return <div className="legend">{blocs.slice(0, 6).map(b => <span key={b.id}><i style={{ background: '#' + b.color.toString(16).padStart(6, '0') }} />{b.name} ({b.members.length})</span>)}{!blocs.length && <span>동맹 블록 없음</span>}</div>;
  }
  const it = items[m];
  if (!it) return null;
  return <div className="legend">{it.map(([c, n]) => <span key={n}><i style={{ background: c }} />{n}</span>)}</div>;
}

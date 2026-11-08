import { useGame } from '../hooks/useGame';
import { BUILDINGS, BUILDING_IDS, cityTier, RESOURCES } from '../data/defs';
import { buildCost, startConstruction } from '../simulation/CountrySimulation';
import { fmtMoney, fmtPop } from '../simulation/format';
import { pushToast } from '../systems/EventManager';
import { NoSubjectWrap, Section, Stat } from './panelkit';
import { subject } from './CountryPanel';
import type { BuildingId } from '../types/Province';
import { TERRAINS } from '../data/terrain';

export function BuildList({ pid, cid }: { pid: number; cid: number }) {
  const g = useGame(); const w = g.world!;
  const p = w.provinces[pid]; const c = w.countries[cid];
  const build = (b: BuildingId) => { const e = startConstruction(w, cid, pid, b); pushToast(e ?? `${p.name}: ${BUILDINGS[b].name} 건설 시작`, e ? 'war' : 'info'); g.emit(); };
  return (
    <div className="buildlist">
      {p.construction && <div className="pill">🏗 {BUILDINGS[p.construction.b].name} 건설 중 — {Math.ceil(p.construction.days)}일 남음</div>}
      {BUILDING_IDS.map(b => {
        const lvl = p.buildings[b] || 0; const cost = buildCost(w, c, b, lvl);
        const blocked = lvl >= BUILDINGS[b].max || (b === 'port' && !p.coastal) || (b === 'mine' && (!p.resource || p.resource === 'food')) || !!p.construction || p.controller !== cid;
        return (
          <button key={b} className="buildbtn" disabled={blocked || c.treasury < cost} onClick={() => build(b)} title={BUILDINGS[b].desc}>
            <span>{BUILDINGS[b].icon} {BUILDINGS[b].name}</span><span className="lvl">{lvl}/{BUILDINGS[b].max}</span><span className="small muted">{fmtMoney(cost)}</span>
          </button>
        );
      })}
    </div>
  );
}

export function ConstructionPanel() {
  const g = useGame(); const w = g.world!;
  const { cid, canAct } = subject();
  if (cid < 0) return <NoSubjectWrap />;
  const sel = g.selection;
  const pid = sel.kind === 'province' && w.provinces[sel.id].owner === cid ? sel.id : -1;
  const building = w.provinces.filter(p => p.owner === cid && p.construction);
  return (
    <div>
      <Section title="진행 중인 건설">
        {building.length ? building.map(p => <Stat key={p.id} k={p.name} v={`${BUILDINGS[p.construction!.b].name} · ${Math.ceil(p.construction!.days)}일`} />) : <div className="muted">없음</div>}
      </Section>
      {pid < 0 ? <div className="muted pad">건설할 자국 지역을 지도에서 선택하세요.</div> : (
        <Section title={`${w.provinces[pid].name} — ${cityTier(w.provinces[pid].pop).name}`}>
          <Stat k="인구" v={fmtPop(w.provinces[pid].pop)} />
          <Stat k="지형" v={TERRAINS[w.provinces[pid].terrain].name} />
          <Stat k="자원" v={w.provinces[pid].resource ? `${RESOURCES[w.provinces[pid].resource!].name} ×${w.provinces[pid].resourceAmount}` : '없음'} />
          {canAct ? <BuildList pid={pid} cid={cid} /> : <div className="muted small">통치 중인 국가만 건설할 수 있습니다.</div>}
        </Section>
      )}
    </div>
  );
}

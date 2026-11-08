import { game } from './GameController';
import { ui } from './UIStore';
import { pushToast } from './EventManager';
import type { MapClick } from '../map/MapEngine';
import { orderMove } from '../simulation/MilitarySimulation';
import { paintTerrain, afterGeometryChange, assignProvince, createCountryAt, deleteCountry, setCapital, buildCity, buildPort, setResource, changeProvincePop, forceIndependence, god } from '../editor/WorldEditor';
import type { DisasterType } from '../simulation/EnvironmentSimulation';
import type { ResourceId } from '../types/Province';
import { cname, chronicle } from '../simulation/WorldHelpers';
import { launchNuke, nukeEffect } from '../simulation/Extras';

let geoTimer: ReturnType<typeof setTimeout> | null = null;

/** 지형 브러시 / 영토 지정 드래그 */
export function handlePaint(x: number, y: number, first: boolean): boolean {
  const w = game.world; if (!w) return false;
  const t = game.tool;
  if (t.kind === 'terrain') {
    const n = paintTerrain(w, x, y, t.radius, t.brush, true);
    if (n) {
      game.terrainVersion++;
      if (geoTimer) clearTimeout(geoTimer);
      geoTimer = setTimeout(() => { afterGeometryChange(w); game.terrainVersion++; game.emit(); }, 300);
    }
    return true;
  }
  if (t.kind === 'assign') {
    if (x < 0 || y < 0 || x >= w.width || y >= w.height) return true;
    const p = w.cellProv[y * w.width + x];
    if (p >= 0 && w.provinces[p].owner !== t.country) { assignProvince(w, p, t.country); game.mapVersion++; game.emit(); }
    void first;
    return true;
  }
  return false;
}

let warPick = -1;

export function handleClick(c: MapClick) {
  const w = game.world; if (!w) return;
  const t = game.tool;
  const sel = game.selection;
  const canCommand = (owner: number) => w.mode === 'god' || w.mode === 'editor' || (w.mode === 'ruler' && owner === w.player);

  // 이동 명령: 우클릭 또는 이동 도구
  if ((c.button === 2 || t.kind === 'move') && sel.kind === 'army' && c.province >= 0) {
    if (!canCommand(sel.owner)) { pushToast('이 부대를 지휘할 권한이 없습니다', 'war'); return; }
    const ok = orderMove(w, sel.divs, c.province);
    for (const id of sel.divs) { const d = w.divisions.find(x => x.id === id); if (d && w.mode === 'ruler') d.aiControlled = false; }
    pushToast(ok ? `${sel.divs.length}개 사단 → ${w.provinces[c.province].name} 이동` : '이동할 수 없는 지역입니다 (통행권/경로 없음)', ok ? 'info' : 'war');
    if (t.kind === 'move') game.setTool({ kind: 'select' });
    game.mapVersion++; game.emit();
    return;
  }
  if (c.button === 2) return;

  if (t.kind === 'pickCountry') {
    if (c.province >= 0 && w.provinces[c.province].owner >= 0) {
      game.select({ kind: 'country', id: w.provinces[c.province].owner });
      game.setTool({ kind: 'select' });
      ui.set({ modal: 'modeSelect' });
    }
    return;
  }
  if (t.kind === 'god' && c.province >= 0) { applyGodTool(t.action, t.arg, c.province); return; }

  // 선택
  if (c.battle >= 0) { game.select({ kind: 'battle', id: c.battle }); ui.set({ rightOpen: true }); return; }
  if (c.stack) { game.select({ kind: 'army', province: c.stack.province, owner: c.stack.owner, divs: c.stack.divs }); ui.set({ rightOpen: true }); return; }
  if (c.province < 0) { game.select({ kind: 'none' }); return; }
  const p = w.provinces[c.province];
  if (sel.kind === 'province' && sel.id === c.province && p.owner >= 0) game.select({ kind: 'country', id: p.owner });
  else game.select({ kind: 'province', id: c.province });
  ui.set({ rightOpen: true });
}

function applyGodTool(action: string, arg: any, pid: number) {
  const w = game.world!; const p = w.provinces[pid];
  const owner = p.owner;
  const done = (msg: string) => { pushToast(msg, 'god'); game.mapVersion++; game.emit(); };
  if (action === 'nuke') {
    const w2 = game.world!;
    if (w2.mode === 'ruler') { const r = launchNuke(w2, w2.player, pid); game.setTool({ kind: 'select' }); return done(r.msg); }
    const dead = nukeEffect(w2, pid); chronicle(w2, 'war', `☢ ${p.name} 핵폭발`, `신의 개입으로 ${p.name}에서 핵폭발이 일어나 약 ${Math.round(dead / 1000)}천 명이 희생되었다.`, owner >= 0 ? [owner] : [], true, pid);
    return done(`${p.name} 핵폭발`);
  }
  if (action.startsWith('disaster:')) { god.disaster(w, action.split(':')[1] as DisasterType, pid); game.terrainVersion++; return done(`${p.name}에 ${action.split(':')[1]} 발생`); }
  switch (action) {
    case 'createCountry': { const id = createCountryAt(w, pid, { size: arg ?? 3 }); return done(id >= 0 ? `${w.countries[id].name} 건국` : '건국 실패'); }
    case 'deleteCountry': if (owner >= 0) { const n = cname(w, owner); deleteCountry(w, owner); return done(`${n} 삭제`); } return;
    case 'independence': { const id = forceIndependence(w, pid); return done(id >= 0 ? `${w.countries[id].name} 독립` : '독립 불가'); }
    case 'capital': if (owner >= 0) { setCapital(w, owner, pid); return done(`${cname(w, owner)} 수도 → ${p.name}`); } return;
    case 'city': buildCity(w, pid); return done(`${p.name} 도시 건설`);
    case 'port': return done(buildPort(w, pid) ? `${p.name} 항구 건설` : '해안 지역이 아닙니다');
    case 'resource': setResource(w, pid, (arg as ResourceId) ?? null, 3); return done(`${p.name} 자원 설정`);
    case 'pop+': changeProvincePop(w, pid, 1.5); return done(`${p.name} 인구 +50%`);
    case 'pop-': changeProvincePop(w, pid, 0.6); return done(`${p.name} 인구 -40%`);
    case 'unclaim': assignProvince(w, pid, -1); return done(`${p.name} 미개척지화`);
    case 'war': {
      if (owner < 0) return;
      if (warPick < 0) { warPick = owner; return done(`공격국: ${cname(w, owner)} — 이제 대상 국가를 클릭하세요`); }
      if (warPick === owner) return;
      const a = warPick; warPick = -1;
      const war = god.forceWar(w, a, owner);
      game.setTool({ kind: 'select' });
      return done(war ? `${war.name} 강제 발발` : '전쟁을 일으킬 수 없습니다');
    }
    case 'merge': {
      if (owner < 0) return;
      if (warPick < 0) { warPick = owner; return done(`통합 주체: ${cname(w, owner)} — 흡수될 국가를 클릭하세요`); }
      if (warPick === owner) return;
      const a = warPick; warPick = -1; god.merge(w, a, owner); game.setTool({ kind: 'select' });
      return done('국가 통합 완료');
    }
  }
}
export function resetGodPick() { warPick = -1; }

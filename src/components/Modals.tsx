import { useEffect, useRef, useState } from 'react';
import { useGame, useUI } from '../hooks/useGame';
import { ui } from '../systems/UIStore';
import { game } from '../systems/GameController';
import { respondOffer, proposePeace } from '../simulation/DiplomacySimulation';
import { warScore, peaceCost, sideOf, provinceValue } from '../simulation/WarSimulation';
import { listSaves, saveToDB, loadFromDB, deleteSave, exportJSON, type SaveMeta } from '../systems/SaveSystem';
import { importJSONFile } from '../systems/LoadSystem';
import { pushToast } from '../systems/EventManager';
import { Btn, CountryLink, Flag } from './common';
import type { PeaceTerms } from '../types/World';
import { GOVS, PERSONALITIES } from '../data/defs';
import { fmtMoney, fmtPop } from '../simulation/format';

function Modal({ title, children, onClose, wide }: { title: React.ReactNode; children: React.ReactNode; onClose?: () => void; wide?: boolean }) {
  return (
    <div className="modalbg" onClick={e => { if (e.target === e.currentTarget && onClose) onClose(); }}>
      <div className={`modal ${wide ? 'wide' : ''}`}>
        <header><h3>{title}</h3>{onClose && <button className="x" onClick={onClose}>✕</button>}</header>
        <div className="mbody">{children}</div>
      </div>
    </div>
  );
}
const close = () => ui.set({ modal: null });

export function Modals() {
  const s = useUI();
  const g = useGame();
  const w = g.world;
  const offers = w && w.mode === 'ruler' ? w.offers.filter(o => o.to === w.player) : [];
  const critical = offers.some(o => o.kind === 'peace' || o.kind === 'ultimatum' || o.kind === 'vassal');
  return (
    <>
      {offers.length > 0 && !s.modal && (critical || s.inbox) && <OfferModal />}
      {s.modal === 'save' && <SaveModal />}
      {s.modal === 'settings' && <SettingsModal />}
      {s.modal === 'help' && <HelpModal />}
      {s.modal === 'peace' && <PeaceModal warId={s.peaceWar} />}
      {s.modal === 'modeSelect' && <ModeSelectModal />}
      {s.modal === 'menu' && <MenuModal />}
      {w?.victory && !s.modal && <VictoryModal />}
    </>
  );
}

function OfferModal() {
  const g = useGame(); const w = g.world!;
  const mine = w.offers.filter(x => x.to === w.player);
  const o = mine.find(x => x.kind === 'peace' || x.kind === 'ultimatum' || x.kind === 'vassal') ?? mine[0];
  if (!o) { if (ui.state.inbox) setTimeout(() => ui.set({ inbox: false }), 0); return null; }
  const F = w.countries[o.from];
  return (
    <Modal title={<><Flag color={F.color} /> {F.name}의 외교 문서 {mine.length > 1 && <span className="pill">{mine.length}건</span>}</>} onClose={() => ui.set({ inbox: false })}>
      <p className="letter">{o.text}</p>
      {o.terms && <div className="small muted">조건: 할양 {o.terms.takeProvinces.map(p => w.provinces[p].name).join(', ') || '없음'}{o.terms.reparations ? ` · 배상금 ${o.terms.reparations}B` : ''}</div>}
      {o.provinces && <div className="small muted">요구 지역: {o.provinces.map(p => w.provinces[p].name).join(', ')}</div>}
      <div className="row end">
        <Btn kind="danger" onClick={() => { respondOffer(w, o.id, false); g.mapVersion++; g.emit(); }}>거부</Btn>
        <Btn kind="primary" onClick={() => { respondOffer(w, o.id, true); g.mapVersion++; g.emit(); }}>수락</Btn>
      </div>
    </Modal>
  );
}

function PeaceModal({ warId }: { warId: number }) {
  const g = useGame(); const w = g.world!;
  const war = w.wars.find(x => x.id === warId && x.active);
  const me = w.player >= 0 ? w.player : -1;
  const [terms, setTerms] = useState<PeaceTerms>({ takeProvinces: [], reparations: 0, vassalize: false, annex: false, regimeChange: false, release: false, dmz: false });
  if (!war || me < 0) return <Modal title="평화 협상" onClose={close}><p className="muted">협상할 수 있는 전쟁이 없습니다.</p></Modal>;
  const side = sideOf(war, me)!;
  const enemies = side === 'A' ? war.defenders : war.attackers;
  const mine = side === 'A' ? war.attackers : war.defenders;
  const score = side === 'A' ? warScore(w, war) : -warScore(w, war);
  const occupied = w.provinces.filter(p => p.active && enemies.includes(p.owner) && mine.includes(p.controller));
  const cost = peaceCost(w, terms);
  const toggle = (pid: number) => setTerms(t => ({ ...t, takeProvinces: t.takeProvinces.includes(pid) ? t.takeProvinces.filter(x => x !== pid) : [...t.takeProvinces, pid] }));
  const flag = (k: keyof PeaceTerms) => setTerms(t => ({ ...t, [k]: !t[k] }));
  const send = (white: boolean) => {
    const r = proposePeace(w, me, war.id, white ? null : terms);
    pushToast(r.msg, r.ok ? 'major' : 'war');
    if (r.ok) close();
    g.mapVersion++; g.emit();
  };
  return (
    <Modal title={`평화 협상 — ${war.name}`} onClose={close} wide>
      <div className="row"><span>전쟁 점수 <b className={score >= 0 ? 'good' : 'bad'}>{score.toFixed(0)}</b></span><span>요구 비용 <b className={cost > Math.max(0, score) ? 'bad' : 'good'}>{cost.toFixed(0)}</b></span></div>
      <div className="small muted">적국: {enemies.map(e => <CountryLink key={e} id={e} />)} — 요구 비용이 전쟁 점수(+상대 피로도)를 넘으면 거부됩니다.</div>
      <h4>점령지 할양 ({occupied.length})</h4>
      <div className="provpick">
        {occupied.map(p => <label key={p.id} className="check"><input type="checkbox" checked={terms.takeProvinces.includes(p.id)} onChange={() => toggle(p.id)} /> {p.name} <span className="muted small">({(provinceValue(w, p.id) * 2.2).toFixed(0)})</span></label>)}
        {!occupied.length && <span className="muted small">점령한 지역이 없습니다</span>}
      </div>
      <div className="row"><Btn small onClick={() => setTerms(t => ({ ...t, takeProvinces: occupied.map(p => p.id) }))}>전체 선택</Btn></div>
      <h4>추가 조건</h4>
      <label className="slider">배상금 {terms.reparations}B<input type="range" min={0} max={200} value={terms.reparations} onChange={e => setTerms(t => ({ ...t, reparations: +e.target.value }))} /></label>
      <div className="grid2">
        <label className="check"><input type="checkbox" checked={terms.vassalize} onChange={() => flag('vassalize')} /> 종속국화 (35)</label>
        <label className="check"><input type="checkbox" checked={terms.annex} onChange={() => flag('annex')} /> 전면 병합 (80)</label>
        <label className="check"><input type="checkbox" checked={terms.regimeChange} onChange={() => flag('regimeChange')} /> 정권 교체 (25)</label>
        <label className="check"><input type="checkbox" checked={terms.release} onChange={() => flag('release')} /> 국가 독립 (15)</label>
        <label className="check"><input type="checkbox" checked={terms.dmz} onChange={() => flag('dmz')} /> 비무장지대 (8)</label>
      </div>
      <div className="row end">
        <Btn onClick={() => send(true)}>백색 평화 제안</Btn>
        <Btn kind="primary" onClick={() => send(false)}>조건 제시</Btn>
      </div>
    </Modal>
  );
}

function SaveModal() {
  const g = useGame(); const w = g.world;
  const [saves, setSaves] = useState<SaveMeta[]>([]);
  const [name, setName] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const refresh = () => listSaves().then(setSaves).catch(() => setSaves([]));
  useEffect(() => { refresh(); }, []);
  const doSave = async (id?: string) => {
    if (!w) return;
    try {
      const nm = name.trim() || `${w.name} ${w.startYear + Math.floor(w.day / 365)}년`;
      await saveToDB(w, id ?? 'save-' + Date.now(), nm);
      pushToast('저장 완료', 'save'); setName(''); refresh();
    } catch (e) { pushToast('저장 실패: ' + (e as Error).message, 'war'); }
  };
  const doLoad = async (id: string) => {
    try { const lw = await loadFromDB(id); game.setWorld(lw); game.time.setSpeed(0); pushToast('불러오기 완료', 'save'); ui.set({ modal: null, panel: null }); window.dispatchEvent(new Event('wd-ingame')); }
    catch (e) { pushToast('불러오기 실패: ' + (e as Error).message, 'war'); }
  };
  return (
    <Modal title="저장 · 불러오기" onClose={close} wide>
      {w && <div className="row">
        <input className="grow" placeholder="저장 이름" value={name} onChange={e => setName(e.target.value)} />
        <Btn kind="primary" onClick={() => doSave()}>새로 저장</Btn>
        <Btn onClick={() => exportJSON(w, `world-dominion-${w.startYear + Math.floor(w.day / 365)}.json`)}>JSON 내보내기</Btn>
      </div>}
      <div className="row">
        <Btn onClick={() => fileRef.current?.click()}>JSON 가져오기</Btn>
        <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={async e => {
          const f = e.target.files?.[0]; if (!f) return;
          try { const lw = await importJSONFile(f); game.setWorld(lw); game.time.setSpeed(0); pushToast('가져오기 완료', 'save'); ui.set({ modal: null }); window.dispatchEvent(new Event('wd-ingame')); }
          catch (er) { pushToast('가져오기 실패: ' + (er as Error).message, 'war'); }
          e.target.value = '';
        }} />
      </div>
      <div className="savelist">
        {saves.map(s => (
          <div key={s.id} className="saverow">
            <div><b>{s.name}</b>{s.auto && <span className="pill">자동</span>}<div className="small muted">{s.gameDate} · {s.player} · {s.countries}개국 · v{s.version} · {new Date(s.savedAt).toLocaleString()}</div></div>
            <div className="row">
              <Btn small kind="primary" onClick={() => doLoad(s.id)}>불러오기</Btn>
              {w && !s.auto && <Btn small onClick={() => doSave(s.id)}>덮어쓰기</Btn>}
              <Btn small kind="danger" onClick={async () => { await deleteSave(s.id); refresh(); }}>삭제</Btn>
            </div>
          </div>
        ))}
        {!saves.length && <div className="muted pad">저장된 게임이 없습니다.</div>}
      </div>
    </Modal>
  );
}

function SettingsModal() {
  const g = useGame(); const s = g.settings;
  return (
    <Modal title="설정" onClose={close}>
      <label className="field">자동 저장 주기
        <select value={s.autosaveMonths} onChange={e => g.updateSettings({ autosaveMonths: +e.target.value })}>
          <option value={0}>끄기</option><option value={1}>매월</option><option value={3}>3개월</option><option value={6}>6개월</option><option value={12}>매년</option>
        </select></label>
      <label className="field">알림
        <select value={s.notify} onChange={e => g.updateSettings({ notify: e.target.value as typeof s.notify })}>
          <option value="all">전체 (전쟁 소식 포함)</option><option value="major">주요 사건</option><option value="mine">내 국가 + 세계적 사건만</option><option value="off">끄기</option>
        </select></label>
      <label className="check"><input type="checkbox" checked={s.showProvinceBorders} onChange={e => g.updateSettings({ showProvinceBorders: e.target.checked })} /> 프로빈스 경계선 표시</label>
      <label className="check"><input type="checkbox" checked={s.showLabels} onChange={e => g.updateSettings({ showLabels: e.target.checked })} /> 국가 이름 표시</label>
      <label className="check"><input type="checkbox" checked={s.showUnits} onChange={e => g.updateSettings({ showUnits: e.target.checked })} /> 부대 표시</label>
      <div className="small muted pad">시뮬레이션 성능: 하루 평균 {g.perf.dayMs.toFixed(2)}ms · 누적 {g.perf.days}일</div>
    </Modal>
  );
}

function HelpModal() {
  return (
    <Modal title="조작 안내" onClose={close} wide>
      <div className="help">
        <h4>지도</h4>
        <ul><li>드래그: 지도 이동 · 휠/핀치: 확대·축소</li><li>지역 클릭: 프로빈스 정보 · 같은 지역 다시 클릭: 국가 정보</li><li>부대 표식 클릭: 부대 선택 → <b>우클릭</b>(모바일: 이동 명령 버튼 후 탭)으로 이동</li><li>⚔ 표식: 전투 상세</li></ul>
        <h4>모드</h4>
        <ul><li>👑 통치: 한 국가의 정치·경제·외교·군사를 직접 운영</li><li>👁 관찰: 개입 없이 AI 국가들의 역사를 지켜봄</li><li>⚡ 신: 전쟁 강제, 재해, 국가 통합·분열, 세계 규칙 변경</li><li>✏ 편집: 지형·영토·국가를 직접 설계 (시간 정지)</li></ul>
        <h4>단축키</h4>
        <ul><li>Space: 일시정지/재개 · 1~7: 배속 · Esc: 선택 해제</li></ul>
        <h4>전쟁의 원리</h4>
        <p className="small">전투력 = 공격 × 사기·조직 × 보급 × 지형·기후, 방어력 = 방어 × 요새 × 지형 × 지휘. 보급은 수도·항구에서 철도와 지형을 따라 전달되며, 포위되면 사단이 괴멸합니다. 수도를 잃고 영토 대부분이 점령되면 항복합니다.</p>
      </div>
    </Modal>
  );
}

export function ModeSelectModal() {
  const g = useGame(); const w = g.world!;
  const sel = g.selection;
  const cid = sel.kind === 'country' ? sel.id : sel.kind === 'province' ? w.provinces[sel.id].owner : -1;
  const c = cid >= 0 ? w.countries[cid] : null;
  const big = w.countries.filter(x => x.alive).sort((a, b) => b.gdp - a.gdp).slice(0, 8);
  const start = (fn: () => void) => { fn(); ui.set({ modal: null }); g.setTool({ kind: 'select' }); g.select({ kind: 'none' }); g.time.setSpeed(1); };
  return (
    <Modal title="플레이 방식 선택" onClose={close} wide>
      <div className="modegrid">
        <div className="modecard">
          <h4>👑 국가 통치</h4>
          <p className="small muted">국가 하나를 선택해 세계 패권에 도전합니다. 지도에서 국가를 클릭하거나 아래에서 선택하세요.</p>
          {c ? <div className="chosen"><Flag color={c.color} size={18} /> <b>{c.name}</b><div className="small muted">{GOVS[c.gov].name} · {PERSONALITIES[c.personality].name} · {c.provinceCount}개 지역 · {fmtPop(c.population)} · {fmtMoney(c.gdp)}</div></div> : <div className="muted small">선택된 국가 없음</div>}
          <div className="tags">{big.map(b => <button key={b.id} className={`clink ${cid === b.id ? 'on' : ''}`} onClick={() => { g.select({ kind: 'country', id: b.id }); ui.map?.focusProvince(b.capital, 1.6); }}><Flag color={b.color} size={11} /> {b.shortName}</button>)}</div>
          <div className="row"><Btn small onClick={() => { ui.set({ modal: null }); g.setTool({ kind: 'pickCountry' }); }}>지도에서 고르기</Btn>
            <Btn kind="primary" disabled={!c} onClick={() => start(() => { g.setMode('ruler', c!.id); if (window.innerWidth > 760) ui.set({ panel: 'country' }); })}>통치 시작</Btn></div>
        </div>
        <div className="modecard"><h4>👁 세계 관찰</h4><p className="small muted">어떤 국가도 조종하지 않고, 국가들이 스스로 발전하고 전쟁하는 역사를 지켜봅니다.</p><Btn kind="primary" onClick={() => start(() => g.setMode('observer'))}>관찰 시작</Btn></div>
        <div className="modecard"><h4>⚡ 신 모드</h4><p className="small muted">세계의 규칙을 바꾸고 국가와 자연에 직접 개입합니다.</p><Btn kind="primary" onClick={() => start(() => { g.setMode('god'); if (window.innerWidth > 760) ui.set({ panel: 'god' }); })}>신 모드 시작</Btn></div>
        <div className="modecard"><h4>✏ 시나리오 편집</h4><p className="small muted">지형, 국경, 국가, 자원, 시작 연도를 직접 설정합니다.</p><Btn onClick={() => { g.setMode('editor'); g.time.setSpeed(0); ui.set({ modal: null, panel: 'editor' }); }}>편집기 열기</Btn></div>
      </div>
    </Modal>
  );
}

function VictoryModal() {
  const g = useGame(); const w = g.world!;
  const c = w.countries[w.player];
  const close2 = () => { w.victory = false; g.emit(); };
  return (
    <Modal title="🌐 세계 패권 달성!" onClose={close2}>
      <p className="letter">{c?.name}이(가) 세계 인구의 40% 이상을 지배하는 패권국이 되었다. {w.startYear + Math.floor(w.day / 365)}년, 역사는 이 순간을 기록할 것이다.</p>
      <div className="small muted">업적 {w.achievements?.length ?? 0}개 · 계속 플레이할 수 있습니다.</div>
      <div className="row end"><Btn kind="primary" onClick={close2}>계속하기</Btn></div>
    </Modal>
  );
}

function MenuModal() {
  const g = useGame();
  return (
    <Modal title="메뉴" onClose={close}>
      <div className="menucol">
        <Btn kind="primary" onClick={close}>계속하기</Btn>
        <Btn onClick={() => ui.set({ modal: 'save' })}>저장 · 불러오기</Btn>
        <Btn onClick={() => ui.set({ modal: 'modeSelect' })}>플레이 방식 변경</Btn>
        <Btn onClick={() => ui.set({ modal: 'settings' })}>설정</Btn>
        <Btn kind="danger" onClick={() => { g.time.setSpeed(0); ui.set({ modal: null, panel: null }); window.dispatchEvent(new Event('wd-title')); }}>타이틀 화면으로</Btn>
      </div>
    </Modal>
  );
}

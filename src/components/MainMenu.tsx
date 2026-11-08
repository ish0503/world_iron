import { useEffect, useRef, useState } from 'react';
import { game } from '../systems/GameController';
import { ui } from '../systems/UIStore';
import { WORLD_PRESETS, generateWorld } from '../simulation/WorldGen';
import { MapRenderer } from '../map/MapRenderer';
import { listSaves, loadFromDB, type SaveMeta } from '../systems/SaveSystem';
import { pushToast } from '../systems/EventManager';
import { useGame } from '../hooks/useGame';

const YEARS = [{ y: 1450, n: '1450 — 대항해 이전' }, { y: 1700, n: '1700 — 근세' }, { y: 1836, n: '1836 — 산업 혁명기' }, { y: 1936, n: '1936 — 세계대전 전야' }, { y: 1990, n: '1990 — 현대' }, { y: 2030, n: '2030 — 근미래' }];

function MenuBackground() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const w = generateWorld({ seed: Math.floor(Math.random() * 1e9), ...WORLD_PRESETS.small, startYear: 1936, landRatio: 0.4 });
    const r = new MapRenderer(w);
    r.prepareTerrain(w);
    r.render(w, { mode: 'political', focus: -1, highlight: -1, provinceBorders: true });
    r.canvas.className = 'menubgcanvas';
    ref.current?.appendChild(r.canvas);
    return () => { r.canvas.remove(); };
  }, []);
  return <div className="menubg" ref={ref} />;
}

export function MainMenu({ onStart }: { onStart: () => void }) {
  const g = useGame();
  const [preset, setPreset] = useState<keyof typeof WORLD_PRESETS>('medium');
  const [countries, setCountries] = useState(WORLD_PRESETS.medium.countries);
  const [year, setYear] = useState(1936);
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 999999));
  const [land, setLand] = useState(38);
  const [name, setName] = useState('새로운 세계');
  const [saves, setSaves] = useState<SaveMeta[]>([]);
  const [tab, setTab] = useState<'main' | 'new'>('main');
  const [editor, setEditor] = useState(false);
  const [real, setReal] = useState(false);
  const [density, setDensity] = useState(1);
  useEffect(() => { listSaves().then(setSaves).catch(() => {}); }, []);

  const create = async () => {
    const p = WORLD_PRESETS[preset];
    try {
      await game.generate({ seed, width: p.width, height: p.height, provinces: p.provinces, countries, startYear: real ? 2025 : year, landRatio: land / 100, name: real ? '실제 세계 2025' : name, real, density });
      onStart();
      if (editor) { game.setMode('editor'); game.time.setSpeed(0); ui.set({ panel: 'editor', modal: null }); }
      else ui.set({ modal: 'modeSelect' });
    } catch (e) { pushToast('세계 생성 실패: ' + (e as Error).message, 'war'); }
  };
  const cont = async (id: string) => {
    try { const w = await loadFromDB(id); game.setWorld(w); game.time.setSpeed(0); onStart(); }
    catch (e) { pushToast('불러오기 실패: ' + (e as Error).message, 'war'); }
  };
  return (
    <div className="mainmenu">
      <MenuBackground />
      <div className="menupanel">
        <div className="menutitle">
          <div className="emblem">◈</div>
          <h1>WORLD DOMINION</h1>
          <p>국가 · 전쟁 · 문명 · 역사의 시뮬레이션</p>
          <span className="tagline">GRAND STRATEGY · WORLD SIMULATION · SANDBOX</span>
        </div>
        {tab === 'main' ? (
          <div className="menucol">
            {saves[0] && <button className="btn primary big" onClick={() => cont(saves[0].id)}>이어하기 <span className="small">{saves[0].name} · {saves[0].gameDate}</span></button>}
            <button className="btn primary big" onClick={() => { setEditor(false); setReal(true); setTab('new'); }}>실제 세계 2025 <span className="small">178개 실제 국가 · 실제 국경</span></button>
            <button className="btn primary big" onClick={() => { setEditor(false); setReal(false); setTab('new'); }}>가상 세계 생성 <span className="small">무작위 대륙과 국가</span></button>
            <button className="btn big" onClick={() => { setEditor(true); setTab('new'); }}>시나리오 편집기</button>
            <button className="btn big" onClick={() => ui.set({ modal: 'save' })}>불러오기</button>
            <button className="btn big" onClick={() => ui.set({ modal: 'help' })}>조작 안내</button>
          </div>
        ) : (
          <div className="newgame">
            <h3>{editor ? '편집할 세계 생성' : '새로운 세계 창조'}</h3>
            <div className="field">세계 유형
              <div className="seg two"><button className={real ? 'on' : ''} onClick={() => setReal(true)}>🌍 실제 세계<span className="small">2025년 국경</span></button><button className={!real ? 'on' : ''} onClick={() => setReal(false)}>🎲 가상 세계<span className="small">무작위 생성</span></button></div>
            </div>
            {real ? (<>
              <div className="field">지역 세분화
                <div className="seg">{[[0.7, '간략', '약 600'], [1, '보통', '약 850'], [1.4, '세밀', '약 1200']].map(([v, n, k]) => <button key={n as string} className={density === v ? 'on' : ''} onClick={() => setDensity(v as number)}>{n}<span className="small">{k}지역</span></button>)}</div>
              </div>
              <div className="small muted">실제 국가의 인구·경제 규모·정부 형태·동맹(NATO 등)·적대 관계·핵무기가 반영됩니다. 이후의 역사는 시뮬레이션이 만들어 갑니다.</div>
            </>) : (<>
            <label className="field">세계 이름<input value={name} onChange={e => setName(e.target.value)} /></label>
            <div className="field">세계 크기
              <div className="seg">{(['small', 'medium', 'large'] as const).map(k => <button key={k} className={preset === k ? 'on' : ''} onClick={() => { setPreset(k); setCountries(WORLD_PRESETS[k].countries); }}>{k === 'small' ? '소형' : k === 'medium' ? '중형' : '대형'}<span className="small">{WORLD_PRESETS[k].provinces}지역</span></button>)}</div>
            </div>
            <label className="slider">국가 수 {countries}<input type="range" min={4} max={Math.min(80, Math.floor(WORLD_PRESETS[preset].provinces / 4))} value={countries} onChange={e => setCountries(+e.target.value)} /></label>
            <label className="slider">육지 비율 {land}%<input type="range" min={20} max={60} value={land} onChange={e => setLand(+e.target.value)} /></label>
            <label className="field">시작 연도<select value={year} onChange={e => setYear(+e.target.value)}>{YEARS.map(y => <option key={y.y} value={y.y}>{y.n}</option>)}</select></label>
            </>)}
            <label className="field">시드<div className="row"><input type="number" value={seed} onChange={e => setSeed(+e.target.value)} /><button className="btn sm" onClick={() => setSeed(Math.floor(Math.random() * 999999))}>🎲</button></div></label>
            <div className="row end">
              <button className="btn" onClick={() => setTab('main')}>뒤로</button>
              <button className="btn primary" disabled={!!g.busy} onClick={create}>{editor ? '편집 시작' : '세계 생성'}</button>
            </div>
          </div>
        )}
        <div className="menufoot">v1.0 · 싱글 플레이 · 브라우저 로컬 저장</div>
      </div>
    </div>
  );
}

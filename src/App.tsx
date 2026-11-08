import { useEffect, useState } from 'react';
import { game } from './systems/GameController';
import { ui } from './systems/UIStore';
import { useGame, useUI } from './hooks/useGame';
import { MainMenu } from './components/MainMenu';
import { TopBar } from './components/TopBar';
import { LeftNav, LeftPanel } from './components/LeftPanel';
import { RightPanel } from './components/RightPanel';
import { BottomBar } from './components/BottomBar';
import { MapView } from './components/MapView';
import { Modals } from './components/Modals';
import { Toasts, BusyOverlay } from './components/Toasts';
import './styles/global.css';
import './styles/game.css';

export default function App() {
  const g = useGame();
  const s = useUI();
  const [screen, setScreen] = useState<'menu' | 'game'>('menu');
  useEffect(() => {
    const toTitle = () => setScreen('menu');
    const toGame = () => setScreen('game');
    window.addEventListener('wd-title', toTitle);
    window.addEventListener('wd-ingame', toGame);
    game.start();
    const key = (e: KeyboardEvent) => {
      if (!game.world || (e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'SELECT') return;
      if (e.code === 'Space') { e.preventDefault(); if (game.world.mode !== 'editor') game.time.togglePause(); game.emit(); }
      else if (/^Digit[1-5]$/.test(e.code) && game.world.mode !== 'editor') { game.time.setSpeed(+e.code.slice(5)); game.emit(); }
      else if (e.code === 'Escape') { game.setTool({ kind: 'select' }); game.select({ kind: 'none' }); ui.set({ modal: null }); }
    };
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('wd-title', toTitle); window.removeEventListener('wd-ingame', toGame); window.removeEventListener('keydown', key); };
  }, []);
  return (
    <div className={`app ${s.panel ? 'has-left' : ''}`}>
      {screen === 'menu' || !g.world ? (
        <MainMenu onStart={() => setScreen('game')} />
      ) : (
        <div className="game">
          <TopBar />
          <div className="middle">
            <LeftNav />
            <LeftPanel />
            <MapView />
            <RightPanel />
            <button className="mobile-menu" onClick={() => ui.set({ mobileLeft: !s.mobileLeft })} aria-label="메뉴">☰</button>
          </div>
          <BottomBar />
        </div>
      )}
      <Modals />
      <Toasts />
      {g.busy && <BusyOverlay msg={g.busy.msg} p={g.busy.p} />}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { onToast, type Toast } from '../systems/EventManager';

/** 화면을 가리지 않는 작은 알림: 최대 2~3개, 중복 제거, 탭하면 닫힘 */
export function Toasts() {
  const [list, setList] = useState<Toast[]>([]);
  useEffect(() => {
    let lastText = ''; let lastAt = 0;
    return onToast(t => {
      const now = Date.now();
      if (t.text === lastText && now - lastAt < 4000) return;
      lastText = t.text; lastAt = now;
      const mobile = window.innerWidth < 760;
      setList(l => [...l.slice(mobile ? -1 : -2), t]);
      setTimeout(() => setList(l => l.filter(x => x.id !== t.id)), t.type === 'major' || t.type === 'mine' ? 4500 : 2800);
    });
  }, []);
  return (
    <div className="toasts">
      {list.map(t => <div key={t.id} className={`toast ${t.type}`} onClick={() => setList(l => l.filter(x => x.id !== t.id))}>{t.text}</div>)}
    </div>
  );
}

export function BusyOverlay({ msg, p }: { msg: string; p: number }) {
  return (
    <div className="busy">
      <div className="busybox">
        <div className="spinner">◈</div>
        <div>{msg}</div>
        <div className="bar"><div style={{ width: Math.round(p * 100) + '%' }} /></div>
      </div>
    </div>
  );
}

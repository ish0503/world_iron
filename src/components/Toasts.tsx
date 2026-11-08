import { useEffect, useState } from 'react';
import { onToast, type Toast } from '../systems/EventManager';

export function Toasts() {
  const [list, setList] = useState<Toast[]>([]);
  useEffect(() => onToast(t => {
    setList(l => [...l.slice(-4), t]);
    setTimeout(() => setList(l => l.filter(x => x.id !== t.id)), t.type === 'major' ? 6000 : 3500);
  }), []);
  return <div className="toasts">{list.map(t => <div key={t.id} className={`toast ${t.type}`}>{t.text}</div>)}</div>;
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

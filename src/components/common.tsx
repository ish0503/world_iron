import React from 'react';
import { hex } from '../simulation/format';
import { game } from '../systems/GameController';
import { ui } from '../systems/UIStore';

export function Flag({ color, size = 14, tag }: { color: number; size?: number; tag?: string }) {
  return <span className="flag" style={{ width: size * 1.5, height: size, background: `linear-gradient(135deg, ${hex(color)} 0 62%, rgba(0,0,0,.35) 62% 70%, ${hex(color)} 70%)` }} title={tag} />;
}

export function CountryLink({ id, short = true }: { id: number; short?: boolean }) {
  const w = game.world; if (!w || id < 0) return <span className="muted">미개척지</span>;
  const c = w.countries[id]; if (!c) return null;
  return (
    <button className="clink" onClick={() => { game.select({ kind: 'country', id }); ui.set({ rightOpen: true }); const cap = w.provinces[c.capital]; if (cap && ui.map) ui.map.focusProvince(cap.id); }}>
      <Flag color={c.color} size={11} /> {short ? c.shortName : c.name}{!c.alive && ' †'}
    </button>
  );
}

export function Bar({ value, max = 100, color = '#d4af37', label }: { value: number; max?: number; color?: string; label?: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return <div className="bar" title={label}><div style={{ width: pct + '%', background: color }} /></div>;
}

export function Stat({ k, v, tone }: { k: React.ReactNode; v: React.ReactNode; tone?: 'good' | 'bad' | 'warn' }) {
  return <div className="stat"><span className="k">{k}</span><span className={'v ' + (tone || '')}>{v}</span></div>;
}

export function Section({ title, children, right }: { title: React.ReactNode; children: React.ReactNode; right?: React.ReactNode }) {
  return <section className="sec"><header><h4>{title}</h4>{right}</header>{children}</section>;
}

export function Sparkline({ data, color = '#d4af37', height = 34 }: { data: number[]; color?: string; height?: number }) {
  if (data.length < 2) return <div className="muted small">기록 수집 중...</div>;
  const min = Math.min(...data), max = Math.max(...data);
  const W = 220;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * W},${height - 2 - ((v - min) / Math.max(1e-9, max - min)) * (height - 4)}`).join(' ');
  return (
    <svg className="spark" viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" style={{ height }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function Btn({ children, onClick, disabled, kind, title, small }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; kind?: 'primary' | 'danger' | 'ghost'; title?: string; small?: boolean }) {
  return <button className={`btn ${kind || ''} ${small ? 'sm' : ''}`} onClick={onClick} disabled={disabled} title={title}>{children}</button>;
}

export function tone(v: number, good: number, bad: number): 'good' | 'bad' | 'warn' | undefined {
  if (good > bad) return v >= good ? 'good' : v <= bad ? 'bad' : 'warn';
  return v <= good ? 'good' : v >= bad ? 'bad' : 'warn';
}

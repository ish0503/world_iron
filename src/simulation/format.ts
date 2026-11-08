export function fmtPop(n: number): string {
  if (n >= 1e8) return (n / 1e8).toFixed(2) + '억';
  if (n >= 1e4) return Math.round(n / 1e4).toLocaleString() + '만';
  return Math.round(n).toLocaleString();
}
export function fmtMoney(b: number): string {
  const s = b < 0 ? '-' : '';
  const a = Math.abs(b);
  if (a >= 1000) return s + (a / 1000).toFixed(2) + 'T';
  if (a >= 10) return s + a.toFixed(1) + 'B';
  if (a >= 0.1) return s + a.toFixed(2) + 'B';
  return s + (a * 1000).toFixed(0) + 'M';
}
export function fmtPct(v: number, d = 1) { return (v * 100).toFixed(d) + '%'; }
export function hex(c: number) { return '#' + c.toString(16).padStart(6, '0'); }

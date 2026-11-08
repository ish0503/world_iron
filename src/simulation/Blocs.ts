import type { WorldState } from '../types/World';

export interface Bloc { id: number; leader: number; members: number[]; color: number; power: number; name: string; }

/** 동맹·종속 관계로 연결된 세력 블록 (union-find) */
export function computeBlocs(w: WorldState): { blocs: Bloc[]; of: Int32Array } {
  const n = w.countries.length;
  const par = Int32Array.from({ length: n }, (_, i) => i);
  const find = (a: number): number => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
  const uni = (a: number, b: number) => { const x = find(a), y = find(b); if (x !== y) par[x] = y; };
  // 강대국 중심 진영: 강대국끼리 동맹이면 같은 진영, 나머지는 가장 강한 동맹 강대국에 소속
  const live = w.countries.filter(c => c.alive);
  const great = new Set(live.sort((a, b) => b.militaryPower - a.militaryPower).slice(0, Math.max(4, Math.round(live.length / 12))).map(c => c.id));
  const allied = new Map<number, number[]>();
  for (const t of w.treaties) if (t.type === 'alliance' && w.countries[t.a]?.alive && w.countries[t.b]?.alive) {
    (allied.get(t.a) ?? allied.set(t.a, []).get(t.a)!).push(t.b); (allied.get(t.b) ?? allied.set(t.b, []).get(t.b)!).push(t.a);
    if (great.has(t.a) && great.has(t.b)) uni(t.a, t.b);
  }
  for (const c of w.countries) {
    if (!c.alive || great.has(c.id)) continue;
    if (c.overlord >= 0 && w.countries[c.overlord]?.alive) { uni(c.id, c.overlord); continue; }
    const gp = (allied.get(c.id) || []).filter(x => great.has(x)).sort((a, b) => w.countries[b].militaryPower - w.countries[a].militaryPower)[0];
    if (gp !== undefined) uni(c.id, gp);
  }
  const groups = new Map<number, number[]>();
  for (const c of w.countries) if (c.alive) { const r = find(c.id); let g = groups.get(r); if (!g) groups.set(r, g = []); g.push(c.id); }
  const blocs: Bloc[] = []; const of = new Int32Array(n).fill(-1);
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    const leader = g.reduce((a, b) => (w.countries[b].militaryPower + w.countries[b].gdp / 30 > w.countries[a].militaryPower + w.countries[a].gdp / 30 ? b : a));
    const power = g.reduce((a, b) => a + w.countries[b].militaryPower, 0);
    const id = blocs.length;
    blocs.push({ id, leader, members: g, color: w.countries[leader].color, power, name: `${w.countries[leader].shortName} 진영` });
    for (const m of g) of[m] = id;
  }
  blocs.sort((a, b) => b.power - a.power);
  blocs.forEach((b, i) => { b.id = i; for (const m of b.members) of[m] = i; });
  return { blocs, of };
}

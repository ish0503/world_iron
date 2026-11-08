// 헤드리스 시뮬레이션 검증: node --experimental-strip-types scripts/sim-test.ts [years]
import { generateWorld, WORLD_PRESETS } from '../src/simulation/WorldGen';
import { setupWorld, stepDay } from '../src/simulation/SimulationEngine';

const years = Number(process.argv[2] || 30);
const preset = (process.argv[3] || 'medium') as keyof typeof WORLD_PRESETS;
const t0 = performance.now();
const w = generateWorld({ seed: 12345, ...WORLD_PRESETS[preset], startYear: 1936, landRatio: 0.38 });
setupWorld(w);
console.log(`gen ${(performance.now() - t0).toFixed(0)}ms provinces=${w.provinces.filter(p => p.active).length} countries=${w.countries.length} divs=${w.divisions.length}`);
const t1 = performance.now();
for (let y = 0; y < years; y++) {
  const ys = performance.now();
  for (let d = 0; d < 365; d++) stepDay(w);
  const live = w.countries.filter(c => c.alive);
  const gdp = live.reduce((a, c) => a + c.gdp, 0);
  const pop = live.reduce((a, c) => a + c.population, 0);
  const wars = w.wars.filter(x => x.active).length;
  const avgStab = live.reduce((a, c) => a + c.stability, 0) / live.length;
  const avgUn = live.reduce((a, c) => a + c.unemployment, 0) / live.length;
  const avgInf = live.reduce((a, c) => a + c.inflation, 0) / live.length;
  const tre = live.reduce((a, c) => a + c.treasury, 0);
  const debt = live.reduce((a, c) => a + c.debt, 0);
  console.log(`${1936 + y + 1}: alive=${live.length}/${w.countries.length} GDP=${gdp.toFixed(0)}B pop=${(pop / 1e6).toFixed(0)}M wars=${wars} totalWars=${w.wars.length} divs=${w.divisions.length} stab=${avgStab.toFixed(1)} unemp=${(avgUn * 100).toFixed(1)}% infl=${(avgInf * 100).toFixed(1)}% treas=${tre.toFixed(0)} debt=${debt.toFixed(0)} chron=${w.chronicle.length} ${(performance.now() - ys).toFixed(0)}ms`);
}
console.log(`total ${(performance.now() - t1).toFixed(0)}ms`);
for (const e of w.chronicle.filter(e => e.major).slice(-25)) console.log(`  [${1936 + Math.floor(e.d / 365)}] ${e.title} — ${e.text}`);
const top = w.countries.filter(c => c.alive).sort((a, b) => b.gdp - a.gdp).slice(0, 6);
for (const c of top) console.log(`  ${c.name} prov=${c.provinceCount} gdp=${c.gdp.toFixed(0)} pop=${(c.population / 1e6).toFixed(1)}M mil=${c.militaryPower.toFixed(1)} stab=${c.stability.toFixed(0)} tax=${c.taxRate.toFixed(2)} tre=${c.treasury.toFixed(1)} debt=${c.debt.toFixed(0)} tech=${Object.values(c.tech).join(',')} ${c.personality}`);
{
  const live = w.countries.filter(c => c.alive);
  const ic = live.reduce((a, c) => a + c.totalIC, 0);
  const fp = live.reduce((a, c) => a + c.prod.food, 0), fc = live.reduce((a, c) => a + c.cons.food, 0);
  console.log('worldIC', ic.toFixed(0), 'food', fp.toFixed(0), '/', fc.toFixed(0), 'prices', JSON.stringify(w.prices));
  let fac = 0, farm = 0; for (const p of w.provinces) { fac += p.buildings.factory || 0; farm += p.buildings.farm || 0; }
  console.log('factories', fac, 'farms', farm, 'treaties', w.treaties.length, 'alliances', w.treaties.filter(t => t.type === 'alliance').length);
  let rs = 0, rn = 0; for (const a of live) for (const b of live) if (a.id < b.id) { rs += w.relations[a.id * w.relSize + b.id]; rn++; }
  console.log('avgRel', (rs / rn).toFixed(1));
}

import type { WorldState } from '../types/World';
import type { Country } from '../types/Country';
import type { ResourceId } from '../types/Province';
import { TERRAINS } from '../data/terrain';
import { RES_IDS, RESOURCES, UNITS } from '../data/defs';
import { dateOf, season } from './Calendar';
import { clamp } from './rng';
import { hasTreaty, isAtWar, enemiesOf, chronicle, deployedBy } from './WorldHelpers';

/** 월간 경제 계산: 프로빈스 생산 → 국가 집계 → 자원 시장 → GDP/실업/물가 */
export function monthlyEconomy(w: WorldState) {
  const month = dateOf(w.startYear, w.day).month;
  const s = season(month).id;
  const n = w.countries.length;
  const food = new Float64Array(n), ic = new Float64Array(n), serv = new Float64Array(n), jobs = new Float64Array(n), pop = new Float64Array(n);
  const mined: Record<ResourceId, Float64Array> = { food: new Float64Array(n), steel: new Float64Array(n), coal: new Float64Array(n), oil: new Float64Array(n), rare: new Float64Array(n) };
  const factories = new Float64Array(n);
  // 노동력 제약: 공장 1개당 3만 명 필요
  const labor = new Float64Array(n).fill(1);
  {
    const wf = new Float64Array(n), fc = new Float64Array(n);
    for (const p of w.provinces) if (p.active && p.owner >= 0) { wf[p.owner] += p.pop * 0.45 * 0.35; fc[p.owner] += (p.buildings.factory || 0) * 30000; }
    for (let i = 0; i < n; i++) labor[i] = fc[i] > 0 ? Math.min(1, wf[i] / fc[i]) : 1;
  }
  for (const p of w.provinces) {
    if (!p.active) continue;
    const o = p.owner; if (o < 0) { p.food = 0; p.ic = 0; p.gdp = 0; continue; }
    const c = w.countries[o]; if (!c || !c.alive) continue;
    const occupied = p.controller !== o;
    const td = TERRAINS[p.terrain];
    const lat = Math.abs(p.cy / w.height - 0.5) * 2;
    // 계절: 고위도일수록 계절 영향 큼
    const seasonal = [1.0, 1.15, 1.25, 0.6][s] * lat + (1 - lat);
    const climate = 1 - Math.abs(w.globalTemp) * (lat > 0.6 || p.terrain === 6 ? 0.25 : 0.08);
    const dis = p.disaster && p.disaster.until > w.day ? p.disaster.food : 1;
    const b = p.buildings;
    let f = (p.pop / 1000) * 0.1 * td.food * (1 + 0.4 * (b.farm || 0)) * (1 + 0.08 * c.tech.agriculture) * seasonal * climate * dis * (1 - p.devastation * 0.7);
    if (p.resource === 'food') f *= 1 + 0.2 * p.resourceAmount;
    let pic = (b.factory || 0) * labor[o] * (1 + 0.1 * c.tech.industry) * (1 + 0.05 * c.tech.energy) * (1 + 0.15 * (b.power || 0)) * (1 - p.devastation);
    const urban = Math.min(3, 0.4 + p.pop / 1_500_000);
    const sv = p.pop * 0.00000022 * (c.productivity ?? 1) * urban * (1 + 0.15 * (b.market || 0)) * (1 + 0.05 * c.tech.communication) * (1 - p.devastation * 0.5);
    p.food = f; p.ic = pic;
    p.gdp = (f * w.prices.food + pic * 0.15 + sv) * 12;
    pop[o] += p.pop;
    if (occupied) { pic = 0; f *= 0.3; }
    food[o] += f; ic[o] += pic; serv[o] += sv;
    factories[o] += b.factory || 0;
    jobs[o] += p.pop * 0.385 * (1 - p.devastation * 0.5) + (b.factory || 0) * 12000 + (b.mine || 0) * 5000 + (b.market || 0) * 3000;
    if (p.resource && p.resource !== 'food' && !occupied) mined[p.resource][o] += p.resourceAmount * (1 + 0.5 * (b.mine || 0)) * 10 * (1 + 0.04 * c.tech.industry);
  }
  // 공산품 시장: 세계 수요 대비 공급 → 단위 가치 (무한 성장 방지)
  let worldIC = 0, worldPop = 0, techSum = 0, techN = 0;
  for (let i = 0; i < n; i++) { worldIC += ic[i]; worldPop += pop[i]; }
  for (const c of w.countries) if (c.alive) { techSum += c.tech.industry + c.tech.communication; techN += 2; }
  const demandIC = worldPop / 400_000 * (1 + 0.06 * (techN ? techSum / techN : 3));
  const icValue = 0.15 * Math.min(1.5, Math.max(0.3, Math.pow(demandIC / Math.max(1, worldIC), 0.5)));
  (w as any).icValue = icValue;
  // 세계 자원 수급 → 가격
  const worldProd: Record<ResourceId, number> = { food: 0, steel: 0, coal: 0, oil: 0, rare: 0 };
  const worldCons: Record<ResourceId, number> = { food: 0, steel: 0, coal: 0, oil: 0, rare: 0 };

  const deployedAll = deployedBy(w);
  for (const c of w.countries) {
    if (!c.alive) continue;
    const i = c.id;
    c.population = pop[i];
    c.totalIC = ic[i];
    c.prod.food = food[i]; c.prod.steel = mined.steel[i]; c.prod.coal = mined.coal[i]; c.prod.oil = mined.oil[i]; c.prod.rare = mined.rare[i];
    // 소비 (군 소비는 일일 누적치 c.cons 에 이미 반영)
    const milSteel = c.milUse.steel, milOil = c.milUse.oil, milFood = c.milUse.food;
    c.cons.food = pop[i] / 1000 * 0.1 + milFood;
    c.cons.steel = ic[i] * 1.0 + milSteel;
    c.cons.coal = ic[i] * 1.0;
    c.cons.oil = ic[i] * 0.15 * Math.min(1, c.tech.energy / 3) + milOil;
    c.cons.rare = ic[i] * 0.05 * Math.min(1, c.tech.industry / 4);
    for (const r of RES_IDS) { worldProd[r] += c.prod[r]; worldCons[r] += c.cons[r]; }

    // 무역 및 재고
    const sanctions = w.treaties.filter(t => t.type === 'sanction' && t.b === i).length;
    const tradePartners = w.treaties.filter(t => (t.type === 'trade' || t.type === 'econ') && (t.a === i || t.b === i)).length;
    // 해상 봉쇄: 해군이 더 강한 적국
    let blockade = 0;
    if (isAtWar(w, i)) {
      const myNavy = navalPower(c);
      for (const e of enemiesOf(w, i)) if (navalPower(w.countries[e]) > myNavy * 1.3) blockade = Math.max(blockade, 0.4);
    }
    let imports = 0, exports = 0;
    let satisfaction = 1;
    for (const r of RES_IDS) {
      if (w.rules.infiniteResources) { c.stock[r] = Math.max(c.stock[r], c.cons[r] * 6 + 100); continue; }
      c.stock[r] += c.prod[r] - c.cons[r];
      const price = w.prices[r];
      if (c.stock[r] < 0) {
        const deficit = -c.stock[r];
        const canImport = c.autoImport && c.treasury > 0 ? Math.min(deficit, (c.treasury * 0.5) / (price * (1.1 + sanctions * 0.15))) * (1 - blockade) : 0;
        const cost = canImport * price * (1.1 + sanctions * 0.15);
        imports += cost; c.treasury -= cost;
        c.stock[r] += canImport;
        if (c.stock[r] < 0) {
          const short = -c.stock[r] / Math.max(1, c.cons[r]);
          if (r === 'steel' || r === 'coal') satisfaction = Math.min(satisfaction, 1 - short * 0.8);
          if (r === 'food') c.famine = clamp(short, 0, 1);
          c.stock[r] = 0;
        } else if (r === 'food') c.famine = Math.max(0, c.famine - 0.25);
      } else {
        if (r === 'food') c.famine = Math.max(0, c.famine - 0.25);
        const buffer = c.cons[r] * 6 + 50;
        if (c.stock[r] > buffer) {
          const sell = (c.stock[r] - buffer) * 0.5 * (1 - blockade);
          const rev = sell * price * (0.9 + tradePartners * 0.03) * (sanctions > 0 ? 0.8 : 1);
          exports += rev; c.treasury += rev; c.stock[r] -= sell;
        }
      }
    }
    c.tradeBalance = exports - imports;
    satisfaction = clamp(satisfaction, 0.2, 1);
    // 노동 → 실업
    const workforce = pop[i] * 0.45;
    const deployed = deployedAll[i];
    c.unemployment = clamp(1 - (jobs[i] + deployed) / Math.max(1, workforce), 0.01, 0.5);
    // GDP
    const monthlyGdp = food[i] * w.prices.food + ic[i] * icValue * satisfaction + serv[i]
      + (mined.steel[i] * w.prices.steel + mined.coal[i] * w.prices.coal + mined.oil[i] * w.prices.oil + mined.rare[i] * w.prices.rare);
    // 경기 순환
    if (c.cycle === undefined) { c.cycle = Math.random() * Math.PI * 2; c.cyclePeriod = 7 + Math.random() * 6; }
    c.cycle += (Math.PI * 2) / (12 * (c.cyclePeriod || 9));
    const cyc = Math.sin(c.cycle);
    if (cyc < -0.97 && (c.lastCrisis === undefined || w.day - c.lastCrisis > 365 * 3) && c.provinceCount >= 3) {
      c.lastCrisis = w.day;
      chronicle(w, 'economy', `${c.shortName} 경기 침체`, `${c.name}의 경기가 침체기에 들어섰다. 실업이 늘고 정부 지지율이 하락하고 있다.`, [c.id]);
    }
    c.unemployment = clamp(c.unemployment - cyc * 0.03, 0.01, 0.5);
    const stabF = (0.75 + c.stability / 400) * (1 + 0.05 * cyc);
    const inflF = 1 - clamp(c.inflation - 0.04, 0, 0.5) * 0.6;
    const tradeF = 1 + tradePartners * 0.012 - sanctions * 0.03 - blockade * 0.2;
    const target = Math.max(0.1, monthlyGdp * 12 * stabF * inflF * tradeF);
    c.gdp = c.gdp <= 0 ? target : c.gdp * 0.7 + target * 0.3;
    // 물가 상승률: 부채, 적자, 자원 부족
    const debtRatio = c.debt / Math.max(1, c.gdp);
    const targetInfl = 0.015 + debtRatio * 0.06 + (1 - satisfaction) * 0.08 + c.famine * 0.1 + (c.warEconomy ? 0.02 : 0) + c.warExhaustion * 0.0006;
    c.inflation = clamp(c.inflation * 0.85 + targetInfl * 0.15, -0.02, 0.6);
    // 부채 상환/이자 (월)
    if (c.debt > 0) {
      // 국가 부도
      if (c.debt > Math.max(5, c.gdp * 2.5)) {
        chronicle(w, 'economy', `${c.shortName} 국가 부도`, `${c.name}이(가) 감당할 수 없는 부채로 채무 불이행을 선언했다. 통화 가치가 폭락하고 사회가 혼란에 빠졌다.`, [c.id], true);
        c.debt *= 0.3; c.inflation = Math.min(0.6, c.inflation + 0.15); c.stability -= 20; c.legitimacy -= 20;
      }
      const rate = Math.min(0.12, 0.03 + debtRatio * 0.04);
      c.treasury -= c.debt * rate / 12;
      if (c.treasury > c.gdp * 0.05) { const pay = Math.min(c.debt, c.treasury - c.gdp * 0.05); c.debt -= pay; c.treasury -= pay; }
    }
    if (c.treasury < 0) { c.debt += -c.treasury; c.treasury = 0; }
    // 군 소비 누적 초기화
    c.milUse = { food: 0, steel: 0, coal: 0, oil: 0, rare: 0 };
  }
  for (const r of RES_IDS) {
    const ratio = worldCons[r] / Math.max(1, worldProd[r]);
    const target = RESOURCES[r].base * clamp(Math.pow(ratio, 0.7), 0.4, 3);
    w.prices[r] = w.prices[r] * 0.8 + target * 0.2;
  }
}

/** 일일 국고 계산 */
let upkeepCache: Float64Array = new Float64Array(0); let upkeepDay = -1;
function upkeepOf(w: WorldState, cid: number) {
  if (upkeepDay !== w.day || upkeepCache.length < w.countries.length) {
    upkeepDay = w.day; upkeepCache = new Float64Array(w.countries.length);
    for (const d of w.divisions) if (d.owner < upkeepCache.length) upkeepCache[d.owner] += UNITS[d.type].upkeep * (0.4 + 0.6 * d.strength / d.maxStrength);
  }
  return upkeepCache[cid];
}
export function dailyBudget(w: WorldState, c: Country) {
  const eff = 0.55 + c.stability / 250 + c.tech.communication * 0.01;
  const income = (c.gdp / 365) * c.taxRate * eff;
  let upkeep = upkeepOf(w, c.id);
  upkeep *= 0.5 + c.budget.military;
  const ships = c.ships.destroyer * 0.4 + c.ships.cruiser + c.ships.battleship * 3 + c.ships.carrier * 4 + c.ships.submarine * 0.6 + c.ships.transport * 0.3;
  const planes = c.planes.fighter * 0.08 + c.planes.bomber * 0.15 + c.planes.attacker * 0.1 + c.planes.recon * 0.04 + c.planes.airlift * 0.08;
  upkeep += (ships + planes) * 0.04 / 365;
  const g = c.gdp / 365;
  const programs = g * (c.budget.research + c.budget.welfare + c.budget.infrastructure);
  // 종주국 공납
  let tribute = 0;
  if (c.overlord >= 0 && w.countries[c.overlord]?.alive) { tribute = income * 0.15; w.countries[c.overlord].treasury += tribute; }
  c.income = income; c.expense = upkeep + programs + tribute;
  c.treasury += income - c.expense;
  if (c.treasury < 0) { c.debt += -c.treasury; c.treasury = 0; }
}

export function navalPower(c: Country) {
  return (c.ships.destroyer * 2 + c.ships.cruiser * 5 + c.ships.battleship * 14 + c.ships.carrier * 18 + c.ships.submarine * 4 + c.ships.transport * 0.5) * (1 + 0.1 * c.tech.naval);
}
export function airPower(c: Country) {
  return (c.planes.fighter * 3 + c.planes.bomber * 4 + c.planes.attacker * 3.5 + c.planes.recon * 0.5) * (1 + 0.07 * c.tech.military);
}

/** 연간 경제 기록 (대공황, 성장) */
export function yearlyEconomy(w: WorldState) {
  let worldNow = 0, worldPrev = 0;
  for (const c of w.countries) {
    if (!c.alive) continue;
    c.gdpGrowth = c.gdpPrev > 0 ? (c.gdp - c.gdpPrev) / c.gdpPrev : 0;
    worldNow += c.gdp; worldPrev += c.gdpPrev || c.gdp;
    if (c.gdpPrev > 0 && c.gdpGrowth < -0.12 && c.provinceCount > 3) {
      chronicle(w, 'economy', `${c.shortName} 경제 위기`, `${c.name}의 GDP가 1년 사이 ${(c.gdpGrowth * -100).toFixed(1)}% 감소했다. 실업과 물가 불안이 확산되고 있다.`, [c.id]);
      c.stability -= 8;
    }
    c.gdpPrev = c.gdp;
  }
  if (worldPrev > 0 && (worldNow - worldPrev) / worldPrev < -0.06) {
    chronicle(w, 'economy', '세계 경제 대공황', `세계 총생산이 ${(((worldPrev - worldNow) / worldPrev) * 100).toFixed(1)}% 감소하며 대공황이 시작되었다. 각국에서 실업과 정치 불안이 확산된다.`, [], true);
    for (const c of w.countries) if (c.alive) { c.stability -= 6; c.legitimacy -= 5; }
  }
}

export function resourceValue(w: WorldState, r: ResourceId) { return w.prices[r]; }
export { hasTreaty };

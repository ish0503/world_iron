import type { WorldState, PeaceTerms } from '../types/World';
import type { Division, War, Battle } from '../types/Military';
import { TERRAINS } from '../data/terrain';
import { UNITS } from '../data/defs';
import { rand, clamp } from './rng';
import {
  atWar, alliesOf, warsOf, hasTreaty, bumpControl, countryNeighbors, canEnter, addTreaty, removeTreaty, addRel, getRel, setRel, chronicle, cname, logEvent,
} from './WorldHelpers';
import { airPower } from './EconomySimulation';
import { transferProvince, changeGovernment, createCountry, checkDeath, relocateCapital } from './CountryOps';

export function provinceValue(w: WorldState, pid: number) {
  const p = w.provinces[pid];
  let v = 1 + p.pop / 250_000 + (p.buildings.factory || 0) * 0.5;
  if (p.owner >= 0 && w.countries[p.owner].capital === pid) v += 4;
  return v;
}

export function warName(w: WorldState, a: number, d: number) {
  return `${cname(w, a)}-${cname(w, d)} 전쟁`;
}

/** 선전포고 (동맹 참전 포함) */
export function declareWar(w: WorldState, attacker: number, defender: number, goal: number[] = [], reason = ''): War | null {
  if (w.rules.noWar) return null;
  if (attacker === defender || atWar(w, attacker, defender)) return null;
  const A = w.countries[attacker], D = w.countries[defender];
  if (!A?.alive || !D?.alive) return null;
  // 조약 파기
  for (const t of ['alliance', 'nap', 'trade', 'access', 'econ', 'guarantee', 'truce'] as const) removeTreaty(w, t, attacker, defender);
  if (D.overlord === attacker) D.overlord = -1;
  if (A.overlord === defender) A.overlord = -1;
  const war: War = {
    id: w.nextId.war++, name: warName(w, attacker, defender), attackers: [attacker], defenders: [defender],
    leaderA: attacker, leaderD: defender, start: w.day, goal, casualtiesA: 0, casualtiesD: 0, battles: 0, active: true,
  };
  w.wars.push(war);
  setRel(w, attacker, defender, Math.min(getRel(w, attacker, defender), -60));
  A.stability -= A.personality === 'pacifist' ? 10 : 3;
  chronicle(w, 'war', `${war.name} 발발`, `${A.name}이(가) ${D.name}에 선전포고했다.${reason ? ' ' + reason : ''}`, [attacker, defender], true);
  // 방어측 동맹/보장국/종주국
  const callD = new Set<number>([...alliesOf(w, defender)]);
  for (const t of w.treaties) if (t.type === 'guarantee' && t.b === defender) callD.add(t.a);
  for (const c of callD) {
    if (c === attacker || !w.countries[c]?.alive || war.attackers.includes(c)) continue;
    const C = w.countries[c];
    const willing = C.overlord === defender || D.overlord === c || getRel(w, c, defender) > (C.personality === 'isolationist' ? 40 : 0) || hasTreaty(w, 'guarantee', c, defender, true);
    if (willing && !(hasTreaty(w, 'alliance', c, attacker))) joinWar(w, war, c, 'D');
  }
  const callA = alliesOf(w, attacker);
  for (const c of callA) {
    if (war.defenders.includes(c) || war.attackers.includes(c) || !w.countries[c]?.alive) continue;
    const C = w.countries[c];
    const aggressive = C.overlord === attacker || (getRel(w, c, attacker) > 30 && getRel(w, c, defender) < 20 && C.personality !== 'pacifist' && C.personality !== 'isolationist');
    if (aggressive && !hasTreaty(w, 'alliance', c, defender)) joinWar(w, war, c, 'A');
  }
  checkWorldWar(w, war);
  return war;
}


export function joinWar(w: WorldState, war: War, c: number, side: 'A' | 'D') {
  const arr = side === 'A' ? war.attackers : war.defenders;
  if (arr.includes(c)) return;
  arr.push(c);
  const enemies = side === 'A' ? war.defenders : war.attackers;
  for (const e of enemies) { for (const t of ['nap', 'trade', 'access', 'econ', 'truce'] as const) removeTreaty(w, t, c, e); setRel(w, c, e, Math.min(getRel(w, c, e), -40)); }
  logEvent(w, `${cname(w, c)}이(가) ${war.name}에 ${side === 'A' ? '공격측' : '방어측'}으로 참전`, 'war', c);
  checkWorldWar(w, war);
}

function checkWorldWar(w: WorldState, war: War) {
  if ((war as any).world) return;
  const n = war.attackers.length + war.defenders.length;
  const ranked = w.countries.filter(c => c.alive).sort((a, b) => b.militaryPower - a.militaryPower).slice(0, 7).map(c => c.id);
  const gpA = war.attackers.filter(c => ranked.includes(c)).length, gpD = war.defenders.filter(c => ranked.includes(c)).length;
  if (n >= 8 && gpA >= 1 && gpD >= 1 && gpA + gpD >= 4) {
    (war as any).world = true;
    w.worldWarCount++;
    const old = war.name;
    war.name = `제${w.worldWarCount}차 세계대전`;
    chronicle(w, 'war', `${war.name} 발발`, `${old}이(가) ${n}개국이 참전하는 세계대전으로 확대되었다.`, [...war.attackers, ...war.defenders].slice(0, 8), true);
  } else if (n >= 4 && !(war as any).cont) {
    (war as any).cont = true;
    war.name = war.name.replace('전쟁', '대전');
  }
}

export function sideOf(war: War, c: number): 'A' | 'D' | null {
  return war.attackers.includes(c) ? 'A' : war.defenders.includes(c) ? 'D' : null;
}

/** 전쟁 점수 (공격측 관점, -100~100) */
export function warScore(w: WorldState, war: War) {
  let occA = 0, totD = 0, occD = 0, totA = 0;
  const aSet = new Set(war.attackers), dSet = new Set(war.defenders);
  for (const p of w.provinces) {
    if (!p.active || p.owner < 0) continue;
    if (dSet.has(p.owner)) { const v = provinceValue(w, p.id); totD += v; if (aSet.has(p.controller)) occA += v; }
    else if (aSet.has(p.owner)) { const v = provinceValue(w, p.id); totA += v; if (dSet.has(p.controller)) occD += v; }
  }
  const occ = (occA / Math.max(1, totD) - occD / Math.max(1, totA)) * 100;
  const cas = ((war.casualtiesD - war.casualtiesA) / (war.casualtiesA + war.casualtiesD + 20000)) * 25;
  return clamp(occ + cas, -100, 100);
}

// ───────── 전투 ─────────
export function startOrJoinBattle(w: WorldState, d: Division, pid: number) {
  if (d.battle >= 0) return;
  const defs = w.divisions.filter(o => o.province === pid && atWar(w, o.owner, d.owner));
  if (!defs.length) return;
  const war = w.wars.find(x => x.active && ((x.attackers.includes(d.owner) && x.defenders.includes(defs[0].owner)) || (x.defenders.includes(d.owner) && x.attackers.includes(defs[0].owner))));
  let b = w.battles.find(x => x.province === pid);
  if (!b) {
    b = { id: w.nextId.battle++, province: pid, attackerCountry: d.owner, defenderCountry: defs[0].owner, attackers: [], defenders: [], start: w.day, attackerLoss: 0, defenderLoss: 0, lastResult: '', warId: war?.id ?? -1 };
    w.battles.push(b);
    if (war) war.battles++;
  }
  if (!b.attackers.includes(d.id)) b.attackers.push(d.id);
  d.battle = b.id;
  for (const o of defs) if (!b.defenders.includes(o.id)) {
    const prev = w.battles.find(x => x.id === o.battle && x.id !== b!.id);
    if (prev) { prev.attackers = prev.attackers.filter(x => x !== o.id); }
    b.defenders.push(o.id); o.battle = b.id; o.path = []; o.progress = 0;
  }
}

function sidePower(w: WorldState, divs: Division[], attacking: boolean, pid: number, enemy: Division[]) {
  let raw = 0, brk = 0, armor = 0, at = 0, aa = 0, str = 0, org = 0, sup = 0, eng = 0;
  for (const d of divs) {
    const u = UNITS[d.type]; const f = (d.strength / u.hp) * (0.4 + 0.6 * d.equipment);
    raw += (attacking ? u.atk : u.def) * f; brk += u.brk * f; armor += u.armor * f; at += u.at * f; aa += u.aa * f;
    str += d.strength; org += d.org; sup += d.supply; if (d.type === 'engineer') eng++;
  }
  const n = Math.max(1, divs.length);
  void enemy; void pid;
  return { raw, brk, armor: armor / n, at, aa, str, org: org / n, sup: sup / n, eng, n };
}

function weatherFactor(w: WorldState, pid: number) {
  const p = w.provinces[pid];
  const lat = Math.abs(p.cy / w.height - 0.5) * 2;
  const month = Math.floor((w.day % 365) / 30.5) + 1;
  const winter = month === 12 || month <= 2;
  return winter ? 1 - Math.max(0, lat - 0.35) * 0.5 : 1;
}

export function dailyBattles(w: WorldState) {
  const finished: number[] = [];
  for (const b of w.battles) {
    const p = w.provinces[b.province];
    const A = w.divisions.filter(d => b.attackers.includes(d.id) && d.battle === b.id);
    const D = w.divisions.filter(d => d.province === b.province && A.length > 0 && atWar(w, d.owner, A[0].owner));
    if (!A.length) { finished.push(b.id); for (const d of D) d.battle = -1; continue; }
    if (!D.length) {
      // 방어군 소멸/퇴각 → 공격군 진입
      finished.push(b.id);
      for (const d of A) { d.battle = -1; }
      continue;
    }
    for (const d of D) {
      if (d.battle !== b.id) {
        // 공격 중이던 부대가 자기 지역을 방어하게 되면 이전 전투에서 정식으로 이탈
        const prev = w.battles.find(x => x.id === d.battle);
        if (prev) { prev.attackers = prev.attackers.filter(x => x !== d.id); prev.defenders = prev.defenders.filter(x => x !== d.id); }
        d.battle = b.id; d.path = []; d.progress = 0;
      }
      if (!b.defenders.includes(d.id)) b.defenders.push(d.id);
    }
    const ca = w.countries[A[0].owner], cd = w.countries[D[0].owner];
    const pa = sidePower(w, A, true, b.province, D), pd = sidePower(w, D, false, b.province, A);
    const td = TERRAINS[p.terrain];
    // 공군
    const airA = airPower(ca), airD = airPower(cd);
    const airRatio = clamp((airA - airD) / (airA + airD + 1), -1, 1);
    const aaA = clamp(pa.aa / (pa.n * 10), 0, 0.6), aaD = clamp(pd.aa / (pd.n * 10), 0, 0.6);
    const airMulA = 1 + 0.25 * Math.max(0, airRatio) * (1 - aaD);
    const airMulD = 1 + 0.25 * Math.max(0, -airRatio) * (1 - aaA);
    // 기갑 대 대전차
    const armorBonus = 1 + 0.5 * pa.armor * clamp(1 - pd.at / (pd.n * 12), 0, 1);
    // P_attack = A × M × S × T
    const M_a = 0.3 + 0.7 * pa.org * avg(A.map(d => d.morale));
    const S_a = 0.4 + 0.6 * pa.sup;
    const T_a = td.atk * (p.river ? 0.85 : 1) * weatherFactor(w, b.province);
    const Patk = pa.raw * M_a * S_a * T_a * (1 + 0.07 * ca.tech.military) * airMulA * armorBonus;
    // P_defense = D × F × E × R
    const F = 1 + 0.15 * (p.buildings.fort || 0);
    const E = td.def;
    const R = (1 + 0.07 * cd.tech.military) * (0.85 + rand() * 0.3) * (pd.eng ? 1.1 : 1);
    const M_d = 0.3 + 0.7 * pd.org * avg(D.map(d => d.morale));
    const Pdef = pd.raw * F * E * R * M_d * (0.4 + 0.6 * pd.sup) * airMulD;
    // 피해 계산
    const brkRatio = clamp(pa.brk / Math.max(1, pd.raw), 0, 1.5);
    const lossD = Patk * 12 * (0.8 + rand() * 0.4);
    const lossA = Pdef * 12 * (0.8 + rand() * 0.4) * (1 - Math.min(0.5, brkRatio * 0.3));
    // 하루 조직력 손실: 전투가 보통 1~4주 지속되도록
    const orgD = Math.min(0.045, 0.011 * Patk / Math.max(1, Pdef) + 0.004);
    const orgA = Math.min(0.045, 0.011 * Pdef / Math.max(1, Patk) + 0.008);
    applyLoss(D, lossD, orgD);
    applyLoss(A, lossA, orgA);
    b.attackerLoss += lossA; b.defenderLoss += lossD;
    p.pop = Math.max(500, p.pop - (lossA + lossD) * 0.15);
    p.devastation = Math.min(1, p.devastation + 0.004);
    ca.population -= 0; // 통계는 월간
    addCasualties(w, A[0].owner, lossA, D[0].owner, lossD);
    ca.warExhaustion = Math.min(100, ca.warExhaustion + lossA / Math.max(1, ca.population) * 250);
    cd.warExhaustion = Math.min(100, cd.warExhaustion + lossD / Math.max(1, cd.population) * 250);
    const avgOrgA = avg(A.map(d => d.org)), avgOrgD = avg(D.map(d => d.org));
    b.lastResult = `공격 ${Patk.toFixed(0)} vs 방어 ${Pdef.toFixed(0)}`;
    const duration = w.day - b.start;
    const minDays = 6;
    if ((avgOrgD < 0.12 && duration >= minDays) || pd.str < 500) { 
      // 방어 패배 → 퇴각
      finished.push(b.id);
      retreat(w, D, b.province);
      for (const d of A) d.battle = -1;
      endBattleRecord(w, b, true);
    } else if ((avgOrgA < 0.1 && duration >= minDays) || pa.str < 500 || duration > 150) {
      finished.push(b.id);
      for (const d of A) { d.battle = -1; d.path = []; d.progress = 0; }
      for (const d of D) d.battle = -1;
      endBattleRecord(w, b, false);
    }
  }
  if (finished.length) w.battles = w.battles.filter(b => !finished.includes(b.id));
}

const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

function applyLoss(divs: Division[], loss: number, org: number) {
  const tot = divs.reduce((a, d) => a + d.strength, 0) || 1;
  for (const d of divs) {
    const share = d.strength / tot;
    const armorRed = 1 - UNITS[d.type].armor * 0.3;
    d.strength = Math.max(0, d.strength - loss * share * armorRed);
    d.org = Math.max(0, d.org - org * (0.8 + Math.random() * 0.4));
    d.morale = Math.max(0.1, d.morale - org * 0.15);
    d.equipment = Math.max(0.2, d.equipment - org * 0.05);
  }
}

function addCasualties(w: WorldState, a: number, la: number, d: number, ld: number) {
  for (const war of w.wars) {
    if (!war.active) continue;
    if (war.attackers.includes(a) && war.defenders.includes(d)) { war.casualtiesA += la; war.casualtiesD += ld; return; }
    if (war.defenders.includes(a) && war.attackers.includes(d)) { war.casualtiesD += la; war.casualtiesA += ld; return; }
  }
}

function retreat(w: WorldState, divs: Division[], pid: number) {
  const p = w.provinces[pid];
  for (const d of divs) {
    d.battle = -1; d.path = []; d.progress = 0;
    const opts = p.neighbors.filter(n => {
      const q = w.provinces[n];
      if (w.divisions.some(o => o.province === n && atWar(w, o.owner, d.owner))) return false;
      const ctl = q.controller;
      return ctl === d.owner || (ctl >= 0 && (alliesOf(w, d.owner).includes(ctl) || warsOf(w, d.owner).some(x => (x.attackers.includes(d.owner) ? x.attackers : x.defenders).includes(ctl))));
    });
    if (!opts.length) {
      // 포위 섬멸
      d.strength = 0;
      continue;
    }
    // 수도 쪽으로
    const cap = w.provinces[w.countries[d.owner].capital];
    opts.sort((x, y) => Math.hypot(w.provinces[x].cx - cap.cx, w.provinces[x].cy - cap.cy) - Math.hypot(w.provinces[y].cx - cap.cx, w.provinces[y].cy - cap.cy));
    d.province = opts[0];
    d.org = Math.max(0.05, d.org);
  }
  const lost = divs.filter(d => d.strength <= 0);
  if (lost.length) {
    const ids = new Set(lost.map(d => d.id));
    w.divisions = w.divisions.filter(d => !ids.has(d.id));
    if (lost.length >= 3) chronicle(w, 'war', `${p.name} 포위전`, `${cname(w, lost[0].owner)}의 ${lost.length}개 사단이 ${p.name}에서 포위되어 괴멸했다.`, [lost[0].owner], false, pid);
  }
}

function endBattleRecord(w: WorldState, b: Battle, attackerWon: boolean) {
  const total = b.attackerLoss + b.defenderLoss;
  const p = w.provinces[b.province];
  if (total > 45_000) {
    chronicle(w, 'war', `${p.name} 전투`, `${cname(w, b.attackerCountry)}과(와) ${cname(w, b.defenderCountry)}의 대규모 전투. ${attackerWon ? cname(w, b.attackerCountry) : cname(w, b.defenderCountry)} 승리. 사상자 ${Math.round(total / 1000)}천 명.`, [b.attackerCountry, b.defenderCountry], total > 150_000, b.province);
  }
  const winner = attackerWon ? b.attackerCountry : b.defenderCountry;
  const loser = attackerWon ? b.defenderCountry : b.attackerCountry;
  if (w.countries[winner]) w.countries[winner].legitimacy = Math.min(100, w.countries[winner].legitimacy + 0.5);
  if (w.countries[loser]) w.countries[loser].stability -= 0.3;
}

/** 프로빈스 점령 시: 수도 함락, 항복 판정 */
export function onCaptured(w: WorldState, pid: number, by: number) {
  const p = w.provinces[pid];
  const owner = p.owner; if (owner < 0) return;
  const c = w.countries[owner];
  if (c.capital === pid && p.controller !== owner) {
    const repeat = c.lastCrisis !== undefined && w.day - c.lastCrisis < 120;
    c.lastCrisis = w.day;
    if (repeat) { logEvent(w, `${c.shortName} 임시 수도 ${p.name} 함락`, 'war', owner); c.capLost = (c.capLost || 0) + 1; relocateCapital(w, owner); return; }
    chronicle(w, 'war', `${c.shortName} 수도 함락`, `${cname(w, by)} 군이 ${c.name}의 수도 ${p.name}을(를) 점령했다.`, [owner, by], true, pid);
    c.stability -= 12; c.legitimacy -= 10;
    c.capLost = (c.capLost || 0) + 1;
    relocateCapital(w, owner);
  }
}

export function controlledShare(w: WorldState, cid: number) {
  let tot = 0, ctl = 0;
  for (const p of w.provinces) if (p.active && p.owner === cid) { const v = provinceValue(w, p.id); tot += v; if (p.controller === cid) ctl += v; }
  return tot ? ctl / tot : 0;
}

export function checkCapitulation(w: WorldState, cid: number) {
  const c = w.countries[cid]; if (!c.alive) return;
  const share = controlledShare(w, cid);
  const capLost = (c.capLost || 0) > 0 || w.provinces[c.capital]?.controller !== cid;
  const ws = warsOf(w, cid);
  const age = ws.length ? w.day - Math.min(...ws.map(x => x.start)) : 0;
  // 최소 전쟁 기간: 소국 3개월, 대국 6개월 이상 버틴다
  const pm = c.population / 1e6;
  const minAge = pm < 5 ? 120 : pm < 30 ? 270 : pm < 100 ? 450 : 700;
  if (age < minAge) return;
  const big = c.population >= 30e6 || c.provinceCount >= 15;
  if (!(share < 0.1 || (capLost && share < 0.3 && (!big || c.warExhaustion > 60)) || (share < 0.2 && c.warExhaustion > 85))) return;
  for (const war of warsOf(w, cid)) {
    const side = sideOf(war, cid)!;
    const leader = side === 'A' ? war.leaderA : war.leaderD;
    const mates = (side === 'A' ? war.attackers : war.defenders).filter(x => x !== cid && w.countries[x]?.alive);
    const foes = side === 'A' ? war.defenders : war.attackers;
    const pow = (l: number[]) => l.reduce((a, x) => a + (w.countries[x]?.militaryPower || 0), 0);
    const fightOn = mates.length > 0 && pow(mates) > pow(foes) * 0.25;
    if (leader === cid && !fightOn) {
      chronicle(w, 'war', `${c.shortName} 항복`, `${c.name}이(가) ${war.name}에서 항복했다.`, [cid], true);
      const winnerLeader = side === 'A' ? war.leaderD : war.leaderA;
      const terms = aiPeaceTerms(w, war, winnerLeader, true);
      applyPeace(w, war, side === 'A' ? 'D' : 'A', terms);
      return;
    } else {
      // 개별 항복: 점령지 할양 후 이탈
      const winners = side === 'A' ? war.defenders : war.attackers;
      for (const p of w.provinces) if (p.active && p.owner === cid && winners.includes(p.controller)) transferProvince(w, p.id, p.controller);
      if (side === 'A') war.attackers = war.attackers.filter(x => x !== cid); else war.defenders = war.defenders.filter(x => x !== cid);
      for (const p of w.provinces) if (p.active && p.owner === cid && p.controller !== cid && p.controller >= 0 && !atWar(w, cid, p.controller)) p.controller = cid;
      rehomeDivisions(w, [cid, ...winners]);
      if (side === 'A') war.attackers = war.attackers.filter(x => x !== cid); else war.defenders = war.defenders.filter(x => x !== cid);
      if (leader === cid) {
        const nl = [...mates].sort((a, b) => w.countries[b].militaryPower - w.countries[a].militaryPower)[0];
        if (side === 'A') war.leaderA = nl; else war.leaderD = nl;
        logEvent(w, `${war.name}: ${cname(w, nl)}이(가) 전쟁을 이어간다`, 'war', nl);
      }
      for (const e of winners) addTreaty(w, 'truce', cid, e, w.day + 365 * 5);
      chronicle(w, 'war', `${c.shortName} 개별 항복`, `${c.name}이(가) ${war.name}에서 이탈하며 점령지를 할양했다.`, [cid], false);
    }
  }
}

/** AI 평화 조건 생성 */
export function aiPeaceTerms(w: WorldState, war: War, winner: number, total = false): PeaceTerms {
  const wSide = sideOf(war, winner)!;
  const winners = wSide === 'A' ? war.attackers : war.defenders;
  const losers = wSide === 'A' ? war.defenders : war.attackers;
  const score = Math.abs(warScore(w, war));
  let budget = total ? 9999 : score * 0.6;
  const take: number[] = [];
  const cands = w.provinces.filter(p => p.active && losers.includes(p.owner) && winners.includes(p.controller));
  // 핵심영토 우선, 그 다음 가치
  cands.sort((a, b) => (b.cores.some(c => winners.includes(c)) ? 10 : 0) - (a.cores.some(c => winners.includes(c)) ? 10 : 0) || provinceValue(w, b.id) - provinceValue(w, a.id));
  for (const p of cands) {
    const cost = provinceValue(w, p.id) * 2.2;
    if (cost <= budget || total) { take.push(p.id); budget -= cost; }
  }
  const W = w.countries[winner];
  const loserLeader = wSide === 'A' ? war.leaderD : war.leaderA;
  const L = w.countries[loserLeader];
  const terms: PeaceTerms = { takeProvinces: take, reparations: 0, vassalize: false, annex: false, regimeChange: false, release: false, dmz: false };
  if (total) {
    const lp = L.provinceCount;
    const allTaken = take.filter(p => w.provinces[p].owner === loserLeader).length >= lp;
    if (allTaken && lp <= 5 && (W.personality === 'expansionist' || W.personality === 'militarist' || W.personality === 'revolutionary' || lp <= 4)) terms.annex = true;
    else {
      // 전면 병합 대신: 일부 할양 + 종속/정권교체/해방
      terms.takeProvinces = take.filter(p => w.provinces[p].cores.some(c => winners.includes(c)) || rand() < 0.5).slice(0, Math.max(1, Math.ceil(lp * 0.4)));
      if (W.personality === 'hegemonic' || W.personality === 'militarist' || rand() < 0.4) terms.vassalize = true;
      else if (W.personality === 'revolutionary' || W.gov !== L.gov && rand() < 0.5) terms.regimeChange = true;
      terms.release = rand() < 0.4;
      terms.reparations = Math.round(L.gdp * 0.1);
    }
    terms.dmz = !terms.annex && rand() < 0.4;
  } else if (budget > 5) terms.reparations = Math.round(Math.min(budget * 2, L.gdp * 0.08));
  return terms;
}

export function peaceCost(w: WorldState, terms: PeaceTerms) {
  let cost = 0;
  for (const p of terms.takeProvinces) cost += provinceValue(w, p) * 2.2;
  cost += terms.reparations * 0.4;
  if (terms.vassalize) cost += 35; if (terms.annex) cost += 80; if (terms.regimeChange) cost += 25; if (terms.release) cost += 15; if (terms.dmz) cost += 8;
  return cost;
}

/** 평화 협정 적용. winnerSide: 'A' | 'D' | null(백색평화) */
export function applyPeace(w: WorldState, war: War, winnerSide: 'A' | 'D' | null, terms: PeaceTerms | null) {
  if (!war.active) return;
  const winners = winnerSide === 'A' ? war.attackers : winnerSide === 'D' ? war.defenders : [];
  const losers = winnerSide === 'A' ? war.defenders : winnerSide === 'D' ? war.attackers : [];
  const wl = winnerSide === 'A' ? war.leaderA : winnerSide === 'D' ? war.leaderD : -1;
  const ll = winnerSide === 'A' ? war.leaderD : winnerSide === 'D' ? war.leaderA : -1;
  const lines: string[] = [];
  war.active = false; war.end = w.day;
  (war as any).winner = wl;
  const all = [...war.attackers, ...war.defenders];
  if (terms && winnerSide) {
    if (terms.annex) {
      let n = 0;
      for (const p of w.provinces) if (p.active && p.owner === ll) { transferProvince(w, p.id, winners.includes(p.controller) ? p.controller : wl); n++; }
      lines.push(`${cname(w, ll)} 전역(${n}개 지역) 병합`);
    } else {
      const byC = new Map<number, number>();
      for (const pid of terms.takeProvinces) {
        const p = w.provinces[pid]; if (!losers.includes(p.owner)) continue;
        const to = winners.includes(p.controller) ? p.controller : wl;
        transferProvince(w, pid, to);
        byC.set(to, (byC.get(to) || 0) + 1);
      }
      for (const [c, n] of byC) lines.push(`${cname(w, c)} ${n}개 지역 획득`);
      if (terms.reparations > 0 && w.countries[ll]?.alive) {
        const L = w.countries[ll];
        L.debt += terms.reparations; w.countries[wl].treasury += terms.reparations;
        lines.push(`배상금 ${terms.reparations.toFixed(0)}B`);
      }
      if (terms.vassalize && w.countries[ll]?.alive) { w.countries[ll].overlord = wl; lines.push(`${cname(w, ll)} 종속국화`); }
      if (terms.regimeChange && w.countries[ll]?.alive) { changeGovernment(w, ll, w.countries[wl].gov, 'pacifist', '전후 처리로 '); lines.push('정권 교체'); setRel(w, ll, wl, 40); }
      if (terms.release && w.countries[ll]?.alive) {
        const L = w.countries[ll];
        const cand = w.provinces.filter(p => p.active && p.owner === ll && p.culture !== L.culture && p.id !== L.capital).map(p => p.id);
        if (cand.length >= 1) {
          const nid = createCountry(w, cand, { from: ll, personality: 'defensive' });
          if (nid >= 0) { lines.push(`${cname(w, nid)} 독립`); setRel(w, nid, wl, 50); chronicle(w, 'nation', `${w.countries[nid].name} 독립`, `전후 처리로 ${w.countries[nid].name}이(가) ${cname(w, ll)}로부터 독립했다.`, [nid], true); }
        }
      }
      if (terms.dmz && w.countries[ll]?.alive) {
        for (const p of w.provinces) if (p.active && p.owner === ll && p.neighbors.some(n => winners.includes(w.provinces[n].owner))) { p.dmzUntil = w.day + 3650; p.buildings.fort = 0; }
        lines.push('비무장지대 설정');
      }
    }
  }
  // 점령 해제, 휴전, 관계
  // 이 전쟁의 점령지만 반환 (다른 전쟁에서 여전히 교전 중이면 유지)
  for (const p of w.provinces) {
    if (!p.active || p.owner < 0 || p.controller === p.owner || p.controller < 0) continue;
    const opp = (war.attackers.includes(p.owner) && war.defenders.includes(p.controller)) || (war.defenders.includes(p.owner) && war.attackers.includes(p.controller));
    if (opp && !atWar(w, p.owner, p.controller)) p.controller = p.owner;
  }
  bumpControl();
  for (const a of war.attackers) for (const d of war.defenders) {
    if (!w.countries[a]?.alive || !w.countries[d]?.alive) continue;
    addTreaty(w, 'truce', a, d, w.day + 365 * 5);
    addRel(w, a, d, winnerSide ? -10 : 15);
  }
  // 교전 부대 정리
  rehomeDivisions(w, all);
  for (const c of all) { const C = w.countries[c]; if (C?.alive) { C.warExhaustion *= 0.6; } }
  if (wl >= 0 && w.countries[wl]?.alive) { w.countries[wl].legitimacy = Math.min(100, w.countries[wl].legitimacy + 10); w.countries[wl].stability += 5; }
  if (ll >= 0 && w.countries[ll]?.alive) { w.countries[ll].legitimacy -= 12; w.countries[ll].stability -= 8; }
  const years = ((w.day - war.start) / 365).toFixed(1);
  const res = winnerSide ? `${cname(w, wl)} 측 승리` : '백색 평화';
  war.result = `${res}${lines.length ? ' — ' + lines.join(', ') : ''}`;
  chronicle(w, 'war', `${war.name} 종결`, `${years}년간의 전쟁이 끝났다. ${war.result}. 총 사상자 ${Math.round((war.casualtiesA + war.casualtiesD) / 1000)}천 명.`, all.slice(0, 6), true);
  for (const c of all) if (w.countries[c]) checkDeath(w, c);
}

/**
 * 전쟁 종료/이탈 후 부대 정리: 더 이상 교전하지 않는 상대와의 전투만 해제하고,
 * 통행할 수 없게 된 지역의 부대는 가장 가까운 아군 지역으로 철수시킨다.
 * (다른 전쟁에서 싸우는 부대는 그대로 둔다)
 */
export function rehomeDivisions(w: WorldState, owners: number[]) {
  const set = new Set(owners);
  w.battles = w.battles.filter(b => atWar(w, b.attackerCountry, b.defenderCountry));
  const liveBattles = new Set(w.battles.map(b => b.id));
  for (const d of w.divisions) {
    if (!set.has(d.owner)) continue;
    if (d.battle >= 0 && !liveBattles.has(d.battle)) d.battle = -1;
    if (d.path.length && d.path.some(pid => !canEnter(w, d.owner, pid))) { d.path = []; d.progress = 0; }
    if (canEnter(w, d.owner, d.province)) continue;
    // 가장 가까운 통행 가능 지역 (BFS)
    const seen = new Set([d.province]); const q = [d.province]; let found = -1;
    while (q.length && found < 0) {
      const c = q.shift()!;
      for (const n of [...w.provinces[c].neighbors, ...w.provinces[c].seaNeighbors]) {
        if (seen.has(n)) continue; seen.add(n);
        if (w.provinces[n].active && canEnter(w, d.owner, n) && !atWar(w, d.owner, w.provinces[n].controller)) { found = n; break; }
        if (seen.size < 400) q.push(n);
      }
    }
    if (found < 0) { const cap = w.countries[d.owner]?.capital; found = cap !== undefined && w.provinces[cap]?.controller === d.owner ? cap : -1; }
    if (found >= 0) { d.province = found; d.path = []; d.progress = 0; d.battle = -1; }
  }
}

export function endAllWarsOf(w: WorldState, cid: number) {
  for (const war of warsOf(w, cid)) applyPeace(w, war, null, null);
}

export function monthlyWar(w: WorldState) {
  for (const c of w.countries) {
    if (!c.alive) continue;
    const wars = warsOf(w, c.id);
    if (wars.length) {
      const share = controlledShare(w, c.id);
      c.warExhaustion = Math.min(100, c.warExhaustion + 0.35 + (1 - share) * 2.5);
    } else { c.warExhaustion = Math.max(0, c.warExhaustion - 3); c.capLost = 0; }
  }
  for (const c of w.countries) if (c.alive && warsOf(w, c.id).length) checkCapitulation(w, c.id);
  monthlyWarJoin(w);
}

/** 전쟁 확대: 동맹국 참전 요청, 기회주의적 참전, 종속국 자동 참전 */
export function monthlyWarJoin(w: WorldState) {
  if (w.rules.noWar) return;
  for (const war of w.wars) {
    if (!war.active) continue;
    for (const c of w.countries) {
      if (!c.alive || war.attackers.includes(c.id) || war.defenders.includes(c.id)) continue;
      if (c.id === w.player && w.mode === 'ruler') continue;
      const allies = new Set(alliesOf(w, c.id));
      // 전쟁 주도국과 직접 동맹이거나, 교전국과 국경을 맞댄 동맹국만 참전 요청 대상
      const nbs = countryNeighbors(w, c.id);
      const withA = allies.has(war.leaderA) || war.attackers.some(a => allies.has(a) && war.defenders.some(d => nbs.has(d)));
      const withD = allies.has(war.leaderD) || war.defenders.some(d => allies.has(d) && war.attackers.some(a => nbs.has(a)));
      let side: 'A' | 'D' | null = null;
      if (c.overlord >= 0 && war.attackers.includes(c.overlord)) side = 'A';
      else if (c.overlord >= 0 && war.defenders.includes(c.overlord)) side = 'D';
      else if (withD && !withA && rand() < 0.05) side = 'D';
      else if (withA && !withD && rand() < 0.03) side = 'A';
      else if (!withA && !withD && warsOf(w, c.id).length === 0 && c.stability > 40) {
        // 기회주의 참전: 한쪽 진영에 강한 적대감
        const relA = getRel(w, c.id, war.leaderA), relD = getRel(w, c.id, war.leaderD);
        const aggr = c.personality === 'expansionist' || c.personality === 'militarist' || c.personality === 'hegemonic' || c.personality === 'revolutionary' ? 1 : 0.3;
        const p = 0.012 * aggr * w.rules.aiAggression;
        const touchD = war.defenders.some(d => nbs.has(d)), touchA = war.attackers.some(a => nbs.has(a));
        if (relD < -55 && relA > 15 && touchD && rand() < p) side = 'A';
        else if (relA < -55 && relD > 15 && touchA && rand() < p) side = 'D';
      }
      if (!side) continue;
      const enemies = side === 'A' ? war.defenders : war.attackers;
      const friends = side === 'A' ? war.attackers : war.defenders;
      // 이미 압도적인 쪽에는 (종속국 외) 편승하지 않음
      const pow = (l: number[]) => l.reduce((a, x) => a + (w.countries[x]?.militaryPower || 0), 0);
      if (c.overlord < 0 && pow(friends) > pow(enemies) * 2.2) continue;
      if (enemies.some(e => hasTreaty(w, 'alliance', c.id, e))) continue;
      joinWar(w, war, c.id, side);
      chronicle(w, 'war', `${c.shortName} 참전`, `${c.name}이(가) ${war.name}에 ${side === 'A' ? cname(w, war.leaderA) : cname(w, war.leaderD)} 측으로 참전했다.`, [c.id], c.provinceCount >= 8);
    }
  }
}

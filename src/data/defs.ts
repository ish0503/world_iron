import type { BuildingId, ResourceId } from '../types/Province';
import type { GovType, Personality, TechField } from '../types/Country';
import type { UnitType, ShipType, PlaneType } from '../types/Military';

export const RESOURCES: Record<ResourceId, { name: string; icon: string; color: number; base: number }> = {
  food: { name: '식량', icon: '🌾', color: 0xc8d24a, base: 0.004 },
  steel: { name: '철강', icon: '⛏', color: 0x9aa7b4, base: 0.01 },
  coal: { name: '석탄', icon: '⚫', color: 0x444444, base: 0.007 },
  oil: { name: '석유', icon: '🛢', color: 0x2b2b2b, base: 0.016 },
  rare: { name: '희귀광물', icon: '💎', color: 0x7bd3e8, base: 0.04 },
};
export const RES_IDS: ResourceId[] = ['food', 'steel', 'coal', 'oil', 'rare'];

export interface BuildingDef { name: string; icon: string; cost: number; days: number; max: number; desc: string; }
export const BUILDINGS: Record<BuildingId, BuildingDef> = {
  housing: { name: '주거 시설', icon: '🏘', cost: 1.2, days: 90, max: 5, desc: '인구 수용력 +25%' },
  farm: { name: '농장', icon: '🌾', cost: 1.0, days: 60, max: 5, desc: '식량 생산 +40%' },
  factory: { name: '공장', icon: '🏭', cost: 8.0, days: 180, max: 10, desc: '산업 생산력 +1, 고용 창출' },
  market: { name: '시장', icon: '🏪', cost: 1.5, days: 90, max: 5, desc: '서비스업 GDP +15%, 세수 증가' },
  port: { name: '항구', icon: '⚓', cost: 2.0, days: 150, max: 3, desc: '해상 이동·무역·해군 보급' },
  rail: { name: '철도역', icon: '🚂', cost: 1.5, days: 120, max: 5, desc: '보급 및 이동 속도 증가' },
  base: { name: '군사 기지', icon: '🎖', cost: 2.0, days: 120, max: 3, desc: '부대 회복, 병력 보충 강화' },
  lab: { name: '연구 시설', icon: '🔬', cost: 5.0, days: 180, max: 5, desc: '연구 속도 +6%' },
  power: { name: '발전소', icon: '⚡', cost: 6.0, days: 180, max: 3, desc: '공장 효율 +15%' },
  fort: { name: '요새', icon: '🏰', cost: 2.0, days: 150, max: 5, desc: '방어 계수 +15%' },
  mine: { name: '광산', icon: '⛏', cost: 2.0, days: 150, max: 5, desc: '자원 채굴량 +50%' },
};
export const BUILDING_IDS = Object.keys(BUILDINGS) as BuildingId[];

export interface UnitDef {
  name: string; short: string; atk: number; def: number; brk: number; hp: number;
  speed: number; cost: number; steel: number; oil: number; upkeep: number;
  aa: number; at: number; armor: number; req: Partial<Record<TechField, number>>;
}
export const UNITS: Record<UnitType, UnitDef> = {
  infantry: { name: '보병 사단', short: '보병', atk: 10, def: 14, brk: 3, hp: 10000, speed: 1.0, cost: 0.6, steel: 4, oil: 0, upkeep: 0.0025, aa: 1, at: 1, armor: 0, req: {} },
  mechanized: { name: '기계화 보병', short: '기계화', atk: 14, def: 16, brk: 8, hp: 10000, speed: 2.2, cost: 1.6, steel: 10, oil: 2, upkeep: 0.006, aa: 2, at: 3, armor: 0.2, req: { military: 3, transport: 3 } },
  armor: { name: '전차 사단', short: '전차', atk: 24, def: 10, brk: 22, hp: 8000, speed: 2.0, cost: 2.6, steel: 18, oil: 4, upkeep: 0.009, aa: 1, at: 6, armor: 0.7, req: { military: 4, industry: 3 } },
  artillery: { name: '포병 사단', short: '포병', atk: 22, def: 6, brk: 4, hp: 7000, speed: 0.9, cost: 1.0, steel: 8, oil: 0, upkeep: 0.0035, aa: 0, at: 2, armor: 0, req: { military: 1 } },
  antitank: { name: '대전차 부대', short: '대전차', atk: 9, def: 15, brk: 2, hp: 7000, speed: 1.0, cost: 1.0, steel: 7, oil: 0, upkeep: 0.0035, aa: 0, at: 18, armor: 0, req: { military: 2 } },
  antiair: { name: '대공 부대', short: '대공', atk: 6, def: 12, brk: 2, hp: 7000, speed: 1.0, cost: 1.0, steel: 7, oil: 0, upkeep: 0.0035, aa: 16, at: 2, armor: 0, req: { military: 2 } },
  special: { name: '특수부대', short: '특수', atk: 16, def: 16, brk: 10, hp: 5000, speed: 1.3, cost: 1.8, steel: 6, oil: 0, upkeep: 0.006, aa: 1, at: 3, armor: 0, req: { military: 3 } },
  engineer: { name: '공병 부대', short: '공병', atk: 8, def: 16, brk: 5, hp: 7000, speed: 1.0, cost: 0.9, steel: 5, oil: 0, upkeep: 0.003, aa: 1, at: 2, armor: 0, req: { construction: 2 } },
};
export const UNIT_TYPES = Object.keys(UNITS) as UnitType[];

export const SHIPS: Record<ShipType, { name: string; power: number; cost: number; req: number }> = {
  destroyer: { name: '구축함', power: 2, cost: 0.4, req: 0 },
  cruiser: { name: '순양함', power: 5, cost: 1.0, req: 2 },
  battleship: { name: '전함', power: 14, cost: 3.0, req: 4 },
  carrier: { name: '항공모함', power: 18, cost: 4.0, req: 6 },
  submarine: { name: '잠수함', power: 4, cost: 0.6, req: 1 },
  transport: { name: '수송선', power: 0.5, cost: 0.3, req: 0 },
};
export const PLANES: Record<PlaneType, { name: string; power: number; cost: number; req: number }> = {
  fighter: { name: '전투기', power: 3, cost: 0.08, req: 2 },
  bomber: { name: '폭격기', power: 4, cost: 0.15, req: 3 },
  attacker: { name: '공격기', power: 3.5, cost: 0.1, req: 3 },
  recon: { name: '정찰기', power: 0.5, cost: 0.04, req: 1 },
  airlift: { name: '수송기', power: 0.3, cost: 0.08, req: 4 },
};

export const GOVS: Record<GovType, { name: string; suffix: string[]; stab: number; legit: number; elections: boolean; tax: number; mil: number; color: number }> = {
  democracy: { name: '민주주의', suffix: ['공화국', '민주공화국', '연합'], stab: 5, legit: 10, elections: true, tax: 0.22, mil: 0.8, color: 0x4a90d9 },
  republic: { name: '공화정', suffix: ['공화국', '공화정'], stab: 3, legit: 5, elections: true, tax: 0.22, mil: 0.9, color: 0x6fb7e8 },
  constitutional: { name: '입헌군주제', suffix: ['왕국', '연합왕국'], stab: 6, legit: 8, elections: true, tax: 0.2, mil: 0.9, color: 0x9b7fd4 },
  absolute: { name: '절대군주제', suffix: ['왕국', '제국', '대공국', '술탄국'], stab: 0, legit: 0, elections: false, tax: 0.18, mil: 1.1, color: 0x8e44ad },
  junta: { name: '군사독재', suffix: ['군사정부', '국가재건위원회', '국'], stab: -5, legit: -10, elections: false, tax: 0.2, mil: 1.4, color: 0x7f8c4d },
  oneparty: { name: '일당제', suffix: ['인민공화국', '사회주의 공화국', '국'], stab: 2, legit: -3, elections: false, tax: 0.28, mil: 1.2, color: 0xc0392b },
  federation: { name: '연방제', suffix: ['연방', '합중국', '연방공화국'], stab: 4, legit: 6, elections: true, tax: 0.2, mil: 0.9, color: 0x2e86ab },
  theocracy: { name: '신정제', suffix: ['신성국', '교국', '신정국'], stab: 2, legit: 4, elections: false, tax: 0.18, mil: 1.0, color: 0xd4a017 },
};
export const GOV_IDS = Object.keys(GOVS) as GovType[];

export const PERSONALITIES: Record<Personality, { name: string; desc: string; aggr: number; mil: number; econ: number; diplo: number; color: number }> = {
  pacifist: { name: '평화주의', desc: '외교와 경제 중시', aggr: 0.2, mil: 0.6, econ: 1.3, diplo: 1.4, color: 0x7fd18b },
  expansionist: { name: '팽창주의', desc: '영토 확장 추구', aggr: 1.6, mil: 1.3, econ: 0.9, diplo: 0.8, color: 0xe67e22 },
  militarist: { name: '군국주의', desc: '군사력 강화', aggr: 1.3, mil: 1.7, econ: 0.8, diplo: 0.7, color: 0xb03a2e },
  mercantile: { name: '상업주의', desc: '무역과 경제 중심', aggr: 0.5, mil: 0.8, econ: 1.5, diplo: 1.2, color: 0xf1c40f },
  isolationist: { name: '고립주의', desc: '외부 개입 최소화', aggr: 0.3, mil: 1.0, econ: 1.1, diplo: 0.4, color: 0x95a5a6 },
  hegemonic: { name: '패권주의', desc: '국제적 영향력 확대', aggr: 1.1, mil: 1.3, econ: 1.1, diplo: 1.3, color: 0x8e44ad },
  revolutionary: { name: '혁명주의', desc: '기존 국제 질서 변경 추구', aggr: 1.4, mil: 1.2, econ: 0.9, diplo: 0.7, color: 0xe74c3c },
  defensive: { name: '방어주의', desc: '국토 방어와 생존 우선', aggr: 0.4, mil: 1.2, econ: 1.0, diplo: 1.0, color: 0x3498db },
};
export const PERSONALITY_IDS = Object.keys(PERSONALITIES) as Personality[];

export const TECHS: Record<TechField, { name: string; icon: string; effect: string }> = {
  agriculture: { name: '농업', icon: '🌾', effect: '식량 생산 +8%/단계' },
  construction: { name: '건설', icon: '🏗', effect: '건설 속도 +8%, 비용 -4%, 인구 수용 +5%' },
  medicine: { name: '의학', icon: '⚕', effect: '사망률 감소, 전염병 저항' },
  industry: { name: '산업', icon: '🏭', effect: '공업 생산 +10%/단계' },
  military: { name: '군사', icon: '⚔', effect: '공격·방어 +7%/단계, 신규 병종' },
  transport: { name: '교통', icon: '🚂', effect: '이동 +5%, 보급 범위 증가' },
  naval: { name: '해양', icon: '⚓', effect: '함선 해금, 해군력 +10%' },
  communication: { name: '통신', icon: '📡', effect: '외교·연구 +5%, 안정도' },
  energy: { name: '에너지', icon: '⚡', effect: '공업 +5%, 연료 효율' },
};
export const TECH_IDS = Object.keys(TECHS) as TechField[];
export const ERAS = ['농경 시대', '근세', '산업 시대', '근대', '현대', '정보화 시대', '첨단 시대'];

export const MONTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function relationLabel(v: number): { label: string; color: string } {
  if (v <= -75) return { label: '극도의 적대', color: '#ff3b30' };
  if (v <= -40) return { label: '적대', color: '#ff6b4a' };
  if (v <= -10) return { label: '긴장', color: '#ffa94d' };
  if (v < 10) return { label: '중립', color: '#c9d1d9' };
  if (v < 40) return { label: '우호', color: '#9be15d' };
  if (v < 75) return { label: '친밀', color: '#4cd964' };
  return { label: '동맹 수준', color: '#36d1ff' };
}

export function cityTier(pop: number): { tier: number; name: string } {
  if (pop >= 3_000_000) return { tier: 6, name: '거대도시' };
  if (pop >= 1_000_000) return { tier: 5, name: '대도시' };
  if (pop >= 400_000) return { tier: 4, name: '도시' };
  if (pop >= 150_000) return { tier: 3, name: '소도시' };
  if (pop >= 50_000) return { tier: 2, name: '마을' };
  return { tier: 1, name: '정착지' };
}

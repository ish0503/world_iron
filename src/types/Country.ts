import type { ResourceId } from './Province';
import type { ShipType, PlaneType } from './Military';

export type GovType =
  | 'democracy' | 'republic' | 'constitutional' | 'absolute'
  | 'junta' | 'oneparty' | 'federation' | 'theocracy';

export type Personality =
  | 'pacifist' | 'expansionist' | 'militarist' | 'mercantile'
  | 'isolationist' | 'hegemonic' | 'revolutionary' | 'defensive';

export type TechField =
  | 'agriculture' | 'construction' | 'medicine' | 'industry' | 'military'
  | 'transport' | 'naval' | 'communication' | 'energy';

export interface AIGoal {
  type: 'army' | 'alliance' | 'economy' | 'territory' | 'navy' | 'tech' | 'stability';
  target?: number;
  value: number;
  start: number;
  deadline: number;
  label: string;
}

export interface Budget {
  military: number;   // 0~1 군비 지출 강도 (나머지는 GDP 대비 비율)
  research: number;
  welfare: number;
  infrastructure: number;
}

export interface CountryHistoryPoint {
  d: number; gdp: number; pop: number; mil: number; prov: number;
}

export interface Country {
  id: number;
  tag: string;
  name: string;
  shortName: string;
  color: number;
  alive: boolean;
  capital: number;
  gov: GovType;
  leader: string;
  leaderSince: number;
  personality: Personality;
  culture: number;
  religion: number;
  founded: number;
  treasury: number;          // B (십억)
  debt: number;
  taxRate: number;
  budget: Budget;
  stability: number;         // 0~100
  legitimacy: number;        // 0~100
  warExhaustion: number;     // 0~100
  inflation: number;         // 연율
  unemployment: number;      // 0~1
  gdp: number;               // 연간 B
  gdpPrev: number;           // 1년 전 GDP
  gdpGrowth: number;
  income: number;            // 일일 수입 (B)
  expense: number;
  tradeBalance: number;
  manpower: number;
  conscription: number;      // 0.01~0.1
  warEconomy: boolean;
  stock: Record<ResourceId, number>;
  prod: Record<ResourceId, number>;   // 월간 생산
  cons: Record<ResourceId, number>;   // 월간 소비
  milUse: Record<ResourceId, number>; // 이번 달 군 소비 누적
  tech: Record<TechField, number>;
  techProgress: number;
  researchFocus: TechField;
  ships: Record<ShipType, number>;
  planes: Record<PlaneType, number>;
  /** 진행 중 해군/공군 생산 */
  autoImport: boolean;
  aiNext: number;            // 다음 AI 판단 일
  aiMilNext: number;
  goals: AIGoal[];
  history: CountryHistoryPoint[];
  lastElection: number;
  famine: number;            // 기근 강도 0~1
  overlord: number;          // -1 없음
  provinceCount: number;
  population: number;
  militaryPower: number;
  totalIC: number;
  isRebel?: boolean;
  /** 핵탄두 보유 수 */
  nukes?: number;
  /** 실제 국가 영문명 (실제 세계 시나리오) */
  realName?: string;
  /** 1인당 생산성 배율 (실제 세계) */
  productivity?: number;
  /** 이번 전쟁에서 수도 함락 횟수 */
  capLost?: number;
  /** 부대 훈련 대기열 */
  training?: import('./Military').TrainingOrder[];
  /** 플레이어 국가 자동 모집 */
  autoRecruit?: boolean;
  autoResearch?: boolean;
  avgUnrest?: number;
  lastCrisis?: number;
  /** 경기 순환 위상 (라디안) 및 주기(년) */
  cycle?: number;
  cyclePeriod?: number;
}

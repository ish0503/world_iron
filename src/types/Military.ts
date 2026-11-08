export type UnitType =
  | 'infantry' | 'mechanized' | 'armor' | 'artillery'
  | 'antitank' | 'antiair' | 'special' | 'engineer';

export interface Division {
  id: number;
  owner: number;
  type: UnitType;
  name: string;
  province: number;
  /** 이동 경로 (다음 프로빈스부터) */
  path: number[];
  progress: number;           // 다음 칸까지 진행도 (셀 단위 거리)
  strength: number;           // 병력
  maxStrength: number;
  org: number;                // 조직력 0~1
  morale: number;             // 사기 0~1
  equipment: number;          // 장비 상태 0~1
  supply: number;             // 0~1 마지막 보급 수준
  battle: number;             // 참여 중인 전투 id (-1)
  aiControlled: boolean;
  outOfSupplyDays: number;
}

export interface Battle {
  id: number;
  province: number;
  attackerCountry: number;
  defenderCountry: number;
  attackers: number[];        // division ids
  defenders: number[];
  start: number;              // day
  attackerLoss: number;
  defenderLoss: number;
  lastResult: string;
  warId: number;
}

export interface War {
  id: number;
  name: string;
  attackers: number[];
  defenders: number[];
  leaderA: number;
  leaderD: number;
  start: number;
  goal: number[];             // 목표 프로빈스
  casualtiesA: number;
  casualtiesD: number;
  battles: number;
  active: boolean;
  end?: number;
  result?: string;
}

export type ShipType = 'destroyer' | 'cruiser' | 'battleship' | 'carrier' | 'submarine' | 'transport';
export type PlaneType = 'fighter' | 'bomber' | 'attacker' | 'recon' | 'airlift';

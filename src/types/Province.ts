export type ResourceId = 'food' | 'steel' | 'coal' | 'oil' | 'rare';

export type BuildingId =
  | 'housing' | 'farm' | 'factory' | 'market' | 'port' | 'rail'
  | 'base' | 'lab' | 'power' | 'fort' | 'mine';

export interface Province {
  id: number;
  name: string;
  /** 소유 국가 (-1 = 미개척지) */
  owner: number;
  /** 실제 점령 국가 (전쟁 중 점령) */
  controller: number;
  /** 핵심 영토 보유 국가들 (회복 의지) */
  cores: number[];
  cx: number; cy: number;     // 중심 (셀 좌표)
  cellCount: number;
  terrain: number;            // 우세 지형
  coastal: boolean;
  river: boolean;
  neighbors: number[];        // 육상 인접
  seaNeighbors: number[];     // 해상 인접 (항구 간)
  pop: number;                // 인구 (명)
  culture: number;
  religion: number;
  unrest: number;             // 0~100
  resource: ResourceId | null;
  resourceAmount: number;
  buildings: Partial<Record<BuildingId, number>>;
  /** 건설 대기열 */
  construction: { b: BuildingId; days: number; total: number } | null;
  /** 재해 효과 */
  disaster: { type: string; until: number; food: number } | null;
  plague: number;             // 감염 강도 0~1
  devastation: number;        // 전쟁 피해 0~1
  dmzUntil: number;
  /** 마지막 월간 계산 결과 */
  food: number; ic: number; gdp: number;
  active: boolean;            // 바다에 잠긴 프로빈스 = false
  /** 수용력 배율 (실제 세계 시나리오의 인구 밀집 지역) */
  capMul?: number;
}

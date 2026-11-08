export const T = {
  DEEP: 0, SEA: 1, LAKE: 2, PLAINS: 3, FOREST: 4, JUNGLE: 5,
  DESERT: 6, HILLS: 7, MOUNTAIN: 8, TUNDRA: 9, SNOW: 10, SWAMP: 11,
} as const;

export interface TerrainDef {
  id: number; name: string; color: [number, number, number];
  water: boolean; move: number; atk: number; def: number;
  food: number; cap: number;
}

export const TERRAINS: TerrainDef[] = [
  { id: 0, name: '심해', color: [18, 42, 74], water: true, move: 1, atk: 1, def: 1, food: 0, cap: 0 },
  { id: 1, name: '바다', color: [33, 72, 112], water: true, move: 1, atk: 1, def: 1, food: 0, cap: 0 },
  { id: 2, name: '호수', color: [52, 102, 146], water: true, move: 1, atk: 1, def: 1, food: 0, cap: 0 },
  { id: 3, name: '평야', color: [126, 160, 86], water: false, move: 1, atk: 1, def: 1, food: 1.25, cap: 1.3 },
  { id: 4, name: '숲', color: [62, 110, 58], water: false, move: 1.4, atk: 0.85, def: 1.2, food: 0.8, cap: 0.8 },
  { id: 5, name: '밀림', color: [40, 96, 50], water: false, move: 1.8, atk: 0.7, def: 1.35, food: 0.8, cap: 0.7 },
  { id: 6, name: '사막', color: [212, 188, 128], water: false, move: 1.3, atk: 0.95, def: 0.95, food: 0.25, cap: 0.3 },
  { id: 7, name: '구릉', color: [150, 140, 92], water: false, move: 1.5, atk: 0.85, def: 1.3, food: 0.8, cap: 0.8 },
  { id: 8, name: '산맥', color: [128, 112, 98], water: false, move: 2.4, atk: 0.6, def: 1.7, food: 0.35, cap: 0.35 },
  { id: 9, name: '툰드라', color: [150, 158, 140], water: false, move: 1.5, atk: 0.85, def: 1.1, food: 0.35, cap: 0.3 },
  { id: 10, name: '설원', color: [230, 234, 240], water: false, move: 2, atk: 0.7, def: 1.2, food: 0.05, cap: 0.08 },
  { id: 11, name: '습지', color: [84, 110, 78], water: false, move: 2, atk: 0.75, def: 1.25, food: 0.6, cap: 0.5 },
];

export const isWater = (t: number) => t <= 2;

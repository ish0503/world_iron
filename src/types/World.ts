import type { Province, ResourceId } from './Province';
import type { Country } from './Country';
import type { Division, Battle, War } from './Military';

export type TreatyType =
  | 'alliance' | 'nap' | 'trade' | 'access' | 'guarantee'
  | 'truce' | 'sanction' | 'support' | 'econ';

export interface Treaty {
  type: TreatyType;
  a: number;
  b: number;
  /** 만료 일 (-1 = 무기한) */
  until: number;
}

export type HistoryCategory = 'nation' | 'war' | 'economy' | 'nature' | 'politics' | 'diplomacy' | 'culture';

export interface HistoryEntry {
  d: number;
  cat: HistoryCategory;
  title: string;
  text: string;
  major: boolean;
  countries: number[];
  province?: number;
}

export interface Culture { id: number; name: string; color: number; }
export interface Religion { id: number; name: string; color: number; founded: number; }

export interface WorldRules {
  noWar: boolean;
  infiniteResources: boolean;
  popGrowth: number;        // 배율
  aiAggression: number;     // 0~2
  disasterRate: number;     // 0~3
  techSpeed: number;        // 배율
  fogOfWar: boolean;
}

export interface DiplomaticOffer {
  id: number;
  from: number;
  to: number;
  kind: 'alliance' | 'nap' | 'trade' | 'peace' | 'ultimatum' | 'vassal' | 'access' | 'support';
  text: string;
  provinces?: number[];
  warId?: number;
  terms?: PeaceTerms;
  expires: number;
}

export interface PeaceTerms {
  takeProvinces: number[];
  reparations: number;
  vassalize: boolean;
  annex: boolean;
  regimeChange: boolean;
  release: boolean;
  dmz: boolean;
}

export type GameMode = 'ruler' | 'observer' | 'god' | 'editor';

export interface WorldState {
  version: number;
  name: string;
  seed: number;
  rng: number;
  width: number;
  height: number;
  terrain: Uint8Array;
  height_: Uint8Array;
  river: Uint8Array;
  cellProv: Int32Array;
  provinces: Province[];
  countries: Country[];
  divisions: Division[];
  battles: Battle[];
  wars: War[];
  treaties: Treaty[];
  relations: number[];        // n*n 평탄 배열 (국가 수 확장 시 재구성)
  relSize: number;
  cultures: Culture[];
  religions: Religion[];
  startYear: number;
  day: number;
  chronicle: HistoryEntry[];
  log: { d: number; text: string; type: string; c?: number }[];
  rules: WorldRules;
  prices: Record<ResourceId, number>;
  globalTemp: number;
  nextId: { div: number; war: number; battle: number; offer: number };
  player: number;             // -1 = 없음
  mode: GameMode;
  offers: DiplomaticOffer[];
  firsts: Record<string, boolean>;
  worldWarCount: number;
}

import { openDB, type IDBPDatabase } from 'idb';
import type { WorldState } from '../types/World';
import { fmtDate } from '../simulation/Calendar';

export const SAVE_VERSION = 2;

export interface SaveMeta {
  id: string;
  name: string;
  savedAt: number;
  gameDate: string;
  version: number;
  player: string;
  countries: number;
  auto: boolean;
}
interface SaveRecord extends SaveMeta { data: string; }

function b64(u: Uint8Array): string {
  let s = ''; const CH = 0x8000;
  for (let i = 0; i < u.length; i += CH) s += String.fromCharCode.apply(null, Array.from(u.subarray(i, i + CH)));
  return btoa(s);
}
function unb64(s: string): Uint8Array {
  const bin = atob(s); const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}

/** 월드 → JSON 문자열 (타입 배열은 base64) */
export function serializeWorld(w: WorldState): string {
  const { terrain, height_, river, cellProv, ...rest } = w;
  return JSON.stringify({
    ...rest,
    relations: rest.relations.map(v => Math.round(v * 10) / 10),
    version: SAVE_VERSION,
    __bin: {
      terrain: b64(terrain), height_: b64(height_), river: b64(river),
      cellProv: b64(new Uint8Array(cellProv.buffer, cellProv.byteOffset, cellProv.byteLength)),
    },
  });
}

/** 세이브 마이그레이션: 이전 버전 데이터 구조를 현재 구조로 보정 */
const MIGRATIONS: Record<number, (o: any) => void> = {
  1: (o) => {
    // v1 → v2: milUse, 경기 순환, 조약 만료 필드 보정
    for (const c of o.countries || []) {
      c.milUse ??= { food: 0, steel: 0, coal: 0, oil: 0, rare: 0 };
      c.goals ??= [];
    }
    for (const t of o.treaties || []) t.until ??= -1;
    o.offers ??= []; o.firsts ??= {}; o.worldWarCount ??= 0;
  },
};

export function deserializeWorld(json: string | object): WorldState {
  const o: any = typeof json === 'string' ? JSON.parse(json) : json;
  if (!o || typeof o !== 'object' || !o.__bin || !Array.isArray(o.provinces) || !Array.isArray(o.countries)) throw new Error('올바른 WORLD DOMINION 세이브 파일이 아닙니다');
  let v = o.version || 1;
  if (v > SAVE_VERSION) throw new Error(`더 새로운 버전(${v})의 세이브입니다`);
  while (v < SAVE_VERSION) { MIGRATIONS[v]?.(o); v++; }
  const bin = o.__bin; delete o.__bin;
  const cp = unb64(bin.cellProv);
  const w: WorldState = {
    ...o,
    version: SAVE_VERSION,
    terrain: unb64(bin.terrain), height_: unb64(bin.height_), river: unb64(bin.river),
    cellProv: new Int32Array(cp.buffer, cp.byteOffset, cp.byteLength / 4),
  };
  validateWorld(w);
  return w;
}

/** 데이터 검증 및 자동 복구. 발견한 문제 목록 반환 */
export function validateWorld(w: WorldState): string[] {
  const issues: string[] = [];
  const N = w.width * w.height;
  if (w.terrain.length !== N || w.cellProv.length !== N) throw new Error('지도 데이터 크기가 맞지 않습니다');
  const P = w.provinces.length, C = w.countries.length;
  for (let i = 0; i < N; i++) if (w.cellProv[i] >= P) { w.cellProv[i] = -1; issues.push('cell'); }
  for (const p of w.provinces) {
    if (p.owner >= C) { p.owner = -1; issues.push(`province ${p.id} owner`); }
    if (p.controller >= C) { p.controller = p.owner; issues.push(`province ${p.id} controller`); }
    if (p.owner >= 0 && !w.countries[p.owner].alive) { p.owner = -1; p.controller = -1; issues.push(`province ${p.id} dead owner`); }
    p.neighbors = (p.neighbors || []).filter(n => n < P);
    p.seaNeighbors = (p.seaNeighbors || []).filter(n => n < P);
    if (!isFinite(p.pop)) { p.pop = 10000; issues.push('pop'); }
    p.buildings ||= {};
  }
  for (const c of w.countries) {
    for (const k of ['treasury', 'debt', 'gdp', 'stability'] as const) if (!isFinite(c[k])) { (c as any)[k] = k === 'stability' ? 50 : 0; issues.push(`${c.tag} ${k}`); }
    if (c.alive && (c.capital >= P || w.provinces[c.capital]?.owner !== c.id)) {
      const p = w.provinces.find(x => x.owner === c.id);
      if (p) c.capital = p.id; else c.alive = false;
      issues.push(`${c.tag} capital`);
    }
  }
  w.divisions = w.divisions.filter(d => d.owner < C && w.countries[d.owner]?.alive && d.province < P);
  const need = C + 1;
  if (!w.relSize || w.relSize < need || w.relations.length !== w.relSize * w.relSize) {
    const ns = need + 64; const nr = new Array(ns * ns).fill(0);
    if (w.relSize) for (let a = 0; a < Math.min(w.relSize, ns); a++) for (let b = 0; b < Math.min(w.relSize, ns); b++) nr[a * ns + b] = w.relations[a * w.relSize + b] || 0;
    w.relations = nr; w.relSize = ns; issues.push('relations');
  }
  return issues;
}

// ───────── IndexedDB ─────────
let dbp: Promise<IDBPDatabase> | null = null;
function db() {
  dbp ??= openDB('world-dominion', 1, {
    upgrade(d) { d.createObjectStore('saves', { keyPath: 'id' }); },
  });
  return dbp;
}

export function metaOf(w: WorldState, id: string, name: string, auto = false): SaveMeta {
  return {
    id, name, savedAt: Date.now(), gameDate: fmtDate(w.startYear, w.day), version: SAVE_VERSION,
    player: w.player >= 0 ? w.countries[w.player]?.name ?? '' : w.mode === 'god' ? '신 모드' : '관찰자',
    countries: w.countries.filter(c => c.alive).length, auto,
  };
}

export async function saveToDB(w: WorldState, id: string, name: string, auto = false): Promise<SaveMeta> {
  const meta = metaOf(w, id, name, auto);
  const rec: SaveRecord = { ...meta, data: serializeWorld(w) };
  await (await db()).put('saves', rec);
  return meta;
}

/** 자동 저장: 3개 슬롯 순환 (백업) */
let autoIdx = 0;
export async function autoSave(w: WorldState) {
  autoIdx = (autoIdx % 3) + 1;
  return saveToDB(w, `autosave-${autoIdx}`, `자동 저장 ${autoIdx}`, true);
}

export async function listSaves(): Promise<SaveMeta[]> {
  const all = (await (await db()).getAll('saves')) as SaveRecord[];
  return all.map(({ data, ...m }) => { void data; return m; }).sort((a, b) => b.savedAt - a.savedAt);
}
export async function deleteSave(id: string) { await (await db()).delete('saves', id); }
export async function loadFromDB(id: string): Promise<WorldState> {
  const rec = (await (await db()).get('saves', id)) as SaveRecord | undefined;
  if (!rec) throw new Error('세이브를 찾을 수 없습니다');
  return deserializeWorld(rec.data);
}

export function exportJSON(w: WorldState, filename = 'world-dominion-save.json') {
  const blob = new Blob([serializeWorld(w)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

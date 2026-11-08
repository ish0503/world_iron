/** 결정적 난수 (mulberry32). 상태는 WorldState.rng 에 저장되어 세이브와 함께 유지된다. */
export function mulberry(seed: number) {
  let s = seed >>> 0;
  const fn = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return Object.assign(fn, { getState: () => s, setState: (v: number) => { s = v >>> 0; } });
}
export type Rng = ReturnType<typeof mulberry>;

/** 시뮬레이션 전역 RNG — 월드 로드시 상태 동기화 */
export const rng = mulberry(1);
export const rand = () => rng();
export const randInt = (a: number, b: number) => a + Math.floor(rng() * (b - a + 1));
export const chance = (p: number) => rng() < p;
export const pick = <T,>(arr: T[]): T => arr[Math.floor(rng() * arr.length)];
export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

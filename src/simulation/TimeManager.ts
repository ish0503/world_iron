export const SPEEDS = [0, 1, 2, 5, 10, 30];
export const SPEED_LABELS = ['일시정지', '1x', '2x', '5x', '10x', '30x'];

/** 실시간 → 게임 일수 누적. 배속 1x = 하루 1초 */
export class TimeManager {
  speedIndex = 0;
  private acc = 0;
  lastSpeed = 1;
  setSpeed(i: number) { if (i > 0) this.lastSpeed = i; this.speedIndex = Math.max(0, Math.min(SPEEDS.length - 1, i)); }
  togglePause() { this.setSpeed(this.speedIndex === 0 ? this.lastSpeed : 0); }
  get paused() { return this.speedIndex === 0; }
  /** 경과 실시간(초) 동안 진행할 일 수 */
  advance(dt: number): number {
    const sp = SPEEDS[this.speedIndex];
    if (!sp) { this.acc = 0; return 0; }
    this.acc += dt * sp;
    const days = Math.floor(this.acc);
    this.acc -= days;
    return Math.min(days, 6); // 프레임당 최대 6일 (렉 방지)
  }
}

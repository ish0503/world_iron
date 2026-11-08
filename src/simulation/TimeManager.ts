export const SPEEDS = [0, 1, 2, 5, 10, 30, 100, 365];
export const SPEED_LABELS = ['일시정지', '1x', '2x', '5x', '10x', '30x', '100x', 'MAX'];

/**
 * 실시간 → 게임 일수 누적. 배속 1x = 하루 1초.
 * 고배속에서는 프레임당 계산 시간 예산 안에서만 진행 (밀린 시간은 버림)
 */
export class TimeManager {
  speedIndex = 0;
  private acc = 0;
  lastSpeed = 1;
  setSpeed(i: number) { if (i > 0) this.lastSpeed = i; this.speedIndex = Math.max(0, Math.min(SPEEDS.length - 1, i)); }
  togglePause() { this.setSpeed(this.speedIndex === 0 ? this.lastSpeed : 0); }
  get paused() { return this.speedIndex === 0; }
  get daysPerSec() { return SPEEDS[this.speedIndex]; }
  /** 이번 프레임에 진행하고 싶은 일 수 */
  want(dt: number): number {
    const sp = SPEEDS[this.speedIndex];
    if (!sp) { this.acc = 0; return 0; }
    this.acc = Math.min(this.acc + dt * sp, Math.max(2, sp * 0.25));
    return Math.floor(this.acc);
  }
  consume(days: number) { this.acc -= days; }
}

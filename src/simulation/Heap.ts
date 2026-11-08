/** 최소 힙 (값, 키) */
export class MinHeap {
  private v: number[] = []; private k: number[] = [];
  get size() { return this.v.length; }
  push(val: number, key: number) {
    const v = this.v, k = this.k; v.push(val); k.push(key);
    let i = v.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (k[p] <= k[i]) break; [v[p], v[i]] = [v[i], v[p]]; [k[p], k[i]] = [k[i], k[p]]; i = p; }
  }
  pop(): number {
    const v = this.v, k = this.k; const top = v[0];
    const lv = v.pop()!, lk = k.pop()!;
    if (v.length) {
      v[0] = lv; k[0] = lk; let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1; let m = i;
        if (l < v.length && k[l] < k[m]) m = l; if (r < v.length && k[r] < k[m]) m = r;
        if (m === i) break; [v[m], v[i]] = [v[i], v[m]]; [k[m], k[i]] = [k[i], k[m]]; i = m;
      }
    }
    return top;
  }
  peekKey() { return this.k[0]; }
}

/** UI 알림 버스 */
export interface Toast { id: number; text: string; type: string; c?: number; t: number; }
type Fn = (t: Toast) => void;
const subs = new Set<Fn>();
let nid = 1;
export function pushToast(text: string, type = 'info', c?: number) { const t = { id: nid++, text, type, c, t: Date.now() }; subs.forEach(f => f(t)); }
export function onToast(f: Fn) { subs.add(f); return () => { subs.delete(f); }; }

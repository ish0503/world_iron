import type { WorldState } from '../types/World';
import { deserializeWorld, loadFromDB } from './SaveSystem';

/** 파일(JSON) 가져오기 */
export function importJSONFile(file: File): Promise<WorldState> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error('파일을 읽을 수 없습니다'));
    fr.onload = () => { try { resolve(deserializeWorld(String(fr.result))); } catch (e) { reject(e); } };
    fr.readAsText(file);
  });
}
export { loadFromDB };

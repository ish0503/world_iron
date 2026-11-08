// docs/index.html 을 저장소 루트 index.html 로 복사 (자산 경로를 ./docs/ 로 보정)
import { readFileSync, writeFileSync } from 'node:fs';
const html = readFileSync('docs/index.html', 'utf8').replaceAll('"./assets/', '"./docs/assets/');
writeFileSync('index.html', html);
writeFileSync('docs/.nojekyll', '');
writeFileSync('.nojekyll', '');
console.log('root index.html updated');

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 소스 HTML은 app/, 빌드 결과는 docs/ 에 생성되어 저장소에 커밋된다.
// GitHub Pages 를 "Deploy from a branch"(main / root 또는 /docs) 로 설정해도,
// "GitHub Actions" 로 설정해도 동작한다. 상대 경로(base './') 사용.
export default defineConfig({
  root: 'app',
  plugins: [react()],
  base: './',
  build: {
    outDir: '../docs',
    emptyOutDir: true,
    chunkSizeWarningLimit: 2000,
  },
  worker: { format: 'es' },
})

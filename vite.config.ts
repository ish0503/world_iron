import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages: 저장소 이름과 무관하게 동작하도록 상대 경로 사용
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    chunkSizeWarningLimit: 2000,
  },
  worker: {
    format: 'es',
  },
})

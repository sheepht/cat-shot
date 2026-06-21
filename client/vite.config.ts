import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command }) => ({
  // GitHub Pages 專案頁是 username.github.io/cat-shot/ 子路徑，build 要設 base；
  // dev 維持根路徑。若 repo 名稱不是 cat-shot，改這裡即可。
  base: command === 'build' ? '/cat-shot/' : '/',
  plugins: [react()],
  server: {
    host: true, // 讓同網段手機也能連 dev server
    port: 5173,
    allowedHosts: ['.trycloudflare.com'], // 允許 Cloudflare Quick Tunnel 的網域
    proxy: {
      // 前端打 /api 會被轉發到 Hono 後端
      '/api': 'http://localhost:3001',
    },
  },
}))

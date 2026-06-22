import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(() => ({
  // 部署在 custom domain cat-shot.sheepht.com 的根路徑，base 固定為 '/'。
  base: '/',
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

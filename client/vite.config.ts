import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api/chat/stream': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        xfwd: true,
        // SSE 专用配置：超长超时 + 关闭缓冲
        timeout: 300000, // 5 分钟
        proxyTimeout: 300000,
        configure: (proxy) => {
          proxy.on('proxyReq', (_proxyReq, _req, res) => {
            // 禁用 Node.js 响应缓冲，让 SSE chunk 立即到达前端
            (res as any).flushHeaders?.()
          })
        },
      },
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        xfwd: true,
      },
      '/uploads': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        xfwd: true,
      },
      '/share-assets': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        xfwd: true,
      },
    },
  },
})

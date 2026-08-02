import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// 生产构建为纯静态产物，直连 API（API 返回 Access-Control-Allow-Origin: *）。
// 开发期通过 proxy 转发 /api，便于本地预览；生产环境使用可配置的 API Base。
export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'https://so.252035.xyz',
        changeOrigin: true,
        secure: true,
      },
    },
  },
  build: {
    target: 'es2019',
    outDir: 'dist',
    chunkSizeWarningLimit: 1500,
  },
})

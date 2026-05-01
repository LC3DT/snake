import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 8080,
    // 开发环境下将 /api/ 请求代理到后端
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});

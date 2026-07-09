import { defineConfig } from 'vite';

// base: './' 使构建产物同时兼容本地预览与 GitHub Pages 子路径部署
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
  },
});

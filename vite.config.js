import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  // PMX / VMD をバイナリアセットとして扱う
  // 流用元: D:\AI3DViewMMD\vite.config.js の assetsInclude 設定
  assetsInclude: ['**/*.pmx', '**/*.vmd', '**/*.bmp', '**/*.spa', '**/*.sph'],
  server: {
    // スマホ実機確認用 (npm run dev -- --host でも可)
    host: true,
  },
  build: {
    rollupOptions: {
      // マルチページアプリ: トップ画面 + 閲覧専用ページ
      input: {
        main:      resolve(__dirname, 'index.html'),
        card:      resolve(__dirname, 'card/index.html'),
        dashboard: resolve(__dirname, 'dashboard/index.html'),
      },
    },
  },
});

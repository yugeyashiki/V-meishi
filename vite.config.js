import { defineConfig } from 'vite';

export default defineConfig({
  // PMX / VMD をバイナリアセットとして扱う
  // 流用元: D:\AI3DViewMMD\vite.config.js の assetsInclude 設定
  assetsInclude: ['**/*.pmx', '**/*.vmd', '**/*.bmp', '**/*.spa', '**/*.sph'],
  server: {
    // スマホ実機確認用 (npm run dev -- --host でも可)
    host: true,
  },
});

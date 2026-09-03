import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vite';

// PWA: アプリ全体が静的なので、プリキャッシュだけで完全オフライン動作になる。
// iPhone/iPad中心の利用想定(CLAUDE.md参照)。
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'かずのフロンティア',
        short_name: 'かずフロ',
        description: '数列を「暗算で伸ばす→暗記で即答する」で身につけるバトルゲーム',
        lang: 'ja',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#1b1035',
        theme_color: '#1b1035',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' }],
      },
    }),
  ],
});

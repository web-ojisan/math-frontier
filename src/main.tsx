import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import './app.css';

// PWA: オフラインでも遊べるようService Workerを登録する(失敗しても起動は続ける)
try {
  registerSW({ immediate: true });
} catch {
  // 開発環境や非対応ブラウザでは無視してよい
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// 試行ログの永続化。記録は端末ローカル(IndexedDB)でよい(CLAUDE.md参照)。
// 生のIndexedDB APIを最小限ラップしただけのもの(npm依存は増やさない)。
// あとで親向け週次ダイジェストに使えるよう、項目・答え・正誤・反応時間・時刻をすべて残す。

import type { Attempt } from './state-estimator';

const DB_NAME = 'math-frontier';
const STORE_NAME = 'attempts';
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'seq', autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** 全試行を古い順で読み込む(セッション開始時に1回だけ呼ぶ) */
export async function loadAttempts(): Promise<Attempt[]> {
  const db = await openDb();
  const attempts = await new Promise<Attempt[]>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result as Attempt[]);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return attempts;
}

/** 1試行を追記する */
export async function saveAttempt(attempt: Attempt): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).add(attempt);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

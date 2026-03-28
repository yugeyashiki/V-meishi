/**
 * core/exporter.js
 * JSON エクスポート / インポート / localStorage コレクション管理
 */

import { normalizeCard, validateCard } from '../data/schema.js';

const STORAGE_KEY    = 'v-meishi-collection';
const MAX_COLLECTION = 50;
const APP_VERSION    = '0.1.0';

// ============================================================
// エクスポート
// ============================================================

/**
 * cardState から JSON ファイルをダウンロードする
 * @param {object} state - getState() の返り値
 */
export function exportCard(state) {
  const payload = buildPayload(state);
  const json    = JSON.stringify(payload, null, 2);
  const blob    = new Blob([json], { type: 'application/json' });
  const url     = URL.createObjectURL(blob);
  const a       = document.createElement('a');
  a.href        = url;
  a.download    = `${sanitizeFilename(state.profile.name || 'v-meishi')}_card.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function buildPayload(state) {
  return {
    version: '1.0',
    profile: {
      name:         state.profile.name         ?? '',
      catchphrase:  state.profile.catchphrase  ?? '',
      genre:        state.profile.genre        ?? '',
      organization: state.profile.organization ?? '',
      links: (state.links ?? []).map(({ platform, url, label }) => ({ platform, url, label })),
    },
    theme: { ...state.theme },
    avatar: {
      modelFileName:  state.avatar?.modelFileName  ?? '',
      motionFileName: state.avatar?.motionFileName ?? '',
      pose: { ...state.avatar?.pose },
    },
    meta: {
      id:         generateId(),
      createdAt:  new Date().toISOString(),
      appVersion: APP_VERSION,
    },
  };
}

// ============================================================
// インポート
// ============================================================

/**
 * JSON 文字列をパース・正規化して返す
 * @param {string} jsonString
 * @returns {{ card: object|null, errors: string[] }}
 */
export function importCard(jsonString) {
  let raw;
  try {
    raw = JSON.parse(jsonString);
  } catch {
    return { card: null, errors: ['JSON の形式が正しくありません'] };
  }

  let card;
  try {
    card = normalizeCard(raw);
  } catch (e) {
    return { card: null, errors: [e.message] };
  }

  const { valid, errors } = validateCard(card);
  if (!valid) return { card: null, errors };

  return { card, errors: [] };
}

// ============================================================
// localStorage コレクション
// ============================================================

/**
 * コレクション全件を取得する
 * @returns {object[]}
 */
export function loadCollection() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

/**
 * カードをコレクションに保存する（既存 ID は上書き）
 * @param {object} card - normalizeCard の出力
 * @returns {{ success: boolean, message: string }}
 */
export function saveToCollection(card) {
  const collection = loadCollection();

  const idx = collection.findIndex((c) => c.meta?.id === card.meta?.id);
  if (idx >= 0) {
    collection[idx] = card;
  } else {
    if (collection.length >= MAX_COLLECTION) {
      return { success: false, message: `コレクションは最大${MAX_COLLECTION}件です` };
    }
    collection.unshift(card);
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(collection));
    return { success: true, message: '保存しました' };
  } catch {
    return { success: false, message: '保存に失敗しました（容量不足の可能性があります）' };
  }
}

/**
 * コレクションからカードを削除する
 * @param {string} id
 */
export function removeFromCollection(id) {
  const collection = loadCollection().filter((c) => c.meta?.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(collection));
}

// ============================================================
// ヘルパー
// ============================================================

function sanitizeFilename(str) {
  return str.replace(/[\\/:*?"<>|]/g, '_').slice(0, 50) || 'v-meishi';
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

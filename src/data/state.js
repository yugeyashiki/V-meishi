/**
 * data/state.js
 * cardState（中央状態オブジェクト）と pub/sub ユーティリティ
 *
 * 設計書 section 4 の CardState をここで一元管理する。
 * ProfileForm / SnsLinks / ThemeSelector / AvatarViewer は
 * updateState() で書き込み、CardLayout は subscribe() で変化を受け取る。
 */

// ============================================================
// cardState 初期値
// ============================================================
const cardState = {
  profile: {
    name: '',
    catchphrase: '',
    genre: '',
    organization: '',
  },
  links: [],          // { platform, url, label }[]  最大 5 件
  theme: {
    preset: 'dark',
    bgType: 'solid',  // 'solid' | 'gradient' | 'image'
    bgColor: '#0D0D0D',
    bgGradient: ['#1a1a2e', '#16213e'],
    bgImage: null,
    textColor: '#FFFFFF',
    accentColor: '#9B59B6',
  },
  avatar: {
    modelFileName: '',
    motionFileName: '',
    pose: { rotationX: 0, rotationY: 0, zoom: 1.0 },
  },
};

// ============================================================
// pub/sub
// ============================================================
const listeners = new Set();

/**
 * 現在の cardState を返す（読み取り専用）
 * @returns {typeof cardState}
 */
export function getState() {
  return cardState;
}

/**
 * cardState を部分更新し、全リスナーに通知する
 * ネストしたオブジェクトはディープマージ、配列は上書き
 * @param {Partial<typeof cardState>} partial
 */
export function updateState(partial) {
  deepMerge(cardState, partial);
  listeners.forEach((fn) => fn(cardState));
}

/**
 * 状態変化のリスナーを登録する
 * @param {(state: typeof cardState) => void} fn
 * @returns {() => void} 登録解除関数
 */
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// ============================================================
// 内部ユーティリティ
// ============================================================

function deepMerge(target, source) {
  for (const key of Object.keys(source)) {
    const val = source[key];
    if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
      if (target[key] === null || typeof target[key] !== 'object') target[key] = {};
      deepMerge(target[key], val);
    } else {
      target[key] = val;
    }
  }
}

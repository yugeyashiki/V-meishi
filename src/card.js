/**
 * src/card.js
 * 閲覧専用ページ（card/index.html）のエントリーポイント
 *
 * URL: /card/?id={UUID}
 *
 * フロー:
 *   1. URL から UUID を取得
 *   2. AvatarViewer 初期化
 *   3. Supabase から名刺メタデータ・暗号化鍵を取得
 *   4. Storage から暗号化モデルをダウンロード
 *   5. AES-GCM 復号
 *   6. VMB1 → SkinnedMesh デコード → シーンに表示
 *   7. テーマ・プロフィール・SNSリンクを描画
 */

import { loadCard, downloadModel, incrementViewCount } from './core/supabase.js';
import { importKeyFromBase64, decrypt }                from './core/crypto.js';
import { init as initAvatarViewer, loadFromVMB, loadVrmFile, setPose, getMesh } from './components/AvatarViewer.js';

// SNS プラットフォームアイコン（CardLayout.js と同じ定義）
const PLATFORM_ICONS = {
  X:         '𝕏',
  YouTube:   '▶',
  TikTok:    '♪',
  Twitch:    '🎮',
  Instagram: '📷',
  other:     '🔗',
};

// ============================================================
// メイン処理
// ============================================================

async function main() {
  const uuid = new URLSearchParams(window.location.search).get('id');
  if (!uuid) {
    showError('URLにIDが指定されていません', 'URLパラメータ ?id=UUID を確認してください');
    return;
  }

  try {
    // ① AvatarViewer 初期化（Ammo.js は CDN スクリプトで先行ロード済み）
    const canvas = document.getElementById('avatar-canvas');
    await initAvatarViewer(canvas);

    // ② 名刺メタデータを取得
    setStatus('名刺情報を取得中...');
    const card = await loadCard(uuid);

    // 非公開チェック
    if (card.is_public === false) {
      showError('この名刺は現在非公開です。', 'オーナーがこの名刺を非公開に設定しています');
      return;
    }

    // ページタイトルを名前に更新
    if (card.name) document.title = `${card.name} - V名刺`;

    // ③ テーマ・プロフィール・リンクを即時描画
    applyTheme(card.theme);
    applyProfile(card);
    renderLinks(card.links ?? []);

    // ④ 暗号化モデルをダウンロード
    setStatus('モデルをダウンロード中...');
    const encBuf = await downloadModel(card.model_storage_path);

    // ⑤ 復号（VRM・MMD 共通の AES-GCM 復号）
    setStatus('復号中...');
    const key       = await importKeyFromBase64(card.encryption_key);
    const decrypted = await decrypt(key, encBuf);

    // ⑥ モデル種別を解決（DB の model_type 優先、未設定時はマジックバイトで判定）
    const modelType = resolveModelType(card.model_type, decrypted);
    console.log('[Card] model_type:', modelType);

    if (modelType === 'vrm') {
      // VRM: 復号済みバイナリをそのまま GLTF として読み込む
      console.log('[VRM Decoder] 復号完了:', decrypted.byteLength, 'bytes');
      setStatus('3Dモデルを展開中...');
      const blobUrl = URL.createObjectURL(
        new Blob([decrypted], { type: 'model/gltf-binary' }),
      );
      await loadVrmFile(blobUrl);
      URL.revokeObjectURL(blobUrl);
      console.log('[VRM] 閲覧URL表示完了');

    } else {
      // MMD: 復号済みバイナリを VMB1 としてデコード
      await loadFromVMB(decrypted, (p) => setStatus(`3Dモデルを展開中... ${p}%`));
    }

    // ⑦ 保存済みポーズを復元
    if (card.pose && Object.keys(card.pose).length > 0) {
      setPose(card.pose);
    }

    // デバッグ: コンソールから window.__testDecoder() でマテリアルを確認可能
    window.__testDecoder = () => {
      const mesh = getMesh();
      if (!mesh) { console.log('[Test] メッシュ未ロード'); return; }
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      console.log(`[Test] マテリアル数: ${mats.length}`);
      mats.forEach((m, i) => {
        console.log(
          `  mat[${i}] transparent=${m.transparent} alphaTest=${m.alphaTest}` +
          ` depthWrite=${m.depthWrite} map=${!!m.map} side=${m.side}` +
          ` (${m.name ?? ''})`,
        );
      });
    };

    // 閲覧数カウント（fire-and-forget）
    incrementViewCount(uuid);

    // ローディング非表示 → カード表示
    document.getElementById('card-loading').classList.add('hidden');
    document.getElementById('card-viewer').classList.remove('hidden');

  } catch (e) {
    console.error('[Card] 読み込み失敗:', e);
    showError(
      e.message ?? '読み込みに失敗しました',
      '時間をおいてもう一度お試しください',
    );
  }
}

// ============================================================
// UI ヘルパー
// ============================================================

function setStatus(msg) {
  const el = document.getElementById('card-loading-msg');
  if (el) el.textContent = msg;
}

function showError(msg, sub = '') {
  document.getElementById('card-loading').classList.add('hidden');
  const errEl = document.getElementById('card-error');
  errEl.querySelector('.card-error__msg').textContent = msg;
  const subEl = errEl.querySelector('.card-overlay__sub');
  if (subEl) subEl.textContent = sub;
  errEl.classList.remove('hidden');
}

// ============================================================
// テーマ適用（CardLayout.js の renderTheme に相当）
// ============================================================

function applyTheme(theme) {
  if (!theme) return;
  const root = document.documentElement;
  root.style.setProperty('--text-color',   theme.textColor   ?? '#ffffff');
  root.style.setProperty('--accent-color', theme.accentColor ?? '#9B59B6');

  const card = document.getElementById('card-layout');
  if (!card) return;

  if (theme.bgType === 'gradient' && Array.isArray(theme.bgGradient)) {
    const [from, to] = theme.bgGradient;
    card.style.background = `linear-gradient(135deg, ${from}, ${to})`;
  } else if (theme.bgType === 'image' && theme.bgImage) {
    card.style.backgroundImage    = `url(${theme.bgImage})`;
    card.style.backgroundSize     = 'cover';
    card.style.backgroundPosition = 'center';
  } else {
    card.style.background = theme.bgColor ?? '#0D0D0D';
  }
}

// ============================================================
// プロフィール描画
// ============================================================

function applyProfile(card) {
  setText('card-name',         card.name         ?? '');
  setText('card-catchphrase',  card.catchphrase  ?? '');
  setOptional('card-organization', card.organization);
  setOptional('card-genre',        card.genre);
}

// ============================================================
// SNS リンク描画（CardLayout.js の linkItemHTML に相当）
// ============================================================

function renderLinks(links) {
  const el = document.getElementById('card-links');
  if (!el) return;
  el.innerHTML = links.map(({ platform, url, label }) => {
    const icon = PLATFORM_ICONS[platform] ?? PLATFORM_ICONS.other;
    const text = escapeHtml(label || url || '');
    return `
      <div class="card-link-item">
        <span class="sns-icon-box" aria-hidden="true">${icon}</span>
        <span class="sns-link-text" title="${escapeHtml(url ?? '')}">${text}</span>
      </div>
    `;
  }).join('');
}

// ============================================================
// ユーティリティ
// ============================================================

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function setOptional(id, text) {
  const el = document.getElementById(id);
  if (!el) return;
  if (text) {
    el.textContent = text;
    el.classList.remove('hidden');
  } else {
    el.textContent = '';
    el.classList.add('hidden');
  }
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]),
  );
}

/**
 * モデル種別を解決する
 * DB の model_type を優先し、未設定（SQL 未実行）の場合は
 * 復号済みデータの先頭マジックバイトで VRM（GLB）を検出する。
 *
 * @param {string|null} declaredType - card.model_type（'vrm' | 'mmd' | null）
 * @param {ArrayBuffer} decryptedBuffer
 * @returns {'vrm'|'mmd'}
 */
function resolveModelType(declaredType, decryptedBuffer) {
  if (declaredType === 'vrm' || declaredType === 'mmd') return declaredType;

  // model_type カラム未設定の場合: GLB マジックバイト "glTF" (0x67 0x6C 0x54 0x46) で判定
  const b = new Uint8Array(decryptedBuffer, 0, 4);
  if (b[0] === 0x67 && b[1] === 0x6C && b[2] === 0x54 && b[3] === 0x46) {
    console.log('[Card] model_type未設定 → マジックバイト "glTF" を検出 → VRM として処理');
    return 'vrm';
  }
  return 'mmd';
}

// ============================================================
// 起動
// ============================================================
main();

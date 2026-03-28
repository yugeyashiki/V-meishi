/**
 * components/QRCodePanel.js
 * 名刺データを QR コードに変換して表示するパネル
 *
 * 仕様:
 *   - QR に含めるデータ: profile（名前・キャッチコピー・ジャンル・SNSリンク）
 *   - モデルファイル本体は含めない（仕様書 section 5 準拠）
 *   - プレビューモードに入るたびに最新の cardState から再生成
 *   - QR 画像のダウンロードボタンを併設
 */

import { getState, subscribe } from '../data/state.js';
import { renderToCanvas, toDataURL } from '../utils/qrcode.js';

// ============================================================
// 公開 API
// ============================================================

/**
 * @param {HTMLElement} container - #qr-panel-section
 */
export function init(container) {
  container.innerHTML = buildHTML();
  bindEvents(container);

  // 状態変化で QR を再生成（プレビューモード表示中のみ更新）
  subscribe(() => {
    if (!document.getElementById('preview-mode')?.classList.contains('hidden')) {
      generateQR(container);
    }
  });
}

/**
 * プレビューモードへ切り替えたときに呼ぶ（CardLayout から呼び出し可能）
 * main.js 経由でも OK
 */
export function refresh(container) {
  generateQR(container);
}

// ============================================================
// HTML 生成
// ============================================================

function buildHTML() {
  return `
    <div class="qr-panel">
      <h2 class="qr-panel__title">QR コード</h2>
      <p class="qr-panel__desc">このQRコードで名刺情報を共有できます</p>

      <div class="qr-canvas-wrap">
        <canvas id="qr-canvas" class="qr-canvas"></canvas>
        <div class="qr-loading hidden" id="qr-loading">生成中...</div>
        <div class="qr-empty" id="qr-empty">
          プロフィールを入力すると<br>QRコードが表示されます
        </div>
      </div>

      <div class="qr-actions">
        <button type="button" id="btn-download-qr" class="btn-primary" disabled>
          ⬇ QR 画像をダウンロード
        </button>
      </div>

      <details class="qr-data-detail">
        <summary class="qr-data-summary">QRに含まれるデータを確認</summary>
        <pre id="qr-data-preview" class="qr-data-pre"></pre>
      </details>
    </div>
  `;
}

// ============================================================
// QR 生成
// ============================================================

async function generateQR(container) {
  const state = getState();
  const payload = buildPayload(state);

  // プロフィールが未入力なら空表示
  if (!payload.profile.name && payload.profile.links.length === 0) {
    showEmpty(container);
    return;
  }

  const text = JSON.stringify(payload);
  const canvas = container.querySelector('#qr-canvas');
  const downloadBtn = container.querySelector('#btn-download-qr');

  showLoading(container, true);

  try {
    await renderToCanvas(canvas, text, { size: 200 });

    // ダウンロード用の高解像度 DataURL を生成
    const dataUrl = await toDataURL(text, { size: 400 });
    downloadBtn.disabled = false;
    downloadBtn.onclick = () => downloadQR(dataUrl, state.profile.name || 'v-meishi');

    // データプレビュー更新
    const preview = container.querySelector('#qr-data-preview');
    if (preview) preview.textContent = JSON.stringify(payload, null, 2);

    showEmpty(container, false);
  } catch (err) {
    console.error('[QRCodePanel] 生成エラー:', err);
  } finally {
    showLoading(container, false);
  }
}

// ============================================================
// QR に含めるデータ構築（仕様書 section 5 準拠）
// ============================================================

function buildPayload(state) {
  return {
    version: '1.0',
    profile: {
      name:        state.profile.name,
      catchphrase: state.profile.catchphrase,
      genre:       state.profile.genre,
      links:       state.links.map(({ platform, url, label }) => ({ platform, url, label })),
    },
    avatar: {
      modelFileName:  state.avatar.modelFileName,
      motionFileName: state.avatar.motionFileName,
      defaultPose:    { ...state.avatar.pose },
    },
    meta: {
      createdAt:  new Date().toISOString(),
      appVersion: '0.1.0',
    },
  };
}

// ============================================================
// ダウンロード
// ============================================================

function downloadQR(dataUrl, name) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = `${sanitizeFilename(name)}_qr.png`;
  a.click();
}

function sanitizeFilename(str) {
  return str.replace(/[\\/:*?"<>|]/g, '_').slice(0, 50) || 'v-meishi';
}

// ============================================================
// イベント
// ============================================================

function bindEvents(container) {
  // 初回はプレビューモードに切り替えた際に refresh() が呼ばれる想定だが
  // subscribe でも生成するため、パネルが既に表示中なら即時生成
  generateQR(container);
}

// ============================================================
// UI ヘルパー
// ============================================================

function showLoading(container, visible) {
  container.querySelector('#qr-loading')?.classList.toggle('hidden', !visible);
}

function showEmpty(container, visible = true) {
  container.querySelector('#qr-empty')?.classList.toggle('hidden', !visible);
  container.querySelector('#qr-canvas')?.classList.toggle('hidden', visible);
  if (visible) {
    const btn = container.querySelector('#btn-download-qr');
    if (btn) btn.disabled = true;
  }
}

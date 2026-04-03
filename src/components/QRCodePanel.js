/**
 * components/QRCodePanel.js
 * プレビュー画面の QR コードパネル
 *
 * ## 2 つの QR セクション
 *
 * ① Web 共有 QR（フェーズ3-A）
 *    「Webにアップロードして共有」ボタン → エンコード→暗号化→Supabase アップロード
 *    → UUID付き閲覧URL を QR コード化。3D モデルを含む完全な名刺を共有できる。
 *
 * ② プロフィール情報 QR（既存・フェーズ2）
 *    名前・SNSリンクなどを JSON 化した軽量 QR。モデルは含まない。
 *    プレビューに入るたびに最新 cardState から自動再生成。
 */

import { getState, subscribe } from '../data/state.js';
import { renderToCanvas, toDataURL } from '../utils/qrcode.js';
import { MAX_FILE_SIZE_BYTES, MAX_FILE_SIZE_MB } from '../config.js';

// ============================================================
// 公開 API
// ============================================================

/** @param {HTMLElement} container - #qr-panel-section */
export function init(container) {
  container.innerHTML = buildHTML();
  bindShareButton(container);
  bindEvents(container);

  // カード状態変化でプロフィール QR を再生成（プレビュー表示中のみ）
  subscribe(() => {
    if (!document.getElementById('preview-mode')?.classList.contains('hidden')) {
      generateProfileQR(container);
    }
  });
}

/** プレビューモードへ切り替えたときに呼ぶ */
export function refresh(container) {
  generateProfileQR(container);
}

// ============================================================
// HTML 生成
// ============================================================

function buildHTML() {
  return `
    <div class="qr-panel">

      <!-- ① Web 共有セクション -->
      <div class="qr-section qr-section--web">
        <h2 class="qr-section__title">🌐 Web で共有</h2>
        <p class="qr-section__desc">3D モデルを含む名刺を URL で共有します</p>

        <!-- アップロード前 -->
        <div id="qr-share-idle" class="qr-share-idle">
          <button type="button" id="btn-web-share" class="btn-primary qr-share-btn">
            ↑ アップロードして QR を生成
          </button>
        </div>

        <!-- アップロード中 -->
        <div id="qr-share-uploading" class="qr-share-uploading hidden">
          <div class="qr-share-spinner"></div>
          <p id="qr-share-status" class="qr-share-status">準備中...</p>
        </div>

        <!-- アップロード完了 -->
        <div id="qr-share-done" class="qr-share-done hidden">
          <div class="qr-canvas-wrap">
            <canvas id="qr-share-canvas" class="qr-canvas"></canvas>
          </div>
          <p id="qr-share-url" class="qr-share-url"></p>
          <div class="qr-share-actions">
            <button type="button" id="btn-copy-url"           class="btn-secondary">🔗 URL をコピー</button>
            <button type="button" id="btn-download-share-qr"  class="btn-primary">⬇ QR をダウンロード</button>
          </div>
          <button type="button" id="btn-reupload" class="qr-reupload-btn">
            再アップロード（別 URL を生成）
          </button>
        </div>

        <!-- エラー -->
        <div id="qr-share-error" class="qr-share-error hidden">
          <p id="qr-share-error-msg" class="qr-share-error__msg"></p>
          <button type="button" id="btn-retry-share" class="btn-secondary">再試行</button>
        </div>
      </div>

      <hr class="qr-divider">

      <!-- ② プロフィール情報 QR（既存 / ローカル） -->
      <div class="qr-section qr-section--local">
        <h2 class="qr-section__title">📋 プロフィール情報 QR</h2>
        <p class="qr-section__desc">名前・SNS リンクのみ（3D モデルは含みません）</p>

        <div class="qr-canvas-wrap">
          <canvas id="qr-canvas" class="qr-canvas"></canvas>
          <div class="qr-loading hidden" id="qr-loading">生成中...</div>
          <div class="qr-empty" id="qr-empty">
            プロフィールを入力すると<br>QR コードが表示されます
          </div>
        </div>

        <div class="qr-actions">
          <button type="button" id="btn-download-qr" class="btn-primary" disabled>
            ⬇ QR 画像をダウンロード
          </button>
        </div>

        <details class="qr-data-detail">
          <summary class="qr-data-summary">QR に含まれるデータを確認</summary>
          <pre id="qr-data-preview" class="qr-data-pre"></pre>
        </details>
      </div>

    </div>
  `;
}

// ============================================================
// ① Web 共有: アップロードフロー
// ============================================================

function bindShareButton(container) {
  container.addEventListener('click', (e) => {
    if (e.target.id === 'btn-web-share' || e.target.id === 'btn-retry-share') {
      runUploadFlow(container);
    }
    if (e.target.id === 'btn-reupload') {
      showShareIdle(container);
      runUploadFlow(container);
    }
  });
}

async function runUploadFlow(container) {
  // 動的インポートでバンドルサイズを最小化
  const [
    { getMesh },
    { encodeMesh },
    { generateKey, exportKeyToBase64, encrypt },
    { uploadModel, saveCard },
  ] = await Promise.all([
    import('./AvatarViewer.js'),
    import('../core/encoder.js'),
    import('../core/crypto.js'),
    import('../core/supabase.js'),
  ]);

  const mesh = getMesh();
  if (!mesh) {
    showShareError(container, 'モデルが読み込まれていません。先にモデルをアップロードしてください。');
    return;
  }

  showShareUploading(container);

  try {
    setShareStatus(container, 'エンコード中...');
    const vmb1Buf = await encodeMesh(mesh);

    setShareStatus(container, '暗号化中...');
    const key       = await generateKey();
    const keyBase64 = await exportKeyToBase64(key);
    const encBuf    = await encrypt(key, vmb1Buf);

    const fileMB = encBuf.byteLength / 1024 / 1024;
    console.log(`[DataPolicy] ファイルサイズ: ${fileMB.toFixed(1)} MB / 上限 ${MAX_FILE_SIZE_MB} MB → ${encBuf.byteLength > MAX_FILE_SIZE_BYTES ? 'NG' : 'OK'}`);
    if (encBuf.byteLength > MAX_FILE_SIZE_BYTES) {
      throw new Error(
        `モデルデータが上限サイズ（${MAX_FILE_SIZE_MB}MB）を超えています。\nテクスチャ解像度を下げるか、別のモデルをお試しください。`
      );
    }

    setShareStatus(container, 'アップロード中...');
    const uuid         = crypto.randomUUID();
    const storagePath  = await uploadModel(encBuf, uuid);
    await saveCard({ uuid, state: getState(), keyBase64, modelStoragePath: storagePath });

    const url = `${window.location.origin}/card/?id=${uuid}`;
    setShareStatus(container, 'QR コードを生成中...');
    await showShareDone(container, url);

  } catch (err) {
    console.error('[QRCodePanel] Web 共有エラー:', err);
    showShareError(container, err.message ?? 'アップロードに失敗しました');
  }
}

// ① 各状態への切り替え

function showShareIdle(container) {
  container.querySelector('#qr-share-idle')?.classList.remove('hidden');
  container.querySelector('#qr-share-uploading')?.classList.add('hidden');
  container.querySelector('#qr-share-done')?.classList.add('hidden');
  container.querySelector('#qr-share-error')?.classList.add('hidden');
}

function showShareUploading(container) {
  container.querySelector('#qr-share-idle')?.classList.add('hidden');
  container.querySelector('#qr-share-uploading')?.classList.remove('hidden');
  container.querySelector('#qr-share-done')?.classList.add('hidden');
  container.querySelector('#qr-share-error')?.classList.add('hidden');
}

function setShareStatus(container, msg) {
  const el = container.querySelector('#qr-share-status');
  if (el) el.textContent = msg;
}

async function showShareDone(container, url) {
  // QR 描画
  const canvas = container.querySelector('#qr-share-canvas');
  await renderToCanvas(canvas, url, { size: 200 });

  // URL テキスト表示
  const urlEl = container.querySelector('#qr-share-url');
  if (urlEl) urlEl.textContent = url;

  // ダウンロードボタン
  const dlBtn = container.querySelector('#btn-download-share-qr');
  if (dlBtn) {
    const dataUrl = await toDataURL(url, { size: 400 });
    const name = getState().profile.name || 'v-meishi';
    dlBtn.onclick = () => {
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `${sanitizeFilename(name)}_web_qr.png`;
      a.click();
    };
  }

  // URL コピーボタン
  const copyBtn = container.querySelector('#btn-copy-url');
  if (copyBtn) {
    copyBtn.onclick = async () => {
      await navigator.clipboard.writeText(url);
      const orig = copyBtn.textContent;
      copyBtn.textContent = '✅ コピーしました';
      setTimeout(() => { copyBtn.textContent = orig; }, 2000);
    };
  }

  container.querySelector('#qr-share-uploading')?.classList.add('hidden');
  container.querySelector('#qr-share-done')?.classList.remove('hidden');
}

function showShareError(container, msg) {
  container.querySelector('#qr-share-uploading')?.classList.add('hidden');
  container.querySelector('#qr-share-idle')?.classList.add('hidden');
  const errEl = container.querySelector('#qr-share-error');
  if (errEl) {
    errEl.querySelector('#qr-share-error-msg').textContent = msg;
    errEl.classList.remove('hidden');
  }
}

// ============================================================
// ② プロフィール QR 生成（既存ロジックをそのまま維持）
// ============================================================

async function generateProfileQR(container) {
  const state   = getState();
  const payload = buildPayload(state);

  if (!payload.profile.name && payload.profile.links.length === 0) {
    showEmpty(container);
    return;
  }

  const text      = JSON.stringify(payload);
  const canvas    = container.querySelector('#qr-canvas');
  const downloadBtn = container.querySelector('#btn-download-qr');

  showLoading(container, true);

  try {
    await renderToCanvas(canvas, text, { size: 200 });

    const dataUrl = await toDataURL(text, { size: 400 });
    downloadBtn.disabled = false;
    downloadBtn.onclick  = () => downloadQR(dataUrl, state.profile.name || 'v-meishi');

    const preview = container.querySelector('#qr-data-preview');
    if (preview) preview.textContent = JSON.stringify(payload, null, 2);

    showEmpty(container, false);
  } catch (err) {
    console.error('[QRCodePanel] プロフィール QR 生成エラー:', err);
  } finally {
    showLoading(container, false);
  }
}

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
      appVersion: '0.4.0',
    },
  };
}

function downloadQR(dataUrl, name) {
  const a = document.createElement('a');
  a.href     = dataUrl;
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
  generateProfileQR(container);
}

// ============================================================
// UI ヘルパー（プロフィール QR 用）
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

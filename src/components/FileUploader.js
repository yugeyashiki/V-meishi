/**
 * components/FileUploader.js
 * PMX / VMD ファイルのローカル読み込み UI
 *
 * 方針A: webkitdirectory でフォルダごとアップロード
 *   - PMX と同フォルダのテクスチャを全て ObjectURL 化
 *   - AvatarViewer.loadModelFile(pmxUrl, textureUrlMap, onProgress) に渡す
 *   - ドラッグ&ドロップにも対応（DataTransfer API でフォルダを再帰収集）
 */

import * as AvatarViewer from './AvatarViewer.js';
import { getCurrentUser } from '../auth.js';
// NOTE: setVmdBuffer は AvatarViewer 経由で呼ぶ（* import済み）

// 物理演算トグルの現在値（Ammo.js 読み込み成否に依存するため init 後に取得）
let physicsEnabled = true;

// テクスチャとして扱う拡張子
const TEXTURE_EXTS = new Set([
  '.png', '.jpg', '.jpeg', '.bmp', '.tga',
  '.gif', '.tif', '.tiff', '.spa', '.sph',
]);

// ファイルサイズ警告の閾値
const PMX_SIZE_WARN = 50 * 1024 * 1024; // 50MB
const VMD_SIZE_WARN = 10 * 1024 * 1024; // 10MB

// 生成した ObjectURL を追跡（モデル切り替え時に解放）
let allocatedUrls = [];

function createObjectUrl(file) {
  const url = URL.createObjectURL(file);
  allocatedUrls.push(url);
  return url;
}

function revokeAll() {
  allocatedUrls.forEach((u) => URL.revokeObjectURL(u));
  allocatedUrls = [];
}

// ============================================================
// 公開 API
// ============================================================

/**
 * FileUploader を初期化して container に描画する
 * @param {HTMLElement} container - #file-uploader-section
 */
export function init(container) {
  container.innerHTML = buildHTML();
  bindEvents(container);
}

// ============================================================
// HTML 生成
// ============================================================

function buildHTML() {
  return `
    <div class="file-uploader">
      <h2 class="uploader-title">アバターを読み込む</h2>

      <!-- PMX：フォルダ選択 -->
      <div class="upload-zone" id="pmx-drop-zone">
        <div class="upload-zone__body">
          <span class="upload-zone__icon">📂</span>
          <p class="upload-zone__main" id="pmx-zone-label">
            モデルフォルダをドロップ<br>
            または <span class="upload-zone__link">クリックして選択</span>
          </p>
          <p class="upload-zone__sub">PMXファイルを含むフォルダをそのまま選択してください（テクスチャも自動で読み込みます）</p>
        </div>
        <input type="file" id="pmx-folder-input" webkitdirectory multiple class="upload-input">
      </div>
      <p id="pmx-status" class="upload-status"></p>

      <!-- VMD：単体ファイル選択（任意） -->
      <div class="upload-zone upload-zone--small" id="vmd-drop-zone">
        <div class="upload-zone__body">
          <span class="upload-zone__icon">🎬</span>
          <p class="upload-zone__main" id="vmd-zone-label">
            モーション（.vmd）をドロップ<br>
            または <span class="upload-zone__link">クリックして選択</span>
            <span class="upload-zone__badge">任意</span>
          </p>
        </div>
        <input type="file" id="vmd-file-input" accept=".vmd" class="upload-input">
      </div>
      <p id="vmd-status" class="upload-status"></p>

      <!-- プログレスバー（読み込み中のみ表示） -->
      <div id="load-progress" class="load-progress hidden">
        <div class="progress-bar">
          <div class="progress-bar__fill" id="progress-fill"></div>
        </div>
        <p id="progress-label" class="progress-label">読み込み中...</p>
      </div>

      <!-- 物理演算トグル（モデル読み込み後に表示） -->
      <div id="physics-toggle-row" class="physics-toggle-row hidden">
        <span class="physics-toggle-label">物理演算</span>
        <label class="toggle-switch">
          <input type="checkbox" id="physics-checkbox" checked>
          <span class="toggle-switch__track"></span>
        </label>
        <span class="physics-toggle-hint">OFFにすると動作が軽くなります</span>
      </div>
    </div>
  `;
}

// ============================================================
// イベント登録
// ============================================================

function bindEvents(container) {
  // --- 物理演算トグル ---
  container.querySelector('#physics-checkbox').addEventListener('change', (e) => {
    physicsEnabled = e.target.checked;
    AvatarViewer.setPhysics(physicsEnabled);
  });

  // --- PMX ゾーン ---
  const pmxZone  = container.querySelector('#pmx-drop-zone');
  const pmxInput = container.querySelector('#pmx-folder-input');

  pmxZone.addEventListener('click', () => pmxInput.click());
  pmxInput.addEventListener('change', () => {
    handlePmxFiles(Array.from(pmxInput.files), container);
  });

  pmxZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    pmxZone.classList.add('upload-zone--drag');
  });
  pmxZone.addEventListener('dragleave', () => {
    pmxZone.classList.remove('upload-zone--drag');
  });
  pmxZone.addEventListener('drop', async (e) => {
    e.preventDefault();
    pmxZone.classList.remove('upload-zone--drag');
    const files = await collectDropFiles(e.dataTransfer);
    handlePmxFiles(files, container);
  });

  // --- VMD ゾーン ---
  const vmdZone  = container.querySelector('#vmd-drop-zone');
  const vmdInput = container.querySelector('#vmd-file-input');

  vmdZone.addEventListener('click', () => vmdInput.click());
  vmdInput.addEventListener('change', () => {
    if (vmdInput.files[0]) handleVmdFile(vmdInput.files[0], container);
  });

  vmdZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    vmdZone.classList.add('upload-zone--drag');
  });
  vmdZone.addEventListener('dragleave', () => {
    vmdZone.classList.remove('upload-zone--drag');
  });
  vmdZone.addEventListener('drop', async (e) => {
    e.preventDefault();
    vmdZone.classList.remove('upload-zone--drag');
    const files = await collectDropFiles(e.dataTransfer);
    const vmd = files.find((f) => f.name.toLowerCase().endsWith('.vmd'));
    if (vmd) handleVmdFile(vmd, container);
  });
}

// ============================================================
// ドロップ時ファイル収集（フォルダを再帰的に展開）
// ============================================================

async function collectDropFiles(dataTransfer) {
  const files = [];
  if (dataTransfer.items) {
    const promises = [];
    for (const item of dataTransfer.items) {
      const entry = item.webkitGetAsEntry?.();
      if (entry) promises.push(traverseEntry(entry, files));
    }
    await Promise.all(promises);
  } else {
    files.push(...dataTransfer.files);
  }
  return files;
}

async function traverseEntry(entry, result) {
  if (entry.isFile) {
    const file = await new Promise((res, rej) => entry.file(res, rej));
    result.push(file);
  } else if (entry.isDirectory) {
    const reader = entry.createReader();
    let batch;
    // readEntries は最大 100 件ずつ返すため、空になるまでループ
    do {
      batch = await new Promise((res, rej) => reader.readEntries(res, rej));
      await Promise.all(batch.map((e) => traverseEntry(e, result)));
    } while (batch.length > 0);
  }
}

// ============================================================
// PMX 処理
// ============================================================

async function handlePmxFiles(files, container) {
  const statusEl = container.querySelector('#pmx-status');

  // ログインチェック
  const user = await getCurrentUser();
  if (!user) {
    alert('名刺を作成するにはログインが必要です。\n画面上部のGoogleログインボタンからログインしてください。');
    return;
  }
  console.log('[Auth] 作成者:', user.email ?? user.id);

  // PMX ファイルを探す
  const pmxFiles = files.filter((f) => f.name.toLowerCase().endsWith('.pmx'));

  if (pmxFiles.length === 0) {
    setStatus(statusEl, '⚠️ PMXファイルが見つかりませんでした。', 'warn');
    return;
  }
  if (pmxFiles.length > 1) {
    setStatus(statusEl, '⚠️ PMXファイルが複数あります。1つのモデルフォルダを選択してください。', 'warn');
    return;
  }

  const pmxFile = pmxFiles[0];

  // ファイルサイズ警告
  const warnMsg = pmxFile.size > PMX_SIZE_WARN
    ? `⚠️ PMXファイルが大きいです（${toMb(pmxFile.size)}MB）。読み込みに時間がかかる場合があります。`
    : '';
  setStatus(statusEl, warnMsg, warnMsg ? 'warn' : '');

  // 既存 ObjectURL を解放してから新規生成
  revokeAll();

  // テクスチャ ObjectURL マップ構築（filename.toLowerCase() → ObjectURL）
  const textureUrlMap = new Map();
  for (const file of files) {
    const ext = extOf(file.name);
    if (TEXTURE_EXTS.has(ext)) {
      textureUrlMap.set(file.name.toLowerCase(), createObjectUrl(file));
    }
  }

  const pmxUrl = createObjectUrl(pmxFile);

  // PMX バイナリを先読みしておく（loadModelFile 完了後に setPmxBuffer する）
  const pmxArrayBuffer = await pmxFile.arrayBuffer();

  // プログレス表示開始
  showProgress(container, true);
  updateProgress(container, 0, `${pmxFile.name} を読み込み中...`);

  try {
    await AvatarViewer.loadModelFile(pmxUrl, textureUrlMap, (percent) => {
      updateProgress(container, percent, `${pmxFile.name} を読み込み中... ${percent}%`);
    });

    // loadModelFile 内で pmxBuffer がリセットされるため、完了後にセットする
    AvatarViewer.setPmxBuffer(pmxArrayBuffer);
    console.log('[FileUploader] PMXバッファ保存:', pmxArrayBuffer.byteLength, 'bytes');

    updateProgress(container, 100, '✅ 読み込み完了');
    setTimeout(() => showProgress(container, false), 1200);

    // 警告がなければ成功メッセージで上書き
    if (!warnMsg) {
      setStatus(
        statusEl,
        `✅ ${pmxFile.name}（テクスチャ ${textureUrlMap.size}枚）`,
        'ok',
      );
    }

    // ゾーンラベルを「読み込み済み」に更新
    updateZoneLabel(
      container,
      '#pmx-zone-label',
      `<strong>${pmxFile.name}</strong> 読み込み済み<br><span class="upload-zone__link">別のフォルダを選択</span>`,
    );

    // 物理演算トグルを表示（Ammo.js が無効なら非表示のまま）
    physicsEnabled = AvatarViewer.getPhysics();
    const toggleRow = container.querySelector('#physics-toggle-row');
    const checkbox  = container.querySelector('#physics-checkbox');
    if (physicsEnabled !== undefined) {
      checkbox.checked = physicsEnabled;
      toggleRow.classList.remove('hidden');
    }

  } catch (err) {
    console.error('[FileUploader] PMX load error:', err);
    showProgress(container, false);
    setStatus(statusEl, `❌ 読み込みエラー: ${err.message}`, 'error');
  }
}

// ============================================================
// VMD 処理
// ============================================================

async function handleVmdFile(file, container) {
  const statusEl = container.querySelector('#vmd-status');

  if (!file.name.toLowerCase().endsWith('.vmd')) {
    setStatus(statusEl, '⚠️ .vmdファイルを選択してください。', 'warn');
    return;
  }

  if (file.size > VMD_SIZE_WARN) {
    setStatus(statusEl, `⚠️ VMDファイルが大きいです（${toMb(file.size)}MB）。`, 'warn');
  } else {
    setStatus(statusEl, '', '');
  }

  console.log(`[Motion] VMDファイル選択: ${file.name}`);
  const vmdArrayBuffer = await file.arrayBuffer();
  console.log('[Motion] VMDサイズ:', vmdArrayBuffer.byteLength, 'bytes');
  AvatarViewer.setVmdBuffer(vmdArrayBuffer);

  const vmdUrl = createObjectUrl(file);

  try {
    await AvatarViewer.loadMotionFile(vmdUrl);
    setStatus(statusEl, `✅ ${file.name} を読み込みました`, 'ok');
    updateZoneLabel(
      container,
      '#vmd-zone-label',
      `<strong>${file.name}</strong> 読み込み済み<br><span class="upload-zone__link">別のファイルを選択</span>`,
    );
  } catch (err) {
    console.error('[FileUploader] VMD load error:', err);
    setStatus(statusEl, `❌ 読み込みエラー: ${err.message}`, 'error');
  }
}

// ============================================================
// UI ヘルパー
// ============================================================

function setStatus(el, text, type) {
  el.textContent = text;
  el.className = 'upload-status' + (type ? ` upload-status--${type}` : '');
}

function showProgress(container, visible) {
  container.querySelector('#load-progress').classList.toggle('hidden', !visible);
}

function updateProgress(container, percent, label) {
  container.querySelector('#progress-fill').style.width = `${percent}%`;
  container.querySelector('#progress-label').textContent = label;
}

function updateZoneLabel(container, selector, html) {
  const el = container.querySelector(selector);
  if (el) el.innerHTML = html;
}

function extOf(filename) {
  const idx = filename.lastIndexOf('.');
  return idx >= 0 ? filename.slice(idx).toLowerCase() : '';
}

function toMb(bytes) {
  return (bytes / 1024 / 1024).toFixed(0);
}

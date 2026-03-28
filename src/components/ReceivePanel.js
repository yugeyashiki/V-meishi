/**
 * components/ReceivePanel.js
 * 受け取りモード: JSON 読み込み + コレクション表示
 */

import { importCard, saveToCollection, loadCollection, removeFromCollection } from '../core/exporter.js';
import { updateState } from '../data/state.js';

// ============================================================
// 公開 API
// ============================================================

/**
 * @param {HTMLElement} container - #receive-mode
 */
export function init(container) {
  render(container);
}

/**
 * コレクション表示を最新化（外部から呼べる）
 * @param {HTMLElement} container
 */
export function refreshCollection(container) {
  renderCollectionTab(container);
}

// ============================================================
// 初期描画
// ============================================================

function render(container) {
  container.innerHTML = buildHTML();
  bindEvents(container);
  renderCollectionTab(container);
}

function buildHTML() {
  return `
    <div class="receive-panel">
      <h1 class="receive-panel__title">名刺を受け取る</h1>

      <!-- サブタブ -->
      <div class="receive-tabs">
        <button class="receive-tab active" data-tab="import">JSONを読み込む</button>
        <button class="receive-tab" data-tab="collection">保存済み名刺</button>
      </div>

      <!-- JSON 読み込みタブ -->
      <div class="receive-tab-panel" id="tab-import">
        <div class="upload-zone" id="json-drop-zone">
          <div class="upload-zone__body">
            <span class="upload-zone__icon">📄</span>
            <p class="upload-zone__main">
              名刺JSONをドロップ<br>
              または <span class="upload-zone__link">クリックして選択</span>
            </p>
            <p class="upload-zone__sub">.json ファイルを選択してください</p>
          </div>
          <input type="file" id="json-file-input" accept=".json" class="upload-input">
        </div>
        <p id="json-import-status" class="upload-status"></p>

        <!-- 読み込んだカードのプレビュー -->
        <div id="imported-card-preview" class="imported-card-preview hidden"></div>
      </div>

      <!-- 保存済みタブ -->
      <div class="receive-tab-panel hidden" id="tab-collection">
        <div id="collection-grid" class="collection-grid"></div>
        <p id="collection-empty" class="collection-empty hidden">保存済みの名刺はありません</p>
      </div>
    </div>
  `;
}

// ============================================================
// イベント
// ============================================================

function bindEvents(container) {
  // サブタブ切り替え
  container.querySelectorAll('.receive-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      container.querySelectorAll('.receive-tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      const target = tab.dataset.tab;
      container.querySelectorAll('.receive-tab-panel').forEach((panel) => {
        panel.classList.toggle('hidden', panel.id !== `tab-${target}`);
      });
      if (target === 'collection') renderCollectionTab(container);
    });
  });

  // JSON ファイル選択
  const jsonZone  = container.querySelector('#json-drop-zone');
  const jsonInput = container.querySelector('#json-file-input');

  jsonZone.addEventListener('click', () => jsonInput.click());
  jsonInput.addEventListener('change', () => {
    if (jsonInput.files[0]) handleJsonFile(jsonInput.files[0], container);
  });

  jsonZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    jsonZone.classList.add('upload-zone--drag');
  });
  jsonZone.addEventListener('dragleave', () => {
    jsonZone.classList.remove('upload-zone--drag');
  });
  jsonZone.addEventListener('drop', (e) => {
    e.preventDefault();
    jsonZone.classList.remove('upload-zone--drag');
    const file = e.dataTransfer.files[0];
    if (file) handleJsonFile(file, container);
  });
}

// ============================================================
// JSON 読み込み処理
// ============================================================

async function handleJsonFile(file, container) {
  const statusEl = container.querySelector('#json-import-status');

  if (!file.name.toLowerCase().endsWith('.json')) {
    setStatus(statusEl, '⚠️ .jsonファイルを選択してください', 'warn');
    return;
  }

  const text = await file.text();
  const { card, errors } = importCard(text);

  if (!card) {
    setStatus(statusEl, `❌ ${errors.join(' / ')}`, 'error');
    return;
  }

  setStatus(statusEl, `✅ ${file.name} を読み込みました`, 'ok');
  showImportedCard(card, container);
}

// ============================================================
// 読み込みカードプレビュー
// ============================================================

function showImportedCard(card, container) {
  const preview = container.querySelector('#imported-card-preview');
  preview.classList.remove('hidden');
  preview.innerHTML = buildCardPreviewHTML(card);

  // 保存ボタン
  preview.querySelector('#btn-save-imported')?.addEventListener('click', () => {
    const result = saveToCollection(card);
    const btn    = preview.querySelector('#btn-save-imported');
    btn.textContent = result.success ? '✅ 保存済み' : `❌ ${result.message}`;
    btn.disabled    = result.success;
  });

  // 名刺として読み込みボタン
  preview.querySelector('#btn-apply-imported')?.addEventListener('click', () => {
    applyCardToState(card);
  });
}

function buildCardPreviewHTML(card) {
  const { profile, theme } = card;
  const links = (profile.links ?? []).map((l) => `
    <div class="card-link-item">
      <span class="sns-icon-box">🔗</span>
      <span class="sns-link-text">${escapeHtml(l.label || l.url || '')}</span>
    </div>
  `).join('');

  const bgStyle = buildBgStyle(theme);
  const organizationHtml = profile.organization
    ? `<p class="card-organization">${escapeHtml(profile.organization)}</p>`
    : '';
  const genreHtml = profile.genre
    ? `<span class="card-genre">${escapeHtml(profile.genre)}</span>`
    : '';

  return `
    <div class="static-card-preview" style="${bgStyle} color: ${theme.textColor}; --accent-color: ${theme.accentColor};">
      <p class="card-name">${escapeHtml(profile.name || '')}</p>
      <div class="accent-line"></div>
      ${organizationHtml}
      <p class="card-catchphrase">${escapeHtml(profile.catchphrase || '')}</p>
      ${genreHtml}
      <div class="card-links">${links}</div>
    </div>
    <div class="imported-card-actions">
      <button id="btn-save-imported" class="btn-primary">💾 コレクションに保存</button>
      <button id="btn-apply-imported" class="btn-secondary">✏️ この名刺を編集する</button>
    </div>
  `;
}

// ============================================================
// コレクションタブ
// ============================================================

function renderCollectionTab(container) {
  const grid     = container.querySelector('#collection-grid');
  const emptyMsg = container.querySelector('#collection-empty');
  if (!grid) return;

  const collection = loadCollection();

  if (collection.length === 0) {
    grid.innerHTML = '';
    emptyMsg?.classList.remove('hidden');
    return;
  }

  emptyMsg?.classList.add('hidden');
  grid.innerHTML = collection.map((card) => buildCollectionItemHTML(card)).join('');

  // 削除ボタン
  grid.querySelectorAll('[data-action="delete"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.closest('[data-card-id]')?.dataset.cardId;
      if (id && confirm('この名刺を削除しますか？')) {
        removeFromCollection(id);
        renderCollectionTab(container);
      }
    });
  });

  // 編集ボタン
  grid.querySelectorAll('[data-action="apply"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id   = btn.closest('[data-card-id]')?.dataset.cardId;
      const card = loadCollection().find((c) => c.meta?.id === id);
      if (card) applyCardToState(card);
    });
  });
}

function buildCollectionItemHTML(card) {
  const { profile, theme, meta } = card;
  const bgStyle  = buildBgStyle(theme);
  const savedAt  = meta.savedAt ? new Date(meta.savedAt).toLocaleDateString('ja-JP') : '';

  return `
    <div class="collection-item" data-card-id="${escapeHtml(meta.id)}">
      <div class="collection-item__card" style="${bgStyle} color: ${theme.textColor}; --accent-color: ${theme.accentColor};">
        <p class="card-name" style="font-size: 0.85em">${escapeHtml(profile.name || '（名前なし）')}</p>
        <div class="accent-line"></div>
        <p class="card-catchphrase" style="font-size: 0.7em">${escapeHtml(profile.catchphrase || '')}</p>
      </div>
      <div class="collection-item__footer">
        <span class="collection-item__date">${savedAt}</span>
        <div class="collection-item__btns">
          <button class="btn-xs btn-primary" data-action="apply">編集</button>
          <button class="btn-xs btn-danger"  data-action="delete">削除</button>
        </div>
      </div>
    </div>
  `;
}

// ============================================================
// 名刺データを cardState に反映 → 作成モードへ切り替え
// ============================================================

function applyCardToState(card) {
  updateState({
    profile: {
      name:         card.profile.name,
      catchphrase:  card.profile.catchphrase,
      genre:        card.profile.genre,
      organization: card.profile.organization ?? '',
    },
    links: card.profile.links ?? [],
    theme: card.theme,
  });

  // 作成モードへ切り替え
  document.getElementById('create-mode')?.classList.remove('hidden');
  document.getElementById('receive-mode')?.classList.add('hidden');
  document.getElementById('preview-mode')?.classList.add('hidden');

  // ナビのアクティブタブを更新
  document.querySelectorAll('.app-nav__tab').forEach((t) => {
    t.classList.toggle('active', t.dataset.mode === 'create');
  });

  window.scrollTo(0, 0);
}

// ============================================================
// ヘルパー
// ============================================================

function buildBgStyle(theme) {
  if (theme.bgType === 'gradient' && theme.bgGradient?.length === 2) {
    return `background: linear-gradient(135deg, ${theme.bgGradient[0]}, ${theme.bgGradient[1]});`;
  }
  return `background-color: ${theme.bgColor};`;
}

function setStatus(el, text, type) {
  el.textContent = text;
  el.className   = 'upload-status' + (type ? ` upload-status--${type}` : '');
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;');
}

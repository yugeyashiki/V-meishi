/**
 * components/CardLayout.js
 * cardState を購読し、名刺の HTML/CSS をリアルタイムに反映する
 *
 * 対象要素:
 *   作成モード: #card-preview 内の #preview-name / #preview-catchphrase / #preview-links
 *   プレビューモード: #card-layout 内の #card-name / #card-catchphrase / #card-links
 *   テーマ: document.documentElement の CSS 変数
 */

import { getState, subscribe } from '../data/state.js';
import { onContainerChanged } from './AvatarViewer.js';

// SNS プラットフォームのラベル定義
const PLATFORM_LABELS = {
  X:         { icon: '𝕏',  label: 'X' },
  YouTube:   { icon: '▶',  label: 'YouTube' },
  TikTok:    { icon: '♪',  label: 'TikTok' },
  Twitch:    { icon: '🎮', label: 'Twitch' },
  Instagram: { icon: '📷', label: 'Instagram' },
  other:     { icon: '🔗', label: 'Link' },
};

// ============================================================
// 公開 API
// ============================================================

/**
 * CardLayout を初期化する
 * - cardState の初期値で即時描画
 * - 以降は subscribe で自動更新
 */
export function init() {
  render(getState());
  subscribe(render);
  bindModeSwitch();
}

// ============================================================
// 描画
// ============================================================

function render(state) {
  renderProfile(state.profile);
  renderLinks(state.links);
  renderTheme(state.theme);
}

function renderProfile({ name, catchphrase, genre, organization }) {
  // 作成モード（常時表示のプレビューカード）
  setText('#preview-name',        name        || '名前');
  setText('#preview-catchphrase', catchphrase || 'キャッチコピー');
  setOptionalText('#preview-organization', organization);
  setGenre('#preview-genre', genre);

  // プレビューモード（フルカードレイアウト）
  setText('#card-name',        name        || '');
  setText('#card-catchphrase', catchphrase || '');
  setOptionalText('#card-organization', organization);
  setGenre('#card-genre', genre);
}

function renderLinks(links) {
  const html = links.map(linkItemHTML).join('');
  setHTML('#preview-links', html);
  setHTML('#card-links',    html);
}

function renderTheme(theme) {
  const root  = document.documentElement;
  const cards = document.querySelectorAll('#card-preview, #card-layout');

  // 背景（CSS変数 + 画像背景は直接 style に適用）
  if (theme.bgType === 'gradient') {
    const [from, to] = theme.bgGradient;
    root.style.setProperty('--bg-color', `linear-gradient(135deg, ${from}, ${to})`);
    cards.forEach((c) => { c.style.backgroundImage = ''; c.style.backgroundColor = ''; });
  } else if (theme.bgType === 'image' && theme.bgImage) {
    root.style.setProperty('--bg-color', '#000');
    cards.forEach((c) => {
      c.style.backgroundImage = `url(${theme.bgImage})`;
      c.style.backgroundSize  = 'cover';
      c.style.backgroundPosition = 'center';
    });
  } else {
    root.style.setProperty('--bg-color', theme.bgColor);
    cards.forEach((c) => { c.style.backgroundImage = ''; c.style.backgroundColor = ''; });
  }

  root.style.setProperty('--text-color',   theme.textColor);
  root.style.setProperty('--accent-color', theme.accentColor);
}

// ============================================================
// モード切り替え
// ============================================================

function bindModeSwitch() {
  const createMode     = document.getElementById('create-mode');
  const previewMode    = document.getElementById('preview-mode');
  const receiveMode    = document.getElementById('receive-mode');
  const avatarArea     = document.getElementById('avatar-area');
  const cardAvatarArea = document.getElementById('card-avatar-area');
  const canvas         = document.getElementById('avatar-canvas');
  const btnToPreview   = document.getElementById('btn-to-preview');
  const btnToCreate    = document.getElementById('btn-to-create');
  const appNav         = document.getElementById('app-nav');

  // プレビューへ
  btnToPreview?.addEventListener('click', () => {
    if (canvas && cardAvatarArea) cardAvatarArea.appendChild(canvas);
    createMode.classList.add('hidden');
    previewMode.classList.remove('hidden');
    receiveMode?.classList.add('hidden');
    appNav?.classList.add('hidden');
    onContainerChanged();
    window.scrollTo(0, 0);
  });

  // 作成モードへ戻る
  btnToCreate?.addEventListener('click', () => {
    if (canvas && avatarArea) avatarArea.appendChild(canvas);
    previewMode.classList.add('hidden');
    createMode.classList.remove('hidden');
    appNav?.classList.remove('hidden');
    setNavActive('create');
    onContainerChanged();
    window.scrollTo(0, 0);
  });

  // トップナビ切り替え
  appNav?.querySelectorAll('.app-nav__tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const mode = tab.dataset.mode;
      setNavActive(mode);

      createMode?.classList.toggle('hidden',  mode !== 'create');
      receiveMode?.classList.toggle('hidden', mode !== 'receive');
      previewMode?.classList.add('hidden');

      // canvas が preview にいる場合は作成モードへ戻す
      if (mode === 'create' && canvas?.parentElement !== avatarArea) {
        avatarArea?.appendChild(canvas);
        onContainerChanged();
      }

      window.scrollTo(0, 0);
    });
  });
}

function setNavActive(mode) {
  document.querySelectorAll('.app-nav__tab').forEach((t) => {
    t.classList.toggle('active', t.dataset.mode === mode);
  });
}

// ============================================================
// HTML ヘルパー
// ============================================================

function linkItemHTML({ platform, url, label }) {
  const def = PLATFORM_LABELS[platform] ?? PLATFORM_LABELS.other;
  const displayText = label || url || '';
  const escapedUrl  = escapeHtml(url  || '');
  const escapedText = escapeHtml(displayText);

  return `
    <div class="card-link-item">
      <span class="sns-icon-box" aria-hidden="true">${def.icon}</span>
      <span class="sns-link-text" title="${escapedUrl}">${escapedText}</span>
    </div>
  `;
}

function setText(selector, text) {
  const el = document.querySelector(selector);
  if (el) el.textContent = text;
}

function setOptionalText(selector, text) {
  const el = document.querySelector(selector);
  if (!el) return;
  if (text) {
    el.textContent = text;
    el.classList.remove('hidden');
  } else {
    el.textContent = '';
    el.classList.add('hidden');
  }
}

function setGenre(selector, genre) {
  const el = document.querySelector(selector);
  if (!el) return;
  if (genre) {
    el.textContent = genre;
    el.classList.remove('hidden');
  } else {
    el.textContent = '';
    el.classList.add('hidden');
  }
}

function setHTML(selector, html) {
  const el = document.querySelector(selector);
  if (el) el.innerHTML = html;
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

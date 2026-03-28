/**
 * components/SnsLinks.js
 * SNSリンクの追加・削除 UI（最大5件）
 * 変更のたびに updateState({ links }) を呼び CardLayout へリアルタイム反映する
 */

import { getState, updateState } from '../data/state.js';

const MAX_LINKS = 5;

const PLATFORMS = [
  { value: 'X',         label: 'X（旧Twitter）' },
  { value: 'YouTube',   label: 'YouTube' },
  { value: 'TikTok',    label: 'TikTok' },
  { value: 'Twitch',    label: 'Twitch' },
  { value: 'Instagram', label: 'Instagram' },
  { value: 'other',     label: 'その他' },
];

// ============================================================
// 公開 API
// ============================================================

/**
 * @param {HTMLElement} container - #sns-links-section
 */
export function init(container) {
  // 内部リストを state から複製して管理
  links = getState().links.map((l) => ({ ...l }));
  container.innerHTML = buildHTML();
  renderList(container);
  bindAddButton(container);
}

// ============================================================
// 内部状態（UI 側のローカルコピー）
// ============================================================

let links = []; // { id, platform, url, label }[]

function nextId() {
  return Date.now() + Math.random();
}

// ============================================================
// HTML 骨格
// ============================================================

function buildHTML() {
  return `
    <div class="form-section">
      <h2 class="form-section__title">SNS リンク</h2>
      <ul class="sns-list" id="sns-list"></ul>
      <button type="button" id="btn-add-sns" class="btn-add-sns">
        ＋ SNSを追加
      </button>
      <p class="sns-hint" id="sns-hint"></p>
    </div>
  `;
}

// ============================================================
// リスト描画
// ============================================================

function renderList(container) {
  const list    = container.querySelector('#sns-list');
  const addBtn  = container.querySelector('#btn-add-sns');
  const hint    = container.querySelector('#sns-hint');

  list.innerHTML = links.map((link) => linkRowHTML(link)).join('');

  // 削除ボタン
  list.querySelectorAll('.sns-row__delete').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = Number(btn.dataset.id);
      links = links.filter((l) => l.id !== id);
      renderList(container);
      pushState();
    });
  });

  // プラットフォーム選択
  list.querySelectorAll('.sns-row__platform').forEach((sel) => {
    sel.addEventListener('change', () => {
      const id = Number(sel.dataset.id);
      const link = links.find((l) => l.id === id);
      if (link) { link.platform = sel.value; pushState(); }
    });
  });

  // URL 入力
  list.querySelectorAll('.sns-row__url').forEach((input) => {
    input.addEventListener('input', () => {
      const id = Number(input.dataset.id);
      const link = links.find((l) => l.id === id);
      if (link) { link.url = input.value.trim(); pushState(); }
    });
  });

  // 上限表示
  const isFull = links.length >= MAX_LINKS;
  addBtn.disabled = isFull;
  addBtn.classList.toggle('btn-add-sns--disabled', isFull);
  hint.textContent = isFull ? `最大 ${MAX_LINKS} 件まで追加できます` : '';
}

function linkRowHTML({ id, platform, url }) {
  const options = PLATFORMS.map(({ value, label }) =>
    `<option value="${value}" ${value === platform ? 'selected' : ''}>${label}</option>`
  ).join('');

  return `
    <li class="sns-row">
      <select class="sns-row__platform form-select" data-id="${id}">
        ${options}
      </select>
      <input
        type="url"
        class="sns-row__url form-input"
        placeholder="https://"
        value="${escapeAttr(url)}"
        data-id="${id}"
      >
      <button type="button" class="sns-row__delete" data-id="${id}" aria-label="削除">✕</button>
    </li>
  `;
}

// ============================================================
// 追加ボタン
// ============================================================

function bindAddButton(container) {
  container.querySelector('#btn-add-sns').addEventListener('click', () => {
    if (links.length >= MAX_LINKS) return;
    links.push({ id: nextId(), platform: 'X', url: '', label: '' });
    renderList(container);
    // 新しく追加された行の URL 入力にフォーカス
    const inputs = container.querySelectorAll('.sns-row__url');
    inputs[inputs.length - 1]?.focus();
    pushState();
  });
}

// ============================================================
// state への反映
// ============================================================

function pushState() {
  updateState({
    links: links.map(({ platform, url, label }) => ({ platform, url, label })),
  });
}

// ============================================================
// ユーティリティ
// ============================================================

function escapeAttr(str) {
  return (str || '').replace(/"/g, '&quot;');
}

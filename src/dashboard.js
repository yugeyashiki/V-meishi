/**
 * src/dashboard.js
 * 管理画面（dashboard/index.html）のエントリーポイント
 *
 * 機能:
 *   - 自分の名刺一覧表示
 *   - 公開/非公開トグル
 *   - プロフィール・テーマ編集
 *   - 削除
 */

import { getCurrentUser, onAuthStateChange } from './auth.js';
import { getMyCards, updateCardMeta, setCardPublic, deleteCard, MAX_CARDS } from './core/supabase.js';

// ============================================================
// 初期化
// ============================================================

async function main() {
  const user = await getCurrentUser();
  if (!user) {
    showUnauth();
    return;
  }

  showMain();
  await loadCards(user.id);

  // セッション切れ時にリダイレクト
  onAuthStateChange((u) => {
    if (!u) window.location.href = '/';
  });
}

// ============================================================
// カード一覧の読み込み・描画
// ============================================================

async function loadCards(userId) {
  setLoading(true);
  try {
    const cards = await getMyCards(userId);
    renderCards(cards, userId);
  } catch (e) {
    console.error('[Dashboard] 一覧取得失敗:', e);
  } finally {
    setLoading(false);
  }
}

function renderCards(cards, userId) {
  const list    = document.getElementById('db-card-list');
  const empty   = document.getElementById('db-empty');
  const countEl = document.getElementById('db-count');

  countEl.textContent = `${cards.length} / ${MAX_CARDS} 枚`;

  if (cards.length === 0) {
    list.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }

  empty.classList.add('hidden');
  list.innerHTML = cards.map((card) => buildCardItemHTML(card)).join('');

  // イベント登録
  for (const card of cards) {
    bindCardEvents(card, userId);
  }
}

function buildCardItemHTML(card) {
  const url       = `${window.location.origin}/card/?id=${card.id}`;
  const createdAt = new Date(card.created_at).toLocaleString('ja-JP', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
  const isPublic  = card.is_public !== false; // NULL も公開扱い

  return `
    <li class="db-card-item" data-uuid="${card.id}">
      <div class="db-card-item__header">
        <span class="db-card-item__name">${escapeHtml(card.name ?? '(名前なし)')}</span>
        <span class="db-card-item__date">${createdAt}</span>
      </div>

      <div class="db-card-item__url-row">
        <span class="db-card-item__url" title="${escapeHtml(url)}">${escapeHtml(url)}</span>
        <button type="button" class="db-btn-copy db-btn-icon" data-copy-url="${escapeHtml(url)}" title="URLをコピー">🔗</button>
      </div>

      <div class="db-card-item__footer">
        <!-- 公開/非公開トグル -->
        <label class="db-toggle-label">
          <input type="checkbox" class="db-public-toggle" data-uuid="${card.id}" ${isPublic ? 'checked' : ''}>
          <span class="db-toggle-track"></span>
          <span class="db-toggle-text">${isPublic ? '公開' : '非公開'}</span>
        </label>

        <div class="db-card-item__actions">
          <button type="button" class="db-btn-edit   btn-secondary db-btn-sm" data-uuid="${card.id}">編集</button>
          <button type="button" class="db-btn-delete btn-secondary db-btn-sm db-btn-danger" data-uuid="${card.id}">削除</button>
        </div>
      </div>
    </li>
  `;
}

function bindCardEvents(card, userId) {
  const item = document.querySelector(`[data-uuid="${card.id}"]`);
  if (!item) return;

  // URL コピー
  item.querySelector('.db-btn-copy')?.addEventListener('click', (e) => {
    const url = e.currentTarget.dataset.copyUrl;
    navigator.clipboard.writeText(url).then(() => {
      e.currentTarget.textContent = '✅';
      setTimeout(() => { e.currentTarget.textContent = '🔗'; }, 2000);
    });
  });

  // 公開トグル
  item.querySelector('.db-public-toggle')?.addEventListener('change', async (e) => {
    const isPublic  = e.target.checked;
    const textEl    = e.target.closest('label').querySelector('.db-toggle-text');
    try {
      await setCardPublic(card.id, isPublic);
      if (textEl) textEl.textContent = isPublic ? '公開' : '非公開';
    } catch (err) {
      console.error('[Dashboard] 公開設定失敗:', err);
      e.target.checked = !isPublic; // 失敗時は元に戻す
    }
  });

  // 編集
  item.querySelector('.db-btn-edit')?.addEventListener('click', () => {
    openEditModal(card);
  });

  // 削除
  item.querySelector('.db-btn-delete')?.addEventListener('click', async () => {
    if (!confirm('この名刺を削除しますか？\n閲覧URLが無効になります。')) return;
    try {
      await deleteCard(card.id);
      item.remove();
      // カウントを更新
      const remaining = document.querySelectorAll('.db-card-item').length;
      const countEl = document.getElementById('db-count');
      if (countEl) countEl.textContent = `${remaining} / ${MAX_CARDS} 枚`;
      if (remaining === 0) document.getElementById('db-empty')?.classList.remove('hidden');
    } catch (err) {
      console.error('[Dashboard] 削除失敗:', err);
      alert(`削除に失敗しました: ${err.message}`);
    }
  });
}

// ============================================================
// 編集モーダル
// ============================================================

let _editCard = null;

function openEditModal(card) {
  _editCard = card;

  document.getElementById('edit-uuid').value         = card.id;
  document.getElementById('edit-name').value          = card.name         ?? '';
  document.getElementById('edit-catchphrase').value   = card.catchphrase  ?? '';
  document.getElementById('edit-organization').value  = card.organization ?? '';
  document.getElementById('edit-genre').value         = card.genre        ?? '';
  document.getElementById('edit-bg-color').value      = card.theme?.bgColor     ?? '#0D0D0D';
  document.getElementById('edit-accent-color').value  = card.theme?.accentColor ?? '#9B59B6';
  document.getElementById('edit-error').classList.add('hidden');

  document.getElementById('db-edit-modal').classList.remove('hidden');
}

function closeEditModal() {
  document.getElementById('db-edit-modal').classList.add('hidden');
  _editCard = null;
}

async function saveEdit() {
  if (!_editCard) return;

  const uuid         = document.getElementById('edit-uuid').value;
  const name         = document.getElementById('edit-name').value.trim();
  const catchphrase  = document.getElementById('edit-catchphrase').value.trim();
  const organization = document.getElementById('edit-organization').value.trim();
  const genre        = document.getElementById('edit-genre').value.trim();
  const bgColor      = document.getElementById('edit-bg-color').value;
  const accentColor  = document.getElementById('edit-accent-color').value;

  const theme = {
    ..._editCard.theme,
    bgColor,
    accentColor,
  };

  const errEl = document.getElementById('edit-error');
  errEl.classList.add('hidden');

  try {
    await updateCardMeta(uuid, {
      name:         name         || '(名前なし)',
      catchphrase:  catchphrase  || null,
      organization: organization || null,
      genre:        genre        || null,
      links:        _editCard.links  ?? [],
      theme,
    });

    // 一覧の表示を更新（フルリロードせずに該当アイテムのみ更新）
    const item   = document.querySelector(`[data-uuid="${uuid}"]`);
    const nameEl = item?.querySelector('.db-card-item__name');
    if (nameEl) nameEl.textContent = name || '(名前なし)';

    closeEditModal();
  } catch (err) {
    errEl.textContent = `保存に失敗しました: ${err.message}`;
    errEl.classList.remove('hidden');
  }
}

// ============================================================
// UI 状態管理
// ============================================================

function setLoading(visible) {
  document.getElementById('db-loading').classList.toggle('hidden', !visible);
}

function showUnauth() {
  setLoading(false);
  document.getElementById('db-unauth').classList.remove('hidden');
}

function showMain() {
  setLoading(false);
  document.getElementById('db-main').classList.remove('hidden');
}

// ============================================================
// ユーティリティ
// ============================================================

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]),
  );
}

// ============================================================
// モーダルのイベント登録
// ============================================================

document.getElementById('btn-edit-cancel')?.addEventListener('click', closeEditModal);
document.getElementById('db-modal-overlay')?.addEventListener('click', closeEditModal);
document.getElementById('btn-edit-save')?.addEventListener('click', saveEdit);

// ============================================================
// 起動
// ============================================================
main();

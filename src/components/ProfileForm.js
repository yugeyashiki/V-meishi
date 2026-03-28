/**
 * components/ProfileForm.js
 * 名前・キャッチコピー・活動ジャンルの入力フォーム
 * 入力のたびに updateState({ profile }) を呼び CardLayout へリアルタイム反映する
 */

import { getState, updateState } from '../data/state.js';

const MAX_NAME         = 20;
const MAX_CATCHPHRASE  = 40;
const MAX_GENRE        = 20;
const MAX_ORGANIZATION = 30;

// ============================================================
// 公開 API
// ============================================================

/**
 * @param {HTMLElement} container - #profile-form-section
 */
export function init(container) {
  container.innerHTML = buildHTML();
  bindEvents(container);
  // 既存の state があれば反映（ページリロード等の将来拡張に備えて）
  const { profile } = getState();
  container.querySelector('#input-name').value         = profile.name;
  container.querySelector('#input-catchphrase').value  = profile.catchphrase;
  container.querySelector('#input-organization').value = profile.organization ?? '';
  container.querySelector('#input-genre').value        = profile.genre;
}

// ============================================================
// HTML 生成
// ============================================================

function buildHTML() {
  return `
    <div class="form-section">
      <h2 class="form-section__title">プロフィール</h2>

      <div class="form-field">
        <label class="form-label" for="input-name">
          名前 <span class="form-required">必須</span>
          <span class="form-counter" id="counter-name">0 / ${MAX_NAME}</span>
        </label>
        <input
          type="text"
          id="input-name"
          class="form-input"
          placeholder="例：○○ちゃん"
          maxlength="${MAX_NAME}"
        >
      </div>

      <div class="form-field">
        <label class="form-label" for="input-catchphrase">
          キャッチコピー
          <span class="form-counter" id="counter-catchphrase">0 / ${MAX_CATCHPHRASE}</span>
        </label>
        <input
          type="text"
          id="input-catchphrase"
          class="form-input"
          placeholder="例：毎日ゲーム配信中！"
          maxlength="${MAX_CATCHPHRASE}"
        >
      </div>

      <div class="form-field">
        <label class="form-label" for="input-organization">
          所属事務所・会社名
          <span class="form-counter" id="counter-organization">0 / ${MAX_ORGANIZATION}</span>
        </label>
        <input
          type="text"
          id="input-organization"
          class="form-input"
          placeholder="例：○○プロダクション"
          maxlength="${MAX_ORGANIZATION}"
        >
      </div>

      <div class="form-field">
        <label class="form-label" for="input-genre">
          活動ジャンル
          <span class="form-counter" id="counter-genre">0 / ${MAX_GENRE}</span>
        </label>
        <input
          type="text"
          id="input-genre"
          class="form-input"
          placeholder="例：ゲーム / 雑談"
          maxlength="${MAX_GENRE}"
        >
      </div>
    </div>
  `;
}

// ============================================================
// イベント登録
// ============================================================

function bindEvents(container) {
  const nameEl         = container.querySelector('#input-name');
  const catchphraseEl  = container.querySelector('#input-catchphrase');
  const organizationEl = container.querySelector('#input-organization');
  const genreEl        = container.querySelector('#input-genre');

  nameEl.addEventListener('input', () => {
    updateCounter(container, 'counter-name', nameEl.value.length, MAX_NAME);
    updateState({ profile: { name: nameEl.value } });
  });

  catchphraseEl.addEventListener('input', () => {
    updateCounter(container, 'counter-catchphrase', catchphraseEl.value.length, MAX_CATCHPHRASE);
    updateState({ profile: { catchphrase: catchphraseEl.value } });
  });

  organizationEl.addEventListener('input', () => {
    updateCounter(container, 'counter-organization', organizationEl.value.length, MAX_ORGANIZATION);
    updateState({ profile: { organization: organizationEl.value } });
  });

  genreEl.addEventListener('input', () => {
    updateCounter(container, 'counter-genre', genreEl.value.length, MAX_GENRE);
    updateState({ profile: { genre: genreEl.value } });
  });
}

function updateCounter(container, id, current, max) {
  const el = container.querySelector(`#${id}`);
  if (!el) return;
  el.textContent = `${current} / ${max}`;
  el.classList.toggle('form-counter--warn', current >= max);
}

/**
 * components/ThemeSelector.js
 * カラープリセット選択 + カスタムカラーピッカー UI
 *
 * UI 構成:
 *   ① プリセットサムネイル横並び（+ カスタムボタン）
 *   ② カスタムパネル（カスタム選択時のみ展開）
 *      - タブ: 単色 / グラデーション / 画像
 *      - 各タブに背景色・テキスト色・アクセントカラーの input[type=color]
 */

import { getState, updateState } from '../data/state.js';
import { COLOR_PRESETS } from '../data/presets.js';

// 現在の選択状態
let currentPresetId = 'dark';
let currentBgType   = 'solid';
let bgImageUrl      = null; // 画像の ObjectURL

// ============================================================
// 公開 API
// ============================================================

/**
 * @param {HTMLElement} container - #theme-selector-section
 */
export function init(container) {
  const { theme } = getState();
  currentPresetId = theme.preset;
  currentBgType   = theme.bgType;

  container.innerHTML = buildHTML(theme);
  bindEvents(container);
  updatePresetSelection(container, currentPresetId);
  if (currentPresetId === 'custom') {
    container.querySelector('#theme-custom-panel').classList.remove('hidden');
  }
}

// ============================================================
// HTML 生成
// ============================================================

function buildHTML(theme) {
  const presetThumbs = COLOR_PRESETS.map(presetThumbHTML).join('');

  return `
    <div class="form-section">
      <h2 class="form-section__title">カラーテーマ</h2>

      <!-- プリセット横並び -->
      <div class="theme-presets" id="theme-presets" role="listbox" aria-label="カラープリセット">
        ${presetThumbs}
        <button class="theme-thumb theme-thumb--custom" data-preset="custom"
                type="button" aria-label="カスタム">
          <span class="theme-thumb__icon">🎨</span>
          <span class="theme-thumb__label">カスタム</span>
        </button>
      </div>

      <!-- カスタムパネル -->
      <div class="theme-custom-panel hidden" id="theme-custom-panel">

        <!-- タブ -->
        <div class="theme-tabs" role="tablist">
          <button class="theme-tab" data-tab="solid"    type="button" role="tab">単色</button>
          <button class="theme-tab" data-tab="gradient" type="button" role="tab">グラデーション</button>
          <button class="theme-tab" data-tab="image"    type="button" role="tab">画像</button>
        </div>

        <!-- 単色 -->
        <div class="theme-tab-panel" id="panel-solid">
          ${colorRowHTML('背景色',         'custom-bg-color',    theme.bgColor)}
          ${colorRowHTML('テキスト色',     'custom-text-color',  theme.textColor)}
          ${colorRowHTML('アクセントカラー','custom-accent-solid', theme.accentColor)}
        </div>

        <!-- グラデーション -->
        <div class="theme-tab-panel hidden" id="panel-gradient">
          ${colorRowHTML('開始色',         'custom-grad-from',   theme.bgGradient[0])}
          ${colorRowHTML('終了色',         'custom-grad-to',     theme.bgGradient[1])}
          ${colorRowHTML('テキスト色',     'custom-grad-text',   theme.textColor)}
          ${colorRowHTML('アクセントカラー','custom-grad-accent',  theme.accentColor)}
        </div>

        <!-- 画像 -->
        <div class="theme-tab-panel hidden" id="panel-image">
          <div class="image-drop-zone" id="bg-image-zone">
            <div class="image-drop-zone__body">
              <span class="image-drop-zone__icon">🖼️</span>
              <p class="image-drop-zone__label" id="bg-image-label">
                背景画像をドロップ<br>または <span class="upload-zone__link">クリックして選択</span>
              </p>
            </div>
            <input type="file" id="custom-bg-image" accept="image/*" class="upload-input">
          </div>
          <p id="bg-image-status" class="upload-status"></p>
          ${colorRowHTML('テキスト色',     'custom-img-text',   theme.textColor)}
          ${colorRowHTML('アクセントカラー','custom-img-accent',  theme.accentColor)}
        </div>

      </div>
    </div>
  `;
}

function presetThumbHTML(preset) {
  const bg = preset.bgType === 'gradient'
    ? `linear-gradient(135deg, ${preset.bgGradient[0]}, ${preset.bgGradient[1]})`
    : preset.bgColor;

  return `
    <button class="theme-thumb" data-preset="${preset.id}" type="button"
            style="background:${bg}" aria-label="${preset.label}">
      <span class="theme-thumb__accent" style="background:${preset.accentColor}"></span>
      <span class="theme-thumb__label" style="color:${preset.textColor}">${preset.label}</span>
    </button>
  `;
}

function colorRowHTML(label, id, value) {
  return `
    <div class="color-row">
      <label class="color-label" for="${id}">${label}</label>
      <div class="color-picker-wrap">
        <input type="color" id="${id}" class="color-picker" value="${value}">
        <span class="color-value" id="${id}-value">${value}</span>
      </div>
    </div>
  `;
}

// ============================================================
// イベント登録
// ============================================================

function bindEvents(container) {
  bindPresets(container);
  bindTabs(container);
  bindSolidPickers(container);
  bindGradientPickers(container);
  bindImagePanel(container);
  // 初期タブを現在の bgType に合わせる
  activateTab(container, currentBgType);
}

// --- プリセット選択 ---
function bindPresets(container) {
  container.querySelector('#theme-presets').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-preset]');
    if (!btn) return;

    const id = btn.dataset.preset;
    currentPresetId = id;
    updatePresetSelection(container, id);

    const customPanel = container.querySelector('#theme-custom-panel');
    if (id === 'custom') {
      customPanel.classList.remove('hidden');
      // カスタムパネルの色を現在の state に同期
      syncPickersFromState(container);
    } else {
      customPanel.classList.add('hidden');
      const preset = COLOR_PRESETS.find((p) => p.id === id);
      if (preset) applyPreset(preset);
    }
  });
}

function updatePresetSelection(container, activeId) {
  container.querySelectorAll('[data-preset]').forEach((btn) => {
    btn.classList.toggle('theme-thumb--active', btn.dataset.preset === activeId);
  });
}

function applyPreset(preset) {
  updateState({
    theme: {
      preset:      preset.id,
      bgType:      preset.bgType,
      bgColor:     preset.bgColor,
      bgGradient:  [...preset.bgGradient],
      textColor:   preset.textColor,
      accentColor: preset.accentColor,
    },
  });
}

// --- タブ切り替え ---
function bindTabs(container) {
  container.querySelector('.theme-tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tab]');
    if (!btn) return;
    currentBgType = btn.dataset.tab;
    activateTab(container, currentBgType);
    // タブ切り替え時に現在の bgType を state に反映
    updateState({ theme: { preset: 'custom', bgType: currentBgType } });
  });
}

function activateTab(container, tabId) {
  container.querySelectorAll('.theme-tab').forEach((btn) => {
    btn.classList.toggle('theme-tab--active', btn.dataset.tab === tabId);
  });
  container.querySelectorAll('.theme-tab-panel').forEach((panel) => {
    panel.classList.add('hidden');
  });
  container.querySelector(`#panel-${tabId}`)?.classList.remove('hidden');
}

// --- 単色ピッカー ---
function bindSolidPickers(container) {
  bindPicker(container, 'custom-bg-color',    (v) => updateState({ theme: { preset: 'custom', bgType: 'solid', bgColor: v } }));
  bindPicker(container, 'custom-text-color',  (v) => updateState({ theme: { preset: 'custom', textColor: v } }));
  bindPicker(container, 'custom-accent-solid',(v) => updateState({ theme: { preset: 'custom', accentColor: v } }));
}

// --- グラデーションピッカー ---
function bindGradientPickers(container) {
  const getGrad = () => getState().theme.bgGradient;
  bindPicker(container, 'custom-grad-from',  (v) => updateState({ theme: { preset: 'custom', bgType: 'gradient', bgGradient: [v, getGrad()[1]] } }));
  bindPicker(container, 'custom-grad-to',    (v) => updateState({ theme: { preset: 'custom', bgType: 'gradient', bgGradient: [getGrad()[0], v] } }));
  bindPicker(container, 'custom-grad-text',  (v) => updateState({ theme: { preset: 'custom', textColor: v } }));
  bindPicker(container, 'custom-grad-accent',(v) => updateState({ theme: { preset: 'custom', accentColor: v } }));
}

// --- 画像パネル ---
function bindImagePanel(container) {
  const zone  = container.querySelector('#bg-image-zone');
  const input = container.querySelector('#custom-bg-image');

  zone.addEventListener('click', () => input.click());
  input.addEventListener('change', () => {
    if (input.files[0]) handleBgImage(input.files[0], container);
  });
  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.add('image-drop-zone--drag');
  });
  zone.addEventListener('dragleave', () => zone.classList.remove('image-drop-zone--drag'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('image-drop-zone--drag');
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) handleBgImage(file, container);
  });

  bindPicker(container, 'custom-img-text',  (v) => updateState({ theme: { preset: 'custom', textColor: v } }));
  bindPicker(container, 'custom-img-accent',(v) => updateState({ theme: { preset: 'custom', accentColor: v } }));
}

function handleBgImage(file, container) {
  if (bgImageUrl) URL.revokeObjectURL(bgImageUrl);
  bgImageUrl = URL.createObjectURL(file);

  updateState({
    theme: {
      preset: 'custom',
      bgType: 'image',
      bgImage: bgImageUrl,
    },
  });

  container.querySelector('#bg-image-label').innerHTML =
    `<strong>${file.name}</strong><br><span class="upload-zone__link">別の画像を選択</span>`;
  container.querySelector('#bg-image-status').textContent = `✅ ${file.name}`;
  container.querySelector('#bg-image-status').className = 'upload-status upload-status--ok';
}

// --- ピッカー共通バインド ---
function bindPicker(container, id, onChange) {
  const input = container.querySelector(`#${id}`);
  const valueEl = container.querySelector(`#${id}-value`);
  if (!input) return;
  input.addEventListener('input', () => {
    if (valueEl) valueEl.textContent = input.value;
    onChange(input.value);
  });
}

// --- カスタムパネルを state に同期 ---
function syncPickersFromState(container) {
  const { theme } = getState();
  setValue(container, 'custom-bg-color',     theme.bgColor);
  setValue(container, 'custom-text-color',   theme.textColor);
  setValue(container, 'custom-accent-solid', theme.accentColor);
  setValue(container, 'custom-grad-from',    theme.bgGradient[0]);
  setValue(container, 'custom-grad-to',      theme.bgGradient[1]);
  setValue(container, 'custom-grad-text',    theme.textColor);
  setValue(container, 'custom-grad-accent',  theme.accentColor);
  setValue(container, 'custom-img-text',     theme.textColor);
  setValue(container, 'custom-img-accent',   theme.accentColor);
}

function setValue(container, id, value) {
  const input   = container.querySelector(`#${id}`);
  const valueEl = container.querySelector(`#${id}-value`);
  if (input)   input.value = value;
  if (valueEl) valueEl.textContent = value;
}

/**
 * main.js - エントリーポイント
 */

import { init as initAvatarViewer } from './components/AvatarViewer.js';
import { init as initFileUploader } from './components/FileUploader.js';
import { init as initCardLayout }   from './components/CardLayout.js';
import { init as initProfileForm }  from './components/ProfileForm.js';
import { init as initSnsLinks }     from './components/SnsLinks.js';
import { init as initThemeSelector } from './components/ThemeSelector.js';
import { init as initQRCodePanel, refresh as refreshQR } from './components/QRCodePanel.js';
import { init as initReceivePanel } from './components/ReceivePanel.js';
import { exportCard } from './core/exporter.js';
import { getState } from './data/state.js';

// AvatarViewer（Three.js シーン）初期化
const canvas = document.getElementById('avatar-canvas');
if (canvas) {
  initAvatarViewer(canvas);
}

// FileUploader 初期化
const fileUploaderSection = document.getElementById('file-uploader-section');
if (fileUploaderSection) {
  initFileUploader(fileUploaderSection);
}

// CardLayout 初期化（cardState 購読・モード切り替え）
initCardLayout();

// ProfileForm 初期化
const profileFormSection = document.getElementById('profile-form-section');
if (profileFormSection) {
  initProfileForm(profileFormSection);
}

// SnsLinks 初期化
const snsLinksSection = document.getElementById('sns-links-section');
if (snsLinksSection) {
  initSnsLinks(snsLinksSection);
}

// ThemeSelector 初期化
const themeSelectorSection = document.getElementById('theme-selector-section');
if (themeSelectorSection) {
  initThemeSelector(themeSelectorSection);
}

// QRCodePanel 初期化
const qrPanelSection = document.getElementById('qr-panel-section');
if (qrPanelSection) {
  initQRCodePanel(qrPanelSection);

  // プレビューモードに切り替えるたびに QR を再生成
  document.getElementById('btn-to-preview')?.addEventListener('click', () => {
    refreshQR(qrPanelSection);
  });
}

// ReceivePanel 初期化
const receiveMode = document.getElementById('receive-mode');
if (receiveMode) {
  initReceivePanel(receiveMode);
}

// JSON エクスポートボタン
document.getElementById('btn-export-json')?.addEventListener('click', () => {
  exportCard(getState());
});

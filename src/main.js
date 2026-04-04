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
import { signInWithGoogle, signInWithX, signOut, getCurrentUser, onAuthStateChange } from './auth.js';

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

// ============================================================
// 認証ウィジェット
// ============================================================

function updateAuthUI(user) {
  const guestEl  = document.getElementById('auth-guest');
  const userEl   = document.getElementById('auth-user');
  const nameEl   = document.getElementById('auth-name');
  const avatarEl = document.getElementById('auth-avatar');

  if (user) {
    const displayName = user.user_metadata?.full_name
      ?? user.user_metadata?.name
      ?? user.email
      ?? user.id.slice(0, 8);
    const avatarUrl = user.user_metadata?.avatar_url ?? '';

    if (nameEl)   nameEl.textContent = displayName;
    if (avatarEl) {
      avatarEl.src = avatarUrl;
      avatarEl.style.display = avatarUrl ? '' : 'none';
    }
    guestEl?.classList.add('hidden');
    userEl?.classList.remove('hidden');
    console.log(`[Auth] ログイン済み: ${user.email ?? user.id}`);
  } else {
    guestEl?.classList.remove('hidden');
    userEl?.classList.add('hidden');
    console.log('[Auth] 未ログイン（ゲスト）');
  }
}

// ボタンイベント
document.getElementById('btn-login-google')?.addEventListener('click', () => signInWithGoogle());
document.getElementById('btn-login-x')?.addEventListener('click',      () => signInWithX());
document.getElementById('btn-logout')?.addEventListener('click', async () => {
  await signOut();
  console.log('[Auth] ログアウト済み');
});

// 初期状態を確認
getCurrentUser().then(updateAuthUI);

// 認証状態変化を監視
onAuthStateChange(updateAuthUI);

// ============================================================
// 開発時: Supabase 接続確認（Step 14）+ エンコードテスト（Step 15）
// ============================================================
if (import.meta.env.DEV) {
  // Supabase 接続確認
  import('./core/supabase.js').then(({ checkConnection }) => checkConnection());

  // エンコードテスト: モデル読み込み後に window.__testEncoder() をコンソールで実行
  import('./core/encoder.js').then(({ getEncodeStats, validateVMB }) => {
    window.__testEncoder = async () => {
      const { getMesh } = await import('./components/AvatarViewer.js');
      const mesh = getMesh();
      if (!mesh) {
        console.warn('[Test] モデルが読み込まれていません。先にモデルをアップロードしてください。');
        return;
      }
      console.log('[Test] エンコード開始...');
      const stats = await getEncodeStats(mesh);

      // フォーマット検証
      const validation = validateVMB(stats.buffer);
      console.log('[Test] VMB1 検証:', validation);

      // 統計を表示
      const { buffer: _buf, ...display } = stats;
      console.table(display);
      console.log(`[Test] 完了: ${stats.totalKB} KB のバイナリを生成`);

      // 確認用にダウンロードリンクを生成（DEV のみ）
      const blob = new Blob([stats.buffer], { type: 'application/octet-stream' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = 'test_output.vmb';
      a.textContent = `test_output.vmb をダウンロード (${stats.totalKB} KB)`;
      a.style.cssText = 'position:fixed;bottom:8px;right:8px;background:#333;color:#0ff;padding:8px 12px;border-radius:6px;z-index:9999;font-size:12px;';
      document.body.appendChild(a);
      setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 30000);

      return stats;
    };
    console.log('[Dev] Step15 テスト: モデル読み込み後に window.__testEncoder() を実行してください');
  });

  // 暗号化往復テスト（Step 16）
  import('./core/crypto.js').then(({ runRoundTripTest, generateKey, exportKeyToBase64, encrypt, decrypt, importKeyFromBase64 }) => {
    // ① 単体往復テスト（ランダム 1KB）
    window.__testCrypto = async () => {
      console.log('[Test] 暗号化往復テスト開始...');
      const result = await runRoundTripTest();
      if (result.ok) {
        console.log('%c[Test] 往復テスト OK', 'color: #0f0; font-weight: bold');
        console.table({
          originalSize:  result.originalSize  + ' bytes',
          encryptedSize: result.encryptedSize + ' bytes',
          decryptedSize: result.decryptedSize + ' bytes',
          overhead:      result.overhead      + ' bytes (IV 12 + GCM tag 16)',
          keyBase64:     result.keyBase64.slice(0, 20) + '...',
        });
      } else {
        console.error('%c[Test] 往復テスト NG:', 'color: #f00', result.error);
      }
      return result;
    };

    // ② エンコード済み VMB1 バイナリを暗号化→復号テスト
    window.__testEncryptVMB = async () => {
      const { getMesh } = await import('./components/AvatarViewer.js');
      const { getEncodeStats, validateVMB } = await import('./core/encoder.js');
      const mesh = getMesh();
      if (!mesh) {
        console.warn('[Test] モデルが読み込まれていません');
        return;
      }

      console.log('[Test] VMB1 エンコード中...');
      const stats = await getEncodeStats(mesh);
      console.log(`[Test] VMB1 生成: ${stats.totalKB} KB`);

      console.log('[Test] AES-GCM 暗号化中...');
      const key          = await generateKey();
      const keyB64       = await exportKeyToBase64(key);
      const encBuf       = await encrypt(key, stats.buffer);
      console.log(`[Test] 暗号化完了: ${(encBuf.byteLength / 1024).toFixed(1)} KB`);

      console.log('[Test] 復号中 (インポートした鍵を使用)...');
      const importedKey  = await importKeyFromBase64(keyB64);
      const decBuf       = await decrypt(importedKey, encBuf);
      console.log(`[Test] 復号完了: ${(decBuf.byteLength / 1024).toFixed(1)} KB`);

      // VMB1 検証
      const validation = validateVMB(decBuf);
      console.log('[Test] 復号後 VMB1 検証:', validation);

      const match = stats.buffer.byteLength === decBuf.byteLength;
      console.log(
        match
          ? '%c[Test] サイズ一致 ✅'
          : '%c[Test] サイズ不一致 ❌',
        match ? 'color:#0f0;font-weight:bold' : 'color:#f00;font-weight:bold',
      );

      console.table({
        'VMB1 サイズ':     stats.totalKB            + ' KB',
        '暗号化後サイズ':  (encBuf.byteLength / 1024).toFixed(1) + ' KB',
        '復号後サイズ':    (decBuf.byteLength / 1024).toFixed(1) + ' KB',
        'VMB1 検証':       validation.valid ? 'OK' : 'NG: ' + validation.error,
        '鍵 (base64)':     keyB64.slice(0, 20) + '...',
      });

      return { keyB64, encBuf, decBuf, validation };
    };

    console.log('[Dev] Step16 テスト:');
    console.log('  window.__testCrypto()      → 暗号化往復テスト（1KB ランダムデータ）');
    console.log('  window.__testEncryptVMB()  → VMB1バイナリの暗号化→復号テスト');
  });

  // Supabase アップロード→取得往復テスト（Step 17）
  import('./core/supabase.js').then(({ uploadModel, downloadModel, saveCard, loadCard, deleteCard, checkModelSize }) => {
    window.__testSupabase = async () => {
      const { getMesh }              = await import('./components/AvatarViewer.js');
      const { encodeMesh, validateVMB } = await import('./core/encoder.js');
      const { generateKey, exportKeyToBase64, encrypt, importKeyFromBase64, decrypt } = await import('./core/crypto.js');
      const { getState }             = await import('./data/state.js');

      const mesh = getMesh();
      if (!mesh) {
        console.warn('[Test] モデルが読み込まれていません');
        return;
      }

      console.group('[Test] Step17 Supabase 往復テスト');

      // 1. エンコード
      console.log('1/7 VMB1 エンコード中...');
      const vmb1Buf = await encodeMesh(mesh);
      console.log(`    → ${(vmb1Buf.byteLength / 1024).toFixed(1)} KB`);

      // 2. ファイルサイズ警告
      const sizeWarning = checkModelSize(vmb1Buf);
      if (sizeWarning) console.warn('    ' + sizeWarning);

      // 3. 暗号化
      console.log('2/7 AES-GCM 暗号化中...');
      const key      = await generateKey();
      const keyBase64 = await exportKeyToBase64(key);
      const encBuf   = await encrypt(key, vmb1Buf);
      console.log(`    → ${(encBuf.byteLength / 1024).toFixed(1)} KB`);

      // 4. UUID 生成 + Storage アップロード
      const uuid = crypto.randomUUID();
      console.log(`3/7 Storage アップロード中... uuid=${uuid}`);
      const storagePath = await uploadModel(encBuf, uuid);
      console.log(`    → ${storagePath}`);

      // 5. DB 保存
      console.log('4/7 DB 保存中...');
      const state = getState();
      await saveCard({ uuid, state, keyBase64, modelStoragePath: storagePath });

      // 6. DB 取得
      console.log('5/7 DB 取得中...');
      const cardRow = await loadCard(uuid);
      console.log('    → name:', cardRow.name);

      // 7. Storage ダウンロード + 復号
      console.log('6/7 Storage ダウンロード中...');
      const downloadedBuf = await downloadModel(cardRow.model_storage_path);

      console.log('7/7 復号・VMB1 検証中...');
      const importedKey  = await importKeyFromBase64(cardRow.encryption_key);
      const decryptedBuf = await decrypt(importedKey, downloadedBuf);
      const validation   = validateVMB(decryptedBuf);

      // 結果サマリー
      const sizeMatch = vmb1Buf.byteLength === decryptedBuf.byteLength;
      console.log('');
      console.log(
        sizeMatch && validation.valid
          ? '%c✅ 全テスト通過'
          : '%c❌ テスト失敗',
        sizeMatch && validation.valid ? 'color:#0f0;font-weight:bold;font-size:14px' : 'color:#f00;font-weight:bold;font-size:14px',
      );
      console.table({
        'UUID':              uuid,
        'Storage パス':      storagePath,
        'VMB1 サイズ':       (vmb1Buf.byteLength / 1024).toFixed(1) + ' KB',
        '暗号化サイズ':      (encBuf.byteLength  / 1024).toFixed(1) + ' KB',
        '復号後サイズ':      (decryptedBuf.byteLength / 1024).toFixed(1) + ' KB',
        'サイズ一致':        sizeMatch   ? '✅' : '❌',
        'VMB1 検証':         validation.valid ? '✅' : '❌ ' + validation.error,
        '鍵 (先頭20文字)':  keyBase64.slice(0, 20) + '...',
      });

      // クリーンアップ（テストデータ削除）
      console.log('');
      console.log('クリーンアップ: テストデータを削除します...');
      await deleteCard(uuid);
      console.log('削除完了');
      console.groupEnd();

      return { uuid, sizeMatch, validation };
    };

    console.log('[Dev] Step17 テスト: モデル読み込み後に window.__testSupabase() を実行してください');
  });

  // デコードテスト（Step 18）
  // ローカル読み込み済みのメッシュを encode → decode してシーンと差し替え
  window.__testDecoder = async () => {
    const { getMesh, loadFromVMB } = await import('./components/AvatarViewer.js');
    const { encodeMesh }           = await import('./core/encoder.js');

    const originalMesh = getMesh();
    if (!originalMesh) {
      console.warn('[Test] モデルが読み込まれていません');
      return;
    }

    console.group('[Test] Step18 デコードテスト');

    console.log('1/3 VMB1 エンコード中...');
    const vmb1Buf = await encodeMesh(originalMesh);
    console.log(`    → ${(vmb1Buf.byteLength / 1024).toFixed(1)} KB`);

    console.log('2/3 デコード中...');
    await loadFromVMB(vmb1Buf, (p) => {
      if (p % 20 === 0) console.log(`    進捗: ${p}%`);
    });

    console.log('3/3 デコード完了 → シーンに配置済み');

    // ── マテリアル構造比較 ──
    const decodedMesh = getMesh();
    const origMats    = Array.isArray(originalMesh.material) ? originalMesh.material : [originalMesh.material];
    const decMats     = Array.isArray(decodedMesh.material)  ? decodedMesh.material  : [decodedMesh.material];

    console.group('マテリアル比較');
    console.log('元モデル材料数:', origMats.length, '/ デコード後:', decMats.length);

    console.log('=== 元モデル マテリアル ===');
    console.table(origMats.map((m, i) => ({
      idx: i, type: m.type, name: m.name ?? '', transparent: m.transparent, alphaTest: m.alphaTest ?? 0,
      hasMap: !!m.map, mapW: m.map?.image?.width ?? '-', mapH: m.map?.image?.height ?? '-',
    })));

    console.log('=== デコード後 マテリアル ===');
    console.table(decMats.map((m, i) => ({
      idx: i, type: m.type, transparent: m.transparent, alphaTest: m.alphaTest ?? 0,
      hasMap: !!m.map, mapW: m.map?.image?.width ?? '-', mapH: m.map?.image?.height ?? '-',
    })));

    // テクスチャ設定の比較（テクスチャを持つ最初のマテリアルで比較）
    const origWithMap = origMats.filter(m => m.map);
    const decWithMap  = decMats.filter(m => m.map);
    if (origWithMap.length > 0 && decWithMap.length > 0) {
      console.log('=== テクスチャ設定比較（マップ持ちの各マテリアル） ===');
      const rows = origWithMap.map((om, i) => {
        const dm = decWithMap[i];
        return {
          matIdx:       origMats.indexOf(om),
          orig_flipY:   om.map.flipY,   dec_flipY:  dm?.map.flipY,
          orig_wrapS:   om.map.wrapS,   dec_wrapS:  dm?.map.wrapS,
          orig_wrapT:   om.map.wrapT,   dec_wrapT:  dm?.map.wrapT,
          orig_cs:      om.map.colorSpace, dec_cs:  dm?.map.colorSpace,
        };
      });
      console.table(rows);
    }

    console.log('=== 元モデル グループ ===');
    console.table(originalMesh.geometry.groups.map((g, i) => ({ i, start: g.start, count: g.count, matIdx: g.materialIndex })));

    console.log('=== デコード後 グループ ===');
    console.table(decodedMesh.geometry.groups.map((g, i) => ({ i, start: g.start, count: g.count, matIdx: g.materialIndex })));
    console.groupEnd();

    console.log('%c✅ デコードテスト完了 - 画面のモデルを目視確認してください', 'color:#0f0;font-weight:bold');
    console.log('  ・元モデルとほぼ同じ見た目なら成功');
    console.log('  ・ドラッグ操作も引き続き動作します');
    console.groupEnd();
  };

  console.log('[Dev] Step18 テスト: モデル読み込み後に window.__testDecoder() を実行してください');

  // Step 19 確認用: クリーンアップなしでアップロードして UUID を返す
  window.__uploadCard = async () => {
    const { getMesh }  = await import('./components/AvatarViewer.js');
    const { encodeMesh } = await import('./core/encoder.js');
    const { generateKey, exportKeyToBase64, encrypt } = await import('./core/crypto.js');
    const { uploadModel, saveCard } = await import('./core/supabase.js');
    const { getState } = await import('./data/state.js');

    const mesh = getMesh();
    if (!mesh) { console.warn('[UploadCard] モデルが読み込まれていません'); return; }

    console.group('[UploadCard] Supabase アップロード（削除なし）');

    const vmb1Buf   = await encodeMesh(mesh);
    const key       = await generateKey();
    const keyBase64 = await exportKeyToBase64(key);
    const encBuf    = await encrypt(key, vmb1Buf);
    const uuid      = crypto.randomUUID();

    const storagePath = await uploadModel(encBuf, uuid);
    await saveCard({ uuid, state: getState(), keyBase64, modelStoragePath: storagePath });

    const url = `${window.location.origin}/card/?id=${uuid}`;
    console.log('%c✅ アップロード完了', 'color:#0f0;font-weight:bold;font-size:14px');
    console.log(`UUID: ${uuid}`);
    console.log(`%c閲覧URL: ${url}`, 'color:#0ff');
    console.log('（確認後に deleteCard(uuid) で削除してください）');
    console.groupEnd();

    return { uuid, url };
  };
  console.log('[Dev] Step19 テスト: モデル読み込み後に window.__uploadCard() を実行してください');
}

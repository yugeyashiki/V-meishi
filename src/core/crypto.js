/**
 * core/crypto.js
 * AES-GCM 暗号化 / 復号モジュール（Web Crypto API）
 *
 * ## 仕様
 * - アルゴリズム: AES-GCM 256-bit
 * - IV: 暗号化ごとに 12 bytes をランダム生成（NIST 推奨サイズ）
 * - 暗号化バイナリ構造: [iv: 12 bytes][ciphertext: N bytes]
 * - 鍵表現: base64url 文字列（Supabase DB の encryption_key カラムに保存）
 * - 復号はすべてメモリ上で完結（ディスクに書かない）
 *
 * ## 公開 API
 *   generateKey()              → Promise<CryptoKey>
 *   exportKeyToBase64(key)     → Promise<string>
 *   importKeyFromBase64(b64)   → Promise<CryptoKey>
 *   encrypt(key, plainBuffer)  → Promise<ArrayBuffer>  (IV + ciphertext)
 *   decrypt(key, encBuffer)    → Promise<ArrayBuffer>  (plaintext)
 */

// ============================================================
// 定数
// ============================================================

const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;       // bits
const IV_LENGTH  = 12;        // bytes (NIST 推奨)
const TAG_LENGTH = 128;       // bits  (GCM 認証タグ)

// ============================================================
// 鍵の生成
// ============================================================

/**
 * AES-GCM 256-bit 鍵を新規生成する
 *
 * @returns {Promise<CryptoKey>}
 */
export async function generateKey() {
  return crypto.subtle.generateKey(
    { name: ALGORITHM, length: KEY_LENGTH },
    true,              // extractable: DB 保存のためエクスポート可能にする
    ['encrypt', 'decrypt'],
  );
}

// ============================================================
// 鍵のエクスポート / インポート
// ============================================================

/**
 * CryptoKey を base64url 文字列にエクスポートする
 * Supabase DB の encryption_key カラムに保存する値
 *
 * @param {CryptoKey} key
 * @returns {Promise<string>} base64url 文字列（44文字）
 */
export async function exportKeyToBase64(key) {
  const raw = await crypto.subtle.exportKey('raw', key);
  return arrayBufferToBase64url(raw);
}

/**
 * base64url 文字列から CryptoKey をインポートする
 * Supabase DB から取得した encryption_key を復号鍵として使う
 *
 * @param {string} b64 - base64url 文字列
 * @returns {Promise<CryptoKey>}
 */
export async function importKeyFromBase64(b64) {
  const raw = base64urlToArrayBuffer(b64);
  return crypto.subtle.importKey(
    'raw',
    raw,
    { name: ALGORITHM, length: KEY_LENGTH },
    false,             // extractable: インポート後はエクスポート不要
    ['decrypt'],
  );
}

// ============================================================
// 暗号化 / 復号
// ============================================================

/**
 * ArrayBuffer を AES-GCM で暗号化する
 * 返り値は [iv (12 bytes)][ciphertext (N bytes)] の連結バイナリ
 *
 * @param {CryptoKey}    key
 * @param {ArrayBuffer}  plainBuffer - 平文データ（VMB1 バイナリ等）
 * @returns {Promise<ArrayBuffer>}
 */
export async function encrypt(key, plainBuffer) {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

  const ciphertext = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv, tagLength: TAG_LENGTH },
    key,
    plainBuffer,
  );

  // iv + ciphertext を一つの ArrayBuffer に連結
  const result = new Uint8Array(IV_LENGTH + ciphertext.byteLength);
  result.set(iv, 0);
  result.set(new Uint8Array(ciphertext), IV_LENGTH);
  return result.buffer;
}

/**
 * AES-GCM で暗号化されたバイナリを復号する
 * 入力は encrypt() の返り値形式 [iv (12 bytes)][ciphertext]
 * 復号はメモリ上のみで完結する（ファイル書き出しなし）
 *
 * @param {CryptoKey}    key
 * @param {ArrayBuffer}  encBuffer - [iv][ciphertext] 形式のバイナリ
 * @returns {Promise<ArrayBuffer>} 平文データ
 * @throws {Error} 認証タグ不一致（データ改ざん検知）または不正な鍵の場合
 */
export async function decrypt(key, encBuffer) {
  if (encBuffer.byteLength <= IV_LENGTH) {
    throw new Error('[Crypto] 暗号化データが短すぎます（IVが含まれていない可能性）');
  }

  const iv         = encBuffer.slice(0, IV_LENGTH);
  const ciphertext = encBuffer.slice(IV_LENGTH);

  try {
    return await crypto.subtle.decrypt(
      { name: ALGORITHM, iv, tagLength: TAG_LENGTH },
      key,
      ciphertext,
    );
  } catch {
    // DOMException をより分かりやすいメッセージに変換
    throw new Error('[Crypto] 復号失敗: 鍵またはデータが正しくありません（改ざん検知の可能性）');
  }
}

// ============================================================
// 往復テスト用ユーティリティ（開発・確認用）
// ============================================================

/**
 * 暗号化 → 復号の往復テストを実行する
 * Step 16 の動作確認に使用
 *
 * @param {ArrayBuffer} [testData] - テスト対象データ（省略時はランダム 1KB）
 * @returns {Promise<{
 *   ok:           boolean,
 *   originalSize: number,
 *   encryptedSize: number,
 *   decryptedSize: number,
 *   keyBase64:    string,
 *   overhead:     number,  // 暗号化後のオーバーヘッド bytes (IV + GCM tag)
 *   error?:       string,
 * }>}
 */
export async function runRoundTripTest(testData) {
  try {
    // テストデータが未指定なら 1KB のランダムバイトを用意
    if (!testData) {
      testData = crypto.getRandomValues(new Uint8Array(1024)).buffer;
    }

    // 1. 鍵生成
    const key = await generateKey();

    // 2. エクスポート → 文字列化
    const keyBase64 = await exportKeyToBase64(key);

    // 3. 暗号化
    const encryptedBuf = await encrypt(key, testData);

    // 4. 別途インポートした鍵で復号（DB から取り出す想定）
    const importedKey   = await importKeyFromBase64(keyBase64);
    const decryptedBuf  = await decrypt(importedKey, encryptedBuf);

    // 5. 原文との一致確認
    const orig = new Uint8Array(testData);
    const dec  = new Uint8Array(decryptedBuf);
    if (orig.length !== dec.length) {
      throw new Error(`サイズ不一致: original=${orig.length} decrypted=${dec.length}`);
    }
    for (let i = 0; i < orig.length; i++) {
      if (orig[i] !== dec[i]) {
        throw new Error(`バイト不一致: index=${i} original=${orig[i]} decrypted=${dec[i]}`);
      }
    }

    return {
      ok:            true,
      originalSize:  testData.byteLength,
      encryptedSize: encryptedBuf.byteLength,
      decryptedSize: decryptedBuf.byteLength,
      keyBase64,
      overhead:      encryptedBuf.byteLength - testData.byteLength,
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ============================================================
// 内部ユーティリティ: base64url ↔ ArrayBuffer
// ============================================================

/**
 * ArrayBuffer → base64url 文字列
 * URL セーフ (+→- /→_ パディングなし)
 */
function arrayBufferToBase64url(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary  = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * base64url 文字列 → ArrayBuffer
 */
function base64urlToArrayBuffer(b64url) {
  // base64url → base64 に戻す
  const b64 = b64url
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(b64url.length + (4 - b64url.length % 4) % 4, '=');

  const binary = atob(b64);
  const bytes  = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

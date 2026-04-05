/**
 * core/vrm-decoder.js
 * VRM 用の復号処理（vrm-encoder.js の対）
 *
 * VRM は VMB1 ヘッダーなしで暗号化されているため、
 * 復号後のバイナリをそのまま GLTF（GLB）として返す。
 * VMB1 パースは一切行わない。
 */

import { importKeyFromBase64, decrypt } from './crypto.js';

/**
 * 暗号化済み VRM バイナリを復号して生バイナリを返す
 *
 * @param {ArrayBuffer} encryptedData - Supabase Storage からダウンロードした暗号化バイナリ
 * @param {string}      keyBase64     - cards.encryption_key（base64url 文字列）
 * @returns {Promise<ArrayBuffer>} 復号済み VRM バイナリ（GLB 形式）
 */
export async function decryptVRM(encryptedData, keyBase64) {
  const key       = await importKeyFromBase64(keyBase64);
  const decrypted = await decrypt(key, encryptedData);
  console.log('[VRM Decoder] 復号完了:', decrypted.byteLength, 'bytes');
  return decrypted;
}

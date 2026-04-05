/**
 * core/vrm-encoder.js
 * VRM バイナリの暗号化（AES-GCM）
 *
 * MMD の VMB1 エンコードは行わず、VRM バイナリをそのまま暗号化する。
 * 鍵生成・暗号化方式は既存の crypto.js と同一（AES-GCM 256-bit）。
 */

import { generateKey, exportKeyToBase64, encrypt } from './crypto.js';

/**
 * VRM バイナリを AES-GCM で暗号化し、Supabase 保存に必要な値を返す
 *
 * @param {ArrayBuffer} vrmBuffer - VRM ファイルの生バイナリ
 * @returns {Promise<{ encBuf: ArrayBuffer, keyBase64: string }>}
 */
export async function encodeVRM(vrmBuffer) {
  const key       = await generateKey();
  const keyBase64 = await exportKeyToBase64(key);
  const encBuf    = await encrypt(key, vrmBuffer);

  const originalMB  = (vrmBuffer.byteLength  / 1024 / 1024).toFixed(1);
  const encryptedMB = (encBuf.byteLength / 1024 / 1024).toFixed(1);
  console.log(`[VRM Encoder] 暗号化完了: ${vrmBuffer.byteLength} bytes (${originalMB} MB) → ${encBuf.byteLength} bytes (${encryptedMB} MB)`);

  return { encBuf, keyBase64 };
}

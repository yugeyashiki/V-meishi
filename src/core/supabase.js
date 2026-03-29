/**
 * core/supabase.js
 * Supabase クライアント初期化 + Storage/DB 操作ユーティリティ
 *
 * ## アップロードフロー（Step 18 から呼ばれる）
 *   1. UUID を生成（crypto.randomUUID）
 *   2. uploadModel(encryptedBuf, uuid) → Storage へ保存
 *   3. saveCard({ state, keyBase64, modelStoragePath }) → DB へ保存
 *   → uuid を返す → QR コードに埋め込む
 *
 * ## 閲覧フロー（card/index.html から呼ばれる）
 *   1. loadCard(uuid) → DB からメタデータ・鍵を取得
 *   2. downloadModel(storagePath) → Storage から暗号化バイナリを取得
 *   3. 以降は crypto.js / decoder.js が担当（メモリ上で復号→描画）
 */

import { createClient } from '@supabase/supabase-js';

// ============================================================
// クライアント初期化
// ============================================================

const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('[Supabase] 環境変数 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY が設定されていません');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================================
// 定数
// ============================================================

const BUCKET          = 'model-data';
const MODEL_PATH_PREFIX = 'models';
const APP_VERSION     = '0.4.0';

/** このサイズを超えた場合に警告を返す */
const SIZE_WARN_BYTES = 20 * 1024 * 1024; // 20MB

// ============================================================
// ファイルサイズ確認
// ============================================================

/**
 * 暗号化バイナリのサイズを確認し、大きい場合は警告メッセージを返す
 *
 * @param {ArrayBuffer} buffer
 * @returns {string|null} 警告メッセージ（問題なければ null）
 */
export function checkModelSize(buffer) {
  const mb = buffer.byteLength / 1024 / 1024;
  if (buffer.byteLength > SIZE_WARN_BYTES) {
    return `⚠️ モデルデータが大きいです（${mb.toFixed(0)}MB）。アップロードに時間がかかる場合があります。`;
  }
  return null;
}

// ============================================================
// Storage: アップロード / ダウンロード
// ============================================================

/**
 * 暗号化済み VMB1 バイナリを Supabase Storage へアップロードする
 *
 * @param {ArrayBuffer} encryptedBuffer - encrypt() の返り値
 * @param {string}      uuid            - crypto.randomUUID() で生成した UUID
 * @returns {Promise<string>} Storage パス（例: "models/{uuid}.vmb"）
 * @throws {Error} アップロード失敗時
 */
export async function uploadModel(encryptedBuffer, uuid) {
  const path = `${MODEL_PATH_PREFIX}/${uuid}.vmb`;
  const blob = new Blob([encryptedBuffer], { type: 'application/octet-stream' });

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, {
      contentType: 'application/octet-stream',
      upsert: false,       // 同一 UUID の上書きを禁止
    });

  if (error) {
    throw new Error(`[Supabase] Storage アップロード失敗: ${error.message}`);
  }

  console.log(`[Supabase] アップロード完了: ${path} (${(encryptedBuffer.byteLength / 1024).toFixed(1)} KB)`);
  return path;
}

/**
 * Supabase Storage から暗号化バイナリをダウンロードする
 *
 * @param {string} storagePath - cards.model_storage_path の値
 * @returns {Promise<ArrayBuffer>} 暗号化バイナリ（decrypt() に渡す）
 * @throws {Error} ダウンロード失敗時
 */
export async function downloadModel(storagePath) {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .download(storagePath);

  if (error || !data) {
    throw new Error(`[Supabase] Storage ダウンロード失敗: ${error?.message ?? '不明なエラー'}`);
  }

  const buffer = await data.arrayBuffer();
  console.log(`[Supabase] ダウンロード完了: ${storagePath} (${(buffer.byteLength / 1024).toFixed(1)} KB)`);
  return buffer;
}

// ============================================================
// DB: cards テーブル操作
// ============================================================

/**
 * 名刺データを cards テーブルに保存する
 * UUID はクライアント側で生成して渡す（Storage パスに先に使うため）
 *
 * @param {object} params
 * @param {string}   params.uuid               - crypto.randomUUID() で生成した UUID
 * @param {object}   params.state              - getState() の返り値
 * @param {string}   params.keyBase64          - exportKeyToBase64() の返り値
 * @param {string}   params.modelStoragePath   - uploadModel() の返り値
 * @param {string}   [params.motionStoragePath] - VMD アップロード済みの場合
 * @returns {Promise<string>} 保存した UUID
 * @throws {Error} DB 保存失敗時
 */
export async function saveCard({ uuid, state, keyBase64, modelStoragePath, motionStoragePath = null }) {
  const { profile, links, theme, avatar } = state;

  const row = {
    id:                  uuid,
    name:                profile.name         || '(名前なし)',
    catchphrase:         profile.catchphrase  || null,
    organization:        profile.organization || null,
    genre:               profile.genre        || null,
    links:               links   ?? [],
    theme:               theme   ?? {},
    pose:                avatar?.pose ?? {},
    model_storage_path:  modelStoragePath,
    encryption_key:      keyBase64,
    motion_storage_path: motionStoragePath,
    app_version:         APP_VERSION,
  };

  const { error } = await supabase
    .from('cards')
    .upsert(row, { onConflict: 'id' });

  if (error) {
    throw new Error(`[Supabase] DB 保存失敗: ${error.message}`);
  }

  console.log(`[Supabase] DB 保存完了: uuid=${uuid}`);
  return uuid;
}

/**
 * UUID から名刺データ（メタデータ + 暗号化鍵）を取得する
 * 閲覧専用ページ（card/index.html）から呼ばれる
 *
 * @param {string} uuid
 * @returns {Promise<object>} cards テーブルの行オブジェクト
 * @throws {Error} 取得失敗 / 存在しない場合
 */
export async function loadCard(uuid) {
  const { data, error } = await supabase
    .from('cards')
    .select('*')
    .eq('id', uuid)
    .single();

  if (error) {
    throw new Error(`[Supabase] カード取得失敗: ${error.message}`);
  }
  if (!data) {
    throw new Error(`[Supabase] カードが見つかりません: uuid=${uuid}`);
  }

  return data;
}

/**
 * 閲覧数を 1 増やす（fire-and-forget で呼ぶ想定）
 *
 * @param {string} uuid
 * @returns {Promise<void>}
 */
export async function incrementViewCount(uuid) {
  const { error } = await supabase.rpc('increment_view_count', { card_id: uuid });
  if (error) {
    // 閲覧カウントは非クリティカル: ログのみ
    console.warn(`[Supabase] view_count 更新失敗: ${error.message}`);
  }
}

/**
 * カードを削除する（DB レコード + Storage ファイル）
 *
 * @param {string} uuid
 * @returns {Promise<void>}
 * @throws {Error} 削除失敗時
 */
export async function deleteCard(uuid) {
  // DB から model_storage_path を取得してから削除
  const { data, error: fetchErr } = await supabase
    .from('cards')
    .select('model_storage_path, motion_storage_path')
    .eq('id', uuid)
    .single();

  if (fetchErr) throw new Error(`[Supabase] 削除前取得失敗: ${fetchErr.message}`);

  // Storage 削除
  const paths = [data.model_storage_path, data.motion_storage_path].filter(Boolean);
  if (paths.length > 0) {
    const { error: storageErr } = await supabase.storage.from(BUCKET).remove(paths);
    if (storageErr) throw new Error(`[Supabase] Storage 削除失敗: ${storageErr.message}`);
  }

  // DB 削除
  const { error: dbErr } = await supabase.from('cards').delete().eq('id', uuid);
  if (dbErr) throw new Error(`[Supabase] DB 削除失敗: ${dbErr.message}`);

  console.log(`[Supabase] カード削除完了: uuid=${uuid}`);
}

// ============================================================
// 接続確認（Step 14 から継続）
// ============================================================

/**
 * Supabase の接続を確認する
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export async function checkConnection() {
  const { error } = await supabase.from('cards').select('id').limit(0);
  if (error) {
    console.error('[Supabase] 接続確認失敗:', error.message);
    return { ok: false, error: error.message };
  }
  console.log('[Supabase] 接続確認 OK');
  return { ok: true };
}

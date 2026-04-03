/**
 * config.js
 * アプリ全体で共有する定数定義
 */

export const MAX_FILE_SIZE_MB    = 50;
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

/** 運用上の目安。自動削除は未実装のため定義のみ。手動管理はSupabaseダッシュボードで行う */
export const DATA_RETENTION_DAYS = 90;

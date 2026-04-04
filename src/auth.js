/**
 * auth.js
 * Supabase Auth ユーティリティ
 *
 * Supabase クライアントは core/supabase.js のものを流用し二重初期化しない。
 */

import { supabase } from './core/supabase.js';

// ============================================================
// ログイン
// ============================================================

/** Google OAuth でログイン */
export async function signInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin },
  });
  if (error) console.error('[Auth] Googleログインエラー:', error);
}

/** X（Twitter）OAuth でログイン */
export async function signInWithX() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'twitter',
    options: { redirectTo: window.location.origin },
  });
  if (error) console.error('[Auth] Xログインエラー:', error);
}

// ============================================================
// ログアウト
// ============================================================

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) console.error('[Auth] ログアウトエラー:', error);
}

// ============================================================
// ユーザー取得 / 状態監視
// ============================================================

/** 現在のユーザーを取得する（未ログインなら null） */
export async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

/**
 * 認証状態の変化を監視する
 * @param {(user: object|null) => void} callback
 * @returns {{ data: { subscription } }} unsubscribe 用オブジェクト
 */
export function onAuthStateChange(callback) {
  return supabase.auth.onAuthStateChange((_event, session) => {
    callback(session?.user ?? null);
  });
}

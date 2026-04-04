-- ============================================================
-- フェーズ4-B Step4: 管理画面のためのマイグレーション
-- Supabase Dashboard → SQL Editor で実行する
-- ============================================================

-- 1. is_public カラムを追加（デフォルト: 公開）
ALTER TABLE cards ADD COLUMN IF NOT EXISTS is_public boolean DEFAULT true;

-- 2. 既存の SELECT ポリシーを更新（非公開は本人のみ閲覧可能）
--    Step3 で作成済みの場合は先に DROP して再作成する
DROP POLICY IF EXISTS "自分のモデルのみ参照" ON cards;

CREATE POLICY "自分のモデルのみ参照" ON cards
  FOR SELECT USING (
    auth.uid() = user_id    -- 本人は常に閲覧可能
    OR user_id IS NULL      -- 旧データ（未認証作成）は全員閲覧可能
    OR is_public = true     -- 公開カードは全員閲覧可能
  );

-- 3. UPDATE / DELETE ポリシー（既存があれば DROP して再作成）
DROP POLICY IF EXISTS "自分のモデルのみ更新" ON cards;
CREATE POLICY "自分のモデルのみ更新" ON cards
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "自分のモデルのみ削除" ON cards;
CREATE POLICY "自分のモデルのみ削除" ON cards
  FOR DELETE USING (auth.uid() = user_id);

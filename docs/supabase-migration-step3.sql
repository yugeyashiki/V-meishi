-- ============================================================
-- フェーズ4-B Step3: 名刺枚数制限のためのマイグレーション
-- Supabase Dashboard → SQL Editor で実行する
-- ============================================================

-- 1. cards テーブルに user_id カラムを追加
ALTER TABLE cards ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);

-- 2. RLS（行レベルセキュリティ）を有効化
ALTER TABLE cards ENABLE ROW LEVEL SECURITY;

-- 3. ポリシーを設定
--    既存データ（user_id IS NULL）も引き続き閲覧できるようにする

-- SELECT: 自分のカード、または user_id 未設定の既存データを参照できる
CREATE POLICY "自分のモデルのみ参照" ON cards
  FOR SELECT USING (auth.uid() = user_id OR user_id IS NULL);

-- INSERT: user_id が自分の UUID と一致する場合のみ挿入できる
CREATE POLICY "自分のモデルのみ挿入" ON cards
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- UPDATE / DELETE: 自分のカードのみ操作できる
CREATE POLICY "自分のモデルのみ更新" ON cards
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "自分のモデルのみ削除" ON cards
  FOR DELETE USING (auth.uid() = user_id);

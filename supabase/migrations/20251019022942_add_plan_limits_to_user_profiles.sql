-- ==========================================
-- user_profiles テーブルに新しいカラムを追加
-- ==========================================

-- プラン制限に関するカラムを追加
ALTER TABLE public.user_profiles 
ADD COLUMN IF NOT EXISTS max_monitors INTEGER NOT NULL DEFAULT 5,
ADD COLUMN IF NOT EXISTS min_check_interval_seconds INTEGER NOT NULL DEFAULT 3600,
ADD COLUMN IF NOT EXISTS retention_days INTEGER NOT NULL DEFAULT 7;

-- ==========================================
-- 既存ユーザーのデフォルト値を設定
-- ==========================================

-- プランに応じた制限値を設定
UPDATE public.user_profiles
SET 
  max_monitors = CASE plan
    WHEN 'free' THEN 5
    WHEN 'pro' THEN 100
    WHEN 'max' THEN 999999
    ELSE 5
  END,
  min_check_interval_seconds = CASE plan
    WHEN 'free' THEN 3600
    WHEN 'pro' THEN 60
    WHEN 'max' THEN 1
    ELSE 3600
  END,
  retention_days = CASE plan
    WHEN 'free' THEN 7
    WHEN 'pro' THEN 100
    WHEN 'max' THEN 99999
    ELSE 7
  END;

-- ==========================================
-- handle_new_user 関数を更新
-- ==========================================

-- 新規ユーザー登録時にプラン制限を含めてプロファイルを作成
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (
    id, 
    plan, 
    max_monitors, 
    min_check_interval_seconds, 
    retention_days
  )
  VALUES (
    NEW.id,
    'free',
    5,           -- freeプラン: 5監視まで
    3600,        -- freeプラン: 1時間間隔
    7            -- freeプラン: 7日保持
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 関数にコメントを追加
COMMENT ON FUNCTION public.handle_new_user() IS '新規ユーザー登録時にuser_profilesテーブルにFreeプランのレコードを自動作成（プラン制限含む）';

-- ==========================================
-- カラムにコメントを追加
-- ==========================================

COMMENT ON COLUMN public.user_profiles.max_monitors IS 'プランごとの最大監視設定数 (free:5, pro:100, max:999999)';
COMMENT ON COLUMN public.user_profiles.min_check_interval_seconds IS 'プランごとの最小チェック間隔（秒） (free:3600, pro:60, max:1)';
COMMENT ON COLUMN public.user_profiles.retention_days IS 'プランごとのデータ保持期間（日） (free:7, pro:100, max:99999)';

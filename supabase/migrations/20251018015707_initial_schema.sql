-- ==========================================
-- テーブル作成
-- ==========================================

-- ユーザープロファイル（Supabase Authと連携）
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  plan VARCHAR(10) NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'max')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 監視設定
CREATE TABLE monitors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  url TEXT NOT NULL,
  method VARCHAR(10) NOT NULL DEFAULT 'GET' CHECK (method IN ('GET', 'POST', 'PUT', 'DELETE', 'PATCH')),
  headers JSONB DEFAULT '{}',
  body TEXT,
  check_interval_seconds INTEGER NOT NULL DEFAULT 3600,
  timeout_seconds INTEGER NOT NULL DEFAULT 30,
  expected_status_code INTEGER DEFAULT 200,
  expected_body_contains TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_checked_at TIMESTAMPTZ,
  next_check_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- チェック結果履歴
CREATE TABLE check_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  monitor_id UUID NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status_code INTEGER,
  response_time_ms INTEGER,
  success BOOLEAN NOT NULL,
  error_message TEXT,
  response_body_sample TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- インシデント（ダウン検知）
CREATE TABLE incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  monitor_id UUID NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  failure_count INTEGER NOT NULL DEFAULT 1,
  last_error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 通知チャネル設定
CREATE TABLE notification_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  type VARCHAR(20) NOT NULL CHECK (type IN ('email', 'slack', 'discord', 'webhook')),
  config JSONB NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 通知履歴
CREATE TABLE notification_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES notification_channels(id) ON DELETE CASCADE,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  success BOOLEAN NOT NULL,
  error_message TEXT
);

-- ステータスページ設定
CREATE TABLE status_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  slug VARCHAR(100) NOT NULL UNIQUE,
  title VARCHAR(255) NOT NULL,
  is_public BOOLEAN NOT NULL DEFAULT false,
  monitors UUID[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==========================================
-- インデックス作成
-- ==========================================

CREATE INDEX idx_check_results_monitor_checked ON check_results(monitor_id, checked_at DESC);
CREATE INDEX idx_monitors_user_active ON monitors(user_id, is_active);
CREATE INDEX idx_monitors_next_check ON monitors(next_check_at) WHERE is_active = true;
CREATE INDEX idx_incidents_monitor_status ON incidents(monitor_id, status);
CREATE INDEX idx_status_pages_slug ON status_pages(slug);

-- ==========================================
-- RLS (Row Level Security) 有効化
-- ==========================================

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE monitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE check_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE status_pages ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- RLS ポリシー: user_profiles
-- ==========================================

-- ユーザーは自分のプロファイルのみ閲覧可能
CREATE POLICY "Users can view own profile"
  ON user_profiles FOR SELECT
  USING (auth.uid() = id);

-- ユーザーは自分のプロファイルのみ更新可能
CREATE POLICY "Users can update own profile"
  ON user_profiles FOR UPDATE
  USING (auth.uid() = id);

-- 新規ユーザー登録時に自動でプロファイル作成（トリガーで実装）
CREATE POLICY "Users can insert own profile"
  ON user_profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- ==========================================
-- RLS ポリシー: monitors
-- ==========================================

-- ユーザーは自分の監視設定のみ閲覧
CREATE POLICY "Users can view own monitors"
  ON monitors FOR SELECT
  USING (auth.uid() = user_id);

-- ユーザーは自分の監視設定を作成
CREATE POLICY "Users can insert own monitors"
  ON monitors FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ユーザーは自分の監視設定を更新
CREATE POLICY "Users can update own monitors"
  ON monitors FOR UPDATE
  USING (auth.uid() = user_id);

-- ユーザーは自分の監視設定を削除
CREATE POLICY "Users can delete own monitors"
  ON monitors FOR DELETE
  USING (auth.uid() = user_id);

-- ==========================================
-- RLS ポリシー: check_results
-- ==========================================

-- ユーザーは自分の監視結果のみ閲覧
CREATE POLICY "Users can view own check results"
  ON check_results FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM monitors
      WHERE monitors.id = check_results.monitor_id
      AND monitors.user_id = auth.uid()
    )
  );

-- ==========================================
-- RLS ポリシー: incidents
-- ==========================================

-- ユーザーは自分のインシデントのみ閲覧
CREATE POLICY "Users can view own incidents"
  ON incidents FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM monitors
      WHERE monitors.id = incidents.monitor_id
      AND monitors.user_id = auth.uid()
    )
  );

-- ==========================================
-- RLS ポリシー: notification_channels
-- ==========================================

CREATE POLICY "Users can view own notification channels"
  ON notification_channels FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own notification channels"
  ON notification_channels FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own notification channels"
  ON notification_channels FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own notification channels"
  ON notification_channels FOR DELETE
  USING (auth.uid() = user_id);

-- ==========================================
-- RLS ポリシー: notification_logs
-- ==========================================

-- ユーザーは自分の通知履歴のみ閲覧
CREATE POLICY "Users can view own notification logs"
  ON notification_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM notification_channels
      WHERE notification_channels.id = notification_logs.channel_id
      AND notification_channels.user_id = auth.uid()
    )
  );

-- ==========================================
-- RLS ポリシー: status_pages
-- ==========================================

-- ユーザーは自分のステータスページのみ閲覧
CREATE POLICY "Users can view own status pages"
  ON status_pages FOR SELECT
  USING (auth.uid() = user_id);

-- 公開ステータスページは誰でも閲覧可能
CREATE POLICY "Anyone can view public status pages"
  ON status_pages FOR SELECT
  USING (is_public = true);

CREATE POLICY "Users can insert own status pages"
  ON status_pages FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own status pages"
  ON status_pages FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own status pages"
  ON status_pages FOR DELETE
  USING (auth.uid() = user_id);

-- ==========================================
-- トリガー: 新規ユーザー登録時に自動でプロファイル作成
-- ==========================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, plan)
  VALUES (NEW.id, 'free');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ==========================================
-- トリガー: updated_at の自動更新
-- ==========================================

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON monitors
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON incidents
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON notification_channels
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON status_pages
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

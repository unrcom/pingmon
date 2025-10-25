-- ==========================================
-- Pingmon seed.sql
-- ローカル開発環境用のテストデータ
-- ==========================================

-- 注意: このファイルは `supabase db reset` 実行時に自動で投入されます
-- 本番環境には適用されません

-- ==========================================
-- テスト用ユーザープロファイル
-- ==========================================

-- 注意: auth.usersへのユーザー追加は、Supabase Studioから手動で行う必要があります
-- または、以下のユーザーIDを使用する場合は、事前にSupabase Authでユーザーを作成してください

-- テストユーザー1: Freeプラン
INSERT INTO public.user_profiles (id, plan, max_monitors, min_check_interval_seconds, retention_days) VALUES
  ('00000000-0000-0000-0000-000000000001', 'free', 5, 3600, 7);

-- テストユーザー2: Proプラン
INSERT INTO public.user_profiles (id, plan, max_monitors, min_check_interval_seconds, retention_days) VALUES
  ('00000000-0000-0000-0000-000000000002', 'pro', 100, 60, 100);

-- テストユーザー3: Maxプラン
INSERT INTO public.user_profiles (id, plan, max_monitors, min_check_interval_seconds, retention_days) VALUES
  ('00000000-0000-0000-0000-000000000003', 'max', 999999, 1, 99999);

-- ==========================================
-- テスト用監視設定
-- ==========================================

-- Freeユーザーの監視設定（Google Health Check）
INSERT INTO public.monitors (
  id,
  user_id,
  name,
  url,
  method,
  check_interval_seconds,
  timeout_seconds,
  expected_status_code,
  is_active,
  next_check_at
) VALUES
  (
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000001',
    'Google Health Check',
    'https://www.google.com',
    'GET',
    3600,  -- 1時間間隔
    30,
    200,
    true,
    NOW()
  );

-- Freeユーザーの監視設定（GitHub API）
INSERT INTO public.monitors (
  id,
  user_id,
  name,
  url,
  method,
  check_interval_seconds,
  timeout_seconds,
  expected_status_code,
  is_active,
  next_check_at
) VALUES
  (
    '00000000-0000-0000-0000-000000000102',
    '00000000-0000-0000-0000-000000000001',
    'GitHub API Status',
    'https://api.github.com',
    'GET',
    3600,
    30,
    200,
    true,
    NOW() + interval '5 minutes'
  );

-- Proユーザーの監視設定（高頻度チェック）
INSERT INTO public.monitors (
  id,
  user_id,
  name,
  url,
  method,
  check_interval_seconds,
  timeout_seconds,
  expected_status_code,
  expected_body_contains,
  is_active,
  next_check_at
) VALUES
  (
    '00000000-0000-0000-0000-000000000201',
    '00000000-0000-0000-0000-000000000002',
    'Supabase Status',
    'https://status.supabase.com/api/v2/status.json',
    'GET',
    60,  -- 1分間隔
    30,
    200,
    'operational',
    true,
    NOW()
  );

-- Proユーザーの監視設定（POSTリクエスト）
INSERT INTO public.monitors (
  id,
  user_id,
  name,
  url,
  method,
  headers,
  body,
  check_interval_seconds,
  timeout_seconds,
  expected_status_code,
  is_active,
  next_check_at
) VALUES
  (
    '00000000-0000-0000-0000-000000000202',
    '00000000-0000-0000-0000-000000000002',
    'JSONPlaceholder API Test',
    'https://jsonplaceholder.typicode.com/posts',
    'POST',
    '{"Content-Type": "application/json"}',
    '{"title": "test", "body": "test body", "userId": 1}',
    300,  -- 5分間隔
    30,
    201,
    true,
    NOW() + interval '2 minutes'
  );

-- ==========================================
-- テスト用通知チャネル
-- ==========================================

-- Freeユーザーのメール通知
INSERT INTO public.notification_channels (
  id,
  user_id,
  type,
  config,
  is_active
) VALUES
  (
    '00000000-0000-0000-0000-000000000301',
    '00000000-0000-0000-0000-000000000001',
    'email',
    '{"email": "test@example.com"}',
    true
  );

-- Proユーザーの Slack 通知
INSERT INTO public.notification_channels (
  id,
  user_id,
  type,
  config,
  is_active
) VALUES
  (
    '00000000-0000-0000-0000-000000000401',
    '00000000-0000-0000-0000-000000000002',
    'slack',
    '{"webhook_url": "https://hooks.slack.com/services/TEST/TEST/TEST"}',
    true
  );

-- ==========================================
-- テスト用ステータスページ
-- ==========================================

-- Freeユーザーのステータスページ（非公開）
INSERT INTO public.status_pages (
  id,
  user_id,
  slug,
  title,
  is_public,
  monitors
) VALUES
  (
    '00000000-0000-0000-0000-000000000501',
    '00000000-0000-0000-0000-000000000001',
    'my-services',
    'My Services Status',
    false,
    ARRAY['00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000102']::uuid[]
  );

-- Proユーザーのステータスページ（公開）
INSERT INTO public.status_pages (
  id,
  user_id,
  slug,
  title,
  is_public,
  monitors
) VALUES
  (
    '00000000-0000-0000-0000-000000000601',
    '00000000-0000-0000-0000-000000000002',
    'public-status',
    'Public API Status',
    true,
    ARRAY['00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000202']::uuid[]
  );

-- ==========================================
-- 完了メッセージ
-- ==========================================

-- ローカル開発環境のセットアップが完了しました
-- 以下のテストデータが投入されています：
-- - ユーザープロファイル: 3件（free, pro, max）
-- - 監視設定: 4件
-- - 通知チャネル: 2件
-- - ステータスページ: 2件

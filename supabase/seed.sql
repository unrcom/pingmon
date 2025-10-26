-- ==========================================
-- Pingmon seed.sql
-- ローカル開発環境用のテストデータ
-- ==========================================

-- 注意: このファイルは `supabase db reset` 実行時に自動で投入されます
-- 本番環境には適用されません

-- ==========================================
-- 重要: auth.users への直接INSERTは非推奨
-- ==========================================
-- テストユーザーは Supabase Studio から手動で作成してください：
-- 1. http://localhost:54323 を開く
-- 2. Authentication > Users > Add User
-- 3. 以下のメールアドレスとパスワードでユーザーを作成
--    - test1@example.com / password123 (Freeプラン)
--    - test2@example.com / password123 (Proプラン)
--    - test3@example.com / password123 (Maxプラン)
-- 4. user_profiles は handle_new_user トリガーで自動作成されます
-- 5. 作成後、以下のコメントを解除してテストデータを投入できます

-- ==========================================
-- テスト用監視設定（使用時はコメント解除）
-- ==========================================

/*
-- Freeユーザーの監視設定（Google Health Check）
-- 注意: user_id を実際に作成したユーザーのIDに置き換えてください
INSERT INTO public.monitors (
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
    '実際のuser_idに置き換え',
    'Google Health Check',
    'https://www.google.com',
    'GET',
    3600,
    30,
    200,
    true,
    NOW()
  );

-- Freeユーザーの監視設定（GitHub API）
INSERT INTO public.monitors (
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
    '実際のuser_idに置き換え',
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
    '実際のuser_idに置き換え',
    'Supabase Status',
    'https://status.supabase.com/api/v2/status.json',
    'GET',
    60,
    30,
    200,
    'operational',
    true,
    NOW()
  );

-- Proユーザーの監視設定（POSTリクエスト）
INSERT INTO public.monitors (
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
    '実際のuser_idに置き換え',
    'JSONPlaceholder API Test',
    'https://jsonplaceholder.typicode.com/posts',
    'POST',
    '{"Content-Type": "application/json"}',
    '{"title": "test", "body": "test body", "userId": 1}',
    300,
    30,
    201,
    true,
    NOW() + interval '2 minutes'
  );
*/

-- ==========================================
-- テスト用通知チャネル（使用時はコメント解除）
-- ==========================================

/*
-- Freeユーザーのメール通知
INSERT INTO public.notification_channels (
  user_id,
  type,
  config,
  is_active
) VALUES
  (
    '実際のuser_idに置き換え',
    'email',
    '{"email": "test@example.com"}',
    true
  );

-- Proユーザーの Slack 通知
INSERT INTO public.notification_channels (
  user_id,
  type,
  config,
  is_active
) VALUES
  (
    '実際のuser_idに置き換え',
    'slack',
    '{"webhook_url": "https://hooks.slack.com/services/TEST/TEST/TEST"}',
    true
  );
*/

-- ==========================================
-- テスト用ステータスページ（使用時はコメント解除）
-- ==========================================

/*
-- Freeユーザーのステータスページ（非公開）
-- 注意: monitors 配列には実際に作成した監視設定のIDを指定してください
INSERT INTO public.status_pages (
  user_id,
  slug,
  title,
  is_public,
  monitors
) VALUES
  (
    '実際のuser_idに置き換え',
    'my-services',
    'My Services Status',
    false,
    ARRAY['監視設定ID1', '監視設定ID2']::uuid[]
  );

-- Proユーザーのステータスページ（公開）
INSERT INTO public.status_pages (
  user_id,
  slug,
  title,
  is_public,
  monitors
) VALUES
  (
    '実際のuser_idに置き換え',
    'public-status',
    'Public API Status',
    true,
    ARRAY['監視設定ID1', '監視設定ID2']::uuid[]
  );
*/

-- ==========================================
-- テストデータ投入の推奨手順
-- ==========================================

-- 1. Supabase Studio (http://localhost:54323) でテストユーザーを作成
-- 2. 作成したユーザーのIDを確認（Authentication > Users）
-- 3. 上記のコメントアウトされたSQL内の 'user_id' を実際のIDに置き換え
-- 4. 必要な部分のコメントを解除
-- 5. supabase db reset を実行してデータ投入

-- または、Supabase Studio の Table Editor から手動でデータを追加することもできます

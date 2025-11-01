# Pingmon データベース設計書

**プロジェクト**: Pingmon - RestfulAPI 監視 SaaS  
**データベース**: Supabase PostgreSQL  
**リージョン**: ap-northeast-1（東京）  
**最終更新**: 2025-10-30

---

## 📋 目次

1. [テーブル一覧](#テーブル一覧)
2. [テーブル詳細定義](#テーブル詳細定義)
3. [リレーション図](#リレーション図)
4. [RLS ポリシー](#rlsポリシー)
5. [インデックス](#インデックス)
6. [関数とトリガー](#関数とトリガー)
7. [よくある間違い](#よくある間違い)
8. [使用例](#使用例)

---

## テーブル一覧

| テーブル名                | 説明                      | 主キー    | 外部キー                                 |
| ------------------------- | ------------------------- | --------- | ---------------------------------------- |
| `user_profiles`           | ユーザープロファイル      | id (UUID) | auth.users(id)                           |
| `monitors`                | 監視設定                  | id (UUID) | user_profiles(id)                        |
| `check_results`           | チェック結果履歴          | id (UUID) | monitors(id)                             |
| `incidents`               | インシデント管理          | id (UUID) | monitors(id)                             |
| `notification_channels`   | 通知チャネル設定          | id (UUID) | user_profiles(id)                        |
| `notification_logs`       | 通知履歴                  | id (UUID) | incidents(id), notification_channels(id) |
| `status_pages`            | 公開ステータスページ      | id (UUID) | user_profiles(id)                        |
| `workers`                 | Worker 情報管理           | id (TEXT) | なし                                     |
| `monitor_worker_schedule` | Worker 別監視スケジュール | 複合キー  | monitors(id), workers(id)                |

---

## テーブル詳細定義

### user_profiles

ユーザープロファイル（Supabase Auth と連携）

```sql
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  plan VARCHAR(10) NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'max')),
  max_monitors INTEGER NOT NULL DEFAULT 5,
  min_check_interval_seconds INTEGER NOT NULL DEFAULT 3600,
  retention_days INTEGER NOT NULL DEFAULT 7,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**⚠️ 重要**: 主キーは `id` です（`user_id` ではありません）

**カラム説明**:

- `id`: ユーザー ID（auth.users.id と同一）
- `plan`: プラン種別（free/pro/max）
- `max_monitors`: プランごとの最大監視設定数
- `min_check_interval_seconds`: プランごとの最小チェック間隔（秒）
- `retention_days`: プランごとのデータ保持期間（日）

**プラン別制限**:
| プラン | 最大監視数 | 最小チェック間隔 | データ保持期間 |
|--------|-----------|----------------|--------------|
| free | 5 | 3600 秒 (1 時間) | 7 日 |
| pro | 100 | 60 秒 (1 分) | 100 日 |
| max | 999999 | 1 秒 | 99999 日 |

---

### monitors

監視設定

```sql
CREATE TABLE monitors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  url TEXT NOT NULL,
  method VARCHAR(10) NOT NULL DEFAULT 'GET' CHECK (method IN ('GET', 'POST', 'PUT', 'DELETE', 'PATCH')),
  headers JSONB DEFAULT '{}',
  body TEXT,
  timeout_seconds INTEGER NOT NULL DEFAULT 30,
  expected_status_code INTEGER DEFAULT 200,
  expected_body_contains TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_checked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**カラム説明**:

- `user_id`: ユーザー ID（user_profiles.id への参照）
- `name`: 監視設定名
- `url`: 監視対象 URL
- `method`: HTTP メソッド
- `headers`: カスタムヘッダー（JSON）
- `body`: リクエストボディ
- `timeout_seconds`: タイムアウト時間（秒）
- `expected_status_code`: 期待するステータスコード
- `expected_body_contains`: レスポンスボディに含まれるべき文字列
- `is_active`: 監視の有効/無効
- `last_checked_at`: 最後にチェックした日時

**注意**:

- ❌ `check_interval_seconds`: 削除（Worker 別スケジュールに移行）
- ❌ `next_check_at`: 削除（Worker 別スケジュールに移行）

---

### check_results

チェック結果履歴

```sql
CREATE TABLE check_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  monitor_id UUID NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status_code INTEGER,
  response_time_ms INTEGER,
  success BOOLEAN NOT NULL,
  error_message TEXT,
  response_body_sample TEXT,
  worker_id VARCHAR(50),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**カラム説明**:

- `monitor_id`: 監視設定 ID
- `checked_at`: チェック実行日時
- `status_code`: HTTP ステータスコード
- `response_time_ms`: レスポンスタイム（ミリ秒）
- `success`: チェック成功/失敗
- `error_message`: エラーメッセージ
- `response_body_sample`: レスポンスボディのサンプル
- `worker_id`: チェックを実行した Worker の識別子（例: aws-tyo1a, gcp-tyo1a, azure-tyo1）

---

### workers

Worker 情報を管理するテーブル

```sql
CREATE TABLE workers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**カラム説明**:

- `id`: Worker 識別子（例: aws-tyo1a, gcp-tyo1a, azure-tyo1）
- `name`: Worker 表示名（ダッシュボード用）
- `is_active`: Worker が有効かどうか
- `created_at`: 作成日時
- `updated_at`: 更新日時（自動更新）

**Worker ID 形式**:

```
{provider}-{short_region}{az}

例:
- aws-tyo1a  (AWS Tokyo ap-northeast-1a)
- gcp-tyo1a  (GCP Tokyo asia-northeast1-a)
- azure-tyo1 (Azure Tokyo japaneast zone 1)
```

**登録済み Worker**:
| ID | 名前 | 説明 |
|----|------|------|
| aws-tyo1a | 東京リージョン 1a (AWS) | AWS ap-northeast-1a |
| gcp-tyo1a | 東京リージョン 1a (GCP) | GCP asia-northeast1-a |
| azure-tyo1 | 東京リージョン 1 (Azure) | Azure japaneast zone 1 |

**認証方式**:

- Worker 認証は共通の API キー（`PINGMON_WORKER_API_KEY`）で行います
- Worker 識別はリクエストボディの `worker_id` フィールドで行います

---

### monitor_worker_schedule

Worker 別の監視スケジュールを管理

```sql
CREATE TABLE monitor_worker_schedule (
  monitor_id UUID NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
  worker_id TEXT NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  check_minute INTEGER NOT NULL CHECK (check_minute >= 0 AND check_minute <= 59),
  check_second INTEGER NOT NULL CHECK (check_second >= 0 AND check_second <= 59),
  check_interval_seconds INTEGER NOT NULL CHECK (check_interval_seconds > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (monitor_id, worker_id)
);
```

**カラム説明**:

- `monitor_id`: 監視設定 ID
- `worker_id`: Worker 識別子
- `check_minute`: 監視実行時刻（分: 0-59）
- `check_second`: 監視実行時刻（秒: 0-59）
- `check_interval_seconds`: 監視間隔（秒）

**スケジュール例**:

```
aws-tyo1a:   毎時 0:00, 5:00, 10:00... (5分間隔)
gcp-tyo1a:   毎時 2:00, 7:00, 12:00... (5分間隔、2分オフセット)
azure-tyo1:  毎時 4:00, 9:00, 14:00... (5分間隔、4分オフセット)
```

→ 各 Worker のリクエストが 2 分ずつズレて負荷分散

---

### incidents

インシデント管理

```sql
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
```

**カラム説明**:

- `monitor_id`: 監視設定 ID
- `started_at`: インシデント開始日時
- `resolved_at`: インシデント解決日時
- `status`: ステータス（open/resolved）
- `failure_count`: 連続失敗回数
- `last_error_message`: 最後のエラーメッセージ

---

### notification_channels

通知チャネル設定

```sql
CREATE TABLE notification_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  type VARCHAR(20) NOT NULL CHECK (type IN ('email', 'slack', 'discord', 'webhook')),
  config JSONB NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**カラム説明**:

- `user_id`: ユーザー ID
- `type`: 通知タイプ（email/slack/discord/webhook）
- `config`: 通知設定（JSON）
- `is_active`: 有効/無効

**config 例**:

```json
// Email
{
  "email": "user@example.com"
}

// Slack
{
  "webhook_url": "https://hooks.slack.com/services/..."
}

// Discord
{
  "webhook_url": "https://discord.com/api/webhooks/..."
}

// Webhook
{
  "url": "https://api.example.com/webhook",
  "headers": {
    "Authorization": "Bearer token"
  }
}
```

---

### notification_logs

通知履歴

```sql
CREATE TABLE notification_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES notification_channels(id) ON DELETE CASCADE,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  success BOOLEAN NOT NULL,
  error_message TEXT
);
```

**カラム説明**:

- `incident_id`: インシデント ID
- `channel_id`: 通知チャネル ID
- `sent_at`: 送信日時
- `success`: 送信成功/失敗
- `error_message`: エラーメッセージ

---

### status_pages

公開ステータスページ

```sql
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
```

**カラム説明**:

- `user_id`: ユーザー ID
- `slug`: URL スラッグ（一意）
- `title`: ページタイトル
- `is_public`: 公開/非公開
- `monitors`: 表示する監視設定の ID リスト（配列）

---

## リレーション図

```
auth.users (Supabase Auth)
    ↓ (1:1)
user_profiles
    ↓ (1:N)
    ├─→ monitors
    │      ↓ (1:N)
    │      ├─→ check_results
    │      ├─→ incidents
    │      │      ↓ (1:N)
    │      │   notification_logs
    │      │      ↑
    │      └─→ monitor_worker_schedule
    │             ↓ (N:1)
    │          workers
    ├─→ notification_channels ─┘
    └─→ status_pages
```

---

## RLS ポリシー

全てのテーブルで Row Level Security (RLS) が有効化されています。

### 基本原則

- ✅ ユーザーは**自分のデータのみ**アクセス可能
- ✅ 公開ステータスページは**誰でも閲覧可能**
- ✅ auth.uid() でログインユーザーを識別

### 主要ポリシー

#### user_profiles

- SELECT: 自分のプロファイルのみ閲覧
- UPDATE: 自分のプロファイルのみ更新
- INSERT: 自分のプロファイルのみ作成

#### monitors

- SELECT/INSERT/UPDATE/DELETE: 自分の監視設定のみ

#### check_results, incidents, notification_logs

- SELECT: 自分が所有する監視設定に紐づくデータのみ

#### status_pages

- SELECT: 自分のページ **または** 公開ページ
- INSERT/UPDATE/DELETE: 自分のページのみ

#### workers

- SELECT: 全ユーザーが閲覧可能

#### monitor_worker_schedule

- SELECT/INSERT/UPDATE/DELETE: 自分が所有する監視設定のスケジュールのみ

---

## インデックス

パフォーマンス最適化のために以下のインデックスが作成されています：

```sql
-- チェック結果の時系列検索
CREATE INDEX idx_check_results_monitor_checked
  ON check_results(monitor_id, checked_at DESC);

-- Worker別の分析用
CREATE INDEX idx_check_results_worker
  ON check_results(worker_id, checked_at DESC);

-- 監視設定とWorker別の結果取得
CREATE INDEX idx_check_results_monitor_worker
  ON check_results(monitor_id, worker_id, checked_at DESC);

-- ユーザーごとのアクティブな監視設定
CREATE INDEX idx_monitors_user_active
  ON monitors(user_id, is_active);

-- インシデント検索
CREATE INDEX idx_incidents_monitor_status
  ON incidents(monitor_id, status);

-- ステータスページのスラッグ検索
CREATE INDEX idx_status_pages_slug
  ON status_pages(slug);

-- Workerの有効/無効検索
CREATE INDEX idx_workers_is_active
  ON workers(is_active);

-- Worker別のスケジュール検索
CREATE INDEX idx_monitor_worker_schedule_worker_id
  ON monitor_worker_schedule(worker_id);

CREATE INDEX idx_monitor_worker_schedule_monitor_id
  ON monitor_worker_schedule(monitor_id);
```

---

## 関数とトリガー

### handle_new_user()

新規ユーザー登録時に自動で user_profiles レコードを作成

```sql
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
    5,
    3600,
    7
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

### handle_updated_at()

updated_at カラムを自動更新

```sql
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 以下のテーブルに適用
-- user_profiles, monitors, incidents, notification_channels, status_pages,
-- workers, monitor_worker_schedule
```

---

## よくある間違い

### ❌ 間違い 1: user_profiles.user_id を参照

```typescript
// ❌ 間違い
const { data } = await supabase
  .from("user_profiles")
  .select("*")
  .eq("user_id", user.id); // user_id カラムは存在しません！
```

```typescript
// ✅ 正しい
const { data } = await supabase
  .from("user_profiles")
  .select("*")
  .eq("id", user.id);
```

### ❌ 間違い 2: RLS ポリシーを無視

Supabase Client からは自動的に RLS が適用されますが、サーバーサイドで直接 SQL を実行する場合は注意が必要です。

```typescript
// ❌ 危険（RLSをバイパス）
const { data } = await supabaseAdmin.from("monitors").select("*"); // 全ユーザーのデータが取得される

// ✅ 安全
const { data } = await supabase.from("monitors").select("*"); // 自動的にログインユーザーのデータのみ
```

### ❌ 間違い 3: 外部キー関係の混同

```typescript
// ❌ 間違い
const { data } = await supabase.from("monitors").select("*").eq("id", user.id); // monitors.id ≠ user.id

// ✅ 正しい
const { data } = await supabase
  .from("monitors")
  .select("*")
  .eq("user_id", user.id);
```

---

## 使用例

### ユーザープロファイルの取得

```typescript
const { data: profile } = await supabase
  .from("user_profiles")
  .select("*")
  .eq("id", user.id)
  .single();

console.log(profile.plan); // 'free' | 'pro' | 'max'
console.log(profile.max_monitors); // 5 | 100 | 999999
```

### 監視設定の作成

```typescript
const { data: monitor } = await supabase
  .from("monitors")
  .insert({
    user_id: user.id,
    name: "My API",
    url: "https://api.example.com/health",
    method: "GET",
    expected_status_code: 200,
  })
  .select()
  .single();
```

### チェック結果の取得（最新 10 件）

```typescript
const { data: results } = await supabase
  .from("check_results")
  .select("*, monitors(name, url)")
  .eq("monitor_id", monitorId)
  .order("checked_at", { ascending: false })
  .limit(10);
```

### Worker 別のチェック結果取得

```typescript
const { data: results } = await supabase
  .from("check_results")
  .select("*")
  .eq("monitor_id", monitorId)
  .eq("worker_id", "aws-tyo1a")
  .order("checked_at", { ascending: false })
  .limit(10);
```

### インシデントの検索（未解決のみ）

```typescript
const { data: openIncidents } = await supabase
  .from("incidents")
  .select(
    `
    *,
    monitors (
      name,
      url
    )
  `
  )
  .eq("status", "open")
  .order("started_at", { ascending: false });
```

### 公開ステータスページの取得

```typescript
// RLS により is_public=true のページのみ取得される
const { data: statusPage } = await supabase
  .from("status_pages")
  .select(
    `
    *,
    user_profiles (
      plan
    )
  `
  )
  .eq("slug", "my-status-page")
  .single();
```

---

## マイグレーション履歴

| 日付       | ファイル名                                            | 内容                                          |
| ---------- | ----------------------------------------------------- | --------------------------------------------- |
| 2025-10-18 | `20251018015707_initial_schema.sql`                   | 初期スキーマ作成                              |
| 2025-10-19 | `20251019022942_add_plan_limits_to_user_profiles.sql` | プラン制限カラム追加                          |
| 2025-10-25 | `20251025094051_add_worker_id_to_check_results.sql`   | check_results に worker_id 追加               |
| 2025-10-26 | `20251026024028_worker_schedule_redesign.sql`         | workers, monitor_worker_schedule テーブル作成 |
| 2025-10-30 | `20251030232315_workers_table_redesign_az.sql`        | workers テーブル再設計（AZ 対応、構造簡素化） |

---

## 参考リンク

- [Supabase ドキュメント](https://supabase.com/docs)
- [PostgreSQL ドキュメント](https://www.postgresql.org/docs/)
- [Row Level Security](https://supabase.com/docs/guides/auth/row-level-security)

---

**メンテナンス**: このドキュメントはマイグレーション適用時に更新してください。

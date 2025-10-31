# Edge Functions インターフェース定義書

**プロジェクト:** Pingmon Worker System  
**バージョン:** 1.1.0  
**最終更新:** 2025-10-26  
**担当:** Worker 開発チーム

---

## 目次

1. [共通仕様](#共通仕様)
2. [batch-save-results](#batch-save-results)
3. [get-monitors-to-check](#get-monitors-to-check)

---

## 共通仕様

### ベース URL

```
https://<YOUR_PROJECT_ID>.supabase.co/functions/v1
```

### 認証

すべてのエンドポイントで以下のヘッダーが必要：

```
X-Pingmon-API-Key: <YOUR_PINGMON_WORKER_API_KEY>
```

**認証方式:**

- 全 Worker 共通の API キー（Supabase Secret: `PINGMON_WORKER_API_KEY`）
- Worker 識別はリクエストボディの `worker_id` フィールドで行う

### HTTP メソッド

すべてのエンドポイントは **POST** メソッドを使用

### レスポンス形式

#### 成功レスポンス

```json
{
  "success": true,
  "data": {
    // エンドポイント固有のデータ
  }
}
```

#### エラーレスポンス

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable error message"
  }
}
```

### 共通エラーコード

| コード            | HTTP ステータス | 説明                      |
| ----------------- | --------------- | ------------------------- |
| `UNAUTHORIZED`    | 401             | API キーが無効または欠落  |
| `WORKER_INACTIVE` | 403             | Worker が無効化されている |
| `INVALID_REQUEST` | 400             | リクエストボディが不正    |
| `INTERNAL_ERROR`  | 500             | サーバー内部エラー        |

---

## batch-save-results

**実装状況:** ✅ 完成済み

### 概要

Worker から送信された監視チェック結果をバッチ保存する。

### エンドポイント

```
POST /batch-save-results
```

### リクエスト

#### ヘッダー

```
X-Pingmon-API-Key: <YOUR_PINGMON_WORKER_API_KEY>
Content-Type: application/json
```

#### ボディ

```typescript
{
  "check_results": [
    {
      "monitor_id": string,              // UUID形式
      "checked_at": string,              // ISO 8601形式 (例: "2025-10-26T10:00:00.000Z")
      "status_code": number | null,      // HTTPステータスコード (例: 200, 404, 500)
      "response_time_ms": number | null, // レスポンスタイム (ミリ秒)
      "success": boolean,                // チェック成功/失敗
      "error_message": string | null,    // エラーメッセージ（失敗時）
      "response_body_sample": string | null, // レスポンスボディのサンプル（先頭500文字程度）
      "worker_id": string                // Worker識別子 (例: "aws-tyo1a")
    }
  ]
}
```

#### バリデーション

- `check_results`: 必須、配列、1 件以上 1000 件以下
- `monitor_id`: 必須、UUID 形式
- `checked_at`: 必須、ISO 8601 形式
- `success`: 必須、boolean
- `worker_id`: 必須、文字列

### レスポンス

#### 成功 (200 OK)

```json
{
  "success": true,
  "inserted": 15
}
```

| フィールド | 型     | 説明           |
| ---------- | ------ | -------------- |
| `inserted` | number | 保存された件数 |

#### エラー

**400 Bad Request - 不正なリクエスト**

```json
{
  "error": "check_results must be a non-empty array"
}
```

**400 Bad Request - 件数超過**

```json
{
  "error": "Too many results. Maximum 1000 per request."
}
```

**400 Bad Request - 必須フィールド欠落**

```json
{
  "error": "Invalid check_result format. Required: monitor_id, worker_id, success"
}
```

**401 Unauthorized - 認証失敗**

```json
{
  "error": "Unauthorized"
}
```

**500 Internal Server Error - DB 保存失敗**

```json
{
  "error": "Database insert failed",
  "details": "詳細エラーメッセージ"
}
```

### 実装メモ

- Service Role Key を使用して RLS をバイパス
- バッチ INSERT で一括保存
- ログに `[worker_id] Successfully inserted N check results (monitors: M)` を出力

---

## get-monitors-to-check

**実装状況:** ⏳ 実装予定

### 概要

指定された Worker が監視すべき対象とスケジュール情報を取得する。

### エンドポイント

```
POST /get-monitors-to-check
```

### リクエスト

#### ヘッダー

```
X-Pingmon-API-Key: <YOUR_PINGMON_WORKER_API_KEY>
Content-Type: application/json
```

#### ボディ

```json
{
  "worker_id": "aws-tyo1a"
}
```

| フィールド  | 型     | 必須 | 説明                                                   |
| ----------- | ------ | ---- | ------------------------------------------------------ |
| `worker_id` | string | ✅   | Worker 識別子 ("aws-tyo1a", "gcp-tyo1a", "azure-tyo1") |

### レスポンス

#### 成功 (200 OK)

```json
{
  "success": true,
  "data": {
    "worker_id": "aws-tyo1a",
    "monitors": [
      {
        "monitor_id": "550e8400-e29b-41d4-a716-446655440000",
        "name": "API Health Check",
        "url": "https://api.example.com/health",
        "method": "GET",
        "headers": {
          "Authorization": "Bearer xxx",
          "User-Agent": "Pingmon/1.0"
        },
        "body": null,
        "timeout_seconds": 30,
        "expected_status_code": 200,
        "expected_body_contains": "ok",
        "check_minute": 0,
        "check_second": 0,
        "check_interval_seconds": 300
      }
    ]
  }
}
```

#### レスポンスフィールド

| フィールド                          | 型             | 必須 | 説明                                                    |
| ----------------------------------- | -------------- | ---- | ------------------------------------------------------- |
| `worker_id`                         | string         | ✅   | リクエストされた Worker 識別子                          |
| `monitors`                          | array          | ✅   | 監視対象の配列（0 件の場合は空配列）                    |
| `monitors[].monitor_id`             | string         | ✅   | 監視対象の UUID                                         |
| `monitors[].name`                   | string         | ✅   | 監視対象の名前                                          |
| `monitors[].url`                    | string         | ✅   | 監視対象の URL                                          |
| `monitors[].method`                 | string         | ✅   | HTTP メソッド ("GET", "POST", "PUT", "DELETE", "PATCH") |
| `monitors[].headers`                | object         | ✅   | カスタム HTTP ヘッダー（空の場合は`{}`）                |
| `monitors[].body`                   | string \| null | ✅   | リクエストボディ（GET の場合は null）                   |
| `monitors[].timeout_seconds`        | number         | ✅   | タイムアウト（秒）                                      |
| `monitors[].expected_status_code`   | number \| null | ✅   | 期待する HTTP ステータスコード                          |
| `monitors[].expected_body_contains` | string \| null | ✅   | レスポンスボディに含まれるべき文字列                    |
| `monitors[].check_minute`           | number         | ✅   | 監視実行時刻（分: 0-59）                                |
| `monitors[].check_second`           | number         | ✅   | 監視実行時刻（秒: 0-59）                                |
| `monitors[].check_interval_seconds` | number         | ✅   | 監視間隔（秒）                                          |

#### 監視対象が 0 件の場合

```json
{
  "success": true,
  "data": {
    "worker_id": "aws-tyo1a",
    "monitors": []
  }
}
```

#### エラー

**401 Unauthorized - API キーが無効**

```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Invalid API key"
  }
}
```

**400 Bad Request - worker_id が欠落**

```json
{
  "success": false,
  "error": {
    "code": "INVALID_REQUEST",
    "message": "worker_id is required"
  }
}
```

**403 Forbidden - Worker が無効**

```json
{
  "success": false,
  "error": {
    "code": "WORKER_INACTIVE",
    "message": "Worker is not active"
  }
}
```

**404 Not Found - Worker が存在しない**

```json
{
  "success": false,
  "error": {
    "code": "WORKER_NOT_FOUND",
    "message": "Worker not found"
  }
}
```

**500 Internal Server Error - DB 接続エラー**

```json
{
  "success": false,
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "Database connection failed"
  }
}
```

### データ取得ロジック

1. **認証チェック:**

   - `X-Pingmon-API-Key`ヘッダーと`PINGMON_WORKER_API_KEY`を照合

2. **Worker 存在確認:**

```sql
   SELECT id, is_active FROM workers WHERE id = :worker_id
```

- 存在しない場合は 404 エラー
- `is_active = false`の場合は 403 エラー

3. **監視対象取得:**

```sql
   SELECT
     m.id as monitor_id,
     m.name,
     m.url,
     m.method,
     m.headers,
     m.body,
     m.timeout_seconds,
     m.expected_status_code,
     m.expected_body_contains,
     mws.check_minute,
     mws.check_second,
     mws.check_interval_seconds
   FROM monitors m
   INNER JOIN monitor_worker_schedule mws
     ON m.id = mws.monitor_id
   WHERE mws.worker_id = :worker_id
     AND m.is_active = true
```

4. **フィルタリング条件:**
   - `monitors.is_active = true` のみ
   - `monitor_worker_schedule.worker_id`がリクエストの worker_id に一致

### 実装メモ

- Service Role Key を使用して RLS をバイパス
- JOIN で`monitors`と`monitor_worker_schedule`を結合
- `is_active = false`の監視対象は除外
- ログに `[worker_id] Returned N monitors` を出力

---

## 変更履歴

| 日付       | バージョン | 変更内容                                                                                         |
| ---------- | ---------- | ------------------------------------------------------------------------------------------------ |
| 2025-10-26 | 1.0.0      | 初版作成                                                                                         |
| 2025-10-26 | 1.1.0      | 認証方式を変更（共通 API キー方式に統一）、get-monitors-to-check のリクエストに worker_id を追加 |

---

## 付録

### 環境変数

#### Worker 側（.env）

```bash
WORKER_ID=aws-tyo1a
SUPABASE_URL=https://<YOUR_PROJECT_ID>.supabase.co
PINGMON_WORKER_API_KEY=<YOUR_PINGMON_WORKER_API_KEY>
```

#### Edge Functions（Supabase Secrets）

```
PINGMON_WORKER_API_KEY=<YOUR_PINGMON_WORKER_API_KEY>
SUPABASE_URL=https://<YOUR_PROJECT_ID>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<YOUR_SERVICE_ROLE_KEY>
```

### テスト用 curl コマンド

#### batch-save-results

```bash
curl -X POST https://<YOUR_PROJECT_ID>.supabase.co/functions/v1/batch-save-results \
  -H "X-Pingmon-API-Key: <YOUR_PINGMON_WORKER_API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "check_results": [{
      "monitor_id": "550e8400-e29b-41d4-a716-446655440000",
      "checked_at": "2025-10-26T10:00:00.000Z",
      "status_code": 200,
      "response_time_ms": 85,
      "success": true,
      "error_message": null,
      "response_body_sample": "{\"status\":\"ok\"}",
      "worker_id": "aws-tyo1a"
    }]
  }'
```

#### get-monitors-to-check

```bash
curl -X POST https://<YOUR_PROJECT_ID>.supabase.co/functions/v1/get-monitors-to-check \
  -H "X-Pingmon-API-Key: <YOUR_PINGMON_WORKER_API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "worker_id": "aws-tyo1a"
  }'
```

---

## セットアップ手順

### 1. 環境変数の設定

実際の値を取得して設定してください：

**プロジェクト ID:**

- Supabase ダッシュボード → Project Settings → General → Reference ID

**API キー:**

- Supabase ダッシュボード → Project Settings → API → `anon` `public` key

**Worker API キー:**

```bash
# 生成方法
openssl rand -base64 48 | tr -d '\n'
```

### 2. Supabase Secrets に登録

```bash
supabase secrets set PINGMON_WORKER_API_KEY=<生成したAPIキー>
```

### 3. Worker .env ファイルの作成

```bash
# worker/.env
WORKER_ID=aws-tyo1a
SUPABASE_URL=https://<YOUR_PROJECT_ID>.supabase.co
PINGMON_WORKER_API_KEY=<生成したAPIキー>
```

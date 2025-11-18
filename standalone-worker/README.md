# Pingmon Standalone Worker

Supabase依存なしの単体動作版 HTTP監視Worker

## 特徴

- **Supabase依存なし**: SQLiteでデータを永続化する完全スタンドアロン版
- **全監視機能を維持**:
  - HTTP/HTTPSステータスコード監視
  - レスポンスタイム測定
  - レスポンスボディ検証
  - カスタムヘッダー対応
  - タイムアウト設定
  - 全HTTPメソッド対応 (GET, POST, PUT, DELETE, PATCH)
- **HTTP API**: ポート8080でREST APIを提供
- **統計情報**: 成功率、平均レスポンスタイムなどの詳細統計
- **データ管理**: JSONエクスポート/インポート機能
- **自動クリーンアップ**: 古いチェック結果を自動削除
- **構造化ログ**: JSON形式の構造化ログ出力

## 技術スタック

- Deno 2.5.4+
- TypeScript
- SQLite (deno.land/x/sqlite@v3.8)
- HTTP API (Deno.serve)

## インストール

Denoがインストールされていることを確認してください：

```bash
# Denoのインストール (未インストールの場合)
curl -fsSL https://deno.land/install.sh | sh
```

## 使い方

### 1. 起動

```bash
# 開発モード (ファイル変更時に自動再起動)
deno task dev

# 本番モード
deno task start
```

### 2. 環境変数 (オプション)

```bash
# データベースファイルのパス (デフォルト: ./pingmon.db)
export DB_PATH="./pingmon.db"

# APIサーバーのポート (デフォルト: 8080)
export API_PORT=8080

# データ保持期間 (日数、デフォルト: 30)
export CLEANUP_DAYS=30

# クリーンアップ実行間隔 (時間、デフォルト: 24)
export CLEANUP_INTERVAL_HOURS=24
```

## API エンドポイント

### ヘルスチェック

```bash
# サーバーの状態確認
curl http://localhost:8080/api/health
```

### モニター管理

```bash
# 全モニター取得
curl http://localhost:8080/api/monitors

# アクティブなモニターのみ取得
curl http://localhost:8080/api/monitors?active=true

# 特定モニター取得
curl http://localhost:8080/api/monitors/{id}

# モニター作成
curl -X POST http://localhost:8080/api/monitors \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Google Health Check",
    "url": "https://www.google.com",
    "method": "GET",
    "timeout_seconds": 30,
    "expected_status_code": 200,
    "check_interval_seconds": 60
  }'

# モニター更新
curl -X PUT http://localhost:8080/api/monitors/{id} \
  -H "Content-Type: application/json" \
  -d '{
    "is_active": false
  }'

# モニター削除
curl -X DELETE http://localhost:8080/api/monitors/{id}
```

### チェック結果

```bash
# モニターのチェック結果取得
curl http://localhost:8080/api/monitors/{id}/results

# ページネーション
curl "http://localhost:8080/api/monitors/{id}/results?limit=50&offset=0"
```

### 統計情報

```bash
# システム全体の統計
curl http://localhost:8080/api/statistics

# 全モニターの統計
curl http://localhost:8080/api/statistics/monitors

# 過去7日間の統計
curl "http://localhost:8080/api/statistics/monitors?since_days=7"

# 特定モニターの統計
curl http://localhost:8080/api/statistics/monitors/{id}
```

### データエクスポート/インポート

```bash
# データエクスポート (モニター設定のみ)
curl http://localhost:8080/api/export > backup.json

# データエクスポート (チェック結果も含む)
curl "http://localhost:8080/api/export?include_results=true" > backup_full.json

# データインポート
curl -X POST http://localhost:8080/api/import \
  -H "Content-Type: application/json" \
  -d @backup.json

# データインポート (既存データを上書き)
curl -X POST http://localhost:8080/api/import \
  -H "Content-Type: application/json" \
  -d '{
    "data": {...},
    "overwrite": true
  }'
```

### メンテナンス

```bash
# 手動クリーンアップ実行 (30日以上前のデータを削除)
curl -X POST http://localhost:8080/api/cleanup \
  -H "Content-Type: application/json" \
  -d '{"days_to_keep": 30}'

# モニター設定再読み込み
curl -X POST http://localhost:8080/api/reload

# スケジューラー統計
curl http://localhost:8080/api/scheduler/stats
```

## モニター設定例

### 基本的なHTTPチェック

```json
{
  "name": "Google Health Check",
  "url": "https://www.google.com",
  "method": "GET",
  "timeout_seconds": 30,
  "expected_status_code": 200,
  "check_interval_seconds": 60
}
```

### レスポンスボディ検証

```json
{
  "name": "API Health Check",
  "url": "https://api.example.com/health",
  "method": "GET",
  "timeout_seconds": 10,
  "expected_status_code": 200,
  "expected_body_contains": "\"status\":\"ok\"",
  "check_interval_seconds": 30
}
```

### カスタムヘッダー付きPOSTリクエスト

```json
{
  "name": "API POST Check",
  "url": "https://api.example.com/endpoint",
  "method": "POST",
  "headers": {
    "Authorization": "Bearer token123",
    "Content-Type": "application/json"
  },
  "body": "{\"test\": true}",
  "timeout_seconds": 15,
  "expected_status_code": 201,
  "check_interval_seconds": 300
}
```

## データベーススキーマ

### monitors テーブル

- `id` (TEXT): モニターID (UUID)
- `name` (TEXT): モニター名
- `url` (TEXT): 監視対象URL
- `method` (TEXT): HTTPメソッド
- `headers` (TEXT): カスタムヘッダー (JSON)
- `body` (TEXT): リクエストボディ
- `timeout_seconds` (INTEGER): タイムアウト秒数
- `expected_status_code` (INTEGER): 期待するステータスコード
- `expected_body_contains` (TEXT): 期待するボディ内容
- `check_interval_seconds` (INTEGER): チェック間隔秒数
- `is_active` (INTEGER): アクティブフラグ
- `created_at` (TEXT): 作成日時
- `updated_at` (TEXT): 更新日時

### check_results テーブル

- `id` (TEXT): 結果ID (UUID)
- `monitor_id` (TEXT): モニターID
- `checked_at` (TEXT): チェック実行日時
- `status_code` (INTEGER): HTTPステータスコード
- `response_time_ms` (INTEGER): レスポンスタイム (ミリ秒)
- `success` (INTEGER): 成功フラグ
- `error_message` (TEXT): エラーメッセージ
- `response_body_sample` (TEXT): レスポンスボディサンプル (先頭500文字)
- `created_at` (TEXT): 作成日時

## 構造化ログ

全てのログはJSON形式で出力されます：

```json
{
  "timestamp": "2025-11-18T10:00:00.000Z",
  "level": "info",
  "component": "standalone-worker:scheduler",
  "message": "Check completed",
  "context": {
    "monitor_id": "550e8400-e29b-41d4-a716-446655440000",
    "monitor_name": "Google Health Check",
    "success": true,
    "status_code": 200,
    "response_time_ms": 145
  }
}
```

## トラブルシューティング

### ポートが既に使用されている

別のポートを指定してください：

```bash
API_PORT=8081 deno task start
```

### データベースファイルが見つからない

初回起動時に自動的に作成されます。手動で作成する必要はありません。

### モニターがチェックされない

1. モニターが `is_active: true` になっているか確認
2. スケジューラーが起動しているか確認: `curl http://localhost:8080/api/scheduler/stats`
3. ログを確認してエラーがないかチェック

## ライセンス

このプロジェクトは元のpingmonプロジェクトから派生した簡易版実装です。

## 元プロジェクト

- **pingmon**: https://github.com/unrcom/pingmon

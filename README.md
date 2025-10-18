# Pingmon

RestfulAPI 監視サービス - 高可用性を実現する 2 台構成の Worker システム

## 概要

Pingmon は、RestfulAPI の死活監視、レスポンスタイム測定、アラート通知を行う SaaS サービスです。

### 主な機能

- ✅ HTTP ステータスコードの監視
- ✅ レスポンスタイムの測定
- ✅ レスポンスボディの検証
- ✅ 監視結果の履歴保存
- ✅ インシデント管理
- ✅ 通知機能（Email/Slack/Discord/Webhook）
- ✅ 公開ステータスページ

### プラン

- **Free**: 5 エンドポイント、1 時間間隔、7 日保存
- **Pro**: 100 エンドポイント、60 秒間隔、100 日保存、月額 500 円
- **Max**: 個別相談（エンタープライズ向け）

## アーキテクチャ

### システム構成

```
┌─────────────┐     ┌─────────────┐
│  Worker 1   │     │  Worker 2   │
│ (Local/EC2) │     │   (EC2)     │
└──────┬──────┘     └──────┬──────┘
       │                   │
       └───────┬───────────┘
               │ PostgreSQL行ロック
               │ (FOR UPDATE SKIP LOCKED)
               ▼
    ┌──────────────────────┐
    │  Supabase PostgreSQL │
    │    (Multi-AZ)        │
    └──────────────────────┘
```

### 高可用性（HA）の実現

- **2 台の Worker が同じデータベースを監視**
- **PostgreSQL の行ロック（`FOR UPDATE SKIP LOCKED`）で競合回避**
- **片方の Worker がダウンしても、もう片方が自動的に引き継ぐ**
- **重複処理なし**

### 技術スタック

**バックエンド（Worker）:**

- [Deno](https://deno.land/) 2.5.4+
- [postgres](https://www.npmjs.com/package/postgres) 3.4.4
- TypeScript

**データベース・認証:**

- [Supabase](https://supabase.com/)
  - PostgreSQL 17
  - Row Level Security (RLS)
  - Magic Link 認証

**フロントエンド（予定）:**

- Next.js
- TypeScript
- Tailwind CSS

**インフラ:**

- AWS EC2 (t3.micro)
- Amazon Linux 2023 / Ubuntu 22.04

## セットアップ

### 前提条件

- Deno 2.5.4 以上
- Supabase アカウント
- AWS アカウント（本番環境）

### 1. Supabase プロジェクトのセットアップ

#### 1.1 プロジェクト作成

```bash
# Supabase CLIをインストール
brew install supabase/tap/supabase

# プロジェクトを初期化
mkdir pingmon
cd pingmon
supabase init

# Supabaseにログイン
supabase login

# プロジェクトを作成（またはリンク）
supabase projects create pingmon

# プロジェクトにリンク
supabase link --project-ref <YOUR_PROJECT_REF>
```

#### 1.2 データベーススキーマのマイグレーション

```bash
# マイグレーションファイルを作成
supabase migration new initial_schema

# マイグレーションファイルにスキーマSQLを記述
# supabase/migrations/YYYYMMDDHHMMSS_initial_schema.sql

# 本番環境に適用
supabase db push
```

#### 1.3 テストユーザーの作成

Supabase Dashboard → Authentication → Users → Add user から、テストユーザーを作成してください。

### 2. ローカル開発環境のセットアップ

#### 2.1 Worker のセットアップ

```bash
# workerディレクトリに移動
cd worker

# 環境変数ファイルを作成
cp .env.example .env

# .envファイルを編集
# DATABASE_URL=postgresql://postgres:[PASSWORD]@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres
code .env
```

#### 2.2 Worker の起動

```bash
# 開発モード（ファイル変更時に自動再起動）
deno task dev

# 本番モード
deno task start
```

#### 2.3 ログの永続化（エージングテスト用）

```bash
# ログディレクトリ作成
mkdir -p logs

# バックグラウンドで起動
nohup deno task start >> logs/worker.log 2>&1 &
echo $! > logs/worker.pid

# ログをリアルタイムで確認
tail -f logs/worker.log

# 停止
kill $(cat logs/worker.pid)
```

### 3. EC2 へのデプロイ

#### 3.1 EC2 インスタンスの起動

**設定:**

- AMI: Ubuntu Server 22.04 LTS
- インスタンスタイプ: t3.micro
- リージョン: ap-northeast-1（東京）
- セキュリティグループ:
  - インバウンド: SSH (22) from My IP
  - アウトバウンド: All traffic

#### 3.2 EC2 への SSH 接続

```bash
# キーペアのパーミッション設定
chmod 400 <your-key>.pem

# SSH接続
ssh -i <your-key>.pem ubuntu@<PUBLIC_IP>
```

#### 3.3 Deno のインストール

```bash
# 必要なパッケージをインストール
sudo apt update
sudo apt install -y unzip

# Denoをインストール
curl -fsSL https://deno.land/install.sh | sh

# PATHに追加（自動で設定される）
source ~/.bashrc

# バージョン確認
deno --version
```

#### 3.4 Worker ファイルのコピー

```bash
# ローカルPCから実行
cd /path/to/pingmon
scp -i <your-key>.pem -r worker/* ubuntu@<PUBLIC_IP>:~/pingmon/worker/
```

#### 3.5 EC2 で Worker を起動

```bash
# EC2で実行
cd ~/pingmon/worker

# ログディレクトリ作成
mkdir -p logs

# バックグラウンドで起動
nohup deno task start >> logs/worker.log 2>&1 &
echo $! > logs/worker.pid

# ログ確認
tail -f logs/worker.log
```

### 4. 監視設定の追加

Supabase SQL Editor で実行：

```sql
-- テスト用の監視設定を追加
INSERT INTO monitors (
  user_id,
  name,
  url,
  method,
  check_interval_seconds,
  expected_status_code,
  is_active,
  next_check_at
) VALUES (
  '<USER_ID>',
  'Test: Google',
  'https://www.google.com',
  'GET',
  60,
  200,
  true,
  NOW()
);
```

## 環境変数

### worker/.env

```bash
# Supabase Database URL
# Supabase Dashboard > Settings > Database > Connection string
DATABASE_URL=postgresql://postgres.<project-ref>:[PASSWORD]@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres
```

**⚠️ 注意:** `.env`ファイルは`.gitignore`に含めてください。

## 運用

### Worker の監視

```bash
# プロセスの確認
ps aux | grep deno

# ログの確認
tail -f logs/worker.log

# エラーの検索
grep "Error" logs/worker.log

# 成功・失敗の集計
grep "Success" logs/worker.log | wc -l
grep "Failed" logs/worker.log | wc -l
```

### フェイルオーバーのテスト

```bash
# Worker 1を停止
kill $(cat logs/worker.pid)

# Worker 2のログを確認
# → Worker 2が自動的に監視を引き継ぐ

# Worker 1を再起動
nohup deno task start >> logs/worker.log 2>&1 &
```

### systemd での常時起動（推奨）

```bash
# systemdサービスファイルを作成
sudo nano /etc/systemd/system/pingmon-worker.service
```

```ini
[Unit]
Description=Pingmon Worker
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/pingmon/worker
ExecStart=/home/ubuntu/.deno/bin/deno run --allow-net --allow-env --allow-sys --env-file worker.ts
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
# サービスを有効化
sudo systemctl enable pingmon-worker

# サービスを起動
sudo systemctl start pingmon-worker

# ステータス確認
sudo systemctl status pingmon-worker

# ログ確認
sudo journalctl -u pingmon-worker -f
```

## トラブルシューティング

### データベース接続エラー

```
Error: Tenant or user not found
```

**解決方法:**

- DATABASE_URL が正しいか確認
- パスワードが正しいか確認
- 接続文字列の形式を確認（pooler URL か直接接続か）

### 行ロックの確認

ログに以下のように表示されます：

```
[timestamp]   → Available monitors: 2
[timestamp]   → Acquired monitors: 1 (1 locked by other worker)
```

`(X locked by other worker)` が表示されれば、行ロックが正常に機能しています。

## ディレクトリ構造

```
pingmon/
├── supabase/
│   ├── config.toml
│   ├── seed.sql
│   └── migrations/
│       └── YYYYMMDDHHMMSS_initial_schema.sql
├── worker/
│   ├── types.ts           # 型定義
│   ├── db.ts              # データベース接続
│   ├── worker.ts          # メインワーカー
│   ├── deno.json          # Deno設定
│   ├── .env.example       # 環境変数テンプレート
│   ├── .env               # 環境変数（gitignore）
│   └── logs/              # ログファイル（gitignore）
├── .gitignore
└── README.md
```

## 今後の開発予定

- [ ] インシデント管理機能の実装
- [ ] Email/Slack/Discord 通知の実装
- [ ] Next.js フロントエンドの開発
- [ ] ユーザー登録・ログイン機能
- [ ] 公開ステータスページ機能
- [ ] Multi-AZ 構成（3 台以上）
- [ ] CloudWatch Logs との連携

## ライセンス

MIT

## 作者

ishi32@unremoted.com

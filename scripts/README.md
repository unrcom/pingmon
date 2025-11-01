# Scripts

Pingmon運用スクリプト集

## log-analysis.sh

Edge Functionsのログを分析して統計情報を出力します。

### 使い方
```bash
# 1. Supabase Dashboardからログをダウンロード
# 2. logs/YYYYMMDD/ に保存
# 3. スクリプト実行
./scripts/log-analysis.sh logs/20251101/get-monitors-to-check.json
```

### 出力

- `parsed.json` - 構造化ログのみ抽出
- `stats.json` - 統計情報

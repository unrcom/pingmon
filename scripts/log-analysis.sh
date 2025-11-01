#!/bin/bash

# 使い方: ./scripts/log-analysis.sh logs/20251101/get-monitors-to-check.json

if [ $# -eq 0 ]; then
  echo "Usage: $0 <log-file.json>"
  exit 1
fi

LOG_FILE=$1
DIR=$(dirname $LOG_FILE)
PARSED_FILE="${DIR}/parsed.json"
STATS_FILE="${DIR}/stats.json"

echo "📊 Analyzing logs: $LOG_FILE"

# ステップ1: 構造化ログを抽出
cat $LOG_FILE | jq -r '.[] | select(.event_message | startswith("{")) | .event_message | fromjson' > $PARSED_FILE

# ステップ2: 統計計算
cat $PARSED_FILE | jq -s '
{
  "統計期間": "直近のログデータ",
  "総リクエスト受信回数": length,
  
  "worker_id別リクエスト回数": (
    group_by(.worker_id) 
    | map({
        worker_id: (if .[0].worker_id then .[0].worker_id else "unknown" end),
        count: length
      })
  ),
  
  "レスポンスコード別回数": {
    "200": ([.[] | select(.status_code == 200)] | length),
    "400": ([.[] | select(.status_code == 400)] | length),
    "401": ([.[] | select(.status_code == 401)] | length),
    "403": ([.[] | select(.status_code == 403)] | length),
    "404": ([.[] | select(.status_code == 404)] | length),
    "500": ([.[] | select(.status_code == 500)] | length)
  },
  
  "レスポンス内容別回数": {
    "success": ([.[] | select(.response_type == "success")] | length),
    "error": ([.[] | select(.response_type == "error")] | length)
  },
  
  "エラーコード別回数": (
    [.[] | select(.error_code) | .error_code] 
    | group_by(.) 
    | map({
        error_code: .[0],
        count: length
      })
  ),
  
  "処理時間統計_ms": {
    "最大値": ([.[] | .duration_ms] | max),
    "平均値": ([.[] | .duration_ms] | add / length | round),
    "中央値": ([.[] | .duration_ms] | sort | .[length/2 | floor]),
    "最小値": ([.[] | .duration_ms] | min)
  }
}
' > $STATS_FILE

echo "✅ 完了"
echo "  - 構造化ログ: $PARSED_FILE"
echo "  - 統計結果: $STATS_FILE"
echo ""
echo "📈 統計サマリー:"
cat $STATS_FILE

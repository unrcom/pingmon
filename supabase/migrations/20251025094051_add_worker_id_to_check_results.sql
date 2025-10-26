-- ==========================================
-- Worker 3台構成対応：check_resultsにworker_id追加
-- ==========================================

-- worker_idカラムを追加
-- NULLを許可（既存データ対応）、将来的にはNOT NULLに変更可能
ALTER TABLE public.check_results 
ADD COLUMN worker_id VARCHAR(50);

-- worker_idとchecked_atの複合インデックス
-- 用途：ワーカー別のレイテンシー分析、パフォーマンス比較
CREATE INDEX idx_check_results_worker 
ON public.check_results(worker_id, checked_at DESC);

-- monitor_id、worker_id、checked_atの複合インデックス
-- 用途：特定監視設定の各ワーカーでの結果取得（詳細分析）
CREATE INDEX idx_check_results_monitor_worker 
ON public.check_results(monitor_id, worker_id, checked_at DESC);

-- カラムにコメントを追加
COMMENT ON COLUMN public.check_results.worker_id IS 'チェックを実行したWorkerの識別子 (例: aws-tokyo, gcp-tokyo, azure-tokyo)';

-- ==========================================
-- 既存データの対応
-- ==========================================

-- 既存データには worker_id がないため、NULL のまま保持
-- 新しいWorkerアーキテクチャ稼働後のデータからworker_idが記録される

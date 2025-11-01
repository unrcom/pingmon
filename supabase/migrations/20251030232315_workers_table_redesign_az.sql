-- ==========================================
-- workersテーブル再設計（シンプル版）
-- ==========================================

-- ==========================================
-- Step 1: 既存データの更新（新形式に移行）
-- ==========================================

-- check_resultsのworker_idを新形式に更新
UPDATE public.check_results 
SET worker_id = 'aws-tyo1a' 
WHERE worker_id = 'aws-tokyo';

UPDATE public.check_results 
SET worker_id = 'gcp-tyo1a' 
WHERE worker_id = 'gcp-tokyo';

UPDATE public.check_results 
SET worker_id = 'azure-tyo1' 
WHERE worker_id = 'azure-tokyo';

-- ==========================================
-- Step 2: 外部キー制約を削除
-- ==========================================

ALTER TABLE public.monitor_worker_schedule 
  DROP CONSTRAINT IF EXISTS monitor_worker_schedule_worker_id_fkey;

-- ==========================================
-- Step 3: 既存のworkersテーブルを削除
-- ==========================================

DROP TABLE IF EXISTS public.workers CASCADE;

-- ==========================================
-- Step 4: 新しいworkersテーブルを作成
-- ==========================================

CREATE TABLE public.workers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- コメント
COMMENT ON TABLE public.workers IS 'Workerマスターテーブル（リージョン・AZ対応）';
COMMENT ON COLUMN public.workers.id IS 'Worker識別子（例: aws-tyo1a, gcp-tyo1a, azure-tyo1）';
COMMENT ON COLUMN public.workers.name IS 'Worker表示名（ダッシュボード用）';
COMMENT ON COLUMN public.workers.is_active IS 'Workerが有効かどうか';

-- インデックス
CREATE INDEX idx_workers_is_active ON public.workers(is_active);

-- ==========================================
-- Step 5: updated_at自動更新トリガー
-- ==========================================

CREATE OR REPLACE FUNCTION public.update_workers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_workers_updated_at
  BEFORE UPDATE ON public.workers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_workers_updated_at();

-- ==========================================
-- Step 6: RLSポリシー設定
-- ==========================================

ALTER TABLE public.workers ENABLE ROW LEVEL SECURITY;

-- 全ユーザーがWorker一覧を閲覧可能
CREATE POLICY "workers_select_all" 
  ON public.workers 
  FOR SELECT 
  USING (true);

-- ==========================================
-- Step 7: 初期データの登録
-- ==========================================

INSERT INTO public.workers (id, name) VALUES
  ('aws-tyo1a', '東京リージョン 1a (AWS)'),
  ('gcp-tyo1a', '東京リージョン 1a (GCP)'),
  ('azure-tyo1', '東京リージョン 1 (Azure)');

-- ==========================================
-- Step 8: 外部キー制約を再設定
-- ==========================================

ALTER TABLE public.monitor_worker_schedule
  ADD CONSTRAINT monitor_worker_schedule_worker_id_fkey
  FOREIGN KEY (worker_id) REFERENCES public.workers(id) ON DELETE CASCADE;

-- ==========================================
-- 完了メッセージ
-- ==========================================

-- workersテーブル再設計が完了しました
-- 
-- 変更内容:
-- 1. check_resultsのworker_idを新形式に更新（aws-tokyo → aws-tyo1a）
-- 2. workersテーブルを簡素化（api_keyカラム削除）
-- 3. AZ情報を含むworker_id形式に変更
-- 4. 外部キー制約を再設定
-- 5. 3つのWorkerを初期データとして登録
-- 
-- 認証方式:
-- - Worker認証は共通のAPIキー（PINGMON_WORKER_API_KEY）で行います
-- - Worker識別はリクエストボディのworker_idフィールドで行います

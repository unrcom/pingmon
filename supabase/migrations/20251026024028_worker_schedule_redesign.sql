-- ==========================================
-- Worker 3台構成：テーブル再設計
-- ==========================================

-- ==========================================
-- 1. monitorsテーブルからスケジュール関連カラムを削除
-- ==========================================

-- スケジュール管理はWorker別に行うため削除
ALTER TABLE public.monitors DROP COLUMN IF EXISTS check_interval_seconds;
ALTER TABLE public.monitors DROP COLUMN IF EXISTS next_check_at;

-- インデックスも削除（存在する場合）
DROP INDEX IF EXISTS idx_monitors_next_check;

-- ==========================================
-- 2. workersテーブル（新規作成）
-- ==========================================

CREATE TABLE public.workers (
  worker_id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('active', 'stopped', 'error')),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- コメント
COMMENT ON TABLE public.workers IS 'Worker状態管理';
COMMENT ON COLUMN public.workers.worker_id IS 'Worker識別子（例: aws-tokyo, gcp-tokyo, azure-tokyo）';
COMMENT ON COLUMN public.workers.status IS 'Worker状態: active=稼働中, stopped=停止, error=エラー';
COMMENT ON COLUMN public.workers.changed_at IS 'ステータスが変化した日時';
COMMENT ON COLUMN public.workers.metadata IS '任意の追加情報（JSON形式）';

-- インデックス
CREATE INDEX idx_workers_status ON public.workers(status);
CREATE INDEX idx_workers_changed_at ON public.workers(changed_at DESC);

-- ==========================================
-- 3. monitor_worker_scheduleテーブル（新規作成）
-- ==========================================

CREATE TABLE public.monitor_worker_schedule (
  monitor_id UUID NOT NULL REFERENCES public.monitors(id) ON DELETE CASCADE,
  worker_id TEXT NOT NULL REFERENCES public.workers(worker_id) ON DELETE CASCADE,
  check_minute INTEGER NOT NULL CHECK (check_minute >= 0 AND check_minute <= 59),
  check_second INTEGER NOT NULL CHECK (check_second >= 0 AND check_second <= 59),
  check_interval_seconds INTEGER NOT NULL CHECK (check_interval_seconds > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (monitor_id, worker_id)
);

-- コメント
COMMENT ON TABLE public.monitor_worker_schedule IS 'Worker別の監視スケジュール管理';
COMMENT ON COLUMN public.monitor_worker_schedule.monitor_id IS '監視設定ID';
COMMENT ON COLUMN public.monitor_worker_schedule.worker_id IS 'Worker識別子';
COMMENT ON COLUMN public.monitor_worker_schedule.check_minute IS '監視実行時刻（分: 0-59）';
COMMENT ON COLUMN public.monitor_worker_schedule.check_second IS '監視実行時刻（秒: 0-59）';
COMMENT ON COLUMN public.monitor_worker_schedule.check_interval_seconds IS '監視間隔（秒）';

-- インデックス
CREATE INDEX idx_monitor_worker_schedule_worker_id ON public.monitor_worker_schedule(worker_id);
CREATE INDEX idx_monitor_worker_schedule_monitor_id ON public.monitor_worker_schedule(monitor_id);

-- ==========================================
-- 4. updated_at自動更新トリガー
-- ==========================================

CREATE OR REPLACE FUNCTION public.update_monitor_worker_schedule_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_monitor_worker_schedule_updated_at
  BEFORE UPDATE ON public.monitor_worker_schedule
  FOR EACH ROW
  EXECUTE FUNCTION public.update_monitor_worker_schedule_updated_at();

-- ==========================================
-- 5. RLS（Row Level Security）設定
-- ==========================================

-- workersテーブル: 全ユーザーが読み取り可能
ALTER TABLE public.workers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workers_select_all" 
  ON public.workers 
  FOR SELECT 
  USING (true);

-- monitor_worker_schedule: ユーザーは自分のmonitorのスケジュールのみ閲覧可能
ALTER TABLE public.monitor_worker_schedule ENABLE ROW LEVEL SECURITY;

CREATE POLICY "monitor_worker_schedule_select_own" 
  ON public.monitor_worker_schedule 
  FOR SELECT 
  USING (
    monitor_id IN (
      SELECT id FROM public.monitors WHERE user_id = auth.uid()
    )
  );

-- monitor_worker_schedule: ユーザーは自分のmonitorのスケジュールのみ挿入可能
CREATE POLICY "monitor_worker_schedule_insert_own" 
  ON public.monitor_worker_schedule 
  FOR INSERT 
  WITH CHECK (
    monitor_id IN (
      SELECT id FROM public.monitors WHERE user_id = auth.uid()
    )
  );

-- monitor_worker_schedule: ユーザーは自分のmonitorのスケジュールのみ更新可能
CREATE POLICY "monitor_worker_schedule_update_own" 
  ON public.monitor_worker_schedule 
  FOR UPDATE 
  USING (
    monitor_id IN (
      SELECT id FROM public.monitors WHERE user_id = auth.uid()
    )
  );

-- monitor_worker_schedule: ユーザーは自分のmonitorのスケジュールのみ削除可能
CREATE POLICY "monitor_worker_schedule_delete_own" 
  ON public.monitor_worker_schedule 
  FOR DELETE 
  USING (
    monitor_id IN (
      SELECT id FROM public.monitors WHERE user_id = auth.uid()
    )
  );

-- ==========================================
-- 6. 初期データ投入
-- ==========================================

-- 3つのWorkerを登録
INSERT INTO public.workers (worker_id, status, metadata) VALUES
  ('aws-tokyo', 'stopped', '{"region": "ap-northeast-1", "provider": "AWS"}'),
  ('gcp-tokyo', 'stopped', '{"region": "asia-northeast1", "provider": "GCP"}'),
  ('azure-tokyo', 'stopped', '{"region": "japaneast", "provider": "Azure"}');

-- ==========================================
-- 完了メッセージ
-- ==========================================

-- Worker 3台構成のテーブル再設計が完了しました
-- 
-- 変更内容:
-- 1. monitorsテーブルから check_interval_seconds, next_check_at を削除
-- 2. workersテーブルを作成（3つのWorkerを初期データとして登録）
-- 3. monitor_worker_scheduleテーブルを作成
-- 4. RLSポリシーを設定
-- 
-- 次のステップ:
-- 1. フロントエンドまたはAPIから監視設定を作成
-- 2. 各監視設定に対してWorkerスケジュールを作成
-- 3. Workerを起動してスケジュールに従って監視を実行

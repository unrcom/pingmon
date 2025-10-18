// ==========================================
// データベース型定義
// ==========================================

export interface Monitor {
  id: string;
  user_id: string;
  name: string;
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers: Record<string, string>;
  body: string | null;
  check_interval_seconds: number;
  timeout_seconds: number;
  expected_status_code: number;
  expected_body_contains: string | null;
  is_active: boolean;
  last_checked_at: string | null;
  next_check_at: string;
  created_at: string;
  updated_at: string;
}

export interface CheckResult {
  id?: string;
  monitor_id: string;
  checked_at: string;
  status_code: number | null;
  response_time_ms: number | null;
  success: boolean;
  error_message: string | null;
  response_body_sample: string | null;
  created_at?: string;
}

export interface Incident {
  id?: string;
  monitor_id: string;
  started_at: string;
  resolved_at: string | null;
  status: 'open' | 'resolved';
  failure_count: number;
  last_error_message: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface NotificationChannel {
  id: string;
  user_id: string;
  type: 'email' | 'slack' | 'discord' | 'webhook';
  config: Record<string, string>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ==========================================
// ワーカー用の型定義
// ==========================================

export interface MonitorCheckJob {
  monitor_id: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
  timeout_seconds: number;
  expected_status_code: number;
  expected_body_contains: string | null;
}

export interface CheckResultData {
  monitor_id: string;
  status_code: number | null;
  response_time_ms: number | null;
  success: boolean;
  error_message: string | null;
  response_body_sample: string | null;
}

// ==========================================
// 環境変数の型定義
// ==========================================

export interface EnvConfig {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  DATABASE_URL: string;
}

export interface CheckResult {
  monitor_id: string;
  checked_at: string;
  status_code: number | null;
  response_time_ms: number | null;
  success: boolean;
  error_message: string | null;
  response_body_sample: string | null;
  worker_id: string;
}

export interface CheckExecutionResult {
  success: boolean;
  status_code: number | null;
  response_time_ms: number | null;
  error_message: string | null;
  response_body_sample: string | null;
}

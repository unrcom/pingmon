// Monitor configuration
export interface Monitor {
  id: string;
  name: string;
  url: string;
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  headers?: Record<string, string>;
  body?: string;
  timeout_seconds: number;
  expected_status_code?: number;
  expected_body_contains?: string;
  check_interval_seconds: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Check result from monitoring
export interface CheckResult {
  id: string;
  monitor_id: string;
  checked_at: string;
  status_code: number | null;
  response_time_ms: number | null;
  success: boolean;
  error_message: string | null;
  response_body_sample: string | null;
  created_at: string;
}

// Result from HTTP check execution
export interface CheckExecutionResult {
  success: boolean;
  status_code: number | null;
  response_time_ms: number | null;
  error_message: string | null;
  response_body_sample: string | null;
}

// Statistics for a monitor
export interface MonitorStatistics {
  monitor_id: string;
  monitor_name: string;
  total_checks: number;
  successful_checks: number;
  failed_checks: number;
  success_rate: number;
  avg_response_time_ms: number | null;
  min_response_time_ms: number | null;
  max_response_time_ms: number | null;
  last_check_at: string | null;
  last_success_at: string | null;
  last_failure_at: string | null;
}

// Overall system statistics
export interface SystemStatistics {
  total_monitors: number;
  active_monitors: number;
  inactive_monitors: number;
  total_checks: number;
  total_checks_last_hour: number;
  total_checks_last_24h: number;
  overall_success_rate: number;
  avg_response_time_ms: number | null;
}

// API Request/Response types
export interface CreateMonitorRequest {
  name: string;
  url: string;
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  headers?: Record<string, string>;
  body?: string;
  timeout_seconds?: number;
  expected_status_code?: number;
  expected_body_contains?: string;
  check_interval_seconds?: number;
  is_active?: boolean;
}

export interface UpdateMonitorRequest {
  name?: string;
  url?: string;
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  headers?: Record<string, string>;
  body?: string;
  timeout_seconds?: number;
  expected_status_code?: number;
  expected_body_contains?: string;
  check_interval_seconds?: number;
  is_active?: boolean;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// Export/Import data structure
export interface ExportData {
  version: string;
  exported_at: string;
  monitors: Monitor[];
  check_results?: CheckResult[];
}

// Logger types
export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
  [key: string]: unknown;
}

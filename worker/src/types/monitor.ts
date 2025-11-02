export interface Monitor {
  monitor_id: string;
  name: string;
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers: Record<string, string>;
  body: string | null;
  timeout_seconds: number;
  expected_status_code: number | null;
  expected_body_contains: string | null;
  check_minute: number;
  check_second: number;
  check_interval_seconds: number;
}

export interface MonitorWithPlan extends Monitor {
  user_plan: 'free' | 'pro' | 'max';
}

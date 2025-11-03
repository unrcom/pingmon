export interface RunningTask {
  task_id: string;
  monitor_id: string;
  monitor_name: string;
  started_at: Date;
  timeout_ms: number;
  abort_controller: AbortController;
  onTimeout: (elapsed_ms: number) => void;
}

export interface TaskStats {
  running_count: number;
  running_tasks: Array<{
    task_id: string;
    monitor_id: string;
    monitor_name: string;
    elapsed_ms: number;
  }>;
}

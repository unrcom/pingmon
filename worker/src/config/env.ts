export interface WorkerConfig {
  workerId: string;
  supabaseUrl: string;
  apiKey: string;
  queue: QueueConfig;
  retry: RetryConfig;
  batcher: BatcherConfig;
  reload: ReloadConfig;
  task: TaskConfig; // ← 追加
}

export interface QueueConfig {
  strategy: "weighted" | "strict";
  maxConcurrent: number;
  planSettings: {
    max: PlanSettings;
    pro: PlanSettings;
    free: PlanSettings;
  };
}

export interface PlanSettings {
  jitterMaxSeconds: number;
  queueWeight: number;
}

export interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

export interface BatcherConfig {
  maxBatchSize: number;
  flushIntervalMs: number;
  maxWaitMs: number;
}

export interface ReloadConfig {
  intervalMs: number;
}

export interface TaskConfig {
  forceCancelBufferSeconds: number;
  monitorIntervalMs: number;
}

const DEFAULT_CONFIG: Omit<
  WorkerConfig,
  "workerId" | "supabaseUrl" | "apiKey"
> = {
  queue: {
    strategy: "weighted",
    maxConcurrent: 50,
    planSettings: {
      max: { jitterMaxSeconds: 5, queueWeight: 0.5 },
      pro: { jitterMaxSeconds: 30, queueWeight: 0.4 },
      free: { jitterMaxSeconds: 90, queueWeight: 0.1 },
    },
  },
  retry: {
    maxRetries: 3,
    initialDelayMs: 1000,
    maxDelayMs: 10000,
    backoffMultiplier: 2,
  },
  batcher: {
    maxBatchSize: 100,
    flushIntervalMs: 30000,
    maxWaitMs: 60000,
  },
  reload: { intervalMs: 300000 },
  task: { // ← 追加
    forceCancelBufferSeconds: 10, // デフォルト10秒
    monitorIntervalMs: 5000, // 5秒ごとに監視
  },
};

export function loadConfig(): WorkerConfig {
  const workerId = Deno.env.get("WORKER_ID");
  if (!workerId) throw new Error("WORKER_ID is required");

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!supabaseUrl) throw new Error("SUPABASE_URL is required");

  const apiKey = Deno.env.get("PINGMON_WORKER_API_KEY");
  if (!apiKey) throw new Error("PINGMON_WORKER_API_KEY is required");

  const queueStrategy = Deno.env.get("QUEUE_STRATEGY") as
    | "weighted"
    | "strict"
    | undefined;
  const maxConcurrent = parseInt(Deno.env.get("MAX_CONCURRENT_CHECKS") || "50");
  const reloadInterval = parseInt(
    Deno.env.get("RELOAD_INTERVAL_MS") || "300000",
  );

  const forceCancelBuffer = parseInt(
    Deno.env.get("FORCE_CANCEL_BUFFER_SECONDS") || "10",
  );

  return {
    workerId,
    supabaseUrl,
    apiKey,
    queue: {
      ...DEFAULT_CONFIG.queue,
      strategy: queueStrategy || DEFAULT_CONFIG.queue.strategy,
      maxConcurrent: isNaN(maxConcurrent)
        ? DEFAULT_CONFIG.queue.maxConcurrent
        : maxConcurrent,
    },
    retry: DEFAULT_CONFIG.retry,
    batcher: DEFAULT_CONFIG.batcher,
    reload: {
      intervalMs: isNaN(reloadInterval)
        ? DEFAULT_CONFIG.reload.intervalMs
        : reloadInterval,
    },
    task: { // ← 追加
      forceCancelBufferSeconds: isNaN(forceCancelBuffer)
        ? DEFAULT_CONFIG.task.forceCancelBufferSeconds
        : forceCancelBuffer,
      monitorIntervalMs: DEFAULT_CONFIG.task.monitorIntervalMs,
    },
  };
}

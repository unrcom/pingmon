import { MonitorWithPlan } from '../types/monitor.ts';
import { CheckExecutionResult } from '../types/check-result.ts';
import { Logger } from '../logger/logger.ts';
import { TaskManager } from './task-manager.ts';

export class HttpChecker {
  private readonly logger: Logger;
  private readonly taskManager: TaskManager;

  constructor(logger: Logger, taskManager: TaskManager) {
    this.logger = logger;
    this.taskManager = taskManager;
  }

  async execute(monitor: MonitorWithPlan): Promise<CheckExecutionResult> {
    const taskId = crypto.randomUUID();
    const controller = new AbortController();
    const startTime = Date.now();

    // タスクを登録
    this.taskManager.register({
      task_id: taskId,
      monitor_id: monitor.monitor_id,
      monitor_name: monitor.name,
      started_at: new Date(),
      timeout_ms: monitor.timeout_seconds * 1000,
      abort_controller: controller,
      onTimeout: (elapsed_ms: number) => {
        this.logger.error('Task was force cancelled', {
          task_id: taskId,
          monitor_id: monitor.monitor_id,
          monitor_name: monitor.name,
          elapsed_ms,
        });
      },
    });

    try {
      const fetchPromise = fetch(monitor.url, {
        method: monitor.method,
        headers: monitor.headers,
        body: monitor.body,
        signal: controller.signal,
      });

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          controller.abort();
          reject(new Error(`Request timeout after ${monitor.timeout_seconds}s`));
        }, monitor.timeout_seconds * 1000);
      });

      const response = await Promise.race([fetchPromise, timeoutPromise]);

      const responseTime = Date.now() - startTime;
      const statusCode = response.status;

      const bodyText = await response.text();
      const bodySample = bodyText.substring(0, 500);

      let success = true;
      let errorMessage: string | null = null;

      if (
        monitor.expected_status_code !== null &&
        statusCode !== monitor.expected_status_code
      ) {
        success = false;
        errorMessage = `Expected status ${monitor.expected_status_code}, got ${statusCode}`;
      }

      if (
        success &&
        monitor.expected_body_contains !== null &&
        !bodyText.includes(monitor.expected_body_contains)
      ) {
        success = false;
        errorMessage = `Expected body to contain "${monitor.expected_body_contains}"`;
      }

      this.logger.debug('Check executed', {
        task_id: taskId,
        monitor_id: monitor.monitor_id,
        monitor_name: monitor.name,
        url: monitor.url,
        status_code: statusCode,
        response_time_ms: responseTime,
        success,
      });

      // タスク完了を通知
      this.taskManager.complete(taskId);

      return {
        success,
        status_code: statusCode,
        response_time_ms: responseTime,
        error_message: errorMessage,
        response_body_sample: bodySample,
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.logger.warn('Check failed', {
        task_id: taskId,
        monitor_id: monitor.monitor_id,
        monitor_name: monitor.name,
        url: monitor.url,
        error: errorMessage,
        response_time_ms: responseTime,
      });

      // タスク完了を通知
      this.taskManager.complete(taskId);

      return {
        success: false,
        status_code: null,
        response_time_ms: responseTime,
        error_message: errorMessage,
        response_body_sample: null,
      };
    }
  }
}

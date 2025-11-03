import { RunningTask, TaskStats } from '../types/task.ts';
import { TaskConfig } from '../config/env.ts';
import { Logger } from '../logger/logger.ts';

export class TaskManager {
  private tasks = new Map<string, RunningTask>();
  private monitorInterval: number | null = null;
  private readonly config: TaskConfig;
  private readonly logger: Logger;

  constructor(config: TaskConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
  }

  start(): void {
    this.logger.info('Starting task manager', {
      force_cancel_buffer_seconds: this.config.forceCancelBufferSeconds,
      monitor_interval_ms: this.config.monitorIntervalMs,
    });

    this.monitorInterval = setInterval(() => {
      this.monitorTasks();
    }, this.config.monitorIntervalMs);
  }

  stop(): void {
    this.logger.info('Stopping task manager');

    if (this.monitorInterval !== null) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }

    // 実行中のタスクを全て強制キャンセル
    for (const [taskId, task] of this.tasks) {
      this.logger.warn('Forcing task cancellation on shutdown', {
        task_id: taskId,
        monitor_id: task.monitor_id,
      });
      task.abort_controller.abort();
    }
    this.tasks.clear();

    this.logger.info('Task manager stopped');
  }

  register(task: RunningTask): void {
    this.tasks.set(task.task_id, task);

    this.logger.debug('Task registered', {
      task_id: task.task_id,
      monitor_id: task.monitor_id,
      monitor_name: task.monitor_name,
      timeout_ms: task.timeout_ms,
    });
  }

  complete(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (task) {
      const elapsed = Date.now() - task.started_at.getTime();
      
      this.logger.debug('Task completed', {
        task_id: taskId,
        monitor_id: task.monitor_id,
        elapsed_ms: elapsed,
      });

      this.tasks.delete(taskId);
    }
  }

  private monitorTasks(): void {
    const now = Date.now();
    const tasksToCancel: string[] = [];

    for (const [taskId, task] of this.tasks) {
      const elapsed = now - task.started_at.getTime();

      // timeout_ms + buffer を超えていたら強制キャンセル
      const forceTimeout = task.timeout_ms + (this.config.forceCancelBufferSeconds * 1000);

      if (elapsed > forceTimeout) {
        this.logger.warn('Force cancelling hung task', {
          task_id: taskId,
          monitor_id: task.monitor_id,
          monitor_name: task.monitor_name,
          elapsed_ms: elapsed,
          expected_timeout_ms: task.timeout_ms,
          force_timeout_ms: forceTimeout,
        });

        task.abort_controller.abort();
        task.onTimeout(elapsed);
        tasksToCancel.push(taskId);
      }
    }

    // キャンセルしたタスクを削除
    for (const taskId of tasksToCancel) {
      this.tasks.delete(taskId);
    }

    // 長時間実行中のタスクを警告
    for (const [taskId, task] of this.tasks) {
      const elapsed = now - task.started_at.getTime();
      
      // timeout_ms の80%を超えていたら警告
      if (elapsed > task.timeout_ms * 0.8) {
        this.logger.debug('Task running longer than expected', {
          task_id: taskId,
          monitor_id: task.monitor_id,
          monitor_name: task.monitor_name,
          elapsed_ms: elapsed,
          timeout_ms: task.timeout_ms,
        });
      }
    }
  }

  getStats(): TaskStats {
    const now = Date.now();
    const runningTasks = [];

    for (const [taskId, task] of this.tasks) {
      runningTasks.push({
        task_id: taskId,
        monitor_id: task.monitor_id,
        monitor_name: task.monitor_name,
        elapsed_ms: now - task.started_at.getTime(),
      });
    }

    return {
      running_count: this.tasks.size,
      running_tasks: runningTasks,
    };
  }
}

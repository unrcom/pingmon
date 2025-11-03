import { MonitorWithPlan } from '../types/monitor.ts';
import { PriorityQueueManager, QueuedCheck } from './priority-queue.ts';
import { HttpChecker } from '../executor/http-checker.ts';
import { TaskManager } from '../executor/task-manager.ts';
import { CheckResult } from '../types/check-result.ts';
import { QueueConfig } from '../config/env.ts';
import { Logger } from '../logger/logger.ts';

export class Scheduler {
  private monitors: Map<string, MonitorWithPlan> = new Map();
  private timers: Map<string, number> = new Map();
  private queue: PriorityQueueManager;
  private checker: HttpChecker;
  private workerId: string;
  private logger: Logger;
  private onResult: (result: CheckResult) => void;

  constructor(
    workerId: string,
    queueConfig: QueueConfig,
    logger: Logger,
    taskManager: TaskManager,
    onResult: (result: CheckResult) => void
  ) {
    this.workerId = workerId;
    this.logger = logger;
    this.onResult = onResult;
    this.checker = new HttpChecker(logger, taskManager);

    this.queue = new PriorityQueueManager(queueConfig, async (check: QueuedCheck) => {
      await this.executeCheck(check);
    });
  }

  start(monitors: MonitorWithPlan[]): void {
    this.logger.info('Starting scheduler', {
      monitor_count: monitors.length,
    });

    monitors.forEach((monitor) => {
      this.addMonitor(monitor);
    });

    this.logger.info('Scheduler started', {
      scheduled_monitors: this.monitors.size,
    });
  }

  updateMonitors(monitors: MonitorWithPlan[]): void {
    this.logger.info('Updating monitors', {
      new_count: monitors.length,
      current_count: this.monitors.size,
    });

    this.timers.forEach((timerId) => clearTimeout(timerId));
    this.timers.clear();
    this.monitors.clear();

    monitors.forEach((monitor) => {
      this.addMonitor(monitor);
    });

    this.logger.info('Monitors updated', {
      scheduled_monitors: this.monitors.size,
    });
  }

  stop(): void {
    this.logger.info('Stopping scheduler');

    this.timers.forEach((timerId) => clearTimeout(timerId));
    this.timers.clear();
    this.monitors.clear();

    this.logger.info('Scheduler stopped');
  }

  private addMonitor(monitor: MonitorWithPlan): void {
    this.monitors.set(monitor.monitor_id, monitor);

    const nextCheck = this.calculateNextCheckTime(monitor, new Date());
    const jitteredCheck = this.addJitter(nextCheck, monitor.user_plan);

    const delay = jitteredCheck.getTime() - Date.now();
    const timerId = setTimeout(() => {
      this.scheduleCheck(monitor);
    }, Math.max(0, delay));

    this.timers.set(monitor.monitor_id, timerId);

    this.logger.debug('Monitor scheduled', {
      monitor_id: monitor.monitor_id,
      monitor_name: monitor.name,
      next_check_at: jitteredCheck.toISOString(),
      delay_ms: delay,
    });
  }

  private scheduleCheck(monitor: MonitorWithPlan): void {
    const now = new Date();

    this.queue.enqueue(monitor, now);

    const nextCheck = this.calculateNextCheckTime(monitor, now);
    const jitteredCheck = this.addJitter(nextCheck, monitor.user_plan);
    const delay = jitteredCheck.getTime() - Date.now();

    const timerId = setTimeout(() => {
      this.scheduleCheck(monitor);
    }, Math.max(0, delay));

    this.timers.set(monitor.monitor_id, timerId);
  }

  private async executeCheck(check: QueuedCheck): Promise<void> {
    const { monitor } = check;

    this.logger.debug('Executing check', {
      monitor_id: monitor.monitor_id,
      monitor_name: monitor.name,
      url: monitor.url,
      user_plan: monitor.user_plan,
    });

    const executionResult = await this.checker.execute(monitor);

    const result: CheckResult = {
      monitor_id: monitor.monitor_id,
      checked_at: new Date().toISOString(),
      status_code: executionResult.status_code,
      response_time_ms: executionResult.response_time_ms,
      success: executionResult.success,
      error_message: executionResult.error_message,
      response_body_sample: executionResult.response_body_sample,
      worker_id: this.workerId,
    };

    this.onResult(result);

    this.logger.info('Check completed', {
      monitor_id: monitor.monitor_id,
      monitor_name: monitor.name,
      success: result.success,
      status_code: result.status_code,
      response_time_ms: result.response_time_ms,
    });
  }

  private calculateNextCheckTime(monitor: MonitorWithPlan, now: Date): Date {
    const intervalSeconds = monitor.check_interval_seconds;
    const baseMinute = monitor.check_minute;
    const baseSecond = monitor.check_second;

    const base = new Date(now);
    base.setHours(0, baseMinute, baseSecond, 0);

    if (now < base) {
      return base;
    }

    const elapsedSeconds = Math.floor((now.getTime() - base.getTime()) / 1000);
    const cycleCount = Math.floor(elapsedSeconds / intervalSeconds) + 1;
    const nextSeconds = cycleCount * intervalSeconds;

    const next = new Date(base.getTime() + nextSeconds * 1000);

    return next;
  }

  private addJitter(scheduledTime: Date, plan: 'free' | 'pro' | 'max'): Date {
    const jitterSettings = {
      max: 5,
      pro: 30,
      free: 90,
    };

    const maxJitter = jitterSettings[plan];
    const jitterMs = Math.random() * maxJitter * 1000;

    return new Date(scheduledTime.getTime() + jitterMs);
  }

  getStats() {
    return {
      monitors: this.monitors.size,
      queue: this.queue.getStats(),
    };
  }
}

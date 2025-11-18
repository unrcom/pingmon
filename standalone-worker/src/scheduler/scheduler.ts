import type { Monitor, CheckResult } from "../types/types.ts";
import { Database } from "../db/sqlite.ts";
import { HttpChecker } from "../checker/http-checker.ts";
import { Logger } from "../logger/logger.ts";

export class Scheduler {
  private db: Database;
  private logger: Logger;
  private timers: Map<string, number> = new Map();
  private checkers: Map<string, HttpChecker> = new Map();
  private running: boolean = false;

  constructor(db: Database, logger?: Logger) {
    this.db = db;
    this.logger = logger || new Logger("scheduler");
  }

  start(): void {
    if (this.running) {
      this.logger.warn("Scheduler already running");
      return;
    }

    this.running = true;
    this.scheduleAllMonitors();
    this.logger.info("Scheduler started");
  }

  stop(): void {
    if (!this.running) {
      return;
    }

    this.running = false;

    // Clear all timers
    for (const [monitorId, timerId] of this.timers.entries()) {
      clearTimeout(timerId);
      this.logger.debug("Timer cleared", { monitor_id: monitorId });
    }
    this.timers.clear();

    // Abort all running checks
    for (const [monitorId, checker] of this.checkers.entries()) {
      checker.abort();
      this.logger.debug("Checker aborted", { monitor_id: monitorId });
    }
    this.checkers.clear();

    this.logger.info("Scheduler stopped");
  }

  reload(): void {
    this.logger.info("Reloading monitors");
    this.stop();
    if (this.running) {
      this.start();
    } else {
      this.running = true;
      this.start();
    }
  }

  private scheduleAllMonitors(): void {
    const monitors = this.db.getAllMonitors(true);
    this.logger.info("Scheduling monitors", { count: monitors.length });

    for (const monitor of monitors) {
      this.scheduleMonitor(monitor);
    }
  }

  private scheduleMonitor(monitor: Monitor): void {
    if (!monitor.is_active) {
      this.logger.debug("Skipping inactive monitor", {
        monitor_id: monitor.id,
        name: monitor.name,
      });
      return;
    }

    const delayMs = this.calculateNextCheckDelay(monitor);

    const timerId = setTimeout(() => {
      this.executeCheck(monitor);
    }, delayMs);

    this.timers.set(monitor.id, timerId);

    this.logger.debug("Monitor scheduled", {
      monitor_id: monitor.id,
      name: monitor.name,
      delay_ms: delayMs,
      next_check_in: `${Math.round(delayMs / 1000)}s`,
    });
  }

  private calculateNextCheckDelay(monitor: Monitor): number {
    // For first check, execute immediately with a small random delay (0-5s)
    // to avoid thundering herd
    const randomJitter = Math.random() * 5000;
    return Math.max(100, randomJitter);
  }

  private async executeCheck(monitor: Monitor): Promise<void> {
    try {
      // Create checker for this monitor
      const checker = new HttpChecker(this.logger.child("checker"));
      this.checkers.set(monitor.id, checker);

      // Execute the check
      const result = await checker.execute(monitor);

      // Save result to database
      const checkResult: Omit<CheckResult, "created_at"> = {
        id: crypto.randomUUID(),
        monitor_id: monitor.id,
        checked_at: new Date().toISOString(),
        status_code: result.status_code,
        response_time_ms: result.response_time_ms,
        success: result.success,
        error_message: result.error_message,
        response_body_sample: result.response_body_sample,
      };

      this.db.saveCheckResult(checkResult);

      // Remove checker
      this.checkers.delete(monitor.id);

      // Schedule next check
      if (this.running) {
        this.scheduleNextCheck(monitor);
      }
    } catch (error) {
      this.logger.error("Error executing check", {
        monitor_id: monitor.id,
        error: error instanceof Error ? error.message : String(error),
      });

      // Remove checker
      this.checkers.delete(monitor.id);

      // Schedule next check even on error
      if (this.running) {
        this.scheduleNextCheck(monitor);
      }
    }
  }

  private scheduleNextCheck(monitor: Monitor): void {
    // Reload monitor from DB to get latest config
    const updatedMonitor = this.db.getMonitor(monitor.id);
    if (!updatedMonitor || !updatedMonitor.is_active) {
      this.logger.debug("Monitor no longer active, not rescheduling", {
        monitor_id: monitor.id,
      });
      return;
    }

    const delayMs = updatedMonitor.check_interval_seconds * 1000;

    const timerId = setTimeout(() => {
      this.executeCheck(updatedMonitor);
    }, delayMs);

    this.timers.set(updatedMonitor.id, timerId);

    this.logger.debug("Next check scheduled", {
      monitor_id: updatedMonitor.id,
      delay_ms: delayMs,
      next_check_in: `${updatedMonitor.check_interval_seconds}s`,
    });
  }

  getStats(): { scheduled_monitors: number; running_checks: number } {
    return {
      scheduled_monitors: this.timers.size,
      running_checks: this.checkers.size,
    };
  }
}

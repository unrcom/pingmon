import { Database } from "../db/sqlite.ts";
import { Logger } from "../logger/logger.ts";

export class DataCleanup {
  private db: Database;
  private logger: Logger;
  private intervalId: number | null = null;

  constructor(db: Database, logger?: Logger) {
    this.db = db;
    this.logger = logger || new Logger("cleanup");
  }

  startAutoCleanup(daysToKeep: number, intervalHours: number = 24): void {
    if (this.intervalId !== null) {
      this.logger.warn("Auto cleanup already running");
      return;
    }

    this.logger.info("Starting auto cleanup", {
      days_to_keep: daysToKeep,
      interval_hours: intervalHours,
    });

    // Run cleanup immediately
    this.runCleanup(daysToKeep);

    // Schedule periodic cleanup
    const intervalMs = intervalHours * 60 * 60 * 1000;
    this.intervalId = setInterval(() => {
      this.runCleanup(daysToKeep);
    }, intervalMs);
  }

  stopAutoCleanup(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      this.logger.info("Auto cleanup stopped");
    }
  }

  runCleanup(daysToKeep: number): number {
    this.logger.info("Running cleanup", { days_to_keep: daysToKeep });

    try {
      const deletedCount = this.db.deleteOldCheckResults(daysToKeep);

      this.logger.info("Cleanup completed", {
        deleted_count: deletedCount,
        days_to_keep: daysToKeep,
      });

      return deletedCount;
    } catch (error) {
      this.logger.error("Cleanup failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      return 0;
    }
  }
}

import type { ExportData, Monitor, CheckResult } from "../types/types.ts";
import { Database } from "../db/sqlite.ts";
import { Logger } from "../logger/logger.ts";

export class DataImporter {
  private db: Database;
  private logger: Logger;

  constructor(db: Database, logger?: Logger) {
    this.db = db;
    this.logger = logger || new Logger("importer");
  }

  importFromJson(data: ExportData, overwrite: boolean = false): {
    monitors_imported: number;
    check_results_imported: number;
    monitors_skipped: number;
  } {
    this.logger.info("Importing data from JSON", {
      monitors_count: data.monitors.length,
      check_results_count: data.check_results?.length || 0,
      overwrite,
    });

    let monitorsImported = 0;
    let monitorsSkipped = 0;
    let checkResultsImported = 0;

    // Import monitors
    for (const monitor of data.monitors) {
      try {
        const existing = this.db.getMonitor(monitor.id);

        if (existing && !overwrite) {
          monitorsSkipped++;
          this.logger.debug("Monitor already exists, skipping", {
            monitor_id: monitor.id,
          });
          continue;
        }

        if (existing && overwrite) {
          // Delete existing monitor (cascade delete will remove check results)
          this.db.deleteMonitor(monitor.id);
        }

        this.db.createMonitor(monitor);
        monitorsImported++;
      } catch (error) {
        this.logger.error("Failed to import monitor", {
          monitor_id: monitor.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Import check results if provided
    if (data.check_results) {
      for (const result of data.check_results) {
        try {
          // Check if monitor exists
          const monitor = this.db.getMonitor(result.monitor_id);
          if (!monitor) {
            this.logger.debug("Monitor not found for check result, skipping", {
              monitor_id: result.monitor_id,
              result_id: result.id,
            });
            continue;
          }

          this.db.saveCheckResult(result);
          checkResultsImported++;
        } catch (error) {
          this.logger.error("Failed to import check result", {
            result_id: result.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    this.logger.info("Import completed", {
      monitors_imported: monitorsImported,
      monitors_skipped: monitorsSkipped,
      check_results_imported: checkResultsImported,
    });

    return {
      monitors_imported: monitorsImported,
      monitors_skipped: monitorsSkipped,
      check_results_imported: checkResultsImported,
    };
  }

  async loadFromFile(filePath: string, overwrite: boolean = false): Promise<{
    monitors_imported: number;
    check_results_imported: number;
    monitors_skipped: number;
  }> {
    this.logger.info("Loading data from file", { file_path: filePath });

    const json = await Deno.readTextFile(filePath);
    const data: ExportData = JSON.parse(json);

    return this.importFromJson(data, overwrite);
  }
}

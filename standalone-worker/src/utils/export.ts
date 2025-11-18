import type { ExportData } from "../types/types.ts";
import { Database } from "../db/sqlite.ts";
import { Logger } from "../logger/logger.ts";

export class DataExporter {
  private db: Database;
  private logger: Logger;

  constructor(db: Database, logger?: Logger) {
    this.db = db;
    this.logger = logger || new Logger("exporter");
  }

  exportToJson(includeCheckResults: boolean = false): ExportData {
    this.logger.info("Exporting data to JSON", { includeCheckResults });

    const monitors = this.db.getAllMonitors();
    const exportData: ExportData = {
      version: "1.0",
      exported_at: new Date().toISOString(),
      monitors,
    };

    if (includeCheckResults) {
      exportData.check_results = this.db.getAllCheckResults(10000); // Limit to 10k results
    }

    this.logger.info("Data exported", {
      monitors_count: monitors.length,
      check_results_count: exportData.check_results?.length || 0,
    });

    return exportData;
  }

  async saveToFile(filePath: string, includeCheckResults: boolean = false): Promise<void> {
    const data = this.exportToJson(includeCheckResults);
    const json = JSON.stringify(data, null, 2);

    await Deno.writeTextFile(filePath, json);

    this.logger.info("Data saved to file", {
      file_path: filePath,
      size_bytes: json.length,
    });
  }
}

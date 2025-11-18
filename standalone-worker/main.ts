import { Database } from "./src/db/sqlite.ts";
import { Scheduler } from "./src/scheduler/scheduler.ts";
import { ApiServer } from "./src/api/server.ts";
import { DataExporter } from "./src/utils/export.ts";
import { DataImporter } from "./src/utils/import.ts";
import { DataCleanup } from "./src/utils/cleanup.ts";
import { createLogger } from "./src/logger/logger.ts";

// Configuration
const DB_PATH = Deno.env.get("DB_PATH") || "./pingmon.db";
const API_PORT = parseInt(Deno.env.get("API_PORT") || "8080");
const CLEANUP_DAYS = parseInt(Deno.env.get("CLEANUP_DAYS") || "30");
const CLEANUP_INTERVAL_HOURS = parseInt(Deno.env.get("CLEANUP_INTERVAL_HOURS") || "24");

// Main application
class StandaloneWorker {
  private logger = createLogger("main");
  private db: Database;
  private scheduler: Scheduler;
  private apiServer: ApiServer;
  private cleanup: DataCleanup;

  constructor() {
    this.logger.info("Initializing Standalone Worker", {
      db_path: DB_PATH,
      api_port: API_PORT,
      cleanup_days: CLEANUP_DAYS,
      cleanup_interval_hours: CLEANUP_INTERVAL_HOURS,
    });

    // Initialize database
    this.db = new Database(DB_PATH, this.logger.child("database"));

    // Initialize scheduler
    this.scheduler = new Scheduler(this.db, this.logger.child("scheduler"));

    // Initialize utilities
    const exporter = new DataExporter(this.db, this.logger.child("exporter"));
    const importer = new DataImporter(this.db, this.logger.child("importer"));
    this.cleanup = new DataCleanup(this.db, this.logger.child("cleanup"));

    // Initialize API server
    this.apiServer = new ApiServer(
      this.db,
      this.scheduler,
      exporter,
      importer,
      this.cleanup,
      this.logger.child("api-server"),
    );
  }

  async start(): Promise<void> {
    this.logger.info("Starting Standalone Worker");

    // Start scheduler
    this.scheduler.start();

    // Start auto cleanup
    this.cleanup.startAutoCleanup(CLEANUP_DAYS, CLEANUP_INTERVAL_HOURS);

    // Setup graceful shutdown
    this.setupGracefulShutdown();

    // Start API server (this blocks until shutdown)
    await this.apiServer.start(API_PORT);
  }

  private setupGracefulShutdown(): void {
    const shutdown = async () => {
      this.logger.info("Shutting down gracefully...");

      // Stop API server
      this.apiServer.stop();

      // Stop scheduler
      this.scheduler.stop();

      // Stop cleanup
      this.cleanup.stopAutoCleanup();

      // Close database
      this.db.close();

      this.logger.info("Shutdown complete");
      Deno.exit(0);
    };

    // Handle SIGINT (Ctrl+C) and SIGTERM
    Deno.addSignalListener("SIGINT", shutdown);
    Deno.addSignalListener("SIGTERM", shutdown);
  }
}

// Start the application
if (import.meta.main) {
  try {
    const worker = new StandaloneWorker();
    await worker.start();
  } catch (error) {
    console.error("Fatal error:", error);
    Deno.exit(1);
  }
}

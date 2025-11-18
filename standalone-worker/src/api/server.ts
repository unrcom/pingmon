import type {
  Monitor,
  CreateMonitorRequest,
  UpdateMonitorRequest,
  ApiResponse,
} from "../types/types.ts";
import { Database } from "../db/sqlite.ts";
import { Scheduler } from "../scheduler/scheduler.ts";
import { DataExporter } from "../utils/export.ts";
import { DataImporter } from "../utils/import.ts";
import { DataCleanup } from "../utils/cleanup.ts";
import { Logger } from "../logger/logger.ts";

export class ApiServer {
  private db: Database;
  private scheduler: Scheduler;
  private exporter: DataExporter;
  private importer: DataImporter;
  private cleanup: DataCleanup;
  private logger: Logger;
  private abortController: AbortController;

  constructor(
    db: Database,
    scheduler: Scheduler,
    exporter: DataExporter,
    importer: DataImporter,
    cleanup: DataCleanup,
    logger?: Logger,
  ) {
    this.db = db;
    this.scheduler = scheduler;
    this.exporter = exporter;
    this.importer = importer;
    this.cleanup = cleanup;
    this.logger = logger || new Logger("api-server");
    this.abortController = new AbortController();
  }

  async start(port: number = 8080): Promise<void> {
    this.logger.info("Starting API server", { port });

    const handler = (req: Request): Response | Promise<Response> => {
      return this.handleRequest(req);
    };

    try {
      await Deno.serve(
        {
          port,
          signal: this.abortController.signal,
          onListen: ({ hostname, port }) => {
            this.logger.info("API server listening", { hostname, port });
          },
        },
        handler,
      );
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        this.logger.info("API server stopped");
      } else {
        throw error;
      }
    }
  }

  stop(): void {
    this.logger.info("Stopping API server");
    this.abortController.abort();
  }

  private async handleRequest(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    this.logger.debug("Incoming request", { method, path });

    try {
      // Health check
      if (path === "/api/health" && method === "GET") {
        return this.handleHealthCheck();
      }

      // Monitor endpoints
      if (path === "/api/monitors" && method === "GET") {
        return this.handleGetMonitors(url);
      }

      if (path === "/api/monitors" && method === "POST") {
        return await this.handleCreateMonitor(req);
      }

      if (path.match(/^\/api\/monitors\/[^/]+$/) && method === "GET") {
        const id = path.split("/").pop()!;
        return this.handleGetMonitor(id);
      }

      if (path.match(/^\/api\/monitors\/[^/]+$/) && method === "PUT") {
        const id = path.split("/").pop()!;
        return await this.handleUpdateMonitor(id, req);
      }

      if (path.match(/^\/api\/monitors\/[^/]+$/) && method === "DELETE") {
        const id = path.split("/").pop()!;
        return this.handleDeleteMonitor(id);
      }

      if (path.match(/^\/api\/monitors\/[^/]+\/results$/) && method === "GET") {
        const id = path.split("/")[3];
        return this.handleGetCheckResults(id, url);
      }

      // Statistics endpoints
      if (path === "/api/statistics" && method === "GET") {
        return this.handleGetSystemStatistics();
      }

      if (path === "/api/statistics/monitors" && method === "GET") {
        return this.handleGetAllMonitorStatistics(url);
      }

      if (path.match(/^\/api\/statistics\/monitors\/[^/]+$/) && method === "GET") {
        const id = path.split("/").pop()!;
        return this.handleGetMonitorStatistics(id, url);
      }

      // Export/Import endpoints
      if (path === "/api/export" && method === "GET") {
        return this.handleExport(url);
      }

      if (path === "/api/import" && method === "POST") {
        return await this.handleImport(req);
      }

      // Maintenance endpoints
      if (path === "/api/cleanup" && method === "POST") {
        return await this.handleCleanup(req);
      }

      if (path === "/api/reload" && method === "POST") {
        return this.handleReload();
      }

      if (path === "/api/scheduler/stats" && method === "GET") {
        return this.handleSchedulerStats();
      }

      // 404 Not Found
      return this.jsonResponse({ success: false, error: "Not found" }, 404);
    } catch (error) {
      this.logger.error("Request handler error", {
        method,
        path,
        error: error instanceof Error ? error.message : String(error),
      });

      return this.jsonResponse(
        {
          success: false,
          error: error instanceof Error ? error.message : "Internal server error",
        },
        500,
      );
    }
  }

  // Health check
  private handleHealthCheck(): Response {
    const stats = this.scheduler.getStats();
    return this.jsonResponse({
      success: true,
      data: {
        status: "healthy",
        timestamp: new Date().toISOString(),
        scheduler: stats,
      },
    });
  }

  // Monitor CRUD operations
  private handleGetMonitors(url: URL): Response {
    const activeOnly = url.searchParams.get("active") === "true";
    const monitors = this.db.getAllMonitors(activeOnly);
    return this.jsonResponse({ success: true, data: monitors });
  }

  private async handleCreateMonitor(req: Request): Promise<Response> {
    const body: CreateMonitorRequest = await req.json();

    // Validate required fields
    if (!body.name || !body.url) {
      return this.jsonResponse(
        { success: false, error: "name and url are required" },
        400,
      );
    }

    // Validate URL
    try {
      new URL(body.url);
    } catch {
      return this.jsonResponse(
        { success: false, error: "Invalid URL format" },
        400,
      );
    }

    const monitor: Omit<Monitor, "created_at" | "updated_at"> = {
      id: crypto.randomUUID(),
      name: body.name,
      url: body.url,
      method: body.method || "GET",
      headers: body.headers,
      body: body.body,
      timeout_seconds: body.timeout_seconds || 30,
      expected_status_code: body.expected_status_code,
      expected_body_contains: body.expected_body_contains,
      check_interval_seconds: body.check_interval_seconds || 300,
      is_active: body.is_active !== undefined ? body.is_active : true,
    };

    const created = this.db.createMonitor(monitor);

    // Reload scheduler to pick up new monitor
    this.scheduler.reload();

    return this.jsonResponse({ success: true, data: created }, 201);
  }

  private handleGetMonitor(id: string): Response {
    const monitor = this.db.getMonitor(id);

    if (!monitor) {
      return this.jsonResponse(
        { success: false, error: "Monitor not found" },
        404,
      );
    }

    return this.jsonResponse({ success: true, data: monitor });
  }

  private async handleUpdateMonitor(id: string, req: Request): Promise<Response> {
    const monitor = this.db.getMonitor(id);

    if (!monitor) {
      return this.jsonResponse(
        { success: false, error: "Monitor not found" },
        404,
      );
    }

    const body: UpdateMonitorRequest = await req.json();

    // Validate URL if provided
    if (body.url) {
      try {
        new URL(body.url);
      } catch {
        return this.jsonResponse(
          { success: false, error: "Invalid URL format" },
          400,
        );
      }
    }

    this.db.updateMonitor(id, body);

    const updated = this.db.getMonitor(id)!;

    // Reload scheduler to pick up changes
    this.scheduler.reload();

    return this.jsonResponse({ success: true, data: updated });
  }

  private handleDeleteMonitor(id: string): Response {
    const monitor = this.db.getMonitor(id);

    if (!monitor) {
      return this.jsonResponse(
        { success: false, error: "Monitor not found" },
        404,
      );
    }

    this.db.deleteMonitor(id);

    // Reload scheduler to remove monitor
    this.scheduler.reload();

    return this.jsonResponse({ success: true, data: { deleted: true } });
  }

  private handleGetCheckResults(id: string, url: URL): Response {
    const monitor = this.db.getMonitor(id);

    if (!monitor) {
      return this.jsonResponse(
        { success: false, error: "Monitor not found" },
        404,
      );
    }

    const limit = parseInt(url.searchParams.get("limit") || "100");
    const offset = parseInt(url.searchParams.get("offset") || "0");

    const results = this.db.getCheckResults(id, limit, offset);

    return this.jsonResponse({ success: true, data: results });
  }

  // Statistics endpoints
  private handleGetSystemStatistics(): Response {
    const stats = this.db.getSystemStatistics();
    return this.jsonResponse({ success: true, data: stats });
  }

  private handleGetAllMonitorStatistics(url: URL): Response {
    const sinceDays = url.searchParams.get("since_days");
    const days = sinceDays ? parseInt(sinceDays) : undefined;

    const stats = this.db.getAllMonitorStatistics(days);
    return this.jsonResponse({ success: true, data: stats });
  }

  private handleGetMonitorStatistics(id: string, url: URL): Response {
    const monitor = this.db.getMonitor(id);

    if (!monitor) {
      return this.jsonResponse(
        { success: false, error: "Monitor not found" },
        404,
      );
    }

    const sinceDays = url.searchParams.get("since_days");
    const days = sinceDays ? parseInt(sinceDays) : undefined;

    const stats = this.db.getMonitorStatistics(id, days);

    if (!stats) {
      return this.jsonResponse(
        { success: false, error: "No statistics available" },
        404,
      );
    }

    return this.jsonResponse({ success: true, data: stats });
  }

  // Export/Import endpoints
  private handleExport(url: URL): Response {
    const includeResults = url.searchParams.get("include_results") === "true";
    const data = this.exporter.exportToJson(includeResults);
    return this.jsonResponse({ success: true, data });
  }

  private async handleImport(req: Request): Promise<Response> {
    const body = await req.json();

    if (!body.data) {
      return this.jsonResponse(
        { success: false, error: "data field is required" },
        400,
      );
    }

    const overwrite = body.overwrite === true;
    const result = this.importer.importFromJson(body.data, overwrite);

    // Reload scheduler to pick up new monitors
    this.scheduler.reload();

    return this.jsonResponse({ success: true, data: result });
  }

  // Maintenance endpoints
  private async handleCleanup(req: Request): Promise<Response> {
    const body = await req.json();
    const daysToKeep = body.days_to_keep || 30;

    if (typeof daysToKeep !== "number" || daysToKeep < 1) {
      return this.jsonResponse(
        { success: false, error: "days_to_keep must be a positive number" },
        400,
      );
    }

    const deletedCount = this.cleanup.runCleanup(daysToKeep);

    return this.jsonResponse({
      success: true,
      data: { deleted_count: deletedCount },
    });
  }

  private handleReload(): Response {
    this.scheduler.reload();
    return this.jsonResponse({
      success: true,
      data: { message: "Scheduler reloaded" },
    });
  }

  private handleSchedulerStats(): Response {
    const stats = this.scheduler.getStats();
    return this.jsonResponse({ success: true, data: stats });
  }

  // Helper methods
  private jsonResponse<T>(data: ApiResponse<T>, status: number = 200): Response {
    return new Response(JSON.stringify(data), {
      status,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }
}

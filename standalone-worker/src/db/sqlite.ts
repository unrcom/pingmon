import { DB } from "@db/sqlite";
import { initializeDatabase } from "./schema.ts";
import type {
  Monitor,
  CheckResult,
  MonitorStatistics,
  SystemStatistics,
} from "../types/types.ts";
import { Logger } from "../logger/logger.ts";

export class Database {
  private db: DB;
  private logger: Logger;

  constructor(dbPath: string = "./pingmon.db", logger?: Logger) {
    this.logger = logger || new Logger("database");
    this.db = new DB(dbPath);
    initializeDatabase(this.db);
    this.logger.info("Database initialized", { dbPath });
  }

  // Monitor operations
  createMonitor(monitor: Omit<Monitor, "created_at" | "updated_at">): Monitor {
    const now = new Date().toISOString();
    const headers = monitor.headers ? JSON.stringify(monitor.headers) : null;

    this.db.query(
      `INSERT INTO monitors (id, name, url, method, headers, body, timeout_seconds,
       expected_status_code, expected_body_contains, check_interval_seconds, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        monitor.id,
        monitor.name,
        monitor.url,
        monitor.method,
        headers,
        monitor.body || null,
        monitor.timeout_seconds,
        monitor.expected_status_code || null,
        monitor.expected_body_contains || null,
        monitor.check_interval_seconds,
        monitor.is_active ? 1 : 0,
        now,
        now,
      ],
    );

    this.logger.info("Monitor created", { monitor_id: monitor.id, name: monitor.name });
    return { ...monitor, created_at: now, updated_at: now };
  }

  getMonitor(id: string): Monitor | null {
    const rows = this.db.query(
      "SELECT * FROM monitors WHERE id = ?",
      [id],
    );

    if (rows.length === 0) return null;
    return this.rowToMonitor(rows[0]);
  }

  getAllMonitors(activeOnly: boolean = false): Monitor[] {
    const query = activeOnly
      ? "SELECT * FROM monitors WHERE is_active = 1 ORDER BY name"
      : "SELECT * FROM monitors ORDER BY name";

    const rows = this.db.query(query);
    return rows.map((row) => this.rowToMonitor(row));
  }

  updateMonitor(
    id: string,
    updates: Partial<Omit<Monitor, "id" | "created_at" | "updated_at">>,
  ): boolean {
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.name !== undefined) {
      fields.push("name = ?");
      values.push(updates.name);
    }
    if (updates.url !== undefined) {
      fields.push("url = ?");
      values.push(updates.url);
    }
    if (updates.method !== undefined) {
      fields.push("method = ?");
      values.push(updates.method);
    }
    if (updates.headers !== undefined) {
      fields.push("headers = ?");
      values.push(JSON.stringify(updates.headers));
    }
    if (updates.body !== undefined) {
      fields.push("body = ?");
      values.push(updates.body);
    }
    if (updates.timeout_seconds !== undefined) {
      fields.push("timeout_seconds = ?");
      values.push(updates.timeout_seconds);
    }
    if (updates.expected_status_code !== undefined) {
      fields.push("expected_status_code = ?");
      values.push(updates.expected_status_code);
    }
    if (updates.expected_body_contains !== undefined) {
      fields.push("expected_body_contains = ?");
      values.push(updates.expected_body_contains);
    }
    if (updates.check_interval_seconds !== undefined) {
      fields.push("check_interval_seconds = ?");
      values.push(updates.check_interval_seconds);
    }
    if (updates.is_active !== undefined) {
      fields.push("is_active = ?");
      values.push(updates.is_active ? 1 : 0);
    }

    if (fields.length === 0) return false;

    values.push(id);
    this.db.query(
      `UPDATE monitors SET ${fields.join(", ")} WHERE id = ?`,
      values,
    );

    this.logger.info("Monitor updated", { monitor_id: id });
    return true;
  }

  deleteMonitor(id: string): boolean {
    this.db.query("DELETE FROM monitors WHERE id = ?", [id]);
    this.logger.info("Monitor deleted", { monitor_id: id });
    return true;
  }

  // Check result operations
  saveCheckResult(result: Omit<CheckResult, "created_at">): CheckResult {
    const now = new Date().toISOString();

    this.db.query(
      `INSERT INTO check_results (id, monitor_id, checked_at, status_code, response_time_ms,
       success, error_message, response_body_sample, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        result.id,
        result.monitor_id,
        result.checked_at,
        result.status_code,
        result.response_time_ms,
        result.success ? 1 : 0,
        result.error_message,
        result.response_body_sample,
        now,
      ],
    );

    return { ...result, created_at: now };
  }

  getCheckResults(
    monitorId: string,
    limit: number = 100,
    offset: number = 0,
  ): CheckResult[] {
    const rows = this.db.query(
      `SELECT * FROM check_results WHERE monitor_id = ?
       ORDER BY checked_at DESC LIMIT ? OFFSET ?`,
      [monitorId, limit, offset],
    );

    return rows.map((row) => this.rowToCheckResult(row));
  }

  getAllCheckResults(limit: number = 100, offset: number = 0): CheckResult[] {
    const rows = this.db.query(
      "SELECT * FROM check_results ORDER BY checked_at DESC LIMIT ? OFFSET ?",
      [limit, offset],
    );

    return rows.map((row) => this.rowToCheckResult(row));
  }

  // Statistics operations
  getMonitorStatistics(monitorId: string, sinceDays?: number): MonitorStatistics | null {
    const monitor = this.getMonitor(monitorId);
    if (!monitor) return null;

    let whereClause = "WHERE monitor_id = ?";
    const params: any[] = [monitorId];

    if (sinceDays !== undefined) {
      whereClause += " AND checked_at >= datetime('now', '-' || ? || ' days')";
      params.push(sinceDays);
    }

    const rows = this.db.query(
      `SELECT
        COUNT(*) as total_checks,
        SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful_checks,
        SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failed_checks,
        AVG(CASE WHEN response_time_ms IS NOT NULL THEN response_time_ms END) as avg_response_time_ms,
        MIN(CASE WHEN response_time_ms IS NOT NULL THEN response_time_ms END) as min_response_time_ms,
        MAX(CASE WHEN response_time_ms IS NOT NULL THEN response_time_ms END) as max_response_time_ms,
        MAX(checked_at) as last_check_at,
        MAX(CASE WHEN success = 1 THEN checked_at END) as last_success_at,
        MAX(CASE WHEN success = 0 THEN checked_at END) as last_failure_at
       FROM check_results ${whereClause}`,
      params,
    );

    if (rows.length === 0) return null;

    const row = rows[0];
    const totalChecks = Number(row[0]) || 0;
    const successfulChecks = Number(row[1]) || 0;

    return {
      monitor_id: monitorId,
      monitor_name: monitor.name,
      total_checks: totalChecks,
      successful_checks: successfulChecks,
      failed_checks: Number(row[2]) || 0,
      success_rate: totalChecks > 0 ? (successfulChecks / totalChecks) * 100 : 0,
      avg_response_time_ms: row[3] !== null ? Number(row[3]) : null,
      min_response_time_ms: row[4] !== null ? Number(row[4]) : null,
      max_response_time_ms: row[5] !== null ? Number(row[5]) : null,
      last_check_at: row[6] as string | null,
      last_success_at: row[7] as string | null,
      last_failure_at: row[8] as string | null,
    };
  }

  getAllMonitorStatistics(sinceDays?: number): MonitorStatistics[] {
    const monitors = this.getAllMonitors();
    return monitors
      .map((m) => this.getMonitorStatistics(m.id, sinceDays))
      .filter((s): s is MonitorStatistics => s !== null);
  }

  getSystemStatistics(): SystemStatistics {
    const monitors = this.getAllMonitors();
    const activeMonitors = monitors.filter((m) => m.is_active);

    const statsRows = this.db.query(
      `SELECT
        COUNT(*) as total_checks,
        SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful_checks,
        AVG(CASE WHEN response_time_ms IS NOT NULL THEN response_time_ms END) as avg_response_time_ms
       FROM check_results`,
    );

    const lastHourRows = this.db.query(
      `SELECT COUNT(*) as count FROM check_results
       WHERE checked_at >= datetime('now', '-1 hour')`,
    );

    const last24hRows = this.db.query(
      `SELECT COUNT(*) as count FROM check_results
       WHERE checked_at >= datetime('now', '-1 day')`,
    );

    const totalChecks = Number(statsRows[0][0]) || 0;
    const successfulChecks = Number(statsRows[0][1]) || 0;

    return {
      total_monitors: monitors.length,
      active_monitors: activeMonitors.length,
      inactive_monitors: monitors.length - activeMonitors.length,
      total_checks: totalChecks,
      total_checks_last_hour: Number(lastHourRows[0][0]) || 0,
      total_checks_last_24h: Number(last24hRows[0][0]) || 0,
      overall_success_rate: totalChecks > 0 ? (successfulChecks / totalChecks) * 100 : 0,
      avg_response_time_ms: statsRows[0][2] !== null ? Number(statsRows[0][2]) : null,
    };
  }

  // Cleanup old data
  deleteOldCheckResults(daysToKeep: number): number {
    const result = this.db.query(
      "DELETE FROM check_results WHERE checked_at < datetime('now', '-' || ? || ' days')",
      [daysToKeep],
    );

    const deletedCount = this.db.changes;
    this.logger.info("Old check results deleted", {
      days_to_keep: daysToKeep,
      deleted_count: deletedCount
    });

    return deletedCount;
  }

  // Helper methods
  private rowToMonitor(row: any[]): Monitor {
    return {
      id: row[0] as string,
      name: row[1] as string,
      url: row[2] as string,
      method: row[3] as "GET" | "POST" | "PUT" | "DELETE" | "PATCH",
      headers: row[4] ? JSON.parse(row[4] as string) : undefined,
      body: row[5] as string | undefined,
      timeout_seconds: row[6] as number,
      expected_status_code: row[7] as number | undefined,
      expected_body_contains: row[8] as string | undefined,
      check_interval_seconds: row[9] as number,
      is_active: (row[10] as number) === 1,
      created_at: row[11] as string,
      updated_at: row[12] as string,
    };
  }

  private rowToCheckResult(row: any[]): CheckResult {
    return {
      id: row[0] as string,
      monitor_id: row[1] as string,
      checked_at: row[2] as string,
      status_code: row[3] as number | null,
      response_time_ms: row[4] as number | null,
      success: (row[5] as number) === 1,
      error_message: row[6] as string | null,
      response_body_sample: row[7] as string | null,
      created_at: row[8] as string,
    };
  }

  close(): void {
    this.db.close();
    this.logger.info("Database closed");
  }
}

import postgres from 'npm:postgres@3.4.4';
import type { Monitor, CheckResult, Incident, NotificationChannel } from './types.ts';

// PostgreSQL接続を作成
let sql: ReturnType<typeof postgres> | null = null;

export function getDbConnection(databaseUrl: string) {
  if (!sql) {
    sql = postgres(databaseUrl, {
      max: 10, // 最大接続数
      idle_timeout: 20,
      connect_timeout: 10,
    });
  }
  return sql;
}

// ==========================================
// 監視設定の取得
// ==========================================

/**
 * 次にチェックすべき監視設定を取得
 */
export async function getMonitorsToCheck(
  db: ReturnType<typeof postgres>,
  limit = 100,
): Promise<Monitor[]> {
  const now = new Date().toISOString();
  
  const monitors = await db<Monitor[]>`
    SELECT *
    FROM monitors
    WHERE is_active = true
    AND next_check_at <= ${now}
    ORDER BY next_check_at ASC
    LIMIT ${limit}
  `;
  
  return monitors;
}

/**
 * 特定の監視設定を取得
 */
export async function getMonitorById(
  db: ReturnType<typeof postgres>,
  monitorId: string,
): Promise<Monitor | null> {
  const monitors = await db<Monitor[]>`
    SELECT *
    FROM monitors
    WHERE id = ${monitorId}
    LIMIT 1
  `;
  
  return monitors[0] || null;
}

// ==========================================
// チェック結果の保存
// ==========================================

/**
 * チェック結果を保存
 */
export async function saveCheckResult(
  db: ReturnType<typeof postgres>,
  result: CheckResult,
): Promise<void> {
  await db`
    INSERT INTO check_results (
      monitor_id,
      checked_at,
      status_code,
      response_time_ms,
      success,
      error_message,
      response_body_sample
    ) VALUES (
      ${result.monitor_id},
      ${result.checked_at},
      ${result.status_code},
      ${result.response_time_ms},
      ${result.success},
      ${result.error_message},
      ${result.response_body_sample}
    )
  `;
}

/**
 * 監視設定の最終チェック時刻と次回チェック時刻を更新
 */
export async function updateMonitorCheckTime(
  db: ReturnType<typeof postgres>,
  monitorId: string,
  lastCheckedAt: string,
  nextCheckAt: string,
): Promise<void> {
  await db`
    UPDATE monitors
    SET 
      last_checked_at = ${lastCheckedAt},
      next_check_at = ${nextCheckAt},
      updated_at = NOW()
    WHERE id = ${monitorId}
  `;
}

// ==========================================
// インシデント管理
// ==========================================

/**
 * オープン中のインシデントを取得
 */
export async function getOpenIncident(
  db: ReturnType<typeof postgres>,
  monitorId: string,
): Promise<Incident | null> {
  const incidents = await db<Incident[]>`
    SELECT *
    FROM incidents
    WHERE monitor_id = ${monitorId}
    AND status = 'open'
    ORDER BY started_at DESC
    LIMIT 1
  `;
  
  return incidents[0] || null;
}

/**
 * 新しいインシデントを作成
 */
export async function createIncident(
  db: ReturnType<typeof postgres>,
  monitorId: string,
  errorMessage: string,
): Promise<Incident> {
  const incidents = await db<Incident[]>`
    INSERT INTO incidents (
      monitor_id,
      started_at,
      status,
      failure_count,
      last_error_message
    ) VALUES (
      ${monitorId},
      NOW(),
      'open',
      1,
      ${errorMessage}
    )
    RETURNING *
  `;
  
  return incidents[0];
}

/**
 * インシデントの失敗回数を更新
 */
export async function updateIncidentFailureCount(
  db: ReturnType<typeof postgres>,
  incidentId: string,
  failureCount: number,
  errorMessage: string,
): Promise<void> {
  await db`
    UPDATE incidents
    SET 
      failure_count = ${failureCount},
      last_error_message = ${errorMessage},
      updated_at = NOW()
    WHERE id = ${incidentId}
  `;
}

/**
 * インシデントを解決済みにする
 */
export async function resolveIncident(
  db: ReturnType<typeof postgres>,
  incidentId: string,
): Promise<void> {
  await db`
    UPDATE incidents
    SET 
      status = 'resolved',
      resolved_at = NOW(),
      updated_at = NOW()
    WHERE id = ${incidentId}
  `;
}

// ==========================================
// 通知チャネルの取得
// ==========================================

/**
 * ユーザーの通知チャネルを取得
 */
export async function getNotificationChannels(
  db: ReturnType<typeof postgres>,
  userId: string,
): Promise<NotificationChannel[]> {
  const channels = await db<NotificationChannel[]>`
    SELECT *
    FROM notification_channels
    WHERE user_id = ${userId}
    AND is_active = true
  `;
  
  return channels;
}

// ==========================================
// データ保持ポリシー（古いデータの削除）
// ==========================================

/**
 * 古いチェック結果を削除
 */
export async function deleteOldCheckResults(
  db: ReturnType<typeof postgres>,
  daysToKeep: number,
): Promise<number> {
  const result = await db`
    DELETE FROM check_results
    WHERE checked_at < NOW() - INTERVAL '${daysToKeep} days'
  `;
  
  return result.count || 0;
}

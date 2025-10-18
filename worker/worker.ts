import type { Monitor, CheckResultData } from './types.ts';
import {
  getDbConnection,
  saveCheckResult,
  updateMonitorCheckTime,
} from './db.ts';

// ==========================================
// 環境変数の読み込み
// ==========================================

const DATABASE_URL = Deno.env.get('DATABASE_URL');
if (!DATABASE_URL) {
  console.error('DATABASE_URL is not set');
  Deno.exit(1);
}

// ==========================================
// API監視の実行
// ==========================================

/**
 * 単一の監視設定に対してHTTPリクエストを実行
 */
async function checkMonitor(monitor: Monitor): Promise<CheckResultData> {
  const startTime = performance.now();
  
  try {
    // AbortControllerでタイムアウト設定
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), monitor.timeout_seconds * 1000);
    
    // HTTPリクエストを実行
    const response = await fetch(monitor.url, {
      method: monitor.method,
      headers: monitor.headers || {},
      body: monitor.body || undefined,
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    const endTime = performance.now();
    const responseTimeMs = Math.round(endTime - startTime);
    
    // レスポンスボディを取得（最初の1000文字のみ）
    const responseText = await response.text();
    const responseSample = responseText.substring(0, 1000);
    
    // 成功判定
    const statusMatches = response.status === monitor.expected_status_code;
    const bodyMatches = monitor.expected_body_contains
      ? responseText.includes(monitor.expected_body_contains)
      : true;
    
    const success = statusMatches && bodyMatches;
    
    let errorMessage: string | null = null;
    if (!statusMatches) {
      errorMessage = `Expected status ${monitor.expected_status_code}, got ${response.status}`;
    } else if (!bodyMatches) {
      errorMessage = `Expected body to contain "${monitor.expected_body_contains}"`;
    }
    
    return {
      monitor_id: monitor.id,
      status_code: response.status,
      response_time_ms: responseTimeMs,
      success,
      error_message: errorMessage,
      response_body_sample: responseSample,
    };
    
  } catch (error) {
    const endTime = performance.now();
    const responseTimeMs = Math.round(endTime - startTime);
    
    let errorMessage = 'Unknown error';
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        errorMessage = `Request timeout after ${monitor.timeout_seconds}s`;
      } else {
        errorMessage = error.message;
      }
    }
    
    return {
      monitor_id: monitor.id,
      status_code: null,
      response_time_ms: responseTimeMs,
      success: false,
      error_message: errorMessage,
      response_body_sample: null,
    };
  }
}

// ==========================================
// 監視処理
// ==========================================

/**
 * 単一の監視設定を処理
 */
async function processMonitor(monitor: Monitor): Promise<void> {
  const db = getDbConnection(DATABASE_URL!);
  
  console.log(`[${new Date().toISOString()}] Checking: ${monitor.name} (${monitor.url})`);
  
  // API監視を実行
  const checkResult = await checkMonitor(monitor);
  
  // チェック結果を保存
  await saveCheckResult(db, {
    ...checkResult,
    checked_at: new Date().toISOString(),
  });
  
  // 次回チェック時刻を計算して更新
  const now = new Date();
  const nextCheckAt = new Date(now.getTime() + monitor.check_interval_seconds * 1000);
  
  await updateMonitorCheckTime(
    db,
    monitor.id,
    now.toISOString(),
    nextCheckAt.toISOString(),
  );
  
  // ログ出力
  if (checkResult.success) {
    console.log(`  ✓ Success: ${checkResult.status_code} (${checkResult.response_time_ms}ms)`);
  } else {
    console.log(`  ✗ Failed: ${checkResult.error_message}`);
  }
}

// ==========================================
// DB行ロックを使った監視取得
// ==========================================

/**
 * 次にチェックすべき監視設定を取得（行ロック付き）
 */
async function getMonitorsToCheckWithLock(): Promise<Monitor[]> {
  const db = getDbConnection(DATABASE_URL!);
  const now = new Date().toISOString();
  
  // まず対象の監視数を確認（ロックなし）
  const availableCount = await db<Array<{count: number}>>`
    SELECT COUNT(*) as count
    FROM monitors
    WHERE is_active = true
    AND next_check_at <= ${now}
  `;
  
  console.log(`[${now}]   → Available monitors: ${availableCount[0].count}`);
  
  // FOR UPDATE SKIP LOCKED で競合回避
  const monitors = await db<Monitor[]>`
    SELECT *
    FROM monitors
    WHERE is_active = true
    AND next_check_at <= ${now}
    ORDER BY next_check_at ASC
    LIMIT 50
    FOR UPDATE SKIP LOCKED
  `;
  
  const acquiredTime = new Date().toISOString();
  console.log(`[${acquiredTime}]   → Acquired monitors: ${monitors.length} (${availableCount[0].count - monitors.length} locked by other worker)`);
  
  return monitors;
}

// ==========================================
// メインループ
// ==========================================

async function main() {
  console.log('Pingmon Worker started');
  console.log(`Worker ID: ${Deno.hostname()}`);
  console.log('---');
  
  while (true) {
    try {
      // 次にチェックすべき監視を取得
      const monitors = await getMonitorsToCheckWithLock();
      
      if (monitors.length === 0) {
        console.log(`[${new Date().toISOString()}] No monitors to check`);
      } else {
        console.log(`[${new Date().toISOString()}] Processing ${monitors.length} monitors`);
        
        // 並行処理で監視を実行
        await Promise.all(monitors.map(monitor => processMonitor(monitor)));
      }
      
    } catch (error) {
      console.error('Error in main loop:', error);
    }
    
    // 30秒待機
    await new Promise(resolve => setTimeout(resolve, 30000));
  }
}

// ==========================================
// エントリーポイント
// ==========================================

if (import.meta.main) {
  main();
}

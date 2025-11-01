import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-pingmon-api-key",
};

// 構造化ログ出力関数
function logMetrics(metrics: {
  request_id: string;
  timestamp: string;
  worker_id?: string;
  status_code: number;
  response_type: "success" | "error";
  error_code?: string;
  duration_ms: number;
  monitors_count?: number;
}) {
  console.log(JSON.stringify({
    ...metrics,
    function_name: "get-monitors-to-check",
  }));
}

serve(async (req) => {
  // リクエスト開始時刻とID
  const requestId = crypto.randomUUID();
  const startTime = Date.now();
  const timestamp = new Date().toISOString();

  // CORS対応（プリフライトリクエスト）
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 認証チェック：Worker専用APIキー
    const apiKey = req.headers.get("X-Pingmon-API-Key");
    const expectedKey = Deno.env.get("PINGMON_WORKER_API_KEY");

    if (!apiKey || apiKey !== expectedKey) {
      const duration = Date.now() - startTime;
      console.error("Authentication failed: Invalid or missing API key");

      logMetrics({
        request_id: requestId,
        timestamp,
        status_code: 401,
        response_type: "error",
        error_code: "UNAUTHORIZED",
        duration_ms: duration,
      });

      return new Response(
        JSON.stringify({
          success: false,
          error: {
            code: "UNAUTHORIZED",
            message: "Invalid API key",
          },
        }),
        {
          status: 401,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        },
      );
    }

    // リクエストボディの取得
    const { worker_id } = await req.json();

    // バリデーション：worker_idが必須
    if (!worker_id) {
      const duration = Date.now() - startTime;

      logMetrics({
        request_id: requestId,
        timestamp,
        status_code: 400,
        response_type: "error",
        error_code: "INVALID_REQUEST",
        duration_ms: duration,
      });

      return new Response(
        JSON.stringify({
          success: false,
          error: {
            code: "INVALID_REQUEST",
            message: "worker_id is required",
          },
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        },
      );
    }

    // Supabase Clientの初期化（Service Role Key使用）
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Worker存在確認
    const { data: worker, error: workerError } = await supabase
      .from("workers")
      .select("id, is_active")
      .eq("id", worker_id)
      .single();

    if (workerError || !worker) {
      const duration = Date.now() - startTime;
      console.error(`Worker not found: ${worker_id}`);

      logMetrics({
        request_id: requestId,
        timestamp,
        worker_id,
        status_code: 404,
        response_type: "error",
        error_code: "WORKER_NOT_FOUND",
        duration_ms: duration,
      });

      return new Response(
        JSON.stringify({
          success: false,
          error: {
            code: "WORKER_NOT_FOUND",
            message: "Worker not found",
          },
        }),
        {
          status: 404,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        },
      );
    }

    // Worker有効性チェック
    if (!worker.is_active) {
      const duration = Date.now() - startTime;
      console.error(`Worker is not active: ${worker_id}`);

      logMetrics({
        request_id: requestId,
        timestamp,
        worker_id,
        status_code: 403,
        response_type: "error",
        error_code: "WORKER_INACTIVE",
        duration_ms: duration,
      });

      return new Response(
        JSON.stringify({
          success: false,
          error: {
            code: "WORKER_INACTIVE",
            message: "Worker is not active",
          },
        }),
        {
          status: 403,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        },
      );
    }

    // 監視対象取得（monitors + monitor_worker_schedule JOIN）
    const { data: monitors, error: monitorsError } = await supabase
      .from("monitors")
      .select(`
        id,
        name,
        url,
        method,
        headers,
        body,
        timeout_seconds,
        expected_status_code,
        expected_body_contains,
        monitor_worker_schedule!inner (
          check_minute,
          check_second,
          check_interval_seconds
        )
      `)
      .eq("monitor_worker_schedule.worker_id", worker_id)
      .eq("is_active", true);

    if (monitorsError) {
      const duration = Date.now() - startTime;
      console.error("Database query error:", monitorsError);

      logMetrics({
        request_id: requestId,
        timestamp,
        worker_id,
        status_code: 500,
        response_type: "error",
        error_code: "INTERNAL_ERROR",
        duration_ms: duration,
      });

      return new Response(
        JSON.stringify({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Database connection failed",
          },
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        },
      );
    }

    // レスポンスデータの整形
    const formattedMonitors = (monitors || []).map((m) => ({
      monitor_id: m.id,
      name: m.name,
      url: m.url,
      method: m.method,
      headers: m.headers || {},
      body: m.body,
      timeout_seconds: m.timeout_seconds,
      expected_status_code: m.expected_status_code,
      expected_body_contains: m.expected_body_contains,
      check_minute: m.monitor_worker_schedule[0].check_minute,
      check_second: m.monitor_worker_schedule[0].check_second,
      check_interval_seconds: m.monitor_worker_schedule[0]
        .check_interval_seconds,
    }));

    const duration = Date.now() - startTime;

    // 構造化ログ出力
    logMetrics({
      request_id: requestId,
      timestamp,
      worker_id,
      status_code: 200,
      response_type: "success",
      duration_ms: duration,
      monitors_count: formattedMonitors.length,
    });

    // 従来のログも出力（互換性のため）
    console.log(`[${worker_id}] Returned ${formattedMonitors.length} monitors`);

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          worker_id: worker_id,
          monitors: formattedMonitors,
        },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      },
    );
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error("Unexpected error:", error);

    logMetrics({
      request_id: requestId,
      timestamp,
      status_code: 500,
      response_type: "error",
      error_code: "INTERNAL_ERROR",
      duration_ms: duration,
    });

    return new Response(
      JSON.stringify({
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: error instanceof Error ? error.message : "Unknown error",
        },
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      },
    );
  }
});

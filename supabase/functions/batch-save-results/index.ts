import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-pingmon-api-key",
};

interface CheckResult {
  monitor_id: string;
  checked_at: string;
  status_code: number | null;
  response_time_ms: number | null;
  success: boolean;
  error_message: string | null;
  response_body_sample: string | null;
  worker_id: string;
}

serve(async (req) => {
  // CORS対応（プリフライトリクエスト）
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 認証チェック：Worker専用APIキー
    const apiKey = req.headers.get("X-Pingmon-API-Key");
    const expectedKey = Deno.env.get("PINGMON_WORKER_API_KEY");

    if (!apiKey || apiKey !== expectedKey) {
      console.error("Authentication failed: Invalid or missing API key");
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        {
          status: 401,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        },
      );
    }

    // リクエストボディの取得
    const { check_results } = await req.json();

    // バリデーション
    if (!Array.isArray(check_results) || check_results.length === 0) {
      return new Response(
        JSON.stringify({
          error: "check_results must be a non-empty array",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        },
      );
    }

    // バリデーション：最大件数チェック（DoS対策）
    if (check_results.length > 1000) {
      return new Response(
        JSON.stringify({
          error: "Too many results. Maximum 1000 per request.",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        },
      );
    }

    // 各結果の必須フィールドをバリデーション
    for (const result of check_results) {
      if (
        !result.monitor_id || !result.worker_id ||
        typeof result.success !== "boolean"
      ) {
        return new Response(
          JSON.stringify({
            error:
              "Invalid check_result format. Required: monitor_id, worker_id, success",
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          },
        );
      }
    }

    // Supabase Clientの初期化（Service Role Key使用）
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    const workerIds = [...new Set(check_results.map((r) => r.worker_id))];
    const monitorIds = [...new Set(check_results.map((r) => r.monitor_id))];

    // バッチINSERT
    const { data, error } = await supabase
      .from("check_results")
      .insert(check_results);

    if (error) {
      console.error("Database insert error:", error);
      return new Response(
        JSON.stringify({
          error: "Database insert failed",
          details: error.message,
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        },
      );
    }

    console.log(
      `[${
        workerIds.join(", ")
      }] Successfully inserted ${check_results.length} check results ` +
        `(monitors: ${monitorIds.length})`,
    );

    return new Response(
      JSON.stringify({
        success: true,
        inserted: check_results.length,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      },
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      },
    );
  }
});

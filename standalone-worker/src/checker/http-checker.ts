import type { Monitor, CheckExecutionResult } from "../types/types.ts";
import { Logger } from "../logger/logger.ts";

export class HttpChecker {
  private logger: Logger;
  private abortController: AbortController | null = null;

  constructor(logger?: Logger) {
    this.logger = logger || new Logger("http-checker");
  }

  async execute(monitor: Monitor): Promise<CheckExecutionResult> {
    const startTime = Date.now();
    this.abortController = new AbortController();

    try {
      // Prepare fetch options
      const fetchOptions: RequestInit = {
        method: monitor.method,
        signal: this.abortController.signal,
        headers: monitor.headers || {},
      };

      // Add body for POST/PUT/PATCH requests
      if (monitor.body && ["POST", "PUT", "PATCH"].includes(monitor.method)) {
        fetchOptions.body = monitor.body;
      }

      // Create timeout promise
      const timeoutMs = monitor.timeout_seconds * 1000;
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          this.abortController?.abort();
          reject(new Error(`Request timeout after ${monitor.timeout_seconds}s`));
        }, timeoutMs);
      });

      // Execute fetch with timeout
      const response = await Promise.race([
        fetch(monitor.url, fetchOptions),
        timeoutPromise,
      ]);

      const responseTimeMs = Date.now() - startTime;

      // Read response body (limit to first 500 characters)
      let responseBody = "";
      try {
        const text = await response.text();
        responseBody = text.substring(0, 500);
      } catch (error) {
        this.logger.warn("Failed to read response body", {
          monitor_id: monitor.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }

      // Validate status code
      let success = true;
      let errorMessage: string | null = null;

      if (
        monitor.expected_status_code !== undefined &&
        response.status !== monitor.expected_status_code
      ) {
        success = false;
        errorMessage =
          `Expected status code ${monitor.expected_status_code}, got ${response.status}`;
      }

      // Validate response body
      if (
        success &&
        monitor.expected_body_contains !== undefined &&
        !responseBody.includes(monitor.expected_body_contains)
      ) {
        success = false;
        errorMessage =
          `Response body does not contain expected text: "${monitor.expected_body_contains}"`;
      }

      const result: CheckExecutionResult = {
        success,
        status_code: response.status,
        response_time_ms: responseTimeMs,
        error_message: errorMessage,
        response_body_sample: responseBody || null,
      };

      this.logger.info("Check completed", {
        monitor_id: monitor.id,
        monitor_name: monitor.name,
        success,
        status_code: response.status,
        response_time_ms: responseTimeMs,
      });

      return result;
    } catch (error) {
      const responseTimeMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.logger.error("Check failed", {
        monitor_id: monitor.id,
        monitor_name: monitor.name,
        error: errorMessage,
        response_time_ms: responseTimeMs,
      });

      return {
        success: false,
        status_code: null,
        response_time_ms: responseTimeMs,
        error_message: errorMessage,
        response_body_sample: null,
      };
    } finally {
      this.abortController = null;
    }
  }

  abort(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.logger.warn("Check aborted");
    }
  }
}

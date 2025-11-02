import { WorkerConfig } from '../config/env.ts';
import { Logger } from '../logger/logger.ts';

export class ApiClient {
  protected readonly baseUrl: string;
  protected readonly apiKey: string;
  protected readonly retry: WorkerConfig['retry'];
  protected readonly logger: Logger;

  constructor(config: WorkerConfig, logger: Logger) {
    this.baseUrl = `${config.supabaseUrl}/functions/v1`;
    this.apiKey = config.apiKey;
    this.retry = config.retry;
    this.logger = logger;
  }

  protected async fetchWithRetry<T>(
    endpoint: string,
    options: RequestInit,
    requestId: string
  ): Promise<T> {
    let lastError: Error | null = null;
    let delay = this.retry.initialDelayMs;

    for (let attempt = 0; attempt <= this.retry.maxRetries; attempt++) {
      try {
        const startTime = Date.now();
        
        const response = await fetch(`${this.baseUrl}/${endpoint}`, {
          ...options,
          headers: {
            'X-Pingmon-API-Key': this.apiKey,
            'Content-Type': 'application/json',
            ...options.headers,
          },
        });

        const duration = Date.now() - startTime;

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const data = await response.json();

        this.logger.debug(`API request successful`, {
          request_id: requestId,
          endpoint,
          attempt: attempt + 1,
          duration_ms: duration,
        });

        return data as T;
      } catch (error) {
        lastError = error as Error;

        if (attempt < this.retry.maxRetries) {
          this.logger.warn(`API request failed, retrying...`, {
            request_id: requestId,
            endpoint,
            attempt: attempt + 1,
            max_retries: this.retry.maxRetries,
            delay_ms: delay,
            error: lastError.message,
          });

          await this.sleep(delay);
          delay = Math.min(delay * this.retry.backoffMultiplier, this.retry.maxDelayMs);
        }
      }
    }

    this.logger.error(`API request failed after all retries`, {
      request_id: requestId,
      endpoint,
      total_attempts: this.retry.maxRetries + 1,
      error: lastError?.message,
    });

    throw new Error(`API request failed: ${lastError?.message}`);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  protected generateRequestId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(7)}`;
  }
}

import { CheckResult } from '../types/check-result.ts';
import { ResultsClient } from '../api/results.ts';
import { BatcherConfig } from '../config/env.ts';
import { Logger } from '../logger/logger.ts';

export class ResultBatcher {
  private buffer: CheckResult[] = [];
  private firstAddedAt: Date | null = null;
  private flushTimer: number | null = null;
  private readonly config: BatcherConfig;
  private readonly resultsClient: ResultsClient;
  private readonly logger: Logger;

  constructor(config: BatcherConfig, resultsClient: ResultsClient, logger: Logger) {
    this.config = config;
    this.resultsClient = resultsClient;
    this.logger = logger;

    this.startFlushTimer();
  }

  add(result: CheckResult): void {
    this.buffer.push(result);

    if (this.firstAddedAt === null) {
      this.firstAddedAt = new Date();
    }

    this.logger.debug('Result added to buffer', {
      monitor_id: result.monitor_id,
      buffer_size: this.buffer.length,
    });

    if (this.buffer.length >= this.config.maxBatchSize) {
      this.logger.info('Buffer size limit reached, flushing');
      this.flush();
    }

    if (
      this.firstAddedAt &&
      Date.now() - this.firstAddedAt.getTime() >= this.config.maxWaitMs
    ) {
      this.logger.info('Max wait time reached, flushing');
      this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) {
      return;
    }

    const resultsToSend = [...this.buffer];
    this.buffer = [];
    this.firstAddedAt = null;

    this.logger.info('Flushing results', {
      count: resultsToSend.length,
    });

    try {
      const inserted = await this.resultsClient.batchSaveResults(resultsToSend);

      this.logger.info('Results saved successfully', {
        inserted,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.logger.error('Failed to save results', {
        count: resultsToSend.length,
        error: errorMessage,
      });

      this.buffer.push(...resultsToSend);
    }
  }

  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      if (this.buffer.length > 0) {
        this.logger.debug('Periodic flush triggered', {
          buffer_size: this.buffer.length,
        });
        this.flush();
      }
    }, this.config.flushIntervalMs);
  }

  async stop(): Promise<void> {
    this.logger.info('Stopping batcher');

    if (this.flushTimer !== null) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    await this.flush();

    this.logger.info('Batcher stopped');
  }

  getStats() {
    return {
      buffer_size: this.buffer.length,
      first_added_at: this.firstAddedAt?.toISOString() || null,
    };
  }
}

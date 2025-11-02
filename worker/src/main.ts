import { loadConfig } from './config/env.ts';
import { createLogger } from './logger/logger.ts';
import { MonitorsClient } from './api/monitors.ts';
import { ResultsClient } from './api/results.ts';
import { Scheduler } from './scheduler/scheduler.ts';
import { ResultBatcher } from './batcher/result-batcher.ts';

async function main() {
  const config = loadConfig();
  const logger = createLogger(config.workerId);

  logger.info('Starting Pingmon Worker', {
    worker_id: config.workerId,
    queue_strategy: config.queue.strategy,
    max_concurrent: config.queue.maxConcurrent,
  });

  const monitorsClient = new MonitorsClient(config, logger);
  const resultsClient = new ResultsClient(config, logger);

  const batcher = new ResultBatcher(config.batcher, resultsClient, logger);

  logger.info('Loading monitors');
  const monitors = await monitorsClient.getMonitorsToCheck(config.workerId);

  if (monitors.length === 0) {
    logger.warn('No monitors to check');
    return;
  }

  const scheduler = new Scheduler(
    config.workerId,
    config.queue,
    logger,
    (result) => {
      batcher.add(result);
    }
  );

  scheduler.start(monitors);

  const reloadInterval = setInterval(async () => {
    try {
      logger.info('Reloading monitors');
      const updatedMonitors = await monitorsClient.getMonitorsToCheck(config.workerId);
      scheduler.updateMonitors(updatedMonitors);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to reload monitors', {
        error: errorMessage,
      });
    }
  }, config.reload.intervalMs);

  const statsInterval = setInterval(() => {
    const schedulerStats = scheduler.getStats();
    const batcherStats = batcher.getStats();

    logger.info('Worker statistics', {
      scheduler: schedulerStats,
      batcher: batcherStats,
    });
  }, 60000);

  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down gracefully`);

    clearInterval(reloadInterval);
    clearInterval(statsInterval);

    scheduler.stop();

    await batcher.stop();

    logger.info('Shutdown complete');
    Deno.exit(0);
  };

  Deno.addSignalListener('SIGINT', () => shutdown('SIGINT'));
  Deno.addSignalListener('SIGTERM', () => shutdown('SIGTERM'));

  logger.info('Worker started successfully');
}

try {
  await main();
} catch (error) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  console.error(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      message: 'Worker failed to start',
      error: errorMessage,
    })
  );
  Deno.exit(1);
}

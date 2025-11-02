import { ApiClient } from './client.ts';
import { MonitorWithPlan } from '../types/monitor.ts';
import { GetMonitorsResponse } from '../types/api.ts';

export class MonitorsClient extends ApiClient {
  async getMonitorsToCheck(workerId: string): Promise<MonitorWithPlan[]> {
    const requestId = this.generateRequestId();

    this.logger.info('Fetching monitors to check', {
      request_id: requestId,
      worker_id: workerId,
    });

    const response = await this.fetchWithRetry<GetMonitorsResponse>(
      'get-monitors-to-check',
      {
        method: 'POST',
        body: JSON.stringify({ worker_id: workerId }),
      },
      requestId
    );

    if (!response.success || !response.data) {
      throw new Error('Invalid response from get-monitors-to-check');
    }

    const monitors = response.data.monitors as MonitorWithPlan[];

    this.logger.info(`Loaded monitors`, {
      request_id: requestId,
      count: monitors.length,
    });

    return monitors;
  }
}

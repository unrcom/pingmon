import { ApiClient } from './client.ts';
import { CheckResult } from '../types/check-result.ts';
import {
  BatchSaveResultsRequest,
  BatchSaveResultsResponse,
} from '../types/api.ts';

export class ResultsClient extends ApiClient {
  async batchSaveResults(results: CheckResult[]): Promise<number> {
    if (results.length === 0) {
      this.logger.warn('No results to save');
      return 0;
    }

    if (results.length > 1000) {
      throw new Error('Too many results. Maximum 1000 per request.');
    }

    const requestId = this.generateRequestId();

    this.logger.info('Saving check results', {
      request_id: requestId,
      count: results.length,
    });

    const request: BatchSaveResultsRequest = {
      check_results: results,
    };

    const response = await this.fetchWithRetry<BatchSaveResultsResponse>(
      'batch-save-results',
      {
        method: 'POST',
        body: JSON.stringify(request),
      },
      requestId
    );

    if (!response.success) {
      throw new Error('Failed to save results');
    }

    this.logger.info(`Saved check results`, {
      request_id: requestId,
      inserted: response.inserted,
    });

    return response.inserted;
  }
}

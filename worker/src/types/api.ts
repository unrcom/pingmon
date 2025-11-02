import { Monitor } from './monitor.ts';
import { CheckResult } from './check-result.ts';

export interface GetMonitorsResponse {
  success: boolean;
  data: {
    worker_id: string;
    monitors: Monitor[];
  };
}

export interface BatchSaveResultsRequest {
  check_results: CheckResult[];
}

export interface BatchSaveResultsResponse {
  success: boolean;
  inserted: number;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
  };
}

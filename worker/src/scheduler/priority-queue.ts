import { MonitorWithPlan } from '../types/monitor.ts';
import { QueueConfig } from '../config/env.ts';

export interface QueuedCheck {
  monitor: MonitorWithPlan;
  scheduledAt: Date;
  addedAt: Date;
}

export class PriorityQueueManager {
  private queues: {
    max: QueuedCheck[];
    pro: QueuedCheck[];
    free: QueuedCheck[];
  } = {
    max: [],
    pro: [],
    free: [],
  };

  private running = 0;
  private readonly config: QueueConfig;
  private onExecute: (check: QueuedCheck) => Promise<void>;

  constructor(config: QueueConfig, onExecute: (check: QueuedCheck) => Promise<void>) {
    this.config = config;
    this.onExecute = onExecute;
  }

  enqueue(monitor: MonitorWithPlan, scheduledAt: Date): void {
    const queuedCheck: QueuedCheck = {
      monitor,
      scheduledAt,
      addedAt: new Date(),
    };

    const plan = monitor.user_plan;
    this.queues[plan].push(queuedCheck);

    this.process();
  }

  private async process(): Promise<void> {
    while (this.running < this.config.maxConcurrent) {
      const check = this.dequeue();
      if (!check) break;

      this.running++;

      this.onExecute(check).finally(() => {
        this.running--;
        this.process();
      });
    }
  }

  private dequeue(): QueuedCheck | null {
    switch (this.config.strategy) {
      case 'weighted':
        return this.dequeueWeighted();
      case 'strict':
        return this.dequeueStrict();
      default:
        throw new Error(`Unknown queue strategy: ${this.config.strategy}`);
    }
  }

  private dequeueWeighted(): QueuedCheck | null {
    const maxSize = this.queues.max.length;
    const proSize = this.queues.pro.length;
    const freeSize = this.queues.free.length;

    if (maxSize === 0 && proSize === 0 && freeSize === 0) {
      return null;
    }

    const weights: Array<{ plan: 'max' | 'pro' | 'free'; weight: number }> = [];

    if (maxSize > 0) {
      weights.push({
        plan: 'max',
        weight: this.config.planSettings.max.queueWeight,
      });
    }
    if (proSize > 0) {
      weights.push({
        plan: 'pro',
        weight: this.config.planSettings.pro.queueWeight,
      });
    }
    if (freeSize > 0) {
      weights.push({
        plan: 'free',
        weight: this.config.planSettings.free.queueWeight,
      });
    }

    const selectedPlan = this.weightedRandomSelect(weights);

    return this.queues[selectedPlan].shift() || null;
  }

  private dequeueStrict(): QueuedCheck | null {
    if (this.queues.max.length > 0) {
      return this.queues.max.shift() || null;
    }

    if (this.queues.pro.length > 0) {
      return this.queues.pro.shift() || null;
    }

    if (this.queues.free.length > 0) {
      return this.queues.free.shift() || null;
    }

    return null;
  }

  private weightedRandomSelect(
    weights: Array<{ plan: 'max' | 'pro' | 'free'; weight: number }>
  ): 'max' | 'pro' | 'free' {
    const totalWeight = weights.reduce((sum, w) => sum + w.weight, 0);
    let random = Math.random() * totalWeight;

    for (const item of weights) {
      random -= item.weight;
      if (random <= 0) {
        return item.plan;
      }
    }

    return weights[0].plan;
  }

  getStats() {
    return {
      strategy: this.config.strategy,
      queues: {
        max: this.queues.max.length,
        pro: this.queues.pro.length,
        free: this.queues.free.length,
      },
      running: this.running,
      available: this.config.maxConcurrent - this.running,
    };
  }
}

const DEFAULT_REALTIME_COALESCE_MS = 120;

export interface RealtimeSchedulerMetric {
  batchKeyCount: number;
  duplicateKeyCount: number;
  errorCount: number;
  lastDurationMs: number | null;
  lastError: string | null;
  lastRunAtMs: number | null;
  lastTriggeredAtMs: number | null;
  maxBatchSize: number;
  name: string;
  queuedWhileInFlightCount: number;
  runCount: number;
  scheduledCount: number;
  totalDurationMs: number;
  triggerCount: number;
}

interface RealtimeSchedulerMetricsRegistry {
  reset: () => void;
  snapshot: () => Record<string, RealtimeSchedulerMetric>;
}

interface RealtimeSchedulerOptions {
  metricName?: string;
}

type MetricsGlobal = typeof globalThis & {
  __COMTAMMATU_REALTIME_METRICS__?: RealtimeSchedulerMetricsRegistry;
};

const metricStore = new Map<string, RealtimeSchedulerMetric>();
let installedRegistry: RealtimeSchedulerMetricsRegistry | null = null;

function emptyMetric(name: string): RealtimeSchedulerMetric {
  return {
    batchKeyCount: 0,
    duplicateKeyCount: 0,
    errorCount: 0,
    lastDurationMs: null,
    lastError: null,
    lastRunAtMs: null,
    lastTriggeredAtMs: null,
    maxBatchSize: 0,
    name,
    queuedWhileInFlightCount: 0,
    runCount: 0,
    scheduledCount: 0,
    totalDurationMs: 0,
    triggerCount: 0,
  };
}

function getMetric(name: string): RealtimeSchedulerMetric {
  const existing = metricStore.get(name);
  if (existing) return existing;
  const metric = emptyMetric(name);
  metricStore.set(name, metric);
  return metric;
}

function snapshotMetrics(): Record<string, RealtimeSchedulerMetric> {
  return Object.fromEntries(
    Array.from(metricStore.entries()).map(([name, metric]) => [
      name,
      { ...metric },
    ]),
  );
}

function installMetricsRegistry(): RealtimeSchedulerMetricsRegistry {
  if (!installedRegistry) {
    installedRegistry = {
      reset: () => metricStore.clear(),
      snapshot: snapshotMetrics,
    };
  }
  const metricsGlobal = globalThis as MetricsGlobal;
  if (metricsGlobal.__COMTAMMATU_REALTIME_METRICS__ !== installedRegistry) {
    metricsGlobal.__COMTAMMATU_REALTIME_METRICS__ = installedRegistry;
  }
  return installedRegistry;
}

export function getRealtimeMetricsSnapshot(): Record<
  string,
  RealtimeSchedulerMetric
> {
  return installMetricsRegistry().snapshot();
}

export function resetRealtimeMetrics(): void {
  installMetricsRegistry().reset();
}

function metricNow(): number {
  if (typeof performance !== "undefined") return performance.now();
  return Date.now();
}

function formatMetricError(error: unknown): string {
  if (error instanceof Error) return error.name || "Error";
  if (typeof error === "string") return "Error";
  return "Unknown realtime scheduler error";
}

function recordMetric(
  metricName: string | undefined,
  update: (metric: RealtimeSchedulerMetric) => void,
): void {
  if (!metricName) return;
  installMetricsRegistry();
  update(getMetric(metricName));
}

/**
 * Coalesce realtime/refetch bursts into one delayed run, while preserving a
 * trailing run if more invalidations arrive during the in-flight request.
 */
export function makeRealtimeCoalescer(
  fn: () => Promise<void>,
  delayMs = DEFAULT_REALTIME_COALESCE_MS,
  options: RealtimeSchedulerOptions = {},
): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inflight: Promise<void> | null = null;
  let pending = false;
  const metricName = options.metricName;

  const schedule = (): void => {
    if (timer !== null) return;
    recordMetric(metricName, (metric) => {
      metric.scheduledCount += 1;
    });
    timer = setTimeout(run, delayMs);
  };

  const run = (): void => {
    timer = null;
    if (inflight !== null) {
      pending = true;
      recordMetric(metricName, (metric) => {
        metric.queuedWhileInFlightCount += 1;
      });
      return;
    }

    const startedAt = metricNow();
    recordMetric(metricName, (metric) => {
      metric.lastRunAtMs = startedAt;
      metric.runCount += 1;
    });

    inflight = Promise.resolve()
      .then(fn)
      .catch((error: unknown) => {
        recordMetric(metricName, (metric) => {
          metric.errorCount += 1;
          metric.lastError = formatMetricError(error);
        });
      })
      .finally(() => {
        const durationMs = metricNow() - startedAt;
        recordMetric(metricName, (metric) => {
          metric.lastDurationMs = durationMs;
          metric.totalDurationMs += durationMs;
        });
        inflight = null;
        if (pending) {
          pending = false;
          schedule();
        }
      });
  };

  return (): void => {
    recordMetric(metricName, (metric) => {
      metric.lastTriggeredAtMs = metricNow();
      metric.triggerCount += 1;
    });
    schedule();
  };
}

/**
 * Batch keyed realtime invalidations. Useful when several row-level events
 * point at the same aggregate snapshot, such as many KDS tickets for one order.
 */
export function makeKeyedRealtimeBatcher<Key>(
  fn: (keys: Key[]) => Promise<void>,
  delayMs = DEFAULT_REALTIME_COALESCE_MS,
  options: RealtimeSchedulerOptions = {},
): (key: Key) => void {
  const queued = new Set<Key>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inflight: Promise<void> | null = null;
  let pending = false;
  const metricName = options.metricName;

  const schedule = (): void => {
    if (timer !== null) return;
    recordMetric(metricName, (metric) => {
      metric.scheduledCount += 1;
    });
    timer = setTimeout(run, delayMs);
  };

  const run = (): void => {
    timer = null;
    if (inflight !== null) {
      pending = true;
      recordMetric(metricName, (metric) => {
        metric.queuedWhileInFlightCount += 1;
      });
      return;
    }

    const keys = Array.from(queued);
    queued.clear();
    if (keys.length === 0) return;

    const startedAt = metricNow();
    recordMetric(metricName, (metric) => {
      metric.batchKeyCount += keys.length;
      metric.lastRunAtMs = startedAt;
      metric.maxBatchSize = Math.max(metric.maxBatchSize, keys.length);
      metric.runCount += 1;
    });

    inflight = Promise.resolve()
      .then(() => fn(keys))
      .catch((error: unknown) => {
        recordMetric(metricName, (metric) => {
          metric.errorCount += 1;
          metric.lastError = formatMetricError(error);
        });
      })
      .finally(() => {
        const durationMs = metricNow() - startedAt;
        recordMetric(metricName, (metric) => {
          metric.lastDurationMs = durationMs;
          metric.totalDurationMs += durationMs;
        });
        inflight = null;
        if (pending || queued.size > 0) {
          pending = false;
          schedule();
        }
      });
  };

  return (key: Key): void => {
    recordMetric(metricName, (metric) => {
      metric.lastTriggeredAtMs = metricNow();
      metric.triggerCount += 1;
    });
    const sizeBeforeAdd = queued.size;
    queued.add(key);
    if (queued.size === sizeBeforeAdd) {
      recordMetric(metricName, (metric) => {
        metric.duplicateKeyCount += 1;
      });
    }
    schedule();
  };
}

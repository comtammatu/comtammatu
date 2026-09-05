const inflight = new Map<string, Promise<unknown>>();

/**
 * Share one in-flight promise for an identical client fetch. TTL is zero
 * after settle — the next call always starts a fresh request. Do not use
 * this as a cache for POS, KDS, money, stock, or notifications.
 */
export function dedupeInflight<T>(
  key: string,
  run: () => Promise<T>,
): Promise<T> {
  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;

  const pending = Promise.resolve()
    .then(run)
    .finally(() => {
      if (inflight.get(key) === pending) inflight.delete(key);
    });
  inflight.set(key, pending);
  return pending;
}

export function resetInflightDedupe(): void {
  inflight.clear();
}

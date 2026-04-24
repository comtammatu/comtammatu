/**
 * In-flight deduper with trailing follow-up.
 *
 * Guarantees eventual consistency (the LAST caller always produces a
 * fetch) while collapsing bursts into at most 2 fetches total — the
 * current in-flight call, plus one trailing call if another arrived
 * while it was running.
 *
 * No artificial time delay: the dedup window is defined by the
 * in-flight promise itself. Two calls within the same RPC round-trip
 * are coalesced; two calls serialized back-to-back are NOT coalesced.
 *
 * Designed to be shared between:
 *   - realtime `postgres_changes` handlers
 *   - SUBSCRIBED-on-reconnect catch-up
 *   - visibility / stale polls
 *   - post-mutation shell refresh (refreshOperational)
 *
 * NOT used behind the manual "Tải lại" button — that path calls the
 * raw dispatcher so the operator always gets an immediate round-trip.
 */
export function makeDeduper(fn: () => Promise<void>): () => void {
  let inflight: Promise<void> | null = null;
  let pending = false;
  const run = (): void => {
    if (inflight !== null) {
      pending = true;
      return;
    }
    inflight = fn().finally(() => {
      inflight = null;
      if (pending) {
        pending = false;
        run();
      }
    });
  };
  return run;
}

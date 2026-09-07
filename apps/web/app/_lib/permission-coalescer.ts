import { cache } from "react";
import { createClient } from "@comtammatu/database/supabase/server";

export type PermissionProbe = {
  key: string;
  branchId: number | null;
};

export type PermissionBatchRpc = (
  items: readonly PermissionProbe[],
) => Promise<boolean[]>;

function probeId(item: PermissionProbe): string {
  return item.branchId == null
    ? `${item.key}\0any`
    : `${item.key}\0${String(item.branchId)}`;
}

/**
 * Request-scoped DataLoader for permission probes. Overlapping sets in the
 * same microtask wave share one `has_permission_batch` RPC; later waves reuse
 * already-resolved pairs without a second round-trip.
 */
export function createPermissionCoalescer(rpc: PermissionBatchRpc): {
  probe: (key: string, branchId?: number | null) => Promise<boolean>;
} {
  const resolved = new Map<string, boolean>();
  const inflight = new Map<string, Promise<boolean>>();
  let queue = new Map<string, PermissionProbe>();
  let flush: Promise<void> | null = null;

  async function dispatch(): Promise<void> {
    const batch = queue;
    queue = new Map();
    flush = null;
    const items = [...batch.values()];
    if (items.length === 0) return;

    let answers: boolean[] = [];
    try {
      answers = await rpc(items);
    } catch {
      answers = items.map(() => false);
    }

    items.forEach((item, index) => {
      resolved.set(probeId(item), answers[index] === true);
    });
  }

  async function probe(
    key: string,
    branchId?: number | null,
  ): Promise<boolean> {
    const item: PermissionProbe = { key, branchId: branchId ?? null };
    const id = probeId(item);
    const cached = resolved.get(id);
    if (cached !== undefined) return cached;

    const pending = inflight.get(id);
    if (pending) return pending;

    queue.set(id, item);
    flush ??= Promise.resolve().then(() => dispatch());
    const result = flush.then(() => resolved.get(id) === true);
    inflight.set(id, result);
    try {
      return await result;
    } finally {
      inflight.delete(id);
    }
  }

  return { probe };
}

const getRequestCoalescer = cache(() =>
  createPermissionCoalescer(async (items) => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("has_permission_batch", {
      p_items: items.map((item) => ({
        key: item.key,
        branch_id: item.branchId,
      })),
    });
    if (error || !Array.isArray(data) || data.length !== items.length) {
      return items.map(() => false);
    }
    return data.map((value) => value === true);
  }),
);

export async function probePermissionKey(
  key: string,
  branchId?: number | null,
): Promise<boolean> {
  return getRequestCoalescer().probe(key, branchId);
}

import type { createServiceClient } from "@comtammatu/database/supabase/service";

/** Manager wait before a leftover Kết ca request auto-closes. */
export const CHECKOUT_AUTO_APPROVE_AFTER_HOURS = 2;
export const CHECKOUT_AUTO_APPROVE_AFTER_MS =
  CHECKOUT_AUTO_APPROVE_AFTER_HOURS * 60 * 60 * 1000;
export const CHECKOUT_AUTO_APPROVE_NOTE = "Tự động duyệt kết ca";
const CHECKOUT_AUTO_APPROVE_BATCH = 100;

type ServiceClient = ReturnType<typeof createServiceClient>;

export function getCheckoutAutoApproveCutoffIso(now: Date): string {
  return new Date(now.getTime() - CHECKOUT_AUTO_APPROVE_AFTER_MS).toISOString();
}

export function isCheckoutPendingStale(
  requestedAt: string | null | undefined,
  now: Date,
): boolean {
  if (!requestedAt) return false;
  const requestedMs = Date.parse(requestedAt);
  if (!Number.isFinite(requestedMs)) return false;
  return now.getTime() - requestedMs >= CHECKOUT_AUTO_APPROVE_AFTER_MS;
}

export async function autoApproveStaleCheckouts(
  service: ServiceClient,
  now: Date = new Date(),
): Promise<{ closed: number; cutoff: string }> {
  const cutoff = getCheckoutAutoApproveCutoffIso(now);
  const closedAt = now.toISOString();
  const { data: rows, error } = await service
    .from("attendance_records")
    .select("id, checkout_requested_at")
    .is("check_out", null)
    .not("checkout_requested_at", "is", null)
    .lte("checkout_requested_at", cutoff)
    .order("checkout_requested_at", { ascending: true })
    .limit(CHECKOUT_AUTO_APPROVE_BATCH);

  if (error) {
    throw new Error("stale_checkout_select_failed");
  }

  let closed = 0;
  for (const row of rows ?? []) {
    const requestedAt = row.checkout_requested_at;
    if (!requestedAt) continue;
    const { data: updated, error: updateError } = await service
      .from("attendance_records")
      .update({
        check_out: requestedAt,
        checkout_approved_at: closedAt,
        checkout_approved_by: null,
        checkout_approval_note: CHECKOUT_AUTO_APPROVE_NOTE,
        updated_at: closedAt,
      })
      .eq("id", row.id)
      .is("check_out", null)
      .not("checkout_requested_at", "is", null)
      .select("id")
      .maybeSingle();
    if (updateError) {
      throw new Error("stale_checkout_update_failed");
    }
    if (updated) closed += 1;
  }

  return { closed, cutoff };
}

import { createClient } from "@comtammatu/database/supabase/server";
import { extractClaimsFromAccessToken } from "@comtammatu/shared/auth";
import { fetchExpiryAlerts } from "@/inventory/actions";
import {
  resolveInventoryBranchScope,
  resolveRequestedBranchId,
} from "@/inventory/_lib/inventory-scope";
import { resolveDefaultInventoryLocation } from "@/inventory/_lib/inventory-location-compat";
import { MobileExpiryClient } from "@/inventory/m/expiry/mobile-expiry-client";
import type { ExpiryAlertRow } from "@/inventory/page";

export default async function MobileExpiryPage({
  searchParams,
}: {
  searchParams: Promise<{ branchId?: string | string[] }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const claims = session?.user
    ? extractClaimsFromAccessToken(session.access_token)
    : null;

  const requested = await resolveRequestedBranchId(params.branchId);
  const scope = claims
    ? await resolveInventoryBranchScope(supabase, claims, requested)
    : null;
  const branchFilter = scope?.selectedBranchId ?? undefined;

  const alertsRes = await fetchExpiryAlerts(branchFilter);
  const alerts: ExpiryAlertRow[] = alertsRes.success
    ? ((alertsRes.data ?? []) as ExpiryAlertRow[])
    : [];

  // Pre-resolve default issue location per branch — same pattern as the
  // desktop expiry page so the waste sheet has a location ready at click.
  const branchIdsWithAlerts = Array.from(
    new Set(alerts.map((alert) => alert.branch_id)),
  );
  const tenantId = claims?.tenant_id ?? null;
  const locationEntries = tenantId
    ? await Promise.all(
        branchIdsWithAlerts.map(async (branchId) => {
          try {
            const locationId = await resolveDefaultInventoryLocation(
              supabase,
              tenantId,
              branchId,
              "issue",
            );
            return [branchId, locationId] as const;
          } catch {
            return [branchId, null] as const;
          }
        }),
      )
    : [];
  const defaultLocationByBranch: Record<number, number | null> =
    Object.fromEntries(locationEntries);

  return (
    <MobileExpiryClient
      alerts={alerts}
      defaultLocationByBranch={defaultLocationByBranch}
    />
  );
}

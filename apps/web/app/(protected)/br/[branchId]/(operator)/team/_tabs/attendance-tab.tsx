import { notFound } from "next/navigation";
import { PERMISSION_KEYS } from "@comtammatu/shared/auth";
import { AppEmptyState } from "@/components/surface";
import { AttendanceTable } from "../../../../../hr/attendance-table";
import { loadAuthState, probePermission } from "@/_lib/auth";
import { resolveBranchContext } from "@/_lib/branch-context";

interface TabProps {
  branchId: number;
}

/**
 * Attendance tab inside the Team hub. Mirrors the legacy
 * `/br/{branchId}/shift/attendance` presentation without nested AppPage.
 */
export async function AttendanceTab({ branchId }: TabProps) {
  if (!Number.isInteger(branchId) || branchId <= 0) notFound();
  const { supabase, claims } = await loadAuthState();
  const context = await resolveBranchContext(supabase, claims, branchId);
  if (!context) notFound();
  const [canView, canForceClose] = await Promise.all([
    probePermission(
      { supabase, claims },
      PERMISSION_KEYS.HR_VIEW_EMPLOYEE,
      context.branchId,
    ),
    probePermission(
      { supabase, claims },
      PERMISSION_KEYS.HR_FORCE_CLOSE_ATTENDANCE,
      context.branchId,
    ),
  ]);

  if (!canView) return <AppEmptyState mode="no-access" />;

  return (
    <AttendanceTable
      branches={[
        {
          id: context.branchId,
          name: context.branch.name,
          branch_kind: context.branch.branch_kind,
        },
      ]}
      initialBranchId={context.branchId}
      initialBranchScope={String(context.branchId)}
      routePath={`/br/${context.branchId}/team`}
      canForceClose={canForceClose}
    />
  );
}

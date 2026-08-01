import { notFound } from "next/navigation";
import { PERMISSION_KEYS } from "@comtammatu/shared/auth";
import { AppEmptyState } from "@/components/surface";
import { AttendanceTable } from "../../../../../hr/attendance-table";
import { BranchOperatorPage } from "@lib/branch-operator/components/branch-operator-page";
import { loadAuthState, probePermission } from "@/_lib/auth";
import { resolveBranchContext } from "@/_lib/branch-context";
import { parseOperatorBranchId } from "../../../_lib/parse-branch-id";
import { messages } from "@lib/messages";

export default async function BranchAttendancePage({
  params,
}: {
  params: Promise<{ branchId: string }>;
}) {
  const { branchId: rawBranchId } = await params;
  const branchId = parseOperatorBranchId(rawBranchId);
  if (branchId == null) notFound();

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

  return (
    <BranchOperatorPage
      title={messages.hr.client.branchAttendanceTitle}
      description={context.branch.name}
    >
      {canView ? (
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
          routePath={`/br/${context.branchId}/shift/attendance`}
          canForceClose={canForceClose}
        />
      ) : (
        <AppEmptyState mode="no-access" />
      )}
    </BranchOperatorPage>
  );
}

import { Suspense } from "react";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { loadBranchCountAssignmentData } from "@lib/inventory/branch-count-assignment-data";
import { BranchCountAssignmentsClient } from "../../stock/count-assignments/branch-count-assignments-client";

export async function TeamAssignmentsContent({
  branchId,
}: {
  branchId: number;
}) {
  const data = await loadBranchCountAssignmentData({ routeBranchId: branchId });

  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-4">
          <Spinner />
        </div>
      }
    >
      <BranchCountAssignmentsClient data={data} embeddedInTeam />
    </Suspense>
  );
}

import { Suspense } from "react";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { CountAssignmentsPageContent } from "@/(protected)/inventory/count-assignments/page";

export function TeamAssignmentsContent({
  branchId,
}: {
  branchId: number;
}) {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-4">
          <Spinner />
        </div>
      }
    >
      <CountAssignmentsPageContent
        routeBranchId={branchId}
        embedded={true}
        basePath={`/br/${branchId}/stock/count-assignments`}
      />
    </Suspense>
  );
}

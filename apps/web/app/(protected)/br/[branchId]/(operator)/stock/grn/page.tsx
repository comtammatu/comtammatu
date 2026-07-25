import { notFound } from "next/navigation";
import { loadGrnListPageData } from "@lib/inventory/grn-list-data";
import { parseOperatorBranchId } from "../../../_lib/parse-branch-id";
import { BranchGrnListClient } from "./branch-grn-list-client";

interface PageProps {
  params: Promise<{ branchId: string }>;
}

export default async function OperatorStockGrnPage({ params }: PageProps) {
  const { branchId: rawBranchId } = await params;
  const branchId = parseOperatorBranchId(rawBranchId);
  if (branchId == null) notFound();

  const data = await loadGrnListPageData({ routeBranchId: branchId });

  return (
    <BranchGrnListClient
      branchId={branchId}
      canCreate={data.canCreate}
      drafts={data.drafts.map(
        ({
          grnId,
          supplierId,
          poId,
          poCode,
          supplierName,
          grnNumber,
          updatedAt,
          lineCount,
          qcIssueCount,
        }) => ({
          grnId,
          supplierId,
          poId,
          poCode,
          supplierName,
          grnNumber,
          updatedAt,
          lineCount,
          qcIssueCount,
        }),
      )}
      draftsLoadFailed={data.draftsLoadFailed}
      grns={data.grns.map(
        ({
          id,
          code,
          supplierName,
          poId,
          poCode,
          date,
          status,
          qcIssueCount,
        }) => ({
          id,
          code,
          supplierName,
          poId,
          poCode,
          date,
          status,
          qcIssueCount,
        }),
      )}
      grnsLoadFailed={data.grnsLoadFailed}
    />
  );
}

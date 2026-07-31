import { notFound, redirect } from "next/navigation";
import { PERMISSION_KEYS } from "@comtammatu/shared/auth";
import { loadAuthState, probePermission } from "@/_lib/auth";
import { resolveBranchContext } from "@/_lib/branch-context";
import { loadGrnListPageData } from "@lib/inventory/grn-list-data";
import type { GrnListRow } from "@lib/inventory/grn-list-model";
import { parseOperatorBranchId } from "../../../_lib/parse-branch-id";
import { BranchGrnListClient } from "./branch-grn-list-client";

function qcIssueCount(row: GrnListRow): number {
  return row.shortageLineCount + row.excessLineCount + row.rejectedLineCount;
}

interface PageProps {
  params: Promise<{ branchId: string }>;
}

export default async function OperatorStockGrnPage({ params }: PageProps) {
  const { branchId: rawBranchId } = await params;
  const branchId = parseOperatorBranchId(rawBranchId);
  if (branchId == null) notFound();

  const auth = await loadAuthState();
  const branchContext = await resolveBranchContext(
    auth.supabase,
    auth.claims,
    branchId,
  );
  if (!branchContext) notFound();
  if (branchContext.branch.branch_kind === "branch") {
    redirect(`/br/${branchId}/stock/transfer`);
  }

  const [data, canCreate] = await Promise.all([
    loadGrnListPageData({ routeBranchId: branchId }),
    probePermission(auth, PERMISSION_KEYS.PROCUREMENT_GRN_CREATE, branchId),
  ]);

  const drafts = data.rows
    .filter((row) => row.status === "draft")
    .map((row) => ({
      grnId: row.id,
      supplierId: row.supplierId,
      poId: row.poId,
      poCode: row.poCode,
      poCount: 1,
      poStatus: null as string | null,
      supplierName: row.supplierName,
      grnNumber: row.code,
      updatedAt: row.updatedAt,
      lineCount: row.lineCount,
      qcIssueCount: qcIssueCount(row),
    }));
  const grns = data.rows
    .filter((row) => row.status !== "draft")
    .map((row) => ({
      id: row.id,
      code: row.code,
      supplierName: row.supplierName,
      poId: row.poId,
      poCode: row.poCode,
      poCount: 1,
      poStatus: null as string | null,
      date: row.receivedDate ?? row.expectedReceiveDate ?? "",
      status: row.status,
      qcIssueCount: qcIssueCount(row),
    }));

  return (
    <BranchGrnListClient
      branchId={branchId}
      canCreate={canCreate}
      drafts={drafts}
      draftsLoadFailed={data.loadFailed}
      grns={grns}
      grnsLoadFailed={data.loadFailed}
    />
  );
}

import { notFound } from "next/navigation";
import { WasteApprovalsPageContent } from "@/(protected)/inventory/waste/approvals/page";

interface PageProps {
  params: Promise<{ branchId: string }>;
}

export default async function OperatorWasteApprovalsPage({
  params,
}: PageProps) {
  const { branchId: rawBranchId } = await params;
  const branchId = Number(rawBranchId);
  if (!Number.isInteger(branchId) || branchId <= 0) notFound();

  return <WasteApprovalsPageContent routeBranchId={branchId} embedded />;
}

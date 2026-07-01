import { notFound } from "next/navigation";
import { ReportsPageContent } from "@/(protected)/inventory/reports/page";

interface PageProps {
  params: Promise<{ branchId: string }>;
}

export default async function OperatorStockReportsPage({ params }: PageProps) {
  const { branchId: rawBranchId } = await params;
  const branchId = Number(rawBranchId);
  if (!Number.isInteger(branchId) || branchId <= 0) notFound();

  return <ReportsPageContent routeBranchId={branchId} embedded />;
}

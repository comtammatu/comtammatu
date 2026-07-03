import { notFound } from "next/navigation";
import { ProductionPageContent } from "@/(protected)/inventory/production/page";

interface PageProps {
  params: Promise<{ branchId: string }>;
}

export default async function OperatorProductionPage({
  params,
}: PageProps) {
  const { branchId: rawBranchId } = await params;
  const branchId = Number(rawBranchId);
  if (!Number.isInteger(branchId) || branchId <= 0) notFound();

  return <ProductionPageContent routeBranchId={branchId} embedded />;
}

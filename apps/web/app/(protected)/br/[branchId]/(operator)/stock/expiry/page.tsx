import { notFound } from "next/navigation";
import { ExpiryPageContent } from "@/(protected)/inventory/expiry/page";

interface PageProps {
  params: Promise<{ branchId: string }>;
}

export default async function OperatorStockExpiryPage({ params }: PageProps) {
  const { branchId: rawBranchId } = await params;
  const branchId = Number(rawBranchId);
  if (!Number.isInteger(branchId) || branchId <= 0) notFound();

  return <ExpiryPageContent routeBranchId={branchId} embedded />;
}

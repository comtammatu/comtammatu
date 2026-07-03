import { notFound } from "next/navigation";
import { OrdersPageContent } from "@/(protected)/orders/page";

interface PageProps {
  params: Promise<{ branchId: string }>;
}

export default async function OperatorOrdersPage({ params }: PageProps) {
  const { branchId: rawBranchId } = await params;
  const branchId = Number(rawBranchId);
  if (!Number.isInteger(branchId) || branchId <= 0) notFound();

  return <OrdersPageContent routeBranchId={branchId} embedded />;
}

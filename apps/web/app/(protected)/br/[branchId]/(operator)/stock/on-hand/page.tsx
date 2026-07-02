import { notFound, redirect } from "next/navigation";

interface PageProps {
  params: Promise<{ branchId: string }>;
}

export default async function OperatorStockOnHandPage({ params }: PageProps) {
  const { branchId: rawBranchId } = await params;
  const branchId = Number(rawBranchId);
  if (!Number.isInteger(branchId) || branchId <= 0) notFound();

  redirect(`/br/${branchId}/stock`);
}

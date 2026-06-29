import { redirect } from "next/navigation";

interface PageProps {
  params: Promise<{ branchId: string }>;
}

export default async function OperatorStockCountRedirectPage({
  params,
}: PageProps) {
  const { branchId } = await params;
  redirect(`/inventory/stocktake?branchId=${branchId}`);
}

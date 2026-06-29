import { redirect } from "next/navigation";

interface PageProps {
  params: Promise<{ branchId: string }>;
}

export default async function OperatorStockTransferRedirectPage({
  params,
}: PageProps) {
  const { branchId } = await params;
  redirect(`/inventory/transfers?branchId=${branchId}`);
}

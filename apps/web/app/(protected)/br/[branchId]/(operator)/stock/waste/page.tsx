import { redirect } from "next/navigation";

interface PageProps {
  params: Promise<{ branchId: string }>;
}

export default async function OperatorStockWasteRedirectPage({
  params,
}: PageProps) {
  const { branchId } = await params;
  redirect(`/inventory/waste/new?branchId=${branchId}`);
}

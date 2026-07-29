import { notFound, redirect } from "next/navigation";

export default async function InventoryStockRequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawId } = await params;
  const requestId = Number(rawId);
  if (!Number.isInteger(requestId) || requestId <= 0) notFound();
  redirect(
    `/inventory/stock-requests?stockRequestId=${requestId}&mode=fulfill`,
  );
}

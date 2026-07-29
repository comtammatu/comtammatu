import { redirect } from "next/navigation";

export default async function TransferDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ branchId?: string | string[] }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const branchId = Array.isArray(query.branchId)
    ? query.branchId[0]
    : query.branchId;
  const next = new URLSearchParams({
    transferId: id,
    mode: "view",
  });
  if (branchId) next.set("branchId", branchId);
  redirect(`/inventory/transfers?${next}`);
}

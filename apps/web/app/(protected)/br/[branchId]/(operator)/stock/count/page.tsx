import { notFound, redirect } from "next/navigation";

export default async function OperatorStockCountAlias({
  params,
  searchParams,
}: {
  params: Promise<{ branchId: string }>;
  searchParams: Promise<{ location?: string | string[] }>;
}) {
  const [{ branchId: rawBranchId }, query] = await Promise.all([
    params,
    searchParams,
  ]);
  const branchId = Number(rawBranchId);
  if (!Number.isInteger(branchId) || branchId <= 0) notFound();

  const location = Array.isArray(query.location)
    ? query.location[0]
    : query.location;
  const suffix = location
    ? `?location=${encodeURIComponent(location)}`
    : "";
  redirect(`/br/${branchId}/shift/count${suffix}`);
}

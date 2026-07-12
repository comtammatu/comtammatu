import { notFound, redirect } from "next/navigation";
import { parseOperatorBranchId } from "../../../_lib/parse-branch-id";

export default async function OperatorStockOnHandAlias({
  params,
  searchParams,
}: {
  params: Promise<{ branchId: string }>;
  searchParams: Promise<
    Partial<Record<"category" | "location" | "q" | "status", string | string[]>>
  >;
}) {
  const [{ branchId: rawBranchId }, query] = await Promise.all([
    params,
    searchParams,
  ]);
  const branchId = parseOperatorBranchId(rawBranchId);
  if (branchId == null) notFound();

  const target = new URLSearchParams();
  for (const key of ["category", "location", "q", "status"] as const) {
    const value = Array.isArray(query[key]) ? query[key][0] : query[key];
    if (value) target.set(key, value);
  }
  const suffix = target.size > 0 ? `?${target.toString()}` : "";
  redirect(`/br/${branchId}/stock${suffix}`);
}

import { notFound, redirect } from "next/navigation";

export default async function OperatorCountAssignmentsAlias({
  params,
  searchParams,
}: {
  params: Promise<{ branchId: string }>;
  searchParams: Promise<{
    locationId?: string | string[];
    shiftId?: string | string[];
  }>;
}) {
  const [{ branchId: rawBranchId }, query] = await Promise.all([
    params,
    searchParams,
  ]);
  const branchId = Number(rawBranchId);
  if (!Number.isInteger(branchId) || branchId <= 0) notFound();

  const target = new URLSearchParams({ tab: "assignments" });
  for (const key of ["locationId", "shiftId"] as const) {
    const value = Array.isArray(query[key]) ? query[key][0] : query[key];
    if (value) target.set(key, value);
  }
  redirect(`/br/${branchId}/team?${target.toString()}`);
}

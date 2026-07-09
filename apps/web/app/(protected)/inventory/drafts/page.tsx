import { redirect } from "next/navigation";

export default async function DraftsPage({
  searchParams,
}: {
  searchParams: Promise<{ branchId?: string | string[] }>;
}) {
  const params = await searchParams;
  const qParams = new URLSearchParams({ tab: "grn" });
  if (params.branchId) {
    if (Array.isArray(params.branchId)) {
      params.branchId.forEach((id) => qParams.append("branchId", id));
    } else {
      qParams.set("branchId", params.branchId);
    }
  }
  redirect(`/inventory/operations?${qParams.toString()}`);
}

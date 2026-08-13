import { redirect } from "next/navigation";

export default async function ProductionNewPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string }>;
}) {
  const params = await searchParams;
  const qs = new URLSearchParams();
  if (params.branch) qs.set("branch", params.branch);
  const query = qs.toString();
  redirect(query ? `/inventory/production?${query}` : "/inventory/production");
}

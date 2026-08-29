import { notFound, redirect } from "next/navigation";

export default async function ConsumptionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ branch?: string | string[] }>;
}) {
  const { id } = await params;
  const issueId = Number.parseInt(id, 10);
  if (Number.isNaN(issueId) || issueId <= 0) notFound();

  const query = searchParams ? await searchParams : {};
  const qs = new URLSearchParams();
  qs.set("issueId", String(issueId));
  qs.set("mode", "view");
  const branch = Array.isArray(query.branch) ? query.branch[0] : query.branch;
  if (branch) qs.set("branch", branch);

  redirect(`/inventory/consumption?${qs.toString()}`);
}

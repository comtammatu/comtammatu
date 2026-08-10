import { redirect } from "next/navigation";

export default async function IssuesPage({
  searchParams,
}: {
  searchParams: Promise<{
    branch?: string | string[];
    endDate?: string | string[];
    startDate?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const qParams = new URLSearchParams();
  qParams.set("view", "waste");

  const branch = Array.isArray(params.branch)
    ? params.branch[0]
    : params.branch;
  if (branch) qParams.set("branch", branch);

  for (const key of ["startDate", "endDate"] as const) {
    const value = params[key];
    if (!value) continue;
    if (Array.isArray(value)) {
      for (const item of value) qParams.append(key, item);
    } else {
      qParams.set(key, value);
    }
  }
  redirect(`/inventory/consumption?${qParams.toString()}`);
}

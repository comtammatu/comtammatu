import { redirect } from "next/navigation";

function appendSearchParams(
  target: string,
  searchParams: Record<string, string | string[] | undefined>,
): string {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(searchParams)) {
    if (Array.isArray(value)) {
      for (const item of value) params.append(key, item);
    } else if (value !== undefined) {
      params.set(key, value);
    }
  }

  const query = params.toString();
  return query ? `${target}?${query}` : target;
}

export default async function RetiredAdminFinanceRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ slug?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ slug }, resolvedSearchParams] = await Promise.all([
    params,
    searchParams,
  ]);
  const suffix = slug?.length ? `/${slug.join("/")}` : "";

  redirect(appendSearchParams(`/finance${suffix}`, resolvedSearchParams));
}

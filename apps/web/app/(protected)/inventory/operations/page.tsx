import { redirect } from "next/navigation";

interface OperationsPageProps {
  searchParams: Promise<{
    tab?: string | string[];
    branchId?: string | string[];
    startDate?: string | string[];
    endDate?: string | string[];
  }>;
}

function appendParam(
  params: URLSearchParams,
  key: string,
  value: string | string[] | undefined,
) {
  if (Array.isArray(value)) {
    value.forEach((item) => params.append(key, item));
  } else if (value) {
    params.set(key, value);
  }
}

export default async function OperationsPage({
  searchParams,
}: OperationsPageProps) {
  const input = await searchParams;
  const tab = Array.isArray(input.tab) ? input.tab[0] : input.tab;
  const pathname =
    tab === "transfers"
      ? "/inventory/transfers"
      : tab === "consumption" || tab === "issues"
        ? "/inventory/consumption"
        : "/inventory/grn";
  const params = new URLSearchParams();

  appendParam(params, "branchId", input.branchId);
  appendParam(params, "startDate", input.startDate);
  appendParam(params, "endDate", input.endDate);

  const query = params.toString();
  redirect(query ? `${pathname}?${query}` : pathname);
}

import { redirect } from "next/navigation";

interface InventorySupplierInvoicesRedirectProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
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

/** REDIRECT-SHIM — Finance owns supplier invoices (ADR 0018). */
export default async function InventorySupplierInvoicesRedirectPage({
  searchParams,
}: InventorySupplierInvoicesRedirectProps) {
  const input = await searchParams;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    appendParam(params, key, value);
  }
  const query = params.toString();
  redirect(
    query
      ? `/finance/supplier-invoices?${query}`
      : "/finance/supplier-invoices",
  );
}

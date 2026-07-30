import { redirect } from "next/navigation";

export default async function PurchaseRequestsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const incoming = await searchParams;
  const params = new URLSearchParams();
  for (const [key, rawValue] of Object.entries(incoming)) {
    const value = Array.isArray(rawValue) ? rawValue[0] : rawValue;
    if (value == null) continue;
    params.set(
      key === "requestId" ? "demandId" : key,
      key === "mode" && value === "create-po" ? "allocate" : value,
    );
  }
  params.set("tab", "needs");
  redirect(`/inventory/purchase-orders?${params}`);
}

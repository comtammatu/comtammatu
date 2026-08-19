import { redirect } from "next/navigation";
import { PURCHASE_ORDER_CREATE_HREF } from "@lib/inventory/purchase-order-paths";

const CREATE_MODES = new Set(["create", "create-po"]);

export default async function PurchaseRequestsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const incoming = await searchParams;
  const modeRaw = incoming.mode;
  const mode = Array.isArray(modeRaw) ? modeRaw[0] : modeRaw;
  if (mode != null && CREATE_MODES.has(mode)) {
    redirect(PURCHASE_ORDER_CREATE_HREF);
  }

  const params = new URLSearchParams();
  for (const [key, rawValue] of Object.entries(incoming)) {
    const value = Array.isArray(rawValue) ? rawValue[0] : rawValue;
    if (value == null) continue;
    params.set(key === "requestId" ? "demandId" : key, value);
  }
  params.set("tab", "needs");
  redirect(`/inventory/purchase-orders?${params}`);
}

import { redirect } from "next/navigation";
import { PURCHASE_ORDER_CREATE_HREF } from "@lib/inventory/purchase-order-paths";

export default function PurchaseRequestNewPage() {
  redirect(PURCHASE_ORDER_CREATE_HREF);
}

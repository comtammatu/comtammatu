import { redirect } from "next/navigation";

export default function PurchaseOrderDetailRedirectPage() {
  redirect("/inventory/grn");
}

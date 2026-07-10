import { redirect } from "next/navigation";

export default function NewPurchaseOrderRedirectPage() {
  redirect("/inventory/grn/new");
}

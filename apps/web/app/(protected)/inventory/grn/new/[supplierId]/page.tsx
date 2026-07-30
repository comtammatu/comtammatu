import { redirect } from "next/navigation";

export default async function GrnCreateSupplierRedirectPage() {
  redirect("/inventory/grn");
}

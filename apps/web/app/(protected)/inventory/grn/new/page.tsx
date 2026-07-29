import { redirect } from "next/navigation";

export default function GrnNewPage() {
  redirect("/inventory/purchase-orders");
}

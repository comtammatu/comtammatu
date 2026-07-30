import { redirect } from "next/navigation";

export default function InventoryStockRequestsInboxPage() {
  redirect("/inventory/transfers?work=request");
}

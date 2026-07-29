import { redirect } from "next/navigation";

export default function InventoryStockRequestsInboxPage() {
  redirect("/inventory/transfers?queue=requests");
}

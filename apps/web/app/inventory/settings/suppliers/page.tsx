import { redirect } from "next/navigation";

export default async function SuppliersSettingsPage() {
  redirect("/inventory/suppliers");
}

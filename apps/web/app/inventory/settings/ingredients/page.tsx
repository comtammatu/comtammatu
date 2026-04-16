import { redirect } from "next/navigation";

export default async function IngredientsSettingsPage() {
  redirect("/inventory/ingredients");
}

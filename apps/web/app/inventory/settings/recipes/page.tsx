import { redirect } from "next/navigation";

export default async function RecipesSettingsPage() {
  redirect("/inventory/recipes");
}

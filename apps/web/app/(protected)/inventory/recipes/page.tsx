import { redirect } from "next/navigation";

export default function LegacyRecipesPage() {
  redirect("/inventory/menu-recipes");
}

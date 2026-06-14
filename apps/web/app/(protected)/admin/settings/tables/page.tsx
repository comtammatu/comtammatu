import { redirect } from "next/navigation";

export default function TablesSettingsRedirect() {
  redirect("/admin/settings/branches");
}

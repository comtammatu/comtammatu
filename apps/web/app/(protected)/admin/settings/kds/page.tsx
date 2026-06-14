import { redirect } from "next/navigation";

export default function KdsSettingsRedirect() {
  redirect("/admin/settings/branches");
}

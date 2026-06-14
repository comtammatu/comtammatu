import { redirect } from "next/navigation";

export default function PosSettingsRedirect() {
  redirect("/admin/settings/branches");
}

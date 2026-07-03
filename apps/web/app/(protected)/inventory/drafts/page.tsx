import { redirect } from "next/navigation";

export default function DraftsPage() {
  redirect("/inventory/grn?tab=drafts");
}

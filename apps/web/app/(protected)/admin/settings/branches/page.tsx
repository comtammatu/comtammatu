import { redirect } from "next/navigation";
import { loadAuthState } from "@/_lib/auth";
import { BranchTable } from "./branch-table";
import { AddBranchButton } from "./add-branch-button";
import { SettingsPageFrame } from "../settings-page-frame";
import { messages } from "@lib/messages";

export default async function BranchesPage() {
  const { supabase, claims } = await loadAuthState();

  if (!["owner"].includes(claims.user_role)) {
    redirect("/access-denied?reason=insufficient-permission");
  }

  const { data: branches } = await supabase
    .from("branches")
    .select("id, name, address, phone, is_active, branch_kind")
    .order("name");

  return (
    <SettingsPageFrame
      title={messages.settings.pages.branchesTitle}
      description={messages.settings.pages.branchCount(branches?.length ?? 0)}
      actions={<AddBranchButton />}
    >
      <BranchTable branches={branches ?? []} />
    </SettingsPageFrame>
  );
}

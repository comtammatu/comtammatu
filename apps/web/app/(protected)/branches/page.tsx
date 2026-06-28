import { loadAuthState } from "@/_lib/auth";
import { AppPage, AppPageHeader } from "@/components/surface";
import { BranchTable } from "./branch-table";
import { AddBranchButton } from "./add-branch-button";
import { messages } from "@lib/messages";

export default async function BranchesPage() {
  const { supabase } = await loadAuthState();

  const { data: branches } = await supabase
    .from("branches")
    .select("id, name, code, address, phone, is_active, branch_kind")
    .order("name");

  return (
    <AppPage width="wide">
      <AppPageHeader
        title={messages.settings.pages.branchesTitle}
        description={messages.settings.pages.branchCount(branches?.length ?? 0)}
        actions={<AddBranchButton />}
      />
      <BranchTable branches={branches ?? []} />
    </AppPage>
  );
}

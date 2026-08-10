import { loadAuthState } from "@/_lib/auth";
import { AppEmptyState, AppPage, AppPageHeader } from "@/components/surface";
import { BranchTable } from "./branch-table";
import { AddBranchButton } from "./add-branch-button";
import { messages } from "@lib/messages";

export default async function BranchesPage() {
  const { supabase } = await loadAuthState();

  const { data: branches, error } = await supabase
    .from("branches")
    .select("id, name, code, address, phone, google_review_url, is_active, branch_kind")
    .order("name");

  if (error) {
    return (
      <AppPage width="xwide" density="compact">
        <AppPageHeader title={messages.settings.pages.branchesTitle} />
        <AppEmptyState
          mode="error"
          description={messages.settings.pages.branchesLoadFailed}
        />
      </AppPage>
    );
  }

  return (
    <AppPage width="xwide" density="compact">
      <AppPageHeader
        title={messages.settings.pages.branchesTitle}
        description={messages.settings.pages.branchCount(branches?.length ?? 0)}
        actions={<AddBranchButton />}
      />
      <BranchTable branches={branches ?? []} />
    </AppPage>
  );
}

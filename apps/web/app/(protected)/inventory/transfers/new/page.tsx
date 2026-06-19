import Link from "next/link";
import { ChevronLeft as IconChevronLeft } from "lucide-react";
import { loadAuthState } from "@/_lib/auth";
import { Button } from "@comtammatu/ui/components/button";
import { AppPageHeader, DocumentFormShell } from "@/components/surface";
import { messages } from "@lib/messages";
import { fetchIngredients } from "../../ingredient-actions";
import {
  fetchBranchesForTransfer,
} from "../../transfer-actions";
import {
  resolveInventoryBranchScope,
  resolveRequestedBranchId,
} from "../../_lib/inventory-scope";
import type { IngredientRow } from "../../page";
import {
  CreateTransferForm,
  type BranchForTransfer,
} from "../create-transfer-dialog";

function withBranchQuery(path: string, branchId: number | null) {
  return branchId == null ? path : `${path}?branchId=${branchId}`;
}

export default async function NewTransferPage({
  searchParams,
}: {
  searchParams: Promise<{
    branchId?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const { supabase, claims } = await loadAuthState();
  const requested = await resolveRequestedBranchId(params.branchId);
  const scope = await resolveInventoryBranchScope(supabase, claims, requested);
  const userBranchId = scope.selectedBranchId;

  const [brRes, ingRes] = await Promise.all([
    fetchBranchesForTransfer(),
    fetchIngredients(),
  ]);

  const branches: BranchForTransfer[] = brRes.success
    ? ((brRes.data ?? []) as BranchForTransfer[])
    : [];
  const ingredients: IngredientRow[] = ingRes.success
    ? ((ingRes.data ?? []) as IngredientRow[])
    : [];
  const title = messages.inventory.transfer.createTransferTitle;

  return (
    <DocumentFormShell
      width="default"
      header={
        <AppPageHeader
          eyebrow={messages.inventory.shell.moduleName}
          title={title}
          description={messages.inventory.transfer.transferDescription}
          actions={
            <Button variant="outline" size="sm" asChild>
              <Link href={withBranchQuery("/inventory/transfers", userBranchId)}>
                <IconChevronLeft data-icon="inline-start" />
                {messages.inventory.grn.back}
              </Link>
            </Button>
          }
        />
      }
    >
      <CreateTransferForm
        branches={branches}
        ingredients={ingredients}
        userBranchId={userBranchId}
        userRole={claims.user_role}
      />
    </DocumentFormShell>
  );
}

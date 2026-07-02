import Link from "next/link";
import { ChevronLeft as IconChevronLeft } from "lucide-react";
import { notFound } from "next/navigation";
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

interface NewTransferPageContentProps {
  searchParams?: Promise<{
    branchId?: string | string[];
  }>;
  routeBranchId?: number;
  basePath?: string;
  embedded?: boolean;
}

export async function NewTransferPageContent({
  searchParams,
  routeBranchId,
  basePath = "/inventory/transfers",
  embedded = false,
}: NewTransferPageContentProps) {
  const params = searchParams ? await searchParams : {};
  const { supabase, claims } = await loadAuthState();
  const requested =
    routeBranchId ?? (await resolveRequestedBranchId(params.branchId));
  const scope = await resolveInventoryBranchScope(supabase, claims, requested);
  const userBranchId = scope.selectedBranchId;
  if (routeBranchId != null && userBranchId !== routeBranchId) {
    notFound();
  }

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
  const backHref =
    routeBranchId != null ? basePath : withBranchQuery(basePath, userBranchId);
  const backAction = (
    <Button variant="outline" size="sm" asChild>
      <Link href={backHref}>
        <IconChevronLeft data-icon="inline-start" />
        {messages.inventory.grn.back}
      </Link>
    </Button>
  );

  if (embedded) {
    return (
      <div className="flex w-full flex-col gap-3">
        <AppPageHeader
          title={title}
          description={messages.inventory.transfer.transferDescription}
          actions={backAction}
        />
        <CreateTransferForm
          branches={branches}
          ingredients={ingredients}
          userBranchId={userBranchId}
          userRole={claims.user_role}
          basePath={basePath}
        />
      </div>
    );
  }

  return (
    <DocumentFormShell
      width="default"
      header={
        <AppPageHeader
          eyebrow={messages.inventory.shell.moduleName}
          title={title}
          description={messages.inventory.transfer.transferDescription}
          actions={backAction}
        />
      }
    >
      <CreateTransferForm
        branches={branches}
        ingredients={ingredients}
        userBranchId={userBranchId}
        userRole={claims.user_role}
        basePath={basePath}
      />
    </DocumentFormShell>
  );
}

export default async function NewTransferPage({
  searchParams,
}: {
  searchParams: Promise<{
    branchId?: string | string[];
  }>;
}) {
  return <NewTransferPageContent searchParams={searchParams} />;
}

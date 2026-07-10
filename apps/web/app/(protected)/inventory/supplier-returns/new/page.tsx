import { notFound, redirect } from "next/navigation";
import { PERMISSION_KEYS, SUPPLIER_RETURN_ROLES } from "@comtammatu/shared/auth";
import { getAuthContextWithPermission } from "@/(protected)/inventory/_lib/auth";
import { resolveInventoryListScope } from "@/(protected)/inventory/_lib/inventory-scope";
import { fetchReturnableGrns } from "@/(protected)/inventory/supplier-return-actions";
import {
  AppPageHeader,
  DocumentFormFrame,
  AppEmptyState,
} from "@/components/surface";
import { messages } from "@lib/messages";
import { SupplierReturnCreateClient } from "./supplier-return-create-client";

const CREATE = messages.inventory.supplierReturns.create;

interface SupplierReturnNewPageContentProps {
  searchParams?: Promise<{ branchId?: string | string[] }>;
  routeBranchId?: number;
  basePath?: string;
  embedded?: boolean;
}

export async function SupplierReturnNewPageContent({
  searchParams,
  routeBranchId,
  basePath = "/inventory/supplier-returns",
  embedded = false,
}: SupplierReturnNewPageContentProps = {}) {
  const params = searchParams ? await searchParams : {};

  const ctx = await getAuthContextWithPermission(
    SUPPLIER_RETURN_ROLES,
    PERMISSION_KEYS.SUPPLIER_RETURN_CREATE,
    routeBranchId,
  );
  if (!ctx) redirect("/access-denied?reason=insufficient-permission");
  const { supabase, claims } = ctx;

  const scope = await resolveInventoryListScope(supabase, claims, {
    routeBranchId,
    queryBranchId: params.branchId,
  });
  if (scope.outOfScope) notFound();

  const branchId = scope.selectedBranchId ?? routeBranchId ?? null;

  const header = (
    <AppPageHeader
      eyebrow={CREATE.eyebrow}
      title={CREATE.title}
      description={CREATE.description}
    />
  );

  if (branchId == null) {
    const missing = (
      <AppEmptyState
        mode="no-data"
        title={CREATE.branchRequired}
        description={CREATE.description}
        symbol="riceGrain"
      />
    );
    if (embedded) {
      return <div className="flex w-full flex-col gap-3">{missing}</div>;
    }
    return <DocumentFormFrame header={header}>{missing}</DocumentFormFrame>;
  }

  const grnsRes = await fetchReturnableGrns(branchId);
  const returnableGrns = grnsRes.success ? (grnsRes.data ?? []) : [];

  const client = (
    <SupplierReturnCreateClient
      returnableGrns={returnableGrns}
      detailBasePath={basePath}
      successBasePath={basePath}
    />
  );

  if (embedded) {
    return <div className="flex w-full flex-col gap-3">{client}</div>;
  }

  return <DocumentFormFrame header={header}>{client}</DocumentFormFrame>;
}

export default async function NewSupplierReturnPage({
  searchParams,
}: {
  searchParams?: Promise<{ branchId?: string | string[] }>;
}) {
  return <SupplierReturnNewPageContent searchParams={searchParams} />;
}

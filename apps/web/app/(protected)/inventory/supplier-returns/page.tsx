import { notFound } from "next/navigation";
import { loadAuthState } from "@/_lib/auth";
import { fetchSupplierReturns } from "@/(protected)/inventory/supplier-return-actions";
import { resolveInventoryListScope } from "@/(protected)/inventory/_lib/inventory-scope";
import { SupplierReturnsClient } from "./supplier-returns-client";

interface SupplierReturnsPageContentProps {
  searchParams?: Promise<{ branchId?: string | string[] }>;
  routeBranchId?: number;
  basePath?: string;
  embedded?: boolean;
}

export async function SupplierReturnsPageContent({
  searchParams,
  routeBranchId,
  basePath = "/inventory/supplier-returns",
  embedded = false,
}: SupplierReturnsPageContentProps) {
  const params = searchParams ? await searchParams : {};
  const { supabase, claims } = await loadAuthState();

  const scope = await resolveInventoryListScope(supabase, claims, {
    routeBranchId,
    queryBranchId: params.branchId,
  });
  if (scope.outOfScope) notFound();

  const result = await fetchSupplierReturns(scope.selectedBranchId ?? undefined);
  const returns = result.success
    ? ((result.data ?? []) as SupplierReturnRow[])
    : [];

  return (
    <SupplierReturnsClient
      initialReturns={returns}
      basePath={basePath}
      embedded={embedded}
    />
  );
}

export default async function SupplierReturnsPage({
  searchParams,
}: {
  searchParams?: Promise<{ branchId?: string | string[] }>;
}) {
  return <SupplierReturnsPageContent searchParams={searchParams} />;
}

export interface SupplierReturnRow {
  id: number;
  return_number: string;
  status: string;
  source: string;
  reason: string;
  resolution: string;
  total_value: number | null;
  created_at: string;
  confirmed_at: string | null;
  branch_id: number;
  supplier_id: number;
  grn_id: number | null;
  suppliers: { id: number; name: string } | null;
  branches: { id: number; name: string } | null;
  goods_received_notes: { id: number; grn_number: string } | null;
}

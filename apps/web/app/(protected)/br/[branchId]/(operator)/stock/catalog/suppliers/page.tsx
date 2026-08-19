import { notFound } from "next/navigation";
import { fetchSuppliers } from "@/(protected)/inventory/procurement-actions";
import type { SupplierRow } from "@/(protected)/inventory/suppliers/supplier-dialog";
import { messages } from "@lib/messages";
import { parseOperatorBranchId } from "../../../../_lib/parse-branch-id";
import { CatalogPageShell } from "../catalog-page-shell";
import { CatalogSuppliersClient } from "./catalog-suppliers-client";

const copy = messages.catalog.suppliers;

export default function OperatorCatalogSuppliersPage({
  params,
}: {
  params: Promise<{ branchId: string }>;
}) {
  return (
    <CatalogPageShell title={copy.title}>
      <CatalogSuppliersBody params={params} />
    </CatalogPageShell>
  );
}

async function CatalogSuppliersBody({
  params,
}: {
  params: Promise<{ branchId: string }>;
}) {
  const { branchId: rawBranchId } = await params;
  const branchId = parseOperatorBranchId(rawBranchId);
  if (branchId == null) notFound();

  const res = await fetchSuppliers();
  const rows: SupplierRow[] = res.success ? (res.data as SupplierRow[]) : [];

  return (
    <CatalogSuppliersClient
      backHref={`/br/${branchId}/stock/catalog`}
      initial={rows}
    />
  );
}

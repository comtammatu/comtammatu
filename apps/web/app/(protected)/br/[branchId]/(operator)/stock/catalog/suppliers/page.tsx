import { notFound } from "next/navigation";
import { fetchSuppliers } from "@/(protected)/inventory/procurement-actions";
import type { SupplierRow } from "@/(protected)/inventory/suppliers/supplier-dialog";
import { BranchOperatorPage } from "@lib/branch-operator/components/branch-operator-page";
import { messages } from "@lib/messages";
import { parseOperatorBranchId } from "../../../../_lib/parse-branch-id";
import { CatalogSuppliersClient } from "./catalog-suppliers-client";

const copy = messages.catalog.suppliers;

export default async function OperatorCatalogSuppliersPage({
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
    <BranchOperatorPage title={copy.title} hideHeaderOnMobile>
      <CatalogSuppliersClient
        backHref={`/br/${branchId}/stock/catalog`}
        initial={rows}
      />
    </BranchOperatorPage>
  );
}

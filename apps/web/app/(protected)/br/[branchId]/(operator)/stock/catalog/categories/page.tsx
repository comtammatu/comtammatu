import { notFound } from "next/navigation";
import {
  fetchCategories,
  type CategoryRow,
} from "@/(protected)/inventory/settings/categories/categories-actions";
import { BranchOperatorPage } from "@lib/branch-operator/components/branch-operator-page";
import { messages } from "@lib/messages";
import { parseOperatorBranchId } from "../../../../_lib/parse-branch-id";
import { CatalogCategoriesClient } from "./catalog-categories-client";

const copy = messages.catalog.categories;

export default async function OperatorCatalogCategoriesPage({
  params,
}: {
  params: Promise<{ branchId: string }>;
}) {
  const { branchId: rawBranchId } = await params;
  const branchId = parseOperatorBranchId(rawBranchId);
  if (branchId == null) notFound();

  const res = await fetchCategories();
  const rows: CategoryRow[] = res.success ? (res.data ?? []) : [];

  return (
    <BranchOperatorPage title={copy.title} hideHeaderOnMobile>
      <CatalogCategoriesClient
        backHref={`/br/${branchId}/stock/catalog`}
        rows={rows}
      />
    </BranchOperatorPage>
  );
}

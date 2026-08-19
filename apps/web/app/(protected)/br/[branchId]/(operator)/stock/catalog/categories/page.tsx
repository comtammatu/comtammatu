import { notFound } from "next/navigation";
import {
  fetchCategories,
  type CategoryRow,
} from "@/(protected)/inventory/settings/categories/categories-actions";
import { messages } from "@lib/messages";
import { parseOperatorBranchId } from "../../../../_lib/parse-branch-id";
import { CatalogPageShell } from "../catalog-page-shell";
import { CatalogCategoriesClient } from "./catalog-categories-client";

const copy = messages.catalog.categories;

export default function OperatorCatalogCategoriesPage({
  params,
}: {
  params: Promise<{ branchId: string }>;
}) {
  return (
    <CatalogPageShell title={copy.title}>
      <CatalogCategoriesBody params={params} />
    </CatalogPageShell>
  );
}

async function CatalogCategoriesBody({
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
    <CatalogCategoriesClient
      backHref={`/br/${branchId}/stock/catalog`}
      rows={rows}
    />
  );
}
